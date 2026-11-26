-- SnetForever: franja de la IA en pantalla (fase 4, «mini franja»). Pinta las tramas del códec (ia/codec.lua) como
-- cuadritos de colores que la app de Windows lee de la pantalla. Solo se ve mientras se envía un mensaje.
--
-- REGLA DE INTERFAZ (16-nov, regla de interfaz: la franja suelta en la pantalla, cambiando de colores, molesta):
-- la franja SOLO se enseña anclada al hueco del chat de la IA. Sin ancla no se ve nunca: un mensaje espera escondido a
-- que se vuelva a anclar (al abrir el chat sigue donde iba) y la franja de un latido (opciones.sinAviso) se tira. Y
-- cambia como mucho dos veces por segundo (PERIODO = 0,5 s; la app la lee cada 100 ms): con una sola parte no cambia.
--
-- Franja.mostrar(partes, base, opciones?)   enseña las cargas P1 (texto, bytes) una tras otra, PERIODO segundos cada una,
--                                en bucle. El número de trama de la parte k es (base + k - 1) % 65536. Sustituye lo que
--                                hubiera. opciones.sinAviso = true (el latido de ia/latido.lua): sin el aviso «Enviando a
--                                SnetForever…» mientras dure esa franja.
-- Franja.ocultar()               la quita (la tarea 8 la oculta al llegar el «recibido»).
-- Franja.visible() -> boolean    ¿se está enseñando?
-- Franja.vueltas() -> number     vueltas completas por todas las partes desde el último mostrar().
-- Franja.anclar(marco, punto?, x?, y?)   pone la esquina superior izquierda de la franja en el `punto` del marco
--                                («BOTTOMLEFT» por defecto) más (x, y) en unidades del marco (y positivo hacia arriba).
--                                Sin marco (nil): la franja se esconde (ver la regla de interfaz de arriba).
-- Franja.anclada() -> boolean    ¿está anclada a un marco (el hueco del chat)?
-- Franja.PERIODO = 0.5
--
-- Geometría. Las celdas miden Codec.CELDA = 2 píxeles FÍSICOS, y con solo 2 px por celda solo hay un píxel limpio por
-- celda: la franja tiene que quedar siempre alineada a píxeles enteros. Por eso el marco ignora la escala de su padre
-- y lleva la escala 768 / alto físico (1 unidad = 1 px), y su posición se calcula en píxeles físicos enteros desde la
-- esquina del marco al que está anclada (se redondea) y se pone respecto a la esquina inferior izquierda de la pantalla.
-- Si el marco se mueve, la franja se recoloca en el siguiente fotograma (OnUpdate); también al cambiar la escala de
-- la interfaz o el tamaño de la pantalla.
--
-- El marco y sus celdas se crean al primer uso. Las celdas se reciclan (un máximo de 200 × 20) y solo se repintan si
-- cambia su valor. Escala y posición puestas se recuerdan en variables locales: el cliente guarda la escala como float de
-- 32 bits, así que GetScale() no devuelve lo que se puso y compararlo cada fotograma recolocaría sin parar.
-- Si el marco anclado aún no tiene posición, la franja espera con transparencia 0 hasta tenerla (no se ve en (8, 8)).
--
-- El aviso «Enviando a SnetForever…» (SnetForeverFranjaAviso) era para la franja suelta, que ya no existe: no se enseña
-- nunca (anclada, ya lo dice la línea de estado del chat).
local _, SNF = ...

local Franja = {}
SNF.Franja = Franja

Franja.PERIODO = 0.5

local floor = math.floor

local MARGEN = 8 -- respaldo sin marco: a 8 px de la esquina superior izquierda
local SEPARACION_AVISO = 6 -- unidades de interfaz entre la franja y el aviso
local ALTO_PANTALLA_POR_DEFECTO = 1080 -- si el cliente no tiene GetPhysicalScreenSize

-- Fracción de cada eje que corresponde a cada punto de anclaje.
local X_PUNTO = {TOPLEFT = 0, LEFT = 0, BOTTOMLEFT = 0, TOP = 0.5, CENTER = 0.5, BOTTOM = 0.5, TOPRIGHT = 1, RIGHT = 1, BOTTOMRIGHT = 1}
local Y_PUNTO = {BOTTOMLEFT = 0, BOTTOM = 0, BOTTOMRIGHT = 0, LEFT = 0.5, CENTER = 0.5, RIGHT = 0.5, TOPLEFT = 1, TOP = 1, TOPRIGHT = 1}

local marco, aviso -- se crean al primer uso
local celdas = {} -- textura de cada celda; .valor = el valor de 3 bits pintado (nil = oculta)
local trama = {} -- celdas de la trama que se está pintando (se reutiliza)
local cargas, base, actual, acumulado, vueltas = nil, 0, 1, 0, 0
local ancla -- {marco, punto, x, y}
local puestoX, puestoY -- última posición puesta (px desde la esquina inferior izquierda de la pantalla)
local escalaPuesta -- última escala puesta con SetScale (GetScale() da un float de 32 bits, no sirve para comparar)
local alfaPuesto -- última transparencia puesta (0 = esperando posición del marco anclado)
local sinAviso = false -- la franja de ahora no lleva aviso (opciones.sinAviso del último mostrar)

-- Alto de la pantalla en píxeles físicos.
local function altoFisico()
  local f = rawget(_G, "GetPhysicalScreenSize")
  if type(f) == "function" then
    local _, alto = f()
    if type(alto) == "number" and alto > 0 then
      return alto
    end
  end
  return ALTO_PANTALLA_POR_DEFECTO
end

-- Posición de la esquina de la franja en píxeles desde la esquina inferior izquierda de la pantalla, según el ancla;
-- nil si el marco aún no tiene posición.
local function desdeAncla(alto)
  local m = ancla.marco
  local izq, der, aba, arr = m:GetLeft(), m:GetRight(), m:GetBottom(), m:GetTop()
  if not (izq and der and aba and arr) then
    return nil
  end
  local k = m:GetEffectiveScale() * alto / 768 -- píxeles por unidad del marco
  local fx, fy = X_PUNTO[ancla.punto], Y_PUNTO[ancla.punto]
  return (izq + (der - izq) * fx + ancla.x) * k, (aba + (arr - aba) * fy + ancla.y) * k
end

-- Pone escala y posición. Solo toca los anclajes si algo cambia.
local function recolocar(forzar)
  local alto = altoFisico()
  local escala = 768 / alto
  if escalaPuesta ~= escala then
    marco:SetScale(escala)
    escalaPuesta = escala
    forzar = true
  end
  local x, y
  if ancla then
    x, y = desdeAncla(alto)
  end
  local alfa = 1
  if not x then
    x, y = MARGEN, alto - MARGEN
    if ancla then
      alfa = 0 -- el marco anclado aún no tiene posición: se espera en vez de enseñarse en (8, 8)
    end
  end
  if alfa ~= alfaPuesto then
    marco:SetAlpha(alfa)
    alfaPuesto = alfa
  end
  x, y = floor(x + 0.5), floor(y + 0.5)
  if forzar or x ~= puestoX or y ~= puestoY then
    marco:ClearAllPoints()
    marco:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", x, y)
    puestoX, puestoY = x, y
  end
end

local function nuevaCelda(i)
  local C = SNF.Codec
  local t = marco:CreateTexture(nil, "OVERLAY")
  t:SetSize(C.CELDA, C.CELDA)
  local fila, col = floor((i - 1) / C.CELDAS_FILA), (i - 1) % C.CELDAS_FILA
  t:SetPoint("TOPLEFT", marco, "TOPLEFT", col * C.CELDA, -fila * C.CELDA)
  celdas[i] = t
  return t
end

-- Pinta la parte k: solo se tocan las celdas cuyo valor cambia; las que sobran de la anterior se ocultan.
local function pintar(k)
  local C = SNF.Codec
  C.codificar((base + k - 1) % 65536, cargas[k], trama)
  local n = #trama
  for i = 1, n do
    local t = celdas[i] or nuevaCelda(i)
    local v = trama[i]
    if t.valor ~= v then
      local r, g, b = C.color(v)
      t:SetColorTexture(r, g, b, 1)
      if t.valor == nil then
        t:Show()
      end
      t.valor = v
    end
  end
  for i = n + 1, #celdas do
    local t = celdas[i]
    if t.valor ~= nil then
      t:Hide()
      t.valor = nil
    end
  end
end

local function alPasarTiempo(_, dt)
  recolocar()
  if not cargas then
    return
  end
  acumulado = acumulado + dt
  local pasos = floor((acumulado + 1e-6) / Franja.PERIODO)
  if pasos < 1 then
    return
  end
  acumulado = math.max(0, acumulado - pasos * Franja.PERIODO)
  local indice = actual - 1 + pasos
  vueltas = vueltas + floor(indice / #cargas)
  local nueva = indice % #cargas + 1
  if nueva ~= actual then
    actual = nueva
    pintar(actual)
  end
end

local function crear()
  local C, Estilo = SNF.Codec, SNF.Estilo
  marco = CreateFrame("Frame", "SnetForeverFranja", UIParent)
  marco:SetFrameStrata("TOOLTIP")
  marco:SetFrameLevel(10000)
  marco:SetIgnoreParentScale(true)
  marco:SetIgnoreParentAlpha(true)
  marco:SetSize(C.CELDAS_FILA * C.CELDA, C.FILAS_MAX * C.CELDA)
  marco:Hide()

  aviso = CreateFrame("Frame", "SnetForeverFranjaAviso", UIParent)
  SNF.WindowSizing.register(aviso, "statusNotice", false)
  aviso:SetFrameStrata("TOOLTIP")
  aviso:SetFrameLevel(10000)
  aviso:SetSize(220, 12)
  aviso:SetPoint("TOPLEFT", marco, "TOPRIGHT", SEPARACION_AVISO, 0)
  aviso:Hide()
  local texto = aviso:CreateFontString(nil, "OVERLAY")
  Estilo.fuente(texto, Estilo.TAMANOS.pequeno)
  local c = Estilo.color("secundario")
  texto:SetTextColor(c[1], c[2], c[3], c[4])
  texto:SetPoint("LEFT", aviso, "LEFT", 0, 0)
  texto:SetJustifyH("LEFT")
  aviso.texto = texto

  local function alCambiarPantalla()
    if marco then
      recolocar(true)
    end
  end
  SNF.Eventos.escuchar("UI_SCALE_CHANGED", alCambiarPantalla)
  SNF.Eventos.escuchar("DISPLAY_SIZE_CHANGED", alCambiarPantalla)
end

-- El aviso de la franja suelta ya no se enseña nunca (regla de interfaz).
local function actualizarAviso()
  if aviso then
    aviso:Hide()
  end
end

-- Se ve solo con algo que enseñar Y anclada. Sin ancla, el marco se esconde (y su OnUpdate no corre: no avanza).
local function aplicarVisibilidad()
  if not marco then
    return
  end
  if cargas and ancla then
    recolocar(true)
    marco:SetScript("OnUpdate", alPasarTiempo)
    marco:Show()
  else
    marco:SetScript("OnUpdate", nil)
    marco:Hide()
  end
  actualizarAviso()
end

function Franja.anclar(otroMarco, punto, x, y)
  if otroMarco == nil then
    ancla = nil
    -- La franja de un latido no espera: se tira (al abrir el chat el latido se pide de nuevo, con su minuto).
    if cargas and sinAviso then
      Franja.ocultar()
      return
    end
  else
    punto = punto or "BOTTOMLEFT"
    assert(X_PUNTO[punto], "SnetForever.Franja.anclar: punto de anclaje no válido")
    ancla = {marco = otroMarco, punto = punto, x = x or 0, y = y or 0}
  end
  aplicarVisibilidad()
end

function Franja.anclada()
  return ancla ~= nil
end

function Franja.mostrar(partes, desde, opciones)
  assert(type(partes) == "table" and #partes >= 1, "SnetForever.Franja.mostrar: se esperaba una lista de partes")
  if not marco then
    crear()
  end
  sinAviso = type(opciones) == "table" and opciones.sinAviso == true
  cargas, base = partes, floor(desde or 0) % 65536
  actual, acumulado, vueltas = 1, 0, 0
  -- Se validan TODAS las partes antes de enseñar nada (codificar da error si la carga no cabe; la trama se reutiliza).
  for k = 1, #partes do
    local ok, err = pcall(SNF.Codec.codificar, (base + k - 1) % 65536, partes[k], trama)
    if not ok then
      Franja.ocultar()
      error(err, 0)
    end
  end
  pintar(1)
  aviso.texto:SetText(SNF.L.t("FRANJA_ENVIANDO"))
  aplicarVisibilidad()
end

function Franja.ocultar()
  cargas = nil
  if marco then
    marco:SetScript("OnUpdate", nil)
    marco:Hide()
    aviso:Hide()
  end
end

function Franja.visible()
  return marco ~= nil and marco:IsShown()
end

function Franja.vueltas()
  return vueltas
end
