-- SnetForever: la ventana principal de comercio (parte 1). Es una ventana propia, como la de TSM, que no depende de la
-- subasta: hija de UIParent, sin borde, con una cabecera de 38 px (logo, cinco pestañas, el oro del personaje y la X) y debajo
-- la página de la pestaña elegida. Solo mira: no usa funciones protegidas ni hace nada en la subasta.
--
-- Principal.abrir(pestana?)   la abre (en la pestaña dada, si es una de las cinco) o la deja como está si ya estaba abierta.
-- Principal.cerrar()          la cierra.
-- Principal.alternar()        la abre o la cierra (/snet comercio, /snet c, /snet trade y el clic izquierdo del minimapa).
-- Principal.estaAbierta()     true si se ve.
-- Principal.marco()           el marco SnetForeverPrincipal (lo crea la primera vez, escondido). Al entrar al juego no se crea nada.
-- Principal.registrar(nombre, {crear = fn(padre), mostrar = fn(), ocultar = fn(), idioma = fn()})
--                             enchufa la página de una pestaña (dashboard, contabilidad, grupos, operaciones o ajustes) sin
--                             tocar la cabecera. crear se llama una vez, con el marco de la página; mostrar y ocultar, cada vez que
--                             la página sale o se va; idioma, cuando el jugador cambia de idioma con la ventana creada. Registrar
--                             una pestaña ya creada no vuelve a llamar a crear. Una pestaña sin página registrada enseña PRINCIPAL_SIN_PAGINA.
-- Principal.pestana()         la pestaña elegida (principal.pestana; un valor que no sea una pestaña vale «grupos»).
-- Principal.elegir(nombre)    cambia de pestaña (lo que hace pulsar una pestaña).
-- Principal.sitioActual()     {x, y, ancho, alto} de ahora, en píxeles: la esquina de arriba a la izquierda medida desde la
--                             de la pantalla (y hacia abajo). Es lo que se guarda en principal.sitio al soltar el arrastre.
-- Principal.PESTANAS          los nombres de las pestañas, en orden.
-- Principal.marcos            {cabecera, icono, logo, orden, pestanas = {nombre = boton}, oro, cerrar, asa, contenido,
--                             paginas = {nombre = marco}}. Cada pestaña es un Button con su .texto.
--
-- El tamaño: 1424x805 y como mínimo 1000x600, en píxeles reales como TSM: una unidad de la ventana es un píxel de la pantalla,
-- sea cual sea la escala de interfaz del jugador. Su escala efectiva es 768 / alto físico de la pantalla (GetPhysicalScreenSize;
-- sin ella, 1080), así que el SetScale es esa escala entre la de UIParent. Se vuelve a calcular al abrirla y con UI_SCALE_CHANGED
-- y DISPLAY_SIZE_CHANGED. Si no cabe en la pantalla, se encoge hasta caber. Se mueve arrastrando la cabecera, se estira con el
-- asa de abajo a la derecha y recuerda dónde y de qué tamaño se dejó (principal.sitio, por personaje). «/snet reiniciar» la devuelve al centro.
--
-- Escape: fuera de combate la ventana tiene teclado propio (EnableKeyboard + OnKeyDown + SetPropagateKeyboardInput): Escape la
-- cierra y el resto de teclas siguen su camino hacia el juego. En combate no captura el teclado y Escape la cierra por
-- UISpecialFrames (entra al abrirse y sale al cerrarse); al salir de combate con la ventana abierta vuelve al teclado propio.
-- Lo mismo si el cliente no tuviera esas funciones. No verificado en el cliente: que EnableKeyboard se pueda llamar en combate
-- en un marco no seguro (en la API de Blizzard no está marcada como protegida, pero no se ha probado en esta versión).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L
local Ajustes = SNF.Ajustes

local Principal = {}
SNF.Principal = Principal

local NOMBRE = "SnetForeverPrincipal"

local ANCHO, ALTO = 1424, 805
local MIN_ANCHO, MIN_ALTO = 1000, 600
-- Las medidas de la cabecera (38 px, logo, pestañas de 16 px, oro de 12 px y X) son las de Piezas.CABECERA, que comparte
-- con la ventana de la subasta (ui/subasta/ventana.lua).
local CABECERA = Piezas.CABECERA

local PESTANAS = {"dashboard", "contabilidad", "grupos", "operaciones", "ajustes"}
local TEXTOS_PESTANA = {
  dashboard = "PRINCIPAL_PESTANA_DASHBOARD",
  contabilidad = "PRINCIPAL_PESTANA_CONTABILIDAD",
  grupos = "PRINCIPAL_PESTANA_GRUPOS",
  operaciones = "PRINCIPAL_PESTANA_OPERACIONES",
  ajustes = "PRINCIPAL_PESTANA_AJUSTES",
}
local PESTANA_DEFECTO = "grupos"
Principal.PESTANAS = PESTANAS

local marco
local marcos = {orden = PESTANAS, pestanas = {}, paginas = {}}
Principal.marcos = marcos
local registradas = {} -- nombre -> {crear, mostrar, ocultar, creada}
local visible -- nombre de la página que se ve ahora
local conTeclado
local layoutTabs

local function esPestana(nombre)
  for _, p in ipairs(PESTANAS) do
    if p == nombre then
      return true
    end
  end
  return false
end

local function poner(fs, token)
  local c = Tema.color(token)
  fs:SetTextColor(c[1], c[2], c[3], c[4])
end

local function esNumero(v)
  return type(v) == "number" and v == v and v > -1e9 and v < 1e9
end

---------------------------------------------------------------------------------------------------
-- Tamaño y sitio
---------------------------------------------------------------------------------------------------

-- La ventana mide píxeles reales (como TSM): una unidad = un píxel de la pantalla, con cualquier escala de interfaz
-- (Piezas.escalaReal).
local function ajustarEscala()
  Piezas.escalaReal(marco)
end

-- Ancho y alto de la pantalla, en unidades de la ventana (con la escala puesta son píxeles).
local function pantalla()
  return Piezas.pantallaDe(marco)
end

function Principal.sitioActual()
  return Piezas.sitioDe(Principal.marco())
end

local function limitar(valor, minimo, maximo)
  return math.max(minimo, math.min(valor, maximo))
end

-- Pone escala, tamaño y sitio: lo guardado (si está sano) o, si no, el tamaño de siempre en el centro. Todo recortado para que
-- la ventana quepa en la pantalla.
local function aplicarSitio()
  ajustarEscala()
  local pw, ph = pantalla()
  local guardado = Ajustes.get("principal.sitio")
  local sano = type(guardado) == "table" and esNumero(guardado.x) and esNumero(guardado.y) and esNumero(guardado.ancho)
    and esNumero(guardado.alto)
  local minAncho, minAlto = math.min(MIN_ANCHO, pw), math.min(MIN_ALTO, ph)
  local ancho = limitar(sano and guardado.ancho or ANCHO, minAncho, pw)
  local alto = limitar(sano and guardado.alto or ALTO, minAlto, ph)
  marco:SetSize(ancho, alto)
  if layoutTabs then layoutTabs() end
  if marco.SetResizeBounds then
    marco:SetResizeBounds(minAncho, minAlto, pw, ph)
  elseif marco.SetMinResize then
    marco:SetMinResize(minAncho, minAlto)
  end
  marco:ClearAllPoints()
  if sano then
    marco:SetPoint("TOPLEFT", UIParent, "TOPLEFT", limitar(guardado.x, 0, pw - ancho), -limitar(guardado.y, 0, ph - alto))
  else
    marco:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  end
end

-- Al soltar el arrastre o el asa: lo recuerda, sin avisar a nadie (solo lo usa esta ventana).
local function guardarSitio()
  local s = Principal.sitioActual()
  if s then
    Ajustes.guardarSinAviso("principal.sitio", s)
  end
end

---------------------------------------------------------------------------------------------------
-- Páginas
---------------------------------------------------------------------------------------------------

function Principal.pestana()
  local p = Ajustes.get("principal.pestana")
  if esPestana(p) then
    return p
  end
  return PESTANA_DEFECTO
end

local function llamar(pagina, nombre)
  if pagina and pagina[nombre] then
    pagina[nombre]()
  end
end

-- Rellena el marco de la página la primera vez que hace falta (con la página registrada o con un aviso).
local function crearContenido(nombre)
  local reg = registradas[nombre]
  local m = marcos.paginas[nombre]
  if not m or (reg and reg.creada) then
    return
  end
  if reg then
    reg.creada = true
    if m.sinPagina then
      m.sinPagina:Hide()
    end
    if reg.crear then
      reg.crear(m)
    end
  elseif not m.sinPagina then
    local fs = Tema.letra(m:CreateFontString(nil, "OVERLAY"), "texto", 14)
    poner(fs, "apagado")
    fs:SetPoint("CENTER", m, "CENTER", 0, 0)
    fs:SetText(L.t("PRINCIPAL_SIN_PAGINA"))
    m.sinPagina = fs
  end
end

local function paginaDe(nombre)
  local m = marcos.paginas[nombre]
  if not m then
    m = CreateFrame("Frame", nil, marcos.contenido)
    m:SetAllPoints(marcos.contenido)
    m:Hide()
    marcos.paginas[nombre] = m
  end
  crearContenido(nombre)
  return m
end

local function pintarPestanas()
  if marcos.cabecera then
    marcos.cabecera:pintar()
  end
end

-- Esconde la página que se veía y enseña la de la pestaña elegida (solo si la ventana está a la vista).
local function mostrarPagina()
  local elegida = Principal.pestana()
  if visible and visible ~= elegida then
    local anterior = marcos.paginas[visible]
    if anterior then
      anterior:Hide()
    end
    llamar(registradas[visible], "ocultar")
    visible = nil
  end
  pintarPestanas()
  if marco and marco:IsShown() and visible ~= elegida then
    paginaDe(elegida):Show()
    visible = elegida
    llamar(registradas[elegida], "mostrar")
  end
end

function Principal.elegir(nombre)
  if not esPestana(nombre) then
    return
  end
  -- Sin aviso: cambiar de pestaña no debe repintar la ventana de la guía (como panel.apartado).
  if Ajustes.get("principal.pestana") ~= nombre then
    Ajustes.guardarSinAviso("principal.pestana", nombre)
  end
  if marco then
    mostrarPagina()
  end
end

function Principal.registrar(nombre, pagina)
  if not esPestana(nombre) then
    error("uso: Principal.registrar: pestaña desconocida " .. tostring(nombre), 2)
  end
  pagina = type(pagina) == "table" and pagina or {}
  local previo = registradas[nombre]
  if previo and previo.creada then
    -- Ya está creada: una segunda registración no vuelve a llamar a crear (duplicaría el contenido); solo cambia el resto.
    previo.mostrar, previo.ocultar, previo.idioma = pagina.mostrar, pagina.ocultar, pagina.idioma
    return
  end
  registradas[nombre] = {crear = pagina.crear, mostrar = pagina.mostrar, ocultar = pagina.ocultar, idioma = pagina.idioma}
  -- Si la ventana ya enseñaba esa pestaña con el aviso, se rellena ahora.
  if marcos.paginas[nombre] then
    crearContenido(nombre)
    if marco and marco:IsShown() and visible == nombre then
      llamar(registradas[nombre], "mostrar")
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Cabecera
---------------------------------------------------------------------------------------------------

local function pintarOro()
  if marcos.oro then
    marcos.oro:SetText(Tema.dinero(GetMoney()))
  end
end

-- Pone el texto de cada pestaña en el idioma de ahora (los anchos siguen al texto por anclajes: Piezas.cabeceraVentana).
local function textosPestanas()
  if marcos.cabecera then
    marcos.cabecera:ponerTextos()
    if layoutTabs then layoutTabs() end
  end
end

-- La cabecera es la pieza común (Piezas.cabeceraVentana: logo, las cinco pestañas y la X). Aquí se le ponen el arrastre y
-- el oro.
local function crearCabecera()
  local cab = Piezas.cabeceraVentana(marco, {
    nombres = PESTANAS,
    texto = function(nombre) return L.t(TEXTOS_PESTANA[nombre]) end,
    elegida = Principal.pestana,
    alElegir = Principal.elegir,
    alCerrar = function() Principal.cerrar() end,
  })
  -- Arrastrar la cabecera mueve la ventana; al soltar se guarda el sitio.
  cab:SetScript("OnMouseDown", Piezas.proteger(function(_, boton)
    if boton == "LeftButton" then
      marco:StartMoving()
      cab.moviendo = true
    end
  end))
  cab:SetScript("OnMouseUp", Piezas.proteger(function()
    if cab.moviendo then
      cab.moviendo = false
      marco:StopMovingOrSizing()
      marco:SetUserPlaced(false) -- el sitio lo guarda el addon (principal.sitio), no el cliente
      guardarSitio()
    end
  end))
  marcos.cabecera = cab
  marcos.icono = cab.icono
  marcos.logo = cab.logo
  marcos.pestanas = cab.pestanas
  marcos.cerrar = cab.cerrar

  local oro = Tema.letra(cab:CreateFontString(nil, "OVERLAY"), "tablaNegrita", CABECERA.oro)
  oro:SetJustifyH("RIGHT")
  oro:SetPoint("RIGHT", cab.cerrar, "LEFT", -16, 0)
  poner(oro, "texto")
  marcos.oro = oro
  local status = Piezas.puntoEstado(cab, 12)
  status:SetPoint("RIGHT", oro, "LEFT", -8, 0)
  marcos.punto = status
end

-- El asa de abajo a la derecha (Piezas.asaVentana). Se estira desde la esquina de arriba a la izquierda, que no se mueve: se
-- ancla ahí antes de empezar.
local function crearAsa()
  marcos.asa = Piezas.asaVentana(marco, {
    empezar = function()
      local sitio = Principal.sitioActual()
      if sitio then
        marco:ClearAllPoints()
        marco:SetPoint("TOPLEFT", UIParent, "TOPLEFT", sitio.x, -sitio.y)
      end
    end,
    soltar = guardarSitio,
  })
end

---------------------------------------------------------------------------------------------------
-- Marco
---------------------------------------------------------------------------------------------------

-- Cambia la propagación del teclado solo si hace falta (así no se llama en cada pulsación).
local function propagar(self, valor)
  if self.snfPropaga ~= valor then
    self:SetPropagateKeyboardInput(valor)
    self.snfPropaga = valor
  end
end

local function enEspeciales(dentro)
  for k = #UISpecialFrames, 1, -1 do
    if UISpecialFrames[k] == NOMBRE then
      if dentro then
        return
      end
      table.remove(UISpecialFrames, k)
    end
  end
  if dentro then
    table.insert(UISpecialFrames, NOMBRE)
  end
end

-- El teclado según el combate. Fuera de combate la ventana tiene teclado propio (Escape la cierra y las demás teclas pasan al
-- juego; la propagación se fuerza a true cada vez, sin fiarse de lo recordado). En combate no captura el teclado
-- (EnableKeyboard(false): si no, se comería las teclas de moverse y de acción, porque la propagación no se puede cambiar en
-- combate) y Escape la cierra por UISpecialFrames, como en el respaldo. Se repite al abrir y al entrar o salir de combate.
local function aplicarTeclado()
  if not conTeclado then
    enEspeciales(true)
    return
  end
  if InCombatLockdown and InCombatLockdown() then
    marco:EnableKeyboard(false)
    enEspeciales(true)
  else
    marco:EnableKeyboard(true)
    marco:SetPropagateKeyboardInput(true)
    marco.snfPropaga = true
    enEspeciales(false)
  end
end

local function alMostrar()
  aplicarTeclado()
  aplicarSitio()
  pintarOro()
  marco:RegisterEvent("PLAYER_MONEY")
  marco:RegisterEvent("DISPLAY_SIZE_CHANGED")
  marco:RegisterEvent("UI_SCALE_CHANGED")
  marco:RegisterEvent("PLAYER_REGEN_ENABLED")
  marco:RegisterEvent("PLAYER_REGEN_DISABLED")
  mostrarPagina()
end

local function alOcultar()
  marco:UnregisterEvent("PLAYER_MONEY")
  marco:UnregisterEvent("DISPLAY_SIZE_CHANGED")
  marco:UnregisterEvent("UI_SCALE_CHANGED")
  marco:UnregisterEvent("PLAYER_REGEN_ENABLED")
  marco:UnregisterEvent("PLAYER_REGEN_DISABLED")
  enEspeciales(false)
  -- Cerrada a medio arrastre o a medio estirar: se suelta y se guarda donde quedó.
  local cab, asa = marcos.cabecera, marcos.asa
  if (cab and cab.moviendo) or (asa and asa.estirando) then
    if cab then
      cab.moviendo = false
    end
    if asa then
      asa.estirando = false
    end
    marco:StopMovingOrSizing()
    marco:SetUserPlaced(false)
    guardarSitio()
  end
  if visible then
    llamar(registradas[visible], "ocultar")
    local m = marcos.paginas[visible]
    if m then
      m:Hide()
    end
    visible = nil
  end
end

function Principal.marco()
  if marco then
    return marco
  end
  marco = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(marco, NOMBRE, false)
  marco:SetFrameStrata("HIGH")
  marco:SetToplevel(true)
  marco:SetClampedToScreen(true)
  marco:SetMovable(true)
  marco:SetResizable(true)
  marco:EnableMouse(true) -- que los clics sobre la ventana no pasen al mundo
  Tema.panel(marco, "fondo")
  SNF.Estilo.forgePlate(marco, 0.82)

  crearCabecera()
  local contenido = CreateFrame("Frame", nil, marco)
  contenido:SetPoint("TOPLEFT", marcos.cabecera, "BOTTOMLEFT", 0, 0)
  contenido:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", 0, 0)
  marcos.contenido = contenido
  layoutTabs = Piezas.resizableTabs(marco, marcos.cabecera, PESTANAS, "principalTabSizes", function()
    return math.max(80, marcos.oro:GetStringWidth() + 48)
  end, function()
    local scale = limitar(math.min(marco:GetWidth() / ANCHO, marco:GetHeight() / ALTO), 1, 1.35)
    contenido:SetScale(scale)
    return scale
  end)
  crearAsa()

  conTeclado = marco.EnableKeyboard ~= nil and marco.SetPropagateKeyboardInput ~= nil
  if conTeclado then
    marco:SetScript("OnKeyDown", Piezas.proteger(function(self, tecla)
      -- En combate el cliente no deja tocar la propagación a un código no seguro (ADDON_ACTION_BLOCKED): no se llama.
      local libre = not (InCombatLockdown and InCombatLockdown())
      if tecla == "ESCAPE" then
        if libre then
          propagar(self, false)
        end
        Principal.cerrar()
      elseif libre then
        propagar(self, true)
      end
    end))
  end
  marco:SetScript("OnShow", Piezas.proteger(alMostrar))
  marco:SetScript("OnHide", Piezas.proteger(alOcultar))
  marco:SetScript("OnEvent", Piezas.proteger(function(_, evento)
    if evento == "PLAYER_MONEY" then
      pintarOro()
    elseif evento == "DISPLAY_SIZE_CHANGED" or evento == "UI_SCALE_CHANGED" then
      aplicarSitio()
    elseif evento == "PLAYER_REGEN_ENABLED" or evento == "PLAYER_REGEN_DISABLED" then
      aplicarTeclado()
    end
  end))

  aplicarSitio()
  marco:Hide()
  return marco
end

function Principal.estaAbierta()
  return marco ~= nil and marco:IsShown()
end

function Principal.abrir(pestana)
  local v = Principal.marco()
  if esPestana(pestana) and Ajustes.get("principal.pestana") ~= pestana then
    Ajustes.guardarSinAviso("principal.pestana", pestana)
  end
  if v:IsShown() then
    mostrarPagina()
  else
    v:Show()
  end
end

function Principal.cerrar()
  if marco and marco:IsShown() then
    marco:Hide()
  end
end

function Principal.alternar()
  if Principal.estaAbierta() then
    Principal.cerrar()
  else
    Principal.abrir()
  end
end

-- «/snet reiniciar» (o el botón de restablecer) borra principal.sitio: la ventana vuelve al centro. Un cambio de pestaña desde
-- fuera (por ejemplo Ajustes › restablecer) se refleja con la ventana abierta.
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if not marco then
    return
  end
  if clave == "principal.sitio" or clave == "auction.largeText" then
    aplicarSitio()
  elseif clave == "principal.pestana" then
    mostrarPagina()
  elseif clave == "idioma" then
    textosPestanas()
    for _, m in pairs(marcos.paginas) do
      if m.sinPagina then
        m.sinPagina:SetText(L.t("PRINCIPAL_SIN_PAGINA"))
      end
    end
    for _, reg in pairs(registradas) do
      if reg.creada and reg.idioma then
        reg.idioma()
      end
    end
  end
end)
