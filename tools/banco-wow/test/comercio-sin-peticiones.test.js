// F13: sin nuestra ventana de subasta a la vista, el addon no manda NINGUNA petición a la subasta. Vale con la vista de TSM,
// con la de Blizzard (también guardada, con nuestra ventana sin salir nunca) y con la subasta cerrada. La única excepción es
// un solo CancelCommoditiesPurchase que libera una compra a medias al esconderse; nada se confirma nunca por ese camino.
// Todas las funciones de C_AuctionHouse que no son de solo lectura se cuentan aquí, las del banco y las del cliente que el
// banco no imita (ENVIOS), para que una nueva no se escape.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const COMERCIO = join(RAIZ, 'addons', 'SnetForever_Comercio');

// Las del cliente que envían algo, las imite el banco o no.
const ENVIOS = ['SendSearchQuery', 'SendSellSearchQuery', 'SendBrowseQuery', 'RequestMoreBrowseResults',
  'RefreshCommoditySearchResults', 'RefreshItemSearchResults', 'RequestMoreCommoditySearchResults',
  'RequestMoreItemSearchResults', 'RequestOwnedAuctionBidderInfo', 'QueryOwnedAuctions', 'QueryBids', 'ReplicateItems',
  'SearchForFavorites', 'SearchForItemKeys', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase',
  'CancelCommoditiesPurchase', 'PlaceBid', 'CancelAuction', 'PostItem', 'PostCommodity', 'ConfirmPostItem', 'ConfirmPostCommodity', 'SetFavoriteItem',
  'CloseAuctionHouse'];
const SOLO_LECTURA = /^(Get|Has|Is|Make|Can)/;
// Las únicas que el addon puede llamar. Una nueva tiene que pasar por la puerta y añadirse aquí.
const USADAS = new Set(['ReplicateItems', 'SendBrowseQuery', 'RequestMoreBrowseResults', 'SendSearchQuery',
  'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase', 'CancelCommoditiesPurchase', 'PlaceBid', 'CloseAuctionHouse', 'QueryOwnedAuctions',
  'CancelAuction', 'PostItem', 'PostCommodity', 'ConfirmPostItem', 'ConfirmPostCommodity']);

const PREVIO = `
BANCO.eventosConocidos.OWNED_AUCTIONS_UPDATED = true
rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent))
AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100)
AuctionHouseFrame.Tabs = {}; AuctionHouseFrame:EnableMouse(true)
rawset(_G, "REG", {}); rawset(_G, "AJENO", false); rawset(_G, "CONTADAS", {})
local nombres = {${ENVIOS.map((n) => `"${n}"`).join(',')}}
for n, f in pairs(C_AuctionHouse) do
  if type(f) == "function" and not string.find(n, "^Get") and not string.find(n, "^Has") and not string.find(n, "^Is")
    and not string.find(n, "^Make") and not string.find(n, "^Can[^c]") then
    nombres[#nombres + 1] = n
  end
end
for _, n in ipairs(nombres) do
  if not CONTADAS[n] then
    CONTADAS[n] = true
    local o = rawget(C_AuctionHouse, n)
    rawset(C_AuctionHouse, n, function(...)
      REG[#REG + 1] = {n = n, t = GetTime(), ajeno = rawget(_G, "AJENO") == true}
      if o then return o(...) end
    end)
  end
end`;

// Como lo hace TSM (LibTSMWoW: Move.SetDefaultUIOffScreen y SetScale(0.001)).
const TSM_PON = 'local f = AuctionHouseFrame; f:ClearAllPoints(); f:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 100000, 100000); f:SetScale(0.001)';
const TSM_QUITA = 'local f = AuctionHouseFrame; f:SetScale(1); f:ClearAllPoints(); f:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100)';
const CLAVE = '{itemID = 2589, itemLevel = 0, itemSuffix = 0, battlePetSpeciesID = 0}';
// La búsqueda de cancelar de TSM y sus respuestas.
const TSM_BUSCA = `AJENO = true
  C_AuctionHouse.QueryOwnedAuctions({})
  C_AuctionHouse.SendSellSearchQuery(${CLAVE}, {}, true)
  C_AuctionHouse.SendSearchQuery(${CLAVE}, {}, true)
  C_AuctionHouse.SendBrowseQuery({searchString = "", sorts = {}, filters = {}, itemClassFilters = {}})
  AJENO = false`;
const TSM_LLEGA = `BANCO.disparar("OWNED_AUCTIONS_UPDATED")
  BANCO.disparar("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED")
  BANCO.disparar("AUCTION_HOUSE_BROWSE_RESULTS_ADDED", {})
  BANCO.disparar("ITEM_SEARCH_RESULTS_UPDATED", ${CLAVE})
  BANCO.disparar("COMMODITY_SEARCH_RESULTS_UPDATED", 2589)
  BANCO.disparar("AUCTION_HOUSE_THROTTLED_SYSTEM_READY")`;

const VENTANA = 'SnetForever.UIComercio.marco()';
const VISIBLE = 'SnetForever.Comercio.ventanaVisible()';
const FILA = '{quantity = 5, unitPrice = 100, numOwnerItems = 0, containsOwnerItem = false, containsAccountItem = false}';

function maquina({ filas = 2000 } = {}) {
  const m = crearMaquina({ jugador: { reino: 'Normal', faccion: 'Horde' }, previo: PREVIO });
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.lua(`BANCO.jugador.dinero = 10000000
    local f = {}; for i = 1, ${filas} do f[i] = {itemID = 3000 + i, totalQuantity = 1, minPrice = 100} end
    BANCO.ponerSubasta({navegar = f, porPagina = 5, mercancias = {[2589] = {${FILA}}}})`);
  return m;
}

const marca = (m) => m.lua('#REG');
const propios = (m, desde) => (m.lua('REG') || []).slice(desde).filter((r) => !r.ajeno).map((r) => r.n);
const cuantas = (lista, nombre) => lista.filter((n) => n === nombre).length;

// Pasan `segundos` con TSM buscando cada 5 s y sus respuestas llegando: todos los temporizadores nuestros vencen.
function pasar(m, segundos = 60, conTsm = true) {
  for (let s = 0; s < segundos; s += 5) {
    if (conTsm) m.lua(TSM_BUSCA);
    m.avanzar(0.1);
    if (conTsm) m.lua(TSM_LLEGA);
    m.avanzar(4.9);
  }
}

function sinNada(m, desde, que) {
  assert.deepEqual(propios(m, desde), [], `${que}: ninguna petición nuestra`);
  sinErrores(m);
}

// Deja una mercancía «por confirmar»: el jugador ha pulsado Comprar y el juego ya ha dado el precio.
function compraPorConfirmar(m) {
  m.lua('SnetForever.Escaneo.parar(); SnetForever.Compra.elegir({item = 2589, precio = 100, cantidad = 1})');
  m.avanzar(0.2);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  assert.equal(m.lua('SnetForever.CantidadComercio.abrir()'), true);
  m.avanzar(0.6);
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()');
  m.avanzar(0.2);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'confirmar');
}

const CAMBIOS = [
  ['TSM', (m) => m.lua(TSM_PON)],
  ['Blizzard', (m) => m.lua('SnetForever.UIComercio.ponerVista("blizzard")')],
];

test('con TSM delante desde el inicio no se manda nada', () => {
  const ordenes = [
    (m) => { m.lua(TSM_PON); m.disparar('AUCTION_HOUSE_SHOW'); },
    (m) => { m.disparar('AUCTION_HOUSE_SHOW'); m.lua(TSM_PON); },
    (m) => { m.disparar('AUCTION_HOUSE_SHOW'); m.avanzar(0.05); m.lua(TSM_PON); },
  ];
  for (const orden of ordenes) {
    const m = maquina();
    orden(m);
    pasar(m);
    sinNada(m, 0, 'TSM desde el inicio');
    assert.equal(m.lua(VISIBLE), false);
  }
});

test('de nuestra ventana a TSM o a Blizzard: tras el cambio, cero peticiones, también con los temporizadores vencidos', () => {
  for (const [nombre, cambiar] of CAMBIOS) {
    const m = maquina();
    m.disparar('AUCTION_HOUSE_SHOW');
    m.avanzar(1.5); // el escaneo ya ha enviado y tiene sus plazos en marcha
    assert.ok(propios(m, 0).length > 0, 'con la ventana a la vista sí escanea');
    cambiar(m);
    const desde = marca(m);
    pasar(m, 120);
    sinNada(m, desde, nombre);
    assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'parado');
    assert.equal(m.lua('SnetForever.Escaneo.motivo()'), 'otro');
  }
});

test('con la vista de Blizzard guardada y nuestra ventana sin salir, cero peticiones', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioVista", "blizzard")');
  m.disparar('AUCTION_HOUSE_SHOW');
  pasar(m);
  sinNada(m, 0, 'vista de Blizzard guardada');
  assert.equal(m.lua(`${VENTANA}:IsShown()`), false);
});

test('con la subasta cerrada, cero peticiones', () => {
  const m = maquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(1.5);
  m.disparar('AUCTION_HOUSE_CLOSED');
  const desde = marca(m);
  assert.equal(m.lua(VISIBLE), false);
  pasar(m, 60, false);
  sinNada(m, desde, 'subasta cerrada');
});

test('una búsqueda nuestra a medias se suelta al esconderse', () => {
  for (const [nombre, cambiar] of CAMBIOS) {
    const m = maquina();
    m.disparar('AUCTION_HOUSE_SHOW');
    m.avanzar(0.1);
    m.lua('SnetForever.Escaneo.parar(); SnetForever.Busqueda.buscar("lino")');
    m.avanzar(0.5);
    assert.equal(m.lua('SnetForever.Busqueda.estado()'), 'buscando');
    cambiar(m);
    const desde = marca(m);
    assert.equal(m.lua('SnetForever.Busqueda.estado()'), 'completa', 'lo recibido se queda');
    assert.equal(m.lua('SnetForever.Busqueda.motivo()'), 'parada');
    pasar(m);
    sinNada(m, desde, nombre);
  }
});

test('unas subastas y una lectura pendientes se sueltan al esconderse, sin reintentos', () => {
  const m = maquina({ filas: 3 });
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.1);
  m.lua('SnetForever.Escaneo.parar(); SnetForever.Busqueda.buscar("lino")');
  m.avanzar(1);
  assert.equal(m.lua('SnetForever.Busqueda.estado()'), 'completa');
  m.lua('BANCO.ponerSubasta({lista = false})'); // el sistema ocupado: las dos se quedan esperando a salir
  m.lua(`SnetForever.Busqueda.pedirSubastas(2589); SnetForever.Busqueda.pedirSubastas(3001, {leer = true})`);
  m.lua(TSM_PON);
  m.lua('BANCO.ponerSubasta({lista = true})');
  const desde = marca(m);
  assert.equal(m.lua('SnetForever.Busqueda.leyendo()'), false, 'la lectura se ha soltado');
  pasar(m, 40, false);
  sinNada(m, desde, 'subastas y lectura');
  assert.equal(m.lua('SnetForever.Busqueda.ocupada()'), false);
});

test('con la ventana escondida, la búsqueda, las subastas, el sniper y la compra no aceptan nada', () => {
  const m = maquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(1.5);
  m.lua(TSM_PON);
  const desde = marca(m);
  assert.equal(m.lua('SnetForever.Busqueda.buscar("lino")'), false);
  assert.equal(m.lua('SnetForever.Busqueda.pedirSubastas(2589)'), false);
  assert.equal(m.lua('SnetForever.Busqueda.pedirSubastas(2589, {leer = true})'), false);
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), false);
  assert.equal(m.lua('SnetForever.Sniper.reiniciar()'), false);
  assert.equal(m.lua('SnetForever.Compra.elegir({item = 2589, precio = 100, cantidad = 1})'), false);
  assert.equal(m.lua('SnetForever.Compra.pulsar()'), false);
  m.lua('SnetForever.Escaneo.iniciar()');
  pasar(m, 30, false);
  sinNada(m, desde, 'llamadas con la ventana escondida');
  assert.equal(m.lua('SnetForever.Compra.estado() == nil'), true);
});

test('el sniper activo se para al esconderse y no vuelve solo', () => {
  for (const [nombre, cambiar] of CAMBIOS) {
    const m = maquina({ filas: 20 });
    m.disparar('AUCTION_HOUSE_SHOW');
    m.avanzar(5);
    assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
    m.avanzar(1);
    assert.ok(propios(m, 0).includes('SendBrowseQuery'));
    cambiar(m);
    const desde = marca(m);
    assert.equal(m.lua('SnetForever.Sniper.activo()'), false, nombre);
    pasar(m, 120);
    sinNada(m, desde, nombre);
    // Al volver, el sniper sigue parado: lo arranca el jugador.
    if (nombre === 'TSM') {
      m.lua(TSM_QUITA);
      m.lua(`${VENTANA}.pestanaSnet:Click()`);
    } else {
      m.lua('SnetForever.UIComercio.ponerVista("snet")');
    }
    m.avanzar(30);
    assert.equal(m.lua(VISIBLE), true);
    assert.equal(m.lua('SnetForever.Sniper.activo()'), false, 'no se relanza solo');
    sinErrores(m);
  }
});

test('una compra a medias se libera con una sola cancelación y nunca se confirma', () => {
  for (const [nombre, cambiar] of CAMBIOS) {
    const m = maquina({ filas: 3 });
    m.disparar('AUCTION_HOUSE_SHOW');
    m.avanzar(2);
    compraPorConfirmar(m);
    assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
    const desde = marca(m);
    cambiar(m);
    assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false, 'el cuadro de cantidad se cierra');
    assert.equal(m.lua('SnetForever.Compra.estado() == nil'), true, 'la compra se abandona');
    pasar(m, 90);
    const lista = propios(m, desde);
    assert.deepEqual(lista, ['CancelCommoditiesPurchase'], `${nombre}: solo una cancelación`);
    assert.equal(cuantas(propios(m, 0), 'ConfirmCommoditiesPurchase'), 0);
    sinErrores(m);
  }
});

test('una compra esperando su precio también se libera con una sola cancelación', () => {
  const m = maquina({ filas: 3 });
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(2);
  m.lua('SnetForever.Escaneo.parar(); SnetForever.Compra.elegir({item = 2589, precio = 100, cantidad = 1})');
  m.avanzar(0.2);
  m.lua('SnetForever.CantidadComercio.abrir()');
  m.avanzar(0.6);
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()'); // Start sale; su precio aún no ha llegado
  assert.equal(m.lua('SnetForever.Compra.estado().esperando'), 'precio');
  const desde = marca(m);
  m.lua(TSM_PON);
  m.avanzar(30);
  assert.deepEqual(propios(m, desde), ['CancelCommoditiesPurchase']);
  assert.equal(cuantas(propios(m, 0), 'ConfirmCommoditiesPurchase'), 0);
  sinErrores(m);
});

test('una compra elegida sin pedir nada al juego se suelta sin ninguna cancelación', () => {
  const m = maquina({ filas: 3 });
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(2);
  m.lua('SnetForever.Escaneo.parar(); SnetForever.Compra.elegir({item = 2589, precio = 100, cantidad = 1})');
  m.avanzar(0.2);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  const desde = marca(m);
  m.lua(TSM_PON);
  assert.equal(m.lua('SnetForever.Compra.estado() == nil'), true);
  m.avanzar(30);
  sinNada(m, desde, 'compra lista');
});

test('una compra esperando al sistema no sale cuando el sistema se libera con la ventana escondida', () => {
  const m = maquina({ filas: 3 });
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(2);
  m.lua('SnetForever.Escaneo.parar(); BANCO.ponerSubasta({lista = false})');
  m.lua('SnetForever.Compra.elegir({item = 2589, precio = 100, cantidad = 1})');
  const desde = marca(m);
  m.lua(TSM_PON);
  m.lua('BANCO.ponerSubasta({lista = true}); BANCO.disparar("AUCTION_HOUSE_THROTTLED_SYSTEM_READY")');
  m.avanzar(15);
  sinNada(m, desde, 'compra esperando al sistema');
});

test('una compra ya confirmada se sigue hasta el final, pero no elige sola la siguiente con la ventana escondida', () => {
  const m = maquina({ filas: 3 });
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(2);
  compraPorConfirmar(m);
  m.avanzar(0.6);
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()'); // el clic del jugador en Confirmar
  assert.equal(m.lua('SnetForever.Compra.estado().esperando'), 'compra');
  m.lua('SnetForever.Ajustes.set("comercioSiguienteSola", true)');
  m.lua(`SnetForever.UIComercio.fila = function(i)
    if i == 1 then return {item = 4306, precio = 100, cantidad = 1, buena = true} end
  end`);
  const desde = marca(m);
  m.lua(TSM_PON);
  assert.equal(m.lua('SnetForever.Compra.estado().esperando'), 'compra', 'lo pedido al servidor no se abandona');
  m.disparar('COMMODITY_PURCHASE_SUCCEEDED');
  m.avanzar(30);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'hecho');
  sinNada(m, desde, 'siguiente fila');
});

test('una búsqueda ajena y sus respuestas no provocan ninguna petición nuestra', () => {
  const m = maquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(1.5); // con el escaneo a medias
  m.lua(TSM_PON);
  const desde = marca(m);
  // Con pausas más largas que la calma del escaneo y del sniper: es cuando volverían a buscar.
  for (let i = 0; i < 4; i++) {
    m.lua(TSM_BUSCA);
    m.avanzar(0.1);
    m.lua(TSM_LLEGA);
    m.avanzar(25);
  }
  sinNada(m, desde, 'búsqueda ajena');
  assert.ok(m.lua('REG').slice(desde).some((r) => r.ajeno), 'la búsqueda ajena sí ha pasado');
});

test('al volver a nuestra ventana el escaneo se relanza y todo funciona como antes', () => {
  const m = maquina({ filas: 200 });
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(1.5);
  m.lua(TSM_PON);
  m.avanzar(5);
  assert.equal(m.lua('SnetForever.Escaneo.motivo()'), 'otro');
  const desde = marca(m);
  m.lua(TSM_QUITA);
  assert.deepEqual(propios(m, desde), [], 'solo sale la pestaña: no arranca nada todavía');
  m.lua(`${VENTANA}.pestanaSnet:Click()`);
  assert.equal(m.lua(VISIBLE), true);
  assert.ok(propios(m, desde).length > 0, 'el escaneo se relanza');
  m.avanzar(40);
  assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'completo');
  // Y lo demás responde como siempre.
  assert.equal(m.lua('SnetForever.Busqueda.buscar("lino")'), true);
  m.avanzar(2);
  assert.equal(m.lua('SnetForever.Busqueda.estado()'), 'completa');
  assert.equal(m.lua('SnetForever.Compra.elegir({item = 2589, precio = 100, cantidad = 1})'), true);
  m.avanzar(0.2);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  sinErrores(m);
});

test('con la ventana escondida los datos conservan la hora a la que se leyeron: nada parece más nuevo', () => {
  const m = maquina({ filas: 20 });
  m.lua('SnetForeverCuenta.comercio = SnetForeverCuenta.comercio or {}; SnetForeverCuenta.comercio.ultimaReplica = GetServerTime()');
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(5);
  assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'completo');
  const hora = m.lua('SnetForever.Escaneo.datos()[3001].hora');
  const replica = m.lua('SnetForeverCuenta.comercio.ultimaReplica');
  assert.equal(typeof hora, 'number');
  m.lua(TSM_PON);
  pasar(m, 120);
  assert.equal(m.lua('SnetForever.Escaneo.datos()[3001].hora'), hora, 'la hora del dato no cambia');
  assert.equal(m.lua('SnetForeverCuenta.comercio.ultimaReplica'), replica);
  sinErrores(m);
});

test('la puerta: «a la vista» no vale con la subasta cerrada, ni en un padre oculto, ni justo al abrir', () => {
  const m = maquina({ filas: 20 });
  assert.equal(m.lua(VISIBLE), false, 'sin abrir');
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(m.lua(`${VENTANA}:IsShown()`), true);
  assert.equal(m.lua(VISIBLE), false, 'justo al abrir, aún velada: TSM puede quedársela en este fotograma');
  assert.equal(m.lua('SnetForever.Busqueda.buscar("lino")'), false);
  assert.deepEqual(propios(m, 0), []);
  m.avanzar(0.2);
  assert.equal(m.lua(VISIBLE), true, 'un momento después');
  // Mostrada dentro de un padre oculto (Alt+Z esconde UIParent).
  m.avanzar(1.5);
  m.lua('UIParent:Hide()');
  assert.equal(m.lua(`${VENTANA}:IsShown()`), true);
  assert.equal(m.lua(VISIBLE), false, 'padre oculto');
  const desde = marca(m);
  m.avanzar(30);
  assert.deepEqual(propios(m, desde), [], 'sin peticiones con el padre oculto');
  m.lua('UIParent:Show()');
  assert.equal(m.lua(VISIBLE), true);
  m.avanzar(40);
  assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'completo', 'al volver a verse, el escaneo sigue');
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(m.lua(VISIBLE), false, 'cerrada');
  sinErrores(m);
});

test('un escaneo que llega a su hora con la ventana aún velada se relanza al quitarse el velo', () => {
  const m = maquina({ filas: 20 });
  // Sujeta a la pantalla, la subasta pasa al escondido de reserva y nuestra ventana sigue velada unos fotogramas.
  m.lua('AuctionHouseFrame:SetClampedToScreen(true); SnetForever.Escaneo.ESPERA_INICIO = 0.01');
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.05);
  assert.equal(m.lua(VISIBLE), false, 'aún velada');
  assert.equal(m.lua('SnetForever.Escaneo.motivo()'), 'otro', 'le ha tocado empezar con la ventana velada');
  assert.deepEqual(propios(m, 0), []);
  m.avanzar(1.2);
  assert.equal(m.lua(VISIBLE), true, 'sin velo');
  assert.ok(propios(m, 0).length > 0, 'al quitarse el velo, arranca');
  sinErrores(m);
});

test('el addon solo llama a las funciones de envío conocidas (una nueva tiene que pasar por la puerta)', () => {
  const m = maquina({ filas: 1 });
  const contadas = Object.keys(m.lua('CONTADAS'));
  for (const n of ENVIOS) assert.ok(contadas.includes(n), `${n} se cuenta`);
  const delBanco = m.lua(`(function()
    local r = {}
    for n, f in pairs(C_AuctionHouse) do if type(f) == "function" then r[#r + 1] = n end end
    return r
  end)()`);
  for (const n of delBanco) {
    if (!SOLO_LECTURA.test(n)) assert.ok(contadas.includes(n), `${n} (del banco) se cuenta`);
  }
  const archivos = [];
  const recorrer = (dir) => {
    for (const e of readdirSync(dir)) {
      const ruta = join(dir, e);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (e.endsWith('.lua')) archivos.push(ruta);
    }
  };
  recorrer(COMERCIO);
  const vistas = new Set();
  for (const ruta of archivos) {
    const codigo = readFileSync(ruta, 'utf8').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
    // `A` solo donde es un alias de C_AuctionHouse (en otros archivos es otra tabla).
    const alias = /local A = (?:C_AuctionHouse|rawget\(_G, "C_AuctionHouse"\))/.test(codigo);
    for (const [, de, n] of codigo.matchAll(/\b(C_AuctionHouse|A)\.([A-Z]\w+)/g)) {
      if ((de !== 'A' || alias) && !SOLO_LECTURA.test(n)) vistas.add(n);
    }
    for (const [, n] of codigo.matchAll(/"((?:Send|Query|Replicate|RequestMore|PostItem|PostCommodity|ConfirmPost|PlaceBid|RefreshCommodity|RefreshItem|SearchFor|SetFavoriteItem|StartCommodities|ConfirmCommodities|CancelCommodities|CancelAuction|CloseAuction)\w*)"/g)) {
      vistas.add(n);
    }
  }
  for (const n of vistas) assert.ok(USADAS.has(n), `${n}: envío nuevo sin revisar`);
  assert.ok(vistas.has('SendSearchQuery') && vistas.has('ReplicateItems'), 'la búsqueda de envíos encuentra los de siempre');
});
