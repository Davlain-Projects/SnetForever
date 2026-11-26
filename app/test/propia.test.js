// Pruebas de la actualización de la propia app (fase 5, tarea 10; R12): app/src/actualizar/propia.mjs (aplicar el paquete
// de la app en `<instalación>\app\<versión>`, limpiar versiones viejas, reiniciar) y app/arranque/arranque.mjs (lanzar la
// versión actual y volver a la previa si no arranca). Todo en una instalación de prueba con espacios y acentos
// (`<tmp>\Programs\Snet Ñ`, en SNF_INSTALACION y SNF_DATOS); nunca la app real del PC (que puede estar arrancada) ni
// %LOCALAPPDATA%\Programs\SnetForever. Los lanzamientos de wscript son falsos (lanzan arranque.mjs directamente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as dormir } from 'node:timers/promises';
import { empaquetar } from '../src/actualizar/paquete.mjs';
import { aplicarApp, esInstalada, limpiarVersiones, reiniciar, VERSION_APP } from '../src/actualizar/propia.mjs';

const ARRANQUE = fileURLToPath(new URL('../arranque/arranque.mjs', import.meta.url));
// El cerrojo de verdad de la app (principal.mjs), para las pruebas del reinicio.
const PRINCIPAL_REAL = pathToFileURL(fileURLToPath(new URL('../src/principal.mjs', import.meta.url))).href;

function temporal() {
  return mkdtempSync(join(tmpdir(), 'snf-propia-'));
}

// Escribe `archivos` ({ruta con /: contenido}) bajo `raiz`.
function arbol(raiz, archivos) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const final = join(raiz, ...ruta.split('/'));
    mkdirSync(dirname(final), { recursive: true });
    writeFileSync(final, contenido);
  }
  return raiz;
}

// Una instalación de prueba: `<tmp>\Programs\Snet Ñ` con `app\<v>\…` de cada versión de `versiones`, y actual/previa.
function instalacion({ versiones = {}, actual = null, previa = null } = {}) {
  const t = temporal();
  const inst = join(t, 'Programs', 'Snet Ñ');
  const datos = join(inst, 'datos');
  mkdirSync(datos, { recursive: true });
  for (const [v, archivos] of Object.entries(versiones)) arbol(join(inst, 'app', v), archivos);
  if (actual !== null) writeFileSync(join(inst, 'actual.txt'), actual);
  if (previa !== null) writeFileSync(join(inst, 'previa.txt'), previa);
  const cuarentenas = [];
  const cuarentena = () => {
    const q = mkdtempSync(join(t, 'cuarentena Ñ-'));
    cuarentenas.push(q);
    return q;
  };
  return { t, inst, datos, cuarentena, cuarentenas };
}

// El paquete de una app mínima de la versión `v`.
function paqueteApp(v, extra = {}) {
  const raiz = arbol(temporal(), {
    'app/package.json': `{"version":"${v}"}`,
    'app/src/principal.mjs': `// app mínima ${v}\n`,
    'app/src/version.mjs': `export const VERSION = '${v}';\n`,
    ...extra,
  });
  return empaquetar({ componente: 'app', version: v, raiz });
}

const leer = (ruta) => readFileSync(ruta, 'utf8').trim();
// La ruta (como file:) de propia.mjs si estuviera instalada en `inst\app\<v>\`.
const aquiInstalada = (inst, v = '0.5.0') => pathToFileURL(join(inst, 'app', v, 'src', 'actualizar', 'propia.mjs')).href;

function codigo(fn, esperado) {
  let error = null;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  assert.ok(error, `se esperaba un error «${esperado}»`);
  assert.equal(error.code, esperado, String(error?.message));
  return error;
}

// ---------- esInstalada y 'desarrollo' ----------

test('esInstalada desde el repositorio → falso, y aplicarApp da «desarrollo» sin escribir nada', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '' } }, actual: '0.5.0' });
  assert.equal(esInstalada({ env: { SNF_INSTALACION: m.inst } }), false);
  assert.equal(esInstalada({ env: {} }), false, 'el repositorio no está en %LOCALAPPDATA%\\Programs\\SnetForever');
  codigo(() => aplicarApp(paqueteApp('0.5.1'), { instalacion: m.inst, cuarentena: m.cuarentena }), 'desarrollo');
  assert.deepEqual(readdirSync(join(m.inst, 'app')), ['0.5.0']);
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.0');
  assert.equal(existsSync(join(m.inst, 'previa.txt')), false);
  assert.equal(m.cuarentenas.length, 0);
});

test('esInstalada: verdadero solo dentro de <instalación>\\app\\<versión>\\', () => {
  const inst = join(temporal(), 'Programs', 'Snet Ñ');
  const env = { SNF_INSTALACION: inst };
  assert.equal(esInstalada({ env, aqui: aquiInstalada(inst, '0.5.0') }), true);
  assert.equal(esInstalada({ env, aqui: aquiInstalada(inst, '0.5.0.2') }), true);
  assert.equal(esInstalada({ env, aqui: join(inst, 'app', '0.5.0', 'src', 'actualizar', 'propia.mjs') }), true, 'también una ruta');
  assert.equal(esInstalada({ env, aqui: aquiInstalada(inst.toUpperCase(), '0.5.0') }), process.platform === 'win32',
    'en Windows, sin distinguir mayúsculas');
  for (const aqui of [
    aquiInstalada(inst, 'dev'), aquiInstalada(inst, '0.5'), aquiInstalada(inst, '0.5.1.preparando'),
    pathToFileURL(join(inst, 'app', 'propia.mjs')).href, pathToFileURL(join(inst, 'otra', '0.5.0', 'propia.mjs')).href,
    pathToFileURL(join(inst, 'app', '..', '..', 'app', '0.5.0', 'propia.mjs')).href, 'no es una ruta: file://', '',
  ]) assert.equal(esInstalada({ env, aqui }), false, aqui);
});

// ---------- aplicarApp ----------

test('aplicarApp de una app 0.5.1 con actual = 0.5.0 → app\\0.5.1\\src\\principal.mjs, actual.txt = 0.5.1 y previa.txt = 0.5.0', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '// 0.5.0\n' } }, actual: '0.5.0' });
  const r = aplicarApp(paqueteApp('0.5.1'), { instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst) });
  assert.deepEqual(r, { version: '0.5.1' });
  assert.equal(readFileSync(join(m.inst, 'app', '0.5.1', 'src', 'principal.mjs'), 'utf8'), '// app mínima 0.5.1\n');
  assert.ok(existsSync(join(m.inst, 'app', '0.5.1', 'package.json')), 'sin el app\\ del paquete delante');
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.1');
  assert.equal(leer(join(m.inst, 'previa.txt')), '0.5.0');
  assert.deepEqual(readdirSync(join(m.inst, 'app')).sort(), ['0.5.0', '0.5.1'], 'ni .preparando ni nada más');
  assert.deepEqual(readdirSync(m.inst).filter((n) => n.endsWith('.tmp')), [], 'sin temporales');
  assert.equal(m.cuarentenas.length, 0, 'no había nada que apartar');
  assert.equal(readFileSync(join(m.inst, 'app', '0.5.0', 'src', 'principal.mjs'), 'utf8'), '// 0.5.0\n', 'la 0.5.0 sigue');
});

test('aplicar otra vez la 0.5.1 → la de antes va a la cuarentena (no se borra) y previa sigue en 0.5.0', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '' } }, actual: '0.5.0' });
  const op = { instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst) };
  aplicarApp(paqueteApp('0.5.1'), op);
  writeFileSync(join(m.inst, 'app', '0.5.1', 'testigo.txt'), 'de la primera');
  aplicarApp(paqueteApp('0.5.1', { 'app/src/nuevo.mjs': '// nuevo\n' }), op);
  assert.equal(m.cuarentenas.length, 1);
  assert.equal(readFileSync(join(m.cuarentenas[0], '0.5.1', 'testigo.txt'), 'utf8'), 'de la primera');
  assert.ok(existsSync(join(m.inst, 'app', '0.5.1', 'src', 'nuevo.mjs')));
  assert.equal(existsSync(join(m.inst, 'app', '0.5.1', 'testigo.txt')), false);
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.1');
  assert.equal(leer(join(m.inst, 'previa.txt')), '0.5.0', 'aplicar la misma versión no pisa la previa con ella misma');
});

test('aplicarApp sin actual.txt (o con uno que no vale) → actual = v y no escribe previa', () => {
  for (const actual of [null, '../otra', '']) {
    const m = instalacion({ actual });
    aplicarApp(paqueteApp('0.5.1'), { instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst) });
    assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.1');
    assert.equal(existsSync(join(m.inst, 'previa.txt')), false, String(actual));
  }
});

test('aplicarApp: un .preparando de antes va a la cuarentena y no estorba', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '' }, '0.5.1.preparando': { 'a medias.txt': 'x' } }, actual: '0.5.0' });
  aplicarApp(paqueteApp('0.5.1'), { instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst) });
  assert.equal(m.cuarentenas.length, 1);
  assert.ok(existsSync(join(m.cuarentenas[0], '0.5.1.preparando', 'a medias.txt')));
  assert.equal(existsSync(join(m.inst, 'app', '0.5.1', 'a medias.txt')), false);
  assert.ok(existsSync(join(m.inst, 'app', '0.5.1', 'src', 'principal.mjs')));
});

test('aplicarApp: un paquete que no es de la app o una versión que el arranque no acepta → error y nada cambia', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '' } }, actual: '0.5.0' });
  const op = { instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst) };
  const addon = empaquetar({ componente: 'addon', version: '0.5.1', esquemaDatos: 1, raiz: arbol(temporal(), { 'SnetForever/a.lua': 'x' }) });
  codigo(() => aplicarApp(addon, op), 'componente');
  codigo(() => aplicarApp(paqueteApp('0.6'), op), 'paquete'); // el paquete admite 2 partes; actual.txt pide 3 o 4
  assert.deepEqual(readdirSync(join(m.inst, 'app')), ['0.5.0']);
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.0');
});

test('aplicarApp: si falla el renombre de la preparada, la versión de antes vuelve a su sitio y actual.txt no cambia', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '' }, '0.5.1': { 'testigo.txt': 'vieja' } }, actual: '0.5.0' });
  const renombrar = (origen, destino) => {
    if (origen.endsWith('0.5.1.preparando')) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    return renameSync(origen, destino);
  };
  const e = codigo(() => aplicarApp(paqueteApp('0.5.1'), {
    instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst), renombrar,
  }), 'EPERM');
  assert.equal(e.restaurada, true);
  assert.equal(readFileSync(join(m.inst, 'app', '0.5.1', 'testigo.txt'), 'utf8'), 'vieja');
  assert.ok(existsSync(join(m.inst, 'app', '0.5.1.preparando', 'src', 'principal.mjs')), 'la preparada se queda (no se borra)');
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.0');
  assert.equal(existsSync(join(m.inst, 'previa.txt')), false);
});

test('ronda 1 (M2): si tampoco se puede devolver la de antes a su sitio, el error lo dice y dónde se quedó', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '' }, '0.5.1': { 'testigo.txt': 'vieja' } }, actual: '0.5.0' });
  const robada = join(m.t, 'robada por el antivirus');
  const renombrar = (origen, destino) => {
    if (origen.endsWith('0.5.1.preparando')) {
      renameSync(join(m.cuarentenas[0], '0.5.1'), robada); // lo apartado ya no está donde se dejó
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    }
    return renameSync(origen, destino);
  };
  const e = codigo(() => aplicarApp(paqueteApp('0.5.1'), {
    instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst), renombrar,
  }), 'EPERM');
  assert.equal(e.restaurada, false);
  assert.equal(e.apartada, join(m.cuarentenas[0], '0.5.1'));
  assert.match(e.message, /no se pudo devolver/);
  assert.ok(e.errorAlRestaurar, 'lleva el error de fondo de la restauración');
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.0');
});

test('ronda 1 (I4): previa.txt es la versión que corre, también con dos actualizaciones sin reiniciar', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '' } }, actual: '0.5.0' });
  const op = { instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst, '0.5.0') };
  aplicarApp(paqueteApp('0.5.1'), op);
  aplicarApp(paqueteApp('0.5.2'), op);
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.2');
  assert.equal(leer(join(m.inst, 'previa.txt')), '0.5.0', 'la 0.5.1 nunca arrancó: la previa sigue siendo la que corre');
});

test('ronda 1 (I4): si la que corre no tiene su carpeta, previa.txt es el actual de antes', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '' } }, actual: '0.5.0' });
  const op = { instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst, '0.4.9') };
  aplicarApp(paqueteApp('0.5.1'), op);
  assert.equal(leer(join(m.inst, 'previa.txt')), '0.5.0');
  aplicarApp(paqueteApp('0.5.2'), op);
  assert.equal(leer(join(m.inst, 'previa.txt')), '0.5.1');
});

test('ronda 1 (I2): aplicarApp se niega a aplicar la versión de fallida.txt (o una anterior) y sí aplica una más nueva', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': '' } }, actual: '0.5.0', previa: '0.5.0' });
  writeFileSync(join(m.inst, 'fallida.txt'), '0.5.1');
  const op = { instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst) };
  codigo(() => aplicarApp(paqueteApp('0.5.1'), op), 'fallida');
  codigo(() => aplicarApp(paqueteApp('0.5.0.9'), op), 'fallida');
  assert.deepEqual(readdirSync(join(m.inst, 'app')), ['0.5.0'], 'no se extrae nada');
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.0');
  assert.deepEqual(aplicarApp(paqueteApp('0.5.2'), op), { version: '0.5.2' });
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.2');
});

// ---------- limpiarVersiones ----------

test('ronda 1 (M4): limpiarVersiones conserva siempre la versión que corre, además de actual y previa', () => {
  const v = (n) => ({ [n]: { 'src/principal.mjs': '' } });
  const m = instalacion({ versiones: { ...v('0.3.0'), ...v('0.4.0'), ...v('0.5.0'), ...v('0.5.1') }, actual: '0.5.1', previa: '0.5.0' });
  assert.deepEqual(limpiarVersiones({ instalacion: m.inst, cuarentena: m.cuarentena, aqui: aquiInstalada(m.inst, '0.4.0') }), ['0.3.0']);
  assert.deepEqual(readdirSync(join(m.inst, 'app')).sort(), ['0.4.0', '0.5.0', '0.5.1']);
});

test('limpiarVersiones con app\\0.4.0, 0.5.0 y 0.5.1 (actual 0.5.1, previa 0.5.0) → solo 0.4.0 va a la cuarentena', () => {
  const m = instalacion({
    versiones: { '0.4.0': { 'src/principal.mjs': '// 0.4.0' }, '0.5.0': { 'src/principal.mjs': '' }, '0.5.1': { 'src/principal.mjs': '' } },
    actual: '0.5.1', previa: '0.5.0',
  });
  writeFileSync(join(m.inst, 'app', 'nota.txt'), 'un archivo suelto no es una versión');
  assert.deepEqual(limpiarVersiones({ instalacion: m.inst, cuarentena: m.cuarentena }), ['0.4.0']);
  assert.equal(m.cuarentenas.length, 1);
  assert.equal(readFileSync(join(m.cuarentenas[0], '0.4.0', 'src', 'principal.mjs'), 'utf8'), '// 0.4.0');
  assert.deepEqual(readdirSync(join(m.inst, 'app')).sort(), ['0.5.0', '0.5.1', 'nota.txt']);
  assert.deepEqual(limpiarVersiones({ instalacion: m.inst, cuarentena: m.cuarentena }), [], 'la segunda vez no queda nada');
  assert.equal(m.cuarentenas.length, 1, 'sin nada que mover no se pide cuarentena');
});

test('limpiarVersiones sin actual.txt válido o sin su carpeta → no mueve nada', () => {
  const versiones = { '0.4.0': { 'a.txt': '' }, '0.5.0': { 'a.txt': '' } };
  for (const actual of [null, 'basura', '0.6.0']) {
    const m = instalacion({ versiones, actual, previa: '0.5.0' });
    assert.deepEqual(limpiarVersiones({ instalacion: m.inst, cuarentena: m.cuarentena }), [], String(actual));
    assert.deepEqual(readdirSync(join(m.inst, 'app')).sort(), ['0.4.0', '0.5.0']);
    assert.equal(m.cuarentenas.length, 0);
  }
});

// ---------- reiniciar ----------

test('reiniciar con un lanzar falso → primero suelta el cerrojo y después <System32>\\wscript.exe "<instalación>\\SnetForever.vbs", separado y con unref', async () => {
  const pasos = [];
  const inst = join(temporal(), 'Programs', 'Snet Ñ');
  const env = { SystemRoot: 'C:\\Windows Ñ', PATH: 'x' };
  await reiniciar({
    instalacion: inst, env, pid: 4321,
    soltar: async () => {
      await dormir(20);
      pasos.push('soltar');
    },
    lanzar: (...args) => (pasos.push(args), { unref: () => pasos.push('unref') }),
  });
  assert.deepEqual(pasos, [
    'soltar',
    [join('C:\\Windows Ñ', 'System32', 'wscript.exe'), [join(inst, 'SnetForever.vbs')], {
      detached: true, stdio: 'ignore', env: { ...env, SNF_REINICIO_DE: '4321' },
    }],
    'unref',
  ]);
});

test('reiniciar: sin soltar no reinicia (el cerrojo es obligatorio), y si soltar falla, reinicia igual (el arranque espera a la vieja)', async () => {
  const inst = join(temporal(), 'Programs', 'Snet Ñ');
  const llamadas = [];
  const lanzar = (...args) => (llamadas.push(args), { unref() {} });
  await assert.rejects(reiniciar({ instalacion: inst, lanzar }), /soltar/);
  assert.equal(llamadas.length, 0);
  await reiniciar({ instalacion: inst, lanzar, soltar: async () => { throw new Error('EBUSY'); } });
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0][2].env.SNF_REINICIO_DE, String(process.pid));
});

// Tarea 13, ronda 1 (nota de la revisión para T10): el proceso de wscript tiene escucha de 'error'. Si Windows no lo puede
// lanzar, reiniciar lo rechaza (quien llama vuelve a tomar el cerrojo y sigue viva); si arranca ('spawn'), resuelve.
test('reiniciar: un wscript que no arranca (error) se rechaza; uno que arranca (spawn) resuelve', async () => {
  const { EventEmitter } = await import('node:events');
  const inst = join(temporal(), 'Programs', 'Snet Ñ');
  const hijo = (evento) => () => {
    const h = new EventEmitter();
    h.unref = () => {};
    setImmediate(() => (evento === 'error' ? h.emit('error', Object.assign(new Error('no está'), { code: 'ENOENT' })) : h.emit('spawn')));
    return h;
  };
  await assert.rejects(reiniciar({ instalacion: inst, soltar: async () => {}, lanzar: hijo('error') }), (e) => e.code === 'ENOENT');
  const h = await reiniciar({ instalacion: inst, soltar: async () => {}, lanzar: hijo('spawn') });
  assert.equal(typeof h.on, 'function');
  // un 'error' que llegue después de arrancar no tumba la app (hay escucha)
  assert.doesNotThrow(() => h.emit('error', new Error('tarde')));
});

// ---------- arranque.mjs ----------

// Lanza `node arranque.mjs …` con la instalación de prueba y espera a que salga.
function arrancar(m, args = [], { espera = '3000' } = {}) {
  const env = { ...process.env, SNF_INSTALACION: m.inst, SNF_DATOS: m.datos, SNF_ARRANQUE_ESPERA: espera };
  const inicio = Date.now();
  const r = spawnSync(process.execPath, [ARRANQUE, ...args], { env, encoding: 'utf8', timeout: 30000, windowsHide: true });
  return { ...r, ms: Date.now() - inicio };
}

// Un principal.mjs que sale con `codigo` (y antes, si se pide, escribe la marca en la carpeta de datos).
const principal = ({ codigo = 0, marca = false, dura = 0 } = {}) => [
  "import { writeFileSync } from 'node:fs';",
  "import { join } from 'node:path';",
  marca ? "writeFileSync(join(process.env.SNF_DATOS, 'marca.txt'), process.cwd());" : '',
  dura > 0 ? `setTimeout(() => process.exit(${codigo}), ${dura});` : `process.exit(${codigo});`,
].join('\n');

async function aparece(ruta, ms = 15000) {
  for (const fin = Date.now() + ms; Date.now() < fin; await dormir(100)) if (existsSync(ruta)) return true;
  return existsSync(ruta);
}

test('arranque: la 0.5.1 sale con 1 → vuelve a la 0.5.0 una vez (actual, fallida, marca y una línea en el registro)', async () => {
  const m = instalacion({
    versiones: { '0.5.0': { 'src/principal.mjs': principal({ marca: true }) }, '0.5.1': { 'src/principal.mjs': principal({ codigo: 1 }) } },
    actual: '0.5.1', previa: '0.5.0',
  });
  const r = arrancar(m);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.0');
  assert.equal(leer(join(m.inst, 'fallida.txt')), '0.5.1');
  assert.equal(leer(join(m.inst, 'previa.txt')), '0.5.0');
  assert.ok(await aparece(join(m.datos, 'marca.txt')), 'la 0.5.0 arrancó');
  assert.equal(readFileSync(join(m.datos, 'marca.txt'), 'utf8'), m.inst, 'el hijo arranca en la carpeta de instalación');
  const lineas = readFileSync(join(m.datos, 'registro-arranque.log'), 'utf8').split('\n').filter(Boolean);
  assert.equal(lineas.length, 1, lineas.join('\n'));
  assert.match(lineas[0], /0\.5\.1/);
  assert.match(lineas[0], /0\.5\.0/);
  assert.deepEqual(readdirSync(m.inst).filter((n) => n.endsWith('.tmp')), [], 'sin temporales');
});

test('arranque: la 0.5.1 sale con 3 (ya abierta) o con 0 → no hay cambio', () => {
  for (const codigoSalida of [3, 0]) {
    const m = instalacion({
      versiones: { '0.5.0': { 'src/principal.mjs': principal({ marca: true }) }, '0.5.1': { 'src/principal.mjs': principal({ codigo: codigoSalida }) } },
      actual: '0.5.1', previa: '0.5.0',
    });
    const r = arrancar(m);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.1');
    assert.equal(existsSync(join(m.inst, 'fallida.txt')), false);
    assert.equal(existsSync(join(m.datos, 'marca.txt')), false);
    assert.equal(existsSync(join(m.datos, 'registro-arranque.log')), false);
  }
});

test('arranque: una 0.5.1 sana (dura 4 s) → no hay cambio y arranque sale con 0 en menos de 4 s', () => {
  const m = instalacion({
    versiones: { '0.5.0': { 'src/principal.mjs': principal({ marca: true }) }, '0.5.1': { 'src/principal.mjs': principal({ dura: 4000 }) } },
    actual: '0.5.1', previa: '0.5.0',
  });
  // ronda 1 (M6): con una espera de 1,5 s queda margen de sobra hasta los 4 s, aunque el PC vaya cargado
  const r = arrancar(m, [], { espera: '1500' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.ms < 4000, `tardó ${r.ms} ms`);
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.1');
  assert.equal(existsSync(join(m.inst, 'fallida.txt')), false);
});

test('arranque: la 0.5.1 falla y no hay previa válida (o es ella misma) → no cambia nada y lo apunta', () => {
  for (const previa of [null, '0.5.1', '0.4.0', 'basura']) {
    const m = instalacion({
      versiones: { '0.5.0': { 'src/principal.mjs': principal({ marca: true }) }, '0.5.1': { 'src/principal.mjs': principal({ codigo: 1 }) } },
      actual: '0.5.1', previa,
    });
    const r = arrancar(m);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.1', String(previa));
    assert.equal(existsSync(join(m.inst, 'fallida.txt')), false);
    assert.equal(existsSync(join(m.datos, 'marca.txt')), false);
    assert.equal(readFileSync(join(m.datos, 'registro-arranque.log'), 'utf8').split('\n').filter(Boolean).length, 1);
  }
});

test('ronda 1 (I3): un actual.txt que no vale o sin su carpeta → arranca la previa, reescribe actual.txt y lo apunta', async () => {
  for (const actual of [null, '..\\..\\otra', '0.5', '0.6.0']) {
    const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': principal({ marca: true }) } }, actual, previa: '0.5.0' });
    const r = arrancar(m);
    assert.equal(r.status, 0, `${actual}: ${r.stderr}`);
    assert.ok(await aparece(join(m.datos, 'marca.txt')), `${actual}: arranca la previa`);
    assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.0');
    const registro = readFileSync(join(m.datos, 'registro-arranque.log'), 'utf8');
    assert.match(registro, /actual\.txt/);
    assert.match(registro, /0\.5\.0/);
  }
});

test('arranque: sin actual.txt ni previa.txt que valgan → sale con 2, sin lanzar nada, y lo apunta', () => {
  for (const [actual, previa] of [[null, null], ['0.6.0', 'basura'], ['0.6.0', '0.6.0'], ['basura', '0.4.0']]) {
    const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': principal({ marca: true }) } }, actual, previa });
    const r = arrancar(m);
    assert.equal(r.status, 2, `${actual}/${previa}`);
    assert.equal(existsSync(join(m.datos, 'marca.txt')), false);
    assert.match(readFileSync(join(m.datos, 'registro-arranque.log'), 'utf8'), /actual\.txt/);
  }
});

test('arranque --cli eco a "b c" → la cli.mjs de la versión actual recibe [eco, a, b c] y arranque sale con su código', () => {
  const cli = [
    "import { writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "writeFileSync(join(process.env.SNF_DATOS, 'args.json'), JSON.stringify(process.argv.slice(2)));",
    "process.stdout.write('hola desde la cli');",
    'process.exit(7);',
  ].join('\n');
  const m = instalacion({
    versiones: { '0.5.0': { 'src/instalador/cli.mjs': 'process.exit(9);' }, '0.5.1': { 'src/instalador/cli.mjs': cli } },
    actual: '0.5.1', previa: '0.5.0',
  });
  const r = arrancar(m, ['--cli', 'eco', 'a', 'b c']);
  assert.equal(r.status, 7, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(m.datos, 'args.json'), 'utf8')), ['eco', 'a', 'b c']);
  assert.equal(r.stdout, 'hola desde la cli', 'stdio heredado');
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.1', 'la CLI no vuelve atrás');
});

test('arranque --cli sin actual.txt ni previa que valgan → sale con 2 y lo dice por stderr', () => {
  const m = instalacion({ actual: 'basura' });
  const r = arrancar(m, ['--cli', 'detectar']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /actual\.txt/);
});

test('ronda 1 (I3): arranque --cli con un actual.txt sin su carpeta usa la CLI de la previa', () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/instalador/cli.mjs': 'process.exit(5);' } }, actual: '0.6.0', previa: '0.5.0' });
  const r = arrancar(m, ['--cli', 'desinstalar']);
  assert.equal(r.status, 5, r.stderr);
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.0');
});

test('ronda 1 (M7): arranque.mjs usa la misma expresión de versión que propia.mjs (VERSION_APP)', () => {
  const fuente = readFileSync(ARRANQUE, 'utf8');
  const m = /const VERSION_APP = \/(.+)\/;/.exec(fuente);
  assert.ok(m, 'arranque.mjs define VERSION_APP como una expresión literal');
  assert.equal(m[1], VERSION_APP.source);
  assert.equal(VERSION_APP.flags, '');
});

// ---------- reinicio de punta a punta (I1) ----------

// Un script que toma el cerrojo de verdad de la app (tomarCerrojo de principal.mjs) en SNF_DATOS.
const conCerrojo = (despues) => [
  "import { writeFileSync } from 'node:fs';",
  "import { join } from 'node:path';",
  `import { tomarCerrojo } from ${JSON.stringify(PRINCIPAL_REAL)};`,
  'const c = await tomarCerrojo(process.env.SNF_DATOS);',
  despues,
].join('\n');
// La app vieja: toma el cerrojo, lo dice en vieja.txt y se cierra a los `dura` ms sin soltarlo (como si tardara en salir).
const vieja = (dura) => conCerrojo(`writeFileSync(join(process.env.SNF_DATOS, 'vieja.txt'), String(c.ok));\nsetTimeout(() => process.exit(0), ${dura});`);
// La app nueva: con el cerrojo ocupado sale con 3, como principal.mjs; si lo toma, escribe la marca y sigue viva 3 s.
const nueva = conCerrojo("if (!c.ok) process.exit(3);\nwriteFileSync(join(process.env.SNF_DATOS, 'marca.txt'), String(process.pid));\nsetTimeout(() => process.exit(0), 3000);");

// Reinicia desde una «app vieja» de verdad que tiene el cerrojo: `reiniciar` con un lanzar que hace lo del .vbs (lanzar
// arranque.mjs con el entorno que recibe). Devuelve el código de salida de ese arranque.
async function reinicioDePuntaAPunta(m, { duraVieja, esperaReinicio, esperaArranque }) {
  const script = join(m.t, 'vieja.mjs');
  writeFileSync(script, vieja(duraVieja));
  const env = { ...process.env, SNF_INSTALACION: m.inst, SNF_DATOS: m.datos };
  const proceso = spawn(process.execPath, [script], { env, stdio: 'ignore', windowsHide: true });
  const salioVieja = new Promise((r) => proceso.on('exit', r));
  assert.ok(await aparece(join(m.datos, 'vieja.txt')), 'la vieja arrancó');
  assert.equal(leer(join(m.datos, 'vieja.txt')), 'true', 'la vieja tiene el cerrojo');
  let salida;
  const salioArranque = new Promise((r) => { salida = r; });
  await reiniciar({
    instalacion: m.inst, pid: proceso.pid, soltar: async () => {},
    env: { ...env, SNF_ARRANQUE_ESPERA: esperaArranque, SNF_REINICIO_ESPERA: esperaReinicio },
    lanzar: (_wscript, _args, opciones) => {
      const h = spawn(process.execPath, [ARRANQUE], { ...opciones, windowsHide: true });
      h.on('exit', (codigoSalida) => salida(codigoSalida));
      return h;
    },
  });
  const codigoArranque = await Promise.race([salioArranque, dormir(30000).then(() => 'colgado')]);
  return { codigoArranque, salioVieja };
}

test('ronda 1 (I1): el reinicio espera a que salga la vieja y deja viva la app nueva', async () => {
  const m = instalacion({ versiones: { '0.5.1': { 'src/principal.mjs': nueva } }, actual: '0.5.1', previa: '0.5.1' });
  const r = await reinicioDePuntaAPunta(m, { duraVieja: 1500, esperaReinicio: '20000', esperaArranque: '1000' });
  assert.equal(r.codigoArranque, 0);
  assert.ok(await aparece(join(m.datos, 'marca.txt')), 'la nueva tomó el cerrojo y sigue');
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.1');
  assert.equal(existsSync(join(m.inst, 'fallida.txt')), false);
  await r.salioVieja;
});

test('ronda 1 (I1): con el cerrojo aún ocupado tras el reinicio, el 3 de la nueva no se da por bueno (sale con 3 y lo apunta)', async () => {
  const m = instalacion({
    versiones: { '0.5.0': { 'src/principal.mjs': principal({ marca: true }) }, '0.5.1': { 'src/principal.mjs': nueva } },
    actual: '0.5.1', previa: '0.5.0',
  });
  const r = await reinicioDePuntaAPunta(m, { duraVieja: 8000, esperaReinicio: '500', esperaArranque: '20000' });
  assert.equal(r.codigoArranque, 3);
  assert.equal(existsSync(join(m.datos, 'marca.txt')), false, 'ni la nueva ni la previa');
  assert.equal(leer(join(m.inst, 'actual.txt')), '0.5.1', 'no es un fallo de la nueva: no se vuelve atrás');
  assert.equal(existsSync(join(m.inst, 'fallida.txt')), false);
  assert.match(readFileSync(join(m.datos, 'registro-arranque.log'), 'utf8'), /cerrojo/);
  await r.salioVieja;
});

test('arranque sin SNF_INSTALACION usa su propia carpeta (el arranque.mjs fijo de {app})', async () => {
  const m = instalacion({ versiones: { '0.5.0': { 'src/principal.mjs': principal({ marca: true }) } }, actual: '0.5.0' });
  const copia = join(m.inst, 'arranque.mjs');
  writeFileSync(copia, readFileSync(ARRANQUE));
  const env = { ...process.env, SNF_DATOS: m.datos, SNF_ARRANQUE_ESPERA: '500' };
  delete env.SNF_INSTALACION;
  const r = spawnSync(process.execPath, [copia], { env, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(await aparece(join(m.datos, 'marca.txt')));
});
