// Pruebas de la publicación puente (Task 8b): `publicar` con `soloApp` (`npm run publicar -- --solo-app`) saca una publicación
// que solo lleva la app. Es el primer paso de la 0.7.0 (docs/comercio/2026-11-15-publicar-0.7.0.md): las apps 0.6.x pasan a
// la app 0.7.0 y siguen con su núcleo 0.6.x entero (con el comercio dentro); el núcleo 0.7.0 y el comercio llegan después,
// en la publicación normal, juntos y a una app que ya los conoce.
//
// - Como en publicar.test.js: una copia de test/fixtures/repo-mini en una carpeta temporal, sin git, y una clave temporal
//   (DPAPI, SNF_FIRMA_DIR=<tmp>\fírma). Por eso solo corren en Windows.
// - La app 0.6.x es la copia congelada de su lector (test/fixtures/app-0.6, del commit 4b8d8ae); la app 0.7.0 es la de este
//   repositorio, pasada por src/simular-actualizacion.mjs (en 127.0.0.1), con un AddOns de mentira en una carpeta temporal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { publicar, principal } from '../src/publicar.mjs';
import { crearClave, clavePublica } from '../src/firma/clave.mjs';
import { simularActualizacion } from '../src/simular-actualizacion.mjs';
import { comprobarPaquete, leerManifiesto, novedades, verificarFirma } from '../../../app/src/actualizar/manifiesto.mjs';

const EMPAQUETAR = join(fileURLToPath(import.meta.url), '..', '..');
const REPO_MINI = join(EMPAQUETAR, 'test', 'fixtures', 'repo-mini');
const SOLO_WINDOWS = { skip: process.platform !== 'win32' };
const PUENTE = new Date('2026-11-10T12:00:00.000Z');
const NORMAL = new Date('2026-11-10T13:00:00.000Z'); // la de los addons, después de la puente
const APP = 'SnetForever-app-0.7.0.snfpaq';
const RUTAS = '2026.11.11.1'; // la de repo-mini (rutas y misiones no cambian entre los dos pasos)

const COPIA_ENV = { ...process.env };
let firma = null;
before(() => {
  if (process.platform !== 'win32') return;
  const raiz = mkdtempSync(join(tmpdir(), 'snf-clave-puente-'));
  const carpeta = join(raiz, 'fírma');
  crearClave({ env: { SNF_FIRMA_DIR: carpeta } });
  firma = { raiz, carpeta };
});
after(() => {
  for (const k of Object.keys(process.env)) if (!(k in COPIA_ENV)) delete process.env[k];
  Object.assign(process.env, COPIA_ENV);
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

const editar = (ruta, de, a) => {
  const texto = readFileSync(ruta, 'utf8');
  assert.ok(texto.includes(de), `${ruta} no contiene ${de}`);
  writeFileSync(ruta, texto.replace(de, a));
};
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// {ruta relativa: sha256} de todos los archivos bajo `dir`.
function huella(dir, base = dir, salida = {}) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (lstatSync(ruta).isDirectory()) huella(ruta, base, salida);
    else salida[relative(base, ruta)] = sha256(readFileSync(ruta));
  }
  return salida;
}

const versionToc = (addons, carpeta) => {
  const toc = join(addons, carpeta, `${carpeta}.toc`);
  return existsSync(toc) ? /^## Version: (.+?)\r?$/m.exec(readFileSync(toc, 'utf8'))?.[1] ?? null : null;
};

// El caso de la 0.7.0: el repositorio con el núcleo, el comercio y la app en 0.7.0, y un PC con el núcleo 0.6.4 (el comercio
// va dentro del núcleo) y sin SnetForever_Comercio.
function escenario(t) {
  const base = mkdtempSync(join(tmpdir(), 'snf-puente-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, 'Repo Ñandú');
  copiar(REPO_MINI, repo);
  const addonsRepo = join(repo, 'addons', 'SnetForever');
  editar(join(addonsRepo, 'SnetForever.toc'), '## Version: 0.5.0', '## Version: 0.7.0');
  editar(join(addonsRepo, 'nucleo', 'espacio.lua'), 'SNF.VERSION = "0.5.0"', 'SNF.VERSION = "0.7.0"');
  editar(join(repo, 'addons', 'SnetForever_Comercio', 'SnetForever_Comercio.toc'), '## Version: 0.5.3', '## Version: 0.7.0');
  editar(join(repo, 'app', 'package.json'), '"version": "0.5.0"', '"version": "0.7.0"');
  editar(join(repo, 'app', 'src', 'version.mjs'), '0.5.0', '0.7.0');

  // el PC: SnetForever 0.6.4 con su comercio dentro, y los datos de la misma versión que el repositorio
  const addons = join(base, 'Juegos Ñ', 'World of Warcraft', '_forever_', 'Interface', 'AddOns');
  for (const c of ['SnetForever', 'SnetForever_Rutas', 'SnetForever_Misiones']) copiar(join(REPO_MINI, 'addons', c), join(addons, c));
  editar(join(addons, 'SnetForever', 'SnetForever.toc'), '## Version: 0.5.0', '## Version: 0.6.4');
  editar(join(addons, 'SnetForever', 'nucleo', 'espacio.lua'), 'SNF.VERSION = "0.5.0"', 'SNF.VERSION = "0.6.4"');
  mkdirSync(join(addons, 'SnetForever', 'comercio'));
  writeFileSync(join(addons, 'SnetForever', 'comercio', 'ventana.lua'), '-- el comercio de la 0.6.4, dentro del núcleo\n');

  const datos = join(base, 'Datos Ñ');
  process.env.SNF_DATOS = datos; // el registro de la app usa process.env: nunca la carpeta de datos de verdad
  const env = { SNF_FIRMA_DIR: firma?.carpeta, SNF_CUARENTENA: join(base, 'cuarentena de publicar') };
  return {
    base, repo, addons, salida: join(base, 'publicaciones'), env,
    app: { SNF_DATOS: datos, SNF_CUARENTENA: join(base, 'Cuarentena Ñ'), SNF_INSTALACION: join(base, 'Programs', 'SnetForever'), SNF_IDIOMA: 'es' },
  };
}

// publicar desde el escenario, sin git y con la clave temporal (la app de la prueba lleva la misma clave)
const publicarEn = (e, extra) => publicar({
  raiz: e.repo, salida: e.salida, comprobarGit: false, env: e.env, claveApp: clavePublica({ env: e.env }), ...extra,
});

const simular = (e, carpeta) => simularActualizacion({
  publicacion: carpeta, addons: e.addons, env: e.app, clavePublica: clavePublica({ env: e.env }), juegoAbierto: async () => false,
  intervalo: 10, maxVueltas: 3, versionApp: '0.7.0',
});

test('la publicación puente lleva la app y ninguna novedad de addons ni comercio', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  const r = publicarEn(e, { soloApp: true, ahora: PUENTE });
  // por defecto se llama v<app>, sin las rutas: así no choca con la etiqueta de la publicación normal (v<app>-<rutas>)
  assert.equal(r.manifiesto.publicacion, 'v0.7.0');
  assert.equal(r.carpeta, join(e.salida, 'v0.7.0'));
  const tres = [APP, 'snetforever-manifiesto.json', 'snetforever-manifiesto.json.sig'];
  assert.deepEqual(r.archivos.map((a) => basename(a)).sort(), [...tres].sort());
  assert.deepEqual(readdirSync(r.carpeta).sort(), [...tres, 'LEEME-PUBLICAR.txt'].sort());
  // el manifiesto: solo la app (con su nodeMinimo), firmado; ni addon, ni datos, ni comercio
  const bytes = readFileSync(join(r.carpeta, 'snetforever-manifiesto.json'));
  assert.deepEqual(Object.keys(JSON.parse(bytes.toString('utf8')).componentes), ['app']);
  const m = leerManifiesto(bytes);
  assert.deepEqual(Object.keys(m.componentes), ['app']);
  assert.equal(m.componentes.app.version, '0.7.0');
  assert.equal(m.componentes.app.nodeMinimo, '24.0.0');
  assert.equal(comprobarPaquete(m, 'app', readFileSync(join(r.carpeta, APP))).componente, 'app');
  assert.equal(verificarFirma(bytes, readFileSync(join(r.carpeta, 'snetforever-manifiesto.json.sig'), 'utf8'), clavePublica({ env: e.env })), true);
  // el LEEME: dice que es la puente, que después viene la de los addons, y lista los 3 archivos
  const leeme = readFileSync(r.leeme, 'utf8');
  assert.ok(leeme.includes('NO se han subido'));
  assert.ok(leeme.includes('sube los 3 archivos de esta carpeta'), leeme);
  assert.match(leeme, /publicación puente/);
  assert.match(leeme, /solo lleva la app 0\.7\.0/);
  assert.match(leeme, /después viene la publicación de los addons/);
  assert.match(leeme, /npm run publicar/);
  for (const nombre of tres) assert.ok(leeme.includes(nombre), nombre);
  assert.equal(/\{\{|\}\}/.test(leeme), false, 'quedan marcas de la plantilla sin rellenar');
  // la publicación normal no lo dice
  const normal = readFileSync(publicarEn(e, { ahora: NORMAL }).leeme, 'utf8');
  assert.equal(/puente/.test(normal), false);
  assert.ok(normal.includes('sube los 7 archivos de esta carpeta'));
});

test('la publicación puente no mira los addons (un comercio a medias no la para)', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  rmSync(join(e.repo, 'addons', 'SnetForever_Comercio', 'SnetForever_Comercio.toc'));
  const r = publicarEn(e, { soloApp: true, ahora: PUENTE });
  assert.deepEqual(Object.keys(r.manifiesto.componentes), ['app']);
  // sin --solo-app, sí: la normal lleva el comercio y se niega
  assert.throws(() => publicarEn(e, { ahora: NORMAL, publicacion: 'v0.7.0-1' }), (err) => err.code === 'archivo');
});

test('CLI: npm run publicar -- --solo-app llega a publicar como la puente', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  const correr = (...args) => {
    let out = '';
    let err = '';
    const codigo = principal(['--raiz', e.repo, '--salida', e.salida, ...args], {
      env: e.env, salida: { write: (s) => { out += s; } }, errores: { write: (s) => { err += s; } },
    });
    return { codigo, out, err };
  };
  // la CLI usa la clave de la app de verdad (CLAVE_PUBLICA), que no es la temporal de la prueba: la puente entera no se puede sacar
  // aquí (la sacan las pruebas de arriba con la función). Lo que sí se ve: la opción existe y llega a publicar como `soloApp`,
  // porque la puente no admite --version-addon y lo dice antes de mirar git o la clave
  const r = correr('--solo-app', '--version-addon', '0.7.0.1');
  assert.equal(r.codigo, 1, r.err + r.out);
  assert.match(r.err, /No se publica nada\. La publicación puente \(solo la app\) no lleva el addon/);
  // sin --solo-app, --version-addon sí vale (se para después, en git: la copia no es un repositorio)
  const normal = correr('--version-addon', '0.7.0.1');
  assert.equal(normal.codigo, 1);
  assert.match(normal.err, /git/);
  assert.doesNotMatch(normal.err, /publicación puente/);
  assert.equal(existsSync(e.salida), false);
  // una opción que no existe sigue saliendo con 2, y el uso nombra --solo-app
  const mala = correr('--solo-addons');
  assert.equal(mala.codigo, 2);
  assert.match(mala.err, /\[--solo-app \| --sin-puente\]/);
  // ronda 1: --sin-puente existe, y con --solo-app no vale
  const las2 = correr('--solo-app', '--sin-puente');
  assert.equal(las2.codigo, 1);
  assert.match(las2.err, /--sin-puente es para la publicación normal/);
});

test('el lector 0.6.x acepta la puente y solo ofrece la app (lo que baja está en la misma publicación)', SOLO_WINDOWS, async (t) => {
  // `viejo` es el lector de manifiestos y paquetes tal como lo lleva la app 0.6.x (copia congelada del commit 4b8d8ae)
  const viejo = await import(pathToFileURL(join(EMPAQUETAR, 'test', 'fixtures', 'app-0.6', 'manifiesto.mjs')).href);
  const e = escenario(t);
  const r = publicarEn(e, { soloApp: true, ahora: PUENTE });
  const bytes = readFileSync(join(r.carpeta, 'snetforever-manifiesto.json'));
  // la firma y el manifiesto valen para la app vieja (le faltan componentes: eso lo acepta)
  assert.equal(viejo.verificarFirma(bytes, readFileSync(join(r.carpeta, 'snetforever-manifiesto.json.sig'), 'utf8'), clavePublica({ env: e.env })), true);
  const m = viejo.leerManifiesto(bytes);
  assert.deepEqual(Object.keys(m.componentes), ['app']);
  // lo que ofrece a una app 0.6.4 con el núcleo 0.6.4: solo la app, sin saltar nada (ni instalador, ni appMinima)
  const n = viejo.novedades(m, {
    instalado: { addon: '0.6.4', rutas: RUTAS, misiones: RUTAS }, versionApp: '0.6.4', versionNode: '24.14.0',
  });
  assert.equal(n.antiguo, false);
  assert.deepEqual(n.lista, [{ componente: 'app', de: '0.6.4', a: '0.7.0' }]);
  // y con todo más viejo, tampoco toca los addons: la puente no trae nada para AddOns
  const masViejo = viejo.novedades(m, {
    instalado: { addon: '0.6.0', rutas: '2026.11.01.1', misiones: '2026.11.01.1' }, versionApp: '0.6.0', versionNode: '24.14.0',
  });
  assert.deepEqual(masViejo.lista.map((i) => i.componente), ['app']);
  // lo que baja (releases/download/<publicacion>/<archivo>) está en la carpeta de esta misma publicación, y pasa sus comprobaciones
  for (const i of n.lista) {
    const archivo = join(r.carpeta, m.componentes[i.componente].archivo);
    assert.ok(existsSync(archivo), archivo);
    assert.equal(viejo.comprobarPaquete(m, i.componente, readFileSync(archivo)).version, '0.7.0');
  }
});

test('la app 0.7.0 con la publicación puente no intenta instalar el comercio ni quita nada', SOLO_WINDOWS, async (t) => {
  const e = escenario(t);
  const r = publicarEn(e, { soloApp: true, ahora: PUENTE });
  // lo que ofrece la app de este repositorio a una app 0.7.0 con el núcleo 0.6.4 y sin comercio: nada
  const m = leerManifiesto(readFileSync(join(r.carpeta, 'snetforever-manifiesto.json')));
  const n = novedades(m, {
    instalado: { addon: '0.6.4', rutas: RUTAS, misiones: RUTAS, comercio: null }, versionApp: '0.7.0', versionNode: '24.14.0',
  });
  assert.deepEqual(n.lista, []);
  // y el actualizador de verdad, pasado por el simulador con ese AddOns: sin novedades, nada bajado y AddOns igual
  const antes = huella(e.addons);
  const s = await simular(e, r.carpeta);
  assert.equal(s.pasos[0].paso, 'comprobar');
  assert.equal(s.pasos[0].estado, 'sin_novedades', JSON.stringify(s.pasos));
  assert.equal(s.resultado, 'nada');
  assert.equal(s.urls.some((u) => u.includes('/releases/download/')), false, 'no se baja ningún paquete');
  assert.deepEqual(huella(e.addons), antes);
  assert.equal(existsSync(join(e.addons, 'SnetForever_Comercio')), false);
  assert.equal(versionToc(e.addons, 'SnetForever'), '0.6.4');
  assert.ok(existsSync(join(e.addons, 'SnetForever', 'comercio', 'ventana.lua')), 'el comercio de dentro del núcleo sigue');
});

test('después, la publicación normal 0.7.0 pone núcleo y comercio juntos en una app 0.7.0', SOLO_WINDOWS, async (t) => {
  const e = escenario(t);
  const puente = publicarEn(e, { soloApp: true, ahora: PUENTE });
  assert.equal((await simular(e, puente.carpeta)).resultado, 'nada');
  // la normal, desde el mismo repositorio, una hora después y con otra etiqueta
  const normal = publicarEn(e, { ahora: NORMAL });
  assert.equal(normal.manifiesto.publicacion, `v0.7.0-${RUTAS}`);
  assert.notEqual(normal.manifiesto.publicacion, puente.manifiesto.publicacion);
  const s = await simular(e, normal.carpeta);
  const comprobar = s.pasos.find((p) => p.paso === 'comprobar');
  assert.deepEqual(comprobar.lista.map((i) => [i.componente, i.de, i.a, i.saltado ?? null]), [
    ['addon', '0.6.4', '0.7.0', null], ['comercio', null, '0.7.0', null],
  ]);
  assert.equal(s.resultado, 'aplicado', JSON.stringify(s.pasos));
  const aplicados = s.pasos.filter((p) => p.paso === 'aplicar' && p.estado === 'aplicado');
  assert.equal(aplicados.length, 1, 'en una sola tanda');
  assert.deepEqual(aplicados[0].aplicados, ['addon', 'comercio']);
  assert.equal(versionToc(e.addons, 'SnetForever'), '0.7.0');
  assert.equal(versionToc(e.addons, 'SnetForever_Comercio'), '0.7.0');
});

// ---------- Task 8b, ronda 1: el orden de firma ----------
// La app (la 0.6.x y la 0.7.0) rechaza como «antiguo» un manifiesto con una fecha anterior a la del último que aceptó, y esa
// fecha se apunta en cada comprobación buena. Por eso la normal se firma siempre después de la puente.

const MAS_TARDE = new Date('2026-11-10T14:00:00.000Z');

test('el peligro: una normal firmada antes que la puente es «antiguo» para la app que ya vio la puente', SOLO_WINDOWS, async (t) => {
  const viejo = await import(pathToFileURL(join(EMPAQUETAR, 'test', 'fixtures', 'app-0.6', 'manifiesto.mjs')).href);
  const e = escenario(t);
  // el orden malo, cada una en su carpeta (en la misma, publicar ya no lo deja): la normal a las 13:00, la puente a las 14:00
  const normal = publicarEn(e, { ahora: NORMAL, sinPuente: true, salida: join(e.base, 'normal antes') });
  const puente = publicarEn(e, { soloApp: true, ahora: MAS_TARDE, salida: join(e.base, 'puente después') });
  // la app 0.6.x: tras aceptar la puente, la normal es antigua y no ofrece nada (se queda en el núcleo 0.6.x; la bandeja solo dice «no se pudo comprobar»)
  const m = viejo.leerManifiesto(readFileSync(join(normal.carpeta, 'snetforever-manifiesto.json')));
  const n = viejo.novedades(m, {
    instalado: { addon: '0.6.4', rutas: RUTAS, misiones: RUTAS }, versionApp: '0.7.0', versionNode: '24.14.0',
    ultimaFecha: puente.manifiesto.fecha,
  });
  assert.deepEqual(n, { antiguo: true, lista: [] });
  // la app 0.7.0 de verdad, por el simulador: ve la puente (y apunta su fecha) y luego rechaza la normal
  const antes = huella(e.addons);
  assert.equal((await simular(e, puente.carpeta)).pasos[0].estado, 'sin_novedades');
  const s = await simular(e, normal.carpeta);
  assert.equal(s.pasos[0].estado, 'error', JSON.stringify(s.pasos[0]));
  assert.equal(s.pasos[0].codigo, 'antiguo');
  assert.deepEqual(huella(e.addons), antes);
  assert.equal(versionToc(e.addons, 'SnetForever'), '0.6.4');
});

test('soloApp se niega si en la salida ya hay una normal de esa app (firmada antes)', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  publicarEn(e, { soloApp: true, ahora: PUENTE });
  publicarEn(e, { ahora: NORMAL });
  // rehacer la puente con la normal ya hecha la dejaría más nueva que la normal: no
  assert.throws(() => publicarEn(e, { soloApp: true, ahora: MAS_TARDE }), (err) => {
    assert.equal(err.code, 'orden', err.message);
    assert.match(err.message, /v0\.7\.0-2026\.11\.11\.1/);
    assert.match(err.message, /rehace/);
    return true;
  });
  // la puente que había sigue en su sitio (no se apartó)
  assert.equal(leerManifiesto(readFileSync(join(e.salida, 'v0.7.0', 'snetforever-manifiesto.json'))).fecha, PUENTE.toISOString());
});

test('la normal se niega sin una puente de esa app firmada antes en la salida, salvo con sinPuente', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  const orden = (fn, re) => assert.throws(fn, (err) => {
    assert.equal(err.code, 'orden', err.message);
    assert.match(err.message, re);
    return true;
  });
  // sin ninguna puente
  orden(() => publicarEn(e, { ahora: NORMAL }), /--sin-puente/);
  assert.equal(existsSync(e.salida), false);
  // con una puente de otra versión de la app
  const otra = escenario(t);
  editar(join(otra.repo, 'app', 'package.json'), '"version": "0.7.0"', '"version": "0.6.9"');
  editar(join(otra.repo, 'app', 'src', 'version.mjs'), '0.7.0', '0.6.9');
  publicar({ raiz: otra.repo, salida: e.salida, comprobarGit: false, env: e.env, claveApp: clavePublica({ env: e.env }), soloApp: true, ahora: PUENTE });
  orden(() => publicarEn(e, { ahora: NORMAL }), /0\.7\.0/);
  // con la puente de 0.7.0 firmada DESPUÉS que la normal que se quiere sacar
  publicarEn(e, { soloApp: true, ahora: NORMAL });
  orden(() => publicarEn(e, { ahora: PUENTE, publicacion: 'v0.7.0-1' }), /después/);
  // con sinPuente (la app ya estaba publicada) sí, aunque no haya puente
  const libre = escenario(t);
  assert.deepEqual(Object.keys(publicarEn(libre, { ahora: NORMAL, sinPuente: true }).manifiesto.componentes),
    ['addon', 'rutas', 'misiones', 'comercio', 'app']);
  // y sinPuente no va con soloApp
  assert.throws(() => publicarEn(libre, { soloApp: true, sinPuente: true, ahora: NORMAL }), (err) => err.code === 'opciones');
});

test('el orden bueno sigue valiendo: puente y después normal, en la misma salida', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  const puente = publicarEn(e, { soloApp: true, ahora: PUENTE });
  const normal = publicarEn(e, { ahora: NORMAL });
  assert.ok(Date.parse(puente.manifiesto.fecha) < Date.parse(normal.manifiesto.fecha));
  assert.deepEqual(readdirSync(e.salida).sort(), ['v0.7.0', `v0.7.0-${RUTAS}`]);
});

test('M4: soloApp con una etiqueta con la forma de la normal (v<app>-…) se niega', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  for (const publicacion of [`v0.7.0-${RUTAS}`, 'v0.7.0-1']) {
    assert.throws(() => publicarEn(e, { soloApp: true, ahora: PUENTE, publicacion }), (err) => {
      assert.equal(err.code, 'publicacion', err.message);
      assert.match(err.message, /puente/);
      return true;
    });
  }
  assert.equal(existsSync(e.salida), false);
});

test('el LEEME de la puente avisa del orden de firma y de «Latest»', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  const leeme = readFileSync(publicarEn(e, { soloApp: true, ahora: PUENTE }).leeme, 'utf8');
  assert.match(leeme, /siempre después de esta/);
  assert.match(leeme, /si se rehace esta, se rehace también/);
  assert.match(leeme, /"Latest" a mano/);
  assert.match(leeme, /antigua/);
  assert.match(leeme, /sin comercio/);
});

// ---------- Task 8b, ronda 2: la puente solo se pide en el cruce al comercio ----------
// La normal exige una puente previa solo si es la primera normal con comercio de la salida. Después ya no.

const OTRA_MAS = new Date('2026-11-10T15:00:00.000Z');
const subirApp = (e, de, a) => {
  editar(join(e.repo, 'app', 'package.json'), `"version": "${de}"`, `"version": "${a}"`);
  editar(join(e.repo, 'app', 'src', 'version.mjs'), de, a);
};

test('ronda 2: con una normal con comercio ya en la salida, la de la app 0.7.1 no pide puente', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  publicarEn(e, { soloApp: true, ahora: PUENTE });
  publicarEn(e, { ahora: NORMAL }); // el cruce: la primera normal con comercio
  subirApp(e, '0.7.0', '0.7.1');
  const r = publicarEn(e, { ahora: MAS_TARDE });
  assert.equal(r.manifiesto.publicacion, `v0.7.1-${RUTAS}`);
  assert.equal(r.manifiesto.componentes.app.version, '0.7.1');
  assert.ok(Object.hasOwn(r.manifiesto.componentes, 'comercio'));
  // y la puente se sigue defendiendo en cualquier versión: con la normal 0.7.1 ya hecha, la puente 0.7.1 se niega
  assert.throws(() => publicarEn(e, { soloApp: true, ahora: OTRA_MAS }), (err) => err.code === 'orden');
});

test('ronda 2: la primera normal con comercio pide la puente aunque la app sea 0.7.1', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  subirApp(e, '0.7.0', '0.7.1');
  // una puente de otra app (0.7.0) no vale para la 0.7.1
  const otra = escenario(t);
  publicar({ raiz: otra.repo, salida: e.salida, comprobarGit: false, env: e.env, claveApp: clavePublica({ env: e.env }), soloApp: true, ahora: PUENTE });
  assert.throws(() => publicarEn(e, { ahora: NORMAL }), (err) => err.code === 'orden' && /0\.7\.1/.test(err.message));
  // con su puente firmada antes, sí
  publicarEn(e, { soloApp: true, ahora: NORMAL });
  assert.equal(publicarEn(e, { ahora: MAS_TARDE }).manifiesto.componentes.app.version, '0.7.1');
});

test('ronda 2: con la carpeta de salida vacía (otro PC, una copia limpia) la normal pide la puente o --sin-puente', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  subirApp(e, '0.7.0', '0.7.1');
  assert.throws(() => publicarEn(e, { ahora: NORMAL }), (err) => {
    assert.equal(err.code, 'orden');
    assert.match(err.message, /--sin-puente/);
    assert.match(err.message, /primera publicación normal con comercio/);
    return true;
  });
  assert.equal(existsSync(e.salida), false);
});

test('ronda 2: rehacer la primera normal con comercio (mismo nombre) sigue pidiendo su puente', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  // una normal con comercio en la salida, sin puente (con sinPuente), y la misma otra vez: la que se va a apartar no cuenta
  publicarEn(e, { ahora: PUENTE, sinPuente: true });
  assert.throws(() => publicarEn(e, { ahora: NORMAL }), (err) => err.code === 'orden');
  // con otro nombre, la de antes sí cuenta como cruce hecho
  assert.equal(publicarEn(e, { ahora: NORMAL, publicacion: 'v0.7.0-9' }).manifiesto.publicacion, 'v0.7.0-9');
});

test('ronda 2, m2: la normal no puede llamarse v<app> a secas (es el nombre de la puente)', SOLO_WINDOWS, (t) => {
  const e = escenario(t);
  publicarEn(e, { soloApp: true, ahora: PUENTE, salida: join(e.base, 'otra') });
  assert.throws(() => publicarEn(e, { ahora: NORMAL, publicacion: 'v0.7.0', sinPuente: true }), (err) => {
    assert.equal(err.code, 'publicacion', err.message);
    assert.match(err.message, /puente/);
    return true;
  });
  assert.equal(existsSync(e.salida), false);
});
