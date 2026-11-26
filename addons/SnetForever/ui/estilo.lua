-- Shared SnetForever surfaces and fonts. Forge is the default. Neutral offers a softer charcoal palette.
--
-- Estilo.color(token) reads the active palette, with Forge as the fallback.
-- Estilo.tarjeta(marco, token?)  pone fondo (WHITE8X8, color del token, por defecto «fondo», con el alfa de
--                           ventana.alfa) y borde de 1 px (token «borde») al marco, con texturas (sin plantillas).
--                           Devuelve la textura del fondo. Al cambiar ventana.tema o ventana.alfa se repintan todos
--                           los fondos y bordes puestos.
-- Estilo.fondo(marco)       = Estilo.tarjeta(marco, "fondo").
-- Estilo.pestana(padre, texto)   marco de pestaña (tarjeta fondoCabecera): .texto (FontString pequeño, color pestana)
--                           y .ponerTexto(t); su ancho es el del texto + 10.
-- Estilo.fuente(fs, tamano, role?, fallback?) applies the font for a Forge role when specified, with the usual shadow.
--                           Without a role the client font is used. Returns fs.
-- Estilo.TAMANOS            {titulo = 11, paso = 11, lista = 10, pequeno = 9}
-- Estilo.COMERCIO, comercio(token), aclarar(color, pct), letraComercio(fs, tipo)   tema oscuro y letras (11/13/16) de la
--                           ventana de comercio; Estilo.TEMAS no se toca.
-- Estilo.panelComercio(marco, token)   fondo OPACO con el color del token de comercio y borde de 1 px (token «linea»); la
--                           textura del fondo queda en marco.fondo. No sigue ventana.tema ni ventana.alfa.
-- Estilo.botonComercio(padre, texto, alPulsar), Estilo.casillaComercio(padre, texto, get, set),
-- Estilo.botonIconoComercio(padre, ruta, tamano, ayuda?, alPulsar?)   los controles de siempre (mismo uso y mismos campos que
--                           UI.boton, UI.casilla y UI.botonIcono; .refrescar() relee el texto) con el tema de comercio.
-- Estilo.COLOR_FONDO, COLOR_BORDE, COLOR_TEXTO, COLOR_SECUNDARIO   (compatibilidad) el color de ese token en el tema
--                           vigente en el momento de leerlo.
local _, SNF = ...
local Estilo = {}
SNF.Estilo = Estilo

Estilo.TAMANOS = {titulo = 11, paso = 11, lista = 10, pequeno = 9}
Estilo.TEXTURA = "Interface\\Buttons\\WHITE8X8"
Estilo.FORGE_PLATE = "Interface\\AddOns\\SnetForever\\recursos\\forge-plate"
Estilo.FORGE_CONTROLS = "Interface\\AddOns\\SnetForever\\recursos\\forge-controls"

-- «#RRGGBB» (sin la almohadilla) a {r, g, b, 1}.
local function hex(h)
  return {
    tonumber(string.sub(h, 1, 2), 16) / 255,
    tonumber(string.sub(h, 3, 4), 16) / 255,
    tonumber(string.sub(h, 5, 6), 16) / 255,
    1,
  }
end

Estilo.TEMAS = {
  forge = {
    fondo = hex("191717"), fondoLista = hex("24201F"), fondoCabecera = hex("302929"), resalte = hex("4C3025"),
    borde = hex("775744"), texto = hex("F5E8D4"), secundario = hex("CBBEB1"), pestana = hex("E6AC72"),
  },
  neutro = {
    fondo = hex("191919"), fondoLista = hex("242424"), fondoCabecera = hex("303030"), resalte = hex("443D37"),
    borde = hex("584C43"), texto = hex("F4EEE6"), secundario = hex("C5BEB5"), pestana = hex("D1B9A7"),
  },
}

local TEMA_POR_DEFECTO = "forge"

function Estilo.color(token)
  local tema = Estilo.TEMAS[SNF.Ajustes.get("ventana.tema")] or Estilo.TEMAS[TEMA_POR_DEFECTO]
  return tema[token] or Estilo.TEMAS[TEMA_POR_DEFECTO][token]
end

-- Los cuatro colores de antes siguen existiendo, ahora según el tema.
local ANTIGUOS = {COLOR_FONDO = "fondo", COLOR_BORDE = "borde", COLOR_TEXTO = "texto", COLOR_SECUNDARIO = "secundario"}
setmetatable(Estilo, {__index = function(_, clave)
  local token = ANTIGUOS[clave]
  if token then
    return Estilo.color(token)
  end
  return nil
end})

local RUTA_POR_DEFECTO = "Fonts\\FRIZQT__.TTF"
local FORGE_FONTS = "Interface\\AddOns\\SnetForever\\recursos\\fonts\\"
local FONT_ROLES = {
  heading = "AlegreyaSC-Bold.ttf",
  body = "BarlowSemiCondensed-Medium.ttf",
  control = "BarlowSemiCondensed-SemiBold.ttf",
}
local CLIENT_FONT_LOCALES = {ruRU = true, koKR = true, zhCN = true, zhTW = true}
local clientFontLocale = CLIENT_FONT_LOCALES[GetLocale()]

local function clientFont()
  return (GameFontNormal and GameFontNormal:GetFont()) or RUTA_POR_DEFECTO
end

local function inheritClientFont(fs)
  fs:SetFontObject(GameFontNormal)
end

-- Keep the client's font for locale scripts outside the Forge font families.
function Estilo.forgeFont(fs, role, size, fallback)
  local file = FONT_ROLES[role]
  if file and not clientFontLocale then
    local path = FORGE_FONTS .. file
    -- A client that has not indexed a new font yet may reject it on reload.
    local ok, loaded = pcall(fs.SetFont, fs, path, size, "")
    if ok and loaded ~= false then
      local current = fs:GetFont()
      if type(current) == "string" and current:gsub("/", "\\"):lower() == path:lower() then return end
    end
  end
  -- Some text regions start without a font. Inherit an available client font before sizing the fallback.
  if GameFontNormal then pcall(inheritClientFont, fs) end
  pcall(fs.SetFont, fs, (not clientFontLocale and fallback) or clientFont(), size, "")
end

local fondos = {} -- marcos con fondo puesto
local guidePlates = {}

local function alfa()
  return SNF.Ajustes.get("ventana.alfa")
end

local function pintar(marco)
  local c = Estilo.color(marco.snfToken)
  marco.snfFondo:SetVertexColor(c[1], c[2], c[3], alfa())
  local b = Estilo.color("borde")
  for _, t in ipairs(marco.snfBordes) do
    t:SetVertexColor(b[1], b[2], b[3], b[4])
  end
end

-- Un borde de 1 px: lado = "ARRIBA", "ABAJO", "IZQUIERDA" o "DERECHA".
local function borde(marco, lado)
  local t = marco:CreateTexture(nil, "BORDER")
  t:SetTexture(Estilo.TEXTURA)
  if lado == "ARRIBA" then
    t:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
    t:SetPoint("TOPRIGHT", marco, "TOPRIGHT", 0, 0)
    t:SetHeight(1)
  elseif lado == "ABAJO" then
    t:SetPoint("BOTTOMLEFT", marco, "BOTTOMLEFT", 0, 0)
    t:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", 0, 0)
    t:SetHeight(1)
  elseif lado == "IZQUIERDA" then
    t:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
    t:SetPoint("BOTTOMLEFT", marco, "BOTTOMLEFT", 0, 0)
    t:SetWidth(1)
  else
    t:SetPoint("TOPRIGHT", marco, "TOPRIGHT", 0, 0)
    t:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", 0, 0)
    t:SetWidth(1)
  end
  return t
end

function Estilo.tarjeta(marco, token)
  marco.snfToken = token or "fondo"
  if marco.snfFondo then
    pintar(marco)
    return marco.snfFondo
  end
  local t = marco:CreateTexture(nil, "BACKGROUND")
  t:SetTexture(Estilo.TEXTURA)
  t:SetAllPoints(marco)
  marco.snfFondo = t
  marco.snfBordes = {borde(marco, "ARRIBA"), borde(marco, "ABAJO"), borde(marco, "IZQUIERDA"), borde(marco, "DERECHA")}
  pintar(marco)
  fondos[#fondos + 1] = marco
  return t
end

function Estilo.fondo(marco)
  return Estilo.tarjeta(marco, "fondo")
end

-- The plate sits above the flat backing and below the frame's controls.
function Estilo.forgePlate(frame, opacity, followsGuideOpacity)
  local plate = frame:CreateTexture(nil, "BACKGROUND", nil, 6)
  plate:SetTexture(Estilo.FORGE_PLATE)
  plate:SetAllPoints(frame)
  opacity = opacity or 1
  if followsGuideOpacity then guidePlates[plate] = opacity end
  plate:SetVertexColor(1, 1, 1, opacity * (followsGuideOpacity and alfa() or 1))
  frame.snfForgePlate = plate
end

-- Small controls use a single copper bevel so their labels have a clear edge.
function Estilo.forgeTrim(frame)
  local trim = frame:CreateTexture(nil, "BORDER", nil, 1)
  trim:SetTexture(Estilo.TEXTURA)
  trim:SetPoint("TOPLEFT", frame, "TOPLEFT", 2, -1)
  trim:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -2, -1)
  trim:SetHeight(1)
  trim:SetVertexColor(0.68, 0.41, 0.24, 1)
end

local ALTO_PESTANA = 16
local MARGEN_PESTANA = 10 -- ancho de la pestaña = texto + 10

function Estilo.pestana(padre, texto)
  local marco = CreateFrame("Button", nil, padre)
  marco:EnableMouse(true)
  marco:SetHeight(ALTO_PESTANA)
  Estilo.tarjeta(marco, "fondoCabecera")
  local fs = marco:CreateFontString(nil, "OVERLAY")
  Estilo.fuente(fs, Estilo.TAMANOS.pequeno, "control")
  local c = Estilo.color("pestana")
  fs:SetTextColor(c[1], c[2], c[3], c[4])
  fs:SetPoint("CENTER", marco, "CENTER", 0, 0)
  marco.texto = fs
  marco.ponerTexto = function(nuevo)
    fs:SetText(nuevo or "")
    marco:SetWidth(fs:GetStringWidth() + MARGEN_PESTANA)
  end
  marco.ponerTexto(texto)
  return marco
end

function Estilo.fuente(fs, tamano, role, fallback)
  Estilo.forgeFont(fs, role, tamano or Estilo.TAMANOS.paso, fallback)
  fs:SetShadowOffset(1, -1)
  fs:SetShadowColor(0, 0, 0, 1)
  return fs
end

-- Tema y letras de la ventana de comercio (propios, aparte de TEMAS: el resto de ventanas sigue con TEMAS).
-- Iron surfaces with copper highlights. Market and warning colors keep their original meaning.
Estilo.COMERCIO = {
  fondo = hex("191717"), contenedor = hex("232122"), filas = hex("151415"), cabecera = hex("302929"),
  linea = hex("674B3C"), texto = hex("F5E8D4"), secundario = hex("B8AA9E"), acento = hex("DC9C64"),
  acentoTexto = hex("201510"), rojo = hex("E5484D"),
}

-- Una copia del color del token (así nadie cambia la paleta sin querer).
function Estilo.comercio(token)
  local c = Estilo.COMERCIO[token]
  return c and {c[1], c[2], c[3], c[4]} or nil
end

-- Suma pct/100 a cada canal de color (recortado a 1); el alfa no cambia.
function Estilo.aclarar(color, pct)
  local suma = pct / 100
  return {
    math.min(1, color[1] + suma), math.min(1, color[2] + suma), math.min(1, color[3] + suma), color[4] or 1,
  }
end

-- Legacy commerce labels use the same Forge fonts at their existing sizes.
local LETRAS_COMERCIO = {
  tabla = {"control", 11, "Fonts\\ARIALN.TTF"},
  texto = {"body", 13},
  titulo = {"heading", 16},
}

function Estilo.letraComercio(fs, tipo)
  local letra = LETRAS_COMERCIO[tipo] or LETRAS_COMERCIO.texto
  return Estilo.fuente(fs, letra[2], letra[1], letra[3])
end

-- Fondo liso y opaco de un marco con el color del token de comercio, más un borde de 1 px (token «linea»).
function Estilo.panelComercio(marco, token)
  local t = marco:CreateTexture(nil, "BACKGROUND")
  t:SetTexture(Estilo.TEXTURA)
  t:SetAllPoints(marco)
  local c = Estilo.comercio(token)
  t:SetVertexColor(c[1], c[2], c[3], 1)
  marco.fondo = t
  local b = Estilo.comercio("linea")
  local function lado(a1, a2, ancho, alto)
    local l = marco:CreateTexture(nil, "BORDER")
    l:SetTexture(Estilo.TEXTURA)
    l:SetPoint(a1, marco, a1, 0, 0)
    l:SetPoint(a2, marco, a2, 0, 0)
    if ancho then
      l:SetWidth(ancho)
    else
      l:SetHeight(alto)
    end
    l:SetVertexColor(b[1], b[2], b[3], 1)
  end
  lado("TOPLEFT", "TOPRIGHT", nil, 1)
  lado("BOTTOMLEFT", "BOTTOMRIGHT", nil, 1)
  lado("TOPLEFT", "BOTTOMLEFT", 1)
  lado("TOPRIGHT", "BOTTOMRIGHT", 1)
  if token == "fondo" then Estilo.forgePlate(marco, 0.82) end
  return t
end

local function resolverTexto(texto)
  if type(texto) == "function" then
    return texto()
  end
  return texto
end

-- Un texto con la letra de siempre de los controles (tamaño de TAMANOS) y el color de texto de comercio.
local function textoComercio(padre, tamano, justificado)
  local fs = padre:CreateFontString(nil, "OVERLAY")
  Estilo.fuente(fs, tamano, "control")
  fs:SetJustifyH(justificado or "LEFT")
  fs:SetWordWrap(false)
  local c = Estilo.COMERCIO.texto
  fs:SetTextColor(c[1], c[2], c[3], 1)
  return fs
end

-- Botón liso del tema de comercio: fondo «cabecera» con borde, que se aclara un 5 % con el ratón encima si se puede pulsar.
function Estilo.botonComercio(padre, texto, alPulsar)
  local boton = CreateFrame("Button", nil, padre)
  boton:SetSize(90, 22)
  boton:EnableMouse(true)
  Estilo.panelComercio(boton, "cabecera")
  Estilo.forgeTrim(boton)
  boton.texto = textoComercio(boton, Estilo.TAMANOS.paso, "CENTER")
  boton.texto:SetPoint("CENTER", boton, "CENTER", 0, 0)
  boton:SetScript("OnClick", function(self)
    if alPulsar then
      alPulsar(self)
    end
  end)
  boton:SetScript("OnEnter", function(self)
    if self:IsEnabled() then
      local a = Estilo.aclarar(Estilo.comercio("cabecera"), 5)
      self.fondo:SetVertexColor(a[1], a[2], a[3], 1)
    end
  end)
  boton:SetScript("OnLeave", function(self)
    local c = Estilo.comercio("cabecera")
    self.fondo:SetVertexColor(c[1], c[2], c[3], 1)
  end)
  boton.refrescar = function()
    boton.texto:SetText(resolverTexto(texto) or "")
  end
  boton.refrescar()
  return boton
end

-- Casilla del tema de comercio: un cuadrado oscuro con borde y la marca en el color de acento.
function Estilo.casillaComercio(padre, texto, get, set)
  local casilla = CreateFrame("Button", nil, padre)
  casilla:SetSize(220, 20)
  casilla:EnableMouse(true)
  local caja = CreateFrame("Frame", nil, casilla)
  caja:SetSize(14, 14)
  caja:SetPoint("LEFT", casilla, "LEFT", 0, 0)
  Estilo.panelComercio(caja, "filas")
  Estilo.forgeTrim(caja)
  local marca = caja:CreateTexture(nil, "OVERLAY")
  marca:SetTexture("Interface\\Buttons\\UI-CheckBox-Check")
  marca:SetAllPoints(caja)
  local acento = Estilo.COMERCIO.acento
  marca:SetVertexColor(acento[1], acento[2], acento[3], 1)
  casilla.marca = marca
  casilla.texto = textoComercio(casilla, Estilo.TAMANOS.lista, "LEFT")
  casilla.texto:SetPoint("LEFT", caja, "RIGHT", 6, 0)
  casilla.refrescar = function()
    marca:SetShown(get() and true or false)
    casilla.texto:SetText(resolverTexto(texto) or "")
  end
  casilla:SetScript("OnClick", function()
    set(not get())
    casilla.refrescar()
  end)
  casilla.refrescar()
  return casilla
end

-- Botón cuadrado con un icono del tema de comercio (fondo «cabecera» con borde, resalte blanco suave, ayuda con GameTooltip).
function Estilo.botonIconoComercio(padre, ruta, tamano, ayuda, alPulsar)
  local boton = CreateFrame("Button", nil, padre)
  boton:SetSize(tamano, tamano)
  boton:EnableMouse(true)
  Estilo.panelComercio(boton, "cabecera")
  local icono = boton:CreateTexture(nil, "ARTWORK")
  icono:SetTexture(ruta)
  icono:SetPoint("TOPLEFT", boton, "TOPLEFT", 1, -1)
  icono:SetPoint("BOTTOMRIGHT", boton, "BOTTOMRIGHT", -1, 1)
  icono:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  boton.icono = icono
  boton:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
  local resalte = boton:GetHighlightTexture()
  resalte:SetAllPoints(boton)
  resalte:SetVertexColor(1, 1, 1, 0.25)
  boton:SetScript("OnClick", function(self)
    if alPulsar then
      alPulsar(self)
    end
  end)
  if ayuda then
    boton:SetScript("OnEnter", function(self)
      if not GameTooltip or GameTooltip:IsForbidden() then
        return
      end
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetText(resolverTexto(ayuda) or "")
      GameTooltip:Show()
    end)
    boton:SetScript("OnLeave", function()
      if GameTooltip and not GameTooltip:IsForbidden() then
        GameTooltip:Hide()
      end
    end)
  end
  return boton
end

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "ventana.alfa" or clave == "ventana.tema" then
    for _, marco in ipairs(fondos) do
      pintar(marco)
    end
  end
  if clave == "ventana.alfa" then
    for plate, opacity in pairs(guidePlates) do
      plate:SetVertexColor(1, 1, 1, opacity * alfa())
    end
  end
end)
