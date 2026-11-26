-- SnetForever: acceso a los datos de los dos addons de datos (SNF_RUTAS y SNF_MISIONES), que solo se leen.
--   * Guías: Datos.guia(clave) busca en SNF_RUTAS.guias, en la clave de una variante (SNF_RUTAS.alias) y en
--     SNF_MISIONES.guias (laterales: cadenas y mazmorras), en «Mis guías» (motor/misguias.lua, las que escribe el
--     jugador en SnetForever_MisGuias), en las rutas RXP importadas (desde el juego, motor/importar-rxp.lua, y del addon
--     SnetForever_RutasRXP) y, las últimas, en SnetForeverPJ.ia.guias (rutas de zona de la
--     IA, fase 4) y en la guía de la ruta de pines activa de la IA (Ruta.guia, lote F); Datos.claves() es la unión.
--   * Misiones y PNJ: Datos.mision(q) y Datos.npc(id) devuelven una copia con las correcciones de
--     SNF_MISIONES.porFaccion[facción del personaje] aplicadas campo a campo: "__borrar" quita el campo y
--     {porClase = {CLASE = valor}} se resuelve con la clase del personaje (una clase que no aparece significa
--     «vale el valor base»). Se memorizan por facción y clase y nunca tocan la tabla original. Sin corrección para
--     esa facción devuelven la tabla original (de solo lectura), sin copia ni memoria (tarea 22).
--   * PNJ por nombre (tarea D4, para «Objetivos cercanos»): Datos.idsPNJPorNombres(nombres) con una pasada memorizada,
--     Datos.nombrePNJCliente(id) con el nombre del idioma del cliente y Datos.puntosPNJ(id) con sus puntos de aparición.
--   * Nombres: primero el juego (solo si el idioma activo es el del cliente), luego el español de los datos (si el
--     idioma activo es es), luego el inglés y, si no hay nada, "#id".
local _, SNF = ...
local Datos = {}
SNF.Datos = Datos

local U = SNF.U
local L = SNF.L

-- Verdadero si el idioma activo del addon es el mismo que el del cliente del juego.
local function idiomaDelCliente()
  local cliente = GetLocale()
  local propio = (cliente == "esES" or cliente == "esMX") and "es" or "en"
  return L.idioma() == propio
end

-- El esquema de datos que pide este addon (F5-2). El .toc lo declara igual en «## X-SNF-EsquemaDatos», para que la app
-- lo lea sin cargar el Lua (una prueba del banco vigila que coincidan).
Datos.ESQUEMA = 1

-- Comprueba que los dos addons de datos están y son del esquema Datos.ESQUEMA. Devuelve true o false y el motivo
-- ("faltan" o "esquema").
function Datos.comprobar()
  if type(SNF_RUTAS) ~= "table" or type(SNF_MISIONES) ~= "table" then
    return false, "faltan"
  end
  if SNF_RUTAS.esquema ~= Datos.ESQUEMA or SNF_MISIONES.esquema ~= Datos.ESQUEMA then
    return false, "esquema"
  end
  return true
end

function Datos.versiones()
  return { rutas = SNF_RUTAS.version, misiones = SNF_MISIONES.version }
end

-- Las guías laterales de SNF_MISIONES (fase 3); nil si el addon no las trae o no son una tabla.
local function guiasDeMisiones()
  local guias = SNF_MISIONES.guias
  return type(guias) == "table" and guias or nil
end

local function rutasRXP()
  local rutas = rawget(_G, "SnetForeverRutasRXP")
  if type(rutas) == "table" and rutas.esquema == Datos.ESQUEMA and type(rutas.guias) == "table" then
    return rutas
  end
  return nil
end

-- Las rutas de zona de la IA guardadas por el personaje (SnetForeverPJ.ia.guias, fase 4); nil si no hay.
local function guiasDeIA()
  local pj = rawget(_G, "SnetForeverPJ")
  local ia = type(pj) == "table" and pj.ia or nil
  local guias = type(ia) == "table" and ia.guias or nil
  return type(guias) == "table" and guias or nil
end

-- Guía por clave: primero SNF_RUTAS.guias, luego la clave de variante (SNF_RUTAS.alias) y por último SNF_MISIONES.guias
-- (cadenas de clase y mazmorras). nil si no existe.
function Datos.guia(clave)
  local guias = SNF_RUTAS.guias
  local guia = guias[clave]
  if guia then
    return guia
  end
  local alias = SNF_RUTAS.alias
  local principal = alias and alias[clave]
  if principal and guias[principal] then
    return guias[principal]
  end
  local deMisiones = guiasDeMisiones()
  if deMisiones and deMisiones[clave] then
    return deMisiones[clave]
  end
  -- Lote D (D4): la guía lateral «Misiones que te quedan en <continente>» (motor/continente.lua), guardada por personaje.
  local Continente = SNF.Continente
  if Continente and clave == Continente.CLAVE then
    return Continente.guia()
  end
  -- «Mis guías» (motor/misguias.lua): las que escribe el jugador; sus claves empiezan por «Mis guías\».
  local MisGuias = SNF.MisGuias
  local mia = MisGuias and MisGuias.guia(clave)
  if mia then
    return mia
  end
  if type(clave) == "string" and string.sub(clave, 1, 4) == "RXP\\" then
    -- Las importadas desde el juego (motor/importar-rxp.lua) ganan a las del addon SnetForever_RutasRXP: son las mismas
    -- claves y los mismos ids de paso, así que el progreso sirve para las dos.
    local importadas = SNF.ImportarRXP and SNF.ImportarRXP.datos()
    if importadas then
      local propia = importadas.guias[clave] or importadas.guias[importadas.alias[clave] or ""]
      if propia then
        return propia
      end
    end
    local rutas = rutasRXP()
    if rutas then
      return rutas.guias[clave] or (rutas.alias and rutas.guias[rutas.alias[clave]])
    end
  end
  -- Las rutas de zona de la IA (fase 4), las últimas: las de los datos mandan si la clave coincidiera.
  local deIA = guiasDeIA()
  local propia = deIA and deIA[clave]
  if type(propia) == "table" then
    return propia
  end
  -- Lote F: la guía de la ruta de pines activa de la IA («IA\Paradas <id>»), que se rehace de lo guardado (ia/ruta.lua).
  local Ruta = SNF.Ruta
  return Ruta and Ruta.guia and Ruta.guia(clave) or nil
end

-- Claves reales de las guías de los dos addons, ordenadas y sin repetidos.
function Datos.claves()
  local claves, vistas = {}, {}
  local function sumar(guias)
    for clave in pairs(guias) do
      if not vistas[clave] then
        vistas[clave] = true
        claves[#claves + 1] = clave
      end
    end
  end
  sumar(SNF_RUTAS.guias)
  local deMisiones = guiasDeMisiones()
  if deMisiones then
    sumar(deMisiones)
  end
  local MisGuias = SNF.MisGuias
  if MisGuias then
    local mias = {}
    for _, clave in ipairs(MisGuias.claves()) do
      mias[clave] = true
    end
    sumar(mias)
  end
  local rutas = rutasRXP()
  if rutas then
    sumar(rutas.guias)
  end
  local importadas = SNF.ImportarRXP and SNF.ImportarRXP.datos()
  if importadas then
    sumar(importadas.guias)
  end
  local deIA = guiasDeIA()
  if deIA then
    local validas = {}
    for clave, guia in pairs(deIA) do
      if type(guia) == "table" then
        validas[clave] = guia
      end
    end
    sumar(validas)
  end
  local Ruta = SNF.Ruta
  local deRuta = Ruta and Ruta.claveGuia and Ruta.claveGuia()
  if deRuta then
    sumar({[deRuta] = true})
  end
  table.sort(claves)
  return claves
end

function Datos.esMazmorra(areaId)
  return SNF_MISIONES.mazmorra[areaId] ~= nil
end

---------------------------------------------------------------------------------------------------
-- Correcciones por facción y clase.
---------------------------------------------------------------------------------------------------

local memoria = {} -- [tipo][facción .. "|" .. clase][id] = copia con las correcciones
local origen -- la tabla SNF_MISIONES con la que se llenó la memoria (si cambia, se vacía)

-- Copia de `base` con `correccion` aplicada para la clase dada.
local function aplicar(base, correccion, clase)
  local resultado = U.copiar(base)
  if not correccion then
    return resultado
  end
  for campo, valor in pairs(correccion) do
    if valor == "__borrar" then
      resultado[campo] = nil
    elseif type(valor) == "table" and valor.porClase ~= nil then
      local porClase = valor.porClase[clase]
      if porClase == "__borrar" then
        resultado[campo] = nil
      elseif porClase ~= nil then
        resultado[campo] = U.copiar(porClase)
      end
      -- clase ausente: vale el valor base
    else
      resultado[campo] = U.copiar(valor)
    end
  end
  return resultado
end

local function corregido(tipo, id)
  local datos = SNF_MISIONES
  if origen ~= datos then
    memoria = {}
    origen = datos
  end
  local base = datos[tipo][id]
  if base == nil then
    return nil
  end
  local pj = SNF.Personaje.actual()
  local faccion = pj.faccion or ""
  local porFaccion = datos.porFaccion and datos.porFaccion[faccion]
  local correccion = porFaccion and porFaccion[tipo] and porFaccion[tipo][id]
  if not correccion then
    -- Sin corrección para esta facción, la tabla original tal cual: copiarla solo gastaba memoria (tarea 22). Quien la
    -- recibe solo la lee.
    return base
  end
  local clave = faccion .. "|" .. (pj.clase or "")
  local deTipo = memoria[tipo]
  if not deTipo then
    deTipo = {}
    memoria[tipo] = deTipo
  end
  local deClave = deTipo[clave]
  if not deClave then
    deClave = {}
    deTipo[clave] = deClave
  end
  local hecha = deClave[id]
  if not hecha then
    hecha = aplicar(base, correccion, pj.clase)
    deClave[id] = hecha
  end
  return hecha
end

function Datos.mision(q)
  return corregido("quest", q)
end

-- 12-nov (en el juego: «misión completada y no se actualizó»: el jugador tenía la Cabeza de Shadumbra y no sabía que la
-- misión se acepta con clic derecho en ella): los objetos que inician la misión q, si SOLO la inician objetos (ni PNJ ni
-- objeto del mundo: startedBy[3] de QuestieDB y nada en [1] ni [2]). nil si no.
function Datos.objetosQueInician(q)
  local m = Datos.mision(q)
  local por = m and m.startedBy
  if type(por) ~= "table" or type(por[3]) ~= "table" or #por[3] == 0 then
    return nil
  end
  if (type(por[1]) == "table" and #por[1] > 0) or (type(por[2]) == "table" and #por[2] > 0) then
    return nil
  end
  return por[3]
end

function Datos.npc(id)
  return corregido("npc", id)
end

-- Lote B (B1, Minor 14 de la revisión 5.2): ya no hay Datos.objeto ni Datos.item. Nadie los usaba y, desde los datos
-- 2026.11.10.7, el juego solo carga de ítems y objetos una tabla pequeña (nombre, y puntos de los objetos): los
-- registros completos los lee solo la app. Los nombres siguen en Datos.nombreItem y Datos.nombreObjeto.

---------------------------------------------------------------------------------------------------
-- Nombres.
---------------------------------------------------------------------------------------------------

-- Nombre del dato de `tipo` ("quest", "npc", "object", "item") en los datos: español si el idioma activo es es, luego inglés.
local function nombreDeDatos(tipo, id)
  if L.idioma() == "es" then
    local es = SNF_MISIONES.es[tipo][id]
    if es and es.name then
      return es.name
    end
  end
  local base = SNF_MISIONES[tipo][id]
  return base and base.name or nil
end

local function sinDato(id)
  return string.format("#%d", id)
end

-- Una función de la API del juego que puede no existir en este cliente: el nombre o nil.
local function delJuego(espacio, funcion, id)
  local tabla = _G[espacio]
  if type(tabla) ~= "table" or type(tabla[funcion]) ~= "function" then
    return nil
  end
  local nombre = tabla[funcion](id)
  if type(nombre) == "string" and nombre ~= "" then
    return nombre
  end
  return nil
end

function Datos.nombreMision(q)
  if idiomaDelCliente() then
    local nombre = delJuego("C_QuestLog", "GetTitleForQuestID", q)
    if nombre then
      return nombre
    end
  end
  return nombreDeDatos("quest", q) or sinDato(q)
end

function Datos.nombrePNJ(id)
  return nombreDeDatos("npc", id) or sinDato(id)
end

-- Lote «Cadenas de mejoras»: nombre de un objeto del mundo (los de los pasos accept/turnin sobre un objeto).
function Datos.nombreObjeto(id)
  return nombreDeDatos("object", id) or sinDato(id)
end

function Datos.nombreItem(id)
  if idiomaDelCliente() then
    local nombre = delJuego("C_Item", "GetItemNameByID", id)
    if nombre then
      return nombre
    end
  end
  return nombreDeDatos("item", id) or sinDato(id)
end

function Datos.nombreZona(areaId)
  if idiomaDelCliente() then
    local nombre = delJuego("C_Map", "GetAreaInfo", areaId)
    if nombre then
      return nombre
    end
  end
  local viejo = type(SNF_MISIONES.mazmorra) == "table" and SNF_MISIONES.mazmorra[areaId]
  local nuevo = type(SNF_MISIONES.porMazmorra) == "table" and SNF_MISIONES.porMazmorra[areaId]
  return (viejo and viejo.nombre) or (nuevo and nuevo.nombre) or sinDato(areaId)
end

---------------------------------------------------------------------------------------------------
-- PNJ por nombre (tarea D4). Sirven a «Objetivos cercanos»: la guía trae el nombre en inglés y casi nunca el id.
-- Las tres funciones leen SNF_MISIONES.npc (y .es.npc) tal cual, SIN las correcciones por facción y clase de
-- Datos.npc: nombres y puntos de aparición son los de los datos base.
---------------------------------------------------------------------------------------------------

local idsConocidos = {} -- [nombre en minúsculas] = lista de id ordenada (también las vacías), solo de los nombres pedidos
local origenIds -- la tabla SNF_MISIONES con la que se averiguó (si cambia, se olvida)

-- Los id de PNJ de SNF_MISIONES.npc cuyo `name` (inglés) es cada uno de `nombres` (lista de textos), sin distinguir
-- mayúsculas. Devuelve {[nombre en minúsculas] = lista de id ordenada} con todos los nombres pedidos (lista vacía si no hay
-- ninguno); las listas son de solo lectura. UNA sola pasada por SNF_MISIONES.npc para los nombres que aún no se conocen y
-- ninguna si ya se conocían todos. No deja un índice de todos los nombres: con los datos reales costaría ~2 MB de memoria
-- viva, más que todo el resto del addon (tarea D5). Para no pasar `string.lower` por decenas de miles de nombres, antes de
-- bajarlo a minúsculas se mira su longitud y su primera letra, que bastan para descartar casi todos.
function Datos.idsPNJPorNombres(nombres)
  local datos = SNF_MISIONES
  if origenIds ~= datos then
    idsConocidos, origenIds = {}, datos
  end
  local pedidos = {}
  local faltan, hayFaltas = {}, false
  local filtro = {} -- [longitud] = {[primera letra en minúscula (byte)] = true}
  for _, nombre in ipairs(type(nombres) == "table" and nombres or {}) do
    if type(nombre) == "string" then
      local clave = string.lower(nombre)
      pedidos[#pedidos + 1] = clave
      if idsConocidos[clave] == nil and not faltan[clave] then
        faltan[clave] = true
        hayFaltas = true
        local letras = filtro[#clave] or {}
        filtro[#clave] = letras
        letras[string.byte(clave, 1) or 0] = true
      end
    end
  end
  if hayFaltas then
    for clave in pairs(faltan) do
      idsConocidos[clave] = {}
    end
    local npcs = type(datos.npc) == "table" and datos.npc or {}
    for id, npc in pairs(npcs) do
      local propio = type(npc) == "table" and npc.name
      if type(propio) == "string" then
        local letras = filtro[#propio]
        if letras then
          local primera = string.byte(propio, 1) or 0
          if primera >= 65 and primera <= 90 then
            primera = primera + 32
          end
          if letras[primera] then
            local clave = string.lower(propio)
            if faltan[clave] then
              local lista = idsConocidos[clave]
              lista[#lista + 1] = id
            end
          end
        end
      end
    end
    for clave in pairs(faltan) do
      table.sort(idsConocidos[clave])
    end
  end
  local salida = {}
  for _, clave in ipairs(pedidos) do
    salida[clave] = idsConocidos[clave]
  end
  return salida
end

-- Nombre del PNJ en el idioma del CLIENTE (GetLocale), no en el del ajuste del addon: /targetexact compara con lo que
-- enseña el juego. En esES y esMX, el español de los datos y, si falta, el inglés; en los demás, el inglés. nil si el
-- PNJ no existe (no es un texto para enseñar, así que no hay «#id»).
function Datos.nombrePNJCliente(id)
  local cliente = GetLocale()
  if cliente == "esES" or cliente == "esMX" then
    local es = SNF_MISIONES.es.npc[id]
    if es and es.name then
      return es.name
    end
  end
  local base = SNF_MISIONES.npc[id]
  return base and base.name or nil
end

-- Puntos de aparición del PNJ: lista de {mapa = uiMapID, x, y} (x e y en 0-100, como en los datos), ordenada por mapa y
-- con el orden de los datos dentro de cada mapa. Lista vacía si no tiene o no existe.
function Datos.puntosPNJ(id)
  local npc = SNF_MISIONES.npc[id]
  local spawns = npc and npc.spawns
  local puntos = {}
  if type(spawns) ~= "table" then
    return puntos
  end
  local mapas = {}
  for mapa in pairs(spawns) do
    mapas[#mapas + 1] = mapa
  end
  table.sort(mapas)
  for _, mapa in ipairs(mapas) do
    for _, punto in ipairs(spawns[mapa]) do
      puntos[#puntos + 1] = { mapa = mapa, x = punto[1], y = punto[2] }
    end
  end
  return puntos
end

---------------------------------------------------------------------------------------------------
-- T2: sitios de los objetivos de una misión (antes, buscarObjetivo y objetivoDeBase de ia/ruta.lua). Como las funciones
-- de PNJ de arriba, leen SNF_MISIONES tal cual (nombres y puntos de los datos base); la misión, con Datos.mision.
--   Datos.puntosObjeto(id) -> lista de {mapa, x, y}   los spawns de un objeto del mundo, como Datos.puntosPNJ.
--   Datos.objetivoDeBase(q, obj?, k?) -> k | nil       el índice del objetivo en la base: k si la base lo tiene; si no (o
--       sin k), el primero cuyo nombre en inglés o en español es `obj` (sin distinguir mayúsculas; los PNJ, objetos del
--       mundo y objetos de la bolsa, que son los que tienen nombre en los datos).
--   Datos.sitiosObjetivo(q, k, sinPuntos?) -> {grupo, id?, npcs, objetos, puntos} | nil   lo que pide el objetivo k de la base (id: el
--       PNJ, objeto del mundo u objeto de la bolsa que pide, si es uno; nil en el crédito de muerte): grupo 1
--       el PNJ; 2 el objeto del mundo; 3 los PNJ que sueltan el objeto (npcDrops) y los objetos del mundo de donde sale
--       (objectDrops); 5 los PNJ del crédito de muerte; 6 (hechizos), nada. puntos: los de todos ellos, en ese orden
--       (PNJ y luego objetos). nil si la base no tiene la misión o no llega a k objetivos. Nunca se inventa un sitio: en
--       los datos del juego los objetos de la bolsa solo traen el nombre, así que un objetivo del grupo 3 no tiene sitio.
--       Ronda 1: con sinPuntos, la lista de puntos va vacía (quien solo quiere los PNJ no crea una tabla por spawn).
---------------------------------------------------------------------------------------------------

-- Los grupos de `objectives` en el orden del diario (como Misiones.tipoDeBase) y el tipo de dato con nombre de cada uno.
local GRUPOS_OBJETIVO = {1, 2, 3, 5, 6}
local TIPO_GRUPO = {[1] = "npc", [2] = "object", [3] = "item"}

local function enteroPositivo(v)
  return type(v) == "number" and not (SNF.API and SNF.API.esSecreto(v)) and v > 0 and math.floor(v) == v
end

-- Puntos de los spawns {[mapa] = {{x, y}...}} de un dato, ordenados por mapa.
local function puntosDeSpawns(spawns)
  local puntos = {}
  if type(spawns) ~= "table" then
    return puntos
  end
  local mapas = {}
  for mapa in pairs(spawns) do
    mapas[#mapas + 1] = mapa
  end
  table.sort(mapas)
  for _, mapa in ipairs(mapas) do
    for _, punto in ipairs(type(spawns[mapa]) == "table" and spawns[mapa] or {}) do
      puntos[#puntos + 1] = { mapa = mapa, x = punto[1], y = punto[2] }
    end
  end
  return puntos
end

function Datos.puntosObjeto(id)
  local objetos = type(SNF_MISIONES.object) == "table" and SNF_MISIONES.object or {}
  local objeto = objetos[id]
  return puntosDeSpawns(type(objeto) == "table" and objeto.spawns or nil)
end

-- El dato de `tipo` en inglés y en español de los datos base (los dos pueden faltar).
local function datoBase(tipo, id)
  local en = type(SNF_MISIONES[tipo]) == "table" and SNF_MISIONES[tipo][id] or nil
  local es = type(SNF_MISIONES.es) == "table" and type(SNF_MISIONES.es[tipo]) == "table" and SNF_MISIONES.es[tipo][id] or nil
  return type(en) == "table" and en or nil, type(es) == "table" and es or nil
end

-- Recorre los objetivos de la base en el orden del diario: fn(n, grupo, entrada) hasta que devuelva algo.
local function recorrerObjetivos(q, fn)
  local mision = Datos.mision(q)
  local grupos = type(mision) == "table" and mision.objectives or nil
  if type(grupos) ~= "table" then
    return nil
  end
  local n = 0
  for _, g in ipairs(GRUPOS_OBJETIVO) do
    local lista = grupos[g]
    for _, entrada in ipairs(type(lista) == "table" and lista or {}) do
      n = n + 1
      local r = fn(n, g, entrada)
      if r ~= nil then
        return r
      end
    end
  end
  return nil
end

function Datos.objetivoDeBase(q, obj, k)
  if k ~= nil then
    local hallado = recorrerObjetivos(q, function(n)
      return n == k and n or nil
    end)
    if hallado then
      return hallado
    end
  end
  local esSecreto = SNF.API and SNF.API.esSecreto
  if type(obj) ~= "string" or obj == "" or (esSecreto and esSecreto(obj)) then
    return nil
  end
  local buscado = string.lower(obj)
  return recorrerObjetivos(q, function(n, g, entrada)
    local id = type(entrada) == "table" and entrada[1] or nil
    if TIPO_GRUPO[g] and enteroPositivo(id) then
      local en, es = datoBase(TIPO_GRUPO[g], id)
      local nombreEn, nombreEs = en and en.name, es and es.name
      if (type(nombreEn) == "string" and string.lower(nombreEn) == buscado)
        or (type(nombreEs) == "string" and string.lower(nombreEs) == buscado) then
        return n
      end
    end
    return nil
  end)
end

local function anadirIds(lista, ids)
  for _, id in ipairs(type(ids) == "table" and ids or {}) do
    if enteroPositivo(id) then
      lista[#lista + 1] = id
    end
  end
end

function Datos.sitiosObjetivo(q, k, sinPuntos)
  return recorrerObjetivos(q, function(n, g, entrada)
    if n ~= k then
      return nil
    end
    local id = type(entrada) == "table" and entrada[1] or nil
    local sitios = {grupo = g, id = enteroPositivo(id) and g ~= 5 and id or nil, npcs = {}, objetos = {}, puntos = {}}
    if g == 1 and enteroPositivo(id) then
      sitios.npcs[1] = id
    elseif g == 2 and enteroPositivo(id) then
      sitios.objetos[1] = id
    elseif g == 3 and enteroPositivo(id) then
      local item = datoBase("item", id)
      anadirIds(sitios.npcs, item and item.npcDrops)
      anadirIds(sitios.objetos, item and item.objectDrops)
    elseif g == 5 then
      anadirIds(sitios.npcs, id)
    end
    if sinPuntos then
      return sitios
    end
    for _, npc in ipairs(sitios.npcs) do
      for _, p in ipairs(Datos.puntosPNJ(npc)) do
        sitios.puntos[#sitios.puntos + 1] = p
      end
    end
    for _, objeto in ipairs(sitios.objetos) do
      for _, p in ipairs(Datos.puntosObjeto(objeto)) do
        sitios.puntos[#sitios.puntos + 1] = p
      end
    end
    return sitios
  end)
end
