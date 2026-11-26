// Ruta de una zona entera (tarea 16b, plan de la fase 4: «Ampliación pedida por el autor: rutas de zona»; arreglos del
// Ruling F4-29).
//
// La IA solo entiende la intención y devuelve `"rutaZona": {"zona": <nombre o uiMapID>}`; la app construye la ruta de
// forma determinista desde la base, como una Guía lateral del contrato de la fase 3 con lo del Ruling F4-21
// (tipo = "ia", clave «IA\Ruta de <zona> (<facción>)», resumen y los topes que valida el addon). La IA no ordena puntos
// ni escribe coordenadas: todo punto sale de la base (base/puntos.mjs) y nunca se inventa ni una misión ni un punto.
//
// Qué misiones entran (misionesDeZona) y con qué campos de la base:
//   - de la zona: algún PNJ u objeto de `startedBy` tiene spawns en ese uiMap, o `zoneOrSort` (> 0) pasa a ese uiMap con
//     `zonas.area` (base.uiDeArea);
//   - para el personaje (base.mision(q, pj), con las correcciones porFaccion): `requiredRaces` admite alguna raza de su
//     facción y su raza, `requiredClasses` su clase, algún PNJ que la da no es solo de la otra facción
//     (`friendlyToFaction`, como AvailableQuests de Questie), las previas se pueden hacer con esas mismas reglas y, si
//     pide profesión (`requiredSkill`) y se conocen las del personaje, la tiene a ese rango;
//   - nivel: `requiredLevel ≤ nivel + 2` y `questLevel ≤ nivel + 5` (un questLevel ≤ 0 escala con el jugador y vale);
//   - fuera, siempre: las basura (mismo criterio que el conversor: sin nombre, «REUSE ME», «TEST», «NYI»), las de PvP
//     (QuestSort -25 «Battlegrounds» o un `zoneOrSort` de la lista de campos de batalla AREAS_PVP), las de fiesta o
//     evento de temporada (el campo `evento` de los datos o, sin él, el QuestSort de Questie, Database/Constants.lua:
//     eventoDeMision) y las que empiezan con un ítem sin ninguna
//     fuente con puntos (se cuentan en `objetoSinSitio`);
//   - fuera, salvo `opciones.mazmorras`: las de mazmorra o banda (en el índice `porMazmorra` de la fase 3 o con un
//     `zoneOrSort` de `SNF_MISIONES.mazmorra`, salvo AREAS_NORMALES como el Tranvía Subterráneo);
//   - excluyentes en un solo sentido (como Questie): si A lleva `exclusiveTo` con B y B entra, A sale (A es la migaja);
//     si se excluyen las dos, se queda la de más prioridad;
//   - manda el juego: una misión de la zona que está en el registro del jugador entra aunque la máscara de raza, de
//     clase o de facción, sus previas o su nivel digan otra cosa (las exclusiones de tipo siguen valiendo);
//   - 12-nov (en el juego: «creame la ruta de esta zona» con misiones sin completar, y la ruta metía la que tenía
//     trabada): con `opciones.soloRegistro` solo entran las del registro; las de `opciones.sin` (ids) no entran, ni
//     las que no están en el registro y dependen de ellas (todas sus previas de preQuestGroup, o todas las de
//     preQuestSingle, quitadas);
//   - 12-nov (en el juego: «si busca en internet y me dice estas misiones son las de tu nivel, zona X, la cadena Y, que me
//     cree la ruta»): con `opciones.solo` (un Set de ids, de resolverMisiones) solo entran esas y sus previas de la zona;
//   - como mucho 60, sin romper cadenas: primero las del registro; después las de `questLevel` en
//     [nivel − 3, nivel + 5] y luego las demás, las más cercanas al nivel primero (en un empate, las previas antes);
//     cada misión entra con sus previas de la zona o no entra. Las demás cuentan en `recortadas`.
//
// Orden (ordenarRuta): una simulación voraz desde la posición del jugador; el siguiente paso es siempre la acción
// disponible más cercana (recoger, hacer un objetivo o entregar), y lo que está a menos del 8 % se junta en el mismo
// paso. Las que piden un nivel mayor van al final, con la etiqueta «A partir del nivel N».
import { elemento, entradas } from './base/leer-lua.mjs';
import { pasosDeMision, ensamblarGuia, lista, claveGoto } from './base/pasos.mjs';
import { fuenteDeItem } from './base/puntos.mjs';
import { aLuaSeguro } from './buzon.mjs';
import { textoRutaZona, TEXTOS_RUTA_ZONA } from './textos.mjs';

export const MAX_MISIONES = 60; // misiones de una ruta (tope del addon)
export const MAX_PASOS = 400; // pasos de una ruta (tope del addon)
export const MAX_ELEMENTOS_PASO = 30; // elementos de un paso (tope del addon)
export const MAX_BYTES_GUIA = 40 * 1024; // la guía serializada (como viaja en el buzón)
export const JUNTAR = 8; // % del mapa: lo que está más cerca que esto del punto actual va en el mismo paso
const LEJOS = 1000; // coste de cambiar de mapa (más que cualquier distancia dentro de un mapa)
const SIN_PUNTO = 10000; // coste de una acción sin punto en la base: va cuando no queda otra
const MIN_LETRAS = 3; // «empieza por» y «contiene palabra» piden al menos 3 letras
const MAS_REQUERIDO = 2; // requiredLevel ≤ nivel + 2
const MAS_MISION = 5; // questLevel ≤ nivel + 5
const VENTANA = { abajo: 3, arriba: 5 }; // el tope elige primero questLevel en [nivel − 3, nivel + 5]

// Bits de las máscaras (los mismos que addons/SnetForever/nucleo/filtros.lua). Skyborne trae un bit por facción y las
// máscaras pasan de 32 bits: se miran con aritmética, nunca con operadores de bits.
const BIT_RAZA = { Human: 1, Orc: 2, Dwarf: 4, NightElf: 8, Scourge: 16, Tauren: 32, Gnome: 64, Troll: 128, Goblin: 256 };
const BIT_SKYBORNE = { Alliance: 2 ** 32, Horde: 2 ** 33 };
const RAZAS_DE = { Horde: ['Orc', 'Scourge', 'Tauren', 'Troll', 'Goblin'], Alliance: ['Human', 'Dwarf', 'NightElf', 'Gnome'] };
const BIT_CLASE = { WARRIOR: 1, PALADIN: 2, HUNTER: 4, ROGUE: 8, PRIEST: 16, SHAMAN: 64, MAGE: 128, WARLOCK: 256, DRUID: 1024 };
const NOMBRE_FACCION = { es: { Horde: 'Horda', Alliance: 'Alianza' }, en: { Horde: 'Horde', Alliance: 'Alliance' } };

// QuestSort (zoneOrSort negativo) de Questie (Database/Constants.lua, QuestieDB.sortKeys).
const SORT_PVP = -25; // BATTLEGROUNDS
// Las de fiesta o evento de temporada, con el nombre del evento como lo escribe Questie (QuestieEvent). SEASONAL (-22)
// junta varias fiestas (Winter Veil, Hallow's End, Love is in the Air, Harvest Festival…) y la base no dice cuál.
const SORT_FIESTA = new Map([
  [-21, "Hallow's End"], // HALLOWS_END
  [-22, 'Seasonal'], // SEASONAL
  [-41, 'Day of the Dead'], // DAY_OF_THE_DEAD
  [-364, 'Darkmoon Faire'], // DARKMOON_FAIRE
  [-365, "Ahn'Qiraj War"], // AHN_QIRAJ_WAR
  [-366, 'Lunar Festival'], // LUNAR_FESTIVAL
  [-368, 'Scourge Invasion'], // INVASION
  [-369, 'Midsummer'], // MIDSUMMER
  [-370, 'Brewfest'], // BREWFEST
  [-374, 'Noblegarden'], // NOBLEGARDEN
  [-375, "Pilgrim's Bounty"], // PILGRIMS_BOUNTY
  [-376, 'Love is in the Air'], // LOVE_IS_IN_THE_AIR
  [-378, "Children's Week"], // CHILDRENS_WEEK
]);

/**
 * El evento de una misión de fiesta o de temporada (la misma regla que la deja fuera de las rutas de zona; contexto.mjs
 * la usa para marcarla en los datos de la IA): el nombre de Questie o null si no es de evento.
 * Lote eventos: primero el campo `evento` de los datos (2026.11.11.4 en adelante), con el nombre exacto que escribe el
 * conversor desde QuestieEvent; si no está, el QuestSort. Así salen con su nombre las de SEASONAL (-22) y se marcan las
 * de Children's Week, que van con SPECIAL (-284), el QuestSort de misiones normales.
 * @param {{zoneOrSort?: number, evento?: string}|null|undefined} m la misión de la base
 * @returns {string|null}
 */
export function eventoDeMision(m) {
  if (typeof m?.evento === 'string' && m.evento !== '') return m.evento;
  return SORT_FIESTA.get(m?.zoneOrSort) ?? null;
}

// Áreas de campo de batalla (AreaID de `zoneOrSort`, con el nombre que tienen en SNF_MISIONES.mazmorra).
const AREAS_PVP = new Set([
  2597, // Alterac Valley
  3277, // Warsong Gulch
  3358, // Arathi Basin
]);
// Áreas que están en la tabla de instancias pero cuyas misiones son normales.
const AREAS_NORMALES = new Set([
  2257, // Deeprun Tram
]);
// Rango de los PNJ en QuestieDB: 1 élite, 2 élite raro, 3 jefe (0 normal, 4 raro).
const RANGO_ELITE = new Set([1, 2, 3]);
// Orden de las acciones a igual distancia: entregar antes de recoger (la continuación sale al entregar) y antes de
// los objetivos.
const ORDEN_TIPO = { entregar: 0, recoger: 1, objetivo: 2 };

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const esEntero = (v) => Number.isInteger(v) && v >= 1;
const ids = (v) => lista(v).filter(esEntero);
const tieneBit = (mascara, bit) => Math.floor(mascara / bit) % 2 === 1;
const enRango = (v) => esNumero(v) && v >= 0 && v <= 100;
const idsDeRegistro = (registro) => new Set(lista(registro).map((r) => (typeof r === 'number' ? r : r?.q)).filter(esEntero));
const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const normalizar = (s) => String(s)
  .normalize('NFD').replace(/\p{M}+/gu, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();
const ARTICULO = /^(?:the|el|la|los|las) /;

// Índices que dependen solo de la base, calculados una vez por base.
const memoria = new WeakMap();
function indices(base) {
  let ind = memoria.get(base);
  if (ind) return ind;
  const mapasConPuntos = new Set();
  for (const tipo of ['npc', 'object']) {
    for (const [, e] of entradas(base.datos[tipo])) {
      for (const [mapa, puntos] of entradas(e?.spawns)) {
        if (typeof mapa === 'number' && lista(puntos).some((p) => enRango(elemento(p, 1)) && enRango(elemento(p, 2)))) mapasConPuntos.add(mapa);
      }
    }
  }
  const enIndiceMazmorras = new Set();
  for (const [, m] of entradas(base.datos.porMazmorra)) {
    for (const e of lista(m?.misiones)) if (esEntero(e?.q)) enIndiceMazmorras.add(e.q);
  }
  const nombres = []; // [{uiMap, normas}] por uiMap ascendente
  for (const [uiMap, n] of entradas(base.datos.zonas?.nombre)) {
    if (typeof uiMap !== 'number') continue;
    const normas = [n?.es, n?.en].filter((s) => typeof s === 'string' && s !== '').map(normalizar);
    nombres.push({ uiMap, normas: [...new Set([...normas, ...normas.map((s) => s.replace(ARTICULO, ''))])] });
  }
  nombres.sort((a, b) => a.uiMap - b.uiMap);
  ind = { mapasConPuntos, enIndiceMazmorras, nombres };
  memoria.set(base, ind);
  return ind;
}

// {es?, en} del nombre de un uiMap (tabla zonas.nombre); sin nombre, {en: '#<uiMap>'}.
function nombreDe(base, uiMap) {
  const n = Object.hasOwn(base.datos.zonas?.nombre ?? {}, uiMap) ? base.datos.zonas.nombre[uiMap] : null;
  const en = base.zona(uiMap, 'en');
  if (!en) return { en: `#${uiMap}` };
  return typeof n?.es === 'string' && n.es !== '' ? { es: n.es, en } : { en };
}

/**
 * uiMap de una zona: un entero (o un texto con solo cifras) vale si tiene nombre en la base o puntos; un texto se
 * compara, sin tildes ni mayúsculas, con los nombres es y en de `zonas.nombre`, en este orden: igual exacto, «empieza
 * por» y «contiene palabra» (estos dos, con al menos 3 letras); los nombres valen también sin el artículo del
 * principio («Los», «The»…). A igualdad, el uiMap menor. `idioma` no cambia nada: se miran siempre los dos nombres.
 * @returns {{uiMap: number, nombre: {es?: string, en: string}} | null}
 */
export function resolverZona(base, zona, idioma?: any) { // idioma: la interfaz del brief (ver arriba)
  const ind = indices(base);
  let uiMap = null;
  if (typeof zona === 'number' || (typeof zona === 'string' && /^\s*\d+\s*$/.test(zona))) {
    const n = Number(zona);
    if (Number.isInteger(n) && n >= 1 && (base.zona(n, 'en') || ind.mapasConPuntos.has(n))) uiMap = n;
  } else if (typeof zona === 'string') {
    const texto = normalizar(zona);
    if (texto === '') return null;
    const pruebas = [(s) => s === texto];
    if (texto.replace(/ /g, '').length >= MIN_LETRAS) {
      pruebas.push((s) => s.startsWith(texto), (s) => ` ${s} `.includes(` ${texto} `));
    }
    for (const prueba of pruebas) {
      uiMap = ind.nombres.find((z) => z.normas.some(prueba))?.uiMap ?? null;
      if (uiMap !== null) break;
    }
  }
  return uiMap === null ? null : { uiMap, nombre: nombreDe(base, uiMap) };
}

// ------------------------------------------------------------------------------------------------------------------
// Qué misiones entran
// ------------------------------------------------------------------------------------------------------------------

function esBasura(m) {
  const nombre = m?.name;
  if (typeof nombre !== 'string' || nombre.trim() === '') return true;
  return nombre.includes('REUSE ME') || /\bTEST\b/.test(nombre) || /\bNYI\b/.test(nombre);
}

// 'pvp' | 'mazmorra' | null
function tipoInstancia(base, q, m) {
  const zona = m.zoneOrSort;
  if (zona === SORT_PVP || AREAS_PVP.has(zona)) return 'pvp';
  const mazmorra = esNumero(zona) && zona > 0 && !AREAS_NORMALES.has(zona) ? base.mazmorra(zona) : undefined;
  if (mazmorra || indices(base).enIndiceMazmorras.has(q)) return 'mazmorra';
  return null;
}

/**
 * El nombre de la mazmorra o banda de una misión (el mismo criterio que deja fuera de las rutas de zona a las de
 * mazmorra: su `zoneOrSort` es de una instancia o está en el índice `porMazmorra`), o null si no es de mazmorra. 11-nov:
 * contexto.mjs se lo pasa a la IA, que no sabía que «Reptilia» (962) es de Cuevas de los Lamentos.
 * @returns {string|null}
 */
export function mazmorraDeMision(base, q, m) {
  if (!m || tipoInstancia(base, q, m) !== 'mazmorra') return null;
  const zona = m.zoneOrSort;
  const propia = esNumero(zona) && zona > 0 ? base.mazmorra(zona) : undefined;
  if (typeof propia?.nombre === 'string' && propia.nombre !== '') return propia.nombre;
  for (const [, z] of entradas(base.datos.porMazmorra)) {
    if (lista(z?.misiones).some((e) => e?.q === q)) return typeof z.nombre === 'string' && z.nombre !== '' ? z.nombre : 'mazmorra';
  }
  return 'mazmorra';
}

// Los PNJ que dan la misión y que no son solo de la otra facción, más los objetos (que no tienen facción).
function dadoresAdmitidos(base, m, pj) {
  const otra = pj.faccion === 'Horde' ? 'A' : pj.faccion === 'Alliance' ? 'H' : null;
  const pnjs = ids(elemento(m.startedBy, 1)).filter((id) => otra === null || base.npc(id, pj)?.friendlyToFaction !== otra);
  return { pnjs, objetos: ids(elemento(m.startedBy, 2)) };
}

// Algún PNJ u objeto (de los dados) tiene un punto válido en el uiMap.
function tienePuntoEn(base, pj, { pnjs, objetos }, uiMap) {
  const conPunto = (e) => lista(elemento(e?.spawns, uiMap)).some((p) => enRango(elemento(p, 1)) && enRango(elemento(p, 2)));
  return pnjs.some((id) => conPunto(base.npc(id, pj))) || objetos.some((id) => conPunto(base.objeto(id, pj)));
}

function esDeLaZona(base, m, pj, uiMap, todos) {
  const dadores = todos ? { pnjs: ids(elemento(m.startedBy, 1)), objetos: ids(elemento(m.startedBy, 2)) } : dadoresAdmitidos(base, m, pj);
  if (tienePuntoEn(base, pj, dadores, uiMap)) return true;
  return esNumero(m.zoneOrSort) && m.zoneOrSort > 0 && base.uiDeArea(m.zoneOrSort) === uiMap;
}

// La máscara de raza de la misión admite al personaje (su facción y su raza).
function razaAdmite(m, pj) {
  const mascara = m.requiredRaces;
  if (esNumero(mascara) && mascara > 0) {
    const razas = RAZAS_DE[pj.faccion];
    if (razas) {
      const deSuFaccion = razas.some((r) => tieneBit(mascara, BIT_RAZA[r])) || tieneBit(mascara, BIT_SKYBORNE[pj.faccion]);
      if (!deSuFaccion) return false;
    }
    if (pj.raza === 'Skyborne') {
      const bit = BIT_SKYBORNE[pj.faccion];
      if (bit && !tieneBit(mascara, bit)) return false;
    } else if (BIT_RAZA[pj.raza] !== undefined && !tieneBit(mascara, BIT_RAZA[pj.raza])) {
      return false;
    }
  }
  return true;
}

// La misión vale para el personaje por facción, raza, clase y quién la da (sin mirar nivel ni previas).
export function valePara(base, m, pj) {
  if (!razaAdmite(m, pj)) return false;
  const clases = m.requiredClasses;
  const bitClase = BIT_CLASE[pj.clase];
  if (esNumero(clases) && clases > 0 && bitClase !== undefined && !tieneBit(clases, bitClase)) return false;
  // Quién la da: si todos sus PNJ son solo de la otra facción (y no la da ningún objeto), no es para él.
  const todos = ids(elemento(m.startedBy, 1));
  const admitidos = dadoresAdmitidos(base, m, pj);
  if (todos.length > 0 && admitidos.pnjs.length === 0 && admitidos.objetos.length === 0) return false;
  return true;
}

// La misión y sus previas (preQuestSingle: basta una; preQuestGroup: todas) valen para el personaje. Una previa que no
// está en la base no se puede comprobar y cuenta como alcanzable.
function crearAlcanzable(base, pj) {
  const memo = new Map();
  const alcanzable = (q) => {
    if (memo.has(q)) return memo.get(q);
    memo.set(q, true); // ciclo: no bloquea
    const m = base.mision(q, pj);
    let ok = true;
    if (m) {
      const una = ids(m.preQuestSingle);
      ok = valePara(base, m, pj) && ids(m.preQuestGroup).every(alcanzable) && (una.length === 0 || una.some(alcanzable));
    }
    memo.set(q, ok);
    return ok;
  };
  return alcanzable;
}

const nivelDe = (m) => (esNumero(m.questLevel) && m.questLevel > 0 ? m.questLevel : (esNumero(m.requiredLevel) ? m.requiredLevel : 0));
const nivelRequerido = (m) => (esNumero(m.requiredLevel) ? m.requiredLevel : 0);
const empiezaConItem = (m) => ids(elemento(m.startedBy, 3)).length > 0;

function tieneProfesion(m, profesiones) {
  const pide = lista(m.requiredSkill);
  const skill = pide[0];
  if (!esEntero(skill)) return true;
  const rango = esNumero(pide[1]) ? pide[1] : 0;
  return lista(profesiones).some((p) => p?.id === skill && esNumero(p.rango) && p.rango >= rango);
}

// Índices de la base para las previas por objeto (una vez por base): objeto -> misiones que se entregan en él, objeto ->
// misiones que empiezan en él, y misión -> las que la tienen como nextQuestInChain. Con los datos tal cual; quien los usa vuelve a mirar el registro corregido.
const memoriaEnlaces = new WeakMap();
function enlacesDe(base) {
  let e = memoriaEnlaces.get(base);
  if (e) return e;
  e = { terminanEn: new Map(), empiezanEn: new Map(), anteriores: new Map() };
  const meter = (mapa, clave, q) => (mapa.get(clave) ?? mapa.set(clave, []).get(clave)).push(q);
  for (const [q, m] of entradas(base.datos.quest)) {
    if (!esEntero(q)) continue;
    for (const o of ids(elemento(m?.finishedBy, 2))) meter(e.terminanEn, o, q);
    for (const o of ids(elemento(m?.startedBy, 2))) meter(e.empiezanEn, o, q);
    if (esEntero(m?.nextQuestInChain)) meter(e.anteriores, m.nextQuestInChain, q);
  }
  memoriaEnlaces.set(base, e);
  return e;
}

// Ronda 1 (M1), como esBuzon de la vista del conversor: por un «buzón» pasan (se entregan o empiezan en él) más de
// MAX_MISIONES_OBJETO misiones de la raza del personaje. Es un sitio de entrega genérico («Dead Drop», la Sparklematic
// 5200), no un eslabón de una cadena. Cuenta solo la máscara de raza (no la clase): un buzón lo es para todas las clases.
export const MAX_MISIONES_OBJETO = 3;
function esBuzon(base, pj, objeto) {
  const { terminanEn, empiezanEn } = enlacesDe(base);
  const pasan = new Set([...(terminanEn.get(objeto) ?? []), ...(empiezanEn.get(objeto) ?? [])]);
  return [...pasan].filter((q) => { const m = base.mision(q, pj); return m && !esBasura(m) && razaAdmite(m, pj); }).length > MAX_MISIONES_OBJETO;
}

// Ronda 1 (M1): alguien da la misión (un PNJ, un objeto o un ítem); sin eso no se puede conseguir y no es una previa.
const tieneDador = (m) => [1, 2, 3].some((k) => ids(elemento(m?.startedBy, k)).length > 0);

// ¿`buscada` va antes de `desde` por los enlaces de la base (preQuestSingle, preQuestGroup, nextQuestInChain)?
function vaAntesPorEnlaces(base, pj, buscada, desde) {
  const { anteriores } = enlacesDe(base);
  const vistas = new Set([desde]);
  const pendientes = [desde];
  while (pendientes.length > 0) {
    const actual = pendientes.pop();
    const m = base.mision(actual, pj);
    const porCadena = (anteriores.get(actual) ?? []).filter((p) => base.mision(p, pj)?.nextQuestInChain === actual);
    for (const p of [...ids(m?.preQuestSingle), ...ids(m?.preQuestGroup), ...porCadena]) {
      if (p === buscada) return true;
      if (!vistas.has(p)) { vistas.add(p); pendientes.push(p); }
    }
  }
  return false;
}

/**
 * Lote «Cadenas de mejoras»: previas implícitas de la misión q por objeto compartido, para el personaje (el mismo
 * criterio que `previasPorObjeto` de la vista del conversor, tools/conversor/src/questie/vista.js). A es previa de
 * q si se entrega en un objeto que da q y vale para el personaje (valePara: su máscara de raza, su clase…). Así se ven
 * unidas las cadenas que solo enlazan los objetos (la del saco de dormir), sin tocar los datos. No se deduce nada si q ya
 * tiene previas de la base (preQuestSingle, preQuestGroup o una anterior por nextQuestInChain que vale para el
 * personaje: manda la base), ni de A si cerraría un ciclo: q se entrega donde empieza A, o q va antes de A por los
 * enlaces de la base (la tumba de «The Weathered Grave», donde se entrega «A Daughter's Love»). Ronda 1 (M1): tampoco a
 * través de un objeto «buzón» (esBuzon) ni de una A que nadie da (tieneDador).
 * @returns {number[]} ordenadas; basta una (como preQuestSingle)
 */
export function previasPorObjeto(base, pj, q) {
  const m = base.mision(q, pj);
  if (!m || ids(m.preQuestSingle).length > 0 || ids(m.preQuestGroup).length > 0) return [];
  const { terminanEn, anteriores } = enlacesDe(base);
  const valida = (a) => {
    const ma = a !== q ? base.mision(a, pj) : undefined;
    return ma && valePara(base, ma, pj) ? ma : null;
  };
  if ((anteriores.get(q) ?? []).some((a) => valida(a)?.nextQuestInChain === q)) return [];
  const seEntregaEn = new Set(ids(elemento(m.finishedBy, 2)));
  const salida = new Set<number>();
  for (const o of ids(elemento(m.startedBy, 2))) {
    if (esBuzon(base, pj, o)) continue;
    for (const a of terminanEn.get(o) ?? []) {
      if (salida.has(a)) continue;
      const ma = valida(a);
      if (!ma || !tieneDador(ma) || !ids(elemento(ma.finishedBy, 2)).includes(o)) continue;
      if (ids(elemento(ma.startedBy, 2)).some((x) => seEntregaEn.has(x))) continue;
      if (vaAntesPorEnlaces(base, pj, q, a)) continue;
      salida.add(a);
    }
  }
  return [...salida].sort((x, y) => x - y);
}

// Previas dentro de un conjunto de misiones: {todas} (preQuestGroup) y {alguna} (preQuestSingle: basta una). La
// anterior por nextQuestInChain solo cuenta, como `alguna`, si la misión no tiene ni preQuestSingle ni preQuestGroup
// (Ruling F4-32): si los tiene, mandan esos. Lote «Cadenas de mejoras»: las previas por objeto (previasPorObjeto) también
// cuentan como `alguna` (solo las hay si la misión no tiene previas de la base).
export function dependencias(base, pj, qs) {
  const S = new Set(qs);
  const sinPrevias = (q) => {
    const m = base.mision(q, pj);
    return ids(m?.preQuestSingle).length === 0 && ids(m?.preQuestGroup).length === 0;
  };
  const anteriores = new Map();
  for (const p of S) {
    const sig = base.mision(p, pj)?.nextQuestInChain;
    if (S.has(sig) && sig !== p && sinPrevias(sig)) (anteriores.get(sig) ?? anteriores.set(sig, []).get(sig)).push(p);
  }
  const deps = new Map();
  for (const q of S) {
    const m = base.mision(q, pj);
    const dentro = (p) => S.has(p) && p !== q;
    deps.set(q, {
      todas: [...new Set(ids(m?.preQuestGroup))].filter(dentro),
      alguna: [...new Set([...ids(m?.preQuestSingle), ...(anteriores.get(q) ?? []), ...previasPorObjeto(base, pj, q)])]
        .filter(dentro).sort((a, b) => a - b),
    });
  }
  return deps;
}

/**
 * Misiones de la zona para el personaje (ver la cabecera del módulo).
 * @param {object} base
 * @param {number} uiMap
 * @param {{faccion, raza, clase, nivel}} pj
 * @param {{registro?: Array<number|{q}>, mazmorras?: boolean, profesiones?: Array<{id, rango}>, maximo?: number}} [opciones]
 *   profesiones: sin la lista (no llega o se recortó) no se filtra por profesión; maximo: el tope (60).
 * @returns {Array<{q, nivel, nivelMinimo, registro?: true, mazmorra?: true}>} por prioridad, con las propiedades
 *   `recortadas` (fuera por el tope) y `objetoSinSitio` (empiezan con un ítem sin fuente con puntos).
 */
export function misionesDeZona(base, uiMap: number, pj, opciones: {
  registro?: any;
  maximo?: number;
  profesiones?: any;
  mazmorras?: boolean;
  sinNivel?: boolean;
  sin?: any;
  soloRegistro?: boolean;
  solo?: any;
} = {}) {
  const registro = idsDeRegistro(opciones.registro);
  const nivel = esNumero(pj?.nivel) ? pj.nivel : Infinity;
  const maximo = opciones.maximo ?? MAX_MISIONES;
  const conProfesiones = Array.isArray(opciones.profesiones);
  const alcanzable = crearAlcanzable(base, pj);
  const candidatas = [];
  const sinSitio = new Set(); // las que empiezan con un objeto sin sitio conocido (no entran)
  for (const [q] of entradas(base.datos.quest)) {
    if (!esEntero(q)) continue;
    const m = base.mision(q, pj);
    if (!m || esBasura(m)) continue;
    const delJuego = registro.has(q);
    if (!esDeLaZona(base, m, pj, uiMap, delJuego)) continue;
    if (eventoDeMision(m) !== null) continue;
    const tipo = tipoInstancia(base, q, m);
    if (tipo === 'pvp' || (tipo === 'mazmorra' && opciones.mazmorras !== true)) continue;
    if (!delJuego) {
      // 11-nov (en el juego): «Novedades de corredor Grito de Guerra» (6545) no se puede recoger suelta: es una
      // submisión de «Los informes Grito de Guerra» (parentQuest 6543) que el juego da al llevar los informes. Fuera las
      // submisiones y las repetibles (specialFlags bit 1), como hace Questie y el recuento del continente del addon;
      // si ya están en el registro, son suyas y entran.
      if (esEntero(m.parentQuest) || (esNumero(m.specialFlags) && m.specialFlags % 2 === 1)) continue;
      if (!alcanzable(q) || (conProfesiones && !tieneProfesion(m, opciones.profesiones))) continue;
      // `sinNivel` (las misiones que pide la IA por su nombre): entran sea cual sea su nivel.
      if (opciones.sinNivel !== true) {
        if (esNumero(m.requiredLevel) && m.requiredLevel > nivel + MAS_REQUERIDO) continue;
        if (esNumero(m.questLevel) && m.questLevel > 0 && m.questLevel > nivel + MAS_MISION) continue;
      }
      if (empiezaConItem(m) && !ids(elemento(m.startedBy, 3)).some((item) => fuenteDeItem(base, item, pj, uiMap))) {
        sinSitio.add(q);
        continue;
      }
    }
    const entrada: {
      q: typeof q;
      nivel: any;
      nivelMinimo: any;
      registro?: boolean;
      mazmorra?: boolean;
    } = { q, nivel: nivelDe(m), nivelMinimo: nivelRequerido(m) };
    if (delJuego) entrada.registro = true;
    if (tipo === 'mazmorra') entrada.mazmorra = true;
    candidatas.push(entrada);
  }

  // Prioridad: registro; questLevel en la ventana [nivel − 3, nivel + 5]; cercanía al nivel; las previas antes
  // (profundidad en la cadena); id.
  const deps = dependencias(base, pj, candidatas.map((c) => c.q));
  const profundidad = new Map();
  const hondo = (q, visitadas = new Set()) => {
    if (profundidad.has(q)) return profundidad.get(q);
    if (visitadas.has(q)) return 0;
    visitadas.add(q);
    const { todas, alguna } = deps.get(q);
    const n = [...todas, ...alguna].reduce((max, p) => Math.max(max, 1 + hondo(p, visitadas)), 0);
    profundidad.set(q, n);
    return n;
  };
  const enVentana = (c) => !Number.isFinite(nivel) || (c.nivel >= nivel - VENTANA.abajo && c.nivel <= nivel + VENTANA.arriba);
  const cercania = (c) => (Number.isFinite(nivel) ? Math.abs(c.nivel - nivel) : c.nivel);
  const clave = (c) => [c.registro ? 0 : 1, enVentana(c) ? 0 : 1, cercania(c), hondo(c.q), c.q];
  const comparar = (a, b) => {
    const ka = clave(a);
    const kb = clave(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  };
  candidatas.sort(comparar);
  const porQ = new Map(candidatas.map((c) => [c.q, c]));

  // Excluyentes en un solo sentido: A (con exclusiveTo = {B}) sale si B entra. Si se excluyen las dos, sale la de menos
  // prioridad. Una del registro no sale nunca (y la que la excluye, sí).
  const quitadas = new Set();
  for (const c of candidatas) {
    if (quitadas.has(c.q) || c.registro) continue;
    for (const b of ids(base.mision(c.q, pj).exclusiveTo)) {
      if (b === c.q || !porQ.has(b) || quitadas.has(b)) continue;
      const mutua = ids(base.mision(b, pj).exclusiveTo).includes(c.q);
      if (mutua && !porQ.get(b).registro) {
        quitadas.add(b);
      } else {
        quitadas.add(c.q);
        break;
      }
    }
  }
  const fuera = new Set(lista(opciones.sin).filter(esEntero));
  let validas = candidatas.filter((c) => !quitadas.has(c.q) && !fuera.has(c.q) && (opciones.soloRegistro !== true || c.registro));
  if (opciones.solo instanceof Set) {
    const quedan = new Set();
    const subir = (q) => {
      if (quedan.has(q) || !deps.has(q)) return;
      quedan.add(q);
      const { todas, alguna } = deps.get(q);
      for (const p of [...todas, ...alguna]) subir(p);
    };
    for (const q of opciones.solo) subir(q);
    validas = validas.filter((c) => quedan.has(c.q));
    // Revisión: con `solo`, el aviso de «objeto sin sitio» cuenta solo las pedidas y las previas de las que quedan.
    const relacionadas = new Set(opciones.solo);
    for (const q of quedan) {
      const m = base.mision(q, pj);
      for (const p of [...ids(m?.preQuestSingle), ...ids(m?.preQuestGroup)]) relacionadas.add(p);
    }
    for (const q of [...sinSitio]) if (!relacionadas.has(q)) sinSitio.delete(q);
  }
  for (let cambio = fuera.size > 0; cambio;) {
    cambio = false;
    validas = validas.filter((c) => {
      if (c.registro) return true;
      const { todas, alguna } = deps.get(c.q);
      const rota = todas.some((p) => fuera.has(p)) || (alguna.length > 0 && alguna.every((p) => fuera.has(p)));
      if (rota) {
        fuera.add(c.q);
        cambio = true;
      }
      return !rota;
    });
  }

  // Tope sin romper cadenas: cada misión entra con sus previas que están en la zona (todas las de preQuestGroup y, de
  // las de preQuestSingle, la de más prioridad si no hay ya una), o no entra.
  const validasQ = new Set(validas.map((c) => c.q));
  const elegidas = new Set();
  const cierre = (q, acc) => {
    if (elegidas.has(q) || acc.has(q) || !validasQ.has(q)) return;
    acc.add(q);
    if (porQ.get(q).registro) return; // ya la tiene: no espera a sus previas
    const { todas, alguna } = deps.get(q);
    for (const p of todas) cierre(p, acc);
    const posibles = alguna.filter((p) => validasQ.has(p));
    if (posibles.length > 0 && !posibles.some((p) => elegidas.has(p) || acc.has(p))) {
      cierre(posibles.map((p) => porQ.get(p)).sort(comparar)[0].q, acc);
    }
  };
  for (const c of validas) {
    if (elegidas.has(c.q)) continue;
    const acc = new Set();
    cierre(c.q, acc);
    // Una previa que no está entre las válidas (por ejemplo, porque era una migaja) deja la misión sin cadena: entra
    // igual, con su isQuestTurnedIn en los pasos.
    if (elegidas.size + acc.size <= maximo) for (const q of acc) elegidas.add(q);
  }
  const salida: typeof validas & { recortadas?: number; objetoSinSitio?: number } = validas.filter((c) => elegidas.has(c.q));
  salida.recortadas = validas.length - salida.length;
  salida.objetoSinSitio = sinSitio.size;
  return salida;
}

// ------------------------------------------------------------------------------------------------------------------
// Acciones de cada misión
// ------------------------------------------------------------------------------------------------------------------

const MAX_QS_CONDICION = 30; // misiones de un isQuestTurnedIn (tope del addon)
const MAX_CLAUSULAS = 20; // condiciones isQuestTurnedIn de una misión

// Una conjunción de cláusulas (cada una, «alguna de estas misiones entregada») sin repeticiones, sin las que incluyen a
// otra (si basta {a}, sobra {a, b}) y en orden.
function normalizarCondiciones(clausulas: number[][]) {
  const unicas = [...new Map(clausulas.map((c) => {
    const ordenada = [...new Set(c)].sort((a, b) => a - b);
    return [ordenada.join(','), ordenada];
  })).values()];
  const sinAbsorbidas = unicas.filter((c) => !unicas.some((o) => o !== c && o.length < c.length && o.every((q) => c.includes(q))));
  return sinAbsorbidas.filter((c) => c.length <= MAX_QS_CONDICION).sort((a, b) => a.length - b.length || a.join(',').localeCompare(b.join(',')));
}

// «A o B» con A y B como conjunciones de cláusulas: la distributiva (cada cláusula de A unida con cada una de B).
// Vacío = siempre se cumple.
function o(alternativas) {
  if (alternativas.some((a) => a.length === 0)) return [];
  return alternativas.reduce((acc, alt) => normalizarCondiciones(acc.flatMap((c1) => alt.map((c2) => [...c1, ...c2]))).slice(0, MAX_CLAUSULAS));
}

/**
 * Condiciones isQuestTurnedIn de cada misión de la ruta `S` (Ruling F4-32): las de sus previas de fuera de la ruta y,
 * de forma transitiva, las de sus previas de dentro de la ruta. Así, si el jugador no entregó una previa externa, se
 * saltan los pasos de la misión que la pide y los de todas las que cuelgan de ella. preQuestGroup: todas (las de
 * fuera, una cláusula cada una; las de dentro, sus condiciones). preQuestSingle (o la anterior por cadena, ver
 * dependencias): basta una, así que es la «o» de las condiciones de cada alternativa de dentro y de «alguna de las de
 * fuera entregada». Las del registro no llevan ninguna ni las pasan (manda el juego: ya la tiene).
 * @returns {Map<number, number[][]>} q -> cláusulas (listas de misiones)
 */
export function condicionesDeRuta(base, pj, S, registro, deps) {
  const memo = new Map();
  const de = (q) => {
    if (memo.has(q)) return memo.get(q);
    memo.set(q, []); // un ciclo no añade nada
    if (registro.has(q)) return [];
    const m = base.mision(q, pj);
    const clausulas = [];
    for (const p of ids(m.preQuestGroup)) {
      if (p === q) continue;
      if (S.has(p)) clausulas.push(...de(p));
      else clausulas.push([p]);
    }
    const alternativas = deps.get(q).alguna.map(de);
    // Las previas por objeto de fuera de la ruta piden lo mismo que las de preQuestSingle (lote «Cadenas de mejoras»).
    const fuera = [...ids(m.preQuestSingle), ...previasPorObjeto(base, pj, q)].filter((p) => !S.has(p));
    if (fuera.length > 0) alternativas.push([fuera]);
    if (alternativas.length > 0) clausulas.push(...o(alternativas));
    const salida = normalizarCondiciones(clausulas).slice(0, MAX_CLAUSULAS);
    memo.set(q, salida);
    return salida;
  };
  return new Map([...S].map((q) => [q, de(q)]));
}

// Las acciones de la misión q (sin las condiciones, que van en `condiciones`): recoger, un objetivo por cada goto de
// completar (con su `complete`; los `complete` sin goto van con el último o, si no hay ninguno, solos y sin goto) y
// entregar. Cada acción: {tipo, q, i, elementos, punto ({mapa, x, y} | null), cerca?, sinVerificar?}. `cerca` es el
// sitio de la entrega y solo sirve para ordenar un objetivo sin punto: se hace cuando no queda nada más en ese mapa,
// antes de irse de él (en el paso no hay ningún goto: no se inventa nada).
// R19: cada parte «conseguir» (un objetivo de objeto sin sitio en la base) es una acción de objetivo `aparte`: va en su
// propio paso, sin juntarse con otra (con su goto al vendedor o, sin él, con `cerca` como un objetivo sin punto).
function accionesDe(base, q, pj, uiMap, clausulas, delRegistro) {
  const m = base.mision(q, pj);
  const todas = pasosDeMision(base, q, pj, { mapa: uiMap });
  const partes = Object.fromEntries(todas.filter((p) => p.parte !== 'conseguir').map((p) => [p.parte, p]));
  const condiciones = clausulas.map((qs) => ({ t: 'isQuestTurnedIn', qs: [...qs] }));
  const propios = (parte) => parte.elementos;
  const punto = (p) => (p ? { mapa: p.mapa, x: p.x, y: p.y } : null);
  const sv = (parte) => (parte.sinVerificar ? { sinVerificar: parte.sinVerificar } : {});
  const acciones = [];
  if (!delRegistro) acciones.push({ tipo: 'recoger', q, elementos: propios(partes.recoger), punto: punto(partes.recoger.punto), ...sv(partes.recoger) });
  if (partes.completar) {
    const elementos = propios(partes.completar);
    const completes = elementos.filter((e) => e.t === 'complete');
    const usados = new Set();
    const deObjetivo = [];
    for (const g of elementos.filter((e) => e.t === 'goto')) {
      const c = g.objetivo !== undefined && !usados.has(g.objetivo) ? completes.find((x) => x.objetivo === g.objetivo) : undefined;
      if (c) usados.add(c.objetivo);
      deObjetivo.push({ tipo: 'objetivo', q, elementos: c ? [g, c] : [g], punto: punto(g) });
    }
    const sueltos = completes.filter((c) => !usados.has(c.objetivo));
    if (sueltos.length > 0 && deObjetivo.length > 0) deObjetivo[deObjetivo.length - 1].elementos.push(...sueltos);
    else if (sueltos.length > 0) {
      deObjetivo.push({ tipo: 'objetivo', q, elementos: sueltos, punto: null, cerca: punto(partes.entregar.punto ?? partes.recoger.punto),
        ...sv(partes.completar) });
    }
    acciones.push(...deObjetivo);
  }
  for (const c of todas.filter((p) => p.parte === 'conseguir')) {
    acciones.push({ tipo: 'objetivo', q, elementos: propios(c), punto: punto(c.punto), aparte: true,
      ...(c.punto ? {} : { cerca: punto(partes.entregar.punto ?? partes.recoger.punto) }) });
  }
  acciones.push({ tipo: 'entregar', q, elementos: propios(partes.entregar), punto: punto(partes.entregar.punto), ...sv(partes.entregar) });
  acciones.forEach((a, i) => { a.i = i; });
  return { acciones, condiciones, firma: JSON.stringify(condiciones), nivel: nivelDe(m), requerido: nivelRequerido(m) };
}

// Los objetivos (k) que usa un elemento de paso de objetivo.
const objetivosDe = (elementos) => elementos.filter((e) => e.objetivo !== undefined).map((e) => e.objetivo);

// ------------------------------------------------------------------------------------------------------------------
// Orden
// ------------------------------------------------------------------------------------------------------------------

/**
 * Orden de la ruta: una simulación voraz. Desde la posición del jugador (sin ella, desde la acción de la misión de
 * menor nivel en el uiMap de la ruta), el siguiente paso es la acción disponible más cercana:
 *   - recoger una misión cuyas previas de la ruta (preQuestGroup y también todas las alternativas de preQuestSingle o
 *     la anterior por nextQuestInChain: el jugador puede no tener la rama que se saltó por su isQuestTurnedIn) ya se
 *     entregaron en la simulación y cuyo `requiredLevel` ≤ nivel;
 *   - hacer un objetivo de una misión ya recogida;
 *   - entregar una misión con los objetivos hechos.
 * La distancia es la del mapa (en %); cambiar de mapa cuesta LEJOS (así se hace todo lo del otro mapa de una vez) y
 * una acción sin punto, SIN_PUNTO (un objetivo sin punto, sin goto, va cuando no queda nada más en el mapa de su
 * entrega). Lo que está a menos de JUNTAR (8 %) del punto actual va en el mismo paso si el
 * formato lo permite: pasos de PNJ (recoger y entregar) con pasos de PNJ, de objetivo con objetivo, con las mismas
 * condiciones, ≤ 30 elementos y sin dos misiones con el mismo índice de objetivo. Cuando no queda nada a su nivel, el
 * nivel sube al menor `requiredLevel` pendiente y el paso siguiente lleva «A partir del nivel N». Determinista: los
 * empates se deshacen por tipo (entregar, recoger, objetivo) y por id. Un ciclo de previas se rompe por la de menor
 * nivel.
 * @param {Array<number|{q, registro?}>} misiones las de misionesDeZona (las del registro ya están recogidas)
 * @param {{mapa, x, y} | null} posicion
 * @param {number} [uiMap] el de la ruta (por defecto, el de la posición)
 * @returns {number[]} las misiones del registro y después las demás en el orden en que se recogen, con la propiedad
 *   `plan` = [{tipo: 'pnj'|'objetivo', items: [{q, elementos}], condiciones, nivel?, sinVerificar?}] que usa guiaDeRuta.
 */
export function ordenarRuta(base, misiones, pj, posicion, uiMap: number = posicion?.mapa) {
  const entradasM = lista(misiones).map((m) => (typeof m === 'number' ? { q: m } : m)).filter((m) => esEntero(m?.q) && base.mision(m.q, pj));
  const qs = [...new Set(entradasM.map((m) => m.q))].sort((a, b) => a - b);
  const S = new Set(qs);
  const delRegistro = new Set(entradasM.filter((m) => m.registro === true).map((m) => m.q));
  const deps = dependencias(base, pj, qs);
  const condiciones = condicionesDeRuta(base, pj, S, delRegistro, deps);
  const info = new Map(qs.map((q) => [q, accionesDe(base, q, pj, uiMap, condiciones.get(q), delRegistro.has(q))]));
  const estado = new Map(qs.map((q) => [q, {
    aceptada: delRegistro.has(q),
    entregada: false,
    pendientes: new Set(info.get(q).acciones.filter((a) => a.tipo === 'objetivo').map((a) => a.i)),
  }]));
  const entregada = (p) => estado.get(p).entregada;
  const forzadas = new Set();
  const previasHechas = (q) => {
    if (forzadas.has(q)) return true;
    const { todas, alguna } = deps.get(q);
    return todas.every(entregada) && alguna.every(entregada);
  };

  let actual = posicion && esNumero(posicion.x) && esNumero(posicion.y) && posicion.mapa === uiMap ? { mapa: uiMap, x: posicion.x, y: posicion.y } : null;
  let nivelActual = esNumero(pj?.nivel) ? pj.nivel : Infinity;
  let etiqueta = null;
  const plan = [];
  const recogidas = [];
  let ultimo = null; // el punto del último paso con punto que se puede seguir juntando
  const coste = (a) => {
    // Un objetivo sin punto se deja para cuando no queda nada más en el mapa de su entrega (antes de irse de él).
    if (!a.punto && a.cerca) return a.cerca.mapa === (actual?.mapa ?? uiMap) ? LEJOS - 1 : SIN_PUNTO;
    const p = a.punto;
    if (!p) return SIN_PUNTO;
    if (!actual) return p.mapa === uiMap ? 0 : LEJOS;
    return p.mapa === actual.mapa ? distancia(p, actual) : LEJOS;
  };

  for (let vuelta = 0; vuelta < 100000; vuelta++) {
    const disponibles = [];
    for (const q of qs) {
      const e = estado.get(q);
      const { acciones, requerido } = info.get(q);
      if (!e.aceptada) {
        if (previasHechas(q) && requerido <= nivelActual) disponibles.push(acciones[0]);
      } else if (!e.entregada) {
        if (e.pendientes.size > 0) for (const i of e.pendientes) disponibles.push(acciones[i]);
        else disponibles.push(acciones[acciones.length - 1]);
      }
    }
    if (disponibles.length === 0) {
      const sinRecoger = qs.filter((q) => !estado.get(q).aceptada);
      if (sinRecoger.length === 0) break;
      const porNivel = sinRecoger.filter(previasHechas);
      if (porNivel.length > 0) {
        nivelActual = Math.min(...porNivel.map((q) => info.get(q).requerido));
        etiqueta = nivelActual;
      } else {
        forzadas.add(sinRecoger.reduce((a, b) => (info.get(b).nivel < info.get(a).nivel ? b : a)));
      }
      continue;
    }
    const clave = (a) => [coste(a), actual ? 0 : info.get(a.q).nivel, ORDEN_TIPO[a.tipo], a.q, a.i];
    let accion = disponibles[0];
    let mejor = clave(accion);
    for (const a of disponibles.slice(1)) {
      const k = clave(a);
      for (let i = 0; i < k.length; i++) {
        if (k[i] !== mejor[i]) {
          if (k[i] < mejor[i]) { accion = a; mejor = k; }
          break;
        }
      }
    }

    // Aplicar la acción.
    const e = estado.get(accion.q);
    if (accion.tipo === 'recoger') { e.aceptada = true; recogidas.push(accion.q); }
    else if (accion.tipo === 'objetivo') e.pendientes.delete(accion.i);
    else e.entregada = true;

    // Juntar con el paso anterior o abrir uno nuevo.
    const tipo = accion.tipo === 'objetivo' ? 'objetivo' : 'pnj';
    const { firma, condiciones } = info.get(accion.q);
    const anterior = plan[plan.length - 1];
    const p = accion.punto;
    const cabeEnElPaso = () => {
      const n = anterior.condiciones.length + anterior.items.reduce((s, it) => s + it.elementos.length, 0);
      if (n + accion.elementos.length > MAX_ELEMENTOS_PASO) return false;
      if (tipo !== 'objetivo') return true;
      const nuevos = new Set(objetivosDe(accion.elementos));
      return anterior.items.every((it) => it.q === accion.q || !objetivosDe(it.elementos).some((k) => nuevos.has(k)));
    };
    const juntar = anterior && etiqueta === null && p && ultimo && !accion.aparte && !anterior.aparte && anterior.tipo === tipo
      && anterior.firma === firma && p.mapa === ultimo.mapa && distancia(p, ultimo) < JUNTAR && cabeEnElPaso();
    if (juntar) {
      const mismo = anterior.items.find((it) => it.q === accion.q);
      if (mismo) mismo.elementos.push(...accion.elementos);
      else anterior.items.push({ q: accion.q, elementos: [...accion.elementos] });
    } else {
      const paso: {
        tipo: typeof tipo;
        items: any[];
        condiciones: typeof condiciones;
        firma: typeof firma;
        nivel?: any;
        sinVerificar?: any;
        aparte?: boolean;
      } = { tipo, items: [{ q: accion.q, elementos: [...accion.elementos] }], condiciones, firma };
      if (etiqueta !== null) paso.nivel = etiqueta;
      if (accion.sinVerificar) paso.sinVerificar = accion.sinVerificar;
      if (accion.aparte) paso.aparte = true;
      plan.push(paso);
      etiqueta = null;
    }
    ultimo = p;
    if (p) actual = p;
  }
  const salida: number[] & { plan?: typeof plan } = [...qs.filter((q) => delRegistro.has(q)), ...recogidas];
  salida.plan = plan.map((paso) => {
    const { firma, ...resto } = paso;
    return firma === undefined ? paso : resto;
  });
  return salida;
}

// ------------------------------------------------------------------------------------------------------------------
// La guía
// ------------------------------------------------------------------------------------------------------------------

// Élite: algún objetivo es un PNJ élite (rango 1, 2 o 3): uno a matar, un crédito de muerte con todos sus PNJ élite o un
// ítem que solo sueltan PNJ élite.
function esElite(base, m, pj) {
  const elite = (id) => RANGO_ELITE.has(base.npc(id, pj)?.rank);
  const todosElite = (lst) => lst.length > 0 && lst.every(elite);
  if (lista(elemento(m.objectives, 1)).some((e) => elite(elemento(e, 1)))) return true;
  for (const e of lista(elemento(m.objectives, 5))) {
    if (todosElite([...ids(elemento(e, 1)), ...[elemento(e, 2)].filter(esEntero)])) return true;
  }
  for (const e of lista(elemento(m.objectives, 3))) {
    const item = base.item(elemento(e, 1), pj);
    if (item && ids(item.objectDrops).length === 0 && todosElite(ids(item.npcDrops))) return true;
  }
  return false;
}

// Plan sin simulación (una lista de q sin `plan`): cada acción en su paso, misión tras misión.
function planSecuencial(base, qs, pj, uiMap, registro) {
  const S = new Set(qs);
  const clausulas = condicionesDeRuta(base, pj, S, registro, dependencias(base, pj, qs));
  const plan = [];
  for (const q of qs) {
    const { acciones, condiciones } = accionesDe(base, q, pj, uiMap, clausulas.get(q), registro.has(q));
    for (const a of acciones) {
      plan.push({ tipo: a.tipo === 'objetivo' ? 'objetivo' : 'pnj', items: [{ q, elementos: a.elementos }], condiciones,
        ...(a.sinVerificar ? { sinVerificar: a.sinVerificar } : {}) });
    }
  }
  return plan;
}

function etiquetaDeNivel(n) {
  return { level: n, texto: { es: TEXTOS_RUTA_ZONA.es.desdeNivel(n), en: TEXTOS_RUTA_ZONA.en.desdeNivel(n) } };
}

function construirGuia(base, qs, plan, pj, idioma, nombre) {
  const S = new Set(qs);
  const etiquetaFaccion = (tabla) => tabla[pj.faccion] ?? (typeof pj.faccion === 'string' && pj.faccion.trim() !== '' ? pj.faccion : null);
  const conFaccion = (texto, faccion) => (faccion ? `${texto} (${faccion})` : texto);
  const nombreZona = (idioma === 'es' && nombre.es) || nombre.en;
  const clave = `IA\\${conFaccion(`Ruta de ${nombreZona}`, etiquetaFaccion(NOMBRE_FACCION[idioma === 'en' ? 'en' : 'es']))}`;
  let elites = 0;
  let grupo = 0;
  const niveles = [];
  for (const q of qs) {
    const m = base.mision(q, pj);
    const elite = esElite(base, m, pj);
    if (elite) elites++;
    if (elite || tipoInstancia(base, q, m) === 'mazmorra') grupo++;
    niveles.push(Math.max(1, nivelDe(m)));
  }
  const pasos = [];
  let nivelPendiente = null;
  for (const paso of plan) {
    if (paso.nivel !== undefined) nivelPendiente = paso.nivel;
    const items = paso.items.filter((it) => S.has(it.q));
    if (items.length === 0) continue;
    const elementos = paso.condiciones.map((c) => ({ ...c, ...(c.qs ? { qs: [...c.qs] } : {}) }));
    const vistos = new Set();
    for (const it of items) {
      for (const e of it.elementos) {
        if (e.t === 'goto' && e.objetivo === undefined) {
          if (vistos.has(claveGoto(e))) continue;
          vistos.add(claveGoto(e));
        }
        elementos.push({ ...e });
      }
    }
    pasos.push({
      parte: paso.tipo,
      elementos: elementos.slice(0, MAX_ELEMENTOS_PASO),
      etiquetas: nivelPendiente !== null ? etiquetaDeNivel(nivelPendiente) : {},
      requisitos: [],
      ...(paso.sinVerificar ? { sinVerificar: paso.sinVerificar } : {}),
    });
    nivelPendiente = null;
  }
  const titulo = {
    es: conFaccion(`Ruta de ${nombre.es || nombre.en}`, etiquetaFaccion(NOMBRE_FACCION.es)),
    en: conFaccion(`${nombre.en} route`, etiquetaFaccion(NOMBRE_FACCION.en)),
  };
  const guia = ensamblarGuia({
    clave,
    grupo: 'IA',
    nombre: clave.slice(3),
    titulo,
    tipo: 'ia',
    ...(NOMBRE_FACCION.es[pj.faccion] ? { faccion: pj.faccion } : {}),
    niveles: { min: niveles.length > 0 ? Math.min(...niveles) : 1, max: niveles.length > 0 ? Math.max(...niveles) : 1 },
    siguientes: [],
    mazmorras: [],
    fuente: { archivo: 'ia', linea: 0 },
    sinVerificar: true,
  }, pasos);
  guia.resumen = { misiones: qs.length, pasos: guia.pasos.length, elites, grupo };
  return guia;
}

const cabe = (guia) => guia.pasos.length <= MAX_PASOS && Buffer.byteLength(aLuaSeguro(guia), 'utf8') <= MAX_BYTES_GUIA;

/**
 * La Guía lateral de la ruta (contrato de la fase 3 + Ruling F4-21): tipo "ia", sinVerificar, clave
 * «IA\Ruta de <zona en el idioma> (<facción en el idioma>)» (sin facción conocida, sin paréntesis), titulo {es, en},
 * niveles {min ≥ 1, max} de sus misiones, pasos (los del plan de ordenarRuta, con isQuestTurnedIn para las previas de
 * fuera de la ruta y, en el primero del bloque final, `etiquetas = {level = N, texto = {es, en}}`) y resumen
 * {misiones, pasos, elites, grupo} («grupo» = élites más las de mazmorra). Respeta los topes del addon (60 misiones,
 * 400 pasos, 30 elementos por paso) y pesa ≤ 40 KB serializada como en el buzón; si no cabe, quita misiones del final
 * del orden y las cuenta en `recortadas`.
 * @param {number[]} ordenadas salida de ordenarRuta (sin `plan`, cada acción va en su paso, misión tras misión)
 * @param {{registro?: Array<number|{q}>, nombre?: {es?, en}}} [opciones]
 */
export function guiaDeRuta(base, uiMap, ordenadas: number[], pj, idioma, opciones: { registro?: any; nombre?: any; } = {}) {
  const registro = idsDeRegistro(opciones.registro);
  const nombre = opciones.nombre ?? nombreDe(base, uiMap);
  const todas = [...new Set(lista(ordenadas).filter((q) => esEntero(q) && base.mision(q, pj)))];
  const plan = (ordenadas as (number[] & { plan?: any[] }) | null)?.plan ?? planSecuencial(base, todas, pj, uiMap, registro);
  let qs = todas.slice(0, MAX_MISIONES);
  let guia = construirGuia(base, qs, plan, pj, idioma, nombre);
  while (!cabe(guia) && qs.length > 1) {
    // Estimación por tamaño (proporcional) y, al final, de una en una.
    const bytes = Buffer.byteLength(aLuaSeguro(guia), 'utf8');
    const porTamano = Math.floor(qs.length * Math.min(MAX_BYTES_GUIA / bytes, MAX_PASOS / guia.pasos.length));
    qs = qs.slice(0, Math.max(1, Math.min(qs.length - 1, porTamano)));
    guia = construirGuia(base, qs, plan, pj, idioma, nombre);
  }
  const recortadas = todas.length - qs.length;
  if (recortadas > 0) guia.recortadas = recortadas;
  return guia;
}

const normalizarSeguro = (v) => (typeof v === 'string' ? normalizar(v) : '');

/**
 * Une todo: la petición de la IA (`{zona}`), el turno (`datos.personaje`, `datos.lugar`, `datos.registro` y, si llega,
 * `datos.profesiones`) y el idioma. Si `zona` es el mapa del jugador (`datos.lugar.mapa`) o el nombre de su zona en el
 * juego (`datos.lugar.zona`), se usa ese mapa.
 * @returns {{guia, texto} | {error: 'sin_zona'|'sin_misiones', texto}} `guia.recortadas` = todas las que quedaron fuera
 *   (por el tope de 60 y por el tamaño); `guia.resumen.objetoSinSitio`, las que empiezan con un objeto sin sitio.
 */
/**
 * 12-nov: las misiones que nombra la IA (sacadas de internet o de los datos): un id que existe en la base, o un nombre
 * que coincide entero (sin tildes, mayúsculas ni signos) con el nombre en español o en inglés de alguna misión de la base.
 * Un nombre que casa con varias misiones (la misma de las dos facciones, por ejemplo) las da todas: luego solo entran las
 * que valen para el personaje. Devuelve {qs: Set, sinEncontrar: [texto]}.
 */
export function resolverMisiones(base, pedidas) {
  const qs = new Set();
  const sinEncontrar = [];
  for (const p of lista(pedidas)) {
    if (esEntero(p)) {
      if (base.mision(p)) qs.add(p);
      else sinEncontrar.push(String(p));
      continue;
    }
    if (typeof p !== 'string' || normalizar(p) === '') continue;
    const buscado = normalizar(p);
    const encontradas = [...base.buscarMisiones(p, 'es', 30), ...base.buscarMisiones(p, 'en', 30)]
      .map((m) => m.q)
      .filter((q) => ['es', 'en'].some((i) => normalizar(base.nombre('quest', q, i) ?? '') === buscado));
    if (encontradas.length === 0) sinEncontrar.push(p);
    for (const q of encontradas) qs.add(q);
  }
  return { qs, sinEncontrar };
}

const TEXTO_SIN_ENCONTRAR = {
  es: (n) => `No he encontrado en la base de SnetForever: ${n}.`,
  en: (n) => `Not found in the SnetForever database: ${n}.`,
};

export function construirRutaZona(base, peticion, turno, idioma) {
  const datos = turno?.datos ?? {};
  const lugar = datos.lugar ?? {};
  const personaje = datos.personaje ?? {};
  const pj = {
    faccion: personaje.faccion,
    raza: personaje.raza,
    clase: typeof personaje.clase === 'string' ? personaje.clase.toUpperCase() : undefined,
    nivel: personaje.nivel,
  };
  const zona = peticion?.zona;
  const esSuMapa = esEntero(lugar.mapa) && (zona === lugar.mapa || String(zona).trim() === String(lugar.mapa)
    || (normalizarSeguro(zona) !== '' && normalizarSeguro(zona) === normalizarSeguro(lugar.zona)));
  const resuelta = resolverZona(base, esSuMapa ? lugar.mapa : zona, idioma);
  if (!resuelta) return { error: 'sin_zona', texto: textoRutaZona('sin_zona', {}, idioma) };
  const { uiMap, nombre } = resuelta;

  const registro = lista(datos.registro);
  const pedidas = Array.isArray(peticion?.misiones) ? resolverMisiones(base, peticion.misiones) : null;
  // 13-nov (en el juego: la ruta del speed run empezaba por «Suministros Grito de Guerra», que la guía manda saltar): lo que
  // el plan de subida manda saltar en su tramo (datos.planSubida.actual.saltar, nombres enteros) no entra, salvo que la IA
  // lo pida por su nombre en `misiones`.
  const sin = new Set(lista(peticion?.sin).filter(esEntero));
  for (const q of resolverMisiones(base, lista(datos.planSubida?.actual?.saltar)).qs) if (!pedidas?.qs.has(q)) sin.add(q);
  const avisoSinEncontrar = pedidas && pedidas.sinEncontrar.length > 0
    ? (TEXTO_SIN_ENCONTRAR[idioma === 'en' ? 'en' : 'es'])(pedidas.sinEncontrar.slice(0, 8).map((n) => `«${n}»`).join(', '))
    : '';
  const nombreZona = nombre[idioma === 'en' ? 'en' : 'es'] ?? nombre.en;
  const zonaTexto = typeof nombreZona === 'string' && !nombreZona.startsWith('#') ? nombreZona : undefined;
  // Revisión: si no encuentra ninguna de las pedidas, una sola frase.
  if (pedidas && pedidas.qs.size === 0) return { error: 'sin_misiones', texto: textoRutaZona('sin_encontrar', { zona: zonaTexto }, idioma) };
  const misiones = misionesDeZona(base, uiMap, pj, {
    solo: pedidas ? pedidas.qs : undefined,
    registro,
    profesiones: Array.isArray(datos.profesiones) ? datos.profesiones : undefined,
    // En el juego: «le pedi la ruta asi tenga level 1 debe de crearla». Las misiones pedidas entran enteras: sin filtro
    // de nivel y aunque sean de mazmorra. Revisión final: lo mismo con `sinNivel` y `mazmorras` en la petición, que pone
    // el núcleo cuando el jugador pidió la ruta (diseño §2: en una ruta pedida no se quita nada por nivel ni mazmorra).
    mazmorras: peticion?.mazmorras === true || pedidas != null,
    sinNivel: peticion?.sinNivel === true || pedidas != null,
    soloRegistro: peticion?.solo === 'registro',
    sin: [...sin],
  });
  if (misiones.length === 0) {
    const t = textoRutaZona('sin_misiones', { zona: zonaTexto }, idioma);
    return { error: 'sin_misiones', texto: avisoSinEncontrar ? `${avisoSinEncontrar} ${t}` : t };
  }
  const posicion = lugar.mapa === uiMap && esNumero(lugar.x) && esNumero(lugar.y) ? { mapa: uiMap, x: lugar.x, y: lugar.y } : null;
  const ordenadas = ordenarRuta(base, misiones, pj, posicion, uiMap);
  const guia = guiaDeRuta(base, uiMap, ordenadas, pj, idioma, { registro, nombre });
  const tamano = guia.recortadas ?? 0;
  const total = misiones.recortadas + tamano;
  if (total > 0) guia.recortadas = total;
  if (misiones.objetoSinSitio > 0) guia.resumen.objetoSinSitio = misiones.objetoSinSitio;
  const resumen = textoRutaZona('resumen', { ...guia.resumen, tope: misiones.recortadas, tamano, sinSitio: misiones.objetoSinSitio }, idioma);
  const texto = avisoSinEncontrar ? `${resumen}\n${avisoSinEncontrar}` : resumen;
  return { guia, texto };
}
