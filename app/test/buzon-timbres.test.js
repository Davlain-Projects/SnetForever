// Fase 4, tarea 17: buzón en las ranuras (buzon.mjs), timbres (timbres.mjs) e instalación de ranuras (instalacion.mjs).
// Todo en carpetas de prueba: la cuarentena va a SNF_DATOS dentro de la carpeta temporal, nunca a la real.
import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeFs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { luaCadena, aLuaSeguro, tablaBuzon, escribirRanuras, tocRanura, LIMITE_BUZON, RANURAS } from '../src/buzon.mjs';
import { crearTimbres } from '../src/timbres.mjs';
import { prepararAddOns } from '../src/instalacion.mjs';
import { VERSION } from '../src/version.mjs';
import { raizDelVolumen } from '../src/fsseguro.mjs';
import { ERRORES, textoError } from '../src/textos.mjs';

const carpetas = [];
const maquinas = [];
// Las máquinas de cada prueba se cierran al acabarla: guardarlas hasta el final del archivo agotaba el montón de Node.
afterEach(() => {
  maquinas.splice(0).forEach((m) => m.cerrar());
});
after(() => {
  carpetas.forEach((c) => rmSync(c, { recursive: true, force: true }));
});

function temporal() {
  const dir = mkdtempSync(join(tmpdir(), 'snf-buzon-'));
  carpetas.push(dir);
  return dir;
}

// Entorno de prueba: los datos (y con ellos la cuarentena) dentro de la carpeta temporal.
function entorno(base) {
  const datos = join(base, 'datos');
  return { env: { SNF_DATOS: datos }, datos };
}

const nombreRanura = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;
const TIMBRES = ['presente', 'timbre_a', 'timbre_b', 'recibido_par', 'recibido_impar', 'vivo_a', 'vivo_b'];

// Carpeta AddOns de prueba con SnetForever (su .toc) y, si se pide, los timbres.
function addonsDePrueba(interfaz = '16001') {
  const base = temporal();
  const addons = join(base, 'AddOns');
  mkdirSync(join(addons, 'SnetForever'), { recursive: true });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), `## Interface: ${interfaz}\n## Title: SnetForever\n\nnucleo.lua\n`);
  const raiz = join(base, 'volumen'); // la «raíz del volumen» de la prueba: ahí va la _CUARENTENA
  mkdirSync(raiz);
  return { base, addons, raiz, ...entorno(base) };
}

// Todos los archivos (ruta relativa) bajo una carpeta.
function todos(dir, rel = '') {
  const salida = [];
  for (const n of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${n.name}` : n.name;
    if (n.isDirectory()) salida.push(...todos(dir, r));
    else salida.push(r);
  }
  return salida;
}

const bytes = (t) => Buffer.byteLength(t, 'utf8');

function leerLua(texto) {
  const m = crearMaquina({ arrancar: false });
  try {
    return m.lua(`${texto}\nreturn SNF_BUZON`);
  } finally {
    m.cerrar();
  }
}

// ---------- luaCadena, aLuaSeguro y tablaBuzon ----------

test('luaCadena escapa comillas, barras, saltos, el cero y los corchetes, y una mitad sustituta suelta pasa a U+FFFD', () => {
  const m = crearMaquina({ arrancar: false });
  maquinas.push(m);
  const textos = ['"]] os.exit() --', 'a\nb\r\nc', 'x\0y1', 'comilla " y barra \\ y \\n', 'mitad \ud800 suelta', 'ñandú 日本 😀', '\x01\x1f\x7f9'];
  for (const t of textos) {
    const esperado = t.toWellFormed();
    assert.equal(m.lua(luaCadena(t)), esperado, JSON.stringify(t));
  }
  assert.equal(luaCadena('\0'), '"\\000"');
  assert.equal(luaCadena('\x019'), '"\\0019"');
});

test('aLuaSeguro: tablas, cadenas, números finitos y booleanos; lo demás da error', () => {
  const m = crearMaquina({ arrancar: false });
  maquinas.push(m);
  const v = { a: 1, b: 'x', c: true, d: [1, 'dos', { e: false }], f: 45.25, g: -3, h: 1e-7, [5]: 'cinco' };
  assert.deepEqual(m.lua(aLuaSeguro(v)), { a: 1, b: 'x', c: true, d: [1, 'dos', { e: false }], f: 45.25, g: -3, h: 1e-7, 5: 'cinco' });
  assert.equal(aLuaSeguro({ a: undefined, b: 1 }), '{b = 1}');
  assert.equal(aLuaSeguro([]), '{}');
  const malos = [NaN, Infinity, -Infinity, null, undefined, () => 1, Symbol('x'), 10n, new Date(), new Map(), { 'a b': 1 }, { 'end': 1 }, { goto: 1 }, { '1x': 1 }, { a: null }, [1, undefined], [1, , 3], { a: NaN }, new (class X {})()];
  for (const x of malos) assert.throws(() => aLuaSeguro(x), undefined, String(x));
  // una clave con inyección no pasa
  assert.throws(() => aLuaSeguro({ 'a = 1, b': 2 }));
});

test('aLuaSeguro: hasta 12 niveles; a 13 da error; un ciclo da error', () => {
  const anida = (n) => {
    let v = 1;
    for (let i = 0; i < n; i++) v = { x: v };
    return v;
  };
  assert.doesNotThrow(() => aLuaSeguro(anida(12)));
  assert.throws(() => aLuaSeguro(anida(13)), /profundidad|niveles/i);
  const ciclo = {};
  ciclo.yo = ciclo;
  assert.throws(() => aLuaSeguro(ciclo));
  const m = crearMaquina({ arrancar: false });
  maquinas.push(m);
  assert.deepEqual(m.lua(aLuaSeguro(anida(3))), { x: { x: { x: 1 } } });
});

const registroBase = (seq, texto = 'hola', extra = {}) => ({ seq, pj: 'Tal Cual', msg: `a3f1-${seq}`, t: 'respuesta', texto, ...extra });

test('tablaBuzon: textos peligrosos salen del Lua generado tal cual, como datos', () => {
  const textos = ['"]] os.exit() --', 'línea 1\nlínea 2', 'a\0b', 'dice "hola"', 'barra \\ final\\', 'suelta \ud83d fin', ']]; os.exit(); SNF_BUZON = {[['];
  const registros = textos.map((t, i) => registroBase(i + 1, t));
  const texto = tablaBuzon({ seq: textos.length, estado: { claude: 'ok' }, recibidos: { 'Tal Cual': 'a3f1-7', 'Ña "x"': 'b-1' }, registros });
  assert.ok(texto.startsWith('SNF_BUZON = {'));
  assert.ok(texto.endsWith('\n'));
  const b = leerLua(texto);
  assert.equal(b.v, 1);
  assert.equal(b.app, VERSION);
  assert.equal(b.seq, textos.length);
  assert.equal(typeof b.ahora, 'number');
  assert.deepEqual(b.estado, { claude: 'ok' });
  assert.deepEqual(b.recibidos, { 'Tal Cual': 'a3f1-7', 'Ña "x"': 'b-1' });
  assert.equal(b.registros.length, textos.length);
  b.registros.forEach((r, i) => assert.equal(r.texto, textos[i].toWellFormed()));
});

test('tablaBuzon: registro completo con motor, propuesta, marcas y guiaIA anidados; ordenado por seq y los 10 últimos', () => {
  const completo = registroBase(12, 'ruta', {
    motor: 'codex',
    propuesta: { titulo: 'Ruta', puntos: [{ mapa: 1413, x: 45.2, y: 30.1, etiqueta: 'Aquí', tipo: 'recoger', q: 748, seguir: true }, { mapa: 1413, x: 1, y: 2, etiqueta: 'Allí', tipo: 'lugar', seguir: false }] },
    marcas: { vender: [2589], usar: [118] },
    guia: { clave: 'g', titulo: 'T' },
    guiaIA: { clave: 'ia1', titulo: 'Guía', pasos: [{ n: 1, texto: 'a', elementos: [{ tipo: 'q', id: 748 }] }] },
  });
  const registros = [];
  for (let i = 14; i >= 1; i--) registros.push(i === 12 ? completo : registroBase(i));
  const b = leerLua(tablaBuzon({ seq: 14, estado: { claude: 'ok' }, recibidos: {}, registros }));
  assert.deepEqual(b.registros.map((r) => r.seq), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  const r12 = b.registros.find((r) => r.seq === 12);
  assert.equal(r12.motor, 'codex');
  assert.equal(r12.propuesta.puntos.length, 2);
  assert.equal(r12.propuesta.puntos[0].x, 45.2);
  assert.deepEqual(r12.marcas, { vender: [2589], usar: [118] });
  assert.equal(r12.guiaIA.pasos[0].elementos[0].id, 748);
});

test('tablaBuzon: un registro con un valor no permitido da error', () => {
  assert.throws(() => tablaBuzon({ seq: 1, estado: {}, recibidos: {}, registros: [registroBase(1, 'x', { raro: () => 1 })] }));
  assert.throws(() => tablaBuzon({ seq: 1, estado: {}, recibidos: {}, registros: [registroBase(1, 'x', { raro: { a: { b: null } } })] }));
});

test('tablaBuzon: 10 registros de 8 KB caben en 64 KB quitando los más antiguos, con el más nuevo dentro', () => {
  const registros = [];
  for (let i = 1; i <= 10; i++) registros.push(registroBase(i, String(i % 10).repeat(8 * 1024)));
  const texto = tablaBuzon({ seq: 10, estado: { claude: 'ok' }, recibidos: {}, registros });
  assert.ok(bytes(texto) <= LIMITE_BUZON, `${bytes(texto)} bytes`);
  const b = leerLua(texto);
  assert.equal(b.registros[b.registros.length - 1].seq, 10);
  assert.ok(b.registros.length < 10);
  assert.ok(b.registros.length >= 7);
  assert.equal(b.registros[0].seq, 10 - b.registros.length + 1);
});

test('tablaBuzon: si el más nuevo solo no cabe se le quita guiaIA (guiaIAQuitada) y, si sigue sin caber, se recorta su texto', () => {
  const grande = { clave: 'g', titulo: 'G', pasos: [{ n: 1, texto: 'p'.repeat(70 * 1024) }] };
  const solo = registroBase(3, 'texto corto', { guiaIA: grande });
  const viejo = registroBase(2, 'viejo');
  const texto = tablaBuzon({ seq: 3, estado: { claude: 'ok' }, recibidos: {}, registros: [viejo, solo] });
  assert.ok(bytes(texto) <= LIMITE_BUZON);
  const b = leerLua(texto);
  const r = b.registros[b.registros.length - 1];
  assert.equal(r.seq, 3);
  assert.equal(r.guiaIA, undefined);
  assert.equal(r.guiaIAQuitada, true);
  assert.equal(r.texto, 'texto corto');

  // Sin guiaIA y con el texto enorme: se recorta, sin partir un carácter y sin guiaIAQuitada.
  const enorme = registroBase(4, 'ñ'.repeat(40 * 1024) + '日'.repeat(20 * 1024), { motor: 'claude' });
  const t2 = tablaBuzon({ seq: 4, estado: { claude: 'ok' }, recibidos: {}, registros: [enorme] });
  assert.ok(bytes(t2) <= LIMITE_BUZON);
  const r2 = leerLua(t2).registros[0];
  assert.equal(r2.seq, 4);
  assert.equal(r2.guiaIAQuitada, undefined);
  assert.equal(r2.textoRecortado, true);
  assert.ok(r2.texto.length > 1000 && r2.texto.length < 60 * 1024);
  assert.ok(!r2.texto.includes('�'));
  assert.equal(r2.motor, 'claude');
});

test('tablaBuzon: sin registros sale una tabla válida', () => {
  const b = leerLua(tablaBuzon({ seq: 0, estado: { claude: 'sin_sesion' }, recibidos: {}, registros: [] }));
  assert.equal(b.seq, 0);
  assert.deepEqual(b.estado, { claude: 'sin_sesion' });
});

// ---------- tocRanura ----------

// Lote G: las ranuras se pliegan bajo SnetForever en la lista de addons (`## Group: SnetForever`, como los módulos de
// EllesmereUI) y no llevan `## Category` propia: así no salen en una categoría aparte, lejos de SnetForever.
test('tocRanura(7, "16001") es el texto exacto del protocolo, agrupado bajo SnetForever', () => {
  const esperado = [
    '## Interface: 16001',
    '## Title: SnetForever - Respuestas 007',
    '## Notes: Trae al juego las respuestas del chat de SnetForever. Déjalo activado.',
    '## LoadOnDemand: 1',
    '## Dependencies: SnetForever',
    '## Group: SnetForever',
    '## X-License: MIT',
    // 11-nov: la misma estrella que SnetForever en la lista de addons (sin ella el juego pone un «?» rojo)
    '## IconTexture: Interface\\AddOns\\SnetForever\\recursos\\icono',
    '',
    'buzon.lua',
    '',
  ].join('\n');
  assert.equal(tocRanura(7, '16001'), esperado);
  assert.ok(tocRanura(20, 11500).includes('Respuestas 020') && tocRanura(20, 11500).includes('Interface: 11500'));
  for (const i of [1, 20]) {
    assert.match(tocRanura(i), /^## Group: SnetForever$/m, `ranura ${i}`);
    assert.doesNotMatch(tocRanura(i), /^## Category/m, `ranura ${i}`);
  }
});

test('RANURAS es 20', () => {
  assert.equal(RANURAS, 20);
});

// ---------- escribirRanuras ----------

// Carpeta AddOns con ranuras 1..n ya hechas (buzón vacío).
function conRanuras(n = 6) {
  const h = addonsDePrueba();
  for (let i = 1; i <= n; i++) {
    mkdirSync(join(h.addons, nombreRanura(i)));
    writeFileSync(join(h.addons, nombreRanura(i), `${nombreRanura(i)}.toc`), tocRanura(i, '16001'));
    writeFileSync(join(h.addons, nombreRanura(i), 'buzon.lua'), 'SNF_BUZON = nil\n');
  }
  return h;
}

const contenido = (h, i) => readFileSync(join(h.addons, nombreRanura(i), 'buzon.lua'), 'utf8');

test('escribirRanuras del 3 al 5: solo cambian R003-R005 y no queda ningún temporal', async () => {
  const h = conRanuras(6);
  const antes = todos(h.addons);
  const texto = tablaBuzon({ seq: 1, estado: { claude: 'ok' }, recibidos: {}, registros: [registroBase(1)] });
  const r = await escribirRanuras(h.addons, texto, { desde: 3, hasta: 5, raizVolumen: h.raiz });
  assert.deepEqual(r.escritas, [3, 4, 5]);
  assert.deepEqual(r.fallos, []);
  for (const i of [1, 2, 6]) assert.equal(contenido(h, i), 'SNF_BUZON = nil\n');
  for (const i of [3, 4, 5]) assert.equal(contenido(h, i), texto);
  assert.deepEqual(todos(h.addons), antes);
  // La carpeta de datos no se toca (nada fue a cuarentena: lo sustituido era nuestro).
  assert.equal(existsSync(join(h.raiz, '_CUARENTENA')), false, 'nada que apartar: no se crea la cuarentena');
});

test('escribirRanuras: un EBUSY una vez se reintenta (25 ms) y se escribe; tres EBUSY seguidos esperan 25, 50 y 75', async () => {
  const h = conRanuras(3);
  const texto = 'SNF_BUZON = {v = 1}\n';
  let falla = 1;
  const fs = { ...nodeFs, renameSync(a, b) {
    if (falla > 0 && b.endsWith('buzon.lua')) {
      falla--;
      throw Object.assign(new Error('ocupado'), { code: 'EBUSY' });
    }
    return nodeFs.renameSync(a, b);
  } };
  const esperas = [];
  const dormir = async (ms) => { esperas.push(ms); };
  let r = await escribirRanuras(h.addons, texto, { desde: 2, hasta: 2, fs, dormir, raizVolumen: h.raiz });
  assert.deepEqual(r.escritas, [2]);
  assert.deepEqual(esperas, [25]);
  assert.equal(contenido(h, 2), texto);

  falla = 3;
  esperas.length = 0;
  r = await escribirRanuras(h.addons, 'SNF_BUZON = {v = 2}\n', { desde: 3, hasta: 3, fs, dormir, raizVolumen: h.raiz });
  assert.deepEqual(esperas, [25, 50, 75]);
  assert.deepEqual(r.escritas, [3]);

  // Cuatro seguidos: falla, pero sin dejar temporales.
  falla = 4;
  const antes = todos(h.addons);
  r = await escribirRanuras(h.addons, 'SNF_BUZON = {v = 3}\n', { desde: 1, hasta: 1, fs, dormir, raizVolumen: h.raiz });
  assert.deepEqual(r.escritas, []);
  assert.equal(r.fallos.length, 1);
  assert.equal(r.fallos[0].ranura, 1);
  assert.equal(r.fallos[0].codigo, 'EBUSY');
  assert.equal(contenido(h, 1), 'SNF_BUZON = nil\n');
  assert.deepEqual(todos(h.addons), antes, 'sin temporales');
  assert.equal(todos(h.raiz).filter((x) => x.includes('.tmp-')).length, 1, 'el temporal fallido va a la cuarentena');
});

test('escribirRanuras: una ranura que falta es un fallo y no se crea; un error que no es de bloqueo no se reintenta', async () => {
  const h = conRanuras(2);
  const r = await escribirRanuras(h.addons, 'SNF_BUZON = nil\n', { desde: 2, hasta: 4, raizVolumen: h.raiz });
  assert.deepEqual(r.escritas, [2]);
  assert.deepEqual(r.fallos.map((f) => f.ranura), [3, 4]);
  assert.equal(existsSync(join(h.addons, nombreRanura(3))), false);
  const esperas = [];
  const fs = { ...nodeFs, renameSync() { throw Object.assign(new Error('no'), { code: 'ENOSPC' }); } };
  const r2 = await escribirRanuras(h.addons, 'x', { desde: 1, hasta: 1, fs, dormir: async (ms) => { esperas.push(ms); }, raizVolumen: h.raiz });
  assert.equal(r2.fallos[0].codigo, 'ENOSPC');
  assert.deepEqual(esperas, []);
});

test('escribirRanuras: un buzon.lua que no es nuestro va a la cuarentena y se escribe el nuevo', async () => {
  const h = conRanuras(2);
  writeFileSync(join(h.addons, nombreRanura(2), 'buzon.lua'), 'print("otro")\n');
  const antes = todos(h.addons).length;
  const r = await escribirRanuras(h.addons, 'SNF_BUZON = {v = 1}\n', { desde: 1, hasta: 2, raizVolumen: h.raiz });
  assert.deepEqual(r.escritas, [1, 2]);
  assert.equal(contenido(h, 2), 'SNF_BUZON = {v = 1}\n');
  assert.equal(todos(h.addons).length, antes);
  const guardados = todos(h.raiz).filter((x) => x.startsWith('_CUARENTENA/SnetForever/') && x.endsWith('buzon.lua'));
  assert.equal(guardados.length, 1);
  assert.equal(readFileSync(join(h.raiz, guardados[0]), 'utf8'), 'print("otro")\n');
});

test('escribirRanuras: una ranura que es un enlace o unión hacia fuera de AddOns no se escribe', async (t) => {
  const h = conRanuras(2);
  const fuera = join(h.base, 'fuera');
  mkdirSync(fuera);
  writeFileSync(join(fuera, 'buzon.lua'), 'intacto\n');
  // En Windows sin permisos, symlink de carpeta puede fallar: se usa una unión (junction).
  const camino = join(h.addons, nombreRanura(2));
  rmSync(camino, { recursive: true, force: true });
  try {
    symlinkSync(fuera, camino, 'junction');
  } catch {
    t.skip('no se pudo crear el enlace');
    return;
  }
  const r = await escribirRanuras(h.addons, 'SNF_BUZON = {v = 1}\n', { desde: 1, hasta: 2, raizVolumen: h.raiz });
  assert.deepEqual(r.escritas, [1]);
  assert.equal(r.fallos[0].ranura, 2);
  assert.equal(r.fallos[0].codigo, 'ENLACE');
  assert.equal(readFileSync(join(fuera, 'buzon.lua'), 'utf8'), 'intacto\n');
  assert.deepEqual(readdirSync(fuera), ['buzon.lua']);
});

// ---------- prepararAddOns ----------

test('prepararAddOns crea 20 ranuras y los 7 timbres; la segunda vez no crea nada', () => {
  const h = addonsDePrueba();
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r.ranurasCreadas, 20);
  assert.equal(r.timbresCreados, 7);
  assert.equal(r.tocsReescritos, 0);
  assert.equal(r.juegoDebeReiniciar, true);
  assert.equal(existsSync(join(h.addons, nombreRanura(21))), false, 'no hay ranura 21');
  for (let i = 1; i <= 20; i++) {
    const d = join(h.addons, nombreRanura(i));
    assert.equal(readFileSync(join(d, `${nombreRanura(i)}.toc`), 'utf8'), tocRanura(i, '16001'));
    assert.equal(readFileSync(join(d, 'buzon.lua'), 'utf8'), 'SNF_BUZON = nil\n');
  }
  for (const t of TIMBRES) assert.equal(statSync(join(h.addons, 'SnetForever', 'senales', `${t}.wav`)).size, 0);
  const antes = todos(h.addons);
  const r2 = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.deepEqual(r2, { ranurasCreadas: 0, timbresCreados: 0, tocsReescritos: 0, juegoDebeReiniciar: false });
  assert.deepEqual(todos(h.addons), antes);
});

test('prepararAddOns: la interfaz sale de SnetForever.toc (16001 si no hay) y solo crea lo que falta', () => {
  const h = addonsDePrueba('11500');
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.ok(readFileSync(join(h.addons, nombreRanura(1), `${nombreRanura(1)}.toc`), 'utf8').startsWith('## Interface: 11500\n'));
  const h2 = addonsDePrueba();
  rmSync(join(h2.addons, 'SnetForever', 'SnetForever.toc'));
  prepararAddOns(h2.addons, { raizVolumen: h2.raiz });
  assert.ok(readFileSync(join(h2.addons, nombreRanura(1), `${nombreRanura(1)}.toc`), 'utf8').startsWith('## Interface: 16001\n'));
  // Si falta una ranura y un timbre, solo se crean esos.
  rmSync(join(h2.addons, nombreRanura(15)), { recursive: true, force: true });
  rmSync(join(h2.addons, 'SnetForever', 'senales', 'vivo_b.wav'));
  const r = prepararAddOns(h2.addons, { raizVolumen: h2.raiz });
  assert.equal(r.ranurasCreadas, 1);
  assert.equal(r.timbresCreados, 1);
  assert.equal(r.juegoDebeReiniciar, true);
});

test('prepararAddOns: un .toc con Interface 11500 va a la cuarentena y se reescribe; el número de archivos no baja', () => {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  const viejo = '## Interface: 11500\n## Title: viejo\n\nbuzon.lua\n';
  writeFileSync(join(h.addons, nombreRanura(9), `${nombreRanura(9)}.toc`), viejo);
  const antes = todos(h.addons).length;
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r.tocsReescritos, 1);
  assert.equal(r.ranurasCreadas, 0);
  assert.equal(r.juegoDebeReiniciar, true, 'un .toc reescrito también pide reiniciar el juego (revisión final, Minor 3)');
  assert.equal(readFileSync(join(h.addons, nombreRanura(9), `${nombreRanura(9)}.toc`), 'utf8'), tocRanura(9, '16001'));
  assert.ok(todos(h.addons).length >= antes);
  const guardados = todos(h.raiz).filter((x) => x.startsWith('_CUARENTENA/SnetForever/') && x.endsWith('.toc'));
  assert.equal(guardados.length, 1);
  assert.equal(readFileSync(join(h.raiz, guardados[0]), 'utf8'), viejo);
  assert.equal(existsSync(h.datos), false, 'la cuarentena de C: no se usa para lo de AddOns');
});

test('prepararAddOns: sin la carpeta, o sin SnetForever, da error y no crea nada', () => {
  const base = temporal();
  assert.throws(() => prepararAddOns(join(base, 'noexiste'), {}), { code: 'ADDONS' });
  assert.equal(existsSync(join(base, 'noexiste')), false);
  const vacia = join(base, 'vacia');
  mkdirSync(vacia);
  assert.throws(() => prepararAddOns(vacia, {}), { code: 'ADDONS' });
  assert.deepEqual(readdirSync(vacia), []);
  assert.throws(() => prepararAddOns('', {}), { code: 'ADDONS' });
  assert.throws(() => prepararAddOns(undefined, {}), { code: 'ADDONS' });
});

test('prepararAddOns: una ranura que es un enlace hacia fuera no se toca', (t) => {
  const h = addonsDePrueba();
  const fuera = join(h.base, 'fuera');
  mkdirSync(fuera);
  try {
    symlinkSync(fuera, join(h.addons, nombreRanura(4)), 'junction');
  } catch {
    t.skip('no se pudo crear el enlace');
    return;
  }
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r.ranurasCreadas, 19);
  assert.deepEqual(readdirSync(fuera), []);
});

// ---------- lote G: de 100 ranuras a 20 ----------

// El .toc de una ranura de la 0.4.8 (100 ranuras, cada una en su grupo y con su categoría).
const tocViejo = (i) => {
  const n = String(i).padStart(3, '0');
  return [
    '## Interface: 16001',
    `## Title: SnetForever - Respuestas ${n}`,
    '## Notes: Trae al juego las respuestas del chat de SnetForever. Déjalo activado.',
    '## LoadOnDemand: 1',
    '## Dependencies: SnetForever',
    `## Group: SnetForever_R${n}`,
    '## Category: SnetForever - Respuestas',
    '## X-License: MIT',
    '',
    'buzon.lua',
    '',
  ].join('\n');
};

// Carpeta AddOns como la dejó la 0.4.8: las 100 ranuras con su .toc viejo y un buzón con algo dentro, los timbres y
// otras carpetas de SnetForever que no son ranuras.
function conRanurasViejas() {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz }); // los timbres (y las 20 ranuras, que se pisan abajo)
  for (let i = 1; i <= 100; i++) {
    const d = join(h.addons, nombreRanura(i));
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, `${nombreRanura(i)}.toc`), tocViejo(i));
    writeFileSync(join(d, 'buzon.lua'), `SNF_BUZON = {v = 1, seq = ${i}}\n`);
  }
  for (const otra of ['SnetForever_Rutas', 'SnetForever_Misiones', 'SnetForever_R1000', 'SnetForever_R21']) {
    mkdirSync(join(h.addons, otra));
    writeFileSync(join(h.addons, otra, 'x.lua'), '-- no es una ranura\n');
  }
  return h;
}

const ranurasEn = (dir) => readdirSync(dir).filter((n) => /^SnetForever_R\d{3}$/.test(n)).sort();

test('lote G: con las 100 ranuras de la 0.4.8, prepararAddOns deja 20 y aparta 80 a la cuarentena; no se borra nada', () => {
  const h = conRanurasViejas();
  const antes = todos(h.addons).length;
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r.ranurasApartadas, 80);
  assert.equal(r.tocsReescritos, 20, 'los 20 .toc que se quedan cambian de ## Group');
  assert.equal(r.ranurasCreadas, 0);
  assert.equal(r.timbresCreados, 0);
  assert.equal(r.juegoDebeReiniciar, true);
  assert.equal(r.avisos, undefined);
  // En AddOns: R001…R020, con el .toc nuevo y su buzón intacto; lo que no es una ranura no se toca.
  assert.deepEqual(ranurasEn(h.addons), Array.from({ length: 20 }, (_, k) => nombreRanura(k + 1)));
  for (let i = 1; i <= 20; i++) {
    const d = join(h.addons, nombreRanura(i));
    assert.equal(readFileSync(join(d, `${nombreRanura(i)}.toc`), 'utf8'), tocRanura(i, '16001'));
    assert.match(readFileSync(join(d, `${nombreRanura(i)}.toc`), 'utf8'), /^## Group: SnetForever$/m);
    assert.equal(readFileSync(join(d, 'buzon.lua'), 'utf8'), `SNF_BUZON = {v = 1, seq = ${i}}\n`);
  }
  for (const otra of ['SnetForever_Rutas', 'SnetForever_Misiones', 'SnetForever_R1000', 'SnetForever_R21']) {
    assert.equal(readFileSync(join(h.addons, otra, 'x.lua'), 'utf8'), '-- no es una ranura\n', otra);
  }
  // En la cuarentena (una sola tanda): las 80 carpetas enteras y los 20 .toc viejos.
  const sellos = readdirSync(join(h.raiz, '_CUARENTENA', 'SnetForever'));
  assert.equal(sellos.length, 1);
  const tanda = join(h.raiz, '_CUARENTENA', 'SnetForever', sellos[0]);
  assert.deepEqual(ranurasEn(tanda), Array.from({ length: 80 }, (_, k) => nombreRanura(k + 21)));
  for (let i = 21; i <= 100; i++) {
    assert.equal(readFileSync(join(tanda, nombreRanura(i), `${nombreRanura(i)}.toc`), 'utf8'), tocViejo(i));
    assert.equal(readFileSync(join(tanda, nombreRanura(i), 'buzon.lua'), 'utf8'), `SNF_BUZON = {v = 1, seq = ${i}}\n`);
  }
  const tocs = readdirSync(tanda).filter((n) => n.endsWith('.toc')).sort();
  assert.equal(tocs.length, 20);
  assert.equal(readFileSync(join(tanda, `${nombreRanura(7)}.toc`), 'utf8'), tocViejo(7));
  // Ningún archivo se ha perdido: los de AddOns más los de la cuarentena son los de antes y los 20 .toc nuevos.
  assert.equal(todos(h.addons).length + todos(tanda).length, antes + 20);
  // La segunda vez ya no hay nada que hacer.
  const r2 = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.deepEqual(r2, { ranurasCreadas: 0, timbresCreados: 0, tocsReescritos: 0, juegoDebeReiniciar: false });
});

test('lote G: solo con ranuras de más (los .toc ya al día), apartarlas también pide reiniciar el juego', () => {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  mkdirSync(join(h.addons, nombreRanura(21)));
  writeFileSync(join(h.addons, nombreRanura(21), 'buzon.lua'), 'SNF_BUZON = nil\n');
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.deepEqual(r, { ranurasCreadas: 0, timbresCreados: 0, tocsReescritos: 0, ranurasApartadas: 1, juegoDebeReiniciar: true });
  assert.equal(existsSync(join(h.addons, nombreRanura(21))), false);
});

test('lote G: con el juego abierto no se aparta ninguna ranura ni se reescribe ningún .toc', () => {
  const h = conRanurasViejas();
  const antes = todos(h.addons);
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz, juegoAbierto: true });
  assert.deepEqual(r, { ranurasCreadas: 0, timbresCreados: 0, tocsReescritos: 0, juegoDebeReiniciar: false, aplazado: true });
  assert.deepEqual(todos(h.addons), antes);
  assert.equal(readFileSync(join(h.addons, nombreRanura(3), `${nombreRanura(3)}.toc`), 'utf8'), tocViejo(3));
  assert.equal(existsSync(join(h.raiz, '_CUARENTENA')), false);
  // Lo que falta sí se crea, como siempre (el juego no la ve hasta reiniciarse).
  rmSync(join(h.addons, nombreRanura(5)), { recursive: true, force: true });
  const r2 = prepararAddOns(h.addons, { raizVolumen: h.raiz, juegoAbierto: true });
  assert.equal(r2.ranurasCreadas, 1);
  assert.equal(r2.ranurasApartadas, undefined);
  assert.equal(existsSync(join(h.addons, nombreRanura(100))), true);
  // Ya cerrado, se hace.
  const r3 = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r3.ranurasApartadas, 80);
  assert.equal(r3.aplazado, undefined);
});

test('lote G: una ranura de más que es un enlace hacia fuera no se toca; sin cuarentena, las de más se quedan y avisa', (t) => {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  const fuera = join(h.base, 'fuera');
  mkdirSync(fuera);
  writeFileSync(join(fuera, 'buzon.lua'), 'intacto\n');
  try {
    symlinkSync(fuera, join(h.addons, nombreRanura(30)), 'junction');
  } catch {
    t.skip('no se pudo crear el enlace');
    return;
  }
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r.ranurasApartadas, undefined);
  assert.deepEqual(r.omitidas, [30]);
  assert.equal(r.juegoDebeReiniciar, false);
  assert.ok(existsSync(join(h.addons, nombreRanura(30))));
  assert.deepEqual(readdirSync(fuera), ['buzon.lua']);
  // Sin cuarentena posible: la ranura 40 se queda donde está, con un aviso, y no se pierde nada.
  mkdirSync(join(h.addons, nombreRanura(40)));
  writeFileSync(join(h.addons, nombreRanura(40), 'buzon.lua'), 'SNF_BUZON = nil\n');
  writeFileSync(join(h.raiz, '_CUARENTENA'), 'archivo, no carpeta');
  const r2 = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r2.ranurasApartadas, undefined);
  assert.deepEqual(r2.avisos.filter((a) => a.codigo === 'CUARENTENA').map((a) => a.ranura), [40]);
  assert.equal(readFileSync(join(h.addons, nombreRanura(40), 'buzon.lua'), 'utf8'), 'SNF_BUZON = nil\n');
});

// ---------- timbres ----------

// Un dormir controlado: cada espera queda pendiente hasta que la prueba la suelta.
function relojDeEsperas() {
  const pendientes = [];
  return {
    pendientes,
    dormir: (ms) => new Promise((resolver) => pendientes.push({ ms, resolver })),
    async soltar() {
      const p = pendientes.shift();
      p.resolver();
      await new Promise((r) => setImmediate(r));
    },
  };
}
const turno = () => new Promise((r) => setImmediate(r));

function conTimbres() {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  const senales = join(h.addons, 'SnetForever', 'senales');
  const estado = () => readdirSync(senales).sort();
  return { ...h, senales, estado };
}

test('tocar("timbre") dos veces: primero timbre_a.wav.fuera y después timbre_b; al terminar están los dos', async () => {
  const h = conTimbres();
  const reloj = relojDeEsperas();
  const t = crearTimbres(h.addons, { raizVolumen: h.raiz, dormir: reloj.dormir });
  const p1 = t.tocar('timbre');
  await turno();
  assert.ok(existsSync(join(h.senales, 'timbre_a.wav.fuera')));
  assert.ok(!existsSync(join(h.senales, 'timbre_a.wav')));
  assert.ok(existsSync(join(h.senales, 'timbre_b.wav')));
  assert.equal(reloj.pendientes[0].ms, 3000);
  const p2 = t.tocar('timbre');
  await turno();
  // El segundo espera a que el primero acabe: la pareja nunca tiene los dos fuera.
  assert.ok(existsSync(join(h.senales, 'timbre_b.wav')));
  await reloj.soltar();
  await p1;
  await turno();
  assert.ok(existsSync(join(h.senales, 'timbre_a.wav')));
  assert.ok(existsSync(join(h.senales, 'timbre_b.wav.fuera')));
  assert.ok(!existsSync(join(h.senales, 'timbre_b.wav')));
  await reloj.soltar();
  await p2;
  assert.ok(existsSync(join(h.senales, 'timbre_a.wav')));
  assert.ok(existsSync(join(h.senales, 'timbre_b.wav')));
  assert.ok(!h.estado().some((n) => n.endsWith('.fuera')));
  // El tercero vuelve a empezar por a.
  const p3 = t.tocar('timbre');
  await turno();
  assert.ok(existsSync(join(h.senales, 'timbre_a.wav.fuera')));
  await reloj.soltar();
  await p3;
  await t.parar();
});

test('tocar recibido_par y recibido_impar: 3 s cada uno, solo el suyo; pulsos de parejas distintas pueden coincidir', async () => {
  const h = conTimbres();
  const reloj = relojDeEsperas();
  const t = crearTimbres(h.addons, { raizVolumen: h.raiz, dormir: reloj.dormir });
  const p = t.tocar('recibido_impar');
  const q = t.tocar('timbre');
  await turno();
  assert.ok(existsSync(join(h.senales, 'recibido_impar.wav.fuera')));
  assert.ok(existsSync(join(h.senales, 'recibido_par.wav')));
  assert.ok(existsSync(join(h.senales, 'timbre_a.wav.fuera')));
  assert.deepEqual(reloj.pendientes.map((x) => x.ms), [3000, 3000]);
  await reloj.soltar();
  await reloj.soltar();
  await Promise.all([p, q]);
  assert.ok(!h.estado().some((n) => n.endsWith('.fuera')));
  await assert.rejects(() => t.tocar('inventado'), /timbre/);
  await t.parar();
});

test('al crear, se devuelve a su nombre cualquier .wav.fuera que quedó', async () => {
  const h = conTimbres();
  nodeFs.renameSync(join(h.senales, 'timbre_b.wav'), join(h.senales, 'timbre_b.wav.fuera'));
  nodeFs.renameSync(join(h.senales, 'vivo_a.wav'), join(h.senales, 'vivo_a.wav.fuera'));
  const t = crearTimbres(h.addons, { raizVolumen: h.raiz, dormir: async () => {} });
  assert.ok(existsSync(join(h.senales, 'timbre_b.wav')));
  assert.ok(existsSync(join(h.senales, 'vivo_a.wav')));
  assert.ok(!h.estado().some((n) => n.endsWith('.fuera')));
  await t.parar();
});

test('empezarVida con un reloj falso: toca vivo_a, vivo_b, vivo_a… cada 10 s con pulsos de 2,5 s; parar lo detiene y lo devuelve todo', async () => {
  const h = conTimbres();
  const reloj = relojDeEsperas();
  let tic = null;
  let intervalo = null;
  const relojFalso = { cada: (f, ms) => { tic = f; intervalo = ms; return () => { tic = null; }; } };
  const t = crearTimbres(h.addons, { raizVolumen: h.raiz, dormir: reloj.dormir, reloj: relojFalso });
  t.empezarVida();
  await turno();
  assert.equal(intervalo, 10000);
  assert.ok(existsSync(join(h.senales, 'vivo_a.wav.fuera')), 'toca ya al empezar');
  assert.equal(reloj.pendientes[0].ms, 2500);
  await reloj.soltar();
  await turno();
  assert.ok(existsSync(join(h.senales, 'vivo_a.wav')));
  tic();
  await turno();
  assert.ok(existsSync(join(h.senales, 'vivo_b.wav.fuera')));
  assert.ok(existsSync(join(h.senales, 'vivo_a.wav')));
  await reloj.soltar();
  await turno();
  tic();
  await turno();
  assert.ok(existsSync(join(h.senales, 'vivo_a.wav.fuera')));
  // parar con un pulso a medias: lo devuelve ya, sin esperar los 2,5 s.
  await t.parar();
  assert.equal(tic, null);
  assert.ok(!h.estado().some((n) => n.endsWith('.fuera')));
  assert.deepEqual(h.estado().filter((n) => n.endsWith('.wav')).length, 7);
});

test('un pulso a medias se devuelve aunque falle la espera; tocar tras parar no hace nada', async () => {
  const h = conTimbres();
  const t = crearTimbres(h.addons, { raizVolumen: h.raiz, dormir: async () => { throw new Error('reloj roto'); } });
  await assert.rejects(() => t.tocar('recibido_par'), /reloj roto/);
  assert.ok(existsSync(join(h.senales, 'recibido_par.wav')));
  await t.parar();
  assert.equal(await t.tocar('recibido_par'), false);
  assert.ok(existsSync(join(h.senales, 'recibido_par.wav')));
});

// ====================== Ronda 1 (Ruling F4-26) ======================

// Un fs que simula dos discos: renombrar a algo fuera de `volumen` (la carpeta de AddOns y la raíz del volumen del juego) da EXDEV.
function fsDosDiscos(volumen) {
  const dentro = (ruta) => ruta.toLowerCase().startsWith(volumen.toLowerCase());
  return { ...nodeFs, renameSync(a, b) {
    if (!dentro(a) || !dentro(b)) throw Object.assign(new Error('otro disco'), { code: 'EXDEV' });
    return nodeFs.renameSync(a, b);
  } };
}

test('EXDEV: lo sustituido va a la cuarentena del volumen del juego, no a la de los datos, y la ranura queda limpia', async () => {
  const h = conRanuras(2);
  writeFileSync(join(h.addons, nombreRanura(2), 'buzon.lua'), 'print("otro")\n');
  const fs = fsDosDiscos(h.base);
  const antes = todos(h.addons);
  const r = await escribirRanuras(h.addons, 'SNF_BUZON = {v = 1}\n', { desde: 1, hasta: 2, fs, raizVolumen: h.raiz });
  assert.deepEqual(r.escritas, [1, 2]);
  assert.deepEqual(todos(h.addons), antes, 'la ranura queda limpia: ni .ajeno ni temporales');
  const guardados = todos(h.raiz).filter((x) => x.startsWith('_CUARENTENA/SnetForever/') && x.endsWith('buzon.lua'));
  assert.equal(guardados.length, 1);
  assert.equal(readFileSync(join(h.raiz, guardados[0]), 'utf8'), 'print("otro")\n');
  assert.equal(existsSync(h.datos), false, 'no se crean carpetas vacías en la carpeta de datos');
  // lo mismo con un .toc de prepararAddOns
  writeFileSync(join(h.addons, nombreRanura(1), `${nombreRanura(1)}.toc`), '## Interface: 1\n');
  const p = prepararAddOns(h.addons, { fs, raizVolumen: h.raiz });
  assert.equal(p.tocsReescritos, 1);
  assert.equal(todos(h.raiz).filter((x) => x.endsWith('.toc')).length, 1);
  assert.equal(existsSync(h.datos), false);
});

test('si la cuarentena del volumen no se puede crear, no se sustituye nada: error claro y el archivo se queda', async () => {
  const h = conRanuras(2);
  writeFileSync(join(h.addons, nombreRanura(2), 'buzon.lua'), 'print("otro")\n');
  writeFileSync(join(h.raiz, '_CUARENTENA'), 'esto es un archivo, no una carpeta');
  const r = await escribirRanuras(h.addons, 'SNF_BUZON = {v = 1}\n', { desde: 1, hasta: 2, raizVolumen: h.raiz });
  assert.deepEqual(r.escritas, [1]);
  assert.equal(r.fallos[0].ranura, 2);
  assert.equal(r.fallos[0].codigo, 'CUARENTENA');
  assert.equal(contenido(h, 2), 'print("otro")\n');
  writeFileSync(join(h.addons, nombreRanura(2), `${nombreRanura(2)}.toc`), '## Interface: 1\n');
  // prepararAddOns no pierde lo hecho: ese .toc no se toca, avisa con CUARENTENA y sigue con las demás ranuras.
  const p = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(readFileSync(join(h.addons, nombreRanura(2), `${nombreRanura(2)}.toc`), 'utf8'), '## Interface: 1\n');
  assert.deepEqual(p.avisos.filter((a) => a.codigo === 'CUARENTENA').map((a) => a.ranura), [2]);
  assert.equal(p.tocsReescritos, 0);
  assert.equal(p.ranurasCreadas, 18);
  assert.equal(p.timbresCreados, 7);
  assert.equal(readFileSync(join(h.addons, nombreRanura(20), `${nombreRanura(20)}.toc`), 'utf8'), tocRanura(20, '16001'));
});

test('raizDelVolumen: la raíz absoluta de E:\\…, de una UNC y de \\\\?\\; lo que no es absoluto da CUARENTENA', () => {
  assert.equal(raizDelVolumen('E:\\wow\\World of Warcraft\\_forever_\\Interface\\AddOns'), 'E:\\');
  assert.equal(raizDelVolumen('e:\\'), 'e:\\');
  assert.equal(raizDelVolumen('E:'), 'E:\\');
  assert.equal(raizDelVolumen('\\\\servidor\\recurso\\juegos\\AddOns'), '\\\\servidor\\recurso\\');
  assert.equal(raizDelVolumen('\\\\servidor\\recurso'), '\\\\servidor\\recurso\\');
  assert.equal(raizDelVolumen('\\\\?\\E:\\wow\\AddOns'), '\\\\?\\E:\\');
  assert.equal(raizDelVolumen('\\\\?\\UNC\\servidor\\recurso\\AddOns'), '\\\\?\\UNC\\servidor\\recurso\\');
  for (const malo of ['wow\\AddOns', '\\wow\\AddOns', 'E:wow', '\\\\servidor', '\\\\servidor\\', '\\\\?\\UNC\\servidor', '\\\\?\\wow', '', null, 5]) {
    assert.throws(() => raizDelVolumen(malo), { code: 'CUARENTENA' }, String(malo));
  }
});

test('tablaBuzon: el error «grande» va en el idioma pedido (textos.mjs), sin texto bilingüe', () => {
  const enorme = registroBase(9, 'respuesta', { propuesta: { titulo: 't'.repeat(80 * 1024), puntos: [] } });
  const es = leerLua(tablaBuzon({ seq: 9, estado: {}, recibidos: {}, registros: [enorme] })).registros[0];
  assert.equal(es.texto, ERRORES.es.grande);
  const en = leerLua(tablaBuzon({ seq: 9, estado: {}, recibidos: {}, registros: [enorme], idioma: 'en' })).registros[0];
  assert.equal(en.texto, ERRORES.en.grande);
  assert.notEqual(ERRORES.es.grande, ERRORES.en.grande);
  assert.ok(!ERRORES.es.grande.includes(' / '));
  assert.equal(textoError('grande', '', 'en'), ERRORES.en.grande);
});

test('prepararAddOns: un .toc distinto va a <raíz>\\_CUARENTENA\\SnetForever\\<sello>\\ con su nombre (lo que dice la cabecera)', () => {
  const h = conRanuras(2);
  writeFileSync(join(h.addons, nombreRanura(2), `${nombreRanura(2)}.toc`), '## Interface: 1\n');
  const p = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(p.tocsReescritos, 1);
  const sellos = readdirSync(join(h.raiz, '_CUARENTENA', 'SnetForever'));
  assert.equal(sellos.length, 1);
  assert.match(sellos[0], /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
  const apartado = join(h.raiz, '_CUARENTENA', 'SnetForever', sellos[0], `${nombreRanura(2)}.toc`);
  assert.equal(readFileSync(apartado, 'utf8'), '## Interface: 1\n');
  assert.equal(readFileSync(join(h.addons, nombreRanura(2), `${nombreRanura(2)}.toc`), 'utf8'), tocRanura(2, '16001'));
});

test('la cuarentena del volumen no se usa si es un enlace hacia fuera', async (t) => {
  const h = conRanuras(2);
  writeFileSync(join(h.addons, nombreRanura(2), 'buzon.lua'), 'print("otro")\n');
  const fuera = join(h.base, 'fuera');
  mkdirSync(fuera);
  try {
    symlinkSync(fuera, join(h.raiz, '_CUARENTENA'), 'junction');
  } catch {
    t.skip('no se pudo crear el enlace');
    return;
  }
  const r = await escribirRanuras(h.addons, 'SNF_BUZON = {v = 1}\n', { desde: 2, hasta: 2, raizVolumen: h.raiz });
  assert.equal(r.fallos[0].codigo, 'CUARENTENA');
  assert.deepEqual(readdirSync(fuera), []);
  assert.equal(contenido(h, 2), 'print("otro")\n');
});

test('si writeFileSync del temporal falla a medias, el temporal va a la cuarentena y no queda en la ranura', async () => {
  const h = conRanuras(2);
  const fs = { ...nodeFs, writeFileSync(ruta, datos, op) {
    if (String(ruta).includes('.tmp-')) {
      nodeFs.writeFileSync(ruta, 'a medias');
      throw Object.assign(new Error('disco lleno'), { code: 'ENOSPC' });
    }
    return nodeFs.writeFileSync(ruta, datos, op);
  } };
  const antes = todos(h.addons);
  const r = await escribirRanuras(h.addons, 'SNF_BUZON = {v = 1}\n', { desde: 1, hasta: 1, fs, raizVolumen: h.raiz });
  assert.equal(r.fallos[0].codigo, 'ENOSPC');
  assert.deepEqual(todos(h.addons), antes);
  const t = todos(h.raiz).filter((x) => x.includes('.tmp-'));
  assert.equal(t.length, 1);
  assert.equal(readFileSync(join(h.raiz, t[0]), 'utf8'), 'a medias');
  assert.equal(contenido(h, 1), 'SNF_BUZON = nil\n');
});

test('tras agotar los reintentos en una ranura, las demás de la llamada se intentan una sola vez', async () => {
  const h = conRanuras(3);
  let intentos = 0;
  const fs = { ...nodeFs, renameSync(a, b) {
    if (b.endsWith('buzon.lua')) {
      intentos++;
      throw Object.assign(new Error('ocupado'), { code: 'EBUSY' });
    }
    return nodeFs.renameSync(a, b);
  } };
  const esperas = [];
  const r = await escribirRanuras(h.addons, 'x', { desde: 1, hasta: 3, fs, dormir: async (ms) => { esperas.push(ms); }, raizVolumen: h.raiz });
  assert.equal(r.fallos.length, 3);
  assert.equal(intentos, 4 + 1 + 1, 'la primera usa 1+3 intentos; las otras dos, uno cada una');
  assert.deepEqual(esperas, [25, 50, 75]);
});

test('tablaBuzon: el recorte no parte grafemas (emoji con ZWJ) y marca textoRecortado', () => {
  const familia = '👨‍👩‍👧';
  const registro = registroBase(1, familia.repeat(6000));
  const texto = tablaBuzon({ seq: 1, estado: { claude: 'ok' }, recibidos: {}, registros: [registro] });
  assert.ok(bytes(texto) <= LIMITE_BUZON);
  const r = leerLua(texto).registros[0];
  assert.equal(r.textoRecortado, true);
  assert.ok(r.texto.length > 0 && r.texto === familia.repeat(r.texto.length / familia.length));
  assert.ok(!r.texto.endsWith('‍'));
});

test('tablaBuzon: si ni recortando cabe (propuesta enorme) publica un error «grande» con el mismo msg; recibidos se queda en 50', () => {
  const enorme = registroBase(9, 'respuesta', { motor: 'codex', propuesta: { titulo: 't'.repeat(80 * 1024), puntos: [] } });
  const recibidos = {};
  for (let i = 1; i <= 80; i++) recibidos[`Pj${i}`] = `a-${i}`;
  const b = leerLua(tablaBuzon({ seq: 9, estado: { claude: 'ok' }, recibidos, registros: [registroBase(8), enorme] }));
  assert.equal(b.registros.length, 1);
  const r = b.registros[0];
  assert.equal(r.t, 'error');
  assert.equal(r.tipo, 'grande');
  assert.equal(r.seq, 9);
  assert.equal(r.msg, enorme.msg);
  assert.equal(r.pj, 'Tal Cual');
  assert.equal(r.propuesta, undefined);
  assert.equal(typeof r.texto, 'string');
  assert.equal(Object.keys(b.recibidos).length, 50);
  assert.equal(b.recibidos.Pj80, 'a-80');
  assert.equal(b.recibidos.Pj30, undefined);
});

test('prepararAddOns: si senales es una unión hacia fuera, avisa y no crea timbres allí', (t) => {
  const h = addonsDePrueba();
  const fuera = join(h.base, 'fuera');
  mkdirSync(fuera);
  try {
    symlinkSync(fuera, join(h.addons, 'SnetForever', 'senales'), 'junction');
  } catch {
    t.skip('no se pudo crear el enlace');
    return;
  }
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r.timbresCreados, 0);
  assert.equal(r.ranurasCreadas, 20);
  assert.equal(r.avisos.length, 1);
  assert.equal(r.avisos[0].codigo, 'SENALES');
  assert.deepEqual(readdirSync(fuera), []);
});

test('timbres: un .wav.fuera viejo junto a su .wav se aparta a la cuarentena del volumen al arrancar', async () => {
  const h = conTimbres();
  writeFileSync(join(h.senales, 'vivo_a.wav.fuera'), '');
  const t = crearTimbres(h.addons, { raizVolumen: h.raiz, dormir: async () => {} });
  assert.ok(!h.estado().some((n) => n.endsWith('.fuera')));
  assert.ok(existsSync(join(h.senales, 'vivo_a.wav')));
  assert.equal(todos(h.raiz).filter((x) => x.startsWith('_CUARENTENA/SnetForever/') && x.endsWith('vivo_a.wav.fuera')).length, 1);
  assert.equal(t.avisos[0].codigo, 'FUERA_VIEJO');
  await t.parar();
});

// Suelta todas las esperas pendientes, una y otra vez, hasta que la promesa se resuelve.
async function hastaQue(promesa, reloj) {
  let listo = false;
  promesa.then(() => { listo = true; }, () => { listo = true; });
  for (let i = 0; i < 1000 && !listo; i++) {
    await new Promise((r) => setTimeout(r, 5)); // los reintentos de renombre usan el reloj real
    while (reloj.pendientes.length) await reloj.soltar();
  }
}

test('timbres: un fallo al devolver al arrancar se apunta; el pulso de su pareja lo reintenta y no saca al compañero si falta', async () => {
  const h = conTimbres();
  nodeFs.renameSync(join(h.senales, 'timbre_b.wav'), join(h.senales, 'timbre_b.wav.fuera'));
  let roto = true;
  const fs = { ...nodeFs, renameSync(a, b) {
    if (roto && a.endsWith('.wav.fuera')) throw Object.assign(new Error('no'), { code: 'EPERM' });
    return nodeFs.renameSync(a, b);
  } };
  const reloj = relojDeEsperas();
  const t = crearTimbres(h.addons, { raizVolumen: h.raiz, fs, dormir: reloj.dormir });
  assert.deepEqual(t.fueraAhora(), ['timbre_b']);
  // timbre_b sigue fuera y no se puede devolver: tocar('timbre') quiere tocar a (turno 0), pero su compañero falta: no se saca a.
  const p = t.tocar('timbre');
  p.catch(() => {});
  await hastaQue(p, reloj);
  await assert.rejects(p, { code: 'PAREJA' });
  assert.ok(existsSync(join(h.senales, 'timbre_a.wav')), 'no se sacó el timbre cuyo compañero falta');
  assert.ok(!existsSync(join(h.senales, 'timbre_a.wav.fuera')));
  // Se arregla el fallo: el siguiente pulso devuelve a timbre_b y luego toca a.
  roto = false;
  const q = t.tocar('timbre');
  await hastaQue(q, reloj);
  assert.equal(await q, true);
  assert.deepEqual(t.fueraAhora(), []);
  await t.parar();
  assert.ok(!h.estado().some((n) => n.endsWith('.fuera')));
  assert.ok(existsSync(join(h.senales, 'timbre_a.wav')) && existsSync(join(h.senales, 'timbre_b.wav')));
});

test('timbres: si falla la devolución tras un pulso, el timbre queda apuntado y el siguiente pulso de la pareja lo reintenta y espera si el compañero falta', async () => {
  const h = conTimbres();
  let rotos = 0;
  const fs = { ...nodeFs, renameSync(a, b) {
    if (rotos > 0 && a.endsWith('.wav.fuera')) {
      rotos--;
      throw Object.assign(new Error('no'), { code: 'EACCES' });
    }
    return nodeFs.renameSync(a, b);
  } };
  const reloj = relojDeEsperas();
  const t = crearTimbres(h.addons, { raizVolumen: h.raiz, fs, dormir: reloj.dormir });
  const p = t.tocar('recibido_par');
  p.catch(() => {});
  await turno();
  assert.ok(existsSync(join(h.senales, 'recibido_par.wav.fuera')));
  rotos = 4; // la devolución falla con sus tres reintentos
  await hastaQue(p, reloj);
  await assert.rejects(p, { code: 'EACCES' });
  assert.deepEqual(t.fueraAhora(), ['recibido_par']);
  // El siguiente pulso de la pareja (impar) primero devuelve par (ya funciona) y toca.
  const q = t.tocar('recibido_impar');
  await turno();
  await turno();
  assert.ok(existsSync(join(h.senales, 'recibido_par.wav')));
  assert.deepEqual(t.fueraAhora(), []);
  await hastaQue(q, reloj);
  assert.equal(await q, true);
  await t.parar();
});

// Revisión final, Minor 3: el cliente solo lee los .toc al arrancar; uno reescrito (o uno que faltaba) pide reiniciar.
test('prepararAddOns: juegoDebeReiniciar es true si solo se reescribe un .toc o se escribe uno que faltaba', () => {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  writeFileSync(join(h.addons, nombreRanura(3), `${nombreRanura(3)}.toc`), '## Interface: 11500\n');
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.deepEqual(r, { ranurasCreadas: 0, timbresCreados: 0, tocsReescritos: 1, juegoDebeReiniciar: true });
  rmSync(join(h.addons, nombreRanura(4), `${nombreRanura(4)}.toc`));
  const r2 = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r2.juegoDebeReiniciar, true);
  assert.equal(r2.tocsReescritos, 0);
  assert.equal(readFileSync(join(h.addons, nombreRanura(4), `${nombreRanura(4)}.toc`), 'utf8'), tocRanura(4, '16001'));
  // un .toc que no se pudo apartar (sin cuarentena) no se toca: no hay nada nuevo que el juego tenga que leer
  const h3 = addonsDePrueba();
  prepararAddOns(h3.addons, { raizVolumen: h3.raiz });
  writeFileSync(join(h3.addons, nombreRanura(5), `${nombreRanura(5)}.toc`), '## Interface: 1\n');
  writeFileSync(join(h3.raiz, '_CUARENTENA'), 'archivo, no carpeta');
  const r3 = prepararAddOns(h3.addons, { raizVolumen: h3.raiz });
  assert.equal(r3.tocsReescritos, 0);
  assert.equal(r3.juegoDebeReiniciar, false);
});
