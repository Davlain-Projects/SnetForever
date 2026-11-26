-- SnetForever: botón propio del minimapa (tarea 20), sin LibDBIcon ni LibDataBroker. Un Button normal hijo de Minimap,
-- de 31x31, con el icono de SnetForever y el borde de Blizzard. Con el addon de comercio cargado: clic izquierdo, la ventana
-- de comercio; clic derecho, la ventana de guía; Mayúsculas+clic, el panel de ajustes. Sin el comercio (el botón vive en el
-- núcleo): clic izquierdo y Mayúsculas+clic abren el panel de ajustes, como en la 0.6.x, y la ayuda no habla del comercio.
-- Se arrastra alrededor del minimapa y su ángulo (en grados, 0 = a la derecha, 90 = arriba) se guarda en
-- minimapa.angulo. Se oculta con minimapa.boton apagado.
--
-- BotonMinimapa.crear() -> marco|nil   crea SnetForeverBotonMinimapa (una sola vez; nil si no hay Minimap). Lo llama
--                                      arranque.lua en PLAYER_LOGIN si los datos están bien.
-- BotonMinimapa.posicion(angulo, forma?) -> x, y   desplazamiento del centro del botón respecto al centro del minimapa;
--                                      forma es la de GetMinimapShape() ("ROUND", "SQUARE", "CORNER-...", "SIDE-...", "TRICORNER-...").
-- BotonMinimapa.marcos = {boton}
--
-- La forma: «ROUND» (y cualquiera que no se conozca) coloca el botón en el círculo; en un cuadrante
-- cuadrado el botón sigue el borde del cuadrado (recortado a la esquina). GetMinimapShape no es de Blizzard sino la
-- convención de los addons de minimapa: si no existe, el minimapa es redondo.
local _, SNF = ...
local BotonMinimapa = {}
SNF.BotonMinimapa = BotonMinimapa

local L = SNF.L
local Ajustes = SNF.Ajustes

local NOMBRE = "SnetForeverBotonMinimapa"
local TAMANO = 31
local ICONO = "Interface\\AddOns\\SnetForever\\recursos\\icono"
local BORDE = "Interface\\Minimap\\MiniMap-TrackingBorder"
local FONDO = "Interface\\Minimap\\UI-Minimap-Background"
local RESALTE = "Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight"
local ANGULO_DEFECTO = 225
local SALIENTE = 5 -- lo que el centro del botón sobresale del borde del minimapa
local RECORTE_DIAGONAL = 10

-- Cuadrantes: 1 = arriba a la derecha, 2 = arriba a la izquierda, 3 = abajo a la izquierda, 4 = abajo a la derecha.
-- true = el minimapa es redondo en ese cuadrante.
local FORMAS = {
  ["ROUND"] = {true, true, true, true},
  ["SQUARE"] = {false, false, false, false},
  ["CORNER-TOPRIGHT"] = {true, false, false, false},
  ["CORNER-TOPLEFT"] = {false, true, false, false},
  ["CORNER-BOTTOMLEFT"] = {false, false, true, false},
  ["CORNER-BOTTOMRIGHT"] = {false, false, false, true},
  ["SIDE-RIGHT"] = {true, false, false, true},
  ["SIDE-LEFT"] = {false, true, true, false},
  ["SIDE-TOP"] = {true, true, false, false},
  ["SIDE-BOTTOM"] = {false, false, true, true},
  ["TRICORNER-TOPLEFT"] = {true, true, true, false},
  ["TRICORNER-TOPRIGHT"] = {true, true, false, true},
  ["TRICORNER-BOTTOMLEFT"] = {false, true, true, true},
  ["TRICORNER-BOTTOMRIGHT"] = {true, false, true, true},
}

local boton
BotonMinimapa.marcos = {}

---------------------------------------------------------------------------------------------------
-- Posición
---------------------------------------------------------------------------------------------------

-- GetMinimapShape si algún addon la define; si no (WoW Forever, EllesmereUI), la que dice la máscara del minimapa
-- (SNF.API.formaMinimapa, nucleo/espacio.lua).
local function formaDelMinimapa()
  return SNF.API.formaMinimapa()
end

function BotonMinimapa.posicion(angulo, forma)
  local radianes = math.rad(angulo)
  local cx, cy = math.cos(radianes), math.sin(radianes)
  local cuadrante
  if cy >= 0 then
    cuadrante = cx >= 0 and 1 or 2
  else
    cuadrante = cx < 0 and 3 or 4
  end
  local mitadAncho = Minimap:GetWidth() / 2 + SALIENTE
  local mitadAlto = Minimap:GetHeight() / 2 + SALIENTE
  local redondos = FORMAS[forma or "ROUND"] or FORMAS["ROUND"]
  if redondos[cuadrante] then
    return cx * mitadAncho, cy * mitadAlto
  end
  local diagonalAncho = math.sqrt(2 * mitadAncho * mitadAncho) - RECORTE_DIAGONAL
  local diagonalAlto = math.sqrt(2 * mitadAlto * mitadAlto) - RECORTE_DIAGONAL
  return math.max(-mitadAncho, math.min(cx * diagonalAncho, mitadAncho)),
    math.max(-mitadAlto, math.min(cy * diagonalAlto, mitadAlto))
end

local function angulo()
  local valor = Ajustes.get("minimapa.angulo")
  if type(valor) ~= "number" then
    return ANGULO_DEFECTO
  end
  return valor
end

local function colocar()
  if not boton then
    return
  end
  local x, y = BotonMinimapa.posicion(angulo(), formaDelMinimapa())
  boton:ClearAllPoints()
  boton:SetPoint("CENTER", Minimap, "CENTER", x, y)
end

local function mostrar()
  if boton then
    boton:SetShown(Ajustes.get("minimapa.boton") ~= false)
  end
end

-- Ángulo entero (0-359) del ratón respecto al centro del minimapa.
local function anguloDelRaton()
  local mx, my = Minimap:GetCenter()
  local rx, ry = GetCursorPosition()
  local escala = Minimap:GetEffectiveScale()
  local grados = math.deg(math.atan2(ry / escala - my, rx / escala - mx))
  return math.floor(grados % 360 + 0.5) % 360
end

local function alActualizar()
  local nuevo = anguloDelRaton()
  if nuevo ~= angulo() then
    Ajustes.set("minimapa.angulo", nuevo)
  end
end

---------------------------------------------------------------------------------------------------
-- Marco
---------------------------------------------------------------------------------------------------

local function ocultarAyuda()
  if GameTooltip and not GameTooltip:IsForbidden() then
    GameTooltip:Hide()
  end
end

-- La ventana principal de comercio (SNF.Principal, del addon SnetForever_Comercio), o nil si el addon no está cargado.
local function ventanaComercio()
  if not SNF.comercioCargado() then
    return nil
  end
  local v = rawget(SNF, "Principal")
  if type(v) == "table" and type(v.alternar) == "function" then
    return v
  end
  return nil
end

local function mostrarAyuda(self)
  if not GameTooltip or GameTooltip:IsForbidden() then
    return
  end
  local gris = SNF.Estilo.COLOR_SECUNDARIO
  GameTooltip:SetOwner(self, "ANCHOR_LEFT")
  GameTooltip:SetText("SnetForever")
  if ventanaComercio() then
    GameTooltip:AddLine(L.t("MINIMAPA_COMERCIO"), gris[1], gris[2], gris[3])
    GameTooltip:AddLine(L.t("MINIMAPA_DERECHO"), gris[1], gris[2], gris[3])
    GameTooltip:AddLine(L.t("MINIMAPA_MAYUS"), gris[1], gris[2], gris[3])
  else
    GameTooltip:AddLine(L.t("MINIMAPA_IZQUIERDO"), gris[1], gris[2], gris[3])
    GameTooltip:AddLine(L.t("MINIMAPA_DERECHO"), gris[1], gris[2], gris[3])
  end
  GameTooltip:Show()
end

function BotonMinimapa.crear()
  if boton then
    return boton
  end
  if Minimap == nil then
    return nil
  end
  boton = CreateFrame("Button", NOMBRE, Minimap)
  boton:SetSize(TAMANO, TAMANO)
  boton:SetFrameStrata("MEDIUM")
  boton:SetFrameLevel(8)
  boton:EnableMouse(true)
  boton:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  boton:RegisterForDrag("LeftButton")

  local fondo = boton:CreateTexture(nil, "BACKGROUND")
  fondo:SetTexture(FONDO)
  fondo:SetSize(20, 20)
  fondo:SetPoint("TOPLEFT", boton, "TOPLEFT", 7, -5)
  local icono = boton:CreateTexture(nil, "ARTWORK")
  icono:SetTexture(ICONO)
  icono:SetTexCoord(0.05, 0.95, 0.05, 0.95)
  icono:SetSize(17, 17)
  icono:SetPoint("TOPLEFT", boton, "TOPLEFT", 7, -6)
  local borde = boton:CreateTexture(nil, "OVERLAY")
  borde:SetTexture(BORDE)
  borde:SetSize(53, 53)
  borde:SetPoint("TOPLEFT", boton, "TOPLEFT", 0, 0)
  local luz = boton:CreateTexture(nil, "HIGHLIGHT")
  luz:SetTexture(RESALTE)
  luz:SetAllPoints(boton)

  boton:SetScript("OnClick", function(_, cual)
    if cual == "RightButton" then
      SNF.Ventana.crear()
      SNF.Ventana.alternar()
    else
      local comercio = ventanaComercio()
      if comercio and not (IsShiftKeyDown and IsShiftKeyDown()) then
        comercio.alternar()
      else
        SNF.Panel.alternar()
      end
    end
  end)
  boton:SetScript("OnEnter", mostrarAyuda)
  boton:SetScript("OnLeave", ocultarAyuda)
  boton:SetScript("OnDragStart", function(self)
    ocultarAyuda()
    self:SetScript("OnUpdate", alActualizar)
  end)
  boton:SetScript("OnDragStop", function(self)
    self:SetScript("OnUpdate", nil)
  end)

  BotonMinimapa.marcos.boton = boton
  colocar()
  mostrar()
  return boton
end

-- Otros addons de minimapa pueden cambiar su forma al entrar al mundo.
SNF.escuchar("PLAYER_ENTERING_WORLD", colocar)

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "minimapa.angulo" then
    colocar()
  elseif clave == "minimapa.boton" then
    mostrar()
  end
end)
