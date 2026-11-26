// Fase 4, tarea 6: contexto del personaje que el addon manda a la IA (ia/contexto.lua), con las ampliaciones del banco
// (C_QuestLog.GetNumQuestLogEntries y GetInfo) y SNF.API.registroMisiones. Manda el juego sobre la base de datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const DATOS_MINI = [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua')];
const DATOS_AVISOS = [...DATOS_MINI, join(FIXTURES, 'avisos-mini.lua')];
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);

const INICIO = 'Prueba (H)\\01-02 Inicio';
const C = 'SnetForever.Contexto';

// Orco guerrero de la Horda, nivel 5, en el mapa 1411 (Durotar).
const ORCO_5 = { nivel: 5 };

const maquina = (jugador = ORCO_5, datos = DATOS_MINI) => nuevaMaquina({ datos, jugador });
const construir = (m) => m.lua(`${C}.construir()`);
const bytes = (m, valor) => m.lua(`#SnetForever.JSON.codificar(${aLua(valor)})`);
// Texto de bytes de un objeto JS, como lo mide el JSON del addon (UTF-8 como mucho 1 byte por carácter en estas pruebas).
const largo = (valor) => Buffer.byteLength(JSON.stringify(valor), 'utf8');

// ---------------------------------------------------------------------------------------------------
// Banco y API
// ---------------------------------------------------------------------------------------------------

test('banco: C_QuestLog.GetNumQuestLogEntries y GetInfo salen de las misiones enDiario, por id', () => {
  const m = maquina();
  m.estadoMision(4641, { enDiario: true });
  m.estadoMision(788, { enDiario: true });
  m.estadoMision(789, { entregada: true });
  assert.deepEqual(m.lua('{C_QuestLog.GetNumQuestLogEntries()}'), [2, 2]);
  assert.deepEqual(m.lua('C_QuestLog.GetInfo(1)'), { questID: 788, title: 'Misión 788', isHeader: false, isCollapsed: false, isHidden: false });
  assert.equal(m.lua('C_QuestLog.GetInfo(2).questID'), 4641);
  assert.equal(m.lua('C_QuestLog.GetInfo(3)'), undefined);
  sinErrores(m);
});

test('API.registroMisiones: con C_QuestLog.GetInfo, con la API vieja y sin ninguna', () => {
  const m = maquina();
  m.estadoMision(4641, { enDiario: true });
  m.estadoMision(788, { enDiario: true });
  assert.deepEqual(m.lua('SnetForever.API.registroMisiones()'), [788, 4641]);
  m.cerrar();

  const vieja = nuevaMaquina({ datos: DATOS_MINI, jugador: ORCO_5, sinApi: ['C_QuestLog.GetInfo'] });
  vieja.estadoMision(4641, { enDiario: true });
  assert.deepEqual(vieja.lua('SnetForever.API.registroMisiones()'), [4641]);
  sinErrores(vieja);
  vieja.cerrar();

  const nada = nuevaMaquina({ datos: DATOS_MINI, jugador: ORCO_5, sinApi: ['C_QuestLog.GetInfo', 'GetQuestLogTitle'] });
  nada.estadoMision(4641, { enDiario: true });
  assert.deepEqual(nada.lua('SnetForever.API.registroMisiones()'), []);
  sinErrores(nada);
  nada.cerrar();
});

test('API.registroMisiones: se salta lo que es un valor secreto', () => {
  const m = maquina();
  m.estadoMision(788, { enDiario: true });
  m.lua(`rawset(_G, "issecretvalue", function(v) return v == 788 end)`);
  assert.deepEqual(m.lua('SnetForever.API.registroMisiones()'), []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// construir: personaje, lugar, registro, profesiones
// ---------------------------------------------------------------------------------------------------

test('construir: personaje y lugar salen del juego', () => {
  const m = maquina({ nivel: 5, xp: 120, xpMax: 400, dinero: 12345 });
  const ctx = construir(m);
  assert.equal(ctx.pj.nivel, 5);
  assert.equal(ctx.pj.clase, 'WARRIOR');
  assert.equal(ctx.pj.raza, 'Orc');
  assert.equal(ctx.pj.faccion, 'Horde');
  assert.equal(ctx.pj.sexo, 'male');
  assert.equal(ctx.pj.xp, 120);
  assert.equal(ctx.pj.xpMax, 400);
  assert.equal(ctx.pj.dinero, 12345);
  assert.equal(ctx.lugar.mapa, 1411);
  assert.equal(ctx.lugar.zona, 'Durotar');
  assert.equal(ctx.lugar.subzona, 'Valle de los Retos');
  assert.equal(ctx.lugar.instancia, false);
  assert.equal(typeof ctx.lugar.x, 'number');
  assert.equal(typeof ctx.lugar.y, 'number');
  sinErrores(m);
});

test('construir: dentro de una instancia no hay mapa ni posición', () => {
  const m = maquina({ nivel: 5, enInstancia: true });
  const ctx = construir(m);
  assert.equal(ctx.lugar.instancia, true);
  assert.equal(ctx.lugar.mapa, undefined);
  assert.equal(ctx.lugar.x, undefined);
  sinErrores(m);
});

test('construir: registro con 4641 a 2/8 y 788 completa, y profesión Minería 75/150', () => {
  const m = maquina();
  m.estadoMision(4641, { enDiario: true, objetivos: [{ texto: 'Jabalí abatido: 2/8', hecho: 2, pedido: 8, terminado: false }] });
  m.estadoMision(788, { enDiario: true, completa: true });
  m.lua('BANCO.ponerHabilidad("Minería", 75, 150, false, 186)');
  const ctx = construir(m);
  // El banco lista el registro por id de menor a mayor; el juego, en el orden de sus zonas.
  const porQ = (q) => ctx.registro.find((e) => e.q === q);
  assert.equal(ctx.registro.length, 2);
  assert.deepEqual(porQ(4641), { q: 4641, c: 0, o: [[2, 8]], t: 'Misión 4641' }); // lote E2: con el título del cliente
  assert.deepEqual(porQ(788), { q: 788, c: 1, o: [], t: 'Misión 788' });
  assert.deepEqual(ctx.prof, [{ id: 186, r: 75, m: 150 }]);
  sinErrores(m);
});

test('construir: sin misiones ni profesiones, registro y prof son listas vacías', () => {
  const m = maquina();
  const ctx = construir(m);
  assert.deepEqual(ctx.registro, []);
  assert.deepEqual(ctx.prof, []);
  sinErrores(m);
});

test('PROFESIONES y MAX_JSON', () => {
  const m = maquina();
  assert.deepEqual(m.lua(`${C}.PROFESIONES`), [171, 164, 185, 333, 202, 129, 356, 182, 165, 186, 393, 197]);
  assert.equal(m.lua(`${C}.MAX_JSON`), 20000);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// construir: guía, guías, cadenas
// ---------------------------------------------------------------------------------------------------

test('construir: con la guía de prueba en el paso 1, guia.n es 1 y sus misiones salen sin repetir y como mucho 20', () => {
  const m = maquina();
  // Lote A (52-I1): a nivel 5 la guía por defecto de la Horda ya no es Inicio (1-2) sino la anterior más cercana
  // (Sigue, 2-3); esta prueba es de Inicio, así que se carga a mano.
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  m.estadoMision(4641, { enDiario: true });
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), INICIO);
  const ctx = construir(m);
  assert.equal(ctx.guia.clave, INICIO);
  assert.equal(ctx.guia.n, 1);
  assert.equal(typeof ctx.guia.titulo, 'string');
  assert.equal(typeof ctx.guia.paso, 'string');
  assert.ok(ctx.guia.misiones.includes(4641), 'incluye 4641');
  assert.ok(ctx.guia.misiones.length <= 20);
  assert.equal(new Set(ctx.guia.misiones).size, ctx.guia.misiones.length, 'sin repetidos');
  sinErrores(m);
});

test('construir: sin guía cargada no hay «guia»', () => {
  const m = nuevaMaquina({ datos: DATOS_MINI, jugador: ORCO_5, entrar: false });
  const ctx = construir(m);
  assert.equal(ctx.guia, undefined);
  assert.deepEqual(ctx.guias.length <= 8, true);
  sinErrores(m);
});

test('construir: guias son como mucho 8, a su nivel, con clave y título', () => {
  const m = maquina();
  const ctx = construir(m);
  assert.ok(ctx.guias.length >= 1 && ctx.guias.length <= 8, `hay ${ctx.guias.length}`);
  for (const g of ctx.guias) {
    assert.equal(typeof g.clave, 'string');
    assert.equal(typeof g.titulo, 'string');
  }
  sinErrores(m);
});

test('construir: un aviso pendiente de avisos-mini sale en cadenas con su guía y sus misiones', () => {
  const m = maquina({ nivel: 10, clase: 'DRUID' }, DATOS_AVISOS);
  m.lua('SnetForever.Avisos.masTarde("druida-10-tormenta")');
  const ctx = construir(m);
  assert.equal(ctx.cadenas.length, 1);
  assert.equal(ctx.cadenas[0].id, 'druida-10-tormenta');
  assert.equal(ctx.cadenas[0].guia, 'Prueba (H)\\02-03 Sigue');
  assert.match(ctx.cadenas[0].texto, /Claro de la Luna/);
  assert.ok(ctx.cadenas[0].misiones.includes(790), 'la 790 es de esa guía');
  sinErrores(m);
});

test('construir: una misión de la cadena ya entregada no sale; sin pendientes, cadenas es una lista vacía', () => {
  const m = maquina({ nivel: 10, clase: 'DRUID' }, DATOS_AVISOS);
  assert.deepEqual(construir(m).cadenas, []);
  m.lua('SnetForever.Avisos.masTarde("druida-10-tormenta")');
  m.estadoMision(790, { entregada: true });
  assert.ok(!construir(m).cadenas[0].misiones.includes(790));
  sinErrores(m);
});

test('construir: el filtro de raza de un paso de la cadena no la esconde (manda el juego)', () => {
  const m = maquina({ nivel: 10, clase: 'DRUID', raza: 'Skyborne' }, DATOS_AVISOS);
  m.lua('SnetForever.Avisos.masTarde("druida-10-tormenta")');
  m.lua(`SNF_RUTAS.guias["Prueba (H)\\\\02-03 Sigue"].pasos[1].filtro = {{"r:Tauren"}}`);
  const ctx = construir(m);
  assert.ok(ctx.cadenas[0].misiones.includes(790));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// construir: mazmorras
// ---------------------------------------------------------------------------------------------------

const mazmorras = (m) => m.lua(`${C}.mazmorras(SnetForever.Personaje.actual())`);

test('mazmorras: la 791 de zoneOrSort 1581 a su nivel sale; entregada o con el nivel 1, no', () => {
  const m = maquina({ nivel: 18 });
  const lista = mazmorras(m);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].area, 1581);
  assert.equal(lista[0].nombre, 'The Deadmines');
  assert.deepEqual(lista[0].misiones, [791]);
  assert.deepEqual(construir(m).mazmorras, lista);
  m.estadoMision(791, { entregada: true });
  assert.deepEqual(mazmorras(m), []);
  m.cerrar();

  const bajo = maquina({ nivel: 1 });
  assert.deepEqual(mazmorras(bajo), []);
  sinErrores(bajo);
});

test('mazmorras: lo que dice el juego manda sobre la máscara de raza de la base', () => {
  const m = maquina({ nivel: 18 });
  // Solo humanos según la base.
  m.datoMision(7001, { name: 'Solo humanos', requiredLevel: 1, questLevel: 18, requiredRaces: 1, requiredClasses: 0,
    zoneOrSort: 1581, questFlags: 0, specialFlags: 0, objectives: [], startedBy: [[3143]], finishedBy: [[3143]], preQuestSingle: [] });
  assert.deepEqual(mazmorras(m)[0].misiones, [791], 'el orco no la ve');
  m.estadoMision(7001, { enDiario: true });
  assert.deepEqual(mazmorras(m)[0].misiones, [7001, 791], 'en el registro cuenta como suya (va antes: nivel 18 contra 20)');
  sinErrores(m);
});

test('mazmorras: como mucho 4 mazmorras de 8 misiones, por el nivel de misión más bajo', () => {
  const m = maquina({ nivel: 18 });
  for (let a = 0; a < 6; a++) {
    m.lua(`SNF_MISIONES.mazmorra[${2000 + a}] = {nombre = "Mazmorra ${a}", zonaPadre = 40}`);
    for (let k = 0; k < 10; k++) {
      m.datoMision(8000 + a * 100 + k, { name: `M${a}-${k}`, requiredLevel: 1, questLevel: 15 + a + (k % 2), requiredRaces: 0,
        requiredClasses: 0, zoneOrSort: 2000 + a, questFlags: 0, specialFlags: 0, objectives: [], startedBy: [[3143]],
        finishedBy: [[3143]], preQuestSingle: [] });
    }
  }
  const lista = mazmorras(m);
  assert.equal(lista.length, 4);
  assert.ok(lista.every((z) => z.misiones.length <= 8));
  assert.deepEqual(lista.map((z) => z.area), [2000, 2001, 2002, 2003]);
  sinErrores(m);
});

test('mazmorras: con indiceMazmorras se usa ese índice (y lo entregado se quita)', () => {
  const m = maquina({ nivel: 5 });
  assert.deepEqual(mazmorras(m), [], 'sin índice, a nivel 5 no sale ninguna');
  m.lua(`${C}.indiceMazmorras = function() return {[1581] = {791, 792}} end`);
  assert.deepEqual(mazmorras(m), [{ area: 1581, nombre: 'The Deadmines', misiones: [791, 792] }]);
  m.estadoMision(792, { entregada: true });
  assert.deepEqual(mazmorras(m)[0].misiones, [791]);
  sinErrores(m);
});

test('indiceMazmorras: sin SNF_MISIONES.porMazmorra da nil; con él, {[area] = {q…}} del personaje', () => {
  const m = maquina({ nivel: 18 });
  assert.equal(m.lua(`${C}.indiceMazmorras()`), undefined);
  m.lua(`SNF_MISIONES.porMazmorra = {[1581] = {nombre = "The Deadmines", area = 1581, misiones = {
    {q = 791, nivel = 1, nivelMision = 20},
    {q = 792, nivel = 1, nivelMision = 40},
    {q = 7002, nivel = 1, nivelMision = 18, faccion = "Alliance"},
    {q = 7003, nivel = 1, nivelMision = 18, razas = {"Human"}},
    {q = 7004, nivel = 1, nivelMision = 18, clases = {"MAGE"}},
    {q = 7005, nivel = 1, nivelMision = 18, faccion = "Horde", razas = {"Orc"}, clases = {"WARRIOR"}},
  }}}`);
  m.estadoMision(7003, { enDiario: true });
  assert.deepEqual(m.lua(`${C}.indiceMazmorras()`), { 1581: [7003, 7005, 791] });
  sinErrores(m);
});

test('mazmorras: con los datos reales (con índice de la fase 3 y recorriendo las misiones) tarda menos de 0,5 s en fengari', { skip: hayDatos ? false : 'no están los addons de datos' }, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: { nivel: 25 } });
  const medir = () => {
    const t0 = performance.now();
    const lista = mazmorras(m);
    return [lista, performance.now() - t0];
  };
  const conIndice = m.lua('type(SNF_MISIONES.porMazmorra) == "table" and next(SNF_MISIONES.porMazmorra) ~= nil');
  const [listaIndice, msIndice] = medir();
  m.lua('SNF_MISIONES.porMazmorra = nil');
  const [lista, ms] = medir();
  const [, msSegunda] = medir();
  console.log(`# mazmorras con datos reales (nivel 25): índice de la fase 3 ${conIndice ? 'presente' : 'ausente'}: ${msIndice.toFixed(0)} ms, ${listaIndice.length} mazmorras; `
    + `recorriendo las misiones: ${ms.toFixed(0)} ms la primera vez, ${msSegunda.toFixed(1)} ms con memoria, ${lista.length} mazmorras`);
  assert.ok(lista.length <= 4 && listaIndice.length <= 4);
  assert.ok(msIndice < 500, `con índice tardó ${msIndice.toFixed(0)} ms`);
  assert.ok(ms < 500, `recorriendo tardó ${ms.toFixed(0)} ms`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// JSON y recorte
// ---------------------------------------------------------------------------------------------------

test('el JSON del contexto no tiene «.0» en los enteros', () => {
  const m = maquina({ nivel: 5, xp: 100, xpMax: 400, dinero: 5000 });
  m.estadoMision(4641, { enDiario: true, objetivos: [{ texto: 'x: 2/8', hecho: 2, pedido: 8, terminado: false }] });
  m.lua('BANCO.ponerHabilidad("Minería", 75, 150, false, 186)');
  const json = m.lua(`SnetForever.JSON.codificar(${C}.construir())`);
  assert.equal(typeof json, 'string');
  assert.doesNotMatch(json, /\d\.0(?!\d)/);
  assert.match(json, /"nivel":5/);
  sinErrores(m);
});

const obj = (i, extra = {}) => ({ id: 1000 + i, n: `Objeto de prueba número ${i}`, ca: i % 5, pv: 100 + i, nv: 10 + (i % 50), h: 'INVTYPE_CHEST', l: 0, b: [[1, (i % 16) + 1]], ...extra });
const mensaje = (inv, extra = {}) => ({ v: 1, id: 'a3f1-1', pj: 'Prueba', idioma: 'es', modelo: 'haiku', texto: 'hola', ctx: { pj: { nivel: 5 }, ...extra, inv } });

test('recortar: un banco de 300 objetos se quita primero y queda dentro de 20.000 bytes', () => {
  const m = maquina();
  const banco = { fecha: 1790000000, objetos: Array.from({ length: 300 }, (_, i) => obj(i)) };
  const inv = { libres: 3, huecos: 40, dinero: 1000, bolsas: [obj(1), obj(2)], equipo: [], banco };
  const msg = mensaje(inv);
  assert.ok(largo(msg) > 20000, 'de partida pasa de 20.000');
  const sale = m.lua(`${C}.recortar(${aLua(msg)}, ${C}.MAX_JSON)`);
  assert.ok(bytes(m, sale) <= 20000);
  assert.equal(sale.ctx.recorte[0], 'inv.banco');
  assert.equal(sale.ctx.inv.banco, undefined);
  assert.equal(sale.ctx.inv.bolsas.length, 2, 'lo demás de inv se conserva');
  sinErrores(m);
});

test('recortar: un mensaje que ya cabe no se toca', () => {
  const m = maquina();
  const msg = mensaje({ libres: 3, huecos: 40, dinero: 1, bolsas: [obj(1)], equipo: [] });
  const sale = m.lua(`${C}.recortar(${aLua(msg)}, 20000)`);
  assert.equal(sale.ctx.recorte, undefined);
  assert.deepEqual(sale.ctx.inv.bolsas, msg.ctx.inv.bolsas);
  sinErrores(m);
});

test('recortar: los recortes siguen el orden de P2 y paran en cuanto cabe', () => {
  const m = maquina();
  const equipo = Array.from({ length: 19 }, (_, s) => ({ s: s + 1, id: 2000 + s, nv: 20, ca: 3,
    st: { ITEM_MOD_STAMINA_SHORT: 10, ITEM_MOD_STRENGTH_SHORT: 12 }, tt: ['Línea de tooltip número uno', 'Línea dos'] }));
  const bolsas = Array.from({ length: 60 }, (_, i) => obj(i));
  const inv = { libres: 0, huecos: 60, dinero: 1, bolsas, equipo, banco: { fecha: 1, objetos: Array.from({ length: 200 }, (_, i) => obj(i)) } };
  // Con un tope de 9.000 bytes hay que quitar el banco y el detalle de las bolsas, pero se ve el orden.
  const sale = m.lua(`${C}.recortar(${aLua(mensaje(inv))}, 9000)`);
  assert.ok(bytes(m, sale) <= 9000);
  assert.deepEqual(sale.ctx.recorte.slice(0, 2), ['inv.banco', 'inv.equipo.st']);
  assert.equal(sale.ctx.inv.equipo[0].st, undefined);
  assert.equal(sale.ctx.inv.equipo[0].tt, undefined);
  assert.equal(sale.ctx.inv.equipo[0].id, 2000);
  if (sale.ctx.recorte.includes('inv.bolsas.detalle')) {
    assert.deepEqual(Object.keys(sale.ctx.inv.bolsas[0]).sort(), ['b', 'id', 'l', 'n']);
  }
  sinErrores(m);
});

test('recortar: un personaje cargado (muchas misiones, guía larga, bolsas y banco enormes) cabe en 20.000 bytes', () => {
  const m = maquina({ nivel: 18 });
  for (let k = 0; k < 25; k++) {
    m.estadoMision(9000 + k, { enDiario: true, objetivos: Array.from({ length: 4 }, (_, j) => ({ texto: `o${j}: 3/9`, hecho: 3, pedido: 9, terminado: false })) });
  }
  const ctx = construir(m);
  assert.equal(ctx.registro.length, 25);
  // Se carga el contexto a mano: guías, cadenas y mazmorras llenas, y un inventario que no cabe ni de lejos.
  ctx.guias = Array.from({ length: 8 }, (_, i) => ({ clave: `Guía de prueba larga número ${i}\\01-60 Con un nombre muy largo`, titulo: `Título de la guía de prueba ${i} bastante largo` }));
  ctx.cadenas = Array.from({ length: 6 }, (_, i) => ({ id: `cadena-${i}`, texto: 'Cadena de clase con un texto largo largo largo', guia: `Cadenas\\guia-${i}`, misiones: Array.from({ length: 20 }, (_, k) => 90000 + k) }));
  ctx.mazmorras = Array.from({ length: 4 }, (_, i) => ({ area: 1581 + i, nombre: 'Mazmorra con nombre largo', misiones: Array.from({ length: 8 }, (_, k) => 7000 + k) }));
  ctx.guia.misiones = Array.from({ length: 20 }, (_, k) => 50000 + k);
  const equipo = Array.from({ length: 19 }, (_, s) => ({ s: s + 1, id: 2000 + s, nv: 20, ca: 3, st: { ITEM_MOD_STAMINA_SHORT: 10 }, tt: ['Una línea de tooltip bastante larga para ocupar sitio', 'Otra línea'] }));
  const inv = { libres: 0, huecos: 120, dinero: 1, bolsas: Array.from({ length: 350 }, (_, i) => obj(i)), equipo,
    banco: { fecha: 1, objetos: Array.from({ length: 400 }, (_, i) => obj(i)) } };
  ctx.inv = inv;
  const msg = { v: 1, id: 'a3f1-2', pj: 'Tal Cual', idioma: 'es', modelo: 'sonnet', texto: 'x'.repeat(500), ctx };
  const sale = m.lua(`${C}.recortar(${aLua(msg)}, ${C}.MAX_JSON)`);
  const json = m.lua(`SnetForever.JSON.codificar(${aLua(sale)})`);
  assert.ok(Buffer.byteLength(json, 'utf8') <= 20000, `mide ${Buffer.byteLength(json, 'utf8')}`);
  const orden = ['inv.banco', 'inv.equipo.st', 'inv.bolsas.detalle', 'mazmorras', 'zonas', 'vuelos', 'cadenas', 'guias', 'registro.o', 'inv', 'registro.t', 'talentos'];
  const indices = sale.ctx.recorte.map((r) => orden.indexOf(r));
  assert.ok(indices.every((i) => i >= 0), 'solo recortes de P2');
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b), 'en orden');
  assert.equal(sale.ctx.recorte[0], 'inv.banco');
  sinErrores(m);
});

test('recortar: si no hay otra salida se llega hasta quitar «inv» y registro.o', () => {
  const m = maquina();
  const inv = { libres: 0, huecos: 1, dinero: 1, bolsas: Array.from({ length: 900 }, (_, i) => obj(i)), equipo: [] };
  const msg = mensaje(inv, { registro: [{ q: 1, c: 0, o: [[1, 2]] }] });
  const sale = m.lua(`${C}.recortar(${aLua(msg)}, 3000)`);
  assert.ok(bytes(m, sale) <= 3000);
  assert.equal(sale.ctx.inv, undefined);
  assert.equal(sale.ctx.recorte[sale.ctx.recorte.length - 1], 'inv');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1
// ---------------------------------------------------------------------------------------------------

test('construir: sin SNF_MISIONES (o sin quest ni mazmorra) no da error y no hay mazmorras', () => {
  const m = maquina();
  const datos = m.lua('SNF_MISIONES');
  assert.ok(datos);
  m.lua('SNF_MISIONES_BUENA = SNF_MISIONES; SNF_MISIONES = nil');
  // Sin la tabla entera el resto del addon (Datos) no puede ni leer guías: solo se prueba lo que es de este módulo.
  assert.deepEqual(mazmorras(m), []);
  assert.equal(m.lua(C + '.indiceMazmorras()'), undefined);
  m.lua('SNF_MISIONES = {}');
  assert.deepEqual(construir(m).mazmorras, []);
  m.lua('SNF_MISIONES = {quest = {}}');
  assert.deepEqual(construir(m).mazmorras, []);
  m.lua('SNF_MISIONES = {mazmorra = {}}');
  assert.deepEqual(construir(m).mazmorras, []);
});

test('banco: una cabecera colapsada tapa sus misiones a GetInfo, pero IsOnQuest las ve', () => {
  const m = maquina();
  m.estadoMision(788, { enDiario: true });
  m.estadoMision(4641, { enDiario: true });
  m.registroColapsado([788]);
  assert.deepEqual(m.lua('{C_QuestLog.GetNumQuestLogEntries()}'), [2, 2]);
  assert.equal(m.lua('C_QuestLog.GetInfo(1).isHeader'), true);
  assert.equal(m.lua('C_QuestLog.GetInfo(1).isCollapsed'), true);
  assert.equal(m.lua('C_QuestLog.GetInfo(2).questID'), 4641);
  assert.equal(m.lua('C_QuestLog.IsOnQuest(788)'), true);
  sinErrores(m);
});

test('registro: con una cabecera colapsada avisa (registroIncompleto) y suma las de la guía y las de mazmorra que IsOnQuest da', () => {
  const m = maquina({ nivel: 18 });
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`); // lote A: a nivel 18 la de por defecto es Sigue; la prueba es de Inicio
  m.estadoMision(4641, { enDiario: true });
  m.estadoMision(788, { enDiario: true }); // de la guía (paso 2) pero tapada
  m.estadoMision(791, { enDiario: true }); // de mazmorra, tapada
  m.estadoMision(9999, { enDiario: true }); // en el registro pero ni de la guía ni de mazmorra: no se puede saber
  m.registroColapsado([788, 791, 9999]);
  const ctx = construir(m);
  assert.equal(ctx.registroIncompleto, true);
  const qs = ctx.registro.map((e) => e.q).sort((a, b) => a - b);
  assert.deepEqual(qs, [788, 791, 4641]);
  sinErrores(m);
});

test('registro: sin cabeceras colapsadas no hay aviso ni complemento', () => {
  const m = maquina({ nivel: 18 });
  m.estadoMision(4641, { enDiario: true });
  const ctx = construir(m);
  assert.equal(ctx.registroIncompleto, undefined);
  assert.deepEqual(ctx.registro.map((e) => e.q), [4641]);
  sinErrores(m);
});

test('API.registroMisiones: la API vieja también avisa de una cabecera colapsada', () => {
  const m = nuevaMaquina({ datos: DATOS_MINI, jugador: ORCO_5, sinApi: ['C_QuestLog.GetInfo'] });
  m.lua(`rawset(_G, "GetNumQuestLogEntries", function() return 2, 1 end)
    rawset(_G, "GetQuestLogTitle", function(i)
      if i == 1 then return "Durotar", 0, 0, true, true, nil, nil, 0 end
      return "Misión", 5, 0, false, false, nil, 1, 788
    end)`);
  assert.deepEqual(m.lua('{SnetForever.API.registroMisiones()}'), [[788], true]);
  sinErrores(m);
});

test('recortar: devuelve cabe = false si al final sigue por encima del tope', () => {
  const m = maquina();
  const msg = mensaje({ libres: 0, huecos: 1, dinero: 1, bolsas: [], equipo: [] }, { guia: { clave: 'x'.repeat(5000) } });
  const r = m.lua(`{${C}.recortar(${aLua(msg)}, 1000)}`);
  assert.equal(r[0].ctx.pj.nivel, 5);
  assert.equal(r[1], false);
  const bien = m.lua(`{${C}.recortar(${aLua(mensaje({ libres: 0, huecos: 1, dinero: 1, bolsas: [], equipo: [] }))}, 20000)}`);
  assert.equal(bien[1], true);
  const grande = mensaje({ libres: 0, bolsas: Array.from({ length: 400 }, (_, i) => obj(i)), equipo: [] });
  const recortado = m.lua(`{${C}.recortar(${aLua(grande)}, 20000)}`);
  assert.equal(recortado[1], true);
  sinErrores(m);
});

test('API.esSecreto está expuesta', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.API.esSecreto(5)'), false);
  m.lua('rawset(_G, "issecretvalue", function(v) return v == 5 end)');
  assert.equal(m.lua('SnetForever.API.esSecreto(5)'), true);
  assert.equal(m.lua('SnetForever.API.esSecreto(6)'), false);
  sinErrores(m);
});

test('construir: si falta una API, esa sección queda vacía y lo demás sigue', () => {
  const m = nuevaMaquina({ datos: DATOS_MINI, jugador: ORCO_5,
    sinApi: ['GetRealZoneText', 'GetSubZoneText', 'C_Map.GetBestMapForUnit', 'UnitXP', 'GetMoney'] });
  m.lua('rawset(_G, "IsInInstance", nil)'); // otros módulos la usan al arrancar; aquí falta solo para construir()
  const ctx = construir(m);
  assert.equal(ctx.lugar.instancia, false);
  assert.equal(ctx.lugar.mapa, undefined);
  assert.equal(ctx.lugar.zona, undefined);
  assert.equal(ctx.pj.xp, undefined);
  assert.equal(ctx.pj.dinero, undefined);
  assert.equal(ctx.pj.clase, 'WARRIOR');
  assert.ok(Array.isArray(ctx.registro));
  sinErrores(m);
});

test('construir: un valor secreto no se compara ni se manda', () => {
  const m = maquina({ nivel: 5, xp: 100, dinero: 77 });
  m.lua('rawset(_G, "issecretvalue", function(v) return v == "Durotar" or v == 100 or v == 1411 end)');
  const ctx = construir(m);
  assert.equal(ctx.lugar.zona, undefined);
  assert.equal(ctx.lugar.mapa, undefined);
  assert.equal(ctx.pj.xp, undefined);
  assert.equal(ctx.pj.dinero, 77);
  assert.equal(ctx.lugar.subzona, 'Valle de los Retos');
  sinErrores(m);
});

test('mazmorras: con índice el orden usa el nivel de la entrada del índice, no questLevel', () => {
  const m = maquina({ nivel: 18 });
  m.lua(`SNF_MISIONES.mazmorra[2001] = {nombre = "Otra", zonaPadre = 40}
    SNF_MISIONES.porMazmorra = {
      [1581] = {nombre = "The Deadmines", area = 1581, misiones = {{q = 791, nivel = 1, nivelMision = 19}}},
      [2001] = {nombre = "Otra", area = 2001, misiones = {{q = 7002, nivel = 1, nivelMision = 16}}},
    }`);
  m.datoMision(7002, { name: 'x', requiredLevel: 1, questLevel: 40, requiredRaces: 0, requiredClasses: 0, zoneOrSort: 2001,
    questFlags: 0, specialFlags: 0, objectives: [], startedBy: [[3143]], finishedBy: [[3143]], preQuestSingle: [] });
  // questLevel de 791 es 20 y el de 7002 es 40; por la entrada, 7002 (16) va antes que 791 (19).
  assert.deepEqual(mazmorras(m).map((z) => z.area), [2001, 1581]);
  sinErrores(m);
});

test('JSON: un dinero cerca de 2^31 cobre y por encima sale entero, sin decimales raros', () => {
  for (const dinero of [2147483647, 2147483648, 3000000000]) {
    const m = maquina({ nivel: 5, dinero });
    const json = m.lua(`SnetForever.JSON.codificar(${C}.construir())`);
    assert.match(json, new RegExp(`"dinero":${dinero}[,}]`), String(dinero));
    sinErrores(m);
  }
});

test('peor caso real: construir() con 40 misiones de 8 objetivos, guía larga y todo al máximo cabe tras recortar', () => {
  const m = maquina({ nivel: 18, clase: 'DRUID' }, DATOS_AVISOS);
  const largo = 'Aceptar con un texto larguísimo '.repeat(8);
  const pasos = [{ elementos: Array.from({ length: 60 }, (_, k) => ({ t: 'accept', q: 20000 + k, texto: { en: largo, es: largo } })) }];
  for (let i = 0; i < 14; i++) pasos.push({ elementos: [{ t: 'turnin', q: 30000 + i, texto: { en: 'x', es: 'x' } }] });
  m.ponerGuia(guiaDePrueba(pasos, { clave: 'Prueba (H)\\90-91 Larga', grupo: 'Prueba (H)', nombre: '90-91 Larga', niveles: [1, 60] }));
  m.lua('SnetForever.Guias.cargar("Prueba (H)\\\\90-91 Larga")');
  for (let k = 0; k < 40; k++) {
    m.estadoMision(9000 + k, { enDiario: true, objetivos: Array.from({ length: 8 }, (_, j) => ({ texto: `o${j}: 3/9`, hecho: 3, pedido: 9, terminado: false })) });
  }
  m.lua('SnetForever.Avisos.masTarde("druida-10-tormenta")');
  const t0 = performance.now();
  const ctx = construir(m);
  const ms = performance.now() - t0;
  assert.equal(ctx.registro.length, 40);
  assert.equal(ctx.guia.misiones.length, 20);
  const inv = { libres: 0, huecos: 120, dinero: 1, bolsas: Array.from({ length: 350 }, (_, i) => obj(i)),
    equipo: Array.from({ length: 19 }, (_, s) => ({ s: s + 1, id: 2000 + s, nv: 20, ca: 3, st: { ITEM_MOD_STAMINA_SHORT: 10 }, tt: ['Una línea larga de tooltip para ocupar sitio'] })),
    banco: { fecha: 1, objetos: Array.from({ length: 400 }, (_, i) => obj(i)) } };
  const msg = { v: 1, id: 'a3f1-2', pj: 'Tal Cual', idioma: 'es', modelo: 'sonnet', texto: 'x'.repeat(500), ctx: { ...ctx, inv } };
  const r = m.lua(`{${C}.recortar(${aLua(msg)}, ${C}.MAX_JSON)}`);
  const tam = m.lua(`#SnetForever.JSON.codificar(${aLua(r[0])})`);
  console.log(`# peor caso: construir() ${ms.toFixed(0)} ms, ${tam} bytes tras recortar (${(r[0].ctx.recorte || []).join(', ')})`);
  assert.equal(r[1], true);
  assert.ok(tam <= 20000, `mide ${tam}`);
  sinErrores(m);
});

test('construir() completo con los datos reales: tiempo', { skip: hayDatos ? false : 'no están los addons de datos' }, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: { nivel: 25, clase: 'DRUID', raza: 'Tauren' } });
  const t0 = performance.now();
  const ctx = construir(m);
  const ms = performance.now() - t0;
  const t1 = performance.now();
  construir(m);
  const ms2 = performance.now() - t1;
  console.log(`# construir() con datos reales: ${ms.toFixed(0)} ms la primera vez, ${ms2.toFixed(0)} ms la segunda`);
  assert.ok(ctx.guias.length <= 8);
  assert.ok(ms < 2000, `tardó ${ms.toFixed(0)} ms`);
  sinErrores(m);
});

test('tarea 16: con vuelos apuntados el contexto lleva vuelosIds (ids ordenados); sin ellos no lleva ni vuelos ni vuelosIds', () => {
  const m = maquina();
  let ctx = construir(m);
  assert.equal(ctx.vuelos, undefined);
  assert.equal(ctx.vuelosIds, undefined);
  m.lua('SnetForeverPJ.vuelos = {npcs = {[96005] = true, [96001] = true}, nombres = {[96005] = "Beta", [96001] = "Alfa"}}');
  ctx = construir(m);
  assert.deepEqual(ctx.vuelos, ['Alfa', 'Beta']);
  assert.deepEqual(ctx.vuelosIds, [96001, 96005]);
  sinErrores(m);
});

test('tarea 16: al recortar, vuelosIds se quita junto con vuelos', () => {
  const m = maquina();
  const msg = mensaje({ libres: 0, huecos: 1, dinero: 1, bolsas: [], equipo: [] }, { vuelos: Array.from({ length: 40 }, (_, i) => `Vuelo número ${i} de prueba`), vuelosIds: Array.from({ length: 40 }, (_, i) => 96000 + i) });
  const sale = m.lua(`${C}.recortar(${aLua(msg)}, 400)`);
  assert.ok(sale.ctx.recorte.includes('vuelos'), JSON.stringify(sale.ctx.recorte));
  assert.equal(sale.ctx.vuelos, undefined);
  assert.equal(sale.ctx.vuelosIds, undefined);
  sinErrores(m);
});

// T1: con la guía acabada, el motor deja `actual` en el último paso; el contexto no lo manda como paso actual.
test('construir: con la guía acabada, guia.fin y sin paso ni n', () => {
  const m = maquina();
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'accept', q: 4641 }] }]));
  m.estadoMision(4641, { enDiario: true });
  m.lua(`SnetForever.Motor.cargar(${aLua(guiaDePrueba([]).clave)})`);
  m.lua('SnetForever.Motor.actualizar()');
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), true);
  const ctx = construir(m);
  assert.equal(ctx.guia.fin, true);
  assert.equal(ctx.guia.paso, undefined);
  assert.equal(ctx.guia.n, undefined);
  sinErrores(m);
});

test('construir: con la guía en curso, sin guia.fin', () => {
  const m = maquina();
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  const ctx = construir(m);
  assert.equal(ctx.guia.fin, undefined);
  assert.equal(typeof ctx.guia.paso, 'string');
  sinErrores(m);
});

// T3: la IA sabe a qué guía puede volver el jugador y por qué paso va (la app lo lee en datos.ruta).
test('construir: con una guía a la que volver, guia.volverA = {titulo, n}; sin ella, nada', () => {
  const m = maquina();
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)}, {n = 3})`);
  assert.equal(construir(m).guia.volverA, undefined);
  m.lua(`SnetForever.Guias.abrirLateral(${aLua('Prueba (H)\\02-03 Sigue')})`);
  const ctx = construir(m);
  assert.equal(ctx.guia.clave, 'Prueba (H)\\02-03 Sigue');
  assert.deepEqual(ctx.guia.volverA, { titulo: '1-2 Inicio', n: 3 });
  // Con la vuelta olvidada (la X de «Volver a»), ya no va.
  m.lua('SnetForever.Guias.olvidarVuelta()');
  assert.equal(construir(m).guia.volverA, undefined);
  sinErrores(m);
});

// Ronda 1 (Menor 2): la misma condición que el botón: con la guía de vuelta sin nada que hacer ahora, no va.
test('construir: guia.volverA solo si sale el botón «Volver a» (la guía de vuelta tiene algo que hacer)', () => {
  const m = maquina();
  const mision = (nombre, extra = {}) => ({ name: nombre, startedBy: [[3143]], finishedBy: [[3143]], requiredLevel: 1,
    questLevel: 5, requiredRaces: 0, requiredClasses: 0, objectivesText: [`Haz ${nombre}`], ...extra });
  m.datoMision(9101, mision('La previa de prueba'));
  m.datoMision(9102, mision('La que pide la previa', { preQuestSingle: [9101] }));
  m.datoMision(9103, mision('Otra de prueba'));
  m.estadoMision(9103, { enDiario: true });
  m.ponerGuia(guiaDePrueba([
    { elementos: [{ t: 'goto', mapa: 1411, x: 50, y: 50, modo: 'flecha' }, { t: 'accept', q: 9102 }] },
    { elementos: [{ t: 'turnin', q: 9102 }] },
  ]));
  const principal = guiaDePrueba([]).clave;
  m.lua(`SnetForever.Guias.cargar(${aLua(principal)})`);
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(INICIO)})`);
  assert.equal(m.lua('SnetForeverPJ.volverA'), principal);
  assert.equal(m.lua('SnetForever.Avisos.botonVolver()'), undefined);
  assert.equal(construir(m).guia.volverA, undefined);
  // Con algo que hacer (la previa ya entregada), sí.
  m.estadoMision(9101, { entregada: true });
  m.disparar('QUEST_LOG_UPDATE');
  assert.deepEqual(construir(m).guia.volverA, { titulo: '1-60 Guía de prueba', n: 1 });
  sinErrores(m);
});
