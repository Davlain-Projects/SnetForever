// Comercio, ventana de compra, tarea 11: repaso visual. Recorre todo lo que se ve de la ventana y del cuadro de cantidad
// y comprueba que nada se sale del marco de su padre y que los textos más largos caben (en es y en en), con la cantidad
// máxima y los importes más grandes. El banco no tiene motor de texto: aproxima cada letra a medio tamaño de fuente, por
// eso los textos usan un margen de 0,85 (como la prueba de «Visto»).
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
// 0.7.0: todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo
// (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const ranuraDeHora = (h) => (h % 8) + 1;
const foto = (h) => h * 3600 + 1357;
const ITEMS = [2589, 2592, 4306, 4338, 14047];

function ponerRanura(dir) {
  const i = ranuraDeHora(H);
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n`);
  const filas = ITEMS.map((item) => `[${item}] = {98000, 400, 100000, 0, 0.6, 85, 0}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${foto(H)}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true}
`);
}

// Máquina con mucho oro, nombres de objetos largos y el escaneo de verdad.
// AuctionHouseFrame de prueba (el banco no lo define): 800 × 500, como la subasta de Blizzard que la ventana cubre.
const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}; AuctionHouseFrame.Otras = {}';
// Las dos ventanas posibles: sin subasta de Blizzard y al mínimo (bloque B, Task B4r ronda 1: 830 × 500 píxeles reales, la
// más pequeña) y encima de ella (800 × 500 de UIParent).
const VENTANAS = [{ nombre: 'ventana suelta al mínimo 830', subasta: false, minimo: true }, { nombre: 'sobre la subasta 800', subasta: true }];

function maquina({ subasta = false, minimo = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-repaso-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir);
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  if (subasta) m.lua(SUBASTA);
  if (minimo) m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 20, y = 20, ancho = 830, alto = 500}');
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua('BANCO.jugador.dinero = 123456789012'); // 12.345.678 de oro, mucho más de lo normal: en la cabecera de la subasta el oro se acorta si no cabe (B4r ronda 2)
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1 });
  m.itemInfo(4306, { nombre: 'Balas de mitril de gran impacto', calidad: 2 });
  m.itemInfo(4338, { nombre: 'Paño de tejido mágico', calidad: 3 });
  return m;
}

const V = 'SnetForever.UIComercio.marco()';
const C = 'SnetForever.CantidadComercio';
const M = `${C}.marco()`;

// Un lino con muchos escalones (mercancía) y el resto como hallazgos del sniper.
const LINO = '[2589] = {{quantity = 5, unitPrice = 40000}, {quantity = 10, unitPrice = 45000}, {quantity = 12, unitPrice = 50000},'
  + ' {quantity = 14, unitPrice = 52000}, {quantity = 16, unitPrice = 55000}, {quantity = 18, unitPrice = 60000},'
  + ' {quantity = 20, unitPrice = 62000}, {quantity = 22, unitPrice = 65000}, {quantity = 50, unitPrice = 200000}}';

function escenario(m) {
  m.lua(`BANCO.ponerSubasta({navegar = {{itemID = 2589, totalQuantity = 5000, minPrice = 40000},
    {itemID = 4306, totalQuantity = 10, minPrice = 60000}, {itemID = 4338, totalQuantity = 10, minPrice = 70000},
    {itemID = 2592, totalQuantity = 3, minPrice = 60000}}, porPagina = 50, mercancias = {${LINO}}})`);
  m.disparar('AUCTION_HOUSE_SHOW');
  for (let i = 0; i < 400 && m.lua('SnetForever.Escaneo.estado()') !== 'completo'; i++) m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'completo');
  m.avanzar(0.6);
}

// Recorre lo visible de un marco y apunta lo que se sale del marco de su padre (más de medio píxel) y los textos que no
// caben en el ancho que tienen (con un margen de 0,85). `limite` (opcional) es el marco contra el que se mide el propio
// `raiz`: las ventanas que flotan caben en la pantalla o en la ventana, no en su padre.
const REVISAR = `
local TOL = 0.51
local salida = {}
-- En unidades absolutas (bloque B: la ventana mide en píxeles reales y su escala ya no es la de UIParent).
local function rect(o)
  local l, r, t, b = o:GetLeft(), o:GetRight(), o:GetTop(), o:GetBottom()
  if not l then return nil end
  local s = o:GetEffectiveScale()
  return l * s, r * s, t * s, b * s
end
local function quien(o)
  local t = o:GetObjectType()
  if t == "FontString" then return "FontString «" .. tostring(o:GetText()) .. "»" end
  return t .. " " .. tostring(o.etiquetaRepaso or o:GetName() or "")
end
local function dentro(o, ref, que)
  local l, r, t, b = rect(o)
  local pl, pr, pt, pb = rect(ref)
  if not (l and pl) then return end
  if l < pl - TOL or r > pr + TOL or b < pb - TOL or t > pt + TOL then
    salida[#salida + 1] = string.format("%s se sale de %s: [%.1f %.1f %.1f %.1f] en [%.1f %.1f %.1f %.1f]", quien(o), que,
      l, r, t, b, pl, pr, pt, pb)
  end
end
local function cabeTexto(fs)
  local texto = fs:GetText()
  if not texto or texto == "" then return end
  local l, r = fs:GetLeft(), fs:GetRight()
  if not l then return end
  local ancho = r - l
  if fs:GetWidth() == 0 and fs:GetNumPoints() < 2 then return end -- sin ancho propio: mide lo que escribe
  if fs:GetUnboundedStringWidth() > ancho * 0.85 then
    salida[#salida + 1] = string.format("texto largo %s: %.1f px en %.1f px", quien(fs), fs:GetUnboundedStringWidth(), ancho)
  end
end
local function recorrer(f, nombreMarco, texto)
  for _, r in ipairs({f:GetRegions()}) do
    if r:IsShown() then
      dentro(r, f, nombreMarco)
      -- El nombre del objeto en la tabla se recorta por diseño (un nombre largo no cabe nunca); lo que no puede hacer es
      -- partirse en dos renglones: eso lo mide «dentro» (el alto de la celda contra el de la fila).
      local esNombre = f.celdas ~= nil and f.celdas.objeto == r
      if r:GetObjectType() == "FontString" and texto and not esNombre then cabeTexto(r) end
    end
  end
  for _, c in ipairs({f:GetChildren()}) do
    if c:IsShown() then
      dentro(c, f, nombreMarco)
      recorrer(c, quien(c), texto)
    end
  end
end
return recorrer, dentro, salida
`;
function repasar(m, raiz, { textos = true, contra = null } = {}) {
  return m.lua(`(function()
    local recorrer, dentro, salida = (function() ${REVISAR} end)()
    local raiz = ${raiz}
    if ${contra ? 'true' : 'false'} then dentro(raiz, ${contra || 'UIParent'}, "su límite") end
    recorrer(raiz, "la raíz", ${textos})
    return salida
  end)()`) || [];
}

// El índice de la fila de un objeto en la lista de la ventana.
function filaDe(m, item) {
  for (let i = 1; i <= 16; i++) {
    const f = m.lua(`SnetForever.UIComercio.fila(${i})`);
    if (!f) break;
    if (f.item === item) return i;
  }
  throw new Error(`el objeto ${item} no está en la lista`);
}
const pulsarFila = (m, item) => m.lua(`${V}.filas[${filaDe(m, item)}]:Click()`);

for (const { nombre: ventana, subasta, minimo } of VENTANAS) {
  test(`repaso: todo lo de la ventana cabe en su marco (${ventana})`, () => {
    const m = maquina({ subasta, minimo });
    escenario(m);
    for (const idioma of ['es', 'en']) {
      m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
      m.lua('SnetForever.UIComercio.abrir()');
      m.avanzar(0.6);
      // Pestaña Lista, con el engranaje abierto (la ventanita flota: cabe en la ventana y en la pantalla).
      m.lua('SnetForever.UIComercio.elegirPestana("lista")');
      m.lua(`${V}.ajustes:Show()`);
      assert.deepEqual(repasar(m, V, { contra: 'UIParent' }), [], `${idioma}: lista`);
      assert.deepEqual(repasar(m, `${V}.ajustes`, { contra: V }), [], `${idioma}: engranaje dentro de la ventana`);
      m.lua(`${V}.ajustes:Hide()`);
      // Pestaña Sniper en marcha, con su fila y su estado.
      m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
      m.lua('SnetForever.SubastaSniper.marcos.grande:Click()'); // tarea S2: la página de ui/subasta/sniper.lua
      m.avanzar(0.6);
      assert.equal(m.lua('SnetForever.SubastaSniper.marcos.tabla.huecos[1]:IsShown()'), true, `${idioma}: el Sniper tiene al menos una fila que medir`);
      assert.deepEqual(repasar(m, V), [], `${idioma}: sniper`);
    }
    sinErrores(m);
  });

  test(`repaso: el cuadro de cantidad cabe en su marco y en la ventana, con la cantidad máxima (${ventana})`, () => {
    const m = maquina({ subasta, minimo });
    escenario(m);
    m.lua('SnetForever.UIComercio.elegirPestana("lista")');
    for (const idioma of ['es', 'en']) {
      m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
      m.lua(`${C}.cerrar()`);
      pulsarFila(m, 2589);
      m.avanzar(0.1);
      m.lua(`${V}.pie.comprar:Click()`); // una mercancía «lista»: abre el cuadro
      assert.equal(m.lua(`${C}.abierto()`), true, `${idioma}: el cuadro está abierto`);
      m.lua(`${M}.rapidos.max:Click()`);
      assert.ok(m.lua('SnetForever.Compra.estado().cantidad') > 1, 'la cantidad máxima no es 1');
      assert.deepEqual(repasar(m, M, { contra: V }), [], `${idioma}: cuadro «lista»`);
      assert.deepEqual(repasar(m, M, { contra: 'UIParent' }), [], `${idioma}: cuadro dentro de la pantalla`);
      assert.deepEqual(repasar(m, `${M}.velo`, { textos: false }), [], `${idioma}: velo`);
      // A medio confirmar («Confirmar N por X»), con el precio ya pedido al servidor. Regla nueva (ronda 1 de B5): no
      // puede pasar del precio por unidad de la fila (4 de oro) × la cantidad, así que se cotiza a ese precio.
      m.lua(`${M}.rapidos[5]:Click()`); // 5 unidades
      m.avanzar(0.6); // recién cambiada la cantidad, el botón espera medio segundo
      m.lua('BANCO.ponerSubasta({precioCompra = 40000})');
      m.lua(`${M}.comprar:Click()`);
      m.avanzar(0.1);
      assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'confirmar', `${idioma}: queda por confirmar`);
      assert.deepEqual(repasar(m, M, { contra: V }), [], `${idioma}: cuadro «confirmar»`);
      assert.deepEqual(repasar(m, V), [], `${idioma}: ventana con la compra por confirmar`);
    }
    sinErrores(m);
  });
}

// Los importes más largos que puede llevar un texto: lo máximo por compra de la regla de fábrica son 100 de oro, pero el
// jugador puede subirlo, así que también se prueba un importe de cuatro cifras de oro.
const IMPORTES = [999999, 1000000, 12345678, 55000, 10100, 9999, 3]; // «99g 99s 99c», «100g 00s 00c», «1234g 56s 78c», «5g 50s 00c»…

// B2r, punto 2: si no cabe, hacia abajo (antes hacia arriba, con un margen de 0,85: «~5g» por 4g 27s 70c).
test('repaso: los botones de compra enseñan el importe entero si cabe y, si no, redondeado hacia abajo con «~», en es y en', () => {
  const m = maquina({ subasta: true });
  escenario(m);
  pulsarFila(m, 2589);
  m.avanzar(0.1);
  m.lua(`${V}.pie.comprar:Click()`); // abre el cuadro de cantidad (el lino es una mercancía)
  assert.equal(m.lua(`${C}.abierto()`), true);
  const botones = [
    // [objeto con el texto, ancho del botón, clave, argumentos antes del importe]: lo que pintan pintarBarra y el cuadro.
    [`${V}.pie.comprar.texto`, `${V}.pie.comprar.texto:GetWidth()`, 'COMERCIO_COMPRAR_ORO', []],
    [`${V}.pie.comprar.texto`, `${V}.pie.comprar.texto:GetWidth()`, 'COMERCIO_CONFIRMAR', []],
    [`${M}.comprar.texto`, `${M}.comprar:GetWidth()`, 'COMERCIO_CANT_COMPRAR', [200]],
    [`${M}.comprar.texto`, `${M}.comprar:GetWidth()`, 'COMERCIO_CANT_CONFIRMAR', [200]],
  ];
  let aproximados = 0, exactos = 0;
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    for (const cobre of IMPORTES) {
      for (const [objeto, anchoLua, clave, previos] of botones) {
        const ancho = m.lua(anchoLua);
        const argumentos = previos.map((p) => `${p}, `).join('');
        const etiqueta = m.lua(`SnetForever.UIComercio.etiquetaConImporte(${cobre}, ${objeto}, ${ancho}, function(x) return SnetForever.L.t("${clave}", ${argumentos}x) end)`);
        const completa = m.lua(`SnetForever.L.t("${clave}", ${argumentos}SnetForever.UIComercio.dinero(${cobre}))`);
        const que = `${idioma} ${clave} con ${cobre}: «${etiqueta}»`;
        m.lua(`${objeto}:SetText(${JSON.stringify(completa)})`);
        const anchoCompleta = m.lua(`${objeto}:GetUnboundedStringWidth()`);
        if (anchoCompleta <= ancho || cobre < 100) {
          assert.equal(etiqueta, completa, `${que}: si cabe entero (o es solo cobre), sale entero`);
          exactos++;
        } else {
          aproximados++;
          const trozo = etiqueta.match(/~(\d+)([a-z])/);
          assert.ok(trozo, `${que}: si no cabe, sale con «~»`);
          const unidad = { o: 10000, g: 10000, p: 100, s: 100 }[trozo[2]];
          assert.ok(Number(trozo[1]) * unidad <= cobre, `${que}: nunca más de lo que se paga`);
          assert.ok(cobre - Number(trozo[1]) * unidad < unidad, `${que}: redondeado hacia abajo a la unidad mayor, no menos`);
        }
        m.lua(`${objeto}:SetText(${JSON.stringify(etiqueta)})`);
        // El ancho del banco es una aproximación: con el importe redondeado basta con que quepa en el botón.
        assert.ok(m.lua(`${objeto}:GetUnboundedStringWidth()`) <= ancho, `${que}: cabe en ${ancho} px`);
      }
    }
  }
  assert.ok(exactos > 0 && aproximados > 0, 'se han probado los dos caminos');
  sinErrores(m);
});

// B6r, punto 11: el dinero sin colores es el de Tema.dinero («g», «s», «c», con ceros a dos cifras): antes «5o 50p».
// B2r, punto 2: redondeado hacia abajo (antes hacia arriba: «~6g», «~1g», «~1235g», «~2g»).
test('repaso: 5s 50c sale entero; 5g 50s 00c sale «~5g»; 99s 99c sale «~99s»; 1234g 56s 78c sale «~1234g» (nunca más)', () => {
  const m = maquina({ subasta: true });
  m.disparar('AUCTION_HOUSE_SHOW');
  const t = `${V}.pie.comprar.texto`;
  const f = (cobre, clave, ancho = 99) => m.lua(`SnetForever.UIComercio.etiquetaConImporte(${cobre}, ${t}, ${ancho}, function(x) return SnetForever.L.t("${clave}", x) end)`);
  assert.equal(f(550, 'COMERCIO_COMPRAR_ORO'), 'Comprar 5s 50c', 'cabe: exacto');
  assert.equal(f(55000, 'COMERCIO_CONFIRMAR'), 'Confirmar ~5g', 'no cabe: hacia abajo');
  assert.equal(f(9999, 'COMERCIO_CONFIRMAR'), 'Confirmar 99s 99c', 'cabe: exacto');
  assert.equal(f(9999, 'COMERCIO_CONFIRMAR', 80), 'Confirmar ~99s', 'en 80 px no cabe: 99s 99c no sube a 1g');
  assert.equal(f(12345678, 'COMERCIO_CONFIRMAR'), 'Confirmar ~1234g');
  assert.equal(f(19900, 'COMERCIO_CONFIRMAR'), 'Confirmar ~1g', '1g 99s baja a 1g, no sube a 2g');
  assert.equal(f(5, 'COMERCIO_CONFIRMAR'), 'Confirmar 5c');
  sinErrores(m);
});

test('repaso: los textos de la barra de abajo caben con los importes más largos, en es y en (sobre la subasta)', () => {
  const m = maquina({ subasta: true });
  m.disparar('AUCTION_HOUSE_SHOW');
  const dinero = (c) => JSON.stringify(m.lua(`SnetForever.UIComercio.dinero(${c})`));
  const largo = dinero(999999); // «99g 99s 99c»
  const motivos = [ // los mismos textos que da textoMotivo en ui/comercio.lua
    ['COMERCIO_MOTIVO_SIN_ORO', largo], ['COMERCIO_MOTIVO_TOPE', largo, largo], ['COMERCIO_MOTIVO_REGLA', '"10.000"', largo],
    ['COMERCIO_MOTIVO_SIN_SUBASTA'], ['COMERCIO_MOTIVO_SIN_UNIDADES'], ['COMERCIO_MOTIVO_SIN_RESPUESTA'],
    ['COMERCIO_MOTIVO_SIN_CONFIRMAR'], ['COMERCIO_MOTIVO_FALLO'], ['COMERCIO_MOTIVO_FALLO_TEXTO', '"Esa subasta ya no existe"'],
  ];
  const lineas = [ // los mismos textos que da pintarBarra (sin el nombre del objeto: la fila elegida ya está pintada)
    ['COMERCIO_BARRA_NADA'], ['COMERCIO_BARRA_BUSCANDO'], ['COMERCIO_BARRA_OCUPADA'], ['COMERCIO_BARRA_LISTA', '10000', largo],
    ['COMERCIO_BARRA_CONFIRMANDO'], ['COMERCIO_BARRA_ESCANEANDO', '99999'], ['COMERCIO_BARRA_COMPLETO', '99999'],
    ['COMERCIO_BARRA_PRECIO', '"10.000"'], ['COMERCIO_BARRA_SUBIO', '"10.000"', largo, largo],
    ['COMERCIO_BARRA_COMPRANDO', '"10.000"', largo], ['COMERCIO_BARRA_HECHO', '"10.000"', largo],
  ];
  const t = `${V}.pie.info`;
  const ancho = m.lua(`${t}:GetRight() - ${t}:GetLeft()`);
  const comprobar = (idioma, texto, etiqueta) => {
    m.lua(`${t}:SetText(${texto})`);
    const w = m.lua(`${t}:GetUnboundedStringWidth()`);
    assert.ok(w <= ancho * 0.85, `${idioma} ${etiqueta}: ${w} px en ${ancho} px`);
  };
  const L = (clave, ...args) => `SnetForever.L.t(${JSON.stringify(clave)}${args.map((a) => `, ${a}`).join('')})`;
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    for (const [clave, ...args] of lineas) comprobar(idioma, L(clave, ...args), clave);
    for (const [clave, ...args] of motivos) comprobar(idioma, L('COMERCIO_BARRA_ERROR', L(clave, ...args)), `ERROR con ${clave}`);
  }
  sinErrores(m);
});

// B2r, punto 2: si no cabe, el botón redondea hacia abajo (antes «~100g»); la barra dice siempre el importe exacto. Ronda 1
// del arreglo de la compra suelta: con un objeto suelto el botón dice siempre el importe exacto (se ensancha si hace falta).
test('repaso: con un objeto suelto el botón Comprar de la barra y la barra enseñan el importe exacto', () => {
  const m = maquina({ subasta: true });
  m.lua('SnetForever.Ajustes.set("comercioAvisoOro", 10000)'); // aviso desde 1 de oro (no cambia nada en un objeto suelto)
  m.lua('BANCO.ponerSubasta({navegar = {{itemID = 4338, totalQuantity = 1, minPrice = 999999}}, porPagina = 50,'
    + ' objetos = {[4338] = {{quantity = 1, buyoutAmount = 999999}}}})');
  m.disparar('AUCTION_HOUSE_SHOW');
  for (let i = 0; i < 400 && m.lua('SnetForever.Escaneo.estado()') !== 'completo'; i++) m.avanzar(0.05);
  // F1 (ronda 1): la fila sale de la foto elegida; con la lista del objeto leída (la de ahora, 99g 99s 99c), de ella.
  assert.equal(m.lua('SnetForever.Busqueda.pedirSubastas(4338)'), true);
  m.avanzar(0.1);
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 0, 1)');
  m.avanzar(0.6);
  pulsarFila(m, 4338);
  m.avanzar(0.7);
  const e = m.lua('SnetForever.Compra.estado()');
  assert.equal(e.fase, 'lista', JSON.stringify(e));
  assert.equal(e.total, 999999);
  assert.equal(m.lua(`${V}.pie.comprar.texto:GetText()`), 'Comprar 1 por 99g 99s 99c', 'el botón, exacto');
  // Arreglo de la compra suelta: un objeto suelto pide siempre dos clics (sin aviso de compra cara); la barra dice el
  // importe exacto.
  assert.equal(m.lua(`${V}.pie.info:GetText()`), 'Lista para comprar: 1 por 99g 99s 99c', 'la barra, exacto');
  const medidas = m.lua(`(function() local t = ${V}.pie.info return {t:GetUnboundedStringWidth(), ${V}.pie.progreso:GetWidth() - 12} end)()`);
  assert.ok(medidas[0] <= medidas[1], `el aviso cabe en la barra: ${medidas}`);
  sinErrores(m);
});
