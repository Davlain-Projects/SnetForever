// Subasta, parte 3, bloque B, Task B3: la página Navegar de nuestra ventana de la subasta (SnetForever.SubastaNavegar,
// ui/subasta/navegar.lua). A la izquierda, el árbol de grupos con «Buscar en grupos», desplegar y plegar todo, las barras
// de los grupos elegidos para el escaneo de compras y «Ejecutar escaneo de compras» (apagado). A la derecha, el buscador de
// la casa de subastas con su botón, los cuatro botones de búsqueda y las pestañas de búsquedas recientes y favoritas.
// Medidas de ah-navegar-tsm-entera.webp (a la misma escala que subasta-tsm-2.png: «Mis Subastas» mide 100 px en las dos).
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const SV = 'SnetForever.SubastaVentana';
const M = `${SV}.marcos`;
const N = 'SnetForever.SubastaNavegar.marcos';
const V = 'SnetForever.UIComercio.marco()';
const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}; AuctionHouseFrame:EnableMouse(true); ';

// Precios de la app (como en subasta-ventana.test.js): la ranura de la hora, recién cargada.
const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
function ponerRanura(dir) {
  const i = (H % 8) + 1;
  const nombre = `SnetForever_P${String(i).padStart(2, '0')}`;
  const carpeta = join(dir, nombre);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n');
  const filas = [2589, 2592, 4306].map((item) => `[${item}] = {98000, 400, 100000, 0, 0.42, 85, 0}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true}
`);
}

// Grupos del jugador: Hierbas > Raras > Muy raras, Telas y Metales.
const GRUPOS = `local A = SnetForever.Arbol
  A.crear("", "Hierbas"); A.crear("Hierbas", "Raras"); A.crear("Hierbas\`Raras", "Muy raras"); A.crear("", "Telas"); A.crear("", "Metales")`;

function maquina({ idioma = 'es', precios = false, grupos = true, sitio, escala } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-subasta-navegar-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  if (precios) ponerRanura(dir);
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' }, previo: SUBASTA });
  if (precios) m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua(`SnetForever.Ajustes.set("idioma", ${aLua(idioma)})`);
  if (escala) m.lua(`UIParent:SetScale(${escala})`);
  if (grupos) m.lua(GRUPOS);
  if (sitio) m.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = ${sitio}`);
  return m;
}
const abrir = (m) => { m.disparar('AUCTION_HOUSE_SHOW'); m.avanzar(0.05); };
const cerrar = (m) => m.disparar('AUCTION_HOUSE_CLOSED');
const texto = (m, clave) => m.lua(`SnetForever.L.t(${aLua(clave)})`);
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const colorTexto = (m, expr) => aHex(m.lua(`{${expr}:GetTextColor()}`));
const colorVertice = (m, expr) => aHex(m.lua(`{${expr}:GetVertexColor()}`));
const token = (m, nombre) => aHex(m.lua(`SnetForever.Tema.color(${aLua(nombre)})`));
// El tooltip que sale al pasar el ratón por `expr` (y se va al salir).
const tooltip = (m, expr) => {
  m.lua(`${expr}:GetScript("OnEnter")(${expr})`);
  const l = m.lua('GameTooltip:IsShown()') ? m.lua('BANCO.lineasTooltip()') : [];
  m.lua(`${expr}:GetScript("OnLeave")(${expr})`);
  return l;
};
// La fila del árbol que enseña esa clave (nil si no se ve).
const filaArbol = (clave) => `(function() for _, f in ipairs(${N}.arbol.filas) do if f:IsShown() and f.clave == ${aLua(clave)} then return f end end end)()`;
// La barra de una fila del árbol: false si no se ve; si se ve, su color y su sitio.
const barra = (m, clave) => m.lua(`(function()
  local f = ${filaArbol(clave)}
  if not f then return "sin fila" end
  if not f.marca:IsShown() then return false end
  return {color = {f.marca:GetVertexColor()}, izq = f.marca:GetLeft() - f:GetLeft(), ancho = f.marca:GetWidth(), alto = f.marca:GetHeight(),
    arriba = f:GetTop() - f.marca:GetTop(), fondo = f.resalte:IsShown() and {f.resalte:GetVertexColor()} or false}
end)()`);
// Los grupos elegidos guardados (la tabla vacía llega como []).
const elegidos = (m) => {
  const v = m.lua('SnetForeverCuenta.comercio.gruposCompra');
  return !v || (Array.isArray(v) && v.length === 0) ? {} : v;
};
// Las filas que se ven en la lista de búsquedas (recientes o favoritas).
const lista = (m) => m.lua(`(function() local r = {}; for _, f in ipairs(${N}.filas) do if f:IsShown() then r[#r + 1] = f.texto:GetText() end end; return r end)()`) || [];
const filaLista = (t) => `(function() for _, f in ipairs(${N}.filas) do if f:IsShown() and f.texto:GetText() == ${aLua(t)} then return f end end end)()`;
const textos = (m) => m.llamadas('C_AuctionHouse.SendBrowseQuery').map((a) => a[0].searchString);
const recientes = (m) => m.lua('SnetForever.Busqueda.recientes()') || [];
const favoritas = (m) => m.lua('SnetForever.Busqueda.favoritas()') || [];
// Lo que haya en una caja: {izq, der, arriba, abajo} relativo a la esquina de arriba a la izquierda de la ventana (y hacia abajo).
const caja = (m, expr) => m.lua(`(function()
  local v = ${V}
  local x = ${expr}
  return {izq = x:GetLeft() - v:GetLeft(), der = x:GetRight() - v:GetLeft(), arriba = v:GetTop() - x:GetTop(), abajo = v:GetTop() - x:GetBottom()}
end)()`);
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.51, `${msg}: ${a} y no ${b}`);

// ---------------------------------------------------------------------------------------------------
// Izquierda
// ---------------------------------------------------------------------------------------------------

test('izquierda: buscador de grupos, árbol con barras en los elegidos y escaneo disponible con grupos seleccionados', () => {
  const m = maquina({ sitio: '{x = 50, y = 50, ancho = 1000, alto = 600}' });
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.gruposCompra = {["Hierbas"] = true, ["Hierbas`Raras"] = true}');
  abrir(m);
  assert.equal(m.lua(`${SV}.pagina()`), 'navegar');
  assert.equal(m.lua(`${N}.panel:IsVisible()`), true, 'Navegar ya no es una página vacía');
  assert.equal(m.lua(`${N}.panel:GetParent() == ${M}.paginas.navegar`), true);
  // El panel: 251 px de ancho, a 12 px del borde, 4 px bajo la cabecera y 11 px sobre el borde de abajo, en «secundario».
  const p = caja(m, `${N}.panel`);
  const cab = caja(m, `${M}.cabecera`);
  cerca(p.izq, 12, 'el panel a 12 px del borde');
  cerca(p.der - p.izq, 251, 'el panel mide 251 px');
  cerca(p.arriba - cab.abajo, 4, 'a 4 px bajo la cabecera');
  cerca(m.lua(`${V}:GetHeight()`) - p.abajo, 11, 'a 11 px del borde de abajo');
  assert.equal(colorVertice(m, `${N}.fondoPanel`), token(m, 'secundario'));
  // Buscar en grupos: campo con lupa de 165 × 22 a 15 px del panel y 14 px de su borde de arriba, con letra de 12 px.
  const c = `${N}.campoGrupos`;
  assert.equal(m.lua(`${c}.marcador:GetText()`), texto(m, 'SUBASTA_NAV_BUSCAR_GRUPOS'));
  assert.equal(m.lua(`${c}.iconoLupa ~= nil`), true, 'con lupa');
  const cg = caja(m, c);
  cerca(cg.izq - p.izq, 15, 'el campo a 15 px del panel');
  cerca(cg.arriba - p.arriba, 14, 'el campo a 14 px del borde de arriba del panel');
  cerca(cg.der - cg.izq, 165, 'el campo mide 165 px');
  cerca(cg.abajo - cg.arriba, 22, 'el campo mide 22 px de alto');
  assert.equal(m.lua(`select(2, ${c}.marcador:GetFont())`), 12);
  // Los dos botones pequeños, a la derecha del campo, con su tooltip.
  for (const [b, clave] of [['desplegar', 'SUBASTA_NAV_DESPLEGAR'], ['plegar', 'SUBASTA_NAV_PLEGAR']]) {
    const bb = caja(m, `${N}.${b}`);
    assert.ok(bb.izq > cg.der && bb.der <= p.der, `${b} entre el campo y el borde del panel: ${JSON.stringify(bb)}`);
    cerca((bb.arriba + bb.abajo) / 2, (cg.arriba + cg.abajo) / 2, `${b} a la altura del campo`);
    assert.deepEqual(tooltip(m, `${N}.${b}`), [texto(m, clave)]);
  }
  assert.ok(caja(m, `${N}.desplegar`).der < caja(m, `${N}.plegar`).izq, 'desplegar va antes que plegar');
  // El árbol: Grupo Base sin triángulo y sin barra; las barras de 5 × 14 px a 4 px del borde de la fila; la de un grupo
  // elegido en el color de su nivel y sin fondo; la de uno sin elegir, oscura y con la fila hundida.
  const a = caja(m, `${N}.arbol`);
  cerca(a.izq - p.izq, 7, 'el árbol a 7 px del panel');
  cerca(p.der - a.der, 7, 'y a 7 px del otro lado');
  cerca(a.arriba - p.arriba, 44, 'el árbol empieza a 44 px del panel');
  // Grupo Base lleva la barra oscura de un grupo sin elegir, como TSM (decisión del jugador), con la fila hundida.
  const base = barra(m, '');
  assert.ok(base, 'Grupo Base lleva barra');
  assert.equal(aHex(base.color), token(m, 'secundario'), 'Grupo Base: barra oscura');
  assert.equal(aHex(base.fondo), token(m, 'hundido'), 'Grupo Base: fila hundida');
  m.lua(`${N}.desplegar:Click()`);
  const hierbas = barra(m, 'Hierbas');
  assert.equal(aHex(hierbas.color), token(m, 'nivel1'), 'Hierbas (elegido) en el color del nivel 1');
  assert.equal(hierbas.fondo, false, 'sin fondo');
  cerca(hierbas.izq, 4, 'a 4 px del borde');
  cerca(hierbas.ancho, 5, '5 px de ancho');
  cerca(hierbas.alto, 14, '14 px de alto');
  cerca(hierbas.arriba, 4, 'centrada en la fila de 22');
  assert.equal(aHex(barra(m, 'Hierbas`Raras').color), token(m, 'nivel2'), 'Raras (elegido) en el color del nivel 2');
  for (const g of ['Telas', 'Hierbas`Raras`Muy raras']) {
    const b = barra(m, g);
    assert.equal(aHex(b.color), token(m, 'secundario'), `${g}: barra oscura`);
    assert.equal(aHex(b.fondo), token(m, 'hundido'), `${g}: la fila hundida`);
  }
  // Desplegar y plegar todo.
  assert.equal(m.lua(`${N}.arbol:visibles()`), 6, 'desplegado: Grupo Base y los 5 grupos');
  m.lua(`${N}.plegar:Click()`);
  assert.equal(m.lua(`${N}.arbol:visibles()`), 4, 'plegado: Grupo Base y los 3 de primer nivel');
  m.lua(`${N}.desplegar:Click()`);
  assert.equal(m.lua(`${N}.arbol:visibles()`), 6);
  // Buscar en grupos filtra el árbol.
  m.lua(`${c}:SetText("telas")`);
  assert.equal(m.lua(`${N}.arbol:visibles()`), 2, 'Grupo Base y Telas');
  m.lua(`${c}:SetText("")`);
  assert.equal(m.lua(`${N}.arbol:visibles()`), 6);
  // Ejecutar escaneo de compras: abajo, a lo ancho del árbol, con los grupos seleccionados.
  const e = `${N}.escaneoCompras`;
  assert.equal(m.lua(`${e}.texto:GetText()`), texto(m, 'SUBASTA_NAV_ESCANEO_COMPRAS'));
  assert.equal(m.lua(`${e}.snfApagado`), false, 'hay grupos elegidos');
  assert.equal(colorTexto(m, `${e}.texto`), token(m, 'texto'));
  const eb = caja(m, e);
  cerca(eb.izq, a.izq, 'a lo ancho del árbol (izquierda)');
  cerca(eb.der, a.der, 'a lo ancho del árbol (derecha)');
  cerca(eb.abajo - eb.arriba, 26, '26 px de alto');
  cerca(p.abajo - eb.abajo, 7, 'a 7 px del borde de abajo del panel');
  assert.ok(a.abajo <= eb.arriba, 'el árbol acaba encima del botón');
  assert.deepEqual(tooltip(m, e), ['Grupos seleccionados: 2']);
  // Nada late ni cambia solo.
  assert.equal(m.lua(`${N}.panel:GetScript("OnUpdate")`), undefined);
  sinErrores(m);
});

function stockScan() {
  const m = maquina({ sitio: '{x = 50, y = 50, ancho = 1000, alto = 600}' });
  m.jugador({ dinero: 50000 });
  m.lua(`local s = SnetForever
    assert(s.Arbol.poner("i:2589", "Telas"))
    assert(s.Operaciones.crear("compras", "Reponer tela"))
    assert(s.Operaciones.poner("compras", "Reponer tela", "precioMaximo", "25s"))
    assert(s.Operaciones.poner("compras", "Reponer tela", "reponerCantidad", "5"))
    assert(s.Operaciones.ponerDeGrupo("Telas", "compras", {"Reponer tela"}))
    BANCO.ponerSubasta({mercancias = {[2589] = {
      {unitPrice = 800, quantity = 8}, {unitPrice = 3000, quantity = 5},
    }}})`);
  m.objeto(2589, 2);
  abrir(m);
  assert.equal(m.lua(`${N}.escaneoCompras.snfApagado`), true);
  m.lua(`${filaArbol('Telas')}:Click()`);
  m.lua(`${N}.escaneoCompras:Click()`);
  assert.equal(m.lua(`${N}.shopping:IsVisible()`), true);
  assert.equal(m.lua(`${N}.campo:IsVisible()`), false);
  assert.match(m.lua(`${N}.shopping.status:GetText()`), /Escaneando/);
  for (let i = 0; i < 100 && m.lua('SnetForever.GroupShopping.state().status') !== 'complete'; i++) {
    m.avanzar(0.1);
  }
  assert.equal(m.lua('SnetForever.GroupShopping.state().status'), 'complete');
  return m;
}

test('shopping shows selected operations, blocks over-limit listings and uses the normal quantity confirmation', () => {
  const m = stockScan();
  const eligible = `(function() for _, r in ipairs(${N}.shopping.rows) do
    if r:IsShown() and string.find(r.title:GetText(), "Comprar 3", 1, true) then return r end
  end end)()`;
  const over = `(function() for _, r in ipairs(${N}.shopping.rows) do
    if r:IsShown() and string.find(r.detail:GetText(), "Sobre el máximo", 1, true) then return r end
  end end)()`;
  assert.match(m.lua(`${eligible}.detail:GetText()`), /Telas · Reponer tela/);
  m.lua(`${over}:Click()`);
  assert.equal(m.lua(`${N}.shopping.buy.snfApagado`), true, 'price exceeds the operation limit');
  assert.match(m.lua(`${N}.shopping.summary:GetText()`), /supera el precio máximo/);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined);
  m.lua(`${eligible}:Click()`);
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.Compra.estado().origen'), 'group-shopping');
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 3);
  assert.equal(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase').length, 0);
  m.lua(`${N}.shopping.buy:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  assert.equal(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase').length, 0, 'opening quantity is not a buy');
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()');
  assert.deepEqual(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase'), [[2589, 3]]);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0);
  m.avanzar(0.6);
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()');
  assert.deepEqual(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase'), [[2589, 3]]);
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'hecho');
  assert.match(m.lua(`${N}.shopping.summary:GetText()`), /Comprado/);
  m.lua(`${N}.shopping.close:Click()`);
  assert.equal(m.lua(`${N}.campo:IsVisible()`), true);
  sinErrores(m);
});

test('shopping refuses stale recommendations after the operation price limit changes', () => {
  const m = stockScan();
  m.lua(`SnetForever.Operaciones.poner("compras", "Reponer tela", "precioMaximo", "5s")
    for _, r in ipairs(${N}.shopping.rows) do
      if r:IsShown() and string.find(r.title:GetText(), "Comprar 3", 1, true) then r:Click(); break end
    end`);
  assert.match(m.lua(`${N}.shopping.summary:GetText()`), /oferta cambió/);
  assert.equal(m.lua(`${N}.shopping.buy.snfApagado`), true);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined);
  sinErrores(m);
});

test('large shopping scans keep eight visible row frames and open the correct listing on the next page', () => {
  const m = maquina({ sitio: '{x = 50, y = 50, ancho = 1000, alto = 600}' });
  m.jugador({ dinero: 50000 });
  m.lua(`local s = SnetForever
    assert(s.Arbol.poner("i:4338", "Telas"))
    assert(s.Operaciones.crear("compras", "Tela con tope"))
    assert(s.Operaciones.poner("compras", "Tela con tope", "precioMaximo", "25s"))
    assert(s.Operaciones.ponerDeGrupo("Telas", "compras", {"Tela con tope"}))
    local listings = {}
    for i = 1, 24 do
      listings[i] = {auctionID = 100000 + i, quantity = 1, buyoutAmount = 1000 + i}
    end
    BANCO.ponerSubasta({objetos = {[4338] = listings}})
    local engine, page = s.GroupShopping, s.GroupShopping.page
    engine.state = function() error("Browse must not copy a full scan") end
    engine.page = function(offset, limit)
      assert(engine.summary().status == "complete", "do not read rows while searching")
      assert(limit <= 8, "read at most one page")
      return page(offset, limit)
    end`);
  abrir(m);
  m.lua(`${filaArbol('Telas')}:Click(); ${N}.escaneoCompras:Click()`);
  const results = `${N}.shopping`;
  assert.equal(m.lua(`#${results}.rows`), 0, 'scanning shows progress without creating row frames');
  for (let i = 0; i < 100 && m.lua('SnetForever.GroupShopping.summary().status') !== 'complete'; i++) {
    m.avanzar(0.1);
  }
  assert.equal(m.lua('SnetForever.GroupShopping.summary().count'), 24);
  assert.equal(m.lua(`#${results}.rows`), 8);
  assert.match(m.lua(`${results}.pageText:GetText()`), /1 \/ 3/);
  assert.equal(m.lua(`${results}.rows[1]:GetWidth() > 1`), true);
  m.lua(`${results}.next:Click()`);
  assert.equal(m.lua(`#${results}.rows`), 8);
  assert.match(m.lua(`${results}.pageText:GetText()`), /2 \/ 3/);
  const id = m.lua(`${results}.rows[1].recommendationId`);
  const offer = m.lua(`SnetForever.GroupShopping.result(${id})`);
  assert.equal(offer.price, 1009);
  assert.equal(offer.auctionID, 100009);
  assert.equal(m.lua(`${results}.rows[1].prices:GetText() ==
    SnetForever.L.t("SUBASTA_SHOP_PRICES", SnetForever.Tema.dinero(1009), SnetForever.Tema.dinero(2500))`), true);
  m.lua(`${results}.rows[1]:Click()`);
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.Compra.estado().total'), 1009);
  assert.equal(m.lua('SnetForever.Compra.estado().shoppingId'), id);
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 0, 'selecting a result only checks the listing');
  m.lua(`${results}.previous:Click()`);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'changing pages releases the unconfirmed purchase');
  assert.match(m.lua(`${results}.pageText:GetText()`), /1 \/ 3/);
  sinErrores(m);
});

test('pulsar un grupo lo elige o lo quita y se guarda', () => {
  let m = maquina();
  abrir(m);
  m.lua(`${N}.desplegar:Click()`);
  // Un grupo sin hijos.
  m.lua(`${filaArbol('Telas')}:Click()`);
  assert.deepEqual(elegidos(m), { Telas: true });
  assert.equal(aHex(barra(m, 'Telas').color), token(m, 'nivel1'));
  assert.equal(barra(m, 'Telas').fondo, false);
  m.lua(`${filaArbol('Telas')}:Click()`);
  assert.deepEqual(elegidos(m), {});
  assert.equal(aHex(barra(m, 'Telas').color), token(m, 'secundario'));
  // Un grupo con hijos se elige con todo lo que cuelga de él, y se quita igual.
  m.lua(`${filaArbol('Hierbas')}:Click()`);
  assert.deepEqual(elegidos(m), { Hierbas: true, 'Hierbas`Raras': true, 'Hierbas`Raras`Muy raras': true });
  assert.equal(aHex(barra(m, 'Hierbas`Raras`Muy raras').color), token(m, 'nivel3'));
  m.lua(`${filaArbol('Hierbas`Raras')}:Click()`);
  assert.deepEqual(elegidos(m), { Hierbas: true }, 'quitar uno de dentro quita también lo suyo');
  m.lua(`${filaArbol('Hierbas')}:Click()`);
  assert.deepEqual(elegidos(m), { Hierbas: true, 'Hierbas`Raras': true, 'Hierbas`Raras`Muy raras': true }, 'a medias: pulsarlo completa (ronda 1)');
  m.lua(`${filaArbol('Hierbas')}:Click()`);
  assert.deepEqual(elegidos(m), {}, 'entero: pulsarlo lo quita con lo que cuelga de él');
  // Grupo Base no se elige: pulsarlo no cambia gruposCompra y su barra sigue oscura.
  m.lua(`${filaArbol('Telas')}:Click()`);
  const antesBase = elegidos(m);
  m.lua(`${filaArbol('')}:Click()`);
  assert.deepEqual(elegidos(m), antesBase, 'Grupo Base no se elige ni cambia nada');
  assert.equal(aHex(barra(m, '').color), token(m, 'secundario'), 'y su barra sigue oscura');
  m.lua(`${filaArbol('Telas')}:Click()`);
  // Se guarda: tras recargar sigue igual.
  m.lua(`${filaArbol('Metales')}:Click()`);
  const antes = elegidos(m);
  m = m.recargar();
  m.lua(SUBASTA);
  abrir(m);
  m.lua(`${N}.desplegar:Click()`);
  assert.deepEqual(elegidos(m), antes);
  assert.equal(aHex(barra(m, 'Metales').color), token(m, 'nivel1'));
  assert.equal(aHex(barra(m, 'Hierbas').color), token(m, 'secundario'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Derecha
// ---------------------------------------------------------------------------------------------------

test('derecha: buscador, Buscar, 4 botones (3 apagados con tooltip) y pestañas recientes/favoritas', () => {
  const m = maquina({ sitio: '{x = 50, y = 50, ancho = 1000, alto = 600}' });
  abrir(m);
  const p = caja(m, `${N}.panel`);
  const cab = caja(m, `${M}.cabecera`);
  const ancho = m.lua(`${V}:GetWidth()`);
  // El buscador: campo con lupa y «Buscar» de 72 × 22 a su derecha; 16 px tras el panel, 17 px del borde derecho, 11 px
  // bajo la cabecera.
  const c = `${N}.campo`;
  assert.equal(m.lua(`${c}.marcador:GetText()`), texto(m, 'SUBASTA_NAV_BUSCAR_CASA'));
  assert.equal(m.lua(`${c}.iconoLupa ~= nil`), true, 'con lupa');
  assert.equal(m.lua(`select(2, ${c}.marcador:GetFont())`), 12);
  const cc = caja(m, c);
  const bb = caja(m, `${N}.buscar`);
  assert.equal(m.lua(`${N}.buscar.texto:GetText()`), texto(m, 'SUBASTA_NAV_BUSCAR'));
  assert.equal(m.lua(`${N}.buscar.snfApagado`), false);
  cerca(cc.izq - p.der, 16, '16 px entre el panel y la derecha');
  cerca(cc.arriba - cab.abajo, 11, '11 px bajo la cabecera');
  cerca(cc.abajo - cc.arriba, 22, 'el campo mide 22');
  cerca(bb.der - bb.izq, 72, 'Buscar mide 72');
  cerca(bb.abajo - bb.arriba, 22, 'Buscar mide 22 de alto');
  cerca(ancho - bb.der, 17, 'Buscar a 17 px del borde derecho');
  cerca(bb.izq - cc.der, 8, '8 px entre el campo y Buscar');
  cerca(bb.arriba, cc.arriba, 'a la misma altura');
  // Los 4 botones, en dos filas de 26 px con 8 px entre ellas y entre los de una fila, a lo ancho de la columna.
  const botones = [['avanzada', 'SUBASTA_NAV_AVANZADA'], ['vendedores', 'SUBASTA_NAV_VENDEDORES'], ['desencantar', 'SUBASTA_NAV_DESENCANTAR'], ['ofertas', 'SUBASTA_NAV_OFERTAS']];
  const cajas = {};
  for (const [b, clave] of botones) {
    assert.equal(m.lua(`${N}.${b}.texto:GetText()`), texto(m, clave), b);
    assert.match(m.lua(`(${N}.${b}.texto:GetFont())`), /BarlowSemiCondensed-SemiBold\.ttf$/, `${b}: la letra «boton» del tema (B3r: SemiBold)`);
    assert.equal(m.lua(`select(2, ${N}.${b}.texto:GetFont())`), 14, `${b} a 14 px`);
    cajas[b] = caja(m, `${N}.${b}`);
    cerca(cajas[b].abajo - cajas[b].arriba, 26, `${b} mide 26 de alto`);
  }
  cerca(cajas.avanzada.izq, cc.izq, 'la primera columna empieza con el campo');
  cerca(cajas.vendedores.der, bb.der, 'la segunda acaba con Buscar');
  cerca(cajas.desencantar.izq, cajas.avanzada.izq, 'dos columnas');
  cerca(cajas.ofertas.der, cajas.vendedores.der, 'dos columnas');
  cerca(cajas.vendedores.izq - cajas.avanzada.der, 8, '8 px entre las columnas');
  cerca(cajas.avanzada.der - cajas.avanzada.izq, cajas.vendedores.der - cajas.vendedores.izq, 'del mismo ancho');
  cerca(cajas.avanzada.arriba - cc.abajo, 8, '8 px bajo el buscador');
  cerca(cajas.vendedores.arriba, cajas.avanzada.arriba, 'misma fila');
  cerca(cajas.desencantar.arriba - cajas.avanzada.abajo, 8, '8 px entre las filas');
  cerca(cajas.ofertas.arriba, cajas.desencantar.arriba, 'misma fila');
  for (const key of ["avanzada", "vendedores", "desencantar"]) assert.ok(!m.lua(`${N}.${key}.snfApagado`));
  // Las pestañas, 15 px bajo los botones y a lo ancho de la columna, con Recientes elegida.
  const pe = caja(m, `${N}.pestanas`);
  cerca(pe.arriba - cajas.desencantar.abajo, 15, '15 px bajo los botones');
  cerca(pe.izq, cc.izq, 'a lo ancho (izquierda)');
  cerca(pe.der, bb.der, 'a lo ancho (derecha)');
  assert.deepEqual([1, 2].map((i) => m.lua(`${N}.pestanas.pestanas[${i}].texto:GetText()`)),
    [texto(m, 'SUBASTA_NAV_RECIENTES'), texto(m, 'SUBASTA_NAV_FAVORITAS')]);
  assert.equal(m.lua(`${N}.pestanas:elegida()`), 1);
  // Sin búsquedas: el texto gris.
  assert.deepEqual(lista(m), []);
  assert.equal(m.lua(`${N}.vacio:IsVisible()`), true);
  assert.equal(m.lua(`${N}.vacio:GetText()`), texto(m, 'SUBASTA_NAV_SIN_RECIENTES'));
  assert.equal(texto(m, 'SUBASTA_NAV_SIN_RECIENTES'), 'Aún no has buscado nada');
  assert.equal(colorTexto(m, `${N}.vacio`), token(m, 'apagado'));
  m.lua(`${N}.pestanas.pestanas[2]:Click()`);
  assert.equal(m.lua(`${N}.vacio:GetText()`), texto(m, 'SUBASTA_NAV_SIN_FAVORITAS'));
  // En combate, ni el buscador ni el de grupos se quedan con el teclado.
  m.lua('BANCO.jugador.enCombate = true');
  for (const campo of [`${N}.campo`, `${N}.campoGrupos`]) {
    m.lua(`${campo}:SetFocus()`);
    assert.equal(m.lua(`${campo}:HasFocus()`), false, campo);
  }
  m.lua('BANCO.jugador.enCombate = false');
  m.lua(`${N}.campo:SetFocus()`);
  assert.equal(m.lua(`${N}.campo:HasFocus()`), true, 'fuera de combate sí');
  sinErrores(m);
});

test('Intro o Buscar lanza Busqueda.buscar con el texto y pasa a resultados', () => {
  const m = maquina();
  abrir(m);
  // Sin texto no se busca nada.
  m.lua(`${N}.buscar:Click()`);
  assert.equal(m.lua(`${SV}.pagina()`), 'navegar');
  assert.deepEqual(recientes(m), []);
  // Con el botón.
  m.lua(`${N}.campo:SetText("paño")`);
  m.lua(`${N}.buscar:Click()`);
  assert.deepEqual(recientes(m), ['paño'], 'Busqueda.buscar apunta el texto');
  assert.equal(m.lua('SnetForever.Busqueda.estado()') !== 'parada', true, 'la búsqueda está pedida');
  assert.equal(m.lua(`${SV}.pagina()`), 'resultados', 'pasa a la vista de resultados');
  assert.equal(m.lua(`${M}.paginas.resultados:IsVisible()`), true);
  assert.equal(m.lua(`${M}.paginas.navegar:IsVisible()`), false);
  assert.equal(colorTexto(m, `${M}.pestanas.navegar.texto`), token(m, 'acento'), 'Navegar sigue elegida arriba');
  for (let i = 0; i < 100 && !textos(m).includes('paño'); i++) m.avanzar(0.05);
  assert.ok(textos(m).includes('paño'), `sale la búsqueda: ${JSON.stringify(textos(m))}`);
  // Con Intro.
  m.lua(`${SV}.elegir("navegar")`);
  m.lua(`${N}.campo:SetFocus(); ${N}.campo:SetText("  lino  ")`);
  m.lua(`${N}.campo:GetScript("OnEnterPressed")(${N}.campo)`);
  assert.deepEqual(recientes(m), ['lino', 'paño']);
  assert.equal(m.lua(`${N}.campo:HasFocus()`), false, 'suelta el teclado');
  assert.equal(m.lua(`${SV}.pagina()`), 'resultados');
  // Al cerrar y volver a abrir la subasta, otra vez en Navegar.
  cerrar(m);
  abrir(m);
  assert.equal(m.lua(`${SV}.pagina()`), 'navegar');
  sinErrores(m);
});

test('una búsqueda reciente se vuelve a lanzar con un clic; la ★ la pasa a favoritas', () => {
  const m = maquina({ sitio: '{x = 50, y = 50, ancho = 1000, alto = 600}' });
  abrir(m);
  for (const t of ['paño', 'lino']) {
    m.lua(`${N}.campo:SetText(${aLua(t)})`);
    m.lua(`${N}.buscar:Click()`);
    m.lua(`${SV}.elegir("navegar")`);
  }
  assert.deepEqual(lista(m), ['lino', 'paño'], 'la más nueva arriba');
  assert.equal(m.lua(`${N}.vacio:IsShown()`), false);
  // Las filas: 22 px, una tras otra dentro de la zona que se desplaza (6 px bajo las pestañas), con el texto en «texto».
  const pe = caja(m, `${N}.pestanas`);
  cerca(caja(m, `${N}.zona`).arriba - pe.abajo, 6, 'la lista 6 px bajo las pestañas');
  const f1 = m.lua(`(function() local f = ${filaLista('paño')}; local _, rel, _, _, y = f:GetPoint(1); return {alto = f:GetHeight(), y = y, enZona = rel == ${N}.zona.contenido} end)()`);
  assert.deepEqual(f1, { alto: 22, y: -22, enZona: true }, 'la segunda fila, 22 px bajo la primera');
  assert.equal(colorTexto(m, `${filaLista('lino')}.texto`), token(m, 'texto'));
  // Un clic la vuelve a lanzar (y pasa arriba).
  m.lua(`${filaLista('paño')}:Click()`);
  assert.deepEqual(recientes(m), ['paño', 'lino']);
  assert.equal(m.lua(`${SV}.pagina()`), 'resultados');
  assert.equal(m.lua(`${N}.campo:GetText()`), 'paño', 'el buscador enseña lo buscado');
  m.lua(`${SV}.elegir("navegar")`);
  assert.deepEqual(lista(m), ['paño', 'lino'], 'la lista se repinta al volver');
  // La ★ solo sale con el ratón encima de la fila.
  const f = filaLista('lino');
  assert.equal(m.lua(`${f}.estrella:IsShown()`), false, 'sin ratón no hay ★');
  m.lua(`${f}:GetScript("OnEnter")(${f})`);
  assert.equal(m.lua(`${f}.estrella:IsShown()`), true, 'con el ratón encima sale');
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), [], 'la fila no lleva tooltip');
  m.lua(`${f}.estrella:GetScript("OnEnter")(${f}.estrella)`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), [texto(m, 'SUBASTA_NAV_MARCAR_FAVORITA')]);
  m.lua(`${f}.estrella:Click()`);
  assert.deepEqual(favoritas(m), ['lino'], 'la ★ la marca');
  assert.deepEqual(recientes(m), ['paño', 'lino'], 'marcarla no la busca');
  assert.equal(m.lua(`${SV}.pagina()`), 'navegar');
  assert.equal(colorVertice(m, `${f}.estrella.icono`), 'ffffff', 'marcada, la ★ en su color');
  m.lua(`${f}.estrella:GetScript("OnEnter")(${f}.estrella)`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), [texto(m, 'SUBASTA_NAV_QUITAR_FAVORITA')]);
  m.lua(`${f}:GetScript("OnLeave")(${f})`);
  assert.equal(m.lua(`${f}.estrella:IsShown()`), false, 'al salir se va');
  // En favoritas.
  m.lua(`${N}.pestanas.pestanas[2]:Click()`);
  assert.deepEqual(lista(m), ['lino']);
  const fav = filaLista('lino');
  m.lua(`${fav}:GetScript("OnEnter")(${fav})`);
  m.lua(`${fav}.estrella:Click()`);
  assert.deepEqual(favoritas(m), [], 'la ★ la desmarca');
  assert.deepEqual(lista(m), []);
  assert.equal(m.lua(`${N}.vacio:IsShown()`), true);
  m.lua(`${N}.pestanas.pestanas[1]:Click()`);
  assert.deepEqual(lista(m), ['paño', 'lino']);
  const sinMarcar = filaLista('lino');
  m.lua(`${sinMarcar}:GetScript("OnEnter")(${sinMarcar})`);
  assert.notEqual(colorVertice(m, `${sinMarcar}.estrella.icono`), 'ffffff', 'sin marcar, la ★ apagada');
  // Con 20 recientes (el máximo) hay una fila para cada una y la lista se desplaza con la rueda, con su barra.
  // Se buscan desde fuera (como hará la vista de resultados) con Navegar a la vista: la lista se repinta sola con el aviso
  // de la búsqueda (SNF_COMERCIO_BUSQUEDA, en el fotograma siguiente).
  for (let i = 1; i <= 20; i++) m.lua(`SnetForever.Busqueda.buscar("cosa ${i}")`);
  m.avanzar(0.1);
  const filas = m.lua(`(function() local r = {}; for _, f in ipairs(${N}.filas) do if f:IsVisible() then r[#r + 1] = f.texto:GetText() end end; return r end)()`);
  assert.ok(filas.length >= 20, `todas las filas existen: ${filas.length}`);
  assert.equal(m.lua(`${N}.zona.barra:IsShown()`), true, 'con barra de desplazamiento');
  sinErrores(m);
});

test('grandes ofertas: con precios abre la lista vieja, sin precios queda en gris con su tooltip', () => {
  const sin = maquina();
  abrir(sin);
  const o = `${N}.ofertas`;
  assert.equal(sin.lua(`${o}.snfApagado`), true, 'sin precios, apagado');
  assert.equal(colorTexto(sin, `${o}.texto`), token(sin, 'apagado'), 'en gris');
  assert.deepEqual(tooltip(sin, o), [texto(sin, 'SUBASTA_NAV_SIN_PRECIOS')]);
  sin.lua(`${o}:Click()`);
  assert.equal(sin.lua(`${SV}.pagina()`), 'navegar');
  sinErrores(sin);

  const con = maquina({ precios: true });
  abrir(con);
  assert.equal(con.lua(`${o}.snfApagado`), false, 'con precios, encendido');
  assert.equal(colorTexto(con, `${o}.texto`), token(con, 'texto'));
  assert.deepEqual(tooltip(con, o), [], 'encendido no lleva el tooltip de falta');
  con.lua(`${o}:Click()`);
  assert.equal(con.lua(`${SV}.pagina()`), 'ofertas', 'abre la lista vieja');
  assert.equal(con.lua(`${V}.cuerpo:IsVisible()`), true);
  assert.deepEqual(con.lua('{SnetForever.UIComercio.tabla():orden()}'), ['pct', true], 'ordenada por %, de menor a mayor');
  sinErrores(con);
});

// ---------------------------------------------------------------------------------------------------
// Cabe
// ---------------------------------------------------------------------------------------------------

test('todo cabe en es y en (margen 0,85) con la ventana al mínimo (830 × 500)', () => {
  for (const idioma of ['es', 'en']) {
    for (const escala of [0.64, 1]) {
      const m = maquina({ idioma, escala, sitio: '{x = 50, y = 50, ancho = 800, alto = 450}' });
      abrir(m);
      for (const t of ['paño de lino', 'una búsqueda bastante larga']) m.lua(`SnetForever.Busqueda.buscar(${aLua(t)})`);
      m.avanzar(0.1);
      assert.equal(m.lua(`${N}.filas[2]:IsVisible()`), true, 'con dos búsquedas en la lista');
      const r = m.lua(`(function()
        local N, V = ${N}, ${V}
        local function cabe(b, fs)
          fs = fs or b.texto
          return fs:GetUnboundedStringWidth() <= (b:GetWidth() - 2 * 4) * 0.85
        end
        local r = {ancho = V:GetWidth(), alto = V:GetHeight(), malos = {}}
        for _, n in ipairs({"buscar", "avanzada", "vendedores", "desencantar", "ofertas", "escaneoCompras"}) do
          if not cabe(N[n]) then r.malos[#r.malos + 1] = n .. " " .. N[n].texto:GetUnboundedStringWidth() .. "/" .. N[n]:GetWidth() end
        end
        for i = 1, 2 do
          local b = N.pestanas.pestanas[i]
          if not cabe(b) then r.malos[#r.malos + 1] = "pestaña " .. i end
        end
        for _, c in ipairs({N.campo, N.campoGrupos}) do
          local libre = c:GetWidth() - 8 - 16 - 8
          if c.marcador:GetUnboundedStringWidth() > libre * 0.85 then r.malos[#r.malos + 1] = "marcador " .. c.marcador:GetText() end
        end
        if N.vacio:GetUnboundedStringWidth() > N.zona:GetWidth() * 0.85 then r.malos[#r.malos + 1] = "vacío" end
        -- Todo dentro de la ventana, y la izquierda sin pisar la derecha.
        local dentro = true
        for _, x in ipairs({N.panel, N.campo, N.buscar, N.ofertas, N.vendedores, N.pestanas, N.zona, N.escaneoCompras, N.arbol}) do
          if x:GetLeft() < V:GetLeft() - 0.01 or x:GetRight() > V:GetRight() + 0.01 or x:GetBottom() < V:GetBottom() - 0.01 then
            dentro = false
          end
        end
        r.dentro = dentro
        r.separados = N.panel:GetRight() < N.campo:GetLeft() and N.panel:GetRight() < N.avanzada:GetLeft()
        r.zonaAlto = N.zona:GetHeight()
        r.arbolAlto = N.arbol:GetHeight()
        return r
      end)()`);
      assert.equal(Math.round(r.ancho), 830, `${idioma}: al mínimo de ancho`);
      assert.equal(Math.round(r.alto), 500, `${idioma}: al mínimo de alto`);
      assert.deepEqual(r.malos, [], `${idioma} a ${escala}: textos que no caben`);
      assert.equal(r.dentro, true, `${idioma} a ${escala}: todo dentro de la ventana`);
      assert.equal(r.separados, true, `${idioma}: la izquierda no pisa la derecha`);
      assert.ok(r.zonaAlto >= 5 * 22, `${idioma}: caben al menos 5 búsquedas (${r.zonaAlto})`);
      assert.ok(r.arbolAlto >= 10 * 22, `${idioma}: caben al menos 10 grupos (${r.arbolAlto})`);
      // Las filas de la lista y del árbol no se salen de su caja.
      const filas = m.lua(`(function() local ok = true; for _, f in ipairs(${N}.filas) do if f:IsShown() and f.texto:GetUnboundedStringWidth() > f:GetWidth() * 0.85 then ok = false end end; return ok end)()`);
      assert.equal(filas, true, `${idioma}: las búsquedas caben en su fila`);
      // Ronda 1 de B4r: los 4 botones de búsqueda caben con la letra de verdad (Montserrat Medium de 14 px, con el ancho
      // medio por letra de la tabla), a 0,95 del sitio libre entre los 8 px de cada lado.
      const botones = m.lua(`(function()
        local r = {}
        for _, n in ipairs({"avanzada", "vendedores", "desencantar", "ofertas"}) do
          local b = ${N}[n]
          r[#r + 1] = {nombre = n, texto = b.texto:GetText(), tam = select(2, b.texto:GetFont()), libre = b:GetWidth() - 2 * 8}
        end
        return r
      end)()`);
      for (const b of botones) {
        const real = [...b.texto].length * b.tam * 0.5715;
        assert.ok(real <= b.libre * 0.95, `${idioma}: «${b.texto}» cabe: ${real.toFixed(1)} de ${b.libre}`);
      }
      sinErrores(m);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1 de arreglos
// ---------------------------------------------------------------------------------------------------

// La elección del escaneo de compras sigue al grupo, como las reglas y las operaciones (comercio/arbol.lua).
test('ronda 1: gruposCompra se mueve al renombrar y al mover, va a la papelera al borrar y vuelve al recuperar', () => {
  const m = maquina();
  abrir(m);
  m.lua(`${N}.desplegar:Click()`);
  m.lua(`${filaArbol('Hierbas')}:Click()`); // Hierbas con Raras y Muy raras
  m.lua(`${filaArbol('Telas')}:Click()`);
  const A = 'SnetForever.Arbol';
  // Renombrar: Hierbas pasa a Plantas con sus subgrupos.
  assert.equal(m.lua(`${A}.renombrar("Hierbas", "Plantas")`), 'Plantas');
  assert.deepEqual(elegidos(m), { Plantas: true, 'Plantas`Raras': true, 'Plantas`Raras`Muy raras': true, Telas: true });
  // Un grupo nuevo con el nombre viejo no sale elegido.
  assert.equal(m.lua(`${A}.crear("", "Hierbas")`), 'Hierbas');
  assert.equal(elegidos(m).Hierbas, undefined, 'el Hierbas nuevo no está elegido');
  m.lua(`${N}.arbol:refrescar()`);
  assert.equal(aHex(barra(m, 'Hierbas').color), token(m, 'secundario'), 'y sale sin elegir');
  assert.equal(aHex(barra(m, 'Plantas').color), token(m, 'nivel1'), 'Plantas sale elegido');
  // Mover: Raras pasa dentro de Telas.
  assert.equal(m.lua(`${A}.mover("Plantas\`Raras", "Telas")`), 'Telas`Raras');
  assert.deepEqual(elegidos(m), { Plantas: true, 'Telas`Raras': true, 'Telas`Raras`Muy raras': true, Telas: true });
  // Borrar: la elección va con el grupo a la papelera.
  assert.equal(m.lua(`${A}.borrar("Telas")`), true);
  assert.deepEqual(elegidos(m), { Plantas: true });
  assert.equal(m.lua(`${A}.crear("", "Telas")`), 'Telas');
  assert.equal(elegidos(m).Telas, undefined, 'un Telas nuevo no hereda la elección del borrado');
  // Recuperar: vuelve (con el nombre libre, porque Telas está ocupado).
  const [ok, destino] = m.lua(`{${A}.recuperar("Telas")}`);
  assert.equal(ok, true);
  assert.equal(destino, 'Telas 2');
  assert.deepEqual(elegidos(m), { Plantas: true, 'Telas 2': true, 'Telas 2`Raras': true, 'Telas 2`Raras`Muy raras': true });
  // Sin nada elegido no se crea gruposCompra al mover o borrar.
  const n = maquina();
  n.lua('SnetForever.Arbol.renombrar("Hierbas", "Plantas"); SnetForever.Arbol.borrar("Telas"); SnetForever.Arbol.recuperar("Telas")');
  assert.equal(n.lua('SnetForeverCuenta.comercio.gruposCompra'), undefined);
  sinErrores(m);
  sinErrores(n);
});

test('ronda 1: la ★ compara como la búsqueda (paño favorita y PAÑO buscada)', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.Busqueda.marcarFavorita("paño", true)');
  assert.equal(m.lua('SnetForever.Busqueda.esFavorita("PAÑO")'), true);
  assert.equal(m.lua('SnetForever.Busqueda.esFavorita("  Paño ")'), true);
  assert.equal(m.lua('SnetForever.Busqueda.esFavorita("lino")'), false);
  assert.equal(m.lua('SnetForever.Busqueda.esFavorita("")'), false);
  m.lua(`${N}.campo:SetText("PAÑO")`);
  m.lua(`${N}.buscar:Click()`);
  m.lua(`${SV}.elegir("navegar")`);
  const f = filaLista('PAÑO');
  m.lua(`${f}:GetScript("OnEnter")(${f})`);
  assert.equal(colorVertice(m, `${f}.estrella.icono`), 'ffffff', 'PAÑO sale marcada');
  m.lua(`${f}.estrella:Click()`);
  assert.deepEqual(favoritas(m), [], 'y la ★ la desmarca');
  sinErrores(m);
});

test('ronda 1: pulsar un padre a medio elegir completa la elección; entero, lo quita', () => {
  const m = maquina();
  abrir(m);
  m.lua(`${N}.desplegar:Click()`);
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.gruposCompra = {["Hierbas"] = true, ["Hierbas`Raras`Muy raras"] = true}');
  m.lua(`${filaArbol('Hierbas')}:Click()`);
  assert.deepEqual(elegidos(m), { Hierbas: true, 'Hierbas`Raras': true, 'Hierbas`Raras`Muy raras': true }, 'completa');
  m.lua(`${filaArbol('Hierbas')}:Click()`);
  assert.deepEqual(elegidos(m), {}, 'entero: lo quita');
  // Sin elegir él pero con un hijo elegido también completa.
  m.lua('SnetForeverCuenta.comercio.gruposCompra = {["Hierbas`Raras"] = true}');
  m.lua(`${filaArbol('Hierbas')}:Click()`);
  assert.deepEqual(elegidos(m), { Hierbas: true, 'Hierbas`Raras': true, 'Hierbas`Raras`Muy raras': true });
  sinErrores(m);
});

test('ronda 1: grandes ofertas abre la lista por % de menos a más aunque hubiera otro orden guardado', () => {
  const m = maquina({ precios: true });
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ordenLista = {clave = "cantidad", asc = false}');
  abrir(m);
  m.lua(`${N}.ofertas:Click()`);
  assert.equal(m.lua(`${SV}.pagina()`), 'ofertas');
  assert.deepEqual(m.lua('{SnetForever.UIComercio.tabla():orden()}'), ['pct', true]);
  m.avanzar(1);
  assert.deepEqual(m.lua('{SnetForever.UIComercio.tabla():orden()}'), ['pct', true], 'y se queda así al repintar');
  sinErrores(m);
});

test('ronda 1: al entrar en combate los dos campos sueltan el foco', () => {
  const m = maquina();
  abrir(m);
  for (const campo of [`${N}.campo`, `${N}.campoGrupos`]) {
    m.lua(`${campo}:SetFocus()`);
    assert.equal(m.lua(`${campo}:HasFocus()`), true);
    m.lua('BANCO.jugador.enCombate = true');
    m.disparar('PLAYER_REGEN_DISABLED');
    assert.equal(m.lua(`${campo}:HasFocus()`), false, `${campo} suelta el foco`);
    m.lua('BANCO.jugador.enCombate = false');
    m.disparar('PLAYER_REGEN_ENABLED');
  }
  sinErrores(m);
});

test('ronda 1: con la página escondida la lista no se repinta; al volver, sí', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.Busqueda.buscar("paño")');
  m.avanzar(0.1);
  assert.deepEqual(lista(m), ['paño']);
  m.lua(`${M}.pestanas.sniper:Click()`);
  m.lua('_G.PINTADAS = 0; local f = SnetForever.SubastaNavegar.marcos.zona.ponerAlto; SnetForever.SubastaNavegar.marcos.zona.ponerAlto = function(...) _G.PINTADAS = _G.PINTADAS + 1; return f(...) end');
  m.lua('SnetForever.Busqueda.buscar("lino")');
  m.avanzar(0.1);
  assert.equal(m.lua('_G.PINTADAS'), 0, 'escondida no se repinta');
  assert.deepEqual(lista(m), ['paño'], 'sigue la lista de antes');
  m.lua(`${M}.pestanas.navegar:Click()`);
  assert.deepEqual(lista(m), ['lino', 'paño'], 'al volver, la nueva');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B4r: retoques de la captura B1
// ---------------------------------------------------------------------------------------------------

// Ancho medio por letra de Montserrat Medium (el de subasta-ventana.test.js, medido con PIL en recursos/letras): el banco
// cuenta medio tamaño por letra y se queda corto. En el juego, «Ejecutar escaneo de compras» a 14 px se partía en dos líneas
// (captura b1-navegar-recorte.png: la primera línea mide 150 px y la segunda 63, unos 220 de 221 libres).
// B3r: la letra «boton» del tema es Montserrat SemiBold (antes Medium, 0,5715).
const FACTOR_MEDIUM = 0.5820;

test('B4r: «Ejecutar escaneo de compras» va en una sola línea a lo ancho del panel, con la letra justa para que quepa en es y en', () => {
  for (const idioma of ['es', 'en']) {
    const m = maquina({ idioma, sitio: '{x = 50, y = 50, ancho = 1000, alto = 600}' });
    abrir(m);
    const e = `${N}.escaneoCompras`;
    const r = m.lua(`(function()
      local e = ${e}
      local _, tam = e.texto:GetFont()
      return {texto = e.texto:GetText(), tam = tam, partir = e.texto:GetWordWrap(), libre = e.texto:GetRight() - e.texto:GetLeft(),
        ancho = e:GetWidth(), fuente = (e.texto:GetFont())}
    end)()`);
    assert.equal(r.partir, false, `${idioma}: el texto nunca se parte`);
    assert.match(r.fuente, /BarlowSemiCondensed-SemiBold\.ttf$/);
    assert.equal(r.ancho, 251 - 2 * 7, `${idioma}: a lo ancho de la columna (el panel menos 7 px a cada lado)`);
    const letras = [...r.texto].length;
    const real = letras * r.tam * FACTOR_MEDIUM;
    assert.ok(real <= r.libre * 0.95, `${idioma}: cabe en una línea con letra de verdad: ${real.toFixed(1)} de ${r.libre} a ${r.tam} px`);
    assert.ok(r.tam >= 12 && r.tam <= 14, `${idioma}: letra entre 12 y 14 (${r.tam})`);
    // Lo justo: con 1 px más, el texto en español ya no cabría (o ya está en los 14 px de los otros botones).
    if (idioma === 'es' && r.tam < 14) {
      assert.ok(letras * (r.tam + 1) * FACTOR_MEDIUM > r.libre * 0.95, `es: a ${r.tam + 1} px ya no cabría`);
    }
    sinErrores(m);
  }
});

test('B4r: «Ejecutar escaneo de compras» apagado se lee mejor (textoPestana) y no cambia de color solo', () => {
  const m = maquina({ sitio: '{x = 50, y = 50, ancho = 1000, alto = 600}' });
  abrir(m);
  const e = `${N}.escaneoCompras`;
  assert.equal(m.lua(`${e}.snfApagado`), true);
  assert.equal(colorTexto(m, `${e}.texto`), token(m, 'textoPestana'), 'apagado: más claro que «apagado»');
  assert.notEqual(token(m, 'textoPestana'), token(m, 'apagado'));
  // Encendido (cuando llegue Compras) va en «texto»; al apagarlo otra vez, vuelve a textoPestana.
  m.lua(`${e}:ponerApagado(false)`);
  assert.equal(colorTexto(m, `${e}.texto`), token(m, 'texto'));
  m.lua(`${e}:ponerApagado(true)`);
  assert.equal(colorTexto(m, `${e}.texto`), token(m, 'textoPestana'));
  // El ratón encima no lo cambia, y nada late.
  m.lua(`${e}:GetScript("OnEnter")(${e})`);
  assert.equal(colorTexto(m, `${e}.texto`), token(m, 'textoPestana'));
  m.lua(`${e}:GetScript("OnLeave")(${e})`);
  assert.equal(m.lua(`${e}:GetScript("OnUpdate")`), undefined);
  // Los otros botones apagados siguen con el apagado común.
  assert.ok(!m.lua(`${N}.desencantar.snfApagado`));
  sinErrores(m);
});

test('B4r: el fondo oscuro del árbol llega hasta 8 px encima del botón, con pocas filas, al desplegar, plegar y filtrar', () => {
  const m = maquina({ sitio: '{x = 50, y = 50, ancho = 1000, alto = 600}' });
  abrir(m);
  const ver = () => m.lua(`(function()
    local a, t, e = ${N}.arbol, ${N}.arbol.relleno, ${N}.escaneoCompras
    return {visible = t:IsVisible(), filas = a:visibles(), arriba = a:GetTop() - t:GetTop(), hastaBoton = t:GetBottom() - e:GetTop(),
      izq = t:GetLeft() - a:GetLeft(), der = a:GetRight() - t:GetRight(), color = {t:GetVertexColor()}}
  end)()`);
  const casos = [];
  casos.push(['al abrir', ver(), 4]);
  m.lua(`${N}.desplegar:Click()`);
  casos.push(['desplegado', ver(), 6]);
  m.lua(`${N}.plegar:Click()`);
  casos.push(['plegado', ver(), 4]);
  m.lua(`${N}.campoGrupos:SetText("telas")`);
  casos.push(['filtrado', ver(), 2]);
  for (const [nombre, v, filas] of casos) {
    assert.equal(v.visible, true, `${nombre}: se ve`);
    assert.equal(v.filas, filas, nombre);
    cerca(v.arriba, filas * 22, `${nombre}: empieza justo bajo la última fila`);
    cerca(v.hastaBoton, 8, `${nombre}: llega hasta HUECO_ESCANEO (8 px) encima del botón`);
    cerca(v.izq, 0, `${nombre}: de lado a lado del árbol`);
    cerca(v.der, 0, `${nombre}: de lado a lado del árbol`);
    assert.equal(aHex(v.color), token(m, 'hundido'), `${nombre}: el oscuro de las filas`);
  }
  sinErrores(m);
});

test('B4r: desplegar y plegar todo son botoncitos cuadrados con borde, icono propio dentro, tooltip y realce suave', () => {
  const m = maquina({ sitio: '{x = 50, y = 50, ancho = 1000, alto = 600}' });
  abrir(m);
  const cg = caja(m, `${N}.campoGrupos`);
  const p = caja(m, `${N}.panel`);
  for (const [b, clave, icono] of [['desplegar', 'SUBASTA_NAV_DESPLEGAR', 'abierto'], ['plegar', 'SUBASTA_NAV_PLEGAR', 'cerrado']]) {
    const x = `${N}.${b}`;
    const r = m.lua(`(function()
      local b = ${x}
      local atlas = CreateFrame("Frame", nil, UIParent):CreateTexture()
      SnetForever.Tema.icono(atlas, ${aLua(icono)})
      local dentro = b.icono:GetLeft() >= b:GetLeft() + 1 and b.icono:GetRight() <= b:GetRight() - 1
        and b.icono:GetBottom() >= b:GetBottom() + 1 and b.icono:GetTop() <= b:GetTop() - 1
      local borde = {}
      for _, t in ipairs(b.bordes or {}) do borde[#borde + 1] = {t:GetVertexColor()} end
      b:GetScript("OnEnter")(b)
      local encima = b.bordes and {b.bordes[1]:GetVertexColor()} or {0, 0, 0}
      b:GetScript("OnLeave")(b)
      local fuera = b.bordes and {b.bordes[1]:GetVertexColor()} or {0, 0, 0}
      return {ancho = b:GetWidth(), alto = b:GetHeight(), borde = borde, dentro = dentro, coords = {b.icono:GetTexCoord()},
        esperadas = {atlas:GetTexCoord()}, encima = encima, fuera = fuera, latido = b:GetScript("OnUpdate") ~= nil}
    end)()`);
    assert.equal(r.ancho, r.alto, `${b}: cuadrado`);
    assert.ok(r.alto >= 14 && r.alto <= 22, `${b}: del alto del campo (22) o algo menos: ${r.alto}`);
    assert.equal(r.borde.length, 4, `${b}: con borde`);
    for (const c of r.borde) assert.equal(aHex(c), token(m, 'borde'), `${b}: borde del color «borde»`);
    assert.equal(r.dentro, true, `${b}: el icono va dentro del cuadrado`);
    assert.deepEqual(r.coords, r.esperadas, `${b}: el triángulo de nuestro atlas (${icono})`);
    assert.notEqual(aHex(r.encima), token(m, 'borde'), `${b}: realce al pasar el ratón`);
    assert.equal(aHex(r.fuera), token(m, 'borde'), `${b}: al salir vuelve`);
    assert.equal(r.latido, false, `${b}: nada late`);
    assert.deepEqual(tooltip(m, x), [texto(m, clave)], `${b}: tooltip`);
    const bb = caja(m, x);
    assert.ok(bb.izq > cg.der && bb.der <= p.der, `${b} entre el campo y el borde del panel`);
    cerca((bb.arriba + bb.abajo) / 2, (cg.arriba + cg.abajo) / 2, `${b} centrado con el campo`);
  }
  // Los centros donde estaban las flechas (los de TSM: a 26 y 52 px del borde derecho del panel).
  const d = caja(m, `${N}.desplegar`);
  const pl = caja(m, `${N}.plegar`);
  cerca(p.der - (pl.izq + pl.der) / 2, 26, 'plegar a 26 px del borde del panel');
  cerca(p.der - (d.izq + d.der) / 2, 52, 'desplegar a 52 px del borde del panel');
  // Siguen desplegando y plegando.
  m.lua(`${N}.desplegar:Click()`);
  assert.equal(m.lua(`${N}.arbol:visibles()`), 6);
  m.lua(`${N}.plegar:Click()`);
  assert.equal(m.lua(`${N}.arbol:visibles()`), 4);
  sinErrores(m);
});
