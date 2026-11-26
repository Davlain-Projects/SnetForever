-- SnetForever: pines de la capa (guía, IA, jugador) en el mapa del mundo de Blizzard, sin librerías y sin proveedor
-- de datos (plano 3 §3.5, opción A: marcos hijos de WorldMapFrame:GetCanvas(), como las líneas de RestedXP, MAP:465-532).
--
-- Por qué no hay «taint»: nada de WorldMapFrame:AddDataProvider ni de WorldMapFrame.pinPools (plano 3 §7); los marcos son
-- Buttons normales hijos del lienzo y los enganches son solo hooksecurefunc(WorldMapFrame, "OnMapChanged" /
-- "OnCanvasScaleChanged") y WorldMapFrame:HookScript("OnShow") (el mismo patrón que MAP:28-38 y MAP:1209-1220), nunca
-- reemplazando funciones. El tooltip solo se toca si GameTooltip no está prohibido (IsForbidden).
--
-- PinesMundo.crear() -> true|false   engancha el mapa (una sola vez; llamarla otra vez no duplica los enganches).
--                                    false si el cliente no tiene WorldMapFrame o su lienzo: el addon sigue sin pines.
--                                    La llamará el arranque cuando el mapa exista.
-- PinesMundo.pintar()                pone un pin por cada punto visible de Capa.visibles() que caiga en el mapa abierto
--                                    y esconde los demás. Los pines se reciclan: nunca hay más marcos que puntos
--                                    visibles a la vez (PinesMundo.marcos.pines es la lista de marcos creados).
-- PinesMundo.marcos = {pines, lineas}   lineas: los tramos de la línea de la ruta de la IA (lote E4, ver su sección).
--
-- Colocación: con M = WorldMapFrame:GetMapID() y e = WorldMapFrame:GetCanvasScale(), el punto va en
-- (x, y) = Coord.aMapa(punto, M) (0-100; nil si no está en M ni en un mapa de dentro de M), anclado con
-- SetPoint("CENTER", lienzo, "TOPLEFT", x/100·ancho·e, −y/100·alto·e) y SetScale(1/e): el lienzo se amplía e veces con el
-- zoom, así que el pin se encoge 1/e para medir siempre lo mismo, y como los desplazamientos se miden en su propia
-- escala se multiplican por e.
--
-- Sin pin: los puntos con sinPin (los de la guía que en RestedXP no llevan pin), con el ajuste pines.mundo apagado, con
-- los de «ia» y pines.ia apagado (eso ya lo filtra Capa.visibles), dentro de una instancia y con el mapa cerrado.
--
-- Pines de la IA como «Marcador de mapa» (mapa/marcador.lua): un punto con esPin (los de la IA que no son paradas) se
-- pinta con aspecto de pin y SIN número: el atlas del marcador de Blizzard (ATLAS_PIN, «Waypoint-MapPin-Tracked»: el
-- «Untracked» es un rombo oscuro que con OpenMap no se veía, nota del 11-nov), con SetAtlas en pcall; si el cliente no lo
-- tiene, el aro de siempre sin número (se apunta una vez que falta y no se vuelve a probar). El punto que sigue ahora
-- nuestro marcador (Marcador.seguido()) NO se pinta: ya lo pinta Blizzard (si no, salían dos iconos juntos); sin la API,
-- con el marcador del jugador o con la flecha siguiendo otra cosa, seguido() es nil y se pinta como los demás. Con OpenMap
-- cosido sí se pinta: el de Blizzard queda debajo de su dibujo. vestirPin guarda cómo quedó el pin y no toca nada si no
-- cambia (el minimapa lo llama cada 0,1 s). Tooltip: su nombre y «Clic: seguir este pin». Clic izquierdo → Marcador.seguirPreguntando (con
-- el marcador del jugador puesto, la misma pregunta del chat). Un pin no se junta con otros (los números de un grupo son
-- solo de paradas y pasos). Se repinta con SNF_MARCADOR_CAMBIADO.
-- PinesMundo.vestirPin(pin, punto) y PinesMundo.tooltipPin(punto) los comparte el minimapa.
-- Los dibujos de la IA (mapa/dibujos.lua) comparten PinesMundo.sitioDe(api, punto, abierto) -> x, y|nil,
-- PinesMundo.openMapCosido() -> api|nil, PinesMundo.nivelDelPin(lienzo, api) y PinesMundo.engancharOpenMap(); los avisos
-- de OpenMap, además de repintar los pines, emiten SNF_OPENMAP_CAMBIADO.
--
-- También conecta SNF_PASOS_CAMBIADOS con Capa.poner("guia", Navegacion.puntosDeGuia()): la capa de la guía sigue a los
-- pasos, y Capa avisa (SNF_PUNTOS_CAMBIADOS) a quien pinta.
local _, SNF = ...
local PinesMundo = {}
SNF.PinesMundo = PinesMundo

local L = SNF.L
local Ajustes = SNF.Ajustes
local Estilo = SNF.Estilo
local Texto = SNF.Texto
local Coord = SNF.Coord
local Capa = SNF.Capa
local esSecreto = SNF.API.esSecreto

local TAMANO = 28
local TAMANO_RESALTADO = 36 -- lote E4: el pin de la parada actual de la ruta de la IA
local TAMANO_NUMERO = 14
local GROSOR_ARO = 3 -- px del aro de color (el oscuro de debajo, 2 más)
local SEGMENTOS_ARO = 24
local NIVEL_SOBRE_LIENZO = 200
-- Aspecto del pin. Historia: UI-Minimap-Background es NEGRA (SetVertexColor multiplica: salían negros); detrás,
-- CheckButtonHilight salía como un cuadrado amarillo; el atlas Waypoint-MapPin-Untracked de OpenMap era un rombo oscuro
-- que no se veía; y un círculo macizo (11-nov) tapaba el sitio: «dos manchones en el mapa». Se pidió (11-nov) solo
-- rodear el objetivo y poner el número del paso en morado: ahora es un aro hueco del color de su origen, con un aro oscuro
-- más grueso debajo para que se vea en cualquier fondo, hecho de tramos (Line, o texturas giradas si el cliente no tiene
-- CreateLine): no depende de ningún archivo del cliente. El número va dentro, en morado.
local COLOR_BORDE = {0.05, 0.05, 0.05, 0.85}
local COLOR_NUMERO = {0.8, 0.5, 1}
local COLORES = {
  guia = {0.98, 0.82, 0.2},
  ia = {0.4, 0.8, 1},
  jugador = {0.6, 1, 0.6},
}

local ATLAS_PIN = "Waypoint-MapPin-Tracked" -- el visible (ver la cabecera)

local pines = {} -- los marcos creados; el primero `usados` están en uso
local enganchado = false

PinesMundo.marcos = {pines = pines}
PinesMundo.COLORES = COLORES -- los comparte el minimapa (mapa/pines-minimapa.lua)

---------------------------------------------------------------------------------------------------
-- Pin
---------------------------------------------------------------------------------------------------

-- Texto de la etiqueta del punto, con los colores del tema; sin etiqueta, «Paso N» si tiene número de paso.
local function textoDe(punto)
  local etiqueta = punto.etiqueta
  if type(etiqueta) == "string" and etiqueta ~= "" then
    return Texto.colorear(Texto.limpiar(etiqueta))
  end
  if tonumber(punto.orden) then
    return L.t("PASO_SIN_TEXTO", math.floor(punto.orden))
  end
  return nil
end

PinesMundo.textoDe = textoDe -- lo comparte el minimapa

-- Marcador de mapa: la segunda línea del tooltip de un pin (esPin), o nil si no es un pin.
local function tooltipPin(punto)
  if type(punto) ~= "table" or not punto.esPin then
    return nil
  end
  local seguido = SNF.Marcador and SNF.Marcador.seguido()
  return L.t(seguido == punto and "PIN_LO_SIGUES" or "PIN_CLIC_SEGUIR")
end
PinesMundo.tooltipPin = tooltipPin

local function alEntrar(pin)
  if not GameTooltip or GameTooltip:IsForbidden() then
    return
  end
  local punto = pin.snfPunto
  local texto = punto and textoDe(punto)
  -- 11-nov: un aro con varios pasos juntos enseña los textos de todos, uno por línea (sin repetir).
  if type(pin.snfPuntos) == "table" and #pin.snfPuntos > 1 then
    local partes, vistos = {}, {}
    for _, p in ipairs(pin.snfPuntos) do
      local t = textoDe(p)
      if t and not vistos[t] then
        vistos[t] = true
        partes[#partes + 1] = t
      end
    end
    texto = #partes > 0 and table.concat(partes, "\n") or texto
  end
  if not texto then
    return
  end
  GameTooltip:SetOwner(pin, "ANCHOR_RIGHT")
  GameTooltip:SetText(texto)
  local linea = tooltipPin(punto)
  if linea then
    GameTooltip:AddLine(linea, 1, 1, 1)
  end
  GameTooltip:Show()
end

-- Clic izquierdo en un pin: el marcador de mapa pasa a ese pin.
local function alPulsar(pin, boton)
  local punto = pin.snfPunto
  if boton ~= "LeftButton" or type(punto) ~= "table" or not punto.esPin or not SNF.Marcador then
    return
  end
  SNF.Marcador.seguirPreguntando(punto)
  -- Se esconde, no se refresca: al repintar, este marco puede ser ya de otro punto (los marcos se reciclan).
  if GameTooltip and not GameTooltip:IsForbidden() and GameTooltip:GetOwner() == pin then
    GameTooltip:Hide()
  end
end

local function alSalir()
  if GameTooltip and not GameTooltip:IsForbidden() then
    GameTooltip:Hide()
  end
end

-- El aro: SEGMENTOS_ARO tramos alrededor del centro del pin. pin.snfCirculo es el aro de color (SetVertexColor y
-- GetVertexColor como una textura, para el minimapa y las pruebas) y pin.snfBorde el oscuro de debajo.
local Aro = {}
Aro.__index = Aro

local function tramoAro(pin, l, x1, y1, x2, y2, grosor)
  if l.snfLinea then
    l:SetStartPoint("CENTER", pin, x1, y1)
    l:SetEndPoint("CENTER", pin, x2, y2)
    l:SetThickness(grosor)
  else
    local dx, dy = x2 - x1, y2 - y1
    l:SetSize(math.sqrt(dx * dx + dy * dy) + 1, grosor)
    l:ClearAllPoints()
    l:SetPoint("CENTER", pin, "CENTER", (x1 + x2) / 2, (y1 + y2) / 2)
    l:SetRotation(math.atan2(dy, dx))
  end
end

function Aro:SetVertexColor(r, g, b, a)
  self.color = {r, g, b, a or 1}
  for _, l in ipairs(self.tramos) do
    l:SetVertexColor(r, g, b, a or 1)
  end
end

function Aro:GetVertexColor()
  local c = self.color
  return c[1], c[2], c[3], c[4]
end

function Aro:SetShown(visible)
  for _, l in ipairs(self.tramos) do
    l:SetShown(visible)
  end
end

function Aro:colocar(radio, grosor)
  self.radio = radio
  local dos_pi = 2 * math.pi
  for i, l in ipairs(self.tramos) do
    local a1, a2 = (i - 1) / SEGMENTOS_ARO * dos_pi, i / SEGMENTOS_ARO * dos_pi
    tramoAro(self.pin, l, radio * math.cos(a1), radio * math.sin(a1), radio * math.cos(a2), radio * math.sin(a2), grosor)
  end
end

local function nuevoAro(pin, capa, color)
  local aro = setmetatable({pin = pin, tramos = {}}, Aro)
  local ok, f = pcall(function()
    return pin.CreateLine
  end)
  local conLinea = ok and type(f) == "function"
  for i = 1, SEGMENTOS_ARO do
    local l
    if conLinea then
      l = pin:CreateLine(nil, capa)
      l.snfLinea = true
    else
      l = pin:CreateTexture(nil, capa)
    end
    l:SetColorTexture(1, 1, 1, 1)
    aro.tramos[i] = l
  end
  aro:SetVertexColor(color[1], color[2], color[3], color[4])
  return aro
end

-- Coloca los dos aros según el tamaño del pin (al crearlo y cuando cambia de tamaño).
local function colocarAros(pin)
  local grosor = pin.snfGrosor or GROSOR_ARO
  local radio = pin:GetWidth() / 2 - grosor / 2 - 1
  pin.snfBorde:colocar(radio, grosor + 2)
  pin.snfCirculo:colocar(radio, grosor)
end
PinesMundo.colocarAros = colocarAros

-- Pone a `pin` el aro de color (snfCirculo) y el oscuro (snfBorde). Lo comparten los pines del minimapa
-- (mapa/pines-minimapa.lua). `grosor`: px del aro de color (por defecto GROSOR_ARO).
function PinesMundo.vestir(pin, grosor)
  pin.snfGrosor = grosor or GROSOR_ARO
  pin.snfBorde = nuevoAro(pin, "BORDER", COLOR_BORDE)
  pin.snfCirculo = nuevoAro(pin, "ARTWORK", {1, 1, 1, 1})
  colocarAros(pin)
  -- Marcador de mapa: el atlas del pin, oculto mientras el punto no sea un pin.
  pin.snfIcono = pin:CreateTexture(nil, "OVERLAY")
  pin.snfIcono:SetAllPoints(pin)
  pin.snfIcono:Hide()
end

-- ¿Tiene el cliente este atlas? Sin C_Texture.GetAtlasInfo se prueba directamente con SetAtlas.
local atlasQueFalta = {} -- [nombre] = true: el cliente no lo tiene (se apunta una vez)
local function hayAtlas(nombre)
  local ct = rawget(_G, "C_Texture")
  local f = type(ct) == "table" and rawget(ct, "GetAtlasInfo") or nil
  if type(f) ~= "function" then
    return true
  end
  local ok, info = pcall(f, nombre)
  return ok and info ~= nil
end

-- Marcador de mapa: viste `pin` como pin (el atlas del marcador, sin aros) si `punto` es un pin y el cliente tiene el
-- atlas; si no, con los aros. Devuelve si quedó con el atlas.
function PinesMundo.vestirPin(pin, punto)
  local atlas
  if type(punto) == "table" and punto.esPin and not atlasQueFalta[ATLAS_PIN] then
    atlas = ATLAS_PIN
    if pin.snfAtlas ~= atlas then
      local ok, r = false, nil
      if hayAtlas(atlas) then
        ok, r = pcall(pin.snfIcono.SetAtlas, pin.snfIcono, atlas)
      end
      if ok and r ~= false then
        pin.snfAtlas = atlas
      else
        atlasQueFalta[atlas] = true
        atlas = nil
      end
    end
  end
  local vestido = atlas or false
  if pin.snfVestido ~= vestido then
    pin.snfVestido = vestido
    pin.snfIcono:SetShown(atlas ~= nil)
    pin.snfCirculo:SetShown(atlas == nil)
    pin.snfBorde:SetShown(atlas == nil)
  end
  return atlas ~= nil
end

local function nuevoPin(lienzo)
  local pin = CreateFrame("Button", nil, lienzo)
  pin:SetSize(TAMANO, TAMANO)
  pin:SetFrameLevel(lienzo:GetFrameLevel() + NIVEL_SOBRE_LIENZO)
  PinesMundo.vestir(pin)

  local numero = pin:CreateFontString(nil, "OVERLAY")
  Estilo.fuente(numero, TAMANO_NUMERO)
  numero:SetFont((numero:GetFont()), TAMANO_NUMERO, "OUTLINE") -- legible sobre el mapa
  numero:SetTextColor(COLOR_NUMERO[1], COLOR_NUMERO[2], COLOR_NUMERO[3], 1) -- 11-nov: el número del paso, en morado
  numero:SetPoint("CENTER", pin, "CENTER", 0, 0)
  pin.snfNumero = numero

  pin:SetScript("OnEnter", alEntrar)
  pin:SetScript("OnLeave", alSalir)
  pin:RegisterForClicks("LeftButtonUp")
  pin:SetScript("OnClick", alPulsar)
  return pin
end

---------------------------------------------------------------------------------------------------
-- OpenMap (opcional)
---------------------------------------------------------------------------------------------------
-- Con OpenMap el mapa del mundo es su mapa «cosido», dibujado sobre el lienzo de Blizzard: un pin a nuestro nivel queda
-- debajo y no se ve (prueba en el juego). Su API pública (OpenMapAPI, docs/api.md, versión 2) da el sitio de un punto
-- del mundo en el lienzo (CanvasFromWorldPos: continente y yardas en el orden de UnitPosition, es decir wy y luego wx;
-- 0-1 sobre el mapa de debajo, y fuera de 0-1 lo que su vista enseña más allá) y el nivel que alcanza su dibujo
-- (ArtTopLevel). Todo con pcall: un cambio suyo nunca rompe nuestros pines, que vuelven al cálculo normal.
local engancharOpenMap -- (más abajo, con los enganches)
local MARGEN_OPENMAP = 50 -- lo que el mapa cosido enseña más allá del mapa de debajo (en 0-100), como mucho
local SOBRE_ARTE = 5 -- niveles por encima de su dibujo

local function openMapCosido()
  local api = rawget(_G, "OpenMapAPI")
  if type(api) ~= "table" or Ajustes.get("openmap.usar") == false then
    return nil
  end
  if type(api.IsStitched) ~= "function" or type(api.CanvasFromWorldPos) ~= "function" then
    return nil
  end
  local ok, cosido = pcall(api.IsStitched)
  if ok and cosido then
    return api
  end
  return nil
end

local function posicionOpenMap(api, punto)
  local w = Coord.aMundo(punto)
  if not w or w.inst == nil then
    return nil
  end
  local ok, x, y = pcall(api.CanvasFromWorldPos, w.inst, w.wy, w.wx)
  if not ok or type(x) ~= "number" or type(y) ~= "number" then
    return nil
  end
  return x * 100, y * 100
end

PinesMundo.openMapCosido = openMapCosido -- los comparte mapa/dibujos.lua

local function nivelDelPin(lienzo, api)
  local nivel = lienzo:GetFrameLevel() + NIVEL_SOBRE_LIENZO
  if api and type(api.ArtTopLevel) == "function" then
    local ok, arriba = pcall(api.ArtTopLevel)
    if ok and type(arriba) == "number" and arriba + SOBRE_ARTE > nivel then
      nivel = arriba + SOBRE_ARTE
    end
  end
  return nivel
end
PinesMundo.nivelDelPin = nivelDelPin

-- 11-nov (un jugador: varios aros amontonados junto a la flecha): los pines que en pantalla quedan a menos de JUNTAR_PX se
-- juntan en un solo aro con todos sus números dentro («3·4»; con más de tres, «3-7»), en el sitio del primero y con su
-- color; el tooltip enseña los de todos. Un grupo con más de un número usa un aro más grande.
local JUNTAR_PX = 22
local TAMANO_GRUPO = 38
local TAMANO_NUMERO_GRUPO = 12

-- El texto de los números de un grupo de puntos (sin repetir, de menor a mayor).
local function numerosDe(puntos)
  local vistos, lista = {}, {}
  for _, p in ipairs(puntos) do
    local orden = tonumber(p.orden)
    if orden then
      orden = math.floor(orden)
      if not vistos[orden] then
        vistos[orden] = true
        lista[#lista + 1] = orden
      end
    end
  end
  table.sort(lista)
  if #lista > 3 then
    return Texto.numero(lista[1]) .. "-" .. Texto.numero(lista[#lista]), #lista
  end
  for i, n in ipairs(lista) do
    lista[i] = Texto.numero(n)
  end
  return table.concat(lista, "·"), #lista
end
PinesMundo.numerosDe = numerosDe

-- Junta los sitios {punto, x, y} (0-100 del mapa abierto) que quedan a menos de JUNTAR_PX en pantalla. Un pin (esPin)
-- va siempre solo: ni se junta ni deja que se le junten.
local SIN_GRUPOS = {}
local function juntar(sitios, escala, ancho, alto)
  local grupos = {}
  for _, s in ipairs(sitios) do
    local dentro
    for _, g in ipairs(s.punto.esPin and SIN_GRUPOS or grupos) do
      local dx = (s.x - g.x) / 100 * ancho * escala
      local dy = (s.y - g.y) / 100 * alto * escala
      if not g.puntos[1].esPin and dx * dx + dy * dy < JUNTAR_PX * JUNTAR_PX then
        dentro = g
        break
      end
    end
    if dentro then
      dentro.puntos[#dentro.puntos + 1] = s.punto
    else
      grupos[#grupos + 1] = {x = s.x, y = s.y, puntos = {s.punto}}
    end
  end
  return grupos
end

local function ponerPin(pin, grupo, escala, ancho, alto, resaltado)
  local punto = grupo.puntos[1]
  local x, y = grupo.x, grupo.y
  local c = COLORES[punto.origen] or COLORES.guia
  pin.snfCirculo:SetVertexColor(c[1], c[2], c[3], 1)
  PinesMundo.vestirPin(pin, punto)
  local texto, cuantos = numerosDe(grupo.puntos)
  -- Lote E4: la parada que sigue la flecha, más grande; un grupo de varios números, también.
  local tam = resaltado and TAMANO_RESALTADO or TAMANO
  if cuantos > 1 then
    tam = math.max(tam, TAMANO_GRUPO)
  end
  if pin:GetWidth() ~= tam then
    pin:SetSize(tam, tam)
    colocarAros(pin)
  end
  local fuente = cuantos > 1 and TAMANO_NUMERO_GRUPO or TAMANO_NUMERO
  if pin.snfFuente ~= fuente then
    pin.snfFuente = fuente
    pin.snfNumero:SetFont((pin.snfNumero:GetFont()), fuente, "OUTLINE")
  end
  pin.snfNumero:SetText(texto)
  pin.snfPunto = punto
  pin.snfPuntos = grupo.puntos
  pin:SetScale(1 / escala)
  pin:ClearAllPoints()
  pin:SetPoint("CENTER", pin:GetParent(), "TOPLEFT", x / 100 * ancho * escala, -y / 100 * alto * escala)
  pin:Show()
end

---------------------------------------------------------------------------------------------------
-- Pintar
---------------------------------------------------------------------------------------------------

local function esconderDesde(primero)
  for i = primero, #pines do
    pines[i]:Hide()
    pines[i].snfPunto = nil
    pines[i].snfPuntos = nil
  end
end

---------------------------------------------------------------------------------------------------
-- Línea de la ruta de la IA (lote E4)
---------------------------------------------------------------------------------------------------
-- Con una ruta de la IA que sigue la flecha (Ruta.estado(): desde el lote F, con la guía de la ruta abierta, la parada de
-- su paso actual), una línea une al jugador con la parada actual y las paradas que quedan entre sí, en orden, como las líneas de RestedXP (MAP:465-532: regiones Line hijas del lienzo). Va en una
-- capa propia (capaLineas, hija del lienzo y justo por debajo de los pines, también por encima del dibujo de OpenMap);
-- cada tramo es un Line (Frame:CreateLine, SetStartPoint/SetEndPoint/SetThickness) o, si el cliente no tiene CreateLine,
-- una textura girada. Continua, en el color de los pines de la IA y semitransparente; el tramo hasta la parada actual,
-- más grueso y opaco. Solo los tramos con los dos extremos en el mapa que se ve.
--
-- Rendimiento: nada por fotograma. Se redibuja con los mismos avisos que los pines (cambio de mapa, zoom, OpenMap, capa
-- de puntos) y con SNF_IA_RUTA_CAMBIADA (parada alcanzada, saltada, ruta quitada).
-- 16-nov: la línea va de parada a parada por el camino a pie (RutaPie.tramos), con el tramo que sale de la parada actual
-- resaltado; sin camino conocido, sin línea. Del jugador a la parada actual ya no hay tramo de la E4 (ni su temporizador):
-- lo pinta la línea a pie de la flecha.
local GROSOR_TRAMO, GROSOR_ACTUAL = 3, 4 -- píxeles en pantalla (se dividen por el zoom del lienzo)
local ALFA_TRAMO, ALFA_ACTUAL = 0.6, 0.9

local lineas = {} -- los tramos creados; los primeros `tramosUsados` están en uso
local capaLineas
local tramosUsados = 0

PinesMundo.marcos.lineas = lineas

local function conLineas(capa)
  local ok, f = pcall(function()
    return capa.CreateLine
  end)
  return ok and type(f) == "function"
end

local function nuevaLinea(capa)
  local l
  if conLineas(capa) then
    l = capa:CreateLine(nil, "ARTWORK")
    l.snfLinea = true
  else
    l = capa:CreateTexture(nil, "ARTWORK")
  end
  l:SetColorTexture(1, 1, 1, 1)
  return l
end

-- (x1, y1) → (x2, y2) en unidades del lienzo, con y hacia abajo.
local function ponerTramo(l, x1, y1, x2, y2, grosor, alfa, c, capa)
  c = c or COLORES.ia
  capa = capa or capaLineas
  l:SetVertexColor(c[1], c[2], c[3], alfa)
  if l.snfLinea then
    l:SetStartPoint("TOPLEFT", capa, x1, -y1)
    l:SetEndPoint("TOPLEFT", capa, x2, -y2)
    l:SetThickness(grosor)
  else
    local dx, dy = x2 - x1, y2 - y1
    l:SetSize(math.max(1, math.sqrt(dx * dx + dy * dy)), grosor)
    l:ClearAllPoints()
    l:SetPoint("CENTER", capa, "TOPLEFT", (x1 + x2) / 2, -(y1 + y2) / 2)
    l:SetRotation(math.atan2(-dy, dx))
  end
  l:Show()
end

local function esconderLineasDesde(primero)
  for i = primero, #lineas do
    lineas[i]:Hide()
  end
  if primero <= 1 then
    tramosUsados = 0
  end
end

-- Sitio de un punto en el mapa abierto (0-100) o nil si no cae en él (con OpenMap, lo que su vista enseña de más).
local function sitioDe(api, punto, abierto)
  local x, y, margen = nil, nil, 0
  if api then
    x, y = posicionOpenMap(api, punto)
    margen = MARGEN_OPENMAP
  end
  if x == nil then
    x, y = Coord.aMapa(punto, abierto)
    margen = 0
  end
  if x ~= nil and x >= -margen and x <= 100 + margen and y >= -margen and y <= 100 + margen then
    return x, y
  end
  return nil
end
PinesMundo.sitioDe = sitioDe


local function ponerTramoN(n, lienzo, x1, y1, x2, y2, escala, ancho, alto, actual)
  local l = lineas[n]
  if not l then
    l = nuevaLinea(capaLineas)
    lineas[n] = l
  end
  ponerTramo(l, x1 / 100 * ancho, y1 / 100 * alto, x2 / 100 * ancho, y2 / 100 * alto,
    (actual and GROSOR_ACTUAL or GROSOR_TRAMO) / escala, actual and ALFA_ACTUAL or ALFA_TRAMO)
end

-- 16-nov (regla del jugador: «mejor sin línea que una por donde no se puede ir»): de parada a parada, por el camino a pie
-- (RutaPie.tramos); un tramo sin camino conocido se queda sin línea. El tramo del jugador a la parada actual ya no es una
-- recta de la E4: es la línea a pie de la flecha (dibujarRutaPie, más abajo), que sí va por el camino.
local MAX_TRAMOS_RUTA = 200 -- segmentos de la línea de la ruta (entre todas las paradas)
local function dibujarRuta(lienzo, api, abierto, escala, ancho, alto, nivel, e)
  if not e then
    esconderLineasDesde(1)
    return
  end
  if not capaLineas then
    capaLineas = CreateFrame("Frame", nil, lienzo)
    capaLineas:SetAllPoints(lienzo)
  end
  if capaLineas:GetFrameLevel() ~= nivel - 1 then
    capaLineas:SetFrameLevel(nivel - 1)
  end
  local paradas = {e.punto}
  for _, q in ipairs(e.quedan) do
    paradas[#paradas + 1] = q.punto
  end
  local caminos = SNF.RutaPie and SNF.RutaPie.tramos(paradas) or {}
  local n = 0
  for k = 1, #paradas - 1 do
    local c = caminos[k]
    local ax, ay
    for _, w in ipairs(c and c.puntos or {}) do
      local bx, by = sitioDe(api, {mapa = abierto, wx = w.wx, wy = w.wy, inst = w.inst}, abierto)
      if ax ~= nil and bx ~= nil and (math.abs(bx - ax) > 0.001 or math.abs(by - ay) > 0.001) and n < MAX_TRAMOS_RUTA then
        n = n + 1
        ponerTramoN(n, lienzo, ax, ay, bx, by, escala, ancho, alto, k == 1)
      end
      if bx == nil or ax == nil or math.abs(bx - ax) > 0.001 or math.abs(by - ay) > 0.001 then
        ax, ay = bx, by
      end
    end
  end
  tramosUsados = n
  esconderLineasDesde(n + 1)
end

---------------------------------------------------------------------------------------------------
-- Caminos de los PNJ que se mueven (11-nov, como Questie)
---------------------------------------------------------------------------------------------------
-- Un jugador vio en Cima del Trueno la línea de Questie con el camino de un PNJ que anda (el que da «La Caza de Vallefresno»)
-- y pidió lo mismo. Los PNJ de los pasos activos de la guía (los que dan las misiones de sus accept y reciben las de sus
-- turnin, sin hacer) y los de la parada actual de la ruta de la IA que tienen `waypoints` en la base se dibujan con su
-- camino: una línea dorada por cada recorrido, en una capa propia por debajo de los pines. Pasar el ratón por el camino
-- enseña el PNJ, la misión y que se mueve por ahí (unos puntos invisibles a lo largo del camino llevan el tooltip).
-- Se dibuja con los mismos avisos que los pines (nada por fotograma). El ajuste pines.caminos = false lo apaga.
local COLOR_CAMINO = {1, 0.78, 0.15}
local GROSOR_CAMINO, ALFA_CAMINO = 3, 0.9
local MAX_TRAMOS_CAMINO = 800
local MAX_BOTONES_CAMINO = 200
local CADA_BOTON = 3 -- un punto con tooltip cada 3 vértices del camino
local TAMANO_BOTON_CAMINO = 16

local caminoLineas = {}
local caminoBotones = {}
local capaCaminos
PinesMundo.marcos.caminos = caminoLineas
PinesMundo.marcos.caminoBotones = caminoBotones

local function idDe(v)
  if type(v) == "number" then
    return v
  end
  return type(v) == "table" and tonumber(v.id) or nil
end

-- Los PNJ con camino: {{id, papel = "accept"|"turnin"|..., q}...}, sin repetir, en el orden de los pasos.
function PinesMundo.pnjsConCamino()
  local salida, vistos = {}, {}
  local npcs = type(SNF_MISIONES) == "table" and SNF_MISIONES.npc
  if type(npcs) ~= "table" then
    return salida
  end
  local function meter(id, papel, q)
    local npc = id and npcs[id]
    if id and not vistos[id] and type(npc) == "table" and type(npc.waypoints) == "table" then
      vistos[id] = true
      salida[#salida + 1] = {id = id, papel = papel, q = q}
    end
  end
  local M = SNF.Motor
  if M and type(M.activos) == "function" and type(M.paso) == "function" then
    local indices = {}
    for _, i in ipairs(M.activos()) do
      indices[#indices + 1] = i
    end
    local estado = type(M.estado) == "function" and M.estado() or nil
    if estado and estado.actual then
      indices[#indices + 1] = estado.actual
    end
    for _, i in ipairs(indices) do
      local pv = M.paso(i)
      for _, e in ipairs(pv and pv.elementos or {}) do
        local t, q = e.datos and e.datos.t, e.datos and e.datos.q
        if (t == "accept" or t == "turnin") and type(q) == "number" and e.resultado ~= "hecho" then
          local m = SNF.Datos.mision(q)
          local por = type(m) == "table" and (t == "accept" and m.startedBy or m.finishedBy) or nil
          for _, id in ipairs(type(por) == "table" and type(por[1]) == "table" and por[1] or {}) do
            meter(idDe(id), t, q)
          end
        end
      end
    end
  end
  local ruta = Ajustes.get("pines.ia") ~= false and SNF.Ruta and SNF.Ruta.estado and SNF.Ruta.estado() or nil
  local punto = ruta and ruta.punto
  if type(punto) == "table" and type(punto.npcs) == "table" then
    for _, v in ipairs(punto.npcs) do
      meter(idDe(v), punto.tipo, tonumber(punto.q))
    end
  end
  return salida
end

local function textoCamino(c)
  local partes = {Texto.colorear(SNF.Datos.nombrePNJ(c.id))}
  if type(c.q) == "number" then
    local clave = c.papel == "turnin" and "CAMINO_ENTREGA" or "CAMINO_DA"
    partes[#partes + 1] = L.t(clave, SNF.Datos.nombreMision(c.q))
  end
  partes[#partes + 1] = L.t("CAMINO_SE_MUEVE")
  return table.concat(partes, "\n")
end
PinesMundo.textoCamino = textoCamino

local function alEntrarCamino(boton)
  if not GameTooltip or GameTooltip:IsForbidden() or not boton.snfCamino then
    return
  end
  GameTooltip:SetOwner(boton, "ANCHOR_RIGHT")
  GameTooltip:SetText(textoCamino(boton.snfCamino))
  GameTooltip:Show()
end

local function esconderCaminosDesde(primeraLinea, primerBoton)
  for i = primeraLinea, #caminoLineas do
    caminoLineas[i]:Hide()
  end
  for i = primerBoton or primeraLinea, #caminoBotones do
    caminoBotones[i]:Hide()
    caminoBotones[i].snfCamino = nil
  end
end

local function ponerBotonCamino(n, lienzo, x, y, escala, ancho, alto, nivel, c)
  local b = caminoBotones[n]
  if not b then
    b = CreateFrame("Button", nil, lienzo)
    b:SetSize(TAMANO_BOTON_CAMINO, TAMANO_BOTON_CAMINO)
    b:SetScript("OnEnter", alEntrarCamino)
    b:SetScript("OnLeave", alSalir)
    caminoBotones[n] = b
  end
  if b:GetFrameLevel() ~= nivel - 1 then
    b:SetFrameLevel(nivel - 1)
  end
  b.snfCamino = c
  b:SetScale(1 / escala)
  b:ClearAllPoints()
  b:SetPoint("CENTER", lienzo, "TOPLEFT", x / 100 * ancho * escala, -y / 100 * alto * escala)
  b:Show()
end

-- 11-nov: la ruta a pie que sigue la flecha por la red de caminos (motor/rutapie.lua), en naranja y por encima de los
-- caminos de los PNJ. Se redibuja con SNF_RUTA_PIE (camino nuevo) además de los avisos de siempre.
local COLOR_RUTA_PIE = {1, 0.5, 0.1}
local GROSOR_RUTA_PIE, ALFA_RUTA_PIE = 4, 0.95
local MAX_TRAMOS_RUTA_PIE = 1500
local rutaPieLineas = {}
local capaRutaPie
PinesMundo.marcos.rutaPie = rutaPieLineas

local function dibujarRutaPie(lienzo, api, abierto, escala, ancho, alto, nivel)
  local puntos, desde
  if SNF.RutaPie then
    puntos, desde = SNF.RutaPie.actual()
  end
  local n = 0
  if puntos and Ajustes.get("flecha.activa") ~= false then
    -- 12-nov: desde el jugador hasta el punto al que va la flecha y de ahí al final (sin el trozo que ya no sirve).
    local lista = {}
    local yo = Coord.jugador()
    if yo and puntos[desde or 1] and yo.inst == puntos[desde or 1].inst then
      lista[1] = yo
    end
    for k = desde or 1, #puntos do
      lista[#lista + 1] = puntos[k]
    end
    puntos = lista
    if not capaRutaPie then
      capaRutaPie = CreateFrame("Frame", nil, lienzo)
      capaRutaPie:SetAllPoints(lienzo)
    end
    if capaRutaPie:GetFrameLevel() ~= math.max(0, nivel - 1) then
      capaRutaPie:SetFrameLevel(math.max(0, nivel - 1))
    end
    local ax, ay
    for _, w in ipairs(puntos) do
      local bx, by = sitioDe(api, {mapa = abierto, wx = w.wx, wy = w.wy, inst = w.inst}, abierto)
      if ax ~= nil and bx ~= nil and n < MAX_TRAMOS_RUTA_PIE then
        n = n + 1
        local l = rutaPieLineas[n]
        if not l then
          l = nuevaLinea(capaRutaPie)
          rutaPieLineas[n] = l
        end
        ponerTramo(l, ax / 100 * ancho, ay / 100 * alto, bx / 100 * ancho, by / 100 * alto, GROSOR_RUTA_PIE / escala,
          ALFA_RUTA_PIE, COLOR_RUTA_PIE, capaRutaPie)
      end
      ax, ay = bx, by
    end
  end
  for i = n + 1, #rutaPieLineas do
    rutaPieLineas[i]:Hide()
  end
end

local function dibujarCaminos(lienzo, api, abierto, escala, ancho, alto, nivel)
  local n, nb = 0, 0
  if Ajustes.get("pines.caminos") ~= false then
    local lista = PinesMundo.pnjsConCamino()
    if #lista > 0 and not capaCaminos then
      capaCaminos = CreateFrame("Frame", nil, lienzo)
      capaCaminos:SetAllPoints(lienzo)
    end
    if capaCaminos and capaCaminos:GetFrameLevel() ~= math.max(0, nivel - 2) then
      capaCaminos:SetFrameLevel(math.max(0, nivel - 2))
    end
    for _, c in ipairs(lista) do
      local npc = SNF_MISIONES.npc[c.id]
      local mapas = {}
      for mapa in pairs(npc.waypoints) do
        if type(mapa) == "number" then
          mapas[#mapas + 1] = mapa
        end
      end
      table.sort(mapas)
      for _, mapa in ipairs(mapas) do
        local rutas = npc.waypoints[mapa]
        for _, recorrido in ipairs(type(rutas) == "table" and rutas or {}) do
          local ax, ay
          for j, p in ipairs(type(recorrido) == "table" and recorrido or {}) do
            local bx, by
            if type(p) == "table" and type(p[1]) == "number" and type(p[2]) == "number" then
              bx, by = sitioDe(api, {mapa = mapa, x = p[1], y = p[2]}, abierto)
            end
            if ax ~= nil and bx ~= nil and n < MAX_TRAMOS_CAMINO then
              n = n + 1
              local l = caminoLineas[n]
              if not l then
                l = nuevaLinea(capaCaminos)
                caminoLineas[n] = l
              end
              ponerTramo(l, ax / 100 * ancho, ay / 100 * alto, bx / 100 * ancho, by / 100 * alto, GROSOR_CAMINO / escala,
                ALFA_CAMINO, COLOR_CAMINO, capaCaminos)
            end
            if bx ~= nil and j % CADA_BOTON == 1 and nb < MAX_BOTONES_CAMINO then
              nb = nb + 1
              ponerBotonCamino(nb, lienzo, bx, by, escala, ancho, alto, nivel, c)
            end
            ax, ay = bx, by
          end
        end
      end
    end
  end
  esconderCaminosDesde(n + 1, nb + 1)
end

function PinesMundo.pintar()
  local mapa = WorldMapFrame
  if not mapa or type(mapa.GetCanvas) ~= "function" or not mapa:IsShown() then
    return
  end
  local lienzo = mapa:GetCanvas()
  if not lienzo then
    return
  end
  if Ajustes.get("pines.mundo") == false or IsInInstance() then
    esconderDesde(1)
    esconderLineasDesde(1)
    esconderCaminosDesde(1)
    return
  end
  local abierto = mapa:GetMapID()
  local ancho, alto = lienzo:GetWidth(), lienzo:GetHeight()
  local escala = type(mapa.GetCanvasScale) == "function" and tonumber(mapa:GetCanvasScale()) or 1
  if escala <= 0 then
    escala = 1
  end
  if abierto == nil or not ancho or not alto or ancho <= 0 or alto <= 0 then
    esconderDesde(1)
    esconderLineasDesde(1)
    esconderCaminosDesde(1)
    return
  end
  engancharOpenMap()
  local api = openMapCosido()
  local nivel = nivelDelPin(lienzo, api)
  -- Lote E4: la ruta de la IA que sigue la flecha (nil sin ruta, con solo pines o con la capa «ia» apagada).
  local ruta = Ajustes.get("pines.ia") ~= false and SNF.Ruta and SNF.Ruta.estado and SNF.Ruta.estado() or nil
  local actual = ruta and ruta.punto
  -- El seguido lo pinta el marcador de Blizzard; con OpenMap cosido no, porque queda debajo de su dibujo.
  local seguido = not api and SNF.Marcador and SNF.Marcador.seguido() or nil
  local sitios = {}
  for _, punto in ipairs(Capa.visibles()) do
    if not punto.sinPin and punto ~= seguido then
      local x, y = sitioDe(api, punto, abierto)
      if x ~= nil then
        sitios[#sitios + 1] = {punto = punto, x = x, y = y}
      end
    end
  end
  local usados = 0
  for _, grupo in ipairs(juntar(sitios, escala, ancho, alto)) do
    usados = usados + 1
    local pin = pines[usados]
    if pin == nil then
      pin = nuevoPin(lienzo)
      pines[usados] = pin
    end
    if pin:GetFrameLevel() ~= nivel then
      pin:SetFrameLevel(nivel)
    end
    local resaltado = false
    for _, p in ipairs(grupo.puntos) do
      if p == actual then
        resaltado = true
      end
    end
    ponerPin(pin, grupo, escala, ancho, alto, resaltado)
  end
  esconderDesde(usados + 1)
  dibujarRuta(lienzo, api, abierto, escala, ancho, alto, nivel, ruta)
  dibujarCaminos(lienzo, api, abierto, escala, ancho, alto, nivel)
  dibujarRutaPie(lienzo, api, abierto, escala, ancho, alto, nivel)
end

SNF.escuchar("SNF_RUTA_PIE", function()
  if WorldMapFrame and WorldMapFrame:IsShown() then
    PinesMundo.pintar()
  end
end)

---------------------------------------------------------------------------------------------------
-- Enganches
---------------------------------------------------------------------------------------------------

local function repintar()
  PinesMundo.pintar()
end

-- OpenMap avisa cuando cambia entre su mapa y el de Blizzard, y cuando mueve su vista (unas pocas veces por segundo).
-- Se intenta al crear y al pintar (si OpenMap cargó después que nosotros); se engancha una sola vez. Su registro es por
-- dueño y aviso (el mismo dueño lo pisaría), así que solo se engancha aquí y se reenvía con SNF_OPENMAP_CAMBIADO a los
-- dibujos de la IA (mapa/dibujos.lua).
local avisosOpenMap = false
local function repintarOpenMap()
  PinesMundo.pintar()
  SNF.Eventos.emitir("SNF_OPENMAP_CAMBIADO")
end
engancharOpenMap = function()
  if avisosOpenMap then
    return
  end
  local api = rawget(_G, "OpenMapAPI")
  if type(api) == "table" and type(api.RegisterCallback) == "function" then
    avisosOpenMap = true
    pcall(api.RegisterCallback, "SnetForever", "OpenMap_StitchedChanged", repintarOpenMap)
    pcall(api.RegisterCallback, "SnetForever", "OpenMap_ViewChanged", repintarOpenMap)
  end
end
PinesMundo.engancharOpenMap = function()
  engancharOpenMap()
end

function PinesMundo.crear()
  if enganchado then
    return true
  end
  local mapa = WorldMapFrame
  if not mapa or type(mapa.GetCanvas) ~= "function" or type(mapa.HookScript) ~= "function" then
    return false
  end
  if type(mapa.OnMapChanged) == "function" then
    hooksecurefunc(mapa, "OnMapChanged", repintar)
  end
  mapa:HookScript("OnShow", repintar)
  if type(mapa.OnCanvasScaleChanged) == "function" then
    hooksecurefunc(mapa, "OnCanvasScaleChanged", repintar)
  end
  engancharOpenMap()
  enganchado = true
  PinesMundo.pintar()
  return true
end

SNF.escuchar("SNF_PUNTOS_CAMBIADOS", repintar)
SNF.escuchar("SNF_IA_RUTA_CAMBIADA", repintar) -- lote E4: la línea de la ruta sigue a la parada actual
SNF.escuchar("SNF_MARCADOR_CAMBIADO", repintar) -- marcador de mapa: el pin seguido se esconde (lo pinta Blizzard) o vuelve

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if type(clave) == "string" and string.sub(clave, 1, 6) == "pines." then
    PinesMundo.pintar()
  end
end)

-- La capa de la guía sigue a los pasos.
SNF.escuchar("SNF_PASOS_CAMBIADOS", function()
  Capa.poner("guia", SNF.Navegacion.puntosDeGuia())
end)
