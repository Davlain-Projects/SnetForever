// Tope prudente: en modo operaciones, Sniper y Compras no pagan más que el menor entre el precio de mercado de tu casa
// (snfmercado, Precios.de(item).normal) y el regional (snfregional(), Precios.regional). La fórmula de «Precio máximo» de
// la operación sigue mandando cuando es más baja; sin ninguno de los dos precios manda ella sola. Se apaga con el ajuste
// comercioTopePrudente.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;

// La ranura de precios de la hora: la casa 114 con 2589 (lino) y 2592 (lana) a `normal` de mercado, y, si se pide, el
// precio regional del lino.
function ponerRanura(dir, { normal = 100000, regional } = {}) {
  const i = (H % 8) + 1;
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n`);
  const filas = [2589, 2592, 4306].map((item) => `[${item}] = {98000, 400, ${normal}, 0, 0.6, 85, 0}`).join(', ');
  const reg = regional === undefined ? ''
    : `, regional = {[2589] = ${regional}}, regionalInfo = {casas = 3, desde = ${H * 3600 - 7200}, hora = ${H * 3600}}`;
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true${reg}}
`);
}

function maquina(precios) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-tope-prudente-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  if (precios) ponerRanura(dir, precios);
  const m = crearMaquina({ addonsDir: dir, jugador: { nombre: 'Comprador', reino: 'Normal', faccion: 'Horde' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua('BANCO.jugador.dinero = 10000000');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 2 });
  // Sniper y Compras van con la subasta abierta: Precios.de lee entonces la casa de esa subasta.
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.5);
  m.lua('SnetForever.Escaneo.parar()');
  return m;
}

function operacion(m, formula) {
  m.lua(`local S = SnetForever
    if not S.Operaciones.existe("sniper", "Telas") then assert(S.Operaciones.crear("sniper", "Telas")) end
    assert(S.Operaciones.poner("sniper", "Telas", "precioMaximo", "${formula}"))`);
}

const tope = (m, item = 2589) => m.lua(`return {SnetForever.Operaciones.topeCompra("sniper", "Telas", ${item})}`) || [];

test('fórmula por encima del mercado: recorta al precio de tu casa', () => {
  const m = maquina({ normal: 100000 });
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [100000, 'mercado']);
  sinErrores(m);
});

test('regional más bajo que la casa: recorta al regional', () => {
  const m = maquina({ normal: 100000, regional: 80000 });
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [80000, 'regional']);
  sinErrores(m);
});

test('fórmula por debajo de los dos precios: no cambia', () => {
  const m = maquina({ normal: 100000, regional: 80000 });
  operacion(m, '65000c');
  assert.deepEqual(tope(m), [65000]);
  sinErrores(m);
});

test('solo mercado (sin regional en la ranura): recorta al precio de tu casa', () => {
  const m = maquina({ normal: 90000 });
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [90000, 'mercado']);
  sinErrores(m);
});

test('sin datos de precio: manda la fórmula', () => {
  const m = maquina();
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [200000]);
  sinErrores(m);
});

test('un precio de mercado de 0 no deja el tope en 0', () => {
  const m = maquina({ normal: 0 });
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [200000]);
  sinErrores(m);
});

test('apagado: el tope es la fórmula, como antes', () => {
  const m = maquina({ normal: 100000, regional: 80000 });
  m.lua('SnetForever.Ajustes.set("comercioTopePrudente", false)');
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [200000]);
  sinErrores(m);
});

// La ranura no trae precio regional: la fórmula no da valor y no hay tope, aunque haya precio de mercado.
test('fórmula sin valor: sin tope', () => {
  const m = maquina({ normal: 100000 });
  operacion(m, 'snfregional()');
  assert.deepEqual(tope(m), []);
  sinErrores(m);
});

test('el tope prudente viene encendido', () => {
  const m = maquina();
  assert.equal(m.lua('return SnetForever.Ajustes.get("comercioTopePrudente")'), true);
  sinErrores(m);
});

// ---------- Sniper en modo operaciones ----------

const S = 'SnetForever.Sniper';
const hallazgos = (m) => m.lua(`return ${S}.hallazgos()`) || [];
const navegaciones = (m) => m.llamadas('C_AuctionHouse.SendBrowseQuery').length;
const pulsar = (m) => m.lua('SnetForever.UIComercio.marco().pie.comprar:Click()');

// Telas (lino, lana y seda) con la operación de Sniper «Telas», y el sniper en modo operaciones.
function sniperTelas(m, formula) {
  operacion(m, formula);
  m.lua(`local S = SnetForever
    assert(S.Arbol.crear("", "Telas"))
    assert(S.Arbol.poner("i:2589", "Telas"))
    assert(S.Arbol.poner("i:2592", "Telas"))
    assert(S.Arbol.poner("i:4306", "Telas"))
    assert(S.Operaciones.ponerDeGrupo("Telas", "sniper", {"Telas"}))
    S.Ajustes.set("comercioSniperModo", "operaciones")`);
}

// Las ofertas de la búsqueda general (y, con `objetos`, las subastas sueltas que se compran), y una vuelta del sniper.
function vigilar(m, filas, objetos = '') {
  const lua = Object.entries(filas).map(([item, p]) => `{itemID = ${item}, totalQuantity = 10, minPrice = ${p}}`);
  m.lua(`BANCO.ponerSubasta({navegar = {${lua.join(', ')}}, porPagina = 50${objetos}})`);
  m.disparar('AUCTION_HOUSE_SHOW');
  for (let i = 0; i < 400 && m.lua('return SnetForever.Escaneo.estado()') !== 'completo'; i++) m.avanzar(0.05);
  assert.equal(m.lua(`return ${S}.empezar()`), true);
  const n = navegaciones(m);
  for (let i = 0; i < 200 && navegaciones(m) === n; i++) m.avanzar(0.1);
  m.avanzar(0.2);
}

test('sniper: no ofrece lo que pasa del precio de tu casa aunque la fórmula lo permita', () => {
  const m = maquina({ normal: 100000 });
  sniperTelas(m, '200000c');
  vigilar(m, { 2589: 120000, 2592: 90000 });
  const h = hallazgos(m);
  assert.deepEqual(h.map((x) => x.item), [2592]);
  assert.equal(h[0].tope, 100000);
  assert.equal(h[0].recorte, 'mercado');
  sinErrores(m);
});

test('sniper: lo que queda por debajo del tope recortado se compra con los dos clics de siempre', () => {
  const m = maquina({ normal: 100000 });
  sniperTelas(m, '200000c');
  vigilar(m, { 4306: 90000 }, ', objetos = {[4306] = {{quantity = 1, buyoutAmount = 90000}}}');
  assert.deepEqual(hallazgos(m).map((x) => x.item), [4306]);
  m.lua(`${S}.elegir(1)`);
  m.avanzar(0.05);
  m.avanzar(0.6);
  pulsar(m);
  m.avanzar(0.6);
  pulsar(m);
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[4306 * 1000 + 1, 90000]]);
  sinErrores(m);
});

test('sniper con el tope prudente apagado: manda la fórmula sola', () => {
  const m = maquina({ normal: 100000 });
  m.lua('SnetForever.Ajustes.set("comercioTopePrudente", false)');
  sniperTelas(m, '200000c');
  vigilar(m, { 2589: 120000, 2592: 90000 });
  const h = hallazgos(m);
  assert.deepEqual(h.map((x) => x.item).sort(), [2589, 2592]);
  assert.equal(h[0].recorte, undefined);
  sinErrores(m);
});

test('sniper: el tooltip de la fila dice que el tope se recortó al precio de tu casa', () => {
  const m = maquina({ normal: 100000 });
  sniperTelas(m, '200000c');
  m.lua('BANCO.ponerSubasta({navegar = {{itemID = 2592, totalQuantity = 10, minPrice = 90000}}, porPagina = 50})');
  m.disparar('AUCTION_HOUSE_SHOW');
  for (let i = 0; i < 400 && m.lua('return SnetForever.Escaneo.estado()') !== 'completo'; i++) m.avanzar(0.05);
  const P = 'SnetForever.SubastaSniper.marcos';
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.6);
  const i = m.lua(`(function() for i, h in ipairs(${P}.tabla.huecos) do
    if h:IsShown() and h.celdas.objeto:GetText() == "Paño de lana" then return i end end end)()`);
  assert.ok(i, 'la lana sale en la tabla');
  m.lua(`${P}.tabla.huecos[${i}]:GetScript("OnEnter")(${P}.tabla.huecos[${i}])`);
  const sinColores = (t) => (t || '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');
  const lineas = (m.lua('BANCO.lineasTooltip()') || []).map(sinColores);
  const esperado = sinColores(m.lua('SnetForever.L.t("SUBASTA_SNIPER_TOPE_MERCADO", SnetForever.Tema.dinero(100000))'));
  assert.ok(lineas.includes(esperado), `tooltip: ${lineas}`);
  sinErrores(m);
});

// ---------- Compras (operaciones de compra por grupo) ----------

const SHOP = 'SnetForever.GroupShopping';

// Como group-shopping.test.js: «Restock» (máx. 800c, reponer hasta 8) sobre el lino, con 2 en las bolsas y tres tramos
// de mercancía a 100, 120 y 900.
function comprasLino(m) {
  m.lua(`local S = SnetForever
    assert(S.Arbol.crear("", "Supplies"))
    assert(S.Arbol.poner("i:2589", "Supplies"))
    assert(S.Operaciones.crear("compras", "Restock"))
    assert(S.Operaciones.poner("compras", "Restock", "precioMaximo", "800c"))
    assert(S.Operaciones.poner("compras", "Restock", "reponerCantidad", "8"))
    assert(S.Operaciones.ponerDeGrupo("Supplies", "compras", {"Restock"}))
    BANCO.jugador.dinero = 100000
    BANCO.ponerSubasta({mercancias={[2589]={{quantity=4,unitPrice=100},{quantity=9,unitPrice=120},{quantity=2,unitPrice=900}}}})`);
  m.objeto(2589, 2);
  assert.equal(m.lua(`return ${SHOP}.start({Supplies=true})`), true);
  for (let n = 0; n < 16 && m.lua(`return ${SHOP}.state().status`) === 'scanning'; n++) m.avanzar(0.25);
  assert.equal(m.lua(`return ${SHOP}.state().status`), 'complete');
  return m.lua(`return ${SHOP}.state().rows`);
}

test('compras: el tope baja al precio de tu casa y el tramo de 120 ya no se compra', () => {
  const m = maquina({ normal: 110 });
  const rows = comprasLino(m);
  const eligible = rows.filter((r) => !r.overLimit);
  assert.equal(eligible.length, 1, `filas: ${JSON.stringify(rows)}`);
  assert.equal(eligible[0].price, 100);
  assert.equal(eligible[0].quantity, 4);
  assert.equal(eligible[0].threshold, 110);
  assert.equal(eligible[0].clip, 'mercado');
  sinErrores(m);
});

test('compras con el tope prudente apagado: el tope es el de la operación', () => {
  const m = maquina({ normal: 110 });
  m.lua('SnetForever.Ajustes.set("comercioTopePrudente", false)');
  const rows = comprasLino(m);
  const eligible = rows.find((r) => !r.overLimit);
  assert.equal(eligible.threshold, 800);
  assert.equal(eligible.clip, undefined);
  sinErrores(m);
});
