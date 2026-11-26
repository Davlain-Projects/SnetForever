// F6 (en el juego, 20-nov): en la Horda, la búsqueda «paño» de Navegar se quedaba en «Leyendo 2 / 212» con casi todas las
// filas en ↻, y por la mañana, con la F3, iba a «Leyendo 62 / 196» a los 6 s. Esta prueba fija el ritmo de la lectura de la
// vista de resultados (ui/subasta/resultados.lua y comercio/busqueda.lua) con una búsqueda como esa: 212 mercancías, con el
// Enum.BagIndex de Forever (bolsas: 'forever') y el banco abierto, y el escaneo de fondo de verdad a la vez. Se comprobó en
// el banco con el addon de 7ad2de5 (F3), 148a0ff (F2b), d44ecce (F4) y 6aaf935 (F5): las cuatro dan lo mismo (una
// SendSearchQuery por objeto, una sola lectura de su lista y las 212 leídas antes de 20 s del tiempo falso), así que el
// atasco del juego no sale de un bucle nuestro. Si alguna vez sale, esta prueba lo dice: más de una petición por objeto,
// una lista leída dos veces o una lectura que no avanza. Todo lo de aquí es inventado.
import assert from 'node:assert/strict';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}; AuctionHouseFrame:EnableMouse(true); ';
const N = 212; // las filas de la búsqueda del juego
const ESCALONES = 40; // los precios de cada mercancía
const NV = 'SnetForever.SubastaNavegar.marcos';

function maquina() {
  const m = crearMaquina({ jugador: { nombre: 'Nombre', apellido: 'Uno', reino: 'Normal', faccion: 'Horde' }, previo: SUBASTA, bolsas: 'forever' });
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  const navegar = [];
  const mercancias = [];
  for (let i = 0; i < N; i++) {
    const id = 30000 + i;
    m.itemInfo(id, { nombre: `Paño ${i}`, calidad: 1 });
    navegar.push(`{itemID = ${id}, totalQuantity = ${100 + i}, minPrice = ${100 + i}}`);
    const filas = [];
    for (let k = 0; k < ESCALONES; k++) filas.push(`{quantity = ${5 + k}, unitPrice = ${100 + i + k}}`);
    mercancias.push(`[${id}] = {${filas.join(',')}}`);
  }
  m.lua(`BANCO.ponerSubasta({navegar = {${navegar.join(',')}}, porPagina = 50, mercancias = {${mercancias.join(',')}}})`);
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 50, y = 50, ancho = 1000, alto = 600}');
  // El banco abierto (como en el juego, cerca de la subasta): BAG_UPDATE_DELAYED se escucha y cada pestaña cuenta.
  m.huecos(6, 28);
  m.bolsa(6, 1, { id: 30001, n: 3 });
  for (let b = 15; b <= 23; b++) m.huecos(b, 0);
  m.disparar('BANKFRAME_OPENED');
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.05);
  return m;
}

const leidas = (m) => m.lua(`local n = 0
  for _, r in ipairs(SnetForever.Busqueda.resultados()) do if r.resumen then n = n + 1 end end
  return n`);

test('F6: la lectura de una búsqueda de 212 mercancías pide cada objeto una sola vez, lee su lista una vez y avanza sin atascarse', () => {
  const m = maquina();
  m.lua(`${NV}.campo:SetText("paño"); ${NV}.buscar:Click()`);
  let pasos = 0;
  while (pasos < 20 * 20 && leidas(m) < N) {
    m.avanzar(0.05);
    pasos++;
  }
  assert.equal(m.lua('#SnetForever.Busqueda.resultados()'), N, 'la búsqueda trae las 212 filas');
  assert.equal(leidas(m), N, `las 212 leídas antes de 20 s del tiempo falso (a los ${pasos / 20} s van ${leidas(m)})`);
  const pedidas = m.llamadas('C_AuctionHouse.SendSearchQuery');
  const porObjeto = new Map();
  for (const [clave] of pedidas) porObjeto.set(clave.itemID, (porObjeto.get(clave.itemID) || 0) + 1);
  assert.equal(porObjeto.size, N, 'cada objeto se pide');
  assert.deepEqual([...porObjeto.values()].filter((n) => n > 1), [], 'ninguno se pide dos veces');
  // Una sola lectura de la lista de cada objeto: el trabajo de cada COMMODITY_SEARCH_RESULTS_UPDATED es su lista y nada más.
  assert.equal(m.llamadas('C_AuctionHouse.GetCommoditySearchResultInfo').length, N * ESCALONES, 'cada lista se lee una vez');
  // Con la lectura acabada, nada más: ni otra vuelta ni peticiones que no se piden.
  const antes = pedidas.length;
  m.avanzar(30);
  assert.equal(m.llamadas('C_AuctionHouse.SendSearchQuery').length, antes, 'acabada, no vuelve a pedir');
  sinErrores(m);
});

// F6, ronda 1 (revisión): el banco responde cada búsqueda en el salto siguiente, así que la prueba de arriba no podía ver
// un atasco. Aquí, búsquedas que nunca responden, un escaneo cuyo navegar se pierde y un fallo al leer una respuesta: la
// lectura de fondo sigue (con sus reintentos), y el trabajo de cada evento es solo la lista de ese objeto.
function buscarYLeer(m, segundos) {
  m.lua(`${NV}.campo:SetText("paño"); ${NV}.buscar:Click()`);
  const marcas = [];
  for (let paso = 1; paso <= segundos * 20 && leidas(m) < N; paso++) {
    m.avanzar(0.05);
    if (paso % 1200 === 0) marcas.push(leidas(m));
  }
  return marcas;
}
const PERDIDAS = [30010, 30050, 30100, 30150];

test('F6, ronda 1: con búsquedas que nunca responden, la lectura sigue: cada una se pide 3 veces (2 reintentos), queda leída sin datos y las demás, una vez', () => {
  const m = maquina();
  m.lua(`local perdidas = {${PERDIDAS.map((id) => `[${id}] = true`).join(', ')}}
    local original = C_AuctionHouse.SendSearchQuery
    C_AuctionHouse.SendSearchQuery = function(k, ...)
      if type(k) == "table" and perdidas[k.itemID] then
        BANCO.anotar("C_AuctionHouse.SendSearchQuery", k, ...) -- sale, pero el servidor no contesta nunca
        return
      end
      return original(k, ...)
    end`);
  // El trabajo por evento: ni las bolsas ni el tooltip se recalculan mientras se lee.
  m.lua(`TOOLTIPS = 0
    local anadir = SnetForever.TooltipComercio.anadir
    SnetForever.TooltipComercio.anadir = function(...) TOOLTIPS = TOOLTIPS + 1; return anadir(...) end`);
  const bolsasAntes = m.llamadas('C_Container.GetContainerItemInfo').length;
  const marcas = buscarYLeer(m, 240);
  assert.equal(leidas(m), N, `las 212 leídas (las perdidas, sin datos) antes de 240 s; por minuto: ${marcas}`);
  const porObjeto = new Map();
  for (const [clave] of m.llamadas('C_AuctionHouse.SendSearchQuery')) porObjeto.set(clave.itemID, (porObjeto.get(clave.itemID) || 0) + 1);
  for (const id of PERDIDAS) assert.equal(porObjeto.get(id), 3, `${id}: 1 + 2 reintentos`);
  assert.deepEqual([...porObjeto].filter(([id, n]) => !PERDIDAS.includes(id) && n !== 1), [], 'las demás, una vez');
  const resumen = (id) => m.lua(`(function() for _, r in ipairs(SnetForever.Busqueda.resultados()) do if r.item == ${id} then return r.resumen end end end)()`);
  for (const id of PERDIDAS) assert.equal(resumen(id).fallo, true, `${id}: leída sin datos`);
  assert.equal(m.llamadas('C_AuctionHouse.GetCommoditySearchResultInfo').length, (N - PERDIDAS.length) * ESCALONES, 'cada lista, una vez');
  assert.equal(m.llamadas('C_Container.GetContainerItemInfo').length - bolsasAntes, 0, 'ninguna lectura de bolsas por evento');
  assert.equal(m.lua('TOOLTIPS'), 0, 'ningún tooltip recalculado por evento');
  assert.equal(m.lua('SnetForever.Busqueda.leyendo()'), false, 'acabada, sin nada esperando');
  sinErrores(m);
});

test('F6, ronda 1: con el navegar del escaneo de fondo perdido, la lectura no se queda esperando para siempre', () => {
  const m = maquina();
  m.lua(`local original = C_AuctionHouse.SendBrowseQuery
    C_AuctionHouse.SendBrowseQuery = function(q, ...)
      if type(q) == "table" and (q.searchString or "") == "" then
        BANCO.anotar("C_AuctionHouse.SendBrowseQuery", q, ...) -- el del escaneo de fondo: no contesta nunca
        return
      end
      return original(q, ...)
    end`);
  const marcas = buscarYLeer(m, 600);
  assert.equal(leidas(m), N, `las 212 leídas antes de 600 s; por minuto: ${marcas}`);
  sinErrores(m);
});

test('F6, ronda 1: un fallo al leer la respuesta de un objeto no para la lectura ni apaga el comercio, y se apunta una vez', () => {
  const m = maquina();
  m.lua(`local original = C_AuctionHouse.GetCommoditySearchResultInfo
    C_AuctionHouse.GetCommoditySearchResultInfo = function(id, i)
      if id == 30020 or id == 30021 then error("respuesta rota" .. string.char(10) .. "más detalle") end
      return original(id, i)
    end`);
  buscarYLeer(m, 60);
  assert.equal(leidas(m), N, 'las 212 leídas');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true, 'el comercio sigue encendido');
  const f = (m.lua('return SnetForeverCuenta.fallos') || []).map((x) => x.texto);
  assert.equal(f.filter((t) => /^lectura/.test(t)).length, 1, JSON.stringify(f));
  assert.match(f.find((t) => /^lectura/.test(t)), /respuesta rota$/, 'solo la primera línea');
  assert.equal(f.filter((t) => !/^lectura/.test(t)).length, 0, 'nada más, ni el cortafuegos');
});
