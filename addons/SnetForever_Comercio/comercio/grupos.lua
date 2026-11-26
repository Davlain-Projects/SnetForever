-- SnetForever: grupos de objetos del comercio. Hay dos orígenes:
--   · «auto» y «calculado» vienen en los precios de la app (SNF_PRECIOS.grupos) y no se editan;
--   · «propio» los hace el jugador. Desde la ventana principal (0.7.0, tarea 11) viven en el árbol de comercio/arbol.lua
--     (SnetForeverCuenta.comercio.v2: grupos con rutas como en TSM y un objeto en un solo grupo). Este módulo es la cara
--     «plana» de ese árbol para la ventana de la subasta, la IA, el sniper y la compra, que siguen pidiendo grupos con una
--     clave y una lista de números de objeto. La clave de un grupo propio es «propio:<ruta>».
-- Un grupo propio borrado no se pierde: va a la papelera del árbol (con sus subgrupos y objetos) y se recupera con
-- Grupos.recuperar. Los grupos planos de la 0.6.2 los migra Arbol la primera vez que se lee el árbol.
--
-- Grupos.lista() -> {{clave, nombre, tipo, objetos}}   los propios primero (en orden de árbol, cada uno seguido de sus
--                                                      subgrupos) y después los de la app. nombre ya va en el idioma activo;
--                                                      el de un subgrupo es su ruta con « › » («Hierbas › Raras»). objetos
--                                                      son números de objeto, sin repetir y de menor a mayor.
-- Grupos.crear(nombre) -> clave | nil                  un grupo de primer nivel; un nombre vacío no vale. Se recorta a 60
--                                                      letras, el «`» se cambia por «'» y, si ya hay uno igual, se le añade
--                                                      « 2», « 3»…
-- Grupos.renombrar(clave, nombre) -> boolean           false si hay un hermano con ese nombre. Las reglas siguen al grupo (las lleva Arbol).
-- Grupos.anadir(clave, item) -> boolean                item es el número del objeto (se guarda como «i:<id>»); repetido
--                                                      no se duplica y, si estaba en otro grupo, se cambia de grupo.
-- Grupos.quitar(clave, item) -> boolean                lo saca del árbol (todas las claves de ese número en el grupo).
-- Grupos.borrar(clave) -> boolean                      lo manda a la papelera con sus subgrupos.
-- Grupos.recuperar(clave) -> boolean, claveNueva       lo saca de la papelera; si ya hay un grupo con esa ruta, vuelve con
--                                                      un nombre libre («Hierbas 2») y esa es la clave nueva.
-- Grupos.papelera() -> {{clave, nombre}}               lo que se puede recuperar.
-- Con un grupo de la app, renombrar, anadir, quitar, borrar y recuperar dan false.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Grupos = {}
SNF.Grupos = Grupos

local PREFIJO = "propio:"
local MAX_NOMBRE = 60
local MAX_REPETIDOS = 1000

-- Un nombre pasado por el filtro de la API vieja: recortado, sin espacios a los lados y sin el separador de niveles.
local function limpiarNombre(nombre)
  if type(nombre) ~= "string" then
    return nil
  end
  nombre = string.gsub(nombre, "^%s+", "")
  nombre = string.gsub(nombre, "%s+$", "")
  nombre = string.sub(nombre, 1, MAX_NOMBRE)
  nombre = string.gsub(nombre, SNF.Arbol.SEP, "'")
  nombre = string.gsub(nombre, "%s+$", "")
  if nombre == "" then
    return nil
  end
  return nombre
end

-- La ruta de un grupo propio que existe, o nil (clave de la app, mal escrita o de un grupo que ya no está).
local function rutaDe(clave)
  local ruta = type(clave) == "string" and string.match(clave, "^" .. PREFIJO .. "(.+)$")
  if ruta and SNF.Arbol.existe(ruta) then
    return ruta
  end
  return nil
end

-- Los números de objeto de unas claves de TSM, sin repetir y de menor a mayor.
local function idsDe(claves)
  local ids, vistos = {}, {}
  for _, k in ipairs(claves) do
    local id = SNF.Arbol.idDe(k)
    if id and not vistos[id] then
      vistos[id] = true
      ids[#ids + 1] = id
    end
  end
  table.sort(ids)
  return ids
end

function Grupos.lista()
  local salida = {}
  -- Una sola lectura del árbol (los datos, la vista y el índice se hacen una vez, no por grupo).
  for _, g in ipairs(SNF.Arbol.listar()) do
    local nombre = g.nombre
    if g.nivel > 1 then
      nombre = string.gsub(g.ruta, SNF.Arbol.SEP, " › ")
    end
    table.insert(salida, {clave = PREFIJO .. g.ruta, nombre = nombre, tipo = "propio", objetos = idsDe(g.claves)})
  end
  local precios = rawget(_G, "SNF_PRECIOS")
  local deApp = type(precios) == "table" and precios.grupos
  if type(deApp) == "table" then
    for _, g in ipairs(deApp) do
      if type(g) == "table" and g.clave then
        table.insert(salida, {
          clave = g.clave,
          nombre = SNF.L.de(g.nombre) or g.clave,
          tipo = g.tipo or "auto",
          objetos = g.objetos or {},
        })
      end
    end
  end
  return salida
end

function Grupos.crear(nombre)
  nombre = limpiarNombre(nombre)
  if not nombre then
    return nil
  end
  local ruta = SNF.Arbol.crear("", nombre)
  if not ruta and SNF.Arbol.existe(nombre) then
    for n = 2, MAX_REPETIDOS do
      ruta = SNF.Arbol.crear("", nombre .. " " .. n)
      if ruta then
        break
      end
    end
  end
  return ruta and PREFIJO .. ruta or nil
end

function Grupos.renombrar(clave, nombre)
  local ruta = rutaDe(clave)
  nombre = limpiarNombre(nombre)
  if not ruta or not nombre then
    return false
  end
  -- Arbol lleva consigo las reglas del grupo y de sus subgrupos (cuelgan de la ruta).
  return SNF.Arbol.renombrar(ruta, nombre) ~= nil
end

function Grupos.anadir(clave, item)
  local ruta = rutaDe(clave)
  if not ruta or type(item) ~= "number" or item <= 0 or item ~= math.floor(item) then
    return false
  end
  return SNF.Arbol.poner("i:" .. string.format("%d", item), ruta)
end

function Grupos.quitar(clave, item)
  local ruta = rutaDe(clave)
  if not ruta or type(item) ~= "number" then
    return false
  end
  local quitado = false
  for _, k in ipairs(SNF.Arbol.objetos(ruta)) do
    if SNF.Arbol.idDe(k) == item then
      SNF.Arbol.quitar(k)
      quitado = true
    end
  end
  return quitado
end

function Grupos.borrar(clave)
  local ruta = rutaDe(clave)
  return ruta ~= nil and SNF.Arbol.borrar(ruta)
end

function Grupos.recuperar(clave)
  local ruta = type(clave) == "string" and string.match(clave, "^" .. PREFIJO .. "(.+)$")
  if not ruta then
    return false
  end
  local ok, destino = SNF.Arbol.recuperar(ruta)
  if ok then
    return true, PREFIJO .. destino
  end
  return false
end

function Grupos.papelera()
  local salida = {}
  for _, e in ipairs(SNF.Arbol.papelera()) do
    table.insert(salida, {clave = PREFIJO .. e.ruta, nombre = e.nombre})
  end
  return salida
end
