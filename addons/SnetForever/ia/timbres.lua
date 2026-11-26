-- SnetForever: timbres de la IA (fase 4). La app de Windows «toca» un timbre renombrando su .wav (timbre_a.wav pasa a
-- timbre_a.wav.fuera mientras dura el pulso). El addon pregunta con PlaySoundFile si el archivo está y para el sonido al
-- instante con StopSound: los .wav miden 0 bytes y no se oye nada.
--
-- Timbres.RUTA                     carpeta de los timbres.
-- Timbres.probar(nombre)           true si «nombre.wav» suena, false si falta y nil si no se puede saber: una lectura solo
--                                  cuenta si «presente.wav» suena en la misma comprobación (sin sonido, o sin ese archivo
--                                  siempre presente, todo sería «falta»).
-- Timbres.sonido()                 ¿suena «presente.wav»?
-- Timbres.atento(activo)           con true (un mensaje en curso), cada 0,25 s se miran presente, timbre_a/b y
--                                  recibido_par/impar, y además vivo_a/b cada 1 s (un segundo reloj: una pregunta larga no
--                                  apaga «App conectada» y una app caída de verdad se nota igual). Con false (por defecto,
--                                  en reposo), cada 2 s se miran solo presente y vivo_a/b (el pulso de vida dura 2,5 s:
--                                  ninguno se escapa), es decir, 1,5 lecturas por segundo; timbre_a/b y recibido_par/impar
--                                  se miran en esa misma ronda solo si la app está viva (se vio un pulso de vida en los
--                                  últimos 25 s). Quien no tiene la app no oye más que esas tres.
-- Timbres.appViva()                ¿hubo un pulso de vivo_a/vivo_b en los últimos 25 s?
--
-- Mensajes internos:
--   SNF_IA_TIMBRE                  pulso de timbre_a o timbre_b (el timbre pasa de estar a faltar): hay buzón nuevo.
--   SNF_IA_RECIBIDO(paridad)       pulso de recibido_par o recibido_impar: «par» o «impar».
--   SNF_IA_APP(viva)               la app pasó a estar viva o a dejar de estarlo (viva = appViva()).
--
-- Un pulso solo cuenta al pasar de estar a faltar: un timbre que se queda fuera (más de 10 s) no emite nada más hasta que
-- una lectura lo ve volver, así un renombre que quedó a medias no llena el buzón de falsos avisos. Al entrar al juego se
-- mira cada timbre una vez sin emitir: uno que ya faltaba entonces no es un pulso.
local _, SNF = ...

local Timbres = {}
SNF.Timbres = Timbres

Timbres.RUTA = "Interface\\AddOns\\SnetForever\\senales\\"

local CANAL = "Master"
local PERIODO_ATENTO = 0.25 -- segundos entre lecturas con atento(true)
local PERIODO_VIVOS = 1 -- segundos entre lecturas de vivo_a/vivo_b con atento(true)
local PERIODO_REPOSO = 2 -- segundos entre lecturas en reposo (el pulso de vida dura 2,5 s)
local VIVA_SEGUNDOS = 25 -- un pulso de vivo_* dura esto como «app viva»
local TOLERANCIA = 0.001 -- el tiempo del cliente son floats: se compara con este margen

local RAPIDOS = {"timbre_a", "timbre_b", "recibido_par", "recibido_impar"}
local VIVOS = {"vivo_a", "vivo_b"}
local TODOS = {"timbre_a", "timbre_b", "recibido_par", "recibido_impar", "vivo_a", "vivo_b"}

local EMITE = {
  timbre_a = "timbre",
  timbre_b = "timbre",
  recibido_par = "par",
  recibido_impar = "impar",
  vivo_a = "vivo",
  vivo_b = "vivo",
}

local fichas = {} -- [nombre] = {hay = true|false}
for _, nombre in ipairs(TODOS) do
  fichas[nombre] = {hay = true}
end

local activo = false
local ultimoVivo = nil -- momento del último pulso de vivo_*
local vivaEmitida = false
local ultimaLectura = nil
local ultimaVivos = nil -- última lectura de vivo_a/vivo_b (el segundo reloj)
local baseSacada = false

-- Hace sonar el .wav y lo para al instante. true si el cliente dice que suena; false si no; nil si no hay API.
local function sonar(nombre)
  local reproducir = rawget(_G, "PlaySoundFile")
  if type(reproducir) ~= "function" then
    return nil
  end
  local ok, suena, manejador = pcall(reproducir, Timbres.RUTA .. nombre .. ".wav", CANAL)
  if not ok or not suena then
    return false
  end
  local parar = rawget(_G, "StopSound")
  if type(parar) == "function" and manejador then
    pcall(parar, manejador)
  end
  return true
end

function Timbres.sonido()
  return sonar("presente") == true
end

function Timbres.probar(nombre)
  if sonar("presente") ~= true then
    return nil
  end
  return sonar(nombre) == true
end

function Timbres.appViva()
  return ultimoVivo ~= nil and GetTime() - ultimoVivo <= VIVA_SEGUNDOS
end

function Timbres.segundosDesdeVivo()
  return ultimoVivo and math.max(0, GetTime() - ultimoVivo) or nil
end

-- Emite SNF_IA_APP cuando appViva() cambia desde lo último emitido.
local function revisarApp()
  local viva = Timbres.appViva()
  if viva ~= vivaEmitida then
    vivaEmitida = viva
    SNF.Eventos.emitir("SNF_IA_APP", viva)
  end
end

-- Un timbre acaba de empezar a faltar.
local function pulso(nombre, ahora)
  local que = EMITE[nombre]
  if que == "timbre" then
    SNF.Eventos.emitir("SNF_IA_TIMBRE")
  elseif que == "vivo" then
    ultimoVivo = ahora
  else
    SNF.Eventos.emitir("SNF_IA_RECIBIDO", que)
  end
end

-- Lee los timbres de `lista` (presente ya ha sonado). `enSilencio`: solo apunta lo que ve, sin emitir.
local function leerLista(lista, ahora, enSilencio)
  for _, nombre in ipairs(lista) do
    local ficha = fichas[nombre]
    if sonar(nombre) == true then
      ficha.hay = true
    elseif ficha.hay then
      ficha.hay = false
      if not enSilencio then
        pulso(nombre, ahora)
      end
    end
  end
end

-- Una ronda de lecturas: `vivos` y `rapidos` dicen qué parejas se miran; con rapidos = "siViva", los rápidos solo si,
-- tras mirar los vivos, la app está viva. `enSilencio`: solo apunta lo que ve, sin emitir (la primera, al entrar al juego).
local function leer(vivos, rapidos, enSilencio)
  local ahora = GetTime()
  if sonar("presente") == true then
    if vivos then
      leerLista(VIVOS, ahora, enSilencio)
    end
    if rapidos == true or (rapidos == "siViva" and Timbres.appViva()) then
      leerLista(RAPIDOS, ahora, enSilencio)
    end
  end
  revisarApp()
end

function Timbres.atento(valor)
  activo = valor and true or false
end

local marco = CreateFrame("Frame")
marco:SetScript("OnUpdate", function()
  if not baseSacada then
    return -- antes de entrar al mundo no se leen timbres
  end
  local ahora = GetTime()
  local periodo = activo and PERIODO_ATENTO or PERIODO_REPOSO
  if ultimaLectura and ahora - ultimaLectura < periodo - TOLERANCIA then
    return
  end
  ultimaLectura = ahora
  if not activo then
    -- Reposo: presente y vivo_a/b; los otros cuatro solo si la app está viva.
    ultimaVivos = ahora
    leer(true, "siViva", false)
    return
  end
  -- Con atento(true), los vivo_* van cada segundo: sin ellos ultimoVivo caducaría a los 25 s de pregunta.
  local tocanVivos = not ultimaVivos or ahora - ultimaVivos >= PERIODO_VIVOS - TOLERANCIA
  if tocanVivos then
    ultimaVivos = ahora
  end
  leer(tocanVivos, true, false)
end)

-- Primera lectura al entrar al juego: lo que ya falta entonces no cuenta como pulso.
SNF.Eventos.escuchar("PLAYER_ENTERING_WORLD", function()
  if not baseSacada then
    baseSacada = true
    leer(true, true, true)
    ultimaLectura = GetTime()
    ultimaVivos = ultimaLectura
  end
end)
