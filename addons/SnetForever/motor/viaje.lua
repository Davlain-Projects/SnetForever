-- SnetForever: consejo de viaje para la flecha (11-nov). Un jugador: «me marca un paso 1 a 4665 yd y no tengo idea si tengo
-- que caminar, tomar un volador o matarme y nacer en un cementerio». Cuando el destino está lejos, la flecha lleva
-- primero al maestro de vuelo más cercano y dice hasta dónde volar; al aterrizar, vuelve a apuntar al destino. Todo sale
-- de la base (SNF_MISIONES.npc): los PNJ con la bandera de maestro de vuelo (npcFlags 8, UNIT_NPC_FLAG_FLIGHTMASTER de
-- 1.12) de la facción del jugador, con un punto. Nunca propone morir para aparecer en un cementerio.
--
-- Vuelos aprendidos (segunda petición, el 11-nov): el juego solo dice qué vuelos conoce el personaje con el mapa
-- de vuelos abierto, así que al abrirlo se apuntan (ver su sección). Con vuelos apuntados, el vuelo de llegada es el
-- conocido más cercano al destino («vuela hasta el punto X más cercano y después, a pie»); sin ellos, el texto dice «si
-- tienes ese vuelo».
--
-- Viaje.consejo(destino, yo) -> {origen = id, hasta = id, mapa, w, seguro} | nil
--   destino: un punto con coordenadas del mundo (Coord.aMundo); yo: {wx, wy, inst} (Coord.jugador). Hay consejo si los
--   dos están en el mismo continente, a más de Viaje.LEJOS yardas, el maestro más cercano al jugador no es el de llegada
--   y volar ahorra camino: (jugador → su maestro) + (maestro de llegada → destino) es menos que Viaje.AHORRO de la
--   distancia directa. w = dónde está el maestro de salida (la flecha apunta allí); seguro = hay vuelos apuntados.
-- Viaje.texto(consejo) -> «Lejos: vuela con <PNJ> a <zona> (<PNJ>)[, si tienes ese vuelo]»
-- Viaje.textoFlecha(consejo, yardas, despues) -> las líneas de la flecha cuando lleva al maestro de vuelo.
-- Viaje.apuntar() / Viaje.conocidos() / Viaje.nombresConocidos(max)   los vuelos aprendidos.
-- Viaje.conoce(id) -> boolean       T1: el vuelo de ese maestro está apuntado.
-- Viaje.maestroCerca(w) -> id | nil T1: el maestro de la base a menos de 120 yd de ese punto del mundo.
-- Viaje.maestros(letra) -> {{id, mapa, x, y, w}...}  los de esa facción («H» o «A»), una vez por facción.
local _, SNF = ...
local Viaje = {}
SNF.Viaje = Viaje

local L = SNF.L

Viaje.LEJOS = 1200 -- yardas: más cerca, se va andando
Viaje.AHORRO = 0.6 -- volar tiene que dejar el camino a pie en menos del 60 % del directo
Viaje.CERCA_MAESTRO = 25 -- yardas: ya está con el maestro de vuelo

local BANDERA_VUELO = 8
local CASAR = 120 -- yardas entre el nodo del mapa de vuelos y el maestro de la base
local CERCA_DEL_ACTUAL = 80 -- yardas entre el jugador y el maestro del nodo en el que está
local porFaccion = {} -- [letra] = lista de maestros

local function esMaestro(npc, letra)
  local flags = tonumber(npc.npcFlags) or 0
  if math.floor(flags / BANDERA_VUELO) % 2 ~= 1 then
    return false
  end
  local bando = npc.friendlyToFaction
  return type(bando) ~= "string" or letra == nil or string.find(bando, letra, 1, true) ~= nil
end

function Viaje.maestros(letra)
  local clave = letra or "?"
  local lista = porFaccion[clave]
  if lista then
    return lista
  end
  lista = {}
  local npcs = type(SNF_MISIONES) == "table" and SNF_MISIONES.npc
  if type(npcs) == "table" then
    for id, npc in pairs(npcs) do
      if type(npc) == "table" and type(npc.spawns) == "table" and esMaestro(npc, letra) then
        for mapa, puntos in pairs(npc.spawns) do
          local p = type(mapa) == "number" and type(puntos) == "table" and puntos[1]
          if type(p) == "table" and type(p[1]) == "number" and type(p[2]) == "number" then
            local punto = {mapa = mapa, x = p[1], y = p[2]}
            local w = SNF.Coord.aMundo(punto)
            if w then
              lista[#lista + 1] = {id = id, mapa = mapa, x = p[1], y = p[2], w = w}
              break
            end
          end
        end
      end
    end
  end
  table.sort(lista, function(a, b)
    return a.id < b.id
  end)
  porFaccion[clave] = lista
  return lista
end

local function distancia(a, b)
  local dx, dy = a.wx - b.wx, a.wy - b.wy
  return math.sqrt(dx * dx + dy * dy)
end

-- El maestro de esa instancia más cercano a `w` (si `solo`, solo los de ese conjunto de ids), y su distancia.
local function cercano(lista, w, solo)
  local mejor, dMejor
  for _, m in ipairs(lista) do
    if m.w.inst == w.inst and (solo == nil or solo[m.id]) then
      local d = distancia(m.w, w)
      if dMejor == nil or d < dMejor then
        mejor, dMejor = m, d
      end
    end
  end
  return mejor, dMejor
end

local function letraDelJugador()
  local pj = SNF.Personaje and SNF.Personaje.actual and SNF.Personaje.actual() or {}
  return pj.faccion == "Horde" and "H" or pj.faccion == "Alliance" and "A" or nil
end

---------------------------------------------------------------------------------------------------
-- Vuelos aprendidos
---------------------------------------------------------------------------------------------------
-- Al abrir el mapa de vuelos (TAXIMAP_OPENED) se apuntan en SnetForeverPJ.vuelos = {npcs = {[id] = true}, nombres =
-- {[id] = nombre del nodo}, fecha}: cada nodo conocido (estado Current o Reachable de C_TaxiMap.GetAllTaxiNodes) se casa
-- con el maestro de vuelo de la base que está a menos de CASAR yardas de su sitio (la posición del nodo en el mapa de
-- vuelos, pasada al mundo). El del nodo en el que está el jugador se apunta también por cercanía al jugador. Lo apuntado
-- se queda (sobrevive a /reload) y solo crece: un vuelo aprendido no se olvida.

local function guardados()
  if SNF.Guardado and SNF.Guardado.preparar then
    SNF.Guardado.preparar()
  end
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj) ~= "table" then
    return nil
  end
  local v = pj.vuelos
  if type(v) ~= "table" or type(v.npcs) ~= "table" then
    v = {npcs = {}, nombres = {}}
    pj.vuelos = v
  end
  if type(v.nombres) ~= "table" then
    v.nombres = {}
  end
  return v
end

-- Los vuelos apuntados ({npcs, nombres, fecha}), o nil si nunca se ha abierto un mapa de vuelos con el addon.
function Viaje.conocidos()
  local pj = rawget(_G, "SnetForeverPJ")
  local v = type(pj) == "table" and pj.vuelos
  if type(v) == "table" and type(v.npcs) == "table" and next(v.npcs) ~= nil then
    return v
  end
  return nil
end

local function estadosConocidos()
  local enum = rawget(_G, "Enum")
  local e = type(enum) == "table" and rawget(enum, "FlightPathState")
  local actual = type(e) == "table" and e.Current or 0
  local alcanzable = type(e) == "table" and e.Reachable or 1
  return actual, alcanzable
end

local function posicionDe(nodo)
  local p = nodo.position
  if type(p) ~= "table" then
    return nil
  end
  local x, y = p.x, p.y
  if (type(x) ~= "number" or type(y) ~= "number") and type(p.GetXY) == "function" then
    local ok, a, b = pcall(p.GetXY, p)
    if ok then
      x, y = a, b
    end
  end
  if type(x) == "number" and type(y) == "number" then
    return x, y
  end
  return nil
end

-- Apunta los vuelos que conoce el personaje (lo llama TAXIMAP_OPENED). Devuelve cuántos maestros nuevos apuntó.
function Viaje.apuntar()
  local taxi = rawget(_G, "C_TaxiMap")
  local todos = type(taxi) == "table" and rawget(taxi, "GetAllTaxiNodes")
  if type(todos) ~= "function" then
    return 0
  end
  local yo = SNF.Coord.jugador()
  local mapa = type(rawget(_G, "GetTaxiMapID")) == "function" and GetTaxiMapID() or nil
  if mapa == nil and yo then
    mapa = yo.inst == 1 and 1414 or yo.inst == 0 and 1415 or nil
  end
  if mapa == nil then
    return 0
  end
  local ok, nodos = pcall(todos, mapa)
  if not ok or type(nodos) ~= "table" then
    return 0
  end
  local v = guardados()
  if not v then
    return 0
  end
  local lista = Viaje.maestros(letraDelJugador())
  local actual, alcanzable = estadosConocidos()
  local n = 0
  local function marcar(m, nombre)
    if not v.npcs[m.id] then
      n = n + 1
    end
    v.npcs[m.id] = true
    if type(nombre) == "string" and nombre ~= "" then
      v.nombres[m.id] = nombre
    end
  end
  for _, nodo in ipairs(nodos) do
    if type(nodo) == "table" and (nodo.state == actual or nodo.state == alcanzable) then
      local x, y = posicionDe(nodo)
      local w = x and SNF.Coord.aMundo({mapa = mapa, x = x * 100, y = y * 100}) or nil
      local m, d
      if w then
        m, d = cercano(lista, w)
      end
      if m and d <= CASAR then
        marcar(m, nodo.name)
      elseif nodo.state == actual and yo then
        local cerca, dc = cercano(lista, yo)
        if cerca and dc <= CERCA_DEL_ACTUAL then
          marcar(cerca, nodo.name)
        end
      end
    end
  end
  local reloj = rawget(_G, "time")
  if type(reloj) == "function" then
    v.fecha = reloj()
  end
  return n
end

-- T1: ¿está el maestro de vuelo `id` entre los vuelos apuntados? (false si nunca se ha abierto un mapa de vuelos)
function Viaje.conoce(id)
  local v = Viaje.conocidos()
  return v ~= nil and id ~= nil and v.npcs[id] == true
end

-- T1: id del maestro de vuelo de la base (de la facción del jugador) más cercano al punto del mundo `w` ({wx, wy, inst}),
-- si está a menos de CASAR yardas, como al apuntar los vuelos; nil si no hay ninguno tan cerca.
function Viaje.maestroCerca(w)
  if type(w) ~= "table" or type(w.wx) ~= "number" or type(w.wy) ~= "number" then
    return nil
  end
  local m, d = cercano(Viaje.maestros(letraDelJugador()), w)
  if m and d <= CASAR then
    return m.id
  end
  return nil
end

-- Los nombres de los vuelos apuntados (para la IA), ordenados, como mucho `max`.
function Viaje.nombresConocidos(max)
  local v = Viaje.conocidos()
  local salida = {}
  if not v then
    return salida
  end
  for id in pairs(v.npcs) do
    local nombre = v.nombres and v.nombres[id]
    if type(nombre) ~= "string" or nombre == "" then
      nombre = SNF.Datos.nombrePNJ(id)
    end
    salida[#salida + 1] = nombre
  end
  table.sort(salida)
  while max and #salida > max do
    table.remove(salida)
  end
  return salida
end

-- Los ids de PNJ de los vuelos aprendidos, de menor a mayor, como mucho `max`.
function Viaje.idsConocidos(max)
  local v = Viaje.conocidos()
  local salida = {}
  if not v then
    return salida
  end
  for id in pairs(v.npcs) do
    if type(id) == "number" then
      salida[#salida + 1] = id
    end
  end
  table.sort(salida)
  while max and #salida > max do
    table.remove(salida)
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Consejo
---------------------------------------------------------------------------------------------------

function Viaje.consejo(destino, yo)
  if type(destino) ~= "table" or type(yo) ~= "table" or yo.wx == nil then
    return nil
  end
  local w = destino.wx ~= nil and destino or SNF.Coord.aMundo(destino)
  if not w or w.inst == nil or w.inst ~= yo.inst then
    return nil
  end
  local directo = distancia(yo, w)
  if directo <= Viaje.LEJOS then
    return nil
  end
  local lista = Viaje.maestros(letraDelJugador())
  local conocidos = Viaje.conocidos()
  local origen, dOrigen = cercano(lista, yo)
  -- Con vuelos apuntados, el de llegada es el conocido más cercano al destino (y luego, a pie hasta el destino).
  local hasta, dHasta = cercano(lista, w, conocidos and conocidos.npcs or nil)
  if not origen or not hasta or origen == hasta then
    return nil
  end
  if dOrigen + dHasta >= directo * Viaje.AHORRO then
    return nil
  end
  return {origen = origen.id, hasta = hasta.id, mapa = hasta.mapa, w = origen.w, seguro = conocidos ~= nil}
end

local function nombreZona(mapa)
  local zonas = type(SNF_MISIONES) == "table" and type(SNF_MISIONES.zonas) == "table" and SNF_MISIONES.zonas.nombre
  local propio = type(zonas) == "table" and zonas[mapa]
  if type(propio) == "table" then
    return L.de({en = propio.en or propio.es, es = propio.es or propio.en})
  end
  local info = C_Map and C_Map.GetMapInfo and C_Map.GetMapInfo(mapa)
  return info and info.name or string.format("#%d", mapa)
end

Viaje.nombreZona = nombreZona

-- El texto de la flecha con consejo: a quién ir (el maestro de vuelo), a cuánto, a dónde volar y qué viene después.
function Viaje.textoFlecha(c, yardas, despues)
  local origen = SNF.Datos.nombrePNJ(c.origen)
  local lineas = {
    L.t(yardas <= Viaje.CERCA_MAESTRO and "FLECHA_HABLA_MAESTRO" or "FLECHA_MAESTRO", origen),
    L.t("FLECHA_DISTANCIA", SNF.Texto.numero(yardas)),
    L.t(c.seguro and "FLECHA_LUEGO_VUELA" or "FLECHA_LUEGO_VUELA_SI", nombreZona(c.mapa), SNF.Datos.nombrePNJ(c.hasta)),
  }
  if type(despues) == "string" and despues ~= "" then
    lineas[#lineas + 1] = L.t("FLECHA_DESPUES", despues)
  end
  return table.concat(lineas, "\n")
end

-- El consejo en una línea.
function Viaje.texto(c)
  return L.t(c.seguro and "FLECHA_VUELO_SEGURO" or "FLECHA_VUELO", SNF.Datos.nombrePNJ(c.origen), nombreZona(c.mapa),
    SNF.Datos.nombrePNJ(c.hasta))
end

SNF.escuchar("TAXIMAP_OPENED", function()
  Viaje.apuntar()
end)
