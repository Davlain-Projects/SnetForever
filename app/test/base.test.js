// Lector de la base de misiones de la app: intérprete de los datos Lua (solo un subconjunto) y consultas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutarDatos, elemento, entradas } from '../src/base/leer-lua.mjs';
import { cargarBase, crearBase } from '../src/base/base.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(AQUI, 'fixtures');
const REALES = join(AQUI, '..', '..', 'addons', 'SnetForever_Misiones');

// ---------------------------------------------------------------------------------------------------------------------
// ejecutarDatos
// ---------------------------------------------------------------------------------------------------------------------

test('ejecutarDatos: una tabla con escapes, anidados y claves de todas las formas', () => {
  const raiz = {};
  ejecutarDatos('SNF_MISIONES = {a=1,[2]="x\\"\\\\\\n\\000",b={1,2,{c=true}},["k k"]=-3.5,n=8589934770}', raiz, 'prueba.lua');
  assert.deepEqual(raiz.SNF_MISIONES, { a: 1, 2: 'x"\\\n\0', b: [1, 2, { c: true }], 'k k': -3.5, n: 8589934770 });
  assert.equal(raiz.SNF_MISIONES.n, 8589934770);
});

test('ejecutarDatos: comentarios, local T y T[n] = tabla', () => {
  const raiz = {};
  const texto = [
    '-- cabecera', 'SNF_MISIONES = {quest={},es={quest={}}}', '-- otra', 'local T = SNF_MISIONES.quest',
    'T[7]={name="Uno",x={}}', 'T[8]={name="Dos"} -- final', 'local T = SNF_MISIONES.es.quest', 'T[7]={name="Un"}',
  ].join('\n');
  ejecutarDatos(texto, raiz, 'p.lua');
  assert.equal(raiz.SNF_MISIONES.quest[7].name, 'Uno');
  assert.equal(raiz.SNF_MISIONES.quest[8].name, 'Dos');
  assert.equal(raiz.SNF_MISIONES.es.quest[7].name, 'Un');
  assert.equal(Array.isArray(raiz.SNF_MISIONES.quest), false, 'las tablas de la raíz admiten claves enteras sueltas');
});

test('ejecutarDatos: un array son las claves 1..n seguidas, sea cual sea la forma de escribirlas', () => {
  const raiz = {};
  ejecutarDatos('SNF_MISIONES = {a={[1]=5,[2]=6},b={[1]=5,[3]=6},c={{1,2},{3}},d={7,[2]=8}}', raiz, 'p.lua');
  assert.deepEqual(raiz.SNF_MISIONES.a, [5, 6]);
  assert.equal(Array.isArray(raiz.SNF_MISIONES.b), false);
  assert.deepEqual(raiz.SNF_MISIONES.b, { 1: 5, 3: 6 });
  assert.deepEqual(raiz.SNF_MISIONES.c, [[1, 2], [3]]);
  assert.deepEqual(raiz.SNF_MISIONES.d, [7, 8]);
});

test('ejecutarDatos: lo que no es del subconjunto da error con el archivo y la línea', () => {
  const casos = [
    ['x = os.exit()', 1, /x/],
    ['SNF_MISIONES = {}\n\nos.exit()', 3, /os/],
    ['SNF_MISIONES = {a=nil}', 1, /nil/],
    ['SNF_MISIONES = {a=1+2}', 1, /\+/],
    ['SNF_MISIONES = {\n  a=f(1)}', 2, /\(/],
    ['SNF_MISIONES = {a="sin cerrar}', 1, /cadena/],
    ['SNF_MISIONES = {a="\\q"}', 1, /escape/],
    ['SNF_MISIONES = {}\nlocal T = SNF_MISIONES.nada.mas\nT[1]={}', 2, /nada/],
    ['SNF_MISIONES = {q={}}\nlocal T = SNF_MISIONES.q\nU[1]={}', 3, /U/],
    ['SNF_MISIONES = {q={}}\nlocal T = SNF_MISIONES.q\nT[1.5]={}', 3, /entero/],
    ['SNF_MISIONES = {q={}}\nlocal T = SNF_MISIONES.q\nT[1]=3', 3, /tabla/],
    ['local T = SNF_MISIONES.q', 1, /SNF_MISIONES/],
  ];
  for (const [texto, linea, patron] of casos) {
    assert.throws(() => ejecutarDatos(texto, {}, 'malo.lua'), (e) => {
      assert.match(e.message, new RegExp(`malo\\.lua:${linea}\\b`), texto);
      assert.match(e.message, patron, texto);
      return true;
    }, texto);
  }
});

test('ejecutarDatos: T["cadena"] = tabla (las guías)', () => {
  const raiz = {};
  const texto = ['SNF_MISIONES = {guias={}}', 'local T = SNF_MISIONES.guias', 'T["a\\\\b"]={clave="a\\\\b"}'].join('\n');
  ejecutarDatos(texto, raiz, 'g.lua');
  assert.deepEqual(raiz.SNF_MISIONES.guias, { 'a\\b': { clave: 'a\\b' } });
});

test('ejecutarDatos: una clave __proto__ no toca el prototipo', () => {
  const raiz = {};
  ejecutarDatos('SNF_MISIONES = {["__proto__"]={x=1}}', raiz, 'p.lua');
  assert.equal({}.x, undefined);
  assert.equal(Object.getPrototypeOf(raiz.SNF_MISIONES), Object.prototype);
});

// ---------------------------------------------------------------------------------------------------------------------
// Base con el fixture
// ---------------------------------------------------------------------------------------------------------------------

// Carga el fixture como si fuera una carpeta de addon: la base lee el .toc y sus archivos.
const carpetaFixture = mkdtempSync(join(tmpdir(), "snf-base-"));
copyFileSync(join(FIXTURES, "misiones-app.lua"), join(carpetaFixture, "misiones-app.lua"));
writeFileSync(join(carpetaFixture, 'app.toc'), ['## Interface: 16001', '## Title: prueba', '', 'misiones-app.lua', ''].join('\n'));
const base = cargarBase(carpetaFixture);

test('cargarBase: versión y misión sin personaje', () => {
  assert.equal(base.version, '2026.11.09.1');
  assert.equal(base.mision(4641).name, 'Your Place In The World');
  assert.equal(base.mision(4641).requiredRaces, 8589934770);
  assert.equal(base.mision(99999), undefined);
});

test('nombre: es, luego en y luego #id', () => {
  assert.equal(base.nombre('quest', 4641, 'es'), 'Tu lugar en el mundo');
  assert.equal(base.nombre('quest', 4641, 'en'), 'Your Place In The World');
  assert.equal(base.nombre('quest', 790, 'es'), 'Sting of the Scorpid');
  assert.equal(base.nombre('quest', 123456, 'es'), '#123456');
  assert.equal(base.nombre('npc', 10176, 'es'), 'Gornek');
  assert.equal(base.nombre('item', 2589, 'en'), 'Linen Cloth');
  assert.equal(base.nombre('object', 1, 'en'), '#1');
});

test('porFaccion: la Alianza cambia el nivel y la Horda corrige por clase y borra campos', () => {
  assert.equal(base.mision(788, { faccion: 'Alliance' }).requiredLevel, 5);
  assert.equal(base.mision(788).requiredLevel, 1);
  assert.equal(base.mision(788, { faccion: 'Horde', clase: 'WARRIOR' }).nextQuestInChain, 900);
  assert.equal(base.mision(788, { faccion: 'Horde', clase: 'SHAMAN' }).nextQuestInChain, 901);
  // Una clase que no aparece en porClase: vale el valor base.
  assert.equal(base.mision(788, { faccion: 'Horde', clase: 'MAGE' }).nextQuestInChain, 0);
  assert.equal(base.mision(788, { faccion: 'Horde' }).nextQuestInChain, 0);
});

test('porFaccion: __borrar quita el campo en la copia y la tabla base no cambia', () => {
  const copia = base.mision(790, { faccion: 'Horde' });
  assert.equal(copia.questFlags, undefined);
  assert.equal('questFlags' in copia, false);
  assert.equal(copia.name, 'Sting of the Scorpid');
  assert.equal(base.mision(790).questFlags, 8);
  assert.equal(base.mision(790, { faccion: 'Alliance' }).questFlags, 8);
  // El resultado de la copia es de solo lectura: editarlo da error y no estropea la base.
  assert.throws(() => { copia.name = 'otro'; }, TypeError);
  assert.equal(base.mision(790).name, 'Sting of the Scorpid');
});

test('npc, objeto e item aplican la misma lógica y devuelven los datos', () => {
  assert.deepEqual(base.npc(10176, { faccion: 'Horde' }).spawns[1411], [[42.1, 68.3]]);
  assert.equal(base.npc(3).spawns[1411].length, 4);
  assert.deepEqual(base.npc(644).enMazmorra, [1581]);
  assert.equal(base.item(2589).class, 7);
  assert.equal(base.item(2589).subClass, 5);
  assert.equal(base.item(118).class, 0);
  assert.equal(base.item(118).subClass, 1);
  assert.equal(base.item(5000).startQuest, 790);
  assert.equal(base.objeto(1), undefined);
  assert.equal(base.item(424242), undefined);
});

test('buscarMisiones: nombres enteros en el texto, sin tildes, mayúsculas ni signos', () => {
  const r = base.buscarMisiones('¿Dónde ENTREGO tu lugar en el mundo?', 'es');
  assert.equal(r.length, 1);
  assert.equal(r[0].q, 4641);
  assert.equal(r[0].nombre, 'Tu lugar en el mundo');
  assert.deepEqual(base.buscarMisiones('xyz', 'es'), []);
  assert.deepEqual(base.buscarMisiones('', 'es'), []);
});

test('buscarMisiones: también por el nombre en inglés, con el nombre en el idioma pedido y sin partes de palabras', () => {
  const r = base.buscarMisiones('how do I do "your place in the world", please', 'es');
  assert.deepEqual(r.map((x) => x.q), [4641]);
  assert.equal(r[0].nombre, 'Tu lugar en el mundo');
  assert.equal(base.buscarMisiones('your place in the world', 'en')[0].nombre, 'Your Place In The World');
  // «cutting teeth» no está entero dentro de «cutting teethe».
  assert.deepEqual(base.buscarMisiones('cutting teethe', 'en'), []);
  assert.deepEqual(base.buscarMisiones('dientes afilados', 'es').map((x) => x.q), [788]);
});

// 2.ª ronda: la app lee también las guías de SnetForever_Rutas (SNF_RUTAS = {…}; local T = SNF_RUTAS.guias; T[…] = {…}).
test('ejecutarDatos: lee también SNF_RUTAS con el mismo formato', () => {
  const raiz = {};
  ejecutarDatos('SNF_RUTAS = {version="x", guias = {}, alias = {}}\n', raiz, 'nucleo.lua');
  ejecutarDatos('local T = SNF_RUTAS.guias\nT["G (H)\\\\01-06 Una"]={clave="G (H)\\\\01-06 Una",niveles={1,6}}\n', raiz, 'guias_1.lua');
  assert.deepEqual(raiz.SNF_RUTAS.guias['G (H)\\01-06 Una'].niveles, [1, 6]);
  // Revisión: las guías que no caben en un archivo siguen en el siguiente con «local T = SNF_RUTAS.guias["…"].pasos».
  ejecutarDatos('T["G (H)\\\\02 Larga"]={clave="G (H)\\\\02 Larga",pasos={}}\n'.replace(/^/, 'local T = SNF_RUTAS.guias\n'), raiz, 'guias_2.lua');
  ejecutarDatos('local T = SNF_RUTAS.guias["G (H)\\\\02 Larga"].pasos\nT[1]={id="a",n=1}\nT[2]={id="b",n=2}\n', raiz, 'guias_3.lua');
  ejecutarDatos('local T = SNF_RUTAS.guias["G (H)\\\\02 Larga"].pasos\nT[3]={id="c",n=3}\n', raiz, 'guias_4.lua');
  assert.deepEqual(Object.values(raiz.SNF_RUTAS.guias['G (H)\\02 Larga'].pasos).map((p) => p.id), ['a', 'b', 'c']);
  assert.throws(() => ejecutarDatos('local T = SNF_RUTAS.guias["no existe"].pasos\n', raiz, 'x.lua'), /no existe/);
  assert.throws(() => ejecutarDatos('OTRA = {}\n', {}, 'x.lua'), /instrucción no admitida/);
  assert.throws(() => ejecutarDatos('local T = OTRA.guias\n', {}, 'x.lua'), /solo se admite/);
});

// En el juego: «ponme una marca donde se coge la mision llave de la ciudad» no encontró «La llave de la ciudad» (le faltaba
// el artículo) y la IA sacó el sitio de internet. El nombre vale también sin su artículo del principio, si quedan dos
// palabras o más.
test('buscarMisiones: el nombre sin su artículo del principio (es y en), solo si quedan dos palabras o más', () => {
  const b = crearBase({ quest: { 1: { name: 'Key to the City' }, 2: { name: 'The Bait' } }, es: { quest: { 1: { name: 'La llave de la ciudad' }, 2: { name: 'El cebo' } } } });
  assert.deepEqual(b.buscarMisiones('donde se coge la mision llave de la ciudad', 'es'), [{ q: 1, nombre: 'La llave de la ciudad' }]);
  assert.deepEqual(b.buscarMisiones('where is key to the city', 'en'), [{ q: 1, nombre: 'Key to the City' }]);
  assert.deepEqual(b.buscarMisiones('pon el cebo aqui', 'es').map((x) => x.q), [2]);
  assert.deepEqual(b.buscarMisiones('necesito cebo', 'es'), [], '«cebo» solo no basta');
});

test("buscarMisiones: los más largos primero, sin repetir misión y con límite", () => {
  const texto = "tu lugar en el mundo, dientes afilados, Fine Ore for the Forge y Sting of the Scorpid";
  // Nombres normalizados que casan: 22, 20, 20 y 16 letras (a igual longitud, por número de misión).
  assert.deepEqual(base.buscarMisiones(texto, "es", 10).map((x) => x.q), [792, 790, 4641, 788]);
  assert.deepEqual(base.buscarMisiones(texto, "es", 2).map((x) => x.q), [792, 790]);
  assert.equal(base.buscarMisiones(texto, "es").length, 4);
});

test('buscarMisiones: nombres de menos de 4 letras no cuentan', () => {
  const corta = cargarBaseDeTexto('SNF_MISIONES = {quest={[11]={name="Pan"},[12]={name="Pan y vino"}},npc={},object={},item={},es={quest={},npc={},object={},item={}},mazmorra={}}');
  assert.deepEqual(corta.buscarMisiones('quiero pan', 'es'), []);
  assert.deepEqual(corta.buscarMisiones('quiero pan y vino', 'es').map((x) => x.q), [12]);
});

test('misionesQuePiden: las misiones cuyos objetivos piden ese objeto', () => {
  assert.deepEqual(base.misionesQuePiden(2589), [792]);
  assert.deepEqual(base.misionesQuePiden(118), []);
  assert.deepEqual(base.misionesQuePiden(99999999), []);
});

test('misionesQuePiden: también cuando los objetivos son un array (claves 1..n seguidas)', () => {
  const b = cargarBaseDeTexto('SNF_MISIONES = {quest={[5]={name="Cinco",objectives={{},{},{{777},{[1]=778,[3]=0}}}}},npc={},object={},item={},es={quest={}},mazmorra={}}');
  assert.deepEqual(b.misionesQuePiden(777), [5]);
  assert.deepEqual(b.misionesQuePiden(778), [5]);
  assert.equal(elemento([10, 20], 2), 20);
  assert.equal(elemento({ 3: 'x' }, 3), 'x');
});

test('mazmorra: la mazmorra por área', () => {
  assert.equal(base.mazmorra(1581).nombre, 'The Deadmines');
  assert.equal(base.mazmorra(1), undefined);
  assert.equal(base.mision(791).zoneOrSort, 1581);
});

// Una base a partir de un texto suelto (para casos pequeños).
function cargarBaseDeTexto(texto) {
  const raiz = {};
  ejecutarDatos(texto, raiz, "texto.lua");
  return crearBase(raiz.SNF_MISIONES);
}

// ---------------------------------------------------------------------------------------------------------------------
// Datos reales
// ---------------------------------------------------------------------------------------------------------------------

test('datos reales: cargan en menos de 15 s y con más de 5.000 misiones', { skip: !existsSync(join(REALES, 'nucleo.lua')) && 'faltan los datos reales' }, () => {
  const memAntes = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const real = cargarBase(REALES);
  const ms = performance.now() - t0;
  const heapMiB = (process.memoryUsage().heapUsed - memAntes) / (1024 * 1024);
  console.log(`# base real: ${Math.round(ms)} ms, heapUsed +${heapMiB.toFixed(0)} MiB`);
  assert.ok(ms < 15000, `tardó ${ms} ms`);
  assert.ok(Object.keys(real.datos.quest).length > 5000);
  assert.ok(real.version);
  const q = Object.keys(real.datos.quest)[0];
  assert.equal(typeof real.nombre('quest', Number(q), 'es'), 'string');
  // Una consulta de verdad: toda búsqueda de un nombre real encuentra su misión.
  const nombre = real.nombre('quest', Number(q), 'en');
  assert.ok(real.buscarMisiones(nombre, 'en', 100).some((x) => x.q === Number(q)) || nombre.replace(/[^\p{L}]/gu, '').length < 4);
});

// ---------------------------------------------------------------------------------------------------------------------
// Mejoras de la revisión de la tarea 12
// ---------------------------------------------------------------------------------------------------------------------

test('entradas: claves de Lua tanto si la tabla es array como objeto', () => {
  const raiz = {};
  ejecutarDatos('SNF_MISIONES = {a={10,20},b={[5]=7,[9]=8},c={x=1}}', raiz, 'p.lua');
  const { a, b, c } = raiz.SNF_MISIONES;
  assert.ok(Array.isArray(a));
  assert.deepEqual(entradas(a), [[1, 10], [2, 20]]);
  assert.deepEqual(entradas(b), [[5, 7], [9, 8]]);
  assert.deepEqual(entradas(c), [['x', 1]]);
  assert.deepEqual(entradas(undefined), []);
  assert.deepEqual(entradas(null), []);
  assert.deepEqual(entradas('texto'), []);
});

test('base: un id que es una propiedad del prototipo no existe', () => {
  for (const id of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.equal(base.mision(id), undefined);
    assert.equal(base.npc(id), undefined);
    assert.equal(base.objeto(id), undefined);
    assert.equal(base.item(id), undefined);
    assert.equal(base.nombre('quest', id, 'es'), `#${id}`);
  }
  assert.equal(base.mision(4641).name, 'Your Place In The World');
});

test('base: lo que devuelve es de solo lectura (congelado de forma superficial)', () => {
  const original = base.mision(4641);
  assert.ok(Object.isFrozen(original));
  assert.throws(() => { original.name = 'otro'; }, TypeError);
  const corregida = base.mision(788, { faccion: 'Horde', clase: 'WARRIOR' });
  assert.ok(Object.isFrozen(corregida));
  assert.equal(base.mision(788).nextQuestInChain, 0);
});

test('zona(uiMap, idioma): es, luego en, y si no null', () => {
  assert.equal(base.zona(1411, 'es'), 'Durotar');
  assert.equal(base.zona(1411, 'en'), 'Durotar');
  assert.equal(base.zona(1413, 'es'), 'Los Baldíos');
  assert.equal(base.zona(1413, 'en'), 'The Barrens');
  assert.equal(base.zona(1412, 'es'), 'Mulgore'); // sin traducción: el inglés
  assert.equal(base.zona(9999, 'es'), null);
  assert.equal(base.zona('toString', 'es'), null);
  assert.equal(base.zona(undefined, 'es'), null);
});

test('uiDeArea(areaId): el uiMap o null', () => {
  assert.equal(base.uiDeArea(14), 1411);
  assert.equal(base.uiDeArea(17), 1413);
  assert.equal(base.uiDeArea(999999), null);
  assert.equal(base.uiDeArea('toString'), null);
  assert.equal(base.uiDeArea(undefined), null);
});

test('zona y uiDeArea sin tabla de zonas en la base: null', () => {
  const vacia = cargarBaseDeTexto('SNF_MISIONES = {version="t",quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}},porFaccion={}}');
  assert.equal(vacia.zona(1411, 'es'), null);
  assert.equal(vacia.uiDeArea(14), null);
});

test('datos reales: el uiMap 1413 es «The Barrens» / «Los Baldíos» (Classic, sin correcciones de Cataclysm)', { skip: !existsSync(join(REALES, 'nucleo.lua')) && 'faltan los datos reales' }, () => {
  const real = cargarBase(REALES);
  assert.equal(real.zona(1413, 'en'), 'The Barrens');
  assert.equal(real.zona(1413, 'es'), 'Los Baldíos');
  assert.equal(real.uiDeArea(17), 1413);
});

// ---------------------------------------------------------------------------------------------------------------------
// Lote B (B1): archivos que solo lee la app (línea «## X-SNF-App» del .toc)
// ---------------------------------------------------------------------------------------------------------------------

test('cargarBase: lee también los archivos de X-SNF-App, después de los del .toc (pisan a la tabla pequeña)', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-base-app-'));
  writeFileSync(join(carpeta, 'nucleo.lua'), 'SNF_MISIONES = {version="t",quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}}}\n');
  writeFileSync(join(carpeta, 'juego_item_1.lua'), 'local T = SNF_MISIONES.item\nT[25]={name="Worn Shortsword"}\n');
  writeFileSync(join(carpeta, 'item_1.lua'), 'local T = SNF_MISIONES.item\nT[25]={name="Worn Shortsword",class=2,subClass=7}\nT[35]={name="Bent Staff",class=2,subClass=10}\n');
  writeFileSync(join(carpeta, 'es_item_1.lua'), 'local T = SNF_MISIONES.es.item\nT[35]={name="Bastón doblado"}\n');
  writeFileSync(join(carpeta, 'Prueba.toc'), [
    '## Interface: 16001', '## X-SNF-App: item_1.lua, es_item_1.lua', '', 'nucleo.lua', 'juego_item_1.lua', '',
  ].join('\n'));
  const b = cargarBase(carpeta);
  assert.equal(b.item(25).class, 2);
  assert.equal(b.item(25).subClass, 7);
  assert.equal(b.item(35).subClass, 10);
  assert.equal(b.nombre('item', 35, 'es'), 'Bastón doblado');
});

// Ronda 1 (Minor 2): con archivos de la app que faltan, la base se carga con lo que hay y lo dice en `avisos` (la app lo
// apunta en el registro y lo enseña en la bandeja), en vez de no cargar nada.
const NUCLEO = (version) => `SNF_MISIONES = {version="${version}",quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}}}\n`;

test('cargarBase: un archivo de X-SNF-App que falta no tumba la base; lo nombra en avisos y carga los demás', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-base-app-'));
  writeFileSync(join(carpeta, 'nucleo.lua'), NUCLEO('2026.11.10.7'));
  writeFileSync(join(carpeta, 'es_item_1.lua'), 'local T = SNF_MISIONES.es.item\nT[35]={name="Bastón doblado"}\n');
  writeFileSync(join(carpeta, 'Prueba.toc'), ['## X-SNF-App: item_1.lua, es_item_1.lua, object_1.lua', '', 'nucleo.lua', ''].join('\n'));
  const b = cargarBase(carpeta);
  assert.deepEqual(b.avisos, [{ codigo: 'FALTAN_ARCHIVOS_APP', archivos: ['item_1.lua', 'object_1.lua'] }]);
  assert.equal(b.nombre('item', 35, 'es'), 'Bastón doblado');
});

test('cargarBase: datos del lote B o más nuevos sin la línea X-SNF-App avisan; los de antes, no', () => {
  for (const [version, avisos] of [
    ['2026.11.10.7', [{ codigo: 'SIN_ARCHIVOS_APP', version: '2026.11.10.7' }]],
    ['2026.12.01.1', [{ codigo: 'SIN_ARCHIVOS_APP', version: '2026.12.01.1' }]],
    ['2026.11.10.6', []],
    ['t', []],
  ]) {
    const carpeta = mkdtempSync(join(tmpdir(), 'snf-base-app-'));
    writeFileSync(join(carpeta, 'nucleo.lua'), NUCLEO(version));
    writeFileSync(join(carpeta, 'Prueba.toc'), ['## Interface: 16001', '', 'nucleo.lua', ''].join('\n'));
    assert.deepEqual(cargarBase(carpeta).avisos, avisos, version);
  }
});

// Lote C (lote-b-rereview, Minor 3): una línea «## X-SNF-App:» vacía (o solo con comas) cuenta como si no estuviera.
test('cargarBase: una línea X-SNF-App vacía en datos del lote B o más nuevos da SIN_ARCHIVOS_APP', () => {
  for (const [linea, version, avisos] of [
    ['## X-SNF-App:', '2026.11.10.9', [{ codigo: 'SIN_ARCHIVOS_APP', version: '2026.11.10.9' }]],
    ['## X-SNF-App:  , ,', '2026.11.10.7', [{ codigo: 'SIN_ARCHIVOS_APP', version: '2026.11.10.7' }]],
    ['## X-SNF-App:', '2026.11.10.6', []],
  ]) {
    const carpeta = mkdtempSync(join(tmpdir(), 'snf-base-app-'));
    writeFileSync(join(carpeta, 'nucleo.lua'), NUCLEO(version));
    writeFileSync(join(carpeta, 'Prueba.toc'), ['## Interface: 16001', linea, '', 'nucleo.lua', ''].join('\n'));
    assert.deepEqual(cargarBase(carpeta).avisos, avisos, `${linea} ${version}`);
  }
});

test('cargarBase: sin línea X-SNF-App (datos de antes del lote B) carga solo el .toc, como hasta ahora', () => {
  assert.equal(base.mision(4641).name, 'Your Place In The World');
  assert.deepEqual(base.avisos, []);
});
