// Clave de firma Ed25519 de las actualizaciones (fase 5, tarea 14; restricción «Clave de firma»).
//
// La privada vive solo en el PC del jugador, en `%USERPROFILE%\.snetforever-firma\clave-privada.dpapi`, protegida con
// DPAPI (CurrentUser, entropía 'SnetForever-firma-1', en dpapi.ps1), aparte de la de TATI. Al lado va
// `clave-publica.pem` (SPKI), que es la que se copia en app/typescript/src/actualizar/clave-publica.mts.
//
// - Una clave que ya existe nunca se regenera: crearClave se niega y no toca nada.
// - El PEM privado (PKCS8) solo existe en memoria: va a DPAPI por stdin y vuelve por stdout. Nunca se escribe en un
//   archivo ni se registra, y este es el único archivo de tools/empaquetar que lo saca (export( con pkcs8).
// - Las pruebas usan SNF_FIRMA_DIR con una carpeta temporal.
import { generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DPAPI_PS1 = join(dirname(fileURLToPath(import.meta.url)), 'dpapi.ps1');
export const ARCHIVO_PRIVADA = 'clave-privada.dpapi';
export const ARCHIVO_PUBLICA = 'clave-publica.pem';

// PowerShell 5.1 con ruta absoluta (nunca se busca en el PATH), como en la app.
const POWERSHELL = join(process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const TIEMPO_MAX = 60_000;
const MAX_STDERR = 500;

/**
 * Error de la clave de firma. `code`:
 * - `'existe'`: ya hay una clave en la carpeta (la privada o la pública); no se crea otra;
 * - `'no-hay'`: no hay clave (falta el archivo que se pide);
 * - `'dpapi'`: PowerShell o DPAPI fallaron (otro usuario de Windows, un blob cambiado…);
 * - `'clave'`: lo guardado no es una clave Ed25519 válida;
 * - `'plataforma'`: DPAPI solo existe en Windows.
 */
export class ErrorFirma extends Error {
  constructor(code, mensaje, opciones) {
    super(mensaje, opciones);
    this.name = 'ErrorFirma';
    this.code = code;
  }
}

/** La carpeta de la clave: `SNF_FIRMA_DIR` si está y, si no, `~/.snetforever-firma`. No crea nada. */
export function carpetaFirma(env = process.env) {
  return env.SNF_FIRMA_DIR || join(homedir(), '.snetforever-firma');
}

// Pasa `bytes` por dpapi.ps1 (stdin y stdout en base64) y devuelve el resultado. Si falla, el mensaje solo lleva el
// stderr del ayudante, nunca lo que salió por stdout.
function dpapi(accion, bytes) {
  if (process.platform !== 'win32') throw new ErrorFirma('plataforma', 'DPAPI solo existe en Windows');
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', DPAPI_PS1, '-Accion', accion], {
    input: bytes.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: TIEMPO_MAX, maxBuffer: 1 << 20,
  });
  if (r.error || r.status !== 0) {
    const detalle = (r.stderr || '').trim().slice(0, MAX_STDERR) || (r.error ? r.error.message : `salió con ${r.status}`);
    throw new ErrorFirma('dpapi', `No se pudo ${accion} con DPAPI: ${detalle}`);
  }
  const salida = Buffer.from(r.stdout.trim(), 'base64');
  if (salida.length === 0) throw new ErrorFirma('dpapi', `No se pudo ${accion} con DPAPI: no devolvió nada`);
  return salida;
}

/**
 * Crea la clave de firma, una sola vez. Si ya existe `clave-privada.dpapi` (o `clave-publica.pem`), lanza ErrorFirma
 * `'existe'` y no toca nada. Si no, genera Ed25519, protege el PEM PKCS8 con DPAPI, comprueba que se puede desproteger
 * y da la misma clave, y escribe `clave-privada.dpapi` (el blob de DPAPI) y `clave-publica.pem`.
 * @param {{env?: object}} [opciones]
 * @returns {{publicaPem: string, carpeta: string}}
 */
export function crearClave({ env = process.env } = {}) {
  const carpeta = carpetaFirma(env);
  const rutaPrivada = join(carpeta, ARCHIVO_PRIVADA);
  const rutaPublica = join(carpeta, ARCHIVO_PUBLICA);
  if (existsSync(rutaPrivada)) throw new ErrorFirma('existe', `Ya hay una clave en ${carpeta}; no se crea otra`);
  // una pública sin su privada tampoco se pisa: puede ser la que ya lleva la app
  if (existsSync(rutaPublica)) throw new ErrorFirma('existe', `Ya hay una clave pública en ${carpeta}; no se crea otra`);

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicaPem = publicKey.export({ type: 'spki', format: 'pem' });
  const pem = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }));
  let vuelta;
  try {
    const protegida = dpapi('proteger', pem);
    vuelta = dpapi('desproteger', protegida);
    if (!vuelta.equals(pem)) throw new ErrorFirma('dpapi', 'DPAPI no devolvió la misma clave al desprotegerla');
    mkdirSync(carpeta, { recursive: true });
    // 'wx': si otra ejecución la creó entre medias, falla en vez de pisarla
    try {
      writeFileSync(rutaPrivada, protegida, { flag: 'wx' });
    } catch (e) {
      if (e.code === 'EEXIST') throw new ErrorFirma('existe', `Ya hay una clave en ${carpeta}; no se crea otra`, { cause: e });
      throw e;
    }
    writeFileSync(rutaPublica, publicaPem, { flag: 'wx' });
  } finally {
    pem.fill(0);
    if (vuelta) vuelta.fill(0);
  }
  return { publicaPem, carpeta };
}

/**
 * Carga la clave privada: lee `clave-privada.dpapi`, la desprotege con DPAPI (por stdout, nunca a un archivo) y la
 * convierte en KeyObject. No escribe ni registra nunca el PEM privado.
 * @param {{env?: object}} [opciones]
 * @returns {import('node:crypto').KeyObject}
 */
export function cargarClavePrivada({ env = process.env } = {}) {
  const ruta = join(carpetaFirma(env), ARCHIVO_PRIVADA);
  if (!existsSync(ruta)) throw new ErrorFirma('no-hay', `No hay clave privada en ${ruta}`);
  const pem = dpapi('desproteger', readFileSync(ruta));
  try {
    let clave;
    try {
      clave = createPrivateKey({ key: pem, format: 'pem' });
    } catch {
      throw new ErrorFirma('clave', `${ruta} no guarda una clave privada válida`);
    }
    if (clave.type !== 'private' || clave.asymmetricKeyType !== 'ed25519') {
      throw new ErrorFirma('clave', `${ruta} no guarda una clave privada Ed25519`);
    }
    return clave;
  } finally {
    pem.fill(0);
  }
}

/**
 * Los bytes DER (SPKI) de una clave pública en PEM: así se comparan dos claves aunque cambien los saltos de línea o los
 * espacios del final (revisión final, I1: lo usan publicar.mjs e instalador.mjs). null si no se entiende.
 * @param {string} pem
 * @returns {Buffer|null}
 */
export function derClavePublica(pem) {
  try {
    return createPublicKey(String(pem)).export({ type: 'spki', format: 'der' });
  } catch {
    return null;
  }
}

/**
 * La clave pública (PEM SPKI) de `clave-publica.pem`, comprobada: tiene que ser una pública Ed25519.
 * @param {{env?: object}} [opciones]
 * @returns {string}
 */
export function clavePublica({ env = process.env } = {}) {
  const ruta = join(carpetaFirma(env), ARCHIVO_PUBLICA);
  if (!existsSync(ruta)) throw new ErrorFirma('no-hay', `No hay clave pública en ${ruta}`);
  const pem = readFileSync(ruta, 'utf8');
  let clave;
  try {
    if (!/^-----BEGIN PUBLIC KEY-----\r?\n/.test(pem)) throw new Error('no es un PEM público');
    clave = createPublicKey(pem);
  } catch {
    throw new ErrorFirma('clave', `${ruta} no guarda una clave pública válida`);
  }
  if (clave.type !== 'public' || clave.asymmetricKeyType !== 'ed25519') {
    throw new ErrorFirma('clave', `${ruta} no guarda una clave pública Ed25519`);
  }
  return pem;
}
