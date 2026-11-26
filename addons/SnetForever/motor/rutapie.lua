-- SnetForever: rutas a pie por caminos reales (11-nov). Un jugador siguió la flecha en línea recta desde Refugio Roca del Sol
-- hasta una montaña y tuvo que usar la piedra de hogar: «por eso pedí que dibujara la ruta». El juego no da a los addons
-- ningún mapa de caminos, así que se arma una red con lo que sí hay en los datos:
--   * las guías (SNF_RUTAS, derivadas de RestedXP): los goto/waypoint seguidos de cada guía son sitios por los que los
--     jugadores van andando de uno a otro (túneles y pasos de montaña incluidos), y los puntos de sus line y loop,
--     dibujados a mano por sus autores;
--   * los recorridos de los PNJ que andan (SNF_MISIONES.npc[id].waypoints, de Questie): van por las carreteras.
-- Dos puntos seguidos se unen si están a menos de ARISTA_GUIA (o ARISTA_PNJ) yardas: más lejos suele ser un vuelo, la
-- piedra de hogar o un barco. 16-nov: dos sitios de misión seguidos de una guía (ninguno es un punto de viaje), solo a
-- menos de ARISTA_SITIO: no son un camino. Los puntos que caen en la misma celda de CELDA yardas son el mismo nudo, y los nudos a
-- menos de UNIR yardas se unen entre sí: así se cruzan los caminos de guías distintas.
--
-- Campo a través, solo tramos cortos (12-nov). Primero se probó sin límite dentro de una zona (de Hachazo a Ordanus el
-- camino daba una vuelta de 2161 yd para 904 en línea recta), pero la línea recta cruzaba cortados que no se pueden
-- andar: el juego no da el relieve a los addons. Así que el jugador puede ir campo a través hasta LIBRE_MAX yardas a
-- cualquier nudo de su misma zona (no solo a los MAX_ENGANCHES más cercanos: en un pueblo serían todos del pueblo y no
-- el de la bajada), el destino igual desde la red, y el uno al otro si están así de cerca; lo demás va por la red, que
-- sigue por dónde pasan las guías. Las yardas campo a través pasadas las primeras ENGANCHE cuentan LIBRE veces. La zona
-- de un punto es la del nudo más cercano a menos de ZONA_RADIO yardas (cada nudo guarda el mapa del primer punto de los
-- datos que cayó en él).
--
-- RutaPie.buscar(desde, hasta) -> {puntos = {{wx, wy, inst}...}, largo} | nil
--   el camino más corto (A*) por la red y campo a través, del jugador al destino (coordenadas del mundo). nil si los dos
--   no están en el mismo continente o si no hay forma de unirlos.
-- RutaPie.seguir(yo, objetivo) -> apunta, restante | nil
--   para la flecha: guarda el camino hasta `objetivo` (lo recalcula si cambia el objetivo o el jugador se sale más de
--   SALIDA yardas, como mucho cada RECALCULO segundos) y devuelve el siguiente punto al que ir (al menos ADELANTE yardas
--   por delante) y las yardas que quedan por el camino. nil sin camino.
-- RutaPie.actual() -> puntos | nil   el camino que sigue la flecha (para dibujarlo en el mapa).
-- RutaPie.tramos(lista) -> {[k] = {puntos, largo} | false}   16-nov: el camino tramo a tramo entre puntos seguidos.
-- RutaPie.construir(inst)            arma la red de ese continente de una vez (la primera búsqueda la arma sola).
-- Emite SNF_RUTA_PIE cuando cambia el camino que se sigue.
local _, SNF = ...
local RutaPie = {}
SNF.RutaPie = RutaPie

local CELDA = 20 -- yardas: los puntos de la misma celda son un nudo
local UNIR = 35 -- yardas: nudos cercanos se unen
-- Yardas entre dos puntos seguidos de una guía. Los túneles y pasos entre zonas miden lo suyo (el Paso de Talondeep, de
-- Sierra Espolón a Vallefresno, unas 780 yd entre los dos goto de la guía); los vuelos, la piedra de hogar y los saltos
-- por muerte cortan el recorrido (CORTE).
-- 16-nov (en el juego, en Las Mil Agujas: la línea iba de Viento Libre a la cueva de las arpías, 838 yd, y a Nido Alto,
-- 848 yd, por encima de los cortados; regla del jugador: «mejor sin línea que una por donde no se puede ir»): un tramo
-- largo solo es camino si lo puso el autor para ir andando. Por eso cada punto dice de dónde sale:
--   * de viaje: el goto de un paso que solo es ir (no hace nada más que avisar: VIAJE; el «Entra en el Paso del Espolón»
--     de Talondeep), un waypoint y los puntos de line y loop. Un tramo que llega o sale de uno así une hasta ARISTA_GUIA;
--   * de sitio: el goto de un paso que acepta, entrega, hace un objetivo, habla con alguien… (también sus goto «paso»: en
--     RestedXP suelen ser los sitios de los bichos). Entre dos de estos, hasta ARISTA_SITIO, el tope campo a través.
local ARISTA_GUIA = 1000
local ARISTA_SITIO = 250
local CORTE = {fly = true, hs = true, deathskip = true}
-- Los elementos de un paso de solo ir: el sitio, el texto y las condiciones (sin nada que hacer allí).
local VIAJE = {["goto"] = true, waypoint = true, line = true, loop = true, nota = true, zone = true, subzone = true,
  zoneskip = true, subzoneskip = true, link = true, clicknext = true, pin = true, isOnQuest = true, isNotOnQuest = true,
  isQuestComplete = true, isQuestNotComplete = true, isQuestTurnedIn = true, isQuestAvailable = true}
local ARISTA_PNJ = 150 -- yardas entre dos puntos seguidos del recorrido de un PNJ
local ENGANCHE = 250 -- yardas entre el jugador (o el destino) y la red
local SALIDA = 120
local RECALCULO = 3
local ADELANTE = 30
local ALCANCE = 150 -- yardas: los puntos del camino por los que la flecha puede entrar en él
local MAX_ENGANCHES = 6
local LIBRE = 1.3 -- cada yarda campo a través (pasadas las primeras ENGANCHE) cuenta como LIBRE yardas de camino
local ZONA_RADIO = 400 -- yardas: la zona de un punto es la del nudo más cercano a menos de esto
-- 12-nov, segunda vez (en el juego, con las capturas marcadas: «las líneas rojas son desnivel, un jugador no puede ir
-- por ese camino»): campo a través sin límite cruzaba el cortado del Puesto del Hachazo y la pared en herradura del otro
-- lado del río. El juego no da a los addons el relieve, así que campo a través solo vale para tramos cortos, lo justo
-- para llegar del jugador a la red (o de la red al destino); lo largo va por los caminos de las guías, que sí saben por
-- dónde se baja (la guía de Vallefresno: «Corre por el borde del río hasta aquí»).
local LIBRE_MAX = 250 -- yardas: el tramo campo a través más largo

RutaPie.redes = {} -- [inst] = {x = {}, y = {}, vecinos = {}, celdas = {}, n}

local floor, sqrt = math.floor, math.sqrt

local function clave(cx, cy)
  return cx * 100000 + cy
end

local function distancia(ax, ay, bx, by)
  local dx, dy = ax - bx, ay - by
  return sqrt(dx * dx + dy * dy)
end

---------------------------------------------------------------------------------------------------
-- La red
---------------------------------------------------------------------------------------------------

local function nuevaRed()
  return {x = {}, y = {}, vecinos = {}, celdas = {}, zona = {}, n = 0}
end

-- El nudo de la celda de (wx, wy), creándolo si no hay.
local function nudo(red, wx, wy, zona)
  local cx, cy = floor(wx / CELDA), floor(wy / CELDA)
  local k = clave(cx, cy)
  local i = red.celdas[k]
  if i then
    if red.zona[i] == nil then
      red.zona[i] = zona
    end
    return i
  end
  i = red.n + 1
  red.n = i
  red.x[i], red.y[i], red.vecinos[i], red.zona[i] = wx, wy, {}, zona
  red.celdas[k] = i
  return i
end

local function unir(red, a, b)
  if a == b then
    return
  end
  local va = red.vecinos[a]
  for _, v in ipairs(va) do
    if v == b then
      return
    end
  end
  va[#va + 1] = b
  local vb = red.vecinos[b]
  vb[#vb + 1] = a
end

-- Añade un recorrido (lista de puntos del mundo) uniendo los seguidos que están a menos de `maximo` yardas. Con
-- `maximoSitio` (las guías), dos seguidos que no son de viaje (w.viaje) solo se unen a menos de `maximoSitio`.
local function recorrido(red, puntos, maximo, maximoSitio)
  local anterior, ax, ay, aviaje
  for k = 1, #puntos do
    local w = puntos[k]
    if w == false then
      anterior = nil
    else
      local i = nudo(red, w.wx, w.wy, w.zona)
      local tope = (maximoSitio == nil or aviaje or w.viaje) and maximo or maximoSitio
      if anterior and distancia(ax, ay, w.wx, w.wy) <= tope then
        unir(red, anterior, i)
      end
      anterior, ax, ay, aviaje = i, w.wx, w.wy, w.viaje
    end
  end
end

-- Un punto de los datos en el mundo, sin la caché de Coord.aMundo (serían decenas de miles de tablas guardadas).
local function aMundo(p)
  if type(p) ~= "table" then
    return nil
  end
  if type(p.wx) == "number" and type(p.wy) == "number" then
    return {wx = p.wx, wy = p.wy, inst = p.inst, zona = p.mapa}
  end
  local ok, wx, wy, inst = pcall(SNF.Coord.mundo, p.mapa, p.x, p.y)
  if ok and wx then
    return {wx = wx, wy = wy, inst = inst, zona = p.mapa}
  end
  return nil
end

-- ¿El paso solo es ir a un sitio (todos sus elementos son de VIAJE)?
local function soloIr(elementos)
  for _, e in ipairs(elementos) do
    if type(e) ~= "table" or not VIAJE[e.t] then
      return false
    end
  end
  return true
end

-- Los puntos de una guía en orden (goto, waypoint y los de line y loop), en el mundo y de esa instancia. Cada uno lleva
-- viaje = true si es de viaje (ver ARISTA_SITIO).
local function puntosDeGuia(guia, inst)
  local salida = {}
  local function meter(p, viaje)
    local w = aMundo(p)
    if w and w.inst == inst then
      w.viaje = viaje
      salida[#salida + 1] = w
    elseif w then
      salida[#salida + 1] = false -- otro continente: el recorrido se corta
    end
  end
  for _, paso in ipairs(type(guia.pasos) == "table" and guia.pasos or {}) do
    local elementos = type(paso.elementos) == "table" and paso.elementos or {}
    local deViaje = soloIr(elementos)
    for _, e in ipairs(elementos) do
      if CORTE[e.t] then
        salida[#salida + 1] = false -- un vuelo, la piedra de hogar o morir: el camino a pie se corta aquí
      elseif e.t == "goto" then
        meter(e, deViaje)
      elseif e.t == "waypoint" then
        meter(e, true)
      elseif (e.t == "line" or e.t == "loop") and type(e.puntos) == "table" then
        for _, p in ipairs(e.puntos) do
          meter(p, true)
        end
      end
    end
  end
  return salida
end

function RutaPie.construir(inst)
  if inst == nil then
    return nil
  end
  local red = RutaPie.redes[inst]
  if red then
    return red
  end
  red = nuevaRed()
  local rutas = rawget(_G, "SNF_RUTAS")
  if type(rutas) == "table" and type(rutas.guias) == "table" then
    for _, guia in pairs(rutas.guias) do
      if type(guia) == "table" then
        recorrido(red, puntosDeGuia(guia, inst), ARISTA_GUIA, ARISTA_SITIO)
      end
    end
  end
  local misiones = rawget(_G, "SNF_MISIONES")
  if type(misiones) == "table" and type(misiones.npc) == "table" then
    for _, npc in pairs(misiones.npc) do
      if type(npc) == "table" and type(npc.waypoints) == "table" then
        for mapa, rutasPnj in pairs(npc.waypoints) do
          if type(mapa) == "number" and type(rutasPnj) == "table" then
            for _, r in ipairs(rutasPnj) do
              local puntos = {}
              for _, p in ipairs(type(r) == "table" and r or {}) do
                if type(p) == "table" and type(p[1]) == "number" and type(p[2]) == "number" then
                  local w = aMundo({mapa = mapa, x = p[1], y = p[2]})
                  if w and w.inst == inst then
                    puntos[#puntos + 1] = w
                  end
                end
              end
              recorrido(red, puntos, ARISTA_PNJ)
            end
          end
        end
      end
    end
  end
  -- Nudos cercanos (en celdas vecinas) se unen: así se cruzan los caminos.
  for i = 1, red.n do
    local cx, cy = floor(red.x[i] / CELDA), floor(red.y[i] / CELDA)
    for dx = -2, 2 do
      for dy = -2, 2 do
        local j = red.celdas[clave(cx + dx, cy + dy)]
        if j and j > i and distancia(red.x[i], red.y[i], red.x[j], red.y[j]) <= UNIR then
          unir(red, i, j)
        end
      end
    end
  end
  RutaPie.redes[inst] = red
  return red
end

-- Los nudos a menos de ENGANCHE yardas de (wx, wy), los más cercanos primero (como mucho MAX_ENGANCHES).
local function enganches(red, wx, wy)
  local cx, cy = floor(wx / CELDA), floor(wy / CELDA)
  local r = math.ceil(ENGANCHE / CELDA)
  local lista = {}
  for dx = -r, r do
    for dy = -r, r do
      local i = red.celdas[clave(cx + dx, cy + dy)]
      if i then
        local d = distancia(wx, wy, red.x[i], red.y[i])
        if d <= ENGANCHE then
          lista[#lista + 1] = {i = i, d = d}
        end
      end
    end
  end
  table.sort(lista, function(a, b)
    return a.d < b.d
  end)
  while #lista > MAX_ENGANCHES do
    table.remove(lista)
  end
  return lista
end

---------------------------------------------------------------------------------------------------
-- A*
---------------------------------------------------------------------------------------------------

-- Montículo binario de nudos por f.
local function empujar(h, f, i)
  local n = #h + 1
  h[n] = i
  while n > 1 do
    local p = floor(n / 2)
    if f[h[p]] <= f[h[n]] then
      break
    end
    h[p], h[n] = h[n], h[p]
    n = p
  end
end

local function sacar(h, f)
  local primero = h[1]
  local ultimo = table.remove(h)
  if #h > 0 then
    h[1] = ultimo
    local n = 1
    while true do
      local a, b = n * 2, n * 2 + 1
      local menor = n
      if a <= #h and f[h[a]] < f[h[menor]] then
        menor = a
      end
      if b <= #h and f[h[b]] < f[h[menor]] then
        menor = b
      end
      if menor == n then
        break
      end
      h[menor], h[n] = h[n], h[menor]
      n = menor
    end
  end
  return primero
end

-- Lo que cuesta ir campo a través d yardas: las primeras ENGANCHE, como por camino; el resto, LIBRE veces.
local function libre(d)
  if d <= ENGANCHE then
    return d
  end
  return ENGANCHE + (d - ENGANCHE) * LIBRE
end

-- La zona (el mapa de los datos) del nudo más cercano a menos de ZONA_RADIO yardas, o nil.
local function zonaDe(red, wx, wy)
  local cx, cy = floor(wx / CELDA), floor(wy / CELDA)
  local r = math.ceil(ZONA_RADIO / CELDA)
  local zona, dMin
  for ddx = -r, r do
    for ddy = -r, r do
      local i = red.celdas[clave(cx + ddx, cy + ddy)]
      if i and red.zona[i] ~= nil then
        local d = distancia(wx, wy, red.x[i], red.y[i])
        if d <= ZONA_RADIO and (dMin == nil or d < dMin) then
          zona, dMin = red.zona[i], d
        end
      end
    end
  end
  return zona
end

function RutaPie.buscar(desde, hasta)
  if type(desde) ~= "table" or type(hasta) ~= "table" or desde.wx == nil or hasta.wx == nil then
    return nil
  end
  if desde.inst == nil or desde.inst ~= hasta.inst then
    return nil
  end
  local red = RutaPie.construir(desde.inst)
  if not red or red.n == 0 then
    return nil
  end
  local dx, dy, hx, hy = desde.wx, desde.wy, hasta.wx, hasta.wy
  local zonaDesde, zonaHasta = zonaDe(red, dx, dy), zonaDe(red, hx, hy)
  -- Salidas (jugador -> nudo) y llegadas (nudo -> destino): los nudos a menos de ENGANCHE yardas, de cualquier zona, y
  -- los de la misma zona a menos de LIBRE_MAX yardas, campo a través.
  local g, f, de, cerrado, h = {}, {}, {}, {}, {}
  local final = {} -- [nudo] = coste del nudo al destino
  local function salida(i, coste)
    if g[i] == nil or coste < g[i] then
      g[i] = coste
      f[i] = coste + distancia(red.x[i], red.y[i], hx, hy)
      empujar(h, f, i)
    end
  end
  for _, s in ipairs(enganches(red, dx, dy)) do
    salida(s.i, s.d)
  end
  for _, l in ipairs(enganches(red, hx, hy)) do
    final[l.i] = l.d
  end
  for i = 1, red.n do
    local z = red.zona[i]
    if z ~= nil then
      if z == zonaDesde then
        local d = distancia(dx, dy, red.x[i], red.y[i])
        if d <= LIBRE_MAX then
          salida(i, libre(d))
        end
      end
      if z == zonaHasta then
        local d = distancia(red.x[i], red.y[i], hx, hy)
        if d <= LIBRE_MAX then
          local c = libre(d)
          if final[i] == nil or c < final[i] then
            final[i] = c
          end
        end
      end
    end
  end
  -- Derecho del jugador al destino, si están en la misma zona y a menos de LIBRE_MAX yardas.
  local mejor, mejorTotal
  local recta = distancia(dx, dy, hx, hy)
  if zonaDesde ~= nil and zonaDesde == zonaHasta and recta <= LIBRE_MAX then
    mejor, mejorTotal = false, libre(recta)
  end
  while #h > 0 do
    local i = sacar(h, f)
    if not cerrado[i] then
      cerrado[i] = true
      if mejorTotal and f[i] >= mejorTotal then
        break
      end
      if final[i] then
        local total = g[i] + final[i]
        if not mejorTotal or total < mejorTotal then
          mejor, mejorTotal = i, total
        end
      end
      local xi, yi = red.x[i], red.y[i]
      for _, j in ipairs(red.vecinos[i]) do
        if not cerrado[j] then
          local gj = g[i] + distancia(xi, yi, red.x[j], red.y[j])
          if g[j] == nil or gj < g[j] then
            g[j], de[j] = gj, i
            f[j] = gj + distancia(red.x[j], red.y[j], hx, hy)
            empujar(h, f, j)
          end
        end
      end
    end
  end
  if mejor == nil then
    return nil
  end
  local nudos = {}
  local i = mejor or nil
  while i do
    table.insert(nudos, 1, i)
    i = de[i]
  end
  local puntos = {{wx = desde.wx, wy = desde.wy, inst = desde.inst}}
  for _, n in ipairs(nudos) do
    puntos[#puntos + 1] = {wx = red.x[n], wy = red.y[n], inst = desde.inst}
  end
  puntos[#puntos + 1] = {wx = hasta.wx, wy = hasta.wy, inst = hasta.inst}
  return {puntos = puntos, largo = mejorTotal}
end

---------------------------------------------------------------------------------------------------
-- Tramo a tramo (las líneas de las rutas de la IA)
---------------------------------------------------------------------------------------------------

-- 16-nov (regla del jugador: «mejor sin línea que una por donde no se puede ir»): las líneas de ruta de los dibujos y la
-- de la ruta de la IA del mapa van por el camino a pie, no en recta de parada a parada.
-- RutaPie.tramos(lista) -> {[k] = {puntos, largo} | false} para k = 1 … #lista - 1: el camino de lista[k] a lista[k+1]
-- (puntos {wx, wy, inst} o {mapa, x, y}); false sin camino conocido (o un punto sin sitio en el mundo). Cada par se
-- memoriza (redondeado a la yarda; como mucho MAX_MEMO pares, luego se empieza de cero) y se buscan como mucho
-- MAX_TRAMOS por llamada (los demás, false).
local MAX_TRAMOS = 40
local MAX_MEMO = 400
local memoTramos, enMemo = {}, 0

local function enElMundo(p)
  if type(p) ~= "table" then
    return nil
  end
  if type(p.wx) == "number" and type(p.wy) == "number" then
    return p
  end
  local ok, w = pcall(SNF.Coord.aMundo, p)
  return ok and type(w) == "table" and w.wx and w or nil
end

function RutaPie.tramos(lista)
  local salida = {}
  if type(lista) ~= "table" then
    return salida
  end
  for k = 1, #lista - 1 do
    local a, b = enElMundo(lista[k]), enElMundo(lista[k + 1])
    local tramo = false
    if a and b and k <= MAX_TRAMOS then
      local c = string.format("%s|%d|%d|%s|%d|%d", tostring(a.inst), floor(a.wx + 0.5), floor(a.wy + 0.5), tostring(b.inst),
        floor(b.wx + 0.5), floor(b.wy + 0.5))
      tramo = memoTramos[c]
      if tramo == nil then
        tramo = RutaPie.buscar(a, b) or false
        if enMemo >= MAX_MEMO then
          memoTramos, enMemo = {}, 0
        end
        memoTramos[c], enMemo = tramo, enMemo + 1
      end
    end
    salida[k] = tramo
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Seguir el camino (la flecha)
---------------------------------------------------------------------------------------------------

local sigue = {} -- {objetivo = {wx, wy, inst}, puntos, indice, cuando, sinCamino}

local function mismoObjetivo(a, b)
  return a and b and a.inst == b.inst and distancia(a.wx, a.wy, b.wx, b.wy) < 5
end

local function ahora()
  local f = rawget(_G, "GetTime")
  return type(f) == "function" and f() or 0
end

-- El camino que sigue la flecha y el índice del punto al que va ahora (el mapa lo dibuja desde el jugador hasta ahí).
function RutaPie.actual()
  return sigue.puntos, sigue.indice or 1
end

function RutaPie.olvidar()
  local habia = sigue.puntos ~= nil
  sigue = {}
  if habia then
    SNF.emitir("SNF_RUTA_PIE")
  end
end

-- Distancia del jugador al tramo a-b y dónde cae sobre él: d, t (0 en a, 1 en b), px, py.
local function aTramo(yo, a, b)
  local ux, uy = b.wx - a.wx, b.wy - a.wy
  local largo2 = ux * ux + uy * uy
  if largo2 == 0 then
    return distancia(yo.wx, yo.wy, a.wx, a.wy), 0, a.wx, a.wy
  end
  local t = ((yo.wx - a.wx) * ux + (yo.wy - a.wy) * uy) / largo2
  local tc = math.max(0, math.min(1, t))
  local px, py = a.wx + ux * tc, a.wy + uy * tc
  return distancia(yo.wx, yo.wy, px, py), t, px, py
end

function RutaPie.seguir(yo, objetivo)
  if type(yo) ~= "table" or type(objetivo) ~= "table" or yo.wx == nil or objetivo.wx == nil then
    return nil
  end
  local t = ahora()
  local cambiaObjetivo = not mismoObjetivo(sigue.objetivo, objetivo)
  local puntos = sigue.puntos
  -- El punto (o el tramo) del camino más cercano al jugador, desde el que iba (como mucho 40 por delante). En medio
  -- de un tramo largo, lo cerca que está es lo cerca que está del tramo, no de sus puntos.
  local indice, dCerca
  if puntos and not cambiaObjetivo then
    for k = math.max(1, (sigue.indice or 1) - 2), math.min(#puntos, (sigue.indice or 1) + 40) do
      local d = distancia(yo.wx, yo.wy, puntos[k].wx, puntos[k].wy)
      if dCerca == nil or d < dCerca then
        indice, dCerca = k, d
      end
      if k < #puntos then
        local dt, tt = aTramo(yo, puntos[k], puntos[k + 1])
        if tt > 0 and tt < 1 and dt < dCerca then
          indice, dCerca = k + 1, dt
        end
      end
    end
  end
  local salido = puntos and dCerca and dCerca > SALIDA
  if cambiaObjetivo or ((salido or not puntos) and t - (sigue.cuando or -RECALCULO) >= RECALCULO) then
    local r = RutaPie.buscar(yo, objetivo)
    local habia = sigue.puntos ~= nil
    sigue = {objetivo = {wx = objetivo.wx, wy = objetivo.wy, inst = objetivo.inst}, puntos = r and r.puntos or nil,
      indice = 1, cuando = t}
    -- Solo se avisa (y el mapa se redibuja) si hay camino nuevo o se quita el que había: sin camino antes ni ahora, nada.
    if habia or sigue.puntos then
      SNF.emitir("SNF_RUTA_PIE")
    end
    puntos, indice = sigue.puntos, 1
  end
  if not puntos then
    return nil
  end
  -- Lo que queda de camino desde cada punto (una vez por camino).
  local resto = sigue.resto
  if not resto then
    resto = {[#puntos] = 0}
    for k = #puntos - 1, 1, -1 do
      resto[k] = resto[k + 1] + distancia(puntos[k].wx, puntos[k].wy, puntos[k + 1].wx, puntos[k + 1].wy)
    end
    sigue.resto = resto
  end
  -- 12-nov (en el juego: «la misión está en una dirección y la flecha me manda hacia atrás»): el camino podía empezar
  -- enganchado a un punto de la red que quedaba detrás. Ahora se entra al camino por el punto, de los que están a menos de
  -- ALCANCE yardas (y no antes del que se iba), que deja menos recorrido: lo que hay hasta él más lo que queda desde él.
  -- Un rodeo por detrás se salta solo. Sin ninguno a mano, el más cercano, como antes.
  local desde = sigue.indice or 1
  local mejor, mejorCoste
  for k = desde, #puntos do
    local d = distancia(yo.wx, yo.wy, puntos[k].wx, puntos[k].wy)
    if d <= ALCANCE then
      local coste = d + resto[k]
      if mejorCoste == nil or coste < mejorCoste then
        mejor, mejorCoste = k, coste
      end
    end
  end
  -- 12-nov, otra vez (en el juego, bajando del Puesto del Hachazo al río por su cuenta: «me manda en reversa, hasta
  -- la flecha»): yendo por un tramo largo, el punto de detrás estaba a mano y el de delante no, y la flecha volvía al de
  -- detrás. Ahora también se entra por el tramo: si el jugador cae dentro de un tramo (ni antes de su principio ni
  -- después de su final) a menos de ALCANCE yardas, cuenta lo que hay hasta el tramo más lo que queda desde allí, y la
  -- flecha apunta al final del tramo.
  for k = math.max(1, desde - 1), #puntos - 1 do
    local d, tt, px, py = aTramo(yo, puntos[k], puntos[k + 1])
    if tt > 0 and tt < 1 and d <= ALCANCE then
      local b = puntos[k + 1]
      local coste = d + distancia(px, py, b.wx, b.wy) + resto[k + 1]
      if mejorCoste == nil or coste < mejorCoste then
        mejor, mejorCoste = k + 1, coste
      end
    end
  end
  mejor = mejor or indice or desde
  -- Encima del punto (a menos de ADELANTE yardas): al siguiente.
  while mejor < #puntos and distancia(yo.wx, yo.wy, puntos[mejor].wx, puntos[mejor].wy) < ADELANTE do
    mejor = mejor + 1
  end
  sigue.indice = mejor
  local p = puntos[mejor]
  return p, distancia(yo.wx, yo.wy, p.wx, p.wy) + resto[mejor]
end
