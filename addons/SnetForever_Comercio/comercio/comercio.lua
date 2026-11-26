-- SnetForever: comercio en la subasta (fase 1 del comercio). Este archivo es el arranque del módulo y su «cortafuegos».
--
-- Dormido hasta abrir la subasta: al cargar solo escucha AUCTION_HOUSE_SHOW y AUCTION_HOUSE_CLOSED (en el marco de
-- eventos común, sin marcos ni temporizadores propios). Nada del comercio (ventana, escaneo, precios) se crea antes del
-- primer AUCTION_HOUSE_SHOW de la sesión.
--
-- Comercio.activo() -> boolean        la subasta está abierta y el comercio no se ha apagado por un fallo.
-- Comercio.abierta() -> boolean       la subasta está abierta (aunque el comercio esté apagado).
-- Comercio.ventanaVisible() -> boolean   F13, la única puerta de todo lo que se envía a la subasta: la subasta está abierta, el
--                                     comercio no está apagado y nuestra ventana se ve de verdad (UIComercio.aLaVista: visible
--                                     también con sus padres, sin el velo de los primeros fotogramas y sin que otro addon tenga la
--                                     subasta). Sin la ventana creada, o si algo falla al mirarlo, false: ante la duda no se envía.
-- Comercio.ceder()                    F13: nuestra ventana se ha escondido: el sniper se para, la compra a medias se libera (un solo
--                                     CancelCommoditiesPurchase, la única excepción a la regla; nunca se confirma nada), la
--                                     búsqueda suelta lo pendiente y el escaneo se para con motivo «otro». Con la subasta cerrada
--                                     no hace nada (ya ha parado todo).
-- Comercio.ejecutar(nombre, fn, ...)  llama a fn(...) protegida y devuelve true y lo que dé fn. Si fn falla: apunta el
--                                     error en SnetForeverCuenta.fallos (origen «comercio»), avisa una vez en el chat,
--                                     para compra, sniper, búsqueda y escaneo, apaga el comercio hasta cerrar la subasta, emite
--                                     SNF_COMERCIO_APAGADO (sin cortafuegos: cada oyente se protege solo) y devuelve
--                                     false.
--                                     Con el comercio apagado no llama a fn y devuelve false. El error no llega a
--                                     geterrorhandler(): la flecha, la guía y el chat siguen como si nada.
-- Comercio.duenoMercancia(r) -> {cantidad, propias?, comprables?, mia, cuenta, paraMinimo, dudosa}
--                                     F12: de quién es una fila de GetCommoditySearchResultInfo. El juego junta en
--                                     una fila de precio lo tuyo y lo de otros: cantidad = todas, propias =
--                                     numOwnerItems, comprables = cantidad - propias.
--                                     Los datos solo valen si cuadran: containsOwnerItem true con un entero de 1 a
--                                     quantity, o false con 0. Cualquier otra cosa (no viene, secreto, 0 con dueño, más
--                                     que quantity, n > 0 sin dueño, no entero) deja propias y comprables en nil: no se
--                                     resta a ciegas. mia = toda la fila es tuya; cuenta = containsAccountItem con
--                                     containsOwnerItem false (otro personaje tuyo: el juego no dice cuántas); paraMinimo
--                                     = da precio de mercado; dudosa = no lo da, pero tampoco se sabe que sea solo tuya.
-- Comercio.duenoObjeto(r) -> lo mismo de una fila de GetItemSearchResultInfo (cantidad 1: cada subasta es de un dueño);
--                                     sin containsOwnerItem (nil o secreto), «no se sabe».
-- Comercio.apuntarBusqueda()          tarea 14: apunta una búsqueda en la subasta en la cuenta compartida por minuto.
-- Comercio.busquedasRecientes(s) -> n las búsquedas apuntadas en los últimos s segundos.
-- Comercio.protegido(nombre, fn, ...) tarea 15 (el chat: propuestas de la IA, que llegan también con la subasta
--                                     cerrada): con la subasta abierta es Comercio.ejecutar. Con ella cerrada llama a
--                                     fn(...) protegida y, si falla, solo apunta el fallo (origen «comercio») y devuelve
--                                     false: no hay nada que apagar ni que parar, y el comercio no queda apagado para la
--                                     próxima vez que se abra la subasta.
-- Comercio.reino() -> texto | nil, provisional   F6b: el reino del personaje, el de SNF.Personaje.reino()
--                                     (nucleo/personaje.lua): nunca "" (en Forever GetRealmName() puede dar ""). Con un núcleo
--                                     de antes de la F6b (una instalación mezclada), GetRealmName() protegido y sin "". Todo el
--                                     comercio arma sus claves de reino con esto: el inventario, las operaciones, TSM y la casa
--                                     de la subasta. provisional (ronda 1): solo el normalizado, sin forma conocida: vale para
--                                     las claves, pero nunca es el destino de la migración ni va a la app.
-- Comercio.mismoReino(a, b) -> boolean   F6b: el mismo reino escrito de dos formas (SNF.Personaje.mismoReino: sin espacios
--                                     ni guiones y en minúsculas); un texto vacío no es ningún reino.
--
-- Al abrir la subasta: Precios.alAbrir() (identidad, ranuras de precios y aviso de /reload) y después el mensaje
-- interno SNF_COMERCIO_ABIERTA para los demás módulos del comercio. Al cerrarla: Compra.parar(), Sniper.parar(),
-- Busqueda.parar() y Escaneo.parar() si existen, Precios.alCerrar() (F6: los precios vuelven a la casa propia, también tras
-- la subasta neutral), el mensaje SNF_COMERCIO_CERRADA, y el comercio vuelve a estar listo para la próxima vez. Los dos mensajes se
-- emiten dentro de Comercio.ejecutar, pero SNF.Eventos llama a cada oyente con su propio pcall y manda su error a
-- geterrorhandler(): por eso los oyentes de SNF_COMERCIO_* deben envolver su trabajo en Comercio.ejecutar.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Comercio = {}
SNF.Comercio = Comercio

local MAX_LETRAS = 500
local MAX_AVISOS = 200 -- el mismo tope que «Avisar de un fallo» (ui/fallo.lua)

local abierta = false
local apagado = false
local busquedas = {} -- GetTime() de las búsquedas recientes en la subasta (ver Comercio.apuntarBusqueda)
local cierreApuntado = false -- F6, ronda 2: un fallo de Precios.alCerrar ya se apuntó en esta sesión

-- F6b: el reino, siempre por SNF.Personaje.reino() (con un núcleo sin él, GetRealmName() sin "").
local function textoReino(r)
  return type(r) == "string" and not SNF.API.esSecreto(r) and string.find(r, "%S") and r or nil
end

function Comercio.reino()
  local P = rawget(SNF, "Personaje")
  local f = type(P) == "table" and rawget(P, "reino")
  local ok, r, provisional
  if type(f) == "function" then
    ok, r, provisional = pcall(f)
  else
    ok, r = pcall(function()
      return GetRealmName()
    end)
  end
  r = ok and textoReino(r) or nil
  return r, r ~= nil and provisional == true or nil
end

function Comercio.mismoReino(a, b)
  local P = rawget(SNF, "Personaje")
  local f = type(P) == "table" and rawget(P, "mismoReino")
  if type(f) == "function" then
    local ok, igual = pcall(f, a, b)
    return ok and igual == true
  end
  a, b = textoReino(a), textoReino(b)
  local function normal(r)
    return string.lower((string.gsub(r, "[%s%-]", "")))
  end
  return a ~= nil and b ~= nil and normal(a) == normal(b)
end

-- F12: el reparto de una fila. containsAccountItem viene también en true en las tuyas (leído en el juego: una fila solo
-- tuya da 1, 1, true, true), así que solo dice «otro personaje» con containsOwnerItem false.
-- Límite que estos campos no dejan ver: una fila con unidades tuyas Y de otro personaje tuyo es igual que una con tuyas y
-- de otros jugadores (true, true). Sigue contando para el mínimo, porque tratar toda fila mixta como dudosa rompería el caso
-- normal, y su tooltip lo avisa. Tampoco se ve una fila mixta que diga n == quantity: queda como «Tuya» y nunca se compra.
local function reparto(cantidad, propias, deOtroPj)
  local comprables = propias and (cantidad - propias) or nil
  local mia = comprables == 0 and cantidad > 0
  local paraMinimo = comprables ~= nil and comprables > 0 and not deOtroPj
  return {cantidad = cantidad, propias = propias, comprables = comprables, mia = mia, cuenta = deOtroPj,
    paraMinimo = paraMinimo, dudosa = comprables == nil or (deOtroPj and comprables > 0)}
end

function Comercio.duenoMercancia(r)
  local cantidad = math.floor(tonumber(r.quantity) or 0)
  local n, propio, cuenta = r.numOwnerItems, r.containsOwnerItem, r.containsAccountItem
  local secreto = SNF.API.esSecreto
  if secreto(n) or secreto(propio) or secreto(cuenta) then
    return reparto(cantidad, nil, false)
  end
  local propias = nil
  if type(n) == "number" and n == math.floor(n) then
    if propio == true and n >= 1 and n <= cantidad then
      propias = n
    elseif propio == false and n == 0 then
      propias = 0
    end
  end
  return reparto(cantidad, propias, propias ~= nil and propio == false and cuenta == true)
end

function Comercio.duenoObjeto(r)
  local propio, cuenta = r.containsOwnerItem, r.containsAccountItem
  local secreto = SNF.API.esSecreto
  if secreto(propio) or secreto(cuenta) or type(propio) ~= "boolean" then
    return reparto(1, nil, false)
  end
  return reparto(1, propio and 1 or 0, not propio and cuenta == true)
end

-- Cuenta compartida de búsquedas en la subasta (el cliente admite unas 100 por minuto): el escaneo y el sniper apuntan
-- las suyas y el sniper también las ajenas que ve. busquedasRecientes(segundos) dice cuántas hubo en ese tiempo (una
-- de hace justo `segundos` aún cuenta: mejor de más que de menos) y olvida las más viejas.
function Comercio.apuntarBusqueda()
  busquedas[#busquedas + 1] = GetTime()
end

function Comercio.busquedasRecientes(segundos)
  local t = GetTime()
  local i = 1
  while busquedas[i] and t - busquedas[i] > segundos + 1e-6 do
    i = i + 1
  end
  if i > 1 then
    local quedan = {}
    for k = i, #busquedas do
      quedan[#quedan + 1] = busquedas[k]
    end
    busquedas = quedan
  end
  return #busquedas
end

function Comercio.abierta()
  return abierta
end

function Comercio.activo()
  return abierta and not apagado
end

-- Apunta el fallo en SnetForeverCuenta.fallos con el mismo tope que los avisos del jugador: pasado el tope, cada uno
-- nuevo descarta solo el más viejo.
local function apuntarFallo(nombre, err)
  local ok = pcall(SNF.Guardado.preparar)
  local cuenta = rawget(_G, "SnetForeverCuenta")
  if not ok or type(cuenta) ~= "table" or type(cuenta.fallos) ~= "table" then
    return
  end
  local texto = string.sub(tostring(nombre) .. ": " .. tostring(err), 1, MAX_LETRAS)
  table.insert(cuenta.fallos, {
    fecha = date("%Y-%m-%d %H:%M"),
    origen = "comercio",
    addon = SNF.VERSION,
    texto = texto,
  })
  if #cuenta.fallos > MAX_AVISOS then
    table.remove(cuenta.fallos, 1)
    cuenta.fallosDescartados = (tonumber(cuenta.fallosDescartados) or 0) + 1
  end
end

-- Comercio.anotarFallo(nombre, err): solo apunta el fallo (sin apagar nada). Para lo que va aparte del cortafuegos, como el
-- tooltip de los objetos (ui/tooltip.lua), que no debe parar el escaneo ni la compra.
Comercio.anotarFallo = apuntarFallo

-- Para compra, sniper, búsqueda y escaneo si ya existen. Cada parada va protegida y sin ruido: parar no
-- puede fallar dos veces.
local function pararTodo()
  for _, nombre in ipairs({"Compra", "Sniper", "AuctionOrders", "MisSubastas", "Busqueda", "Escaneo"}) do
    local m = SNF[nombre]
    if type(m) == "table" and type(m.parar) == "function" then
      pcall(m.parar)
    end
  end
end

-- F13: sin nuestra ventana a la vista no sale nada hacia la subasta (ver la cabecera).
function Comercio.ventanaVisible()
  if not abierta or apagado then
    return false
  end
  local ui = rawget(SNF, "UIComercio")
  local f = type(ui) == "table" and rawget(ui, "aLaVista")
  if type(f) ~= "function" then
    return false
  end
  local ok, si = pcall(f)
  return ok and si == true
end

-- El sniper primero: así no se reanuda al soltarse la compra.
function Comercio.ceder()
  if not abierta then
    return
  end
  for _, nombre in ipairs({"Sniper", "Compra", "AuctionOrders", "MisSubastas", "Busqueda", "Escaneo"}) do
    local m = rawget(SNF, nombre)
    local f = type(m) == "table" and rawget(m, "ceder")
    if type(f) == "function" then
      local ok, err = pcall(f)
      if not ok then
        apuntarFallo("ceder", err)
      end
    end
  end
end

local function apagar(nombre, err)
  apagado = true
  apuntarFallo(nombre, err)
  pararTodo()
  pcall(function() print(SNF.L.t("COMERCIO_FALLO")) end)
  -- La ventana lo dice y deja moverla y ocultarla (sus oyentes no pasan por el cortafuegos, ya cerrado).
  pcall(SNF.Eventos.emitir, "SNF_COMERCIO_APAGADO")
end

-- Lo que devuelve ejecutar a partir del resultado del pcall (así pasan también los nil del medio).
local function resultado(nombre, ok, ...)
  if not ok then
    apagar(nombre, (...))
    return false
  end
  return true, ...
end

function Comercio.ejecutar(nombre, fn, ...)
  if apagado then
    return false
  end
  return resultado(nombre, pcall(fn, ...))
end

-- Con la subasta cerrada: el fallo se apunta y nada más.
local function resultadoCerrada(nombre, ok, ...)
  if not ok then
    apuntarFallo(nombre, (...))
    return false
  end
  return true, ...
end

function Comercio.protegido(nombre, fn, ...)
  if abierta then
    return Comercio.ejecutar(nombre, fn, ...)
  end
  return resultadoCerrada(nombre, pcall(fn, ...))
end

-- 0.7.0: el comercio se apaga desactivando este addon en la lista de addons del juego. Si en la 0.6.4 el jugador lo
-- había apagado con la casilla del panel, el núcleo lo desactiva para el siguiente /reload y en esta sesión la subasta se
-- abre sin despertar nada nuestro (SNF.comercioDormido, arranque.lua del núcleo).
local function encendido()
  local dormido = rawget(SNF, "comercioDormido")
  return not (type(dormido) == "function" and dormido())
end

SNF.Eventos.escuchar("AUCTION_HOUSE_SHOW", function()
  if not encendido() then
    return
  end
  abierta = true
  apagado = false
  if Comercio.ejecutar("precios", SNF.Precios.alAbrir) then
    Comercio.ejecutar("abierta", SNF.Eventos.emitir, "SNF_COMERCIO_ABIERTA")
  end
end)

SNF.Eventos.escuchar("AUCTION_HOUSE_CLOSED", function()
  pararTodo()
  abierta = false
  apagado = false
  -- F6: cerrada la subasta (también la neutral), los precios vuelven a la casa propia.
  if type(SNF.Precios.alCerrar) == "function" then
    local ok, err = pcall(SNF.Precios.alCerrar)
    if not ok and not cierreApuntado then
      -- Ronda 1: no se pierde en silencio (la subasta ya está cerrada: nada que apagar). Ronda 2: una vez por sesión y solo
      -- su primera línea.
      cierreApuntado = true
      apuntarFallo("precios", string.match(tostring(err), "^[^\n]*") or "")
    end
  end
  Comercio.ejecutar("cerrada", SNF.Eventos.emitir, "SNF_COMERCIO_CERRADA")
end)
