-- SnetForever: lectura del personaje. Personaje.leer() mira al jugador ahora; Personaje.actual() es la copia
-- guardada, que se actualiza al entrar al mundo y al subir de nivel (PLAYER_LEVEL_UP llega antes de que
-- UnitLevel dé el nivel nuevo, así que se usa el del argumento del evento).
--
-- PJ = {nombre, clave, clase, raza, faccion, nivel, sexo, idioma}, el formato que esperan los filtros
-- (nucleo/filtros.lua): clase en mayúsculas ("WARRIOR"), raza como en los filtros ("Orc", "Scourge"...),
-- faccion "Horde", "Alliance" o "Neutral", sexo "male" o "female" y idioma el del cliente ("esMX"...).
-- F3: nombre y clave son los dos el nombre completo («Nombre Apellido» en Forever, Personaje.clave()), o nil si el juego
-- aún no lo da.
--
-- F6b (en el juego, 20-nov): en Forever `/dump GetRealmName()` dio [1]="" (en Cima del Trueno), y lo guardado lleva el reino
-- con espacios («CAMWOW US1 Realm 5 PvE»). Con el reino vacío el comercio no encontraba ninguna ficha ni la casa de la
-- subasta. Personaje.reino() es el ÚNICO sitio que da el reino; todo el que arma una clave con el reino lo usa.
-- Personaje.reino() -> texto | nil, provisional   nunca "". Prueba, cada uno con pcall y sin valores secretos:
--   1. GetRealmName() (el nombre canónico: con espacios, el de lo guardado y el que manda la app en `conocidas`);
--   2. GetNormalizedRealmName() (sin espacios ni guiones);
--   3. el reino de GetPlayerInfoByGUID(UnitGUID("player")) (el 7.º valor; wowpedia: "" si es el reino propio);
--   4. el último reino bueno: el de esta sesión y, si no, el guardado en SnetForeverCuenta.reino de este personaje, el de
--      sus fichas del inventario, el último de la cuenta y el de la identidad de la subasta.
--   El 3 y el 2 (por ese orden) se pasan a la forma con espacios de un reino ya conocido (el de la sesión, el guardado, las
--   fichas, la identidad o las casas conocidas) si es el mismo reino escrito de otra forma (Personaje.mismoReino). Un
--   normalizado sin forma conocida se da tal cual con provisional = true: vale para buscar y apuntar (la migración lo pasa
--   después al bueno), pero no se guarda como el último bueno, no va a la app en la identidad y nunca es el destino de la
--   migración. Si no sabe el reino, nil: entonces no se guarda ni se busca nada con él.
--   Ronda 1: el último bueno sale por este orden: el guardado de este personaje, sus fichas, el último de la cuenta y la
--   identidad; si el personaje tiene lo suyo (el guardado o sus fichas), nunca lo de la cuenta. Con el reino ya sabido en
--   la sesión (y nada que lo contradiga) se da sin recorrer nada, y el camino lento se recuerda mientras el cliente dé lo
--   mismo: el tooltip lo llama muchísimo.
--   Ronda 2: una forma sin espacios solo vale como buena si sale de SnetForeverCuenta.reino o de la identidad (que nunca
--   guardan un provisional); si sale de las fichas o de las casas conocidas (una ficha también se apunta con un provisional)
--   sigue siendo provisional, aunque lleve varias sesiones guardada. Las claves de SNF_PRECIOS.conocidas (la app las escribe
--   con el reino de la identidad, con espacios) cuentan como formas conocidas.
--   Guarda el último bueno (el 1, el 3 o uno conocido; nunca un normalizado suelto) en SnetForeverCuenta.reino = {ultimo,
--   pj = {["Nombre Apellido"] = reino}}: solo reinos y los nombres de los personajes propios, nunca de otros jugadores.
-- Personaje.mismoReino(a, b) -> boolean   el mismo reino escrito de dos formas: iguales sin espacios ni guiones y en
--   minúsculas. Un texto vacío (o solo espacios) no es ningún reino.
local _, SNF = ...
local Personaje = {}
SNF.Personaje = Personaje

-- UnitSex: 2 varón, 3 mujer (1 es desconocido).
local SEXOS = { [2] = "male", [3] = "female" }

-- ¿Es un valor secreto del motor moderno? (API.esSecreto, si existe.)
local function secreto(v)
  local API = SNF.API
  return type(API) == "table" and type(API.esSecreto) == "function" and API.esSecreto(v)
end

-- "Nombre Apellido" con los dos valores de UnitName("player"), o solo el nombre si el segundo falta o está vacío.
-- F3: nil si UnitName falla, si el nombre no es un texto o si alguno de los dos valores es secreto (nunca el primer
-- nombre solo cuando hay apellido: mezclaría a dos personajes con la misma primera palabra).
function Personaje.clave()
  local ok, nombre, segundo = pcall(UnitName, "player")
  if not ok or secreto(nombre) or secreto(segundo) or type(nombre) ~= "string" or nombre == "" then
    return nil
  end
  if type(segundo) == "string" and segundo ~= "" then
    return nombre .. " " .. segundo
  end
  return nombre
end

-- F6b: el reino (ver la cabecera).
local reinoSesion = nil -- el último reino bueno de esta sesión
local reinoGuardado = false -- ya se guardó reinoSesion en SnetForeverCuenta.reino en esta sesión

-- El reino sin espacios ni guiones y en minúsculas, o nil si no es un texto con algo.
local function normal(r)
  if type(r) ~= "string" or secreto(r) then
    return nil
  end
  local n = string.lower((string.gsub(r, "[%s%-]", "")))
  return n ~= "" and n or nil
end

function Personaje.mismoReino(a, b)
  local na = normal(a)
  return na ~= nil and na == normal(b)
end

-- Un reino que da el cliente: un texto con algo (ni secreto ni vacío), o nil.
local function bueno(v)
  if normal(v) then
    return v
  end
  return nil
end

-- Lo que da una función del cliente (protegida), si es un reino.
local function leerReino(nombre, ...)
  local f = rawget(_G, nombre)
  if type(f) ~= "function" then
    return nil
  end
  local ok, v = pcall(f, ...)
  return ok and bueno(v) or nil
end

-- El reino del GUID del jugador (GetPlayerInfoByGUID, el 7.º valor), si lo da.
local function reinoDelGuid()
  local guid = leerReino("UnitGUID", "player")
  local info = rawget(_G, "GetPlayerInfoByGUID")
  if not guid or type(info) ~= "function" then
    return nil
  end
  local ok, _, _, _, _, _, _, reino = pcall(info, guid)
  return ok and bueno(reino) or nil
end

-- SnetForeverCuenta.reino (con crear, se crea; lo que no sea una tabla se guarda en _roto, nunca se tira).
local function guardadoReino(crear)
  local cuenta = rawget(_G, "SnetForeverCuenta")
  if type(cuenta) ~= "table" then
    return nil
  end
  local g = cuenta.reino
  if type(g) ~= "table" then
    if not crear then
      return nil
    end
    g = g == nil and {} or {_roto = g}
    cuenta.reino = g
  end
  return g
end

-- Los reinos ya conocidos. Llama a fn(reino, fuente) con cada uno, por orden, hasta que dé algo:
--   1. "sesion": el de esta sesión; 2. "guardado": el guardado de este personaje (SnetForeverCuenta.reino.pj[clave]);
--   3. "fichas": el de las fichas del inventario de este personaje (f.nombre == clave); 4. "guardado": el último de la
--   cuenta (SnetForeverCuenta.reino.ultimo); 5. "identidad": el de la identidad de la subasta; 6. "casas": los de las casas
--   conocidas guardadas (comercio.conocidas) y los de la foto de la app cargada (SNF_PRECIOS.conocidas), «<reino>|<facción>».
-- Con ciego (para dar un reino sin que lo diga el juego): sin el 6 (pueden ser de otro reino de la cuenta); si el 2 o el 3
-- existen, solo ellos (nunca lo de la cuenta si el personaje tiene lo suyo); y si sus fichas dicen dos reinos distintos, nil.
-- Sin ciego (para reconocer el mismo reino escrito de otra forma) se miran todos.
-- Ronda 2: lo guardado en SnetForeverCuenta.reino, la identidad y el reino de la sesión nunca son provisionales (el de la
-- sesión solo sale de apuntar); las fichas y las casas sí pueden serlo (una ficha se apunta también con un provisional).
local function conocidos(fn, ciego)
  local function probar(r, fuente)
    return bueno(r) and fn(r, fuente) or nil
  end
  local hay = probar(reinoSesion, "sesion")
  if hay then
    return hay
  end
  local clave = Personaje.clave()
  local g = guardadoReino(false)
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and type(cuenta.comercio) == "table" and cuenta.comercio or nil
  local propio = false
  local suyo = clave and g and type(g.pj) == "table" and bueno(g.pj[clave])
  if suyo then
    propio = true
    hay = probar(suyo, "guardado")
    if hay then
      return hay
    end
  end
  local inv = c and type(c.inventario) == "table" and type(c.inventario.pj) == "table" and c.inventario.pj
  if inv and clave then
    local deFichas = nil -- ciego: el reino de sus fichas (false si dicen dos distintos)
    for _, f in pairs(inv) do
      local r = type(f) == "table" and f.nombre == clave and bueno(f.reino)
      if r then
        propio = true
        if not ciego then
          hay = probar(r, "fichas")
          if hay then
            return hay
          end
        elseif deFichas == nil then
          deFichas = r
        elseif deFichas and not Personaje.mismoReino(deFichas, r) then
          deFichas = false
        elseif deFichas and string.find(r, "[%s%-]") and not string.find(deFichas, "[%s%-]") then
          deFichas = r -- el mismo reino: mejor con los espacios
        end
      end
    end
    if deFichas then
      return fn(deFichas, "fichas")
    end
  end
  if ciego and propio then
    return nil
  end
  hay = (g and probar(g.ultimo, "guardado")) or (c and type(c.identidad) == "table" and probar(c.identidad.reino, "identidad"))
  if hay or ciego then
    return hay or nil
  end
  local precios = rawget(_G, "SNF_PRECIOS")
  for i = 1, 2 do
    local casas
    if i == 1 then
      casas = c and c.conocidas
    else
      casas = type(precios) == "table" and precios.conocidas
    end
    if type(casas) == "table" then
      for k in pairs(casas) do
        hay = type(k) == "string" and probar(string.match(k, "^(.*)|[^|]*$"), "casas")
        if hay then
          return hay
        end
      end
    end
  end
  return nil
end

-- ¿Vale como reino bueno lo que salió de esa fuente? Con espacios o guiones, sí (un provisional nunca los tiene); sin ellos,
-- solo si sale de lo que nunca guarda un provisional (ronda 2).
local FUENTE_BUENA = {sesion = true, guardado = true, identidad = true}
local function seguro(k, fuente)
  return FUENTE_BUENA[fuente] == true or string.find(k, "[%s%-]") ~= nil
end

-- El camino lento (sin GetRealmName y sin poder dar el de la sesión) se recuerda con lo que dieron el normalizado y el del
-- GUID: mientras den lo mismo no se vuelve a recorrer lo guardado (el tooltip llama a Personaje.reino() muchísimo).
-- Ronda 2: también con la foto de la app cargada (SNF_PRECIOS): una foto nueva trae casas conocidas nuevas.
local lentoHay, lentoN, lentoG, lentoR, lentoP, lentoF = false, nil, nil, nil, nil, nil
local pendiente = false -- ronda 2: reinoSesion lo dio el juego pero aún no se pudo guardar del todo (sin la clave)

-- Guarda el último reino bueno (una vez por sesión y reino; sin la clave del personaje o sin la cuenta guardada, se
-- reintenta en la siguiente llamada, también por el camino rápido).
local function apuntar(r)
  if r == reinoSesion and reinoGuardado then
    return
  end
  if r ~= reinoSesion then
    lentoHay = false
  end
  reinoSesion = r
  local g = guardadoReino(true)
  if not g then
    reinoGuardado, pendiente = false, true -- aún no hay SnetForeverCuenta: se guarda en la siguiente
    return
  end
  g.ultimo = r
  local clave = Personaje.clave()
  if clave then
    if type(g.pj) ~= "table" then
      g.pj = g.pj == nil and {} or {_roto = g.pj}
    end
    g.pj[clave] = r
  end
  reinoGuardado = clave ~= nil
  pendiente = not reinoGuardado
end

-- La forma ya conocida del mismo reino (con espacios o guiones si hay una así) y si vale como buena (seguro), o nil.
local function formaConocida(r)
  local otra, otraSegura = nil, false
  local conEspacios = conocidos(function(k, fuente)
    if Personaje.mismoReino(k, r) then
      if string.find(k, "[%s%-]") then
        return k
      end
      if not otra or (not otraSegura and seguro(k, fuente)) then
        otra, otraSegura = k, seguro(k, fuente)
      end
    end
    return nil
  end)
  if conEspacios then
    return conEspacios, true
  end
  return otra, otraSegura
end

local function reinoLento(normalizado, delGuid)
  local k, bien = nil, false
  if delGuid then
    k, bien = formaConocida(delGuid)
  end
  if not k and normalizado then
    k, bien = formaConocida(normalizado)
  end
  if k and bien then
    apuntar(k) -- conocido como bueno
    return k
  end
  if delGuid then -- ronda 3: una forma conocida que no es segura no se guarda; el del GUID sí (lo da el juego)
    apuntar(delGuid)
    return delGuid
  end
  if normalizado then
    -- provisional: el reino escrito sin espacios (o una forma sin espacios que solo sale de fichas o casas, que pudo
    -- apuntarse con un provisional); ni se guarda como el bueno ni es destino de nada
    return k or normalizado, true
  end
  -- El último bueno (ver conocidos, con ciego). Vale para esta sesión, pero no se vuelve a guardar: esta vez no lo ha dado
  -- el juego. Ronda 2: uno sin espacios sacado de las fichas sigue siendo provisional.
  local fuenteR
  local r = conocidos(function(x, fuente)
    fuenteR = fuente
    return x
  end, true)
  if not r then
    return nil
  end
  if not seguro(r, fuenteR) then
    return r, true
  end
  reinoSesion, pendiente = r, false
  return r
end

-- Personaje.reino() -> reino | nil, provisional   (ver la cabecera; provisional = true si es solo el normalizado)
function Personaje.reino()
  local r = leerReino("GetRealmName")
  if r then
    apuntar(r)
    return r
  end
  local normalizado = leerReino("GetNormalizedRealmName")
  local delGuid = reinoDelGuid()
  if reinoSesion and (not normalizado or Personaje.mismoReino(reinoSesion, normalizado))
    and (not delGuid or Personaje.mismoReino(reinoSesion, delGuid)) then
    if pendiente then
      apuntar(reinoSesion) -- ronda 2: el guardado que faltaba (la clave del personaje aún no estaba)
    end
    return reinoSesion -- lo de la sesión, si nada lo contradice: sin recorrer nada
  end
  local foto = rawget(_G, "SNF_PRECIOS")
  if lentoHay and lentoN == normalizado and lentoG == delGuid and lentoF == foto then
    return lentoR, lentoP
  end
  local provisional
  r, provisional = reinoLento(normalizado, delGuid)
  -- Sin la clave del personaje o sin la cuenta guardada aún no se ha podido mirar todo: no se recuerda.
  lentoHay = Personaje.clave() ~= nil and type(rawget(_G, "SnetForeverCuenta")) == "table"
  lentoN, lentoG, lentoR, lentoP, lentoF = normalizado, delGuid, r, provisional, foto
  return r, provisional
end

-- El personaje tal como está ahora.
function Personaje.leer()
  local _, clase = UnitClass("player")
  local _, raza = UnitRace("player")
  return {
    nombre = Personaje.clave(), -- F3: el nombre completo («Nombre Apellido»), como la clave
    clave = Personaje.clave(),
    clase = clase,
    raza = raza,
    faccion = (UnitFactionGroup("player")),
    nivel = UnitLevel("player"),
    sexo = SEXOS[UnitSex("player")],
    idioma = GetLocale(),
  }
end

local copia

-- La copia guardada (se lee la primera vez que se pide si aún no hay).
function Personaje.actual()
  if not copia then
    copia = Personaje.leer()
  end
  return copia
end

local marco = CreateFrame("Frame")
marco:RegisterEvent("PLAYER_ENTERING_WORLD")
marco:RegisterEvent("PLAYER_LEVEL_UP")
marco:SetScript("OnEvent", function(_, evento, nivel)
  copia = Personaje.leer()
  if evento == "PLAYER_LEVEL_UP" and nivel then
    copia.nivel = nivel
  end
end)
