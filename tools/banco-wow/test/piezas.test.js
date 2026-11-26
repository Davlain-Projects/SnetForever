// Piezas de la ventana principal (ui/piezas/botones.lua, SnetForever.Piezas): botones, enlaces, casilla y radio.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// 0.7.0: todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo
// (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

// Forge control colors. The active check retains its semantic mark color.
const C = {
  boton: '473832', botonApagado: '2c2524', borde: '775744', texto: 'f5e8d4', apagado: 'a99b8e',
  enlace: 'd5a77d', enlaceApagado: '7a6353', marca: 'ffd839', hundido: '110e0f',
  radioVacio: '352d2a', bordeRadio: '84644f',
  tituloLista: '382e2a',
};
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

// Colores (y alfa) de las texturas visibles de un marco, como lista de «rrggbb».
const COLORES_DE = `local function coloresDe(f)
  local r = {}
  for _, t in ipairs({f:GetRegions()}) do
    if t:GetObjectType() == "Texture" and t:IsShown() then
      local a, b, c, d = t:GetVertexColor()
      r[#r + 1] = {a, b, c, d}
    end
  end
  return r
end`;

test('botón relleno, con borde y apagado tienen sus colores del inventario', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${COLORES_DE}
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    local lleno = P.boton(padre, "Comprar", function() end)
    local borde = P.boton(padre, "Cancelar", function() end, {borde = true, ancho = 90, alto = 30})
    local ap = P.boton(padre, "Comprar", function() end)
    ap:ponerApagado(true)
    local ancho, alto = borde:GetSize()
    local lAncho, lAlto = lleno:GetSize()
    return {
      lleno = coloresDe(lleno), llenoTexto = {lleno.texto:GetTextColor()}, llenoLabel = lleno.texto:GetText(),
      llenoAlto = lAlto, llenoAncho = lAncho,
      borde = coloresDe(borde), bordeTexto = {borde.texto:GetTextColor()}, bordeAncho = ancho, bordeAlto = alto,
      ap = coloresDe(ap), apTexto = {ap.texto:GetTextColor()},
    }
  end)()`);
  assert.ok(r.lleno.length > 0);
  for (const c of r.lleno) assert.equal(aHex(c), C.boton, 'relleno: color boton');
  assert.equal(aHex(r.llenoTexto), C.texto);
  assert.equal(r.llenoLabel, 'Comprar');
  assert.equal(r.llenoAlto, 22, 'alto por defecto 22');
  assert.ok(r.llenoAncho > 0);
  // Con borde: transparente (nada de relleno) y solo cuatro tiras de 1 px del color del borde.
  assert.equal(r.borde.length, 4);
  for (const c of r.borde) assert.equal(aHex(c), C.borde, 'borde');
  assert.equal(aHex(r.bordeTexto), C.texto);
  assert.deepEqual([r.bordeAncho, r.bordeAlto], [90, 30]);
  // Apagado: color botonApagado y texto apagado.
  assert.ok(r.ap.length > 0);
  for (const c of r.ap) assert.equal(aHex(c), C.botonApagado, 'apagado: color');
  assert.equal(aHex(r.apTexto), C.apagado);
  sinErrores(m);
});

test('un botón apagado no llama a alPulsar (y vuelve a llamar al encenderlo); ponerTexto y el doble clic', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local n = 0
    local b = P.boton(CreateFrame("Frame", nil, UIParent), "Ir", function() n = n + 1 end)
    b:Click()
    local tras1 = n
    b:ponerApagado(true)
    b:Click()
    local tras2 = n
    b:ponerApagado(false)
    b:Click()
    b:ponerTexto("Nuevo")
    local antes = n
    BANCO.dobleClic(b)
    return {tras1, tras2, n, b.texto:GetText(), type(b:GetScript("OnDoubleClick")), antes}
  end)()`);
  assert.deepEqual(r.slice(0, 3), [1, 1, 3]);
  assert.equal(r[5], 2, "el doble clic solo hace un clic de verdad: OnDoubleClick está vacío");
  assert.equal(r[3], 'Nuevo');
  assert.equal(r[4], 'function', 'OnDoubleClick existe (vacío)');
  sinErrores(m);
});

test('un fallo dentro de alPulsar va a geterrorhandler y no rompe a quien pulsa', () => {
  const m = nuevaMaquina();
  m.lua(`(function()
    local b = SnetForever.Piezas.boton(CreateFrame("Frame", nil, UIParent), "Rota", function() error("boom") end)
    b:Click()
  end)()`);
  const errores = m.errores();
  assert.equal(errores.length, 1);
  assert.match(String(errores[0]), /boom/);
});

test('casilla de 11 px con esquinas de 3 px: marcada es amarilla y sin tilde; pulsar llama a set', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${COLORES_DE}
    local P = SnetForever.Piezas
    local valor = false
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetSize(200, 50)
    padre:SetPoint("CENTER")
    local c = P.casilla(padre, "Recordar", function() return valor end,
      function(v) valor = v end)
    c:SetPoint("LEFT", padre, "LEFT", 0, 0)
    local ancho, alto = c.caja:GetSize()
    local function formas()
      local r = {}
      for _, t in ipairs({c.caja:GetRegions()}) do
        if t:IsShown() then r[#r + 1] = {t:GetTexture(), {t:GetVertexColor()}} end
      end
      return r
    end
    local antes = formas()
    c:Click()
    local tras = formas()
    local v1 = valor
    c:Click()
    local v2 = valor
    c:ponerApagado(true)
    c:Click()
    return {ancho, alto, antes, tras, v1, v2, valor, {c.texto:GetTextColor()}, c.texto:GetText(),
      c.texto:GetLeft() - c.caja:GetRight()}
  end)()`);
  const [ancho, alto, antes, tras, v1, v2, valor, textoApagado, etiqueta, hueco] = r;
  const ESQUINA = 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\esquina';
  assert.deepEqual([ancho, alto], [11, 11]);
  // Tema.panel con borde: 7 piezas del borde y 7 del fondo, con cuatro esquinas redondas cada una.
  for (const f of [antes, tras]) {
    assert.equal(f.length, 14);
    assert.equal(f.filter((t) => t[0] === ESQUINA).length, 8);
    assert.equal(f.filter((t) => aHex(t[1]) === C.borde).length, 7);
  }
  assert.equal(antes.filter((t) => aHex(t[1]) === C.hundido).length, 7, 'sin marcar: fondo hundido');
  assert.equal(tras.filter((t) => aHex(t[1]) === C.marca).length, 7, 'marcada: relleno amarillo');
  assert.equal(v1, true);
  assert.equal(v2, false);
  assert.equal(valor, false, 'apagada no cambia');
  assert.equal(aHex(textoApagado), C.apagado);
  assert.equal(etiqueta, 'Recordar');
  assert.equal(hueco, 8, 'el texto a 8 px de la caja');
  sinErrores(m);
});

test('casilla: sin tilde dibujada (la marcada no usa el atlas de iconos)', () => {
  const m = nuevaMaquina();
  const usaAtlas = m.lua(`(function()
    local c = SnetForever.Piezas.casilla(CreateFrame("Frame", nil, UIParent), "x", function() return true end, function() end)
    for _, marco in ipairs({c, c.caja}) do
      for _, t in ipairs({marco:GetRegions()}) do
        if t:GetObjectType() == "Texture" and t:GetTexture() == SnetForever.Tema.ATLAS then return true end
      end
    end
    return false
  end)()`);
  assert.equal(usaAtlas, false);
  sinErrores(m);
});

// Task 31 (op-03, fila y = 272): el círculo de TSM mide 12 px; el vacío va relleno de #352d2a, más claro que el fondo, con
// un aro de #84644f. Antes el vacío era «hundido» (#110e0f, más oscuro que el fondo) con aro «borde» y el «No» casi no se veía.
test('radio Sí/No: círculos de 15 px; el vacío relleno de radioVacio con aro bordeRadio, el elegido amarillo con aro bordeRadio; apagado no cambia', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P, Tema = SnetForever.Piezas, SnetForever.Tema
    local function coords(nombre)
      local t = CreateFrame("Frame", nil, UIParent):CreateTexture()
      Tema.icono(t, nombre)
      return {t:GetTexCoord()}
    end
    local valor = true
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetPoint("CENTER")
    local rd = P.radio(padre, function() return valor end, function(v) valor = v end)
    rd:SetPoint("LEFT", padre, "LEFT", 0, 0)
    local function foto(b)
      return {b.disco:GetTexture(), {b.disco:GetTexCoord()}, {b.disco:GetVertexColor()},
        b.contorno:GetTexture(), {b.contorno:GetTexCoord()}, {b.contorno:GetVertexColor()},
        {b.disco:GetSize()}, {b.contorno:GetSize()}}
    end
    local inicio = {foto(rd.si), foto(rd.no)}
    rd.no:Click()
    local trasNo = {foto(rd.si), foto(rd.no)}
    local v1 = valor
    rd.si:Click()
    local v2 = valor
    rd:ponerApagado(true)
    local ap = {foto(rd.si), foto(rd.no)}
    rd.no:Click()
    local v3 = valor
    local textos = {rd.si.texto:GetText(), rd.no.texto:GetText(), {rd.si.texto:GetTextColor()}}
    local alineados = rd.si:GetTop() ~= nil and rd.si:GetTop() == rd.no:GetTop() and rd.no:GetLeft() > rd.si:GetRight()
    rd:ponerApagado(false)
    rd.no:Click()
    return {inicio, trasNo, v1, v2, v3, textos, valor, coords("circulo"), coords("aro"), ap, alineados,
      Tema.color("radioVacio"), Tema.color("fondo"), {rd:GetHeight(), rd.si:GetHeight()}}
  end)()`);
  const [inicio, trasNo, v1, v2, v3, textos, final, cCirculo, cAro, ap, alineados, vacio, fondo, altos] = r;
  const ATLAS = 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\iconos';
  const fotos = [...inicio, ...trasNo, ...ap];
  for (const f of fotos) {
    assert.equal(f[0], ATLAS);
    assert.deepEqual(f[1], cCirculo, 'el disco usa las coordenadas de circulo');
    assert.equal(f[3], ATLAS);
    assert.deepEqual(f[4], cAro, 'el contorno usa las coordenadas de aro');
    assert.deepEqual(f[6], [15, 15], 'el disco mide 15 px');
    assert.deepEqual(f[7], [15, 15], 'el aro mide 15 px');
  }
  assert.deepEqual(altos, [15, 15], 'el radio y cada opción miden 15 de alto');
  assert.notDeepEqual(cCirculo, cAro);
  // Sí elegido: disco amarillo; No sin elegir: disco radioVacio. El aro siempre bordeRadio.
  assert.equal(aHex(inicio[0][2]), C.marca);
  assert.equal(aHex(inicio[1][2]), C.radioVacio);
  assert.equal(aHex(inicio[0][5]), C.bordeRadio);
  assert.equal(aHex(inicio[1][5]), C.bordeRadio);
  assert.equal(aHex(trasNo[0][2]), C.radioVacio, 'tras elegir No, Sí vuelve a vacío');
  assert.equal(aHex(trasNo[1][2]), C.marca);
  assert.equal(aHex(trasNo[0][5]), C.bordeRadio);
  assert.equal(aHex(trasNo[1][5]), C.bordeRadio);
  assert.equal(v1, false);
  assert.equal(v2, true);
  assert.equal(v3, true, 'apagado no cambia');
  // Apagado: el elegido en el color apagado, el otro sigue radioVacio; el aro de los dos en botonApagado.
  assert.equal(aHex(ap[0][2]), C.apagado);
  assert.equal(aHex(ap[1][2]), C.radioVacio);
  assert.equal(aHex(ap[0][5]), C.botonApagado);
  assert.equal(aHex(ap[1][5]), C.botonApagado);
  assert.deepEqual([textos[0], textos[1]], ['Sí', 'No']);
  assert.equal(aHex(textos[2]), C.apagado);
  assert.equal(alineados, true, 'Sí y No en línea');
  assert.equal(final, false, 'al encender vuelve a responder');
  // El vacío se distingue del fondo de la ventana (donde va el editor de operaciones): es más claro y la media de sus
  // canales se separa al menos 0,0795 de la del fondo.
  const media = (c) => (c[0] + c[1] + c[2]) / 3;
  assert.ok(media(vacio) - media(fondo) >= 0.0795, `el vacío se separa del fondo (${(media(vacio) - media(fondo)).toFixed(4)})`);
  sinErrores(m);
});

test('enlace en cobre; apagado en su color apagado y sin clic', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${COLORES_DE}
    local P = SnetForever.Piezas
    local n = 0
    local e = P.enlace(CreateFrame("Frame", nil, UIParent), "Ver más", function() n = n + 1 end)
    local color = {e.texto:GetTextColor()}
    local fondos = #coloresDe(e)
    e:Click()
    e:ponerApagado(true)
    local apagado = {e.texto:GetTextColor()}
    e:Click()
    e:ponerApagado(false)
    e:ponerTexto("Otro")
    e:Click()
    return {color, fondos, n, apagado, e.texto:GetText()}
  end)()`);
  assert.equal(aHex(r[0]), C.enlace);
  assert.equal(r[1], 0, 'sin fondo');
  assert.equal(r[2], 2, 'el clic del apagado no cuenta');
  assert.equal(aHex(r[3]), C.enlaceApagado);
  assert.equal(r[4], 'Otro');
  sinErrores(m);
});

test('SnetForever.Piezas es una tabla compartida: no se pisa si ya existía', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('type(SnetForever.Piezas.boton) == "function" and type(SnetForever.Piezas.proteger) == "function"'), true);
  sinErrores(m);
});

test('botón con borde apagado: las tiras del borde pasan a botonApagado y vuelven al encenderlo', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${COLORES_DE}
    local b = SnetForever.Piezas.boton(CreateFrame("Frame", nil, UIParent), "Ver", function() end, {borde = true})
    local normal = coloresDe(b)
    b:ponerApagado(true)
    local apagado = coloresDe(b)
    b:ponerApagado(false)
    return {normal, apagado, coloresDe(b)}
  end)()`);
  for (const c of r[0]) assert.equal(aHex(c), C.borde);
  assert.equal(r[1].length, 4);
  for (const c of r[1]) assert.equal(aHex(c), C.botonApagado, 'borde apagado');
  for (const c of r[2]) assert.equal(aHex(c), C.borde, 'al encender vuelve el borde');
  sinErrores(m);
});

test('ponerTexto mide otra vez el ancho si el botón se creó sin ancho; con ancho fijo lo respeta', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    local libre = P.boton(padre, "Ir", function() end)
    local fijo = P.boton(padre, "Ir", function() end, {ancho = 70})
    local a1, f1 = libre:GetWidth(), fijo:GetWidth()
    libre:ponerTexto("Un texto bastante más largo")
    fijo:ponerTexto("Un texto bastante más largo")
    local corto = P.boton(padre, "Un texto bastante más largo", function() end)
    return {a1, libre:GetWidth(), corto:GetWidth(), f1, fijo:GetWidth()}
  end)()`);
  assert.ok(r[1] > r[0], 'el botón libre crece con el texto');
  assert.equal(r[1], r[2], 'igual que uno creado con ese texto');
  assert.equal(r[3], 70);
  assert.equal(r[4], 70, 'con ancho fijo no cambia');
  sinErrores(m);
});

// Task 31: «Mover 0 objetos» (SemiBold 12, unos 108 px) no cabía en el botón fijo de 114 (98 libres) y se partía en dos
// líneas. Ahora el texto de un botón nunca se parte: si no cabe se corta, y quien da un ancho fijo tiene que darlo suficiente.
test('el texto de un botón nunca se parte en dos líneas (GetWordWrap falso), con ancho fijo o sin él', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    local libre = P.boton(padre, "Mover 0 objetos", function() end)
    local fijo = P.boton(padre, "Mover 0 objetos", function() end, {ancho = 70})
    local borde = P.boton(padre, "Cancelar", function() end, {borde = true, ancho = 96})
    local icono = P.boton(padre, "Importar", function() end, {icono = "importar"})
    local out = {}
    for _, b in ipairs({libre, fijo, borde, icono}) do out[#out + 1] = b.texto:GetWordWrap() end
    fijo:ponerTexto("Un texto bastante más largo que el botón")
    out[#out + 1] = fijo.texto:GetWordWrap()
    out[#out + 1] = fijo:GetWidth()
    return out
  end)()`);
  assert.deepEqual(r.slice(0, 5), [false, false, false, false, false], 'ninguno parte el texto');
  assert.equal(r[5], 70, 'con ancho fijo el ancho se respeta');
  sinErrores(m);
});

// Task 31 (aj-08): la barra «Agregar una fuente propia» de TSM lleva la letra más grande que la tabla; Piezas.boton acepta
// el tamaño de la letra (opción letra; por defecto el del tipo «boton»).
test('botón con letra: el texto sale con ese tamaño y el alto que se pida', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P, Tema = SnetForever.Piezas, SnetForever.Tema
    local padre = CreateFrame("Frame", nil, UIParent)
    local normal = P.boton(padre, "Agregar una fuente propia", function() end)
    local grande = P.boton(padre, "Agregar una fuente propia", function() end, {letra = 14, alto = 24})
    local rutaN, tamN = normal.texto:GetFont()
    local rutaG, tamG = grande.texto:GetFont()
    local anchoAntes = grande:GetWidth()
    grande:ponerTexto("Agregar una fuente propia")
    return {tamN, tamG, rutaN == rutaG, grande:GetHeight(), normal:GetHeight(), normal:GetWidth(), grande:GetWidth(),
      anchoAntes, Tema.TAMANOS.boton, math.ceil(Tema.anchoTexto(grande.texto)) + 16, grande.texto:GetWordWrap()}
  end)()`);
  const [tamN, tamG, mismaLetra, altoG, altoN, anchoN, anchoG, anchoAntes, tamBoton, medido, ajuste] = r;
  assert.equal(tamN, tamBoton, 'sin la opción, el tamaño del tipo «boton»');
  assert.equal(tamG, 14, 'con letra = 14, de 14');
  assert.equal(mismaLetra, true, 'la misma letra (SemiBold), solo cambia el tamaño');
  assert.equal(altoG, 24);
  assert.equal(altoN, 22);
  assert.ok(anchoG > anchoN, 'sin ancho fijo, el botón mide su texto con la letra grande');
  assert.equal(anchoG, medido, 'el ancho es el del texto más los márgenes');
  assert.equal(anchoG, anchoAntes, 'ponerTexto mide con la misma letra');
  assert.equal(ajuste, false);
  sinErrores(m);
});

test('Piezas.proteger: el error sale por geterrorhandler con su traceback y se pasan los argumentos', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local visto
    P.proteger(function(...) visto = select("#", ...) .. ":" .. tostring((select(1, ...))) .. tostring((select(2, ...))) .. tostring((select(3, ...))) end)(1, nil, 3)
    local bien = visto
    P.proteger(function() error("boom-traza") end)()
    return {bien, BANCO.trazas[#BANCO.trazas]}
  end)()`);
  assert.equal(r[0], "3:1nil3");
  assert.match(r[1], /boom-traza/);
  assert.match(r[1], /function 'error'/, 'la traza llega hasta el error, no solo hasta el pcall');
  assert.equal(m.errores().length, 1);
});

// ---------------------------------------------------------------------------------------------------
// Campo, desplegable y etiqueta (ui/piezas/campos.lua)
// ---------------------------------------------------------------------------------------------------

const ATLAS = 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\iconos';
const PLANO = 'Interface\\Buttons\\WHITE8X8';
// Las texturas visibles de un marco que no son del atlas de iconos: {color, ancho, alto, textura}.
const PLANAS_DE = `local function planasDe(f)
  local r = {}
  for _, t in ipairs({f:GetRegions()}) do
    if t:GetObjectType() == "Texture" and t:IsShown() and not string.find(t:GetTexture() or "", "iconos", 1, true) then
      local a, b, c, d = t:GetVertexColor()
      r[#r + 1] = {{a, b, c, d}, t:GetWidth(), t:GetHeight(), t:GetTexture()}
    end
  end
  return r
end`;

test('campo de 22 px, hundido, con borde; Intro aplica, Escape deshace', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${PLANAS_DE}
    local P = SnetForever.Piezas
    local valor, sets = "inicial", {}
    local padre = CreateFrame("Frame", nil, UIParent)
    local c = P.campo(padre, {ancho = 180, get = function() return valor end,
      set = function(v) valor = v; sets[#sets + 1] = v end})
    c:SetPoint("CENTER")
    local w, h = c:GetSize()
    local izq, der = c:GetTextInsets()
    local inicio = c:GetText()
    -- Intro aplica
    c:SetFocus()
    c:SetText("nuevo")
    c:GetScript("OnEnterPressed")(c)
    local trasIntro = {valor, #sets, c:HasFocus()}
    -- Escape deshace: vuelve al valor guardado y no llama a set
    c:SetFocus()
    c:SetText("descartado")
    c:GetScript("OnEscapePressed")(c)
    local trasEscape = {c:GetText(), valor, #sets, c:HasFocus()}
    -- Perder el foco aplica
    c:SetFocus()
    c:SetText("por foco")
    c:ClearFocus()
    local trasFoco = {valor, #sets}
    return {w, h, izq, der, inicio, trasIntro, trasEscape, trasFoco, planasDe(c), c:GetObjectType(), {c:GetTextColor()}}
  end)()`);
  const [w, h, izq, der, inicio, trasIntro, trasEscape, trasFoco, planas, tipo, colorTexto] = r;
  assert.deepEqual([w, h], [180, 22]);
  assert.equal(tipo, 'EditBox');
  assert.deepEqual([izq, der], [8, 8], 'texto a 8 px del borde');
  assert.equal(inicio, 'inicial', 'enseña get()');
  // Tema.panel con borde: 7 piezas de borde y 7 de fondo hundido, con cuatro esquinas redondas de 3 px cada una.
  const ESQUINA = 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\esquina';
  assert.equal(planas.length, 14);
  assert.equal(planas.filter((p) => p[3] === ESQUINA).length, 8, 'esquinas del atlas esquina');
  assert.equal(planas.filter((p) => p[3] === ESQUINA && p[1] === 3 && p[2] === 3).length, 4, 'esquinas de borde de 3 px');
  assert.equal(planas.filter((p) => aHex(p[0]) === C.hundido).length, 7, 'fondo hundido');
  assert.equal(planas.filter((p) => aHex(p[0]) === C.borde).length, 7, 'borde');
  assert.equal(aHex(colorTexto), C.texto);
  assert.deepEqual(trasIntro, ['nuevo', 1, false], 'Intro aplica una vez y suelta el foco');
  assert.deepEqual(trasEscape, ['nuevo', 'nuevo', 1, false], 'Escape deshace sin llamar a set');
  assert.deepEqual(trasFoco, ['por foco', 2], 'perder el foco aplica');
  sinErrores(m);
});

test('campo con ⧉ llama a copiar; con lupa deja sitio a la izquierda', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P, Tema = SnetForever.Piezas, SnetForever.Tema
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetSize(400, 100)
    padre:SetPoint("CENTER")
    local function coords(nombre)
      local t = CreateFrame("Frame", nil, UIParent):CreateTexture()
      Tema.icono(t, nombre)
      return {t:GetTexCoord()}
    end
    local get = function() return "" end
    local n = 0
    local liso = P.campo(padre, {ancho = 160, get = get, set = function() end})
    local conLupa = P.campo(padre, {ancho = 160, lupa = true, get = get, set = function() end})
    local conCopiar = P.campo(padre, {ancho = 160, copiar = function() n = n + 1 end, get = get, set = function() end})
    conCopiar:SetPoint("CENTER")
    local lizq, lder = liso:GetTextInsets()
    local pizq, pder = conLupa:GetTextInsets()
    local cizq, cder = conCopiar:GetTextInsets()
    conCopiar.botonCopiar:Click()
    local tras1 = n
    local tex = conCopiar.iconoCopiar
    local lupa = conLupa.iconoLupa
    return {lizq, lder, pizq, pder, cizq, cder, tras1, liso.botonCopiar == nil, liso.iconoLupa == nil,
      {tex:GetTexture(), {tex:GetTexCoord()}, {tex:GetSize()}}, coords("copiar"),
      {lupa:GetTexture(), {lupa:GetTexCoord()}, {lupa:GetSize()}}, coords("lupa"),
      conCopiar.botonCopiar:GetRight() <= conCopiar:GetRight()}
  end)()`);
  const [lizq, lder, pizq, pder, cizq, cder, tras1, sinCopiar, sinLupa, texCopiar, coordsCopiar, texLupa, coordsLupa, dentro] = r;
  assert.deepEqual([lizq, lder], [8, 8]);
  assert.ok(pizq > 8 && pder === 8, 'la lupa deja sitio a la izquierda');
  assert.ok(cizq === 8 && cder > 8, 'el ⧉ deja sitio a la derecha');
  assert.equal(tras1, 1, 'pulsar ⧉ llama a copiar');
  assert.equal(sinCopiar, true);
  assert.equal(sinLupa, true);
  assert.equal(texCopiar[0], ATLAS);
  assert.deepEqual(texCopiar[1], coordsCopiar, 'el icono ⧉ es el del atlas');
  assert.deepEqual(texCopiar[2], [12, 12]);
  assert.deepEqual(texLupa[1], coordsLupa, 'el icono de la lupa es el del atlas');
  assert.equal(dentro, true);
  sinErrores(m);
});

test('validar falso pone el borde rojo y el mensaje', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${PLANAS_DE}
    local P = SnetForever.Piezas
    local valor, sets = "ok", 0
    local c = P.campo(CreateFrame("Frame", nil, UIParent), {ancho = 160, get = function() return valor end,
      set = function(v) valor = v; sets = sets + 1 end,
      validar = function(t) if t == "mal" then return false, "No vale así" end return true end})
    c:SetPoint("CENTER")
    local function bordes()
      local r = {}
      for _, p in ipairs(planasDe(c)) do r[#r + 1] = p[1] end
      return r
    end
    local antes = bordes()
    c:SetFocus()
    c:SetText("mal")
    local rojo = bordes()
    local tooltip = {BANCO.lineasTooltip(), GameTooltip:GetOwner() == c, GameTooltip:IsShown()}
    c:GetScript("OnEnterPressed")(c)
    local trasIntroMala = {valor, sets}
    c:SetText("bien")
    local limpio = bordes()
    local tooltipFuera = GameTooltip:IsShown()
    c:ponerError("Error de fuera")
    local manual = {bordes(), BANCO.lineasTooltip()}
    c:ponerError(nil)
    local sinError = bordes()
    GameTooltip = nil
    c:SetText("mal")
    return {antes, rojo, tooltip, trasIntroMala, limpio, tooltipFuera, manual, sinError, SnetForever.Tema.hex("error")}
  end)()`);
  const [antes, rojo, tooltip, trasIntro, limpio, tooltipFuera, manual, sinError, hexError] = r;
  const borde = (lista) => lista.filter((c) => aHex(c) === C.borde).length;
  const conError = (lista) => lista.filter((c) => aHex(c) === hexError).length;
  assert.match(hexError, /^[0-9a-f]{6}$/);
  assert.notEqual(hexError, C.borde);
  assert.equal(borde(antes), 7);
  assert.equal(conError(rojo), 7, 'borde rojo');
  assert.equal(borde(rojo), 0);
  assert.deepEqual(tooltip[0], ['No vale así']);
  assert.equal(tooltip[1], true, 'el GameTooltip cuelga del campo');
  assert.equal(tooltip[2], true);
  assert.deepEqual(trasIntro, ['ok', 0], 'un texto que no vale no se aplica');
  assert.equal(borde(limpio), 7, 'texto bueno: vuelve el borde');
  assert.equal(tooltipFuera, false, 'texto bueno: se va el mensaje');
  assert.equal(conError(manual[0]), 7);
  assert.deepEqual(manual[1], ['Error de fuera']);
  assert.equal(borde(sinError), 7);
  sinErrores(m); // y sin GameTooltip (la última línea de Lua) tampoco falla
});

// Las opciones de los desplegables de prueba.
const OPCIONES = '{{"a", "Alfa"}, {"b", "Beta"}, {"c", "Gamma"}}';

test('desplegable simple: abrir enseña la lista y oscurece; elegir llama a set y cierra', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local valor, llamadas = "b", {}
    local padre = CreateFrame("Frame", nil, UIParent)
    local d = P.desplegable(padre, {ancho = 150, opciones = ${OPCIONES}, get = function() return valor end,
      set = function(v) valor = v; llamadas[#llamadas + 1] = v end})
    d:SetPoint("CENTER")
    local w, h = d:GetSize()
    local texto0 = d.texto:GetText()
    local flecha = {d.flecha:GetTexture(), {d.flecha:GetTexCoord()}}
    local ct = CreateFrame("Frame", nil, UIParent):CreateTexture()
    SnetForever.Tema.icono(ct, "desplegar")
    local coordsFlecha = {ct:GetTexCoord()}
    local antes = rawget(_G, "SnetForeverDesplegableLista") == nil
    d:Click()
    local lista, telon = _G.SnetForeverDesplegableLista, _G.SnetForeverDesplegableTelon
    local abierta = {lista:IsShown(), telon:IsShown(), lista:GetFrameStrata(), telon:GetFrameStrata(),
      lista:GetFrameLevel() > telon:GetFrameLevel(), telon:GetRight() - telon:GetLeft(), telon:GetTop() - telon:GetBottom(),
      telon:IsMouseEnabled(), telon:GetParent() == UIParent, UIParent:GetRight() - UIParent:GetLeft(), UIParent:GetTop() - UIParent:GetBottom()}
    -- Task 33: el telón ya no pinta nada suyo; lo único que se ve en él es el oscurecido (SnetForeverDesplegableSombra).
    local sombra = _G.SnetForeverDesplegableSombra
    local pintadas = {}
    for _, t in ipairs({telon:GetRegions()}) do
      if t:IsShown() then pintadas[#pintadas + 1] = t == sombra end
    end
    abierta[12] = {sombra ~= nil and sombra:IsVisible(), pintadas, sombra and {sombra:GetVertexColor()}}
    local textos, tildes = {}, {}
    for i = 1, 3 do
      textos[i] = lista.filas[i].texto:GetText()
      tildes[i] = lista.filas[i].tilde:IsShown()
    end
    local escape = {lista:IsKeyboardEnabled(), lista:GetScript("OnKeyDown") ~= nil}
    for _, nombre in ipairs(UISpecialFrames) do
      if nombre == "SnetForeverDesplegableLista" then escape[3] = true end
    end
    lista.filas[3]:Click()
    local trasElegir = {valor, #llamadas, lista:IsShown(), telon:IsShown(), d.texto:GetText()}
    -- El telón cierra la lista al pulsarlo
    d:Click()
    local abiertaOtraVez = lista:IsShown()
    telon:GetScript("OnMouseDown")(telon)
    local trasTelon = {lista:IsShown(), telon:IsShown(), #llamadas}
    -- Escape: la lista se queda con la tecla y se cierra
    d:Click()
    BANCO.pulsarTecla("ESCAPE")
    local trasEscape = {lista:IsShown(), telon:IsShown()}
    -- Pulsar la caja con la lista abierta la cierra
    d:Click()
    d:Click()
    local trasAlternar = lista:IsShown()
    return {w, h, texto0, flecha, coordsFlecha, antes, abierta, textos, tildes, escape, trasElegir, abiertaOtraVez,
      trasTelon, trasEscape, trasAlternar}
  end)()`);
  const [w, h, texto0, flecha, coordsFlecha, antes, abierta, textos, tildes, escape, trasElegir, otraVez, trasTelon, trasEscape, trasAlternar] = r;
  assert.deepEqual([w, h], [150, 22]);
  assert.equal(texto0, 'Beta', 'la caja enseña la opción elegida');
  assert.equal(flecha[0], ATLAS);
  assert.deepEqual(flecha[1], coordsFlecha, '«⌄» del atlas');
  assert.equal(antes, true);
  assert.equal(abierta[0], true, 'la lista se enseña');
  assert.equal(abierta[1], true, 'el resto se oscurece');
  assert.equal(abierta[2], 'TOOLTIP', 'estrato alto');
  assert.equal(abierta[3], 'TOOLTIP');
  assert.equal(abierta[4], true, 'la lista por encima del telón');
  assert.deepEqual([abierta[5], abierta[6]], [abierta[9], abierta[10]], 'el telón cubre la pantalla');
  assert.ok(abierta[5] > 0 && abierta[6] > 0);
  assert.equal(abierta[7], true, 'el telón recibe el ratón');
  assert.equal(abierta[8], true);
  assert.equal(abierta[11][0], true, 'el oscurecido se ve');
  assert.deepEqual(abierta[11][1], [true], 'el telón solo lleva el oscurecido: no pinta nada más');
  assert.deepEqual(abierta[11][2], [0, 0, 0, 0.8], 'negro al 80 %');
  assert.deepEqual(textos, ['Alfa', 'Beta', 'Gamma']);
  assert.deepEqual(tildes, [false, false, false], 'en el simple no hay ✓');
  assert.deepEqual(escape, [true, true], 'Escape lo recibe la propia lista (sin UISpecialFrames)');
  assert.deepEqual(trasElegir, ['c', 1, false, false, 'Gamma'], 'elegir llama a set, cierra y actualiza la caja');
  assert.equal(otraVez, true);
  assert.deepEqual(trasTelon, [false, false, 1], 'el telón cierra sin llamar a set');
  assert.deepEqual(trasEscape, [false, false]);
  assert.equal(trasAlternar, false, 'pulsar la caja con la lista abierta la cierra');
  sinErrores(m);
});

// Task 33: el oscurecido de TSM (una capa negra al 80 % solo sobre su ventana, que entra y sale de una vez).
// rect(r) da {izquierda, abajo, derecha, arriba} de una región en unidades de UIParent.
const RECT = `local function rect(r)
    local s = r:GetEffectiveScale() / UIParent:GetEffectiveScale()
    local l, b, d, a = r:GetLeft(), r:GetBottom(), r:GetRight(), r:GetTop()
    if not l then return false end
    return {l * s, b * s, d * s, a * s}
  end`;

test('el oscurecido es negro al 80 %, cubre solo la ventana del desplegable y no la pantalla; la lista va por encima', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${RECT}
    local P = SnetForever.Piezas
    -- La ventana: un marco hijo de UIParent; dentro, un hijo que lleva el desplegable.
    local ventana = CreateFrame("Frame", nil, UIParent)
    ventana:SetSize(600, 400)
    ventana:SetPoint("CENTER", UIParent, "CENTER", 100, 50)
    local hijo = CreateFrame("Frame", nil, ventana)
    hijo:SetAllPoints(ventana)
    local d = P.desplegable(hijo, {ancho = 150, opciones = ${OPCIONES}, get = function() return "a" end, set = function() end})
    d:SetPoint("TOPLEFT", hijo, "TOPLEFT", 20, -20)
    d:Click()
    local lista, telon, sombra = _G.SnetForeverDesplegableLista, _G.SnetForeverDesplegableTelon, _G.SnetForeverDesplegableSombra
    local out = {sombra = rect(sombra), ventana = rect(ventana), pantalla = rect(UIParent), telon = rect(telon),
      color = {sombra:GetVertexColor()}, alfa = sombra:GetAlpha(), visible = sombra:IsVisible(),
      encima = lista:GetFrameStrata() == telon:GetFrameStrata() and lista:GetFrameLevel() > telon:GetFrameLevel(),
      padre = sombra:GetParent() == telon}
    -- Se coloca en cada apertura: si la ventana se mueve y se estira, al abrir otra vez la sigue.
    lista:Hide()
    ventana:ClearAllPoints()
    ventana:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -10)
    ventana:SetSize(800, 500)
    d:Click()
    out.movida = {rect(sombra), rect(ventana)}
    return out
  end)()`);
  assert.equal(r.visible, true);
  assert.equal(r.padre, true, 'la sombra es una textura del telón');
  assert.deepEqual(r.color, [0, 0, 0, 0.8], 'negro al 80 %');
  assert.equal(r.alfa, 1);
  assert.deepEqual(r.sombra, r.ventana, 'cubre justo la ventana');
  assert.notDeepEqual(r.sombra, r.pantalla, 'no la pantalla');
  assert.deepEqual(r.telon, r.pantalla, 'el telón sigue a pantalla completa para recoger el clic');
  assert.equal(r.encima, true, 'la lista va por encima del oscurecido');
  assert.deepEqual(r.movida[0], r.movida[1], 'sigue a la ventana movida y estirada');
  sinErrores(m);
});

test('el oscurecido entra y sale de una vez: ni OnUpdate ni AnimationGroup en el telón, la sombra ni la lista, y su alfa no cambia mientras está abierta', () => {
  const m = nuevaMaquina();
  const a = m.lua(`(function()
    -- Si algo crease un AnimationGroup, se cuenta (el banco no lo imita: sin el espía daría error).
    _G.ANIMACIONES = 0
    BANCO.clases.Region.metodos.CreateAnimationGroup = function()
      _G.ANIMACIONES = _G.ANIMACIONES + 1
      return {Play = function() end, Stop = function() end}
    end
    local P = SnetForever.Piezas
    local ventana = CreateFrame("Frame", nil, UIParent)
    ventana:SetSize(400, 300)
    ventana:SetPoint("CENTER")
    local d = P.desplegable(ventana, {ancho = 150, opciones = ${OPCIONES}, get = function() return "a" end, set = function() end})
    d:SetPoint("CENTER")
    d:Click()
    _G.D_PRUEBA = d
    local lista, telon, sombra = _G.SnetForeverDesplegableLista, _G.SnetForeverDesplegableTelon, _G.SnetForeverDesplegableSombra
    local c = {sombra:GetVertexColor()}
    return {sombra:IsVisible(), c[4], sombra:GetAlpha(), telon:GetAlpha(), lista:GetScript("OnUpdate") == nil,
      telon:GetScript("OnUpdate") == nil}
  end)()`);
  m.avanzar(0.05);
  m.avanzar(0.5);
  m.avanzar(2);
  const b = m.lua(`(function()
    local lista, telon, sombra = _G.SnetForeverDesplegableLista, _G.SnetForeverDesplegableTelon, _G.SnetForeverDesplegableSombra
    local c = {sombra:GetVertexColor()}
    local abierta = {sombra:IsVisible(), c[4], sombra:GetAlpha(), telon:GetAlpha()}
    -- Cerrar: en ese mismo instante ya no se ve (sin fundido); abrir: en ese instante ya está entera.
    lista:Hide()
    local cerrada = sombra:IsVisible()
    _G.D_PRUEBA:Click()
    local c2 = {sombra:GetVertexColor()}
    return {abierta, cerrada, {sombra:IsVisible(), c2[4], sombra:GetAlpha()}, _G.ANIMACIONES,
      lista:GetScript("OnUpdate") == nil, telon:GetScript("OnUpdate") == nil}
  end)()`);
  assert.deepEqual(a, [true, 0.8, 1, 1, true, true], 'entra de una vez, ya al 80 %');
  assert.deepEqual(b[0], [true, 0.8, 1, 1], 'mientras está abierta la luz no cambia');
  assert.equal(b[1], false, 'sale de una vez');
  assert.deepEqual(b[2], [true, 0.8, 1], 'vuelve a entrar de una vez');
  assert.equal(b[3], 0, 'ningún AnimationGroup');
  assert.deepEqual([b[4], b[5]], [true, true], 'ni OnUpdate');
  // Y en el código del desplegable no hay nada que anime la luz.
  const fuente = readFileSync(new URL('../../../addons/SnetForever_Comercio/ui/piezas/campos.lua', import.meta.url), 'utf8');
  const desplegable = fuente.slice(fuente.search(/^-- Desplegable\r?$/m), fuente.search(/^-- Etiqueta\r?$/m));
  assert.ok(desplegable.length > 1000);
  assert.doesNotMatch(desplegable, /AnimationGroup|OnUpdate|UIFrameFade|UIFrameFlash|SetAlpha/);
  sinErrores(m);
});

test('un desplegable sin ventana propia (hijo directo de UIParent) oscurece la pantalla entera', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${RECT}
    local d = SnetForever.Piezas.desplegable(UIParent, {ancho = 150, opciones = ${OPCIONES}, get = function() return "a" end,
      set = function() end})
    d:SetPoint("CENTER")
    d:Click()
    local sombra = _G.SnetForeverDesplegableSombra
    local out = {sombra:IsVisible(), rect(sombra), rect(UIParent)}
    d:cerrar()
    return out
  end)()`);
  assert.equal(r[0], true);
  assert.deepEqual(r[1], r[2], 'cubre la pantalla');
  sinErrores(m);
});

test('desplegable con título: la primera fila es el título, no se pulsa y la lista crece lo que mide; abrir otro sin título lo quita', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local Tema = SnetForever.Tema
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetAllPoints(UIParent)
    local elegido
    local con = P.desplegable(padre, {ancho = 200, titulo = "Elige una", opciones = ${OPCIONES}, get = function() return "a" end,
      set = function(v) elegido = v end})
    con:SetPoint("CENTER")
    local sin = P.desplegable(padre, {ancho = 200, opciones = ${OPCIONES}, get = function() return "a" end, set = function() end})
    sin:SetPoint("CENTER", padre, "CENTER", 0, 100)
    local lista -- se crea al abrir el primero
    local muestra = Tema.letra(padre:CreateFontString(nil, "OVERLAY"), "etiqueta")
    local function medir()
      local t, linea = lista.titulo, lista.lineaTitulo
      local primera = lista.filas[1]
      return {
        titulo = t and t:IsShown() or false, texto = t and t:GetText(), tipo = t and t:GetObjectType(),
        letra = t and {t:GetFont()}, color = t and {t:GetTextColor()},
        linea = linea and linea:IsShown() or false, lineaColor = linea and {linea:GetVertexColor()},
        lineaAlto = linea and linea:GetHeight(),
        lineaDesdeArriba = linea and (lista:GetTop() - linea:GetTop()),
        fondo = lista.fondoTitulo and {lista.fondoTitulo[1]:IsShown(), lista.fondoTitulo[2]:IsShown(),
          {lista.fondoTitulo[1]:GetVertexColor()}, {lista.fondoTitulo[2]:GetVertexColor()},
          lista:GetTop() - lista.fondoTitulo[1]:GetBottom(), lista:GetTop() - lista.fondoTitulo[2]:GetTop(),
          lista.fondoTitulo[1]:GetLeft() - lista:GetLeft(), lista.fondoTitulo[2]:GetLeft() - lista:GetLeft()} or false,
        alto = lista:GetHeight(), primera = lista:GetTop() - primera:GetTop(), primeraTexto = primera.texto:GetText(),
        filas = lista.visibles,
      }
    end
    con:Click()
    lista = _G.SnetForeverDesplegableLista
    local conT = medir()
    -- El título no se pulsa: es un texto de la propia lista (no una fila ni un botón).
    local clicable = lista.titulo:GetParent() ~= lista
    -- Un clic a la altura del título: el cursor en su centro; recibe el clic el marco más alto que esté debajo (la lista,
    -- sus filas y su barra, o el telón). Si es un botón se pulsa; si no, se lanzan sus OnMouseDown y OnMouseUp.
    local escala = lista:GetEffectiveScale()
    BANCO.cursor = {x = (lista:GetLeft() + lista:GetRight()) / 2 * escala, y = (lista:GetTop() - 16) * escala}
    local candidatos = {lista, _G.SnetForeverDesplegableTelon}
    for _, hijo in ipairs({lista:GetChildren()}) do candidatos[#candidatos + 1] = hijo end
    local debajo
    for _, f in ipairs(candidatos) do
      local recibe = f:GetObjectType() == "Button" or f:IsMouseEnabled()
      if f:IsVisible() and recibe and f:IsMouseOver() and (not debajo or f:GetFrameLevel() > debajo:GetFrameLevel()) then
        debajo = f
      end
    end
    if debajo:GetObjectType() == "Button" then
      debajo:Click("LeftButton")
    else
      for _, s in ipairs({"OnMouseDown", "OnMouseUp"}) do
        local h = debajo:GetScript(s)
        if h then h(debajo, "LeftButton") end
      end
    end
    local clicTitulo = {debajo == lista, lista:IsShown()}
    sin:Click()
    local sinT = medir()
    con:Click()
    local otraVez = medir()
    lista:Hide()
    return {conT = conT, sinT = sinT, otraVez = otraVez, clicable = clicable, elegido = elegido or false, clicTitulo = clicTitulo,
      letraEtiqueta = {muestra:GetFont()}}
  end)()`);
  const { conT, sinT, otraVez } = r;
  assert.equal(conT.titulo, true, 'el título se ve');
  assert.equal(conT.texto, 'Elige una');
  assert.equal(conT.tipo, 'FontString', 'es un texto, no un botón');
  assert.equal(r.clicable, false, 'no se pulsa');
  assert.deepEqual(r.clicTitulo, [true, true], 'un clic en el título cae en la lista: ni fila ni telón, y sigue abierta');
  assert.equal(r.elegido, false, 'el clic en el título no llama a set');
  assert.deepEqual(conT.letra, r.letraEtiqueta, 'letra «etiqueta»');
  assert.equal(aHex(conT.color), C.texto, 'en «texto»');
  assert.equal(conT.linea, true, 'línea bajo el título');
  assert.equal(aHex(conT.lineaColor), C.borde, 'de 1 px «borde»');
  assert.equal(conT.lineaAlto, 1);
  assert.equal(conT.lineaDesdeArriba, 31, 'la línea es el último píxel de la fila de 32 (medida en TSM)');
  // Ronda 1: el fondo gris de TSM (#382e2a), dentro del borde y hasta la línea, sin tapar las esquinas de 2 px.
  assert.deepEqual([conT.fondo[0], conT.fondo[1]], [true, true], 'el fondo del título se ve');
  assert.equal(aHex(conT.fondo[2]), C.tituloLista, 'gris «tituloLista»');
  assert.equal(aHex(conT.fondo[3]), C.tituloLista);
  assert.equal(conT.fondo[4], 31, 'llega hasta la línea');
  assert.deepEqual([conT.fondo[5], conT.fondo[6], conT.fondo[7]], [1, 1, 3], 'dentro del borde; la franja de arriba, metida');
  assert.equal(conT.alto, sinT.alto + 32, 'la lista crece 32 px');
  assert.equal(conT.primera, sinT.primera + 32, 'las opciones empiezan bajo el título');
  assert.equal(conT.primeraTexto, 'Alfa', 'la primera opción sigue siendo la primera');
  assert.equal(sinT.titulo, false, 'abrir otro sin título lo quita');
  assert.equal(sinT.linea, false);
  assert.deepEqual([sinT.fondo[0], sinT.fondo[1]], [false, false], 'ni su fondo');
  assert.equal(sinT.alto, 3 * 22 + 4);
  assert.equal(sinT.primera, 2);
  assert.equal(otraVez.titulo, true, 'y vuelve con el que lo tiene');
  assert.equal(otraVez.alto, conT.alto);
  sinErrores(m);
});

test('con título, plantear() lo cuenta en el alto: caben las filas que dejan sitio al título', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local opciones = {}
    for i = 1, 30 do opciones[i] = {i, "Opción " .. i} end
    -- Una ventana a escala 3 (la lista va a la misma escala) con la caja casi abajo del todo: hacia abajo no cabe ninguna
    -- fila y se abre hacia arriba. Arriba quedan (1080 - 159 - 16) / 3 - 4 = 297,7 px: 13 filas (286) sin título, y con
    -- los 32 del título solo 12.
    local ventana = CreateFrame("Frame", nil, UIParent)
    ventana:SetScale(3)
    ventana:SetAllPoints(UIParent)
    local function filas(titulo)
      local d = P.desplegable(ventana, {ancho = 150, titulo = titulo, opciones = opciones, get = function() return 1 end,
        set = function() end})
      d:SetPoint("BOTTOMLEFT", ventana, "BOTTOMLEFT", 10, 31)
      d:Click()
      local lista = _G.SnetForeverDesplegableLista
      local n, alto, arriba = lista.visibles, lista:GetHeight(), lista:GetBottom() > d:GetTop()
      lista:Hide()
      return {n, alto, arriba}
    end
    return {filas(nil), filas("Título"), UIParent:GetHeight(), UIParent:GetEffectiveScale()}
  end)()`);
  assert.deepEqual([r[2], r[3]], [1080, 1], 'el banco da 1080 de alto a UIParent, a escala 1');
  assert.deepEqual(r[0], [13, 13 * 22 + 4, true], 'sin título, 13 filas hacia arriba');
  assert.deepEqual(r[1], [12, 12 * 22 + 4 + 32, true], 'con título, una menos: los 32 px del título no caben con 13');
  sinErrores(m);
});

test('colorBorde pinta el borde de la lista y el siguiente desplegable vuelve al gris', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    local dorado = P.desplegable(padre, {ancho = 150, colorBorde = "acento", opciones = ${OPCIONES},
      get = function() return "a" end, set = function() end})
    dorado:SetPoint("CENTER")
    local gris = P.desplegable(padre, {ancho = 150, opciones = ${OPCIONES}, get = function() return "a" end, set = function() end})
    gris:SetPoint("CENTER", padre, "CENTER", 0, 100)
    local lista -- se crea al abrir el primero
    local function colorBorde()
      local t = lista.snfTema.borde[1]
      return {t:IsShown(), {t:GetVertexColor()}}
    end
    dorado:Click()
    lista = _G.SnetForeverDesplegableLista
    local a = colorBorde()
    gris:Click()
    local b = colorBorde()
    dorado:Click()
    local c = colorBorde()
    lista:Hide()
    return {a, b, c}
  end)()`);
  assert.equal(r[0][0], true);
  assert.equal(aHex(r[0][1]), 'e6ac72', 'borde «acento»');
  assert.equal(aHex(r[1][1]), C.apagado, 'el siguiente vuelve al gris «apagado»');
  assert.equal(aHex(r[2][1]), 'e6ac72');
  sinErrores(m);
});

test('desplegable de varios: marca y desmarca con ✓ y la caja dice cuántos', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local elegidos, llamadas = {a = true}, {}
    local d = P.desplegable(CreateFrame("Frame", nil, UIParent), {ancho = 150, varios = true, opciones = ${OPCIONES},
      get = function() return elegidos end,
      set = function(v, marcado) elegidos[v] = marcado or nil; llamadas[#llamadas + 1] = {v, marcado} end})
    d:SetPoint("CENTER")
    local t0 = d.texto:GetText()
    d:Click()
    local lista = _G.SnetForeverDesplegableLista
    local function tildes()
      local r = {}
      for i = 1, 3 do r[i] = lista.filas[i].tilde:IsShown() end
      return r
    end
    local t1 = tildes()
    local tilde = lista.filas[1].tilde
    local coordsTilde = {tilde:GetTexCoord()}
    local ct = CreateFrame("Frame", nil, UIParent):CreateTexture()
    SnetForever.Tema.icono(ct, "tilde")
    local esperadas = {ct:GetTexCoord()}
    lista.filas[2]:Click()
    local t2, texto2 = tildes(), d.texto:GetText()
    local abierta2 = lista:IsShown()
    lista.filas[3]:Click()
    local texto3 = d.texto:GetText()
    lista.filas[1]:Click()
    lista.filas[2]:Click()
    local t4, texto4 = tildes(), d.texto:GetText()
    lista.filas[3]:Click()
    local texto5 = d.texto:GetText()
    -- «ninguno» propio
    local e2 = {}
    local d2 = P.desplegable(CreateFrame("Frame", nil, UIParent), {ancho = 150, varios = true, opciones = ${OPCIONES},
      cabecera = "Todos", get = function() return e2 end, set = function() end})
    return {t0, t1, coordsTilde, esperadas, t2, texto2, abierta2, texto3, t4, texto4, texto5, llamadas, d2.texto:GetText(),
      {tilde:GetVertexColor()}}
  end)()`);
  const [t0, t1, coordsTilde, esperadas, t2, texto2, abierta2, texto3, t4, texto4, texto5, llamadas, texto6, colorTilde] = r;
  assert.equal(t0, '1 elegido');
  assert.deepEqual(t1, [true, false, false], '✓ solo en la elegida');
  assert.deepEqual(coordsTilde, esperadas, 'el ✓ es el del atlas');
  assert.equal(aHex(colorTilde), C.marca, '✓ amarilla');
  assert.deepEqual(t2, [true, true, false]);
  assert.equal(texto2, '2 elegidos');
  assert.equal(abierta2, true, 'en el de varios la lista sigue abierta');
  assert.equal(texto3, '3 elegidos');
  assert.deepEqual(t4, [false, false, true], 'se desmarca con otro clic');
  assert.equal(texto4, '1 elegido');
  assert.equal(texto5, 'Ninguno', 'sin ninguno, el texto por defecto');
  assert.deepEqual(llamadas, [['b', true], ['c', true], ['a', false], ['b', false], ['c', false]]);
  assert.equal(texto6, 'Todos', 'el texto de «ninguno» que se pasa');
  sinErrores(m);
});

test('etiqueta con 🔗 llama a vinculo al pulsar el icono', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P, Tema = SnetForever.Piezas, SnetForever.Tema
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetSize(300, 200)
    padre:SetPoint("CENTER")
    local n = 0
    local con = P.etiqueta(padre, "Precio mínimo", {vinculo = function() n = n + 1 end})
    local sin = P.etiqueta(padre, "Precio máximo")
    local ct = CreateFrame("Frame", nil, UIParent):CreateTexture()
    Tema.icono(ct, "vinculo")
    local campo = P.campo(padre, {ancho = 120, get = function() return "" end, set = function() end})
    campo:SetPoint("TOPLEFT", padre, "TOPLEFT", 20, -60)
    con:anclarSobre(campo)
    local icono = con.iconoVinculo
    local f = con.texto:GetFont()
    con.botonVinculo:Click()
    return {con.texto:GetText(), {con.texto:GetTextColor()}, f, n, sin.botonVinculo == nil, sin.iconoVinculo == nil,
      {icono:GetTexture(), {icono:GetTexCoord()}, {icono:GetSize()}}, {ct:GetTexCoord()},
      con:GetBottom() - campo:GetTop(), con:GetLeft() == campo:GetLeft(),
      con.iconoVinculo:GetLeft() >= con.texto:GetRight(), sin.texto:GetText()}
  end)()`);
  const [texto, color, fuente, n, sinBoton, sinIcono, icono, esperadas, separacion, alineada, detras, textoSin] = r;
  assert.equal(texto, 'Precio mínimo');
  assert.equal(aHex(color), 'f5e8d4', 'texto de la etiqueta');
  assert.match(fuente, /BarlowSemiCondensed-SemiBold/);
  assert.equal(n, 1, 'pulsar el icono llama a vinculo');
  assert.equal(sinBoton, true);
  assert.equal(sinIcono, true);
  assert.equal(icono[0], ATLAS);
  assert.deepEqual(icono[1], esperadas, 'icono 🔗 del atlas');
  assert.deepEqual(icono[2], [12, 12]);
  assert.equal(separacion, 6, '6 px encima del campo');
  assert.equal(alineada, true);
  assert.equal(detras, true, 'el icono va detrás del texto');
  assert.equal(textoSin, 'Precio máximo');
  sinErrores(m);
});

test('un fallo dentro de set, copiar, elegir o vinculo va a geterrorhandler y no rompe a quien lo lanza', () => {
  const m = nuevaMaquina();
  m.lua(`(function()
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    local c = P.campo(padre, {ancho = 100, copiar = function() error("copiar-roto") end,
      get = function() return "" end, set = function() error("set-roto") end})
    c:SetText("x")
    c:GetScript("OnEnterPressed")(c)
    c.botonCopiar:Click()
    local d = P.desplegable(padre, {ancho = 100, opciones = {{"a", "A"}}, get = function() return "a" end,
      set = function() error("elegir-roto") end})
    d:Click()
    _G.SnetForeverDesplegableLista.filas[1]:Click()
    P.etiqueta(padre, "x", {vinculo = function() error("vinculo-roto") end}).botonVinculo:Click()
  end)()`);
  const textos = m.errores().map(String).join('\n');
  for (const s of ['set-roto', 'copiar-roto', 'elegir-roto', 'vinculo-roto']) assert.match(textos, new RegExp(s));
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1: desplazamiento, Escape propio, esquinas, cierre al esconderse, get() tras set y validar roto
// ---------------------------------------------------------------------------------------------------

// N opciones «v1»…«vN» con texto «Opción 1»…
const MUCHAS = (n) => `(function() local t = {} for i = 1, ${n} do t[i] = {"v" .. i, "Opción " .. i} end return t end)()`;

// Un desplegable de prueba con n opciones, en el sitio que se diga (punto de UIParent y desplazamiento en y).
const DESPLEGABLE_MUCHAS = (n, punto = '"CENTER"', y = 0) => `
    local P = SnetForever.Piezas
    local valor, llamadas = "v1", {}
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetSize(200, 30)
    padre:SetPoint(${punto}, UIParent, ${punto}, 0, ${y})
    local d = P.desplegable(padre, {ancho = 150, opciones = ${MUCHAS(n)}, get = function() return valor end,
      set = function(v) valor = v; llamadas[#llamadas + 1] = v end})
    d:SetPoint("CENTER", padre, "CENTER")
    local function lista() return _G.SnetForeverDesplegableLista end
    local function visibles()
      local r = {}
      for _, f in ipairs(lista().filas) do
        if f:IsShown() then r[#r + 1] = f.texto:GetText() end
      end
      return r
    end
    local function rueda(delta, veces)
      for _ = 1, veces or 1 do lista():GetScript("OnMouseWheel")(lista(), delta) end
    end`;

test('desplegable con 353 opciones: 14 filas como mucho, cabe en pantalla y solo crea las filas que se ven', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLEGABLE_MUCHAS(353)}
    d:Click()
    local L = lista()
    local pantalla = UIParent:GetTop() - UIParent:GetBottom()
    local s = L:GetScale()
    return {L:GetHeight(), #L.filas, #visibles(), L:GetTop() * s <= pantalla, L:GetBottom() * s >= 0,
      visibles()[1], visibles()[14], L.barra:IsShown(), L:GetWidth(), d:GetWidth()}
  end)()`);
  assert.equal(r[0], 14 * 22 + 4, "como mucho 14 filas de 22 px y 4 de margen");
  assert.ok(r[1] <= 15, `solo las filas que se ven (más una): ${r[1]}`);
  assert.equal(r[2], 14);
  assert.equal(r[3], true, 'no pasa por arriba');
  assert.equal(r[4], true, 'no pasa por abajo');
  assert.deepEqual([r[5], r[6]], ['Opción 1', 'Opción 14']);
  assert.equal(r[7], true, 'con más filas de las que caben sale la barra');
  assert.equal(r[8], r[9], 'la lista mide como la caja');
  sinErrores(m);
});

test('desplegable con muchas opciones: la rueda baja y sube de fila en fila y la última se puede elegir', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLEGABLE_MUCHAS(353)}
    d:Click()
    local L = lista()
    rueda(-1)
    local una = visibles()[1]
    rueda(-1, 4)
    local cinco = visibles()[1]
    rueda(1, 2)
    local tres = visibles()[1]
    rueda(1, 100)
    local arriba = visibles()[1]
    rueda(-1, 1000)
    local fin = {visibles()[1], visibles()[14], #visibles()}
    rueda(-1, 5)
    local pasado = visibles()[14]
    L.filas[14]:Click()
    return {una, cinco, tres, arriba, fin, pasado, valor, #llamadas, L:IsShown(), #L.filas, d.texto:GetText()}
  end)()`);
  assert.equal(r[0], 'Opción 2', 'una muesca = una fila');
  assert.equal(r[1], 'Opción 6');
  assert.equal(r[2], 'Opción 4');
  assert.equal(r[3], 'Opción 1', 'no sube de la primera');
  assert.deepEqual(r[4], ['Opción 340', 'Opción 353', 14]);
  assert.equal(r[5], 'Opción 353', 'no baja de la última');
  assert.equal(r[6], 'v353', 'la fila 353 se elige');
  assert.equal(r[7], 1);
  assert.equal(r[8], false);
  assert.ok(r[9] <= 15);
  assert.equal(r[10], 'Opción 353');
  sinErrores(m);
});

test('desplegable: la barra es de 4 px, apagada y proporcional a lo que se ve; con 5 opciones no hay barra', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLEGABLE_MUCHAS(100)}
    d:Click()
    local L = lista()
    local ancho, alto = L.barra:GetSize()
    local color = {L.barra:GetVertexColor()}
    local arriba = L:GetTop() - L.barra:GetTop()
    rueda(-1, 1000)
    local abajo = {L.barra:GetBottom() - L:GetBottom(), L:GetTop() - L.barra:GetTop()}
    local derecha = L:GetRight() - L.barra:GetRight()
    L:Hide()
    return {ancho, alto, color, arriba, abajo, derecha, L:GetHeight()}
  end)()`);
  const [ancho, alto, color, arriba, abajo, derecha, altoLista] = r;
  assert.equal(ancho, 4);
  assert.equal(aHex(color), C.apagado);
  // 14 de 100 filas: la barra ocupa 14/100 del alto útil (308 px).
  assert.ok(Math.abs(alto - (308 * 14) / 100) < 1.5, `alto ${alto}`);
  assert.ok(arriba <= 3, 'arriba de todo al abrir');
  assert.ok(abajo[0] <= 3 && abajo[1] > 200, 'abajo del todo al llegar al final');
  assert.ok(derecha >= 0 && derecha <= 3, 'a la derecha, dentro del borde');
  assert.equal(altoLista, 14 * 22 + 4);
  const pocas = nuevaMaquina().lua(`(function()
    ${DESPLEGABLE_MUCHAS(5)}
    d:Click()
    return {lista().barra:IsShown(), #visibles(), lista():GetHeight()}
  end)()`);
  assert.deepEqual(pocas, [false, 5, 5 * 22 + 4], 'con 5 opciones no hay barra');
  sinErrores(m);
});

test('desplegable: cerrar y reabrir vuelve arriba; el simple se desplaza hasta la opción elegida', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLEGABLE_MUCHAS(353)}
    d:Click()
    rueda(-1, 50)
    local lejos = visibles()[1]
    lista():Hide()
    d:Click()
    local reabierta = visibles()[1]
    lista():Hide()
    -- una elegida lejos: sale a la vista
    valor = "v200"
    d:refrescar()
    d:Click()
    local v = visibles()
    local esta = false
    for _, t in ipairs(v) do if t == "Opción 200" then esta = true end end
    -- una elegida entre las primeras: arriba del todo
    lista():Hide()
    valor = "v3"
    d:Click()
    local alto = visibles()[1]
    -- el de varios abre arriba aunque haya una elegida lejos
    lista():Hide()
    local d2 = P.desplegable(padre, {ancho = 150, varios = true, opciones = ${MUCHAS(353)},
      get = function() return {v200 = true} end, set = function() end})
    d2:SetPoint("CENTER", padre, "CENTER")
    d2:Click()
    return {lejos, reabierta, esta, #v, alto, visibles()[1]}
  end)()`);
  assert.equal(r[0], 'Opción 51');
  assert.equal(r[1], 'Opción 1', 'al reabrir vuelve arriba');
  assert.equal(r[2], true, 'la elegida se ve');
  assert.equal(r[3], 14);
  assert.equal(r[4], 'Opción 1');
  assert.equal(r[5], 'Opción 1', 'el de varios abre arriba');
  sinErrores(m);
});

test('desplegable cerca del borde de la pantalla: se abre hacia arriba si abajo no hay sitio y nunca se sale', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local pantalla = UIParent:GetTop() - UIParent:GetBottom()
    ${DESPLEGABLE_MUCHAS(353, '"BOTTOM"', 40)}
    d:Click()
    local L = lista()
    local s = L:GetScale()
    local res = {L:GetBottom() * s, L:GetTop() * s, d:GetTop(), L:GetHeight(), #visibles()}
    L:Hide()
    return {res, pantalla}
  end)()`);
  const [[fondo, techo, arribaCaja, alto, filas], pantalla] = r;
  assert.ok(fondo >= 0 && techo <= pantalla, `la lista (${fondo}-${techo}) cabe en ${pantalla}`);
  assert.ok(fondo >= arribaCaja - 1, 'abierta hacia arriba: la lista queda encima de la caja');
  assert.ok(filas >= 1 && filas <= 14);
  assert.equal(alto, filas * 22 + 4);
  const r2 = nuevaMaquina().lua(`(function()
    ${DESPLEGABLE_MUCHAS(353, '"TOP"', -40)}
    d:Click()
    local L = lista()
    local s = L:GetScale()
    local pantalla = UIParent:GetTop() - UIParent:GetBottom()
    return {L:GetTop() * s <= pantalla, L:GetBottom() * s >= 0, L:GetTop() <= d:GetBottom() + 0.01, #visibles()}
  end)()`);
  assert.deepEqual(r2, [true, true, true, 14], 'arriba de la pantalla hay sitio abajo: se abre hacia abajo');
  sinErrores(m);
});

test('con la lista abierta, Escape cierra solo la lista y no el panel registrado en UISpecialFrames', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local panel = CreateFrame("Frame", "SnetForeverPanelDePrueba", UIParent)
    panel:SetSize(300, 200)
    panel:SetPoint("CENTER")
    table.insert(UISpecialFrames, "SnetForeverPanelDePrueba")
    local d = P.desplegable(panel, {ancho = 150, opciones = {{"a", "A"}, {"b", "B"}}, get = function() return "a" end,
      set = function() end})
    d:SetPoint("CENTER")
    local function lista() return _G.SnetForeverDesplegableLista end
    d:Click()
    local abierta = lista():IsShown()
    -- otra tecla se deja pasar
    local retenidaA = BANCO.pulsarTecla("A")
    local propagaA = lista():GetPropagateKeyboardInput()
    local sigueAbierta = lista():IsShown()
    local retenida = BANCO.pulsarTecla("ESCAPE")
    local propagaEsc = lista():GetPropagateKeyboardInput()
    local trasEscape = {lista():IsShown(), _G.SnetForeverDesplegableTelon:IsShown(), panel:IsShown()}
    -- sin lista abierta, el siguiente Escape cierra el panel (el cliente cierra los de UISpecialFrames)
    local retenida2 = BANCO.pulsarTecla("ESCAPE")
    return {abierta, retenidaA, propagaA, sigueAbierta, retenida, propagaEsc, trasEscape, retenida2, panel:IsShown()}
  end)()`);
  assert.equal(r[0], true);
  assert.equal(r[1], false, 'otra tecla no la retiene la lista');
  assert.equal(r[2], true, 'otra tecla: SetPropagateKeyboardInput(true)');
  assert.equal(r[3], true, 'otra tecla no cierra la lista');
  assert.equal(r[4], true, 'Escape lo retiene la lista');
  assert.equal(r[5], false, 'Escape: SetPropagateKeyboardInput(false)');
  assert.deepEqual(r[6], [false, false, true], 'Escape cierra la lista y su telón, pero no el panel');
  assert.equal(r[7], false);
  assert.equal(r[8], false, 'sin lista, el Escape siguiente sí cierra el panel');
  sinErrores(m);
});

test('sin SetPropagateKeyboardInput, la lista está en UISpecialFrames solo mientras está abierta', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local panel = CreateFrame("Frame", nil, UIParent)
    local d = P.desplegable(panel, {ancho = 150, opciones = {{"a", "A"}}, get = function() return "a" end, set = function() end})
    local function dentro()
      for _, n in ipairs(UISpecialFrames) do if n == "SnetForeverDesplegableLista" then return true end end
      return false
    end
    d:Click()
    local conTeclado = dentro()
    d:cerrar()
    _G.SnetForeverDesplegableLista:EnableKeyboard(false) -- un cliente sin esas APIs nunca lo activó
    BANCO.quitarApi("SnetForeverDesplegableLista.SetPropagateKeyboardInput")
    d:Click()
    local abierta = dentro()
    BANCO.pulsarTecla("ESCAPE")
    return {conTeclado, abierta, dentro(), _G.SnetForeverDesplegableLista:IsShown()}
  end)()`);
  assert.deepEqual(r, [false, true, false, false], 'sin la API: en UISpecialFrames al abrir, fuera al cerrar (Escape la cierra)');
  sinErrores(m);
});

test('esconder la caja (su padre) cierra la lista y el oscurecido; esconder otra caja no', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local function nuevo(padre)
      return P.desplegable(padre, {ancho = 150, opciones = {{"a", "A"}, {"b", "B"}}, get = function() return "a" end,
        set = function() end})
    end
    local padre = CreateFrame("Frame", nil, UIParent)
    local d = nuevo(padre)
    d:Click()
    local antes = {_G.SnetForeverDesplegableLista:IsShown(), _G.SnetForeverDesplegableTelon:IsShown()}
    padre:Hide()
    local despues = {_G.SnetForeverDesplegableLista:IsShown(), _G.SnetForeverDesplegableTelon:IsShown()}
    padre:Show()
    d:Click()
    local otroPadre = CreateFrame("Frame", nil, UIParent)
    nuevo(otroPadre)
    otroPadre:Hide()
    return {antes, despues, _G.SnetForeverDesplegableLista:IsShown()}
  end)()`);
  assert.deepEqual(r[0], [true, true]);
  assert.deepEqual(r[1], [false, false]);
  assert.equal(r[2], true, 'esconder la caja de otro desplegable no cierra la lista de este');
  sinErrores(m);
});

test('campo: tras set vuelve a leer get() (un set que recorta espacios deja el texto recortado)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local valor = ""
    local c = P.campo(CreateFrame("Frame", nil, UIParent), {ancho = 150, get = function() return valor end,
      set = function(v) valor = strtrim(v) end})
    c:SetFocus()
    c:SetText("  hola  ")
    c:GetScript("OnEnterPressed")(c)
    local tras = {c:GetText(), valor}
    -- perder el foco con el texto ya aplicado no vuelve a llamar a set
    local n = 0
    local c2 = P.campo(CreateFrame("Frame", nil, UIParent), {ancho = 150, get = function() return valor end,
      set = function(v) n = n + 1; valor = strtrim(v) end})
    c2:SetFocus()
    c2:SetText(" otro ")
    c2:ClearFocus()
    return {tras, c2:GetText(), n}
  end)()`);
  assert.deepEqual(r[0], ['hola', 'hola']);
  assert.equal(r[1], 'otro');
  assert.equal(r[2], 1);
  sinErrores(m);
});

test('validar que lanza un error: va a geterrorhandler y el texto se da por bueno', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${PLANAS_DE}
    local P = SnetForever.Piezas
    local valor = ""
    local c = P.campo(CreateFrame("Frame", nil, UIParent), {ancho = 150, get = function() return valor end,
      set = function(v) valor = v end, validar = function() error("validar-roto") end})
    c:SetPoint("CENTER")
    c:SetFocus()
    c:SetText("algo")
    c:GetScript("OnEnterPressed")(c)
    local e = SnetForever.Tema.color("error")
    local rojos = 0
    for _, p in ipairs(planasDe(c)) do
      if p[1][1] == e[1] and p[1][2] == e[2] and p[1][3] == e[3] then rojos = rojos + 1 end
    end
    return {valor, rojos}
  end)()`);
  assert.deepEqual(r, ['algo', 0], 'se aplica y no hay borde rojo');
  assert.match(m.errores().map(String).join('\n'), /validar-roto/);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 2: rueda sobre el telón, barra sobre el resalte, margen de las filas y campo sin get
// ---------------------------------------------------------------------------------------------------

test('la rueda sobre el telón desplaza la lista (nunca llega al juego)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLEGABLE_MUCHAS(353)}
    d:Click()
    local telon = _G.SnetForeverDesplegableTelon
    local script = telon:GetScript("OnMouseWheel")
    if script then
      script(telon, -1)
      script(telon, -1)
      script(telon, -1)
      local abajo = visibles()[1]
      script(telon, 1)
      return {1, abajo, visibles()[1]}
    end
    return {0}
  end)()`);
  assert.deepEqual(r.slice(1), ['Opción 4', 'Opción 3'], 'rodar sobre el telón mueve la lista');
  sinErrores(m);
});

test('rodar sobre el telón con la lista cerrada no hace nada ni falla', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLEGABLE_MUCHAS(50)}
    d:Click()
    local telon = _G.SnetForeverDesplegableTelon
    lista():Hide()
    telon:GetScript("OnMouseWheel")(telon, -1)
    return telon:IsShown()
  end)()`);
  assert.equal(r, false);
  sinErrores(m);
});

test('con barra, el resalte no tapa la barra: va en un marco por encima de las filas', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLEGABLE_MUCHAS(100)}
    d:Click()
    local L = lista()
    local marcoBarra = L.barra:GetParent()
    local nivelesFilas = {}
    for _, f in ipairs(L.filas) do nivelesFilas[#nivelesFilas + 1] = f:GetFrameLevel() end
    local maxFila = math.max(unpack(nivelesFilas))
    return {marcoBarra ~= L, marcoBarra:GetParent() == L, marcoBarra:GetFrameLevel() > maxFila, L.barra:IsShown(),
      L.barra:GetParent():IsMouseEnabled()}
  end)()`);
  assert.deepEqual(r, [true, true, true, true, false], 'la barra, en un marco hijo de la lista sobre las filas y sin ratón');
  sinErrores(m);
});

test('las filas dejan 2 px arriba y abajo dentro de la lista (el resalte no pisa las esquinas)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLEGABLE_MUCHAS(353)}
    d:Click()
    local L = lista()
    local primera, ultima = L.filas[1], L.filas[14]
    local alto = L:GetHeight()
    local pocas = {}
    lista():Hide()
    return {L:GetTop() - primera:GetTop(), ultima:GetBottom() - L:GetBottom(), alto, primera:GetHeight()}
  end)()`);
  assert.deepEqual(r, [2, 2, 14 * 22 + 4, 22]);
  sinErrores(m);
});

test('campo sin get: tras Intro conserva lo escrito', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local guardado
    local c = P.campo(CreateFrame("Frame", nil, UIParent), {ancho = 150, set = function(v) guardado = v end})
    c:SetFocus()
    c:SetText("lo escrito")
    c:GetScript("OnEnterPressed")(c)
    return {c:GetText(), guardado}
  end)()`);
  assert.deepEqual(r, ['lo escrito', 'lo escrito']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------------
// Tarea 4: título de sección, tarjeta, pestañas secundarias y zona con desplazamiento fino (ui/piezas/contenedores.lua)
// ---------------------------------------------------------------------------------------------------------------------

test('título con descripción gris debajo y alto devuelto', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetSize(300, 100)
    padre:SetPoint("CENTER")
    local con, altoCon = P.titulo(padre, "Operaciones", "Lo que haces con cada grupo")
    local sin, altoSin = P.titulo(padre, "Ajustes")
    local _, _, _, _, yTitulo = con.titulo:GetPoint(1)
    local _, _, _, _, yDesc = con.descripcion:GetPoint(1)
    return {
      titulo = con.titulo:GetText(), tituloColor = {con.titulo:GetTextColor()}, tituloLetra = con.titulo:GetFont(),
      desc = con.descripcion:GetText(), descColor = {con.descripcion:GetTextColor()},
      altoCon = altoCon, altoMarcoCon = con:GetHeight(), altoSin = altoSin, altoMarcoSin = sin:GetHeight(),
      sinDescripcion = sin.descripcion == nil, yTitulo = yTitulo, yDesc = yDesc, padreDe = con:GetParent() == padre,
    }
  end)()`);
  assert.equal(r.titulo, 'Operaciones');
  assert.equal(aHex(r.tituloColor), C.texto, 'título blanco');
  assert.match(r.tituloLetra, /AlegreyaSC-Bold/, 'título en Bold');
  assert.equal(r.desc, 'Lo que haces con cada grupo');
  assert.equal(aHex(r.descColor), C.apagado, 'descripción gris');
  assert.ok(r.yDesc < r.yTitulo, 'la descripción va debajo del título');
  assert.equal(r.altoCon, r.altoMarcoCon, 'el alto devuelto es el del marco');
  assert.equal(r.altoSin, r.altoMarcoSin);
  assert.ok(r.altoCon > r.altoSin && r.altoSin > 0, 'con descripción mide más');
  assert.equal(r.sinDescripcion, true, 'sin descripción no se crea el texto');
  assert.equal(r.padreDe, true);
  sinErrores(m);
});

test('tarjeta: fondo secundario con esquinas y el ancho pedido', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${COLORES_DE}
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    local t = P.tarjeta(padre, {ancho = 240})
    local libre = P.tarjeta(padre)
    return {colores = coloresDe(t), ancho = t:GetWidth(), esquinas = #t.snfTema.fondoPleno, libre = libre:GetWidth()}
  end)()`);
  assert.ok(r.colores.length > 0);
  for (const c of r.colores) assert.equal(aHex(c), '232122', 'tarjeta: color secundario');
  assert.ok(r.esquinas > 1, 'con esquinas (varias piezas)');
  assert.equal(r.ancho, 240);
  sinErrores(m);
});

const PESTANAS = (ancho) => `
    ${COLORES_DE}
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetSize(400, 100)
    padre:SetPoint("CENTER")
    local elegidas = {}
    local p = P.pestanas(padre, {nombres = {"Detalles", "Publicación", "Cancelación"}, elegida = 2,
      alElegir = function(i, nombre) elegidas[#elegidas + 1] = i .. ":" .. nombre end})
    p:SetPoint("TOPLEFT", padre, "TOPLEFT", 0, 0)
    p:SetWidth(${ancho})
    p:GetScript("OnSizeChanged")(p, ${ancho}, p:GetHeight())
    local function estado()
      local r = {}
      for i, b in ipairs(p.pestanas) do
        local _, _, _, x = b:GetPoint(1)
        r[i] = {ancho = b:GetWidth(), x = x, relleno = coloresDe(b), texto = {b.texto:GetTextColor()}, nombre = b.texto:GetText()}
      end
      return r
    end`;

test('pestañas de igual ancho; la elegida destaca con acento de cobre', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${PESTANAS(300)}
    local antes = estado()
    p.pestanas[3]:Click()
    local tras = estado()
    p.pestanas[3]:Click()
    p.pestanas[1]:Click()
    return {antes = antes, tras = tras, elegidas = elegidas, fondo = coloresDe(p), elegida = p:elegida(), alto = p:GetHeight()}
  end)()`);
  assert.equal(r.antes.length, 3);
  for (const [i, e] of r.antes.entries()) {
    assert.equal(e.ancho, 100, 'cada pestaña mide un tercio');
    assert.equal(e.x, i * 100, 'pegadas, sin huecos');
  }
  // La 2 es la elegida: fondo pestanaElegida y texto acento; el resto sin fondo y con texto blanco.
  assert.ok(r.antes[1].relleno.length > 0);
  for (const c of r.antes[1].relleno) assert.equal(aHex(c), '49372c');
  assert.equal(aHex(r.antes[1].texto), 'e6ac72');
  for (const i of [0, 2]) {
    assert.equal(r.antes[i].relleno.length, 0, 'sin fondo');
    assert.equal(aHex(r.antes[i].texto), 'cbbeb1', 'las no elegidas: textoPestana');
  }
  // Pulsar la 3 cambia la elegida y avisa; pulsar la que ya está elegida no avisa otra vez.
  assert.equal(r.tras[1].relleno.length, 0);
  assert.equal(aHex(r.tras[1].texto), 'cbbeb1');
  assert.ok(r.tras[2].relleno.length > 0);
  assert.equal(aHex(r.tras[2].texto), 'e6ac72');
  assert.deepEqual(r.elegidas, ['3:Cancelación', '1:Detalles']);
  assert.equal(r.elegida, 1);
  // El contenedor es secundario.
  assert.ok(r.fondo.length > 0);
  for (const c of r.fondo) assert.equal(aHex(c), '232122');
  assert.ok(r.alto > 0);
  sinErrores(m);
});

test('pestañas: si el contenedor cambia de ancho se recolocan; :elegir no llama a alElegir', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${PESTANAS(300)}
    p:SetWidth(450)
    p:GetScript("OnSizeChanged")(p, 450, p:GetHeight())
    local ancho = estado()
    p:elegir(1)
    return {ancho = ancho, elegida = p:elegida(), avisos = #elegidas, texto1 = {p.pestanas[1].texto:GetTextColor()}}
  end)()`);
  for (const [i, e] of r.ancho.entries()) {
    assert.equal(e.ancho, 150);
    assert.equal(e.x, i * 150);
  }
  assert.equal(r.elegida, 1);
  assert.equal(r.avisos, 0);
  assert.equal(aHex(r.texto1), 'e6ac72');
  sinErrores(m);
});

const DESPLAZABLE = (alto) => `
    ${COLORES_DE}
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetSize(220, 150)
    padre:SetPoint("CENTER")
    local z, contenido = P.desplazable(padre)
    z:SetPoint("TOPLEFT", padre, "TOPLEFT", 0, 0)
    z:SetSize(200, 100)
    z:GetScript("OnSizeChanged")(z, 200, 100)
    z:ponerAlto(${alto})
    local function rueda(delta, veces)
      for _ = 1, veces or 1 do z:GetScript("OnMouseWheel")(z, delta) end
    end`;

test('desplazable: la rueda mueve el contenido, la barra mide 4 px y se esconde si cabe', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLAZABLE(300)}
    local function barra()
      local _, _, _, x, y = z.barra:GetPoint(1)
      return {z.barra:IsShown(), z.barra:GetWidth(), z.barra:GetHeight(), y}
    end
    local inicio = {z:GetVerticalScroll(), unpack(barra())}
    rueda(-1)
    local una = z:GetVerticalScroll()
    rueda(-1, 3)
    local cuatro = z:GetVerticalScroll()
    rueda(-1, 100)
    local final = {z:GetVerticalScroll(), unpack(barra())}
    rueda(1, 2)
    local subida = z:GetVerticalScroll()
    rueda(1, 100)
    local arriba = z:GetVerticalScroll()
    rueda(-1, 100)
    z:ponerAlto(80)
    local cabe = {z:GetVerticalScroll(), z.barra:IsShown()}
    return {
      inicio = inicio, una = una, cuatro = cuatro, final = final, subida = subida, arriba = arriba, cabe = cabe,
      alto = contenido:GetHeight(), ancho = contenido:GetWidth(), hijo = z:GetScrollChild() == contenido,
      padre = contenido:GetParent() == z,
    }
  end)()`);
  assert.equal(r.inicio[0], 0);
  assert.equal(r.inicio[1], true, 'con 300 sobre 100 sale la barra');
  assert.equal(r.inicio[2], 4, 'la barra mide 4 px de ancho');
  assert.ok(Math.abs(r.inicio[3] - 100 * 100 / 300) < 1e-6, 'alto proporcional a lo que se ve');
  assert.equal(r.una, 22, 'una muesca, una fila de 22 px');
  assert.equal(r.cuatro, 88);
  assert.equal(r.final[0], 200, 'no pasa del final (300 - 100)');
  assert.ok(Math.abs(r.final[4] + (100 - 100 * 100 / 300)) < 1e-6, 'al final la barra queda abajo del todo');
  assert.equal(r.subida, 156);
  assert.equal(r.arriba, 0, 'no pasa del principio');
  assert.deepEqual(r.cabe, [0, false], 'si todo cabe: arriba y sin barra');
  assert.equal(r.alto, 80);
  assert.equal(r.ancho, 200, 'el contenido mide como la zona');
  assert.equal(r.hijo, true);
  assert.equal(r.padre, true);
  sinErrores(m);
});

test('desplazable: ponerAlto vuelve a sacar la barra y, al encoger, el desplazamiento no se sale', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLAZABLE(80)}
    local escondida = not z.barra:IsShown()
    rueda(-1, 5)
    local sinMover = z:GetVerticalScroll()
    z:ponerAlto(500)
    local sale = z.barra:IsShown()
    rueda(-1, 1000)
    local fondo = z:GetVerticalScroll()
    z:ponerAlto(150)
    return {escondida = escondida, sinMover = sinMover, sale = sale, fondo = fondo, tras = z:GetVerticalScroll(), barra = z.barra:IsShown()}
  end)()`);
  assert.equal(r.escondida, true);
  assert.equal(r.sinMover, 0, 'sin recorrido la rueda no mueve nada');
  assert.equal(r.sale, true);
  assert.equal(r.fondo, 400);
  assert.equal(r.tras, 50, 'al encoger, el desplazamiento no se sale del nuevo final');
  assert.equal(r.barra, true);
  sinErrores(m);
});

test('desplazable: el aspecto de la barra es el del desplegable (apagado, marco por encima del contenido)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLAZABLE(300)}
    local c = {z.barra:GetVertexColor()}
    local marcoBarra = z.barra:GetParent()
    return {color = c, nivelBarra = marcoBarra:GetFrameLevel(), nivelContenido = contenido:GetFrameLevel(),
      barraEnContenido = marcoBarra == contenido}
  end)()`);
  assert.equal(aHex(r.color), C.apagado);
  assert.ok(r.nivelBarra > r.nivelContenido, 'la barra va por encima del contenido');
  assert.equal(r.barraEnContenido, false, 'la barra no se desplaza con el contenido');
  sinErrores(m);
});

// Ronda 1 de la revisión de la tarea 4

test('título: la descripción larga se ajusta en varias líneas y el marco crece al estrechar el ancho (nada se corta)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    local texto = "Esta es una descripción bastante larga que no cabe en una sola línea cuando la sección es estrecha"
    local marco, alto0 = P.titulo(padre, "Ajustes", texto)
    local una = marco:GetHeight()
    marco:ponerAncho(600)
    local ancho = marco:GetHeight()
    marco:ponerAncho(150)
    local estrecho = marco:GetHeight()
    local lineas = marco.descripcion:GetStringHeight()
    -- también al cambiar el tamaño del marco
    marco:SetWidth(300)
    marco:GetScript("OnSizeChanged")(marco, 300, marco:GetHeight())
    local medio = marco:GetHeight()
    return {alto0 = alto0, una = una, ancho = ancho, estrecho = estrecho, medio = medio, lineas = lineas}
  end)()`);
  assert.equal(r.alto0, r.una, 'al crearse devuelve el alto de una línea (el ancho aún no se conoce)');
  assert.equal(r.una, 16 + 4 + 14, 'una línea de 12 px (B3r: la letra «texto» del tema; el banco cuenta tamaño + 2)');
  assert.ok(r.estrecho > r.ancho, 'estrecho mide más que ancho');
  assert.ok(r.medio > r.ancho && r.medio < r.estrecho, 'OnSizeChanged recalcula');
  assert.equal(r.estrecho, 16 + 4 + r.lineas, 'alto = título + separación + alto real del texto');
  assert.ok(r.lineas > 14, 'varias líneas');
  sinErrores(m);
});

test('pestañas: el ancho se redondea a píxel entero y la última se queda con el resto (sin costuras)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${PESTANAS(301)}
    return estado()
  end)()`);
  assert.deepEqual(r.map((e) => e.ancho), [100, 100, 101]);
  assert.deepEqual(r.map((e) => e.x), [0, 100, 200]);
  assert.equal(r.reduce((s, e) => s + e.ancho, 0), 301);
  sinErrores(m);
});

test('desplazable: si la zona mide 0 de alto la barra se esconde aunque ponerAlto traiga contenido', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${DESPLAZABLE(300)}
    z:SetSize(200, 0)
    z:GetScript("OnSizeChanged")(z, 200, 0)
    z:ponerAlto(300)
    local escondida = not z.barra:IsShown()
    z:SetSize(200, 100)
    z:GetScript("OnSizeChanged")(z, 200, 100)
    return {escondida, z.barra:IsShown()}
  end)()`);
  assert.deepEqual(r, [true, true]);
  sinErrores(m);
});

// Muestrario (ui/piezas/muestrario.lua): la ventana de prueba que enseña todas las piezas (/snet muestrario).
test('el muestrario abre sin errores y enseña todas las piezas', () => {
  const m = nuevaMaquina();
  // Al entrar al juego no crea nada: la ventana nace la primera vez que se abre.
  assert.ok(!m.lua('rawget(_G, "SnetForeverMuestrario")'));
  assert.equal(m.lua('type(SnetForever.Muestrario.abrir)'), 'function');
  m.lua('SlashCmdList.SNET("muestrario")');
  const r = m.lua(`(function()
    local M = SnetForever.Muestrario
    local v = SnetForeverMuestrario
    local esp = false
    for _, n in ipairs(UISpecialFrames) do if n == "SnetForeverMuestrario" then esp = true end end
    local bloques = {}
    for i, b in ipairs(M.bloques) do bloques[i] = b.nombre end
    return {
      existe = v ~= nil, visible = v:IsShown(), padre = v:GetParent() == UIParent, estrato = v:GetFrameStrata(),
      movible = v:IsMovable(), especial = esp, bloques = bloques,
      cabeceraTabla = M.piezas.tabla ~= nil, filasTabla = M.piezas.tabla:cuantas(),
      nodos = M.piezas.arbol:visibles(), opciones = #M.opcionesLista,
      dinero = M.dineros, pestanas = M.piezas.pestanas:elegida(),
      zona = M.zona ~= nil and M.zona.contenido ~= nil,
    }
  end)()`);
  assert.equal(r.existe, true);
  assert.equal(r.visible, true);
  assert.equal(r.padre, true);
  assert.ok(['HIGH', 'DIALOG', 'FULLSCREEN', 'FULLSCREEN_DIALOG', 'TOOLTIP'].includes(r.estrato), `estrato alto: ${r.estrato}`);
  assert.equal(r.movible, true);
  assert.equal(r.especial, true, 'Escape lo cierra');
  assert.deepEqual(r.bloques, ['botones', 'casillas', 'radio', 'campos', 'desplegables', 'etiqueta', 'titulo', 'tarjeta',
    'pestanas', 'arbol', 'tabla', 'dinero']);
  assert.equal(r.filasTabla, 200);
  assert.ok(r.nodos >= 4, 'el árbol enseña al menos la raíz y sus hijos abiertos');
  assert.equal(r.opciones, 60);
  assert.ok(r.dinero >= 5, 'varios importes');
  assert.equal(r.zona, true);
  // La segunda vez no crea otra ventana: alterna (la cierra) y la vuelve a abrir.
  m.lua('SlashCmdList.SNET("muestrario")');
  assert.equal(m.lua('SnetForeverMuestrario:IsShown()'), false);
  m.lua('SlashCmdList.SNET("muestrario")');
  assert.equal(m.lua('SnetForeverMuestrario:IsShown()'), true);
  assert.equal(m.lua('SnetForever.Muestrario.ventana == SnetForeverMuestrario'), true);
  // Cerrar con la X.
  m.lua('SnetForeverMuestrario.cerrar:GetScript("OnClick")(SnetForeverMuestrario.cerrar)');
  assert.equal(m.lua('SnetForeverMuestrario:IsShown()'), false);
  sinErrores(m);
});

// Piezas.botonIcono: solo el icono del atlas, sin fondo; se aclara al pasar el ratón; apagado no llama a alPulsar.
test('botonIcono: sin fondo, con el icono pedido, aclara al pasar el ratón y apagado no pulsa', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    local pulsadas = 0
    local b = P.botonIcono(padre, "cerrar", function() pulsadas = pulsadas + 1 end, {tamano = 20, color = "texto"})
    local regiones = {}
    for _, t in ipairs({b:GetRegions()}) do
      if t:GetObjectType() == "Texture" then
        local x, y, z, w = t:GetVertexColor()
        regiones[#regiones + 1] = {coords = {t:GetTexCoord()}, color = {x, y, z, w}, textura = t:GetTexture()}
      end
    end
    local ancho, alto = b:GetSize()
    local normal = {b.icono:GetVertexColor()}
    b:GetScript("OnEnter")(b)
    local encima = {b.icono:GetVertexColor()}
    b:GetScript("OnLeave")(b)
    local fuera = {b.icono:GetVertexColor()}
    b:GetScript("OnClick")(b)
    local tras1 = pulsadas
    b:ponerApagado(true)
    local apagado = {b.icono:GetVertexColor()}
    b:GetScript("OnClick")(b)
    local atlas = CreateFrame("Frame", nil, UIParent):CreateTexture()
    SnetForever.Tema.icono(atlas, "cerrar")
    local esperadas = {atlas:GetTexCoord()}
    local def = P.botonIcono(padre, "mas", function() end)
    local dAncho = def:GetSize()
    return {n = #regiones, regiones = regiones, ancho = ancho, alto = alto, normal = normal, encima = encima, fuera = fuera,
      tras1 = tras1, tras2 = pulsadas, apagado = apagado, esperadas = esperadas, dAncho = dAncho}
  end)()`);
  assert.equal(r.n, 1, 'una sola textura: el icono, sin fondo');
  assert.deepEqual(r.regiones[0].coords, r.esperadas, 'el icono pedido del atlas');
  assert.deepEqual([r.ancho, r.alto], [20, 20]);
  assert.equal(r.dAncho, 16, 'tamaño por defecto 16');
  assert.equal(aHex(r.normal), C.texto);
  assert.ok(r.encima[0] >= r.normal[0] && r.encima[1] >= r.normal[1] && r.encima[2] >= r.normal[2], 'más claro encima');
  assert.notEqual(aHex(r.encima), C.texto, 'al pasar el ratón cambia');
  assert.equal(aHex(r.fuera), C.texto, 'al salir vuelve');
  assert.equal(r.tras1, 1);
  assert.equal(r.tras2, 1, 'apagado no llama a alPulsar');
  assert.equal(aHex(r.apagado), C.apagado);
  sinErrores(m);
});

test('botonIcono: un fallo dentro de alPulsar va a geterrorhandler y no rompe', () => {
  const m = nuevaMaquina();
  m.lua(`(function()
    local b = SnetForever.Piezas.botonIcono(CreateFrame("Frame", nil, UIParent), "cerrar", function() error("boom") end)
    b:GetScript("OnClick")(b)
  end)()`);
  assert.equal(m.errores().length, 1);
});

// B4r: Piezas.botonCuadrado, un cuadrado pequeño con borde de 1 px, fondo hundido y un icono del atlas dentro (desplegar y
// plegar todo de Navegar). Al pasar el ratón se aclaran el icono y el borde, como botonIcono; nada late.
test('botonCuadrado: cuadrado con borde, fondo hundido e icono centrado; aclara al pasar el ratón y apagado no pulsa', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local padre = CreateFrame("Frame", nil, UIParent)
    padre:SetSize(200, 200)
    padre:SetPoint("CENTER")
    local pulsadas = 0
    local b = P.botonCuadrado(padre, "abierto", function() pulsadas = pulsadas + 1 end)
    b:SetPoint("CENTER", padre, "CENTER", 0, 0)
    local function colores(lista)
      local r = {}
      for _, t in ipairs(lista) do r[#r + 1] = {t:GetVertexColor()} end
      return r
    end
    local ancho, alto = b:GetSize()
    local icono = {ancho = b.icono:GetWidth(), alto = b.icono:GetHeight(),
      cx = (b.icono:GetLeft() + b.icono:GetRight()) / 2 - (b:GetLeft() + b:GetRight()) / 2,
      cy = (b.icono:GetTop() + b.icono:GetBottom()) / 2 - (b:GetTop() + b:GetBottom()) / 2}
    local atlas = CreateFrame("Frame", nil, UIParent):CreateTexture()
    SnetForever.Tema.icono(atlas, "abierto")
    local normal = {icono = {b.icono:GetVertexColor()}, bordes = colores(b.bordes), fondo = {b.fondo:GetVertexColor()}}
    local grosor = {b.bordes[1]:GetHeight(), b.bordes[2]:GetHeight(), b.bordes[3]:GetWidth(), b.bordes[4]:GetWidth()}
    b:GetScript("OnEnter")(b)
    local encima = {icono = {b.icono:GetVertexColor()}, bordes = colores(b.bordes)}
    b:GetScript("OnLeave")(b)
    local fuera = {icono = {b.icono:GetVertexColor()}, bordes = colores(b.bordes)}
    b:GetScript("OnClick")(b)
    local tras1 = pulsadas
    b:ponerApagado(true)
    local apagado = {icono = {b.icono:GetVertexColor()}, bordes = colores(b.bordes)}
    b:GetScript("OnEnter")(b)
    local apagadoEncima = {b.icono:GetVertexColor()}
    b:GetScript("OnLeave")(b)
    b:GetScript("OnClick")(b)
    local otro = P.botonCuadrado(padre, "cerrado", function() end, {lado = 20, tamanoIcono = 12})
    return {ancho = ancho, alto = alto, icono = icono, coords = {b.icono:GetTexCoord()}, esperadas = {atlas:GetTexCoord()},
      normal = normal, grosor = grosor, encima = encima, fuera = fuera, tras1 = tras1, tras2 = pulsadas, apagado = apagado,
      apagadoEncima = apagadoEncima, otro = {otro:GetWidth(), otro:GetHeight(), otro.icono:GetWidth()},
      latido = b:GetScript("OnUpdate") ~= nil}
  end)()`);
  assert.deepEqual([r.ancho, r.alto], [16, 16], 'cuadrado de 16 px por defecto');
  assert.deepEqual([r.icono.ancho, r.icono.alto], [10, 10], 'icono de 10 px');
  assert.ok(Math.abs(r.icono.cx) < 0.01 && Math.abs(r.icono.cy) < 0.01, `icono centrado: ${JSON.stringify(r.icono)}`);
  assert.deepEqual(r.coords, r.esperadas, 'el icono pedido del atlas');
  assert.equal(r.normal.bordes.length, 4, 'cuatro tiras de borde');
  assert.deepEqual(r.grosor, [1, 1, 1, 1], 'borde de 1 px');
  for (const c of r.normal.bordes) assert.equal(aHex(c), C.borde);
  assert.equal(aHex(r.normal.fondo), C.hundido, 'fondo hundido, como el campo de al lado');
  assert.equal(aHex(r.normal.icono), C.texto);
  // Encima: icono y borde más claros (el mismo realce de botonIcono); al salir, vuelven.
  assert.notEqual(aHex(r.encima.icono), C.texto, 'el icono se aclara');
  assert.ok(r.encima.icono[0] >= r.normal.icono[0] && r.encima.icono[2] >= r.normal.icono[2]);
  for (const c of r.encima.bordes) {
    assert.notEqual(aHex(c), C.borde, 'el borde se aclara');
    assert.ok(c[0] > r.normal.bordes[0][0], 'más claro');
  }
  assert.equal(aHex(r.fuera.icono), C.texto, 'al salir vuelve el icono');
  for (const c of r.fuera.bordes) assert.equal(aHex(c), C.borde, 'al salir vuelve el borde');
  assert.equal(r.tras1, 1);
  assert.equal(r.tras2, 1, 'apagado no llama a alPulsar');
  assert.equal(aHex(r.apagado.icono), C.apagado);
  for (const c of r.apagado.bordes) assert.equal(aHex(c), C.botonApagado);
  assert.equal(aHex(r.apagadoEncima), C.apagado, 'apagado no se aclara');
  assert.deepEqual(r.otro, [20, 20, 12], 'lado y tamanoIcono');
  assert.equal(r.latido, false, 'sin OnUpdate: nada late');
  sinErrores(m);
});

test('el muestrario enseña los estados que faltaban, su X es un botón de icono y los textos son propios', () => {
  const m = nuevaMaquina();
  m.lua('SlashCmdList.SNET("muestrario")');
  const r = m.lua(`(function()
    local M = SnetForever.Muestrario
    local P = M.piezas
    local x = SnetForeverMuestrario.cerrar
    return {
      x = x ~= nil and x.icono ~= nil and x.texto == nil, xPunto = {x:GetPoint()},
      desplegableApagado = P.desplegableApagado ~= nil and P.desplegableApagado.snfApagado,
      lupaApagado = P.campoLupaApagado ~= nil, copiarApagado = P.campoCopiarApagado ~= nil,
      lupaError = P.campoLupaError ~= nil, botonIcono = P.botonIcono ~= nil,
    }
  end)()`);
  assert.equal(r.x, true, 'la X es botonIcono: icono y sin texto');
  assert.equal(r.xPunto[0], 'TOPRIGHT');
  assert.equal(r.desplegableApagado, true);
  assert.equal(r.lupaApagado && r.copiarApagado && r.lupaError && r.botonIcono, true);
  // Nada de las frases de las capturas de TSM: textos propios.
  const fuente = readFileSync(new URL('../../../addons/SnetForever_Comercio/ui/piezas/muestrario.lua', import.meta.url), 'utf8');
  for (const viejo of ['Ajusta lo de abajo', 'Escribe un valor de 0 a 100', 'max(2 * vendedor', 'primero(mercado, historico)']) {
    assert.ok(!fuente.includes(viejo), `sigue el texto cercano a TSM: ${viejo}`);
  }
  // C2a: la duración de la subasta en Forever es de 2, 8 o 24 horas (las claves siguen siendo «12», «24» y «48»).
  for (const viejo of ['"12 horas"', '"48 horas"']) assert.ok(!fuente.includes(viejo), `duración vieja en el muestrario: ${viejo}`);
  for (const bueno of ['{"12", "2 horas"}', '{"24", "8 horas"}', '{"48", "24 horas"}']) {
    assert.ok(fuente.includes(bueno), `falta la duración de Forever en el muestrario: ${bueno}`);
  }
  sinErrores(m);
});

test('desplegable: Escape en combate cierra la lista sin llamar a SetPropagateKeyboardInput', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local d = P.desplegable(CreateFrame("Frame", nil, UIParent), {ancho = 150, opciones = ${OPCIONES}, get = function() return "b" end, set = function() end})
    d:SetPoint("CENTER")
    d:Click()
    local lista = _G.SnetForeverDesplegableLista
    BANCO.cuenta = 0
    local clase = BANCO.clases.Frame.metodos
    local original = clase.SetPropagateKeyboardInput
    clase.SetPropagateKeyboardInput = function(self, v) BANCO.cuenta = BANCO.cuenta + 1; return original(self, v) end
    BANCO.jugador.enCombate = true
    BANCO.pulsarTecla("A")
    BANCO.pulsarTecla("ESCAPE")
    local enCombate = {BANCO.cuenta, lista:IsShown()}
    BANCO.jugador.enCombate = false
    d:Click()
    BANCO.pulsarTecla("ESCAPE")
    return {enCombate, BANCO.cuenta, lista:IsShown()}
  end)()`);
  assert.deepEqual(r[0], [0, false], 'en combate: ninguna llamada y la lista se cierra');
  assert.equal(r[1], 1, 'fuera de combate Escape sí la llama');
  assert.equal(r[2], false);
  sinErrores(m);
});

// Task 34: la explicación de cada campo sale al pasar el ratón por la caja, como en TSM. En la captura de TSM
// (tsm-tooltip-campo-puja.webp) el tooltip sale a la derecha de la fila del campo (que llega al borde derecho de la ventana,
// con su ayuda «Enter a value…» dentro) y con su borde de arriba a la altura de la caja. Las ayudas de Lua de estas pruebas:
// una ventana de 400 px y, dentro, una fila de 22 px que llega a su borde derecho (la caja va a su izquierda).
const FILA_AYUDA = `
    local P = SnetForever.Piezas
    local ventana = CreateFrame("Frame", nil, UIParent)
    ventana:SetSize(400, 200)
    ventana:SetPoint("CENTER")
    local fila = CreateFrame("Frame", nil, ventana)
    fila:SetPoint("TOPLEFT", ventana, "TOPLEFT", 10, -40)
    fila:SetPoint("TOPRIGHT", ventana, "TOPRIGHT", 0, -40)
    fila:SetHeight(22)
    local function setOwners() return #(BANCO.llamadas["GameTooltip:SetOwner"] or {}) end
    local function colores()
      local t = {}
      for i, d in ipairs(BANCO.detalleTooltip()) do t[i] = d.colorIzq end
      return t
    end`;

test('Piezas.ayuda enseña título y texto a la derecha del marco al entrar y lo esconde al salir, sin quitar los scripts que ya tenía', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${FILA_AYUDA}
    local b = CreateFrame("Button", nil, ventana)
    b:SetSize(100, 22)
    b:SetPoint("TOPLEFT", ventana, "TOPLEFT", 10, -10)
    local entradas, salidas = 0, 0
    b:SetScript("OnEnter", function() entradas = entradas + 1 end)
    b:SetScript("OnLeave", function() salidas = salidas + 1 end)
    P.ayuda(b, function() return "Título", "Lo que hace este campo, dicho con calma." end)
    b:GetScript("OnEnter")(b)
    local out = {}
    out.dentro = {GameTooltip:IsShown(), GameTooltip:GetOwner() == b, BANCO.lineasTooltip(), colores(), entradas}
    out.sitioMarco = {GameTooltip:GetLeft() - b:GetRight(), GameTooltip:GetTop() - b:GetTop()}
    b:GetScript("OnLeave")(b)
    out.fuera = {GameTooltip:IsShown(), salidas}
    -- Con ancla: a la derecha de la fila (el borde de la ventana) y arriba a la altura de la caja. Varias líneas de texto.
    local caja = CreateFrame("Button", nil, fila)
    caja:SetSize(150, 22)
    caja:SetPoint("TOPLEFT", fila, "TOPLEFT", 0, 0)
    P.ayuda(caja, function() return "Otro", {"Primera línea de la explicación.", "Va de 0 a 100"} end, {ancla = fila})
    caja:GetScript("OnEnter")(caja)
    out.conAncla = {BANCO.lineasTooltip(), GameTooltip:GetLeft() - ventana:GetRight(), GameTooltip:GetTop() - caja:GetTop(),
      GameTooltip:GetLeft() - caja:GetRight()}
    -- Al salir no esconde el tooltip si ya es de otro.
    local otro = CreateFrame("Frame", nil, UIParent)
    GameTooltip:SetOwner(otro, "ANCHOR_NONE")
    GameTooltip:Show()
    caja:GetScript("OnLeave")(caja)
    out.deOtro = {GameTooltip:IsShown(), GameTooltip:GetOwner() == otro}
    GameTooltip:Hide()
    -- fn sin nada: no sale nada. Tooltip prohibido: no se toca.
    local vacio = CreateFrame("Button", nil, ventana)
    vacio:SetSize(10, 10)
    vacio:SetPoint("CENTER")
    P.ayuda(vacio, function() return nil end)
    local n = setOwners()
    vacio:GetScript("OnEnter")(vacio)
    out.vacio = {GameTooltip:IsShown(), setOwners() - n}
    BANCO.tooltipProhibido = true
    n = setOwners()
    b:GetScript("OnEnter")(b)
    out.prohibido = {setOwners() - n, entradas}
    BANCO.tooltipProhibido = false
    return out
  end)()`);
  assert.deepEqual(r.dentro.slice(0, 3), [true, true, ['Título', 'Lo que hace este campo, dicho con calma.']]);
  assert.equal(aHex(r.dentro[3][0]), 'ffffff', 'el título en blanco');
  assert.equal(aHex(r.dentro[3][1]), 'cbbeb1', 'el texto en textoPestana');
  assert.equal(r.dentro[4], 1, 'el OnEnter que ya tenía se sigue llamando');
  assert.deepEqual(r.sitioMarco, [0, 0], 'sin ancla, a la derecha del propio marco y a su altura');
  assert.deepEqual(r.fuera, [false, 1], 'al salir se esconde y el OnLeave de antes se llama');
  assert.deepEqual(r.conAncla[0], ['Otro', 'Primera línea de la explicación.', 'Va de 0 a 100']);
  assert.equal(r.conAncla[1], 0, 'pegado al borde derecho de la fila (el de la ventana)');
  assert.equal(r.conAncla[2], 0, 'arriba, a la altura de la caja');
  assert.ok(r.conAncla[3] > 0, 'no encima de la caja');
  assert.deepEqual(r.deOtro, [true, true], 'no esconde el tooltip de otro');
  assert.deepEqual(r.vacio, [false, 0]);
  assert.deepEqual(r.prohibido, [0, 2], 'prohibido: no toca el tooltip, pero el OnEnter de antes sí se llama');
  sinErrores(m);
});

test('campo con ayuda y error: un solo tooltip con la explicación y el error en rojo; escribir sin cambiar el error no lo vuelve a pintar', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${FILA_AYUDA}
    local valor = "bien"
    local c = P.campo(fila, {ancho = 150, get = function() return valor end, set = function(v) valor = v end,
      validar = function(t) if string.find(t, "x") then return false, "No vale con x" end return true end,
      ayuda = function() return "Nombre del campo", "Para qué sirve el campo, en una frase." end, anclaAyuda = fila})
    c:SetPoint("TOPLEFT", fila, "TOPLEFT", 0, 0)
    local out = {}
    c:GetScript("OnEnter")(c)
    out.encima = {GameTooltip:IsShown(), GameTooltip:GetOwner() == c, BANCO.lineasTooltip(),
      GameTooltip:GetLeft() - ventana:GetRight(), GameTooltip:GetTop() - c:GetTop()}
    -- Escribe tres letras que dan el mismo error: el tooltip se pinta una vez, al salir el error.
    c:SetFocus()
    local n = setOwners()
    c:SetText("x")
    c:SetText("xx")
    c:SetText("xxx")
    out.escribir = {setOwners() - n, BANCO.lineasTooltip(), colores(), GameTooltip:IsShown(), GameTooltip:GetOwner() == c}
    -- Sin el ratón, el error sigue mientras se escribe; al quitarlo, se va.
    c:GetScript("OnLeave")(c)
    out.sinRaton = {GameTooltip:IsShown(), BANCO.lineasTooltip()}
    c:SetText("bueno")
    out.arreglado = GameTooltip:IsShown()
    -- Apagado, la ayuda sale igual.
    c:ClearFocus()
    c:ponerApagado(true)
    c:GetScript("OnEnter")(c)
    out.apagado = {GameTooltip:IsShown(), BANCO.lineasTooltip()}
    c:GetScript("OnLeave")(c)
    out.trasSalir = GameTooltip:IsShown()
    return out
  end)()`);
  assert.deepEqual(r.encima.slice(0, 3), [true, true, ['Nombre del campo', 'Para qué sirve el campo, en una frase.']]);
  assert.deepEqual(r.encima.slice(3), [0, 0], 'a la derecha de la fila, arriba a la altura de la caja');
  assert.equal(r.escribir[0], 1, 'tres letras con el mismo error: un solo SetOwner');
  assert.deepEqual(r.escribir[1], ['Nombre del campo', 'Para qué sirve el campo, en una frase.', 'No vale con x']);
  assert.equal(aHex(r.escribir[2][2]), m.lua('SnetForever.Tema.hex("error")'), 'el error, debajo y en rojo');
  assert.deepEqual(r.escribir.slice(3), [true, true], 'un solo tooltip, del campo');
  assert.deepEqual(r.sinRaton, [true, ['Nombre del campo', 'Para qué sirve el campo, en una frase.', 'No vale con x']]);
  assert.equal(r.arreglado, false, 'sin error y sin ratón no queda nada');
  assert.deepEqual(r.apagado, [true, ['Nombre del campo', 'Para qué sirve el campo, en una frase.']]);
  assert.equal(r.trasSalir, false);
  sinErrores(m);
});

test('desplegable con ayuda: sale al pasar por la caja y no con la lista abierta', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${FILA_AYUDA}
    local d = P.desplegable(fila, {ancho = 150, opciones = ${OPCIONES}, get = function() return "b" end, set = function() end,
      ayuda = function() return "Lista", "Qué se elige en esta lista y para qué." end, anclaAyuda = fila})
    d:SetPoint("TOPLEFT", fila, "TOPLEFT", 0, 0)
    local out = {}
    d:GetScript("OnEnter")(d)
    out.encima = {GameTooltip:IsShown(), GameTooltip:GetOwner() == d, BANCO.lineasTooltip(),
      GameTooltip:GetLeft() - ventana:GetRight(), GameTooltip:GetTop() - d:GetTop()}
    d:Click()
    out.alAbrir = {_G.SnetForeverDesplegableLista:IsShown(), GameTooltip:IsShown()}
    d:GetScript("OnLeave")(d)
    d:GetScript("OnEnter")(d)
    out.abierta = GameTooltip:IsShown()
    d:cerrar()
    d:GetScript("OnLeave")(d)
    d:ponerApagado(true)
    d:GetScript("OnEnter")(d)
    out.apagado = {GameTooltip:IsShown(), BANCO.lineasTooltip()}
    return out
  end)()`);
  assert.deepEqual(r.encima.slice(0, 3), [true, true, ['Lista', 'Qué se elige en esta lista y para qué.']]);
  assert.deepEqual(r.encima.slice(3), [0, 0]);
  assert.deepEqual(r.alAbrir, [true, false], 'al abrir la lista se va la ayuda');
  assert.equal(r.abierta, false, 'con la lista abierta no sale');
  assert.deepEqual(r.apagado, [true, ['Lista', 'Qué se elige en esta lista y para qué.']], 'apagado sale igual');
  sinErrores(m);
});

test('radio con ayuda: sale al pasar por Sí y por No', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${FILA_AYUDA}
    local rd = P.radio(fila, function() return true end, function() end,
      {ayuda = function() return "Interruptor", "Qué pasa con Sí y qué pasa con No." end, anclaAyuda = fila})
    rd:SetPoint("TOPLEFT", fila, "TOPLEFT", 0, 0)
    local out = {}
    for _, b in ipairs({rd.si, rd.no}) do
      b:GetScript("OnEnter")(b)
      out[#out + 1] = {GameTooltip:IsShown(), GameTooltip:GetOwner() == b, BANCO.lineasTooltip(),
        GameTooltip:GetLeft() - ventana:GetRight(), GameTooltip:GetTop() - rd:GetTop()}
      b:GetScript("OnLeave")(b)
      out[#out + 1] = GameTooltip:IsShown()
    end
    return out
  end)()`);
  for (const i of [0, 2]) {
    assert.deepEqual(r[i], [true, true, ['Interruptor', 'Qué pasa con Sí y qué pasa con No.'], 0, 0]);
    assert.equal(r[i + 1], false);
  }
  sinErrores(m);
});
