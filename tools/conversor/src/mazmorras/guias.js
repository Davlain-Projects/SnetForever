// Guías por mazmorra (la «ruta con mazmorras» 20-60 como guías laterales) y sus avisos por nivel (tarea 8 de
// la fase 3, R5 y R14). Todo sale del índice de misiones por mazmorra y de la base: aquí no se escribe ninguna
// ID ni ninguna coordenada, y lo que no tiene punto en la base va sin `goto` y marcado por `pasosDeMision`.
import { crearVista } from '../questie/vista.js';
import { pasosDeMision, ensamblarGuia } from '../generar/pasos.js';

const FACCIONES = [['Horde', 'H'], ['Alliance', 'A']];
const NIVEL_MINIMO = 18;
const FUENTE = 'mazmorras/guias.js';
const ENTRADA = 'entrada';

const dosCifras = (n) => String(n).padStart(2, '0');

// Agrupa `entradas` (ya en orden de nivel) por la clave `clave(e)`, con los grupos en el orden de su primera
// entrada. Lo que no tiene clave (`undefined`) forma el último grupo.
function agrupar(entradas, clave) {
  const grupos = new Map();
  for (const e of entradas) {
    const k = clave(e);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e);
  }
  const sin = grupos.get(undefined);
  grupos.delete(undefined);
  return [...grupos.values(), ...(sin ? [sin] : [])];
}

// Mapa (uiMap) donde está quien da o recibe la misión; `undefined` si solo se sabe que está dentro o no hay punto.
const mapaDe = (punto) => (punto?.mapa);
const estaDentro = (punto, area) => punto?.enMazmorra === area;

// Los pasos de la guía de una mazmorra para una facción, en el orden de la regla R5:
// recoger fuera (por mapa) -> entrada -> recoger dentro -> completar -> entregar (las de dentro, y luego por mapa).
function pasosDeGuia(vista, area, entradas) {
  // Las previas que ya están en esta guía las cubre el orden; solo las externas ocultan los pasos (F3-8).
  const enGuia = new Set(entradas.map((e) => e.q));
  const externas = (lista = []) => lista.filter((q) => !enGuia.has(q));
  // `una` son alternativas (basta una): si alguna está en la guía, el orden ya la cubre y no queda condición.
  const unaExterna = (lista = []) => (lista.some((q) => enGuia.has(q)) ? [] : lista);
  const parte = (e, nombre, dentro) => pasosDeMision(vista, e.q, {
    dentro, previas: { una: unaExterna(e.previas), todas: externas(e.todas) },
  }).find((p) => p.parte === nombre);
  const pasos = [];

  const fuera = entradas.filter((e) => !estaDentro(e.recoge, area));
  for (const grupo of agrupar(fuera, (e) => mapaDe(e.recoge))) {
    for (const e of grupo) pasos.push(parte(e, 'recoger'));
  }

  const entrada = vista.entradaDe(area);
  pasos.push({
    parte: ENTRADA,
    elementos: [...(entrada ? [{ t: 'goto', mapa: entrada.mapa, x: entrada.x, y: entrada.y, modo: 'flecha' }] : []),
      { t: 'subzone', area, soloInstancia: true }],
    etiquetas: {},
    requisitos: [],
    ...(entrada ? {} : { sinVerificar: 'punto' }),
  });

  for (const e of entradas.filter((x) => estaDentro(x.recoge, area))) pasos.push(parte(e, 'recoger', area));

  for (const e of entradas) {
    const completar = parte(e, 'completar', area);
    if (completar) pasos.push(completar);
  }

  // Entregar: lo que se entrega dentro va primero (antes de salir); lo demás, agrupado por mapa.
  const dentroEntrega = entradas.filter((e) => estaDentro(e.entrega, area));
  for (const e of dentroEntrega) pasos.push(parte(e, 'entregar', area));
  const fueraEntrega = entradas.filter((e) => !estaDentro(e.entrega, area));
  for (const grupo of agrupar(fueraEntrega, (e) => mapaDe(e.entrega))) {
    for (const e of grupo) pasos.push(parte(e, 'entregar'));
  }
  return pasos;
}

/**
 * Guías de mazmorra por facción, sus avisos y las filas del informe.
 * Entran las mazmorras sin banda, con `niveles.min >= 18` y cuya sigla no está en `excluir`. Por facción,
 * las misiones con esa facción o sin ella, que no son continuación de otra de la misma mazmorra y cuyo
 * nivel mínimo no pasa del máximo de la mazmorra. Sin ninguna, no hay guía y la fila lo dice.
 * @param {{porMazmorra: object}} indice salida de indexarMazmorras
 * @param {{entidades: object, correcciones: object, zonas: object, verificadas?: object, base?: object,
 *   excluir?: string[]}} fuentes `base` (opcional) se copia en `origen` de cada guía
 * @returns {{guias: Map<string, object>, avisos: object[],
 *   filas: Array<{area, nombre, faccion?, misiones?, guia?, motivo?}>}}
 */
export function guiasDeMazmorras(indice, {
  entidades, correcciones, zonas, verificadas = {}, base, excluir = ['RFC', 'WC', 'DM', 'ROL', 'HOT'],
}) {
  const fuentes = { entidades, correcciones, zonas };
  const guias = new Map();
  const avisos = [];
  const filas = [];
  const vistas = Object.fromEntries(FACCIONES.map(([faccion]) => [faccion, crearVista(fuentes, { faccion })]));

  for (const m of Object.values(indice.porMazmorra).sort((a, b) => a.area - b.area)) {
    const base0 = { area: m.area, nombre: m.nombre };
    if (m.banda) { filas.push({ ...base0, motivo: 'banda: no tiene guía de mazmorra' }); continue; }
    if (m.sigla !== undefined && excluir.includes(m.sigla)) {
      filas.push({ ...base0, motivo: `excluida (${m.sigla}): no tiene guía de mazmorra` });
      continue;
    }
    if (!m.niveles || m.niveles.min < NIVEL_MINIMO) {
      filas.push({ ...base0, motivo: `nivel mínimo ${m.niveles?.min ?? 'desconocido'} (< ${NIVEL_MINIMO}): no tiene guía de mazmorra` });
      continue;
    }
    const { min, max } = m.niveles;
    for (const [faccion, letra] of FACCIONES) {
      const entradas = m.misiones.filter((e) => (e.faccion === undefined || e.faccion === faccion)
        && !e.continuacion && e.nivel <= max);
      const fila = { ...base0, faccion, misiones: entradas.length };
      if (entradas.length === 0) {
        filas.push({ ...fila, motivo: 'sin misiones para esta facción: no hay guía' });
        continue;
      }
      const grupo = `Mazmorras SnetForever (${letra})`;
      const nombre = `${dosCifras(min)}-${max} ${m.nombre}`;
      const clave = `${grupo}\\${nombre}`;
      const campos = {
        clave,
        grupo,
        nombre,
        titulo: { en: m.nombre },
        tipo: 'mazmorra',
        faccion,
        niveles: { min, max },
        siguientes: [],
        mazmorras: [],
        fuente: { archivo: FUENTE, linea: 0 },
        sinVerificar: !verificadas[clave],
        area: m.area,
        ...(m.instancia !== undefined ? { instancia: m.instancia } : {}),
        ...(base ? { origen: base } : {}),
      };
      guias.set(clave, ensamblarGuia(campos, pasosDeGuia(vistas[faccion], m.area, entradas)));
      avisos.push({
        id: `mazmorra-${m.area}-${letra}`,
        tipo: 'mazmorra',
        faccion,
        area: m.area,
        nivel: min,
        hasta: max,
        texto: { en: `Dungeon: ${m.nombre}`, es: `Mazmorra: ${m.nombre}` },
        guia: clave,
        hechas: entradas.map((e) => e.q),
        modoHechas: 'todas',
      });
      filas.push({ ...fila, guia: clave });
    }
  }
  return { guias, avisos, filas };
}
