// Panel de configuración propio (ui/panel.lua), orden /snet, entrada en Opciones → AddOns y botón del minimapa
// (ui/boton-minimapa.lua), tarea 20. El jugador por defecto del banco es un orco guerrero de nivel 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, globalPermitida } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const DATOS_CON_AVISOS = [
  join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(FIXTURES, 'avisos-mini.lua'),
];
const INICIO = 'Prueba (H)\\01-02 Inicio';
const ES = { jugador: { idioma: 'esES' } };
const DRUIDA = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 9 };

const P = 'SnetForever.Panel';
const M = `${P}.marcos`;
const C = `${P}.controles`;
// 10b: con la tarjeta «Comercio» (entre «Chat con la IA» y «Versión») son 12 apartados, no 11.
const ORDEN = ['guia', 'saltados', 'idioma', 'ventana', 'objetivos', 'flecha', 'pines', 'openmap', 'avisos', 'ia', 'comercio', 'version'];

// Orco con Inicio cargado, la ventana creada y el panel (se crea solo al iniciar).
function conInicio(opciones = {}) {
  const m = nuevaMaquina({ ...ES, ...opciones });
  m.lua('SnetForever.Guias.cargar(SnetForever.Guias.porDefecto())');
  m.lua('SnetForever.Ventana.crear()');
  return m;
}

const slash = (m, texto = '') => m.lua(`SlashCmdList.SNET(${aLua(texto)})`);
const panelVisible = (m) => m.marco('SnetForeverPanel').visible;
const ajuste = (m, clave) => m.lua(`SnetForever.Ajustes.get(${aLua(clave)})`);
const puesto = (m, clave, valor) => m.lua(`SnetForever.Ajustes.set(${aLua(clave)}, ${aLua(valor)})`);
const impresos = (m) => m.llamadas('print').map((a) => a[0]);

// Todos los textos visibles de un marco y sus hijos.
const TEXTOS = (raiz) => `(function()
  local salida = {}
  local function recorrer(o)
    if o:IsObjectType("FontString") then
      if o:IsVisible() and o:GetText() then salida[#salida + 1] = o:GetText() end
    elseif o:IsObjectType("Frame") then
      for _, r in ipairs({o:GetRegions()}) do recorrer(r) end
      for _, h in ipairs({o:GetChildren()}) do recorrer(h) end
    end
  end
  recorrer(${raiz})
  return salida
end)()`;
const textos = (m, raiz = 'SnetForeverPanel') => m.lua(TEXTOS(raiz)) || [];
const contiene = (lista, buscado) => lista.some((s) => s.includes(buscado));
const tituloDe = (m, nombre) => m.lua(`${M}.secciones.${nombre}.titulo:GetText()`);
// F3-34: pulsa la tarjeta de un apartado (solo se ve el apartado elegido).
const elegir = (m, nombre) => m.lua(`${M}.tarjetas.${nombre}:Click()`);

// ---------------------------------------------------------------------------------------------------
// Banco: lo nuevo de la tarea 20
// ---------------------------------------------------------------------------------------------------

test('banco: ScrollFrame (SetScrollChild, rango y desplazamiento recortado), EnableMouseWheel, RegisterForDrag', () => {
  const m = nuevaMaquina();
  m.lua(`local s = CreateFrame("ScrollFrame", "SnetForeverPruebaSF", UIParent)
  s:SetSize(100, 200)
  local h = CreateFrame("Frame", "SnetForeverPruebaSH", UIParent)
  h:SetSize(100, 500)
  s:SetScrollChild(h)
  s:EnableMouseWheel(true)
  s:RegisterForDrag("LeftButton")`);
  assert.equal(m.lua('SnetForeverPruebaSF:GetScrollChild() == SnetForeverPruebaSH'), true);
  assert.equal(m.lua('SnetForeverPruebaSH:GetParent() == SnetForeverPruebaSF'), true);
  assert.equal(m.lua('SnetForeverPruebaSF:GetVerticalScrollRange()'), 300);
  assert.equal(m.lua('SnetForeverPruebaSF:GetVerticalScroll()'), 0);
  m.lua('SnetForeverPruebaSF:SetVerticalScroll(120)');
  assert.equal(m.lua('SnetForeverPruebaSF:GetVerticalScroll()'), 120);
  m.lua('SnetForeverPruebaSF:SetVerticalScroll(9999)');
  assert.equal(m.lua('SnetForeverPruebaSF:GetVerticalScroll()'), 300);
  m.lua('SnetForeverPruebaSF:SetVerticalScroll(-5)');
  assert.equal(m.lua('SnetForeverPruebaSF:GetVerticalScroll()'), 0);
  sinErrores(m);
});

// Ruling F3-34: el banco calcula GetLeft/GetRight/GetBottom/GetTop a partir de las anclas y el tamaño (escala 1).
test('banco: GetLeft, GetRight, GetBottom y GetTop siguen a las anclas; sin anclas dan nil', () => {
  const m = nuevaMaquina();
  m.lua(`local a = CreateFrame("Frame", "SnetForeverPruebaA", UIParent)
  a:SetSize(200, 100)
  a:SetPoint("CENTER", UIParent, "CENTER", 10, -20)
  local b = CreateFrame("Frame", "SnetForeverPruebaB", a)
  b:SetPoint("TOPLEFT", a, "TOPLEFT", 5, -5)
  b:SetPoint("BOTTOMRIGHT", a, "BOTTOMRIGHT", -5, 5)
  local t = b:CreateFontString(nil, "OVERLAY")
  t:SetFont("Fonts\\\\FRIZQT__.TTF", 10, "")
  t:SetText("abcd")
  t:SetPoint("TOPRIGHT", b, "TOPRIGHT", 0, 0)
  CreateFrame("Frame", "SnetForeverPruebaC", UIParent):SetSize(5, 5)`);
  const caja = (o) => m.lua(`{${o}:GetLeft(), ${o}:GetRight(), ${o}:GetBottom(), ${o}:GetTop()}`);
  // UIParent es la pantalla entera en unidades de 768 de alto (como el cliente): 1920×1080 → 1365,33 × 768.
  const [, W, , H] = caja('UIParent');
  assert.equal(H, 768);
  assert.ok(Math.abs(W - 1920 * 768 / 1080) < 1e-6);
  const cerca = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  const cx = W / 2, cy = H / 2;
  assert.ok(cerca(caja('SnetForeverPruebaA'), [cx - 90, cx + 110, cy - 70, cy + 30]));
  assert.ok(cerca(caja('SnetForeverPruebaB'), [cx - 85, cx + 105, cy - 65, cy + 25]));
  // El texto sin tamaño usa el de su texto: 4 caracteres de 5 px y un renglón de 12 px.
  assert.ok(cerca(caja('({SnetForeverPruebaB:GetRegions()})[1]'), [cx + 85, cx + 105, cy + 13, cy + 25]));
  assert.equal(m.lua('SnetForeverPruebaC:GetTop()'), undefined);
  sinErrores(m);
});

test('banco: GetCursorPosition, Minimap:GetCenter, Settings e InterfaceOptions_AddCategory (quitables con sinApi)', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('{GetCursorPosition()}'), [0, 0]);
  m.lua('BANCO.cursor = {x = 10, y = 20}');
  assert.deepEqual(m.lua('{GetCursorPosition()}'), [10, 20]);
  assert.deepEqual(m.lua('{Minimap:GetCenter()}'), [1800, 900]);
  assert.equal(typeof m.lua('Settings.RegisterCanvasLayoutCategory'), 'string');
  assert.equal(typeof m.lua('InterfaceOptions_AddCategory'), 'string');
  const sin = nuevaMaquina({ sinApi: ['Settings', 'InterfaceOptions_AddCategory'] });
  assert.equal(sin.lua('Settings'), undefined);
  assert.equal(sin.lua('InterfaceOptions_AddCategory'), undefined);
  sinErrores(m);
  sinErrores(sin);
});

// ---------------------------------------------------------------------------------------------------
// /snet
// ---------------------------------------------------------------------------------------------------

test('/snet: el panel se abre y, otra vez, se cierra; /snetforever es el mismo comando', () => {
  const m = conInicio();
  assert.equal(m.lua('SLASH_SNET1'), '/snet');
  assert.equal(m.lua('SLASH_SNET2'), '/snetforever');
  assert.equal(m.marco('SnetForeverPanel').padre, 'UIParent');
  assert.equal(panelVisible(m), false);
  slash(m);
  assert.equal(panelVisible(m), true);
  slash(m);
  assert.equal(panelVisible(m), false);
  assert.ok(m.lua('UISpecialFrames').includes('SnetForeverPanel'));
  sinErrores(m);
});

test('/snet ventana alterna la ventana; /snet fallo abre el diálogo', () => {
  const m = conInicio();
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  slash(m, 'ventana');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), false);
  slash(m, 'ventana');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  slash(m, 'fallo');
  assert.equal(m.marco('SnetForeverFallo').visible, true);
  assert.equal(panelVisible(m), false);
  sinErrores(m);
});

test('/snet reiniciar restablece ventana.pos y flecha.pos', () => {
  const m = conInicio();
  puesto(m, 'ventana.pos', { punto: 'TOP', relPunto: 'TOP', x: 5, y: -5 });
  puesto(m, 'flecha.pos', { punto: 'CENTER', relPunto: 'CENTER', x: 1, y: 1 });
  slash(m, 'reiniciar');
  assert.equal(ajuste(m, 'ventana.pos'), undefined);
  assert.equal(ajuste(m, 'flecha.pos'), undefined);
  assert.deepEqual(m.marco('SnetForeverVentana').puntos, [{ punto: 'LEFT', relativo: 'UIParent', relPunto: 'LEFT', x: 160, y: 60 }]);
  sinErrores(m);
});

test('/snet con otra cosa escribe la ayuda, una línea por orden, en el idioma activo', () => {
  const m = conInicio();
  slash(m, 'xyz');
  const lineas = impresos(m);
  // Tarea 11: «/snet chat (o /snet ia)» añade su línea a la ayuda; «Mis guías» (0.5.15), la de «/snet aqui».
  assert.equal(lineas.length, 12); // 0.6.1: «/snet diario»; 0.7.0: «/snet c» (comercio) y «/snet h» (ayuda); «/snet importar»
  for (const orden of ['/snet ventana', '/snet chat', '/snet fallo', '/snet reiniciar', '/snet prueba', '/snet aqui', '/snet diario', '/snet importar']) {
    assert.equal(lineas.filter((l) => l.includes(orden)).length, 1, orden);
  }
  assert.ok(lineas[0].includes('SnetForever'));
  assert.equal(panelVisible(m), false);
  const en = conInicio({ jugador: { idioma: 'enUS' } });
  slash(en, 'ayuda');
  assert.ok(impresos(en).some((l) => l.includes('/snet fallo') && /mistake|problem|report/i.test(l)));
  sinErrores(m);
  sinErrores(en);
});

// ---------------------------------------------------------------------------------------------------
// Secciones y controles
// ---------------------------------------------------------------------------------------------------

// Ruling F3-34: las secciones ya no van en una columna con desplazamiento, sino una tarjeta por apartado a la izquierda
// y el apartado elegido a la derecha. El orden «de arriba abajo» que comprobaba esta prueba pasa a las tarjetas.
test('las 12 secciones están, en el orden del diseño, con su título, y sus tarjetas van de arriba abajo', () => {
  const m = conInicio();
  slash(m);
  assert.deepEqual(m.lua(`${M}.orden`), ORDEN);
  const ys = ORDEN.map((nombre) => {
    assert.equal(m.lua(`${M}.secciones.${nombre} ~= nil`), true, nombre);
    return m.lua(`${M}.tarjetas.${nombre}:GetTop()`);
  });
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] < ys[i - 1], `la tarjeta ${ORDEN[i]} va debajo de ${ORDEN[i - 1]}`);
  assert.deepEqual(ORDEN.map((n) => tituloDe(m, n)), [
    'Guía', 'Pasos saltados', 'Idioma', 'Ventana', 'Objetivos cercanos', 'Flecha', 'Pines', 'OpenMap', 'Avisos', 'Chat con la IA', 'Comercio', 'Versión',
  ]);
  assert.equal(m.marco('SnetForeverPanel').padre, 'UIParent');
  sinErrores(m);
});

test('cada ajuste de la tabla de la tarea 3 tiene control, salvo las posiciones, version y minimapa.angulo', () => {
  const m = conInicio();
  const sin = m.lua(`(function()
    local f = {}
    for clave in pairs(SnetForever.Ajustes.DEFECTO) do
      if not ${C}[clave] then f[#f + 1] = clave end
    end
    table.sort(f)
    return f
  end)()`);
  // Los ajustes de Comercio tienen sus controles en su propia ventana. El sonido y el modo de Sniper están en el engranaje.
  assert.deepEqual(sin, ['comercioAvisoOro', 'comercioSiguienteSola', 'comercioSniperCada', 'comercioSniperModo',
    'comercioSniperSonido', 'comercioTope', 'comercioVista', 'guide.details', 'minimapa.angulo', 'principal.pestana', 'version']);
  assert.equal(m.lua(`${C}["ventana.pos"]`), undefined);
  assert.equal(m.lua(`${C}["flecha.pos"]`), undefined);
  // La casilla de minimapa.boton va en «Ventana».
  assert.equal(m.lua(`${C}["minimapa.boton"]:GetParent() == ${M}.secciones.ventana`), true);
  sinErrores(m);
});

test('pasos.saltarPorNivel (nuevo ajuste, activado) tiene su casilla en «Pasos saltados» y la apaga', () => {
  const m = conInicio();
  assert.equal(ajuste(m, 'pasos.saltarPorNivel'), true);
  assert.equal(m.lua(`${C}["pasos.saltarPorNivel"]:GetParent() == ${M}.secciones.saltados`), true);
  m.lua(`${C}["pasos.saltarPorNivel"]:Click()`);
  assert.equal(ajuste(m, 'pasos.saltarPorNivel'), false);
  sinErrores(m);
});

test('la casilla ventana.bloqueada guarda el ajuste; el control sigue a los cambios de fuera', () => {
  const m = conInicio();
  slash(m);
  assert.equal(ajuste(m, 'ventana.bloqueada'), false);
  assert.equal(m.lua(`${C}["ventana.bloqueada"].marca:IsShown()`), false);
  m.lua(`${C}["ventana.bloqueada"]:Click()`);
  assert.equal(ajuste(m, 'ventana.bloqueada'), true);
  assert.equal(m.lua(`${C}["ventana.bloqueada"].marca:IsShown()`), true);
  puesto(m, 'ventana.bloqueada', false);
  assert.equal(m.lua(`${C}["ventana.bloqueada"].marca:IsShown()`), false);
  sinErrores(m);
});

test('el deslizador ventana.alfa a 0,5 pone el fondo de la ventana con 0,5; ancho y siguientes se recortan a sus límites', () => {
  const m = conInicio();
  slash(m);
  m.lua(`${C}["ventana.alfa"]:SetValue(0.5)`);
  assert.equal(ajuste(m, 'ventana.alfa'), 0.5);
  assert.equal(m.lua('select(4, SnetForever.Ventana.marcos.lista.snfFondo:GetVertexColor())'), 0.5);
  assert.equal(m.lua(`${C}["ventana.alfa"].etiqueta:GetText()`), 'Opacidad: 0.50');
  m.lua(`${C}["ventana.ancho"]:SetValue(400)`);
  assert.equal(ajuste(m, 'ventana.ancho'), 400);
  assert.equal(m.marco('SnetForeverVentana').ancho, 400);
  m.lua(`${C}["ventana.siguientes"]:SetValue(5)`);
  assert.equal(ajuste(m, 'ventana.siguientes'), 5);
  // Un valor fuera de rango que llegue al set se recorta con LIMITES (Ajustes.set no recorta).
  m.lua(`${C}["ventana.ancho"]:GetScript("OnValueChanged")(${C}["ventana.ancho"], 9999)`);
  assert.equal(ajuste(m, 'ventana.ancho'), 500);
  sinErrores(m);
});

test('flecha.activa apagado oculta la flecha; pines.minimapa apagado oculta los pines', () => {
  const m = nuevaMaquina({ ...ES, jugador: { mapa: 1411, x: 50, y: 25, rumbo: 0, idioma: 'esES' } });
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, inst = 1, wx = -4500, wy = 1025, seguir = true, orden = 1,
    etiqueta = "Destino"}})`);
  m.lua('SnetForever.Flecha.crear(); SnetForever.PinesMinimapa.crear(); SnetForever.Flecha.actualizar(0)');
  const pines = () => m.lua('(function() local n = 0 for _, p in ipairs(SnetForever.PinesMinimapa.marcos.pines) do if p:IsShown() then n = n + 1 end end return n end)()');
  assert.equal(m.lua('SnetForever.Flecha.marcos.raiz:IsShown()'), true);
  assert.equal(pines(), 1);
  slash(m);
  m.lua(`${C}["flecha.activa"]:Click()`);
  assert.equal(ajuste(m, 'flecha.activa'), false);
  assert.equal(m.lua('SnetForever.Flecha.marcos.raiz:IsShown()'), false);
  m.lua(`${C}["pines.minimapa"]:Click()`);
  assert.equal(ajuste(m, 'pines.minimapa'), false);
  assert.equal(pines(), 0);
  sinErrores(m);
});

test('el selector idioma en «English» cambia el idioma: la sección «Ventana» pasa a llamarse «Window»', () => {
  const m = conInicio();
  slash(m);
  assert.equal(tituloDe(m, 'ventana'), 'Ventana');
  m.lua(`${C}.idioma:Click()`);
  m.lua(`${C}.idioma.filas[3]:Click()`);
  assert.equal(ajuste(m, 'idioma'), 'en');
  assert.equal(tituloDe(m, 'ventana'), 'Window');
  assert.equal(tituloDe(m, 'saltados'), 'Skipped steps');
  assert.equal(m.lua(`${C}.idioma.texto:GetText()`), 'Language: English');
  m.lua(`${C}.idioma.filas[2]:Click()`);
  assert.equal(tituloDe(m, 'ventana'), 'Ventana');
  m.lua(`${C}.idioma.filas[1]:Click()`);
  assert.equal(ajuste(m, 'idioma'), 'cliente');
  sinErrores(m);
});

test('openmap.usar está activo y cambia el ajuste; openmap.ficha se apaga con él; estado y nota sin «Llega en una versión posterior»', () => {
  const m = conInicio();
  slash(m);
  assert.equal(m.lua(`${C}["openmap.usar"]:IsEnabled()`), true);
  assert.equal(m.lua(`${C}["openmap.ficha"]:IsEnabled()`), true);
  elegir(m, 'openmap');
  const t = textos(m);
  assert.ok(contiene(t, 'Mis misiones en sus fichas de mazmorra'));
  assert.ok(contiene(t, 'OpenMap no está instalado: se usa el mapa de Blizzard.'));
  assert.ok(contiene(t, 'Si apagas «Usar OpenMap», los pines solo se ven en el mapa de Blizzard.'));
  assert.ok(!contiene(t, 'Llega en una versión posterior'));
  m.lua(`${C}["openmap.usar"]:Click()`);
  assert.equal(ajuste(m, 'openmap.usar'), false);
  assert.equal(m.lua(`${C}["openmap.ficha"]:IsEnabled()`), false);
  m.lua(`${C}["openmap.usar"]:Click()`);
  assert.equal(ajuste(m, 'openmap.usar'), true);
  assert.equal(m.lua(`${C}["openmap.ficha"]:IsEnabled()`), true);
  m.lua(`${C}["openmap.ficha"]:Click()`);
  assert.equal(ajuste(m, 'openmap.ficha'), false);
  sinErrores(m);
});

test('el estado de OpenMap en el panel dice «OpenMap instalado (API 4)» si está la API', () => {
  const m = conInicio({ previo: 'OpenMapAPI = {major = 1, version = 4, RegisterDungeonSection = function() end}' });
  slash(m);
  elegir(m, 'openmap');
  assert.ok(contiene(textos(m), 'OpenMap instalado (API 4)'));
  assert.ok(!contiene(textos(m), 'OpenMap no está instalado'));
  sinErrores(m);
});

test('ia.modelo en «Más listo» guarda "sonnet"', () => {
  const m = conInicio();
  slash(m);
  elegir(m, 'ia');
  // Tarea 11: la nota PANEL_IA_REQUISITO sustituye a PANEL_IA_NOTA y el modelo se ve como «Rápido» o «Más listo» (F4-11;
  // sin motor conocido, sin paréntesis).
  assert.ok(contiene(textos(m), 'Necesita la app SnetForever abierta'));
  m.lua(`${C}["ia.modelo"]:Click()`);
  assert.equal(m.lua(`${C}["ia.modelo"].filas[2].texto:GetText()`), 'Más listo');
  m.lua(`${C}["ia.modelo"].filas[2]:Click()`);
  assert.equal(ajuste(m, 'ia.modelo'), 'sonnet');
  assert.equal(m.lua(`${C}["ia.modelo"].texto:GetText()`), 'Modelo: Más listo');
  m.lua(`${C}["ia.inventario"]:Click()`);
  assert.equal(ajuste(m, 'ia.inventario'), true);
  sinErrores(m);
});

test('ia.modelo tiene una tercera opción, «El más capaz», que guarda "opus" (con Claude se ve «El más capaz (Opus)»)', () => {
  const m = conInicio();
  slash(m);
  elegir(m, 'ia');
  m.lua(`${C}["ia.modelo"]:Click()`);
  assert.equal(m.lua(`${C}["ia.modelo"].filas[3].texto:GetText()`), 'El más capaz');
  m.lua(`${C}["ia.modelo"].filas[3]:Click()`);
  assert.equal(ajuste(m, 'ia.modelo'), 'opus');
  assert.equal(m.lua(`${C}["ia.modelo"].texto:GetText()`), 'Modelo: El más capaz');
  m.lua('SnetForeverPJ.ia.motor = "claude"');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_APP", false)');
  assert.equal(m.lua(`${C}["ia.modelo"].texto:GetText()`), 'Modelo: El más capaz (Opus)');
  m.lua('SnetForeverPJ.ia.motor = "codex"');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_APP", false)');
  assert.equal(m.lua(`${C}["ia.modelo"].texto:GetText()`), 'Modelo: El más capaz (Codex)');
  sinErrores(m);
});

// Tarea 11: el apartado «Chat con la IA» con el selector de modelo, la casilla de inventario, el motor, el estado de la app
// y de la IA, el botón «Abrir el chat» y la nota de requisito; todo cabe sin desplazamiento (lo mira «sin scroll»).
test('Chat con la IA: selector, casilla, motor, estado, «Abrir el chat» (abre la ventana de chat) y la nota de requisito', () => {
  const m = conInicio();
  slash(m);
  elegir(m, 'ia');
  assert.equal(m.lua(`${C}["ia.modelo"]:IsVisible()`), true);
  assert.equal(m.lua(`${C}["ia.inventario"]:IsVisible()`), true);
  assert.equal(m.lua(`${M}.ia.motor:GetText()`), 'Motor: sin conexión todavía');
  assert.ok(m.lua(`${M}.ia.estado:GetText()`).includes('App sin conexión'));
  assert.ok(contiene(textos(m), 'Necesita la app SnetForever abierta y el juego en modo ventana o ventana a pantalla completa'));
  assert.equal(m.lua(`${M}.ia.abrir.texto:GetText()`), 'Abrir el chat');
  m.lua(`${M}.ia.abrir:Click()`);
  assert.equal(m.marco('SnetForeverChat').visible, true);
  // El motor y el estado de la IA llegan con la app: el panel abierto se repinta.
  m.lua('SnetForeverPJ.ia.motor = "claude"');
  m.lua('SnetForever.Buzon.estadoApp = function() return {claude = "sin_sesion"} end');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_APP", false)');
  assert.equal(m.lua(`${M}.ia.motor:GetText()`), 'Motor: Claude');
  assert.ok(m.lua(`${M}.ia.estado:GetText()`).includes('Claude Code no tiene la sesión iniciada.'));
  assert.equal(m.lua(`${C}["ia.modelo"].texto:GetText()`), 'Modelo: Rápido (Haiku)');
  m.lua('SnetForeverPJ.ia.motor = "codex"');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_APP", false)');
  assert.equal(m.lua(`${M}.ia.motor:GetText()`), 'Motor: ChatGPT (Codex)');
  assert.equal(m.lua(`${C}["ia.modelo"].texto:GetText()`), 'Modelo: Rápido (Codex)');
  // Sin scroll también con el texto largo del error, en español y en inglés (ronda 1).
  comprobarApartados(m, 'ia con error');
  const en = conInicio({ jugador: { idioma: 'enUS' } });
  slash(en);
  en.lua('SnetForeverPJ.ia.motor = "claude"');
  en.lua('SnetForever.Buzon.estadoApp = function() return {claude = "sin_sesion"} end');
  en.lua('SnetForever.Eventos.emitir("SNF_IA_APP", false)');
  elegir(en, 'ia');
  assert.ok(en.lua(`${M}.ia.estado:GetText()`).includes('Claude Code is not signed in.'));
  comprobarApartados(en, 'ia con error (en)');
  sinErrores(m);
  sinErrores(en);
});

test('«Restablecer posición» devuelve la ventana a su sitio', () => {
  const m = conInicio();
  slash(m);
  puesto(m, 'ventana.pos', { punto: 'TOP', relPunto: 'TOP', x: 0, y: -10 });
  assert.equal(m.marco('SnetForeverVentana').puntos[0].punto, 'TOP');
  m.lua(`${M}.restablecerPosicion:Click()`);
  assert.equal(ajuste(m, 'ventana.pos'), undefined);
  assert.deepEqual(m.marco('SnetForeverVentana').puntos, [{ punto: 'LEFT', relativo: 'UIParent', relPunto: 'LEFT', x: 160, y: 60 }]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Guía
// ---------------------------------------------------------------------------------------------------

test('Guía: enseña la guía actual; «Normal» y «Con mazmorras» cambian de versión; «Volver a la de mi raza» recarga la de la raza', () => {
  const m = conInicio();
  slash(m);
  assert.ok(contiene(textos(m), 'Guía actual: 1-2 Inicio'));
  m.lua(`${M}.guia.mazmorras:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), 'Prueba (H) Mazmorras\\01-02 Inicio');
  assert.equal(ajuste(m, 'version'), 'mazmorras');
  m.lua(`${M}.guia.normal:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), INICIO);
  assert.equal(ajuste(m, 'version'), 'normal');
  m.lua('SnetForever.Guias.cargar("Prueba (H)\\\\02-03 Sigue")');
  assert.ok(contiene(textos(m), 'Guía actual: 2-3 Sigue'));
  m.lua(`${M}.guia.volver:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), INICIO);
  sinErrores(m);
});

test('Guía: «Elegir guía» abre el menú de guías de la ventana', () => {
  const m = conInicio();
  slash(m);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, false);
  m.lua(`${M}.guia.elegir:Click()`);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, true);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Pasos saltados
// ---------------------------------------------------------------------------------------------------

const filasSaltados = (m) => m.lua(`(function()
  local t = {}
  for _, f in ipairs(${M}.saltados) do
    if f:IsShown() then
      t[#t + 1] = {titulo = f.t1:GetText(), guia = f.t2:GetText(), retomar = f.retomar:IsShown(),
        retomarActivo = f.retomar:IsEnabled(), quitar = f.quitar:IsShown()}
    end
  end
  return t
end)()`) || [];

test('saltados: sin ninguno, la nota; con uno, su resumen, la guía y «Retomar» y «Quitar»', () => {
  const m = conInicio();
  m.lua(`${P}.abrir("saltados")`);
  assert.ok(contiene(textos(m), 'No hay pasos saltados'));
  assert.deepEqual(filasSaltados(m), []);
  m.lua('SnetForever.Motor.saltar(1)');
  assert.equal(contiene(textos(m), 'No hay pasos saltados'), false);
  const filas = filasSaltados(m);
  assert.equal(filas.length, 1);
  assert.ok(filas[0].titulo.startsWith('Paso 1: '), filas[0].titulo);
  assert.equal(filas[0].guia, '1-2 Inicio');
  assert.deepEqual([filas[0].retomar, filas[0].quitar], [true, true]);
  sinErrores(m);
});

test('saltados: «Retomar» llama a Motor.retomar (y queda «retomado»); «Quitar» llama a Motor.quitarSaltado', () => {
  const m = conInicio();
  m.lua('SnetForever.Motor.saltar(1); SnetForever.Motor.saltar(2)');
  m.lua(`${P}.abrir("saltados")`);
  assert.equal(filasSaltados(m).length, 2);
  m.lua(`${M}.saltados[1].retomar:Click()`);
  assert.equal(m.lua(`SnetForeverPJ.retomados["${INICIO.replace(/\\/g, '\\\\')}"].h0000001`), true);
  const tras = filasSaltados(m);
  assert.equal(tras.length, 2);
  assert.ok(tras[0].guia.includes('retomado'), tras[0].guia);
  assert.equal(tras[0].retomarActivo, false);
  m.lua(`${M}.saltados[1].quitar:Click()`);
  assert.equal(m.lua('#SnetForeverPJ.saltados'), 1);
  assert.equal(m.lua('SnetForeverPJ.saltados[1].id'), 'h0000002');
  assert.equal(filasSaltados(m).length, 1);
  m.lua(`${M}.saltados[1].quitar:Click()`);
  assert.equal(m.lua('#SnetForeverPJ.saltados'), 0);
  assert.ok(contiene(textos(m), 'No hay pasos saltados'));
  sinErrores(m);
});

test('saltados, Vigilancia 2: una guía o un paso que ya no existen dicen «(ya no existe)» y solo tienen «Quitar»', () => {
  const m = conInicio();
  m.lua(`SnetForeverPJ.saltados = {
    {clave = "Guia\\\\Que no existe", id = "x1", n = 4, resumen = "Algo viejo", fecha = "2026-11-01 10:00"},
    {clave = ${aLua(INICIO)}, id = "paso-borrado", n = 9, resumen = "Otro", fecha = "2026-11-01 10:00"},
    {clave = ${aLua(INICIO)}, id = "h0000003", n = 3, resumen = "Vivo", fecha = "2026-11-01 10:00"},
  }`);
  m.lua(`${P}.abrir("saltados")`);
  const filas = filasSaltados(m);
  assert.equal(filas.length, 3);
  assert.ok(filas[0].guia.includes('(ya no existe)'));
  assert.deepEqual([filas[0].retomar, filas[0].quitar], [false, true]);
  assert.ok(filas[1].guia.includes('(ya no existe)'));
  assert.deepEqual([filas[1].retomar, filas[1].quitar], [false, true]);
  assert.equal(filas[2].guia.includes('(ya no existe)'), false);
  assert.deepEqual([filas[2].retomar, filas[2].quitar], [true, true]);
  m.lua(`${M}.saltados[1].quitar:Click()`);
  assert.equal(m.lua('#SnetForeverPJ.saltados'), 2);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Avisos pendientes
// ---------------------------------------------------------------------------------------------------

test('avisos: la lista de pendientes con «Empezar», que carga la guía del aviso', () => {
  const m = nuevaMaquina({ ...ES, datos: DATOS_CON_AVISOS, jugador: { ...DRUIDA, idioma: 'esES' } });
  m.lua('SnetForever.Ventana.crear()');
  m.jugador({ nivel: 10 });
  m.disparar('PLAYER_LEVEL_UP', 10);
  const aviso = m.lua('SnetForever.Avisos.cola()[1]');
  assert.ok(aviso, 'hay un aviso en la cola');
  m.lua(`SnetForever.Avisos.masTarde(${aLua(aviso.id)})`);
  m.lua(`${P}.abrir("avisos")`);
  assert.equal(m.lua('#SnetForever.Avisos.pendientes()'), 1);
  assert.equal(m.lua(`#${M}.pendientes`) >= 1, true);
  assert.equal(m.lua(`${M}.pendientes[1]:IsShown()`), true);
  assert.ok(contiene(textos(m), 'Nivel 10'));
  m.lua(`${M}.pendientes[1].empezar:Click()`);
  assert.equal(m.lua('#SnetForever.Avisos.pendientes()'), 0);
  assert.equal(m.lua(`${M}.pendientes[1]:IsShown()`), false);
  assert.ok(contiene(textos(m), 'No hay avisos pendientes'));
  sinErrores(m);
});

test('avisos: sus dos casillas guardan avisos.cadenas y avisos.mazmorras', () => {
  const m = conInicio();
  slash(m);
  // Lote A, ronda 1: con la versión normal, avisos.mazmorras vale false por defecto; el clic lo enciende.
  m.lua(`${C}["avisos.cadenas"]:Click(); ${C}["avisos.mazmorras"]:Click()`);
  assert.equal(ajuste(m, 'avisos.cadenas'), false);
  assert.equal(ajuste(m, 'avisos.mazmorras'), true);
  sinErrores(m);
});

test('avisos (lote A, ronda 1): la casilla de mazmorras enseña el valor en vigor, que sin tocarla sigue a la versión', () => {
  const m = conInicio();
  slash(m);
  const marcada = () => m.lua(`${C}["avisos.mazmorras"].marca:IsShown()`);
  assert.equal(marcada(), false, 'con «Normal», apagada');
  m.lua('SnetForever.Guias.elegirVersion("mazmorras")');
  assert.equal(marcada(), true, 'con «Con mazmorras», encendida');
  m.lua(`${C}["avisos.mazmorras"]:Click()`);
  assert.equal(marcada(), false, 'apagada a mano');
  m.lua('SnetForever.Guias.elegirVersion("normal"); SnetForever.Guias.elegirVersion("mazmorras")');
  assert.equal(marcada(), false, 'lo elegido a mano manda al cambiar de versión');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Versión
// ---------------------------------------------------------------------------------------------------

test('Versión: «Addon 0.7.0 · Rutas … · Misiones …» y «Avisar de un fallo» abre el diálogo', () => {
  const m = conInicio();
  m.lua(`${P}.abrir("version")`);
  assert.ok(contiene(textos(m), 'Addon 0.7.0 · Rutas 2026.11.09.1 · Misiones 2026.11.09.1'));
  const boton = `${M}.fallo`;
  assert.equal(m.lua(`${boton}.texto:GetText()`), 'Avisar de un fallo');
  m.lua(`${boton}:Click()`);
  assert.equal(m.marco('SnetForeverFallo').visible, true);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Tarjetas (Ruling F3-34: «el apartado de opciones hazlo con tarjetas para no dar scroll eterno») y la ventana
// ---------------------------------------------------------------------------------------------------

// Antes: el ⚙ abría arriba del todo (desplazamiento 0) y el pie lo abría desplazado hasta «Pasos saltados». Ahora no hay
// desplazamiento: el ⚙ abre el último apartado (de entrada «Guía») y el pie abre la tarjeta de «Pasos saltados».
test('el ⚙ de la ventana abre el panel y el pie «Saltados: N» lo abre en «Pasos saltados»', () => {
  const m = conInicio();
  m.lua('SnetForever.Motor.saltar(1)');
  m.lua('SnetForever.Ventana.marcos.botonPanel:Click()');
  assert.equal(panelVisible(m), true);
  assert.equal(m.lua(`${M}.elegido`), 'guia');
  assert.equal(m.lua(`${M}.secciones.guia:IsVisible()`), true);
  slash(m);
  assert.equal(panelVisible(m), false);
  m.lua('SnetForever.Ventana.marcos.pie.saltados:Click()');
  assert.equal(panelVisible(m), true);
  assert.equal(m.lua(`${M}.elegido`), 'saltados');
  assert.equal(m.lua(`${M}.secciones.saltados:IsVisible()`), true);
  assert.equal(m.lua(`${M}.secciones.guia:IsVisible()`), false);
  sinErrores(m);
});

// Sustituye a «abrir(seccion) desplaza hasta ella; la rueda y la barra mueven la columna»: ya no hay columna que mover.
test('abrir(seccion) enseña ese apartado; uno que no existe deja el que había', () => {
  const m = conInicio();
  m.lua(`${P}.abrir("version")`);
  assert.equal(m.lua(`${M}.elegido`), 'version');
  assert.equal(m.lua(`${M}.secciones.version:IsVisible()`), true);
  m.lua(`${P}.abrir("guia")`);
  assert.equal(m.lua(`${M}.secciones.guia:IsVisible()`), true);
  assert.equal(m.lua(`${M}.secciones.version:IsVisible()`), false);
  m.lua(`${P}.abrir("noexiste")`);
  assert.equal(m.lua(`${M}.elegido`), 'guia');
  sinErrores(m);
});

test('tarjetas: una por apartado, con un icono de Interface\\Icons y el nombre traducido (es y en)', () => {
  for (const [idioma, nombres] of [
    ['esES', ['Guía', 'Pasos saltados', 'Idioma', 'Ventana', 'Objetivos cercanos', 'Flecha', 'Pines', 'OpenMap', 'Avisos', 'Chat con la IA', 'Comercio', 'Versión']],
    ['enUS', ['Guide', 'Skipped steps', 'Language', 'Window', 'Nearby targets', 'Arrow', 'Pins', 'OpenMap', 'Alerts', 'AI chat', 'Trading', 'Version']],
  ]) {
    const m = conInicio({ jugador: { idioma } });
    slash(m);
    assert.deepEqual(Object.keys(m.lua(`${M}.tarjetas`)).sort(), [...ORDEN].sort());
    assert.deepEqual(ORDEN.map((n) => m.lua(`${M}.tarjetas.${n}.texto:GetText()`)), nombres);
    const iconos = ORDEN.map((n) => m.lua(`${M}.tarjetas.${n}.icono:GetTexture()`));
    for (const ruta of iconos) assert.ok(ruta.startsWith('Interface\\Icons\\'), ruta);
    assert.equal(new Set(iconos).size, iconos.length, 'cada tarjeta lleva un icono distinto');
    for (const n of ORDEN) assert.equal(m.lua(`${M}.tarjetas.${n}:IsVisible()`), true, n);
    sinErrores(m);
  }
});

test('clic en una tarjeta: solo se ve su apartado, la tarjeta queda resaltada y el ratón cambia el fondo', () => {
  const m = conInicio();
  slash(m);
  const visibles = () => ORDEN.filter((n) => m.lua(`${M}.secciones.${n}:IsVisible()`));
  assert.deepEqual(visibles(), ['guia']);
  for (const nombre of ORDEN) {
    elegir(m, nombre);
    assert.deepEqual(visibles(), [nombre]);
    assert.equal(m.lua(`${M}.elegido`), nombre);
    for (const otro of ORDEN) {
      assert.equal(m.lua(`${M}.tarjetas.${otro}.acento:IsShown()`), otro === nombre, `${nombre}: acento de ${otro}`);
    }
  }
  // La elegida va con el fondo «resalte» del tema; las demás con «fondoLista»; al pasar el ratón cambia y al salir vuelve.
  elegir(m, 'flecha');
  const color = (n) => m.lua(`{${M}.tarjetas.${n}.snfFondo:GetVertexColor()}`).slice(0, 3);
  const token = (t) => m.lua(`SnetForever.Estilo.color(${aLua(t)})`).slice(0, 3);
  assert.deepEqual(color('flecha'), token('resalte'));
  assert.deepEqual(color('pines'), token('fondoLista'));
  m.lua(`${M}.tarjetas.pines:GetScript("OnEnter")(${M}.tarjetas.pines)`);
  assert.notDeepEqual(color('pines'), token('fondoLista'));
  m.lua(`${M}.tarjetas.pines:GetScript("OnLeave")(${M}.tarjetas.pines)`);
  assert.deepEqual(color('pines'), token('fondoLista'));
  // Con el tema neutro la elegida sigue resaltada (con el color del tema nuevo).
  puesto(m, 'ventana.tema', 'neutro');
  assert.deepEqual(color('flecha'), token('resalte'));
  assert.deepEqual(color('pines'), token('fondoLista'));
  sinErrores(m);
});

test('el apartado elegido se recuerda al cerrar y abrir el panel y tras /reload (en panel.apartado)', () => {
  const m = conInicio();
  slash(m);
  elegir(m, 'ia');
  slash(m);
  assert.equal(panelVisible(m), false);
  slash(m);
  assert.equal(m.lua(`${M}.elegido`), 'ia');
  assert.equal(m.lua(`${M}.secciones.ia:IsVisible()`), true);
  assert.equal(ajuste(m, 'panel.apartado'), 'ia');
  sinErrores(m);
  const r = m.recargar();
  slash(r);
  assert.equal(r.lua(`${M}.elegido`), 'ia');
  assert.equal(r.lua(`${M}.secciones.ia:IsVisible()`), true);
  // Un valor guardado que ya no es un apartado cae en «Guía».
  r.lua('SnetForeverPJ.ajustes["panel.apartado"] = "viejo"');
  slash(r);
  slash(r);
  assert.equal(r.lua(`${M}.elegido`), 'guia');
  sinErrores(r);
});

test('no queda ningún ScrollFrame en el panel (ni barra de desplazamiento)', () => {
  const m = conInicio();
  slash(m);
  const tipos = m.lua(`(function()
    local t = {}
    local function recorrer(o)
      t[#t + 1] = o:GetObjectType()
      for _, h in ipairs({o:GetChildren()}) do recorrer(h) end
    end
    recorrer(SnetForeverPanel)
    return t
  end)()`);
  assert.ok(tipos.length > 50, `pocos marcos (${tipos.length})`);
  assert.equal(tipos.includes('ScrollFrame'), false);
  assert.equal(m.lua(`${M}.scroll`), undefined);
  assert.equal(m.lua(`${M}.barra`), undefined);
  sinErrores(m);
});

// Mide un apartado con GetHeight y GetLeft/GetRight/GetBottom/GetTop: su alto, su rectángulo, el del área de contenido,
// todas sus regiones visibles y la caja de cada control (el control con todo lo que lleva dentro, p. ej. la etiqueta
// que el deslizador pinta encima).
const MEDIR = (nombre) => `(function()
  local m = ${M}
  local c, s = m.contenido, m.secciones.${nombre}
  local function caja(o)
    local l, r, b, t = o:GetLeft(), o:GetRight(), o:GetBottom(), o:GetTop()
    if not l then return nil end
    return {l, r, b, t}
  end
  local function nombreDe(o)
    if o:IsObjectType("FontString") then return o:GetText() end
    if o:IsObjectType("Texture") then return tostring(o:GetTexture()) end
    return (o.texto and o.texto:GetText()) or (o.etiqueta and o.etiqueta:GetText()) or (o.t1 and o.t1:GetText()) or o:GetObjectType()
  end
  local salida = {alto = s.alturaReal, altoRecortado = s:GetHeight(), altoContenido = c:GetHeight(), seccion = caja(s), contenido = caja(c),
    regiones = {}, controles = {}, sinCaja = {}}
  local function unir(a, b)
    if not a then return b end
    if not b then return a end
    return {math.min(a[1], b[1]), math.max(a[2], b[2]), math.min(a[3], b[3]), math.max(a[4], b[4])}
  end
  local function recorrer(o, apuntar)
    local total = caja(o)
    for _, r in ipairs({o:GetRegions()}) do
      local conTexto = not r:IsObjectType("FontString") or (r:GetText() or "") ~= ""
      if r:IsVisible() and conTexto then
        local q = caja(r)
        if q then
          if apuntar then salida.regiones[#salida.regiones + 1] = {que = nombreDe(r), r = q} end
          total = unir(total, q)
        elseif r:IsObjectType("FontString") and apuntar then
          salida.sinCaja[#salida.sinCaja + 1] = nombreDe(r)
        end
      end
    end
    for _, h in ipairs({o:GetChildren()}) do
      if h:IsVisible() then
        local q = caja(h)
        if apuntar then
          if q then
            salida.regiones[#salida.regiones + 1] = {que = nombreDe(h), r = q}
          else
            salida.sinCaja[#salida.sinCaja + 1] = nombreDe(h)
          end
        end
        total = unir(total, recorrer(h, apuntar))
      end
    end
    return total
  end
  recorrer(s, true)
  for _, h in ipairs({s:GetChildren()}) do
    if h:IsVisible() then salida.controles[#salida.controles + 1] = {que = nombreDe(h), r = recorrer(h, false)} end
  end
  return salida
end)()`;

const EPS = 0.5;
const solapan = (a, b) => a[0] < b[1] - EPS && b[0] < a[1] - EPS && a[2] < b[3] - EPS && b[2] < a[3] - EPS;
const dentro = (a, b) => a[0] >= b[0] - EPS && a[1] <= b[1] + EPS && a[2] >= b[2] - EPS && a[3] <= b[3] + EPS;

// La garantía de «sin scroll»: ningún apartado pasa del alto del área de contenido y nada se sale de ella ni se solapa.
function comprobarApartados(m, etiqueta) {
  for (const nombre of ORDEN) {
    elegir(m, nombre);
    const d = m.lua(MEDIR(nombre));
    const e = `${etiqueta} «${nombre}»`;
    assert.deepEqual(d.sinCaja || [], [], `${e}: regiones sin colocar`);
    // Ronda 1: s.alturaReal es lo que mide el apartado antes de recortarlo a su sitio (la comprobación de verdad).
    assert.equal(typeof d.alto, 'number', `${e}: sin alturaReal`);
    assert.ok(d.alto <= d.altoContenido - 8, `${e}: alto real ${d.alto} > área ${d.altoContenido} menos el relleno`);
    assert.equal(d.altoRecortado, d.alto, `${e}: el apartado se ha recortado`);
    assert.ok(dentro(d.seccion, d.contenido), `${e}: la sección ${d.seccion} se sale del área ${d.contenido}`);
    assert.ok(d.regiones.length > 2, `${e}: pocas regiones`);
    for (const r of d.regiones) assert.ok(dentro(r.r, d.contenido), `${e}: «${r.que}» ${r.r} se sale del área ${d.contenido}`);
    const cs = d.controles;
    assert.ok(cs.length >= 1, `${e}: sin controles`);
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        assert.ok(!solapan(cs[i].r, cs[j].r), `${e}: «${cs[i].que}» ${cs[i].r} se cruza con «${cs[j].que}» ${cs[j].r}`);
      }
    }
  }
}

test('sin scroll: ningún apartado pasa del área de contenido y sus controles no se cruzan (es y en)', () => {
  for (const idioma of ['esES', 'enUS']) {
    const m = conInicio({ jugador: { idioma } });
    slash(m);
    // El área de contenido queda dentro del panel, a la derecha de la columna de tarjetas, entre la cabecera y el pie.
    const caja = (o) => m.lua(`{${o}:GetLeft(), ${o}:GetRight(), ${o}:GetBottom(), ${o}:GetTop()}`);
    const panel = caja('SnetForeverPanel');
    const area = caja(`${M}.contenido`);
    const columna = caja(`${M}.columna`);
    assert.ok(dentro(area, panel), `área ${area} fuera del panel ${panel}`);
    assert.ok(dentro(columna, panel), `columna ${columna} fuera del panel ${panel}`);
    assert.ok(!solapan(area, columna));
    assert.ok(!solapan(area, caja(`${M}.cabecera`)) && !solapan(area, caja(`${M}.pie`)));
    assert.ok(!solapan(columna, caja(`${M}.cabecera`)) && !solapan(columna, caja(`${M}.pie`)));
    for (const n of ORDEN) assert.ok(dentro(caja(`${M}.tarjetas.${n}`), columna), `tarjeta ${n}`);
    comprobarApartados(m, idioma);
    sinErrores(m);
  }
});

test('sin scroll también con muchos pasos saltados y avisos pendientes: van por páginas', () => {
  const m = nuevaMaquina({ ...ES, datos: DATOS_CON_AVISOS, jugador: { ...DRUIDA, idioma: 'esES' } });
  m.lua('SnetForever.Ventana.crear()');
  m.jugador({ nivel: 10 });
  m.disparar('PLAYER_LEVEL_UP', 10);
  for (const a of m.lua('SnetForever.Avisos.cola()') || []) m.lua(`SnetForever.Avisos.masTarde(${aLua(a.id)})`);
  m.lua(`(function()
    for k = 1, 30 do
      SnetForeverPJ.saltados[k] = {clave = "Guia\\\\Vieja " .. k, id = "x" .. k, n = k,
        resumen = "Un paso con un resumen bastante largo para que ocupe dos renglones en la fila " .. k, fecha = "2026-11-01 10:00"}
    end
  end)()`);
  m.lua(`${P}.abrir("saltados")`);
  comprobarApartados(m, 'muchos');
  // Saltados: la primera página enseña desde el 1, «>» pasa a la siguiente y «<» vuelve; la última acaba en el 30.
  elegir(m, 'saltados');
  const pag = `${M}.paginas.saltados`;
  const primeros = filasSaltados(m).map((f) => f.titulo);
  assert.ok(primeros.length >= 2 && primeros.length < 30, `${primeros.length} filas`);
  assert.ok(primeros[0].startsWith('Paso 1: '));
  assert.equal(m.lua(`${pag}:IsVisible()`), true);
  assert.match(m.lua(`${pag}.texto:GetText()`), /^1\/\d+$/);
  assert.equal(m.lua(`${pag}.anterior:IsEnabled()`), false);
  m.lua(`${pag}.siguiente:Click()`);
  const segundos = filasSaltados(m).map((f) => f.titulo);
  assert.ok(segundos[0].startsWith(`Paso ${primeros.length + 1}: `), segundos[0]);
  assert.match(m.lua(`${pag}.texto:GetText()`), /^2\/\d+$/);
  comprobarApartados(m, 'página 2');
  elegir(m, 'saltados');
  for (let k = 0; k < 30 && m.lua(`${pag}.siguiente:IsEnabled()`); k++) m.lua(`${pag}.siguiente:Click()`);
  const ultimos = filasSaltados(m).map((f) => f.titulo);
  assert.ok(ultimos[ultimos.length - 1].startsWith('Paso 30: '), ultimos[ultimos.length - 1]);
  m.lua(`${pag}.anterior:Click()`);
  assert.equal(m.lua(`${pag}.siguiente:IsEnabled()`), true);
  // Quitar los de la última página no la deja vacía: vuelve a la anterior.
  for (let k = 0; k < 30 && m.lua(`${pag}.siguiente:IsEnabled()`); k++) m.lua(`${pag}.siguiente:Click()`);
  const enLaUltima = filasSaltados(m).length;
  for (let k = 0; k < enLaUltima; k++) m.lua(`${M}.saltados[1].quitar:Click()`);
  assert.ok(filasSaltados(m).length >= 1, 'tras vaciar la última página se ve la anterior');
  // Sin ninguno, sin páginas y con la nota.
  m.lua('SnetForeverPJ.saltados = {}');
  m.lua(`${P}.refrescar()`);
  assert.equal(m.lua(`${pag}:IsVisible()`), false);
  assert.ok(contiene(textos(m), 'No hay pasos saltados'));
  sinErrores(m);
});

// Tarea 22 (prueba en el juego): en MEDIUM el marco de vida de otro addon se dibujaba encima del panel. Suelto va en
// HIGH y como «toplevel» (sube al pulsarlo); el diálogo de fallo, en DIALOG, queda siempre por encima del panel.
test('el panel es movible, con el fondo sobrio, en la capa HIGH y toplevel', () => {
  const m = conInicio();
  slash(m);
  assert.equal(m.lua('SnetForeverPanel:IsMovable()'), true);
  assert.equal(m.lua('SnetForeverPanel:GetFrameStrata()'), 'HIGH');
  assert.equal(m.lua('SnetForeverPanel:IsToplevel()'), true);
  const color = m.lua('{SnetForeverPanel.snfFondo:GetVertexColor()}').slice(0, 3);
  assert.deepEqual(color, m.lua('SnetForever.Estilo.TEMAS.forge.fondo').slice(0, 3));
  sinErrores(m);
});

test('cerrar() y la X cierran el panel', () => {
  const m = conInicio();
  m.lua(`${P}.abrir()`);
  assert.equal(panelVisible(m), true);
  m.lua(`${M}.cerrar:Click()`);
  assert.equal(panelVisible(m), false);
  m.lua(`${P}.abrir(); ${P}.cerrar()`);
  assert.equal(panelVisible(m), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Opciones → AddOns
// ---------------------------------------------------------------------------------------------------

test('Settings: se registra un lienzo «SnetForever» una sola vez y RegisterAddOnCategory también', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.llamadas('Settings.RegisterCanvasLayoutCategory'), [['SnetForeverOpciones', 'SnetForever']]);
  assert.deepEqual(m.llamadas('Settings.RegisterAddOnCategory'), [['SnetForever']]);
  assert.deepEqual(m.llamadas('InterfaceOptions_AddCategory'), []);
  m.lua(`${P}.crear()`);
  assert.equal(m.llamadas('Settings.RegisterCanvasLayoutCategory').length, 1);
  sinErrores(m);
});

// Ronda 1 de F3-34: dentro del lienzo el panel ya no se estira con SetAllPoints (sus medidas interiores son fijas):
// conserva su tamaño, se ancla arriba a la izquierda y se encoge con SetScale si el lienzo es más pequeño.
test('Settings: el OnShow del lienzo mete el panel dentro (SetParent + TOPLEFT, su tamaño) y abrir() lo devuelve a UIParent', () => {
  const m = conInicio();
  assert.equal(m.marco('SnetForeverPanel').padre, 'UIParent');
  m.lua('SnetForeverOpciones:Show()');
  const dentro = m.marco('SnetForeverPanel');
  assert.equal(dentro.padre, 'SnetForeverOpciones');
  assert.equal(dentro.visible, true);
  assert.deepEqual(dentro.puntos.map((p) => [p.punto, p.relativo, p.relPunto]), [['TOPLEFT', 'SnetForeverOpciones', 'TOPLEFT']]);
  assert.deepEqual([dentro.ancho, dentro.alto], [640, 420]);
  // Un lienzo aún sin medidas (0×0) no encoge el panel.
  assert.equal(m.lua('SnetForeverPanel:GetScale()'), 1);
  m.lua('SnetForeverOpciones:Hide()');
  assert.equal(m.marco('SnetForeverPanel').visible, false);
  // /snet con el panel en el lienzo cerrado lo abre suelto, otra vez en UIParent.
  slash(m);
  assert.equal(m.marco('SnetForeverPanel').padre, 'UIParent');
  assert.equal(panelVisible(m), true);
  assert.deepEqual(m.marco('SnetForeverPanel').puntos.map((p) => [p.punto, p.relativo]), [['CENTER', 'UIParent']]);
  // Al salir del lienzo vuelve a su capa propia (tarea 22).
  assert.equal(m.lua('SnetForeverPanel:GetFrameStrata()'), 'HIGH');
  sinErrores(m);
});

test('InterfaceOptions_AddCategory sin Settings; sin ninguna de las dos no hay lienzo ni errores', () => {
  const viejo = nuevaMaquina({ sinApi: ['Settings'] });
  assert.deepEqual(viejo.llamadas('InterfaceOptions_AddCategory'), [['SnetForeverOpciones', 'SnetForever']]);
  assert.equal(viejo.lua('SnetForeverOpciones.name'), 'SnetForever');
  assert.deepEqual(viejo.llamadas('Settings.RegisterCanvasLayoutCategory'), []);
  const nada = nuevaMaquina({ sinApi: ['Settings', 'InterfaceOptions_AddCategory'] });
  assert.equal(nada.lua('rawget(_G, "SnetForeverOpciones")'), undefined);
  nada.lua('SlashCmdList.SNET("")');
  assert.equal(nada.marco('SnetForeverPanel').visible, true);
  sinErrores(viejo);
  sinErrores(nada);
});

// ---------------------------------------------------------------------------------------------------
// Botón del minimapa
// ---------------------------------------------------------------------------------------------------

const BOTON = 'SnetForeverBotonMinimapa';
const arrastrar = (m, x, y) => {
  m.lua(`BANCO.cursor = {x = ${x}, y = ${y}}`);
  m.lua(`${BOTON}:GetScript("OnDragStart")(${BOTON})`);
  m.avanzar(0.1);
  m.lua(`${BOTON}:GetScript("OnDragStop")(${BOTON})`);
};

test('botón del minimapa: hijo de Minimap de 31x31 con el icono y el borde de Blizzard', () => {
  const m = conInicio();
  const b = m.marco(BOTON);
  assert.equal(b.padre, 'Minimap');
  assert.deepEqual([b.ancho, b.alto], [31, 31]);
  assert.equal(b.visible, true);
  const rutas = m.lua(`(function()
    local t = {}
    for _, r in ipairs({${BOTON}:GetRegions()}) do
      if r:IsObjectType("Texture") and r:GetTexture() then t[#t + 1] = r:GetTexture() end
    end
    return t
  end)()`);
  assert.ok(rutas.includes('Interface\\AddOns\\SnetForever\\recursos\\icono'), JSON.stringify(rutas));
  assert.ok(rutas.includes('Interface\\Minimap\\MiniMap-TrackingBorder'), JSON.stringify(rutas));
  sinErrores(m);
});

// Task 12: con el comercio cargado el clic izquierdo abre la ventana de comercio y el panel se abre con Mayúsculas+clic
// (sin el comercio, el clic izquierdo abre el panel: test/principal.test.js).
test('botón del minimapa: Mayúsculas+clic abre el panel; clic derecho alterna la ventana; tooltip', () => {
  const m = conInicio();
  assert.equal(panelVisible(m), false);
  m.lua('BANCO.shift = true');
  m.lua(`${BOTON}:Click("LeftButton")`);
  m.lua('BANCO.shift = false');
  assert.equal(panelVisible(m), true);
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  m.lua(`${BOTON}:Click("RightButton")`);
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), false);
  m.lua(`${BOTON}:Click("RightButton")`);
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  m.lua(`${BOTON}:GetScript("OnEnter")(${BOTON})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  const lineas = m.lua('BANCO.lineasTooltip()');
  assert.equal(lineas[0], 'SnetForever');
  assert.ok(lineas.some((l) => l.includes('Clic izquierdo')));
  assert.ok(lineas.some((l) => l.includes('Clic derecho')));
  m.lua(`${BOTON}:GetScript("OnLeave")(${BOTON})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  m.lua('BANCO.tooltipProhibido = true');
  m.lua(`${BOTON}:GetScript("OnEnter")(${BOTON})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  sinErrores(m);
});

test('botón del minimapa: el ángulo por defecto (225°) lo pone en el borde; arrastrarlo a 90° guarda minimapa.angulo = 90', () => {
  const m = conInicio();
  const p = m.marco(BOTON).puntos[0];
  assert.deepEqual([p.punto, p.relativo, p.relPunto], ['CENTER', 'Minimap', 'CENTER']);
  assert.ok(Math.abs(p.x - 75 * Math.cos((225 * Math.PI) / 180)) < 1e-6);
  assert.ok(Math.abs(p.y - 75 * Math.sin((225 * Math.PI) / 180)) < 1e-6);
  arrastrar(m, 1800, 1000); // justo encima del centro del minimapa (1800, 900)
  assert.equal(ajuste(m, 'minimapa.angulo'), 90);
  const q = m.marco(BOTON).puntos[0];
  assert.ok(Math.abs(q.x) < 1e-6 && Math.abs(q.y - 75) < 1e-6, JSON.stringify(q));
  arrastrar(m, 1900, 900); // a la derecha
  assert.equal(ajuste(m, 'minimapa.angulo'), 0);
  arrastrar(m, 1700, 800); // abajo a la izquierda
  assert.equal(ajuste(m, 'minimapa.angulo'), 225);
  // Soltarlo deja de seguir al ratón.
  m.lua('BANCO.cursor = {x = 1800, y = 1000}');
  m.avanzar(0.1);
  assert.equal(ajuste(m, 'minimapa.angulo'), 225);
  sinErrores(m);
});

test('botón del minimapa: con minimapa cuadrado queda en el borde del cuadrado; cambiar el ajuste lo recoloca', () => {
  const m = conInicio();
  m.lua('BANCO.minimapa.forma = "SQUARE"');
  puesto(m, 'minimapa.angulo', 45);
  let p = m.marco(BOTON).puntos[0];
  assert.ok(p.x > 60 && p.x <= 75 + 1e-9 && Math.abs(p.x - p.y) < 1e-6, JSON.stringify(p));
  puesto(m, 'minimapa.angulo', 0);
  p = m.marco(BOTON).puntos[0];
  assert.ok(Math.abs(p.x - 75) < 1e-6 && Math.abs(p.y) < 1e-6, JSON.stringify(p));
  // Una esquina redonda del minimapa, en redondo.
  m.lua('BANCO.minimapa.forma = "ROUND"');
  puesto(m, 'minimapa.angulo', 45);
  p = m.marco(BOTON).puntos[0];
  assert.ok(Math.abs(p.x - 75 * Math.cos(Math.PI / 4)) < 1e-6);
  // Sin GetMinimapShape (cliente sin la convención) es redondo.
  const sin = nuevaMaquina({ sinApi: ['GetMinimapShape'] });
  const r = sin.marco(BOTON).puntos[0];
  assert.ok(Math.abs(r.x - 75 * Math.cos((225 * Math.PI) / 180)) < 1e-6);
  sinErrores(m);
  sinErrores(sin);
});

test('botón del minimapa: con minimapa.boton apagado está oculto; la casilla del panel lo enseña y lo oculta', () => {
  const m = conInicio();
  puesto(m, 'minimapa.boton', false);
  assert.equal(m.marco(BOTON).visible, false);
  puesto(m, 'minimapa.boton', true);
  assert.equal(m.marco(BOTON).visible, true);
  slash(m);
  m.lua(`${C}["minimapa.boton"]:Click()`);
  assert.equal(m.marco(BOTON).visible, false);
  const apagado = nuevaMaquina({ guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { 'minimapa.boton': false } } } });
  assert.equal(apagado.marco(BOTON).visible, false);
  sinErrores(m);
  sinErrores(apagado);
});

// ---------------------------------------------------------------------------------------------------
// Controles: el selector se cierra al pulsar fuera
// ---------------------------------------------------------------------------------------------------

test('UI.selector: pulsar fuera cierra la lista; abrirla lo activa; ocultar el selector la cierra', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.PRUEBA = {valor = "haiku"}
  SnetForever.PRUEBA.s = SnetForever.UI.selector(UIParent, "Modelo", {
    {valor = "haiku", texto = "Haiku"}, {valor = "sonnet", texto = "Sonnet"},
  }, function() return SnetForever.PRUEBA.valor end, function(v) SnetForever.PRUEBA.valor = v end)`);
  const S = 'SnetForever.PRUEBA.s';
  assert.equal(m.lua(`${S}.fondo:IsShown()`), false);
  m.lua(`${S}:Click()`);
  assert.equal(m.lua(`${S}.lista:IsShown()`), true);
  assert.equal(m.lua(`${S}.fondo:IsShown()`), true);
  m.lua(`${S}.fondo:GetScript("OnMouseDown")(${S}.fondo, "LeftButton")`);
  assert.equal(m.lua(`${S}.lista:IsShown()`), false);
  assert.equal(m.lua(`${S}.fondo:IsShown()`), false);
  assert.equal(m.lua('SnetForever.PRUEBA.valor'), 'haiku');
  // Elegir una opción también la cierra y quita el fondo.
  m.lua(`${S}:Click(); ${S}.filas[2]:Click()`);
  assert.equal(m.lua(`${S}.fondo:IsShown()`), false);
  // Ocultar el selector con la lista abierta no deja la lista ni el fondo.
  m.lua(`${S}:Click(); ${S}:Hide()`);
  assert.equal(m.lua(`${S}.lista:IsShown()`), false);
  assert.equal(m.lua(`${S}.fondo:IsShown()`), false);
  sinErrores(m);
});

// F3-34: ya no hay desplazamiento; la lista se cierra al cambiar de apartado (la sección se oculta).
test('el panel cierra las listas de sus selectores al cerrarse y al cambiar de apartado', () => {
  const m = conInicio();
  slash(m);
  elegir(m, 'idioma');
  m.lua(`${C}.idioma:Click()`);
  assert.equal(m.lua(`${C}.idioma.lista:IsShown()`), true);
  elegir(m, 'ventana');
  assert.equal(m.lua(`${C}.idioma.lista:IsShown()`), false);
  elegir(m, 'ia');
  m.lua(`${C}["ia.modelo"]:Click()`);
  slash(m);
  assert.equal(m.lua(`${C}["ia.modelo"].lista:IsShown()`), false);
  assert.equal(m.lua(`${C}["ia.modelo"].fondo:IsShown()`), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Aspecto, números y globales
// ---------------------------------------------------------------------------------------------------

test('Vigilancia 4: ningún texto del panel contiene «.0»', () => {
  for (const idioma of ['esES', 'enUS']) {
    const m = conInicio({ jugador: { idioma } });
    puesto(m, 'ventana.siguientes', 3);
    puesto(m, 'pines.cuantos', 7);
    slash(m);
    // Las etiquetas de los deslizadores con decimales («Escala: 1.00») llevan los decimales de su paso a propósito.
    // (y la línea de versiones, que trae números de versión, como el pie «SnetForever v0.3.0»)
    // F3-34: solo se ve un apartado a la vez, así que se recorren todos.
    for (const nombre of ORDEN) {
      elegir(m, nombre);
      for (const s of textos(m)) assert.ok(/: \d+\.\d+$/.test(s) || s.startsWith('Addon ') || s.startsWith('SnetForever v') || !s.includes('.0'), s);
    }
    for (const clave of ['ventana.siguientes', 'pines.cuantos', 'ventana.ancho']) {
      assert.equal(m.lua(`${C}["${clave}"].etiqueta:GetText()`).includes('.'), false, clave);
    }
    sinErrores(m);
  }
});

test('el panel y el botón solo crean globales permitidas', () => {
  const m = conInicio();
  slash(m);
  m.lua(`${C}.idioma:Click()`);
  for (const nombre of m.globalesNuevas()) assert.ok(globalPermitida(nombre), nombre);
  for (const nombre of ['SnetForeverPanel', 'SnetForeverOpciones', 'SnetForeverBotonMinimapa']) {
    assert.ok(m.globalesNuevas().includes(nombre), nombre);
  }
  sinErrores(m);
});

test('con las SavedVariables y /reload el panel sigue funcionando y recuerda el ajuste', () => {
  const m = conInicio();
  slash(m);
  m.lua(`${C}["ventana.bloqueada"]:Click()`);
  sinErrores(m);
  const r = m.recargar();
  slash(r);
  assert.equal(r.lua(`${C}["ventana.bloqueada"].marca:IsShown()`), true);
  sinErrores(r);
});

// ---------------------------------------------------------------------------------------------------
// Arreglos ronda 1
// ---------------------------------------------------------------------------------------------------

test('Motor.idPaso y Motor.existePaso: el id o la clave de respaldo «n:<n>»; la guía o el paso que faltan dan falso', () => {
  const m = conInicio();
  assert.equal(m.lua('SnetForever.Motor.idPaso({id = "abc", n = 3}, 7)'), 'abc');
  assert.equal(m.lua('SnetForever.Motor.idPaso({n = 3}, 7)'), 'n:3');
  assert.equal(m.lua('SnetForever.Motor.idPaso({}, 7)'), 'i:7');
  assert.equal(m.lua(`SnetForever.Motor.existePaso(${aLua(INICIO)}, "h0000001")`), true);
  assert.equal(m.lua(`SnetForever.Motor.existePaso(${aLua(INICIO)}, "nada")`), false);
  assert.equal(m.lua('SnetForever.Motor.existePaso("No\\\\existe", "h0000001")'), false);
  sinErrores(m);
});

test('Guias.elegirVersion cambia de guía y de ajuste; la ventana y el panel la usan', () => {
  const m = conInicio();
  m.lua('SnetForever.Guias.elegirVersion("mazmorras")');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), 'Prueba (H) Mazmorras\\01-02 Inicio');
  assert.equal(ajuste(m, 'version'), 'mazmorras');
  m.lua('SnetForever.Guias.elegirVersion("mazmorras")');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), 'Prueba (H) Mazmorras\\01-02 Inicio');
  // Los dos botones llaman a Guias.elegirVersion (no a una copia).
  m.lua('SnetForever.PRUEBA = {}; local o = SnetForever.Guias.elegirVersion; SnetForever.Guias.elegirVersion = function(v) SnetForever.PRUEBA[#SnetForever.PRUEBA + 1] = v; return o(v) end');
  slash(m);
  m.lua(`${M}.guia.normal:Click()`);
  m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "RightButton"); SnetForever.Ventana.marcos.menu.mazmorras:Click()');
  assert.deepEqual(m.lua('SnetForever.PRUEBA'), ['normal', 'mazmorras']);
  sinErrores(m);
});

test('saltados: un paso sin id (clave de respaldo «n:1») sigue vivo, con «Retomar»', () => {
  const m = nuevaMaquina(ES);
  m.ponerGuia({
    clave: 'Prueba\\01-60 Sin ids', grupo: 'Prueba', nombre: '01-60 Sin ids', titulo: { en: 'No ids', es: 'Sin ids' },
    niveles: [1, 60], siguientes: [], tipo: 'normal', fuente: { archivo: 'x', linea: 1 }, mazmorras: {},
    pasos: [{ n: 1, etiquetas: {}, requisitos: [], linea: 1, elementos: [{ t: 'nota', texto: { en: 'a', es: 'a' }, linea: 2 }] }],
  });
  m.lua('SnetForever.Guias.cargar("Prueba\\\\01-60 Sin ids")');
  m.lua('SnetForever.Motor.saltar(1)');
  assert.equal(m.lua('SnetForeverPJ.saltados[1].id'), 'n:1');
  m.lua(`${P}.abrir("saltados")`);
  const filas = filasSaltados(m);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].retomar, true);
  assert.equal(filas[0].guia.includes('(ya no existe)'), false);
  sinErrores(m);
});

test('en el lienzo: la X se oculta, /snet lo saca a UIParent (no lo cierra) y Escape no lo oculta', () => {
  const m = conInicio();
  assert.equal(m.lua('SnetForeverBotonMinimapa ~= nil'), true);
  m.lua('SnetForeverOpciones:Show()');
  assert.equal(m.marco('SnetForeverPanel').padre, 'SnetForeverOpciones');
  assert.equal(m.lua(`${M}.cerrar:IsShown()`), false);
  assert.equal(m.lua('UISpecialFrames').includes('SnetForeverPanel'), false);
  m.lua(`${P}.cerrar()`);
  assert.equal(m.marco('SnetForeverPanel').visible, true, 'cerrar() no deja la categoría en blanco');
  slash(m);
  assert.equal(m.marco('SnetForeverPanel').padre, 'UIParent');
  assert.equal(panelVisible(m), true);
  assert.equal(m.lua(`${M}.cerrar:IsShown()`), true);
  assert.equal(m.lua('UISpecialFrames').filter((n) => n === 'SnetForeverPanel').length, 1);
  slash(m);
  assert.equal(panelVisible(m), false);
  // Con el lienzo abierto, el botón del minimapa tampoco lo cierra.
  m.lua('SnetForeverOpciones:Hide(); SnetForeverOpciones:Show()');
  m.lua('BANCO.shift = true');
  m.lua('SnetForeverBotonMinimapa:Click("LeftButton")');
  assert.equal(m.marco('SnetForeverPanel').padre, 'UIParent');
  assert.equal(panelVisible(m), true);
  sinErrores(m);
});

test('botón del minimapa: TRICORNER-TOPLEFT es redondo salvo abajo a la derecha (y BOTTOMRIGHT, salvo arriba a la izquierda)', () => {
  const m = conInicio();
  m.lua('BANCO.minimapa.forma = "TRICORNER-TOPLEFT"');
  puesto(m, 'minimapa.angulo', 135); // arriba a la izquierda: redondo
  let p = m.marco(BOTON).puntos[0];
  assert.ok(Math.abs(p.x - 75 * Math.cos((135 * Math.PI) / 180)) < 1e-6, JSON.stringify(p));
  puesto(m, 'minimapa.angulo', 315); // abajo a la derecha: cuadrado
  p = m.marco(BOTON).puntos[0];
  const diagonal = Math.sqrt(2 * 75 * 75) - 10;
  assert.ok(Math.abs(p.x - diagonal * Math.cos(Math.PI / 4)) < 1e-6, JSON.stringify(p));
  m.lua('BANCO.minimapa.forma = "TRICORNER-BOTTOMRIGHT"');
  puesto(m, 'minimapa.angulo', 135); // arriba a la izquierda: aquí es el cuadrado
  p = m.marco(BOTON).puntos[0];
  assert.ok(Math.abs(p.x + diagonal * Math.cos(Math.PI / 4)) < 1e-6, JSON.stringify(p));
  puesto(m, 'minimapa.angulo', 225); // abajo a la izquierda: redondo
  p = m.marco(BOTON).puntos[0];
  assert.ok(Math.abs(p.x - 75 * Math.cos((225 * Math.PI) / 180)) < 1e-6, JSON.stringify(p));
  sinErrores(m);
});

// Tarea 22 (error real en el juego, al entrar con una guía guardada): «ui/panel.lua:582: attempt to index field
// 'actual' (a nil value)». El cliente resuelve la disposición al preguntar un tamaño (GetWidth en crearColumna) y lanza
// el OnSizeChanged del panel, que pintaba antes de que existieran sus secciones. BANCO.disposicionDiferida lo imita.
test('al crear el panel con la disposición diferida (OnSizeChanged a medio construir) no hay error', () => {
  const m = nuevaMaquina({ arrancar: false, guardado: { SnetForeverPJ: { esquema: 1, guia: INICIO } } });
  m.lua('BANCO.disposicionDiferida = true');
  m.disparar('ADDON_LOADED', 'SnetForever');
  m.disparar('PLAYER_LOGIN');
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  sinErrores(m);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), INICIO);
  slash(m);
  assert.equal(panelVisible(m), true);
  assert.ok(m.lua(`${M}.guia.actual:GetText()`).length > 0, 'la guía actual se pinta al abrirlo');
  sinErrores(m);
});

// Tarea D1: tema de la ventana y «Objetivos cercanos»
test('the Window options have an iron plate, copper controls and a saved favorite view', () => {
  const m = conInicio();
  m.lua('SnetForever.Panel.abrir("ventana")');
  const favorite = `${C}["guide.favorite"]`;
  const asset = 'Interface\\AddOns\\SnetForever\\recursos\\forge-plate';
  assert.equal(m.lua(`${M}.raiz.snfForgePlate:GetTexture()`), asset);
  assert.match(m.lua(`(${M}.titulo:GetFont())`), /AlegreyaSC-Bold\.ttf$/);
  assert.match(m.lua(`(${favorite}.texto:GetFont())`), /BarlowSemiCondensed-SemiBold\.ttf$/);
  for (const label of [`${M}.tarjetas.ventana.texto`, `${M}.tarjetas.saltados.texto`, `${favorite}.texto`, `${C}["ventana.tema"].texto`]) {
    const [width, height, textWidth, textHeight] = m.lua(`{${label}:GetWidth(), ${label}:GetHeight(), ${label}:GetUnboundedStringWidth(), ${label}:GetStringHeight()}`);
    assert.ok(textWidth > 0 && textWidth <= width && textHeight > 0 && textHeight <= height, label);
  }
  puesto(m, 'ventana.alfa', 0.5);
  assert.equal(m.lua(`select(4, ${M}.raiz.snfForgePlate:GetVertexColor())`), 0.5);
  assert.equal(m.lua(`${C}["ventana.escala"]:GetThumbTexture():GetTexture()`), 'Interface\\AddOns\\SnetForever\\recursos\\forge-controls');
  assert.equal(m.lua(`${favorite}.texto:GetText()`), 'Vista favorita: Automática');
  m.lua(`${favorite}:Click()`);
  assert.equal(m.lua(`${favorite}.lista:IsVisible()`), true);
  m.lua(`${favorite}.filas[4]:Click()`);
  assert.equal(ajuste(m, 'guide.favorite'), 'chart');
  assert.equal(m.lua('SnetForever.GuideViews.mode()'), 'chart');
  assert.equal(m.lua(`${favorite}.texto:GetText()`), 'Vista favorita: Carta');
  assert.equal(m.lua(`${favorite}.lista:IsShown()`), false);
  sinErrores(m);
  const reloaded = m.recargar();
  assert.equal(reloaded.lua('SnetForever.GuideViews.mode()'), 'chart');
  reloaded.lua('SnetForever.Panel.abrir("ventana")');
  assert.equal(reloaded.lua(`${favorite}.texto:GetText()`), 'Vista favorita: Carta');
  reloaded.lua(`${favorite}.filas[1]:Click()`);
  assert.equal(ajuste(reloaded, 'guide.favorite'), 'auto');
  sinErrores(reloaded);
});

test('selector de tema en «Ventana»: Forja por defecto; «Neutro» cambia el ajuste y repinta la ventana', () => {
  const m = conInicio();
  slash(m);
  assert.equal(m.lua(`${C}["ventana.tema"]:GetParent() == ${M}.secciones.ventana`), true);
  assert.equal(m.lua(`${C}["ventana.tema"].texto:GetText()`), 'Tema: Forja');
  assert.equal(m.lua(`${C}["ventana.tema"].filas[2].texto:GetText()`), 'Neutro');
  m.lua(`${C}["ventana.tema"].filas[2]:Click()`);
  assert.equal(ajuste(m, 'ventana.tema'), 'neutro');
  assert.equal(m.lua(`${C}["ventana.tema"].texto:GetText()`), 'Tema: Neutro');
  const [r, g, b] = m.lua('{SnetForever.Ventana.marcos.lista.snfFondo:GetVertexColor()}');
  assert.ok(Math.abs(r - 0x19 / 255) < 1e-6 && Math.abs(g - 0x19 / 255) < 1e-6 && Math.abs(b - 0x19 / 255) < 1e-6);
  m.lua(`${C}["ventana.tema"].filas[1]:Click()`);
  assert.equal(ajuste(m, 'ventana.tema'), 'forge');
  sinErrores(m);
});

test('casilla «Paso activo encima de la cabecera» (ventana.pasoArriba) en «Ventana», activada y se apaga', () => {
  const m = conInicio();
  slash(m);
  assert.equal(m.lua(`${C}["ventana.pasoArriba"]:GetParent() == ${M}.secciones.ventana`), true);
  assert.equal(m.lua(`${C}["ventana.pasoArriba"].marca:IsShown()`), true);
  m.lua(`${C}["ventana.pasoArriba"]:Click()`);
  assert.equal(ajuste(m, 'ventana.pasoArriba'), false);
  sinErrores(m);
});

test('sección «Objetivos cercanos»: casillas activo, marcaPlaca y soloCercanos y deslizador de escala 0,6-1,6', () => {
  const m = conInicio();
  slash(m);
  const sec = `${M}.secciones.objetivos`;
  for (const clave of ['objetivos.activo', 'objetivos.marcaPlaca', 'objetivos.soloCercanos', 'objetivos.escala']) {
    assert.equal(m.lua(`${C}[${aLua(clave)}]:GetParent() == ${sec}`), true, clave);
  }
  assert.equal(m.lua(`${C}["objetivos.activo"].marca:IsShown()`), true);
  assert.equal(m.lua(`${C}["objetivos.marcaPlaca"].marca:IsShown()`), true);
  assert.equal(m.lua(`${C}["objetivos.soloCercanos"].marca:IsShown()`), false);
  m.lua(`${C}["objetivos.activo"]:Click()`);
  m.lua(`${C}["objetivos.marcaPlaca"]:Click()`);
  m.lua(`${C}["objetivos.soloCercanos"]:Click()`);
  assert.equal(ajuste(m, 'objetivos.activo'), false);
  assert.equal(ajuste(m, 'objetivos.marcaPlaca'), false);
  assert.equal(ajuste(m, 'objetivos.soloCercanos'), true);
  assert.deepEqual(m.lua(`{${C}["objetivos.escala"]:GetMinMaxValues()}`), [0.6, 1.6]);
  m.lua(`${C}["objetivos.escala"]:SetValue(1.3)`);
  assert.equal(ajuste(m, 'objetivos.escala'), 1.3);
  assert.equal(m.lua(`${C}["objetivos.escala"].etiqueta:GetText()`), 'Escala: 1.30');
  m.lua(`${C}["objetivos.escala"]:GetScript("OnValueChanged")(${C}["objetivos.escala"], 9)`);
  assert.equal(ajuste(m, 'objetivos.escala'), 1.6);
  sinErrores(m);
});

test('ronda 1: en un lienzo de 600×400 el panel se encoge para caber; en uno de 900×600 va a escala 1; suelto, a 1', () => {
  const m = conInicio();
  const escala = () => m.lua('SnetForeverPanel:GetScale()');
  const cambiar = (w, h) => m.lua(`SnetForeverOpciones:SetSize(${w}, ${h}); SnetForeverOpciones:GetScript("OnSizeChanged")(SnetForeverOpciones, ${w}, ${h})`);
  m.lua('SnetForeverOpciones:SetSize(600, 400)');
  m.lua('SnetForeverOpciones:Show()');
  assert.ok(Math.abs(escala() - Math.min(600 / 640, 400 / 420)) < 1e-9, String(escala()));
  // Encogido, el panel queda dentro del lienzo.
  assert.ok(640 * escala() <= 600 + 1e-9 && 420 * escala() <= 400 + 1e-9);
  assert.deepEqual([m.marco('SnetForeverPanel').ancho, m.marco('SnetForeverPanel').alto], [640, 420]);
  // El lienzo cambia de tamaño: la escala se recalcula (nunca pasa de 1).
  cambiar(900, 600);
  assert.equal(escala(), 1);
  cambiar(600, 400);
  assert.ok(escala() < 1);
  // Suelto otra vez: escala 1.
  slash(m);
  assert.equal(m.marco('SnetForeverPanel').padre, 'UIParent');
  assert.equal(escala(), 1);
  // Con el panel fuera del lienzo, un cambio de tamaño del lienzo no lo toca.
  cambiar(300, 200);
  assert.equal(escala(), 1);
  // Lienzo grande desde el principio.
  const g = conInicio();
  g.lua('SnetForeverOpciones:SetSize(900, 600); SnetForeverOpciones:Show()');
  assert.equal(g.lua('SnetForeverPanel:GetScale()'), 1);
  assert.deepEqual(g.marco('SnetForeverPanel').puntos.map((p) => [p.punto, p.relativo]), [['TOPLEFT', 'SnetForeverOpciones']]);
  sinErrores(m);
  sinErrores(g);
});

test('ronda 1: pulsar una tarjeta guarda panel.apartado sin repintar la ventana de la guía', () => {
  const m = conInicio();
  slash(m);
  m.lua(`SnetForever.PRUEBA = {pintar = 0, avisos = 0}
    local o = SnetForever.Ventana.pintar
    SnetForever.Ventana.pintar = function(...) SnetForever.PRUEBA.pintar = SnetForever.PRUEBA.pintar + 1; return o(...) end
    SnetForever.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
      if clave == "panel.apartado" then SnetForever.PRUEBA.avisos = SnetForever.PRUEBA.avisos + 1 end
    end)`);
  for (const nombre of ['flecha', 'ia', 'ia', 'guia']) elegir(m, nombre);
  assert.equal(m.lua('SnetForever.PRUEBA.pintar'), 0);
  assert.equal(m.lua('SnetForever.PRUEBA.avisos'), 0);
  assert.equal(ajuste(m, 'panel.apartado'), 'guia');
  assert.equal(m.lua('SnetForeverPJ.ajustes["panel.apartado"]'), 'guia');
  // Un ajuste de verdad sí repinta la ventana (el filtro no se come los demás).
  m.lua(`${C}["ventana.bloqueada"]:Click()`);
  assert.ok(m.lua('SnetForever.PRUEBA.pintar') > 0);
  sinErrores(m);
});

test('ronda 1: el repintado solo dispone el apartado elegido', () => {
  const m = conInicio();
  m.lua('SnetForever.Motor.saltar(1)');
  slash(m);
  elegir(m, 'ventana');
  m.lua(`SnetForever.PRUEBA = {saltados = 0, avisos = 0}
    for _, n in ipairs({"saltados", "avisos"}) do
      local s = ${M}.secciones[n]
      local o = s.dinamico
      s.dinamico = function(...) SnetForever.PRUEBA[n] = SnetForever.PRUEBA[n] + 1; return o(...) end
    end`);
  m.lua(`${C}["ventana.alfa"]:SetValue(0.5)`);
  m.lua(`${C}["ventana.escala"]:SetValue(1.2)`);
  assert.deepEqual(m.lua('SnetForever.PRUEBA'), { saltados: 0, avisos: 0 });
  // Los títulos de los apartados ocultos siguen al idioma aunque no se dispongan.
  puesto(m, 'idioma', 'en');
  assert.equal(tituloDe(m, 'saltados'), 'Skipped steps');
  assert.equal(m.lua('SnetForever.PRUEBA.saltados'), 0);
  // Al elegirlo se dispone (y se ve su fila).
  elegir(m, 'saltados');
  assert.ok(m.lua('SnetForever.PRUEBA.saltados') >= 1);
  assert.equal(filasSaltados(m).length, 1);
  sinErrores(m);
});

test('ronda 1: «<» y «>» desactivados se ven en gris (alfa 0,4); activos, a 1', () => {
  const m = conInicio();
  m.lua(`for k = 1, 30 do SnetForeverPJ.saltados[k] = {clave = "Guia\\\\Vieja " .. k, id = "x" .. k, n = k,
    resumen = "Resumen " .. k, fecha = "2026-11-01 10:00"} end`);
  m.lua(`${P}.abrir("saltados")`);
  const pag = `${M}.paginas.saltados`;
  assert.equal(m.lua(`${pag}.anterior:GetAlpha()`), 0.4);
  assert.equal(m.lua(`${pag}.siguiente:GetAlpha()`), 1);
  m.lua(`${pag}.siguiente:Click()`);
  assert.equal(m.lua(`${pag}.anterior:GetAlpha()`), 1);
  for (let k = 0; k < 30 && m.lua(`${pag}.siguiente:IsEnabled()`); k++) m.lua(`${pag}.siguiente:Click()`);
  assert.equal(m.lua(`${pag}.siguiente:GetAlpha()`), 0.4);
  sinErrores(m);
});

test('ronda 1: una tarjeta bajo el ratón sigue resaltada aunque el panel se repinte', () => {
  const m = conInicio();
  slash(m);
  const color = (n) => m.lua(`{${M}.tarjetas.${n}.snfFondo:GetVertexColor()}`).slice(0, 3);
  const token = (t) => m.lua(`SnetForever.Estilo.color(${aLua(t)})`).slice(0, 3);
  m.lua(`${M}.tarjetas.pines:GetScript("OnEnter")(${M}.tarjetas.pines)`);
  m.lua(`${C}["ventana.bloqueada"]:Click()`); // repinta el panel
  assert.notDeepEqual(color('pines'), token('fondoLista'));
  assert.deepEqual(m.lua(`{${M}.tarjetas.pines.texto:GetTextColor()}`).slice(0, 3), token('texto'));
  m.lua(`${M}.tarjetas.pines:GetScript("OnLeave")(${M}.tarjetas.pines)`);
  m.lua(`${C}["ventana.bloqueada"]:Click()`);
  assert.deepEqual(color('pines'), token('fondoLista'));
  sinErrores(m);
});

test('ronda 1: «Objetivos cercanos» lleva la espada del marco de objetivos (INV_Sword_04), no Ability_Hunter_SniperShot', () => {
  const m = conInicio();
  slash(m);
  assert.equal(m.lua(`${M}.tarjetas.objetivos.icono:GetTexture()`), 'Interface\\Icons\\INV_Sword_04');
  sinErrores(m);
});
