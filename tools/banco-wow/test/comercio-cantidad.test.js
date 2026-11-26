// Comercio, ventana de compra, tarea 5: el cuadro de cantidad (ui/comercio_cantidad.lua). La máquina y los ayudantes vienen de
// comercio-compra.test.js. Antes, tarea 13: comprar con un clic (comercio/compra.lua).
// Pulsar una fila busca esa subasta en el servidor y deja la compra «lista» enseñando qué, cuántas y cuánto; un clic en
// Comprar compra (objeto: PlaceBid) o pide el precio real (mercancía: StartCommoditiesPurchase → COMMODITY_PRICE_UPDATED →
// «confirmar» → otro clic: ConfirmCommoditiesPurchase). Nunca compra solo: las funciones de compra solo se llaman desde el
// OnClick del botón Comprar (el banco las hace fallar fuera de un clic). El escaneo en vivo (Task 10) aún no existe: se
// imita con su interfaz prevista, como en comercio-ventana.test.js.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
// 0.7.0: todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo
// (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { sinErrores, testConComercio as test } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ADDON = join(RAIZ, 'addons', 'SnetForever');

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
// pruebas sigan con sus precios, las listas de Navegar imitadas dicen lo mismo que el escaneo falso.
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
const pulsarComprar = (m) => m.lua(`${boton(m)}:Click()`);
const COMPRAS = ['PlaceBid', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase'];
const compras = (m) => COMPRAS.reduce((n, api) => n + llamadas(m, api).length, 0);

// Dos subastas del tejido mágico (objeto, no mercancía): la más barata es la segunda (55000).
const MAGICO = '[4338] = {{quantity = 1, buyoutAmount = 60000}, {quantity = 1, buyoutAmount = 55000}}';
// Lino (mercancía): 5 a 4 de oro, 10 a 4,5 y 50 a 20 (esas ya no son buena compra).
const LINO = '[2589] = {{quantity = 5, unitPrice = 40000}, {quantity = 10, unitPrice = 45000}, {quantity = 50, unitPrice = 200000}}';

const ponerCantidad = (m, n) => m.lua(`SnetForever.Compra.ponerCantidad(${aLua(n)})`);
const maxCantidad = (m) => m.lua('SnetForever.Compra.maxCantidad()');
const C = 'SnetForever.CantidadComercio';
const M = `${C}.marco()`;
const abierto = (m) => m.lua(`${C}.abierto()`);
const dinero = (m, cobre) => m.lua(`SnetForever.UIComercio.dinero(${cobre})`);
const textoDe = (m, ruta) => m.lua(`${ruta}:GetText()`);
// B2r, punto 5: «Precio de la unidad: X (N%)», con el % frente al valor de mercado en el color de su tramo (como la columna %
// de resultados). Lo normal de la app es 10 de oro para todos (ponerRanura).
const pctTexto = (m, n, token) => `|cff${m.lua(`SnetForever.Tema.hex(${aLua(token)})`)}${texto(m, 'COMERCIO_PCT', String(n))}|r`;
const unidadCon = (m, cobre, pct, token) => texto(m, 'COMERCIO_CANT_UNIDAD_PCT', dinero(m, cobre), pctTexto(m, pct, token));
// B6r, punto 11: el dinero va con g, s y c como Tema.dinero («20g 00s 00c»); el botón lo pinta con etiquetaConImporte, que
// lo redondea hacia abajo con «~» si no cabe entero (B2r, punto 2). Lo que debe decir el botón (se lee antes: medir cambia su texto).
const etiquetaBoton = (m, clave, n, cobre) => m.lua(`(function()
  local t = ${M}.comprar.texto
  local antes = t:GetText()
  local r = SnetForever.UIComercio.etiquetaConImporte(${cobre}, t, ${M}.comprar:GetWidth(), function(x) return SnetForever.L.t("${clave}", ${n}, x) end)
  t:SetText(antes)
  return r
end)()`);
// Solo r, g y b: el alfa baja medio segundo mientras el botón no acepta clics.
const colorDe = (m, ruta) => m.lua(`{${ruta}:GetVertexColor()}`).slice(0, 3);
const ROJO = (m) => m.lua('SnetForever.Estilo.comercio("rojo")').slice(0, 3);
// Escribe en la caja de cantidad como el jugador (y pulsa Intro).
function escribir(m, valor, como = 'OnEnterPressed') {
  m.lua(`local c = ${M}.caja; c:SetFocus(); c:SetText(${aLua(valor)}); c:GetScript("${como}")(c)`);
}
// Elige el lino, deja que responda la búsqueda y pulsa Comprar de la barra: abre el cuadro.
function conCuadro(m) {
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  pulsarComprar(m);
}

// Bloque B, Task B2, ronda 1: la barra de compra solo sale en las páginas que compran; el cuadro de cantidad tampoco se
// queda abierto en otra página.
test('al cambiar de página el cuadro de cantidad se cierra', () => {
  for (const destino of ['navegar', 'subasta', 'misSubastas', 'sniper']) {
    const m = maquina();
    m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
    conCuadro(m); // al abrir la subasta se está en Navegar
    m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
    assert.equal(abierto(m), true, 'abierto en la lista');
    m.lua(`SnetForever.UIComercio.elegirPestana(${aLua(destino)})`);
    assert.equal(abierto(m), false, `${destino}: cerrado`);
    assert.equal(compras(m), 0);
    sinErrores(m);
  }
});

test('Comprar de la barra con una mercancía abre el cuadro y no compra nada', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  assert.equal(abierto(m), false, 'elegir la fila no abre el cuadro');
  pulsarComprar(m);
  assert.equal(abierto(m), true);
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 0, 'no pide el precio');
  assert.equal(compras(m), 0);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(m.lua(`${M}.velo:IsShown()`), true, 'el velo tapa la ventana');
  assert.equal(textoDe(m, `${M}.titulo`), texto(m, 'COMERCIO_CANT_TITULO'));
  assert.equal(textoDe(m, `${M}.nombre`), 'Paño de lino');
  // B2r, punto 5: cada dato con su rótulo, como el cuadro de TSM.
  assert.equal(textoDe(m, `${M}.etiquetaCantidad`), texto(m, 'COMERCIO_CANT_CANTIDAD'));
  assert.equal(textoDe(m, `${M}.etiquetaUnidad`), texto(m, 'COMERCIO_CANT_PRECIO_UNIDAD'));
  assert.equal(textoDe(m, `${M}.unidad`), unidadCon(m, 40000, 40, 'azul'));
  assert.equal(textoDe(m, `${M}.etiquetaTotal`), texto(m, 'COMERCIO_CANT_PRECIO_TOTAL'));
  assert.equal(textoDe(m, `${M}.total`), dinero(m, 40000));
  assert.equal(textoDe(m, `${M}.caja`), '1', 'una mercancía empieza en 1');
  m.avanzar(30);
  assert.equal(compras(m), 0, 'tampoco con el tiempo');
  sinErrores(m);
});

test('1/5/20/Máx. ponen esa cantidad (Máx. = maxCantidad) y el botón dice «Comprar N por X»', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  const rapido = (k) => m.lua(`${M}.rapidos[${typeof k === 'string' ? aLua(k) : k}]:Click()`);
  assert.equal(textoDe(m, `${M}.rapidos[1].texto`), '1');
  assert.equal(textoDe(m, `${M}.rapidos[5].texto`), '5');
  assert.equal(textoDe(m, `${M}.rapidos[20].texto`), '20');
  assert.equal(textoDe(m, `${M}.rapidos.max.texto`), texto(m, 'COMERCIO_CANT_MAX'));
  rapido(5);
  assert.equal(estado(m).cantidad, 5);
  assert.equal(textoDe(m, `${M}.caja`), '5');
  assert.equal(textoDe(m, `${M}.comprar.texto`), etiquetaBoton(m, 'COMERCIO_CANT_COMPRAR', 5, 5 * 40000));
  assert.equal(textoDe(m, `${M}.total`), dinero(m, 200000));
  rapido('max');
  assert.equal(maxCantidad(m), 15);
  assert.equal(estado(m).cantidad, 15);
  assert.equal(textoDe(m, `${M}.caja`), '15');
  assert.equal(textoDe(m, `${M}.comprar.texto`), etiquetaBoton(m, 'COMERCIO_CANT_COMPRAR', 15, 650000));
  assert.equal(textoDe(m, `${M}.unidad`), unidadCon(m, Math.ceil(650000 / 15), 43, 'verde'));
  rapido(20); // más de lo que deja la regla: se recorta al máximo
  assert.equal(estado(m).cantidad, 15);
  rapido(1);
  assert.equal(estado(m).cantidad, 1);
  assert.equal(textoDe(m, `${M}.caja`), '1');
  assert.equal(compras(m), 0, 'ningún botón rápido compra');
  sinErrores(m);
});

test('pulsar un escalón pone la cantidad acumulada hasta él', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  assert.equal(m.lua(`${M}.escalones.huecos[1]:IsShown()`), true);
  assert.equal(textoDe(m, `${M}.escalones.huecos[1].celdas.precio`), dinero(m, 40000));
  assert.equal(textoDe(m, `${M}.escalones.huecos[1].celdas.n`), '5');
  assert.equal(textoDe(m, `${M}.escalones.huecos[2].celdas.precio`), dinero(m, 45000));
  m.lua(`${M}.escalones.huecos[2]:Click()`);
  assert.equal(estado(m).cantidad, 15, '5 + 10');
  assert.equal(textoDe(m, `${M}.caja`), '15');
  m.lua(`${M}.escalones.huecos[1]:Click()`);
  assert.equal(estado(m).cantidad, 5);
  assert.equal(textoDe(m, `${M}.caja`), '5');
  m.lua(`${M}.escalones.huecos[3]:Click()`); // por encima del precio límite: se recorta al máximo
  assert.equal(estado(m).cantidad, 15);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('escribir 0, nada, letras o más del máximo: la caja vuelve al último valor bueno o se recorta al máximo', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  escribir(m, '7');
  assert.equal(estado(m).cantidad, 7);
  assert.equal(textoDe(m, `${M}.caja`), '7');
  for (const malo of ['0', '', 'abc', '-3', '2.5', '1e3', ' ']) {
    escribir(m, malo);
    assert.equal(estado(m).cantidad, 7, `«${malo}» no cambia la cantidad`);
    assert.equal(textoDe(m, `${M}.caja`), '7', `«${malo}» vuelve a 7`);
  }
  escribir(m, '999');
  assert.equal(estado(m).cantidad, 15, 'recortada al máximo');
  assert.equal(textoDe(m, `${M}.caja`), '15');
  escribir(m, '3', 'OnEditFocusLost');
  assert.equal(estado(m).cantidad, 3, 'salir de la caja también vale');
  assert.equal(compras(m), 0);
  assert.equal(abierto(m), true, 'escribir no cierra el cuadro');
  sinErrores(m);
});

test('con texto sin aplicar en la caja, pulsar un rápido o un escalón deja la cantidad real y un Intro después no la cambia', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  const sinAplicar = (valor) => m.lua(`local c = ${M}.caja; c:SetFocus(); c:SetText(${aLua(valor)})`);
  const intro = () => m.lua(`local c = ${M}.caja; c:GetScript("OnEnterPressed")(c)`);
  sinAplicar('3');
  m.lua(`${M}.rapidos.max:Click()`);
  assert.equal(estado(m).cantidad, 15);
  assert.equal(textoDe(m, `${M}.caja`), '15', 'la caja enseña la cantidad real');
  assert.equal(m.lua(`${M}.caja:HasFocus()`), false);
  intro();
  assert.equal(estado(m).cantidad, 15, 'un Intro después no aplica el 3');
  assert.equal(textoDe(m, `${M}.caja`), '15');
  sinAplicar('3');
  m.lua(`${M}.escalones.huecos[1]:Click()`);
  assert.equal(estado(m).cantidad, 5);
  assert.equal(textoDe(m, `${M}.caja`), '5');
  intro();
  assert.equal(estado(m).cantidad, 5);
  sinAplicar('9');
  m.lua(`${M}.rapidos[1]:Click()`);
  assert.equal(textoDe(m, `${M}.caja`), '1');
  intro();
  assert.equal(estado(m).cantidad, 1);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('Comprar del cuadro pide el precio (Start) y pasa a «Confirmar N por X»; Confirmar compra; al quedar hecho se cierra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  escribir(m, '7');
  assert.equal(m.lua(`${M}.comprar:IsEnabled()`), false, 'recién cambiada la cantidad el botón espera medio segundo');
  m.lua(`${M}.comprar:Click()`);
  assert.equal(compras(m), 0, 'el clic que llega antes no cuenta');
  m.avanzar(0.6);
  assert.equal(m.lua(`${M}.comprar:IsEnabled()`), true);
  m.lua(`${M}.comprar:Click()`);
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase'), [[2589, 7]]);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  assert.equal(abierto(m), true, 'sigue abierto para confirmar');
  assert.equal(textoDe(m, `${M}.comprar.texto`), etiquetaBoton(m, 'COMERCIO_CANT_CONFIRMAR', 7, 5 * 40000 + 2 * 45000));
  m.avanzar(30);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'no confirma solo');
  m.lua(`${M}.comprar:Click()`);
  assert.deepEqual(llamadas(m, 'ConfirmCommoditiesPurchase'), [[2589, 7]]);
  m.avanzar(0.05);
  assert.equal(m.lua('BANCO.jugador.dinero'), 10000000 - (5 * 40000 + 2 * 45000), 'la compra se ha hecho');
  assert.equal(abierto(m), false, 'al quedar hecho se cierra');
  assert.equal(m.lua(`${M}.velo:IsShown()`), false);
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 0, 'cerrar tras hecho no cancela nada');
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 1);
  sinErrores(m);
});

test('si el precio del servidor sube, el botón sale en rojo y pide un segundo clic', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  escribir(m, '2'); // 8 de oro: por debajo del aviso de oro (10)
  m.avanzar(0.6);
  assert.notDeepEqual(colorDe(m, `${M}.comprar.fondo`), ROJO(m), 'normal: color de acento');
  // Sube, sin que ninguna unidad pase del precio de la fila (4,5 de oro). B6r, ronda 2: el tope es de cada unidad y se mira
  // con la lista de ahora, así que la subida tiene que estar en la lista (con un precioCompra inventado sería «cambió de
  // precio»).
  m.lua('BANCO.subasta.mercancias[2589][1].unitPrice = 44000');
  m.lua(`${M}.comprar:Click()`);
  m.avanzar(0.05);
  const e = estado(m);
  assert.equal(e.fase, 'confirmar');
  assert.equal(e.subio, true);
  assert.deepEqual(colorDe(m, `${M}.comprar.fondo`), ROJO(m), 'el precio subió: botón en rojo');
  assert.equal(textoDe(m, `${M}.comprar.texto`), etiquetaBoton(m, 'COMERCIO_CANT_CONFIRMAR', 2, 2 * 44000));
  assert.equal(textoDe(m, `${M}.total`), dinero(m, 2 * 44000), 'el total real');
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'no confirma solo');
  m.lua(`${M}.comprar:Click()`); // dentro del medio segundo en que se ve el total nuevo: no cuenta
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  m.avanzar(0.6);
  m.lua(`${M}.comprar:Click()`);
  assert.deepEqual(llamadas(m, 'ConfirmCommoditiesPurchase'), [[2589, 2]], 'el segundo clic confirma');
  m.avanzar(0.05);
  assert.equal(abierto(m), false);
  sinErrores(m);
});

// B2r, punto 5: la X de arriba a la derecha (en vez del botón Cancelar) y Escape cierran el cuadro y cancelan la compra.
test('la X y Escape cierran el cuadro y descartan la mercancía a medio confirmar', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  assert.equal(m.lua('UISpecialFrames').includes('SnetForeverCantidadComercio'), false, 'nada antes de abrir');
  conCuadro(m);
  assert.equal(m.lua('UISpecialFrames').filter((n) => n === 'SnetForeverCantidadComercio').length, 1, 'Escape lo cierra');
  assert.equal(m.lua(`${M}.cancelar`), undefined, 'sin botón Cancelar');
  assert.equal(m.lua(`${M}.cerrar:IsVisible()`), true, 'con su X');
  assert.deepEqual(m.lua(`{${M}.cerrar.icono:GetTexCoord()}`), m.lua('(function() local t = UIParent:CreateTexture(); SnetForever.Tema.icono(t, "cerrar"); return {t:GetTexCoord()} end)()'), 'el icono «cerrar» del atlas');
  // La X con la mercancía lista: se cierra y se descarta.
  m.lua(`${M}.cerrar:Click()`);
  assert.equal(abierto(m), false);
  assert.equal(estado(m), undefined, 'descartada');
  assert.equal(compras(m), 0);
  // Cancelar a medio confirmar: cancela la compra en el servidor.
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  pulsarComprar(m);
  escribir(m, '5');
  m.avanzar(0.6);
  m.lua(`${M}.comprar:Click()`);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  m.lua(`${M}.cerrar:Click()`);
  assert.equal(abierto(m), false);
  assert.equal(estado(m), undefined);
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 1);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  // Escape (el juego esconde los marcos de UISpecialFrames) hace lo mismo.
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  pulsarComprar(m);
  escribir(m, '5');
  m.avanzar(0.6);
  m.lua(`${M}.comprar:Click()`);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  m.lua(`${M}:Hide()`);
  assert.equal(abierto(m), false);
  assert.equal(m.lua(`${M}.velo:IsShown()`), false);
  assert.equal(estado(m), undefined, 'Escape descarta');
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 2);
  // Escape dentro de la caja de números también cierra.
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  pulsarComprar(m);
  m.lua(`local c = ${M}.caja; c:SetFocus(); c:GetScript("OnEscapePressed")(c)`);
  assert.equal(abierto(m), false);
  assert.equal(estado(m), undefined);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'nada de esto compra');
  sinErrores(m);
});

test('cerrar la subasta con el cuadro abierto lo cierra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(abierto(m), false);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('los objetos sueltos no abren el cuadro: Comprar de la barra compra como antes', () => {
  const m = maquina({ dinero: 1000000 });
  m.lua(`BANCO.ponerSubasta({objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 4338: [55000, 2] });
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  assert.equal(estado(m).tipo, 'objeto');
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.equal(abierto(m), false);
  // Arreglo de la compra suelta: el primer clic no compra (pide confirmar en el mismo botón) y el segundo sí.
  assert.equal(llamadas(m, 'PlaceBid').length, 0);
  assert.equal(estado(m).fase, 'confirmar');
  m.avanzar(0.6);
  pulsarComprar(m);
  assert.equal(abierto(m), false);
  assert.deepEqual(llamadas(m, 'PlaceBid'), [[4338 * 1000 + 2, 55000]]);
  assert.equal(m.lua(`${C}.abrir()`), false, 'con un objeto abrir() no abre nada');
  assert.equal(abierto(m), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglo final, Important 2: el cuadro se cierra siempre que se va la ventana.
// ---------------------------------------------------------------------------------------------------
const velo = (m) => m.lua(`${M}.velo:IsShown()`);
const cuadroCerrado = (m) => {
  assert.equal(abierto(m), false, 'el cuadro está cerrado');
  assert.equal(m.lua(`${M}:IsShown()`), false, 'el cuadro no se ve');
  assert.equal(velo(m), false, 'el velo no se ve (no se come clics)');
};
// Apaga el comercio como un fallo, pero sin avisar a nadie (SNF_COMERCIO_APAGADO no sale): así se ve qué pasa con un
// cuadro que no ha oído el aviso.
function apagarEnSilencio(m) {
  m.lua(`local emitir = SnetForever.Eventos.emitir
    SnetForever.Eventos.emitir = function() end
    SnetForever.Comercio.ejecutar("prueba", function() error("fallo de prueba") end)
    SnetForever.Eventos.emitir = emitir`);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false, 'el comercio está apagado');
}

test('con el cuadro abierto, pasar a la vista de Blizzard lo cierra con su velo', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  assert.equal(velo(m), true);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.equal(m.lua(`${V}:IsShown()`), false, 'la ventana se oculta');
  cuadroCerrado(m);
  assert.equal(estado(m), undefined, 'y la compra se descarta');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('al apagarse el comercio por un fallo el cuadro se cierra y Cancelar sigue funcionando apagado', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  m.lua('SnetForever.Escaneo.datos = function() error("datos rotos") end');
  m.avanzar(0.5);
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 1, 1)');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false, 'el escaneo roto apaga el comercio');
  cuadroCerrado(m);
  // La X con el comercio ya apagado (sin que el cuadro haya oído nada): cierra igualmente.
  const n = maquina();
  n.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(n);
  apagarEnSilencio(n);
  assert.equal(abierto(n), true, 'sin aviso, el cuadro sigue ahí');
  n.lua(`${M}.cerrar:Click()`);
  cuadroCerrado(n);
  sinErrores(m);
});

test('al cerrarse la subasta con el comercio apagado, el velo no se queda bloqueando clics', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  apagarEnSilencio(m);
  m.disparar('AUCTION_HOUSE_CLOSED');
  cuadroCerrado(m);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('con el aviso SNF_COMERCIO_APAGADO y SNF_COMERCIO_CERRADA el cuadro se oculta', () => {
  for (const mensaje of ['SNF_COMERCIO_APAGADO', 'SNF_COMERCIO_CERRADA']) {
    const m = maquina();
    m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
    conCuadro(m);
    m.lua(`SnetForever.emitir("${mensaje}")`);
    cuadroCerrado(m);
    sinErrores(m);
  }
});

test('abrir el cuadro con el engranaje abierto lo oculta y deja el velo y el cuadro por encima', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  m.lua(`${V}.pie.engranaje:Click()`);
  assert.equal(m.lua(`${V}.ajustes:IsShown()`), true, 'el engranaje está abierto');
  pulsarComprar(m);
  assert.equal(abierto(m), true);
  assert.equal(m.lua(`${V}.ajustes:IsShown()`), false, 'abrir el cuadro oculta el engranaje');
  // Aunque el engranaje se vuelva a abrir, el velo y el cuadro quedan por encima de él.
  m.lua(`${V}.ajustes:Show()`);
  const ESTRATOS = ['BACKGROUND', 'LOW', 'MEDIUM', 'HIGH', 'DIALOG', 'FULLSCREEN', 'FULLSCREEN_DIALOG', 'TOOLTIP'];
  const capa = (ruta) => [ESTRATOS.indexOf(m.lua(`${ruta}:GetFrameStrata()`)), m.lua(`${ruta}:GetFrameLevel()`)];
  const encima = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const ajustes = capa(`${V}.ajustes`);
  assert.ok(encima(capa(`${M}.velo`), ajustes), 'el velo por encima del engranaje');
  assert.ok(encima(capa(M), ajustes), 'el cuadro por encima del engranaje');
  assert.ok(encima(capa(M), capa(`${M}.velo`)), 'y el cuadro por encima del velo');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglo final, Important 3 (V6 y punto 2 del diseño): sin oro el botón sale apagado; por encima del precio normal de la
// app, aviso en rojo y segundo clic.
// ---------------------------------------------------------------------------------------------------
const colorTexto = (m, ruta) => m.lua(`{${ruta}:GetTextColor()}`).slice(0, 3);

test('si GetMoney() < total el botón principal sale apagado y el cuadro dice por qué', () => {
  const m = maquina({ dinero: 300000 }); // 30 de oro: el lino cuesta 4 de oro la unidad
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  assert.equal(m.lua(`${M}.aviso:IsShown()`), false, 'con oro de sobra no hay aviso');
  ponerCantidad(m, 15); // 65 de oro
  m.avanzar(0.6);
  assert.equal(estado(m).total, 650000);
  assert.equal(m.lua(`${M}.comprar:IsEnabled()`), false, 'sin oro, apagado');
  assert.equal(m.lua(`${M}.aviso:IsShown()`), true);
  assert.equal(textoDe(m, `${M}.aviso`), texto(m, 'COMERCIO_CANT_SIN_ORO', dinero(m, 650000 - 300000)));
  assert.deepEqual(colorTexto(m, `${M}.aviso`), ROJO(m), 'el motivo en rojo');
  assert.deepEqual(colorDe(m, `${M}.comprar.fondo`), m.lua('SnetForever.Estilo.comercio("cabecera")').slice(0, 3), 'el botón con aspecto de apagado');
  m.lua(`${M}.comprar:Click()`);
  assert.equal(compras(m), 0, 'apagado no compra');
  assert.equal(abierto(m), true, 'y el cuadro sigue abierto con la cantidad elegida');
  assert.equal(estado(m).cantidad, 15);
  // Baja la cantidad hasta lo que llega: se enciende y el aviso se va.
  ponerCantidad(m, 5);
  m.avanzar(0.6);
  assert.equal(m.lua(`${M}.comprar:IsEnabled()`), true);
  assert.equal(m.lua(`${M}.aviso:IsShown()`), false);
  // Y si el oro cambia con el cuadro abierto, también se entera.
  m.lua('BANCO.jugador.dinero = 100000');
  m.disparar('PLAYER_MONEY');
  assert.equal(m.lua(`${M}.comprar:IsEnabled()`), false, 'el oro ha bajado: apagado');
  assert.equal(textoDe(m, `${M}.aviso`), texto(m, 'COMERCIO_CANT_SIN_ORO', dinero(m, 200000 - 100000)));
  sinErrores(m);
});

test('si el precio por unidad pasa del normal de la app: aviso en rojo y segundo clic (el de confirmar)', () => {
  const m = maquina();
  // Lo normal del lino es 10 de oro; esta fila vale 12. El aviso de oro se sube para que no sea ese el que salta.
  m.lua('SnetForever.Ajustes.set("comercioAvisoOro", 5000000)');
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 10, unitPrice = 120000}}}})');
  abrir(m);
  escanear(m, { 2589: [120000, 10] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  pulsarComprar(m);
  assert.equal(abierto(m), true);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(estado(m).aviso, false, 'el aviso de oro no es el que salta');
  assert.equal(m.lua(`${M}.aviso:IsShown()`), true, 'avisa de que pasa del precio normal');
  assert.equal(textoDe(m, `${M}.aviso`), texto(m, 'COMERCIO_CANT_CARO', dinero(m, 100000)));
  assert.deepEqual(colorTexto(m, `${M}.aviso`), ROJO(m));
  assert.deepEqual(colorDe(m, `${M}.comprar.fondo`), ROJO(m), 'el botón en rojo');
  m.avanzar(0.6);
  m.lua(`${M}.comprar:Click()`); // primer clic: pide el precio real, no compra
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  m.avanzar(0.05);
  assert.equal(estado(m).fase, 'confirmar');
  assert.deepEqual(colorDe(m, `${M}.comprar.fondo`), ROJO(m), 'sigue en rojo al confirmar');
  assert.equal(m.lua(`${M}.aviso:IsShown()`), true);
  m.avanzar(30);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'no confirma solo');
  m.lua(`${M}.comprar:Click()`); // segundo clic: confirma
  assert.deepEqual(llamadas(m, 'ConfirmCommoditiesPurchase'), [[2589, 1]]);
  sinErrores(m);
});

test('por debajo del precio normal de la app no hay aviso rojo en el cuadro', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  escribir(m, '2');
  m.avanzar(0.6);
  assert.equal(m.lua(`${M}.aviso:IsShown()`), false);
  assert.notDeepEqual(colorDe(m, `${M}.comprar.fondo`), ROJO(m));
  sinErrores(m);
});

// Ronda 2 de B5: en combate el cuadro de cantidad no compra ni confirma, y al entrar en combate se cierra.
test('ronda 2: al entrar en combate el cuadro se cierra; su botón no compra en combate; al salir no se arma nada', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  assert.equal(abierto(m), true);
  m.avanzar(0.6);
  // Aunque el cuadro siga a la vista (el combate empieza en este mismo fotograma), su botón no compra.
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(`${M}.comprar:Enable(); ${M}.comprar:Click()`);
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 0, 'en combate el cuadro no pide el precio');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(abierto(m), false, 'al entrar en combate el cuadro se cierra');
  assert.equal(m.lua(`${M}.velo:IsShown()`), false, 'con su velo');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  m.avanzar(1);
  assert.equal(abierto(m), false, 'al salir no se vuelve a abrir solo');
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('ronda 2: con una mercancía por confirmar, entrar en combate la cancela y cierra el cuadro; su botón va apagado en combate', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  escribir(m, '2');
  m.avanzar(0.6);
  m.lua(`${M}.comprar:Click()`);
  m.avanzar(0.6);
  assert.equal(estado(m).fase, 'confirmar');
  // En combate el botón de Confirmar va apagado con su tooltip y no confirma.
  m.lua('BANCO.jugador.enCombate = true');
  m.lua('SnetForever.emitir("SNF_COMERCIO_COMPRA", "confirmar", SnetForever.Compra.estado())'); // repinta el cuadro
  assert.equal(m.lua(`${M}.comprar:IsEnabled()`), false, 'en combate, apagado');
  m.lua(`${M}.comprar:GetScript("OnEnter")(${M}.comprar)`);
  assert.deepEqual(m.lua('GameTooltip:IsShown()') ? m.lua('BANCO.lineasTooltip()') : [], [texto(m, 'COMERCIO_EN_COMBATE')]);
  m.lua(`${M}.comprar:GetScript("OnLeave")(${M}.comprar)`);
  m.lua(`${M}.comprar:Enable(); ${M}.comprar:Click()`);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0, 'en combate no confirma');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(abierto(m), false);
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length, 1);
  assert.deepEqual([estado(m).fase, estado(m).motivo], ['error', 'combate']);
  sinErrores(m);
});

test('ronda 3: con PLAYER_REGEN_DISABLED y InCombatLockdown() aún false, el cuadro se cierra y su botón no compra', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  m.avanzar(0.6);
  m.disparar('PLAYER_REGEN_DISABLED'); // el bloqueo aún no ha empezado
  assert.equal(abierto(m), false, 'el cuadro se cierra');
  m.lua(`${M}:Show(); ${M}.comprar:Enable(); ${M}.comprar:Click()`); // aunque llegara un clic
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 0, 'no pide el precio');
  m.lua(`${M}:Hide()`);
  sinErrores(m);
});

// T1a: el cuadro enseña el objeto (icono y nombre): con el ratón encima sale su tooltip (UIComercio.tooltipObjeto).
test('con el ratón sobre el objeto del cuadro de cantidad sale su tooltip anclado a él y al salir se esconde', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  assert.equal(abierto(m), true);
  const Z = `${M}.zonaObjeto`;
  assert.equal(m.lua(`${Z}:IsMouseEnabled()`), true, 'la zona del icono y el nombre recoge el ratón');
  m.lua(`${Z}:GetScript("OnEnter")(${Z})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.equal(m.lua('BANCO.lineasTooltip()[1]'), 'Paño de lino');
  assert.deepEqual(m.lua(`(function() local p, r, rp = GameTooltip:GetPoint(1); return {p, r == ${Z}, rp} end)()`), ['LEFT', true, 'RIGHT']);
  m.lua(`${Z}:GetScript("OnLeave")(${Z})`);
  m.avanzar(0.3); // T1a ronda 1: se esconde pasada la espera
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// Ronda 1, menor 3: los escalones de una mercancía en la lista vieja son el mismo objeto: sacan su tooltip, como en resultados.
test('lista vieja: con el ratón sobre un escalón de una mercancía sale el tooltip del objeto', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")'); // ronda 2: la lista a la vista (la luz no se enciende en una fila escondida)
  escanear(m, { 2589: [45000, 65] });
  pulsarFila(m, 2589);
  m.avanzar(0.6);
  m.lua(`${V}.tabla:abrir(2589, true)`); // el +/- de la fila: salen sus escalones
  const i = m.lua(`(function() for i, h in ipairs(${V}.tabla.huecos) do if h:IsShown() and h.fila and h.fila.escalon then return i end end end)()`);
  assert.ok(i, 'hay un escalón a la vista');
  const E = `${V}.tabla.huecos[${i}]`;
  m.lua(`${E}:GetScript("OnEnter")(${E})`);
  assert.equal(m.lua(`GameTooltip:IsShown() and GameTooltip:GetOwner() == ${E}`), true);
  assert.equal(m.lua('BANCO.lineasTooltip()[1]'), 'Paño de lino');
  m.lua(`${E}:GetScript("OnLeave")(${E})`);
  m.avanzar(0.5);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// B2r, punto 1: en la lista vieja, con una mercancía «lista» Comprar abre el cuadro: dice «Elegir cantidad…», sin unidades
// ni importe; la barra sigue diciendo lo elegido con su importe. Un objeto suelto sigue diciendo «Comprar» (o «Comprar X»).
test('lista vieja: con una mercancía elegida, Comprar dice «Elegir cantidad…» y abre el cuadro; con un objeto, no', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}, objetos = {${MAGICO}}})`);
  abrir(m);
  escanear(m, { 2589: [45000, 65], 4338: [55000, 2] });
  pulsarFila(m, 2589);
  m.avanzar(0.05);
  m.avanzar(0.6);
  assert.equal(estado(m).fase, 'lista');
  assert.equal(textoBoton(m), texto(m, 'COMERCIO_ELEGIR_CANTIDAD'));
  assert.ok(barra(m).includes(dinero(m, estado(m).total)), `la barra, con su importe: ${barra(m)}`);
  pulsarComprar(m);
  assert.equal(abierto(m), true, 'abre el cuadro');
  assert.equal(compras(m), 0);
  m.lua(`${C}.cerrar()`);
  pulsarFila(m, 4338);
  m.avanzar(0.05);
  m.avanzar(0.6);
  assert.equal(estado(m).fase, 'lista');
  assert.notEqual(textoBoton(m), texto(m, 'COMERCIO_ELEGIR_CANTIDAD'), 'un objeto no abre el cuadro');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B2r, puntos 2 y 5: el cuadro de compra, más cerca del «Order Confirmation» de TSM
// ---------------------------------------------------------------------------------------------------

// Anchos de letra de verdad para Montserrat (los mismos que subasta-resultados.test.js y subasta-ventana.test.js: medidos
// con PIL, más un 3 %).
// B3r: también Montserrat SemiBold (los botones y las etiquetas), medido igual con PIL.
const FACTOR_LETRA = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };
const letraReal = (m) => m.lua(`BANCO.letraReal = {${Object.entries(FACTOR_LETRA).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);
// Lana a 1s 82c, como en la captura (en la lista vieja la regla de fábrica deja como mucho 200: 3g 64s 00c).
const LANA = '[2592] = {{quantity = 235, unitPrice = 182}, {quantity = 560, unitPrice = 184}}';
function cuadroLana(m) {
  letraReal(m);
  m.lua(`BANCO.ponerSubasta({mercancias = {${LANA}}})`);
  abrir(m);
  escanear(m, { 2592: [182, 795] });
  pulsarFila(m, 2592);
  m.avanzar(0.05);
  pulsarComprar(m);
  assert.equal(abierto(m), true);
  ponerCantidad(m, 200);
  m.avanzar(0.6);
}

// La caja de un texto según cómo está justificado (los rótulos y sus valores comparten renglón: lo que cuenta es el texto).
const CAJA_TEXTO = `local function cajaTexto(fs, V)
  local w, j = fs:GetUnboundedStringWidth(), fs:GetJustifyH()
  local l, r = fs:GetLeft() - V:GetLeft(), fs:GetRight() - V:GetLeft()
  if j == "RIGHT" then l = r - w elseif j == "CENTER" then l, r = (l + r - w) / 2, (l + r + w) / 2 else r = l + w end
  return {l, r, V:GetTop() - fs:GetTop(), V:GetTop() - fs:GetBottom()}
end
local function cajaMarco(f, V) return {f:GetLeft() - V:GetLeft(), f:GetRight() - V:GetLeft(), V:GetTop() - f:GetTop(), V:GetTop() - f:GetBottom()} end`;
function disposicionCuadro(m) {
  return m.lua(`(function()
    ${CAJA_TEXTO}
    local V = ${M}
    local r = {ancho = V:GetWidth(), alto = V:GetHeight(), piezas = {}}
    local function poner(n, c) r.piezas[#r.piezas + 1] = {n, c[1], c[2], c[3], c[4]} end
    poner("titulo", cajaTexto(V.titulo, V))
    poner("cerrar", cajaMarco(V.cerrar, V))
    poner("objeto", cajaMarco(V.objeto, V))
    poner("etiquetaCantidad", cajaTexto(V.etiquetaCantidad, V))
    poner("caja", cajaMarco(V.caja:GetParent(), V))
    for _, k in ipairs({1, 5, 20, "max"}) do poner("rapido" .. k, cajaMarco(V.rapidos[k], V)) end
    poner("etiquetaUnidad", cajaTexto(V.etiquetaUnidad, V))
    poner("unidad", cajaTexto(V.unidad, V))
    poner("etiquetaTotal", cajaTexto(V.etiquetaTotal, V))
    poner("total", cajaTexto(V.total, V))
    if V.aviso:IsShown() then poner("aviso", cajaTexto(V.aviso, V)) end
    poner("comprar", cajaMarco(V.comprar, V))
    poner("escalones", cajaMarco(V.escalones.marco, V))
    r.nombre = cajaTexto(V.nombre, V)
    r.icono = cajaMarco(V.icono, V)
    r.textoComprar = {V.comprar.texto:GetUnboundedStringWidth(), V.comprar:GetWidth()}
    r.avisoUnaLinea = V.aviso:GetWordWrap() == false
    return r
  end)()`);
}
const pisan = (a, b) => a[0] < b[1] - 0.01 && b[0] < a[1] - 0.01 && a[2] < b[3] - 0.01 && b[2] < a[3] - 0.01;

test('disposición del cuadro de cantidad: título centrado, X arriba a la derecha, la compra a la izquierda y los escalones a la derecha; nada se pisa con la letra real', () => {
  for (const idioma of ['es', 'en']) {
    const m = maquina();
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    cuadroLana(m);
    // Con un aviso a la vista: no llega el oro para el total.
    m.lua('BANCO.jugador.dinero = 100');
    m.disparar('PLAYER_MONEY');
    const r = disposicionCuadro(m);
    const p = Object.fromEntries(r.piezas.map((x) => [x[0], x.slice(1)]));
    const msg = (t) => `${idioma}: ${t}`;
    const cerca = (a, b, t) => assert.ok(Math.abs(a - b) < 0.51, msg(`${t}: ${a} y no ${b}`));
    // Frente a los bordes del cuadro.
    cerca((p.titulo[0] + p.titulo[1]) / 2, r.ancho / 2, 'el título centrado');
    assert.ok(p.titulo[2] >= 8 && p.titulo[2] <= 16, msg(`el título arriba (${p.titulo[2]})`));
    cerca(r.ancho - p.cerrar[1], 8, 'la X a 8 px del borde derecho');
    cerca(p.cerrar[2], 8, 'la X a 8 px del borde de arriba');
    const izq = p.comprar[0];
    const der = p.comprar[1];
    cerca(izq, 14, 'la columna izquierda a 14 px del borde');
    cerca(r.alto - p.comprar[3], 14, 'Comprar a 14 px del borde de abajo');
    assert.ok(p.aviso, msg('el aviso se ve'));
    for (const n of ['objeto', 'etiquetaCantidad', 'etiquetaUnidad', 'etiquetaTotal', 'aviso']) cerca(p[n][0], izq, `${n} a la izquierda`);
    for (const n of ['objeto', 'caja', 'unidad', 'total']) cerca(p[n][1], der, `${n} alineado a la derecha de la columna`);
    assert.ok(der - izq >= 240, msg(`Comprar es ancho (${der - izq})`));
    cerca(r.ancho - p.escalones[1], 14, 'los escalones a 14 px del borde derecho');
    cerca(p.escalones[2], p.objeto[2], 'los escalones arriba, a la altura del objeto');
    assert.ok(p.escalones[0] - der >= 12, msg('entre las dos columnas hay sitio'));
    // El icono y el nombre dentro de la caja del objeto.
    assert.ok(r.icono[0] >= p.objeto[0] && r.nombre[1] <= p.objeto[1] && r.icono[2] >= p.objeto[2] && r.icono[3] <= p.objeto[3], msg('icono y nombre en su caja'));
    // Nada se sale ni se pisa.
    for (const [n, l, rr, t, b] of r.piezas) {
      assert.ok(l >= 8 - 0.01 && rr <= r.ancho - 8 + 0.01 && t >= 8 - 0.01 && b <= r.alto - 8 + 0.01, msg(`${n} dentro del cuadro: ${[l, rr, t, b]}`));
    }
    for (let a = 0; a < r.piezas.length; a++) {
      for (let b = a + 1; b < r.piezas.length; b++) {
        assert.ok(!pisan(r.piezas[a].slice(1), r.piezas[b].slice(1)), msg(`${r.piezas[a][0]} y ${r.piezas[b][0]} no se pisan: ${r.piezas[a]} / ${r.piezas[b]}`));
      }
    }
    assert.equal(r.avisoUnaLinea, true, msg('el aviso va en una línea'));
    assert.ok(r.textoComprar[0] <= r.textoComprar[1] - 16, msg(`el texto de Comprar cabe: ${r.textoComprar}`));
    sinErrores(m);
  }
});

// El aviso de precio se queda, corto y en una línea: cabe con la letra real con los importes de hasta 99g 99s 99c.
test('los avisos del cuadro caben en una línea con la letra real', () => {
  const m = maquina();
  cuadroLana(m);
  const largo = dinero(m, 999999);
  const avisos = [['COMERCIO_CANT_SIN_ORO', largo], ['COMERCIO_CANT_CARO', largo], ['COMERCIO_CANT_SUBIO', largo, largo], ['COMERCIO_CANT_QUEDAN', '10.000']];
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    for (const [clave, ...args] of avisos) {
      const w = m.lua(`(function() local a = ${M}.aviso; local antes = a:GetText(); a:SetText(SnetForever.L.t(${[clave, ...args].map(aLua).join(', ')})); local w = a:GetUnboundedStringWidth(); a:SetText(antes); return {w, a:GetWidth()} end)()`);
      assert.ok(w[0] <= w[1], `${idioma} ${clave}: ${w[0]} px en ${w[1]} px`);
    }
    assert.ok(texto(m, 'COMERCIO_CANT_CARO', '1s 63c').length <= 40, `${idioma}: el de compra cara, corto`);
  }
  sinErrores(m);
});

test('el % de la unidad y de los escalones sale con su color', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  conCuadro(m);
  // Lo normal es 10 de oro: 4 de oro es el 40 % (azul), 4,5 el 45 % (verde) y 20 el 200 % (B3r: naranja; rojo desde el
  // 1000 %), como la columna % de resultados.
  assert.equal(textoDe(m, `${M}.unidad`), unidadCon(m, 40000, 40, 'azul'));
  const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  const hex = (token) => m.lua(`SnetForever.Tema.hex(${aLua(token)})`);
  [[40, 'azul'], [45, 'verde'], [200, 'naranja']].forEach(([pct, token], k) => {
    const celda = `${M}.escalones.huecos[${k + 1}].celdas.pct`;
    assert.equal(textoDe(m, celda), texto(m, 'COMERCIO_PCT', String(pct)), `escalón ${k + 1}: su %`);
    assert.equal(aHex(m.lua(`{${celda}:GetTextColor()}`)), hex(token), `escalón ${k + 1}: en ${token}`);
  });
  // 6 unidades: 5 a 4 de oro y 1 a 4,5, de media 40834: el 41 %, ya verde.
  ponerCantidad(m, 6);
  assert.equal(textoDe(m, `${M}.unidad`), unidadCon(m, Math.ceil((5 * 40000 + 45000) / 6), 41, 'verde'), '6: 41 %, verde');
  // Sin precio de la app, sin %.
  m.lua('SnetForever.Precios.de = function() return nil end');
  ponerCantidad(m, 5);
  assert.equal(textoDe(m, `${M}.unidad`), dinero(m, 40000));
  sinErrores(m);
});

// B3s: Mayús + clic y Ctrl + clic en las filas de objeto (UIComercio.clicModificado, el mismo sitio que la vista de
// resultados): la lista vieja, sus escalones y el objeto del cuadro de cantidad. Con tecla no se prepara ni se cambia nada.
test('Mayús + clic funciona igual en la lista vieja, el sniper, las 4 listas de Grupos y el cuadro de cantidad: la lista vieja, sus escalones y el cuadro', () => {
  const m = maquina();
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO}}})`);
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  escanear(m, { 2589: [45000, 65], 4338: [55000, 2] });
  const lino = m.lua('(select(2, C_Item.GetItemInfo(2589)))');
  const magico = m.lua('(select(2, C_Item.GetItemInfo(4338)))');
  const conTecla = (tecla, fn) => { m.lua(`BANCO.${tecla} = true`); try { fn(); } finally { m.lua(`BANCO.${tecla} = false`); } };
  // La lista vieja: sin chat abierto, Mayús + clic lo abre con el enlace; no elige ni prepara compra.
  conTecla('shift', () => pulsarFila(m, 4338));
  m.avanzar(0.1);
  assert.deepEqual(m.lua('BANCO.chat'), { abierta: true, texto: magico }, 'lista vieja: al chat');
  assert.equal(estado(m), undefined, 'no prepara compra');
  assert.equal(m.lua(`${V}.tabla:elegida()`), undefined, 'no elige la fila');
  conTecla('ctrl', () => pulsarFila(m, 2589));
  assert.equal(m.lua('BANCO.probador'), lino, 'Ctrl + clic: al probador');
  assert.equal(estado(m), undefined);
  // Sin tecla, como siempre: prepara la compra del lino.
  pulsarFila(m, 2589);
  m.avanzar(0.6);
  assert.equal(estado(m).item, 2589);
  // Sus escalones (subfilas): el mismo objeto; con tecla la cantidad no cambia.
  m.lua(`${V}.tabla:abrir(2589, true)`);
  const i = m.lua(`(function() for i, h in ipairs(${V}.tabla.huecos) do if h:IsShown() and h.fila and h.fila.escalon and h.fila.acumulado > 5 then return i end end end)()`);
  assert.ok(i, 'hay un escalón a la vista');
  const antes = { cantidad: estado(m).cantidad, barra: barra(m), boton: textoBoton(m), marcada: m.lua(`${V}.tabla:elegida()`) };
  conTecla('shift', () => m.lua(`${V}.tabla.huecos[${i}]:Click()`));
  assert.equal(m.lua('BANCO.chat.texto'), magico + lino, 'escalón: el enlace del objeto');
  assert.deepEqual({ cantidad: estado(m).cantidad, barra: barra(m), boton: textoBoton(m), marcada: m.lua(`${V}.tabla:elegida()`) }, antes, 'ni la cantidad, ni la barra, ni lo marcado cambian');
  // El cuadro de cantidad: el icono o el nombre del objeto en su caja.
  pulsarComprar(m);
  assert.equal(abierto(m), true);
  const Z = `${M}.zonaObjeto`;
  const cantidadAntes = estado(m).cantidad;
  conTecla('shift', () => m.lua(`${Z}:GetScript("OnMouseUp")(${Z}, "LeftButton")`));
  assert.equal(m.lua('BANCO.chat.texto'), magico + lino + lino, 'cuadro: el enlace de su objeto');
  conTecla('ctrl', () => m.lua(`${Z}:GetScript("OnMouseUp")(${Z}, "LeftButton")`));
  assert.equal(m.lua('BANCO.probador'), lino, 'cuadro: Ctrl + clic al probador');
  assert.equal(abierto(m), true, 'el cuadro sigue abierto');
  assert.equal(estado(m).cantidad, cantidadAntes, 'y la cantidad no cambia');
  // Sin tecla, el clic en el objeto del cuadro no hace nada.
  m.lua(`${Z}:GetScript("OnMouseUp")(${Z}, "LeftButton")`);
  assert.equal(m.lua('BANCO.chat.texto'), magico + lino + lino);
  assert.deepEqual(m.llamadas('SendChatMessage'), [], 'nada se envía');
  assert.equal(compras(m), 0);
  sinErrores(m);
});
