// Ventana principal, parte 1, Task 12: la ventana de comercio (SnetForever.Principal, ui/principal.lua del addon
// SnetForever_Comercio) y su cabecera de 38 px con las 5 pestañas. Es independiente de la subasta: hija de UIParent, se
// mueve, se redimensiona con el asa, recuerda su sitio y Escape la cierra. Las pruebas que necesitan el comercio se
// saltan en la pasada de solo núcleo; la última comprueba que el núcleo solo no se rompe (minimapa y /snet comercio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLua } from '../src/lua-js.js';
import { readFileSync } from 'node:fs';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const EN = { ...JUGADOR, idioma: 'enUS' };
const PANTALLA = { ancho: 2560, alto: 1080 };
const P = 'SnetForever.Principal';
const V = 'SnetForeverPrincipal';
const BOTON = 'SnetForeverBotonMinimapa';
const GUIDE = 'SnetForever.GuideViews.frames.notice';
const PESTANAS = ['dashboard', 'contabilidad', 'grupos', 'operaciones', 'ajustes'];

const maquina = (opciones = {}) => nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, ...opciones });
// Desde la Task 23 las cinco pestañas tienen su página (Ajustes también). Para probar el enchufe de Principal.registrar y el
// aviso de «sin página» se vuelve a cargar ui/principal.lua en la máquina: un Principal nuevo, sin ninguna página registrada.
const FUENTE_PRINCIPAL = readFileSync(new URL('../../../addons/SnetForever_Comercio/ui/principal.lua', import.meta.url), 'utf8');
const principalSinPaginas = (m) => m.lua(FUENTE_PRINCIPAL);
const texto = (m, clave) => m.lua(`SnetForever.L.t(${aLua(clave)})`);
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));
function escribe(m, orden) {
  const antes = impresos(m).length;
  m.lua(`SlashCmdList.SNET(${aLua(orden)})`);
  return impresos(m).slice(antes);
}
const visible = (m, expr) => m.lua(`${expr}:IsShown()`);
const abierta = (m) => m.lua(`${V} ~= nil and ${V}:IsShown()`);
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const colorTexto = (m, expr) => aHex(m.lua(`{${expr}:GetTextColor()}`));
const token = (m, nombre) => aHex(m.lua(`SnetForever.Tema.color(${aLua(nombre)})`));
// El rectángulo de un marco en unidades absolutas (independientes de su escala): izquierda, abajo, derecha, arriba.
const RECT = `local function rect(f)
  local s = f:GetEffectiveScale()
  return f:GetLeft() * s, f:GetBottom() * s, f:GetRight() * s, f:GetTop() * s
end`;

// ---------------------------------------------------------------------------------------------------
// Marco
// ---------------------------------------------------------------------------------------------------

test('la ventana es hija de UIParent, no de la subasta, y abre sin la subasta abierta', necesitaComercio, () => {
  const m = maquina();
  assert.equal(m.lua(`type(${P})`), 'table');
  assert.equal(m.lua('SnetForever.Subasta.disponible()'), false, 'la subasta no está abierta');
  assert.equal(m.lua(`rawget(_G, ${aLua(V)})`), undefined, 'no se crea nada hasta que se abre');
  m.lua(`${P}.abrir()`);
  const marco = m.marco(V);
  assert.equal(marco.padre, 'UIParent');
  assert.equal(marco.visible, true);
  assert.equal(m.lua(`${V}:GetFrameStrata()`), 'HIGH');
  assert.equal(m.lua(`${P}.marco() == ${V}`), true);
  assert.equal(m.lua('rawget(_G, "AuctionHouseFrame")'), undefined);
  // The textured iron plate sits over the existing auction background.
  assert.equal(m.lua(`${V}.snfForgePlate:GetTexture()`), 'Interface\\AddOns\\SnetForever\\recursos\\forge-plate');
  const colores = m.lua(`(function()
    local r = {}
    for _, t in ipairs({${V}:GetRegions()}) do
      if t:GetObjectType() == "Texture" and t:IsShown() and t ~= ${V}.snfForgePlate then
        r[#r + 1] = {t:GetVertexColor()}
      end
    end
    return r
  end)()`);
  assert.ok(colores.length > 0);
  for (const c of colores) assert.equal(aHex(c), token(m, 'fondo'));
  assert.equal(token(m, 'fondo'), '191717');
  m.lua(`${P}.cerrar()`);
  assert.equal(abierta(m), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------------------------------

test('cabecera de 38 px con logo, 5 pestañas, oro con colores y X', necesitaComercio, () => {
  const m = maquina();
  m.jugador({ dinero: 104907 });
  m.lua(`${P}.abrir()`);
  const M = `${P}.marcos`;
  assert.equal(m.lua(`${M}.cabecera:GetHeight()`), 38);
  assert.equal(m.lua(`${M}.cabecera:GetParent() == ${V}`), true);
  // Logo: el icono del addon y «SnetForever» en la letra del logo.
  assert.equal(m.lua(`${M}.icono:GetTexture()`), 'Interface\\AddOns\\SnetForever\\recursos\\icono');
  assert.equal(m.lua(`${M}.logo:GetText()`), 'SnetForever');
  assert.match(m.lua(`(${M}.logo:GetFont())`), /AlegreyaSC-Bold\.ttf$/);
  assert.equal(colorTexto(m, `${M}.logo`), token(m, 'texto'));
  // Cinco pestañas con su texto, una tras otra separadas 16 px.
  assert.deepEqual(m.lua(`${M}.orden`), PESTANAS);
  const nombres = { dashboard: 'Dashboard', contabilidad: 'Contabilidad', grupos: 'Grupos', operaciones: 'Operaciones', ajustes: 'Ajustes' };
  for (const [i, p] of PESTANAS.entries()) {
    assert.equal(m.lua(`${M}.pestanas.${p}.texto:GetText()`), nombres[p]);
    assert.match(m.lua(`(${M}.pestanas.${p}.texto:GetFont())`), /BarlowSemiCondensed-SemiBold\.ttf$/);
    assert.equal(m.lua(`${M}.pestanas.${p}:GetParent() == ${M}.cabecera`), true);
    if (i > 0) {
      const punto = m.lua(`(function() local a, rel, b, x, y = ${M}.pestanas.${p}.texto:GetPoint(1); return {a, rel == ${M}.pestanas.${PESTANAS[i - 1]}.texto, b, x, y} end)()`);
      assert.deepEqual(punto, ['LEFT', true, 'RIGHT', 16, 0], p);
    }
  }
  // El oro: «10g 49s 07c» con los colores de la moneda, a la derecha, junto a la X.
  assert.equal(m.lua(`${M}.oro:GetText()`), m.lua('SnetForever.Tema.dinero(104907)'));
  assert.match(m.lua(`${M}.oro:GetText()`), /\|cff[0-9a-f]{6}10g\|r \|cff[0-9a-f]{6}49s\|r \|cff[0-9a-f]{6}07c\|r/);
  assert.equal(m.lua(`${M}.oro:GetJustifyH()`), 'RIGHT');
  // La X lleva el icono `cerrar` y cierra la ventana.
  const mismo = m.lua(`(function()
    local t = CreateFrame("Frame", nil, UIParent):CreateTexture(nil, "OVERLAY")
    SnetForever.Tema.icono(t, "cerrar")
    local a, b, c, d = t:GetTexCoord()
    local e, f, g, h = ${M}.cerrar.icono:GetTexCoord()
    return {a == e, b == f, c == g, d == h, ${M}.cerrar.icono:GetTexture() == t:GetTexture()}
  end)()`);
  assert.deepEqual(mismo, [true, true, true, true, true]);
  m.lua(`${M}.cerrar:Click("LeftButton")`);
  assert.equal(abierta(m), false);
  sinErrores(m);
});

test('la pestaña elegida en cobre sin fondo; Dashboard y Contabilidad muestran su estado sin movimientos', necesitaComercio, () => {
  const m = maquina();
  const M = `${P}.marcos`;
  assert.equal(m.lua('SnetForever.Ajustes.get("principal.pestana")'), 'grupos', 'por defecto, Grupos');
  m.lua(`${P}.abrir()`);
  assert.equal(m.lua(`${P}.pestana()`), 'grupos');
  const pintadas = () => PESTANAS.map((p) => colorTexto(m, `${M}.pestanas.${p}.texto`));
  assert.deepEqual(pintadas(), ['cbbeb1', 'cbbeb1', 'e6ac72', 'cbbeb1', 'cbbeb1']);
  assert.equal(token(m, 'acento'), 'e6ac72');
  assert.equal(token(m, 'textoPestana'), 'cbbeb1');
  // Ninguna pestaña lleva textura de fondo.
  for (const p of PESTANAS) {
    const texturas = m.lua(`(function() local n = 0; for _, t in ipairs({${M}.pestanas.${p}:GetRegions()}) do if t:GetObjectType() == "Texture" and t:IsShown() then n = n + 1 end end; return n end)()`);
    assert.equal(texturas, 0, `${p} no lleva fondo`);
  }
  const frase = texto(m, 'TRADE_LEDGER_EMPTY');
  assert.match(frase, /Abre el buzón/);
  for (const p of ['dashboard', 'contabilidad']) {
    m.lua(`${M}.pestanas.${p}:Click("LeftButton")`);
    assert.equal(m.lua(`${P}.pestana()`), p);
    assert.equal(m.lua('SnetForever.Ajustes.get("principal.pestana")'), p, 'recuerda la pestaña');
    assert.equal(visible(m, `${M}.paginas.${p}`), true);
    assert.equal(m.lua(`${M}.paginas.${p}.texto:GetText()`), frase);
    assert.equal(colorTexto(m, `${M}.pestanas.${p}.texto`), 'e6ac72');
    assert.equal(colorTexto(m, `${M}.pestanas.grupos.texto`), 'cbbeb1');
  }
  // Solo se ve la página de la pestaña elegida.
  assert.equal(m.lua(`${M}.paginas.dashboard:IsShown()`), false);
  assert.equal(m.lua(`${P}.abrir("ajustes") == nil and ${P}.pestana()`), 'ajustes');
  // Un ajuste guardado que no es una pestaña vuelve a Grupos.
  m.lua(`${P}.cerrar(); SnetForever.Ajustes.set("principal.pestana", "zzz")`);
  m.lua(`${P}.abrir()`);
  assert.equal(m.lua(`${P}.pestana()`), 'grupos');
  sinErrores(m);
});

test('las páginas se enchufan con registrar: crear una vez, mostrar y ocultar al cambiar', necesitaComercio, () => {
  const m = maquina();
  principalSinPaginas(m);
  const M = `${P}.marcos`;
  m.lua(`${P}.abrir("ajustes")`);
  m.lua(`BANCO.reg = {}
    ${P}.registrar("ajustes", {
      crear = function(padre) BANCO.reg.crear = (BANCO.reg.crear or 0) + 1; BANCO.reg.padre = padre end,
      mostrar = function() BANCO.reg.mostrar = (BANCO.reg.mostrar or 0) + 1 end,
      ocultar = function() BANCO.reg.ocultar = (BANCO.reg.ocultar or 0) + 1 end,
    })`);
  assert.equal(m.lua('BANCO.reg.crear'), 1, 'la página elegida se crea al registrarse con la ventana abierta');
  assert.equal(m.lua(`BANCO.reg.padre == ${M}.paginas.ajustes`), true);
  m.lua(`${M}.pestanas.dashboard:Click("LeftButton")`);
  assert.equal(m.lua('BANCO.reg.ocultar'), 1);
  m.lua(`${M}.pestanas.ajustes:Click("LeftButton")`);
  assert.equal(m.lua('BANCO.reg.mostrar'), 2);
  assert.equal(m.lua('BANCO.reg.crear'), 1);
  assert.equal(m.lua(`pcall(${P}.registrar, "no-existe", {})`), false);
  sinErrores(m);
});

test('las pestañas salen en inglés con el cliente en inglés', necesitaComercio, () => {
  const m = maquina({ jugador: EN });
  m.lua(`${P}.abrir()`);
  const textos = PESTANAS.map((p) => m.lua(`${P}.marcos.pestanas.${p}.texto:GetText()`));
  assert.deepEqual(textos, ['Dashboard', 'Accounting', 'Groups', 'Operations', 'Settings']);
  m.lua(`${P}.abrir("dashboard")`);
  assert.equal(m.lua(`${P}.marcos.paginas.dashboard.texto:GetText()`), texto(m, 'TRADE_LEDGER_EMPTY'));
  assert.match(texto(m, 'TRADE_LEDGER_EMPTY'), /Open the mailbox/);
  sinErrores(m);
});

test('el oro se repinta con PLAYER_MONEY con la ventana abierta y no escucha cerrada', necesitaComercio, () => {
  const m = maquina();
  m.jugador({ dinero: 104907 });
  m.lua(`${P}.abrir()`);
  const M = `${P}.marcos`;
  const dinero = (c) => m.lua(`SnetForever.Tema.dinero(${c})`);
  assert.equal(m.lua(`${V}:IsEventRegistered("PLAYER_MONEY")`), true, 'abierta, escucha');
  assert.equal(m.lua(`${M}.oro:GetText()`), dinero(104907));
  m.jugador({ dinero: 15000000 });
  m.disparar('PLAYER_MONEY');
  assert.equal(m.lua(`${M}.oro:GetText()`), dinero(15000000));
  m.lua(`${P}.cerrar()`);
  assert.equal(m.lua(`${V}:IsEventRegistered("PLAYER_MONEY")`), false, 'cerrada, no escucha');
  m.jugador({ dinero: 7 });
  m.disparar('PLAYER_MONEY');
  assert.equal(m.lua(`${M}.oro:GetText()`), dinero(15000000), 'cerrada no se repinta');
  m.lua(`${P}.abrir()`);
  assert.equal(m.lua(`${M}.oro:GetText()`), dinero(7), 'al abrir se pinta con lo que hay');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Mover, redimensionar, recordar
// ---------------------------------------------------------------------------------------------------

test('se mueve, se redimensiona con el asa (mínimo 1000×600) y recuerda su sitio tras /reload', necesitaComercio, () => {
  let m = maquina();
  m.lua(`${P}.abrir()`);
  const M = `${P}.marcos`;
  const sitio = () => m.lua(`${P}.sitioActual()`);
  const inicial = sitio();
  assert.deepEqual([inicial.ancho, inicial.alto], [1424, 805]);
  assert.equal(m.lua(`${V}:IsMovable()`), true);
  assert.equal(m.lua(`${V}:IsResizable()`), true);
  // Arrastrar la cabecera.
  m.lua(`${M}.cabecera:GetScript("OnMouseDown")(${M}.cabecera, "LeftButton")`);
  assert.equal(m.llamadas('StartMoving').length, 1, 'la cabecera empieza a mover');
  m.lua('BANCO.arrastre = {x = 40, y = -25}');
  m.lua(`${M}.cabecera:GetScript("OnMouseUp")(${M}.cabecera, "LeftButton")`);
  const movido = sitio();
  assert.equal(movido.x, inicial.x + 40);
  assert.equal(movido.y, inicial.y + 25);
  assert.deepEqual(m.lua('SnetForever.Ajustes.get("principal.sitio")'), movido);
  // El asa ◢ estira desde abajo a la derecha; con otra llamada al clic derecho no hace nada.
  m.lua(`${M}.asa:GetScript("OnMouseDown")(${M}.asa, "RightButton")`);
  m.lua(`${M}.asa:GetScript("OnMouseUp")(${M}.asa, "RightButton")`);
  assert.deepEqual([sitio().ancho, sitio().alto], [1424, 805]);
  m.lua(`${M}.asa:GetScript("OnMouseDown")(${M}.asa, "LeftButton")`);
  assert.equal(m.llamadas('StartSizing').length, 1, 'el asa empieza a estirar');
  m.lua('BANCO.redimensionar = {ancho = 100, alto = 50}');
  m.lua(`${M}.asa:GetScript("OnMouseUp")(${M}.asa, "LeftButton")`);
  assert.deepEqual([sitio().ancho, sitio().alto], [1524, 855]);
  // Mínimo 1000×600.
  m.lua(`${M}.asa:GetScript("OnMouseDown")(${M}.asa, "LeftButton")`);
  m.lua('BANCO.redimensionar = {ancho = -900, alto = -900}');
  m.lua(`${M}.asa:GetScript("OnMouseUp")(${M}.asa, "LeftButton")`);
  assert.deepEqual([sitio().ancho, sitio().alto], [1000, 600]);
  const guardado = m.lua('SnetForever.Ajustes.get("principal.sitio")');
  assert.deepEqual([guardado.ancho, guardado.alto, guardado.x, guardado.y], [1000, 600, movido.x, movido.y]);
  // /reload: se abre donde se dejó y del tamaño en que se dejó.
  m = m.recargar();
  assert.deepEqual(m.lua('SnetForever.Ajustes.get("principal.sitio")'), guardado);
  m.lua(`${P}.abrir()`);
  assert.deepEqual(sitio(), guardado);
  assert.deepEqual([m.lua(`${V}:GetWidth()`), m.lua(`${V}:GetHeight()`)], [1000, 600]);
  // «/snet reiniciar» la devuelve al centro y al tamaño de siempre.
  escribe(m, 'reiniciar');
  assert.equal(m.lua('SnetForever.Ajustes.get("principal.sitio")'), undefined);
  assert.deepEqual(sitio(), inicial);
  sinErrores(m);
});

test('un sitio guardado roto o fuera de la pantalla no esconde la ventana', necesitaComercio, () => {
  for (const roto of ['"hola"', '{x = "a", y = 1, ancho = 5, alto = 5}', '{x = 99999, y = 99999, ancho = 1424, alto = 805}', '{x = -5000, y = -5000, ancho = 100, alto = 100}']) {
    const m = maquina();
    m.lua(`SnetForever.Ajustes.set("principal.sitio", ${roto})`);
    m.lua(`${P}.abrir()`);
    const dentro = m.lua(`(function()
      ${RECT}
      local l, b, r, t = rect(${V})
      local w, h = UIParent:GetRight() * UIParent:GetEffectiveScale(), UIParent:GetTop() * UIParent:GetEffectiveScale()
      return l >= -0.001 and b >= -0.001 and r <= w + 0.001 and t <= h + 0.001
    end)()`);
    assert.equal(dentro, true, roto);
    assert.ok(m.lua(`${V}:GetWidth()`) >= 1000 && m.lua(`${V}:GetHeight()`) >= 600, roto);
    sinErrores(m);
  }
});

test('con 1424×805 en una pantalla de 2560×1080 cabe entera', necesitaComercio, () => {
  const m = maquina();
  m.lua(`${P}.abrir()`);
  assert.deepEqual([m.lua(`${V}:GetWidth()`), m.lua(`${V}:GetHeight()`)], [1424, 805]);
  // Con la escala de interfaz 1, una unidad de la ventana mide un píxel de la pantalla: 1424×805 px de 2560×1080.
  const r = m.lua(`(function()
    ${RECT}
    local l, b, rr, t = rect(${V})
    local fisico = 1080 / 768
    local k = ${V}:GetEffectiveScale() * fisico
    return {l = l, b = b, r = rr, t = t, ancho = (rr - l) * fisico, alto = (t - b) * fisico, k = k,
      pantallaAncho = UIParent:GetRight() * UIParent:GetEffectiveScale(), pantallaAlto = UIParent:GetTop() * UIParent:GetEffectiveScale()}
  end)()`);
  assert.ok(Math.abs(r.k - 1) < 1e-6, `1 unidad = 1 px (k = ${r.k})`);
  assert.ok(Math.abs(r.ancho - 1424) < 0.01 && Math.abs(r.alto - 805) < 0.01, JSON.stringify(r));
  assert.ok(r.l >= 0 && r.b >= 0 && r.r <= r.pantallaAncho && r.t <= r.pantallaAlto, JSON.stringify(r));
  // Con la escala de interfaz a 0,64 sigue midiendo 1424×805 píxeles reales y cabe entera.
  const chica = maquina();
  chica.lua('UIParent:SetScale(0.64)');
  chica.lua(`${P}.abrir()`);
  assert.ok(Math.abs(reales(chica, `${V}:GetWidth()`) - 1424) <= 1);
  sinErrores(chica);
  // Con una pantalla de 600 de alto la ventana ya no cabe a 805 y se encoge para caber.
  const grande = maquina({ pantalla: { ancho: 1000, alto: 600 } });
  grande.lua('UIParent:SetScale(1.5)');
  grande.lua(`${P}.abrir()`);
  const dentro = grande.lua(`(function()
    ${RECT}
    local l, b, rr, t = rect(${V})
    local w, h = UIParent:GetRight() * UIParent:GetEffectiveScale(), UIParent:GetTop() * UIParent:GetEffectiveScale()
    return l >= -0.001 and b >= -0.001 and rr <= w + 0.001 and t <= h + 0.001
  end)()`);
  assert.equal(dentro, true);
  assert.ok(grande.lua(`${V}:GetHeight()`) < 805);
  sinErrores(grande);
  sinErrores(m);
});

test('la escala efectiva de la ventana es 768 / alto físico, sea cual sea la escala de UIParent', necesitaComercio, () => {
  for (const escala of [1, 0.8, 1.25]) {
    for (const pantalla of [PANTALLA, { ancho: 3840, alto: 2160 }]) {
      const m = maquina({ pantalla });
      m.lua(`UIParent:SetScale(${escala})`);
      m.lua(`${P}.abrir()`);
      const efectiva = m.lua(`${V}:GetEffectiveScale()`);
      assert.ok(Math.abs(efectiva - 768 / pantalla.alto) < 1e-6, `escala ${escala}: ${efectiva}`);
      assert.ok(Math.abs(m.lua(`${V}:GetScale()`) - (768 / pantalla.alto) / escala) < 1e-6, 'relativa a su padre');
      sinErrores(m);
    }
  }
});

// Píxeles reales de algo medido en unidades del marco o de la letra: unidades × escala efectiva × (1080 / 768) en una pantalla
// de 1080 de alto.
const reales = (m, expr) => m.lua(`(${expr}) * ${V}:GetEffectiveScale() * (1080 / 768)`);

test('mide 1424×805 píxeles reales con la escala de interfaz a 0,64 y a 1', necesitaComercio, () => {
  for (const escala of [0.64, 1]) {
    const m = maquina();
    m.lua(`UIParent:SetScale(${escala})`);
    m.lua(`${P}.abrir()`);
    const ancho = reales(m, `${V}:GetWidth()`);
    const alto = reales(m, `${V}:GetHeight()`);
    assert.ok(Math.abs(ancho - 1424) <= 1 && Math.abs(alto - 805) <= 1, `escala ${escala}: ${ancho}×${alto}`);
    sinErrores(m);
  }
});

test('las pestañas a 16 px reales y el oro a 12 px reales con la escala de interfaz a 0,64 y a 1', necesitaComercio, () => {
  for (const escala of [0.64, 1]) {
    const m = maquina();
    m.lua(`UIParent:SetScale(${escala})`);
    m.lua(`${P}.abrir()`);
    for (const p of PESTANAS) {
      const px = reales(m, `select(2, ${P}.marcos.pestanas.${p}.texto:GetFont())`);
      assert.ok(Math.abs(px - 16) <= 0.01, `${p} a escala ${escala}: ${px}`);
    }
    const oro = reales(m, `select(2, ${P}.marcos.oro:GetFont())`);
    assert.ok(Math.abs(oro - 12) <= 0.01, `oro a escala ${escala}: ${oro}`);
    sinErrores(m);
  }
});

test('al cambiar la escala de interfaz con la ventana abierta sigue midiendo 1424×805 píxeles reales', necesitaComercio, () => {
  const m = maquina();
  m.lua('UIParent:SetScale(1)');
  m.lua(`${P}.abrir()`);
  m.lua('UIParent:SetScale(0.64)');
  m.disparar('UI_SCALE_CHANGED');
  const ancho = reales(m, `${V}:GetWidth()`);
  const alto = reales(m, `${V}:GetHeight()`);
  assert.ok(Math.abs(ancho - 1424) <= 1 && Math.abs(alto - 805) <= 1, `${ancho}×${alto}`);
  sinErrores(m);
});

test('sin GetPhysicalScreenSize toma 1080 de alto', necesitaComercio, () => {
  const m = maquina();
  m.lua('GetPhysicalScreenSize = nil');
  m.lua('UIParent:SetScale(0.64)');
  m.lua(`${P}.abrir()`);
  assert.ok(Math.abs(m.lua(`${V}:GetEffectiveScale()`) - 768 / 1080) < 1e-6);
  sinErrores(m);
});

// El hueco visible entre el final del texto de una pestaña y el principio del de la siguiente.
const HUECOS = (M) => `(function()
  local ts = {}
  for i, p in ipairs({"dashboard", "contabilidad", "grupos", "operaciones", "ajustes"}) do
    local t = ${M}.pestanas[p].texto
    local ancho = t:GetUnboundedStringWidth()
    local c = (t:GetLeft() + t:GetRight()) / 2
    ts[i] = {c - ancho / 2, c + ancho / 2}
  end
  local h = {}
  for i = 2, 5 do h[#h + 1] = ts[i][1] - ts[i - 1][2] end
  return h
end)()`;

test('el mismo hueco entre todas las pestañas con cada una de las 5 elegida', necesitaComercio, () => {
  const m = maquina();
  for (const elegida of PESTANAS) {
    m.lua(`${P}.abrir(${aLua(elegida)})`);
    m.lua(`${P}.elegir(${aLua(elegida)})`);
    const h = Object.values(m.lua(HUECOS(`${P}.marcos`)));
    assert.equal(h.length, 4);
    for (const v of h) {
      assert.ok(Math.abs(v - 16) < 0.01, `con ${elegida}: ${JSON.stringify(h)}`);
    }
  }
  sinErrores(m);
});

test('si el ancho del texto sale mal al crear la ventana (letra sin cargar), al abrirla los huecos son iguales', necesitaComercio, () => {
  const m = maquina();
  m.lua('BANCO.textoSinCargar = true');
  m.lua(`${P}.marco()`);
  m.lua('BANCO.textoSinCargar = false');
  m.lua(`${P}.abrir("dashboard")`);
  const h = Object.values(m.lua(HUECOS(`${P}.marcos`)));
  for (const v of h) {
    assert.ok(Math.abs(v - 16) < 0.01, JSON.stringify(h));
  }
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Abrir: /snet comercio, /snet trade, minimapa, Escape
// ---------------------------------------------------------------------------------------------------

test('/snet comercio y /snet trade la abren; clic izquierdo en el minimapa también; Escape la cierra', necesitaComercio, () => {
  const m = maquina();
  assert.deepEqual(escribe(m, 'comercio'), []);
  assert.equal(abierta(m), true);
  assert.deepEqual(escribe(m, 'c'), []);
  assert.equal(abierta(m), false, 'otra vez la cierra');
  assert.deepEqual(escribe(m, 'trade'), []);
  assert.equal(abierta(m), true);
  // Escape: la ventana se queda con la tecla, se cierra y las demás teclas pasan al juego.
  assert.equal(m.lua('BANCO.pulsarTecla("A")'), false, 'otras teclas se propagan');
  assert.equal(abierta(m), true);
  assert.equal(m.lua('BANCO.pulsarTecla("ESCAPE")'), true);
  assert.equal(abierta(m), false);
  assert.equal(m.lua('BANCO.pulsarTecla("ESCAPE")'), false, 'cerrada, ya no se queda con Escape');
  // Con ella cerrada, Escape no la abre ni rompe.
  assert.equal(abierta(m), false);
  // Minimapa: clic izquierdo la abre; Mayúsculas+clic, el panel; clic derecho, la guía.
  assert.equal(m.lua(`${BOTON}:IsShown()`), true);
  m.lua(`${BOTON}:Click("LeftButton")`);
  assert.equal(abierta(m), true);
  assert.equal(m.marco('SnetForeverPanel') === undefined || m.marco('SnetForeverPanel').visible !== true, true, 'el panel no se abre');
  m.lua(`${BOTON}:Click("LeftButton")`);
  assert.equal(abierta(m), false, 'otro clic la cierra');
  m.lua('BANCO.shift = true');
  m.lua(`${BOTON}:Click("LeftButton")`);
  assert.equal(m.marco('SnetForeverPanel').visible, true);
  assert.equal(abierta(m), false);
  m.lua('BANCO.shift = false');
  const antes = m.lua(`${GUIDE}:IsVisible()`);
  m.lua(`${BOTON}:Click("RightButton")`);
  assert.equal(m.lua(`${GUIDE}:IsVisible()`), !antes);
  // La ayuda del botón y su icono.
  m.lua(`${BOTON}:GetScript("OnEnter")(${BOTON})`);
  const lineas = m.lua('BANCO.lineasTooltip()');
  assert.deepEqual(lineas, ['SnetForever', texto(m, 'MINIMAPA_COMERCIO'), texto(m, 'MINIMAPA_DERECHO'), texto(m, 'MINIMAPA_MAYUS')]);
  assert.match(lineas[1], /comercio/i);
  const rutas = m.lua(`(function()
    local t = {}
    for _, r in ipairs({${BOTON}:GetRegions()}) do if r:IsObjectType("Texture") and r:GetTexture() then t[#t + 1] = r:GetTexture() end end
    return t
  end)()`);
  assert.ok(rutas.includes('Interface\\AddOns\\SnetForever\\recursos\\icono'), JSON.stringify(rutas));
  sinErrores(m);
});

// El marco del banco sin EnableKeyboard, SetPropagateKeyboardInput ni SetResizeBounds (un cliente que no los tuviera).
const SIN_FUNCIONES = `do
  local crear, clase = CreateFrame, BANCO.clases.Frame.metodos
  local original = clase.SetMinResize
  clase.SetMinResize = function(self, ancho, alto) BANCO.minResize = {ancho, alto}; return original(self, ancho, alto) end
  CreateFrame = function(tipo, nombre, ...)
    local f = crear(tipo, nombre, ...)
    if nombre == "SnetForeverPrincipal" then BANCO.quitarMetodos(f, {"EnableKeyboard", "SetPropagateKeyboardInput", "SetResizeBounds"}) end
    return f
  end
end`;

test('si el cliente no tiene teclado propio, la ventana entra en UISpecialFrames al abrir y sale al cerrar; usa SetMinResize', necesitaComercio, () => {
  const m = maquina();
  m.lua(SIN_FUNCIONES);
  const enLista = () => m.lua(`(function() for _, n in ipairs(UISpecialFrames) do if n == ${aLua(V)} then return true end end return false end)()`);
  m.lua(`${P}.marco()`);
  assert.equal(m.lua(`${V}:IsKeyboardEnabled()`), false);
  assert.equal(enLista(), false, 'cerrada, no está');
  m.lua(`${P}.abrir()`);
  assert.equal(enLista(), true, 'al abrir entra');
  assert.deepEqual(m.lua('BANCO.minResize'), [1000, 600], 'el mínimo va por SetMinResize');
  assert.equal(m.lua('BANCO.pulsarTecla("ESCAPE")'), false);
  assert.equal(abierta(m), false, 'Escape la cierra por la lista');
  assert.equal(enLista(), false, 'al cerrar sale');
  m.lua(`${P}.abrir(); ${P}.abrir(); ${P}.cerrar()`);
  assert.equal(enLista(), false);
  sinErrores(m);
});

test('Escape en combate cierra la ventana sin tocar SetPropagateKeyboardInput; fuera de combate lo toca solo si cambia', necesitaComercio, () => {
  const m = maquina();
  m.lua(`${P}.marco()`);
  m.lua(`BANCO.cuenta = 0
    local clase = BANCO.clases.Frame.metodos
    local original = clase.SetPropagateKeyboardInput
    clase.SetPropagateKeyboardInput = function(self, valor) BANCO.cuenta = BANCO.cuenta + 1; return original(self, valor) end`);
  m.lua(`${P}.abrir()`);
  const cuenta = () => m.lua('BANCO.cuenta');
  // Fuera de combate: letras repetidas no vuelven a llamar; Escape llama una vez y cierra.
  m.lua('BANCO.pulsarTecla("A")');
  m.lua('BANCO.pulsarTecla("B")');
  const antes = cuenta();
  m.lua('BANCO.pulsarTecla("C")');
  assert.equal(cuenta(), antes, 'no se llama en cada pulsación');
  m.lua('BANCO.pulsarTecla("ESCAPE")');
  assert.equal(abierta(m), false);
  assert.equal(cuenta(), antes + 1);
  // En combate: ninguna llamada y Escape cierra igual.
  m.jugador({ enCombate: true });
  m.lua(`${P}.abrir()`);
  const enCombate = cuenta();
  m.lua('BANCO.pulsarTecla("A")');
  m.lua('BANCO.pulsarTecla("ESCAPE")');
  assert.equal(cuenta(), enCombate, 'en combate no se llama');
  assert.equal(abierta(m), false, 'y Escape la cierra');
  sinErrores(m);
});

test('cerrar la ventana a medio arrastre o a medio estirar suelta y guarda el sitio', necesitaComercio, () => {
  const m = maquina();
  m.lua(`${P}.abrir()`);
  const M = `${P}.marcos`;
  const inicial = m.lua(`${P}.sitioActual()`);
  m.lua(`${M}.cabecera:GetScript("OnMouseDown")(${M}.cabecera, "LeftButton")`);
  m.lua('BANCO.arrastre = {x = 30, y = -10}');
  m.lua(`${P}.cerrar()`);
  assert.equal(m.lua(`${M}.cabecera.moviendo`), false);
  const movido = m.lua('SnetForever.Ajustes.get("principal.sitio")');
  assert.deepEqual([movido.x, movido.y], [inicial.x + 30, inicial.y + 10]);
  m.lua(`${P}.abrir()`);
  m.lua(`${M}.asa:GetScript("OnMouseDown")(${M}.asa, "LeftButton")`);
  m.lua('BANCO.redimensionar = {ancho = -200, alto = -100}');
  m.lua(`${P}.cerrar()`);
  assert.equal(m.lua(`${M}.asa.estirando`), false);
  const estirado = m.lua('SnetForever.Ajustes.get("principal.sitio")');
  assert.deepEqual([estirado.ancho, estirado.alto], [1224, 705]);
  sinErrores(m);
});

test('la cabecera cabe a 1000 de ancho sin que se pisen pestañas, oro y X (en español y en inglés)', necesitaComercio, () => {
  for (const jugador of [JUGADOR, EN]) {
    const m = maquina({ jugador });
    m.lua('SnetForever.Ajustes.guardarSinAviso("principal.sitio", {x = 100, y = 100, ancho = 1000, alto = 600})');
    m.jugador({ dinero: 123456789 });
    m.lua(`${P}.abrir()`);
    const M = `${P}.marcos`;
    const r = m.lua(`(function()
      local function ancho(f) return f:GetRight() - f:GetLeft() end
      local ult = ${M}.pestanas.ajustes
      local usado = ult:GetRight() - ${V}:GetLeft()
      local derecha = ${V}:GetRight() - ${M}.oro:GetLeft()
      return {ancho = ${V}:GetWidth(), usado = usado, derecha = derecha, oroIzq = ${M}.oro:GetLeft(), ajustesDer = ult:GetRight(),
        logoDer = ${M}.logo:GetRight(), primera = ${M}.pestanas.dashboard:GetLeft()}
    end)()`);
    assert.equal(r.ancho, 1000);
    assert.ok(r.ajustesDer < r.oroIzq, `las pestañas no pisan el oro: ${JSON.stringify(r)}`);
    assert.ok(r.logoDer < r.primera, 'el logo no pisa la primera pestaña');
    assert.ok(r.usado + r.derecha <= 1000 * 0.85, `cabe con margen: ${JSON.stringify(r)}`);
    sinErrores(m);
  }
});

test('cambiar el idioma con la ventana creada repinta las pestañas y las páginas', necesitaComercio, () => {
  const m = maquina();
  m.lua(`${P}.abrir("dashboard")`);
  const M = `${P}.marcos`;
  assert.equal(m.lua(`${M}.pestanas.contabilidad.texto:GetText()`), 'Contabilidad');
  const anchoBoton = `(${M}.pestanas.contabilidad:GetRight() - ${M}.pestanas.contabilidad:GetLeft())`;
  const ancho = m.lua(anchoBoton);
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const textos = PESTANAS.map((p) => m.lua(`${M}.pestanas.${p}.texto:GetText()`));
  assert.deepEqual(textos, ['Dashboard', 'Accounting', 'Groups', 'Operations', 'Settings']);
  assert.notEqual(m.lua(anchoBoton), ancho, 'el ancho sigue al texto nuevo');
  assert.equal(m.lua(`${M}.paginas.dashboard.texto:GetText()`), texto(m, 'TRADE_LEDGER_EMPTY'));
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  assert.equal(m.lua(`${M}.pestanas.grupos.texto:GetText()`), 'Grupos');
  assert.equal(m.lua(`${M}.paginas.dashboard.texto:GetText()`), texto(m, 'TRADE_LEDGER_EMPTY'));
  sinErrores(m);
});

test('registrar dos veces una pestaña ya creada no vuelve a llamar a crear', necesitaComercio, () => {
  const m = maquina();
  principalSinPaginas(m);
  m.lua(`${P}.abrir("ajustes")`);
  m.lua(`BANCO.n = {crear = 0, mostrar = 0}
    ${P}.registrar("ajustes", {crear = function() BANCO.n.crear = BANCO.n.crear + 1 end, mostrar = function() BANCO.n.mostrar = BANCO.n.mostrar + 1 end})`);
  assert.equal(m.lua('BANCO.n.crear'), 1);
  m.lua(`${P}.registrar("ajustes", {crear = function() BANCO.n.crear = BANCO.n.crear + 10 end, mostrar = function() BANCO.n.mostrar = BANCO.n.mostrar + 100 end})`);
  assert.equal(m.lua('BANCO.n.crear'), 1, 'la segunda registración no crea otra vez');
  m.lua(`${P}.abrir("grupos"); ${P}.abrir("ajustes")`);
  assert.equal(m.lua('BANCO.n.crear'), 1);
  assert.equal(m.lua('BANCO.n.mostrar') >= 100, true, 'sí usa el mostrar nuevo');
  sinErrores(m);
});

test('cambiar de pestaña no repinta la ventana de la guía (no emite SNF_AJUSTE_CAMBIADO)', necesitaComercio, () => {
  const m = maquina();
  m.lua(`${P}.abrir()`);
  m.lua(`BANCO.avisos = 0; SnetForever.escuchar("SNF_AJUSTE_CAMBIADO", function(clave) if clave == "principal.pestana" then BANCO.avisos = BANCO.avisos + 1 end end)`);
  m.lua(`${P}.marcos.pestanas.ajustes:Click("LeftButton")`);
  m.lua(`${P}.abrir("dashboard")`);
  assert.equal(m.lua(`${P}.pestana()`), 'dashboard');
  assert.equal(m.lua('BANCO.avisos'), 0);
  assert.equal(m.lua(`${P}.marcos.paginas.dashboard:IsShown()`), true);
  sinErrores(m);
});

test('la ayuda lista /snet comercio', () => {
  for (const [jugador, orden] of [[JUGADOR, '/snet comercio'], [EN, '/snet trade']]) {
    const m = maquina({ jugador });
    const lineas = escribe(m, 'ayuda');
    assert.ok(lineas.some((l) => l.includes(orden)), `${orden}: ${lineas.join(' | ')}`);
    assert.ok(lineas.some((l) => l.includes('/snet c ')), 'y la letra corta');
    sinErrores(m);
  }
});

// ---------------------------------------------------------------------------------------------------
// Solo el núcleo
// ---------------------------------------------------------------------------------------------------

test('sin SnetForever_Comercio, el clic izquierdo abre el panel y /snet comercio avisa', () => {
  const m = nuevaMaquina({ jugador: JUGADOR, sinComercio: true });
  assert.equal(m.lua('SnetForever.comercioCargado()'), false);
  assert.equal(m.lua('rawget(SnetForever, "Principal")'), undefined);
  assert.deepEqual(escribe(m, 'comercio'), [texto(m, 'COMERCIO_NO_CARGADO')]);
  assert.deepEqual(escribe(m, 'trade'), [texto(m, 'COMERCIO_NO_CARGADO')]);
  m.lua(`${BOTON}:Click("LeftButton")`);
  assert.equal(m.marco('SnetForeverPanel').visible, true, 'como en la 0.6.x, abre el panel');
  const antes = m.lua(`${GUIDE}:IsVisible()`);
  m.lua(`${BOTON}:Click("RightButton")`);
  assert.equal(m.lua(`${GUIDE}:IsVisible()`), !antes, 'clic derecho alterna la guía');
  // La ayuda del botón no menciona el comercio.
  m.lua(`${BOTON}:GetScript("OnEnter")(${BOTON})`);
  const lineas = m.lua('BANCO.lineasTooltip()');
  assert.deepEqual(lineas, ['SnetForever', texto(m, 'MINIMAPA_IZQUIERDO'), texto(m, 'MINIMAPA_DERECHO')]);
  assert.equal(lineas.some((l) => /comercio|trading/i.test(l)), false);
  // El icono es el de SnetForever también sin el comercio.
  const rutas = m.lua(`(function()
    local t = {}
    for _, r in ipairs({${BOTON}:GetRegions()}) do if r:IsObjectType("Texture") and r:GetTexture() then t[#t + 1] = r:GetTexture() end end
    return t
  end)()`);
  assert.ok(rutas.includes('Interface\\AddOns\\SnetForever\\recursos\\icono'), JSON.stringify(rutas));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// El teclado y el combate
// ---------------------------------------------------------------------------------------------------

const enLista = (m) => m.lua(`(function() for _, n in ipairs(UISpecialFrames) do if n == ${aLua(V)} then return true end end return false end)()`);
// Que el teclado no esté atrapado: ninguna tecla se queda en la ventana, salvo Escape, que la cierra.
function sinAtrapar(m, motivo) {
  assert.equal(m.lua(`${V}:IsKeyboardEnabled()`), false, `${motivo}: no captura el teclado`);
  assert.equal(m.lua('BANCO.pulsarTecla("W")'), false, `${motivo}: las teclas de moverse pasan`);
  assert.equal(abierta(m), true);
}

test('abrir en combate tras un Escape fuera de combate no atrapa el teclado y Escape sigue cerrando', necesitaComercio, () => {
  const m = maquina();
  m.lua(`${P}.abrir()`);
  m.lua('BANCO.pulsarTecla("ESCAPE")'); // fuera de combate: la propagación queda en false
  assert.equal(abierta(m), false);
  m.jugador({ enCombate: true });
  m.lua(`${P}.abrir()`);
  sinAtrapar(m, 'en combate');
  assert.equal(enLista(m), true, 'Escape la cierra por la lista');
  m.lua('BANCO.pulsarTecla("ESCAPE")');
  assert.equal(abierta(m), false);
  assert.equal(enLista(m), false);
  // Al volver a abrirla fuera de combate, la propagación se fuerza a true aunque antes quedara en false.
  m.jugador({ enCombate: false });
  m.lua(`${P}.abrir()`);
  assert.equal(m.lua(`${V}:IsKeyboardEnabled()`), true);
  assert.equal(m.lua(`${V}:GetPropagateKeyboardInput()`), true);
  assert.equal(m.lua('BANCO.pulsarTecla("W")'), false);
  sinErrores(m);
});

test('crearla por primera vez en combate tampoco atrapa el teclado', necesitaComercio, () => {
  const m = maquina();
  m.jugador({ enCombate: true });
  m.lua(`${P}.abrir()`);
  sinAtrapar(m, 'primera vez en combate');
  m.lua('BANCO.pulsarTecla("ESCAPE")');
  assert.equal(abierta(m), false);
  sinErrores(m);
});

test('al salir de combate con la ventana abierta vuelve al teclado propio con la propagación a true', necesitaComercio, () => {
  const m = maquina();
  m.jugador({ enCombate: true });
  m.lua(`${P}.abrir()`);
  assert.equal(enLista(m), true);
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua(`${V}:IsKeyboardEnabled()`), true);
  assert.equal(m.lua(`${V}:GetPropagateKeyboardInput()`), true);
  assert.equal(enLista(m), false, 'ya no hace falta la lista');
  assert.equal(m.lua('BANCO.pulsarTecla("W")'), false, 'las teclas pasan');
  assert.equal(abierta(m), true);
  assert.equal(m.lua('BANCO.pulsarTecla("ESCAPE")'), true, 'Escape la retiene y cierra');
  assert.equal(abierta(m), false);
  // Y al entrar en combate con la ventana abierta, suelta el teclado.
  m.lua(`${P}.abrir()`);
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  sinAtrapar(m, 'al entrar en combate');
  assert.equal(enLista(m), true);
  // Cerrada, no escucha el combate ni deja nada en la lista.
  m.lua(`${P}.cerrar()`);
  assert.equal(m.lua(`${V}:IsEventRegistered("PLAYER_REGEN_ENABLED")`), false);
  assert.equal(enLista(m), false);
  sinErrores(m);
});

test('el aviso de «sin página» cambia con el idioma', necesitaComercio, () => {
  const m = maquina();
  principalSinPaginas(m);
  m.lua(`${P}.abrir("ajustes")`);
  const aviso = () => m.lua(`${P}.marcos.paginas.ajustes.sinPagina:GetText()`);
  assert.equal(aviso(), texto(m, 'PRINCIPAL_SIN_PAGINA'));
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(aviso(), 'This page is still being built');
  sinErrores(m);
});
