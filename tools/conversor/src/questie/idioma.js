// Español de QuestieDB (plano 4 §4): bloques `X-l10n-<locale>-<Tipo>`, columnas alineadas por posición con `X-<Tipo>-IDS`.
// Campo a campo: esES y, si no hay, esMX; si falta en ambos, el campo no aparece.
import { valorCbor } from './cbor.js';
import { ESQUEMA, TIPO_TOC } from './esquema.js';

const decodificador = new TextDecoder('utf-8');

// Campos traducidos por tipo, en el orden de las columnas del bloque (plano 4 §4).
const COLUMNAS = {
  quest: [{ campo: 'name' }, { campo: 'objectivesText', lista: true }],
  npc: [{ campo: 'name' }, { campo: 'subName' }],
  object: [{ campo: 'name' }],
  item: [{ campo: 'name' }],
};

const LOCALES = ['esES', 'esMX']; // por orden de preferencia

const esBytes = (v) => v instanceof Uint8Array;
const texto = (v) => (esBytes(v) ? decodificador.decode(v) : v);

const esMapa = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !esBytes(v);

// Elemento k (desde 0, la posición en X-<Tipo>-IDS) de una tabla de Lua llegada por CBOR. Sin huecos llega como array
// (posición k); con huecos, como mapa con las claves de Lua, que empiezan en 1 (clave k + 1). Ronda 1 del lote B: antes
// se leía el mapa con la clave k y cada valor caía en el id anterior (es.object y el subName de es.npc, corridos un id).
function enPosicion(tabla, k) {
  if (Array.isArray(tabla)) return tabla[k];
  return esMapa(tabla) ? tabla[k + 1] : undefined;
}

// Una lista de Lua (array, o mapa de claves 1..n con huecos) como array de JS en orden, sin los huecos.
function comoLista(v) {
  if (Array.isArray(v)) return v.filter((l) => l !== null && l !== undefined);
  if (!esMapa(v)) return undefined;
  return Object.keys(v).filter((k) => /^[1-9]\d*$/.test(k)).map(Number).sort((a, b) => a - b)
    .map((k) => v[k]).filter((l) => l !== null && l !== undefined);
}

// Valor de una celda ya decodificado, o undefined si es hueco, vacío o no existe.
function celda(columna, k, lista) {
  const v = enPosicion(columna, k);
  if (v === null || v === undefined) return undefined;
  if (lista) {
    const lineas = comoLista(v)?.map(texto);
    return lineas && lineas.length > 0 ? lineas : undefined;
  }
  const t = texto(v);
  return typeof t === 'string' && t !== '' ? t : undefined;
}

// Columnas de idioma de un tipo: los id y, por locale, el bloque de columnas.
function bloquesDe(toc, tipo) {
  const tipoToc = TIPO_TOC[tipo];
  const ids = valorCbor(toc, `X-${tipoToc}-IDS`, { zlib: true });
  if (!Array.isArray(ids)) throw new Error(`X-${tipoToc}-IDS no es una lista`);
  const bloques = LOCALES.map((loc) => {
    const clave = `X-l10n-${loc}-${tipoToc}`;
    const bloque = valorCbor(toc, clave, { zlib: true });
    if (!Array.isArray(bloque)) throw new Error(`falta el bloque de idioma ${clave}`);
    return bloque;
  });
  return { ids, bloques };
}

/**
 * Validación general (ronda 1 del lote B): en cada columna de texto, cuántos id traen esES y esMX y en cuántos dicen lo
 * mismo. Los dos son casi siempre iguales, así que una columna leída corrida (cada valor en otro id) se queda muy por
 * debajo; `corrida` es la proporción si se comparase con el id siguiente, la referencia de una columna corrida.
 * @returns {Array<{tipo, campo, comunes, iguales, proporcion, corrida}>}
 */
export function alineacionEsESMX(toc) {
  const salida = [];
  for (const tipo of Object.keys(ESQUEMA)) {
    const { ids, bloques } = bloquesDe(toc, tipo);
    COLUMNAS[tipo].forEach(({ campo, lista }, c) => {
      let comunes = 0;
      let iguales = 0;
      let comunesCorrida = 0;
      let igualesCorrida = 0;
      for (let k = 0; k < ids.length; k++) {
        const [es, mx] = bloques.map((b) => celda(b[c], k, lista));
        if (es !== undefined && mx !== undefined) {
          comunes++;
          if (JSON.stringify(es) === JSON.stringify(mx)) iguales++;
        }
        // La referencia: esES contra el esMX del id siguiente, que es lo que daría una columna corrida un id.
        const mxSiguiente = celda(bloques[1][c], k + 1, lista);
        if (es !== undefined && mxSiguiente !== undefined) {
          comunesCorrida++;
          if (JSON.stringify(es) === JSON.stringify(mxSiguiente)) igualesCorrida++;
        }
      }
      salida.push({
        tipo, campo, comunes, iguales, proporcion: comunes > 0 ? iguales / comunes : 0,
        corrida: comunesCorrida > 0 ? igualesCorrida / comunesCorrida : 0,
      });
    });
  }
  return salida;
}

export function leerEspanol(toc) {
  const version = toc.get('X-l10n-Version');
  if (version !== '1') {
    throw new Error(`X-l10n-Version no soportada: se esperaba "1" y hay ${version === undefined ? 'nada' : `"${version}"`}`);
  }

  const resultado = { quest: new Map(), npc: new Map(), object: new Map(), item: new Map() };

  for (const tipo of Object.keys(ESQUEMA)) {
    const { ids, bloques } = bloquesDe(toc, tipo);

    COLUMNAS[tipo].forEach(({ campo, lista }, c) => {
      for (let k = 0; k < ids.length; k++) {
        let valor;
        for (const bloque of bloques) {
          valor = celda(bloque[c], k, lista);
          if (valor !== undefined) break; // objectivesText: lista entera de un solo idioma
        }
        if (valor === undefined) continue;
        const id = ids[k];
        let reg = resultado[tipo].get(id);
        if (!reg) resultado[tipo].set(id, (reg = {}));
        reg[campo] = valor;
      }
    });
  }
  return resultado;
}
