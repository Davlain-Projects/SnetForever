-- SnetForever: comprar con un clic (fase 1 del comercio, tarea 13). Todo el dinero va en cobre.
--
-- El jugador pulsa una fila de la ventana de comercio (o, más adelante, un hallazgo del sniper): Compra.elegir busca esa
-- subasta en el servidor (SendSearchQuery; el servidor responde como mercancía o como objeto suelto) y deja la compra
-- «lista» enseñando qué, cuántas y cuánto. El botón Comprar de la barra (ui/comercio.lua) llama a Compra.pulsar desde su
-- OnClick:
--   objeto     (arreglo de la compra suelta, 2026-11-19) el primer clic NUNCA compra: pasa a «confirmar» sin llamar al
--              juego (el botón dice «Confirmar 1 por X», el mismo total). El segundo clic lee lo que de verdad cuesta
--              ahora ESA subasta (su buyoutAmount, por su auctionID, en lo último que dio el juego): si ya no está,
--              «error» ya_no_esta; si pasa del total del botón o del precio por unidad de la fila × 1, «error»
--              cambio_precio; si no, PlaceBid(subasta, ese precio) → «comprando». Una compra de objeto es siempre 1 unidad:
--              en WoW Forever una fila de objeto agrupa `quantity` subastas iguales de 1 y buyoutAmount es lo que cuesta
--              UNA. Sin el segundo clic en ESPERA_CONFIRMAR s, «error» sin_confirmar.
--              «hecho» cuando el juego la da por hecha (AUCTION_HOUSE_PURCHASE_COMPLETED con su auctionID, aunque antes
--              haya llegado un error de la subasta) o cuando el oro baja lo que costaba.
--              Un error de esa compra (AUCTION_HOUSE_SHOW_ERROR, o UI_ERROR_MESSAGE con un texto de la subasta) es un
--              error claro; otro error rojo (UI_ERROR_MESSAGE) es dudoso. Los dos dan «error» motivo fallo, pero lo
--              gastado no se quita hasta pasar ESPERA_COMPRA s sin que baje el oro. Si el oro baja antes: tras un error
--              dudoso sí se compró («hecho», se dice en el chat y se pasa a la siguiente fila); tras uno claro solo cuenta
--              para el tope (puede ser otra bajada de oro), sin decir «has comprado» ni cambiar de fila, salvo que llegue
--              AUCTION_HOUSE_PURCHASE_COMPLETED de su subasta (AUCTION_HOUSE_SHOW_ERROR no dice de qué subasta es: en el
--              juego llegó uno con la compra hecha y la barra dijo «La compra no se ha hecho.»).
--   mercancía  StartCommoditiesPurchase(item, cantidad) → «comprando» hasta COMMODITY_PRICE_UPDATED(unidad, total) →
--              «confirmar» con el total real (si ha subido, se dice; si pasa del precio por unidad de la fila × la
--              cantidad, se cancela: «error» cambio_precio; una cotización que no cuadra con unidad × la cantidad pedida
--              se tira: es de otra cantidad; revisión B7) → otro clic: ConfirmCommoditiesPurchase(item,
--              cantidad) → COMMODITY_PURCHASE_SUCCEEDED = «hecho» (COMMODITY_PURCHASE_FAILED = «error» fallo). Sin
--              confirmar en ESPERA_CONFIRMAR s, se cancela: «error» sin_confirmar (el escaneo y el sniper no esperan
--              sin límite).
-- Nunca juega por el jugador: las tres funciones de compra solo están dentro de Compra.pulsar, y a Compra.pulsar solo lo
-- llama el OnClick del botón Comprar; una compra por clic. En combate (Compra.combate()) Compra.pulsar no hace nada y,
-- al empezar el combate, una mercancía a medio confirmar se cancela («error» combate) y una compra armada se desarma.
-- Tras «hecho» se elige la siguiente fila buena de la ventana y se deja «lista» (no se compra sola), salvo que
-- comercioSiguienteSola valga false.
-- Doble clic: el botón tiene un OnDoubleClick vacío, y Compra.pulsar no acepta clics durante BLOQUEO s después de pasar a
-- «confirmar» (o de cambiar el total en «confirmar») y de dejar «lista» una fila elegida sola tras «hecho». Al pasar a
-- «confirmar» o cambiar el total el botón cambia de texto por el clic del jugador, y así lo ve antes de que otro clic
-- cuente.
-- Compra.combate() -> boolean   en combate: la marca de los eventos (Compra.enCombate: true con PLAYER_REGEN_DISABLED,
--                                       false con PLAYER_REGEN_ENABLED) o InCombatLockdown(). En el cliente
--                                       PLAYER_REGEN_DISABLED llega justo antes de que empiece el bloqueo, cuando
--                                       InCombatLockdown() aún da false: por eso manda la marca. La marca se rehace con
--                                       InCombatLockdown() en PLAYER_ENTERING_WORLD y AUCTION_HOUSE_SHOW
--                                       (Compra.rehacerCombate), por si un PLAYER_REGEN_ENABLED se perdió.
--
-- Se compra EXACTAMENTE la fila marcada (regla del coordinador, bloque B, ronda 1 de B5; vale para la lista, el sniper y
-- la vista de resultados), nunca otra subasta ni más cantidad ni más cara, aunque haya otra más barata:
--   objeto     la subasta de la fila: con auctionID (resultados), esa, con su total y su cantidad; si no, la que tiene el
--              precio por unidad de la fila (y, con fila exacta, su cantidad). Si no está: «error» ya_no_esta (también
--              si al comprar el servidor dice ERR_ITEM_NOT_FOUND); si solo está con otro precio: «error» cambio_precio.
--              Su cantidad no se elige. La respuesta del servidor se casa por la itemKey entera (nivel, sufijo…), no solo
--              por el itemID: otra variante del mismo objeto no es la pedida (revisión B7).
--   mercancía  el precio por unidad de la fila es el tope de cada unidad: solo cuentan los escalones que no lo pasan. Con
--              fila marcada (resultados, lista vieja y sniper; B6r, rondas 1 y 2), al llegar la cotización y antes de ofrecer ningún clic, se rellenan las unidades
--              pedidas con la lista de ahora de la más barata hacia arriba: si no caben todas a ese precio, no se ofrece
--              nada («Ya no hay N a ese precio: quedan M»: vuelve a «lista» con M, o «cambio_precio» con 0); si caben pero
--              el juego cotiza más que esa lista, «cambio_precio» (la lista es vieja). Con la compra «lista», una lista
--              nueva del mismo objeto pone al día su total (o la suelta si su subasta de objeto ya no está). Empieza en 1 unidad
--              (con fila exacta, en la cantidad de la fila) y el jugador elige cuántas con Compra.ponerCantidad (el cuadro
--              de cantidad), como mucho Compra.maxCantidad: con fila exacta (B6r, punto 10), todo lo que hay a la venta al
--              precio de la fila o menos, de la más barata hacia arriba (antes, la cantidad de la fila). Si ya no se puede (nada a la
--              venta: ya_no_esta; solo más caro, o con fila exacta menos unidades: cambio_precio), no se compra. Si el
--              servidor cotiza más que ese precio × la cantidad, cambio_precio.
-- F12: nunca se cuenta lo propio. De una fila de mercancía solo se compran sus `comprables` (SNF.Comercio.duenoMercancia).
-- El juego vende de la más barata hacia arriba, así que los escalones se cortan ANTES de una fila por la que no se debe
-- pasar sin que el botón lo diga: una de la que no se sabe cuántas son tuyas («error» propias_desconocidas si no queda
-- nada a tu tope) o una de otro personaje de la cuenta (otro_personaje). e.corte es ese precio, y la barra lo dice.
-- Una fila de otro personaje que el jugador ha marcado él mismo (fila exacta, a ese precio) no se bloquea ni se fuerza: la
-- pide y lo decide el juego. Un objeto suelto por precio nunca elige una subasta de otro personaje; marcada, sí.
-- Si hay unidades propias (sabidas o no) al tope de la compra o por debajo, la cotización tiene que ser IGUAL al total de la
-- lista: una más baja querría decir que el servidor vende lo tuyo, y se cancela con cambio_precio. Lo mismo si en la lista
-- hay, a CUALQUIER precio, una fila de otro personaje o una que no se sabe de quién es: con la lista vieja, una cotización
-- más baja puede llevar unidades de esa fila, aunque esté por encima del tope.
-- Sin precio de fila no hay compra (revisión B7): Compra.elegir da false, así que toda compra tiene su tope por unidad.
-- La regla del grupo (la que usa la ventana: la del grupo elegido o la del primer grupo del objeto, o el grupo que trae la
-- fila; los valores guardados se recortan a sus rangos) solo frena: maxUnidades y maxOro («error» regla), nunca amplía.
-- Una fila exacta (vivo.exacta, la vista de resultados) no lleva regla de grupo: ni tope de unidades ni de oro (su precio
-- por unidad sigue siendo el tope; de un objeto, su cantidad es la de la subasta). El total de una
-- mercancía sale de los escalones de precio, del más barato al más caro. Los resultados de un objeto se leen con la
-- itemKey que trae ITEM_SEARCH_RESULTS_UPDATED (el equipo lleva nivel y sufijo).
-- Antes de cada paso que gasta: sin oro bastante (GetMoney() < total) → «error» sin_oro; con comercioTope > 0, si lo
-- gastado en la sesión más el total pasa del tope → «error» tope. Un total de más de comercioAvisoOro en una mercancía
-- (aviso) hace rojo el segundo clic, el de confirmar; un objeto suelto pide siempre el segundo clic (sin aviso). Lo gastado se apunta en el clic y dura hasta el próximo /reload; mejor de más que de menos:
-- solo se quita si el servidor dice que la mercancía falló o si pasan ESPERA_COMPRA s de un objeto con error sin que
-- baje el oro. Varias compras pendientes se siguen a la vez (lista `pendientes`).
--
-- Compra.elegir(item [, vivo]) -> boolean   item = id o una fila de UIComercio.fila(i) ({item, precio, cantidad}).
--                                     vivo = {precio, cantidad [, itemKey]} para un id (sin él, lo del escaneo en vivo,
--                                     si existe); precio = el precio por unidad de la fila. La fila puede traer grupo (la
--                                     clave de su regla; false = la plantilla), origen = 'sniper' o 'resultados' (tras
--                                     «hecho» no se elige otra fila de la lista) y, desde resultados, exacta = true (empieza
--                                     en la cantidad de esa subasta o escalón, sin regla de grupo), auctionID y total (la
--                                     compra ya entera de esa subasta de objeto).
--                                     Sin precio (ni de la fila ni del escaneo en vivo) da false y no cambia nada.
--                                     Pausa el sniper (el escaneo espera solo mientras la compra busca, confirma o
--                                     compra: mira Compra.estado()). Da false con el comercio
--                                     apagado o mientras una compra espera al servidor.
-- Compra.escalones() -> {{precio, n, acumulado, tiempo}}   los escalones de la compra elegida, de menor a mayor precio por
--                                     unidad, sin las subastas propias. En una mercancía, un escalón por precio; en un
--                                     objeto suelto, una fila por subasta con su tiempo restante (timeLeftSeconds de
--                                     ITEM_SEARCH_RESULTS, o nil). acumulado = unidades hasta ese escalón, incluido.
--                                     {} sin nada elegido o mientras busca. Es una copia.
-- Compra.maxCantidad() -> n           lo más que deja comprar: de una mercancía, el menor de las unidades hasta el precio
--                                     límite, regla.maxUnidades y las que caben en regla.maxOro (con fila exacta, todas las
--                                     unidades al precio de la fila o menos); de un objeto, la cantidad
--                                     de su subasta. 0 sin nada preparado.
-- Compra.ponerCantidad(n) -> boolean  solo en una mercancía «lista» o por «confirmar». Recorta n a 1..maxCantidad(),
--                                     recalcula el total con los escalones y emite SNF_COMERCIO_COMPRA. En «confirmar»
--                                     cancela antes la compra a medias (CancelCommoditiesPurchase) y vuelve a «lista».
--                                     Como al cambiar el total en «confirmar», el botón no acepta clics BLOQUEO s. Con algo
--                                     que no sea un número entero ≥ 1 (o fuera de ese caso) da false y no cambia nada.
--                                     El oro y el tope no frenan aquí: se miran con el total nuevo en el clic de Comprar.
-- Compra.estado() -> nil | {fase = 'buscando'|'lista'|'confirmar'|'comprando'|'hecho'|'error', item, cantidad,
--                    precioUnit, total, motivo? ('sin_oro'|'tope'|'regla'|'sin_subasta'|'ya_no_esta'|'cambio_precio'|
--                    'sin_unidades'|'fallo'|'sin_respuesta'|'sin_confirmar'|'combate'|'propias_desconocidas'|
--                    'otro_personaje'), corte? (F12: el precio de la fila que frena la compra), texto? (el del error rojo),
--                    tipo ('objeto'|'mercancia'), aviso, armada, subio,
--                    totalAntes, esperando ('sistema'|'precio'|'compra'), bloqueada (no acepta clics aún),
--                    pedidas y quedan (B6r, ronda 1: con una fila exacta, ya no había `pedidas` a su precio y la compra
--                    volvió a «lista» con las `quedan` que sí caben),
--                    regla = {maxUnidades, maxOro}, ultima, origen? ('sniper' si la eligió el sniper, 'resultados' si
--                    salió de la vista de resultados de la búsqueda)}
-- Compra.pulsar()                       solo desde el OnClick del botón Comprar.
-- Compra.cancelar()                     descarta lo elegido (y cancela la mercancía a medio confirmar); no con una
--                                       compra ya pedida al servidor.
-- Compra.ceder()                        F13: nuestra ventana se ha escondido: suelta lo elegido; una mercancía a medio confirmar o
--                                       esperando su precio se libera con un solo CancelCommoditiesPurchase (la única petición
--                                       que sale sin la ventana) y nunca se confirma. Una compra ya pedida al servidor no se puede
--                                       deshacer: se sigue hasta su resultado. Al volver, el jugador elige y pulsa otra vez. Sin la
--                                       ventana a la vista (SNF.Comercio.ventanaVisible), elegir y pulsar dan false y buscar no
--                                       envía nada; tampoco se elige sola la fila siguiente tras «hecho».
-- Compra.parar()                        lo mismo siempre y deja de escuchar (al cerrar la subasta o apagarse el comercio).
-- Compra.gastado() -> cobre             lo gastado con compras desde el último /reload (SNF_COMERCIO_GASTO(cobre)
--                                       cada vez que cambia).
-- El aviso de oro (comercioAvisoOro) se mira con el ajuste de ahora: al quedar «lista», en cada clic de Comprar y
-- cuando el jugador lo cambia (SNF_AJUSTE_CAMBIADO) con una compra «lista» o por confirmar.
-- Emite SNF_COMERCIO_COMPRA(fase, estado) en cada cambio (fase nil = nada elegido). Una compra de objeto que se ve
-- hecha cuando ya hay otra elegida emite SNF_COMERCIO_COMPRA("hecho", la comprada).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Compra = {}
SNF.Compra = Compra

local floor, ceil, min, max = math.floor, math.ceil, math.min, math.max

local ESPERA_BUSQUEDA = 10 -- segundos que se espera la respuesta a una búsqueda o al precio de una mercancía
local ESPERA_COMPRA = 15 -- segundos que se espera el resultado de una compra
local ESPERA_CONFIRMAR = 60 -- segundos que una mercancía espera el clic de confirmar antes de cancelarse
local BLOQUEO = 0.5 -- segundos sin aceptar clics tras cambiar lo que pide el botón
local SIN_TOPE_ORO = 1e15 -- cobre: «sin límite» de oro de una compra sin regla de grupo (el tope de gasto sigue)
local SIN_TOPE_UNIDADES = 1e9 -- «sin límite» de unidades de una compra sin regla de grupo (manda el precio de la fila)

-- Textos de GlobalStrings de los errores de la subasta: un UI_ERROR_MESSAGE con uno de ellos es un error claro de la
-- compra. Los que no existan en el cliente no cuentan.
local ERRORES_SUBASTA = {
  "ERR_ITEM_NOT_FOUND", "ERR_NOT_ENOUGH_MONEY", "ERR_AUCTION_DATABASE_ERROR", "ERR_AUCTION_HIGHER_BID",
  "ERR_AUCTION_BID_OWN", "ERR_AUCTION_MIN_BID", "ERR_AUCTION_BID_INCREMENT", "ERR_AUCTION_HOUSE_DISABLED",
  "ERR_AUCTION_RESTRICTED_ACCOUNT",
}

local pedirConfirmar, revisarObjeto -- (se definen abajo, junto a Compra.pulsar)
local actual = nil -- la compra elegida
local gastado = 0
local pasos = 0 -- cuenta de cambios de fase: un plazo vencido de un paso viejo no hace nada
local escuchando = false
-- Compras pedidas cuyo oro aún no se ha visto bajar: {e, total, mercancia, error = nil|'dudoso'|'claro'}.
local pendientes = {}
local ultimoDinero = nil -- el oro la última vez que se miró (para saber cuánto baja con cada PLAYER_MONEY)

local PUBLICOS = {
  "fase", "item", "cantidad", "precioUnit", "total", "motivo", "texto", "tipo", "aviso", "armada", "subio",
  "totalAntes", "esperando", "ultima", "origen", "pedidas", "quedan", "corte", "shoppingId",
}

local function ejecutar(nombre, fn, ...)
  return SNF.Comercio.ejecutar(nombre, fn, ...)
end

local function copia(e)
  local c = {}
  for _, campo in ipairs(PUBLICOS) do
    c[campo] = e[campo]
  end
  c.bloqueada = e.bloqueo ~= nil
  c.regla = {maxUnidades = e.regla.maxUnidades, maxOro = e.regla.maxOro}
  return c
end

local function avisar()
  local e = actual
  SNF.Eventos.emitir("SNF_COMERCIO_COMPRA", e and e.fase, e and copia(e))
end

local function nuevoPaso(e)
  pasos = pasos + 1
  e.paso = pasos
end

local function cambiar(e, fase)
  e.fase = fase
  nuevoPaso(e)
  avisar()
end

local function fallar(e, motivo, texto)
  e.motivo, e.texto, e.armada, e.esperando, e.bloqueo = motivo, texto, nil, nil, nil
  cambiar(e, "error")
end

-- El botón no acepta clics durante BLOQUEO segundos (lo que pide acaba de cambiar). Después se avisa para repintarlo.
local function bloquear(e)
  local marca = {}
  e.bloqueo = marca
  C_Timer.After(BLOQUEO, function()
    ejecutar("compra", function()
      if e.bloqueo == marca then
        e.bloqueo = nil
        if actual == e then
          avisar()
        end
      end
    end)
  end)
end

local function dinero()
  return tonumber(GetMoney()) or 0
end

-- Un número dentro de [desde, hasta]; lo que no es número (o es NaN) vale `defecto`.
local function recortar(v, defecto, desde, hasta)
  v = tonumber(v)
  if not v or v ~= v then
    v = defecto
  end
  if desde and v < desde then
    v = desde
  end
  if hasta and v > hasta then
    v = hasta
  end
  return v
end

-- Un ajuste del comercio en cobre, recortado a sus LIMITES.
local function ajuste(clave)
  local limite = SNF.Ajustes.LIMITES[clave]
  return floor(recortar(SNF.Ajustes.get(clave), SNF.Ajustes.DEFECTO[clave], limite.min, limite.max))
end

-- La clave de la regla que manda para el objeto, como en la ventana: el grupo elegido o el primero que lo tiene.
-- `forzada` (la fila la trae, p. ej. un hallazgo del sniper): esa clave; false = ningún grupo (la plantilla).
local function claveRegla(item, forzada)
  if forzada ~= nil then
    return forzada or nil
  end
  local ui = rawget(SNF, "UIComercio")
  local elegido = type(ui) == "table" and type(ui.grupo) == "function" and ui.grupo() or nil
  if elegido ~= nil then
    return elegido
  end
  for _, g in ipairs(SNF.Grupos.lista()) do
    if type(g) == "table" and g.clave ~= nil and type(g.objetos) == "table" then
      for _, id in ipairs(g.objetos) do
        if id == item then
          return g.clave
        end
      end
    end
  end
  return nil
end

-- Sin regla de grupo (una fila exacta, de la vista de resultados): ni tope de unidades ni de oro. De una mercancía, el
-- máximo es lo que hay al precio de la fila o menos (B6r, punto 10); de un objeto, la cantidad de su subasta (la busca
-- subastaDeLaFila). El tope de gasto y el oro se siguen mirando (impedimento).
local function sinRegla()
  return {compraPct = 100, maxUnidades = SIN_TOPE_UNIDADES, maxOro = SIN_TOPE_ORO}
end

-- La regla con sus valores dentro de rango (Reglas.de no comprueba lo que hay guardado).
local function reglaDe(item, forzada)
  local r = SNF.Reglas.de(claveRegla(item, forzada))
  local P = SNF.Reglas.PLANTILLA
  return {
    compraPct = recortar(r.compraPct, P.compraPct, 1, 100),
    maxUnidades = floor(recortar(r.maxUnidades, P.maxUnidades, 1, 10000)),
    maxOro = recortar(r.maxOro, P.maxOro, 0, nil),
  }
end

local function vivoDe(item)
  local e = rawget(SNF, "Escaneo")
  if type(e) ~= "table" or type(e.datos) ~= "function" then
    return nil
  end
  local d = e.datos()
  return type(d) == "table" and type(d[item]) == "table" and d[item] or nil
end

-- Pausa el sniper (deja la vuelta en curso; sigue solo en cuanto la compra queda «lista»). El escaneo no hace falta
-- pausarlo: él mismo mira Compra.estado() y no pide páginas mientras la compra busca, confirma o compra.
local function pausar()
  local s = rawget(SNF, "Sniper")
  if type(s) == "table" and type(s.pausar) == "function" then
    s.pausar()
  end
end

local function ordenPorPrecio()
  local E = rawget(_G, "Enum")
  local orden = type(E) == "table" and rawget(E, "AuctionHouseSortOrder")
  local precio = type(orden) == "table" and rawget(orden, "Price") or 0
  return {{sortOrder = precio, reverseSort = false}}
end

local function esErrorDeSubasta(mensaje)
  if type(mensaje) ~= "string" or mensaje == "" then
    return false
  end
  for _, nombre in ipairs(ERRORES_SUBASTA) do
    if rawget(_G, nombre) == mensaje then
      return true
    end
  end
  return false
end

-- Lo que impide gastar `total` ahora mismo: nil, 'sin_oro' o 'tope'.
local function impedimento(total)
  if dinero() < total then
    return "sin_oro"
  end
  local tope = ajuste("comercioTope")
  if tope > 0 and gastado + total > tope then
    return "tope"
  end
  return nil
end

-- Lo gastado ha cambiado: la ventana repinta «Llevas X de Y».
local function avisarGasto()
  SNF.Eventos.emitir("SNF_COMERCIO_GASTO", gastado)
end

local function reservar(e)
  gastado = gastado + e.total
  e.reservado = e.total
  avisarGasto()
end

local function liberar(e)
  if e.reservado then
    gastado = gastado - e.reservado
    e.reservado = nil
    avisarGasto()
  end
end

local function quitarPendiente(p)
  for i = #pendientes, 1, -1 do
    if pendientes[i] == p then
      table.remove(pendientes, i)
      p.e.pendiente = nil
      return true
    end
  end
  return false
end

-- Pasados ESPERA_COMPRA s sin ver bajar su oro: con error, no se compró (se quita lo gastado); sin error, sigue
-- contando (mejor de más que de menos para el tope).
local function vencer(p)
  if quitarPendiente(p) and p.error then
    liberar(p.e)
  end
end

-- Una compra pedida al servidor: se sigue hasta ver bajar su oro.
local function pedida(e, mercancia)
  reservar(e)
  local p = {e = e, total = e.total, mercancia = mercancia}
  pendientes[#pendientes + 1] = p
  e.pendiente = p
  C_Timer.After(ESPERA_COMPRA, function()
    ejecutar("compra", vencer, p)
  end)
end

-- Si el paso actual sigue igual pasados `segundos`, el servidor no ha respondido.
local function plazo(e, segundos)
  local paso = e.paso
  C_Timer.After(segundos, function()
    ejecutar("compra", function()
      if actual ~= e or e.paso ~= paso then
        return
      end
      if e.fase == "comprando" and e.esperando == "precio" then
        C_AuctionHouse.CancelCommoditiesPurchase()
      end
      -- Una compra ya pedida sin respuesta sigue contando como gastada: mejor de más que de menos para el tope.
      fallar(e, "sin_respuesta")
    end)
  end)
end

-- El precio por unidad más alto que se acepta: el de la fila marcada (nunca más caro que lo que el jugador ve). Desde la
-- revisión B7 (menor 4) toda compra tiene precio de fila: Compra.elegir da false sin él.
local function limiteUnitario(e)
  return e.precioVisto
end

-- Fase 3 de la paridad con TSM: la compra de un hallazgo del sniper por operaciones solo sigue mientras esa operación
-- manda para el objeto y su «Precio máximo» de ahora admite el precio de la fila (SNF.Sniper.vigente). Ninguna unidad pasa
-- de ese precio (limiteUnitario), así que basta con mirarlo con él.
local function operacionVigente(e)
  if not e.sniperOp then
    return true
  end
  local S = rawget(SNF, "Sniper")
  return type(S) == "table" and type(S.vigente) == "function" and S.vigente(e.item, e.clave, limiteUnitario(e), e.sniperOp)
end

local function limiteUnidades(e)
  if e.shoppingId then
    return min(e.regla.maxUnidades, SNF.GroupShopping.limit(e.shoppingId, e.item, limiteUnitario(e)))
  end
  return e.regla.maxUnidades
end

-- ¿Pasa el total de comercioAvisoOro (el ajuste de ahora)? Entonces pide un segundo clic. Un objeto suelto pide siempre el
-- segundo clic (arreglo de la compra suelta): no hace falta el aviso.
local function caro(e)
  if e.tipo == "objeto" then
    return false
  end
  return (e.total or 0) > ajuste("comercioAvisoOro")
end

local function dejarLista(e)
  e.aviso = caro(e)
  e.armada = nil
  local motivo = impedimento(e.total) or (not operacionVigente(e) and "operacion") or nil
  if motivo then
    fallar(e, motivo)
    return
  end
  if e.sola then
    bloquear(e) -- elegida sola tras «hecho»: un clic que ya venía no la compra
  end
  cambiar(e, "lista")
end

-- Recorre los escalones de una mercancía desde el más barato y dice cuántas unidades (hasta `quiero`) y a cuánto salen,
-- sin pasar del precio límite (el de la fila: limiteUnitario), de regla.maxUnidades ni de
-- regla.maxOro. `porOro`: la parada fue por el oro.
local function recorrer(e, quiero)
  local regla = e.regla
  local limite = limiteUnitario(e)
  local units
  if e.shoppingId then units = SNF.GroupShopping.budget(e.shoppingId, e.item, limite) end
  quiero = min(quiero, regla.maxUnidades, units or regla.maxUnidades)
  local cantidad, total, porOro = 0, 0, false
  for _, f in ipairs(e.escalones) do
    if f.precio > limite or cantidad >= quiero then
      break
    end
    local n = min(quiero - cantidad, f.n)
    local caben = floor((regla.maxOro - total) / f.precio)
    if caben < n then
      n, porOro = caben, true
    end
    if n > 0 then
      cantidad, total = cantidad + n, total + n * f.precio
    end
    if porOro then
      break
    end
  end
  return cantidad, total, porOro
end

-- Los escalones de una mercancía con la lista de ahora del cliente (la respuesta de la última búsqueda de ese objeto: la
-- de la compra o una más nueva, p. ej. la de SNF.Busqueda), de menor a mayor precio, sin las subastas propias. F12: los
-- escalones acaban antes de la fila más barata por la que no se debe pasar. Deja en e: escalones; corte y porCorte (ese
-- precio y su motivo); propiaMin (el precio más barato con unidades propias, sabidas o no); puedeSerCuenta (hay, a cualquier
-- precio, una fila con unidades de otro personaje o que no se sabe de quién es; una ya vacía no cuenta).
local function leerEscalones(e)
  local A = C_AuctionHouse
  local filas, corte, porCorte, propiaMin, puedeSerCuenta = {}, nil, nil, nil, false
  for i = 1, tonumber(A.GetNumCommoditySearchResults(e.item)) or 0 do
    local r = A.GetCommoditySearchResultInfo(e.item, i)
    if type(r) == "table" and type(r.unitPrice) == "number" and r.unitPrice > 0 then
      local p, d = r.unitPrice, SNF.Comercio.duenoMercancia(r)
      local n, motivo = d.comprables, nil
      if n == nil or (d.propias or 0) > 0 then
        propiaMin = min(propiaMin or p, p)
      end
      if n == nil or (d.cuenta and n > 0) then
        puedeSerCuenta = true
      end
      if n == nil then
        motivo = "propias_desconocidas"
      elseif n > 0 and ((e.shoppingId and (d.cuenta or (d.propias or 0) > 0))
        or (d.cuenta and not (e.exacta and p == e.precioVisto))) then
        motivo = "otro_personaje"
      end
      if motivo then
        if not corte or p < corte then
          corte, porCorte = p, motivo
        end
      elseif n > 0 then -- las propias no se pueden comprar
        filas[#filas + 1] = {precio = p, n = n}
      end
    end
  end
  table.sort(filas, function(a, b) return a.precio < b.precio end)
  if corte then
    for i = #filas, 1, -1 do
      if filas[i].precio >= corte then
        table.remove(filas, i)
      end
    end
  end
  local acumulado = 0
  for _, f in ipairs(filas) do
    acumulado = acumulado + f.n
    f.acumulado = acumulado
  end
  e.escalones, e.corte, e.porCorte, e.propiaMin, e.puedeSerCuenta = filas, corte, porCorte, propiaMin, puedeSerCuenta
  return filas
end

-- F12: el motivo si la compra se queda corta por una fila que no se debe pasar (a su tope o por debajo), o nil.
local function motivoCorte(e)
  return e.corte ~= nil and e.corte <= limiteUnitario(e) and e.porCorte or nil
end

-- Fila exacta de una mercancía (B6r, ronda 1): el precio de la fila es el tope de CADA unidad, no de la media. El juego
-- solo da totales, así que se mira con la lista de ahora: se rellena de la más barata hacia arriba sin pasar del precio
-- de la fila. Devuelve si caben las e.cantidad unidades, lo que cuestan así y cuántas hay a ese precio o menos.
local function cabenEnLista(e)
  leerEscalones(e)
  local cantidad, total = recorrer(e, e.cantidad)
  local quedan = recorrer(e, e.regla.maxUnidades)
  return cantidad >= e.cantidad, total, quedan
end

local function shoppingQuoteMatches(e)
  local full = C_AuctionHouse.HasFullCommoditySearchResults
  if type(full) ~= "function" or not full(e.item) then return false end
  local fits, total = cabenEnLista(e)
  return fits and total == e.total
    and SNF.GroupShopping.quoteWithinCap(e.shoppingId, e.item, e.cantidad, total, limiteUnitario(e))
end

-- No caben todas a ese precio: no se ofrece nada. Sin ninguna, «cambió de precio»; si quedan M, la compra vuelve a
-- «lista» con esas M (Compra.maxCantidad baja a M) y e.pedidas / e.quedan para decir «Ya no hay N a ese precio: quedan M».
local function quedanMenos(e, quedan)
  if quedan <= 0 then
    fallar(e, motivoCorte(e) or "cambio_precio")
    return
  end
  local pedidas = e.cantidad
  local cantidad, total = recorrer(e, quedan)
  e.cantidad, e.total, e.precioUnit = cantidad, total, ceil(total / cantidad)
  e.pedidas, e.quedan = pedidas, cantidad
  e.aviso, e.armada, e.subio, e.totalAntes, e.esperando = caro(e), nil, nil, nil, nil
  bloquear(e) -- lo que pide el botón cambia: un clic que ya venía no compra
  cambiar(e, "lista")
end

local function prepararMercancia(e)
  local filas = leerEscalones(e)
  e.tipo = "mercancia"
  -- Empieza en 1 unidad (el jugador elige cuántas con Compra.ponerCantidad); con una fila exacta, en las suyas.
  local quiero = e.exacta and e.cantidadVista or 1
  local cantidad, total, porOro = recorrer(e, quiero)
  if cantidad <= 0 or (e.exacta and cantidad < quiero) then
    if porOro then
      fallar(e, "regla")
    elseif motivoCorte(e) then
      fallar(e, motivoCorte(e)) -- F12: lo que falta está detrás de una fila que no se debe pasar
    else
      -- Con fila marcada: sin nada a la venta ya no está; con algo, pero no a su precio (o no todas), cambió de precio.
      fallar(e, #filas == 0 and "ya_no_esta" or "cambio_precio")
    end
    return
  end
  e.cantidad, e.total, e.precioUnit = cantidad, total, ceil(total / cantidad)
  dejarLista(e)
end

-- ¿Es este el precio por unidad de la fila? (la fila lo enseña redondeado: vale el de arriba o el de abajo)
local function mismoPrecio(unidad, precio)
  return floor(unidad) <= precio and precio <= ceil(unidad)
end

-- La subasta que se compra: EXACTAMENTE la de la fila marcada, nunca otra aunque sea más barata.
--   con auctionID (la vista de resultados): esa; si no está, 'ya_no_esta'; si su total o su cantidad no son los de la
--     fila, 'cambio_precio'.
--   con el precio de la fila (la lista, el sniper): la que tiene ese precio por unidad (y, con fila exacta, esa
--     cantidad); si no hay ninguna, 'ya_no_esta' sin subastas o 'cambio_precio' si solo las hay con otro precio.
-- (Sin precio de fila no hay compra: Compra.elegir da false; revisión B7, menor 4.)
-- Devuelve la candidata o nil y el motivo.
local function subastaDeLaFila(e, candidatas)
  if e.subastaVista then
    for _, c in ipairs(candidatas) do
      if c.id == e.subastaVista then
        if (e.totalVisto and c.total ~= e.totalVisto) or (e.cantidadVista and c.n ~= e.cantidadVista) then
          return nil, "cambio_precio"
        end
        -- Arreglo de la compra suelta: lo que se paga nunca pasa del precio por unidad de la fila × lo que se compra.
        if c.total > e.precioVisto * c.n then
          return nil, "cambio_precio"
        end
        return c
      end
    end
    for _, a in ipairs(candidatas.apartadas) do
      if a.id == e.subastaVista then
        return nil, a.motivo
      end
    end
    return nil, "ya_no_esta"
  end
  for _, c in ipairs(candidatas) do
    if mismoPrecio(c.unidad, e.precioVisto) and (not e.exacta or c.n == e.cantidadVista) then
      return c
    end
  end
  -- F12: a ese precio solo hay una apartada: se dice por qué, no «cambió de precio».
  for _, a in ipairs(candidatas.apartadas) do
    if a.unidad and mismoPrecio(a.unidad, e.precioVisto) then
      return nil, a.motivo
    end
  end
  -- Una apartada a OTRO precio no es la de esta fila: la de la fila ya no está.
  return nil, #candidatas == 0 and "ya_no_esta" or "cambio_precio"
end

-- Las subastas de objeto que se pueden comprar ya, de la lista de ahora, de menor a mayor precio por unidad. F12: las tuyas
-- no; las de otro personaje de la cuenta, solo la que el jugador ha marcado (lo decide el juego). candidatas.apartadas =
-- {{id, unidad?, motivo}}: las que no se ofrecen y por qué (no se sabe si son tuyas, u otro personaje).
local function candidatasObjeto(e)
  local A = C_AuctionHouse
  local candidatas = {apartadas = {}}
  for i = 1, tonumber(A.GetNumItemSearchResults(e.clave)) or 0 do
    local r = A.GetItemSearchResultInfo(e.clave, i)
    local d = type(r) == "table" and type(r.auctionID) == "number" and SNF.Comercio.duenoObjeto(r) or nil
    local motivo = d and ((d.comprables == nil and "propias_desconocidas")
      or (d.cuenta and (e.shoppingId or r.auctionID ~= e.subastaVista) and "otro_personaje")) or nil
    if motivo then
      local apartadas = candidatas.apartadas
      apartadas[#apartadas + 1] = {id = r.auctionID, motivo = motivo,
        unidad = type(r.buyoutAmount) == "number" and r.buyoutAmount or nil}
    elseif d and type(r.buyoutAmount) == "number" and r.buyoutAmount > 0 and d.comprables == 1 then
      -- Arreglo de la compra suelta: en WoW Forever la fila agrupa `quantity` subastas iguales de 1 unidad y buyoutAmount
      -- es lo que cuesta UNA (lo que cobra PlaceBid). Una compra es siempre 1 unidad por buyoutAmount (antes se dividía
      -- entre quantity: 5s 97c a la vista y 3g 99s 89c pagados).
      candidatas[#candidatas + 1] = {
        id = r.auctionID, total = r.buyoutAmount, n = 1, unidad = r.buyoutAmount, tiempo = tonumber(r.timeLeftSeconds),
      }
    end
  end
  table.sort(candidatas, function(a, b)
    if a.unidad ~= b.unidad then
      return a.unidad < b.unidad
    end
    return a.total < b.total
  end)
  return candidatas
end

local function prepararObjeto(e)
  local candidatas = candidatasObjeto(e)
  -- Una fila por subasta, de menor a mayor precio por unidad (la tabla de escalones de la ventana).
  local escalones, acumulado = {}, 0
  for _, c in ipairs(candidatas) do
    acumulado = acumulado + c.n
    escalones[#escalones + 1] = {precio = ceil(c.unidad), n = c.n, acumulado = acumulado, tiempo = c.tiempo}
  end
  e.escalones = escalones
  e.tipo = "objeto"
  local mejor, motivo = subastaDeLaFila(e, candidatas)
  if mejor and (mejor.n > e.regla.maxUnidades or mejor.total > e.regla.maxOro) then
    mejor, motivo = nil, "regla" -- la regla del grupo puede frenar, nunca ampliar
  end
  if not mejor then
    fallar(e, motivo)
    return
  end
  e.subasta, e.cantidad, e.total, e.precioUnit = mejor.id, mejor.n, mejor.total, ceil(mejor.unidad)
  dejarLista(e)
end

-- Manda la búsqueda; con el sistema de mensajes ocupado (otro addon o el escaneo) espera a que se libere. Las dos
-- esperas tienen plazo: si no llega nada, «error» sin_respuesta.
local function buscar(e)
  local A = C_AuctionHouse
  if not SNF.Comercio.ventanaVisible() then
    Compra.ceder() -- F13: p. ej. el sistema se libera con la ventana ya escondida
    return
  end
  nuevoPaso(e) -- el plazo de una espera anterior ya no vale
  if not A.IsThrottledMessageSystemReady() then
    e.esperando = "sistema"
    plazo(e, ESPERA_BUSQUEDA)
    return
  end
  e.esperando = nil
  e.clave = e.clave or A.MakeItemKey(e.item)
  A.SendSearchQuery(e.clave, ordenPorPrecio(), true)
  plazo(e, ESPERA_BUSQUEDA)
end

-- La siguiente fila buena de la ventana que no sea el objeto que se acaba de comprar.
local function siguiente(comprado)
  local ui = rawget(SNF, "UIComercio")
  if type(ui) ~= "table" or type(ui.fila) ~= "function" then
    return nil
  end
  local i = 1
  local f = ui.fila(i)
  while f do
    if f.buena and f.item ~= comprado then
      return f
    end
    i = i + 1
    f = ui.fila(i)
  end
  return nil
end

local function terminar(e)
  e.esperando, e.reservado, e.bloqueo = nil, nil, nil -- lo reservado ya es gasto
  cambiar(e, "hecho")
  local comprado = {item = e.item, cantidad = e.cantidad, total = e.total}
  -- Solo una compra elegida en la lista elige sola otra fila de la lista: la del sniper (el sniper sigue solo) y la de
  -- la vista de resultados (origen 'resultados': la lista no es la suya) no. Tampoco si el jugador ha quitado
  -- comercioSiguienteSola (casilla del engranaje de la barra): entonces se queda en «hecho».
  local sola = SNF.Ajustes.get("comercioSiguienteSola") == true
  local fila = sola and e.origen == nil and siguiente(e.item) or nil
  if fila and Compra.elegir(fila, nil, true) and actual then
    actual.ultima = comprado
  end
end

-- Se ha visto bajar el oro de una compra pendiente.
local function cobrada(p)
  local e = p.e
  e.reservado = nil -- ya es gasto
  if e.completada then
    return -- el juego ya la dio por hecha (AUCTION_HOUSE_PURCHASE_COMPLETED) y ya se dijo
  end
  if p.mercancia or p.error == "claro" then
    return -- la mercancía la acaban SUCCEEDED/FAILED; tras un error claro solo cuenta para el tope
  end
  if actual == e and (e.fase == "comprando" or e.fase == "error") then
    terminar(e)
  else
    local c = copia(e)
    c.fase = "hecho"
    SNF.Eventos.emitir("SNF_COMERCIO_COMPRA", "hecho", c)
  end
end

---------------------------------------------------------------------------------------------------
-- Eventos (solo mientras hay algo elegido o pendiente)
---------------------------------------------------------------------------------------------------

-- ¿Es la itemKey k la de la compra (pedida)? Campo a campo, como SNF.Busqueda (revisión B7, menor 3): un campo pedido a 0
-- (un id suelto, sin nivel) vale cualquiera; el servidor responde con la clave del equipo, con su nivel y su sufijo, y esa
-- pasa a ser la pedida. Otra variante del mismo objeto (otro nivel u otro sufijo) no es la nuestra.
local function mismaClave(pedida, k)
  if type(k) ~= "table" or type(pedida) ~= "table" or k.itemID ~= pedida.itemID then
    return false
  end
  for _, campo in ipairs({"itemLevel", "itemSuffix", "battlePetSpeciesID"}) do
    local p = pedida[campo] or 0
    if p ~= 0 and (k[campo] or 0) ~= p then
      return false
    end
  end
  return true
end

local function enCompra(tipo, esperando)
  local e = actual
  if e and e.fase == "comprando" and e.tipo == tipo and e.esperando == esperando then
    return e
  end
  return nil
end

-- Un error de la compra en curso. `claro`: es de la subasta seguro (si no, puede ser de otra cosa).
local function errorDeCompra(claro, texto)
  local e = enCompra("objeto", "compra")
  if e then
    if e.pendiente then
      e.pendiente.error = claro and "claro" or "dudoso"
    end
    local noEsta = texto ~= nil and texto == rawget(_G, "ERR_ITEM_NOT_FOUND")
    fallar(e, noEsta and "ya_no_esta" or "fallo", texto)
    return
  end
  if not claro then
    return -- un error rojo de otra cosa no corta una mercancía (si nadie responde, vence su plazo)
  end
  e = enCompra("mercancia", "precio")
  if e then
    C_AuctionHouse.CancelCommoditiesPurchase()
    fallar(e, "fallo", texto)
    return
  end
  e = enCompra("mercancia", "compra")
  if e then
    if e.pendiente then
      e.pendiente.error = "claro" -- se quita lo gastado si en ESPERA_COMPRA s no baja el oro
    end
    fallar(e, "fallo", texto)
  end
end

-- Arreglo de la compra suelta: la compra de objeto ya pedida al juego de esa subasta (la elegida o una pendiente), o nil.
local function compraDeSubasta(id)
  local e = actual
  if e and e.tipo == "objeto" and e.pidio and e.subasta == id then
    return e
  end
  for _, p in ipairs(pendientes) do
    if not p.mercancia and p.e.pidio and p.e.subasta == id then
      return p.e
    end
  end
  return nil
end

local MANEJADORES = {
  -- Arreglo de la compra suelta: AUCTION_HOUSE_PURCHASE_COMPLETED(auctionID) es como el juego da por hecha la compra de
  -- esa subasta de objeto (la compra ya de Blizzard_AuctionHouseFrame espera este evento). Manda sobre un error de la
  -- subasta llegado antes: AUCTION_HOUSE_SHOW_ERROR no dice de qué subasta es, y en el juego llegó uno con la compra hecha
  -- (la barra decía «La compra no se ha hecho.» y el oro se había ido). La barra dice lo comprado y su precio de verdad.
  AUCTION_HOUSE_PURCHASE_COMPLETED = function(auctionID)
    local e = compraDeSubasta(tonumber(auctionID))
    if not e or e.completada then
      return
    end
    if e.pendiente then
      e.pendiente.error = nil -- no hubo error: la bajada de oro es de esta compra
    end
    if actual == e and (e.fase == "comprando" or e.fase == "error") then
      e.motivo, e.texto, e.completada = nil, nil, true
      terminar(e)
    elseif actual == e and e.fase == "hecho" then
      e.completada = true -- ya se vio bajar su oro y ya se dijo
    else
      e.completada = true
      e.reservado = nil
      local c = copia(e)
      c.fase = "hecho"
      SNF.Eventos.emitir("SNF_COMERCIO_COMPRA", "hecho", c)
    end
  end,
  AUCTION_HOUSE_THROTTLED_SYSTEM_READY = function()
    local e = actual
    if e and e.fase == "buscando" and e.esperando == "sistema" then
      buscar(e)
      avisar()
    end
  end,
  -- Con una fila exacta «lista» (B6r, ronda 1), una lista nueva del mismo objeto (p. ej. el jugador pone al día la fila)
  -- pone al día el total, o lo que queda a ese precio; si su subasta de objeto ya no está o cambió, la compra se suelta
  -- con su motivo. Así el botón y la barra dicen siempre lo que se ve.
  COMMODITY_SEARCH_RESULTS_UPDATED = function(itemID)
    local e = actual
    if not e or itemID ~= e.item then
      return
    end
    if e.fase == "buscando" and not e.esperando then
      prepararMercancia(e)
    elseif e.fase == "lista" and e.exacta and e.tipo == "mercancia" then
      -- Ronda 2: solo con la lista entera se decide (una lista a medias puede traer menos unidades de las que hay).
      local entera = C_AuctionHouse.HasFullCommoditySearchResults
      if entera and not entera(itemID) then
        return
      end
      local todas, total, quedan = cabenEnLista(e)
      if not todas then
        quedanMenos(e, quedan)
      elseif total ~= e.total or e.quedan then
        -- Caben todas: el total de ahora y, si lo había, «quedan M» se va (la barra vuelve a decir el importe).
        e.total, e.precioUnit = total, ceil(total / e.cantidad)
        e.pedidas, e.quedan = nil, nil
        e.aviso = caro(e)
        avisar()
      end
    end
  end,
  ITEM_SEARCH_RESULTS_UPDATED = function(clave)
    local e = actual
    if not e or type(clave) ~= "table" or clave.itemID ~= e.item or not mismaClave(e.clave or {itemID = e.item}, clave) then
      return
    end
    if e.fase == "buscando" and not e.esperando then
      e.clave = clave -- la del servidor: con el equipo lleva nivel y sufijo
      prepararObjeto(e)
    elseif (e.fase == "lista" or e.fase == "confirmar") and e.exacta and e.tipo == "objeto" then
      -- Ronda 2: solo con la lista entera se decide que su subasta ya no está (la primera página puede no traerla).
      local entera = C_AuctionHouse.HasFullItemSearchResults
      if entera and not entera(clave) then
        return
      end
      e.clave = clave
      local _, motivo = subastaDeLaFila(e, candidatasObjeto(e))
      if motivo then
        fallar(e, motivo)
      end
    end
  end,
  COMMODITY_PRICE_UPDATED = function(unidad, total)
    local e = enCompra("mercancia", "precio")
    if not e and actual and actual.fase == "confirmar" and actual.tipo == "mercancia" then
      e = actual -- el precio cambia otra vez antes del clic: se enseña el nuevo
    end
    total = tonumber(total)
    if not e or not total then
      return
    end
    -- Revisión B7, menor 1: solo vale la cotización de la cantidad pedida. Una que no cuadra con unidad × cantidad (con 1c
    -- de redondeo por unidad: el juego da la unidad redondeada) es de otra cantidad (un aviso de precio suelto): se tira y
    -- se sigue esperando la buena (o vence el plazo). Así el botón nunca enseña el importe de otra cantidad.
    local porUnidad = tonumber(unidad)
    if porUnidad and math.abs(total - porUnidad * e.cantidad) > e.cantidad then
      return
    end
    -- Con fila marcada (resultados, lista vieja y sniper; B6r, rondas 1 y 2): antes de ofrecer ningún clic, las unidades
    -- pedidas tienen que caber todas a su precio o menos con la lista de ahora; si no, no se ofrece nada. Si caben pero el
    -- juego cotiza más de lo que cuestan con esa lista, venderá unidades que la lista no enseña (la lista es la foto de la
    -- última búsqueda y ya es vieja): «cambió de precio». En el juego esto último es lo normal y «quedan M» solo sale si
    -- la lista se puso al día entre el clic y la cotización.
    -- F12: con unidades propias (sabidas o no) al tope o por debajo, la cotización tiene que ser igual a la lista: una más
    -- baja querría decir que el servidor vende lo tuyo. También con una fila de otro personaje o sin dueño sabido, a
    -- cualquier precio: si la lista es vieja, una cotización más baja puede llevar unidades suyas por encima del tope.
    -- Sin propias en medio, lo que no se puede ver: un total MÁS BAJO que el de la lista también puede llevar unidades
    -- más caras que la fila. Por
    -- ejemplo, la lista tiene 100 a 10c y 100 a 31c, y en el servidor entraron 150 a 5c mientras se vendían las demás y
    -- quedan 50 a 40c: el total baja, pero 50 pasan de 31c. El juego solo da el total, así que no hay forma de saberlo sin
    -- otra búsqueda. Es muy raro y en total se paga menos de lo enseñado.
    if e.precioVisto then
      local todas, totalLista, quedan = cabenEnLista(e)
      local debeSerIgual = e.shoppingId or e.puedeSerCuenta or (e.propiaMin ~= nil and e.propiaMin <= limiteUnitario(e))
      if not todas or total > totalLista or (debeSerIgual and total ~= totalLista) then
        C_AuctionHouse.CancelCommoditiesPurchase()
        if not todas then
          quedanMenos(e, quedan)
        else
          fallar(e, "cambio_precio")
        end
        return
      end
    end
    -- Nunca más caro que la fila: si lo que cotiza el servidor pasa de su precio por unidad × la cantidad, no se compra.
    if e.precioVisto and total > e.precioVisto * e.cantidad then
      C_AuctionHouse.CancelCommoditiesPurchase()
      fallar(e, "cambio_precio")
      return
    end
    if e.shoppingId and not SNF.GroupShopping.quoteWithinCap(e.shoppingId, e.item, e.cantidad, total, limiteUnitario(e)) then
      C_AuctionHouse.CancelCommoditiesPurchase()
      fallar(e, "regla")
      return
    end
    if not operacionVigente(e) then
      C_AuctionHouse.CancelCommoditiesPurchase()
      fallar(e, "operacion")
      return
    end
    if e.fase ~= "confirmar" then
      e.totalAntes = e.total -- lo que se enseñaba al pulsar Comprar
    end
    e.subio = total > e.totalAntes
    e.total = total
    e.precioUnit = tonumber(unidad) or ceil(total / e.cantidad)
    e.esperando = nil
    e.aviso = caro(e)
    local motivo = impedimento(total) or (total > e.regla.maxOro and "regla") or nil
    if motivo then
      C_AuctionHouse.CancelCommoditiesPurchase()
      fallar(e, motivo)
      return
    end
    bloquear(e) -- el total nuevo se ve antes de poder confirmarlo
    cambiar(e, "confirmar")
    -- Sin confirmar en ESPERA_CONFIRMAR s, se cancela: así el escaneo y el sniper no esperan sin límite. Un precio nuevo
    -- (otro COMMODITY_PRICE_UPDATED) abre otro paso y vuelve a contar desde cero.
    local paso = e.paso
    C_Timer.After(ESPERA_CONFIRMAR, function()
      ejecutar("compra", function()
        if actual == e and e.paso == paso and e.fase == "confirmar" then
          C_AuctionHouse.CancelCommoditiesPurchase()
          fallar(e, "sin_confirmar")
        end
      end)
    end)
  end,
  COMMODITY_PRICE_UNAVAILABLE = function()
    local e = enCompra("mercancia", "precio")
    if e then
      fallar(e, "sin_unidades")
    end
  end,
  COMMODITY_PURCHASE_SUCCEEDED = function()
    local e = enCompra("mercancia", "compra")
    if e then
      terminar(e) -- su bajada de oro sigue en `pendientes` para no achacarla a otra compra
    end
  end,
  COMMODITY_PURCHASE_FAILED = function()
    local e = enCompra("mercancia", "compra")
    if e then
      if e.pendiente then
        quitarPendiente(e.pendiente)
      end
      liberar(e)
      fallar(e, "fallo")
    end
  end,
  -- Cuánto ha bajado el oro, repartido entre las compras pendientes: primero las que no tienen error, después las de
  -- error dudoso y al final las de error claro.
  PLAYER_MONEY = function()
    local ahora = dinero()
    local baja = (ultimoDinero or ahora) - ahora
    ultimoDinero = ahora
    if baja <= 0 then
      return
    end
    for _, clase in ipairs({"ninguno", "dudoso", "claro"}) do
      local i = 1
      while i <= #pendientes do
        local p = pendientes[i]
        if (p.error or "ninguno") == clase and baja >= p.total then
          baja = baja - p.total
          table.remove(pendientes, i)
          p.e.pendiente = nil
          cobrada(p)
        else
          i = i + 1
        end
      end
    end
  end,
  UI_ERROR_MESSAGE = function(_, mensaje)
    errorDeCompra(esErrorDeSubasta(mensaje), type(mensaje) == "string" and mensaje ~= "" and mensaje or nil)
  end,
  -- Empieza el combate: una mercancía a medio confirmar (o pidiendo su precio) se cancela («error» combate) y una compra
  -- cara armada se desarma. Al salir de combate no se vuelve a armar nada solo.
  PLAYER_REGEN_DISABLED = function()
    local e = actual
    if not e then
      return
    end
    if e.fase == "confirmar" and e.tipo == "objeto" then
      fallar(e, "combate") -- un objeto por confirmar: aún no se ha pedido nada al juego
    elseif e.fase == "confirmar" or (e.fase == "comprando" and e.esperando == "precio") then
      C_AuctionHouse.CancelCommoditiesPurchase()
      fallar(e, "combate")
    elseif e.armada then
      e.armada = nil
      avisar()
    end
  end,
  -- AUCTION_HOUSE_SHOW_ERROR(error): un error de la subasta, claro. Si el cliente no lo conoce, Eventos no lo registra.
  AUCTION_HOUSE_SHOW_ERROR = function()
    errorDeCompra(true, nil)
  end,
}

local oyentes = {}
for evento, fn in pairs(MANEJADORES) do
  oyentes[evento] = function(...)
    ejecutar("compra", fn, ...)
  end
end

local function escuchar(si)
  if si == escuchando then
    return
  end
  for evento, fn in pairs(oyentes) do
    if si then
      SNF.Eventos.escuchar(evento, fn)
    else
      SNF.Eventos.dejar(evento, fn)
    end
  end
  escuchando = si
  ultimoDinero = si and dinero() or nil
end

---------------------------------------------------------------------------------------------------
-- Interfaz
---------------------------------------------------------------------------------------------------

-- `sola` (solo desde terminar): la fila la ha elegido el addon tras «hecho», no el jugador.
function Compra.elegir(item, vivo, sola)
  if not SNF.Comercio.activo() or not SNF.Comercio.ventanaVisible() then
    return false
  end
  if type(item) == "table" then
    item, vivo = item.item, item
  end
  item = tonumber(item)
  if not item then
    return false
  end
  if type(vivo) ~= "table" then
    vivo = vivoDe(item) or {}
  end
  local visto = tonumber(vivo.precio)
  if not visto or visto <= 0 then
    return false -- revisión B7, menor 4: sin precio de fila no hay tope por unidad, así que no hay compra (nada cambia)
  end
  local shoppingId, maxUnits
  if vivo.origen == "group-shopping" then
    shoppingId, maxUnits = vivo.shoppingId, tonumber(vivo.maxUnits)
    if not shoppingId or not maxUnits or maxUnits < 1 or maxUnits ~= floor(maxUnits)
      or not SNF.GroupShopping.allow(shoppingId, item, maxUnits, visto) then return false end
  end
  local sniperOp
  if vivo.origen == "sniper" and type(vivo.sniperOp) == "table" then
    sniperOp = {operacion = vivo.sniperOp.operacion, ruta = vivo.sniperOp.ruta}
    local S = rawget(SNF, "Sniper")
    if type(S) ~= "table" or type(S.vigente) ~= "function"
      or not S.vigente(item, vivo.itemKey, visto, sniperOp) then return false end
  end
  local previa = actual
  if previa and previa.fase == "comprando" and previa.esperando == "compra" then
    return false -- una compra pedida al servidor: hasta que responda no se elige otra
  end
  if previa and previa.tipo ~= "objeto"
    and (previa.fase == "confirmar" or (previa.fase == "comprando" and previa.esperando == "precio")) then
    C_AuctionHouse.CancelCommoditiesPurchase()
  end
  pausar()
  local exacta = vivo.exacta == true and tonumber(vivo.cantidad) and tonumber(vivo.cantidad) >= 1
  local e = {
    item = item,
    precioVisto = visto,
    clave = type(vivo.itemKey) == "table" and vivo.itemKey or nil,
    regla = exacta and sinRegla() or reglaDe(item, vivo.grupo),
    origen = vivo.origen,
    shoppingId = shoppingId,
    sniperOp = sniperOp,
    fase = "buscando",
    sola = sola == true,
    exacta = exacta or nil,
    cantidadVista = exacta and floor(tonumber(vivo.cantidad)) or nil,
    subastaVista = tonumber(vivo.auctionID),
    totalVisto = tonumber(vivo.total),
  }
  if maxUnits then e.regla.maxUnidades = min(e.regla.maxUnidades, maxUnits) end
  actual = e
  escuchar(true)
  buscar(e)
  avisar()
  return true
end

function Compra.estado()
  return actual and copia(actual) or nil
end

-- Los escalones de la compra elegida, de menor a mayor precio por unidad y sin las subastas propias:
-- {{precio, n, acumulado, tiempo}} (acumulado = unidades hasta ese escalón, incluido; tiempo = timeLeftSeconds de un objeto
-- suelto, nil en una mercancía). {} sin nada elegido o mientras busca. Es una copia: tocarla no cambia la compra.
function Compra.escalones()
  local e = actual
  local lista = {}
  if e and e.fase ~= "buscando" and e.escalones then
    for i, f in ipairs(e.escalones) do
      lista[i] = {precio = f.precio, n = f.n, acumulado = f.acumulado, tiempo = f.tiempo}
    end
  end
  return lista
end

-- Lo más que deja comprar: de una mercancía, las unidades hasta el precio límite (el de la fila) que quepan en
-- regla.maxUnidades y regla.maxOro; de un objeto suelto, las de su subasta. 0 sin nada preparado.
function Compra.maxCantidad()
  local e = actual
  if not e or e.fase == "buscando" or not e.escalones then
    return 0
  end
  if e.tipo == "mercancia" then
    return (recorrer(e, e.regla.maxUnidades))
  end
  return min(e.cantidad or 0, limiteUnidades(e))
end

-- Pone la cantidad de una mercancía «lista» o por «confirmar» (recortada a 1..maxCantidad) y recalcula el total con los
-- escalones. En «confirmar» cancela primero la compra a medias: vuelve a «lista» y hace falta otro clic para pedir el
-- precio de la cantidad nueva. Da false, sin cambiar nada, con algo que no sea un entero ≥ 1 o fuera de ese caso.
function Compra.ponerCantidad(n)
  local e = actual
  if type(n) ~= "number" or n ~= n or n < 1 or n ~= floor(n) then
    return false
  end
  if not e or e.tipo ~= "mercancia" or (e.fase ~= "lista" and e.fase ~= "confirmar") or not SNF.Comercio.activo() then
    return false
  end
  local cantidad, total = recorrer(e, min(n, 10000))
  if cantidad <= 0 then
    return false
  end
  local cambia = cantidad ~= e.cantidad or e.fase == "confirmar"
  local enConfirmar = e.fase == "confirmar"
  e.pedidas, e.quedan = nil, nil -- el jugador ya ha elegido otra cantidad: «quedan M» ya no hace falta
  if enConfirmar then
    C_AuctionHouse.CancelCommoditiesPurchase()
  end
  e.cantidad, e.total, e.precioUnit = cantidad, total, ceil(total / cantidad)
  e.aviso, e.armada, e.subio, e.totalAntes, e.esperando = caro(e), nil, nil, nil, nil
  if cambia then
    bloquear(e) -- el botón cambia de texto: un clic que ya venía no compra otra cantidad
  end
  if enConfirmar then
    cambiar(e, "lista")
  else
    avisar()
  end
  return true
end

-- Arreglo de la compra suelta: el primer clic de un objeto suelto «lista» lo pasa a «confirmar» sin llamar al juego. El
-- botón cambia de texto por el clic del jugador y no acepta clics BLOQUEO s (el segundo clic de un doble clic no
-- confirma). Sin confirmar en ESPERA_CONFIRMAR s se suelta («error» sin_confirmar): el escaneo y el sniper no esperan sin
-- límite.
pedirConfirmar = function(e)
  e.armada, e.subio, e.totalAntes, e.esperando = nil, nil, nil, nil
  bloquear(e)
  cambiar(e, "confirmar")
  local paso = e.paso
  C_Timer.After(ESPERA_CONFIRMAR, function()
    ejecutar("compra", function()
      if actual == e and e.paso == paso and e.fase == "confirmar" then
        fallar(e, "sin_confirmar")
      end
    end)
  end)
end

-- Arreglo de la compra suelta: lo que de verdad cuesta ahora la subasta e.subasta en lo último que dio el juego (su
-- buyoutAmount, por su auctionID), o nil si ya no está en esa lista (o es tuya; F12: o ya no se sabe si lo es, y entonces
-- el segundo valor es ese motivo).
local function precioReal(e)
  local A = C_AuctionHouse
  for i = 1, tonumber(A.GetNumItemSearchResults(e.clave)) or 0 do
    local r = A.GetItemSearchResultInfo(e.clave, i)
    if type(r) == "table" and r.auctionID == e.subasta then
      local d = SNF.Comercio.duenoObjeto(r)
      if d.comprables == nil then
        return nil, "propias_desconocidas"
      elseif d.cuenta and (e.shoppingId or e.subasta ~= e.subastaVista) then
        return nil, "otro_personaje"
      elseif d.comprables == 1 then
        local compra = tonumber(r.buyoutAmount)
        return (compra and compra > 0) and compra or nil
      end
    end
  end
  return nil
end

-- Arreglo de la compra suelta, la red: antes del segundo clic de un objeto suelto se lee lo que de verdad se va a pagar por
-- ESA subasta (precioReal); eso es lo que Compra.pulsar manda a PlaceBid. Si ya no está, «ya no está»; si pasa del total
-- que el jugador ha visto y confirmado en el botón o del precio por unidad de la fila × 1 (una compra de objeto es siempre
-- 1 unidad), «cambió de precio» y no se compra. Antes la red comparaba el total y la cantidad de la subasta con los de la
-- fila, que salían del mismo dato mal leído (quantity), y no saltaba. Devuelve el precio que se manda, o nil (ya ha
-- fallado con su motivo).
revisarObjeto = function(e)
  local real, porQue = precioReal(e)
  if not real then
    fallar(e, porQue or "ya_no_esta")
    return nil
  end
  if real > e.total or real > limiteUnitario(e) * e.cantidad or e.cantidad ~= 1 then
    fallar(e, "cambio_precio")
    return nil
  end
  local motivo = impedimento(real) or (real > e.regla.maxOro and "regla") or nil
  if motivo then
    fallar(e, motivo)
    return nil
  end
  return real
end

-- Las funciones de compra del cliente solo se llaman aquí, y esto solo lo llama el OnClick del botón Comprar. Cada
-- rama hace una sola llamada: una compra (o un paso de una compra) por clic.
function Compra.pulsar()
  if Compra.combate() then
    return false -- en combate no se compra ni se confirma, venga el clic de donde venga
  end
  local e = actual
  if not e or not SNF.Comercio.activo() or e.bloqueo or not SNF.Comercio.ventanaVisible() then
    return false
  end
  local A = C_AuctionHouse
  if e.shoppingId and (e.fase == "lista" or e.fase == "confirmar")
    and not SNF.GroupShopping.allow(e.shoppingId, e.item, e.cantidad, limiteUnitario(e)) then
    if e.fase == "confirmar" and e.tipo == "mercancia" then A.CancelCommoditiesPurchase() end
    fallar(e, "regla")
    return false
  end
  if (e.fase == "lista" or e.fase == "confirmar") and not operacionVigente(e) then
    if e.fase == "confirmar" and e.tipo == "mercancia" then A.CancelCommoditiesPurchase() end
    fallar(e, "operacion")
    return false
  end
  if e.fase == "lista" then
    e.pedidas, e.quedan = nil, nil
    local motivo = impedimento(e.total)
    if motivo then
      fallar(e, motivo)
      return false
    end
    if e.tipo == "objeto" then
      -- Arreglo de la compra suelta: el primer clic nunca compra un objeto suelto; solo pide confirmar (el botón pasa a
      -- «Confirmar 1 por X», con el mismo total) y el segundo clic compra. No llama a nada del juego.
      pedirConfirmar(e)
      return false
    end
    if e.shoppingId and not shoppingQuoteMatches(e) then
      fallar(e, "cambio_precio")
      return false
    end
    A.StartCommoditiesPurchase(e.item, e.cantidad)
    e.esperando = "precio"
    cambiar(e, "comprando")
    plazo(e, ESPERA_BUSQUEDA)
    return true
  elseif e.fase == "confirmar" and e.tipo == "objeto" then
    local real = revisarObjeto(e)
    if not real then
      return false
    end
    e.total, e.precioUnit, e.pidio = real, real, true
    ultimoDinero = dinero()
    A.PlaceBid(e.subasta, real) -- lo mismo que se ha revisado: nunca más que el total del botón
    pedida(e, false)
    e.esperando = "compra"
    cambiar(e, "comprando")
    plazo(e, ESPERA_COMPRA)
    return true
  elseif e.fase == "confirmar" then
    if e.shoppingId and not shoppingQuoteMatches(e) then
      A.CancelCommoditiesPurchase()
      fallar(e, "cambio_precio")
      return false
    end
    local motivo = impedimento(e.total) or (e.total > e.regla.maxOro and "regla") or nil
    if motivo then
      A.CancelCommoditiesPurchase()
      fallar(e, motivo)
      return false
    end
    ultimoDinero = dinero()
    A.ConfirmCommoditiesPurchase(e.item, e.cantidad)
    pedida(e, true)
    e.esperando = "compra"
    cambiar(e, "comprando")
    plazo(e, ESPERA_COMPRA)
    return true
  end
  return false
end

local function soltar(cancelarAunque)
  local e = actual
  if e and e.tipo ~= "objeto" and (e.fase == "confirmar" or (e.fase == "comprando" and e.esperando == "precio")) then
    if cancelarAunque then
      pcall(C_AuctionHouse.CancelCommoditiesPurchase)
    else
      C_AuctionHouse.CancelCommoditiesPurchase()
    end
  end
  actual = nil
  pasos = pasos + 1
end

function Compra.cancelar()
  local e = actual
  if not e or (e.fase == "comprando" and e.esperando == "compra") then
    return
  end
  soltar(false)
  avisar()
end

-- F13: con pcall en la cancelación, como al cerrar: soltar la compra no puede fallar a medias.
function Compra.ceder()
  local e = actual
  if not e or (e.fase == "comprando" and e.esperando == "compra") then
    return
  end
  soltar(true)
  avisar()
end

-- Al cerrar la subasta las compras pendientes se dejan como están: lo gastado sigue contando (mejor de más).
function Compra.parar()
  local habia = actual ~= nil
  soltar(true)
  for i = #pendientes, 1, -1 do
    pendientes[i].e.pendiente = nil
    pendientes[i] = nil
  end
  escuchar(false)
  if habia then
    avisar()
  end
end

function Compra.gastado()
  return gastado
end

function Compra.combate()
  return Compra.enCombate == true or (InCombatLockdown ~= nil and InCombatLockdown() == true)
end

-- La marca del combate, siempre (no solo con una compra elegida). Se registra al cargar, antes que las ventanas: cuando
-- ellas repintan con el evento, la marca ya está puesta (y ellas la ponen también, por si acaso).
Compra.enCombate = false
SNF.Eventos.escuchar("PLAYER_REGEN_DISABLED", function()
  Compra.enCombate = true
end)
SNF.Eventos.escuchar("PLAYER_REGEN_ENABLED", function()
  Compra.enCombate = false
end)

-- La marca se rehace con la verdad del juego (InCombatLockdown()) al entrar en el mundo y al abrir la subasta: una
-- pantalla de carga o un cambio de zona en combate pueden comerse PLAYER_REGEN_ENABLED y dejarla pegada en true. Si
-- cambia con una compra elegida, se avisa para que las ventanas repinten Comprar.
function Compra.rehacerCombate()
  local antes = Compra.enCombate
  Compra.enCombate = InCombatLockdown ~= nil and InCombatLockdown() == true
  if antes ~= Compra.enCombate and actual then
    ejecutar("compra", avisar)
  end
end
SNF.Eventos.escuchar("PLAYER_ENTERING_WORLD", Compra.rehacerCombate)
SNF.Eventos.escuchar("AUCTION_HOUSE_SHOW", Compra.rehacerCombate)

-- El jugador cambia el aviso de oro con una compra «lista» o por confirmar: se vuelve a mirar ya (la barra cambia el
-- botón) y, si deja de ser cara, se desarma. Compra.pulsar lo mira otra vez en cada clic.
SNF.Eventos.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave ~= "comercioAvisoOro" then
    return
  end
  ejecutar("compra", function()
    local e = actual
    if e and (e.fase == "lista" or e.fase == "confirmar") then
      e.aviso = caro(e)
      if not e.aviso then
        e.armada = nil
      end
      avisar()
    end
  end)
end)
