// Subasta, parte 3, bloque B, Task B2: la ventana de la subasta (raiz de ui/comercio.lua) con la cabecera de TSM (fila 1),
// las páginas por pestaña y el cambio de tamaño (SnetForever.SubastaVentana, ui/subasta/ventana.lua).
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
const V = 'SnetForever.UIComercio.marco()';
const AH = 'AuctionHouseFrame';
const PESTANAS = ['navegar', 'subasta', 'sniper', 'misSubastas'];
// AuctionHouseFrame de prueba: 800 × 500, arriba a la izquierda, a 10 y 100 de la esquina.
const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}; AuctionHouseFrame:EnableMouse(true); ';

// Ronda 1: precios de la app (ritmo 0,42, recién cargados) para que no haya ningún aviso que dure, como en
// comercio-cantidad.test.js.
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

function maquina({ idioma = 'es', previo = SUBASTA, pantalla, precios = false, escaneo = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-subasta-ventana-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  if (precios) ponerRanura(dir);
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' }, previo, pantalla });
  if (precios) m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua(`SnetForever.Ajustes.set("idioma", ${aLua(idioma)})`);
  if (escaneo) {
    // El escaneo falso: su estado y su motivo se cambian a mano y se avisa como él (SNF_COMERCIO_ESCANEO).
    m.lua(`SnetForever.Escaneo = {
      _estado = "esperando", _motivo = nil, _datos = {},
      iniciar = function() end, parar = function() end,
      estado = function() return SnetForever.Escaneo._estado end,
      motivo = function() return SnetForever.Escaneo._motivo end,
      datos = function() return SnetForever.Escaneo._datos end,
    }`);
  }
  return m;
}
// Pone el estado del escaneo falso, avisa y deja pasar el medio segundo entre repintados.
const escaneo = (m, estado, motivo) => {
  m.lua(`SnetForever.Escaneo._estado = ${aLua(estado)}; SnetForever.Escaneo._motivo = ${motivo ? aLua(motivo) : 'nil'}`);
  if (estado !== 'esperando') m.lua('SnetForever.Escaneo._datos = {[2589] = {precio = 90000, cantidad = 20, hora = GetServerTime() - 60}}');
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 1, 1)');
  m.avanzar(0.6);
};
const punto = (m) => m.lua(`${M}.punto:IsShown()`);
const lineasPunto = (m) => {
  m.lua(`${M}.punto:GetScript("OnEnter")(${M}.punto)`);
  const l = m.lua('BANCO.lineasTooltip()');
  m.lua(`${M}.punto:GetScript("OnLeave")(${M}.punto)`);
  return l;
};
// Average advance measured in the bundled TTFs with Pillow, using both locales' header text and gold digits.
const FACTOR_LETRA = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };
const WIDE_FONT_ADVANCES = { 'AlegreyaSC-Bold': 0.6120, 'BarlowSemiCondensed-Medium': 0.5715, 'BarlowSemiCondensed-SemiBold': 0.5820 };
// Ronda 5: dos fotogramas. En el primero la subasta de Blizzard se esconde y la ventana se recoloca; el oro de la cabecera
// se mide y sale en el siguiente (nunca en el mismo fotograma de abrir, ni con una recolocación pendiente).
const abrir = (m) => { m.disparar('AUCTION_HOUSE_SHOW'); m.avanzar(0.05); m.avanzar(0.05); };
const cerrar = (m) => m.disparar('AUCTION_HOUSE_CLOSED');
const texto = (m, clave) => m.lua(`SnetForever.L.t(${aLua(clave)})`);
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const colorTexto = (m, expr) => aHex(m.lua(`{${expr}:GetTextColor()}`));
const token = (m, nombre) => aHex(m.lua(`SnetForever.Tema.color(${aLua(nombre)})`));
const guardada = (m) => m.lua('SnetForeverCuenta.comercio.ventanaSubasta');
const sitio = (m) => m.lua(`${SV}.sitioActual()`);
// Píxeles reales de algo medido en unidades de la ventana, en una pantalla de 1080 de alto.
const reales = (m, expr) => m.lua(`(${expr}) * ${V}:GetEffectiveScale() * (1080 / 768)`);
// La ventana entera dentro de la pantalla (en unidades absolutas).
const dentro = (m) => m.lua(`(function()
  local s = ${V}:GetEffectiveScale()
  local l, b, r, t = ${V}:GetLeft() * s, ${V}:GetBottom() * s, ${V}:GetRight() * s, ${V}:GetTop() * s
  local w, h = UIParent:GetRight() * UIParent:GetEffectiveScale(), UIParent:GetTop() * UIParent:GetEffectiveScale()
  return l >= -0.01 and b >= -0.01 and r <= w + 0.01 and t <= h + 0.01
end)()`);
const texturasVisibles = (m, expr) => m.lua(`(function() local n = 0; for _, t in ipairs({${expr}:GetRegions()}) do if t:GetObjectType() == "Texture" and t:IsShown() then n = n + 1 end end; return n end)()`);
const estirar = (m, ancho, alto) => {
  m.lua(`${M}.asa:GetScript("OnMouseDown")(${M}.asa, "LeftButton")`);
  m.lua(`BANCO.redimensionar = {ancho = ${ancho}, alto = ${alto}}`);
  m.lua(`${M}.asa:GetScript("OnMouseUp")(${M}.asa, "LeftButton")`);
};

// ---------------------------------------------------------------------------------------------------
// Fila 1
// ---------------------------------------------------------------------------------------------------

test('la fila 1 lleva logo, 4 pestañas con la elegida en acento y sin fondo, punto, oro, Vista de Blizzard y X, en orden y sin pisarse', () => {
  const m = maquina();
  m.jugador({ dinero: 94845 });
  abrir(m);
  assert.equal(m.lua(`${V}.snfForgePlate:GetTexture()`), 'Interface\\AddOns\\SnetForever\\recursos\\forge-plate');
  assert.equal(m.lua(`${V}.cabecera == ${M}.cabecera`), true, 'la cabecera de la ventana es la nueva');
  assert.equal(m.lua(`${M}.cabecera:GetParent() == ${V}`), true);
  assert.ok(Math.abs(reales(m, `${M}.cabecera:GetHeight()`) - 38) < 0.01, '38 px reales, como la ventana principal');
  // El logo, como en la ventana principal.
  assert.equal(m.lua(`${M}.icono:GetTexture()`), 'Interface\\AddOns\\SnetForever\\recursos\\icono');
  assert.equal(m.lua(`${M}.logo:GetText()`), 'SnetForever');
  assert.match(m.lua(`(${M}.logo:GetFont())`), /AlegreyaSC-Bold\.ttf$/);
  // Las 4 pestañas, en orden, de 16 px en negrita y con 16 px entre ellas; la elegida (Navegar) en acento y sin fondo.
  assert.deepEqual(m.lua(`${M}.orden`), PESTANAS);
  const nombres = ['Navegar', 'Subasta', 'Sniper', 'Mis Subastas'];
  for (const [i, p] of PESTANAS.entries()) {
    const t = `${M}.pestanas.${p}.texto`;
    assert.equal(m.lua(`${t}:GetText()`), nombres[i]);
    assert.match(m.lua(`(${t}:GetFont())`), /BarlowSemiCondensed-SemiBold\.ttf$/);
    assert.ok(Math.abs(reales(m, `select(2, ${t}:GetFont())`) - 16) < 0.01, `${p} a 16 px reales`);
    assert.equal(texturasVisibles(m, `${M}.pestanas.${p}`), 0, `${p} sin fondo`);
    assert.equal(colorTexto(m, t), p === 'navegar' ? token(m, 'acento') : token(m, 'textoPestana'), p);
    if (i > 0) {
      const hueco = m.lua(`${t}:GetLeft() - ${M}.pestanas.${PESTANAS[i - 1]}.texto:GetRight()`);
      assert.ok(Math.abs(hueco - 16) < 0.01, `16 px antes de ${p}: ${hueco}`);
    }
  }
  assert.equal(token(m, 'acento'), 'e6ac72');
  // El oro, con Tema.dinero (tres colores).
  assert.equal(m.lua(`${M}.oro:GetText()`), m.lua('SnetForever.Tema.dinero(94845)'));
  assert.ok(Math.abs(reales(m, `select(2, ${M}.oro:GetFont())`) - 12) < 0.01, 'el oro a 12 px reales');
  // Vista de Blizzard: recuadro oscuro de 22 px con borde fino del color «borde», sin relleno, texto en Montserrat Medium de
  // 11 px con 14 px a cada lado (medido en subasta-tsm-2.png: «WoW UI» mide 76 × 22 con el texto a 14 px del borde; su
  // texto mide 47 px, lo mismo que «WoW UI» en Montserrat Medium de 11 px).
  const vb = `${M}.verBlizzard`;
  assert.equal(m.lua(`${V}.verBlizzard == ${vb}`), true);
  assert.equal(m.lua(`${vb}.texto:GetText()`), texto(m, 'COMERCIO_VER_BLIZZARD'));
  assert.ok(Math.abs(reales(m, `${vb}:GetHeight()`) - 22) < 0.01);
  assert.ok(Math.abs(reales(m, `select(2, ${vb}.texto:GetFont())`) - 11) < 0.01);
  assert.match(m.lua(`(${vb}.texto:GetFont())`), /BarlowSemiCondensed-SemiBold\.ttf$/);
  const relleno = m.lua(`(${vb}:GetWidth() - ${vb}.texto:GetUnboundedStringWidth()) / 2`);
  assert.ok(relleno >= 14 && relleno <= 16, `14 px de relleno a cada lado: ${relleno}`);
  const colores = m.lua(`(function() local r = {}; for _, t in ipairs({${vb}:GetRegions()}) do if t:GetObjectType() == "Texture" and t:IsShown() then r[#r + 1] = {t:GetVertexColor()} end end; return r end)()`);
  assert.equal(colores.length, 4, 'solo las cuatro tiras del borde');
  for (const c of colores) assert.equal(aHex(c), token(m, 'borde'));
  // La X sin fondo, con el icono «cerrar».
  assert.equal(m.lua(`${V}.cabecera.cerrar == ${M}.cerrar`), true);
  assert.equal(texturasVisibles(m, `${M}.cerrar`), 1, 'solo el icono');
  // El punto rojo: solo con algo que avisar, sin animación.
  m.lua(`${SV}.ponerAvisos({})`);
  assert.equal(m.lua(`${M}.punto:IsShown()`), true, 'el indicador se mantiene visible sin avisos');
  const before = aHex(m.lua(`{${M}.punto.icono:GetVertexColor()}`));
  m.lua(`${SV}.ponerAvisos({"uno", "dos"})`);
  assert.equal(m.lua(`${M}.punto:IsShown()`), true);
  assert.equal(aHex(m.lua(`{${M}.punto.icono:GetVertexColor()}`)), before, 'transient notices do not change the color');
  assert.ok(Math.abs(reales(m, `${M}.punto:GetWidth()`) - 12) < 0.01, 'de 12 px, como en la captura');
  // Ronda 1: un «!» blanco dentro, dibujado con dos rectángulos (el palo y el punto), sin animación.
  const signo = m.lua(`(function()
    local P = ${M}.punto
    local r = {}
    for _, t in ipairs(P.signo) do
      r[#r + 1] = {color = {t:GetVertexColor()}, dentro = t:GetLeft() >= P:GetLeft() and t:GetRight() <= P:GetRight()
        and t:GetBottom() >= P:GetBottom() and t:GetTop() <= P:GetTop(), alto = t:GetHeight(), arriba = t:GetTop(), capa = t:GetDrawLayer()}
    end
    return r
  end)()`);
  assert.equal(signo.length, 2, 'el palo y el punto');
  for (const t of signo) {
    assert.equal(aHex(t.color), 'ffffff', 'en blanco');
    assert.equal(t.dentro, true, 'dentro del círculo');
  }
  assert.ok(signo[0].alto > signo[1].alto && signo[0].arriba > signo[1].arriba, 'el palo arriba y más largo que el punto');
  m.lua(`${M}.punto:GetScript("OnEnter")(${M}.punto)`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()').slice(-2), ['uno', 'dos'], 'el tooltip dice qué avisa');
  m.lua(`${M}.punto:GetScript("OnLeave")(${M}.punto)`);
  // En orden de izquierda a derecha y sin pisarse: logo < pestañas < punto < oro < Vista de Blizzard < X, con los huecos
  // medidos en la captura (punto-oro 9, oro-botón 9, botón-X 13) y la X a 12 px del borde.
  const r = m.lua(`(function()
    local P = ${M}.pestanas
    return {logo = ${M}.logo:GetRight(), primera = P.navegar.texto:GetLeft(), ultima = P.misSubastas:GetRight(),
      puntoIzq = ${M}.punto:GetLeft(), puntoDer = ${M}.punto:GetRight(), oroIzq = ${M}.oro:GetLeft(), oroDer = ${M}.oro:GetRight(),
      vbIzq = ${vb}:GetLeft(), vbDer = ${vb}:GetRight(), xIzq = ${M}.cerrar:GetLeft(), xDer = ${M}.cerrar:GetRight(),
      borde = ${V}:GetRight()}
  end)()`);
  assert.ok(r.logo < r.primera && r.ultima < r.puntoIzq, JSON.stringify(r));
  assert.ok(Math.abs(r.oroIzq - r.puntoDer - 9) < 0.01, `punto-oro: ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.vbIzq - r.oroDer - 9) < 0.01, `oro-botón: ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.xIzq - r.vbDer - 13) < 0.01, `botón-X: ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.borde - r.xDer - 12) < 0.01, `X-borde: ${JSON.stringify(r)}`);
  // Vista de Blizzard esconde la ventana; la X cierra la subasta.
  m.lua(`${vb}:Click()`);
  assert.equal(m.lua(`${V}:IsShown()`), false);
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'blizzard');
  sinErrores(m);
});

test('el indicador sale con los avisos de la ventana (sin precios de la app) y su tooltip los lista', () => {
  const m = maquina();
  abrir(m);
  assert.equal(m.lua(`${M}.punto:IsShown()`), true, 'sin precios de la app hay aviso');
  m.lua(`${M}.punto:GetScript("OnEnter")(${M}.punto)`);
  const lineas = m.lua('BANCO.lineasTooltip()');
  assert.ok(lineas.includes(texto(m, 'COMERCIO_SIN_PRECIOS')), JSON.stringify(lineas));
  sinErrores(m);
});

// Ronda 1: el punto no se enciende y se apaga solo por cosas pasajeras (esperar a la subasta, una búsqueda ajena, el sniper
// en marcha, otro addon con la subasta). Nada que parpadee: regla de interfaz.
test('el punto no cambia en una apertura normal ni con TSM ocupando la subasta (con avisos que duran o sin ellos)', () => {
  for (const precios of [true, false]) {
    const m = maquina({ precios, escaneo: true });
    m.disparar('AUCTION_HOUSE_SHOW');
    const vistos = [];
    const mirar = () => { vistos.push(punto(m)); };
    for (let i = 0; i < 4; i++) { m.avanzar(0.05); mirar(); }
    // Apertura normal: espera a la subasta, escanea y acaba.
    escaneo(m, 'esperando'); mirar();
    assert.ok(m.lua(`${V}.avisos:GetText()`).includes(texto(m, 'COMERCIO_ESPERANDO')), 'la línea de avisos sí dice que espera');
    escaneo(m, 'escaneando'); mirar();
    escaneo(m, 'completo'); mirar();
    // El sniper en marcha y parado otra vez.
    m.lua('SnetForever.Sniper.activo = function() return true end; SnetForever.emitir("SNF_COMERCIO_SNIPER")');
    m.avanzar(0.6); mirar();
    escaneo(m, 'completo'); mirar();
    assert.ok(m.lua(`${V}.avisos:GetText()`).includes(texto(m, 'COMERCIO_LISTA_SNIPER')), 'la línea de avisos dice que el sniper corre');
    m.lua('SnetForever.Sniper.activo = function() return false end; SnetForever.emitir("SNF_COMERCIO_SNIPER")');
    m.avanzar(0.6); mirar();
    // TSM (o nuestra búsqueda) ocupa la subasta: el escaneo espera; y otro addon se queda la subasta un rato.
    escaneo(m, 'esperando', 'ajena'); mirar();
    escaneo(m, 'escaneando'); mirar();
    m.lua(`${AH}:SetScale(0.001)`); // TSM la esconde con su escala diminuta: es suya
    escaneo(m, 'parado', 'otro'); mirar();
    m.lua(`${AH}:SetScale(1)`); // la devuelve
    escaneo(m, 'completo'); mirar();
    assert.deepEqual([...new Set(vistos)], [true], `con precios = ${precios}, el punto no cambia: ${vistos}`);
    const lineas = lineasPunto(m);
    for (const clave of ['COMERCIO_ESPERANDO', 'COMERCIO_ESCANEO_AJENA', 'COMERCIO_LISTA_SNIPER', 'COMERCIO_ESCANEO_OTRO']) {
      assert.ok(!lineas.includes(texto(m, clave)), `${clave} no va en el punto`);
    }
    sinErrores(m);
  }
});

test('el indicador explica un aviso que dura: escaneo parado por otro addon o con la subasta vacía, y el comercio apagado', () => {
  for (const [estado, motivo, clave] of [['parado', 'ajena', 'COMERCIO_ESCANEO_PARADO_AJENA'], ['parado', 'vacia', 'COMERCIO_ESCANEO_VACIA']]) {
    const m = maquina({ precios: true, escaneo: true });
    abrir(m);
    escaneo(m, 'completo');
    assert.equal(punto(m), true, 'el indicador sigue a la vista aunque termine el escaneo');
    escaneo(m, estado, motivo);
    assert.equal(punto(m), true, clave);
    assert.ok(lineasPunto(m).includes(texto(m, clave)));
    sinErrores(m);
  }
  // Precios viejos: hay que hacer /reload.
  const r = maquina({ precios: true, escaneo: true });
  abrir(r);
  escaneo(r, 'completo');
  r.lua('SnetForever.Precios.hayQueRecargar = function() return true end');
  escaneo(r, 'completo');
  assert.equal(punto(r), true, '/reload');
  sinErrores(r);
  // El comercio se apaga por un fallo.
  const a = maquina({ precios: true, escaneo: true });
  abrir(a);
  escaneo(a, 'completo');
  a.lua('SnetForever.emitir("SNF_COMERCIO_APAGADO")');
  assert.equal(punto(a), true, 'apagado');
  assert.ok(lineasPunto(a).includes(texto(a, 'COMERCIO_APAGADO')));
});

// ---------------------------------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------------------------------

test('abre en Navegar y se puede entrar a vender y a Mis Subastas', () => {
  const m = maquina();
  abrir(m);
  assert.equal(m.lua(`${SV}.pagina()`), 'navegar');
  assert.equal(m.lua(`${M}.paginas.navegar:IsVisible()`), true, 'Navegar es una página registrada (vacía por ahora)');
  assert.equal(m.lua(`${M}.paginas.navegar.sinPagina`), undefined, 'sin el aviso de página sin hacer');
  assert.equal(m.lua(`${V}.pie:IsVisible()`), false, 'Navegar no lleva la barra de compra');
  for (const [page, tableName] of [['subasta', 'bags'], ['misSubastas', 'list']]) {
    m.lua(`${M}.pestanas.${page}:Click()`);
    assert.equal(m.lua(`${SV}.pagina()`), page);
    assert.equal(m.lua(`${M}.paginas.${page}:IsVisible()`), true);
    assert.equal(m.lua(`${M}.paginas.navegar:IsVisible()`), false);
    assert.equal(m.lua(`${M}.paginas.${page}.${tableName}:IsVisible()`), true);
    assert.equal(m.lua(`${M}.paginas.${page}.action.snfApagado`), true);
    assert.equal(colorTexto(m, `${M}.pestanas.${page}.texto`), token(m, 'acento'));
    assert.equal(colorTexto(m, `${M}.pestanas.navegar.texto`), token(m, 'textoPestana'));
  }
  // Navegar y Sniper no llevan ese tooltip.
  m.lua(`${M}.pestanas.navegar:GetScript("OnEnter")(${M}.pestanas.navegar)`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  // Al cerrar y volver a abrir la subasta, otra vez en Navegar.
  m.lua(`${M}.pestanas.sniper:Click()`);
  cerrar(m);
  abrir(m);
  assert.equal(m.lua(`${SV}.pagina()`), 'navegar');
  assert.equal(m.lua(`${M}.paginas.navegar:IsVisible()`), true);
  assert.equal(m.lua(`${M}.paginas.sniper:IsVisible()`), false);
  // La lista vieja de ofertas sigue ahí como página interna «ofertas», sin pestaña propia (Navegar sigue en acento).
  assert.equal(m.lua(`${M}.pestanas.ofertas`), undefined);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  assert.equal(m.lua(`${SV}.pagina()`), 'ofertas');
  assert.equal(m.lua(`${V}.cuerpo:IsVisible()`), true);
  assert.equal(m.lua(`${V}.panelGrupos:IsVisible()`), true);
  assert.equal(m.lua(`${V}.pie:IsVisible()`), true, 'con la barra de compra');
  assert.equal(colorTexto(m, `${M}.pestanas.navegar.texto`), token(m, 'acento'));
  // En inglés.
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.deepEqual(PESTANAS.map((p) => m.lua(`${M}.pestanas.${p}.texto:GetText()`)), ['Browse', 'Auction', 'Sniper', 'My Auctions']);
  assert.equal(m.lua(`${M}.paginas.subasta.bags ~= nil`), true);
  sinErrores(m);
});

// Tarea S2: la pestaña Sniper es la página de ui/subasta/sniper.lua (SnetForever.SubastaSniper), con su propia barra de abajo.
test('Sniper enseña la página del sniper (su propia barra, sin la de la lista vieja) y sus pruebas siguen pasando', () => {
  const m = maquina();
  const P = 'SnetForever.SubastaSniper.marcos';
  abrir(m);
  assert.equal(m.lua(`${P}.pagina:IsVisible()`), false);
  m.lua(`${M}.pestanas.sniper:Click()`);
  assert.equal(m.lua(`${SV}.pagina()`), 'sniper');
  assert.equal(m.lua('SnetForever.UIComercio.pestana()'), 'sniper');
  assert.equal(m.lua(`${P}.pagina:IsVisible()`), true);
  assert.equal(m.lua(`${P}.pagina == ${M}.paginas.sniper`), true, 'es su página');
  assert.equal(m.lua(`${P}.grande:IsVisible()`), true, 'parado: el botón Empezar grande');
  assert.equal(m.lua(`${V}.pie:IsVisible()`), false, 'sin la barra de compra de la lista vieja');
  assert.equal(m.lua(`${V}.cuerpo:IsVisible()`), false, 'la lista vieja no');
  // La página queda dentro de la ventana y por debajo de la cabecera.
  const r = m.lua(`(function() local k = ${P}.pagina:GetEffectiveScale() / ${V}:GetEffectiveScale()
    return {${P}.pagina:GetTop() * k, ${M}.cabecera:GetBottom(), ${P}.pagina:GetBottom() * k, ${V}:GetBottom()} end)()`);
  assert.ok(r[0] <= r[1] + 0.01 && r[2] >= r[3] - 0.01, JSON.stringify(r));
  // Con elegirPestana también.
  m.lua('SnetForever.UIComercio.elegirPestana("navegar")');
  assert.equal(m.lua(`${P}.pagina:IsVisible()`), false);
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  assert.equal(m.lua(`${P}.pagina:IsVisible()`), true);
  sinErrores(m);
});

test('registrar enchufa una página; registrar otra vez una ya creada no vuelve a llamar a crear', () => {
  const m = maquina();
  m.lua(`_G.CREADA = 0; ${SV}.registrar("subasta", {crear = function(f) _G.CREADA = _G.CREADA + 1; f.mia = true end})`);
  abrir(m);
  m.lua(`${M}.pestanas.subasta:Click()`);
  assert.equal(m.lua('_G.CREADA'), 1);
  assert.equal(m.lua(`${M}.paginas.subasta.mia`), true);
  m.lua(`${SV}.registrar("subasta", {crear = function() _G.CREADA = _G.CREADA + 1 end})`);
  assert.equal(m.lua('_G.CREADA'), 1);
  assert.throws(() => m.lua(`${SV}.registrar("otra", {})`));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Tamaño
// ---------------------------------------------------------------------------------------------------

test('el agarre cambia el tamaño entre el mínimo y la pantalla y se guarda; al reabrir vuelve igual y dentro de la pantalla', () => {
  let m = maquina();
  abrir(m);
  assert.equal(m.lua(`${V}:IsResizable()`), true);
  const asa = m.lua(`{${M}.asa:GetRight(), ${M}.asa:GetBottom(), ${V}:GetRight(), ${V}:GetBottom()}`);
  assert.ok(Math.abs(asa[0] - (asa[2] - 2)) < 0.01 && Math.abs(asa[1] - (asa[3] + 2)) < 0.01, `abajo a la derecha: ${asa}`);
  const inicial = sitio(m);
  // Sin guardar nada, la ventana tapa la subasta: 800 × 500 de UIParent son 1125 × 703 píxeles a escala 1 en 1080.
  assert.deepEqual([inicial.ancho, inicial.alto], [1125, 703]);
  estirar(m, 100, 50);
  assert.equal(m.llamadas('StartSizing').length, 1, 'el asa empieza a estirar');
  const grande = sitio(m);
  assert.deepEqual([grande.x, grande.y, grande.ancho, grande.alto], [inicial.x, inicial.y, 1225, 753], 'la esquina de arriba a la izquierda no se mueve');
  assert.deepEqual(guardada(m), grande, 'se guardan la posición y el tamaño');
  // El mínimo: que quepa la cabecera y el contenido del bloque B (ronda 1 de B4r: 830 × 500).
  estirar(m, -5000, -5000);
  assert.deepEqual([sitio(m).ancho, sitio(m).alto], [830, 500]);
  // El máximo: hasta el borde de la pantalla desde donde está la ventana (ronda 1), sin salirse.
  estirar(m, 5000, 5000);
  const tope = sitio(m);
  assert.ok(tope.x + tope.ancho <= 1920 && tope.y + tope.alto <= 1080, JSON.stringify(tope));
  assert.ok(tope.x + tope.ancho >= 1919, `llega al borde derecho: ${JSON.stringify(tope)}`);
  assert.deepEqual([tope.x, tope.y], [inicial.x, inicial.y], 'la esquina no se mueve');
  assert.deepEqual(guardada(m), tope, 'se guarda sin salirse');
  assert.equal(dentro(m), true);
  estirar(m, -(sitio(m).ancho - 1000), -(sitio(m).alto - 600));
  const hecho = sitio(m);
  assert.deepEqual([hecho.ancho, hecho.alto], [1000, 600]);
  // Al cerrar y volver a abrir la subasta, y tras recargar, igual.
  cerrar(m);
  abrir(m);
  assert.deepEqual(sitio(m), hecho);
  m = m.recargar();
  m.lua(SUBASTA);
  abrir(m);
  assert.deepEqual(sitio(m), hecho);
  assert.equal(dentro(m), true);
  sinErrores(m);
  // Un sitio guardado fuera de la pantalla o más grande que ella se mete dentro.
  for (const fuera of ['{x = 5000, y = 5000, ancho = 1000, alto = 600}', '{x = -800, y = -900, ancho = 1000, alto = 600}', '{x = 0, y = 0, ancho = 9000, alto = 9000}']) {
    const n = maquina();
    n.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = ${fuera}`);
    abrir(n);
    assert.equal(dentro(n), true, fuera);
    assert.ok(sitio(n).ancho >= 830 && sitio(n).alto >= 500, fuera);
    sinErrores(n);
  }
  // Un sitio roto se ignora: tapa la subasta.
  const rota = maquina();
  rota.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = "a", ancho = {}}');
  abrir(rota);
  assert.deepEqual([sitio(rota).ancho, sitio(rota).alto], [1125, 703]);
  sinErrores(rota);
});

test('el agarre no estira con la subasta de Blizzard aún a la vista (combate) y cerrar a medio estirar guarda', () => {
  const m = maquina();
  m.lua('BANCO.jugador.enCombate = true');
  abrir(m);
  m.lua(`${M}.asa:GetScript("OnMouseDown")(${M}.asa, "LeftButton")`);
  assert.equal(m.llamadas('StartSizing').length, 0, 'tapa la subasta: no se estira');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  m.lua(`${M}.asa:GetScript("OnMouseDown")(${M}.asa, "LeftButton")`);
  assert.equal(m.llamadas('StartSizing').length, 1, 'ya escondida, sí');
  m.lua('BANCO.redimensionar = {ancho = -100, alto = -100}');
  cerrar(m);
  assert.equal(m.lua(`${M}.asa.estirando`), false);
  const g = guardada(m);
  assert.deepEqual([g.ancho, g.alto], [1025, 603]);
  sinErrores(m);
});

test('a escala de interfaz 0,64 y 1 la ventana mide en píxeles reales lo mismo', () => {
  for (const escala of [0.64, 1]) {
    const m = maquina();
    m.lua(`UIParent:SetScale(${escala})`);
    m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 100, y = 80, ancho = 1000, alto = 600}');
    abrir(m);
    assert.ok(Math.abs(m.lua(`${V}:GetEffectiveScale()`) - 768 / 1080) < 1e-6, `escala efectiva a ${escala}`);
    const ancho = reales(m, `${V}:GetWidth()`);
    const alto = reales(m, `${V}:GetHeight()`);
    assert.ok(Math.abs(ancho - 1000) <= 1 && Math.abs(alto - 600) <= 1, `escala ${escala}: ${ancho}×${alto}`);
    assert.ok(Math.abs(reales(m, `select(2, ${M}.pestanas.navegar.texto:GetFont())`) - 16) < 0.01);
    assert.deepEqual(sitio(m), { x: 100, y: 80, ancho: 1000, alto: 600 });
    sinErrores(m);
  }
  // Al cambiar la escala de interfaz o la pantalla con la ventana abierta, sigue midiendo lo mismo en píxeles reales.
  const m = maquina();
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 100, y = 80, ancho = 1000, alto = 600}');
  abrir(m);
  m.lua('UIParent:SetScale(0.64)');
  m.disparar('UI_SCALE_CHANGED');
  assert.ok(Math.abs(reales(m, `${V}:GetWidth()`) - 1000) <= 1);
  assert.ok(Math.abs(m.lua(`${V}:GetEffectiveScale()`) - 768 / 1080) < 1e-6);
  m.pantalla({ ancho: 2560, alto: 1440 });
  m.disparar('DISPLAY_SIZE_CHANGED');
  assert.ok(Math.abs(m.lua(`${V}:GetEffectiveScale()`) - 768 / 1440) < 1e-6, 'un píxel sigue siendo una unidad');
  assert.equal(m.lua(`${V}:GetWidth()`), 1000);
  sinErrores(m);
});

test('sin subasta de Blizzard ni sitio guardado sale centrada y de su tamaño de siempre (860 × 545)', () => {
  const m = maquina({ previo: '' });
  abrir(m);
  assert.equal(m.lua(`${V}:IsShown()`), true);
  assert.deepEqual([sitio(m).ancho, sitio(m).alto], [860, 545]);
  const c = m.lua(`{(${V}:GetLeft() + ${V}:GetRight()) / 2 * ${V}:GetEffectiveScale(), UIParent:GetRight() / 2 * UIParent:GetEffectiveScale()}`);
  assert.ok(Math.abs(c[0] - c[1]) < 1, `centrada: ${c}`);
  sinErrores(m);
});

// Ronda 1 de B4r: el tamaño nuevo (por defecto 860 × 545, mínimo 830 × 500) no toca las ventanas ya guardadas que caben;
// una guardada por debajo del mínimo nuevo sube al mínimo sin moverse de su sitio.
test('una ventana guardada con el tamaño de antes (960 × 560) no se toca; una por debajo del mínimo (800 × 480) sube a 830 × 500', () => {
  assert.deepEqual(maquina().lua(`${SV}.MINIMO`), { ancho: 830, alto: 500 });
  const vieja = maquina();
  vieja.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 100, y = 80, ancho = 960, alto = 560}');
  abrir(vieja);
  assert.deepEqual(sitio(vieja), { x: 100, y: 80, ancho: 960, alto: 560 }, 'la de antes, igual');
  sinErrores(vieja);
  const chica = maquina();
  chica.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 100, y = 80, ancho = 800, alto = 480}');
  abrir(chica);
  assert.deepEqual(sitio(chica), { x: 100, y: 80, ancho: 830, alto: 500 }, 'sube al mínimo nuevo, en su sitio');
  sinErrores(chica);
});

// ---------------------------------------------------------------------------------------------------
// Cabe
// ---------------------------------------------------------------------------------------------------

// The simulator adds 3% to the measured advances. Use a wider profile to exercise the gold abbreviation path.
const LIBRE_FILA_1 = 8;
const MUCHO_ORO = 123456789012; // 12.345.678g 90s 12c
const ORO_REALISTA = 99999999; // 9.999g 99s 99c
const letraReal = (m, advances = FACTOR_LETRA) => m.lua(`BANCO.letraReal = {${Object.entries(advances).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);
function maquinaReal({ idioma = 'es', ancho = 830, dinero = ORO_REALISTA, escala = 1, avisos = true, advances = FACTOR_LETRA } = {}) {
  const m = maquina({ idioma });
  letraReal(m, advances);
  m.lua(`UIParent:SetScale(${escala})`);
  m.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 50, y = 50, ancho = ${ancho}, alto = 500}`);
  m.jugador({ dinero });
  abrir(m);
  if (avisos) m.lua(`${SV}.ponerAvisos({"aviso"})`);
  return m;
}
// La fila 1 medida: el ancho, el sitio libre entre la última pestaña y lo primero de la derecha (el punto o, sin él, el oro)
// y el texto del oro.
const fila1 = (m) => m.lua(`(function()
  local P = ${M}.pestanas
  local primero = ${M}.punto:IsShown() and ${M}.punto or ${M}.oro
  local vb = ${M}.verBlizzard
  return {ancho = ${V}:GetWidth(), libre = primero:GetLeft() - P.misSubastas:GetRight(), oro = ${M}.oro:GetText() or "",
    oroDer = ${M}.oro:GetRight(), vbIzq = vb:GetLeft(), logo = ${M}.logo:GetRight(), primera = P.navegar:GetLeft(),
    vbTexto = vb.texto:GetUnboundedStringWidth(), vbAncho = vb:GetWidth()}
end)()`);
const sinColores = (t) => t.replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');

test('ronda 2: a 830 con 9.999g 99s 99c la fila 1 cabe con al menos 8 px reales libres, en es y en, a escala 0,64 y 1', () => {
  for (const idioma of ['es', 'en']) {
    for (const escala of [0.64, 1]) {
      const m = maquinaReal({ idioma, escala });
      const r = fila1(m);
      assert.equal(Math.round(r.ancho), 830, `${idioma}: al mínimo`);
      assert.ok(r.logo < r.primera, `${idioma}: el logo no pisa la primera pestaña`);
      assert.ok(r.libre >= LIBRE_FILA_1, `${idioma} a ${escala}: ${r.libre.toFixed(1)} px libres con «${sinColores(r.oro)}»`);
      assert.ok(r.oroDer <= r.vbIzq, `${idioma}: el oro no pisa el botón`);
      assert.ok(r.vbTexto <= r.vbAncho * 0.85, `${idioma}: el texto de Vista de Blizzard cabe en su botón`);
      // El mensaje de estado cabe en Mis Subastas.
      m.lua(`${M}.pestanas.misSubastas:Click()`);
      const t = m.lua(`{${M}.paginas.misSubastas.totals:GetUnboundedStringWidth(), ${M}.paginas.misSubastas:GetWidth()}`);
      assert.ok(t[0] <= t[1] * 0.85, `${idioma}: ${t}`);
      sinErrores(m);
    }
  }
});

test('Forge fonts fit the full 12.345.678g balance at 830px in both locales', () => {
  for (const idioma of ['es', 'en']) {
    const m = maquinaReal({ idioma, dinero: MUCHO_ORO });
    const entero = m.lua(`SnetForever.Tema.dinero(${MUCHO_ORO})`);
    const r = fila1(m);
    assert.ok(r.libre >= 0, `${idioma}: no se pisa (${r.libre.toFixed(1)} px con «${sinColores(r.oro)}»)`);
    assert.ok(r.oroDer <= r.vbIzq, `${idioma}: el oro no pisa el botón`);
    assert.equal(r.oro, entero, `${idioma}: the compact header shows the full balance`);
    const z = `${M}.zonaOro`;
    m.lua(`${z}:GetScript("OnEnter")(${z})`);
    assert.ok(m.lua('BANCO.lineasTooltip()').includes(entero), `${idioma}: el tooltip da la cantidad entera`);
    m.lua(`${z}:GetScript("OnLeave")(${z})`);
    sinErrores(m);
    const g = maquinaReal({ idioma, dinero: MUCHO_ORO, ancho: 1200 });
    assert.equal(fila1(g).oro, entero, `${idioma}: a 1200 entero`);
    sinErrores(g);
  }
});

test('ronda 2: el oro acortado lleva su color, vuelve a salir entero al agrandar la ventana y corto al achicarla', () => {
  const m = maquinaReal({ dinero: ORO_REALISTA, advances: WIDE_FONT_ADVANCES });
  const entero = m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`);
  const corto = fila1(m).oro;
  assert.notEqual(corto, entero, 'a 830 en español, 9.999g 99s 99c no cabe entero');
  assert.ok(corto.startsWith(`|cff${m.lua('SnetForever.Tema.hex("oro")')}9999g|r`), `empieza por el oro en su color: ${corto}`);
  // Al agrandar la ventana con el asa, entero.
  estirar(m, 400, 0);
  m.avanzar(0.05); // el oro se mide en el fotograma siguiente (ronda 3)
  assert.ok(sitio(m).ancho >= 1200);
  assert.equal(fila1(m).oro, entero, 'al agrandar, entero');
  // Y al volver a achicarla, otra vez corto, igual que antes.
  estirar(m, -400, 0);
  m.avanzar(0.05);
  assert.equal(fila1(m).oro, corto, 'al achicar, el mismo acortado');
  sinErrores(m);
});

test('ronda 2: el tooltip del oro da siempre la cantidad entera; repintar con el mismo ancho y oro da siempre lo mismo', () => {
  const m = maquinaReal({ dinero: MUCHO_ORO, advances: WIDE_FONT_ADVANCES });
  const entero = m.lua(`SnetForever.Tema.dinero(${MUCHO_ORO})`);
  const z = `${M}.zonaOro`;
  assert.notEqual(m.lua(`${M}.oro:GetText()`), entero, 'el texto va acortado');
  // La zona del tooltip se puede tocar (aunque el oro no quepa ni solo) y no pisa el punto ni el botón.
  const zona = m.lua(`{${z}:GetWidth(), ${z}:GetLeft() >= ${M}.punto:GetRight() - 0.01, ${z}:GetRight() <= ${M}.verBlizzard:GetLeft() + 0.01}`);
  assert.ok(zona[0] >= 9, `zona de ${zona[0]} px`);
  assert.deepEqual(zona.slice(1), [true, true], 'entre el punto y el botón');
  m.lua(`${z}:GetScript("OnEnter")(${z})`);
  const lineas = m.lua('BANCO.lineasTooltip()');
  assert.ok(lineas.includes(entero), `el tooltip enseña ${sinColores(entero)}: ${JSON.stringify(lineas)}`);
  m.lua(`${z}:GetScript("OnLeave")(${z})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  // Desde la zona del tooltip se sigue arrastrando la ventana: arrastrar y el clic derecho van a la cabecera.
  m.lua(`_G.PASADOS = {}; for _, s in ipairs({"OnDragStart", "OnDragStop", "OnMouseUp"}) do ${M}.cabecera:SetScript(s, function(self, boton) table.insert(_G.PASADOS, s .. ":" .. tostring(boton) .. ":" .. tostring(self == ${M}.cabecera)) end) end`);
  m.lua(`${z}:GetScript("OnDragStart")(${z}, "LeftButton"); ${z}:GetScript("OnDragStop")(${z}); ${z}:GetScript("OnMouseUp")(${z}, "RightButton")`);
  assert.deepEqual(m.lua('_G.PASADOS'), ['OnDragStart:LeftButton:true', 'OnDragStop:nil:true', 'OnMouseUp:RightButton:true']);
  // Mismo ancho y mismo oro: repintar una y otra vez, o volver a poner el mismo aviso, no cambia nada.
  const vistos = [];
  for (let i = 0; i < 4; i++) {
    m.lua(`${SV}.pintarOro()`);
    vistos.push(m.lua(`${M}.oro:GetText()`));
    m.lua(`${SV}.ponerAvisos({"aviso"})`);
    vistos.push(m.lua(`${M}.oro:GetText()`));
  }
  assert.equal(new Set(vistos).size, 1, `siempre lo mismo: ${vistos.map(sinColores)}`);
  assert.equal(m.lua(`${M}.cabecera:GetScript("OnUpdate")`), undefined, 'nada en OnUpdate');
  // El oro cambia: se vuelve a decidir (5g 00s 00c: en español a 830 y con el punto, sin el cobre).
  m.jugador({ dinero: 50000 });
  m.lua(`${SV}.pintarOro()`);
  assert.equal(sinColores(m.lua(`${M}.oro:GetText()`)), '5g 00s', 'poco oro, con el punto: sin el cobre');
  m.lua(`${SV}.ponerAvisos({})`);
  assert.equal(sinColores(m.lua(`${M}.oro:GetText()`)), '5g 00s', 'quitar el aviso conserva el sitio del indicador');
  sinErrores(m);
});

test('ronda 2: al cambiar de idioma se vuelve a decidir el oro y los avisos conservan el ancho', () => {
  const m = maquinaReal({ dinero: ORO_REALISTA });
  const entero = m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`);
  const es = fila1(m).oro;
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  m.avanzar(0.05);
  const en = fila1(m);
  assert.ok(en.libre >= LIBRE_FILA_1, `en: ${en.libre}`);
  assert.ok(sinColores(en.oro).length >= sinColores(es).length, `en inglés la fila es más corta: igual o más oro (${sinColores(en.oro)})`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.avanzar(0.05);
  assert.equal(fila1(m).oro, es, 'de vuelta en español, como antes');
  // The status point keeps the same width when notices clear.
  m.lua(`${SV}.ponerAvisos({})`);
  const sinPunto = fila1(m);
  assert.ok(sinPunto.libre >= LIBRE_FILA_1);
  assert.equal(sinPunto.oro, es);
  assert.ok(entero.length >= sinPunto.oro.length);
  sinErrores(m);
});

// Ronda 4 (sin parpadeos: al abrir nada aparece y cambia al poco). Mientras el oro no está medido de verdad no se ve (ni el
// punto, que va pegado a él); sale una sola vez, ya en su forma final. Con la letra sin cargar (BANCO.textoSinCargar) se
// reintenta cada 0,2 s, como mucho 2 s; pasados, sale la forma más corta que cabe con lo que haya, y ya no se mide más solo.
// Lo que se ve del oro: su texto si está a la vista, '' si no (escondido o vacío).
const oroVisible = (m) => m.lua(`(function() local o = ${M}.oro; if o:GetAlpha() > 0 and o:IsVisible() then return o:GetText() or "" end; return "" end)()`);
test('ronda 4: con la letra sin cargar al abrir, el oro no se ve hasta estar medido y sale una sola vez, ya en su forma final', () => {
  for (const [ancho, final] of [[830, '9999g'], [1200, '9999g 99s 99c']]) {
    const m = maquina();
    letraReal(m, WIDE_FONT_ADVANCES);
    m.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 50, y = 50, ancho = ${ancho}, alto = 500}`);
    m.jugador({ dinero: ORO_REALISTA });
    m.lua('BANCO.textoSinCargar = true');
    abrir(m);
    m.lua(`${SV}.ponerAvisos({"aviso"})`);
    const vistos = [];
    for (let i = 0; i < 20; i++) { m.avanzar(0.05); vistos.push(oroVisible(m)); } // 1 s aún sin letra
    assert.ok(vistos.every((v) => v === ''), `${ancho}: sin poder medir, el oro no se ve: ${vistos.map(sinColores)}`);
    assert.equal(m.lua(`${M}.punto:GetAlpha()`), 0, `${ancho}: ni el punto`);
    m.lua('BANCO.textoSinCargar = false'); // la letra carga
    for (let i = 0; i < 20; i++) { m.avanzar(0.05); vistos.push(oroVisible(m)); }
    const desde = vistos.findIndex((v) => v !== '');
    assert.ok(desde > 0, `${ancho}: sale al poder medir`);
    const tras = vistos.slice(desde);
    assert.ok(tras.every((v) => v === tras[0]), `${ancho}: desde que sale no cambia: ${tras.map(sinColores)}`);
    assert.equal(sinColores(tras[0]), final, `${ancho}: ya en su forma final`);
    assert.equal(m.lua(`${M}.punto:GetAlpha()`), 1, `${ancho}: el punto sale con él`);
    const r = fila1(m);
    assert.ok(r.libre >= LIBRE_FILA_1, `${ancho}: ${r.libre}`);
    // El botón también sigue ya a su texto (con la letra sin cargar medía solo el relleno).
    const vb = m.lua(`{${M}.verBlizzard:GetWidth(), ${M}.verBlizzard.texto:GetUnboundedStringWidth()}`);
    assert.ok(Math.abs(vb[0] - vb[1] - 30.5) < 1.01, `relleno de 14 px a cada lado: ${vb}`);
    // El tooltip funciona todo el rato.
    m.lua(`${M}.zonaOro:GetScript("OnEnter")(${M}.zonaOro)`);
    assert.ok(m.lua('BANCO.lineasTooltip()').includes(m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`)));
    m.lua(`${M}.zonaOro:GetScript("OnLeave")(${M}.zonaOro)`);
    sinErrores(m);
  }
});

test('ronda 4: si a los 2 s la letra sigue sin cargar, sale la forma más corta una sola vez y ya no se reintenta', () => {
  const m = maquina();
  letraReal(m);
  m.jugador({ dinero: ORO_REALISTA });
  m.lua('BANCO.textoSinCargar = true');
  abrir(m);
  m.lua(`_G.ESPERAS = 0; local real = C_Timer; rawset(_G, "C_Timer", setmetatable({After = function(s, f) if s == 0.2 then _G.ESPERAS = _G.ESPERAS + 1 end; return real.After(s, f) end}, {__index = real}))`);
  const vistos = [];
  for (let i = 0; i < 60; i++) { m.avanzar(0.05); vistos.push(oroVisible(m)); } // 3 s (el banco avanza de 0,05 en 0,05 s)
  const desde = vistos.findIndex((v) => v !== '');
  assert.ok(desde >= 34 && desde <= 46, `sale hacia los 2 s (${((desde + 1) * 0.05).toFixed(2)} s)`);
  const tras = vistos.slice(desde);
  assert.ok(tras.every((v) => v === tras[0]), `una sola vez y quieto: ${[...new Set(tras.map(sinColores))]}`);
  assert.equal(sinColores(tras[0]), '9999g', 'la forma más corta');
  const pedidos = m.lua('_G.ESPERAS');
  assert.ok(pedidos <= 10, `reintentos acotados: ${pedidos}`);
  m.avanzar(5);
  assert.equal(m.lua('_G.ESPERAS'), pedidos, 'después ya no se reintenta solo');
  sinErrores(m);
});

test('ronda 4: con los bordes sin resolver al abrir (sitio sin medir), el oro no se ve hasta poder medir y sale una vez', () => {
  const m = maquinaReal({ dinero: ORO_REALISTA, ancho: 1200 });
  const entero = m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`);
  assert.equal(oroVisible(m), entero);
  cerrar(m);
  // La última pestaña aún sin bordes (GetRight da nil), como un marco que el cliente no ha colocado todavía.
  m.lua(`${M}.pestanas.misSubastas.GetRight = function() return nil end`);
  abrir(m);
  const vistos = [];
  for (let i = 0; i < 10; i++) { m.avanzar(0.05); vistos.push(oroVisible(m)); }
  assert.ok(vistos.every((v) => v === ''), `sin sitio, el oro no se ve: ${vistos.map(sinColores)}`);
  m.lua(`${M}.pestanas.misSubastas.GetRight = nil`); // ya colocada
  for (let i = 0; i < 20; i++) { m.avanzar(0.05); vistos.push(oroVisible(m)); }
  const tras = vistos.slice(vistos.findIndex((v) => v !== ''));
  assert.ok(tras.length > 0 && tras.every((v) => v === entero), `sale una vez, ya entero: ${tras.map(sinColores)}`);
  sinErrores(m);
});

test('ronda 4: si el botón «Vista de Blizzard» cambia de ancho, el oro se mide en el fotograma siguiente (una sola vez)', () => {
  const m = maquinaReal({ dinero: ORO_REALISTA, ancho: 1200 });
  const entero = m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`);
  assert.equal(oroVisible(m), entero);
  const antes = m.lua(`${SV}.medidasOro`);
  // El texto del botón crece (como si su letra cargara tarde): esa llamada no mide el oro, lo deja para el fotograma siguiente.
  m.lua(`${M}.verBlizzard.texto:SetText("Vista de Blizzard con un texto mucho más largo que antes")`);
  m.lua(`${SV}.pintarOro()`);
  assert.equal(m.lua(`${SV}.medidasOro`), antes, 'en la misma llamada no se mide');
  assert.equal(oroVisible(m), entero, 'y lo que se ve no cambia');
  m.avanzar(0.05);
  assert.equal(m.lua(`${SV}.medidasOro`), antes + 1, 'en el fotograma siguiente, una medida');
  const r = fila1(m);
  assert.ok(r.libre >= LIBRE_FILA_1 && r.oroDer <= r.vbIzq, `ya medido con el botón nuevo: ${JSON.stringify(r)}`);
  sinErrores(m);
});

// Ronda 3: tras un cambio de tamaño (asa, colocar, escala, pantalla) el cliente puede tener aún los bordes de antes: el oro
// se mide en el fotograma siguiente, una sola vez aunque lleguen varios cambios, y cambia de forma como mucho una vez.
test('ronda 3: tras cambiar el tamaño el oro se mide una sola vez en el fotograma siguiente y cambia como mucho una vez', () => {
  const m = maquinaReal({ dinero: ORO_REALISTA, advances: WIDE_FONT_ADVANCES });
  const entero = m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`);
  assert.equal(sinColores(fila1(m).oro), '9999g');
  m.lua(`_G.PINTAR = 0; local v = ${M}.oro.SetText; ${M}.oro.SetText = function(self, t) _G.PINTAR = _G.PINTAR + 1; return v(self, t) end`);
  const antes = m.lua(`${SV}.medidasOro`);
  // Varios cambios seguidos: un cambio de escala, colocar más grande dos veces y el aviso de tamaño de la cabecera.
  m.disparar('UI_SCALE_CHANGED');
  m.lua(`${SV}.colocar({x = 50, y = 50, ancho = 1100, alto = 500})`);
  m.lua(`${SV}.colocar({x = 50, y = 50, ancho = 1200, alto = 500})`);
  m.lua(`${M}.cabecera:GetScript("OnSizeChanged")(${M}.cabecera, 1200, 38)`);
  assert.equal(m.lua('_G.PINTAR'), 0, 'en el mismo fotograma no se mide (los bordes pueden ser los de antes)');
  assert.equal(sinColores(fila1(m).oro), '9999g', 'aún como estaba');
  m.avanzar(0.05); // el fotograma siguiente (el banco avanza de 0,05 en 0,05 s)
  assert.equal(m.lua(`${SV}.medidasOro`) - antes, 1, 'una sola medida para los cuatro cambios');
  const vistos = [fila1(m).oro];
  for (let i = 0; i < 5; i++) {
    m.avanzar(0.05);
    vistos.push(fila1(m).oro);
  }
  assert.ok(vistos.every((v) => v === entero), `ya en el fotograma siguiente, entero y quieto (un solo cambio): ${vistos.map(sinColores)}`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 5 (la última): al abrir, el oro no se mide en el mismo fotograma ni con una recolocación pendiente. Sale una sola
// vez, en el fotograma siguiente a la última, ya en su forma final.
// ---------------------------------------------------------------------------------------------------

// Lo que se ve del oro, fotograma a fotograma.
const seguirOro = (m, fotogramas, vistos = []) => {
  for (let i = 0; i < fotogramas; i++) { m.avanzar(0.05); vistos.push(oroVisible(m)); }
  return vistos;
};
// A wider font profile makes the same balance display in full at 1200 px and abbreviate at 830 px.
function maquinaPorAbrir({ ancho = 1200 } = {}) {
  const m = maquina();
  letraReal(m, WIDE_FONT_ADVANCES);
  m.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 50, y = 50, ancho = ${ancho}, alto = 500}`);
  m.jugador({ dinero: ORO_REALISTA });
  return m;
}

// Revisión B7, Importante 1 (regla de interfaz): con el asa cogida y el ratón parado justo en el ancho en que el
// oro pasa de una forma a otra, el temblor de la mano (1 px a cada lado en fotogramas seguidos) no le hace cambiar de forma
// en cada vaivén. Mientras se estira, el oro solo puede acortarse; la forma larga vuelve al soltar, una sola vez.
test('un ancho que va y viene 1 px sobre el límite de una forma del oro no la cambia en cada vaivén; al soltar, la que cabe', () => {
  const m = maquinaReal({ dinero: ORO_REALISTA, advances: WIDE_FONT_ADVANCES });
  m.lua('BANCO.tamanoPorAnclajes = true');
  m.avanzar(0.05);
  const corto = fila1(m).oro;
  assert.equal(sinColores(corto), '9999g', 'a 830, solo el oro');
  const alto = m.lua(`${V}:GetHeight()`);
  const forma = (w) => { m.lua(`${V}:SetSize(${w}, ${alto})`); m.avanzar(0.05); m.avanzar(0.05); return fila1(m).oro; };
  // El primer ancho en que ya no sale solo el oro (búsqueda binaria; el oro crece con el ancho).
  let bajo = 830, alto2 = 1400;
  assert.notEqual(forma(alto2), corto, 'a 1400 sale más largo');
  while (alto2 - bajo > 1) {
    const medio = Math.floor((bajo + alto2) / 2);
    if (forma(medio) === corto) bajo = medio; else alto2 = medio;
  }
  const limite = alto2;
  const largo = forma(limite);
  forma(limite - 1);
  assert.equal(fila1(m).oro, corto, 'con 1 px menos, solo el oro');
  // El jugador coge el asa y la mano tiembla 1 px sobre el límite, fotograma a fotograma.
  m.lua(`${M}.asa:GetScript("OnMouseDown")(${M}.asa, "LeftButton")`);
  const vistos = [];
  for (let i = 0; i < 10; i++) {
    m.lua(`${V}:SetSize(${limite}, ${alto})`);
    m.avanzar(0.05);
    vistos.push(oroVisible(m));
    m.lua(`${V}:SetSize(${limite - 1}, ${alto})`);
    m.avanzar(0.05);
    vistos.push(oroVisible(m));
  }
  let cambios = 0;
  for (let i = 1; i < vistos.length; i++) if (vistos[i] !== vistos[i - 1]) cambios++;
  assert.ok(cambios <= 1, `el oro cambia como mucho una vez en 20 vaivenes: ${vistos.map(sinColores).join(' / ')}`);
  // Suelta en el límite: la forma larga vuelve, una sola vez, en el fotograma siguiente.
  m.lua(`${V}:SetSize(${limite}, ${alto})`);
  m.avanzar(0.05);
  m.lua(`${M}.asa:GetScript("OnMouseUp")(${M}.asa, "LeftButton")`);
  const tras = seguirOro(m, 6);
  assert.equal(tras.at(-1), oroVisible(m));
  assert.equal(fila1(m).oro, largo, `al soltar, la forma que cabe (${sinColores(largo)})`);
  let cambiosTras = 0;
  for (let i = 1; i < tras.length; i++) if (tras[i] !== tras[i - 1]) cambiosTras++;
  assert.ok(cambiosTras <= 1, `tras soltar, quieto: ${tras.map(sinColores).join(' / ')}`);
  sinErrores(m);
});

// Revisión B7 (revisión del arreglo, menor 3): con el asa cogida el oro sí se acorta. Empieza entero, se encoge 1 px por
// debajo de donde cabe entero: se acorta una vez y, con el temblor, no vuelve a alargarse hasta soltar.
test('B7: con el asa cogida el oro se acorta una vez al encoger y no se alarga con el temblor hasta soltar', () => {
  const m = maquinaReal({ dinero: ORO_REALISTA, ancho: 1200, advances: WIDE_FONT_ADVANCES });
  m.lua('BANCO.tamanoPorAnclajes = true');
  m.avanzar(0.05);
  const entero = m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`);
  assert.equal(fila1(m).oro, entero, 'a 1200, entero');
  const alto = m.lua(`${V}:GetHeight()`);
  const forma = (w) => { m.lua(`${V}:SetSize(${w}, ${alto})`); m.avanzar(0.05); m.avanzar(0.05); return fila1(m).oro; };
  // El ancho más estrecho en que aún sale entero.
  let bajo = 830, alto2 = 1200;
  assert.notEqual(forma(bajo), entero);
  while (alto2 - bajo > 1) {
    const medio = Math.floor((bajo + alto2) / 2);
    if (forma(medio) === entero) alto2 = medio; else bajo = medio;
  }
  const limite = alto2;
  assert.equal(forma(limite), entero);
  m.avanzar(0.5);
  m.lua(`${M}.asa:GetScript("OnMouseDown")(${M}.asa, "LeftButton")`);
  const vistos = [oroVisible(m)];
  for (let i = 0; i < 10; i++) {
    m.lua(`${V}:SetSize(${limite - 1}, ${alto})`);
    m.avanzar(0.05);
    vistos.push(oroVisible(m));
    m.lua(`${V}:SetSize(${limite}, ${alto})`);
    m.avanzar(0.05);
    vistos.push(oroVisible(m));
  }
  let cambios = 0;
  for (let i = 1; i < vistos.length; i++) if (vistos[i] !== vistos[i - 1]) cambios++;
  assert.equal(cambios, 1, `se acorta una vez y no vuelve: ${vistos.map(sinColores).join(' / ')}`);
  assert.notEqual(vistos.at(-1), entero, 'sigue corto con el asa cogida');
  m.lua(`${M}.asa:GetScript("OnMouseUp")(${M}.asa, "LeftButton")`);
  const tras = seguirOro(m, 6);
  assert.deepEqual(tras, tras.map(() => entero), `al soltar en el límite, entero una vez: ${tras.map(sinColores).join(' / ')}`);
  sinErrores(m);
});

test('al abrir con una recolocación pendiente, el oro no sale hasta que acaba y luego no cambia', () => {
  // a) Otro addon recoloca la ventana a 830 en el fotograma siguiente al de abrir (un C_Timer suyo de 0 s).
  {
    const m = maquinaPorAbrir();
    m.disparar('AUCTION_HOUSE_SHOW');
    const vistos = [oroVisible(m)];
    m.lua(`C_Timer.After(0, function() ${SV}.colocar({x = 50, y = 50, ancho = 830, alto = 500}) end)`);
    seguirOro(m, 12, vistos);
    const formas = [...new Set(vistos.filter((v) => v !== '').map(sinColores))];
    assert.deepEqual(formas, ['9999g'], `a) una sola forma a la vista, la final: ${vistos.map(sinColores)}`);
    assert.equal(vistos[0], '', 'a) en el fotograma de abrir no se ve');
    assert.equal(Math.round(fila1(m).ancho), 830);
    assert.equal(m.lua(`${M}.oro:GetAlpha()`), 1);
    sinErrores(m);
  }
  // b) El caso real: la subasta de Blizzard se enseña (otros addons ponen sus pestañas), comercio.lua pide recolocar para el
  // fotograma siguiente y, al recolocar, la ventana cambia de ancho. La recolocación se pide después que la medida del oro:
  // el oro tiene que esperar a que no quede ninguna pendiente.
  {
    const m = maquinaPorAbrir();
    m.disparar('AUCTION_HOUSE_SHOW');
    const vistos = [oroVisible(m)];
    m.lua(`local p = ${V}.pestanaSnet; local v = p.ClearAllPoints
      p.ClearAllPoints = function(self) v(self); if rawget(_G, "RECOLOCA") then _G.RECOLOCA = nil; ${SV}.colocar({x = 50, y = 50, ancho = 830, alto = 500}) end end`);
    seguirOro(m, 1, vistos); // la subasta de Blizzard se esconde y la ventana va a su sitio
    m.lua(`_G.RECOLOCA = true; ${AH}:GetScript("OnShow")(${AH})`); // se pide recolocar para el fotograma siguiente
    assert.equal(m.lua('_G.RECOLOCA'), true, 'b) la recolocación queda pendiente');
    seguirOro(m, 12, vistos);
    assert.equal(m.lua('rawget(_G, "RECOLOCA")'), undefined, 'b) la recolocación se hizo');
    const formas = [...new Set(vistos.filter((v) => v !== '').map(sinColores))];
    assert.deepEqual(formas, ['9999g'], `b) una sola forma a la vista, la final: ${vistos.map(sinColores)}`);
    assert.equal(Math.round(fila1(m).ancho), 830);
    sinErrores(m);
  }
  // c) Sin nada raro, el oro sale uno o dos fotogramas después de abrir, entero, y ya no cambia.
  {
    const m = maquinaPorAbrir();
    m.disparar('AUCTION_HOUSE_SHOW');
    const vistos = seguirOro(m, 12, [oroVisible(m)]);
    const entero = m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`);
    assert.equal(vistos[0], '', 'c) en el fotograma de abrir no se ve');
    const desde = vistos.findIndex((v) => v !== '');
    assert.ok(desde >= 1 && desde <= 2, `c) sale uno o dos fotogramas después: ${desde}`);
    assert.ok(vistos.slice(desde).every((v) => v === entero), `c) entero y quieto: ${vistos.map(sinColores)}`);
    sinErrores(m);
  }
});

test('con la ventana escondida, pintarOro no marca el oro como visto ni gasta reintentos', () => {
  const m = maquinaPorAbrir();
  abrir(m);
  m.lua(`${SV}.ponerAvisos({"aviso"})`);
  assert.equal(m.lua(`${M}.oro:GetAlpha()`), 1);
  cerrar(m);
  assert.equal(m.lua(`${V}:IsShown()`), false);
  assert.equal(m.lua(`${M}.oro:GetAlpha()`), 0, 'al cerrar, el oro deja de estar a la vista');
  const medidas = m.lua(`${SV}.medidasOro`);
  // Escondida y con la letra cargada: ni se mide ni se marca como visto.
  m.lua(`${SV}.pintarOro(); ${SV}.ponerAvisos({"aviso"}); ${SV}.pedirOro()`);
  m.avanzar(0.1);
  assert.equal(m.lua(`${SV}.medidasOro`), medidas, 'escondida no se mide');
  assert.deepEqual(m.lua(`{${M}.oro:GetAlpha(), ${M}.punto:GetAlpha()}`), [0, 0], 'ni se enseña el oro ni el punto');
  // Escondida y con la letra sin cargar: no se gastan reintentos (ninguna espera de 0,2 s).
  m.lua(`_G.ESPERAS = 0; local real = C_Timer; rawset(_G, "C_Timer", setmetatable({After = function(s, f) if s == 0.2 then _G.ESPERAS = _G.ESPERAS + 1 end; return real.After(s, f) end}, {__index = real}))`);
  m.lua('BANCO.textoSinCargar = true');
  for (let i = 0; i < 12; i++) {
    m.lua(`${SV}.pintarOro(); ${SV}.ponerAvisos({"aviso"})`);
    m.avanzar(0.25);
  }
  assert.equal(m.lua('_G.ESPERAS'), 0, 'escondida no se reintenta');
  assert.equal(m.lua(`${SV}.medidasOro`), medidas);
  assert.deepEqual(m.lua(`{${M}.oro:GetAlpha(), ${M}.punto:GetAlpha()}`), [0, 0]);
  // Y al abrir de nuevo, aún sin letra, el oro espera (los reintentos no se gastaron con ella escondida).
  m.disparar('AUCTION_HOUSE_SHOW');
  const vistos = seguirOro(m, 20, [oroVisible(m)]); // 1 s sin letra
  assert.ok(vistos.every((v) => v === ''), `sin letra sigue sin verse: ${vistos.map(sinColores)}`);
  m.lua('BANCO.textoSinCargar = false');
  seguirOro(m, 10, vistos);
  const tras = vistos.filter((v) => v !== '');
  const entero = m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`);
  assert.ok(tras.length > 0 && tras.every((v) => v === entero), `sale una vez, medido y entero: ${vistos.map(sinColores)}`);
  sinErrores(m);
});

test('sin C_Timer el oro sale al momento', () => {
  // Sin C_Timer el comercio no abre la ventana él solo con la subasta: aquí se enseña a mano (la ventana ya creada).
  // Con la letra cargada: medido y entero en la misma llamada de abrir.
  {
    const m = maquinaPorAbrir();
    abrir(m); cerrar(m); // la ventana ya creada
    m.lua('rawset(_G, "C_Timer", nil)');
    m.lua(`${V}:Show()`);
    assert.equal(oroVisible(m), m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`), 'entero, al momento');
    sinErrores(m);
  }
  // Con la letra sin cargar no se puede reintentar: sale ya la forma más corta, y el tooltip funciona.
  {
    const m = maquinaPorAbrir();
    abrir(m); cerrar(m); // la ventana ya creada
    m.lua('rawset(_G, "C_Timer", nil)');
    m.lua('BANCO.textoSinCargar = true');
    m.lua(`${V}:Show()`);
    assert.equal(sinColores(oroVisible(m)), '9999g', 'la forma más corta, al momento');
    // La zona del tooltip, sin poder medir el texto, con un ancho razonable (medio tamaño de letra por letra) y sin pisar el botón.
    const z = `${M}.zonaOro`;
    const zona = m.lua(`{${z}:GetWidth(), ${z}:GetRight() <= ${M}.verBlizzard:GetLeft() + 0.01}`);
    assert.ok(zona[0] >= 20 && zona[0] <= 60, `zona del tooltip de ${zona[0]} px`);
    assert.equal(zona[1], true);
    m.lua(`${z}:GetScript("OnEnter")(${z})`);
    assert.ok(m.lua('BANCO.lineasTooltip()').includes(m.lua(`SnetForever.Tema.dinero(${ORO_REALISTA})`)), 'el tooltip da la cantidad entera');
    m.lua(`${z}:GetScript("OnLeave")(${z})`);
    sinErrores(m);
  }
});

test('el punto rojo sin enseñar no responde al ratón', () => {
  const m = maquinaPorAbrir();
  const p = `${M}.punto`;
  const tooltipPunto = () => {
    m.lua(`${p}:GetScript("OnEnter")(${p})`);
    const visto = m.lua('GameTooltip:IsShown()');
    m.lua(`${p}:GetScript("OnLeave")(${p})`);
    return visto;
  };
  m.lua('BANCO.textoSinCargar = true');
  m.disparar('AUCTION_HOUSE_SHOW');
  m.lua(`${SV}.ponerAvisos({"aviso"})`);
  for (let i = 0; i < 6; i++) {
    m.avanzar(0.05);
    assert.deepEqual(m.lua(`{${p}:IsShown(), ${p}:GetAlpha(), ${p}:IsMouseEnabled()}`), [true, 0, false], 'con aviso, pero sin enseñar: sin ratón');
    assert.equal(tooltipPunto(), false, 'ni tooltip');
  }
  m.lua('BANCO.textoSinCargar = false'); // la letra carga: salen el oro y el punto
  m.avanzar(0.5);
  assert.deepEqual(m.lua(`{${p}:IsShown(), ${p}:GetAlpha(), ${p}:IsMouseEnabled()}`), [true, 1, true], 'al salir, vuelve a coger el ratón');
  assert.equal(tooltipPunto(), true, 'y saca su tooltip');
  // Al cerrar deja de enseñarse y de coger el ratón; al abrir otra vez (con el velo de por medio), igual hasta que sale.
  cerrar(m);
  assert.deepEqual(m.lua(`{${p}:GetAlpha(), ${p}:IsMouseEnabled()}`), [0, false], 'cerrada: sin ratón');
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.deepEqual(m.lua(`{${p}:GetAlpha(), ${p}:IsMouseEnabled()}`), [0, false], 'recién abierta: sin ratón');
  m.avanzar(0.05); m.avanzar(0.05); m.avanzar(0.05);
  m.lua(`${SV}.ponerAvisos({"aviso"})`);
  assert.deepEqual(m.lua(`{${p}:IsShown(), ${p}:GetAlpha(), ${p}:IsMouseEnabled()}`), [true, 1, true], 'abierta y medida: con ratón');
  sinErrores(m);
});

test('auction tabs remember a two-axis drag and text follows window size', () => {
  const m = maquina();
  abrir(m);
  const inspect = (expr) => m.lua(expr);
  const grip = M + '.pestanas.navegar.resizeGrip';
  const label = M + '.pestanas.navegar.texto';
  const font = () => inspect('select(2, ' + label + ':GetFont())');
  const initial = font();
  const tab = M + '.pestanas.navegar';
  const width = inspect(tab + '.layoutWidth');
  const height = inspect(tab + '.layoutHeight');
  m.lua('BANCO.cursor = {x=400,y=500}');
  m.lua(grip + ':GetScript("OnMouseDown")(' + grip + ', "LeftButton")');
  m.lua('BANCO.cursor = {x=425,y=491}');
  m.lua(grip + ':GetScript("OnMouseUp")(' + grip + ', "LeftButton")');
  const saved = inspect('SnetForeverCuenta.comercio.auctionTabSizes.navegar');
  assert.ok(saved.width > width && saved.height > height);
  cerrar(m);
  abrir(m);
  assert.deepEqual(inspect('SnetForeverCuenta.comercio.auctionTabSizes.navegar'), saved);
  m.lua(SV + '.colocar({x=0,y=0,ancho=1550,alto=900},0)');
  assert.ok(font() > initial);
  const automatic = font();
  m.lua(V + '.ajustes.largeText:Click()');
  assert.equal(inspect('SnetForever.Ajustes.get("auction.largeText")'), true);
  assert.ok(font() > automatic);
  assert.ok(inspect(M + '.contenido:GetScale()') > 1);
  sinErrores(m);
});
