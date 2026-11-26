// Comercio, tarea 15: la IA ve los datos de comercio (datos.comercio) y propone grupos y reglas que el jugador aplica.
// La propuesta llega en el bloque ```snet``` como `comercio`; la app la valida (nombre, ids del catálogo, rangos de las
// reglas) y la pasa al registro del buzón. Nada cambia en el juego hasta que el jugador pulsa Aplicar.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase } from '../src/base/base.mjs';
import { prepararTurno, MAX_DATOS } from '../src/contexto.mjs';
import { procesarRespuesta } from '../src/respuesta.mjs';
import { SISTEMA } from '../src/prompt.mjs';
import { construirComercio, enVivoDe, MAX_OBJETOS_COMERCIO, fuenteDeComercio, RITMO_BARATOS } from '../src/comercio/ia.mjs';
import { crearNucleo } from '../src/nucleo.mjs';
import { prepararAddOns } from '../src/instalacion.mjs';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const RAIZ = mkdtempSync(join(tmpdir(), 'snf-comercio-ia-'));
after(() => rmSync(RAIZ, { recursive: true, force: true }));
const carpetaBase = join(RAIZ, 'base');
mkdirSync(carpetaBase);
copyFileSync(join(FIXTURES, 'misiones-app.lua'), join(carpetaBase, 'misiones-app.lua'));
// 14-nov: dos hierbas de la base (class 7, subClass 9): ids reales sin precios de subasta.
writeFileSync(join(carpetaBase, 'hierbas.lua'), 'local I = SNF_MISIONES.item\nI[2447]={name="Peacebloom",class=7,subClass=9}\nI[765]={name="Silverleaf",class=7,subClass=9}\n');
writeFileSync(join(carpetaBase, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', 'hierbas.lua', ''].join('\n'));
const base = cargarBase(carpetaBase);

const PJ = 'Tal Cual-Reino Prueba';

// Un resumen como los de historial.todos(casa) (precios en cobre; hora en segundos).
const fila = (precio, normal, ritmo, extra = {}) => ({
  precio, cantidad: 40, subastas: 6, normal, poco: false, tendencia: -4.26, ritmo, vendidosDia: 12.345, hora: 1790000000, ...extra,
});

// Historial falso: {casa: {item: resumen}}.
function historialFalso(casas) {
  return {
    todos(casa) {
      const m = new Map();
      for (const [item, r] of Object.entries(casas[casa] ?? {})) m.set(Number(item), r);
      return m;
    },
  };
}

// Catálogo falso: los nombres que se le den (el resto, sin ficha).
const catalogoFalso = (nombres) => ({ ficha: (id) => (nombres[id] ? { id, nombre: nombres[id] } : null) });

const NOMBRES = { 2589: 'Paño de lino', 2447: 'Hojaplata', 765: 'Flor de paz', 2592: 'Paño de lana', 118: 'Poción de sanación menor' };
const CASAS = {
  114: {
    2589: fila(120, 150, 0.42),
    2447: fila(60, 100, 0.8),
    765: fila(30, 100, 0.2), // muy barato pero se vende poco: no entra en los baratos
    2592: fila(500, 400, 0.9), // caro
  },
  110: { 2589: fila(90, 95, 0.5) },
};
const fuente = (extra = {}) => ({ historial: historialFalso(CASAS), catalogo: catalogoFalso(NOMBRES), casa: 114, otrasCasas: [110], ...extra });

function mensaje({ texto = 'hola', ctx = {}, refs } = {}) {
  const m = {
    v: 1, id: 'c0-1', pj: PJ, idioma: 'es', modelo: 'haiku', texto,
    ctx: {
      pj: { nivel: 20, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2 },
      lugar: { mapa: 1411, zona: 'Durotar', instancia: false },
      registro: [],
      inv: { libres: 4, huecos: 16, bolsas: [{ id: 2589, n: 15, b: [[0, 1]] }] },
      ...ctx,
    },
  };
  if (refs) m.refs = refs;
  return m;
}

// ---------------------------------------------------------------------------------------------------
// datos.comercio
// ---------------------------------------------------------------------------------------------------

test('construirComercio: el objeto del inventario con su ritmo, lo normal, la tendencia y el precio en las otras casas', () => {
  const c = construirComercio({ ...fuente(), inventarioIds: [2589], mencionadas: [], enVivo: null });
  assert.equal(c.casa, 114);
  assert.equal(c.generado, 1790000000);
  const lino = c.objetos.find((o) => o.id === 2589);
  assert.deepEqual(lino, {
    id: 2589, nombre: 'Paño de lino', precio: 120, normal: 150, tendencia: -4.3, ritmo: 0.42, vendidosDia: 12.3, otrasCasas: { 110: 90 },
  });
  // Los baratos respecto a lo normal con ritmo >= 0,25 entran; el que sale poco sin caducar (0,2) y el caro, no.
  assert.ok(c.objetos.some((o) => o.id === 2447));
  assert.ok(!c.objetos.some((o) => o.id === 765));
  assert.ok(!c.objetos.some((o) => o.id === 2592));
  assert.equal(c.enVivo, undefined);
});

test('construirComercio (F5): una mercancía lleva mercancia: true (sus salidas ya no cuentan las cancelaciones de encima); un objeto suelto no lo lleva', () => {
  const casas = { 114: { 2589: fila(120, 150, 0.42, { mercancia: true }), 2447: fila(60, 100, 0.8, { mercancia: false }) } };
  const c = construirComercio({ ...fuente({ historial: historialFalso(casas) }), inventarioIds: [2589, 2447], mencionadas: [], enVivo: null });
  const lino = c.objetos.find((o) => o.id === 2589);
  assert.equal(lino.mercancia, true);
  assert.equal(lino.vendidosDia, 12.3); // el número del historial, tal cual (el mismo que el tooltip)
  assert.equal('mercancia' in c.objetos.find((o) => o.id === 2447), false);
});

test('construirComercio (T1b): los baratos piden salir sin caducar al menos 0,25; lo que no está a la venta no entra ni lleva precio', () => {
  assert.equal(RITMO_BARATOS, 0.25);
  const casas = {
    114: {
      1: fila(60, 100, 0.25), // justo en el umbral: entra
      2: fila(60, 100, 0.24), // por debajo: no
      3: fila(10, 100, 0.9, { enVenta: false, cantidad: 0, subastas: 0 }), // baratísimo, pero ya no hay ninguno a la venta
      2589: fila(120, 150, 0.1, { enVenta: false, cantidad: 0, subastas: 0 }),
    },
    110: { 2589: fila(90, 95, 0.5, { enVenta: false }) },
  };
  const c = construirComercio({ ...fuente({ historial: historialFalso(casas) }), inventarioIds: [2589], mencionadas: [], enVivo: null });
  assert.deepEqual(c.objetos.map((o) => o.id).sort((x, y) => x - y), [1, 2589]);
  const lino = c.objetos.find((o) => o.id === 2589);
  assert.equal(lino.precio, null, 'sin ninguno a la venta no hay precio de ahora');
  assert.equal(lino.aLaVenta, false);
  assert.equal(lino.normal, 150, 'el valor de mercado sí se sabe');
  assert.deepEqual(lino.otrasCasas, {}, 'ni el precio de una casa donde tampoco hay');
  assert.equal(c.objetos.find((o) => o.id === 1).aLaVenta, undefined, 'lo normal no lleva la marca');
});

// F9p: en una mercancía el ritmo alto no prueba que se venda: se elige por precio y el ritmo solo descarta lo claramente lento.
const idsDe = (historial) => construirComercio({ historial: historialFalso(historial), catalogo: catalogoFalso({}), casa: 114 }).objetos.map((o) => o.id);

test('la IA elige los baratos de mercancías por precio, aunque otra tenga más ritmo', () => {
  const objetos = {};
  // 25 mercancías con mucho ritmo, menos rebajadas que las 3 de ritmo justo: esas 3 entran y van delante.
  for (let i = 0; i < 25; i++) objetos[1000 + i] = fila(90, 100, 0.95, { mercancia: true, vendidosDia: 50000 });
  objetos[2000] = fila(30, 100, 0.25, { mercancia: true, vendidosDia: 3 });
  objetos[2001] = fila(40, 100, 0.26, { mercancia: true, vendidosDia: 3 });
  objetos[2002] = fila(50, 100, 0.25, { mercancia: true, vendidosDia: 3 });
  const ids = idsDe({ 114: objetos });
  assert.equal(ids.length, 20);
  assert.deepEqual(ids.slice(0, 3), [2000, 2001, 2002]);
});

test('una mercancía claramente lenta sigue fuera de los baratos', () => {
  const ids = idsDe({ 114: {
    3000: fila(10, 100, 0.24, { mercancia: true }), // la más barata, pero lenta
    3001: fila(60, 100, 0.25, { mercancia: true }),
  } });
  assert.deepEqual(ids, [3001]);
});

test('los objetos sueltos siguen igual en los baratos de la IA', () => {
  const ids = idsDe({ 114: {
    4000: fila(10, 100, 0.24),
    4001: fila(70, 100, 0.9),
    4002: fila(60, 100, 0.25),
  } });
  assert.deepEqual(ids, [4002, 4001]);
});

test('sistema.md ya no dice que andan cerca de las ventas y dice que un ritmo alto no justifica recomendar', () => {
  assert.ok(!SISTEMA.includes('andan cerca de las ventas'));
  assert.ok(SISTEMA.includes('En una mercancía, un `ritmo` o un `vendidosDia` altos no justifican recomendar una compra'));
  assert.ok(SISTEMA.includes('uno bajo sí justifica desaconsejarla'));
  const ia = readFileSync(new URL('../src/comercio/ia.mjs', import.meta.url), 'utf8');
  assert.ok(!/de 0,84-0,95 a 0,36-0,41/.test(ia), 'el comentario de ia.mjs tampoco lo da por hecho');
});

// F9p, ronda 1: una oportunidad puede llegar sin su objeto en datos.comercio.objetos (tope de 60).
const sesentaEnBolsas = () => {
  const objetos = {};
  const bolsas = [];
  for (let i = 0; i < 60; i++) {
    objetos[5000 + i] = fila(90, 100, 0.5);
    bolsas.push({ id: 5000 + i, n: 1, b: [[0, i + 1]] });
  }
  return { objetos, bolsas };
};
const vivoCon = (oportunidad, objetos, bolsas) => {
  const ctx = { inv: { libres: 0, huecos: 60, bolsas }, comercio: { casa: 114, oportunidades: [oportunidad] } };
  const t = prepararTurno(base, mensaje({ ctx }), undefined, { comercio: fuente({ historial: historialFalso({ 114: objetos }) }) });
  return { o: t.datos.comercio.enVivo.oportunidades[0], ids: t.datos.comercio.objetos.map((x) => x.id) };
};

test('una oportunidad fuera del tope de 60 llega a la IA con mercancia', () => {
  const { objetos, bolsas } = sesentaEnBolsas();
  const { o, ids } = vivoCon({ id: 2589, precio: 50, pct: 50, ritmo: 0.95, fuente: 'app', edad: 60, mercancia: true }, objetos, bolsas);
  assert.equal(ids.length, MAX_OBJETOS_COMERCIO);
  assert.ok(!ids.includes(2589), 'se queda fuera de objetos');
  assert.deepEqual(o, { id: 2589, precio: 50, pct: 50, ritmo: 0.95, fuente: 'app', edad: 60, mercancia: true });
});

test('el saneado de ia.mjs conserva mercancia en las oportunidades', () => {
  const v = enVivoDe({ oportunidades: [
    { id: 1, precio: 5, pct: 5, mercancia: true },
    { id: 2, precio: 5, pct: 5, mercancia: 1 },
    { id: 3, precio: 5, pct: 5, mercancia: false },
    { id: 4, precio: 5, pct: 5 },
  ] });
  assert.deepEqual(v.oportunidades.map((o) => o.mercancia), [true, undefined, undefined, undefined]);
});

test('una oportunidad de la que no se sabe si es mercancía lo dice; con el historial de la app se sabe', () => {
  const { objetos, bolsas } = sesentaEnBolsas();
  const op = { id: 2589, precio: 50, pct: 50, ritmo: 0.95, fuente: 'app', edad: 60 };
  // Una fila sin el 1 de las mercancías puede ser de un objeto suelto o de una app de antes de F5, y la app no lo conoce.
  assert.equal(vivoCon(op, objetos, bolsas).o.mercanciaSinSaber, true);
  // Ya no está en la última foto: tampoco se puede afirmar que sea un objeto suelto.
  assert.equal(vivoCon(op, { ...objetos, 2589: fila(50, 100, 0.95, { enVenta: false }) }, bolsas).o.mercanciaSinSaber, true);
  // El historial sabe que es una mercancía: lo dice, aunque el addon sea de antes y no mande el campo.
  const merc = vivoCon(op, { ...objetos, 2589: fila(50, 100, 0.95, { mercancia: true }) }, bolsas).o;
  assert.deepEqual([merc.mercancia, merc.mercanciaSinSaber], [true, undefined]);
});

test('una oportunidad de un objeto suelto con datos sigue igual', () => {
  const op = { id: 2447, precio: 55, pct: 55, ritmo: 0.8, fuente: 'app', edad: 60 };
  const { o } = vivoCon(op, { 2447: fila(55, 100, 0.8) }, []);
  assert.deepEqual(o, op);
});

test('sistema.md no enseña a elegir mercancías por rotación alta y dice que ritmoMin solo descarta lo lento', () => {
  for (const frase of ['Hierbas rápidas', 'hierbas que se vendan rápido', '"ritmoMin":0.3', 'si pide objetos que salgan pronto']) {
    assert.ok(!SISTEMA.includes(frase), `sigue «${frase}»`);
  }
  assert.ok(SISTEMA.includes('En una mercancía, `ritmoMin` solo sirve para descartar lo lento'));
  assert.ok(SISTEMA.includes('no puedes confirmar que se vendan rápido'));
  assert.ok(SISTEMA.includes('`mercanciaSinSaber: true`'));
  assert.ok(SISTEMA.includes('no uses su `ritmo` como argumento a favor'));
});

test('sistema.md da una sola regla para una oportunidad que no está en objetos', () => {
  assert.ok(!SISTEMA.includes('aunque no esté en `objetos`'));
  assert.ok(SISTEMA.includes('Si un objeto no está en `datos.comercio.objetos` ni en `datos.comercio.enVivo.oportunidades`'));
  assert.ok(SISTEMA.includes('De una oportunidad que no esté en `objetos` solo sabes lo que trae ella'));
  assert.ok(SISTEMA.includes('Sin `mercancia` ni `mercanciaSinSaber` es un objeto suelto'));
});

test('construirComercio: un objeto mencionado sin datos va con sinDatos; sin historial ni subasta abierta, null', () => {
  const c = construirComercio({ ...fuente(), inventarioIds: [], mencionadas: [118], enVivo: null });
  assert.deepEqual(c.objetos.find((o) => o.id === 118), { id: 118, nombre: 'Poción de sanación menor', sinDatos: true });
  assert.equal(construirComercio({ historial: null, catalogo: null, casa: null, inventarioIds: [2589], mencionadas: [], enVivo: null }), null);
});

test('construirComercio: el nombre de un objeto escrito en el mensaje cuenta como mencionado', () => {
  const casas = { 114: { 2592: fila(500, 400, 0.1) } }; // ni barato ni rápido: solo entra si se menciona
  const c = construirComercio({ ...fuente({ historial: historialFalso(casas) }), inventarioIds: [], mencionadas: [], enVivo: null,
    texto: '¿a cuánto está el paño de lana?' });
  assert.ok(c.objetos.some((o) => o.id === 2592));
});

test('prepararTurno: con historial falso añade datos.comercio con el objeto del inventario y su ritmo', () => {
  const t = prepararTurno(base, mensaje(), undefined, { comercio: fuente() });
  assert.equal(t.datos.comercio.casa, 114);
  const lino = t.datos.comercio.objetos[0];
  assert.equal(lino.id, 2589, 'los del inventario van primero');
  assert.equal(lino.ritmo, 0.42);
  // Sin fuente de comercio y con la subasta cerrada no hay datos.comercio.
  assert.equal(prepararTurno(base, mensaje()).datos.comercio, undefined);
});

test('prepararTurno: los objetos enlazados en el mensaje (refs.i) también entran', () => {
  const casas = { 114: { 2592: fila(500, 400, 0.1) } };
  const t = prepararTurno(base, mensaje({ refs: { i: [2592] } }), undefined, { comercio: fuente({ historial: historialFalso(casas) }) });
  assert.ok(t.datos.comercio.objetos.some((o) => o.id === 2592));
});

test('prepararTurno: con más de 60 objetos se recorta a 60 (los del inventario primero)', () => {
  const casas = { 114: {} };
  const bolsas = [];
  for (let i = 1; i <= 90; i++) {
    casas[114][1000 + i] = fila(50, 100, 0.9);
    if (i <= 70) bolsas.push({ id: 1000 + i, n: 1 });
  }
  const t = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 90, bolsas } } }), undefined,
    { comercio: fuente({ historial: historialFalso(casas) }) });
  assert.equal(MAX_OBJETOS_COMERCIO, 60);
  assert.equal(t.datos.comercio.objetos.length, 60);
  assert.equal(t.datos.comercio.objetos[0].id, 1001);
  assert.equal(t.datos.comercio.objetos[59].id, 1060);
});

test('prepararTurno: con la subasta abierta lleva enVivo (como mucho 20 oportunidades) y sus objetos entran', () => {
  const oportunidades = [];
  for (let i = 1; i <= 25; i++) oportunidades.push({ id: 3000 + i, precio: 10 * i, pct: 40 + i, ritmo: 0.5 });
  oportunidades.unshift({ id: 2447, precio: 55, pct: 55, ritmo: 0.8 });
  const ctx = { comercio: { casa: 114, edadPrecios: 1800, grupo: { clave: 'propio:1', nombre: 'Hierbas' }, oportunidades, raro: 'x' } };
  const t = prepararTurno(base, mensaje({ ctx }), undefined, { comercio: fuente() });
  const vivo = t.datos.comercio.enVivo;
  assert.equal(vivo.casa, 114);
  assert.equal(vivo.edadPrecios, 1800);
  assert.deepEqual(vivo.grupo, { clave: 'propio:1', nombre: 'Hierbas' });
  assert.equal(vivo.oportunidades.length, 20);
  assert.deepEqual(vivo.oportunidades[0], { id: 2447, precio: 55, pct: 55, ritmo: 0.8 });
  assert.equal(vivo.raro, undefined);
  assert.ok(t.datos.comercio.objetos.some((o) => o.id === 2447));
  // Solo la subasta abierta (sin historial de la app): datos.comercio con enVivo y sin objetos con datos.
  const solo = prepararTurno(base, mensaje({ ctx }));
  assert.equal(solo.datos.comercio.enVivo.oportunidades.length, 20);
});

test('prepararTurno: si los datos no caben, datos.comercio se recorta (detrás de mazmorras) y se apunta', () => {
  // 400 objetos en las bolsas (lo que más ocupa) y todos con precios: el comercio se recorta antes que las bolsas.
  const nombres = {};
  const casas = { 114: {} };
  const bolsas = [];
  for (let i = 1; i <= 400; i++) {
    casas[114][5000 + i] = fila(50, 100, 0.9);
    nombres[5000 + i] = `Objeto ${'muy '.repeat(40)}largo ${i}`;
    bolsas.push({ id: 5000 + i, n: 1, ca: 2, pv: 10, nv: 20 });
  }
  const t = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 400, bolsas } } }), undefined,
    { comercio: fuente({ historial: historialFalso(casas), catalogo: catalogoFalso(nombres) }) });
  assert.ok(JSON.stringify(t.datos).length <= MAX_DATOS);
  assert.ok(t.datos.recorteApp.includes('comercio'));
  // El nombre del catálogo va cortado a 80 caracteres.
  const otra = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 1, bolsas: [{ id: 5001, n: 1 }] } } }), undefined,
    { comercio: fuente({ historial: historialFalso(casas), catalogo: catalogoFalso(nombres) }) });
  assert.ok(otra.datos.comercio.objetos[0].nombre.length <= 80);
});

test('prepararTurno: una fuente de comercio que falla no rompe el turno', () => {
  const rota = { historial: { todos() { throw new Error('disco'); } }, catalogo: null, casa: 114 };
  const t = prepararTurno(base, mensaje(), undefined, { comercio: rota });
  assert.equal(t.datos.comercio, undefined);
});

// ---------------------------------------------------------------------------------------------------
// El bloque `comercio` de la respuesta
// ---------------------------------------------------------------------------------------------------

const turnoDe = (extra) => prepararTurno(base, mensaje(extra), undefined, { comercio: fuente() });
const bloque = (comercio) => `Te propongo un grupo.\n\`\`\`snet\n${JSON.stringify({ comercio })}\n\`\`\``;

test('respuesta: un grupo válido con su regla pasa entero', () => {
  const r = procesarRespuesta(bloque({ grupo: { nombre: ' Hierbas rápidas ', objetos: [2447, 765, 2447] }, regla: { compraPct: 80, ritmoMin: 0.5 } }),
    turnoDe(), 'es');
  assert.deepEqual(r.comercio, { grupo: { nombre: 'Hierbas rápidas', objetos: [2447, 765] }, regla: { compraPct: 80, ritmoMin: 0.5 } });
  assert.deepEqual(r.quitados, []);
  assert.equal(r.texto, 'Te propongo un grupo.');
});

test('respuesta: una regla con compraPct 150 se quita y queda en quitados', () => {
  const r = procesarRespuesta(bloque({ grupo: { nombre: 'Telas', objetos: [2589] }, regla: { compraPct: 150 } }), turnoDe(), 'es');
  assert.deepEqual(r.comercio, { grupo: { nombre: 'Telas', objetos: [2589] } });
  assert.ok(r.quitados.includes('comercio.regla.compraPct'), JSON.stringify(r.quitados));
  for (const mala of [{ sniperPct: 0 }, { ritmoMin: 1.5 }, { valorMin: -1 }, { maxUnidades: 0 }, { maxUnidades: 10001 }, { maxUnidades: 2.5 },
    { maxOro: -5 }, { compraPct: '80' }, {}]) {
    const x = procesarRespuesta(bloque({ grupo: { nombre: 'Telas', objetos: [2589] }, regla: mala }), turnoDe(), 'es');
    assert.equal(x.comercio.regla, undefined, JSON.stringify(mala));
    assert.ok(x.quitados.some((q) => q.startsWith('comercio.regla')), JSON.stringify(mala));
  }
});

test('respuesta: los ids que no están en el catálogo se quitan; sin ninguno válido el grupo no pasa', () => {
  const r = procesarRespuesta(bloque({ grupo: { nombre: 'Mezcla', objetos: [2589, 999999, 'x', -3] } }), turnoDe(), 'es');
  assert.deepEqual(r.comercio.grupo.objetos, [2589]);
  assert.ok(r.quitados.includes('objeto:999999'));
  const nada = procesarRespuesta(bloque({ grupo: { nombre: 'Nada', objetos: [999999] }, regla: { compraPct: 70 } }), turnoDe(), 'es');
  assert.equal(nada.comercio, undefined, 'la regla era para ese grupo: tampoco pasa');
  assert.ok(nada.quitados.includes('comercio.grupo'));
});

test('respuesta: el nombre del grupo tiene de 1 a 40 caracteres y como mucho 200 objetos', () => {
  const largo = procesarRespuesta(bloque({ grupo: { nombre: 'x'.repeat(41), objetos: [2589] } }), turnoDe(), 'es');
  assert.equal(largo.comercio, undefined);
  assert.ok(largo.quitados.includes('comercio.grupo.nombre'));
  const vacio = procesarRespuesta(bloque({ grupo: { nombre: '   ', objetos: [2589] } }), turnoDe(), 'es');
  assert.equal(vacio.comercio, undefined);
  // 250 ids que existen: pasan los 200 primeros.
  const nombres = {};
  const ids = [];
  for (let i = 1; i <= 250; i++) { nombres[7000 + i] = `O${i}`; ids.push(7000 + i); }
  const turno = prepararTurno(base, mensaje(), undefined, { comercio: fuente({ catalogo: catalogoFalso(nombres) }) });
  const muchos = procesarRespuesta(bloque({ grupo: { nombre: 'Muchos', objetos: ids } }), turno, 'es');
  assert.equal(muchos.comercio.grupo.objetos.length, 200);
  assert.ok(muchos.quitados.includes('comercio.grupo.objetos'));
});

test('respuesta (revisión): el nombre pierde los «|» y se corta a 60 bytes entre caracteres; un id de 2^31 no vale', () => {
  const r = procesarRespuesta(bloque({ grupo: { nombre: '|cFFFF0000Rojas|r', objetos: [2589, 2 ** 31] } }), turnoDe(), 'es');
  assert.equal(r.comercio.grupo.nombre, 'cFFFF0000Rojasr');
  assert.deepEqual(r.comercio.grupo.objetos, [2589]);
  assert.ok(r.quitados.includes(`objeto:${2 ** 31}`));
  // 40 letras de dos bytes (80 bytes): quedan 30 letras (60 bytes).
  const largo = procesarRespuesta(bloque({ grupo: { nombre: 'ñ'.repeat(40), objetos: [2589] } }), turnoDe(), 'es');
  assert.equal(largo.comercio.grupo.nombre, 'ñ'.repeat(30));
  assert.ok(Buffer.byteLength(largo.comercio.grupo.nombre, 'utf8') <= 60);
  const soloBarras = procesarRespuesta(bloque({ grupo: { nombre: '|||', objetos: [2589] } }), turnoDe(), 'es');
  assert.equal(soloBarras.comercio, undefined);
});

test('respuesta: una regla sola va al grupo abierto en la subasta; sin grupo abierto se quita', () => {
  const ctx = { comercio: { casa: 114, grupo: { clave: 'propio:3', nombre: 'Hierbas' }, oportunidades: [] } };
  const r = procesarRespuesta(bloque({ regla: { sniperPct: 75 } }), turnoDe({ ctx }), 'es');
  assert.deepEqual(r.comercio, { regla: { sniperPct: 75 }, paraGrupo: { clave: 'propio:3', nombre: 'Hierbas' } });
  const sin = procesarRespuesta(bloque({ regla: { sniperPct: 75 } }), turnoDe(), 'es');
  assert.equal(sin.comercio, undefined);
  assert.ok(sin.quitados.includes('comercio.regla'));
});

test('respuesta: comercio que no es un objeto, o con campos raros, deja rastro en quitados', () => {
  const r = procesarRespuesta(bloque('grupo'), turnoDe(), 'es');
  assert.equal(r.comercio, undefined);
  assert.ok(r.quitados.includes('comercio'));
  const raro = procesarRespuesta(bloque({ grupo: { nombre: 'T', objetos: [2589] }, comprar: true, regla: { compraPct: 70, pujar: 1 } }), turnoDe(), 'es');
  assert.deepEqual(raro.comercio, { grupo: { nombre: 'T', objetos: [2589] }, regla: { compraPct: 70 } });
  assert.ok(raro.quitados.includes('comercio:comprar'));
  assert.ok(raro.quitados.includes('comercio.regla:pujar'));
  assert.ok(!raro.quitados.includes('campo:comercio'), 'comercio es un campo conocido del bloque');
});

test('una propuesta con ids de la base sin precios pasa la validación y llega como comercio (el chat enseña [Aplicar])', () => {
  const turno = prepararTurno(base, mensaje({ texto: 'hazme un grupo de hierbas' }), undefined, {});
  assert.equal(turno.datos.comercio, undefined, 'sin precios no hay datos.comercio');
  const r = procesarRespuesta(bloque({ grupo: { nombre: 'Hierbas', objetos: [2447, 765] } }), turno, 'es');
  assert.deepEqual(r.comercio, { grupo: { nombre: 'Hierbas', objetos: [2447, 765] } });
  assert.deepEqual(r.quitados, []);
});

test('sistema.md dice que puede proponer el grupo con objetosDeTipo aunque no haya precios', () => {
  for (const frase of ['objetosDeTipo', 'Si no hay precios', 'cuando la app tenga precios']) {
    assert.ok(SISTEMA.includes(frase), `falta «${frase}»`);
  }
});

test('sistema.md: la sección de comercio usa solo datos.comercio, propone con el bloque y nunca dice que ha comprado', () => {
  for (const frase of ['datos.comercio', '"comercio"', 'compraPct', 'sniperPct', 'ritmoMin', 'valorMin', 'maxUnidades', 'maxOro',
    'Aplicar', 'enVivo', 'Nunca digas que has comprado']) {
    assert.ok(SISTEMA.includes(frase), `falta «${frase}»`);
  }
});

// ---------------------------------------------------------------------------------------------------
// El registro del buzón
// ---------------------------------------------------------------------------------------------------

test('núcleo: un bloque válido llega al registro del buzón como `comercio`', async () => {
  const dir = join(RAIZ, 'nucleo');
  const addons = join(dir, 'AddOns');
  mkdirSync(join(addons, 'SnetForever'), { recursive: true });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Interface: 16001\n## Title: SnetForever\n\nnucleo.lua\n');
  const raiz = join(dir, 'volumen');
  mkdirSync(raiz);
  prepararAddOns(addons, { raizVolumen: raiz });
  const texto = bloque({ grupo: { nombre: 'Hierbas', objetos: [2447, 404040] }, regla: { compraPct: 70 } });
  const pedidos = [];
  const motor = {
    elegirMotor: () => ({ motor: 'claude', modelo: 'haiku' }),
    preguntar: async (o) => { pedidos.push(o); return { ok: true, motor: 'claude', texto }; },
    estadoMotor: () => ({ motor: 'claude', estado: 'ok', texto: '' }),
  };
  const fuentes = [];
  const x = crearNucleo({
    base: Promise.resolve(base), addonsDir: addons, datos: join(dir, 'datos'), motor, config: {}, raizVolumen: raiz,
    comprobar: { claude: async () => ({ estado: 'ok' }), codex: async () => ({ estado: 'sin_instalar' }) },
    comercioDatos: async (m) => { fuentes.push(m.texto); return fuente(); },
  });
  const cuerpo = Buffer.from(JSON.stringify(mensaje({ texto: 'hazme un grupo de hierbas' })), 'utf8');
  const cabeza = Buffer.from(['SNF1', PJ, 'c0-1', '1', '1', '0', '7', '0', ''].join('\x1f'), 'utf8');
  await x.recibirTrama(Buffer.concat([cabeza, cuerpo]));
  await x.inactivo();
  assert.deepEqual(fuentes, ['hazme un grupo de hierbas']);
  assert.ok(pedidos[0].entrada.includes('"comercio"'), 'la IA ve datos.comercio');
  const m = crearMaquina({ arrancar: false });
  try {
    const buzon = m.lua(`${readFileSync(join(addons, 'SnetForever_R007', 'buzon.lua'), 'utf8')}\nreturn SNF_BUZON`);
    const reg = buzon.registros[0];
    assert.equal(reg.t, 'respuesta');
    assert.deepEqual(reg.comercio, { grupo: { nombre: 'Hierbas', objetos: [2447] }, regla: { compraPct: 70 } });
  } finally {
    m.cerrar();
  }
});

// ---------------------------------------------------------------------------------------------------
// Task 17a: la fuente de la app (fuenteDeComercio)
// ---------------------------------------------------------------------------------------------------

test('fuenteDeComercio: casa del personaje y otras del reino; sin identidad, sin precios o con un estado roto, null', () => {
  const historial = { tieneDatos: (casa) => casa === 114 || casa === 111 };
  const catalogo = catalogoFalso(NOMBRES);
  // F7: sin casa supuesta; las tres de «Normal», descubiertas.
  const TRES = { 'Normal|Horde': 114, 'Normal|Alliance': 111, 'Normal|Neutral': 117 };
  const estado = (identidad, conocidas = TRES) => ({ identidad: () => identidad, conocidas: () => conocidas });
  const horda = { region: 'us', reino: 'Normal', faccion: 'Horde' };
  assert.deepEqual(fuenteDeComercio({ estado: estado(horda), historial, catalogo, mensaje: mensaje() }),
    { historial, catalogo, casa: 114, bando: 'Horde', otrasCasas: [111, 117], bandos: { 111: 'Alliance', 117: 'Neutral' } });
  // el bando del mensaje manda
  const f = fuenteDeComercio({ estado: estado(horda), historial, catalogo, mensaje: mensaje({ ctx: { pj: { faccion: 'Alliance' } } }) });
  assert.equal(f.casa, 111);
  assert.deepEqual(f.otrasCasas, [114, 117]);
  assert.equal(fuenteDeComercio({ estado: estado(horda, { ...TRES, 'Normal|Horde': 113 }), historial, catalogo, mensaje: mensaje() }), null,
    'la 113 no tiene precios');
  assert.equal(fuenteDeComercio({ estado: estado(horda, {}), historial, catalogo, mensaje: mensaje() }), null, 'nada se supone');
  assert.equal(fuenteDeComercio({ estado: estado(null), historial, catalogo, mensaje: mensaje() }), null);
  assert.equal(fuenteDeComercio({ estado: estado({ region: 'us', reino: 'Raro', faccion: 'Horde' }), historial, catalogo }), null);
  assert.equal(fuenteDeComercio({ estado: estado(horda), historial: {}, catalogo }), null);
  assert.equal(fuenteDeComercio(), null);
});

// F1 (ronda 1): cada oportunidad de la subasta abierta dice de qué foto sale el precio y su edad.
test('F1: las oportunidades llevan fuente y edad; una fuente que no se conoce no pasa', () => {
  const oportunidades = [
    { id: 2447, precio: 55, pct: 55, ritmo: 0.8, fuente: 'lista', edad: 30 },
    { id: 765, precio: 40, pct: 40, fuente: 'app', edad: 1800 },
    { id: 785, precio: 20, pct: 20, fuente: 'auctionator', edad: -1 },
  ];
  const t = prepararTurno(base, mensaje({ ctx: { comercio: { casa: 114, edadPrecios: 1800, oportunidades } } }));
  assert.deepEqual(t.datos.comercio.enVivo.oportunidades, [
    // F9p, ronda 1: sin historial de la app no se sabe si son mercancías, y cada una lo dice.
    { id: 2447, precio: 55, pct: 55, ritmo: 0.8, fuente: 'lista', edad: 30, mercanciaSinSaber: true },
    { id: 765, precio: 40, pct: 40, fuente: 'app', edad: 1800, mercanciaSinSaber: true },
    { id: 785, precio: 20, pct: 20, mercanciaSinSaber: true },
  ]);
  const sistema = readFileSync(new URL('../src/prompt/sistema.md', import.meta.url), 'utf8');
  assert.ok(sistema.includes('nunca recomiendes como buena compra de ahora un precio de `escaneo`'));
});
