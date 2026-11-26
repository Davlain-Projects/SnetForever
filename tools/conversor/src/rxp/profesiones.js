// Profesiones de RestedXP recortadas al tramo 1-300 del mundo clásico (tarea 9 de la fase 3, regla R4).
// Las guías originales (Herbalism, Mining, Skinning) son de WotLK y llegan a 450: se parten por la habilidad,
// se quitan los pasos que no existen en Forever (zonas de Outland y Northrend, piedra de hogar, monturas) y
// cada paso pide el nivel de su zona según OpenMap. La guía se construye antes con `construirGuias`.
import { VERIFICADAS } from '../cadenas/verificadas.js';

// Zonas que no existen en el mundo clásico. Un paso cuyo texto inglés contiene una de estas palabras se descarta.
export const NO_CLASICO = ['Dalaran', 'Shattrath', 'Northrend', 'Outland', 'Hellfire', 'Terokkar', 'Nagrand',
  'Zangarmarsh', "Blade's Edge", 'Netherstorm', 'Shadowmoon', 'Borean', 'Howling Fjord', 'Dragonblight',
  'Grizzly Hills', "Zul'Drak", 'Sholazar', 'Storm Peaks', 'Icecrown', 'Wintergrasp', 'Crystalsong'];

const GRUPO = 'Profesiones';
const TEXTOS = ['texto', 'rotulo', 'tooltip'];
const DESCARTE = { hs: 'hs', riding: 'riding', zona: 'no-clasico' };

// «450» pasa a ser el máximo conservado («1-450 Herbalism» → «1-300 Herbalism»).
const conTope = (texto, hasta) => (typeof texto === 'string' ? texto.replace(/\b450\b/g, String(hasta)) : texto);
const titulo = (t, hasta) => Object.fromEntries(Object.entries(t).map(([i, v]) => [i, conTope(v, hasta)]));

// Textos ingleses de un elemento (`texto`, `rotulo` y `tooltip` pueden ser `{en, es?}` o texto suelto).
function textosEn(e) {
  return TEXTOS.map((c) => (typeof e[c] === 'string' ? e[c] : e[c]?.en)).filter((t) => typeof t === 'string');
}

// Motivo por el que se descarta un paso (el primero que cumple), o `undefined` si se queda.
function motivoDescarte(paso) {
  if (paso.elementos.some((e) => e.t === 'hs')) return DESCARTE.hs;
  if (paso.elementos.some((e) => e.t === 'skill' && e.p === 'riding')) return DESCARTE.riding;
  const enZona = paso.elementos.some((e) => textosEn(e).some((t) => NO_CLASICO.some((z) => t.includes(z))));
  return enZona ? DESCARTE.zona : undefined;
}

// Mapas (uiMap) de los `goto` y `loop` de un paso.
function mapasDe(paso) {
  const mapas = [];
  for (const e of paso.elementos) {
    if (e.t === 'goto' && e.mapa !== undefined) mapas.push(e.mapa);
    else if (e.t === 'loop') for (const p of e.puntos ?? []) if (p.mapa !== undefined) mapas.push(p.mapa);
  }
  return mapas;
}

/**
 * Recorta una guía de profesión (ya construida con `construirGuias`) al tramo 1-`hasta`.
 * @param {object} guia guía de `construirGuias` (no se modifica)
 * @param {{profesion: string, hasta: number, niveles: Map<number, [number, number]>,
 *   verificadas?: object}} opciones `niveles` es `leerOpenMap(...).niveles` (uiMap → [min, max]); `verificadas`
 *   vale VERIFICADAS (las pruebas pasan otro registro).
 * @returns {{guia: object|null, avisos: object[], cuenta: {pasos: number, recortados: number,
 *   descartados: Record<string, number>}}} `guia` es null si no queda ningún paso
 */
export function recortarProfesion(guia, { profesion, hasta, niveles, verificadas = VERIFICADAS }) {
  const avisos = [];
  const aviso = (tipo, mensaje) => avisos.push({ tipo, archivo: guia.fuente.archivo, mensaje: `${guia.clave}: ${mensaje}` });
  const cuenta = { pasos: guia.pasos.length, recortados: 0, descartados: {} };

  // 1. Se corta desde el primer paso que pide más habilidad de la que se conserva.
  let corte = guia.pasos.findIndex((p) => p.elementos.some((e) => e.t === 'skill' && e.p === profesion && e.n > hasta));
  if (corte < 0) {
    corte = guia.pasos.length;
    aviso('profesion-sin-corte', `ningún paso pide ${profesion} por encima de ${hasta}: no se recorta`);
  }
  cuenta.recortados = guia.pasos.length - corte;

  // 2. Lo que no existe en el mundo clásico se descarta, con su motivo; 3. cada paso pide el nivel de su zona.
  const pasos = [];
  for (const paso of guia.pasos.slice(0, corte)) {
    const motivo = motivoDescarte(paso);
    if (motivo) {
      cuenta.descartados[motivo] = (cuenta.descartados[motivo] ?? 0) + 1;
      continue;
    }
    const nivel = Math.max(1, ...mapasDe(paso).map((m) => niveles.get(m)?.[0] ?? 1));
    const requisitos = nivel > 1 && !paso.requisitos.some((r) => r.t === 'nivel' && r.n === nivel && r.filtro === undefined)
      ? [...paso.requisitos, { t: 'nivel', n: nivel }] : paso.requisitos;
    pasos.push({ ...paso, n: pasos.length + 1, requisitos });
  }
  if (pasos.length === 0) {
    aviso('profesion-vacia', 'no queda ningún paso tras recortar: la guía no se emite');
    return { guia: null, avisos, cuenta };
  }

  // 4. y 5. Nombre, clave, títulos y campos de guía lateral.
  const nombre = conTope(guia.nombre, hasta);
  const clave = `${GRUPO}\\${nombre}`;
  const { variantes, subgrupo, ...resto } = guia;
  const salida = {
    ...resto,
    clave,
    grupo: GRUPO,
    nombre,
    titulo: titulo(guia.titulo, hasta),
    tipo: 'profesion',
    niveles: { min: 1, max: 60 },
    tramo: { es: `Habilidad 1-${hasta}`, en: `Skill 1-${hasta}` },
    habilidad: { p: profesion, desde: 1, hasta },
    sinVerificar: !verificadas[clave],
    fuente: { archivo: guia.fuente.archivo, linea: 0 },
    siguientes: [],
    mazmorras: [],
    pasos,
  };
  if (variantes) {
    salida.variantes = variantes.map((v) => ({
      ...v, clave: `${GRUPO}\\${nombre}`, grupo: GRUPO, titulo: titulo(v.titulo, hasta),
    }));
  }
  return { guia: salida, avisos, cuenta };
}
