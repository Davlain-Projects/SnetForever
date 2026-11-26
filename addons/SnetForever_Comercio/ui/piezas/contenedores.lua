-- SnetForever: piezas de la ventana principal (parte 1): título de sección, tarjeta, pestañas secundarias y zona con
-- desplazamiento fino, con el aspecto de TSM.
--
-- Amplía SNF.Piezas (lo crea ui/piezas/botones.lua, que va antes en el .toc).
--
-- Piezas.titulo(padre, titulo, descripcion?) -> marco, alto
--                  Título en Bold blanco y, debajo, la descripción en gris, que se ajusta en tantas líneas como haga falta.
--                  El alto depende del ancho: el que devuelve al crearse es el de una sola línea (o el real, si el marco ya
--                  tiene ancho). Cuando el ancho se conoce hay que darlo con :ponerAncho(w) (o con SetWidth/OnSizeChanged: el
--                  marco se recalcula solo) y entonces colocar lo de debajo con marco:GetHeight(), no con el alto devuelto.
--                  Sin descripción, el alto es siempre el del título. Métodos: :ponerAncho(w). Partes: .titulo y
--                  .descripcion (nil si no se pidió).
-- Piezas.tarjeta(padre, {ancho?}) -> marco
--                  Marco con el fondo secundario y las esquinas redondeadas. El alto lo pone quien la usa.
-- Piezas.pestanas(padre, {nombres, elegida = 1, alElegir = fn?}) -> marco
--                  Contenedor secundario con una pestaña por nombre, todas del mismo ancho y repartidas por todo el ancho del
--                  contenedor (si cambia de ancho se recolocan, y también al enseñarse). La elegida lleva el fondo pestanaElegida y el texto en acento;
--                  el resto, sin fondo y con el texto gris claro (textoPestana). Pulsar una que no está elegida la elige y llama a
--                  alElegir(indice, nombre). Elegir la que ya lo está no avisa. Métodos: :elegir(indice o nombre) (sin llamar
--                  a alElegir) y :elegida() (el índice). Partes: .pestanas (los botones; cada uno con .texto).
-- Piezas.desplazable(padre) -> marco, contenido
--                  Zona con desplazamiento vertical: el marco recorta y el contenido es donde se pone todo. La rueda desplaza
--                  22 px (una fila) por muesca, sin pasar del principio ni del final, y llega aquí esté donde esté el cursor
--                  sobre la zona. A la derecha sale una barra fina de 4 px (la misma del desplegable), que se esconde si todo
--                  cabe. Sin plantillas de Blizzard. El contenido siempre mide el ancho de la zona; el alto se pone con
--                  :ponerAlto(alto). Partes: .contenido, .barra (la textura) y .marcoBarra (el marco que la lleva, por encima
--                  del contenido y sin desplazarse con él).
--
-- Ventanas con cabecera (la ventana principal y la de la subasta comparten estas piezas y medidas):
-- Piezas.CABECERA  las medidas, en píxeles reales: alto 38, margen 12, separación entre pestañas 16, icono 22, logo 20,
--                  pestañas 16, oro 12, X 12 y asa 16.
-- Piezas.escalaReal(marco)   pone el SetScale para que una unidad del marco sea un píxel de la pantalla (escala efectiva =
--                  768 / alto físico; sin GetPhysicalScreenSize, 1080), sea cual sea la escala de interfaz.
-- Piezas.pantallaDe(marco) -> ancho, alto   la pantalla entera, en unidades del marco.
-- Piezas.sitioDe(marco) -> {x, y, ancho, alto} | nil   la esquina de arriba a la izquierda medida desde la de la pantalla
--                  (y hacia abajo) y el tamaño, redondeados y en unidades del marco; nil si aún no tiene sitio.
-- Piezas.cabeceraVentana(marco, {nombres, texto = fn(nombre), elegida = fn(), alElegir = fn(nombre), alCerrar = fn,
--                  alEntrar = fn(nombre, boton)?, alSalir = fn(nombre, boton)?}) -> cab
--                  la cabecera de 38 px arriba y a todo lo ancho: el icono y «SnetForever» a la izquierda, una pestaña por
--                  nombre (16 px en negrita, 16 px entre ellas, la elegida en acento y sin fondo) y la X sin fondo a la
--                  derecha. Al pasar el ratón por una pestaña que no es la elegida, el texto se aclara. Métodos: :pintar()
--                  (colores según elegida()) y :ponerTextos() (con texto(nombre)). Partes: .icono, .logo, .pestanas
--                  (nombre -> Button con .texto) y .cerrar. El arrastre lo pone quien la usa.
-- Piezas.asaVentana(marco, {empezar = fn() -> bool?, soltar = fn()}) -> asa
--                  el asa de abajo a la derecha. Con el botón izquierdo llama a empezar (si devuelve false no hace nada) y
--                  estira el marco desde abajo a la derecha; al soltar lo para y llama a soltar. Campo .estirando.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
SNF.Piezas = SNF.Piezas or {}
local Piezas = SNF.Piezas
local Tema = SNF.Tema

local proteger = Piezas.proteger
local colorTexto = Piezas.interno.colorTexto
local plana = Piezas.interno.plana
local botonBase = Piezas.interno.botonBase
local ponerBarra = Piezas.interno.ponerBarra

---------------------------------------------------------------------------------------------------
-- Título de sección
---------------------------------------------------------------------------------------------------

local ALTO_TITULO = 16
local SEPARACION_DESCRIPCION = 4

function Piezas.puntoEstado(parent, size, extraNotices)
  local point = CreateFrame("Button", nil, parent)
  point:SetSize(size, size)
  point.icono = point:CreateTexture(nil, "ARTWORK")
  point.icono:SetAllPoints(point)
  Tema.icono(point.icono, "circulo")
  local bar = plana(point, "OVERLAY", 1)
  bar:SetSize(2, 5)
  bar:SetPoint("TOP", point, "TOP", 0, -2)
  local dot = plana(point, "OVERLAY", 1)
  dot:SetSize(2, 2)
  dot:SetPoint("BOTTOM", point, "BOTTOM", 0, 2)
  point.signo = {bar, dot}
  local lastColor, lastAlert, nextUpdate
  function point:refresh()
    local state = SNF.EstadoComercio.current()
    if state.color ~= lastColor then
      lastColor = state.color
      self.icono:SetVertexColor(unpack(Tema.color(lastColor)))
    end
    local notices = extraNotices and extraNotices()
    local alert = state.warning or (notices and #notices > 0) or false
    if alert ~= lastAlert then
      lastAlert = alert
      for _, mark in ipairs(self.signo) do
        mark:SetShown(alert)
      end
    end
  end
  point:SetScript("OnShow", proteger(function(self)
    self:refresh()
  end))
  point:SetScript("OnUpdate", function(self)
    local now = GetTime()
    if not nextUpdate or now >= nextUpdate then
      nextUpdate = now + 1
      self:refresh()
    end
  end)
  Piezas.ayuda(point, function()
    if point:GetAlpha() == 0 then return end
    local lines, seen = {}, {}
    for _, source in ipairs({SNF.EstadoComercio.current().lines, extraNotices and extraNotices() or {}}) do
      for _, line in ipairs(source) do
        if not seen[line] then
          lines[#lines + 1], seen[line] = line, true
        end
      end
    end
    return SNF.L.t("COMMERCE_STATUS_TITLE"), lines
  end)
  point:refresh()
  return point
end

function Piezas.titulo(padre, titulo, descripcion)
  local marco = CreateFrame("Frame", nil, padre)
  local t = Tema.letra(marco:CreateFontString(nil, "OVERLAY"), "titulo")
  colorTexto(t, "texto")
  t:SetJustifyH("LEFT")
  t:SetWordWrap(false)
  t:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  t:SetPoint("TOPRIGHT", marco, "TOPRIGHT", 0, 0)
  t:SetHeight(ALTO_TITULO)
  t:SetText(titulo or "")
  marco.titulo = t
  local alto = ALTO_TITULO
  if descripcion then
    local d = Tema.letra(marco:CreateFontString(nil, "OVERLAY"), "texto")
    colorTexto(d, "apagado")
    d:SetJustifyH("LEFT")
    d:SetWordWrap(true)
    d:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, -(ALTO_TITULO + SEPARACION_DESCRIPCION))
    d:SetText(descripcion)
    marco.descripcion = d
  end
  -- El ancho de la descripción es el del marco (solo con un punto de anclaje, para poder darle ancho propio).
  local function ajustar(ancho)
    if not marco.descripcion then
      marco:SetHeight(ALTO_TITULO)
      return
    end
    if ancho and ancho > 0 then
      marco.descripcion:SetWidth(ancho)
    end
    marco:SetHeight(ALTO_TITULO + SEPARACION_DESCRIPCION + marco.descripcion:GetStringHeight())
  end
  function marco:ponerAncho(ancho)
    self:SetWidth(ancho)
    ajustar(ancho)
  end
  marco:SetScript("OnSizeChanged", proteger(function(_, ancho)
    ajustar(ancho)
  end))
  ajustar(marco:GetWidth())
  return marco, marco:GetHeight()
end

---------------------------------------------------------------------------------------------------
-- Tarjeta
---------------------------------------------------------------------------------------------------

function Piezas.tarjeta(padre, opciones)
  opciones = opciones or {}
  local marco = CreateFrame("Frame", nil, padre)
  Tema.panel(marco, "secundario")
  if opciones.ancho then
    marco:SetWidth(opciones.ancho)
  end
  return marco
end

---------------------------------------------------------------------------------------------------
-- Pestañas secundarias
---------------------------------------------------------------------------------------------------

local ALTO_PESTANA = 28

-- El fondo de la pestaña elegida (con esquinas): se crea la primera vez que hace falta y después se enseña o se esconde.
local function fondoPestana(b, visible)
  if visible then
    Tema.panel(b, "pestanaElegida")
    for _, t in ipairs(b.snfTema.fondoPleno) do
      t:Show()
    end
  elseif b.snfTema then
    for _, t in ipairs(b.snfTema.fondoPleno) do
      t:Hide()
    end
  end
end

local function pintarPestanas(c)
  for i, b in ipairs(c.pestanas) do
    local elegida = i == c.snfElegida
    fondoPestana(b, elegida)
    colorTexto(b.texto, elegida and "acento" or "textoPestana")
  end
end

-- Reparte el ancho a partes iguales entre las pestañas, sin huecos.
local function colocarPestanas(c, ancho)
  local n = #c.pestanas
  if n == 0 or not ancho or ancho <= 0 then
    return
  end
  -- Píxeles enteros: todas miden lo mismo redondeado y la última se queda con el resto, para sumar el ancho exacto.
  local w = math.floor(ancho / n + 0.5)
  for i, b in ipairs(c.pestanas) do
    b:ClearAllPoints()
    b:SetPoint("TOPLEFT", c, "TOPLEFT", (i - 1) * w, 0)
    b:SetSize(i == n and ancho - (n - 1) * w or w, ALTO_PESTANA)
  end
end

function Piezas.pestanas(padre, opciones)
  opciones = opciones or {}
  local nombres = opciones.nombres or {}
  local alElegir = opciones.alElegir
  local c = CreateFrame("Frame", nil, padre)
  c:SetHeight(ALTO_PESTANA)
  Tema.panel(c, "secundario")
  c.pestanas = {}
  c.snfElegida = 1

  function c:elegida()
    return self.snfElegida
  end
  -- Elige por índice o por nombre, sin llamar a alElegir (eso es solo cuando pulsa el jugador).
  function c:elegir(cual)
    local i = cual
    if type(cual) == "string" then
      i = nil
      for k, nombre in ipairs(nombres) do
        if nombre == cual then
          i = k
          break
        end
      end
    end
    if type(i) ~= "number" or not self.pestanas[i] then
      return
    end
    self.snfElegida = i
    pintarPestanas(self)
  end

  for i, nombre in ipairs(nombres) do
    local b = botonBase(c, function()
      if c.snfElegida == i then
        return
      end
      c:elegir(i)
      if alElegir then
        alElegir(i, nombre)
      end
    end)
    local fs = Tema.letra(b:CreateFontString(nil, "OVERLAY"), "pestana")
    fs:SetPoint("LEFT", b, "LEFT", 4, 0)
    fs:SetPoint("RIGHT", b, "RIGHT", -4, 0)
    fs:SetJustifyH("CENTER")
    fs:SetWordWrap(false)
    fs:SetText(nombre)
    b.texto = fs
    c.pestanas[i] = b
  end
  c:elegir(opciones.elegida or 1)
  pintarPestanas(c)

  c:SetScript("OnSizeChanged", proteger(function(self, ancho)
    colocarPestanas(self, ancho)
  end))
  -- Task 22: unas pestañas creadas escondidas (las de Subasta en el editor de operaciones) pueden no recibir OnSizeChanged
  -- al enseñarse si su tamaño no cambia: se recolocan también al enseñarse.
  c:SetScript("OnShow", proteger(function(self)
    colocarPestanas(self, self:GetWidth())
  end))
  colocarPestanas(c, c:GetWidth())
  return c
end

---------------------------------------------------------------------------------------------------
-- Zona con desplazamiento fino
---------------------------------------------------------------------------------------------------

local PASO_RUEDA = 22 -- una fila por muesca
local NIVEL_BARRA = 30 -- sobre el contenido (sus marcos hijos tienen niveles bajos)

-- Pone el desplazamiento dentro de [0, recorrido] y la barra a la medida de lo que se ve. Se llama al cambiar el tamaño,
-- el alto del contenido o el desplazamiento.
local function refrescarZona(z)
  local alto, total = z:GetHeight(), z.contenido:GetHeight()
  local recorrido = math.max(0, total - alto)
  local y = math.max(0, math.min(recorrido, z:GetVerticalScroll()))
  if y ~= z:GetVerticalScroll() then
    z:SetVerticalScroll(y)
  end
  if alto <= 0 then
    z.barra:Hide() -- una zona sin alto no enseña barra
    return
  end
  ponerBarra(z.barra, z.marcoBarra, alto, 0, alto, total, y)
end

function Piezas.desplazable(padre)
  local z = CreateFrame("ScrollFrame", nil, padre)
  local contenido = CreateFrame("Frame", nil, z)
  contenido:SetSize(1, 1)
  z:SetScrollChild(contenido)
  z.contenido = contenido
  z:EnableMouseWheel(true)

  -- La barra va en un marco aparte por encima del contenido: no se desplaza con él y nada de dentro la tapa.
  local marcoBarra = CreateFrame("Frame", nil, z)
  marcoBarra:SetAllPoints(z)
  marcoBarra:SetFrameLevel(z:GetFrameLevel() + NIVEL_BARRA)
  z.marcoBarra = marcoBarra
  z.barra = plana(marcoBarra, "OVERLAY", 0)
  Piezas.interno.pintar(z.barra, "apagado")
  z.barra:SetWidth(Piezas.interno.ANCHO_BARRA)
  z.barra:Hide()

  function z:ponerAlto(alto)
    self.contenido:SetHeight(alto)
    refrescarZona(self)
  end

  z:SetScript("OnMouseWheel", proteger(function(self, delta)
    local nuevo = self:GetVerticalScroll() - (delta > 0 and 1 or -1) * PASO_RUEDA
    local recorrido = math.max(0, self.contenido:GetHeight() - self:GetHeight())
    self:SetVerticalScroll(math.max(0, math.min(recorrido, nuevo)))
    refrescarZona(self)
  end))
  z:SetScript("OnSizeChanged", proteger(function(self, ancho)
    self.contenido:SetWidth(ancho)
    refrescarZona(self)
  end))
  return z, contenido
end

---------------------------------------------------------------------------------------------------
-- Ventanas con cabecera
---------------------------------------------------------------------------------------------------

local ICONO_ADDON = "Interface\\AddOns\\SnetForever\\recursos\\icono"
local ALTO_PANTALLA_POR_DEFECTO = 1080 -- si el cliente no tiene GetPhysicalScreenSize (como ia/franja.lua y ui/chat.lua)

Piezas.CABECERA = {
  alto = 38, margen = 12, separacion = 16, icono = 22, logo = 20, pestana = 16, oro = 12, cerrar = 12, asa = 16,
}
local CABECERA = Piezas.CABECERA

-- UIParent mide 768 de alto en unidades absolutas, así que la escala efectiva buscada es 768 / alto físico; el SetScale se
-- la pide relativa a UIParent.
local function altoFisico()
  local f = rawget(_G, "GetPhysicalScreenSize")
  if type(f) == "function" then
    local _, alto = f()
    if type(alto) == "number" and alto > 0 then
      return alto
    end
  end
  return ALTO_PANTALLA_POR_DEFECTO
end

function Piezas.escalaReal(marco)
  local u = UIParent:GetEffectiveScale()
  if not (type(u) == "number" and u > 0) then
    u = 1
  end
  SNF.WindowSizing.base(marco, (768 / altoFisico()) / u)
end

function Piezas.pantallaDe(marco)
  local f = marco:GetEffectiveScale()
  local u = UIParent:GetEffectiveScale()
  return (UIParent:GetRight() or 0) * u / f, (UIParent:GetTop() or 0) * u / f
end

local function redondear(v)
  return math.floor(v + 0.5)
end

function Piezas.sitioDe(marco)
  local f = marco:GetEffectiveScale()
  local u = UIParent:GetEffectiveScale()
  local izq, arr = marco:GetLeft(), marco:GetTop()
  if not (izq and arr) then
    return nil
  end
  local x = izq - (UIParent:GetLeft() or 0) * u / f
  local y = ((UIParent:GetTop() or 0) * u - arr * f) / f
  return {x = redondear(x), y = redondear(y), ancho = redondear(marco:GetWidth()), alto = redondear(marco:GetHeight())}
end

local function crearPestanaCabecera(cab, nombre, anterior, o)
  local b = CreateFrame("Button", nil, cab)
  b:RegisterForClicks("LeftButtonUp")
  -- Sin ancho propio: el texto se coloca detrás del anterior (o del logo) con la separación fija y el botón abraza al texto,
  -- así el hueco es el mismo con cualquier letra y no depende de haber medido el texto al crearlo (GetStringWidth).
  local fs = Tema.letra(b:CreateFontString(nil, "OVERLAY"), "pestana", CABECERA.pestana)
  if anterior then
    fs:SetPoint("LEFT", anterior.texto, "RIGHT", CABECERA.separacion, 0)
  else
    fs:SetPoint("LEFT", cab.logo, "RIGHT", CABECERA.separacion + 8, 0)
  end
  fs:SetText(o.texto(nombre))
  colorTexto(fs, "textoPestana")
  b.texto = fs
  b:SetPoint("TOPLEFT", fs, "TOPLEFT", 0, 10)
  b:SetPoint("BOTTOMRIGHT", fs, "BOTTOMRIGHT", 0, -10)
  b:SetScript("OnClick", proteger(function()
    o.alElegir(nombre)
  end))
  -- Al pasar el ratón por una pestaña que no es la elegida, el texto se aclara.
  b:SetScript("OnEnter", proteger(function(self)
    if o.elegida() ~= nombre then
      colorTexto(fs, "texto")
    end
    if o.alEntrar then
      o.alEntrar(nombre, self)
    end
  end))
  b:SetScript("OnLeave", proteger(function(self)
    cab:pintar()
    if o.alSalir then
      o.alSalir(nombre, self)
    end
  end))
  return b
end

function Piezas.cabeceraVentana(marco, o)
  local cab = CreateFrame("Frame", nil, marco)
  cab:SetHeight(CABECERA.alto)
  cab:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  cab:SetPoint("TOPRIGHT", marco, "TOPRIGHT", 0, 0)
  cab:EnableMouse(true)
  SNF.Estilo.forgeTrim(cab)

  local icono = cab:CreateTexture(nil, "ARTWORK")
  icono:SetTexture(ICONO_ADDON)
  icono:SetSize(CABECERA.icono, CABECERA.icono)
  icono:SetPoint("LEFT", cab, "LEFT", CABECERA.margen, 0)
  cab.icono = icono
  local logo = Tema.letra(cab:CreateFontString(nil, "OVERLAY"), "logo", CABECERA.logo)
  logo:SetPoint("LEFT", icono, "RIGHT", 8, 0)
  logo:SetJustifyH("LEFT")
  logo:SetText("SnetForever")
  colorTexto(logo, "texto")
  cab.logo = logo

  function cab:pintar()
    local elegida = o.elegida()
    for _, nombre in ipairs(o.nombres) do
      local b = self.pestanas[nombre]
      if b then
        colorTexto(b.texto, nombre == elegida and "acento" or "textoPestana")
      end
    end
  end

  -- Pone el texto de cada pestaña en el idioma de ahora. No fija ningún ancho: cada pestaña y el hueco hasta la siguiente
  -- siguen al texto por anclajes, así que se ajustan solos aunque la letra propia tarde en cargarse.
  function cab:ponerTextos()
    for _, nombre in ipairs(o.nombres) do
      local b = self.pestanas[nombre]
      if b then
        b.texto:SetText(o.texto(nombre))
      end
    end
  end

  cab.pestanas = {}
  local anterior
  for _, nombre in ipairs(o.nombres) do
    anterior = crearPestanaCabecera(cab, nombre, anterior, o)
    cab.pestanas[nombre] = anterior
  end

  local cerrar = Piezas.botonIcono(cab, "cerrar", function()
    o.alCerrar()
  end, {tamano = CABECERA.cerrar, color = "texto"})
  Piezas.ayuda(cerrar, Piezas.ayudaDe("PIEZAS_AYUDA_CERRAR"))
  cerrar:SetPoint("RIGHT", cab, "RIGHT", -CABECERA.margen, 0)
  cab.cerrar = cerrar
  cab:pintar()
  return cab
end

local function clampTabSize(value, low, high)
  return math.max(low, math.min(value, high))
end

function Piezas.resizableTabs(window, cab, names, settingsKey, reservedWidth, getScale, onResize)
  local function layoutTabs()
    local width = window:GetWidth()
    if width <= 0 or window:GetHeight() <= 0 then return end
    local font = math.floor(CABECERA.pestana * getScale() + 0.5)
    local sizes = SnetForeverCuenta.comercio[settingsKey]
    local extra = width - CABECERA.margen * 2 - CABECERA.icono - cab.logo:GetStringWidth()
      - CABECERA.separacion * #names - 16 - CABECERA.cerrar
      - reservedWidth()
    for _, name in ipairs(names) do
      local tab = cab.pestanas[name]
      if tab.fontSize ~= font then
        Tema.letra(tab.texto, "pestana", font)
        tab.fontSize = font
      end
      extra = extra - tab.texto:GetStringWidth()
    end
    extra = math.max(0, extra)
    local rowHeight = CABECERA.alto
    local previous
    for _, name in ipairs(names) do
      local tab = cab.pestanas[name]
      local label = tab.texto
      local saved = tab.previewSize or (type(sizes) == "table" and sizes[name])
      local natural = label:GetStringWidth()
      local padding, tabHeight = 0, CABECERA.alto
      if type(saved) == "table" and type(saved.width) == "number" and saved.width == saved.width
        and type(saved.height) == "number" and saved.height == saved.height then
        padding = clampTabSize(saved.width - natural, 0, extra)
        extra = extra - padding
        tabHeight = clampTabSize(saved.height, font + 8, 72)
      end
      tab.layoutWidth, tab.layoutHeight = natural + padding, tabHeight
      rowHeight = math.max(rowHeight, tabHeight)
      label:ClearAllPoints()
      label:SetPoint("LEFT", previous and previous.texto or cab.logo, "RIGHT",
        CABECERA.separacion + (previous and previous.extraWidth or 8), 0)
      tab.extraWidth = padding
      local vertical = (tabHeight - label:GetStringHeight()) / 2
      tab:ClearAllPoints()
      tab:SetPoint("TOPLEFT", label, "TOPLEFT", 0, vertical)
      tab:SetPoint("BOTTOMRIGHT", label, "BOTTOMRIGHT", padding, -vertical)
      previous = tab
    end
    cab:SetHeight(rowHeight)
  end

  local function installTabGrip(tab, name)
    local grip = CreateFrame("Frame", nil, tab)
    tab.resizeGrip = grip
    grip:SetSize(10, 10)
    grip:SetPoint("BOTTOMRIGHT", tab, "BOTTOMRIGHT", 0, 0)
    grip:EnableMouse(true)
    local mark = grip:CreateTexture(nil, "ARTWORK")
    mark:SetAllPoints(grip)
    Tema.icono(mark, "asa")
    Piezas.ayuda(grip, Piezas.ayudaDe("AUCTION_TAB_RESIZE"))
    local startX, startY, width, height, lastX, lastY
    local function update()
      local x, y = GetCursorPosition()
      if x == lastX and y == lastY then return end
      lastX, lastY = x, y
      local scale = window:GetEffectiveScale()
      tab.previewSize = {
        width = clampTabSize(width + (x - startX) / scale, 1, window:GetWidth()),
        height = clampTabSize(height + (startY - y) / scale, 24, 72),
      }
      layoutTabs()
      if onResize then onResize() end
    end
    local function stop()
      startX, lastX, lastY, tab.previewSize = nil, nil, nil, nil
      grip:SetScript("OnUpdate", nil)
    end
    grip:SetScript("OnMouseDown", Piezas.proteger(function(_, button)
      if button ~= "LeftButton" then return end
      layoutTabs()
      if not tab.layoutWidth then return end
      startX, startY = GetCursorPosition()
      width, height = tab.layoutWidth, tab.layoutHeight
      grip:SetScript("OnUpdate", update)
    end))
    grip:SetScript("OnMouseUp", Piezas.proteger(function(_, button)
      if button ~= "LeftButton" or not startX then return end
      update()
      local c = SnetForeverCuenta.comercio
      if type(c[settingsKey]) ~= "table" then c[settingsKey] = {} end
      c[settingsKey][name] = {width = tab.layoutWidth, height = tab.layoutHeight}
      stop()
    end))
    grip:SetScript("OnHide", function()
      if startX then stop(); layoutTabs() end
    end)
  end
  for _, name in ipairs(names) do installTabGrip(cab.pestanas[name], name) end
  window:HookScript("OnSizeChanged", Piezas.proteger(layoutTabs))
  layoutTabs()
  return layoutTabs
end

-- El asa, dibujada con seis cuadraditos en escalera (la letra del juego no tiene el signo del triángulo).
function Piezas.asaVentana(marco, o)
  o = o or {}
  local asa = CreateFrame("Frame", nil, marco)
  asa:SetSize(CABECERA.asa, CABECERA.asa)
  asa:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", -2, 2)
  asa:SetFrameLevel(marco:GetFrameLevel() + 20)
  asa:EnableMouse(true)
  local c = Tema.color("apagado")
  local lado = 3
  for fila = 0, 2 do
    for col = fila, 2 do
      local t = plana(asa, "OVERLAY")
      t:SetVertexColor(c[1], c[2], c[3], c[4])
      t:SetSize(lado, lado)
      t:SetPoint("BOTTOMRIGHT", asa, "BOTTOMRIGHT", -(2 - col) * (lado + 1) - 2, fila * (lado + 1) + 2)
    end
  end
  asa:SetScript("OnMouseDown", proteger(function(_, boton)
    if boton ~= "LeftButton" or asa.estirando then
      return
    end
    if o.empezar and o.empezar() == false then
      return
    end
    marco:StartSizing("BOTTOMRIGHT")
    asa.estirando = true
  end))
  asa:SetScript("OnMouseUp", proteger(function()
    if asa.estirando then
      asa.estirando = false
      marco:StopMovingOrSizing()
      marco:SetUserPlaced(false) -- el sitio lo guarda el addon, no el cliente
      if o.soltar then
        o.soltar()
      end
    end
  end))
  Piezas.ayuda(asa, Piezas.ayudaDe("PIEZAS_AYUDA_ESTIRAR"))
  return asa
end
