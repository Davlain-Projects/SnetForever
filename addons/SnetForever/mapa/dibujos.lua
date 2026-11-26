-- SnetForever: dibujos de la IA en el mapa del mundo (línea, flecha, círculo y marca), con trazos PROPIOS: no dependen de
-- OpenMap ni de arte de terceros (Line de Frame:CreateLine o, si el cliente no lo tiene, texturas giradas; la marca es el
-- icono de banda de Blizzard, Interface\TargetingFrame\UI-RaidTargetingIcon_<n>). Con OpenMap activo y «cosido» salen
-- también en su mapa, por su API pública (la de los pines: PinesMundo.sitioDe, con pcall). Nunca se leen ni se tocan los
-- datos de OpenMap ni los dibujos del jugador: aquí solo están los de la IA.
--
-- Guardado (por personaje): SnetForeverPJ.dibujos = {v = 1, porMapa = {[uiMapID] = {Trazo, ...}}, orden = n}
--   Trazo = {dueno = "IA", tipo = "linea"|"flecha"|"circulo"|"marca", tinta = 1..6, grosor = 1..3,
--            puntos = {x1, y1, x2, y2, ...} (0-100 del mapa uiMapID), radio? (0-100, solo círculo), marca? (1..8),
--            texto? (≤ 80 bytes), fecha (API.horaServidor(), la de GetServerTime), orden (contador propio: el más
--            bajo es el más viejo)}
--   Tintas (Dibujos.TINTAS): 1 negro, 2 rojo, 3 azul, 4 verde, 5 oro, 6 blanco. Grosores (Dibujos.GROSORES): 2, 3,5 y 6 px.
--   Topes: 40 trazos por personaje en total (al pasar, se quitan los más viejos) y 20 puntos por trazo (se cortan).
--
-- MENSAJE DE LA APP (encargo 2). Un registro de respuesta del buzón (t = "respuesta", también los de TATI) puede traer:
--   dibujos = {TrazoApp, ...}           como mucho 40 (lo que pase de 40 se queda en los 40 más nuevos)
--   dibujosReemplazar = true            opcional: antes de poner los nuevos se quitan todos los de la IA de antes
--   TrazoApp = {mapa = uiMapID (entero > 0), tipo = "linea"|"flecha"|"circulo"|"marca",
--               tinta = 1..6, grosor = 1..3, puntos = {x1, y1, x2, y2, ...}  (números en 0-100 del mapa `mapa`),
--               radio = 0-100 (solo «circulo», > 0; en unidades de x del mapa), marca = 1..8 (solo «marca»),
--               texto = "..." (opcional, ≤ 80 bytes; sale como tooltip)}
--     · linea y flecha: 2 puntos o más (la flecha lleva la punta en el último); circulo: el centro es el primer punto;
--       marca: el icono de banda en el primer punto. Puntos de más: se cortan en 20.
--     · Trazo de ruta: {ruta = true, tipo = "linea"|"flecha", tinta?, grosor?, texto?} SIN mapa ni puntos: el addon lo
--       resuelve con los próximos pasos de la guía activa (Navegacion.puntosDeGuia, hasta 20 puntos), un trazo por cada
--       tramo seguido del mismo uiMapID (A → B → A: dos en A; los de un solo punto no salen). Sin guía o sin puntos: descartado.
--       16-nov: de parada a parada por el camino a pie (RutaPie.tramos), nunca en recta; un tramo sin camino conocido no
--       se dibuja y se cuenta en sinCamino (el chat lo dice); un camino de más de 20 puntos sigue en otro trazo.
--     · Lo raro nunca da error: tinta o grosor fuera de rango → 2 (rojo, medio); marca fuera de 1..8 → 1; un par de
--       coordenadas que no son números o salen de 0-100 se quita; un trazo sin mapa, de tipo desconocido, sin puntos
--       suficientes o un círculo sin radio válido se descarta. El texto se corta sin partir un carácter UTF-8.
--   Se aplica sin pedir aceptar: el chat pone una línea de sistema «Dibujado en el mapa: <n> trazo(s)» (con los textos, si
--   los hay, cortos; y «n sin dibujar[: no hay guía activa]» si alguno no sale) y activa [Quitar dibujos].
--
-- Dibujos.poner(lista, opciones?) -> {puestos, descartados, sinGuia, sinCamino?}   añade trazos de la IA (lista de TrazoApp);
--     sinCamino (solo si hay alguno): tramos de las rutas sin camino conocido, que no se dibujan.
--     opciones.reemplazar = true: quita antes los de la IA. Emite SNF_DIBUJOS_CAMBIADOS si cambió algo.
-- Dibujos.quitar() -> n          quita todos los de la IA de este personaje; emite SNF_DIBUJOS_CAMBIADOS si había.
-- Dibujos.cuantos() -> n         cuántos trazos válidos hay guardados.
-- Dibujos.crear() -> true|false  engancha el mapa del mundo (una vez) y crea el botón «Quitar dibujos» del mapa.
-- Dibujos.pintar()               dibuja los trazos que caen en el mapa abierto y esconde lo demás.
-- Dibujos.marcos = {capa, lineas, marcas, zonas, boton}
--     capa: Frame hijo del lienzo, con los Line; marcas: los iconos (Frame con .icono); zonas: los puntos invisibles con
--     el tooltip del texto (en el primer punto); boton: «Quitar dibujos» (Button hijo de WorldMapFrame, abajo a la derecha,
--     solo a la vista con algún trazo en el mapa abierto).
--
-- Pintar: SOLO con el mapa del mundo abierto, al abrirlo (OnShow), al cambiar de mapa (OnMapChanged), de zoom
-- (OnCanvasScaleChanged), con los avisos de OpenMap (los engancha pines-mundo.lua y los reenvía con
-- SNF_OPENMAP_CAMBIADO) y con SNF_DIBUJOS_CAMBIADOS. Nada por fotograma ni con el mapa cerrado; dentro de una instancia se
-- esconde todo. Sin taint: hooksecurefunc y HookScript, como los pines; marcos normales, nada protegido (en combate se
-- puede pintar). Se reciclan: nunca más Lines que segmentos a la vista, ni más marcos que trazos a la vista. La capa va
-- por debajo de los pines (PinesMundo.nivelDelPin − 3: por encima del lienzo y, con OpenMap cosido, de su dibujo).
-- Sin animaciones ni parpadeos. Las líneas no son marcos: no roban clics al mapa; las zonas del tooltip y las marcas con
-- texto solo reciben el movimiento del ratón (SetMouseClickEnabled(false)) y las marcas sin texto, nada. Sin
-- SetMouseClickEnabled en el cliente, ni zona ni ratón en las marcas (sin tooltip: EnableMouse se quedaría los clics).
-- El aviso de vista de OpenMap solo repinta si algo cambió (firmar: mapa, lienzo, trazos y dos puntos de referencia).
-- Colocación: como los pines (cabecera de pines-mundo.lua): un punto (x, y) en 0-100 del mapa abierto va en
-- (x/100·ancho, −y/100·alto) del lienzo; el grosor en px se divide por la escala del lienzo. Flecha = la línea y dos
-- tramos cortos de punta en el último punto. Círculo = 32 lados; el radio en y se multiplica por ancho/alto del lienzo
-- para que se vea redondo.
local _, SNF = ...
local Dibujos = {}
SNF.Dibujos = Dibujos

local L = SNF.L
local Eventos = SNF.Eventos
local UI = SNF.UI
local Estilo = SNF.Estilo
local esSecreto = SNF.API.esSecreto
local floor = math.floor

local MAX_TRAZOS = 40
local MAX_PUNTOS = 20
local MAX_TEXTO = 80
local LADOS_CIRCULO = 32
local TINTA_DEFECTO, GROSOR_DEFECTO, MARCA_DEFECTO = 2, 2, 1
local ALFA = 0.95
local TAM_PUNTA = 10 -- px de cada tramo de la punta de la flecha (más el grosor)
local ANGULO_PUNTA = math.rad(28)
local TAM_MARCA = 22
local TAM_ZONA = 18
local BAJO_PINES = 3 -- niveles por debajo de los pines
local ICONO_MARCA = "Interface\\TargetingFrame\\UI-RaidTargetingIcon_"

local TIPOS = {linea = true, flecha = true, circulo = true, marca = true}
local MINIMO = {linea = 2, flecha = 2, circulo = 1, marca = 1} -- puntos que necesita cada tipo

Dibujos.TINTAS = {
  {0.05, 0.05, 0.05}, -- negro
  {0.9, 0.12, 0.12}, -- rojo
  {0.15, 0.45, 1}, -- azul
  {0.15, 0.75, 0.2}, -- verde
  {1, 0.8, 0.15}, -- oro
  {1, 1, 1}, -- blanco
}
Dibujos.GROSORES = {2, 3.5, 6}
Dibujos.MAX_TRAZOS, Dibujos.MAX_PUNTOS = MAX_TRAZOS, MAX_PUNTOS

local lineas, marcas, zonas = {}, {}, {}
local marcos = {lineas = lineas, marcas = marcas, zonas = zonas}
Dibujos.marcos = marcos

---------------------------------------------------------------------------------------------------
-- Guardado y saneado
---------------------------------------------------------------------------------------------------

local function hayNumero(v)
  return type(v) == "number" and not esSecreto(v) and v == v
end

local function enRango(v)
  return hayNumero(v) and v >= 0 and v <= 100
end

local function entero(v, min, max)
  return hayNumero(v) and v == floor(v) and v >= min and v <= max
end

-- La tabla de lo guardado (la crea si falta o está rota), o nil sin SnetForeverPJ.
local function guardado()
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj) ~= "table" then
    return nil
  end
  if type(pj.dibujos) ~= "table" then
    pj.dibujos = {v = 1, porMapa = {}}
  end
  local d = pj.dibujos
  if type(d.porMapa) ~= "table" then
    d.porMapa = {}
  end
  return d
end

-- `texto` cortado a `max` bytes sin partir un carácter UTF-8 (como ia/ruta.lua).
local function cortar(texto, max)
  if #texto <= max then
    return texto
  end
  local fin = max
  while fin > 0 do
    local b = string.byte(texto, fin + 1)
    if b < 128 or b >= 192 then
      break
    end
    fin = fin - 1
  end
  return string.sub(texto, 1, fin)
end

local function textoValido(v)
  if type(v) ~= "string" or esSecreto(v) then
    return nil
  end
  v = string.gsub(string.gsub(v, "^%s+", ""), "%s+$", "")
  if v == "" then
    return nil
  end
  return cortar(v, MAX_TEXTO)
end

-- Los pares válidos de `puntos` (números en 0-100), como mucho MAX_PUNTOS.
local function puntosValidos(puntos)
  local salida = {}
  if type(puntos) ~= "table" then
    return salida
  end
  local i = 1
  while puntos[i] ~= nil and #salida < MAX_PUNTOS * 2 do
    local x, y = puntos[i], puntos[i + 1]
    if enRango(x) and enRango(y) then
      salida[#salida + 1] = x
      salida[#salida + 1] = y
    end
    i = i + 2
  end
  return salida
end

-- Un trazo guardado a partir de lo que manda la app (sin el mapa), o nil si no vale.
local function sanear(t)
  if type(t) ~= "table" or not TIPOS[t.tipo] then
    return nil
  end
  local tipo = t.tipo
  local puntos = puntosValidos(t.puntos)
  if #puntos < MINIMO[tipo] * 2 then
    return nil
  end
  local trazo = {
    dueno = "IA", tipo = tipo, puntos = puntos,
    tinta = entero(t.tinta, 1, #Dibujos.TINTAS) and t.tinta or TINTA_DEFECTO,
    grosor = entero(t.grosor, 1, #Dibujos.GROSORES) and t.grosor or GROSOR_DEFECTO,
    texto = textoValido(t.texto),
  }
  if tipo == "circulo" then
    if not hayNumero(t.radio) or t.radio <= 0 or t.radio > 100 then
      return nil
    end
    trazo.radio = t.radio
  elseif tipo == "marca" then
    trazo.marca = entero(t.marca, 1, 8) and t.marca or MARCA_DEFECTO
  end
  return trazo
end

-- ¿Es un trazo guardado que se puede pintar? (lo guardado puede venir roto de un /reload).
local function trazoBien(t)
  return type(t) == "table" and t.dueno == "IA" and TIPOS[t.tipo] and type(t.puntos) == "table"
    and #t.puntos >= MINIMO[t.tipo] * 2
end

-- Los trazos de una ruta: los próximos pasos de la guía activa, uno por cada tramo seguido del mismo mapa (revisión: una
-- ruta A → B → A da dos trazos en A, sin unir sus puntos con una recta que cruza B).
local function trazosDeRuta(t)
  local Nav = SNF.Navegacion
  local ok, lista = pcall(function()
    return Nav and Nav.puntosDeGuia() or {}
  end)
  if not ok or type(lista) ~= "table" then
    return {}, 0
  end
  -- Las paradas: los puntos de los pasos con sitio en su mapa (sin repetir el de antes), como mucho MAX_PUNTOS.
  local paradas = {}
  for _, p in ipairs(lista) do
    if #paradas >= MAX_PUNTOS then
      break
    end
    local mapa = type(p) == "table" and p.mapa or nil
    local x, y
    if entero(mapa, 1, 2147483647) then
      if hayNumero(p.x) and hayNumero(p.y) then
        x, y = p.x, p.y
      else
        x, y = SNF.Coord.aMapa(p)
      end
    end
    local ultima = paradas[#paradas]
    if enRango(x) and enRango(y) and not (ultima and ultima.mapa == mapa and ultima.x == x and ultima.y == y) then
      local w = SNF.Coord.aMundo({mapa = mapa, x = x, y = y})
      paradas[#paradas + 1] = {mapa = mapa, x = x, y = y, inst = w and w.inst}
    end
  end
  -- 16-nov (regla del jugador: «mejor sin línea que una por donde no se puede ir»): de parada a parada, por el camino a pie
  -- (RutaPie.tramos), nunca en recta. Un tramo sin camino conocido no se dibuja y se cuenta en `sinCamino` (los de un
  -- continente a otro, que son un barco o un portal, no se cuentan: tampoco se dibujaban). El camino se pasa a x, y del
  -- mapa de la parada de salida (o, si no cae en él, de la de llegada) redondeado a la centésima; cada tramo seguido del
  -- mismo mapa es un trazo (A → B → A: dos en A), y uno de más de MAX_PUNTOS puntos sigue en otro que empieza donde acaba.
  local caminos = SNF.RutaPie and SNF.RutaPie.tramos(paradas) or {}
  local tramos, sinCamino = {}, 0 -- {mapa, puntos} en orden
  local abierto -- el trazo que se va llenando (nil: el siguiente punto empieza otro)
  local function redondo(v)
    return floor(v * 100 + 0.5) / 100
  end
  local function meter(mapa, x, y)
    local pts = abierto and abierto.mapa == mapa and abierto.puntos
    if pts and pts[#pts - 1] == x and pts[#pts] == y then
      return
    end
    if pts and #pts >= MAX_PUNTOS * 2 then
      abierto = {mapa = mapa, puntos = {pts[#pts - 1], pts[#pts]}}
      tramos[#tramos + 1] = abierto
    elseif not pts then
      abierto = {mapa = mapa, puntos = {}}
      tramos[#tramos + 1] = abierto
    end
    local n = #abierto.puntos
    abierto.puntos[n + 1], abierto.puntos[n + 2] = x, y
  end
  for k = 1, #paradas - 1 do
    local a, b = paradas[k], paradas[k + 1]
    local c = caminos[k]
    if c then
      for _, w in ipairs(c.puntos) do
        local mapa, x, y = a.mapa, SNF.Coord.aMapa({mapa = a.mapa, wx = w.wx, wy = w.wy, inst = w.inst})
        if not (enRango(x) and enRango(y)) then
          mapa, x, y = b.mapa, SNF.Coord.aMapa({mapa = b.mapa, wx = w.wx, wy = w.wy, inst = w.inst})
        end
        if enRango(x) and enRango(y) then
          meter(mapa, redondo(x), redondo(y))
        else
          abierto = nil
        end
      end
    else
      abierto = nil
      if a.inst ~= nil and a.inst == b.inst then
        sinCamino = sinCamino + 1
      end
    end
  end
  local salida = {}
  local tipo = t.tipo == "flecha" and "flecha" or "linea"
  for _, tr in ipairs(tramos) do
    local trazo = sanear({tipo = tipo, tinta = t.tinta, grosor = t.grosor, texto = t.texto, puntos = tr.puntos})
    if trazo then
      salida[#salida + 1] = {mapa = tr.mapa, trazo = trazo}
    end
  end
  return salida, sinCamino
end

-- ¿Hay una guía cargada? (para decir por qué no sale la línea de una ruta)
local function hayGuia()
  local ok, clave = pcall(function()
    return SNF.Motor and SNF.Motor.estado().clave
  end)
  return ok and clave ~= nil
end

-- Quita los más viejos (orden más bajo) hasta dejar MAX_TRAZOS.
local function recortar(d)
  local todos = {}
  for mapa, lista in pairs(d.porMapa) do
    if type(lista) == "table" then
      for i, t in ipairs(lista) do
        todos[#todos + 1] = {mapa = mapa, i = i, orden = type(t) == "table" and tonumber(t.orden) or 0}
      end
    end
  end
  local sobran = #todos - MAX_TRAZOS
  if sobran <= 0 then
    return
  end
  table.sort(todos, function(a, b)
    return a.orden < b.orden
  end)
  local fuera = {}
  for k = 1, sobran do
    local e = todos[k]
    fuera[e.mapa] = fuera[e.mapa] or {}
    fuera[e.mapa][e.i] = true
  end
  for mapa, quitar in pairs(fuera) do
    local nueva = {}
    for i, t in ipairs(d.porMapa[mapa]) do
      if not quitar[i] then
        nueva[#nueva + 1] = t
      end
    end
    d.porMapa[mapa] = #nueva > 0 and nueva or nil
  end
end

local function quitarDeLaIA(d)
  local n = 0
  for mapa, lista in pairs(d.porMapa) do
    local quedan = {}
    for _, t in ipairs(type(lista) == "table" and lista or {}) do
      if type(t) == "table" and t.dueno == "IA" then
        n = n + 1
      else
        quedan[#quedan + 1] = t
      end
    end
    d.porMapa[mapa] = #quedan > 0 and quedan or nil
  end
  return n
end

local version = 0 -- sube con cada cambio de los trazos (para no repintar con un aviso de OpenMap si nada cambió)
local function avisar()
  version = version + 1
  Eventos.emitir("SNF_DIBUJOS_CAMBIADOS")
end

function Dibujos.poner(lista, opciones)
  local r = {puestos = 0, descartados = 0, sinGuia = 0}
  local d = guardado()
  if not d or type(lista) ~= "table" then
    return r
  end
  local cambio = false
  if type(opciones) == "table" and opciones.reemplazar == true then
    cambio = quitarDeLaIA(d) > 0
  end
  local ahora = tonumber(SNF.API.horaServidor()) or 0
  local orden = tonumber(d.orden) or 0
  local function meter(mapa, trazo)
    orden = orden + 1
    trazo.fecha, trazo.orden = ahora, orden
    local de = d.porMapa[mapa]
    if type(de) ~= "table" then
      de = {}
      d.porMapa[mapa] = de
    end
    de[#de + 1] = trazo
    r.puestos = r.puestos + 1
  end
  for _, t in ipairs(lista) do
    if type(t) == "table" and t.ruta == true then
      local deRuta, sinCamino = trazosDeRuta(t)
      if sinCamino > 0 then
        r.sinCamino = (r.sinCamino or 0) + sinCamino
      end
      if #deRuta == 0 and sinCamino == 0 then
        r.descartados = r.descartados + 1
        if not hayGuia() then
          r.sinGuia = r.sinGuia + 1
        end
      end
      for _, e in ipairs(deRuta) do
        meter(e.mapa, e.trazo)
      end
    else
      local trazo = type(t) == "table" and entero(t.mapa, 1, 2147483647) and sanear(t) or nil
      if trazo then
        meter(t.mapa, trazo)
      else
        r.descartados = r.descartados + 1
      end
    end
  end
  d.orden = orden
  if r.puestos > 0 then
    recortar(d)
    cambio = true
  end
  if cambio then
    avisar()
  end
  return r
end

function Dibujos.quitar()
  local d = guardado()
  local n = d and quitarDeLaIA(d) or 0
  if n > 0 then
    avisar()
  end
  return n
end

function Dibujos.cuantos()
  local d = guardado()
  local n = 0
  for _, lista in pairs(d and d.porMapa or {}) do
    for _, t in ipairs(type(lista) == "table" and lista or {}) do
      if trazoBien(t) then
        n = n + 1
      end
    end
  end
  return n
end

-- Los textos de los trazos (para la línea del chat), sin repetir.
function Dibujos.textos()
  local d = guardado()
  local salida, vistos = {}, {}
  for _, lista in pairs(d and d.porMapa or {}) do
    for _, t in ipairs(type(lista) == "table" and lista or {}) do
      if trazoBien(t) and type(t.texto) == "string" and not vistos[t.texto] then
        vistos[t.texto] = true
        salida[#salida + 1] = t.texto
      end
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Pintar
---------------------------------------------------------------------------------------------------

local enganchado = false
local usadas, usadasMarcas, usadasZonas = 0, 0, 0

local function conLinea(capa)
  local ok, f = pcall(function()
    return capa.CreateLine
  end)
  return ok and type(f) == "function"
end

-- Un tramo (x1, y1) → (x2, y2) en unidades del lienzo (y hacia abajo), reciclando los Line de la capa.
local function tramo(x1, y1, x2, y2, grosor, c)
  usadas = usadas + 1
  local l = lineas[usadas]
  local capa = marcos.capa
  if not l then
    if conLinea(capa) then
      l = capa:CreateLine(nil, "ARTWORK")
      l.snfLinea = true
    else
      l = capa:CreateTexture(nil, "ARTWORK")
    end
    l:SetColorTexture(1, 1, 1, 1)
    lineas[usadas] = l
  end
  l:SetVertexColor(c[1], c[2], c[3], ALFA)
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

local function alSalir()
  if GameTooltip and not GameTooltip:IsForbidden() then
    GameTooltip:Hide()
  end
end

local function alEntrar(f)
  if not f.snfTexto or not GameTooltip or GameTooltip:IsForbidden() then
    return
  end
  GameTooltip:SetOwner(f, "ANCHOR_RIGHT")
  GameTooltip:SetText(f.snfTexto, 1, 1, 1, 1, true)
  GameTooltip:Show()
end

-- ¿Se puede recibir el movimiento del ratón sin los clics? (SetMouseClickEnabled no está en todos los clientes)
local function separaClics(f)
  return type(f.SetMouseClickEnabled) == "function" and type(f.SetMouseMotionEnabled) == "function"
end

-- Solo el movimiento del ratón (el tooltip), nunca los clics: el mapa sigue recibiéndolos. Sin SetMouseClickEnabled, nada
-- de ratón (sin tooltip): EnableMouse se quedaría también los clics del mapa.
local function soloMovimiento(f, si)
  if separaClics(f) then
    f:SetMouseClickEnabled(false)
    f:SetMouseMotionEnabled(si)
  else
    f:EnableMouse(false)
  end
end

-- Un marco del lienzo en (x, y) del mapa abierto (0-100), con escala 1/e como los pines.
local function colocarMarco(f, lienzo, x, y, v)
  f:SetScale(1 / v.escala)
  f:ClearAllPoints()
  f:SetPoint("CENTER", lienzo, "TOPLEFT", x / 100 * v.ancho * v.escala, -y / 100 * v.alto * v.escala)
  if f:GetFrameLevel() ~= v.nivel + 1 then
    f:SetFrameLevel(v.nivel + 1)
  end
  f:Show()
end

local function nuevoMarco(lienzo, tam)
  local f = CreateFrame("Frame", nil, lienzo)
  f:SetSize(tam, tam)
  f:SetScript("OnEnter", alEntrar)
  f:SetScript("OnLeave", alSalir)
  return f
end

local function ponerMarca(lienzo, x, y, trazo, v)
  usadasMarcas = usadasMarcas + 1
  local f = marcas[usadasMarcas]
  if not f then
    f = nuevoMarco(lienzo, TAM_MARCA)
    f.icono = f:CreateTexture(nil, "ARTWORK")
    f.icono:SetAllPoints(f)
    marcas[usadasMarcas] = f
  end
  f.icono:SetTexture(ICONO_MARCA .. string.format("%d", trazo.marca or MARCA_DEFECTO))
  f.snfTexto = trazo.texto
  soloMovimiento(f, trazo.texto ~= nil)
  colocarMarco(f, lienzo, x, y, v)
end

local function ponerZona(lienzo, x, y, texto, v)
  if not separaClics(marcos.capa) then
    return -- sin SetMouseClickEnabled, la zona se quedaría los clics del mapa: sin tooltip
  end
  usadasZonas = usadasZonas + 1
  local f = zonas[usadasZonas]
  if not f then
    f = nuevoMarco(lienzo, TAM_ZONA)
    zonas[usadasZonas] = f
  end
  f.snfTexto = texto
  soloMovimiento(f, true)
  colocarMarco(f, lienzo, x, y, v)
end

-- Sitio en el mapa abierto (0-100) de (x, y) del mapa `mapa`, o nil. Una sola tabla de punto para todo (sitioDe no se
-- la queda): nada de tablas nuevas por vértice al repintar.
local PUNTO = {}
local function sitio(v, mapa, x, y)
  PUNTO.mapa, PUNTO.x, PUNTO.y = mapa, x, y
  return SNF.PinesMundo.sitioDe(v.api, PUNTO, v.abierto)
end

-- Vértices (en 0-100 del mapa del trazo) de la línea que se dibuja: los puntos, o el polígono del círculo (en una tabla
-- que se recicla: se usa enseguida, antes de pedir otra).
local VERTICES_CIRCULO = {}
local function vertices(trazo, v)
  local p = trazo.puntos
  if trazo.tipo ~= "circulo" then
    return p
  end
  local cx, cy, r = p[1], p[2], tonumber(trazo.radio) or 0
  local aspecto = v.ancho / v.alto
  local salida = VERTICES_CIRCULO
  for i = 0, LADOS_CIRCULO do
    local a = i / LADOS_CIRCULO * 2 * math.pi
    salida[2 * i + 1] = cx + r * math.cos(a)
    salida[2 * i + 2] = cy + r * math.sin(a) * aspecto
  end
  return salida
end

local function dibujarTrazo(mapa, trazo, v, lienzo)
  local p = trazo.puntos
  if not (hayNumero(p[1]) and hayNumero(p[2])) then
    return false
  end
  local px, py = sitio(v, mapa, p[1], p[2])
  if trazo.tipo == "marca" then
    if px == nil then
      return false
    end
    ponerMarca(lienzo, px, py, trazo, v)
    return true
  end
  local c = Dibujos.TINTAS[trazo.tinta] or Dibujos.TINTAS[TINTA_DEFECTO]
  local px_g = Dibujos.GROSORES[trazo.grosor] or Dibujos.GROSORES[GROSOR_DEFECTO]
  local grosor = px_g / v.escala
  local vs = vertices(trazo, v)
  local antes = usadas
  local ax, ay -- el vértice anterior en unidades del lienzo (nil si no cae en el mapa)
  local u1, u2, u3, u4 -- el último tramo dibujado (x1, y1, x2, y2), si acaba en el último vértice
  local n = floor(#vs / 2)
  for k = 1, n do
    local bx, by
    if hayNumero(vs[2 * k - 1]) and hayNumero(vs[2 * k]) then
      local x, y = sitio(v, mapa, vs[2 * k - 1], vs[2 * k])
      if x ~= nil then
        bx, by = x / 100 * v.ancho, y / 100 * v.alto
      end
    end
    if ax ~= nil and bx ~= nil then
      tramo(ax, ay, bx, by, grosor, c)
      if k == n then
        u1, u2, u3, u4 = ax, ay, bx, by
      end
    end
    ax, ay = bx, by
  end
  if trazo.tipo == "flecha" and u1 ~= nil then
    local dx, dy = u1 - u3, u2 - u4
    local largo = math.sqrt(dx * dx + dy * dy)
    if largo > 0 then
      local punta = (TAM_PUNTA + 2 * px_g) / v.escala
      dx, dy = dx / largo * punta, dy / largo * punta
      for lado = 1, 2 do
        local s = lado == 1 and ANGULO_PUNTA or -ANGULO_PUNTA
        local co, si = math.cos(s), math.sin(s)
        tramo(u3, u4, u3 + dx * co - dy * si, u4 + dx * si + dy * co, grosor, c)
      end
    end
  end
  local algo = usadas > antes
  if algo and trazo.texto and px ~= nil then
    ponerZona(lienzo, px, py, trazo.texto, v)
  end
  return algo
end

local function esconderDesde(lista, primero)
  for i = primero, #lista do
    lista[i]:Hide()
  end
end

local function nivelBoton(lienzo, api)
  return SNF.PinesMundo.nivelDelPin(lienzo, api) + 10
end

-- Lo que decide cómo se ve lo pintado (revisión: con OpenMap cosido, su aviso de vista llega varias veces por segundo):
-- el mapa abierto, el tamaño y la escala del lienzo, la instancia, OpenMap cosido o no, la versión de los trazos y dónde
-- caen en el mapa abierto dos puntos de referencia (el primero del primer trazo y otro a 10 de él): si la vista de OpenMap
-- se mueve o hace zoom, cambian. Se guarda en FIRMA sin tablas nuevas. Sin trazos no se mira la instancia (`hay`); con
-- `dentro` (lo que ya sabe pintar) no se vuelve a preguntar.
local FIRMA, ULTIMA = {}, {}
local function referencia(d)
  for id, lista in pairs(d and d.porMapa or {}) do
    if type(id) == "number" and type(lista) == "table" then
      for _, t in ipairs(lista) do
        if trazoBien(t) and hayNumero(t.puntos[1]) and hayNumero(t.puntos[2]) then
          return id, t.puntos[1], t.puntos[2]
        end
      end
    end
  end
  return nil
end
local function firmar(hay, dentro)
  local f = FIRMA
  local mapa = WorldMapFrame
  local lienzo = mapa and type(mapa.GetCanvas) == "function" and mapa:IsShown() and mapa:GetCanvas() or nil
  f.lienzo = lienzo ~= nil
  f.abierto = lienzo and mapa:GetMapID() or nil
  f.ancho = lienzo and lienzo:GetWidth() or nil
  f.alto = lienzo and lienzo:GetHeight() or nil
  f.escala = lienzo and type(mapa.GetCanvasScale) == "function" and tonumber(mapa:GetCanvasScale()) or nil
  if hay then
    if dentro == nil then
      dentro = IsInInstance() and true or false
    end
  else
    dentro = false
  end
  f.instancia = dentro
  f.hay = hay
  f.version = version
  local api = lienzo and SNF.PinesMundo.openMapCosido() or nil
  f.api = api ~= nil
  f.x1, f.y1, f.x2, f.y2 = nil, nil, nil, nil
  if api and f.abierto ~= nil then
    local id, x, y = referencia(guardado())
    if id then
      local v = {api = api, abierto = f.abierto}
      f.x1, f.y1 = sitio(v, id, x, y)
      f.x2, f.y2 = sitio(v, id, x <= 90 and x + 10 or x - 10, y)
    end
  end
end
local CAMPOS_FIRMA = {"lienzo", "abierto", "ancho", "alto", "escala", "hay", "instancia", "version", "api", "x1", "y1", "x2", "y2"}
local function igualQueLoPintado()
  for _, k in ipairs(CAMPOS_FIRMA) do
    if FIRMA[k] ~= ULTIMA[k] then
      return false
    end
  end
  return ULTIMA.pintado == true
end
local function apuntarPintado(hay, dentro)
  firmar(hay, dentro)
  for _, k in ipairs(CAMPOS_FIRMA) do
    ULTIMA[k] = FIRMA[k]
  end
  ULTIMA.pintado = true
end

function Dibujos.pintar()
  local mapa = WorldMapFrame
  if not mapa or type(mapa.GetCanvas) ~= "function" or not mapa:IsShown() then
    return
  end
  local lienzo = mapa:GetCanvas()
  if not lienzo then
    return
  end
  usadas, usadasMarcas, usadasZonas = 0, 0, 0
  local d = guardado()
  local hay = Dibujos.cuantos() > 0
  local dentro = hay and (IsInInstance() and true or false) or nil
  local v
  if hay and not dentro then
    local abierto = mapa:GetMapID()
    local ancho, alto = lienzo:GetWidth(), lienzo:GetHeight()
    local escala = type(mapa.GetCanvasScale) == "function" and tonumber(mapa:GetCanvasScale()) or 1
    if not escala or escala <= 0 then
      escala = 1
    end
    if abierto ~= nil and ancho and alto and ancho > 0 and alto > 0 then
      SNF.PinesMundo.engancharOpenMap()
      local api = SNF.PinesMundo.openMapCosido()
      local nivel = math.max(lienzo:GetFrameLevel() + 1, SNF.PinesMundo.nivelDelPin(lienzo, api) - BAJO_PINES)
      v = {api = api, abierto = abierto, ancho = ancho, alto = alto, escala = escala, nivel = nivel}
    end
  end
  local algo = false
  if v then
    if not marcos.capa then
      marcos.capa = CreateFrame("Frame", nil, lienzo)
      marcos.capa:SetAllPoints(lienzo)
    end
    if marcos.capa:GetFrameLevel() ~= v.nivel then
      marcos.capa:SetFrameLevel(v.nivel)
    end
    local ids = {}
    for id in pairs(d.porMapa) do
      if type(id) == "number" then
        ids[#ids + 1] = id
      end
    end
    table.sort(ids)
    for _, id in ipairs(ids) do
      for _, t in ipairs(type(d.porMapa[id]) == "table" and d.porMapa[id] or {}) do
        if trazoBien(t) and dibujarTrazo(id, t, v, lienzo) then
          algo = true
        end
      end
    end
  end
  esconderDesde(lineas, usadas + 1)
  esconderDesde(marcas, usadasMarcas + 1)
  esconderDesde(zonas, usadasZonas + 1)
  apuntarPintado(hay, dentro)
  local b = marcos.boton
  if b then
    if algo then
      local nivel = nivelBoton(lienzo, v.api)
      if b:GetFrameLevel() ~= nivel then
        b:SetFrameLevel(nivel)
      end
    end
    b:SetShown(algo)
  end
end

---------------------------------------------------------------------------------------------------
-- Botón «Quitar dibujos» del mapa y enganches
---------------------------------------------------------------------------------------------------

local function crearBoton(mapa)
  local b = UI.boton(mapa, function()
    return L.t("MAPA_QUITAR_DIBUJOS")
  end, function()
    Dibujos.quitar()
  end)
  Estilo.tarjeta(b, "fondoCabecera")
  Estilo.fuente(b.texto, Estilo.TAMANOS.pequeno)
  b:SetHeight(20)
  local refrescar = b.refrescar
  b.refrescar = function()
    refrescar()
    b:SetWidth(math.max(60, floor(b.texto:GetStringWidth() + 16)))
  end
  b.refrescar()
  local contenedor = type(rawget(mapa, "ScrollContainer")) == "table" and rawget(mapa, "ScrollContainer") or mapa
  b:SetPoint("BOTTOMRIGHT", contenedor, "BOTTOMRIGHT", -10, 10)
  b:SetScript("OnEnter", function(self)
    if GameTooltip and not GameTooltip:IsForbidden() then
      GameTooltip:SetOwner(self, "ANCHOR_TOP")
      GameTooltip:SetText(L.t("MAPA_QUITAR_DIBUJOS_AYUDA"), 1, 1, 1, 1, true)
      GameTooltip:Show()
    end
  end)
  b:SetScript("OnLeave", alSalir)
  b:Hide()
  return b
end

local function repintar()
  Dibujos.pintar()
end

function Dibujos.crear()
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
  marcos.boton = crearBoton(mapa)
  enganchado = true
  Dibujos.pintar()
  return true
end

Eventos.escuchar("SNF_DIBUJOS_CAMBIADOS", repintar)
-- Con OpenMap cosido, su aviso de vista llega varias veces por segundo: solo se repinta si algo cambió (ver firmar).
Eventos.escuchar("SNF_OPENMAP_CAMBIADO", function()
  firmar(Dibujos.cuantos() > 0)
  if not igualQueLoPintado() then
    Dibujos.pintar()
  end
end)
Eventos.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "idioma" and marcos.boton then
    marcos.boton.refrescar()
  end
end)
