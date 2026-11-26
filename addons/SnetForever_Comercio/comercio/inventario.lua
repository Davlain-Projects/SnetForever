-- SnetForever: el inventario de la cuenta para el tooltip (T1b). Cuenta cuántas unidades de cada objeto lleva cada
-- personaje PROPIO en las bolsas, en el banco y en el correo, para que el tooltip diga cuánto tienes y quién lo tiene. Solo
-- lee: nunca mueve, vende, abre ni coge nada. Solo apunta al personaje con el que se está jugando (y, con el botón de
-- Ajustes, a los propios de esta cuenta que TSM tenía contados: comercio/importar-tsm.lua), así que aquí nunca entra el
-- nombre de otro jugador.
--
-- Lo guardado: SnetForeverCuenta.comercio.inventario = {v = 2, pj = {["Nombre Apellido-Reino"] = Ficha},
--   apartadas = {["<clave vieja>"] = {ficha = <Ficha tal cual>, hora}} | nil, deLaV1 = {["<clave>"] = true} | nil,
--   bancoCuenta = {objetos = {[objeto] = unidades}, hora, reino?, _roto?} | nil}, con
--   Ficha = {nombre («Nombre Apellido»), reino, clase (el token de UnitClass: "MAGE"…), bolsas = {[objeto] = unidades},
--            banco = {[objeto] = unidades} | nil, correo = {[objeto] = unidades} | nil,
--            tsm = {bolsas = hora, banco = hora, correo = hora} | nil}
--   banco nil = ese banco aún no se ha abierto y correo nil = ese buzón aún no se ha abierto (no es lo mismo que vacío).
--   tsm: las partes que vienen de la importación de TSM, con su hora; la que contamos nosotros deja de ser de TSM.
--   bancoCuenta (F2b): el banco de cuenta (en Forever, compartido por todos los personajes), uno solo y fuera de pj: no es
--   un personaje. nil = aún no se ha visto. TSM no lo trae en Forever (solo lo guarda en retail), así que no se importa.
--   F2b: reino = el del personaje que lo vio (aún no se filtra por él: está para poder hacerlo sin migrar nada); _roto = lo
--   que había antes si no era un bancoCuenta bien formado (tampoco una tabla con objetos que no son una tabla): se guarda
--   entero, nunca se tira.
--
-- Fallo F2 (en el juego, 20-nov): en Forever UnitName("player") da DOS valores, nombre y apellido. La 0.6.x guardaba solo
-- el primero: la clave era «Nombre-Reino» y dos personajes con el mismo nombre y distinto apellido compartían ficha y se
-- pisaban. Ahora la clave es SNF.Personaje.clave() («Nombre Apellido») y el reino. Lo de la v1 (v = 1):
--   · Una ficha cortada NO se da a ciegas a ningún personaje: pudo mezclar a dos con el mismo nombre.
--   · Ronda 1: al pasar a v = 2 (en cuanto se sabe quién juega) y si el personaje de ahora tiene apellido, TODAS las fichas
--     de la v1 se APARTAN a la vez, tal cual, en `apartadas` (nada se borra), también las de los personajes que aún no han
--     entrado: dejan de contar ya. Cada personaje rehace la suya al entrar (las bolsas al entrar y el banco y el correo al
--     abrirlos) o la rellena la importación de TSM; mientras, la frase del tooltip dice «los personajes sin entrar».
--   · Si el de ahora no tiene apellido (fuera de Forever), las claves de la v1 ya eran las enteras y se quedan, apuntadas en
--     deLaV1: si luego entra (o se importa de TSM) uno con apellido, se aparta la de su primer nombre; la que coincide con
--     su clave entera es suya.
--   · Una apartada ya no cuenta en el tooltip ni en Ajustes.
-- Fallo F6b (en el juego, 20-nov): en Forever GetRealmName() puede dar "" y entonces no se sabía el reino: el tooltip no
-- encontraba ninguna ficha (ni la línea del inventario). El reino sale ahora de SNF.Comercio.reino() (SNF.Personaje.reino(),
-- que nunca da ""). Lo guardado con el reino vacío o escrito de otra forma pasa al bueno sin borrar nada (pasarReino).
--
-- Cuándo se cuenta (nunca dentro del tooltip, que se llama muchísimo):
--   · las bolsas (la mochila, las bolsas puestas y, si el cliente la tiene, la bolsa de componentes; lo equipado no
--     cuenta): al entrar al mundo y al salir (cambiar de personaje, /reload o cerrar el juego). Eso es lo que ven los DEMÁS
--     personajes. No se escucha BAG_UPDATE_DELAYED todo el rato (como ia/inventario.lua y el chat: ese evento salta mucho).
--     Fallo F2b (en el juego): Forever tiene la bolsa de componentes (Enum.BagIndex.ReagentBag, la 5) y no se contaba; el
--     de ahora salía bien (su fila es de GetItemCount, que sí la cuenta), pero al entrar con otro personaje el anterior
--     salía con lo de las demás bolsas y, si todo lo tenía ahí, no salía. Se arregla solo la próxima vez que entre.
--     Ronda 1: las bolsas salen de API.bolsasPropias (sin el llavero) y una lectura sin ningún hueco no pisa lo contado;
--   · para el personaje con el que se juega, las bolsas no salen de lo guardado: se pregunta al juego en el momento
--     (API.cuentaObjeto, una búsqueda directa), así el número está al día aunque acabe de coger algo. Ojo: el juego puede
--     contar ahí también el objeto que se lleva equipado;
--   · el banco: al abrirlo, en cada BAG_UPDATE_DELAYED con el banco abierto (solo entonces se escucha ese evento, y ahí
--     se cuentan también las bolsas) y al cerrarlo. Con el banco cerrado el juego no deja leerlo; por eso al cerrar, un
--     banco que sale vacío no borra lo apuntado. F2b: el banco es API.bolsasBanco (en Forever, las pestañas 6 a 14);
--   · el banco de cuenta (F2b, API.bolsasCuenta: en Forever las pestañas 15 a 23): igual que el banco, pero se apunta una
--     sola vez para toda la cuenta (bancoCuenta), no en la ficha de quien lo abre;
--   · el correo (F2): con el buzón abierto (MAIL_SHOW, MAIL_INBOX_UPDATE y MAIL_CLOSED; MAIL_INBOX_UPDATE solo se escucha
--     mientras está abierto), lo que traen las cartas que el juego enseña: GetInboxNumItems y, por carta, GetInboxItem (o
--     GetInboxItemLink) de cada adjunto. Solo se leen cantidades: nunca quién lo envió (ni GetInboxHeaderInfo ni las
--     facturas), y nunca se abre ni se coge nada. Al abrir con el buzón aún sin cargar (0 cartas) se espera al
--     MAIL_INBOX_UPDATE; al cerrar, un buzón que sale vacío no borra lo apuntado. F3: si en esa apertura no llegó
--     MAIL_INBOX_UPDATE (ni había cartas al abrir), al cerrar no se apunta nada: sin verlo no es «visto y vacío» (nil si
--     nunca se vio). Ojo: el cliente carga como mucho unas 50
--     cartas; si hay más en el servidor, cuenta las que enseña. Ojo también: lo que llega contra reembolso cuenta como tuyo
--     antes de pagarlo; solo se distinguiría con GetInboxHeaderInfo, que no se llama (da el remitente).
-- Lo que NO se cuenta: lo que está en la casa de subastas (el addon aún no sigue las subastas propias).
--
-- InventarioCuenta.de(objeto) -> total, lista | nil, falta, deCuenta   lo que hay de ese objeto entre los personajes del reino en el
--                              que se juega. lista = {{nombre, clase, bolsas, banco | nil, correo | nil, total,
--                              tsm = {bolsas, banco, correo: hora} | nil}…} solo con quien tiene alguno: primero el
--                              personaje de ahora y luego los demás por orden alfabético. Sin ninguno: 0 y nil.
--                              falta = {bancos = n, correos = n, sinEntrar = true}: las fichas del reino con el banco o el
--                              buzón sin abrir (tengan o no el objeto) y, siempre, que puede haber personajes con los que
--                              no se ha entrado (el juego no deja saber cuántos personajes tiene la cuenta). F2b:
--                              falta.bancoCuenta = true si el cliente tiene banco de cuenta y aún no se ha visto.
--                              deCuenta (F2b): lo que hay en el banco de cuenta, si hay alguno (nil si no); va en el total
--                              una vez, y lista puede ser nil si solo lo tiene él.
--                              Solo mira lo ya contado y, para el de ahora, API.cuentaObjeto (búsquedas directas).
-- InventarioCuenta.apuntarBolsas()        cuenta las bolsas del personaje de ahora.
-- InventarioCuenta.apuntarBanco(cerrando) cuenta su banco (si el juego deja leerlo).
-- InventarioCuenta.apuntarBancoCuenta(cerrando)   F2b: cuenta el banco de cuenta (si el cliente lo tiene y deja leerlo).
-- InventarioCuenta.apuntarCorreo(momento) cuenta su buzón abierto: momento "abrir" | "cambio" | "cerrar".
-- InventarioCuenta.personajes() -> {{clave, nombre, reino, clase, tsm}…}   los personajes guardados (el de ahora primero):
--                              para la pantalla de ajustes (Task 23). Las apartadas no salen.
-- InventarioCuenta.olvidar(clave) -> boolean   quita un personaje guardado (uno borrado o que cambió de nombre). F3: no
--                              se borra: su ficha pasa tal cual a `apartadas` (como las de la v1) y deja de contar.
-- InventarioCuenta.olvidarOrden()         si alguien cambia lo guardado a mano (las pruebas), rehace la lista ordenada.
-- InventarioCuenta.rellenar(lista, hora) -> {personajes, objetos}   F2: lo que trae la importación de TSM, {{nombre
--                              («Nombre Apellido», nuestro formato), primero, clase, bolsas, banco, correo}…} de los personajes propios del reino de
--                              ahora. NO pisa lo contado aquí: una ficha que no existe se crea; en una que existe solo se
--                              rellenan el banco y el correo que faltan (nil) y la clase. Lo puesto lleva su hora en
--                              ficha.tsm (una ficha nueva lleva siempre la marca en las bolsas). Un banco o un correo que
--                              TSM da vacío llega como nil (TSM guarda {} también si nunca lo vio) y sigue «sin abrir»;
--                              un personaje sin nada de nada no crea ficha. Con deLaV1, la ficha de su primer nombre
--                              (p.primero) se aparta. Cuenta los personajes con algo nuevo y las unidades que han entrado.
-- InventarioCuenta.bolsas(nombre) -> {ids} | nil   F6: las bolsas que da el núcleo («bolsasPropias», «bolsasBanco» o
--                              «bolsasCuenta», de nucleo/espacio.lua), protegidas: con un núcleo de antes de la F2b (una
--                              instalación mezclada) no existen y antes el tooltip fallaba aquí; sin ellas, las propias son
--                              la mochila y las puestas, y el banco y el de cuenta, ninguna. Si la función falla, nil (no se
--                              apunta nada). Las dos cosas se apuntan una vez por función y sesión. También la usa Grupos.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Inv = {}
SNF.InventarioCuenta = Inv

local API = SNF.API
local floor = math.floor

local bancoAbierto = false
local buzonAbierto = false -- true con el buzón abierto; "cargado" si en esta apertura ya se contó lo que enseña
local orden = nil -- las claves de los personajes del reino de ahora, ya ordenadas
local ordenDe = nil -- la tabla pj con la que se hizo `orden` (si las SavedVariables cambian, se rehace)
local claveMia = nil -- la clave del personaje de ahora cuando se hizo `orden`
local hayCuenta = nil -- F2b: si el cliente tiene banco de cuenta (nil: aún no se ha mirado)
local ADJUNTOS_MAX = 16 -- ATTACHMENTS_MAX_RECEIVE del cliente

-- Un texto del cliente que se pueda usar (ni secreto ni vacío), o nil.
local function texto(v)
  if type(v) ~= "string" or API.esSecreto(v) or v == "" then
    return nil
  end
  return v
end

local function ahora()
  return API.horaServidor() or 0
end

-- F6 (en el juego, 20-nov): las bolsas que da el núcleo (API.bolsasPropias, API.bolsasBanco o API.bolsasCuenta, de la F2b),
-- protegidas. Con un núcleo de antes de la F2b (una instalación mezclada: el núcleo de otra rama con este comercio) no
-- existen, y llamarlas daba «attempt to call field 'bolsasCuenta' (a nil value)» dentro del tooltip, que cortaba todo lo que
-- venía detrás. Sin la función: las propias, la mochila y las puestas (0 a NUM_BAG_SLOTS, como antes de la F2b); el banco y
-- el de cuenta, ninguna (sin leerlos no se toca lo apuntado). Ronda 1: si la función existe y FALLA (o no da una lista),
-- nil: quien la llama no apunta nada (mejor nada que unas bolsas a medias, con menos unidades). Cada caso se apunta con
-- Comercio.anotarFallo una vez por función y sesión, distinguiendo «falta (instalación mezclada)» de «ha fallado».
local bolsasAvisadas = {} -- [nombre .. "|falta" | "|falla"] = true
local function avisarBolsas(nombre, caso, err)
  local clave = nombre .. "|" .. caso
  if bolsasAvisadas[clave] then
    return
  end
  bolsasAvisadas[clave] = true
  local comercio = rawget(SNF, "Comercio")
  if type(comercio) == "table" and type(comercio.anotarFallo) == "function" then
    local texto = caso == "falta" and ("falta API." .. nombre .. " en el núcleo (instalación mezclada)")
      or ("API." .. nombre .. " ha fallado: " .. (string.match(tostring(err), "^[^\n]*") or ""))
    pcall(comercio.anotarFallo, "inventario", texto)
  end
end

local function bolsasDe(nombre)
  local f = API[nombre]
  if type(f) == "function" then
    local ok, ids = pcall(f)
    if ok and type(ids) == "table" then
      return ids
    end
    avisarBolsas(nombre, "falla", ok and "no da una lista" or ids)
    return nil
  end
  avisarBolsas(nombre, "falta")
  local ids = {}
  if nombre == "bolsasPropias" then
    local puestas = tonumber(rawget(_G, "NUM_BAG_SLOTS")) or 4
    for i = 0, floor(puestas) do
      ids[#ids + 1] = i
    end
  end
  return ids
end
Inv.bolsas = bolsasDe

-- El personaje de ahora: su clave entera («Nombre Apellido», SNF.Personaje.clave()), el reino y el primer valor de
-- UnitName (nil si el juego aún no los da). F6b: el reino es el de SNF.Comercio.reino() (SNF.Personaje.reino()): en Forever
-- GetRealmName() puede dar "" y con él no se encontraba ninguna ficha.
local function yo()
  local okN, primero = pcall(UnitName, "player")
  local P = rawget(SNF, "Personaje")
  local okC, nombre = false, nil
  if type(P) == "table" and type(P.clave) == "function" then
    okC, nombre = pcall(P.clave)
  end
  local reino = SNF.Comercio.reino()
  primero = okN and texto(primero)
  -- F3: si Personaje.clave() da nil (un apellido secreto), nil: el primer nombre solo mezclaría a dos personajes. El
  -- primer nombre solo se usa si no hay Personaje.clave() o si da un error (okC falso).
  if okC then
    nombre = texto(nombre)
  else
    nombre = primero
  end
  if not nombre or not reino then
    return nil
  end
  return nombre, reino, primero or nombre
end

-- Aparta (sin borrar) la ficha con esa clave: pasa tal cual a `apartadas`, con la hora. true si apartó algo.
local function apartarFicha(inv, clave)
  local f = inv.pj[clave]
  if type(f) ~= "table" then
    return false
  end
  if type(inv.apartadas) ~= "table" then
    inv.apartadas = inv.apartadas == nil and {} or {_roto = inv.apartadas} -- lo estropeado se guarda, nunca se tira
  end
  local donde, n = clave, 1
  while inv.apartadas[donde] ~= nil do
    n = n + 1
    donde = clave .. " (" .. n .. ")"
  end
  inv.apartadas[donde] = {ficha = f, hora = ahora()}
  inv.pj[clave] = nil
  orden = nil
  return true
end

-- La v1 pasa a v = 2 (F2, ronda 1). Hace falta saber quién juega: sin eso se espera (y nil).
--   · Si el personaje de ahora tiene apellido (el cliente da los dos valores, como en Forever), TODAS las fichas de la v1
--     van con solo el primer nombre: se apartan a la vez, sin borrar, y dejan de contar ya (también la de dos personajes
--     mezclados que aún no han entrado). Cada uno rehace la suya al entrar, o la rellena la importación de TSM.
--   · Si no tiene apellido (fuera de Forever), las claves de la v1 ya eran las enteras: se quedan, apuntadas en deLaV1
--     por si entra uno con apellido (entonces se aparta la de su primer nombre, revisarV1).
local function migrar(inv)
  local nombre, _, primero = yo()
  if not nombre then
    return false
  end
  local claves = {}
  for clave, f in pairs(inv.pj) do
    if type(clave) == "string" and type(f) == "table" then
      claves[#claves + 1] = clave
    end
  end
  table.sort(claves)
  if nombre ~= primero then
    for _, clave in ipairs(claves) do
      apartarFicha(inv, clave)
    end
  elseif #claves > 0 then
    local v1 = type(inv.deLaV1) == "table" and inv.deLaV1 or {}
    for _, clave in ipairs(claves) do
      v1[clave] = true
    end
    inv.deLaV1 = v1
  end
  inv.v = 2
  return true
end

-- F6b: lo guardado con el reino vacío (una ficha «Nombre Apellido-» o con reino = "") o con el mismo reino escrito de otra
-- forma («CAMWOWUS1Realm5PvE») pasa al reino bueno, una vez por sesión y reino (nunca a uno provisional, ronda 1). Nada se borra: si la clave buena ya tiene
-- ficha (pudo mezclarse), la otra se aparta tal cual (apartarFicha) y la buena se queda; la del personaje de ahora se rehace
-- al entrar, como la ficha cortada. También deLaV1 y el reino del banco de cuenta.
local reinoPasado = nil -- el reino al que ya se pasó lo guardado en esta sesión

local function reinoMalo(r, clave, reino)
  if r == "" or (r == nil and string.sub(clave, -1) == "-") then
    return true
  end
  return type(r) == "string" and r ~= reino and SNF.Comercio.mismoReino(r, reino)
end

local function pasarReino(inv, reino)
  reinoPasado = reino
  local mover = {}
  for clave, f in pairs(inv.pj) do
    if type(clave) == "string" and type(f) == "table" and reinoMalo(f.reino, clave, reino) then
      mover[#mover + 1] = clave
    end
  end
  table.sort(mover)
  for _, clave in ipairs(mover) do
    local f = inv.pj[clave]
    local nombre = texto(f.nombre)
    local cola = "-" .. (type(f.reino) == "string" and f.reino or "")
    if not nombre and #clave > #cola and string.sub(clave, -#cola) == cola then
      nombre = string.sub(clave, 1, #clave - #cola)
    end
    local buena = nombre and (nombre .. "-" .. reino)
    if buena == clave then
      f.reino = reino -- ronda 1: la clave ya es la buena (solo estaba mal el reino de dentro): no es un choque
    elseif buena and inv.pj[buena] == nil then
      inv.pj[buena], inv.pj[clave] = f, nil
      f.nombre, f.reino = f.nombre or nombre, reino
      local v1 = inv.deLaV1
      if type(v1) == "table" and v1[clave] then
        v1[clave], v1[buena] = nil, true
      end
      orden = nil
    else
      apartarFicha(inv, clave) -- choca con la buena (o no se sabe de quién es): se aparta, sin borrarla
    end
  end
  local bc = inv.bancoCuenta
  if type(bc) == "table" and reinoMalo(bc.reino, "", reino) then
    bc.reino = reino
  end
end

-- La tabla del inventario, lista y en v = 2 (o nil si aún no hay cuenta guardada, o si aún no se puede pasar de la v1).
local function inventario()
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  if type(c) ~= "table" then
    return nil
  end
  local inv = c.inventario
  if type(inv) ~= "table" then
    inv = {v = 2, pj = {}}
    c.inventario = inv
  end
  if type(inv.pj) ~= "table" then
    inv.pj = {}
  end
  if inv.v ~= 2 and not migrar(inv) then
    return nil -- sin saber quién juega, no se cuenta nada de la v1 (puede estar mezclada)
  end
  local reino, provisional = SNF.Comercio.reino()
  if reino and not provisional and reino ~= reinoPasado then
    pasarReino(inv, reino) -- ronda 1: nunca a un reino provisional (solo el normalizado)
  end
  return inv
end

local function guardado()
  local inv = inventario()
  return inv and inv.pj
end

-- Lo de la v1 sin apellido (deLaV1) al saber la clave entera de un personaje: si su clave cortada («<primer nombre>-<reino>»,
-- con el primer nombre en nuestro formato) es otra, esa ficha se aparta; si es la misma, la ficha es suya.
local function revisarV1(inv, clave, primero, reino)
  local v1 = inv.deLaV1
  if type(v1) ~= "table" then
    return
  end
  local corta = primero .. "-" .. reino
  if corta ~= clave and v1[corta] then
    v1[corta] = nil
    apartarFicha(inv, corta)
  end
  v1[clave] = nil
  if next(v1) == nil then
    inv.deLaV1 = nil
  end
end

-- La ficha del personaje de ahora (se crea si falta), o nil si no se puede saber quién es.
local function miFicha()
  local inv = inventario()
  local nombre, reino, primero = yo()
  if not inv or not nombre then
    return nil
  end
  local clave = nombre .. "-" .. reino
  revisarV1(inv, clave, primero, reino)
  local pj = inv.pj
  local f = pj[clave]
  if type(f) ~= "table" then
    f = {bolsas = {}}
    pj[clave] = f
    orden = nil
  end
  f.nombre, f.reino = nombre, reino
  local ok, _, clase = pcall(UnitClass, "player")
  f.clase = ok and texto(clase) or f.clase
  return f
end

-- Esa parte ya la hemos contado nosotros: deja de ser de TSM.
local function nuestra(f, parte)
  local t = f.tsm
  if type(t) == "table" then
    t[parte] = nil
    if next(t) == nil then
      f.tsm = nil
    end
  end
end

-- Suma lo que hay en esas bolsas: {[objeto] = unidades}, y cuántos huecos se han podido leer.
local function contar(bolsas)
  local cuenta, leidos = {}, 0
  for _, bolsa in ipairs(bolsas) do
    local n = API.huecosBolsa(bolsa)
    if n and n > 0 then
      leidos = leidos + n
      for hueco = 1, floor(n) do
        local c = API.infoContenedor(bolsa, hueco)
        if c then
          cuenta[c.id] = (cuenta[c.id] or 0) + c.n
        end
      end
    end
  end
  return cuenta, leidos
end

function Inv.apuntarBolsas()
  local f = miFicha()
  if not f then
    return
  end
  -- F2b: con la bolsa de componentes (API.bolsasPropias). Una lectura sin ningún hueco (al salir el juego puede no dejar
  -- leerlas) no pisa lo contado, como el banco al cerrarlo.
  local bolsas = bolsasDe("bolsasPropias")
  if not bolsas then
    return -- F6, ronda 1: el núcleo falló al darlas: lo contado se queda
  end
  local cuenta, leidos = contar(bolsas)
  if leidos == 0 then
    return
  end
  f.bolsas = cuenta
  nuestra(f, "bolsas")
end

function Inv.apuntarBanco(cerrando)
  local f = miFicha()
  if not f then
    return
  end
  local bolsas = bolsasDe("bolsasBanco")
  if not bolsas then
    return -- F6, ronda 1: el núcleo falló al darlas: lo apuntado se queda
  end
  local cuenta, leidos = contar(bolsas)
  if leidos == 0 then
    return -- el juego no deja leer el banco ahora
  end
  if cerrando and next(cuenta) == nil and f.banco then
    return -- al cerrar puede salir vacío sin estarlo: lo apuntado se queda
  end
  f.banco = cuenta
  nuestra(f, "banco")
end

-- F2b: el banco de cuenta (API.bolsasCuenta: en Forever las pestañas 15 a 23), uno para toda la cuenta: no es de ningún
-- personaje. Misma regla que el banco: sin poder leerlo no se toca y al cerrar, vacío, no borra lo apuntado.
function Inv.apuntarBancoCuenta(cerrando)
  local inv = inventario()
  local bolsas = bolsasDe("bolsasCuenta")
  if not inv or not bolsas or #bolsas == 0 then
    return
  end
  local cuenta, leidos = contar(bolsas)
  if leidos == 0 then
    return
  end
  local actual = inv.bancoCuenta
  local visto = type(actual) == "table" and type(actual.objetos) == "table"
  if cerrando and next(cuenta) == nil and visto then
    return -- al cerrar puede salir vacío sin estarlo: lo apuntado se queda
  end
  -- Lo estropeado se guarda, nunca se tira (como en apartarFicha). F2b: también una tabla mal formada (sus objetos no son
  -- una tabla), entera; de una bien formada se sigue lo que ya tenía en _roto.
  local roto = nil
  if actual ~= nil and not visto then
    roto = actual
  elseif visto then
    roto = actual._roto
  end
  -- F2b: con el reino en el que se vio, para poder filtrar por reino más adelante sin migrar nada.
  local _, reino = yo()
  inv.bancoCuenta = {objetos = cuenta, hora = ahora(), reino = reino, _roto = roto}
end

-- Lo que traen las cartas del buzón abierto: {[objeto] = unidades} y cuántas cartas enseña el juego (nil si no deja
-- leerlo). Solo cantidades: ni el remitente ni el texto.
local function leerBuzon()
  local cartas = rawget(_G, "GetInboxNumItems")
  local item, enlace = rawget(_G, "GetInboxItem"), rawget(_G, "GetInboxItemLink")
  if type(cartas) ~= "function" or (type(item) ~= "function" and type(enlace) ~= "function") then
    return nil
  end
  local ok, n = pcall(cartas)
  if not ok or type(n) ~= "number" or API.esSecreto(n) then
    return nil
  end
  local adjuntos = tonumber(rawget(_G, "ATTACHMENTS_MAX_RECEIVE")) or ADJUNTOS_MAX
  local cuenta = {}
  for carta = 1, floor(n) do
    for adjunto = 1, adjuntos do
      local id, unidades
      if type(item) == "function" then
        local okI, _, i, _, u = pcall(item, carta, adjunto)
        if okI then
          id, unidades = i, u
        end
      end
      if (type(id) ~= "number" or API.esSecreto(id)) and type(enlace) == "function" then
        local okE, e = pcall(enlace, carta, adjunto)
        id = okE and type(e) == "string" and not API.esSecreto(e) and tonumber(string.match(e, "item:(%d+)")) or nil
      end
      if type(id) == "number" and not API.esSecreto(id) and id > 0 then
        if type(unidades) ~= "number" or API.esSecreto(unidades) or unidades < 1 then
          unidades = 1
        end
        cuenta[id] = (cuenta[id] or 0) + floor(unidades)
      end
    end
  end
  return cuenta, n
end

function Inv.apuntarCorreo(momento)
  local f = miFicha()
  if not f then
    return
  end
  local cuenta, cartas = leerBuzon()
  if not cuenta then
    return -- el juego no deja leer el buzón
  end
  if momento == "abrir" and cartas == 0 then
    return -- aún sin cargar: llega MAIL_INBOX_UPDATE
  end
  if momento == "cerrar" and buzonAbierto ~= "cargado" then
    return -- F3: en esta apertura no llegó MAIL_INBOX_UPDATE (ni había cartas al abrir): el correo se queda como estaba
  end
  if momento == "cerrar" and next(cuenta) == nil and f.correo then
    return -- al cerrar puede salir vacío sin estarlo: lo apuntado se queda
  end
  if buzonAbierto then
    buzonAbierto = "cargado"
  end
  f.correo = cuenta
  nuestra(f, "correo")
end

function Inv.olvidarOrden()
  orden = nil
end

-- Las claves de los personajes del reino de ahora: primero el de ahora, luego por orden alfabético.
local function ordenadas(pj)
  if orden and ordenDe == pj then
    return orden
  end
  local nombre, reino = yo()
  if not nombre then
    return nil -- aún no se sabe el reino: no se guarda una lista a medias
  end
  local mia = nombre .. "-" .. reino
  local lista = {}
  for clave, f in pairs(pj) do
    if type(clave) == "string" and type(f) == "table" and f.reino == reino and clave ~= mia then
      lista[#lista + 1] = clave
    end
  end
  table.sort(lista)
  if type(pj[mia]) == "table" then
    table.insert(lista, 1, mia)
  end
  orden, ordenDe, claveMia = lista, pj, mia
  return lista
end

-- Las unidades que el personaje de ahora lleva encima, preguntadas al juego en el momento (sin recorrer las bolsas).
local function llevoEncima(objeto)
  local ok, n = pcall(API.cuentaObjeto, objeto)
  if ok and type(n) == "number" and not API.esSecreto(n) and n > 0 then
    return n
  end
  return 0
end

local function unidades(tabla, objeto)
  local n = type(tabla) == "table" and tabla[objeto]
  return type(n) == "number" and n or 0
end

-- Las partes de la fila que vienen de TSM (con su hora), o nil. Las bolsas del de ahora son del juego, nunca de TSM.
local function deTSM(f, mio, vistoBanco, vistoCorreo)
  local t = f.tsm
  if type(t) ~= "table" then
    return nil
  end
  local b = not mio and type(t.bolsas) == "number" and t.bolsas or nil
  local k = vistoBanco and type(t.banco) == "number" and t.banco or nil
  local c = vistoCorreo and type(t.correo) == "number" and t.correo or nil
  if not (b or k or c) then
    return nil
  end
  return {bolsas = b, banco = k, correo = c}
end

-- F2b: ¿tiene el cliente banco de cuenta? (Enum.BagIndex no cambia en la sesión: se mira una vez.)
local function hayBancoCuenta()
  if hayCuenta == nil then
    local bolsas = bolsasDe("bolsasCuenta")
    if not bolsas then
      return false -- F6, ronda 1: tras un fallo no se guarda: se vuelve a mirar en el siguiente
    end
    hayCuenta = #bolsas > 0
  end
  return hayCuenta
end

-- Shopping counts the selected, observed sources. A missing snapshot is not zero stock.
function Inv.shoppingStock(item, sources)
  local items = rawget(_G, "C_Item")
  local getCount = type(items) == "table" and rawget(items, "GetItemCount") or rawget(_G, "GetItemCount")
  if type(getCount) ~= "function" then return nil end
  local ok, count = pcall(getCount, item, false)
  if not ok or API.esSecreto(count) or type(count) ~= "number" or count ~= floor(count)
    or count < 0 or count == math.huge then return nil end
  if not (sources.alters or sources.banco) then return count end
  local inv = inventario()
  local pj = inv and inv.pj
  local keys = pj and ordenadas(pj)
  if not keys then return nil end
  if sources.banco then
    local mine = pj[claveMia]
    if type(mine) ~= "table" or type(mine.banco) ~= "table" then return nil end
    count = count + unidades(mine.banco, item)
    if hayBancoCuenta() then
      local account = inv.bancoCuenta
      if type(account) ~= "table" or type(account.objetos) ~= "table" then return nil end
      count = count + unidades(account.objetos, item)
    end
  end
  if sources.alters then
    for _, key in ipairs(keys) do
      if key ~= claveMia then
        local character = pj[key]
        if type(character.bolsas) ~= "table" or (sources.banco and type(character.banco) ~= "table") then
          return nil
        end
        count = count + unidades(character.bolsas, item)
        if sources.banco then count = count + unidades(character.banco, item) end
      end
    end
  end
  return count
end

function Inv.de(objeto)
  local inv = inventario()
  local pj = inv and inv.pj
  local claves = pj and ordenadas(pj)
  if not claves then
    return 0, nil
  end
  local total, lista = 0, nil
  local falta = {bancos = 0, correos = 0, sinEntrar = true}
  for i = 1, #claves do
    local f = pj[claves[i]]
    if type(f) == "table" then
      local mio = claves[i] == claveMia
      local bolsas = mio and llevoEncima(objeto) or unidades(f.bolsas, objeto)
      local visto, vistoCorreo = type(f.banco) == "table", type(f.correo) == "table"
      local banco = visto and unidades(f.banco, objeto) or 0
      local correo = vistoCorreo and unidades(f.correo, objeto) or 0
      if not visto then
        falta.bancos = falta.bancos + 1
      end
      if not vistoCorreo then
        falta.correos = falta.correos + 1
      end
      local suma = bolsas + banco + correo
      if suma > 0 then
        lista = lista or {}
        lista[#lista + 1] = {
          nombre = type(f.nombre) == "string" and f.nombre or claves[i],
          clase = f.clase,
          bolsas = bolsas,
          banco = visto and banco or nil,
          correo = vistoCorreo and correo or nil,
          total = suma,
          tsm = deTSM(f, mio, visto, vistoCorreo),
        }
        total = total + suma
      end
    end
  end
  -- F2b: el banco de cuenta, una sola vez (no es de ningún personaje): el cuarto valor, sus unidades si tiene alguna.
  local bc = inv.bancoCuenta
  local deCuenta = nil
  if type(bc) == "table" and type(bc.objetos) == "table" then
    local n = unidades(bc.objetos, objeto)
    if n > 0 then
      deCuenta = n
      total = total + n
    end
  elseif hayBancoCuenta() then
    falta.bancoCuenta = true
  end
  return total, lista, falta, deCuenta
end

function Inv.personajes()
  local pj = guardado()
  local salida = {}
  if not pj then
    return salida
  end
  local nombre, reino = yo()
  local mia = nombre and (nombre .. "-" .. reino) or nil
  local claves = {}
  for clave, f in pairs(pj) do
    if type(clave) == "string" and type(f) == "table" and clave ~= mia then
      claves[#claves + 1] = clave
    end
  end
  table.sort(claves)
  if mia and type(pj[mia]) == "table" then
    table.insert(claves, 1, mia)
  end
  for i, clave in ipairs(claves) do
    local f = pj[clave]
    salida[i] = {clave = clave, nombre = f.nombre, reino = f.reino, clase = f.clase,
      tsm = type(f.tsm) == "table" and f.tsm or nil}
  end
  return salida
end

-- F3: no se borra: la ficha se aparta tal cual (apartarFicha), como las de la v1.
function Inv.olvidar(clave)
  local inv = inventario()
  if not inv or type(clave) ~= "string" then
    return false
  end
  return apartarFicha(inv, clave)
end

-- Suma las unidades de una tabla {[objeto] = n}.
local function sumar(t)
  local n = 0
  for _, u in pairs(t) do
    if type(u) == "number" then
      n = n + u
    end
  end
  return n
end

-- Lo que trae TSM de un personaje a su ficha (nueva o la nuestra). Devuelve las unidades puestas y si había algo que poner.
local function rellenarFicha(inv, clave, nombre, reino, p, hora)
  local f = inv.pj[clave]
  local nuevo = type(f) ~= "table"
  if nuevo then
    if not (p.bolsas or p.banco or p.correo) then
      return 0, false -- TSM no tiene nada de él: no se crea una ficha vacía que parezca nuestra
    end
    -- Una ficha nueva es entera de TSM: sus bolsas llevan la marca también vacías, para que nunca parezcan nuestras.
    f = {nombre = nombre, reino = reino, bolsas = p.bolsas or {}, tsm = {bolsas = hora}}
    inv.pj[clave] = f
    orden = nil
  end
  local puesto = nuevo and sumar(f.bolsas) or 0
  local tsm = type(f.tsm) == "table" and f.tsm or {}
  for _, parte in ipairs({"banco", "correo"}) do
    if f[parte] == nil and type(p[parte]) == "table" then
      f[parte] = p[parte]
      tsm[parte] = hora
      puesto = puesto + sumar(p[parte])
    end
  end
  if next(tsm) ~= nil then
    f.tsm = tsm
  end
  if f.clase == nil and texto(p.clase) then
    f.clase = p.clase
  end
  return puesto, nuevo or puesto > 0
end

function Inv.rellenar(lista, hora)
  local inv = inventario()
  local _, reino = yo()
  local hechos = {personajes = 0, objetos = 0}
  if not inv or not reino or type(lista) ~= "table" then
    return hechos
  end
  hora = type(hora) == "number" and hora or ahora()
  for _, p in ipairs(lista) do
    local nombre = type(p) == "table" and texto(p.nombre)
    if nombre then
      local clave = nombre .. "-" .. reino
      -- El primer nombre en nuestro formato (el de SNF.Personaje.clave(): «Nombre Apellido», con un espacio).
      revisarV1(inv, clave, texto(p.primero) or string.match(nombre, "^(.-) ") or nombre, reino)
      local puesto, cambio = rellenarFicha(inv, clave, nombre, reino, p, hora)
      if cambio then
        hechos.personajes = hechos.personajes + 1
        hechos.objetos = hechos.objetos + puesto
      end
    end
  end
  return hechos
end

---------------------------------------------------------------------------------------------------
-- Eventos
---------------------------------------------------------------------------------------------------

-- Al entrar y al salir del mundo (cambiar de personaje, /reload, cerrar el juego): lo que verán los demás personajes.
local function alEntrarOSalir()
  Inv.apuntarBolsas()
end
SNF.Eventos.escuchar("PLAYER_ENTERING_WORLD", alEntrarOSalir)
SNF.Eventos.escuchar("PLAYER_LEAVING_WORLD", alEntrarOSalir)
SNF.Eventos.escuchar("PLAYER_LOGOUT", alEntrarOSalir)

-- BAG_UPDATE_DELAYED solo se escucha mientras el banco está abierto.
local function alCambiarConBanco()
  Inv.apuntarBolsas()
  Inv.apuntarBanco()
  Inv.apuntarBancoCuenta()
end

SNF.Eventos.escuchar("BANKFRAME_OPENED", function()
  if not bancoAbierto then
    bancoAbierto = true
    SNF.Eventos.escuchar("BAG_UPDATE_DELAYED", alCambiarConBanco)
  end
  Inv.apuntarBanco()
  Inv.apuntarBancoCuenta()
end)

SNF.Eventos.escuchar("BANKFRAME_CLOSED", function()
  Inv.apuntarBanco(true)
  Inv.apuntarBancoCuenta(true)
  bancoAbierto = false
  SNF.Eventos.dejar("BAG_UPDATE_DELAYED", alCambiarConBanco)
end)

-- F2: el buzón. MAIL_INBOX_UPDATE solo se escucha mientras está abierto.
local function alCambiarBuzon()
  Inv.apuntarCorreo("cambio")
end

SNF.Eventos.escuchar("MAIL_SHOW", function()
  if not buzonAbierto then
    buzonAbierto = true
    SNF.Eventos.escuchar("MAIL_INBOX_UPDATE", alCambiarBuzon)
  end
  Inv.apuntarCorreo("abrir")
end)

SNF.Eventos.escuchar("MAIL_CLOSED", function()
  if buzonAbierto then
    Inv.apuntarCorreo("cerrar")
  end
  buzonAbierto = false
  SNF.Eventos.dejar("MAIL_INBOX_UPDATE", alCambiarBuzon)
end)
