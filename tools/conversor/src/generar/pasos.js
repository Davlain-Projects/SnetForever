// Pasos de una misión (R11): recoger, completar y entregar, generados solo con lo que dice la base.
// Nunca se inventa un punto: lo que no tiene punto en la base va sin `goto` y con `sinVerificar = "punto"`.
// Las guías de cadenas y de mazmorra se construyen con esto (`ensamblarGuia` pone n, id y linea).
import { BIT_CLASE, RAZAS_DE } from '../questie/vista.js';
import { yFiltro, oFiltro } from '../rxp/filtros.js';
import { idDePaso } from '../salida/id.js';

// Puntos distintos como mucho en un paso de completar (uno por objetivo con punto; las repeticiones no cuentan).
const MAX_GOTO_COMPLETAR = 6;

const lista = (v) => (Array.isArray(v) ? v : []);
const tieneBit = (mascara, bit) => Math.floor(mascara / bit) % 2 === 1;

const goto = ({ mapa, x, y }) => ({ t: 'goto', mapa, x, y, modo: 'flecha' });
const claveGoto = (g) => `${g.mapa}|${g.x}|${g.y}`;

/**
 * Resuelve una fuente (una lista de candidatos que dan el mismo sitio, p. ej. las criaturas de las que cae
 * un ítem). Con `cerca` ({mapa, x, y}), primero el punto de los candidatos en ese mapa más cercano a él. Si no, en el
 * orden de `preferidos` (uiMaps), el primer candidato que tenga un punto en ese mapa;
 * si ninguno, un punto de mapa gana al de la mazmorra, en el orden dado (el mapa con más puntos de cada uno).
 * @returns {{goto: object, fuente?: object}|{dentro: true}|{nada: true}} `fuente`: el candidato del punto (no está
 *   si el punto es la entrada de una mazmorra)
 */
function resolverFuente(vista, candidatos, dentro, preferidos = [], cerca) {
  // Si la entidad aparece en la mazmorra donde se está, el paso va sin `goto` aunque tenga spawns fuera.
  const mazmorrasDe = (c) => (c.spawns ? vista.mazmorrasDeSpawns(c.spawns) : vista.mazmorrasDe(c));
  if (dentro !== undefined && candidatos.some((c) => mazmorrasDe(c).includes(dentro))) return { dentro: true };
  // Lote C (52-M9): con `cerca` (el punto del paso anterior), el punto de los candidatos en su mapa más cercano a él.
  if (cerca) {
    let mejor = null;
    for (const c of candidatos) {
      const p = c.spawns ? vista.puntoCercano(c.spawns, cerca) : vista.puntoCercanoDe(c, cerca);
      const d = p && (p.x - cerca.x) ** 2 + (p.y - cerca.y) ** 2;
      if (p && (mejor === null || d < mejor.d)) mejor = { d, p, c };
    }
    if (mejor) return { goto: goto(mejor.p), fuente: mejor.c };
  }
  for (const mapa of preferidos) {
    for (const c of candidatos) {
      const p = c.spawns ? vista.puntoEnMapa(c.spawns, mapa) : vista.puntoDeEnMapa(c, mapa);
      if (p) return { goto: goto(p), fuente: c };
    }
  }
  const puntos = candidatos.map((c) => (c.spawns ? vista.puntoDeSpawns(c.spawns) : vista.puntoDe(c)));
  const i = puntos.findIndex((p) => p?.mapa !== undefined);
  if (i >= 0) return { goto: goto(puntos[i]), fuente: candidatos[i] };
  const mazmorras = puntos.filter((p) => p?.mazmorra !== undefined).map((p) => p.mazmorra);
  if (dentro !== undefined && mazmorras.includes(dentro)) return { dentro: true };
  for (const area of mazmorras) {
    const entrada = vista.entradaDe(area);
    if (entrada) return { goto: goto(entrada) };
  }
  return { nada: true };
}

// startedBy / finishedBy = [pnjs, objetos, ítems]: el primero que tenga punto (sin repetir los de mazmorra). Los
// objetos de `preferidos` (los que comparte con la misión de al lado en una cadena) van delante de todos.
function candidatosDe(grupos, preferidos = []) {
  const [pnjs, objetos] = [lista(grupos?.[0]), lista(grupos?.[1])];
  const todos = [...pnjs.map((id) => ({ tipo: 'npc', id })), ...objetos.map((id) => ({ tipo: 'object', id }))];
  const delante = (c) => (c.tipo === 'object' && preferidos.includes(c.id) ? 0 : 1);
  return todos.map((c, i) => ({ c, i })).sort((a, b) => delante(a.c) - delante(b.c) || a.i - b.i).map((x) => x.c);
}

// Un solo `goto` (o ninguno) para quien da o recibe la misión, si el paso va marcado y, si el punto es de un objeto,
// su ID (`objeto`). Con `cerca` ({mapa, x, y}), el candidato con el punto más cercano a él en ese mapa (resolverFuente).
function gotoDePersona(vista, grupos, dentro, preferidos, cerca) {
  const r = resolverFuente(vista, candidatosDe(grupos, preferidos), dentro, [], cerca);
  // A la entrada de una mazmorra (sin `fuente`) no se dice ningún objeto: el punto no es el suyo.
  if (r.goto) return { elementos: [r.goto], ...(r.fuente?.tipo === 'object' ? { objeto: r.fuente.id } : {}) };
  return r.dentro ? { elementos: [] } : { elementos: [], sinVerificar: 'punto' };
}

const mapaDeGotos = (elementos) => elementos.find((e) => e.t === 'goto')?.mapa;

// Lote C (revisión 52, Minor 9): recoger una misión que empieza con un ítem. El ítem sale de las criaturas y objetos
// de su npcDrops y objectDrops en la base: un goto a esa fuente (con `anterior`, el punto más cercano a él; si no, la
// regla de resolverFuente con los mapas `preferidos`), un collect del ítem (con la misión: hecho en cuanto está en el
// registro) y el accept. Una fuente sin puntos deja el paso sin goto y con sinVerificar «punto»; un ítem sin fuente
// conocida, sin goto y sin marca (como antes). Nunca se inventa un punto.
function recogerDeItem(vista, q, item, dentro, preferidos, anterior) {
  const it = vista.item(item);
  const candidatos = [...lista(it?.npcDrops).map((id) => ({ tipo: 'npc', id })),
    ...lista(it?.objectDrops).map((id) => ({ tipo: 'object', id }))];
  const pedir = [{ t: 'collect', i: item, n: 1, q }, { t: 'accept', q }];
  // Ronda 1 (duda 7): el id del paso sale de lo que llevaba antes del lote C (solo el accept), así las marcas guardadas
  // (saltado, retomado, progreso) de ese paso siguen casando.
  const elementosId = [{ t: 'accept', q }];
  if (candidatos.length === 0) return { elementos: pedir, elementosId };
  const mapas = [...new Set(preferidos)].filter((mapa) => Number.isInteger(mapa) && mapa > 0);
  const r = resolverFuente(vista, candidatos, dentro, mapas, anterior);
  if (r.goto) return { elementos: [r.goto, ...pedir], elementosId };
  return r.dentro ? { elementos: pedir, elementosId } : { elementos: pedir, elementosId, sinVerificar: 'punto' };
}

// Índice (desde 1) del primer objetivo de cada grupo de `objectives` en el diario, en el orden del addon
// (nucleo/misiones.lua, tipoDeBase): PNJ (grupo 1), objetos (2), ítems (3), crédito de muerte (5) y hechizos (6);
// la reputación (4) no cuenta. La exploración (triggerEnd) va detrás de todos: el 1 si no hay otros.
function inicioDeGrupos(q) {
  const obj = lista(q.objectives);
  const inicio = {};
  let n = 0;
  for (const g of [0, 1, 2, 4, 5]) {
    inicio[g] = n + 1;
    n += lista(obj[g]).length;
  }
  inicio.triggerEnd = n + 1;
  return inicio;
}

// Fuentes de los objetivos, en el orden de la regla: PNJ (grupo 1), crédito de muerte (5), objetos (2),
// ítems (3: de qué PNJ u objeto caen) y puntos de exploración (triggerEnd). Cada una con su `objetivo` (k).
function fuentesDeObjetivos(vista, q) {
  const obj = lista(q.objectives);
  const inicio = inicioDeGrupos(q);
  const fuentes = [];
  const meter = (candidatos, objetivo) => fuentes.push({ candidatos, objetivo });
  lista(obj[0]).forEach((e, i) => meter([{ tipo: 'npc', id: e?.[0] }], inicio[0] + i));
  lista(obj[4]).forEach((e, i) => {
    meter([...lista(e?.[0]), ...(e?.[1] ? [e[1]] : [])].map((id) => ({ tipo: 'npc', id })), inicio[4] + i);
  });
  lista(obj[1]).forEach((e, i) => meter([{ tipo: 'object', id: e?.[0] }], inicio[1] + i));
  lista(obj[2]).forEach((e, i) => {
    const it = vista.item(e?.[0]);
    meter([...lista(it?.npcDrops).map((id) => ({ tipo: 'npc', id })),
      ...lista(it?.objectDrops).map((id) => ({ tipo: 'object', id }))], inicio[2] + i);
  });
  // Con reputación, los `complete` del conversor cuentan la reputación (un par [facción, valor], 2 entradas) y el
  // índice de la exploración no cuadra con ellos: su goto va sin objetivo (la flecha no lo salta).
  const conReputacion = lista(obj[3]).length > 0;
  if (Array.isArray(q.triggerEnd) && q.triggerEnd[1]) {
    meter([{ spawns: q.triggerEnd[1] }], conReputacion ? undefined : inicio.triggerEnd);
  }
  return fuentes;
}

// Número de objetivos del registro: las entradas de los grupos de `objectives`. La reputación (grupo 4) es un solo
// objetivo: en QuestieDB es un par [facción, valor], no una lista de entradas (contarla como 2 daba un complete fantasma).
const contarObjetivos = (q) => lista(q.objectives).slice(0, 6)
  .reduce((n, g, i) => n + (i === 3 ? (lista(g).length > 0 ? 1 : 0) : lista(g).length), 0);

// `preferidos`: uiMaps donde buscar antes el punto de cada fuente (recogida o entrega, entrega y zona).
// Cada goto lleva el objetivo al que pertenece; el mismo punto se repite si es de otro objetivo (el addon salta
// los gotos de los objetivos cumplidos). El tope cuenta puntos distintos: una repetición no gasta tope.
function pasoCompletar(vista, q, id, dentro, preferidos) {
  const elementos = [];
  const puntos = new Set();
  const vistos = new Set();
  let hayDentro = false;
  const fuentes = fuentesDeObjetivos(vista, q).filter((f) => f.candidatos.length > 0);
  for (const { candidatos, objetivo } of fuentes) {
    const r = resolverFuente(vista, candidatos, dentro, preferidos);
    if (r.dentro) hayDentro = true;
    if (!r.goto) continue;
    const punto = claveGoto(r.goto);
    const clave = `${punto}|${objetivo}`;
    if (vistos.has(clave) || (!puntos.has(punto) && puntos.size >= MAX_GOTO_COMPLETAR)) continue;
    vistos.add(clave);
    puntos.add(punto);
    elementos.push(objetivo === undefined ? r.goto : { ...r.goto, objetivo });
  }
  // Solo exploración: el objetivo 1 del registro de misiones.
  const n = Math.max(contarObjetivos(q), Array.isArray(q.triggerEnd) ? 1 : 0);
  for (let k = 1; k <= n; k++) elementos.push({ t: 'complete', q: id, objetivo: k });
  const paso = { parte: 'completar', elementos, etiquetas: {}, requisitos: [] };
  if (fuentes.length > 0 && puntos.size === 0 && !hayDentro) paso.sinVerificar = 'punto';
  return paso;
}

// `c:` y `r:` si la misión no vale para todas las clases o razas de su facción (máscaras, sin bits de 32).
function filtroDeMision(vista, q, filtroLlamante) {
  let f = filtroLlamante ?? true;
  const clases = Object.keys(BIT_CLASE).filter((c) => (q.requiredClasses ? tieneBit(q.requiredClasses, BIT_CLASE[c]) : true));
  if (clases.length > 0 && clases.length < Object.keys(BIT_CLASE).length) {
    f = yFiltro(f, clases.reduce((acc, c) => oFiltro(acc, [[`c:${c}`]]), false));
  }
  const razasFaccion = RAZAS_DE[vista.faccion];
  const razas = razasFaccion.filter((r) => vista.aplicaARaza(q, r));
  if (razas.length < razasFaccion.length) {
    f = yFiltro(f, razas.reduce((acc, r) => oFiltro(acc, [[`r:${r}`]]), false));
  }
  return f === true ? undefined : f;
}

/**
 * Pasos de la misión `q`: recoger, completar (si hay objetivos o triggerEnd) y entregar.
 * @param {object} vista Vista de questie/vista.js
 * @param {number} q id de la misión
 * @param {{migas?: number[], previas?: {una?: number[], todas?: number[]}, filtro?: *, dentro?: number,
 *   objetos?: boolean, dadores?: number[], receptores?: number[]}} [opciones]
 *   migas: misiones cuyo `turnin siFalta` va antes del accept; previas: `isQuestTurnedIn` de cada paso;
 *   filtro: el del paso (se le añaden c: y r: de la misión); dentro: AreaID de la mazmorra donde se está;
 *   objetos (guías de mejora): el accept y el turnin llevan `objeto` (su ID) si se recoge o se entrega en un objeto;
 *   dadores / receptores: objetos que van delante al buscar el punto de quien la da o la recibe (en una cadena, los
 *   que comparte con la misión anterior o con la siguiente); anterior ({mapa, x, y}): el último punto de los pasos de
 *   antes (lote C, 52-M9: si la misión empieza con un ítem, el punto de su fuente más cercano a él).
 * @returns {Array<{parte: string, elementos: object[], etiquetas: object, requisitos: object[], filtro?: *, sinVerificar?: string}>}
 */
export function pasosDeMision(vista, q, {
  migas = [], previas = {}, filtro, dentro, objetos = false, dadores = [], receptores = [], anterior,
} = {}) {
  const m = vista.mision(q);
  if (!m) throw new Error(`la misión ${q} no está en la base`);
  const condiciones = [
    ...(previas.una?.length ? [{ t: 'isQuestTurnedIn', qs: [...previas.una] }] : []),
    ...lista(previas.todas).map((p) => ({ t: 'isQuestTurnedIn', qs: [p] })),
  ];
  const conCondiciones = (paso) => ({ ...paso, elementos: [...condiciones.map((c) => ({ ...c, qs: [...c.qs] })), ...paso.elementos] });

  // En las guías de mejora, el accept y el turnin dicen en qué objeto (si es un objeto).
  const enObjeto = (elemento, persona) => (objetos && persona.objeto !== undefined ? { ...elemento, objeto: persona.objeto } : elemento);
  const receptor = gotoDePersona(vista, m.finishedBy, dentro, receptores);
  // Recoger: si la da un ítem, se va a donde sale ese ítem y se recoge (lote C, 52-M9); si no, se va a quien la da.
  let recoger;
  const items = lista(m.startedBy?.[2]);
  if (items.length > 0) {
    recoger = recogerDeItem(vista, q, items[0], dentro, [mapaDeGotos(receptor.elementos), vista.mapaDeZona(m.zoneOrSort)], anterior);
  } else {
    // Lote H: en una guía de mejora (`objetos`), si ningún objeto que la da es de los que comparte con la anterior, el
    // dador más cercano al paso anterior (donde se entregó la anterior). Sin esto, con QuestieDB 1.0.14 la Horda iba a
    // por «Stepping Stones» al tablón de Los Baldíos y no al de Páramos de Poniente, donde acaba de entregar la primera.
    const conComun = lista(m.startedBy?.[1]).some((o) => dadores.includes(o));
    const cerca = objetos && !conComun ? anterior : undefined;
    const dador = gotoDePersona(vista, m.startedBy, dentro, dadores, cerca);
    recoger = {
      elementos: [...dador.elementos, ...migas.map((b) => ({ t: 'turnin', q: b, siFalta: true })), enObjeto({ t: 'accept', q }, dador)],
      ...(dador.sinVerificar ? { sinVerificar: dador.sinVerificar } : {}),
    };
  }
  // Mapas preferidos para los puntos de completar: (a) el de la recogida (o, sin ella, el de la entrega), (b) el
  // de la entrega, (c) el de la zona de la misión; si ninguno tiene puntos, el de más puntos.
  const mapaDe = mapaDeGotos;
  const preferidos = [...new Set([mapaDe(recoger.elementos), mapaDe(receptor.elementos), vista.mapaDeZona(m.zoneOrSort)])]
    .filter((mapa) => Number.isInteger(mapa) && mapa > 0);
  const partes = [
    { parte: 'recoger', ...recoger, etiquetas: {}, requisitos: [] },
    ...(contarObjetivos(m) > 0 || Array.isArray(m.triggerEnd) ? [pasoCompletar(vista, m, q, dentro, preferidos)] : []),
    {
      parte: 'entregar', elementos: [...receptor.elementos, enObjeto({ t: 'turnin', q }, receptor)], etiquetas: {}, requisitos: [],
      ...(receptor.sinVerificar ? { sinVerificar: receptor.sinVerificar } : {}),
    },
  ];
  const f = filtroDeMision(vista, m, filtro);
  // Orden de campos del contrato: parte, filtro, etiquetas, requisitos, elementos, sinVerificar.
  return partes.map((p) => {
    const { elementos } = conCondiciones(p);
    return {
      parte: p.parte,
      ...(f === undefined ? {} : { filtro: f }),
      etiquetas: p.etiquetas,
      requisitos: p.requisitos,
      elementos,
      ...(p.sinVerificar ? { sinVerificar: p.sinVerificar } : {}),
      // Ronda 1: con qué se calcula el id, si no es con `elementos` (ensamblarGuia lo usa y no lo escribe).
      ...(p.elementosId ? { elementosId: conCondiciones({ elementos: p.elementosId }).elementos } : {}),
    };
  });
}

/**
 * Pone n (1…), id estable (con -2, -3… si se repite), linea = 0 y quita `parte` (y `elementosId`, con lo que se calcula
 * el id si no es con los elementos: lote C, ronda 1).
 * @param {{clave: string}} campos campos de la guía (todo lo que no son los pasos)
 * @param {Array} pasos salida de pasosDeMision (concatenada)
 */
export function ensamblarGuia(campos, pasos) {
  const vistos = new Map();
  const pasosSal = pasos.map((p, i) => {
    const base = idDePaso(campos.clave, p.filtro ?? true, JSON.stringify([p.parte, p.elementosId ?? p.elementos]));
    const veces = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, veces);
    return {
      id: veces === 1 ? base : `${base}-${veces}`,
      n: i + 1,
      ...(p.filtro === undefined || p.filtro === true ? {} : { filtro: p.filtro }),
      etiquetas: p.etiquetas ?? {},
      elementos: p.elementos,
      requisitos: p.requisitos ?? [],
      linea: 0,
      ...(p.sinVerificar ? { sinVerificar: p.sinVerificar } : {}),
    };
  });
  return { ...campos, pasos: pasosSal };
}
