// Parte 3, bloque B, Task B1: el motor de búsqueda de la subasta (comercio/busqueda.lua), sin interfaz. El jugador busca
// un texto (SendBrowseQuery con ese texto y las páginas que falten hasta HasFullBrowseResults), ve una fila por objeto con
// su precio mínimo y sus unidades, y al pulsar una fila pide sus subastas (SendSearchQuery). Respeta el sistema limitado
// de la subasta, solo vale la última búsqueda pedida y el escaneo de fondo espera mientras se busca. Las búsquedas
// recientes y favoritas se guardan en la cuenta, sin nombres de jugadores.
import assert from 'node:assert/strict';
import { crearMaquina } from '../src/maquina.js';
// Todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo se saltan.
import { sinErrores, testConComercio as test } from './ayuda.js';

const HORDA_NORMAL = { reino: 'Normal', faccion: 'Horde' };
const B = 'SnetForever.Busqueda';
const EVENTOS = ['AUCTION_HOUSE_BROWSE_RESULTS_UPDATED', 'AUCTION_HOUSE_BROWSE_RESULTS_ADDED', 'AUCTION_HOUSE_THROTTLED_SYSTEM_READY',
  'COMMODITY_SEARCH_RESULTS_UPDATED', 'ITEM_SEARCH_RESULTS_UPDATED'];

// MB apunta cada SNF_COMERCIO_BUSQUEDA: {t = GetTime(), e = estado}.
function maquina() {
  const m = crearMaquina({ jugador: HORDA_NORMAL });
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, nivel: 5 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1, nivel: 15 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 2, nivel: 25 });
  m.itemInfo(15000, { nombre: 'Espada de prueba', calidad: 3, nivel: 22 });
  m.lua(`rawset(_G, "MB", {})
    SnetForever.escuchar("SNF_COMERCIO_BUSQUEDA", function(e) MB[#MB + 1] = {t = GetTime(), e = e} end)`);
  return m;
}

// Lo que da navegar: una lista de filas en Lua ({itemID | itemKey, totalQuantity, minPrice}).
function publicar(m, filas, porPagina = 50) {
  m.lua(`BANCO.ponerSubasta({navegar = {${filas.join(', ')}}, porPagina = ${porPagina}})`);
}

// n filas de 2000 + i, con i unidades a 10 * i de cobre.
function filasSeguidas(n) {
  const filas = [];
  for (let i = 1; i <= n; i++) filas.push(`{itemID = ${2000 + i}, totalQuantity = ${i}, minPrice = ${10 * i}}`);
  return filas;
}

const abrir = (m) => m.disparar('AUCTION_HOUSE_SHOW');
const cerrar = (m) => m.disparar('AUCTION_HOUSE_CLOSED');
const estado = (m) => m.lua(`${B}.estado()`);
const resultados = (m) => m.lua(`${B}.resultados()`) || [];
const escaneo = (m) => m.lua('SnetForever.Escaneo.estado()');
const textos = (m) => m.llamadas('C_AuctionHouse.SendBrowseQuery').map((a) => a[0].searchString);
const masPaginas = (m) => m.llamadas('C_AuctionHouse.RequestMoreBrowseResults').length;
const perdidas = (m) => m.llamadas('C_AuctionHouse:limitada').length + m.llamadas('C_AuctionHouse:ignorada').length;
const buscar = (m, texto) => m.lua(`${B}.buscar(${JSON.stringify(texto)})`);

// Avanza de fotograma en fotograma hasta que se cumpla `cond` (como mucho `max` fotogramas).
function hasta(m, cond, max = 400) {
  for (let i = 0; i < max && !cond(); i++) m.avanzar(0.05);
  return cond();
}

// Abre la subasta y deja acabar el escaneo de la apertura.
function abrirYEscanear(m) {
  abrir(m);
  assert.ok(hasta(m, () => escaneo(m) === 'completo'), 'el escaneo de la apertura acaba');
}

// Ningún fotograma tiene dos SNF_COMERCIO_BUSQUEDA.
function unoPorFotograma(m) {
  const vistos = new Set();
  for (const a of m.lua('MB') || []) {
    assert.ok(!vistos.has(a.t), `dos avisos en el mismo fotograma (${a.t})`);
    vistos.add(a.t);
  }
}

test('buscar «paño» lanza SendBrowseQuery con ese texto y da una fila por objeto con su precio mínimo y cantidad', () => {
  const m = maquina();
  publicar(m, [
    '{itemID = 2589, totalQuantity = 20, minPrice = 120}',
    '{itemID = 2592, totalQuantity = 7, minPrice = 300}',
    '{itemKey = {itemID = 15000, itemLevel = 20}, totalQuantity = 1, minPrice = 5000}',
    '{itemKey = {itemID = 15000, itemLevel = 25}, totalQuantity = 2, minPrice = 8000}',
  ]);
  abrirYEscanear(m);
  assert.equal(estado(m), 'parada', 'sin buscar nada, parada');
  const antes = textos(m).length;
  assert.equal(buscar(m, '  paño '), true);
  const enviadas = m.llamadas('C_AuctionHouse.SendBrowseQuery').slice(antes);
  assert.equal(enviadas.length, 1, 'una búsqueda');
  assert.deepEqual(enviadas[0][0], { searchString: 'paño', sorts: [], filters: [], itemClassFilters: [] },
    'el texto recortado, con filters e itemClassFilters (sin ellos WoW Forever no devuelve nada)');
  assert.equal(estado(m), 'buscando');
  m.avanzar(0.05);
  assert.equal(estado(m), 'completa');
  const r = resultados(m);
  assert.equal(r.length, 4, 'una fila por objeto (el equipo, una por nivel)');
  const lino = r.find((f) => f.item === 2589);
  assert.equal(lino.nombre, 'Paño de lino');
  assert.equal(lino.calidad, 1);
  assert.equal(lino.nivel, 5);
  assert.equal(lino.cantidad, 20);
  assert.equal(lino.precioMin, 120);
  assert.equal(lino.clave.itemID, 2589);
  const espadas = r.filter((f) => f.item === 15000).sort((a, b) => a.nivel - b.nivel);
  assert.deepEqual(espadas.map((f) => [f.nivel, f.cantidad, f.precioMin, f.clave.itemLevel]), [[20, 1, 5000, 20], [25, 2, 8000, 25]]);
  const mb = m.lua('MB').map((a) => a.e);
  assert.equal(mb[mb.length - 1], 'completa', 'avisa al acabar');
  unoPorFotograma(m);
  // Lo que devuelve es una copia: cambiarlo no cambia la búsqueda.
  m.lua(`${B}.resultados()[1].cantidad = 999`);
  assert.notEqual(resultados(m)[0].cantidad, 999);
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

test('pide páginas hasta HasFullBrowseResults', () => {
  const m = maquina();
  publicar(m, filasSeguidas(5), 2);
  abrirYEscanear(m);
  const mas = masPaginas(m);
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 100));
  assert.equal(masPaginas(m) - mas, 2, '5 filas de 2 en 2: la primera página y dos más');
  const r = resultados(m);
  assert.deepEqual(r.map((f) => f.item).sort(), [2001, 2002, 2003, 2004, 2005]);
  assert.deepEqual(r.map((f) => f.cantidad).sort(), [1, 2, 3, 4, 5], 'sin filas repetidas ni sumadas dos veces');
  m.avanzar(5);
  assert.equal(masPaginas(m) - mas, 2, 'acabada, no pide más');
  assert.equal(perdidas(m), 0, 'ninguna búsqueda perdida por el sistema limitado');
  unoPorFotograma(m);
  sinErrores(m);
});

test('con el sistema limitado ocupado espera al evento y luego busca', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  abrirYEscanear(m);
  const antes = textos(m).length;
  m.lua('BANCO.ponerSubasta({lista = false})');
  assert.equal(buscar(m, 'lino'), true, 'la pide aunque tenga que esperar');
  assert.equal(estado(m), 'esperando');
  assert.equal(m.lua(`${B}.ocupada()`), true);
  m.avanzar(3);
  assert.equal(textos(m).length, antes, 'no la lanza mientras el sistema no está libre');
  assert.equal(perdidas(m), 0, 'ni la pierde lanzándola');
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  assert.deepEqual(textos(m).slice(antes), ['lino'], 'con el evento, la lanza');
  assert.equal(estado(m), 'buscando');
  m.avanzar(0.05);
  assert.equal(estado(m), 'completa');
  assert.equal(resultados(m).length, 1);
  // Si el evento se pierde, mira cada segundo.
  m.lua('BANCO.ponerSubasta({lista = false})');
  assert.equal(buscar(m, 'seda'), true);
  m.avanzar(2);
  m.lua('BANCO.ponerSubasta({lista = true})');
  assert.ok(hasta(m, () => textos(m).length === antes + 2, 25), 'sin el evento, la lanza al volver a mirar');
  assert.ok(hasta(m, () => estado(m) === 'completa', 5));
  assert.equal(perdidas(m), 0);
  unoPorFotograma(m);
  sinErrores(m);
});

test('dos búsquedas seguidas: solo cuentan los resultados de la última', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  abrirYEscanear(m);
  const antes = textos(m).length;
  assert.equal(buscar(m, 'lino'), true);
  assert.equal(buscar(m, 'lana'), true);
  assert.equal(buscar(m, 'seda'), true);
  assert.equal(estado(m), 'esperando', 'la última espera a que acabe la que ya salió');
  assert.deepEqual(textos(m).slice(antes), ['lino'], 'la de en medio ni sale');
  m.avanzar(0.05); // llega lo de «lino» (se descarta) y sale «seda»
  assert.deepEqual(textos(m).slice(antes), ['lino', 'seda']);
  assert.equal(resultados(m).length, 0, 'lo de «lino» no cuenta');
  publicar(m, ['{itemID = 4306, totalQuantity = 3, minPrice = 900}', '{itemID = 2592, totalQuantity = 1, minPrice = 50}']);
  m.avanzar(0.05);
  assert.equal(estado(m), 'completa');
  assert.deepEqual(resultados(m).map((f) => f.item).sort(), [2592, 4306], 'solo lo de «seda»');
  assert.equal(perdidas(m), 0, 'sin búsquedas perdidas por el sistema limitado');
  // A mitad de las páginas de una, otra: las páginas de la vieja no se mezclan.
  publicar(m, filasSeguidas(6), 2);
  assert.equal(buscar(m, 'uno'), true);
  m.avanzar(0.05); // primera página de «uno» y pide más
  assert.equal(estado(m), 'buscando');
  assert.equal(buscar(m, 'dos'), true);
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  assert.ok(hasta(m, () => estado(m) === 'completa', 100));
  assert.deepEqual(resultados(m).map((f) => f.item), [2589], 'nada de «uno»');
  assert.equal(textos(m)[textos(m).length - 1], 'dos');
  assert.equal(perdidas(m), 0);
  unoPorFotograma(m);
  sinErrores(m);
});

test('la búsqueda del jugador no cuenta como ajena para el escaneo, y el escaneo espera mientras se busca', () => {
  const m = maquina();
  publicar(m, filasSeguidas(10), 2);
  abrir(m);
  assert.ok(hasta(m, () => masPaginas(m) >= 1), 'el escaneo de la apertura navega por páginas');
  assert.equal(escaneo(m), 'escaneando');
  const antes = textos(m).length;
  // ORDEN apunta cada búsqueda de navegar con el estado de la nuestra en ese momento.
  m.lua(`rawset(_G, "ORDEN", {})
    hooksecurefunc(C_AuctionHouse, "SendBrowseQuery", function(q) ORDEN[#ORDEN + 1] = {q.searchString, ${B}.estado()} end)
    hooksecurefunc(C_AuctionHouse, "RequestMoreBrowseResults", function() ORDEN[#ORDEN + 1] = {"+", ${B}.estado()} end)`);
  assert.equal(buscar(m, 'paño'), true);
  const visto = new Set();
  assert.ok(hasta(m, () => {
    visto.add(`${escaneo(m)}:${m.lua('SnetForever.Escaneo.motivo()')}`);
    return estado(m) === 'completa';
  }, 200));
  // Mientras se busca, el escaneo no lanza nada: desde «paño» hasta acabar, solo sus páginas.
  const orden = m.lua('ORDEN');
  const desde = orden.findIndex((o) => o[0] === 'paño');
  const durante = orden.slice(desde + 1).filter((o) => o[1] !== 'completa');
  assert.deepEqual(durante.map((o) => o[0]), ['+', '+', '+', '+'], 'el escaneo no navega mientras se busca');
  assert.ok(visto.has('esperando:busqueda'), `el escaneo espera por la búsqueda (${[...visto].join(', ')})`);
  assert.ok(![...visto].some((v) => v.endsWith(':ajena')), 'no la cuenta como ajena');
  const r = resultados(m);
  assert.equal(r.length, 10);
  assert.deepEqual(r.map((f) => f.cantidad).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'sin páginas del escaneo mezcladas');
  // Acabada la búsqueda, el escaneo sigue enseguida (sin la calma de una búsqueda ajena) y acaba.
  m.avanzar(1.5);
  assert.deepEqual(textos(m).slice(antes), ['paño', ''], 'el escaneo vuelve a navegar antes de 5 s');
  assert.ok(hasta(m, () => escaneo(m) === 'completo'));
  assert.equal(m.lua('SnetForever.Escaneo.motivo()'), undefined);
  assert.equal(m.lua('local n = 0; for _ in pairs(SnetForever.Escaneo.datos()) do n = n + 1 end; return n'), 10);
  assert.deepEqual(resultados(m).length, 10, 'los resultados de la búsqueda se quedan');
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

test('subastas(item) de una mercancía y de un objeto, con vendedor solo en memoria', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}', '{itemID = 4306, totalQuantity = 3, minPrice = 4500}']);
  m.lua(`BANCO.ponerSubasta({
    mercancias = {[2589] = {{quantity = 5, unitPrice = 100, timeLeftSeconds = 3600}, {quantity = 10, unitPrice = 120}}},
    objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000, bidAmount = 4000, timeLeftSeconds = 7200}, {quantity = 2, buyoutAmount = 9000}}},
  })`);
  // El falso no da vendedores: se los pone aquí (owners, como en el cliente).
  m.lua(`local A = C_AuctionHouse
    local mercancia, objeto = A.GetCommoditySearchResultInfo, A.GetItemSearchResultInfo
    A.GetCommoditySearchResultInfo = function(...) local r = mercancia(...) if r then r.owners = {"Fulano"} end return r end
    A.GetItemSearchResultInfo = function(...) local r = objeto(...) if r then r.owners = {"Mengano"} end return r end`);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  m.avanzar(0.05);
  assert.equal(estado(m), 'completa');
  // Mercancía.
  assert.equal(m.lua(`${B}.subastas(2589)`), undefined, 'sin pedirla, nada');
  assert.equal(m.llamadas('C_AuctionHouse.SendSearchQuery').length, 0, 'leer no pide nada');
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), true);
  assert.equal(m.lua(`${B}.subastas(2589)`), undefined, 'aún no ha llegado');
  const pedidas = m.llamadas('C_AuctionHouse.SendSearchQuery');
  assert.equal(pedidas.length, 1);
  assert.equal(pedidas[0][0].itemID, 2589);
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), true);
  assert.equal(m.llamadas('C_AuctionHouse.SendSearchQuery').length, 1, 'pedir otra vez la que está en camino no la relanza');
  m.avanzar(0.05);
  const lino = m.lua(`${B}.subastas(2589)`);
  assert.equal(lino.length, 2);
  // B2r, punto 3: una mercancía no lleva vendedor aunque el cliente traiga owners (solo en algunos escalones).
  assert.deepEqual([lino[0].cantidad, lino[0].precioUnidad, lino[0].tiempo, lino[0].vendedor], [5, 100, 3600, undefined]);
  assert.deepEqual([lino[1].cantidad, lino[1].precioUnidad, lino[1].vendedor], [10, 120, undefined]);
  assert.equal(lino[0].puja, undefined, 'una mercancía no tiene puja');
  // Objeto, pedido desde la fila (con su clave), y de una en una: pedir otro antes de que llegue deja solo el último.
  const fila = resultados(m).findIndex((f) => f.item === 4306) + 1;
  assert.equal(m.lua(`${B}.subastas(2589)`).length, 2);
  assert.equal(m.lua(`${B}.subastas(4306)`), undefined, 'otro objeto sin pedir: nada');
  assert.equal(m.lua(`${B}.pedirSubastas(2592)`), true);
  assert.equal(m.lua(`${B}.subastas(2589)`), undefined, 'pedir otro olvida el anterior');
  assert.equal(m.lua(`${B}.pedirSubastas(${B}.resultados()[${fila}])`), true);
  assert.equal(m.lua(`${B}.subastas(${B}.resultados()[${fila}])`), undefined);
  m.avanzar(0.05); // llega lo de 2592 (se descarta) y sale la de 4306
  m.avanzar(0.05);
  const seda = m.lua(`${B}.subastas(4306)`);
  assert.equal(seda.length, 2);
  assert.deepEqual([seda[0].cantidad, seda[0].precioUnidad, seda[0].puja, seda[0].tiempo, seda[0].vendedor], [1, 5000, 4000, 7200, 'Mengano']);
  // Arreglo de la compra suelta: en WoW Forever la fila de objeto agrupa 2 subastas iguales de 1 y buyoutAmount es lo que
  // cuesta UNA: Ctd 1 (lo que compra un clic), su precio entero y 2 iguales.
  assert.deepEqual([seda[1].cantidad, seda[1].precioUnidad, seda[1].total, seda[1].iguales, seda[1].vendedor], [1, 9000, 9000, 2, 'Mengano']);
  assert.equal(seda[0].iguales, 1);
  assert.deepEqual(m.llamadas('C_AuctionHouse.SendSearchQuery').map((a) => a[0].itemID), [2589, 2592, 4306]);
  assert.equal(perdidas(m), 0);
  // El vendedor no se guarda en ningún sitio.
  const guardado = JSON.stringify(m.guardado());
  assert.ok(!guardado.includes('Fulano') && !guardado.includes('Mengano'), 'ningún nombre de jugador en las SavedVariables');
  // Al salir o buscar otra cosa, las subastas (y sus vendedores) se olvidan.
  m.lua(`${B}.salir()`);
  assert.equal(estado(m), 'parada');
  assert.deepEqual(resultados(m), []);
  assert.equal(m.lua(`${B}.ocupada()`), false);
  unoPorFotograma(m);
  sinErrores(m);
});

test('recientes: la nueva primero, sin repetidas, como mucho 20, guardadas sin nombres de jugadores', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  abrirYEscanear(m);
  assert.deepEqual(m.lua(`${B}.recientes()`), []);
  for (let i = 1; i <= 22; i++) assert.equal(buscar(m, `b${i}`), true);
  let r = m.lua(`${B}.recientes()`);
  assert.equal(r.length, 20, 'como mucho 20');
  assert.equal(r[0], 'b22', 'la más nueva primero');
  assert.equal(r[19], 'b3');
  assert.equal(buscar(m, ' B10 '), true);
  r = m.lua(`${B}.recientes()`);
  assert.equal(r.length, 20);
  assert.equal(r[0], 'B10', 'la repetida sube arriba con lo último que se escribió');
  assert.equal(r.filter((t) => t.toLowerCase() === 'b10').length, 1, 'sin repetidas (sin mirar mayúsculas)');
  // Favoritas.
  assert.equal(m.lua(`${B}.marcarFavorita("lino", true)`), true);
  assert.equal(m.lua(`${B}.marcarFavorita("seda", true)`), true);
  assert.equal(m.lua(`${B}.marcarFavorita("lino", true)`), true);
  assert.deepEqual(m.lua(`${B}.favoritas()`), ['lino', 'seda']);
  assert.equal(m.lua(`${B}.marcarFavorita("LINO", false)`), true);
  assert.deepEqual(m.lua(`${B}.favoritas()`), ['seda']);
  assert.equal(m.lua(`${B}.marcarFavorita("   ", true)`), false);
  // Lo guardado: solo los textos buscados.
  const g = m.lua('SnetForeverCuenta.comercio.busquedas');
  assert.deepEqual(Object.keys(g).sort(), ['favoritas', 'recientes']);
  assert.deepEqual(g.recientes, r);
  assert.deepEqual(g.favoritas, ['seda']);
  // Algo raro en lo guardado (un archivo de SavedVariables estropeado) no estorba: se limpia.
  m.lua(`SnetForeverCuenta.comercio.busquedas = {recientes = {"uno", {vendedor = "Fulano"}, 7, "dos"}, otro = "Fulano"}`);
  assert.deepEqual(m.lua(`${B}.recientes()`), ['uno', 'dos']);
  assert.deepEqual(m.lua(`${B}.favoritas()`), []);
  assert.ok(!JSON.stringify(m.lua('SnetForeverCuenta.comercio.busquedas')).includes('Fulano'));
  // Sobreviven a /reload.
  m.lua(`SnetForeverCuenta.comercio.busquedas = nil`);
  assert.equal(buscar(m, 'B10'), true);
  assert.equal(m.lua(`${B}.marcarFavorita("seda", true)`), true);
  const m2 = m.recargar();
  assert.deepEqual(m2.lua(`${B}.favoritas()`), ['seda']);
  assert.equal(m2.lua(`${B}.recientes()`)[0], 'B10');
  sinErrores(m2);
});

test('cerrar la subasta para todo y no deja oyentes ni temporizadores', () => {
  const m = maquina();
  publicar(m, filasSeguidas(10), 2);
  m.lua('BANCO.ponerSubasta({mercancias = {[2001] = {{quantity = 1, unitPrice = 10}}}})');
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  m.avanzar(0.05); // a mitad de las páginas
  assert.equal(estado(m), 'buscando');
  assert.equal(m.lua(`${B}.pedirSubastas(2001)`), true); // pendiente o en camino
  cerrar(m);
  assert.equal(estado(m), 'parada');
  assert.deepEqual(resultados(m), []);
  assert.equal(m.lua(`${B}.ocupada()`), false);
  for (const e of EVENTOS) assert.equal(m.lua(`#(BANCO.eventos.${e} or {})`), 0, `${e} sin registrar`);
  m.lua(`rawset(_G, "TRAS", 0)
    local original = SnetForever.Comercio.ejecutar
    SnetForever.Comercio.ejecutar = function(nombre, ...) if nombre == "busqueda" then TRAS = TRAS + 1 end return original(nombre, ...) end`);
  const n = [textos(m).length, masPaginas(m), m.llamadas('C_AuctionHouse.SendSearchQuery').length];
  const avisos = m.lua('#MB');
  m.avanzar(30);
  assert.equal(m.lua('TRAS'), 0, 'ningún temporizador de la búsqueda llega a trabajar');
  assert.deepEqual([textos(m).length, masPaginas(m), m.llamadas('C_AuctionHouse.SendSearchQuery').length], n, 'nada más sale');
  assert.equal(m.lua('#MB'), avisos, 'ni avisos');
  assert.equal(perdidas(m), 0, 'ni lo intenta con la subasta cerrada');
  assert.equal(buscar(m, 'paño'), false);
  // Al volver a abrir, nada de antes.
  abrir(m);
  assert.equal(estado(m), 'parada');
  assert.deepEqual(resultados(m), []);
  sinErrores(m);
});

test('texto vacío o con la subasta cerrada: false y no se lanza nada', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  assert.equal(buscar(m, 'lino'), false, 'con la subasta cerrada');
  assert.equal(m.lua(`${B}.subastas(2589)`), undefined);
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), false, 'pedir subastas con la subasta cerrada');
  abrirYEscanear(m);
  assert.equal(m.lua(`${B}.pedirSubastas("x")`), false, 'algo que no es un objeto');
  assert.equal(m.llamadas('C_AuctionHouse.SendSearchQuery').length, 0);
  const antes = textos(m).length;
  for (const t of ['', '   ', 'x'.repeat(101), 'ñ'.repeat(101)]) assert.equal(buscar(m, t), false, JSON.stringify(t));
  assert.equal(m.lua(`${B}.buscar(nil)`), false);
  assert.equal(m.lua(`${B}.buscar(42)`), false);
  m.avanzar(1);
  assert.equal(textos(m).length, antes, 'no se lanza nada');
  assert.equal(estado(m), 'parada');
  assert.deepEqual(m.lua(`${B}.recientes()`), [], 'ni se apunta en las recientes');
  assert.equal(buscar(m, 'ñ'.repeat(100)), true, '100 letras sí (aunque sean 200 bytes)');
  sinErrores(m);
});

test('salir borra los resultados y vuelve a parada sin lanzar nada', () => {
  const m = maquina();
  publicar(m, filasSeguidas(6), 2);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  m.avanzar(0.05);
  assert.equal(estado(m), 'buscando');
  const n = [textos(m).length, masPaginas(m)];
  m.lua(`${B}.salir()`);
  assert.equal(estado(m), 'parada');
  assert.deepEqual(resultados(m), []);
  m.avanzar(3);
  assert.equal(estado(m), 'parada');
  assert.deepEqual(resultados(m), [], 'las páginas que aún llegan no cuentan');
  assert.ok(masPaginas(m) - n[1] <= 0, 'no pide más páginas');
  assert.equal(textos(m).length, n[0]);
  assert.equal(m.lua('MB[#MB].e'), 'parada', 'avisa de que está parada');
  unoPorFotograma(m);
  sinErrores(m);
});

test('una búsqueda ajena a mitad deja la nuestra completa con lo recibido (motivo ajena)', () => {
  const m = maquina();
  publicar(m, filasSeguidas(6), 2);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  m.avanzar(0.05);
  assert.equal(estado(m), 'buscando');
  assert.equal(resultados(m).length, 2);
  m.avanzar(0.05); // el sistema queda libre
  m.lua('C_AuctionHouse.SendBrowseQuery({searchString = "otra", sorts = {}, filters = {}, itemClassFilters = {}})');
  assert.equal(estado(m), 'completa');
  assert.equal(m.lua(`${B}.motivo()`), 'ajena');
  const r = resultados(m).length;
  m.avanzar(2);
  assert.equal(resultados(m).length, r, 'las páginas de la otra no entran');
  sinErrores(m);
});

test('un fallo dentro de la búsqueda va al cortafuegos del comercio y la para', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  abrirYEscanear(m);
  m.lua('C_AuctionHouse.GetBrowseResults = function() error("roto") end');
  assert.equal(buscar(m, 'paño'), true);
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false, 'el comercio se apaga');
  assert.equal(estado(m), 'parada');
  assert.match(m.lua('SnetForeverCuenta.fallos[#SnetForeverCuenta.fallos].texto'), /roto/);
  for (const e of EVENTOS) assert.equal(m.lua(`#(BANCO.eventos.${e} or {})`), 0, `${e} sin registrar`);
  sinErrores(m);
});

test('subastas() solo lee: llamarla muchas veces, también tras salir() o tras una búsqueda nueva, no lanza ninguna SendSearchQuery', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}']);
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 5, unitPrice = 100}}}})');
  abrirYEscanear(m);
  const pedidas = () => m.llamadas('C_AuctionHouse.SendSearchQuery').length;
  // Como un repintado en cada fotograma.
  const repintar = (veces) => {
    for (let i = 0; i < veces; i++) {
      m.lua(`${B}.subastas(2589); ${B}.subastas(${B}.resultados()[1] or 2589)`);
      m.avanzar(0.05);
    }
  };
  repintar(5);
  assert.equal(pedidas(), 0, 'sin búsqueda');
  assert.equal(buscar(m, 'lino'), true);
  repintar(5);
  assert.equal(pedidas(), 0, 'con la búsqueda hecha');
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), true, 'el clic en la fila');
  repintar(5);
  assert.equal(pedidas(), 1, 'solo la del clic');
  assert.equal(m.lua(`${B}.subastas(2589)`).length, 1);
  m.lua(`${B}.salir()`);
  repintar(5);
  assert.equal(m.lua(`${B}.subastas(2589)`), undefined, 'tras salir no queda nada');
  assert.equal(buscar(m, 'lino'), true);
  repintar(5);
  assert.equal(m.lua(`${B}.subastas(2589)`), undefined, 'una búsqueda nueva olvida las subastas de antes');
  assert.equal(pedidas(), 1, 'ni tras salir ni tras una búsqueda nueva se pide nada solo');
  sinErrores(m);
});

test('el sniper espera mientras se busca: con una búsqueda en marcha y el sistema libre, no lanza nada hasta que termina', () => {
  const m = maquina();
  publicar(m, filasSeguidas(6), 2);
  abrirYEscanear(m);
  // El sniper empieza primero (su oyente del sistema libre va antes que el de la búsqueda) y espera al sistema.
  m.lua('BANCO.ponerSubasta({lista = false})');
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  assert.equal(buscar(m, 'paño'), true);
  assert.equal(estado(m), 'esperando');
  const antes = textos(m).length;
  m.lua(`rawset(_G, "ORDEN", {})
    hooksecurefunc(C_AuctionHouse, "SendBrowseQuery", function(q) ORDEN[#ORDEN + 1] = {q.searchString, ${B}.estado()} end)
    hooksecurefunc(C_AuctionHouse, "RequestMoreBrowseResults", function() ORDEN[#ORDEN + 1] = {"+", ${B}.estado()} end)`);
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  assert.deepEqual(textos(m).slice(antes), ['paño'], 'con el sistema libre sale la búsqueda, no el sniper');
  assert.equal(m.lua('SnetForever.Sniper.motivo()'), 'busqueda');
  assert.ok(hasta(m, () => estado(m) === 'completa', 100));
  const durante = m.lua('ORDEN').filter((o) => o[1] !== 'completa');
  assert.deepEqual(durante.map((o) => o[0]), ['paño', '+', '+'], 'mientras se busca, solo nuestras páginas');
  assert.equal(resultados(m).length, 6);
  assert.equal(perdidas(m), 0);
  m.lua('SnetForever.Sniper.parar()');
  sinErrores(m);
});

test('ronda 1: con el sistema libre antes que los resultados, bajo «seda» nunca salen filas de «paño»', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  abrirYEscanear(m);
  m.lua('BANCO.ponerSubasta({libreAntes = true})');
  const antes = textos(m).length;
  assert.equal(buscar(m, 'paño'), true);
  assert.equal(buscar(m, 'seda'), true);
  m.avanzar(0.05); // llega el sistema libre y después lo de «paño», que se tira; entonces sale «seda»
  assert.deepEqual(resultados(m), [], 'nada de «paño»');
  publicar(m, ['{itemID = 4306, totalQuantity = 3, minPrice = 900}']);
  assert.ok(hasta(m, () => estado(m) === 'completa', 20));
  assert.deepEqual(textos(m).slice(antes), ['paño', 'seda']);
  assert.deepEqual(resultados(m).map((f) => f.item), [4306], 'solo lo de «seda»');
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

test('ronda 1: un navegar viejo que nunca responde no bloquea la nueva: plazo corto tras el sistema libre', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  abrirYEscanear(m);
  // «paño» sale, pero su respuesta se pierde (el falso no responde) y el sistema queda libre sin más.
  m.lua(`local original = C_AuctionHouse.SendBrowseQuery
    C_AuctionHouse.SendBrowseQuery = function(q) if q.searchString == "paño" then return end return original(q) end`);
  assert.equal(buscar(m, 'paño'), true);
  assert.equal(buscar(m, 'seda'), true);
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  assert.equal(estado(m), 'esperando', 'con el sistema libre no suelta al momento un navegar viejo');
  m.avanzar(1);
  assert.equal(estado(m), 'esperando');
  m.avanzar(1.5);
  assert.ok(estado(m) === 'buscando' || estado(m) === 'completa', 'pasado el plazo, sale «seda»');
  assert.ok(hasta(m, () => estado(m) === 'completa', 5));
  assert.deepEqual(resultados(m).map((f) => f.item), [2589]);
  sinErrores(m);
});

test('ronda 1: la búsqueda deja pasar a la compra que busca su subasta', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}']);
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 15, unitPrice = 100}}}})');
  m.lua('BANCO.jugador.dinero = 10000000');
  abrirYEscanear(m);
  m.lua('BANCO.ponerSubasta({lista = false})');
  const antes = textos(m).length;
  assert.equal(buscar(m, 'paño'), true); // su oyente del sistema libre va antes que el de la compra
  assert.equal(m.lua('SnetForever.Compra.elegir(2589, {precio = 100, cantidad = 15})'), true);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'buscando');
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  assert.equal(m.llamadas('C_AuctionHouse.SendSearchQuery').length, 1, 'sale la de la compra');
  assert.deepEqual(textos(m).slice(antes), [], 'y la búsqueda espera');
  assert.ok(hasta(m, () => estado(m) === 'completa', 60), 'en cuanto la compra deja de buscar, sale la búsqueda');
  assert.deepEqual(textos(m).slice(antes), ['paño']);
  assert.deepEqual([m.lua('SnetForever.Compra.estado().fase'), m.lua('SnetForever.Compra.estado().motivo')], ['lista', undefined]);
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

test('ronda 1: para el sniper nuestras búsquedas no son ajenas (ni cuentan dos veces ni lo paran 5 s ni 60 s)', () => {
  const m = maquina();
  publicar(m, filasSeguidas(4), 2);
  abrirYEscanear(m);
  const t0 = m.lua('GetTime()');
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  // Su primera vuelta (4 filas de 2 en 2) acaba enseguida; la siguiente toca 5 s después. Se busca a los 3,5 s: una
  // calma de 5 s desde nuestra última búsqueda la retrasaría hasta pasados los 8 s.
  m.avanzar(3.5);
  const vueltas = m.lua('SnetForever.Sniper.vueltas()');
  assert.equal(vueltas, 1);
  const cuenta = m.lua('SnetForever.Comercio.busquedasRecientes(600)');
  const envios = () => textos(m).length + masPaginas(m) + m.llamadas('C_AuctionHouse.SendSearchQuery').length;
  const antes = envios();
  m.lua('BANCO.ponerSubasta({mercancias = {[2001] = {{quantity = 1, unitPrice = 10}}}})');
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  assert.equal(m.lua(`${B}.pedirSubastas(2001)`), true);
  assert.ok(hasta(m, () => m.lua(`${B}.subastas(2001)`) !== undefined, 40));
  assert.equal(m.lua('SnetForever.Sniper.vueltas()'), vueltas, 'el sniper no ha dado otra vuelta entretanto');
  assert.equal(m.lua('SnetForever.Comercio.busquedasRecientes(600)') - cuenta, envios() - antes,
    'cada búsqueda nuestra cuenta una vez');
  assert.notEqual(m.lua('SnetForever.Sniper.motivo()'), 'ajena');
  // Sigue con su ritmo (comercioSniperCada = 5 s): ni la calma de 5 s ni los 60 s de una búsqueda ajena con texto.
  assert.ok(hasta(m, () => m.lua('GetTime()') >= t0 + 6, 100));
  assert.ok(m.lua('SnetForever.Sniper.vueltas()') > vueltas, 'a los 6 s de empezar ya ha dado su segunda vuelta');
  m.lua('SnetForever.Sniper.parar()');
  sinErrores(m);
});

test('ronda 1: las subastas de equipo se casan por la itemKey entera (dos niveles de la misma espada)', () => {
  const m = maquina();
  publicar(m, ['{itemKey = {itemID = 15000, itemLevel = 20}, totalQuantity = 1, minPrice = 5000}',
    '{itemKey = {itemID = 15000, itemLevel = 25}, totalQuantity = 2, minPrice = 8000}']);
  m.lua('BANCO.ponerSubasta({objetos = {[15000] = {{quantity = 1, buyoutAmount = 8000}}}, nivelObjetos = {[15000] = 25}})');
  abrirYEscanear(m);
  assert.equal(buscar(m, 'espada'), true);
  m.avanzar(0.05);
  const i25 = resultados(m).findIndex((f) => f.nivel === 25) + 1;
  const i20 = i25 === 1 ? 2 : 1;
  assert.equal(m.lua(`${B}.pedirSubastas(${B}.resultados()[${i25}])`), true);
  // Llega antes otra respuesta de la misma espada a nivel 20 (por ejemplo, la de otra búsqueda): no es la nuestra.
  m.disparar('ITEM_SEARCH_RESULTS_UPDATED', { itemID: 15000, itemLevel: 20, itemSuffix: 0, battlePetSpeciesID: 0 });
  assert.equal(m.lua(`${B}.subastas(${B}.resultados()[${i25}])`), undefined, 'la de nivel 20 no se toma por la de 25');
  m.avanzar(0.05);
  const r = m.lua(`${B}.subastas(${B}.resultados()[${i25}])`);
  assert.equal(r.length, 1, 'llega la de nivel 25');
  assert.equal(r[0].precioUnidad, 8000);
  assert.equal(m.lua(`${B}.subastas(${B}.resultados()[${i20}])`), undefined, 'la de nivel 20 no tiene subastas');
  sinErrores(m);
});

test('ronda 1: las recientes repetidas se reconocen sin mirar mayúsculas también con ñ y acentos', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  assert.equal(buscar(m, 'PAÑO'), true);
  assert.equal(buscar(m, 'acción'), true);
  assert.equal(buscar(m, 'ACCIÓN'), true);
  assert.equal(buscar(m, 'Pingüino Él Ánfora Íd Úrsula'), true);
  assert.equal(buscar(m, 'PINGÜINO él ánfora íd úrsula'), true);
  assert.deepEqual(m.lua(`${B}.recientes()`), ['PINGÜINO él ánfora íd úrsula', 'ACCIÓN', 'PAÑO']);
  assert.equal(m.lua(`${B}.marcarFavorita("Ñandú", true)`), true);
  assert.equal(m.lua(`${B}.marcarFavorita("ÑANDÚ", false)`), true);
  assert.deepEqual(m.lua(`${B}.favoritas()`), []);
  sinErrores(m);
});

test('ronda 1: al volver a pedir unas subastas, la lista vieja se queda (pendiente) hasta que llega la nueva, y se dice si está entera', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}']);
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 5, unitPrice = 100}}}})');
  abrirYEscanear(m);
  assert.equal(buscar(m, 'lino'), true);
  m.avanzar(0.05);
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), true);
  m.avanzar(0.05);
  const info = () => m.lua(`local l, i = ${B}.subastas(2589); return i`);
  assert.deepEqual(m.lua(`${B}.subastas(2589)`).map((f) => f.cantidad), [5]);
  assert.deepEqual(info(), { pendiente: false, completa: true });
  // Otra vez: la vieja sigue a la vista, marcada como pendiente.
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 5, unitPrice = 100}, {quantity = 2, unitPrice = 150}}}})');
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), true);
  assert.deepEqual(m.lua(`${B}.subastas(2589)`).map((f) => f.cantidad), [5], 'no se vacía');
  assert.equal(info().pendiente, true);
  m.avanzar(0.05);
  assert.deepEqual(m.lua(`${B}.subastas(2589)`).map((f) => f.cantidad), [5, 2], 'llega la nueva');
  assert.deepEqual(info(), { pendiente: false, completa: true });
  // Una lista a medias lo dice.
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return false end');
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), true);
  m.avanzar(0.05);
  assert.deepEqual(info(), { pendiente: false, completa: false });
  sinErrores(m);
});

test('ronda 1: recientes() y favoritas() no rehacen nada en cada llamada', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'lino'), true);
  m.lua(`${B}.recientes()`);
  assert.equal(m.lua(`local g = SnetForeverCuenta.comercio.busquedas; ${B}.recientes(); ${B}.favoritas(); return rawequal(g, SnetForeverCuenta.comercio.busquedas)`), true,
    'la tabla guardada no se crea otra vez');
  assert.equal(m.lua(`return rawequal(${B}.recientes(), ${B}.recientes())`), true, 'la misma copia mientras no cambia nada');
  assert.equal(m.lua(`return rawequal(${B}.favoritas(), ${B}.favoritas())`), true);
  assert.equal(m.lua(`local a = ${B}.recientes(); ${B}.buscar("seda"); return rawequal(a, ${B}.recientes())`), false, 'tras un cambio, otra');
  assert.deepEqual(m.lua(`${B}.recientes()`), ['seda', 'lino']);
  assert.equal(m.lua(`local a = ${B}.favoritas(); ${B}.marcarFavorita("seda", true); return rawequal(a, ${B}.favoritas())`), false);
  assert.deepEqual(m.lua(`${B}.favoritas()`), ['seda']);
  sinErrores(m);
});

test('ronda 2: un navegar del sniper en camino no se cuela bajo «paño» aunque el sistema libre llegue antes que sus resultados', () => {
  const m = maquina();
  publicar(m, filasSeguidas(4), 50);
  abrirYEscanear(m);
  m.lua('BANCO.ponerSubasta({libreAntes = true})');
  const antes = textos(m).length;
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  assert.deepEqual(textos(m).slice(antes), [''], 'el navegar del sniper sale y va en camino');
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), true);
  assert.equal(buscar(m, 'paño'), true);
  assert.equal(estado(m), 'esperando');
  m.avanzar(0.05); // el sistema libre y después los resultados del sniper, que son suyos
  assert.deepEqual(textos(m).slice(antes), [''], 'la búsqueda espera a la respuesta del sniper');
  assert.deepEqual(resultados(m), []);
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  assert.deepEqual(textos(m).slice(antes), ['', 'paño']);
  assert.deepEqual(resultados(m).map((f) => f.item), [2589], 'ninguna fila del sniper');
  assert.equal(perdidas(m), 0);
  m.lua('SnetForever.Sniper.parar()');
  sinErrores(m);
});

test('ronda 2: un navegar del escaneo en camino tampoco se cuela', () => {
  const m = maquina();
  publicar(m, filasSeguidas(4), 50);
  m.lua('BANCO.ponerSubasta({libreAntes = true})');
  abrir(m);
  assert.ok(hasta(m, () => textos(m).length === 1), 'el escaneo de la apertura navega');
  assert.equal(m.lua('SnetForever.Escaneo.enCamino()'), true);
  assert.equal(buscar(m, 'paño'), true);
  m.avanzar(0.05); // el sistema libre y después los resultados del escaneo
  assert.deepEqual(textos(m), [''], 'la búsqueda espera a la respuesta del escaneo');
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  assert.deepEqual(resultados(m).map((f) => f.item), [2589], 'ninguna fila del escaneo');
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

test('ronda 2: un navegar ajeno en camino que nunca responde no bloquea la búsqueda: plazo corto tras el sistema libre', () => {
  const m = maquina();
  publicar(m, filasSeguidas(4), 50);
  abrirYEscanear(m);
  // El navegar del sniper sale pero su respuesta se pierde; el sistema queda libre sin más.
  m.lua(`local original = C_AuctionHouse.SendBrowseQuery
    C_AuctionHouse.SendBrowseQuery = function(q) if q.searchString == "" then return end return original(q) end`);
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), true);
  assert.equal(buscar(m, 'paño'), true);
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  assert.equal(estado(m), 'esperando', 'con el sistema libre espera al navegar del sniper');
  m.avanzar(1);
  assert.equal(estado(m), 'esperando');
  m.avanzar(1.5);
  assert.ok(hasta(m, () => estado(m) === 'completa', 10), 'pasado el plazo, sale la búsqueda');
  m.lua('SnetForever.Sniper.parar()');
  sinErrores(m);
});

test('ronda 2: con un id suelto, la clave de otro nivel que se acepta no sustituye a la pedida', () => {
  const m = maquina();
  publicar(m, ['{itemKey = {itemID = 15000, itemLevel = 25}, totalQuantity = 2, minPrice = 8000}']);
  m.lua('BANCO.ponerSubasta({objetos = {[15000] = {{quantity = 1, buyoutAmount = 8000}}}, nivelObjetos = {[15000] = 25}})');
  abrirYEscanear(m);
  assert.equal(buscar(m, 'espada'), true);
  m.avanzar(0.05);
  assert.equal(m.lua(`${B}.pedirSubastas(15000)`), true);
  m.avanzar(0.05);
  assert.equal(m.lua(`${B}.subastas(15000)`).length, 1, 'el servidor responde con la clave de nivel 25');
  assert.equal(m.lua(`${B}.pedirSubastas(15000)`), true);
  const q = m.llamadas('C_AuctionHouse.SendSearchQuery');
  assert.equal(q[q.length - 1][0].itemLevel, 0, 'el siguiente pedido va con la clave pedida, no con la de la respuesta');
  m.avanzar(0.05);
  assert.equal(m.lua(`${B}.subastas(15000)`).length, 1);
  sinErrores(m);
});

test('ronda 2: si el juego no tiene HasFull*SearchResults, completa sale false', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}', '{itemID = 4306, totalQuantity = 1, minPrice = 900}']);
  m.lua(`BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 5, unitPrice = 100}}},
    objetos = {[4306] = {{quantity = 1, buyoutAmount = 900}}}})`);
  abrirYEscanear(m);
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = nil; C_AuctionHouse.HasFullItemSearchResults = nil');
  assert.equal(buscar(m, 'paño'), true);
  m.avanzar(0.05);
  const info = (id) => m.lua(`local l, i = ${B}.subastas(${id}); return i`);
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), true);
  m.avanzar(0.05);
  assert.deepEqual(info(2589), { pendiente: false, completa: false }, 'mercancía');
  assert.equal(m.lua(`${B}.pedirSubastas(4306)`), true);
  m.avanzar(0.05);
  assert.deepEqual(info(4306), { pendiente: false, completa: false }, 'objeto');
  sinErrores(m);
});

test('ronda 2: el sniper cortado a mitad de vuelta por la búsqueda empieza otra vuelta en cuanto acaba, sin esperar', () => {
  const m = maquina();
  publicar(m, filasSeguidas(8), 2);
  abrirYEscanear(m);
  m.lua(`rawset(_G, "ORDEN", {})
    hooksecurefunc(C_AuctionHouse, "SendBrowseQuery", function(q) ORDEN[#ORDEN + 1] = {q.searchString, GetTime()} end)`);
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  m.avanzar(0.05); // primera página del sniper; pide la segunda
  const vueltas = m.lua('SnetForever.Sniper.vueltas()');
  assert.equal(vueltas, 1);
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 60));
  const fin = m.lua('GetTime()');
  m.avanzar(1.5);
  const orden = m.lua('ORDEN');
  const despues = orden.filter((o) => o[0] === '' && o[1] > fin - 1e-6);
  assert.ok(despues.length >= 1, 'el sniper vuelve a navegar desde el principio');
  assert.ok(despues[0][1] - fin <= 1.05, `sin la espera de 5 s (${despues[0][1] - fin} s)`);
  assert.equal(m.lua('SnetForever.Sniper.vueltas()'), vueltas + 1, 'es una vuelta nueva');
  assert.notEqual(m.lua('SnetForever.Sniper.motivo()'), 'ajena');
  m.lua('SnetForever.Sniper.parar()');
  sinErrores(m);
});

test('ronda 3: el jugador para el sniper con su navegar en camino y busca enseguida: bajo «paño» nunca salen sus filas', () => {
  const m = maquina();
  publicar(m, filasSeguidas(4), 50);
  abrirYEscanear(m);
  m.lua('BANCO.ponerSubasta({libreAntes = true})');
  const antes = textos(m).length;
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), true);
  m.lua('SnetForever.Sniper.parar()');
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), true, 'parado, su navegar sigue en camino');
  assert.equal(buscar(m, 'paño'), true);
  m.avanzar(0.05); // el sistema libre y después los resultados del sniper parado
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), false, 'llegaron: ya no está en camino');
  assert.deepEqual(resultados(m), []);
  publicar(m, ['{itemID = 2589, totalQuantity = 20, minPrice = 120}']);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  assert.deepEqual(textos(m).slice(antes), ['', 'paño']);
  assert.deepEqual(resultados(m).map((f) => f.item), [2589], 'ninguna fila del sniper');
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

test('ronda 3: pausado por la compra, el navegar del sniper sigue en camino hasta que llega', () => {
  const m = maquina();
  publicar(m, filasSeguidas(4), 50);
  abrirYEscanear(m);
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  m.lua('SnetForever.Sniper.pausar()');
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), true);
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), false);
  m.lua('SnetForever.Sniper.parar()');
  sinErrores(m);
});

test('ronda 3: parado con su navegar en camino y la subasta cerrada, el sniper no deja nada escuchando', () => {
  const m = maquina();
  publicar(m, filasSeguidas(4), 50);
  abrirYEscanear(m);
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  m.lua('SnetForever.Sniper.parar()');
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), true);
  cerrar(m);
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), false, 'con la subasta cerrada no llegará nada');
  for (const e of EVENTOS) assert.equal(m.lua(`#(BANCO.eventos.${e} or {})`), 0, `${e} sin registrar`);
  sinErrores(m);
});

test('ronda 3: un plazo viejo de espera a un navegar ajeno no da por vencida la espera de un envío posterior', () => {
  const m = maquina();
  publicar(m, filasSeguidas(4), 50);
  abrirYEscanear(m);
  // El primer «paño» sale pero no responde (el falso no lo atiende): a los 10 s (ESPERA) se pide otra vez.
  m.lua(`rawset(_G, "PERDER", 1); rawset(_G, "PANO", {})
    local original = C_AuctionHouse.SendBrowseQuery
    C_AuctionHouse.SendBrowseQuery = function(q)
      if q.searchString == "paño" then
        PANO[#PANO + 1] = GetTime()
        if PERDER > 0 then PERDER = PERDER - 1 return end
      end
      return original(q)
    end`);
  m.lua('BANCO.ponerSubasta({libreAntes = true})');
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  m.lua('SnetForever.Sniper.parar()'); // su navegar sigue en camino
  assert.equal(buscar(m, 'paño'), true);
  m.avanzar(0.1); // el sistema libre (empieza un plazo de 2 s), llega lo del sniper y sale «paño», que se pierde
  assert.equal(m.lua('#PANO'), 1);
  const s1 = m.lua('PANO[1]');
  m.avanzar(3); // aquel plazo de 2 s vence ya sin ser de nada: el envío salió antes
  // Al pedirlo otra vez, otro navegar ajeno va en camino: tiene que esperar su propio plazo de 2 s.
  m.lua('SnetForever.Sniper.enCamino = function() return true end');
  assert.ok(hasta(m, () => m.lua('#PANO') >= 2, 400));
  const s2 = m.lua('PANO[2]');
  assert.ok(s2 - s1 >= 10 + 2 - 0.1, `espera el plazo nuevo tras los 10 s (salió a los ${(s2 - s1).toFixed(2)} s)`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B3r: la lectura de cada objeto sin desplegarlo (la vista de resultados la pide uno tras otro, como TSM).
// ---------------------------------------------------------------------------------------------------

const SUBASTAS_B3R = `BANCO.ponerSubasta({
  mercancias = {[2589] = {{quantity = 5, unitPrice = 100, timeLeftSeconds = 3600}, {quantity = 10, unitPrice = 120}}},
  objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000, bidAmount = 4000}, {quantity = 2, buyoutAmount = 9000}}},
})
local A = C_AuctionHouse
local mercancia, objeto = A.GetCommoditySearchResultInfo, A.GetItemSearchResultInfo
A.GetCommoditySearchResultInfo = function(...) local r = mercancia(...) if r then r.owners = {"Fulano"} end return r end
A.GetItemSearchResultInfo = function(...) local r = objeto(...) if r then r.owners = {"Mengano"} end return r end`;
// F4: el resumen lleva su hora (la del servidor al llegar) y, si llegó después una a medias, la de esa (horaPendiente);
// aquí se mira sin ellas (las pruebas de F4 las miran aparte).
const resumenDe = (m, item) => {
  const r = (resultados(m).find((f) => f.item === item) || {}).resumen;
  if (!r) return r;
  const { hora, horaPendiente, ...resto } = r;
  return resto;
};
const horaResumen = (m, item) => ((resultados(m).find((f) => f.item === item) || {}).resumen || {}).hora;
const horaPendienteDe = (m, item) => ((resultados(m).find((f) => f.item === item) || {}).resumen || {}).horaPendiente;
const buscadasDe = (m, item) => m.llamadas('C_AuctionHouse.SendSearchQuery').filter((a) => a[0].itemID === item).length;

test('B3r: leer un objeto guarda en memoria su resumen (subastas, mínimo y disponible), sin vendedores, y no toca la fila abierta', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}', '{itemID = 4306, totalQuantity = 3, minPrice = 4500}',
    '{itemID = 2592, totalQuantity = 7, minPrice = 300}']);
  m.lua(SUBASTAS_B3R);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  assert.equal(m.llamadas('C_AuctionHouse.SendSearchQuery').length, 0, 'buscar no lee nada solo');
  assert.equal(resumenDe(m, 2589), undefined, 'sin leer, sin resumen');
  // La fila abierta (seda): sus subastas enteras.
  assert.equal(m.lua(`${B}.pedirSubastas(4306)`), true);
  m.avanzar(0.05);
  assert.equal(m.lua(`${B}.subastas(4306)`).length, 2);
  // Arreglo de la compra suelta: la segunda fila son 2 subastas iguales de 1 a 9000: 3 subastas, 3 unidades, mínimo 5000.
  assert.deepEqual(resumenDe(m, 4306), { subastas: 3, minimo: 5000, disponible: 3, completa: true }, 'la fila abierta también queda leída');
  // Leer el lino: una SendSearchQuery, un resumen y nada más.
  assert.equal(m.lua(`${B}.pedirSubastas(2589, {leer = true})`), true);
  assert.equal(m.lua(`${B}.leyendo()`), true);
  assert.equal(buscadasDe(m, 2589), 1);
  m.avanzar(0.05);
  assert.equal(m.lua(`${B}.leyendo()`), false);
  assert.deepEqual(resumenDe(m, 2589), { subastas: 2, minimo: 100, disponible: 15, completa: true });
  assert.equal(m.lua(`${B}.subastas(2589)`), undefined, 'leer no da la lista de subastas: solo el resumen');
  assert.equal(m.lua(`${B}.subastas(4306)`).length, 2, 'la fila abierta sigue con sus subastas');
  // Lana: sin subastas.
  assert.equal(m.lua(`${B}.pedirSubastas(2592, {leer = true})`), true);
  m.avanzar(0.05);
  assert.deepEqual(resumenDe(m, 2592), { subastas: 0, disponible: 0, completa: true });
  // Una ya leída no se vuelve a leer.
  assert.equal(m.lua(`${B}.pedirSubastas(2589, {leer = true})`), false);
  m.avanzar(0.1);
  assert.equal(buscadasDe(m, 2589), 1);
  // Sin vendedores en el resumen ni guardados en ningún sitio.
  assert.ok(!JSON.stringify(resultados(m)).includes('Fulano') && !JSON.stringify(resultados(m)).includes('Mengano'));
  const guardado = JSON.stringify(m.guardado());
  assert.ok(!guardado.includes('Fulano') && !guardado.includes('Mengano'), 'ningún nombre de jugador en las SavedVariables');
  // Una búsqueda nueva (o salir) los olvida.
  m.lua(`${B}.salir()`);
  assert.deepEqual(resultados(m), []);
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  assert.equal(resumenDe(m, 2589), undefined, 'tras buscar otra vez, sin resumen');
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

test('B3r: la lectura no sale mientras se busca, y desplegar una fila va antes que la lectura pendiente', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}', '{itemID = 4306, totalQuantity = 3, minPrice = 4500}']);
  m.lua(SUBASTAS_B3R);
  abrirYEscanear(m);
  m.lua(`rawset(_G, "ORDEN_B3R", {})
    hooksecurefunc(C_AuctionHouse, "SendBrowseQuery", function(q)
      if q.searchString == "paño" then ORDEN_B3R[#ORDEN_B3R + 1] = {"navegar", ${B}.estado()} end
    end)
    hooksecurefunc(C_AuctionHouse, "SendSearchQuery", function(k) ORDEN_B3R[#ORDEN_B3R + 1] = {"sub:" .. k.itemID, ${B}.estado()} end)`);
  m.lua('BANCO.ponerSubasta({lista = false})');
  assert.equal(buscar(m, 'paño'), true);
  // Pedida mientras se busca: espera a que la búsqueda acabe.
  assert.equal(m.lua(`${B}.pedirSubastas(2589, {leer = true})`), true);
  // Y el jugador despliega la seda antes de que salga nada.
  assert.equal(m.lua(`${B}.pedirSubastas(4306)`), true);
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  assert.ok(hasta(m, () => resumenDe(m, 2589) !== undefined && resumenDe(m, 4306) !== undefined, 60), 'al final, las dos');
  // Orden de lo que salió: las subastas de la fila desplegada, la búsqueda y, solo con la búsqueda acabada, la lectura.
  const orden = m.lua('ORDEN_B3R');
  assert.deepEqual(orden.map((o) => o[0]), ['sub:4306', 'navegar', 'sub:2589']);
  assert.equal(orden[2][1], 'completa', 'la lectura sale con la búsqueda ya acabada');
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

test('la lectura espera a la compra en camino y al sniper', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}', '{itemID = 4306, totalQuantity = 3, minPrice = 4500}']);
  m.lua(SUBASTAS_B3R);
  m.lua('BANCO.jugador.dinero = 10000000');
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  // Una compra elegida (busca su subasta y queda «lista»): la lectura no sale mientras siga en pie (su búsqueda dejaría en
  // el cliente otro objeto y la compra de la fila marcada ya no encontraría su subasta).
  assert.equal(m.lua('SnetForever.Compra.elegir(2589, {precio = 100, cantidad = 5})'), true);
  assert.equal(m.lua(`${B}.pedirSubastas(4306, {leer = true})`), true);
  assert.ok(hasta(m, () => m.lua('SnetForever.Compra.estado().fase') === 'lista', 40));
  m.avanzar(3);
  assert.equal(buscadasDe(m, 4306), 0, 'con la compra en pie, nada');
  assert.equal(m.lua(`${B}.ocupada()`), false, 'la lectura que espera no frena al escaneo ni al sniper');
  m.lua('SnetForever.Compra.cancelar()');
  assert.ok(hasta(m, () => resumenDe(m, 4306) !== undefined, 60), 'suelta la compra, sale la lectura');
  assert.equal(buscadasDe(m, 4306), 1);
  // El sniper con su navegar en camino (el sistema queda libre antes de que llegue su respuesta): la lectura espera a su
  // respuesta, como la búsqueda, y sale después.
  m.lua('BANCO.ponerSubasta({libreAntes = true})');
  assert.equal(m.lua('SnetForever.Sniper.empezar()'), true);
  assert.equal(m.lua('SnetForever.Sniper.enCamino()'), true, 'el navegar del sniper va en camino');
  m.lua(`rawset(_G, "CON_SNIPER", {})
    hooksecurefunc(C_AuctionHouse, "SendSearchQuery", function() CON_SNIPER[#CON_SNIPER + 1] = SnetForever.Sniper.enCamino() end)`);
  assert.equal(m.lua(`${B}.pedirSubastas(2589, {leer = true})`), true);
  assert.deepEqual(m.lua('CON_SNIPER'), [], 'con su navegar en camino, nada');
  assert.ok(hasta(m, () => resumenDe(m, 2589) !== undefined, 80), 'llegada la respuesta del sniper, sale');
  assert.deepEqual(m.lua('CON_SNIPER'), [false], 'nunca con el navegar del sniper en camino');
  m.lua('SnetForever.Sniper.parar()');
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

test('ronda 1: la lectura espera al navegar del escaneo de fondo en camino y sigue cuando llega su respuesta', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}', '{itemID = 4306, totalQuantity = 3, minPrice = 4500}']);
  m.lua(SUBASTAS_B3R);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  // El escaneo de fondo vuelve a navegar y su respuesta llega después del sistema libre.
  m.lua('BANCO.ponerSubasta({libreAntes = true})');
  m.lua('SnetForever.Escaneo.iniciar()');
  assert.ok(hasta(m, () => m.lua('SnetForever.Escaneo.enCamino()'), 20), 'el navegar del escaneo va en camino');
  m.lua(`rawset(_G, "CON_ESCANEO", {})
    hooksecurefunc(C_AuctionHouse, "SendSearchQuery", function() CON_ESCANEO[#CON_ESCANEO + 1] = SnetForever.Escaneo.enCamino() end)`);
  assert.equal(m.lua(`${B}.pedirSubastas(2589, {leer = true})`), true);
  assert.deepEqual(m.lua('CON_ESCANEO'), [], 'con su navegar en camino, nada');
  assert.ok(hasta(m, () => resumenDe(m, 2589) !== undefined, 120), 'llegada la respuesta del escaneo, sale la lectura');
  const vistas = m.lua('CON_ESCANEO');
  assert.ok(vistas.length >= 1 && vistas.every((v) => v === false), `nunca con el navegar del escaneo en camino: ${vistas}`);
  assert.deepEqual(resumenDe(m, 2589), { subastas: 2, minimo: 100, disponible: 15, completa: true });
  assert.equal(perdidas(m), 0);
  sinErrores(m);
});

// F1 (fallo en el juego): el tooltip enseñaba el mínimo y las unidades de una foto vieja del servidor. La lista de Navegar,
// lo único de verdad de ahora, deja su foto en memoria para el tooltip (Busqueda.vivo), solo si llegó entera.
test('una lista entera deja su mínimo comprable, sus unidades y su hora para el tooltip; una a medias no', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}', '{itemID = 4306, totalQuantity = 3, minPrice = 4500}',
    '{itemID = 2592, totalQuantity = 7, minPrice = 300}']);
  m.lua(SUBASTAS_B3R.replace('mercancias = {', 'mercancias = {[2592] = {{quantity = 7, unitPrice = 300}}, '));
  abrirYEscanear(m);
  const vivo = (id) => m.lua(`${B}.vivo(${id})`);
  assert.equal(vivo(2589), undefined, 'sin leer nada, nada');
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  assert.equal(vivo(2589), undefined, 'la fila de navegar no es la lista: no cuenta');
  // La fila pulsada (un objeto suelto): 3 subastas, 3 unidades y el mínimo comprable.
  assert.equal(m.lua(`${B}.pedirSubastas(4306)`), true);
  m.avanzar(0.05);
  const ahora = m.lua('GetServerTime()');
  const seda = vivo(4306);
  assert.ok(seda && Math.abs(seda.hora - ahora) <= 1, JSON.stringify(seda));
  assert.deepEqual({ ...seda, hora: 0 }, { precio: 5000, cantidad: 3, subastas: 3, hora: 0, origen: 'lista' });
  // Una mercancía leída sin desplegar: sus escalones no son subastas, así que no las cuenta.
  assert.equal(m.lua(`${B}.pedirSubastas(2589, {leer = true})`), true);
  m.avanzar(0.05);
  const lino = vivo(2589);
  assert.deepEqual({ ...lino, hora: 0 }, { precio: 100, cantidad: 15, hora: 0, origen: 'lista' });
  // Una lista a medias (el servidor aún no la ha dado entera) no cuenta.
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return false end');
  assert.equal(m.lua(`${B}.pedirSubastas(2592, {leer = true})`), true);
  m.avanzar(0.05);
  assert.deepEqual(resumenDe(m, 2592), { subastas: 1, minimo: 300, disponible: 7, completa: false });
  assert.equal(vivo(2592), undefined, 'a medias, nada');
  // Nada de vendedores, y nada se guarda.
  assert.ok(!JSON.stringify([vivo(4306), vivo(2589)]).includes('Mengano'));
  const guardado = JSON.stringify(m.guardado());
  assert.ok(!guardado.includes('Fulano') && !guardado.includes('Mengano') && !guardado.includes('"lista"'), 'nada en las SavedVariables');
  // Buscar otra cosa no la borra (sigue siendo la última foto de ese objeto, con su hora); cerrar la subasta, sí.
  m.lua(`${B}.salir()`);
  assert.equal(vivo(2589).precio, 100);
  cerrar(m);
  assert.equal(vivo(2589), undefined, 'con la subasta cerrada ya no es de ahora');
  assert.equal(vivo(4306), undefined);
  sinErrores(m);
});

// F8 (fallo en el juego): con el ratón quieto, el tooltip seguía con la lista de antes. Aquí, por el camino de verdad: la
// respuesta del servidor, Busqueda.vivo y el aviso SNF_COMERCIO_BUSQUEDA.
test('F8: con la lista de verdad, el tooltip abierto de ese objeto se pone al día una vez', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}']);
  m.lua(SUBASTAS_B3R);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), true);
  m.avanzar(0.05);
  m.tooltipObjeto(2589);
  const venta = () => m.detalleTooltip().filter((x) => x.izq === 'A la venta');
  assert.ok(venta()[0].der.startsWith('15 unidades'), JSON.stringify(venta()));
  m.avanzar(1);
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 12, unitPrice = 181}}}})');
  assert.equal(m.lua(`${B}.pedirSubastas(2589)`), true); // la fila pulsada otra vez: una lista nueva
  m.avanzar(0.05);
  assert.equal(venta().length, 1, 'sin líneas repetidas');
  assert.ok(venta()[0].der.startsWith('12 unidades'), JSON.stringify(venta()));
  assert.equal(m.llamadas('GameTooltip:RefreshData').length, 1, 'un solo repintado');
  m.avanzar(2);
  assert.equal(m.llamadas('GameTooltip:RefreshData').length, 1);
  sinErrores(m);
});

// F1, ronda 1 (la revisión): una lista entera sin ninguna subasta que se pueda comprar (aquí, solo pujas) deja su foto sin
// mínimo; y la lista de una sola variante de un equipo no es el objeto entero: no alimenta el tooltip.
test('F1 ronda 1: una lista entera de solo pujas deja sus unidades sin mínimo; la de una variante de equipo no cuenta, la del equipo de un solo nivel sí', () => {
  const m = maquina();
  publicar(m, [
    '{itemKey = {itemID = 15000, itemLevel = 20}, totalQuantity = 1, minPrice = 5000}',
    '{itemKey = {itemID = 15000, itemLevel = 25}, totalQuantity = 1, minPrice = 8000}',
    '{itemKey = {itemID = 15001, itemLevel = 30}, totalQuantity = 1, minPrice = 9000}',
    '{itemID = 4306, totalQuantity = 2, minPrice = 0}',
  ]);
  m.itemInfo(15001, { nombre: 'Espada de un nivel', calidad: 2, nivel: 30 });
  m.lua(`BANCO.ponerSubasta({
    objetos = {[15000] = {{quantity = 1, buyoutAmount = 8000}}, [15001] = {{quantity = 1, buyoutAmount = 9000}},
      [4306] = {{quantity = 2, bidAmount = 3000}}},
    nivelObjetos = {[15000] = 25, [15001] = 30},
  })`);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'e'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  const vivo = (id) => m.lua(`${B}.vivo(${id})`);
  const leer = (i) => { assert.equal(m.lua(`${B}.pedirSubastas(${B}.resultados()[${i}], {leer = true})`), true); assert.ok(hasta(m, () => m.lua(`${B}.leyendo()`) === false, 40)); };
  const indice = (pred) => resultados(m).findIndex(pred) + 1;
  // Solo pujas: entera, 2 unidades y ninguna que se pueda comprar.
  leer(indice((f) => f.item === 4306));
  const seda = vivo(4306);
  assert.deepEqual([seda.precio, seda.cantidad, seda.origen], [undefined, 2, 'lista']);
  // La espada de dos niveles: la lista del nivel 25 no es la espada entera.
  leer(indice((f) => f.item === 15000 && f.nivel === 25));
  assert.equal(vivo(15000), undefined, 'una variante no es el objeto entero');
  assert.notEqual(m.lua('select(6, SnetForever.Subasta.foto(15000))'), 'lista', 'y no alimenta el tooltip');
  // La espada de un solo nivel en la búsqueda: su lista sí es el objeto entero.
  leer(indice((f) => f.item === 15001));
  assert.deepEqual([vivo(15001).precio, vivo(15001).cantidad], [9000, 1]);
  assert.equal(m.lua('select(6, SnetForever.Subasta.foto(15001))'), 'lista');
  // Sin la búsqueda delante (cerrada y vuelta a abrir la subasta), una clave con nivel no se sabe si es el objeto entero:
  // sus subastas llegan, pero no cuentan para el tooltip.
  cerrar(m);
  abrir(m);
  const clave = '{itemID = 15001, itemLevel = 30, itemSuffix = 0, battlePetSpeciesID = 0}';
  assert.equal(m.lua(`${B}.pedirSubastas(${clave})`), true);
  assert.ok(hasta(m, () => m.lua(`${B}.subastas(${clave})`) !== undefined, 40), 'sus subastas llegan');
  assert.equal(vivo(15001), undefined, 'una clave con nivel sin la búsqueda delante no cuenta');
  // Control: por el mismo camino, un objeto sin nivel sí cuenta.
  assert.equal(m.lua(`${B}.pedirSubastas(4306)`), true);
  assert.ok(hasta(m, () => m.lua(`${B}.subastas(4306)`) !== undefined, 40));
  assert.equal(vivo(4306).cantidad, 2);
  sinErrores(m);
});

// F4 (fallo en el juego): en el Paño de lana el tooltip decía 10494 unidades y la fila padre de Navegar 10557. Una segunda
// lectura de la misma mercancía que llega a medias (al pulsar la fila o al elegir una subasta) pisaba el resumen entero, y
// la fila pasaba a lo de navegar mientras Busqueda.vivo se quedaba con la entera. Ahora el resumen sigue la regla de vivo:
// una lista a medias no pisa la entera de antes del mismo objeto en esta búsqueda (se queda la entera, marcada pendiente).
test('una lista a medias no pisa el resumen entero de antes del mismo objeto (como Busqueda.vivo)', () => {
  const m = maquina();
  publicar(m, ['{itemID = 2592, totalQuantity = 10557, minPrice = 179}', '{itemID = 4306, totalQuantity = 3, minPrice = 4500}']);
  m.lua(`BANCO.ponerSubasta({
    mercancias = {[2592] = {{quantity = 494, unitPrice = 179}, {quantity = 4000, unitPrice = 185}, {quantity = 6000, unitPrice = 190}}},
    objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000}, {quantity = 2, buyoutAmount = 9000}}},
  })`);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'paño'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  const vivo = (id) => m.lua(`${B}.vivo(${id})`);
  // La lectura entera de la lana: el resumen y vivo, con las mismas unidades y la misma hora.
  assert.equal(m.lua(`${B}.pedirSubastas(2592, {leer = true})`), true);
  m.avanzar(0.05);
  const entera = { subastas: 3, minimo: 179, disponible: 10494, completa: true };
  assert.deepEqual(resumenDe(m, 2592), entera);
  const hora = horaResumen(m, 2592);
  assert.equal(typeof hora, 'number', 'el resumen lleva la hora de su lista');
  assert.equal(hora, vivo(2592).hora, 'la misma hora que vivo: la misma lectura');
  // Pasa el tiempo y el jugador pulsa la fila: esta vez el servidor no da la lista entera (y trae menos).
  m.avanzar(120);
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return false end');
  m.lua('BANCO.subasta.mercancias[2592] = {{quantity = 494, unitPrice = 179}, {quantity = 4000, unitPrice = 185}}');
  assert.equal(m.lua(`${B}.pedirSubastas(2592)`), true);
  m.avanzar(0.05);
  // Lo que se ve debajo (y lo que se compra) es la lista de ahora, a medias...
  const [lista, info] = m.lua(`(function() local l, i = ${B}.subastas(2592) return {l, i} end)()`);
  assert.equal(lista.length, 2);
  assert.equal(info.completa, false);
  // ...pero el resumen se queda con la entera de antes, con su hora, marcado pendiente; vivo, igual.
  assert.deepEqual(resumenDe(m, 2592), { ...entera, pendiente: true }, 'la entera de antes, pendiente');
  assert.equal(horaResumen(m, 2592), hora, 'con la hora de la entera');
  assert.ok(horaPendienteDe(m, 2592) >= hora + 120, 'y la hora de la que llegó a medias (horaPendiente)');
  assert.equal(vivo(2592).cantidad, 10494);
  assert.equal(vivo(2592).hora, hora);
  // Otra entera sí lo pisa (y ya no está pendiente).
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return true end');
  m.lua('BANCO.subasta.mercancias[2592] = {{quantity = 494, unitPrice = 179}, {quantity = 4000, unitPrice = 185}, {quantity = 5000, unitPrice = 190}}');
  assert.equal(m.lua(`${B}.pedirSubastas(2592)`), true);
  m.avanzar(0.05);
  assert.deepEqual(resumenDe(m, 2592), { subastas: 3, minimo: 179, disponible: 9494, completa: true });
  assert.ok(horaResumen(m, 2592) > hora, 'con su hora nueva');
  assert.equal(horaPendienteDe(m, 2592), undefined, 'sin horaPendiente');
  assert.equal(vivo(2592).cantidad, 9494);
  // Lo mismo en un objeto suelto: leído entero y después, al pulsarlo, a medias.
  assert.equal(m.lua(`${B}.pedirSubastas(4306, {leer = true})`), true);
  m.avanzar(0.05);
  const seda = { subastas: 3, minimo: 5000, disponible: 3, completa: true };
  assert.deepEqual(resumenDe(m, 4306), seda);
  m.lua('C_AuctionHouse.HasFullItemSearchResults = function() return false end');
  m.lua('BANCO.subasta.objetos[4306] = {{quantity = 1, buyoutAmount = 5000}}');
  assert.equal(m.lua(`${B}.pedirSubastas(4306)`), true);
  m.avanzar(0.05);
  assert.equal(m.lua(`${B}.subastas(4306)`).length, 1, 'debajo, la lista de ahora');
  assert.deepEqual(resumenDe(m, 4306), { ...seda, pendiente: true });
  assert.equal(vivo(4306).cantidad, 3);
  // Una a medias sin una entera antes sigue como siempre: es lo único que hay.
  publicar(m, ['{itemID = 2589, totalQuantity = 15, minPrice = 100}']);
  m.lua('BANCO.subasta.mercancias[2589] = {{quantity = 5, unitPrice = 100}}');
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return false end');
  assert.equal(buscar(m, 'lino'), true);
  assert.ok(hasta(m, () => estado(m) === 'completa', 40));
  assert.equal(m.lua(`${B}.pedirSubastas(2589, {leer = true})`), true);
  m.avanzar(0.05);
  assert.deepEqual(resumenDe(m, 2589), { subastas: 1, minimo: 100, disponible: 5, completa: false });
  sinErrores(m);
});

test('advanced and vendor searches filter a named browse without changing the server query', () => {
  for (const [query, expected] of [['advanced:15:1:cloth', [2592]], ['vendor:cloth', [2589]]]) {
    const m = maquina();
    m.itemInfo(2589, {nombre:'Linen', calidad:1, nivel:5, precio:150});
    m.itemInfo(2592, {nombre:'Wool', calidad:1, nivel:15, precio:50});
    publicar(m, ['{itemID=2589,totalQuantity=20,minPrice=120}', '{itemID=2592,totalQuantity=7,minPrice=300}']);
    abrirYEscanear(m);
    assert.equal(buscar(m, query), true);
    m.avanzar(0.05);
    assert.equal(textos(m).at(-1), 'cloth');
    assert.deepEqual(resultados(m).map(row => row.item), expected);
    sinErrores(m);
  }
});

test('disenchant search requires a recorded batch and known prices for every output', () => {
  const m = maquina();
  publicar(m, ['{itemID=2589,totalQuantity=2,minPrice=99}', '{itemID=2592,totalQuantity=2,minPrice=99}']);
  m.lua(`assert(SnetForever.DisenchantSamples.record("2589 2 42:4"))
    assert(not SnetForever.DisenchantSamples.record("2589 2 42:7 42:8"))
    SnetForever.Precios.de=function() return {normal=50} end`);
  abrirYEscanear(m);
  assert.equal(buscar(m, 'disenchant:cloth'), true);
  m.avanzar(0.05);
  assert.deepEqual(resultados(m).map(row => row.item), [2589]);
  m.lua('SnetForever.Precios.de=function() return nil end');
  assert.deepEqual(resultados(m), []);
  sinErrores(m);
});
