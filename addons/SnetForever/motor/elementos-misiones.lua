-- SnetForever: evaluadores de los elementos de misión (plano 2 §2 y §3). Lo que decide cuándo un paso de la guía
-- está hecho en lo que toca a misiones. Todo se lee de SNF.Misiones, que ya aplica los márgenes de 2 s al aceptar
-- y de 5 s al entregar. Nada acepta, entrega ni abandona por el jugador.
-- T1: todos salvo manual son puros (Elementos.esPuro): leen el estado de las misiones, no los eventos.
local _, SNF = ...
local Elementos = SNF.Elementos
local Misiones = SNF.Misiones

local EV_ACEPTAR = {"QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED"}
local EV_ENTREGAR = {"QUEST_TURNED_IN", "QUEST_LOG_UPDATE"}
local EV_REGISTRO = {"QUEST_LOG_UPDATE"}
local EV_CONDICION = {"QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE"}

local function hechoPendiente(cumplido)
  return cumplido and "hecho" or "pendiente"
end

-- ¿Estás en alguna de las misiones de la lista?
local function enAlguna(qs)
  for i = 1, #qs do
    if Misiones.enDiario(qs[i]) then
      return true
    end
  end
  return false
end

-- ¿Has entregado alguna de la lista? ¿Todas?
local function entregadaAlguna(qs)
  for i = 1, #qs do
    if Misiones.entregada(qs[i]) then
      return true
    end
  end
  return false
end

local function entregadasTodas(qs)
  for i = 1, #qs do
    if not Misiones.entregada(qs[i]) then
      return false
    end
  end
  return true
end

-- «En ella y completa»: la base de isQuestComplete e isQuestNotComplete.
local function enDiarioYCompleta(q)
  return Misiones.enDiario(q) and Misiones.completa(q)
end

-- Plano 2 §2 «.accept id[,flags[,idPrevia]]» (functions.lua:1153-1304): el elemento se completa si estás en la
-- misión o ya la entregaste; si se abandona (QUEST_REMOVED) vuelve a incompleto; con el flag 2, si idPrevia NO
-- está entregada no se puede coger la misión y se da por completado para que no bloquee.
-- `objeto` (lote «Cadenas de mejoras»): el objeto del mundo donde se acepta. Solo lo lee el texto del paso; la misión
-- cuenta como aceptada igual, venga de un PNJ o de un objeto.
Elementos.registrar("accept", {
  puro = true,
  campos = {"q"},
  opcionales = {"previa", "objeto"},
  eventos = EV_ACEPTAR,
  evaluar = function(el, mem, evento, quitada)
    local hecho
    if evento == "QUEST_REMOVED" and quitada == el.q then
      -- El evento manda: la API puede tardar en reflejar el abandono. Si se quitó por entregarla, sigue hecha.
      hecho = Misiones.entregada(el.q)
    else
      hecho = Misiones.enDiario(el.q) or Misiones.entregada(el.q)
    end
    if el.previa and not Misiones.entregada(el.previa) then
      hecho = true
    end
    -- 12-nov: el juego no la da (le falta una previa): no bloquea el paso (Misiones.noSePuedeCoger).
    if not hecho and Misiones.noSePuedeCoger(el.q) then
      hecho = true
    end
    return hechoPendiente(hecho)
  end,
})

-- .daily presenta varias misiones alternativas. Basta aceptar o haber entregado cualquiera de ellas.
Elementos.registrar("daily", {
  puro = true,
  campos = {"qs"},
  eventos = EV_ACEPTAR,
  evaluar = function(el)
    return hechoPendiente(enAlguna(el.qs) or entregadaAlguna(el.qs))
  end,
})

-- Plano 2 §2 «.turnin [-]id[,recompensa[,flags]]» (functions.lua:1373-1526): se completa con la entrega, o si la
-- misión ya figura como entregada. Con ID negativo (siFalta) se da por hecho si no estás en la misión; si además
-- había recompensa (siIncompleta), también si la misión no está completa (functions.lua:1504-1507).
-- 12-nov (en el juego: «llego al sitio, me muero muchas veces y luego me doy cuenta de que no tengo ni la quest»): un
-- jugador que empieza una guía a medias no tiene las misiones que se cogían en la guía anterior, y la guía lo mandaba a
-- hacerlas igual. El motor pone mem.sinMision a los complete y turnin cuyo paso no acepta esa misión: sin ella en el
-- diario (y con el registro ya cargado) no se pueden hacer, así que cuentan como hechos, como con siFalta.
-- Tampoco se puede hacer una misión que no se tiene y que el juego no daría (le falta una previa): eso vale aunque el
-- mismo paso la acepte.
local function sinLaMision(el, mem)
  if el.siFalta then
    return not Misiones.enDiario(el.q)
  end
  if not Misiones.enDiario(el.q) and Misiones.noSePuedeCoger(el.q) then
    return true
  end
  return type(mem) == "table" and mem.sinMision == true and Misiones.registroListo() and not Misiones.enDiario(el.q)
end

-- T2 (en el juego: la guía mandaba a entregar «Reabastecimiento médico» a 238 yd sin decir que faltaba el objeto): como el
-- .complete de RestedXP, una entrega de una misión que está en el diario y no está completa enseña antes los objetivos.
--   Elementos.faltan(el) -> lista de k | nil   el es un turnin (sin siIncompleta) de una misión en el diario, sin entregar
--       y sin completar: los índices de sus objetivos sin terminar (Misiones.objetivo(q, k).terminado == false), en orden
--       y como mucho MAX_OBJETIVOS. nil si no es una entrega a medias o si el juego no da ningún objetivo sin terminar
--       (aún no los ha dado, o los da todos hechos y todavía no la marca completa): sin nada que enseñar ni a donde ir,
--       la entrega es la de siempre.
--   El evaluador la da pendiente con el extra «faltan:k,k» (los que quedan): un texto, para que el motor vea el cambio
--   (pasos.lua, poner) cada vez que se termina un objetivo y en cuanto se completa (QUEST_LOG_UPDATE).
--   Elementos.entregaAMedias(e) -> boolean   e es un elemento vivo del motor ({datos, resultado, extra}) que es eso.
local MAX_OBJETIVOS = 10
local FALTAN = "faltan"

function Elementos.faltan(el)
  if type(el) ~= "table" or el.t ~= "turnin" or el.siIncompleta or type(el.q) ~= "number" then
    return nil
  end
  local q = el.q
  if Misiones.entregada(q) or not Misiones.enDiario(q) or Misiones.completa(q) then
    return nil
  end
  local lista = {}
  for k = 1, MAX_OBJETIVOS do
    local o = Misiones.objetivo(q, k)
    if not o then
      break
    end
    if o.terminado == false then
      lista[#lista + 1] = k
    end
  end
  return #lista > 0 and lista or nil
end

function Elementos.entregaAMedias(e)
  if type(e) ~= "table" then
    return false
  end
  local x = e.extra
  return type(e.datos) == "table" and e.datos.t == "turnin" and e.resultado == "pendiente" and type(x) == "string"
    and string.sub(x, 1, #FALTAN) == FALTAN
end

-- Elementos.faltanDe(e) -> lista de k | nil   los objetivos sin terminar de una entrega a medias, leídos de su extra (lo
-- que vio el motor en la última evaluación; sin preguntar al juego, para la flecha, que corre en cada fotograma). La
-- lista se memoriza por extra y es de solo lectura.
local listasFaltan = {} -- [extra] = lista de k

function Elementos.faltanDe(e)
  if not Elementos.entregaAMedias(e) then
    return nil
  end
  local lista = listasFaltan[e.extra]
  if not lista then
    lista = {}
    for k in string.gmatch(string.sub(e.extra, #FALTAN + 1), "%d+") do
      lista[#lista + 1] = tonumber(k)
    end
    listasFaltan[e.extra] = lista
  end
  return lista
end

local function evaluarEntrega(el, mem)
  if Misiones.entregada(el.q) then
    return "hecho"
  end
  if sinLaMision(el, mem) then
    return "hecho"
  end
  if el.siIncompleta and not Misiones.completa(el.q) then
    return "hecho"
  end
  -- T2: a medias, sigue pendiente (ni se salta ni se da por hecha), pero dice qué objetivos faltan.
  local faltan = Elementos.faltan(el)
  if faltan then
    return "pendiente", FALTAN .. ":" .. table.concat(faltan, ",")
  end
  return "pendiente"
end

Elementos.registrar("turnin", {
  puro = true,
  campos = {"q"},
  opcionales = {"siFalta", "siIncompleta", "objeto"}, -- objeto: como en accept, solo para el texto
  eventos = EV_ENTREGAR,
  evaluar = evaluarEntrega,
})

-- Plano 2 §2 «.dailyturnin id1,id2,…» (functions.lua:1528-1576): llama a .turnin con cada ID; queda completo en
-- cuanto CUALQUIERA de las misiones se entrega («entrega la que tengas»).
Elementos.registrar("dailyturnin", {
  puro = true,
  campos = {"qs"},
  eventos = EV_ENTREGAR,
  evaluar = function(el)
    return hechoPendiente(entregadaAlguna(el.qs))
  end,
})

-- Plano 2 §2 «.complete [-]id,objetivo[,objMax[,flags]]» (functions.lua:1798-1904 y 1586-1796): se completa cuando
-- el objetivo está terminado, o hecho ≥ objMax si existe; también si la misión está completa o entregada. Con
-- skipIfMissing (siFalta) se da por hecho si no estás en la misión. El flag 1 (info) lo vuelve informativo, y al
-- completarse salta el paso entero (functions.lua:1779-1786).
Elementos.registrar("complete", {
  puro = true,
  campos = {"q", "objetivo"},
  opcionales = {"max", "info", "siFalta"},
  eventos = EV_REGISTRO,
  evaluar = function(el, mem)
    local q = el.q
    local hecho = Misiones.entregada(q) or Misiones.completa(q)
    if not hecho then
      local objetivo = Misiones.objetivo(q, el.objetivo)
      if objetivo and (objetivo.terminado or (el.max and objetivo.hecho >= el.max)) then
        hecho = true
      end
    end
    if not hecho and sinLaMision(el, mem) then
      hecho = true
    end
    if el.info then
      return hecho and "saltar_paso" or "info"
    end
    return hechoPendiente(hecho)
  end,
})

-- Plano 2 §2 «.abandon id1[,id2…]» (functions.lua:4074-4146): se completa cuando no estás en NINGUNA de las
-- misiones y vuelve a incompleto si estás en alguna. No abandona nada por el jugador.
Elementos.registrar("abandon", {
  puro = true,
  campos = {"qs"},
  eventos = EV_REGISTRO,
  evaluar = function(el)
    return hechoPendiente(not enAlguna(el.qs))
  end,
})

-- Plano 2 §3 «.isOnQuest id1,id2,…» (functions.lua:4376-4417): salta el paso si no estás en NINGUNA.
Elementos.registrar("isOnQuest", {
  puro = true,
  campos = {"qs"},
  eventos = EV_CONDICION,
  evaluar = function(el)
    return enAlguna(el.qs) and "info" or "saltar_paso"
  end,
})

-- Plano 2 §3 «.isNotOnQuest id1,…» (functions.lua:4419-4425): salta el paso si estás en ALGUNA.
Elementos.registrar("isNotOnQuest", {
  puro = true,
  campos = {"qs"},
  eventos = EV_CONDICION,
  evaluar = function(el)
    return enAlguna(el.qs) and "saltar_paso" or "info"
  end,
})

-- Plano 2 §3 «.isQuestComplete id[,account]» (functions.lua:4329-4367): salta el paso si NO se cumple «estoy en
-- ella y está completa». (El argumento account, `cuenta`, no se distingue: Misiones mira al personaje.)
Elementos.registrar("isQuestComplete", {
  puro = true,
  campos = {"q"},
  eventos = EV_CONDICION,
  evaluar = function(el)
    return enDiarioYCompleta(el.q) and "info" or "saltar_paso"
  end,
})

-- Plano 2 §3 «.isQuestNotComplete id[,account]» (functions.lua:4369-4374): salta el paso si estás en ella y está
-- completa. Sin la misión no cuenta como «completa», así que el paso se muestra.
Elementos.registrar("isQuestNotComplete", {
  puro = true,
  campos = {"q"},
  eventos = EV_CONDICION,
  evaluar = function(el)
    return enDiarioYCompleta(el.q) and "saltar_paso" or "info"
  end,
})

-- Plano 2 §3 «.isQuestTurnedIn id1,…[,account]» (functions.lua:4427-4487): salta el paso si no has entregado
-- NINGUNA.
Elementos.registrar("isQuestTurnedIn", {
  puro = true,
  campos = {"qs"},
  eventos = EV_CONDICION,
  evaluar = function(el)
    return entregadaAlguna(el.qs) and "info" or "saltar_paso"
  end,
})

-- Plano 2 §3 «.isQuestAvailable id1,…» (functions.lua:4489-4494): es isQuestTurnedIn con `reverse`; salta el paso
-- si ya entregaste TODAS. No mira requisitos previos.
Elementos.registrar("isQuestAvailable", {
  puro = true,
  campos = {"qs"},
  eventos = EV_CONDICION,
  evaluar = function(el)
    return entregadasTodas(el.qs) and "saltar_paso" or "info"
  end,
})

-- Paso marcado a mano por el jugador (la fase 1 emite `manual` para los pasos de texto con casilla): hecho
-- cuando mem.marcado.
Elementos.registrar("manual", {
  campos = {},
  eventos = {},
  evaluar = function(el, mem)
    return hechoPendiente(mem and mem.marcado)
  end,
})
