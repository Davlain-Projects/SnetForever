// Subasta, parte 3, bloque B, tarea S2: la pestaña Sniper con la misma distribución que la de TSM
// (SnetForever.SubastaSniper, ui/subasta/sniper.lua). Arriba una sola fila: «‹ Salir del escaneo», el título centrado y
// «Reiniciar». Debajo, la tabla con su marco fino (columnas ⋮ · (!) · Objeto · Niv. · Ctd · Compra · %; los mismos
// objetos juntos con su número y triángulo). Abajo una sola barra oscura: pausa/seguir, el engranaje (con la casilla del
// sonido), el estado en medio, Descartar y Comprar. Nada parpadea: las filas nuevas entran abajo y lo que se ve no sube ni
// baja solo (ronda 1: haya o no ratón encima o fila elegida; una fila que se va se queda hasta un gesto del jugador).
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

const P = 'SnetForever.SubastaSniper.marcos';
const T = `${P}.tabla`;
const V = 'SnetForever.UIComercio.marco()';
const S = 'SnetForever.Sniper';
const SV = 'SnetForever.SubastaVentana';
const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}; AuctionHouseFrame:EnableMouse(true); ';

// Precios de la app: lo normal de todos es 10 de oro (100000 de cobre), ritmo 0,6 (como en comercio-sniper.test.js).
const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const BASE = [2589, 2592, 4306, 4338, 14047];
function ponerRanura(dir, extra) {
  const i = (H % 8) + 1;
  const nombre = `SnetForever_P${String(i).padStart(2, '0')}`;
  const carpeta = join(dir, nombre);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n');
  const filas = [...BASE, ...extra].map((item) => `[${item}] = {98000, 400, 100000, 0, 0.6, 85, 0}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true}
`);
}

function maquina({ idioma = 'es', sitio = '{x = 20, y = 20, ancho = 860, alto = 545}', extra = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-subasta-sniper-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir, extra);
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' }, previo: SUBASTA });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua(`SnetForever.Ajustes.set("idioma", ${aLua(idioma)})`);
  m.lua('BANCO.jugador.dinero = 10000000');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, nivel: 5 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1, nivel: 15 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 2, nivel: 25 });
  m.itemInfo(4338, { nombre: 'Paño de magia', calidad: 1, nivel: 35 });
  m.itemInfo(14047, { nombre: 'Paño rúnico', calidad: 1, nivel: 50 });
  extra.forEach((id, k) => m.itemInfo(id, { nombre: `Cosa ${String(k + 1).padStart(2, '0')}`, calidad: 1, nivel: 10 }));
  if (sitio) m.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = ${sitio}`);
  return m;
}

// Lo que da la búsqueda general: {item: precio} (cantidad 10 de cada uno) o filas con su itemKey.
function publicar(m, filas) {
  const lua = Array.isArray(filas) ? filas : Object.entries(filas).map(([item, p]) => `{itemID = ${item}, totalQuantity = 10, minPrice = ${p}}`);
  m.lua(`BANCO.ponerSubasta({navegar = {${lua.join(', ')}}, porPagina = 50})`);
}
const escaneo = (m) => m.lua('SnetForever.Escaneo.estado()');
function abrirYEscanear(m) {
  m.disparar('AUCTION_HOUSE_SHOW');
  for (let i = 0; i < 400 && escaneo(m) !== 'completo'; i++) m.avanzar(0.05);
  assert.equal(escaneo(m), 'completo', 'el escaneo de la apertura acaba');
}
// La pestaña Sniper y su botón Empezar (el sniper no arranca solo).
function empezar(m) {
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.6);
}
const hallazgos = (m) => m.lua(`${S}.hallazgos()`) || [];
const texto = (m, clave, ...args) => m.lua(`SnetForever.L.t(${[clave, ...args].map(aLua).join(', ')})`);
const sinColores = (t) => (t || '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');
const lineasTt = (m) => (m.lua('BANCO.lineasTooltip()') || []).map(sinColores);
const entrar = (m, expr) => m.lua(`${expr}:GetScript("OnEnter")(${expr})`);
const salir = (m, expr) => m.lua(`${expr}:GetScript("OnLeave")(${expr})`);
const COMPRAS = ['PlaceBid', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase'];
const compras = (m) => COMPRAS.reduce((n, api) => n + m.llamadas(`C_AuctionHouse.${api}`).length, 0);
const estadoTexto = (m) => m.lua(`${P}.estado.texto:GetText()`);
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.51, `${msg}: ${a} y no ${b}`);
// Lo que enseña el hueco i de la tabla (nil si no se ve).
const hueco = (m, i) => m.lua(`(function()
  local h = ${T}.huecos[${i}]
  if not h or not h:IsShown() then return nil end
  local c = h.celdas
  return {objeto = c.objeto:GetText(), nivel = c.nivel:GetText(), cantidad = c.cantidad:GetText(), compra = c.compra:GetText(),
    pct = c.pct:GetText(), cuenta = h.snfCuenta and h.snfCuenta:IsShown() and h.snfCuenta:GetText() or false,
    triangulo = h.abrir:IsShown(), alerta = h.snfAlerta and h.snfAlerta:IsShown() or false, clave = h.fila and h.fila.clave}
end)()`);
const huecoDe = (m, nombre) => m.lua(`(function() for i, h in ipairs(${T}.huecos) do if h:IsShown() and h.celdas.objeto:GetText() == ${aLua(nombre)} then return i end end end)()`);
// Las medidas de una pieza frente a los bordes de la página del sniper (en píxeles de la ventana).
const caja = (m, expr) => m.lua(`(function()
  local p = ${P}.pagina
  local x = ${expr}
  return {izq = x:GetLeft() - p:GetLeft(), der = p:GetRight() - x:GetRight(), arriba = p:GetTop() - x:GetTop(),
    abajo = x:GetBottom() - p:GetBottom(), ancho = x:GetWidth(), alto = x:GetHeight(),
    centro = (x:GetLeft() + x:GetRight()) / 2 - (p:GetLeft() + p:GetRight()) / 2}
end)()`);
// Anchos de letra de verdad para Montserrat (los de subasta-resultados.test.js).
const FACTOR_LETRA = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };
const letraReal = (m) => m.lua(`BANCO.letraReal = {${Object.entries(FACTOR_LETRA).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);

// Dos hallazgos: la seda al 60 % y el lino al 70 % (objetos sueltos, una subasta de cada uno para comprar).
function conHallazgos(m) {
  publicar(m, { 2589: 70000, 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[2589] = {{quantity = 1, buyoutAmount = 70000}}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  empezar(m);
  assert.equal(hallazgos(m).length, 2, 'dos hallazgos');
}

// ---------------------------------------------------------------------------------------------------

test('disposición: Salir, título y Reiniciar arriba; la tabla con marco; la barra de abajo con pausa, engranaje, estado, Descartar y Comprar; a 860×545, a 1200×700 y al mínimo (830×500), en es y en; nada se pisa', () => {
  for (const [ancho, alto] of [[860, 545], [1200, 700], [830, 500]]) {
    for (const idioma of ['es', 'en']) {
      const m = maquina({ idioma, sitio: `{x = 20, y = 20, ancho = ${ancho}, alto = ${alto}}` });
      letraReal(m);
      conHallazgos(m);
      const msg = `${idioma} a ${ancho}×${alto}`;
      cerca(m.lua(`${V}:GetWidth()`), ancho, `${msg}: ancho de la ventana`);
      const c = Object.fromEntries(['salir', 'titulo', 'reiniciar', 'marcoTabla', 'pie', 'pausa', 'engranaje', 'estado', 'descartar', 'comprar']
        .map((n) => [n, caja(m, `${P}.${n}`)]));
      const pagina = m.lua(`{${P}.pagina:GetWidth(), ${P}.pagina:GetHeight()}`);
      cerca(pagina[0], ancho, `${msg}: la página es de lado a lado de la ventana`);
      // Arriba: Salir pegado a la izquierda, el título centrado y Reiniciar pegado a la derecha, en la misma fila.
      cerca(c.salir.izq, 12, `${msg}: Salir a 12 px del borde izquierdo`);
      cerca(c.salir.arriba, 8, `${msg}: Salir a 8 px de la cabecera`);
      assert.ok(Math.abs(c.titulo.centro) <= 1, `${msg}: el título centrado (${c.titulo.centro})`);
      cerca(c.reiniciar.der, 12, `${msg}: Reiniciar a 12 px del borde derecho`);
      cerca(c.reiniciar.arriba, 8, `${msg}: Reiniciar arriba`);
      cerca(c.reiniciar.alto, m.lua(`${SV}.marcos.verBlizzard:GetHeight()`), `${msg}: Reiniciar del alto de «Vista de Blizzard»`);
      const tituloAncho = m.lua(`${P}.titulo:GetUnboundedStringWidth()`);
      assert.ok(c.salir.izq + c.salir.ancho < -tituloAncho / 2 + c.titulo.centro + pagina[0] / 2 - 4, `${msg}: Salir no pisa el título`);
      assert.ok(pagina[0] / 2 + c.titulo.centro + tituloAncho / 2 < pagina[0] - c.reiniciar.der - c.reiniciar.ancho - 4, `${msg}: el título no pisa Reiniciar`);
      // La tabla con su marco, de lado a lado, entre la fila de arriba y la barra de abajo.
      cerca(c.marcoTabla.izq, 12, `${msg}: la tabla a 12 px a la izquierda`);
      cerca(c.marcoTabla.der, 12, `${msg}: la tabla a 12 px a la derecha`);
      cerca(c.marcoTabla.arriba, 8 + c.reiniciar.alto + 8, `${msg}: la tabla 8 px bajo la fila de arriba`);
      cerca(c.marcoTabla.abajo, c.pie.abajo + c.pie.alto + 8, `${msg}: la tabla 8 px sobre la barra de abajo`);
      assert.equal(m.lua(`${P}.marcoTabla.fondo ~= nil`), true, `${msg}: el marco de la tabla tiene su fondo y su borde fino`);
      // La barra de abajo, a todo lo ancho y pegada abajo (1 px dentro del borde de la ventana).
      assert.ok(c.pie.izq <= 1 && c.pie.der <= 1 && c.pie.abajo <= 1, `${msg}: la barra de abajo de lado a lado y abajo: ${JSON.stringify(c.pie)}`);
      // Pausa a la izquierda, el engranaje a su derecha, el estado en medio, Descartar y Comprar a la derecha.
      cerca(c.pausa.izq, 12, `${msg}: la pausa a 12 px del borde`);
      cerca(c.pausa.ancho, c.pausa.alto, `${msg}: la pausa es cuadrada`);
      cerca(c.engranaje.izq - (c.pausa.izq + c.pausa.ancho), 8, `${msg}: el engranaje a 8 px de la pausa`);
      cerca(c.estado.izq - (c.engranaje.izq + c.engranaje.ancho), 8, `${msg}: el estado a 8 px del engranaje`);
      cerca(c.comprar.der, 12 + m.lua('SnetForever.Piezas.CABECERA.asa'), `${msg}: Comprar pegado a la derecha (antes del asa)`);
      cerca(c.comprar.izq - (c.descartar.izq + c.descartar.ancho), 8, `${msg}: Descartar justo a la izquierda de Comprar`);
      cerca(c.descartar.izq - (c.estado.izq + c.estado.ancho), 8, `${msg}: el estado acaba a 8 px de Descartar`);
      for (const n of ['pausa', 'engranaje', 'estado', 'descartar', 'comprar']) {
        cerca(c[n].abajo, 8, `${msg}: ${n} a 8 px del borde de abajo`);
        assert.ok(c[n].abajo >= c.pie.abajo && c[n].abajo + c[n].alto <= c.pie.abajo + c.pie.alto, `${msg}: ${n} dentro de la barra`);
      }
      assert.ok(c.estado.ancho >= 200, `${msg}: el estado es ancho (${c.estado.ancho})`);
      assert.ok(c.comprar.ancho >= 200, `${msg}: Comprar es ancho (${c.comprar.ancho})`);
      // El estado, centrado en su campo.
      assert.equal(m.lua(`${P}.estado.texto:GetJustifyH()`), 'CENTER', `${msg}: el texto del estado va centrado`);
      const t = caja(m, `${P}.estado.texto`);
      assert.ok(Math.abs(t.centro - c.estado.centro) <= 1, `${msg}: el texto del estado en el centro de su campo`);
      // Las columnas caben en la tabla.
      const derTabla = m.lua(`${P}.marcoTabla:GetRight()`);
      for (const clave of ['aviso', 'objeto', 'nivel', 'cantidad', 'compra', 'pct', 'foto']) {
        assert.ok(m.lua(`${T}.cabeceras.${clave}:GetRight()`) <= derTabla + 0.01, `${msg}: ${clave} dentro de la tabla`);
      }
      sinErrores(m);
    }
  }
});

test('las columnas son ⋮ · (!) · Objeto · Niv. · Ctd · Compra · %, las de la vista de resultados (sin vendedor ni puja: el sniper no los tiene)', () => {
  const m = maquina();
  conHallazgos(m);
  const orden = m.lua(`(function() local r = {} for i, c in ipairs(${T}._columnas) do r[i] = c.clave end return r end)()`);
  assert.deepEqual(orden, ['aviso', 'objeto', 'nivel', 'cantidad', 'compra', 'pct', 'foto'], 'F1 ronda 2: y la Foto, la última');
  const titulos = ['objeto', 'nivel', 'cantidad', 'compra', 'pct'].map((c) => m.lua(`${T}.cabeceras.${c}.texto:GetText()`));
  assert.deepEqual(titulos, ['Objeto', 'Niv.', 'Ctd', 'Compra (objeto)', '%']);
  assert.equal(m.lua(`${T}.cabeceras.vendedor == nil`), true, 'sin columna de vendedor');
  assert.equal(m.lua(`${T}.cabeceras.puja == nil`), true, 'ronda 1: sin columna de puja (la búsqueda del sniper nunca la trae)');
  // Los 112 px de Pujar pasan al Objeto: de entrada mide 302.
  assert.equal(m.lua(`(function() for _, c in ipairs(${T}._columnas) do if c.clave == "objeto" then return c.ancho end end end)()`), 302);
  // ⋮ arriba a la izquierda (apagado, con su tooltip) y (!) con el icono de aviso y su tooltip.
  assert.equal(m.lua(`${T}.menu ~= nil`), true, 'el botón ⋮');
  assert.equal(m.lua(`${T}.cabeceras.aviso.icono ~= nil`), true, '(!) es un icono');
  entrar(m, `${T}.cabeceras.aviso`);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_SNIPER_COL_AVISO', '40%')), `${lineasTt(m)}`);
  salir(m, `${T}.cabeceras.aviso`);
  assert.equal(m.lua(`${T}.separadores[1] ~= nil`), true, 'separadores entre columnas');
  sinErrores(m);
});

test('el sniper no tiene Parar, casilla de sonido ni frases arriba', () => {
  const m = maquina();
  conHallazgos(m);
  assert.equal(m.lua(`${P}.empezar == nil and ${P}.sonido == nil and ${P}.aviso == nil`), true, 'ni Parar, ni la casilla, ni el aviso de abajo');
  // Ningún texto a la vista dice que el sniper vigila, ni las frases amarillas de antes.
  const textos = m.lua(`(function()
    local r = {}
    local function mirar(f)
      for _, x in ipairs({f:GetRegions()}) do
        if x:GetObjectType() == "FontString" and x:IsVisible() and x:GetText() then r[#r + 1] = x:GetText() end
      end
      for _, h in ipairs({f:GetChildren()}) do mirar(h) end
    end
    mirar(${V})
    return r
  end)()`);
  for (const clave of ['COMERCIO_LISTA_SNIPER', 'COMERCIO_SNIPER_AVISO_BLIZZARD', 'COMERCIO_SNIPER_SONIDO']) {
    assert.ok(!textos.includes(texto(m, clave)), `«${texto(m, clave)}» no se ve`);
  }
  assert.ok(!textos.some((t) => /Vigilando/.test(t)), 'nada dice «Vigilando la subasta»');
  assert.equal(m.lua(`${V}.avisos:IsVisible()`), false, 'la línea de avisos de arriba no sale en el sniper');
  assert.equal(m.lua(`${V}.pie:IsVisible()`), false, 'la barra de la lista vieja tampoco: el sniper tiene la suya');
  // El sonido está en el engranaje de abajo.
  m.lua(`${P}.engranaje:Click()`);
  assert.equal(m.lua(`${V}.ajustes:IsVisible()`), true, 'el engranaje abre sus ajustes');
  assert.equal(m.lua(`${V}.ajustes.sonido:IsVisible()`), true, 'con la casilla del sonido');
  assert.equal(m.lua(`${V}.ajustes.sonido.texto:GetText()`), texto(m, 'COMERCIO_SNIPER_SONIDO'));
  const antes = m.lua('SnetForever.Ajustes.get("comercioSniperSonido")');
  m.lua(`${V}.ajustes.sonido:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSniperSonido")'), !antes, 'la casilla cambia el ajuste');
  // Los ajustes salen sobre el engranaje, dentro de la ventana.
  assert.ok(m.lua(`${V}.ajustes:GetBottom()`) >= m.lua(`${P}.engranaje:GetTop()`) - 0.01, 'encima del engranaje');
  assert.ok(m.lua(`${V}.ajustes:GetLeft()`) >= m.lua(`${V}:GetLeft()`) - 0.01, 'dentro de la ventana');
  m.lua(`${P}.engranaje:Click()`);
  assert.equal(m.lua(`${V}.ajustes:IsVisible()`), false, 'otra vez: se cierra');
  sinErrores(m);
});

test('los precios del sniper salen con g/s/c en sus colores', () => {
  const m = maquina();
  publicar(m, { 4306: 60099, 2589: 70000 });
  abrirYEscanear(m);
  empezar(m);
  const i = huecoDe(m, 'Paño de seda');
  assert.ok(i, 'la seda está en la tabla');
  const compra = hueco(m, i).compra;
  assert.equal(compra, m.lua('SnetForever.Tema.dinero(60099)'), 'el mismo formato que el oro de la cabecera');
  assert.equal(sinColores(compra), '6g 00s 99c');
  for (const token of ['oro', 'plata', 'cobre']) {
    assert.ok(compra.includes(`|cff${m.lua(`SnetForever.Tema.hex("${token}")`)}`), `${token} en su color`);
  }
  assert.equal(hueco(m, i).pct, '60%', 'el % frente al valor de mercado, sin espacio');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  m.avanzar(0.1);
  assert.equal(sinColores(hueco(m, huecoDe(m, 'Paño de seda')).compra), '6g 00s 99c', 'en inglés, igual');
  sinErrores(m);
});

test('los mismos objetos salen juntos con su número y se despliegan', () => {
  const m = maquina();
  publicar(m, [
    '{itemKey = {itemID = 4306, itemLevel = 20}, totalQuantity = 3, minPrice = 65000}',
    '{itemKey = {itemID = 4306, itemLevel = 25}, totalQuantity = 1, minPrice = 60000}',
    '{itemID = 2589, totalQuantity = 10, minPrice = 70000}',
  ]);
  // Arreglo de la compra suelta: como en WoW Forever, la segunda fila son 3 subastas iguales de 1 a 65000 cada una.
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}, {quantity = 3, buyoutAmount = 65000}}}})');
  abrirYEscanear(m);
  empezar(m);
  assert.equal(hallazgos(m).length, 3, 'tres hallazgos');
  const i = huecoDe(m, 'Paño de seda');
  const seda = hueco(m, i);
  assert.equal(seda.cuenta, '(2)', 'el número entre paréntesis junto al nombre');
  assert.equal(seda.triangulo, true, 'con su triángulo');
  assert.equal(sinColores(seda.compra), '6g 00s 00c', 'la fila de grupo enseña la Compra más barata');
  assert.equal(seda.cantidad, '4', 'Ctd: las de las dos');
  const lino = hueco(m, huecoDe(m, 'Paño de lino'));
  assert.equal(lino.cuenta, false, 'un objeto solo, sin número');
  assert.equal(lino.triangulo, false, 'ni triángulo');
  // Se despliega en sus subastas (de la más barata a la más cara) y se pliega.
  m.lua(`${T}.huecos[${i}].abrir:Click()`);
  m.avanzar(0.05);
  const a = hueco(m, i + 1);
  const b = hueco(m, i + 2);
  assert.deepEqual([sinColores(a.compra), a.nivel, a.cantidad], ['6g 00s 00c', '25', '1']);
  assert.deepEqual([sinColores(b.compra), b.nivel, b.cantidad], ['6g 50s 00c', '20', '3']);
  // Pulsar una subasta de dentro prepara su compra (la fila queda marcada); pulsar la fila de grupo no compra nada.
  m.lua(`${T}.huecos[${i + 2}]:Click()`);
  assert.equal(m.lua(`${T}:elegida()`), b.clave, 'la subasta pulsada queda marcada');
  assert.equal(m.lua('SnetForever.Compra.estado().origen'), 'sniper');
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.Compra.estado().precioUnit'), 65000, 'la compra es la de esa variante, a su precio');
  assert.equal(m.lua(`${T}:elegida()`), b.clave, 'sigue marcada con la compra lista');
  m.lua(`${T}.huecos[${i}].abrir:Click()`);
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'al plegarla, su compra se suelta (nunca se compra lo que no se ve)');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('el vendedor no se guarda en SnetForeverCuenta', () => {
  const m = maquina();
  conHallazgos(m);
  // Lo que el sniper enseña no trae vendedor y la tabla no tiene esa columna.
  for (const h of hallazgos(m)) assert.equal(h.vendedor, undefined);
  assert.equal(m.lua(`${T}.cabeceras.vendedor == nil`), true);
  m.lua(`${T}.huecos[1]:Click()`);
  m.avanzar(0.6);
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.avanzar(0.5);
  const guardado = JSON.stringify(m.guardado());
  assert.ok(guardado.length > 2, 'hay algo guardado que mirar');
  for (const palabra of ['vendedor', 'owner', 'auctionID', 'hallazgo']) {
    assert.ok(!guardado.includes(palabra), `«${palabra}» no está en lo guardado`);
  }
  sinErrores(m);
});

test('pausa y sigue con el botón de abajo; el estado lo dice', () => {
  const m = maquina();
  conHallazgos(m);
  assert.notEqual(m.lua(`${S}.estado()`), 'parado');
  assert.match(estadoTexto(m), /^(Escaneando · vuelta \d+|Escaneo completo: \d+ objetos)$/, `escaneando: ${estadoTexto(m)}`);
  const iconoDe = (nombre) => m.lua(`(function() local t = UIParent:CreateTexture(); SnetForever.Tema.icono(t, ${aLua(nombre)}); return {t:GetTexCoord()} end)()`);
  assert.deepEqual(m.lua(`{${P}.pausa.icono:GetTexCoord()}`), iconoDe('pausa'), 'en marcha: dos rayas');
  entrar(m, `${P}.pausa`);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_SNIPER_PAUSAR')), `tooltip: ${lineasTt(m)}`);
  salir(m, `${P}.pausa`);
  m.lua(`${P}.pausa:Click()`);
  assert.equal(m.lua(`${S}.estado()`), 'parado', 'pausa: deja de buscar');
  assert.equal(m.lua(`${S}.activo()`), false);
  assert.equal(estadoTexto(m), texto(m, 'SUBASTA_SNIPER_PAUSA', '2'), 'En pausa | 2 para comprar');
  assert.deepEqual(m.lua(`{${P}.pausa.icono:GetTexCoord()}`), iconoDe('seguir'), 'en pausa: el triángulo de seguir');
  assert.equal(m.lua(`${T}.huecos[1]:IsShown()`), true, 'lo encontrado se queda');
  const navegaciones = m.llamadas('C_AuctionHouse.SendBrowseQuery').length;
  m.avanzar(12);
  assert.equal(m.llamadas('C_AuctionHouse.SendBrowseQuery').length, navegaciones, 'en pausa no busca');
  // Con una fila elegida: «En pausa | Comprar 1 / 2».
  m.lua(`${T}.huecos[1]:Click()`);
  m.avanzar(0.2);
  assert.equal(estadoTexto(m), texto(m, 'SUBASTA_SNIPER_PAUSA_ELEGIDA', '1', '2'));
  m.lua(`${P}.descartar:Click()`);
  entrar(m, `${P}.pausa`);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_SNIPER_SEGUIR')), `tooltip: ${lineasTt(m)}`);
  salir(m, `${P}.pausa`);
  m.lua(`${P}.pausa:Click()`);
  assert.equal(m.lua(`${S}.activo()`), true, 'sigue');
  m.avanzar(0.6);
  assert.match(estadoTexto(m), /^(Escaneando · vuelta \d+|Escaneo completo: \d+ objetos)$/, `sigue: ${estadoTexto(m)}`);
  // Al acabar una vuelta: «Escaneo completo: N objetos».
  m.avanzar(1);
  assert.equal(estadoTexto(m), texto(m, 'SUBASTA_SNIPER_COMPLETO', '2'), 'vuelta acabada: los objetos que ha visto');
  // Sin barra de progreso de color.
  assert.equal(m.lua(`${P}.estado.relleno == nil`), true, 'sin barra de color');
  sinErrores(m);
});

test('Comprar está apagado sin fila elegida y su tooltip dice lo gastado', () => {
  const m = maquina();
  conHallazgos(m);
  assert.equal(m.lua(`${P}.comprar.snfApagado`), true, 'sin fila elegida, apagado');
  assert.equal(m.lua(`${P}.descartar.snfApagado`), true, 'Descartar también');
  assert.equal(m.lua(`${P}.comprar.texto:GetText()`), 'Comprar');
  entrar(m, `${P}.comprar`);
  assert.ok(lineasTt(m).includes('Llevas 0c (sin tope)'), `tooltip: ${lineasTt(m)}`);
  salir(m, `${P}.comprar`);
  m.lua('SnetForever.Ajustes.set("comercioTope", 500000)');
  entrar(m, `${P}.comprar`);
  assert.ok(lineasTt(m).includes('Llevas 0c de 50g 00s 00c'), `con tope: ${lineasTt(m)}`);
  salir(m, `${P}.comprar`);
  m.lua('SnetForever.Ajustes.set("comercioTope", 0)');
  // Una fila elegida: encendido; su tooltip dice qué se compra (lo que antes decía la barra) y lo gastado.
  const i = huecoDe(m, 'Paño de seda');
  m.lua(`${T}.huecos[${i}]:Click()`);
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  assert.equal(m.lua(`${P}.comprar.snfApagado`), false, 'con fila elegida, encendido');
  assert.equal(m.lua(`${P}.descartar.snfApagado`), false);
  entrar(m, `${P}.comprar`);
  const tt = lineasTt(m);
  assert.ok(tt.includes(sinColores(texto(m, 'COMERCIO_BARRA_LISTA', 1, m.lua('SnetForever.Tema.dinero(60000)')))), `tooltip: ${tt}`);
  assert.ok(tt.includes('Llevas 0c (sin tope)'), `tooltip: ${tt}`);
  salir(m, `${P}.comprar`);
  assert.ok(!/Lista para comprar/.test(estadoTexto(m)), 'la barra no dice «Lista para comprar…»');
  // En combate, apagado y sin comprar.
  m.lua('BANCO.jugador.enCombate = true');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua(`${P}.comprar.snfApagado`), true, 'en combate, apagado');
  m.lua(`${P}.comprar.snfApagado = false; ${P}.comprar:Click()`);
  assert.equal(compras(m), 0, 'en combate no compra');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  // Comprar compra exactamente la fila marcada, con el clic del jugador.
  assert.equal(m.lua(`${P}.comprar.snfApagado`), false);
  assert.equal(m.lua(`${P}.comprar.texto:GetText()`), texto(m, 'SUBASTA_RES_COMPRAR', '1', m.lua('SnetForever.UIComercio.dinero(60000)')));
  // Arreglo de la compra suelta: un objeto suelto pide dos clics; el primero no compra y pasa a «Confirmar 1 por X».
  m.lua(`${P}.comprar:Click()`);
  assert.equal(compras(m), 0, 'el primer clic no compra');
  assert.equal(m.lua(`${P}.comprar.texto:GetText()`), texto(m, 'SUBASTA_RES_CONFIRMAR', '1', m.lua('SnetForever.UIComercio.dinero(60000)')));
  m.avanzar(0.6);
  m.lua(`${P}.comprar:Click()`);
  m.avanzar(0.2);
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 1, 'comprada una');
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid')[0][1], 60000, 'a su precio');
  sinErrores(m);
});

test('Descartar suelta la compra; Reiniciar empieza de nuevo y Salir del escaneo para y vuelve a Navegar', () => {
  const m = maquina();
  conHallazgos(m);
  m.lua(`${T}.huecos[1]:Click()`);
  m.avanzar(0.6);
  m.lua(`${P}.descartar:Click()`);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'Descartar suelta la compra');
  assert.equal(m.lua(`${T}:elegida()`), undefined);
  // Reiniciar: tooltip, vuelve a empezar desde cero (vuelta 1) y lo de antes se vuelve a encontrar.
  entrar(m, `${P}.reiniciar`);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_SNIPER_REINICIAR_AYUDA')), `${lineasTt(m)}`);
  salir(m, `${P}.reiniciar`);
  m.avanzar(6);
  assert.ok(m.lua(`${S}.vueltas()`) > 1);
  m.lua(`${P}.reiniciar:Click()`);
  assert.equal(m.lua(`${S}.activo()`), true, 'sigue en marcha');
  assert.ok(m.lua(`${S}.vueltas()`) <= 1, 'desde la primera vuelta');
  m.avanzar(0.6);
  assert.equal(hallazgos(m).length, 2, 'lo vuelve a encontrar');
  // Salir del escaneo: para el sniper y vuelve a Navegar; al volver, solo el botón Empezar.
  m.lua(`${P}.salir:Click()`);
  assert.equal(m.lua(`${S}.estado()`), 'parado');
  assert.equal(m.lua(`${SV}.pagina()`), 'navegar');
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  assert.equal(m.lua(`${P}.grande:IsVisible()`), true, 'parado: el botón Empezar en el centro');
  assert.equal(m.lua(`${P}.vista:IsVisible()`), false, 'sin la tabla ni las barras');
  const medio = (x) => m.lua(`(${x}:GetLeft() + ${x}:GetRight()) / 2`);
  assert.ok(Math.abs(medio(`${P}.grande`) - medio(`${P}.pagina`)) <= 1, 'centrado');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('(!) marca lo que está muy por debajo de su valor de mercado (40 % o menos)', () => {
  const m = maquina();
  publicar(m, { 4306: 40000, 2589: 41000 });
  abrirYEscanear(m);
  empezar(m);
  assert.equal(hueco(m, huecoDe(m, 'Paño de seda')).alerta, true, 'al 40 %: (!)');
  assert.equal(hueco(m, huecoDe(m, 'Paño de lino')).alerta, false, 'al 41 %: nada');
  const i = huecoDe(m, 'Paño de seda');
  entrar(m, `${T}.huecos[${i}]`);
  assert.ok(lineasTt(m).includes(texto(m, 'SUBASTA_SNIPER_COL_AVISO', '40%')), `el tooltip de la fila lo dice: ${lineasTt(m)}`);
  salir(m, `${T}.huecos[${i}]`);
  sinErrores(m);
});

test('nada del sniper cambia de color, gira ni se enciende y apaga solo mientras escanea', () => {
  const ids = Array.from({ length: 16 }, (_, k) => 3101 + k);
  const m = maquina({ extra: ids, sitio: '{x = 20, y = 20, ancho = 1000, alto = 700}' });
  publicar(m, Object.fromEntries(ids.slice(0, 4).map((id, k) => [id, 50000 + 1000 * k])));
  abrirYEscanear(m);
  empezar(m);
  const foto = () => m.lua(`(function()
    local P = ${P}
    local function color(fs) local c = {fs:GetTextColor()} return string.format("%.3f,%.3f,%.3f", c[1], c[2], c[3]) end
    local function vertice(t) local c = {t:GetVertexColor()} return string.format("%.3f,%.3f,%.3f", c[1], c[2], c[3]) end
    local r = {estado = color(P.estado.texto), comprar = color(P.comprar.texto), descartar = color(P.descartar.texto),
      pausa = table.concat({P.pausa.icono:GetTexCoord()}, ","), vistos = {}, fondos = {}}
    for _, n in ipairs({"salir", "titulo", "reiniciar", "marcoTabla", "pie", "pausa", "engranaje", "estado", "descartar", "comprar"}) do
      r.vistos[#r.vistos + 1] = P[n]:IsVisible() and 1 or 0
    end
    for i, h in ipairs(P.tabla.huecos) do
      if h:IsShown() then r.fondos[#r.fondos + 1] = vertice(h.fondo) end
    end
    return r
  end)()`);
  const base = m.lua('(function() local c = SnetForever.Estilo.comercio("filas") return string.format("%.3f,%.3f,%.3f", c[1], c[2], c[3]) end)()');
  const primera = foto();
  let filasMax = 0;
  for (let k = 0; k < 400; k++) {
    // Cada 5 s (una vuelta) salen cuatro cosas nuevas.
    if (k % 100 === 50) {
      const n = Math.min(ids.length, 4 + 4 * (1 + Math.floor(k / 100)));
      publicar(m, Object.fromEntries(ids.slice(0, n).map((id, j) => [id, 50000 + 1000 * j])));
    }
    m.avanzar(0.05);
    const f = foto();
    assert.equal(f.estado, primera.estado, `el estado no cambia de color (fotograma ${k})`);
    assert.equal(f.comprar, primera.comprar, `Comprar no cambia de color (fotograma ${k})`);
    assert.equal(f.descartar, primera.descartar, `Descartar no cambia de color (fotograma ${k})`);
    assert.equal(f.pausa, primera.pausa, `el icono de la pausa no cambia solo (fotograma ${k})`);
    assert.deepEqual(f.vistos, primera.vistos, `nada sale ni se esconde solo (fotograma ${k})`);
    for (const c of f.fondos) assert.equal(c, base, `ninguna fila se resalta sola al llegar (fotograma ${k})`);
    filasMax = Math.max(filasMax, f.fondos.length);
    if (k % 20 === 0) {
      // Ninguna textura del sniper está girada (nada gira: ni el icono del estado, que no hay, ni ningún otro).
      const giradas = m.lua(`(function()
        local n = 0
        local function mirar(f)
          for _, x in ipairs({f:GetRegions()}) do
            if x:GetObjectType() == "Texture" and x:GetRotation() ~= 0 then n = n + 1 end
          end
          for _, h in ipairs({f:GetChildren()}) do mirar(h) end
        end
        mirar(${P}.pagina)
        return n
      end)()`);
      assert.equal(giradas, 0, `nada gira (fotograma ${k})`);
    }
  }
  assert.ok(filasMax >= 12, `han ido entrando filas (${filasMax})`);
  sinErrores(m);
});

// Vaivén (sin parpadeos, requisito del coordinador): con el ratón quieto sobre una fila, entran muchas filas nuevas (más baratas,
// que irían arriba si se ordenaran) en vueltas seguidas y desaparece una de las de arriba. Fotograma a fotograma: el objeto
// bajo el ratón no cambia y cada hueco que enseña algo no cambia de objeto (los vacíos solo se llenan, una vez).
test('vaivén: con el ratón quieto sobre una fila, entran muchas filas nuevas en vueltas seguidas; la fila bajo el ratón no cambia y nada sale y se va', () => {
  const ids = Array.from({ length: 26 }, (_, k) => 3201 + k);
  const m = maquina({ extra: ids, sitio: '{x = 20, y = 20, ancho = 1000, alto = 700}' });
  // Seis primeras, del 50 al 75 %.
  const precios = {};
  ids.slice(0, 6).forEach((id, k) => { precios[id] = 50000 + 5000 * k; });
  publicar(m, precios);
  abrirYEscanear(m);
  empezar(m);
  const objetos = () => m.lua(`(function() local r = {} for i, h in ipairs(${T}.huecos) do r[i] = h:IsShown() and h.fila and h.fila.item or false end return r end)()`);
  assert.equal(objetos().filter(Boolean).length, 6, 'seis filas');
  entrar(m, `${T}.huecos[3]`);
  m.avanzar(0.5);
  const bajoRaton = m.lua(`${T}.huecos[3].fila.item`);
  let vistos = objetos();
  let nuevas = 6;
  for (let k = 0; k < 500; k++) {
    if (k % 100 === 20) {
      // Una vuelta con cuatro nuevas, más baratas (del 40 al 49 %), y la de arriba del todo vendida.
      for (let j = 0; j < 4 && nuevas < ids.length; j++, nuevas++) precios[ids[nuevas]] = 40000 + 300 * nuevas;
      delete precios[vistos[0]];
      publicar(m, precios);
    }
    m.avanzar(0.05);
    assert.equal(m.lua(`${T}.huecos[3].fila.item`), bajoRaton, `la fila bajo el ratón no cambia (fotograma ${k})`);
    const ahora = objetos();
    ahora.forEach((item, i) => {
      if (vistos[i]) assert.equal(item, vistos[i], `el hueco ${i + 1} no cambia de objeto (fotograma ${k})`);
    });
    vistos = ahora.map((item, i) => vistos[i] || item);
  }
  assert.ok(hallazgos(m).length >= 20, `han entrado muchas (${hallazgos(m).length})`);
  assert.ok(vistos.filter(Boolean).length > 6, 'las nuevas han entrado abajo, en huecos vacíos');
  assert.equal(m.lua(`${T}:elegida()`), undefined, 'nada elegido solo');
  // Ronda 1: al irse el ratón de la tabla no se aplica nada de golpe; lo vendido se va con un gesto del jugador (la pausa).
  salir(m, `${T}.huecos[3]`);
  for (let k = 0; k < 40; k++) {
    m.avanzar(0.05);
    assert.deepEqual(objetos(), vistos.map((x, i) => objetos()[i] && x), `sin el ratón, nada se mueve (fotograma ${k})`);
  }
  assert.ok(objetos().includes(ids[0]), 'lo vendido sigue en su sitio');
  m.lua(`${P}.pausa:Click()`);
  assert.ok(!objetos().includes(ids[0]), 'con la pausa (un gesto del jugador), lo vendido se va');
  sinErrores(m);
});

test('Mayús + clic y Ctrl + clic en una fila del sniper van al chat y al probador, sin elegirla ni preparar compra', () => {
  const m = maquina();
  conHallazgos(m);
  const conTecla = (tecla, fn) => { m.lua(`BANCO.${tecla} = true`); try { fn(); } finally { m.lua(`BANCO.${tecla} = false`); } };
  const item = m.lua(`${T}.huecos[1].fila.item`);
  const enlace = m.lua(`(select(2, C_Item.GetItemInfo(${item})))`);
  m.lua('BANCO.chat.abierta = true');
  conTecla('shift', () => m.lua(`${T}.huecos[1]:Click()`));
  assert.equal(m.lua('BANCO.chat.texto'), enlace, 'el enlace, en el chat');
  conTecla('ctrl', () => m.lua(`${T}.huecos[1]:Click()`));
  assert.equal(m.lua('BANCO.probador'), enlace, 'Ctrl + clic: al probador');
  m.avanzar(0.1);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'ni prepara compra');
  assert.equal(m.lua(`${T}:elegida()`), undefined, 'ni marca la fila');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('vaivén: con una fila elegida (sin el ratón encima), la fila elegida no se mueve aunque entren filas y se vaya una de arriba', () => {
  const ids = Array.from({ length: 14 }, (_, k) => 3301 + k);
  const m = maquina({ extra: ids, sitio: '{x = 20, y = 20, ancho = 1000, alto = 700}' });
  const precios = {};
  ids.slice(0, 6).forEach((id, k) => { precios[id] = 50000 + 5000 * k; });
  publicar(m, precios);
  // Arreglo de la compra suelta: como en WoW Forever, 10 subastas iguales de 1, cada una a su precio.
  m.lua(`BANCO.ponerSubasta({objetos = {${ids.map((id, k) => `[${id}] = {{quantity = 10, buyoutAmount = ${50000 + 5000 * k}}}`).join(', ')}}})`);
  abrirYEscanear(m);
  empezar(m);
  m.lua(`${T}.huecos[3]:Click()`);
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista', 'la compra de la fila elegida, lista');
  const elegida = m.lua(`${T}.huecos[3].fila.item`);
  const clave = m.lua(`${T}:elegida()`);
  let nuevas = 6;
  for (let k = 0; k < 300; k++) {
    if (k % 100 === 20) {
      for (let j = 0; j < 3 && nuevas < ids.length; j++, nuevas++) precios[ids[nuevas]] = 40000 + 300 * nuevas;
      delete precios[m.lua(`${T}.huecos[1].fila.item`)];
      publicar(m, precios);
    }
    m.avanzar(0.05);
    assert.equal(m.lua(`${T}.huecos[3].fila.item`), elegida, `la fila elegida no se mueve (fotograma ${k})`);
    assert.equal(m.lua(`${T}:elegida()`), clave, `y sigue marcada (fotograma ${k})`);
  }
  assert.ok(hallazgos(m).length > 6, 'han entrado más');
  assert.equal(compras(m), 0, 'nada se compra solo');
  sinErrores(m);
});

// Ronda 1 (sin parpadeos, añadido B2): sin ratón encima ni fila elegida, lo que se ve tampoco sube ni baja solo. Más de 50
// hallazgos (el tope del sniper saca los más viejos) en vueltas seguidas y filas vendidas: fotograma a fotograma, ningún
// hueco que enseña algo cambia de objeto (los vacíos solo se llenan, una vez), hasta un gesto del jugador.
test('vaivén sin ratón ni fila elegida: con más de 50 hallazgos y filas vendidas, ningún hueco cambia de objeto hasta un gesto del jugador', () => {
  const ids = Array.from({ length: 80 }, (_, k) => 3401 + k);
  const m = maquina({ extra: ids, sitio: '{x = 20, y = 20, ancho = 1000, alto = 700}' });
  const precios = {};
  ids.slice(0, 10).forEach((id, k) => { precios[id] = 50000 + 1000 * k; });
  publicar(m, precios);
  abrirYEscanear(m);
  empezar(m);
  const objetos = () => m.lua(`(function() local r = {} for i, h in ipairs(${T}.huecos) do r[i] = h:IsShown() and h.fila and h.fila.item or false end return r end)()`);
  assert.equal(objetos().filter(Boolean).length, 10, 'diez filas');
  let vistos = objetos();
  let nuevas = 10;
  let maxHallazgos = 0;
  for (let k = 0; k < 900; k++) {
    if (k % 100 === 20) {
      // Una vuelta con ocho nuevas y dos vendidas de las que se ven (la de arriba y otra).
      for (let j = 0; j < 8 && nuevas < ids.length; j++, nuevas++) precios[ids[nuevas]] = 40000 + 500 * (nuevas % 80);
      for (const i of [0, 4]) if (vistos[i]) delete precios[vistos[i]];
      publicar(m, precios);
    }
    m.avanzar(0.05);
    const ahora = objetos();
    ahora.forEach((item, i) => {
      if (vistos[i]) assert.equal(item, vistos[i], `el hueco ${i + 1} no cambia de objeto (fotograma ${k})`);
    });
    vistos = ahora.map((item, i) => vistos[i] || item);
    maxHallazgos = Math.max(maxHallazgos, hallazgos(m).length);
  }
  assert.equal(maxHallazgos, 50, 'el sniper ha llegado a su tope de 50 (y saca los más viejos)');
  assert.ok(nuevas > 60, `han llegado más de 50 (${nuevas})`);
  assert.equal(m.lua(`${T}:elegida()`), undefined, 'nada elegido');
  // Un gesto del jugador (la pausa) quita de una vez lo que ya no está.
  const vendido = ids[0];
  assert.ok(objetos().includes(vendido), 'lo vendido sigue en su sitio');
  m.lua(`${P}.pausa:Click()`);
  assert.ok(!objetos().includes(vendido), 'con la pausa, lo vendido se va');
  sinErrores(m);
});

test('al quitar el ratón de la tabla no se aplica nada de golpe', () => {
  const ids = Array.from({ length: 12 }, (_, k) => 3501 + k);
  const m = maquina({ extra: ids, sitio: '{x = 20, y = 20, ancho = 1000, alto = 700}' });
  const precios = {};
  ids.slice(0, 8).forEach((id, k) => { precios[id] = 50000 + 1000 * k; });
  publicar(m, precios);
  abrirYEscanear(m);
  empezar(m);
  const objetos = () => m.lua(`(function() local r = {} for i, h in ipairs(${T}.huecos) do r[i] = h:IsShown() and h.fila and h.fila.item or false end return r end)()`);
  entrar(m, `${T}.huecos[5]`);
  m.avanzar(0.5);
  // Con el ratón encima se venden las dos de arriba y llegan dos nuevas (abajo).
  const antes = objetos();
  delete precios[antes[0]];
  delete precios[antes[1]];
  precios[ids[8]] = 45000;
  precios[ids[9]] = 46000;
  publicar(m, precios);
  m.avanzar(6);
  const conRaton = objetos();
  antes.forEach((item, i) => { if (item) assert.equal(conRaton[i], item, `con el ratón, el hueco ${i + 1} sigue igual`); });
  salir(m, `${T}.huecos[5]`);
  for (let k = 0; k < 60; k++) {
    m.avanzar(0.05);
    assert.deepEqual(objetos(), conRaton, `al quitar el ratón, nada sube ni se va (fotograma ${k})`);
  }
  sinErrores(m);
});

test('una fila que se ha ido no compra: pulsarla dice «Esa subasta ya no está» y Comprar sigue apagado', () => {
  const m = maquina();
  conHallazgos(m);
  const i = huecoDe(m, 'Paño de seda');
  publicar(m, { 2589: 70000 }); // la seda, vendida
  m.avanzar(6);
  assert.equal(hueco(m, i).objeto, 'Paño de seda', 'se queda en su sitio');
  m.lua(`${T}.huecos[${i}]:Click()`);
  m.avanzar(0.2);
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'no prepara compra');
  assert.equal(estadoTexto(m), texto(m, 'COMERCIO_MOTIVO_YA_NO_ESTA'));
  assert.equal(m.lua(`${P}.comprar.snfApagado`), true);
  m.lua(`${P}.comprar.snfApagado = false; ${P}.comprar:Click()`);
  assert.equal(compras(m), 0, 'nada comprado');
  // Pulsar una cabecera (un gesto) la quita.
  m.lua(`${T}.cabeceras.pct:Click()`);
  assert.equal(huecoDe(m, 'Paño de seda'), undefined, 'al pulsar una cabecera, se va');
  sinErrores(m);
});

test('tope propio de la pestaña: llena, lo nuevo no entra (nada sale para hacerle sitio) y el estado lo dice; la pausa lo pone al día', () => {
  const ids = Array.from({ length: 10 }, (_, k) => 3601 + k);
  const m = maquina({ extra: ids });
  m.lua('SnetForever.SubastaSniper.TOPE_FILAS = 5');
  const precios = {};
  ids.slice(0, 5).forEach((id, k) => { precios[id] = 50000 + 1000 * k; });
  publicar(m, precios);
  abrirYEscanear(m);
  empezar(m);
  const objetos = () => m.lua(`(function() local r = {} for i, h in ipairs(${T}.huecos) do r[i] = h:IsShown() and h.fila and h.fila.item or false end return r end)()`);
  const antes = objetos();
  assert.equal(antes.filter(Boolean).length, 5, 'cinco filas: llena');
  // Se vende la primera y llegan tres nuevas: la tabla sigue igual (la vendida en su sitio) y el estado dice cuántas esperan.
  delete precios[ids[0]];
  ids.slice(5, 8).forEach((id, k) => { precios[id] = 45000 + 100 * k; });
  publicar(m, precios);
  m.avanzar(6);
  assert.deepEqual(objetos(), antes, 'nada entra ni sale');
  assert.equal(estadoTexto(m), texto(m, 'SUBASTA_SNIPER_LLENA', '3'));
  // La pausa (un gesto del jugador): se va la vendida y entra lo que cabe.
  m.lua(`${P}.pausa:Click()`);
  const despues = objetos().filter(Boolean);
  assert.equal(despues.length, 5);
  assert.ok(!despues.includes(ids[0]), 'la vendida se ha ido');
  assert.equal(estadoTexto(m), texto(m, 'SUBASTA_SNIPER_LLENA', '2'), 'aún esperan dos (el tope es 5)');
  sinErrores(m);
});

// Ronda 1 del arreglo de la compra suelta: con un objeto suelto el Comprar del sniper dice siempre el importe exacto, sin
// «~», y cabe entero (el botón se ensancha si hace falta; el estado se encoge sin pisarse).
test('un objeto suelto con un importe largo: Comprar del sniper dice el total exacto y cabe, al mínimo y en es y en', () => {
  for (const idioma of ['es', 'en']) {
    const m = maquina({ idioma, sitio: '{x = 20, y = 20, ancho = 830, alto = 500}' });
    letraReal(m);
    m.lua('BANCO.jugador.dinero = 200000000');
    publicar(m, { 4306: 99999999 });
    m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 99999999}}}})');
    abrirYEscanear(m);
    empezar(m);
    m.lua(`${S}.pausar()`); // quieto: solo se mira el botón
    m.lua('SnetForever.Reglas.PLANTILLA.maxOro = 1000000000'); // la plantilla deja un importe así (por defecto, 100g)
    // La fila marcada del sniper, a su precio (como la elige SNF.Sniper.elegir, con origen 'sniper').
    assert.equal(m.lua('SnetForever.Compra.elegir({item = 4306, precio = 99999999, cantidad = 1, origen = "sniper", grupo = false})'), true);
    m.avanzar(0.6);
    const importe = m.lua('SnetForever.UIComercio.dinero(99999999)');
    const mira = (clave) => {
      const d = m.lua(`(function() local b = ${P}.comprar return {t = b.texto:GetText(), w = b.texto:GetUnboundedStringWidth(), sitio = b:GetWidth() - b.espacioFijo, dDer = ${P}.descartar:GetRight(), bIzq = b:GetLeft(), estado = ${P}.estado:GetWidth()} end)()`);
      assert.equal(d.t, texto(m, clave, '1', importe), idioma);
      assert.ok(d.w <= d.sitio + 0.01, `cabe entero: ${JSON.stringify(d)}`);
      assert.ok(d.dDer <= d.bIzq + 0.01 && d.estado > 60, `nada se pisa: ${JSON.stringify(d)}`);
    };
    assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista', JSON.stringify(m.lua('SnetForever.Compra.estado()')));
    mira('SUBASTA_RES_COMPRAR');
    m.lua(`${P}.comprar:Click()`);
    m.avanzar(0.6);
    mira('SUBASTA_RES_CONFIRMAR');
    assert.equal(compras(m), 0);
    sinErrores(m);
  }
});

// F1 (ronda 2, decisión del coordinador): el sniper sigue juzgando el resumen de la búsqueda general (la compra vuelve a leer
// la lista de verdad y topa el precio), pero cada fila dice de dónde sale y a qué hora se leyó: «navegar 14:32».
test('F1 ronda 2: la columna Foto de cada fila del sniper dice «navegar» y la hora fija a la que se leyó; cabe en es y en al mínimo (830×500)', () => {
  for (const idioma of ['es', 'en']) {
    const m = maquina({ idioma, sitio: '{x = 20, y = 20, ancho = 830, alto = 500}' });
    letraReal(m);
    conHallazgos(m);
    const h = hallazgos(m);
    const hh = (t) => m.lua(`date("%H:%M", ${t})`);
    const esperado = (t) => `${idioma === 'es' ? 'navegar' : 'browse'} ${hh(t)}`;
    const r = m.lua(`(function()
      local t = ${T}
      local r = {textos = {}, malos = {}, col = t:anchoDe("foto")}
      local c = t.cabeceras.foto
      if c.texto:GetUnboundedStringWidth() > c:GetWidth() - 8 then r.malos[#r.malos + 1] = "cabecera" end
      for _, hu in ipairs(t.huecos) do
        if hu:IsShown() then
          local fs = hu.celdas.foto
          r.textos[#r.textos + 1] = fs:GetText()
          if fs:GetUnboundedStringWidth() > t:anchoDe("foto") - 8 then r.malos[#r.malos + 1] = fs:GetText() end
        end
      end
      r.dentro = t.cabeceras.foto:GetRight() <= ${P}.marcoTabla:GetRight() + 0.01
      return r
    end)()`);
    assert.deepEqual(r.textos.sort(), h.map((x) => esperado(x.hora)).sort(), `${idioma}: ${JSON.stringify(r)}`);
    assert.deepEqual(r.malos, [], `${idioma}: no cabe (columna de ${r.col})`);
    assert.equal(r.dentro, true, `${idioma}: la columna dentro de la tabla`);
    // La hora es fija: pasados 20 min (sin otra vuelta del sniper) la celda dice lo mismo.
    m.lua(`BANCO.tick = BANCO.tick + ${20 * 60 * 20}`);
    assert.deepEqual(m.lua(`(function() local r = {} for _, hu in ipairs(${T}.huecos) do if hu:IsShown() then r[#r + 1] = hu.celdas.foto:GetText() end end return r end)()`).sort(), r.textos.sort());
    sinErrores(m);
  }
});
