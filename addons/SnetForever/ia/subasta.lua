-- SnetForever: precios de la casa de subastas para la IA (13-nov, petición del autor: «tengo un addon que trabaja en la
-- subasta, quiero que extraiga esa información cuando abra la casa de subasta»).
-- Fallo F1 (en el juego, ronda 1): el precio de ahora de un objeto sale SIEMPRE de la misma foto, con la misma prioridad,
-- en todo lo que enseña o juzga un precio de ahora (el tooltip, la lista de ofertas, la IA y las reglas de compra):
--   1. "lista": la última lista ENTERA del objeto leída en Navegar (SNF.Busqueda.vivo), lo único de verdad de ahora;
--   2. "app": la foto de la app (SNF.Precios.de, con su hora real, SNF.Precios.edad);
--   3. "escaneo": el escaneo (SNF.Escaneo.datos), SOLO si la app no trae el objeto. ReplicateItems y el resumen de navegar
--      dan una foto guardada por el servidor, de cuándo no se sabe: su hora es la de LECTURA y nunca es «de ahora».
-- Y, como último recurso para la IA, Auctionator si el jugador lo tiene (API pública v1, «SnetForever» como nombre de quien
-- llama). Nada de comprar, vender ni buscar aquí.
--
-- Subasta.foto(id, casa?) -> precio, cantidad, subastas, edad, p, fuente, edadApp, hora | nil   la elección de arriba (sin
--                                            Auctionator), la ÚNICA: la usan el tooltip (ui/tooltip.lua), la lista de
--                                            ofertas (ui/comercio.lua), las oportunidades de la IA (ia/contexto.lua) y
--                                            Subasta.precio. precio = compra mínima (con la lista, nil si no hay ninguna
--                                            que se pueda comprar), cantidad = unidades, subastas = si esa foto las trae,
--                                            edad = segundos desde la foto (lista y app) o desde que se LEYÓ (escaneo; nil
--                                            si no se sabe), p = la fila de la app (para el valor de mercado y la regla,
--                                            también cuando gana la lista), fuente = "lista" | "app" | "escaneo", edadApp =
--                                            la de la foto de la app, hora = la de la foto misma (ronda 3: lista.hora, la
--                                            hora de lectura del escaneo, o el `generado` de la app con
--                                            Precios.generado; sin él, ahora menos edadApp), la que enseñan las tablas sin
--                                            que se mueva entre repintados. casa: la de Precios.de (nil = la de la subasta
--                                            abierta o la de la consulta). Cada llamada a otro módulo va protegida. F6,
--                                            ronda 1: un dato del escaneo leído en otra casa (su faccion no es la de
--                                            SNF.Precios.faccionActual) no cuenta.
-- Subasta.disponible() -> boolean            ¿hay escaneo en vivo, precios de la app o Auctionator?
-- Subasta.precio(id) -> cobre|nil, dias|nil, fuente|nil, segundos|nil   precio mínimo de la foto elegida (Subasta.foto; con
--                                            la subasta abierta, con su casa, como el tooltip; si no, con la casa propia)
--                                            y, si no hay ninguna foto, el de Auctionator. Una foto sin ninguna que se
--                                            pueda comprar da cobre nil con su fuente (nunca Auctionator). dias = días
--                                            desde la foto (la lista y la app; Auctionator, su edad; nil con el escaneo, porque no se sabe de
--                                            cuándo es su foto); fuente = "lista" | "app" | "escaneo" | "auctionator";
--                                            segundos = edad de la foto (el escaneo: desde que se leyó; nil si no se sabe)
-- Subasta.vista() -> segundos|nil            cuánto hace que el jugador abrió la casa de subastas por última vez (se guarda
--                                            por personaje: SnetForeverPJ.ia.subastaVista, con API.horaServidor())
-- Subasta.anotar(objetos) -> n              pone `pa` (precio de subasta, cobre), `pd` (días), `pf` (fuente: "lista",
--                                            "app" o "escaneo"; con Auctionator no va, nunca se le nombra a la IA) y `pe`
--                                            (segundos) a cada objeto {id} de la lista que alguna fuente conoce; devuelve
--                                            cuántos anotó
-- Cada llamada a otro módulo o a Auctionator va protegida: si falla o cambia su API, no sale precio y el resto sigue.
local _, SNF = ...
local Subasta = {}
SNF.Subasta = Subasta

local floor = math.floor
local QUIEN = "SnetForever"

-- El escaneo en vivo: {[id] = {precio, ...}} o nil si no hay nada escaneado.
local function escaneo()
  local E = rawget(SNF, "Escaneo")
  if type(E) ~= "table" or type(rawget(E, "datos")) ~= "function" then
    return nil
  end
  local ok, datos = pcall(E.datos)
  if ok and type(datos) == "table" and next(datos) ~= nil then
    return datos
  end
  return nil
end

-- Los precios de la app: Precios.de(id) usa la casa abierta; los días salen de la edad de la foto.
local function modPrecios()
  local P = rawget(SNF, "Precios")
  return type(P) == "table" and type(rawget(P, "de")) == "function" and P or nil
end

-- La casa del jugador, calculada con su reino y su facción: así hay precio aunque la subasta esté cerrada (Precios.de sin
-- casa usa la de la última subasta abierta, y fuera de ella no hay ninguna). nil si no se sabe: entonces Precios.de decide.
local function casaPropia(P)
  if type(rawget(P, "casa")) ~= "function" then
    return nil
  end
  local ok, casa = pcall(P.casa)
  return ok and casa or nil
end

-- ¿tiene la app precios cargados? (Precios.edad() solo da número si hay una foto cargada)
local function hayPreciosDeLaApp()
  local P = modPrecios()
  if not P or type(rawget(P, "edad")) ~= "function" then
    return false
  end
  local ok, edad = pcall(P.edad)
  if not ok or type(edad) ~= "number" then
    return false
  end
  -- Si la app sabe calcular la casa y no sabe cuál es, no podrá dar ningún precio: no cuenta como disponible.
  return type(rawget(P, "casa")) ~= "function" or casaPropia(P) ~= nil
end

-- La última lista entera del objeto en Navegar (SNF.Busqueda.vivo), o nil.
local function deLaLista(id)
  local B = rawget(SNF, "Busqueda")
  local f = type(B) == "table" and rawget(B, "vivo")
  if type(f) ~= "function" then
    return nil
  end
  local ok, v = pcall(f, id)
  if ok and type(v) == "table" and type(v.cantidad) == "number" then
    return v
  end
  return nil
end

local function edadDesde(ahora, hora)
  if type(ahora) == "number" and type(hora) == "number" then
    return math.max(0, ahora - hora)
  end
  return nil
end

function Subasta.foto(id, casa)
  local P = modPrecios()
  local p, edadApp = nil, nil
  if P then
    local ok, fila = pcall(P.de, id, casa)
    p = ok and type(fila) == "table" and fila or nil
    if p and type(rawget(P, "edad")) == "function" then
      local bien, edad = pcall(P.edad)
      edadApp = bien and type(edad) == "number" and edad >= 0 and edad or nil
    end
  end
  local ahora = SNF.API.horaServidor()
  local lista = deLaLista(id)
  if lista then
    return lista.precio, lista.cantidad, lista.subastas, edadDesde(ahora, lista.hora), p, "lista", edadApp,
      type(lista.hora) == "number" and lista.hora or nil
  end
  if p then
    local hora = nil
    if type(rawget(P, "generado")) == "function" then
      local ok, g = pcall(P.generado)
      hora = ok and type(g) == "number" and g or nil
    end
    if not hora and edadApp and type(ahora) == "number" then
      hora = ahora - edadApp
    end
    return p.precio, tonumber(p.cantidad) or 0, p.subastas, edadApp, p, "app", edadApp, hora
  end
  -- Una réplica (o el resumen de navegar) nunca gana a una foto de la app: no se sabe de cuándo es.
  local datos = escaneo()
  local v = datos and datos[id]
  -- F6, ronda 1: el escaneo de otra casa no vale (leído en la Horda y mirado en la neutral, o al revés): cada dato lleva la
  -- facción de la subasta en la que se leyó, y se compara con la de ahora (SNF.Precios.faccionActual).
  if type(v) == "table" and v.faccion ~= nil and P and type(rawget(P, "faccionActual")) == "function" then
    local ok, faccion = pcall(P.faccionActual)
    if ok and faccion ~= nil and faccion ~= v.faccion then
      v = nil
    end
  end
  if type(v) == "table" and type(v.precio) == "number" then
    return v.precio, tonumber(v.cantidad) or 0, nil, edadDesde(ahora, v.hora), nil, "escaneo", nil,
      type(v.hora) == "number" and v.hora or nil
  end
  return nil
end

local function api()
  local a = rawget(_G, "Auctionator")
  local v1 = type(a) == "table" and type(a.API) == "table" and a.API.v1
  if type(v1) == "table" and type(v1.GetAuctionPriceByItemID) == "function" then
    return v1
  end
  return nil
end

function Subasta.disponible()
  return escaneo() ~= nil or hayPreciosDeLaApp() or api() ~= nil
end

-- F1 (ronda 2): con la subasta abierta, la casa de la subasta (la que usan el tooltip y la lista de ofertas: Precios.de sin
-- casa); si no, la casa propia, para que haya precio con la subasta cerrada.
local function subastaAbierta()
  local C = rawget(SNF, "Comercio")
  local f = type(C) == "table" and rawget(C, "abierta")
  if type(f) ~= "function" then
    return false
  end
  local ok, si = pcall(f)
  return ok and si == true
end

function Subasta.precio(id)
  if type(id) ~= "number" then
    return nil
  end
  local P = modPrecios()
  local casa = nil
  if P and not subastaAbierta() then
    casa = casaPropia(P)
  end
  local precio, _, _, edad, _, fuente = Subasta.foto(id, casa)
  local segundos = edad and floor(edad) or nil
  if type(precio) == "number" and precio > 0 then
    local dias = fuente ~= "escaneo" and edad and floor(edad / 86400) or nil
    return floor(precio), dias, fuente, segundos
  end
  if fuente then
    -- F1 (ronda 2): hay foto, pero sin ninguna que se pueda comprar (una lista entera de las tuyas o de solo pujas, o una
    -- fila de la app sin precio). Es lo de ahora de ese objeto: sin precio, y sin ir a buscarlo a Auctionator.
    return nil, nil, fuente, segundos
  end
  local v1 = api()
  if not v1 then
    return nil
  end
  local ok, precio = pcall(v1.GetAuctionPriceByItemID, QUIEN, id)
  if not ok or type(precio) ~= "number" or precio <= 0 then
    return nil
  end
  local dias
  if type(v1.GetAuctionAgeByItemID) == "function" then
    local bien, edad = pcall(v1.GetAuctionAgeByItemID, QUIEN, id)
    if bien and type(edad) == "number" and edad >= 0 then
      dias = floor(edad)
    end
  end
  return floor(precio), dias, "auctionator", dias and dias * 86400 or nil
end

local function guardado()
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj) ~= "table" then
    return nil
  end
  if type(pj.ia) ~= "table" then
    pj.ia = {}
  end
  return pj.ia
end

function Subasta.vista()
  local g = guardado()
  local cuando = g and g.subastaVista
  local ahora = SNF.API.horaServidor()
  if type(cuando) ~= "number" or type(ahora) ~= "number" then
    return nil
  end
  return math.max(0, floor(ahora - cuando))
end

function Subasta.anotar(objetos)
  if type(objetos) ~= "table" or not Subasta.disponible() then
    return 0
  end
  local n = 0
  for _, o in ipairs(objetos) do
    if type(o) == "table" then
      local precio, dias, fuente, segundos = Subasta.precio(o.id)
      if precio then
        o.pa = precio
        o.pd = dias
        o.pf = fuente ~= "auctionator" and fuente or nil -- a la IA nunca se le nombra otro addon
        o.pe = segundos
        n = n + 1
      end
    end
  end
  return n
end

-- Al abrir (y al cerrar, tras ver precios nuevos) la casa de subastas, se apunta la hora.
local function apuntar()
  local g = guardado()
  local ahora = SNF.API.horaServidor()
  if g and type(ahora) == "number" then
    g.subastaVista = ahora
  end
end
SNF.Eventos.escuchar("AUCTION_HOUSE_SHOW", apuntar)
SNF.Eventos.escuchar("AUCTION_HOUSE_CLOSED", apuntar)
