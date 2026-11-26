-- SnetForever: coordenadas de zona (0-100) y de mundo (yardas) sin librerías (plano 3 §2.2, §3.3 y §3.5).
--
-- Convención de HereBeDragons, la misma de los datos de la fase 1 ({mapa, inst, wx, wy}):
--   * wx = 2.º valor de UnitPosition("player"): este-oeste, crece hacia el OESTE;
--   * wy = 1.er valor de UnitPosition("player"): norte-sur, crece hacia el NORTE;
--   * el vector de C_Map.GetWorldPosFromMapPos da primero wy (X del vector) y luego wx (Y del vector).
-- Solo se usa C_Map.GetWorldPosFromMapPos (dos esquinas = el rectángulo de la zona): no hace falta
-- C_Map.GetMapWorldSize ni C_Map.GetMapPosFromWorldPos, que no se sabe si existen en Forever.
--
-- Coord.aMundo(punto) -> {wx, wy, inst}|nil   {mapa, x, y} con GetWorldPosFromMapPos; {mapa, inst, wx, wy} tal cual.
--                                             Memorizado por punto (los puntos no se cambian después; la tabla
--                                             devuelta es compartida: no se modifica).
-- Coord.rect(mapa) -> {x0, y0, x1, y1, inst}|nil  wx/wy de las esquinas (0,0) y (1,1) del mapa, memorizado.
-- Coord.aMapa(punto, mapa?) -> x, y|nil       en 0-100 sobre el mapa del punto o sobre `mapa`; si `mapa` es un
--                                             antepasado del mapa del punto, con C_Map.GetMapRectOnMap; si no, nil.
-- Coord.jugador(salida?) -> {wx, wy, inst}|nil  la posición de UnitPosition("player") (nil dentro de instancias).
--                                             Con `salida`, la escribe en esa tabla y la devuelve (sin crear una:
--                                             la flecha la pide en cada fotograma).
-- Coord.vector(desde, hasta) -> distancia, angulo  yardas y ángulo en [0, 2π): 0 = norte, antihorario (π/2 =
--                                             oeste), como GetPlayerFacing().
-- Coord.comprobar() -> {mapa, x, y, xCalc, yCalc, dif}  para «/dump SnetForever.Coord.comprobar()» en el juego:
--                                             GetPlayerMapPosition frente a aMapa de UnitPosition (dif < 0,1 = bien).
local _, SNF = ...
local Coord = {}
SNF.Coord = Coord

local DOS_PI = 2 * math.pi
local MAX_PADRES = 10 -- niveles de mapas padre que se suben como mucho (zona → continente → mundo)

local mundos = setmetatable({}, {__mode = "k"}) -- [punto] = {wx, wy, inst}
local rects = {} -- [mapa] = {x0, y0, x1, y1, inst}
local padres = {} -- [mapa] = parentMapID, o false si no tiene

-- Mundo de la posición (x, y) en 0-1 del mapa: wx, wy, inst (nil si el juego no la da, o si no hay C_Map: así
-- motor/continente.lua, que ya mira si está C_Map, no da error al cargar una guía sin él).
local function mundoDe(mapa, x, y)
  if not (C_Map and C_Map.GetWorldPosFromMapPos) then
    return nil
  end
  local inst, vector = C_Map.GetWorldPosFromMapPos(mapa, CreateVector2D(x, y))
  if not vector then
    return nil
  end
  local wy, wx = vector:GetXY()
  if wx == nil or wy == nil then
    return nil
  end
  return wx, wy, inst
end

function Coord.rect(mapa)
  if mapa == nil then
    return nil
  end
  local r = rects[mapa]
  if r then
    return r
  end
  local x0, y0, inst = mundoDe(mapa, 0, 0)
  local x1, y1 = mundoDe(mapa, 1, 1)
  if x0 == nil or x1 == nil then
    return nil
  end
  r = {x0 = x0, y0 = y0, x1 = x1, y1 = y1, inst = inst}
  rects[mapa] = r
  return r
end

-- 11-nov: (mapa, x, y en 0-100) -> wx, wy, inst sin guardar nada (la red de caminos convierte decenas de miles de puntos
-- de las guías una vez y no debe llenar la caché de aMundo). Usa el rectángulo del mapa, que sí se guarda (uno por mapa).
function Coord.mundo(mapa, x, y)
  if type(x) ~= "number" or type(y) ~= "number" then
    return nil
  end
  local r = Coord.rect(mapa)
  if not r then
    return nil
  end
  return r.x0 + (r.x1 - r.x0) * x / 100, r.y0 + (r.y1 - r.y0) * y / 100, r.inst
end

function Coord.aMundo(punto)
  if type(punto) ~= "table" then
    return nil
  end
  local m = mundos[punto]
  if m then
    return m
  end
  if punto.wx ~= nil and punto.wy ~= nil then
    local inst = punto.inst
    if inst == nil then
      local r = Coord.rect(punto.mapa)
      inst = r and r.inst
    end
    m = {wx = punto.wx, wy = punto.wy, inst = inst}
  elseif punto.mapa ~= nil and punto.x ~= nil and punto.y ~= nil then
    local wx, wy, inst = mundoDe(punto.mapa, punto.x / 100, punto.y / 100)
    if wx == nil then
      return nil
    end
    m = {wx = wx, wy = wy, inst = inst}
  else
    return nil
  end
  mundos[punto] = m
  return m
end

-- x, y (0-100) del punto en su propio mapa.
local function enSuMapa(punto)
  if punto.x ~= nil and punto.y ~= nil then
    return punto.x, punto.y
  end
  local w = Coord.aMundo(punto)
  local r = Coord.rect(punto.mapa)
  if not w or not r or (w.inst ~= nil and r.inst ~= nil and w.inst ~= r.inst) then
    return nil
  end
  local ancho, alto = r.x1 - r.x0, r.y1 - r.y0
  if ancho == 0 or alto == 0 then
    return nil
  end
  return (w.wx - r.x0) / ancho * 100, (w.wy - r.y0) / alto * 100
end

local function padreDe(mapa)
  local p = padres[mapa]
  if p == nil then
    local info = C_Map.GetMapInfo(mapa)
    p = info and info.parentMapID
    if not p or p == 0 then
      p = false
    end
    padres[mapa] = p
  end
  return p or nil
end

local function esAntepasado(mapa, arriba)
  for _ = 1, MAX_PADRES do
    mapa = padreDe(mapa)
    if mapa == nil then
      return false
    end
    if mapa == arriba then
      return true
    end
  end
  return false
end

function Coord.aMapa(punto, mapa)
  if type(punto) ~= "table" or punto.mapa == nil then
    return nil
  end
  local x, y = enSuMapa(punto)
  if x == nil then
    return nil
  end
  if mapa == nil or mapa == punto.mapa then
    return x, y
  end
  if not esAntepasado(punto.mapa, mapa) then
    return nil
  end
  local x0, x1, y0, y1 = C_Map.GetMapRectOnMap(punto.mapa, mapa)
  if x0 == nil or x1 == nil or y0 == nil or y1 == nil then
    return nil
  end
  return (x0 + x / 100 * (x1 - x0)) * 100, (y0 + y / 100 * (y1 - y0)) * 100
end

function Coord.jugador(salida)
  local wy, wx, _, inst = UnitPosition("player")
  if wx == nil or wy == nil then
    return nil
  end
  if salida then
    salida.wx, salida.wy, salida.inst = wx, wy, inst
    return salida
  end
  return {wx = wx, wy = wy, inst = inst}
end

function Coord.vector(desde, hasta)
  local dx, dy = hasta.wx - desde.wx, hasta.wy - desde.wy
  local angulo = math.atan2(dx, dy)
  if angulo < 0 then
    angulo = angulo + DOS_PI
  end
  return math.sqrt(dx * dx + dy * dy), angulo
end

function Coord.comprobar()
  local mapa = C_Map.GetBestMapForUnit("player")
  local j = Coord.jugador()
  local salida = {mapa = mapa}
  if mapa == nil or j == nil then
    return salida
  end
  local posicion = C_Map.GetPlayerMapPosition(mapa, "player")
  if posicion then
    local x, y = posicion:GetXY()
    salida.x, salida.y = x * 100, y * 100
  end
  salida.xCalc, salida.yCalc = Coord.aMapa({mapa = mapa, inst = j.inst, wx = j.wx, wy = j.wy})
  if salida.x and salida.xCalc then
    local dx, dy = salida.x - salida.xCalc, salida.y - salida.yCalc
    salida.dif = math.sqrt(dx * dx + dy * dy)
  end
  return salida
end
