// Troceado de entradas de datos en archivos Lua pequeños, para no pasar los límites de Lua 5.1
// (en particular, las constantes por función: cada archivo es un único chunk).
import { aLua } from './lua.js';

const ENTERO_CLAVE = /^(0|-?[1-9][0-9]*)$/;

// Reserva para la cabecera `local T = <destino>`: el nombre T y las partes del destino
// (p. ej. SNF_MISIONES y quest) también son constantes de la función.
const RESERVA_CONSTANTES = 8;
const RESERVA_BYTES = 256;

function claveConstante(clave) {
  return typeof clave === 'number' ? `n:${clave}` : `s:${clave}`;
}

/**
 * Estimación por exceso de las constantes que Lua creará en la función del archivo:
 * cadenas y números distintos (con prefijo de tipo para no mezclar "1" y 1), incluidas las
 * claves de objeto no enteras (cadenas) y las claves enteras que se escriben como `[n]=`
 * (números). Los arrays densos no generan constantes por sus índices; los arrays con huecos
 * sí. Los booleanos no son constantes de número ni de cadena, y null/undefined se omiten.
 * Es una estimación: Lua además reutiliza constantes iguales, así que nunca se queda corta.
 */
export function constantesDe(valor, destino = new Set()) {
  switch (typeof valor) {
    case 'string':
      destino.add(`s:${valor}`);
      break;
    case 'number':
      destino.add(`n:${valor}`);
      break;
    case 'bigint':
      destino.add(`n:${valor}`);
      break;
    case 'object':
      if (valor === null) break;
      if (Array.isArray(valor)) {
        const elementos = Array.from(valor);
        const hayHuecos = elementos.some((v) => v === undefined || v === null);
        elementos.forEach((v, i) => {
          if (v === undefined || v === null) return;
          if (hayHuecos) destino.add(`n:${i + 1}`);
          constantesDe(v, destino);
        });
      } else {
        for (const [k, v] of Object.entries(valor)) {
          if (v === undefined || v === null) continue;
          destino.add(ENTERO_CLAVE.test(k) ? `n:${k}` : `s:${k}`);
          constantesDe(v, destino);
        }
      }
      break;
    default:
      break;
  }
  return destino;
}

function lineaLua(clave, valor) {
  return `T[${aLua(clave)}]=${aLua(valor)}\n`;
}

/** Genera el texto de un archivo Lua: `local T = <destino>` y una línea por entrada. */
export function archivoLua(destino, entradas) {
  let texto = `local T = ${destino}\n`;
  for (const [clave, valor] of entradas) texto += lineaLua(clave, valor);
  return texto;
}

/**
 * Reparte las entradas en trozos conservando el orden. Abre un trozo nuevo cuando añadir la
 * entrada pasaría maxBytes o maxConstantes. Si una sola entrada ya pasa un límite, lanza error.
 */
export function trocear(entradas, { maxBytes = 500000, maxConstantes = 50000 } = {}) {
  const trozos = [];
  let actual = [];
  let constantes = new Set();
  let bytes = RESERVA_BYTES;

  const reiniciar = () => {
    actual = [];
    constantes = new Set();
    bytes = RESERVA_BYTES;
  };

  for (const [clave, valor] of entradas) {
    const propias = constantesDe(valor);
    propias.add(claveConstante(clave));
    const bytesEntrada = Buffer.byteLength(lineaLua(clave, valor));

    if (bytesEntrada + RESERVA_BYTES > maxBytes || propias.size + RESERVA_CONSTANTES > maxConstantes) {
      throw new Error(
        `La entrada con clave ${clave} no cabe en un solo archivo `
        + `(${bytesEntrada} bytes, ${propias.size} constantes; límites ${maxBytes} y ${maxConstantes})`,
      );
    }

    let nuevas = 0;
    for (const c of propias) if (!constantes.has(c)) nuevas += 1;
    const pasa = bytes + bytesEntrada > maxBytes
      || constantes.size + nuevas + RESERVA_CONSTANTES > maxConstantes;
    if (pasa && actual.length > 0) {
      trozos.push(actual);
      reiniciar();
    }

    actual.push([clave, valor]);
    for (const c of propias) constantes.add(c);
    bytes += bytesEntrada;
  }
  if (actual.length > 0) trozos.push(actual);
  return trozos;
}
