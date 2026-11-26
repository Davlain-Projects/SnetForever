import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const fixture = `
  local SNF = SnetForever
  local A = C_AuctionHouse
  local O = SNF.Operaciones
  BANCO.orders = {visible = true, ready = true, queries = 0, posts = 0, cancels = 0}
  local test = BANCO.orders
  for _, event in ipairs({"OWNED_AUCTIONS_UPDATED", "AUCTION_HOUSE_AUCTION_CREATED",
      "AUCTION_CANCELED", "AUCTION_HOUSE_SHOW_ERROR", "AUCTION_HOUSE_POST_ERROR", "AUCTION_MULTISELL_FAILURE"}) do
    BANCO.eventosConocidos[event] = true
  end
  SNF.Comercio.ventanaVisible = function() return test.visible end
  BANCO.jugador.dinero = 1000000
  local key = {itemID = 2589, itemLevel = 0, itemSuffix = 0, battlePetSpeciesID = 0}
  test.owned = {
    {auctionID = 59, itemKey = key, status = 0, quantity = 2, buyoutAmount = 800, timeLeftSeconds = 720},
    {auctionID = 64, itemKey = key, status = 1, quantity = 4, buyoutAmount = 1500, timeLeftSeconds = 300, bidder = "NeverPersistThisBidder"},
  }
  rawset(A, "QueryOwnedAuctions", function() test.queries = test.queries + 1 end)
  rawset(A, "HasFullOwnedAuctionResults", function() return true end)
  rawset(A, "GetNumOwnedAuctions", function() return #test.owned end)
  rawset(A, "GetOwnedAuctionInfo", function(i) return test.owned[i] end)
  rawset(A, "IsThrottledMessageSystemReady", function() return test.ready end)
  rawset(A, "CanCancelAuction", function(i) return i == 59 end)
  rawset(A, "GetCancelCost", function() return 0 end)
  rawset(A, "CancelAuction", function(i) test.cancels = test.cancels + 1; test.cancelID = i end)
  rawset(A, "GetAvailablePostCount", function() return 10 end)
  rawset(A, "CalculateCommodityDeposit", function() return 5 end)
  rawset(A, "PostCommodity", function(location, duration, quantity, price)
    test.posts = test.posts + 1
    test.posted = {quantity, price, duration}
    return false
  end)
  test.recordPost = function(id)
    local quantity, price = test.posted[1], test.posted[2]
    test.owned[#test.owned + 1] = {auctionID = id, itemKey = key, status = 0, quantity = quantity,
      buyoutAmount = quantity * price, timeLeftSeconds = 720}
  end
  assert(O.crear("subasta", "Test"))
  for field, value in pairs({precioMinimo = "100c", precioNormal = "200c", precioMaximo = "300c",
      rebaja = "0c", umbralReponer = "10c", tope = "10", reservaEnBolsas = "5"}) do
    assert(O.poner("subasta", "Test", field, value))
  end
  SNF.AuctionOrders.deBolsas = function()
    return {{id = "2589:0:0:0", item = 2589, key = key, name = "Linen", route = "", operation = "Test",
      commodity = true, count = 10, location = {}}}
  end
  SNF.Busqueda.pedirSubastas = function(_, options) return options.vender == true end
  SNF.Busqueda.subastas = function(_, mode)
    if mode == "vender" then return {}, {completa = true, pendiente = false} end
  end
`;

function scanAll(m, mode) {
  assert.equal(m.lua(`SnetForever.AuctionOrders.escanear("${mode}", function() return true end)`), true);
  m.disparar('OWNED_AUCTIONS_UPDATED');
  for (let tick = 0; tick < 4; tick++) m.avanzar(0.25);
}

test('owned auctions exclude sold entries from the posting cap and cancel only after an explicit click', () => {
  const m = nuevaMaquina();
  try {
    m.lua(fixture);
    m.lua('SnetForever.MisSubastas.pedir(); SnetForever.MisSubastas.pedir()');
    assert.equal(m.lua('BANCO.orders.queries'), 1);
    m.disparar('OWNED_AUCTIONS_UPDATED');
    assert.equal(m.lua('SnetForever.MisSubastas.publicadas(2589)'), 2);
    assert.equal(m.lua('SnetForever.MisSubastas.totales().cobreVendidas'), 1500);
    assert.equal(m.lua('SnetForever.AuctionOrders.elegir(64)'), false);
    assert.equal(m.lua('SnetForever.AuctionOrders.elegir(59)'), true);
    assert.equal(m.lua('BANCO.orders.cancels'), 0);
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    m.disparar('AUCTION_CANCELED', 999);
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    assert.deepEqual(m.lua('{BANCO.orders.cancels, BANCO.orders.cancelID}'), [1, 59]);
    m.disparar('AUCTION_CANCELED', 59);
    assert.equal(m.lua('SnetForever.MisSubastas.estado()'), 'pidiendo');
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('a low-priced commodity needs two clicks and cannot post with the window hidden', () => {
  const m = nuevaMaquina({ sinApi: ['GetItemInfo'] });
  try {
    m.itemInfo(2589, { nombre: 'Linen', precio: 500, apilado: 20 });
    m.lua(fixture);
    assert.equal(m.lua('SnetForever.AuctionOrders.escanear("post", function() return true end)'), true);
    m.disparar('OWNED_AUCTIONS_UPDATED');
    for (let i = 0; i < 4; i++) m.avanzar(0.25);
    assert.equal(m.lua('BANCO.orders.posts'), 0);
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    assert.equal(m.lua('BANCO.orders.posts'), 0);
    m.avanzar(0.6);
    m.lua('BANCO.orders.visible = false');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    m.lua('BANCO.orders.visible = true');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    assert.deepEqual(m.lua('BANCO.orders.posted'), [5, 200, 2]);
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    m.disparar('AUCTION_HOUSE_AUCTION_CREATED', 140);
    assert.equal(m.lua('select(3, SnetForever.AuctionOrders.estado())'), true, 'the event alone is not proof');
    m.lua('BANCO.orders.recordPost(140)');
    m.disparar('OWNED_AUCTIONS_UPDATED');
    m.avanzar(0.05);
    assert.equal(m.lua('select(3, SnetForever.AuctionOrders.estado())'), false);
    assert.equal(m.lua('BANCO.orders.posts'), 1);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('ordered publishing rechecks each displayed partial quantity and owns its acknowledged units', () => {
  const m = nuevaMaquina();
  try {
    m.itemInfo(2589, { nombre: 'Linen', precio: 50, apilado: 20 });
    m.lua(fixture);
    m.lua(`
      local s = SnetForever
      assert(s.Operaciones.poner("subasta", "Test", "tope", "6"))
      assert(s.Operaciones.poner("subasta", "Test", "reservaEnBolsas", "1"))
      assert(s.Operaciones.duplicar("subasta", "Test", "Second"))
      assert(s.Operaciones.poner("subasta", "Second", "tope", "9"))
      local original = s.AuctionOrders.deBolsas
      s.AuctionOrders.deBolsas = function()
        local bags = original()
        bags[1].others = {"Second"}
        return bags
      end
      BANCO.orders.limit = 4
      rawset(C_AuctionHouse, "GetAvailablePostCount", function() return BANCO.orders.limit end)
      s.MisSubastas.publicadas = function() return 2 end
      assert(s.AuctionOrders.escanear("post", function() return true end))`);
    m.disparar('OWNED_AUCTIONS_UPDATED');
    for (let tick = 0; tick < 4; tick++) m.avanzar(0.25);
    const queue = m.lua('(function() local task = SnetForever.AuctionOrders.estado(); return task.rows end)()');
    assert.deepEqual(queue.map(row => [row.operation, row.remaining]), [['Test', 4], ['Second', 3]]);
    assert.notEqual(queue[0].id, queue[1].id);
    m.lua(`
      local orders = SnetForever.AuctionOrders
      local _, row = orders.estado()
      BANCO.orders.quote = orders.postQuote(row)
      BANCO.orders.limit = 2
      orders.confirmAction(BANCO.orders.quote)`);
    assert.equal(m.lua('BANCO.orders.posts'), 0, 'the old four-unit quote cannot post a changed amount');

    let nextID = 140;
    function postAndAcknowledge(quantity) {
      assert.equal(m.lua(`(function()
        local orders = SnetForever.AuctionOrders
        local _, row = orders.estado()
        local quote = orders.postQuote(row)
        return quote.quantity == ${quantity} and orders.confirmAction(quote)
      end)()`), true);
      assert.equal(m.lua('BANCO.orders.posted[1]'), quantity);
      const id = nextID++;
      m.disparar('AUCTION_HOUSE_AUCTION_CREATED', id);
      m.lua(`BANCO.orders.recordPost(${id})`);
      m.disparar('OWNED_AUCTIONS_UPDATED');
      m.avanzar(0.05);
      assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false, 'a fast second click cannot publish');
      m.avanzar(0.6);
    }
    postAndAcknowledge(2);
    postAndAcknowledge(2);
    // The fake server continues to report two active units. Four more have
    // been acknowledged by the game. A revised cap of seven leaves room for one.
    m.lua('assert(SnetForever.Operaciones.poner("subasta", "Second", "tope", "7"))');
    postAndAcknowledge(1);
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    assert.equal(m.lua('BANCO.orders.posts'), 3);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('rescanning before a bag update preserves the reserve from a confirmed post', () => {
  const m = nuevaMaquina();
  try {
    m.itemInfo(2589, { nombre: 'Linen', precio: 50, apilado: 20 });
    m.lua(fixture);
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    assert.equal(m.lua('BANCO.orders.posted[1]'), 5);
    m.disparar('AUCTION_HOUSE_AUCTION_CREATED', 140);
    m.lua('BANCO.orders.recordPost(140)');
    m.disparar('OWNED_AUCTIONS_UPDATED');
    m.avanzar(0.6);
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    assert.equal(m.lua('BANCO.orders.posts'), 1);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('the cancel scan keeps one owned auction and the first operation that permits cancellation', () => {
  const m = nuevaMaquina();
  try {
    m.lua(fixture);
    m.lua(`
      local s = SnetForever
      assert(s.Operaciones.duplicar("subasta", "Test", "Cancel"))
      assert(s.Operaciones.duplicar("subasta", "Cancel", "Later"))
      assert(s.Operaciones.poner("subasta", "Test", "cancelarRebajadas", false))
      assert(s.Operaciones.poner("subasta", "Test", "cancelarParaSubir", false))
      assert(s.Operaciones.ponerDeGrupo("", "subasta", {"Test", "Cancel", "Later"}))
      local listing = s.MisSubastas.lista
      s.MisSubastas.lista = function()
        local rows = listing()
        if rows[1] then rows[#rows + 1] = rows[1] end
        return rows
      end
      s.Busqueda.subastas = function()
        return {{precioUnidad = 150, cantidad = 2}}, {completa = true, pendiente = false}
      end
      assert(s.AuctionOrders.escanear("cancel", function() return true end))`);
    m.disparar('OWNED_AUCTIONS_UPDATED');
    for (let tick = 0; tick < 4; tick++) m.avanzar(0.25);
    const decision = m.lua(`(function()
      local task, row = SnetForever.AuctionOrders.estado()
      return {#task.rows, row.auctionID, row.operation, row.draft.motivo, row.draft.masBarata}
    end)()`);
    assert.deepEqual(decision, [1, 59, 'Cancel', 'rebajada', 150]);
    assert.equal(m.lua('BANCO.orders.cancels'), 0);
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    m.disparar('AUCTION_CANCELED', 59);
    m.disparar('OWNED_AUCTIONS_UPDATED');
    m.avanzar(0.6);
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    assert.deepEqual(m.lua('{BANCO.orders.cancels, BANCO.orders.cancelID}'), [1, 59]);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('changed posting rules invalidate existing confirmation even under the same operation name', () => {
  const m = nuevaMaquina();
  try {
    m.itemInfo(2589, { nombre: 'Linen', precio: 500, apilado: 20 });
    m.lua(fixture);
    for (const [field, value] of [['precioMinimo', '125c'], ['pujaPorcentaje', 50], ['duracion', '48']]) {
      scanAll(m, 'post');
      assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true, 'the old quote showed a low-price warning');
      m.avanzar(0.6);
      m.lua(`assert(SnetForever.Operaciones.poner("subasta", "Test", "${field}", ${JSON.stringify(value)}))`);
      assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false, field);
    }
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    m.avanzar(0.6);
    m.itemInfo(2589, { nombre: 'Linen', precio: 1000, apilado: 20 });
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false, 'vendor warning reference changed');
    assert.equal(m.lua('BANCO.orders.posts'), 0);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('changing an earlier or selected cancellation rule requires a new scan', () => {
  const m = nuevaMaquina();
  try {
    m.lua(fixture);
    m.lua(`
      local s = SnetForever
      assert(s.Operaciones.duplicar("subasta", "Test", "Later"))
      assert(s.Operaciones.poner("subasta", "Test", "cancelarRebajadas", false))
      assert(s.Operaciones.ponerDeGrupo("", "subasta", {"Test", "Later"}))
      s.Busqueda.subastas = function()
        return {{precioUnidad = 150}}, {completa = true, pendiente = false}
      end`);
    scanAll(m, 'cancel');
    assert.equal(m.lua('(select(2, SnetForever.AuctionOrders.estado())).operation'), 'Later');
    m.lua('assert(SnetForever.Operaciones.poner("subasta", "Test", "cancelarRebajadas", true))');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    scanAll(m, 'cancel');
    assert.equal(m.lua('(select(2, SnetForever.AuctionOrders.estado())).operation'), 'Test');
    m.lua('assert(SnetForever.Operaciones.poner("subasta", "Test", "cancelarRebajadas", false))');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    assert.equal(m.lua('BANCO.orders.cancels'), 0);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('a delayed created event cannot consume a new queue after closing the auction', () => {
  const m = nuevaMaquina();
  try {
    m.itemInfo(2589, { nombre: 'Linen', precio: 50, apilado: 20 });
    m.lua(fixture);
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    m.lua(`BANCO.orders.visible = false; SnetForever.AuctionOrders.parar(); SnetForever.MisSubastas.parar()`);
    const queries = m.lua('BANCO.orders.queries');
    m.disparar('AUCTION_HOUSE_AUCTION_CREATED', 140);
    m.avanzar(0.3);
    assert.equal(m.lua('BANCO.orders.queries'), queries, 'no request is sent while closed');
    assert.equal(m.lua('SnetForever.AuctionOrders.postUnverified()'), true);
    assert.equal(m.lua('#(BANCO.eventos.AUCTION_HOUSE_AUCTION_CREATED or {})'), 0);
    m.lua('BANCO.orders.visible = true');
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false, 'no post while the previous outcome is unknown');
    // Reopening after the event was lost can still reconcile one exact newly owned listing.
    m.lua('BANCO.orders.recordPost(140)');
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.postUnverified()'), false);
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false, 'the previous post consumed the units above the reserve');
    m.lua('assert(SnetForever.Operaciones.poner("subasta", "Test", "reservaEnBolsas", "0"))');
    scanAll(m, 'post');
    const remaining = m.lua('(select(2, SnetForever.AuctionOrders.estado())).remaining');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    m.disparar('AUCTION_HOUSE_AUCTION_CREATED', 140);
    m.avanzar(0.05);
    assert.equal(m.lua('select(3, SnetForever.AuctionOrders.estado())'), true, 'a repeated old ID is ignored');
    m.disparar('AUCTION_HOUSE_AUCTION_CREATED', 141);
    m.lua('BANCO.orders.recordPost(141); BANCO.orders.owned[#BANCO.orders.owned].buyoutAmount = 17');
    m.disparar('OWNED_AUCTIONS_UPDATED');
    m.avanzar(0.05);
    assert.equal(m.lua('(select(2, SnetForever.AuctionOrders.estado())).remaining'), remaining, 'wrong proceeds cannot settle the new post');
    m.disparar('AUCTION_HOUSE_AUCTION_CREATED', 142);
    m.lua('BANCO.orders.recordPost(142)');
    m.disparar('OWNED_AUCTIONS_UPDATED');
    m.avanzar(0.05);
    assert.equal(m.lua('select(3, SnetForever.AuctionOrders.estado())'), false, 'exactly matching owned entry settles the post');
    assert.equal(m.lua('BANCO.orders.posts'), 2);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('a local rejection can retry after a new scan but a timed-out post keeps a reconciliation barrier', () => {
  const m = nuevaMaquina();
  try {
    m.itemInfo(2589, { nombre: 'Linen', precio: 50, apilado: 20 });
    m.lua(fixture);
    m.lua(`local send = C_AuctionHouse.PostCommodity
      rawset(C_AuctionHouse, "PostCommodity", function()
        rawset(C_AuctionHouse, "PostCommodity", send)
        error("rejected locally")
      end)`);
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    assert.equal(m.lua('SnetForever.AuctionOrders.postUnverified()'), false);
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    m.disparar('AUCTION_HOUSE_POST_ERROR');
    assert.equal(m.lua('SnetForever.AuctionOrders.postUnverified()'), false, 'a known server rejection is retryable');
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), true);
    m.avanzar(15.5);
    assert.equal(m.lua('SnetForever.AuctionOrders.postUnverified()'), true);
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    m.lua('BANCO.orders.recordPost(140); BANCO.orders.recordPost(141)');
    scanAll(m, 'post');
    assert.equal(m.lua('SnetForever.AuctionOrders.postUnverified()'), true, 'two possible owned matches remain ambiguous');
    assert.equal(m.lua('SnetForever.AuctionOrders.confirmAction()'), false);
    assert.equal(m.lua('BANCO.orders.posts'), 2);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('the selling tab prepares bag items and posts only from the visible action button', () => {
  const m = nuevaMaquina();
  try {
    m.itemInfo(2589, { nombre: 'Linen', precio: 50, apilado: 20 });
    m.lua(fixture);
    m.disparar('AUCTION_HOUSE_SHOW');
    m.avanzar(0.5);
    m.lua(`SnetForever.SubastaVentana.elegir("subasta")
      local panel = SnetForever.SubastaVentana.marcos.paginas.subasta
      panel.bags:marcarTodo(true)
      panel.postBags:Click("LeftButton")`);
    m.disparar('OWNED_AUCTIONS_UPDATED');
    for (let i = 0; i < 5; i++) m.avanzar(0.3);
    assert.equal(m.lua('BANCO.orders.posts'), 0);
    const action = 'SnetForever.SubastaVentana.marcos.paginas.subasta.action';
    assert.equal(m.lua(`${action}.snfApagado`), true);
    m.lua('BANCO.orders.ready = false; SnetForever.Escaneo.parar(); SnetForever.emitir("SNF_COMERCIO_ESCANEO")');
    assert.equal(m.lua(`${action}.snfApagado`), true);
    m.lua(`local rows = SnetForever.SubastaVentana.marcos.paginas.subasta.queue
      local setRows = rows.poner
      BANCO.orders.queuePaints = 0
      rows.poner = function(self, ...)
        BANCO.orders.queuePaints = BANCO.orders.queuePaints + 1
        return setRows(self, ...)
      end
      BANCO.orders.ready = true`);
    m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
    assert.equal(m.lua(`${action}.snfApagado`), false);
    assert.equal(m.lua('BANCO.orders.posts'), 0, 'readiness alone does not post');
    assert.equal(m.lua('BANCO.orders.queuePaints'), 0, 'readiness keeps the rendered queue');
    m.lua(`${action}:Click("LeftButton")`);
    const state = m.lua(`(function()
      local S = SnetForever
      local task, row, waiting = S.AuctionOrders.estado()
      return {visible = ${action}:IsVisible(), search = S.Busqueda.ocupada(),
        scan = S.Escaneo.enCamino(), owned = S.MisSubastas.estado(), issue = row and row.issue,
        waiting = waiting, low = row and row.draft.confirmar ~= nil, time = GetTime(), gold = GetMoney()}
    end)()`);
    assert.deepEqual(m.lua('BANCO.orders.posted'), [5, 200, 2], JSON.stringify(state));
    m.disparar('AUCTION_HOUSE_CLOSED');
    assert.equal(m.lua('#(BANCO.eventos.AUCTION_HOUSE_THROTTLED_SYSTEM_READY or {})'), 0,
      'closing the auction releases the readiness listener');
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('invoice history deduplicates reopened mail and omits the counterparty', () => {
  const m = nuevaMaquina({ jugador: { nombre: 'Owner', reino: 'Normal', faccion: 'Horde' } });
  try {
    m.lua(`
      rawset(_G, "GetInboxNumItems", function() return 2 end)
      rawset(_G, "GetInboxHeaderInfo", function() return nil, nil, nil, "Sold", 892, 0, 29 end)
      rawset(_G, "GetInboxInvoiceInfo", function()
        return "seller", "Wool Cloth", "NeverPersistThisBuyer", 930, 930, 8, 46, 0, 0, 0, 5
      end)
    `);
    m.disparar('MAIL_SHOW');
    m.disparar('MAIL_INBOX_UPDATE');
    m.disparar('MAIL_CLOSED');
    m.disparar('MAIL_SHOW');
    assert.equal(m.lua('#SnetForever.Contabilidad.lista()'), 2);
    const totals = m.lua('SnetForever.Contabilidad.totales()');
    assert.deepEqual([totals.sold, totals.gross, totals.deposits, totals.fees, totals.received], [10, 1860, 16, 92, 1784]);
    assert.doesNotMatch(JSON.stringify(m.lua('SnetForeverCuenta.comercio.ledger')), /NeverPersistThisBuyer/);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});
