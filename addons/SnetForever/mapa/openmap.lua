-- SnetForever: contenido de la sección «Tus misiones aquí» de la ficha de mazmorra de OpenMap (fase 5, R13). OpenMap es
-- un addon aparte y OPCIONAL: solo se usa su API pública (OpenMapAPI, con rawget y pcall); nunca su ns, sus marcos ni sus
-- datos. Calcula, con el registro del jugador y la base de datos de misiones (SNF_MISIONES.porMazmorra, fase 3), qué
-- mazmorra es la ficha y qué líneas de texto mostrar, y las registra con OpenMapAPI.RegisterDungeonSection. Aquí no hay
-- nada protegido ni se juega por el jugador.
--
-- OpenMapFicha.seccion(info) -> titulo, lineas | nil   Lo que ve OpenMap. Nunca lanza error (pcall); nil si openmap.usar o
--                                              openmap.ficha están apagados, o si algo falla.
-- OpenMapFicha.registrar() -> boolean          Con OpenMapAPI.major == 1 y RegisterDungeonSection, registra «SnetForever».
--                                              Se llama en PLAYER_LOGIN y en ADDON_LOADED de OpenMap.
-- OpenMapFicha.estado() -> "sin_openmap" | "otra_version" | "sin_api" | "registrada", version?
-- Refresco: con QUEST_ACCEPTED/TURNED_IN/REMOVED, QUEST_LOG_UPDATE, PLAYER_LEVEL_UP y los ajustes openmap.*, con el mapa
-- abierto, se vuelve a registrar (OpenMap repinta la ficha) como mucho una vez por segundo.
--
-- OpenMapFicha.areasDeInfo(info) -> {area...}   Las mazmorras de la ficha, por NOMBRE, en el orden de info.instances y sin
--                                              repetir. `info` es la que da OpenMap ({mapID, instances = {{name, ...}}}).
--                                              Para cada name se busca su forma normal (sin |c…/|r, sin espacios a los
--                                              lados y en minúsculas); si no sale, sin el ala entre paréntesis del final; y
--                                              si tampoco, sin « - ala». Si no sale ninguna y hay info.mapID, por el nombre
--                                              de ese mapa. Una info que no es tabla da {}. El índice de nombres lleva
--                                              GetRealZoneText(instanciaId), el nombre de cada mazmorra de la base y
--                                              Datos.nombreZona(area), y se rehace si cambian las tablas de SNF_MISIONES.
-- OpenMapFicha.lineas(areas, pj?) -> titulo, {linea...} | nil
--                                              nil si areas está vacía. La primera línea es el resumen; con más de un área,
--                                              cada una lleva su cabecera. Manda el juego: una misión del registro entra
--                                              aunque la base diga otra cosa de facción, clase o raza, y las entregadas solo
--                                              cuentan para «Ya hechas». Como mucho MAX_LINEAS, con «…y n más» al final.
-- OpenMapFicha.colorNivel(nivelMision, nivel) -> "rrggbb"   El de GetQuestDifficultyColor (llamada protegida) o, si no hay,
--                                              el de la diferencia de nivel.
-- OpenMapFicha.MAX_LINEAS = 24                 OpenMap admite 40; la ficha se queda corta a propósito.
local _, SNF = ...

local OpenMapFicha = {}
SNF.OpenMapFicha = OpenMapFicha

OpenMapFicha.MAX_LINEAS = 24

local floor = math.floor
local esSecreto = SNF.API.esSecreto

-- «|» pasa a «||»: un nombre ajeno nunca puede meter un código de color en la ficha.
local function esc(texto)
  return (string.gsub(tostring(texto), "|", "||"))
end

-- La función de C_Map con ese nombre, sin pasar por su metatabla; nil si no está.
local function funcionDeMapa(nombre)
  local mapas = rawget(_G, "C_Map")
  if type(mapas) ~= "table" then
    return nil
  end
  local f = rawget(mapas, nombre)
  return type(f) == "function" and f or nil
end

-- Orden de los grupos de misiones dentro de cada mazmorra.
local GRUPO_ENTREGAR, GRUPO_REGISTRO, GRUPO_COGER, GRUPO_PREVIA, GRUPO_NIVEL = 1, 2, 3, 4, 5

---------------------------------------------------------------------------------------------------
-- Ayudas
---------------------------------------------------------------------------------------------------

-- ¿Devuelve f(...) algo verdadero? Una API que falla cuenta como que no.
local function si(f, ...)
  local ok, valor = pcall(f, ...)
  return ok and valor and true or false
end

-- El texto sin códigos de color |c… y |r y sin espacios a los lados (con sus mayúsculas), o nil si no es texto o queda vacío.
local function limpio(texto)
  if type(texto) ~= "string" or esSecreto(texto) then
    return nil
  end
  texto = string.gsub(texto, "|c%x%x%x%x%x%x%x%x", "")
  texto = string.gsub(texto, "|r", "")
  texto = string.gsub(texto, "^%s+", "")
  texto = string.gsub(texto, "%s+$", "")
  if texto == "" then
    return nil
  end
  return texto
end

-- La forma normal de un nombre: limpio y en minúsculas.
local function forma(texto)
  texto = limpio(texto)
  return texto and string.lower(texto) or nil
end

---------------------------------------------------------------------------------------------------
-- Qué mazmorra es: índice de nombres
---------------------------------------------------------------------------------------------------

local indice -- [forma normal del nombre] = área
local origen, origenInstancias, origenMazmorras, origenIdioma -- con lo que se hizo el índice

local function listaOrdenada(tabla)
  local claves = {}
  for clave in pairs(tabla) do
    if type(clave) == "number" then
      claves[#claves + 1] = clave
    end
  end
  table.sort(claves)
  return claves
end

local function indiceDeNombres()
  local datos = rawget(_G, "SNF_MISIONES")
  if type(datos) ~= "table" then
    return {}
  end
  local instancias = type(datos.instancias) == "table" and datos.instancias or {}
  local porMazmorra = type(datos.porMazmorra) == "table" and datos.porMazmorra or {}
  local idioma = SNF.L.idioma()
  if indice and origen == datos and origenInstancias == instancias and origenMazmorras == porMazmorra
    and origenIdioma == idioma then
    return indice
  end
  local nuevo = {}
  local function poner(nombre, area)
    local clave = forma(nombre)
    if clave and nuevo[clave] == nil and type(porMazmorra[area]) == "table" then
      nuevo[clave] = area
    end
  end
  -- 1.º el nombre del cliente de cada instancia (el mismo que usa OpenMap), 2.º el de la base, 3.º el de Datos.nombreZona.
  local nombreReal = rawget(_G, "GetRealZoneText")
  if type(nombreReal) == "function" then
    for _, instancia in ipairs(listaOrdenada(instancias)) do
      local ok, nombre = pcall(nombreReal, instancia)
      if ok and not esSecreto(nombre) then
        poner(nombre, instancias[instancia])
      end
    end
  end
  local areas = listaOrdenada(porMazmorra)
  for _, area in ipairs(areas) do
    poner(porMazmorra[area].nombre, area)
  end
  for _, area in ipairs(areas) do
    local ok, nombre = pcall(SNF.Datos.nombreZona, area)
    if ok then
      poner(nombre, area)
    end
  end
  if next(nuevo) == nil then
    return nuevo -- sin ningún nombre real no se guarda: puede que los nombres lleguen después
  end
  indice, origen, origenInstancias, origenMazmorras, origenIdioma = nuevo, datos, instancias, porMazmorra, idioma
  return nuevo
end

-- El área de un nombre: tal cual; si no, sin el ala entre paréntesis del final; si no, sin « - ala». nil si no sale.
local function areaDeNombre(porNombre, nombre)
  local texto = limpio(nombre)
  if not texto then
    return nil
  end
  local area = porNombre[string.lower(texto)]
  if area then
    return area
  end
  texto = limpio((string.gsub(texto, "%s*%b()$", ""))) -- ojo: gsub da dos valores
  if not texto then
    return nil
  end
  area = porNombre[string.lower(texto)]
  if area then
    return area
  end
  texto = limpio((string.gsub(texto, "%s+%-%s+.*$", "")))
  return texto and porNombre[string.lower(texto)] or nil
end

function OpenMapFicha.areasDeInfo(info)
  if type(info) ~= "table" then
    return {}
  end
  local porNombre = indiceDeNombres()
  local salida, vistas = {}, {}
  local function anotar(area)
    if area and not vistas[area] then
      vistas[area] = true
      salida[#salida + 1] = area
    end
  end
  if type(info.instances) == "table" then
    for _, instancia in ipairs(info.instances) do
      if type(instancia) == "table" then
        anotar(areaDeNombre(porNombre, instancia.name))
      end
    end
  end
  local infoMapa = funcionDeMapa("GetMapInfo")
  if #salida == 0 and type(info.mapID) == "number" and infoMapa then
    local ok, mapa = pcall(infoMapa, info.mapID)
    if ok and type(mapa) == "table" then
      anotar(areaDeNombre(porNombre, mapa.name))
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Color por nivel
---------------------------------------------------------------------------------------------------

local function componente(valor)
  if type(valor) ~= "number" then
    return nil
  end
  return math.max(0, math.min(255, floor(valor * 255 + 0.5)))
end

function OpenMapFicha.colorNivel(nivelMision, nivel)
  local dificultad = rawget(_G, "GetQuestDifficultyColor")
  if type(dificultad) == "function" then
    local ok, c = pcall(dificultad, nivelMision)
    if ok and type(c) == "table" then
      local r, g, b = componente(c.r), componente(c.g), componente(c.b)
      if r and g and b then
        return string.format("%02x%02x%02x", r, g, b)
      end
    end
  end
  local diferencia = nivelMision - nivel
  if diferencia >= 5 then
    return "ff1919"
  elseif diferencia >= 3 then
    return "ff8040"
  elseif diferencia >= -2 then
    return "ffff00"
  end
  local gris = 10
  if nivel < 20 then
    gris = 6
  elseif nivel < 40 then
    gris = 8
  end
  if nivelMision > nivel - gris then
    return "40bf40"
  end
  return "808080"
end

---------------------------------------------------------------------------------------------------
-- Líneas
---------------------------------------------------------------------------------------------------

-- Sitio donde se coge una misión: el nombre del mapa, o el del PNJ.
local function dondeSeCoge(recoge)
  if type(recoge) ~= "table" then
    return "?"
  end
  local infoMapa = funcionDeMapa("GetMapInfo")
  if type(recoge.mapa) == "number" and infoMapa then
    local ok, mapa = pcall(infoMapa, recoge.mapa)
    local nombre = ok and type(mapa) == "table" and limpio(mapa.name)
    if nombre then
      return esc(nombre)
    end
  end
  if recoge.tipo == "npc" and type(recoge.id) == "number" then
    return esc(SNF.Datos.nombrePNJ(recoge.id))
  end
  return "?"
end

-- El nombre de la primera previa que falta, o nil. `previas`: basta una entregada; `todas`: hacen falta todas.
local function previaQueFalta(e)
  if type(e.previas) == "table" and #e.previas > 0 then
    for _, q in ipairs(e.previas) do
      if si(SNF.Misiones.entregada, q) then
        return nil
      end
    end
    return esc(SNF.Datos.nombreMision(e.previas[1]))
  end
  if type(e.todas) == "table" then
    for _, q in ipairs(e.todas) do
      if not si(SNF.Misiones.entregada, q) then
        return esc(SNF.Datos.nombreMision(q))
      end
    end
  end
  return nil
end

-- grupo y texto del estado de una misión que entra en la lista.
local function estado(e, nivel, registro)
  local L = SNF.L
  if registro then
    if si(SNF.Misiones.completa, e.q) then
      return GRUPO_ENTREGAR, L.t("OPENMAP_ENTREGAR")
    end
    return GRUPO_REGISTRO, L.t("OPENMAP_REGISTRO")
  end
  if type(e.nivel) == "number" and e.nivel > nivel then
    return GRUPO_NIVEL, L.t("OPENMAP_NIVEL", floor(e.nivel))
  end
  local previa = previaQueFalta(e)
  if previa then
    return GRUPO_PREVIA, L.t("OPENMAP_PREVIA", previa)
  end
  if type(e.recoge) == "table" and e.recoge.enMazmorra then
    return GRUPO_COGER, L.t("OPENMAP_COGER_DENTRO")
  end
  return GRUPO_COGER, L.t("OPENMAP_COGER", dondeSeCoge(e.recoge))
end

local function antes(a, b)
  if a.grupo ~= b.grupo then
    return a.grupo < b.grupo
  end
  if a.nivelMision ~= b.nivelMision then
    return a.nivelMision < b.nivelMision
  end
  return a.q < b.q
end

-- Las líneas de una mazmorra, ordenadas, y sus cuentas: {lineas}, total, aNivel, hechas.
local function lineasDeArea(zona, pj, nivel)
  local pendientes, total, aNivel, hechas = {}, 0, 0, 0
  for _, e in ipairs(type(zona) == "table" and zona.misiones or {}) do
    if type(e) == "table" and type(e.q) == "number" then
      local registro = si(SNF.Misiones.enDiario, e.q)
      if not registro and si(SNF.Misiones.entregada, e.q) then
        hechas = hechas + 1
      elseif registro or SNF.Contexto.entradaCumple(e, pj) then
        local nivelMision = e.nivelMision or e.nivel or nivel
        total = total + 1
        if nivelMision >= nivel - 3 and nivelMision <= nivel + 5 then
          aNivel = aNivel + 1
        end
        local grupo, texto = estado(e, nivel, registro)
        pendientes[#pendientes + 1] = {q = e.q, grupo = grupo, nivelMision = nivelMision, estado = texto}
      end
    end
  end
  table.sort(pendientes, antes)
  local lineas = {}
  for i, p in ipairs(pendientes) do
    local nombre = esc(SNF.Datos.nombreMision(p.q))
    lineas[i] = string.format("|cff%s[%d]|r %s — %s", OpenMapFicha.colorNivel(p.nivelMision, nivel), floor(p.nivelMision),
      nombre, p.estado)
  end
  return lineas, total, aNivel, hechas
end

function OpenMapFicha.lineas(areas, pj)
  if type(areas) ~= "table" or #areas == 0 then
    return nil
  end
  local L = SNF.L
  pj = pj or SNF.Personaje.actual()
  local nivel = pj.nivel or 1
  local datos = rawget(_G, "SNF_MISIONES")
  local porMazmorra = type(datos) == "table" and type(datos.porMazmorra) == "table" and datos.porMazmorra or {}
  local total, aNivel, hechas = 0, 0, 0
  local elementos = {} -- {texto, mision = true|false}: cabeceras de área y líneas de misión
  for _, area in ipairs(areas) do
    local lineas, t, n, h = lineasDeArea(porMazmorra[area], pj, nivel)
    total, aNivel, hechas = total + t, aNivel + n, hechas + h
    if #lineas > 0 then
      if #areas > 1 then
        elementos[#elementos + 1] = {texto = "|cffd2d2dc" .. esc(SNF.Datos.nombreZona(area)) .. "|r", mision = false}
      end
      for _, texto in ipairs(lineas) do
        elementos[#elementos + 1] = {texto = texto, mision = true}
      end
    end
  end
  if total == 0 then
    return L.t("OPENMAP_TITULO"), {L.t("OPENMAP_NINGUNA")}
  end
  local resumen = L.t("OPENMAP_RESUMEN", aNivel, total)
  if hechas > 0 then
    resumen = resumen .. "  ·  " .. L.t("OPENMAP_HECHAS", hechas)
  end
  local salida = {resumen}
  local caben = OpenMapFicha.MAX_LINEAS - 1
  local ultimo = #elementos
  if #elementos > caben then
    ultimo = caben - 1 -- la última línea es «…y n más»
    while ultimo > 0 and not elementos[ultimo].mision do
      ultimo = ultimo - 1 -- una cabecera sin misiones debajo sobra
    end
  end
  for i = 1, ultimo do
    salida[#salida + 1] = elementos[i].texto
  end
  local sobran = 0
  for i = ultimo + 1, #elementos do
    if elementos[i].mision then
      sobran = sobran + 1
    end
  end
  if sobran > 0 then
    salida[#salida + 1] = L.t("OPENMAP_MAS", sobran)
  end
  return L.t("OPENMAP_TITULO"), salida
end

---------------------------------------------------------------------------------------------------
-- Registro en OpenMap (R13)
---------------------------------------------------------------------------------------------------

local DUENO = "SnetForever"
local registrada = nil -- la OpenMapAPI en la que ya estamos registrados
local pendiente = false -- hay un refresco esperando su segundo

-- La OpenMapAPI si es la que sabemos usar (major 1 y con RegisterDungeonSection), o nil y el estado que corresponde.
local function apiUsable()
  local api = rawget(_G, "OpenMapAPI")
  if type(api) ~= "table" then
    return nil, "sin_openmap"
  end
  if rawget(api, "major") ~= 1 then
    return nil, "otra_version", rawget(api, "major")
  end
  if type(rawget(api, "RegisterDungeonSection")) ~= "function" then
    return nil, "sin_api"
  end
  return api
end

-- La función que ve OpenMap. Nunca lanza error: OpenMap enseñaría a sus jugadores los errores de nuestra sección.
function OpenMapFicha.seccion(info)
  local ok, titulo, lineas = pcall(function()
    if SNF.Ajustes.get("openmap.usar") == false or SNF.Ajustes.get("openmap.ficha") == false then
      return nil
    end
    return OpenMapFicha.lineas(OpenMapFicha.areasDeInfo(info))
  end)
  if ok and type(titulo) == "string" and type(lineas) == "table" then
    return titulo, lineas
  end
  return nil
end

-- Hace (o repite: OpenMap vuelve a pintar la ficha) el registro. Devuelve si salió bien.
local function llamarRegistro(api)
  return pcall(api.RegisterDungeonSection, DUENO, OpenMapFicha.seccion)
end

-- «sin_openmap» | «otra_version» | «sin_api» | «registrada», y la versión de la API (o el major si es otro).
function OpenMapFicha.estado()
  local api, estado, version = apiUsable()
  if not api then
    return estado, version
  end
  if registrada ~= api then
    -- Hay API pero no es la de nuestro registro: o aún no se intentó o falló.
    return "sin_api"
  end
  local v = rawget(api, "version")
  return "registrada", type(v) == "number" and v or nil
end

local refrescar -- (más abajo)
local EVENTOS_REFRESCO = {"QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE", "PLAYER_LEVEL_UP"}

function OpenMapFicha.registrar()
  local api = apiUsable()
  if not api then
    return false
  end
  if registrada == api then
    return true
  end
  if llamarRegistro(api) then
    registrada = api
    -- Los eventos solo se piden con OpenMap registrado: sin él, el addon no cambia nada (escuchar no repite).
    for _, evento in ipairs(EVENTOS_REFRESCO) do
      SNF.escuchar(evento, refrescar)
    end
    return true
  end
  return false
end

-- Vuelve a registrar para que OpenMap repinte la ficha, como mucho una vez por segundo y solo con el mapa abierto.
function refrescar()
  if pendiente or registrada == nil then
    return
  end
  local mapa = rawget(_G, "WorldMapFrame")
  if type(mapa) ~= "table" or not si(mapa.IsShown, mapa) then
    return
  end
  pendiente = true
  C_Timer.After(1, function()
    pendiente = false
    local api = apiUsable()
    local abierto = rawget(_G, "WorldMapFrame")
    if api and registrada == api and type(abierto) == "table" and si(abierto.IsShown, abierto) then
      llamarRegistro(api)
    end
  end)
end

SNF.escuchar("PLAYER_LOGIN", OpenMapFicha.registrar)
SNF.escuchar("ADDON_LOADED", function(nombre)
  if nombre == "OpenMap" then
    OpenMapFicha.registrar()
  end
end)
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if type(clave) == "string" and string.sub(clave, 1, 8) == "openmap." then
    refrescar()
  end
end)
