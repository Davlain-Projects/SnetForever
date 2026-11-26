-- SnetForever: envío de la IA (fase 4): reparto en partes, compresión, envío por la franja, estados y plazos.
-- «comprimir» está adaptado de NeverQuestAlone (MIT; © 2026 chelinho139 y los autores de NeverQuestAlone), addon/NeverQuestAlone/Transport.lua (T.Deflate), commit 3a9b93c.
local _, SNF = ...

local Envio = {}
SNF.Envio = Envio

local floor = math.floor
local US = "\031"

-- Mini franja (decisión del autor): cada parte lleva como mucho 1.300 bytes de datos y un mensaje, 16 partes.
-- Con la cabecera, la carga cabe en SNF.Codec.MAX_CARGA (1.400).
Envio.DATOS_MAX = 1300
Envio.PARTES_MAX = 16

-- Parte el cuerpo (JSON, o su base64 si z = 1) en las cargas de la trama P1:
--   SNF1 US pj US id US parte US total US z US r US c US datos
-- Corta por bytes, sin mirar el UTF-8 (la app reúne los bytes antes de pasarlos a texto).
-- Devuelve la lista de cargas, o nil y «grande» si salen más de PARTES_MAX.
function Envio.partes(pj, id, cuerpo, z, r, c)
  local n = floor((#cuerpo + Envio.DATOS_MAX - 1) / Envio.DATOS_MAX)
  if n < 1 then n = 1 end
  if n > Envio.PARTES_MAX then return nil, "grande" end
  local salida = {}
  for k = 1, n do
    local trozo = cuerpo:sub((k - 1) * Envio.DATOS_MAX + 1, k * Envio.DATOS_MAX)
    salida[k] = table.concat({
      "SNF1", pj, id,
      string.format("%d", k), string.format("%d", n),
      string.format("%d", z), string.format("%d", floor(r)), string.format("%d", floor(c)),
      trozo,
    }, US)
  end
  return salida
end

-- Comprime el texto con deflate crudo del propio cliente y lo da en base64; nil, y el cuerpo va tal cual, si falta
-- alguna de las cuatro APIs o falla, si la vuelta atrás no da el texto exacto o si no sale más corto.
-- Las APIs son las de EncodingUtilDocumentation.lua (wow-ui-source forever): CompressString, EncodeBase64,
-- DecodeBase64, DecompressString y Enum.CompressionMethod (Deflate 0 = crudo).
function Envio.comprimir(json)
  if type(json) ~= "string" then return nil end
  local E, metodo = SNF.API.codificacion()
  if not E then return nil end
  for _, nombre in ipairs({"CompressString", "EncodeBase64", "DecodeBase64", "DecompressString"}) do
    if type(E[nombre]) ~= "function" then return nil end
  end
  local ok, empaquetado = pcall(E.CompressString, json, metodo)
  if not ok or type(empaquetado) ~= "string" or empaquetado == "" then return nil end
  local b64
  ok, b64 = pcall(E.EncodeBase64, empaquetado)
  if not ok or type(b64) ~= "string" then return nil end
  b64 = (b64:gsub("%s+", "")) -- por si el cliente parte las líneas
  if b64 == "" or #b64 >= #json or b64:find("[^%w%+/=]") then return nil end
  local crudo, vuelta
  ok, crudo = pcall(E.DecodeBase64, b64)
  if not ok or type(crudo) ~= "string" then return nil end
  ok, vuelta = pcall(E.DecompressString, crudo, metodo)
  if not ok or vuelta ~= json then return nil end
  return b64
end

---------------------------------------------------------------------------------------------------
-- Envío, estados y plazos (tarea 8)
--
-- Envio.enviar(texto) -> true | false, motivo   motivo: «vacio», «ocupado», «sin_ranuras», «grande» o «interno»
--                                               (fallo del propio addon al enseñar la franja: queda en error con
--                                               detalle = "CHAT_FALLO_INTERNO"). F3: «sin_pj» si Personaje.clave()
--                                               da nil (sin él no se arma la trama): no se envía nada ni se avisa.
-- Envio.cancelar()                              suelta la espera (libre) y quita la franja.
-- Envio.nueva()                                 el siguiente mensaje lleva nueva = true (conversación nueva).
-- Envio.esperando() -> boolean                 ¿hay un mensaje en camino (fase enviando o pensando)?
-- Envio.puedeParar() -> boolean                 en pensando, con un mensaje mandado a TATI (la cabecera al enviar, no la
--                                               de ahora: cambiar de cerebro a mitad no lo deja imparable) y sin estar
--                                               ya parando.
-- Envio.parar() -> boolean                      manda por la franja {v = 1, tipo = "parar", pj, idioma, id = sesión-P<k>,
--                                               turno = id del mensaje} sin gastar ranura y marca `parando`.
-- Envio.sesion() -> texto                       los 4 dígitos hexadecimales de esta sesión con que empiezan los ids
--                                               («a3f0-7»; los latidos de ia/latido.lua, «a3f0-L1»).
-- Envio.estado() -> {fase, id?, desde, detalle?, tipo?, texto?, sigue?, parando?}   fase: «libre», «enviando», «pensando» o
--   «error». `sigue`: segundos desde el envío, solo si consta que el turno sigue (pulsos o cabecera); `parando`: true.
--   Errores propios del addon: detalle = clave de L (CHAT_SIN_APP, CHAT_SIN_RESPUESTA, CHAT_FALLO_INTERNO,
--   CHAT_PARADO_SIN_CONFIRMAR). Un registro de error con tipo «detenido» no es un error: deja la fase en libre.
--   Errores de la app (registro t = "error", P6): detalle = nil, tipo = tipo de la app (sin_sesion, limite…) y
--   texto = el texto que manda la app, ya en el idioma del mensaje (se pinta tal cual).
--
-- Mensajes internos: SNF_IA_ESTADO(fase, detalle, registro?) en cada cambio (detalle = {parte, total} al enviar —solo
-- vale total—, la clave del error propio, o nil con el registro de error de la app como tercer argumento);
-- SNF_IA_RESPUESTA(registro) cuando llega la respuesta (también una tardía tras CHAT_SIN_APP o CHAT_SIN_RESPUESTA con el
-- mismo id); SNF_IA_AVISO("CHAT_SIN_SONIDO") al enviar sin sonido, una vez hasta que el sonido vuelva y se vaya;
-- SNF_IA_SIGUE cuando cambia lo que dice la barra de un turno largo (como mucho una vez por minuto) o al empezar a parar.
--
-- Plazos, contados desde el envío:
--   con sonido  enviando 45 s sin el «recibido» → error CHAT_SIN_APP; en pensando se carga una ranura a los 60 y 150 s.
--   sin sonido  la franja se oculta cuando han pasado a la vez 2 vueltas completas y 3 s (el mensaje se ve entero dos veces
--               y nunca menos de 3 s), y entonces pasa a pensando; se carga una ranura a los 5, 12, 25, 45, 75, 120, 210, 330 y
--               405 s (el de 405 s, poco antes del error: sin él no se miraba el buzón entre los 330 y los 420 s).
--   siempre     420 s sin respuesta → error CHAT_SIN_RESPUESTA (tarea 16: las guías de la IA tardan más).
--   con opus    los mismos 420 s; con sonido se carga además una ranura a los 240 y 300 s (el timbre avisa); sin sonido
--               valen los repasos de 210, 330 y 405 s. Cuenta el modelo con que se mandó el mensaje.
--
-- Turno largo de TATI: no hay tope de tiempo mientras conste que sigue. Con Claude o Codex nada de esto cuenta.
--   con sonido  cada pulso de «recibido» de la paridad del mensaje, ya en pensando, es una señal de vida. Con alguna, no
--               vale el plazo de 420 s ni se hacen repasos (el timbre del final avisa); SIN_VIDA s sin pulso → CHAT_SIN_APP.
--   sin sonido  si la cabecera del buzón dice `turno` = este mensaje, pasados los repasos de la tabla se hace otro cada
--               REPASO_SIGUE s mientras quede más de una ranura de las que la app escribió (de r a r + 15). Sin ellas,
--               CHAT_SIN_RESPUESTA.
--   silencio    al vencer SIN_VIDA, si Timbres.sonido() ya no responde, no se corta: pasa al modo sin sonido.
--   parar       sin sonido, un repaso a los PARAR_REPASO s para recoger el `detenido` (gasta una ranura); con sonido avisa
--               el timbre. A los PARAR_ESPERA s sin registro, CHAT_PARADO_SIN_CONFIRMAR.
--   acuse       un pulso de paridad en enviando con la franja a la vista y 0 vueltas queda pendiente y vale al acabar la
--               primera vuelta (mientras tanto no salta CHAT_SIN_APP). SNF_IA_RECIBIDO_ID, con el id exacto, vale al momento.
---------------------------------------------------------------------------------------------------
local TEXTO_MAX = 500
local REFS_MAX = 20
local SIN_APP = 45
local SIN_RESPUESTA = 420
local VUELTAS_SIN_SONIDO = 2
local SEGUNDOS_SIN_SONIDO = 3
local REPASOS_CON_SONIDO = {60, 150}
local REPASOS_SIN_SONIDO = {5, 12, 25, 45, 75, 120, 210, 330, 405}
local SIN_RESPUESTA_OPUS = 420
local REPASOS_CON_SONIDO_OPUS = {60, 150, 240, 300}
local REPASOS_SIN_SONIDO_OPUS = {5, 12, 25, 45, 75, 120, 210, 330, 405}
local SIN_VIDA = 90 -- segundos sin pulso, en un turno que ya los daba, para dar la app por ida
local REPASO_SIGUE = 90 -- sin sonido: entre repasos, pasada la tabla, mientras la cabecera diga que el turno sigue
local PARAR_ESPERA = 30 -- segundos que se espera la confirmación de parar
local PARAR_REPASO = 20 -- sin sonido: a estos segundos de pulsar Parar se mira el buzón (la app da `detenido` a los 15 s)
local RANURAS_POR_PUBLICACION = 16 -- la app escribe de r a r + 15
local BASE_TRAMAS_PARAR = 49152 -- números de trama de parar: lejos de los mensajes (n × PARTES_MAX) y de los latidos (32768)

local sesion = string.format("%04x", math.random(0, 65535))
local contador = 0 -- respaldo si no hay SnetForeverPJ.ia
local nuevaPendiente = false
local vistos = {} -- ids de SNF_IA_RECIBIDO_ID ya tratados

local estado = {fase = "libre", desde = 0}
local marco = nil
local errorInterno = nil
local avisadoSinSonido = false -- ya se avisó de que no hay sonido (se rearma cuando el sonido vuelve)
local inicio, sinSonido, repasos, siguienteRepaso = 0, false, nil, 1
local sinRespuesta = SIN_RESPUESTA -- el plazo del mensaje en camino (más largo con opus)
local ultimaVida = nil -- momento del último pulso de vida del turno
local parandoDesde = nil -- momento en que se pidió parar
local franjaParar = nil -- momento en que se enseñó la franja de parar (nil: ya no está)
local kParar = 0 -- mensajes de parar de esta sesión
local ultimaRanura = 0 -- la última ranura que la app escribe para este mensaje
local proximoExtra = 0 -- sin sonido: segundos desde el envío del siguiente repaso pasada la tabla
local minutoSigue = nil -- el minuto que enseña la barra
local deTati = false -- este mensaje lo contesta TATI (lo decía la cabecera al enviar, o su `turno` después)
local repasoParar = false -- sin sonido: falta el repaso de después de pulsar Parar
local acusePendiente = false -- llegó un pulso con la franja aún sin ninguna vuelta: vale al acabar la primera

local function ahora()
  return GetTime()
end

local function guardadoIa()
  local pj = rawget(_G, "SnetForeverPJ")
  return type(pj) == "table" and type(pj.ia) == "table" and pj.ia or nil
end

-- Pasa a otra fase y lo cuenta a los oyentes: SNF_IA_ESTADO(fase, detalle, registro).
-- `extra`: {id?, detalle?, tipo?, texto?, registro?}. En un error propio, `detalle` es la clave de L; en uno de la app,
-- `tipo` es el de P6 (sin_sesion…), `texto` el que trae el registro y `registro` el registro entero.
local function cambiar(fase, extra)
  extra = extra or {}
  estado = {
    fase = fase,
    id = fase ~= "libre" and (extra.id or estado.id) or nil,
    desde = ahora(),
    detalle = extra.detalle,
    tipo = extra.tipo,
    texto = extra.texto,
  }
  SNF.Eventos.emitir("SNF_IA_ESTADO", fase, extra.detalle, extra.registro)
end

local function esperando()
  return estado.fase == "enviando" or estado.fase == "pensando"
end

function Envio.esperando()
  return esperando()
end

function Envio.sesion()
  return sesion
end

-- Deja de vigilar plazos y de mirar los timbres deprisa.
local function soltar()
  ultimaVida, parandoDesde, franjaParar, minutoSigue = nil, nil, nil, nil
  acusePendiente = false
  if marco then
    marco:SetScript("OnUpdate", nil)
  end
  SNF.Franja.ocultar()
  SNF.Timbres.atento(false)
end

local function fallar(clave)
  soltar()
  cambiar("error", {detalle = clave})
end

local function pensar()
  acusePendiente = false
  SNF.Franja.ocultar()
  cambiar("pensando")
end

-- Sin sonido: ¿dice la cabecera del último buzón que la app sigue con este mensaje?
local function sigueEnCabecera()
  if not sinSonido or estado.fase ~= "pensando" then
    return false
  end
  local e = SNF.Buzon.estadoApp()
  return type(e) == "table" and e.turno == estado.id
end

-- ¿Queda más de una ranura de las que la app ha escrito para este mensaje?
local function quedanRanuras()
  return SNF.Buzon.proxima() < ultimaRanura
end

-- Los segundos desde el envío, si consta que el turno sigue.
local function segundosSigue()
  if estado.fase == "pensando" and (ultimaVida or sigueEnCabecera()) then
    return ahora() - inicio
  end
  return nil
end

-- Repinta la barra solo cuando cambia el minuto que enseña.
local function avisarSigue()
  local s = segundosSigue()
  if s then
    local minuto = math.max(1, floor(s / 60))
    if minuto ~= minutoSigue then
      minutoSigue = minuto
      SNF.Eventos.emitir("SNF_IA_SIGUE")
    end
  end
end

local function alPasarTiempo()
  if not esperando() then
    return
  end
  local t = ahora() - inicio
  if franjaParar and SNF.Franja.vueltas() >= VUELTAS_SIN_SONIDO and ahora() - franjaParar >= SEGUNDOS_SIN_SONIDO then
    franjaParar = nil
    SNF.Franja.ocultar()
  end
  if parandoDesde then
    if repasoParar and ahora() - parandoDesde >= PARAR_REPASO then
      repasoParar = false
      if SNF.Buzon.proxima() <= SNF.Buzon.RANURAS then
        SNF.Buzon.cargar("repaso")
        if not esperando() then
          return
        end
      end
    end
    if ahora() - parandoDesde >= PARAR_ESPERA then
      return fallar("CHAT_PARADO_SIN_CONFIRMAR")
    end
  elseif ultimaVida then
    if ahora() - ultimaVida >= SIN_VIDA then
      if SNF.Timbres.sonido() then
        return fallar("CHAT_SIN_APP")
      end
      -- Se ha silenciado el juego: sin sonido no llegan pulsos, pero la app sigue. Pasa a mirar el buzón (el primer repaso
      -- sale ya y trae la cabecera); si el sonido vuelve y llegan pulsos, sigue con la vida normal.
      ultimaVida = nil
      sinSonido = true
      repasos = REPASOS_SIN_SONIDO
      siguienteRepaso = 1
      proximoExtra = math.max(repasos[#repasos], t) + REPASO_SIGUE
    end
  elseif t >= sinRespuesta and not (sigueEnCabecera() and quedanRanuras()) then
    return fallar("CHAT_SIN_RESPUESTA")
  end
  if estado.fase == "enviando" then
    if acusePendiente and SNF.Franja.vueltas() >= 1 then
      pensar()
    elseif sinSonido then
      if SNF.Franja.vueltas() >= VUELTAS_SIN_SONIDO and ahora() - estado.desde >= SEGUNDOS_SIN_SONIDO then
        pensar()
      end
    elseif not acusePendiente and ahora() - estado.desde >= SIN_APP then
      return fallar("CHAT_SIN_APP")
    end
  end
  -- Cargas de repaso, solo en pensando (en enviando la app aún no ha leído nada). Una sola carga por fotograma, aunque
  -- hayan vencido varios plazos. Si la carga trae la respuesta, o un oyente envía otro mensaje, el estado cambia y se sale.
  -- Con pulsos de vida no se repasa: los timbres funcionan y el del final avisa, así no se gastan ranuras.
  if estado.fase == "pensando" and not ultimaVida then
    if repasos[siguienteRepaso] then
      if t >= repasos[siguienteRepaso] then
        while repasos[siguienteRepaso] and t >= repasos[siguienteRepaso] do
          siguienteRepaso = siguienteRepaso + 1
        end
        SNF.Buzon.cargar("repaso")
      end
    elseif t >= proximoExtra and sigueEnCabecera() and quedanRanuras() then
      proximoExtra = t + REPASO_SIGUE
      local antes = SNF.Buzon.proxima()
      SNF.Buzon.cargar("repaso")
      if SNF.Buzon.proxima() == antes then
        ultimaRanura = 0 -- la ranura no se pudo cargar: sin esto, la cabecera vieja lo tendría esperando para siempre
      end
    end
  end
  if esperando() then
    avisarSigue()
  end
end

local function vigilar()
  if not marco then
    marco = CreateFrame("Frame")
  end
  marco:SetScript("OnUpdate", alPasarTiempo)
end

-- Quita los hiperenlaces: las misiones y objetos van a refs y al texto como [Nombre]; los demás, solo su texto visible.
-- También quita los códigos de color (|cAARRGGBB … |r) y los blancos de los extremos.
local function limpiarEnlaces(texto)
  local refs = {q = {}, i = {}}
  local vistas = {q = {}, i = {}}
  local function anotar(clase, id)
    id = tonumber(id)
    if id and not vistas[clase][id] and #refs[clase] < REFS_MAX then
      vistas[clase][id] = true
      refs[clase][#refs[clase] + 1] = id
    end
  end
  texto = texto:gsub("|H([^:|]*):?([^|]*)|h(.-)|h", function(tipo, resto, nombre)
    local id = resto:match("^(%d+)")
    if tipo == "quest" and id then
      anotar("q", id)
    elseif tipo == "item" and id then
      anotar("i", id)
    else
      return nombre
    end
    nombre = nombre:gsub("^%[", ""):gsub("%]$", "")
    return "[" .. nombre .. "]"
  end)
  texto = texto:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
  texto = texto:gsub("^%s+", ""):gsub("%s+$", "")
  if #refs.q == 0 then
    refs.q = nil
  end
  if #refs.i == 0 then
    refs.i = nil
  end
  if not refs.q and not refs.i then
    refs = nil
  end
  return texto, refs
end

-- Corta a `max` bytes sin dejar a medias un carácter UTF-8.
local function cortarUtf8(texto, max)
  if #texto <= max then
    return texto
  end
  local fin = max
  while fin > 0 do
    local b = texto:byte(fin + 1)
    if b and b >= 0x80 and b < 0xC0 then
      fin = fin - 1
    else
      break
    end
  end
  return texto:sub(1, fin)
end

-- El número del próximo mensaje (no se gasta hasta confirmarNumero).
local function proximoN()
  local ia = guardadoIa()
  local n = ia and type(ia.n) == "number" and ia.n or contador
  return floor(n) + 1
end

local function confirmarNumero(n)
  local ia = guardadoIa()
  if ia then
    ia.n = n
  end
  contador = n
end

function Envio.nueva()
  nuevaPendiente = true
end

-- {fase, id?, desde, detalle?, tipo?, texto?}. `detalle`: al enviar, {parte = 1, total}, y solo vale `total` (la parte
-- que se ve en cada momento no se sigue); en un error propio, la clave de L (CHAT_SIN_APP…). En un error de la app,
-- `tipo` (sin_sesion…) y `texto` (el del registro, en el idioma del mensaje).
function Envio.estado()
  local s = segundosSigue()
  return {
    fase = estado.fase, id = estado.id, desde = estado.desde, detalle = estado.detalle, tipo = estado.tipo, texto = estado.texto,
    sigue = s and floor(s) or nil,
    parando = parandoDesde ~= nil or nil,
  }
end

function Envio.puedeParar()
  if estado.fase ~= "pensando" or parandoDesde or not deTati then
    return false
  end
  -- A una app vieja el «parar» le entraría como una pregunta con el texto vacío.
  local e = SNF.Buzon.estadoApp()
  return type(e) == "table" and e.sabeParar == true
end

-- Manda el «parar» por la franja, armado como un latido (ia/latido.lua): no gasta ninguna ranura. La franja se oculta
-- tras 2 vueltas y 3 s (alPasarTiempo). El resultado llega por el camino normal, con el registro `detenido`.
function Envio.parar()
  if not Envio.puedeParar() then
    return false
  end
  local pj = SNF.Personaje.clave()
  if not pj then
    return false
  end
  local k = kParar + 1
  local id = sesion .. "-P" .. string.format("%d", k)
  local json = SNF.JSON.codificar({v = 1, tipo = "parar", pj = pj, idioma = SNF.L.idioma(), id = id, turno = estado.id})
  local comprimido = Envio.comprimir(json)
  local partes = Envio.partes(pj, id, comprimido or json, comprimido and 1 or 0, SNF.Buzon.proxima(), SNF.Buzon.cursor())
  if not partes then
    return false
  end
  local ok, err = pcall(SNF.Franja.mostrar, partes, (BASE_TRAMAS_PARAR + k * Envio.PARTES_MAX) % 65536, {sinAviso = true})
  if not ok then
    errorInterno = tostring(err)
    SNF.Franja.ocultar()
    return false
  end
  kParar = k
  parandoDesde = ahora()
  franjaParar = parandoDesde
  repasoParar = sinSonido
  SNF.Eventos.emitir("SNF_IA_SIGUE")
  return true
end

-- El último fallo interno al enviar (para depurar; no se enseña al jugador).
function Envio.ultimoError()
  return errorInterno
end

function Envio.cancelar()
  if estado.fase == "libre" then
    return
  end
  soltar()
  cambiar("libre")
end

function Envio.enviar(texto)
  if type(texto) ~= "string" then
    return false, "vacio"
  end
  local limpio, refs = limpiarEnlaces(texto)
  if limpio == "" then
    return false, "vacio"
  end
  if esperando() then
    return false, "ocupado"
  end
  if SNF.Buzon.proxima() > SNF.Buzon.RANURAS then
    return false, "sin_ranuras"
  end
  if not SNF.Personaje.clave() then
    return false, "sin_pj" -- F3: sin pj, table.concat de la trama fallaría
  end

  local n = proximoN()
  local id = sesion .. "-" .. string.format("%d", n)
  limpio = cortarUtf8(limpio, TEXTO_MAX)
  local modelo = SNF.Ajustes.get("ia.modelo")
  local pj = SNF.Personaje.clave()
  local mensaje = {
    v = 1,
    pj = pj,
    idioma = SNF.L.idioma(),
    modelo = (modelo == "sonnet" or modelo == "opus") and modelo or "haiku", -- lo raro, el rápido
    nueva = nuevaPendiente or nil,
    texto = limpio,
    refs = refs,
    id = id,
    ctx = SNF.Contexto.construir(),
  }
  if SNF.Ajustes.get("ia.inventario") == true then
    mensaje.ctx.inv = SNF.Inventario.leer()
    -- 13-nov: el precio de subasta (del escaneo de SnetForever, de la app o de Auctionator) de lo que lleva y de lo que tiene en el banco. El banco del mensaje es
    -- una copia superficial de las SavedVariables: sus objetos se copian antes de anotarlos.
    if SNF.Subasta and SNF.Subasta.disponible() then
      SNF.Subasta.anotar(mensaje.ctx.inv.bolsas)
      local banco = mensaje.ctx.inv.banco
      if type(banco) == "table" and type(banco.objetos) == "table" then
        local copia = {}
        for i, o in ipairs(banco.objetos) do
          local c = {}
          for k, v in pairs(o) do
            c[k] = v
          end
          copia[i] = c
        end
        banco.objetos = copia
        SNF.Subasta.anotar(copia)
      end
    end
  end
  local cabe
  mensaje, cabe = SNF.Contexto.recortar(mensaje)
  if not cabe then
    return false, "grande"
  end

  local json = SNF.JSON.codificar(mensaje)
  local comprimido = Envio.comprimir(json)
  local partes = Envio.partes(pj, id, comprimido or json, comprimido and 1 or 0, SNF.Buzon.proxima(), SNF.Buzon.cursor())
  if not partes then
    return false, "grande"
  end
  for _, p in ipairs(partes) do
    if #p > SNF.Codec.MAX_CARGA then
      return false, "grande"
    end
  end
  local ok, err = pcall(SNF.Franja.mostrar, partes, (n * Envio.PARTES_MAX) % 65536)
  if not ok then
    errorInterno = tostring(err)
    SNF.Franja.ocultar()
    cambiar("error", {detalle = "CHAT_FALLO_INTERNO"})
    return false, "interno"
  end
  nuevaPendiente = false
  confirmarNumero(n)

  inicio = ahora()
  sinSonido = not SNF.Timbres.sonido()
  local opus = mensaje.modelo == "opus"
  sinRespuesta = opus and SIN_RESPUESTA_OPUS or SIN_RESPUESTA
  if opus then
    repasos = sinSonido and REPASOS_SIN_SONIDO_OPUS or REPASOS_CON_SONIDO_OPUS
  else
    repasos = sinSonido and REPASOS_SIN_SONIDO or REPASOS_CON_SONIDO
  end
  siguienteRepaso = 1
  ultimaVida, parandoDesde, franjaParar, minutoSigue = nil, nil, nil, nil
  acusePendiente = false
  local cabecera = SNF.Buzon.estadoApp()
  deTati = type(cabecera) == "table" and cabecera.motorNombre == "tati"
  ultimaRanura = math.min(SNF.Buzon.proxima() + RANURAS_POR_PUBLICACION - 1, SNF.Buzon.RANURAS)
  proximoExtra = repasos[#repasos] + REPASO_SIGUE
  SNF.Timbres.atento(true)
  cambiar("enviando", {id = id, detalle = {parte = 1, total = #partes}})
  vigilar()
  if not sinSonido then
    avisadoSinSonido = false
  elseif not avisadoSinSonido then
    avisadoSinSonido = true
    SNF.Eventos.emitir("SNF_IA_AVISO", "CHAT_SIN_SONIDO")
  end
  return true
end

-- La app ha leído el mensaje.
local function recibido()
  if estado.fase == "enviando" then
    pensar()
  end
end

SNF.Eventos.escuchar("SNF_IA_RECIBIDO", function(paridad)
  local n = estado.id and tonumber(estado.id:match("%-(%d+)$"))
  if n and paridad == ((n % 2 == 0) and "par" or "impar") then
    if estado.fase == "pensando" then
      -- Ya estaba recibido: este pulso es la app diciendo que el turno sigue.
      -- Solo con TATI: con Claude o Codex un pulso suelto no cambia sus plazos ni sus repasos.
      if deTati then
        ultimaVida = ahora()
        sinSonido = false
      end
    elseif estado.fase == "enviando" and SNF.Franja.vueltas() == 0 and (SNF.Franja.visible() or deTati) then
      -- Solo lleva la paridad: puede ser de un turno anterior, y ocultar ya la franja dejaría el mensaje sin leer. Tampoco
      -- se tira: la app puede leer la última parte y acusar antes de que suba el contador.
      acusePendiente = true
      -- Con el chat cerrado la franja no avanza y el mensaje sigue en enviando: los pulsos de TATI evitan el corte de los
      -- 420 s, y si dejan de llegar, SIN_VIDA dice que la app se ha ido.
      if deTati and not SNF.Franja.visible() then
        ultimaVida = ahora()
      end
    else
      recibido()
    end
  end
end)

SNF.Eventos.escuchar("SNF_IA_RECIBIDO_ID", function(id)
  if type(id) ~= "string" or vistos[id] then
    return
  end
  vistos[id] = true
  if id == estado.id then
    recibido()
  end
end)

-- La cabecera con el `turno` de este mensaje demuestra que es de TATI, aunque al enviar aún no se supiera el motor.
SNF.Eventos.escuchar("SNF_IA_CABECERA", function(e)
  if esperando() and type(e) == "table" and e.turno == estado.id then
    deTati = true
  end
end)

-- Errores propios tras los que una respuesta tardía todavía vale.
local ERRORES_TARDIOS = {CHAT_SIN_APP = true, CHAT_SIN_RESPUESTA = true, CHAT_PARADO_SIN_CONFIRMAR = true}

-- Lo que TATI manda sin pregunta (origen = "tati", msg = "tati-<seq>"): se enseña como una respuesta, pero no es la de
-- ningún mensaje del jugador, así que no toca la fase, el plazo ni la franja. Solo el del personaje que juega.
local function esDeTati(registro)
  return registro.origen == "tati" and registro.t == "respuesta" and registro.pj == SNF.Personaje.clave()
end

SNF.Eventos.escuchar("SNF_IA_REGISTRO", function(registro)
  if type(registro) ~= "table" then
    return
  end
  if registro.origen == "tati" then
    if esDeTati(registro) then
      SNF.Eventos.emitir("SNF_IA_RESPUESTA", registro)
    end
    return
  end
  if registro.msg == nil or registro.msg ~= estado.id then
    return
  end
  local tardia = estado.fase == "error" and ERRORES_TARDIOS[estado.detalle]
  if not esperando() and not tardia then
    return
  end
  if registro.t == "respuesta" then
    soltar()
    cambiar("libre")
    SNF.Eventos.emitir("SNF_IA_RESPUESTA", registro)
  elseif registro.t == "error" and not tardia then
    soltar()
    if registro.tipo == "detenido" then
      cambiar("libre", {registro = registro}) -- lo ha parado el jugador: no es un error
    else
      cambiar("error", {tipo = registro.tipo, texto = registro.texto, registro = registro})
    end
  end
end)
