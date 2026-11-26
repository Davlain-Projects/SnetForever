-- SnetForever: flecha propia (plano 3 §2). Apunta al destino de Navegacion con la distancia en yardas, sin TomTom ni
-- HereBeDragons.
--
-- Flecha.crear() -> marco       crea SnetForeverFlecha (una sola vez): 48x48 por flecha.escala, movible (la posición se
--                               guarda en flecha.pos), con la textura de Blizzard Interface\Minimap\MinimapArrow y,
--                               debajo, un texto con el título del punto y la distancia. Un marco aparte,
--                               SnetForeverFlechaReloj, llama a actualizar en cada fotograma (el de la flecha, al estar
--                               oculto, no recibiría OnUpdate).
-- Flecha.actualizar(dt)         pone el giro, el texto y la visibilidad:
--   * giro = Navegacion.destino().angulo - GetPlayerFacing(), en [0, 2π) (los dos crecen hacia el oeste, como
--     SetRotation); solo se llama a SetRotation si el cambio supera π/64 (≈2,8°, plano 3 §2.1);
--   * el texto solo se reescribe si cambia el título o la yarda (Flecha.escrituras cuenta las escrituras);
--   * oculta con flecha.activa apagado, dentro de una instancia, sin destino o sin rumbo;
--   * con otroContinente enseña OTRO_CONTINENTE y no gira (la textura se esconde);
--   * con SNF_LLEGADA y flecha.avisoLlegada suena MAP_PING una vez por punto y enseña HAS_LLEGADO durante 2 s;
--   * con dt > 0 (el OnUpdate) busca el destino como mucho 20 veces por segundo y, entre medias, mide el giro y la
--     distancia hasta el mismo punto en cada fotograma; con dt = 0, tras SNF_PUNTOS_CAMBIADOS o tras SNF_LLEGADA lo
--     busca en el momento. No crea tablas por fotograma (revisión del proyecto, I1).
-- Flecha.marcos = {raiz, textura, texto, reloj}
--
-- Trigonometría: nada de sin/cos/atan2 globales (van en grados); el ángulo ya viene de Coord.vector con math.*.
local _, SNF = ...
local Flecha = {}
SNF.Flecha = Flecha

local L = SNF.L
local Ajustes = SNF.Ajustes
local Estilo = SNF.Estilo
local UI = SNF.UI
local Texto = SNF.Texto
local Navegacion = SNF.Navegacion

local NOMBRE = "SnetForeverFlecha"
local TAMANO = 48
local TEXTURA = "Interface\\Minimap\\MinimapArrow"
local DOS_PI = 2 * math.pi
local UMBRAL = math.pi / 64 -- cambio mínimo de giro para llamar a SetRotation
local SEGUNDOS_LLEGADA = 2
local POS_DEFECTO = {punto = "TOP", relPunto = "TOP", x = 0, y = -150}
local PUNTOS = {
  CENTER = true, TOP = true, BOTTOM = true, LEFT = true, RIGHT = true,
  TOPLEFT = true, TOPRIGHT = true, BOTTOMLEFT = true, BOTTOMRIGHT = true,
}

local raiz, textura, texto, reloj
local giroActual -- último ángulo puesto con SetRotation
local textoActual -- último texto escrito
local llegadaHasta = 0 -- GetTime() hasta el que se enseña «Has llegado»
local avisados = setmetatable({}, {__mode = "k"}) -- [punto] = true: los que ya han sonado
local ultimo = {} -- {punto, yardas, idioma, texto, tramo, consejo}: el último texto de destino que se hizo
local yo = {} -- la posición del jugador para el consejo de vuelo (sin crear tablas)
local CAMINO_MIN = 150 -- yardas: más cerca, la flecha va recta al destino
-- 11-nov: el plan de viaje que la ventana enseña en «Cómo llegar» (Flecha.viaje). Cambia solo cuando cambia el punto, el
-- consejo de vuelo o si hay camino; entonces emite SNF_VIAJE. Sin tablas por fotograma.
local viaje = {punto = nil, consejo = nil, conCamino = false, sinCamino = false, activo = false}
local SIN_CAMINO_AVISO = 300 -- yardas: sin camino conocido y más lejos que esto, el texto lo dice
local INTERVALO_DESTINO = 0.05 -- segundos entre búsquedas del destino en el OnUpdate (20 por segundo como mucho)
local destino = {} -- el destino de Navegacion, siempre en esta tabla
local hayDestino = false -- la última búsqueda dio destino
local esperaDestino = 0 -- segundos que faltan para la siguiente búsqueda
local destinoViejo = false -- algo cambió (puntos, llegada): buscar en el siguiente fotograma

Flecha.marcos = {}
Flecha.escrituras = 0

---------------------------------------------------------------------------------------------------
-- Marco
---------------------------------------------------------------------------------------------------

local function escala()
  local limites = Ajustes.LIMITES["flecha.escala"]
  local valor = tonumber(Ajustes.get("flecha.escala")) or 1
  return math.max(limites.min, math.min(limites.max, valor))
end

local function colocar()
  local pos = Ajustes.get("flecha.pos")
  if type(pos) ~= "table" or not PUNTOS[pos.punto] or not PUNTOS[pos.relPunto] or type(pos.x) ~= "number"
    or type(pos.y) ~= "number" then
    pos = POS_DEFECTO
  end
  raiz:ClearAllPoints()
  raiz:SetPoint(pos.punto, UIParent, pos.relPunto, pos.x, pos.y)
end

local function guardarPosicion()
  local punto, _, relPunto, x, y = raiz:GetPoint(1)
  if punto then
    Ajustes.set("flecha.pos", {punto = punto, relPunto = relPunto, x = x, y = y})
  end
end

function Flecha.crear()
  if raiz then
    return raiz
  end
  raiz = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(raiz, NOMBRE, true)
  raiz:SetSize(TAMANO, TAMANO)
  SNF.WindowSizing.base(raiz, escala())
  raiz:SetFrameStrata("MEDIUM")
  raiz:SetClampedToScreen(true)
  raiz:SetMovable(true)
  raiz:EnableMouse(true)

  textura = raiz:CreateTexture(nil, "ARTWORK")
  textura:SetTexture(TEXTURA)
  textura:SetAllPoints(raiz)

  texto = UI.texto(raiz, Estilo.TAMANOS.pequeno)
  texto.refrescar = function()
    Estilo.fuente(texto, Estilo.TAMANOS.pequeno)
    texto:SetFont((texto:GetFont()), Estilo.TAMANOS.pequeno, "OUTLINE") -- legible sobre el mundo
  end
  texto.refrescar()
  texto:SetPoint("TOP", raiz, "BOTTOM", 0, -2)
  texto:SetJustifyH("CENTER")

  raiz:SetScript("OnMouseDown", function(self, boton)
    if boton == "LeftButton" then
      self.moviendo = true
      self:StartMoving()
    end
  end)
  local function soltar(self)
    if self.moviendo then
      self.moviendo = false
      self:StopMovingOrSizing()
      -- La posición la guarda el addon (flecha.pos), no el cliente (layout-local.txt).
      self:SetUserPlaced(false)
      guardarPosicion()
    end
  end
  raiz:SetScript("OnMouseUp", soltar)
  raiz:SetScript("OnHide", soltar)

  reloj = CreateFrame("Frame", NOMBRE .. "Reloj", UIParent)
  reloj:SetScript("OnUpdate", function(_, dt)
    Flecha.actualizar(dt)
  end)

  Flecha.marcos.raiz, Flecha.marcos.textura, Flecha.marcos.texto, Flecha.marcos.reloj = raiz, textura, texto, reloj
  colocar()
  raiz:Hide()
  Flecha.actualizar(0)
  return raiz
end

---------------------------------------------------------------------------------------------------
-- Actualización
---------------------------------------------------------------------------------------------------

-- Diferencia entre dos ángulos medida en el círculo (0 a π): 6,28 y 0 están a 0.
local function diferencia(a, b)
  local d = math.abs(a - b) % DOS_PI
  if d > math.pi then
    d = DOS_PI - d
  end
  return d
end

local function escribir(s)
  if s ~= textoActual then
    textoActual = s
    Flecha.escrituras = Flecha.escrituras + 1
    texto:SetText(s)
  end
end

-- Título del punto: su etiqueta con los colores del tema, o «Paso N» (plano 3 §2.1), en una línea.
-- 13-nov (en el juego): «salté unos pasos y la flecha no se actualiza». Los primeros pasos de una guía suelen estar en
-- la misma ciudad y, con solo «Paso N», al saltar parecía que la flecha no cambiaba. Un punto de la guía sin texto
-- propio dice ahora «Paso N: <resumen del paso>» (el de la lista de saltados, sin colores).
local function titulo(punto)
  local etiqueta = punto.etiqueta
  if type(etiqueta) == "string" and etiqueta ~= "" then
    return (string.gsub(Texto.colorear(Texto.limpiar(etiqueta)), "\n", " "))
  end
  if punto.orden then
    local pv = punto.origen == "guia" and punto.paso and SNF.Motor and SNF.Motor.paso(punto.paso)
    local resumen = pv and Texto.resumenPaso(pv)
    if type(resumen) == "string" and resumen ~= "" then
      return (string.gsub(L.t("PASO_CON_RESUMEN", punto.orden, resumen), "\n", " "))
    end
    return L.t("PASO_SIN_TEXTO", punto.orden)
  end
  return ""
end

-- Guarda el plan de viaje y avisa (SNF_VIAJE) solo si cambió. activo: hay algo que contar (vuelo, camino o «sin camino»).
local function ponerViaje(punto, consejo, conCamino, sinCamino, enVuelo)
  enVuelo = enVuelo and true or false
  local activo = consejo ~= nil or conCamino or sinCamino or enVuelo
  if not activo then
    punto = nil
  end
  local mismoConsejo = (consejo == nil and viaje.consejo == nil) or (consejo ~= nil and viaje.consejo ~= nil
    and consejo.origen == viaje.consejo.origen and consejo.hasta == viaje.consejo.hasta
    and consejo.seguro == viaje.consejo.seguro)
  if viaje.activo == activo and viaje.punto == punto and mismoConsejo and viaje.conCamino == conCamino
    and viaje.sinCamino == sinCamino and viaje.enVuelo == enVuelo then
    return
  end
  viaje.activo, viaje.punto, viaje.consejo = activo, punto, consejo
  viaje.conCamino, viaje.sinCamino, viaje.enVuelo = conCamino, sinCamino, enVuelo
  SNF.emitir("SNF_VIAJE")
end

-- 16-nov: la clave del destino del viaje, la misma tras un /reload (el punto es otra tabla, pero en el mismo sitio):
-- «instancia:wx:wy» redondeado a la yarda; sin sitio en el mundo, «mapa:x:y». La ventana la usa para recordar que el
-- jugador cerró «Cómo llegar» para ese destino.
local function claveDestino(punto)
  local w = SNF.Coord.aMundo(punto)
  if w and w.wx and w.wy then
    return string.format("%s:%d:%d", tostring(w.inst), math.floor(w.wx + 0.5), math.floor(w.wy + 0.5))
  end
  return string.format("%s:%s:%s", tostring(punto.mapa), tostring(punto.x), tostring(punto.y))
end

-- Lo que la ventana cuenta en «Cómo llegar», o nil si no hay viaje que contar. clave: la del destino (claveDestino).
function Flecha.viaje()
  if not viaje.activo then
    return nil
  end
  local c = viaje.consejo
  return {
    consejo = c,
    conCamino = viaje.conCamino,
    sinCamino = viaje.sinCamino,
    enVuelo = viaje.enVuelo,
    destino = viaje.punto and titulo(viaje.punto) or "",
    clave = viaje.punto and claveDestino(viaje.punto) or "",
    zonaHasta = c and SNF.Viaje and SNF.Viaje.nombreZona(c.mapa) or nil,
  }
end

local hasBearing = false
function Flecha.fieldBearing()
  if hasBearing then return giroActual, ultimo.yardas end
  return nil, nil, Ajustes.get("flecha.activa") ~= false and GetTime() < llegadaHasta
end

local function mostrar(visible, conTextura)
  hasBearing = visible and conTextura
  if not visible then
    ponerViaje(nil, nil, false, false)
  end
  raiz:SetShown(visible and not (SNF.GuideViews and SNF.GuideViews.bearingShown()))
  textura:SetShown(conTextura)
end

-- El destino (revisión del proyecto, I1): buscarlo es lo caro (la ruta, los pasos activos, el fin de parada de cada
-- parada), así que el OnUpdate lo busca como mucho cada INTERVALO_DESTINO; en los fotogramas de en medio solo se vuelve
-- a medir distancia y ángulo hasta el mismo punto con la posición de ahora, y el giro sigue igual de fluido. Todo en la
-- misma tabla `destino`. Se busca en el momento con dt = 0 (las llamadas del propio addon) y tras SNF_PUNTOS_CAMBIADOS
-- o SNF_LLEGADA (otra ruta, o la parada ya alcanzada).
local function destinoDe(dt)
  dt = tonumber(dt) or 0
  esperaDestino = esperaDestino - dt
  if dt <= 0 or esperaDestino <= 1e-6 or destinoViejo then
    esperaDestino, destinoViejo = INTERVALO_DESTINO, false
    hayDestino = Navegacion.destino(destino) ~= nil
    return hayDestino and destino or nil
  end
  return hayDestino and Navegacion.medir(destino) or nil
end

function Flecha.actualizar(dt)
  if not raiz then
    return
  end
  if Ajustes.get("flecha.activa") == false or IsInInstance() then
    mostrar(false, false)
    return
  end
  if GetTime() < llegadaHasta then
    escribir(L.t("HAS_LLEGADO"))
    mostrar(true, false)
    return
  end
  local d = destinoDe(dt)
  if not d then
    mostrar(false, false)
    return
  end
  if d.otroContinente then
    escribir(L.t("OTRO_CONTINENTE"))
    mostrar(true, false)
    return
  end
  local rumbo = GetPlayerFacing()
  if rumbo == nil or d.angulo == nil or d.distancia == nil then
    mostrar(false, false)
    return
  end
  local yardas = math.floor(d.distancia + 0.5)
  local idioma = L.idioma()
  -- 11-nov: lejos, el consejo de vuelo (motor/viaje.lua): la flecha lleva primero al maestro de vuelo y el texto dice a
  -- dónde volar y qué viene después. Se busca al cambiar de punto o cada 100 yardas, y nunca en pleno vuelo (UnitOnTaxi):
  -- al aterrizar, el consejo ya no sale y la flecha vuelve al destino.
  local tramo = math.floor(yardas / 100)
  if d.punto ~= ultimo.punto or tramo ~= ultimo.tramo or idioma ~= ultimo.idioma then
    ultimo.tramo = tramo
    local enVuelo = type(rawget(_G, "UnitOnTaxi")) == "function" and UnitOnTaxi("player")
    ultimo.consejo = not enVuelo and SNF.Viaje and SNF.Viaje.consejo(d.punto, SNF.Coord.jugador(yo)) or nil
    ultimo.titulo = titulo(d.punto) -- 13-nov: con el resumen del paso; no se rehace en cada yarda
    ultimo.yardas = nil -- el texto se rehace
  end
  local angulo, cuanto = d.angulo, yardas
  local c = ultimo.consejo
  local j = SNF.Coord.jugador(yo)
  if c then
    if j and j.inst == c.w.inst then
      local dist, ang = SNF.Coord.vector(j, c.w)
      angulo, cuanto = ang, math.floor(dist + 0.5)
    end
  end
  -- 11-nov: a más de CAMINO_MIN yardas, la flecha sigue el camino por la red de caminos (motor/rutapie.lua) en vez de ir
  -- en línea recta: apunta al siguiente punto del camino y la distancia es la que queda por él. Sin camino conocido, va
  -- recta y lo dice.
  local sinCamino, conCamino = false, false
  -- 11-nov (en el juego): en pleno vuelo no se busca camino a pie ni se dice «sin camino»; el camino naranja se quita y
  -- el texto dice que va en vuelo. Al aterrizar se vuelve a buscar.
  local enVuelo = type(rawget(_G, "UnitOnTaxi")) == "function" and UnitOnTaxi("player") and true or false
  if enVuelo and SNF.RutaPie and SNF.RutaPie.actual() then
    SNF.RutaPie.olvidar()
  end
  local objetivo = c and c.w or SNF.Coord.aMundo(d.punto)
  if not enVuelo and SNF.RutaPie and j and objetivo and cuanto > CAMINO_MIN then
    local apunta, restante = SNF.RutaPie.seguir(j, objetivo)
    if apunta then
      local _, ang = SNF.Coord.vector(j, apunta)
      angulo, cuanto = ang, math.floor(restante + 0.5)
      conCamino = true
    else
      sinCamino = true
    end
  end
  ponerViaje(d.punto, c, conCamino, sinCamino and cuanto > SIN_CAMINO_AVISO, enVuelo)
  local giro = (angulo - rumbo) % DOS_PI
  if giroActual == nil or diferencia(giro, giroActual) > UMBRAL then
    giroActual = giro
    textura:SetRotation(giro)
  end
  -- Esto corre en cada fotograma: el texto (título con colores + distancia) solo se rehace si cambia el punto, la
  -- yarda o el idioma, para no crear textos nuevos 60 veces por segundo (tarea 22, memoria).
  if d.punto ~= ultimo.punto or cuanto ~= ultimo.yardas or idioma ~= ultimo.idioma or sinCamino ~= ultimo.sinCamino
    or enVuelo ~= ultimo.enVuelo then
    ultimo.punto, ultimo.yardas, ultimo.idioma, ultimo.sinCamino = d.punto, cuanto, idioma, sinCamino
    ultimo.enVuelo = enVuelo
    if enVuelo then
      ultimo.texto = ultimo.titulo .. "\n" .. L.t("FLECHA_DISTANCIA", Texto.numero(cuanto)) .. "\n" .. L.t("FLECHA_EN_VUELO")
    elseif c then
      ultimo.texto = SNF.Viaje.textoFlecha(c, cuanto, ultimo.titulo)
    else
      ultimo.texto = ultimo.titulo .. "\n" .. L.t("FLECHA_DISTANCIA", Texto.numero(cuanto))
    end
    if sinCamino and cuanto > SIN_CAMINO_AVISO then
      ultimo.texto = ultimo.texto .. "\n" .. L.t("FLECHA_SIN_CAMINO")
    end
  end
  escribir(ultimo.texto)
  mostrar(true, true)
end

---------------------------------------------------------------------------------------------------
-- Eventos
---------------------------------------------------------------------------------------------------

-- Con otros puntos (otra ruta, la guía en otro paso) el destino guardado ya no vale.
SNF.escuchar("SNF_PUNTOS_CAMBIADOS", function()
  destinoViejo = true
end)

-- Llegada: un aviso por punto (plano 3 §2.5: al alcanzarlo la flecha pasa al siguiente).
SNF.escuchar("SNF_LLEGADA", function(punto)
  destinoViejo = true
  if type(punto) ~= "table" or avisados[punto] then
    return
  end
  avisados[punto] = true
  if Ajustes.get("flecha.activa") ~= false and Ajustes.get("flecha.avisoLlegada") ~= false then
    PlaySound(SOUNDKIT.MAP_PING)
    llegadaHasta = GetTime() + SEGUNDOS_LLEGADA
    Flecha.actualizar(0)
  end
end)

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if not raiz then
    return
  end
  if clave == "flecha.escala" then
    SNF.WindowSizing.base(raiz, escala())
  elseif clave == "flecha.pos" then
    colocar()
  elseif clave == "flecha.activa" then
    Flecha.actualizar(0)
  end
end)
