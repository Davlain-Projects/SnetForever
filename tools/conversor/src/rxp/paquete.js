// Paquete de texto para importar guías RXP desde el propio juego (Mis guías → Importar guías RXP).
//
// El juego no puede leer archivos: el jugador pega el paquete en una ventana del addon. El paquete lleva las guías ya
// convertidas, en el mismo formato y con el mismo serializador (aLua) que el addon SnetForever_RutasRXP: claves «RXP\…»,
// ids de paso, filtros, requisitos, eventos, variantes (con su alias) y la ruta original. El addon lo lee como datos con
// un analizador propio de tablas literales (motor/importar-rxp.lua) y nunca lo ejecuta.
//
// Transporte: el texto Lua solo lleva caracteres ASCII imprimibles. Los bytes no ASCII, los de control y «|» (que el
// cuadro de texto del juego trata como código de color) van como escapes decimales de Lua «\ddd» de tres cifras, que
// también lee el analizador del addon. Se trocea en partes de una línea:
//
//   SNFRXP1:<id>:<k>:<n>:<suma del paquete>:<suma de la parte>:<trozo>
//
// id: 8 cifras hexadecimales del SHA-256 del texto entero; las sumas son Adler-32 en 8 cifras hexadecimales. Sin todas
// las partes, con una suma que no cuadra o con un dato que no se entiende, el addon no importa nada.
import { createHash } from 'node:crypto';
import { aLua } from '../salida/lua.js';
import { indexar } from '../escribir/rutas.js';

export const CABECERA = 'SNFRXP1';
export const FORMATO = 1;
export const TAMANO_PARTE = 100000;
const MAX_TEXTO = 4000000; // Límite del importador del juego por personaje.

/** Adler-32 de los bytes de `texto` (ASCII), en 8 cifras hexadecimales. */
export function adler32(texto) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < texto.length; i++) {
    a = (a + texto.charCodeAt(i)) % 65521;
    b = (b + a) % 65521;
  }
  return (b * 65536 + a).toString(16).padStart(8, '0');
}

/** El Lua de aLua con los bytes no imprimibles, no ASCII y «|» como «\ddd». Solo pueden estar dentro de cadenas. */
export function aLuaAscii(valor) {
  const bytes = Buffer.from(aLua(valor), 'utf8');
  let salida = '';
  for (const byte of bytes) {
    salida += byte < 32 || byte > 126 || byte === 124 ? `\\${String(byte).padStart(3, '0')}` : String.fromCharCode(byte);
  }
  return salida;
}

function claveDe(guias, alias, clave) {
  return guias.has(clave) || Object.hasOwn(alias, clave);
}

/** Las claves a las que llevan las guías del paquete y que no están en él (las de otro paquete o del addon instalado). */
function destinosFuera(guias, alias) {
  const fuera = new Set();
  const mirar = (lista) => {
    for (const s of lista ?? []) if (s.clave && !claveDe(guias, alias, s.clave)) fuera.add(s.clave);
  };
  for (const guia of guias.values()) {
    mirar(guia.siguientes);
    for (const paso of guia.pasos) for (const el of paso.elementos) mirar(el.siguientes);
  }
  return [...fuera].sort();
}

/**
 * Crea el paquete de `guias` (Map clave → guía en formato de la fase 1, ya con las claves «RXP\…»).
 * Devuelve {id, suma, texto, partes, resumen}.
 */
export function crearPaquete(guias, { version, tamanoParte = TAMANO_PARTE } = {}) {
  if (guias.size === 0) throw new Error('El paquete no lleva ninguna guía.');
  if (!Number.isInteger(tamanoParte) || tamanoParte < 1 || tamanoParte > TAMANO_PARTE) {
    throw new Error(`El tamaño de parte debe estar entre 1 y ${TAMANO_PARTE} caracteres.`);
  }
  const { grupos, alias } = indexar(guias, []);
  const pasos = [...guias.values()].reduce((total, g) => total + g.pasos.length, 0);
  const resumen = { guias: guias.size, pasos, grupos: Object.keys(grupos).sort(), fuera: destinosFuera(guias, alias) };
  const datos = { f: FORMATO, esquema: 1, version, guias: Object.fromEntries(guias), alias, resumen };
  const texto = aLuaAscii(datos);
  if (texto.length > MAX_TEXTO) {
    throw new Error(`El paquete tiene ${texto.length} caracteres y el juego admite ${MAX_TEXTO}. Elige menos guías.`);
  }
  const id = createHash('sha256').update(texto).digest('hex').slice(0, 8);
  const suma = adler32(texto);
  const total = Math.max(1, Math.ceil(texto.length / tamanoParte));
  if (total > 99) throw new Error(`El paquete necesita ${total} partes; elige menos guías (máximo 99 partes).`);
  const partes = [];
  for (let k = 0; k < total; k++) {
    const trozo = texto.slice(k * tamanoParte, (k + 1) * tamanoParte);
    partes.push(`${CABECERA}:${id}:${k + 1}:${total}:${suma}:${adler32(trozo)}:${trozo}`);
  }
  return { id, suma, texto, partes, resumen };
}
