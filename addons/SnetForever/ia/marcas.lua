-- SnetForever: marcas de la IA (fase 4). Lo que la IA recomienda vender o usar de las bolsas del personaje. El addon solo
-- marca y muestra texto: nunca vende, usa, equipa, mueve ni borra un objeto, y no toca los botones de Blizzard.
--
-- Marcas.poner({vender, usar})   sustituye las marcas por las de la respuesta (listas de ids de objeto) y las guarda en
--                                SnetForeverPJ.ia.marcas, acotadas: como mucho 50 ids por tipo, solo enteros válidos, sin
--                                repetir, y un id que viene en las dos listas se queda en «vender». Emite SNF_IA_MARCAS y
--                                pide a Baganator que repinte sus botones. false si no hay guardado del personaje.
-- Marcas.quitar()                borra todas las marcas (mismos mensajes).
-- Marcas.de(id) -> "vender" | "usar" | nil
-- Marcas.lista() -> {{id, tipo, nombre, n, posiciones}…}   lo marcado que hay ahora en las bolsas, con los datos de
--                                Inventario.bolsas(): n suma el objeto ligado y el no ligado, posiciones = {{bolsa, hueco}…}.
--
-- Dónde se ven las marcas (R6):
--   · Tooltip: una línea dorada con L.MARCA_VENDER o L.MARCA_USAR. Con TooltipDataProcessor (motor moderno) por su llamada
--     posterior de objetos; si no existe, con HookScript("OnTooltipSetItem") de GameTooltip. Sirve con cualquier bolsa, también
--     EllesmereUIBags.
--   · Baganator: si existe Baganator.API.RegisterCornerWidget, una esquina arriba a la izquierda (se registra una vez, al cargar
--     o, si Baganator llega después, en PLAYER_LOGIN).
--   · La lista de la ventana de chat usa Marcas.lista().
-- Mensaje interno: SNF_IA_MARCAS (sin argumentos) cuando cambian las marcas.
local _, SNF = ...

local Marcas = {}
SNF.Marcas = Marcas

local API = SNF.API
local esSecreto = API.esSecreto
local floor = math.floor
local format = string.format

local MAX_POR_TIPO = 50
local MAX_ID = 2147483647 -- los enteros del cliente (y del banco) son de 32 bits
local COLOR_LINEA = "|cFFFFD040"
local COLORES = { -- esquina de Baganator
  vender = {1, 0.82, 0.25},
  usar = {0.4, 1, 0.4},
}

local function guardadoIa()
  local pj = rawget(_G, "SnetForeverPJ")
  return type(pj) == "table" and type(pj.ia) == "table" and pj.ia or nil
end

-- Un id de objeto válido: número entero entre 1 y 2^31 - 1, no secreto (NaN e infinito no pasan la comparación).
local function idValido(v)
  return type(v) == "number" and not esSecreto(v) and v >= 1 and v <= MAX_ID and v == floor(v)
end

-- Lista limpia: solo ids válidos, sin repetir ni los de `excluidos`, como mucho MAX_POR_TIPO.
local function limpiar(lista, excluidos)
  local salida, vistos = {}, {}
  if type(lista) ~= "table" then
    return salida, vistos
  end
  for _, v in ipairs(lista) do
    if #salida >= MAX_POR_TIPO then
      break
    end
    if idValido(v) and not vistos[v] and not (excluidos and excluidos[v]) then
      vistos[v] = true
      salida[#salida + 1] = v
    end
  end
  return salida, vistos
end

---------------------------------------------------------------------------------------------------
-- Baganator
---------------------------------------------------------------------------------------------------

local function api_baganator()
  local bag = rawget(_G, "Baganator")
  return type(bag) == "table" and type(bag.API) == "table" and bag.API or nil
end

-- Pide a Baganator que repinte los botones de objeto (para que la esquina siga a las marcas).
local function refrescarBaganator()
  local api = api_baganator()
  if api and type(api.RequestItemButtonsRefresh) == "function" then
    pcall(api.RequestItemButtonsRefresh)
  end
end

-- onInit de Baganator: la esquina es una textura pequeña del botón. Se colorea en cada actualización.
local function alIniciarEsquina(boton)
  local esquina = boton:CreateTexture(nil, "OVERLAY")
  esquina:SetSize(10, 10)
  return esquina
end

-- onUpdate de Baganator: verdadero si el objeto del botón está marcado (y entonces se enseña la esquina).
local function alActualizarEsquina(esquina, detalles)
  local id = type(detalles) == "table" and detalles.itemID or nil
  local tipo = Marcas.de(id)
  if not tipo then
    return false
  end
  if esquina and esquina.SetColorTexture then
    local c = COLORES[tipo]
    esquina:SetColorTexture(c[1], c[2], c[3], 1)
  end
  return true
end

local registrada = false

local function registrarBaganator()
  if registrada then
    return
  end
  local api = api_baganator()
  if not api or type(api.RegisterCornerWidget) ~= "function" then
    return
  end
  registrada = true
  pcall(api.RegisterCornerWidget, "SnetForever", "snetforever_ia", alActualizarEsquina, alIniciarEsquina,
    {corner = "top_left", priority = 1})
end

---------------------------------------------------------------------------------------------------
-- Guardado y consulta
---------------------------------------------------------------------------------------------------

-- Índice {[id] = "vender" | "usar"} de lo guardado, para que de(id) sea una sola indexación (se llama en cada tooltip y en
-- cada botón de Baganator). Se reconstruye al poner y quitar y, de forma perezosa, cuando lo guardado es otra tabla que la
-- de la que salió (tras cargar las SavedVariables). Al reconstruirlo vuelve a acotar con limpiar: un SavedVariables editado
-- a mano no mete más de 50 ids por tipo ni ids que no sean enteros válidos.
local indice = {}
local origen = nil -- la tabla ia.marcas de la que salió el índice

local function reconstruir(guardadas)
  indice = {}
  origen = guardadas
  if type(guardadas) ~= "table" then
    return
  end
  local vender, enVender = limpiar(guardadas.vender)
  local usar = limpiar(guardadas.usar, enVender)
  for _, id in ipairs(vender) do
    indice[id] = "vender"
  end
  for _, id in ipairs(usar) do
    indice[id] = "usar"
  end
end

local function cambiaron()
  refrescarBaganator()
  SNF.Eventos.emitir("SNF_IA_MARCAS")
end

-- SnetForeverPJ.ia, que se crea si falta (la plantilla de Guardado ya la trae tras ADDON_LOADED).
local function iaParaEscribir()
  local ia = guardadoIa()
  if ia then
    return ia
  end
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj) ~= "table" then
    return nil
  end
  pj.ia = {}
  return pj.ia
end

function Marcas.poner(marcas)
  local ia = iaParaEscribir()
  if not ia then
    return false
  end
  if type(marcas) ~= "table" then
    marcas = {}
  end
  local vender, enVender = limpiar(marcas.vender)
  local usar = limpiar(marcas.usar, enVender)
  ia.marcas = {vender = vender, usar = usar}
  reconstruir(ia.marcas)
  cambiaron()
  return true
end

function Marcas.quitar()
  local ia = guardadoIa()
  if ia then
    ia.marcas = {vender = {}, usar = {}}
    reconstruir(ia.marcas)
  else
    reconstruir(nil)
  end
  cambiaron()
end

function Marcas.de(id)
  if type(id) ~= "number" or esSecreto(id) then
    return nil
  end
  local ia = guardadoIa()
  local guardadas = ia and ia.marcas
  if guardadas ~= origen then
    reconstruir(guardadas)
  end
  return indice[id]
end

function Marcas.lista()
  local salida, porId = {}, {}
  for _, o in ipairs(SNF.Inventario.bolsas().objetos) do
    local tipo = Marcas.de(o.id)
    if tipo then
      local entrada = porId[o.id]
      if not entrada then
        local info = API.infoObjeto(o.id)
        entrada = {id = o.id, tipo = tipo, nombre = info and info.nombre or format("[%d]", o.id), n = 0, posiciones = {}}
        porId[o.id] = entrada
        salida[#salida + 1] = entrada
      end
      entrada.n = entrada.n + o.n
      for _, posicion in ipairs(o.b) do
        entrada.posiciones[#entrada.posiciones + 1] = {posicion[1], posicion[2]}
      end
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Tooltip
---------------------------------------------------------------------------------------------------

-- Añade la línea de la marca al tooltip del objeto `id`, salvo que no haya marca o el tooltip sea del sistema protegido.
local function lineaEnTooltip(tooltip, id)
  if type(tooltip) ~= "table" or not idValido(id) then
    return
  end
  local tipo = Marcas.de(id)
  if not tipo then
    return
  end
  if tooltip.IsForbidden then
    local ok, prohibido = pcall(tooltip.IsForbidden, tooltip)
    if not ok or prohibido then
      return
    end
  end
  local texto = SNF.L.t(tipo == "vender" and "MARCA_VENDER" or "MARCA_USAR")
  tooltip:AddLine(COLOR_LINEA .. texto .. "|r", 1, 1, 1, true)
end

-- Motor moderno: llamada posterior de TooltipDataProcessor para los objetos; data.id es el id del objeto.
local function alMostrarDatos(tooltip, data)
  local id = type(data) == "table" and data.id or nil
  if type(id) == "number" and not esSecreto(id) then
    lineaEnTooltip(tooltip, id)
  end
end

-- Respaldo: OnTooltipSetItem de GameTooltip; el id sale del enlace que da GetItem().
local function alMostrarObjeto(tooltip)
  if type(tooltip) ~= "table" or not tooltip.GetItem then
    return
  end
  local _, enlace = tooltip:GetItem()
  if type(enlace) ~= "string" or esSecreto(enlace) then
    return
  end
  lineaEnTooltip(tooltip, tonumber(enlace:match("item:(%d+)")))
end

local function instalarTooltip()
  local procesador = rawget(_G, "TooltipDataProcessor")
  local enum = rawget(_G, "Enum")
  local tipos = type(enum) == "table" and enum.TooltipDataType or nil
  local tipoObjeto = type(tipos) == "table" and tipos.Item or nil
  if type(procesador) == "table" and type(procesador.AddTooltipPostCall) == "function" and tipoObjeto ~= nil then
    procesador.AddTooltipPostCall(tipoObjeto, alMostrarDatos)
    return
  end
  local tooltip = rawget(_G, "GameTooltip")
  if type(tooltip) == "table" and tooltip.HookScript and (not tooltip.HasScript or tooltip:HasScript("OnTooltipSetItem")) then
    tooltip:HookScript("OnTooltipSetItem", alMostrarObjeto)
  end
end

instalarTooltip()
registrarBaganator()
SNF.Eventos.escuchar("PLAYER_LOGIN", registrarBaganator)
