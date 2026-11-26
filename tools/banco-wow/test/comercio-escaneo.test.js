// Comercio, tarea 10: el escaneo en vivo de la subasta (comercio/escaneo.lua). Regla de la prueba real en Forever
// (13-nov, docs/comercio/2026-11-13-inventario-tsm.md §2i): al abrir la subasta, C_AuctionHouse.ReplicateItems() si no
// se hizo en los últimos 15 min (la hora se guarda en la cuenta y sobrevive a /reload); si no, SendBrowseQuery vacío
// pidiendo más páginas hasta HasFullBrowseResults(). La réplica (194.094 filas en el juego) se lee por trozos repartidos
// en varios fotogramas, SNF_COMERCIO_ESCANEO sale como mucho cada 0,5 s y el escaneo respeta el sistema limitado.
import assert from 'node:assert/strict';
import { crearMaquina } from '../src/maquina.js';
// 0.7.0: todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo
// (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { sinErrores, testConComercio as test } from './ayuda.js';

// Un texto del addon como patrón literal (puede llevar paréntesis o puntos).
const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HORDA_NORMAL = { reino: 'Normal', faccion: 'Horde' };
const ESPERA_INICIO = 1; // segundos que espera el escaneo tras abrir la subasta antes de la primera búsqueda
const CALMA = 5; // segundos sin búsquedas ajenas antes de volver a buscar

function maquina(opciones = {}) {
  const m = crearMaquina({ jugador: HORDA_NORMAL, ...opciones });
  apuntarAvisos(m);
  return m;
}

// AV apunta cada SNF_COMERCIO_ESCANEO: {t = GetTime(), n = nuevos, total}.
function apuntarAvisos(m) {
  m.lua(`rawset(_G, "AV", {})
    SnetForever.escuchar("SNF_COMERCIO_ESCANEO", function(n, total) AV[#AV + 1] = {t = GetTime(), n = n, total = total} end)`);
}

const abrir = (m) => m.disparar('AUCTION_HOUSE_SHOW');
const cerrar = (m) => m.disparar('AUCTION_HOUSE_CLOSED');
const estado = (m) => m.lua('SnetForever.Escaneo.estado()');
const dato = (m, item) => m.lua(`SnetForever.Escaneo.datos()[${item}]`);
const cuantos = (m) => m.lua('local n = 0; for _ in pairs(SnetForever.Escaneo.datos()) do n = n + 1 end; return n');
const llamadas = (m, f) => m.lua(`#(BANCO.llamadas["C_AuctionHouse.${f}"] or {})`);
// Adelanta el reloj sin correr los fotogramas uno a uno (con la subasta cerrada no hay nada pendiente).
const motivo = (m) => m.lua('SnetForever.Escaneo.motivo()');
const cabecera = (m) => m.lua('SnetForever.UIComercio.marco().avisos:GetText()') || '';
const texto = (m, clave) => m.lua(`SnetForever.L.t("${clave}")`);
const ajena = (m, texto = '') => m.lua(`C_AuctionHouse.SendBrowseQuery({searchString = "${texto}", sorts = {}})`);
const saltar = (m, segundos) => m.lua(`BANCO.tick = BANCO.tick + ${Math.round(segundos * 20)}`);

// Réplica con `n` objetos distintos (id 10000 + i), cada uno con dos subastas: una de 5 a 100 de cobre la unidad y otra
// de 3 a 120 (compra total = unidad × cantidad).
function replicaGrande(m, n) {
  m.lua(`local r = {}
    for i = 1, ${n} do
      r[#r + 1] = {name = "Obj" .. i, itemID = 10000 + i, count = 5, buyoutPrice = 500}
      r[#r + 1] = {name = "Obj" .. i, itemID = 10000 + i, count = 3, buyoutPrice = 360}
    end
    BANCO.ponerSubasta({replica = r})`);
}

// Filas de navegar: {itemID, totalQuantity, minPrice} de 2000 + i.
function navegar(m, n, porPagina = 50, precio = 10) {
  m.lua(`local filas = {}
    for i = 1, ${n} do filas[i] = {itemID = 2000 + i, totalQuantity = i, minPrice = ${precio} * i} end
    BANCO.ponerSubasta({navegar = filas, porPagina = ${porPagina}})`);
}

test('dormido: tras entrar no escucha eventos de la subasta, no busca nada y está parado', () => {
  const m = maquina();
  assert.equal(m.lua('type(SnetForever.Escaneo)'), 'table');
  assert.equal(estado(m), 'parado');
  assert.deepEqual(m.lua('SnetForever.Escaneo.datos()'), []);
  for (const e of ['REPLICATE_ITEM_LIST_UPDATE', 'AUCTION_HOUSE_BROWSE_RESULTS_UPDATED', 'AUCTION_HOUSE_BROWSE_RESULTS_ADDED',
    'AUCTION_HOUSE_THROTTLED_SYSTEM_READY']) {
    assert.equal(m.lua(`#(BANCO.eventos.${e} or {})`), 0, `${e} no registrado antes de abrir la subasta`);
  }
  m.avanzar(5);
  assert.equal(m.llamadas('C_AuctionHouse.ReplicateItems').length + m.llamadas('C_AuctionHouse.SendBrowseQuery').length, 0);
  sinErrores(m);
});

test('al abrir la subasta, ReplicateItems: precio unitario más bajo (sin las de solo puja), suma de unidades y hora del servidor', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({replica = {
    {name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400},
    {name = "Lino", itemID = 2589, count = 10, buyoutPrice = 1000},
    {name = "Lino", itemID = 2589, count = 4, buyoutPrice = 0, minBid = 40},
    {name = "Espada", itemID = 2488, count = 1, buyoutPrice = 5895},
    {name = "Puja", itemID = 777, count = 1, buyoutPrice = 0, minBid = 10},
  }})`);
  abrir(m);
  assert.equal(estado(m), 'esperando', 'espera un momento antes de buscar (la subasta de Blizzard hace lo suyo al abrir)');
  assert.equal(llamadas(m, 'ReplicateItems'), 0);
  m.avanzar(ESPERA_INICIO + 0.1);
  assert.equal(llamadas(m, 'ReplicateItems'), 1);
  m.avanzar(1);
  assert.equal(estado(m), 'completo');
  const ahora = m.lua('GetServerTime()');
  const lino = dato(m, 2589);
  assert.equal(lino.precio, 100, '1000 / 10 es más barato que 2400 / 20; la de solo puja no cuenta');
  assert.equal(lino.cantidad, 34, 'todas las unidades, también las de solo puja');
  assert.ok(Math.abs(lino.hora - ahora) <= 2, 'hora en segundos del servidor');
  // F6, ronda 1: con la facción de la subasta en la que se leyó (sin subastador a la vista, la del jugador).
  assert.deepEqual(dato(m, 2488), { precio: 5895, cantidad: 1, hora: lino.hora, origen: 'replica', faccion: 'Horde' });
  assert.equal(dato(m, 777), undefined, 'un objeto solo con pujas no tiene precio de compra');
  assert.equal(llamadas(m, 'SendBrowseQuery'), 0);
  const ultima = m.lua('SnetForeverCuenta.comercio.ultimaReplica');
  assert.ok(Math.abs(ultima - ahora) <= 2, 'la hora de la réplica queda en la cuenta');
  assert.ok(m.lua('AV').length >= 1);
  assert.equal(m.lua('AV[#AV].total'), 2);
  sinErrores(m);
});

test('una réplica grande se lee por trozos en varios fotogramas, sin perder filas; avisa cada 2 s mientras la lee y al acabar', () => {
  const m = maquina();
  m.lua('SnetForever.Escaneo.POR_TROZO = 500'); // trozos pequeños: la lectura dura 3 s de juego
  replicaGrande(m, 15000); // 30.000 filas
  abrir(m);
  m.avanzar(ESPERA_INICIO); // envía ReplicateItems en el último fotograma
  assert.equal(llamadas(m, 'ReplicateItems'), 1);
  m.avanzar(0.05); // llega REPLICATE_ITEM_LIST_UPDATE y se lee el primer trozo
  let leidas = llamadas(m, 'GetReplicateItemInfo');
  assert.ok(leidas > 0 && leidas <= 5000, `un fotograma no lee la subasta entera (leyó ${leidas})`);
  assert.equal(estado(m), 'escaneando');
  let fotogramas = 0;
  while (estado(m) !== 'completo' && fotogramas < 400) {
    m.avanzar(0.05);
    fotogramas += 1;
    const ahora = llamadas(m, 'GetReplicateItemInfo');
    assert.ok(ahora - leidas <= 5000, `como mucho unas pocas miles de filas por fotograma (${ahora - leidas})`);
    leidas = ahora;
  }
  assert.equal(estado(m), 'completo');
  assert.ok(fotogramas >= 30, `repartido en varios fotogramas (${fotogramas})`);
  assert.equal(cuantos(m), 15000);
  m.avanzar(0.6); // el aviso final sale en cuanto pasan 0,5 s del anterior
  assert.deepEqual([dato(m, 10001).precio, dato(m, 10001).cantidad], [100, 8]);
  assert.deepEqual([dato(m, 25000).precio, dato(m, 25000).cantidad], [100, 8]);
  const av = m.lua('AV');
  assert.ok(av.length >= 2, 'avisa mientras lee, no solo al final');
  for (let i = 1; i < av.length - 1; i++) assert.ok(av[i].t - av[i - 1].t >= 2 - 1e-6, `mientras lee la réplica, avisos a ${av[i - 1].t} y ${av[i].t}`);
  assert.ok(av[av.length - 1].t - av[av.length - 2].t >= 0.5 - 1e-6, 'el aviso final, como mucho cada 0,5 s');
  assert.equal(av[av.length - 1].total, 15000, 'el último aviso trae el total');
  assert.equal(av.reduce((s, a) => s + a.n, 0), 15000, 'los nuevos de todos los avisos suman los objetos vistos');
  for (let i = 1; i < av.length; i++) assert.ok(av[i].total >= av[i - 1].total, 'el total crece');
  sinErrores(m);
});

test('antes de 15 min (también tras /reload) no repite ReplicateItems: navega por páginas hasta tenerlo todo', () => {
  let m = maquina();
  m.lua('BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400}}})');
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(llamadas(m, 'ReplicateItems'), 1);
  cerrar(m);
  m = m.recargar();
  apuntarAvisos(m);
  navegar(m, 120, 50);
  m.avanzar(60);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 3);
  assert.equal(llamadas(m, 'ReplicateItems'), 0, 'tras /reload la réplica de hace 1 min cuenta');
  assert.equal(llamadas(m, 'SendBrowseQuery'), 1);
  // filters e itemClassFilters van siempre (vacíos): sin ellos WoW Forever devuelve la búsqueda sin ninguna fila.
  assert.deepEqual(m.llamadas('C_AuctionHouse.SendBrowseQuery')[0][0], { searchString: '', sorts: [], filters: [], itemClassFilters: [] });
  assert.equal(llamadas(m, 'RequestMoreBrowseResults'), 2, '120 filas de 50 en 50: dos páginas más');
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 120);
  assert.deepEqual([dato(m, 2007).precio, dato(m, 2007).cantidad], [70, 7]);
  const av = m.lua('AV');
  assert.equal(av[av.length - 1].total, 120);
  // Pasados 15 min desde la réplica, la siguiente apertura vuelve a usarla.
  cerrar(m);
  saltar(m, 15 * 60);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(llamadas(m, 'ReplicateItems'), 1);
  sinErrores(m);
});

test('con el sistema limitado espera (y lo dice) sin buscar; sigue al llegar AUCTION_HOUSE_THROTTLED_SYSTEM_READY', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400}}})');
  abrir(m);
  m.lua('BANCO.ponerSubasta({lista = false})'); // otro addon acaba de usar la subasta
  m.avanzar(ESPERA_INICIO + 3);
  assert.equal(estado(m), 'esperando');
  assert.equal(llamadas(m, 'ReplicateItems'), 0, 'no gasta la réplica en un sistema limitado');
  assert.equal(m.llamadas('C_AuctionHouse:limitada').length, 0, 'no lanza búsquedas que se perderían');
  assert.ok(m.lua('AV').length >= 1, 'avisa para que la ventana diga que espera');
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  m.avanzar(1);
  assert.equal(llamadas(m, 'ReplicateItems'), 1);
  assert.equal(estado(m), 'completo');
  assert.equal(dato(m, 2589).precio, 120);
  sinErrores(m);
});

test('limitado a mitad de navegar: espera sin perder lo recibido y sigue con READY', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 120, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO); // envía SendBrowseQuery en el último fotograma
  assert.equal(llamadas(m, 'SendBrowseQuery'), 1);
  m.lua('BANCO.ponerSubasta({lista = false})'); // llega la primera página, pero otro addon limita el sistema
  m.avanzar(2);
  assert.equal(estado(m), 'esperando');
  assert.equal(cuantos(m), 50, 'la primera página se queda');
  assert.equal(llamadas(m, 'RequestMoreBrowseResults'), 0);
  assert.equal(m.llamadas('C_AuctionHouse:limitada').length, 0);
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  m.avanzar(1);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 120);
  sinErrores(m);
});

test('aunque se pierda el READY, el escaneo vuelve a mirar el sistema y sigue', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 120, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO);
  m.lua('BANCO.ponerSubasta({lista = false})');
  m.avanzar(2);
  assert.equal(estado(m), 'esperando');
  m.lua('BANCO.ponerSubasta({lista = true})'); // libre, pero sin evento
  m.avanzar(5);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 120);
  sinErrores(m);
});

test('mientras navega, una búsqueda de otro addon (o del jugador) lo hace esperar sin borrar nada y vuelve a empezar con calma', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 1000, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO); // envía SendBrowseQuery
  m.avanzar(0.05); // primera página; pide la segunda
  const pedidas = llamadas(m, 'RequestMoreBrowseResults');
  assert.equal(pedidas, 1);
  ajena(m); // otro addon (búsqueda vacía, como un escaneo)
  m.avanzar(CALMA - 1);
  assert.equal(llamadas(m, 'RequestMoreBrowseResults'), pedidas, 'no sigue pidiendo páginas de la búsqueda de otro');
  assert.equal(llamadas(m, 'SendBrowseQuery'), 2, 'ni vuelve a buscar mientras el otro la usa');
  assert.equal(estado(m), 'esperando');
  assert.ok(cuantos(m) >= 50, 'lo recibido se queda');
  m.avanzar(10);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 3, 'pasada la calma, vuelve a empezar');
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 1000);
  m.avanzar(1);
  assert.equal(m.lua('AV').reduce((t, a) => t + a.n, 0), 1000, 'los objetos de la vuelta dejada no cuentan dos veces como nuevos');
  sinErrores(m);
});

test('una búsqueda ajena antes de nuestra primera página no lo para: sigue esperando y empieza cuando hay calma', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 120, 50);
  abrir(m);
  m.lua('BANCO.ponerSubasta({lista = false})');
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(estado(m), 'esperando');
  ajena(m); // otro addon (limitada en el banco)
  assert.equal(estado(m), 'esperando', 'no se para');
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  m.avanzar(1);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 1, 'no se mete justo detrás del otro addon');
  assert.equal(estado(m), 'esperando');
  m.avanzar(CALMA + 2);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 2);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 120);
  sinErrores(m);
});

test('entre páginas propias no pasa a «esperando»', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 500, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO);
  const vistos = new Set();
  for (let i = 0; i < 40 && estado(m) !== 'completo'; i++) {
    m.avanzar(0.05);
    vistos.add(estado(m));
  }
  assert.equal(estado(m), 'completo');
  assert.ok(!vistos.has('esperando'), `estados vistos: ${[...vistos]}`);
  sinErrores(m);
});

test('cerrar la subasta lo para: no busca más, deja los eventos y conserva los datos', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 1000, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO);
  m.avanzar(0.1);
  assert.equal(estado(m), 'escaneando');
  cerrar(m);
  assert.equal(estado(m), 'parado');
  const pedidas = llamadas(m, 'RequestMoreBrowseResults');
  const n = cuantos(m);
  assert.ok(n >= 50);
  m.avanzar(10);
  assert.equal(llamadas(m, 'RequestMoreBrowseResults'), pedidas);
  assert.equal(cuantos(m), n);
  for (const e of ['REPLICATE_ITEM_LIST_UPDATE', 'AUCTION_HOUSE_BROWSE_RESULTS_UPDATED', 'AUCTION_HOUSE_BROWSE_RESULTS_ADDED',
    'AUCTION_HOUSE_THROTTLED_SYSTEM_READY']) {
    assert.equal(m.lua(`#(BANCO.eventos.${e} or {})`), 0, `${e} ya no se escucha`);
  }
  sinErrores(m);
});

test('cerrar a mitad de leer la réplica para la lectura', () => {
  const m = maquina();
  replicaGrande(m, 15000);
  abrir(m);
  m.avanzar(ESPERA_INICIO);
  m.avanzar(0.1);
  assert.equal(estado(m), 'escaneando');
  cerrar(m);
  const leidas = llamadas(m, 'GetReplicateItemInfo');
  assert.ok(leidas > 0 && leidas < 30000);
  m.avanzar(5);
  assert.equal(llamadas(m, 'GetReplicateItemInfo'), leidas);
  assert.equal(estado(m), 'parado');
  sinErrores(m);
});

test('un escaneo completo nuevo quita los objetos que ya no están a la venta y renueva los demás', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 10, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(cuantos(m), 10);
  cerrar(m);
  m.lua('BANCO.ponerSubasta({navegar = {{itemID = 2001, totalQuantity = 9, minPrice = 7}, {itemID = 3000, totalQuantity = 1, minPrice = 50}}})');
  m.avanzar(30);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 2);
  assert.deepEqual([dato(m, 2001).precio, dato(m, 2001).cantidad], [7, 9]);
  assert.equal(dato(m, 2005), undefined);
  sinErrores(m);
});

test('si ReplicateItems no responde, a los 60 s navega por páginas', () => {
  const m = maquina();
  m.lua('rawset(C_AuctionHouse, "ReplicateItems", function() BANCO.anotar("C_AuctionHouse.ReplicateItems") end)');
  navegar(m, 30, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 30);
  assert.equal(estado(m), 'escaneando');
  assert.equal(llamadas(m, 'SendBrowseQuery'), 0);
  m.avanzar(32);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 1);
  m.avanzar(1);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 30);
  sinErrores(m);
});

test('ultimoEscaneo guarda solo mercancías, como mucho 300 objetos, con {[precio unitario] = unidades}', () => {
  const m = maquina();
  m.lua(`local r = {}
    for i = 1, 400 do
      local id = 20000 + i
      r[#r + 1] = {name = "M", itemID = id, count = 5, buyoutPrice = 5 * (100 + i)}
      r[#r + 1] = {name = "M", itemID = id, count = 2, buyoutPrice = 2 * (100 + i)}
      if i <= 50 then r[#r + 1] = {name = "M", itemID = id, count = 7, buyoutPrice = 7 * 999} end
    end
    for i = 1, 30 do r[#r + 1] = {name = "Arma", itemID = 30000 + i, count = 1, buyoutPrice = 10000} end
    r[#r + 1] = {name = "M", itemID = 20001, count = 3, buyoutPrice = 0, minBid = 5}
    BANCO.ponerSubasta({replica = r})`);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 2);
  assert.equal(estado(m), 'completo');
  const u = m.lua('SnetForeverCuenta.comercio.ultimoEscaneo');
  const items = Object.keys(u.muestras).map(Number);
  assert.equal(items.length, 300);
  assert.ok(items.every((id) => id > 20000 && id <= 20400), 'solo mercancías (se apilan), nada de armas sueltas');
  for (let i = 1; i <= 50; i++) assert.ok(items.includes(20000 + i), 'primero los de más precios distintos');
  assert.deepEqual(u.muestras[20001], { 101: 7, 999: 7 }, 'unidades por precio unitario; las de solo puja no cuentan');
  assert.ok(Math.abs(u.hora - m.lua('GetServerTime()')) <= 3);
  assert.deepEqual(u.identidad, { region: 'US', reino: 'Normal', faccion: 'Horde' });
  sinErrores(m);
});

test('navegar no pisa ultimoEscaneo (no trae las unidades por precio)', () => {
  const previo = { hora: 1789990000, identidad: { reino: 'Normal' }, muestras: { 2589: { 100: 5 } } };
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000, ultimoEscaneo: previo } } } });
  navegar(m, 10, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(estado(m), 'completo');
  assert.deepEqual(m.lua('SnetForeverCuenta.comercio.ultimoEscaneo'), previo);
  sinErrores(m);
});

test('un fallo dentro del escaneo lo recoge el cortafuegos del comercio, sin llegar al manejador de errores', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400}}})');
  m.lua('rawset(C_AuctionHouse, "GetNumReplicateItems", function() error("roto") end)');
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  assert.equal(estado(m), 'parado');
  const fallos = m.lua('SnetForeverCuenta.fallos');
  assert.ok(fallos.some((f) => f.origen === 'comercio' && /roto/.test(f.texto)));
  sinErrores(m);
});

test('iniciar() con el escaneo completo lo refresca (navegando, si la réplica es reciente)', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400}}})');
  navegar(m, 5, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(estado(m), 'completo');
  m.lua('SnetForever.Escaneo.iniciar()');
  m.avanzar(1);
  assert.equal(llamadas(m, 'ReplicateItems'), 1);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 1);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 5);
  sinErrores(m);
});

test('con la subasta cerrada iniciar() no hace nada', () => {
  const m = maquina();
  m.lua('SnetForever.Escaneo.iniciar()');
  m.avanzar(3);
  assert.equal(estado(m), 'parado');
  assert.equal(llamadas(m, 'ReplicateItems') + llamadas(m, 'SendBrowseQuery'), 0);
  sinErrores(m);
});

test('una réplica vacía (0 filas) no borra nada: la réplica no sirvió y navega por páginas', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 10, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(cuantos(m), 10);
  cerrar(m);
  saltar(m, 15 * 60); // ya toca réplica
  m.lua('BANCO.ponerSubasta({replica = {}})');
  abrir(m);
  m.avanzar(ESPERA_INICIO); // envía ReplicateItems
  assert.equal(llamadas(m, 'ReplicateItems'), 1);
  m.avanzar(0.05); // llega la réplica vacía
  assert.equal(cuantos(m), 10, 'nada borrado');
  assert.notEqual(estado(m), 'completo');
  m.avanzar(2);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 2, 'navega por páginas');
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 10);
  sinErrores(m);
});

test('ultimaReplica basura o en el futuro no impide la réplica', () => {
  for (const valor of ['x', 1790000000 + 3600, { a: 1 }]) {
    const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: valor } } } });
    m.lua('BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400}}})');
    abrir(m);
    m.avanzar(ESPERA_INICIO + 1);
    assert.equal(llamadas(m, 'ReplicateItems'), 1, JSON.stringify(valor));
    assert.equal(estado(m), 'completo');
    assert.equal(typeof m.lua('SnetForeverCuenta.comercio.ultimaReplica'), 'number');
    sinErrores(m);
  }
});

test('ultimoEscaneo guarda como mucho 10 precios por objeto (los más baratos)', () => {
  const m = maquina();
  m.lua(`local r = {}
    for p = 115, 101, -1 do r[#r + 1] = {name = "M", itemID = 4000, count = 2, buyoutPrice = 2 * p} end
    BANCO.ponerSubasta({replica = r})`);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  const fila = m.lua('SnetForeverCuenta.comercio.ultimoEscaneo.muestras[4000]');
  const esperado = {};
  for (let p = 101; p <= 110; p++) esperado[p] = 2;
  assert.deepEqual(fila, esperado);
  sinErrores(m);
});

test('cerrar la subasta con un aviso pendiente: no sale ningún SNF_COMERCIO_ESCANEO después', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 1000, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO);
  m.avanzar(0.05); // primera página: avisa ya
  m.avanzar(0.05); // segunda página: el aviso queda pendiente
  const antes = m.lua('#AV');
  cerrar(m);
  m.avanzar(3);
  assert.equal(m.lua('#AV'), antes);
  sinErrores(m);
});

test('una réplica parada a medias no pisa los datos del escaneo completo anterior', () => {
  const m = maquina();
  m.lua('SnetForever.Escaneo.POR_TROZO = 500');
  replicaGrande(m, 3000); // 6000 filas: 12 trozos
  abrir(m);
  m.avanzar(ESPERA_INICIO + 2);
  assert.equal(estado(m), 'completo');
  const antes = dato(m, 10001);
  cerrar(m);
  saltar(m, 15 * 60);
  m.lua(`local r = {}
    for i = 1, 3000 do r[#r + 1] = {name = "Obj", itemID = 10000 + i, count = 1, buyoutPrice = 7} end
    for i = 1, 3000 do r[#r + 1] = {name = "Nuevo", itemID = 50000 + i, count = 1, buyoutPrice = 9} end
    BANCO.ponerSubasta({replica = r})`);
  abrir(m);
  m.avanzar(ESPERA_INICIO);
  m.avanzar(0.1); // dos trozos leídos
  assert.equal(llamadas(m, 'ReplicateItems'), 2);
  assert.equal(estado(m), 'escaneando');
  cerrar(m);
  assert.deepEqual(dato(m, 10001), antes, 'lo parcial no sustituye a lo completo');
  assert.equal(dato(m, 50001), undefined, 'lo parcial se descarta');
  assert.equal(cuantos(m), 3000);
  sinErrores(m);
});

test('al acabar no pregunta al cliente objeto a objeto y quita lo que ya no está en varios fotogramas', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  m.lua('rawset(C_AuctionHouse, "GetItemCommodityStatus", function(...) BANCO.anotar("C_AuctionHouse.GetItemCommodityStatus", ...); return 0 end)');
  navegar(m, 12000, 500);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 5);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 12000);
  cerrar(m);
  m.lua('BANCO.ponerSubasta({navegar = {{itemID = 2001, totalQuantity = 9, minPrice = 7}}})');
  abrir(m);
  m.avanzar(ESPERA_INICIO + 0.05); // llega la única página: empieza a quitar
  const cuentas = [];
  for (let i = 0; i < 20 && estado(m) !== 'completo'; i++) {
    cuentas.push(cuantos(m));
    m.avanzar(0.05);
  }
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 1);
  assert.ok(cuentas.some((n) => n > 1 && n < 12000), `quita por trozos (cuentas: ${cuentas})`);
  // Y con una réplica (las muestras): tampoco pregunta GetItemCommodityStatus.
  cerrar(m);
  saltar(m, 15 * 60);
  replicaGrande(m, 2000);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 3);
  assert.equal(estado(m), 'completo');
  assert.equal(llamadas(m, 'GetItemCommodityStatus'), 0);
  sinErrores(m);
});

test('una RequestMoreBrowseResults ajena también alarga la calma; mientras, dice que otro addon usa la subasta', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 120, 50);
  abrir(m);
  m.lua('BANCO.ponerSubasta({lista = false})');
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(motivo(m), 'limitado');
  ajena(m); // otro addon empieza su búsqueda (vacía, como un escaneo)
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  for (let i = 0; i < 4; i++) {
    m.avanzar(2);
    m.lua('C_AuctionHouse.RequestMoreBrowseResults()'); // y sigue pidiendo páginas
  }
  m.avanzar(4);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 1, 'no se mete a mitad del paginado del otro');
  assert.equal(estado(m), 'esperando');
  assert.equal(motivo(m), 'ajena');
  assert.match(cabecera(m), new RegExp(literal(texto(m, 'COMERCIO_ESCANEO_AJENA'))));
  assert.doesNotMatch(cabecera(m), new RegExp(literal(texto(m, 'COMERCIO_ESPERANDO'))));
  m.avanzar(3);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 2, 'pasados 5 s sin búsquedas ajenas, busca');
  m.avanzar(2);
  assert.equal(estado(m), 'completo');
  assert.equal(motivo(m), undefined);
  assert.equal(cuantos(m), 120);
  sinErrores(m);
});

test('una búsqueda con texto (el jugador en Comprar): no vuelve a navegar mientras su lista está a la vista', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  m.lua(`rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", nil, UIParent))
    AuctionHouseFrame.BrowseResultsFrame = CreateFrame("Frame", nil, AuctionHouseFrame)`);
  navegar(m, 5000, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 0.1); // navegando
  ajena(m, 'lino');
  m.avanzar(120);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 2, 'su lista de «lino» no se sustituye por la subasta entera');
  assert.equal(estado(m), 'esperando');
  assert.equal(motivo(m), 'ajena');
  m.lua('AuctionHouseFrame.BrowseResultsFrame:Hide()'); // deja de mirarla
  m.avanzar(2);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 3);
  m.avanzar(10);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 5000);
  sinErrores(m);
});

test('una búsqueda con texto sin lista de Blizzard a la vista: espera a que pase un rato antes de volver a navegar', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 5000, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 0.1);
  ajena(m, 'lino');
  m.avanzar(30);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 2, 'el jugador acaba de buscar');
  m.avanzar(40);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 3);
  m.avanzar(10);
  assert.equal(estado(m), 'completo');
  sinErrores(m);
});

test('como mucho 2 vueltas automáticas por apertura: a la tercera búsqueda ajena se para y lo dice; al reabrir vuelve a escanear', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 5000, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 0.1);
  let nuestras = 1;
  for (let vuelta = 1; vuelta <= 2; vuelta++) {
    ajena(m); // estropea nuestra vuelta
    m.avanzar(CALMA + 1.5);
    nuestras += 1;
    assert.equal(llamadas(m, 'SendBrowseQuery'), nuestras + vuelta, `vuelta automática ${vuelta}`);
    assert.equal(estado(m), 'escaneando');
  }
  ajena(m);
  m.avanzar(30);
  assert.equal(estado(m), 'parado');
  assert.equal(motivo(m), 'ajena');
  assert.equal(llamadas(m, 'SendBrowseQuery'), nuestras + 3, 'no lo intenta más');
  assert.match(cabecera(m), new RegExp(literal(texto(m, 'COMERCIO_ESCANEO_PARADO_AJENA'))));
  assert.doesNotMatch(cabecera(m), new RegExp(literal(texto(m, 'COMERCIO_ESPERANDO'))));
  cerrar(m);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 10);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 5000);
  sinErrores(m);
});

test('Escaneo.propia(fn): las búsquedas de nuestros módulos no cuentan como ajenas', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 120, 50);
  abrir(m);
  m.lua('BANCO.ponerSubasta({lista = false})');
  m.avanzar(ESPERA_INICIO + 1);
  assert.deepEqual(m.lua('{SnetForever.Escaneo.propia(function(a, b) return a + b, "z" end, 2, 3)}'), [5, 'z']);
  m.lua('SnetForever.Escaneo.propia(function() C_AuctionHouse.SendBrowseQuery({searchString = "x", sorts = {}}) end)');
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  m.avanzar(0.1);
  assert.equal(llamadas(m, 'SendBrowseQuery'), 2, 'sin calma: la búsqueda era nuestra');
  m.avanzar(2);
  assert.equal(estado(m), 'completo');
  assert.equal(m.lua('(pcall(SnetForever.Escaneo.propia, function() error("roto") end))'), false, 'el error sale');
  // Tras el error, una búsqueda de otro sí vuelve a contar como ajena.
  m.lua('BANCO.ponerSubasta({lista = false})');
  m.lua('SnetForever.Escaneo.iniciar()');
  m.avanzar(1);
  ajena(m);
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  m.avanzar(1);
  assert.equal(motivo(m), 'ajena');
  sinErrores(m);
});

test('una compra durante el escaneo por páginas: el escaneo no pide páginas mientras la compra busca, la compra no espera a que acabe y después el escaneo sigue sin perder nada', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 1000, 50); // 20 páginas
  m.lua('BANCO.ponerSubasta({objetos = {[2005] = {{quantity = 1, buyoutAmount = 50}}}})');
  m.lua('BANCO.jugador.dinero = 10000000');
  abrir(m);
  m.avanzar(ESPERA_INICIO + 0.2);
  assert.equal(estado(m), 'escaneando');
  const antes = cuantos(m);
  assert.ok(antes >= 50 && antes < 1000, `va por la mitad (${antes})`);
  // FP apunta en qué fase estaba la compra cada vez que el escaneo pide una página.
  m.lua(`rawset(_G, "FP", {})
    hooksecurefunc(C_AuctionHouse, "RequestMoreBrowseResults", function()
      local e = SnetForever.Compra.estado()
      FP[#FP + 1] = e and e.fase or "nada"
    end)`);
  assert.equal(m.lua('SnetForever.Compra.elegir(2005)'), true);
  let pasos = 0;
  while (m.lua('SnetForever.Compra.estado().fase') === 'buscando' && pasos < 200) {
    m.avanzar(0.05);
    pasos++;
  }
  assert.ok(!(m.lua('FP') || []).includes('buscando'), 'mientras la compra busca, el escaneo no pide páginas');
  assert.ok(pasos <= 6, `la compra no espera a que acabe el escaneo (${pasos} saltos)`);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  assert.equal(llamadas(m, 'SendSearchQuery'), 1);
  assert.ok(cuantos(m) >= antes, 'lo recibido se queda');
  // Con la compra «lista» (el jugador aún no la toca) el escaneo sigue y acaba.
  m.avanzar(5);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 1000);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista', 'la compra sigue preparada');
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 0, 'y nada se compra solo');
  sinErrores(m);
});

test('una vuelta de navegar que vuelve sin ninguna fila no cuenta como completa ni borra nada: se para y lo dice', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { comercio: { ultimaReplica: 1790000000 } } } });
  navegar(m, 10, 50);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(cuantos(m), 10);
  cerrar(m);
  m.lua('BANCO.ponerSubasta({navegar = {}})');
  m.avanzar(30);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(estado(m), 'parado');
  assert.equal(motivo(m), 'vacia');
  assert.equal(cuantos(m), 10, 'lo del escaneo anterior se queda');
  assert.match(cabecera(m), new RegExp(literal(texto(m, 'COMERCIO_ESCANEO_VACIA'))));
  // Al reabrir con la subasta ya bien, vuelve a escanear y el aviso se va.
  cerrar(m);
  navegar(m, 3, 50);
  m.avanzar(30);
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(estado(m), 'completo');
  assert.equal(cuantos(m), 3);
  assert.doesNotMatch(cabecera(m), new RegExp(literal(texto(m, 'COMERCIO_ESCANEO_VACIA'))));
  sinErrores(m);
});

// Convivencia con TSM: con la subasta de Blizzard sacada de la pantalla y a escala 0,001, el escaneo automático no
// arranca (competiría con las consultas de TSM); la siguiente apertura vuelve a mirar.
const SUBASTA_FALSA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); ';

test('con la subasta a escala 0,001 (TSM) el escaneo automático no arranca; con ella normal, sí; la siguiente apertura vuelve a mirar', () => {
  const m = maquina({ previo: SUBASTA_FALSA });
  m.lua('BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400}}})');
  abrir(m);
  // TSM la esconde como siempre (escala, y fuera de la pantalla): la que teníamos escondida nosotros pasa a ser suya.
  m.lua('AuctionHouseFrame:SetScale(0.001); AuctionHouseFrame:ClearAllPoints(); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", -300000, 300000)');
  m.avanzar(ESPERA_INICIO + 0.5);
  assert.equal(llamadas(m, 'ReplicateItems') + llamadas(m, 'SendBrowseQuery'), 0, 'ninguna consulta mientras TSM la tiene');
  assert.equal(estado(m), 'parado');
  m.avanzar(10);
  assert.equal(llamadas(m, 'ReplicateItems') + llamadas(m, 'SendBrowseQuery'), 0, 'y no se reintenta');
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.lua('AuctionHouseFrame:SetScale(1); AuctionHouseFrame:ClearAllPoints(); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100)');
  abrir(m);
  m.avanzar(ESPERA_INICIO + 0.5);
  assert.equal(llamadas(m, 'ReplicateItems'), 1, 'la siguiente apertura, con la subasta normal, escanea');
  sinErrores(m);
});

// F1 (fallo en el juego): ReplicateItems no da la subasta de ahora sino una foto guardada por el servidor, de cuándo no se
// sabe. Cada dato dice de dónde sale («replica» o «navegar») y la hora a la que se LEYÓ, para que el tooltip no la venda
// como de ahora.
test('cada dato del escaneo guarda de dónde sale y cuándo se leyó', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400}}})');
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(estado(m), 'completo');
  const t1 = m.lua('GetServerTime()');
  const deReplica = dato(m, 2589);
  assert.equal(deReplica.origen, 'replica');
  assert.ok(Math.abs(deReplica.hora - t1) <= 2, 'la hora es la de lectura');
  assert.deepEqual([deReplica.precio, deReplica.cantidad], [120, 20]);
  // Cinco minutos después, con la réplica aún reciente, navega: el dato pasa a «navegar» con su hora de lectura nueva.
  cerrar(m);
  saltar(m, 5 * 60);
  m.lua('BANCO.ponerSubasta({navegar = {{itemID = 2589, totalQuantity = 30, minPrice = 110}}, porPagina = 50})');
  abrir(m);
  m.avanzar(ESPERA_INICIO + 1);
  assert.equal(llamadas(m, 'ReplicateItems'), 1);
  assert.equal(estado(m), 'completo');
  const t2 = m.lua('GetServerTime()');
  const deNavegar = dato(m, 2589);
  assert.equal(deNavegar.origen, 'navegar');
  assert.ok(Math.abs(deNavegar.hora - t2) <= 2 && deNavegar.hora > deReplica.hora, JSON.stringify(deNavegar));
  assert.deepEqual([deNavegar.precio, deNavegar.cantidad], [110, 30]);
  // Una réplica leída a medias se descarta: el objeto vuelve a lo de antes, también a su origen y su hora.
  cerrar(m);
  saltar(m, 15 * 60);
  m.lua(`SnetForever.Escaneo.POR_TROZO = 1
    BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 5, buyoutPrice = 450}, {name = "Otro", itemID = 777, count = 1, buyoutPrice = 9}}})`);
  abrir(m);
  m.avanzar(ESPERA_INICIO);
  m.avanzar(0.05);
  assert.equal(llamadas(m, 'ReplicateItems'), 2);
  assert.equal(estado(m), 'escaneando');
  assert.equal(dato(m, 2589).origen, 'replica', 'el primer trozo ya lo ha leído');
  cerrar(m);
  assert.deepEqual(dato(m, 2589), deNavegar, 'lo parcial se descarta entero');
  sinErrores(m);
});
