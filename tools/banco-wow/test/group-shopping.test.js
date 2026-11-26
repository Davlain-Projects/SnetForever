import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const SHOP = 'SnetForever.GroupShopping';
const BUY = 'SnetForever.Compra';
const SELECTED = '{Supplies=true}';
const OPEN = '{mercancias={[2589]={{quantity=4,unitPrice=100},{quantity=9,unitPrice=120},{quantity=2,unitPrice=900}}}}';

function setup(m, market = OPEN) {
  m.lua(`local S = SnetForever
    assert(S.Arbol.crear("", "Supplies"))
    assert(S.Arbol.poner("i:2589", "Supplies"))
    assert(S.Arbol.poner("i:2592::99", "Supplies"))
    assert(S.Operaciones.crear("compras", "Restock"))
    assert(S.Operaciones.poner("compras", "Restock", "precioMaximo", "800c"))
    assert(S.Operaciones.poner("compras", "Restock", "reponerCantidad", "8"))
    assert(S.Operaciones.ponerDeGrupo("Supplies", "compras", {"Restock"}))
    BANCO.jugador.dinero = 100000
    BANCO.ponerSubasta(${market})`);
  m.objeto(2589, 2);
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.5);
  m.lua('SnetForever.Escaneo.parar()');
}

function clickPurchase(m) {
  return m.lua(`(function()
    local button = CreateFrame("Button", nil, UIParent)
    local result
    button:SetScript("OnClick", function() result = SnetForever.Compra.pulsar() end)
    button:Click("LeftButton")
    return result
  end)()`);
}

function scan(m) {
  assert.equal(m.lua(`${SHOP}.start(${SELECTED})`), true);
  for (let n = 0; n < 16 && m.lua(`${SHOP}.state().status`) === 'scanning'; n++) m.avanzar(0.25);
  assert.equal(m.lua(`${SHOP}.state().status`), 'complete');
  return m.lua(`${SHOP}.state().rows`);
}

test('group shopping reads eligible prices, counts personal stock and leaves ordinary search results alone', () => {
  const m = nuevaMaquina();
  try {
    setup(m);
    const rows = scan(m);
    const eligible = rows.find(r => !r.overLimit);
    assert.equal(eligible.item, 2589);
    assert.equal(eligible.route, 'Supplies');
    assert.equal(eligible.operation, 'Restock');
    assert.equal(eligible.available, 13);
    assert.equal(eligible.quantity, 6);
    assert.equal(eligible.price, 120);
    assert.equal(eligible.total, 640);
    assert.equal(eligible.threshold, 800);
    const above = rows.find(r => r.overLimit);
    assert.equal(above.price, 900);
    assert.equal(above.quantity, 0);
    assert.equal(m.lua(`${SHOP}.summary().count`), 2);
    assert.equal(m.lua(`#${SHOP}.page(1, 1)`), 1);
    m.lua(`local copy = ${SHOP}.result(${eligible.id}); copy.price = 1; copy.key.itemID = 2`);
    assert.equal(m.lua(`${SHOP}.result(${eligible.id}).price`), 120);
    assert.equal(m.lua(`${SHOP}.result(${eligible.id}).key.itemID`), 2589);
    assert.equal(m.lua(`${SHOP}.prepare(${above.id})`), false);
    assert.equal(m.lua(`${SHOP}.state().skipped`), 1, 'unmapped imported variant is reported');
    assert.equal(m.lua('SnetForever.Busqueda.subastas(2589) == nil'), true);
    assert.equal(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase').length, 0);
    assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('shopping requires two clicks, limits quantities and consumes the completed order', () => {
  const m = nuevaMaquina();
  try {
    setup(m);
    const row = scan(m).find(r => !r.overLimit);
    assert.equal(m.lua(`${SHOP}.prepare(${row.id})`), true);
    m.avanzar(0.5);
    assert.equal(m.lua(`${BUY}.estado().fase`), 'lista');
    assert.equal(m.lua(`${BUY}.maxCantidad()`), 6);
    assert.equal(m.lua(`${BUY}.ponerCantidad(500)`), true);
    assert.equal(m.lua(`${BUY}.estado().cantidad`), 6);
    assert.equal(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase').length, 0);
    assert.equal(clickPurchase(m), true);
    m.avanzar(0.6);
    assert.equal(m.lua(`${BUY}.estado().fase`), 'confirmar');
    assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0);
    assert.equal(clickPurchase(m), true);
    m.avanzar(0.6);
    assert.deepEqual(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase'), [[2589, 6]]);
    assert.equal(m.lua(`${SHOP}.prepare(${row.id})`), false);
    m.disparar('AUCTION_HOUSE_CLOSED');
    assert.equal(m.lua(`${SHOP}.state().status`), 'stopped');
    assert.equal(m.lua(`#${SHOP}.state().rows`), 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('shopping rechecks the operation and bag count before confirming', () => {
  const m = nuevaMaquina();
  try {
    setup(m);
    const row = scan(m).find(r => !r.overLimit);
    assert.equal(m.lua(`${SHOP}.prepare(${row.id})`), true);
    m.avanzar(0.5);
    assert.equal(clickPurchase(m), true);
    m.avanzar(0.6);
    m.objeto(2589, 6);
    assert.equal(clickPurchase(m), false);
    assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0);
    m.lua('assert(SnetForever.Operaciones.poner("compras", "Restock", "precioMaximo", "50c"))');
    assert.equal(m.lua(`${SHOP}.prepare(${row.id})`), false);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('a cheaper account-owned commodity tier blocks higher picks', () => {
  const m = nuevaMaquina();
  try {
    setup(m, '{mercancias={[2589]={{quantity=4,unitPrice=100,containsAccountItem=true},{quantity=9,unitPrice=120}}}}');
    assert.equal(m.lua('type(SnetForever.Busqueda.cancelShopping)'), 'function');
    scan(m);
    assert.equal(m.lua(`#${SHOP}.state().rows`), 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('shopping excludes ignored character and house keys', () => {
  const m = nuevaMaquina({ jugador: { nombre: 'Buyer', reino: 'Normal', faccion: 'Horde' } });
  try {
    setup(m);
    const row = scan(m).find(r => !r.overLimit);
    m.lua(`local op = SnetForeverCuenta.comercio.v2.operaciones.compras.Restock
      op.ignorarPersonajes = {["Buyer-Normal"] = true}`);
    assert.equal(m.lua(`${SHOP}.prepare(${row.id})`), false);
    m.lua(`local op = SnetForeverCuenta.comercio.v2.operaciones.compras.Restock
      op.ignorarPersonajes = {}
      op.ignorarReinos = {["Normal|Horde"] = true}`);
    assert.equal(m.lua(`${SHOP}.prepare(${row.id})`), false);
    assert.equal(m.lua(`#${SHOP}.state().rows`) > 0, true, 'keeps history until the next scan');
    scan(m);
    assert.equal(m.lua(`#${SHOP}.state().rows`), 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('restock waits for observed inventory and counts the selected sources once', () => {
  const m = nuevaMaquina({ jugador: { nombre: 'Buyer', reino: 'Normal', faccion: 'Horde' }, bolsas: 'forever' });
  try {
    setup(m);
    m.lua(`local S = SnetForever
      assert(S.Operaciones.poner("compras", "Restock", "reponerCantidad", "14"))
      assert(S.Operaciones.poner("compras", "Restock", "fuentesReponer", {"alters", "banco", "subastas"}))
      S.MisSubastas.pedir = function() return true end
      S.MisSubastas.estado = function() return "lista" end
      S.MisSubastas.publicadas = function() return 1 end
      SnetForeverCuenta.comercio.inventario = {v=2, pj={
        ["Buyer-Normal"]={nombre="Buyer",reino="Normal",bolsas={[2589]=99}},
        ["Stock-Normal"]={nombre="Stock",reino="Normal",bolsas={[2589]=2},banco={[2589]=1}}}}
      S.InventarioCuenta.olvidarOrden()`);
    scan(m);
    assert.equal(m.lua(`#${SHOP}.state().rows`), 0);
    assert.equal(m.lua(`${SHOP}.state().skipped`), 2);
    m.lua(`local inv = SnetForeverCuenta.comercio.inventario
      inv.pj["Buyer-Normal"].banco = {[2589]=1}
      inv.bancoCuenta = {objetos={[2589]=1}}`);
    const eligible = scan(m).find(r => !r.overLimit);
    // Live bags 2, own bank 1, alt bags 2, alt bank 1, account bank 1, own active auction 1.
    assert.equal(eligible.quantity, 6);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('a grouped noncommodity result buys exactly one listing and never substitutes another', () => {
  const m = nuevaMaquina();
  try {
    setup(m, '{objetos={[4338]={{quantity=20,buyoutAmount=100},{quantity=1,buyoutAmount=110}}}}');
    m.lua(`local tree = SnetForever.Arbol
      assert(tree.quitar("i:2589"))
      assert(tree.poner("i:4338", "Supplies"))`);
    const eligible = scan(m).filter(r => !r.overLimit);
    assert.deepEqual(eligible.map(row => [row.price, row.quantity, row.available]), [[100, 1, 1], [110, 1, 1]]);
    const first = eligible[0];
    assert.equal(m.lua(`${SHOP}.prepare(${first.id})`), true);
    m.avanzar(0.5);
    assert.equal(m.lua(`${BUY}.maxCantidad()`), 1);
    assert.equal(clickPurchase(m), false);
    m.avanzar(0.6);
    assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 0);
    assert.equal(clickPurchase(m), true);
    m.avanzar(0.6);
    assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[first.auctionID, 100]]);
    assert.equal(m.lua(`${SHOP}.prepare(${first.id})`), false);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('the total must prove every commodity unit fits the cap, even when the average is cheap', () => {
  const m = nuevaMaquina();
  try {
    setup(m, '{mercancias={[2589]={{quantity=1,unitPrice=10},{quantity=1,unitPrice=30}}}}');
    const two = scan(m).find(r => !r.overLimit);
    assert.equal(two.quantity, 2);
    assert.equal(m.lua(`${SHOP}.prepare(${two.id})`), true);
    m.avanzar(0.5);
    assert.equal(clickPurchase(m), true);
    m.avanzar(0.6);
    assert.equal(m.lua(`${BUY}.estado().fase`), 'confirmar');
    m.lua('assert(SnetForever.Operaciones.poner("compras", "Restock", "precioMaximo", "30c"))');
    assert.equal(m.lua(`${SHOP}.quoteWithinCap(${two.id}, 2589, 2, 40, 30)`), false);
    assert.equal(m.lua(`${SHOP}.quoteWithinCap(${two.id}, 2589, 1, 30, 30)`), true);
    assert.equal(m.lua(`${BUY}.maxCantidad()`), 1);
    assert.equal(clickPurchase(m), false);
    assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0);
    const bounded = scan(m).find(r => !r.overLimit);
    assert.equal(bounded.available, 2);
    assert.equal(bounded.quantity, 1, 'the scan still offers a provably affordable quantity');
    assert.equal(bounded.price, 10);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('an unavailable bag count suppresses restock and the scan does not evaluate formulas in its click', () => {
  const m = nuevaMaquina();
  try {
    setup(m);
    m.lua(`local F = SnetForever.Formulas
      local value = F.valor
      BANCO.shoppingEvaluations = 0
      F.valor = function(...) BANCO.shoppingEvaluations = BANCO.shoppingEvaluations + 1; return value(...) end
      rawset(C_Item, "GetItemCount", function() error("bags unavailable") end)`);
    assert.equal(m.lua(`${SHOP}.start(${SELECTED})`), true);
    assert.equal(m.lua('BANCO.shoppingEvaluations'), 0);
    m.avanzar(1);
    assert.equal(m.lua(`${SHOP}.summary().status`), 'complete');
    assert.equal(m.lua(`${SHOP}.summary().count`), 0);
    assert.equal(m.lua(`${SHOP}.summary().skipped`), 2);
    sinErrores(m);
  } finally { m.cerrar(); }
});
