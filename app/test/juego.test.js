// Fase 5, tarea 7: saber si el juego (el cliente de \_forever_\) está abierto y dónde está instalado.
// Las pruebas NUNCA dependen del juego de verdad ni lo tocan: usan un juego falso en una carpeta temporal
// (<tmp>\Juegos Ñ\World of Warcraft\_forever_\Wow.exe, vacío), listas de procesos inyectadas y un `existe` simulado.
// Las reglas generales de los .ps1 (sin borrar, sin teclear, sin red) las mira cumplimiento.test.js.
// Solo las pruebas de juego.ps1 (solo en win32) preguntan a Windows de verdad, y solo leen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32, dirname } from 'node:path';
import {
  HABITUALES, SCRIPT_JUEGO, TIEMPO_MAX_PS, consultar, juegoAbierto, validarCarpetaJuego, candidatasJuego,
} from '../src/juego.mjs';
import { foreverDeInstallPath, carpetaAddOns } from '../src/rutas.mjs';

const WIN = process.platform === 'win32';

// ---------- el juego falso ----------
const TMP = mkdtempSync(join(tmpdir(), 'snf-juego-'));
const WOW = join(TMP, 'Juegos Ñ', 'World of Warcraft');
const FOREVER = join(WOW, '_forever_');
const ADDONS = join(FOREVER, 'Interface', 'AddOns');
const EXE = join(FOREVER, 'Wow.exe');
const RETAIL = join(WOW, '_retail_');
mkdirSync(ADDONS, { recursive: true });
writeFileSync(EXE, '');
mkdirSync(RETAIL, { recursive: true });
writeFileSync(join(RETAIL, 'Wow.exe'), '');
// una carpeta _forever_ sin Wow.exe
const SIN_EXE = join(TMP, 'Otra', 'World of Warcraft', '_forever_');
mkdirSync(SIN_EXE, { recursive: true });

const igual = (a, b) => a.toLowerCase() === b.toLowerCase();
// `existe` que simula unas rutas (un Wow.exe, una carpeta AddOns…) y todas sus carpetas de arriba (sin distinguir mayúsculas).
function existeSimulado(...exes) {
  const si = new Set();
  for (const exe of exes) {
    let r = win32.resolve(exe);
    while (true) {
      si.add(r.toLowerCase());
      const padre = win32.dirname(r);
      if (padre === r) break;
      r = padre;
    }
  }
  return (ruta) => si.has(win32.resolve(ruta).toLowerCase());
}

// ---------- HABITUALES y constantes ----------

test('HABITUALES: las carpetas habituales del juego, con el valor exacto del plan', () => {
  assert.deepEqual(HABITUALES, [
    'World of Warcraft\\_forever_', 'wow\\World of Warcraft\\_forever_', 'Program Files (x86)\\World of Warcraft\\_forever_',
    'Program Files\\World of Warcraft\\_forever_', 'Games\\World of Warcraft\\_forever_', 'Juegos\\World of Warcraft\\_forever_',
    'Battle.net\\World of Warcraft\\_forever_',
  ]);
  assert.equal(TIEMPO_MAX_PS, 15_000);
  assert.ok(SCRIPT_JUEGO.endsWith(join('ayudantes', 'juego.ps1')));
});

// ---------- juegoAbierto ----------

test('juegoAbierto: verdadero si algún Wow.exe está en \\_forever_\\ (sin distinguir mayúsculas)', () => {
  assert.equal(juegoAbierto({ procesos: [{ pid: 1, ruta: 'E:\\wow\\World of Warcraft\\_FOREVER_\\Wow.exe' }] }), true);
  assert.equal(juegoAbierto({ procesos: [{ pid: 1, ruta: 'E:\\wow\\World of Warcraft\\_forever_\\Wow.exe' }] }), true);
  assert.equal(juegoAbierto({ procesos: [{ pid: 1, ruta: 'E:\\wow\\World of Warcraft\\_retail_\\Wow.exe' }] }), false);
  assert.equal(juegoAbierto({ procesos: [] }), false);
  assert.equal(juegoAbierto({
    procesos: [{ pid: 1, ruta: 'C:\\x\\_retail_\\Wow.exe' }, { pid: 2, ruta: 'E:\\wow\\World of Warcraft\\_forever_\\Wow.exe' }],
  }), true, 'basta con uno');
  // _forever_ tiene que ser una carpeta de la ruta, no parte de un nombre
  assert.equal(juegoAbierto({ procesos: [{ pid: 1, ruta: 'C:\\x\\mi_forever_y\\Wow.exe' }] }), false);
});

test('juegoAbierto: lo que no se sabe cuenta como abierto (ruta null, ruta rara o lista que no es lista)', () => {
  assert.equal(juegoAbierto({ procesos: [{ pid: 1, ruta: null }] }), true);
  assert.equal(juegoAbierto({ procesos: [{ pid: 1 }] }), true, 'sin ruta');
  assert.equal(juegoAbierto({ procesos: [{ pid: 1, ruta: 7 }] }), true);
  assert.equal(juegoAbierto({ procesos: [null] }), true);
  assert.equal(juegoAbierto({ procesos: null }), true);
  assert.equal(juegoAbierto({}), true);
  assert.equal(juegoAbierto(), true);
});

// ---------- validarCarpetaJuego ----------

test('validarCarpetaJuego: acepta las cuatro formas del juego falso y siempre da el mismo addons', () => {
  const formas = [FOREVER, ADDONS, EXE, WOW, `${FOREVER}\\`, `${WOW}\\`, FOREVER.toUpperCase()];
  for (const forma of formas) {
    const r = validarCarpetaJuego(forma);
    assert.equal(r.ok, true, forma);
    assert.ok(igual(r.raiz, FOREVER), `${forma}: raiz ${r.raiz}`);
    assert.ok(igual(r.addons, ADDONS), `${forma}: addons ${r.addons}`);
  }
  // con las mismas mayúsculas, exactamente igual
  for (const forma of [FOREVER, ADDONS, EXE, WOW]) assert.deepEqual(validarCarpetaJuego(forma), { ok: true, raiz: FOREVER, addons: ADDONS });
});

test('validarCarpetaJuego: sin Wow.exe o fuera de _forever_ → no_es_forever; si no existe → no_existe', () => {
  assert.deepEqual(validarCarpetaJuego(SIN_EXE), { ok: false, motivo: 'no_es_forever' });
  assert.deepEqual(validarCarpetaJuego(dirname(SIN_EXE)), { ok: false, motivo: 'no_es_forever' }, 'World of Warcraft sin Wow.exe');
  assert.deepEqual(validarCarpetaJuego(RETAIL), { ok: false, motivo: 'no_es_forever' });
  assert.deepEqual(validarCarpetaJuego(join(RETAIL, 'Wow.exe')), { ok: false, motivo: 'no_es_forever' }, 'el Wow.exe de _retail_');
  assert.deepEqual(validarCarpetaJuego(TMP), { ok: false, motivo: 'no_es_forever' });
  assert.deepEqual(validarCarpetaJuego(join(TMP, 'no hay nada')), { ok: false, motivo: 'no_existe' });
  assert.deepEqual(validarCarpetaJuego(join(TMP, 'no hay nada', '_forever_', 'Wow.exe')), { ok: false, motivo: 'no_existe' });
  // lo que no es una ruta absoluta no se busca (una relativa dependería de la carpeta actual)
  for (const malo of [undefined, null, '', 7, {}, 'World of Warcraft\\_forever_', '_forever_']) {
    assert.deepEqual(validarCarpetaJuego(malo), { ok: false, motivo: 'no_existe' }, String(malo));
  }
});

test('validarCarpetaJuego: con un existe simulado (otra unidad, sin tocar el disco)', () => {
  const existe = existeSimulado('Z:\\wow\\World of Warcraft\\_forever_\\Wow.exe');
  assert.deepEqual(validarCarpetaJuego('Z:\\wow\\World of Warcraft', { existe }),
    { ok: true, raiz: 'Z:\\wow\\World of Warcraft\\_forever_', addons: 'Z:\\wow\\World of Warcraft\\_forever_\\Interface\\AddOns' });
  assert.deepEqual(validarCarpetaJuego('Z:\\wow\\World of Warcraft\\_forever_\\Interface\\AddOns', { existe }),
    { ok: false, motivo: 'no_existe' }, 'la carpeta AddOns que se da tiene que existir');
  assert.deepEqual(validarCarpetaJuego('Y:\\wow', { existe }), { ok: false, motivo: 'no_existe' });
});

// ---------- candidatasJuego ----------

test('candidatasJuego: un proceso en el juego falso y el registro apuntando a _retail_ → una sola, de «proceso»', () => {
  const r = candidatasJuego({
    env: {}, config: {}, procesos: [{ pid: 1, ruta: EXE }], registro: [`${RETAIL}\\`], unidades: [],
  });
  assert.deepEqual(r, [{ addons: ADDONS, raiz: FOREVER, origen: 'proceso' }]);
});

test('candidatasJuego: sin procesos, el registro (carpeta padre de InstallPath más _forever_)', () => {
  const r = candidatasJuego({ env: {}, config: {}, procesos: [], registro: [`${RETAIL}\\`], unidades: [] });
  assert.deepEqual(r, [{ addons: ADDONS, raiz: FOREVER, origen: 'registro' }]);
  // un InstallPath que ya es la carpeta World of Warcraft también vale (la misma búsqueda que carpetaAddOns)
  assert.deepEqual(candidatasJuego({ env: {}, config: {}, procesos: [], registro: [WOW], unidades: [] }),
    [{ addons: ADDONS, raiz: FOREVER, origen: 'registro' }]);
  // y uno que ya es la carpeta _forever_ (así lo tiene el PC del jugador: E:\wow\World of Warcraft\_forever_\)
  assert.deepEqual(candidatasJuego({ env: {}, config: {}, procesos: [], registro: [`${FOREVER}\\`], unidades: [] }),
    [{ addons: ADDONS, raiz: FOREVER, origen: 'registro' }]);
});

test('candidatasJuego: con unidades [Z] y el juego simulado en Z:\\wow\\World of Warcraft\\_forever_ → «habitual»', () => {
  const existe = existeSimulado('Z:\\wow\\World of Warcraft\\_forever_\\Wow.exe');
  const r = candidatasJuego({ env: {}, config: {}, procesos: [], registro: [], unidades: ['Z'], existe });
  assert.deepEqual(r, [{
    addons: 'Z:\\wow\\World of Warcraft\\_forever_\\Interface\\AddOns', raiz: 'Z:\\wow\\World of Warcraft\\_forever_', origen: 'habitual',
  }]);
});

test('candidatasJuego: el PC del jugador (E:\\wow\\World of Warcraft\\_forever_) se encuentra con el juego cerrado y sin registro', () => {
  const existe = existeSimulado('E:\\wow\\World of Warcraft\\_forever_\\Wow.exe');
  const r = candidatasJuego({ env: {}, config: {}, procesos: [], registro: [], unidades: ['C', 'D', 'E'], existe });
  assert.deepEqual(r, [{ addons: 'E:\\wow\\World of Warcraft\\_forever_\\Interface\\AddOns', raiz: 'E:\\wow\\World of Warcraft\\_forever_', origen: 'habitual' }]);
});

test('candidatasJuego: orden env, config, proceso, registro, habitual; sin repetir (sin distinguir mayúsculas)', () => {
  const a = 'A:\\uno\\_forever_\\Wow.exe';
  const b = 'B:\\dos\\World of Warcraft\\_forever_\\Wow.exe';
  const c = 'C:\\tres\\_forever_\\Wow.exe';
  const d = 'D:\\cuatro\\World of Warcraft\\_forever_\\Wow.exe';
  const e = 'E:\\Juegos\\World of Warcraft\\_forever_\\Wow.exe';
  const existe = existeSimulado(a, b, c, d, e, 'A:\\uno\\_forever_\\Interface\\AddOns');
  const r = candidatasJuego({
    env: { SNF_ADDONS: 'A:\\uno\\_forever_\\Interface\\AddOns' },
    config: { addons: 'B:\\dos\\World of Warcraft' },
    procesos: [{ pid: 1, ruta: c }, { pid: 2, ruta: a.toUpperCase() }, { pid: 3, ruta: null }, { pid: 4, ruta: 'X:\\_retail_\\Wow.exe' }],
    registro: ['D:\\cuatro\\World of Warcraft\\_retail_\\', 'b:\\DOS\\world of warcraft', 7, '', 'relativa\\x'],
    unidades: ['E', 'C', 'Ñ', 'EE', '', null],
    existe,
  });
  assert.deepEqual(r.map((x) => [x.origen, x.raiz]), [
    ['env', 'A:\\uno\\_forever_'],
    ['config', 'B:\\dos\\World of Warcraft\\_forever_'],
    ['proceso', 'C:\\tres\\_forever_'],
    ['registro', 'D:\\cuatro\\World of Warcraft\\_forever_'],
    ['habitual', 'E:\\Juegos\\World of Warcraft\\_forever_'],
  ]);
  for (const x of r) assert.equal(x.addons, win32.join(x.raiz, 'Interface', 'AddOns'));
});

test('candidatasJuego: solo las que valen; sin nada, una lista vacía', () => {
  const existe = existeSimulado('Q:\\World of Warcraft\\_retail_\\Wow.exe');
  assert.deepEqual(candidatasJuego({
    env: { SNF_ADDONS: 'Q:\\no\\AddOns' }, config: { addons: 'Q:\\World of Warcraft\\_retail_' },
    procesos: [{ pid: 1, ruta: 'Q:\\World of Warcraft\\_retail_\\Wow.exe' }], registro: ['Q:\\World of Warcraft\\_retail_'], unidades: ['Q'], existe,
  }), []);
  assert.deepEqual(candidatasJuego({ env: {}, existe: () => false }), []);
  assert.deepEqual(candidatasJuego({ env: {}, config: null, procesos: null, registro: 'x', unidades: 'C', existe: () => false }), []);
});

// ---------- la búsqueda del registro, en un único sitio ----------

test('foreverDeInstallPath: InstallPath\\_forever_ y la carpeta padre más _forever_ (la usan carpetaAddOns y candidatasJuego)', () => {
  assert.deepEqual(foreverDeInstallPath('D:\\Juegos\\World of Warcraft\\_retail_\\'),
    ['D:\\Juegos\\World of Warcraft\\_retail_\\_forever_', 'D:\\Juegos\\World of Warcraft\\_forever_']);
  assert.deepEqual(foreverDeInstallPath('D:\\Juegos\\World of Warcraft'), ['D:\\Juegos\\World of Warcraft\\_forever_', 'D:\\Juegos\\_forever_']);
  for (const malo of ['', null, 7, 'relativa\\x', undefined]) assert.deepEqual(foreverDeInstallPath(malo), [], String(malo));
  // carpetaAddOns sigue igual
  const addons = 'D:\\Juegos\\World of Warcraft\\_forever_\\Interface\\AddOns';
  assert.equal(carpetaAddOns({ config: {}, env: {}, registro: ['D:\\Juegos\\World of Warcraft\\_retail_\\'], existe: (r) => igual(r, addons) }), addons);
});

// ---------- consultar (con ejecutarPs inyectado) ----------

test('consultar: pasa el qué a ejecutarPs y lee su JSON', async () => {
  const pedidos = [];
  const ejecutarPs = async (que) => {
    pedidos.push(que);
    return { procesos: '[{"pid":1,"ruta":"E:\\\\wow\\\\World of Warcraft\\\\_forever_\\\\Wow.exe"},{"pid":2,"ruta":null}]\r\n', registro: '[]', unidades: '["C","E"]' }[que];
  };
  assert.deepEqual(await consultar('procesos', { ejecutarPs }), [
    { pid: 1, ruta: 'E:\\wow\\World of Warcraft\\_forever_\\Wow.exe' }, { pid: 2, ruta: null },
  ]);
  assert.deepEqual(await consultar('registro', { ejecutarPs }), []);
  assert.deepEqual(await consultar('unidades', { ejecutarPs }), ['C', 'E']);
  assert.deepEqual(pedidos, ['procesos', 'registro', 'unidades']);
});

test('consultar: un qué desconocido no lanza nada; un JSON roto o un fallo de PowerShell rechazan', async () => {
  let llamadas = 0;
  const ejecutarPs = async () => { llamadas++; return '[]'; };
  for (const malo of ['otro', '', undefined, 'procesos; calc', 'PROCESOS']) {
    await assert.rejects(consultar(malo, { ejecutarPs }), /qué/, String(malo));
  }
  assert.equal(llamadas, 0);
  await assert.rejects(consultar('procesos', { ejecutarPs: async () => '{roto' }));
  await assert.rejects(consultar('procesos', { ejecutarPs: async () => { throw new Error('sin PowerShell'); } }), /sin PowerShell/);
});

// ---------- juego.ps1 ----------

test('juego.ps1: solo ASCII y solo lee (sin órdenes que escriban, lancen o paren nada)', () => {
  const texto = readFileSync(SCRIPT_JUEGO, 'utf8');
  assert.ok(!/[^\x00-\x7f]/.test(texto), 'juego.ps1 tiene caracteres que no son ASCII');
  const sinComentarios = texto.replace(/<#[\s\S]*?#>/g, '').replace(/#[^\n]*/g, '');
  for (const orden of ['Set-Item', 'New-Item', 'Remove-Item', 'Rename-Item', 'Move-Item', 'Copy-Item', 'Set-Content', 'Add-Content',
    'Out-File', 'Stop-Process', 'Start-Process', 'Invoke-CimMethod', 'Invoke-WmiMethod', 'Terminate', 'Set-Location', 'reg.exe', 'taskkill']) {
    assert.ok(!sinComentarios.toLowerCase().includes(orden.toLowerCase()), `juego.ps1 usa ${orden}`);
  }
  assert.match(sinComentarios, /Win32_Process/);
  assert.match(sinComentarios, /Name='Wow\.exe'/);
  assert.match(sinComentarios, /WOW6432Node\\Blizzard Entertainment\\World of Warcraft/);
  assert.match(sinComentarios, /Get-PSDrive -PSProvider FileSystem/);
});

test('juego.ps1 -Que unidades da un JSON con "C"', { skip: !WIN, timeout: 30_000 }, async () => {
  const unidades = await consultar('unidades');
  assert.ok(Array.isArray(unidades));
  assert.ok(unidades.includes('C'), JSON.stringify(unidades));
  for (const u of unidades) assert.match(u, /^[A-Za-z]$/);
});

test('juego.ps1 -Que procesos da un array (vacío o no) en menos de 15 s', { skip: !WIN, timeout: 30_000 }, async () => {
  const antes = Date.now();
  const procesos = await consultar('procesos');
  assert.ok(Date.now() - antes < 15_000);
  assert.ok(Array.isArray(procesos));
  for (const p of procesos) {
    assert.equal(typeof p.pid, 'number');
    assert.ok(p.ruta === null || typeof p.ruta === 'string');
  }
});

test('juego.ps1 -Que registro da un array de textos', { skip: !WIN, timeout: 30_000 }, async () => {
  const registro = await consultar('registro');
  assert.ok(Array.isArray(registro));
  for (const r of registro) assert.equal(typeof r, 'string');
});
