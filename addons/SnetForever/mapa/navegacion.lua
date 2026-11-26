-- SnetForever: navegación. Saca los puntos de la guía (pines), elige el destino de la flecha y comprueba la llegada
-- (plano 3 §2.4-2.6; plano 2 §4, tabla «Radio y 5.º argumento»).
--
-- Navegacion.puntosDeGuia() -> Punto[]   goto, waypoint, pin y vértices de loop de los pasos activos (y del actual
--     si espera) y de los siguientes, hasta pines.cuantos pasos. En los pasos activos no salen los puntos alcanzados
--     ni los de padre hecho. orden = número del paso en la lista de la ventana (pv.numero, lote C; nil en un paso
--     que no sale en ella); etiqueta = texto del elemento (o del tooltip del pin) o, si no tiene, el de su padre;
--     tipo = t del elemento; q = misión del elemento o del padre. Además: paso (índice en el
--     motor), k (índice del elemento en el paso), vertice (en los loop), modo, radio y sinPin (waypoint y modo
--     "paso", que en RestedXP no llevan pin). Los puntos en % traen también wx, wy e inst.
-- Navegacion.destino() -> {punto, distancia, angulo, otroContinente?}|nil
--     1. Si hay Capa.ruta(), su primer punto sin alcanzar y sin fin de parada hecho (Navegacion.ponerFinDeParada(fn):
--        fn(p) == true salta la parada, false no deja alcanzarla por distancia, nil la deja por distancia).
--     2. Si no, de los goto/waypoint de los pasos activos (en orden), los que no están alcanzados ni tienen el padre
--        hecho y no son de modo "pin": el primero de modo normal; si antes aparece uno "cercano", el más próximo de
--        todos los "cercano"; los "baja" solo si no hay otro.
--        Los goto de completar traen `objetivo = k` (fase 3): no cuentan si ese objetivo está cumplido (el `complete`
--        de ese k en el paso está hecho, también a mano; sin él, Misiones.objetivo(q, k) terminado), salvo que el
--        juego dé para k un tipo que no casa con el de la base (el índice no es fiable: no se salta) o que se
--        saltarían todos los de su paso y quedan `complete` pendientes (entonces cuentan todos, como antes). Si el
--        primero de modo normal es uno de esos, va el más próximo de los de su paso con objetivo en el continente
--        (instancia) del jugador; si ninguno está en él, ese primero. Los pines del paso activo siguen la misma regla
--        y los iguales del mismo paso salen una vez.
--        T2: un paso activo con una entrega a medias (Elementos.entregaAMedias: la misión está en el diario y no está
--        completa) no manda a sus goto (el PNJ de entrega): da los sitios de los objetivos sin terminar (los de su extra,
--        Elementos.faltanDe, cuyo tipo casa con la base) que traen los datos (Datos.sitiosObjetivo), y de ellos va el
--        más próximo en la instancia del jugador (si ninguno está en ella, el primero). Sin ningún sitio en los datos, ese
--        paso no da destino: nunca se inventa un punto ni se manda al PNJ mientras falten objetivos. Mientras tanto, sus
--        goto tampoco se alcanzan (comprobarLlegada). Sus pines siguen en el mapa.
--        Ronda 1 (I1): solo si en el paso no queda nada que se pueda hacer ya en el PNJ (un turnin pendiente de una
--        misión completa o un accept pendiente). Si queda, la flecha va a sus goto como siempre (el texto sigue enseñando
--        lo que le falta a la entrega a medias) y, en cuanto eso se hace, pasa a los objetivos.
--     nil dentro de una instancia (IsInInstance) o sin posición del jugador. Con el punto en otra instancia,
--     otroContinente = true (sin distancia ni ángulo).
--     Navegacion.destino(salida) escribe el resultado en la tabla `salida` y la devuelve, sin crear tablas (la flecha).
--     La ruta recuerda por dónde va: empieza a buscar en la primera parada que no se ha alcanzado (I1).
-- Navegacion.medir(salida) -> salida|nil   vuelve a medir distancia, ángulo y otroContinente hasta salida.punto (el
--     de la última búsqueda) desde donde está ahora el jugador, sin buscar otro destino; nil dentro de una instancia,
--     sin posición o sin salida.punto.
-- Navegacion.comprobarLlegada()   cada 0,3 s (temporizador propio desde SNF_GUIA_CARGADA o SNF_PUNTOS_CAMBIADOS):
--     * un goto/waypoint con radio > 0 se alcanza a distancia <= radio (Motor.marcarAlcanzado: mem.alcanzado y
--       progreso.alcanzados, como RXPCData.completedWaypoints, plano 3 §2.5); los de modo "paso" y los
--       sin pin solo si son el destino actual; un goto "objetivo" pasa a hecho con Motor.marcarLlegado (mem.llegado y
--       progreso.llegados, que sobreviven a /reload);
--     * el punto de la ruta que es el destino se alcanza a distancia <= su radio (RADIO_RUTA si no tiene), salvo que
--       el fin de parada (Navegacion.ponerFinDeParada) dé false para él;
--     * en un paso con #loop, cuando todos sus puntos con radio están alcanzados, se borran las marcas y vuelve
--       a empezar;
--     * por cada punto alcanzado emite SNF_LLEGADA(punto) y vuelve a poner la capa "guia" con puntosDeGuia().
-- Navegacion.parar(), Navegacion.reanudar()   quitan y vuelven a poner ese temporizador (PLAYER_LEAVING_WORLD y la vuelta
--     al mundo, arranque.lua). Parado, ni SNF_GUIA_CARGADA ni SNF_PUNTOS_CAMBIADOS lo ponen hasta reanudar().
-- Registra el evaluador de goto: un goto "objetivo" es hecho con mem.llegado (si no, pendiente); los demás, info.
--
-- Marca de alcanzado de un elemento: mem.alcanzado (true, false tras reiniciar un #loop, o nil = la de mem.llegado).
-- Se guarda en progreso.alcanzados[id][k] (el reinicio de #loop la borra) y el motor la recupera al activar el paso.
-- Un punto de la ruta se marca en una tabla propia (no se guarda).
local _, SNF = ...
local Navegacion = {}
SNF.Navegacion = Navegacion

local Coord = SNF.Coord
local Capa = SNF.Capa
local Eventos = SNF.Eventos
local Elementos = SNF.Elementos
local Ajustes = SNF.Ajustes
local L = SNF.L

local PERIODO = 0.3 -- segundos entre comprobaciones de llegada (CycleZero de RestedXP, plano 3 §2.3)
local RADIO_RUTA = 10 -- yardas para dar por alcanzado un punto de la ruta que no trae radio
local CUANTOS_DEFECTO = 7

local CON_FLECHA = {["goto"] = true, waypoint = true}
local SIN_ELEMENTOS = {}
local CON_PIN = {["goto"] = true, waypoint = true, pin = true}

local puntosDe = setmetatable({}, {__mode = "k"}) -- [elemento vivo] = Punto, o lista de Punto en los loop
local padres = setmetatable({}, {__mode = "k"}) -- [elemento vivo] = elemento vivo del padre, o false
local rutaAlcanzada = setmetatable({}, {__mode = "k"}) -- [Punto de la ruta] = true

local function Motor()
  return SNF.Motor
end

---------------------------------------------------------------------------------------------------
-- Evaluador de goto.
---------------------------------------------------------------------------------------------------

Elementos.registrar("goto", {
  campos = {"mapa", "modo"},
  opcionales = {"x", "y", "inst", "wx", "wy", "radio", "padre", "objetivo"},
  eventos = {},
  -- T1: solo informa salvo en modo objetivo, que se completa al llegar (mem.llegado): ese no es puro.
  puro = function(el)
    return el.modo ~= "objetivo"
  end,
  evaluar = function(el, mem)
    if el.modo == "objetivo" then
      if mem and mem.llegado then
        return "hecho"
      end
      return "pendiente"
    end
    return "info"
  end,
})

---------------------------------------------------------------------------------------------------
-- Elementos vivos del motor: padre, marca de alcanzado y puntos.
---------------------------------------------------------------------------------------------------

-- Elemento vivo del padre (el campo padre de los datos es el índice desde 0 en datos.elementos), o nil si no tiene
-- o no está para este personaje.
local function padreDe(pv, e)
  local p = padres[e]
  if p == nil then
    p = false
    local indice = tonumber(e.datos.padre)
    local datos = indice and pv.datos.elementos and pv.datos.elementos[indice + 1]
    if datos then
      for _, otro in ipairs(pv.elementos) do
        if otro.datos == datos then
          p = otro
          break
        end
      end
    end
    padres[e] = p
  end
  return p or nil
end

local function padreHecho(pv, e)
  local p = padreDe(pv, e)
  return p ~= nil and p.resultado == "hecho"
end

-- Lo que dice el diario del objetivo k de q, leído una vez y guardado hasta el siguiente cambio de misiones o de pasos
-- (QUEST_LOG_UPDATE, aceptar, entregar, quitar, SNF_PASOS_CAMBIADOS, otra guía): la flecha corre en cada fotograma.
--   casa:      false si el juego da para k un tipo que no es el que espera la base (monster, object, item; event para
--              la exploración que va detrás de los objetivos del registro).
--   terminado: el objetivo k está terminado.
local diario = {} -- [q] = {[k] = {casa, terminado}}

local function olvidarDiario()
  diario = {}
end

for _, evento in ipairs({"QUEST_LOG_UPDATE", "QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "SNF_PASOS_CAMBIADOS",
  "SNF_GUIA_CARGADA"}) do
  Eventos.escuchar(evento, olvidarDiario)
end

local function delDiario(q, k)
  local porQ = diario[q]
  if not porQ then
    porQ = {}
    diario[q] = porQ
  end
  local info = porQ[k]
  if info == nil then
    local M = SNF.Misiones
    local o = M.objetivo(q, k)
    info = {
      casa = M.casaConBase(q, k, o or false),
      terminado = o ~= nil and o.terminado == true,
    }
    porQ[k] = info
  end
  return info
end

-- Un goto de completar (`objetivo = k`) cuyo objetivo ya está cumplido: el `complete` de ese k en el paso está hecho
-- (marcado a mano cuenta siempre); si el paso no tiene ese `complete`, el diario lo da por terminado. Con un tipo que
-- no casa (delDiario), no está cumplido. Sin tablas nuevas salvo al leer el diario.
local function objetivoCumplido(pv, el)
  local k = el.objetivo
  if k == nil then
    return false
  end
  local q, hecho
  for _, otro in ipairs(pv.elementos) do
    local d = otro.datos
    if d.t == "complete" and d.objetivo == k then
      if otro.mem and otro.mem.forzado then
        return true
      end
      q, hecho = d.q, otro.resultado == "hecho"
      break
    end
  end
  if q then
    return hecho and delDiario(q, k).casa
  end
  for _, otro in ipairs(pv.elementos) do
    if otro.datos.t == "complete" and otro.datos.q then
      q = otro.datos.q
      break
    end
  end
  if not q then
    return false
  end
  local info = delDiario(q, k)
  return info.casa and info.terminado
end

local function alcanzado(e)
  local a = e.mem and e.mem.alcanzado
  if a == nil then
    return e.mem ~= nil and e.mem.llegado == true
  end
  return a
end

-- Si en el paso se pueden saltar los goto de objetivos cumplidos: queda algún destino sin cumplir (un goto con
-- objetivo sin cumplir, o un goto/waypoint con flecha sin objetivo, como la exploración de una misión con reputación,
-- que no está alcanzado ni tiene el padre hecho), o no queda ningún `complete` pendiente. Si se saltarían todos y aún
-- falta algún objetivo (sin goto propio, por el tope o sin punto), cuentan todos: la flecha no se queda sin destino.
local function saltaObjetivos(pv)
  local pendiente = false
  for _, e in ipairs(pv.elementos) do
    local d = e.datos
    if CON_FLECHA[d.t] and d.modo ~= "pin" then
      if d.objetivo ~= nil then
        if not objetivoCumplido(pv, d) then
          return true
        end
      elseif not alcanzado(e) and not padreHecho(pv, e) then
        return true
      end
    elseif d.t == "complete" and e.resultado ~= "hecho" and e.resultado ~= "info" then
      pendiente = true
    end
  end
  return not pendiente
end

-- 12-nov (en el juego: con la Cabeza de Shadumbra en la bolsa, la flecha seguía mandando a 407 yd y el jugador creía
-- que el paso no se actualizaba): si lo único que le queda al paso activo es aceptar misiones que inicia un objeto y el
-- jugador ya lo lleva, no hay que ir a ningún sitio: el paso no da destino a la flecha (ni pines), y su texto dice que se
-- acepta con clic derecho en el objeto.
local function soloUsarObjeto(pv)
  if not pv.activo then
    return false
  end
  local Datos = SNF.Datos
  local cuenta = rawget(_G, "GetItemCount")
  if not (Datos and Datos.objetosQueInician and type(cuenta) == "function") then
    return false
  end
  -- Todos los elementos pendientes tienen que ser «acepta» de una misión que inicia un objeto que se lleva.
  local alguno = false
  for _, e in ipairs(pv.elementos) do
    if e.resultado == "pendiente" then
      if e.datos.t ~= "accept" then
        return false
      end
      local lleva = false
      for _, id in ipairs(Datos.objetosQueInician(e.datos.q) or SIN_ELEMENTOS) do
        if (cuenta(id) or 0) > 0 then
          lleva = true
          break
        end
      end
      if not lleva then
        return false
      end
      alguno = true
    end
  end
  return alguno
end

-- 12-nov: un paso que no se puede hacer (motor/pasos.lua, Motor.noDisponible) no da pines ni ruta.
local function sinDestino(pv)
  if soloUsarObjeto(pv) then
    return true
  end
  local M = Motor()
  return M.noDisponible ~= nil and M.noDisponible(pv) ~= nil
end

local function radioDe(el)
  local r = tonumber(el.radio)
  if r and r > 0 then
    return r
  end
  return nil
end

local function textoDe(t)
  if t == nil then
    return nil
  end
  return L.de(t)
end

-- Punto de la fuente (el elemento o un vértice de loop) para el elemento k del paso.
local function nuevoPunto(pv, k, e, fuente, vertice)
  local el = e.datos
  local p = {
    mapa = fuente.mapa, x = fuente.x, y = fuente.y, inst = fuente.inst, wx = fuente.wx, wy = fuente.wy,
    tipo = el.t, orden = pv.numero, origen = "guia", paso = pv.i, k = k, vertice = vertice,
    modo = el.modo, radio = tonumber(el.radio), sinPin = el.sinPin == true or el.modo == "paso",
  }
  if p.wx == nil then
    local w = Coord.aMundo(fuente)
    if w then
      p.wx, p.wy, p.inst = w.wx, w.wy, w.inst
    end
  end
  local padre = padreDe(pv, e)
  p.etiqueta = textoDe(el.tooltip) or textoDe(el.texto) or (padre and textoDe(padre.datos.texto))
  p.q = el.q or (padre and padre.datos.q)
  return p
end

local function iguales(a, b)
  return a.mapa == b.mapa and a.x == b.x and a.y == b.y and a.wx == b.wx and a.wy == b.wy
end

-- Punto de un goto, waypoint o pin (memorizado por elemento vivo).
local function puntoDe(pv, k, e)
  local p = puntosDe[e]
  if p == nil then
    p = nuevoPunto(pv, k, e, e.datos)
    puntosDe[e] = p
  end
  return p
end

-- Puntos de los vértices de un loop; el último no se repite si cierra el polígono sobre el primero.
local function verticesDe(pv, k, e)
  local lista = puntosDe[e]
  if lista == nil then
    lista = {}
    local vertices = e.datos.puntos or {}
    local n = #vertices
    if n > 1 and iguales(vertices[1], vertices[n]) then
      n = n - 1
    end
    for v = 1, n do
      lista[v] = nuevoPunto(pv, k, e, vertices[v], v)
    end
    puntosDe[e] = lista
  end
  return lista
end

---------------------------------------------------------------------------------------------------
-- T2: entrega a medias.
---------------------------------------------------------------------------------------------------

-- Ronda 1 (I1): ¿se puede hacer ya en el PNJ? Un accept pendiente o un turnin pendiente de una misión completa.
local function seHaceEnElPNJ(e)
  if e.resultado ~= "pendiente" then
    return false
  end
  local d = e.datos
  if d.t == "accept" then
    return true
  end
  return d.t == "turnin" and type(d.q) == "number" and SNF.Misiones.completa(d.q)
end

-- ¿Le queda al paso solo trabajo fuera del PNJ? Tiene una entrega a medias (Elementos.entregaAMedias) y nada que se haga
-- ya en el PNJ. Sin tablas nuevas: corre en cada fotograma.
local function aMedias(pv)
  local hay = false
  for _, e in ipairs(pv.elementos) do
    if Elementos.entregaAMedias(e) then
      hay = true
    elseif seHaceEnElPNJ(e) then
      return false
    end
  end
  return hay
end

-- Puntos de los sitios del objetivo k de q (Datos.sitiosObjetivo): lista de {punto, mundo}, solo los que tienen sitio en
-- el mundo. Los datos no cambian: se hacen una vez por idioma (la etiqueta lleva nombres) y los puntos son siempre las
-- mismas tablas (así la flecha y «Cómo llegar» ven que el destino no ha cambiado).
local sitiosAMedias = {} -- [q] = {[k] = lista de {punto, mundo}}
local idiomaAMedias

local function nombreDelObjetivo(sitios)
  local Datos = SNF.Datos
  local g, id = sitios.grupo, sitios.id
  if g == 1 and id then
    return Datos.nombrePNJ(id)
  elseif g == 5 and sitios.npcs[1] then
    return Datos.nombrePNJ(sitios.npcs[1])
  elseif g == 2 and id then
    return Datos.nombreObjeto(id)
  elseif g == 3 and id then
    return Datos.nombreItem(id)
  end
  return nil
end

local function puntosAMedias(q, k)
  local idioma = L.idioma()
  if idioma ~= idiomaAMedias then
    sitiosAMedias, idiomaAMedias = {}, idioma
  end
  local porQ = sitiosAMedias[q]
  if not porQ then
    porQ = {}
    sitiosAMedias[q] = porQ
  end
  local lista = porQ[k]
  if lista == nil then
    lista = {}
    local sitios = SNF.Datos.sitiosObjetivo(q, k)
    if sitios and #sitios.puntos > 0 then
      local nombre = nombreDelObjetivo(sitios)
      local mision = SNF.Datos.nombreMision(q)
      local etiqueta = nombre and L.t("A_MEDIAS_DESTINO", nombre, mision) or L.t("A_MEDIAS_DESTINO_MISION", mision)
      for _, s in ipairs(sitios.puntos) do
        local p = {mapa = s.mapa, x = s.x, y = s.y, tipo = "objetivo", origen = "guia", q = q, objetivo = k,
          sinPin = true, aMedias = true, etiqueta = etiqueta}
        local w = Coord.aMundo(p)
        if w then
          p.wx, p.wy, p.inst = w.wx, w.wy, w.inst
          lista[#lista + 1] = {punto = p, mundo = w}
        end
      end
    end
    porQ[k] = lista
  end
  return lista
end

-- Pasos vivos activos, en el orden del motor (los pegajosos anteriores y luego el actual).
local function pasosActivos()
  local M = Motor()
  local lista = {}
  -- Motor.activos() y no Motor.estado().activos: esto corre en cada fotograma (la flecha) y estado() crea 3 tablas.
  for _, i in ipairs(M.activos()) do
    local pv = M.paso(i)
    if pv then
      lista[#lista + 1] = pv
    end
  end
  return lista
end

---------------------------------------------------------------------------------------------------
-- Puntos de la guía.
---------------------------------------------------------------------------------------------------

function Navegacion.puntosDeGuia()
  local M = Motor()
  local estado = M.estado()
  local cuantos = tonumber(Ajustes.get("pines.cuantos")) or CUANTOS_DEFECTO
  local orden, vistos = {}, {}
  local function meter(i)
    local pv = i and M.paso(i)
    if pv and not pv.hecho and not vistos[i] then
      vistos[i] = true
      orden[#orden + 1] = pv
    end
  end
  for _, i in ipairs(estado.activos) do
    meter(i)
  end
  meter(estado.actual) -- el actual que espera no está en activos ni en siguientes
  for _, i in ipairs(estado.siguientes) do
    meter(i)
  end
  local salida = {}
  for n = 1, math.min(cuantos, #orden) do
    local pv = orden[n]
    local salta = pv.activo and saltaObjetivos(pv)
    local delPaso -- puntos de goto con objetivo ya puestos de este paso: los iguales salen una vez
    for k, e in ipairs(sinDestino(pv) and SIN_ELEMENTOS or pv.elementos) do
      local t = e.datos.t
      local fuera = pv.activo and padreHecho(pv, e)
      if CON_PIN[t] and not fuera and not (pv.activo and alcanzado(e)) and not (salta and objetivoCumplido(pv, e.datos)) then
        local p = puntoDe(pv, k, e)
        -- Solo se fusionan los goto con objetivo del mismo paso (los del paso de completar, sin q ni etiqueta propias):
        -- otro elemento en el mismo punto (otra misión, un pin con su texto) se ve aparte.
        local deObjetivo = t == "goto" and e.datos.objetivo ~= nil
        local repetido = false
        if deObjetivo then
          for _, otro in ipairs(delPaso or SIN_ELEMENTOS) do
            if iguales(otro, p) then
              repetido = true
              break
            end
          end
        end
        if not repetido then
          if deObjetivo then
            delPaso = delPaso or {}
            delPaso[#delPaso + 1] = p
          end
          salida[#salida + 1] = p
        end
      elseif t == "loop" and not fuera then
        for _, p in ipairs(verticesDe(pv, k, e)) do
          salida[#salida + 1] = p
        end
      end
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Destino.
---------------------------------------------------------------------------------------------------

-- Candidatos a la flecha de los pasos activos: {pv, k, e, punto, mundo}.
-- Lo pide la flecha en cada fotograma: la lista y sus entradas se reutilizan (solo se leen dentro de
-- Navegacion.destino, que se queda con el punto y nada más), en vez de crear tablas nuevas (tarea 22, memoria). Las
-- entradas que sobran se sueltan para no retener pasos de una guía que ya no está.
local listaCandidatos = {}

-- Pone el candidato n de la lista (reutilizando su tabla) y devuelve n.
local function anadir(lista, n, pv, k, e, p, w, deObjetivo)
  local c = lista[n]
  if not c then
    c = {}
    lista[n] = c
  end
  c.pv, c.k, c.e, c.punto, c.mundo, c.aMedias = pv, k, e, p, w, deObjetivo
  return n
end

local function candidatos()
  local M = Motor()
  local lista, n = listaCandidatos, 0
  for _, i in ipairs(M.activos()) do
    local pv = M.paso(i)
    local libre = pv ~= nil and not sinDestino(pv)
    if libre and aMedias(pv) then
      -- T2: en vez de sus goto, los sitios de los objetivos que faltan (si los datos los traen).
      for k, e in ipairs(pv.elementos) do
        local q = e.datos.q
        for _, objetivo in ipairs(Elementos.faltanDe(e) or SIN_ELEMENTOS) do
          if delDiario(q, objetivo).casa then
            for _, s in ipairs(puntosAMedias(q, objetivo)) do
              n = anadir(lista, n + 1, pv, k, e, s.punto, s.mundo, true)
            end
          end
        end
      end
    else
      local salta = pv ~= nil and saltaObjetivos(pv)
      for k, e in ipairs(libre and pv.elementos or SIN_ELEMENTOS) do
        local el = e.datos
        if CON_FLECHA[el.t] and el.modo ~= "pin" and not alcanzado(e) and not padreHecho(pv, e)
          and not (salta and objetivoCumplido(pv, el)) then
          local p = puntoDe(pv, k, e)
          local w = Coord.aMundo(p)
          if w then
            n = anadir(lista, n + 1, pv, k, e, p, w, nil)
          end
        end
      end
    end
  end
  for i = #lista, n + 1, -1 do
    lista[i] = nil
  end
  return lista
end

local function distancia(j, w)
  if w.inst ~= j.inst then
    return math.huge
  end
  return (Coord.vector(j, w))
end

local function masCercano(lista, j)
  local mejor, mejorD
  for _, c in ipairs(lista) do
    if c.e.datos.modo == "cercano" then
      local d = distancia(j, c.mundo)
      if mejor == nil or d < mejorD then
        mejor, mejorD = c, d
      end
    end
  end
  return mejor
end

-- De los candidatos del paso de `primero` (un goto con objetivo) con su mismo modo, el más próximo en la instancia del
-- jugador; si ninguno está en ella, `primero`. Los goto sin objetivo de ese paso (la exploración de una misión con
-- reputación) cuentan como siempre pendientes: los que ya no valen no llegan a la lista (alcanzados o padre hecho).
local function delObjetivoMasCercano(lista, primero, j)
  local mejor, mejorD
  for _, c in ipairs(lista) do
    local el = c.e.datos
    if c.pv == primero.pv and el.modo == primero.e.datos.modo and c.mundo.inst == j.inst then
      local d = distancia(j, c.mundo)
      if mejor == nil or d < mejorD then
        mejor, mejorD = c, d
      end
    end
  end
  return mejor or primero
end

-- T2: de los sitios de los objetivos que faltan del paso de `primero`, el más próximo en la instancia del jugador; si
-- ninguno está en ella, `primero`.
local function aMediasMasCercano(lista, primero, j)
  local mejor, mejorD
  for _, c in ipairs(lista) do
    if c.aMedias and c.pv == primero.pv and c.mundo.inst == j.inst then
      local d = distancia(j, c.mundo)
      if mejor == nil or d < mejorD then
        mejor, mejorD = c, d
      end
    end
  end
  return mejor or primero
end

local function elegir(lista, j)
  local baja
  for _, c in ipairs(lista) do
    local modo = c.e.datos.modo
    if c.aMedias then
      return aMediasMasCercano(lista, c, j)
    elseif modo == "baja" then
      baja = baja or c
    elseif modo == "cercano" then
      return masCercano(lista, j)
    elseif c.e.datos.objetivo ~= nil then
      return delObjetivoMasCercano(lista, c, j)
    else
      return c
    end
  end
  return baja
end

-- Fin de parada (fase 4): quien rellena la capa «ia» (ia/ruta.lua) dice cuándo está hecha una parada por lo que
-- pasa en el juego y no por distancia. fn(p) -> true (hecha: la ruta la salta), false (no se da por alcanzada aunque
-- el jugador esté encima) o nil (por distancia, como siempre). Una función que falla cuenta como nil.
local finDeParada
local falloFinDeParada = false

function Navegacion.ponerFinDeParada(fn)
  finDeParada = fn
  falloFinDeParada = false
end

local function terminada(p)
  if not finDeParada then
    return nil
  end
  local ok, valor = pcall(finDeParada, p)
  if not ok then
    if not falloFinDeParada then
      falloFinDeParada = true
      geterrorhandler()(valor)
    end
    return nil
  end
  return valor
end

-- Por dónde va la ruta (revisión del proyecto, I1): el índice de la primera parada de `rutaVista` sin alcanzar. Solo
-- salta las de rutaAlcanzada, que no se desmarcan nunca (una lista nueva de Capa.ruta(), tras poner o quitar, vuelve
-- a empezar por la 1). Las de fin de parada hecho no se saltan para siempre: Ruta.hecho puede volver a dar false
-- (una misión abandonada) y entonces la flecha tiene que volver a ellas; se siguen mirando una a una.
local rutaVista -- la lista de Capa.ruta() de la última búsqueda
local primeraSinAlcanzar = 1

local function primeroDeRuta()
  local ruta = Capa.ruta()
  if not ruta then
    return nil
  end
  if ruta ~= rutaVista then
    rutaVista, primeraSinAlcanzar = ruta, 1
  end
  while ruta[primeraSinAlcanzar] and rutaAlcanzada[ruta[primeraSinAlcanzar]] do
    primeraSinAlcanzar = primeraSinAlcanzar + 1
  end
  for i = primeraSinAlcanzar, #ruta do
    local p = ruta[i]
    if not rutaAlcanzada[p] and terminada(p) ~= true and Coord.aMundo(p) then
      return p
    end
  end
  return nil
end

-- Distancia y ángulo del jugador `j` al `punto`, escritos en `salida` (o en una tabla nueva); nil si el punto no tiene
-- sitio en el mundo.
local function medir(punto, j, salida)
  local w = Coord.aMundo(punto)
  if not w then
    return nil
  end
  salida = salida or {}
  salida.punto = punto
  if w.inst ~= j.inst then
    salida.otroContinente, salida.distancia, salida.angulo = true, nil, nil
    return salida
  end
  salida.otroContinente = nil
  salida.distancia, salida.angulo = Coord.vector(j, w)
  return salida
end

local jugador = {} -- posición del jugador de la última búsqueda (no sale de este archivo)

function Navegacion.destino(salida)
  if IsInInstance() then
    return nil
  end
  local j = Coord.jugador(jugador)
  if not j then
    return nil
  end
  local punto = primeroDeRuta()
  if not punto then
    local c = elegir(candidatos(), j)
    punto = c and c.punto
  end
  if not punto then
    return nil
  end
  return medir(punto, j, salida)
end

function Navegacion.medir(salida)
  local punto = salida and salida.punto
  if not punto or IsInInstance() then
    return nil
  end
  local j = Coord.jugador(jugador)
  if not j then
    return nil
  end
  return medir(punto, j, salida)
end

---------------------------------------------------------------------------------------------------
-- Llegada.
---------------------------------------------------------------------------------------------------

local SIN_LLEGADOS = {}

-- #loop (plano 3 §2.6): con todos los puntos con radio del paso alcanzados (sin contar los de padre hecho), se borran
-- las marcas para volver a empezar. Devuelve true si reinició.
local function reiniciarBucle(pv)
  if not Motor().etiqueta(pv.datos, "loop") then
    return false
  end
  local hay = false
  for _, e in ipairs(pv.elementos) do
    if CON_FLECHA[e.datos.t] and radioDe(e.datos) and not padreHecho(pv, e) then
      if not alcanzado(e) then
        return false
      end
      hay = true
    end
  end
  if not hay then
    return false
  end
  for k, e in ipairs(pv.elementos) do
    if CON_FLECHA[e.datos.t] and radioDe(e.datos) then
      Motor().marcarAlcanzado(pv.i, k, false)
    end
  end
  return true
end

function Navegacion.comprobarLlegada()
  if IsInInstance() then
    return
  end
  local j = Coord.jugador()
  if not j then
    return
  end
  local d = Navegacion.destino()
  local actual = d and d.punto
  local llegados -- se crea solo si alguien llega (esto corre cada PERIODO)
  local cambio = false
  if actual and actual.origen ~= "guia" and not d.otroContinente
    and d.distancia <= (tonumber(actual.radio) or RADIO_RUTA) and terminada(actual) == nil then
    rutaAlcanzada[actual] = true
    llegados = {actual}
  end
  for _, pv in ipairs(pasosActivos()) do
    -- T2: con una entrega a medias, la flecha no va a sus goto: no se alcanzan pasando cerca.
    for k, e in ipairs(aMedias(pv) and SIN_ELEMENTOS or pv.elementos) do
      local el = e.datos
      local radio = radioDe(el)
      if CON_FLECHA[el.t] and radio and not alcanzado(e) and not padreHecho(pv, e) then
        local p = puntoDe(pv, k, e)
        local soloDestino = el.modo == "paso" or el.sinPin == true
        local w = Coord.aMundo(p)
        if w and w.inst == j.inst and (not soloDestino or p == actual) and distancia(j, w) <= radio then
          Motor().marcarAlcanzado(pv.i, k, true)
          if el.modo == "objetivo" then
            Motor().marcarLlegado(pv.i, k)
          end
          llegados = llegados or {}
          llegados[#llegados + 1] = p
        end
      end
    end
    if reiniciarBucle(pv) then
      cambio = true
    end
  end
  if llegados or cambio then
    Capa.poner("guia", Navegacion.puntosDeGuia())
  end
  for _, p in ipairs(llegados or SIN_LLEGADOS) do
    Eventos.emitir("SNF_LLEGADA", p)
  end
end

local temporizador
local parado = false -- Navegacion.parar(): fuera del mundo, sin temporizador
local pendiente = false -- había (o se pidió) temporizador mientras estaba parado

local function arrancar()
  if temporizador then
    return
  end
  if parado then
    pendiente = true
    return
  end
  temporizador = C_Timer.NewTicker(PERIODO, function()
    Navegacion.comprobarLlegada()
  end)
end

-- PLAYER_LEAVING_WORLD (arranque.lua): quita el temporizador y no deja ponerlo hasta Navegacion.reanudar().
function Navegacion.parar()
  parado = true
  if temporizador then
    temporizador:Cancel()
    temporizador = nil
    pendiente = true
  end
end

-- Vuelta al mundo: vuelve a poner el temporizador si lo había (o se pidió mientras estaba parado).
function Navegacion.reanudar()
  parado = false
  if pendiente then
    pendiente = false
    arrancar()
  end
end

Eventos.escuchar("SNF_GUIA_CARGADA", arrancar)
Eventos.escuchar("SNF_PUNTOS_CAMBIADOS", arrancar)
