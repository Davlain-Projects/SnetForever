// Pruebas del instalador de Windows (fase 5, tarea 16): `prepararRaiz`, `buscarIscc`, `compilar`, el `.iss` y el `.vbs`.
//
// - La publicación sale de test/fixtures/repo-mini (tarea 15), firmada con una clave temporal (SNF_FIRMA_DIR en una
//   carpeta de prueba, con DPAPI): nunca se toca la clave de verdad. Por eso casi todo solo corre en Windows.
// - El node.exe es falso (10 bytes) salvo en las pruebas que lo ejecutan, que usan una copia del Node de las pruebas.
// - Nunca se instala nada: ISCC.exe solo compila (si no está, la prueba se salta) y el .exe que sale no se ejecuta.
// - Las carpetas temporales llevan espacios y acentos (vigilancia 3).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as dormir } from 'node:timers/promises';

import { prepararRaiz, buscarIscc, compilar, principal, leerClaveApp, ErrorInstalador, NOMBRE_EXE } from '../src/instalador.mjs';
import { publicar } from '../src/publicar.mjs';
import { crearClave, clavePublica } from '../src/firma/clave.mjs';
import { CLAVE_PUBLICA } from '../../../app/src/actualizar/clave-publica.mjs';
import { APARTADO_POR_DEFECTO, raizApartado } from '../src/apartado.mjs';

const EMPAQUETAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_MINI = join(EMPAQUETAR, 'test', 'fixtures', 'repo-mini');
const ISS = join(EMPAQUETAR, 'inno', 'SnetForever.iss');
const VBS = join(EMPAQUETAR, 'plantillas', 'SnetForever.vbs');
const LICENCIA_NODE = join(EMPAQUETAR, 'terceros', 'node', 'LICENSE');
const SOLO_WINDOWS = { skip: process.platform !== 'win32' };
const AHORA = new Date('2026-11-10T12:00:00.000Z');
const PUB = 'v0.5.0-2026.11.11.1';
// lo que va a `paquetes\`: los cuatro paquetes de AddOns (con el comercio, Task 8), el manifiesto y su firma (la app no: la pone Inno)
const SEIS = [
  'SnetForever-addon-0.5.0.snfpaq', 'SnetForever-comercio-0.5.3.snfpaq', 'SnetForever-misiones-2026.11.11.1.snfpaq',
  'SnetForever-rutas-2026.11.11.1.snfpaq', 'snetforever-manifiesto.json', 'snetforever-manifiesto.json.sig',
];
const FRASE_NODE = 'Node.js is licensed for use as follows';
// Ronda 1, I3: una licencia de Node «completa» de prueba (con la lista de bibliotecas externas y las secciones de V8,
// OpenSSL e ICU) y un resumen como el de hoy en terceros/node/LICENSE (solo el aviso MIT y un enlace).
const LICENCIA_COMPLETA = [
  FRASE_NODE + ':', '', '"""', 'Copyright Node.js contributors. All rights reserved.', '"""', '',
  'The externally maintained libraries used by Node.js are:', '',
  '- Acorn, located at deps/acorn, is licensed as follows:', '  """', '  MIT', '  """', '',
  '- ICU, located at deps/icu-small, is licensed as follows:', '  """', '  UNICODE LICENSE V3', '  """', '',
  '- OpenSSL, located at deps/openssl, is licensed as follows:', '  """', '  Apache License 2.0', '  """', '',
  '- V8, located at deps/v8, is licensed as follows:', '  """', '  BSD-3-Clause', '  """', '',
].join('\n');
const LICENCIA_RESUMEN = `${FRASE_NODE}:\n\n"""\nCopyright Node.js contributors.\n"""\n\nThe rest: https://github.com/nodejs/node/blob/v24.14.0/LICENSE\n`;

// Una sola clave temporal y una sola publicación de repo-mini para todo el archivo.
let comun = null;
before(() => {
  if (process.platform !== 'win32') return;
  const base = mkdtempSync(join(tmpdir(), 'snf-instalador-'));
  const firma = join(base, 'fírma');
  crearClave({ env: { SNF_FIRMA_DIR: firma } });
  const repo = join(base, 'Repo Ñandú');
  copiar(REPO_MINI, repo);
  // ronda 1, M8: el SnetForever.vbs de la fase 4 de app/ no tiene que acabar en el paquete de la app
  writeFileSync(join(repo, 'app', 'SnetForever.vbs'), "' el .vbs de la fase 4\r\n");
  const licenciaCompleta = join(base, 'LICENSE completa');
  writeFileSync(licenciaCompleta, LICENCIA_COMPLETA);
  const licenciaResumen = join(base, 'LICENSE resumen');
  writeFileSync(licenciaResumen, LICENCIA_RESUMEN);
  const env = { SNF_FIRMA_DIR: firma, SNF_CUARENTENA: join(base, 'cuarentena') };
  const publica = clavePublica({ env });
  // resto de I1: la app de la publicación lleva la clave que firma, como la llevará la de verdad (tarea 18)
  ponerClaveApp(repo, moduloClave(publica));
  const r = publicar({
    raiz: repo, salida: join(base, 'publicación'), comprobarGit: false, env, ahora: AHORA, publicacion: PUB, claveApp: publica, appConoceComercio: '0.5.0', sinPuente: true, // repo-mini lleva la app 0.5.0
  });
  comun = { base, firma, env, repo, publica, publicacion: r.carpeta, licenciaCompleta, licenciaResumen };
});

// El clave-publica.mjs de la app con esta clave pública (PEM), como lo deja la tarea 18 al copiar la de `firma:crear`.
function moduloClave(pem) {
  return `// Clave pública Ed25519 (PEM SPKI) de prueba.\nexport const CLAVE_PUBLICA = \`${pem}\`;\n`;
}

// Escribe el clave-publica.mjs de la app de `repo` (con texto null, lo deja sin ese archivo).
function ponerClaveApp(repo, texto) {
  const ruta = join(repo, 'app', 'src', 'actualizar', 'clave-publica.mjs');
  if (texto === null) {
    rmSync(ruta, { force: true });
    return;
  }
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, texto);
}

// Otra publicación de repo-mini, firmada con la clave temporal, cuya app lleva `texto` como clave-publica.mjs (con null,
// sin ese archivo). Se quita al acabar la prueba.
function publicarConClaveApp(t, texto) {
  const base = mkdtempSync(join(tmpdir(), 'snf-pub-clave-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, 'Repo Ñ');
  copiar(comun.repo, repo);
  ponerClaveApp(repo, texto);
  // claveApp: null, como una publicación hecha antes de poner la clave (publicar avisa y sigue)
  return publicar({
    raiz: repo, salida: join(base, 'publicación'), comprobarGit: false, env: { ...comun.env, SNF_CUARENTENA: join(base, 'cuarentena') },
    ahora: AHORA, publicacion: PUB, claveApp: null, appConoceComercio: '0.5.0', sinPuente: true,
  }).carpeta;
}
after(() => {
  if (comun) rmSync(comun.base, { recursive: true, force: true });
});

// Copia una carpeta entera. No se usa cpSync: en Node 24.14 estropea en Windows los destinos con tildes.
function copiar(origen, destino) {
  mkdirSync(destino, { recursive: true });
  for (const nombre of readdirSync(origen)) {
    const de = join(origen, nombre);
    if (statSync(de).isDirectory()) copiar(de, join(destino, nombre));
    else writeFileSync(join(destino, nombre), readFileSync(de));
  }
}

// Una carpeta de prueba (con espacios y tildes) con un node.exe falso de 10 bytes, que se quita al acabar.
function carpetaPrueba(t) {
  const base = mkdtempSync(join(tmpdir(), 'snf-raiz-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const nodeFalso = join(base, 'node falso.exe');
  writeFileSync(nodeFalso, Buffer.from('0123456789'));
  return { base, nodeFalso, salida: join(base, 'José Ñandú', 'raíz'), cuarentena: join(base, 'cuarentena') };
}

function preparar(c, extra = {}) {
  return prepararRaiz({
    publicacionDir: comun.publicacion, nodeExe: c.nodeFalso, nodeLicencia: comun.licenciaCompleta, salida: c.salida,
    comprobarNode: false, clavePublica: comun.publica, env: { SNF_CUARENTENA: c.cuarentena }, ...extra,
  });
}

// Todos los archivos de una carpeta, con rutas relativas y «\».
function listar(raiz, dentro = '') {
  const salida = [];
  for (const nombre of readdirSync(join(raiz, dentro))) {
    const rel = dentro ? `${dentro}\\${nombre}` : nombre;
    if (statSync(join(raiz, rel)).isDirectory()) salida.push(...listar(raiz, rel));
    else salida.push(rel);
  }
  return salida;
}

// ---------- prepararRaiz ----------

test('prepararRaiz: la raíz de F3 sin unins000.*, con el Node, la app extraída, el arranque y los paquetes', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  const raiz = preparar(c);
  assert.equal(raiz, c.salida);
  for (const rel of ['node\\node.exe', 'node\\LICENSE', 'app\\0.5.0\\src\\version.mjs', 'actual.txt', 'arranque.mjs', 'retirar.ps1',
    'SnetForever.vbs', 'LICENSE', 'LICENCIAS.txt']) {
    assert.ok(statSync(join(raiz, rel)).isFile(), rel);
  }
  assert.equal(readFileSync(join(raiz, 'actual.txt'), 'utf8'), '0.5.0');
  assert.deepEqual(readdirSync(join(raiz, 'paquetes')).sort(), [...SEIS].sort());
  // el node.exe es la copia exacta, y su licencia la de terceros/node
  assert.deepEqual(readFileSync(join(raiz, 'node', 'node.exe')), readFileSync(c.nodeFalso));
  assert.deepEqual(readFileSync(join(raiz, 'node', 'LICENSE')), readFileSync(comun.licenciaCompleta));
  // el arranque, retirar.ps1 y el .vbs son los del repositorio; los paquetes, los de la publicación (con su .sig)
  assert.deepEqual(readFileSync(join(raiz, 'arranque.mjs')), readFileSync(join(EMPAQUETAR, '..', '..', 'app', 'arranque', 'arranque.mjs')));
  assert.deepEqual(readFileSync(join(raiz, 'retirar.ps1')), readFileSync(join(EMPAQUETAR, '..', '..', 'app', 'ayudantes', 'retirar.ps1')));
  assert.deepEqual(readFileSync(join(raiz, 'SnetForever.vbs')), readFileSync(VBS));
  for (const nombre of SEIS) assert.deepEqual(readFileSync(join(raiz, 'paquetes', nombre)), readFileSync(join(comun.publicacion, nombre)), nombre);
  // la app va sin el primer segmento del paquete (F3) y sin sus pruebas; nada de unins000.* ni del paquete de la app
  const todo = listar(raiz);
  assert.ok(!todo.some((r) => /unins000/i.test(r)), todo.join(', '));
  assert.ok(!todo.some((r) => /SnetForever-app-/i.test(r)), todo.join(', '));
  assert.ok(!todo.some((r) => r.startsWith('app\\0.5.0\\test')), todo.join(', '));
  assert.ok(!existsSync(join(raiz, 'app', '0.5.0', 'app')));
  // ronda 1, M8: el .vbs de la fase 4 no viaja en el paquete de la app (el bueno es el de la raíz)
  assert.ok(!existsSync(join(raiz, 'app', '0.5.0', 'SnetForever.vbs')), todo.join(', '));
  assert.ok(!todo.some((r) => /^app\\.*SnetForever\.vbs$/i.test(r)), todo.join(', '));
});

test('ronda 1, I3: con el resumen de la licencia de Node (sin las secciones de V8, OpenSSL e ICU) se niega, sin crear nada', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  assert.throws(() => preparar(c, { nodeLicencia: comun.licenciaResumen }),
    (e) => e instanceof ErrorInstalador && e.code === 'licencia_node' && /completo/.test(e.message));
  // a cada sección que le falte, también
  for (const seccion of ['V8', 'OpenSSL', 'ICU']) {
    const sin = join(c.base, `sin ${seccion}`);
    writeFileSync(sin, LICENCIA_COMPLETA.replace(new RegExp(`^- ${seccion}, located at .*$`, 'm'), ''));
    assert.throws(() => preparar(c, { nodeLicencia: sin }), (e) => e.code === 'licencia_node', seccion);
  }
  const sinLista = join(c.base, 'sin lista');
  writeFileSync(sinLista, LICENCIA_COMPLETA.replace('The externally maintained libraries used by Node.js are:', ''));
  assert.throws(() => preparar(c, { nodeLicencia: sinLista }), (e) => e.code === 'licencia_node');
  assert.equal(existsSync(c.salida), false);
});

test('ronda 1, I3: para las pruebas (exigirLicenciaCompleta: false) el resumen vale, con un aviso', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  const avisos = [];
  const raiz = preparar(c, { nodeLicencia: comun.licenciaResumen, exigirLicenciaCompleta: false, avisar: (x) => avisos.push(x) });
  assert.deepEqual(readFileSync(join(raiz, 'node', 'LICENSE')), readFileSync(comun.licenciaResumen));
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /NO SE PUEDE PUBLICAR/);
  // con la completa no hay aviso; y sin la frase, ni para las pruebas
  const c2 = carpetaPrueba(t);
  const otros = [];
  preparar(c2, { exigirLicenciaCompleta: false, avisar: (x) => otros.push(x) });
  assert.deepEqual(otros, []);
  const c3 = carpetaPrueba(t);
  const mala = join(c3.base, 'mala');
  writeFileSync(mala, 'MIT');
  assert.throws(() => preparar(c3, { nodeLicencia: mala, exigirLicenciaCompleta: false }), (e) => e.code === 'licencia_node');
});

test('prepararRaiz: una licencia de Node sin «Node.js is licensed for use as follows» → licencia_node, sin crear nada', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  const mala = join(c.base, 'LICENSE mala');
  writeFileSync(mala, 'MIT License\n\nCopyright (c) alguien\n');
  assert.throws(() => preparar(c, { nodeLicencia: mala }), (e) => e instanceof ErrorInstalador && e.code === 'licencia_node');
  assert.throws(() => preparar(c, { nodeLicencia: join(c.base, 'no está') }), (e) => e.code === 'licencia_node');
  assert.equal(existsSync(c.salida), false);
});

test('prepararRaiz: la licencia de terceros/node/LICENSE tiene la frase y el aviso de terceros', () => {
  assert.ok(readFileSync(LICENCIA_NODE, 'utf8').includes(FRASE_NODE));
  const aviso = readFileSync(join(EMPAQUETAR, 'terceros', 'node', 'AVISO.txt'), 'utf8');
  assert.ok(aviso.includes('https://github.com/nodejs/node/blob/v24.14.0/LICENSE'));
  for (const nombre of ['V8', 'ICU', 'OpenSSL', 'libuv']) assert.ok(aviso.includes(nombre), nombre);
});

test('prepararRaiz: si la raíz ya existe, va antes entera a la cuarentena (nunca se borra)', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  mkdirSync(c.salida, { recursive: true });
  writeFileSync(join(c.salida, 'de antes.txt'), 'hola');
  preparar(c);
  assert.equal(existsSync(join(c.salida, 'de antes.txt')), false);
  const apartadas = listar(c.cuarentena).filter((r) => r.endsWith('de antes.txt'));
  assert.equal(apartadas.length, 1, listar(c.cuarentena).join(', '));
  assert.equal(readFileSync(join(c.cuarentena, apartadas[0]), 'utf8'), 'hola');
});

test('prepararRaiz: una publicación firmada con otra clave, o sin la .sig, no vale (no se crea nada)', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  const { publicKey } = generarOtra();
  assert.throws(() => preparar(c, { clavePublica: publicKey }), (e) => e instanceof ErrorInstalador && e.code === 'publicacion');
  const sinFirma = join(c.base, 'sin firma');
  copiar(comun.publicacion, sinFirma);
  rmSync(join(sinFirma, 'snetforever-manifiesto.json.sig'));
  assert.throws(() => preparar(c, { publicacionDir: sinFirma }), (e) => e.code === 'publicacion' && /falta_firma/.test(e.message));
  assert.throws(() => preparar(c, { publicacionDir: join(c.base, 'no existe') }), (e) => e.code === 'publicacion');
  assert.equal(existsSync(c.salida), false);
});

function generarOtra() {
  return { publicKey: generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }) };
}

// ---------- revisión final, m3: lo construido que se sustituye no va a la cuarentena común ----------

test('revisión final, m3: la raíz y el .exe anteriores (y una publicación anterior) van a dist/apartado, no a E:\\_CUARENTENA', () => {
  // por defecto, la carpeta propia de la herramienta (dentro de dist/, fuera de git); SNF_CUARENTENA la cambia
  assert.equal(APARTADO_POR_DEFECTO, join(EMPAQUETAR, 'dist', 'apartado'));
  assert.equal(raizApartado({}), APARTADO_POR_DEFECTO);
  assert.equal(raizApartado({ SNF_CUARENTENA: 'D:\\otra' }), 'D:\\otra');
  assert.match(readFileSync(join(EMPAQUETAR, '..', '..', '.gitignore'), 'utf8'), /^tools\/empaquetar\/dist\/\r?$/m);
  // ni el instalador ni publicar usan ya la cuarentena de la app (la común de E:\_CUARENTENA o la de config.json)
  for (const archivo of ['instalador.mjs', 'publicar.mjs']) {
    const codigo = readFileSync(join(EMPAQUETAR, 'src', archivo), 'utf8');
    assert.doesNotMatch(codigo, /cuarentenaComponentes/, archivo);
    assert.match(codigo, /carpetaApartado\(/, archivo);
  }
});

// ---------- revisión final, I1: sin la clave pública de la app no hay instalador de verdad ----------

test('revisión final, I1: con la clave pública en null, prepararRaiz se niega (clave) antes de mirar nada y sin crear nada', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'snf-sin-clave-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const salida = join(base, 'raíz');
  // ni la publicación ni la licencia existen: la clave se mira lo primero
  const opciones = { publicacionDir: join(base, 'no hay publicación'), nodeLicencia: join(base, 'no hay LICENSE'), salida, env: {} };
  assert.throws(() => prepararRaiz({ ...opciones, clavePublica: null }),
    (e) => e instanceof ErrorInstalador && e.code === 'clave' && /CLAVE_PUBLICA/.test(e.message) && /--prueba/.test(e.message));
  // la de la app: mientras siga en null, por defecto también se niega
  if (CLAVE_PUBLICA === null) assert.throws(() => prepararRaiz(opciones), (e) => e instanceof ErrorInstalador && e.code === 'clave');
  assert.equal(existsSync(salida), false);
});

test('revisión final, I1: con --prueba (exigirClave: false) y la clave en null se prepara, con el aviso NO SE PUEDE PUBLICAR', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  const avisos = [];
  const raiz = preparar(c, { clavePublica: null, exigirClave: false, avisar: (x) => avisos.push(x) });
  assert.ok(statSync(join(raiz, 'actual.txt')).isFile());
  assert.equal(avisos.length, 1, avisos.join('\n'));
  assert.match(avisos[0], /CLAVE_PUBLICA/);
  assert.match(avisos[0], /NO SE PUEDE PUBLICAR/);
  // con una clave no hay aviso de la clave
  const c2 = carpetaPrueba(t);
  const otros = [];
  preparar(c2, { exigirClave: false, avisar: (x) => otros.push(x) });
  assert.deepEqual(otros, []);
});

test('revisión final, I1: npm run instalador sin --prueba y con CLAVE_PUBLICA en null sale con 1 sin preparar nada', { skip: CLAVE_PUBLICA !== null }, (t) => {
  const base = mkdtempSync(join(tmpdir(), 'snf-cli-sin-clave-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const salida = { texto: '', write(x) { this.texto += x; } };
  const errores = { texto: '', write(x) { this.texto += x; } };
  const raiz = join(base, 'raíz');
  const codigo = principal(['--publicacion', join(base, 'pub'), '--raiz', raiz],
    { env: { SNF_ISCC: join(base, 'ISCC.exe'), SNF_CUARENTENA: join(base, 'cuarentena') }, salida, errores, existe: () => true });
  assert.equal(codigo, 1, errores.texto);
  assert.match(errores.texto, /CLAVE_PUBLICA/);
  assert.equal(existsSync(raiz), false);
  assert.equal(existsSync(join(base, 'cuarentena')), false);
});

// ---------- resto de I1 (Minor 1 de la re-revisión): la clave que lleva el paquete de la app ----------

test('resto de I1: la app instalada lleva en su clave-publica.mjs la clave que firma el manifiesto', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  const raiz = preparar(c);
  assert.equal(readFileSync(join(raiz, 'app', '0.5.0', 'src', 'actualizar', 'clave-publica.mjs'), 'utf8'), moduloClave(comun.publica));
});

test('resto de I1: sin --prueba, si la app de la publicación lleva CLAVE_PUBLICA = null se niega (clave), sin crear nada', SOLO_WINDOWS, (t) => {
  const pub = publicarConClaveApp(t, 'export const CLAVE_PUBLICA = null;\n');
  const c = carpetaPrueba(t);
  assert.throws(() => preparar(c, { publicacionDir: pub }),
    (e) => e instanceof ErrorInstalador && e.code === 'clave' && /null/.test(e.message) && /npm run publicar/.test(e.message));
  assert.equal(existsSync(c.salida), false);
  assert.equal(existsSync(c.cuarentena), false);
  // con --prueba sí se prepara (ese instalador no se publica)
  const c2 = carpetaPrueba(t);
  const raiz = preparar(c2, { publicacionDir: pub, exigirClave: false });
  assert.match(readFileSync(join(raiz, 'app', '0.5.0', 'src', 'actualizar', 'clave-publica.mjs'), 'utf8'), /= null;/);
});

test('resto de I1: sin --prueba, si la app de la publicación lleva otra clave se niega (clave), sin crear nada', SOLO_WINDOWS, (t) => {
  const pub = publicarConClaveApp(t, moduloClave(generarOtra().publicKey));
  const c = carpetaPrueba(t);
  assert.throws(() => preparar(c, { publicacionDir: pub }),
    (e) => e instanceof ErrorInstalador && e.code === 'clave' && /no es la que firma/.test(e.message));
  assert.equal(existsSync(c.salida), false);
});

test('resto de I1: sin --prueba, una app sin clave-publica.mjs o con uno que no se entiende no vale (clave)', SOLO_WINDOWS, (t) => {
  for (const texto of [null, 'export const CLAVE_PUBLICA = otraCosa;\n', 'export const CLAVE_PUBLICA = `no es un PEM`;\n']) {
    const pub = publicarConClaveApp(t, texto);
    const c = carpetaPrueba(t);
    assert.throws(() => preparar(c, { publicacionDir: pub }), (e) => e instanceof ErrorInstalador && e.code === 'clave', String(texto));
    assert.equal(existsSync(c.salida), false, String(texto));
  }
});

test('resto de I1: la misma clave escrita con comillas, \\n o CRLF vale igual', SOLO_WINDOWS, (t) => {
  const lineas = comun.publica.trimEnd().split(/\r?\n/);
  const formas = [
    `export const CLAVE_PUBLICA = '${lineas.join('\\n')}\\n';\n`,
    `export const CLAVE_PUBLICA = "${lineas.join('\\n')}";\r\n`,
    `// con CRLF\r\nexport const CLAVE_PUBLICA = \`${lineas.join('\r\n')}\r\n\`;\r\n`,
  ];
  for (const texto of formas) {
    const c = carpetaPrueba(t);
    const raiz = preparar(c, { publicacionDir: publicarConClaveApp(t, texto) });
    assert.ok(statSync(join(raiz, 'actual.txt')).isFile(), texto);
  }
});

test('resto de I1: leerClaveApp entiende el clave-publica.mjs de la app igual que al importarlo', () => {
  const texto = readFileSync(join(EMPAQUETAR, '..', '..', 'app', 'src', 'actualizar', 'clave-publica.mjs'), 'utf8');
  assert.equal(leerClaveApp(texto), CLAVE_PUBLICA);
  assert.equal(leerClaveApp('export const CLAVE_PUBLICA = null;'), null);
  assert.equal(leerClaveApp("export const CLAVE_PUBLICA = 'a\\nb\\\\c\\'d';"), "a\nb\\c'd");
  assert.equal(leerClaveApp('export const CLAVE_PUBLICA = "a\\r\\n";'), 'a\r\n');
  assert.equal(leerClaveApp('export const CLAVE_PUBLICA = `a\r\nb`;'), 'a\nb'); // como en JS: CRLF dentro de `` es \n
  // lo que no es un literal sencillo no se adivina: ErrorInstalador 'clave'
  for (const malo of [
    '', '// nada', 'export const CLAVE_PUBLICA = otraCosa;', "export const CLAVE_PUBLICA = 'a' + 'b';",
    'export const CLAVE_PUBLICA = `a${b}`;', "export const CLAVE_PUBLICA = '\\u0041';", "export const CLAVE_PUBLICA = 'sin cerrar;",
    'export const CLAVE_PUBLICA = null;\nexport const CLAVE_PUBLICA = null;',
  ]) {
    assert.throws(() => leerClaveApp(malo), (e) => e instanceof ErrorInstalador && e.code === 'clave', malo);
  }
});

test('prepararRaiz: con comprobarNode, node --version de la copia tiene que ser v24.*', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  assert.throws(() => preparar(c, { comprobarNode: true }), (e) => e instanceof ErrorInstalador && e.code === 'node');
  const c2 = carpetaPrueba(t);
  const v = process.version;
  if (!/^v24\./.test(v)) {
    t.diagnostic(`este Node es ${v}: solo se prueba el rechazo`);
    return;
  }
  const raiz = preparar(c2, { nodeExe: process.execPath, comprobarNode: true });
  assert.equal(statSync(join(raiz, 'node', 'node.exe')).size, statSync(process.execPath).size);
});

// ---------- buscarIscc ----------

test('buscarIscc: SNF_ISCC, %LOCALAPPDATA%\\Programs\\Inno Setup 6 y Program Files (x86), en ese orden; si no, null', () => {
  const hay = (lista) => (r) => lista.includes(r);
  const env = { SNF_ISCC: 'D:\\x\\ISCC.exe', LOCALAPPDATA: 'C:\\Users\\José Ñandú\\AppData\\Local' };
  const local = 'C:\\Users\\José Ñandú\\AppData\\Local\\Programs\\Inno Setup 6\\ISCC.exe';
  const x86 = 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe';
  assert.equal(buscarIscc(env, hay(['D:\\x\\ISCC.exe', local, x86])), 'D:\\x\\ISCC.exe');
  assert.equal(buscarIscc(env, hay([local, x86])), local);
  assert.equal(buscarIscc(env, hay([x86])), x86);
  assert.equal(buscarIscc(env, hay([])), null);
  assert.equal(buscarIscc({}, hay([local])), null);
});

// ---------- el .iss ----------

const iss = () => readFileSync(ISS, 'utf8');

/** El texto de una sección del .iss, tal cual (hasta la sección siguiente o el final). */
function seccionCruda(texto, nombre) {
  const m = new RegExp(`^\\[${nombre}\\][ \\t]*\\r?$([\\s\\S]*?)(?=^\\[[A-Za-z]+\\][ \\t]*\\r?$|(?![\\s\\S]))`, 'mi').exec(texto);
  assert.ok(m, `falta la sección [${nombre}]`);
  return m[1];
}

/** Las líneas de una sección del .iss (sin comentarios `;` ni líneas vacías). */
function seccion(texto, nombre) {
  return seccionCruda(texto, nombre).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith(';'));
}

/**
 * El [Code] con su sangría y sin comentarios `//` (en el [Code] no se usan los comentarios `{…}`, que chocarían con
 * `{app}`, ni hay `//` dentro de las cadenas).
 */
function codigo(texto) {
  return seccionCruda(texto, 'Code').split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '').trimEnd()).join('\n');
}

test('el .iss: lo que pide el plan y nada prohibido', () => {
  const t = iss();
  for (const debe of ['PrivilegesRequired=lowest', 'uninsneveruninstall', 'DefaultDirName={localappdata}\\Programs\\SnetForever', 'Spanish.isl',
    '--cli', 'desinstalar', 'retirar.ps1']) {
    assert.ok(t.includes(debe), debe);
  }
  assert.match(codigo(t), /Cli\('desinstalar'/);
  for (const prohibido of [/Remove-Item/i, /DelTree/i, /DeleteFile/i, /http/i, /RemoveDir/i, /^\[(?:Install|Uninstall)Delete\]/mi]) {
    assert.doesNotMatch(t, prohibido);
  }
  // la detección es de Node (R2): ni las carpetas habituales ni _forever_
  assert.doesNotMatch(t, /_forever_/i);
  assert.doesNotMatch(t, /HABITUALES/);
});

test('el .iss: [Setup] con los valores exactos', () => {
  const lineas = seccion(iss(), 'Setup');
  const esperadas = [
    'AppId={{6B8F2A3C-4D51-4E2B-9C7A-5E4F53464F52}', 'AppName=SnetForever', 'AppVersion={#Version}', 'AppPublisher=SnetForever',
    'DefaultDirName={localappdata}\\Programs\\SnetForever', 'DisableDirPage=yes', 'DefaultGroupName=SnetForever', 'DisableProgramGroupPage=yes',
    'PrivilegesRequired=lowest', 'CloseApplications=no',
    'Compression=lzma2/max', 'SolidCompression=yes', 'WizardStyle=modern', 'MinVersion=10.0',
    'ArchitecturesAllowed=x64compatible', 'ArchitecturesInstallIn64BitMode=x64compatible',
    'InfoBeforeFile={#Raiz}\\LICENCIAS.txt', 'UninstallDisplayName=SnetForever', 'SetupLogging=yes',
  ];
  for (const e of esperadas) assert.ok(lineas.includes(e), e);
  // ronda 1, M6: solo para el usuario, sin el diálogo de «todos los usuarios» (manda sobre el plan)
  assert.ok(!lineas.some((l) => /^PrivilegesRequiredOverridesAllowed=/i.test(l)), lineas.join('\n'));
});

test('ronda 1, I1: todo lo que Inno podría quitar ([Files] e [Icons]) lleva uninsneveruninstall', () => {
  const t = iss();
  const entradas = [...seccion(t, 'Files'), ...seccion(t, 'Icons')];
  assert.ok(entradas.length >= 5, entradas.join('\n'));
  // salvo lo que no se instala (dontcopy: Inno no lo conoce al desinstalar, y no admite uninsneveruninstall con él)
  for (const l of entradas) {
    if (/; Flags: [^;]*\bdontcopy\b/.test(l)) assert.doesNotMatch(l, /DestDir:/, l);
    else assert.match(l, /; Flags: [^;]*\buninsneveruninstall\b/, l);
  }
  // y nada más que Inno instale y luego quite por su cuenta (salvo su desinstalador y su clave de «Aplicaciones»)
  for (const otra of ['Dirs', 'Registry', 'INI', 'InstallDelete', 'UninstallDelete', 'UninstallRun']) {
    assert.doesNotMatch(t, new RegExp(`^\\[${otra}\\]`, 'mi'), otra);
  }
});

test('ronda 1, M4: los textos estándar del desinstalador dicen que todo va a la cuarentena (es y en)', () => {
  const mensajes = seccion(iss(), 'Messages');
  const de = (idioma) => Object.fromEntries(mensajes.filter((l) => l.startsWith(`${idioma}.`))
    .map((l) => [l.slice(idioma.length + 1, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const es = de('es');
  const en = de('en');
  for (const clave of ['ConfirmUninstall', 'UninstallStatusLabel', 'UninstalledAll', 'UninstalledMost']) {
    assert.ok(es[clave], `es.${clave}`);
    assert.ok(en[clave], `en.${clave}`);
    assert.match(es[clave], /cuarentena/, `es.${clave}`);
    assert.match(en[clave], /quarantine/, `en.${clave}`);
    assert.doesNotMatch(es[clave], /eliminar|elimin[oó]/i, `es.${clave}`);
    assert.doesNotMatch(en[clave].replace(/Nothing (?:has been|will be) deleted/g, ''), /remov|delet/i, `en.${clave}`);
  }
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
});

test('el .iss: idiomas, tareas, archivos, accesos y [Run]', () => {
  const t = iss();
  const idiomas = seccion(t, 'Languages').join('\n');
  assert.match(idiomas, /^Name: "es"; MessagesFile: "compiler:Languages\\Spanish\.isl"$/m);
  assert.match(idiomas, /^Name: "en"; MessagesFile: "compiler:Default\.isl"$/m);
  const tareas = seccion(t, 'Tasks');
  assert.ok(tareas.some((l) => /^Name: "escritorio";.*Flags: unchecked$/.test(l)), tareas.join('\n'));
  assert.ok(tareas.some((l) => /^Name: "inicio";/.test(l) && !/unchecked/.test(l)), tareas.join('\n'));
  // la del plan y (ronda 1, M3) una copia aparte de retirar.ps1 que no se instala: la saca PrepareToInstall a {tmp}
  // para terminar una retirada a medias
  assert.deepEqual(seccion(t, 'Files'), [
    'Source: "{#Raiz}\\retirar.ps1"; DestName: "snf-retirar.ps1"; Flags: dontcopy',
    'Source: "{#Raiz}\\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion uninsneveruninstall',
  ]);
  const iconos = seccion(t, 'Icons');
  assert.equal(iconos.length, 3);
  const accion = 'Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\SnetForever.vbs"""';
  assert.ok(iconos[0].startsWith(`Name: "{group}\\SnetForever"; ${accion}`), iconos[0]);
  assert.ok(iconos[1].startsWith(`Name: "{userdesktop}\\SnetForever"; ${accion}`) && /Tasks: escritorio/.test(iconos[1]), iconos[1]);
  assert.ok(iconos[2].startsWith(`Name: "{userstartup}\\SnetForever"; ${accion}`) && /Tasks: inicio/.test(iconos[2]), iconos[2]);
  for (const l of iconos) assert.match(l, /; Flags: uninsneveruninstall$/, l);
  const run = seccion(t, 'Run');
  assert.equal(run.length, 1);
  assert.ok(run[0].startsWith(accion), run[0]);
  assert.match(run[0], /Description: "\{cm:AbrirAhora\}"/);
  assert.match(run[0], /Flags: postinstall nowait skipifsilent$/);
  // los textos, en es y en: cada clave en los dos idiomas
  const mensajes = seccion(t, 'CustomMessages');
  const claves = (idioma) => mensajes.filter((l) => l.startsWith(`${idioma}.`)).map((l) => l.slice(3, l.indexOf('='))).sort();
  assert.ok(claves('es').length >= 10);
  assert.deepEqual(claves('es'), claves('en'));
  const es = Object.fromEntries(mensajes.filter((l) => l.startsWith('es.')).map((l) => [l.slice(3, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  assert.equal(es.TareaEscritorio, 'Crear un acceso directo en el escritorio');
  assert.equal(es.TareaInicio, 'Abrir SnetForever al iniciar Windows');
  assert.equal(es.AbrirAhora, 'Abrir SnetForever ahora');
  assert.equal(es.JuegoTitulo, 'Carpeta del juego');
  assert.equal(es.JuegoCerrar, 'Cierra World of Warcraft y pulsa Reintentar');
  assert.equal(es.IaTitulo, 'Chat con la IA');
  assert.equal(es.IaComprobar, 'Volver a comprobar');
  assert.equal(es.IaTerminal, 'Abrir una terminal');
  assert.equal(es.DesinstalarJuego, 'Cierra World of Warcraft antes de desinstalar');
  for (const l of mensajes) assert.doesNotMatch(l, /\{cm:/, l);
  // las órdenes de subida y de red prohibidas en los textos las vigila cumplimiento.test.js (que revisa el .iss)
});

test('el .iss: el [Code] solo llama a la CLI (F6) y a retirar.ps1, con lo que piden las notas', () => {
  const c = codigo(iss());
  // cada llamada a la CLI: {app}\node\node.exe "{app}\arranque.mjs" --cli <orden> … --idioma <ActiveLanguage> --salida "{tmp}\snf-<orden>"
  assert.match(c, /Exec\(Ruta\('\{app\}\\node\\node\.exe'\),\s*Arg\('\{app\}\\arranque\.mjs'\) \+ ' --cli ' \+ Orden/);
  assert.match(c, /' --idioma ' \+ ActiveLanguage/);
  // ronda 1, M2: cada llamada, con una salida nueva (snf-<orden>-<n>), y si no deja su .txt cuenta como fallo
  assert.match(c, /' --salida ' \+ Arg\('\{tmp\}\\snf-' \+ Orden \+ '-' \+ N\)/);
  const cli = bloque(c, 'function Cli');
  assert.match(cli, /Llamadas := Llamadas \+ 1;/);
  assert.match(cli, /N := IntToStr\(Llamadas\);/);
  assert.match(cli, /UltimoTxt := Ruta\('\{tmp\}\\snf-' \+ Orden \+ '-' \+ N \+ '\.txt'\);/);
  assert.match(cli, /not FileExists\(UltimoTxt\)[\s\S]*Result := NO_SE_ESCRIBE/);
  const linea = bloque(c, 'function LineaDe');
  assert.match(linea, /Orden <> UltimaOrden/);
  assert.match(linea, /LoadStringsFromFile\(UltimoTxt, Lineas\)/);
  assert.match(bloque(c, 'function MensajeDe'), /Codigo >= 0/);
  // PrepareToInstall: con actual.txt, cerrar-app y detectar con el arranque viejo, y retirar.ps1 con la línea 3
  const preparar = bloque(c, 'function PrepareToInstall');
  assert.match(preparar, /FileExists\(Ruta\('\{app\}\\actual\.txt'\)\)/);
  assertOrden(preparar, ["Cli('cerrar-app'", "Cli('detectar', ' --instalacion ' + Arg('{app}'))", "LineaDe('detectar', 3)",
    "Retirar(Arg('{app}\\retirar.ps1'), '', Cuarentena"]);
  // ronda 1, M3: sin actual.txt pero con restos de la lista de retirar.ps1 (una retirada a medias), retirar.ps1 -AMedias
  // con la copia del instalador; sin restos (la primera vez), nada
  assertOrden(preparar, ['if not FileExists(', 'if HayRestos then', 'Result := RetirarAMedias;', 'exit;']);
  const restos = bloque(c, 'function HayRestos');
  for (const nombre of ['node', 'app', 'paquetes', 'previa.txt', 'fallida.txt', 'arranque.mjs', 'SnetForever.vbs', 'LICENSE', 'LICENCIAS.txt', 'retirar.ps1']) {
    assert.ok(restos.includes(`Ruta('{app}\\${nombre}')`), nombre);
  }
  const aMedias = bloque(c, 'function RetirarAMedias');
  assertOrden(aMedias, ["ExtractTemporaryFile('snf-retirar.ps1')", "Ruta('{localappdata}\\SnetForever\\cuarentena')",
    "Retirar(Arg('{tmp}\\snf-retirar.ps1'), ' -AMedias', Cuarentena"]);
  // la página del juego, detrás de wpInfoAfter, con detectar al entrar e instalar con «Siguiente»
  assert.match(c, /CreateInputDirPage\(wpInfoAfter, CustomMessage\('JuegoTitulo'\)/);
  assert.match(c, /Cli\('detectar', ' --instalacion ' \+ Arg\('\{app\}'\)\)[\s\S]*?LineaDe\('detectar', 2\)/);
  assert.match(c, /Cli\('instalar', ' --addons ' \+ Comillas\(Carpeta\) \+ ' --paquetes ' \+ Arg\('\{app\}\\paquetes'\)\)/);
  const instalar = bloque(c, 'function InstalarAddon');
  assert.match(instalar, /Carpeta := PaginaJuego\.Values\[0\];/);
  assert.match(instalar, /SALIDA_JUEGO_ABIERTO[\s\S]*MB_RETRYCANCEL[\s\S]*IDRETRY/);
  // ronda 1, I2: con cualquier código distinto de 0 (también el 10 tras «Cancelar»), la pregunta, por defecto «No»;
  // el único «no deja seguir» sin preguntar es una comilla en la carpeta (M1), que el jugador corrige en la misma página
  assert.doesNotMatch(instalar, /\bcase\b/);
  assert.match(instalar, /SinAddon := SuppressibleMsgBox\(FmtMessage\(CustomMessage\('SalirSinAddon'\)[\s\S]*MB_YESNO or MB_DEFBUTTON2, IDNO\) = IDYES;/);
  assert.match(instalar, /Result := SinAddon;/);
  assert.equal((instalar.match(/Result := False/g) ?? []).length, 1, instalar);
  assert.match(instalar, /Pos\('"', Carpeta\) > 0[\s\S]*?CustomMessage\('CarpetaComillas'\)[\s\S]*?Result := False/);
  // ronda 1, M7: si el addon no se instala (en silencio, o porque el jugador termina sin él), el instalador sale con 20
  assert.match(c, /SALIDA_SIN_ADDON = 20;/);
  assert.match(bloque(c, 'function GetCustomSetupExitCode'), /if AddonFallido then\s+Result := SALIDA_SIN_ADDON/);
  assert.match(instalar, /if WizardSilent then begin\s+AddonFallido := True;\s+Result := True;/);
  assert.match(instalar, /AddonFallido := SinAddon;/);
  // la página de la IA: comprobar-ia, «Volver a comprobar» y una terminal sin esperar
  assert.match(c, /Cli\('comprobar-ia', ''\)/);
  assert.match(c, /Exec\(Ruta\('\{sys\}\\WindowsPowerShell\\v1\.0\\powershell\.exe'\), '-NoExit',[^;]*ewNoWait/);
  // desinstalar: juego-abierto en InitializeUninstall; cerrar-app, desinstalar y retirar.ps1 en usUninstall
  assert.match(bloque(c, 'function InitializeUninstall'), /Cli\('juego-abierto', ''\)[\s\S]*SALIDA_JUEGO_ABIERTO[\s\S]*Result := False/);
  const desinstalar = bloque(c, 'procedure CurUninstallStepChanged');
  assert.match(desinstalar, /usUninstall/);
  assertOrden(desinstalar, ["Cli('cerrar-app'", "Cli('desinstalar', ' --instalacion ' + Arg('{app}') + ' --grupo ' + Arg('{group}')",
    "' --escritorio ' + Arg('{userdesktop}\\SnetForever.lnk')", "' --inicio ' + Arg('{userstartup}\\SnetForever.lnk')",
    "LineaDe('desinstalar', 3)", "Retirar(Arg('{app}\\retirar.ps1'), '', Cuarentena"]);
  // si cerrar-app, desinstalar o retirar.ps1 no salen con 0, Inno se para (Abort en usUninstall) y nunca sigue
  assert.match(c, /procedure Parar\(const Mensaje: String\);[\s\S]*?Abort;/);
  assert.ok((desinstalar.match(/Parar\(/g) ?? []).length >= 3, desinstalar);
  // retirar.ps1: con -File (siempre Arg(…), ver la vigilancia 3), -Desde "{app}" y -A "<cuarentena>"; de su salida solo se
  // usa la línea destino:, y si falta (M5), la cuarentena
  const retirar = bloque(c, 'function Retirar');
  assert.match(retirar, /'-NoProfile -ExecutionPolicy Bypass -File ' \+ Script \+ Extra \+ ' -Desde ' \+ Arg\('\{app\}'\) \+ ' -A ' \+ Comillas\(Cuarentena\)/);
  assert.match(retirar, /'destino: '/);
  assert.match(retirar, /if Destino = '' then\s+Destino := Cuarentena;/);
});

test('revisión final, m2: si la CLI no arranca, el desinstalador ofrece el modo seguro (solo retirar.ps1) y nunca deja atrapado', () => {
  const t = iss();
  const c = codigo(t);
  // sin el Node de la instalación, o con la CLI rota (ni 0 ni 10), la pregunta del modo seguro, por defecto «No»
  const ini = bloque(c, 'function InitializeUninstall');
  assert.match(ini, /CustomMessage\('FaltaNode'\)[\s\S]*?OfrecerModoSeguro/);
  assert.match(ini, /else if Codigo <> SALIDA_OK then\s+Result := OfrecerModoSeguro\(MensajeDe\('juego-abierto', Codigo\)\);/);
  assert.doesNotMatch(ini, /CustomMessage\('SinNode'\)/);
  const ofrecer = bloque(c, 'function OfrecerModoSeguro');
  assert.match(ofrecer, /ModoSeguro := SuppressibleMsgBox\(FmtMessage\(CustomMessage\('ModoSeguro'\)[\s\S]*MB_YESNO or MB_DEFBUTTON2, IDNO\) = IDYES;/);
  assert.match(ofrecer, /Result := ModoSeguro;/);
  // en usUninstall, con el modo seguro: ni cerrar-app ni desinstalar, solo retirar.ps1 (renombra a la cuarentena de la
  // misma unidad que la instalación; sin actual.txt, con -AMedias)
  const desinstalar = bloque(c, 'procedure CurUninstallStepChanged');
  assertOrden(desinstalar, ['if ModoSeguro then begin', 'DesinstalarModoSeguro;', 'exit;', "Cli('cerrar-app'"]);
  const seguro = bloque(c, 'procedure DesinstalarModoSeguro');
  assert.doesNotMatch(seguro, /\bCli\(/);
  assert.match(seguro, /Cuarentena := Ruta\('\{localappdata\}\\SnetForever\\cuarentena'\);/);
  assert.match(seguro, /if not FileExists\(Ruta\('\{app\}\\actual\.txt'\)\) then\s+Extra := ' -AMedias';/);
  assertOrden(seguro, ["FileExists(Ruta('{app}\\retirar.ps1'))", "Retirar(Arg('{app}\\retirar.ps1'), Extra, Cuarentena, Destino, Error)",
    "CustomMessage('DesinstaladoSeguro')", 'exit;', "CustomMessage('ModoSeguroSinMover')", 'Abort;']);
  // si retirar.ps1 falta o falla: «¿terminar sin mover nada más?», por defecto «No», que para sin quitar nada
  assert.match(seguro, /CustomMessage\('ModoSeguroSinMover'\)[\s\S]*MB_YESNO or MB_DEFBUTTON2, IDNO\) <> IDYES then\s+Abort;/);
  // los textos, en es y en: no se borra nada, se dice dónde queda todo y qué hacer
  const mensajes = seccion(t, 'CustomMessages');
  const texto = (clave) => mensajes.find((l) => l.startsWith(`${clave}=`))?.slice(clave.length + 1);
  for (const clave of ['ModoSeguro', 'ModoSeguroSinMover', 'DesinstaladoSeguro', 'FaltaNode']) {
    assert.ok(texto(`es.${clave}`), `es.${clave}`);
    assert.ok(texto(`en.${clave}`), `en.${clave}`);
  }
  assert.match(texto('es.ModoSeguro'), /no se borra nada/i);
  assert.match(texto('es.ModoSeguro'), /AddOns/);
  assert.match(texto('es.ModoSeguro'), /Con «No» no se toca nada/);
  assert.match(texto('es.ModoSeguroSinMover'), /Con «No» se para aquí y no se quita nada/);
  assert.match(texto('en.ModoSeguro'), /Nothing is deleted/);
});

// El bloque de `cabecera` (hasta el `end;` de su primer nivel, sin contar los `begin`/`case`/`try` de dentro).
function bloque(c, cabecera) {
  const i = c.indexOf(cabecera);
  assert.ok(i >= 0, `falta ${cabecera}`);
  const resto = c.slice(i);
  const fin = /^end;\s*$/m.exec(resto);
  assert.ok(fin, `${cabecera} sin end;`);
  return resto.slice(0, fin.index);
}

function assertOrden(texto, trozos) {
  let desde = 0;
  for (const trozo of trozos) {
    const i = texto.indexOf(trozo, desde);
    assert.ok(i >= 0, `falta (o va fuera de orden) «${trozo}»`);
    desde = i + trozo.length;
  }
}

// ---------- vigilancia 3: rutas con espacios y acentos ----------

const CONSTANTES = /\{(?:app|tmp|group|userdesktop|userstartup)\}/g;

test('vigilancia 3: en [Icons] y [Run], cada {app}… de Parameters va entre comillas dobles', () => {
  const t = iss();
  const lineas = [...seccion(t, 'Icons'), ...seccion(t, 'Run')];
  let vistos = 0;
  for (const l of lineas) {
    const m = /Parameters: "((?:[^"]|"")*)"/.exec(l);
    if (!m) continue;
    const valor = m[1];
    const total = (valor.match(CONSTANTES) ?? []).length;
    const entreComillas = (valor.match(/""\{(?:app|tmp|group|userdesktop|userstartup)\}(?:[^"]|"(?!"))*""/g) ?? []).length;
    assert.equal(entreComillas, total, l);
    vistos += total;
  }
  assert.equal(vistos, 4);
});

test('vigilancia 3: en el [Code], toda ruta que va como parámetro sale entre comillas dobles', () => {
  const c = codigo(iss());
  // 1) las constantes solo aparecen dentro de Arg('…') (parámetro, entre comillas) o de Ruta('…') (archivo, nunca parámetro)
  const sueltas = [];
  for (const m of c.matchAll(CONSTANTES)) {
    const antes = c.slice(Math.max(0, c.lastIndexOf('\n', m.index) + 1), m.index);
    if (!/(?:Arg|Ruta)\('(?:[^']*)$/.test(antes)) sueltas.push(`${m[0]} en «${antes}…»`);
  }
  assert.deepEqual(sueltas, []);
  // 2) Ruta(…) nunca se concatena a una línea de órdenes
  assert.doesNotMatch(c, /\+\s*Ruta\(|Ruta\([^)]*\)\s*\+/);
  // 3) Arg y Comillas ponen las comillas dobles y (ronda 1, M1) doblan TODAS las barras invertidas del final, para que
  //    ninguna escape la de cierre (E:\juego\\ sale "E:\juego\\\\")
  const comillas = bloque(c, 'function Comillas');
  assert.match(comillas, /Result := '"' \+ Result \+ '"'/);
  assert.match(comillas, /while \(N < Length\(S\)\) and \(Copy\(S, Length\(S\) - N, 1\) = '\\'\) do\s+N := N \+ 1;/);
  assert.match(comillas, /for I := 1 to N do\s+Result := Result \+ '\\';/);
  assert.match(bloque(c, 'function Arg'), /Result := Comillas\(ExpandConstant\(C\)\)/);
  // 4) cada opción con una ruta va seguida de Arg(…) o Comillas(…); la única excepción, el -File de Retirar, que recibe
  //    el script ya entre comillas: todas las llamadas a Retirar le pasan Arg(…)
  const opciones = ['--salida', '--addons', '--paquetes', '--instalacion', '--grupo', '--escritorio', '--inicio', '-File', '-Desde', '-A'];
  for (const o of opciones) {
    const usos = [...c.matchAll(new RegExp(`[ ']${o} ' \\+ (\\w+)\\b(\\()?`, 'g'))];
    assert.ok(usos.length > 0, `no se usa ${o}`);
    for (const u of usos) {
      const bien = (['Arg', 'Comillas'].includes(u[1]) && u[2] === '(') || (o === '-File' && u[1] === 'Script' && !u[2]);
      assert.ok(bien, `${o} seguido de ${u[1]}${u[2] ?? ''}`);
    }
    assert.doesNotMatch(c, new RegExp(`[ ']${o} [^']`), `${o} con la ruta pegada dentro de la cadena`);
  }
  const llamadas = [...c.matchAll(/\bRetirar\(([^,]*),/g)].map((m) => m[1]).filter((x) => !/^const\b/.test(x));
  assert.ok(llamadas.length >= 3, llamadas.join(' | '));
  for (const x of llamadas) assert.match(x, /^Arg\('\{(?:app|tmp)\}\\[^']*retirar\.ps1'\)$/, x);
  // 5) el arranque.mjs, el primer parámetro de node.exe, también entre comillas
  assert.match(c, /Arg\('\{app\}\\arranque\.mjs'\) \+ ' --cli '/);
});

test('vigilancia 3: el .vbs pone comillas a las dos rutas (node.exe y arranque.mjs)', () => {
  const v = readFileSync(VBS, 'utf8');
  assert.ok(v.includes('WScript.ScriptFullName'));
  assert.ok(v.includes('CreateObject("WScript.Shell").Run """" & d & "\\node\\node.exe"" """ & d & "\\arranque.mjs""", 0, False'), v);
  // solo ASCII: wscript lee un .vbs sin BOM como ANSI
  assert.ok([...readFileSync(VBS)].every((b) => b < 0x80));
});

test('vigilancia 3: el .vbs arranca de verdad con wscript en una carpeta con espacios y acentos y hereda el entorno', SOLO_WINDOWS, async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'snf-vbs-'));
  // el node.exe que lanza wscript puede tardar un momento en salir después de escribir visto.json (EPERM al quitarlo)
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 }));
  const d = join(base, 'José Ñandú', 'Programs', 'Snet Forever');
  mkdirSync(join(d, 'node'), { recursive: true });
  copyFileSync(process.execPath, join(d, 'node', 'node.exe'));
  copyFileSync(VBS, join(d, 'SnetForever.vbs'));
  // un arranque.mjs falso: apunta su entorno y sus argumentos y sale
  writeFileSync(join(d, 'arranque.mjs'), [
    "import { writeFileSync } from 'node:fs';",
    "import { dirname, join } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    'const aqui = dirname(fileURLToPath(import.meta.url));',
    "writeFileSync(join(aqui, 'visto.json'), JSON.stringify({ reinicio: process.env.SNF_REINICIO_DE ?? null, argv: process.argv.slice(2), aqui, exe: process.execPath }));",
    '',
  ].join('\n'));
  const r = spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wscript.exe'), ['//B', '//Nologo', join(d, 'SnetForever.vbs')], {
    env: { ...process.env, SNF_REINICIO_DE: '4242' }, timeout: 30_000, windowsHide: true,
  });
  assert.equal(r.status, 0, String(r.stderr ?? ''));
  const visto = join(d, 'visto.json');
  for (let i = 0; i < 600 && !existsSync(visto); i++) await dormir(100);
  assert.ok(existsSync(visto), 'el .vbs no llegó a lanzar arranque.mjs');
  let datos = null;
  for (let i = 0; i < 50 && datos === null; i++) {
    try {
      datos = JSON.parse(readFileSync(visto, 'utf8'));
    } catch {
      await dormir(100);
    }
  }
  assert.equal(datos.reinicio, '4242');
  assert.deepEqual(datos.argv, []);
  assert.equal(datos.aqui.toLowerCase(), d.toLowerCase());
  assert.equal(datos.exe.toLowerCase(), join(d, 'node', 'node.exe').toLowerCase());
});

// ---------- compilar (solo si está Inno Setup) ----------

test('compilar: con la raíz de prueba da un .exe de más de 1 MB en menos de 120 s, sin «Error» en la salida de ISCC', SOLO_WINDOWS, (t) => {
  const iscc = buscarIscc();
  if (iscc === null) {
    t.skip('no está ISCC.exe (Inno Setup 6)');
    return;
  }
  const c = carpetaPrueba(t);
  // ronda 1, I3: para las pruebas se compila con el resumen de la licencia de Node, con un aviso (no se puede publicar)
  const avisos = [];
  const raiz = preparar(c, { nodeLicencia: comun.licenciaResumen, exigirLicenciaCompleta: false, avisar: (x) => avisos.push(x) });
  assert.equal(avisos.length, 1);
  const salida = join(c.base, 'instalador ñ');
  let registro = '';
  const inicio = Date.now();
  const exe = compilar({ raiz, version: '0.5.0', iscc, salida, registro: (texto) => { registro += texto; } });
  const ms = Date.now() - inicio;
  assert.equal(exe, join(salida, 'SnetForever-Instalador-0.5.0.exe'));
  assert.equal(NOMBRE_EXE('0.5.0'), 'SnetForever-Instalador-0.5.0.exe');
  assert.ok(statSync(exe).size > 2 ** 20, `${statSync(exe).size} bytes`);
  assert.ok(ms < 120_000, `${ms} ms`);
  assert.doesNotMatch(registro, /Error/);
  assert.match(registro, /Successful compile/i);
  // un segundo .exe con el mismo nombre no pisa el primero: el de antes va a la cuarentena
  compilar({ raiz, version: '0.5.0', iscc, salida, env: { SNF_CUARENTENA: c.cuarentena } });
  assert.equal(listar(c.cuarentena).filter((r) => r.endsWith('SnetForever-Instalador-0.5.0.exe')).length, 1);
});

test('compilar: sin ISCC o con una versión que no vale, ErrorInstalador sin lanzar nada', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'snf-compilar-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  assert.throws(() => compilar({ raiz: base, version: '0.5.0', iscc: null, salida: base }), (e) => e instanceof ErrorInstalador && e.code === 'iscc');
  assert.throws(() => compilar({ raiz: base, version: '0.5.0', iscc: join(base, 'ISCC.exe'), salida: base }), (e) => e.code === 'iscc');
  writeFileSync(join(base, 'ISCC.exe'), 'x');
  for (const v of ['', '0.5', '0.5.0 /DX=1', '0.5.0"']) {
    assert.throws(() => compilar({ raiz: base, version: v, iscc: join(base, 'ISCC.exe'), salida: base }), (e) => e.code === 'version', v);
  }
});

// ---------- la orden npm run instalador ----------

test('npm run instalador: sin --publicacion o con una opción que no existe, sale con 2', () => {
  const salida = { texto: '', write(x) { this.texto += x; } };
  const errores = { texto: '', write(x) { this.texto += x; } };
  assert.equal(principal([], { salida, errores }), 2);
  assert.match(errores.texto, /--publicacion/);
  assert.equal(principal(['--publicacion', 'x', '--otra', 'y'], { salida, errores }), 2);
  assert.equal(salida.texto, '');
});

test('npm run instalador: sin ISCC sale con 1 sin preparar nada', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'snf-cli-inst-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const salida = { texto: '', write(x) { this.texto += x; } };
  const errores = { texto: '', write(x) { this.texto += x; } };
  const raiz = join(base, 'raíz');
  const codigo = principal(['--publicacion', join(base, 'pub'), '--raiz', raiz], { env: { SNF_ISCC: join(base, 'no está.exe') }, salida, errores, existe: () => false });
  assert.equal(codigo, 1);
  assert.match(errores.texto, /Inno Setup/);
  assert.equal(existsSync(raiz), false);
});

test('LICENCIAS.txt cita Montserrat y Roboto (SIL OFL 1.1), en español y en inglés, y sus textos van con el addon de comercio', () => {
  const texto = readFileSync(join(EMPAQUETAR, 'plantillas', 'LICENCIAS.txt'), 'utf8');
  const [es, en] = texto.split(/^-{20,}\r?$/m);
  assert.ok(es && en, 'las dos partes (es y en) están separadas por la línea de guiones');
  for (const [idioma, parte] of [['es', es], ['en', en]]) {
    for (const nombre of ['Montserrat', 'Roboto']) assert.ok(parte.includes(nombre), `${idioma}: falta ${nombre}`);
    assert.match(parte, /SIL Open Font License, (?:versión|Version) 1\.1/, idioma);
    assert.match(parte, /OFL 1\.1/, idioma);
    assert.match(parte, /Montserrat-OFL\.txt/, idioma);
    assert.match(parte, /Roboto-OFL\.txt/, idioma);
  }
  // Task 8, ronda 1: lo que dice el último párrafo de lo que lleva cada addon tiene que ser verdad
  const addons = join(EMPAQUETAR, '..', '..', 'addons');
  const license = (component) => readFileSync(join(addons, component, 'LICENSE'), 'utf8');
  assert.match(license('SnetForever_Rutas'), /^Creative Commons Attribution-NonCommercial-ShareAlike 4\.0/);
  assert.match(license('SnetForever_Misiones'), /^# GNU GENERAL PUBLIC LICENSE\s+Version 3/);
  const core = license('SnetForever');
  const desktop = license('../app');
  const licComercio = license('SnetForever_Comercio');
  for (const text of [core, desktop, licComercio]) {
    assert.match(text, /^SnetForever collaboration license/);
    assert.match(text, /does not authorize general end-user use, sale, commercial exploitation/);
    for (const handle of ['@davrodwconnections', '@davidrod-WaveNorth', '@alvarezalain262-create']) {
      assert.ok(text.includes(handle));
    }
  }
  for (const text of [core, desktop]) {
    assert.match(text, /^MIT License\s+Copyright .*chelinho139.*NeverQuestAlone/m);
  }
  const titular = (t) => /^Copyright .*$/m.exec(t)?.[0];
  assert.equal(titular(licComercio), titular(readFileSync(join(addons, 'SnetForever', 'LICENSE'), 'utf8')));
  assert.equal((licComercio.match(/^Copyright /gm) || []).length, 1, 'un solo titular');
  assert.ok(!/NeverQuestAlone/.test(licComercio));
  for (const ruta of licComercio.match(/[A-Za-z_]+\/[A-Za-z_]+\.lua/g) || []) {
    assert.ok(existsSync(join(addons, 'SnetForever_Comercio', ...ruta.split('/'))), `el LICENSE cita ${ruta}, que no está en SnetForever_Comercio`);
  }
  for (const [idioma, parte] of [['es', es], ['en', en]]) {
    assert.doesNotMatch(parte, /LICENSE (?:y|and) (?:su )?CREDITOS.md/, `${idioma}: ya no dice que todos llevan CREDITOS.md`);
    assert.match(parte, /LICENSE/, idioma);
  }
  // los textos completos de las dos licencias existen donde dice la plantilla
  const letras = join(addons, 'SnetForever_Comercio', 'recursos', 'letras');
  for (const f of ['Montserrat-OFL.txt', 'Roboto-OFL.txt']) {
    assert.match(readFileSync(join(letras, f), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/, f);
  }
});

test('Task 8b, M3: con la carpeta de una publicación puente, prepararRaiz dice que es la puente y que va la normal', SOLO_WINDOWS, (t) => {
  const c = carpetaPrueba(t);
  const puente = publicar({
    raiz: comun.repo, salida: join(c.base, 'publicación'), comprobarGit: false, env: { ...comun.env, SNF_CUARENTENA: c.cuarentena },
    ahora: AHORA, claveApp: comun.publica, soloApp: true,
  }).carpeta;
  assert.throws(() => preparar(c, { publicacionDir: puente }), (e) => {
    assert.ok(e instanceof ErrorInstalador);
    assert.equal(e.code, 'publicacion');
    assert.match(e.message, /publicación puente \(solo la app\)/);
    assert.match(e.message, /carpeta de la publicación normal/);
    return true;
  });
  assert.equal(existsSync(c.salida), false);
});
