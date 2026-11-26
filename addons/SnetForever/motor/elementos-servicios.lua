-- SnetForever: evaluadores de los elementos de servicios y viajes (instructor, vendedor, vuelos, piedra de hogar),
-- hechizos, auras, profesiones, reputación, tiempos de reutilización y charlas (plano 2 §8 y §9). Solo detectan que
-- el jugador lo ha hecho él (§4 del diseño): no se entrena, compra, vuela, vincula, elige opciones de charla ni se
-- acepta la pérdida de experiencia por él.
--
-- Usa la regla común de las condiciones (campo `efecto`, `invertir`) de motor/elementos-mundo.lua. Lo que ocurre
-- «en un momento» (cerrar una ventana, lanzar un hechizo, aterrizar) se apunta en `mem` y no se pierde en los
-- repasos siguientes; lo que es un estado (el aura, el nivel, la reputación) se vuelve a leer cada vez.
-- T1: son puros (Elementos.esPuro) train, istrained, fp, skill y reputation. Los demás dependen de un evento o de lo
-- apuntado en mem (vendor, trainer, stable, fly, hs, home, deathskip, cast, aura, cooldown, gossipoption, next).
--
-- Este archivo también crea dos módulos que usarán las tareas siguientes:
--   Profesiones.nivel(p[, maximo]) -> nivel de la profesión `p` («cooking»…), -1 si no la tiene, nil si `p` no está en
--       la tabla o no se puede saber. Con `maximo`, el nivel máximo de la línea.
--   Profesiones.SKILL[p] = id de su línea de habilidad (171 alquimia...), el de requiredSkill de las misiones.
--   Reputacion.de(faccion) -> {rango 1-8, valor, largo} (valor = puntos dentro del rango, largo = lo que mide el
--       rango) o nil si no se conoce la facción.
local _, SNF = ...
local API = SNF.API -- compatibilidad con el cliente (nucleo/espacio.lua)
local Elementos = SNF.Elementos
local hechoPendiente = Elementos.hechoPendiente
local conEfecto = Elementos.conEfecto
local sinMedir = Elementos.sinMedir

local Profesiones = {}
SNF.Profesiones = Profesiones
local Reputacion = {}
SNF.Reputacion = Reputacion

---------------------------------------------------------------------------------------------------
-- Profesiones y reputación (módulos de consulta)
---------------------------------------------------------------------------------------------------

-- Hechizo cuyo nombre localizado es el de la línea de habilidad de cada profesión (RXPGuides/DB/forever/db.lua:
-- 251-268 y RXPGuides.lua:375-393). `riding` y compañía no tienen: en Forever se deducen por los objetos de montura.
local HECHIZO_DE_PROFESION = {
  alchemy = 2259,
  blacksmithing = 2018,
  enchanting = 7411,
  engineering = 4036,
  herbalism = 9134,
  leatherworking = 2108,
  mining = 2575,
  skinning = 8613,
  tailoring = 3908,
  cooking = 2550,
  firstaid = 3273,
  fishing = 7620,
  lockpicking = 1809,
  poisons = 2842,
}

-- Nombre localizado de un hechizo, o nil si el cliente aún no lo tiene en caché.
local function nombreDeHechizo(id)
  if C_Spell and C_Spell.GetSpellName then
    local nombre = C_Spell.GetSpellName(id)
    if nombre then
      return nombre
    end
  end
  if GetSpellInfo then
    return (GetSpellInfo(id))
  end
  return nil
end

-- Id de la línea de habilidad de cada profesión (los skillId de QuestieDB que usa requiredSkill; motor/requisitos.lua
-- saca de aquí su tabla inversa). En Forever se pregunta por id (C_SkillInfo.GetSkillLineInfoByID), sin depender del
-- idioma; RXPGuides compara nombres (RXPGuides.lua:409-439), que es lo que queda de respaldo para la API vieja.
local SKILL_DE_PROFESION = {
  alchemy = 171, blacksmithing = 164, enchanting = 333, engineering = 202, herbalism = 182, leatherworking = 165,
  mining = 186, skinning = 393, tailoring = 197, cooking = 185, firstaid = 129, fishing = 356, lockpicking = 633,
  poisons = 40,
}
Profesiones.SKILL = SKILL_DE_PROFESION

-- Con la API vieja: la línea cuyo nombre es el del hechizo de la profesión (localizado por el cliente).
local function nivelPorNombre(p, maximo)
  local id = HECHIZO_DE_PROFESION[p]
  local nombre = id and nombreDeHechizo(id)
  if not nombre then
    return nil
  end
  for linea, rango, rangoMaximo in API.habilidades() do
    if linea == nombre then
      if maximo then
        return rangoMaximo or -1
      end
      return rango or -1
    end
  end
  return -1
end

function Profesiones.nivel(p, maximo)
  local skill = SKILL_DE_PROFESION[p]
  if not skill then
    return nil
  end
  local rango, rangoMaximo = API.habilidadPorId(skill)
  if rango == false then
    return nivelPorNombre(p, maximo) -- cliente sin C_SkillInfo.GetSkillLineInfoByID
  end
  if rango == nil then
    -- Por id no la tiene. Si el cliente aún tiene la API vieja, manda ella (por nombre); si no, no la tiene.
    if API.hayHabilidadesPorNombre() then
      return nivelPorNombre(p, maximo)
    end
    return -1
  end
  if maximo then
    return rangoMaximo
  end
  return rango
end

function Reputacion.de(faccion)
  if C_Reputation and C_Reputation.GetFactionDataByID then
    local d = C_Reputation.GetFactionDataByID(faccion)
    if d then
      return {
        rango = d.reaction,
        valor = d.currentStanding - d.currentReactionThreshold,
        largo = d.nextReactionThreshold - d.currentReactionThreshold,
      }
    end
  end
  if GetFactionInfoByID then
    local _, _, rango, minimo, maximo, actual = GetFactionInfoByID(faccion)
    if rango then
      return {rango = rango, valor = actual - minimo, largo = maximo - minimo}
    end
  end
  return nil
end

---------------------------------------------------------------------------------------------------
-- Instructor, vendedor y cuidador de mascotas (plano 2 §8)
---------------------------------------------------------------------------------------------------

-- ¿Es un valor secreto del motor moderno? (issecretvalue; sin la función, ninguno lo es). Mismo patrón que
-- mapa/cercanos.lua: el secreto se mira antes de comparar o partir el valor.
local function esSecreto(valor)
  local f = rawget(_G, "issecretvalue")
  if type(f) ~= "function" then
    return false
  end
  local ok, secreto = pcall(f, valor)
  return ok and secreto == true
end

-- ID del PNJ con el que se habla: el 6.º trozo de su GUID («Creature-0-mapa-instancia-zona-ID-copia»). nil si no hay
-- GUID, si es secreto o si no se puede leer.
local function idDelNpc()
  local f = rawget(_G, "UnitGUID")
  if type(f) ~= "function" then
    return nil
  end
  local ok, guid = pcall(f, "npc")
  if not ok or esSecreto(guid) or type(guid) ~= "string" then -- primero esSecreto: nada se compara antes
    return nil
  end
  local bien, id = pcall(function()
    return tonumber((select(6, strsplit("-", guid))))
  end)
  return bien and id or nil
end

-- Plano 2 §8 «.vendor/.trainer/.stable [idPNJ]» (functions.lua:3706-3781): al abrir la ventana se apunta el PNJ y, al
-- cerrarla, el elemento se completa si es el PNJ pedido o no se pidió ninguno. Una ventana que se cierra sin haberla
-- visto abrirse (el paso se activó con ella abierta) no cuenta. No se compra ni se vende nada.
local function registrarServicio(t, alAbrir, alCerrar)
  Elementos.registrar(t, {
    campos = {},
    opcionales = {"npc"},
    eventos = {alAbrir, alCerrar},
    evaluar = function(el, mem, evento)
      if evento == alAbrir then
        mem.abierta = true
        mem.npc = idDelNpc()
      elseif evento == alCerrar and mem.abierta then
        mem.abierta = nil
        if el.npc == nil or mem.npc == el.npc then
          mem.hecho = true
        end
      end
      return hechoPendiente(mem.hecho)
    end,
  })
end

registrarServicio("vendor", "MERCHANT_SHOW", "MERCHANT_CLOSED")
registrarServicio("trainer", "TRAINER_SHOW", "TRAINER_CLOSED")
registrarServicio("stable", "PET_STABLE_SHOW", "PET_STABLE_CLOSED")

-- ¿Conoce el jugador el hechizo? IsPlayerSpell o, si el cliente no lo tiene, IsSpellKnown (RXPGuides.lua:323).
local function conoce(id)
  if IsPlayerSpell then
    return IsPlayerSpell(id) and true or false
  end
  if IsSpellKnown then
    return IsSpellKnown(id) and true or false
  end
  return false
end

-- Plano 2 §8 «.train idHechizo[,flags]» (functions.lua:3965-4034): se cumple si conoces el hechizo. Sin comprarlo
-- por el jugador (RestedXP compra solo al instructor lo de los pasos activos; aquí lo hace el jugador).
Elementos.registrar("train", {
  puro = true,
  campos = {"spell", "efecto"},
  opcionales = {"invertir"},
  eventos = {"TRAINER_SHOW", "CHAT_MSG_SYSTEM", "SKILL_LINES_CHANGED", "TRAINER_UPDATE"},
  evaluar = function(el)
    return conEfecto(el, conoce(el.spell))
  end,
})

-- Plano 2 §8 «.istrained id1,id2,…» (functions.lua:4049-4072): salta el paso si conoces alguno de los hechizos.
Elementos.registrar("istrained", {
  puro = true,
  campos = {"spells"},
  eventos = {"SKILL_LINES_CHANGED"},
  evaluar = function(el)
    for i = 1, #el.spells do
      if conoce(el.spells[i]) then
        return "saltar_paso"
      end
    end
    return "info"
  end,
})

---------------------------------------------------------------------------------------------------
-- Vuelos, piedra de hogar y muerte (plano 2 §8)
---------------------------------------------------------------------------------------------------

-- ¿Alguno de los argumentos del evento es el texto `buscado`? (UI_INFO_MESSAGE trae (tipo, mensaje) en unos
-- clientes y solo (mensaje) en otros.)
local function trae(buscado, ...)
  for i = 1, select("#", ...) do
    if select(i, ...) == buscado then
      return true
    end
  end
  return false
end

-- Estado del nodo en el que está el jugador (Enum.FlightPathState.Current; 0 en el motor moderno si no hay Enum).
local function estadoActual()
  local enum = rawget(_G, "Enum")
  local estados = type(enum) == "table" and rawget(enum, "FlightPathState")
  return type(estados) == "table" and estados.Current or 0
end

-- Al abrir el mapa de vuelos: ¿está el jugador en un nodo (estado «actual»), o hay uno cuyo nombre contiene `nombre`
-- (sin distinguir mayúsculas)? Lo primero no depende del idioma: el nombre de la guía viene en inglés y en un cliente
-- en español los nodos se llaman distinto (tarea 22). Abrir el mapa en un maestro de vuelo es tener ya su ruta.
local function hayNodo(nombre)
  if not (C_TaxiMap and C_TaxiMap.GetAllTaxiNodes) then
    return false
  end
  local mapa = (GetTaxiMapID and GetTaxiMapID()) or C_Map.GetBestMapForUnit("player")
  local nodos = C_TaxiMap.GetAllTaxiNodes(mapa)
  local actual = estadoActual()
  local buscado = nombre and string.lower(nombre)
  for i = 1, #(nodos or {}) do
    local nodo = nodos[i]
    if nodo.state == actual then
      return true
    end
    if buscado and nodo.name and string.find(string.lower(nodo.name), buscado, 1, true) then
      return true
    end
  end
  return false
end

-- Plano 2 §8 «.fp [nombre][,flags]» (functions.lua:2754-2831): se completa con el mensaje de «ruta nueva»
-- (ERR_NEWTAXIPATH; `ignorarMensaje`, flag 2, lo ignora) o al abrir el mapa de vuelos estando en un nodo (estado
-- «actual», sin depender del idioma) o con un nodo de ese nombre. No elige el vuelo ni llama a TakeTaxiNode.
-- T1: también es hecho si el vuelo ya se conoce: mem.maestros (lo pone el motor de pasos: los target del paso o, sin
-- ellos, el maestro de la base junto al goto del paso) tiene un maestro que está entre los vuelos apuntados
-- (SNF.Viaje.conoce). Sin maestros, o sin vuelos apuntados, como antes.
local function vueloConocido(maestros)
  local Viaje = SNF.Viaje
  if type(maestros) ~= "table" or not Viaje then
    return false
  end
  for i = 1, #maestros do
    if Viaje.conoce(maestros[i]) then
      return true
    end
  end
  return false
end

Elementos.registrar("fp", {
  puro = true,
  campos = {},
  opcionales = {"nombre", "ignorarMensaje"},
  eventos = {"UI_INFO_MESSAGE", "TAXIMAP_OPENED"},
  evaluar = function(el, mem, evento, ...)
    if not mem.hecho and vueloConocido(mem.maestros) then
      return "hecho"
    end
    if not mem.hecho then
      if evento == "UI_INFO_MESSAGE" then
        if not el.ignorarMensaje and trae(ERR_NEWTAXIPATH, ...) then
          mem.hecho = true
        end
      elseif evento == "TAXIMAP_OPENED" and hayNodo(el.nombre) then
        mem.hecho = true
      end
    end
    return hechoPendiente(mem.hecho)
  end,
})

-- Plano 2 §8 «.fly destino [>>texto]» (functions.lua:2833-2901): se completa al ir en un vuelo (UnitOnTaxi). Ni
-- elige el destino ni toma el vuelo por el jugador; al aterrizar sigue hecho.
Elementos.registrar("fly", {
  campos = {},
  opcionales = {"destino"},
  eventos = {"PLAYER_CONTROL_LOST", "ZONE_CHANGED"},
  evaluar = function(_, mem)
    if UnitOnTaxi("player") then
      mem.hecho = true
    end
    return hechoPendiente(mem.hecho)
  end,
})

-- Hechizos con los que se usa la piedra de hogar: ella misma, Retorno astral y la piedra de la Tierra Perdida
-- (plano 2 §8 «.hs», functions.lua:2572-2609).
local HECHIZOS_DE_HOGAR = {[8690] = true, [556] = true, [184871] = true}

-- UNIT_SPELLCAST_SUCCEEDED(unidad, castGUID, idHechizo): ¿lo lanzó `unidad` y es de la lista?
local function lanzo(unidad, lista, evento, quien, _, id)
  return evento == "UNIT_SPELLCAST_SUCCEEDED" and quien == unidad and lista[id] == true
end

Elementos.registrar("hs", {
  campos = {},
  eventos = {"UNIT_SPELLCAST_SUCCEEDED"},
  evaluar = function(_, mem, evento, quien, guid, id)
    if lanzo("player", HECHIZOS_DE_HOGAR, evento, quien, guid, id) then
      mem.hecho = true
    end
    return hechoPendiente(mem.hecho)
  end,
})

-- Plano 2 §8 «.home [idÁrea] [>>texto]» (functions.lua:2657-2705): se completa con HEARTHSTONE_BOUND, o si
-- GetBindLocation() ya es el nombre del área. No vincula nada ni confirma el aviso de Blizzard.
Elementos.registrar("home", {
  campos = {},
  opcionales = {"area"},
  eventos = {"HEARTHSTONE_BOUND"},
  evaluar = function(el, mem, evento)
    if evento == "HEARTHSTONE_BOUND" then
      mem.vinculada = true
    end
    local hecho = mem.vinculada
    if not hecho and el.area then
      local nombre = C_Map.GetAreaInfo(el.area)
      hecho = nombre ~= nil and GetBindLocation() == nombre
    end
    return hechoPendiente(hecho)
  end,
})

-- Plano 2 §8 «.deathskip» (functions.lua:2907-2940): se completa al volver a la vida desde fantasma estando el paso
-- activo (PLAYER_UNGHOST). Ver que ya eres fantasma al activarse el paso o al liberar el espíritu (PLAYER_ALIVE)
-- también vale. No acepta la pérdida de experiencia ni elige nada con el sanador.
Elementos.registrar("deathskip", {
  campos = {},
  eventos = {"PLAYER_DEAD", "PLAYER_ALIVE", "PLAYER_UNGHOST"},
  evaluar = function(_, mem, evento)
    if UnitIsGhost("player") then
      mem.fantasma = true
    elseif evento == "PLAYER_UNGHOST" and mem.fantasma then
      mem.hecho = true
    end
    return hechoPendiente(mem.hecho)
  end,
})

-- Plano 2 §9 «.cast [unidad,]idHechizo1,id2,…» (functions.lua:4841-4896): se completa cuando la unidad (el jugador
-- por defecto) lanza con éxito alguno de los hechizos.
Elementos.registrar("cast", {
  campos = {"spells"},
  opcionales = {"unidad"},
  eventos = {"UNIT_SPELLCAST_SUCCEEDED"},
  evaluar = function(el, mem, evento, quien, guid, id)
    if not mem.hecho and evento == "UNIT_SPELLCAST_SUCCEEDED" then
      local lista = {}
      for i = 1, #el.spells do
        lista[el.spells[i]] = true
      end
      if lanzo(el.unidad or "player", lista, evento, quien, guid, id) then
        mem.hecho = true
      end
    end
    return hechoPendiente(mem.hecho)
  end,
})

---------------------------------------------------------------------------------------------------
-- Auras, profesiones, reputación y tiempos (plano 2 §9)
---------------------------------------------------------------------------------------------------

-- Busca un aura de la unidad por el id de su hechizo. Devuelve {cuenta, restante} (restante nil = permanente) o nil.
-- La lee SNF.API (C_UnitAuras; en un cliente viejo, UnitBuff/UnitDebuff 1-32).
local function buscarAura(spell, unidad)
  local a = API.auraPorHechizo(unidad, spell)
  if not a then
    return nil
  end
  local restante = nil
  if a.expira and a.expira > 0 then
    restante = a.expira - GetTime()
  end
  return {cuenta = math.max(a.cuenta or 1, 1), restante = restante}
end

-- Plano 2 §9 «.aura [-]idHechizo[,duración][,unidad]» (functions.lua:7852-7937): el aura está; con `dur`, con más de
-- esos segundos restantes (o permanente); con `cargas`, con al menos esas cargas. El efecto (completa o salta el
-- paso) y `invertir` los fija la fase 1 y los aplica la regla común.
Elementos.registrar("aura", {
  campos = {"spell", "efecto"},
  opcionales = {"dur", "cargas", "invertir", "unidad"},
  eventos = {"UNIT_AURA"},
  evaluar = function(el, mem)
    -- Con las auras como «valores secretos» (C_Secrets.ShouldAurasBeSecret, motor moderno) no se pueden comparar sus
    -- campos sin error: se devuelve lo de la última vez que se pudieron leer (o info, que no bloquea ni salta).
    if API.aurasSecretas() then
      if mem.leida then
        return mem.resultado, mem.extra
      end
      return sinMedir(el)
    end
    local a = buscarAura(el.spell, el.unidad or "player")
    local cumple = a ~= nil
    if a then
      if el.cargas then
        cumple = a.cuenta >= el.cargas
      elseif el.dur then
        cumple = a.restante == nil or a.restante > el.dur
      end
    end
    local resultado, extra = conEfecto(el, cumple)
    mem.leida, mem.resultado, mem.extra = true, resultado, extra
    return resultado, extra
  end,
})

-- Plano 2 §9 «.skill profesión,[<]N[,s[,max]]» (functions.lua:3439-3507): nivel de la profesión ≥ N (con `maximo`,
-- se mira el nivel máximo de la línea). Una profesión sin hechizo en la tabla (`riding`…) o sin nombre aún en la
-- caché del cliente solo informa.
Elementos.registrar("skill", {
  puro = true,
  campos = {"p", "n", "efecto"},
  opcionales = {"invertir", "maximo"},
  eventos = {"SKILL_LINES_CHANGED"},
  evaluar = function(el)
    local nivel = Profesiones.nivel(el.p, el.maximo)
    if nivel == nil then
      return sinMedir(el)
    end
    return conEfecto(el, nivel >= el.n)
  end,
})

-- Plano 2 §9 «.reputation idFacción,rango[,[<]valor][,s]» (functions.lua:3596-3704): rango ≥ el pedido y, con
-- `valor`: ≥ 1, ese número de puntos dentro del rango; entre 0 y 1, esa fracción del rango; negativo, estar a esos
-- puntos de llegar (en el rango anterior). Una facción que el cliente no conoce da info.
Elementos.registrar("reputation", {
  puro = true,
  campos = {"faccion", "rango", "efecto"},
  opcionales = {"valor", "invertir"},
  eventos = {"UPDATE_FACTION"},
  evaluar = function(el)
    local r = Reputacion.de(el.faccion)
    if not r then
      return sinMedir(el)
    end
    local valor = el.valor or 0
    local cumple
    if valor < 0 then
      cumple = r.rango >= el.rango or (r.rango == el.rango - 1 and r.valor >= r.largo + valor)
    elseif valor >= 1 then
      cumple = r.rango > el.rango or (r.rango == el.rango and r.valor >= valor)
    else
      cumple = r.rango > el.rango or (r.rango == el.rango and r.valor >= r.largo * valor)
    end
    return conEfecto(el, cumple)
  end,
})

local PIEDRA_DE_HOGAR = 6948
local RETORNO_ASTRAL = 556
local MINIMO_COOLDOWN = 2 -- segundos: el mínimo de la comparación (plano 2 §9); menos de 2 s cuenta como «lista»

-- Segundos que faltan para poder usar el hechizo o el objeto; 0 si está lista; nil si no se puede saber (tipo que no
-- se mira o API que falta). La piedra de hogar de un chamán cuenta también el Retorno astral, que la comparte.
local function restante(tipo, id)
  local inicio, duracion
  if tipo == "spell" then
    inicio, duracion = API.enfriamientoHechizo(id) -- C_Spell.GetSpellCooldown (tabla) → GetSpellCooldown
  elseif tipo == "item" then
    inicio, duracion = API.enfriamientoObjeto(id) -- C_Item → C_Container → GetItemCooldown
  else
    return nil
  end
  if inicio == nil then
    return nil -- sin API o con los tiempos secretos
  end
  local falta = 0
  if inicio and duracion and inicio > 0 and duracion > 0 then
    falta = math.max(0, inicio + duracion - GetTime())
  end
  if tipo == "item" and id == PIEDRA_DE_HOGAR then
    local _, clase = UnitClass("player")
    if clase == "SHAMAN" then
      falta = math.max(falta, restante("spell", RETORNO_ASTRAL) or 0)
    end
  end
  return falta
end

-- Plano 2 §9 «.cooldown tipo,id,[<|>]N[m|s][,1]» (functions.lua:6325-6411): lo que falta es `op` (< o >) que el máximo
-- entre `seg` y 2 s. Con `unaVez` solo se evalúa la primera vez. Solo se miran los tipos spell e item; los demás
-- (action, pet, inventory) informan.
Elementos.registrar("cooldown", {
  campos = {"tipo", "id", "op", "seg", "efecto"},
  opcionales = {"unaVez"},
  eventos = {"SPELL_UPDATE_COOLDOWN", "PLAYER_REGEN_ENABLED"},
  evaluar = function(el, mem)
    if el.unaVez and mem.guardado then
      return mem.resultado, mem.extra
    end
    local falta = restante(el.tipo, el.id)
    if falta == nil or (el.op ~= "<" and el.op ~= ">") then
      return sinMedir(el)
    end
    local umbral = math.max(el.seg, MINIMO_COOLDOWN)
    local cumple
    if el.op == "<" then
      cumple = falta < umbral
    else
      cumple = falta > umbral
    end
    local resultado, extra = conEfecto(el, cumple)
    if el.unaVez then
      mem.guardado = true
      mem.resultado, mem.extra = resultado, extra
    end
    return resultado, extra
  end,
})

---------------------------------------------------------------------------------------------------
-- Charla y encadenado de guías (plano 2 §8 y §10)
---------------------------------------------------------------------------------------------------

-- Plano 2 §8 «.gossipoption idOpción [>>texto]» (functions.lua:5898-5955): con GOSSIP_SHOW, si la charla abierta trae
-- esa opción (C_GossipInfo.GetOptions) se completa. No la elige: lo hace el jugador. Sin C_GossipInfo solo informa.
Elementos.registrar("gossipoption", {
  campos = {"id"},
  eventos = {"GOSSIP_SHOW"},
  evaluar = function(el, mem, evento)
    if not (C_GossipInfo and C_GossipInfo.GetOptions) then
      return sinMedir(el)
    end
    if evento == "GOSSIP_SHOW" and not mem.hecho then
      local opciones = C_GossipInfo.GetOptions() or {}
      for i = 1, #opciones do
        if opciones[i].gossipOptionID == el.id then
          mem.hecho = true
        end
      end
    end
    return hechoPendiente(mem.hecho)
  end,
})

-- Plano 2 §10 «.next [grupo\guía;…]» (functions.lua:3854-3963): estando activo el paso, se pasa a esas guías (la
-- primera válida para el personaje). Los datos convertidos traen la lista resuelta en `siguientes`.
-- En datos anteriores, `guias` puede contener claves directas. Sin destino explícito se usa el #next de la guía.
Elementos.registrar("next", {
  campos = {},
  opcionales = {"guias", "siguientes"},
  eventos = {},
  evaluar = function(el)
    if el.siguientes then
      return "ir_guia", el.siguientes
    end
    if not el.guias then
      return "ir_guia"
    end
    local lista = {}
    for i = 1, #el.guias do
      local g = el.guias[i]
      if type(g) == "string" then
        g = {clave = g}
      end
      lista[i] = g
    end
    return "ir_guia", lista
  end,
})
