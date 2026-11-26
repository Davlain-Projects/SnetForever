// Marcas de origen: la IA nunca escribe coordenadas; las herramientas de solo lectura dan cada punto del mapa con una
// marca, la IA cita marcas y la app las vuelve a convertir en coordenadas. Módulo puro (sin disco ni red).
//   B:q<q>:r      punto donde se recoge la misión q          B:q<q>:e   donde se entrega
//   B:q<q>:o<k>   el objetivo k de la misión q: el k-ésimo punto de objetivo (desde 1) en el orden en que
//                 puntosDeMision los devuelve (con {conObjetivo: true})
//   B:n<id>       un PNJ                                     B:e<area>  la entrada de la mazmorra `area`
//   G:<id>:<n>    el paso n de una guía de la biblioteca (id: 8 hexadecimales en minúscula)
import { elemento } from '../base/leer-lua.mjs';
import { puntoRepresentativo, puntosDeMision } from '../base/puntos.mjs';

const PAPELES = { r: 'recoger', e: 'entregar' };
const LETRAS = { recoger: 'r', entregar: 'e' };

export const marcaMision = (q, papel, k?: any) => (papel === 'objetivo' ? `B:q${q}:o${k}` : `B:q${q}:${LETRAS[papel]}`);
export const marcaPnj = (id) => `B:n${id}`;
export const marcaEntrada = (area) => `B:e${area}`;
export const marcaGuia = (id, n) => `G:${id}:${n}`;

const ENTERO = '[1-9][0-9]{0,9}';
const RE_MISION = new RegExp(`^B:q(${ENTERO}):(?:([re])|o(${ENTERO}))$`);
const RE_PNJ = new RegExp(`^B:n(${ENTERO})$`);
const RE_ENTRADA = new RegExp(`^B:e(${ENTERO})$`);
const RE_GUIA = new RegExp(`^G:([0-9a-f]{8}):(${ENTERO})$`);

/** Texto de una marca -> su significado, o null si no tiene exactamente uno de los formatos de arriba. */
export function leerMarca(texto) {
  if (typeof texto !== 'string') return null;
  let m = RE_MISION.exec(texto);
  if (m) {
    return m[2]
      ? { tipo: 'mision', q: Number(m[1]), papel: PAPELES[m[2]] }
      : { tipo: 'mision', q: Number(m[1]), papel: 'objetivo', k: Number(m[3]) };
  }
  if ((m = RE_PNJ.exec(texto))) return { tipo: 'pnj', id: Number(m[1]) };
  if ((m = RE_ENTRADA.exec(texto))) return { tipo: 'entrada', area: Number(m[1]) };
  if ((m = RE_GUIA.exec(texto))) return { tipo: 'guia', id: m[1], n: Number(m[2]) };
  return null;
}

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const enRango = (v) => esNumero(v) && v >= 0 && v <= 100;

// {mapa, x, y, texto, origen} o null si el mapa no es un número positivo o x, y no están en 0-100.
function resultado(mapa, x, y, texto, origen) {
  if (!esNumero(mapa) || mapa <= 0 || !enRango(x) || !enRango(y)) return null;
  return { mapa, x, y, texto, origen };
}

// Los sitios de un objetivo (los de puntosDeMision con conSitios), solo los que están en 0-100: con menos de dos, nada.
function conSitios(r, sitios) {
  if (!r || !Array.isArray(sitios)) return r;
  const buenos = sitios.filter((s) => Array.isArray(s) && enRango(s[0]) && enRango(s[1])).map(([x, y]) => [x, y]);
  return buenos.length >= 2 ? { ...r, sitios: buenos } : r;
}

/** Marca -> punto {mapa, x, y, texto, origen: {tipo: 'base' | 'guia', archivo?, paso?}, sitios?} o null (marca mal
 *  escrita, desconocida o sin punto válido). `idioma` solo afecta al texto. En una guía, `archivo` es el id de la guía.
 *  `sitios` ([[x, y], …], en `mapa`): solo en B:q<q>:o<k> con dos sitios o más en la base (la zona de matar; la usa el
 *  círculo de los dibujos de la IA). */
export function puntoDeMarca(marca, { base, pj, mapaJugador, idioma = 'es', pasoDeGuia }: {
  base?: any;
  pj?: any;
  mapaJugador?: any;
  idioma?: string;
  pasoDeGuia?: any;
} = {}) {
  const m = typeof marca === 'string' ? leerMarca(marca) : marca;
  if (!m) return null;
  const origenBase = { tipo: 'base' };
  if (m.tipo === 'mision') {
    const puntos = puntosDeMision(base, m.q, pj, idioma, mapaJugador, { conObjetivo: true, conSitios: true });
    const p = m.papel === 'objetivo'
      ? puntos.filter((x) => x.papel === 'objetivo')[m.k - 1]
      : puntos.find((x) => x.papel === m.papel);
    return p ? conSitios(resultado(p.mapa, p.x, p.y, p.texto, origenBase), p.sitios) : null;
  }
  if (m.tipo === 'pnj') {
    const npc = base.npc(m.id, pj);
    if (!npc) return null;
    const p = puntoRepresentativo(npc.spawns, mapaJugador);
    return p ? resultado(p.mapa, p.x, p.y, base.nombre('npc', m.id, idioma), origenBase) : null;
  }
  if (m.tipo === 'entrada') {
    const mazmorra = base.mazmorra(m.area);
    if (!mazmorra) return null;
    const lista = [];
    for (let i = 1; elemento(mazmorra.entradas, i) !== undefined; i++) lista.push(elemento(mazmorra.entradas, i));
    const conMapa = lista.map((e) => ({ ...e, mapa: e?.mapa > 0 ? e.mapa : base.uiDeArea(e?.zona) }));
    const e = conMapa.find((c) => c.mapa === mapaJugador) ?? conMapa[0];
    const texto = (idioma === 'en' ? 'Entrance to ' : 'Entrada de ') + (mazmorra.nombre ?? `#${m.area}`);
    return e ? resultado(e.mapa, e.x, e.y, texto, origenBase) : null;
  }
  // guía
  const paso = pasoDeGuia?.(m.id, m.n);
  if (!paso?.punto) return null;
  const r = resultado(paso.punto.mapa, paso.punto.x, paso.punto.y, paso.texto ?? '', { tipo: 'guia', archivo: m.id, paso: m.n });
  // El texto del paso en inglés, si la guía lo trae (lo usa guiaNueva para el `en` de la nota).
  return r && typeof paso.textoEn === 'string' && paso.textoEn !== '' ? { ...r, textoEn: paso.textoEn } : r;
}
