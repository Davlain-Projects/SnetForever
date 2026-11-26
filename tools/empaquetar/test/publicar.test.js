// Pruebas de `npm run publicar` (fase 5, tarea 15): prepara una publicación firmada en una carpeta local y no sube nada.
//
// - Cada prueba trabaja sobre una copia de test/fixtures/repo-mini en una carpeta temporal, con `comprobarGit: false`
//   (salvo las de git, que crean un repositorio de git temporal).
// - La clave de firma es temporal (SNF_FIRMA_DIR=<tmp>\fírma, creada con crearClave y DPAPI): nunca se toca la carpeta de
//   verdad (%USERPROFILE%\.snetforever-firma). Por eso casi todas las pruebas solo corren en Windows.
// - La cuarentena también es temporal (SNF_CUARENTENA). No hay red.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { publicar, ErrorPublicar, SALIDA_POR_DEFECTO } from '../src/publicar.mjs';
import { crearClave, clavePublica } from '../src/firma/clave.mjs';
import { abrirPaquete } from '../../../app/src/actualizar/paquete.mjs';
import { APP_CONOCE_COMERCIO, comprobarPaquete, compararVersiones, leerManifiesto, verificarFirma } from '../../../app/src/actualizar/manifiesto.mjs';
import { REPO_POR_DEFECTO } from '../../../app/src/actualizar/origen.mjs';
import { CLAVE_PUBLICA } from '../../../app/src/actualizar/clave-publica.mjs';

const EMPAQUETAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICAR = join(EMPAQUETAR, 'src', 'publicar.mjs');
const REPO_MINI = join(EMPAQUETAR, 'test', 'fixtures', 'repo-mini');
const SOLO_WINDOWS = { skip: process.platform !== 'win32' };
const AHORA = new Date('2026-11-10T12:00:00.000Z');
const PUB = 'v0.5.0-2026.11.11.1';
const PAQUETES = {
  addon: 'SnetForever-addon-0.5.0.snfpaq',
  rutas: 'SnetForever-rutas-2026.11.11.1.snfpaq',
  misiones: 'SnetForever-misiones-2026.11.11.1.snfpaq',
  comercio: 'SnetForever-comercio-0.5.3.snfpaq', // su versión es la de su .toc, no la del addon (Task 8)
  app: 'SnetForever-app-0.5.0.snfpaq',
};
const SIETE = [...Object.values(PAQUETES), 'snetforever-manifiesto.json', 'snetforever-manifiesto.json.sig'];
const CARPETA_DE = { addon: 'addons', rutas: 'addons', misiones: 'addons', comercio: 'addons', app: '.' };
const RAIZ_DE = {
  addon: 'SnetForever', rutas: 'SnetForever_Rutas', misiones: 'SnetForever_Misiones', comercio: 'SnetForever_Comercio', app: 'app',
};

// Una sola clave temporal para todo el archivo (crearla con DPAPI tarda medio segundo).
let firma = null;
before(() => {
  if (process.platform !== 'win32') return;
  const raiz = mkdtempSync(join(tmpdir(), 'snf-clave-pub-'));
  const carpeta = join(raiz, 'fírma');
  crearClave({ env: { SNF_FIRMA_DIR: carpeta } });
  firma = { raiz, carpeta };
});
after(() => {
  if (firma) rmSync(firma.raiz, { recursive: true, force: true });
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

// Una copia de repo-mini en una carpeta temporal (con espacios y tildes), que se quita al acabar la prueba.
function copiaRepo(t) {
  const base = mkdtempSync(join(tmpdir(), 'snf-publicar-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, 'Repo Ñandú');
  copiar(REPO_MINI, repo);
  return {
    base, repo, salida: join(base, 'salida', 'dist'), cuarentena: join(base, 'cuarentena'),
    env: { SNF_FIRMA_DIR: firma?.carpeta, SNF_CUARENTENA: join(base, 'cuarentena') },
  };
}

// publicar sobre la copia, sin git y con la clave temporal; la copia temporal del addon (si la hay) se quita al acabar.
function publicarCopia(t, c, extra = {}) {
  const r = publicar({
    // repo-mini lleva la app 0.5.0: se baja el mínimo que exige publicar para el comercio (Task 8, ronda 1); la prueba de abajo usa el de verdad
    raiz: c.repo, salida: c.salida, comprobarGit: false, env: c.env, ahora: AHORA, claveApp: clavePublica({ env: c.env }), appConoceComercio: '0.5.0',
    sinPuente: true, // Task 8b, ronda 1: aquí no se prueba el orden de firma (lo prueba puente.test.js)
    ...extra,
  });
  if (r.copiaTemporal) t.after(() => rmSync(r.copiaTemporal, { recursive: true, force: true }));
  return r;
}

function lanza(fn, code) {
  assert.throws(fn, (e) => {
    assert.ok(e instanceof ErrorPublicar, `se esperaba ErrorPublicar y salió ${e?.name}: ${e?.message}`);
    assert.equal(e.code, code, e.message);
    return true;
  });
}

// Las rutas (con «/») de todos los archivos bajo `dir`, con `prefijo` delante.
function arbol(dir, prefijo) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...arbol(ruta, `${prefijo}/${nombre}`));
    else salida.push(`${prefijo}/${nombre}`);
  }
  return salida.sort();
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const editar = (ruta, de, a) => {
  const texto = readFileSync(ruta, 'utf8');
  assert.ok(typeof de === 'string' ? texto.includes(de) : de.test(texto), `${ruta} no contiene ${de}`);
  writeFileSync(ruta, texto.replace(de, a));
};

test('salen los 7 archivos que hay que subir y el LEEME, en <salida>/<publicacion>', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const r = publicarCopia(t, c);
  assert.equal(r.carpeta, join(c.salida, PUB));
  assert.deepEqual(readdirSync(r.carpeta).sort(), [...SIETE, 'LEEME-PUBLICAR.txt'].sort());
  assert.deepEqual(r.archivos.map((a) => basename(a)).sort(), [...SIETE].sort());
  for (const a of r.archivos) assert.equal(dirname(a), r.carpeta);
  assert.equal(r.leeme, join(r.carpeta, 'LEEME-PUBLICAR.txt'));
});

test('leerManifiesto acepta el manifiesto y verificarFirma con la pública da verdadero (con otra, falso)', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const r = publicarCopia(t, c, { notas: { es: 'Primera versión', en: 'First version' } });
  const bytes = readFileSync(join(r.carpeta, 'snetforever-manifiesto.json'));
  const sig = readFileSync(join(r.carpeta, 'snetforever-manifiesto.json.sig'), 'utf8');
  assert.equal(verificarFirma(bytes, sig, clavePublica({ env: c.env })), true);
  const otra = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.equal(verificarFirma(bytes, sig, otra), false);
  assert.match(sig, /^[A-Za-z0-9+/]{86}==\n$/);
  const m = leerManifiesto(bytes);
  assert.deepEqual(JSON.parse(bytes.toString('utf8')), JSON.parse(JSON.stringify(r.manifiesto)));
  // JSON con 2 espacios y un salto de línea al final
  assert.equal(bytes.toString('utf8'), `${JSON.stringify(JSON.parse(bytes.toString('utf8')), null, 2)}\n`);
  assert.equal(m.esquema, 1);
  assert.equal(m.producto, 'SnetForever');
  assert.equal(m.publicacion, PUB);
  assert.equal(m.fecha, AHORA.toISOString());
  assert.deepEqual(m.notas, { es: 'Primera versión', en: 'First version' });
  const { addon, rutas, misiones, comercio, app } = m.componentes;
  assert.deepEqual([addon.version, rutas.version, misiones.version, comercio.version, app.version], ['0.5.0', '2026.11.11.1', '2026.11.11.1', '0.5.3', '0.5.0']);
  // appMinima y nodeMinimo siempre; el esquema de datos (F5-2) en el addon y en los datos, nunca en la app ni en el comercio
  assert.equal(addon.appMinima, '0.5.0');
  assert.equal(comercio.appMinima, '0.5.0');
  assert.equal(app.nodeMinimo, '24.0.0');
  assert.deepEqual([addon.esquemaDatos, rutas.esquemaDatos, misiones.esquemaDatos], [1, 1, 1]);
  assert.equal(Object.hasOwn(app, 'esquemaDatos'), false);
  assert.equal(Object.hasOwn(comercio, 'esquemaDatos'), false);
  for (const [componente, archivo] of Object.entries(PAQUETES)) assert.equal(m.componentes[componente].archivo, archivo);
});

test('sin notas, el manifiesto lleva las dos vacías', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const r = publicarCopia(t, c);
  assert.deepEqual(r.manifiesto.notas, { es: '', en: '' });
  lanza(() => publicarCopia(t, copiaRepo(t), { notas: { es: 1, en: '' } }), 'notas');
});

test('cada .snfpaq se abre con su componente, con las rutas del árbol, y su tamaño y SHA-256 son los del manifiesto', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const r = publicarCopia(t, c);
  const m = leerManifiesto(readFileSync(join(r.carpeta, 'snetforever-manifiesto.json')));
  for (const [componente, archivo] of Object.entries(PAQUETES)) {
    const buffer = readFileSync(join(r.carpeta, archivo));
    assert.equal(m.componentes[componente].tamano, buffer.length, componente);
    assert.equal(m.componentes[componente].tamano, statSync(join(r.carpeta, archivo)).size, componente);
    assert.equal(m.componentes[componente].sha256, sha256(buffer), componente);
    const abierto = abrirPaquete(buffer, { componente });
    comprobarPaquete(m, componente, buffer); // versión y esquema de datos de la cabecera = los de su entrada
    const carpeta = join(c.repo, CARPETA_DE[componente], RAIZ_DE[componente]);
    let esperadas = arbol(carpeta, RAIZ_DE[componente]);
    if (componente === 'app') esperadas = esperadas.filter((ruta) => !ruta.startsWith('app/test/'));
    assert.deepEqual(abierto.archivos.map((a) => a.ruta), esperadas, componente);
    for (const a of abierto.archivos) {
      assert.deepEqual(a.datos, readFileSync(join(c.repo, CARPETA_DE[componente], ...a.ruta.split('/'))), a.ruta);
    }
  }
});

test('the desktop package excludes tests, dependencies and TypeScript sources', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  mkdirSync(join(c.repo, 'app', 'typescript'));
  writeFileSync(join(c.repo, 'app', 'typescript', 'texto.mts'), 'export {};\n');
  mkdirSync(join(c.repo, 'app', 'node_modules', 'algo'), { recursive: true });
  writeFileSync(join(c.repo, 'app', 'node_modules', 'algo', 'index.js'), 'export default 1;\n');
  const r = publicarCopia(t, c);
  const rutas = abrirPaquete(readFileSync(join(r.carpeta, PAQUETES.app)), { componente: 'app' }).archivos.map((a) => a.ruta);
  assert.equal(rutas.includes('app/test/x.test.js'), false);
  assert.equal(rutas.some((ruta) => ruta.startsWith('app/test/') || ruta.startsWith('app/node_modules/')), false);
  assert.deepEqual(rutas, ['app/package.json', 'app/src/principal.mjs', 'app/src/version.mjs']);
});

test('Misiones lleva los archivos de X-SNF-App (los lee la app) y ninguna ranura de buzón va en los paquetes', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  mkdirSync(join(c.repo, 'addons', 'SnetForever_R001'));
  writeFileSync(join(c.repo, 'addons', 'SnetForever_R001', 'SnetForever_R001.toc'), '## Interface: 16001\n');
  const r = publicarCopia(t, c);
  const misiones = abrirPaquete(readFileSync(join(r.carpeta, PAQUETES.misiones)), { componente: 'misiones' }).archivos.map((a) => a.ruta);
  for (const nombre of ['object_1.lua', 'es_object_1.lua']) assert.ok(misiones.includes(`SnetForever_Misiones/${nombre}`), nombre);
  for (const [componente, archivo] of Object.entries(PAQUETES)) {
    const rutas = abrirPaquete(readFileSync(join(r.carpeta, archivo)), { componente }).archivos.map((a) => a.ruta);
    assert.equal(rutas.some((ruta) => /^SnetForever_R\d/.test(ruta)), false, componente);
  }
});

test('un archivo de X-SNF-App que falta → \'archivo\' y no se publica nada', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  editar(join(c.repo, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc'), 'es_object_1.lua', 'es_object_9.lua');
  lanza(() => publicarCopia(t, c), 'archivo');
  assert.equal(existsSync(c.salida), false);
});

test('publicar dos veces: la primera carpeta acaba en SNF_CUARENTENA, entera', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const primera = publicarCopia(t, c);
  const antes = Object.fromEntries(readdirSync(primera.carpeta).map((n) => [n, readFileSync(join(primera.carpeta, n))]));
  const segunda = publicarCopia(t, c, { ahora: new Date('2026-11-10T13:00:00.000Z') });
  assert.equal(segunda.carpeta, primera.carpeta);
  assert.equal(segunda.manifiesto.fecha, '2026-11-10T13:00:00.000Z');
  const sellos = readdirSync(c.cuarentena);
  assert.equal(sellos.length, 1);
  const apartada = join(c.cuarentena, sellos[0], PUB);
  assert.equal(segunda.apartada, apartada);
  assert.deepEqual(readdirSync(apartada).sort(), Object.keys(antes).sort());
  for (const [nombre, bytes] of Object.entries(antes)) assert.deepEqual(readFileSync(join(apartada, nombre)), bytes, nombre);
  assert.equal(primera.apartada, null);
});

test('con VERSION = "0.4.0" en espacio.lua → \'version\' y no se publica nada', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  editar(join(c.repo, 'addons', 'SnetForever', 'nucleo', 'espacio.lua'), 'VERSION = "0.5.0"', 'VERSION = "0.4.0"');
  lanza(() => publicarCopia(t, c), 'version');
  assert.equal(existsSync(c.salida), false);
  assert.equal(existsSync(c.cuarentena), false);
});

test('la versión de la app: version.mjs igual que package.json (si no, \'version\')', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  editar(join(c.repo, 'app', 'package.json'), '"version": "0.5.0"', '"version": "0.5.1"');
  lanza(() => publicarCopia(t, c), 'version');
  const d = copiaRepo(t);
  editar(join(d.repo, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc'), '## Version: 2026.11.11.1', '## Version: hoy');
  lanza(() => publicarCopia(t, d), 'version');
  assert.equal(existsSync(c.salida) || existsSync(d.salida), false);
});

test('con version: {addon: \'0.5.0.1\'} el manifiesto dice 0.5.0.1 y el .toc de repo-mini sigue en 0.5.0', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const toc = join(c.repo, 'addons', 'SnetForever', 'SnetForever.toc');
  const tocAntes = readFileSync(toc);
  const r = publicarCopia(t, c, { version: { addon: '0.5.0.1' } });
  assert.equal(r.manifiesto.componentes.addon.version, '0.5.0.1');
  assert.equal(r.manifiesto.componentes.addon.archivo, 'SnetForever-addon-0.5.0.1.snfpaq');
  assert.ok(existsSync(join(r.carpeta, 'SnetForever-addon-0.5.0.1.snfpaq')));
  // el resto no cambia
  assert.equal(r.manifiesto.componentes.app.version, '0.5.0');
  assert.equal(r.manifiesto.componentes.addon.appMinima, '0.5.0');
  const abierto = abrirPaquete(readFileSync(join(r.carpeta, 'SnetForever-addon-0.5.0.1.snfpaq')), { componente: 'addon' });
  assert.equal(abierto.version, '0.5.0.1');
  const dentro = (ruta) => abierto.archivos.find((a) => a.ruta === ruta).datos.toString('utf8');
  assert.match(dentro('SnetForever/SnetForever.toc'), /^## Version: 0\.5\.0\.1\r?$/m);
  assert.match(dentro('SnetForever/nucleo/espacio.lua'), /VERSION = "0\.5\.0"/); // solo cambia el .toc de la copia
  // el repositorio no cambia
  assert.deepEqual(readFileSync(toc), tocAntes);
  assert.match(readFileSync(toc, 'utf8'), /^## Version: 0\.5\.0\r?$/m);
  assert.ok(r.copiaTemporal && !r.copiaTemporal.startsWith(c.repo));
  lanza(() => publicarCopia(t, copiaRepo(t), { version: { addon: '0.5.x' } }), 'version');
});

test('version.addon con %TEMP% en una carpeta con tildes (C:\\Users\\José Ñandú\\…)', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const temp = join(c.base, 'José Ñandú', 'Temp');
  mkdirSync(temp, { recursive: true });
  const antes = { TEMP: process.env.TEMP, TMP: process.env.TMP };
  t.after(() => {
    for (const [k, v] of Object.entries(antes)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
  process.env.TEMP = temp;
  process.env.TMP = temp;
  const r = publicarCopia(t, c, { version: { addon: '0.5.0.1' } });
  assert.equal(dirname(r.copiaTemporal), temp);
  assert.ok(existsSync(join(r.copiaTemporal, 'SnetForever', 'nucleo', 'espacio.lua')));
  const abierto = abrirPaquete(readFileSync(join(r.carpeta, 'SnetForever-addon-0.5.0.1.snfpaq')), { componente: 'addon' });
  assert.deepEqual(abierto.archivos.map((a) => a.ruta), arbol(join(c.repo, 'addons', 'SnetForever'), 'SnetForever'));
});

test('F5-2: el X-SNF-EsquemaDatos del addon tiene que ser el esquema de los datos (si no, \'compatibilidad\')', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  editar(join(c.repo, 'addons', 'SnetForever', 'SnetForever.toc'), '## X-SNF-EsquemaDatos: 1', '## X-SNF-EsquemaDatos: 2');
  lanza(() => publicarCopia(t, c), 'compatibilidad');
  const d = copiaRepo(t);
  editar(join(d.repo, 'addons', 'SnetForever_Misiones', 'nucleo.lua'), 'esquema=1', 'esquema=2');
  lanza(() => publicarCopia(t, d), 'compatibilidad');
  const e = copiaRepo(t);
  editar(join(e.repo, 'addons', 'SnetForever', 'SnetForever.toc'), /## X-SNF-EsquemaDatos: 1\r?\n/, '');
  lanza(() => publicarCopia(t, e), 'compatibilidad');
  for (const x of [c, d, e]) assert.equal(existsSync(x.salida), false);
});

test('se niega a firmar un manifiesto con fecha del futuro (\'fecha\')', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  lanza(() => publicarCopia(t, c, { ahora: new Date(Date.now() + 3_600_000) }), 'fecha');
  lanza(() => publicarCopia(t, c, { ahora: new Date('no es una fecha') }), 'fecha');
  assert.equal(existsSync(c.salida), false);
});

test('la publicación: por defecto v<app>-<rutas>; se puede elegir, pero tiene que valer para el manifiesto', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const r = publicarCopia(t, c, { publicacion: 'v0.5.0-7' });
  assert.equal(r.carpeta, join(c.salida, 'v0.5.0-7'));
  assert.equal(r.manifiesto.publicacion, 'v0.5.0-7');
  for (const mala of ['v0.5.0-prueba', '..', 'v0.5.0/x', '', 7]) lanza(() => publicarCopia(t, c, { publicacion: mala }), 'publicacion');
  assert.deepEqual(readdirSync(c.salida), ['v0.5.0-7']);
  // una publicación que no vale no deja ni la copia temporal del addon
  const temporalesAntes = readdirSync(tmpdir()).filter((n) => n.startsWith('snf-publicar-addon-')).sort();
  lanza(() => publicarCopia(t, c, { publicacion: 'v0.5.0-prueba', version: { addon: '0.5.0.1' } }), 'publicacion');
  assert.deepEqual(readdirSync(tmpdir()).filter((n) => n.startsWith('snf-publicar-addon-')).sort(), temporalesAntes);
});

test('el LEEME dice que NO se han subido, con el texto exacto, y lista los 7 archivos', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const r = publicarCopia(t, c);
  const leeme = readFileSync(r.leeme, 'utf8');
  assert.ok(leeme.includes('NO se han subido'));
  assert.ok(leeme.includes(`Estos archivos NO se han subido a ningún sitio. Para publicarlos, el jugador crea en GitHub (github.com/${REPO_POR_DEFECTO}/releases/new) una versión con la etiqueta ${PUB}, sube los 7 archivos de esta carpeta y la marca como "Latest". Nadie más lo hace por él.`));
  for (const nombre of SIETE) assert.ok(leeme.includes(nombre), nombre);
  assert.equal(/\{\{|\}\}/.test(leeme), false, 'quedan marcas de la plantilla sin rellenar');
});

test('sin clave de firma → ErrorFirma \'no-hay\' y no se publica nada', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const env = { ...c.env, SNF_FIRMA_DIR: join(c.base, 'sin-clave') };
  assert.throws(() => publicar({ raiz: c.repo, salida: c.salida, comprobarGit: false, env, ahora: AHORA, appConoceComercio: '0.5.0' }), (e) => e.code === 'no-hay');
  assert.equal(existsSync(c.salida), false);
});

// ---------- revisión final, I1: la clave de la firma tiene que ser la que lleva la app ----------

test('revisión final, I1: con otra clave en la app (CLAVE_PUBLICA) se niega (\'clave\') y no se publica nada', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const otra = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  lanza(() => publicarCopia(t, c, { claveApp: otra }), 'clave');
  // una clave que no se entiende, tampoco
  lanza(() => publicarCopia(t, c, { claveApp: 'no es una clave' }), 'clave');
  assert.equal(existsSync(c.salida), false);
});

test('revisión final, I1: con la misma clave en la app se publica (también con saltos de línea de Windows)', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const pem = clavePublica({ env: c.env });
  const r = publicarCopia(t, c, { claveApp: pem.replace(/\r?\n/g, '\r\n') });
  assert.equal(r.sinClaveApp, false);
  assert.ok(existsSync(join(r.carpeta, 'snetforever-manifiesto.json.sig')));
});

test('revisión final, I1: con la clave de la app en null se publica, pero se avisa (sinClaveApp)', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const r = publicarCopia(t, c, { claveApp: null });
  assert.equal(r.sinClaveApp, true);
});

test('por defecto publica en tools/empaquetar/dist/publicacion (fuera de git)', () => {
  assert.equal(SALIDA_POR_DEFECTO, join(EMPAQUETAR, 'dist', 'publicacion'));
  assert.match(readFileSync(join(EMPAQUETAR, '..', '..', '.gitignore'), 'utf8'), /^tools\/empaquetar\/dist\/\r?$/m);
});

// ---------- git ----------

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid', '-c', 'core.autocrlf=false', ...args], {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 60_000,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function repoGit(t) {
  const c = copiaRepo(t);
  git(c.repo, 'init', '-q');
  git(c.repo, 'add', '-A');
  git(c.repo, 'commit', '-q', '-m', 'repo-mini');
  return c;
}

test('con comprobarGit, se niega (\'sucio\') si git status --porcelain -- addons app no está vacío', SOLO_WINDOWS, (t) => {
  const c = repoGit(t);
  const r = publicar({ raiz: c.repo, salida: c.salida, env: c.env, ahora: AHORA, claveApp: clavePublica({ env: c.env }), appConoceComercio: '0.5.0', sinPuente: true }); // comprobarGit = true por defecto
  assert.ok(existsSync(join(r.carpeta, 'snetforever-manifiesto.json')));
  // un archivo cambiado en app/ o uno nuevo en addons/ → sucio
  writeFileSync(join(c.repo, 'app', 'src', 'principal.mjs'), 'export const listo = false;\n');
  lanza(() => publicar({ raiz: c.repo, salida: join(c.base, 'otra'), env: c.env, ahora: AHORA, claveApp: clavePublica({ env: c.env }), appConoceComercio: '0.5.0', sinPuente: true }), 'sucio');
  writeFileSync(join(c.repo, 'app', 'src', 'principal.mjs'), readFileSync(join(REPO_MINI, 'app', 'src', 'principal.mjs')));
  writeFileSync(join(c.repo, 'addons', 'SnetForever', 'nuevo.lua'), '-- nuevo\n');
  lanza(() => publicar({ raiz: c.repo, salida: join(c.base, 'otra'), env: c.env, ahora: AHORA, claveApp: clavePublica({ env: c.env }), appConoceComercio: '0.5.0', sinPuente: true }), 'sucio');
  assert.equal(existsSync(join(c.base, 'otra')), false);
  // fuera de addons/ y app/ no importa
  git(c.repo, 'add', '-A');
  git(c.repo, 'commit', '-q', '-m', 'nuevo');
  writeFileSync(join(c.repo, 'notas.txt'), 'algo\n');
  publicar({ raiz: c.repo, salida: join(c.base, 'otra'), env: c.env, ahora: AHORA, claveApp: clavePublica({ env: c.env }), appConoceComercio: '0.5.0', sinPuente: true });
});

test('con comprobarGit y una carpeta que no es un repositorio de git → \'git\'', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  lanza(() => publicar({ raiz: c.repo, salida: c.salida, env: c.env, ahora: AHORA, claveApp: clavePublica({ env: c.env }), appConoceComercio: '0.5.0', sinPuente: true }), 'git');
  assert.equal(existsSync(c.salida), false);
});

test('CLI: npm run publicar -- --notas-es … --notas-en … --publicacion … --version-addon …', SOLO_WINDOWS, (t) => {
  const c = repoGit(t);
  const correr = (...args) => spawnSync(process.execPath, [PUBLICAR, '--raiz', c.repo, '--salida', c.salida, '--sin-puente', ...args], {
    cwd: EMPAQUETAR, encoding: 'utf8', windowsHide: true, timeout: 120_000,
    env: { ...process.env, SNF_FIRMA_DIR: c.env.SNF_FIRMA_DIR, SNF_CUARENTENA: c.cuarentena },
  });
  const r = correr('--notas-es', 'Primera versión para amigos', '--notas-en', 'First version for friends',
    '--publicacion', 'v0.5.0-9', '--version-addon', '0.5.0.1');
  if (CLAVE_PUBLICA !== null) {
    // T18: la app ya lleva la clave de verdad y la de esta prueba es temporal → la orden se niega (I1) y no publica nada
    const temporalNo = /^Copia temporal del addon[^:]*: (.+)$/m.exec(r.stdout)?.[1]?.trim();
    if (temporalNo) t.after(() => rmSync(temporalNo, { recursive: true, force: true }));
    assert.equal(r.status, 1, r.stderr + r.stdout);
    assert.match(r.stderr, /no es la que lleva la app/, r.stderr);
    assert.equal(existsSync(join(c.salida, 'v0.5.0-9')), false);
    assert.equal(correr('--subir').status, 2);
    return;
  }
  const temporal = /^Copia temporal del addon[^:]*: (.+)$/m.exec(r.stdout)?.[1]?.trim();
  if (temporal) t.after(() => rmSync(temporal, { recursive: true, force: true }));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const carpeta = join(c.salida, 'v0.5.0-9');
  assert.ok(r.stdout.includes(carpeta), r.stdout);
  assert.ok(r.stdout.includes('NO se han subido'), r.stdout);
  // revisión final, I1: mientras la app no lleve clave, la salida lo dice
  if (CLAVE_PUBLICA === null) assert.match(r.stdout, /AVISO: la app todavía no lleva clave pública \(CLAVE_PUBLICA = null/, r.stdout);
  assert.ok(temporal, r.stdout);
  const m = leerManifiesto(readFileSync(join(carpeta, 'snetforever-manifiesto.json')));
  assert.equal(m.componentes.addon.version, '0.5.0.1');
  assert.deepEqual(m.notas, { es: 'Primera versión para amigos', en: 'First version for friends' });
  // sucio → sale con 1 y lo dice
  writeFileSync(join(c.repo, 'addons', 'SnetForever', 'nuevo.lua'), '-- nuevo\n');
  const sucio = correr('--publicacion', 'v0.5.0-10');
  assert.equal(sucio.status, 1, sucio.stdout);
  assert.match(sucio.stderr, /sin guardar/);
  assert.equal(existsSync(join(c.salida, 'v0.5.0-10')), false);
  // una opción que no existe → 2
  const mala = correr('--subir');
  assert.equal(mala.status, 2);
});

// ---------- cumplimiento ----------

test('publicar.mjs solo lanza git status --porcelain -- addons app de child_process (solo lee)', () => {
  const codigo = readFileSync(PUBLICAR, 'utf8');
  const importaciones = [...codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]node:child_process['"]/g)];
  assert.equal(importaciones.length, 1);
  assert.deepEqual(importaciones[0][1].split(',').map((s) => s.trim()).filter(Boolean), ['execFileSync']);
  assert.equal(/require\s*\(|import\s*\(/.test(codigo), false);
  const llamadas = [...codigo.matchAll(/execFileSync\s*\(/g)];
  assert.equal(llamadas.length, 1);
  assert.match(codigo.slice(llamadas[0].index), /^execFileSync\s*\(\s*'git'\s*,\s*\['status', '--porcelain', '--', 'addons', 'app'\]/);
});

// ---------- Task 8: el addon de comercio (SnetForever_Comercio) ----------

test('publicar crea y firma el paquete de comercio', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  const r = publicarCopia(t, c);
  const archivo = join(r.carpeta, PAQUETES.comercio);
  assert.ok(existsSync(archivo), 'está SnetForever-comercio-<versión>.snfpaq en la carpeta de la publicación');
  assert.ok(r.archivos.includes(archivo), 'y es uno de los que hay que subir');
  const buffer = readFileSync(archivo);
  const bytes = readFileSync(join(r.carpeta, 'snetforever-manifiesto.json'));
  const sig = readFileSync(join(r.carpeta, 'snetforever-manifiesto.json.sig'), 'utf8');
  const m = leerManifiesto(bytes);
  // la entrada del manifiesto: la versión de su .toc, sin esquema de datos, con su tamaño y su SHA-256
  assert.deepEqual({ ...m.componentes.comercio }, {
    version: '0.5.3', archivo: PAQUETES.comercio, tamano: buffer.length, sha256: sha256(buffer), appMinima: '0.5.0',
  });
  // lo que lee la app: el paquete frente a su entrada, y su contenido es la carpeta SnetForever_Comercio entera
  const abierto = comprobarPaquete(m, 'comercio', buffer);
  assert.equal(abierto.esquemaDatos, undefined);
  assert.deepEqual(abierto.archivos.map((a) => a.ruta), [
    'SnetForever_Comercio/SnetForever_Comercio.toc',
    'SnetForever_Comercio/recursos/letras/Roboto-OFL.txt',
    'SnetForever_Comercio/ui/comercio.lua',
  ]);
  for (const a of abierto.archivos) assert.deepEqual(a.datos, readFileSync(join(c.repo, 'addons', ...a.ruta.split('/'))), a.ruta);
  // la firma cubre la entrada del comercio: la pública buena la verifica y, si se cambia el SHA-256 del comercio, ya no
  const publica = clavePublica({ env: c.env });
  assert.equal(verificarFirma(bytes, sig, publica), true);
  const cambiado = Buffer.from(bytes.toString('utf8').replace(sha256(buffer), '0'.repeat(64)), 'utf8');
  assert.notDeepEqual(cambiado, bytes);
  assert.equal(verificarFirma(cambiado, sig, publica), false);
});

test('comercio: sin su .toc, o con una versión que no vale, → error y no se publica nada', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  editar(join(c.repo, 'addons', 'SnetForever_Comercio', 'SnetForever_Comercio.toc'), '## Version: 0.5.3', '## Version: pronto');
  lanza(() => publicarCopia(t, c), 'version');
  const d = copiaRepo(t);
  rmSync(join(d.repo, 'addons', 'SnetForever_Comercio', 'SnetForever_Comercio.toc'));
  lanza(() => publicarCopia(t, d), 'archivo');
  assert.equal(existsSync(c.salida) || existsSync(d.salida), false);
});

test('una app vieja con un manifiesto nuevo no se rompe', SOLO_WINDOWS, async (t) => {
  // `viejo` es el lector de manifiestos y paquetes tal como lo lleva la app 0.6.x (copia congelada del commit 4b8d8ae)
  const viejo = await import(pathToFileURL(join(EMPAQUETAR, 'test', 'fixtures', 'app-0.6', 'manifiesto.mjs')).href);
  const c = copiaRepo(t);
  const r = publicarCopia(t, c);
  const bytes = readFileSync(join(r.carpeta, 'snetforever-manifiesto.json'));
  assert.ok(Object.hasOwn(JSON.parse(bytes.toString('utf8')).componentes, 'comercio'), 'el manifiesto nuevo sí trae el comercio');
  // la app vieja lo lee sin quejarse y se queda con los cuatro componentes que conoce (ignora el comercio)
  const m = viejo.leerManifiesto(bytes);
  assert.deepEqual(Object.keys(m.componentes).sort(), ['addon', 'app', 'misiones', 'rutas']);
  // y cada paquete de lo que conoce sigue pasando sus comprobaciones (tamaño, SHA-256, versión y esquema de datos)
  for (const componente of ['addon', 'rutas', 'misiones', 'app']) {
    assert.equal(viejo.comprobarPaquete(m, componente, readFileSync(join(r.carpeta, PAQUETES[componente]))).componente, componente);
  }
  // lo que ofrece a una app 0.4.x con todo viejo: el addon, los datos y la app; nunca el comercio (así se actualiza sola).
  // OJO (Task 8, ronda 1): la app vieja SÍ recibe el núcleo junto con la app nueva, porque su `appMinima` se cuenta contra la app
  // que va en la misma tanda; el lector 0.6.x no se puede cambiar, así que ese hueco solo se acorta (comprobación a los 10 s).
  const novedades = viejo.novedades(m, {
    instalado: { addon: '0.4.0', rutas: '2026.11.01.1', misiones: '2026.11.01.1' }, versionApp: '0.4.0', versionNode: '24.14.0',
  });
  assert.deepEqual(novedades.lista.map((i) => i.componente), ['addon', 'rutas', 'misiones', 'app']);
});

// ---------- Task 8, ronda 1: el núcleo y el comercio solo llegan con una app que conoce el comercio ----------

test('publicar se niega si lleva el comercio y la app es anterior a APP_CONOCE_COMERCIO (0.7.0), y no deja nada', SOLO_WINDOWS, (t) => {
  assert.equal(APP_CONOCE_COMERCIO, '0.7.0');
  const c = copiaRepo(t); // repo-mini lleva la app 0.5.0, anterior
  const sinOpcion = () => publicar({ raiz: c.repo, salida: c.salida, comprobarGit: false, env: c.env, ahora: AHORA, claveApp: clavePublica({ env: c.env }) });
  assert.throws(sinOpcion, (e) => {
    assert.ok(e instanceof ErrorPublicar);
    assert.equal(e.code, 'version');
    assert.match(e.message, /0\.5\.0/);
    assert.match(e.message, /0\.7\.0/);
    assert.match(e.message, /comercio/);
    return true;
  });
  assert.equal(existsSync(c.salida), false);
  assert.equal(existsSync(c.cuarentena), false);
});

test('con la app en 0.7.0, el núcleo y el comercio llevan appMinima 0.7.0 (como mínimo APP_CONOCE_COMERCIO)', SOLO_WINDOWS, (t) => {
  const c = copiaRepo(t);
  editar(join(c.repo, 'app', 'package.json'), '"version": "0.5.0"', '"version": "0.7.0"');
  editar(join(c.repo, 'app', 'src', 'version.mjs'), '0.5.0', '0.7.0');
  // sin el mínimo rebajado: el de verdad
  const r = publicar({ raiz: c.repo, salida: c.salida, comprobarGit: false, env: c.env, ahora: AHORA, claveApp: clavePublica({ env: c.env }), sinPuente: true });
  const { addon, comercio, app } = r.manifiesto.componentes;
  assert.equal(app.version, '0.7.0');
  for (const entrada of [addon, comercio]) {
    assert.ok(compararVersiones(entrada.appMinima, APP_CONOCE_COMERCIO) >= 0, entrada.archivo);
    assert.equal(entrada.appMinima, '0.7.0');
  }
});
