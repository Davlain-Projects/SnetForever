-- SnetForever: los pines de la IA como «Marcador de mapa» de Blizzard (el del botón del mapa o Ctrl+clic: flecha de
-- seguimiento del juego, distancia y se puede compartir). Antes un pin aceptado era un aro con un «1», como un paso de
-- guía; un jugador dijo, con razón, que eso no es un pin. Aquí se pone el marcador de verdad en el sitio que ya trae el
-- punto aceptado (la IA nunca inventa coordenadas) y NUNCA se toca uno que puso el jugador.
--
-- Punto = un punto de la capa (mapa/capa.lua) con mapa (uiMapID entero) y x, y en 0-100; etiqueta opcional.
--
-- Marcador.seguir(punto, opciones?) -> "puesto" | "combate" | "no_se_puede" | "del_jugador"
--     "no_se_puede"  sin C_Map.SetUserWaypoint, UiMapPoint.CreateFromCoordinates o
--                    C_SuperTrack.SetSuperTrackedUserWaypoint, con un punto inválido, si C_Map.CanSetUserWaypointOnMap
--                    (si existe) da falso para su mapa o si el cliente no deja ponerlo.
--     "del_jugador"  hay un marcador (C_Map.HasUserWaypoint) que no es el nuestro y no viene opciones.forzar: no se toca.
--     "combate"      en combate (InCombatLockdown) queda pendiente (solo el último) y se pone con PLAYER_REGEN_ENABLED,
--                    con la misma comprobación de «del jugador» en ese momento (si lo es, emite
--                    SNF_IA_MARCADOR_PREGUNTA(punto) para que el chat pregunte).
--     "puesto"       C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(mapa, x/100, y/100)) y
--                    C_SuperTrack.SetSuperTrackedUserWaypoint(true), con pcall. Cuál es el nuestro (mapa, x, y en 0-1
--                    y la clave del punto) queda en SnetForeverPJ.ia.marcador: se reconoce también tras un /reload (el
--                    cliente guarda el marcador).
-- Marcador.seguirPreguntando(punto, opciones?) -> lo mismo que seguir, y además emite SNF_IA_MARCADOR_PREGUNTA(punto)
--     con "del_jugador" y SNF_IA_MARCADOR_COMBATE(punto) con "combate" (la ruta de la IA y el clic en un pin del mapa).
-- Marcador.esNuestro() -> bool   hay marcador y C_Map.GetUserWaypoint() coincide con el guardado (mismo uiMapID y x, y a
--     menos de TOLERANCIA en 0-1).
-- Marcador.quitar()              solo si es nuestro, C_Map.ClearUserWaypoint(). Siempre olvida lo guardado y lo pendiente.
--     NUNCA quita un marcador que puso el jugador.
-- Marcador.seguido() -> punto | nil   el punto de la capa («ia», «jugador» o «guia», en ese orden) que sigue ahora
--     nuestro marcador, si sigue siendo nuestro y la flecha del juego lo sigue (C_SuperTrack.IsSuperTrackingUserWaypoint,
--     si existe: si el jugador sigue una misión, nuestro pin vuelve a pintarse y se puede pulsar). Se guarda hecho hasta
--     el siguiente cambio (los pines del minimapa lo piden 10 veces por segundo).
-- Marcador.hay() -> bool         hay un marcador puesto (nuestro o del jugador).
-- Marcador.clave(punto) -> texto | nil   la clave con la que se reconoce un punto (mapa y x, y con dos decimales).
--
-- USER_WAYPOINT_UPDATED: si el marcador ya no es el nuestro (el jugador lo cambió o lo quitó), se olvida el nuestro y no
-- se pelea. Antes de PLAYER_ENTERING_WORLD nunca (el cliente aún está cargando el marcador); después, solo si no hay
-- marcador (HasUserWaypoint falso) o si se lee y es otro, no si aún no se puede leer.
-- SUPER_TRACKING_CHANGED: lo que sigue la flecha cambió. SNF_MARCADOR_CAMBIADO se emite cuando cambia lo que da
-- seguido() o si pasa a haber o no haber marcador (Marcador.hay).
local _, SNF = ...

local Marcador = {}
SNF.Marcador = Marcador

local Eventos = SNF.Eventos
local Capa = SNF.Capa
local esSecreto = SNF.API.esSecreto

local floor = math.floor

local TOLERANCIA = 0.0005 -- en 0-1: el mismo sitio
local ORIGENES = {"ia", "jugador", "guia"} -- dónde se busca el punto seguido, en este orden

local pendiente -- {punto, forzar} que se pone al salir de combate
local nuestroSuelto -- lo nuestro si no hay SnetForeverPJ (no se guarda)
local firmaEmitida = "0:" -- si había marcador y la clave de lo seguido en el último SNF_MARCADOR_CAMBIADO
local hecho = false -- seguidoHecho vale
local enMundo = false -- ya llegó PLAYER_ENTERING_WORLD
local seguidoHecho -- lo que da seguido(), guardado

local function guardadoIa()
  local pj = rawget(_G, "SnetForeverPJ")
  return type(pj) == "table" and type(pj.ia) == "table" and pj.ia or nil
end

local function hayNumero(v)
  return type(v) == "number" and not esSecreto(v)
end

local function enCien(v)
  return hayNumero(v) and v >= 0 and v <= 100
end

local function valido(punto)
  return type(punto) == "table" and hayNumero(punto.mapa) and punto.mapa == floor(punto.mapa) and punto.mapa >= 1
    and enCien(punto.x) and enCien(punto.y)
end

-- Una función de una tabla de la API, sin pasar por metatablas (como las demás lecturas de C_Map del addon).
local function api(tabla, nombre)
  local t = rawget(_G, tabla)
  local f = type(t) == "table" and rawget(t, nombre) or nil
  return type(f) == "function" and f or nil
end

function Marcador.clave(punto)
  if not valido(punto) then
    return nil
  end
  return string.format("%d:%.2f:%.2f", punto.mapa, punto.x, punto.y)
end

---------------------------------------------------------------------------------------------------
-- Lo nuestro.
---------------------------------------------------------------------------------------------------

local function nuestro()
  local ia = guardadoIa()
  local g
  if ia then
    g = ia.marcador
  else
    g = nuestroSuelto
  end
  if type(g) == "table" and hayNumero(g.mapa) and hayNumero(g.x) and hayNumero(g.y) then
    return g
  end
  return nil
end

local function apuntar(g)
  local ia = guardadoIa()
  if ia then
    ia.marcador = g
  end
  nuestroSuelto = g
  hecho = false
end

local function hayMarcador()
  local f = api("C_Map", "HasUserWaypoint")
  if not f then
    return false
  end
  local ok, hay = pcall(f)
  return ok and hay == true
end

-- El marcador puesto: mapa, x, y (0-1), o nil.
local function marcadorPuesto()
  local f = api("C_Map", "GetUserWaypoint")
  if not f then
    return nil
  end
  local ok, p = pcall(f)
  if not ok or type(p) ~= "table" then
    return nil
  end
  local mapa, pos = p.uiMapID, p.position
  if not hayNumero(mapa) or type(pos) ~= "table" then
    return nil
  end
  local x, y = pos.x, pos.y
  if type(pos.GetXY) == "function" then
    local bien, px, py = pcall(pos.GetXY, pos)
    if bien then
      x, y = px, py
    end
  end
  if not hayNumero(x) or not hayNumero(y) then
    return nil
  end
  return mapa, x, y
end

function Marcador.hay()
  return hayMarcador()
end

-- ¿Sigue la flecha del juego el marcador? Sin la API, sí.
local function sigueLaFlecha()
  local f = api("C_SuperTrack", "IsSuperTrackingUserWaypoint")
  if not f then
    return true
  end
  local ok, si = pcall(f)
  return ok and si == true
end

function Marcador.esNuestro()
  local g = nuestro()
  if not g or not hayMarcador() then
    return false
  end
  local mapa, x, y = marcadorPuesto()
  return mapa ~= nil and mapa == g.mapa and math.abs(x - g.x) < TOLERANCIA and math.abs(y - g.y) < TOLERANCIA
end

local function buscar(clave)
  for _, origen in ipairs(ORIGENES) do
    for _, p in ipairs(Capa.puntos(origen)) do
      if Marcador.clave(p) == clave then
        return p
      end
    end
  end
  return nil
end

function Marcador.seguido()
  if not hecho then
    hecho = true
    seguidoHecho = nil
    local g = nuestro()
    if g and type(g.clave) == "string" and Marcador.esNuestro() and sigueLaFlecha() then
      seguidoHecho = buscar(g.clave)
    end
  end
  return seguidoHecho
end

-- SNF_MARCADOR_CAMBIADO si cambió lo que da seguido().
local function avisar()
  hecho = false
  local p = Marcador.seguido()
  local firma = (hayMarcador() and "1:" or "0:") .. (p and Marcador.clave(p) or "")
  if firma ~= firmaEmitida then
    firmaEmitida = firma
    Eventos.emitir("SNF_MARCADOR_CAMBIADO")
  end
end

---------------------------------------------------------------------------------------------------
-- Poner y quitar.
---------------------------------------------------------------------------------------------------

local function sePuede(punto)
  if not valido(punto) then
    return false
  end
  if not api("C_Map", "SetUserWaypoint") or not api("UiMapPoint", "CreateFromCoordinates")
    or not api("C_SuperTrack", "SetSuperTrackedUserWaypoint") then
    return false
  end
  local puede = api("C_Map", "CanSetUserWaypointOnMap")
  if puede then
    local ok, si = pcall(puede, punto.mapa)
    if not ok or not si then
      return false
    end
  end
  return true
end

local function poner(punto, forzar)
  if hayMarcador() and not Marcador.esNuestro() and not forzar then
    return "del_jugador"
  end
  local antes = nuestro()
  local x, y = punto.x / 100, punto.y / 100
  -- Se apunta antes de ponerlo: USER_WAYPOINT_UPDATED puede llegar dentro de SetUserWaypoint y tiene que verlo nuestro.
  apuntar({mapa = punto.mapa, x = x, y = y, clave = Marcador.clave(punto)})
  local ok = pcall(function()
    C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(punto.mapa, x, y))
  end)
  if not ok then
    apuntar(antes)
    avisar()
    return "no_se_puede"
  end
  pcall(C_SuperTrack.SetSuperTrackedUserWaypoint, true)
  avisar()
  return "puesto"
end

function Marcador.seguir(punto, opciones)
  local forzar = type(opciones) == "table" and opciones.forzar == true
  if not sePuede(punto) then
    return "no_se_puede"
  end
  if hayMarcador() and not Marcador.esNuestro() and not forzar then
    return "del_jugador"
  end
  if InCombatLockdown() then
    pendiente = {punto = punto, forzar = forzar}
    return "combate"
  end
  pendiente = nil
  return poner(punto, forzar)
end

function Marcador.seguirPreguntando(punto, opciones)
  local r = Marcador.seguir(punto, opciones)
  if r == "del_jugador" then
    Eventos.emitir("SNF_IA_MARCADOR_PREGUNTA", punto)
  elseif r == "combate" then
    Eventos.emitir("SNF_IA_MARCADOR_COMBATE", punto)
  end
  return r
end

function Marcador.quitar()
  pendiente = nil
  if Marcador.esNuestro() then
    local f = api("C_Map", "ClearUserWaypoint")
    if f then
      pcall(f)
    end
  end
  apuntar(nil)
  avisar()
end

---------------------------------------------------------------------------------------------------
-- Eventos.
---------------------------------------------------------------------------------------------------

-- El jugador cambió o quitó el marcador: lo nuestro se olvida (y no se vuelve a poner). Durante la carga no: el cliente
-- puede avisar antes de tener el marcador a la vista.
Eventos.escuchar("USER_WAYPOINT_UPDATED", function()
  local g = nuestro()
  if g and enMundo then
    if not hayMarcador() then
      apuntar(nil)
    else
      local mapa = marcadorPuesto()
      if mapa ~= nil and not Marcador.esNuestro() then
        apuntar(nil)
      end
    end
  end
  avisar()
end)

Eventos.escuchar("SUPER_TRACKING_CHANGED", avisar)

Eventos.escuchar("PLAYER_ENTERING_WORLD", function()
  enMundo = true
  avisar()
end)

Eventos.escuchar("PLAYER_REGEN_ENABLED", function()
  local p = pendiente
  pendiente = nil
  if not p or not sePuede(p.punto) then
    return
  end
  if poner(p.punto, p.forzar) == "del_jugador" then
    Eventos.emitir("SNF_IA_MARCADOR_PREGUNTA", p.punto)
  end
end)

-- Los puntos de la capa cambiaron: el seguido puede ser otro objeto (la ruta se rehace) o ya no estar.
Eventos.escuchar("SNF_PUNTOS_CAMBIADOS", avisar)
