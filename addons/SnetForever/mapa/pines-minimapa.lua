-- SnetForever: pines de la capa (guía, IA, jugador) en el minimapa de Blizzard, sin librerías (plano 3 §3.2).
--
-- Por qué no hay «taint» (plano 3 §7): los pines son Buttons normales hijos de Minimap; no se engancha ni se sustituye
-- nada de Blizzard. Solo se LEE (Minimap:GetWidth/GetHeight/GetZoom, C_Minimap.GetViewRadius, GetCVar("rotateMinimap"),
-- GetMinimapShape, IsIndoors, GetPlayerFacing); nunca SetCVar. El tooltip solo se toca si GameTooltip no está
-- prohibido (IsForbidden), tanto al entrar como al salir y al esconder el pin.
--
-- PinesMinimapa.crear() -> true|false   crea el reloj (hijo de Minimap) que repinta cada 0,1 s y en MINIMAP_UPDATE_ZOOM.
--                                       Una sola vez (otra llamada no duplica nada). false si el cliente no tiene Minimap.
-- PinesMinimapa.pintar()                un pin de 12x12 por cada punto visible de Capa.visibles() que caiga dentro del
--                                       90 % del radio de vista, y esconde los demás. Los pines se reciclan.
-- PinesMinimapa.posicion(punto) -> dx, dy, visible
--                                       función pura (sin tocar marcos): desplazamiento en puntos de pantalla desde el
--                                       centro del minimapa (dx a la derecha, dy hacia arriba) y si el punto se ve.
--                                       nil, nil, false si no hay datos (ajuste apagado, sin posición del jugador,
--                                       otra instancia, punto sin coordenadas).
-- PinesMinimapa.marcos = {pines, reloj}
--
-- Pines de la IA como «Marcador de mapa» (mapa/marcador.lua): un punto con esPin se viste como en el mapa del mundo
-- (PinesMundo.vestirPin: el atlas del marcador; sin el atlas, el aro), y su tooltip lleva la misma segunda línea
-- (PinesMundo.tooltipPin). El que sigue ahora nuestro marcador (Marcador.seguido()) no se pinta: ya lo pinta Blizzard.
-- Se repinta con SNF_MARCADOR_CAMBIADO.
--
-- Cálculo (plano 3 §3.2), con j = Coord.jugador() y w = Coord.aMundo(punto), con la convención de mapa/coordenadas.lua
-- (wx crece hacia el OESTE, wy hacia el NORTE):
--   ex = −(w.wx − j.wx)   (este a la derecha)      ny = w.wy − j.wy   (norte arriba)
--   si GetCVar("rotateMinimap") == "1" (y sin rumbo no se pinta nada), (ex, ny) se gira un ángulo −GetPlayerFacing() (antihorario; el rumbo crece hacia
--   el oeste, así que al mirar al oeste el norte pasa a la derecha);
--   dx = ex / r · ancho/2    dy = ny / r · alto/2
--   r = C_Minimap.GetViewRadius() si existe; si no, la mitad del diámetro que corresponde al zoom (0-5) del minimapa,
--   exterior o interior (IsIndoors).
-- Visible: dentro del 90 % de r, en círculo; con GetMinimapShape() == "SQUARE", por eje (|ex|, |ny| ≤ 0.9·r). Cualquier
-- otra forma (también las esquinas, "CORNER-...") se trata como redonda: es lo que no se pasa del borde en todas ellas.
local _, SNF = ...
local PinesMinimapa = {}
SNF.PinesMinimapa = PinesMinimapa

local Ajustes = SNF.Ajustes
local Coord = SNF.Coord
local Capa = SNF.Capa
local PinesMundo = SNF.PinesMundo

local TAMANO = 16 -- 11-nov: ahora un círculo macizo (a 20 el atlas de OpenMap se veía de unos 12 px; a 12 era un puntito)
local INTERVALO = 0.1
local MARGEN = 0.9
local NIVEL_SOBRE_MINIMAPA = 5

-- Diámetros de vista en yardas por nivel de zoom (0 = el más alejado, 5 = el más cercano), exterior e interior
-- (plano 3 §3.2). El radio es la mitad.
local DIAMETRO_EXTERIOR = {466.6667, 400, 333.3333, 266.6667, 200, 133.3333}
local DIAMETRO_INTERIOR = {300, 240, 180, 120, 80, 50}

local pines = {} -- los marcos creados; los primeros `usados` están en uso
local reloj = nil

PinesMinimapa.marcos = {pines = pines}

---------------------------------------------------------------------------------------------------
-- Cálculo
---------------------------------------------------------------------------------------------------

-- Radio de vista en yardas.
local function radioDeVista()
  if type(C_Minimap) == "table" and type(C_Minimap.GetViewRadius) == "function" then
    local r = tonumber(C_Minimap.GetViewRadius())
    if r and r > 0 then
      return r
    end
  end
  local zoom = 0
  if type(Minimap.GetZoom) == "function" then
    zoom = math.floor(tonumber(Minimap:GetZoom()) or 0)
  end
  if zoom < 0 then
    zoom = 0
  elseif zoom > 5 then
    zoom = 5
  end
  local interior = type(IsIndoors) == "function" and IsIndoors() and true or false
  local tabla = interior and DIAMETRO_INTERIOR or DIAMETRO_EXTERIOR
  return tabla[zoom + 1] / 2
end

local ctx = {} -- lo que devuelve contexto(); se reutiliza

-- Todo lo que no cambia de un punto a otro, o nil si ahora no se puede pintar nada.
local function contexto()
  if Minimap == nil or Ajustes.get("pines.minimapa") == false then
    return nil
  end
  local j = Coord.jugador()
  if j == nil then
    return nil
  end
  local ancho, alto = Minimap:GetWidth(), Minimap:GetHeight()
  if not ancho or not alto or ancho <= 0 or alto <= 0 then
    return nil
  end
  -- Una sola tabla que se rellena en cada vuelta (cada 0,1 s): antes se creaba una nueva (tarea 22, memoria).
  local c = ctx
  c.j, c.r, c.ancho, c.alto = j, radioDeVista(), ancho, alto
  c.cuadrado = SNF.API.formaMinimapa() == "SQUARE" -- GetMinimapShape o la máscara (nucleo/espacio.lua)
  c.cos, c.sen = nil, nil
  if GetCVar("rotateMinimap") == "1" then
    local rumbo = GetPlayerFacing()
    if rumbo == nil then
      return nil -- el minimapa gira y no hay rumbo: la dirección saldría mal, no se pinta nada (como HereBeDragons)
    end
    c.cos, c.sen = math.cos(-rumbo), math.sin(-rumbo)
  end
  return c
end

local function posicionEn(c, punto)
  local w = Coord.aMundo(punto)
  if w == nil or (w.inst ~= nil and c.j.inst ~= nil and w.inst ~= c.j.inst) then
    return nil, nil, false
  end
  local ex = -(w.wx - c.j.wx)
  local ny = w.wy - c.j.wy
  if c.cos then
    ex, ny = ex * c.cos - ny * c.sen, ex * c.sen + ny * c.cos
  end
  local limite = MARGEN * c.r
  local dentro
  if c.cuadrado then
    dentro = math.abs(ex) <= limite and math.abs(ny) <= limite
  else
    dentro = ex * ex + ny * ny <= limite * limite
  end
  return ex / c.r * c.ancho / 2, ny / c.r * c.alto / 2, dentro
end

function PinesMinimapa.posicion(punto)
  local c = type(punto) == "table" and contexto()
  if not c then
    return nil, nil, false
  end
  return posicionEn(c, punto)
end

---------------------------------------------------------------------------------------------------
-- Pin
---------------------------------------------------------------------------------------------------

local function alEntrar(pin)
  if not GameTooltip or GameTooltip:IsForbidden() then
    return
  end
  local punto = pin.snfPunto
  local texto = punto and PinesMundo.textoDe(punto)
  if not texto then
    return
  end
  GameTooltip:SetOwner(pin, "ANCHOR_LEFT")
  GameTooltip:SetText(texto)
  local linea = PinesMundo.tooltipPin(punto)
  if linea then
    GameTooltip:AddLine(linea, 1, 1, 1)
  end
  GameTooltip:Show()
end

local function alSalir()
  if GameTooltip and not GameTooltip:IsForbidden() then
    GameTooltip:Hide()
  end
end

local function nuevoPin()
  local pin = CreateFrame("Button", nil, Minimap)
  pin:SetSize(TAMANO, TAMANO)
  pin:SetFrameLevel(Minimap:GetFrameLevel() + NIVEL_SOBRE_MINIMAPA)
  PinesMundo.vestir(pin, 2) -- el mismo aspecto que en el mapa del mundo, con un borde de 2 px

  pin:SetScript("OnEnter", alEntrar)
  pin:SetScript("OnLeave", alSalir)
  return pin
end

-- ¿Es el tooltip de este pin? (solo si se puede tocar)
local function tooltipDe(pin)
  return GameTooltip and not GameTooltip:IsForbidden() and GameTooltip:GetOwner() == pin
end

local function esconder(pin)
  -- Un pin oculto con el ratón encima no manda OnLeave: se cierra a mano el tooltip si era suyo.
  if pin:IsShown() and tooltipDe(pin) then
    GameTooltip:Hide()
  end
  pin:Hide()
  pin.snfPunto = nil
end

local function esconderDesde(primero)
  for i = primero, #pines do
    esconder(pines[i])
  end
end

local function ponerPin(pin, punto, dx, dy)
  local c = PinesMundo.COLORES[punto.origen] or PinesMundo.COLORES.guia
  pin.snfCirculo:SetVertexColor(c[1], c[2], c[3], 1)
  PinesMundo.vestirPin(pin, punto)
  pin.snfPunto = punto
  pin:ClearAllPoints()
  pin:SetPoint("CENTER", Minimap, "CENTER", dx, dy)
  if not pin:IsShown() then
    pin:Show()
  elseif tooltipDe(pin) then
    alEntrar(pin) -- el pin cambió de punto con el ratón encima: se refresca el texto
  end
end

---------------------------------------------------------------------------------------------------
-- Pintar
---------------------------------------------------------------------------------------------------

function PinesMinimapa.pintar()
  if reloj == nil then
    return
  end
  local c = contexto()
  if not c then
    esconderDesde(1)
    return
  end
  local usados = 0
  local seguido = SNF.Marcador and SNF.Marcador.seguido() or nil
  for _, punto in ipairs(Capa.visibles()) do
    if not punto.sinPin and punto ~= seguido then -- el seguido lo pinta el marcador de Blizzard
      local dx, dy, visible = posicionEn(c, punto)
      if visible then
        usados = usados + 1
        local pin = pines[usados]
        if pin == nil then
          pin = nuevoPin()
          pines[usados] = pin
        end
        ponerPin(pin, punto, dx, dy)
      end
    end
  end
  esconderDesde(usados + 1)
end

---------------------------------------------------------------------------------------------------
-- Reloj
---------------------------------------------------------------------------------------------------

function PinesMinimapa.crear()
  if reloj then
    return true
  end
  if Minimap == nil then
    return false
  end
  reloj = CreateFrame("Frame", nil, Minimap)
  local acumulado = 0
  reloj:SetScript("OnUpdate", function(_, dt)
    acumulado = acumulado + dt
    if acumulado >= INTERVALO - 1e-9 then
      acumulado = 0
      PinesMinimapa.pintar()
    end
  end)
  reloj:SetScript("OnEvent", function()
    PinesMinimapa.pintar()
  end)
  reloj:RegisterEvent("MINIMAP_UPDATE_ZOOM")
  PinesMinimapa.marcos.reloj = reloj
  PinesMinimapa.pintar()
  return true
end

SNF.escuchar("SNF_PUNTOS_CAMBIADOS", function()
  PinesMinimapa.pintar()
end)

SNF.escuchar("SNF_MARCADOR_CAMBIADO", function()
  PinesMinimapa.pintar()
end)

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if type(clave) == "string" and string.sub(clave, 1, 6) == "pines." then
    PinesMinimapa.pintar()
  end
end)
