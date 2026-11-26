-- SnetForever: capa genérica de puntos del mapa. La rellenan la guía ("guia"), la IA ("ia", fase 4) y el propio
-- jugador ("jugador"); la leen los pines del mapa del mundo y del minimapa y, para las rutas, la navegación.
--
-- Punto = {mapa, x?, y?, inst?, wx?, wy?, etiqueta?, tipo?, orden?, q?, seguir?, esPin?, origen}
--   (x, y en 0-100 del mapa; wx, wy en yardas con la convención de mapa/coordenadas.lua). Los de la guía traen
--   además los campos de mapa/navegacion.lua (paso, k, modo, radio, sinPin...). esPin: un pin de la IA que no es parada
--   (ia/ruta.lua): se pinta como el «Marcador de mapa» de Blizzard y sin número (mapa/marcador.lua).
--
-- Capa.poner(origen, puntos)   cambia los puntos de ese origen (les pone `origen`); emite SNF_PUNTOS_CAMBIADOS(origen).
-- Capa.quitar(origen)          los borra; emite SNF_PUNTOS_CAMBIADOS(origen).
-- Capa.puntos(origen) -> Punto[]  copia de la lista de ese origen.
-- Capa.visibles() -> Punto[]   los de "guia", "ia" y "jugador", sin los de "ia" si el ajuste pines.ia está apagado.
--                              Es la lista guardada de la capa (no una copia): solo se recorre, no se modifica.
-- Capa.ruta() -> Punto[]|nil   los puntos con seguir = true de "jugador" e "ia", ordenados por `orden` (a igual
--                              orden, como se pusieron); nil si no hay ninguno. Como visibles(), es la lista guardada
--                              (se rehace solo en poner y quitar): solo se recorre, no se modifica. Mientras no se
--                              vuelva a poner o quitar, es la misma tabla (Navegacion la usa para recordar por dónde va).
local _, SNF = ...
local Capa = {}
SNF.Capa = Capa

local Eventos = SNF.Eventos
local Ajustes = SNF.Ajustes

local ORIGENES = {"guia", "ia", "jugador"}
local RUTA = {"jugador", "ia"} -- los orígenes de Capa.ruta(), en este orden
local capas = {guia = {}, ia = {}, jugador = {}}
local visibles -- lista hecha, o nil si hay que rehacerla
local visiblesConIa -- el valor de pines.ia con el que se hizo
local ruta -- Capa.ruta() hecha: la lista, false si no hay ruta, o nil si hay que rehacerla

local function comprobarOrigen(origen)
  if capas[origen] == nil then
    error("Capa: origen desconocido " .. tostring(origen) .. " (guia, ia o jugador)", 3)
  end
end

function Capa.poner(origen, puntos)
  comprobarOrigen(origen)
  local lista = {}
  for i, p in ipairs(puntos or {}) do
    p.origen = origen
    lista[i] = p
  end
  capas[origen] = lista
  visibles, ruta = nil, nil
  Eventos.emitir("SNF_PUNTOS_CAMBIADOS", origen)
end

function Capa.quitar(origen)
  comprobarOrigen(origen)
  capas[origen] = {}
  visibles, ruta = nil, nil
  Eventos.emitir("SNF_PUNTOS_CAMBIADOS", origen)
end

function Capa.puntos(origen)
  comprobarOrigen(origen)
  local copia = {}
  for i, p in ipairs(capas[origen]) do
    copia[i] = p
  end
  return copia
end

-- La lista se guarda hecha y solo se rehace cuando cambian los puntos o el ajuste pines.ia: la piden los pines del
-- minimapa 10 veces por segundo y antes se creaba una tabla nueva en cada vuelta (tarea 22, memoria).

function Capa.visibles()
  local conIa = Ajustes.get("pines.ia") ~= false
  if visibles and visiblesConIa == conIa then
    return visibles
  end
  local salida = {}
  for _, origen in ipairs(ORIGENES) do
    if origen ~= "ia" or conIa then
      for _, p in ipairs(capas[origen]) do
        salida[#salida + 1] = p
      end
    end
  end
  visibles, visiblesConIa = salida, conIa
  return salida
end

-- La ruta también se guarda hecha (revisión del proyecto, I1): la flecha la pide en cada búsqueda del destino y antes
-- se creaba una tabla por parada (hasta 400 en una ruta de zona) y se ordenaban todas, 60 veces por segundo.
local function hacerRuta()
  local lista = {}
  for _, origen in ipairs(RUTA) do
    for _, p in ipairs(capas[origen]) do
      if p.seguir then
        lista[#lista + 1] = {punto = p, puesto = #lista + 1, orden = tonumber(p.orden) or math.huge}
      end
    end
  end
  if #lista == 0 then
    return false
  end
  table.sort(lista, function(a, b)
    if a.orden ~= b.orden then
      return a.orden < b.orden
    end
    return a.puesto < b.puesto
  end)
  local salida = {}
  for i, c in ipairs(lista) do
    salida[i] = c.punto
  end
  return salida
end

function Capa.ruta()
  if ruta == nil then
    ruta = hacerRuta()
  end
  return ruta or nil
end
