// «Avisar de un fallo» (ui/fallo.lua), estilo y controles propios (ui/estilo.lua, ui/controles.lua), tarea 15 (O12).
// El mapa 1411 del banco: ver src/wow-falso.lua. El jugador por defecto es un orco guerrero de nivel 1 llamado Prueba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, globalPermitida, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const EN = { guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } } };

// Ronda 1 de T1: goto objetivo (un paso de solo goto flecha ya está hecho y se pasa al cargar).
const IR = (x, y, en, es) => ({ t: 'goto', mapa: 1411, x, y, modo: 'objetivo', texto: { en: `Go ${en}`, es: `Ve ${es}` } });

function conGuia(opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.ponerGuia(guiaDePrueba([
    { elementos: [IR(40, 60, 'one', 'uno')] },
    { elementos: [IR(41, 61, 'two', 'dos')] },
    { elementos: [IR(42, 62, 'three', 'tres')] },
  ]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  return m;
}

const fallos = (m) => m.lua('SnetForeverCuenta.fallos');
const pulsarGuardar = (m) => m.lua('SnetForeverFallo.botonGuardar:Click()');
const escribir = (m, texto) => m.lua(`SnetForeverFallo.caja:SetText(${aLua(texto)})`);

// ---------------------------------------------------------------------------------------------------
// Banco: lo nuevo de la tarea 15
// ---------------------------------------------------------------------------------------------------

test('banco: EditBox recorta al máximo de letras (caracteres, no bytes) y lanza OnTextChanged y los de foco', () => {
  const m = nuevaMaquina();
  m.lua(`local e = CreateFrame("EditBox", "SnetForeverPruebaE", UIParent)
  SnetForever.CUENTA = {texto = 0, ganado = 0, perdido = 0}
  e:SetScript("OnTextChanged", function() SnetForever.CUENTA.texto = SnetForever.CUENTA.texto + 1 end)
  e:SetScript("OnEditFocusGained", function() SnetForever.CUENTA.ganado = SnetForever.CUENTA.ganado + 1 end)
  e:SetScript("OnEditFocusLost", function() SnetForever.CUENTA.perdido = SnetForever.CUENTA.perdido + 1 end)
  e:SetMultiLine(true); e:SetMaxLetters(3); e:SetAutoFocus(false)`);
  m.lua('SnetForeverPruebaE:SetText("ñañaña")');
  assert.equal(m.lua('SnetForeverPruebaE:GetText()'), 'ñañ');
  assert.equal(m.lua('SnetForeverPruebaE:GetText()').length, 3);
  assert.equal(m.lua('SnetForeverPruebaE:IsMultiLine()'), true);
  m.lua('SnetForeverPruebaE:SetFocus(); SnetForeverPruebaE:SetFocus(); SnetForeverPruebaE:ClearFocus()');
  assert.deepEqual(m.lua('SnetForever.CUENTA'), { texto: 1, ganado: 1, perdido: 1 });
  assert.equal(m.lua('SnetForeverPruebaE:HasFocus()'), false);
  assert.throws(() => m.lua('SnetForeverPruebaE:SetScript("OnClick", function() end)'), /no imitado: script OnClick/);
  sinErrores(m);
});

test('banco: Button.Click lanza OnClick solo si está activo; Slider ajusta al paso y avisa solo si cambia', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.CUENTA = {clics = 0, valores = {}}
  local b = CreateFrame("Button", "SnetForeverPruebaB", UIParent)
  b:SetScript("OnClick", function() SnetForever.CUENTA.clics = SnetForever.CUENTA.clics + 1 end)
  b:Click(); b:Disable(); b:Click(); b:Enable(); b:Click()
  local s = CreateFrame("Slider", "SnetForeverPruebaS", UIParent)
  s:SetMinMaxValues(0, 10); s:SetValueStep(0.5)
  s:SetScript("OnValueChanged", function(_, v) table.insert(SnetForever.CUENTA.valores, v) end)
  s:SetValue(3.2); s:SetValue(3.3); s:SetValue(99); s:SetValue(-4)`);
  assert.deepEqual(m.lua('SnetForever.CUENTA'), { clics: 2, valores: [3, 3.5, 10, 0] });
  assert.equal(m.lua('SnetForeverPruebaS:GetValue()'), 0);
  assert.deepEqual(m.lua('{SnetForeverPruebaS:GetMinMaxValues()}'), [0, 10]);
  sinErrores(m);
});

test('banco: date da una fecha fija y UISpecialFrames y GameFontNormal existen', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('date("%Y-%m-%d %H:%M")'), '2026-11-09 12:00');
  assert.equal(m.lua('type(UISpecialFrames)'), 'table');
  assert.deepEqual(m.lua('{GameFontNormal:GetFont()}'), ['Fonts\\FRIZQT__.TTF', 12, '']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Fallo
// ---------------------------------------------------------------------------------------------------

test('abrir(2), texto y Guardar: el aviso lleva guía, paso, versiones, personaje y posición; cierra y avisa en el chat', () => {
  const m = conGuia();
  m.jugador({ mapa: 1411, x: 43.29, y: 68.53 });
  m.lua('SnetForever.Fallo.abrir(2)');
  assert.equal(m.marco('SnetForeverFallo').visible, true);
  assert.equal(m.lua('SnetForeverFallo.titulo:GetText()'), 'Avisar de un fallo');
  assert.match(m.lua('SnetForeverFallo.etiquetaPaso:GetText()'), /^Paso 2: Ve dos/);
  assert.equal(m.lua('SnetForeverFallo.caja:HasFocus()'), true);
  escribir(m, 'No sale el PNJ');
  assert.equal(m.lua('SnetForeverFallo.contador:GetText()'), '14/500');
  pulsarGuardar(m);

  const lista = fallos(m);
  assert.equal(lista.length, 1);
  assert.deepEqual(lista[0], {
    fecha: '2026-11-09 12:00',
    personaje: 'Prueba',
    nivel: 1,
    raza: 'Orc',
    clase: 'WARRIOR',
    faccion: 'Horde',
    guia: CLAVE,
    paso: 'p2',
    n: 2,
    addon: '0.7.0',
    datos: { rutas: '2026.11.09.1', misiones: '2026.11.09.1' },
    texto: 'No sale el PNJ',
    pos: { mapa: 1411, x: 43.29, y: 68.53 },
  });
  assert.equal(m.marco('SnetForeverFallo').visible, false);
  assert.equal(m.lua('SnetForeverFallo.caja:HasFocus()'), false);
  assert.deepEqual(m.llamadas('print'), [['Aviso guardado. Gracias']]);
  sinErrores(m);
});

test('el diálogo va en la capa DIALOG, toplevel, por encima del panel (tarea 22)', () => {
  const m = conGuia();
  m.lua('SnetForever.Fallo.abrir(2)');
  assert.equal(m.lua('SnetForeverFallo:GetFrameStrata()'), 'DIALOG');
  assert.equal(m.lua('SnetForeverFallo:IsToplevel()'), true);
  sinErrores(m);
});

test('Cancelar y Escape cierran sin guardar; SnetForeverFallo está en UISpecialFrames', () => {
  const m = conGuia();
  m.lua('SnetForever.Fallo.abrir(1)');
  escribir(m, 'algo');
  m.lua('SnetForeverFallo.botonCancelar:Click()');
  assert.equal(m.marco('SnetForeverFallo').visible, false);
  m.lua('SnetForever.Fallo.abrir(1)');
  assert.equal(m.lua('SnetForeverFallo.caja:GetText()'), '');
  m.lua('SnetForeverFallo.caja:GetScript("OnEscapePressed")(SnetForeverFallo.caja)');
  assert.equal(m.marco('SnetForeverFallo').visible, false);
  assert.equal(fallos(m).length, 0);
  // Otros marcos del addon (el panel, desde la tarea 20) también están en la lista: aquí solo cuenta el del diálogo.
  const veces = () => m.lua('UISpecialFrames').filter((n) => n === 'SnetForeverFallo').length;
  assert.equal(veces(), 1);
  m.lua('SnetForever.Fallo.abrir(1)');
  assert.equal(veces(), 1);
  sinErrores(m);
});

test('texto vacío o solo espacios: no se guarda, da falso y el diálogo sigue abierto', () => {
  const m = conGuia();
  m.lua('SnetForever.Fallo.abrir(2)');
  escribir(m, '   ');
  pulsarGuardar(m);
  assert.equal(m.lua('SnetForever.Fallo.guardar("   ")'), false);
  assert.equal(m.lua('SnetForever.Fallo.guardar("")'), false);
  assert.equal(m.lua('SnetForever.Fallo.guardar(nil)'), false);
  assert.equal(fallos(m).length, 0);
  assert.equal(m.marco('SnetForeverFallo').visible, true);
  assert.deepEqual(m.llamadas('print'), []);
  sinErrores(m);
});

test('dentro de una instancia el aviso no lleva pos', () => {
  const m = conGuia();
  m.jugador({ enInstancia: true });
  assert.equal(m.lua('SnetForever.Fallo.guardar("Dentro de la mazmorra")'), true);
  const [aviso] = fallos(m);
  assert.equal(aviso.texto, 'Dentro de la mazmorra');
  assert.equal(aviso.pos, undefined);
  assert.equal(aviso.guia, CLAVE);
  sinErrores(m);
});

test('600 caracteres: se guardan 500 (también con caracteres de varios bytes)', () => {
  const m = conGuia();
  assert.equal(m.lua(`SnetForever.Fallo.guardar(${aLua('a'.repeat(600))})`), true);
  assert.equal(m.lua(`SnetForever.Fallo.guardar(${aLua('ñ'.repeat(600))})`), true);
  const [a, b] = fallos(m);
  assert.equal(a.texto, 'a'.repeat(500));
  assert.equal(b.texto, 'ñ'.repeat(500));
  // El cuadro de texto también tiene el límite.
  m.lua('SnetForever.Fallo.abrir(1)');
  escribir(m, 'b'.repeat(600));
  assert.equal(m.lua('SnetForeverFallo.caja:GetText()').length, 500);
  assert.equal(m.lua('SnetForeverFallo.contador:GetText()'), '500/500');
  sinErrores(m);
});

test('el aviso se guarda sin espacios sobrantes', () => {
  const m = conGuia();
  m.lua('SnetForever.Fallo.guardar("  falta el objetivo \\n")');
  assert.equal(fallos(m)[0].texto, 'falta el objetivo');
  sinErrores(m);
});

test('tras recargar() el aviso sigue en SnetForeverCuenta.fallos', () => {
  const m = conGuia();
  m.jugador({ mapa: 1411, x: 43.29, y: 68.53 });
  m.lua('SnetForever.Fallo.abrir(2)');
  escribir(m, 'No sale el PNJ');
  pulsarGuardar(m);
  const m2 = m.recargar();
  const lista = m2.lua('SnetForeverCuenta.fallos');
  assert.equal(lista.length, 1);
  assert.equal(lista[0].texto, 'No sale el PNJ');
  assert.equal(lista[0].paso, 'p2');
  assert.deepEqual(lista[0].pos, { mapa: 1411, x: 43.29, y: 68.53 });
  sinErrores(m2);
});

test('con idioma en, el botón dice «Save» y el título «Report a problem»; con es, «Guardar»', () => {
  const m = conGuia(EN);
  m.lua('SnetForever.Fallo.abrir(2)');
  assert.equal(m.lua('SnetForeverFallo.botonGuardar.texto:GetText()'), 'Save');
  assert.equal(m.lua('SnetForeverFallo.botonCancelar.texto:GetText()'), 'Cancel');
  assert.equal(m.lua('SnetForeverFallo.titulo:GetText()'), 'Report a problem');
  assert.match(m.lua('SnetForeverFallo.etiquetaPaso:GetText()'), /^Step 2: Go two/);
  escribir(m, 'It does not work');
  pulsarGuardar(m);
  assert.deepEqual(m.llamadas('print'), [['Report saved. Thank you']]);
  // Al cambiar el idioma con el diálogo ya creado, el siguiente abrir lo pone al día.
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua('SnetForever.Fallo.abrir(2)');
  assert.equal(m.lua('SnetForeverFallo.botonGuardar.texto:GetText()'), 'Guardar');
  sinErrores(m);
});

test('sin guía cargada o con un paso que no existe, el aviso se guarda sin guia/paso', () => {
  const m = nuevaMaquina({ entrar: false }); // sin entrar al mundo: el arranque aún no ha cargado la guía
  m.lua('SnetForever.Fallo.abrir()');
  assert.equal(m.lua('SnetForeverFallo.etiquetaPaso:GetText()'), 'Sin paso activo');
  escribir(m, 'No hay guía');
  pulsarGuardar(m);
  const [aviso] = fallos(m);
  assert.equal(aviso.texto, 'No hay guía');
  assert.equal(aviso.guia, undefined);
  assert.equal(aviso.paso, undefined);
  assert.equal(aviso.n, undefined);
  assert.equal(aviso.personaje, 'Prueba');

  const m2 = conGuia();
  m2.lua('SnetForever.Fallo.abrir(99)');
  escribir(m2, 'Paso fuera de la guía');
  pulsarGuardar(m2);
  const [fuera] = fallos(m2);
  assert.equal(fuera.guia, CLAVE);
  assert.equal(fuera.paso, undefined);
  assert.equal(fuera.n, undefined);

  // Sin argumento: el paso actual del motor.
  const m3 = conGuia();
  m3.lua('SnetForever.Fallo.abrir()');
  escribir(m3, 'Paso actual');
  pulsarGuardar(m3);
  assert.equal(fallos(m3)[0].paso, 'p1');
  sinErrores(m);
  sinErrores(m2);
  sinErrores(m3);
});

test('el diálogo no crea globales fuera de las permitidas', () => {
  const m = conGuia();
  m.lua('SnetForever.Fallo.abrir(1)');
  const malas = (m.globalesNuevas() || []).filter((g) => !globalPermitida(g));
  assert.deepEqual(malas, []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Estilo
// ---------------------------------------------------------------------------------------------------

test('Estilo.fondo: fondo WHITE8X8 con el alfa de ventana.alfa, borde de 1 px y cambio de alfa en vivo', () => {
  const m = nuevaMaquina();
  m.lua('SnetForeverPruebaF = CreateFrame("Frame", "SnetForeverPruebaF", UIParent); SnetForever.Estilo.fondo(SnetForeverPruebaF)');
  assert.equal(m.lua('SnetForeverPruebaF.snfFondo:GetTexture()'), 'Interface\\Buttons\\WHITE8X8');
  const [fr, fg, fb, fa] = m.lua('{SnetForeverPruebaF.snfFondo:GetVertexColor()}');
  assert.ok(Math.abs(fr - 0x19 / 255) < 1e-6 && Math.abs(fg - 0x17 / 255) < 1e-6 && Math.abs(fb - 0x17 / 255) < 1e-6);
  assert.equal(fa, 0.92);
  assert.equal(m.lua('#SnetForeverPruebaF.snfBordes'), 4);
  const [br, bg, bb, ba] = m.lua('{SnetForeverPruebaF.snfBordes[1]:GetVertexColor()}');
  assert.ok(Math.abs(br - 0x77 / 255) < 1e-6 && Math.abs(bg - 0x57 / 255) < 1e-6 && Math.abs(bb - 0x44 / 255) < 1e-6);
  assert.equal(ba, 1);
  assert.equal(m.lua('SnetForeverPruebaF.snfBordes[1]:GetHeight()'), 1);
  assert.equal(m.lua('SnetForeverPruebaF.snfBordes[3]:GetWidth()'), 1);
  // Un segundo fondo no duplica las texturas.
  m.lua('SnetForever.Estilo.fondo(SnetForeverPruebaF)');
  assert.equal(m.lua('#{SnetForeverPruebaF:GetRegions()}'), 5);
  m.lua('SnetForever.Ajustes.set("ventana.alfa", 0.5)');
  assert.equal(m.lua('({SnetForeverPruebaF.snfFondo:GetVertexColor()})[4]'), 0.5);
  sinErrores(m);
});

test('Estilo.fuente y TAMANOS', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('SnetForever.Estilo.TAMANOS'), { titulo: 11, paso: 11, lista: 10, pequeno: 9 });
  m.lua('SnetForeverPruebaT = SnetForever.UI.texto(UIParent, 10)');
  assert.deepEqual(m.lua('{SnetForeverPruebaT:GetFont()}'), ['Fonts\\FRIZQT__.TTF', 10, '']);
  assert.deepEqual(m.lua('{SnetForeverPruebaT:GetTextColor()}'), [245 / 255, 232 / 255, 212 / 255, 1]);
  assert.equal(m.lua('type(SnetForeverPruebaT.refrescar)'), 'function');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------------------------------

test('UI.boton: texto fijo o por función, alPulsar con el botón y refrescar', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.PRUEBA = {clics = 0, nombre = "uno"}
  local b = SnetForever.UI.boton(UIParent, function() return SnetForever.PRUEBA.nombre end, function(boton)
    SnetForever.PRUEBA.clics = SnetForever.PRUEBA.clics + 1
    SnetForever.PRUEBA.recibido = boton
  end)
  SnetForever.PRUEBA.b = b`);
  assert.equal(m.lua('SnetForever.PRUEBA.b.texto:GetText()'), 'uno');
  m.lua('SnetForever.PRUEBA.b:Click()');
  assert.equal(m.lua('SnetForever.PRUEBA.clics'), 1);
  assert.equal(m.lua('SnetForever.PRUEBA.recibido == SnetForever.PRUEBA.b'), true);
  m.lua('SnetForever.PRUEBA.nombre = "dos"; SnetForever.PRUEBA.b.refrescar()');
  assert.equal(m.lua('SnetForever.PRUEBA.b.texto:GetText()'), 'dos');
  assert.equal(m.lua('SnetForever.UI.boton(UIParent, "fijo", nil).texto:GetText()'), 'fijo');
  sinErrores(m);
});

test('UI.casilla: la marca sigue a get(), el clic llama a set(nuevo) y refrescar la pone al día', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.PRUEBA = {valor = false}
  SnetForever.PRUEBA.c = SnetForever.UI.casilla(UIParent, "Activa", function() return SnetForever.PRUEBA.valor end,
    function(v) SnetForever.PRUEBA.valor = v end)`);
  assert.equal(m.lua('SnetForever.PRUEBA.c.marca:IsShown()'), false);
  assert.equal(m.lua('SnetForever.PRUEBA.c.texto:GetText()'), 'Activa');
  m.lua('SnetForever.PRUEBA.c:Click()');
  assert.equal(m.lua('SnetForever.PRUEBA.valor'), true);
  assert.equal(m.lua('SnetForever.PRUEBA.c.marca:IsShown()'), true);
  m.lua('SnetForever.PRUEBA.valor = false; SnetForever.PRUEBA.c.refrescar()');
  assert.equal(m.lua('SnetForever.PRUEBA.c.marca:IsShown()'), false);
  sinErrores(m);
});

test('UI.deslizador: Slider con rango y paso, set solo con cambios del usuario y etiqueta sin «.0»', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.PRUEBA = {valor = 7, llamadas = {}}
  SnetForever.PRUEBA.d = SnetForever.UI.deslizador(UIParent, "Cuántos", 1, 15, 1,
    function() return SnetForever.PRUEBA.valor end,
    function(v) SnetForever.PRUEBA.valor = v; table.insert(SnetForever.PRUEBA.llamadas, v) end)
  SnetForever.PRUEBA.a = SnetForever.UI.deslizador(UIParent, "Alfa", 0.2, 1, 0.05,
    function() return 0.85 end, function() end)`);
  assert.equal(m.lua('SnetForever.PRUEBA.d:GetObjectType()'), 'Slider');
  assert.equal(m.lua('SnetForever.PRUEBA.d:GetValue()'), 7);
  assert.equal(m.lua('SnetForever.PRUEBA.d.etiqueta:GetText()'), 'Cuántos: 7');
  assert.equal(m.lua('SnetForever.PRUEBA.a.etiqueta:GetText()'), 'Alfa: 0.85');
  assert.deepEqual(m.lua('{SnetForever.PRUEBA.d:GetMinMaxValues()}'), [1, 15]);
  // El usuario mueve el control: se llama a set.
  m.lua('SnetForever.PRUEBA.d:SetValue(9.4)');
  assert.deepEqual(m.lua('SnetForever.PRUEBA.llamadas'), [9]);
  assert.equal(m.lua('SnetForever.PRUEBA.d.etiqueta:GetText()'), 'Cuántos: 9');
  // refrescar no llama a set.
  m.lua('SnetForever.PRUEBA.valor = 3; SnetForever.PRUEBA.d.refrescar()');
  assert.deepEqual(m.lua('SnetForever.PRUEBA.llamadas'), [9]);
  assert.equal(m.lua('SnetForever.PRUEBA.d:GetValue()'), 3);
  assert.equal(m.lua('SnetForever.PRUEBA.d.etiqueta:GetText()'), 'Cuántos: 3');
  sinErrores(m);
});

test('UI.selector: la lista propia se abre, elegir llama a set, cierra y cambia la etiqueta', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.PRUEBA = {valor = "haiku"}
  SnetForever.PRUEBA.s = SnetForever.UI.selector(UIParent, "Modelo", {
    {valor = "haiku", texto = "Haiku"}, {valor = "sonnet", texto = function() return "Sonnet" end},
  }, function() return SnetForever.PRUEBA.valor end, function(v) SnetForever.PRUEBA.valor = v end)`);
  assert.equal(m.lua('SnetForever.PRUEBA.s.texto:GetText()'), 'Modelo: Haiku');
  assert.equal(m.lua('SnetForever.PRUEBA.s.lista:IsShown()'), false);
  m.lua('SnetForever.PRUEBA.s:Click()');
  assert.equal(m.lua('SnetForever.PRUEBA.s.lista:IsShown()'), true);
  assert.equal(m.lua('SnetForever.PRUEBA.s.filas[2].texto:GetText()'), 'Sonnet');
  m.lua('SnetForever.PRUEBA.s.filas[2]:Click()');
  assert.equal(m.lua('SnetForever.PRUEBA.valor'), 'sonnet');
  assert.equal(m.lua('SnetForever.PRUEBA.s.lista:IsShown()'), false);
  assert.equal(m.lua('SnetForever.PRUEBA.s.texto:GetText()'), 'Modelo: Sonnet');
  m.lua('SnetForever.PRUEBA.s:Click(); SnetForever.PRUEBA.s:Click()');
  assert.equal(m.lua('SnetForever.PRUEBA.s.lista:IsShown()'), false);
  sinErrores(m);
});

// Lote C (revisión 52, Minor 13): SnetForeverCuenta.fallos tiene un tope de 200 avisos. Al llegar se avisa una vez en el
// chat (solo para el jugador); a partir de ahí, cada aviso nuevo descarta el más viejo y se cuentan en fallosDescartados.
test('lote C (52-M13): tope de 200 avisos, un solo aviso al llegar y el más viejo fuera', () => {
  const viejos = Array.from({ length: 198 }, (_, i) => ({ fecha: '2026-11-01 10:00', texto: `viejo ${i + 1}` }));
  const m = conGuia({ vigilarSecretos: ['ui/fallo.lua'],
    guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' }, fallos: viejos } } });
  const tope = m.lua('SnetForever.Fallo.MAX_AVISOS');
  assert.equal(tope, 200);
  const avisosTope = () => m.llamadas('print').map((a) => String(a[0])).filter((l) => l.includes('200'));
  m.lua('SnetForever.Fallo.guardar("nuevo 1")');
  assert.equal(fallos(m).length, 199);
  assert.deepEqual(avisosTope(), []);
  m.lua('SnetForever.Fallo.guardar("nuevo 2")');
  assert.equal(fallos(m).length, 200);
  assert.equal(avisosTope().length, 1, 'avisa al llegar');
  assert.equal(avisosTope()[0], m.lua('SnetForever.L.t("FALLO_TOPE", 200)'));
  m.lua('SnetForever.Fallo.guardar("nuevo 3")');
  m.lua('SnetForever.Fallo.guardar("nuevo 4")');
  const lista = fallos(m);
  assert.equal(lista.length, 200);
  assert.equal(lista[0].texto, 'viejo 3', 'los dos más viejos, fuera');
  assert.equal(lista[199].texto, 'nuevo 4');
  assert.equal(m.lua('SnetForeverCuenta.fallosDescartados'), 2);
  assert.equal(avisosTope().length, 1, 'una sola vez');
  sinErrores(m);
  // Tras recargar no vuelve a avisar.
  const m2 = m.recargar();
  m2.lua('SnetForever.Fallo.guardar("nuevo 5")');
  assert.equal(m2.llamadas('print').map((a) => String(a[0])).filter((l) => l.includes('200')).length, 0);
  assert.equal(m2.lua('#SnetForeverCuenta.fallos'), 200);
  sinErrores(m2);
});

test('lote C (52-M13): el aviso del tope existe en español y en inglés', () => {
  const es = nuevaMaquina({ guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } } } });
  const en = nuevaMaquina(EN);
  assert.ok(es.lua('SnetForever.L.t("FALLO_TOPE", 200)').startsWith('Ya tienes 200 avisos de fallo'));
  assert.ok(en.lua('SnetForever.L.t("FALLO_TOPE", 200)').startsWith('You already have 200 problem reports'));
  sinErrores(es);
  sinErrores(en);
});

// Ronda 1 del lote C (Menor 3): quien ya tenía más de 200 avisos (de antes del tope) no los pierde de golpe. El primer
// aviso nuevo solo avisa (no se pierde nada); desde el siguiente, cada aviso nuevo descarta solo el más viejo.
test('ronda 1 (52-M13): con 250 avisos de antes, primero el aviso y nada perdido; después, uno por aviso nuevo', () => {
  const viejos = Array.from({ length: 250 }, (_, i) => ({ fecha: '2026-11-01 10:00', texto: `viejo ${i + 1}` }));
  const m = conGuia({ vigilarSecretos: ['ui/fallo.lua'],
    guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' }, fallos: viejos } } });
  const impresos = () => m.llamadas('print').map((a) => String(a[0]));
  const tope = m.lua('SnetForever.L.t("FALLO_TOPE", 200)');
  m.lua('SnetForever.Fallo.guardar("nuevo 1")');
  assert.equal(fallos(m).length, 251, 'no se pierde nada todavía');
  assert.equal(fallos(m)[0].texto, 'viejo 1');
  assert.ok(impresos().includes(tope), 'el aviso sale antes de perder nada');
  assert.equal(m.lua('SnetForeverCuenta.fallosDescartados'), undefined);
  m.lua('SnetForever.Fallo.guardar("nuevo 2")');
  assert.equal(fallos(m).length, 251, 'solo el más viejo');
  assert.equal(fallos(m)[0].texto, 'viejo 2');
  assert.equal(fallos(m)[250].texto, 'nuevo 2');
  assert.equal(m.lua('SnetForeverCuenta.fallosDescartados'), 1);
  assert.equal(impresos().filter((l) => l === tope).length, 1, 'el aviso, una vez');
  sinErrores(m);
});
