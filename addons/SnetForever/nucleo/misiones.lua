-- SnetForever: estado de las misiones del jugador (plano 1, §6.2). Cada pregunta prueba varias APIs en cadena
-- porque no se sabe cuáles tiene el cliente Forever, y añade un margen de tiempo tras los eventos de aceptar y
-- entregar, porque el servidor tarda en reflejarlos:
--   entregada(q)  C_QuestLog.IsQuestFlaggedCompleted → IsQuestFlaggedCompleted → GetQuestsCompleted()[q];
--                 verdadera durante 5 s tras QUEST_TURNED_IN(q).
--   enDiario(q)   C_QuestLog.IsOnQuest → C_QuestLog.GetLogIndexForQuestID → recorrer GetQuestLogTitle;
--                 verdadera durante 2 s tras QUEST_ACCEPTED; QUEST_REMOVED y QUEST_TURNED_IN lo anulan.
--   completa(q)   C_QuestLog.IsComplete → 6.º valor de GetQuestLogTitle.
--   objetivo(q,k) C_QuestLog.GetQuestObjectives → GetQuestLogLeaderBoard. Devuelve también `tipo` (monster, item,
--                 object, event...): el del juego o, si no lo trae, el de los objetivos de la base de misiones.
--   duenaDeObjeto(id) T1: la misión del diario con un objetivo de ese objeto (por el nombre del juego) y su índice.
--   casaConBase(q, k) T2: false si el juego da para el objetivo k un tipo que no es el que espera la base.
local _, SNF = ...
local Misiones = {}
SNF.Misiones = Misiones

local L = SNF.L

local MARGEN_ENTREGA = 5 -- segundos que una misión recién entregada cuenta como entregada
local MARGEN_ACEPTADA = 2 -- segundos que una misión recién aceptada cuenta como en el diario

local entregadaEn = {} -- [q] = GetTime() de su QUEST_TURNED_IN
local aceptadaEn = {} -- [q] = GetTime() de su QUEST_ACCEPTED
local completadas -- caché de GetQuestsCompleted(); se rehace tras QUEST_TURNED_IN

-- Índice de la misión q en el registro, o nil si no está. Sin APIs de índice, recorre GetQuestLogTitle.
local function indice(q)
  if C_QuestLog and C_QuestLog.GetLogIndexForQuestID then
    -- El juego devuelve 0 (no nil) cuando la misión no está en el registro.
    local i = C_QuestLog.GetLogIndexForQuestID(q)
    return (i and i > 0) and i or nil
  end
  if GetQuestLogTitle and GetNumQuestLogEntries then
    for i = 1, (GetNumQuestLogEntries()) do
      -- Valores de GetQuestLogTitle: título, nivel, grupo, cabecera, plegada, completa, frecuencia, id.
      if select(8, GetQuestLogTitle(i)) == q then
        return i
      end
    end
  end
  return nil
end

-- ¿Se ha entregado alguna vez?
function Misiones.entregada(q)
  local cuando = entregadaEn[q]
  if cuando and GetTime() - cuando <= MARGEN_ENTREGA then
    return true
  end
  if C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted then
    return C_QuestLog.IsQuestFlaggedCompleted(q) and true or false
  end
  if IsQuestFlaggedCompleted then
    return IsQuestFlaggedCompleted(q) and true or false
  end
  if GetQuestsCompleted then
    completadas = completadas or GetQuestsCompleted()
    return completadas[q] and true or false
  end
  return false
end

-- 12-nov: ¿ya se puede fiar de que una misión NO está en el diario? Justo al entrar al juego el registro puede estar
-- vacío aunque el jugador tenga misiones: se da por cargado en cuanto tiene alguna misión o pasados ESPERA_REGISTRO
-- segundos desde que cargó el addon (un jugador sin ninguna misión).
local ESPERA_REGISTRO = 15
local inicio = GetTime and GetTime() or 0
local registroListo = false

function Misiones.registroListo()
  if registroListo then
    return true
  end
  local n
  if C_QuestLog and C_QuestLog.GetNumQuestLogEntries then
    local entradas, misiones = C_QuestLog.GetNumQuestLogEntries()
    n = misiones or entradas
  elseif GetNumQuestLogEntries then
    local entradas, misiones = GetNumQuestLogEntries()
    n = misiones or entradas
  end
  if (n and n > 0) or GetTime() - inicio >= ESPERA_REGISTRO then
    registroListo = true
  end
  return registroListo
end

-- 12-nov (en el juego: «todavía me manda hacer misiones que no tengo»: la guía mandaba a cazar a Shadumbra y el juego no
-- daba la misión porque faltaba «La Caza de Vallefresno»): ¿puede el personaje coger la misión q? No si le falta una
-- previa (de preQuestSingle basta una; de preQuestGroup, todas) que ni está entregada ni en el diario, o si ya hizo o
-- lleva una excluyente. Devuelve true, o false y la previa que falta (la primera; nil si es por una excluyente). Una
-- misión que ya está en el diario o entregada, o que no está en la base, cuenta como disponible. `previsto` (opcional,
-- la previsión de la guía, motor/pasos.lua): {diario = {[q] = true}, entregadas = {[q] = true}} con lo que los pasos
-- de antes darán por el camino.
function Misiones.disponible(q, previsto)
  local function hecha(p)
    return Misiones.entregada(p) or Misiones.enDiario(p)
      or (previsto ~= nil and (previsto.entregadas[p] or previsto.diario[p])) and true or false
  end
  if hecha(q) then
    return true
  end
  local m = SNF.Datos and SNF.Datos.mision(q)
  if type(m) ~= "table" then
    return true
  end
  local sola = m.preQuestSingle
  if type(sola) == "table" and #sola > 0 then
    local alguna = false
    for _, p in ipairs(sola) do
      if hecha(p) then
        alguna = true
        break
      end
    end
    if not alguna then
      return false, sola[1]
    end
  end
  for _, p in ipairs(type(m.preQuestGroup) == "table" and m.preQuestGroup or {}) do
    if not hecha(p) then
      return false, p
    end
  end
  for _, otra in ipairs(type(m.exclusiveTo) == "table" and m.exclusiveTo or {}) do
    if hecha(otra) then
      return false, nil
    end
  end
  return true
end

-- 12-nov: lo que usan la guía y los elementos: con el ajuste pasos.saltarNoDisponibles (encendido por defecto) y el
-- registro ya cargado, ¿la misión q no se puede coger? Devuelve true y la previa que falta, o false.
function Misiones.noSePuedeCoger(q, previsto)
  local Ajustes = SNF.Ajustes
  if (Ajustes and Ajustes.get("pasos.saltarNoDisponibles") == false) or not Misiones.registroListo() then
    return false
  end
  local puede, previa = Misiones.disponible(q, previsto)
  if puede then
    return false
  end
  return true, previa
end

-- ¿La tengo en el diario?
function Misiones.enDiario(q)
  local cuando = aceptadaEn[q]
  if cuando and GetTime() - cuando <= MARGEN_ACEPTADA then
    return true
  end
  if C_QuestLog and C_QuestLog.IsOnQuest then
    return C_QuestLog.IsOnQuest(q) and true or false
  end
  return indice(q) ~= nil
end

-- ¿Tiene todos los objetivos hechos? Una misión que no está en el diario no está completa.
function Misiones.completa(q)
  if C_QuestLog and C_QuestLog.IsComplete then
    return C_QuestLog.IsComplete(q) and true or false
  end
  local i = indice(q)
  if i and GetQuestLogTitle then
    -- 6.º valor: 1 completa, -1 fallida, nil en curso.
    local completa = select(6, GetQuestLogTitle(i))
    return completa == 1 or completa == true
  end
  return false
end

-- Objetivo k de una misión del diario, a partir del registro: desc «Jabalí abatido: 3/7» → 3 de 7; un objetivo
-- sin números cuenta 0/1 (o 1/1 si está hecho).
local function objetivoDelRegistro(q, k)
  if not GetQuestLogLeaderBoard then
    return nil
  end
  local i = indice(q)
  if not i then
    return nil
  end
  if GetNumQuestLeaderBoards and k > GetNumQuestLeaderBoards(i) then
    return nil
  end
  local texto, tipo, terminado = GetQuestLogLeaderBoard(k, i)
  if not texto then
    return nil
  end
  local hecho, pedido = string.match(texto, "(%d+)/(%d+)")
  if hecho then
    return {texto = texto, hecho = tonumber(hecho), pedido = tonumber(pedido), terminado = terminado and true or false,
      tipo = tipo}
  end
  return {texto = texto, hecho = terminado and 1 or 0, pedido = 1, terminado = terminado and true or false,
    tipo = tipo}
end

-- Tipo del objetivo k según la base de misiones (QuestieDB): grupos de `objectives` 1 criaturas, 2 objetos,
-- 3 objetos de misión, 5 crédito de muerte (criaturas) y 6 hechizos; se cuentan en ese orden, que es el del
-- diario. nil si la base no tiene la misión o no llega a k objetivos.
local GRUPOS_TIPO = {{1, "monster"}, {2, "object"}, {3, "item"}, {5, "monster"}, {6, "event"}}

local function tipoDeBase(q, k)
  local mision = SNF.Datos and SNF.Datos.mision(q)
  local grupos = mision and mision.objectives
  if type(grupos) ~= "table" then
    return nil
  end
  local cuenta = 0
  for _, g in ipairs(GRUPOS_TIPO) do
    local lista = grupos[g[1]]
    cuenta = cuenta + (type(lista) == "table" and #lista or 0)
    if k <= cuenta then
      return g[2]
    end
  end
  return nil
end

-- Tipo esperado del objetivo k según la base (monster, object, item, event) o nil; lo usa la navegación para no fiarse
-- de un índice que no casa con el diario.
Misiones.tipoDeBase = tipoDeBase

-- ¿Casa el objetivo k del juego con el k de la base? false si el juego da un tipo (monster, object, item...) y no es el que
-- espera la base (event para la exploración que va detrás de los objetivos del registro, triggerEnd): entonces el índice
-- no es fiable y no se usan los datos de la base para ese k. Sin tipo en el juego o sin el k en la base, casa. `o` (el
-- objetivo ya leído, o false si no existe; opcional) evita leerlo otra vez. Lo usan la navegación y «Objetivos cercanos».
function Misiones.casaConBase(q, k, o)
  local esperado = tipoDeBase(q, k)
  if esperado == nil then
    local mision = SNF.Datos and SNF.Datos.mision(q)
    if mision and mision.triggerEnd then
      esperado = "event"
    end
  end
  if o == nil then
    o = Misiones.objetivo(q, k)
  end
  local tipo = o and o.tipo or nil
  return not (tipo ~= nil and tipo ~= "" and esperado ~= nil and tipo ~= esperado)
end

-- El objetivo k de la misión q: {texto, hecho, pedido, terminado}, o nil si no existe. Una misión sin objetivos
-- que ya está completa (las de «habla con...») da un único objetivo sintético ya cumplido.
function Misiones.objetivo(q, k)
  local objetivo
  if C_QuestLog and C_QuestLog.GetQuestObjectives then
    local o = (C_QuestLog.GetQuestObjectives(q) or {})[k]
    if o then
      objetivo = {
        texto = o.text,
        hecho = o.numFulfilled,
        pedido = o.numRequired,
        terminado = o.finished and true or false,
        tipo = o.type,
      }
    end
  end
  objetivo = objetivo or objetivoDelRegistro(q, k)
  if objetivo then
    -- El juego puede no traer el tipo (o traerlo vacío): entonces el de la base.
    if objetivo.tipo == nil or objetivo.tipo == "" then
      objetivo.tipo = tipoDeBase(q, k)
    end
    return objetivo
  end
  if k == 1 and Misiones.completa(q) then
    return {texto = L.t("OBJETIVO_CUMPLIDO"), hecho = 1, pedido = 1, terminado = true, tipo = tipoDeBase(q, k)}
  end
  return nil
end

-- T1 (collect con misión dueña): las misiones del diario que piden el objeto `id`, por lo que dice el juego. Para cada
-- misión del registro (API.registroMisiones) se miran sus objetivos de tipo «item»: el texto sin la cuenta («Especias:
-- 0/1» → «Especias») tiene que ser el nombre que el juego da al objeto (C_Item.GetItemNameByID o GetItemInfo), sin
-- distinguir mayúsculas. Nada se deduce de la base. Sin el nombre del juego (aún no está en caché) no hay dueña y no se
-- memoriza; con él, se memoriza hasta el siguiente QUEST_LOG_UPDATE (y los eventos de aceptar, entregar o quitar una
-- misión). Ronda 1 (M5): con el registro incompleto (una cabecera plegada) tampoco se memoriza «sin dueña».
--   duenasDeObjeto(id) -> lista de {q, k} (k = índice del objetivo) o nil
--   duenaDeObjeto(id) -> q, k de la primera, o nil
local duenas = {} -- [id] = lista de {q, k} o false

local function nombreDelJuego(id)
  local item = rawget(_G, "C_Item")
  local f = type(item) == "table" and rawget(item, "GetItemNameByID")
  local nombre = type(f) == "function" and f(id) or nil
  if (type(nombre) ~= "string" or nombre == "") and SNF.API and SNF.API.infoObjeto then
    local info = SNF.API.infoObjeto(id)
    nombre = info and info.nombre
  end
  if type(nombre) ~= "string" or nombre == "" or (SNF.API and SNF.API.esSecreto(nombre)) then
    return nil
  end
  return nombre
end

local DOS_PUNTOS_ANCHOS = "\239\188\154" -- «：» (U+FF1A) en UTF-8

local function sinCuenta(texto)
  if type(texto) ~= "string" then
    return nil
  end
  texto = string.gsub(texto, "%d+%s*/%s*%d+", "")
  texto = string.gsub(texto, DOS_PUNTOS_ANCHOS, "")
  texto = string.gsub(texto, ":", "")
  texto = string.match(texto, "^%s*(.-)%s*$")
  return texto
end

function Misiones.duenasDeObjeto(id)
  if type(id) ~= "number" then
    return nil
  end
  local memo = duenas[id]
  if memo ~= nil then
    return memo or nil
  end
  local nombre = nombreDelJuego(id)
  if not nombre then
    return nil
  end
  nombre = string.lower(nombre)
  local lista, incompleto
  if SNF.API and SNF.API.registroMisiones then
    lista, incompleto = SNF.API.registroMisiones()
  end
  local halladas = {}
  for _, q in ipairs(lista or {}) do
    for k = 1, 10 do
      local o = Misiones.objetivo(q, k)
      if not o then
        break
      end
      local texto = sinCuenta(o.texto)
      if o.tipo == "item" and texto and string.lower(texto) == nombre then
        halladas[#halladas + 1] = {q = q, k = k}
      end
    end
  end
  if #halladas > 0 then
    duenas[id] = halladas
    return halladas
  end
  if not incompleto then
    duenas[id] = false
  end
  return nil
end

function Misiones.duenaDeObjeto(id)
  local lista = Misiones.duenasDeObjeto(id)
  if lista then
    return lista[1].q, lista[1].k
  end
  return nil
end

local function olvidarDuenas()
  duenas = {}
end

for _, evento in ipairs({"QUEST_LOG_UPDATE", "QUEST_ACCEPTED", "QUEST_REMOVED", "QUEST_TURNED_IN"}) do
  SNF.Eventos.escuchar(evento, olvidarDuenas)
end

SNF.Eventos.escuchar("QUEST_TURNED_IN", function(q)
  entregadaEn[q] = GetTime()
  aceptadaEn[q] = nil
  completadas = nil
end)

SNF.Eventos.escuchar("QUEST_ACCEPTED", function(...)
  -- Classic manda (índice, id); el motor moderno, solo (id).
  local q = select(2, ...) or select(1, ...)
  if q then
    aceptadaEn[q] = GetTime()
  end
end)

SNF.Eventos.escuchar("QUEST_REMOVED", function(q)
  aceptadaEn[q] = nil
end)
