// Vista de la base de QuestieDB para una facción (y, si se da, una clase): las entidades con la corrección
// dinámica del Forever ya aplicada, más las consultas que necesitan las cadenas de clase y el índice de
// mazmorras (facción y raza de una misión, punto de un PNJ u objeto).
import { BORRAR } from './correcciones.js';
import { convertirPuntos } from './zonas.js';
import { esMisionBasura } from '../escribir/misiones.js';
import { PROPIAS, aplicarPropiasARegistro } from './propias.js';

export const RAZAS_DE = {
  Horde: ['Orc', 'Scourge', 'Tauren', 'Troll', 'Skyborne'],
  Alliance: ['Human', 'Dwarf', 'NightElf', 'Gnome', 'Skyborne'],
};

// Bits de la máscara requiredRaces. Skyborne no tiene bit propio: trae uno por facción (2^32 y 2^33), así
// que las máscaras se miran con aritmética, nunca con operadores de bits (32 bits).
export const BIT_RAZA = {
  Human: 1, Orc: 2, Dwarf: 4, NightElf: 8, Scourge: 16, Tauren: 32, Gnome: 64, Troll: 128,
  Skyborne: { Alliance: 2 ** 32, Horde: 2 ** 33 },
};

export const BIT_CLASE = {
  WARRIOR: 1, PALADIN: 2, HUNTER: 4, ROGUE: 8, PRIEST: 16, SHAMAN: 64, MAGE: 128, WARLOCK: 256, DRUID: 1024,
};

// QuestSort (zoneOrSort negativo) de las misiones de cada clase.
export const ORDEN_CLASE = {
  WARRIOR: -81, PALADIN: -141, HUNTER: -261, ROGUE: -162, PRIEST: -262, SHAMAN: -82, MAGE: -161, WARLOCK: -61, DRUID: -263,
};

// Una coordenada de mapa válida es un número finito entre 0 y 100; el resto no es un punto.
const enRango = (n) => Number.isFinite(n) && n >= 0 && n <= 100;

const FACCIONES = ['Horde', 'Alliance'];
const TIPOS = ['quest', 'npc', 'object', 'item'];
const NOMBRE_TIPO = { quest: 'mision', npc: 'pnj', object: 'objeto', item: 'item' };

const tieneBit = (mascara, bit) => Math.floor(mascara / bit) % 2 === 1;
const listaDe = (v) => (Array.isArray(v) ? v : []);
// Ronda 1 (M1): un objeto por el que pasan más misiones de la raza que estas es un buzón (ver esBuzon).
export const MAX_MISIONES_OBJETO = 3;
const esPorClase = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === 1 && v.porClase !== null && typeof v.porClase === 'object';

// Bit de `raza` para la máscara de la facción `faccion`.
function bitDe(raza, faccion) {
  const b = BIT_RAZA[raza];
  if (b === undefined) throw new Error(`raza desconocida: ${raza}`);
  return typeof b === 'object' ? b[faccion] : b;
}

/**
 * @param {{entidades: object, correcciones: object, zonas: object, propias?: object[]}} fuentes salidas de
 *   leerEntidades, leerCorrecciones y cargarZonas; `propias` son las correcciones propias comprobadas (src/questie/propias.js),
 *   que se aplican después de las de QuestieDB (por defecto PROPIAS; [] para no aplicar ninguna)
 * @param {{faccion: 'Horde'|'Alliance', clase?: string}} personaje
 */
export function crearVista({ entidades, correcciones, zonas, propias = PROPIAS }, { faccion, clase }) {
  if (!FACCIONES.includes(faccion)) throw new Error(`facción desconocida: ${faccion}`);
  const memoria = Object.fromEntries(TIPOS.map((t) => [t, new Map()]));

  // Valor de una corrección para esta vista: porClase elige la clase; null (o sin clase) = sin corrección.
  const valorCorreccion = (v) => {
    if (!esPorClase(v)) return { hay: true, valor: v };
    const porClase = clase === undefined ? undefined : v.porClase[clase];
    return porClase === undefined || porClase === null ? { hay: false } : { hay: true, valor: porClase };
  };

  function registro(tipo, id) {
    const m = memoria[tipo];
    if (m.has(id)) return m.get(id);
    const base = entidades[tipo].get(id);
    const corr = correcciones[faccion]?.[tipo]?.[id];
    let r;
    if (base === undefined && corr === undefined) {
      r = undefined;
    } else {
      r = { ...(base ?? {}) };
      for (const [campo, v] of Object.entries(corr ?? {})) {
        if (v === BORRAR) { delete r[campo]; continue; }
        const c = valorCorreccion(v);
        if (c.hay) r[campo] = c.valor;
      }
    }
    r = aplicarPropiasARegistro(tipo, id, faccion, r, propias);
    m.set(id, r);
    return r;
  }

  function aplicaARaza(q, raza) {
    const mascara = q?.requiredRaces;
    if (!mascara) return true;
    return tieneBit(mascara, bitDe(raza, faccion));
  }

  function faccionDe(q) {
    const mascara = q?.requiredRaces;
    if (!mascara) return undefined;
    const tiene = (f) => Object.keys(BIT_RAZA).some((raza) => {
      if (raza === 'Skyborne') return tieneBit(mascara, BIT_RAZA.Skyborne[f]);
      return RAZAS_DE[f].includes(raza) && tieneBit(mascara, BIT_RAZA[raza]);
    });
    const h = tiene('Horde');
    const a = tiene('Alliance');
    if (h === a) return undefined;
    return h ? 'Horde' : 'Alliance';
  }

  // Primer punto válido de `spawns` en el uiMap `mapa` ({mapa, x, y}), o null si no tiene ninguno allí.
  function puntoEnMapa(spawns, mapa) {
    if (!spawns) return null;
    const p = (convertirPuntos(spawns, zonas).mapas[mapa] ?? []).find(([x, y]) => enRango(x) && enRango(y));
    return p ? { mapa, x: p[0], y: p[1] } : null;
  }

  // Lote C (revisión 52, Minor 9): el punto válido de `spawns` en el mapa de `ref` ({mapa, x, y}) más cercano a `ref`,
  // o null si no tiene ninguno en ese mapa. Solo puntos de la base: no se inventa nada.
  function puntoCercano(spawns, ref) {
    if (!spawns || !Number.isInteger(ref?.mapa)) return null;
    let mejor = null;
    for (const [x, y] of convertirPuntos(spawns, zonas).mapas[ref.mapa] ?? []) {
      if (!enRango(x) || !enRango(y)) continue;
      const d = (x - ref.x) ** 2 + (y - ref.y) ** 2;
      if (mejor === null || d < mejor.d) mejor = { d, x, y };
    }
    return mejor ? { mapa: ref.mapa, x: mejor.x, y: mejor.y } : null;
  }

  function puntoCercanoDe({ tipo, id }, ref) {
    return puntoCercano(registro(tipo, id)?.spawns, ref);
  }

  // uiMap de la zona de una misión (zoneOrSort > 0 es un AreaID; los negativos son QuestSort), o null.
  function mapaDeZona(zoneOrSort) {
    return Number.isInteger(zoneOrSort) && zoneOrSort > 0 ? zonas.uiMap(zoneOrSort) || null : null;
  }

  // Mapa con más puntos (empate: el menor uiMap) y su primer punto; sin puntos, la mazmorra del centinela.
  // `spawns` = {areaId: [[x, y], …]} (los de un PNJ, un objeto o el triggerEnd de una misión).
  function puntoDeSpawns(spawns) {
    if (!spawns) return null;
    const { mapas, mazmorras } = convertirPuntos(spawns, zonas);
    let mejor = null;
    for (const [clave, todos] of Object.entries(mapas)) {
      const mapa = Number(clave);
      const puntos = todos.filter(([x, y]) => enRango(x) && enRango(y));
      if (puntos.length === 0) continue;
      if (mejor === null || puntos.length > mejor.puntos.length
        || (puntos.length === mejor.puntos.length && mapa < mejor.mapa)) mejor = { mapa, puntos };
    }
    if (mejor) return { mapa: mejor.mapa, x: mejor.puntos[0][0], y: mejor.puntos[0][1] };
    if (mazmorras.length > 0) return { mazmorra: mazmorras[0] };
    return null;
  }

  // AreaID de las mazmorras donde aparece (centinela {-1, -1}), aunque también tenga puntos en un mapa.
  function mazmorrasDeSpawns(spawns) {
    return spawns ? convertirPuntos(spawns, zonas).mazmorras : [];
  }

  function mazmorrasDe({ tipo, id }) {
    return mazmorrasDeSpawns(registro(tipo, id)?.spawns);
  }

  function puntoDe({ tipo, id }) {
    return puntoDeSpawns(registro(tipo, id)?.spawns);
  }

  function puntoDeEnMapa({ tipo, id }, mapa) {
    return puntoEnMapa(registro(tipo, id)?.spawns, mapa);
  }

  // Primera entrada de la mazmorra `areaId` que tiene mapa: {mapa, x, y}; null si no hay (no se inventa).
  function entradaDe(areaId) {
    const e = zonas.mazmorras.get(areaId)?.entradas?.find((x) => x.mapa && enRango(x.x) && enRango(x.y));
    return e ? { mapa: e.mapa, x: e.x, y: e.y } : null;
  }

  function* misiones() {
    for (const id of entidades.quest.keys()) {
      const q = registro('quest', id);
      if (!esMisionBasura(q)) yield [id, q];
    }
  }

  // Índices para las previas por objeto (se hacen la primera vez): objeto -> misiones que se entregan en él, objeto ->
  // misiones que empiezan en él, y misión -> las que la tienen como nextQuestInChain.
  let enlaces;
  function indicesDeEnlaces() {
    if (enlaces) return enlaces;
    enlaces = { terminanEn: new Map(), empiezanEn: new Map(), anteriores: new Map() };
    const meter = (mapa, clave, id) => (mapa.get(clave) ?? mapa.set(clave, []).get(clave)).push(id);
    for (const [id, q] of misiones()) {
      for (const o of listaDe(q.finishedBy?.[1])) meter(enlaces.terminanEn, o, id);
      for (const o of listaDe(q.startedBy?.[1])) meter(enlaces.empiezanEn, o, id);
      if (q.nextQuestInChain) meter(enlaces.anteriores, q.nextQuestInChain, id);
    }
    return enlaces;
  }

  // Ronda 1 (M1): un objeto es un «buzón» si por él pasan (se entregan o empiezan) más de MAX_MISIONES_OBJETO misiones
  // de la raza: es un sitio de entrega genérico («Dead Drop», 4; la Sparklematic 5200, 6), no un eslabón de una cadena
  // (los de la base pasan 2, o 3 con una segunda salida o la vuelta de la cadena, como «Shards of Myzrael»).
  function esBuzon(objeto, raza) {
    const { terminanEn, empiezanEn } = indicesDeEnlaces();
    const pasan = new Set([...(terminanEn.get(objeto) ?? []), ...(empiezanEn.get(objeto) ?? [])]);
    return [...pasan].filter((x) => aplicaARaza(registro('quest', x), raza)).length > MAX_MISIONES_OBJETO;
  }

  // Ronda 1 (M1): alguien da la misión (un PNJ, un objeto o un ítem). Sin eso no se puede conseguir: no es una previa.
  const tieneDador = (m) => [0, 1, 2].some((k) => listaDe(m?.startedBy?.[k]).length > 0);

  // ¿`buscada` va antes de `desde` por los enlaces de la base (preQuestSingle, preQuestGroup, nextQuestInChain)?
  function vaAntesPorEnlaces(buscada, desde) {
    const { anteriores } = indicesDeEnlaces();
    const vistas = new Set([desde]);
    const pendientes = [desde];
    while (pendientes.length > 0) {
      const actual = pendientes.pop();
      const m = registro('quest', actual);
      for (const p of [...listaDe(m?.preQuestSingle), ...listaDe(m?.preQuestGroup), ...(anteriores.get(actual) ?? [])]) {
        if (p === buscada) return true;
        if (!vistas.has(p)) { vistas.add(p); pendientes.push(p); }
      }
    }
    return false;
  }

  // Lote «Cadenas de mejoras»: previas implícitas de `q` para `raza` por objeto compartido. A es previa de q si se
  // entrega en un objeto que da q y A vale para la raza (su máscara). No se deduce nada si q ya tiene previas de la
  // base (preQuestSingle, preQuestGroup o una anterior por nextQuestInChain para esa raza: manda el enlace), ni de A
  // si cerraría un ciclo: q también se entrega donde empieza A (un ciclo de dos para la misma raza) o q ya va antes
  // de A por los enlaces de la base (como la tumba de «The Weathered Grave», donde se entrega «A Daughter's Love»).
  // Ronda 1 (M1): tampoco a través de un objeto «buzón» (esBuzon), ni de una A que nadie da (tieneDador).
  // Devuelve las IDs ordenadas (basta una, como preQuestSingle).
  function previasPorObjeto(id, raza) {
    const q = registro('quest', id);
    if (!q || listaDe(q.preQuestSingle).length > 0 || listaDe(q.preQuestGroup).length > 0) return [];
    const { terminanEn, anteriores } = indicesDeEnlaces();
    const vale = (a) => a !== id && aplicaARaza(registro('quest', a), raza);
    if ((anteriores.get(id) ?? []).some(vale)) return [];
    const seEntregaEn = new Set(listaDe(q.finishedBy?.[1]));
    const previas = new Set();
    for (const o of listaDe(q.startedBy?.[1])) {
      if (esBuzon(o, raza)) continue;
      for (const a of terminanEn.get(o) ?? []) {
        if (!vale(a) || previas.has(a) || !tieneDador(registro('quest', a))) continue;
        if (listaDe(registro('quest', a).startedBy?.[1]).some((x) => seEntregaEn.has(x))) continue;
        if (vaAntesPorEnlaces(id, a)) continue;
        previas.add(a);
      }
    }
    return [...previas].sort((a, b) => a - b);
  }

  const vista = {
    faccion, clase, aplicaARaza, faccionDe, puntoDe, puntoDeSpawns, puntoDeEnMapa, puntoEnMapa, puntoCercano, puntoCercanoDe,
    mapaDeZona,
    mazmorrasDe, mazmorrasDeSpawns, entradaDe, misiones, previasPorObjeto,
  };
  for (const tipo of TIPOS) vista[NOMBRE_TIPO[tipo]] = (id) => registro(tipo, id);
  return vista;
}
