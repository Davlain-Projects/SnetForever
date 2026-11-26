// Ventana de guía (ui/ventana.lua). Tarea 16: el paso actual con sus requisitos (O11), avisar de un fallo (O12), los
// pasos siguientes, el menú de guías y los avisos de clase. Tarea D3: la ventana como RestedXP (bloque activo con
// pestaña «Paso N» y casillas por línea encima de la cabecera, emblema redondo, lista de pasos con números y barra de
// desplazamiento, pie con engranaje y versión, clic derecho para saltar o avisar).
// El jugador por defecto del banco es un orco guerrero de nivel 1 (src/wow-falso.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withGuideDetails as nuevaMaquina, sinErrores, globalPermitida, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const DATOS_CON_AVISOS = [
  join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(FIXTURES, 'avisos-mini.lua'),
];
const INICIO = 'Prueba (H)\\01-02 Inicio';
const SIGUE = 'Prueba (H)\\02-03 Sigue';
const CLAVE = 'Prueba\\01-60 Guía de prueba';
const EN = { guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } } };
const DRUIDA = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 9 };

const MANUAL = (es) => ({ t: 'manual', texto: { en: es, es } });
const NOTA = (es) => ({ t: 'nota', texto: { en: es, es } });

const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;

const CIRCULO = 'Interface\\CharacterFrame\\TempPortraitAlphaMask';
const CLASES = 'Interface\\TargetingFrame\\UI-Classes-Circles';

// Orco de nivel 1 con su guía por defecto (Inicio) y la ventana creada.
function conInicio(opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.lua('SnetForever.Guias.cargar(SnetForever.Guias.porDefecto())');
  m.lua(`${V}.crear()`);
  return m;
}

// La guía de prueba cargada y la ventana creada.
function conGuia(pasos, opciones = {}, campos = {}) {
  const m = nuevaMaquina(opciones);
  m.ponerGuia(guiaDePrueba(pasos, campos));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua(`${V}.crear()`);
  return m;
}

// Textos de las líneas del paso pintado k.
const lineas = (m, k) => m.lua(`(function() local t = {} for i, fs in ipairs(${M}.pasos[${k}].lineas) do t[i] = fs:GetText() end return t end)()`) || [];
const requisitos = (m, k) => m.lua(`(function() local t = {} for i, fs in ipairs(${M}.pasos[${k}].requisitos) do t[i] = fs:GetText() end return t end)()`) || [];
const siguientes = (m) => m.lua(`(function() local t = {} for i, fs in ipairs(${M}.siguientes) do t[i] = fs:GetText() end return t end)()`) || [];
const numeros = (m) => m.lua(`(function() local t = {} for i, fs in ipairs(${M}.siguientesNumeros) do t[i] = fs:GetText() end return t end)()`) || [];
const pasosLista = (m) => m.lua(`${M}.siguientesPasos`) || [];
const numPasos = (m) => m.lua(`#${M}.pasos`);
const visible = (m, expr) => m.lua(`${expr}:IsVisible()`);
const texto = (m, expr) => m.lua(`${expr}:GetText()`);
// Texto sin iconos |T…|t ni colores.
const limpio = (s) => s.replace(/\|T[^|]*\|t ?/g, '').replace(/\|c\w{8}/g, '').replace(/\|r/g, '');

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
const textos = (m, raiz = 'SnetForeverVentana') => m.lua(TEXTOS(raiz)) || [];
const contiene = (lista, buscado) => lista.some((s) => s.includes(buscado));

// Un color «#RRGGBB» como [r, g, b] entre 0 y 1.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const casi = (real, esperado, mensaje) => {
  assert.equal(real.length, esperado.length, mensaje);
  esperado.forEach((v, i) => assert.ok(Math.abs(real[i] - v) < 1e-6, `${mensaje}: ${real} != ${esperado}`));
};
const rgb = (m, expr) => m.lua(`{${expr}:GetVertexColor()}`).slice(0, 3);
const colorTexto = (m, expr) => m.lua(`{${expr}:GetTextColor()}`).slice(0, 3);

// Abre el menú de guías como el jugador: clic derecho en la ventana.
const abrirGuias = (m) => m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "RightButton")');

// Pulsa la fila del menú de guías cuyo texto contiene `buscado`.
function pulsarMenu(m, buscado) {
  const ok = m.lua(`(function()
    for _, fila in ipairs(${M}.menu.filas) do
      if fila:IsVisible() and string.find(fila.texto:GetText() or "", ${aLua(buscado)}, 1, true) then fila:Click(); return true end
    end
    return false
  end)()`);
  assert.ok(ok, `no hay en el menú una fila con «${buscado}»`);
}

// Opciones visibles del menú contextual y pulsar una.
const opcionesContexto = (m) => m.lua(`(function() local t = {}
  for _, f in ipairs(${M}.contexto.filas) do if f:IsVisible() then t[#t + 1] = f.texto:GetText() end end
  return t end)()`) || [];
function pulsarContexto(m, buscado) {
  const ok = m.lua(`(function()
    for _, f in ipairs(${M}.contexto.filas) do
      if f:IsVisible() and f.texto:GetText() == ${aLua(buscado)} then f:Click(); return true end
    end
    return false
  end)()`);
  assert.ok(ok, `no hay en el menú contextual «${buscado}»: ${opcionesContexto(m).join(' | ')}`);
}
// Clic derecho en el paso k del bloque activo / en la tarjeta k de la lista, y la opción `buscado`.
const derechoPaso = (m, k) => m.lua(`${M}.pasos[${k}].marco:Click("RightButton")`);
const derechoTarjeta = (m, k) => m.lua(`${M}.tarjetasLista[${k}]:Click("RightButton")`);
function menuPaso(m, k, buscado) { derechoPaso(m, k); pulsarContexto(m, buscado); }
function menuTarjeta(m, k, buscado) { derechoTarjeta(m, k); pulsarContexto(m, buscado); }

// ---------------------------------------------------------------------------------------------------
// Banco: lo nuevo de la tarea 16
// ---------------------------------------------------------------------------------------------------

test('banco: GameTooltip (SetOwner, AddLine, SetText, Show, Hide, IsForbidden) e InCombatLockdown', () => {
  const m = nuevaMaquina();
  m.lua(`GameTooltip:SetOwner(UIParent, "ANCHOR_RIGHT"); GameTooltip:SetText("Hola"); GameTooltip:AddLine("Dos", 0.7, 0.7, 0.7)
  GameTooltip:Show()`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.equal(m.lua('GameTooltip:GetOwner() == UIParent'), true);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Hola', 'Dos']);
  m.lua('GameTooltip:Hide()');
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  assert.equal(m.lua('GameTooltip:IsForbidden()'), false);
  m.lua('BANCO.tooltipProhibido = true');
  assert.equal(m.lua('GameTooltip:IsForbidden()'), true);
  assert.equal(m.lua('InCombatLockdown()'), false);
  m.jugador({ enCombate: true });
  assert.equal(m.lua('InCombatLockdown()'), true);
  sinErrores(m);
});

test('banco: PLAYER_REGEN_DISABLED existe; SetMovable, StartMoving y StopMovingOrSizing con el arrastre', () => {
  const m = nuevaMaquina();
  m.lua(`local f = CreateFrame("Frame", "SnetForeverPruebaM", UIParent)
  f:SetPoint("LEFT", UIParent, "LEFT", 20, 60)
  f:RegisterEvent("PLAYER_REGEN_DISABLED")`);
  assert.throws(() => m.lua('SnetForeverPruebaM:StartMoving()'), /no se puede mover/);
  m.lua('SnetForeverPruebaM:SetMovable(true); SnetForeverPruebaM:SetClampedToScreen(true)');
  assert.equal(m.lua('SnetForeverPruebaM:IsMovable()'), true);
  m.lua('BANCO.arrastre = {x = 100, y = -40}; SnetForeverPruebaM:StartMoving(); SnetForeverPruebaM:StopMovingOrSizing()');
  assert.deepEqual(m.lua('{SnetForeverPruebaM:GetPoint(1)}').filter((v) => typeof v !== 'object'), ['LEFT', 'LEFT', 120, 20]);
  assert.deepEqual(m.llamadas('StartMoving'), [['SnetForeverPruebaM']]);
  sinErrores(m);
});

test('banco: FontString.GetStringHeight crece con los saltos y con el ajuste de línea; SetWordWrap', () => {
  const m = nuevaMaquina();
  m.lua(`local f = CreateFrame("Frame", nil, UIParent)
  local s = f:CreateFontString("SnetForeverPruebaS", "OVERLAY")
  s:SetFont("Fonts\\\\FRIZQT__.TTF", 10, ""); s:SetWidth(100); s:SetWordWrap(true)`);
  m.lua('SnetForeverPruebaS:SetText("corto")');
  const una = m.lua('SnetForeverPruebaS:GetStringHeight()');
  assert.ok(una > 0);
  m.lua('SnetForeverPruebaS:SetText("uno\\ndos")');
  assert.equal(m.lua('SnetForeverPruebaS:GetStringHeight()'), una * 2);
  m.lua(`SnetForeverPruebaS:SetText(${aLua('x'.repeat(60))})`);
  assert.equal(m.lua('SnetForeverPruebaS:GetStringHeight()'), una * 3);
  m.lua('SnetForeverPruebaS:SetText(nil)');
  assert.equal(m.lua('SnetForeverPruebaS:GetStringHeight()'), 0);
  sinErrores(m);
});

test('banco (D3): CLASS_ICON_TCOORDS y SetPortraitTexture (solo «player»)', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('CLASS_ICON_TCOORDS.WARRIOR'), [0, 0.25, 0, 0.25]);
  assert.deepEqual(m.lua('CLASS_ICON_TCOORDS.DRUID'), [0.7421875, 0.98828125, 0, 0.25]);
  m.lua('SnetForeverPruebaT = UIParent:CreateTexture(nil, "ARTWORK"); SnetForeverPruebaT:SetTexture("x")');
  m.lua('SetPortraitTexture(SnetForeverPruebaT, "player")');
  assert.equal(m.lua('BANCO.retrato(SnetForeverPruebaT)'), 'player');
  assert.equal(m.lua('SnetForeverPruebaT:GetTexture()'), undefined);
  assert.throws(() => m.lua('SetPortraitTexture(SnetForeverPruebaT, "target")'), /solo admite 'player'/);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Contenido
// ---------------------------------------------------------------------------------------------------

test('Orco 1 con Inicio: título, tramo, la línea del paso 1, ancho 260, sin fondo en la raíz y piezas de Forja', () => {
  const m = conInicio();
  const raiz = m.marco('SnetForeverVentana');
  assert.equal(raiz.padre, 'UIParent');
  assert.equal(raiz.visible, true);
  assert.match(texto(m, `${M}.titulo`), /1-2 Inicio/);
  assert.equal(texto(m, `${M}.tramo`), 'Nivel 1-2');
  assert.ok(contiene(lineas(m, 1), 'Acepta la misión Tu lugar en el mundo'), lineas(m, 1).join(' | '));
  assert.ok(contiene(lineas(m, 1), 'Habla con'), 'la nota del paso también sale');
  assert.equal(raiz.ancho, 260);
  assert.equal(raiz.escala, 1);
  // La raíz no tiene fondo propio: cada pieza pinta el suyo (cabecera y pie fondoCabecera, lista fondo).
  assert.equal(m.lua('SnetForeverVentana.snfFondo'), undefined);
  const [r, g, b, a] = m.lua(`{${M}.lista.snfFondo:GetVertexColor()}`);
  casi([r, g, b], hex('#191717'), 'lista');
  assert.equal(a, 0.92);
  assert.equal(m.lua(`${M}.lista.snfFondo:GetTexture()`), 'Interface\\Buttons\\WHITE8X8');
  casi(rgb(m, `${M}.cabecera.snfFondo`), hex('#302929'), 'cabecera');
  casi(rgb(m, `${M}.pie.snfFondo`), hex('#302929'), 'pie');
  casi(rgb(m, `${M}.pasos[1].marco.snfFondo`), hex('#191717'), 'tarjeta del paso');
  assert.deepEqual(m.lua(`{${M}.titulo:GetFont()}`).slice(0, 1), ['Interface\\AddOns\\SnetForever\\recursos\\fonts\\AlegreyaSC-Bold.ttf']);
  // El tramo va en gris secundario.
  casi(colorTexto(m, `${M}.tramo`), hex('#CBBEB1'), 'tramo');
  assert.equal(m.lua('SnetForever.Ventana.crear() == SnetForeverVentana'), true, 'crear() dos veces da el mismo marco');
  sinErrores(m);
});

test('las líneas de recorrido generadas no se pintan; un goto solo o con texto propio, sí y sin «.0»', () => {
  const m = conInicio();
  assert.ok(!contiene(lineas(m, 1), 'Ve a'), lineas(m, 1).join(' | '));
  const solo = conGuia([{ elementos: [{ t: 'goto', mapa: 1411, x: 43.29, y: 69.0, modo: 'flecha' }] }]);
  const [l] = lineas(solo, 1);
  assert.match(l, /Ve a Durotar \(43\.3, 69\)/);
  // Su icono es el mapa de Interface\Icons, recortado 0,08-0,92.
  assert.equal(solo.lua(`${M}.pasos[1].lineas[1].icono:GetTexture()`), 'Interface\\Icons\\INV_Misc_Map_01');
  assert.deepEqual(solo.lua(`{${M}.pasos[1].lineas[1].icono:GetTexCoord()}`), [0.08, 0.08, 0.08, 0.92, 0.92, 0.08, 0.92, 0.92]);
  const propio = conGuia([{ elementos: [{ t: 'goto', mapa: 1411, x: 40, y: 40, texto: { en: 'Run', es: 'Corre al poblado' } }, MANUAL('Haz algo')] }]);
  assert.ok(contiene(lineas(propio, 1), 'Corre al poblado'));
  sinErrores(m);
  sinErrores(solo);
  sinErrores(propio);
});

test('accept 789 a nivel 2 con grupo: un requisito en rojo y otro de grupo en amarillo, con su icono', () => {
  const m = conGuia([{ elementos: [{ t: 'accept', q: 789 }], requisitos: [{ t: 'grupo', n: 3 }] }], { jugador: { nivel: 2 } });
  const reqs = requisitos(m, 1);
  // Lote D (D2): más la línea del nivel de la misión (4, amarilla a nivel 2), con el color del juego.
  assert.equal(reqs.length, 3);
  assert.ok(reqs.some((s) => s.includes('|cFFFFFF00') && s.includes('Misión de nivel 4')), reqs.join(' | '));
  assert.ok(reqs.some((s) => s.includes('|cFFFF4040') && s.includes('Nivel 3')), reqs.join(' | '));
  assert.ok(reqs.some((s) => s.includes('|cFFFFD040') && s.includes('Grupo de 3')), reqs.join(' | '));
  // El icono va como textura delante del texto (ReadyCheck), en la columna de los iconos.
  const iconos = m.lua(`(function() local t = {} for i, fs in ipairs(${M}.pasos[1].requisitos) do t[i] = fs.icono:GetTexture() end return t end)()`);
  assert.equal(iconos.length, 3);
  assert.ok(iconos.every((s) => s.startsWith('Interface\\RaidFrame\\ReadyCheck-')), iconos.join(' | '));
  m.jugador({ nivel: 3 });
  m.lua(`${V}.pintar()`);
  assert.ok(requisitos(m, 1).some((s) => s.includes('|cFF40FF40') && s.includes('Nivel 3')));
  sinErrores(m);
});

test('pestaña «Paso N» (alto 17, asoma 11 por arriba); los pegajosos no la llevan', () => {
  const m = conInicio();
  const p = `${M}.pasos[1].pestana`;
  assert.equal(visible(m, p), true);
  assert.equal(limpio(texto(m, `${p}.texto`)), 'Paso 1 · guía 1', 'T4: con el número de la guía entera');
  assert.equal(m.lua(`${p}:GetHeight()`), 17);
  assert.equal(m.lua(`${p}:GetWidth()`), m.lua(`${p}.texto:GetUnboundedStringWidth() + 10`));
  assert.equal(m.lua(`(function() local a, rel, b, x, y = ${p}:GetPoint(1)
    return a == "BOTTOMLEFT" and rel == ${M}.pasos[1].marco and b == "TOPLEFT" and x == 7 and y == -6 end)()`), true);
  casi(colorTexto(m, `${p}.texto`), hex('#E6AC72'), 'color de la pestaña');
  const r = conGuia([
    { elementos: [MANUAL('Pegajoso')], etiquetas: { sticky: true } },
    { elementos: [MANUAL('Actual')] },
  ]);
  assert.equal(numPasos(r), 2);
  assert.ok(contiene(lineas(r, 1), 'Pegajoso'));
  assert.equal(r.lua(`${M}.pasos[1].pestana:IsShown()`), false, 'el pegajoso no lleva pestaña');
  assert.equal(limpio(texto(r, `${M}.pasos[2].pestana.texto`)), 'Paso 2 · guía 2');
  sinErrores(m);
  sinErrores(r);
});

test('casillas: una por línea que se completa, vacía si falta y con la marca si está hecha; las notas no llevan', () => {
  const m = conGuia([
    { elementos: [{ t: 'accept', q: 789 }, MANUAL('Marca esto'), NOTA('Solo información')] },
    { elementos: [MANUAL('Luego')] },
  ]);
  assert.equal(m.lua(`#${M}.pasos[1].casillas`), 2);
  const l = lineas(m, 1);
  const kNota = l.findIndex((s) => s.includes('Solo información'));
  assert.ok(kNota >= 0, l.join(' | '));
  assert.equal(m.lua(`${M}.pasos[1].lineas[${kNota + 1}].casilla`), undefined, 'una nota no lleva casilla');
  const c = `${M}.pasos[1].casillas[1]`;
  assert.equal(m.lua(`${M}.pasos[1].lineas[1].casilla == ${c}`), true, 'la casilla va en la línea del accept');
  assert.deepEqual(m.lua(`{${c}:GetSize()}`), [12, 12]);
  assert.equal(m.lua(`${c}.aro:GetTexture()`), CIRCULO, 'círculo de Blizzard');
  casi(rgb(m, `${c}.aro`), hex('#775744'), 'aro del color del borde');
  assert.equal(m.lua(`${c}.marca:IsShown()`), false, 'sin hacer: vacía');
  // A la izquierda de la línea: casilla en x = 6, icono en x = 20 y texto en x = 34.
  assert.deepEqual(m.lua(`{select(4, ${c}:GetPoint(1))}`), [6, m.lua(`select(5, ${c}:GetPoint(1))`)]);
  assert.equal(m.lua(`select(4, ${M}.pasos[1].lineas[1].icono:GetPoint(1))`), 20);
  assert.equal(m.lua(`select(4, ${M}.pasos[1].lineas[1]:GetPoint(1))`), 34);
  // Ayuda al pasar el ratón.
  m.lua(`${c}:GetScript("OnEnter")(${c})`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Clic: darlo por hecho']);
  sinErrores(m);
});

test('clic en la casilla: el elemento queda hecho a mano (Motor.marcarHecho) y, si queda hecho el paso, la guía avanza', () => {
  const m = conGuia([
    { elementos: [{ t: 'accept', q: 789 }, MANUAL('Marca esto')] },
    { elementos: [MANUAL('Luego')] },
  ]);
  m.lua(`SnetForever.LLAMADAS = {}
  hooksecurefunc(SnetForever.Motor, "marcarHecho", function(i, k, v) table.insert(SnetForever.LLAMADAS, {"hecho", i, k, v}) end)
  hooksecurefunc(SnetForever.Motor, "marcarManual", function(i, k, v) table.insert(SnetForever.LLAMADAS, {"manual", i, k, v}) end)`);
  m.lua(`${M}.pasos[1].casillas[1]:Click()`);
  assert.deepEqual(m.lua('SnetForever.LLAMADAS'), [['hecho', 1, 1, true]]);
  assert.equal(m.lua(`${M}.pasos[1].casillas[1].marca:IsShown()`), true, 'con la marca');
  m.lua(`${M}.pasos[1].casillas[1]:GetScript("OnEnter")(${M}.pasos[1].casillas[1])`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Hecho a mano. Clic: desmarcarlo']);
  // Otro clic la quita; un tercero la vuelve a poner.
  m.lua(`${M}.pasos[1].casillas[1]:Click()`);
  assert.equal(m.lua(`${M}.pasos[1].casillas[1].marca:IsShown()`), false);
  m.lua(`${M}.pasos[1].casillas[1]:Click()`);
  m.avanzar(0.5);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1, 'falta el manual: no avanza');
  // La del manual marca el manual; con eso el paso está hecho y la guía pasa al 2 (no va a saltados).
  m.lua(`${M}.pasos[1].casillas[2]:Click()`);
  assert.deepEqual(m.lua('SnetForever.LLAMADAS').slice(-1), [['manual', 1, 2, true]]);
  m.avanzar(0.5);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 2);
  assert.deepEqual(m.lua('SnetForeverPJ.saltados'), []);
  assert.ok(contiene(lineas(m, 1), 'Luego'));
  sinErrores(m);
});

test('la casilla de un manual llama a marcarManual; una línea clicknext carga su guía', () => {
  const m = conGuia([
    { elementos: [MANUAL('Marca esto'), { t: 'clicknext', guias: ['No existe\\x', SIGUE], texto: { en: 'Click', es: 'Pulsa aquí para la siguiente' } }] },
    { elementos: [MANUAL('Luego')] },
  ]);
  m.lua(`SnetForever.LLAMADAS = {}
  hooksecurefunc(SnetForever.Motor, "marcarManual", function(i, k, v) table.insert(SnetForever.LLAMADAS, {i, k, v}) end)`);
  assert.equal(m.lua(`#${M}.pasos[1].casillas`), 1);
  assert.equal(m.lua(`${M}.pasos[1].casillas[1].marca:IsShown()`), false);
  m.lua(`${M}.pasos[1].casillas[1]:Click()`);
  assert.deepEqual(m.lua('SnetForever.LLAMADAS'), [[1, 1, true]]);
  assert.equal(m.lua(`${M}.pasos[1].casillas[1].marca:IsShown()`), true);
  const l = lineas(m, 1);
  const k = l.findIndex((s) => s.includes('Pulsa aquí para la siguiente'));
  assert.ok(k >= 0, l.join(' | '));
  m.lua(`${M}.pasos[1].lineas[${k + 1}].fila:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), SIGUE);
  assert.match(texto(m, `${M}.titulo`), /2-3 Sigue/);
  sinErrores(m);
});

test('sin botones «Saltar» ni «Avisar» en el paso: el clic derecho ofrece «Saltar este paso» y «Avisar de un fallo»', () => {
  const m = conInicio();
  const enPaso = textos(m, `${M}.pasos[1].marco`);
  assert.ok(!enPaso.some((s) => s === 'Saltar' || s.includes('Avisar')), enPaso.join(' | '));
  assert.equal(visible(m, `${M}.pie.saltados`), false, 'sin saltados no sale');
  // Clic izquierdo: nada.
  m.lua(`${M}.pasos[1].marco:Click()`);
  assert.equal(m.marco('SnetForeverMenuContexto').visible, false);
  derechoPaso(m, 1);
  assert.equal(m.marco('SnetForeverMenuContexto').visible, true);
  assert.deepEqual(opcionesContexto(m), ['Saltar este paso', 'Avisar de un fallo']);
  pulsarContexto(m, 'Saltar este paso');
  assert.equal(m.marco('SnetForeverMenuContexto').visible, false, 'elegir cierra el menú');
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 2);
  assert.equal(texto(m, `${M}.pie.saltados.texto`), 'Saltados: 1');
  assert.equal(visible(m, `${M}.pie.saltados`), true);
  assert.ok(contiene(lineas(m, 1), 'Entrega la misión Tu lugar en el mundo'));
  menuPaso(m, 1, 'Avisar de un fallo');
  assert.equal(m.marco('SnetForeverFallo').visible, true);
  assert.match(m.lua('SnetForeverFallo.etiquetaPaso:GetText()'), /^Paso 2: /);
  // El pie «Saltados» abre el panel en esa sección (tarea 20); sin panel no da error.
  m.lua(`${M}.pie.saltados:Click()`);
  m.lua(`SnetForever.Panel = {abrir = function(s) SnetForever.ABIERTO = s or "?" end}; ${M}.pie.saltados:Click()`);
  assert.equal(m.lua('SnetForever.ABIERTO'), 'saltados');
  m.lua(`${M}.botonPanel:Click()`);
  assert.equal(m.lua('SnetForever.ABIERTO'), '?');
  sinErrores(m);
});

test('el actual que espera (no está en activos) sale con «Esperando» y se puede saltar con el clic derecho', () => {
  const m = conGuia([{ elementos: [MANUAL('Hace falta nivel')], etiquetas: { level: 5 } }]);
  assert.equal(m.lua('SnetForever.Motor.paso(1).espera'), 'nivel');
  assert.equal(m.lua('#SnetForever.Motor.estado().activos'), 0);
  assert.equal(numPasos(m), 1);
  assert.ok(contiene(lineas(m, 1), 'Hace falta nivel'));
  assert.equal(texto(m, `${M}.pasos[1].espera`), 'Esperando: nivel 5');
  assert.equal(visible(m, `${M}.pasos[1].espera`), true);
  assert.equal(m.lua(`${M}.pasos[1].espera.icono:GetTexture()`), 'Interface\\RaidFrame\\ReadyCheck-Waiting');
  casi(colorTexto(m, `${M}.pasos[1].espera`), hex('#CBBEB1'), 'en gris secundario');
  menuPaso(m, 1, 'Saltar este paso');
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), true);
  // Un pegajoso activo con su paso siguiente que espera por #requires: los dos salen, el que espera al final.
  const r = conGuia([
    { elementos: [MANUAL('Pegajoso')], etiquetas: { sticky: true } },
    { elementos: [MANUAL('Espera al otro')], etiquetas: { requires: 'nada' } },
    { elementos: [MANUAL('Marca')], etiquetas: { label: 'nada' } },
  ]);
  assert.equal(r.lua('SnetForever.Motor.paso(2).espera'), 'requiere');
  assert.deepEqual(r.lua('SnetForever.Motor.estado().activos'), [1]);
  assert.equal(numPasos(r), 2);
  assert.ok(contiene(lineas(r, 1), 'Pegajoso'));
  assert.equal(texto(r, `${M}.pasos[2].espera`), 'Esperando: otro paso');
  sinErrores(m);
  sinErrores(r);
});

test('un paso con hidewindow no se pinta y uno sin elementos tampoco', () => {
  const m = conGuia([
    { elementos: [MANUAL('Oculto')], etiquetas: { hidewindow: true } },
    { elementos: [MANUAL('Visible')] },
  ]);
  assert.equal(numPasos(m), 0);
  assert.ok(!contiene(textos(m), 'Oculto'));
  // T1: el paso sin elementos ya está hecho: al cargar se pasa al siguiente, que es el que se pinta.
  const vacio = conGuia([{ elementos: [] }, { elementos: [MANUAL('Después')] }]);
  assert.deepEqual(vacio.lua('SnetForever.Motor.estado().activos'), [2]);
  assert.ok(contiene(textos(vacio), 'Después'));
  // Ronda 1 de T1 (M6): con «Ir a» al paso vacío, ese paso activo no se pinta y el siguiente sale en la lista.
  vacio.lua('SnetForever.Motor.irA(1)');
  assert.deepEqual(vacio.lua('SnetForever.Motor.estado().activos'), [1]);
  assert.equal(numPasos(vacio), 0);
  assert.ok(contiene(siguientes(vacio), 'Después'));
  sinErrores(m);
  sinErrores(vacio);
});

// ---------------------------------------------------------------------------------------------------
// Lista de pasos con barra de desplazamiento
// ---------------------------------------------------------------------------------------------------

test('lista: el activo y 3 siguientes por defecto, con todas sus líneas e iconos, el número «01» aparte y el activo resaltado', () => {
  const m = conInicio();
  assert.equal(siguientes(m).length, 4, 'el activo + ventana.siguientes (3)');
  assert.deepEqual(numeros(m), ['01', '02', '03', '04']);
  assert.deepEqual(pasosLista(m), [1, 2, 3, 4]);
  assert.equal(m.lua(`${M}.listaActiva`), 1);
  // Todas las líneas del paso con texto, cada una con su icono (12×12), unidas con salto de línea.
  const [primera] = siguientes(m);
  assert.equal(primera, '|TInterface\\WorldMap\\ChatBubble_64Grey:12:12|t Habla con |cFF00FF25Kaltunk|r\n'
    + '|TInterface\\GossipFrame\\AvailableQuestIcon:12:12|t Acepta la misión Tu lugar en el mundo');
  assert.ok(siguientes(m)[1].includes('Entrega la misión Tu lugar en el mundo\n'), siguientes(m)[1]);
  // Texto blanco, número en gris; el activo con el fondo resalte y los demás con fondoLista.
  casi(colorTexto(m, `${M}.siguientes[2]`), hex('#F5E8D4'), 'texto');
  casi(colorTexto(m, `${M}.siguientesNumeros[2]`), hex('#CBBEB1'), 'número');
  casi(rgb(m, `${M}.tarjetasLista[1].fondo`), hex('#4C3025'), 'activa');
  casi(rgb(m, `${M}.tarjetasLista[2].fondo`), hex('#24201F'), 'otra');
  // El número va abajo a la derecha, con el de la guía entera a su derecha (-4, 3) (T4).
  assert.deepEqual(m.lua(`{${M}.siguientesGuias[1]:GetPoint(1)}`).filter((v) => typeof v !== 'object'), ['BOTTOMRIGHT', 'BOTTOMRIGHT', -4, 3]);
  assert.equal(m.lua(`select(2, ${M}.siguientesNumeros[1]:GetPoint(1)) == ${M}.siguientesGuias[1]`), true);
  // Al pasar el ratón, el fondo resalte.
  m.lua(`${M}.tarjetasLista[2]:GetScript("OnEnter")(${M}.tarjetasLista[2])`);
  casi(rgb(m, `${M}.tarjetasLista[2].fondo`), hex('#4C3025'), 'bajo el ratón');
  m.lua(`${M}.tarjetasLista[2]:GetScript("OnLeave")(${M}.tarjetasLista[2])`);
  casi(rgb(m, `${M}.tarjetasLista[2].fondo`), hex('#24201F'), 'al salir');
  // ventana.siguientes = 0: solo el activo.
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 0)');
  assert.equal(siguientes(m).length, 1);
  assert.ok(!contiene(textos(m, `${M}.lista`), 'Entrega la misión'));
  sinErrores(m);
});

// Lote C, ronda 1 (52-M8): la numeración cuenta solo los pasos de la lista (antes era la de la guía: 01, 02, 05, 06).
test('lista: optional e hidewindow no salen y la numeración es la de la lista; más de 4 líneas acaban en «…»', () => {
  const n = conGuia([
    { elementos: [MANUAL('Uno')] },
    { elementos: [MANUAL('Dos')] },
    { elementos: [MANUAL('Opcional')], etiquetas: { optional: true } },
    { elementos: [MANUAL('Oculto')], etiquetas: { hidewindow: true } },
    { elementos: [MANUAL('Cinco')] },
    { elementos: [MANUAL('Seis')] },
  ]);
  assert.deepEqual(siguientes(n).map(limpio), ['Uno', 'Dos', 'Cinco', 'Seis']);
  assert.deepEqual(numeros(n), ['01', '02', '03', '04']);
  assert.ok(!contiene(textos(n), 'Opcional'));
  const largo = conGuia([
    { elementos: [MANUAL('Activo')] },
    { elementos: ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => MANUAL(`Línea ${x}`)) },
  ]);
  const t = siguientes(largo)[1].split('\n');
  assert.equal(t.length, 4);
  assert.equal(t[3], 'Línea d…');
  sinErrores(n);
  sinErrores(largo);
});

test('lista: clic derecho en una tarjeta → «Ir a este paso» llama a Motor.irA y la lista se coloca en él', () => {
  const m = conInicio();
  m.lua(`SnetForever.IRA = {}
  hooksecurefunc(SnetForever.Motor, "irA", function(i) table.insert(SnetForever.IRA, i) end)`);
  // En la tarjeta del activo no hay «Ir a este paso».
  derechoTarjeta(m, 1);
  assert.deepEqual(opcionesContexto(m), ['Saltar este paso', 'Avisar de un fallo']);
  m.lua('SnetForever.Ventana.cerrarContexto()');
  derechoTarjeta(m, 3);
  assert.deepEqual(opcionesContexto(m), ['Ir a este paso', 'Saltar este paso', 'Avisar de un fallo']);
  pulsarContexto(m, 'Ir a este paso');
  assert.deepEqual(m.lua('SnetForever.IRA'), [3]);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 3);
  assert.equal(pasosLista(m)[0], 3, 'la lista se coloca en el activo');
  assert.equal(m.lua(`${M}.listaActiva`), 1);
  assert.ok(contiene(lineas(m, 1), 'Mata a los'), lineas(m, 1).join(' | '));
  // Los anteriores salen en gris al subir la lista.
  m.lua(`${V}.desplazar(-2)`);
  assert.deepEqual(pasosLista(m).slice(0, 2), [1, 2]);
  casi(colorTexto(m, `${M}.siguientes[1]`), hex('#CBBEB1'), 'hecho, en gris');
  // «Avisar de un fallo» desde la lista abre el diálogo de ese paso.
  menuTarjeta(m, 2, 'Avisar de un fallo');
  assert.match(m.lua('SnetForeverFallo.etiquetaPaso:GetText()'), /^Paso 2: /);
  sinErrores(m);
});

// T4: el jugador no encontraba cómo elegir un paso (solo con el clic derecho). Ahora un clic izquierdo en una tarjeta va
// a ese paso; si hacia delante deja pasos sin hacer, antes lo pregunta en una caja fija.
const SEIS = [1, 2, 3, 4, 5, 6].map((k) => ({ elementos: [MANUAL(`Paso ${k}`)] }));
const izquierdoTarjeta = (m, k) => m.lua(`${M}.tarjetasLista[${k}]:Click("LeftButton")`);
const tarjetaDe = (m, i) => pasosLista(m).indexOf(i) + 1;

test('T4: clic izquierdo en una tarjeta: hacia atrás llama a Motor.irA; en la del activo no hace nada', () => {
  const m = conGuia(SEIS);
  m.lua(`SnetForever.IRA = {}
  hooksecurefunc(SnetForever.Motor, "irA", function(i) table.insert(SnetForever.IRA, i) end)`);
  izquierdoTarjeta(m, 1);
  assert.deepEqual(m.lua('SnetForever.IRA'), [], 'la del activo no hace nada');
  m.lua('SnetForever.Motor.marcarManual(1, 1, true); SnetForever.Motor.marcarManual(2, 1, true)');
  m.avanzar(0.3);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 3);
  m.lua(`${V}.desplazar(-5)`);
  izquierdoTarjeta(m, tarjetaDe(m, 1));
  assert.deepEqual(m.lua('SnetForever.IRA'), [1]);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1);
  assert.equal(m.marco('SnetForeverConfirmarPaso')?.visible ?? false, false, 'hacia atrás no pregunta');
  assert.equal(m.marco('SnetForeverMenuContexto').visible, false);
  sinErrores(m);
});

test('T4: hacia delante, una caja fija pregunta antes; Cancelar no cambia nada e Ir deja los de en medio en saltados', () => {
  const m = conGuia(SEIS);
  m.lua(`SnetForever.IRA = {}
  hooksecurefunc(SnetForever.Motor, "irA", function(i) table.insert(SnetForever.IRA, i) end)`);
  izquierdoTarjeta(m, 4);
  assert.equal(m.marco('SnetForeverConfirmarPaso').visible, true);
  assert.equal(texto(m, `${M}.confirmar.texto`), 'Ir al paso 4. Los pasos 1 a 3 quedarán en Pasos saltados.');
  assert.equal(texto(m, `${M}.confirmar.ir.texto`), 'Ir');
  assert.equal(texto(m, `${M}.confirmar.cancelar.texto`), 'Cancelar');
  assert.equal(m.lua(`${M}.confirmar:GetFrameStrata()`), 'DIALOG');
  m.lua(`${M}.confirmar.cancelar:Click()`);
  assert.equal(m.marco('SnetForeverConfirmarPaso').visible, false);
  assert.deepEqual(m.lua('SnetForever.IRA'), [], 'Cancelar no llama a irA');
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1);
  assert.equal(m.lua('#SnetForeverPJ.saltados'), 0);
  // Uno o dos pasos lo dicen así.
  izquierdoTarjeta(m, 2);
  assert.equal(texto(m, `${M}.confirmar.texto`), 'Ir al paso 2. El paso 1 quedará en Pasos saltados.');
  izquierdoTarjeta(m, 3);
  assert.equal(texto(m, `${M}.confirmar.texto`), 'Ir al paso 3. Los pasos 1 y 2 quedarán en Pasos saltados.');
  // Escape la cierra (UISpecialFrames).
  assert.ok(m.lua('UISpecialFrames').includes('SnetForeverConfirmarPaso'));
  izquierdoTarjeta(m, 4);
  m.lua(`${M}.confirmar.ir:Click()`);
  assert.equal(m.marco('SnetForeverConfirmarPaso').visible, false);
  assert.deepEqual(m.lua('SnetForever.IRA'), [4]);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 4);
  assert.deepEqual(m.lua('(function() local t = {} for k, s in ipairs(SnetForeverPJ.saltados) do t[k] = s.motivo end return t end)()'),
    ['ir_a', 'ir_a', 'ir_a']);
  sinErrores(m);
});

test('T4: el clic derecho sigue igual y el tooltip de la tarjeta dice «Clic: ir a este paso»', () => {
  const m = conGuia(SEIS);
  derechoTarjeta(m, 3);
  assert.deepEqual(opcionesContexto(m), ['Ir a este paso', 'Saltar este paso', 'Avisar de un fallo']);
  assert.equal(m.marco('SnetForeverConfirmarPaso')?.visible ?? false, false);
  m.lua('SnetForever.Ventana.cerrarContexto()');
  m.lua(`${M}.tarjetasLista[2]:GetScript("OnEnter")(${M}.tarjetasLista[2])`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Clic: ir a este paso', 'Clic derecho: menú']);
  m.lua(`${M}.tarjetasLista[2]:GetScript("OnLeave")(${M}.tarjetasLista[2])`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  // Con el tooltip prohibido no se toca.
  m.lua('BANCO.tooltipProhibido = true');
  const antes = m.llamadas('GameTooltip:SetOwner').length;
  m.lua(`${M}.tarjetasLista[2]:GetScript("OnEnter")(${M}.tarjetasLista[2])`);
  assert.equal(m.llamadas('GameTooltip:SetOwner').length, antes);
  sinErrores(m);
});

test('T4: el paso hecho elegido hacia atrás se queda con «Ya hecho · pulsa para seguir»; al pulsarlo, sigue', () => {
  const m = conGuia(SEIS);
  const actual = () => m.lua('SnetForever.Motor.estado().actual');
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)');
  m.avanzar(0.3);
  assert.equal(actual(), 2);
  assert.equal(m.lua(`${M}.pasos[1].seguir`), undefined, 'sin retener, no sale');
  m.lua(`${V}.desplazar(-5)`);
  izquierdoTarjeta(m, tarjetaDe(m, 1));
  m.avanzar(1);
  assert.equal(actual(), 1, 'no rebota');
  assert.equal(visible(m, `${M}.pasos[1].seguir`), true);
  assert.equal(texto(m, `${M}.pasos[1].seguir.texto`), 'Ya hecho · pulsa para seguir');
  m.lua(`${M}.tarjetasLista[${M}.listaActiva]:GetScript("OnEnter")(${M}.tarjetasLista[${M}.listaActiva])`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Ya hecho · pulsa para seguir', 'Clic derecho: menú']);
  m.lua(`${M}.pasos[1].seguir:Click()`);
  assert.equal(actual(), 2);
  assert.equal(m.lua(`${M}.pasos[1].seguir`), undefined);
  // Un clic en la tarjeta del paso retenido también sigue.
  m.lua('SnetForever.Motor.irA(1)');
  m.avanzar(0.3);
  assert.equal(actual(), 1);
  izquierdoTarjeta(m, m.lua(`${M}.listaActiva`));
  assert.equal(actual(), 2);
  sinErrores(m);
});

// Ronda 1 de T4 (I1): la caja guardaba el índice y el texto de cuando se abrió. Si el paso o la guía cambiaban debajo,
// «Ir» iba hacia atrás o saltaba pasos de otra guía. Ahora se cierra al cambiar el paso actual o la guía, y «Ir» no hace
// nada si ya no son los de cuando se abrió.
test('T4 (ronda 1): la caja se cierra si cambia el paso actual; si aún estuviera abierta, Ir no hace nada', () => {
  const m = conGuia(SEIS);
  const caja = () => m.marco('SnetForeverConfirmarPaso').visible;
  izquierdoTarjeta(m, 4);
  assert.equal(caja(), true);
  for (let k = 1; k <= 4; k++) m.lua(`SnetForever.Motor.marcarManual(${k}, 1, true)`);
  m.avanzar(0.5);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 5);
  assert.equal(caja(), false, 'el paso cambió: la caja se cierra');
  // Abierta a la fuerza con el paso de antes: Ir no llama a irA.
  m.lua(`SnetForever.IRA = {}
  hooksecurefunc(SnetForever.Motor, "irA", function(i) table.insert(SnetForever.IRA, i) end)`);
  m.lua(`${M}.confirmar.actual = 1; ${M}.confirmar:Show(); ${M}.confirmar.ir:Click()`);
  assert.deepEqual(m.lua('SnetForever.IRA'), []);
  assert.equal(caja(), false);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 5);
  assert.deepEqual(m.lua('{SnetForever.Motor.retenido()}'), []);
  // Mover la lista con la rueda también la cierra (la tarjeta ya enseña otro paso).
  izquierdoTarjeta(m, m.lua(`${M}.listaActiva`) + 1);
  assert.equal(caja(), true);
  m.lua(`${V}.desplazar(-1)`);
  assert.equal(caja(), false);
  sinErrores(m);
});

test('T4 (ronda 1): la caja se cierra si cambia la guía, e Ir no toca la guía nueva', () => {
  const m = conGuia(SEIS);
  const caja = () => m.marco('SnetForeverConfirmarPaso').visible;
  izquierdoTarjeta(m, 4);
  assert.equal(caja(), true);
  m.lua('SnetForever.Guias.cargar(SnetForever.Guias.porDefecto())');
  m.avanzar(0.3);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), INICIO);
  assert.equal(caja(), false);
  m.lua(`${M}.confirmar:Show(); ${M}.confirmar.ir:Click()`);
  assert.equal(m.lua('#SnetForeverPJ.saltados'), 0, 'ningún paso de la guía nueva va a saltados');
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1);
  sinErrores(m);
});

// Ronda 1 (M2): con saltos que no van seguidos, la caja los nombra uno a uno («1, 3 y 4»), no «1 a 4».
test('T4 (ronda 1): la caja nombra uno a uno los saltos que no van seguidos', () => {
  const m = conGuia(SEIS);
  m.lua('SnetForever.Motor.marcarManual(2, 1, true)');
  m.avanzar(0.3);
  assert.deepEqual(m.lua('SnetForever.Motor.saltosDeIrA(5)'), [1, 3, 4]);
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 6)'); // que la tarjeta del paso 5 salga en la lista
  izquierdoTarjeta(m, tarjetaDe(m, 5));
  assert.equal(texto(m, `${M}.confirmar.texto`), 'Ir al paso 5. Los pasos 1, 3 y 4 quedarán en Pasos saltados.');
  m.lua(`${M}.confirmar.cancelar:Click()`);
  sinErrores(m);
});

// Ronda 1 (I2): la caja y su fondo invisible de pantalla completa se quedaban al ocultar la ventana (y el primer clic del
// combate no llegaba al juego).
test('T4 (ronda 1): al ocultar la ventana en combate, la caja y su fondo se cierran', () => {
  const m = conGuia(SEIS);
  m.lua('SnetForever.Ajustes.set("ventana.ocultarEnCombate", true)');
  izquierdoTarjeta(m, 4);
  assert.equal(m.lua(`${M}.confirmar:IsShown()`), true);
  assert.equal(m.lua(`${M}.confirmar.fondo:IsShown()`), true);
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('SnetForeverVentana:IsShown()'), false);
  assert.equal(m.lua(`${M}.confirmar:IsShown()`), false);
  assert.equal(m.lua(`${M}.confirmar.fondo:IsShown()`), false);
  sinErrores(m);
});

// Ronda 1 (I3): un pegajoso no se retiene; el clic en su tarjeta no hace nada (sigue activo en el bloque).
test('T4 (ronda 1): el clic en la tarjeta de un pegajoso no hace nada', () => {
  const m = conGuia([
    { elementos: [MANUAL('Pegajoso')], etiquetas: { sticky: true } },
    { elementos: [MANUAL('Uno')] }, { elementos: [MANUAL('Dos')] },
  ]);
  m.lua(`SnetForever.IRA = {}
  hooksecurefunc(SnetForever.Motor, "irA", function(i) table.insert(SnetForever.IRA, i) end)`);
  m.lua(`${V}.desplazar(-5)`);
  const k = tarjetaDe(m, 1);
  assert.ok(k > 0, JSON.stringify(pasosLista(m)));
  izquierdoTarjeta(m, k);
  assert.deepEqual(m.lua('SnetForever.IRA'), []);
  assert.equal(m.marco('SnetForeverConfirmarPaso').visible, false);
  // Su tooltip no promete «Clic: ir a este paso».
  m.lua(`${M}.tarjetasLista[${k}]:GetScript("OnEnter")(${M}.tarjetasLista[${k}])`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Clic derecho: menú']);
  sinErrores(m);
});

// Ronda 1 (M1): el tooltip del retenido solo dice «Ya hecho» si lo está. (M4): el clic derecho en la línea «Ya hecho ·
// pulsa para seguir» abre el menú del paso, como en el resto del bloque.
test('T4 (ronda 1): tooltip del retenido sin hacer y clic derecho en la línea de seguir', () => {
  const m = conGuia(SEIS);
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)');
  m.avanzar(0.3);
  m.lua('SnetForever.Motor.marcarManual(1, 1, false); SnetForever.Motor.irA(1)');
  m.avanzar(0.3);
  assert.deepEqual(m.lua('{SnetForever.Motor.retenido()}'), [1, false]);
  const activa = `${M}.tarjetasLista[${M}.listaActiva]`;
  m.lua(`${activa}:GetScript("OnEnter")(${activa})`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Clic derecho: menú'], 'no está hecho: no dice «Ya hecho»');
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)'); // marcar suelta el retenido y avanza
  m.avanzar(0.3);
  m.lua('SnetForever.Motor.irA(1)');
  m.avanzar(0.3);
  assert.equal(visible(m, `${M}.pasos[1].seguir`), true);
  m.lua(`${M}.pasos[1].seguir:Click("RightButton")`);
  assert.equal(m.marco('SnetForeverMenuContexto').visible, true);
  assert.deepEqual(opcionesContexto(m), ['Saltar este paso', 'Avisar de un fallo']);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1, 'el clic derecho no sigue');
  sinErrores(m);
});

// T4: «Saltados: 40» contaba los de todas las guías. Ahora el pie cuenta los de la guía cargada y, si hay más, el total.
test('T4: el pie dice «Saltados: N (M en total)» con los de la guía cargada', () => {
  const m = conGuia(SEIS);
  assert.equal(visible(m, `${M}.pie.saltados`), false, 'sin saltados no sale');
  m.lua(`for k = 1, 2 do table.insert(SnetForeverPJ.saltados, {clave = "Otra\\\\guía", id = "x" .. k, n = k, resumen = "x"}) end
  ${V}.pintar()`);
  assert.equal(visible(m, `${M}.pie.saltados`), true);
  assert.equal(texto(m, `${M}.pie.saltados.texto`), 'Saltados: 0 (2 en total)');
  m.lua('SnetForever.Motor.saltar(1)');
  assert.equal(texto(m, `${M}.pie.saltados.texto`), 'Saltados: 1 (3 en total)');
  // Solo de la guía cargada: sin «en total».
  m.lua('table.remove(SnetForeverPJ.saltados, 1); table.remove(SnetForeverPJ.saltados, 1)');
  m.lua(`${V}.pintar()`);
  assert.equal(texto(m, `${M}.pie.saltados.texto`), 'Saltados: 1');
  sinErrores(m);
});

// regla de interfaz: nada de parpadeos ni animaciones. La tarjeta y la caja de confirmación no crean
// AnimationGroup ni llaman a UIFrameFlash (en el banco no existen: si se usaran, darían error; aquí se cuentan).
test('T4: la tarjeta y la confirmación no crean AnimationGroup ni llaman a UIFrameFlash', async () => {
  const m = nuevaMaquina();
  m.lua(`SNF_ANIMACIONES = 0
  UIFrameFlash = function() SNF_ANIMACIONES = SNF_ANIMACIONES + 1 end
  BANCO.clases.Frame.metodos.CreateAnimationGroup = function() SNF_ANIMACIONES = SNF_ANIMACIONES + 1 end`);
  m.ponerGuia(guiaDePrueba(SEIS));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua(`${V}.crear()`);
  m.lua(`${M}.tarjetasLista[3]:GetScript("OnEnter")(${M}.tarjetasLista[3])`);
  m.lua(`${M}.tarjetasLista[3]:GetScript("OnLeave")(${M}.tarjetasLista[3])`);
  izquierdoTarjeta(m, 3);
  m.lua(`${M}.confirmar.ir:Click()`);
  m.avanzar(1);
  assert.equal(m.lua('SNF_ANIMACIONES'), 0);
  const { readFile } = await import('node:fs/promises');
  const fuente = await readFile(join(FIXTURES, '..', '..', '..', 'addons', 'SnetForever', 'ui', 'ventana.lua'), 'utf8');
  assert.ok(!/CreateAnimationGroup|UIFrameFlash|UIFrameFade/.test(fuente), 'ui/ventana.lua no anima nada');
  sinErrores(m);
});

test('barra de desplazamiento: flechas y pulgar de Blizzard; flechas, rueda y deslizador mueven la lista; al cambiar de paso vuelve al activo', () => {
  const m = conInicio();
  const B = `${M}.barra`;
  assert.equal(m.lua(`${B}.arriba.icono:GetTexture()`), 'Interface\\Buttons\\UI-ScrollBar-ScrollUpButton-Up');
  assert.equal(m.lua(`${B}.abajo.icono:GetTexture()`), 'Interface\\Buttons\\UI-ScrollBar-ScrollDownButton-Up');
  assert.equal(m.lua(`${B}.pulgar:GetTexture()`), CIRCULO);
  assert.equal(m.lua(`${B}.deslizador:GetThumbTexture() == ${B}.pulgar`), true);
  assert.equal(m.lua(`${B}.arriba:GetHighlightTexture():GetTexture()`), 'Interface\\Buttons\\ButtonHilight-Square');
  // La barra va a la derecha de la lista, dentro de ella.
  assert.equal(m.lua(`(function() local a, rel, b = ${B}:GetPoint(1) return a == "TOPRIGHT" and rel == ${M}.lista and b == "TOPRIGHT" end)()`), true);
  // Inicio tiene 6 pasos en la lista: con 4 tarjetas, el deslizador va de 1 a 3.
  assert.deepEqual(m.lua(`{${B}.deslizador:GetMinMaxValues()}`), [1, 3]);
  assert.equal(m.lua(`${B}.deslizador:GetValue()`), 1);
  assert.equal(m.lua(`${B}.arriba:IsEnabled()`), false, 'arriba del todo: la flecha de subir apagada');
  m.lua(`${B}.abajo:Click()`);
  assert.deepEqual(pasosLista(m), [2, 3, 4, 5]);
  assert.equal(m.lua(`${M}.listaActiva`), undefined, 'el activo ha quedado arriba, fuera de la vista');
  assert.equal(m.lua(`${B}.deslizador:GetValue()`), 2);
  m.lua(`${M}.lista:GetScript("OnMouseWheel")(${M}.lista, -1)`);
  assert.deepEqual(pasosLista(m), [3, 4, 5, 6]);
  assert.equal(m.lua(`${B}.abajo:IsEnabled()`), false, 'abajo del todo');
  m.lua(`${M}.lista:GetScript("OnMouseWheel")(${M}.lista, 1)`);
  assert.deepEqual(pasosLista(m), [2, 3, 4, 5]);
  m.lua(`${B}.deslizador:SetValue(1)`);
  assert.deepEqual(pasosLista(m), [1, 2, 3, 4]);
  m.lua(`${B}.arriba:Click()`); // ya arriba: no se mueve
  assert.deepEqual(pasosLista(m), [1, 2, 3, 4]);
  // Pulsar baja la flecha un píxel y soltar la devuelve.
  m.lua(`${B}.abajo:GetScript("OnMouseDown")(${B}.abajo)`);
  assert.deepEqual(m.lua(`{select(4, ${B}.abajo.icono:GetPoint(1))}`), [1, -1]);
  m.lua(`${B}.abajo:GetScript("OnMouseUp")(${B}.abajo)`);
  assert.deepEqual(m.lua(`{select(4, ${B}.abajo.icono:GetPoint(1))}`), [0, 0]);
  // Desplazada y luego cambia el paso: se coloca en el nuevo activo.
  m.lua(`${V}.desplazar(2)`);
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(pasosLista(m)[0], 2);
  assert.equal(m.lua(`${M}.listaActiva`), 1);
  // Cerca del final, el activo queda dentro aunque no arriba.
  m.lua('SnetForever.Motor.irA(6)');
  assert.deepEqual(pasosLista(m), [3, 4, 5, 6]);
  assert.equal(m.lua(`${M}.listaActiva`), 4);
  sinErrores(m);
});

// Ronda 1 de la revisión de la D3.
const LARGO = (n) => MANUAL(`Paso ${n}: ${'texto largo de verdad '.repeat(6)}`);
const DOCE = Array.from({ length: 12 }, (_, i) => ({ elementos: [LARGO(i + 1)] }));

test('ronda 1: con escala 1,6 y el último paso activo, la lista lo enseña; con flechas y rueda se llega al final', () => {
  const m = conGuia(DOCE);
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 8); SnetForever.Ajustes.set("ventana.escala", 1.6)');
  m.lua('SnetForever.Motor.irA(12)');
  assert.notEqual(m.lua(`${M}.listaActiva`), undefined, `lista ${pasosLista(m)}`);
  assert.equal(pasosLista(m).slice(-1)[0], 12, 'el último paso se ve');
  assert.equal(m.lua(`${M}.barra.abajo:IsEnabled()`), false, 'ya está al final');
  // Desde arriba, la flecha de bajar llega hasta el último paso y luego se apaga.
  m.lua('SnetForever.Motor.irA(1)');
  assert.equal(pasosLista(m)[0], 1);
  for (let i = 0; i < 20 && m.lua(`${M}.barra.abajo:IsEnabled()`); i++) m.lua(`${M}.barra.abajo:Click()`);
  assert.equal(pasosLista(m).slice(-1)[0], 12);
  // La rueda vuelve arriba del todo.
  for (let i = 0; i < 20; i++) m.lua(`${M}.lista:GetScript("OnMouseWheel")(${M}.lista, 1)`);
  assert.equal(pasosLista(m)[0], 1);
  // Topes respetados en todo momento.
  assert.ok(m.marco('SnetForeverVentana').alto * 1.6 <= 1080 * 0.35 + 0.001);
  sinErrores(m);
});

test('ronda 1: mover la lista repinta solo la lista y solo si cambia; las tablas de marcos se reutilizan', () => {
  const m = conInicio();
  m.lua(`PINTADAS, LISTAS = 0, 0
  local p, l = ${V}.pintar, ${V}.repintarLista
  ${V}.pintar = function(...) PINTADAS = PINTADAS + 1; return p(...) end
  ${V}.repintarLista = function(...) LISTAS = LISTAS + 1; return l(...) end`);
  m.lua(`ANTES = {${M}.siguientes, ${M}.siguientesNumeros, ${M}.siguientesPasos, ${M}.tarjetasLista, ${M}.pasos, ${M}.pasos[1]}`);
  m.lua(`${M}.barra.abajo:Click()`);
  assert.deepEqual(pasosLista(m), [2, 3, 4, 5]);
  assert.deepEqual(m.lua('{PINTADAS, LISTAS}'), [0, 1], 'solo la lista');
  m.lua(`${M}.barra.deslizador:SetValue(2)`); // el mismo valor: nada
  m.lua(`${V}.desplazar(0)`);
  m.lua(`${V}.desplazar(-5); ${V}.desplazar(-1)`); // la segunda ya no cambia nada
  assert.deepEqual(m.lua('{PINTADAS, LISTAS}'), [0, 2]);
  m.lua(`${M}.barra.deslizador:SetValue(3)`);
  assert.deepEqual(pasosLista(m), [3, 4, 5, 6]);
  assert.deepEqual(m.lua('{PINTADAS, LISTAS}'), [0, 3]);
  assert.equal(m.lua(`${M}.barra.deslizador:GetObeyStepOnDrag()`), true);
  m.lua(`${V}.pintar()`);
  assert.equal(m.lua(`(function() local a = ANTES; return a[1] == ${M}.siguientes and a[2] == ${M}.siguientesNumeros
    and a[3] == ${M}.siguientesPasos and a[4] == ${M}.tarjetasLista and a[5] == ${M}.pasos and a[6] == ${M}.pasos[1] end)()`), true);
  sinErrores(m);
});

test('ronda 1: el menú del clic derecho de una tarjeta de la lista sale fuera de la ventana y no tapa la barra', () => {
  const m = conInicio();
  derechoTarjeta(m, 2);
  const [punto, esTarjeta, relPunto, x] = m.lua(`(function() local a, rel, b, x = ${M}.contexto:GetPoint(1)
    return {a, rel == ${M}.tarjetasLista[2], b, x} end)()`);
  assert.deepEqual([punto, esTarjeta, relPunto], ['TOPLEFT', true, 'TOPRIGHT']);
  // Lo que queda a la derecha de la tarjeta hasta el borde de la ventana: la barra (16) y 2 de márgenes.
  const derecha = m.lua(`${M}.lista:GetWidth() - 1 - ${M}.tarjetasLista[2]:GetWidth()`);
  assert.ok(x > derecha, `${x} <= ${derecha}`);
  sinErrores(m);
});

test('F3-21: clic izquierdo en la cabecera (sin arrastrar) abre y cierra el menú de guías; arrastrarla mueve la ventana', () => {
  const m = conInicio();
  const C = `${M}.cabecera`;
  // Orden real del cliente: OnMouseDown -> [OnUpdate con el cursor movido] -> OnMouseUp. No se registra arrastre
  // (RegisterForDrag): el cliente real se comía el OnMouseUp del clic; se decide por la distancia (4 px) del cursor.
  const evento = (nombre, boton) => m.lua(`${C}:GetScript("${nombre}")(${C}, ${boton ? `"${boton}"` : 'nil'})`);
  const cursor = (x, y) => m.lua(`BANCO.cursor = {x = ${x}, y = ${y}}`);
  const clic = (boton, movimiento = 0) => {
    cursor(500, 400);
    evento('OnMouseDown', boton);
    if (movimiento) {
      cursor(500 + movimiento, 400);
      m.avanzar(0.1);
    }
    evento('OnMouseUp', boton);
  };
  const menu = () => m.marco('SnetForeverMenuGuias').visible;
  assert.equal(m.lua(`${C}:GetScript("OnDragStart")`), undefined, 'sin arrastre registrado');
  clic('LeftButton');
  assert.equal(menu(), true, 'el izquierdo abre');
  clic('LeftButton', 3);
  assert.equal(menu(), false, 'un temblor de 3 px sigue siendo clic: cierra');
  clic('RightButton');
  assert.equal(menu(), true, 'el derecho también');
  m.lua(`${V}.cerrarMenu()`);
  assert.deepEqual(m.llamadas('StartMoving'), []);
  // Arrastre: al pasar el umbral se mueve la ventana; al soltar se guarda la posición y no se abre el menú.
  m.lua('BANCO.arrastre = {x = 10, y = 5}');
  clic('LeftButton', 30);
  assert.deepEqual(m.llamadas('StartMoving'), [['SnetForeverVentana']]);
  assert.equal(menu(), false);
  assert.deepEqual(m.lua('SnetForever.Ajustes.get("ventana.pos")'), { punto: 'LEFT', relPunto: 'LEFT', x: 170, y: 65 });
  // Aunque no llegue ningún OnUpdate, el OnMouseUp ve que el cursor se movió y no abre el menú.
  cursor(500, 400);
  evento('OnMouseDown', 'LeftButton');
  cursor(560, 400);
  evento('OnMouseUp', 'LeftButton');
  assert.equal(menu(), false);
  // Bloqueada: arrastrar no la mueve ni abre el menú; el clic sin mover sigue abriéndolo.
  m.lua('SnetForever.Ajustes.set("ventana.bloqueada", true)');
  const movimientos = m.llamadas('StartMoving').length;
  clic('LeftButton', 30);
  assert.equal(m.llamadas('StartMoving').length, movimientos);
  assert.equal(menu(), false);
  clic('LeftButton');
  assert.equal(menu(), true);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Cabecera y pie
// ---------------------------------------------------------------------------------------------------

test('cabecera: emblema redondo con el icono de la clase y el retrato; título centrado en dos líneas como mucho', () => {
  const m = conInicio();
  const em = `${M}.emblema`;
  assert.equal(m.lua(`${em}.icono:GetTexture()`), CLASES);
  assert.deepEqual(m.lua(`{${em}.icono:GetTexCoord()}`), [0, 0, 0, 0.25, 0.25, 0, 0.25, 0.25], 'el guerrero');
  assert.equal(m.lua(`${em}.aro:GetTexture()`), CIRCULO);
  casi(rgb(m, `${em}.aro`), hex('#775744'), 'aro');
  assert.equal(m.lua(`BANCO.retrato(${em}.retrato)`), 'player');
  assert.equal(visible(m, `${em}.retrato`), true);
  assert.deepEqual(m.lua(`{${em}:GetSize()}`), [40, 40]);
  // El título va a la derecha del emblema (x = 46), centrado, con el ancho hasta 6 del borde.
  assert.equal(m.lua(`select(4, ${M}.titulo:GetPoint(1))`), 46);
  assert.equal(m.lua(`${M}.titulo:GetWidth()`), 260 - 46 - 6);
  assert.equal(m.lua(`${M}.titulo:GetJustifyH()`), 'CENTER');
  assert.equal(m.lua(`${M}.tramo:GetJustifyH()`), 'CENTER');
  // Un título largo se corta en dos líneas con «…».
  const largo = conGuia([{ elementos: [MANUAL('Uno')] }], {}, {
    titulo: { en: 'x', es: '18-22 Sierra Espolón, Los Baldíos, Vallefresno, Bosque de Argénteos y más sitios todavía' },
  });
  const t = texto(largo, `${M}.titulo`);
  assert.ok(t.endsWith('…'), t);
  const una = largo.lua(`(function() local fs = ${M}.titulo; local v = fs:GetText(); fs:SetText("Ag"); local h = fs:GetStringHeight(); fs:SetText(v); return h end)()`);
  assert.ok(largo.lua(`${M}.titulo:GetStringHeight()`) <= una * 2, 'dos líneas como mucho');
  // Un druida ve su icono.
  const d = conInicio({ jugador: { clase: 'DRUID', raza: 'Tauren' } });
  assert.deepEqual(d.lua(`{${em}.icono:GetTexCoord()}`).slice(0, 2), [0.7421875, 0]);
  sinErrores(m);
  sinErrores(largo);
  sinErrores(d);
});

test('cabecera sin CLASS_ICON_TCOORDS ni SetPortraitTexture: el libro y sin retrato, sin errores', () => {
  const m = conInicio({ sinApi: ['CLASS_ICON_TCOORDS', 'SetPortraitTexture'] });
  assert.equal(m.lua(`${M}.emblema.icono:GetTexture()`), 'Interface\\Icons\\INV_Misc_Book_09');
  assert.equal(m.lua(`${M}.emblema.retrato:IsShown()`), false);
  assert.equal(m.lua(`${M}.emblema.aroRetrato:IsShown()`), false);
  sinErrores(m);
});

test('pie: engranaje a la izquierda y «SnetForever v0.7.0» centrado; el clic derecho del engranaje abre su menú', () => {
  const m = conInicio();
  assert.equal(texto(m, `${M}.pie.version`), 'SnetForever v0.7.0');
  assert.equal(m.lua(`(function() local a, rel, b, x, y = ${M}.pie.version:GetPoint(1) return a == "CENTER" and rel == ${M}.pie and x == 0 end)()`), true);
  assert.equal(m.lua(`${M}.botonPanel.icono:GetTexture()`), 'Interface\\AddOns\\SnetForever\\recursos\\forge-controls');
  assert.deepEqual(m.lua(`{${M}.botonPanel:GetPoint(1)}`).filter((v) => typeof v !== 'object'), ['LEFT', 'LEFT', 3, 0]);
  assert.equal(m.lua(`${M}.pie:GetHeight()`), 18);
  m.lua(`${M}.botonPanel:Click("RightButton")`);
  assert.deepEqual(opcionesContexto(m), ['Ajustes', 'Elegir guía', 'Avisar de un fallo']);
  pulsarContexto(m, 'Avisar de un fallo');
  assert.equal(m.marco('SnetForeverFallo').visible, true);
  assert.match(m.lua('SnetForeverFallo.etiquetaPaso:GetText()'), /^Paso 1: /);
  m.lua(`${M}.botonPanel:Click("RightButton")`);
  pulsarContexto(m, 'Elegir guía');
  assert.equal(m.marco('SnetForeverMenuGuias').visible, true);
  // Con saltados, también «Saltados: N», que abre el panel en esa sección.
  m.lua('SnetForever.Motor.saltar(1)');
  m.lua(`SnetForever.Panel = {abrir = function(s) SnetForever.ABIERTO = s or "?" end}; ${M}.botonPanel:Click("RightButton")`);
  assert.deepEqual(opcionesContexto(m), ['Ajustes', 'Elegir guía', 'Avisar de un fallo', 'Saltados: 1']);
  pulsarContexto(m, 'Saltados: 1');
  assert.equal(m.lua('SnetForever.ABIERTO'), 'saltados');
  m.lua(`${M}.botonPanel:Click("RightButton")`);
  pulsarContexto(m, 'Ajustes');
  assert.equal(m.lua('SnetForever.ABIERTO'), '?');
  sinErrores(m);
});

test('fin de la guía → tarjeta «Fin de la guía» con «Elegir guía»; con volverA, también «Volver a <guía>»', () => {
  const m = conGuia([{ elementos: [MANUAL('Último')] }]);
  menuPaso(m, 1, 'Saltar este paso');
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), true);
  assert.equal(numPasos(m), 0);
  assert.equal(texto(m, `${M}.estado.mensaje`), 'Fin de la guía');
  assert.equal(visible(m, `${M}.estado.elegir`), true);
  assert.equal(texto(m, `${M}.estado.elegir.texto`), 'Elegir guía');
  assert.equal(visible(m, `${M}.estado.volver`), false);
  // Es una tarjeta del bloque, encima de la cabecera.
  assert.equal(m.lua(`(function() local a, rel, b, x, y = ${M}.estado:GetPoint(1) return a == "BOTTOMLEFT" and rel == ${M}.cabecera and y == 4 end)()`), true);
  m.lua(`SnetForeverPJ.volverA = ${aLua(SIGUE)}; ${V}.pintar()`);
  assert.equal(visible(m, `${M}.estado.volver`), true);
  assert.equal(texto(m, `${M}.estado.volver.texto`), 'Volver a 2-3 Sigue (paso 1)');
  m.lua(`${M}.estado.elegir:Click()`);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, true);
  m.lua(`${M}.estado.volver:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), SIGUE);
  assert.equal(texto(m, `${M}.estado.mensaje`) === 'Fin de la guía' && visible(m, `${M}.estado.mensaje`), false);
  sinErrores(m);
});

test('Vigilancia 5: raza Vulpera → SIN_GUIA y «Elegir guía», sin error', () => {
  const m = nuevaMaquina({ jugador: { raza: 'Vulpera' } });
  assert.equal(m.lua('SnetForever.Guias.porDefecto()'), undefined);
  m.lua(`${V}.crear()`);
  assert.equal(texto(m, `${M}.estado.mensaje`), 'No hay guía por defecto para tu personaje. Elige una.');
  assert.equal(visible(m, `${M}.estado.mensaje`), true);
  assert.equal(visible(m, `${M}.estado.elegir`), true);
  assert.equal(numPasos(m), 0);
  assert.equal(siguientes(m).length, 0);
  assert.equal(visible(m, `${M}.lista`), false, 'sin pasos, sin lista');
  assert.equal(texto(m, `${M}.titulo`), 'SnetForever');
  assert.equal(texto(m, `${M}.tramo`), '');
  m.lua(`${M}.estado.elegir:Click()`);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, true);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Marco: posición del bloque, topes, combate, movimiento, ajustes
// ---------------------------------------------------------------------------------------------------

// ¿La tarjeta `expr` está anclada encima de la cabecera (BOTTOMLEFT → TOPLEFT) o debajo del pie (TOPLEFT → BOTTOMLEFT)?
const sitio = (m, expr) => m.lua(`(function() local a, rel, b, x, y = ${expr}:GetPoint(1)
  if a == "BOTTOMLEFT" and rel == ${M}.cabecera and b == "TOPLEFT" then return "arriba:" .. y end
  if a == "TOPLEFT" and rel == ${M}.pie and b == "BOTTOMLEFT" then return "abajo:" .. y end
  return a end)()`);

test('el bloque activo va encima de la cabecera (4 de hueco); debajo del pie si no cabe o con ventana.pasoArriba falso', () => {
  const m = conInicio();
  assert.equal(sitio(m, `${M}.pasos[1].marco`), 'arriba:4');
  // Arriba del todo de la pantalla: no cabe encima y pasa debajo del pie (4 de hueco y lo que asoma la pestaña).
  m.lua('SnetForever.Ajustes.set("ventana.pos", {punto = "TOPLEFT", relPunto = "TOPLEFT", x = 20, y = -5})');
  assert.equal(sitio(m, `${M}.pasos[1].marco`), 'abajo:-15');
  m.lua('SnetForever.Ajustes.set("ventana.pos", nil)');
  assert.equal(sitio(m, `${M}.pasos[1].marco`), 'arriba:4');
  m.lua('SnetForever.Ajustes.set("ventana.pasoArriba", false)');
  assert.equal(sitio(m, `${M}.pasos[1].marco`), 'abajo:-15');
  // Varias tarjetas se apilan: un pegajoso encima del actual, dejando sitio a la pestaña del actual.
  const r = conGuia([
    { elementos: [MANUAL('Pegajoso')], etiquetas: { sticky: true } },
    { elementos: [MANUAL('Actual')] },
  ]);
  assert.equal(sitio(r, `${M}.pasos[2].marco`), 'arriba:4');
  const alto2 = r.lua(`${M}.pasos[2].marco:GetHeight()`);
  assert.equal(sitio(r, `${M}.pasos[1].marco`), `arriba:${4 + alto2 + 11 + 5}`);
  sinErrores(m);
  sinErrores(r);
});

test('topes: cabecera, lista y pie hasta el 35 % de la pantalla (lo que sobra de la lista se quita); el bloque, hasta el 40 %', () => {
  const largo = (n) => MANUAL(`Paso ${n}: ${'texto largo de verdad '.repeat(6)}`);
  const pasos = Array.from({ length: 12 }, (_, i) => ({ elementos: [largo(i + 1)] }));
  const m = conGuia(pasos);
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 8)');
  const alto8 = m.marco('SnetForeverVentana').alto;
  assert.ok(alto8 <= 1080 * 0.35, `${alto8}`);
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 2)');
  const alto2 = m.marco('SnetForeverVentana').alto;
  assert.ok(alto2 < alto8, 'con menos siguientes, más baja');
  // Pantalla pequeña: no cabe todo y se quitan tarjetas.
  m.lua('UIParent:SetHeight(400); SnetForever.Ajustes.set("ventana.siguientes", 8)');
  const alto = m.marco('SnetForeverVentana').alto;
  assert.ok(alto <= 400 * 0.35, `${alto}`);
  assert.ok(siguientes(m).length < 9, `${siguientes(m).length}`);
  // Con escala 1,5 cuenta el alto en pantalla.
  m.lua('SnetForever.Ajustes.set("ventana.escala", 1.5)');
  assert.ok(m.marco('SnetForeverVentana').alto * 1.5 <= 400 * 0.35 + 0.001);
  sinErrores(m);
});

test('G: con 25 pegajosos activos el bloque no pasa del 40 %, el paso actual no se pierde y los que no caben se ocultan', () => {
  const pasos = [];
  for (let i = 1; i <= 25; i++) pasos.push({ elementos: [MANUAL(`Pegajoso ${i}`), MANUAL(`Otra línea ${i}`)], etiquetas: { sticky: true } });
  pasos.push({ elementos: [MANUAL('El actual')] });
  pasos.push({ elementos: [MANUAL('Después')] });
  const m = conGuia(pasos);
  const activos = m.lua('#SnetForever.Motor.estado().activos');
  assert.ok(activos > 20, `${activos} activos`);
  // Con la ventana abajo del todo el 40 % cabe encima de la cabecera.
  m.lua('SnetForever.Ajustes.set("ventana.pos", {punto = "BOTTOMLEFT", relPunto = "BOTTOMLEFT", x = 20, y = 20})');
  const medidas = m.lua(`(function()
    local salida = {maximo = UIParent:GetHeight() * 0.4 / SnetForeverVentana:GetScale(), bloques = {}}
    local arriba = 0
    for k, paso in ipairs(${M}.pasos) do
      local a, rel, b, x, y = paso.marco:GetPoint(1)
      local asoma = paso.pestana:IsShown() and 11 or 0
      arriba = math.max(arriba, y + paso.marco:GetHeight() + asoma)
      salida.bloques[k] = {i = paso.i, visible = paso.marco:IsVisible(), ancla = a, rel = rel == ${M}.cabecera}
    end
    salida.arriba = arriba
    salida.actual = SnetForever.Motor.estado().actual
    return salida
  end)()`);
  assert.ok(medidas.arriba <= medidas.maximo + 0.01, `${medidas.arriba} > ${medidas.maximo}`);
  assert.ok(medidas.bloques.length < activos + 1, 'no caben todos: se pintan menos');
  assert.ok(medidas.bloques.length >= 1);
  for (const b of medidas.bloques) {
    assert.equal(b.visible, true);
    assert.equal(b.ancla, 'BOTTOMLEFT');
    assert.equal(b.rel, true);
  }
  assert.ok(medidas.bloques.some((b) => b.i === medidas.actual), 'el paso actual está pintado');
  // Los bloques que no caben quedan ocultos: los visibles con .i son solo los pintados.
  const conPaso = m.lua(`(function() local n = 0 for _, h in ipairs({SnetForeverVentana:GetChildren()}) do
    if h.i and h:IsShown() then n = n + 1 end end return n end)()`);
  assert.equal(conPaso, medidas.bloques.length);
  // En su sitio de siempre (centro izquierda) ese bloque no cabe encima: pasa debajo del pie.
  m.lua('SnetForever.Ajustes.set("ventana.pos", nil)');
  assert.match(sitio(m, `${M}.pasos[${medidas.bloques.length}].marco`), /^abajo:/);
  sinErrores(m);
});

test('con ocultarEnCombate: PLAYER_REGEN_DISABLED oculta todo (bloque incluido) y ENABLED la vuelve a enseñar; sin él, sigue visible', () => {
  const m = conInicio();
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.marco('SnetForeverVentana').visible, true);
  m.disparar('PLAYER_REGEN_ENABLED');
  m.lua('SnetForever.Ajustes.set("ventana.ocultarEnCombate", true)');
  derechoPaso(m, 1);
  assert.equal(m.marco('SnetForeverMenuContexto').visible, true);
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.marco('SnetForeverVentana').visible, false);
  assert.equal(visible(m, `${M}.pasos[1].marco`), false, 'el bloque activo cuelga de la ventana');
  assert.equal(visible(m, `${M}.tarjetasLista[1]`), false);
  assert.equal(m.marco('SnetForeverMenuContexto').visible, false, 'el menú contextual se cierra');
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.visible")'), true, 'ocultar en combate no cambia el ajuste');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.marco('SnetForeverVentana').visible, true);
  assert.equal(visible(m, `${M}.pasos[1].marco`), true);
  // Oculta a mano: al salir del combate no vuelve.
  m.lua(`${V}.mostrar(false)`);
  m.disparar('PLAYER_REGEN_DISABLED');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.marco('SnetForeverVentana').visible, false);
  sinErrores(m);
});

test('crear en combate con ocultarEnCombate: nace oculta (InCombatLockdown) y sale al acabar el combate', () => {
  const m = nuevaMaquina({ jugador: { enCombate: true } });
  m.lua('SnetForever.Ajustes.set("ventana.ocultarEnCombate", true)');
  m.lua(`${V}.crear()`);
  assert.equal(m.marco('SnetForeverVentana').visible, false);
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.marco('SnetForeverVentana').visible, true);
  sinErrores(m);
});

test('mostrar(bool) y alternar() guardan ventana.visible; oculta tras recargar() sigue oculta', () => {
  const m = conInicio();
  m.lua(`${V}.alternar()`);
  assert.equal(m.marco('SnetForeverVentana').visible, false);
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.visible")'), false);
  m.lua(`${V}.alternar()`);
  assert.equal(m.marco('SnetForeverVentana').visible, true);
  m.lua(`${V}.mostrar(false)`);
  const m2 = m.recargar();
  m2.lua(`${V}.crear()`);
  assert.equal(m2.marco('SnetForeverVentana').visible, false);
  sinErrores(m2);
});

test('con bloqueada, el clic no llama a StartMoving; sin bloquear, al soltar se guarda ventana.pos y se restaura', () => {
  const m = conInicio();
  const abajo = () => m.lua('SnetForeverVentana:GetScript("OnMouseDown")(SnetForeverVentana, "LeftButton")');
  const arriba = () => m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "LeftButton")');
  assert.equal(m.lua('SnetForeverVentana:IsMovable()'), true);
  m.lua('SnetForever.Ajustes.set("ventana.bloqueada", true)');
  abajo();
  arriba();
  assert.deepEqual(m.llamadas('StartMoving'), []);
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.pos")'), undefined);
  m.lua('SnetForever.Ajustes.set("ventana.bloqueada", false)');
  m.lua('SnetForeverVentana:GetScript("OnMouseDown")(SnetForeverVentana, "RightButton")');
  assert.deepEqual(m.llamadas('StartMoving'), [], 'solo con el botón izquierdo');
  m.lua('BANCO.arrastre = {x = 50, y = -30}');
  abajo();
  arriba();
  assert.deepEqual(m.llamadas('StartMoving'), [['SnetForeverVentana']]);
  const pos = m.lua('SnetForever.Ajustes.get("ventana.pos")');
  assert.deepEqual(pos, { punto: 'LEFT', relPunto: 'LEFT', x: 210, y: 30 });
  const m2 = m.recargar();
  m2.lua(`${V}.crear()`);
  const p = m2.marco('SnetForeverVentana').puntos;
  assert.deepEqual(p, [{ punto: 'LEFT', relativo: 'UIParent', relPunto: 'LEFT', x: 210, y: 30 }]);
  sinErrores(m2);
});

test('ajustes: alfa 0,5 en los fondos (también en las tarjetas de la lista); ancho y escala con sus límites; ventana.pos nil la devuelve a su sitio', () => {
  const m = conInicio();
  m.lua('SnetForever.Ajustes.set("ventana.alfa", 0.5)');
  assert.equal(m.lua(`select(4, ${M}.lista.snfFondo:GetVertexColor())`), 0.5);
  assert.equal(m.lua(`select(4, ${M}.cabecera.snfFondo:GetVertexColor())`), 0.5);
  assert.equal(m.lua(`select(4, ${M}.tarjetasLista[2].fondo:GetVertexColor())`), 0.5);
  m.lua('SnetForever.Ajustes.set("ventana.ancho", 400)');
  assert.equal(m.marco('SnetForeverVentana').ancho, 400);
  assert.equal(m.lua(`${M}.pasos[1].marco:GetWidth()`), 400, 'el bloque activo sigue el ancho');
  m.lua('SnetForever.Ajustes.set("ventana.ancho", 9999)');
  assert.equal(m.marco('SnetForeverVentana').ancho, 500);
  m.lua('SnetForever.Ajustes.set("ventana.escala", 1.2)');
  assert.equal(m.marco('SnetForeverVentana').escala, Math.fround(1.2)); // el banco guarda la escala como float de 32 bits, como el cliente
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 99)');
  assert.equal(siguientes(m).length, 6, 'Inicio tiene 6 pasos en la lista (el 7 es de mazmorra)');
  m.lua('SnetForever.Ajustes.set("ventana.pos", {punto = "TOP", relPunto = "TOP", x = 0, y = -10})');
  assert.equal(m.marco('SnetForeverVentana').puntos[0].punto, 'TOP');
  m.lua('SnetForever.Ajustes.set("ventana.pos", nil)');
  assert.deepEqual(m.marco('SnetForeverVentana').puntos, [{ punto: 'LEFT', relativo: 'UIParent', relPunto: 'LEFT', x: 160, y: 60 }]);
  sinErrores(m);
});

test('se repinta con SNF_PASOS_CAMBIADOS, SNF_GUIA_CARGADA y SNF_AJUSTE_CAMBIADO', () => {
  const m = conInicio();
  m.lua('SnetForever.Motor.irA(4)');
  assert.ok(contiene(lineas(m, 1), 'Compra'), lineas(m, 1).join(' | '));
  m.lua(`SnetForever.Guias.cargar(${aLua(SIGUE)})`);
  assert.match(texto(m, `${M}.titulo`), /2-3 Sigue/);
  assert.equal(texto(m, `${M}.tramo`), 'Nivel 2-3');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.match(texto(m, `${M}.titulo`), /2-3 Next/);
  assert.equal(texto(m, `${M}.tramo`), 'Level 2-3');
  sinErrores(m);
});

test('cambiar ventana.tema repinta los textos en gris, la lista, las casillas y el emblema', () => {
  const m = conGuia([{ elementos: [{ t: 'accept', q: 789 }] }, { elementos: [MANUAL('Dos')] }]);
  m.lua('SnetForever.Ajustes.set("ventana.tema", "neutro")');
  casi(colorTexto(m, `${M}.tramo`), hex('#C5BEB5'), 'tramo');
  casi(colorTexto(m, `${M}.siguientesNumeros[1]`), hex('#C5BEB5'), 'número');
  casi(colorTexto(m, `${M}.pie.version`), hex('#C5BEB5'), 'versión');
  casi(rgb(m, `${M}.tarjetasLista[1].fondo`), hex('#443D37'), 'tarjeta activa');
  casi(rgb(m, `${M}.tarjetasLista[2].fondo`), hex('#242424'), 'tarjeta');
  casi(rgb(m, `${M}.pasos[1].casillas[1].aro`), hex('#584C43'), 'aro de la casilla');
  casi(rgb(m, `${M}.emblema.aro`), hex('#584C43'), 'aro del emblema');
  casi(rgb(m, `${M}.barra.pulgar`), hex('#443D37'), 'pulgar');
  casi(rgb(m, `${M}.lista.snfFondo`), hex('#191919'), 'lista');
  sinErrores(m);
});

test('tooltips: ⚙ enseña «Ajustes» y «Clic derecho: menú» con GameTooltip; si está prohibido no se toca', () => {
  const m = conInicio();
  m.lua(`${M}.botonPanel:GetScript("OnEnter")(${M}.botonPanel)`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Ajustes', 'Clic derecho: menú']);
  m.lua(`${M}.botonPanel:GetScript("OnLeave")(${M}.botonPanel)`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  m.lua('BANCO.tooltipProhibido = true; GameTooltip:Hide()');
  const antes = m.llamadas('GameTooltip:SetOwner').length;
  m.lua(`${M}.botonPanel:GetScript("OnEnter")(${M}.botonPanel)`);
  assert.equal(m.llamadas('GameTooltip:SetOwner').length, antes);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Menú de guías
// ---------------------------------------------------------------------------------------------------

test('menú: un orco ve «Prueba (H)» (normal) y, con «Con mazmorras», «Prueba (H) Mazmorras»; nunca «Prueba (A)»', () => {
  const m = conInicio();
  assert.equal(m.marco('SnetForeverMenuGuias').visible, false);
  abrirGuias(m);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, true);
  let t = textos(m, 'SnetForeverMenuGuias');
  assert.ok(contiene(t, 'Prueba (H)'), t.join(' | '));
  assert.ok(!t.some((s) => s.includes('Prueba (H) Mazmorras')), 'la versión normal no lista mazmorras');
  assert.ok(!contiene(t, 'Prueba (A)'));
  assert.ok(!contiene(t, 'Mago AoE'), 'el guerrero no ve la de mago');
  assert.ok(contiene(t, 'Normal') && contiene(t, 'Con mazmorras'));
  // Abrir el grupo enseña sus guías; pulsar «2-3 Sigue» la carga y cierra el menú.
  assert.ok(!contiene(t, '2-3 Sigue'), 'los grupos empiezan cerrados');
  pulsarMenu(m, 'Prueba (H)');
  t = textos(m, 'SnetForeverMenuGuias');
  assert.ok(contiene(t, '1-2 Inicio') && contiene(t, '2-3 Sigue') && contiene(t, '1-9 Cielonato'), t.join(' | '));
  pulsarMenu(m, '2-3 Sigue');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), SIGUE);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, false);
  // «Con mazmorras» llama a Guias.cambiarVersion (Sigue no tiene otra versión: cambia solo el ajuste).
  m.lua(`SnetForever.CAMBIOS = 0
  hooksecurefunc(SnetForever.Guias, "cambiarVersion", function() SnetForever.CAMBIOS = SnetForever.CAMBIOS + 1 end)`);
  abrirGuias(m);
  m.lua(`${M}.menu.mazmorras:Click()`);
  assert.equal(m.lua('SnetForever.CAMBIOS'), 1);
  assert.equal(m.lua('SnetForever.Ajustes.get("version")'), 'mazmorras');
  t = textos(m, 'SnetForeverMenuGuias');
  assert.ok(contiene(t, 'Prueba (H) Mazmorras'), t.join(' | '));
  assert.ok(!t.some((s) => s === 'Prueba (H)'), t.join(' | '));
  assert.ok(!contiene(t, 'Prueba (A)'));
  sinErrores(m);
});

test('menú (lote A): con «Con mazmorras» salen también las normales de los tramos sin mazmorras, en grupos marcados «normal»', () => {
  const m = conInicio();
  m.lua('SnetForever.Guias.elegirVersion("mazmorras")');
  abrirGuias(m);
  let t = textos(m, 'SnetForeverMenuGuias');
  assert.ok(contiene(t, 'Prueba (H) Mazmorras'), t.join(' | '));
  // Prueba (H) tiene guías normales que pasan del nivel 2 (donde acaban las de mazmorras): sale como grupo normal.
  assert.ok(t.includes('Prueba (H) · normal'), t.join(' | '));
  assert.ok(!t.includes('Prueba (H)'), 'el grupo normal se distingue del de mazmorras');
  pulsarMenu(m, 'Prueba (H) · normal');
  t = textos(m, 'SnetForeverMenuGuias');
  assert.ok(contiene(t, '2-3 Sigue') && contiene(t, '1-9 Cielonato'), t.join(' | '));
  assert.ok(!t.includes('1-2 Inicio'), 'la normal de un tramo con mazmorras no sale');
  pulsarMenu(m, '2-3 Sigue');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), SIGUE);
  // En inglés, el mismo grupo con su texto.
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  abrirGuias(m);
  assert.ok(textos(m, 'SnetForeverMenuGuias').includes('Prueba (H) · normal'));
  sinErrores(m);
});

test('menú: «Con mazmorras» con Inicio cargado pasa a la guía de mazmorras; pulsar fuera o Escape lo cierra', () => {
  const m = conInicio();
  abrirGuias(m);
  m.lua(`${M}.menu.mazmorras:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), 'Prueba (H) Mazmorras\\01-02 Inicio');
  assert.equal(m.lua('SnetForever.Ajustes.get("version")'), 'mazmorras');
  m.lua(`${M}.menu.normal:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), INICIO);
  // Pulsar fuera: el fondo que cubre la pantalla cierra el menú.
  assert.equal(m.marco('SnetForeverMenuGuias').visible, true);
  m.lua(`${M}.menu.fondo:GetScript("OnMouseDown")(${M}.menu.fondo, "LeftButton")`);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, false);
  assert.equal(m.lua(`${M}.menu.fondo:IsShown()`), false);
  // El clic derecho otra vez lo abre y otra vez lo cierra; Escape (UISpecialFrames) también vale.
  abrirGuias(m);
  abrirGuias(m);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, false);
  assert.ok(m.lua('UISpecialFrames').includes('SnetForeverMenuGuias'));
  assert.ok(m.lua('UISpecialFrames').includes('SnetForeverMenuContexto'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Avisos de clase
// ---------------------------------------------------------------------------------------------------

test('avisos: un druida que sube a 10 ve la tarjeta con «Ahora» y «Más tarde»; «Más tarde» la quita', () => {
  const m = nuevaMaquina({ datos: DATOS_CON_AVISOS, jugador: DRUIDA });
  m.lua(`${V}.crear()`);
  assert.equal(visible(m, `${M}.aviso`), false);
  m.jugador({ nivel: 10 });
  m.disparar('PLAYER_LEVEL_UP', 10);
  assert.equal(visible(m, `${M}.aviso`), true);
  assert.equal(texto(m, `${M}.aviso.texto`), 'Nivel 10: Cadena de druida: la tormenta de Claro de la Luna');
  assert.equal(visible(m, `${M}.aviso.ahora`), true);
  assert.equal(texto(m, `${M}.aviso.masTarde.texto`), 'Más tarde');
  // Franja amarilla de 2 px a la izquierda; botones de 16 de alto.
  casi(rgb(m, `${M}.aviso.franja`), [0xfc / 255, 0xdc / 255, 0], 'franja');
  assert.equal(m.lua(`${M}.aviso.franja:GetWidth()`), 2);
  assert.equal(m.lua(`${M}.aviso.masTarde:GetHeight()`), 16);
  m.lua(`${M}.aviso.masTarde:Click()`);
  assert.equal(visible(m, `${M}.aviso`), false);
  assert.deepEqual(m.lua('SnetForeverPJ.avisos.pendientes'), ['druida-10-tormenta']);
  // A nivel 20 llegan dos sin guía que se pueda cargar: sale el primero, sin «Ahora».
  m.jugador({ nivel: 20 });
  m.disparar('PLAYER_LEVEL_UP', 20);
  assert.equal(visible(m, `${M}.aviso`), true);
  assert.equal(texto(m, `${M}.aviso.texto`), 'Nivel 15: Cadena de druida: guía perdida');
  assert.equal(visible(m, `${M}.aviso.ahora`), false);
  m.lua(`${M}.aviso.masTarde:Click()`);
  assert.equal(texto(m, `${M}.aviso.texto`), 'Nivel 20: Cadena de druida: sin guía');
  sinErrores(m);
});

test('avisos: «Ahora» carga la guía del aviso y quita la tarjeta', () => {
  const m = nuevaMaquina({ datos: DATOS_CON_AVISOS, jugador: DRUIDA });
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  m.lua(`${V}.crear()`);
  m.jugador({ nivel: 10 });
  m.disparar('PLAYER_LEVEL_UP', 10);
  m.lua(`${M}.aviso.ahora:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), SIGUE);
  assert.equal(visible(m, `${M}.aviso`), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Idioma, números y globales
// ---------------------------------------------------------------------------------------------------

test('con idioma en, el menú del paso dice «Skip this step» y los demás textos van en inglés', () => {
  const m = conInicio(EN);
  derechoPaso(m, 1);
  assert.deepEqual(opcionesContexto(m), ['Skip this step', 'Report a problem']);
  assert.equal(limpio(texto(m, `${M}.pasos[1].pestana.texto`)), 'Step 1 · guide 1');
  assert.equal(texto(m, `${M}.tramo`), 'Level 1-2');
  assert.match(texto(m, `${M}.titulo`), /1-2 Start/);
  assert.equal(texto(m, `${M}.pie.version`), 'SnetForever v0.7.0');
  m.lua(`${M}.botonPanel:Click("RightButton")`);
  assert.deepEqual(opcionesContexto(m), ['Settings', 'Choose a guide', 'Report a problem']);
  sinErrores(m);
});

test('Vigilancia 4: ningún texto de la ventana ni del menú contiene «.0»', () => {
  const m = conInicio({ jugador: { nivel: 1 } });
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 8)');
  m.lua('SnetForever.Ajustes.set("ventana.escala", 1.5)');
  menuPaso(m, 1, 'Saltar este paso');
  abrirGuias(m);
  pulsarMenu(m, 'Prueba (H)');
  // La versión del pie («SnetForever v0.5.15») es un texto fijo, no un número formateado: se deja aparte.
  const todos = [...textos(m), ...textos(m, 'SnetForeverMenuGuias')].filter((s) => s !== 'SnetForever v0.7.0');
  assert.ok(todos.length > 10, `${todos.length}`);
  for (const s of todos) assert.ok(!s.includes('.0'), s);
  const g = conGuia([
    { elementos: [{ t: 'goto', mapa: 1411, x: 40, y: 60 }] },
    { elementos: [{ t: 'xp', nivel: 10 }], requisitos: [{ t: 'nivel', n: 10 }, { t: 'grupo', n: 5 }] },
    { elementos: [{ t: 'collect', i: 159, n: 5 }] },
  ]);
  g.lua('SnetForever.Ajustes.set("ventana.siguientes", 8)');
  for (const s of textos(g).filter((x) => x !== 'SnetForever v0.7.0')) assert.ok(!s.includes('.0'), s);
  sinErrores(m);
  sinErrores(g);
});

test('la ventana y sus menús solo crean globales permitidas', () => {
  const m = conInicio();
  abrirGuias(m);
  derechoPaso(m, 1);
  for (const nombre of m.globalesNuevas()) assert.ok(globalPermitida(nombre), nombre);
  assert.ok(m.globalesNuevas().includes('SnetForeverVentana'));
  assert.ok(m.globalesNuevas().includes('SnetForeverMenuGuias'));
  assert.ok(m.globalesNuevas().includes('SnetForeverMenuContexto'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Tarea 22 (prueba en el juego): objetivos al entrar
// ---------------------------------------------------------------------------------------------------

// Al entrar al mundo el cliente aún no tiene los objetivos (C_QuestLog.GetQuestObjectives vacío) y la ventana pintaba
// el texto genérico «misión: 0/1»; cuando llegaban los datos nadie la repintaba porque el paso no cambiaba.
const PASO_COMPLETE = [{ elementos: [{ t: 'complete', q: 788, objetivo: 1 }] }];
const OBJETIVOS_788 = [{ texto: '2/8 Rufián Tótem Siniestro', hecho: 2, pedido: 8, terminado: false }];

test('objetivos vacíos al entrar → texto genérico; al llegar los datos con QUEST_LOG_UPDATE la ventana enseña «2/8 …»', () => {
  const m = nuevaMaquina();
  m.estadoMision(788, { enDiario: true });
  m.ponerGuia(guiaDePrueba(PASO_COMPLETE));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua(`${V}.crear()`);
  assert.ok(lineas(m, 1)[0].endsWith('0/1'), lineas(m, 1)[0]);
  m.estadoMision(788, { enDiario: true, objetivos: OBJETIVOS_788 });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  // Un complete de monstruo lleva delante el icono de espadas (tarea D2), como textura en el paso activo.
  assert.equal(lineas(m, 1)[0], '2/8 Rufián Tótem Siniestro');
  assert.equal(m.lua(`${M}.pasos[1].lineas[1].icono:GetTexture()`), 'Interface\\GossipFrame\\BattleMasterGossipIcon');
  assert.equal(m.lua(`${M}.pasos[1].lineas[1].casilla.marca:IsShown()`), false, 'con su casilla vacía');
  sinErrores(m);
});

test('los repintados por QUEST_LOG_UPDATE y QUEST_WATCH_UPDATE se agrupan: como mucho uno cada 0,25 s', () => {
  const m = nuevaMaquina();
  m.estadoMision(788, { enDiario: true });
  m.ponerGuia(guiaDePrueba(PASO_COMPLETE));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua(`${V}.crear()`);
  m.lua(`PINTADAS = 0; local original = ${V}.pintar; ${V}.pintar = function(...) PINTADAS = PINTADAS + 1; return original(...) end`);
  for (let i = 0; i < 10; i++) m.disparar(i % 2 ? 'QUEST_WATCH_UPDATE' : 'QUEST_LOG_UPDATE', 788);
  assert.equal(m.lua('PINTADAS'), 0, 'no se repinta en cada evento');
  m.avanzar(0.3);
  assert.equal(m.lua('PINTADAS'), 1, 'diez eventos seguidos → un solo repintado');
  m.avanzar(1);
  assert.equal(m.lua('PINTADAS'), 1, 'sin eventos nuevos no se repinta más');
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  assert.equal(m.lua('PINTADAS'), 2);
  sinErrores(m);
});

test('QUEST_LOG_UPDATE antes de crear la ventana no rompe nada', () => {
  const m = nuevaMaquina({ entrar: false });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Tarea D1: guide styles (Forge and Neutral palettes, sombra, tarjetas, pestañas) y UI.botonIcono
// ---------------------------------------------------------------------------------------------------

const E = 'SnetForever.Estilo';

const PALETAS = {
  forge: { fondo: '#191717', fondoLista: '#24201F', fondoCabecera: '#302929', resalte: '#4C3025', borde: '#775744',
    texto: '#F5E8D4', secundario: '#CBBEB1', pestana: '#E6AC72' },
  neutro: { fondo: '#191919', fondoLista: '#242424', fondoCabecera: '#303030', resalte: '#443D37', borde: '#584C43',
    texto: '#F4EEE6', secundario: '#C5BEB5', pestana: '#D1B9A7' },
};

test('Estilo.TEMAS y Estilo.color: los tokens de cada tema y Forja por defecto', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.tema")'), 'forge');
  for (const [tema, tokens] of Object.entries(PALETAS)) {
    for (const [token, h] of Object.entries(tokens)) {
      casi(m.lua(`{unpack(${E}.TEMAS.${tema}.${token}, 1, 3)}`), hex(h), `${tema}.${token}`);
    }
  }
  // Estilo.color sigue a ventana.tema.
  for (const [tema, tokens] of Object.entries(PALETAS)) {
    m.lua(`SnetForever.Ajustes.set("ventana.tema", ${aLua(tema)})`);
    for (const [token, h] of Object.entries(tokens)) {
      casi(m.lua(`{unpack(${E}.color(${aLua(token)}), 1, 3)}`), hex(h), `color ${tema}.${token}`);
      assert.equal(m.lua(`${E}.color(${aLua(token)})[4]`), 1);
    }
  }
  // Un tema desconocido cae en Forja.
  m.lua('SnetForever.Ajustes.set("ventana.tema", "raro")');
  casi(m.lua(`{unpack(${E}.color("fondo"), 1, 3)}`), hex('#191717'), 'tema desconocido');
  sinErrores(m);
});

test('Estilo.fuente: sombra negra de (1, -1) y TAMANOS nuevos; también en el texto de la ventana', () => {
  const m = conInicio();
  assert.deepEqual(m.lua(`${E}.TAMANOS`), { titulo: 11, paso: 11, lista: 10, pequeno: 9 });
  assert.deepEqual(m.lua(`{${M}.titulo:GetShadowOffset()}`), [1, -1]);
  assert.deepEqual(m.lua(`{${M}.titulo:GetShadowColor()}`), [0, 0, 0, 1]);
  assert.equal(m.lua(`select(2, ${M}.titulo:GetFont())`), 11);
  // Todos los textos propios llevan sombra: un texto suelto y una línea del paso.
  m.lua('SnetForeverPruebaS = SnetForever.UI.texto(UIParent, 10)');
  assert.deepEqual(m.lua('{SnetForeverPruebaS:GetShadowOffset()}'), [1, -1]);
  assert.deepEqual(m.lua('{SnetForeverPruebaS:GetShadowColor()}'), [0, 0, 0, 1]);
  assert.deepEqual(m.lua(`{${M}.pasos[1].lineas[1]:GetShadowOffset()}`), [1, -1]);
  sinErrores(m);
});

test('Estilo.tarjeta: fondo y borde de 1 px con el token; ventana.alfa en el fondo', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForeverPruebaK = CreateFrame("Frame", nil, UIParent); ${E}.tarjeta(SnetForeverPruebaK, "fondoLista")`);
  assert.equal(m.lua('SnetForeverPruebaK.snfFondo:GetTexture()'), 'Interface\\Buttons\\WHITE8X8');
  casi(rgb(m, 'SnetForeverPruebaK.snfFondo'), hex('#24201F'), 'fondoLista');
  assert.equal(m.lua('({SnetForeverPruebaK.snfFondo:GetVertexColor()})[4]'), 0.92, 'alfa por defecto 0,92');
  assert.equal(m.lua('#SnetForeverPruebaK.snfBordes'), 4);
  for (let i = 1; i <= 4; i++) {
    casi(rgb(m, `SnetForeverPruebaK.snfBordes[${i}]`), hex('#775744'), `borde ${i}`);
    assert.equal(m.lua(`({SnetForeverPruebaK.snfBordes[${i}]:GetVertexColor()})[4]`), 1);
  }
  assert.equal(m.lua('SnetForeverPruebaK.snfBordes[1]:GetHeight()'), 1);
  assert.equal(m.lua('SnetForeverPruebaK.snfBordes[3]:GetWidth()'), 1);
  // Repetir no duplica texturas (fondo + 4 bordes).
  m.lua(`${E}.tarjeta(SnetForeverPruebaK, "fondoLista")`);
  assert.equal(m.lua('#{SnetForeverPruebaK:GetRegions()}'), 5);
  sinErrores(m);
});

test('cambiar ventana.tema o ventana.alfa repinta los fondos y bordes ya puestos (la ventana y una tarjeta)', () => {
  const m = conInicio();
  m.lua(`SnetForeverPruebaK = CreateFrame("Frame", nil, UIParent); ${E}.tarjeta(SnetForeverPruebaK, "fondoCabecera")`);
  const L = `${M}.lista`;
  const alfaLista = () => m.lua(`({${L}.snfFondo:GetVertexColor()})[4]`);
  casi(rgb(m, `${L}.snfFondo`), hex('#191717'), 'lista de Forja');
  m.lua('SnetForever.Ajustes.set("ventana.tema", "neutro")');
  casi(rgb(m, `${L}.snfFondo`), hex('#191919'), 'lista neutra');
  casi(rgb(m, 'SnetForeverPruebaK.snfFondo'), hex('#303030'), 'tarjeta neutra');
  casi(rgb(m, `${L}.snfBordes[1]`), hex('#584C43'), 'borde neutro');
  m.lua('SnetForever.Ajustes.set("ventana.alfa", 0.5)');
  assert.equal(alfaLista(), 0.5);
  assert.equal(m.lua('({SnetForeverPruebaK.snfFondo:GetVertexColor()})[4]'), 0.5);
  m.lua('SnetForever.Ajustes.set("ventana.tema", "azul")');
  casi(rgb(m, 'SnetForeverPruebaK.snfFondo'), hex('#302929'), 'tarjeta otra vez de Forja');
  assert.equal(alfaLista(), 0.5, 'el alfa se conserva al cambiar el tema');
  sinErrores(m);
});

test('Estilo.pestana: tarjeta con el texto de la pestaña (9 pt, color pestana) y ancho = texto + 10', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForeverPruebaP = ${E}.pestana(UIParent, "Paso 12")`);
  assert.equal(m.lua('SnetForeverPruebaP.texto:GetText()'), 'Paso 12');
  assert.equal(m.lua('SnetForeverPruebaP:GetWidth()'), m.lua('SnetForeverPruebaP.texto:GetUnboundedStringWidth() + 10'));
  assert.equal(m.lua('select(2, SnetForeverPruebaP.texto:GetFont())'), 9);
  casi(m.lua('{SnetForeverPruebaP.texto:GetTextColor()}').slice(0, 3), hex('#E6AC72'), 'color de la pestaña');
  casi(rgb(m, 'SnetForeverPruebaP.snfFondo'), hex('#302929'), 'fondoCabecera');
  // Cambiar el texto cambia el ancho.
  m.lua('SnetForeverPruebaP.ponerTexto("Objetivos cercanos")');
  assert.equal(m.lua('SnetForeverPruebaP.texto:GetText()'), 'Objetivos cercanos');
  assert.equal(m.lua('SnetForeverPruebaP:GetWidth()'), m.lua('SnetForeverPruebaP.texto:GetUnboundedStringWidth() + 10'));
  sinErrores(m);
});

test('UI.botonIcono: fondo cabecera, textura recortada 0,08-0,92, resalte ADD y ayuda con GameTooltip', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.PRUEBA = {clics = 0}
  SnetForeverPruebaB = SnetForever.UI.botonIcono(UIParent, "Interface\\\\Icons\\\\INV_Misc_Map_01", 16, "Ayuda del botón",
    function(boton) SnetForever.PRUEBA.clics = SnetForever.PRUEBA.clics + 1; SnetForever.PRUEBA.boton = boton end)`);
  assert.equal(m.lua('SnetForeverPruebaB:GetWidth()'), 16);
  assert.equal(m.lua('SnetForeverPruebaB:GetHeight()'), 16);
  casi(rgb(m, 'SnetForeverPruebaB.snfFondo'), hex('#302929'), 'fondoCabecera');
  assert.equal(m.lua('#SnetForeverPruebaB.snfBordes'), 4);
  assert.equal(m.lua('SnetForeverPruebaB.icono:GetTexture()'), 'Interface\\Icons\\INV_Misc_Map_01');
  assert.deepEqual(m.lua('{SnetForeverPruebaB.icono:GetTexCoord()}'), [0.08, 0.08, 0.08, 0.92, 0.92, 0.08, 0.92, 0.92]);
  assert.equal(m.lua('SnetForeverPruebaB:GetHighlightTexture():GetTexture()'), 'Interface\\Buttons\\ButtonHilight-Square');
  assert.equal(m.lua('SnetForeverPruebaB:GetHighlightTexture():GetBlendMode()'), 'ADD');
  assert.equal(m.lua('({SnetForeverPruebaB:GetHighlightTexture():GetVertexColor()})[4]'), 0.35);
  // Clic: alPulsar con el botón.
  m.lua('SnetForeverPruebaB:Click()');
  assert.equal(m.lua('SnetForever.PRUEBA.clics'), 1);
  assert.equal(m.lua('SnetForever.PRUEBA.boton == SnetForeverPruebaB'), true);
  // Ayuda al pasar el ratón.
  m.lua('SnetForeverPruebaB:GetScript("OnEnter")(SnetForeverPruebaB)');
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Ayuda del botón']);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  m.lua('SnetForeverPruebaB:GetScript("OnLeave")(SnetForeverPruebaB)');
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  sinErrores(m);
});

test('UI.botonIcono: el resalte sigue al tema (revisión de D1)', () => {
  const m = nuevaMaquina();
  m.lua('SnetForeverPruebaB = SnetForever.UI.botonIcono(UIParent, "Interface\\\\Icons\\\\INV_Misc_Map_01", 16)');
  casi(rgb(m, 'SnetForeverPruebaB:GetHighlightTexture()'), hex('#4C3025'), 'resalte de Forja');
  m.lua('SnetForever.Ajustes.set("ventana.tema", "neutro")');
  casi(rgb(m, 'SnetForeverPruebaB:GetHighlightTexture()'), hex('#443D37'), 'resalte neutro');
  assert.equal(m.lua('({SnetForeverPruebaB:GetHighlightTexture():GetVertexColor()})[4]'), 0.35);
  sinErrores(m);
});

test('UI.botonIcono: ayuda como función, sin ayuda ni alPulsar no falla y con el tooltip prohibido no lo toca', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.PRUEBA = {n = "uno"}
  SnetForeverPruebaB = SnetForever.UI.botonIcono(UIParent, "Interface\\\\Icons\\\\INV_Misc_Map_01", 14, function()
    return SnetForever.PRUEBA.n
  end)
  SnetForeverPruebaC = SnetForever.UI.botonIcono(UIParent, "Interface\\\\Icons\\\\INV_Misc_Map_01", 14)`);
  m.lua('SnetForeverPruebaB:GetScript("OnEnter")(SnetForeverPruebaB)');
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['uno']);
  m.lua('SnetForeverPruebaB:GetScript("OnLeave")(SnetForeverPruebaB)');
  m.lua('SnetForeverPruebaC:Click()'); // sin alPulsar ni ayuda: no hace nada y no falla
  assert.equal(m.lua('SnetForeverPruebaC:GetScript("OnEnter")'), undefined);
  m.lua('BANCO.tooltipProhibido = true; SnetForever.PRUEBA.n = "dos"');
  m.lua('SnetForeverPruebaB:GetScript("OnEnter")(SnetForeverPruebaB)');
  assert.equal(m.lua('GameTooltip:IsShown()'), false, 'prohibido: no se toca');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Rendimiento (revisión del proyecto, I2): los eventos del diario solo tocan lo que ha cambiado de verdad
// ---------------------------------------------------------------------------------------------------

// Paso 1: un complete de 788 (con sus objetivos) y una nota; detrás, cinco pasos para que la lista tenga tarjetas.
const PASOS_I2 = [
  { elementos: [{ t: 'complete', q: 788, objetivo: 1 }, NOTA('Cuidado con el tótem')] },
  ...[2, 3, 4, 5, 6].map((n) => ({ elementos: [NOTA(`Nota del paso ${n}`)] })),
];
const OBJETIVO_788 = (hecho) => [{ texto: `${hecho}/8 Rufián Tótem Siniestro`, hecho, pedido: 8, terminado: false }];

function conDiario() {
  const m = nuevaMaquina();
  m.estadoMision(788, { enDiario: true, objetivos: OBJETIVO_788(2) });
  m.ponerGuia(guiaDePrueba(PASOS_I2));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua(`${V}.crear()`);
  m.avanzar(0.3);
  return m;
}

// Cuenta los SetText de las líneas del bloque activo y de las tarjetas de la lista, las mediciones del medidor de la
// lista (SetText y GetStringHeight), las llamadas a Texto.limpiar (lo que se ahorra al memorizar Texto.deElemento) y
// las llamadas a Ventana.pintar. Los marcos del banco son tablas: el método se cambia en el propio objeto.
function contarPintado(m) {
  m.lua(`CUENTA = {bloque = 0, lista = 0, medidas = 0, limpiar = 0, pintar = 0}
  local function contar(o, metodo, campo)
    local original = o[metodo]
    o[metodo] = function(self, ...) CUENTA[campo] = CUENTA[campo] + 1; return original(self, ...) end
  end
  for _, p in ipairs(${M}.pasos) do for _, fs in ipairs(p.lineas) do contar(fs, "SetText", "bloque") end end
  for _, t in ipairs(${M}.tarjetasLista) do contar(t.texto, "SetText", "lista"); contar(t.numero, "SetText", "lista") end
  contar(${M}.lista.medidor, "SetText", "medidas")
  contar(${M}.lista.medidor, "GetStringHeight", "medidas")
  local limpiar = SnetForever.Texto.limpiar
  SnetForever.Texto.limpiar = function(...) CUENTA.limpiar = CUENTA.limpiar + 1; return limpiar(...) end
  local pintar = ${V}.pintar
  ${V}.pintar = function(...) CUENTA.pintar = CUENTA.pintar + 1; return pintar(...) end`);
  return () => m.lua('CUENTA');
}

test('I2: 20 QUEST_LOG_UPDATE seguidos sin cambios no hacen ningún SetText en la lista ni en el bloque, ni mediciones', () => {
  const m = conDiario();
  const antesLineas = lineas(m, 1);
  const antesLista = siguientes(m);
  assert.equal(antesLineas[0], '2/8 Rufián Tótem Siniestro');
  assert.ok(antesLista.length >= 3, JSON.stringify(antesLista));
  const cuenta = contarPintado(m);
  for (let i = 0; i < 20; i++) {
    m.disparar('QUEST_LOG_UPDATE');
    m.avanzar(0.3); // cada evento llega a su puesta al día agrupada
  }
  const c = cuenta();
  assert.equal(c.lista, 0, `SetText en la lista: ${JSON.stringify(c)}`);
  assert.equal(c.medidas, 0, `mediciones: ${JSON.stringify(c)}`);
  assert.equal(c.bloque, 0, `SetText en el bloque: ${JSON.stringify(c)}`);
  assert.equal(c.limpiar, 0, `Texto.deElemento memorizado: ${JSON.stringify(c)}`);
  assert.deepEqual(lineas(m, 1), antesLineas);
  assert.deepEqual(siguientes(m), antesLista);
  sinErrores(m);
});

test('I2: un objetivo que avanza actualiza su línea (y solo esa) en el bloque, y su tarjeta de la lista', () => {
  const m = conDiario();
  const cuenta = contarPintado(m);
  m.estadoMision(788, { enDiario: true, objetivos: OBJETIVO_788(3) });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  assert.equal(lineas(m, 1)[0], '3/8 Rufián Tótem Siniestro');
  assert.equal(lineas(m, 1)[1], 'Cuidado con el tótem');
  assert.equal(cuenta().bloque, 1, `solo la línea que cambió: ${JSON.stringify(cuenta())}`);
  assert.ok(limpio(siguientes(m)[0]).startsWith('3/8 Rufián Tótem Siniestro'), siguientes(m)[0]);
  sinErrores(m);
});

test('I2: con la ventana oculta (ventana.visible) no se pinta nada; al enseñarla se pinta una vez con lo último', () => {
  const m = conDiario();
  m.lua(`${V}.mostrar(false)`);
  const cuenta = contarPintado(m);
  for (let i = 0; i < 20; i++) {
    m.estadoMision(788, { enDiario: true, objetivos: OBJETIVO_788(3 + (i % 4)) });
    m.disparar('QUEST_LOG_UPDATE');
    m.avanzar(0.3);
  }
  m.estadoMision(788, { enDiario: true, objetivos: OBJETIVO_788(7) });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  const oculta = cuenta();
  assert.deepEqual(oculta, { bloque: 0, lista: 0, medidas: 0, limpiar: 0, pintar: 0 }, JSON.stringify(oculta));
  m.lua(`${V}.mostrar(true)`);
  assert.equal(cuenta().pintar, 1, `una vez al enseñarla: ${JSON.stringify(cuenta())}`);
  assert.equal(lineas(m, 1)[0], '7/8 Rufián Tótem Siniestro');
  m.avanzar(1);
  assert.equal(cuenta().pintar, 1, 'y nada más');
  sinErrores(m);
});

test('I2: oculta en combate (ventana.ocultarEnCombate) tampoco pinta; al salir del combate se pinta una vez', () => {
  const m = conDiario();
  m.lua('SnetForever.Ajustes.set("ventana.ocultarEnCombate", true)');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua(`${M}.raiz:IsShown()`), false);
  const cuenta = contarPintado(m);
  for (let i = 0; i < 20; i++) {
    m.estadoMision(788, { enDiario: true, objetivos: OBJETIVO_788(3 + (i % 4)) });
    m.disparar('QUEST_LOG_UPDATE');
    m.avanzar(0.3);
  }
  assert.equal(cuenta().pintar, 0, JSON.stringify(cuenta()));
  assert.equal(cuenta().medidas, 0, JSON.stringify(cuenta()));
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua(`${M}.raiz:IsShown()`), true);
  assert.equal(cuenta().pintar, 1, JSON.stringify(cuenta()));
  assert.equal(lineas(m, 1)[0], '6/8 Rufián Tótem Siniestro');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Lote A (Minor 1 de la revisión de I2): nombres que el cliente da tarde
// ---------------------------------------------------------------------------------------------------

// Paso 1: un collect del objeto 159 y un accept de la misión 4641, sin texto propio: los nombres salen del cliente
// (si los tiene en caché y el idioma coincide) o de los datos.
const PASOS_NOMBRES = [
  { elementos: [{ t: 'collect', i: 159, n: 5 }, { t: 'accept', q: 4641 }] },
  { elementos: [NOTA('Siguiente')] },
];

function conNombres() {
  const m = conGuia(PASOS_NOMBRES, { jugador: { idioma: 'esES' } });
  m.avanzar(0.3);
  return m;
}

test('lote A: GET_ITEM_INFO_RECEIVED de un objeto de la ventana olvida su texto y la repinta agrupada', () => {
  const m = conNombres();
  assert.ok(lineas(m, 1)[0].includes('Agua de manantial refrescante'), lineas(m, 1)[0]);
  m.nombreJuego('item', 159, 'Agua del cliente');
  const cuenta = contarPintado(m);
  m.disparar('GET_ITEM_INFO_RECEIVED', 159, true);
  m.disparar('GET_ITEM_INFO_RECEIVED', 159, true);
  m.avanzar(0.3);
  assert.ok(lineas(m, 1)[0].includes('Agua del cliente'), lineas(m, 1)[0]);
  assert.equal(cuenta().pintar, 1, `una sola puesta al día agrupada: ${JSON.stringify(cuenta())}`);
  assert.equal(cuenta().bloque, 1, `solo la línea del objeto: ${JSON.stringify(cuenta())}`);
  sinErrores(m);
});

test('lote A: QUEST_DATA_LOAD_RESULT de una misión de la ventana pone su nombre del cliente', () => {
  const m = conNombres();
  assert.equal(lineas(m, 1)[1], 'Acepta Tu lugar en el mundo');
  m.nombreJuego('mision', 4641, 'Tu sitio en el mundo');
  m.disparar('QUEST_DATA_LOAD_RESULT', 4641, true);
  m.avanzar(0.3);
  assert.equal(lineas(m, 1)[1], 'Acepta Tu sitio en el mundo');
  sinErrores(m);
});

test('lote A: un objeto o una misión que no salen en la ventana, o una carga fallida, no repintan nada', () => {
  const m = conNombres();
  m.nombreJuego('item', 159, 'Agua del cliente');
  const cuenta = contarPintado(m);
  m.disparar('GET_ITEM_INFO_RECEIVED', 4242, true);
  m.disparar('QUEST_DATA_LOAD_RESULT', 4242, true);
  m.disparar('GET_ITEM_INFO_RECEIVED', 159, false);
  m.avanzar(0.3);
  assert.equal(cuenta().pintar, 0, JSON.stringify(cuenta()));
  assert.ok(lineas(m, 1)[0].includes('Agua de manantial refrescante'), 'sigue el de antes hasta el próximo repintado');
  sinErrores(m);
});

// Ronda 1 (Minor 2 de la revisión del lote A): solo repinta si el elemento olvidado está a la vista.
test('lote A, ronda 1: el nombre de un objeto o una misión de un paso que ya no se ve no repinta nada', () => {
  // El paso 1 cita el objeto y la misión; detrás, diez pasos a mano. En el paso 9, el 1 ya no sale ni en el bloque ni en
  // las tarjetas de la lista.
  const resto = Array.from({ length: 10 }, (_, k) => ({ elementos: [MANUAL(`Paso ${k + 2}`)] }));
  const m = conGuia([PASOS_NOMBRES[0], ...resto], { jugador: { idioma: 'esES' } });
  m.avanzar(0.3);
  m.lua('SnetForever.Motor.irA(9)');
  m.avanzar(0.3);
  assert.deepEqual(lineas(m, 1), ['Paso 9']);
  assert.ok(!siguientes(m).some((t) => t.includes('Agua') || t.includes('lugar en el mundo')), JSON.stringify(siguientes(m)));
  const cuenta = contarPintado(m);
  m.disparar('GET_ITEM_INFO_RECEIVED', 159, true);
  m.disparar('QUEST_DATA_LOAD_RESULT', 4641, true);
  m.avanzar(0.3);
  assert.equal(cuenta().pintar, 0, JSON.stringify(cuenta()));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Lote A (Minor 2 de la revisión de I2): la puesta al día del diario (ponerAlDiaBloque y la lista) deja la ventana igual
// que un Ventana.pintar() entero justo después: mismos textos, alturas, casillas y filas de enlace.
// ---------------------------------------------------------------------------------------------------

// Lo que se ve de la ventana: cada bloque (alto y líneas con su texto, alto, marca de la casilla y tamaño de la fila de
// un enlace), cada tarjeta de la lista (texto y alto) y el alto de la ventana.
const FOTO = `(function()
  local M = SnetForever.Ventana.marcos
  local s = {pasos = {}, lista = {}, alto = M.raiz:GetHeight()}
  for k, p in ipairs(M.pasos) do
    local b = {i = p.i, alto = p.marco:GetHeight(), lineas = {}}
    for j, fs in ipairs(p.lineas) do
      b.lineas[j] = {texto = fs:GetText(), alto = fs:GetStringHeight(),
        marca = fs.casilla and fs.casilla.marca:IsShown() or false,
        fila = fs.fila and {fs.fila:GetWidth(), fs.fila:GetHeight()} or false}
    end
    s.pasos[k] = b
  end
  for j, fs in ipairs(M.siguientes) do s.lista[j] = {texto = fs:GetText(), alto = fs:GetStringHeight()} end
  return s
end)()`;

// Cuenta los repintados enteros (cada uno llama a Texto.olvidar).
function contarEnteros(m) {
  m.lua(`ENTEROS = 0
  local olvidar = SnetForever.Texto.olvidar
  SnetForever.Texto.olvidar = function(...) ENTEROS = ENTEROS + 1; return olvidar(...) end`);
  return () => m.lua('ENTEROS');
}

// Cambia el juego, dispara QUEST_LOG_UPDATE (el motor evalúa sus elementos en el acto) y hace la puesta al día del
// diario, la que haría el temporizador agrupado, antes del ciclo del motor (que, si cambia un resultado, repinta entero).
// Compara con un repintado entero y devuelve cuántos repintados enteros hizo la puesta al día.
function comoEntero(m, cambiar) {
  const enteros = contarEnteros(m);
  cambiar();
  m.disparar('QUEST_LOG_UPDATE');
  m.lua(`${V}.pintar("diario")`);
  const diario = m.lua(FOTO);
  const n = enteros();
  m.lua(`${V}.pintar()`);
  assert.deepEqual(diario, m.lua(FOTO), 'la puesta al día del diario deja lo mismo que un repintado entero');
  m.avanzar(0.3);
  return n;
}

const OBJ = (texto, hecho, pedido, terminado = false) => [{ texto, hecho, pedido, terminado }];

test('lote A, equivalencia: la marca de la casilla que cambia por el diario', () => {
  const m = conGuia([{ elementos: [{ t: 'complete', q: 788, objetivo: 1 }, MANUAL('Y esto a mano')] }, { elementos: [NOTA('Otro')] }]);
  m.estadoMision(788, { enDiario: true, objetivos: OBJ('7/8 Rufián Tótem Siniestro', 7, 8) });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  assert.equal(m.lua(FOTO).pasos[0].lineas[0].marca, false);
  const enteros = comoEntero(m, () => m.estadoMision(788, { enDiario: true, objetivos: OBJ('8/8 Rufián Tótem Siniestro', 8, 8, true) }));
  assert.equal(m.lua(FOTO).pasos[0].lineas[0].marca, true, 'la casilla queda marcada');
  assert.equal(enteros, 0, 'sin repintado entero: solo la línea y su marca');
  sinErrores(m);
});

test('lote A, equivalencia: un texto que pasa a ocupar otro alto vuelve al repintado entero', () => {
  const m = conGuia([{ elementos: [{ t: 'complete', q: 788, objetivo: 1 }, NOTA('Cuidado')] }, { elementos: [NOTA('Otro')] }]);
  m.estadoMision(788, { enDiario: true, objetivos: OBJ('2/8 Rufián', 2, 8) });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  const antes = m.lua(FOTO).pasos[0].lineas[0].alto;
  const largo = `3/8 ${'Rufián Tótem Siniestro de las colinas del valle '.repeat(4)}`;
  const enteros = comoEntero(m, () => m.estadoMision(788, { enDiario: true, objetivos: OBJ(largo, 3, 8) }));
  assert.ok(m.lua(FOTO).pasos[0].lineas[0].alto > antes, 'el texto nuevo ocupa más renglones');
  assert.equal(enteros, 1, 'un repintado entero');
  sinErrores(m);
});

test('lote A, equivalencia: la línea de enlace (clicknext) cambia de texto y su fila de tamaño', () => {
  const MAZ = 'Prueba\\Minas';
  const m = nuevaMaquina({ jugador: { idioma: 'esES' } });
  m.ponerGuia(guiaDePrueba([{ elementos: [NOTA('Dentro')] }], {
    clave: MAZ, grupo: 'Prueba', nombre: 'Minas', tipo: 'mazmorra', area: 1581, niveles: { min: 1, max: 60 },
  }));
  m.ponerGuia(guiaDePrueba([
    { elementos: [{ t: 'complete', q: 788, objetivo: 1 }, { t: 'clicknext', guias: [MAZ] }] },
    { elementos: [NOTA('Otro')] },
  ]));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua(`${V}.crear()`);
  m.estadoMision(788, { enDiario: true, objetivos: OBJ('2/8 Rufián', 2, 8) });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  const enlace = () => m.lua(FOTO).pasos[0].lineas[1];
  assert.notEqual(enlace().fila, false, 'la línea del clicknext lleva su fila');
  const antes = enlace().texto;
  // El enlace apunta de verdad a la guía de mazmorra (clave con barra invertida): su título es «Mazmorra: <zona>».
  assert.ok(antes.includes('Mazmorra: The Deadmines'), antes);
  // El cliente da el nombre de la zona: el título de la guía de mazmorra cambia (mismo largo, mismo alto).
  const enteros = comoEntero(m, () => m.nombreJuego('zona', 1581, 'Minas Clienta'));
  assert.notEqual(enlace().texto, antes);
  assert.ok(enlace().texto.includes('Minas Clienta'), enlace().texto);
  assert.equal(enteros, 0, 'sin repintado entero');
  sinErrores(m);
});

test('lote A, equivalencia: una tarjeta de la lista que no es la del paso activo', () => {
  const m = conGuia([
    { elementos: [MANUAL('Primero a mano')] },
    { elementos: [{ t: 'complete', q: 788, objetivo: 1 }] },
    ...[3, 4, 5].map((n) => ({ elementos: [NOTA(`Nota del paso ${n}`)] })),
  ]);
  m.estadoMision(788, { enDiario: true, objetivos: OBJ('2/8 Rufián Tótem Siniestro', 2, 8) });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  // La lista empieza por el paso activo (1); la tarjeta del paso 2 es la segunda.
  assert.ok(limpio(m.lua(FOTO).lista[1].texto).startsWith('2/8'), JSON.stringify(m.lua(FOTO).lista));
  const enteros = comoEntero(m, () => m.estadoMision(788, { enDiario: true, objetivos: OBJ('3/8 Rufián Tótem Siniestro', 3, 8) }));
  assert.ok(limpio(m.lua(FOTO).lista[1].texto).startsWith('3/8'), 'la tarjeta se puso al día');
  assert.equal(enteros, 0, 'solo la lista, sin repintado entero');
  sinErrores(m);
});
