// Reconstrucción de los registros de QuestieDB (misiones, PNJ, objetos, ítems) desde el .toc «baked».
// Reglas: plano 4 §1.5 (filas -S en mapa o array) y §1.6 (máscara de presencia y reglas de ausencia).
import { leerToc } from './toc.js';
import { valorCbor } from './cbor.js';
import {
  ESQUEMA, CAMPOS_ESPERADOS, TIPO_TOC, TABLAS, CADENAS, CONSTANTES, POR_AREA, PARES_NULOS, SIEMPRE_TABLA,
} from './esquema.js';

const CONTRATO = 4;
const MAX_SEGURO = BigInt(Number.MAX_SAFE_INTEGER);
const decodificadorTexto = new TextDecoder('utf-8');

const esBytes = (v) => v instanceof Uint8Array;
const esMapa = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !esBytes(v);

// Valor CBOR -> valor JS plano: cadenas de bytes a texto, BigInt pequeño a Number, mapas con claves
// 1..n a arrays con huecos (null). Los mapas con claves no enteras se dejan como objeto.
function normalizar(v) {
  if (esBytes(v)) return decodificadorTexto.decode(v);
  if (typeof v === 'bigint') return v <= MAX_SEGURO && v >= -MAX_SEGURO ? Number(v) : v;
  if (Array.isArray(v)) return v.map(normalizar);
  if (esMapa(v)) {
    const claves = Object.keys(v);
    if (claves.every((k) => /^[1-9]\d*$/.test(k))) {
      const salida = [];
      const max = Math.max(...claves.map(Number));
      for (let i = 1; i <= max; i++) salida.push(v[i] === undefined ? null : normalizar(v[i]));
      return salida;
    }
    const o = {};
    for (const k of claves) o[k] = normalizar(v[k]);
    return o;
  }
  return v;
}

// Tabla indexada por AreaID: siempre un objeto {areaId: [...]}. La forma array (áreas 1..n) se pasa a objeto.
function porArea(v) {
  if (v === null || v === undefined) return undefined;
  const o = {};
  if (Array.isArray(v)) {
    v.forEach((x, i) => { if (x !== null && x !== undefined) o[i + 1] = normalizar(x); });
  } else if (esMapa(v)) {
    for (const k of Object.keys(v)) o[k] = normalizar(v[k]);
  } else {
    return undefined;
  }
  return Object.keys(o).length ? o : undefined;
}

const vacio = (v) => (Array.isArray(v) ? v.length === 0 : esMapa(v) && Object.keys(v).length === 0);

// Rellena con 0 la posición `pos` (0-based) de la tupla si falta (plano 4 §1.6 punto 5).
function rellenar(tupla, pos) {
  if (!Array.isArray(tupla)) return tupla;
  while (tupla.length <= pos) tupla.push(null);
  if (tupla[pos] === null || tupla[pos] === undefined) tupla[pos] = 0;
  return tupla;
}

// objectives: grupos 1, 2, 3 y 6 llevan el 3.er elemento (icono/ítem), el grupo 5 (crédito de muerte) el 4.º.
function rellenarObjetivos(obj) {
  const posicion = { 0: 2, 1: 2, 2: 2, 4: 3, 5: 2 };
  for (const [g, pos] of Object.entries(posicion)) {
    const grupo = obj[g];
    if (Array.isArray(grupo)) grupo.forEach((t) => rellenar(t, pos));
  }
  return obj;
}

// triggerEnd = {texto, spawnlist}; extraObjectives = lista de {spawnlist?, icono, texto?, índice, refs?}.
function ajustarTablaEspecial(campo, valor) {
  if (campo === 'triggerEnd' && Array.isArray(valor) && valor[1] !== null && valor[1] !== undefined) {
    valor[1] = porArea(valor[1]) ?? null;
  }
  if (campo === 'extraObjectives' && Array.isArray(valor)) {
    for (const e of valor) {
      if (!Array.isArray(e)) continue;
      if (e[0] !== null && e[0] !== undefined) e[0] = porArea(e[0]) ?? null;
      rellenar(e, 3);
    }
  }
  if (campo === 'objectives' && Array.isArray(valor)) rellenarObjetivos(valor);
  return valor;
}

// Elemento `i` (1-based) de una fila escalar, sea mapa (clave i) o array (posición i-1).
function elementoFila(fila, i) {
  const v = Array.isArray(fila) ? fila[i - 1] : fila[i];
  return v === null ? undefined : v;
}

function reconstruir(toc, tipo, id) {
  const esq = ESQUEMA[tipo];
  const prefijo = `X-${TIPO_TOC[tipo]}-${id}`;
  const fila = toc.has(`${prefijo}-S`) ? valorCbor(toc, `${prefijo}-S`) : {};
  const total = esq.length;

  // Todo campo de la fila debe existir en el esquema: si no, el esquema de QuestieDB ha cambiado.
  if (Array.isArray(fila)) {
    if (fila.length > total) throw new Error(`${tipo} ${id}: la fila tiene ${fila.length} campos y el esquema ${total}`);
  } else if (esMapa(fila)) {
    for (const k of Object.keys(fila)) {
      if (k === 'p') continue;
      const n = Number(k);
      if (!Number.isInteger(n) || n < 1 || n > total) throw new Error(`${tipo} ${id}: campo ${k} fuera del esquema (${total} campos)`);
    }
  } else {
    throw new Error(`${tipo} ${id}: la fila -S no es una tabla`);
  }

  const p = (!Array.isArray(fila) && fila.p) || 0;
  const registro = {};
  esq.forEach((campo, idx) => {
    const n = idx + 1;
    const constantes = CONSTANTES[tipo];
    if (constantes && constantes[n] !== undefined) { registro[campo] = constantes[n]; return; }

    if (TABLAS[tipo].includes(n)) {
      let valor;
      if (Math.floor(p / 2 ** (n - 1)) % 2 === 1 && toc.has(`${prefijo}-${n}`)) {
        const crudo = valorCbor(toc, `${prefijo}-${n}`);
        valor = POR_AREA[tipo]?.includes(campo) ? porArea(crudo) : normalizar(crudo);
        valor = ajustarTablaEspecial(campo, valor);
      }
      if (PARES_NULOS.includes(campo) && Array.isArray(valor) && valor[0] === 0 && valor[1] === 0) valor = undefined;
      if (valor === undefined || valor === null || vacio(valor)) {
        if (SIEMPRE_TABLA.includes(campo)) registro[campo] = [];
      } else {
        registro[campo] = valor;
      }
      return;
    }

    const crudo = elementoFila(fila, n);
    if (crudo !== undefined) {
      registro[campo] = normalizar(crudo);
    } else if (!CADENAS[tipo].includes(n)) {
      registro[campo] = 0; // número ausente = 0
    }
  });

  // friendlyToFaction: solo "A", "H", "AH" o nada.
  if (tipo === 'npc' && !['A', 'H', 'AH'].includes(registro.friendlyToFaction)) delete registro.friendlyToFaction;
  return registro;
}

// Lee el .toc y devuelve {meta, quest, npc, object, item}; cada tipo es un Map id -> registro.
export function leerEntidades(rutaToc) {
  const toc = leerToc(rutaToc);
  const contrato = Number(toc.get('X-Contract-Version'));
  if (contrato !== CONTRATO) {
    throw new Error(`contrato de QuestieDB ${toc.get('X-Contract-Version')}: el conversor solo entiende el ${CONTRATO}`);
  }
  for (const tipo of Object.keys(CAMPOS_ESPERADOS)) {
    if (ESQUEMA[tipo].length !== CAMPOS_ESPERADOS[tipo]) {
      throw new Error(`esquema de ${tipo}: ${ESQUEMA[tipo].length} campos, se esperaban ${CAMPOS_ESPERADOS[tipo]}`);
    }
  }
  const salida = {
    meta: { version: toc.get('Version') ?? null, commit: toc.get('X-BUILD-COMMIT') ?? null, contrato },
  };
  for (const tipo of Object.keys(ESQUEMA)) {
    const ids = valorCbor(toc, `X-${TIPO_TOC[tipo]}-IDS`, { zlib: true });
    if (!Array.isArray(ids)) throw new Error(`X-${TIPO_TOC[tipo]}-IDS no es una lista`);
    const mapa = new Map();
    for (const id of ids) mapa.set(id, reconstruir(toc, tipo, id));
    salida[tipo] = mapa;
  }
  return salida;
}
