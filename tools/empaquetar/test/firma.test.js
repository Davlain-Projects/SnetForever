// Pruebas de la clave de firma (fase 5, tarea 14): se crea una vez, se guarda con DPAPI (CurrentUser) y nunca se
// regenera; la firma la verifica la app (verificarFirma de la tarea 5) con la pública.
//
// Todas las claves de estas pruebas viven en carpetas temporales (SNF_FIRMA_DIR=<tmp>\fírma): nunca se toca la carpeta
// de verdad (%USERPROFILE%\.snetforever-firma). Las pruebas de DPAPI solo corren en Windows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { carpetaFirma, crearClave, cargarClavePrivada, clavePublica, ErrorFirma, DPAPI_PS1 } from '../src/firma/clave.mjs';
import { firmarBytes } from '../src/firma/firmar.mjs';
import { verificarFirma } from '../../../app/src/actualizar/manifiesto.mjs';

const EMPAQUETAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOLO_WINDOWS = { skip: process.platform !== 'win32' };
const PRIVADA = 'clave-privada.dpapi';
const PUBLICA = 'clave-publica.pem';

// Una carpeta de firma nueva, con tilde, dentro de una carpeta temporal que se quita al acabar la prueba.
function carpetaDePrueba(t) {
  const raiz = mkdtempSync(join(tmpdir(), 'snf-clave-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  const carpeta = join(raiz, 'fírma');
  // revisión final (M3 de la tarea 14): una guarda por si alguna vez la carpeta de prueba acabara siendo la de verdad
  assert.notEqual(carpetaFirma({ SNF_FIRMA_DIR: carpeta }).toLowerCase(), join(homedir(), '.snetforever-firma').toLowerCase());
  return { raiz, carpeta, env: { SNF_FIRMA_DIR: carpeta } };
}

// Todos los archivos que hay bajo `dir`, con sus bytes.
function contenidos(dir) {
  const salida = {};
  if (!existsSync(dir)) return salida;
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) Object.assign(salida, contenidos(ruta));
    else salida[ruta] = readFileSync(ruta);
  }
  return salida;
}

function contienePrivada(bytes) {
  return Buffer.from(bytes).includes('PRIVATE KEY') || Buffer.from(bytes).includes('BEGIN');
}

// `npm run firma:crear` con la carpeta de firma que se le pase (siempre una temporal).
function npmCrear(carpeta) {
  return spawnSync('npm run firma:crear', {
    cwd: EMPAQUETAR, shell: true, encoding: 'utf8', windowsHide: true, timeout: 120_000,
    env: { ...process.env, SNF_FIRMA_DIR: carpeta },
  });
}

test('carpetaFirma: SNF_FIRMA_DIR si está y, si no, ~/.snetforever-firma (sin crear nada)', () => {
  assert.equal(carpetaFirma({ SNF_FIRMA_DIR: 'C:\\x\\fírma' }), 'C:\\x\\fírma');
  assert.equal(carpetaFirma({}), join(homedir(), '.snetforever-firma'));
  assert.equal(carpetaFirma({ SNF_FIRMA_DIR: '' }), join(homedir(), '.snetforever-firma'));
});

test('firmarBytes: base64 de la firma Ed25519 y un salto de línea; la app la verifica con la pública', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const bytes = Buffer.from('{"esquema":1,"producto":"SnetForever"}');
  const firma = firmarBytes(bytes, privateKey);
  assert.equal(typeof firma, 'string');
  assert.match(firma, /^[A-Za-z0-9+/]+={0,2}\n$/);
  assert.equal(Buffer.from(firma.trimEnd(), 'base64').length, 64);
  assert.equal(verificarFirma(bytes, firma, pem), true);
  // un byte cambiado ya no vale
  const otro = Buffer.from(bytes);
  otro[0] ^= 1;
  assert.equal(verificarFirma(otro, firma, pem), false);
});

test('firmarBytes: solo bytes y una clave privada Ed25519 como KeyObject (ni PEM ni la pública ni otra curva)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  assert.throws(() => firmarBytes('texto', privateKey), TypeError);
  assert.throws(() => firmarBytes(Buffer.from('x'), publicKey), TypeError);
  assert.throws(() => firmarBytes(Buffer.from('x'), ec), TypeError);
  assert.throws(() => firmarBytes(Buffer.from('x'), '-----BEGIN PUBLIC KEY-----'), TypeError);
  assert.throws(() => firmarBytes(Buffer.from('x'), null), TypeError);
  assert.match(firmarBytes(new Uint8Array([1, 2, 3]), privateKey), /\n$/);
});

test('dpapi.ps1: solo ASCII y nunca escribe archivos', () => {
  const texto = readFileSync(DPAPI_PS1, 'utf8');
  // PowerShell 5.1 lee un .ps1 sin BOM como ANSI
  assert.ok(!/[^\x00-\x7f]/.test(texto), 'dpapi.ps1 tiene caracteres que no son ASCII');
  const codigo = texto.replace(/<#[\s\S]*?#>/g, '').replace(/#[^\n]*/g, '');
  for (const prohibido of [/Out-File/i, /Set-Content/i, /Add-Content/i, /WriteAll/i, /New-Item/i, /Copy-Item/i, /Move-Item/i,
    /\[IO\.File\]/i, /FileStream/i, /StreamWriter/i, />/]) {
    assert.ok(!prohibido.test(codigo), `dpapi.ps1 contiene ${prohibido}`);
  }
  assert.match(codigo, /ProtectedData/);
  assert.match(codigo, /Add-Type -AssemblyName System\.Security/);
  assert.match(codigo, /CurrentUser/);
  assert.match(codigo, /\[Text\.Encoding\]::UTF8\.GetBytes\('SnetForever-firma-1'\)/);
});

test('crearClave: escribe clave-privada.dpapi (sin el PEM) y clave-publica.pem', SOLO_WINDOWS, (t) => {
  const { carpeta, env } = carpetaDePrueba(t);
  const r = crearClave({ env });
  assert.equal(r.carpeta, carpeta);
  assert.ok(existsSync(join(carpeta, PRIVADA)), 'falta clave-privada.dpapi');
  assert.ok(existsSync(join(carpeta, PUBLICA)), 'falta clave-publica.pem');
  assert.deepEqual(readdirSync(carpeta).sort(), [PRIVADA, PUBLICA]);
  const privada = readFileSync(join(carpeta, PRIVADA));
  assert.ok(!privada.includes('PRIVATE KEY'), 'clave-privada.dpapi contiene el PEM privado');
  assert.ok(!contienePrivada(privada));
  assert.ok(privada.length > 100, 'el blob de DPAPI es demasiado corto');
  assert.equal(readFileSync(join(carpeta, PUBLICA), 'utf8'), r.publicaPem);
  assert.match(r.publicaPem, /^-----BEGIN PUBLIC KEY-----\r?\n/);
  const pub = createPublicKey(r.publicaPem);
  assert.equal(pub.type, 'public');
  assert.equal(pub.asymmetricKeyType, 'ed25519');
  assert.equal(clavePublica({ env }), r.publicaPem);
});

test('crearClave una segunda vez: «existe» y los dos archivos siguen igual, byte a byte', SOLO_WINDOWS, (t) => {
  const { carpeta, env } = carpetaDePrueba(t);
  crearClave({ env });
  const antes = contenidos(carpeta);
  const tiempos = Object.keys(antes).map((r) => statSync(r).mtimeMs);
  assert.throws(() => crearClave({ env }), (e) => e instanceof ErrorFirma && e.code === 'existe');
  assert.deepEqual(contenidos(carpeta), antes);
  assert.deepEqual(Object.keys(antes).map((r) => statSync(r).mtimeMs), tiempos);
});

test('crearClave: con solo la pública en la carpeta tampoco crea otra (no la pisa)', SOLO_WINDOWS, (t) => {
  const { carpeta, env } = carpetaDePrueba(t);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, PUBLICA), 'pública vieja\n');
  assert.throws(() => crearClave({ env }), (e) => e instanceof ErrorFirma && e.code === 'existe');
  assert.deepEqual(readdirSync(carpeta), [PUBLICA]);
  assert.equal(readFileSync(join(carpeta, PUBLICA), 'utf8'), 'pública vieja\n');
});

test('firmarBytes con cargarClavePrivada: el verificarFirma de la app da verdadero con la pública', SOLO_WINDOWS, (t) => {
  const { env } = carpetaDePrueba(t);
  const { publicaPem } = crearClave({ env });
  const clave = cargarClavePrivada({ env });
  assert.equal(clave.type, 'private');
  assert.equal(clave.asymmetricKeyType, 'ed25519');
  const bytes = Buffer.from('{"esquema":1,"producto":"SnetForever","publicacion":"v0.5.0-2026.11.10.1"}');
  const firma = firmarBytes(bytes, clave);
  assert.equal(verificarFirma(bytes, firma, publicaPem), true);
  assert.equal(verificarFirma(bytes, firma, clavePublica({ env })), true);
  // con otra pública, no
  const otra = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.equal(verificarFirma(bytes, firma, otra), false);
});

test('el PEM privado no se escribe ni se registra nunca (ni en la carpeta ni en la consola)', SOLO_WINDOWS, (t) => {
  const { raiz, env } = carpetaDePrueba(t);
  const dicho = [];
  const originales = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  const escribirOut = process.stdout.write;
  const escribirErr = process.stderr.write;
  for (const k of Object.keys(originales)) console[k] = (...a) => dicho.push(a.join(' '));
  process.stdout.write = (c, ...r) => (dicho.push(String(c)), escribirOut.call(process.stdout, c, ...r));
  process.stderr.write = (c, ...r) => (dicho.push(String(c)), escribirErr.call(process.stderr, c, ...r));
  try {
    crearClave({ env });
    cargarClavePrivada({ env });
    clavePublica({ env });
  } finally {
    Object.assign(console, originales);
    process.stdout.write = escribirOut;
    process.stderr.write = escribirErr;
  }
  assert.ok(!dicho.some((x) => x.includes('PRIVATE KEY')), 'se registró el PEM privado');
  for (const [ruta, bytes] of Object.entries(contenidos(raiz))) assert.ok(!bytes.includes('PRIVATE KEY'), `${ruta} contiene el PEM privado`);
});

test('cargarClavePrivada y clavePublica sin clave: «no-hay», sin crear la carpeta', SOLO_WINDOWS, (t) => {
  const { carpeta, env } = carpetaDePrueba(t);
  assert.throws(() => cargarClavePrivada({ env }), (e) => e instanceof ErrorFirma && e.code === 'no-hay');
  assert.throws(() => clavePublica({ env }), (e) => e instanceof ErrorFirma && e.code === 'no-hay');
  assert.equal(existsSync(carpeta), false);
});

test('cargarClavePrivada con el blob de DPAPI cambiado: «dpapi», sin el contenido en el mensaje', SOLO_WINDOWS, (t) => {
  const { carpeta, env } = carpetaDePrueba(t);
  crearClave({ env });
  const ruta = join(carpeta, PRIVADA);
  const blob = readFileSync(ruta);
  blob[blob.length - 5] ^= 0xff;
  writeFileSync(ruta, blob);
  assert.throws(() => cargarClavePrivada({ env }), (e) => e instanceof ErrorFirma && e.code === 'dpapi' && !/PRIVATE KEY/.test(e.message));
});

test('npm run firma:crear con la clave ya creada: sale con 1 y no toca nada', SOLO_WINDOWS, (t) => {
  const { carpeta, env } = carpetaDePrueba(t);
  crearClave({ env });
  const antes = contenidos(carpeta);
  const r = npmCrear(carpeta);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout + r.stderr, /Ya hay una clave; no se crea otra/);
  assert.deepEqual(contenidos(carpeta), antes);
});

test('npm run firma:crear en una carpeta vacía: crea la clave y enseña la pública con la instrucción', SOLO_WINDOWS, (t) => {
  const { carpeta, env } = carpetaDePrueba(t);
  const r = npmCrear(carpeta);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Copia esta clave en app\/typescript\/src\/actualizar\/clave-publica\.mts/);
  assert.ok(r.stdout.includes(clavePublica({ env }).trim()), 'no enseña la pública');
  assert.ok(!(r.stdout + r.stderr).includes('PRIVATE KEY'));
  assert.deepEqual(readdirSync(carpeta).sort(), [PRIVADA, PUBLICA]);
});
