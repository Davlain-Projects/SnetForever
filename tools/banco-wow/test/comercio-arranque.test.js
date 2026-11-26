// Comercio, tarea 9: la casa de subastas moderna del banco (C_AuctionHouse), el módulo de comercio dormido hasta abrir
// la subasta (comercio/comercio.lua) y la carga de las ranuras de precios SnetForever_P01…P08 (comercio/precios.lua).
// Contrato de las ranuras (decisión del coordinador): la foto con `generado` va a la ranura floor(generado/3600) % 8 + 1;
// al abrir la subasta, antes de las hh:35 solo se prueba la ranura de la hora anterior; desde las hh:35, la de la hora
// actual y, si aún tiene la foto de hace 8 horas, la de la hora anterior.
// Las pruebas con testSiempre no necesitan el comercio: corren también en la pasada de solo núcleo.
import { after, test as testSiempre } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
// 0.7.0: las pruebas de este archivo (salvo las de testSiempre) necesitan el addon SnetForever_Comercio; en la pasada
// de solo núcleo (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000; // GetServerTime() del banco al empezar (hh:13:20)
const H = Math.floor(AHORA / 3600); // la hora del servidor al empezar
const HORDA_NORMAL = { reino: 'Normal', faccion: 'Horde' };
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const ranuraDeHora = (h) => (h % 8) + 1;
const foto = (h) => h * 3600 + 1357; // la foto de la API de la hora h (hh:22:37)

// Lo que escribe la app (Task 7, contrato exacto): un .toc LoadOnDemand con p1.lua…p6.lua. p1.lua abre SNF_PRECIOS si no
// hay uno con seq mayor; p2.lua…p6.lua salen si SNF_PRECIOS no es el de su seq; p2.lua trae las filas {precio, cantidad,
// normal, tendencia, ritmo|-1, vendidosDia|-1, poco 0|1} y p6.lua marca completo (salvo con `incompleto`).
// precios: {seq, generado, region?, conocidas?: {"<reino>|<faccion>": casa}, casas: {casa: {item: [7 números]}},
// incompleto?}; null = ranura vacía («-- vacío» en todos).
function ponerRanura(dir, i, precios) {
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001
## Title: SnetForever - Precios ${String(i).padStart(2, '0')}
## LoadOnDemand: 1
## Dependencies: SnetForever

p1.lua
p2.lua
p3.lua
p4.lua
p5.lua
p6.lua
`);
  const archivos = Array(6).fill('-- vacío\n');
  if (precios) {
    const n = precios.seq;
    // F7: ya no hay casa supuesta: sin conocidas en la prueba, la de la Horda de «Normal» (114) como descubierta.
    const conocidas = Object.entries(precios.conocidas ?? { 'Normal|Horde': 114 }).map(([k, v]) => `[${aLua(k)}] = ${v}`).join(', ');
    archivos[0] = `if SNF_PRECIOS == nil or (SNF_PRECIOS.seq or 0) < ${n} then
  SNF_PRECIOS = {v = 1, seq = ${n}, generado = ${precios.generado}, region = ${aLua(precios.region ?? 'us')},
    conocidas = {${conocidas}}, casas = {},
    grupos = {{clave = "rapido", nombre = {es = "Suelen salir sin caducar", en = "Usually leave before expiring"}, tipo = "calculado", objetos = {2589}}},
    nombres = {}}
end
`;
    const guarda = `local P = SNF_PRECIOS; if not (P and P.seq == ${n}) then return end\n`;
    const lineas = ['local c = P.casas'];
    for (const [casa, objetos] of Object.entries(precios.casas)) {
      lineas.push(`c[${casa}] = c[${casa}] or {}`);
      for (const [item, fila] of Object.entries(objetos)) lineas.push(`c[${casa}][${item}] = {${fila.join(', ')}}`);
    }
    archivos[1] = `${guarda}${lineas.join('\n')}\n`;
    for (const k of [2, 3, 4]) archivos[k] = guarda;
    archivos[5] = guarda + (precios.incompleto ? '' : `if SNF_PRECIOS and SNF_PRECIOS.seq == ${n} then SNF_PRECIOS.completo = true end\n`);
  }
  archivos.forEach((texto, k) => writeFileSync(join(carpeta, `p${k + 1}.lua`), texto));
}

// Precios de la hora h en su ranura: lino a `precio`, seq h (así crece con la hora).
const deHora = (h, precio, extra = {}) => ({ seq: h, generado: foto(h), casas: { 114: { 2589: [precio, 10, precio, 0, 0.5, 5, 0] } }, ...extra });

// Carpeta de AddOns de prueba con las ranuras dadas: {i: precios | null}.
function carpetaDePrueba(ranuras = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-precios-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  for (const [i, precios] of Object.entries(ranuras)) ponerRanura(dir, Number(i), precios);
  return dir;
}

// Adelanta el reloj sin correr los saltos uno a uno (GetTime y GetServerTime salen de BANCO.tick); medio segundo de más
// para que el redondeo no se quede un segundo corto.
function saltar(m, segundos) {
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((segundos + 0.5) * 20)}`);
}

// Máquina con la carpeta de prueba, ya en el minuto `minuto` de la hora H (40 por defecto; con 13 se queda en las
// hh:13:20 del arranque); AVISOS apunta los SNF_COMERCIO_AVISO. m.dir es la carpeta (para que «la app» escriba durante
// la sesión).
function maquina(ranuras, opciones = {}) {
  const { minuto = 40, ...resto } = opciones;
  const dir = carpetaDePrueba(ranuras);
  const m = crearMaquina({ addonsDir: dir, jugador: HORDA_NORMAL, ...resto });
  m.dir = dir;
  const hasta = minuto * 60 - (AHORA - H * 3600);
  if (hasta > 0) saltar(m, hasta);
  m.lua(`rawset(_G, "AVISOS", {})
    SnetForever.escuchar("SNF_COMERCIO_AVISO", function(clave, n) AVISOS[#AVISOS + 1] = clave .. ":" .. tostring(n) end)`);
  return m;
}

const de = (m, item, casa) => m.lua(`SnetForever.Precios.de(${item}${casa ? `, ${casa}` : ''})`);
const abrir = (m) => m.disparar('AUCTION_HOUSE_SHOW');
const cerrar = (m) => m.disparar('AUCTION_HOUSE_CLOSED');
const reabrir = (m) => { cerrar(m); abrir(m); };
const cargasDePrecios = (m) => m.llamadas('C_AddOns.LoadAddOn').filter((a) => /^SnetForever_P/.test(a[0])).map((a) => a[0]);
const impresos = (m, trozo) => m.llamadas('print').filter((a) => String(a[0]).includes(trozo));

// Una casa 114 con lino (2589): 120 de cobre, 300 unidades, normal 150, tendencia -5, ritmo 0,42, 85 al día, no poco.
const LINO = [120, 300, 150, -5, 0.42, 85, 0];
const conLino = (fila = LINO, extra = {}) => ({ [ranuraDeHora(H)]: { seq: 1, generado: foto(H), casas: { 114: { 2589: fila } }, ...extra } });

// Ocho ranuras como las deja la app tras 8 horas: la de cada hora h (H-7…H), lino a 100 + (H - h).
function ochoHoras() {
  const r = {};
  for (let k = 0; k < 8; k++) r[ranuraDeHora(H - k)] = deHora(H - k, 100 + k);
  return r;
}

// ---------------------------------------------------------------------------------------------------
// Banco: C_AuctionHouse
// ---------------------------------------------------------------------------------------------------

testSiempre('banco: C_AuctionHouse tiene las funciones y eventos de la subasta moderna', () => {
  const m = crearMaquina();
  for (const f of ['SendBrowseQuery', 'RequestMoreBrowseResults', 'GetBrowseResults', 'HasFullBrowseResults', 'SendSearchQuery',
    'GetItemSearchResultsQuantity', 'GetItemSearchResultInfo', 'GetCommoditySearchResultsQuantity', 'GetCommoditySearchResultInfo',
    'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase', 'CancelCommoditiesPurchase', 'PlaceBid', 'ReplicateItems',
    'GetNumReplicateItems', 'GetReplicateItemInfo', 'MakeItemKey', 'IsThrottledMessageSystemReady']) {
    assert.equal(m.lua(`type(C_AuctionHouse.${f})`), 'function', f);
  }
  for (const e of ['AUCTION_HOUSE_BROWSE_RESULTS_UPDATED', 'AUCTION_HOUSE_BROWSE_RESULTS_ADDED', 'ITEM_SEARCH_RESULTS_UPDATED',
    'COMMODITY_SEARCH_RESULTS_UPDATED', 'COMMODITY_PRICE_UPDATED', 'COMMODITY_PURCHASE_SUCCEEDED', 'COMMODITY_PURCHASE_FAILED',
    'AUCTION_HOUSE_THROTTLED_SYSTEM_READY', 'AUCTION_HOUSE_THROTTLED_MESSAGE_SENT', 'REPLICATE_ITEM_LIST_UPDATE', 'PLAYER_MONEY',
    'COMMODITY_PRICE_UNAVAILABLE', 'UI_ERROR_MESSAGE']) {
    assert.equal(m.lua(`BANCO.eventosConocidos.${e}`), true, e);
  }
  assert.throws(() => m.lua('C_AuctionHouse.NoExiste()'), /no imitado: C_AuctionHouse.NoExiste/);
  assert.deepEqual(m.lua('C_AuctionHouse.MakeItemKey(2589)'), { itemID: 2589, itemLevel: 0, itemSuffix: 0, battlePetSpeciesID: 0 });
  assert.equal(m.lua('GetCVar("portal")'), 'US');
  sinErrores(m);
});

// Apunta en EV los eventos de la subasta que dispara el banco: «NOMBRE[:a[:b]]» (una tabla vale su longitud).
function anotarSubasta(m, eventos) {
  m.lua(`rawset(_G, "EV", {})
    local f = CreateFrame("Frame")
    for _, e in ipairs(${aLua(eventos)}) do f:RegisterEvent(e) end
    local function t(v) if type(v) == "table" then return #v end return v end
    f:SetScript("OnEvent", function(_, e, a, b)
      EV[#EV + 1] = e .. (a ~= nil and (":" .. tostring(t(a))) or "") .. (b ~= nil and (":" .. tostring(t(b))) or "")
    end)`);
}

testSiempre('banco: navegar por páginas; cada búsqueda limita el sistema hasta después de sus resultados', () => {
  const m = crearMaquina();
  m.lua(`local filas = {}
    for i = 1, 5 do filas[i] = {itemID = 1000 + i, totalQuantity = i, minPrice = 10 * i} end
    BANCO.ponerSubasta({navegar = filas, porPagina = 2})`);
  anotarSubasta(m, ['AUCTION_HOUSE_BROWSE_RESULTS_UPDATED', 'AUCTION_HOUSE_BROWSE_RESULTS_ADDED',
    'AUCTION_HOUSE_THROTTLED_MESSAGE_SENT', 'AUCTION_HOUSE_THROTTLED_SYSTEM_READY']);
  const consulta = 'C_AuctionHouse.SendBrowseQuery({searchString = "", sorts = {}, filters = {}, itemClassFilters = {}})';
  m.lua(consulta);
  m.avanzar(0.05);
  assert.deepEqual(m.lua('EV'), [], 'cerrada no atiende');
  assert.equal(m.llamadas('C_AuctionHouse:ignorada').length, 1);
  m.disparar('AUCTION_HOUSE_SHOW');
  m.lua('BANCO.ponerSubasta({lista = false})');
  m.lua(consulta);
  m.avanzar(0.05);
  assert.deepEqual(m.lua('EV'), [], 'limitada por otro addon no atiende');
  assert.equal(m.lua('C_AuctionHouse.IsThrottledMessageSystemReady()'), false);
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.lua(consulta);
  assert.deepEqual(m.lua('EV'), ['AUCTION_HOUSE_THROTTLED_MESSAGE_SENT'], 'MESSAGE_SENT al enviar; los resultados, después');
  assert.equal(m.lua('C_AuctionHouse.IsThrottledMessageSystemReady()'), false, 'ocupado con la búsqueda propia');
  m.lua(consulta);
  assert.equal(m.llamadas('C_AuctionHouse:limitada').length, 2, 'la segunda búsqueda seguida se pierde');
  m.avanzar(0.05);
  assert.deepEqual(m.lua('EV'), ['AUCTION_HOUSE_THROTTLED_MESSAGE_SENT', 'AUCTION_HOUSE_BROWSE_RESULTS_UPDATED',
    'AUCTION_HOUSE_THROTTLED_SYSTEM_READY']);
  assert.equal(m.lua('C_AuctionHouse.IsThrottledMessageSystemReady()'), true);
  assert.equal(m.lua('#C_AuctionHouse.GetBrowseResults()'), 2);
  assert.equal(m.lua('C_AuctionHouse.GetBrowseResults()[1].itemKey.itemID'), 1001);
  assert.equal(m.lua('C_AuctionHouse.HasFullBrowseResults()'), false);
  m.lua('C_AuctionHouse.RequestMoreBrowseResults()');
  m.avanzar(0.05);
  m.lua('C_AuctionHouse.RequestMoreBrowseResults()');
  m.avanzar(0.05);
  assert.equal(m.lua('#C_AuctionHouse.GetBrowseResults()'), 5);
  assert.equal(m.lua('C_AuctionHouse.HasFullBrowseResults()'), true);
  assert.deepEqual(m.lua('EV').slice(3), [
    'AUCTION_HOUSE_THROTTLED_MESSAGE_SENT', 'AUCTION_HOUSE_BROWSE_RESULTS_ADDED:2', 'AUCTION_HOUSE_THROTTLED_SYSTEM_READY',
    'AUCTION_HOUSE_THROTTLED_MESSAGE_SENT', 'AUCTION_HOUSE_BROWSE_RESULTS_ADDED:1', 'AUCTION_HOUSE_THROTTLED_SYSTEM_READY']);
  m.lua('C_AuctionHouse.RequestMoreBrowseResults()');
  m.avanzar(0.05);
  assert.equal(m.lua('#EV'), 9, 'con todas ya dadas no se pide nada');
  // Como en WoW Forever: sin filters ni itemClassFilters vuelve sin filas y ya completa.
  m.lua('C_AuctionHouse.SendBrowseQuery({searchString = "", sorts = {}})');
  m.avanzar(0.05);
  assert.equal(m.lua('#C_AuctionHouse.GetBrowseResults()'), 0);
  assert.equal(m.lua('C_AuctionHouse.HasFullBrowseResults()'), true);
  sinErrores(m);
});

testSiempre('banco: buscar una mercancía y comprarla solo con un clic; sin oro FAILED, sin unidades PRICE_UNAVAILABLE', () => {
  const m = crearMaquina({ jugador: { dinero: 1000 } });
  m.disparar('AUCTION_HOUSE_SHOW');
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 5, unitPrice = 100}, {quantity = 10, unitPrice = 150}}}})');
  anotarSubasta(m, ['COMMODITY_SEARCH_RESULTS_UPDATED', 'COMMODITY_PRICE_UPDATED', 'COMMODITY_PURCHASE_SUCCEEDED',
    'COMMODITY_PURCHASE_FAILED', 'COMMODITY_PRICE_UNAVAILABLE', 'PLAYER_MONEY']);
  m.lua('C_AuctionHouse.SendSearchQuery(C_AuctionHouse.MakeItemKey(2589), {}, false)');
  assert.equal(m.lua('C_AuctionHouse.GetCommoditySearchResultsQuantity(2589)'), 0, 'antes de la respuesta no hay nada');
  m.avanzar(0.05);
  assert.deepEqual(m.lua('EV'), ['COMMODITY_SEARCH_RESULTS_UPDATED:2589']);
  assert.equal(m.lua('C_AuctionHouse.GetCommoditySearchResultsQuantity(2589)'), 15);
  assert.equal(m.lua('C_AuctionHouse.GetNumCommoditySearchResults(2589)'), 2);
  assert.equal(m.lua('C_AuctionHouse.GetCommoditySearchResultInfo(2589, 2).unitPrice'), 150);
  assert.throws(() => m.lua('C_AuctionHouse.StartCommoditiesPurchase(2589, 7)'), /necesita un clic del jugador/);
  const clic = (codigo) => m.lua(`BOTON:SetScript("OnClick", function() ${codigo} end); BOTON:Click()`);
  m.lua('rawset(_G, "BOTON", CreateFrame("Button", nil, UIParent))');
  clic('C_AuctionHouse.StartCommoditiesPurchase(2589, 7)');
  m.avanzar(0.05);
  assert.equal(m.lua('EV[2]'), 'COMMODITY_PRICE_UPDATED:115:800');
  clic('C_AuctionHouse.ConfirmCommoditiesPurchase(2589, 7)');
  m.avanzar(0.05);
  assert.deepEqual(m.lua('EV').slice(2), ['COMMODITY_PURCHASE_SUCCEEDED', 'PLAYER_MONEY']);
  assert.equal(m.lua('GetMoney()'), 200);
  clic('C_AuctionHouse.StartCommoditiesPurchase(2589, 2)');
  m.avanzar(0.05);
  clic('C_AuctionHouse.ConfirmCommoditiesPurchase(2589, 2)');
  m.avanzar(0.05);
  assert.equal(m.lua('EV[#EV]'), 'COMMODITY_PURCHASE_FAILED', '300 de coste con 200 de oro');
  assert.equal(m.lua('GetMoney()'), 200);
  clic('C_AuctionHouse.StartCommoditiesPurchase(2589, 50)');
  m.avanzar(0.05);
  assert.equal(m.lua('EV[#EV]'), 'COMMODITY_PRICE_UNAVAILABLE', 'solo quedan 8');
  sinErrores(m);
});

testSiempre('banco: PlaceBid sin oro o por una subasta que no existe da UI_ERROR_MESSAGE y no compra', () => {
  const m = crearMaquina({ jugador: { dinero: 500 } });
  m.disparar('AUCTION_HOUSE_SHOW');
  m.lua('BANCO.ponerSubasta({objetos = {[2589] = {{quantity = 1, buyoutAmount = 800, auctionID = 77}}}})');
  anotarSubasta(m, ['UI_ERROR_MESSAGE', 'PLAYER_MONEY']);
  assert.throws(() => m.lua('C_AuctionHouse.PlaceBid(77, 800)'), /necesita un clic del jugador/);
  m.lua('rawset(_G, "BOTON", CreateFrame("Button", nil, UIParent))');
  m.lua('BOTON:SetScript("OnClick", function() C_AuctionHouse.PlaceBid(77, 800) end); BOTON:Click()');
  m.avanzar(0.05);
  assert.deepEqual(m.lua('EV'), [`UI_ERROR_MESSAGE:${m.lua('BANCO.ERROR_SIN_DINERO')}:No tienes suficiente dinero.`]);
  assert.equal(m.lua('GetMoney()'), 500);
  m.lua('BOTON:SetScript("OnClick", function() C_AuctionHouse.PlaceBid(78, 100) end); BOTON:Click()');
  m.avanzar(0.05);
  assert.match(m.lua('EV[2]'), new RegExp(`^UI_ERROR_MESSAGE:${m.lua('BANCO.ERROR_NO_ENCONTRADO')}:`));
  m.lua('BANCO.jugador.dinero = 1000');
  m.lua('BOTON:SetScript("OnClick", function() C_AuctionHouse.PlaceBid(77, 800) end); BOTON:Click()');
  m.avanzar(0.05);
  assert.equal(m.lua('EV[3]'), 'PLAYER_MONEY');
  assert.equal(m.lua('GetMoney()'), 200);
  assert.equal(m.lua('#BANCO.subasta.objetos[2589]'), 0, 'comprada ya: fuera de la lista');
  sinErrores(m);
});

testSiempre('banco: ReplicateItems da la subasta entera con índices desde 0', () => {
  const m = crearMaquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  m.lua('BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400}}})');
  assert.equal(m.lua('C_AuctionHouse.GetNumReplicateItems()'), 0);
  m.lua('C_AuctionHouse.ReplicateItems()');
  m.avanzar(0.05);
  assert.equal(m.lua('C_AuctionHouse.GetNumReplicateItems()'), 1);
  assert.equal(m.lua('select("#", C_AuctionHouse.GetReplicateItemInfo(0))'), 18);
  assert.deepEqual([1, 3, 10, 17].map((k) => m.lua(`(select(${k}, C_AuctionHouse.GetReplicateItemInfo(0)))`)), ['Lino', 20, 2400, 2589]);
  assert.equal(m.lua('C_AuctionHouse.GetReplicateItemInfo(1)'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Dormido hasta abrir la subasta
// ---------------------------------------------------------------------------------------------------

// Cuenta los marcos y temporizadores creados desde los archivos de comercio/ (envolviendo CreateFrame y C_Timer antes
// de cargar el addon).
const VIGIA = `rawset(_G, "CREADOS", {marcos = 0, temporizadores = 0})
  local function desdeComercio()
    local info = BANCO.depuracion.getinfo(3, "S")
    return info and string.find(info.source or "", "/comercio/", 1, true) ~= nil
  end
  local crear = CreateFrame
  rawset(_G, "CreateFrame", function(...)
    if desdeComercio() then CREADOS.marcos = CREADOS.marcos + 1 end
    return crear(...)
  end)
  for _, f in ipairs({"After", "NewTicker", "NewTimer"}) do
    local original = rawget(C_Timer, f)
    if original then
      rawset(C_Timer, f, function(...)
        if desdeComercio() then CREADOS.temporizadores = CREADOS.temporizadores + 1 end
        return original(...)
      end)
    end
  end`;

test('tras PLAYER_LOGIN el comercio no ha creado ninguna ventana ni temporizador ni ha cargado precios', () => {
  const m = maquina(conLino(), { previo: VIGIA });
  m.avanzar(5);
  assert.deepEqual(m.lua('CREADOS'), { marcos: 0, temporizadores: 0 });
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  assert.deepEqual(cargasDePrecios(m), []);
  assert.equal(m.lua('rawget(_G, "SNF_PRECIOS")'), undefined);
  assert.ok(!Object.keys(m.lua('BANCO.llamadas')).some((api) => api.startsWith('C_AuctionHouse')), 'sin llamadas a la subasta');
  assert.equal(m.lua('SnetForever.Precios.de(2589)'), undefined);
  abrir(m);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H))]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ranuras de precios
// ---------------------------------------------------------------------------------------------------

test('con la ranura de esta hora y AUCTION_HOUSE_SHOW, Precios.de(2589) da los datos de la app', () => {
  const m = maquina(conLino());
  abrir(m);
  assert.deepEqual(de(m, 2589), { precio: 120, cantidad: 300, normal: 150, tendencia: -5, ritmo: 0.42, vendidosDia: 85, poco: false, conTendencia: false, mercancia: false }); // T1b: una fila de 7 números (de antes): sin subastas y sin saber la tendencia; F5: ni si es una mercancía
  assert.equal(m.lua('SnetForever.Precios.casa()'), 114);
  assert.equal(m.lua('SNF_PRECIOS.completo'), true);
  assert.equal(m.lua('SNF_PRECIOS.grupos[1].clave'), 'rapido');
  assert.equal(de(m, 4306), undefined, 'un objeto que la ranura no trae');
  assert.equal(m.lua('SnetForever.Precios.edad()'), 2400 - 1357);
  assert.equal(m.lua('SnetForever.Precios.agotadas()'), false, 'la de la hora anterior sigue sin gastar');
  assert.deepEqual(m.guardado().SnetForeverCuenta.comercio.identidad, { region: 'US', reino: 'Normal', faccion: 'Horde' });
  sinErrores(m);
});

test('F5: una fila con un 1 detrás (el 10.º) es una mercancía; con 9, no', () => {
  const m = maquina(conLino([120, 300, 150, -5, 0.42, 2054.4, 0, 37, 1, 1]));
  abrir(m);
  const p = de(m, 2589);
  assert.equal(p.mercancia, true);
  assert.equal(p.vendidosDia, 2054.4);
  assert.equal(p.subastas, 37);
  const n = maquina(conLino([120, 300, 150, -5, 0.42, 85, 0, 37, 1]));
  abrir(n);
  assert.equal(de(n, 2589).mercancia, false);
  sinErrores(m);
  sinErrores(n);
});

test('ritmo y vendidos al día -1 en la ranura → nil; poco 1 → true', () => {
  const m = maquina(conLino([120, 3, 150, 0, -1, -1, 1]));
  abrir(m);
  const p = de(m, 2589);
  assert.equal(p.ritmo, undefined);
  assert.equal(p.vendidosDia, undefined);
  assert.equal(p.poco, true);
  assert.equal(p.precio, 120);
  sinErrores(m);
});

test('en la misma hora se carga una sola ranura (la de la hora), aunque estén las 8', () => {
  const m = maquina(ochoHoras());
  abrir(m);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H))]);
  assert.equal(de(m, 2589).precio, 100);
  reabrir(m);
  reabrir(m);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H))], 'reabrir en la misma hora no gasta más ranuras');
  assert.equal(de(m, 2589).precio, 100);
  assert.deepEqual(m.lua('AVISOS'), []);
  sinErrores(m);
});

test('a la hora siguiente se carga la ranura siguiente con la foto nueva que la app escribió en la sesión', () => {
  const m = maquina(ochoHoras());
  abrir(m);
  assert.equal(de(m, 2589).precio, 100);
  cerrar(m);
  saltar(m, 3600);
  ponerRanura(m.dir, ranuraDeHora(H + 1), deHora(H + 1, 555)); // la app pisa la ranura de hace 8 horas
  abrir(m);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H)), nombre(ranuraDeHora(H + 1))]);
  assert.equal(de(m, 2589).precio, 555);
  assert.equal(m.lua('SNF_PRECIOS.seq'), H + 1);
  assert.deepEqual(m.lua('AVISOS'), []);
  sinErrores(m);
});

test('si la ranura de la hora aún tiene la foto de hace 8 horas, se usa la de la hora anterior', () => {
  const m = maquina({ [ranuraDeHora(H)]: deHora(H - 8, 999), [ranuraDeHora(H - 1)]: deHora(H - 1, 222) });
  abrir(m);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H)), nombre(ranuraDeHora(H - 1))]);
  assert.equal(de(m, 2589).precio, 222);
  assert.equal(m.lua('SnetForever.Precios.agotadas()'), true);
  assert.equal(m.lua('SnetForever.Precios.hayQueRecargar()'), false);
  assert.deepEqual(m.lua('AVISOS'), []);
  sinErrores(m);
});

test('sin la carpeta de la ranura de la hora, también se usa la de la hora anterior', () => {
  const m = maquina({ [ranuraDeHora(H - 1)]: deHora(H - 1, 222) });
  abrir(m);
  assert.equal(de(m, 2589).precio, 222);
  assert.equal(m.lua('SnetForever.Precios.agotadas()'), false, 'la de esta hora no se pudo cargar: no está gastada');
  sinErrores(m);
});

test('una ranura sin «completo» (escrita a medias) o de otra región no se acepta', () => {
  let m = maquina({ [ranuraDeHora(H)]: deHora(H, 999, { incompleto: true }), [ranuraDeHora(H - 1)]: deHora(H - 1, 222) });
  abrir(m);
  assert.equal(de(m, 2589).precio, 222);
  sinErrores(m);
  m = maquina({ [ranuraDeHora(H)]: deHora(H, 999, { region: 'eu' }), [ranuraDeHora(H - 1)]: deHora(H - 1, 222, { region: 'US' }) });
  abrir(m);
  assert.equal(de(m, 2589).precio, 222, 'la región se compara sin mirar mayúsculas');
  sinErrores(m);
});

test('unos precios más viejos nunca sustituyen a los cargados; con más de 2 h y sin candidata, aviso de /reload una vez', () => {
  const r = ochoHoras();
  const m = maquina(r);
  abrir(m);
  assert.equal(de(m, 2589).precio, 100);
  cerrar(m);
  // Dos horas después, sin que la app haya escrito nada: la ranura de H+2 tiene la foto de H-6 y la de H+1 la de H-7,
  // las dos válidas pero más viejas que la cargada.
  saltar(m, 7200);
  abrir(m);
  assert.deepEqual(cargasDePrecios(m), [H, H + 2, H + 1].map((h) => nombre(ranuraDeHora(h))));
  assert.equal(de(m, 2589).precio, 100, 'sigue la foto de H');
  assert.equal(m.lua('SNF_PRECIOS.seq'), H);
  assert.equal(m.lua('SnetForever.Precios.agotadas()'), true);
  assert.equal(m.lua('SnetForever.Precios.hayQueRecargar()'), true, `edad ${m.lua('SnetForever.Precios.edad()')} > 7200`);
  assert.deepEqual(m.lua('AVISOS'), ['COMERCIO_PRECIOS_RELOAD:2']);
  assert.match(impresos(m, '/reload')[0][0], /hace 2 h/);
  reabrir(m);
  reabrir(m);
  assert.deepEqual(m.lua('AVISOS'), ['COMERCIO_PRECIOS_RELOAD:2'], 'una sola vez por sesión');
  assert.equal(impresos(m, '/reload').length, 1);
  sinErrores(m);
});

test('a las hh:10 solo se carga la ranura de la hora anterior (la de esta hora ni se toca)', () => {
  const r = {};
  for (let k = 1; k <= 8; k++) r[ranuraDeHora(H - k)] = deHora(H - k, 100 + k); // la de H tiene la foto de H-8
  const m = maquina(r, { minuto: 13 });
  abrir(m);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H - 1))]);
  assert.equal(de(m, 2589).precio, 101);
  assert.equal(m.lua('SnetForever.Precios.agotadas()'), true, 'antes de las hh:35 la única candidata es la de H-1');
  reabrir(m);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H - 1))], 'reabrir en la misma ventana no carga más');
  assert.deepEqual(m.lua('AVISOS'), []);
  sinErrores(m);
});

test('a las hh:40 con la ranura de esta hora ya escrita se carga solo esa', () => {
  const m = maquina(ochoHoras(), { minuto: 40 });
  abrir(m);
  reabrir(m);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H))]);
  assert.equal(de(m, 2589).precio, 100);
  sinErrores(m);
});

test('al pasar de las hh:35 en la misma sesión se carga la ranura de esta hora una vez', () => {
  // A las hh:13:20 la app aún no ha escrito la foto de esta hora: la ranura de H tiene la de H-8.
  const m = maquina({ [ranuraDeHora(H)]: deHora(H - 8, 999), [ranuraDeHora(H - 1)]: deHora(H - 1, 222) }, { minuto: 13 });
  abrir(m);
  assert.equal(de(m, 2589).precio, 222);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H - 1))], 'la de H no se gasta antes de tiempo');
  // La app escribe la foto de las hh:22:37 en la ranura de H; el jugador vuelve a la subasta a las hh:38.
  ponerRanura(m.dir, ranuraDeHora(H), deHora(H, 333));
  saltar(m, 1500);
  reabrir(m);
  assert.equal(de(m, 2589).precio, 333);
  reabrir(m);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H - 1)), nombre(ranuraDeHora(H))]);
  assert.deepEqual(m.lua('AVISOS'), []);
  sinErrores(m);
});

test('la app llega tarde y la ranura de esta hora se gasta con la foto vieja: aviso de /reload cuando ya hay foto nueva', () => {
  const m = maquina({ [ranuraDeHora(H)]: deHora(H - 8, 999), [ranuraDeHora(H - 1)]: deHora(H - 1, 222) }, { minuto: 40 });
  abrir(m);
  assert.deepEqual(cargasDePrecios(m), [nombre(ranuraDeHora(H)), nombre(ranuraDeHora(H - 1))], 'la de H vieja y luego la de H-1');
  assert.equal(de(m, 2589).precio, 222);
  assert.deepEqual(m.lua('AVISOS'), [], 'la primera vez no hay nada gastado');
  // La app escribe la foto de esta hora a las hh:45, en una ranura ya gastada.
  ponerRanura(m.dir, ranuraDeHora(H), deHora(H, 333));
  saltar(m, 600);
  reabrir(m);
  assert.equal(de(m, 2589).precio, 222, 'sin /reload no puede entrar');
  assert.equal(cargasDePrecios(m).length, 2, 'no se carga ninguna otra ranura');
  assert.equal(m.lua('SnetForever.Precios.hayQueRecargar()'), true);
  assert.deepEqual(m.lua('AVISOS'), ['COMERCIO_PRECIOS_RELOAD:1']);
  reabrir(m);
  assert.deepEqual(m.lua('AVISOS'), ['COMERCIO_PRECIOS_RELOAD:1'], 'una sola vez por sesión');
  sinErrores(m);
});

test('sin ranuras de precios, de() es nil y no hay errores', () => {
  for (const m of [maquina({}), crearMaquina({ jugador: HORDA_NORMAL })]) {
    abrir(m);
    assert.equal(de(m, 2589), undefined);
    assert.equal(m.lua('SnetForever.Precios.edad()'), undefined);
    assert.equal(m.lua('SnetForever.Precios.hayQueRecargar()'), false);
    assert.equal(m.lua('SnetForever.Comercio.activo()'), true);
    sinErrores(m);
  }
});

test('una ranura vacía («-- vacío») no cuenta como precios', () => {
  const m = maquina({ [ranuraDeHora(H)]: null });
  abrir(m);
  assert.equal(de(m, 2589), undefined);
  assert.equal(m.lua('rawget(_G, "SNF_PRECIOS")'), undefined);
  sinErrores(m);
});

test('identidad Alianza y una ranura que solo trae la 114: de() es nil sin errores (solo escaneo en vivo)', () => {
  const m = maquina(conLino(), { jugador: { reino: 'Normal', faccion: 'Alliance' } });
  abrir(m);
  assert.equal(m.lua('SnetForever.Precios.casa()'), undefined, 'F7: la Alianza sin descubrir no tiene casa (nada se supone)');
  assert.equal(de(m, 2589), undefined);
  assert.equal(de(m, 2589, 114).precio, 120, 'pidiendo la 114 a propósito sí sale');
  assert.equal(m.guardado().SnetForeverCuenta.comercio.identidad.faccion, 'Alliance');
  sinErrores(m);
});

test('la casa se calcula al abrir la subasta, no en cada Precios.de', () => {
  const m = maquina(conLino());
  abrir(m);
  const antes = m.llamadas('UnitFactionGroup').length;
  for (let i = 0; i < 5; i++) de(m, 2589);
  assert.equal(m.llamadas('UnitFactionGroup').length, antes);
  sinErrores(m);
});

test('las casas conocidas de la ranura dan la casa y se guardan en la cuenta', () => {
  const m = maquina(conLino(LINO, { conocidas: { 'Normal|Alliance': 112 }, casas: { 112: { 2589: LINO } } }),
    { jugador: { reino: 'Normal', faccion: 'Alliance' } });
  abrir(m);
  assert.equal(m.lua('SnetForever.Precios.casa()'), 112);
  assert.equal(de(m, 2589).precio, 120);
  assert.deepEqual(m.guardado().SnetForeverCuenta.comercio.conocidas, { 'Normal|Alliance': 112 });
  sinErrores(m);
});

test('un reino que no está en las conocidas no tiene casa', () => {
  const m = maquina(conLino(), { jugador: { reino: 'Banco' } });
  abrir(m);
  assert.equal(m.lua('SnetForever.Precios.casa()'), undefined);
  assert.equal(de(m, 2589), undefined);
  sinErrores(m);
});

test('guardado: la plantilla de la cuenta trae comercio = {grupos, reglas, conocidas, papelera, tooltip, v2}', () => {
  const m = crearMaquina({ guardado: { SnetForeverCuenta: { esquema: 1 } }, entrar: false });
  m.lua('SnetForever.Guardado.preparar()');
  assert.deepEqual(m.lua('SnetForeverCuenta.comercio'), { grupos: [], reglas: [], conocidas: [], papelera: [], tooltip: true, v2: { grupos: [], objetos: [], operaciones: [], fuentes: [] } });
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Fallos contenidos
// ---------------------------------------------------------------------------------------------------

test('un error dentro de Comercio.ejecutar queda en fallos, apaga el comercio hasta cerrar y la flecha sigue', () => {
  const m = maquina({}, { jugador: { ...HORDA_NORMAL, mapa: 1411, x: 50, y: 25 } });
  m.lua(`rawset(_G, "PARADAS", {})
    SnetForever.Escaneo = {parar = function() PARADAS[#PARADAS + 1] = "escaneo" end}
    SnetForever.Sniper = {parar = function() PARADAS[#PARADAS + 1] = "sniper" end}`);
  abrir(m);
  assert.deepEqual(m.lua(`(function()
    local ok, a, b = SnetForever.Comercio.ejecutar("suma", function(x, y) return nil, x + y end, 2, 3)
    return {ok = ok, a = tostring(a), b = b}
  end)()`), { ok: true, a: 'nil', b: 5 });
  const antes = m.lua('#SnetForeverCuenta.fallos');
  assert.equal(m.lua('SnetForever.Comercio.ejecutar("prueba", function() error("roto a propósito") end)'), false);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  assert.equal(m.lua('SnetForever.Comercio.abierta()'), true);
  assert.deepEqual(m.lua('PARADAS'), ['sniper', 'escaneo']);
  const fallos = m.guardado().SnetForeverCuenta.fallos;
  assert.equal(fallos.length, antes + 1);
  assert.equal(fallos.at(-1).origen, 'comercio');
  assert.match(fallos.at(-1).texto, /^prueba: .*roto a propósito/);
  assert.equal(impresos(m, 'comercio').length, 1);
  // Apagado: no se llama a nada más hasta cerrar la subasta.
  assert.equal(m.lua('SnetForever.Comercio.ejecutar("otra", function() rawset(_G, "LLAMADA", true) end)'), false);
  assert.equal(m.lua('rawget(_G, "LLAMADA")'), undefined);
  // La flecha y el resto del addon siguen sin errores.
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, inst = 1, wx = -4500, wy = 1025, seguir = true, orden = 1, etiqueta = "Destino"}})
    SnetForever.Flecha.crear()
    SnetForever.Flecha.actualizar(0)`);
  m.avanzar(1);
  assert.equal(m.lua('SnetForever.Flecha.marcos.raiz:IsShown()'), true);
  assert.match(m.lua('SnetForever.Flecha.marcos.texto:GetText()'), /\d/);
  sinErrores(m);
  // Al cerrar y volver a abrir la subasta, el comercio vuelve.
  cerrar(m);
  assert.deepEqual(m.lua('PARADAS'), ['sniper', 'escaneo', 'sniper', 'escaneo']);
  abrir(m);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true);
  assert.equal(m.lua('{SnetForever.Comercio.ejecutar("x", function() return 7 end)}')[1], 7);
  sinErrores(m);
});

test('el aviso del fallo no puede romper el cortafuegos (print que falla)', () => {
  const m = maquina({});
  abrir(m);
  m.lua('rawset(_G, "print", function() error("chat roto") end)');
  assert.equal(m.lua('SnetForever.Comercio.ejecutar("prueba", function() error("x") end)'), false);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  sinErrores(m);
});

test('cerrar la subasta deja el comercio inactivo y avisa con SNF_COMERCIO_CERRADA', () => {
  const m = maquina({});
  m.lua(`rawset(_G, "MSG", {})
    SnetForever.escuchar("SNF_COMERCIO_ABIERTA", function() MSG[#MSG + 1] = "abierta" end)
    SnetForever.escuchar("SNF_COMERCIO_CERRADA", function() MSG[#MSG + 1] = "cerrada" end)`);
  abrir(m);
  cerrar(m);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  assert.deepEqual(m.lua('MSG'), ['abierta', 'cerrada']);
  sinErrores(m);
});
