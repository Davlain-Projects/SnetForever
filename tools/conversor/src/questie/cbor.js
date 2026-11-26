// Decodificador CBOR (RFC 8949), subconjunto que usa QuestieDB (plano 4 §1.5) y acceso a valores del .toc.
import { inflateSync } from 'node:zlib';

const hex = (b) => '0x' + b.toString(16).padStart(2, '0');

function mitad(h) { // float16
  const signo = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return signo * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : signo * Infinity;
  return signo * 2 ** (e - 15) * (1 + f / 1024);
}

// Devuelve: enteros -> Number (BigInt si pasan de MAX_SAFE_INTEGER), cadenas de bytes -> Uint8Array,
// arrays -> Array (null para los huecos), mapas -> objeto con claves texto, null, float16/32/64.
export function decodificarCbor(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;

  const falla = (byte, donde) => new Error(`CBOR: tipo no soportado ${hex(byte)} en la posición ${donde}`);
  const leer = (n) => {
    if (pos + n > buf.length) throw new Error(`CBOR: datos truncados en la posición ${pos}`);
  };

  // Lee el argumento (longitud o valor) según la información adicional.
  function argumento(info, byte, donde) {
    if (info < 24) return info;
    if (info === 24) { leer(1); return buf[pos++]; }
    if (info === 25) { leer(2); const v = buf.readUInt16BE(pos); pos += 2; return v; }
    if (info === 26) { leer(4); const v = buf.readUInt32BE(pos); pos += 4; return v; }
    if (info === 27) {
      leer(8);
      const v = buf.readBigUInt64BE(pos);
      pos += 8;
      return v > BigInt(Number.MAX_SAFE_INTEGER) ? v : Number(v);
    }
    throw falla(byte, donde);
  }

  function longitud(info, byte, donde) {
    const n = argumento(info, byte, donde);
    if (typeof n !== 'number') throw new Error(`CBOR: longitud enorme en la posición ${donde}`);
    return n;
  }

  function elemento() {
    const donde = pos;
    leer(1);
    const byte = buf[pos++];
    const mayor = byte >> 5;
    const info = byte & 0x1f;
    switch (mayor) {
      case 0: return argumento(info, byte, donde);
      case 1: {
        const n = argumento(info, byte, donde);
        return typeof n === 'bigint' ? -1n - n : -1 - n;
      }
      case 2: {
        const n = longitud(info, byte, donde);
        leer(n);
        const trozo = Uint8Array.prototype.slice.call(buf, pos, pos + n);
        pos += n;
        return trozo;
      }
      case 4: {
        const n = longitud(info, byte, donde);
        const a = [];
        for (let i = 0; i < n; i++) a.push(elemento());
        return a;
      }
      case 5: {
        const n = longitud(info, byte, donde);
        const o = {};
        for (let i = 0; i < n; i++) {
          const k = elemento();
          o[typeof k === 'object' && k !== null ? Buffer.from(k).toString('utf8') : String(k)] = elemento();
        }
        return o;
      }
      case 7:
        if (info === 22) return null;
        if (info === 25) { leer(2); const v = mitad(buf.readUInt16BE(pos)); pos += 2; return v; }
        if (info === 26) { leer(4); const v = buf.readFloatBE(pos); pos += 4; return v; }
        if (info === 27) { leer(8); const v = buf.readDoubleBE(pos); pos += 8; return v; }
        throw falla(byte, donde);
      default:
        throw falla(byte, donde); // mayor 3 (texto) y 6 (etiquetas) no aparecen en QuestieDB
    }
  }

  const valor = elemento();
  if (pos !== buf.length) throw new Error(`CBOR: sobran ${buf.length - pos} bytes tras la posición ${pos}`);
  return valor;
}

// Valor de una clave del .toc (ya reensamblada por leerToc): base64, zlib (si se pide) y CBOR. Clave inexistente: undefined.
export function valorCbor(toc, clave, { zlib = false } = {}) {
  const texto = toc.get(clave);
  if (texto === undefined) return undefined;
  let datos = Buffer.from(texto, 'base64');
  if (zlib) datos = inflateSync(datos);
  return decodificarCbor(datos);
}
