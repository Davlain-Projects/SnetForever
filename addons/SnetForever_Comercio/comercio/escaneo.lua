-- SnetForever: escaneo en vivo de la subasta (comercio, tarea 10).
--
-- Regla de la prueba real en Forever (13-nov, docs/comercio/2026-11-13-inventario-tsm.md §2i):
--   · C_AuctionHouse.ReplicateItems() da la subasta entera de una vez (194.094 subastas en 21 s). Llega
--     REPLICATE_ITEM_LIST_UPDATE y se lee con GetNumReplicateItems() y GetReplicateItemInfo(i), con i desde 0
--     ([1] nombre, [3] cantidad, [10] precio de compra del montón, [17] itemID). No se sabe si repetirla pronto da error:
--     se usa como mucho una vez cada 15 min (la hora va en SnetForeverCuenta.comercio.ultimaReplica y sobrevive a
--     /reload). Una réplica que llega con 0 filas (el servidor no la repite, o algo falló) no sirve: no se borra nada y
--     se navega por páginas.
--   · Si no toca réplica, SendBrowseQuery vacío y RequestMoreBrowseResults hasta HasFullBrowseResults() (16.732 objetos
--     en 34 páginas y 21 s): el precio mínimo y las unidades de cada objeto.
--
-- Escaneo.iniciar()       empieza un escaneo (o lo refresca si ya acabó). Solo con el comercio activo; si ya está
--                         escaneando o esperando, o si el sniper (tarea 14) está en marcha, no hace nada. Al abrir la subasta empieza solo, tras ESPERA_INICIO
--                         segundos (la subasta de Blizzard hace sus propias búsquedas al abrirse).
-- Escaneo.parar()         lo para (lo llama comercio.lua al cerrar la subasta y si el comercio se apaga). Los datos se
--                         quedan, salvo los de una réplica leída a medias, que se descartan (los objetos vuelven a lo que
--                         tenían antes de esa réplica).
-- Escaneo.ceder()         F13: nuestra ventana se ha escondido: si hay un escaneo en marcha, lo para (como parar: una réplica
--                         leída a medias se descarta) y queda 'parado' con motivo 'otro'. Nada se envía sin la ventana a la
--                         vista (SNF.Comercio.ventanaVisible): lo miran empezar e intentar, también desde un temporizador.
-- Escaneo.estado()        'parado' | 'esperando' (a empezar, o a que el sistema limitado de la subasta quede libre:
--                         otro addon como TSM o Auctionator la acaba de usar) | 'escaneando' | 'completo'.
-- Escaneo.motivo()        por qué espera o se ha parado: 'compra' (el jugador está comprando: SNF.Compra busca la
--                         subasta, espera a que confirme una mercancía o espera al servidor; el escaneo se para entre
--                         páginas, sin perder lo recibido, y sigue solo, mirando cada MIRAR_CADA s, en cuanto la compra
--                         queda «lista», hecha, con error o descartada), 'limitado' (el sistema de la subasta no está
--                         libre), 'ajena' (otro addon o el jugador está buscando; parado: tras VUELTAS vueltas
--                         estropeadas por búsquedas ajenas en esta apertura), 'vacia' (parado: una vuelta de navegar
--                         volvió sin ninguna fila; no se borra nada y al reabrir se repite), 'otro' (F13, parado: nuestra
--                         ventana no está a la vista, porque TSM tiene la subasta o se ve la de Blizzard; no se reintenta
--                         solo: la ventana de comercio llama a Escaneo.iniciar() en cuanto vuelve a verse, y si no, la
--                         siguiente apertura vuelve a mirar. Los datos se quedan con la hora a la que se leyeron), 'busqueda' (el jugador busca en nuestra ventana:
--                         mientras SNF.Busqueda.ocupada(), el escaneo no busca nada; sus búsquedas van dentro de
--                         Escaneo.propia, así que si estropean una vuelta de navegar esta se repite sin contar como
--                         ajena; en cuanto acaba sigue solo, mirando cada MIRAR_CADA s) o nil.
-- Escaneo.enCamino()      tiene un navegar (SendBrowseQuery) enviado y sin respuesta: SNF.Busqueda espera a que llegue
--                         antes de lanzar la suya, para no tomar sus resultados por los suyos.
-- Escaneo.propia(fn, ...) llama a fn(...) y devuelve lo que dé; las búsquedas que haga fn son de SnetForever (el sniper,
--                         tarea 14, y la búsqueda del jugador, comercio/busqueda.lua) y no cuentan como ajenas: ni calma ni vueltas. Si fn falla, el error sale tal cual.
-- Escaneo.datos()         {[item] = {precio, cantidad, hora, origen}}: precio = el precio unitario de compra más bajo (las
--                         subastas de solo puja no cuentan; un objeto que solo tiene pujas no sale), cantidad = todas las
--                         unidades a la venta, hora = segundos del servidor (GetServerTime) en que se LEYÓ, origen =
--                         "replica" (ReplicateItems) o "navegar" (el resumen de SendBrowseQuery). Fallo F1 (en el juego): la
--                         hora no es la de la foto. ReplicateItems da la foto que guarda el servidor (repetida al minuto da
--                         las mismas filas, §2i), de cuándo no se sabe, y el resumen de navegar seguramente es esa misma
--                         foto: ninguno de los dos es «de ahora». El tooltip (ui/tooltip.lua) lo dice así y nunca lo prefiere
--                         a una foto de la app, que sí sabe su hora. Un escaneo completo quita los objetos que ya no están;
--                         uno parado a medias no quita nada. F6, ronda 1: faccion = la de la subasta en la que se leyó
--                         (SNF.Precios.faccionAbierta): SNF.Subasta.foto no enseña lo de otra casa.
-- SNF_COMERCIO_ESCANEO(nuevos, total)   como mucho cada AVISO_CADA s (cada AVISO_REPLICA s mientras se lee una réplica,
--                         para que la ventana no se repinte tanto): nuevos = objetos vistos por primera vez en este
--                         escaneo desde el aviso anterior; total = objetos en datos(). También avisa (con 0 nuevos) al
--                         quedarse esperando y al acabar. Tras parar no sale ningún aviso pendiente.
-- Al acabar una réplica completa guarda SnetForeverCuenta.comercio.ultimoEscaneo = {hora, identidad,
-- muestras = {[item] = {[precio unitario] = unidades}}}: solo mercancías (las que tienen alguna subasta de más de una
-- unidad), como mucho MAX_MUESTRAS objetos (primero los de más precios distintos) y MAX_PRECIOS precios por objeto (los
-- más baratos). La app lo usa para descubrir la casa (tarea 5). Navegar no lo toca: no trae las unidades de cada precio.
-- F6, ronda 1: solo si la subasta es de la facción del jugador (una réplica de la neutral no se guarda: se tomaría por la de
-- su facción). F7: además, cada réplica completa se guarda en SnetForeverCuenta.comercio.escaneos[facción de la subasta] =
-- {hora, identidad = {region, reino, faccion = la del subastador}, jugador = la del personaje, muestras}: una por subasta
-- (la neutral no pisa la de la facción). Con eso la app descubre la casa de cada subasta, también la neutral, y sabe qué
-- facciones tienen personajes (solo un personaje de una facción abre su subasta).
--
-- Sin tirones: la réplica se lee por trozos de POR_TROZO filas, uno por fotograma (C_Timer.After(0)), y el final (quitar
-- lo que ya no está, elegir las muestras) va en trozos de POR_TROZO_FINAL. Antes de cada búsqueda se mira
-- IsThrottledMessageSystemReady(): si no está libre se espera a AUCTION_HOUSE_THROTTLED_SYSTEM_READY (y se vuelve a
-- mirar cada MIRAR_CADA s por si el evento se pierde), sin lanzar búsquedas que se perderían.
-- Búsquedas ajenas (otro addon o el jugador llama a SendBrowseQuery o a RequestMoreBrowseResults): no se busca nada
-- hasta que pasen CALMA segundos sin ellas. Una SendBrowseQuery ajena a mitad de navegar estropea la vuelta (las páginas
-- siguientes serían de su búsqueda): se deja (lo recibido se queda) y, pasada la calma, se vuelve a navegar desde el
-- principio, como mucho VUELTAS veces por apertura de la subasta; después, 'parado' con motivo 'ajena'. Tras una
-- búsqueda con texto (el jugador buscando en «Comprar», o un addon), no se navega mientras la lista de resultados de
-- Blizzard (AuctionHouseFrame.BrowseResultsFrame) esté a la vista ni durante JUGADOR_RECIENTE s: navegar la sustituiría
-- por la subasta entera. Las páginas que llegan sin haber pedido nada solo se aceptan si son de nuestra búsqueda.
--
-- Dormido hasta abrir la subasta: al cargar solo escucha el mensaje interno SNF_COMERCIO_ABIERTA. Los eventos de la
-- subasta se escuchan mientras hay un escaneo en marcha. Todo el trabajo pasa por SNF.Comercio.ejecutar. No llama a
-- ninguna función protegida.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Escaneo = {}
SNF.Escaneo = Escaneo

Escaneo.ESPERA_INICIO = 1 -- s tras abrir la subasta antes de la primera búsqueda
Escaneo.REPLICA_CADA = 900 -- s mínimos entre dos ReplicateItems
Escaneo.POR_TROZO = 2000 -- filas de la réplica por fotograma
Escaneo.POR_TROZO_FINAL = 4000 -- objetos por fotograma al acabar (quitar lo que ya no está, elegir muestras)
Escaneo.AVISO_CADA = 0.5 -- s mínimos entre dos SNF_COMERCIO_ESCANEO
Escaneo.AVISO_REPLICA = 2 -- ídem mientras se lee una réplica
Escaneo.ESPERA_REPLICA = 60 -- s sin respuesta a ReplicateItems antes de navegar por páginas
Escaneo.ESPERA_PAGINA = 20 -- s sin respuesta a una página antes de pedirla otra vez
Escaneo.REINTENTOS = 3 -- veces que se vuelve a pedir una página sin respuesta
Escaneo.MIRAR_CADA = 1 -- s entre dos miradas al sistema limitado mientras se espera
Escaneo.CALMA = 5 -- s sin búsquedas ajenas antes de buscar
Escaneo.VUELTAS = 2 -- vueltas de navegar que se repiten solas por apertura tras una búsqueda ajena
Escaneo.JUGADOR_RECIENTE = 60 -- s tras una búsqueda ajena con texto en que no se navega
Escaneo.MAX_MUESTRAS = 300
Escaneo.MAX_PRECIOS = 10

local floor = math.floor

local estado = "parado"
local datos = {}
local total = 0 -- objetos en datos
local generacion = 0 -- cambia al empezar y al parar: los temporizadores de antes ya no hacen nada
local modo = nil -- "replica" | "navegar"
local pendiente = nil -- la búsqueda que espera al sistema: "replica" | "navegar" | "mas"
local propio = false -- el sistema está ocupado por la respuesta propia que acaba de llegar (aún no es «esperar»)
local avisadaEspera = false
local mirando = false
local enVuelo = nil -- {accion, id}: búsqueda enviada que aún no ha respondido
local envios = 0
local intentos = 0
local acum = nil -- [item] = {precio, cantidad, precios = {[unidad] = n}, apilado}: lo de este escaneo
local vistos = nil -- [item] = true: visto en este escaneo
local cursor = 0 -- réplica: siguiente índice; navegar: filas ya leídas
local navegando = false -- esta vuelta de navegar ya envió su SendBrowseQuery
local leyendo = false -- se está leyendo una réplica
local previos = nil -- réplica a medias: [item] = {precio, cantidad, hora, origen} de antes, o false si el objeto es nuevo
local cerrando = false -- se ha visto la subasta entera y se está acabando (por trozos)
local calmaHasta = nil -- GetTime() hasta el que no se busca nada (búsqueda ajena reciente)
local motivo = nil -- ver Escaneo.motivo()
local vueltas = 0 -- vueltas de navegar repetidas solas en esta apertura
local ultimaConTexto = nil -- GetTime() de la última búsqueda ajena con texto en esta apertura
local propiaActiva = 0 -- > 0 mientras corre Escaneo.propia
local escuchando = false
local enganchado = false
local enviandoYo = false
local nuevosAviso = 0
local ultimoAviso = nil
local avisoProgramado = false

local function ejecutar(fn, ...)
  return SNF.Comercio.ejecutar("escaneo", fn, ...)
end

local function subasta()
  local ah = rawget(_G, "C_AuctionHouse")
  return type(ah) == "table" and ah or nil
end

local function funcion(nombre)
  local ah = subasta()
  local f = ah and rawget(ah, nombre)
  return type(f) == "function" and f or nil
end

local function ahora()
  return SNF.API.horaServidor() or 0
end

local function guardadoComercio()
  SNF.Guardado.preparar()
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  return type(c) == "table" and c or nil
end

-- Llama a fn dentro de ejecutar pasados `segundos`, si entretanto no se ha parado ni empezado otro escaneo.
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

local function emitirAviso()
  ultimoAviso = GetTime()
  local n = nuevosAviso
  nuevosAviso = 0
  SNF.Eventos.emitir("SNF_COMERCIO_ESCANEO", n, total)
end

-- Suma `n` nuevos y avisa ya o, si el último aviso fue hace menos del intervalo, en cuanto se cumpla (con lo último).
-- El aviso aplazado es de esta generación: si entretanto se para (o acaba) el escaneo, no sale.
local function avisar(n)
  nuevosAviso = nuevosAviso + (n or 0)
  local intervalo = leyendo and Escaneo.AVISO_REPLICA or Escaneo.AVISO_CADA
  local pasado = ultimoAviso and (GetTime() - ultimoAviso) or intervalo
  if pasado >= intervalo - 1e-6 then
    emitirAviso()
  elseif not avisoProgramado then
    avisoProgramado = true
    despues(intervalo - pasado, function()
      avisoProgramado = false
      emitirAviso()
    end)
  end
end

---------------------------------------------------------------------------------------------------
-- Datos
---------------------------------------------------------------------------------------------------

-- Pone el objeto en datos y devuelve 1 si es la primera vez que se ve en este escaneo. Mientras se lee una réplica se
-- apunta lo que tenía antes (para descartar lo parcial si se para a medias). origen: "replica" | "navegar" (F1).
-- F6, ronda 1: cada dato lleva la facción de la subasta en la que se leyó (faccion, la de su subastador:
-- SNF.Precios.faccionAbierta), para que lo de una casa no salga en otra (SNF.Subasta.foto lo mira).
local function poner(item, precio, cantidad, hora, origen)
  local d = datos[item]
  if previos and previos[item] == nil then
    previos[item] = d and {d.precio, d.cantidad, d.hora, d.origen, d.faccion} or false
  end
  if not d then
    d = {}
    datos[item] = d
    total = total + 1
  end
  d.precio, d.cantidad, d.hora, d.origen = precio, cantidad, hora, origen
  d.faccion = SNF.Precios.faccionAbierta and SNF.Precios.faccionAbierta() or nil
  if vistos[item] then
    return 0
  end
  vistos[item] = true
  return 1
end

-- Réplica parada a medias: cada objeto vuelve a lo que tenía antes; los que no estaban, fuera.
local function descartarParcial()
  for item, antes in pairs(previos) do
    if antes then
      local d = datos[item]
      if d then
        d.precio, d.cantidad, d.hora, d.origen, d.faccion = antes[1], antes[2], antes[3], antes[4], antes[5]
      end
    elseif datos[item] then
      datos[item] = nil
      total = total - 1
    end
  end
  previos = nil
end

---------------------------------------------------------------------------------------------------
-- Eventos de la subasta (solo mientras hay un escaneo en marcha)
---------------------------------------------------------------------------------------------------

local manejadores = {}

local function escuchar()
  if escuchando then
    return
  end
  escuchando = true
  for evento, fn in pairs(manejadores) do
    SNF.Eventos.escuchar(evento, fn)
  end
end

local function dejar()
  if not escuchando then
    return
  end
  escuchando = false
  for evento, fn in pairs(manejadores) do
    SNF.Eventos.dejar(evento, fn)
  end
end

local function reiniciarMarcha()
  generacion = generacion + 1
  enVuelo, pendiente, propio, avisadaEspera, mirando, avisoProgramado = nil, nil, false, false, false, false
  acum, vistos, cursor, intentos = nil, nil, 0, 0
  navegando, leyendo, previos, cerrando, motivo = false, false, nil, false, nil
end

---------------------------------------------------------------------------------------------------
-- Fin del escaneo
---------------------------------------------------------------------------------------------------

-- porque: el motivo con que se queda (al pararse por búsquedas ajenas o por una vuelta vacía).
local function acabar(completo, porque)
  reiniciarMarcha()
  dejar()
  estado = completo and "completo" or "parado"
  motivo = porque
  avisar(0)
end

-- Las muestras de mercancías para ultimoEscaneo a partir de los grupos {[nº de precios] = {item, ...}}.
local function guardarMuestras(porPrecios, maxN)
  local muestras, quedan, hay = {}, Escaneo.MAX_MUESTRAS, false
  for n = maxN, 1, -1 do
    local lista = porPrecios[n]
    if lista and quedan > 0 then
      if #lista > quedan then
        table.sort(lista) -- a igual nº de precios, primero los id más bajos
      end
      for i = 1, math.min(#lista, quedan) do
        local item = lista[i]
        local precios = acum[item].precios
        local orden = {}
        for unidad in pairs(precios) do
          orden[#orden + 1] = unidad
        end
        table.sort(orden)
        local fila = {}
        for k = 1, math.min(#orden, Escaneo.MAX_PRECIOS) do
          fila[orden[k]] = precios[orden[k]]
        end
        muestras[item] = fila
        hay = true
      end
      quedan = quedan - math.min(#lista, quedan)
    end
  end
  local g = hay and guardadoComercio()
  -- F6, ronda 1: la app descubre con esto la casa de «<reino>|<facción del jugador>»; una réplica de otra casa (la neutral)
  -- no se guarda, para que no se tome por la de su facción.
  local identidad = SNF.Precios.identidad()
  local abierta = SNF.Precios.faccionAbierta and SNF.Precios.faccionAbierta() or nil
  if g and (abierta == nil or abierta == identidad.faccion) then
    g.ultimoEscaneo = {hora = ahora(), identidad = identidad, muestras = muestras}
  end
  -- F7: y aparte, una por subasta, con la facción de su subastador (la app descubre así la casa neutral).
  local casa = abierta or identidad.faccion
  if g and type(casa) == "string" then
    if type(g.escaneos) ~= "table" then
      g.escaneos = {}
    end
    g.escaneos[casa] = {hora = ahora(), jugador = identidad.faccion, muestras = muestras,
      identidad = {region = identidad.region, reino = identidad.reino, faccion = casa}}
  end
end

-- Se ha visto la subasta entera: quita lo que ya no está y, tras una réplica, elige las muestras. Todo por trozos de
-- POR_TROZO_FINAL, uno por fotograma, para que el final no dé tirón; el estado sigue 'escaneando' hasta acabar.
local function finalizar()
  leyendo, previos, cerrando = false, nil, true
  enVuelo, pendiente = nil, nil
  local fase = "quitar"
  local clave = nil -- por dónde va el recorrido (next) de la fase
  local porPrecios, maxN = {}, 0
  local function paso()
    local presupuesto = Escaneo.POR_TROZO_FINAL
    if fase == "quitar" then
      -- Borrar el campo que se acaba de visitar está permitido durante el recorrido (nadie añade campos mientras).
      while presupuesto > 0 do
        clave = next(datos, clave)
        if clave == nil then
          break
        end
        if not vistos[clave] then
          datos[clave] = nil
          total = total - 1
        end
        presupuesto = presupuesto - 1
      end
      if clave ~= nil then
        despues(0, paso)
        return
      end
      if modo ~= "replica" then
        acabar(true)
        return
      end
      fase = "muestras"
    end
    -- fase «muestras»: agrupa las mercancías por nº de precios distintos.
    while presupuesto > 0 do
      local a
      clave, a = next(acum, clave)
      if clave == nil then
        break
      end
      if a.apilado and a.precios then
        local n = 0
        for _ in pairs(a.precios) do
          n = n + 1
        end
        local lista = porPrecios[n]
        if not lista then
          lista = {}
          porPrecios[n] = lista
        end
        lista[#lista + 1] = clave
        if n > maxN then
          maxN = n
        end
      end
      presupuesto = presupuesto - 1
    end
    if clave ~= nil then
      despues(0, paso)
      return
    end
    guardarMuestras(porPrecios, maxN)
    acabar(true)
  end
  paso()
end

---------------------------------------------------------------------------------------------------
-- Búsquedas
---------------------------------------------------------------------------------------------------

local intentar -- (se define abajo)

local function listo()
  local f = funcion("IsThrottledMessageSystemReady")
  if not f then
    return true
  end
  return f() and true or false
end

local function ponerEsperando(porque)
  propio = false
  if estado ~= "esperando" or not avisadaEspera or motivo ~= porque then
    estado = "esperando"
    motivo = porque
    avisadaEspera = true
    avisar(0)
  end
end

local function enCalma()
  return calmaHasta == nil or GetTime() >= calmaHasta
end

-- ¿Se ve la lista de resultados de «Comprar» de Blizzard? Protegido: si el marco no está o cambia, no se ve.
local function listaDeBlizzardALaVista()
  local f = rawget(_G, "AuctionHouseFrame")
  if f == nil then
    return false
  end
  local ok, visible = pcall(function()
    local r = f.BrowseResultsFrame
    return r ~= nil and r:IsVisible()
  end)
  return ok and visible == true
end

-- Tras una búsqueda ajena con texto, navegar sustituiría su lista: no mientras sea reciente o la lista se vea.
local function listaDelJugador()
  if not ultimaConTexto then
    return false
  end
  return GetTime() - ultimaConTexto < Escaneo.JUGADOR_RECIENTE or listaDeBlizzardALaVista()
end

-- Fases de SNF.Compra en que el escaneo no busca: la compra busca su subasta, espera a que se confirme una mercancía o
-- espera al servidor. Con la compra «lista» sí busca (el jugador puede tardar en decidirse).
local COMPRA_OCUPADA = {buscando = true, confirmar = true, comprando = true}

local function compraOcupada()
  local c = rawget(SNF, "Compra")
  local f = type(c) == "table" and rawget(c, "estado")
  local e = type(f) == "function" and f() or nil
  return type(e) == "table" and COMPRA_OCUPADA[e.fase] == true
end

-- El jugador busca en nuestra ventana (comercio/busqueda.lua): su búsqueda manda y el escaneo espera.
local function busquedaOcupada()
  local b = rawget(SNF, "Busqueda")
  local f = type(b) == "table" and rawget(b, "ocupada")
  return type(f) == "function" and f() == true
end

-- Lo que impide enviar ahora la búsqueda pendiente: 'compra', 'busqueda', 'ajena', 'limitado' o nil.
local function bloqueo()
  if compraOcupada() then
    return "compra"
  end
  if busquedaOcupada() then
    return "busqueda"
  end
  if not enCalma() or (pendiente == "navegar" and listaDelJugador()) then
    return "ajena"
  end
  if not listo() then
    return "limitado"
  end
  return nil
end

local function mirar()
  if mirando then
    return
  end
  mirando = true
  despues(Escaneo.MIRAR_CADA, function()
    mirando = false
    if not pendiente or enVuelo then
      return
    end
    if not SNF.Comercio.ventanaVisible() then
      intentar() -- F13: se para aquí; no se sigue mirando con la ventana escondida
      return
    end
    local b = bloqueo()
    if not b then
      intentar()
      return
    end
    -- Ni la respuesta propia lo explica ya: otro addon está usando la subasta.
    ponerEsperando(b)
    mirar()
  end)
end

local function sinRespuesta(id, accion)
  if not enVuelo or enVuelo.id ~= id then
    return
  end
  enVuelo = nil
  if accion == "replica" then
    modo = "navegar"
    pendiente = "navegar"
    intentar()
    return
  end
  intentos = intentos + 1
  if intentos > Escaneo.REINTENTOS then
    acabar(false)
    return
  end
  pendiente = accion
  intentar()
end

local function enviar(accion)
  envios = envios + 1
  local id = envios
  enVuelo = {accion = accion, id = id}
  pendiente, propio, avisadaEspera, motivo = nil, false, false, nil
  estado = "escaneando"
  if accion == "replica" then
    local g = guardadoComercio()
    if g then
      g.ultimaReplica = ahora()
    end
  elseif accion == "navegar" then
    cursor = 0
    navegando = true
  end
  SNF.Comercio.apuntarBusqueda() -- la cuenta por minuto que comparte con el sniper
  enviandoYo = true
  local ok, err = pcall(function()
    if accion == "replica" then
      C_AuctionHouse.ReplicateItems()
    elseif accion == "navegar" then
      -- filters e itemClassFilters, aunque vacíos: sin ellos WoW Forever devuelve la búsqueda sin ninguna fila (14-nov).
      C_AuctionHouse.SendBrowseQuery({searchString = "", sorts = {}, filters = {}, itemClassFilters = {}})
    else
      C_AuctionHouse.RequestMoreBrowseResults()
    end
  end)
  enviandoYo = false
  if not ok then
    error(err, 0)
  end
  despues(accion == "replica" and Escaneo.ESPERA_REPLICA or Escaneo.ESPERA_PAGINA, function()
    sinRespuesta(id, accion)
  end)
end

intentar = function()
  if not pendiente or enVuelo or not SNF.Comercio.activo() then
    return
  end
  if not SNF.Comercio.ventanaVisible() then
    Escaneo.ceder()
    return
  end
  local b = bloqueo()
  if not b then
    enviar(pendiente)
    return
  end
  if b == "ajena" or b == "busqueda" or not propio then
    ponerEsperando(b)
  end
  mirar()
end

local function pedir(accion)
  pendiente = accion
  intentar()
end

-- Una vuelta nueva de navegar. Los vistos se conservan al repetir una vuelta estropeada (así los objetos ya avisados no
-- vuelven a contar como nuevos); acum empieza de cero para no sumar dos veces.
local function empezarNavegar()
  modo = "navegar"
  acum, vistos, cursor, intentos = {}, vistos or {}, 0, 0
  navegando, leyendo, previos = false, false, nil
  pedir("navegar")
end

---------------------------------------------------------------------------------------------------
-- Réplica
---------------------------------------------------------------------------------------------------

local function leerTrozo()
  local n = C_AuctionHouse.GetNumReplicateItems() or 0
  if cursor == 0 and n == 0 then
    -- La réplica no sirvió (0 filas): no se borra nada y se navega por páginas.
    propio = true -- el sistema aún puede estar ocupado con la respuesta vacía
    empezarNavegar()
    return
  end
  local hasta = math.min(n, cursor + Escaneo.POR_TROZO)
  local tocados = {}
  for i = cursor, hasta - 1 do
    local _, _, cuenta, _, _, _, _, _, _, compra, _, _, _, _, _, _, item = C_AuctionHouse.GetReplicateItemInfo(i)
    if type(item) == "number" and type(cuenta) == "number" and cuenta > 0 then
      local a = acum[item]
      if not a then
        a = {cantidad = 0}
        acum[item] = a
      end
      a.cantidad = a.cantidad + cuenta
      if cuenta > 1 then
        a.apilado = true
      end
      if type(compra) == "number" and compra > 0 then
        local unidad = floor(compra / cuenta + 0.5)
        if not a.precio or unidad < a.precio then
          a.precio = unidad
        end
        local p = a.precios
        if not p then
          p = {}
          a.precios = p
        end
        p[unidad] = (p[unidad] or 0) + cuenta
      end
      tocados[item] = true
    end
  end
  cursor = hasta
  local t, nuevos = ahora(), 0
  for item in pairs(tocados) do
    local a = acum[item]
    if a.precio then
      nuevos = nuevos + poner(item, a.precio, a.cantidad, t, "replica") -- t: la hora de lectura, no la de la foto (F1)
    end
  end
  if nuevos > 0 then
    avisar(nuevos)
  end
  if cursor >= n then
    finalizar()
  else
    despues(0, leerTrozo)
  end
end

manejadores.REPLICATE_ITEM_LIST_UPDATE = function()
  ejecutar(function()
    if not (enVuelo and enVuelo.accion == "replica") then
      return -- no la hemos pedido nosotros (o ya se está leyendo)
    end
    enVuelo = nil
    cursor = 0
    leyendo, previos = true, {}
    leerTrozo()
  end)
end

---------------------------------------------------------------------------------------------------
-- Navegar
---------------------------------------------------------------------------------------------------

-- Lee las filas desde..#filas: {itemKey = {itemID}, minPrice, totalQuantity}. Varias filas del mismo objeto (otro
-- nivel u otra clave) se juntan: el precio más bajo y la suma de unidades.
local function leerFilas(filas, desde)
  if type(filas) ~= "table" then
    return
  end
  local t, nuevos = ahora(), 0
  for i = desde, #filas do
    local f = filas[i]
    local clave = type(f) == "table" and f.itemKey
    local item = type(clave) == "table" and clave.itemID
    local precio, cantidad = type(f) == "table" and f.minPrice, type(f) == "table" and f.totalQuantity
    if type(item) == "number" and type(precio) == "number" and precio > 0 then
      cantidad = type(cantidad) == "number" and cantidad or 0
      local a = acum[item]
      if a then
        a.precio = math.min(a.precio, precio)
        a.cantidad = a.cantidad + cantidad
      else
        a = {precio = precio, cantidad = cantidad}
        acum[item] = a
      end
      nuevos = nuevos + poner(item, a.precio, a.cantidad, t, "navegar")
    end
  end
  if nuevos > 0 then
    avisar(nuevos)
  end
end

local function seguirNavegando()
  intentos = 0
  if C_AuctionHouse.HasFullBrowseResults() then
    if cursor == 0 and next(acum) == nil then
      -- Ninguna fila: la subasta nunca está vacía, así que la búsqueda no sirvió. No se borra nada y se dice.
      acabar(false, "vacia")
      return
    end
    finalizar()
    return
  end
  propio = true -- el sistema aún está ocupado con la respuesta que acaba de llegar
  pedir("mas")
end

manejadores.AUCTION_HOUSE_BROWSE_RESULTS_UPDATED = function()
  ejecutar(function()
    if not (enVuelo and enVuelo.accion == "navegar") then
      return
    end
    enVuelo = nil
    local filas = C_AuctionHouse.GetBrowseResults()
    leerFilas(filas, 1)
    cursor = type(filas) == "table" and #filas or 0
    seguirNavegando()
  end)
end

-- Páginas añadidas: solo si nuestra SendBrowseQuery es la última (una ajena estropea la vuelta y la deja). Se aceptan
-- aunque las haya pedido otro (la lista de Blizzard pide más al bajar): son filas de nuestra búsqueda y no se pierden.
manejadores.AUCTION_HOUSE_BROWSE_RESULTS_ADDED = function(nuevas)
  ejecutar(function()
    if not (modo == "navegar" and navegando and acum and not cerrando) then
      return
    end
    if enVuelo and enVuelo.accion == "mas" then
      enVuelo = nil
    end
    if type(nuevas) == "table" then
      leerFilas(nuevas, 1)
      cursor = cursor + #nuevas
    else
      local filas = C_AuctionHouse.GetBrowseResults()
      leerFilas(filas, cursor + 1)
      cursor = type(filas) == "table" and #filas or cursor
    end
    seguirNavegando()
  end)
end

manejadores.AUCTION_HOUSE_THROTTLED_SYSTEM_READY = function()
  ejecutar(function()
    if pendiente then
      intentar()
    end
  end)
end

-- Otro addon (o el jugador) lanza su propia búsqueda. Mientras haya escaneo en marcha, no buscamos hasta que pasen CALMA
-- segundos sin búsquedas ajenas. Si ya íbamos navegando, lo que siga llegando sería de la suya: se deja esta vuelta (lo
-- recibido se queda) y, pasada la calma, se navega otra vez desde el principio. Si aún no habíamos enviado nada, seguimos
-- esperando sin más.
local function conTexto(consulta)
  return type(consulta) == "table" and type(consulta.searchString) == "string" and consulta.searchString ~= ""
end

-- nombre: "SendBrowseQuery" | "RequestMoreBrowseResults"; consulta: lo que se le pasó a SendBrowseQuery.
local function otraBusqueda(nombre, consulta)
  if enviandoYo or not escuchando or cerrando then
    return
  end
  local nuestra = propiaActiva > 0 -- de otro módulo de SnetForever (Escaneo.propia)
  if not nuestra then
    calmaHasta = GetTime() + Escaneo.CALMA
    if nombre == "SendBrowseQuery" and conTexto(consulta) then
      ultimaConTexto = GetTime()
    end
  end
  if nombre == "SendBrowseQuery" and modo == "navegar" and navegando and acum then
    -- Nuestra vuelta queda estropeada: lo que siga llegando es de la otra búsqueda.
    enVuelo = nil
    if not nuestra then
      vueltas = vueltas + 1
      if vueltas > Escaneo.VUELTAS then
        acabar(false, "ajena")
        return
      end
    end
    empezarNavegar()
  elseif pendiente then
    intentar()
  end
end

local function enganchar()
  if enganchado or type(hooksecurefunc) ~= "function" then
    return
  end
  enganchado = true
  for _, nombre in ipairs({"SendBrowseQuery", "RequestMoreBrowseResults"}) do
    if funcion(nombre) then
      hooksecurefunc(C_AuctionHouse, nombre, function(consulta)
        if not enviandoYo then
          ejecutar(otraBusqueda, nombre, consulta)
        end
      end)
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Interfaz
---------------------------------------------------------------------------------------------------

-- La réplica de hace menos de REPLICA_CADA (guardada en la cuenta: sobrevive a /reload). Un valor que no es un número,
-- o en el futuro, no cuenta.
local function replicaReciente()
  local g = guardadoComercio()
  local antes = g and g.ultimaReplica
  local t = ahora()
  return type(antes) == "number" and t - antes >= 0 and t - antes < Escaneo.REPLICA_CADA
end

-- F13: sin nuestra ventana a la vista no se empieza: cualquier petición le quitaría el turno a TSM. No se reintenta solo.
local function empezar()
  if not SNF.Comercio.ventanaVisible() then
    reiniciarMarcha()
    dejar()
    estado = "parado"
    motivo = "otro" -- después de reiniciarMarcha, que borra el motivo
    return
  end
  if funcion("ReplicateItems") and not replicaReciente() then
    modo = "replica"
    acum, vistos, cursor, intentos = {}, {}, 0, 0
    pedir("replica")
  else
    empezarNavegar()
  end
end

-- Deja el escaneo listo para empezar: generación nueva, «esperando», eventos de la subasta y gancho.
local function preparar()
  reiniciarMarcha()
  nuevosAviso = 0
  estado = "esperando"
  escuchar()
  enganchar()
end

-- Con el sniper en marcha no se relanza: él ya está usando la búsqueda general y las dos se pisarían (el sniper, a su
-- vez, no busca mientras este escaneo está en marcha). Mientras tanto datos() no se refresca: la ventana avisa de que
-- la lista enseña la última lectura.
local function sniperEnMarcha()
  local s = rawget(SNF, "Sniper")
  local f = type(s) == "table" and rawget(s, "activo")
  return type(f) == "function" and f() == true
end

function Escaneo.iniciar()
  if not SNF.Comercio.activo() or estado == "escaneando" or estado == "esperando" or sniperEnMarcha() then
    return
  end
  vueltas = 0
  preparar()
  empezar()
end

function Escaneo.parar()
  if previos then
    descartarParcial()
  end
  reiniciarMarcha()
  dejar()
  nuevosAviso = 0
  estado = "parado"
end

function Escaneo.ceder()
  if estado ~= "esperando" and estado ~= "escaneando" then
    return
  end
  Escaneo.parar()
  motivo = "otro"
end

function Escaneo.estado()
  return estado
end

function Escaneo.enCamino()
  return enVuelo ~= nil and enVuelo.accion == "navegar"
end

function Escaneo.motivo()
  return motivo
end

local function salirDePropia(ok, ...)
  propiaActiva = propiaActiva - 1
  if not ok then
    error((...), 0)
  end
  return ...
end

function Escaneo.propia(fn, ...)
  propiaActiva = propiaActiva + 1
  return salirDePropia(pcall(fn, ...))
end

function Escaneo.datos()
  return datos
end

SNF.Eventos.escuchar("SNF_COMERCIO_ABIERTA", function()
  ejecutar(function()
    -- Si alguien ha puesto otro módulo en SNF.Escaneo (las pruebas de la ventana), este se queda dormido.
    if SNF.Escaneo ~= Escaneo or not SNF.Comercio.activo() then
      return
    end
    vueltas, ultimaConTexto = 0, nil
    preparar()
    despues(Escaneo.ESPERA_INICIO, empezar)
  end)
end)
