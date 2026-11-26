-- SnetForever: precios de la app para el comercio (fase 1). La app baja cada hora la subasta de la API de Blizzard y
-- deja los precios en 8 carpetas-ranura «SnetForever_P01…P08» (LoadOnDemand, cada una con p1.lua…p6.lua). Contrato con
-- la app (Task 7, decisión del coordinador):
--   · la foto de las hh:22:37 (UTC, `generado` en segundos desde 1970, sin redondear) va a la ranura
--     (floor(generado / 3600) % 8) + 1: cada hora tiene su ranura y la de hace 8 horas se pisa;
--   · p1.lua abre SNF_PRECIOS = {v = 1, seq, generado, region, conocidas = {["<reino>|<faccion>"] = casa}, casas = {},
--     grupos = {{clave, nombre = {es, en}, tipo, objetos}}, nombres = {}} si no hay uno o tiene seq menor;
--   · p2.lua…p6.lua empiezan con «local P = SNF_PRECIOS; if not (P and P.seq == N) then return end» y añaden
--     casas[casa][item] = {precio, cantidad, normal, tendencia, ritmo, vendidosDia, poco, subastas, conTendencia}
--     (ritmo y vendidosDia -1 si no se saben; poco 0 o 1). subastas y conTendencia (1 si la tendencia se sabe; si no, 0
--     y la tendencia va a 0) son de T1b: una app de antes escribe solo los 7 primeros y se lee igual. Qué mide cada
--     número (precio = compra mínima, normal = valor de mercado, ritmo = parte de las subastas que sale sin caducar,
--     vendidosDia = unidades que salen sin caducar al día) lo explica la cabecera de app/src/comercio/historial.mjs.
--     F5: detrás, un 1 (el 10.º) si el objeto es una mercancía: sus ritmo y vendidosDia ya no cuentan las cancelaciones
--     de encima de lo más barato que sigue intacto; sin él (un objeto suelto, o una app de antes) es false;
--   · p6.lua acaba con «SNF_PRECIOS.completo = true»: una ranura sin eso (un archivo del medio roto, una escritura a
--     medias) no se acepta.
-- El cliente solo carga una vez por sesión cada addon, así que solo se cargan las dos ranuras candidatas de la hora
-- actual: cada carga gasta una ranura hasta /reload.
--
-- Precios.RANURAS = 8, Precios.HORA = 3600, Precios.VIEJOS = 7200 (segundos), Precios.MINUTO_FOTO = 35 (la app escribe
-- la foto de la hora h hacia las hh:22-hh:30; pregunta a la API hasta las hh:50).
-- Precios.nombre(i)                         «SnetForever_P03» para i = 3.
-- Precios.ranuraDeHora(h) -> i              (h % 8) + 1, con h = floor(segundos / 3600).
-- Precios.cargar() -> boolean               con t = SNF.API.horaServidor(), h = floor(t / 3600) y m = su minuto:
--                                           · m < MINUTO_FOTO: solo la ranura de h - 1 (la de h aún no está escrita y
--                                             cargarla la gastaría con la foto de hace 8 horas);
--                                           · m >= MINUTO_FOTO: la de h, que se acepta solo si su foto es de la hora h;
--                                             si no se acepta, la de h - 1.
--                                           La de h - 1 solo se prueba si lo cargado es de antes de h - 1 (o no hay
--                                           nada). Cada ranura se carga como mucho una vez por sesión, se acepta solo
--                                           si es válida y más nueva que la actual (generado mayor, o igual y seq
--                                           mayor) y nunca se carga otra. Válida = v 1, seq, generado, casas, completo
--                                           y la región del cliente (si las dos se saben). Antes de cada carga pone
--                                           SNF_PRECIOS = nil y después deja en SNF_PRECIOS los precios aceptados.
--                                           Devuelve si hay precios.
-- Precios.de(item, casa?) -> {precio, cantidad, normal, tendencia, ritmo|nil, vendidosDia|nil, poco, subastas|nil,
--                               conTendencia, mercancia} | nil   (subastas nil y conTendencia false con una fila de
--                               antes de T1b; mercancia, F5, false si la fila no trae el 1 del final)
--                                           los datos de la app del objeto en la casa (por defecto, con la subasta
--                                           abierta la suya, la de Precios.alAbrir, y, cerrada, la de
--                                           Precios.consultar: F6, nunca la de otra facción con una subasta abierta).
--                                           poco es booleano. nil si no hay precios, ni casa, o la ranura no trae esa
--                                           casa u objeto: la ventana trabaja solo con el escaneo.
-- Precios.historico(item, casa?) -> datos | nil, razon, cobertura   Fase 2: el histórico propio de la app (otra serie,
--                                           no `normal`), de la misma casa que Precios.de. item es el id del objeto (la
--                                           app no distingue variantes). datos = {valor, dias, muestras, desde, hasta,
--                                           maxDiasSinDato,
--                                           ventana, minDias, casa, edad}: desde y hasta en segundos (inicio del primer y
--                                           del último día que cuenta) y edad la de la foto (Precios.edad()). Sin dato,
--                                           nil, la razón y, si la fila la trae, la cobertura (la misma tabla sin valor):
--                                           "sin-precios" (no hay ranura cargada), "sin-casa" (la casa no se conoce),
--                                           "casa-sin-datos" (la ranura no trae esa casa), "formato-anterior" (la ranura
--                                           es de una app de antes de la fase 2), "no-cabe" (la app lo quitó para que
--                                           cupieran los precios), "sin-datos" (el objeto no tiene días), "pocos-dias" o
--                                           "vencido" (lo dice la app, o el último día que cuenta tiene más de
--                                           maxDiasSinDato días frente a la hora del servidor).
-- Precios.regional(item) -> cobre, info | nil, razon   el precio regional de la app (el DBRegionMarketAvg de TSM: la media
--                                           de mercado de las casas de toda la región, app/src/comercio/regional.mjs).
--                                           No depende de la casa. info = {casas, desde, hora, edad}: cuántas casas de la
--                                           región cuentan y la hora (segundos) de su foto más vieja y más nueva. Sin
--                                           dato: "sin-precios", "formato-anterior" (ranura de una app de antes),
--                                           "no-cabe" (la app lo quitó para que cupieran los precios) o "sin-datos".
-- Precios.consultar() -> boolean, motivo?   Task 20d: lectura de solo consulta sin la subasta abierta (el tooltip de
--                                           los objetos): carga la ranura de la hora anterior, la apunta como gastada y
--                                           calcula la casa. Una sola vez; en combate espera. Ver su comentario
--                                           más abajo.
-- Precios.edad() -> segundos | nil          cuánto hace que se hizo la foto de los precios cargados.
-- Precios.generado() -> segundos | nil      F1 (ronda 3): la hora de esa foto (su `generado`).
-- Precios.agotadas() -> boolean             las ranuras candidatas de ahora ya se cargaron en la sesión (antes del
--                                           minuto MINUTO_FOTO, la de h - 1; después, las de h y h - 1).
-- Precios.hayQueRecargar() -> boolean       lo que decidió el último cargar(): hace falta /reload para ver precios más
--                                           nuevos. Sí cuando (a) la ranura que debería traer lo más nuevo ahora (la de
--                                           h desde el minuto MINUTO_FOTO, la de h - 1 antes) ya se gastó antes en la
--                                           sesión, los precios son de una hora anterior a la suya y tienen más de una
--                                           hora; o (b) los precios tienen más de Precios.VIEJOS y no se pudo aceptar
--                                           ninguna candidata.
-- Precios.identidad() -> {region, reino, faccion}   GetCVar("portal"), el reino y UnitFactionGroup("player"). Un dato
--                                           que no se puede leer, nil. F6b: el reino es SNF.Comercio.reino() (el de
--                                           SNF.Personaje.reino(), con espacios: «CAMWOW US1 Realm 5 PvE»); en Forever
--                                           GetRealmName() puede dar "" y entonces no había casa (Precios.casa daba
--                                           nil), la subasta abierta salía «sin datos» y la identidad iba a la app sin
--                                           reino. Un reino provisional (solo el normalizado; ronda 1) no se da: nil
--                                           (ronda 2: la casa sí se busca con él, solo aquí, en las conocidas del mismo
--                                           reino).
-- Precios.casa(faccion?) -> número | nil    SNF_PRECIOS.conocidas["<reino>|<faccion>"], si no las conocidas guardadas
--                                           en SnetForeverCuenta.comercio.conocidas; si no, nil. Sin faccion, la del
--                                           jugador. F7: ya no hay casa supuesta (antes, la 114/111/117 en «Normal»):
--                                           una casa que la app no ha descubierto no se supone nunca. F7, ronda 1: con
--                                           una ranura de una app de antes de F7 (conocidas vacías) que trae la 114, la
--                                           Horda usa la 114 (Precios.CASA_ANTES_DE_F7, la comprobada) hasta que llega
--                                           la primera ranura de la app nueva; ronda 2: solo en el reino «Normal»
--                                           (Precios.REINO_ANTES_DE_F7, mismoReino), el único en que la suponía. F6b,
--                                           ronda 2: con un reino provisional (solo el normalizado), la casa se busca
--                                           solo aquí, en las conocidas del mismo reino escrito de otra forma (primero
--                                           una forma con espacios, luego la foto, luego las guardadas), y el reino no
--                                           va a la identidad. F6b: la primera vez en la sesión que se sabe el reino,
--                                           las conocidas guardadas con el reino vacío («|Horde») o con el mismo reino
--                                           escrito de otra forma pasan a «<reino>|<faccion>»; si ya hay otra casa con
--                                           esa clave, la de antes se aparta en comercio.conocidasApartadas[clave] =
--                                           {casa, hora} (nada se borra).
-- Precios.faccionDeLaSubasta() -> faccion   F6: la de la subasta abierta, por su subastador (UnitFactionGroup("npc"):
--                                           «Horde» o «Alliance»; cualquier otra cosa, o nil, es «Neutral»); sin
--                                           subastador a la vista, la del jugador.
-- Precios.sinDatos() -> faccion | nil        F6: con la subasta abierta, su facción si la app no tiene datos de su casa
--                                           (F7: la app ya baja la neutral; esto queda para una casa que aún no ha
--                                           descubierto o que la ranura no trae). nil con la subasta
--                                           cerrada, sin precios o si la foto trae esa casa. El tooltip lo dice en una
--                                           línea gris y no enseña nada de la app.
-- Precios.casaAbierta() -> casa | false | nil   F6, ronda 1: la de la subasta abierta (false: abierta y sin casa
--                                           conocida; nil: cerrada). Precios.faccionAbierta() -> faccion | nil, la de
--                                           su subastador.
-- Precios.casaActual() -> casa | nil        F6, ronda 1: la que vale para enseñar precios ahora: con la subasta
--                                           abierta, la suya (nil si no se conoce); cerrada, Precios.casa(). La usan la
--                                           IA (ia/contexto.lua), la ventana de comercio y Navegar.
-- Precios.faccionActual() -> faccion | nil  F6, ronda 1: la de la subasta abierta o, cerrada, la del jugador (para no
--                                           mezclar el escaneo de una casa con otra: SNF.Subasta.foto).
-- Precios.alCerrar()                        F6: (comercio.lua, AUCTION_HOUSE_CLOSED) olvida la casa de la subasta
--                                           abierta: los precios vuelven a la casa propia.
-- Precios.alAbrir()                         (lo llama comercio.lua en cada AUCTION_HOUSE_SHOW, protegido) guarda la
--                                           identidad en SnetForeverCuenta.comercio.identidad, carga, guarda las casas
--                                           conocidas, calcula la casa de esta apertura (F6: la de su subastador,
--                                           Precios.faccionDeLaSubasta; false si no se conoce) y, si hayQueRecargar(),
--                                           avisa una vez por sesión: COMERCIO_PRECIOS_RELOAD en el chat y
--                                           SNF_COMERCIO_AVISO(clave, horas).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Precios = {}
SNF.Precios = Precios

Precios.RANURAS = 8
Precios.HORA = 3600
Precios.VIEJOS = 7200
Precios.MINUTO_FOTO = 35
Precios.CASA_ANTES_DE_F7 = 114 -- F7, ronda 1: la de la Horda en las ranuras de una app de antes (conocidas vacías)
Precios.REINO_ANTES_DE_F7 = "Normal" -- F7, ronda 2: el único reino en el que la app de antes suponía la 114

local floor = math.floor

local cargadas = {} -- [i] = true: ranura ya cargada en esta sesión (aceptada o no)
local actual = nil -- los precios aceptados
local coberturas = {} -- [casa]: recuento de la ranura actual, pendiente o completo
local recargar = false -- lo que decidió el último cargar()
local avisado = false
-- La casa calculada al abrir la subasta (Precios.alAbrir); F6: false = la abierta no tiene casa conocida.
local casaAbierta = nil
local faccionAbierta = nil -- F6: de qué facción es la subasta abierta ("Horde", "Alliance" o "Neutral"; nil, cerrada)
local casaConsulta = nil -- la casa calculada por Precios.consultar (sin la subasta abierta)
local consultado = false -- Precios.consultar ya intentó leer la tabla de precios (una sola vez)
local horaConsulta = nil -- la HORA de la foto que leyó Precios.consultar (la ranura se apunta también en cargadas)
local tablaConsulta = nil -- la foto que aceptó Precios.consultar
-- horaConsulta y tablaConsulta valen solo para el primer cargar() tras la consulta y en la hora de la consulta: las
-- ranuras dan la vuelta cada 8 horas y después todo es igual que sin consulta (cargar() las olvida).

function Precios.nombre(i)
  return string.format("SnetForever_P%02d", floor(i))
end

function Precios.ranuraDeHora(h)
  return (h % Precios.RANURAS) + 1
end

local function horaDe(segundos)
  return floor(segundos / Precios.HORA)
end

-- C_AddOns.LoadAddOn, o LoadAddOn en un cliente que aún no tenga el espacio (como ia/buzon.lua). Protegido.
local function cargarAddon(nombre)
  local espacio = rawget(_G, "C_AddOns")
  local f = type(espacio) == "table" and rawget(espacio, "LoadAddOn") or rawget(_G, "LoadAddOn")
  if type(f) ~= "function" then
    return false
  end
  local ok, cargada = pcall(f, nombre)
  return ok and cargada and true or false
end

-- Llama a una función global del cliente protegida; nil si no existe, falla o da un valor secreto o vacío.
local function leer(nombre, ...)
  local f = rawget(_G, nombre)
  if type(f) ~= "function" then
    return nil
  end
  local ok, valor = pcall(f, ...)
  if not ok or SNF.API.esSecreto(valor) or type(valor) ~= "string" or valor == "" then
    return nil
  end
  return valor
end

function Precios.identidad()
  -- Ronda 1: un reino provisional (solo el normalizado, sin forma conocida) no va a la identidad: la app guardaría las
  -- casas con un nombre que no es el suyo.
  local reino, provisional = SNF.Comercio.reino()
  return {region = leer("GetCVar", "portal"), reino = not provisional and reino or nil,
    faccion = leer("UnitFactionGroup", "player")}
end

local function valida(t, region)
  if type(t) ~= "table" or t.v ~= 1 or type(t.seq) ~= "number" or type(t.generado) ~= "number"
    or type(t.casas) ~= "table" or t.completo ~= true then
    return false
  end
  if type(region) == "string" and type(t.region) == "string" and string.lower(region) ~= string.lower(t.region) then
    return false -- precios de otra región
  end
  return true
end

local function masNueva(t)
  if actual == nil or t.generado > actual.generado then
    return true
  end
  return t.generado == actual.generado and t.seq > actual.seq
end

-- Carga la ranura i (una sola vez por sesión) y devuelve lo que dejó si es válido; nil si no.
local function probar(i, region)
  if cargadas[i] then
    return nil
  end
  SNF_PRECIOS = nil
  local cargada = cargarAddon(Precios.nombre(i))
  local t = rawget(_G, "SNF_PRECIOS")
  SNF_PRECIOS = actual
  if not cargada then
    return nil
  end
  cargadas[i] = true
  return valida(t, region) and t or nil
end

-- La ventana de la hora del servidor: h, si ya pasó el minuto Precios.MINUTO_FOTO (la app ya debería haber escrito la
-- foto de h) y las ranuras de h y h - 1.
local function ventana(ahora)
  local h = horaDe(ahora)
  local tarde = floor((ahora % Precios.HORA) / 60) >= Precios.MINUTO_FOTO
  return h, tarde, Precios.ranuraDeHora(h), Precios.ranuraDeHora(h - 1)
end

function Precios.cargar()
  local ahora = SNF.API.horaServidor()
  if type(ahora) ~= "number" then
    return actual ~= nil
  end
  local h, tarde, estaHora, horaAntes = ventana(ahora)
  -- La ranura que debería traer lo más nuevo ahora (para el aviso (a)), y si ya estaba gastada antes de esta llamada.
  local objetivo, horaObjetivo = horaAntes, h - 1
  if tarde then
    objetivo, horaObjetivo = estaHora, h
  end
  -- La consulta de esta misma hora gastó la ranura de h - 1 con la foto que tenemos: recargar traería esa misma foto,
  -- así que no cuenta como «gastada antes» si es la ranura objetivo de ahora (solo la hora que leyó la consulta,
  -- h - 1).
  local deConsulta = horaConsulta ~= nil and horaConsulta == h - 1
  local gastadaAntes = cargadas[objetivo] == true and not (deConsulta and horaObjetivo == horaConsulta)
  local region = Precios.identidad().region
  local aceptada = false
  -- Antes del minuto MINUTO_FOTO la ranura de h aún tiene la foto de hace 8 horas: ni se toca (cargarla la gastaría).
  if tarde then
    local t = probar(estaHora, region)
    if t and horaDe(t.generado) == h and masNueva(t) then
      actual, aceptada, coberturas = t, true, {}
    end
  end
  -- La ranura de h - 1 solo puede traer algo más nuevo si lo cargado es de antes de h - 1 (si no, cargarla la gastaría
  -- para nada: así, reabrir en la misma hora no gasta ranuras).
  if not aceptada and (actual == nil or horaDe(actual.generado) < h - 1) then
    local t = probar(horaAntes, region)
    if t and masNueva(t) then
      actual, aceptada, coberturas = t, true, {}
    end
  end
  -- La foto que aceptó la consulta, si sigue siendo la que tenemos, vale como aceptada: sin consulta previa alAbrir
  -- habría aceptado esa misma ranura.
  if not aceptada and deConsulta and actual ~= nil and actual == tablaConsulta then
    aceptada = true
  end
  horaConsulta, tablaConsulta = nil, nil -- se olvidan tras el primer cargar()
  SNF_PRECIOS = actual
  local edad = Precios.edad()
  recargar = false
  if edad and gastadaAntes and horaDe(actual.generado) < horaObjetivo and edad > Precios.HORA then
    recargar = true -- (a) la foto nueva fue a una ranura que ya se gastó
  elseif edad and not aceptada and edad > Precios.VIEJOS then
    recargar = true -- (b) precios muy viejos y ninguna candidata sirve
  end
  return actual ~= nil
end

function Precios.agotadas()
  local ahora = SNF.API.horaServidor()
  if type(ahora) ~= "number" then
    return false
  end
  local _, tarde, estaHora, horaAntes = ventana(ahora)
  return cargadas[horaAntes] == true and (not tarde or cargadas[estaHora] == true)
end

-- F1 (ronda 3): la hora de la foto cargada (segundos desde 1970), o nil. Con ella, una tabla enseña una hora fija que
-- no se mueve entre repintados (Precios.edad da los segundos desde ella, mirados en cada llamada).
function Precios.generado()
  local generado = actual and actual.generado
  return type(generado) == "number" and generado or nil
end

function Precios.hasHouse(house)
  return house ~= nil and actual ~= nil and type(actual.casas[house]) == "table"
end

function Precios.infoCasa(house)
  local info = house and actual and type(actual.info) == "table" and actual.info[house]
  if type(info) == "table" and type(info.hora) == "number" and type(info.desde) == "number" and type(info.pares) == "number" then
    return {hora = info.hora, desde = info.desde, pares = info.pares}
  end
end

local rhythmCache, rhythmSnapshot = {}, nil
function Precios.hayRitmo(house)
  if not Precios.hasHouse(house) then return false end
  if rhythmSnapshot ~= actual then
    rhythmCache, rhythmSnapshot = {}, actual
  end
  if rhythmCache[house] == nil then
    rhythmCache[house] = false
    for _, row in pairs(actual.casas[house]) do
      if type(row) == "table" and type(row[5]) == "number" and row[5] >= 0 then
        rhythmCache[house] = true
        break
      end
    end
  end
  return rhythmCache[house]
end

function Precios.edad()
  local generado = actual and actual.generado
  local ahora = SNF.API.horaServidor()
  if type(generado) ~= "number" or type(ahora) ~= "number" then
    return nil
  end
  return math.max(0, floor(ahora - generado))
end

function Precios.hayQueRecargar()
  return recargar
end

local function guardadoComercio()
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  return type(c) == "table" and c or nil
end

-- F6b: las conocidas guardadas con el reino vacío («|Horde») o con el mismo reino escrito de otra forma pasan al reino
-- bueno, una vez por sesión y reino. Si la clave buena ya tiene otra casa, la de antes se aparta (no se elige a
-- ciegas).
local conocidasPasadas = nil -- el reino al que ya se pasaron en esta sesión
local function pasarConocidas(g, reino)
  if conocidasPasadas == reino or type(g.conocidas) ~= "table" then
    return
  end
  conocidasPasadas = reino
  local mover = {}
  for clave, casa in pairs(g.conocidas) do
    local r, faccion = nil, nil
    if type(clave) == "string" then
      r, faccion = string.match(clave, "^(.*)|([^|]*)$")
    end
    if r and r ~= reino and (r == "" or SNF.Comercio.mismoReino(r, reino)) then
      mover[#mover + 1] = {clave, faccion, casa}
    end
  end
  table.sort(mover, function(a, b)
    return a[1] < b[1]
  end)
  for _, m in ipairs(mover) do
    local vieja, buena, casa = m[1], reino .. "|" .. m[2], m[3]
    local ya = g.conocidas[buena]
    if ya ~= nil and ya ~= casa then
      if type(g.conocidasApartadas) ~= "table" then
        g.conocidasApartadas = g.conocidasApartadas == nil and {} or {_roto = g.conocidasApartadas}
      end
      local donde, n = vieja, 1
      while g.conocidasApartadas[donde] ~= nil do
        n = n + 1
        donde = vieja .. " (" .. n .. ")"
      end
      g.conocidasApartadas[donde] = {casa = casa, hora = SNF.API.horaServidor()}
    else
      g.conocidas[buena] = casa
    end
    g.conocidas[vieja] = nil
  end
end

-- Ronda 2: con un reino provisional (solo el normalizado) no hay identidad con reino, pero la casa se busca igual, solo
-- aquí: la clave de las conocidas (de la foto cargada y las guardadas) que sea del mismo reino escrito de otra forma.
-- Ronda 3: si hay varias con casas distintas, siempre la misma: la de una forma con espacios o guiones, si no la de la
-- foto y si no la guardada (y entre dos iguales en eso, la de clave menor).
local function casaProvisional(reino, faccion)
  local g = guardadoComercio()
  local mejor, mejorRango, mejorClave = nil, nil, nil
  for i = 1, 2 do
    local casas
    if i == 1 then
      casas = actual and actual.conocidas
    else
      casas = g and g.conocidas
    end
    if type(casas) == "table" then
      for clave, casa in pairs(casas) do
        local r, f = nil, nil
        if type(clave) == "string" then
          r, f = string.match(clave, "^(.*)|([^|]*)$")
        end
        if f == faccion and type(casa) == "number" and SNF.Comercio.mismoReino(r, reino) then
          local rango = (string.find(r, "[%s%-]") and 0 or 2) + (i - 1) -- menor, mejor
          if not mejorRango or rango < mejorRango or (rango == mejorRango and clave < mejorClave) then
            mejor, mejorRango, mejorClave = casa, rango, clave
          end
        end
      end
    end
  end
  return mejor
end

function Precios.casa(faccion)
  local id = Precios.identidad()
  faccion = faccion or id.faccion
  if not id.reino and faccion then
    local reino, provisional = SNF.Comercio.reino()
    if reino and provisional then
      return casaProvisional(reino, faccion) -- nunca va a la identidad
    end
  end
  if not id.reino or not faccion then
    return nil
  end
  local clave = id.reino .. "|" .. faccion
  local g = guardadoComercio()
  if g then
    pasarConocidas(g, id.reino)
  end
  local deRanura = actual and type(actual.conocidas) == "table" and actual.conocidas[clave]
  if type(deRanura) == "number" then
    return deRanura
  end
  local guardada = g and type(g.conocidas) == "table" and g.conocidas[clave]
  if type(guardada) == "number" then
    return guardada
  end
  -- F7, ronda 1: una ranura de la app de antes de F7 (conocidas vacías) traía la 114 por suposición, y era la de
  -- la Horda (la única comprobada). Mientras llega la primera ranura de la app nueva (que ya la nombra), la Horda la
  -- sigue usando: solo la 114, solo para la Horda y solo si esa ranura la trae. Una ranura con conocidas nunca entra
  -- aquí. F7, ronda 2: y solo en el reino en el que la app de antes la suponía (su CASA_SUPUESTA era {Normal = {Horde
  -- = 114, …}}: solo «Normal»), comparado con mismoReino (F6b). Con el reino sin saber o provisional no se llega aquí.
  local vieja = Precios.CASA_ANTES_DE_F7
  if faccion == "Horde" and SNF.Comercio.mismoReino(id.reino, Precios.REINO_ANTES_DE_F7)
    and actual and type(actual.conocidas) == "table" and next(actual.conocidas) == nil
    and type(actual.casas) == "table" and type(actual.casas[vieja]) == "table" then
    return vieja
  end
  return nil -- F7: sin descubrir, ninguna (nada se supone)
end

-- F6: la facción de la subasta abierta, por su subastador (la unidad «npc» mientras se habla con él): «Horde» o
-- «Alliance» si es de una facción; «Neutral» si no (los goblins de Bahía del Botín, Gadgetzan y Vista Eterna no son de
-- ninguna: UnitFactionGroup da nil o «Neutral»). Sin subastador a la vista (o sin las funciones), la del jugador, como
-- antes.
function Precios.faccionDeLaSubasta()
  local propia = Precios.identidad().faccion
  local existe, faccion = rawget(_G, "UnitExists"), rawget(_G, "UnitFactionGroup")
  if type(existe) ~= "function" or type(faccion) ~= "function" then
    return propia
  end
  local ok, hay = pcall(existe, "npc")
  if not ok or SNF.API.esSecreto(hay) or not hay then
    return propia
  end
  local bien, f = pcall(faccion, "npc")
  if not bien or SNF.API.esSecreto(f) then
    return propia
  end
  if f == "Horde" or f == "Alliance" then
    return f
  end
  return "Neutral"
end

-- F6: la facción de la subasta abierta si la app no tiene datos de su casa (no la conoce, o la foto no la trae). F7: la
-- app baja también la neutral (otra subasta, con otros precios); esto queda para una casa sin descubrir o que la ranura
-- no trae. nil con la subasta cerrada, sin precios cargados o si la foto trae esa casa.
function Precios.sinDatos()
  if casaAbierta == nil or not actual then
    return nil
  end
  if casaAbierta and type(actual.casas[casaAbierta]) == "table" then
    return nil
  end
  return faccionAbierta or "Neutral"
end

local function numero(v)
  return type(v) == "number" and v or nil
end

-- -1 (o cualquier negativo) es «no se sabe».
local function opcional(v)
  return type(v) == "number" and v >= 0 and v or nil
end

function Precios.de(item, casa)
  if casa == nil then
    -- F6: con la subasta abierta, solo la suya (false: sin casa conocida, ningún precio), nunca la de otra facción.
    if casaAbierta ~= nil then
      casa = casaAbierta
    else
      casa = casaConsulta
    end
  end
  if not actual or not casa then
    return nil
  end
  local objetos = actual.casas[casa]
  local f = type(objetos) == "table" and objetos[item]
  if type(f) ~= "table" then
    return nil
  end
  local precio = numero(f[1])
  if not precio then
    return nil
  end
  return {
    precio = precio,
    cantidad = numero(f[2]) or 0,
    normal = numero(f[3]),
    tendencia = numero(f[4]),
    ritmo = opcional(f[5]),
    vendidosDia = opcional(f[6]),
    poco = f[7] == 1,
    subastas = numero(f[8]),
    conTendencia = f[9] == 1,
    mercancia = f[10] == 1,
  }
end

-- Fase 2: el histórico (ver la cabecera). La fila trae h = {valor, dias, muestras, desde, hasta, razon} con desde y hasta
-- en días UTC; razon 0 si se da, 1 pocos días, 2 vencido (precios-lua.mjs).
Precios.DIA = 86400
local RAZONES_HISTORICO = {[1] = "pocos-dias", [2] = "vencido"}

function Precios.historico(item, casa)
  if casa == nil then
    if casaAbierta ~= nil then
      casa = casaAbierta
    else
      casa = casaConsulta
    end
  end
  if not actual then
    return nil, "sin-precios"
  end
  if not casa then
    return nil, "sin-casa"
  end
  local objetos = actual.casas[casa]
  if type(objetos) ~= "table" then
    return nil, "casa-sin-datos"
  end
  local meta = actual.historico
  if type(meta) ~= "table" then
    return nil, "formato-anterior"
  end
  if meta.omitido == true then
    return nil, "no-cabe"
  end
  local f = objetos[item]
  local h = type(f) == "table" and f.h
  if type(h) ~= "table" then
    return nil, "sin-datos"
  end
  local valor, dias, muestras, desde, hasta, razon = numero(h[1]), numero(h[2]), numero(h[3]), numero(h[4]),
    numero(h[5]), numero(h[6])
  if not (valor and dias and muestras and desde and hasta and razon) then
    return nil, "sin-datos"
  end
  local datos = {dias = dias, muestras = muestras, desde = desde > 0 and desde * Precios.DIA or nil,
    hasta = hasta > 0 and hasta * Precios.DIA or nil, ventana = numero(meta.ventana), minDias = numero(meta.minDias),
    maxDiasSinDato = numero(meta.maxDiasSinDato), casa = casa, edad = Precios.edad()}
  if razon ~= 0 then
    return nil, RAZONES_HISTORICO[razon] or "sin-datos", datos
  end
  -- La ranura puede ser vieja (una sesión larga sin /reload): se vuelve a mirar contra la hora del servidor.
  local ahora = SNF.API.horaServidor()
  local maximo = numero(meta.maxDiasSinDato)
  if datos.hasta and maximo and type(ahora) == "number" and floor(ahora / Precios.DIA) - hasta > maximo then
    return nil, "vencido", datos
  end
  if valor <= 0 then
    return nil, "sin-datos", datos
  end
  datos.valor = valor
  return datos
end

function Precios.regional(item)
  if not actual then
    return nil, "sin-precios"
  end
  local info = actual.regionalInfo
  if type(info) ~= "table" then
    return nil, "formato-anterior"
  end
  if info.omitido == true then
    return nil, "no-cabe"
  end
  local tabla = actual.regional
  local valor = type(tabla) == "table" and numero(tabla[item])
  if not valor or valor <= 0 then
    return nil, "sin-datos"
  end
  return valor, {casas = numero(info.casas), desde = numero(info.desde), hora = numero(info.hora), edad = Precios.edad()}
end

-- Precios.cobertura(casa) -> datos | nil, razon   Fase 2: cuánto de la ranura cargada sirve para cada serie, por casa,
--   para «Estado del comercio». Solo cuenta lo que ya leen Precios.historico y las filas: no calcula precios nuevos.
--   datos = {objetos, salen, historico = {conValor, pocosDias, vencido, sinDatos, minDias} | nil, historicoRazon}
--   · objetos: filas de la casa; salen: filas con salidas locales al día (vendidosDia >= 0, las mismas que enseña el
--     tooltip: desapariciones de lotes estimadas, nunca ventas confirmadas);
--   · historico: por objeto, lo que dice Precios.historico (con su comprobación de «vencido» frente a la hora del
--     servidor); historicoRazon ("formato-anterior" o "no-cabe") cuando la ranura no trae el histórico y entonces
--     historico es nil.
--   La app solo baja fotos de cada casa (objetos y mercancías de esa casa): no hay serie regional ni de ventas
--   confirmadas que contar. nil y la razón de Precios.historico sin precios, sin casa o con la casa fuera de la ranura.
--   Se guarda por ranura cargada, casa y día del servidor (el «vencido» cambia con el día). Las casas grandes se
--   recorren por trozos y devuelven nil, "calculando" hasta terminar.
local FILAS_COBERTURA_POR_FOTOGRAMA = 128
local function diaServidor()
  local ahora = SNF.API.horaServidor()
  return type(ahora) == "number" and floor(ahora / Precios.DIA) or -1
end

function Precios.cobertura(casa)
  if not actual then return nil, "sin-precios" end
  if not casa then return nil, "sin-casa" end
  local objetos = actual.casas[casa]
  if type(objetos) ~= "table" then return nil, "casa-sin-datos" end
  local dia = diaServidor()
  local guardada = coberturas[casa]
  if guardada and guardada.dia == dia then
    if guardada.datos then return guardada.datos end
    return nil, "calculando"
  end
  local datos = {objetos = 0, salen = 0}
  local meta = actual.historico
  if type(meta) ~= "table" then
    datos.historicoRazon = "formato-anterior"
  elseif meta.omitido == true then
    datos.historicoRazon = "no-cabe"
  else
    datos.historico = {conValor = 0, pocosDias = 0, vencido = 0, sinDatos = 0, minDias = numero(meta.minDias)}
  end
  local h = datos.historico
  local calculo = {dia = dia}
  coberturas[casa] = calculo
  local item, fila = next(objetos)
  local function contar()
    if coberturas[casa] ~= calculo then return end
    if diaServidor() ~= dia then
      coberturas[casa] = nil
      return
    end
    for _ = 1, FILAS_COBERTURA_POR_FOTOGRAMA do
      if item == nil then break end
      if type(fila) == "table" then
        datos.objetos = datos.objetos + 1
        if type(fila[6]) == "number" and fila[6] >= 0 then datos.salen = datos.salen + 1 end
        if h then
          local valor, razon = Precios.historico(item, casa)
          if valor then
            h.conValor = h.conValor + 1
          elseif razon == "pocos-dias" then
            h.pocosDias = h.pocosDias + 1
          elseif razon == "vencido" then
            h.vencido = h.vencido + 1
          else
            h.sinDatos = h.sinDatos + 1
          end
        end
      end
      item, fila = next(objetos, item)
    end
    if item == nil then
      calculo.datos = datos
    else
      C_Timer.After(0, contar)
    end
  end
  contar()
  if calculo.datos then return calculo.datos end
  return nil, "calculando"
end

-- Precios.consultar() -> boolean, motivo?   Task 20d: lectura de solo consulta para quien necesita los precios sin que
--   la subasta esté abierta (el tooltip de los objetos). Si aún no hay precios, lee la ranura de la HORA ANTERIOR (la
--   foto completa más reciente; la de la hora actual se deja libre para alAbrir, que es quien decide cuándo cargarla) y
--   la acepta si es válida. El cliente solo ejecuta cada addon una vez por sesión, así que esa ranura queda gastada: se
--   apunta en cargadas (si alAbrir no la había gastado ya) y cargar() no la vuelve a intentar. Se guarda la HORA que
--   leyó: en el primer cargar() tras la consulta y en esa hora, esa ranura no cuenta como «gastada antes» y la foto
--   aceptada vale como aceptada, así que no avisa de /reload por ella (recargar traería la misma foto). Después se
--   olvida: las ranuras dan la vuelta cada 8 horas y todo es igual que sin consulta. Sin consulta previa, alAbrir no
--   cambia; con ella, si hay una foto más nueva en la ranura de la hora actual, la acepta. No toca recargar ni el
--   aviso. La casa se calcula con Precios.casa() (reino y facción, la misma que alAbrir) y se guarda aparte de
--   casaAbierta. Se intenta una sola vez; en combate no se carga y el siguiente tooltip fuera de combate lo intenta
--   (devuelve false, «combate»). Sin datos devuelve false.
function Precios.consultar()
  if actual == nil then
    if consultado then
      return false
    end
    local combate = rawget(_G, "InCombatLockdown")
    if type(combate) == "function" and combate() then
      return false, "combate"
    end
    local ahora = SNF.API.horaServidor()
    if type(ahora) ~= "number" then
      return false
    end
    consultado = true
    local leida = horaDe(ahora) - 1
    local ranura = Precios.ranuraDeHora(leida)
    if cargadas[ranura] then
      return false -- alAbrir ya gastó esa ranura: no se vuelve a cargar ni se apunta como de la consulta
    end
    local region = Precios.identidad().region
    SNF_PRECIOS = nil
    local cargada = cargarAddon(Precios.nombre(ranura))
    local t = rawget(_G, "SNF_PRECIOS")
    if cargada then
      -- El cliente ya no ejecutará esa ranura en esta sesión: se apunta como gastada para que cargar() no la vuelva a
      -- probar.
      cargadas[ranura] = true
      horaConsulta = leida
      if valida(t, region) then
        actual, tablaConsulta, coberturas = t, t, {}
      end
    end
    SNF_PRECIOS = actual
  end
  if actual ~= nil and casaAbierta == nil and casaConsulta == nil then
    casaConsulta = Precios.casa()
  end
  return actual ~= nil
end

function Precios.alAbrir()
  -- F6, ronda 1: lo primero, la subasta abierta sin casa conocida y con la facción de su subastador; así un fallo más
  -- abajo nunca deja la casa de la Horda puesta en la neutral.
  casaAbierta = false
  faccionAbierta = Precios.faccionDeLaSubasta()
  SNF.Guardado.preparar()
  local g = guardadoComercio()
  if g then
    g.identidad = Precios.identidad()
  end
  Precios.cargar()
  if g and actual and type(actual.conocidas) == "table" and type(g.conocidas) == "table" then
    for clave, casa in pairs(actual.conocidas) do
      if type(clave) == "string" and type(casa) == "number" then
        g.conocidas[clave] = casa
      end
    end
  end
  -- F6: la casa de la subasta abierta (la de su subastador), no la de la facción del jugador: en la neutral, la
  -- neutral.
  casaAbierta = Precios.casa(faccionAbierta) or false
  if not avisado and recargar then
    avisado = true
    local horas = floor(Precios.edad() / Precios.HORA)
    print(SNF.L.t("COMERCIO_PRECIOS_RELOAD", horas))
    SNF.Eventos.emitir("SNF_COMERCIO_AVISO", "COMERCIO_PRECIOS_RELOAD", horas)
  end
end

-- F6, ronda 1: la casa y la facción de la subasta abierta, y las de ahora para quien enseña precios (el tooltip, la IA,
-- la ventana de comercio y Navegar): con la subasta abierta, la suya; cerrada, la propia.
function Precios.casaAbierta()
  return casaAbierta -- número | false (abierta, sin casa conocida) | nil (cerrada)
end

function Precios.faccionAbierta()
  return faccionAbierta
end

function Precios.casaActual()
  if casaAbierta ~= nil then
    return casaAbierta or nil
  end
  return Precios.casa()
end

function Precios.faccionActual()
  if casaAbierta ~= nil then
    return faccionAbierta
  end
  return Precios.identidad().faccion
end

-- F6: al cerrar la subasta (comercio.lua, AUCTION_HOUSE_CLOSED) se vuelve a la casa propia: la de la consulta (la
-- calcula ahora si aún no la había).
function Precios.alCerrar()
  casaAbierta, faccionAbierta = nil, nil
  if actual ~= nil and casaConsulta == nil then
    casaConsulta = Precios.casa()
  end
end
