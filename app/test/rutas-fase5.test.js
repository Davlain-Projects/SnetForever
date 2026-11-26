// Pruebas de las rutas nuevas de la fase 5 (tarea 3): carpeta de instalación, raíz de la cuarentena por PC y carpetas de
// cuarentena para los componentes, y la versión 0.5.0 de la app.
// Todo en carpetas temporales: ninguna prueba toca la cuarentena real (`E:\_CUARENTENA` existe en el PC del jugador), por eso
// `existe` se inyecta siempre o se pone SNF_CUARENTENA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, statSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { carpetaInstalacion, raizCuarentena, cuarentenaComponentes, cuarentenaNueva, carpetaDatos } from '../src/rutas.mjs';
import { VERSION } from '../src/version.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const nunca = () => false;

test('carpetaInstalacion: SNF_INSTALACION o %LOCALAPPDATA%\\Programs\\SnetForever', () => {
  assert.equal(carpetaInstalacion({ SNF_INSTALACION: 'D:\\otra\\SnetForever', LOCALAPPDATA: 'C:\\L' }), 'D:\\otra\\SnetForever');
  assert.equal(carpetaInstalacion({ LOCALAPPDATA: 'C:\\Users\\José Ñandú\\AppData\\Local' }),
    join('C:\\Users\\José Ñandú\\AppData\\Local', 'Programs', 'SnetForever'));
  assert.equal(carpetaInstalacion({ LOCALAPPDATA: 'C:\\L', SNF_DATOS: 'C:\\datos' }), join('C:\\L', 'Programs', 'SnetForever'),
    'SNF_DATOS no cambia la carpeta de instalación');
});

test('raizCuarentena: E:\\_CUARENTENA\\SnetForever si existe E:\\_CUARENTENA (el PC del jugador)', () => {
  const env = { LOCALAPPDATA: 'C:\\L' };
  assert.equal(raizCuarentena({ env: {}, config: {}, existe: (r) => r === 'E:\\_CUARENTENA' }), 'E:\\_CUARENTENA\\SnetForever');
  assert.equal(raizCuarentena({ env, config: {}, existe: (r) => r === 'E:\\_CUARENTENA' }), 'E:\\_CUARENTENA\\SnetForever');
});

test('raizCuarentena: sin E:\\_CUARENTENA, <datos>\\cuarentena', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\José Ñandú\\AppData\\Local' };
  assert.equal(raizCuarentena({ env, config: {}, existe: nunca }), join(carpetaDatos(env), 'cuarentena'));
  assert.equal(raizCuarentena({ env: { SNF_DATOS: 'C:\\d' }, config: {}, existe: nunca }), join('C:\\d', 'cuarentena'));
});

test('raizCuarentena: config.cuarentena manda sobre la regla de E: y SNF_CUARENTENA sobre todo', () => {
  const siE = (r) => r === 'E:\\_CUARENTENA';
  assert.equal(raizCuarentena({ env: {}, config: { cuarentena: 'D:\\mi cuarentena' }, existe: siE }), 'D:\\mi cuarentena');
  assert.equal(raizCuarentena({ env: {}, config: { cuarentena: 'D:\\mi cuarentena' }, existe: nunca }), 'D:\\mi cuarentena');
  assert.equal(raizCuarentena({ env: { SNF_CUARENTENA: 'F:\\q' }, config: { cuarentena: 'D:\\mi cuarentena' }, existe: siE }), 'F:\\q');
  assert.equal(raizCuarentena({ env: { SNF_CUARENTENA: 'F:\\q' }, config: {}, existe: nunca }), 'F:\\q');
  // un config.cuarentena que no es texto o está vacío no vale
  for (const malo of ['', 7, null, ['D:\\x'], { a: 1 }]) {
    assert.equal(raizCuarentena({ env: {}, config: { cuarentena: malo }, existe: siE }), 'E:\\_CUARENTENA\\SnetForever', String(malo));
  }
});

test('raizCuarentena: sin config, lee config.json de la carpeta de datos', () => {
  const datos = mkdtempSync(join(tmpdir(), 'snf-raiz-'));
  writeFileSync(join(datos, 'config.json'), JSON.stringify({ cuarentena: 'D:\\de config' }), 'utf8');
  assert.equal(raizCuarentena({ env: { SNF_DATOS: datos }, existe: nunca }), 'D:\\de config');
});

test('cuarentenaComponentes: crea <raíz>\\<sello> y dos llamadas en el mismo milisegundo dan dos carpetas distintas', (t) => {
  const raiz = join(mkdtempSync(join(tmpdir(), 'snf-cc-')), 'José Ñandú', 'cuarentena');
  const env = { SNF_CUARENTENA: raiz };
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 10, 12, 0, 0, 0) });
  const a = cuarentenaComponentes({ env, config: {}, existe: nunca });
  const b = cuarentenaComponentes({ env, config: {}, existe: nunca });
  const c = cuarentenaComponentes({ env, config: {}, existe: nunca });
  t.mock.timers.reset();
  assert.equal(dirname(a), raiz);
  assert.equal(basename(a), '2026-11-10T12-00-00-000Z');
  assert.equal(basename(b), '2026-11-10T12-00-00-000Z-1');
  assert.equal(basename(c), '2026-11-10T12-00-00-000Z-2');
  for (const r of [a, b, c]) assert.ok(statSync(r).isDirectory(), r);
});

test('cuarentenaComponentes: sin SNF_CUARENTENA ni config, sigue la regla de raizCuarentena (datos\\cuarentena)', () => {
  const datos = mkdtempSync(join(tmpdir(), 'snf-cc2-'));
  const r = cuarentenaComponentes({ env: { SNF_DATOS: datos }, config: {}, existe: nunca });
  assert.equal(dirname(r), join(datos, 'cuarentena'));
  assert.ok(existsSync(r));
});

test('cuarentenaNueva no cambia: siempre en <datos>\\cuarentena, aunque haya SNF_CUARENTENA', () => {
  const datos = mkdtempSync(join(tmpdir(), 'snf-cn-'));
  const otra = mkdtempSync(join(tmpdir(), 'snf-cn-otra-'));
  const r = cuarentenaNueva({ SNF_DATOS: datos, SNF_CUARENTENA: otra });
  assert.equal(dirname(r), join(datos, 'cuarentena'));
  assert.deepEqual(readdirSync(otra), [], 'en SNF_CUARENTENA no se crea nada');
});

test('versión 0.7.0 en version.mjs y en package.json (la primera que conoce el comercio)', () => {
  assert.equal(VERSION, '0.7.0');
  const paquete = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'));
  assert.equal(paquete.version, VERSION);
});
