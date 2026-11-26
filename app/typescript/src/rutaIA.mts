// Tarea 18: la app comprueba la guía que armó la IA (el bloque `guiaNueva` ya validado de forma por guiaNuevaValida, en
// respuesta.mjs) antes de mandarla al juego. Módulo puro: todo lo que necesita viene en `opciones`.
//
//   comprobarGuiaNueva({titulo?, tramos: [{titulo, pasos}]} | {titulo?, pasos}, opciones)
//     -> {tramos: [{titulo, pasos}], quitados: {misiones, puntos, web, pasos}}
//
// opciones:
//   base, pj            la base de misiones y el personaje (para `base.mision(q, pj)`)
//   puntos              Map «P#» -> {mapa, x, y, ...}: la tabla de puntos del turno
//   puntoDeMarca        (marca) -> {mapa, x, y, origen} | null: resuelve una marca de origen (B:…, G:…)
//   paginas             [{url, texto}] | null: las páginas que se leyeron en este turno. En producción `texto` es el texto de
//                       la página que BAJA LA APP (tarea 20), nunca el resumen que dé la IA; con null no vale ningún `web`
//   misionesBiblioteca  Set de ids de misión que salen de las guías de la biblioteca
//   resolverZona        (zona) -> {uiMap} | null
//
// Reglas, paso a paso (la IA nunca inventa misiones, PNJ ni coordenadas):
//   - una misión vale si está en la base o en `misionesBiblioteca`; si no, se quita y cuenta en quitados.misiones
//   - `punto` vale si es un P# de la tabla del turno o una marca que `puntoDeMarca` resuelve; si no, quitados.puntos.
//     Sale como `punto: {mapa, x, y, origen}` con origen {tipo: 'turno'} (P#) o el que dé la marca
//   - `web` (solo se mira si el paso no trae un `punto` válido) vale si su url, sin `#fragmento`, sin barra final y con
//     http como https, es la de una página de `paginas`, su zona se resuelve y las coordenadas x e y aparecen escritas
//     en el texto de esa página (con punto o coma decimal, comparadas redondeadas a una cifra). Sale como `punto` con
//     origen {tipo: 'web', url}; si no vale, quitados.web
//   - un paso que se queda sin misiones, sin punto y sin texto se quita (quitados.pasos); un tramo sin pasos, también
//     (y sus pasos cuentan en quitados.pasos)
//   - NO se quita nada por nivel, por mazmorra ni por grupo: eso lo decide el jugador, no esta comprobación.
//   - 16-nov: las previas que faltan (completarPrevias, con `opciones.registro` y `opciones.mapaJugador`): la que se puede
//     coger entra delante con su cadena; si no, se quita la misión que depende de ella. Sale también
//     {sinPrevia: [{q, previa, motivo}], previas: n} (n = misiones previas metidas delante).
//   - 17-nov: los objetivos que faltan (completarObjetivos, con `opciones.listas`: las misiones listas para entregar, y
//     `opciones.hechas`): una misión que se entrega sin un «completar» antes lleva delante sus pasos de objetivo de la
//     base. Sale también {objetivos: n} (n = misiones completadas así).
//
// Tarea 19: la ruta comprobada pasa a guías del addon (las de rutaZona.mjs: tipo «ia», clave «IA\…»), una o varias:
//
//   guiasDeRuta(tramos, {titulo, pj, idioma, base}) -> Guia[] (en orden)
//
//   tramos   los de comprobarGuiaNueva ([{titulo, pasos}]) o una lista de pasos suelta (un tramo con `titulo`)
//   T3 (17-nov): los tramos declarados van seguidos en la misma guía (con varios, el título de cada tramo es una nota de
//   su primer paso); una guía se cierra solo antes del paso que la haría pasar de 400 pasos, de 60 misiones distintas o
//   de 40 KB serializada con aLuaSeguro (como viaja en el buzón). Antes (R17) cada tramo empezaba guía.
//   16-nov: un paso con sitio y sin misiones que no es solo viajar (esViaje: «Abre…», «Usa…», «Mata…», «Habla con…») va
//   con el siguiente paso que tiene misión: su sitio, de punto de paso (`goto` «flecha» de 10 yardas, que no bloquea) y su
//   texto, de primera nota; sin paso con misión detrás en el tramo, sale con su flecha y una casilla (`manual`). Una previa
//   que metió comprobarGuiaNueva trae sus `elementos` y va tal cual. Cada `complete` de un objetivo de objeto lleva `pnj`:
//   quién lo suelta en la base (npcDrops), para «Objetivos cercanos» del addon.
//   Elementos de cada paso, en este orden: el punto (`goto` «flecha» si el paso lleva misiones; si no, «objetivo» de 10
//   yardas, que se da por hecho al llegar: solo un paso de viaje), las misiones (aceptar → accept, entregar → turnin, completar → complete con
//   su objetivo o, sin él, uno por objetivo de la base, al menos uno) y el texto (`nota` si hay misiones o punto; si
//   no, `manual`; los dos {es: t, en: t}, salvo que el punto sea una marca G: de una guía que trae el paso en inglés: entonces `en` es ese texto; el texto ya viene con `|` duplicado de respuesta.mjs y no se vuelve a tocar).
//   Revisión final: si el punto viene de una página (origen web), la nota acaba en «(de internet: <sitio>)» / «(from the
//   web: <sitio>)», con solo el host de la dirección (sin ruta ni consulta), aunque el paso no traiga texto.
//   Un paso de más de 30 elementos se parte en pasos seguidos, cada uno con su goto.
//   R19: en un «completar» sin objetivo, el objetivo de objeto sin sitio en la base no va en el paso: va en su propio
//   paso (objetivosSinSitio de base/pasos.mjs, lo mismo que en las rutas de zona), justo antes del paso que entrega esa
//   misión si está en el tramo (el mismo o uno de más adelante) o, si no, justo después.
//   Clave: «IA\Ruta de <t> (<Horda|Alianza>)» con una sola guía y «IA\Ruta de <t> (<facción>, <i> de <n>)» con varias
//   (i de n sobre todas las guías; así zonaDe de ui/chat.lua sigue sacando <t>). <t> es el título del tramo (el de la
//   ruta si la guía lleva pasos de varios tramos; sin título de la ruta, el del primero de ellos), sin «\»,
//   «|» ni controles y recortado para que la clave quepa en 160 bytes; los títulos es y en son iguales, «Ruta de <t> …»
//   en 80 bytes (los topes de ia/ruta.lua). Sin facción conocida, sin ella en el paréntesis. `idioma` no cambia nada:
//   las claves y los títulos van como los pide el brief.

import { urlDePagina } from './actualizar/red.mjs';
import { paresDeTexto } from './biblioteca/texto.mjs';
import { ensamblarGuia, contarObjetivos, objetivosSinSitio, pasosDeMision, lista } from './base/pasos.mjs';
import { elemento, entradas } from './base/leer-lua.mjs';
import { MAX_MISIONES, MAX_PASOS, MAX_ELEMENTOS_PASO, MAX_BYTES_GUIA, valePara } from './rutaZona.mjs';
import { aLuaSeguro } from './buzon.mjs';
import { TEXTOS_GUIA_NUEVA } from './textos.mjs';
import { ordenarPasosIA } from './ordenRutaIA.mjs';

const ID_PUNTO = /^P[1-9][0-9]*$/;
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const unaCifra = (n) => Math.round(n * 10);

// La dirección de una página sin lo que no la distingue (#fragmento, barra final, http), o null si no es una página pública.
function claveDePagina(url) {
  if (typeof url !== 'string') return null;
  const normal = urlDePagina(url.replace(/#.*$/s, ''));
  return normal === null ? null : normal.replace(/\/+$/, '');
}

function puntoDeTabla(id, opciones) {
  const p = opciones.puntos instanceof Map ? opciones.puntos.get(id) : undefined;
  if (!p || !esNumero(p.mapa) || !esNumero(p.x) || !esNumero(p.y)) return null;
  // Ronda 1 (M1): un P# de objetivo dice de qué misión es (completarObjetivos lo cuenta como su «completar»).
  const objetivoDe = p.papel === 'objetivo' && Number.isInteger(p.q) ? { objetivoDe: p.q } : {};
  return { mapa: p.mapa, x: p.x, y: p.y, origen: { tipo: 'turno', ...objetivoDe } };
}

function puntoDeLaMarca(marca, opciones) {
  if (typeof opciones.puntoDeMarca !== 'function') return null;
  let p;
  try { p = opciones.puntoDeMarca(marca); } catch { return null; }
  if (!p || !esNumero(p.mapa) || !esNumero(p.x) || !esNumero(p.y)) return null;
  return { mapa: p.mapa, x: p.x, y: p.y, origen: p.origen ?? { tipo: 'base' },
    ...(typeof p.textoEn === 'string' && p.textoEn !== '' ? { textoEn: p.textoEn } : {}) };
}

function puntoDeWeb(w, paginasPorClave, opciones) {
  if (!w || typeof w !== 'object') return null;
  const clave = claveDePagina(w.url);
  const pagina = clave === null ? undefined : paginasPorClave.get(clave);
  if (pagina === undefined || !esNumero(w.x) || !esNumero(w.y)) return null;
  let zona = null;
  try { zona = typeof opciones.resolverZona === 'function' ? opciones.resolverZona(w.zona) : null; } catch { zona = null; }
  if (!zona || !esNumero(zona.uiMap)) return null;
  const x = unaCifra(w.x);
  const y = unaCifra(w.y);
  if (!pagina.pares.some((p) => unaCifra(p.x) === x && unaCifra(p.y) === y)) return null;
  return { mapa: zona.uiMap, x: w.x, y: w.y, origen: { tipo: 'web', url: w.url } };
}

// Revisión final: la misma comprobación de un punto de internet sirve a los `web` de guiaNueva y a los `pinesWeb` de
// respuesta.mjs (el núcleo la pone en el turno como `puntoDeWeb`). `paginas` son las de verdad del turno ([{url, texto}]);
// devuelve (w) -> {mapa, x, y, origen: {tipo: 'web', url}} | null, con las reglas del `web` de la cabecera.
export function crearComprobadorWeb(paginas, resolverZona) {
  const paginasPorClave = new Map();
  for (const pg of Array.isArray(paginas) ? paginas : []) {
    const clave = claveDePagina(pg?.url);
    if (clave !== null && !paginasPorClave.has(clave)) paginasPorClave.set(clave, { pares: paresDeTexto(pg.texto) });
  }
  return (w) => puntoDeWeb(w, paginasPorClave, { resolverZona });
}

export function comprobarGuiaNueva(guia, opciones: {
  paginas?: any;
  resolverZona?: any;
  base?: any;
  pj?: any;
  misionesBiblioteca?: any;
  ordenar?: boolean;
} = {}) {
  const quitados = { misiones: 0, puntos: 0, web: 0, pasos: 0 };
  const deWeb = crearComprobadorWeb(opciones.paginas, opciones.resolverZona);
  const existe = (q) => opciones.base?.mision(q, opciones.pj) !== undefined || (opciones.misionesBiblioteca instanceof Set && opciones.misionesBiblioteca.has(q));

  const comprobarPaso = (p) => {
    const paso: { texto?: any; misiones?: any; punto?: any; } = {};
    if (typeof p?.texto === 'string' && p.texto !== '') paso.texto = p.texto;
    if (Array.isArray(p?.misiones)) {
      const buenas = [];
      for (const m of p.misiones) {
        if (existe(m?.q)) buenas.push(m);
        else quitados.misiones++;
      }
      if (buenas.length > 0) paso.misiones = buenas.map((m) => ({ ...m }));
    }
    let punto = null;
    if (typeof p?.punto === 'string') {
      punto = ID_PUNTO.test(p.punto) ? puntoDeTabla(p.punto, opciones) : puntoDeLaMarca(p.punto, opciones);
      if (!punto) quitados.puntos++;
    }
    if (!punto && p?.web !== undefined) {
      punto = deWeb(p.web);
      if (!punto) quitados.web++;
    }
    if (punto) paso.punto = punto;
    if (paso.texto === undefined && paso.misiones === undefined && paso.punto === undefined) { quitados.pasos++; return null; }
    return paso;
  };

  const entrada = Array.isArray(guia?.tramos) ? guia.tramos : [{ titulo: guia?.titulo, pasos: guia?.pasos }];
  const comprobados = [];
  for (const t of entrada) {
    const pasos = (Array.isArray(t?.pasos) ? t.pasos : []).map(comprobarPaso).filter(Boolean);
    if (pasos.length > 0) comprobados.push({ titulo: t.titulo, pasos });
  }
  const conPrevias = completarPrevias(comprobados, opciones);
  const completos = completarObjetivos(conPrevias.tramos, opciones);
  const { objetivos } = completos;
  // 21-nov: solo la ruta que escribe la IA; una guía de la biblioteca se respeta tal como es.
  const { tramos } = opciones.ordenar === true ? ordenarPasosIA(completos.tramos, opciones) : completos;
  return { tramos, quitados, sinPrevia: conPrevias.sinPrevia, previas: conPrevias.previas, objetivos };
}

// ------------------------------------------------------------------------------------------------------------------
// 17-nov (en el juego: la ruta mandaba a entregar misiones sin pasos para hacerlas): los objetivos que faltan.
// ------------------------------------------------------------------------------------------------------------------

// Los textos de una tabla de la base (cadenas no vacías), en orden.
const textosDe = (v) => lista(v).filter((t) => typeof t === 'string' && t.trim() !== '');
// Un texto de la base para una nota del juego: sin controles, sin espacios de sobra, con `|` duplicado, en 300 bytes como
// mucho y sin un `|` impar al final.
function notaDeBase(t) {
  return cortarNota(t.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/ {2,}/g, ' ').trim().replace(/\|/g, '||'));
}
// Un texto ya con `|` duplicado, en 300 bytes como mucho y sin un `|` impar al final.
function cortarNota(t) {
  let corto = cortarBytes(t, MAX_NOTA);
  const barras = corto.match(/\|+$/);
  if (barras && barras[0].length % 2 === 1) corto = corto.slice(0, -1).trimEnd();
  return corto;
}
// El `objectivesText` de la misión q en la base: {es, en} (el español de la base o, si no lo trae, el inglés) o null.
function objetivosEnTexto(base, q, pj) {
  const en = textosDe(base.mision(q, pj)?.objectivesText).join(' ');
  const es = textosDe(elemento(base.datos?.es?.quest, q)?.objectivesText).join(' ') || en;
  if (en === '' && es === '') return null;
  return { es: notaDeBase(es), en: notaDeBase(en || es) };
}

/**
 * 17-nov: en toda ruta o guía de la IA (guiaNueva, crear_ruta y abrirGuia), cada misión que se entrega sin un
 * «completar» antes (en ningún tramo) lleva delante de su entrega sus pasos de objetivo de la base: las partes
 * «completar» y «conseguir» de pasosDeMision (goto solo a los sitios que trae la base, con su objetivo k, y los complete).
 * El primer paso de esa misión sin ningún goto (un objetivo sin sitio en la base) lleva de nota (detrás de la que traía,
 * ronda 1: M2) el `objectivesText` de la
 * base (es y en), en 300 bytes y sin `|` impar al final; nunca se inventa un sitio. No hace falta (y no se mete nada)
 * con una misión lista para entregar (`listas`), una de las hechas de una guía de la biblioteca (`hechas`), una que la
 * base no trae o sin objetivos en la base. Van delante del paso de la entrega y de los pasos sin misión justo anteriores
 * (son de él), como las previas; los topes de la guía (30 elementos por paso, 400 pasos, 60 misiones, 40 KB) los pone
 * guiasDeRuta. -> {tramos, objetivos: n (misiones completadas)}
 */
function completarObjetivos(tramos, { base, pj, listas, hechas, mapaJugador }: {
  base?: any;
  pj?: any;
  listas?: any;
  hechas?: any;
  mapaJugador?: any;
} = {}) {
  if (!base || typeof base.mision !== 'function') return { tramos, objetivos: 0 };
  const noHace = new Set([...idsDe(listas instanceof Set ? [...listas] : listas), ...idsDe(hechas instanceof Set ? [...hechas] : hechas)]);
  const completadas = new Set(); // con un «completar» (o un complete) antes
  let mapa = Number.isInteger(mapaJugador) ? mapaJugador : null;
  let objetivos = 0;

  const pasosDeObjetivo = (q, mapaEntrega) => {
    let partes;
    try { partes = pasosDeMision(base, q, pj, { mapa: mapaEntrega ?? mapa ?? undefined }); } catch { return []; }
    const salida = partes.filter((s) => s.parte === 'completar' || s.parte === 'conseguir')
      .map((s) => ({ elementos: s.elementos.map((e) => ({ ...e })), objetivos: q }));
    const sinSitio = salida.find((s) => !s.elementos.some((e) => e.t === 'goto'));
    const texto = sinSitio ? objetivosEnTexto(base, q, pj) : null;
    if (texto && (texto.es !== '' || texto.en !== '')) {
      // Ronda 1 (M2): detrás de la nota que ya traía («Consigue X (vendedor | subasta)»), sin quitarla, en 300 bytes.
      const vieja = sinSitio.elementos.find((e) => e.t === 'nota')?.texto;
      const unir = (a, b) => (typeof a === 'string' && a !== '' ? cortarNota(`${a.replace(/[.\s]+$/, '')}. ${b}`) : b);
      const nota = vieja ? { es: unir(vieja.es, texto.es), en: unir(vieja.en, texto.en) } : texto;
      sinSitio.elementos = [...sinSitio.elementos.filter((e) => e.t !== 'nota'), { t: 'nota', texto: nota }];
    }
    return salida;
  };

  const salida = [];
  for (const t of tramos) {
    const pasos = [];
    for (const paso of t.pasos) {
      if (Array.isArray(paso.elementos)) {
        for (const e of paso.elementos) if (e.t === 'complete' && Number.isInteger(e.q)) completadas.add(e.q);
        const g = paso.elementos.find((e) => e.t === 'goto' && Number.isInteger(e.mapa));
        if (g) mapa = g.mapa;
        pasos.push(paso);
        continue;
      }
      if (paso.punto && Number.isInteger(paso.punto.mapa)) mapa = paso.punto.mapa;
      if (Number.isInteger(paso.punto?.origen?.objetivoDe)) completadas.add(paso.punto.origen.objetivoDe);
      const misiones = Array.isArray(paso.misiones) ? paso.misiones : [];
      for (const m of misiones) if (m.accion === 'completar') completadas.add(m.q);
      const delante = [];
      for (const m of misiones) {
        if (m.accion !== 'entregar' || completadas.has(m.q)) continue;
        completadas.add(m.q);
        if (noHace.has(m.q) || !base.mision(m.q, pj)) continue;
        const suyos = pasosDeObjetivo(m.q, paso.punto?.mapa);
        if (suyos.length === 0) continue;
        objetivos++;
        delante.push(...suyos);
      }
      if (delante.length > 0) {
        let k = pasos.length;
        while (k > 0 && !Array.isArray(pasos[k - 1].misiones) && !Array.isArray(pasos[k - 1].elementos)) k--;
        pasos.splice(k, 0, ...delante);
      }
      pasos.push(paso);
    }
    salida.push({ titulo: t.titulo, pasos });
  }
  return { tramos: salida, objetivos };
}

// ------------------------------------------------------------------------------------------------------------------
// 16-nov (en el juego: la ruta de Las Mil Agujas copiaba de una guía misiones cuya previa el personaje no tenía, 1197 sin
// la 1196 y 1153 sin la 893, y el motor se las saltaba todas de golpe): las previas que faltan.
// ------------------------------------------------------------------------------------------------------------------

const MAX_CADENA = 10; // previas una detrás de otra hacia atrás (más, no se busca)
const MAX_PREVIAS = 40; // misiones previas que se pueden meter en una ruta
// El continente de los mapas de zona (uiMap del cliente). Un mapa que no está aquí no se compara.
const CONTINENTE = new Map([
  ...[1414, 1411, 1412, 1413, 1438, 1439, 1440, 1441, 1442, 1443, 1444, 1445, 1446, 1447, 1448, 1449, 1450, 1451, 1452,
    1454, 1456, 1457, 1943, 1947, 1950].map((m) => [m, 'kalimdor'] as const),
  ...[1415, 1416, 1417, 1418, 1419, 1420, 1421, 1422, 1423, 1424, 1425, 1426, 1427, 1428, 1429, 1430, 1431, 1432, 1433,
    1434, 1435, 1436, 1437, 1453, 1455, 1458, 1941, 1942, 1954].map((m) => [m, 'reinos'] as const),
]);
const idsDe = (v) => lista(v).filter((q) => Number.isInteger(q) && q > 0);

/**
 * 16-nov: la regla del jugador («así tenga nivel 1, la ruta se crea entera»), con lo que la app sabe de la base y del
 * personaje (su registro): una misión de la ruta que no está en el registro y a la que le falta una previa (de
 * preQuestSingle basta una; de preQuestGroup, todas; como Misiones.disponible del addon) que ni está en el registro ni
 * se acepta antes en la ruta:
 *   - si la previa se puede coger (está en la base, es para el personaje por facción, raza, clase y quién la da, es del
 *     mismo continente y sus propias previas se pueden coger, hasta MAX_CADENA hacia atrás), entra delante con toda su
 *     cadena, en su orden: cada una con sus pasos de la base (pasosDeMision: recoger, objetivos, entregar con sus sitios),
 *     delante del paso que la nombra por primera vez (y de los pasos sin misión que van justo antes, que son de él). Si el
 *     personaje ya la entregó (la app no lo sabe), el motor la da por hecha al pasar;
 *   - si no, se quita esa misión de toda la ruta (un paso que se queda sin misiones se va) y se apunta en `sinPrevia`
 *     ({q, previa, motivo}: 'base', 'personaje', 'continente', 'cadena' (la previa necesita otra que no se puede) o
 *     'tope'), que el núcleo dice en una línea al final de la respuesta.
 * Lo que depende del registro del momento (una previa ya entregada) lo sigue saltando el motor como hoy.
 * @returns {{tramos, sinPrevia: Array<{q, previa, motivo}>, previas: number}}
 */
function completarPrevias(tramos, { base, pj, registro, mapaJugador }: {
  base?: any;
  pj?: any;
  registro?: any;
  mapaJugador?: any;
} = {}) {
  const sinPrevia = [];
  if (!base || typeof base.mision !== 'function') return { tramos, sinPrevia, previas: 0 };
  const tendra = new Set(idsDe(registro)); // en el registro o aceptadas antes en la ruta (o metidas delante)
  const vistas = new Set();
  const quitadas = new Set();
  let previas = 0;
  let mapa = Number.isInteger(mapaJugador) ? mapaJugador : null; // el del último paso con sitio (para el continente)
  const primerMapa = tramos.flatMap((t) => t.pasos).find((p) => p.punto)?.punto.mapa;
  if (mapa === null && Number.isInteger(primerMapa)) mapa = primerMapa;

  // ¿Se puede coger la previa p? -> {ok: true, cadena: [q…] (de la más antigua a p), partes: Map} | {ok: false, motivo}
  const coger = (p, nivel, camino, cadena, partes) => {
    if (tendra.has(p) || cadena.includes(p) || camino.has(p)) return { ok: true }; // ya está, o un ciclo: no bloquea
    if (nivel > MAX_CADENA || previas + cadena.length >= MAX_PREVIAS) return { ok: false, motivo: 'tope' };
    const m = base.mision(p, pj);
    if (!m) return { ok: false, motivo: 'base' };
    if (!valePara(base, m, pj)) return { ok: false, motivo: 'personaje' };
    let suyas;
    try { suyas = pasosDeMision(base, p, pj, { mapa: mapa ?? undefined }); } catch { return { ok: false, motivo: 'base' }; }
    const aqui = CONTINENTE.get(mapa);
    const fuera = suyas.some((s) => s.elementos.some((e) => e.t === 'goto' && CONTINENTE.has(e.mapa) && aqui && CONTINENTE.get(e.mapa) !== aqui));
    if (fuera) return { ok: false, motivo: 'continente' };
    camino.add(p);
    const antes = cadena.length;
    const r = faltan(p, nivel + 1, camino, cadena, partes);
    camino.delete(p);
    if (!r.ok) {
      for (const sobra of cadena.splice(antes)) partes.delete(sobra); // lo que se metió para p no hace falta
      return { ok: false, motivo: 'cadena' };
    }
    cadena.push(p);
    partes.set(p, suyas);
    return { ok: true };
  };
  // Las previas que le faltan a q, metidas en `cadena` (en orden) -> {ok: true} | {ok: false, previa, motivo}
  const faltan = (q, nivel, camino, cadena, partes) => {
    const m = base.mision(q, pj);
    if (!m) return { ok: true }; // una de la biblioteca que la base no tiene: no se puede mirar
    const hecha = (p) => tendra.has(p) || cadena.includes(p);
    const sola = idsDe(m.preQuestSingle);
    if (sola.length > 0 && !sola.some(hecha)) {
      let fallo = null;
      for (const p of sola) {
        const r = coger(p, nivel, camino, cadena, partes);
        if (r.ok) { fallo = null; break; }
        fallo ??= { previa: p, motivo: r.motivo };
      }
      if (fallo) return { ok: false, ...fallo };
    }
    for (const p of idsDe(m.preQuestGroup)) {
      if (hecha(p)) continue;
      const r = coger(p, nivel, camino, cadena, partes);
      if (!r.ok) return { ok: false, previa: p, motivo: r.motivo };
    }
    return { ok: true };
  };

  const salida = [];
  for (const t of tramos) {
    const pasos = [];
    for (const paso of t.pasos) {
      if (paso.punto && Number.isInteger(paso.punto.mapa)) mapa = paso.punto.mapa;
      if (!Array.isArray(paso.misiones)) { pasos.push(paso); continue; }
      const quedan = [];
      const delante = [];
      for (const m of paso.misiones) {
        if (quitadas.has(m.q)) continue;
        if (!vistas.has(m.q)) {
          vistas.add(m.q);
          if (!tendra.has(m.q)) {
            const cadena = [];
            const partes = new Map();
            const r = faltan(m.q, 1, new Set([m.q]), cadena, partes);
            if (!r.ok) {
              quitadas.add(m.q);
              sinPrevia.push({ q: m.q, previa: r.previa, motivo: r.motivo });
              continue;
            }
            for (const p of cadena) {
              tendra.add(p);
              previas++;
              for (const s of partes.get(p)) delante.push({ elementos: s.elementos.map((e) => ({ ...e })), previa: p });
            }
          }
        }
        if (m.accion === 'aceptar') tendra.add(m.q);
        quedan.push(m);
      }
      if (delante.length > 0) {
        // Delante del paso y de los pasos sin misión que van justo antes (son de él).
        let k = pasos.length;
        while (k > 0 && !Array.isArray(pasos[k - 1].misiones) && !Array.isArray(pasos[k - 1].elementos)) k--;
        pasos.splice(k, 0, ...delante);
      }
      if (quedan.length > 0) pasos.push({ ...paso, misiones: quedan });
    }
    if (pasos.length > 0) salida.push({ titulo: t.titulo, pasos });
  }
  return { tramos: salida, sinPrevia, previas };
}

// ------------------------------------------------------------------------------------------------------------------
// Tarea 19: la ruta pasa a guías del addon (ver la cabecera)
// ------------------------------------------------------------------------------------------------------------------

const MAX_CLAVE = 160; // bytes de la clave de la guía (ia/ruta.lua)
const MAX_TITULO = 80; // bytes del título (ia/ruta.lua)
const PREFIJO = 'IA\\'; // «IA» y una sola barra invertida
const RUTA_DE = 'Ruta de ';
const RADIO_SITIO = 10; // yardas de un punto sin misiones
const MAX_NOTA = 300; // bytes de una nota o un paso manual (MAX_TEXTO_PASO de ia/ruta.lua)
const FACCION = { Horde: 'Horda', Alliance: 'Alianza' };
const bytes = (t) => Buffer.byteLength(t, 'utf8');
const nivelDe = (m) => (esNumero(m.questLevel) && m.questLevel > 0 ? m.questLevel : (esNumero(m.requiredLevel) ? m.requiredLevel : 0));

// <t> sin barras invertidas, barras verticales ni controles (cada tanda, un espacio) y sin espacios de sobra.
const limpiarTitulo = (t) => (typeof t === 'string' ? t.replace(/[\\|\x00-\x1f\x7f]+/g, ' ').replace(/ {2,}/g, ' ').trim() : '');

// Los primeros caracteres enteros de `t` que caben en `max` bytes.
function cortarBytes(t, max) {
  let salida = '';
  let n = 0;
  for (const c of t) {
    n += bytes(c);
    if (n > max) break;
    salida += c;
  }
  return salida.trimEnd();
}

// El nombre del sitio de una dirección (el host, sin ruta ni consulta), o null.
function sitioDe(url) {
  try {
    const host = new URL(String(url)).hostname;
    return /^[a-z0-9.-]{1,100}$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

// 16-nov (en el juego: «al llegar a los puntos se saltan los objetivos sin completar las quest»): ¿el texto de un paso sin
// misión es solo viajar a un sitio? Sí si empieza por un verbo de viaje («Ve», «Entra», «Sube», «Head»…; «Toma» y «Coge»
// solo con un medio de transporte, como «Toma el zepelín») y no lleva ningún verbo de acción («abre», «mata», «usa», «habla»…). Un paso
// sin texto (solo el sitio) también es de viaje.
const sinTildes = (t) => t.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
const VIAJE = new Set(['ve', 'vete', 'id', 'viaja', 'vuela', 'sube', 'subete', 'baja', 'bajate', 'entra', 'sal', 'dirigete',
  'corre', 'camina', 'cruza', 'sigue', 'continua', 'regresa', 'vuelve', 'nada', 'salta', 'rodea', 'atraviesa', 'avanza',
  'llega', 'acercate', 'pasa', 'go', 'head', 'run', 'travel', 'fly', 'walk', 'enter', 'exit', 'leave', 'return', 'follow',
  'cross', 'climb', 'jump', 'continue', 'proceed', 'swim', 'move']);
const CON_TRANSPORTE = new Set(['toma', 'coge', 'monta', 'take', 'ride', 'board']);
const TRANSPORTE = /\b(ascensor|elevador|barco|zepelin|vuelo|grifo|murcielago|dracoleon|wyvern|portal|teletransporte|tranvia|elevator|lift|boat|ship|zeppelin|flight|gryphon|bat|tram|teleport)\b/;
const ACCION = new Set(['mata', 'matar', 'saquea', 'saquear', 'abre', 'abrir', 'usa', 'usar', 'utiliza', 'habla', 'hablar',
  'recoge', 'recoger', 'invoca', 'invocar', 'entrega', 'entregar', 'acepta', 'aceptar', 'completa', 'completar', 'destruye',
  'quema', 'coloca', 'pon', 'lee', 'leer', 'interactua', 'pulsa', 'haz', 'rescata', 'escolta', 'libera', 'busca', 'buscar',
  'consigue', 'conseguir', 'compra', 'comprar', 'vende', 'pesca', 'mina', 'despelleja', 'aprende', 'entrena', 'derrota',
  'elimina', 'caza', 'cazar', 'extrae', 'llena', 'recolecta', 'captura', 'examina', 'inspecciona', 'investiga', 'lanza',
  'enciende', 'apaga', 'toca', 'golpea', 'ataca', 'kill', 'slay', 'loot', 'open', 'use', 'talk', 'speak', 'collect',
  'gather', 'pick', 'click', 'summon', 'accept', 'turn', 'complete', 'destroy', 'burn', 'place', 'put', 'read',
  'interact', 'rescue', 'escort', 'free', 'find', 'get', 'buy', 'sell', 'learn', 'train', 'defeat', 'hunt', 'fish', 'mine',
  'skin', 'light', 'search']);
function esViaje(texto) {
  const palabras = sinTildes(String(texto ?? '')).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (palabras.length === 0) return true;
  if (palabras.some((w) => ACCION.has(w))) return false;
  return VIAJE.has(palabras[0]) || (CON_TRANSPORTE.has(palabras[0]) && TRANSPORTE.test(palabras.join(' ')));
}
const MAX_UNIDOS = 6; // pasos sin misión que se unen al siguiente con misión (más, van solos con su casilla)

// 16-nov: los PNJ que sueltan el objeto del objetivo k de q (grupo 3 de `objectives`: `npcDrops` del ítem en la base, solo
// los que están en la base), como mucho MAX_PNJ; [] si el objetivo no es de objeto. El addon no tiene `npcDrops` en el
// juego (es de los archivos de la app): sin esto, «Objetivos cercanos» no tiene a quién enseñar en un objetivo de saquear.
const MAX_PNJ = 5;
function soltadores(base, q, k, pj) {
  const m = base?.mision(q, pj);
  if (!m || !Number.isInteger(k)) return [];
  const grupo = (g) => entradas(elemento(m.objectives, g));
  const inicio = grupo(1).length + grupo(2).length + 1;
  const entrada = grupo(3)[k - inicio];
  const item = entrada ? base.item(elemento(entrada[1], 1), pj) : undefined;
  return [...new Set(lista(item?.npcDrops))].filter((id) => Number.isInteger(id) && base.npc(id, pj)).slice(0, MAX_PNJ);
}
const conSoltadores = (elementos, base, pj) => elementos.map((e) => {
  if (e.t !== 'complete') return e;
  const pnj = soltadores(base, e.q, e.objetivo, pj);
  return pnj.length > 0 ? { ...e, pnj } : e;
});

// El texto {es, en} de la nota (o del manual) de un paso, o null sin texto ni sitio de internet. Revisión final: un punto que
// sale de una página lo dice en la nota, con solo el nombre del sitio; el texto se acorta (por bytes, sin dejar un `|`
// suelto) para que la marca quepa en los 300 bytes de una nota. El inglés sale de la guía de la biblioteca de la que viene
// el punto si la guía lo trae (con `|` duplicado); si no, es el mismo texto que el español: nunca se traduce.
function notaDe(texto, punto) {
  const deSitio = punto?.origen?.tipo === 'web' ? sitioDe(punto.origen.url) : null;
  if (texto === '' && !deSitio) return null;
  const conSitio = (t, idioma) => {
    const marca = deSitio ? TEXTOS_GUIA_NUEVA[idioma].deInternet(deSitio) : '';
    let corto = cortarBytes(t, MAX_NOTA - (marca ? bytes(marca) + 1 : 0));
    const barras = corto.match(/\|+$/);
    if (barras && barras[0].length % 2 === 1) corto = corto.slice(0, -1).trimEnd();
    if (!marca) return corto;
    return corto !== '' ? `${corto} ${marca}` : marca;
  };
  const deGuia = texto !== '' && typeof punto?.textoEn === 'string' ? punto.textoEn.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/ {2,}/g, ' ').trim().replace(/\|/g, '||') : null;
  return { es: conSitio(texto, 'es'), en: conSitio(deGuia ?? texto, 'en') };
}

// Los pasos de guía de un tramo: [[elemento, …], …]. Ver la cabecera.
function pasosDeTramo(pasos, pj, base) {
  const salida = [];
  const antesDe = new Map(); // índice del paso que entrega q -> pasos de objetos sin sitio que van delante
  const vistos = new Set(); // «q|objetivo» de los objetos sin sitio ya puestos (una vez por tramo)
  // 16-nov: los pasos sin misión que van con el siguiente que sí la tiene ([{punto, nota}]); los que no llegan a unirse
  // salen solos, con su flecha y una casilla (manual): nunca como un «ir» que se da por hecho al llegar.
  const pendientes = [];
  const solo = (pe) => [...(pe.punto ? [{ t: 'goto', mapa: pe.punto.mapa, x: pe.punto.x, y: pe.punto.y, modo: 'flecha' }] : []),
    ...(pe.nota ? [{ t: 'manual', texto: pe.nota }] : [])];
  const soltarPendientes = () => { for (const pe of pendientes.splice(0)) salida.push(solo(pe)); };
  const entregaDespues = (q, i) => pasos.findIndex((p, j) => j > i && Array.isArray(p?.misiones)
    && p.misiones.some((m) => m?.q === q && m.accion === 'entregar'));
  pasos.forEach((p, i) => {
    for (const elementos of antesDe.get(i) ?? []) salida.push(elementos);
    // 16-nov: una previa que comprobarGuiaNueva sacó de la base ya trae sus elementos.
    if (Array.isArray(p?.elementos)) {
      soltarPendientes();
      for (let k = 0; k < p.elementos.length; k += MAX_ELEMENTOS_PASO) salida.push(p.elementos.slice(k, k + MAX_ELEMENTOS_PASO).map((e) => ({ ...e })));
      return;
    }
    const punto = p?.punto && esNumero(p.punto.mapa) && esNumero(p.punto.x) && esNumero(p.punto.y) ? p.punto : null;
    const deMision = [];
    const aparte = [];
    for (const m of Array.isArray(p?.misiones) ? p.misiones : []) {
      if (m.accion === 'aceptar') deMision.push({ t: 'accept', q: m.q });
      else if (m.accion === 'entregar') deMision.push({ t: 'turnin', q: m.q });
      else if (m.accion === 'completar' && m.objetivo !== undefined) deMision.push({ t: 'complete', q: m.q, objetivo: m.objetivo });
      else if (m.accion === 'completar') {
        const mision = base?.mision(m.q, pj);
        const sinSitio = mision ? objetivosSinSitio(base, m.q, pj, { mapa: punto?.mapa }) : [];
        const fuera = new Set(sinSitio.map((s) => s.objetivo));
        const n = Math.max(1, mision ? contarObjetivos(mision) : 0);
        for (let k = 1; k <= n; k++) if (!fuera.has(k)) deMision.push({ t: 'complete', q: m.q, objetivo: k });
        for (const s of sinSitio) {
          const clave = `${m.q}|${s.objetivo}`;
          if (vistos.has(clave)) continue;
          vistos.add(clave);
          aparte.push({ q: m.q, elementos: s.elementos.map((e) => ({ ...e })) });
        }
      }
    }
    const texto = typeof p?.texto === 'string' ? p.texto : '';
    // 16-nov: un paso sin misión que no es solo viajar («Abre la Comida de Arpía…», «Usa la Unidad…», «Mata…») no es un
    // «ir» de llegada: va con el siguiente paso que tiene misión (su sitio, de punto de paso; su texto, de primera nota).
    // Lo que venga detrás de uno así hasta esa misión va con él. Solo un «Ve hacia X» de viaje sigue siendo un «ir».
    if (deMision.length === 0 && aparte.length === 0 && (pendientes.length > 0 || (punto && !esViaje(texto)))) {
      pendientes.push({ punto, nota: notaDe(texto, punto) });
      if (pendientes.length > MAX_UNIDOS) salida.push(solo(pendientes.shift()));
      return;
    }
    const unidos = deMision.length > 0 ? pendientes.splice(0) : [];
    const deUnidos = unidos.filter((pe) => pe.punto).map((pe) => ({ t: 'goto', mapa: pe.punto.mapa, x: pe.punto.x, y: pe.punto.y, modo: 'flecha', radio: RADIO_SITIO }));
    const fijos = punto ? [{ t: 'goto', mapa: punto.mapa, x: punto.x, y: punto.y,
      ...(deMision.length > 0 ? { modo: 'flecha' } : { modo: 'objetivo', radio: RADIO_SITIO }) }] : [];
    const cuerpo = [...deMision, ...unidos.filter((pe) => pe.nota).map((pe) => ({ t: 'nota', texto: pe.nota }))];
    const nota = notaDe(texto, punto);
    if (nota) cuerpo.push({ t: deMision.length > 0 || punto ? 'nota' : 'manual', texto: nota });
    // Un objeto sin sitio de una misión que se entrega en este mismo paso va delante; si se entrega más adelante en el
    // tramo, justo antes de esa entrega; si no, detrás de este paso.
    const despues = [];
    for (const a of aparte) {
      const j = deMision.some((e) => e.t === 'turnin' && e.q === a.q) ? i : entregaDespues(a.q, i);
      if (j === i) salida.push(a.elementos);
      else if (j < 0) despues.push(a.elementos);
      else antesDe.set(j, [...(antesDe.get(j) ?? []), a.elementos]);
    }
    // Más de 30 elementos: pasos seguidos, cada uno con el goto (los puntos de paso de los unidos, solo en el primero).
    if (cuerpo.length === 0 && fijos.length > 0) salida.push(fijos);
    for (let k = 0; k < cuerpo.length;) {
      const delante = [...(k === 0 ? deUnidos : []), ...fijos].map((e) => ({ ...e }));
      const sitio = MAX_ELEMENTOS_PASO - delante.length;
      salida.push([...delante, ...cuerpo.slice(k, k + sitio)]);
      k += sitio;
    }
    salida.push(...despues);
  });
  soltarPendientes();
  return salida.map((elementos) => conSoltadores(elementos, base, pj));
}

// Las misiones (q) de los elementos de un paso.
const misionesDePaso = (elementos) => elementos.filter((e) => e.t === 'accept' || e.t === 'turnin' || e.t === 'complete').map((e) => e.q);

// Los campos de una guía (todo menos los pasos), como construirGuia de rutaZona.mjs.
function camposDeGuia(clave, titulo, pj, niveles, resumen) {
  return {
    clave,
    grupo: 'IA',
    nombre: clave.slice(PREFIJO.length),
    titulo: { es: titulo, en: titulo },
    tipo: 'ia',
    ...(FACCION[pj?.faccion] ? { faccion: pj.faccion } : {}),
    niveles,
    siguientes: [],
    mazmorras: [],
    fuente: { archivo: 'ia', linea: 0 },
    sinVerificar: true,
    resumen,
  };
}

// Bytes de la guía sin pasos en el peor caso (clave y título enteros y todo comillas, que aLuaSeguro escapa con dos
// bytes; números de dos y tres cifras): con eso, el peso de una guía es esta cabecera más el de cada paso y ", " entre
// ellos (aLuaSeguro no sangra), y nunca se pasa.
const CABECERA = bytes(aLuaSeguro({
  ...camposDeGuia(`${PREFIJO}${'"'.repeat(MAX_CLAVE - PREFIJO.length)}`, '"'.repeat(MAX_TITULO), { faccion: 'Alliance' },
    { min: 99, max: 99 }, { misiones: MAX_MISIONES, pasos: MAX_PASOS, elites: 0, grupo: 0 }),
  pasos: [],
}));

// Una guía en construcción: sus pasos, sus misiones, su peso, los pasos repetidos (para el «-2» del id de ensamblarGuia) y
// los títulos de los tramos que lleva (en orden).
const nuevaGuia = () => ({ titulo: '', tramos: [], pasos: [], misiones: new Set(), bytes: CABECERA, repetidos: new Map() });

// T3 (B1): el primer paso de un tramo con el título del tramo de nota (delante de sus otras notas). Un paso que ya lleva
// 30 elementos se queda como está.
function conNotaDeTramo(elementos, nombre) {
  if (elementos.length >= MAX_ELEMENTOS_PASO || nombre === '') return elementos;
  const texto = cortarBytes(nombre, MAX_NOTA);
  const i = elementos.findIndex((e) => e.t === 'nota' || e.t === 'manual');
  const nota = { t: 'nota', texto: { es: texto, en: texto } };
  return i < 0 ? [...elementos, nota] : [...elementos.slice(0, i), nota, ...elementos.slice(i)];
}
const contenidoDe = (elementos) => JSON.stringify(['ia', elementos]);

// Lo que el paso añade al peso de la guía, con su n y su id como los pondrá ensamblarGuia.
function pesoDePaso(g, elementos) {
  const veces = (g.repetidos.get(contenidoDe(elementos)) ?? 0) + 1;
  const id = 'x'.repeat(8) + (veces === 1 ? '' : `-${veces}`);
  const paso = { id, n: g.pasos.length + 1, etiquetas: {}, elementos, requisitos: [], linea: 0 };
  return bytes(aLuaSeguro(paso)) + (g.pasos.length > 0 ? 2 : 0);
}

function cabe(g, elementos, peso) {
  if (g.pasos.length === 0) return true;
  if (g.pasos.length + 1 > MAX_PASOS) return false;
  const nuevas = new Set(misionesDePaso(elementos).filter((q) => !g.misiones.has(q)));
  if (g.misiones.size + nuevas.size > MAX_MISIONES) return false;
  return g.bytes + peso <= MAX_BYTES_GUIA;
}

/**
 * Tarea 19: las guías del addon de una ruta de la IA ya comprobada (ver la cabecera).
 * @param {Array<{titulo, pasos}> | Array<object>} tramos los de comprobarGuiaNueva o una lista de pasos suelta
 * @param {{titulo?: string, pj?: {faccion}, idioma?: string, base?: object}} opciones
 * @returns {Array<object>} las guías, en orden
 */
export function guiasDeRuta(tramos, { titulo, pj, base }: { titulo?: any; pj?: any; base?: any; } = {}) {
  let entrada = Array.isArray(tramos?.tramos) ? tramos.tramos : tramos;
  if (!Array.isArray(entrada)) return [];
  const declarados = entrada.length > 0 && entrada.every((t) => Array.isArray(t?.pasos));
  if (!declarados) entrada = entrada.length > 0 ? [{ titulo, pasos: entrada }] : [];

  // T3 (B1, 17-nov: el tramo 2 solo llegaba con «sigue» y se perdía): los tramos van seguidos en la misma guía mientras
  // quepan; solo se empieza otra cuando el paso no cabe. Con varios tramos, el título de cada uno va de nota en su primer
  // paso. Una guía con pasos de un solo tramo lleva su título; con varios, el de la ruta (sin título de la ruta, «Ruta»
  // o «Route» de respuesta.mjs, el de su primer tramo).
  const global = limpiarTitulo(titulo);
  const sinTitulo = global === '' || /^(?:ruta|route)$/i.test(global);
  // Ronda 1 (M5): con todos los tramos del mismo título (los de una guía de la biblioteca), la nota no aporta nada.
  const varios = new Set(entrada.map((t) => limpiarTitulo(t.titulo) || global)).size > 1;
  const grupos = [];
  let g = null;
  for (const tramo of entrada) {
    const nombre = limpiarTitulo(tramo.titulo) || global || 'IA';
    const pasos = pasosDeTramo(tramo.pasos, pj, base);
    if (varios && pasos.length > 0) pasos[0] = conNotaDeTramo(pasos[0], nombre);
    for (const elementos of pasos) {
      let peso = g ? pesoDePaso(g, elementos) : 0;
      if (!g || !cabe(g, elementos, peso)) {
        g = nuevaGuia();
        grupos.push(g);
        peso = pesoDePaso(g, elementos);
      }
      if (!g.tramos.includes(nombre)) g.tramos.push(nombre);
      g.repetidos.set(contenidoDe(elementos), (g.repetidos.get(contenidoDe(elementos)) ?? 0) + 1);
      g.pasos.push(elementos);
      for (const q of misionesDePaso(elementos)) g.misiones.add(q);
      g.bytes += peso;
    }
  }
  for (const x of grupos) x.titulo = x.tramos.length === 1 || sinTitulo ? x.tramos[0] : global;

  const faccion = FACCION[pj?.faccion] ?? null;
  return grupos.map((g, i) => {
    const dentro = [...(faccion ? [faccion] : []), ...(grupos.length > 1 ? [`${i + 1} de ${grupos.length}`] : [])];
    const sufijo = dentro.length > 0 ? ` (${dentro.join(', ')})` : '';
    const nombreClave = `${RUTA_DE}${cortarBytes(g.titulo, MAX_CLAVE - bytes(PREFIJO) - bytes(RUTA_DE) - bytes(sufijo))}${sufijo}`;
    const nombreTitulo = `${RUTA_DE}${cortarBytes(g.titulo, MAX_TITULO - bytes(RUTA_DE) - bytes(sufijo))}${sufijo}`;
    const niveles = [...g.misiones].map((q) => base?.mision(q, pj)).filter(Boolean).map((m) => Math.max(1, nivelDe(m)));
    const campos = camposDeGuia(`${PREFIJO}${nombreClave}`, nombreTitulo, pj,
      { min: niveles.length > 0 ? Math.min(...niveles) : 1, max: niveles.length > 0 ? Math.max(...niveles) : 1 },
      { misiones: g.misiones.size, pasos: g.pasos.length, elites: 0, grupo: 0 });
    return ensamblarGuia(campos, g.pasos.map((elementos) => ({ parte: 'ia', elementos, etiquetas: {}, requisitos: [] })));
  });
}
