-- Acciones indicadas por la guía. Los atributos seguros solo se preparan fuera de combate.
local _, SNF = ...
local Objetos = {}
SNF.ObjetosActivos = Objetos
local L, Motor, Ajustes = SNF.L, SNF.Motor, SNF.Ajustes
local raiz, botones = nil, {}
local MAXIMO = 4
local TAMANO, SEPARACION = 28, 4
local ICONO_FALTA = "Interface\\Icons\\INV_Misc_QuestionMark"

local function vinculos()
  _G.BINDING_HEADER_SNETFOREVER_GUIAS = "SnetForever"
  for i = 1, 12 do
    _G["BINDING_NAME_CLICK SnetForeverObjetivo" .. i .. ":LeftButton"] = L.t("GUIAS_TECLA_OBJETIVO", i)
  end
  _G["BINDING_NAME_CLICK SnetForeverObjetivosTodos:LeftButton"] = L.t("GUIAS_TECLA_OBJETIVOS_TODOS")
  for i = 1, MAXIMO do
    _G["BINDING_NAME_CLICK SnetForeverObjetoActivo" .. i .. ":LeftButton"] = L.t("GUIAS_TECLA_OBJETO", i)
  end
end

local function accionDe(tipo, id)
  if type(id) ~= "number" or id < 1 or id % 1 ~= 0 then return nil end
  if tipo == "use" then
    local tieneJuguete = rawget(_G, "PlayerHasToy")
    if SNF.API.cuentaObjeto(id) > 0 or (type(tieneJuguete) == "function" and tieneJuguete(id)) then
      return {tipo = "item", valor = "item:" .. id, icono = SNF.API.iconoObjeto(id), nombre = SNF.Datos.nombreItem(id)}
    end
  else
    local hechizos = rawget(_G, "C_Spell")
    local conocido = rawget(_G, "IsPlayerSpell")
    if type(conocido) == "function" and not conocido(id) then return nil end
    local obtener = type(hechizos) == "table" and rawget(hechizos, "GetSpellInfo")
    local datos = type(obtener) == "function" and obtener(id)
    if type(datos) == "table" and datos.name then
      return {tipo = "spell", valor = datos.name, icono = datos.iconID, nombre = datos.name}
    end
  end
end

local function acciones()
  local sal, vistas = {}, {}
  local hayAcciones = false
  if not Ajustes.get("guias.objetosActivos") then return sal end
  for _, i in ipairs(Motor.activos()) do
    for _, vivo in ipairs(Motor.paso(i).elementos) do
      local el = vivo.datos
      if vivo.resultado == "info" and (el.t == "use" or el.t == "usespell") then
        hayAcciones = true
        for _, id in ipairs(el.is or el.spells or {}) do
          local clave = el.t .. id
          if not vistas[clave] then
            vistas[clave] = true
            local accion = accionDe(el.t, id)
            if accion then
              sal[#sal + 1] = accion
              if #sal == MAXIMO then return sal, true end
            end
          end
        end
      end
    end
  end
  return sal, hayAcciones
end

local function pintar()
  if InCombatLockdown() then return end
  local lista, hayAcciones = acciones()
  local actualizar = hayAcciones and SNF.Eventos.escuchar or SNF.Eventos.dejar
  actualizar("BAG_UPDATE_DELAYED", pintar)
  actualizar("SPELLS_CHANGED", pintar)
  if not raiz and #lista > 0 then Objetos.crear() end
  if not raiz then return end
  for i, boton in ipairs(botones) do
    local accion = lista[i]
    if accion then
      boton:SetAttribute("type", accion.tipo)
      boton:SetAttribute(accion.tipo, accion.valor)
      boton.icono:SetTexture(accion.icono or ICONO_FALTA)
      boton.nombre = accion.nombre
      boton:Show()
    else
      boton:SetAttribute("type", nil)
      boton:Hide()
    end
  end
  raiz:SetWidth(math.max(110, #lista * (TAMANO + SEPARACION) + 8))
  raiz:SetShown(#lista > 0 and #botones > 0)
end

function Objetos.crear()
  if raiz or InCombatLockdown() then return end
  raiz = CreateFrame("Frame", "SnetForeverObjetosActivos", UIParent)
  raiz:SetPoint("CENTER", UIParent, "CENTER", 0, -155)
  raiz:SetSize(110, 51)
  raiz:SetClampedToScreen(true)
  SNF.Estilo.tarjeta(raiz, "fondo")
  local titulo = SNF.Estilo.pestana(raiz, L.t("GUIAS_OBJETOS_TITULO"))
  titulo:SetPoint("TOPLEFT", raiz, "TOPLEFT", 6, 2)
  for i = 1, MAXIMO do
    local b = SNF.Objetivos.crearBotonSeguro("SnetForeverObjetoActivo" .. i, raiz)
    if not b then break end
    b:SetSize(TAMANO, TAMANO)
    b:SetPoint("BOTTOMLEFT", raiz, "BOTTOMLEFT", 6 + (i - 1) * (TAMANO + SEPARACION), 5)
    b.icono = b:CreateTexture(nil, "ARTWORK")
    b.icono:SetAllPoints()
    b:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
    b:SetScript("OnEnter", function(self)
      if GameTooltip and not GameTooltip:IsForbidden() then
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
        GameTooltip:SetText(self.nombre or "")
        GameTooltip:Show()
      end
    end)
    b:SetScript("OnLeave", function() if GameTooltip and not GameTooltip:IsForbidden() then GameTooltip:Hide() end end)
    botones[i] = b
  end
end

SNF.escuchar("SNF_PASOS_CAMBIADOS", pintar)
SNF.escuchar("PLAYER_LOGIN", vinculos)
SNF.escuchar("PLAYER_REGEN_ENABLED", pintar)
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "guias.objetosActivos" then pintar() end
  if clave == "idioma" then vinculos() end
end)
