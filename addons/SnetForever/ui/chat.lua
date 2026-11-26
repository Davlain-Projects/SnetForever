-- SnetForever: ventana de chat con la IA (fase 4, tarea 11). Junta el envío (ia/envio.lua), el buzón y los timbres, la
-- ruta de la IA (ia/ruta.lua, SNF.Ruta), las marcas de las bolsas (ia/marcas.lua) y la mini franja (ia/franja.lua) para el
-- jugador. Mismo aspecto que la ventana de guía y el panel rediseñados (Estilo.tarjeta, tema activo, bordes de 1 px, letra
-- con sombra) y la estructura de RestedXP: cabecera con emblema redondo, cuerpo en tarjetas y pie con la versión. Es un
-- marco normal: nada seguro, nada que juegue por el jugador; el addon nunca escribe en el chat público y toda propuesta
-- espera a que el jugador pulse.
--
--   ┌──────────────────────────────────────────────────────────┐ y=0
--   │ (◉) Chat con la IA                      ● App conectada [X] │ cabecera 40 (se arrastra para mover la ventana)
--   │     Motor: Claude · Rápido (Haiku)                         │
--   └──────────────────────────────────────────────────────────┘ y=40
--   ┌ ✖ Claude Code no tiene la sesión iniciada… ──────────────┐ aviso de la app (solo si la IA de la app no está «ok»)
--   ┌──────────────────────────────────────────────────────┬─┐ y=46 (o bajo el aviso)
--   │ Tú: ¿dónde voy ahora?                                │▲│ historial (ScrollingMessageFrame): lo único que se
--   │ IA: Ve a Villa Razor…                                │●│ desplaza, con la rueda y con la barra fina
--   │ La app SnetForever no ha leído el mensaje…           │▼│
--   └──────────────────────────────────────────────────────┴─┘
--   ┃ Ya tienes un marcador tuyo en el mapa…  [Cambiarlo][Dejar el mío] pregunta del marcador de mapa (si hay)
--   ┃ La IA propone una ruta de 3 paradas: …  [Aceptar][Descartar] propuesta de ruta o pines (si hay)
--   ┃ La IA propone cambiar a la guía «…»        [Cambiar] [No]    propuesta de guía (si existe en los datos)
--   ┃ La IA propone el grupo «…» (N objetos)…  [Aplicar][Descartar] propuesta de comercio (tarea 15, SNF.Propuesta)
--   ┌────────────────────────────────────────────┐ ┌───────┐ y=242 entrada (500 letras; Intro envía) y «Enviar»
--   │ Pregunta a la IA… (Intro envía)            │ │Enviar │
--   └────────────────────────────────────────────┘ └───────┘
--   [Nueva conversación] [Quitar pines] [Quitar marcas] [Quitar dibujos]  Pensando…  y=268 botones y estado
--   ┌──────────────────────────────────────────────────────────┐ y=292 hueco de la mini franja (424 × 44): la franja se
--   │ Vender: Lino ×15 (bolsa 0, hueco 1)                        │ ancla aquí y solo se ve al enviar; en reposo enseña las
--   └──────────────────────────────────────────────────────────┘ y=336 recomendaciones (Marcas.lista) o una pista
--   ├ ⚙                    SnetForever v0.5.0                    ┤ y=342 pie 18 (⚙: ajustes del chat en el panel)
--
-- Medidas (unidades de la ventana; 440 × 360, task-11-decisiones.md): margen 8 a los lados (todo lo de dentro mide 424 de
-- ancho), 6 entre bloques. Lo de abajo va anclado al borde de abajo (pie 0-18, hueco 24-68, botones 74-92, entrada 96-118,
-- todo desde abajo); lo de arriba, a la cabecera. El historial se queda con lo que dejan el aviso y las propuestas (nunca
-- menos de unas cuatro líneas). La mini franja mide 400 × 40 píxeles FÍSICOS con su propia escala y va en la capa TOOLTIP:
-- el hueco de 424 × 44 la deja entera a la vista porque la ventana nunca baja de 1 unidad = 1 píxel (F4-18). Mientras se
-- envía, en el hueco no hay nada más (las recomendaciones y la pista se ocultan). Con el chat oculto, la franja vuelve a su
-- sitio de respaldo (arriba a la izquierda, con su aviso) y al abrirlo vuelve al hueco (la franja solo se ancla con la
-- ventana a la vista: al enseñarse; al ocultarse, Franja.anclar(nil)).
--
-- Escala (Ruling F4-18): la ventana nunca baja de 1 unidad = 1 píxel físico, para que el hueco contenga siempre la franja.
-- Con k = UIParent:GetEffectiveScale() × alto físico / 768 (GetPhysicalScreenSize; sin ella, 1080 como ia/franja.lua), la
-- ventana lleva SetScale(max(1, 1 / k)). Se calcula al crearla, al enseñarla y con UI_SCALE_CHANGED y
-- DISPLAY_SIZE_CHANGED. chat.pos se guarda en unidades de UIParent ({punto, relPunto, x, y}): al cambiar la escala la
-- ventana se recoloca con x / escala y no salta de sitio.
--
-- Chat.crear() -> marco         crea SnetForeverChat (una sola vez), con el historial guardado, y ancla la franja al hueco.
-- Chat.abrir(), Chat.cerrar(), Chat.alternar()   /snet chat y /snet ia (ui/panel.lua) alternan; Escape la cierra.
-- Chat.anadir(quien, texto)     quien = "jugador" («Tú:»), "ia" («IA:») o "sistema" (en amarillo, sin prefijo). Se guarda en
--                               SnetForeverPJ.ia.chat (100 líneas como mucho, cada una de 500 bytes como mucho: un texto más
--                               largo ocupa varias, y solo la primera lleva el prefijo).
-- Chat.enviar(texto)            lo que hacen Intro y «Enviar»: Envio.enviar(texto); si sale bien, «Tú: …», la entrada se
--                               vacía y suelta el foco; si no, una línea de sistema con el motivo (vacio, ocupado, grande,
--                               sin_ranuras; «interno» ya lo cuenta el estado de error CHAT_FALLO_INTERNO).
-- Chat.escribiendo() -> boolean   ¿está escribiendo el jugador? La entrada de esta ventana tiene el foco o hay una caja de
--                               chat del juego activa (ChatEdit_GetActiveWindow(), si el cliente la tiene). El latido de
--                               ia/latido.lua no sale mientras tanto.
-- Chat.textoModelo(valor), Chat.textoMotor(), Chat.textoApp(), Chat.textoAvisoApp(), Chat.estadoIA()
--                               textos que comparten la cabecera y el apartado «Chat con la IA» del panel (F4-11): el modelo
--                               como «Rápido»/«Más listo» con el motor entre paréntesis si se conoce, «Motor: …», «App
--                               conectada»/«App sin conexión» y el texto de P6 del estado de la IA (estadoApp().motor o
--                               .claude), en el idioma del addon (con el motor Codex, sus propios textos).
-- Chat.marcos = {raiz, cabecera, emblema = {aro, disco, icono, retrato, aroRetrato}, titulo, subtitulo, app = {punto,
--                texto}, cerrar, aviso = {texto, icono}, cajaMensajes, mensajes, barra = {arriba, abajo, carril,
--                deslizador, pulgar}, marcador = {texto, cambiar, dejar}, propuesta = {texto, aceptar, descartar},
--                guia = {texto, cambiar, no},
--                rutaZona = {texto, abrir, no}, comercio = {texto, aplicar, descartar}, cajaEntrada,
--                entrada, pista, enviar, nueva, quitarPines, quitarMarcas, quitarDibujos, estado, zonaFranja = {pista},
--                recomendaciones = {lineas}, pie = {version, ajustes}}
--
-- Lo que escucha (todo por eventos; ningún OnUpdate):
--   SNF_IA_ESTADO(fase, detalle, registro)   la línea de estado y la entrada (desactivada en enviando y pensando); un error
--                               es una línea de sistema: la clave de L de un error propio o el texto que trae la app.
--   SNF_IA_RESPUESTA(registro)  «IA: …» (también una tardía), la propuesta (Ruta.proponer), las marcas (Marcas.poner), la
--                               guía (solo si Datos.guia(clave) existe) y el motor (SnetForeverPJ.ia.motor); con
--                               textoRecortado o guiaIAQuitada, además, una línea de sistema que lo avisa.
--   SNF_IA_SIGUE, SNF_IA_CABECERA   repintan la línea de estado y el botón «Enviar» / «Parar» de un turno de TATI.
--   SNF_IA_REGISTRO(registro)   el motor de cualquier registro del personaje.
--   SNF_IA_AVISO(clave)         una línea de sistema; RANURAS_FALTAN, RANURAS_DESACTIVADAS y RANURAS_AGOTADAS, una vez por
--                               tipo mientras no avance el buzón (F4-7: se emiten en cada intento de carga).
--   SNF_IA_RUTA_TERMINADA       «Ruta terminada».
--   SNF_IA_MARCADOR_PREGUNTA(pin)   marcador de mapa (mapa/marcador.lua): el jugador ya tiene uno suyo. Fila «Ya tienes un
--                               marcador tuyo en el mapa. ¿Lo cambio por «<etiqueta>»?» con [Cambiarlo]
--                               (Marcador.seguir(pin, {forzar = true})) y [Dejar el mío] (no se toca nada). Si el chat está
--                               cerrado se abre (la pregunta puede venir de un clic en el mapa). Se quita sola con
--                               SNF_PUNTOS_CAMBIADOS("ia") o SNF_MARCADOR_CAMBIADO si su pin ya no está en la capa «ia» o
--                               ya no hay marcador; «Cambiarlo» nunca pone un pin que ya no está.
--   SNF_IA_MARCADOR_COMBATE(pin)    una línea de sistema: «En combate: pongo el marcador de «<etiqueta>» al salir.»
--   registro.guiaIA             la ruta de zona (Ruta.proponerGuia): fila «La IA propone la ruta de <zona>: N misiones» con
--                               [Abrir la ruta] (Ruta.aceptarGuia) y [No] (Ruta.descartarGuia). Con registro.abrirGuiaIA = true
--                               (la pidió el jugador) se abre sola con flecha y pines y una línea de sistema, sin fila.
--   registro.comercio           tarea 15: el grupo y la regla de comercio (Propuesta.proponer): fila «La IA propone el grupo
--                               «X» (N objetos) con esta regla: …» con [Aplicar] (Propuesta.aplicar: crea el grupo propio y
--                               pone la regla, y lo dice en una línea de sistema) y [Descartar]. Nada cambia sin Aplicar, y
--                               aplicar nunca compra ni publica nada. SNF_COMERCIO_PROPUESTA repinta. proponer, aplicar y
--                               ese repintado van por Comercio.protegido: un fallo se apunta y el resto sigue.
--   registro.dibujos            los dibujos de la IA en el mapa (mapa/dibujos.lua, formato en su cabecera): se ponen solos,
--                               sin pedir aceptar (Dibujos.poner; con registro.dibujosReemplazar = true quitan antes los de
--                               antes), con la línea de sistema «Dibujado en el mapa: <n> trazo(s)» y sus textos, cortos.
--                               [Quitar dibujos] (Dibujos.quitar) solo está activo con dibujos; SNF_DIBUJOS_CAMBIADOS repinta.
--   SNF_IA_APP, SNF_IA_TIMBRE, SNF_IA_PROPUESTA, SNF_IA_PROPUESTA_GUIA, SNF_IA_MARCAS, SNF_DIBUJOS_CAMBIADOS y
--   SNF_AJUSTE_CAMBIADO   repintan (solo con la ventana a la
--                               vista; al enseñarse se repinta todo). BAG_UPDATE_DELAYED, solo mientras se ve.
-- ChatEdit_InsertLink (hooksecurefunc): con la entrada con el foco, mayúsculas + clic en un objeto o misión mete el enlace.
--   POR COMPROBAR en la tarea 22: mayúsculas + clic en un MONTÓN de las bolsas; con la caja de chat de Blizzard cerrada,
--   ChatEdit_InsertLink da false y el cliente puede abrir además el diálogo de dividir el montón (SPLITSTACK, StackSplitFrame).
local _, SNF = ...

local Chat = {}
SNF.Chat = Chat

local L = SNF.L
local Estilo = SNF.Estilo
local UI = SNF.UI
local Ajustes = SNF.Ajustes
local esSecreto = SNF.API.esSecreto
local TAMANOS = Estilo.TAMANOS
local floor = math.floor

local NOMBRE = "SnetForeverChat"
local CAPA = "HIGH"

-- Medidas (ver la cabecera).
local ANCHO, ALTO = 440, 360
local MARGEN = 8
local INTERIOR = ANCHO - 2 * MARGEN -- 424
local HUECO = 6
local ALTO_CABECERA = 40
local TAM_EMBLEMA, TAM_RETRATO = 38, 16
local X_TITULO = 48
local ALTO_PIE = 18
local TAM_ENGRANAJE = 14
local ALTO_BOTON = 18
local ALTO_ENTRADA = 22
local ALTO_ZONA = 44
local Y_ZONA = ALTO_PIE + HUECO -- 24, desde abajo
local Y_BOTONES = Y_ZONA + ALTO_ZONA + HUECO -- 74
local Y_ENTRADA = Y_BOTONES + ALTO_BOTON + 4 -- 96
local Y_CUERPO = ALTO_CABECERA + HUECO -- 46, desde arriba
local FIN_CUERPO = ALTO - (Y_ENTRADA + ALTO_ENTRADA) - HUECO -- 236: borde de abajo de lo que va encima de la entrada
local ANCHO_BARRA = 12
local RELLENO = 5 -- dentro de las tarjetas
local MAX_LINEAS_AVISO = 4
local MAX_LINEAS_PROPUESTA = 2
local RENGLONES_ZONA = 3
local MAX_LETRAS = 500
local MAX_GUARDADAS = 100
local MAX_BYTES = 500
local ALFA_DESACTIVADO = 0.4
local ALFA_RESALTE = 0.35

local CIRCULO = "Interface\\CharacterFrame\\TempPortraitAlphaMask"
local ICONO = "Interface\\Icons\\Spell_Holy_MindVision" -- el de la tarjeta «Chat con la IA» del panel
local ICONO_AVISO = "Interface\\RaidFrame\\ReadyCheck-NotReady"
local ICONO_AJUSTES = "Interface\\Buttons\\UI-OptionsButton"
local FLECHA_ARRIBA = "Interface\\Buttons\\UI-ScrollBar-ScrollUpButton-Up"
local FLECHA_ABAJO = "Interface\\Buttons\\UI-ScrollBar-ScrollDownButton-Up"
local RESALTE = "Interface\\Buttons\\ButtonHilight-Square"
local RECORTE_ICONO = {0.08, 0.92}
local RECORTE_FLECHA = {0.2, 0.8, 0.25, 0.75}

local COLOR_IA = {0.55, 0.78, 1, 1}
local COLOR_SISTEMA = {1, 0.82, 0.25, 1} -- como la línea de las marcas (#FFD040)
-- 11-nov (un jugador: «confundo lo que yo escribo con lo que me responde la IA, todo se ve igual»): lo del jugador va entero en
-- verde claro (el color del jugador en los pines) y la IA en blanco con su «IA:» azul; entre un mensaje y el siguiente,
-- una línea en blanco.
local COLOR_JUGADOR = {0.62, 1, 0.62, 1}
local SEPARADOR = " "
local COLOR_AVISO = {1, 0.82, 0.25, 1}
local COLOR_VENDER = {1, 0.82, 0.25, 1} -- los de la esquina de Baganator (ia/marcas.lua)
local COLOR_USAR = {0.4, 1, 0.4, 1}
local COLOR_VIVA = {0.25, 1, 0.25, 1}
local COLOR_MUERTA = {1, 0.3, 0.3, 1}

local QUIENES = {jugador = true, ia = true, sistema = true}
local ESTADOS_IA = {ok = true, sin_instalar = true, sin_sesion = true, pago_por_uso = true, desconocido = true}
local MOTIVOS = {vacio = "CHAT_VACIO", ocupado = "CHAT_OCUPADO", grande = "CHAT_GRANDE", sin_ranuras = "RANURAS_AGOTADAS"}
local AVISOS_BUZON = {RANURAS_FALTAN = true, RANURAS_DESACTIVADAS = true, RANURAS_AGOTADAS = true}
local PUNTOS = {
  TOPLEFT = true, TOP = true, TOPRIGHT = true, LEFT = true, CENTER = true, RIGHT = true,
  BOTTOMLEFT = true, BOTTOM = true, BOTTOMRIGHT = true,
}
local POS_DEFECTO = {punto = "CENTER", relPunto = "CENTER", x = 260, y = 40} -- unidades de UIParent
local ALTO_PANTALLA_POR_DEFECTO = 1080 -- si el cliente no tiene GetPhysicalScreenSize (como ia/franja.lua)

local marcos = {}
Chat.marcos = marcos

local raiz, mensajes, entrada
local guiaPendiente -- {clave, titulo?} propuesta por la IA y aún sin contestar
local rutaRetenida -- T3: la guía de la IA con abrirGuiaIA que no se abrió sola (había otra a medias): su tarjeta lo dice
local preguntaMarcador -- el pin cuyo marcador de mapa espera respuesta (el jugador tenía uno suyo)
local avisados = {} -- [clave de RANURAS_*] = Buzon.proxima() cuando se pintó

-- El texto de una línea de sistema por su clave. RANURAS_AGOTADAS lleva el número de ranuras (Buzon.RANURAS, lote G).
local function textoSistema(clave)
  if clave == "RANURAS_AGOTADAS" then
    return L.t(clave, SNF.Buzon.RANURAS)
  end
  return L.t(clave)
end

local cola -- líneas de sistema que llegan mientras se envía (van después de «Tú:»)
local botones = {} -- botones con texto, para el idioma
local escalaPuesta = 1 -- la de raiz:SetScale (GetScale() da un float de 32 bits: no sirve para comparar)

---------------------------------------------------------------------------------------------------
-- Utilidades
---------------------------------------------------------------------------------------------------

local function guardadoIa()
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj) ~= "table" then
    return nil
  end
  if type(pj.ia) ~= "table" then
    pj.ia = {}
  end
  return pj.ia
end

local function guardadas()
  local ia = guardadoIa()
  if not ia then
    return nil
  end
  if type(ia.chat) ~= "table" then
    ia.chat = {}
  end
  return ia.chat
end

local function hex(c)
  return string.format("|cFF%02X%02X%02X", floor(c[1] * 255 + 0.5), floor(c[2] * 255 + 0.5), floor(c[3] * 255 + 0.5))
end

local function color(fs, c)
  fs:SetTextColor(c[1], c[2], c[3], c[4] or 1)
end

local function colorToken(fs, token)
  color(fs, Estilo.color(token))
end

local function colocar(region, x, y)
  region:ClearAllPoints()
  region:SetPoint("TOPLEFT", raiz, "TOPLEFT", x, -y)
end

local function textura(padre, capa, ruta)
  local t = padre:CreateTexture(nil, capa)
  t:SetTexture(ruta)
  return t
end

local function alto(fs)
  local t = fs:GetText()
  if t == nil or t == "" then
    return 0
  end
  return fs:GetStringHeight()
end

-- Deja en `fs` el texto cortado a `max` renglones como mucho: lo que sobra se quita por palabras y acaba en «…».
-- Devuelve true si ha tenido que cortar.
local function cortarEnLineas(fs, texto, max)
  fs:SetText("Ag")
  local una = fs:GetStringHeight()
  fs:SetText(texto)
  if una <= 0 or fs:GetStringHeight() <= una * max + 0.5 then
    return false
  end
  local palabras = {}
  for p in string.gmatch(texto, "%S+") do
    palabras[#palabras + 1] = p
  end
  for n = #palabras - 1, 1, -1 do
    fs:SetText(table.concat(palabras, " ", 1, n) .. "…")
    if fs:GetStringHeight() <= una * max + 0.5 then
      return true
    end
  end
  return true
end

-- Trozos de `texto` de `max` bytes como mucho, sin partir un carácter UTF-8; si se puede, corta detrás de un blanco (que
-- se queda en el trozo de antes: no se pierde nada).
local function trozos(texto, max)
  local salida = {}
  while #texto > max do
    local fin = max
    while fin > 0 do
      local b = string.byte(texto, fin + 1)
      if b and b >= 0x80 and b < 0xC0 then
        fin = fin - 1
      else
        break
      end
    end
    if fin == 0 then
      fin = max -- UTF-8 roto (solo bytes de continuación): se corta a `max` para no quedarse en el bucle
    end
    local blanco = string.match(string.sub(texto, 1, fin), ".*()[ \n]")
    if blanco and blanco > max * 0.6 then
      fin = blanco
    end
    salida[#salida + 1] = string.sub(texto, 1, fin)
    texto = string.sub(texto, fin + 1)
  end
  if texto ~= "" then
    salida[#salida + 1] = texto
  end
  return salida
end

local function quitarBlancos(texto)
  return (string.gsub(string.gsub(texto, "^%s+", ""), "%s+$", ""))
end

-- Activa o desactiva un botón; desactivado se ve atenuado.
local function activar(b, si)
  if si then
    b:Enable()
    b:SetAlpha(1)
  else
    b:Disable()
    b:SetAlpha(ALFA_DESACTIVADO)
  end
end

-- Botón de texto pequeño (como los del panel), con fondo de cabecera, borde de 1 px y resalte al pasar el ratón. Su ancho
-- sigue al texto (cambia con el idioma).
local function boton(padre, clave, alPulsar, altoBoton)
  local b = UI.boton(padre, function()
    return L.t(type(clave) == "function" and clave() or clave)
  end, alPulsar)
  Estilo.tarjeta(b, "fondoCabecera")
  Estilo.fuente(b.texto, TAMANOS.pequeno)
  b:SetHeight(altoBoton or ALTO_BOTON)
  b:SetHighlightTexture(RESALTE, "ADD")
  local resalte = b:GetHighlightTexture()
  resalte:SetAllPoints(b)
  local refrescar = b.refrescar
  b.refrescar = function()
    refrescar()
    b:SetWidth(math.max(50, floor(b.texto:GetStringWidth() + 16)))
    local c = Estilo.color("resalte")
    resalte:SetVertexColor(c[1], c[2], c[3], ALFA_RESALTE)
  end
  b.refrescar()
  botones[#botones + 1] = b
  return b
end

---------------------------------------------------------------------------------------------------
-- Textos compartidos con el panel
---------------------------------------------------------------------------------------------------

-- «TATI» se llama igual en los dos idiomas (no va a textos/).
local MOTOR_TATI = "TATI"

local function motor()
  local ia = guardadoIa()
  local m = ia and ia.motor
  if m == "claude" or m == "codex" or m == "tati" then
    return m
  end
  -- Aún sin ninguna respuesta con motor: el nombre del motor en uso que da la app (estado.motorNombre), si lo trae.
  local e = SNF.Buzon.estadoApp()
  local n = type(e) == "table" and e.motorNombre or nil
  if n == "claude" or n == "codex" or n == "tati" then
    return n
  end
  return nil
end

local function guardarMotor(registro)
  local m = type(registro) == "table" and registro.motor or nil
  if type(m) ~= "string" or esSecreto(m) then
    return
  end
  if (m == "claude" or m == "codex" or m == "tati") and guardadoIa() then
    guardadoIa().motor = m
  end
end

-- Texto y nombre en Claude de cada modelo; lo raro se enseña como el rápido, que es lo que manda ia/envio.lua.
local MODELOS = {
  haiku = {"MODELO_HAIKU", "Haiku"},
  sonnet = {"MODELO_SONNET", "Sonnet"},
  opus = {"MODELO_OPUS", "Opus"},
}

function Chat.textoModelo(valor)
  local modelo = MODELOS[valor] or MODELOS.haiku
  local base = L.t(modelo[1])
  local m = motor()
  if m == "claude" then
    return L.t("MODELO_CON_MOTOR", base, modelo[2])
  elseif m == "codex" then
    return L.t("MODELO_CON_MOTOR", base, "Codex")
  end
  -- Con TATI solo el nombre del modelo, sin «con …».
  return base
end

function Chat.textoMotor()
  local m = motor()
  local nombre = m == "claude" and L.t("CHAT_MOTOR_CLAUDE") or m == "codex" and L.t("CHAT_MOTOR_CODEX")
    or m == "tati" and MOTOR_TATI or L.t("CHAT_MOTOR_NINGUNO")
  return L.t("CHAT_MOTOR", nombre)
end

function Chat.textoApp()
  return L.t(SNF.Timbres.appViva() and "CHAT_APP_CONECTADA" or "CHAT_APP_SIN_CONEXION")
end

-- El estado de la IA que da la app (ok, sin_instalar, sin_sesion, pago_por_uso, desconocido) o nil si aún no se sabe.
-- El campo se llama «claude» o «motor» según la versión de la app: vale el primero que traiga un estado conocido.
function Chat.estadoIA()
  local e = SNF.Buzon.estadoApp()
  if type(e) ~= "table" then
    return nil
  end
  for _, campo in ipairs({"motor", "claude"}) do
    local v = e[campo]
    if type(v) == "string" and not esSecreto(v) and ESTADOS_IA[v] then
      return v
    end
  end
  return nil
end

-- El texto de P6 de un tipo de error o de estado de la app (sin_sesion, limite…), en el idioma del addon: con el motor
-- Codex, su variante _CODEX si la hay. Un tipo sin texto propio (o raro) da el de «fallo», nunca el tipo en crudo.
local function textoDeTipo(tipo)
  if type(tipo) ~= "string" or esSecreto(tipo) or not string.find(tipo, "^[%l_]+$") then
    tipo = "fallo"
  end
  local clave = "CHAT_APP_" .. string.upper(tipo)
  if motor() == "codex" and L.tablas.en[clave .. "_CODEX"] then
    clave = clave .. "_CODEX"
  end
  if not L.tablas.en[clave] then
    clave = "CHAT_APP_FALLO"
  end
  if clave == "CHAT_APP_FALLO" then
    return L.t(clave, L.t("CHAT_SIN_DETALLE"))
  end
  return L.t(clave)
end

-- El texto de P6 del estado de la IA, o nil si está bien o no se sabe.
function Chat.textoAvisoApp()
  local v = Chat.estadoIA()
  if not v or v == "ok" then
    return nil
  end
  return textoDeTipo(v)
end

---------------------------------------------------------------------------------------------------
-- Historial
---------------------------------------------------------------------------------------------------

-- ¿El texto viene ya escapado y con colores válidos (lo hace la app)? Cada «|» ha de ser parte de «||», «|c» + 8 hex o «|r»,
-- y cada «|c» ha de cerrarse con su «|r» dentro de la misma línea. Con «|H», «|T», «|K», «|A», «|n» o una «|» suelta, no.
local function bienFormado(t)
  local abierto = false
  local i = 1
  while true do
    local b = string.find(t, "|", i, true)
    if not b then
      break
    end
    local sig = string.sub(t, b + 1, b + 1)
    if sig == "|" then
      i = b + 2
    elseif sig == "r" then
      if not abierto then
        return false
      end
      abierto = false
      i = b + 2
    elseif sig == "c" and string.find(string.sub(t, b + 2, b + 9), "^%x%x%x%x%x%x%x%x$") then
      if abierto then
        return false
      end
      abierto = true
      i = b + 10
    else
      return false
    end
  end
  return not abierto
end

-- Una línea guardada {q, t, c?, a?} como se pinta: prefijo en color (salvo las continuaciones) y las barras del texto que no
-- es del jugador escapadas (la IA o la app podrían traer una «|» suelta, que el cliente leería como código). La app ya
-- escapa lo suyo (líneas «ia» y errores de la app, a = true): si está bien formado se pinta tal cual; si no, se escapa.
local function formatear(e)
  local t = e.t
  if e.q ~= "jugador" then
    local deApp = e.q == "ia" or e.a
    if not (deApp and bienFormado(t)) then
      t = string.gsub(t, "|", "||")
    end
  end
  if e.q == "sistema" then
    return hex(COLOR_SISTEMA) .. t .. "|r"
  end
  if e.q == "jugador" then
    -- Lo del jugador nunca lleva códigos de color propios: entero en su color, también las continuaciones.
    if e.c then
      return hex(COLOR_JUGADOR) .. t .. "|r"
    end
    return hex(COLOR_JUGADOR) .. L.t("CHAT_JUGADOR") .. " " .. t .. "|r"
  end
  if e.c then
    return t
  end
  return hex(COLOR_IA) .. L.t("CHAT_IA") .. "|r " .. t
end

local function valida(e)
  return type(e) == "table" and QUIENES[e.q] and type(e.t) == "string" and e.t ~= ""
end

local sincronizarBarra -- más abajo

local function pintarHistorial()
  mensajes:Clear()
  local lista = guardadas() or {}
  local validas = {}
  for _, e in ipairs(lista) do
    if valida(e) then
      validas[#validas + 1] = e
    end
  end
  for k = math.max(1, #validas - MAX_GUARDADAS + 1), #validas do
    if not validas[k].c and mensajes:GetNumMessages() > 0 then
      mensajes:AddMessage(SEPARADOR, 1, 1, 1)
    end
    mensajes:AddMessage(formatear(validas[k]), 1, 1, 1)
  end
  mensajes:ScrollToBottom()
  sincronizarBarra()
end

-- Fin del token que empieza en `i` de una línea de la app: «||», «|cXXXXXXXX», «|r» o un carácter UTF-8 entero.
local function finToken(linea, i)
  if string.sub(linea, i, i) == "|" then
    local sig = string.sub(linea, i + 1, i + 1)
    if sig == "|" or sig == "r" then
      return i + 1
    end
    if sig == "c" and string.find(string.sub(linea, i + 2, i + 9), "^%x%x%x%x%x%x%x%x$") then
      return i + 9
    end
    return i
  end
  local b = string.byte(linea, i)
  local n = (b >= 0xF0 and 3) or (b >= 0xE0 and 2) or (b >= 0xC0 and 1) or 0
  return math.min(i + n, #linea)
end

-- Trozos de `max` bytes como mucho de una línea bien formada de la app, sin partir un «||», un código de color ni un
-- carácter; si se puede, corta detrás de un espacio. Si un color cruza el corte, lo cierra con «|r» al final del trozo y
-- lo reabre al principio del siguiente (como partirLinea en app/src/respuesta.mjs): así cada trozo sigue bien formado.
local function trozosConColor(linea, max)
  local salida = {}
  local abrir = "" -- color que hay que reabrir al principio del trozo
  local i = 1
  local n = #linea
  while i <= n do
    local bytes = #abrir
    local abierto = abrir
    local fin, abiertoFin -- el último token que cabe
    local espacio, abiertoEspacio -- el último espacio que cabe
    local j = i
    while j <= n do
      local k = finToken(linea, j)
      local t = string.sub(linea, j, k)
      local nuevo = abierto
      if #t == 10 then
        nuevo = t
      elseif t == "|r" then
        nuevo = ""
      end
      if bytes + #t + (nuevo ~= "" and 2 or 0) > max then
        break
      end
      bytes = bytes + #t
      abierto = nuevo
      fin, abiertoFin = k, abierto
      if t == " " then
        espacio, abiertoEspacio = k, abierto
      end
      j = k + 1
    end
    if j > n then
      salida[#salida + 1] = abrir .. string.sub(linea, i)
      return salida
    end
    if espacio and espacio - i + 1 > max * 0.6 then
      fin, abiertoFin = espacio, abiertoEspacio
    elseif not fin then
      fin, abiertoFin = finToken(linea, i), abrir -- no cabe ni un token: no debería pasar, pero avanza
    end
    salida[#salida + 1] = abrir .. string.sub(linea, i, fin) .. (abiertoFin ~= "" and "|r" or "")
    abrir = abiertoFin
    i = fin + 1
  end
  return salida
end

-- Trozos de un texto para el historial: primero se parte por «\n» (la app cierra cada color dentro de su línea) y las
-- líneas seguidas se juntan mientras quepan en `max` bytes, así un corte nunca cae en mitad de una línea que cabe y el
-- historial no gasta una entrada por renglón. Una línea que no cabe sola se trocea: con colores (si es de la app y está
-- bien formada) cerrándolos y reabriéndolos; si no, por bytes como siempre (formatear la escapará entera).
local function trozosDe(texto, max, conColor)
  local salida = {}
  local actual = nil
  local function soltar()
    if actual and actual ~= "" then
      salida[#salida + 1] = actual
    end
    actual = nil
  end
  for linea in string.gmatch(texto .. "\n", "(.-)\n") do
    if #linea > max then
      soltar()
      local partes
      if conColor and string.find(linea, "|", 1, true) and bienFormado(linea) then
        partes = trozosConColor(linea, max)
      else
        partes = trozos(linea, max)
      end
      for _, p in ipairs(partes) do
        salida[#salida + 1] = p
      end
    elseif actual == nil then
      actual = linea
    elseif #actual + 1 + #linea <= max then
      actual = actual .. "\n" .. linea
    else
      soltar()
      actual = linea
    end
  end
  soltar()
  return salida
end

function Chat.anadir(quien, texto, deApp)
  if not QUIENES[quien] or type(texto) ~= "string" or esSecreto(texto) then
    return
  end
  texto = quitarBlancos(texto)
  if texto == "" then
    return
  end
  local lista = guardadas()
  local conColor = quien == "ia" or (quien == "sistema" and deApp)
  for k, trozo in ipairs(trozosDe(texto, MAX_BYTES, conColor)) do
    local e = {q = quien, t = trozo, c = k > 1 or nil, a = (quien == "sistema" and deApp) or nil}
    if lista then
      lista[#lista + 1] = e
      while #lista > MAX_GUARDADAS do
        table.remove(lista, 1)
      end
    end
    if mensajes then
      if not e.c and mensajes:GetNumMessages() > 0 then
        mensajes:AddMessage(SEPARADOR, 1, 1, 1)
      end
      mensajes:AddMessage(formatear(e), 1, 1, 1)
    end
  end
  if mensajes then
    mensajes:ScrollToBottom()
    sincronizarBarra()
  end
end

-- Línea de sistema; mientras se envía espera a que salga «Tú: …».
local function sistema(texto, deApp)
  if cola then
    cola[#cola + 1] = deApp and {texto = texto, deApp = true} or texto
  else
    Chat.anadir("sistema", texto, deApp)
  end
end

---------------------------------------------------------------------------------------------------
-- Barra de desplazamiento del historial (pulgar arriba = lo más antiguo)
---------------------------------------------------------------------------------------------------

-- Lo más que se puede subir. Si al cliente le faltara GetMaxScrollRange, un mensaje por línea.
local function rango()
  if mensajes.GetMaxScrollRange then
    return math.max(0, mensajes:GetMaxScrollRange())
  end
  return math.max(0, mensajes:GetNumMessages() - 1)
end

-- Pone el desplazamiento (0 = abajo del todo); sin SetScrollOffset, bajando del todo y subiendo de una en una.
local function ponerDesplazamiento(n)
  if mensajes.SetScrollOffset then
    mensajes:SetScrollOffset(n)
    return
  end
  mensajes:ScrollToBottom()
  for _ = 1, n do
    mensajes:ScrollUp()
  end
end

sincronizarBarra = function()
  local barra = marcos.barra
  if not barra then
    return
  end
  local r = rango()
  local desplazado = mensajes:GetScrollOffset()
  barra.ajustando = true
  barra.deslizador:SetMinMaxValues(0, r)
  barra.deslizador:SetValue(r - desplazado)
  barra.ajustando = false
  barra.deslizador:SetShown(r > 0)
  local c = Estilo.color("resalte")
  barra.pulgar:SetVertexColor(c[1], c[2], c[3], 1)
  local f = Estilo.color("fondo")
  barra.carril:SetVertexColor(f[1], f[2], f[3], 1)
  for _, par in ipairs({{barra.arriba, desplazado < r}, {barra.abajo, desplazado > 0}}) do
    local b, si = par[1], par[2]
    if si then
      b:Enable()
      b.icono:SetVertexColor(1, 1, 1, 1)
    else
      b:Disable()
      b.icono:SetVertexColor(0.4, 0.4, 0.4, 1)
    end
  end
end

local function desplazar(arriba)
  if arriba then
    mensajes:ScrollUp()
  else
    mensajes:ScrollDown()
  end
  sincronizarBarra()
end

---------------------------------------------------------------------------------------------------
-- Pintar
---------------------------------------------------------------------------------------------------

local function pintarCabecera()
  local em = marcos.emblema
  local b = Estilo.color("borde")
  em.aro:SetVertexColor(b[1], b[2], b[3], 1)
  em.aroRetrato:SetVertexColor(b[1], b[2], b[3], 1)
  local f = Estilo.color("fondo")
  em.disco:SetVertexColor(f[1], f[2], f[3], 1)
  local conRetrato = SetPortraitTexture ~= nil and pcall(SetPortraitTexture, em.retrato, "player")
  em.retrato:SetShown(conRetrato and true or false)
  em.aroRetrato:SetShown(conRetrato and true or false)

  marcos.titulo:SetText(L.t("CHAT_TITULO"))
  colorToken(marcos.titulo, "texto")
  local viva = SNF.Timbres.appViva()
  local app = marcos.app
  app.texto:SetText(Chat.textoApp())
  colorToken(app.texto, "secundario")
  local c = viva and COLOR_VIVA or COLOR_MUERTA
  app.punto:SetVertexColor(c[1], c[2], c[3], 1)
  local anchoApp = floor(app.texto:GetStringWidth() + 12)
  app:SetWidth(anchoApp)
  marcos.subtitulo:SetText(Chat.textoMotor() .. " · " .. Chat.textoModelo(Ajustes.get("ia.modelo")))
  colorToken(marcos.subtitulo, "secundario")
  -- El título y el subtítulo llegan hasta el indicador de la app (que va pegado a la X).
  local ancho = ANCHO - X_TITULO - (MARGEN + ALTO_BOTON + 8 + anchoApp + 8)
  marcos.titulo:SetWidth(ancho)
  marcos.subtitulo:SetWidth(ancho)
end

-- El aviso de la app (estado de la IA que no es «ok»). Devuelve su alto (0 si no se ve).
local function pintarAviso()
  local aviso = marcos.aviso
  local texto = Chat.textoAvisoApp()
  if not texto then
    aviso:Hide()
    return 0
  end
  aviso:Show()
  aviso.texto:SetWidth(INTERIOR - 24 - 8)
  cortarEnLineas(aviso.texto, texto, MAX_LINEAS_AVISO)
  aviso.franja:SetVertexColor(COLOR_AVISO[1], COLOR_AVISO[2], COLOR_AVISO[3], 1)
  return math.max(alto(aviso.texto), 12) + 2 * RELLENO + 2
end

-- Texto de una propuesta de ruta: las paradas que siguen (en orden) o, si ninguna sigue, los pines.
local function textoPropuesta(propuesta)
  local ruta, pines = {}, {}
  for _, p in ipairs(type(propuesta.puntos) == "table" and propuesta.puntos or {}) do
    if type(p) == "table" then
      local etiqueta = type(p.etiqueta) == "string" and not esSecreto(p.etiqueta) and p.etiqueta or "?"
      if p.seguir == true then
        ruta[#ruta + 1] = etiqueta
      else
        pines[#pines + 1] = etiqueta
      end
    end
  end
  if #ruta > 0 then
    local t = #ruta == 1 and L.t("CHAT_PROPUESTA_RUTA_UNA", ruta[1])
      or L.t("CHAT_PROPUESTA_RUTA", #ruta, table.concat(ruta, ", "))
    if #pines == 1 then
      t = L.t("CHAT_PROPUESTA_Y_PIN", t)
    elseif #pines > 1 then
      t = L.t("CHAT_PROPUESTA_Y_PINES", t, #pines)
    end
    return t
  end
  if #pines == 1 then
    return L.t("CHAT_PROPUESTA_PIN", pines[1])
  end
  return L.t("CHAT_PROPUESTA_PINES", #pines, table.concat(pines, ", "))
end

-- Cobre como «1g 20s 00c»: el dinero de todo el addon, del mismo sitio que Tema.dineroPlano (SNF.Texto.dinero; revisión
-- B7, menor 10: antes el chat iba con «o» y «p» y la ventana con «g» y «s»).
local function dinero(cobre)
  return SNF.Texto.dinero(floor(cobre))
end

-- Un número con dos decimales y la coma en español.
local function decimal(v)
  local t = string.format("%.2f", v)
  if L.idioma() == "es" then
    t = string.gsub(t, "%.", ",")
  end
  return t
end

-- Los campos de una regla de la IA, en el orden de la plantilla: «comprar a ≤ 70 %, ritmo ≥ 0,50…».
local function textoRegla(regla)
  local partes = {}
  local function poner(campo, clave, valor)
    if type(regla[campo]) == "number" and not esSecreto(regla[campo]) then
      partes[#partes + 1] = L.t(clave, valor(regla[campo]))
    end
  end
  poner("compraPct", "CHAT_REGLA_COMPRA", floor)
  poner("sniperPct", "CHAT_REGLA_SNIPER", floor)
  poner("ritmoMin", "CHAT_REGLA_RITMO", decimal)
  poner("valorMin", "CHAT_REGLA_VALOR", dinero)
  poner("maxUnidades", "CHAT_REGLA_UNIDADES", floor)
  poner("maxOro", "CHAT_REGLA_ORO", dinero)
  return table.concat(partes, ", ")
end

-- 0.7.0: la propuesta de comercio es del addon SnetForever_Comercio. Sin él (desactivado en la lista de addons) no hay
-- SNF.Propuesta ni SNF.Comercio: devuelve nil, no sale la tarjeta [Aplicar] y la respuesta de la IA se enseña igual. Lo
-- mismo en la sesión en que el comercio está dormido (estaba apagado en la 0.6.4, SNF.comercioDormido de arranque.lua).
local function delComercio()
  local Propuesta, Comercio = rawget(SNF, "Propuesta"), rawget(SNF, "Comercio")
  if SNF.comercioDormido() then
    return nil
  end
  if type(Propuesta) == "table" and type(Comercio) == "table" then
    return Propuesta, Comercio
  end
  return nil
end

-- Texto de la propuesta de comercio (SNF.Propuesta.pendiente(), ya comprobada): el grupo nuevo con su regla, o la regla
-- sola para el grupo que el jugador tenía abierto.
local function textoComercio(p)
  if type(p.grupo) == "table" then
    local n = #p.grupo.objetos
    local t = n == 1 and L.t("CHAT_PROPUESTA_COMERCIO_GRUPO_UNO", p.grupo.nombre)
      or L.t("CHAT_PROPUESTA_COMERCIO_GRUPO", p.grupo.nombre, n)
    if type(p.regla) == "table" then
      t = L.t("CHAT_PROPUESTA_COMERCIO_CON_REGLA", t, textoRegla(p.regla))
    end
    return t
  end
  local para = type(p.paraGrupo) == "table" and (p.paraGrupo.nombre or p.paraGrupo.clave) or "?"
  return L.t("CHAT_PROPUESTA_COMERCIO_REGLA", para, textoRegla(p.regla or {}))
end

-- Una tarjeta de propuesta (texto a la izquierda, botones a la derecha). Devuelve su alto (0 si no se ve).
local function pintarTarjeta(t, texto)
  if not texto then
    t:Hide()
    return 0
  end
  t:Show()
  local anchoBotones = t.b1:GetWidth() + 4 + t.b2:GetWidth()
  t.texto:SetWidth(INTERIOR - 12 - anchoBotones - 6 - 8)
  t.completo = texto
  t.cortado = cortarEnLineas(t.texto, texto, MAX_LINEAS_PROPUESTA)
  local a = Estilo.color("pestana")
  t.franja:SetVertexColor(a[1], a[2], a[3], 1)
  return math.max(alto(t.texto), ALTO_BOTON) + 2 * RELLENO
end

-- El nombre de la zona de una ruta de la IA: de su clave «IA\Ruta de <zona> (<facción>)»; si no cuadra, el título.
local function zonaDe(guia)
  local zona = string.match(guia.clave, "^IA\\Ruta de (.+) %(.-%)$") or string.match(guia.clave, "^IA\\(.+)$")
  return zona or L.de(guia.titulo) or guia.clave
end

-- Cuántas misiones trae la ruta: las del resumen de la app o, sin él, las que se recogen en sus pasos.
local function misionesDe(guia)
  local resumen = type(guia.resumen) == "table" and guia.resumen.misiones or nil
  if type(resumen) == "number" and not esSecreto(resumen) then
    return floor(resumen)
  end
  local vistas, n = {}, 0
  for _, paso in ipairs(guia.pasos) do
    for _, e in ipairs(paso.elementos) do
      if e.t == "accept" and not vistas[e.q] then
        vistas[e.q] = true
        n = n + 1
      end
    end
  end
  return n
end

-- «La IA propone la ruta de <zona>: N misiones» (singular con una).
local function textoRutaZona(guia)
  local n = misionesDe(guia)
  local texto
  if n == 1 then
    texto = L.t("CHAT_PROPUESTA_RUTA_ZONA_UNA", zonaDe(guia))
  else
    texto = L.t("CHAT_PROPUESTA_RUTA_ZONA", zonaDe(guia), n)
  end
  -- T3: la que no se abrió sola porque había una guía a medias lo dice (con el paso de esa guía, de ahora).
  local aMedias = guia == rutaRetenida and SNF.Guias.aMedias()
  if aMedias then
    local pregunta
    if SNF.Ruta.esGuiaDeParadas(aMedias.clave) then
      -- Ronda 1 (Menor 6): la guía de una ruta de pines se quita al dejarla (no hay vuelta): se dice.
      pregunta = aMedias.n and L.t("CHAT_RUTA_A_MEDIAS", aMedias.n, aMedias.total) or L.t("CHAT_RUTA_A_MEDIAS_SIN_PARADA")
    else
      pregunta = aMedias.n and L.t("CHAT_GUIA_A_MEDIAS", aMedias.n, aMedias.total) or L.t("CHAT_GUIA_A_MEDIAS_SIN_PASO")
    end
    texto = texto .. ". " .. pregunta
  end
  return texto
end

-- T3: abre algo encima de la guía cargada (Ruta.aceptar o Ruta.aceptarGuia) y, si la de antes estaba a medias y queda
-- apuntada para volver, lo dice una vez en el chat. Ronda 1 (Menor 1): solo si sale el botón «Volver a» (la misma
-- condición, Avisos.botonVolver): no se promete un botón que no se ve.
local function abrirEncima(abrir)
  local antes = SNF.Guias.aMedias()
  local abierta = abrir()
  if abierta and antes and SNF.Motor.estado().clave ~= antes.clave and SNF.Avisos.botonVolver() == antes.clave then
    sistema(antes.n and L.t("CHAT_GUIA_SE_QUEDA", antes.titulo, antes.n) or L.t("CHAT_GUIA_SE_QUEDA_SIN_PASO", antes.titulo))
  end
  return abierta
end

local function guiaValida()
  if type(guiaPendiente) ~= "table" or type(guiaPendiente.clave) ~= "string" then
    return nil
  end
  if not SNF.Datos.guia(guiaPendiente.clave) then
    return nil
  end
  return guiaPendiente.clave
end

-- Lo que la IA recomienda vender o usar (Marcas.lista), lo de vender primero, en los renglones del hueco de la franja:
-- si no caben todos, el último dice «y N más».
local function pintarRecomendaciones(enviando)
  if not raiz:IsVisible() then
    return -- no se leen las bolsas para nada: al enseñarse se repinta todo
  end
  local r = marcos.recomendaciones
  local lista = enviando and {} or SNF.Marcas.lista()
  local orden = {}
  for _, tipo in ipairs({"vender", "usar"}) do
    for _, e in ipairs(lista) do
      if e.tipo == tipo then
        orden[#orden + 1] = e
      end
    end
  end
  local n = #orden
  local mostrados = n > RENGLONES_ZONA and RENGLONES_ZONA - 1 or n
  for k = 1, RENGLONES_ZONA do
    local fs = r.lineas[k]
    local e = orden[k]
    if k <= mostrados then
      local pos = e.posiciones[1] or {0, 0}
      fs:SetText(L.t(e.tipo == "vender" and "CHAT_VENDER" or "CHAT_USAR", tostring(e.nombre), floor(e.n),
        floor(pos[1]), floor(pos[2])))
      color(fs, e.tipo == "vender" and COLOR_VENDER or COLOR_USAR)
    elseif k == mostrados + 1 and n > mostrados then
      fs:SetText(L.t("CHAT_RECOMENDACIONES_MAS", n - mostrados))
      colorToken(fs, "secundario")
    else
      fs:SetText("")
    end
  end
  r:SetShown(n > 0)
  marcos.zonaFranja.pista:SetShown(n == 0 and not enviando)
end

-- «Enviar» pasa a «Parar» con un turno de TATI en marcha: solo cambia el texto, sin animación ni color.
local botonEsParar = false

-- Estado del envío: la línea de estado, la entrada y lo que hay en el hueco de la franja.
local function pintarEstado()
  local e = SNF.Envio.estado()
  local texto = ""
  if e.fase == "enviando" then
    local total = type(e.detalle) == "table" and tonumber(e.detalle.total) or nil
    texto = (total and total > 1) and L.t("CHAT_ENVIANDO", floor(total)) or L.t("CHAT_ENVIANDO_UNA")
  elseif e.parando then
    texto = L.t("CHAT_PARANDO")
  elseif e.fase == "pensando" and e.sigue then
    texto = L.t("CHAT_TATI_SIGUE", math.max(1, floor(e.sigue / 60)))
  elseif e.fase == "pensando" then
    texto = L.t("CHAT_PENSANDO")
  end
  marcos.estado:SetText(texto)
  colorToken(marcos.estado, "secundario")
  local esperando = e.fase == "enviando" or e.fase == "pensando"
  if esperando then
    entrada:ClearFocus()
    entrada:Disable()
    marcos.cajaEntrada:SetAlpha(0.6)
  else
    entrada:Enable()
    marcos.cajaEntrada:SetAlpha(1)
  end
  local puedeParar = SNF.Envio.puedeParar()
  local esParar = puedeParar or e.parando == true
  if esParar ~= botonEsParar then
    botonEsParar = esParar
    marcos.enviar.refrescar()
    marcos.cajaEntrada:SetWidth(INTERIOR - marcos.enviar:GetWidth() - 4)
  end
  activar(marcos.enviar, not esperando or puedeParar)
  marcos.pista:SetShown(entrada:GetText() == "" and not entrada:HasFocus())
  pintarRecomendaciones(e.fase == "enviando")
end

-- Alto de un renglón del historial: el tamaño de la letra del marco más su espacio entre líneas (GetSpacing, si el
-- cliente lo tiene), que es lo que avanza el ScrollingMessageFrame por cada línea.
local function altoRenglon()
  local _, tamano = mensajes:GetFont()
  local espacio = 0
  local ok, valor = pcall(function()
    return mensajes:GetSpacing()
  end)
  if ok and type(valor) == "number" and not esSecreto(valor) and valor > 0 then
    espacio = valor
  end
  tamano = type(tamano) == "number" and not esSecreto(tamano) and tamano or TAMANOS.paso
  return tamano + espacio
end

-- Lote E3: el historial ocupa un número entero de renglones de su caja (lo que sobra, menos de un renglón, queda arriba
-- vacío). Así la primera línea visible cae siempre entera cuando el chat está abajo del todo.
local function ajustarAltoMensajes(altoCaja)
  local renglon = altoRenglon()
  local cuantos = math.max(1, floor((altoCaja - 2 * RELLENO) / renglon))
  mensajes:SetHeight(cuantos * renglon)
end

-- El nombre de un pin para las líneas del marcador de mapa (su etiqueta, sin colores ni secretos).
local function etiquetaPin(pin)
  local e = type(pin) == "table" and pin.etiqueta or nil
  if type(e) ~= "string" or esSecreto(e) or e == "" then
    return "?"
  end
  return SNF.Texto.limpiar(e)
end

-- ¿Sigue el pin en la capa «ia»?
local function pinEnCapa(pin)
  for _, p in ipairs(SNF.Capa.puntos("ia")) do
    if p == pin then
      return true
    end
  end
  return false
end

-- Coloca los bloques de arriba: aviso, historial y propuestas (el historial se queda con lo que sobra).
local function disponer()
  local y = Y_CUERPO
  local hAviso = pintarAviso()
  if hAviso > 0 then
    colocar(marcos.aviso, MARGEN, y)
    marcos.aviso:SetHeight(hAviso)
    y = y + hAviso + HUECO
  end
  local hm = pintarTarjeta(marcos.marcador, preguntaMarcador and L.t("CHAT_MARCADOR_PREGUNTA",
    etiquetaPin(preguntaMarcador)) or nil)
  local pendiente = SNF.Ruta.pendiente()
  local hp = pintarTarjeta(marcos.propuesta, type(pendiente) == "table" and textoPropuesta(pendiente) or nil)
  local clave = guiaValida()
  local hg = pintarTarjeta(marcos.guia, clave and L.t("CHAT_PROPUESTA_GUIA", SNF.Guias.titulo(clave) or clave) or nil)
  local rutaZona = SNF.Ruta.guiaPendiente()
  local hr = pintarTarjeta(marcos.rutaZona, rutaZona and textoRutaZona(rutaZona) or nil)
  local Propuesta = delComercio()
  local comercio = Propuesta and Propuesta.pendiente()
  local hc = pintarTarjeta(marcos.comercio, type(comercio) == "table" and textoComercio(comercio) or nil)
  local abajo = FIN_CUERPO
  for _, par in ipairs({{marcos.comercio, hc}, {marcos.rutaZona, hr}, {marcos.guia, hg}, {marcos.propuesta, hp},
    {marcos.marcador, hm}}) do
    if par[2] > 0 then
      abajo = abajo - par[2]
      colocar(par[1], MARGEN, abajo)
      par[1]:SetHeight(par[2])
      abajo = abajo - HUECO
    end
  end
  colocar(marcos.cajaMensajes, MARGEN, y)
  local altoCaja = math.max(ALTO_BOTON * 2, abajo - y)
  marcos.cajaMensajes:SetHeight(altoCaja)
  ajustarAltoMensajes(altoCaja)
end

-- La fila de abajo: los cuatro botones a la izquierda y el estado en lo que queda a la derecha; la entrada hasta «Enviar».
-- «Quitar dibujos» solo está activo con dibujos de la IA en el mapa.
local function pintarFilas()
  marcos.cajaEntrada:SetWidth(INTERIOR - marcos.enviar:GetWidth() - 4)
  local usado = marcos.nueva:GetWidth() + marcos.quitarPines:GetWidth() + marcos.quitarMarcas:GetWidth()
    + marcos.quitarDibujos:GetWidth() + 12
  marcos.estado:SetWidth(math.max(0, INTERIOR - usado - 8))
  activar(marcos.quitarDibujos, SNF.Dibujos.cuantos() > 0)
end

local function pintar()
  if not raiz or not raiz:IsVisible() then
    return
  end
  pintarCabecera()
  pintarFilas()
  pintarEstado()
  disponer()
  marcos.pie.version:SetText(L.t("PIE_VERSION", SNF.VERSION or ""))
  colorToken(marcos.pie.version, "secundario")
  marcos.zonaFranja.pista:SetText(L.t("CHAT_ZONA_ENVIO"))
  colorToken(marcos.zonaFranja.pista, "secundario")
  marcos.pista:SetText(L.t("CHAT_ESCRIBE"))
  colorToken(marcos.pista, "secundario")
  sincronizarBarra()
end
Chat.pintar = pintar

local function refrescarTextos()
  for _, b in ipairs(botones) do
    b.refrescar()
  end
  if mensajes then
    pintarHistorial()
  end
  pintar()
end

---------------------------------------------------------------------------------------------------
-- Enviar
---------------------------------------------------------------------------------------------------

function Chat.escribiendo()
  if entrada and entrada:HasFocus() then
    return true
  end
  local activa = rawget(_G, "ChatEdit_GetActiveWindow")
  return type(activa) == "function" and activa() ~= nil or false
end

function Chat.enviar(texto)
  texto = type(texto) == "string" and texto or ""
  cola = {}
  local bien, ok, motivo = pcall(SNF.Envio.enviar, texto)
  local pendientes = cola
  cola = nil
  if not bien then
    -- Un fallo inesperado del envío: se suelta lo que hubiera empezado (estado y franja), se cuenta al jugador después
    -- de los avisos que ya hubieran llegado y se informa (no se esconde el error).
    SNF.Envio.cancelar()
    SNF.Franja.ocultar()
    pendientes[#pendientes + 1] = L.t("CHAT_FALLO_INTERNO")
    geterrorhandler()(ok)
    ok, motivo = false, "interno"
  elseif ok then
    Chat.anadir("jugador", texto)
    if entrada then
      entrada:SetText("")
      entrada:ClearFocus()
    end
  elseif MOTIVOS[motivo] then
    Chat.anadir("sistema", textoSistema(MOTIVOS[motivo]))
    if motivo == "vacio" and entrada then
      entrada:SetText("")
      entrada:ClearFocus()
    end
  end
  for _, t in ipairs(pendientes) do
    if type(t) == "table" then
      Chat.anadir("sistema", t.texto, t.deApp)
    else
      Chat.anadir("sistema", t)
    end
  end
  pintar()
  return ok, motivo
end

---------------------------------------------------------------------------------------------------
-- Marco
---------------------------------------------------------------------------------------------------

-- La posición se guarda en unidades de UIParent: los desplazamientos de GetPoint van en unidades de la ventana.
local function guardarPosicion()
  local punto, _, relPunto, x, y = raiz:GetPoint(1)
  if punto then
    Ajustes.set("chat.pos", {punto = punto, relPunto = relPunto, x = x * raiz:GetScale(), y = y * raiz:GetScale()})
  end
end

local function colocarVentana()
  local pos = Ajustes.get("chat.pos")
  if type(pos) ~= "table" or not PUNTOS[pos.punto] or not PUNTOS[pos.relPunto] or type(pos.x) ~= "number"
    or type(pos.y) ~= "number" then
    pos = POS_DEFECTO
  end
  raiz:ClearAllPoints()
  raiz:SetPoint(pos.punto, UIParent, pos.relPunto, pos.x / raiz:GetScale(), pos.y / raiz:GetScale())
end

-- Alto de la pantalla en píxeles físicos.
local function altoFisico()
  local f = rawget(_G, "GetPhysicalScreenSize")
  if type(f) == "function" then
    local _, a = f()
    if type(a) == "number" and not esSecreto(a) and a > 0 then
      return a
    end
  end
  return ALTO_PANTALLA_POR_DEFECTO
end

-- F4-18: escala de la ventana para que 1 unidad mida al menos 1 píxel físico; después la recoloca (chat.pos va en
-- unidades de UIParent).
local function ajustarEscala()
  local k = UIParent:GetEffectiveScale() * altoFisico() / 768
  local s = 1
  if k > 0 and k < 1 then
    s = 1 / k
  end
  if s ~= escalaPuesta then
    SNF.WindowSizing.base(raiz, s)
    escalaPuesta = s
  end
  colocarVentana()
end

local function crearCabecera()
  local cab = CreateFrame("Frame", nil, raiz)
  cab:SetHeight(ALTO_CABECERA)
  cab:SetPoint("TOPLEFT", raiz, "TOPLEFT", 0, 0)
  cab:SetPoint("TOPRIGHT", raiz, "TOPRIGHT", 0, 0)
  Estilo.tarjeta(cab, "fondoCabecera")
  cab:EnableMouse(true)
  cab:SetScript("OnMouseDown", function(_, b)
    if b == "LeftButton" then
      raiz.moviendo = true
      raiz:StartMoving()
    end
  end)
  cab:SetScript("OnMouseUp", function()
    if raiz.moviendo then
      raiz.moviendo = false
      raiz:StopMovingOrSizing()
      -- La posición la guarda el addon (chat.pos), no el cliente.
      raiz:SetUserPlaced(false)
      guardarPosicion()
    end
  end)
  marcos.cabecera = cab

  -- Emblema redondo, como el de la ventana de guía: aro, disco, el icono del chat y el retrato del jugador encima.
  local em = CreateFrame("Frame", nil, cab)
  em:SetSize(TAM_EMBLEMA, TAM_EMBLEMA)
  em:SetPoint("LEFT", cab, "LEFT", 1, 0)
  em.aro = textura(em, "BACKGROUND", CIRCULO)
  em.aro:SetAllPoints(em)
  em.disco = textura(em, "BORDER", CIRCULO)
  em.disco:SetPoint("TOPLEFT", em, "TOPLEFT", 2, -2)
  em.disco:SetPoint("BOTTOMRIGHT", em, "BOTTOMRIGHT", -2, 2)
  em.icono = textura(em, "ARTWORK", ICONO)
  em.icono:SetTexCoord(RECORTE_ICONO[1], RECORTE_ICONO[2], RECORTE_ICONO[1], RECORTE_ICONO[2])
  em.icono:SetPoint("TOPLEFT", em, "TOPLEFT", 7, -7)
  em.icono:SetPoint("BOTTOMRIGHT", em, "BOTTOMRIGHT", -7, 7)
  local r = CreateFrame("Frame", nil, em)
  r:SetSize(TAM_RETRATO, TAM_RETRATO)
  r:SetPoint("BOTTOMRIGHT", em, "BOTTOMRIGHT", 3, -1)
  em.aroRetrato = textura(r, "BORDER", CIRCULO)
  em.aroRetrato:SetAllPoints(r)
  em.retrato = r:CreateTexture(nil, "ARTWORK")
  em.retrato:SetPoint("TOPLEFT", r, "TOPLEFT", 1, -1)
  em.retrato:SetPoint("BOTTOMRIGHT", r, "BOTTOMRIGHT", -1, 1)
  marcos.emblema = em

  marcos.titulo = UI.texto(cab, TAMANOS.titulo)
  marcos.titulo:SetJustifyH("LEFT")
  marcos.titulo:SetWordWrap(false)
  marcos.titulo:SetPoint("TOPLEFT", cab, "TOPLEFT", X_TITULO, -7)
  marcos.subtitulo = UI.texto(cab, TAMANOS.pequeno)
  marcos.subtitulo:SetJustifyH("LEFT")
  marcos.subtitulo:SetWordWrap(false)
  marcos.subtitulo:SetPoint("TOPLEFT", cab, "TOPLEFT", X_TITULO, -23)

  local cerrar = UI.boton(cab, "X", function()
    Chat.cerrar()
  end)
  Estilo.tarjeta(cerrar, "fondoCabecera")
  Estilo.fuente(cerrar.texto, TAMANOS.pequeno)
  cerrar:SetSize(ALTO_BOTON, ALTO_BOTON)
  cerrar:SetPoint("RIGHT", cab, "RIGHT", -MARGEN, 0)
  marcos.cerrar = cerrar

  -- Indicador de la app: un punto verde o rojo y «App conectada» / «App sin conexión», pegado a la X.
  local app = CreateFrame("Frame", nil, cab)
  app:SetHeight(12)
  app:SetPoint("RIGHT", cerrar, "LEFT", -8, 0)
  app.punto = textura(app, "ARTWORK", CIRCULO)
  app.punto:SetSize(8, 8)
  app.punto:SetPoint("LEFT", app, "LEFT", 0, 0)
  app.texto = UI.texto(app, TAMANOS.pequeno)
  app.texto:SetJustifyH("LEFT")
  app.texto:SetWordWrap(false)
  app.texto:SetPoint("LEFT", app, "LEFT", 12, 0)
  marcos.app = app
end

local function crearAviso()
  local aviso = CreateFrame("Frame", nil, raiz)
  aviso:SetWidth(INTERIOR)
  Estilo.tarjeta(aviso, "fondoLista")
  aviso.franja = textura(aviso, "ARTWORK", Estilo.TEXTURA)
  aviso.franja:SetWidth(2)
  aviso.franja:SetPoint("TOPLEFT", aviso, "TOPLEFT", 1, -1)
  aviso.franja:SetPoint("BOTTOMLEFT", aviso, "BOTTOMLEFT", 1, 1)
  aviso.icono = textura(aviso, "ARTWORK", ICONO_AVISO)
  aviso.icono:SetSize(12, 12)
  aviso.icono:SetPoint("TOPLEFT", aviso, "TOPLEFT", 8, -(RELLENO + 1))
  aviso.texto = UI.texto(aviso, TAMANOS.lista)
  aviso.texto:SetJustifyH("LEFT")
  aviso.texto:SetWordWrap(true)
  aviso.texto:SetPoint("TOPLEFT", aviso, "TOPLEFT", 24, -(RELLENO + 1))
  aviso:Hide()
  marcos.aviso = aviso
end

local function botonFlecha(padre, ruta, arriba)
  local b = CreateFrame("Button", nil, padre)
  b:SetSize(ANCHO_BARRA, ANCHO_BARRA)
  b:EnableMouse(true)
  b.icono = textura(b, "ARTWORK", ruta)
  b.icono:SetTexCoord(RECORTE_FLECHA[1], RECORTE_FLECHA[2], RECORTE_FLECHA[3], RECORTE_FLECHA[4])
  b.icono:SetAllPoints(b)
  b:SetHighlightTexture(RESALTE, "ADD")
  b:GetHighlightTexture():SetAllPoints(b)
  b:SetScript("OnClick", function()
    desplazar(arriba)
  end)
  return b
end

-- Historial: el ScrollingMessageFrame (sin desvanecerse, la rueda lo mueve) y, a su derecha, la barra fina con las flechas
-- y el pulgar redondo de la ventana de guía.
local function crearMensajes()
  local caja = CreateFrame("Frame", nil, raiz)
  caja:SetWidth(INTERIOR)
  Estilo.tarjeta(caja, "fondoLista")
  marcos.cajaMensajes = caja

  mensajes = CreateFrame("ScrollingMessageFrame", nil, caja)
  -- Lote E3: pegado abajo y con un alto de renglones enteros (ajustarAltoMensajes, en disponer): el marco pinta las
  -- líneas de abajo arriba y, si su alto no es un número entero de renglones, la de arriba sale cortada por la mitad.
  mensajes:SetPoint("BOTTOMLEFT", caja, "BOTTOMLEFT", 6, RELLENO)
  mensajes:SetPoint("BOTTOMRIGHT", caja, "BOTTOMRIGHT", -(ANCHO_BARRA + 6), RELLENO)
  Estilo.fuente(mensajes, TAMANOS.paso)
  mensajes:SetJustifyH("LEFT")
  mensajes:SetFading(false)
  mensajes:SetMaxLines(MAX_GUARDADAS * 2) -- 11-nov: con la línea en blanco entre mensajes
  mensajes:EnableMouseWheel(true)
  mensajes:SetScript("OnMouseWheel", function(_, delta)
    desplazar(delta > 0)
  end)
  marcos.mensajes = mensajes

  local barra = CreateFrame("Frame", nil, caja)
  barra:SetWidth(ANCHO_BARRA)
  barra:SetPoint("TOPRIGHT", caja, "TOPRIGHT", -3, -3)
  barra:SetPoint("BOTTOMRIGHT", caja, "BOTTOMRIGHT", -3, 3)
  barra.arriba = botonFlecha(barra, FLECHA_ARRIBA, true)
  barra.arriba:SetPoint("TOP", barra, "TOP", 0, 0)
  barra.abajo = botonFlecha(barra, FLECHA_ABAJO, false)
  barra.abajo:SetPoint("BOTTOM", barra, "BOTTOM", 0, 0)
  barra.carril = textura(barra, "BACKGROUND", Estilo.TEXTURA)
  barra.carril:SetWidth(2)
  barra.carril:SetPoint("TOP", barra.arriba, "BOTTOM", 0, -1)
  barra.carril:SetPoint("BOTTOM", barra.abajo, "TOP", 0, 1)
  local d = CreateFrame("Slider", nil, barra)
  d:SetOrientation("VERTICAL")
  d:EnableMouse(true)
  d:SetWidth(ANCHO_BARRA)
  d:SetPoint("TOP", barra.arriba, "BOTTOM", 0, 0)
  d:SetPoint("BOTTOM", barra.abajo, "TOP", 0, 0)
  barra.pulgar = textura(d, "OVERLAY", CIRCULO)
  barra.pulgar:SetSize(8, 8)
  barra.pulgar:SetPoint("TOP", d, "TOP", 0, 0) -- el cliente lo recoloca según el valor
  d:SetThumbTexture(barra.pulgar)
  d:SetValueStep(1)
  if d.SetObeyStepOnDrag then
    d:SetObeyStepOnDrag(true)
  end
  d:SetMinMaxValues(0, 0)
  d:SetValue(0)
  d:SetScript("OnValueChanged", function(_, valor)
    if not barra.ajustando then
      ponerDesplazamiento(rango() - floor(valor + 0.5))
      sincronizarBarra()
    end
  end)
  barra.deslizador = d
  marcos.barra = barra
end

-- Tarjeta de propuesta: raya de acento a la izquierda, el texto (dos renglones como mucho; entero en la ayuda) y dos
-- botones a la derecha.
local function nuevaTarjeta(clave1, alPulsar1, clave2, alPulsar2)
  local t = CreateFrame("Frame", nil, raiz)
  t:SetWidth(INTERIOR)
  t:EnableMouse(true)
  Estilo.tarjeta(t, "fondoLista")
  t.franja = textura(t, "ARTWORK", Estilo.TEXTURA)
  t.franja:SetWidth(2)
  t.franja:SetPoint("TOPLEFT", t, "TOPLEFT", 1, -1)
  t.franja:SetPoint("BOTTOMLEFT", t, "BOTTOMLEFT", 1, 1)
  t.texto = UI.texto(t, TAMANOS.lista)
  t.texto:SetJustifyH("LEFT")
  t.texto:SetWordWrap(true)
  t.texto:SetPoint("LEFT", t, "LEFT", 12, 0)
  t.b2 = boton(t, clave2, alPulsar2)
  t.b2:SetPoint("RIGHT", t, "RIGHT", -6, 0)
  t.b1 = boton(t, clave1, alPulsar1)
  t.b1:SetPoint("RIGHT", t.b2, "LEFT", -4, 0)
  t:SetScript("OnEnter", function(self)
    if not self.cortado or not GameTooltip or GameTooltip:IsForbidden() then
      return
    end
    GameTooltip:SetOwner(self, "ANCHOR_TOP")
    GameTooltip:SetText(self.completo or "")
    GameTooltip:Show()
  end)
  t:SetScript("OnLeave", function()
    if GameTooltip and not GameTooltip:IsForbidden() then
      GameTooltip:Hide()
    end
  end)
  t:Hide()
  return t
end

local function crearPropuestas()
  -- Marcador de mapa: el jugador tenía uno suyo. Solo «Cambiarlo» lo toca.
  local mk = nuevaTarjeta("CHAT_MARCADOR_CAMBIAR", function()
    local pin = preguntaMarcador
    preguntaMarcador = nil
    if pin and not pinEnCapa(pin) then
      pin = nil
    end
    if pin and SNF.Marcador.seguir(pin, {forzar = true}) == "combate" then
      sistema(L.t("CHAT_MARCADOR_COMBATE", etiquetaPin(pin)))
    end
    pintar()
  end, "CHAT_MARCADOR_DEJAR", function()
    preguntaMarcador = nil
    pintar()
  end)
  mk.cambiar, mk.dejar = mk.b1, mk.b2
  marcos.marcador = mk

  local p = nuevaTarjeta("CHAT_ACEPTAR", function()
    if not abrirEncima(SNF.Ruta.aceptar) then
      Chat.anadir("sistema", L.t("CHAT_RUTA_SIN_SITIO"))
    end
    pintar()
  end, "CHAT_DESCARTAR", function()
    SNF.Ruta.descartar()
    pintar()
  end)
  p.aceptar, p.descartar = p.b1, p.b2
  marcos.propuesta = p

  local g = nuevaTarjeta("CHAT_CAMBIAR", function()
    local clave = guiaValida()
    guiaPendiente = nil
    if clave then
      SNF.Guias.cargar(clave)
    end
    pintar()
  end, "CHAT_NO", function()
    guiaPendiente = nil
    pintar()
  end)
  g.cambiar, g.no = g.b1, g.b2
  marcos.guia = g

  -- Ruta de zona de la IA (16c): el jugador siempre pulsa; Abrir la guarda y la abre como lateral.
  local r = nuevaTarjeta("CHAT_ABRIR_RUTA", function()
    rutaRetenida = nil
    abrirEncima(SNF.Ruta.aceptarGuia)
    pintar()
  end, "CHAT_NO", function()
    rutaRetenida = nil
    SNF.Ruta.descartarGuia()
    pintar()
  end)
  r.abrir, r.no = r.b1, r.b2
  marcos.rutaZona = r

  -- Tarea 15: grupo y regla de comercio de la IA. Solo Aplicar cambia algo (un grupo propio y su regla); nunca compra.
  local c = nuevaTarjeta("CHAT_APLICAR", function()
    local Propuesta, Comercio = delComercio()
    if not Propuesta then
      pintar()
      return
    end
    local p = Propuesta.pendiente()
    -- Protegido como todo el comercio: un fallo se apunta (origen «comercio») y no sale un error de Lua.
    local ok, aplicado = Comercio.protegido("aplicar", Propuesta.aplicar)
    ok = ok and aplicado
    if ok and type(p) == "table" and type(p.grupo) == "table" then
      local n = #p.grupo.objetos
      sistema(n == 1 and L.t("CHAT_COMERCIO_GRUPO_CREADO_UNO", p.grupo.nombre) or L.t("CHAT_COMERCIO_GRUPO_CREADO", p.grupo.nombre, n))
    elseif ok and type(p) == "table" then
      sistema(L.t("CHAT_COMERCIO_REGLA_PUESTA", type(p.paraGrupo) == "table" and (p.paraGrupo.nombre or p.paraGrupo.clave) or "?"))
    else
      sistema(L.t("CHAT_COMERCIO_NO_APLICADO"))
    end
    pintar()
  end, "CHAT_DESCARTAR", function()
    local Propuesta = delComercio()
    if Propuesta then
      Propuesta.descartar()
    end
    pintar()
  end)
  c.aplicar, c.descartar = c.b1, c.b2
  marcos.comercio = c
end

local function crearEntrada()
  marcos.enviar = boton(raiz, function()
    return botonEsParar and "CHAT_PARAR" or "CHAT_ENVIAR"
  end, function()
    if SNF.Envio.puedeParar() then
      SNF.Envio.parar()
    else
      Chat.enviar(entrada:GetText())
    end
  end, ALTO_ENTRADA)
  marcos.enviar:SetPoint("BOTTOMRIGHT", raiz, "BOTTOMRIGHT", -MARGEN, Y_ENTRADA)

  local caja = CreateFrame("Frame", nil, raiz)
  caja:SetHeight(ALTO_ENTRADA)
  caja:SetPoint("BOTTOMLEFT", raiz, "BOTTOMLEFT", MARGEN, Y_ENTRADA)
  Estilo.tarjeta(caja, "fondoLista")
  marcos.cajaEntrada = caja

  entrada = CreateFrame("EditBox", nil, caja)
  entrada:SetPoint("TOPLEFT", caja, "TOPLEFT", 6, -2)
  entrada:SetPoint("BOTTOMRIGHT", caja, "BOTTOMRIGHT", -6, 2)
  entrada:SetAutoFocus(false)
  entrada:SetMultiLine(false)
  entrada:SetMaxLetters(MAX_LETRAS)
  Estilo.fuente(entrada, TAMANOS.paso)
  local t = Estilo.color("texto")
  entrada:SetTextColor(t[1], t[2], t[3], t[4])
  marcos.entrada = entrada

  marcos.pista = UI.texto(caja, TAMANOS.lista)
  marcos.pista:SetJustifyH("LEFT")
  marcos.pista:SetWordWrap(false)
  marcos.pista:SetPoint("LEFT", caja, "LEFT", 7, 0)

  local function pista()
    marcos.pista:SetShown(entrada:GetText() == "" and not entrada:HasFocus())
  end
  entrada:SetScript("OnEnterPressed", function(self)
    Chat.enviar(self:GetText())
  end)
  entrada:SetScript("OnEscapePressed", function(self)
    self:ClearFocus()
  end)
  entrada:SetScript("OnTextChanged", pista)
  entrada:SetScript("OnEditFocusGained", pista)
  entrada:SetScript("OnEditFocusLost", pista)
end

local function crearBotones()
  marcos.nueva = boton(raiz, "CHAT_NUEVA", function()
    SNF.Envio.nueva()
    Chat.anadir("sistema", L.t("CHAT_CONVERSACION_NUEVA"))
  end)
  marcos.nueva:SetPoint("BOTTOMLEFT", raiz, "BOTTOMLEFT", MARGEN, Y_BOTONES)
  marcos.quitarPines = boton(raiz, "CHAT_QUITAR_PINES", function()
    SNF.Ruta.quitar()
    preguntaMarcador = nil -- sin pines no hay marcador que cambiar
    Chat.anadir("sistema", L.t("CHAT_PINES_QUITADOS"))
    pintar()
  end)
  marcos.quitarPines:SetPoint("LEFT", marcos.nueva, "RIGHT", 4, 0)
  marcos.quitarMarcas = boton(raiz, "CHAT_QUITAR_MARCAS", function()
    SNF.Marcas.quitar()
    Chat.anadir("sistema", L.t("CHAT_MARCAS_QUITADAS"))
    pintar()
  end)
  marcos.quitarMarcas:SetPoint("LEFT", marcos.quitarPines, "RIGHT", 4, 0)
  marcos.quitarDibujos = boton(raiz, "CHAT_QUITAR_DIBUJOS", function()
    SNF.Dibujos.quitar()
    Chat.anadir("sistema", L.t("CHAT_DIBUJOS_QUITADOS"))
    pintar()
  end)
  marcos.quitarDibujos:SetPoint("LEFT", marcos.quitarMarcas, "RIGHT", 4, 0)

  marcos.estado = UI.texto(raiz, TAMANOS.pequeno)
  marcos.estado:SetJustifyH("RIGHT")
  marcos.estado:SetWordWrap(false)
  marcos.estado:SetPoint("RIGHT", raiz, "BOTTOMRIGHT", -MARGEN, Y_BOTONES + ALTO_BOTON / 2)
end

-- Hueco de la mini franja (el ancla de SNF.Franja). En reposo enseña las recomendaciones o una pista; al enviar, nada.
local function crearZona()
  local z = CreateFrame("Frame", nil, raiz)
  z:SetSize(INTERIOR, ALTO_ZONA)
  z:SetPoint("BOTTOMLEFT", raiz, "BOTTOMLEFT", MARGEN, Y_ZONA)
  Estilo.tarjeta(z, "fondoLista")
  z.pista = UI.texto(z, TAMANOS.pequeno)
  z.pista:SetJustifyH("CENTER")
  z.pista:SetWordWrap(false)
  z.pista:SetPoint("CENTER", z, "CENTER", 0, 0)
  marcos.zonaFranja = z

  local r = CreateFrame("Frame", nil, z)
  r:SetPoint("TOPLEFT", z, "TOPLEFT", 0, 0)
  r:SetPoint("BOTTOMRIGHT", z, "BOTTOMRIGHT", 0, 0)
  r.lineas = {}
  local paso = (ALTO_ZONA - 8) / RENGLONES_ZONA -- 12
  for k = 1, RENGLONES_ZONA do
    local fs = UI.texto(r, TAMANOS.lista)
    fs:SetJustifyH("LEFT")
    fs:SetWordWrap(false)
    fs:SetWidth(INTERIOR - 16)
    fs:SetHeight(paso)
    fs:SetPoint("TOPLEFT", r, "TOPLEFT", 8, -(4 + (k - 1) * paso))
    r.lineas[k] = fs
  end
  r:Hide()
  marcos.recomendaciones = r
end

local function crearPie()
  local pie = CreateFrame("Frame", nil, raiz)
  pie:SetHeight(ALTO_PIE)
  pie:SetPoint("BOTTOMLEFT", raiz, "BOTTOMLEFT", 0, 0)
  pie:SetPoint("BOTTOMRIGHT", raiz, "BOTTOMRIGHT", 0, 0)
  Estilo.tarjeta(pie, "fondoCabecera")
  pie.version = UI.texto(pie, TAMANOS.pequeno)
  pie.version:SetJustifyH("CENTER")
  pie.version:SetPoint("CENTER", pie, "CENTER", 0, 0)
  local ajustes = CreateFrame("Button", nil, pie)
  ajustes:SetSize(TAM_ENGRANAJE, TAM_ENGRANAJE)
  ajustes:EnableMouse(true)
  ajustes.icono = textura(ajustes, "ARTWORK", ICONO_AJUSTES)
  ajustes.icono:SetAllPoints(ajustes)
  ajustes:SetHighlightTexture(RESALTE, "ADD")
  ajustes:GetHighlightTexture():SetAllPoints(ajustes)
  ajustes:SetPoint("LEFT", pie, "LEFT", 3, 0)
  ajustes:SetScript("OnClick", function()
    if SNF.Panel and SNF.Panel.abrir then
      SNF.Panel.abrir("ia")
    end
  end)
  ajustes:SetScript("OnEnter", function(self)
    if GameTooltip and not GameTooltip:IsForbidden() then
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetText(L.t("CHAT_AJUSTES"))
      GameTooltip:Show()
    end
  end)
  ajustes:SetScript("OnLeave", function()
    if GameTooltip and not GameTooltip:IsForbidden() then
      GameTooltip:Hide()
    end
  end)
  pie.ajustes = ajustes
  marcos.pie = pie
end

function Chat.crear()
  if raiz then
    return raiz
  end
  raiz = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(raiz, NOMBRE, true)
  marcos.raiz = raiz
  raiz:SetSize(ANCHO, ALTO)
  raiz:SetFrameStrata(CAPA)
  raiz:SetToplevel(true)
  raiz:SetClampedToScreen(true)
  raiz:SetMovable(true)
  raiz:EnableMouse(true)
  Estilo.fondo(raiz)

  crearCabecera()
  crearAviso()
  crearMensajes()
  crearPropuestas()
  crearEntrada()
  crearBotones()
  crearZona()
  crearPie()
  ajustarEscala()
  pintarHistorial()

  raiz:Hide()
  table.insert(UISpecialFrames, NOMBRE)
  -- La franja va en el hueco solo con la ventana a la vista; oculta, la franja se esconde (nunca suelta en la pantalla:
  -- regla de interfaz de ia/franja.lua).
  -- Las bolsas solo se escuchan con la ventana a la vista (para las recomendaciones), como en ia/inventario.lua.
  raiz:SetScript("OnShow", function()
    ajustarEscala()
    SNF.Franja.anclar(marcos.zonaFranja, "TOPLEFT", 2, -2)
    SNF.Eventos.escuchar("BAG_UPDATE_DELAYED", pintar)
    pintar()
    -- Con el chat cerrado no hay latidos (regla de interfaz): al abrirlo, uno, para que TATI sepa cómo va el personaje.
    if SNF.Latido then
      SNF.Latido.pedir("chat")
    end
  end)
  raiz:SetScript("OnHide", function()
    if raiz.moviendo then
      raiz.moviendo = false
      raiz:StopMovingOrSizing()
      raiz:SetUserPlaced(false)
      guardarPosicion()
    end
    SNF.Franja.anclar(nil)
    SNF.Eventos.dejar("BAG_UPDATE_DELAYED", pintar)
  end)
  return raiz
end

function Chat.abrir()
  Chat.crear()
  raiz:Show()
end

function Chat.cerrar()
  if raiz then
    raiz:Hide()
  end
end

function Chat.alternar()
  if raiz and raiz:IsShown() then
    Chat.cerrar()
  else
    Chat.abrir()
  end
end

---------------------------------------------------------------------------------------------------
-- Eventos
---------------------------------------------------------------------------------------------------

local Eventos = SNF.Eventos

Eventos.escuchar("SNF_IA_ESTADO", function(fase, detalle, registro)
  if fase == "error" then
    local texto
    local deApp = false
    if type(detalle) == "string" then
      texto = L.t(detalle)
    else
      local e = SNF.Envio.estado()
      texto = type(registro) == "table" and registro.texto or e.texto
      if type(texto) ~= "string" or esSecreto(texto) or texto == "" then
        texto = textoDeTipo(type(registro) == "table" and registro.tipo or e.tipo)
      else
        deApp = true
      end
    end
    sistema(texto, deApp)
  elseif fase == "libre" and type(registro) == "table" and registro.tipo == "detenido" then
    sistema(L.t("CHAT_PARADO")) -- lo ha parado el jugador: una línea normal, sin el estilo de error
  end
  if raiz then
    if raiz:IsVisible() then
      pintar()
    else
      pintarEstado()
    end
  end
end)

-- Un turno largo: cambia el minuto de la barra o empieza a pararse. Una cabecera nueva puede traer el motor TATI, y con
-- él el botón de parar.
local function repintarEstado()
  if raiz then
    pintarEstado()
  end
end
Eventos.escuchar("SNF_IA_SIGUE", repintarEstado)
Eventos.escuchar("SNF_IA_CABECERA", repintarEstado)

-- Los dibujos de la IA se ponen solos (decisión del jugador: sin pedir aceptar) y lo dice una línea de sistema, con los
-- textos de los trazos puestos, cortos (como mucho MAX_TEXTOS_DIBUJO, de MAX_BYTES_TEXTO_DIBUJO bytes cada uno; al
-- cortar, sin un «|» impar al final antes de «…»). Revisión: si el addon no dibuja alguno (por ejemplo, la línea de la
-- ruta sin guía activa), la línea lo dice («… n sin dibujar[: no hay guía activa]»); sin ninguno puesto, «Nada dibujado
-- en el mapa» con eso mismo.
local MAX_TEXTOS_DIBUJO, MAX_BYTES_TEXTO_DIBUJO = 3, 40
local function sinBarraImpar(texto)
  local barras = string.match(texto, "|+$")
  if barras and #barras % 2 == 1 then
    return string.sub(texto, 1, -2)
  end
  return texto
end
local function dibujar(lista, reemplazar)
  local antes = {}
  for _, t in ipairs(SNF.Dibujos.textos()) do
    antes[t] = true
  end
  local r = SNF.Dibujos.poner(lista, {reemplazar = reemplazar})
  local descartados = tonumber(r.descartados) or 0
  local noDibujados
  if descartados > 0 then
    noDibujados = (tonumber(r.sinGuia) or 0) >= descartados and L.t("CHAT_DIBUJOS_SIN_GUIA", descartados)
      or L.t("CHAT_DIBUJOS_SIN", descartados)
  end
  -- 16-nov: los tramos de una ruta sin camino conocido no se dibujan (mapa/dibujos.lua) y se dicen.
  local sinCamino = tonumber(r.sinCamino) or 0
  if sinCamino > 0 then
    local texto = L.t("CHAT_DIBUJOS_SIN_CAMINO", sinCamino)
    noDibujados = noDibujados and (noDibujados .. ". " .. texto) or texto
  end
  if r.puestos <= 0 then
    if noDibujados then
      sistema(L.t("CHAT_NADA_DIBUJADO", noDibujados))
    end
    return
  end
  local textos = {}
  for _, t in ipairs(SNF.Dibujos.textos()) do
    if (reemplazar or not antes[t]) and #textos < MAX_TEXTOS_DIBUJO then
      local corto = trozos(t, MAX_BYTES_TEXTO_DIBUJO)[1] or t
      textos[#textos + 1] = corto ~= t and sinBarraImpar(quitarBlancos(corto)) .. "…" or t
    end
  end
  local linea
  if #textos > 0 then
    linea = L.t("CHAT_DIBUJADO_TEXTOS", r.puestos, table.concat(textos, "; "))
  else
    linea = L.t("CHAT_DIBUJADO", r.puestos)
  end
  sistema(noDibujados and (linea .. ". " .. noDibujados) or linea)
end

Eventos.escuchar("SNF_IA_RESPUESTA", function(registro)
  if type(registro) ~= "table" then
    return
  end
  guardarMotor(registro)
  if type(registro.texto) == "string" then
    Chat.anadir("ia", registro.texto)
  end
  -- La app quita la ruta de zona o recorta el texto si el registro no cabe en el buzón (buzon.mjs): se avisa.
  if registro.textoRecortado == true then
    sistema(L.t("CHAT_TEXTO_RECORTADO"))
  end
  if registro.guiaIAQuitada == true then
    sistema(L.t("CHAT_GUIA_QUITADA"))
  end
  if type(registro.propuesta) == "table" then
    SNF.Ruta.proponer(registro.propuesta)
  end
  if type(registro.guiaIA) == "table" then
    local acepta = SNF.Ruta.proponerGuia(registro.guiaIA)
    -- Tarea 16: la guía que el jugador PIDIÓ (abrirGuiaIA) se abre sola, con flecha y pines; sin la marca, [Abrir la ruta].
    -- T3: solo sin guía cargada o con la cargada acabada. Con una a medias se queda en la tarjeta, que lo pregunta; ronda 1
    -- (I2): y se guarda ya en «Rutas de la IA», sin abrirla, para que un /reload no la pierda.
    if acepta and registro.abrirGuiaIA == true and SNF.Guias.aMedias() then
      rutaRetenida = SNF.Ruta.guiaPendiente()
      SNF.Ruta.guardarGuiaPendiente()
    elseif acepta and registro.abrirGuiaIA == true then
      local pendiente = SNF.Ruta.guiaPendiente()
      local titulo = pendiente and (L.de(pendiente.titulo) or pendiente.clave) or ""
      if SNF.Ruta.aceptarGuia() then
        sistema(L.t("CHAT_GUIA_ABIERTA", titulo))
      end
    end
  end
  if type(registro.marcas) == "table" then
    SNF.Marcas.poner(registro.marcas)
  end
  if type(registro.dibujos) == "table" then
    dibujar(registro.dibujos, registro.dibujosReemplazar == true)
  end
  -- Tarea 15: se propone (la tarjeta [Aplicar] [Descartar]); nada cambia hasta que el jugador pulsa Aplicar.
  -- Sin el addon de comercio la propuesta se ignora: la respuesta sale igual, sin [Aplicar].
  local Propuesta, Comercio = delComercio()
  if type(registro.comercio) == "table" and Propuesta then
    Comercio.protegido("propuesta", Propuesta.proponer, registro.comercio)
  end
  local g = registro.guia
  if type(g) == "table" and type(g.clave) == "string" and SNF.Datos.guia(g.clave) then
    guiaPendiente = {clave = g.clave, titulo = g.titulo}
  end
  pintar()
end)

Eventos.escuchar("SNF_IA_REGISTRO", guardarMotor)

Eventos.escuchar("SNF_IA_AVISO", function(clave)
  if type(clave) ~= "string" then
    return
  end
  if AVISOS_BUZON[clave] then
    local proxima = SNF.Buzon.proxima()
    if avisados[clave] == proxima then
      return
    end
    avisados[clave] = proxima
  end
  sistema(textoSistema(clave))
  pintar()
end)

Eventos.escuchar("SNF_IA_RUTA_TERMINADA", function()
  sistema(L.t("CHAT_RUTA_TERMINADA"))
end)

-- Marcador de mapa: el jugador ya tiene uno suyo (la fila con [Cambiarlo] [Dejar el mío]) o está en combate.
Eventos.escuchar("SNF_IA_MARCADOR_PREGUNTA", function(pin)
  if type(pin) ~= "table" then
    return
  end
  preguntaMarcador = pin
  if raiz and raiz:IsVisible() then
    pintar()
  else
    Chat.abrir()
  end
end)

-- La pregunta del marcador se quita sola si su pin ya no está o ya no hay marcador.
local function revisarPregunta()
  if preguntaMarcador and (not pinEnCapa(preguntaMarcador) or not SNF.Marcador.hay()) then
    preguntaMarcador = nil
    pintar()
  end
end

Eventos.escuchar("SNF_PUNTOS_CAMBIADOS", function(origen)
  if origen == "ia" then
    revisarPregunta()
  end
end)
Eventos.escuchar("SNF_MARCADOR_CAMBIADO", revisarPregunta)

Eventos.escuchar("SNF_IA_MARCADOR_COMBATE", function(pin)
  if type(pin) == "table" then
    sistema(L.t("CHAT_MARCADOR_COMBATE", etiquetaPin(pin)))
  end
end)

for _, evento in ipairs({"SNF_IA_APP", "SNF_IA_TIMBRE", "SNF_IA_PROPUESTA", "SNF_IA_PROPUESTA_GUIA", "SNF_IA_MARCAS",
  "SNF_DIBUJOS_CAMBIADOS"}) do
  Eventos.escuchar(evento, pintar)
end
-- Tarea 15: la propuesta de comercio repinta protegida, como todo lo del comercio.
Eventos.escuchar("SNF_COMERCIO_PROPUESTA", function()
  local _, Comercio = delComercio()
  if Comercio then
    Comercio.protegido("propuesta.pintar", pintar)
  else
    pintar()
  end
end)

-- F4-18: la escala de la ventana sigue a la de la interfaz y al tamaño de la pantalla.
local function alCambiarPantalla()
  if raiz then
    ajustarEscala()
  end
end
Eventos.escuchar("UI_SCALE_CHANGED", alCambiarPantalla)
Eventos.escuchar("DISPLAY_SIZE_CHANGED", alCambiarPantalla)

local REPINTAN = {["ia.modelo"] = true, ["ventana.tema"] = true, ["ventana.alfa"] = true}
Eventos.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "idioma" then
    if raiz then
      refrescarTextos()
    end
  elseif clave == "chat.pos" then
    -- Lote C (revisión 52, Minor 5): «Restablecer posición» y /snet reiniciar devuelven también el chat.
    if raiz then
      colocarVentana()
    end
  elseif REPINTAN[clave] then
    pintar()
  end
end)

-- Mayúsculas + clic en un objeto o una misión con la entrada del chat activa: el enlace va a la entrada.
if type(rawget(_G, "ChatEdit_InsertLink")) == "function" then
  hooksecurefunc("ChatEdit_InsertLink", function(enlace)
    if entrada and entrada:IsVisible() and entrada:HasFocus() and type(enlace) == "string" and not esSecreto(enlace) then
      entrada:Insert(enlace)
    end
  end)
end
