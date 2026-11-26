-- SnetForever: el latido para TATI (puente con TATI, tarea A1). Con el puente encendido, la app pone `latido = true` en
-- la cabecera de su buzón (Buzon.estadoApp()); solo entonces el addon le cuenta por la franja cómo va el personaje cuando
-- algo cambia, para que TATI sepa dónde está y qué hace sin que el jugador pregunte nada. Sin `latido` (la versión
-- pública, o el puente apagado) no pasa nada: cada evento se queda en una comprobación barata.
--
-- Latido.INTERVALO = 60       segundos mínimos entre un latido y el envío anterior (latido o mensaje del jugador).
-- Latido.ENTRE_CHAT = 5       lo mismo para el latido de abrir el chat («chat»): sale enseguida, sin esperar el minuto,
--                             pero un abrir-cerrar-abrir rápido no manda una ráfaga (uno cada ENTRE_CHAT s como mucho).
-- Latido.pedir(motivo)        pide un latido. `motivo` («ZONE_CHANGED_NEW_AREA», «completa»…) solo dice por qué; no cambia
--                             lo que se hace. Varios pedidos antes de que salga cuentan como uno, y sale con el estado
--                             del momento en que sale.
-- Latido.enviados() -> number latidos enseñados en esta sesión (para las pruebas).
-- Latido.ultimoError()        el último fallo interno al armar o enseñar un latido (para depurar; no se enseña al jugador).
--
-- Disparadores: ZONE_CHANGED_NEW_AREA, PLAYER_LEVEL_UP, QUEST_ACCEPTED, QUEST_TURNED_IN, en QUEST_LOG_UPDATE una misión
-- del registro que pasa a completa (se comparan las completas con las de la vez anterior; la primera vez solo se apuntan;
-- con una cabecera colapsada no se apunta nada; con el puente apagado se olvidan), ruling P14, el primer buzón cuya
-- cabecera trae latido = true con la app viva (SNF_IA_CABECERA; otra vez si vuelve a traerlo tras una cabecera sin él; una
-- que llega con la app sin vida no cuenta: la siguiente vuelve a pedir) y la app que vuelve a estar viva tras haberse ido
-- (SNF_IA_APP(true) después de un SNF_IA_APP(false)): la app reiniciada no sabe la ranura del addon hasta un latido. El
-- primer SNF_IA_APP(true) de la sesión no pide nada: el buzón que carga entonces trae la cabecera y ya pide ella.
--
-- Un pedido sale cuando:
--   · el chat de la IA está abierto (Franja.anclada(): la franja solo se ve en su hueco, regla de interfaz del 16-nov); si
--     no, se olvida. Al abrir el chat se pide uno («chat», ui/chat.lua): tras reiniciar la app con el chat cerrado,
--     TATI pide al jugador que lo abra un momento y así la app sabe enseguida por qué ranura va;
--   · la app lo pide (estadoApp().latido == true) y está viva (Timbres.appViva()); si no, se olvida;
--   · han pasado INTERVALO segundos desde el último envío: un latido o un mensaje (SNF_IA_ESTADO con fase «enviando»
--     pone el reloj a cero); si no, espera a que pasen. Con un pedido «chat» entre los pendientes, ENTRE_CHAT;
--   · el jugador no está escribiendo (Chat.escribiendo()) ni hay un mensaje en camino (Envio.esperando()); si no, se
--     mira otra vez cada 2 s.
-- Al salir: {v = 1, tipo = "latido", pj, idioma, id = Envio.sesion() .. "-L" .. k, ctx = Contexto.construir()} (el ctx
-- de un mensaje, sin inventario), recortado con Contexto.recortar, en partes P1 (Envio.partes, comprimidas si se puede)
-- con r = Buzon.proxima() y c = Buzon.cursor(), y Franja.mostrar(partes, base, {sinAviso = true}). La app reúne las partes
-- por pj|id y descarta un pj|id repetido: cada latido lleva un k nuevo. No gasta ninguna ranura (no carga el buzón) y
-- sale igual sin ranuras (proxima() > 20). La franja se oculta sola cuando han pasado a la vez 2 vueltas y 3 s, salvo
-- que entretanto haya empezado un mensaje: entonces la franja es del mensaje y el latido no la toca.
--
-- Solo hay OnUpdate con un pedido pendiente o con la franja del latido a la vista.
local _, SNF = ...

local Latido = {}
SNF.Latido = Latido

Latido.INTERVALO = 60
Latido.ENTRE_CHAT = 5

local MIRAR_OTRA_VEZ = 2 -- segundos entre miradas mientras el jugador escribe o hay un mensaje en camino
local VUELTAS = 2 -- la franja del latido se ve entera dos veces…
local SEGUNDOS = 3 -- …y nunca menos de 3 s
local BASE_TRAMAS = 32768 -- números de trama de los latidos: lejos de los de los mensajes (n × PARTES_MAX)

local marco = nil
local pendiente = false
local deChat = false -- el pedido pendiente incluye el de abrir el chat: espera ENTRE_CHAT en vez de INTERVALO
local siguienteMirada = 0
local ultimo = nil -- GetTime() del último envío (latido o mensaje); nil = ninguno en esta sesión
local k = 0 -- latidos enseñados en esta sesión
local mostrando = nil -- GetTime() en que se enseñó la franja del latido; nil = la franja no es del latido
local completas = nil -- [q] = true: las misiones completas del registro la vez anterior
local errorInterno = nil

local function ahora()
  return GetTime()
end

-- ¿Pide la app los latidos, está viva y está el chat de la IA abierto (la franja anclada en su hueco)? Lo único que se
-- hace con cada evento cuando no. regla de interfaz (16-nov): sin el chat abierto no hay latido, porque la franja nunca se
-- enseña fuera de su hueco; TATI usa el último estado que tiene, y al abrir el chat se pide uno (ui/chat.lua).
local function activo()
  if not (SNF.Franja and SNF.Franja.anclada and SNF.Franja.anclada()) then
    return false
  end
  local e = SNF.Buzon.estadoApp()
  if type(e) ~= "table" or e.latido ~= true then
    return false
  end
  return SNF.Timbres.appViva() and true or false
end

local function escribiendo()
  local Chat = SNF.Chat
  return Chat ~= nil and type(Chat.escribiendo) == "function" and Chat.escribiendo() and true or false
end

-- Arma el latido y lo enseña. Devuelve true si se enseñó.
local function enviar()
  local Envio, Buzon = SNF.Envio, SNF.Buzon
  local n = k + 1
  local pj = SNF.Personaje.clave()
  if not pj then
    errorInterno = "sin_pj" -- F3: sin pj no se arma la trama; solo se apunta para depurar
    return false
  end
  local id = Envio.sesion() .. "-L" .. string.format("%d", n)
  local mensaje = {
    v = 1,
    tipo = "latido",
    pj = pj,
    idioma = SNF.L.idioma(),
    id = id,
    ctx = SNF.Contexto.construir(),
  }
  local cabe
  mensaje, cabe = SNF.Contexto.recortar(mensaje)
  if not cabe then
    errorInterno = "grande"
    return false
  end
  local json = SNF.JSON.codificar(mensaje)
  local comprimido = Envio.comprimir(json)
  local partes = Envio.partes(pj, id, comprimido or json, comprimido and 1 or 0, Buzon.proxima(), Buzon.cursor())
  if not partes then
    errorInterno = "grande"
    return false
  end
  for _, p in ipairs(partes) do
    if #p > SNF.Codec.MAX_CARGA then
      errorInterno = "grande"
      return false
    end
  end
  SNF.Franja.mostrar(partes, (BASE_TRAMAS + n * Envio.PARTES_MAX) % 65536, {sinAviso = true})
  k = n
  mostrando = ahora()
  return true
end

local function revisar()
  local t = ahora()
  if mostrando then
    if not SNF.Franja.visible() then
      mostrando = nil -- otro la ha quitado (p. ej. el fallo de Chat.enviar): ya no hay nada que ocultar
    elseif SNF.Envio.esperando() then
      mostrando = nil -- ha empezado un mensaje: la franja es suya
    elseif SNF.Franja.vueltas() >= VUELTAS and t - mostrando >= SEGUNDOS then
      mostrando = nil
      SNF.Franja.ocultar()
    end
  end
  if pendiente and t >= siguienteMirada then
    local espera = deChat and Latido.ENTRE_CHAT or Latido.INTERVALO
    if not activo() then
      pendiente = false
      deChat = false
    elseif ultimo and t - ultimo < espera then
      siguienteMirada = ultimo + espera
    elseif escribiendo() or SNF.Envio.esperando() then
      siguienteMirada = t + MIRAR_OTRA_VEZ
    else
      pendiente = false
      deChat = false
      ultimo = t -- también si falla: como mucho un intento por minuto
      local ok, err = pcall(enviar)
      if not ok then
        errorInterno = tostring(err)
      end
    end
  end
  if marco and not pendiente and not mostrando then
    marco:SetScript("OnUpdate", nil)
  end
end

local function vigilar()
  if not marco then
    marco = CreateFrame("Frame")
  end
  marco:SetScript("OnUpdate", revisar)
end

function Latido.pedir(motivo)
  if not activo() then
    return
  end
  pendiente = true
  if motivo == "chat" then
    deChat = true
  end
  siguienteMirada = 0
  revisar()
  if pendiente or mostrando then
    vigilar()
  end
end

function Latido.enviados()
  return k
end

function Latido.ultimoError()
  return errorInterno
end

for _, evento in ipairs({"ZONE_CHANGED_NEW_AREA", "PLAYER_LEVEL_UP", "QUEST_ACCEPTED", "QUEST_TURNED_IN"}) do
  SNF.Eventos.escuchar(evento, function()
    Latido.pedir(evento)
  end)
end

-- Una misión del registro que pasa a completa. La primera vez (o tras la versión sin latido) solo se apuntan. Con una
-- cabecera colapsada (registroMisiones da incompleto) no se apunta nada: al desplegarla, sus completas no son nuevas.
SNF.Eventos.escuchar("QUEST_LOG_UPDATE", function()
  if not activo() then
    completas = nil
    return
  end
  local Misiones = SNF.Misiones
  local lista, incompleto = SNF.API.registroMisiones()
  if incompleto then
    return
  end
  local ahoraCompletas = {}
  local nueva = false
  for _, q in ipairs(lista or {}) do
    if Misiones.completa(q) then
      ahoraCompletas[q] = true
      if completas and not completas[q] then
        nueva = true
      end
    end
  end
  completas = ahoraCompletas
  if nueva then
    Latido.pedir("completa")
  end
end)

-- Ruling P14: en cuanto un buzón trae por primera vez una cabecera con latido = true (o vuelve a traerla tras una sin él),
-- un latido, con las reglas de siempre (el minuto, sin escribir, sin mensaje en camino): TATI sabe dónde está el jugador
-- sin esperar a que cambie de zona. Con la app sin vida el pedido se olvidaría: esa cabecera no se da por vista.
local latidoEnCabecera = false
SNF.Eventos.escuchar("SNF_IA_CABECERA", function(estado)
  local pide = type(estado) == "table" and estado.latido == true
  if pide and not latidoEnCabecera then
    if activo() then
      latidoEnCabecera = true
      Latido.pedir("cabecera")
    end
  elseif not pide then
    latidoEnCabecera = false
  end
end)

-- Revisión final (I1): la app que se fue y vuelve (p. ej. reiniciada, o abierta por el relevo de TATI) no sabe en qué
-- ranura va el addon hasta que le llega un latido o un mensaje: uno en cuanto vuelve, con las reglas de siempre. El
-- primer SNF_IA_APP(true) de la sesión no pide: el buzón que carga entonces (motivo «vida») trae la cabecera y pide ella.
local appSeFue = false
SNF.Eventos.escuchar("SNF_IA_APP", function(viva)
  if not viva then
    appSeFue = true
  elseif appSeFue then
    appSeFue = false
    Latido.pedir("app")
  end
end)

-- Un mensaje del jugador cuenta como envío: el siguiente latido espera INTERVALO desde él, y su franja ya no es del latido.
SNF.Eventos.escuchar("SNF_IA_ESTADO", function(fase)
  if fase == "enviando" then
    ultimo = ahora()
    mostrando = nil
  end
end)
