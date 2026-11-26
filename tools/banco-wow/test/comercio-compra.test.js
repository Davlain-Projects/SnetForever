// Comercio, tarea 13: comprar con un clic (comercio/compra.lua y la barra de compra del pie de ui/comercio.lua).
// Pulsar una fila busca esa subasta en el servidor y deja la compra «lista» enseñando qué, cuántas y cuánto; un clic en
// Comprar compra (objeto: PlaceBid) o pide el precio real (mercancía: StartCommoditiesPurchase → COMMODITY_PRICE_UPDATED →
// «confirmar» → otro clic: ConfirmCommoditiesPurchase). Nunca compra solo: las funciones de compra solo se llaman desde el
// OnClick del botón Comprar (el banco las hace fallar fuera de un clic). El escaneo en vivo (Task 10) aún no existe: se
// imita con su interfaz prevista, como en comercio-ventana.test.js.
// Las pruebas con testSiempre no necesitan el comercio: corren también en la pasada de solo núcleo.
import { after, test as testSiempre } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
// 0.7.0: las pruebas de este archivo (salvo las de testSiempre) necesitan el addon SnetForever_Comercio; en la pasada
// de solo núcleo (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { sinErrores, testConComercio as test } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ADDON = join(RAIZ, 'addons', 'SnetForever');
// 0.7.0: el comercio es el addon SnetForever_Comercio.
const COMERCIO = join(RAIZ, 'addons', 'SnetForever_Comercio');

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const ranuraDeHora = (h) => (h % 8) + 1;
const foto = (h) => h * 3600 + 1357;

// Ranura de precios (contrato de la tarea 7): lo normal de todos es 10 de oro (100000 de cobre) y el ritmo 0,42, así la
// regla de la plantilla (≤ 85 % y ritmo ≥ 0,25) da por buena una fila por debajo de 85000.
const ITEMS = [2589, 2592, 4306, 4338, 14047];
function ponerRanura(dir) {
  const i = ranuraDeHora(H);
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n`);
  const filas = ITEMS.map((item) => `[${item}] = {98000, 400, 100000, 0, 0.42, 85, 0}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${foto(H)}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true}
`);
}

// Máquina Horda del reino Normal con 1000 de oro, precios de la app, nombres de objetos y un escaneo falso.
function maquina({ dinero = 10000000 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-compra-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir);
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua(`BANCO.jugador.dinero = ${dinero}`);
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 2 });
  m.itemInfo(4338, { nombre: 'Paño de tejido mágico', calidad: 3 });
  m.lua(`SnetForever.Escaneo = {
    _datos = {}, iniciar = function() end, parar = function() end,
    estado = function() return "completo" end, datos = function() return SnetForever.Escaneo._datos end,
  }`);
  return m;
}

// Lo que «ha escaneado» el escaneo falso: {item: [precio, cantidad]}. F1 (ronda 1): la lista de ofertas elige el precio de
// cada fila con SNF.Subasta.foto (la lista de Navegar, si no la foto de la app y, solo sin ella, el escaneo); para que estas
// pruebas sigan comprando a sus precios, las listas de Navegar imitadas dicen lo mismo que el escaneo falso.
function escanear(m, filas) {
  const lua = Object.entries(filas).map(([item, [p, n]]) => `[${item}] = {precio = ${p}, cantidad = ${n}, hora = GetServerTime() - 60}`);
  m.lua(`SnetForever.Escaneo._datos = {${lua.join(', ')}}`);
  m.lua(`SnetForever.Busqueda.vivo = function(i)
    local d = SnetForever.Escaneo._datos[i]
    if d then return {precio = d.precio, cantidad = d.cantidad, hora = d.hora, origen = "lista"} end
  end`);
  m.avanzar(0.5); // fuera del medio segundo entre repintados
  m.lua(`SnetForever.emitir("SNF_COMERCIO_ESCANEO", ${lua.length}, ${lua.length})`);
}

const V = 'SnetForever.UIComercio.marco()';
const abrir = (m) => m.disparar('AUCTION_HOUSE_SHOW');
const estado = (m) => m.lua('SnetForever.Compra.estado()');
const llamadas = (m, api) => m.llamadas(`C_AuctionHouse.${api}`);
const texto = (m, clave, ...args) => m.lua(`SnetForever.L.t(${[clave, ...args].map(aLua).join(', ')})`);
const boton = (m) => `${V}.pie.comprar`;
const textoBoton = (m) => m.lua(`${boton(m)}.texto:GetText()`);
const barra = (m) => m.lua(`${V}.pie.info:GetText()`) || '';
// El índice de la fila de un objeto en la lista de la ventana.
function filaDe(m, item) {
  for (let i = 1; i <= 16; i++) {
    const f = m.lua(`SnetForever.UIComercio.fila(${i})`);
    if (!f) break;
    if (f.item === item) return i;
  }
  throw new Error(`el objeto ${item} no está en la lista`);
}
// Pulsa la fila del objeto (como el jugador) y deja llegar la respuesta del servidor.
function pulsarFila(m, item) {
  m.lua(`${V}.filas[${filaDe(m, item)}]:Click()`);
}
// Pulsa Comprar como el jugador. Con una mercancía «lista», el botón de la barra abre el cuadro de cantidad (tarea 5) y
// quien compra es el botón del cuadro: se pulsan los dos, uno tras otro. Lo demás (objeto, mercancía por confirmar) se
// compra desde la barra, como siempre.
// Arreglo de la compra suelta (2026-11-19): un objeto suelto «lista» pide siempre dos clics (el primero no compra: pasa a
// «confirmar»). pulsarComprar da los dos, como el jugador que confirma pasado el medio segundo sin clics; las pruebas del
// primer clic pulsan el botón directamente o con clicSolo.
function pulsarComprar(m) {
  const e = m.lua('SnetForever.Compra.estado()');
  m.lua(`${boton(m)}:Click()`);
  if (e && e.fase === 'lista' && e.tipo === 'mercancia') m.lua('SnetForever.CantidadComercio.marco().comprar:Click()');
  const d = m.lua('SnetForever.Compra.estado()');
  if (e && e.fase === 'lista' && e.tipo === 'objeto' && d && d.fase === 'confirmar') {
    m.avanzar(0.6);
    m.lua(`${boton(m)}:Click()`);
  }
}
const clicSolo = (m) => m.lua(`${boton(m)}:Click()`); // un solo clic, sin confirmar
const pasar = (m) => m.avanzar(0.6); // fuera del medio segundo sin clics tras cambiar lo que pide el botón
const COMPRAS = ['PlaceBid', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase'];
const compras = (m) => COMPRAS.reduce((n, api) => n + llamadas(m, api).length, 0);

// Dos subastas del tejido mágico (objeto, no mercancía): la más barata es la segunda (55000).
const MAGICO = '[4338] = {{quantity = 1, buyoutAmount = 60000}, {quantity = 1, buyoutAmount = 55000}}';
// Lino (mercancía): 5 a 4 de oro, 10 a 4,5 y 50 a 20 (esas ya no son buena compra).
const LINO = '[2589] = {{quantity = 5, unitPrice = 40000}, {quantity = 10, unitPrice = 45000}, {quantity = 50, unitPrice = 200000}}';

test('elegir un objeto: busca su subasta, queda «lista» con el total correcto y no compra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  assert.equal(textoBoton(m), texto(m, 'COMERCIO_COMPRAR'));
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), false, 'sin nada elegido el botón no compra');
  pulsarFila(m, 4338);
  assert.equal(estado(m).fase, 'buscando');
  const busqueda = llamadas(m, 'SendSearchQuery');
  assert.equal(busqueda.length, 1);
  assert.equal(busqueda[0][0].itemID, 4338, 'busca esa subasta en el servidor');
  m.avanzar(0.05);
  const e = estado(m);
  assert.equal(e.fase, 'lista');
  assert.equal(e.item, 4338);
  assert.equal(e.cantidad, 1);
  assert.equal(e.precioUnit, 55000);
  assert.equal(e.total, 55000, 'la subasta más barata');
  assert.equal(compras(m), 0, 'elegir no compra');
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), true);
  // La barra de abajo ya no dice el nombre (la fila elegida está pintada en la tabla): cuántas y cuánto.
  assert.equal(barra(m), texto(m, 'COMERCIO_BARRA_LISTA', 1, '5g 50s 00c'), 'enseña cuántas y cuánto');
  m.avanzar(30);
  assert.equal(compras(m), 0, 'tampoco compra con el tiempo');
  sinErrores(m);
});

test('pulsar Comprar en un objeto llama a PlaceBid una vez; el segundo clic, mientras compra, no hace nada', () => {
  const m = maquina({ dinero: 1000000 });
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pulsarComprar(m);
  assert.deepEqual(llamadas(m, 'PlaceBid'), [[4338 * 1000 + 2, 55000]]);
  assert.equal(estado(m).fase, 'comprando');
  pulsarComprar(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 1, 'una compra por clic y nada mientras espera');
  m.avanzar(0.05);
  assert.equal(m.lua('BANCO.jugador.dinero'), 1000000 - 55000);
  assert.equal(estado(m).fase, 'hecho', 'sin otra fila buena se queda en «hecho»');
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 55000);
  assert.equal(llamadas(m, 'PlaceBid').length, 1);
  sinErrores(m);
});

test('mercancía: Comprar pide el precio; si sube, «confirmar» enseña el total nuevo y hace falta otro clic', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  let e = estado(m);
  assert.equal(e.fase, 'lista');
  // Empieza en 1 unidad; hasta el precio de la fila (4,5 de oro, el tope) caben 15: 5 a 4 de oro y 10 a 4,5.
  assert.equal(e.cantidad, 1);
  assert.equal(e.total, 40000);
  assert.equal(ponerCantidad(m, 15), true);
  e = estado(m);
  assert.equal(e.cantidad, 15);
  assert.equal(e.total, 5 * 40000 + 10 * 45000);
  m.avanzar(0.6); // el botón no acepta clics justo después de cambiar la cantidad
  // Entre elegir y comprar las de 4 de oro suben a 4,2: el servidor anunciará un precio más alto que el que se vio, pero
  // sin que ninguna unidad pase del precio de la fila (4,5 de oro). B6r, ronda 2: el tope es de cada unidad y se mira con
  // la lista de ahora, así que la subida tiene que estar en la lista (antes, un precioCompra inventado: ahora sería
  // «cambió de precio»).
  m.lua('BANCO.subasta.mercancias[2589][1].unitPrice = 42000'); // 5 × 42000 + 10 × 45000 = 15 × 44000
  pulsarComprar(m);
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase'), [[2589, 15]]);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  m.avanzar(0.05);
  e = estado(m);
  assert.equal(e.fase, 'confirmar');
  assert.equal(e.total, 15 * 44000, 'el total real que da COMMODITY_PRICE_UPDATED');
  assert.equal(e.precioUnit, 44000);
  assert.equal(e.subio, true);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'no confirma solo');
  assert.match(barra(m), /antes 65g 00s 00c, ahora 66g 00s 00c/, 'la barra enseña el total nuevo');
  assert.match(textoBoton(m), /66g/, 'el botón dice cuánto va a pagar');
  m.avanzar(30);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'tampoco con el tiempo');
  pulsarComprar(m);
  assert.deepEqual(llamadas(m, 'ConfirmCommoditiesPurchase'), [[2589, 15]]);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'hecho');
  assert.equal(m.lua('BANCO.jugador.dinero'), 10000000 - 15 * 44000);
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 1);
  sinErrores(m);
});

test('sin oro bastante: «error» sin_oro y ninguna llamada de compra (al elegir, al pulsar y al confirmar)', () => {
  // Al elegir.
  const m = maquina({ dinero: 10000 });
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}, mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 2589: [45000, 65] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'sin_oro');
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), false);
  pulsarComprar(m);
  assert.equal(compras(m), 0);
  assert.match(barra(m), /oro/);
  // Lista con oro y el oro se va antes del clic.
  m.lua('BANCO.jugador.dinero = 10000000');
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  m.lua('BANCO.jugador.dinero = 50000');
  pulsarComprar(m);
  assert.equal(estado(m).motivo, 'sin_oro');
  assert.equal(compras(m), 0);
  // Mercancía: el precio real pasa del oro que hay → se cancela y no se confirma.
  m.lua('BANCO.jugador.dinero = 660000');
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(ponerCantidad(m, 15), true); // 650000 caben en los 660000 que hay
  m.avanzar(0.6);
  // 667500: ninguna unidad pasa de la fila (4,5 de oro), pero sí del oro (B6r, ronda 2: la subida, en la lista de ahora).
  m.lua('BANCO.subasta.mercancias[2589][1].unitPrice = 43500'); // 5 × 43500 + 10 × 45000
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'sin_oro');
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 1);
  pulsarComprar(m);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('tope de gasto de la sesión: la compra que lo supera da «error» tope y no compra', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioTope", 100000)');
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'hecho');
  // Ya van 55000 de 100000: la siguiente (60000) se pasa.
  escanear(m, { 4306: [60000, 1] });
  pulsarFila(m, 4306);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'tope');
  pulsarComprar(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 1);
  assert.match(barra(m), /tope/);
  // Con 0 no hay tope.
  m.lua('SnetForever.Ajustes.set("comercioTope", 0)');
  pulsarFila(m, 4306);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  sinErrores(m);
});

test('tras «hecho», la siguiente fila buena queda «lista» y no se compra sola', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 4306: [60000, 1], 2592: [200000, 4] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.05); // la compra se hace y se busca la siguiente
  m.avanzar(0.05); // llega la búsqueda de la siguiente
  const e = estado(m);
  assert.equal(e.fase, 'lista');
  assert.equal(e.item, 4306, 'la siguiente buena (el lino de 200 % no lo es)');
  assert.equal(e.total, 60000);
  m.avanzar(30);
  assert.equal(llamadas(m, 'PlaceBid').length, 1, 'solo la del clic');
  const chat = m.llamadas('AddMessage').map((a) => a[0]).join('\n');
  assert.match(chat, /Paño de tejido mágico[^\n]*5g 50s 00c/, `el chat apunta lo comprado: ${chat}`);
  sinErrores(m);
});

// Arreglo de la compra suelta (2026-11-19): en la lista vieja un objeto suelto pide siempre dos clics (antes, solo si pasaba
// de comercioAvisoOro, con un armado de 5 s). El botón dice el total; el primer clic no compra y pasa a «Confirmar X».
test('lista vieja: un objeto suelto dice «Comprar X», el primer clic no compra y el segundo, «Confirmar X», sí', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pasar(m);
  // Ronda 1 del arreglo: el botón dice siempre el total exacto, sin «~», y cabe entero; la barra también lo dice.
  assert.equal(textoBoton(m), texto(m, 'SUBASTA_RES_COMPRAR', '1', '5g 50s 00c'));
  assert.ok(!textoBoton(m).includes('~'));
  cabeEnElBoton(m);
  assert.equal(barra(m), texto(m, 'COMERCIO_BARRA_LISTA', '1', '5g 50s 00c'));
  clicSolo(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'el primer clic no compra');
  assert.equal(estado(m).fase, 'confirmar');
  assert.equal(textoBoton(m), texto(m, 'SUBASTA_RES_CONFIRMAR', '1', '5g 50s 00c'));
  assert.ok(!textoBoton(m).includes('~'));
  cabeEnElBoton(m);
  assert.equal(barra(m), texto(m, 'COMERCIO_BARRA_CONFIRMAR_OBJETO', '1', '5g 50s 00c'));
  clicSolo(m); // el segundo clic de un doble clic no cuenta
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'el doble clic no compra');
  // Nada cambia solo mientras espera el segundo clic.
  const foto = () => m.lua(`(function() local b = ${boton(m)} return {t = b.texto:GetText(), barra = ${V}.pie.info:GetText()} end)()`);
  pasar(m);
  const antes = foto();
  for (let k = 0; k < 7; k++) {
    m.avanzar(1);
    assert.deepEqual(foto(), antes, `a los ${k + 1} s, igual`);
  }
  clicSolo(m);
  assert.deepEqual(llamadas(m, 'PlaceBid'), [[4338002, 55000]], 'el segundo clic compra esa subasta por su total');
  sinErrores(m);
});

// Ronda 1 del arreglo de la compra suelta: con un objeto suelto el botón de la lista vieja (99 px de texto) dice siempre el
// importe exacto; si no cabe, el botón se ensancha lo justo y la barra de progreso se encoge, sin pisar nada.
const FACTOR_LETRA = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };
const letraReal = (m) => m.lua(`BANCO.letraReal = {${Object.entries(FACTOR_LETRA).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);
function cabeEnElBoton(m) {
  const d = m.lua(`(function()
    local p = ${V}.pie
    local b, t = p.comprar, p.comprar.texto
    return {texto = t:GetUnboundedStringWidth(), sitio = t:GetWidth(), boton = b:GetWidth(),
      comprarIzq = b:GetLeft(), descartarDer = p.descartar:GetRight(), engranajeDer = p.engranaje:GetRight(),
      descartarIzq = p.descartar:GetLeft(), llevasDer = p.llevas:GetRight(), engranajeIzq = p.engranaje:GetLeft(),
      progDer = p.progreso:GetRight(), llevasIzq = p.llevas:GetLeft(), prog = p.progreso:GetWidth(),
      pieIzq = p:GetLeft(), progIzq = p.progreso:GetLeft()}
  end)()`);
  assert.ok(d.texto <= d.sitio + 0.01 && d.sitio <= d.boton, `el importe cabe entero en el botón: ${JSON.stringify(d)}`);
  assert.ok(d.descartarDer <= d.comprarIzq + 0.01 && d.engranajeDer <= d.descartarIzq + 0.01
    && d.llevasDer <= d.engranajeIzq + 0.01 && d.progDer <= d.llevasIzq + 0.01, `nada se pisa: ${JSON.stringify(d)}`);
  assert.ok(d.prog > 100 && d.progIzq >= d.pieIzq, `la barra de progreso sigue a la vista: ${JSON.stringify(d)}`);
  return d;
}

test('lista vieja: un objeto suelto con un importe largo dice el total exacto y cabe, en es y en; al soltarlo el botón vuelve', () => {
  for (const idioma of ['es', 'en']) {
    for (const cobre of [99999999, 9999999, 123456]) {
      const m = maquina({ dinero: 200000000 });
      letraReal(m);
      m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
      m.lua(`BANCO.ponerSubasta({objetos = {[4338] = {{quantity = 1, buyoutAmount = ${cobre}}}}})`);
      abrir(m);
      m.lua(`${V}:SetSize(830, 500)`); // la ventana al mínimo
      escanear(m, { 4338: [cobre, 1] });
      const base = m.lua(`${boton(m)}:GetWidth()`);
      // La fila de la lista con su precio (sin la regla del grupo, que con su tope de oro no dejaría un importe así).
      assert.equal(m.lua(`SnetForever.Compra.elegir({item = 4338, precio = ${cobre}, cantidad = 1, exacta = true})`), true);
      m.avanzar(0.05);
      pasar(m);
      const importe = m.lua(`SnetForever.UIComercio.dinero(${cobre})`);
      assert.equal(textoBoton(m), texto(m, 'SUBASTA_RES_COMPRAR', '1', importe), `${idioma} ${cobre}`);
      cabeEnElBoton(m);
      clicSolo(m);
      pasar(m);
      assert.equal(textoBoton(m), texto(m, 'SUBASTA_RES_CONFIRMAR', '1', importe), `${idioma} ${cobre}`);
      cabeEnElBoton(m);
      m.lua(`${V}.pie.descartar:Click()`);
      assert.equal(estado(m), undefined);
      assert.equal(m.lua(`${boton(m)}:GetWidth()`), base, 'sin compra, el botón vuelve a su ancho');
      assert.equal(llamadas(m, 'PlaceBid').length, 0);
      sinErrores(m);
    }
  }
});

test('lista vieja: si la fila de un objeto por confirmar deja de estar en la lista, la compra se suelta y no se compra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}, mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 2589: [45000, 65] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pasar(m);
  clicSolo(m);
  pasar(m);
  assert.equal(estado(m).fase, 'confirmar');
  // Otra lista: el tejido mágico ya no está en ella.
  escanear(m, { 2589: [45000, 65] });
  m.avanzar(0.1);
  assert.equal(estado(m), undefined, 'la compra que ya no se ve se suelta');
  clicSolo(m);
  pasar(m);
  clicSolo(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'nunca se compra lo que no se ve');
  sinErrores(m);
});

// Ronda 2 del arreglo de la compra suelta (la sonda de la re-revisión): la fila deja la lista mientras la compra aún busca
// su subasta (el sistema de la subasta ocupado). Antes la marca de «a la vista» se borraba en «buscando» y, cuando la compra
// quedaba «lista», ya nadie la soltaba: dos clics compraban el tejido mágico, que ya no se veía.
test('lista vieja: si la fila deja la lista mientras la compra busca su subasta, se suelta y no se compra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}, mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 2589: [45000, 65] });
  m.lua('BANCO.ponerSubasta({lista = false})'); // el sistema de la subasta, ocupado
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'buscando');
  // Otra lista del escaneo, ya sin el tejido mágico.
  escanear(m, { 2589: [45000, 65] });
  m.avanzar(0.6);
  assert.equal(estado(m), undefined, 'la compra que ya no se ve se suelta, aunque aún busque');
  // El sistema queda libre: nada vuelve a «lista» y ningún clic compra.
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  m.avanzar(0.6);
  pasar(m);
  assert.equal(estado(m), undefined);
  assert.notEqual(textoBoton(m), texto(m, 'SUBASTA_RES_COMPRAR', '1', '5g 50s 00c'));
  clicSolo(m);
  pasar(m);
  clicSolo(m);
  m.avanzar(0.6);
  assert.equal(compras(m), 0, 'nunca se compra lo que no se ve');
  sinErrores(m);
});

test('lista vieja: sin el segundo clic en un minuto, el objeto por confirmar se suelta sin comprar', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pasar(m);
  clicSolo(m);
  assert.equal(estado(m).fase, 'confirmar');
  m.avanzar(61);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'sin_confirmar');
  clicSolo(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 0);
  sinErrores(m);
});

test('la cantidad se limita con maxUnidades y maxOro de la regla del grupo (y valores guardados rotos se recortan)', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  m.lua('_G.claveTelas = SnetForever.Grupos.crear("Mis telas"); SnetForever.Grupos.anadir(claveTelas, 2589)');
  m.lua('SnetForever.UIComercio.olvidarGrupos()');
  m.lua('assert(SnetForever.Reglas.poner(claveTelas, {maxUnidades = 3}))');
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(estado(m).cantidad, 1, 'empieza en 1 aunque quepan más');
  assert.equal(ponerCantidad(m, 200), true); // pide más de lo que deja la regla: se recorta
  assert.equal(estado(m).cantidad, 3);
  assert.equal(estado(m).total, 3 * 40000);
  // maxOro 10 de oro: 2 a 4 de oro (8) y ya no cabe ninguna de 4,5.
  m.lua('assert(SnetForever.Reglas.poner(claveTelas, {maxOro = 100000}))');
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(ponerCantidad(m, 200), true);
  assert.equal(estado(m).cantidad, 2);
  assert.equal(estado(m).total, 80000);
  // Guardado roto (fuera de rango): maxUnidades -5 vale 1; maxOro negativo vale 0 y no deja comprar nada.
  m.lua('SnetForeverCuenta.comercio.reglas[claveTelas].maxUnidades = -5; SnetForeverCuenta.comercio.reglas[claveTelas].maxOro = 1000000');
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(ponerCantidad(m, 200), true);
  assert.equal(estado(m).cantidad, 1);
  m.lua('SnetForeverCuenta.comercio.reglas[claveTelas].maxOro = -1');
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'regla');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('fallos del servidor: sin unidades, compra fallida y subasta que ya no existe; el gasto no cuenta', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioTope", 2000000)');
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}, mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 2589: [45000, 65] });
  // Mientras se elegía, alguien compró el lino: no quedan tantas unidades.
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  m.lua('BANCO.subasta.mercancias[2589] = {{quantity = 2, unitPrice = 40000}}');
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'sin_unidades');
  // La confirmación falla.
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}, compraFalla = true})`);
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  pulsarComprar(m);
  m.avanzar(0.6); // llega el precio real y pasa el medio segundo para poder confirmar
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'fallo');
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 0, 'lo que no se compró no cuenta para el tope');
  // La subasta del objeto desaparece en el servidor antes del clic (el cliente aún la enseña: la foto de su búsqueda; si
  // no, la red del segundo clic no llega a llamar al juego): error rojo del servidor.
  m.lua('BANCO.ponerSubasta({foto = true})');
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  m.lua('BANCO.subasta.objetos[4338] = {}');
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'ya_no_esta', 'ERR_ITEM_NOT_FOUND: esa subasta ya no está');
  // Mejor de más que de menos: sigue contando hasta ver que el oro no se mueve en 15 s.
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 55000);
  m.avanzar(16);
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 0);
  assert.equal(m.lua('BANCO.jugador.dinero'), 10000000);
  sinErrores(m);
});

test('un error rojo ajeno mientras se compra un objeto: si después el oro se va, cuenta como comprado y para el tope', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioTope", 100000)');
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pulsarComprar(m);
  // En el cliente el oro se descuenta cuando responde el servidor; el banco lo quita ya: se devuelve para imitarlo.
  m.lua('BANCO.jugador.dinero = BANCO.jugador.dinero + 55000');
  m.disparar('UI_ERROR_MESSAGE', 50, 'Estás demasiado lejos.');
  assert.equal(estado(m).fase, 'error');
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 55000, 'el error no quita el gasto antes de ver el oro');
  m.lua('BANCO.jugador.dinero = BANCO.jugador.dinero - 55000'); // ahora sí responde el servidor
  m.avanzar(0.05); // PLAYER_MONEY
  assert.equal(estado(m).fase, 'hecho', 'el oro se fue: la compra se hizo');
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 55000, 'y cuenta para el tope');
  const chat = m.llamadas('AddMessage').map((a) => a[0]).join('\n');
  assert.match(chat, /has comprado[^\n]*Paño de tejido mágico/, chat);
  assert.equal(llamadas(m, 'PlaceBid').length, 1);
  sinErrores(m);
});

test('un objeto que de verdad no se compró no se apunta luego por otra bajada de oro', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}, mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 2589: [45000, 65] });
  m.lua('BANCO.ponerSubasta({foto = true})'); // el cliente aún la ve (la foto de su búsqueda)
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  m.lua('BANCO.subasta.objetos[4338] = {}'); // ya no existe en el servidor: error rojo y el oro no se mueve
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).motivo, 'ya_no_esta');
  // Enseguida compra lino (más caro): esa bajada de oro no es la del objeto.
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  pulsarComprar(m);
  m.avanzar(0.6); // llega el precio real y pasa el medio segundo para poder confirmar
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 5 * 40000 + 10 * 45000 + 55000,
    'el lino y, hasta ver que el oro no se mueve, el objeto');
  let chat = m.llamadas('AddMessage').map((a) => a[0]).join('\n');
  assert.match(chat, /has comprado[^\n]*Paño de lino/, chat);
  assert.doesNotMatch(chat, /has comprado[^\n]*tejido mágico/, chat);
  // Una bajada de oro ajena al addon (correo contra reembolso, otro addon): por si acaso cuenta para el tope, pero no
  // se dice «has comprado» ni se salta de fila.
  const antes = estado(m);
  m.lua('BANCO.jugador.dinero = BANCO.jugador.dinero - 55000');
  m.disparar('PLAYER_MONEY');
  chat = m.llamadas('AddMessage').map((a) => a[0]).join('\n');
  assert.doesNotMatch(chat, /has comprado[^\n]*tejido mágico/, chat);
  assert.deepEqual([estado(m).fase, estado(m).item], [antes.fase, antes.item], 'no salta de fila');
  m.avanzar(16);
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 5 * 40000 + 10 * 45000 + 55000, 'se queda contado');
  sinErrores(m);
});

// Ronda de arreglos 1.
test('doble clic en un objeto: el segundo clic no compra (OnDoubleClick vacío y 0,5 s sin aceptar clics)', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pasar(m);
  assert.equal(m.lua(`type(${boton(m)}:GetScript("OnDoubleClick"))`), 'function', 'el botón Comprar tiene OnDoubleClick');
  m.lua(`BANCO.dobleClic(${boton(m)})`);
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'el doble clic solo pide confirmar');
  assert.equal(estado(m).fase, 'confirmar');
  // Arreglo de la compra suelta: el primer clic de un objeto pasa a «confirmar» (el botón cambia de texto por el clic del
  // jugador); el clic que llegue en el medio segundo siguiente lo rechaza Compra.pulsar.
  clicSolo(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'recién cambiado no acepta clics');
  m.avanzar(0.6);
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), true);
  clicSolo(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 1, 'pasado el medio segundo, el clic compra');
  sinErrores(m);
});

test('doble clic en una mercancía: el total nuevo se ve al menos 0,5 s antes de poder confirmar', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  // Más que lo visto (4 de oro), sin pasar de la fila (4,5). B6r, ronda 2: la subida, en la lista de ahora.
  m.lua('BANCO.subasta.mercancias[2589][1].unitPrice = 44000')
  m.lua(`${boton(m)}:Click()`); // con una mercancía «lista», la barra abre el cuadro de cantidad
  m.lua('BANCO.dobleClic(SnetForever.CantidadComercio.marco().comprar)'); // el doble clic es en el botón del cuadro
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 1);
  m.avanzar(0.05); // llega el precio real entre los dos clics
  assert.equal(estado(m).fase, 'confirmar');
  m.lua(`${boton(m)}:Enable()`);
  pulsarComprar(m); // el segundo clic de un doble clic que llega justo al cambiar el botón
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'no confirma sin ver el total nuevo');
  // El precio cambia otra vez antes de confirmar: otro medio segundo.
  m.avanzar(0.6);
  m.lua('BANCO.subasta.mercancias[2589][1].unitPrice = 44500'); // B6r, ronda 2: el precio nuevo también en la lista
  m.disparar('COMMODITY_PRICE_UPDATED', 44500, 44500);
  m.lua(`${boton(m)}:Enable()`);
  pulsarComprar(m);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 1);
  sinErrores(m);
});

test('tras «hecho», un clic de más no compra la siguiente fila recién elegida', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 4306: [60000, 1] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.05);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(estado(m).item, 4306);
  m.lua(`${boton(m)}:Enable()`);
  pulsarComprar(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 1, 'la fila elegida sola no se compra con un clic que ya venía');
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 2);
  sinErrores(m);
});

test('dos compras de objeto con errores ajenos pendientes no se pisan: las dos cuentan cuando baja el oro', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 4306: [60000, 1] });
  for (const [item, precio] of [[4338, 55000], [4306, 60000]]) {
    pulsarFila(m, item);
    m.avanzar(0.05);
    pulsarComprar(m);
    m.lua(`BANCO.jugador.dinero = BANCO.jugador.dinero + ${precio}`); // el servidor aún no ha cobrado
    m.disparar('UI_ERROR_MESSAGE', 50, 'Estás demasiado lejos.');
    assert.equal(estado(m).fase, 'error');
  }
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 115000);
  m.lua('BANCO.jugador.dinero = BANCO.jugador.dinero - 115000'); // cobra las dos
  m.disparar('PLAYER_MONEY');
  m.avanzar(16);
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 115000, 'las dos cuentan para el tope');
  sinErrores(m);
});

test('error claro de la subasta (AUCTION_HOUSE_SHOW_ERROR): fallo; una bajada de oro luego no se da por compra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.lua('BANCO.jugador.dinero = BANCO.jugador.dinero + 55000');
  m.disparar('AUCTION_HOUSE_SHOW_ERROR', 4);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'fallo');
  m.lua('BANCO.jugador.dinero = BANCO.jugador.dinero - 55000');
  m.disparar('PLAYER_MONEY');
  assert.equal(estado(m).fase, 'error', 'no salta a «hecho»');
  const chat = m.llamadas('AddMessage').map((a) => a[0]).join('\n');
  assert.doesNotMatch(chat, /has comprado/, chat);
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 55000, 'pero cuenta para el tope, por si acaso');
  sinErrores(m);
});

test('si el cliente no conoce AUCTION_HOUSE_SHOW_ERROR, la compra funciona igual y sin errores', () => {
  const m = maquina();
  m.lua('BANCO.eventosInvalidos.AUCTION_HOUSE_SHOW_ERROR = true');
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'hecho');
  assert.ok(m.llamadas('C_EventUtils.IsEventValid').some((a) => a[0] === 'AUCTION_HOUSE_SHOW_ERROR'),
    'se ha intentado escuchar');
  sinErrores(m);
});

test('la búsqueda se queda sin respuesta si la subasta nunca se libera: «error» sin_respuesta a los 10 s', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  m.lua('BANCO.ponerSubasta({lista = false})');
  pulsarFila(m, 4338);
  assert.equal(estado(m).fase, 'buscando');
  m.avanzar(11);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'sin_respuesta');
  assert.equal(llamadas(m, 'SendSearchQuery').length, 0);
  sinErrores(m);
});

test('equipo con nivel: los resultados se leen con la itemKey que trae el evento, no con la básica', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}, nivelObjetos = {[4338] = 35}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista', `motivo: ${estado(m).motivo}`);
  assert.equal(estado(m).total, 55000);
  pulsarComprar(m);
  assert.deepEqual(llamadas(m, 'PlaceBid'), [[4338 * 1000 + 2, 55000]]);
  sinErrores(m);
});

test('el tope se mira también al pulsar Comprar y al confirmar una mercancía', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioTope", 1000000)');
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  m.lua('SnetForever.Ajustes.set("comercioTope", 600000)'); // 650000 ya no cabe
  pulsarComprar(m);
  assert.equal(estado(m).motivo, 'tope');
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 0, 'al pulsar');
  m.lua('SnetForever.Ajustes.set("comercioTope", 1000000)');
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  pulsarComprar(m);
  m.avanzar(0.6);
  assert.equal(estado(m).fase, 'confirmar');
  m.lua('SnetForever.Ajustes.set("comercioTope", 600000)');
  pulsarComprar(m);
  assert.equal(estado(m).motivo, 'tope');
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'al confirmar');
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 1);
  // Y si el precio real sube por encima del tope, se cancela sin pedir otro clic.
  m.lua('SnetForever.Ajustes.set("comercioTope", 655000)');
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  // 660000: ninguna unidad pasa de la fila, pero sí del tope (B6r, ronda 2: la subida, en la lista de ahora).
  m.lua('BANCO.subasta.mercancias[2589][1].unitPrice = 42000'); // 5 × 42000 + 10 × 45000
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).motivo, 'tope');
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('la subasta ocupada por otro addon: espera a que se libere para buscar; sin respuesta, error y nada comprado', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  m.lua('BANCO.ponerSubasta({lista = false})');
  pulsarFila(m, 4338);
  assert.equal(estado(m).fase, 'buscando');
  assert.equal(llamadas(m, 'SendSearchQuery').length, 0, 'no la pierde mandándola limitada');
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  assert.equal(llamadas(m, 'SendSearchQuery').length, 1);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  // Sin respuesta del servidor: error al rato.
  m.lua('BANCO.ponerSubasta({abierta = false})'); // el servidor ya no atiende (se apunta como ignorada)
  pulsarFila(m, 4338);
  m.avanzar(15);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'sin_respuesta');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('cerrar la subasta con una compra a medio confirmar la cancela; Descartar también', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  m.lua(`${V}.pie.descartar:Click()`);
  assert.equal(estado(m), undefined);
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 1);
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(estado(m), undefined);
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 2);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('con el comercio apagado por un fallo, Comprar no compra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  m.lua('SnetForever.Comercio.ejecutar("prueba", function() error("roto") end)');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  pulsarComprar(m);
  assert.equal(compras(m), 0);
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), false);
  sinErrores(m);
});

// Task 4: la cantidad de una mercancía se elige. Empieza en 1; ponerCantidad la cambia (recortada a maxCantidad) y el
// total sale de los escalones de precio, del más barato al más caro.
const ponerCantidad = (m, n) => m.lua(`SnetForever.Compra.ponerCantidad(${aLua(n)})`);
const maxCantidad = (m) => m.lua('SnetForever.Compra.maxCantidad()');
const escalones = (m) => Object.values(m.lua('SnetForever.Compra.escalones()') || {});
// Elige la mercancía y deja que responda la búsqueda.
function elegirMercancia(m, item, precioVisto = 45000, cantidadVista = 65) {
  abrir(m);
  escanear(m, { [item]: [precioVisto, cantidadVista] });
  pulsarFila(m, item);
  m.avanzar(0.05);
}

test('una mercancía elegida empieza en 1 unidad al precio más barato', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  assert.equal(escalones(m).length, 0, 'mientras busca no hay escalones');
  m.avanzar(0.05);
  const e = estado(m);
  assert.equal(e.fase, 'lista');
  assert.equal(e.cantidad, 1);
  assert.equal(e.total, 40000, 'el precio del escalón más barato');
  assert.equal(e.precioUnit, 40000);
  assert.equal(maxCantidad(m), 15, 'las 5 de 4 de oro y las 10 de 4,5 (las de 20 de oro pasan del precio de la fila)');
  assert.equal(compras(m), 0);
  assert.equal(barra(m), texto(m, 'COMERCIO_BARRA_LISTA', 1, '4g 00s 00c'));
  sinErrores(m);
});

test('ponerCantidad(20) suma las 20 más baratas, escalón a escalón', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 5, unitPrice = 10}, {quantity = 10, unitPrice = 12}, {quantity = 50, unitPrice = 15}}}})');
  elegirMercancia(m, 2589, 15, 65); // la fila a 15 por unidad: hasta ese precio entran los tres escalones
  assert.equal(estado(m).total, 10);
  assert.deepEqual(escalones(m), [{ precio: 10, n: 5, acumulado: 5 }, { precio: 12, n: 10, acumulado: 15 }, { precio: 15, n: 50, acumulado: 65 }]);
  assert.equal(ponerCantidad(m, 20), true);
  const e = estado(m);
  assert.equal(e.fase, 'lista');
  assert.equal(e.cantidad, 20);
  assert.equal(e.total, 5 * 10 + 10 * 12 + 5 * 15);
  assert.equal(e.total, 245);
  assert.equal(e.precioUnit, 13, 'el precio medio, redondeado hacia arriba');
  assert.equal(ponerCantidad(m, 3), true, 'bajar también vale');
  assert.equal(estado(m).total, 30);
  assert.equal(compras(m), 0, 'cambiar la cantidad no compra');
  sinErrores(m);
});

test('ponerCantidad recorta al máximo (límite de precio, maxUnidades y maxOro) y rechaza 0, -1, 2,5 y "x"', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  m.lua('_G.claveTelas = SnetForever.Grupos.crear("Mis telas"); SnetForever.Grupos.anadir(claveTelas, 2589)');
  m.lua('SnetForever.UIComercio.olvidarGrupos()');
  escanear(m, { 2589: [45000, 65] });
  // El precio de la fila (4,5 de oro) es el tope: las 50 de 20 de oro no entran.
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(maxCantidad(m), 15);
  assert.equal(ponerCantidad(m, 100), true);
  assert.equal(estado(m).cantidad, 15);
  assert.equal(estado(m).total, 5 * 40000 + 10 * 45000);
  // maxUnidades.
  m.lua('assert(SnetForever.Reglas.poner(claveTelas, {maxUnidades = 3}))');
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(maxCantidad(m), 3);
  assert.equal(ponerCantidad(m, 50), true);
  assert.equal(estado(m).cantidad, 3);
  assert.equal(estado(m).total, 3 * 40000);
  // maxOro 5 de oro: 5 a 4 de oro (2) y 6 a 4,5 (2,7) = 4,7 de oro; la séptima ya no cabe.
  m.lua('assert(SnetForever.Reglas.poner(claveTelas, {maxUnidades = 200, maxOro = 500000}))');
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(maxCantidad(m), 11);
  assert.equal(ponerCantidad(m, 15), true);
  assert.equal(estado(m).cantidad, 11);
  assert.equal(estado(m).total, 5 * 40000 + 6 * 45000);
  // Lo que no es un entero ≥ 1 no cambia nada.
  assert.equal(ponerCantidad(m, 4), true);
  const antes = estado(m);
  for (const malo of [0, -1, 2.5, 'x', '5', true]) {
    assert.equal(ponerCantidad(m, malo), false, `rechaza ${JSON.stringify(malo)}`);
    const e = estado(m);
    assert.equal(e.cantidad, antes.cantidad);
    assert.equal(e.total, antes.total);
    assert.equal(e.fase, 'lista');
  }
  assert.equal(m.lua('SnetForever.Compra.ponerCantidad()'), false);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('cambiar la cantidad en «confirmar» cancela la compra a medio hacer y vuelve a «lista»', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  elegirMercancia(m, 2589);
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 0);
  assert.equal(ponerCantidad(m, 5), true);
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 1, 'la compra a medias se cancela');
  const e = estado(m);
  assert.equal(e.fase, 'lista');
  assert.equal(e.cantidad, 5);
  assert.equal(e.total, 5 * 40000);
  assert.equal(e.subio, undefined, 'el aviso de precio subido ya no vale');
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  // Para comprar hay que volver a pedir el precio: otro clic, con la cantidad nueva.
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase'), [[2589, 15], [2589, 5]]);
  sinErrores(m);
});

test('StartCommoditiesPurchase y ConfirmCommoditiesPurchase reciben la cantidad elegida', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  elegirMercancia(m, 2589);
  assert.equal(ponerCantidad(m, 7), true); // 5 a 4 de oro y 2 a 4,5
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase'), [[2589, 7]]);
  m.avanzar(0.05);
  const e = estado(m);
  assert.equal(e.fase, 'confirmar');
  assert.equal(e.cantidad, 7);
  assert.equal(e.total, 5 * 40000 + 2 * 45000);
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.deepEqual(llamadas(m, 'ConfirmCommoditiesPurchase'), [[2589, 7]]);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'hecho');
  assert.equal(m.lua('BANCO.jugador.dinero'), 10000000 - (5 * 40000 + 2 * 45000));
  sinErrores(m);
});

test('el tope de gasto y el aviso de oro miran el total de la cantidad elegida', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioTope", 500000)');
  m.lua('SnetForever.Ajustes.set("comercioAvisoOro", 300000)');
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  elegirMercancia(m, 2589);
  assert.equal(estado(m).aviso, false, '1 unidad (4 de oro) no pasa del aviso');
  assert.equal(ponerCantidad(m, 7), true); // 290000: bajo el aviso y bajo el tope
  assert.equal(estado(m).aviso, false);
  assert.equal(ponerCantidad(m, 8), true); // 335000: pasa el aviso
  assert.equal(estado(m).aviso, true);
  assert.equal(ponerCantidad(m, 12), true); // 5·4 + 7·4,5 = 51,5 de oro: pasa el tope de 50
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'tope');
  assert.equal(compras(m), 0, 'el tope se mira con el total de la cantidad elegida');
  sinErrores(m);
});

test('maxCantidad y ponerCantidad no valen sin una mercancía lista; un objeto suelto mantiene la cantidad de su subasta', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  assert.equal(maxCantidad(m), 0);
  assert.equal(ponerCantidad(m, 1), false);
  assert.equal(escalones(m).length, 0);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).tipo, 'objeto');
  assert.equal(ponerCantidad(m, 1), false, 'un objeto suelto no cambia de cantidad');
  assert.equal(estado(m).total, 55000);
  assert.equal(maxCantidad(m), 1);
  sinErrores(m);
});

test('en un objeto suelto, escalones() da sus subastas con el tiempo restante de ITEM_SEARCH_RESULTS', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({objetos = {[4338] = {{quantity = 3, buyoutAmount = 150000, timeLeftSeconds = 7200}, {quantity = 1, buyoutAmount = 55000}, {quantity = 1, buyoutAmount = 60000, timeLeftSeconds = 100}}}})');
  abrir(m);
  // Arreglo de la compra suelta: la primera fila son 3 subastas iguales de 1 a 150000 cada una (como en WoW Forever), no 3 a
  // 50000: cada subasta de objeto es 1 unidad por su compra entera.
  escanear(m, { 4338: [55000, 5] });
  pulsarFila(m, 4338);
  assert.equal(escalones(m).length, 0, 'mientras busca no hay escalones');
  m.avanzar(0.05);
  const e = estado(m);
  assert.equal(e.fase, 'lista');
  assert.equal(e.cantidad, 1, 'una subasta de objeto es 1 unidad');
  assert.equal(e.total, 55000);
  assert.equal(maxCantidad(m), 1);
  assert.deepEqual(escalones(m), [
    { precio: 55000, n: 1, acumulado: 1 },
    { precio: 60000, n: 1, acumulado: 2, tiempo: 100 },
    { precio: 150000, n: 1, acumulado: 3, tiempo: 7200 },
  ]);
  sinErrores(m);
});

test('en una mercancía los escalones no llevan tiempo y sin nada elegido no hay escalones', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 5, unitPrice = 40000, timeLeftSeconds = 99}, {quantity = 10, unitPrice = 45000}}}})');
  elegirMercancia(m, 2589);
  assert.equal(escalones(m).length, 2);
  for (const f of escalones(m)) assert.equal(f.tiempo, undefined);
  m.lua('SnetForever.Compra.cancelar()');
  assert.equal(escalones(m).length, 0);
  sinErrores(m);
});

// Quita los comentarios de Lua de una línea (basta para este addon: no hay «--» dentro de textos en estos archivos).
const sinComentario = (linea) => {
  const i = linea.indexOf('--');
  return i >= 0 ? linea.slice(0, i) : linea;
};

function archivosLua(dir) {
  const salida = [];
  for (const nombreArchivo of readdirSync(dir)) {
    const ruta = join(dir, nombreArchivo);
    if (statSync(ruta).isDirectory()) salida.push(...archivosLua(ruta));
    else if (ruta.endsWith('.lua')) salida.push(ruta);
  }
  return salida;
}

// Cualquier mención de pulsar como campo: «.pulsar» (con o sin paréntesis) o «["pulsar"]» / «['pulsar']».
const USO_PULSAR = /\.\s*pulsar\b|\[\s*(["'])pulsar\1\s*\]/;

// Busca en los textos {ruta: texto} las funciones de compra fuera del cuerpo de «function Compra.pulsar()» de
// comercio/compra.lua, y cualquier uso de pulsar que no sea esa definición.
function usosDeCompra(textos) {
  const fuera = [];
  const usosPulsar = [];
  for (const [rel, texto] of Object.entries(textos)) {
    const lineas = texto.split(/\r?\n/);
    let desde = -1;
    let hasta = -1;
    if (rel === 'comercio/compra.lua') {
      desde = lineas.findIndex((l) => /^function Compra\.pulsar\(/.test(l));
      hasta = lineas.findIndex((l, i) => i > desde && /^end\b/.test(l));
      assert.ok(desde >= 0 && hasta > desde, 'compra.lua tiene function Compra.pulsar()');
    }
    lineas.forEach((linea, i) => {
      const codigo = sinComentario(linea);
      if (/PlaceBid|StartCommoditiesPurchase|ConfirmCommoditiesPurchase/.test(codigo) && !(i > desde && i < hasta)) {
        fuera.push(`${rel}:${i + 1}: ${linea.trim()}`);
      }
      if (USO_PULSAR.test(codigo) && !(rel === 'comercio/compra.lua' && i === desde)) usosPulsar.push({ rel, i, linea });
    });
  }
  return { fuera, usosPulsar };
}

// Ronda 1 de B5 (regla del coordinador): se compra EXACTAMENTE la fila marcada, nunca otra subasta aunque sea más barata.
test('regla nueva, lista: con dos subastas del mismo objeto y la marcada más cara por unidad, se compra la marcada', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`); // 60000 (id 4338001) y 55000 (id 4338002)
  abrir(m);
  escanear(m, { 4338: [60000, 2] }); // la fila enseña la de 6 de oro
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(estado(m).total, 60000, 'la de la fila, no la más barata');
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.deepEqual(llamadas(m, 'PlaceBid'), [[4338 * 1000 + 1, 60000]], 'el auctionID de la marcada');
  sinErrores(m);
});

test('regla nueva, lista: la marcada ya no está → «ya no está»; solo con otro precio → «cambió de precio»; nada comprado', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({objetos = {[4338] = {{quantity = 1, buyoutAmount = 55000}}}})');
  abrir(m);
  escanear(m, { 4338: [60000, 2] }); // la de 6 de oro ya se vendió: solo queda otra de 5,5
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.deepEqual([estado(m).fase, estado(m).motivo], ['error', 'cambio_precio']);
  assert.equal(barra(m), texto(m, 'COMERCIO_MOTIVO_CAMBIO_PRECIO'));
  m.lua('BANCO.subasta.objetos[4338] = {}');
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.deepEqual([estado(m).fase, estado(m).motivo], ['error', 'ya_no_esta']);
  assert.equal(barra(m), texto(m, 'COMERCIO_MOTIVO_YA_NO_ESTA'));
  pulsarComprar(m);
  assert.equal(compras(m), 0, 'nada comprado');
  sinErrores(m);
});

test('regla nueva, mercancía: el precio de la fila es el tope; si la cotización lo pasa, «cambió de precio» y nada', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  elegirMercancia(m, 2589, 40000); // la fila a 4 de oro: solo entran las 5 de ese precio
  assert.equal(maxCantidad(m), 5, 'nunca más caras que la fila');
  assert.equal(ponerCantidad(m, 5), true);
  m.avanzar(0.6);
  m.lua('BANCO.ponerSubasta({precioCompra = 41000})'); // 205000 > 5 × 40000
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.deepEqual([estado(m).fase, estado(m).motivo], ['error', 'cambio_precio']);
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 1, 'la compra a medias se cancela');
  pulsarComprar(m);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'nada comprado');
  // Si ya no queda nada a ese precio (solo más caro), tampoco.
  m.lua('BANCO.ponerSubasta({precioCompra = false, mercancias = {[2589] = {{quantity = 10, unitPrice = 45000}}}})');
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.deepEqual([estado(m).fase, estado(m).motivo], ['error', 'cambio_precio']);
  sinErrores(m);
});

// Ronda 2 de B5: en combate no se compra desde ningún sitio.
test('ronda 2: en combate Comprar de la barra va apagado con su tooltip y Compra.pulsar no compra (también por dentro)', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.6);
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), true);
  m.lua('BANCO.jugador.enCombate = true');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), false, 'en combate, apagado');
  m.lua(`${boton(m)}:GetScript("OnEnter")(${boton(m)})`);
  assert.deepEqual(m.lua('GameTooltip:IsShown()') ? m.lua('BANCO.lineasTooltip()') : [], [texto(m, 'COMERCIO_EN_COMBATE')], 'con su tooltip');
  m.lua(`${boton(m)}:GetScript("OnLeave")(${boton(m)})`);
  m.lua(`${boton(m)}:Enable(); ${boton(m)}:Click()`); // aunque el clic llegue
  assert.equal(m.lua('SnetForever.Compra.pulsar()'), false, 'Compra.pulsar lo rechaza por dentro');
  assert.equal(compras(m), 0, 'en combate no compra');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(compras(m), 0, 'al salir no compra nada solo');
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), true);
  pulsarComprar(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 1, 'fuera de combate, el clic compra');
  sinErrores(m);
});

test('ronda 2: al entrar en combate una mercancía a medio confirmar se cancela; al salir no se arma nada', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  elegirMercancia(m, 2589);
  assert.equal(ponerCantidad(m, 5), true);
  m.avanzar(0.6);
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  m.lua('BANCO.jugador.enCombate = true');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 1, 'se cancela en el servidor');
  assert.deepEqual([estado(m).fase, estado(m).motivo], ['error', 'combate']);
  assert.equal(barra(m), texto(m, 'COMERCIO_MOTIVO_COMBATE'));
  m.avanzar(1);
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  m.avanzar(1);
  assert.equal(estado(m).fase, 'error', 'al salir de combate no se vuelve a armar nada');
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 1);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});
// Ronda 3 de B5: el orden real del cliente (PLAYER_REGEN_DISABLED llega antes de que InCombatLockdown() dé true).
test('ronda 3: con PLAYER_REGEN_DISABLED y InCombatLockdown() aún false, Comprar sale apagado y Compra.pulsar no compra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.6);
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), true);
  m.disparar('PLAYER_REGEN_DISABLED'); // BANCO.jugador.enCombate sigue false: InCombatLockdown() da false
  assert.equal(m.lua('InCombatLockdown()'), false);
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), false, 'apagado aunque el bloqueo aún no haya empezado');
  m.lua(`${boton(m)}:Enable(); ${boton(m)}:Click()`);
  assert.equal(m.lua('SnetForever.Compra.pulsar()'), false, 'Compra.pulsar mira la marca del evento');
  assert.equal(compras(m), 0);
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), true, 'al salir, otra vez encendido');
  sinErrores(m);
});

test('ronda 3: en combate, la fila elegida sola tras «hecho» sale ya en su aspecto final (sin medio segundo atenuada)', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 4306: [60000, 1] });
  pulsarFila(m, 4338);
  m.avanzar(0.6);
  pulsarComprar(m); // la compra sale; entra el combate antes de que responda el servidor
  m.disparar('PLAYER_REGEN_DISABLED');
  m.lua('BANCO.jugador.enCombate = true');
  const fondo = () => m.lua(`{${boton(m)}.fondo:GetVertexColor()}`);
  const vistos = [];
  for (let k = 0; k < 20; k++) {
    m.avanzar(0.05);
    if (estado(m).item === 4306 && estado(m).fase === 'lista') vistos.push(fondo());
  }
  assert.ok(vistos.length >= 5, `la siguiente queda lista (${vistos.length})`);
  for (const f of vistos) assert.deepEqual(f, vistos[0], 'el botón no cambia de aspecto solo');
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), false, 'en combate, apagado');
  assert.equal(llamadas(m, 'PlaceBid').length, 1);
  sinErrores(m);
});
// Ronda 4 de B5: la marca del combate se rehace con la verdad del juego (una pantalla de carga en combate puede comerse
// PLAYER_REGEN_ENABLED y dejarla pegada en true).
test('ronda 4: con la marca del combate pegada, PLAYER_ENTERING_WORLD fuera de combate la rehace y Comprar se enciende', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.6);
  m.disparar('PLAYER_REGEN_DISABLED'); // y el PLAYER_REGEN_ENABLED no llega nunca (pantalla de carga)
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), false);
  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  assert.equal(m.lua('SnetForever.Compra.enCombate'), false, 'la marca, con la verdad del juego');
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), true, 'Comprar se enciende');
  pulsarComprar(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 1);
  sinErrores(m);
});

test('ronda 4: con la marca del combate pegada, abrir la subasta fuera de combate la rehace', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  m.disparar('PLAYER_REGEN_DISABLED'); // sin su PLAYER_REGEN_ENABLED
  assert.equal(m.lua('SnetForever.Compra.enCombate'), true);
  abrir(m);
  assert.equal(m.lua('SnetForever.Compra.enCombate'), false, 'al abrir la subasta se rehace');
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.6);
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), true);
  // En combate de verdad, al abrir sigue en combate.
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.lua('BANCO.jugador.enCombate = true');
  abrir(m);
  assert.equal(m.lua('SnetForever.Compra.enCombate'), true, 'en combate de verdad, sigue en combate');
  m.lua('BANCO.jugador.enCombate = false');
  sinErrores(m);
});

test('las funciones de compra solo se llaman dentro de Compra.pulsar, y Compra.pulsar solo desde el botón Comprar', () => {
  // La búsqueda pilla también las formas sin paréntesis o con corchetes.
  const prueba = usosDeCompra({
    'comercio/compra.lua': 'function Compra.pulsar()\n  A.PlaceBid(1, 2)\nend\nlocal p = Compra.pulsar\nCompra["pulsar"]()',
    'x.lua': "local f = SNF.Compra['pulsar']\nlocal g = SNF.Compra . pulsar\nC_AuctionHouse[\"PlaceBid\"](1, 2)",
  });
  assert.equal(prueba.usosPulsar.length, 4, JSON.stringify(prueba.usosPulsar));
  assert.equal(prueba.fuera.length, 1, JSON.stringify(prueba.fuera));
  const textos = {};
  // Los dos addons, el núcleo y el de comercio, con la ruta relativa a cada uno.
  for (const dir of [ADDON, COMERCIO]) {
    for (const ruta of archivosLua(dir)) textos[relative(dir, ruta).replace(/\\/g, '/')] = readFileSync(ruta, 'utf8');
  }
  const { fuera, usosPulsar } = usosDeCompra(textos);
  assert.deepEqual(fuera, [], 'ninguna llamada de compra fuera de Compra.pulsar');
  // Each entry leads to a player-click handler. The group search UI wires its named handler to a single button.
  const shopping = 'ui/subasta/navegar.lua';
  assert.deepEqual(usosPulsar.map((u) => u.rel).sort(),
    ['ui/comercio.lua', 'ui/comercio_cantidad.lua', shopping, 'ui/subasta/resultados.lua', 'ui/subasta/sniper.lua']);
  const botones = {
    'ui/comercio.lua': /Estilo\.botonComercio\(/, 'ui/comercio_cantidad.lua': /\bboton\(/, 'ui/subasta/resultados.lua': /Piezas\.boton\(/,
    'ui/subasta/sniper.lua': /Piezas\.boton\(/,
  };
  for (const { rel, i } of usosPulsar) {
    if (rel === shopping) {
      const lines = textos[rel].split(/\r?\n/);
      const references = lines.filter((line) => /\bpressShoppingPurchase\b/.test(line));
      assert.equal(references.length, 2);
      assert.match(references[0], /^local function pressShoppingPurchase\(\)/);
      assert.match(references[1], /Piezas\.boton\(.+, pressShoppingPurchase, /);
      const start = lines.indexOf(references[0]);
      assert.ok(start < i && i < lines.indexOf('end', start + 1), 'group purchases stay inside the button handler');
      continue;
    }
    // Está en la función del botón (boton(…, función del OnClick)).
    const antes = textos[rel].split(/\r?\n/).slice(Math.max(0, i - 3), i + 1).join('\n');
    assert.match(antes, botones[rel], `la llamada va en el OnClick de un botón (${rel}):
${antes}`);
  }
});

test('Compra.pulsar fuera de un clic del jugador no puede comprar (el cliente lo prohíbe y el banco también)', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  // Arreglo de la compra suelta: el primer clic (de verdad) solo pide confirmar.
  pasar(m);
  clicSolo(m);
  pasar(m);
  assert.equal(estado(m).fase, 'confirmar');
  // Llamada directa, sin Click(): PlaceBid da error de función protegida y no se compra nada.
  assert.throws(() => m.lua('SnetForever.Compra.pulsar()'));
  assert.equal(m.lua('BANCO.jugador.dinero'), 10000000);
});

testSiempre('es y en tienen las mismas claves de la compra y los ajustes nuevos existen', () => {
  const m = crearMaquina();
  const es = Object.keys(m.lua('SnetForever.L.tablas.es')).filter((k) => k.startsWith('COMERCIO_')).sort();
  const en = Object.keys(m.lua('SnetForever.L.tablas.en')).filter((k) => k.startsWith('COMERCIO_')).sort();
  assert.deepEqual(es, en);
  for (const clave of ['COMERCIO_COMPRAR', 'COMERCIO_COMPRAR_ORO', 'COMERCIO_CONFIRMAR',
    'COMERCIO_DESCARTAR', 'COMERCIO_APAGADO']) {
    assert.ok(es.includes(clave), clave);
  }
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioTope")'), 0);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioAvisoOro")'), 100000);
  sinErrores(m);
});

// El gasto, en la ventanita del engranaje de la barra: tope de la sesión y aviso de oro, en oro entero.
const G = `${V}.ajustes`;
// Escribe `valor` en una caja del gasto como el jugador y pulsa Intro (o, con `como`, otro script de la caja).
function escribir(m, caja, valor, como = 'OnEnterPressed') {
  m.lua(`local c = ${G}.${caja}; c:SetFocus(); c:SetText("${valor}"); c:GetScript("${como}")(c)`);
}
const ajuste = (m, clave) => m.lua(`SnetForever.Ajustes.get("${clave}")`);

test('tope de gasto y aviso de oro desde la ventana de comercio: en oro entero, acotados y con «Llevas X de Y»', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  // Por defecto: sin tope y segundo clic desde 10 de oro.
  assert.equal(m.lua(`${G}.tope:GetText()`), '0');
  assert.equal(m.lua(`${G}.aviso:GetText()`), '10');
  assert.equal(m.lua(`${G}.llevas:GetText()`), texto(m, 'COMERCIO_GASTO_LLEVAS_SIN_TOPE', '0c'));
  assert.ok(m.lua(`${G}.textoTope:GetText()`).length > 0);
  assert.ok(m.lua(`${G}.textoAviso:GetText()`).length > 0);
  // Tope de 50 de oro: se guarda en cobre.
  escribir(m, 'tope', '50');
  assert.equal(ajuste(m, 'comercioTope'), 500000);
  assert.equal(m.lua(`${G}.tope:GetText()`), '50');
  assert.equal(m.lua(`${G}.tope:HasFocus()`), false, 'Intro suelta la caja');
  assert.equal(m.lua(`${G}.llevas:GetText()`), texto(m, 'COMERCIO_GASTO_LLEVAS', '0c', '50g 00s 00c'));
  // Negativo, con decimales, letras o vacío: no vale y vuelve a lo que había.
  for (const malo of ['-5', '12.5', '12,5', 'abc', '']) {
    escribir(m, 'tope', malo);
    assert.equal(ajuste(m, 'comercioTope'), 500000, `«${malo}» no cambia el tope`);
    assert.equal(m.lua(`${G}.tope:GetText()`), '50', `«${malo}» vuelve a 50`);
  }
  // Demasiado: se queda en el máximo (100 000 de oro).
  escribir(m, 'tope', '99999999');
  assert.equal(ajuste(m, 'comercioTope'), 1000000000);
  assert.equal(m.lua(`${G}.tope:GetText()`), '100000');
  // Escape deshace lo escrito; salir de la caja también guarda.
  escribir(m, 'tope', '7', 'OnEscapePressed');
  assert.equal(ajuste(m, 'comercioTope'), 1000000000);
  assert.equal(m.lua(`${G}.tope:GetText()`), '100000');
  escribir(m, 'tope', '1', 'OnEditFocusLost');
  assert.equal(ajuste(m, 'comercioTope'), 10000);
  // Aviso de oro a 3: una compra de 5,5 de oro pide segundo clic.
  escribir(m, 'aviso', '3');
  assert.equal(ajuste(m, 'comercioAvisoOro'), 30000);
  escribir(m, 'tope', '20');
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  // Arreglo de la compra suelta: un objeto suelto pide siempre el segundo clic (el aviso de oro ya no hace falta en él).
  assert.equal(estado(m).aviso, false);
  m.avanzar(0.6);
  clicSolo(m); // pide confirmar
  assert.equal(llamadas(m, 'PlaceBid').length, 0);
  m.avanzar(0.6);
  clicSolo(m); // compra
  m.avanzar(0.05);
  assert.equal(llamadas(m, 'PlaceBid').length, 1);
  assert.equal(m.lua(`${G}.llevas:GetText()`), texto(m, 'COMERCIO_GASTO_LLEVAS', '5g 50s 00c', '20g 00s 00c'), 'lo gastado se ve');
  // 0 de tope vuelve a «sin tope».
  escribir(m, 'tope', '0');
  assert.equal(ajuste(m, 'comercioTope'), 0);
  assert.equal(m.lua(`${G}.llevas:GetText()`), texto(m, 'COMERCIO_GASTO_LLEVAS_SIN_TOPE', '5g 50s 00c'));
  sinErrores(m);
});

test('el tope puesto en la ventana frena la compra que lo pasa; un valor guardado roto se enseña recortado', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioAvisoOro", -3)');
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  assert.equal(m.lua(`${G}.aviso:GetText()`), '0', 'un aviso guardado negativo sale como 0');
  escribir(m, 'tope', '5');
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'tope');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('la IA no puede tocar el tope de gasto ni el aviso de oro', () => {
  const textos = [];
  const leer = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) leer(p);
      else if (/\.(lua|mjs|js)$/.test(f)) textos.push([relative(RAIZ, p), readFileSync(p, 'utf8')]);
    }
  };
  leer(join(RAIZ, 'app', 'src'));
  leer(join(COMERCIO, 'comercio'));
  leer(join(ADDON, 'ia'));
  for (const [ruta, t] of textos) {
    if (ruta.endsWith('compra.lua')) continue; // la compra los lee
    assert.ok(!/comercioTope|comercioAvisoOro/.test(t), `${ruta} no los menciona`);
  }
});

// Ronda de arreglos 1 de la revisión final.
// Arreglo de la compra suelta: un objeto suelto pide siempre dos clics, así que el aviso de oro no cambia nada en él (antes
// armaba el botón 5 s solo si pasaba del aviso).
test('en un objeto suelto el aviso de oro no cambia nada: siempre dos clics, se cambie como se cambie', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pasar(m);
  assert.equal(estado(m).fase, 'lista');
  const antes = textoBoton(m);
  escribir(m, 'aviso', '1'); // desde la ventana
  assert.equal(estado(m).aviso, false);
  assert.equal(textoBoton(m), antes, 'el botón no cambia');
  m.lua('SnetForever.Ajustes.set("comercioAvisoOro", 1000000)'); // por otro camino
  assert.equal(estado(m).aviso, false);
  clicSolo(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'el primer clic no compra');
  pasar(m);
  clicSolo(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 1, 'compra el segundo');
  sinErrores(m);
});

test('mercancía: el aviso de «confirmar» se mira con el total real y el ajuste de ahora', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 2589: [40000, 15] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.6);
  assert.equal(estado(m).fase, 'confirmar');
  const caro = estado(m).aviso;
  m.lua(`SnetForever.Ajustes.set("comercioAvisoOro", ${caro ? 100000000 : 10000})`);
  assert.equal(estado(m).aviso, !caro, 'el aviso de la barra sigue al ajuste');
  sinErrores(m);
});

test('salir de una caja del gasto sin cambiar nada no redondea lo guardado', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioTope", 15000)'); // 1,5 de oro
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  assert.equal(m.lua(`${G}.tope:GetText()`), '1');
  m.lua(`local c = ${G}.tope; c:SetFocus(); c:ClearFocus()`);
  assert.equal(ajuste(m, 'comercioTope'), 15000, 'salir sin escribir no lo cambia');
  escribir(m, 'tope', '1');
  assert.equal(ajuste(m, 'comercioTope'), 15000, 'Intro con el mismo número tampoco');
  escribir(m, 'tope', '2');
  assert.equal(ajuste(m, 'comercioTope'), 20000, 'un número distinto sí');
  sinErrores(m);
});

test('una mercancía por confirmar caduca al minuto: se cancela, «error» sin_confirmar y nada se compra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 2589: [40000, 15] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  const cancelaciones = llamadas(m, 'CancelCommoditiesPurchase').length;
  m.avanzar(58);
  assert.equal(estado(m).fase, 'confirmar', 'antes del minuto sigue esperando el clic');
  m.avanzar(3);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'sin_confirmar');
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, cancelaciones + 1);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  assert.ok(barra(m).includes(texto(m, 'COMERCIO_MOTIVO_SIN_CONFIRMAR')), barra(m));
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 0);
  sinErrores(m);
});

test('cuando vence una compra fallida y se quita su gasto, «Llevas X» se repinta', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioTope", 200000)');
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  m.lua('BANCO.ponerSubasta({foto = true})'); // el cliente aún la ve (la foto de su búsqueda)
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  m.lua('BANCO.subasta.objetos[4338] = {}'); // desaparece en el servidor antes del clic: error rojo del servidor
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).motivo, 'ya_no_esta');
  assert.equal(m.lua(`${G}.llevas:GetText()`), texto(m, 'COMERCIO_GASTO_LLEVAS', '5g 50s 00c', '20g 00s 00c'));
  m.avanzar(16);
  assert.equal(m.lua('SnetForever.Compra.gastado()'), 0);
  assert.equal(m.lua(`${G}.llevas:GetText()`), texto(m, 'COMERCIO_GASTO_LLEVAS', '0c', '20g 00s 00c'));
  sinErrores(m);
});

test('textos de la fila del gasto: «Pedir segundo clic desde (oro):»', () => {
  const m = crearMaquina();
  assert.equal(m.lua('SnetForever.L.tablas.es.COMERCIO_GASTO_AVISO'), 'Pedir segundo clic desde (oro):');
  assert.equal(m.lua('SnetForever.L.tablas.en.COMERCIO_GASTO_AVISO'), 'Ask for a second click from (gold):');
  assert.ok(m.lua('SnetForever.L.tablas.es.COMERCIO_MOTIVO_SIN_CONFIRMAR'));
  assert.ok(m.lua('SnetForever.L.tablas.en.COMERCIO_MOTIVO_SIN_CONFIRMAR'));
});

// Ventana de compra, tarea 6: la barra de abajo (progreso, Comprar y Descartar de 107 px, engranaje), el gasto dentro del
// engranaje y el ajuste comercioSiguienteSola.
const progreso = (m) => m.lua(`${V}.pie.progreso.texto:GetText()`) || '';
const cerca = (a, b) => b.slice(0, 3).every((x, i) => Math.abs(a[i] - x) < 0.01);
const colorComercio = (m, token) => m.lua(`SnetForever.Estilo.comercio("${token}")`);
const fondoDe = (m, ruta) => m.lua(`{${ruta}.fondo:GetVertexColor()}`);
// Contraste de la norma WCAG entre dos colores {r, g, b}.
const luz = (c) => {
  const [r, g, b] = c.slice(0, 3).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => (Math.max(luz(a), luz(b)) + 0.05) / (Math.min(luz(a), luz(b)) + 0.05);

test('la barra dice el estado: escaneando, escaneo completo, buscando, lista para comprar N por X y confirmando', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  m.lua('SnetForever.Escaneo.estado = function() return "escaneando" end');
  escanear(m, { 2589: [40000, 15] });
  assert.equal(progreso(m), texto(m, 'COMERCIO_BARRA_ESCANEANDO', 1));
  assert.match(progreso(m), /Escaneando… 1 objetos/);
  m.lua('SnetForever.Escaneo.estado = function() return "completo" end');
  escanear(m, { 2589: [40000, 15] });
  assert.equal(progreso(m), texto(m, 'COMERCIO_BARRA_COMPLETO', 1));
  assert.match(progreso(m), /Escaneo completo: 1 objetos/);
  pulsarFila(m, 2589);
  assert.equal(estado(m).fase, 'buscando');
  assert.equal(progreso(m), texto(m, 'COMERCIO_BARRA_BUSCANDO'));
  assert.equal(progreso(m), 'Buscando la subasta elegida…');
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(progreso(m), texto(m, 'COMERCIO_BARRA_LISTA', 1, '4g 00s 00c'));
  assert.equal(progreso(m), 'Lista para comprar: 1 por 4g 00s 00c');
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  assert.equal(progreso(m), texto(m, 'COMERCIO_BARRA_CONFIRMANDO'));
  assert.equal(progreso(m), 'Confirmando…');
  sinErrores(m);
});

test('Comprar y Descartar miden 107 px; Comprar lleva el color de acento cuando se puede pulsar y gris cuando no', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  assert.equal(m.lua(`${V}.pie:GetHeight()`), 28, 'la barra mide 28');
  assert.equal(m.lua(`${boton(m)}:GetWidth()`), 107);
  assert.equal(m.lua(`${V}.pie.descartar:GetWidth()`), 107);
  const acento = colorComercio(m, 'acento');
  const gris = colorComercio(m, 'cabecera');
  // Sin nada elegido: los dos apagados y grises.
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), false);
  assert.ok(cerca(fondoDe(m, boton(m)), gris), 'Comprar apagado, gris');
  assert.ok(cerca(fondoDe(m, `${V}.pie.descartar`), gris), 'Descartar, gris');
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(m.lua(`${boton(m)}:IsEnabled()`), true);
  assert.ok(cerca(fondoDe(m, boton(m)), acento), 'Comprar, con el color de acento');
  assert.ok(cerca(m.lua(`{${boton(m)}.texto:GetTextColor()}`), colorComercio(m, 'acentoTexto')), 'letra del acento');
  assert.equal(m.lua(`${V}.pie.descartar:IsEnabled()`), true);
  assert.ok(cerca(fondoDe(m, `${V}.pie.descartar`), gris), 'Descartar sigue gris');
  // La letra se lee sobre el acento (norma WCAG: 4,5 o más) y la de Comprar apagado sobre el gris.
  assert.ok(contraste(colorComercio(m, 'acentoTexto'), acento) >= 4.5, 'contraste de acentoTexto sobre acento');
  assert.ok(contraste(colorComercio(m, 'secundario'), gris) >= 4.5, 'contraste de la letra apagada sobre el gris');
  // Descartar vuelve a dejarlo gris.
  m.lua(`${V}.pie.descartar:Click()`);
  assert.ok(cerca(fondoDe(m, boton(m)), gris), 'sin compra, Comprar vuelve a gris');
  sinErrores(m);
});

test('el tope y el aviso viven en el engranaje y siguen guardando como antes', () => {
  const m = maquina();
  abrir(m);
  const pie = `${V}.pie`;
  assert.equal(m.lua(`${V}.gasto`), undefined, 'ya no hay fila del gasto sobre la barra');
  assert.equal(m.lua(`${pie}.engranaje:GetObjectType()`), 'Button');
  assert.equal(m.lua(`${G}:IsShown()`), false, 'la ventanita empieza cerrada');
  m.lua(`${pie}.engranaje:Click()`);
  assert.equal(m.lua(`${G}:IsShown()`), true, 'el engranaje la abre');
  assert.equal(m.lua(`${G}.tope:GetParent():GetParent() == ${G}`), true, 'las cajas están dentro de ella');
  assert.equal(m.lua(`${G}.aviso:GetParent():GetParent() == ${G}`), true);
  assert.equal(m.lua(`${G}.siguiente:GetParent() == ${G}`), true);
  assert.equal(m.lua(`${G}.titulo:GetText()`), texto(m, 'COMERCIO_AJUSTES'));
  assert.equal(m.lua(`${G}.siguiente.texto:GetText()`), texto(m, 'COMERCIO_SIGUIENTE_SOLA'));
  m.lua(`${pie}.engranaje:Click()`);
  assert.equal(m.lua(`${G}:IsShown()`), false, 'otro clic la cierra');
  // «Llevas X de Y» se queda en la barra, en pequeño.
  assert.equal(m.lua(`${pie}.llevas:GetParent() == ${pie}`), true);
  assert.equal(m.lua(`${pie}.llevas:IsShown()`), true);
  assert.equal(m.lua(`${pie}.llevas:GetText()`), texto(m, 'COMERCIO_GASTO_LLEVAS_SIN_TOPE', '0c'));
  assert.equal(m.lua(`${G}.llevas == ${pie}.llevas`), true);
  escribir(m, 'tope', '5');
  assert.equal(ajuste(m, 'comercioTope'), 50000);
  assert.equal(m.lua(`${pie}.llevas:GetText()`), texto(m, 'COMERCIO_GASTO_LLEVAS', '0c', '5g 00s 00c'));
  // Cerrar la ventanita con una caja a medio escribir guarda (salir de la caja guarda).
  m.lua(`${pie}.engranaje:Click()`);
  m.lua(`local c = ${G}.aviso; c:SetFocus(); c:SetText("4")`);
  m.lua(`${pie}.engranaje:Click()`);
  assert.equal(ajuste(m, 'comercioAvisoOro'), 40000);
  sinErrores(m);
});

test('la casilla del engranaje cambia comercioSiguienteSola', () => {
  const m = maquina();
  abrir(m);
  m.lua(`${V}.pie.engranaje:Click()`);
  assert.equal(m.lua(`${G}.siguiente.marca:IsShown()`), true, 'por defecto, marcada');
  m.lua(`${G}.siguiente:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSiguienteSola")'), false);
  assert.equal(m.lua(`${G}.siguiente.marca:IsShown()`), false);
  m.lua(`${G}.siguiente:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSiguienteSola")'), true);
  sinErrores(m);
});

test('comercioSiguienteSola = false: tras comprar no se elige otra fila', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioSiguienteSola", false)');
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 4306: [60000, 1], 2592: [200000, 4] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.05);
  m.avanzar(0.05);
  const e = estado(m);
  assert.equal(e.fase, 'hecho', 'se queda en «hecho»');
  assert.equal(e.item, 4338, 'sigue siendo lo comprado: no hay otra fila elegida');
  assert.equal(llamadas(m, 'SendSearchQuery').length, 1, 'no busca otra subasta');
  assert.equal(llamadas(m, 'PlaceBid').length, 1);
  m.avanzar(30);
  assert.equal(compras(m), 1);
  sinErrores(m);
});

test('comercioSiguienteSola: por defecto sí', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSiguienteSola")'), true);
  assert.equal(m.lua('SnetForever.Ajustes.DEFECTO.comercioSiguienteSola'), true);
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2], 4306: [60000, 1], 2592: [200000, 4] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.1);
  assert.equal(estado(m).item, 4306, 'sin tocar el ajuste se elige la siguiente buena');
  sinErrores(m);
});

// Ronda de arreglos 1: el texto de Comprar cabe en el botón de 107 px, aun con un importe de 4 cifras de oro, en es y en
// (el banco solo aproxima el ancho de la letra: margen de 0,85, como en la prueba de «Visto»).
test('el texto de Comprar cabe en 107 px con un importe grande, en es y en', () => {
  const m = maquina();
  abrir(m);
  const t = `${boton(m)}.texto`;
  assert.equal(m.lua(`${t}:GetWidth()`), 99, 'el texto no es más ancho que el botón menos el margen');
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    for (const c of ['COMERCIO_COMPRAR', 'COMERCIO_COMPRAR_ORO', 'COMERCIO_CONFIRMAR', 'COMERCIO_BOTON_BUSCANDO', 'COMERCIO_BOTON_COMPRANDO']) {
      // B6r, punto 11: el importe va con g, s y c («1234g 00s 00c»); el botón lo pinta con etiquetaConImporte, que lo
      // redondea hacia abajo si no cabe entero (como hace pintarBarra; B2r, punto 2: antes hacia arriba).
      m.lua(`${t}:SetText(SnetForever.UIComercio.etiquetaConImporte(12340000, ${t}, 99, function(x) return SnetForever.L.t("${c}", x) end))`);
      const w = m.lua(`${t}:GetUnboundedStringWidth()`);
      // Redondeado con «~», basta con que quepa en el botón (como en comercio-repaso.test.js).
      assert.ok(w <= 99, `${idioma} ${c}: ${w} px en 99 px`);
    }
  }
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B6r, ronda 2: el precio de la fila es el tope de CADA unidad también en la lista vieja y en el sniper.
// ---------------------------------------------------------------------------------------------------

// La fila es la de 4,5 de oro y se piden 15: 10 a 3 y 5 a 4,5. Si se venden 5 de las de 3, el servidor rellena con 5 de 4,8:
// la media (4,1) no pasa de 4,5, pero 5 unidades sí. La comprobación vieja (total ≤ 4,5 × 15) no lo veía.
const LINO_TOPE = '[2589] = {{quantity = 10, unitPrice = 30000}, {quantity = 5, unitPrice = 45000}, {quantity = 50, unitPrice = 48000}}';

test('B6r ronda 2: lista vieja: si se venden las baratas, no se ofrece nada: «Ya no hay N a ese precio: quedan M»', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO_TOPE}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(ponerCantidad(m, 15), true); // 10 a 3 de oro y 5 a 4,5: todas a 4,5 o menos
  m.avanzar(0.6);
  // Se venden 5 de las de 3 de oro: el servidor rellenaría con 5 de 4,8 y la media (4,1) no pasa de la fila.
  m.lua('BANCO.subasta.mercancias[2589][1].quantity = 5');
  pulsarComprar(m);
  m.avanzar(0.05);
  const e = estado(m);
  assert.deepEqual([e.fase, e.cantidad, e.pedidas, e.quedan], ['lista', 10, 15, 10], 'vuelve con las 10 que caben');
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 10);
  assert.equal(barra(m), texto(m, 'COMERCIO_BARRA_QUEDAN', '15', '10'), 'la barra lo dice');
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'nada confirmado');
  assert.ok(llamadas(m, 'CancelCommoditiesPurchase').length >= 1);
  sinErrores(m);
});

test('B6r ronda 2: lista vieja con la lista del cliente congelada: la cotización más cara da «cambió de precio», ni con dos clics', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({foto = true, mercancias = {${LINO_TOPE}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  m.lua('BANCO.subasta.mercancias[2589][1].quantity = 5'); // solo en el servidor: la foto aún las tiene
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.deepEqual([estado(m).fase, estado(m).motivo], ['error', 'cambio_precio']);
  m.avanzar(0.6);
  pulsarComprar(m);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase'), [[2589, 15]], 'no se vuelve a pedir');
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'nada confirmado');
  sinErrores(m);
});

test('B6r ronda 2: sniper: la misma regla, ninguna unidad más cara que la fila', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({foto = true, mercancias = {${LINO_TOPE}}})`);
  abrir(m);
  // Un hallazgo del sniper: 15 a 4,5 de oro (la fila que ve el jugador).
  assert.equal(m.lua('SnetForever.Compra.elegir({item = 2589, precio = 45000, cantidad = 15, origen = "sniper", grupo = false})'), true);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  m.lua('BANCO.subasta.mercancias[2589][1].quantity = 5');
  pulsarComprar(m);
  m.avanzar(0.05);
  assert.deepEqual([estado(m).fase, estado(m).motivo], ['error', 'cambio_precio']);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Revisión B7, menores 1, 3 y 4.
// ---------------------------------------------------------------------------------------------------

// Menor 1: una cotización que no es de la cantidad pedida (un aviso de precio suelto, de 1 unidad) se tira: el botón nunca
// enseña «Confirmar 15 por 4g». Solo vale la que cuadra con unidad × cantidad (con 1c de redondeo por unidad).
test('B7: una cotización que no cuadra con la cantidad pedida se tira; la de verdad sí se enseña', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  elegirMercancia(m, 2589);
  assert.equal(ponerCantidad(m, 15), true);
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase').map((a) => a[1]), [15]);
  // Antes de que responda el juego llega una cotización suelta de 1 unidad.
  m.disparar('COMMODITY_PRICE_UPDATED', 40000, 40000);
  let e = estado(m);
  assert.equal(e.fase, 'comprando', 'la suelta no se toma por la de 15');
  assert.equal(e.esperando, 'precio');
  assert.ok(!/Confirmar/.test(textoBoton(m)), `el botón no ofrece confirmar: ${textoBoton(m)}`);
  // Otra que no cuadra por más de 1c por unidad, tampoco.
  m.disparar('COMMODITY_PRICE_UPDATED', 43334, 650000 + 100);
  assert.equal(estado(m).fase, 'comprando');
  // La de verdad (5 × 4g + 10 × 4,5g, 43334 por unidad redondeado), sí.
  m.avanzar(0.05);
  e = estado(m);
  assert.equal(e.fase, 'confirmar');
  assert.equal(e.total, 650000);
  assert.equal(e.cantidad, 15);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});

// Menor 3: la respuesta de un objeto se casa por la clave entera (nivel, sufijo…), no solo por el itemID: otra variante del
// mismo objeto con el mismo precio no se toma por la pedida, ni al buscar ni con la compra lista.
const VARIANTE = `(function()
  local A = C_AuctionHouse
  local num, info, entera = A.GetNumItemSearchResults, A.GetItemSearchResultInfo, A.HasFullItemSearchResults
  local function otra(k) return type(k) == "table" and k.itemID == 4338 and k.itemLevel == 61 end
  A.GetNumItemSearchResults = function(k, ...) if otra(k) then return 1 end return num(k, ...) end
  A.GetItemSearchResultInfo = function(k, i, ...)
    if otra(k) then
      return {itemKey = k, auctionID = 999, quantity = 1, buyoutAmount = 55000, owners = {}, containsOwnerItem = false}
    end
    return info(k, i, ...)
  end
  A.HasFullItemSearchResults = function(k, ...) if otra(k) then return true end return entera(k, ...) end
end)()`;
const CLAVE_61 = '{itemID = 4338, itemLevel = 61, itemSuffix = 0, battlePetSpeciesID = 0}';

test('B7: la respuesta de otra variante del mismo objeto (otro nivel, mismo precio) no se toma por la pedida', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  m.lua(VARIANTE);
  // Lista vieja o sniper: casa por precio. Se pide la de nivel 60.
  assert.equal(m.lua('SnetForever.Compra.elegir({item = 4338, precio = 55000, cantidad = 1, itemKey = {itemID = 4338, itemLevel = 60, itemSuffix = 0, battlePetSpeciesID = 0}})'), true);
  m.disparar('ITEM_SEARCH_RESULTS_UPDATED', { itemID: 4338, itemLevel: 61, itemSuffix: 0, battlePetSpeciesID: 0 });
  assert.equal(estado(m).fase, 'buscando', 'la de nivel 61 no es la pedida');
  m.avanzar(0.05);
  let e = estado(m);
  assert.equal(e.fase, 'lista', 'llega la de nivel 60');
  // Con la compra lista (exacta, desde resultados, por su auctionID), una lista de la otra variante no la suelta.
  m.lua('SnetForever.Compra.cancelar()');
  assert.equal(m.lua('SnetForever.Compra.elegir({item = 4338, precio = 55000, cantidad = 1, exacta = true, auctionID = 4338002, total = 55000, origen = "resultados", itemKey = {itemID = 4338, itemLevel = 60, itemSuffix = 0, battlePetSpeciesID = 0}})'), true);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'lista');
  m.disparar('ITEM_SEARCH_RESULTS_UPDATED', { itemID: 4338, itemLevel: 61, itemSuffix: 0, battlePetSpeciesID: 0 });
  e = estado(m);
  assert.equal(e.fase, 'lista', `la lista de la otra variante no dice «ya no está» (${e.motivo})`);
  m.avanzar(0.6);
  pulsarComprar(m);
  const pujas = llamadas(m, 'PlaceBid');
  assert.equal(pujas.length, 1);
  assert.equal(pujas[0][0], 4338002, 'la subasta de la fila, nunca la 999 de la otra variante');
  sinErrores(m);
});

// Menor 4: sin precio de fila no hay compra (sería sin tope por unidad): Compra.elegir da false y no busca nada.
test('B7: Compra.elegir sin precio de fila da false y no busca nada', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}, objetos = {${MAGICO}}})`);
  abrir(m);
  m.avanzar(0.05);
  const antes = llamadas(m, 'SendSearchQuery').length;
  for (const llamada of ['2589', '4338', '{item = 2589}', '{item = 4338, cantidad = 1}', '{item = 2589, precio = 0}', '{item = 2589, precio = "x"}']) {
    assert.equal(m.lua(`SnetForever.Compra.elegir(${llamada})`), false, llamada);
  }
  assert.equal(estado(m), undefined, 'nada elegido');
  assert.equal(llamadas(m, 'SendSearchQuery').length, antes, 'no se ha buscado nada');
  // Con el precio del escaneo en vivo (la fila de la lista vieja), sí.
  m.lua('SnetForever.Escaneo._datos = {[2589] = {precio = 45000, cantidad = 15, hora = GetServerTime() - 60}}');
  assert.equal(m.lua('SnetForever.Compra.elegir(2589)'), true);
  sinErrores(m);
});

// B2r ronda 1, Importante 1: el texto del botón tiene un ancho fijo y no parte la línea, y en el cliente GetStringWidth de un
// texto así da como mucho ese ancho (el texto se corta con «...»). Si se midiera con él, un importe que no cabe parecería
// que cabe y saldría «Confirmar 1234g 5...». Se mide con GetUnboundedStringWidth (el banco recorta como el cliente).
test('el botón de 99 px con un importe que no cabe sale redondeado hacia abajo con «~», sin cortar', () => {
  const m = maquina();
  abrir(m);
  const t = `${boton(m)}.texto`;
  assert.equal(m.lua(`${t}:GetWordWrap()`), false, 'el texto del botón no parte la línea');
  m.lua(`${t}:SetText("Confirmar 1234g 56s 78c")`);
  assert.equal(m.lua(`${t}:GetStringWidth()`), 99, 'el banco recorta como el cliente: como mucho su ancho');
  assert.ok(m.lua(`${t}:GetUnboundedStringWidth()`) > 99, 'y GetUnboundedStringWidth da el texto entero');
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    const etiqueta = m.lua(`SnetForever.UIComercio.etiquetaConImporte(12345678, ${t}, 99, function(x) return SnetForever.L.t("COMERCIO_CONFIRMAR", x) end)`);
    assert.equal(etiqueta, m.lua('SnetForever.L.t("COMERCIO_CONFIRMAR", "~1234g")'), `${idioma}: hacia abajo con «~»`);
    m.lua(`${t}:SetText(${JSON.stringify(etiqueta)})`);
    assert.ok(m.lua(`${t}:GetUnboundedStringWidth()`) <= 99, `${idioma}: y entero, sin cortar`);
  }
  sinErrores(m);
});

// Arreglo de la compra suelta (2026-11-19): en WoW Forever una fila de objeto suelto agrupa `quantity` subastas iguales de 1
// unidad, y buyoutAmount es lo que cuesta UNA. Se leía quantity como la cantidad de la subasta y se dividía el precio entre
// ella: la fila enseñaba 5s 97c (39989 / 67) y se pagaron 3g 99s 89c por 1 bolsa. La red de Comprar comparaba números que
// salían del mismo dato falso y no saltó. Ahora, antes de comprar, se lee lo que de verdad se va a pagar por esa subasta (por
// su auctionID, en lo último que dio el juego) y no se compra si pasa del total del botón o del tope por unidad × 1.
// Datos inventados.

test('un objeto suelto con la cantidad mal leída no se compra si lo que se paga supera lo que enseña la fila', () => {
  const m = maquina();
  abrir(m);
  m.lua('BANCO.ponerSubasta({objetos = {[4338] = {{quantity = 67, buyoutAmount = 39989, auctionID = 777}}}})');
  // La fila como la enseñaba el fallo: 67 a 5s 97c (39989 / 67), con su auctionID y su total.
  assert.equal(m.lua('SnetForever.Compra.elegir({item = 4338, precio = 597, cantidad = 67, exacta = true, auctionID = 777, total = 39989})'), true);
  m.avanzar(0.5);
  pasar(m);
  for (let k = 0; k < 3; k++) { pulsarComprar(m); pasar(m); }
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'no se paga 3g 99s 89c por lo que la fila enseña a 5s 97c');
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).motivo, 'cambio_precio');
  // Una fila de 1 con el precio por unidad mal y el total de verdad tampoco se compra: 39989 > 597 × 1.
  assert.equal(m.lua('SnetForever.Compra.elegir({item = 4338, precio = 597, cantidad = 1, exacta = true, auctionID = 777, total = 39989})'), true);
  m.avanzar(0.5);
  pasar(m);
  for (let k = 0; k < 3; k++) { pulsarComprar(m); pasar(m); }
  assert.equal(llamadas(m, 'PlaceBid').length, 0);
  assert.equal(estado(m).motivo, 'cambio_precio');
  sinErrores(m);
});

test('la red compara lo que de verdad se manda al juego con el total del botón', () => {
  const m = maquina();
  abrir(m);
  m.lua('BANCO.ponerSubasta({objetos = {[4338] = {{quantity = 1, buyoutAmount = 55000, auctionID = 778}}}})');
  const elegir = () => {
    assert.equal(m.lua('SnetForever.Compra.elegir({item = 4338, precio = 55000, cantidad = 1, exacta = true, auctionID = 778, total = 55000})'), true);
    m.avanzar(0.5);
    pasar(m);
    assert.equal(estado(m).fase, 'lista');
    assert.equal(estado(m).total, 55000);
  };
  elegir();
  clicSolo(m); // el primer clic no compra: pide confirmar
  pasar(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'el primer clic no compra');
  assert.equal(estado(m).fase, 'confirmar');
  // En lo último que dio el juego, esa subasta cuesta ahora más que el total del botón: no se compra.
  m.lua('BANCO.subasta.objetos[4338][1].buyoutAmount = 60000');
  clicSolo(m);
  pasar(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'se pagaría más que el total del botón');
  assert.equal(estado(m).motivo, 'cambio_precio');
  // Sin cambios, se manda al juego lo que de verdad cuesta esa subasta, que es el total del botón.
  m.lua('BANCO.subasta.objetos[4338][1].buyoutAmount = 55000');
  elegir();
  clicSolo(m);
  pasar(m);
  assert.equal(llamadas(m, 'PlaceBid').length, 0);
  clicSolo(m);
  assert.deepEqual(llamadas(m, 'PlaceBid'), [[778, 55000]]);
  sinErrores(m);
});
