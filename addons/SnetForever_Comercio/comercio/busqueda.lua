-- SnetForever: el motor de búsqueda de nuestra ventana de la subasta (parte 3, bloque B). Sin interfaz: la ventana
-- (ui/subasta/*) lo usa y lo pinta.
--
-- Solo busca cuando el jugador lo pide (Buscar, Intro, una búsqueda reciente o «Volver a escanear», y pulsar una fila
-- para sus subastas): nunca sola. Las funciones públicas no se protegen solas: quien la llame desde la interfaz lo hace
-- dentro de SNF.Comercio.ejecutar.
-- Ojo: la futura «Búsqueda de vendedores» no debe pasar por buscar(): apuntaría el nombre de un jugador en las recientes
-- (y nunca se guardan nombres de otros jugadores).
--
-- Busqueda.buscar(texto) -> boolean   lanza C_AuctionHouse.SendBrowseQuery con ese texto (recortado; ni vacío ni de
--                       más de MAX_LETRAS letras) y pide más páginas con RequestMoreBrowseResults hasta
--                       HasFullBrowseResults(). False con la subasta cerrada (o el comercio apagado) o con un texto que
--                       no vale; entonces no lanza nada. Solo vale la última búsqueda pedida: si otra ya salió y no ha
--                       respondido, la nueva espera a su respuesta (que se tira) y sale después; lo que llegue de la
--                       vieja no cuenta. Un navegar viejo se espera aunque llegue antes el sistema libre (su respuesta
--                       puede llegar después), como mucho ESPERA_VIEJA s desde el sistema libre; lo mismo con un navegar
--                       del sniper o del escaneo en camino (Sniper.enCamino(), Escaneo.enCamino()): se deja a su dueño
--                       y la nuestra sale después. Si el sistema limitado
--                       de la subasta no está libre, queda pendiente y sale con AUCTION_HOUSE_THROTTLED_SYSTEM_READY (y
--                       se vuelve a mirar cada MIRAR_CADA s por si el evento se pierde), sin lanzar búsquedas que se
--                       pierden. Mientras SNF.Compra busca la subasta que el jugador va a comprar (fase 'buscando'), se
--                       la deja pasar. Apunta el texto en las recientes.
-- Busqueda.estado()     'parada' | 'esperando' (pedida, aún sin salir) | 'buscando' | 'completa'.
-- Busqueda.motivo()     'ajena' (completa a medias: otro addon o el jugador en la subasta de Blizzard lanzó otra
--                       búsqueda y las páginas siguientes serían de la suya), 'sin_respuesta' (completa a medias: una
--                       página no llegó tras REINTENTOS intentos), 'parada' (completa a medias: el jugador la paró con
--                       Busqueda.detener) o nil.
-- Busqueda.detener() -> boolean   (B6r, la pausa de la vista de resultados) para la búsqueda en marcha sin borrar lo que
--                       ya llegó: no pide más páginas (lo que esté en camino se tira) y queda 'completa' con motivo
--                       'parada'. False, sin hacer nada, si no hay ninguna búsqueda esperando o buscando.
-- Busqueda.ocupada()    true mientras hay algo nuestro pedido o en camino (la búsqueda o unas subastas). Ni el escaneo
--                       de fondo (comercio/escaneo.lua) ni el sniper buscan mientras tanto: la búsqueda del jugador manda.
-- Busqueda.enviando()   true solo mientras corre una llamada nuestra a C_AuctionHouse: los ganchos del sniper no la
--                       cuentan como ajena.
-- Busqueda.resultados() {{item, clave, nombre, nivel, calidad, icono, cantidad, precioMin, resumen?}, ...}: una fila por objeto
--                       (por itemKey: el equipo, una por nivel), en el orden en que llegan. clave = el itemKey; nivel =
--                       el de la clave o, si es 0, el del objeto; nombre, calidad e icono, los del juego (nil si aún no
--                       los sabe); cantidad = unidades a la venta; precioMin = minPrice (cobre por unidad). Es una copia.
--                       Una variante con sufijo (itemKey.itemSuffix ≠ 0) lleva su nombre completo (B2r, punto 4): el de
--                       C_AuctionHouse.GetItemKeyInfo si trae algo más que el nombre del objeto (si aún no lo sabe, llega
--                       con ITEM_KEY_ITEM_INFO_RECEIVED) o, si no, el del enlace de su primera subasta cuando llegan. Mientras
--                       tanto, el del objeto; el nombre cambia como mucho una vez.
--                       resumen (B3r) = {subastas, minimo?, minimoDudoso?, disponible, completa, hora, pendiente?,
--                       horaPendiente?} del
--                       objeto ya leído (con pedirSubastas, leyendo o al pulsar su fila), o {fallo = true} si su lectura no
--                       respondió; nil sin leer. subastas = cuántas hay (en una mercancía, sus escalones de precio; en un
--                       objeto suelto, todas sus subastas, también las iguales que el juego agrupa en una fila); minimo = el
--                       precio por unidad más bajo que se puede comprar (sin las tuyas ni las de solo puja; nil si no hay);
--                       disponible = las unidades a la venta; completa = el servidor dio la lista entera. F4: hora =
--                       GetServerTime() al llegar su lista (la misma que vivo, si la lista es entera). Una lista a medias no
--                       pisa una entera de antes del mismo objeto en esta búsqueda (como vivo): se queda la entera, con su
--                       hora, y pendiente = true (llegó otra después, a medias, a la hora horaPendiente; la que se ve debajo
--                       y se compra es esa, la de subastas()). Así la fila y el tooltip dan lo mismo. Solo en memoria, sin
--                       vendedores: se olvida al salir, parar o buscar otra cosa.
-- Busqueda.vivo(item) -> {precio, cantidad, subastas?, hora, origen = "lista", minimoDudoso?} | nil
--                       fallo F1 (en el juego): la última
--                       lista ENTERA de ese objeto (id) que ha llegado con la subasta abierta (pedirSubastas, leer o la
--                       SendSearchQuery de SNF.Compra), para el tooltip (ui/tooltip.lua): es lo único de verdad de ahora, y
--                       el escaneo (ReplicateItems o el resumen de navegar) da una foto guardada por el servidor. precio = el
--                       mínimo que se puede comprar (F12: cuenta una fila con algo de otros; no las enteras tuyas, las de
--                       otro personaje de la cuenta, las que no se sabe de quién son ni las de solo puja; nil si no hay
--                       ninguno), minimoDudoso = el precio más bajo que ese que se ha dejado fuera por prudencia (de otro
--                       personaje o sin saber de quién es), cantidad =
--                       las unidades a la venta (todas, también las tuyas),
--                       subastas = cuántas (solo en un objeto suelto: los escalones de una
--                       mercancía no son subastas), hora = GetServerTime() al llegar. Es lo mismo que enseña la fila de
--                       Navegar (resumen). Una lista a medias no cuenta (se queda la anterior, con su hora). En el equipo,
--                       solo si la lista es del objeto entero: una variante con sufijo, o un nivel entre varios en
--                       resultados(), no es todo el objeto y no cuenta. Solo en memoria, sin vendedores: buscar otra cosa o
--                       salir() no la borran (dice su hora); cerrar la subasta (parar) sí, porque ya no es de ahora. Es la
--                       tabla de dentro (el tooltip la lee sin crear nada): quien la reciba no la cambia. Ronda 1: la
--                       eligen SNF.Subasta.foto (ia/subasta.lua) para todo lo que enseña un precio de ahora; una clave con
--                       nivel solo cuenta si resultados() trae ese objeto con esa sola clave.
-- Busqueda.versionVivo() -> número   sube con cada lista apuntada y vuelve a 0 al cerrar la subasta (0 = ninguna): la
--                       memoria de las oportunidades de la IA (ia/contexto.lua) no vale con listas.
-- Busqueda.leyendo()    (B3r) true mientras hay una lectura pedida (esperando o en camino). F6, ronda 1: si leer la
--                       respuesta de un objeto falla, queda leído sin datos ({fallo = true}), la lectura sigue y el fallo
--                       se apunta una vez por sesión (Comercio.anotarFallo «lectura»), sin apagar el comercio.
-- Busqueda.soltarLectura()   (B3r, la pausa de la lectura) olvida la lectura que espera a salir (la que ya va en camino
--                       llega igual).
-- Busqueda.pedirSubastas(item, opciones?) -> boolean   pide las subastas de un objeto (item = id, itemKey o una fila de
--                       resultados()) con SendSearchQuery. Sin opciones solo la llama la interfaz cuando el jugador pulsa
--                       una fila. Con opciones.leer = true (B3r, la lectura de la vista de resultados) solo lo LEE: guarda
--                       su resumen (ver resultados()) y no toca las subastas de la fila pulsada. Una lectura a la vez: la
--                       pide la interfaz, uno tras otro y en el orden de su lista, cuando leyendo() da false. Va después
--                       de todo lo demás (las subastas de la fila pulsada y la búsqueda), solo con la búsqueda acabada, y
--                       espera (mirando cada MIRAR_CADA s) mientras haya una compra en pie (SNF.Compra en 'buscando',
--                       'lista', 'confirmar' o 'comprando': su búsqueda dejaría en el cliente otro objeto y la compra de la
--                       fila marcada no encontraría su subasta) y con un navegar del sniper o del escaneo en camino (como
--                       la búsqueda). Una que espera no cuenta en ocupada(); en camino, sí (el sniper y el escaneo esperan
--                       su respuesta). False si ya está leída (o si otra lectura va en camino); leer nunca compra.
--                       False con la subasta cerrada o si item no es un objeto. Pedir otra vez la que aún no ha
--                       respondido no la relanza; una que ya llegó se vuelve a pedir y su lista vieja se queda a la vista
--                       (pendiente) hasta que llega la nueva. Si llega sin pedirla una lista de ahora del mismo objeto (la
--                       SendSearchQuery de SNF.Compra al elegir una subasta), se vuelve a leer (B6r, punto 12: lo que se
--                       ve es lo que se compra). De una en una: pedir otro objeto olvida el anterior (lo
--                       suyo que aún llegue se tira). La respuesta de un objeto se casa por la itemKey entera, campo a
--                       campo (un campo pedido a 0, como el nivel de un id suelto, vale cualquiera); la clave que trae
--                       solo sirve para leer esa respuesta: los pedidos siguientes van con la pedida. El equipo se pide
--                       siempre con la clave de su fila de resultados() (pasando la fila), no con el id suelto.
-- Busqueda.subastas(item) -> {{cantidad, precioUnidad, puja?, tiempo?, banda?, vendedor?, mia, propias?, comprables?, cuenta,
--                       paraMinimo, dudosa, auctionID?, total?, mercancia?, enlace?, iguales?}, ...},
--                       {pendiente,
--                       completa} | nil   solo lee lo que trajo pedirSubastas de ese mismo objeto y nunca lanza nada
--                       (se puede llamar en cada repintado). nil si no se pidió, si aún no ha llegado la primera vez o
--                       tras salir() o una búsqueda nueva. pendiente = se volvió a pedir y la lista es la de antes;
--                       completa = el servidor dio la lista entera (HasFullCommoditySearchResults o
--                       HasFullItemSearchResults; si no, o si el juego no las tiene, false y la ventana puede poner
--                       «y más…»). Mercancías con
--                       GetCommoditySearchResultInfo y objetos con GetItemSearchResultInfo. En un objeto suelto (arreglo
--                       de la compra suelta, 2026-11-19) cada fila del juego agrupa `quantity` subastas IGUALES de 1
--                       unidad y buyoutAmount es lo que cuesta UNA: cantidad = 1 (lo que compra un clic), precioUnidad =
--                       total = buyoutAmount e iguales = quantity (antes se leía quantity como la cantidad y se dividía
--                       el precio entre ella). precioUnidad = cobre por
--                       unidad de la compra ya (nil si solo admite puja); puja = la puja actual o la mínima (solo
--                       objetos); tiempo = segundos que le quedan (si el servidor lo dice); banda =
--                       Enum.AuctionHouseTimeLeftBand (solo objetos); mia = TODA la fila es del jugador; propias,
--                       comprables, cuenta, paraMinimo y dudosa: de quién es la fila (F12, SNF.Comercio.duenoMercancia y
--                       duenoObjeto; propias y comprables son nil si no se sabe); auctionID y total (la
--                       compra ya entera, en cobre) solo de objetos, para que SNF.Compra compre esa subasta y no otra
--                       (solo en memoria, como todo esto); mercancia = true en las de una mercancía (B6r); enlace = el
--                       itemLink de esa subasta de objeto (con su sufijo, si lo trae); vendedor = el primer nombre de
--                       owners, solo de objetos (una mercancía no lleva vendedor: B2r, punto 3). El vendedor solo vive en
--                       memoria mientras dura la búsqueda: no se guarda nunca. Si no llega respuesta tras REINTENTOS
--                       intentos, se queda la lista de antes (o {} la primera vez) con fallo = true en el segundo valor
--                       (B3r, ronda 1), y el objeto queda leído (resumen {fallo = true} si no tenía otro).
-- Busqueda.ceder()      F13: nuestra ventana se ha escondido: suelta la búsqueda, las subastas, la lectura, los reintentos y sus
--                       temporizadores, sin borrar lo que ya llegó. Una búsqueda a medias queda 'completa' con motivo 'parada'; lo
--                       que siga en camino se tira al llegar. Unas subastas sin ninguna lista quedan con fallo: pulsar la fila las
--                       pide otra vez. Sin la ventana a la vista (SNF.Comercio.ventanaVisible), buscar y pedirSubastas dan false
--                       e intentar no envía nada, aunque lo llame un temporizador ya programado o una respuesta ajena.
-- Busqueda.salir()      borra los resultados y las subastas y vuelve a 'parada' sin lanzar nada.
-- Busqueda.parar()      lo mismo y deja de escuchar (lo llama comercio.lua al cerrar la subasta y si el comercio se
--                       apaga).
-- Busqueda.recientes()  {texto, ...}: como mucho MAX_RECIENTES, la más nueva primero, sin repetidas (sin mirar
--                       mayúsculas, también en Á É Í Ñ Ó Ú Ü).
-- Busqueda.favoritas()  {texto, ...}: como mucho MAX_FAVORITAS, la última marcada primero.
--                       Las dos dan la misma tabla mientras no cambie nada (no se rehace en cada llamada): quien la
--                       reciba no la cambia.
-- Busqueda.marcarFavorita(texto, si) -> boolean   la marca (si) o la quita; false si el texto no vale.
-- Busqueda.esFavorita(texto) -> boolean   si está entre las favoritas, con la misma comparación (recortado y sin mirar
--                       mayúsculas, también en Á É Í Ñ Ó Ú Ü); false si el texto no vale.
--                       Recientes y favoritas se guardan en SnetForeverCuenta.comercio.busquedas = {recientes,
--                       favoritas}, solo con los textos buscados. Lo que haya allí que no sea un texto válido se quita
--                       la primera vez que se lee (y otra vez si la tabla guardada cambia, como tras /reload).
-- SNF_COMERCIO_BUSQUEDA(estado)   al cambiar de estado, al llegar páginas o unas subastas; como mucho una vez por
--                       fotograma (lo que pase en el mismo fotograma se avisa en el siguiente, con el estado de
--                       entonces).
--
-- Convivencia: las búsquedas van dentro de Escaneo.propia (el escaneo no las cuenta como ajenas) y el escaneo y el
-- sniper esperan (motivo 'busqueda') mientras Busqueda.ocupada(). Hay un gancho (hooksecurefunc) en SendBrowseQuery
-- para ver las búsquedas ajenas: una a mitad de la nuestra la deja 'completa' con motivo 'ajena'. Las páginas que llegan
-- sin pedirlas solo se aceptan si son de nuestra búsqueda (la última SendBrowseQuery es la nuestra y ya llegó su
-- primera página).
--
-- Dormido hasta la primera búsqueda: al cargar no escucha nada. Los eventos de la subasta se escuchan desde la primera
-- búsqueda hasta que se cierra la subasta. Todo el trabajo de eventos, ganchos y temporizadores pasa por
-- SNF.Comercio.ejecutar, y cada temporizador mira antes que sigue vivo: tras parar, ninguno trabaja. No llama a ninguna
-- función protegida.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Busqueda = {}
SNF.Busqueda = Busqueda

Busqueda.MAX_LETRAS = 100
Busqueda.MAX_RECIENTES = 20
Busqueda.MAX_FAVORITAS = 50
Busqueda.ESPERA = 10 -- s sin respuesta antes de dar una petición por perdida
Busqueda.REINTENTOS = 2 -- veces que se vuelve a pedir lo que no responde
Busqueda.MIRAR_CADA = 1 -- s entre dos miradas al sistema limitado mientras se espera
Busqueda.ESPERA_VIEJA = 2 -- s que se espera, tras el sistema libre, la respuesta de un navegar viejo

local ceil = math.ceil

local estado = "parada"
local motivo = nil
local browseFilter
local texto = nil -- lo que se está buscando
local filas = {} -- los resultados
local porClave = {} -- [clave en texto] = fila
local cursor = 0 -- filas de GetBrowseResults ya leídas
local recibida = false -- ya llegó la primera página de nuestra búsqueda
local ultimaMia = false -- la última SendBrowseQuery es la nuestra
local pendiente = nil -- lo que espera a salir de la búsqueda: "navegar" | "mas"
local intentos = 0
local sub = nil -- las subastas pedidas: {k, clave, item, filas?, intentos}
local saleSub = nil -- independent snapshot used by Sell and Cancel
local shoppingSub = nil -- independent snapshot used by group shopping
local lectura = nil -- B3r: el objeto que se lee sin desplegar: {k, clave, item, intentos}
local resumenes = {} -- B3r: [k] = {subastas, minimo, disponible, completa, hora, pendiente?, horaPendiente?} | {fallo}
-- F1: lo de Busqueda.vivo, colgado de una tabla (el archivo no gasta más locales de primer nivel). Vivo.lista = [itemID] =
-- {precio, cantidad, subastas, hora, origen = "lista"}: la última lista entera de cada objeto. Vivo.version sube con cada
-- lista que se apunta y vuelve a 0 al cerrar la subasta (Busqueda.versionVivo).
local Vivo = {lista = {}, version = 0}
local subPendiente = false -- sub espera a salir
local enVuelo = nil -- {accion = "navegar"|"mas"|"sub"|"leer", id, vieja?, sub?, lee?}: lo nuestro que aún no ha respondido
local envios = 0
local generacion = 0 -- cambia al buscar, salir y parar: los temporizadores de antes ya no hacen nada
local mirando = false
local plazoAjeno = false -- corre el plazo de ESPERA_VIEJA s por un navegar del sniper o del escaneo en camino
local ajenoVencido = false -- ese plazo ya pasó: la búsqueda sale aunque su respuesta no haya llegado
local escuchando = false
local enganchado = false
local enviandoYo = false
local ultimoAviso = nil -- GetTime() del último SNF_COMERCIO_BUSQUEDA
local avisoProgramado = false

local function ejecutar(fn, ...)
  return SNF.Comercio.ejecutar("busqueda", fn, ...)
end

local function funcion(nombre)
  local ah = rawget(_G, "C_AuctionHouse")
  local f = type(ah) == "table" and rawget(ah, nombre)
  return type(f) == "function" and f or nil
end

-- Llama a fn dentro de ejecutar pasados `segundos`, si entretanto no se ha buscado otra cosa, salido ni parado.
local function despues(segundos, fn)
  local g = generacion
  C_Timer.After(segundos, function()
    if g == generacion then
      ejecutar(fn)
    end
  end)
end

---------------------------------------------------------------------------------------------------
-- Avisos
---------------------------------------------------------------------------------------------------

local function emitir()
  ultimoAviso = GetTime()
  SNF.Eventos.emitir("SNF_COMERCIO_BUSQUEDA", estado)
end

-- Avisa ya o, si ya se avisó en este fotograma, en el siguiente.
local function avisar()
  if avisoProgramado then
    return
  end
  if ultimoAviso ~= GetTime() then
    emitir()
    return
  end
  avisoProgramado = true
  despues(0, function()
    avisoProgramado = false
    emitir()
  end)
end

local function ponerEstado(e, m)
  if estado ~= e or motivo ~= m then
    estado, motivo = e, m
    avisar()
  end
end

---------------------------------------------------------------------------------------------------
-- Textos y lo guardado
---------------------------------------------------------------------------------------------------

-- Letras de un texto en UTF-8 (los bytes de continuación no cuentan).
local function letras(t)
  local _, n = string.gsub(t, "[^\128-\191]", "")
  return n
end

-- El texto sin espacios a los lados, o nil si no vale.
local function recortar(t)
  if type(t) ~= "string" then
    return nil
  end
  t = string.match(t, "^%s*(.-)%s*$")
  if t == "" or letras(t) > Busqueda.MAX_LETRAS then
    return nil
  end
  return t
end

-- Las mayúsculas del español en UTF-8 (Á É Í Ñ Ó Ú Ü) y su minúscula: string.lower solo baja las letras ASCII.
local MINUSCULA = {
  ["\195\129"] = "\195\161", ["\195\137"] = "\195\169", ["\195\141"] = "\195\173", ["\195\145"] = "\195\177",
  ["\195\147"] = "\195\179", ["\195\154"] = "\195\186", ["\195\156"] = "\195\188",
}

local function minusculas(t)
  return (string.gsub(string.lower(t), "\195[\129\137\141\145\147\154\156]", MINUSCULA))
end

local function igual(a, b)
  return minusculas(a) == minusculas(b)
end

-- Una lista de textos válidos, sin repetidas y como mucho `max`.
local function limpiarLista(lista, max)
  local limpia = {}
  if type(lista) ~= "table" then
    return limpia
  end
  for _, t in ipairs(lista) do
    local r = recortar(t)
    if r and #limpia < max then
      local repetida = false
      for _, otra in ipairs(limpia) do
        if igual(otra, r) then
          repetida = true
          break
        end
      end
      if not repetida then
        limpia[#limpia + 1] = r
      end
    end
  end
  return limpia
end

local limpiada = nil -- la tabla guardada que ya se limpió (otra, como la de un /reload, se limpia otra vez)
local copias = {} -- {recientes?, favoritas?}: lo que dan recientes() y favoritas() hasta que cambie algo

local function comercioGuardado()
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  return type(c) == "table" and c or nil
end

-- SnetForeverCuenta.comercio.busquedas, limpio: solo {recientes, favoritas} con textos válidos. Se limpia una vez (y
-- otra si la tabla guardada cambia); después se devuelve la misma.
local function guardadas()
  local c = comercioGuardado()
  if not c then
    SNF.Guardado.preparar()
    c = comercioGuardado()
    if not c then
      return nil
    end
  end
  local b = c.busquedas
  if b ~= nil and b == limpiada then
    return b
  end
  b = type(b) == "table" and b or {}
  local limpio = {
    recientes = limpiarLista(b.recientes, Busqueda.MAX_RECIENTES),
    favoritas = limpiarLista(b.favoritas, Busqueda.MAX_FAVORITAS),
  }
  c.busquedas = limpio
  limpiada, copias = limpio, {}
  return limpio
end

-- Pone t arriba de la lista (quitando la que sea igual) y deja como mucho `max`.
local function ponerArriba(lista, t, max)
  for i = #lista, 1, -1 do
    if igual(lista[i], t) then
      table.remove(lista, i)
    end
  end
  table.insert(lista, 1, t)
  while #lista > max do
    table.remove(lista)
  end
end

local function copiaLista(lista)
  local c = {}
  for i, t in ipairs(lista or {}) do
    c[i] = t
  end
  return c
end

---------------------------------------------------------------------------------------------------
-- Filas
---------------------------------------------------------------------------------------------------

local function claveDe(k)
  return table.concat({tostring(k.itemID), tostring(k.itemLevel or 0), tostring(k.itemSuffix or 0),
    tostring(k.battlePetSpeciesID or 0)}, ":")
end

local function copiaClave(k)
  return {itemID = k.itemID, itemLevel = k.itemLevel or 0, itemSuffix = k.itemSuffix or 0,
    battlePetSpeciesID = k.battlePetSpeciesID or 0}
end

-- Nombre, calidad, nivel e icono del objeto según el juego (nil si aún no lo sabe).
local function infoObjeto(item)
  local espacio = rawget(_G, "C_Item")
  local f = type(espacio) == "table" and rawget(espacio, "GetItemInfo") or rawget(_G, "GetItemInfo")
  if type(f) ~= "function" then
    return nil
  end
  local ok, nombre, _, calidad, nivel, _, _, _, _, _, icono = pcall(f, item)
  if not ok or type(nombre) ~= "string" or nombre == "" then
    return nil
  end
  return nombre, tonumber(calidad), tonumber(nivel), icono
end

-- B2r, punto 4: el nombre de una itemKey según el juego (C_AuctionHouse.GetItemKeyInfo), o nil si aún no lo sabe (lo
-- pide y avisa con ITEM_KEY_ITEM_INFO_RECEIVED). Con sufijo, en WoW Forever trae el nombre con él («Rodela de oso pardo de
-- magia»): es lo que lee TSM para sus filas, y la subasta de Blizzard pinta su lista con él.
local function nombreDeClave(k)
  local f = funcion("GetItemKeyInfo")
  if not f then
    return nil
  end
  local ok, info = pcall(f, k)
  local n = ok and type(info) == "table" and info.itemName
  return type(n) == "string" and n ~= "" and n or nil
end

local function conSufijo(fila)
  return (tonumber(fila.clave.itemSuffix) or 0) ~= 0
end

-- El nombre de la fila. Una variante con sufijo enseña su nombre completo (B2r, punto 4): el de su itemKey si trae algo más
-- que el nombre del objeto; si no, el del objeto hasta que llega el de su primera subasta (sufijoDeEnlace). Una vez puesto
-- el nombre con sufijo (fila.sufijoFinal) ya no cambia: la fila cambia de texto como mucho una vez. B2r ronda 1: el nombre
-- del objeto (sin sufijo) solo se pone al llegar la fila (`primera`); si entonces el juego aún no sabe el objeto, la fila se
-- queda sin nombre hasta que llega el de su itemKey (no pasa por el nombre sin sufijo entre medias).
local function nombrar(fila, primera)
  local base, calidad, nivel, icono = infoObjeto(fila.item)
  if base then
    fila.calidad, fila.icono = calidad, icono
    if not fila.nivel then
      fila.nivel = nivel
    end
  end
  if not conSufijo(fila) then
    fila.nombre = base or fila.nombre
    return
  end
  if fila.sufijoFinal then
    return
  end
  local n = fila.nombreClave
  if n and base and n ~= base then
    fila.nombre, fila.sufijoFinal = n, true
  elseif n then
    fila.nombre = n -- el de su itemKey (sin el del objeto aún no se sabe si trae el sufijo)
  elseif primera then
    fila.nombre = base
  end
end

local function rellenar(fila, primera)
  if conSufijo(fila) and not fila.clavePedida then
    fila.clavePedida = true
    fila.nombreClave = nombreDeClave(fila.clave)
  end
  nombrar(fila, primera)
end

-- ITEM_KEY_ITEM_INFO_RECEIVED(itemID): las variantes de ese objeto que esperaban el nombre de su itemKey. true si alguna
-- cambia de nombre.
local function nombresDeClave(item)
  local cambia = false
  for _, fila in ipairs(filas) do
    if fila.item == item and conSufijo(fila) and not fila.sufijoFinal and not fila.nombreClave then
      local antes = fila.nombre
      fila.nombreClave = nombreDeClave(fila.clave)
      nombrar(fila)
      cambia = cambia or fila.nombre ~= antes
    end
  end
  return cambia
end

-- B2r, punto 4: si la itemKey no trajo el sufijo, el nombre del enlace de la primera subasta de esa variante (en cuanto
-- llegan sus subastas). Pase lo que pase, ya es el nombre final de la fila.
local function sufijoDeEnlace(s, lista)
  local fila = porClave[s.k]
  if not (fila and conSufijo(fila)) or fila.sufijoFinal then
    return
  end
  local primera = lista[1]
  local n = primera and primera.enlace and string.match(primera.enlace, "|h%[(.-)%]|h")
  if n and n ~= "" then
    fila.nombre, fila.sufijoFinal = n, true
  end
end

-- Lee las filas desde..#lista de navegar: {itemKey, totalQuantity, minPrice}. La misma clave otra vez (no debería
-- pasar) no se suma: se queda el precio más bajo y la cantidad mayor.
local function leerFilas(lista, desde)
  if type(lista) ~= "table" then
    return
  end
  for i = desde, #lista do
    local f = lista[i]
    local k = type(f) == "table" and f.itemKey
    local item = type(k) == "table" and k.itemID
    if type(item) == "number" then
      local precio = tonumber(f.minPrice)
      if precio and precio <= 0 then
        precio = nil
      end
      local cantidad = tonumber(f.totalQuantity) or 0
      local c = claveDe(k)
      local fila = porClave[c]
      if fila then
        if precio and (not fila.precioMin or precio < fila.precioMin) then
          fila.precioMin = precio
        end
        if cantidad > fila.cantidad then
          fila.cantidad = cantidad
        end
      else
        local nivel = tonumber(k.itemLevel)
        fila = {item = item, clave = copiaClave(k), cantidad = cantidad, precioMin = precio,
          nivel = (nivel and nivel > 0) and nivel or nil}
        rellenar(fila, true)
        porClave[c] = fila
        filas[#filas + 1] = fila
      end
    end
  end
end

-- El primer nombre de owners (como lo da el cliente), solo para enseñarlo. Solo en las subastas de objeto: las mercancías
-- no llevan vendedor (B2r, punto 3: GetCommoditySearchResultInfo trae owners solo en algunos escalones, y la vista enseñaba
-- un vendedor en la primera subasta de Paño de lana y en las demás no; TSM no enseña vendedor en las mercancías).
local function vendedorDe(r)
  local o = r.owners
  local v = type(o) == "table" and o[1]
  return type(v) == "string" and v ~= "" and v or nil
end

-- B3r: el resumen de una lista de subastas (sin vendedores): cuántas, el precio por unidad más bajo que se puede comprar
-- (sin las de solo puja) y las unidades a la venta (todas, también las tuyas, como enseña el juego). Una fila de objeto
-- suelto cuenta sus `iguales` (subastas iguales de 1 unidad) en las subastas y en lo disponible.
-- F12: una fila cuenta para el mínimo si da precio de mercado (paraMinimo: tiene de otros). minimoDudoso = el precio más
-- bajo que el mínimo que se ha dejado fuera por prudencia (de otro personaje de la cuenta, o sin saber cuántas son tuyas).
local function resumir(lista, completa)
  local minimo, aparte, disponible, subastas = nil, nil, 0, 0
  for _, f in ipairs(lista) do
    local iguales = f.iguales or 1
    subastas = subastas + iguales
    disponible = disponible + (f.cantidad or 0) * iguales
    local p = f.precioUnidad
    if p and f.paraMinimo and (not minimo or p < minimo) then
      minimo = p
    elseif p and f.dudosa and (not aparte or p < aparte) then
      aparte = p
    end
  end
  return {subastas = subastas, minimo = minimo, disponible = disponible, completa = completa == true,
    minimoDudoso = aparte and (not minimo or aparte < minimo) and aparte or nil}
end

-- F1: ¿es esta clave el objeto entero? Una variante con sufijo (o una mascota) no lo es, ni un nivel de un equipo que en
-- resultados() sale con más de una clave. Ronda 1: una clave con nivel (itemLevel ≠ 0) solo cuenta si resultados() trae el
-- objeto y con esa sola clave; sin la búsqueda delante no se sabe si hay otros niveles y no cuenta.
function Vivo.entero(item, k, clave)
  if (tonumber(clave.itemSuffix) or 0) ~= 0 or (tonumber(clave.battlePetSpeciesID) or 0) ~= 0 then
    return false
  end
  local visto = false
  for _, fila in ipairs(filas) do
    if fila.item == item then
      if claveDe(fila.clave) ~= k then
        return false
      end
      visto = true
    end
  end
  return visto or (tonumber(clave.itemLevel) or 0) == 0
end

-- F1: una lista entera de un objeto deja su foto de ahora para el tooltip (Busqueda.vivo). r = su resumen (resumir); a
-- medias no cuenta. Sin vendedores: solo números.
function Vivo.apuntar(item, k, clave, r, mercancia)
  if type(item) ~= "number" or not r.completa or not (mercancia or Vivo.entero(item, k, clave)) then
    return
  end
  Vivo.lista[item] = {precio = r.minimo, cantidad = r.disponible, subastas = not mercancia and r.subastas or nil,
    hora = SNF.API.horaServidor(), origen = "lista", minimoDudoso = r.minimoDudoso}
  Vivo.version = Vivo.version + 1
end

-- Las subastas de una mercancía que tiene el cliente: la lista y si está entera.
local function listaMercancia(item)
  local A = C_AuctionHouse
  local lista = {}
  for i = 1, tonumber(A.GetNumCommoditySearchResults(item)) or 0 do
    local r = A.GetCommoditySearchResultInfo(item, i)
    if type(r) == "table" then
      -- F12: el juego junta lo tuyo y lo de otros en la fila de un precio: mia es solo si TODA es tuya.
      local d = SNF.Comercio.duenoMercancia(r)
      lista[#lista + 1] = {
        cantidad = tonumber(r.quantity) or 0,
        precioUnidad = tonumber(r.unitPrice),
        tiempo = tonumber(r.timeLeftSeconds),
        mia = d.mia, propias = d.propias, comprables = d.comprables, cuenta = d.cuenta,
        paraMinimo = d.paraMinimo, dudosa = d.dudosa,
        mercancia = true,
      }
    end
  end
  local entera = funcion("HasFullCommoditySearchResults")
  return lista, entera ~= nil and entera(item) == true
end

-- B3r, ronda 1: con las subastas de un objeto ya leídas, su lectura que aún espera a salir sobra (sería otra petición del
-- mismo objeto): se suelta. La que ya va en camino llega igual.
local function lecturaSobra(k)
  if lectura and lectura.k == k and not (enVuelo and enVuelo.lee == lectura) then
    lectura = nil
  end
end

-- F4 (fallo en el juego: el tooltip decía 10494 unidades y la fila padre 10557): el resumen de una lista que llega (l =
-- la lectura o las subastas pedidas: {k, item, clave}) y, si está entera, Busqueda.vivo, los dos de la misma lectura y con
-- la misma hora (la del servidor al llegar). Una lista a medias no pisa la entera que ya tiene ese objeto en esta búsqueda
-- (la misma regla que Vivo): se queda la entera, con su hora, y se marca pendiente (llegó otra después, a medias), con la
-- hora de esa (horaPendiente: la vista dice que lo de debajo está a medias). Así la fila leída y el tooltip salen siempre
-- de la misma lectura entera.
local function apuntarResumen(l, lista, completa, mercancia)
  local antes = resumenes[l.k]
  if not completa and antes and antes.completa then
    antes.pendiente, antes.horaPendiente = true, SNF.API.horaServidor()
    return
  end
  local r = resumir(lista, completa)
  r.hora = SNF.API.horaServidor()
  resumenes[l.k] = r
  Vivo.apuntar(l.item, l.k, l.clave, r, mercancia)
end

local function leerMercancia(s)
  local lista, completa = listaMercancia(s.item)
  s.filas, s.pedida, s.completa, s.fallo = lista, false, completa, nil
  if not s.background then
    apuntarResumen(s, lista, completa, true)
    lecturaSobra(s.k)
  end
end

-- Las subastas de un objeto suelto que tiene el cliente (con la clave que trae la respuesta): la lista y si está entera.
-- Arreglo de la compra suelta (2026-11-19): en WoW Forever cada fila de GetItemSearchResultInfo agrupa `quantity` subastas
-- IGUALES de 1 unidad, y buyoutAmount es lo que cuesta UNA (lo que cobra PlaceBid). Así lo lee TSM (una unidad por subasta y
-- quantity como número de subastas) y así lo pinta la subasta de Blizzard (Blizzard_AuctionHouseTableBuilder: la compra
-- es buyoutAmount, sin dividir). Antes se leía quantity como la cantidad de la subasta y se dividía la compra entre ella:
-- una bolsa salía «Ctd 67» a 5s 97c y se pagaron 3g 99s 89c por 1. Ahora: cantidad = 1 (lo que compra un clic), precio por
-- unidad = total = buyoutAmount, e iguales = quantity (cuántas subastas iguales hay: cuentan en lo disponible).
local function listaObjeto(clave)
  local A = C_AuctionHouse
  local lista = {}
  for i = 1, tonumber(A.GetNumItemSearchResults(clave)) or 0 do
    local r = A.GetItemSearchResultInfo(clave, i)
    if type(r) == "table" then
      local iguales = math.max(1, math.floor(tonumber(r.quantity) or 1))
      local d = SNF.Comercio.duenoObjeto(r) -- F12: las mismas reglas que una mercancía
      local compra = tonumber(r.buyoutAmount)
      local puja = tonumber(r.bidAmount)
      if not puja or puja <= 0 then
        puja = tonumber(r.minBid)
      end
      lista[#lista + 1] = {
        cantidad = 1,
        iguales = iguales,
        precioUnidad = (compra and compra > 0) and compra or nil,
        puja = (puja and puja > 0) and puja or nil,
        tiempo = tonumber(r.timeLeftSeconds),
        banda = tonumber(r.timeLeft),
        vendedor = vendedorDe(r),
        mia = d.mia, propias = d.propias, comprables = d.comprables, cuenta = d.cuenta,
        paraMinimo = d.paraMinimo, dudosa = d.dudosa,
        auctionID = tonumber(r.auctionID),
        total = (compra and compra > 0) and compra or nil,
        enlace = type(r.itemLink) == "string" and r.itemLink ~= "" and r.itemLink or nil,
      }
    end
  end
  local entera = funcion("HasFullItemSearchResults")
  return lista, entera ~= nil and entera(clave) == true
end

local function leerObjeto(s)
  local lista, completa = listaObjeto(s.claveServidor or s.clave)
  s.filas, s.pedida, s.completa, s.fallo = lista, false, completa, nil
  if not s.background then
    apuntarResumen(s, lista, completa, false)
    lecturaSobra(s.k)
    sufijoDeEnlace(s, lista)
  end
end

-- B3r: la respuesta de una lectura: solo su resumen (la lista, con sus vendedores, no se guarda). claveServidor: la que trae
-- la respuesta de un objeto (nil en una mercancía).
local function leerResumen(l, claveServidor)
  local lista, completa
  if claveServidor then
    lista, completa = listaObjeto(claveServidor)
    sufijoDeEnlace(l, lista)
  else
    lista, completa = listaMercancia(l.item)
  end
  apuntarResumen(l, lista, completa, claveServidor == nil)
end

-- F6, ronda 1: la lectura de fondo no se para por un objeto. Si leer su respuesta falla, ese objeto queda leído sin datos
-- (como uno que no responde: resumen {fallo = true}) y la lectura sigue con el siguiente; el fallo se apunta con
-- Comercio.anotarFallo una vez por sesión, con su primera línea. Antes subía al cortafuegos, que apagaba el comercio
-- entero hasta cerrar la subasta: la lectura se quedaba parada sin decir nada en la ventana.
local lecturaRota = false
local function leerResumenSeguro(l, claveServidor)
  local ok, err = pcall(leerResumen, l, claveServidor)
  if ok then
    return
  end
  resumenes[l.k] = {fallo = true}
  if not lecturaRota then
    lecturaRota = true
    local linea = string.match(tostring(err), "^[^\n]*") or ""
    pcall(SNF.Comercio.anotarFallo, "lectura", linea)
  end
end

---------------------------------------------------------------------------------------------------
-- Envíos
---------------------------------------------------------------------------------------------------

local intentar -- (se define abajo)

local function listo()
  local f = funcion("IsThrottledMessageSystemReady")
  if not f then
    return true
  end
  return f() and true or false
end

-- Vuelve a mirar dentro de MIRAR_CADA s, por si AUCTION_HOUSE_THROTTLED_SYSTEM_READY se pierde.
local function mirar()
  if mirando then
    return
  end
  mirando = true
  despues(Busqueda.MIRAR_CADA, function()
    mirando = false
    intentar()
  end)
end

-- La búsqueda dentro de Escaneo.propia (si existe), para que el escaneo no la cuente como ajena.
local function comoPropia(fn)
  local e = rawget(SNF, "Escaneo")
  local propia = type(e) == "table" and rawget(e, "propia")
  if type(propia) == "function" then
    return propia(fn)
  end
  return fn()
end

local function ordenPorPrecio()
  local E = rawget(_G, "Enum")
  local orden = type(E) == "table" and rawget(E, "AuctionHouseSortOrder")
  local precio = type(orden) == "table" and rawget(orden, "Price") or 0
  return {{sortOrder = precio, reverseSort = false}}
end

-- Lo que no respondió en ESPERA s: lo viejo se olvida; lo de ahora se pide otra vez, como mucho REINTENTOS veces.
local function sinRespuesta(e)
  if enVuelo ~= e then
    return
  end
  enVuelo = nil
  if e.vieja then
    intentar()
    return
  end
  if e.accion == "sub" then
    local s = e.sub
    if s == sub or s == saleSub or s == shoppingSub then
      s.intentos = s.intentos + 1
      if s.intentos > Busqueda.REINTENTOS then
        s.filas, s.pedida, s.completa = s.filas or {}, false, false
        -- B3r, ronda 1 (sin parpadeos): queda leída aunque sea sin datos, como una lectura que no responde: su fila ya no vuelve
        -- a esperar lectura (↻) al plegarla, y subastas() lo dice (fallo) para que su fila no cambie lo que enseña.
        s.fallo = true
        if not s.background then resumenes[s.k] = resumenes[s.k] or {fallo = true} end
        avisar()
      elseif s.background then
        s.queued = true
      else
        subPendiente = true
      end
    end
  elseif e.accion == "leer" then
    -- B3r: una lectura que no responde se pide otra vez (como mucho REINTENTOS veces); después queda leída sin datos.
    local l = e.lee
    if l == lectura then
      l.intentos = l.intentos + 1
      if l.intentos > Busqueda.REINTENTOS then
        resumenes[l.k] = {fallo = true}
        lectura = nil
        avisar()
      end
    end
  else
    intentos = intentos + 1
    if intentos > Busqueda.REINTENTOS then
      pendiente = nil
      ponerEstado("completa", "sin_respuesta")
    else
      pendiente = e.accion
    end
  end
  intentar()
end

local function enviar(accion)
  envios = envios + 1
  local e = {accion = accion, id = envios}
  enVuelo = e
  if accion == "sub" then
    subPendiente = false
    e.sub, e.clave = sub, copiaClave(sub.clave)
  elseif accion == "sale" or accion == "shopping" then
    local background = accion == "sale" and saleSub or shoppingSub
    background.queued = false
    e.accion, e.sub, e.clave = "sub", background, copiaClave(background.clave)
  elseif accion == "leer" then
    e.lee, e.clave = lectura, copiaClave(lectura.clave)
  else
    pendiente = nil
    if accion == "navegar" then
      ultimaMia, recibida, cursor = true, false, 0
      plazoAjeno, ajenoVencido = false, false
    end
    ponerEstado("buscando", nil)
  end
  SNF.Comercio.apuntarBusqueda() -- la cuenta por minuto que comparten el escaneo y el sniper
  local consulta = texto
  local s = accion == "leer" and lectura or e.sub
  enviandoYo = true
  local ok, err = pcall(comoPropia, function()
    if accion == "navegar" then
      -- filters e itemClassFilters, aunque vacíos: sin ellos WoW Forever devuelve la búsqueda sin ninguna fila (14-nov).
      C_AuctionHouse.SendBrowseQuery({searchString = consulta, sorts = {}, filters = {}, itemClassFilters = {}})
    elseif accion == "mas" then
      C_AuctionHouse.RequestMoreBrowseResults()
    else
      C_AuctionHouse.SendSearchQuery(s.clave, ordenPorPrecio(), true)
    end
  end)
  enviandoYo = false
  if not ok then
    error(err, 0)
  end
  -- Sin generación: tras buscar otra cosa o salir, lo que sigue en camino aún tiene que esperar su respuesta. Tras parar
  -- (enVuelo = nil) no hace nada.
  C_Timer.After(Busqueda.ESPERA, function()
    if enVuelo == e then
      ejecutar(sinRespuesta, e)
    end
  end)
end

-- SNF.Compra busca la subasta que el jugador quiere comprar: se la deja pasar (como el escaneo y el sniper).
local function compraBuscando()
  local c = rawget(SNF, "Compra")
  local f = type(c) == "table" and rawget(c, "estado")
  local e = type(f) == "function" and f() or nil
  return type(e) == "table" and e.fase == "buscando"
end

-- ¿Tiene el sniper o el escaneo un navegar en camino? Su AUCTION_HOUSE_BROWSE_RESULTS_UPDATED se tomaría por el de
-- nuestra búsqueda si la lanzáramos ahora.
local function otroEnCamino()
  for _, nombre in ipairs({"Sniper", "Escaneo"}) do
    local m = rawget(SNF, nombre)
    local f = type(m) == "table" and rawget(m, "enCamino")
    if type(f) == "function" and f() == true then
      return true
    end
  end
  return false
end

-- B3r: ¿tiene que esperar la lectura? Como la búsqueda (compraBuscando y otroEnCamino), y además con cualquier compra en pie
-- ('lista', 'confirmar' o 'comprando' también): su búsqueda dejaría en el cliente otro objeto y la compra de la fila marcada
-- ya no encontraría su subasta. Con un navegar del sniper o del escaneo en camino se espera a su respuesta (es de su
-- dueño). Mientras va en camino, el sniper y el escaneo esperan por ella (ocupada()), como con unas subastas.
local function lecturaEspera()
  local c = rawget(SNF, "Compra")
  local f = type(c) == "table" and rawget(c, "estado")
  local e = type(f) == "function" and f() or nil
  if type(e) == "table" and (e.fase == "buscando" or e.fase == "lista" or e.fase == "confirmar" or e.fase == "comprando") then
    return true
  end
  return otroEnCamino()
end

-- Saca lo que espera: primero las subastas de la fila pulsada, después la búsqueda. Nada mientras lo nuestro anterior
-- no haya respondido (su respuesta se confundiría con la nueva), mientras la compra busca ni mientras el sistema
-- limitado no esté libre. La búsqueda tampoco sale con un navegar del sniper o del escaneo en camino: se espera su
-- respuesta (es de su dueño), como mucho ESPERA_VIEJA s desde que el sistema queda libre, igual que un navegar viejo
-- nuestro.
intentar = function()
  if not SNF.Comercio.ventanaVisible() then
    Busqueda.ceder()
    return
  end
  if enVuelo or not SNF.Comercio.activo() then
    return
  end
  -- B3r: la lectura, la última y solo con la búsqueda acabada.
  local accion = (subPendiente and sub and "sub") or pendiente or (saleSub and saleSub.queued and "sale")
    or (shoppingSub and shoppingSub.queued and "shopping") or (lectura and estado == "completa" and "leer")
  if not accion then
    return
  end
  if compraBuscando() or not listo() or (accion == "leer" and lecturaEspera()) then
    mirar()
    return
  end
  if accion == "navegar" and not ajenoVencido and otroEnCamino() then
    if not plazoAjeno then
      plazoAjeno = true
      local n = envios -- si entretanto sale otro envío nuestro, este plazo ya no es de nada
      despues(Busqueda.ESPERA_VIEJA, function()
        if envios == n then
          ajenoVencido = true
          intentar()
        end
      end)
    end
    mirar()
    return
  end
  enviar(accion)
end

-- Tras una página: más páginas o 'completa'.
local function seguir()
  intentos = 0
  if C_AuctionHouse.HasFullBrowseResults() then
    pendiente = nil
    ponerEstado("completa", nil)
    intentar() -- unas subastas que esperan
    return
  end
  pendiente = "mas"
  intentar()
end

---------------------------------------------------------------------------------------------------
-- Eventos (desde la primera búsqueda hasta cerrar la subasta)
---------------------------------------------------------------------------------------------------

local MANEJADORES = {}

MANEJADORES.AUCTION_HOUSE_BROWSE_RESULTS_UPDATED = function()
  local e = enVuelo
  if not (e and e.accion == "navegar") then
    -- No es de lo nuestro. Si la búsqueda esperaba a este navegar del sniper o del escaneo, sale en el fotograma
    -- siguiente, cuando su dueño ya lo ha leído.
    if pendiente == "navegar" then
      despues(0, intentar)
    end
    return
  end
  enVuelo = nil
  if e.vieja or not ultimaMia then
    intentar()
    return
  end
  local lista = C_AuctionHouse.GetBrowseResults()
  filas, porClave = {}, {}
  leerFilas(lista, 1)
  cursor = type(lista) == "table" and #lista or 0
  recibida = true
  avisar()
  seguir()
end

-- Páginas añadidas: las nuestras y, si nuestra búsqueda es la última, también las que pida otro (la lista de Blizzard
-- pide más al bajar): son filas de nuestra búsqueda.
MANEJADORES.AUCTION_HOUSE_BROWSE_RESULTS_ADDED = function(nuevas)
  local e = enVuelo
  if e and e.accion == "mas" then
    enVuelo = nil
    if e.vieja then
      intentar()
      return
    end
  elseif e and e.accion == "navegar" then
    return
  end
  if not (estado == "buscando" and recibida and ultimaMia) then
    intentar()
    return
  end
  if type(nuevas) == "table" then
    leerFilas(nuevas, 1)
    cursor = cursor + #nuevas
  else
    local lista = C_AuctionHouse.GetBrowseResults()
    leerFilas(lista, cursor + 1)
    cursor = type(lista) == "table" and #lista or cursor
  end
  avisar()
  seguir()
end

-- Con el sistema libre otra vez, lo viejo que seguía en camino se suelta, salvo un navegar: su
-- AUCTION_HOUSE_BROWSE_RESULTS_UPDATED puede llegar después del sistema libre y se tomaría por el de la búsqueda nueva.
-- A ese se le espera (su respuesta se tira), como mucho ESPERA_VIEJA s desde el sistema libre. Una página vieja sí se
-- suelta (si llega sin filas no trae evento, y si llega con la nueva en camino se tira igual), y unas subastas viejas
-- también (su respuesta se casa por la itemKey).
MANEJADORES.AUCTION_HOUSE_THROTTLED_SYSTEM_READY = function()
  local e = enVuelo
  if e and e.vieja then
    if e.accion ~= "navegar" then
      enVuelo = nil
    elseif not e.plazoCorto then
      e.plazoCorto = true
      C_Timer.After(Busqueda.ESPERA_VIEJA, function()
        if enVuelo == e then
          ejecutar(sinRespuesta, e)
        end
      end)
    end
  end
  intentar()
end

-- ¿Es la itemKey k la que pedimos (pedida)? Campo a campo; un campo que pedimos a 0 (un id suelto, sin nivel) vale
-- cualquiera: el servidor responde con la clave del equipo, con su nivel y su sufijo.
local function mismaClave(pedida, k)
  if type(k) ~= "table" or k.itemID ~= pedida.itemID then
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

-- La respuesta de unas subastas (o de una lectura): solo si es la que esperamos (si entretanto se pidió otro objeto, se
-- tira). Las mercancías solo traen el itemID; los objetos, la itemKey entera.
local function subastasDe(e, item, clave)
  local pedido = e and ((e.accion == "sub" and e.sub) or (e.accion == "leer" and e.lee)) or nil
  if not (pedido and pedido.item == item) then
    return false
  end
  return clave == nil or mismaClave(e.clave, clave)
end

-- Las subastas de ahora del objeto que tenemos (B6r, punto 12): otra SendSearchQuery del mismo objeto (la de SNF.Compra al
-- elegir una subasta, o la de otro addon) deja en el cliente su lista de ahora. Si la nuestra ya llegó y no espera otra,
-- se vuelve a leer: así lo que se ve es lo mismo con lo que SNF.Compra calcula.
local function alDia(item, clave)
  local s = sub
  if not (s and s.filas and not s.pedida and s.item == item) then
    return false
  end
  if clave == nil then
    leerMercancia(s)
  elseif mismaClave(s.clave, clave) then
    s.claveServidor = copiaClave(clave)
    leerObjeto(s)
  else
    return false
  end
  avisar()
  return true
end

MANEJADORES.COMMODITY_SEARCH_RESULTS_UPDATED = function(itemID)
  local e = enVuelo
  if not subastasDe(e, itemID) then
    alDia(itemID)
    return
  end
  enVuelo = nil
  if not e.vieja and e.accion == "sub" and (e.sub == sub or e.sub == saleSub or e.sub == shoppingSub) then
    leerMercancia(e.sub)
    avisar()
  elseif not e.vieja and e.accion == "leer" and e.lee == lectura then
    leerResumenSeguro(lectura, nil)
    lectura = nil
    alDia(itemID) -- la fila abierta, si es la misma
    avisar()
  end
  intentar()
end

MANEJADORES.ITEM_KEY_ITEM_INFO_RECEIVED = function(itemID)
  if nombresDeClave(itemID) then
    avisar()
  end
end

MANEJADORES.ITEM_SEARCH_RESULTS_UPDATED = function(clave)
  local e = enVuelo
  if type(clave) ~= "table" then
    return
  end
  if not subastasDe(e, clave.itemID, clave) then
    alDia(clave.itemID, clave)
    return
  end
  enVuelo = nil
  if not e.vieja and e.accion == "sub" and (e.sub == sub or e.sub == saleSub or e.sub == shoppingSub) then
    -- La del servidor, solo para leer esta respuesta: los pedidos siguientes van con la pedida.
    e.sub.claveServidor = copiaClave(clave)
    leerObjeto(e.sub)
    avisar()
  elseif not e.vieja and e.accion == "leer" and e.lee == lectura then
    leerResumenSeguro(lectura, copiaClave(clave))
    lectura = nil
    alDia(clave.itemID, clave) -- la fila abierta, si es la misma
    avisar()
  end
  intentar()
end

local oyentes = {}
for evento, fn in pairs(MANEJADORES) do
  oyentes[evento] = function(...)
    ejecutar(fn, ...)
  end
end

local function escuchar(si)
  if si == escuchando then
    return
  end
  escuchando = si
  for evento, fn in pairs(oyentes) do
    if si then
      SNF.Eventos.escuchar(evento, fn)
    else
      SNF.Eventos.dejar(evento, fn)
    end
  end
end

-- Otro addon (o el jugador en la subasta de Blizzard) lanza su SendBrowseQuery: lo que siga llegando es de la suya. Con
-- la nuestra en marcha, se queda 'completa' con lo recibido.
local function otraBusqueda()
  ultimaMia = false
  if estado == "buscando" then
    if enVuelo and enVuelo.accion ~= "sub" then
      enVuelo.vieja = true
    end
    pendiente = nil
    ponerEstado("completa", "ajena")
  end
end

local function enganchar()
  if enganchado or type(hooksecurefunc) ~= "function" or not funcion("SendBrowseQuery") then
    return
  end
  enganchado = true
  hooksecurefunc(C_AuctionHouse, "SendBrowseQuery", function()
    if not enviandoYo and escuchando and SNF.Busqueda == Busqueda then
      ejecutar(otraBusqueda)
    end
  end)
end

---------------------------------------------------------------------------------------------------
-- Interfaz
---------------------------------------------------------------------------------------------------

-- Olvida la búsqueda y las subastas. Lo nuestro que siga en camino se marca como viejo: su respuesta no cuenta.
local function olvidar()
  generacion = generacion + 1
  mirando, avisoProgramado, plazoAjeno, ajenoVencido = false, false, false, false
  filas, porClave, cursor, recibida, ultimaMia = {}, {}, 0, false, false
  pendiente, intentos, sub, subPendiente, texto = nil, 0, nil, false, nil
  saleSub, shoppingSub = nil, nil
  browseFilter = nil
  lectura, resumenes = nil, {}
  if enVuelo then
    enVuelo.vieja = true
  end
end

function Busqueda.buscar(t)
  local limpio = recortar(t)
  if not limpio or not SNF.Comercio.activo() or not SNF.Comercio.ventanaVisible() then
    return false
  end
  local vendor = limpio:match("^vendor:%s*(.+)$")
  local disenchant = limpio:match("^disenchant:%s*(.+)$")
  if limpio:match("^disenchant:") and not disenchant then return false end
  local level, quality, term = limpio:match("^advanced:(%d+):(%d+):%s*(.+)$")
  if limpio:match("^advanced:") and (not term or tonumber(quality) > 8) then return false end
  if limpio:match("^vendor:") and not vendor then return false end
  olvidar()
  texto = term or vendor or disenchant or limpio
  if vendor then browseFilter = {vendor = true}
  elseif disenchant then browseFilter = {disenchant = true}
  elseif term then browseFilter = {level = tonumber(level), quality = tonumber(quality)} end
  pendiente = "navegar"
  local g = guardadas()
  if g then
    ponerArriba(g.recientes, limpio, Busqueda.MAX_RECIENTES)
    copias.recientes = nil
  end
  escuchar(true)
  enganchar()
  estado, motivo = "esperando", nil
  intentar()
  avisar()
  return true
end

function Busqueda.estado()
  return estado
end

function Busqueda.motivo()
  return motivo
end

function Busqueda.ocupada()
  return estado == "esperando" or estado == "buscando" or subPendiente or (saleSub and saleSub.queued == true)
    or (shoppingSub and shoppingSub.queued == true) or enVuelo ~= nil
end

-- True solo mientras corre una llamada nuestra a C_AuctionHouse: los ganchos del sniper la ven y no la cuentan como
-- ajena (ni en la cuenta por minuto, que ya apunta este módulo).
function Busqueda.enviando()
  return enviandoYo
end

function Busqueda.resultados()
  local copia = {}
  for i, f in ipairs(filas) do
    if not f.nombre then
      rellenar(f) -- el juego puede saberlo ya
    end
    local r = resumenes[claveDe(f.clave)]
    local include = true
    if browseFilter then
      if browseFilter.disenchant then
        local estimate = SNF.DisenchantSamples.estimate(f.item)
        include = estimate and f.precioMin and f.precioMin < estimate
      elseif browseFilter.vendor then
        local info = SNF.API.infoObjeto(f.item)
        include = info and info.pv and f.precioMin and f.precioMin < info.pv
      else
        include = (browseFilter.level == 0 or (f.nivel and f.nivel >= browseFilter.level))
          and (browseFilter.quality == 0 or (f.calidad and f.calidad >= browseFilter.quality))
      end
    end
    if include then
      copia[#copia + 1] = {item = f.item, clave = copiaClave(f.clave), nombre = f.nombre, nivel = f.nivel, calidad = f.calidad,
      icono = f.icono, cantidad = f.cantidad, precioMin = f.precioMin,
      resumen = r and {subastas = r.subastas, minimo = r.minimo, disponible = r.disponible, completa = r.completa,
        fallo = r.fallo, hora = r.hora, pendiente = r.pendiente, horaPendiente = r.horaPendiente,
        minimoDudoso = r.minimoDudoso} or nil}
    end
  end
  return copia
end

-- La clave de lo que se pide: un id, un itemKey o una fila de resultados() (con su clave).
local function claveDeEntrada(item)
  if type(item) == "number" then
    local hacer = funcion("MakeItemKey")
    return hacer and copiaClave(hacer(item)) or copiaClave({itemID = item})
  end
  if type(item) == "table" then
    local k = type(item.clave) == "table" and item.clave or item
    if type(k.itemID) == "number" then
      return copiaClave(k)
    end
  end
  return nil
end

-- Solo desde el clic del jugador en una fila. La misma que ya está pedida y sin respuesta no se relanza; una que ya
-- llegó se vuelve a pedir (el jugador la quiere al día) y su lista vieja se queda a la vista hasta que llega la nueva.
function Busqueda.pedirSubastas(item, opciones)
  if not SNF.Comercio.activo() or not SNF.Comercio.ventanaVisible() then
    return false
  end
  local clave = claveDeEntrada(item)
  if not clave then
    return false
  end
  local k = claveDe(clave)
  if type(opciones) == "table" and (opciones.vender or opciones.shopping) then
    local pending = shoppingSub
    if opciones.vender then pending = saleSub end
    if pending and pending.k == k and pending.pedida then return true end
    local snapshot = {k = k, clave = clave, item = clave.itemID, intentos = 0,
      pedida = true, background = true, queued = true}
    if opciones.vender then saleSub = snapshot else shoppingSub = snapshot end
    escuchar(true)
    enganchar()
    intentar()
    return true
  end
  if type(opciones) == "table" and opciones.leer then
    -- B3r: solo leerlo (su resumen). Una ya leída no se vuelve a leer; con otra en camino, no.
    if resumenes[k] then
      return false
    end
    if lectura and lectura.k == k then
      return true
    end
    if lectura and enVuelo and enVuelo.lee == lectura then
      return false
    end
    lectura = {k = k, clave = clave, item = clave.itemID, intentos = 0}
    escuchar(true)
    enganchar()
    intentar()
    return true
  end
  if sub and sub.k == k then
    if sub.pedida then
      return true
    end
    sub.pedida, sub.intentos = true, 0
  else
    sub = {k = k, clave = clave, item = clave.itemID, intentos = 0, pedida = true, completa = false}
  end
  subPendiente = true
  escuchar(true)
  enganchar()
  intentar()
  avisar()
  return true
end

function Busqueda.vivo(item)
  return Vivo.lista[item]
end

function Busqueda.versionVivo()
  return Vivo.version
end

function Busqueda.leyendo()
  return lectura ~= nil
end

function Busqueda.soltarLectura()
  if lectura and not (enVuelo and enVuelo.lee == lectura) then
    lectura = nil
  end
end

-- Solo lee: nunca lanza nada (se puede llamar en cada repintado). Da la lista y {pendiente, completa}.
function Busqueda.subastas(item, mode)
  local snapshot = sub
  if mode == "vender" then snapshot = saleSub elseif mode == "shopping" then snapshot = shoppingSub end
  local clave = claveDeEntrada(item)
  if not (clave and snapshot and snapshot.filas and snapshot.k == claveDe(clave)) then
    return nil
  end
  local copia = {}
  for i, f in ipairs(snapshot.filas) do
    copia[i] = {cantidad = f.cantidad, precioUnidad = f.precioUnidad, puja = f.puja, tiempo = f.tiempo, banda = f.banda,
      vendedor = f.vendedor, mia = f.mia, auctionID = f.auctionID, total = f.total, mercancia = f.mercancia, enlace = f.enlace,
      iguales = f.iguales, propias = f.propias, comprables = f.comprables, cuenta = f.cuenta, paraMinimo = f.paraMinimo,
      dudosa = f.dudosa}
  end
  local info = {pendiente = snapshot.pedida == true, completa = snapshot.completa == true, fallo = snapshot.fallo or nil}
  if mode == "shopping" then info.itemKey = copiaClave(snapshot.claveServidor or snapshot.clave) end
  return copia, info
end

function Busqueda.cancelSale()
  if enVuelo and enVuelo.sub and enVuelo.sub == saleSub then
    enVuelo.vieja = true
  end
  saleSub = nil
end

function Busqueda.cancelShopping()
  if shoppingSub and enVuelo and enVuelo.sub == shoppingSub then
    enVuelo.vieja = true
  end
  shoppingSub = nil
end

-- La pausa de la vista de resultados: como cuando otra búsqueda corta la nuestra (otraBusqueda), pero con motivo 'parada'.
function Busqueda.detener()
  if estado ~= "esperando" and estado ~= "buscando" then
    return false
  end
  if enVuelo and enVuelo.accion ~= "sub" then
    enVuelo.vieja = true -- su respuesta ya no cuenta
  end
  pendiente = nil
  ponerEstado("completa", "parada")
  intentar() -- unas subastas que esperan
  return true
end

function Busqueda.ceder()
  generacion = generacion + 1 -- los temporizadores de antes ya no hacen nada
  mirando, avisoProgramado, plazoAjeno, ajenoVencido = false, false, false, false
  pendiente, subPendiente, lectura, intentos = nil, false, nil, 0
  saleSub, shoppingSub = nil, nil
  if enVuelo then
    enVuelo.vieja = true -- su respuesta ya no cuenta ni se reintenta
  end
  if sub and sub.pedida then
    sub.pedida = false
    if not sub.filas then
      sub.filas, sub.completa, sub.fallo = {}, false, true
    end
  end
  if estado == "esperando" or estado == "buscando" then
    ponerEstado("completa", "parada")
  end
end

function Busqueda.salir()
  olvidar()
  estado, motivo = "parada", nil
  avisar()
end

function Busqueda.parar()
  olvidar()
  Vivo.lista, Vivo.version = {}, 0 -- F1: con la subasta cerrada, la lista ya no es de ahora
  enVuelo = nil -- con la subasta cerrada no llegará nada
  escuchar(false)
  local cambia = estado ~= "parada"
  estado, motivo = "parada", nil
  if cambia and ultimoAviso ~= GetTime() then
    emitir()
  end
end

-- La misma copia mientras no cambie nada: quien la reciba no la cambia.
local function copiaDe(campo)
  local g = guardadas()
  if not g then
    return {}
  end
  local c = copias[campo]
  if not c then
    c = copiaLista(g[campo])
    copias[campo] = c
  end
  return c
end

function Busqueda.recientes()
  return copiaDe("recientes")
end

function Busqueda.favoritas()
  return copiaDe("favoritas")
end

function Busqueda.esFavorita(t)
  local limpio = recortar(t)
  local g = limpio and guardadas()
  if not g then
    return false
  end
  for _, f in ipairs(g.favoritas) do
    if igual(f, limpio) then
      return true
    end
  end
  return false
end

function Busqueda.marcarFavorita(t, si)
  local limpio = recortar(t)
  local g = limpio and guardadas()
  if not g then
    return false
  end
  if si then
    ponerArriba(g.favoritas, limpio, Busqueda.MAX_FAVORITAS)
  else
    for i = #g.favoritas, 1, -1 do
      if igual(g.favoritas[i], limpio) then
        table.remove(g.favoritas, i)
      end
    end
  end
  copias.favoritas = nil
  return true
end
