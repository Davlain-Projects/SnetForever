-- SnetForever: eventos del juego y mensajes internos con un solo marco oculto.
--
-- Eventos.escuchar(evento, fn): fn se llama con los argumentos del evento (sin el nombre), en orden de registro.
--   Los eventos del juego se registran en el marco; los mensajes internos (nombre que empieza por «SNF_») no.
-- Eventos.dejar(evento, fn): quita a fn; si el evento se queda sin oyentes se deja de registrar en el marco.
-- Eventos.emitir(evento, ...): solo para mensajes internos «SNF_*»; llama a sus oyentes con esos argumentos.
--
-- Cada oyente se llama protegido: su error va a geterrorhandler() y los demás siguen. Escuchar dos veces el mismo
-- evento con la misma función no la duplica.
--
-- Eventos que el cliente no conoce (tarea 22): el motor moderno de WoW Forever da error al registrar uno. Antes de
-- registrarlo se pregunta a C_EventUtils.IsEventValid si existe (si no, el registro va con pcall); uno que no vale se
-- apunta y no se vuelve a probar (ni a quitar): sus oyentes se guardan pero nunca se llaman.
local _, SNF = ...
local Eventos = {}
SNF.Eventos = Eventos

local oyentes = {} -- [evento] = {fn, ...}
local invalidos = {} -- [evento] = true: el cliente no lo conoce (no se registra ni se vuelve a probar)

local function esInterno(evento)
  return string.sub(evento, 1, 4) == "SNF_"
end

local function registrada(lista, fn)
  for i = 1, #lista do
    if lista[i] == fn then
      return i
    end
  end
  return nil
end

-- Llama a los oyentes del evento. Se recorre una copia, así un oyente puede registrar o quitar otros mientras
-- se despacha; uno que ya no esté en la lista real se salta.
local function despachar(evento, ...)
  local lista = oyentes[evento]
  if not lista then
    return
  end
  local copia = {}
  for i = 1, #lista do
    copia[i] = lista[i]
  end
  for i = 1, #copia do
    local fn = copia[i]
    if registrada(lista, fn) then
      local ok, err = pcall(fn, ...)
      if not ok then
        geterrorhandler()(err)
      end
    end
  end
end

local marco = CreateFrame("Frame")
marco:Hide()
marco:SetScript("OnEvent", function(_, evento, ...)
  despachar(evento, ...)
end)

-- Registra el evento del juego en el marco, sin error si el cliente no lo conoce. Devuelve si quedó registrado.
local function registrar(evento)
  if invalidos[evento] then
    return false
  end
  local utiles = rawget(_G, "C_EventUtils")
  local valido = type(utiles) == "table" and rawget(utiles, "IsEventValid")
  if type(valido) == "function" then
    if not valido(evento) then
      invalidos[evento] = true
      return false
    end
    marco:RegisterEvent(evento)
    return true
  end
  if not pcall(marco.RegisterEvent, marco, evento) then
    invalidos[evento] = true
    return false
  end
  return true
end

function Eventos.escuchar(evento, fn)
  local lista = oyentes[evento]
  if not lista then
    lista = {}
    oyentes[evento] = lista
  end
  if registrada(lista, fn) then
    return
  end
  lista[#lista + 1] = fn
  if not esInterno(evento) then
    registrar(evento)
  end
end

function Eventos.dejar(evento, fn)
  local lista = oyentes[evento]
  local i = lista and registrada(lista, fn)
  if not i then
    return
  end
  table.remove(lista, i)
  if #lista == 0 then
    oyentes[evento] = nil
    if not esInterno(evento) and not invalidos[evento] then
      marco:UnregisterEvent(evento)
    end
  end
end

function Eventos.emitir(evento, ...)
  if not esInterno(evento) then
    error("Eventos.emitir solo admite mensajes SNF_* (se pidió " .. tostring(evento) .. ")", 2)
  end
  despachar(evento, ...)
end

-- Los demás archivos llaman a SNF.escuchar y SNF.emitir (guardado.lua emite SNF_AJUSTE_CAMBIADO).
SNF.escuchar = Eventos.escuchar
SNF.emitir = Eventos.emitir
