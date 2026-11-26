// Fase 4, tarea 7: inventario para la IA (ia/inventario.lua) con las APIs de contenedores y objetos de SNF.API y las
// ampliaciones del banco (C_Container, C_Item.GetItemInfo/GetItemStats, GetInventoryItemLink, C_TooltipInfo, Enum.BagIndex).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const INV = 'SnetForever.Inventario';
const API = 'SnetForever.API';

const LINO = { nombre: 'Linen Cloth', calidad: 1, nivel: 5, precio: 13 };

// Máquina con la tela de lino en (0,1) × 12 y (0,2) × 3.
function conLino(opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.itemInfo(2589, LINO);
  m.bolsa(0, 1, { id: 2589, n: 12 });
  m.bolsa(0, 2, { id: 2589, n: 3 });
  return m;
}

// ---------------------------------------------------------------------------------------------------
// Bolsas
// ---------------------------------------------------------------------------------------------------

test('bolsas: 2589 × 12 y × 3 son un solo Obj con n = 15 y las dos posiciones', () => {
  const m = conLino();
  const b = m.lua(`${INV}.bolsas()`);
  assert.equal(b.objetos.length, 1);
  assert.deepEqual(b.objetos[0], { id: 2589, n: 15, ca: 1, pv: 13, nv: 5, l: 0, b: [[0, 1], [0, 2]] });
  sinErrores(m);
});

test('bolsas: libres y huecos cuadran con el banco de pruebas', () => {
  const m = conLino();
  m.bolsa(1, 1, { id: 2589, n: 1 }); // una bolsa de 12 huecos con uno ocupado
  const b = m.lua(`${INV}.bolsas()`);
  assert.equal(b.huecos, 16 + 12);
  assert.equal(b.libres, 14 + 11);
  m.huecos(2, 6); // bolsa vacía de 6
  m.bolsa(2, 1, undefined);
  const c = m.lua(`${INV}.bolsas()`);
  assert.equal(c.huecos, 16 + 12 + 6);
  assert.equal(c.libres, 14 + 11 + 6);
  sinErrores(m);
});

test('bolsas: el mismo objeto ligado y sin ligar son dos Obj (l = 1 y l = 0)', () => {
  const m = nuevaMaquina();
  m.itemInfo(25, { nombre: 'Worn Shortsword', calidad: 1, nivel: 2, equipa: 'INVTYPE_WEAPON', precio: 7 });
  m.bolsa(0, 1, { id: 25, n: 1 });
  m.bolsa(0, 2, { id: 25, n: 1, ligado: true });
  const objetos = m.lua(`${INV}.bolsas()`).objetos;
  assert.equal(objetos.length, 2);
  assert.deepEqual(objetos.map((o) => [o.id, o.l, o.h, o.b]), [[25, 0, 'INVTYPE_WEAPON', [[0, 1]]], [25, 1, 'INVTYPE_WEAPON', [[0, 2]]]]);
  sinErrores(m);
});

test('bolsas: sin caché, el Obj lleva solo id, n y l, y se pide el objeto una sola vez', () => {
  const m = nuevaMaquina();
  m.bolsa(0, 1, { id: 777, n: 4 });
  m.bolsa(0, 2, { id: 777, n: 2 });
  const o = m.lua(`${INV}.bolsas()`).objetos[0];
  assert.deepEqual(o, { id: 777, n: 6, l: 0, b: [[0, 1], [0, 2]] });
  assert.deepEqual(m.llamadas('C_Item.RequestLoadItemDataByID'), [[777]]);
  sinErrores(m);
});

test('bolsas: sin C_Container usa las globales viejas, y sin ninguna da nil', () => {
  const vieja = conLino({ sinApi: ['C_Container.GetContainerNumSlots', 'C_Container.GetContainerNumFreeSlots', 'C_Container.GetContainerItemInfo'] });
  const b = vieja.lua(`${INV}.bolsas()`);
  assert.equal(b.huecos, 16);
  assert.equal(b.libres, 14);
  assert.equal(b.objetos[0].n, 15);
  sinErrores(vieja);
  vieja.cerrar();

  const nada = conLino({
    sinApi: ['C_Container.GetContainerNumSlots', 'C_Container.GetContainerNumFreeSlots', 'C_Container.GetContainerItemInfo',
      'GetContainerNumSlots', 'GetContainerNumFreeSlots', 'GetContainerItemInfo'],
  });
  assert.equal(nada.lua(`${API}.huecosBolsa(0)`), undefined);
  assert.equal(nada.lua(`${API}.libresBolsa(0)`), undefined);
  assert.equal(nada.lua(`${API}.infoContenedor(0, 1)`), undefined);
  assert.deepEqual(nada.lua(`${INV}.bolsas()`), { libres: 0, huecos: 0, objetos: [] });
  sinErrores(nada);
});

test('API.infoContenedor: da id, n, ca, l y enlace; un hueco vacío da nil', () => {
  const m = nuevaMaquina();
  m.bolsa(0, 3, { id: 118, n: 5, calidad: 2, ligado: true });
  const i = m.lua(`${API}.infoContenedor(0, 3)`);
  assert.deepEqual({ id: i.id, n: i.n, ca: i.ca, l: i.l }, { id: 118, n: 5, ca: 2, l: 1 });
  assert.match(i.enlace, /Hitem:118:/);
  assert.equal(m.lua(`${API}.infoContenedor(0, 4)`), undefined);
  sinErrores(m);
});

test('bolsas: un valor secreto no se compara (el hueco se salta)', () => {
  const m = conLino();
  m.lua(`rawset(_G, "issecretvalue", function(v) return v == 3 end)`); // la cantidad 3 es secreta
  const o = m.lua(`${INV}.bolsas()`).objetos;
  assert.equal(o.length, 1);
  assert.equal(o[0].n, 12);
  assert.deepEqual(o[0].b, [[0, 1]]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------------------------------

test('equipo: 25 en el hueco 16 con estadísticas da s, id, nv, ca y st (sin tt)', () => {
  const m = nuevaMaquina();
  m.itemInfo(25, { nombre: 'Worn Shortsword', calidad: 1, nivel: 2, estadisticas: { ITEM_MOD_STAMINA_SHORT: 1 }, tooltip: ['Worn Shortsword', 'Soulbound'] });
  m.equipar(16, 25);
  assert.deepEqual(m.lua(`${INV}.equipo()`), [{ s: 16, id: 25, nv: 2, ca: 1, st: { ITEM_MOD_STAMINA_SHORT: 1 } }]);
  sinErrores(m);
});

test('equipo: sin estadísticas lleva tt con 12 líneas como mucho, de 60 bytes como mucho', () => {
  const m = nuevaMaquina();
  const lineas = Array.from({ length: 20 }, (_, i) => `Línea ${i + 1} ${'ñ'.repeat(50)}`);
  m.itemInfo(25, { nombre: 'Worn Shortsword', nivel: 2, tooltip: lineas });
  m.equipar(16, 25);
  const [eq] = m.lua(`${INV}.equipo()`);
  assert.equal(eq.st, undefined);
  assert.equal(eq.tt.length, 12);
  for (const t of eq.tt) assert.ok(Buffer.byteLength(t, 'utf8') <= 60, t);
  // El corte no deja medio carácter UTF-8.
  for (const t of eq.tt) assert.ok(!t.includes('�'), t);
  assert.equal(eq.tt[0].startsWith('Línea 1 '), true);
  sinErrores(m);
});

test('equipo: sin caché lleva solo s e id y se pide el objeto; recorre los huecos 1 a 19', () => {
  const m = nuevaMaquina();
  m.equipar(1, 100);
  m.equipar(19, 200);
  m.equipar(20, 300); // no es de equipo
  const eq = m.lua(`${INV}.equipo()`);
  assert.deepEqual(eq, [{ s: 1, id: 100 }, { s: 19, id: 200 }]);
  assert.deepEqual(m.llamadas('C_Item.RequestLoadItemDataByID'), [[100], [200]]);
  sinErrores(m);
});

test('API.infoObjeto y API.estadisticas: de una id o de un enlace; nil sin caché y sin estadísticas', () => {
  const m = nuevaMaquina();
  m.itemInfo(25, { nombre: 'Worn Shortsword', calidad: 1, nivel: 2, equipa: 'INVTYPE_WEAPON', precio: 7,
    apilado: 1, estadisticas: { ITEM_MOD_STAMINA_SHORT: 1 } });
  m.itemInfo(26, { nombre: 'Camisa' });
  assert.deepEqual(m.lua(`${API}.infoObjeto(25)`), { nombre: 'Worn Shortsword', ca: 1, nv: 2, h: 'INVTYPE_WEAPON', pv: 7, apilado: 1 });
  assert.equal(m.lua(`${API}.infoObjeto("item:25")`).nombre, 'Worn Shortsword');
  assert.equal(m.lua(`${API}.infoObjeto(999)`), undefined);
  assert.deepEqual(m.lua(`${API}.estadisticas("item:25")`), { ITEM_MOD_STAMINA_SHORT: 1 });
  assert.equal(m.lua(`${API}.estadisticas("item:26")`), undefined);
  assert.equal(m.lua(`${API}.estadisticas("item:999")`), undefined);
  sinErrores(m);
});

test('API: sin ninguna API de objetos, nil (y el inventario no falla)', () => {
  const m = nuevaMaquina({ sinApi: ['C_Item.GetItemInfo', 'GetItemInfo', 'C_Item.GetItemStats'] });
  m.itemInfo(25, { nivel: 2 });
  m.equipar(16, 25);
  m.bolsa(0, 1, { id: 25, n: 1 });
  assert.equal(m.lua(`${API}.infoObjeto(25)`), undefined);
  assert.equal(m.lua(`${API}.estadisticas("item:25")`), undefined);
  assert.deepEqual(m.lua(`${INV}.equipo()`), [{ s: 16, id: 25 }]);
  assert.deepEqual(m.lua(`${INV}.bolsas()`).objetos, [{ id: 25, n: 1, l: 0, b: [[0, 1]] }]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------------------------------

test('API.bolsasBanco: con Enum.BagIndex y sin él da -1 y las bolsas 5 a 10', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua(`${API}.bolsasBanco()`), [-1, 5, 6, 7, 8, 9, 10]);
  m.cerrar();
  const sin = nuevaMaquina({ sinApi: ['Enum.BagIndex'] });
  assert.deepEqual(sin.lua(`${API}.bolsasBanco()`), [-1, 5, 6, 7, 8, 9, 10]);
  sinErrores(sin);
});

test('API.bolsasBanco: con Enum.BagIndex usa los índices que traiga (también BankBag_7)', () => {
  const m = nuevaMaquina();
  m.lua('Enum.BagIndex.BankBag_7 = 11');
  assert.deepEqual(m.lua(`${API}.bolsasBanco()`), [-1, 5, 6, 7, 8, 9, 10, 11]);
  m.lua('Enum.BagIndex.Bank = nil');
  assert.deepEqual(m.lua(`${API}.bolsasBanco()`), [-1, 5, 6, 7, 8, 9, 10]);
  sinErrores(m);
});

// F2b: las bolsas del jugador, el banco y el banco de cuenta con el Enum.BagIndex de Forever (el de /dump Enum.BagIndex en
// el juego: bolsa de componentes 5, pestañas del banco 6-14 y del de cuenta 15-23, llavero -1, sin Bank ni BankBag_n) y con
// el clásico.
const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
test('F2b: API.bolsasPropias, bolsasBanco y bolsasCuenta con el Enum.BagIndex de Forever y con el clásico', () => {
  const f = nuevaMaquina({ bolsas: 'forever' });
  assert.deepEqual(f.lua(`${API}.bolsasPropias()`), rango(0, 5), 'con la de componentes y sin el llavero');
  assert.deepEqual(f.lua(`${API}.bolsasBanco()`), rango(6, 14), 'las pestañas del personaje; nunca el -1, que es el llavero');
  assert.deepEqual(f.lua(`${API}.bolsasCuenta()`), rango(15, 23));
  // Un Forever sin pestañas en el enum: el plan B no lee el -1 (el llavero) ni cae en la 5 (la de componentes).
  f.lua('Enum.BagIndex = {Backpack = 0, Bag_1 = 1, Bag_2 = 2, Bag_3 = 3, Bag_4 = 4, ReagentBag = 5, Keyring = -1}');
  assert.deepEqual(f.lua(`${API}.bolsasBanco()`), rango(6, 11));
  assert.deepEqual(f.lua(`${API}.bolsasCuenta()`), []);
  sinErrores(f);
  f.cerrar();
  const c = nuevaMaquina();
  assert.deepEqual(c.lua(`${API}.bolsasPropias()`), rango(0, 4));
  assert.deepEqual(c.lua(`${API}.bolsasBanco()`), [-1, ...rango(5, 10)]);
  assert.deepEqual(c.lua(`${API}.bolsasCuenta()`), []);
  sinErrores(c);
  c.cerrar();
  // Sin Enum.BagIndex pero con NUM_REAGENTBAG_SLOTS: la de componentes es la que sigue a las puestas y el banco va después.
  const s = nuevaMaquina({ sinApi: ['Enum.BagIndex'] });
  s.lua('NUM_REAGENTBAG_SLOTS = 1');
  assert.deepEqual(s.lua(`${API}.bolsasPropias()`), rango(0, 5));
  assert.deepEqual(s.lua(`${API}.bolsasBanco()`), [-1, ...rango(6, 11)]);
  sinErrores(s);
});

// F2b (detalles que llegaron con la F4): los huecos de la bolsa de componentes solo admiten componentes: no cuentan en
// huecos ni en libres (la IA creería que cabe cualquier cosa, o que hay más ocupado). Van aparte, en huecosComponentes y
// libresComponentes, y cada pareja cuadra por su lado. Sus objetos sí se cuentan.
test('F2b: Inventario.bolsas cuenta los objetos de la bolsa de componentes (sus huecos y libres, aparte) y no el llavero', () => {
  const m = conLino({ bolsas: 'forever' });
  m.bolsa(5, 1, { id: 2589, n: 20 }); // la de componentes: 12 huecos, 1 ocupado
  m.huecos(-1, 4);
  m.bolsa(-1, 1, { id: 7146, n: 1 }); // una llave en el llavero
  const b = m.lua(`${INV}.bolsas()`);
  assert.deepEqual(b.objetos.map((o) => [o.id, o.n]), [[2589, 35]]);
  assert.deepEqual(b.objetos[0].b, [[0, 1], [0, 2], [5, 1]]);
  assert.deepEqual([b.huecos, b.libres], [16, 14], 'la mochila: 16 huecos, 2 ocupados');
  assert.deepEqual([b.huecosComponentes, b.libresComponentes], [12, 11], 'la de componentes, aparte: 12 huecos, 1 ocupado');
  const inv = m.lua(`${INV}.leer()`);
  assert.deepEqual([inv.huecos, inv.libres, inv.huecosComponentes, inv.libresComponentes], [16, 14, 12, 11],
    'lo mismo en lo que se manda a la IA');
  // Sin bolsa de componentes, no salen.
  const s = conLino();
  const sin = s.lua(`${INV}.leer()`);
  assert.deepEqual([sin.huecosComponentes ?? null, sin.libresComponentes ?? null], [null, null]);
  sinErrores(m);
  sinErrores(s);
});

test('F2b: Inventario.banco en Forever lee las pestañas 6 a 14 (aunque la primera no tenga bolsa), sin el llavero', () => {
  const m = nuevaMaquina({ bolsas: 'forever' });
  m.itemInfo(4306, { nombre: 'Silk Cloth', calidad: 1, nivel: 15, precio: 60 });
  m.huecos(-1, 4);
  m.bolsa(-1, 1, { id: 7146, n: 1 });
  m.bolsa(8, 1, { id: 4306, n: 7 });
  m.bolsa(14, 2, { id: 4306, n: 1 });
  m.disparar('BANKFRAME_OPENED');
  const b = m.lua(`${INV}.banco()`);
  assert.deepEqual(b.objetos.map((o) => [o.id, o.n]), [[4306, 8]]);
  assert.deepEqual(b.objetos[0].b, [[8, 1], [14, 2]]);
  sinErrores(m);
});

test('banco: BANKFRAME_OPENED lo apunta y tras recargar() sigue ahí', () => {
  const m = conLino();
  assert.equal(m.lua(`${INV}.banco()`), undefined);
  m.itemInfo(4306, { nombre: 'Silk Cloth', calidad: 1, nivel: 15, precio: 60 });
  m.bolsa(-1, 3, { id: 4306, n: 20 });
  m.bolsa(5, 1, { id: 2589, n: 40 });
  m.disparar('BANKFRAME_OPENED');
  const b = m.lua(`${INV}.banco()`);
  assert.equal(typeof b.fecha, 'number');
  assert.deepEqual(b.objetos.map((o) => [o.id, o.n]), [[4306, 20], [2589, 40]]);
  assert.deepEqual(b.objetos[1].b, [[5, 1]]);

  const r = m.recargar();
  const despues = r.lua(`${INV}.banco()`);
  assert.deepEqual(despues.objetos.map((o) => [o.id, o.n]), [[4306, 20], [2589, 40]]);
  assert.equal(despues.fecha, b.fecha);
  sinErrores(r);
});

test('banco: BAG_UPDATE_DELAYED con el banco abierto lo actualiza; cerrado no; BANKFRAME_CLOSED lo apunta y lo cierra', () => {
  const m = nuevaMaquina();
  m.itemInfo(2589, LINO);
  m.bolsa(-1, 1, { id: 2589, n: 5 });
  m.disparar('BAG_UPDATE_DELAYED'); // banco sin abrir: no se apunta
  assert.equal(m.lua(`${INV}.banco()`), undefined);
  m.disparar('BANKFRAME_OPENED');
  m.avanzar(10);
  m.bolsa(-1, 1, { id: 2589, n: 9 });
  m.disparar('BAG_UPDATE_DELAYED');
  const abierto = m.lua(`${INV}.banco()`);
  assert.equal(abierto.objetos[0].n, 9);
  assert.ok(abierto.fecha >= 1790000010);
  m.bolsa(-1, 1, { id: 2589, n: 11 });
  m.disparar('BANKFRAME_CLOSED');
  assert.equal(m.lua(`${INV}.banco()`).objetos[0].n, 11);
  m.bolsa(-1, 1, { id: 2589, n: 99 });
  m.disparar('BAG_UPDATE_DELAYED'); // ya cerrado: no cambia
  assert.equal(m.lua(`${INV}.banco()`).objetos[0].n, 11);
  sinErrores(m);
});

test('banco: si el banco no se puede leer (sin huecos), no se borra lo apuntado', () => {
  const m = nuevaMaquina();
  m.itemInfo(2589, LINO);
  m.bolsa(-1, 1, { id: 2589, n: 5 });
  m.disparar('BANKFRAME_OPENED');
  m.huecos(-1, 0);
  m.disparar('BANKFRAME_CLOSED');
  assert.equal(m.lua(`${INV}.banco()`).objetos[0].n, 5);
  sinErrores(m);
});

test('banco: al cerrar, un banco que sale vacío no sustituye a lo apuntado; con el banco abierto sí', () => {
  const m = nuevaMaquina();
  m.itemInfo(2589, LINO);
  m.bolsa(-1, 1, { id: 2589, n: 5 });
  m.disparar('BANKFRAME_OPENED');
  m.bolsa(-1, 1, undefined);
  m.disparar('BANKFRAME_CLOSED'); // el cliente ya no enseña los objetos
  assert.equal(m.lua(`${INV}.banco()`).objetos[0].n, 5);
  m.disparar('BANKFRAME_OPENED');
  m.disparar('BAG_UPDATE_DELAYED'); // abierto y de verdad vacío
  assert.deepEqual(m.lua(`${INV}.banco()`).objetos, []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// leer() y el perfil de Forever
// ---------------------------------------------------------------------------------------------------

test('leer: arma inv como P2 y el contexto lo recorta por el orden de P2', () => {
  const m = conLino({ jugador: { dinero: 12345 } });
  m.itemInfo(25, { nombre: 'Worn Shortsword', nivel: 2, estadisticas: { ITEM_MOD_STAMINA_SHORT: 1 } });
  m.equipar(16, 25);
  m.bolsa(-1, 1, { id: 2589, n: 5 });
  m.disparar('BANKFRAME_OPENED');
  const inv = m.lua(`${INV}.leer()`);
  assert.equal(inv.libres, 14);
  assert.equal(inv.huecos, 16);
  assert.equal(inv.dinero, 12345);
  assert.equal(inv.bolsas.length, 1);
  assert.equal(inv.equipo[0].id, 25);
  assert.equal(inv.banco.objetos.length, 1);
  assert.equal(typeof inv.banco.fecha, 'number');
  // Los recortes de P2 reconocen esta forma: con un tope bajo se quita el banco primero.
  const r = m.lua(`(function()
    local msg = {v = 1, ctx = {inv = ${INV}.leer()}}
    local completo = #SnetForever.JSON.codificar(msg)
    local _, cabe = SnetForever.Contexto.recortar(msg, completo - 1)
    return {cabe = cabe, recorte = msg.ctx.recorte, banco = msg.ctx.inv.banco == nil}
  end)()`);
  assert.equal(r.cabe, true);
  assert.deepEqual(r.recorte, ['inv.banco']);
  assert.equal(r.banco, true);
  sinErrores(m);
});

test('leer: sin banco apuntado no pone banco; con el perfil forever no hay errores', () => {
  const m = conLino({ forever: true });
  m.itemInfo(25, { nivel: 2, estadisticas: { ITEM_MOD_STAMINA_SHORT: 1 } });
  m.equipar(16, 25);
  const inv = m.lua(`${INV}.leer()`);
  assert.equal(inv.banco, undefined);
  assert.equal(inv.bolsas[0].n, 15);
  assert.equal(inv.equipo[0].st.ITEM_MOD_STAMINA_SHORT, 1);
  assert.equal(m.lua('rawget(_G, "GetContainerItemInfo")'), undefined);
  m.disparar('BANKFRAME_OPENED');
  m.disparar('BAG_UPDATE_DELAYED');
  m.disparar('BANKFRAME_CLOSED');
  sinErrores(m);
});

test('el inventario no vende, usa, equipa ni coge nada: solo lee', () => {
  const m = conLino();
  m.equipar(16, 25);
  m.lua(`${INV}.leer()`);
  m.disparar('BANKFRAME_OPENED');
  m.disparar('BANKFRAME_CLOSED');
  const llamadas = Object.keys(m.lua('BANCO.llamadas'));
  // «UserWaypoint» (el marcador de mapa de los pines) no es «Use»: se quita antes de mirar.
  const prohibidas = llamadas.filter((n) => /Use|Pickup|Equip|Sell|Delete|Split|Click|Buy/i.test(n.replace(/UserWaypoint/g, '')));
  assert.deepEqual(prohibidas, []);
  sinErrores(m);
});
