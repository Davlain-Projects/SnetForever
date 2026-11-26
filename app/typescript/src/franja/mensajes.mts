// Mensajes de la franja (protocolo P1): lee cada trama y reúne las partes de un mensaje, en bytes, antes de pasarlo a UTF-8.
// Carga de una trama:  SNF1 US pj US id US parte US total US z US r US c US datos   (US = 0x1F)
import { inflateRawSync } from 'node:zlib';

// Deben coincidir con addons/SnetForever/ia/envio.lua (mini franja: 1.300 bytes de datos por parte, 16 partes).
export const DATOS_MAX = 1300;
export const PARTES_MAX = 16;
export const INFLADO_MAX = 64 * 1024;
export const TIEMPO_PARTES = 120_000; // una parte suelta se descarta a los 120 s
export const TIEMPO_REPETIDOS = 24 * 60 * 60 * 1000; // el mismo pj|id no vuelve a valer en 24 h

const US = 0x1f;
const CAMPOS = 9;
const ENTERO = /^\d{1,9}$/;
const decodificador = new TextDecoder('utf-8', { fatal: true });

/**
 * Lee la carga de una trama. Devuelve {pj, id, parte, total, z, r, c, datos: Buffer} o null si no empieza por «SNF1»,
 * le faltan campos o alguno no vale. Los `datos` son lo que queda tras el octavo US, con sus bytes intactos.
 */
export function leerTrama(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) return null;
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  const cortes = [];
  for (let i = 0; i < b.length && cortes.length < CAMPOS - 1; i++) if (b[i] === US) cortes.push(i);
  if (cortes.length < CAMPOS - 1) return null;
  const campo = (k) => b.subarray(k === 0 ? 0 : cortes[k - 1] + 1, cortes[k]);
  if (campo(0).toString('latin1') !== 'SNF1') return null;
  let pj, id;
  try {
    pj = decodificador.decode(campo(1));
    id = decodificador.decode(campo(2));
  } catch {
    return null;
  }
  const numeros = [3, 4, 5, 6, 7].map((k) => campo(k).toString('latin1'));
  if (!numeros.every((t) => ENTERO.test(t))) return null;
  const [parte, total, z, r, c] = numeros.map(Number);
  if (!pj || !id || total < 1 || total > PARTES_MAX || parte < 1 || parte > total || (z !== 0 && z !== 1)) return null;
  return { pj, id, parte, total, z, r, c, datos: Buffer.from(b.subarray(cortes[CAMPOS - 2] + 1)) };
}

// Cuerpo reunido (bytes) → mensaje. z = 1: base64 de deflate crudo.
function aMensaje(cuerpo, z) {
  let bytes = cuerpo;
  if (z === 1) {
    try {
      bytes = inflateRawSync(Buffer.from(cuerpo.toString('latin1'), 'base64'), { maxOutputLength: INFLADO_MAX });
    } catch {
      return { error: 'inflado' };
    }
  }
  try {
    const mensaje = JSON.parse(decodificador.decode(bytes));
    if (mensaje === null || typeof mensaje !== 'object' || Array.isArray(mensaje)) return { error: 'json' };
    return { mensaje };
  } catch {
    return { error: 'json' };
  }
}

/**
 * Reúne las partes de cada mensaje, por «pj|id».
 * anadir(trama) devuelve {pj, id, r, c, mensaje} cuando llega la última parte, {error: 'json'|'inflado', pj, id} si el
 * cuerpo no sirve, y null en cualquier otro caso (faltan partes, parte repetida, mensaje ya entregado en las últimas 24 h).
 */
export function crearReunidor({ ahora = Date.now } = {}) {
  const pendientes = new Map(); // clave → {total, z, desde, partes: Map(parte → Buffer)}
  const entregados = new Map(); // clave → cuándo

  function limpiar(t) {
    for (const [clave, e] of pendientes) if (t - e.desde > TIEMPO_PARTES) pendientes.delete(clave);
    for (const [clave, cuando] of entregados) if (t - cuando >= TIEMPO_REPETIDOS) entregados.delete(clave);
  }

  return {
    anadir(trama) {
      if (!trama) return null;
      const t = ahora();
      limpiar(t);
      const clave = `${trama.pj}|${trama.id}`;
      if (entregados.has(clave)) return null;

      let e = pendientes.get(clave);
      if (e && (e.total !== trama.total || e.z !== trama.z)) {
        pendientes.delete(clave);
        e = undefined;
      }
      if (!e) {
        e = { total: trama.total, z: trama.z, desde: t, partes: new Map() };
        pendientes.set(clave, e);
      }
      if (!e.partes.has(trama.parte)) e.partes.set(trama.parte, trama.datos);
      if (e.partes.size < e.total) return null;

      pendientes.delete(clave);
      entregados.set(clave, t);
      const cuerpo = Buffer.concat(Array.from({ length: e.total }, (_, i) => e.partes.get(i + 1)));
      const { mensaje, error } = aMensaje(cuerpo, e.z);
      if (error) return { error, pj: trama.pj, id: trama.id };
      return { pj: trama.pj, id: trama.id, r: trama.r, c: trama.c, mensaje };
    },
  };
}
