// Tarea 7 del comercio: ranuras de precios SnetForever_P01…P08 (precios-lua.mjs) y su creación en prepararAddOns.
// Lo generado se carga en la máquina del banco (fengari), como hace buzon-timbres.test.js con el buzón.
import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import {
  RANURAS_PRECIOS, ARCHIVOS_POR_RANURA, nombreRanuraPrecios, tocPrecios, textosPrecios, escribirPrecios, ranuraDeHora,
} from '../src/comercio/precios-lua.mjs';
import { prepararAddOns } from '../src/instalacion.mjs';

const carpetas = [];
const maquinas = [];
// Las máquinas de cada prueba se cierran al acabarla: guardarlas hasta el final del archivo agotaba el montón de Node.
afterEach(() => {
  maquinas.splice(0).forEach((m) => m.cerrar());
});
after(() => {
  carpetas.forEach((c) => rmSync(c, { recursive: true, force: true }));
});

function addonsDePrueba() {
  const base = mkdtempSync(join(tmpdir(), 'snf-precios-'));
  carpetas.push(base);
  const addons = join(base, 'AddOns');
  mkdirSync(join(addons, 'SnetForever'), { recursive: true });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Interface: 16001\n## Title: SnetForever\n\nnucleo.lua\n');
  const raiz = join(base, 'volumen');
  mkdirSync(raiz);
  return { base, addons, raiz };
}

const maquina = () => {
  const m = crearMaquina({ arrancar: false });
  maquinas.push(m);
  m._banco('permitirNil', 'SNF_PRECIOS'); // el banco no deja leer un global sin definir
  return m;
};

// Datos de prueba: `n` objetos por casa (ids 2001…).
function datos(n, casasIds = [110, 114, 116]) {
  const casas = {};
  for (const c of casasIds) {
    casas[c] = {};
    for (let i = 1; i <= n; i++) {
      casas[c][2000 + i] = [c * 1000 + i, i % 50, c * 900 + i, i % 7 === 0 ? null : (i % 5) - 2, i % 3 === 0 ? -1 : i, i % 4 === 0 ? -1 : i * 2, i % 11 === 0 ? 1 : 0];
    }
  }
  return casas;
}
const base = (extra = {}) => ({
  seq: 5, generado: 1700000000, region: 'eu', conocidas: { 'Normal|Horde': 114, 'Normal|Alliance': 110 }, grupos: [{ clave: 'auto:Paño', nombre: { es: 'Paño', en: 'Cloth' }, tipo: 'auto', objetos: [2001, 2002] }], nombres: { 2001: 'Hierro "puro"' }, ...extra,
});

test('price slots preserve each included auction house snapshot time', () => {
  const m = maquina();
  const casas = datos(1, [110, 114]);
  const info = {
    110: { hora: 1699990000, desde: 1699980000, pares: 12 },
    114: { hora: 1700000000, desde: 1699990000, pares: 24 },
    116: { hora: 1700000000, desde: 1699990000, pares: 24 },
  };
  for (const source of textosPrecios(base({ casas, info }))) m.lua(source);
  assert.deepEqual(m.lua('SNF_PRECIOS.info[110]'), info[110]);
  assert.deepEqual(m.lua('SNF_PRECIOS.info[114]'), info[114]);
  assert.equal(m.lua('SNF_PRECIOS.info[116]'), undefined);
});

test('textosPrecios: 30 000 objetos en 3 casas cargan sin errores y el precio está donde toca', () => {
  const casas = { 110: {}, 114: {}, 116: {} };
  for (const c of Object.keys(casas)) {
    for (let i = 1; i <= 10000; i++) casas[c][1000 + i] = [Number(c) * 100000 + i * 7, i, i * 3, i % 9, i % 2 ? i : -1, i % 3 ? i : -1, i % 5 ? 0 : 1];
  }
  casas[114][2589] = [123456, 7, 120000, null, -1, -1, 1];
  const textos = textosPrecios(base({ casas }));
  assert.equal(textos.length, ARCHIVOS_POR_RANURA);
  for (const t of textos) assert.ok(Buffer.byteLength(t) <= 500000, 'un archivo pasa de 500 000 bytes');
  const m = maquina();
  for (const t of textos) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.casas[114][2589][1]'), 123456);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[114][2589]'), [123456, 7, 120000, 0, -1, -1, 1]);
  assert.equal(m.lua('return SNF_PRECIOS.casas[116][11000][1]'), 116 * 100000 + 70000);
  assert.equal(m.lua('local n=0 for _,c in pairs(SNF_PRECIOS.casas) do for _ in pairs(c) do n=n+1 end end return n'), 30000);
});

test('textosPrecios: cabecera, conocidas, grupos, nombres y filas de 7 con tendencia null a 0', () => {
  const textos = textosPrecios(base({ casas: datos(20) }));
  const m = maquina();
  for (const t of textos) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.v'), 1);
  assert.equal(m.lua('return SNF_PRECIOS.seq'), 5);
  assert.equal(m.lua('return SNF_PRECIOS.generado'), 1700000000);
  assert.equal(m.lua('return SNF_PRECIOS.region'), 'eu');
  assert.equal(m.lua('return SNF_PRECIOS.conocidas["Normal|Horde"]'), 114);
  assert.deepEqual(m.lua('return SNF_PRECIOS.grupos[1].objetos'), [2001, 2002]);
  assert.equal(m.lua('return SNF_PRECIOS.grupos[1].nombre.en'), 'Cloth');
  assert.equal(m.lua('return SNF_PRECIOS.grupos[1].tipo'), 'auto');
  assert.equal(m.lua('return SNF_PRECIOS.nombres[2001]'), 'Hierro "puro"');
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[110][2007]'), [110007, 7, 99007, 0, 7, 14, 0]);
  assert.equal(m.lua('return #SNF_PRECIOS.casas[110][2003]'), 7);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[110][2003]'), [110003, 3, 99003, 1, -1, 6, 0]);
});

test('textosPrecios (T1b): una fila puede traer además las subastas y si se sabe la tendencia; sin ellas siguen siendo 7', () => {
  const casas = { 114: { 2001: [6589, 35, 6692, 1.2, 0.46, 12.5, 0, 35, 1], 2002: [100, 4, 120, null, null, null, 1, 4, 0], 2003: [5, 1, 5, 0, -1, -1, 1] } };
  const textos = textosPrecios(base({ casas, nombres: {} }));
  const m = maquina();
  for (const t of textos) m.lua(t);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[114][2001]'), [6589, 35, 6692, 1.2, 0.46, 12.5, 0, 35, 1]);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[114][2002]'), [100, 4, 120, 0, -1, -1, 1, 4, 0]);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[114][2003]'), [5, 1, 5, 0, -1, -1, 1]);
  assert.throws(() => textosPrecios(base({ casas: { 114: { 2001: [1, 1, 1, 0, 0, 0, 0, 'x', 1] } } })), { code: 'LUA_TIPO' });
});

test('textosPrecios (F5): una mercancía lleva un 1 detrás (el 10.º); un objeto suelto se queda en 9', () => {
  const casas = { 114: { 2001: [6589, 35, 6692, 1.2, 0.46, 12.5, 0, 35, 1, 1], 2002: [100, 4, 120, 0, 0.5, 2, 0, 4, 1, 0], 2003: [5, 1, 5, 0, -1, -1, 1] } };
  const textos = textosPrecios(base({ casas, nombres: {} }));
  const m = maquina();
  for (const t of textos) m.lua(t);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[114][2001]'), [6589, 35, 6692, 1.2, 0.46, 12.5, 0, 35, 1, 1]);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[114][2002]'), [100, 4, 120, 0, 0.5, 2, 0, 4, 1]);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[114][2003]'), [5, 1, 5, 0, -1, -1, 1]);
});

test('textosPrecios: los archivos sin datos son «-- vacío»', () => {
  const textos = textosPrecios(base({ casas: datos(3, [110]) }));
  assert.ok(textos[5].endsWith('SNF_PRECIOS.completo = true end\n'), 'p6 sin datos solo lleva la guarda y completo');
  assert.equal(textos[4], '-- vacío\n');
  assert.ok(textos[1].includes('SNF_PRECIOS'));
});

test('textosPrecios: una ranura con seq menor no pisa una mayor ya cargada', () => {
  const nueva = textosPrecios(base({ seq: 9, casas: datos(5, [110]) }));
  const vieja = textosPrecios(base({ seq: 4, casas: datos(5, [114]) }));
  const m = maquina();
  for (const t of nueva) m.lua(t);
  for (const t of vieja) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.seq'), 9);
  assert.equal(m.lua('return SNF_PRECIOS.casas[114] == nil'), true);
  assert.equal(m.lua('return SNF_PRECIOS.casas[110][2001][1]'), 110001);
  // una mayor sí sustituye a la menor
  const mas = textosPrecios(base({ seq: 12, casas: datos(5, [114]) }));
  for (const t of mas) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.seq'), 12);
  assert.equal(m.lua('return SNF_PRECIOS.casas[110] == nil'), true);
  assert.equal(m.lua('return SNF_PRECIOS.casas[114][2001][1]'), 114001);
});

test('textosPrecios: datos que no caben dan PRECIOS_GRANDES; valores raros dan error', () => {
  const filas = {};
  for (let i = 1; i <= 150000; i++) filas[i] = [i * 13, i, i * 7, 0, -1, -1, 0];
  assert.throws(() => textosPrecios(base({ casas: { 110: filas } })), { code: 'PRECIOS_GRANDES' });
  assert.throws(() => textosPrecios(base({ casas: { 110: { 1: [Infinity, 1, 1, 0, -1, -1, 0] } } })), { code: 'LUA_TIPO' });
  assert.throws(() => textosPrecios(base({ casas: { 110: { 'x y': [1, 1, 1, 0, -1, -1, 0] } } })), { code: 'LUA_CLAVE' });
});

test('tocPrecios: LoadOnDemand, depende de SnetForever y lista p1…p6', () => {
  const toc = tocPrecios(3);
  assert.match(toc, /^## Interface: 16001$/m);
  assert.match(toc, /^## LoadOnDemand: 1$/m);
  assert.match(toc, /^## Dependencies: SnetForever$/m);
  assert.match(toc, /Precios 03/);
  assert.deepEqual(toc.split('\n').filter((l) => /\.lua$/.test(l)), ['p1.lua', 'p2.lua', 'p3.lua', 'p4.lua', 'p5.lua', 'p6.lua']);
  assert.match(tocPrecios(1, '20505'), /^## Interface: 20505$/m);
  assert.equal(nombreRanuraPrecios(7), 'SnetForever_P07');
});

test('prepararAddOns crea P01…P08 con su .toc y p1…p6 vacíos, y no repite', () => {
  const h = addonsDePrueba();
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r.ranurasPreciosCreadas, RANURAS_PRECIOS);
  assert.equal(r.juegoDebeReiniciar, true);
  for (let i = 1; i <= RANURAS_PRECIOS; i++) {
    const dir = join(h.addons, nombreRanuraPrecios(i));
    assert.equal(readFileSync(join(dir, `${nombreRanuraPrecios(i)}.toc`), 'utf8'), tocPrecios(i));
    for (let k = 1; k <= 6; k++) assert.equal(readFileSync(join(dir, `p${k}.lua`), 'utf8'), '-- vacío\n');
  }
  const otra = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(otra.ranurasPreciosCreadas, undefined);
  assert.equal(otra.juegoDebeReiniciar, false);
});

test('prepararAddOns con el juego abierto no crea las ranuras de precios y lo aplaza', () => {
  const h = addonsDePrueba();
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz, juegoAbierto: true });
  assert.equal(r.aplazado, true);
  for (let i = 1; i <= RANURAS_PRECIOS; i++) assert.equal(existsSync(join(h.addons, nombreRanuraPrecios(i))), false);
});

test('prepararAddOns: un .toc de precios distinto va a la cuarentena y se reescribe', () => {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  const toc = join(h.addons, nombreRanuraPrecios(2), `${nombreRanuraPrecios(2)}.toc`);
  writeFileSync(toc, 'otro\n');
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r.tocsReescritos, 1);
  assert.equal(readFileSync(toc, 'utf8'), tocPrecios(2));
  assert.ok(existsSync(join(h.raiz, '_CUARENTENA')));
});

test('escribirPrecios: la ranura es la de la hora de la foto, (hora UTC absoluta % 8) + 1', async () => {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  const estado = {};
  const inicio = 1700000000 - (1700000000 % 3600); // una hora en punto
  const esperada = (g) => (Math.floor(g / 3600) % 8) + 1;
  const vistas = [];
  // 10 horas seguidas (las fotos salen a hh:22): la ranura da la vuelta tras la 8
  for (let n = 0; n < 10; n++) {
    const generado = inicio + n * 3600 + 22 * 60;
    const textos = textosPrecios(base({ seq: n + 1, generado, casas: datos(2, [110]) }));
    const { ranura } = await escribirPrecios(h.addons, textos, { estado, raizVolumen: h.raiz });
    assert.equal(ranura, esperada(generado));
    assert.equal(estado.ultimaRanuraPrecios, ranura);
    vistas.push(ranura);
  }
  for (let n = 1; n < 10; n++) assert.equal(vistas[n], (vistas[n - 1] % 8) + 1, 'la hora siguiente va a la ranura siguiente');
  assert.equal(vistas[8], vistas[0]);
  // dos escrituras de la misma hora van a la misma ranura, aunque estado diga otra
  const g = inicio + 22 * 60;
  const t1 = textosPrecios(base({ seq: 50, generado: g, casas: datos(2, [110]) }));
  const t2 = textosPrecios(base({ seq: 51, generado: g + 600, casas: datos(2, [114]) }));
  const r1 = await escribirPrecios(h.addons, t1, { estado, raizVolumen: h.raiz });
  estado.ultimaRanuraPrecios = 3;
  const r2 = await escribirPrecios(h.addons, t2, { estado, raizVolumen: h.raiz });
  assert.equal(r1.ranura, r2.ranura);
  const dir = join(h.addons, nombreRanuraPrecios(r2.ranura));
  assert.match(readFileSync(join(dir, 'p1.lua'), 'utf8'), /seq = 51,/);
  const m = maquina();
  for (let k = 1; k <= 6; k++) m.lua(readFileSync(join(dir, `p${k}.lua`), 'utf8'));
  assert.equal(m.lua('return SNF_PRECIOS.casas[114][2001][1]'), 114001);
  // la hora puede venir de las opciones
  const r3 = await escribirPrecios(h.addons, t1, { estado, raizVolumen: h.raiz, generado: g + 3600 });
  assert.equal(r3.ranura, esperada(g + 3600));
});

test('textosPrecios: los grupos del catálogo (clave con espacio, ›, comilla y salto) cargan y la clave vuelve igual', () => {
  const clave = 'auto:Objetos comerciables › Tela "fina"\nsegunda línea';
  const grupos = [
    { clave, nombre: { es: 'Tela «fina»', en: 'Fine "cloth"' }, tipo: 'auto', objetos: [2589, 4306] },
    { clave: 'calculado:Té', nombre: { es: 'Té', en: 'Tea' }, tipo: 'calculado', objetos: [] },
  ];
  const textos = textosPrecios(base({ grupos, casas: datos(2, [110]) }));
  const m = maquina();
  for (const t of textos) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.grupos[1].clave'), clave);
  assert.equal(m.lua('return SNF_PRECIOS.grupos[1].nombre.es'), 'Tela «fina»');
  assert.equal(m.lua('return SNF_PRECIOS.grupos[1].nombre.en'), 'Fine "cloth"');
  assert.deepEqual(m.lua('return SNF_PRECIOS.grupos[1].objetos'), [2589, 4306]);
  assert.equal(m.lua('return SNF_PRECIOS.grupos[2].tipo'), 'calculado');
  assert.equal(m.lua('return #SNF_PRECIOS.grupos[2].objetos'), 0);
  assert.throws(() => textosPrecios(base({ grupos: [{ clave: 'x', nombre: {}, tipo: 'auto', objetos: [1.5] }] })), { code: 'LUA_TIPO' });
  assert.throws(() => textosPrecios(base({ grupos: { 1: [1] } })), { code: 'LUA_TIPO' });
});

test('textosPrecios: si los nombres no caben se reintenta sin ellos; una cabecera enorme da PRECIOS_GRANDES', () => {
  const nombres = {};
  for (let i = 1; i <= 120000; i++) nombres[i] = `Nombre largo del objeto número ${i} con texto de relleno`;
  const textos = textosPrecios(base({ casas: datos(3, [110]), nombres }));
  const m = maquina();
  for (const t of textos) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.casas[110][2001][1]'), 110001);
  assert.equal(m.lua('local n=0 for _ in pairs(SNF_PRECIOS.nombres) do n=n+1 end return n'), 0);
  const objetos = Array.from({ length: 60000 }, (_, i) => 100000 + i);
  assert.throws(() => textosPrecios(base({ casas: {}, grupos: [{ clave: 'g', nombre: { es: 'a', en: 'b' }, tipo: 'auto', objetos }] })), { code: 'PRECIOS_GRANDES' });
});

test('escribirPrecios: una carpeta de ranura que es un enlace da ENLACE y no escribe', async () => {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  const fuera = join(h.base, 'fuera');
  mkdirSync(fuera);
  const dir = join(h.addons, nombreRanuraPrecios(1));
  rmSync(dir, { recursive: true, force: true });
  symlinkSync(fuera, dir, 'junction');
  const estado = {};
  const generado = 8 * 3600 * 1000; // la ranura 1 (hora absoluta múltiplo de 8)
  assert.equal(ranuraDeHora(generado), 1);
  await assert.rejects(escribirPrecios(h.addons, textosPrecios(base({ generado, casas: datos(2) })), { estado, raizVolumen: h.raiz }), { code: 'ENLACE' });
  assert.equal(existsSync(join(fuera, 'p1.lua')), false);
  assert.equal(estado.ultimaRanuraPrecios, undefined);
});

test('escribirPrecios: pide 6 textos y la carpeta tiene que existir (FALTA)', async () => {
  const h = addonsDePrueba();
  await assert.rejects(escribirPrecios(h.addons, ['x'], { raizVolumen: h.raiz }), { code: 'PRECIOS_TEXTOS' });
  await assert.rejects(escribirPrecios(h.addons, textosPrecios(base({ casas: datos(1) })), { raizVolumen: h.raiz }), { code: 'FALTA' });
});

test('prepararAddOns con el juego abierto: un .toc de precios distinto también aplaza (y no se toca)', () => {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(prepararAddOns(h.addons, { raizVolumen: h.raiz, juegoAbierto: true }).aplazado, undefined);
  const toc = join(h.addons, nombreRanuraPrecios(4), `${nombreRanuraPrecios(4)}.toc`);
  writeFileSync(toc, 'otro\n');
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz, juegoAbierto: true });
  assert.equal(r.aplazado, true);
  assert.equal(readFileSync(toc, 'utf8'), 'otro\n');
});

test('prepararAddOns: un .toc de precios que faltaba se crea y pide reiniciar', () => {
  const h = addonsDePrueba();
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  rmSync(join(h.addons, nombreRanuraPrecios(5), `${nombreRanuraPrecios(5)}.toc`));
  const r = prepararAddOns(h.addons, { raizVolumen: h.raiz });
  assert.equal(r.juegoDebeReiniciar, true);
  assert.equal(readFileSync(join(h.addons, nombreRanuraPrecios(5), `${nombreRanuraPrecios(5)}.toc`), 'utf8'), tocPrecios(5));
});

test('textosPrecios: completo == true solo si p6 se ejecutó con el seq que toca (aunque falte o falle p3)', () => {
  const casas = {};
  casas[110] = {};
  for (let i = 1; i <= 30000; i++) casas[110][1000 + i] = [i * 13, i, i * 7, 0, -1, -1, 0];
  const textos = textosPrecios(base({ seq: 7, casas }));
  assert.ok(textos[5].endsWith('if SNF_PRECIOS and SNF_PRECIOS.seq == 7 then SNF_PRECIOS.completo = true end\n'));
  // todos: completo
  let m = maquina();
  for (const t of textos) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.completo'), true);
  // sin p6: no hay completo
  m = maquina();
  for (const t of textos.slice(0, 5)) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.completo == nil'), true);
  // p3 vacío (o roto) y p6 sí corre: completo, porque significa «p6 se ejecutó con el seq que toca», no «hay todos los datos»
  m = maquina();
  for (const [k, t] of textos.entries()) {
    if (k === 2) continue;
    m.lua(t);
  }
  assert.equal(m.lua('return SNF_PRECIOS.completo'), true);
  m = maquina();
  m.lua(textos[0]);
  assert.throws(() => m.lua('esto no es lua !!'));
  for (const t of textos.slice(3)) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.completo'), true);
  // p6 de otro seq (una ranura vieja) no marca la tabla cargada con un seq mayor
  m = maquina();
  for (const t of textosPrecios(base({ seq: 9, casas: datos(2, [110]) }))) m.lua(t);
  for (const t of textosPrecios(base({ seq: 3, casas: datos(2, [114]) }))) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.seq'), 9);
  assert.equal(m.lua('return SNF_PRECIOS.casas[114] == nil'), true);
});
