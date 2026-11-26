// Biblioteca de guías: las guías de 4Ever Leveling (sus Data.lua: «_G.FourEverLevelingContent.Register(id, versión, {…})»).
// Se leen con el lector de DATOS de lua.mjs: nunca se ejecuta nada. 4Ever Leveling es «All Rights Reserved»: la app lee
// los archivos que el jugador tiene en su carpeta de guías y nada suyo va al repositorio (las pruebas usan datos inventados).
//
//   guiasDe4Ever(texto, {idioma = 'es', nombreArchivo}) -> {formato: '4ever', guias: GuiaLeida[], sinLeer: [{parte, motivo}]}
//                                                       | {noLeido: 'ilegible' | 'formato'}
//
// Dos formas de paquete:
//   - de niveles («horde-20-30»): `classSegments` {CLASE: [id de segmento]}, `segments` {id: {chapters: [{id, level,
//     untilLevel, title}], orders: {CLASE: [id de paso]}}}, `steps` {id: paso}. Un segmento es un capítulo; sus clases con
//     la MISMA lista de pasos van juntas en una guía (`clases`). Los segmentos que no salen en classSegments son variantes
//     de una raza (todos sus pasos piden esa raza): llevan `razas`.
//   - de inicio («start-…»): `profiles` {id: {chapters, classes, races, faction, steps: [paso]}}: una guía por capítulo
//     del perfil, con los pasos cuyo `chapter` es el suyo.
// Comunes: `locations` [{id, mapID, x, y (0-1), npcId}] y `quests` [{id, title}]. Un paso: su texto (`detail`, o
// `title`) en el idioma y en inglés (`textoEn`), sus misiones (tasks accept / objective / turn_in, con el nombre de
// `quests`), su punto (locationId; x e y pasan a % del mapa) y el PNJ de ese punto; sus `conditions` de clase y raza
// van en el paso (`clases`, `razas`). Facción: la del perfil o la del id del paquete (horde-/alliance-).
// Un capítulo que no se entiende no tumba el archivo: sale en `sinLeer` ({parte: «título (CLASES)», motivo: 'roto' |
// 'sin_pasos'}). Un archivo que no es un literal bien escrito: {noLeido: 'ilegible'}; sin capítulos: {noLeido: 'formato'}.
import { leerSentencias } from './lua.mjs';
import { entradas } from '../base/leer-lua.mjs';

export const LLAMADA = 'FourEverLevelingContent.Register';
const MAX_NOMBRE = 120;

// Lo que no hace falta y pesa: se salta sin construirlo (por nombre de clave, en cualquier nivel).
const OMITIR = new Set(['reason', 'structuredSources', 'semanticHash', 'sourceStep', 'translationStatus', 'manualReasons',
  'classification', 'requirements', 'requires', 'availabilityReview', 'sourceCommit', 'sourceCoordinates',
  'originalSourceCoordinates', 'pointReview', 'pointLabel', 'pointAssociation', 'provisionalNotice', 'experimentalBuilds',
  'builds', 'foreverAdaptation', 'completionReview', 'conditionReview', 'sourceMechanics', 'sourcePath',
  'navigationException', 'recovery', 'navigation', 'manualConditionReview', 'predicate', 'completionPredicate']);

const ARTE = /\|c[0-9a-fA-F]{8}|\|r|\|T[^|]*\|t/g;
const limpio = (s) => String(s).replace(ARTE, '').replace(/\s+/g, ' ').trim();
const recorta = (s) => (s.length > MAX_NOMBRE ? s.slice(0, MAX_NOMBRE) : s);
const esObjeto = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
const lista = (v) => (Array.isArray(v) ? v : []);
const textos = (v) => lista(v).filter((x) => typeof x === 'string' && x !== '');

function textoDe(v, idioma) {
  if (typeof v === 'string') return limpio(v);
  if (esObjeto(v)) {
    const t = v[idioma] ?? v.es ?? v.en;
    return typeof t === 'string' ? limpio(t) : '';
  }
  return '';
}
const textoEn = (v) => (esObjeto(v) && typeof v.en === 'string' && limpio(v.en) !== '' ? limpio(v.en) : null);

function nivelesDe(a, b) {
  return Number.isInteger(a) && Number.isInteger(b) && a >= 1 && a <= b && b <= 80 ? [a, b] : undefined;
}
const FACCIONES = { horde: 'Horde', alliance: 'Alliance' };
const faccionDe = (v) => (typeof v === 'string' ? FACCIONES[v.trim().toLowerCase()] : undefined);
const ACCIONES = { accept: 'aceptar', objective: 'completar', turn_in: 'entregar', turnin: 'entregar', complete: 'completar' };
const redondeo = (n) => Math.round(n * 10000) / 100; // 0-1 -> % con dos decimales

/** ¿Es un Data.lua de 4Ever Leveling? (mirar antes de leer: el resto de .lua del addon es código). */
export const es4Ever = (texto) => /FourEverLevelingContent\s*\.\s*Register\s*\(/.test(texto);

export function guiasDe4Ever(texto, { idioma = 'es', nombreArchivo = 'Data.lua' } = {}) {
  let sentencias;
  try {
    sentencias = leerSentencias(texto, { nombreArchivo, omitir: OMITIR });
  } catch {
    return { noLeido: 'ilegible' };
  }
  const guias = [];
  const sinLeer = [];
  for (const s of sentencias) {
    if (!Array.isArray(s.args) || !s.nombre.endsWith(LLAMADA)) continue; // lo demás se lee y no se usa (nunca se llama)
    const [id, , datos] = s.args;
    if (!esObjeto(datos)) continue;
    leerPaquete(typeof id === 'string' ? id : String(datos.id ?? ''), datos, idioma, guias, sinLeer);
  }
  if (guias.length === 0 && sinLeer.length === 0) return { noLeido: 'formato' };
  guias.forEach((g, k) => { g.k = k; });
  return { formato: '4ever', guias, sinLeer };
}

function leerPaquete(id, datos, idioma, guias, sinLeer) {
  const lugares = new Map();
  for (const l of lista(datos.locations)) if (esObjeto(l) && typeof l.id === 'string') lugares.set(l.id, l);
  const misiones = new Map();
  for (const q of lista(datos.quests)) if (esObjeto(q) && Number.isInteger(q.id)) misiones.set(q.id, q);
  const ctx = { idioma, lugares, misiones };
  const faccionPaquete = faccionDe(/^(horde|alliance)-/i.exec(id)?.[1]);

  if (esObjeto(datos.segments)) {
    const pasos = esObjeto(datos.steps) ? datos.steps : {};
    const deBase = new Set(Object.values(esObjeto(datos.classSegments) ? datos.classSegments : {}).flatMap(textos));
    for (const [idSeg, seg] of Object.entries(datos.segments)) {
      if (!esObjeto(seg)) continue;
      const cap = lista(seg.chapters).find(esObjeto) ?? {};
      const titulo = textoDe(cap.title, idioma) || (typeof cap.id === 'string' ? cap.id : idSeg);
      // Las clases con la misma lista de pasos, juntas (en orden alfabético).
      const grupos = new Map(); // firma -> {clases, orden}
      const rotas = [];
      for (const clase of Object.keys(esObjeto(seg.orders) ? seg.orders : {}).sort()) {
        const orden = seg.orders[clase];
        if (!Array.isArray(orden)) { rotas.push(clase); continue; }
        const firma = JSON.stringify(orden.map((x) => (typeof x === 'string' ? x : x?.id ?? '')));
        const g = grupos.get(firma) ?? grupos.set(firma, { clases: [], orden }).get(firma);
        g.clases.push(clase);
      }
      if (rotas.length) sinLeer.push({ parte: `${titulo} (${rotas.join(', ')})`, motivo: 'roto' });
      for (const { clases, orden } of grupos.values()) {
        const delCapitulo = orden.map((x) => (typeof x === 'string' ? pasos[x] : x)).filter(esObjeto);
        const guia: ReturnType<typeof guiaDe> & { razas?: string[] } = guiaDe({ titulo, cap, faccion: faccionPaquete, clases, pasos: delCapitulo, ctx });
        if (!guia) { sinLeer.push({ parte: `${titulo} (${clases.join(', ')})`, motivo: 'sin_pasos' }); continue; }
        if (!deBase.has(idSeg)) {
          const razas = razasDeTodos(delCapitulo);
          if (razas) guia.razas = razas;
        }
        guias.push(guia);
      }
    }
  }

  if (esObjeto(datos.profiles)) {
    for (const perfil of Object.values(datos.profiles)) {
      if (!esObjeto(perfil)) continue;
      const clases = textos(perfil.classes);
      const razas = textos(perfil.races);
      const faccion = faccionDe(perfil.faction) ?? faccionPaquete;
      const todos = lista(perfil.steps).filter(esObjeto);
      for (const cap of lista(perfil.chapters)) {
        if (!esObjeto(cap)) continue;
        const titulo = textoDe(cap.title, idioma) || String(cap.id ?? '');
        const delCapitulo = todos.filter((p) => p.chapter === cap.id);
        const guia: ReturnType<typeof guiaDe> & { razas?: string[] } = guiaDe({ titulo, cap, faccion, clases, pasos: delCapitulo, ctx });
        if (!guia) { sinLeer.push({ parte: `${titulo} (${clases.join(', ')})`, motivo: 'sin_pasos' }); continue; }
        if (razas.length) guia.razas = razas;
        guias.push(guia);
      }
    }
  }
}

// Las razas que piden TODOS los pasos (la variante de una raza), o undefined si alguno vale para cualquiera.
function razasDeTodos(pasos) {
  const razas = new Set<string>();
  for (const p of pasos) {
    const r = textos(p.conditions?.races);
    if (r.length === 0) return undefined;
    r.forEach((x) => razas.add(x));
  }
  return razas.size ? [...razas] : undefined;
}

function guiaDe({ titulo, cap, faccion, clases, pasos, ctx }) {
  const salida = [];
  const zonas = [];
  for (const p of pasos) {
    const paso = pasoDe(p, salida.length + 1, ctx);
    if (!paso) continue;
    if (Number.isInteger(paso.punto?.mapa) && !zonas.includes(paso.punto.mapa)) zonas.push(paso.punto.mapa);
    salida.push(paso);
  }
  if (salida.length === 0) return null;
  const niveles = nivelesDe(cap.level, cap.untilLevel);
  return {
    k: 0, nombre: recorta(limpio(titulo) || 'Capítulo'), pasos: salida,
    ...(faccion ? { faccion } : {}), ...(niveles ? { niveles } : {}), ...(zonas.length ? { zonas } : {}),
    ...(typeof cap.id === 'string' ? { capitulo: cap.id } : {}),
    clases: [...clases],
  };
}

function pasoDe(p, n, { idioma, lugares, misiones }) {
  const texto = textoDe(p.detail, idioma) || textoDe(p.title, idioma);
  const en = textoEn(p.detail) ?? (textoDe(p.detail, idioma) ? null : textoEn(p.title));
  const lista_ = [];
  for (const t of lista(p.tasks)) {
    if (!esObjeto(t) || !Object.hasOwn(ACCIONES, t.action) || !Number.isInteger(t.questId) || t.questId < 1) continue;
    const q = t.questId;
    if (lista_.some((m) => m.q === q && m.accion === ACCIONES[t.action])) continue;
    const nombre = textoDe(misiones.get(q)?.title, idioma);
    lista_.push({ q, accion: ACCIONES[t.action], ...(nombre ? { nombre } : {}) });
  }
  const lugar = typeof p.locationId === 'string' ? lugares.get(p.locationId) : undefined;
  let punto;
  if (lugar && Number.isInteger(lugar.mapID) && lugar.mapID >= 1 && typeof lugar.x === 'number' && typeof lugar.y === 'number'
    && lugar.x >= 0 && lugar.x <= 1 && lugar.y >= 0 && lugar.y <= 1) {
    punto = { mapa: lugar.mapID, x: redondeo(lugar.x), y: redondeo(lugar.y) };
  }
  if (texto === '' && lista_.length === 0 && !punto) return null;
  const clases = textos(p.conditions?.classes);
  const razas = textos(p.conditions?.races);
  return {
    n, texto, misiones: lista_,
    ...(punto ? { punto } : {}),
    ...(Number.isInteger(lugar?.npcId) && lugar.npcId > 0 ? { pnjs: [lugar.npcId] } : {}),
    ...(en && texto !== '' ? { textoEn: en } : {}),
    ...(clases.length ? { clases } : {}),
    ...(razas.length ? { razas } : {}),
  };
}
