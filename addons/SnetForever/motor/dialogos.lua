-- Interacción opcional con los diálogos de misiones que pide el paso activo.
local _, SNF = ...
local Motor, Ajustes = SNF.Motor, SNF.Ajustes

local function pide(dato, id, tipo)
  if dato.t == tipo then return dato.q == id end
  if (tipo == "accept" and dato.t == "daily") or (tipo == "turnin" and dato.t == "dailyturnin") then
    for _, q in ipairs(dato.qs or {}) do
      if q == id then return true end
    end
  end
  return false
end

local function pendiente(id, tipo)
  if type(id) ~= "number" or (type(issecretvalue) == "function" and issecretvalue(id)) or id <= 0 then return nil end
  for _, i in ipairs(Motor.activos()) do
    for _, vivo in ipairs(Motor.paso(i).elementos) do
      local dato = vivo.datos
      if vivo.resultado == "pendiente" and not dato.noAuto and pide(dato, id, tipo) then
        return dato
      end
    end
  end
end

local function permitido()
  return Ajustes.get("guias.automatizar") and Ajustes.get("ventana.visible") ~= false
    and not InCombatLockdown() and not (type(IsControlKeyDown) == "function" and IsControlKeyDown())
end

local function seleccionar(obtener, elegir, tipo)
  if type(obtener) ~= "function" or type(elegir) ~= "function" then return false end
  for _, item in ipairs(obtener() or {}) do
    if pendiente(item.questID, tipo) and (tipo == "accept" or item.isComplete == true) then
      elegir(item.questID)
      return true
    end
  end
  return false
end

local function charla()
  if not permitido() then return end
  local C = rawget(_G, "C_GossipInfo")
  if type(C) ~= "table" then return end
  if not seleccionar(C.GetActiveQuests, C.SelectActiveQuest, "turnin") then
    seleccionar(C.GetAvailableQuests, C.SelectAvailableQuest, "accept")
  end
end

local function misionActual()
  return permitido() and type(GetQuestID) == "function" and GetQuestID() or nil
end

local function aceptar()
  if pendiente(misionActual(), "accept") and type(AcceptQuest) == "function" then
    AcceptQuest()
  end
end

local function completar()
  if pendiente(misionActual(), "turnin") and type(IsQuestCompletable) == "function" and IsQuestCompletable()
      and type(CompleteQuest) == "function" then
    CompleteQuest()
  end
end

local function entregar()
  local dato = pendiente(misionActual(), "turnin")
  if not dato or type(GetNumQuestChoices) ~= "function" or type(GetQuestReward) ~= "function" then return end
  local n = GetNumQuestChoices()
  if type(n) ~= "number" then return end
  local elegida = dato.recompensa
  if n <= 1 then
    GetQuestReward(1)
  elseif type(elegida) == "number" and elegida >= 1 and elegida <= n and elegida % 1 == 0 then
    GetQuestReward(elegida)
  end
end

local dialogos = {GOSSIP_SHOW = charla, QUEST_DETAIL = aceptar, QUEST_PROGRESS = completar, QUEST_COMPLETE = entregar}
local function escucharDialogos()
  local registrar = Ajustes.get("guias.automatizar") and SNF.Eventos.escuchar or SNF.Eventos.dejar
  for evento, funcion in pairs(dialogos) do
    registrar(evento, funcion)
  end
end

SNF.escuchar("PLAYER_LOGIN", escucharDialogos)
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "guias.automatizar" then escucharDialogos() end
end)
