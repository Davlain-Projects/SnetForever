// Subasta, parte 3, bloque B, Task B5: la vista de resultados de la búsqueda (SnetForever.SubastaResultados,
// ui/subasta/resultados.lua). Fila 2 con «‹ Salir del escaneo», el campo con el texto buscado y «Volver a escanear»; la
// tabla con una fila por objeto (ordenada por Compra) que se despliega en sus subastas al pulsarla; abajo la barra de
// estado de la búsqueda y el botón Comprar, que usa SNF.Compra con el clic del jugador y nunca en combate.
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
const R = 'SnetForever.SubastaResultados.marcos';
const T = `${R}.tabla`;
const V = 'SnetForever.UIComercio.marco()';
const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}; AuctionHouseFrame:EnableMouse(true); ';

// Precios de la app (como en subasta-navegar.test.js), con el valor de mercado (normal, el tercero) que se quiera.
const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
function ponerRanura(dir, normales) {
  const i = (H % 8) + 1;
  const nombre = `SnetForever_P${String(i).padStart(2, '0')}`;
  const carpeta = join(dir, nombre);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n');
  const filas = Object.entries(normales).map(([item, normal]) => `[${item}] = {${normal}, 400, ${normal}, 0, 0.42, 85, 0}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true}
`);
}

const NAVEGAR = [
  '{itemID = 4306, totalQuantity = 3, minPrice = 4500}',
  '{itemID = 2592, totalQuantity = 7, minPrice = 300}',
  '{itemID = 2589, totalQuantity = 20, minPrice = 120}',
];

function maquina({ idioma = 'es', precios = null, sitio = '{x = 50, y = 50, ancho = 1000, alto = 600}', escala, navegar = NAVEGAR, porPagina = 50 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-subasta-resultados-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  if (precios) ponerRanura(dir, precios);
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' }, previo: SUBASTA });
  if (precios) m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua(`SnetForever.Ajustes.set("idioma", ${aLua(idioma)})`);
  if (escala) m.lua(`UIParent:SetScale(${escala})`);
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, nivel: 5 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1, nivel: 15 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 2, nivel: 25 });
  m.lua(`BANCO.ponerSubasta({navegar = {${navegar.join(', ')}}, porPagina = ${porPagina}})`);
  // B3r: la vista lee sola las subastas de cada objeto. En el servidor de verdad toda fila de la búsqueda tiene subastas:
  // si la prueba no le ha puesto ninguna a un objeto (ni mercancía ni objeto suelto) cuando se pide, se le pone una
  // mercancía con lo de su fila de navegar (su cantidad a su precio mínimo), una sola vez. Si después la prueba le pone sus
  // propias subastas de objeto suelto, esa mercancía se quita.
  m.lua(`local A, rellenos = C_AuctionHouse, {}
    local original = A.SendSearchQuery
    A.SendSearchQuery = function(k, ...)
      local S, id = BANCO.subasta, type(k) == "table" and k.itemID
      if id and rellenos[id] and S.objetos[id] and S.mercancias[id] == rellenos[id] then
        S.mercancias[id] = nil
      elseif id and not rellenos[id] and not S.mercancias[id] and not S.objetos[id] then
        rellenos[id] = {}
        for _, f in ipairs(S.navegar) do
          if (f.itemID or (f.itemKey and f.itemKey.itemID)) == id then
            rellenos[id] = {{quantity = f.totalQuantity or 1, unitPrice = f.minPrice}}
            S.mercancias[id] = rellenos[id]
            break
          end
        end
      end
      return original(k, ...)
    end`);
  m.lua('BANCO.jugador.dinero = 10000000');
  if (sitio) m.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = ${sitio}`);
  return m;
}
const abrir = (m) => { m.disparar('AUCTION_HOUSE_SHOW'); m.avanzar(0.05); };
const texto = (m, clave, ...args) => m.lua(`SnetForever.L.t(${[clave, ...args].map(aLua).join(', ')})`);
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const colorTexto = (m, expr) => aHex(m.lua(`{${expr}:GetTextColor()}`));
const colorVertice = (m, expr) => aHex(m.lua(`{${expr}:GetVertexColor()}`));
const token = (m, nombre) => aHex(m.lua(`SnetForever.Tema.color(${aLua(nombre)})`));
const comercio = (m, nombre) => aHex(m.lua(`SnetForever.Estilo.comercio(${aLua(nombre)})`));
const dinero = (m, c) => m.lua(`SnetForever.Tema.dinero(${c})`);
const estado = (m) => m.lua('SnetForever.Busqueda.estado()');
const textos = (m) => m.llamadas('C_AuctionHouse.SendBrowseQuery').map((a) => a[0].searchString);
const pedidas = (m) => m.llamadas('C_AuctionHouse.SendSearchQuery');
const compras = (m) => ['PlaceBid', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase'].reduce((n, api) => n + m.llamadas(`C_AuctionHouse.${api}`).length, 0);
function hasta(m, cond, max = 400) {
  for (let i = 0; i < max && !cond(); i++) m.avanzar(0.05);
  return cond();
}
// Busca desde Navegar (como el jugador) y espera a que acabe.
function buscar(m, t = 'paño') {
  m.lua(`${N}.campo:SetText(${aLua(t)}); ${N}.buscar:Click()`);
  assert.equal(m.lua(`${SV}.pagina()`), 'resultados');
  assert.ok(hasta(m, () => estado(m) === 'completa'), 'la búsqueda acaba');
  m.avanzar(0.05); // el aviso de la búsqueda llega en el fotograma siguiente
}
// B3r: tras buscar, la vista lee sola las subastas de cada objeto (una SendSearchQuery por objeto). Las pruebas de antes que
// cuentan las peticiones de desplegar o de la compra la pausan antes con ⏯ (como el jugador) y dejan llegar la que iba en
// camino; las que miran la tabla acabada esperan a que acabe de leer.
function pausarLectura(m) {
  if (estado(m) === 'completa' && m.lua('SnetForever.Busqueda.leyendo()')) m.lua(`${R}.pausa:Click()`);
  m.avanzar(0.1);
}
const leidas = (m) => m.lua(`(function()
  for _, h in ipairs(${T}.huecos) do
    local f = h:IsShown() and h.fila
    if f and not f.subasta and not f.aviso and f.esperando then return false end
  end
  return not SnetForever.Busqueda.leyendo()
end)()`);
function hastaLeidas(m) {
  assert.ok(hasta(m, () => leidas(m), 400), 'acaba de leer los objetos');
  m.avanzar(0.05);
}
// Lo que enseña el hueco i de la tabla (nil si no se ve).
const hueco = (m, i) => m.lua(`(function()
  local h = ${T}.huecos[${i}]
  if not h or not h:IsShown() then return nil end
  local c = h.celdas
  return {objeto = c.objeto:GetText(), nivel = c.nivel:GetText(), cantidad = c.cantidad:GetText(), compra = c.compra:GetText(),
    pct = c.pct:GetText(), tiempo = c.tiempo:GetText(), vendedor = c.vendedor:GetText(), puja = c.puja:GetText(),
    icono = h.snfIcono and h.snfIcono:IsShown() or false, clave = h.fila and h.fila.clave}
end)()`);
const visibles = (m) => m.lua(`(function() local n = 0 for _, h in ipairs(${T}.huecos) do if h:IsShown() then n = n + 1 end end return n end)()`);
// El hueco que enseña el objeto con ese nombre.
const huecoDe = (m, nombre) => m.lua(`(function() for i, h in ipairs(${T}.huecos) do if h:IsShown() and h.celdas.objeto:GetText() == ${aLua(nombre)} then return i end end end)()`);
const caja = (m, expr) => m.lua(`(function()
  local v = ${V}
  local x = ${expr}
  return {izq = x:GetLeft() - v:GetLeft(), der = x:GetRight() - v:GetLeft(), arriba = v:GetTop() - x:GetTop(), abajo = v:GetTop() - x:GetBottom()}
end)()`);
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.51, `${msg}: ${a} y no ${b}`);

// Subastas de prueba: lino (mercancía) y seda (objeto suelto), con su vendedor (owners, como en el cliente).
const SUBASTAS = `BANCO.ponerSubasta({
  mercancias = {[2589] = {{quantity = 5, unitPrice = 120, timeLeftSeconds = 3600}, {quantity = 15, unitPrice = 150}}},
  objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000, bidAmount = 4000, timeLeftSeconds = 7200}, {quantity = 2, buyoutAmount = 4500, timeLeft = 1}}},
})
local A = C_AuctionHouse
local mercancia, objeto = A.GetCommoditySearchResultInfo, A.GetItemSearchResultInfo
A.GetCommoditySearchResultInfo = function(...) local r = mercancia(...) if r then r.owners = {"Fulano"} end return r end
A.GetItemSearchResultInfo = function(...) local r = objeto(...) if r then r.owners = {"Mengano"} end return r end`;

// ---------------------------------------------------------------------------------------------------

test('tras buscar sale la fila 2 con Salir del escaneo, el campo con el texto y Volver a escanear', () => {
  const m = maquina();
  abrir(m);
  buscar(m, 'paño');
  assert.equal(m.lua(`${M}.paginas.resultados:IsVisible()`), true);
  assert.equal(m.lua(`${R}.pagina == ${M}.paginas.resultados`), true, 'es la página «resultados» de la ventana');
  // «‹ Salir del escaneo» en acento, a la izquierda.
  assert.equal(m.lua(`${R}.salir:IsVisible()`), true);
  assert.equal(m.lua(`${R}.salir.texto:GetText()`), texto(m, 'SUBASTA_RES_SALIR'));
  assert.equal(colorTexto(m, `${R}.salir.texto`), token(m, 'acento'));
  // El campo con lupa, el texto buscado y su X.
  assert.equal(m.lua(`${R}.campo:GetText()`), 'paño');
  assert.equal(m.lua(`${R}.campo.iconoLupa ~= nil`), true, 'con lupa');
  assert.equal(m.lua(`${R}.borrar:IsVisible()`), true, 'con su X');
  // «Volver a escanear», a la derecha.
  assert.equal(m.lua(`${R}.volver.texto:GetText()`), texto(m, 'SUBASTA_RES_VOLVER'));
  // Todo en una fila, de lado a lado: salir a 12 px del borde, volver a 12 px del otro y el campo en medio, a lo ancho.
  const ancho = m.lua(`${V}:GetWidth()`);
  const s = caja(m, `${R}.salir`);
  const c = caja(m, `${R}.campo`);
  const v = caja(m, `${R}.volver`);
  cerca(s.izq, 12, 'Salir a 12 px del borde');
  cerca(ancho - v.der, 12, 'Volver a 12 px del borde');
  assert.ok(c.izq > s.der && c.der < v.izq, `el campo entre los dos: ${JSON.stringify({ s, c, v })}`);
  assert.ok(c.der - c.izq > ancho / 2, 'el campo ocupa casi todo el ancho');
  cerca(c.abajo - c.arriba, 22, 'el campo mide 22');
  cerca((s.arriba + s.abajo) / 2, (c.arriba + c.abajo) / 2, 'Salir a la altura del campo');
  cerca((v.arriba + v.abajo) / 2, (c.arriba + c.abajo) / 2, 'Volver a la altura del campo');
  const cab = caja(m, `${M}.cabecera`);
  assert.ok(c.arriba > cab.abajo && c.arriba - cab.abajo <= 12, 'la fila 2 justo bajo la cabecera');
  // La X borra el campo (y no busca).
  const antes = textos(m).length;
  m.lua(`${R}.borrar:Click()`);
  assert.equal(m.lua(`${R}.campo:GetText()`), '');
  m.avanzar(0.2);
  assert.equal(textos(m).length, antes, 'borrar no busca');
  assert.equal(m.lua(`${R}.pagina:GetScript("OnUpdate")`), undefined, 'nada late');
  sinErrores(m);
});

test('la tabla enseña una fila por objeto con nivel, disponible, compra y %, ordenada por compra', () => {
  const m = maquina({ precios: { 2589: 200, 2592: 300 } });
  abrir(m);
  buscar(m, 'paño');
  // Cabeceras.
  const cab = (clave) => m.lua(`${T}.cabeceras.${clave}.texto:GetText()`);
  assert.equal(cab('objeto'), texto(m, 'COMERCIO_COL_OBJETO'));
  assert.equal(cab('nivel'), texto(m, 'SUBASTA_RES_COL_NIVEL'));
  assert.equal(cab('cantidad'), texto(m, 'SUBASTA_RES_COL_CTD')); // B6r: «Ctd», como TSM
  assert.equal(cab('compra'), texto(m, 'SUBASTA_RES_COL_COMPRA'));
  assert.equal(cab('pct'), texto(m, 'COMERCIO_COL_PCT'));
  assert.equal(visibles(m), 3, 'una fila por objeto');
  // Ordenadas por Compra, de menos a más (llegaron al revés).
  assert.deepEqual(m.lua(`{${T}:orden()}`), ['compra', true]);
  const filas = [1, 2, 3].map((i) => hueco(m, i));
  assert.deepEqual(filas.map((f) => f.objeto), ['Paño de lino', 'Paño de lana', 'Paño de seda']);
  assert.deepEqual(filas.map((f) => f.nivel), ['5', '15', '25']);
  assert.deepEqual(filas.map((f) => f.cantidad), ['20', '7', '3']);
  assert.deepEqual(filas.map((f) => f.compra), [dinero(m, 120), dinero(m, 300), dinero(m, 4500)], 'Compra por unidad con Tema.dinero');
  assert.deepEqual(filas.map((f) => f.pct), [texto(m, 'COMERCIO_PCT', '60'), texto(m, 'COMERCIO_PCT', '100'), ''], '% del valor de mercado; vacío sin precio');
  assert.ok(filas.every((f) => f.icono), 'con su icono');
  // El nombre en el color de su calidad.
  const calidad = (q) => aHex(m.lua(`SnetForever.UIComercio.colorCalidad(${q})`));
  assert.equal(colorTexto(m, `${T}.huecos[3].celdas.objeto`), calidad(2), 'la seda, verde');
  assert.equal(colorTexto(m, `${T}.huecos[1].celdas.objeto`), calidad(1));
  // Ordenable: pulsar la cabecera de Compra da la vuelta; la de Disponible ordena por ella.
  m.lua(`${T}.cabeceras.compra:Click()`);
  assert.equal(hueco(m, 1).objeto, 'Paño de seda');
  m.lua(`${T}.cabeceras.cantidad:Click()`);
  assert.deepEqual([1, 2, 3].map((i) => hueco(m, i).cantidad), ['3', '7', '20']);
  // Una búsqueda nueva vuelve al orden por Compra de menos a más.
  m.lua(`${R}.volver:Click()`);
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  m.avanzar(0.05);
  assert.deepEqual(m.lua(`{${T}:orden()}`), ['compra', true]);
  assert.equal(hueco(m, 1).objeto, 'Paño de lino');
  sinErrores(m);
});

test('pulsar una fila despliega sus subastas; el vendedor no se guarda en SnetForeverCuenta', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  // B3r: buscar solo lee (la lectura, en pausa aquí); no despliega nada.
  pausarLectura(m);
  assert.equal(m.lua(`${T}:estaAbierta(${T}:fila(1).clave)`), false, 'buscar no despliega ninguna');
  const antes = pedidas(m).length;
  // Lino (mercancía): pulsarla pide sus subastas y las abre. B7: si llegan antes de 0,4 s, sin «Cargando…» entre medias.
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino')}]:Click()`);
  assert.equal(pedidas(m).length, antes + 1);
  assert.equal(pedidas(m)[antes][0].itemID, 2589);
  assert.equal(visibles(m), 3, 'abierta, aún sin nada debajo');
  m.avanzar(0.1);
  assert.equal(visibles(m), 5, 'las 3 filas y las 2 subastas de lino');
  const s1 = hueco(m, 2);
  const s2 = hueco(m, 3);
  // B6r: cada dato en su columna (tiempo, vendedor, puja) y en Objeto solo el nombre. B2r, punto 3: una mercancía no lleva
  // vendedor aunque el cliente lo traiga en owners.
  assert.deepEqual([s1.cantidad, s1.objeto, s1.tiempo, s1.vendedor, s1.compra, s1.puja], ['5', 'Paño de lino', texto(m, 'SUBASTA_RES_TIEMPO_H', 1), '', dinero(m, 120), '']);
  assert.deepEqual([s2.cantidad, s2.tiempo, s2.vendedor, s2.compra], ['15', texto(m, 'COMERCIO_SIN_DATO'), '', dinero(m, 150)]);
  assert.equal(s1.icono, false, 'las subastas no llevan icono');
  assert.equal(s1.nivel, '');
  // Seda (objeto suelto): pulsarla cierra lino y abre la seda con su puja y su tiempo.
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de seda')}]:Click()`);
  m.avanzar(0.1);
  assert.equal(visibles(m), 5, 'lino cerrada, seda abierta');
  const i = huecoDe(m, 'Paño de seda');
  // Ronda 1: ordenadas por precio por unidad, de menos a más (llegaron al revés: 5000 y luego 4500). Arreglo de la compra
  // suelta: la de 4500 agrupa 2 subastas iguales de 1 (como en WoW Forever): Ctd 1, lo que compra un clic.
  const a = hueco(m, i + 1);
  const b = hueco(m, i + 2);
  assert.deepEqual([a.cantidad, a.tiempo, a.compra], ['1', texto(m, 'SUBASTA_RES_BANDA_1'), dinero(m, 4500)], 'sin segundos, su franja de tiempo (1 = Medium: 30 min - 2 h)');
  assert.deepEqual([b.cantidad, b.tiempo, b.vendedor, b.compra, b.puja], ['1', texto(m, 'SUBASTA_RES_TIEMPO_H', 2), 'Mengano', dinero(m, 5000),
    dinero(m, 4000)]);
  // Sin la lista entera, «y más…» al final.
  m.lua('C_AuctionHouse.HasFullItemSearchResults = function() return false end');
  m.lua(`${T}.huecos[${i}]:Click()`);
  m.avanzar(0.1);
  assert.equal(hueco(m, i + 3).objeto, texto(m, 'SUBASTA_RES_Y_MAS'));
  // El vendedor solo vive en pantalla: nunca en las SavedVariables.
  const guardado = JSON.stringify(m.guardado());
  assert.ok(!guardado.includes('Fulano') && !guardado.includes('Mengano'), 'ningún nombre de jugador guardado');
  assert.equal(compras(m), 0, 'pulsar filas no compra nada');
  sinErrores(m);
});

test('Comprar usa SNF.Compra con el clic y en combate no compra', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const C = `${R}.comprar`;
  assert.equal(m.lua(`${C}:IsVisible()`), true);
  assert.equal(m.lua(`${C}.texto:GetText()`), texto(m, 'COMERCIO_COMPRAR'));
  assert.equal(m.lua(`${C}.snfApagado`), true, 'sin subasta elegida, apagado');
  // Elegir una subasta de la seda: SNF.Compra.elegir con esa fila, desde resultados.
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de seda')}]:Click()`);
  m.avanzar(0.1);
  const i = huecoDe(m, 'Paño de seda');
  m.lua(`${T}.huecos[${i + 1}]:Click()`); // una de las 2 iguales a 4500, la primera por precio
  const e = m.lua('SnetForever.Compra.estado()');
  assert.equal(e.item, 4306);
  assert.equal(e.origen, 'resultados');
  assert.ok(hasta(m, () => m.lua('SnetForever.Compra.estado().fase') === 'lista', 60), 'la compra queda lista');
  m.avanzar(0.6); // pasa el bloqueo de medio segundo
  assert.equal(m.lua(`${C}.snfApagado`), false, 'con una subasta elegida, encendido');
  assert.equal(compras(m), 0, 'elegir no compra');
  // En combate, apagado; y aunque el clic llegue, no compra.
  m.lua('BANCO.jugador.enCombate = true');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua(`${C}.snfApagado`), true, 'en combate, apagado');
  m.lua(`${C}:Click()`);
  m.lua(`${C}.snfApagado = false; ${C}:Click()`);
  assert.equal(compras(m), 0, 'en combate no compra');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua(`${C}.snfApagado`), false, 'fuera de combate, otra vez encendido');
  // El clic del jugador pide confirmar y el segundo compra (una sola llamada).
  m.lua(`${C}:Click()`);
  assert.equal(compras(m), 0, 'el primer clic no compra');
  m.avanzar(0.6);
  m.lua(`${C}:Click()`);
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[4306 * 1000 + 2, 4500]], 'el segundo clic compra esa subasta con PlaceBid');
  // Una mercancía «lista» abre el cuadro de cantidad de siempre en vez de comprar.
  m.avanzar(1);
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino')}]:Click()`);
  m.avanzar(0.1);
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino') + 1}]:Click()`);
  assert.ok(hasta(m, () => m.lua('SnetForever.Compra.estado().fase') === 'lista', 60));
  m.avanzar(0.6);
  m.lua(`${C}:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true, 'abre el cuadro de cantidad');
  assert.equal(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase').length, 0, 'el cuadro pide la confirmación');
  // Al salir de la vista, la compra elegida aquí se suelta y el cuadro se cierra.
  m.lua(`${R}.salir:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined);
  sinErrores(m);
});

test('Volver a escanear repite la búsqueda; Salir del escaneo vuelve al inicio sin resultados', () => {
  const m = maquina();
  abrir(m);
  buscar(m, 'paño');
  // Volver a escanear: la misma búsqueda otra vez, sin salir de la vista.
  const antes = textos(m).length;
  m.lua(`${R}.volver:Click()`);
  assert.ok(hasta(m, () => textos(m).length > antes));
  assert.deepEqual(textos(m).slice(antes), ['paño']);
  assert.equal(m.lua(`${SV}.pagina()`), 'resultados');
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  // Con la X y el campo vacío, repite la última.
  m.lua(`${R}.borrar:Click()`);
  const antes2 = textos(m).length;
  m.lua(`${R}.volver:Click()`);
  assert.ok(hasta(m, () => textos(m).length > antes2));
  assert.deepEqual(textos(m).slice(antes2), ['paño']);
  assert.equal(m.lua(`${R}.campo:GetText()`), 'paño', 'el campo vuelve a decir lo buscado');
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  // Intro en el campo busca lo escrito.
  m.lua(`${R}.campo:SetText("lana"); ${R}.campo:GetScript("OnEnterPressed")(${R}.campo)`);
  assert.ok(hasta(m, () => textos(m).includes('lana')));
  assert.deepEqual(m.lua('SnetForever.Busqueda.recientes()').slice(0, 2), ['lana', 'paño']);
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  m.avanzar(0.05);
  // Salir del escaneo: sin resultados, en el inicio de Navegar.
  m.lua(`${R}.salir:Click()`);
  assert.equal(estado(m), 'parada');
  assert.deepEqual(m.lua('SnetForever.Busqueda.resultados()') || [], []);
  assert.equal(m.lua(`${SV}.pagina()`), 'navegar');
  assert.equal(m.lua(`${N}.panel:IsVisible()`), true);
  sinErrores(m);
});

test('sin resultados sale el aviso gris', () => {
  const m = maquina({ navegar: [] });
  abrir(m);
  m.lua(`${N}.campo:SetText("nada"); ${N}.buscar:Click()`);
  assert.equal(m.lua(`${R}.vacio:IsShown()`), false, 'mientras busca, no');
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  m.avanzar(0.05);
  assert.equal(m.lua(`${R}.vacio:IsVisible()`), true);
  assert.equal(m.lua(`${R}.vacio:GetText()`), texto(m, 'SUBASTA_RES_VACIO'));
  assert.equal(colorTexto(m, `${R}.vacio`), comercio(m, 'secundario'), 'en gris');
  assert.equal(visibles(m), 0);
  // Con resultados se va.
  m.lua(`BANCO.ponerSubasta({navegar = {${NAVEGAR.join(', ')}}})`);
  m.lua(`${R}.volver:Click()`);
  assert.equal(m.lua(`${R}.vacio:IsShown()`), false, 'buscando otra vez, se va');
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  m.avanzar(0.05);
  assert.equal(m.lua(`${R}.vacio:IsShown()`), false);
  assert.equal(visibles(m), 3);
  sinErrores(m);
});

test('la barra de estado no cambia de color ni se enciende y apaga sola mientras busca', () => {
  const muchas = [];
  for (let i = 1; i <= 9; i++) muchas.push(`{itemID = ${3000 + i}, totalQuantity = ${i}, minPrice = ${100 * i}}`);
  const m = maquina({ navegar: muchas, porPagina: 2 });
  abrir(m);
  const B = `${R}.barra`;
  const foto = () => m.lua(`(function()
    local b = ${B}
    return {relleno = b.relleno:IsShown(), color = {b.relleno:GetVertexColor()}, ancho = b.relleno:GetWidth(),
      letra = {b.texto:GetTextColor()}, texto = b.texto:GetText(), estado = SnetForever.Busqueda.estado()}
  end)()`);
  m.lua(`${N}.campo:SetText("paño"); ${N}.buscar:Click()`);
  const fotos = [foto()];
  for (let i = 0; i < 400 && estado(m) !== 'completa'; i++) {
    m.avanzar(0.05);
    fotos.push(foto());
  }
  m.avanzar(0.05);
  const buscando = fotos.filter((f) => f.estado !== 'completa');
  assert.ok(buscando.length >= 3, `la búsqueda dura varios fotogramas (${buscando.length})`);
  for (const f of buscando) {
    assert.equal(f.relleno, buscando[0].relleno, 'el avance no se enciende y apaga');
    assert.deepEqual(f.color, buscando[0].color, 'ni cambia de color');
    assert.deepEqual(f.letra, buscando[0].letra, 'el texto tampoco cambia de color');
    assert.ok(f.texto.startsWith(texto(m, 'SUBASTA_RES_BUSCANDO')), `dice que busca: ${f.texto}`);
  }
  assert.equal(buscando[0].relleno, true, 'mientras busca se ve el avance');
  for (let i = 1; i < fotos.length; i++) assert.ok(fotos[i].ancho >= fotos[i - 1].ancho - 0.01, 'el avance nunca vuelve atrás');
  // B3r: acabada la búsqueda se leen los objetos («Leyendo N / M»): el avance no se mueve con la lectura.
  const leyendo = [foto()];
  for (let i = 0; i < 400 && !leidas(m); i++) {
    m.avanzar(0.05);
    leyendo.push(foto());
  }
  for (const f of leyendo) {
    assert.deepEqual([f.relleno, f.color, f.ancho, f.letra], [leyendo[0].relleno, leyendo[0].color, leyendo[0].ancho, leyendo[0].letra], 'leyendo, la barra no cambia sola');
  }
  m.avanzar(0.05);
  const final = foto();
  assert.equal(final.texto, texto(m, 'SUBASTA_RES_OBJETOS', '9'));
  assert.deepEqual(final.color, buscando[0].color, 'al acabar, el mismo color');
  assert.ok(final.ancho >= buscando[buscando.length - 1].ancho);
  // Nada late: sin OnUpdate en la página ni en la barra.
  assert.equal(m.lua(`${R}.pagina:GetScript("OnUpdate")`), undefined);
  assert.equal(m.lua(`${B}:GetScript("OnUpdate")`), undefined);
  assert.equal(colorVertice(m, `${B}.relleno`), comercio(m, 'acento'));
  sinErrores(m);
});

test('todo cabe en es y en con la ventana al mínimo (830 × 500)', () => {
  for (const idioma of ['es', 'en']) {
    for (const escala of [0.64, 1]) {
      const m = maquina({ idioma, escala, sitio: '{x = 50, y = 50, ancho = 800, alto = 450}' });
      m.lua(SUBASTAS);
      abrir(m);
      buscar(m, 'paño');
      m.lua(`${T}.huecos[${huecoDe(m, 'Paño de seda')}]:Click()`);
      m.avanzar(0.1);
      const r = m.lua(`(function()
        local R, V = ${R}, ${V}
        local r = {ancho = V:GetWidth(), alto = V:GetHeight(), malos = {}, fuera = {}}
        local function cabe(nombre, fs, ancho)
          if fs:GetUnboundedStringWidth() > ancho * 0.85 then r.malos[#r.malos + 1] = nombre .. " " .. fs:GetUnboundedStringWidth() .. "/" .. ancho end
        end
        cabe("salir", R.salir.texto, R.salir:GetWidth() / 0.85)
        cabe("volver", R.volver.texto, R.volver:GetWidth() - 8)
        cabe("comprar", R.comprar.texto, R.comprar:GetWidth() - 8)
        cabe("marcador", R.campo.marcador, R.campo:GetWidth() - 48)
        for clave, c in pairs(R.tabla.cabeceras) do cabe("cabecera " .. clave, c.texto, c:GetWidth() - 8) end
        for _, h in ipairs(R.tabla.huecos) do
          if h:IsShown() then
            for _, clave in ipairs({"cantidad", "compra", "pct"}) do cabe(clave, h.celdas[clave], R.tabla:anchoDe(clave) - 8) end
          end
        end
        for _, n in ipairs({"salir", "campo", "volver", "fondoTabla", "barra", "comprar"}) do
          local x = R[n]
          if x:GetLeft() < V:GetLeft() - 0.01 or x:GetRight() > V:GetRight() + 0.01 or x:GetBottom() < V:GetBottom() - 0.01 then
            r.fuera[#r.fuera + 1] = n
          end
        end
        r.separados = R.salir:GetRight() < R.campo:GetLeft() and R.campo:GetRight() < R.volver:GetLeft()
          and R.barra:GetRight() < R.comprar:GetLeft() and R.fondoTabla:GetBottom() > R.barra:GetTop()
        r.filas = #R.tabla.huecos
        return r
      end)()`);
      assert.equal(Math.round(r.ancho), 830, `${idioma}: al mínimo de ancho`);
      assert.equal(Math.round(r.alto), 500, `${idioma}: al mínimo de alto`);
      assert.deepEqual(r.malos, [], `${idioma} a ${escala}: textos que no caben`);
      assert.deepEqual(r.fuera, [], `${idioma} a ${escala}: todo dentro de la ventana`);
      assert.equal(r.separados, true, `${idioma}: nada se pisa`);
      assert.ok(r.filas >= 15, `${idioma}: caben al menos 15 filas (${r.filas})`);
      sinErrores(m);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1
// ---------------------------------------------------------------------------------------------------

const elegida = (m) => m.lua(`${T}:elegida()`);
const barraTexto = (m) => m.lua(`${R}.barra.texto:GetText()`);
const compraEstado = (m) => m.lua('SnetForever.Compra.estado()') || {};
// Arreglo de la compra suelta (2026-11-19): un objeto suelto pide siempre dos clics; el primero no compra (pasa a
// «confirmar») y el segundo, pasado el medio segundo sin clics, compra.
function comprarDosClics(m) {
  m.lua(`${R}.comprar:Click()`);
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
}
// Abre la seda y pulsa su subasta de 5000 (1 unidad, la más cara por unidad: la segunda por precio).
function elegirSedaCara(m) {
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de seda')}]:Click()`);
  m.avanzar(0.1);
  const i = huecoDe(m, 'Paño de seda') + 2;
  assert.equal(hueco(m, i).compra, dinero(m, 5000));
  m.lua(`${T}.huecos[${i}]:Click()`);
  return i;
}

test('ronda 1: Comprar compra exactamente la subasta marcada, aunque haya otra más barata por unidad', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const i = elegirSedaCara(m);
  assert.equal(elegida(m), hueco(m, i).clave, 'la fila marcada es la elegida');
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  const e = compraEstado(m);
  assert.deepEqual([e.cantidad, e.total], [1, 5000], 'la de la fila, no la de 4500 por unidad');
  assert.equal(elegida(m), hueco(m, i).clave, 'sigue marcada la que se va a comprar');
  // El botón dice lo que se va a comprar: cuántas y el total.
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'SUBASTA_RES_COMPRAR', '1', m.lua('SnetForever.UIComercio.dinero(5000)')));
  comprarDosClics(m);
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[4306 * 1000 + 1, 5000]], 'el auctionID de la marcada');
  sinErrores(m);
});

test('ronda 1: la marcada que desaparece → «ya no está»; la que cambia de precio → «cambió de precio»; nada comprado y la tabla se actualiza', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  pausarLectura(m); // B3r: cuenta las peticiones de desplegar y de la compra
  // Desaparece entre que se pulsa y responde el servidor.
  const pedidasAntes = pedidas(m).length;
  elegirSedaCara(m);
  m.lua('BANCO.subasta.objetos[4306] = {{quantity = 2, buyoutAmount = 4500, auctionID = 4306002}}'); // la de 4500 sigue (con su id)
  assert.ok(hasta(m, () => compraEstado(m).fase === 'error', 60));
  assert.equal(compraEstado(m).motivo, 'ya_no_esta');
  assert.equal(barraTexto(m), texto(m, 'COMERCIO_MOTIVO_YA_NO_ESTA'), 'se dice en una línea');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  // La tabla se actualiza: sus subastas se piden otra vez (una sola) y la vieja se queda hasta que llega la nueva.
  const i = huecoDe(m, 'Paño de seda');
  const visto = [];
  for (let k = 0; k < 20; k++) {
    visto.push(visibles(m));
    m.avanzar(0.05);
  }
  assert.ok(visto.every((n) => n >= 4), `nunca se vacía entre medias: ${visto}`);
  // Ronda 2: la tabla se actualiza sin pedir nada al servidor: la subasta se quita de la lista en memoria.
  assert.equal(pedidas(m).length, pedidasAntes + 2, 'la de abrir la seda y la de la compra: ningún SendSearchQuery más');
  assert.equal(hueco(m, i + 1).compra, dinero(m, 4500));
  const siguiente = hueco(m, i + 2);
  assert.ok(!siguiente || siguiente.compra !== dinero(m, 5000), 'la que ya no está se ha ido');
  m.avanzar(1);
  assert.equal(pedidas(m).length, pedidasAntes + 2, 'no se vuelve a pedir sola');
  // Cambia de precio: la misma subasta (mismo auctionID) con otro total.
  m.lua('BANCO.subasta.objetos[4306] = {{quantity = 2, buyoutAmount = 4500}, {quantity = 1, buyoutAmount = 5000, auctionID = 777}}');
  m.lua(`${T}.huecos[${i}]:Click()`);
  m.avanzar(0.1);
  assert.equal(hueco(m, i + 2).compra, dinero(m, 5000));
  m.lua(`${T}.huecos[${i + 2}]:Click()`);
  m.lua('BANCO.subasta.objetos[4306] = {{quantity = 2, buyoutAmount = 4500}, {quantity = 1, buyoutAmount = 5500, auctionID = 777}}');
  assert.ok(hasta(m, () => compraEstado(m).fase === 'error', 60));
  assert.equal(compraEstado(m).motivo, 'cambio_precio');
  assert.equal(barraTexto(m), texto(m, 'COMERCIO_MOTIVO_CAMBIO_PRECIO'));
  m.lua(`${R}.comprar:Click()`);
  assert.equal(compras(m), 0, 'nada comprado');
  sinErrores(m);
});

test('ronda 1: mercancía: la fila fija la cantidad y su precio es el tope; si la cotización lo pasa, nada', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino')}]:Click()`);
  m.avanzar(0.1);
  // La de 15 a 150: se compran 15, de la más barata hacia arriba, sin pasar de 150 por unidad (5 a 120 y 10 a 150).
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino') + 2}]:Click()`);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  let e = compraEstado(m);
  assert.deepEqual([e.cantidad, e.total], [15, 5 * 120 + 10 * 150]);
  // B6r, punto 10: la cantidad la elige el jugador y el máximo es lo acumulado hasta el precio de la fila (5 a 120 y 15 a
  // 150); antes era la cantidad de la fila (15). El precio de la fila sigue siendo el tope.
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 20, 'como mucho, todo lo que hay a 150 o menos');
  // B2r, punto 1: una mercancía abre el cuadro de cantidad; el botón lo dice y la barra lleva el importe.
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'COMERCIO_ELEGIR_CANTIDAD'));
  assert.ok(sinColores(barraTexto(m)).endsWith(m.lua('SnetForever.UIComercio.dinero(2100)')), `la barra: ${barraTexto(m)}`);
  // La de 5 a 120: el servidor cotiza más caro que 5 × 120 → «cambió de precio» y no se confirma.
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino') + 1}]:Click()`);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  e = compraEstado(m);
  assert.deepEqual([e.cantidad, e.total], [5, 600]);
  m.lua('BANCO.ponerSubasta({precioCompra = 130})');
  m.lua(`${R}.comprar:Click()`); // abre el cuadro de cantidad de siempre
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()');
  assert.deepEqual(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase'), [[2589, 5]]);
  m.avanzar(0.1);
  e = compraEstado(m);
  assert.deepEqual([e.fase, e.motivo], ['error', 'cambio_precio']);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0, 'nada comprado');
  sinErrores(m);
});

test('ronda 1: la regla de un grupo elegido en ofertas no cambia nada en resultados (el tope de gasto sí)', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  m.lua('_G.claveSeda = SnetForever.Grupos.crear("Sedas"); SnetForever.Grupos.anadir(claveSeda, 4306)');
  m.lua('SnetForever.UIComercio.olvidarGrupos()');
  m.lua('assert(SnetForever.Reglas.poner(claveSeda, {maxUnidades = 1, maxOro = 1000}))'); // la de 5000 no cabría
  m.lua('SnetForever.UIComercio.elegirGrupo(claveSeda)');
  assert.equal(m.lua('SnetForever.UIComercio.grupo()'), m.lua('claveSeda'));
  buscar(m, 'paño');
  elegirSedaCara(m);
  assert.ok(hasta(m, () => compraEstado(m).fase !== 'buscando', 60));
  assert.equal(compraEstado(m).fase, 'lista', `sin regla de grupo (${compraEstado(m).motivo})`);
  // El tope de gasto global sí sigue.
  m.lua('SnetForever.Ajustes.set("comercioTope", 4000)');
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  assert.equal(compraEstado(m).motivo, 'tope');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// Arreglo de la compra suelta (2026-11-19): un objeto suelto pide siempre dos clics (antes, solo una compra cara, con un
// armado de 5 s). El botón cambia de texto solo por el clic del jugador y después nada cambia solo.
test('ronda 1: un objeto suelto pide dos clics y nada cambia de color ni de texto solo mientras espera el segundo', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  m.lua('SnetForever.Ajustes.set("comercioAvisoOro", 1000)'); // el aviso de oro ya no cambia nada en un objeto suelto
  abrir(m);
  buscar(m, 'paño');
  elegirSedaCara(m);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  const foto = () => m.lua(`(function()
    local b = ${R}.comprar
    return {texto = b.texto:GetText(), fondo = {b.snfTema.fondoPleno[1]:GetVertexColor()}, letra = {b.texto:GetTextColor()},
      barra = ${R}.barra.texto:GetText(), barraLetra = {${R}.barra.texto:GetTextColor()}}
  end)()`);
  const lista = foto();
  assert.equal(lista.barra, texto(m, 'COMERCIO_BARRA_LISTA', '1', dinero(m, 5000)));
  assert.equal(aHex(lista.fondo), token(m, 'boton'), 'sin rojo');
  m.lua(`${R}.comprar:Click()`); // el primer clic solo pide confirmar
  assert.equal(compras(m), 0);
  assert.equal(compraEstado(m).fase, 'confirmar');
  m.avanzar(0.6);
  const antes = foto();
  assert.equal(antes.barra, texto(m, 'COMERCIO_BARRA_CONFIRMAR_OBJETO', '1', dinero(m, 5000)), 'la barra dice que falta confirmar');
  assert.equal(antes.texto, texto(m, 'SUBASTA_RES_CONFIRMAR', '1', m.lua('SnetForever.UIComercio.dinero(5000)')));
  assert.equal(aHex(antes.fondo), token(m, 'boton'), 'sin rojo');
  for (let k = 0; k < 7; k++) {
    m.avanzar(1);
    assert.deepEqual(foto(), antes, `a los ${k + 1} s, todo igual`);
  }
  m.lua(`${R}.comprar:Click()`);
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[4306 * 1000 + 1, 5000]]);
  sinErrores(m);
});

test('ronda 1: «Volver a escanear» no pasa por parada: el avance no se esconde ni un fotograma', () => {
  const m = maquina({ navegar: NAVEGAR, porPagina: 1 });
  abrir(m);
  buscar(m, 'paño');
  const relleno = () => m.lua(`${R}.barra.relleno:IsShown()`);
  assert.equal(relleno(), true);
  m.lua(`${R}.volver:Click()`);
  const vistos = [relleno()];
  const estados = [estado(m)];
  for (let k = 0; k < 400 && estado(m) !== 'completa'; k++) {
    m.avanzar(0.05);
    vistos.push(relleno());
    estados.push(estado(m));
  }
  assert.ok(estados.includes('buscando') || estados.includes('esperando'), 'busca otra vez');
  assert.ok(!estados.includes('parada'), `nunca parada: ${estados}`);
  assert.ok(vistos.every((v) => v === true), `el avance siempre a la vista: ${vistos}`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 2
// ---------------------------------------------------------------------------------------------------

test('ronda 2: en combate una mercancía por confirmar desde resultados se cancela y el cuadro se cierra; nada se arma al salir', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino')}]:Click()`);
  m.avanzar(0.1);
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino') + 1}]:Click()`);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()');
  m.avanzar(0.6);
  assert.equal(compraEstado(m).fase, 'confirmar');
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  m.lua('BANCO.jugador.enCombate = true');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false, 'el cuadro se cierra');
  assert.equal(m.llamadas('C_AuctionHouse.CancelCommoditiesPurchase').length, 1, 'la compra a medias se cancela');
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'combate']);
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  assert.equal(m.lua('SnetForever.Compra.pulsar()'), false, 'Compra.pulsar lo rechaza por dentro');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  m.avanzar(1);
  assert.equal(compraEstado(m).fase, 'error', 'al salir no se arma nada solo');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('ronda 2: el escalón de una mercancía se marca por su precio: la marca no se pierde si cambia su cantidad', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino')}]:Click()`);
  m.avanzar(0.1);
  const i = huecoDe(m, 'Paño de lino') + 2; // el escalón de 150
  m.lua(`${T}.huecos[${i}]:Click()`);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  const clave = hueco(m, i).clave;
  assert.equal(elegida(m), clave);
  // El jugador vuelve a pulsar la fila: llegan sus subastas con 12 unidades a 150 en vez de 15.
  m.lua('BANCO.subasta.mercancias[2589] = {{quantity = 5, unitPrice = 120, timeLeftSeconds = 3600}, {quantity = 12, unitPrice = 150}}');
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino')}]:Click()`);
  m.avanzar(0.1);
  assert.equal(hueco(m, i).cantidad, '12');
  assert.equal(hueco(m, i).clave, clave, 'la misma clave');
  assert.equal(elegida(m), clave, 'sigue marcada la que se va a comprar');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 3
// ---------------------------------------------------------------------------------------------------

test('ronda 3: con PLAYER_REGEN_DISABLED y InCombatLockdown() aún false, Comprar de resultados sale apagado', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  elegirSedaCara(m);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  assert.equal(m.lua(`${R}.comprar.snfApagado`), false);
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('InCombatLockdown()'), false);
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true, 'apagado aunque el bloqueo aún no haya empezado');
  m.lua(`${R}.comprar.snfApagado = false; ${R}.comprar:Click()`);
  assert.equal(compras(m), 0);
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), false, 'al salir, encendido (la compra sigue lista)');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 4
// ---------------------------------------------------------------------------------------------------

test('ronda 4: la página solo toca la marca del combate con PLAYER_REGEN_DISABLED y PLAYER_REGEN_ENABLED', () => {
  const m = maquina();
  abrir(m);
  buscar(m, 'paño');
  const evento = (nombre) => m.lua(`${R}.pagina:GetScript("OnEvent")(${R}.pagina, ${JSON.stringify(nombre)})`);
  m.lua('SnetForever.Compra.enCombate = true');
  evento('OTRO_EVENTO');
  assert.equal(m.lua('SnetForever.Compra.enCombate'), true, 'otro evento no la quita');
  evento('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua('SnetForever.Compra.enCombate'), false);
  evento('OTRO_EVENTO');
  assert.equal(m.lua('SnetForever.Compra.enCombate'), false, 'ni la pone');
  evento('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('SnetForever.Compra.enCombate'), true);
  m.lua('SnetForever.Compra.enCombate = false');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B6r: la vista de resultados como la de TSM (captura B2)
// ---------------------------------------------------------------------------------------------------

const sinColores = (t) => (t || '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');
const lineasTt = (m) => m.lua('BANCO.lineasTooltip()') || [];
const ttVisible = (m) => m.lua('GameTooltip:IsShown()');
const entrar = (m, expr) => m.lua(`${expr}:GetScript("OnEnter")(${expr})`);
const salir = (m, expr) => m.lua(`${expr}:GetScript("OnLeave")(${expr})`);
// Las coordenadas del atlas de un icono de Tema.icono, para saber qué icono enseña una textura.
const coords = (m, expr) => m.lua(`{${expr}:GetTexCoord()}`).map((v) => Math.round(v * 1000));
const coordsIcono = (m, nombre) => m.lua(`(function() local t = UIParent:CreateTexture(); SnetForever.Tema.icono(t, ${aLua(nombre)}); return {t:GetTexCoord()} end)()`).map((v) => Math.round(v * 1000));
const clic = (m, i) => m.lua(`${T}.huecos[${i}]:Click()`);
const abrirFila = (m, nombre) => { clic(m, huecoDe(m, nombre)); m.avanzar(0.1); return huecoDe(m, nombre); };

// Lino como en la captura: una mercancía con muchas subastas (de menos a más), sin vendedor ni puja.
const PRECIOS_LINO = [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40, 41, 42, 44, 45, 49];
const CANTIDADES_LINO = [5438, 1096, 2543, 334, 372, 51, 94, 604, 43, 206, 854, 635, 367, 162, 135, 225, 32];
const LINO = (precios = PRECIOS_LINO, cantidades = CANTIDADES_LINO) => `BANCO.ponerSubasta({mercancias = {[2589] = {${precios.map((p, i) => `{quantity = ${cantidades[i] || 10}, unitPrice = ${p}, timeLeftSeconds = ${(i % 3 + 1) * 30000}}`).join(', ')}}}})`;

test('las columnas son Objeto, Niv., Ctd, reloj, Vendedor, Pujar (objeto), Compra (objeto) y %, en ese orden', () => {
  const m = maquina();
  abrir(m);
  buscar(m, 'paño');
  const orden = m.lua(`(function()
    local r = {}
    for clave, c in pairs(${T}.cabeceras) do r[#r + 1] = {clave, c:GetLeft()} end
    table.sort(r, function(a, b) return a[2] < b[2] end)
    for i, x in ipairs(r) do r[i] = x[1] end
    return r
  end)()`);
  assert.deepEqual(orden, ['objeto', 'nivel', 'cantidad', 'tiempo', 'vendedor', 'puja', 'compra', 'pct']);
  const cab = (clave) => m.lua(`${T}.cabeceras.${clave}.texto:GetText()`);
  assert.deepEqual(['objeto', 'nivel', 'cantidad', 'vendedor', 'puja', 'compra', 'pct'].map(cab),
    ['Objeto', 'Niv.', 'Ctd', 'Vendedor', 'Pujar (objeto)', 'Compra (objeto)', '%']);
  // El reloj: un icono (no texto) con su tooltip.
  assert.equal(cab('tiempo'), '');
  const reloj = `${T}.cabeceras.tiempo`;
  assert.equal(m.lua(`${reloj}.icono:IsVisible()`), true, 'el reloj se ve');
  assert.equal(m.lua(`${reloj}.icono:GetTexture()`), m.lua('SnetForever.Tema.ATLAS'), 'textura propia, del atlas');
  assert.deepEqual(coords(m, `${reloj}.icono`), coordsIcono(m, 'reloj'));
  entrar(m, reloj);
  assert.ok(lineasTt(m).includes('Tiempo que le queda'), `tooltip: ${lineasTt(m)}`);
  salir(m, reloj);
  assert.equal(ttVisible(m), false);
  // En inglés también tiene sus títulos.
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.deepEqual(['cantidad', 'vendedor', 'puja', 'compra'].map(cab), ['Qty', 'Seller', 'Bid (item)', 'Buyout (item)']);
  sinErrores(m);
});

test('una subfila de objeto pone su tiempo, vendedor, puja y compra en sus columnas y la de Objeto solo el nombre', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  const fila = hueco(m, i);
  assert.deepEqual([fila.tiempo, fila.vendedor, fila.puja, fila.cantidad, fila.compra], ['', '', '', '3', dinero(m, 4500)], 'la fila del objeto: Ctd y Compra, el resto vacío');
  const b = hueco(m, i + 2); // la de 5000 con puja 4000, 2 h y Mengano
  assert.deepEqual([b.objeto, b.cantidad, b.tiempo, b.vendedor, b.puja, b.compra],
    ['Paño de seda', '1', '2h', 'Mengano', dinero(m, 4000), dinero(m, 5000)]);
  assert.equal(b.icono, false, 'en Objeto solo el nombre');
  // Nada de eso en gris dentro de Objeto: los adornos de antes ya no existen.
  assert.equal(m.lua(`${T}.huecos[${i + 2}].snfVendedor == nil and ${T}.huecos[${i + 2}].snfPuja == nil`), true);
  // El vendedor solo en pantalla.
  assert.ok(!JSON.stringify(m.guardado()).includes('Mengano'));
  sinErrores(m);
});

test('en una mercancía, vendedor y puja quedan vacíos pero sus columnas se ven', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  const s = hueco(m, i + 1);
  assert.deepEqual([s.vendedor, s.puja, s.cantidad, s.compra], ['', '', '5438', dinero(m, 28)]);
  for (const clave of ['vendedor', 'puja']) {
    assert.equal(m.lua(`${T}.cabeceras.${clave}:IsVisible()`), true, `la columna ${clave} se ve`);
    assert.ok(m.lua(`${T}:anchoDe("${clave}")`) >= 60, `${clave} con su ancho`);
  }
  sinErrores(m);
});

test('el tiempo va sin espacio y con el color de su tramo', () => {
  const m = maquina();
  // Segundos que le quedan → texto y tramo: más de 24 h verde, de 12 a 24 naranja, de 2 a 12 amarillo, menos de 2 rojo.
  const casos = [[90000, '25h', 'verde'], [86400, '24h', 'naranja'], [50000, '13h', 'naranja'], [43200, '12h', 'naranja'],
    [20000, '5h', 'amarillo'], [7200, '2h', 'amarillo'], [7000, '1h', 'rojo'], [1800, '30m', 'rojo'], [30, '<1m', 'rojo']];
  m.lua(`BANCO.ponerSubasta({mercancias = {[2589] = {${casos.map(([s], i) => `{quantity = 1, unitPrice = ${100 + i}, timeLeftSeconds = ${s}}`).join(', ')}}},
    objetos = {[4306] = {{quantity = 1, buyoutAmount = 100, timeLeft = 0}, {quantity = 1, buyoutAmount = 200, timeLeft = 1}, {quantity = 1, buyoutAmount = 300, timeLeft = 2}, {quantity = 1, buyoutAmount = 400, timeLeft = 3}}}})`);
  abrir(m);
  buscar(m, 'paño');
  let i = abrirFila(m, 'Paño de lino');
  casos.forEach(([, textoEsperado, tramo], k) => {
    const h = `${T}.huecos[${i + 1 + k}].celdas.tiempo`;
    assert.equal(m.lua(`${h}:GetText()`), textoEsperado, `${casos[k][0]} s`);
    assert.equal(colorTexto(m, h), token(m, tramo), `${textoEsperado} en ${tramo}`);
  });
  assert.equal(m.lua('SnetForever.L.t("SUBASTA_RES_TIEMPO_H", 23)'), '23h');
  assert.equal(m.lua('SnetForever.L.t("SUBASTA_RES_TIEMPO_M", 30)'), '30m');
  // Las franjas sin horas exactas (objetos sin segundos), con el color de su tramo.
  i = abrirFila(m, 'Paño de seda');
  [['SUBASTA_RES_BANDA_0', 'rojo'], ['SUBASTA_RES_BANDA_1', 'rojo'], ['SUBASTA_RES_BANDA_2', 'amarillo'], ['SUBASTA_RES_BANDA_3', 'naranja']].forEach(([clave, tramo], k) => {
    const h = `${T}.huecos[${i + 1 + k}].celdas.tiempo`;
    assert.equal(m.lua(`${h}:GetText()`), texto(m, clave));
    assert.equal(colorTexto(m, h), token(m, tramo), `${clave} en ${tramo}`);
  });
  sinErrores(m);
});

test('los precios salen con oro, plata y cobre: 10099 es 1g 00s 99c', () => {
  const m = maquina({ navegar: ['{itemID = 4306, totalQuantity = 1, minPrice = 10099}'] });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 10099, bidAmount = 10099, timeLeftSeconds = 9000}}}})');
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  const f = hueco(m, i);
  const s = hueco(m, i + 1);
  for (const [nombre, t] of [['fila: compra', f.compra], ['subasta: puja', s.puja], ['subasta: compra', s.compra]]) {
    assert.equal(t, dinero(m, 10099), `${nombre} con Tema.dinero (sus colores)`);
    assert.equal(sinColores(t), '1g 00s 99c', nombre);
  }
  // Alineados a la derecha en su columna.
  for (const clave of ['puja', 'compra']) {
    assert.equal(m.lua(`${T}.huecos[${i + 1}].celdas.${clave}:GetJustifyH()`), 'RIGHT');
    const r = m.lua(`{${T}.huecos[${i + 1}].celdas.${clave}:GetRight(), ${T}.cabeceras.${clave}:GetRight()}`);
    assert.ok(r[1] - r[0] >= 0 && r[1] - r[0] <= 8, `${clave} pegado a la derecha de su columna: ${r}`);
  }
  sinErrores(m);
});

test('el % sale sin espacio y con el color de su tramo', () => {
  const ids = [4306, 2592, 2589, 4305, 4338, 14047];
  const pcts = [40, 41, 80, 81, 110, 111];
  const tramos = ['azul', 'verde', 'verde', 'amarillo', 'amarillo', 'naranja']; // B3r: por encima de 110, naranja (rojo desde 1000)
  const normales = Object.fromEntries(ids.map((id) => [id, 1000]));
  const m = maquina({ precios: normales, navegar: ids.map((id, k) => `{itemID = ${id}, totalQuantity = 1, minPrice = ${pcts[k] * 10}}`) });
  m.itemInfo(4305, { nombre: 'Seda burda', calidad: 1, nivel: 30 });
  m.itemInfo(4338, { nombre: 'Paño de tejido mágico', calidad: 1, nivel: 40 });
  m.itemInfo(14047, { nombre: 'Paño rúnico', calidad: 1, nivel: 50 });
  abrir(m);
  buscar(m, 'paño');
  assert.equal(m.lua('SnetForever.L.t("COMERCIO_PCT", "100")'), '100%', 'es.COMERCIO_PCT sin espacio');
  pcts.forEach((p, k) => {
    const i = m.lua(`(function() for i, h in ipairs(${T}.huecos) do if h:IsShown() and h.celdas.pct:GetText() == "${p}%" then return i end end end)()`);
    assert.ok(i, `sale «${p}%»`);
    assert.equal(colorTexto(m, `${T}.huecos[${i}].celdas.pct`), token(m, tramos[k]), `${p}% en ${tramos[k]}`);
  });
  sinErrores(m);
});

test('las filas que se despliegan llevan triángulo cerrado o abierto y la cabecera el botón ⋮ apagado, alineados', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m); // B3r: mientras esperan su lectura llevan ↻; leídas, el triángulo
  for (let i = 1; i <= 3; i++) {
    assert.equal(m.lua(`${T}.huecos[${i}].abrir:IsShown()`), true, `fila ${i} con triángulo`);
    assert.deepEqual(coords(m, `${T}.huecos[${i}].flecha`), coordsIcono(m, 'cerrado'), `fila ${i} cerrada: ▸`);
    assert.equal(m.lua(`${T}.huecos[${i}].flecha:GetTexture()`), m.lua('SnetForever.Tema.ATLAS'), 'textura propia, no la letra');
  }
  const i = abrirFila(m, 'Paño de seda');
  assert.deepEqual(coords(m, `${T}.huecos[${i}].flecha`), coordsIcono(m, 'abierto'), 'abierta: ▾');
  assert.equal(m.lua(`${T}.huecos[${i + 1}].abrir:IsShown()`), false, 'las subastas sin triángulo');
  // El triángulo de una abierta la cierra; el de otra la abre (y pide sus subastas).
  m.lua(`${T}.huecos[${i}].abrir:Click()`);
  assert.equal(visibles(m), 3, 'cerrada');
  const antes = pedidas(m).length;
  m.lua(`${T}.huecos[${huecoDe(m, 'Paño de lino')}].abrir:Click()`);
  m.avanzar(0.1);
  assert.equal(pedidas(m).length, antes + 1, 'abrir con el triángulo pide sus subastas');
  assert.equal(visibles(m), 5);
  // El ⋮ de la cabecera: apagado, con tooltip, del atlas, y alineado con los triángulos.
  const menu = `${T}.menu`;
  assert.equal(m.lua(`${menu}:IsVisible()`), true);
  assert.equal(m.lua(`${menu}.snfApagado`), true, 'apagado');
  assert.deepEqual(coords(m, `${menu}.icono`), coordsIcono(m, 'puntos'));
  entrar(m, menu);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_RES_MENU_PRONTO')), `tooltip: ${lineasTt(m)}`);
  salir(m, menu);
  const centro = (expr) => m.lua(`(function() local x = ${expr}; return (x:GetLeft() + x:GetRight()) / 2 end)()`);
  cerca(centro(menu), centro(`${T}.huecos[1].abrir`), 'el ⋮ sobre la columna de los triángulos');
  // Los nombres de las filas de objeto empiezan todos en el mismo sitio.
  const izq = [1, 2, 3, 4, 5].map((k) => m.lua(`(function() local h = ${T}.huecos[${k}]; if h.fila.subasta or h.fila.aviso then return -1 end; return h.celdas.objeto:GetLeft() end)()`)).filter((x) => x >= 0);
  assert.ok(izq.length === 3 && izq.every((x) => Math.abs(x - izq[0]) < 0.01), `nombres alineados: ${izq}`);
  sinErrores(m);
});

test('la cabecera lleva separadores finos entre columnas', () => {
  const m = maquina();
  abrir(m);
  buscar(m, 'paño');
  const r = m.lua(`(function()
    local t = ${T}
    local r = {n = #t.separadores, malos = {}}
    local orden = {"objeto", "nivel", "cantidad", "tiempo", "vendedor", "puja", "compra", "pct"}
    for k, s in ipairs(t.separadores) do
      local cab = t.cabeceras[orden[k]]
      local x = (s:GetLeft() + s:GetRight()) / 2
      if not s:IsVisible() or math.abs(s:GetWidth() - 1) > 0.01 or math.abs(x - cab:GetRight()) > 1
        or s:GetTop() > cab:GetTop() + 0.01 or s:GetBottom() < cab:GetBottom() - 0.01 then
        r.malos[#r.malos + 1] = orden[k]
      end
      r.color = {s:GetVertexColor()}
    end
    return r
  end)()`);
  assert.equal(r.n, 7, 'una línea entre cada dos columnas');
  assert.deepEqual(r.malos, [], 'de 1 px, en el borde de cada columna y solo en la cabecera');
  assert.equal(aHex(r.color), comercio(m, 'linea'), 'del color suave del tema');
  sinErrores(m);
});

test('al desplegar un objeto con 17 subastas salen 10 y «y 7 más…», y se ve el objeto siguiente', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  for (let k = 1; k <= 10; k++) assert.equal(hueco(m, i + k).compra, dinero(m, PRECIOS_LINO[k - 1]), `subasta ${k}, de las más baratas`);
  assert.equal(hueco(m, i + 11).objeto, texto(m, 'SUBASTA_RES_Y_N_MAS', '7'));
  assert.equal(texto(m, 'SUBASTA_RES_Y_N_MAS', '7'), 'y 7 más…');
  assert.equal(colorTexto(m, `${T}.huecos[${i + 11}].celdas.objeto`), comercio(m, 'secundario'), 'en gris');
  assert.equal(hueco(m, i + 12).objeto, 'Paño de lana', 'se ve el objeto siguiente');
  // La fila «y N más…» no se puede elegir.
  const antes = elegida(m);
  clic(m, i + 11);
  assert.equal(elegida(m), antes, 'pulsarla no la marca');
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'ni prepara nada');
  // Sin la lista entera: solo «y más…».
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return false end');
  clic(m, i);
  m.avanzar(0.1);
  assert.equal(hueco(m, i + 11).objeto, texto(m, 'SUBASTA_RES_Y_MAS'));
  sinErrores(m);
});

test('si la subasta elegida queda fuera de las 10, se suelta su compra', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  clic(m, i + 10); // la décima, la de 37c
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  assert.equal(elegida(m), hueco(m, i + 10).clave);
  // Aparecen tres más baratas: la de 37c pasa a ser la decimotercera.
  m.lua(LINO([20, 21, 22, ...PRECIOS_LINO], [5, 5, 5, ...CANTIDADES_LINO]));
  clic(m, i);
  m.avanzar(0.1);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'su compra se suelta');
  assert.ok(!String(elegida(m)).includes('p37'), `ya no está marcada: ${elegida(m)}`);
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('abajo: pausa a la izquierda, estado en medio, Publicar y Pujar apagados con tooltip y Comprar a la derecha', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const p = (n) => caja(m, `${R}.${n}`);
  const [pausa, barra, publicar, pujar, comprar] = ['pausa', 'barra', 'publicar', 'pujar', 'comprar'].map(p);
  cerca(pausa.izq, 12, 'la pausa a 12 px del borde');
  cerca(barra.izq - pausa.der, 8, 'pausa → estado');
  cerca(publicar.izq - barra.der, 8, 'estado → Publicar');
  cerca(pujar.izq - publicar.der, 8, 'Publicar → Pujar');
  cerca(comprar.izq - pujar.der, 8, 'Pujar → Comprar');
  cerca(publicar.der - publicar.izq, 100, 'Publicar de 100');
  cerca(pujar.der - pujar.izq, 100, 'Pujar de 100');
  cerca(comprar.der - comprar.izq, 210, 'Comprar de su ancho (B3r: 210, antes 190)');
  cerca(pausa.der - pausa.izq, pausa.abajo - pausa.arriba, 'la pausa es cuadrada');
  cerca(pausa.abajo - pausa.arriba, barra.abajo - barra.arriba, 'del alto de la barra');
  for (const x of [publicar, pujar, comprar]) cerca(x.abajo, barra.abajo, 'en la misma línea');
  // Both actions start disabled before a result is selected.
  assert.equal(m.lua(`${R}.publicar.texto:GetText()`), 'Publicar');
  assert.equal(m.lua(`${R}.pujar.texto:GetText()`), 'Pujar');
  for (const n of ['publicar', 'pujar']) assert.equal(m.lua(`${R}.${n}.snfApagado`), true, `${n} apagado`);
  entrar(m, `${R}.publicar`);
  assert.ok(lineasTt(m).includes(m.lua('SnetForever.L.t("TRADE_SCAN_SELECTED")')), `${lineasTt(m)}`);
  salir(m, `${R}.publicar`);
  entrar(m, `${R}.pujar`);
  assert.ok(lineasTt(m).includes('Llega pronto'), `${lineasTt(m)}`);
  salir(m, `${R}.pujar`);
  // Con una mercancía elegida, Pujar dice que no admiten puja; con un objeto, «Llega pronto».
  let i = abrirFila(m, 'Paño de lino');
  clic(m, i + 1);
  assert.equal(m.lua(`${R}.pujar.snfApagado`), true);
  entrar(m, `${R}.pujar`);
  assert.ok(lineasTt(m).includes('Las mercancías no admiten puja'), `${lineasTt(m)}`);
  salir(m, `${R}.pujar`);
  i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1);
  entrar(m, `${R}.pujar`);
  assert.ok(lineasTt(m).includes('Llega pronto'), `${lineasTt(m)}`);
  salir(m, `${R}.pujar`);
  // Pujar nunca puja (aunque llegue el clic).
  m.lua(`${R}.pujar:Click(); ${R}.publicar:Click()`);
  m.lua(`${R}.pujar.snfApagado = false; ${R}.pujar:Click()`);
  m.avanzar(0.2);
  assert.equal(compras(m), 0, 'nada pujado ni comprado');
  sinErrores(m);
});

test('pausa para la búsqueda y seguir la repite; acabada, el botón va apagado', () => {
  const muchas = [];
  for (let k = 1; k <= 6; k++) muchas.push(`{itemID = ${3000 + k}, totalQuantity = ${k}, minPrice = ${100 * k}}`);
  const m = maquina({ navegar: muchas, porPagina: 2 });
  abrir(m);
  const P = `${R}.pausa`;
  m.lua(`${N}.campo:SetText("paño"); ${N}.buscar:Click()`);
  assert.ok(hasta(m, () => estado(m) === 'buscando' && m.lua('#SnetForever.Busqueda.resultados()') >= 2, 100), 'busca y llega la primera página');
  m.avanzar(0.05);
  assert.equal(estado(m), 'buscando');
  assert.deepEqual(coords(m, `${P}.icono`), coordsIcono(m, 'pausa'), 'buscando: el icono de pausa');
  assert.equal(m.lua(`${P}.snfApagado`), false);
  entrar(m, P);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_RES_PAUSA_PARAR')), `${lineasTt(m)}`);
  salir(m, P);
  m.lua(`${P}:Click()`);
  const n = m.lua('#SnetForever.Busqueda.resultados()');
  const pedidosAntes = m.llamadas('C_AuctionHouse.RequestMoreBrowseResults').length;
  const subastasAntes = pedidas(m).length; // B3r, ronda 1: parar es parar: tampoco se leen los objetos
  m.avanzar(0.5);
  assert.equal(pedidas(m).length, subastasAntes, 'parada: ninguna petición nueva a la subasta (ni de la lectura)');
  assert.notEqual(estado(m), 'buscando', 'parada');
  assert.equal(m.llamadas('C_AuctionHouse.RequestMoreBrowseResults').length, pedidosAntes, 'no pide más páginas');
  assert.equal(m.lua('#SnetForever.Busqueda.resultados()'), n, 'lo que llegó se queda');
  assert.ok(n < 6, 'a medias');
  assert.equal(visibles(m), n);
  assert.equal(m.lua(`${R}.barra.texto:GetText()`), texto(m, 'SUBASTA_RES_A_MEDIAS', String(n)));
  // Parada a medias: el icono de seguir, encendido; pulsarlo repite la búsqueda.
  assert.deepEqual(coords(m, `${P}.icono`), coordsIcono(m, 'seguir'));
  assert.equal(m.lua(`${P}.snfApagado`), false);
  entrar(m, P);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_RES_PAUSA_SEGUIR')), `${lineasTt(m)}`);
  salir(m, P);
  const antes = textos(m).length;
  m.lua(`${P}:Click()`);
  assert.ok(hasta(m, () => textos(m).length > antes), 'vuelve a buscar');
  assert.deepEqual(textos(m).slice(antes), ['paño']);
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  m.avanzar(0.05);
  assert.equal(visibles(m), 6);
  hastaLeidas(m); // B3r: y leída
  // Acabada: apagado, con el icono de seguir.
  assert.deepEqual(coords(m, `${P}.icono`), coordsIcono(m, 'seguir'));
  assert.equal(m.lua(`${P}.snfApagado`), true);
  const pano = () => textos(m).filter((t) => t === 'paño').length; // el escaneo de fondo busca «» entre medias
  const antes2 = pano();
  m.lua(`${P}:Click()`);
  m.avanzar(0.2);
  assert.equal(pano(), antes2, 'apagado no busca');
  assert.equal(m.lua(`${P}:GetScript("OnUpdate")`), undefined, 'nada late');
  sinErrores(m);
});

test('con el ratón sobre una fila sale el tooltip del objeto y en una subfila además vendedor y precios', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  entrar(m, `${T}.huecos[${i}]`);
  assert.equal(ttVisible(m), true);
  assert.equal(lineasTt(m)[0], 'Paño de seda', 'el tooltip del objeto del juego');
  salir(m, `${T}.huecos[${i}]`);
  m.avanzar(0.3); // T1a ronda 1: se esconde pasada la espera
  assert.equal(ttVisible(m), false, 'al salir se esconde');
  // Una subfila: el objeto y, después, el vendedor en gris y «Puja X / Compra X».
  entrar(m, `${T}.huecos[${i + 2}]`);
  const l = lineasTt(m);
  assert.equal(l[0], 'Paño de seda');
  const vendedor = texto(m, 'SUBASTA_RES_TT_VENDEDOR', 'Mengano');
  const precios = texto(m, 'SUBASTA_RES_TT_PRECIOS', dinero(m, 4000), dinero(m, 5000));
  assert.ok(l.indexOf(vendedor) > 0 && l.indexOf(precios) > l.indexOf(vendedor), `vendedor y precios al final: ${l}`);
  const detalle = m.detalleTooltip().find((d) => d.izq === vendedor);
  assert.equal(aHex(detalle.colorIzq), comercio(m, 'secundario'), 'el vendedor en gris');
  salir(m, `${T}.huecos[${i + 2}]`);
  m.avanzar(0.3); // T1a ronda 1: se esconde pasada la espera
  assert.equal(ttVisible(m), false);
  // Una mercancía: sin puja ni vendedor (B2r, punto 3), solo su compra.
  const j = abrirFila(m, 'Paño de lino');
  entrar(m, `${T}.huecos[${j + 1}]`);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_RES_TT_COMPRA', dinero(m, 120))), `${lineasTt(m)}`);
  salir(m, `${T}.huecos[${j + 1}]`);
  assert.ok(!JSON.stringify(m.guardado()).includes('Mengano'));
  sinErrores(m);
});

// Punto 9 (captura B2): pulsar una subasta de una mercancía que no es la más barata. Con los datos de la captura en el
// banco la compra queda lista; lo que la deja apagada sin decir nada es que SNF.Compra.elegir dé false (otra compra espera
// aún al servidor) y la vista se lo calle.
test('punto 9: con otra compra esperando al servidor, pulsar una subasta de lino no se queda callado', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  // Una compra de la lista vieja (sin origen) pedida al servidor y aún sin respuesta.
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 4500}}}})');
  m.lua('SnetForever.Compra.elegir({item = 4306, precio = 4500, cantidad = 1})');
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  m.lua('_G.B9 = CreateFrame("Button"); B9:SetScript("OnClick", function() SnetForever.Compra.pulsar() end); B9:Click()');
  m.avanzar(0.6); // arreglo de la compra suelta: un objeto suelto pide el segundo clic
  m.lua('B9:Click()');
  assert.equal(compraEstado(m).fase, 'comprando');
  m.lua('_G.ELEGIR = SnetForever.Compra.elegir; SnetForever.Compra.elegir = function(...) local r = ELEGIR(...); _G.DIO = r; return r end');
  clic(m, i + 4); // la de 31c (334), que no es la más barata
  assert.equal(m.lua('rawget(_G, "DIO")'), false, 'SNF.Compra.elegir da false: hay una compra pedida al servidor');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  assert.equal(barraTexto(m), texto(m, 'SUBASTA_RES_POR_QUE_OTRA_COMPRA'), 'la barra dice por qué');
  assert.equal(colorTexto(m, `${R}.barra.texto`), token(m, 'texto'), 'sin rojo');
  m.lua('SnetForever.Compra.elegir = ELEGIR');
  sinErrores(m);
});

test('pulsar una subasta comprable enciende Comprar o la barra dice por qué no', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  // Lo normal: Comprar se enciende con «Elegir cantidad…» (una mercancía; B2r, punto 1) y la barra dice lo elegido.
  clic(m, i + 10);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  assert.equal(m.lua(`${R}.comprar.snfApagado`), false);
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'COMERCIO_ELEGIR_CANTIDAD'));
  assert.match(sinColores(barraTexto(m)), /206/);
  // En combate: la compra se prepara pero el botón va apagado y la barra lo dice.
  m.disparar('PLAYER_REGEN_DISABLED');
  clic(m, i + 9);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  assert.equal(barraTexto(m), texto(m, 'SUBASTA_RES_EN_COMBATE'));
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), false);
  // El tope de gasto: la barra lo dice (y no se apaga sola).
  m.lua('SnetForever.Ajustes.set("comercioTope", 100)');
  clic(m, i + 10);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'error', 60));
  const tope = barraTexto(m);
  assert.ok(tope.length > 0 && tope !== texto(m, 'SUBASTA_RES_OBJETOS', '3'), `dice el tope: ${tope}`);
  m.avanzar(6);
  assert.equal(barraTexto(m), tope, 'no se apaga solo');
  m.lua('SnetForever.Ajustes.set("comercioTope", 0)');
  // Una subasta tuya: no se puede comprar y la barra lo dice.
  m.lua('local A = C_AuctionHouse; local f = A.GetCommoditySearchResultInfo; A.GetCommoditySearchResultInfo = function(...) local r = f(...); if r and r.unitPrice == 30 then r.numOwnerItems, r.containsOwnerItem, r.containsAccountItem = r.quantity, true, true end; return r end');
  clic(m, i);
  m.avanzar(0.1);
  clic(m, i + 3);
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  assert.equal(barraTexto(m), texto(m, 'SUBASTA_RES_POR_QUE_TUYA'));
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// Disposición: las piezas de la barra de abajo y los títulos frente a los bordes de la ventana, al tamaño por defecto, a uno
// más grande y al mínimo; nada se pisa. Se mide con anchos de letra de verdad para Montserrat (los botones), como en
// subasta-ventana.test.js; la letra de la tabla (ARIALN) se cuenta con el medio tamaño del banco, más ancho que el de verdad.
// B3r: también Montserrat SemiBold (los botones y las etiquetas), medido igual con PIL.
const FACTOR_LETRA = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };
const letraReal = (m) => m.lua(`BANCO.letraReal = {${Object.entries(FACTOR_LETRA).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);
function disposicion(m) {
  return m.lua(`(function()
    local R, V, t = ${R}, ${V}, ${R}.tabla
    local r = {ancho = V:GetWidth(), alto = V:GetHeight(), piezas = {}, titulos = {}, malos = {}}
    for _, n in ipairs({"pausa", "barra", "publicar", "pujar", "comprar"}) do
      local x = R[n]
      r.piezas[#r.piezas + 1] = {n, x:GetLeft() - V:GetLeft(), x:GetRight() - V:GetLeft(), x:GetBottom() - V:GetBottom()}
    end
    for clave, c in pairs(t.cabeceras) do
      local ocupado = c.texto:GetUnboundedStringWidth() + (c.flecha:IsShown() and (c.flecha:GetWidth() + 3) or 0)
      if c.icono and c.icono:IsShown() then ocupado = c.icono:GetWidth() end
      if clave == "objeto" and t.menu then ocupado = ocupado + t.menu:GetWidth() end
      r.titulos[#r.titulos + 1] = {clave, c:GetLeft() - V:GetLeft(), V:GetRight() - c:GetRight()}
      if ocupado > c:GetWidth() - 8 then r.malos[#r.malos + 1] = clave .. " " .. ocupado .. "/" .. c:GetWidth() end
    end
    local b = R.comprar
    r.comprarCabe = b.texto:GetUnboundedStringWidth() <= b:GetWidth() - 8 -- B2r, punto 2: medido con la letra real, sin margen
    return r
  end)()`);
}
test('disposición: barra de abajo y títulos frente a los bordes, a 860×545, a 1200×700 y al mínimo; nada se pisa y los títulos caben', () => {
  for (const [sitio, ancho, alto] of [['{x = 20, y = 20, ancho = 860, alto = 545}', 860, 545], ['{x = 20, y = 20, ancho = 1200, alto = 700}', 1200, 700], ['{x = 20, y = 20, ancho = 800, alto = 450}', 830, 500]]) {
    for (const idioma of ['es', 'en']) {
      const m = maquina({ sitio, idioma });
      letraReal(m);
      m.lua(SUBASTAS);
      abrir(m);
      buscar(m, 'paño');
      const i = abrirFila(m, 'Paño de seda');
      clic(m, i + 2);
      assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
      m.avanzar(0.6);
      const r = disposicion(m);
      const msg = `${idioma} a ${ancho}×${alto}`;
      assert.equal(Math.round(r.ancho), ancho, `${msg}: ancho`);
      assert.equal(Math.round(r.alto), alto, `${msg}: alto`);
      const [pausa, barra, , , comprar] = r.piezas;
      cerca(pausa[1], 12, `${msg}: la pausa a 12 px del borde izquierdo`);
      cerca(ancho - comprar[2], 12 + m.lua('SnetForever.Piezas.CABECERA.asa'), `${msg}: Comprar a 12 px del asa`);
      for (const p of r.piezas) cerca(p[3], 8, `${msg}: ${p[0]} a 8 px del borde de abajo`);
      for (let k = 1; k < r.piezas.length; k++) {
        cerca(r.piezas[k][1] - r.piezas[k - 1][2], 8, `${msg}: ${r.piezas[k - 1][0]} y ${r.piezas[k][0]} a 8 px, sin pisarse`);
      }
      assert.ok(barra[2] - barra[1] >= 100, `${msg}: el estado llena lo que sobra (${barra[2] - barra[1]})`);
      for (const tt of r.titulos) assert.ok(tt[1] >= 12 && tt[2] >= 12, `${msg}: ${tt[0]} dentro de la tabla`);
      assert.deepEqual(r.malos, [], `${msg}: títulos que no caben enteros`);
      assert.equal(r.comprarCabe, true, `${msg}: «Comprar N por X» cabe`);
      sinErrores(m);
    }
  }
});

test('una subasta con su enlace de verdad enseña el tooltip con SetHyperlink y su nombre y color salen del enlace', () => {
  const m = maquina();
  // Ronda 1: los dos formatos. El de los clientes clásicos («|cffRRGGBB») y el de WoW Forever («|cnIQ<n>:», el que da el
  // cliente de verdad: ver ia/diario.lua).
  const enlace = '|cff1eff00|Hitem:4306::::::::25:::::::|h[Paño de seda del oso]|h|r';
  const forever = '|cnIQ3:|Hitem:4306::::::::25:::::::|h[Paño de seda del águila]|h|r';
  m.lua(`BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000, timeLeftSeconds = 9000, itemLink = ${aLua(enlace)}}, {quantity = 1, buyoutAmount = 6000, timeLeftSeconds = 9000}, {quantity = 1, buyoutAmount = 7000, timeLeftSeconds = 9000, itemLink = ${aLua(forever)}}}}})`);
  m.lua('_G.ENLACES = {}; _G.PORID = {}; local h, i = GameTooltip.SetHyperlink, GameTooltip.SetItemByID; GameTooltip.SetHyperlink = function(self, e) table.insert(ENLACES, e); return h(self, e) end; GameTooltip.SetItemByID = function(self, id) table.insert(PORID, id); return i(self, id) end');
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  const calidad = (q) => aHex(m.lua(`SnetForever.UIComercio.colorCalidad(${q})`));
  assert.equal(hueco(m, i + 1).objeto, 'Paño de seda del oso', 'el nombre del enlace, con su sufijo');
  assert.equal(colorTexto(m, `${T}.huecos[${i + 1}].celdas.objeto`), calidad(2), 'y el color de su calidad');
  assert.equal(hueco(m, i + 3).objeto, 'Paño de seda del águila', 'WoW Forever: el nombre del enlace «|cnIQ»');
  assert.equal(colorTexto(m, `${T}.huecos[${i + 3}].celdas.objeto`), calidad(3), 'y su calidad (3, azul)');
  assert.equal(m.lua(`SnetForever.Diario.calidadDeEnlace(${aLua(forever)})`), 3, 'la calidad la lee el diario, en un solo sitio');
  entrar(m, `${T}.huecos[${i + 1}]`);
  assert.deepEqual(m.lua('ENLACES'), [enlace], 'con el enlace: SetHyperlink');
  assert.equal(m.lua(`GameTooltip:GetOwner() == ${T}.huecos[${i + 1}]`), true, 'anclado a la fila');
  salir(m, `${T}.huecos[${i + 1}]`);
  m.avanzar(0.3); // T1a ronda 1: el tooltip va con la luz de la fila, que se apaga pasada la espera
  entrar(m, `${T}.huecos[${i + 2}]`);
  assert.deepEqual(m.lua('PORID'), [4306], 'sin enlace: SetItemByID');
  salir(m, `${T}.huecos[${i + 2}]`);
  sinErrores(m);
});

// T1a: el ayudante común de todas las filas (UIComercio.tooltipObjeto): el tooltip sale a la derecha de la fila, como TSM.
test('con el ratón sobre un objeto de los resultados sale su tooltip anclado a la fila y al salir se esconde', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  for (const h of [i, i + 2]) {
    entrar(m, `${T}.huecos[${h}]`);
    assert.equal(ttVisible(m), true);
    assert.deepEqual(m.lua(`(function() local p, r, rp = GameTooltip:GetPoint(1); return {p, r == ${T}.huecos[${h}], rp} end)()`), ['LEFT', true, 'RIGHT'], `fila ${h}: a la derecha de la fila`);
    salir(m, `${T}.huecos[${h}]`);
    m.avanzar(0.3); // T1a ronda 1: se esconde pasada la espera
    assert.equal(ttVisible(m), false);
  }
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B6r, anexo: puntos 10 a 12
// ---------------------------------------------------------------------------------------------------

const sumar = (a) => a.reduce((x, y) => x + y, 0);

// Punto 12 (captura b2-2): la fila de 31c (334) da «334 por 93s 52c» = 28c cada una, pero la lista que se ve empieza en
// 29c. Causa: la compra lee las subastas de ahora (su propia SendSearchQuery) y la vista se queda con la lista de antes.
test('punto 12: con las más baratas ya vendidas en la segunda lista, el total, la barra y la fila salen de las subastas de ahora', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  assert.equal(hueco(m, i + 1).compra, dinero(m, 28), 'la primera lista empieza en 28c');
  // Alguien compra las de 28c y 29c: la segunda lista (la de la compra) ya no las trae.
  m.lua(LINO(PRECIOS_LINO.slice(2), CANTIDADES_LINO.slice(2)));
  clic(m, i + 4); // la de 31c (334)
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.1);
  const e = compraEstado(m);
  assert.deepEqual([e.cantidad, e.total], [334, 334 * 30], 'de la más barata de ahora (30c) hacia arriba');
  // Lo que se ve es lo mismo con lo que se calcula: la lista empieza en 30c y la de 31c sigue marcada.
  const primera = huecoDe(m, 'Paño de lino') + 1;
  assert.equal(hueco(m, primera).compra, dinero(m, 30), 'la lista que se ve es la de ahora');
  assert.equal(hueco(m, primera).cantidad, '2543');
  assert.ok(String(elegida(m)).endsWith(':p31'), `sigue marcada la de 31c: ${elegida(m)}`);
  assert.ok(barraTexto(m).includes(dinero(m, 334 * 30)), `la barra con el total de ahora: ${barraTexto(m)}`);
  // La fila del objeto, con el mínimo y lo disponible de ahora.
  const fila = hueco(m, huecoDe(m, 'Paño de lino'));
  assert.equal(fila.compra, dinero(m, 30));
  assert.equal(fila.cantidad, m.lua(`SnetForever.Texto.numero(${sumar(CANTIDADES_LINO.slice(2))})`));
  sinErrores(m);
});

test('punto 12: una subasta de mercancía que cambió de cantidad no se esconde: sigue a la vista con lo de ahora', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  clic(m, i + 1); // la de 28c (5438)
  m.lua('BANCO.subasta.mercancias[2589][1].quantity = 5000'); // alguien compra 438 antes de que llegue la respuesta
  assert.ok(hasta(m, () => compraEstado(m).fase === 'error', 60));
  assert.equal(compraEstado(m).motivo, 'cambio_precio');
  m.avanzar(0.1);
  const j = huecoDe(m, 'Paño de lino');
  assert.deepEqual([hueco(m, j + 1).compra, hueco(m, j + 1).cantidad], [dinero(m, 28), '5000'], 'la de 28c sigue, con 5000');
  // La de 31c sale de 28c, la más barata que se ve.
  clic(m, j + 4);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  assert.deepEqual([compraEstado(m).cantidad, compraEstado(m).total], [334, 334 * 28]);
  assert.equal(hueco(m, j + 1).compra, dinero(m, 28));
  sinErrores(m);
});

test('con sus subastas llegadas, la fila del objeto enseña el mínimo y lo disponible de ahora', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const lino = () => hueco(m, huecoDe(m, 'Paño de lino'));
  const deAhora = () => [m.lua(`SnetForever.Texto.numero(${sumar(CANTIDADES_LINO)})`), dinero(m, 28)];
  // B3r: sus subastas llegan ya con la lectura, sin desplegarla (antes de leerla, lo de la búsqueda).
  hastaLeidas(m);
  assert.deepEqual([lino().cantidad, lino().compra], deAhora(), 'leída: lo de sus subastas');
  clic(m, huecoDe(m, 'Paño de lino'));
  assert.deepEqual([lino().cantidad, lino().compra], deAhora(), 'desplegándola: lo mismo, sin volver a lo de la búsqueda');
  m.avanzar(0.1);
  assert.deepEqual([lino().cantidad, lino().compra], deAhora(), 'llegadas: lo de sus subastas');
  sinErrores(m);
});

// Punto 10: elegir la cantidad de una mercancía en la ventanita (el cuadro de cantidad de siempre, ampliado).
const Q = 'SnetForever.CantidadComercio.marco()';
const COSTE = (n) => { // de la más barata hacia arriba con LINO()
  let falta = n; let total = 0;
  for (let k = 0; k < PRECIOS_LINO.length && falta > 0; k++) { const u = Math.min(falta, CANTIDADES_LINO[k]); total += u * PRECIOS_LINO[k]; falta -= u; }
  return total;
};
const dineroPlano = (m, c) => m.lua(`SnetForever.UIComercio.dinero(${c})`);
// Elige la de 31c (334) de lino, la deja lista y pulsa Comprar: sale la ventanita.
function ventanitaLino(m) {
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  clic(m, i + 4);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true, 'sale la ventanita');
}

test('mercancía: Comprar abre la ventanita con la cantidad de la fila, el máximo acumulado hasta esa fila y el total de más barata a más cara', () => {
  const m = maquina();
  ventanitaLino(m);
  assert.equal(m.lua(`${Q}.nombre:GetText()`), 'Paño de lino');
  assert.equal(m.lua(`${Q}.icono:IsVisible()`), true, 'con su icono');
  assert.equal(m.lua(`${Q}.caja:GetText()`), '334', 'por defecto, la cantidad de la fila');
  const maximo = 5438 + 1096 + 2543 + 334; // todo lo que hay a 31c o menos
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), maximo, 'como mucho, lo acumulado hasta esa fila');
  assert.equal(m.lua(`${Q}.total:GetText()`), dineroPlano(m, COSTE(334)), 'el total, de la más barata hacia arriba');
  // B2r, punto 5: «Precio de la unidad: X» (sin valor de mercado en esta máquina, sin %); un solo botón y la X para cerrar.
  assert.equal(m.lua(`${Q}.unidad:GetText()`), dineroPlano(m, Math.ceil(COSTE(334) / 334)));
  assert.equal(m.lua(`${Q}.etiquetaUnidad:GetText()`), texto(m, 'COMERCIO_CANT_PRECIO_UNIDAD'));
  assert.equal(m.lua(`${Q}.comprar:IsVisible() and ${Q}.cerrar:IsVisible()`), true, 'Comprar y la X');
  // «Máx.» pone todo lo que hay hasta el precio de la fila; 1 es lo mínimo.
  m.lua(`${Q}.rapidos.max:Click()`);
  assert.equal(compraEstado(m).cantidad, maximo);
  assert.equal(compraEstado(m).total, COSTE(maximo));
  m.lua(`${Q}.caja:SetText("0"); ${Q}.caja:GetScript("OnEnterPressed")(${Q}.caja)`);
  assert.equal(compraEstado(m).cantidad, maximo, 'un 0 no vale: se queda la de antes');
  m.lua(`${Q}.rapidos[1]:Click()`);
  assert.equal(compraEstado(m).cantidad, 1, 'como poco, 1');
  assert.equal(compras(m), 0, 'abrir y cambiar la cantidad no compra');
  sinErrores(m);
});

test('al cambiar la cantidad se recalculan el precio por unidad y el total', () => {
  const m = maquina();
  ventanitaLino(m);
  m.lua(`${Q}.caja:SetText("6000"); ${Q}.caja:GetScript("OnEnterPressed")(${Q}.caja)`);
  const e = compraEstado(m);
  assert.deepEqual([e.cantidad, e.total], [6000, COSTE(6000)]);
  assert.equal(COSTE(6000), 5438 * 28 + 562 * 29);
  assert.equal(m.lua(`${Q}.total:GetText()`), dineroPlano(m, COSTE(6000)));
  assert.equal(m.lua(`${Q}.unidad:GetText()`), dineroPlano(m, Math.ceil(COSTE(6000) / 6000)), 'la media por unidad');
  assert.match(sinColores(m.lua(`${Q}.comprar.texto:GetText()`)), /6000|6\.000/, 'el botón dice la cantidad nueva');
  sinErrores(m);
});

// Ronda 1: el total sube porque se vendieron las de 28c y 29c, pero las 334 caben a 30c, sin pasar de los 31c de la fila.
test('si el juego cotiza más que lo enseñado, la ventanita lo avisa y hace falta otro clic; nunca se confirma sola', () => {
  const m = maquina();
  ventanitaLino(m);
  const antes = compraEstado(m).total;
  m.lua(LINO(PRECIOS_LINO.slice(2), CANTIDADES_LINO.slice(2))); // la lista de ahora: sin las de 28c ni 29c
  m.lua(`${Q}.comprar:Click()`);
  assert.deepEqual(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase'), [[2589, 334]], 'pide el precio al juego');
  m.avanzar(0.1);
  const e = compraEstado(m);
  assert.deepEqual([e.fase, e.subio, e.total], ['confirmar', true, 334 * 30]);
  const foto = () => m.lua(`(function() local q = ${Q}
    return {aviso = q.aviso:IsShown() and q.aviso:GetText() or "", letra = {q.aviso:GetTextColor()}, boton = q.comprar.texto:GetText(),
      fondo = {q.comprar.fondo:GetVertexColor()}} end)()`);
  const f = foto();
  assert.equal(f.aviso, texto(m, 'COMERCIO_CANT_SUBIO', dineroPlano(m, antes), dineroPlano(m, 334 * 30)), 'lo dice antes de confirmar, con el total nuevo');
  assert.equal(aHex(f.letra), comercio(m, 'texto'), 'el aviso sin rojo');
  assert.notEqual(aHex(f.fondo), comercio(m, 'rojo'), 'el botón sin rojo');
  for (let k = 0; k < 8; k++) {
    m.avanzar(1);
    assert.deepEqual(foto(), f, `a los ${k + 1} s, igual: nada cambia solo`);
  }
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0, 'nunca se confirma sola');
  m.lua(`${Q}.comprar:Click()`);
  assert.deepEqual(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase'), [[2589, 334]], 'el segundo clic del jugador la acepta');
  sinErrores(m);
});

test('una cantidad que pasa del precio de la fila no se compra', () => {
  const m = maquina();
  ventanitaLino(m);
  const maximo = 5438 + 1096 + 2543 + 334;
  m.lua(`${Q}.caja:SetText("99999"); ${Q}.caja:GetScript("OnEnterPressed")(${Q}.caja)`);
  assert.equal(compraEstado(m).cantidad, maximo, 'más de lo que hay a 31c no se puede pedir: se recorta');
  assert.equal(compraEstado(m).total, COSTE(maximo));
  // Si el juego cotiza por encima de 31c cada una, no se compra.
  m.lua('BANCO.ponerSubasta({precioCompra = 32})');
  m.avanzar(0.6); // la cantidad acaba de cambiar: el botón no acepta clics medio segundo
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'cambio_precio']);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0, 'nada comprado');
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false);
  sinErrores(m);
});

test('un objeto que no es mercancía se compra entero, sin ventanita de cantidad', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1); // una de las 2 iguales a 4500
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  comprarDosClics(m);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false, 'sin ventanita');
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[4306 * 1000 + 2, 4500]], 'una subasta, por su compra entera');
  sinErrores(m);
});

test('en combate no se abre y, abierta, se cierra y cancela', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  clic(m, i + 4);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true, 'en combate, Comprar apagado');
  m.lua(`${R}.comprar:Click()`);
  m.lua(`${R}.comprar.snfApagado = false; ${R}.comprar:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false, 'no se abre');
  m.disparar('PLAYER_REGEN_ENABLED');
  m.lua(`${R}.comprar:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  assert.equal(compraEstado(m).fase, 'confirmar');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false, 'abierta, se cierra');
  assert.equal(m.llamadas('C_AuctionHouse.CancelCommoditiesPurchase').length >= 1, true, 'y la compra se cancela');
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'combate']);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0);
  m.disparar('PLAYER_REGEN_ENABLED');
  sinErrores(m);
});

// Punto 11: la barra decía «334 por 93s 52c» y el botón «334 por 93p 52c»: el botón (y el tooltip) usaban las letras de
// COMERCIO_ORO / COMERCIO_PLATA («o», «p») y otro formato. Ahora todo el dinero sin colores sale de Tema, como Tema.dinero.
test('la barra y el botón dicen el dinero en la misma unidad', () => {
  const m = maquina();
  m.lua(LINO());
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 10416, timeLeftSeconds = 9000}}}})');
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  clic(m, i + 4); // 334 por 93s 52c
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  const plano = sinColores(dinero(m, 9352));
  assert.equal(plano, '93s 52c');
  assert.ok(sinColores(barraTexto(m)).endsWith(plano), `la barra: ${barraTexto(m)}`);
  // B2r, punto 1: una mercancía no lleva importe en el botón (abre el cuadro de cantidad, que dice el total exacto).
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'COMERCIO_ELEGIR_CANTIDAD'), 'el botón, sin importe');
  // Con oro, plata y cero a la izquierda: el mismo formato en los dos sitios.
  const j = abrirFila(m, 'Paño de seda');
  clic(m, j + 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  assert.ok(sinColores(barraTexto(m)).endsWith('1g 04s 16c'), `la barra: ${barraTexto(m)}`);
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'SUBASTA_RES_COMPRAR', '1', '1g 04s 16c'));
  // Un solo sitio: el dinero plano de toda la ventana (también el de la lista vieja y el cuadro de cantidad) es Tema.dinero
  // sin colores.
  for (const c of [0, 5, 105, 9352, 10416, 24999, 1234567]) {
    assert.equal(m.lua(`SnetForever.Tema.dineroPlano(${c})`), sinColores(dinero(m, c)), `${c}`);
    assert.equal(m.lua(`SnetForever.UIComercio.dinero(${c})`), sinColores(dinero(m, c)), `${c}`);
  }
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    assert.equal(m.lua('SnetForever.UIComercio.dinero(24999)'), '2g 49s 99c', `${idioma}: g, s y c`);
  }
  sinErrores(m);
});

test('el tooltip del objeto dice el dinero con g, s y c', () => {
  for (const [cobre, plano] of [[24999, '2g 49s 99c'], [14000, '1g 40s 00c'], [10005, '1g 00s 05c']]) {
    const m = maquina({ precios: { 2589: cobre } });
    abrir(m);
    buscar(m, 'paño');
    entrar(m, `${T}.huecos[${huecoDe(m, 'Paño de lino')}]`);
    const todas = lineasTt(m).map(sinColores).join('\n');
    // Ronda 1: el mismo formato que Tema.dinero (partes a cero y ceros a dos cifras), no solo las mismas letras.
    assert.ok(todas.includes(`Valor de mercado\t${plano}`), `${cobre}: el valor de mercado como Tema.dinero («${plano}»):\n${todas}`);
    assert.equal(plano, sinColores(dinero(m, cobre)));
    assert.ok(!/\d[op]\b/.test(todas), `sin «o» ni «p»:\n${todas}`);
    salir(m, `${T}.huecos[${huecoDe(m, 'Paño de lino')}]`);
    sinErrores(m);
  }
});

// ---------------------------------------------------------------------------------------------------
// B6r, ronda 1 de arreglos
// ---------------------------------------------------------------------------------------------------

test('ronda 1: si desaparecen las baratas y el servidor rellenaría con unidades más caras que la fila, no se ofrece nada, ni con dos clics', () => {
  const m = maquina();
  ventanitaLino(m);
  const maximo = 5438 + 1096 + 2543 + 334; // 9411 a 31c o menos
  m.lua(`${Q}.rapidos.max:Click()`);
  m.avanzar(0.6);
  assert.equal(compraEstado(m).cantidad, maximo);
  // Alguien compra 1000 de las de 28c: el servidor rellenaría con 1000 de 32c a 35c, y la media no pasaría de 31c.
  m.lua('BANCO.subasta.mercancias[2589][1].quantity = 4438');
  m.lua(`${Q}.comprar:Click()`);
  assert.deepEqual(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase'), [[2589, maximo]]);
  m.avanzar(0.1);
  const e = compraEstado(m);
  assert.notEqual(e.fase, 'confirmar', 'no se ofrece confirmar');
  assert.equal(e.fase, 'lista');
  assert.ok(m.llamadas('C_AuctionHouse.CancelCommoditiesPurchase').length >= 1, 'la compra a medias se cancela');
  const quedan = maximo - 1000;
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), quedan, 'el máximo del cuadro baja a lo que queda a ese precio');
  const linea = texto(m, 'COMERCIO_BARRA_QUEDAN', m.lua(`SnetForever.Texto.numero(${maximo})`), m.lua(`SnetForever.Texto.numero(${quedan})`));
  assert.equal(linea, 'Ya no hay 9411 a ese precio: quedan 8411');
  // B2r, punto 5: en la ventanita, corto y en una línea.
  assert.equal(m.lua(`${Q}.aviso:IsShown() and ${Q}.aviso:GetText()`), texto(m, 'COMERCIO_CANT_QUEDAN', m.lua(`SnetForever.Texto.numero(${quedan})`)), 'la ventanita lo dice');
  assert.equal(barraTexto(m), linea, 'y la barra');
  // Ni con dos clics más se confirma nada de lo que pasa de la fila.
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  for (const [, n] of m.llamadas('C_AuctionHouse.StartCommoditiesPurchase').slice(1)) assert.ok(n <= quedan, `nunca se pide más de lo que hay a 31c (${n})`);
  for (const [, n] of m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase')) assert.ok(n <= quedan, `nunca se confirma más (${n})`);
  sinErrores(m);
});

test('ronda 1: si el total sube pero todas siguen a la fila o menos, sale el aviso y hace falta otro clic', () => {
  const m = maquina();
  ventanitaLino(m);
  // Se venden las de 28c: las 334 salen a 29c, sin pasar de los 31c de la fila.
  m.lua(LINO(PRECIOS_LINO.slice(1), CANTIDADES_LINO.slice(1)));
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  const e = compraEstado(m);
  assert.deepEqual([e.fase, e.subio, e.total], ['confirmar', true, 334 * 29]);
  assert.equal(m.lua(`${Q}.aviso:GetText()`), texto(m, 'COMERCIO_CANT_SUBIO', dineroPlano(m, 334 * 28), dineroPlano(m, 334 * 29)));
  m.avanzar(3);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0, 'no se confirma sola');
  m.lua(`${Q}.comprar:Click()`);
  assert.deepEqual(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase'), [[2589, 334]]);
  sinErrores(m);
});

test('ronda 1: cerrar con el triángulo la fila de la subasta elegida suelta su compra y su marca', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  clic(m, i + 4);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  assert.equal(m.lua(`${R}.comprar.snfApagado`), false);
  m.lua(`${T}.huecos[${i}].abrir:Click()`);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'la compra se suelta');
  assert.ok(!String(elegida(m)).includes(':p'), `ninguna subasta marcada: ${elegida(m)}`);
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  sinErrores(m);
});

test('ronda 1: abrir otra fila suelta la compra de la subasta elegida y su marca', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  abrirFila(m, 'Paño de lino');
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'la compra se suelta');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  assert.ok(!String(elegida(m)).includes(':a'), `ninguna subasta marcada: ${elegida(m)}`);
  // Volver a pulsar la misma fila abierta (ponerla al día) no la suelta.
  const j = abrirFila(m, 'Paño de lino');
  clic(m, j + 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  clic(m, huecoDe(m, 'Paño de lino'));
  m.avanzar(0.1);
  assert.equal(compraEstado(m).fase, 'lista', 'la misma fila: la compra sigue');
  sinErrores(m);
});

test('ronda 1: el porqué no se queda viejo: se va al abrir o cerrar una fila y cuando la otra compra acaba', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 4500}}}})');
  const otraCompra = () => {
    m.lua('SnetForever.Compra.elegir({item = 4306, precio = 4500, cantidad = 1})');
    assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
    m.avanzar(0.6);
    m.lua('rawset(_G, "B9", rawget(_G, "B9") or CreateFrame("Button")); B9:SetScript("OnClick", function() SnetForever.Compra.pulsar() end); B9:Click()');
    m.avanzar(0.6); // arreglo de la compra suelta: un objeto suelto pide el segundo clic
    m.lua('B9:Click()');
    assert.equal(compraEstado(m).fase, 'comprando');
  };
  const porque = texto(m, 'SUBASTA_RES_POR_QUE_OTRA_COMPRA');
  otraCompra();
  clic(m, huecoDe(m, 'Paño de lino') + 4);
  assert.equal(barraTexto(m), porque);
  // La otra compra acaba (baja el oro): el porqué se va.
  m.avanzar(0.2);
  assert.notEqual(compraEstado(m).fase, 'comprando');
  assert.notEqual(barraTexto(m), porque, 'la otra compra acabó');
  // Abrir otra fila o cerrar la de ahora también lo quitan.
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 4500}}}})');
  otraCompra();
  clic(m, huecoDe(m, 'Paño de lino') + 4);
  assert.equal(barraTexto(m), porque);
  abrirFila(m, 'Paño de lana');
  assert.notEqual(barraTexto(m), porque, 'al abrir otra fila');
  void i;
  sinErrores(m);
});

test('ronda 1: en una subasta que no se puede comprar, el tiempo también va en gris', () => {
  const m = maquina();
  m.lua(LINO());
  m.lua('local A = C_AuctionHouse; local f = A.GetCommoditySearchResultInfo; A.GetCommoditySearchResultInfo = function(...) local r = f(...); if r and r.unitPrice == 28 then r.numOwnerItems, r.containsOwnerItem, r.containsAccountItem = r.quantity, true, true end; return r end');
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  assert.equal(hueco(m, i + 1).vendedor, texto(m, 'SUBASTA_RES_TUYA'));
  for (const clave of ['objeto', 'cantidad', 'tiempo']) {
    assert.equal(colorTexto(m, `${T}.huecos[${i + 1}].celdas.${clave}`), comercio(m, 'secundario'), `${clave} en gris`);
  }
  assert.notEqual(colorTexto(m, `${T}.huecos[${i + 2}].celdas.tiempo`), comercio(m, 'secundario'), 'una comprable, con el color de su tramo');
  sinErrores(m);
});

// F4, ronda 1: con la lista a medias (y sin una entera antes), Ctd, el mínimo y «(n)» salen de la misma lectura: de navegar
// si trae más unidades (antes Ctd salía de navegar y el mínimo de la lista) o, si no, de la lista a medias.
test('ronda 1: la fila del objeto: con la lista a medias Ctd y el mínimo salen de la misma lectura, las tuyas no cuentan para el mínimo y sin subastas el mínimo queda vacío', () => {
  const m = maquina({ navegar: ['{itemID = 2589, totalQuantity = 99999, minPrice = 10}', '{itemID = 2592, totalQuantity = 7, minPrice = 300}'] });
  m.lua(LINO());
  m.lua('local A = C_AuctionHouse; local f = A.GetCommoditySearchResultInfo; A.GetCommoditySearchResultInfo = function(...) local r = f(...); if r and r.unitPrice == 28 then r.numOwnerItems, r.containsOwnerItem, r.containsAccountItem = r.quantity, true, true end; return r end');
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return false end');
  abrir(m);
  buscar(m, 'paño');
  const lino = () => hueco(m, huecoDe(m, 'Paño de lino'));
  abrirFila(m, 'Paño de lino');
  assert.equal(lino().cantidad, m.lua('SnetForever.Texto.numero(99999)'), 'a medias y corta: lo de la búsqueda');
  assert.equal(lino().compra, dinero(m, 10), 'y su mínimo, también de la búsqueda (la misma lectura)');
  // Navegar trae menos que la lista a medias: las dos, de la lista.
  m.lua('for _, f in ipairs(BANCO.subasta.navegar) do if f.itemID == 2589 then f.totalQuantity = 5 end end');
  m.lua(`${R}.volver:Click()`);
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  hastaLeidas(m);
  abrirFila(m, 'Paño de lino');
  assert.equal(lino().cantidad, m.lua(`SnetForever.Texto.numero(${CANTIDADES_LINO.reduce((a, b) => a + b, 0)})`), 'a medias y más larga: de la lista');
  assert.equal(lino().compra, dinero(m, 29), 'la tuya de 28c no cuenta para el mínimo');
  // Sin ninguna subasta: el mínimo vacío (no el viejo de la búsqueda).
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return true end');
  m.lua('BANCO.subasta.mercancias[2589] = {}');
  clic(m, huecoDe(m, 'Paño de lino'));
  m.avanzar(0.1);
  assert.equal(hueco(m, huecoDe(m, 'Paño de lino') + 1).objeto, texto(m, 'SUBASTA_RES_SIN_SUBASTAS'));
  assert.equal(lino().compra, '', 'sin subastas, el mínimo vacío');
  assert.equal(lino().pct, '');
  sinErrores(m);
});

test('ronda 1: con la compra lista, una lista nueva del mismo objeto pone al día su total o la suelta si su subasta ya no está', () => {
  const m = maquina();
  m.lua(LINO());
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000, timeLeftSeconds = 9000}, {quantity = 1, buyoutAmount = 6000, timeLeftSeconds = 9000}}}})');
  abrir(m);
  buscar(m, 'paño');
  let i = abrirFila(m, 'Paño de lino');
  clic(m, i + 4); // 334 a 31c: 334 × 28 de la más barata
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  assert.equal(compraEstado(m).total, 334 * 28);
  // Se venden las de 28c y el jugador pone la fila al día: la lista nueva llega y la compra se recalcula con ella.
  m.lua(LINO(PRECIOS_LINO.slice(1), CANTIDADES_LINO.slice(1)));
  clic(m, huecoDe(m, 'Paño de lino'));
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).total], ['lista', 334 * 29], 'el total, de la lista de ahora');
  assert.ok(sinColores(barraTexto(m)).endsWith(sinColores(dinero(m, 334 * 29))), `la barra: ${barraTexto(m)}`);
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'COMERCIO_ELEGIR_CANTIDAD'), 'el botón (una mercancía, B2r)');
  assert.equal(hueco(m, huecoDe(m, 'Paño de lino') + 1).compra, dinero(m, 29), 'lo mismo que se ve');
  // Un objeto: su subasta desaparece de la lista nueva → la compra se suelta (ya no está).
  i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1); // la de 5000
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.lua('BANCO.subasta.objetos[4306] = {{quantity = 1, buyoutAmount = 6000, timeLeftSeconds = 9000, auctionID = 4306002}}');
  clic(m, huecoDe(m, 'Paño de seda'));
  m.avanzar(0.1);
  assert.notEqual(compraEstado(m).fase, 'lista', 'ya no está: no se queda lista');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B6r, ronda 2 de arreglos
// ---------------------------------------------------------------------------------------------------

// En el cliente, la lista es la foto de la última búsqueda (BANCO.subasta.foto): las baratas se venden en el servidor, la
// foto no cambia y el servidor rellenaría con unidades más caras que la fila. Lo único que lo para es comparar la
// cotización con lo que cuestan las unidades en la foto.
test('ronda 2: con la lista del cliente congelada, si las baratas se venden en el servidor y la cotización sale más cara, «cambió de precio» y nada se confirma, ni con dos clics', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({foto = true})');
  ventanitaLino(m); // 334 de la fila de 31c: en la foto, 334 × 28
  assert.equal(compraEstado(m).total, 334 * 28);
  // En el servidor se venden todas las de 28c: cotizará 334 × 29, y la foto sigue diciendo 28c.
  m.lua('table.remove(BANCO.subasta.mercancias[2589], 1)');
  assert.equal(m.lua('C_AuctionHouse.GetCommoditySearchResultInfo(2589, 1).unitPrice'), 28, 'la foto no cambia');
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'cambio_precio']);
  assert.ok(m.llamadas('C_AuctionHouse.CancelCommoditiesPurchase').length >= 1, 'la compra a medias se cancela');
  // Ni con dos clics más.
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  m.lua(`if SnetForever.CantidadComercio.abierto() then ${Q}.comprar:Click() end`);
  m.avanzar(0.1);
  m.lua(`${R}.comprar:Click()`);
  m.avanzar(0.1);
  assert.deepEqual(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase'), [[2589, 334]], 'no se vuelve a pedir');
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0, 'nada confirmado');
  assert.equal(barraTexto(m), texto(m, 'COMERCIO_BARRA_ERROR', texto(m, 'COMERCIO_MOTIVO_CAMBIO_PRECIO')));
  sinErrores(m);
});

test('ronda 2: con la lista del cliente congelada, una subasta de objeto vendida en el servidor no se compra ni se cambia por otra, ni con dos clics', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({foto = true, objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000, auctionID = 501, timeLeftSeconds = 9000}, {quantity = 1, buyoutAmount = 6000, auctionID = 502, timeLeftSeconds = 9000}}}})');
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1); // la de 5000
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  // Alguien la compra en el servidor; la foto del cliente aún la enseña.
  m.lua('table.remove(BANCO.subasta.objetos[4306], 1)');
  const oro = m.lua('BANCO.jugador.dinero');
  comprarDosClics(m); // un objeto suelto pide el segundo clic (arreglo de la compra suelta)
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'ya_no_esta'], 'el servidor dice que ya no está: no hay otro precio que aceptar');
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  m.avanzar(0.1);
  m.lua(`${R}.comprar:Click()`);
  m.avanzar(0.1);
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[501, 5000]], 'solo se pujó por la de la fila, a su precio: nunca por la de 6000');
  assert.equal(m.lua('BANCO.jugador.dinero'), oro, 'nada pagado');
  sinErrores(m);
});

test('ronda 2: si el recálculo sale con todas, «quedan M» se va y la barra y el botón dicen el mismo importe', () => {
  const m = maquina();
  ventanitaLino(m);
  const quedan = 5438 + 1096 + 2543 + 334 - 1000;
  m.lua(`${Q}.rapidos.max:Click()`);
  m.avanzar(0.6);
  m.lua('BANCO.subasta.mercancias[2589][1].quantity = 4438');
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).cantidad, compraEstado(m).quedan], [quedan, quedan], '«quedan M»');
  // Vuelven a la venta las 1000 de 28c y el jugador pone la fila al día: caben todas las M, con otro total.
  m.lua('BANCO.subasta.mercancias[2589][1].quantity = 5438');
  clic(m, huecoDe(m, 'Paño de lino'));
  m.avanzar(0.1);
  const e = compraEstado(m);
  assert.deepEqual([e.fase, e.cantidad, e.pedidas, e.quedan], ['lista', quedan, undefined, undefined], '«quedan M» se va');
  assert.equal(e.total, COSTE(quedan));
  assert.ok(barraTexto(m).includes(dinero(m, e.total)), `la barra dice el importe: ${barraTexto(m)}`);
  assert.ok(!barraTexto(m).startsWith('Ya no hay'), 'sin «quedan M»');
  // B2r, punto 1: el botón de una mercancía no lleva importe (no puede decir otro distinto del de la barra).
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), m.lua('SnetForever.L.t("COMERCIO_ELEGIR_CANTIDAD")'), 'el botón, sin importe');
  sinErrores(m);
});

test('ronda 2: con la compra lista, una lista a medias no suelta la subasta ni baja lo que queda: espera a la lista entera', () => {
  const m = maquina();
  m.lua(LINO());
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000, auctionID = 501, timeLeftSeconds = 9000}, {quantity = 1, buyoutAmount = 6000, auctionID = 502, timeLeftSeconds = 9000}}}})');
  abrir(m);
  buscar(m, 'paño');
  // Un objeto: llega una primera página sin la subasta elegida.
  let i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.lua('_G.ENTERA = false; C_AuctionHouse.HasFullItemSearchResults = function() return ENTERA end');
  m.lua('table.remove(BANCO.subasta.objetos[4306], 1)');
  clic(m, huecoDe(m, 'Paño de seda'));
  m.avanzar(0.1);
  assert.equal(compraEstado(m).fase, 'lista', 'a medias: espera');
  m.lua('ENTERA = true');
  clic(m, huecoDe(m, 'Paño de seda'));
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'ya_no_esta'], 'entera: ya no está');
  // Una mercancía: una lista a medias con menos unidades no baja lo que queda.
  i = abrirFila(m, 'Paño de lino');
  clic(m, i + 4); // 334 a 31c
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.lua('_G.ENTERA_M = false; C_AuctionHouse.HasFullCommoditySearchResults = function() return ENTERA_M end');
  // B7, menor 2: el escalón marcado (31c) sigue en la lista; si no, la compra se soltaría con «ya no está».
  m.lua(LINO([28, 31], [100, 10])); // la primera página solo trae 100 de 28c y 10 de 31c
  clic(m, huecoDe(m, 'Paño de lino'));
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).cantidad, compraEstado(m).quedan], ['lista', 334, undefined], 'a medias: espera');
  m.lua('ENTERA_M = true');
  clic(m, huecoDe(m, 'Paño de lino'));
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).cantidad, compraEstado(m).quedan], ['lista', 110, 110], 'entera: quedan 110');
  sinErrores(m);
});

test('ronda 2: el porqué se va al cerrar con el triángulo la fila abierta', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 4500}}}})');
  m.lua('SnetForever.Compra.elegir({item = 4306, precio = 4500, cantidad = 1})');
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  m.lua('rawset(_G, "B9", rawget(_G, "B9") or CreateFrame("Button")); B9:SetScript("OnClick", function() SnetForever.Compra.pulsar() end); B9:Click()');
  m.avanzar(0.6); // arreglo de la compra suelta: un objeto suelto pide el segundo clic
  m.lua('B9:Click()');
  clic(m, i + 4);
  const porque = texto(m, 'SUBASTA_RES_POR_QUE_OTRA_COMPRA');
  assert.equal(barraTexto(m), porque);
  m.lua(`${T}.huecos[${i}].abrir:Click()`); // cierra la fila con el triángulo
  assert.notEqual(barraTexto(m), porque, 'al cerrar la fila, el porqué se va');
  sinErrores(m);
});

test('ronda 2: el porqué se borra también con la vista escondida', () => {
  const m = maquina();
  m.lua(LINO());
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 4500}}}})');
  m.lua('SnetForever.Compra.elegir({item = 4306, precio = 4500, cantidad = 1})');
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  m.lua('rawset(_G, "B9", rawget(_G, "B9") or CreateFrame("Button")); B9:SetScript("OnClick", function() SnetForever.Compra.pulsar() end); B9:Click()');
  m.avanzar(0.6); // arreglo de la compra suelta: un objeto suelto pide el segundo clic
  m.lua('B9:Click()');
  clic(m, i + 4);
  const porque = texto(m, 'SUBASTA_RES_POR_QUE_OTRA_COMPRA');
  assert.equal(barraTexto(m), porque);
  // La vista se esconde (otra página) y, mientras, la otra compra acaba.
  m.lua(`${SV}.elegir("navegar")`);
  m.avanzar(0.2);
  assert.notEqual(compraEstado(m).fase, 'comprando');
  m.lua(`${SV}.elegir("resultados")`);
  assert.notEqual(barraTexto(m), porque, 'al volver, el porqué viejo no sale');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Revisión B7, Importante 1: la tabla de resultados sigue al asa (ver comercio-tabla-tamano.test.js).
// ---------------------------------------------------------------------------------------------------
const filasDe = (m, tabla) => m.lua(`#${tabla}.huecos`);
// Revisión B7, Importante 1 (regla de interfaz): con el asa cogida y el ratón parado justo donde cabe una fila
// más, el temblor de la mano (1 px arriba y abajo) no hace salir y esconderse la última fila, ni en vaivenes seguidos ni
// con un temblor suelto tras estar quieto más de 0,3 s (el fallo de 01d50a5). La tabla sigue al asa, como el oro: cogida,
// no sale ninguna fila nueva (solo se va la que deja de caber, y no vuelve); al soltar, las que caben, una sola vez.
// Lo visible se apunta desde ANTES del primer vaivén. `tabla` es la expresión de la tabla en Lua.
function sinParpadeoAlEstirar(m, tabla) {
  const anchoV = m.lua(`${V}:GetWidth()`);
  const resto = m.lua(`${V}:GetHeight()`) - m.lua(`${tabla}.marco:GetTop() - ${tabla}.marco:GetBottom()`);
  const n = filasDe(m, tabla);
  const limite = 22 + (n + 1) * 22 + resto; // el alto de ventana en que cabe justo la fila n + 1 (B3r: filas de 22)
  const poner = (alto) => m.lua(`${V}:SetSize(${anchoV}, ${alto})`);
  poner(limite - 1);
  m.avanzar(0.05);
  m.avanzar(0.05);
  assert.equal(filasDe(m, tabla), n, 'con 1 px menos que el límite, n filas');
  m.avanzar(0.5); // el ratón quieto más de 0,3 s
  const asa = `${SV}.marcos.asa`;
  m.lua(`${asa}:GetScript("OnMouseDown")(${asa}, "LeftButton")`);
  const vistas = [filasDe(m, tabla)]; // lo que se veía antes del primer vaivén
  const paso = (alto) => { poner(alto); m.avanzar(0.05); vistas.push(filasDe(m, tabla)); };
  // Un temblor suelto de 1 px tras estar quieto, y otro tras otra pausa.
  paso(limite); paso(limite - 1);
  m.avanzar(0.5); vistas.push(filasDe(m, tabla));
  paso(limite); paso(limite - 1);
  // Y diez vaivenes seguidos.
  for (let i = 0; i < 10; i++) { paso(limite); paso(limite - 1); }
  // Parado en el límite, aún con el asa cogida: nada sale hasta soltar.
  paso(limite); paso(limite);
  assert.deepEqual(vistas, vistas.map(() => n), `con el asa cogida no sale ninguna fila: ${vistas.join(' ')}`);
  // Al soltar, la fila n + 1 sale una vez y se queda.
  m.lua(`${asa}:GetScript("OnMouseUp")(${asa}, "LeftButton")`);
  const tras = [];
  for (let i = 0; i < 8; i++) { m.avanzar(0.05); tras.push(filasDe(m, tabla)); }
  assert.deepEqual(tras, tras.map(() => n + 1), `al soltar, las que caben, una vez: ${tras.join(' ')}`);
  // Encoger con el asa cogida: la fila que deja de caber se va una vez y no vuelve con el temblor, hasta soltar.
  m.avanzar(0.5);
  m.lua(`${asa}:GetScript("OnMouseDown")(${asa}, "LeftButton")`);
  const enc = [filasDe(m, tabla)];
  const pasoEnc = (alto) => { poner(alto); m.avanzar(0.05); enc.push(filasDe(m, tabla)); };
  for (let i = 0; i < 10; i++) { pasoEnc(limite - 1); pasoEnc(limite); }
  let cambios = 0;
  for (let i = 1; i < enc.length; i++) if (enc[i] !== enc[i - 1]) cambios++;
  assert.equal(cambios, 1, `encogiendo, la fila se va una vez y no vuelve: ${enc.join(' ')}`);
  assert.equal(enc.at(-1), n);
  m.lua(`${asa}:GetScript("OnMouseUp")(${asa}, "LeftButton")`);
  m.avanzar(0.05);
  assert.equal(filasDe(m, tabla), n + 1, 'al soltar en el límite, otra vez n + 1');
  return n;
}

test('B7: con el asa cogida, la última fila de resultados no sale y se esconde con el temblor (seguido o suelto)', () => {
  // 40 objetos: más filas de las que caben, así cada hueco que sale enseña una fila.
  const navegar = Array.from({ length: 40 }, (_, i) => `{itemID = ${3000 + i}, totalQuantity = 1, minPrice = ${100 + i}}`);
  const m = maquina({ navegar });
  m.lua('BANCO.tamanoPorAnclajes = true');
  abrir(m);
  buscar(m, 'a');
  m.avanzar(0.6);
  const n = sinParpadeoAlEstirar(m, T);
  assert.equal(visibles(m), n + 1, 'cada hueco enseña una fila');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Revisión B7, menores 1, 2, 5 y 7 (la vista de resultados).
// ---------------------------------------------------------------------------------------------------
const PRECIOS_B7 = [28, 29, 30, 31, 32, 33];
const CANTIDADES_B7 = [5438, 1096, 2543, 334, 372, 51];
const LINO_B7 = (p = PRECIOS_B7, c = CANTIDADES_B7) => `BANCO.ponerSubasta({mercancias = {[2589] = {${p.map((x, i) => `{quantity = ${c[i]}, unitPrice = ${x}, timeLeftSeconds = 30000}`).join(', ')}}}})`;
const clicHueco = (m, i) => m.lua(`${T}.huecos[${i}]:Click()`);
const comprarEncendido = (m) => m.lua(`${R}.comprar:IsEnabled() and not ${R}.comprar.snfApagado`) === true;
// Abre lino y elige su escalón de 31c (334 unidades): la compra queda «lista».
function elegir31(m) {
  m.lua(LINO_B7());
  abrir(m);
  buscar(m);
  clicHueco(m, huecoDe(m, 'Paño de lino'));
  m.avanzar(0.1);
  const i = huecoDe(m, 'Paño de lino');
  clicHueco(m, i + 4);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  assert.equal(compraEstado(m).cantidad, 334);
  return i;
}

// Menor 1 (la sonda de la revisión): una cotización suelta de otra cantidad no se enseña como la de las pedidas.
test('B7: «Confirmar 6000 por 28c» nunca se enseña: una cotización de otra cantidad se tira', () => {
  const m = maquina();
  elegir31(m);
  m.lua(`${R}.comprar:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  m.lua(`${Q}.caja:SetText("6000"); ${Q}.caja:GetScript("OnEnterPressed")(${Q}.caja)`);
  m.avanzar(0.6);
  m.lua(`${Q}.comprar:Click()`);
  assert.equal(m.llamadas('C_AuctionHouse.StartCommoditiesPurchase').at(-1)[1], 6000);
  // Antes de que responda el juego, llega una cotización suelta de 1 unidad (28c).
  m.disparar('COMMODITY_PRICE_UPDATED', 28, 28);
  const vistos = [m.lua(`${Q}.comprar.texto:GetText()`), m.lua(`${R}.comprar.texto:GetText()`)];
  assert.notEqual(compraEstado(m).fase, 'confirmar', 'la suelta no lleva a confirmar');
  m.lua(`${Q}.comprar:Click()`);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0, 'ni con un clic');
  m.avanzar(0.1); // llega la de verdad
  vistos.push(m.lua(`${Q}.comprar.texto:GetText()`), m.lua(`${R}.comprar.texto:GetText()`));
  for (const v of vistos) assert.ok(!/28c|28 c/.test(v || ''), `nunca «por 28c»: ${v}`);
  const e = compraEstado(m);
  assert.equal(e.cantidad, 6000);
  assert.ok(e.fase !== 'confirmar' || e.total > 6000 * 28, `la de verdad, de 6000: ${JSON.stringify(e)}`);
  sinErrores(m);
});
// Menor 2: el escalón marcado ya no está en la lista llegada entera: la compra se suelta y la barra dice «ya no está».
test('B7: si el escalón marcado de una mercancía ya no está en la lista entera, se suelta la compra y se dice', () => {
  const m = maquina();
  const i = elegir31(m);
  assert.equal(comprarEncendido(m), true);
  // La lista de ahora ya no trae el escalón de 31c (las más baratas cubren de sobra las 334).
  m.lua(LINO_B7([28, 29, 30, 32, 33], [5438, 1096, 2543, 372, 51]));
  clicHueco(m, i); // el jugador pulsa la fila del objeto: se piden otra vez sus subastas
  m.avanzar(0.3);
  const e = compraEstado(m);
  assert.ok(!(e.fase === 'lista' || e.fase === 'confirmar'), `la compra se suelta (${e.fase})`);
  assert.equal(comprarEncendido(m), false, 'Comprar apagado');
  assert.ok(!String(m.lua(`${T}:elegida()`) || '').includes(':p'), 'ninguna subasta marcada');
  assert.equal(m.lua(`${R}.barra.texto:GetText()`), texto(m, 'COMERCIO_MOTIVO_YA_NO_ESTA'), 'la barra dice por qué');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('B7: si la subasta marcada de un objeto ya no está en la lista entera, se suelta la compra y se dice', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  clicHueco(m, huecoDe(m, 'Paño de seda'));
  m.avanzar(0.1);
  const i = huecoDe(m, 'Paño de seda');
  clicHueco(m, i + 2); // la de 5000 (la segunda por precio por unidad)
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  assert.equal(comprarEncendido(m), true);
  // Se vende: la lista de ahora solo trae la otra.
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 2, buyoutAmount = 4500, timeLeft = 1, auctionID = 4306002}}}})');
  clicHueco(m, i);
  m.avanzar(0.3);
  const e = compraEstado(m);
  assert.ok(!(e.fase === 'lista' || e.fase === 'confirmar'), `la compra se suelta (${e.fase})`);
  assert.equal(comprarEncendido(m), false, 'Comprar apagado');
  assert.ok(!String(m.lua(`${T}:elegida()`) || '').includes(':a'), 'ninguna subasta marcada');
  assert.ok(String(m.lua(`${R}.barra.texto:GetText()`)).includes(texto(m, 'COMERCIO_MOTIVO_YA_NO_ESTA')), 'la barra dice «ya no está»');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// Menor 7: la subasta de objeto comprada aquí se quita de la lista al acabar la compra.
test('B7: tras comprar una subasta de objeto elegida en resultados, ya no sale en la lista', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  clicHueco(m, huecoDe(m, 'Paño de seda'));
  m.avanzar(0.1);
  const i = huecoDe(m, 'Paño de seda');
  const comprada = hueco(m, i + 2).clave;
  clicHueco(m, i + 2);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  comprarDosClics(m);
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'hecho', 100), 'la compra acaba');
  m.avanzar(0.1);
  const claves = [];
  for (let k = 1; k <= 8; k++) { const h = hueco(m, k); if (h) claves.push(h.clave); }
  assert.ok(!claves.includes(comprada), `la comprada ya no sale: ${claves.join(', ')}`);
  assert.equal(hueco(m, i + 1).compra, dinero(m, 4500), 'la otra sigue');
  sinErrores(m);
});

// Menor 5: la tabla no se mueve sola mientras llega la búsqueda.
const ordenObjetos = (m) => m.lua(`(function() local s = {} for _, h in ipairs(${T}.huecos) do if h:IsShown() and h.fila and not h.fila.subasta and not h.fila.aviso then s[#s + 1] = h.fila.nombre end end return s end)()`) || [];
test('B7: mientras se busca, las filas van en el orden en que llegan; al acabar se ordenan una vez', () => {
  // Una fila por página: llegan seda (4500), lana (300) y lino (120); por Compra irían al revés.
  const m = maquina({ porPagina: 1 });
  abrir(m);
  m.lua(`${N}.campo:SetText("paño"); ${N}.buscar:Click()`);
  const vistas = [];
  for (let k = 0; k < 200 && estado(m) !== 'completa'; k++) { m.avanzar(0.05); vistas.push(ordenObjetos(m).join('|')); }
  m.avanzar(0.05);
  vistas.push(ordenObjetos(m).join('|'));
  const final = vistas.at(-1);
  assert.equal(final, 'Paño de lino|Paño de lana|Paño de seda', 'al acabar, por Compra');
  // Antes de acabar, cada fotograma solo añade filas al final (ninguna cambia de sitio).
  const enCurso = vistas.slice(0, vistas.indexOf(final));
  for (let k = 1; k < enCurso.length; k++) {
    assert.ok(enCurso[k].startsWith(enCurso[k - 1]), `sin moverse: «${enCurso[k - 1]}» → «${enCurso[k]}»`);
  }
  assert.ok(enCurso.includes('Paño de seda|Paño de lana|Paño de lino') || enCurso.includes('Paño de seda|Paño de lana'), `en el orden de llegada: ${enCurso.join(' / ')}`);
  // Una sola vez: después ya no cambia.
  const tras = [];
  for (let k = 0; k < 6; k++) { m.avanzar(0.05); tras.push(ordenObjetos(m).join('|')); }
  assert.deepEqual(tras, tras.map(() => final));
  sinErrores(m);
});

test('B7: un nombre que llega tarde no reordena la tabla', () => {
  const m = maquina();
  m.lua('BANCO.ponerSubasta({navegar = {{itemID = 4306, totalQuantity = 3, minPrice = 4500}, {itemID = 2592, totalQuantity = 7, minPrice = 300}, {itemID = 7777, totalQuantity = 1, minPrice = 999}}, porPagina = 50})');
  abrir(m);
  buscar(m, 'paño');
  m.lua(`${T}:ordenarPor("objeto", true)`);
  const antes = ordenObjetos(m);
  const k = antes.findIndex((x) => !x.startsWith('Paño'));
  assert.equal(antes.length, 3);
  // Llega su nombre, que por orden alfabético iría al otro extremo.
  const nuevo = k === 0 ? 'Zzz objeto' : 'Aaa objeto';
  m.itemInfo(7777, { nombre: nuevo, calidad: 1, nivel: 1 });
  m.disparar('GET_ITEM_INFO_RECEIVED', 7777, true);
  for (let j = 0; j < 10; j++) m.avanzar(0.05);
  const despues = ordenObjetos(m);
  assert.equal(despues[k], nuevo, `el nombre sale en su sitio, sin moverse: ${despues}`);
  assert.deepEqual(despues.filter((_, j) => j !== k), antes.filter((_, j) => j !== k));
  sinErrores(m);
});

test('B7: «Cargando subastas…» solo sale si la respuesta tarda más de 0,4 s, y no sale y se va en fotogramas seguidos', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const cargando = texto(m, 'SUBASTA_RES_CARGANDO');
  const hayCargando = () => m.lua(`(function() for _, h in ipairs(${T}.huecos) do if h:IsShown() and h.celdas.objeto:GetText() == ${aLua(cargando)} then return true end end return false end)()`);
  // Respuesta rápida (el fotograma siguiente): nunca sale.
  clicHueco(m, huecoDe(m, 'Paño de lino'));
  const rapida = [hayCargando()];
  for (let k = 0; k < 10; k++) { m.avanzar(0.05); rapida.push(hayCargando()); }
  assert.deepEqual(rapida, rapida.map(() => false), 'con respuesta rápida, nunca «Cargando»');
  assert.equal(visibles(m), 5, 'las 3 filas y las 2 subastas de lino');
  // Respuesta lenta: la búsqueda de la seda no se responde hasta pasado 1 s.
  m.lua(`_G.ORIGINAL = C_AuctionHouse.SendSearchQuery; C_AuctionHouse.SendSearchQuery = function(...) _G.PENDIENTE = {...} end`);
  clicHueco(m, huecoDe(m, 'Paño de seda'));
  const lenta = [hayCargando()];
  for (let k = 0; k < 20; k++) { m.avanzar(0.05); lenta.push(hayCargando()); }
  assert.equal(lenta.slice(0, 7).some((x) => x), false, `no antes de 0,35 s: ${lenta}`);
  assert.equal(lenta.at(-1), true, 'pasado el umbral, sale');
  m.lua('C_AuctionHouse.SendSearchQuery = _G.ORIGINAL; C_AuctionHouse.SendSearchQuery(unpack(_G.PENDIENTE))');
  for (let k = 0; k < 20; k++) { m.avanzar(0.05); lenta.push(hayCargando()); }
  assert.equal(lenta.at(-1), false, 'al llegar, se va');
  let cambios = 0;
  for (let k = 1; k < lenta.length; k++) if (lenta[k] !== lenta[k - 1]) cambios++;
  assert.equal(cambios, 2, `sale una vez y se va una vez: ${lenta.map((x) => (x ? 1 : 0)).join('')}`);
  sinErrores(m);
});

test('B7: «Cargando subastas…», una vez a la vista, no se va al fotograma siguiente aunque la respuesta llegue justo entonces', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const cargando = texto(m, 'SUBASTA_RES_CARGANDO');
  const hayCargando = () => m.lua(`(function() for _, h in ipairs(${T}.huecos) do if h:IsShown() and h.celdas.objeto:GetText() == ${aLua(cargando)} then return true end end return false end)()`);
  m.lua(`_G.ORIGINAL = C_AuctionHouse.SendSearchQuery; C_AuctionHouse.SendSearchQuery = function(...) _G.PENDIENTE = {...} end`);
  clicHueco(m, huecoDe(m, 'Paño de seda'));
  const vistos = [hayCargando()];
  while (!hayCargando() && vistos.length < 40) { m.avanzar(0.05); vistos.push(hayCargando()); }
  assert.equal(vistos.at(-1), true);
  // Justo ahora llega la respuesta.
  m.lua('C_AuctionHouse.SendSearchQuery = _G.ORIGINAL; C_AuctionHouse.SendSearchQuery(unpack(_G.PENDIENTE))');
  const tras = [];
  for (let k = 0; k < 20; k++) { m.avanzar(0.05); tras.push(hayCargando()); }
  assert.equal(tras[0], true, 'no se va al fotograma siguiente');
  assert.equal(tras.at(-1), false, 'se va después');
  let cambios = 0;
  for (let k = 1; k < tras.length; k++) if (tras[k] !== tras[k - 1]) cambios++;
  assert.equal(cambios, 1, tras.map((x) => (x ? 1 : 0)).join(''));
  sinErrores(m);
});

// T1a, ronda 1 (sin parpadeos): el tooltip al cruzar de una fila a otra y al temblar en un borde, fotograma a fotograma (como la
// prueba del asa de la ventana). a y b son dos filas de objeto seguidas; l, la última fila de objeto que se ve. Devuelve la
// visibilidad del tooltip en cada fotograma, desde antes del primer cruce, cuántas veces se llamó a Hide al cruzar y, por
// fotograma, si el fondo del ratón de cada fila se ve encendido (LUZ: cómo se mira en esta tabla).
const TEMBLOR = (a, b, l, luz) => `(function()
  local vis, hides = {GameTooltip:IsShown()}, 0
  local luces, objetos = {}, {}
  local esconder = GameTooltip.Hide
  GameTooltip.Hide = function(self) hides = hides + 1; return esconder(self) end
  -- El fondo del ratón de una fila (el resalte): ¿se ve encendido?
  local encendida = ${luz}
  local a, b, l = ${a}, ${b}, ${l}
  local function foto()
    BANCO.avanzar(0.05)
    vis[#vis + 1] = GameTooltip:IsShown()
    luces[#luces + 1] = {encendida(a), encendida(b), encendida(l)}
    objetos[#objetos + 1] = GameTooltip:IsShown() and (BANCO.lineasTooltip())[1] or false
  end
  local function en(f) f:GetScript("OnEnter")(f) end
  local function fuera(f) f:GetScript("OnLeave")(f) end
  en(a); foto()
  -- Cruzar por el borde de dos filas, ida y vuelta en fotogramas seguidos (el OnLeave llega antes que el OnEnter).
  for _ = 1, 10 do fuera(a); en(b); foto(); fuera(b); en(a); foto() end
  local cruce = {hides = hides, vis = {unpack(vis)}, luces = {unpack(luces)}, objetos = {unpack(objetos)}}
  -- Temblar en el borde de la última fila: fuera y dentro en fotogramas seguidos.
  fuera(a); en(l); BANCO.avanzar(0.5); foto()
  local desde = #vis
  for _ = 1, 10 do fuera(l); foto(); en(l); foto() end
  local borde, luzBorde = {}, {}
  for i = desde, #vis do borde[#borde + 1] = vis[i]; luzBorde[#luzBorde + 1] = luces[i - 1][3] end
  -- Y al irse de verdad, se esconde y se apaga.
  fuera(l)
  for _ = 1, 10 do foto() end
  GameTooltip.Hide = esconder
  local ultima = luces[#luces]
  return {cruce = cruce, borde = borde, luzBorde = luzBorde, final = GameTooltip:IsShown(), todo = vis,
    apagadas = not (ultima[1] or ultima[2] or ultima[3])}
end)()`;
// ¿Pasa de «a la vista» (o encendida) a «escondido» y otra vez a «a la vista»?
const parpadea = (vis) => {
  let visto = false;
  let escondidoTras = false;
  for (const v of vis) {
    if (v && escondidoTras) return true;
    if (v) visto = true;
    else if (visto) escondidoTras = true;
  }
  return false;
};
const comprobarTemblor = (r) => {
  assert.equal(r.cruce.hides, 0, 'al cruzar de una fila a otra no hay ningún Hide');
  assert.deepEqual(r.cruce.vis, [false, ...r.cruce.vis.slice(1).map(() => true)], `al cruzar, siempre a la vista: ${r.cruce.vis}`);
  assert.deepEqual(r.borde, r.borde.map(() => true), `temblando en el borde de la última fila no se esconde: ${r.borde}`);
  assert.equal(parpadea(r.todo.slice(0, -10)), false, 'nunca sale, se esconde y vuelve a salir');
  assert.equal(r.final, false, 'al irse de verdad, se esconde');
  // El fondo del ratón: al cruzar siempre hay una fila encendida y ninguna se enciende, se apaga y se vuelve a encender.
  const luces = r.cruce.luces;
  assert.ok(luces.every((x) => x[0] || x[1]), `al cruzar, siempre una fila encendida: ${JSON.stringify(luces)}`);
  assert.equal(parpadea(luces.map((x) => x[0])), false, `la primera fila no se enciende y se apaga en fotogramas seguidos: ${luces.map((x) => (x[0] ? 1 : 0)).join('')}`);
  assert.equal(parpadea(luces.map((x) => x[1])), false, `la segunda tampoco: ${luces.map((x) => (x[1] ? 1 : 0)).join('')}`);
  assert.deepEqual(r.luzBorde, r.luzBorde.map(() => true), `temblando en el borde de la última fila su fondo no se apaga: ${r.luzBorde}`);
  assert.equal(r.apagadas, true, 'al irse de verdad, ninguna queda encendida');
  // El tooltip va con la luz: temblando entre dos filas de objeto no cambia de objeto (ni de contenido ni de tamaño).
  const objetos = r.cruce.objetos;
  assert.ok(objetos[0], 'al entrar, el tooltip de la primera fila');
  assert.deepEqual(objetos, objetos.map(() => objetos[0]), `temblando entre dos filas, siempre el mismo objeto: ${objetos.join(' | ')}`);
};
const LUZ = 'function(h) local c, b = {h.fondo:GetVertexColor()}, SnetForever.Estilo.comercio("filas"); return math.abs(c[1] - b[1]) + math.abs(c[2] - b[2]) + math.abs(c[3] - b[3]) > 0.001 end';

test('sin parpadeos: en los resultados el tooltip no se esconde al cruzar de una fila a otra ni al temblar en el borde de la última', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  comprobarTemblor(m.lua(TEMBLOR('SnetForever.SubastaResultados.marcos.tabla.huecos[1]', 'SnetForever.SubastaResultados.marcos.tabla.huecos[2]', 'SnetForever.SubastaResultados.marcos.tabla.huecos[3]', LUZ)));
  sinErrores(m);
});

// Ronda 1, Importante 2: con el ratón parado sobre un objeto, «Cargando subastas…» (un aviso, no un objeto) queda debajo: el
// tooltip del objeto de antes se va.
test('con el ratón parado, si debajo queda un aviso (no un objeto), el tooltip del objeto de antes se va', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const i = huecoDe(m, 'Paño de lino');
  const H = `SnetForever.SubastaResultados.marcos.tabla.huecos[${i + 1}]`;
  m.lua(`${H}:GetScript("OnEnter")(${H})`);
  assert.equal(m.lua(`GameTooltip:IsShown() and GameTooltip:GetOwner() == ${H}`), true, 'el tooltip del objeto de debajo del lino');
  m.lua('_G.ORIGINAL = C_AuctionHouse.SendSearchQuery; C_AuctionHouse.SendSearchQuery = function(...) _G.PENDIENTE = {...} end');
  clicHueco(m, i);
  m.avanzar(1);
  assert.equal(m.lua(`${H}.celdas.objeto:GetText()`), texto(m, 'SUBASTA_RES_CARGANDO'), 'debajo del ratón, el aviso');
  assert.equal(m.lua('GameTooltip:IsShown()'), false, 'el tooltip del objeto de antes se va');
  m.lua('C_AuctionHouse.SendSearchQuery = _G.ORIGINAL');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B2r: lo que pidió la captura B2 sobre Comprar (botón, redondeo y vendedor) y el nombre con sufijo
// ---------------------------------------------------------------------------------------------------

// Punto 2: el total real era 4g 27s 70c (lo decía la barra) y el botón ponía «~5g». Un botón ancho (Comprar de resultados,
// 210 px) mide con la letra real si el importe cabe entero y, si cabe, no redondea.
test('un botón ancho pone el importe exacto: 42770 sale 4g 27s 70c', () => {
  const m = maquina();
  letraReal(m);
  // Arreglo de la compra suelta: 5 subastas iguales de 1 a 42770 cada una (como en WoW Forever); un clic compra 1.
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 5, buyoutAmount = 42770, timeLeftSeconds = 9000}}}})');
  abrir(m);
  buscar(m, 'paño');
  const j = abrirFila(m, 'Paño de seda');
  clic(m, j + 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  assert.equal(compraEstado(m).total, 42770);
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'SUBASTA_RES_COMPRAR', '1', '4g 27s 70c'), 'el importe exacto');
  assert.ok(m.lua(`${R}.comprar.texto:GetUnboundedStringWidth()`) <= m.lua(`${R}.comprar:GetWidth()`) - 8, 'y cabe con la letra real');
  sinErrores(m);
});

// Punto 2: si un botón estrecho tiene que redondear, nunca hacia arriba (el botón no enseña más de lo que se paga ni el
// jugador cree que pagará más): a la unidad mayor que haya, hacia abajo, con «~». Es el único «~» de dinero del addon
// (UIComercio.etiquetaConImporte).
test('un botón estrecho redondea hacia abajo: 42770 sale ~4g, nunca ~5g', () => {
  const m = maquina();
  letraReal(m);
  abrir(m);
  buscar(m, 'paño');
  const t = `${R}.comprar.texto`;
  const f = (cobre, ancho = 99) => m.lua(`(function()
    local t = ${t}
    local antes = t:GetText()
    local r = SnetForever.UIComercio.etiquetaConImporte(${cobre}, t, ${ancho}, function(x) return SnetForever.L.t("SUBASTA_RES_COMPRAR", "235", x) end)
    t:SetText(antes)
    return r
  end)()`);
  assert.equal(f(42770), texto(m, 'SUBASTA_RES_COMPRAR', '235', '~4g'), '4g 27s 70c, hacia abajo');
  assert.equal(f(49999), texto(m, 'SUBASTA_RES_COMPRAR', '235', '~4g'), '4g 99s 99c sigue en 4g');
  assert.equal(f(9999), texto(m, 'SUBASTA_RES_COMPRAR', '235', '~99s'), '99s 99c no sube a 1g');
  assert.equal(f(12345678), texto(m, 'SUBASTA_RES_COMPRAR', '235', '~1234g'), '1234g 56s 78c');
  // B3r: el sitio del texto de Comprar es 202 (210 - 8; antes 182 con Comprar de 190 y la letra Medium 11).
  assert.equal(f(42770, 202), texto(m, 'SUBASTA_RES_COMPRAR', '235', '4g 27s 70c'), 'si cabe, entero');
  assert.equal(f(5), texto(m, 'SUBASTA_RES_COMPRAR', '235', '5c'), 'solo cobre: siempre entero');
  sinErrores(m);
});

// Punto 1: con una mercancía elegida el botón decía «Comprar 235 por ~5g» y el jugador creía que solo podía comprar la
// subasta entera. En las mercancías Comprar abre el cuadro de cantidad: dice «Elegir cantidad…», sin unidades ni importe
// (la barra sigue diciendo lo elegido con su importe exacto). Con un objeto sigue diciendo «Comprar N por X».
test('con una mercancía elegida, Comprar dice «Elegir cantidad…» y abre el cuadro; con un objeto dice «Comprar N por X»', () => {
  const m = maquina();
  m.lua(LINO());
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 10416, timeLeftSeconds = 9000}}}})');
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  clic(m, i + 4); // 334 por 93s 52c
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'COMERCIO_ELEGIR_CANTIDAD'), 'sin cifra de unidades ni importe');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), false, 'encendido');
  assert.ok(sinColores(barraTexto(m)).endsWith('93s 52c'), `la barra, con su importe exacto: ${barraTexto(m)}`);
  m.lua(`${R}.comprar:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true, 'abre el cuadro');
  assert.equal(compras(m), 0, 'y no compra');
  m.lua('SnetForever.CantidadComercio.cerrar()');
  // Un objeto que no es mercancía: «Comprar N por X».
  const j = abrirFila(m, 'Paño de seda');
  clic(m, j + 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'SUBASTA_RES_COMPRAR', '1', '1g 04s 16c'));
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    assert.ok(/…$/.test(texto(m, 'COMERCIO_ELEGIR_CANTIDAD')), `${idioma}: con sus puntos suspensivos`);
  }
  sinErrores(m);
});

// Punto 3 (captura b2r-1): en Paño de lana, una mercancía, la primera subasta enseñaba el vendedor «El Hueson» y las demás
// no. Causa: comercio/busqueda.lua leía también en las mercancías el primer nombre de owners de
// GetCommoditySearchResultInfo, y el cliente solo lo trae en algunos escalones. Regla: en las mercancías no hay vendedor,
// como en TSM: la columna queda vacía en todas las filas y el tooltip de la subfila no lo dice.
test('en una mercancía el vendedor queda vacío en todas las filas y en el tooltip', () => {
  const m = maquina();
  m.lua(SUBASTAS); // las de lino traen owners = {"Fulano"}, como la primera de lana en el juego
  m.lua('local A = C_AuctionHouse; local f = A.GetCommoditySearchResultInfo; A.GetCommoditySearchResultInfo = function(id, i) local r = f(id, i) if r and i == 1 then r.owners = {"El Hueson"} end return r end');
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lino');
  for (const k of [1, 2]) {
    const s = hueco(m, i + k);
    assert.equal(s.vendedor, '', `subasta ${k}: sin vendedor`);
    assert.equal(m.lua(`${T}.huecos[${i + k}].fila.vendedor`), undefined, `subasta ${k}: ni en memoria`);
    entrar(m, `${T}.huecos[${i + k}]`);
    const l = lineasTt(m).map(sinColores);
    assert.ok(l.length > 0 && !l.some((x) => x.includes('Fulano') || x.includes('El Hueson')), `subasta ${k}: el tooltip no dice vendedor: ${l}`);
    assert.ok(l.includes(sinColores(texto(m, 'SUBASTA_RES_TT_COMPRA', dinero(m, k === 1 ? 120 : 150)))), `subasta ${k}: sí su compra`);
    salir(m, `${T}.huecos[${i + k}]`);
    m.avanzar(0.3);
  }
  assert.equal(m.lua('(function() for _, s in ipairs(SnetForever.Busqueda.subastas(2589) or {}) do if s.vendedor then return s.vendedor end end end)()'), undefined, 'SNF.Busqueda no lo da');
  // Un objeto sí lo lleva (solo en pantalla).
  const j = abrirFila(m, 'Paño de seda');
  assert.equal(hueco(m, j + 2).vendedor, 'Mengano');
  sinErrores(m);
});

// Punto 3: el vendedor nunca se guarda (solo vive en memoria y en pantalla). Se mira todo lo guardado tras desplegar,
// elegir, comprar, buscar otra cosa y salir de la subasta.
test('el vendedor no está en lo guardado', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const j = abrirFila(m, 'Paño de seda');
  assert.equal(hueco(m, j + 2).vendedor, 'Mengano', 'se ve en pantalla');
  clic(m, j + 2);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  comprarDosClics(m);
  m.avanzar(0.2);
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 1, 'comprada');
  abrirFila(m, 'Paño de lino');
  m.lua(`${R}.volver:Click()`);
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.avanzar(0.5);
  const guardado = JSON.stringify(m.guardado());
  assert.ok(guardado.length > 2, 'hay algo guardado que mirar');
  for (const nombre of ['Mengano', 'Fulano']) assert.ok(!guardado.includes(nombre), `«${nombre}» no está en lo guardado`);
  sinErrores(m);
});

// Punto 4 (captura b2r-2, «del oso»): cinco filas padre decían igual «Rodela de oso pardo» y cada una era una variante con
// otro sufijo; el sufijo solo se veía al desplegar. La fila padre enseña su nombre completo, como TSM: primero el de la
// itemKey de la búsqueda (GetItemKeyInfo, que en WoW Forever trae el nombre con su sufijo: así lo lee TSM) y, si no lo trae,
// el del enlace de su primera subasta en cuanto llegan.
const RODELA = 6078;
const SUFIJOS = { 1: 'Rodela de oso pardo de magia', 2: 'Rodela de oso pardo del oso', 3: 'Rodela de oso pardo del águila', 4: 'Rodela de oso pardo del mono', 5: 'Rodela de oso pardo de la ballena' };
const NAVEGAR_RODELAS = [1, 2, 3, 4, 5].map((s) => `{itemKey = {itemID = ${RODELA}, itemLevel = 13, itemSuffix = ${s}, battlePetSpeciesID = 0}, totalQuantity = 1, minPrice = ${40000 + s}}`);
function maquinaRodelas({ tarde = false, nombres = SUFIJOS } = {}) {
  const m = maquina({ navegar: NAVEGAR_RODELAS });
  m.itemInfo(RODELA, { nombre: 'Rodela de oso pardo', calidad: 2, nivel: 13, equipa: 'INVTYPE_SHIELD' });
  const lista = Object.entries(nombres).map(([s, n]) => `[${s}] = ${aLua(n)}`).join(', ');
  m.lua(`BANCO.ponerSubasta({nombresClave = {[${RODELA}] = {${lista}}}, claveTarde = ${tarde}})`);
  return m;
}
// Los nombres de las filas padre que se ven, por su clave (el sufijo), en el orden de la tabla.
const nombresPadre = (m) => m.lua(`(function()
  local r = {}
  for _, h in ipairs(${T}.huecos) do
    local f = h:IsShown() and h.fila
    if f and not f.subasta and not f.aviso then r[#r + 1] = {f.res.clave.itemSuffix, h.celdas.objeto:GetText()} end
  end
  return r
end)()`) || [];

test('cinco variantes del mismo objeto con distinto sufijo salen en la fila padre con su nombre completo, sin desplegar', () => {
  for (const tarde of [false, true]) {
    const m = maquinaRodelas({ tarde });
    abrir(m);
    buscar(m, 'del oso');
    m.avanzar(0.3); // con claveTarde, ITEM_KEY_ITEM_INFO_RECEIVED ya ha llegado (y los nombres se agrupan 0,2 s)
    const filas = nombresPadre(m);
    assert.equal(filas.length, 5, `${tarde}: cinco filas padre`);
    for (const [s, nombre] of filas) assert.equal(nombre, SUFIJOS[s], `${tarde}: la variante ${s} con su sufijo`);
    assert.equal(new Set(filas.map((f) => f[1])).size, 5, `${tarde}: ninguna repetida`);
    // B3r: sin desplegar ninguna (la lectura sí pide sus subastas, pero los nombres ya salen de la itemKey).
    assert.equal(m.lua(`(function() for i = 1, 5 do local f = ${T}:fila(i) if f and ${T}:estaAbierta(f.clave) then return true end end return false end)()`), false, `${tarde}: sin desplegar ninguna`);
    assert.ok(m.llamadas('C_AuctionHouse.GetItemKeyInfo').length > 0, `${tarde}: lo saca de la itemKey`);
    sinErrores(m);
  }
});

test('el nombre de la fila padre cambia como mucho una vez', () => {
  // La 5 no la trae GetItemKeyInfo con sufijo: sale del enlace de su primera subasta al desplegarla.
  const nombres = { ...SUFIJOS };
  delete nombres[5];
  const m = maquinaRodelas({ tarde: true, nombres });
  m.lua(`BANCO.ponerSubasta({objetos = {[${RODELA}] = {{quantity = 1, buyoutAmount = 40005, timeLeftSeconds = 7000, itemLink = ${aLua(`|cff1eff00|Hitem:${RODELA}::::::::13:::::::|h[${SUFIJOS[5]}]|h|r`)}}}}})`);
  abrir(m);
  const vistos = {}; // [sufijo] = nombres distintos seguidos
  const orden = [];
  const mirar = () => {
    const filas = nombresPadre(m);
    for (const [s, nombre] of filas) {
      const v = vistos[s] || (vistos[s] = []);
      if (v[v.length - 1] !== nombre) v.push(nombre);
    }
    orden.push(filas.map((f) => f[0]).join(','));
  };
  m.lua(`${N}.campo:SetText("del oso"); ${N}.buscar:Click()`);
  for (let k = 0; k < 40; k++) { m.avanzar(0.05); mirar(); }
  assert.equal(estado(m), 'completa');
  for (const s of [1, 2, 3, 4]) {
    assert.ok(vistos[s].length <= 2, `la ${s} cambia como mucho una vez: ${vistos[s].join(' → ')}`);
    assert.equal(vistos[s][vistos[s].length - 1], SUFIJOS[s], `la ${s} acaba con su sufijo`);
  }
  // B3r: la lectura trae la primera subasta de la 5 con su enlace sin desplegarla: su fila padre cambia una sola vez, al
  // nombre del enlace, y nada se reordena (antes cambiaba al desplegarla).
  assert.deepEqual(vistos[5], ['Rodela de oso pardo', SUFIJOS[5]], 'la 5, sin sufijo en la itemKey: cambia una vez, con su lectura');
  const ordenAlAcabar = orden[orden.length - 1];
  assert.ok(orden.slice(orden.indexOf(ordenAlAcabar)).every((o) => o === ordenAlAcabar), 'las lecturas no reordenan la tabla');
  // Al desplegarla no cambia más.
  clic(m, huecoDe(m, SUFIJOS[5]));
  for (let k = 0; k < 20; k++) { m.avanzar(0.05); mirar(); }
  assert.deepEqual(vistos[5], ['Rodela de oso pardo', SUFIJOS[5]], 'la 5 no vuelve a cambiar');
  for (const s of [1, 2, 3, 4]) assert.ok(vistos[s].length <= 2, `la ${s} no vuelve a cambiar`);
  assert.equal(orden[orden.length - 1], ordenAlAcabar, 'el nombre nuevo no reordena la tabla');
  // Cerrarla y volver a abrirla (o ver otra vez la itemKey) no la cambia más.
  clic(m, huecoDe(m, SUFIJOS[5]));
  for (let k = 0; k < 10; k++) { m.avanzar(0.05); mirar(); }
  assert.deepEqual(vistos[5], ['Rodela de oso pardo', SUFIJOS[5]]);
  sinErrores(m);
});

// Punto 2, caso visto en el juego: el botón principal del cuadro «Confirmar pedido» decía «Comprar 235 por ~5g» con el
// total 4g 27s 70c encima. Es un botón ancho: el importe va exacto.
test('el botón del cuadro dice el total exacto: 235 por 4g 27s 70c', () => {
  const m = maquina();
  letraReal(m);
  m.lua('BANCO.ponerSubasta({mercancias = {[2592] = {{quantity = 235, unitPrice = 182, timeLeftSeconds = 80000}, {quantity = 560, unitPrice = 184, timeLeftSeconds = 80000}}}})');
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de lana');
  clic(m, i + 1); // la de 235
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  assert.deepEqual([compraEstado(m).cantidad, compraEstado(m).total], [235, 42770]);
  assert.equal(m.lua(`${Q}.total:GetText()`), '4g 27s 70c');
  assert.equal(m.lua(`${Q}.comprar.texto:GetText()`), texto(m, 'COMERCIO_CANT_COMPRAR', 235, '4g 27s 70c'));
  assert.ok(m.lua(`${Q}.comprar.texto:GetUnboundedStringWidth()`) <= m.lua(`${Q}.comprar:GetWidth()`) - 16, 'cabe con la letra real');
  // A medio confirmar, «Confirmar 235 por 4g 27s 70c», también exacto.
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  assert.equal(compraEstado(m).fase, 'confirmar');
  assert.equal(m.lua(`${Q}.comprar.texto:GetText()`), texto(m, 'COMERCIO_CANT_CONFIRMAR', 235, '4g 27s 70c'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B2r, ronda 1
// ---------------------------------------------------------------------------------------------------

// Menor 4: con el objeto aún sin caché, el nombre podía pasar por «#id» → nombre sin sufijo → nombre con sufijo (dos
// cambios). Una variante con sufijo no enseña el nombre sin sufijo entre medias: espera al suyo dejando lo que había.
test('con el objeto sin caché, la fila padre de una variante con sufijo no pasa por el nombre sin sufijo', () => {
  const m = maquina({ navegar: NAVEGAR_RODELAS });
  m.lua(`BANCO.ponerSubasta({nombresClave = {[${RODELA}] = {${Object.entries(SUFIJOS).map(([s, n]) => `[${s}] = ${aLua(n)}`).join(', ')}}}})`);
  // El juego aún no sabe la itemKey: GetItemKeyInfo da nil hasta que la prueba suelta su evento.
  m.lua('_G.SIN_CLAVE = true; local f = C_AuctionHouse.GetItemKeyInfo; C_AuctionHouse.GetItemKeyInfo = function(...) if _G.SIN_CLAVE then return nil end return f(...) end');
  abrir(m);
  const vistos = {};
  const mirar = () => {
    for (const [s, nombre] of nombresPadre(m)) {
      const v = vistos[s] || (vistos[s] = []);
      if (v[v.length - 1] !== nombre) v.push(nombre);
    }
  };
  m.lua(`${N}.campo:SetText("del oso"); ${N}.buscar:Click()`);
  for (let k = 0; k < 30; k++) { m.avanzar(0.05); mirar(); }
  assert.equal(estado(m), 'completa');
  assert.deepEqual(vistos[1], [`#${RODELA}`], 'sin caché, lo de siempre');
  // Llega el objeto (GET_ITEM_INFO_RECEIVED): la variante no pasa a «Rodela de oso pardo».
  m.itemInfo(RODELA, { nombre: 'Rodela de oso pardo', calidad: 2, nivel: 13, equipa: 'INVTYPE_SHIELD' });
  m.disparar('GET_ITEM_INFO_RECEIVED', RODELA, true);
  for (let k = 0; k < 10; k++) { m.avanzar(0.05); mirar(); }
  // Llega la itemKey: su nombre con sufijo, de una vez.
  m.lua('_G.SIN_CLAVE = false');
  m.disparar('ITEM_KEY_ITEM_INFO_RECEIVED', RODELA);
  for (let k = 0; k < 10; k++) { m.avanzar(0.05); mirar(); }
  for (const s of [1, 2, 3, 4, 5]) {
    assert.deepEqual(vistos[s], [`#${RODELA}`, SUFIJOS[s]], `la ${s}: un solo cambio, sin el nombre sin sufijo entre medias`);
  }
  sinErrores(m);
});

// Menor 2: una mercancía de un solo escalón, en resultados y en el cuadro.
test('una mercancía de un solo escalón: una fila de escalones con su %, el máximo es su cantidad y con 1 unidad solo deja 1', () => {
  for (const n of [7, 1]) {
    const m = maquina({ precios: { 2589: 100000 } });
    m.lua(`BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = ${n}, unitPrice = 40000, timeLeftSeconds = 9000}}}})`);
    abrir(m);
    buscar(m, 'paño');
    const i = abrirFila(m, 'Paño de lino');
    assert.equal(hueco(m, i + 1).cantidad, String(n), `${n}: su subasta`);
    assert.notEqual((hueco(m, i + 2) || {}).compra, dinero(m, 40000), `${n}: una sola`);
    clic(m, i + 1);
    assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
    m.avanzar(0.6);
    assert.equal(m.lua(`${R}.comprar.texto:GetText()`), texto(m, 'COMERCIO_ELEGIR_CANTIDAD'), `${n}: «Elegir cantidad…»`);
    m.lua(`${R}.comprar:Click()`);
    assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true, `${n}: abre el cuadro`);
    assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), n, `${n}: el máximo es su cantidad`);
    // La tabla de escalones: una fila, con su precio, su cantidad y su % (40 %, azul).
    assert.equal(m.lua(`${Q}.escalones.huecos[1]:IsShown()`), true);
    assert.equal(m.lua(`${Q}.escalones.huecos[2]:IsShown()`), false, `${n}: una sola fila`);
    assert.equal(m.lua(`${Q}.escalones.huecos[1].celdas.n:GetText()`), String(n));
    assert.equal(m.lua(`${Q}.escalones.huecos[1].celdas.pct:GetText()`), texto(m, 'COMERCIO_PCT', '40'));
    assert.equal(colorTexto(m, `${Q}.escalones.huecos[1].celdas.pct`), token(m, 'azul'));
    // Ni Máx., ni 20, ni escribir más pasan de su cantidad.
    m.lua(`${Q}.rapidos.max:Click()`);
    assert.equal(compraEstado(m).cantidad, n);
    m.lua(`${Q}.rapidos[20]:Click()`);
    assert.equal(compraEstado(m).cantidad, n);
    m.lua(`${Q}.caja:SetFocus(); ${Q}.caja:SetText("50"); ${Q}.caja:GetScript("OnEnterPressed")(${Q}.caja)`);
    assert.equal(compraEstado(m).cantidad, n);
    assert.equal(m.lua(`${Q}.caja:GetText()`), String(n), `${n}: la caja se recorta`);
    assert.equal(m.lua(`${Q}.comprar.texto:GetText()`), texto(m, 'COMERCIO_CANT_COMPRAR', n, m.lua(`SnetForever.UIComercio.dinero(${n * 40000})`)));
    assert.equal(compras(m), 0);
    sinErrores(m);
  }
});

// Menor 3: el cuadro con importes largos («1234g 56s 78c (100%)») en el precio de la unidad y el total, y los textos de
// los escalones: nada se pisa con la letra real.
test('disposición del cuadro con importes largos: nada se pisa con la letra real', () => {
  for (const idioma of ['es', 'en']) {
    const m = maquina({ idioma, precios: { 2592: 12345678 } });
    letraReal(m);
    m.lua('BANCO.ponerSubasta({mercancias = {[2592] = {{quantity = 1, unitPrice = 12345678, timeLeftSeconds = 80000}, {quantity = 3, unitPrice = 123456789, timeLeftSeconds = 80000}}}})');
    m.lua('BANCO.jugador.dinero = 99999999999');
    abrir(m);
    buscar(m, 'paño');
    const i = abrirFila(m, 'Paño de lana');
    clic(m, i + 1);
    assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
    m.avanzar(0.6);
    m.lua(`${R}.comprar:Click()`);
    const r = m.lua(`(function()
      local V = ${Q}
      local function caja(fs)
        local w, j = fs:GetUnboundedStringWidth(), fs:GetJustifyH()
        local l, r = fs:GetLeft() - V:GetLeft(), fs:GetRight() - V:GetLeft()
        if j == "RIGHT" then l = r - w elseif j == "CENTER" then l, r = (l + r - w) / 2, (l + r + w) / 2 else r = l + w end
        return {l, r, V:GetTop() - fs:GetTop(), V:GetTop() - fs:GetBottom(), fs:GetText()}
      end
      local celdas = {}
      for _, h in ipairs(V.escalones.huecos) do
        if h:IsShown() then
          for _, k in ipairs({"precio", "n", "pct"}) do
            local c = h.celdas[k]
            celdas[#celdas + 1] = {k, c:GetText(), c:GetUnboundedStringWidth(), V.escalones:anchoDe(k)}
          end
        end
      end
      return {unidad = {caja(V.etiquetaUnidad), caja(V.unidad)}, total = {caja(V.etiquetaTotal), caja(V.total)},
        izq = V.comprar:GetLeft() - V:GetLeft(), der = V.comprar:GetRight() - V:GetLeft(), celdas = celdas}
    end)()`);
    assert.equal(r.unidad[1][4], texto(m, 'COMERCIO_CANT_UNIDAD_PCT', '1234g 56s 78c', `|cff${m.lua('SnetForever.Tema.hex("amarillo")')}100%|r`), `${idioma}: el precio de la unidad, largo`);
    assert.equal(r.total[1][4], '1234g 56s 78c', `${idioma}: el total, largo`);
    for (const [nombre, [rot, val]] of [['unidad', r.unidad], ['total', r.total]]) {
      assert.ok(rot[1] + 8 <= val[0], `${idioma}: el rótulo y el valor de ${nombre} no se pisan (${rot[1]} y ${val[0]})`);
      assert.ok(val[0] >= r.izq - 0.01 && val[1] <= r.der + 0.01, `${idioma}: el valor de ${nombre} dentro de la columna`);
    }
    for (const [k, t, w, ancho] of r.celdas) assert.ok(w <= ancho - 4, `${idioma}: escalón ${k} «${t}» cabe (${w} en ${ancho})`);
    assert.ok(r.celdas.some(([k, t]) => k === 'precio' && t === m.lua('SnetForever.UIComercio.dinero(123456789)')), 'el escalón más largo');
    sinErrores(m);
  }
});

// ---------------------------------------------------------------------------------------------------
// B3r: la letra con más calidad, la lectura de cada objeto sin desplegarlo (↻ y «(n)»), el % con sus tramos y la cabecera
// que ordena resaltada, y la barra en pausa.
// ---------------------------------------------------------------------------------------------------

// Lo que se ve de cada fila padre: su marca (leyendo ↻, cerrado ▸ o abierto ▾), su «(n)» y el texto de Objeto, por clave.
const MARCAS = ['leyendo', 'cerrado', 'abierto'];
function padres(m) {
  const marcas = Object.fromEntries(MARCAS.map((n) => [n, coordsIcono(m, n).join(',')]));
  const filas = m.lua(`(function()
    local r = {}
    for i, h in ipairs(${T}.huecos) do
      local f = h:IsShown() and h.fila
      if f and not f.subasta and not f.aviso then
        local c = h.snfCuenta
        r[#r + 1] = {i = i, clave = f.clave, item = f.item, objeto = h.celdas.objeto:GetText(), coords = {h.flecha:GetTexCoord()},
          marca = h.abrir:IsShown(), cuenta = c and c:IsShown() and c:GetText() or "", colorCuenta = c and {c:GetTextColor()} or {},
          cantidad = h.celdas.cantidad:GetText(), compra = h.celdas.compra:GetText()}
      end
    end
    return r
  end)()`) || [];
  for (const f of filas) {
    const k = f.coords.map((v) => Math.round(v * 1000)).join(',');
    f.marca = f.marca ? (Object.keys(marcas).find((n) => marcas[n] === k) || k) : 'ninguna';
    delete f.coords;
  }
  return filas;
}
// Cuenta las peticiones de subastas en camino a la vez (como mucho una).
const VUELO = `rawset(_G, "VUELO", {ahora = 0, max = 0, orden = {}})
  hooksecurefunc(C_AuctionHouse, "SendSearchQuery", function(k)
    VUELO.ahora = VUELO.ahora + 1; VUELO.max = math.max(VUELO.max, VUELO.ahora); VUELO.orden[#VUELO.orden + 1] = k.itemID
  end)
  local f = CreateFrame("Frame")
  f:RegisterEvent("COMMODITY_SEARCH_RESULTS_UPDATED"); f:RegisterEvent("ITEM_SEARCH_RESULTS_UPDATED")
  f:SetScript("OnEvent", function() VUELO.ahora = math.max(0, VUELO.ahora - 1) end)`;
// Las subastas de las tres de NAVEGAR (lino y lana, mercancías; seda, objeto suelto): una búsqueda de verdad siempre las tiene.
const SUBASTAS_LECTURA = `BANCO.ponerSubasta({
  mercancias = {[2589] = {{quantity = 5, unitPrice = 120}, {quantity = 15, unitPrice = 150}}, [2592] = {{quantity = 7, unitPrice = 300}}},
  objetos = {[4306] = {{quantity = 1, buyoutAmount = 4500}, {quantity = 2, buyoutAmount = 10000}}},
})`;

test('tras buscar se leen los objetos uno tras otro, con ↻ mientras esperan y (n) en dorado al llegar', () => {
  const m = maquina();
  m.lua(SUBASTAS_LECTURA);
  m.lua(VUELO);
  abrir(m);
  m.lua(`${N}.campo:SetText("paño"); ${N}.buscar:Click()`);
  // Fotograma a fotograma hasta que no quede nada por leer: la marca de cada fila y lo que dice la barra.
  const historia = {};
  const barras = new Set();
  let listo = false;
  for (let k = 0; k < 200 && !listo; k++) {
    m.avanzar(0.05);
    const filas = padres(m);
    for (const f of filas) {
      historia[f.clave] = historia[f.clave] || [];
      const h = historia[f.clave];
      if (h[h.length - 1] !== f.marca) h.push(f.marca);
    }
    barras.add(m.lua(`${R}.barra.texto:GetText()`));
    listo = estado(m) === 'completa' && filas.length === 3 && filas.every((f) => f.marca !== 'leyendo');
  }
  assert.ok(listo, 'acaba de leerlas todas');
  // Una tras otra, en el orden de la lista (Compra, de menos a más: lino, lana, seda), y una sola petición a la vez.
  assert.deepEqual(m.lua('VUELO.orden'), [2589, 2592, 4306]);
  assert.equal(m.lua('VUELO.max'), 1, 'nunca dos peticiones a la vez');
  // ↻ mientras espera; pasa a triángulo una sola vez, cuando llega su lectura.
  for (const [clave, h] of Object.entries(historia)) assert.deepEqual(h, ['leyendo', 'cerrado'], `${clave}: ↻ → ▸ una vez`);
  // «(n)» en dorado junto al nombre cuando tiene varias subastas; con una sola, nada.
  const filas = padres(m);
  const de = (item) => filas.find((f) => f.item === item);
  assert.equal(de(2589).cuenta, '(2)');
  assert.equal(de(4306).cuenta, '(3)', 'una suelta y 2 iguales en otra fila (arreglo de la compra suelta)');
  assert.equal(de(2592).cuenta, '', 'una sola subasta: sin cuenta');
  assert.equal(aHex(de(2589).colorCuenta), token(m, 'oro'), 'en dorado');
  // El mínimo de verdad y lo disponible, sin desplegar.
  assert.deepEqual([de(2589).cantidad, de(2589).compra], ['20', dinero(m, 120)]);
  assert.deepEqual([de(4306).cantidad, de(4306).compra], ['3', dinero(m, 4500)]);
  // La barra: «Leyendo N / M» mientras lee y, al acabar, lo de siempre.
  assert.ok([...barras].includes(texto(m, 'SUBASTA_RES_LEYENDO', '1', '3')), `${[...barras]}`);
  assert.equal(m.lua(`${R}.barra.texto:GetText()`), texto(m, 'SUBASTA_RES_OBJETOS', '3'));
  // El ↻ es nuestro (del atlas), quieto: nada en OnUpdate.
  assert.equal(m.lua(`${T}.huecos[1].flecha:GetTexture()`), 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\iconos');
  assert.equal(m.lua(`${T}.huecos[1].abrir:GetScript("OnUpdate")`), undefined, 'no gira ni late');
  assert.equal(compras(m), 0, 'leer no compra nada');
  sinErrores(m);
});

test('desplegar una fila la lee primero; ⏯ pausa y sigue la lectura; la barra dice En pausa | N / M', () => {
  const ids = [3001, 3002, 3003, 3004, 3005, 3006];
  const m = maquina({ navegar: ids.map((id, k) => `{itemID = ${id}, totalQuantity = 2, minPrice = ${100 * (k + 1)}}`) });
  ids.forEach((id, k) => m.itemInfo(id, { nombre: `Objeto ${k + 1}`, calidad: 1, nivel: 10 }));
  m.lua(`BANCO.ponerSubasta({mercancias = {${ids.map((id, k) => `[${id}] = {{quantity = 1, unitPrice = ${100 * (k + 1)}}, {quantity = 1, unitPrice = ${100 * (k + 1) + 5}}}`).join(', ')}}})`);
  m.lua(VUELO);
  abrir(m);
  const P = `${R}.pausa`;
  buscar(m, 'paño'); // acaba la búsqueda: empieza la lectura
  const yaPedidas = m.lua('VUELO.orden');
  assert.ok(yaPedidas.length >= 1 && yaPedidas.length <= 3, `ha empezado: ${yaPedidas}`);
  assert.deepEqual(yaPedidas, ids.slice(0, yaPedidas.length), 'por el primero de la lista, en orden');
  // El jugador despliega el quinto: es lo siguiente que se pide (tras la lectura que va en camino).
  clic(m, huecoDe(m, 'Objeto 5'));
  m.avanzar(0.05);
  m.avanzar(0.05);
  assert.equal(m.lua('VUELO.orden')[yaPedidas.length], 3005, 'la desplegada, antes que las demás');
  // ⏯ en pausa: el icono de seguir y su tooltip; no sale ninguna más (la que iba en camino llega).
  assert.deepEqual(coords(m, `${P}.icono`), coordsIcono(m, 'pausa'), 'leyendo: el icono de pausa');
  assert.equal(m.lua(`${P}.snfApagado`), false);
  entrar(m, P);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_RES_PAUSA_LECTURA')), `${lineasTt(m)}`);
  salir(m, P);
  m.lua(`${P}:Click()`);
  m.avanzar(0.1);
  const enPausa = m.lua('VUELO.orden').length;
  m.avanzar(2);
  assert.equal(m.lua('VUELO.orden').length, enPausa, 'en pausa no lee más');
  const leidas = padres(m).filter((f) => f.marca !== 'leyendo').length;
  assert.ok(leidas < 6, `a medias (${leidas})`);
  assert.equal(m.lua(`${R}.barra.texto:GetText()`), texto(m, 'SUBASTA_RES_EN_PAUSA', String(leidas), '6'));
  assert.deepEqual(coords(m, `${P}.icono`), coordsIcono(m, 'seguir'));
  entrar(m, P);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_RES_SEGUIR_LECTURA')), `${lineasTt(m)}`);
  salir(m, P);
  // Sigue: lee las que faltan, en orden, sin repetir ninguna.
  m.lua(`${P}:Click()`);
  assert.ok(hasta(m, () => padres(m).every((f) => f.marca !== 'leyendo'), 200), 'acaba de leer');
  const orden = m.lua('VUELO.orden');
  assert.deepEqual([...orden].sort(), [...ids].sort(), `cada una una vez: ${orden}`);
  assert.deepEqual(orden.filter((id) => id !== 3005), [3001, 3002, 3003, 3004, 3006], 'las demás, en el orden de la lista');
  assert.equal(m.lua('VUELO.max'), 1);
  m.avanzar(0.05);
  assert.equal(m.lua(`${R}.barra.texto:GetText()`), texto(m, 'SUBASTA_RES_OBJETOS', '6'));
  assert.equal(m.lua(`${P}.snfApagado`), true, 'sin nada que leer ni buscar, apagado');
  assert.equal(compras(m), 0, 'leer no compra nada');
  sinErrores(m);
});

test('vaivén: llegan lecturas de muchos objetos con el ratón quieto sobre una fila; nada se mueve, sale y se va, y ↻ → ▸ una vez', () => {
  const n = 18;
  const ids = Array.from({ length: n }, (_, k) => 3100 + k);
  const m = maquina({ navegar: ids.map((id, k) => `{itemID = ${id}, totalQuantity = 3, minPrice = ${1000 + 10 * k}}`), sitio: '{x = 50, y = 50, ancho = 1000, alto = 700}' });
  ids.forEach((id, k) => m.itemInfo(id, { nombre: `Cosa ${String(k + 1).padStart(2, '0')}`, calidad: 1, nivel: 10 }));
  // Las lecturas cambian el mínimo de unos (más baratos que lo de la búsqueda) y no el de otros: la tabla no se reordena.
  m.lua(`BANCO.ponerSubasta({mercancias = {${ids.map((id, k) => `[${id}] = {{quantity = 3, unitPrice = ${k % 2 ? 1000 + 10 * k : 2000 - 10 * k}}}`).join(', ')}}})`);
  abrir(m);
  buscar(m, 'paño');
  // El ratón quieto sobre la tercera fila.
  entrar(m, `${T}.huecos[3]`);
  m.avanzar(0.5);
  const bajoRaton = m.lua(`${T}.huecos[3].fila.clave`);
  const huecos = () => m.lua(`(function() local r = {} for i, h in ipairs(${T}.huecos) do r[i] = h:IsShown() and h.fila and h.fila.clave or false end return r end)()`);
  const primera = huecos();
  const historia = {};
  for (let k = 0; k < 300; k++) {
    m.avanzar(0.05);
    assert.equal(m.lua(`${T}.huecos[3].fila.clave`), bajoRaton, `la fila bajo el ratón no cambia (fotograma ${k})`);
    assert.deepEqual(huecos(), primera, `nada sale, se va ni se mueve (fotograma ${k})`);
    for (const f of padres(m)) {
      historia[f.clave] = historia[f.clave] || [];
      const h = historia[f.clave];
      if (h[h.length - 1] !== f.marca) h.push(f.marca);
    }
    if (padres(m).every((f) => f.marca !== 'leyendo')) break;
  }
  const vistas = Object.values(historia);
  assert.ok(vistas.length >= 10, 'se ven muchas filas');
  for (const [clave, h] of Object.entries(historia)) {
    assert.ok(h.length <= 2 && h[h.length - 1] === 'cerrado' && (h.length === 1 || h[0] === 'leyendo'), `${clave}: ${h}`);
  }
  assert.equal(m.lua(`${T}:elegida()`), undefined, 'nada elegido solo');
  sinErrores(m);
});

test('% con su color en cada tramo y >999%; la cabecera que ordena va resaltada', () => {
  const ids = [4306, 2592, 2589, 4305, 4338, 14047, 3001, 3002];
  const pcts = [40, 41, 80, 81, 110, 111, 999, 1000];
  const tramos = ['azul', 'verde', 'verde', 'amarillo', 'amarillo', 'naranja', 'naranja', 'rojo'];
  const textos = ['40%', '41%', '80%', '81%', '110%', '111%', '999%', '>999%'];
  const normales = Object.fromEntries(ids.map((id) => [id, 1000]));
  const m = maquina({ precios: normales, navegar: ids.map((id, k) => `{itemID = ${id}, totalQuantity = 1, minPrice = ${pcts[k] * 10}}`) });
  m.lua(`BANCO.ponerSubasta({mercancias = {${ids.map((id, k) => `[${id}] = {{quantity = 1, unitPrice = ${pcts[k] * 10}}}`).join(', ')}}})`);
  m.itemInfo(4305, { nombre: 'Seda burda', calidad: 1, nivel: 30 });
  m.itemInfo(4338, { nombre: 'Paño de tejido mágico', calidad: 1, nivel: 40 });
  m.itemInfo(14047, { nombre: 'Paño rúnico', calidad: 1, nivel: 50 });
  m.itemInfo(3001, { nombre: 'Paño caro', calidad: 1, nivel: 50 });
  m.itemInfo(3002, { nombre: 'Paño carísimo', calidad: 1, nivel: 50 });
  abrir(m);
  buscar(m, 'paño');
  m.avanzar(2); // y leídos: el mismo precio
  textos.forEach((t, k) => {
    const i = m.lua(`(function() for i, h in ipairs(${T}.huecos) do if h:IsShown() and h.celdas.pct:GetText() == ${aLua(t)} then return i end end end)()`);
    assert.ok(i, `sale «${t}»`);
    assert.equal(colorTexto(m, `${T}.huecos[${i}].celdas.pct`), token(m, tramos[k]), `${t} en ${tramos[k]}`);
  });
  // Los mismos tramos y el mismo texto en todas partes (resultados, sniper y cuadro de cantidad): UIComercio.
  pcts.forEach((p, k) => {
    assert.equal(m.lua(`SnetForever.UIComercio.tokenPct(${p})`), tramos[k], `tokenPct(${p})`);
    assert.equal(m.lua(`SnetForever.UIComercio.textoPct(${p})`), textos[k], `textoPct(${p})`);
  });
  assert.deepEqual(m.lua('SnetForever.UIComercio.PCT_MERCADO'), { AZUL: 40, VERDE: 80, AMARILLO: 110, ROJO: 1000 });
  // La cabecera que ordena (Compra, de entrada) va resaltada: fondo más claro y texto claro; las demás, en gris.
  const cab = (clave) => ({ fondo: m.lua(`{${T}.cabeceras.${clave}.fondo:GetVertexColor()}`), texto: colorTexto(m, `${T}.cabeceras.${clave}.texto`) });
  const resaltada = (clave, otra) => {
    const a = cab(clave);
    const b = cab(otra);
    assert.ok(a.fondo[0] > b.fondo[0] + 0.02, `${clave}: el fondo más claro que ${otra}`);
    assert.equal(a.texto, comercio(m, 'texto'), `${clave}: el texto claro`);
    assert.equal(b.texto, comercio(m, 'secundario'), `${otra}: el texto en gris`);
  };
  resaltada('compra', 'pct');
  m.lua(`${T}.cabeceras.pct:Click()`);
  resaltada('pct', 'compra');
  assert.equal(m.lua(`${T}.cabeceras.pct.flecha:IsShown()`), true, 'además de su flecha');
  sinErrores(m);
});

// Lo que no cabe entero: los textos de una sola línea con ancho (puesto o por dos anclajes) que se ven, salvo los de las filas
// de la tabla (un nombre largo se corta con puntos suspensivos, como en el juego).
function cortados(m, raiz, excluir = 'nil') {
  return m.lua(`(function()
    local malos = {}
    local fuera = ${excluir}
    local function mirar(marco)
      if fuera and fuera[marco] then return end
      for _, r in ipairs({marco:GetRegions()}) do
        if r:GetObjectType() == "FontString" and r:IsVisible() and (r:GetText() or "") ~= "" and not r:GetWordWrap() then
          local w = r:GetWidth()
          if w > 0 and r:GetUnboundedStringWidth() > w + 0.5 then
            malos[#malos + 1] = r:GetText() .. " " .. math.floor(r:GetUnboundedStringWidth()) .. "/" .. math.floor(w)
          end
        end
      end
      for _, h in ipairs({marco:GetChildren()}) do mirar(h) end
    end
    mirar(${raiz})
    return malos
  end)()`) || [];
}

test('con la letra real caben los títulos a 830 px, la cabecera, los botones y el cuadro', () => {
  for (const idioma of ['es', 'en']) {
    const m = maquina({ sitio: '{x = 20, y = 20, ancho = 800, alto = 450}', idioma }); // se sube al mínimo, 830 × 500
    letraReal(m);
    m.jugador({ dinero: 99999999 });
    m.lua(SUBASTAS_LECTURA);
    abrir(m);
    buscar(m, 'paño');
    m.avanzar(1);
    const msg = `${idioma} a 830×500`;
    assert.equal(Math.round(m.lua(`${V}:GetWidth()`)), 830, `${msg}: ancho`);
    // Los títulos, con la flecha de la columna ordenada en cada una.
    for (const clave of ['objeto', 'nivel', 'cantidad', 'vendedor', 'puja', 'compra', 'pct']) {
      m.lua(`${T}:ordenarPor(${aLua(clave)}, true)`);
      const malos = disposicion(m).malos;
      assert.deepEqual(malos, [], `${msg}, ordenada por ${clave}: títulos que no caben enteros`);
    }
    // La cabecera (fila 1) y la fila 2: nada se pisa ni se corta.
    const fila1 = m.lua(`(function()
      local M = ${M}
      local ult = M.pestanas[M.orden[#M.orden]].texto:GetRight()
      local derecha = M.oro:IsShown() and M.oro:GetLeft() or M.verBlizzard:GetLeft()
      return {libre = derecha - ult, oro = M.oro:GetRight() or 0, ver = M.verBlizzard:GetLeft(), verDer = M.verBlizzard:GetRight(), x = M.cerrar:GetLeft()}
    end)()`);
    assert.ok(fila1.libre >= 8, `${msg}: entre las pestañas y lo de la derecha (${fila1.libre})`);
    assert.ok(fila1.oro <= fila1.ver, `${msg}: el oro antes de Vista de Blizzard`);
    assert.ok(fila1.verDer <= fila1.x, `${msg}: Vista de Blizzard antes de la X`);
    assert.deepEqual(cortados(m, `${M}.cabecera`), [], `${msg}: la cabecera`);
    const s = caja(m, `${R}.salir`);
    const c = caja(m, `${R}.campo`);
    const v = caja(m, `${R}.volver`);
    assert.ok(c.izq >= s.der && c.der <= v.izq, `${msg}: Salir, el campo y Volver sin pisarse`);
    // Los botones de abajo, con una compra elegida (Comprar N por X).
    const i = abrirFila(m, 'Paño de seda');
    clic(m, i + 1);
    assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
    m.avanzar(0.6);
    assert.deepEqual(cortados(m, `${R}.pagina`, `{[${T}.marco] = true}`), [], `${msg}: la página de resultados`);
    assert.equal(disposicion(m).comprarCabe, true, `${msg}: Comprar`);
    // El cuadro de cantidad (lino, mercancía).
    clic(m, huecoDe(m, 'Paño de lino'));
    m.avanzar(0.1);
    const j = huecoDe(m, 'Paño de lino');
    clic(m, j + 1);
    assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
    m.lua(`${R}.comprar:Click()`);
    assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true, `${msg}: el cuadro abierto`);
    m.avanzar(0.2);
    assert.deepEqual(cortados(m, 'SnetForever.CantidadComercio.marco()', '{[SnetForever.CantidadComercio.marco().escalones.marco] = true}'), [], `${msg}: el cuadro`);
    sinErrores(m);
  }
});

// B3r, ronda 1 (sin parpadeos): fotograma a fotograma, durante toda la lectura de una búsqueda con muchos objetos, con pausas y
// sigues de ⏯, una fila desplegada y plegada (y vuelta a pedir), y una que no responde ni al desplegarla ni al leerla:
// cada fila pasa de ↻ a triángulo como mucho una vez y nunca vuelve a ↻; el color de su % cambia como mucho una vez (todas
// sus lecturas traen lo mismo).
test('ronda 1: ↻ → triángulo una sola vez por fila y el % cambia de color como mucho una vez, con pausas, plegar, repetir y una que no responde', () => {
  const n = 14;
  const ids = Array.from({ length: n }, (_, k) => 3201 + k);
  const MUDA = 3203; // nunca responde: ni sus subastas al desplegarla ni su lectura
  const normales = Object.fromEntries(ids.map((id) => [id, 1000]));
  const m = maquina({ precios: normales, navegar: ids.map((id, k) => `{itemID = ${id}, totalQuantity = 3, minPrice = ${900 + k}}`), sitio: '{x = 50, y = 50, ancho = 1000, alto = 700}' });
  ids.forEach((id, k) => m.itemInfo(id, { nombre: `Cosa ${String(k + 1).padStart(2, '0')}`, calidad: 1, nivel: 10 }));
  // Las pares, más baratas al leerlas (90 % amarillo → 70 % verde): su % cambia de color una vez; las impares, igual.
  m.lua(`BANCO.ponerSubasta({mercancias = {${ids.map((id, k) => `[${id}] = {{quantity = 3, unitPrice = ${k % 2 ? 900 + k : 700}}}`).join(', ')}}})`);
  m.lua(`SnetForever.Busqueda.ESPERA = 1
    local original = C_AuctionHouse.SendSearchQuery
    C_AuctionHouse.SendSearchQuery = function(k, ...)
      if k.itemID == ${MUDA} then return end -- se pierde: el servidor no contesta
      return original(k, ...)
    end`);
  abrir(m);
  const nombre = (id) => `Cosa ${String(ids.indexOf(id) + 1).padStart(2, '0')}`;
  const historia = {};
  const colores = {};
  const apuntar = (k) => {
    const filas = padres(m);
    const pct = m.lua(`(function() local r = {} for _, h in ipairs(${T}.huecos) do local f = h:IsShown() and h.fila
      if f and not f.subasta and not f.aviso then r[f.clave] = {h.celdas.pct:GetTextColor()} end end return r end)()`) || {};
    for (const f of filas) {
      const clase = f.marca === 'leyendo' ? '↻' : (f.marca === 'cerrado' || f.marca === 'abierto') ? '▸' : f.marca;
      const h = historia[f.clave] || (historia[f.clave] = []);
      if (h[h.length - 1] !== clase) h.push(clase);
      assert.ok(!(h.length >= 2 && h[h.length - 1] === '↻'), `${f.objeto}: vuelve a ↻ (fotograma ${k}): ${h}`);
      const c = aHex(pct[f.clave] || [0, 0, 0]);
      const v = colores[f.clave] || (colores[f.clave] = []);
      if (v[v.length - 1] !== c) v.push(c);
    }
  };
  const P = `${R}.pausa`;
  const triangulo = (id) => m.lua(`${T}.huecos[${huecoDe(m, nombre(id))}].abrir:Click()`);
  const filaDe = (id) => `(function() for _, h in ipairs(${T}.huecos) do if h:IsShown() and h.fila and h.fila.item == ${id} and not h.fila.subasta and not h.fila.aviso then return h end end end)()`;
  const abierta = (id) => m.lua(`(function() local h = ${filaDe(id)} return h ~= nil and ${T}:estaAbierta(h.fila.clave) end)()`);
  m.lua(`${N}.campo:SetText("cosa"); ${N}.buscar:Click()`);
  let mudaCargada = false;
  let k0 = null;
  let listo = false;
  for (let k = 0; k < 1200 && !listo; k++) {
    // Lo que hace el jugador, en fotogramas fijos.
    if (k === 1) { assert.ok(huecoDe(m, nombre(MUDA)), 'ya se ve la que no responde'); clic(m, huecoDe(m, nombre(MUDA))); } // despliega la que no responde (aún ↻)
    if (k === 5 || k === 10) m.lua(`${P}:Click()`); // ⏯ mientras espera a la que no responde
    // Ya plegada la que no responde (fotograma k0), lo demás.
    const d = k0 === null ? -1 : k - k0;
    if (d === 5) clic(m, huecoDe(m, nombre(3201))); // despliega otra…
    if (d === 12 && abierta(3201)) triangulo(3201); // …y la pliega
    if (d === 20 || d === 50 || d === 80) m.lua(`${P}:Click()`); // ⏯
    if (d === 35 || d === 65 || d === 95) m.lua(`${P}:Click()`);
    if (d === 100) clic(m, huecoDe(m, nombre(3201))); // la vuelve a desplegar: sus subastas se piden otra vez
    if (d === 110 && abierta(3201)) triangulo(3201);
    // La que no responde: en cuanto queda «cargada» (sin subastas, tras los reintentos), se pliega.
    if (!mudaCargada && abierta(MUDA) && m.lua(`${filaDe(MUDA)}.fila.cargadas == true`)) {
      mudaCargada = true;
      k0 = k;
      triangulo(MUDA);
    }
    m.avanzar(0.05);
    apuntar(k);
    listo = mudaCargada && k - k0 > 120 && padres(m).every((f) => f.marca !== 'leyendo') && !m.lua('SnetForever.Busqueda.leyendo()');
  }
  assert.ok(mudaCargada, 'la que no responde acaba cargada sin subastas');
  assert.ok(listo, 'acaba de leerlas todas');
  for (const [clave, h] of Object.entries(historia)) {
    assert.ok(h.length <= 2 && h[h.length - 1] === '▸' && (h.length === 1 || h[0] === '↻'), `${clave}: ${h}`);
  }
  for (const [clave, v] of Object.entries(colores)) assert.ok(v.length <= 2, `${clave}: el % cambia de color más de una vez: ${v}`);
  // Las pares sí cambiaron de color (una vez) con su lectura.
  assert.ok(Object.values(colores).some((v) => v.length === 2), 'alguna cambia de color con su lectura');
  assert.equal(compras(m), 0, 'leer no compra nada');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B3s: Mayús + clic y Ctrl + clic en las filas de objeto (UIComercio.clicModificado, un solo sitio para todas las tablas).
// Mayús + clic pone el enlace de verdad del objeto en la caja del chat (la abre si no hay ninguna); Ctrl + clic lo enseña
// en el probador. Con tecla, el clic no hace nada más: ni elige, ni despliega, ni prepara compra. Nada se envía solo.
// ---------------------------------------------------------------------------------------------------

// El enlace que da el juego de un objeto por su id (el del banco: C_Item.GetItemInfo).
const enlaceDe = (m, id) => m.lua(`(select(2, C_Item.GetItemInfo(${id})))`);
// Pulsa con la tecla (Mayús: «shift», Ctrl: «ctrl») lo que haga fn y la suelta.
function conTecla(m, tecla, fn) {
  m.lua(`BANCO.${tecla} = true`);
  try { fn(); } finally { m.lua(`BANCO.${tecla} = false`); }
}
const filaClave = (m, i) => m.lua(`${T}.huecos[${i}].fila.clave`);
const estaAbierta = (m, i) => m.lua(`${T}:estaAbierta(${T}.huecos[${i}].fila.clave)`);
const chat = (m) => m.lua('BANCO.chat');
const SEDA_SUFIJO = '|cff1eff00|Hitem:4306::::::::25:::::::|h[Paño de seda del oso]|h|r';
const SUBASTAS_SUFIJO = `BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000, timeLeftSeconds = 9000, itemLink = ${aLua(SEDA_SUFIJO)}}, {quantity = 1, buyoutAmount = 6000, timeLeftSeconds = 9000}}}})`;

test('Mayús + clic en una fila de resultados pone su enlace en el chat abierto y no elige la fila', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  m.lua('BANCO.chat.abierta = true; BANCO.chat.texto = "mira: "');
  const i = huecoDe(m, 'Paño de seda');
  const antes = pedidas(m).length;
  conTecla(m, 'shift', () => clic(m, i));
  m.avanzar(0.3);
  assert.equal(chat(m).texto, `mira: ${enlaceDe(m, 4306)}`, 'el enlace de verdad, en la caja abierta');
  assert.equal(m.lua(`${T}:elegida()`), undefined, 'no elige la fila');
  assert.equal(estaAbierta(m, huecoDe(m, 'Paño de seda')), false, 'ni la despliega');
  assert.equal(pedidas(m).length, antes, 'ni pide sus subastas');
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'ni prepara compra');
  // Con el triángulo pasa lo mismo.
  conTecla(m, 'shift', () => m.lua(`${T}.huecos[${huecoDe(m, 'Paño de seda')}].abrir:Click()`));
  assert.equal(chat(m).texto, `mira: ${enlaceDe(m, 4306)}${enlaceDe(m, 4306)}`, 'el triángulo con Mayús también enlaza');
  assert.equal(estaAbierta(m, huecoDe(m, 'Paño de seda')), false, 'y no despliega');
  // Sin tecla, todo sigue igual que hoy: la elige y la despliega.
  clic(m, huecoDe(m, 'Paño de seda'));
  m.avanzar(0.1);
  assert.equal(m.lua(`${T}:elegida()`), filaClave(m, huecoDe(m, 'Paño de seda')));
  assert.equal(estaAbierta(m, huecoDe(m, 'Paño de seda')), true);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('Mayús + clic en una subfila pone el enlace de esa subasta, con su sufijo', () => {
  const m = maquina();
  m.lua(SUBASTAS_SUFIJO);
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  m.lua('BANCO.chat.abierta = true');
  const i = abrirFila(m, 'Paño de seda');
  assert.equal(hueco(m, i + 1).objeto, 'Paño de seda del oso');
  conTecla(m, 'shift', () => clic(m, i + 1));
  assert.equal(chat(m).texto, SEDA_SUFIJO, 'el enlace de esa subasta, con su sufijo');
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'no prepara su compra');
  assert.equal(m.lua(`${T}:elegida()`), filaClave(m, i), 'lo marcado sigue en la fila del objeto');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('sin chat abierto, Mayús + clic lo abre con el enlace', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  assert.equal(chat(m).abierta, false);
  conTecla(m, 'shift', () => clic(m, huecoDe(m, 'Paño de lino')));
  assert.deepEqual(m.llamadas('ChatFrame_OpenChat'), [[enlaceDe(m, 2589)]], 'abre el chat con el enlace dentro');
  assert.deepEqual(chat(m), { abierta: true, texto: enlaceDe(m, 2589) });
  assert.equal(m.lua(`${T}:elegida()`), undefined);
  assert.equal(estaAbierta(m, huecoDe(m, 'Paño de lino')), false);
  // Ya abierto, el siguiente va a la misma caja (sin volver a abrirla).
  conTecla(m, 'shift', () => clic(m, huecoDe(m, 'Paño de lana')));
  assert.equal(m.llamadas('ChatFrame_OpenChat').length, 1);
  assert.equal(chat(m).texto, enlaceDe(m, 2589) + enlaceDe(m, 2592));
  sinErrores(m);
});

test('Ctrl + clic enseña el objeto en el probador y no despliega', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  const i = huecoDe(m, 'Paño de seda');
  // La luz de la fila del ratón (sin parpadeos): el clic con tecla no la enciende ni la apaga.
  entrar(m, `${T}.huecos[${i}]`);
  m.avanzar(0.3);
  const luces = () => m.lua(`(function() local o = {} for k, h in ipairs(${T}.huecos) do o[k] = h.luz == true end return o end)()`);
  const antes = luces();
  assert.equal(antes[i - 1], true, 'la fila del ratón lleva la luz');
  conTecla(m, 'ctrl', () => clic(m, i));
  assert.equal(m.lua('BANCO.probador'), enlaceDe(m, 4306), 'al probador, con el enlace de verdad');
  assert.deepEqual(m.llamadas('HandleModifiedItemClick'), [[enlaceDe(m, 4306)]], 'por la función del juego');
  assert.equal(estaAbierta(m, i), false, 'no despliega');
  assert.equal(m.lua(`${T}:elegida()`), undefined, 'no elige');
  conTecla(m, 'ctrl', () => m.lua(`${T}.huecos[${i}].abrir:Click()`));
  assert.equal(estaAbierta(m, i), false, 'el triángulo con Ctrl tampoco despliega');
  m.avanzar(0.3);
  assert.deepEqual(luces(), antes, 'la luz no cambia');
  assert.equal(chat(m).texto, '', 'el chat no recibe nada');
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined);
  sinErrores(m);
});

test('Mayús + clic no prepara compra: la barra y lo marcado no cambian', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  m.lua('BANCO.chat.abierta = true');
  const i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1); // sin tecla: prepara la compra de esa subasta, como siempre
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60), 'la compra queda lista');
  m.avanzar(0.6);
  const foto = () => ({
    compra: m.lua('SnetForever.Compra.estado()'), marcada: m.lua(`${T}:elegida()`), barra: barraTexto(m),
    comprar: m.lua(`${R}.comprar.texto:GetText()`), pedidas: pedidas(m).length,
  });
  const antes = foto();
  for (const tecla of ['shift', 'ctrl']) {
    conTecla(m, tecla, () => clic(m, i + 2)); // la otra subasta
    m.avanzar(0.3);
    assert.deepEqual(foto(), antes, `${tecla}: ni la compra, ni lo marcado, ni la barra cambian`);
  }
  assert.equal(chat(m).texto, enlaceDe(m, 4306), 'Mayús sí la enlaza (sin enlace de la subasta: el del objeto)');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('nada se envía solo: el chat solo recibe el texto', () => {
  const m = maquina();
  m.lua(SUBASTAS_SUFIJO);
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  const i = abrirFila(m, 'Paño de seda');
  conTecla(m, 'shift', () => clic(m, i + 1)); // sin chat: lo abre con el texto
  conTecla(m, 'shift', () => clic(m, huecoDe(m, 'Paño de lino'))); // con chat: lo añade
  m.avanzar(1);
  assert.deepEqual(m.llamadas('SendChatMessage'), [], 'nada se envía');
  assert.deepEqual(chat(m), { abierta: true, texto: SEDA_SUFIJO + enlaceDe(m, 2589) }, 'el texto se queda en la caja');
  sinErrores(m);
});

test('una fila sin enlace todavía («#id»): con tecla no hace nada y tampoco elige la fila', () => {
  const m = maquina({ navegar: [...NAVEGAR, '{itemID = 9999, totalQuantity = 1, minPrice = 100}'] });
  abrir(m);
  buscar(m, 'paño');
  const i = huecoDe(m, '#9999');
  assert.ok(i, 'la fila sin nombre sale como «#9999»');
  for (const tecla of ['shift', 'ctrl']) {
    conTecla(m, tecla, () => clic(m, i));
    assert.equal(m.lua(`${T}:elegida()`), undefined, `${tecla}: no la elige`);
    assert.equal(estaAbierta(m, i), false, `${tecla}: no la despliega`);
  }
  assert.deepEqual(chat(m), { abierta: false, texto: '' }, 'el chat ni se abre');
  assert.equal(m.lua('BANCO.probador'), undefined, 'ni el probador');
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined);
  sinErrores(m);
});

test('Mayús + clic en una variante con sufijo: sin sus subastas no enlaza el objeto sin sufijo; desplegada, el de su primera subasta', () => {
  const m = maquinaRodelas();
  const oso = `|cff1eff00|Hitem:${RODELA}::::::::13:::::::|h[${SUFIJOS[2]}]|h|r`;
  m.lua(`BANCO.ponerSubasta({objetos = {[${RODELA}] = {{quantity = 1, buyoutAmount = 40002, timeLeftSeconds = 7000, itemLink = ${aLua(oso)}}}}})`);
  abrir(m);
  buscar(m, 'del oso');
  pausarLectura(m);
  m.lua('BANCO.chat.abierta = true');
  conTecla(m, 'shift', () => clic(m, huecoDe(m, SUFIJOS[2])));
  assert.equal(chat(m).texto, '', 'sin sus subastas a la vista, nada (el del juego no lleva el sufijo)');
  assert.equal(m.lua(`${T}:elegida()`), undefined, 'y no la elige');
  const i = abrirFila(m, SUFIJOS[2]);
  assert.ok(hasta(m, () => m.lua(`${T}.huecos[${i + 1}].fila.subasta == true`), 60), 'llegan sus subastas');
  conTecla(m, 'shift', () => clic(m, i));
  assert.equal(chat(m).texto, oso, 'desplegada: el enlace de su primera subasta, con su sufijo');
  assert.equal(estaAbierta(m, i), true, 'y sigue desplegada');
  sinErrores(m);
});

// Arreglo de la compra suelta (2026-11-19). En WoW Forever una fila de objeto suelto (GetItemSearchResultInfo) agrupa
// `quantity` subastas IGUALES de 1 unidad, y buyoutAmount es lo que cuesta UNA (lo que cobra PlaceBid): así lo lee TSM y así
// lo pinta la subasta de Blizzard, que nunca divide. Se leía quantity como la cantidad de la subasta: una bolsa (no se apila)
// salía «Ctd 67» a 5s 97c (39989 / 67) y era la primera por precio; se pagaron 3g 99s 89c por 1 bolsa. Datos inventados.
const BOLSA = 14046;
const NOMBRE_BOLSA = 'Bolsa de paño rúnico';
// Cinco filas como las da Forever: la de 3g 99s 89c agrupa 67 subastas iguales; las demás, una cada una.
const BOLSAS = `BANCO.ponerSubasta({objetos = {[${BOLSA}] = {
  {quantity = 67, buyoutAmount = 39989},
  {quantity = 1, buyoutAmount = 39060},
  {quantity = 1, buyoutAmount = 41769},
  {quantity = 1, buyoutAmount = 39996},
  {quantity = 1, buyoutAmount = 39086},
}}})`;
const ID_BOLSA = (n) => BOLSA * 1000 + n; // el auctionID de la fila n (el banco)
function maquinaBolsa() {
  const m = maquina({ navegar: [`{itemID = ${BOLSA}, totalQuantity = 71, minPrice = 39060}`] });
  m.itemInfo(BOLSA, { nombre: NOMBRE_BOLSA, calidad: 1, nivel: 52 });
  m.lua(BOLSAS);
  abrir(m);
  buscar(m, 'bolsa');
  hastaLeidas(m);
  return m;
}
// Abre la bolsa y elige la subfila con esa compra: la compra queda «lista».
function elegirBolsa(m, compra) {
  const i = abrirFila(m, NOMBRE_BOLSA);
  let j = null;
  for (let k = i + 1; k <= i + 5; k++) if (hueco(m, k).compra === dinero(m, compra)) j = k;
  assert.ok(j, `sale la subfila de ${compra}`);
  clic(m, j);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60), 'la compra queda lista');
  m.avanzar(0.6);
  return j;
}
const comprarTexto = (m) => m.lua(`${R}.comprar.texto:GetText()`);
const importe = (m, c) => m.lua(`SnetForever.UIComercio.dinero(${c})`);

test('una bolsa suelta: cada subfila dice Ctd 1 y su compra entera; la fila padre suma las bolsas y el mínimo es 3g 90s 60c', () => {
  const m = maquinaBolsa();
  const fila = () => hueco(m, huecoDe(m, NOMBRE_BOLSA));
  const cuenta = () => m.lua(`${T}.huecos[${huecoDe(m, NOMBRE_BOLSA)}].snfCuenta:GetText()`);
  // Leída sin desplegar: 67 + 4 bolsas de verdad (67 subastas iguales y 4 sueltas) y el mínimo de verdad.
  assert.equal(fila().cantidad, '71');
  assert.equal(fila().compra, dinero(m, 39060));
  assert.equal(cuenta(), texto(m, 'SUBASTA_RES_CUENTA', '71'), '71 subastas');
  // Desplegada: Ctd 1 en cada subfila, su precio por unidad es su compra entera y la más barata va primero.
  const i = abrirFila(m, NOMBRE_BOLSA);
  const subs = [1, 2, 3, 4, 5].map((k) => hueco(m, i + k));
  assert.deepEqual(subs.map((s) => s.cantidad), ['1', '1', '1', '1', '1']);
  assert.deepEqual(subs.map((s) => s.compra), [39060, 39086, 39989, 39996, 41769].map((c) => dinero(m, c)),
    'la de 3g 99s 89c (la del «67») ya no sale como la más barata');
  assert.equal(hueco(m, i).cantidad, '71', 'la fila padre suma las bolsas de verdad');
  assert.equal(hueco(m, i).compra, dinero(m, 39060), 'el mínimo es 3g 90s 60c');
  // Lo que da la búsqueda de una subasta de objeto: 1 por compra, el grupo de iguales aparte.
  const lista = m.lua(`(function() local l = SnetForever.Busqueda.subastas(${BOLSA}) local s = {} for i, f in ipairs(l or {}) do s[i] = {f.cantidad, f.precioUnidad, f.total, f.iguales} end return s end)()`);
  assert.deepEqual(lista[0], [1, 39989, 39989, 67]);
  sinErrores(m);
});

test('en un objeto suelto el primer clic de Comprar no compra; el botón dice Comprar 1 por <total exacto>', () => {
  const m = maquinaBolsa();
  elegirBolsa(m, 39060);
  assert.equal(comprarTexto(m), texto(m, 'SUBASTA_RES_COMPRAR', '1', importe(m, 39060)), 'Comprar 1 por 3g 90s 60c');
  m.lua(`${R}.comprar:Click()`);
  assert.equal(compras(m), 0, 'el primer clic no compra');
  assert.equal(compraEstado(m).fase, 'confirmar');
  assert.equal(comprarTexto(m), texto(m, 'SUBASTA_RES_CONFIRMAR', '1', importe(m, 39060)), 'pide confirmar el mismo total');
  // Un doble clic no confirma: el segundo clic del doble llega en el medio segundo sin clics.
  m.lua(`${R}.comprar:Click()`);
  assert.equal(compras(m), 0, 'el doble clic no compra');
  sinErrores(m);
});

test('el segundo clic compra exactamente esa subasta, por su total', () => {
  const m = maquinaBolsa();
  elegirBolsa(m, 39060);
  const antes = m.lua('BANCO.jugador.dinero');
  m.lua(`${R}.comprar:Click()`);
  m.avanzar(0.6);
  assert.equal(compraEstado(m).fase, 'confirmar', 'tras el primer clic, a confirmar');
  m.lua(`${R}.comprar:Click()`);
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[ID_BOLSA(2), 39060]], 'la marcada, por su total');
  assert.ok(hasta(m, () => compraEstado(m).fase === 'hecho', 100), 'la compra acaba');
  assert.equal(antes - m.lua('BANCO.jugador.dinero'), 39060, 'se paga lo que decía el botón');
  sinErrores(m);
});

test('si el juego confirma la compra de 1 bolsa, la barra no dice «La compra no se ha hecho.»', () => {
  const m = maquinaBolsa();
  // Lo que pasó en el juego: el oro se fue, pero llegó también un error de la subasta (sin decir de qué subasta).
  m.lua('BANCO.subasta.errorAlComprar = 7');
  elegirBolsa(m, 39060);
  m.lua(`${R}.comprar:Click()`);
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[ID_BOLSA(2), 39060]], '1 bolsa por 3g 90s 60c');
  m.avanzar(1);
  const barra = barraTexto(m);
  assert.ok(!barra.includes(texto(m, 'COMERCIO_MOTIVO_FALLO')), `la barra no dice que no se hizo: ${barra}`);
  assert.equal(compraEstado(m).fase, 'hecho');
  assert.equal(barra, texto(m, 'COMERCIO_BARRA_HECHO', '1', dinero(m, 39060)), 'dice lo comprado y su precio de verdad');
  sinErrores(m);
});

// Ronda 1 del arreglo de la compra suelta.
test('un objeto suelto con un importe largo: el botón dice el total exacto, sin «~», y cabe entero, en es y en', () => {
  for (const idioma of ['es', 'en']) {
    for (const cobre of [99999999, 9999999]) {
      const m = maquina({ idioma, sitio: '{x = 50, y = 50, ancho = 830, alto = 500}', navegar: [`{itemID = 4306, totalQuantity = 1, minPrice = ${cobre}}`] });
      letraReal(m);
      m.lua(`BANCO.jugador.dinero = 200000000; BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = ${cobre}}}}})`);
      abrir(m);
      buscar(m, 'paño');
      const i = abrirFila(m, 'Paño de seda');
      clic(m, i + 1);
      assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
      m.avanzar(0.6);
      const importe = importe2(m, cobre);
      const mira = (clave) => {
        const d = m.lua(`(function() local b, p = ${R}.comprar, ${R}.pujar return {t = b.texto:GetText(), w = b.texto:GetUnboundedStringWidth(), sitio = b:GetWidth() - b.espacioFijo, pujarDer = p:GetRight(), comprarIzq = b:GetLeft(), barra = ${R}.barra:GetWidth()} end)()`);
        assert.equal(d.t, texto(m, clave, '1', importe), `${idioma} ${cobre}`);
        assert.ok(d.w <= d.sitio + 0.01, `cabe entero: ${JSON.stringify(d)}`);
        assert.ok(d.pujarDer <= d.comprarIzq + 0.01 && d.barra > 100, `nada se pisa: ${JSON.stringify(d)}`);
      };
      mira('SUBASTA_RES_COMPRAR');
      m.lua(`${R}.comprar:Click()`);
      m.avanzar(0.6);
      mira('SUBASTA_RES_CONFIRMAR');
      assert.equal(compras(m), 0);
      sinErrores(m);
    }
  }
});
const importe2 = (m, c) => m.lua(`SnetForever.UIComercio.dinero(${c})`);

test('una búsqueda nueva suelta el objeto por confirmar: Comprar se apaga y el clic no compra lo que ya no se ve', () => {
  const m = maquina({ navegar: ['{itemID = 4306, totalQuantity = 1, minPrice = 5000}'] });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 5000}}}})');
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  assert.equal(compraEstado(m).fase, 'confirmar');
  // Busca otra cosa (lino) desde Navegar.
  m.lua('BANCO.ponerSubasta({navegar = {{itemID = 2589, totalQuantity = 5, minPrice = 100}}})');
  buscar(m, 'lino');
  m.avanzar(1);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'la compra pendiente se suelta');
  assert.equal(m.lua(`${R}.comprar.snfApagado`), true, 'Comprar, apagado');
  m.lua(`${R}.comprar.snfApagado = false; ${R}.comprar:Click()`);
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  assert.equal(compras(m), 0, 'nunca se compra lo que no se ve');
  // Con «Volver a escanear» (la misma búsqueda otra vez) pasa lo mismo.
  m.lua('BANCO.ponerSubasta({navegar = {{itemID = 4306, totalQuantity = 1, minPrice = 5000}}})');
  buscar(m, 'paño');
  const j = abrirFila(m, 'Paño de seda');
  clic(m, j + 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60));
  m.avanzar(0.6);
  m.lua(`${R}.comprar:Click()`);
  assert.equal(compraEstado(m).fase, 'confirmar');
  m.lua(`${R}.volver:Click()`);
  assert.ok(hasta(m, () => estado(m) === 'completa'));
  m.avanzar(0.2);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// Ronda 2 del arreglo de la compra suelta: una compra que aún busca su subasta (el sistema de la subasta ocupado) no puede
// llegar tarde a una fila que ya no se ve. Aquí la lista entera del lino llega sin el escalón marcado mientras la compra
// espera al sistema: se suelta ya, y al quedar libre el sistema nada vuelve a «lista».
test('B7 ronda 2: si el escalón marcado desaparece mientras la compra espera al sistema, se suelta y no se compra', () => {
  const m = maquina();
  m.lua(LINO_B7());
  abrir(m);
  buscar(m);
  pausarLectura(m);
  clicHueco(m, huecoDe(m, 'Paño de lino'));
  assert.ok(hasta(m, () => {
    const l = m.lua('SnetForever.Busqueda.subastas(2589)');
    return Array.isArray(l) && l.length > 5;
  }, 60), 'llegan las subastas del lino');
  m.avanzar(0.6);
  const i = huecoDe(m, 'Paño de lino');
  m.lua('BANCO.ponerSubasta({lista = false})'); // el sistema de la subasta, ocupado: la compra espera
  clicHueco(m, i + 4); // el escalón de 31c
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).esperando], ['buscando', 'sistema']);
  // Llega una lista entera de ahora del lino (la busca otro) sin el escalón de 31c.
  m.lua(LINO_B7([28, 29, 30, 32, 33], [5438, 1096, 2543, 372, 51]));
  m.disparar('COMMODITY_SEARCH_RESULTS_UPDATED', 2589);
  m.avanzar(0.3);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'la compra que ya no se ve se suelta, aunque aún espere');
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'nada vuelve a «lista»');
  assert.equal(comprarEncendido(m), false, 'Comprar apagado');
  m.lua(`${R}.comprar.snfApagado = false; ${R}.comprar:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// F4 (fallo en el juego): en el Paño de lana, con la subasta abierta, el tooltip decía «A la venta 10494 unidades (subasta,
// ahora mismo)» y la fila padre 10557. Los dos números salían de lecturas distintas: el tooltip, de la última lista
// entera (Busqueda.vivo); la fila, del totalQuantity de navegar en dos casos: (E) una segunda lectura que llega a medias
// pisaba el resumen entero; (C) tras una búsqueda nueva, mientras no se relee, la fila lleva ↻ y enseña lo de navegar.
// Datos inventados de la misma forma: navegar dice 10557; la lista de la lana suma 10494 (494 + 4000 + 6000).
// Ronda 1: la fila padre saca Ctd, el mínimo y «(n)» de una sola lectura, y su tooltip dice cuál.
// ---------------------------------------------------------------------------------------------------

const NAVEGAR_F4 = [
  '{itemID = 2589, totalQuantity = 20, minPrice = 120}',
  '{itemID = 4306, totalQuantity = 3, minPrice = 150}',
  '{itemID = 2592, totalQuantity = 10557, minPrice = 179}',
];
function maquinaLana(navegar = NAVEGAR_F4) {
  const m = maquina({ navegar });
  m.lua('BANCO.subasta.mercancias[2592] = {{quantity = 494, unitPrice = 179}, {quantity = 4000, unitPrice = 185}, {quantity = 6000, unitPrice = 190}}');
  return m;
}
// La fila padre de un objeto tal como la pinta la tabla: Ctd, el mínimo, «(n)» y sus textos.
const padreDe = (m, item) => m.lua(`(function()
  for _, h in ipairs(${T}.huecos) do
    local f = h:IsShown() and h.fila
    if f and f.item == ${item} and not f.subasta and not f.aviso then
      return {cantidad = f.cantidad, texto = h.celdas.cantidad:GetText(), precioMin = f.precioMin,
        compra = h.celdas.compra:GetText(), subastas = f.subastas,
        cuenta = h.snfCuenta:IsShown() and h.snfCuenta:GetText() or false, esperando = f.esperando == true}
    end
  end
end)()`);
const padreLana = (m) => padreDe(m, 2592);
// Lo que enseña el tooltip del objeto (SNF.Subasta.foto, la que usa ui/tooltip.lua).
const fotoLana = (m) => m.lua('(function() local a, b, c, d, e, f, g, h = SnetForever.Subasta.foto(2592) return {precio = a, cantidad = b, edad = d, fuente = f, hora = h} end)()');
// Las líneas del tooltip de la fila padre de un objeto (con el ratón encima, y después fuera).
function tooltipDe(m, nombre) {
  const i = huecoDe(m, nombre);
  entrar(m, `${T}.huecos[${i}]`);
  const l = lineasTt(m).map(sinColores);
  salir(m, `${T}.huecos[${i}]`);
  m.avanzar(0.3);
  return l;
}
const tooltipLana = (m) => tooltipDe(m, 'Paño de lana');
const horaMinutos = (m, hora) => m.lua(`date("%H:%M", ${hora})`);
const resumenDeItem = (m, item) => m.lua(`(function() for _, f in ipairs(SnetForever.Busqueda.resultados()) do if f.item == ${item} then return f.resumen end end end)()`);
const empiezaPor = (l, t) => l.some((x) => x.startsWith(t));
// La fila padre y el tooltip, de la misma lectura entera: Ctd, el mínimo y «(n)» (3 escalones), y la línea de su Ctd.
function mismaLectura(m, cuando) {
  const p = padreLana(m);
  const f = fotoLana(m);
  assert.equal(f.fuente, 'lista', `${cuando}: el tooltip sale de la lista`);
  assert.equal(f.cantidad, 10494, `${cuando}: el tooltip, la lista entera`);
  assert.equal(p.cantidad, f.cantidad, `${cuando}: Ctd de la fila padre (${p.cantidad}) y el tooltip (${f.cantidad})`);
  assert.equal(p.texto, m.lua(`SnetForever.Texto.numero(${f.cantidad})`), `${cuando}: lo que se lee en Ctd`);
  assert.equal(p.precioMin, f.precio, `${cuando}: el mínimo de la fila padre (${p.precioMin}) y el del tooltip (${f.precio})`);
  assert.equal(p.compra, dinero(m, f.precio), `${cuando}: lo que se lee en Compra`);
  assert.equal(p.subastas, 3, `${cuando}: «(n)», los escalones de la lista entera`);
  assert.equal(p.cuenta, texto(m, 'SUBASTA_RES_CUENTA', '3'));
  // Y la fila dice de dónde sale su número: de su lista, con la hora de esa lista (la misma que la del tooltip).
  const l = tooltipLana(m);
  assert.ok(l.includes(texto(m, 'SUBASTA_RES_TT_CTD_LISTA', horaMinutos(m, f.hora))), `${cuando}: «de su lista, leída a las…»: ${l}`);
  assert.ok(!l.includes(texto(m, 'SUBASTA_RES_TT_CTD_RESUMEN')), `${cuando}: no dice «del resumen»`);
  return { foto: f, lineas: l };
}

test('la fila padre y el tooltip dan las mismas unidades tras leer, tras desplegar con la lista a medias y tras elegir una subasta', () => {
  const m = maquinaLana();
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  // Leída en esta búsqueda: la fila y el tooltip, de la misma lista entera.
  const leida = mismaLectura(m, 'leída');
  const debajo = texto(m, 'SUBASTA_RES_TT_DEBAJO_MEDIAS', 'x').replace(/x$/, '');
  assert.ok(!empiezaPor(leida.lineas, debajo), 'sin lista a medias debajo');
  // Pasa un rato, alguien compra el escalón más barato y el jugador pulsa la fila: esta vez el servidor no da la lista
  // entera.
  m.avanzar(90);
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return false end');
  m.lua('BANCO.subasta.mercancias[2592] = {{quantity = 4000, unitPrice = 185}, {quantity = 6000, unitPrice = 190}}');
  const antes = pedidas(m).length;
  const i = abrirFila(m, 'Paño de lana');
  assert.ok(hasta(m, () => m.lua('(function() local l, info = SnetForever.Busqueda.subastas(2592) return l ~= nil and info.pendiente == false end)()'), 60), 'llegan sus subastas');
  m.avanzar(0.6);
  assert.equal(pedidas(m).length, antes + 1, 'pulsar la fila pide sus subastas');
  // Debajo, la lista de ahora (lo que se compra): sin el escalón de 179.
  assert.equal(m.lua(`${T}.huecos[${i + 1}].fila.precioUnidad`), 185, 'la primera subasta de debajo es la de ahora');
  // La fila padre, entera de la lectura de antes: Ctd, mínimo y «(n)», como el tooltip.
  const desplegada = mismaLectura(m, 'desplegada con la lista a medias');
  assert.equal(desplegada.foto.hora, leida.foto.hora, 'la entera de antes, con su hora');
  // Y dice que lo de debajo es una lista a medias, con su hora.
  const medias = resumenDeItem(m, 2592).horaPendiente;
  assert.equal(typeof medias, 'number');
  assert.ok(desplegada.lineas.includes(texto(m, 'SUBASTA_RES_TT_DEBAJO_MEDIAS', horaMinutos(m, medias))), `«Debajo: lista a medias, hh:mm»: ${desplegada.lineas}`);
  // Elige una subasta para comprar: la búsqueda de la compra deja otra lista a medias, que también se lee.
  clic(m, i + 1);
  assert.ok(hasta(m, () => compraEstado(m).fase === 'lista', 60), 'la compra queda lista');
  m.avanzar(0.1);
  assert.ok(pedidas(m).length > antes + 1, 'la compra buscó su subasta');
  assert.equal(compraEstado(m).precioUnit, 185, 'la compra, la de la subasta elegida de debajo');
  const elegida = mismaLectura(m, 'tras elegir una subasta');
  assert.ok(empiezaPor(elegida.lineas, debajo), 'sigue diciendo que lo de debajo está a medias');
  assert.equal(compras(m), 0, 'nada se compra sin el clic en Comprar');
  sinErrores(m);
});

test('tras Volver a escanear, mientras no se relee, la fila lleva ↻ y su Ctd dice que es del resumen de la búsqueda', () => {
  const m = maquinaLana();
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  const leida = mismaLectura(m, 'leída').foto;
  // «Volver a escanear»: la búsqueda nueva olvida lo leído; la lectura se pausa antes de llegar a la lana.
  m.avanzar(90);
  m.lua(`${R}.volver:Click()`);
  assert.ok(hasta(m, () => estado(m) === 'completa'), 'la búsqueda acaba');
  m.avanzar(0.05);
  pausarLectura(m);
  const p = padreLana(m);
  assert.equal(p.esperando, true, 'la fila lleva ↻');
  assert.equal(p.cantidad, 10557, 'su Ctd: lo de navegar');
  const f = fotoLana(m);
  assert.deepEqual([f.fuente, f.cantidad, f.hora], ['lista', 10494, leida.hora], 'el tooltip, la lista de antes');
  // Su tooltip dice que ese número es del resumen de la búsqueda (no de su lista).
  const l = tooltipLana(m);
  assert.ok(l.includes(texto(m, 'SUBASTA_RES_TT_CTD_RESUMEN')), `«del resumen de la búsqueda»: ${l}`);
  assert.ok(!empiezaPor(l, texto(m, 'SUBASTA_RES_TT_CTD_LISTA', 'x').replace(/x$/, '')), `no dice «de su lista»: ${l}`);
  // Al seguir la lectura y leerse, los dos vuelven a cuadrar, con la hora de la lista nueva.
  m.lua(`${R}.pausa:Click()`);
  hastaLeidas(m);
  const nueva = mismaLectura(m, 'leída otra vez').foto;
  assert.ok(nueva.hora > leida.hora, 'la hora de la lista nueva');
  sinErrores(m);
});

// Ronda 1, el caso menor: sin una lista entera antes, una lectura a medias. Ctd, el mínimo y «(n)» salen de la misma
// lectura: de navegar si da más unidades (la lista a medias se queda corta) o, si no, de la lista a medias; y su Ctd lo dice.
test('sin una entera antes, con la lista a medias, Ctd, el mínimo y (n) salen de la misma lectura y su Ctd dice cuál', () => {
  const m = maquinaLana([
    '{itemID = 2589, totalQuantity = 20, minPrice = 110}',
    '{itemID = 4306, totalQuantity = 3, minPrice = 150}',
    '{itemID = 2592, totalQuantity = 10557, minPrice = 170}',
  ]);
  // El lino: la lista a medias trae más que navegar (40 frente a 20).
  m.lua('BANCO.subasta.mercancias[2589] = {{quantity = 30, unitPrice = 125}, {quantity = 10, unitPrice = 130}}');
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return false end');
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  // La lana: la lista a medias (10494) se queda corta frente a navegar (10557): todo de navegar, sin «(n)».
  const lana = padreLana(m);
  assert.deepEqual([lana.cantidad, lana.precioMin, lana.subastas ?? null, lana.cuenta], [10557, 170, null, false], 'la lana, todo de navegar');
  assert.equal(lana.compra, dinero(m, 170));
  const lLana = tooltipLana(m);
  assert.ok(lLana.includes(texto(m, 'SUBASTA_RES_TT_CTD_RESUMEN')), `la lana: «del resumen de la búsqueda»: ${lLana}`);
  // El lino: todo de su lista a medias, y lo dice.
  const lino = padreDe(m, 2589);
  assert.deepEqual([lino.cantidad, lino.precioMin, lino.subastas, lino.cuenta], [40, 125, 2, texto(m, 'SUBASTA_RES_CUENTA', '2')], 'el lino, todo de su lista a medias');
  const lLino = tooltipDe(m, 'Paño de lino');
  const hora = resumenDeItem(m, 2589).hora;
  assert.ok(lLino.includes(texto(m, 'SUBASTA_RES_TT_CTD_LISTA_MEDIAS', horaMinutos(m, hora))), `el lino: «de su lista (a medias), leída a las…»: ${lLino}`);
  sinErrores(m);
});

// F5 (detalle de la F4): desplegada, con la lista a medias, sin una entera antes y con navegar mayor, la fila padre sale de
// navegar; las subfilas son esa lista a medias, y el tooltip de la fila lo dice con su hora.
test('desplegada con la lista a medias, sin entera antes y con navegar mayor: la fila sale de navegar y dice «Debajo: lista a medias, hh:mm»', () => {
  const m = maquinaLana([
    '{itemID = 2589, totalQuantity = 20, minPrice = 110}',
    '{itemID = 4306, totalQuantity = 3, minPrice = 150}',
    '{itemID = 2592, totalQuantity = 10557, minPrice = 170}',
  ]);
  m.lua('C_AuctionHouse.HasFullCommoditySearchResults = function() return false end');
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  abrirFila(m, 'Paño de lana');
  assert.ok(hasta(m, () => m.lua('(function() local l, info = SnetForever.Busqueda.subastas(2592) return l ~= nil and info.pendiente == false end)()'), 60), 'llegan sus subastas');
  m.avanzar(0.6);
  const lana = padreLana(m);
  assert.deepEqual([lana.cantidad, lana.precioMin, lana.subastas ?? null], [10557, 170, null], 'la lana, todo de navegar');
  const l = tooltipLana(m);
  assert.ok(l.includes(texto(m, 'SUBASTA_RES_TT_CTD_RESUMEN')), `«del resumen de la búsqueda»: ${l}`);
  const hora = resumenDeItem(m, 2592).hora;
  assert.equal(typeof hora, 'number');
  assert.ok(l.includes(texto(m, 'SUBASTA_RES_TT_DEBAJO_MEDIAS', horaMinutos(m, hora))), `«Debajo: lista a medias, hh:mm»: ${l}`);
  sinErrores(m);
});

// F6, ronda 1 (decisión del coordinador): la línea «Ctd: …» solo va en el tooltip de una fila de Navegar (la pone
// lineasSubasta, ui/subasta/resultados.lua, con el tooltip de la fila); nunca en el de las bolsas, el banco o el chat, que
// pasan solo por el enganche de ui/tooltip.lua.
test('F6: «Ctd: …» sale en el tooltip de la fila de Navegar y no en el del objeto en las bolsas, el banco ni el chat', () => {
  const m = maquinaLana();
  abrir(m);
  buscar(m, 'paño');
  pausarLectura(m);
  const ctd = [texto(m, 'SUBASTA_RES_TT_CTD_RESUMEN'), texto(m, 'SUBASTA_RES_TT_CTD_LISTA', 'x').replace(/x$/, ''),
    texto(m, 'SUBASTA_RES_TT_CTD_LISTA_MEDIAS', 'x').replace(/x$/, '')];
  const conCtd = (l) => l.some((x) => ctd.some((c) => x.startsWith(c)));
  const fila = tooltipLana(m);
  assert.ok(conCtd(fila), `la fila de Navegar lo lleva: ${fila}`);
  // Las bolsas (o el banco: el mismo GameTooltip con el objeto) y el enlace del chat (ItemRefTooltip).
  m.bolsa(0, 1, { id: 2592, n: 5 });
  m.objeto(2592, 5);
  for (const tt of [undefined, 'ItemRefTooltip']) {
    m.tooltipObjeto(2592, tt);
    const l = m.detalleTooltip(tt).map((x) => sinColores(x.izq));
    assert.ok(!conCtd(l), `${tt ?? 'GameTooltip'} sin «Ctd: …»: ${l}`);
  }
  sinErrores(m);
});

// F8, ronda 1: con el ratón quieto sobre una fila de verdad, al llegar la lista nueva de su objeto el tooltip se pone al día
// y conserva lo que pone la fila: el vendedor y los precios en una subfila, y de qué lectura sale la Ctd en una fila padre.
const vecesTt = (m, linea) => lineasTt(m).map(sinColores).filter((x) => x === linea).length;

test('F8 ronda 1: en una subfila, el vendedor y sus precios siguen, una vez cada uno, al llegar la lista nueva', () => {
  const m = maquina();
  m.lua(SUBASTAS);
  abrir(m);
  buscar(m, 'paño');
  const i = abrirFila(m, 'Paño de seda');
  entrar(m, `${T}.huecos[${i + 2}]`);
  const vendedor = sinColores(texto(m, 'SUBASTA_RES_TT_VENDEDOR', 'Mengano'));
  const precios = sinColores(texto(m, 'SUBASTA_RES_TT_PRECIOS', dinero(m, 4000), dinero(m, 5000)));
  assert.equal(vecesTt(m, vendedor), 1);
  assert.equal(vecesTt(m, precios), 1);
  const refrescos = () => m.llamadas('GameTooltip:RefreshData').length;
  const antes = refrescos();
  m.avanzar(1);
  m.lua(`BANCO.subasta.objetos[4306] = {{quantity = 1, buyoutAmount = 5000, bidAmount = 4000, timeLeftSeconds = 7200},
    {quantity = 2, buyoutAmount = 4500, timeLeft = 1}, {quantity = 3, buyoutAmount = 6000}}`);
  assert.equal(m.lua('SnetForever.Busqueda.pedirSubastas(4306)'), true);
  m.avanzar(0.1);
  assert.equal(refrescos(), antes + 1, 'un repintado');
  const venta = m.detalleTooltip().filter((x) => x.izq === 'A la venta');
  assert.equal(venta.length, 1);
  assert.ok(sinColores(venta[0].der).startsWith('6 unidades'), JSON.stringify(venta));
  assert.equal(vecesTt(m, vendedor), 1, `el vendedor: ${lineasTt(m)}`);
  assert.equal(vecesTt(m, precios), 1, `los precios: ${lineasTt(m)}`);
  assert.ok(!JSON.stringify(m.guardado()).includes('Mengano'), 'el vendedor no se guarda');
  sinErrores(m);
});

test('F8 ronda 1: en una fila padre, la línea de la Ctd sigue y dice la hora de la lista nueva', () => {
  const m = maquinaLana();
  abrir(m);
  buscar(m, 'paño');
  hastaLeidas(m);
  const i = huecoDe(m, 'Paño de lana');
  entrar(m, `${T}.huecos[${i}]`);
  const hora1 = m.lua('SnetForever.Busqueda.vivo(2592).hora');
  const ctd1 = texto(m, 'SUBASTA_RES_TT_CTD_LISTA', horaMinutos(m, hora1));
  assert.equal(vecesTt(m, ctd1), 1, `${lineasTt(m)}`);
  m.avanzar(120);
  m.lua('BANCO.subasta.mercancias[2592] = {{quantity = 4000, unitPrice = 185}, {quantity = 6000, unitPrice = 190}}');
  assert.equal(m.lua('SnetForever.Busqueda.pedirSubastas(2592)'), true);
  m.avanzar(0.1);
  const hora2 = m.lua('SnetForever.Busqueda.vivo(2592).hora');
  assert.notEqual(horaMinutos(m, hora2), horaMinutos(m, hora1));
  const ctd2 = texto(m, 'SUBASTA_RES_TT_CTD_LISTA', horaMinutos(m, hora2));
  assert.equal(vecesTt(m, ctd2), 1, `la hora de la lista nueva: ${lineasTt(m)}`);
  assert.equal(vecesTt(m, ctd1), 0, 'y no la de antes');
  const venta = m.detalleTooltip().filter((x) => x.izq === 'A la venta');
  assert.equal(venta.length, 1);
  assert.ok(sinColores(venta[0].der).startsWith(`${m.lua('SnetForever.Texto.numero(10000)')} unidades`), JSON.stringify(venta));
  sinErrores(m);
});

// F12 (en el juego): 5 Paños de lana publicados a 1s 86c: la fila de ese precio pasa de 135 a 140 con «Tú». El juego junta lo
// tuyo y lo de otros en una fila de precio y dice cuánto es tuyo (numOwnerItems). Antes la fila entera contaba como tuya.
const FILA = (cantidad, precio, extra = '') => `{quantity = ${cantidad}, unitPrice = ${precio}, timeLeftSeconds = 30000${extra ? `, ${extra}` : ''}}`;
// Lo que TSM da a entender: containsAccountItem también viene en true en las tuyas.
const TUYAS = (n) => `numOwnerItems = ${n}, containsOwnerItem = true, containsAccountItem = true`;
const DE_OTRO_PJ = 'numOwnerItems = 0, containsOwnerItem = false, containsAccountItem = true';
function lana(filas) {
  const m = maquina({ navegar: ['{itemID = 2592, totalQuantity = 1000, minPrice = 1}'] });
  m.lua(`BANCO.ponerSubasta({mercancias = {[2592] = {${filas.join(', ')}}}})`);
  abrir(m);
  buscar(m, 'lana');
  hastaLeidas(m);
  return m;
}
const filaF12 = (m) => hueco(m, huecoDe(m, 'Paño de lana'));
const vivoF12 = (m) => m.lua('SnetForever.Busqueda.vivo(2592)');
const fotoF12 = (m) => m.lua('(SnetForever.Subasta.foto(2592))');
const llamadas = (m, api) => m.llamadas(`C_AuctionHouse.${api}`);
const clicComprar = (m) => { m.avanzar(0.6); m.lua(`${R}.comprar:Click()`); m.avanzar(0.1); };
const ttDeHueco = (m, i) => {
  entrar(m, `${T}.huecos[${i}]`);
  m.avanzar(0.3); // el tooltip va con la luz de la tabla
  const lineas = lineasTt(m).map(sinColores);
  salir(m, `${T}.huecos[${i}]`);
  m.avanzar(0.3);
  return lineas;
};

test('fila de 1s 86c con 140 unidades y 5 tuyas: la compra mínima es 1s 86c y se pueden comprar 135', () => {
  const m = lana([FILA(140, 186, TUYAS(5)), FILA(50, 200)]);
  assert.equal(filaF12(m).compra, dinero(m, 186));
  const i = abrirFila(m, 'Paño de lana');
  assert.equal(filaF12(m).compra, dinero(m, 186), 'también con la lista abierta');
  const s = m.lua('SnetForever.Busqueda.subastas(2592)')[0];
  assert.deepEqual([s.cantidad, s.propias, s.comprables, s.mia], [140, 5, 135, false]);
  clic(m, i + 1);
  m.avanzar(0.1);
  const e = compraEstado(m);
  assert.deepEqual([e.fase, e.cantidad, e.total], ['lista', 135, 135 * 186]);
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 135);
  sinErrores(m);
});

test('una fila de 135 de otros y 5 tuyas cuenta para la compra mínima de la fila padre y del tooltip', () => {
  const m = lana([FILA(140, 186, TUYAS(5)), FILA(50, 200)]);
  assert.equal(filaF12(m).compra, dinero(m, 186));
  assert.equal(vivoF12(m).precio, 186, 'Busqueda.vivo');
  assert.equal(fotoF12(m), 186, 'Subasta.foto, la del tooltip');
  sinErrores(m);
});

test('tu subasta en el escalón más barato, con otros en esa fila: ese precio sigue siendo el mínimo', () => {
  const m = lana([FILA(10, 150, TUYAS(4)), FILA(50, 186)]);
  assert.equal(filaF12(m).compra, dinero(m, 150));
  assert.equal(vivoF12(m).precio, 150);
  assert.equal(vivoF12(m).minimoDudoso, undefined, 'lo de otros en esa fila es un precio de mercado');
  sinErrores(m);
});

test('tu subasta sola en el escalón más barato: el mínimo es el escalón siguiente', () => {
  const m = lana([FILA(5, 150, TUYAS(5)), FILA(50, 186)]);
  assert.equal(filaF12(m).compra, dinero(m, 186));
  assert.equal(vivoF12(m).precio, 186);
  assert.equal(vivoF12(m).minimoDudoso, undefined, 'lo tuyo no es una duda: no cuenta');
  sinErrores(m);
});

test('una fila entera tuya no cuenta para la compra mínima', () => {
  const m = lana([FILA(5, 150, TUYAS(5)), FILA(50, 186)]);
  const i = abrirFila(m, 'Paño de lana');
  assert.equal(filaF12(m).compra, dinero(m, 186));
  assert.equal(hueco(m, i + 1).vendedor, texto(m, 'SUBASTA_RES_TUYA'));
  clic(m, i + 1);
  m.avanzar(0.1);
  assert.equal(barraTexto(m), texto(m, 'SUBASTA_RES_POR_QUE_TUYA'));
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('la subfila mixta es comprable y dice cuántas son tuyas', () => {
  const m = lana([FILA(140, 186, TUYAS(5)), FILA(50, 200)]);
  const i = abrirFila(m, 'Paño de lana');
  assert.equal(hueco(m, i + 1).cantidad, m.lua('SnetForever.Texto.numero(140)'), 'enseña las 140');
  assert.equal(hueco(m, i + 1).vendedor, texto(m, 'SUBASTA_RES_TUYAS_N', '5'));
  assert.equal(m.lua(`${T}.huecos[${i + 1}].fila.comprable`), true);
  const tt = ttDeHueco(m, i + 1);
  assert.ok(tt.includes(texto(m, 'SUBASTA_RES_TT_TUYAS', '5', '140', '135')), `tooltip: ${tt}`);
  sinErrores(m);
});

test('comprar en una fila mixta no pasa de las de otros y el total del botón es exacto', () => {
  const m = lana([FILA(140, 186, TUYAS(5)), FILA(50, 200)]);
  const i = abrirFila(m, 'Paño de lana');
  clic(m, i + 1);
  m.avanzar(0.1);
  assert.equal(m.lua('SnetForever.Compra.ponerCantidad(140)'), true);
  const total = 135 * 186;
  assert.deepEqual([compraEstado(m).cantidad, compraEstado(m).total], [135, total], 'recortada a las de otros');
  // El camino del jugador: Comprar abre el cuadro de cantidad, que dice las 135 y su total exacto.
  clicComprar(m);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  assert.equal(m.lua(`${Q}.caja:GetText()`), '135');
  assert.equal(m.lua(`${Q}.total:GetText()`), dineroPlano(m, total));
  m.lua(`${Q}.rapidos.max:Click()`);
  assert.equal(compraEstado(m).cantidad, 135, 'Máx. tampoco pasa de las de otros');
  const antes = m.lua('BANCO.jugador.dinero');
  m.avanzar(0.6);
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase').at(-1), [2592, 135]);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).total], ['confirmar', total]);
  m.avanzar(0.6);
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  assert.deepEqual(llamadas(m, 'ConfirmCommoditiesPurchase').at(-1), [2592, 135]);
  assert.equal(m.lua('BANCO.jugador.dinero'), antes - total, 'se paga justo lo del botón');
  assert.equal(m.lua('BANCO.subasta.mercancias[2592][1].quantity'), 5, 'las 5 tuyas siguen ahí');
  sinErrores(m);
});

test('A la venta sigue contando todas las unidades', () => {
  const m = lana([FILA(5, 150, TUYAS(5)), FILA(140, 186, TUYAS(5)), FILA(50, 200)]);
  assert.equal(vivoF12(m).cantidad, 195);
  assert.equal(filaF12(m).cantidad, m.lua('SnetForever.Texto.numero(195)'));
  abrirFila(m, 'Paño de lana');
  assert.equal(filaF12(m).cantidad, m.lua('SnetForever.Texto.numero(195)'), 'también abierta');
  sinErrores(m);
});

test('sin numOwnerItems o con un valor secreto, la fila dice que no se sabe cuántas son tuyas y no resta a ciegas', () => {
  const m = lana([FILA(20, 150, 'sinNumOwnerItems = true, containsOwnerItem = true, propiasServidor = 3'),
    FILA(10, 160, 'numOwnerItems = BANCO.secreto("number"), propiasServidor = 2'), FILA(30, 186)]);
  assert.equal(filaF12(m).compra, dinero(m, 186), 'no cuenta para el mínimo');
  assert.equal(vivoF12(m).precio, 186);
  assert.equal(vivoF12(m).minimoDudoso, 150, 'y se dice que hay un precio más bajo sin contar');
  assert.equal(vivoF12(m).cantidad, 60, 'A la venta las cuenta');
  const i = abrirFila(m, 'Paño de lana');
  const s = m.lua('SnetForever.Busqueda.subastas(2592)');
  assert.equal(s[0].propias, undefined);
  assert.equal(s[0].comprables, undefined);
  assert.equal(s[0].mia, false);
  for (const j of [1, 2]) {
    assert.equal(hueco(m, i + j).vendedor, texto(m, 'SUBASTA_RES_SIN_SABER'));
    assert.equal(m.lua(`${T}.huecos[${i + j}].fila.comprable`), false);
  }
  assert.ok(ttDeHueco(m, i + 1).includes(texto(m, 'SUBASTA_RES_TT_SIN_SABER')));
  assert.ok(ttDeHueco(m, i).includes(sinColores(texto(m, 'SUBASTA_RES_TT_MIN_APARTE', dinero(m, 150)))), 'la fila padre lo dice');
  clic(m, i + 1);
  m.avanzar(0.1);
  assert.equal(barraTexto(m), texto(m, 'SUBASTA_RES_POR_QUE_SIN_SABER'));
  // Elegida por su precio (la lista vieja, el sniper): el juego vende de la más barata hacia arriba y pasaría por la fila
  // que no se sabe: no hay total exacto, así que no se ofrece.
  m.lua('SnetForever.Compra.elegir({item = 2592, precio = 186, cantidad = 5})');
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'propias_desconocidas']);
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('una fila que no se sabe no impide comprar lo más barato que ella, y la cantidad no la pasa', () => {
  const m = lana([FILA(10, 100), FILA(20, 150, 'sinNumOwnerItems = true, containsOwnerItem = true'), FILA(30, 186)]);
  m.lua('SnetForever.Compra.elegir({item = 2592, precio = 186, cantidad = 5})');
  m.avanzar(0.1);
  assert.equal(compraEstado(m).fase, 'lista');
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 10);
  sinErrores(m);
});

test('una fila con subastas de otro personaje de la cuenta no da el precio de mercado', () => {
  const m = lana([FILA(20, 150, DE_OTRO_PJ), FILA(30, 186)]);
  assert.equal(filaF12(m).compra, dinero(m, 186));
  assert.equal(vivoF12(m).precio, 186);
  assert.equal(fotoF12(m), 186);
  assert.equal(vivoF12(m).minimoDudoso, 150);
  assert.equal(vivoF12(m).cantidad, 50, 'A la venta las cuenta');
  const i = abrirFila(m, 'Paño de lana');
  assert.equal(hueco(m, i + 1).vendedor, texto(m, 'SUBASTA_RES_OTRO_PJ'));
  assert.ok(ttDeHueco(m, i + 1).includes(texto(m, 'SUBASTA_RES_TT_OTRO_PJ')));
  assert.ok(ttDeHueco(m, i).includes(sinColores(texto(m, 'SUBASTA_RES_TT_MIN_APARTE', dinero(m, 150)))));
  // La compra no se bloquea ni se fuerza: la decide el juego, con el clic del jugador y su tope.
  clic(m, i + 1);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).cantidad, compraEstado(m).total], ['lista', 20, 3000]);
  assert.equal(llamadas(m, 'StartCommoditiesPurchase').length, 0, 'sin clic en Comprar no se pide nada');
  sinErrores(m);
});

test('una fila que se ha quedado sin unidades no dice que no se sabe de quién es', () => {
  const m = lana([FILA(50, 186)]);
  const d = m.lua('SnetForever.Comercio.duenoMercancia({quantity = 0, unitPrice = 150, numOwnerItems = 0, containsOwnerItem = false, containsAccountItem = false})');
  assert.deepEqual([d.mia, d.paraMinimo, d.dudosa], [false, false, false]);
  sinErrores(m);
});

const SEDA = [
  '{auctionID = 701, quantity = 1, buyoutAmount = 1000, containsOwnerItem = true, containsAccountItem = true}',
  '{auctionID = 702, quantity = 1, buyoutAmount = 2000, containsAccountItem = true}',
  '{auctionID = 703, quantity = 1, buyoutAmount = 2500, containsOwnerItem = BANCO.secreto("boolean")}',
  '{auctionID = 704, quantity = 3, buyoutAmount = 3000}',
];
function seda() {
  const m = maquina({ navegar: ['{itemKey = {itemID = 4306, itemLevel = 0, itemSuffix = 0, battlePetSpeciesID = 0}, totalQuantity = 6, minPrice = 1000}'] });
  m.lua(`BANCO.ponerSubasta({objetos = {[4306] = {${SEDA.join(', ')}}}})`);
  abrir(m);
  buscar(m, 'seda');
  hastaLeidas(m);
  return m;
}

test('objetos sueltos, las mismas reglas: lo tuyo y lo de otro personaje no dan el mínimo y lo que no se sabe no se compra', () => {
  const m = seda();
  const vivo = m.lua('SnetForever.Busqueda.vivo(4306)');
  assert.equal(vivo.precio, 3000);
  assert.equal(vivo.minimoDudoso, 2000, 'la tuya no es una duda; la de otro personaje, sí');
  assert.equal(vivo.cantidad, 6, 'A la venta las cuenta todas');
  const i = abrirFila(m, 'Paño de seda');
  assert.equal(hueco(m, i).compra, dinero(m, 3000));
  assert.deepEqual([1, 2, 3, 4].map((j) => hueco(m, i + j).vendedor),
    [texto(m, 'SUBASTA_RES_TUYA'), texto(m, 'SUBASTA_RES_OTRO_PJ'), texto(m, 'SUBASTA_RES_SIN_SABER'), '']);
  clic(m, i + 1);
  m.avanzar(0.1);
  assert.equal(barraTexto(m), texto(m, 'SUBASTA_RES_POR_QUE_TUYA'));
  clic(m, i + 3);
  m.avanzar(0.1);
  assert.equal(barraTexto(m), texto(m, 'SUBASTA_RES_POR_QUE_SIN_SABER'));
  assert.equal(llamadas(m, 'PlaceBid').length, 0);
  // La de otro personaje: no se bloquea ni se fuerza. Sigue pidiendo los dos clics y lo decide el juego.
  clic(m, i + 2);
  m.avanzar(0.1);
  assert.equal(compraEstado(m).fase, 'lista');
  clicComprar(m);
  assert.equal(compraEstado(m).fase, 'confirmar');
  assert.equal(llamadas(m, 'PlaceBid').length, 0, 'el primer clic no compra');
  clicComprar(m);
  assert.deepEqual(llamadas(m, 'PlaceBid').at(-1), [702, 2000]);
  sinErrores(m);
});

test('los objetos sueltos no cambian', () => {
  const m = maquina({ navegar: ['{itemKey = {itemID = 4306, itemLevel = 0, itemSuffix = 0, battlePetSpeciesID = 0}, totalQuantity = 4, minPrice = 3000}'] });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{auctionID = 801, quantity = 3, buyoutAmount = 3000}, {auctionID = 802, quantity = 1, buyoutAmount = 4000}}}})');
  abrir(m);
  buscar(m, 'seda');
  hastaLeidas(m);
  const vivo = m.lua('SnetForever.Busqueda.vivo(4306)');
  assert.deepEqual([vivo.precio, vivo.cantidad, vivo.subastas, vivo.minimoDudoso], [3000, 4, 4, undefined]);
  const i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).cantidad, compraEstado(m).total], ['lista', 1, 3000]);
  clicComprar(m);
  clicComprar(m);
  assert.deepEqual(llamadas(m, 'PlaceBid').at(-1), [801, 3000]);
  sinErrores(m);
});

// F12, ronda 1 (revisión, con oro de verdad). En el juego, una fila solo tuya da quantity 1, numOwnerItems 1,
// containsOwnerItem true y containsAccountItem true: containsAccountItem no significa por sí solo «otro personaje».
const cuadroComprar = (m) => { clicComprar(m); m.avanzar(0.6); m.lua(`${Q}.comprar:Click()`); m.avanzar(0.1); };
const quePide = (m) => [llamadas(m, 'StartCommoditiesPurchase').length, llamadas(m, 'ConfirmCommoditiesPurchase').length];
function sedaCon(filas, antes = '') {
  const m = maquina({ navegar: ['{itemKey = {itemID = 4306, itemLevel = 0, itemSuffix = 0, battlePetSpeciesID = 0}, totalQuantity = 4, minPrice = 1000}'] });
  m.lua(`BANCO.ponerSubasta({objetos = {[4306] = {${filas.join(', ')}}}})`);
  if (antes) m.lua(antes);
  abrir(m);
  buscar(m, 'seda');
  hastaLeidas(m);
  return m;
}

test('ronda 1: otro personaje más barato que la fila marcada: no se ofrece la compra y la barra dice a qué precio está', () => {
  const m = lana([FILA(20, 150, DE_OTRO_PJ), FILA(30, 186)]);
  const i = abrirFila(m, 'Paño de lana');
  clic(m, i + 2);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'otro_personaje']);
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 0, 'Máx. no dice 50');
  assert.ok(barraTexto(m).includes(texto(m, 'COMERCIO_MOTIVO_OTRO_PJ_PRECIO', dineroPlano(m, 150))), barraTexto(m));
  assert.deepEqual(quePide(m), [0, 0]);
  sinErrores(m);
});

test('ronda 1: con otro personaje en medio, la cantidad se queda en lo más barato que él', () => {
  const m = lana([FILA(10, 100), FILA(20, 150, DE_OTRO_PJ), FILA(30, 186)]);
  m.lua('SnetForever.Compra.elegir({item = 2592, precio = 186, cantidad = 5})');
  m.avanzar(0.1);
  assert.equal(compraEstado(m).fase, 'lista');
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 10);
  sinErrores(m);
});

test('ronda 1: la fila de otro personaje que el jugador ha marcado se puede pedir: lo decide el juego', () => {
  const m = lana([FILA(20, 150, DE_OTRO_PJ), FILA(30, 186)]);
  const i = abrirFila(m, 'Paño de lana');
  clic(m, i + 1);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).cantidad, compraEstado(m).total], ['lista', 20, 3000]);
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 20, 'no sigue hacia arriba');
  cuadroComprar(m);
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase').at(-1), [2592, 20]);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).total], ['confirmar', 3000]);
  sinErrores(m);
});

test('ronda 1: elegida por su precio (sniper o lista), la fila de otro personaje no se compra', () => {
  const m = lana([FILA(20, 150, DE_OTRO_PJ), FILA(30, 186)]);
  m.lua('SnetForever.Compra.elegir({item = 2592, precio = 150, cantidad = 20, origen = "sniper"})');
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'otro_personaje']);
  assert.deepEqual(quePide(m), [0, 0]);
  sinErrores(m);
});

test('ronda 1: un objeto suelto por precio no elige la subasta de otro personaje, aunque empate', () => {
  const m = sedaCon(['{auctionID = 901, quantity = 1, buyoutAmount = 2000, containsAccountItem = true}',
    '{auctionID = 902, quantity = 1, buyoutAmount = 2000}']);
  m.lua('SnetForever.Compra.elegir({item = 4306, precio = 2000, cantidad = 1, origen = "sniper"})');
  m.avanzar(0.1);
  // Elegida desde fuera de esta vista: un botón propio, porque comprar exige el OnClick de un botón.
  m.lua('rawset(_G, "BOTON_F12", CreateFrame("Button")); BOTON_F12:SetScript("OnClick", function() SnetForever.Compra.pulsar() end)');
  for (let n = 0; n < 2; n++) { m.avanzar(0.6); m.lua('BOTON_F12:Click()'); m.avanzar(0.1); }
  assert.deepEqual(llamadas(m, 'PlaceBid').at(-1), [902, 2000]);
  sinErrores(m);
});

test('ronda 1: un objeto suelto por precio con solo la de otro personaje a ese precio no se compra', () => {
  const m = sedaCon(['{auctionID = 901, quantity = 1, buyoutAmount = 2000, containsAccountItem = true}',
    '{auctionID = 902, quantity = 1, buyoutAmount = 3000}']);
  m.lua('SnetForever.Compra.elegir({item = 4306, precio = 2000, cantidad = 1, origen = "sniper"})');
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'otro_personaje']);
  assert.ok(barraTexto(m).length > 0);
  assert.equal(llamadas(m, 'PlaceBid').length, 0);
  sinErrores(m);
});

test('ronda 1: con propias bajo el tope, una cotización más baja que la lista se cancela y no compra lo tuyo', () => {
  const m = lana([FILA(5, 150, `${TUYAS(5)}, propiasServidor = 0`), FILA(30, 186)]);
  const i = abrirFila(m, 'Paño de lana');
  clic(m, i + 2);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).total], ['lista', 5580]);
  cuadroComprar(m);
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase').at(-1), [2592, 30]);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'cambio_precio']);
  assert.equal(llamadas(m, 'CancelCommoditiesPurchase').length > 0, true);
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('ronda 1: sin propias en medio, una cotización más baja que la lista se sigue aceptando', () => {
  const m = lana([FILA(30, 186)]);
  const i = abrirFila(m, 'Paño de lana');
  clic(m, i + 1);
  m.avanzar(0.1);
  m.lua('BANCO.subasta.precioCompra = 170');
  cuadroComprar(m);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).total], ['confirmar', 5100]);
  sinErrores(m);
});

test('ronda 1: una compra de varios escalones con propias paga lo exacto y deja lo tuyo', () => {
  const m = lana([FILA(10, 150, TUYAS(4)), FILA(140, 186, TUYAS(5)), FILA(50, 200)]);
  const i = abrirFila(m, 'Paño de lana');
  clic(m, i + 3);
  m.avanzar(0.1);
  const total = 6 * 150 + 44 * 186;
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).cantidad, compraEstado(m).total], ['lista', 50, total]);
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 6 + 135 + 50);
  const antes = m.lua('BANCO.jugador.dinero');
  cuadroComprar(m);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).total], ['confirmar', total]);
  m.avanzar(0.6);
  m.lua(`${Q}.comprar:Click()`);
  m.avanzar(0.1);
  assert.equal(m.lua('BANCO.jugador.dinero'), antes - total);
  assert.deepEqual(m.lua('{BANCO.subasta.mercancias[2592][1].quantity, BANCO.subasta.mercancias[2592][2].quantity}'), [4, 96]);
  sinErrores(m);
});

test('ronda 1: la fila mixta avisa de que puede llevar también a tus otros personajes y sigue contando para el mínimo', () => {
  const m = lana([FILA(140, 186, TUYAS(5)), FILA(50, 200)]);
  assert.equal(vivoF12(m).precio, 186);
  const i = abrirFila(m, 'Paño de lana');
  const tt = ttDeHueco(m, i + 1);
  assert.ok(tt.includes(texto(m, 'SUBASTA_RES_TT_QUIZA_OTRO_PJ')), `tooltip: ${tt}`);
  sinErrores(m);
});

test('ronda 1: los valores de una mercancía que no cuadran son «no se sabe»', () => {
  const m = lana([FILA(30, 186)]);
  const dudosas = {
    'más que quantity': 'numOwnerItems = 999, containsOwnerItem = true, containsAccountItem = true',
    'n > 0 sin dueño': 'numOwnerItems = 3, containsOwnerItem = false, containsAccountItem = false',
    'n > 0 con cuenta sin dueño': 'numOwnerItems = 20, containsOwnerItem = false, containsAccountItem = true',
    'no entero': 'numOwnerItems = 2.5, containsOwnerItem = true, containsAccountItem = true',
    'nil sin dueño': 'containsOwnerItem = false, containsAccountItem = false',
    '0 con dueño': 'numOwnerItems = 0, containsOwnerItem = true, containsAccountItem = true',
    'negativo': 'numOwnerItems = -1, containsOwnerItem = true, containsAccountItem = true',
    'texto': 'numOwnerItems = "5", containsOwnerItem = true, containsAccountItem = true',
    'sin nada': '',
  };
  for (const [caso, campos] of Object.entries(dudosas)) {
    const d = m.lua(`SnetForever.Comercio.duenoMercancia({quantity = 20, ${campos}})`);
    assert.deepEqual([d.propias, d.comprables, d.mia, d.paraMinimo, d.dudosa], [undefined, undefined, false, false, true], caso);
  }
  const bien = (campos) => { const d = m.lua(`SnetForever.Comercio.duenoMercancia({quantity = 20, ${campos}})`); return [d.propias, d.comprables, d.mia, d.cuenta]; };
  assert.deepEqual(bien('numOwnerItems = 20, containsOwnerItem = true, containsAccountItem = true'), [20, 0, true, false], 'toda tuya');
  assert.deepEqual(bien('numOwnerItems = 5, containsOwnerItem = true, containsAccountItem = true'), [5, 15, false, false], 'mixta');
  assert.deepEqual(bien('numOwnerItems = 0, containsOwnerItem = false, containsAccountItem = false'), [0, 20, false, false], 'de otros');
  assert.deepEqual(bien('numOwnerItems = 0, containsOwnerItem = false, containsAccountItem = true'), [0, 20, false, true], 'otro personaje');
  sinErrores(m);
});

test('ronda 1: una fila con 0 y dueño o con más de quantity no se compra ni da el mínimo', () => {
  const m = lana([FILA(10, 140, 'numOwnerItems = 0, containsOwnerItem = true, containsAccountItem = true'),
    FILA(10, 150, 'numOwnerItems = 99, containsOwnerItem = true, containsAccountItem = true'), FILA(30, 186)]);
  assert.equal(vivoF12(m).precio, 186);
  assert.equal(vivoF12(m).minimoDudoso, 140);
  const i = abrirFila(m, 'Paño de lana');
  for (const j of [1, 2]) assert.equal(hueco(m, i + j).vendedor, texto(m, 'SUBASTA_RES_SIN_SABER'));
  sinErrores(m);
});

test('ronda 1: un objeto suelto sin containsOwnerItem o con él secreto es «no se sabe»: ni mínimo ni compra', () => {
  for (const campos of ['', 'containsAccountItem = true', 'containsOwnerItem = BANCO.secreto("boolean"), containsAccountItem = true']) {
    const m = lana([FILA(30, 186)]);
    const d = m.lua(`SnetForever.Comercio.duenoObjeto({${campos}})`);
    assert.deepEqual([d.propias, d.comprables, d.mia, d.paraMinimo, d.dudosa], [undefined, undefined, false, false, true], campos);
    sinErrores(m);
  }
  const m = sedaCon(['{auctionID = 801, quantity = 1, buyoutAmount = 1000}', '{auctionID = 802, quantity = 1, buyoutAmount = 3000}'],
    'local A = C_AuctionHouse; local f = A.GetItemSearchResultInfo; A.GetItemSearchResultInfo = function(...) local r = f(...); if r and r.auctionID == 801 then r.containsOwnerItem = nil end; return r end');
  const vivo = m.lua('SnetForever.Busqueda.vivo(4306)');
  assert.deepEqual([vivo.precio, vivo.minimoDudoso], [3000, 1000]);
  const i = abrirFila(m, 'Paño de seda');
  clic(m, i + 1);
  m.avanzar(0.1);
  assert.equal(barraTexto(m), texto(m, 'SUBASTA_RES_POR_QUE_SIN_SABER'));
  assert.equal(llamadas(m, 'PlaceBid').length, 0);
  sinErrores(m);
});

test('ronda 1: con una fila dudosa más barata que la marcada, la barra habla de la más barata', () => {
  const m = lana([FILA(20, 150, 'sinNumOwnerItems = true, containsOwnerItem = true'), FILA(30, 186)]);
  const i = abrirFila(m, 'Paño de lana');
  clic(m, i + 2);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'propias_desconocidas']);
  assert.ok(barraTexto(m).includes(texto(m, 'COMERCIO_MOTIVO_SIN_SABER_PRECIO', dineroPlano(m, 150))), barraTexto(m));
  assert.equal(hueco(m, i + 2).vendedor, '', 'la marcada se sabe que es de otros');
  sinErrores(m);
});

// F12, ronda 2: la lista del cliente es una foto. Si en el servidor entran unidades más baratas y se venden otras, una
// cotización MÁS BAJA que la lista puede llevar unidades de la fila siguiente, aunque esté por encima del tope. Si en la
// lista hay una fila de otro personaje (a cualquier precio) o una que no se sabe de quién es, la cotización tiene que ser igual.
const fotoDelCliente = (m) => m.lua('BANCO.ponerSubasta({foto = true})');
const servidorMasBarato = (m) => m.lua('local f = BANCO.subasta.mercancias[2592][1]; f.quantity, f.unitPrice = 9, 99');
function pulsarConBoton(m) {
  m.lua('if not rawget(_G, "BOTON_F12") then rawset(_G, "BOTON_F12", CreateFrame("Button")); BOTON_F12:SetScript("OnClick", function() SnetForever.Compra.pulsar() end) end');
  m.avanzar(0.6);
  m.lua('BOTON_F12:Click()');
  m.avanzar(0.1);
}
function noComproDeOtroPj(m) {
  assert.deepEqual(llamadas(m, 'StartCommoditiesPurchase').at(-1), [2592, 10]);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'cambio_precio']);
  assert.ok(llamadas(m, 'CancelCommoditiesPurchase').length > 0, 'cancela la cotización');
  assert.equal(llamadas(m, 'ConfirmCommoditiesPurchase').length, 0);
  assert.equal(m.lua('BANCO.subasta.mercancias[2592][2].quantity'), 20, 'su fila sigue entera');
}

test('ronda 2: por precio, una cotización más baja que pasaría por otro personaje se cancela', () => {
  const m = lana([FILA(10, 100), FILA(20, 101, DE_OTRO_PJ), FILA(30, 186)]);
  fotoDelCliente(m);
  m.lua('SnetForever.Compra.elegir({item = 2592, precio = 100, cantidad = 10, origen = "sniper"})');
  m.avanzar(0.1);
  m.lua('SnetForever.Compra.ponerCantidad(10)');
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).cantidad, compraEstado(m).total], ['lista', 10, 1000]);
  servidorMasBarato(m);
  pulsarConBoton(m);
  noComproDeOtroPj(m);
  sinErrores(m);
});

test('ronda 2: con la fila marcada, una cotización más baja que pasaría por otro personaje se cancela', () => {
  const m = lana([FILA(10, 100), FILA(20, 101, DE_OTRO_PJ), FILA(30, 186)]);
  const i = abrirFila(m, 'Paño de lana');
  fotoDelCliente(m);
  clic(m, i + 1);
  m.avanzar(0.1);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).cantidad, compraEstado(m).total], ['lista', 10, 1000]);
  servidorMasBarato(m);
  cuadroComprar(m);
  noComproDeOtroPj(m);
  sinErrores(m);
});

test('ronda 2: una fila que no se sabe de quién es, por encima del tope, también exige la cotización exacta', () => {
  const m = lana([FILA(10, 100), FILA(20, 101, 'sinNumOwnerItems = true, containsOwnerItem = false, containsAccountItem = true'), FILA(30, 186)]);
  fotoDelCliente(m);
  m.lua('SnetForever.Compra.elegir({item = 2592, precio = 100, cantidad = 10, origen = "sniper"})');
  m.avanzar(0.1);
  m.lua('SnetForever.Compra.ponerCantidad(10)');
  servidorMasBarato(m);
  pulsarConBoton(m);
  noComproDeOtroPj(m);
  sinErrores(m);
});

test('ronda 2: la fila de otro personaje marcada se confirma con la cotización exacta y se cancela con una más baja', () => {
  const exacta = lana([FILA(20, 150, DE_OTRO_PJ), FILA(30, 186)]);
  const i = abrirFila(exacta, 'Paño de lana');
  clic(exacta, i + 1);
  exacta.avanzar(0.1);
  cuadroComprar(exacta);
  assert.deepEqual([compraEstado(exacta).fase, compraEstado(exacta).total], ['confirmar', 3000]);
  sinErrores(exacta);

  const baja = lana([FILA(20, 150, DE_OTRO_PJ), FILA(30, 186)]);
  const j = abrirFila(baja, 'Paño de lana');
  clic(baja, j + 1);
  baja.avanzar(0.1);
  baja.lua('BANCO.subasta.precioCompra = 140');
  cuadroComprar(baja);
  assert.deepEqual([compraEstado(baja).fase, compraEstado(baja).motivo], ['error', 'cambio_precio']);
  assert.equal(llamadas(baja, 'ConfirmCommoditiesPurchase').length, 0);
  sinErrores(baja);
});

test('ronda 2: una fila de otro personaje ya vacía no cambia nada: la cotización más baja se acepta', () => {
  const m = lana([FILA(10, 100), FILA(0, 101, DE_OTRO_PJ)]);
  const i = abrirFila(m, 'Paño de lana');
  clic(m, i + 1);
  m.avanzar(0.1);
  m.lua('BANCO.subasta.precioCompra = 90');
  cuadroComprar(m);
  assert.deepEqual([compraEstado(m).fase, compraEstado(m).total], ['confirmar', 900]);
  sinErrores(m);
});

test('ronda 2: un objeto por precio que ya no está dice que ya no está, aunque quede otra apartada a otro precio', () => {
  for (const campos of ['containsAccountItem = true', 'containsOwnerItem = BANCO.secreto("boolean")']) {
    const m = sedaCon([`{auctionID = 901, quantity = 1, buyoutAmount = 3000, ${campos}}`]);
    m.lua('SnetForever.Compra.elegir({item = 4306, precio = 2000, cantidad = 1, origen = "sniper"})');
    m.avanzar(0.1);
    assert.deepEqual([compraEstado(m).fase, compraEstado(m).motivo], ['error', 'ya_no_esta'], campos);
    assert.equal(llamadas(m, 'PlaceBid').length, 0);
    sinErrores(m);
  }
});
