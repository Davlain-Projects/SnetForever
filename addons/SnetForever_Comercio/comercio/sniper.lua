-- SnetForever: sniper de la subasta (comercio, tarea 14). Es donde el jugador hace la mayoría de sus compras
-- (docs/comercio/2026-11-13-inventario-tsm.md §2j y §2j-bis).
--
-- Mientras corre, repite la búsqueda general de la subasta, como el escaneo al navegar: SendBrowseQuery vacío y
-- RequestMoreBrowseResults hasta HasFullBrowseResults() (en Forever, 16.732 objetos en 34 páginas y 21 s). Cada fila
-- trae el precio más bajo de un objeto (su itemKey). Lo nuevo (un objeto que no había visto) o más barato que la última
-- vez se mira con la regla de sniper del grupo del objeto (SNF.Reglas.evaluar(..., 'sniper'): el primer grupo que lo
-- tiene, los propios primero; sin grupo, la plantilla) y, si es buena compra, entra en la lista de hallazgos. Entre una
-- vuelta acabada y la siguiente espera comercioSniperCada segundos. F9p: un hallazgo de una mercancía lleva
-- rotacionSinConfirmar (ver Reglas.evaluar); entra igual, pero no se presenta como prueba de que se venda.
--
-- Fallo F1 (ronda 2, decisión del coordinador): la excepción a «una réplica nunca gana a la foto de la app». El resto del
-- addon (tooltip, lista de ofertas, IA y reglas de compra) mira los precios de ahora con SNF.Subasta.foto, donde el escaneo
-- solo cuenta sin foto de la app, porque no se sabe de cuándo es. El sniper no: juzga con la regla de sniper el resumen de la
-- búsqueda general (minPrice y totalQuantity de cada fila) tal cual, porque es la única forma que tiene de ver precios nuevos
-- (con la foto de la app no vería nunca un hallazgo). No es peligroso: comprar un hallazgo pasa siempre por SNF.Compra, que
-- vuelve a leer la lista de verdad de ese objeto y nunca paga más que el precio de la fila. Lo que sí hace, como las demás
-- tablas: cada hallazgo lleva la hora a la que se leyó su fila (hora), y la tabla del sniper la enseña con su fuente
-- («navegar 14:32», ui/subasta/sniper.lua).
--
-- Fase 3 de la paridad con TSM: con comercioSniperModo = «operaciones» no se mira la regla de sniper sino la operación de
-- Sniper del grupo del objeto (Operaciones.aplicable: herencia y listas «Ignorar…»; sin grupo, la del Grupo Base) y el
-- hallazgo es lo que no pasa de su «Precio máximo» (Operaciones.cobre). Sin operación, con la operación ignorada aquí, con
-- la fórmula rota o sin valor, con variantes del objeto en otro grupo o con una mascota, no hay hallazgo: nunca se vuelve
-- al porcentaje. Lo que no se ha elegido («regla», también para lo guardado antes) sigue como siempre. El hallazgo lleva
-- su operación y su ruta; elegirlo lo vuelve a mirar (Sniper.vigente) y SNF.Compra lo mira otra vez con la cotización y
-- antes de cada clic que compra (motivo «operacion»).
--
-- Nunca compra. Elegir un hallazgo (Sniper.elegir) prepara su compra con SNF.Compra.elegir, que pausa el sniper; la
-- compra solo la hace el botón Comprar de la barra, con el clic del jugador. El sniper solo se para mientras la compra
-- busca su subasta, espera a que se confirme una mercancía o espera al servidor ('buscando', 'confirmar', 'comprando'):
-- en cuanto queda «lista», «hecho», da error o se descarta, sigue solo. Lo comprado sale de la lista.
--
-- No estorba a nadie:
--   · Escaneo: nunca buscan los dos a la vez. Mientras el escaneo está en marcha ('esperando' o 'escaneando'), el
--     sniper espera (motivo 'escaneo'); y mientras el sniper corre, Escaneo.iniciar() no hace nada. Las búsquedas del
--     sniper van dentro de Escaneo.propia, así que el escaneo no las cuenta como ajenas.
--   · La búsqueda del jugador (comercio/busqueda.lua): mientras SNF.Busqueda.ocupada(), el sniper no busca (motivo
--     'busqueda'), para que no se cuele una página suya en la búsqueda; en cuanto acaba sigue solo, mirando cada
--     MIRAR_CADA s. Sus búsquedas no cuentan como ajenas (SNF.Busqueda.enviando()): ni calma, ni JUGADOR, ni otra vez
--     en la cuenta por minuto (ya las apunta ella).
--   · Otro addon o el jugador: hay ganchos (hooksecurefunc) en SendBrowseQuery, RequestMoreBrowseResults y
--     SendSearchQuery. Tras una búsqueda ajena no se busca en CALMA s; tras una SendBrowseQuery ajena con texto (el
--     jugador buscando en la subasta de Blizzard), en JUGADOR s, para no taparle su lista. Una SendBrowseQuery ajena a
--     mitad de vuelta la estropea (las páginas siguientes serían de su búsqueda): se deja y, pasada la espera, se
--     empieza otra. Las búsquedas del escaneo y de SNF.Compra no cuentan como ajenas.
--   · El cliente: antes de cada búsqueda se mira IsThrottledMessageSystemReady() (si no está libre se espera a
--     AUCTION_HOUSE_THROTTLED_SYSTEM_READY, y se vuelve a mirar cada MIRAR_CADA s) y que no haya ya POR_MINUTO
--     búsquedas en el último minuto (el cliente admite unas 100). La cuenta es la de Comercio.apuntarBusqueda: las
--     del escaneo, las del sniper y las ajenas que se ven.
--
-- Sniper.empezar() -> boolean    empieza (solo con el comercio activo). La lista de hallazgos se conserva.
-- Sniper.parar()                 para (lo llama comercio.lua al cerrar la subasta y si el comercio se apaga).
-- Sniper.ceder()                 F13: nuestra ventana se ha escondido: si corre, se para y no vuelve solo (lo arranca el jugador).
--                                Nada se envía sin la ventana a la vista (SNF.Comercio.ventanaVisible): empezar y reiniciar dan
--                                false, e intentar lo para aunque llegue desde un temporizador ya programado.
-- Sniper.pausar()                lo llama SNF.Compra.elegir: deja la vuelta en curso mientras la compra busca.
-- Sniper.activo() -> boolean     está empezado (aunque esté en pausa o esperando).
-- Sniper.estado()                'parado' | 'pausado' (la compra busca, confirma o compra) | 'esperando' | 'buscando'.
-- Sniper.motivo()                por qué espera: 'escaneo' | 'busqueda' | 'ajena' | 'limitado' | 'ritmo' (límite por minuto) |
--                                'compra' | nil.
-- Sniper.vueltas() -> n          vueltas empezadas desde Sniper.empezar().
-- Sniper.ultimaVuelta() -> n | nil   tarea S2: cuántos objetos vio la última vuelta completa, mientras espera a empezar la
--                                siguiente (la ventana dice «Escaneo completo: N objetos»); nil mientras busca, en cuanto
--                                sale la búsqueda de la vuelta siguiente, o parado.
-- Sniper.reiniciar() -> boolean  tarea S2 («Reiniciar» de la pestaña): para, vacía la lista de hallazgos y lo visto, y
--                                vuelve a empezar desde la primera vuelta (solo con el comercio activo).
-- Sniper.enCamino() -> boolean   tiene un navegar (SendBrowseQuery) enviado y sin respuesta: SNF.Busqueda espera a
--                                que llegue antes de lanzar la suya, para no tomar sus resultados por los suyos. Sigue
--                                en true tras parar o pausar, hasta que llega un resultado de navegar
--                                (AUCTION_HOUSE_BROWSE_RESULTS_UPDATED), pasan ESPERA_PAGINA s o se cierra la subasta.
--                                Parado, lo mira un oyente de un solo uso que se quita en cuanto llega o se cierra.
-- Sniper.hallazgos()             copia de la lista: {item, precio (cobre por unidad, el más bajo), cantidad (todas las
--                                unidades a la venta de ese objeto, a cualquier precio: la búsqueda general no dice
--                                cuántas hay al más bajo), pct (% de lo normal), hora (segundos del servidor en que se
--                                encontró), itemKey, grupo; en modo operaciones también operacion, ruta, tope y
--                                recorte ("mercado" o "regional" si el tope prudente bajó el tope de la fórmula)}, los más nuevos arriba, como mucho MAX. De cada objeto
--                                (itemKey) solo queda el último; el mismo precio no se repite. Si el precio más bajo
--                                sube (alguien compró las baratas), se vuelve a mirar con la regla: si sigue siendo
--                                buena compra se actualiza en su sitio (sin sonar ni subirlo); si no, sale. Sale
--                                también lo comprado (también con el sniper parado) y lo que ya no está a la venta tras
--                                una vuelta completa.
-- Sniper.elegir(i) -> boolean    prepara la compra del hallazgo i con SNF.Compra.elegir. En modo operaciones, si su
--                                operación ya no admite el precio, sale de la lista y da false.
-- Sniper.modo() -> 'regla' | 'operaciones'
-- Sniper.vigente(item, itemKey, precio, {operacion, ruta}) -> boolean   ver arriba (lo usa SNF.Compra).
--                                Los hallazgos del modo operaciones llevan además operacion, ruta y tope (cobre).
-- SNF_COMERCIO_SNIPER(n)         n hallazgos nuevos; con n = 0, algo ha cambiado (estado o lista) y la ventana se
--                                repinta. Si comercioSniperSonido, suena como mucho una vez por vuelta.
--
-- Dormido hasta abrir la subasta: al cargar solo escucha los mensajes internos SNF_COMERCIO_ABIERTA y
-- SNF_COMERCIO_COMPRA (este, para quitar de la lista lo comprado aunque el sniper esté parado). Los eventos de la
-- subasta se escuchan mientras corre. Todo el trabajo (eventos, ganchos y temporizadores) pasa por SNF.Comercio.ejecutar, y
-- cada temporizador comprueba que su generación sigue viva: parar, pausar o cerrar los deja sin efecto.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Sniper = {}
SNF.Sniper = Sniper

Sniper.MAX = 50 -- hallazgos como mucho
Sniper.POR_MINUTO = 90 -- búsquedas como mucho en VENTANA s (el cliente admite unas 100 por minuto)
Sniper.VENTANA = 60
Sniper.CALMA = 5 -- s sin búsquedas ajenas antes de buscar
Sniper.JUGADOR = 60 -- s tras una búsqueda ajena con texto (el jugador en la subasta de Blizzard)
Sniper.ESPERA_PAGINA = 20 -- s sin respuesta antes de dar la vuelta por perdida
Sniper.MIRAR_CADA = 1 -- s entre dos miradas mientras espera

local estado = "parado"
local motivo = nil
local corriendo = false
local pausado = false
local generacion = 0 -- cambia al empezar, pausar y parar: los temporizadores de antes ya no hacen nada
local vuelta = nil -- la vuelta en curso: {vistos = {[clave] = true}, cursor, indice = {[item] = grupo}, reglas = {}}
local enVuelo = nil -- {accion, id}: búsqueda enviada que aún no ha respondido
local pendiente = nil -- la búsqueda que toca: "navegar" | "mas"
local propio = false -- el sistema está ocupado por nuestra propia respuesta (aún no es «esperar»)
local mirando = false
local proxima = false -- hay una vuelta programada
local numEnvio = 0
local numVueltas = 0
local conocidos = {} -- [clave] = el último precio visto
local lista = {} -- los hallazgos
local calmaHasta = nil
local jugadorHasta = nil
local ultimaMia = false -- la última SendBrowseQuery es nuestra (sus páginas son nuestras)
local enviandoYo = false
local enganchado = false
local escuchando = false
local elegido = nil -- {clave, item}: el hallazgo cuya compra está preparando SNF.Compra
local caminoHasta = nil -- GetTime() hasta el que nuestro último navegar puede seguir en camino (también parado)
local vistosUltima = nil -- objetos vistos en la última vuelta completa, hasta que sale la búsqueda de la siguiente
local alLlegar = nil -- oyente de un solo uso de AUCTION_HOUSE_BROWSE_RESULTS_UPDATED con el sniper parado

-- Nuestro navegar ya respondió (o no responderá): se olvida, y el oyente de un solo uso, si lo hay, se quita.
local function caminoAcabado()
  caminoHasta = nil
  if alLlegar then
    SNF.Eventos.dejar("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED", alLlegar)
    alLlegar = nil
  end
end

-- Fases de SNF.Compra en que el sniper no busca: la búsqueda de la compra, la mercancía por confirmar y la compra pedida.
-- Con la compra «lista» sí busca: una fila preparada que el jugador no toca no lo para.
local OCUPADA = {buscando = true, confirmar = true, comprando = true}

local function ejecutar(fn, ...)
  return SNF.Comercio.ejecutar("sniper", fn, ...)
end

local function funcion(nombre)
  local ah = rawget(_G, "C_AuctionHouse")
  local f = type(ah) == "table" and rawget(ah, nombre)
  return type(f) == "function" and f or nil
end

-- Llama a fn dentro de ejecutar pasados `segundos`, si entretanto no se ha parado, pausado ni empezado de nuevo.
local function despues(segundos, fn)
  local g = generacion
  C_Timer.After(segundos, function()
    if g == generacion then
      ejecutar(fn)
    end
  end)
end

local function avisar(n)
  SNF.Eventos.emitir("SNF_COMERCIO_SNIPER", n or 0)
end

local function ponerEstado(e, m)
  if estado ~= e or motivo ~= m then
    estado, motivo = e, m
    avisar(0)
  end
end

local function sonar()
  if not SNF.Ajustes.get("comercioSniperSonido") then
    return
  end
  local sk = rawget(_G, "SOUNDKIT")
  local id = type(sk) == "table" and (rawget(sk, "RAID_WARNING") or rawget(sk, "MAP_PING")) or nil
  if type(id) == "number" and type(PlaySound) == "function" then
    PlaySound(id)
  end
end

local function cada()
  local limite = SNF.Ajustes.LIMITES.comercioSniperCada
  local v = tonumber(SNF.Ajustes.get("comercioSniperCada")) or SNF.Ajustes.DEFECTO.comercioSniperCada
  if v ~= v then
    v = SNF.Ajustes.DEFECTO.comercioSniperCada
  end
  return math.max(limite.min, math.min(limite.max, v))
end

---------------------------------------------------------------------------------------------------
-- Lo que impide buscar
---------------------------------------------------------------------------------------------------

-- La cuenta de búsquedas es la del comercio: la comparten el escaneo, el sniper y las ajenas que se ven.
local function apuntarEnvio()
  SNF.Comercio.apuntarBusqueda()
end

local function enElMinuto()
  return SNF.Comercio.busquedasRecientes(Sniper.VENTANA)
end

local function claveElegida()
  return elegido and elegido.clave
end

local function estadoEscaneo()
  local e = rawget(SNF, "Escaneo")
  local f = type(e) == "table" and rawget(e, "estado")
  if type(f) ~= "function" then
    return nil
  end
  return f()
end

local function escaneoEnMarcha()
  local e = estadoEscaneo()
  return e == "esperando" or e == "escaneando"
end

local function faseCompra()
  local c = rawget(SNF, "Compra")
  local f = type(c) == "table" and rawget(c, "estado")
  local e = type(f) == "function" and f() or nil
  return type(e) == "table" and e.fase or nil
end

local function listo()
  local f = funcion("IsThrottledMessageSystemReady")
  if not f then
    return true
  end
  return f() and true or false
end

-- El jugador busca en nuestra ventana (comercio/busqueda.lua): su búsqueda manda y el sniper espera.
local function busquedaOcupada()
  local b = rawget(SNF, "Busqueda")
  local f = type(b) == "table" and rawget(b, "ocupada")
  return type(f) == "function" and f() == true
end

-- La llamada a C_AuctionHouse que ven los ganchos es de SNF.Busqueda.
local function busquedaEnviando()
  local b = rawget(SNF, "Busqueda")
  local f = type(b) == "table" and rawget(b, "enviando")
  return type(f) == "function" and f() == true
end

-- 'compra' | 'escaneo' | 'busqueda' | 'ajena' | 'ritmo' | 'limitado' | nil.
local function bloqueo()
  if pausado or OCUPADA[faseCompra() or ""] then
    return "compra"
  end
  if escaneoEnMarcha() then
    return "escaneo"
  end
  if busquedaOcupada() then
    return "busqueda"
  end
  local t = GetTime()
  if (calmaHasta and t < calmaHasta) or (jugadorHasta and t < jugadorHasta) then
    return "ajena"
  end
  if enElMinuto() >= Sniper.POR_MINUTO then
    return "ritmo"
  end
  if not listo() then
    return "limitado"
  end
  return nil
end

---------------------------------------------------------------------------------------------------
-- Hallazgos
---------------------------------------------------------------------------------------------------

local function claveDe(k)
  return table.concat({tostring(k.itemID), tostring(k.itemLevel or 0), tostring(k.itemSuffix or 0),
    tostring(k.battlePetSpeciesID or 0)}, ":")
end

local function copiaClave(k)
  return {itemID = k.itemID, itemLevel = k.itemLevel or 0, itemSuffix = k.itemSuffix or 0,
    battlePetSpeciesID = k.battlePetSpeciesID or 0}
end

-- [item] = clave del grupo cuya regla manda (el primero que lo tiene; Grupos.lista da los propios primero).
local function indiceGrupos()
  local indice = {}
  for _, g in ipairs(SNF.Grupos.lista()) do
    if type(g) == "table" and g.clave ~= nil and type(g.objetos) == "table" then
      for _, item in ipairs(g.objetos) do
        if type(item) == "number" and indice[item] == nil then
          indice[item] = g.clave
        end
      end
    end
  end
  return indice
end

local function reglaDe(item)
  local grupo = vuelta.indice[item]
  local k = grupo
  if k == nil then
    k = false -- sin grupo: la plantilla
  end
  local r = vuelta.reglas[k]
  if not r then
    r = SNF.Reglas.de(grupo)
    vuelta.reglas[k] = r
  end
  return r, grupo
end

---------------------------------------------------------------------------------------------------
-- Modo (fase 3 de la paridad con TSM). comercioSniperModo: «regla» (el de siempre y el de todo lo guardado sin elegir:
-- la regla de sniper del grupo, sniperPct) u «operaciones» (las operaciones de Sniper de los grupos, propias o importadas
-- de TSM, como su Sniper: precio <= «Precio máximo»). En modo operaciones nunca se vuelve al porcentaje: sin operación,
-- con la operación ignorada aquí, con la fórmula rota o sin valor, el objeto no es hallazgo.
---------------------------------------------------------------------------------------------------

local function modoAjuste()
  return SNF.Ajustes.get("comercioSniperModo") == "operaciones" and "operaciones" or "regla"
end

-- El grupo que manda para la itemKey: el de su clave base «i:<id>» o, sin grupo, el Grupo Base («»), como en TSM. La
-- búsqueda general no dice qué variante (bonus de TSM) es la fila: si hay variantes guardadas en otro grupo, no se elige
-- ninguno (nil, «variante»). Las mascotas (jaula con especie) tampoco: su precio va por especie (nil, «mascota»).
local function rutaOperaciones(k)
  if (tonumber(k.battlePetSpeciesID) or 0) > 0 then
    return nil, "mascota"
  end
  local base = "i:" .. tostring(k.itemID)
  local ruta = SNF.Arbol.objeto(base) or ""
  if SNF.Arbol.varianteEnOtraRuta(base, ruta) then
    return nil, "variante"
  end
  return ruta
end

local function pctMercado(item, precio)
  local p = SNF.Precios.de(item)
  local normal = type(p) == "table" and p.normal
  if type(normal) == "number" and normal > 0 then
    return precio / normal * 100
  end
  return nil
end

-- Como Reglas.evaluar, con la operación: {buena, pct, motivo, operacion, ruta, tope}. `ops` guarda por vuelta la
-- operación de cada grupo (nombre false: ninguna) y su motivo.
local function evaluarOperacion(item, k, precio, cantidad, ops)
  if cantidad <= 0 then
    return {buena = false, motivo = "sin_venta"}
  end
  local ruta, porque = rutaOperaciones(k)
  if not ruta then
    return {buena = false, motivo = porque}
  end
  local o = ops and ops[ruta]
  if not o then
    local nombre, motivo = SNF.Operaciones.aplicable(ruta, "sniper")
    o = {nombre = nombre or false, motivo = motivo}
    if ops then
      ops[ruta] = o
    end
  end
  if not o.nombre then
    return {buena = false, motivo = o.motivo, ruta = ruta}
  end
  -- Tope prudente: el «Precio máximo» nunca pasa del menor entre el precio de tu casa y el regional (recorte dice cuál).
  local tope, recorte = SNF.Operaciones.topeCompra("sniper", o.nombre, item)
  if not tope then
    return {buena = false, motivo = "sin_valor", ruta = ruta, operacion = o.nombre}
  end
  local pct = pctMercado(item, precio)
  if precio > tope then
    return {buena = false, pct = pct, motivo = "caro", ruta = ruta, operacion = o.nombre, tope = tope, recorte = recorte}
  end
  return {buena = true, pct = pct, motivo = "ok", ruta = ruta, operacion = o.nombre, tope = tope, recorte = recorte}
end

-- El veredicto de la vuelta en su modo.
local function juzgar(item, k, precio, cantidad)
  if vuelta.modo == "operaciones" then
    return evaluarOperacion(item, k, precio, cantidad, vuelta.ops)
  end
  local regla = reglaDe(item)
  return SNF.Reglas.evaluar(item, {precio = precio, cantidad = cantidad}, SNF.Precios.de(item), regla, "sniper")
end

local function quitarDeLista(cumple)
  local quitados = 0
  for i = #lista, 1, -1 do
    if cumple(lista[i]) then
      table.remove(lista, i)
      quitados = quitados + 1
    end
  end
  return quitados
end

-- F12: la búsqueda general no dice de quién es el precio más bajo. Si la lista de ese objeto ya se ha leído y ese precio
-- es de otro personaje de la cuenta (o no se sabe de quién es), no es un hallazgo. Sin lista leída se sabe al elegirlo: la
-- compra no pasa por esa fila («error» otro_personaje) y el hallazgo sale de la lista.
local function precioDudoso(item, precio)
  local B = rawget(SNF, "Busqueda")
  local v = type(B) == "table" and type(B.vivo) == "function" and B.vivo(item) or nil
  return type(v) == "table" and v.minimoDudoso == precio
end

-- Pone el hallazgo arriba y quita el anterior del mismo objeto. El mismo objeto al mismo precio no se repite.
local function anadir(h)
  for _, otro in ipairs(lista) do
    if otro.clave == h.clave and otro.precio == h.precio then
      return false
    end
  end
  quitarDeLista(function(otro) return otro.clave == h.clave end)
  table.insert(lista, 1, h)
  while #lista > Sniper.MAX do
    table.remove(lista)
  end
  return true
end

-- Lee las filas desde..#filas de la búsqueda general: {itemKey, minPrice, totalQuantity}.
local function leerFilas(filas, desde)
  if type(filas) ~= "table" then
    return
  end
  local nuevos, cambiados = 0, 0
  local hora = SNF.API.horaServidor()
  for i = desde, #filas do
    local f = filas[i]
    local k = type(f) == "table" and f.itemKey
    local item = type(k) == "table" and k.itemID
    local precio = type(f) == "table" and f.minPrice
    if type(item) == "number" and type(precio) == "number" and precio > 0 then
      local clave = claveDe(k)
      vuelta.vistos[clave] = true
      local antes = conocidos[clave]
      conocidos[clave] = precio
      local h
      local recheck = (antes and precio >= antes) and clave ~= claveElegida()
        and (precio > antes or vuelta.modo == "operaciones")
      if recheck then
        for _, otro in ipairs(lista) do
          if otro.clave == clave then
            h = otro
            break
          end
        end
      end
      if antes == nil or precio < antes or (recheck and vuelta.modo == "operaciones" and not h) then
        local cantidad = tonumber(f.totalQuantity) or 0
        local grupo = vuelta.indice[item] -- también en modo operaciones: sus topes de unidades y oro siguen en la compra
        local ev = juzgar(item, k, precio, cantidad)
        if ev.buena and not precioDudoso(item, precio) and anadir({item = item, precio = precio, cantidad = cantidad,
          pct = ev.pct, hora = hora, clave = clave, itemKey = copiaClave(k), grupo = grupo,
          rotacionSinConfirmar = ev.rotacionSinConfirmar, operacion = ev.operacion, ruta = ev.ruta, tope = ev.tope,
          recorte = ev.recorte}) then
          nuevos = nuevos + 1
        end
      elseif recheck then
        -- Alguien ha comprado las más baratas: el hallazgo se vuelve a mirar con la regla al precio nuevo. En modo
        -- operaciones también al mismo precio: la operación del grupo o su fórmula pueden haber cambiado.
        if h then
          local cantidad = tonumber(f.totalQuantity) or 0
          local ev = juzgar(item, k, precio, cantidad)
          if ev.buena and not precioDudoso(item, precio) then
            local igual = h.precio == precio and h.cantidad == cantidad and h.pct == ev.pct and h.operacion == ev.operacion
              and h.tope == ev.tope and h.recorte == ev.recorte
            h.precio, h.cantidad, h.pct, h.hora = precio, cantidad, ev.pct, hora -- en su sitio, sin sonar (F1: con su hora nueva)
            h.rotacionSinConfirmar = ev.rotacionSinConfirmar -- F9p
            h.operacion, h.ruta, h.tope, h.recorte = ev.operacion, ev.ruta, ev.tope, ev.recorte
            if not igual then
              cambiados = cambiados + 1
            end
          else
            quitarDeLista(function(otro) return otro == h end)
            cambiados = cambiados + 1
          end
        end
      end
    end
  end
  if nuevos > 0 then
    avisar(nuevos)
    if not vuelta.sonado then
      vuelta.sonado = true
      sonar()
    end
  elseif cambiados > 0 then
    avisar(0)
  end
end

---------------------------------------------------------------------------------------------------
-- Búsquedas
---------------------------------------------------------------------------------------------------

local intentar -- (se define abajo)
local pedir

local function mirar()
  if mirando then
    return
  end
  mirando = true
  despues(Sniper.MIRAR_CADA, function()
    mirando = false
    propio = false -- pasado un rato, ni nuestra respuesta lo explica: alguien está usando la subasta
    intentar()
  end)
end

-- Programa la vuelta siguiente dentro de comercioSniperCada segundos.
local function programar()
  if proxima then
    return
  end
  proxima = true
  despues(cada(), function()
    proxima = false
    pedir("navegar")
  end)
end

-- Acaba la vuelta. Completa: lo que no se ha visto ya no está a la venta (se olvida y sale de la lista).
local function acabarVuelta(completa)
  if completa and vuelta then
    local vistos = vuelta.vistos
    for clave in pairs(conocidos) do
      if not vistos[clave] then
        conocidos[clave] = nil
      end
    end
    local protegida = claveElegida()
    quitarDeLista(function(h) return not vistos[h.clave] and h.clave ~= protegida end)
    local n = 0
    for _ in pairs(vistos) do
      n = n + 1
    end
    vistosUltima = n
    avisar(0) -- la lista puede haber cambiado y la ventana dice «Escaneo completo: N objetos»
  end
  vuelta, enVuelo, pendiente, propio = nil, nil, nil, false
  programar()
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

local function sinRespuesta(id)
  if enVuelo and enVuelo.id == id then
    acabarVuelta(false)
  end
end

local function enviar(accion)
  numEnvio = numEnvio + 1
  local id = numEnvio
  enVuelo = {accion = accion, id = id}
  pendiente, propio = nil, false
  local avisarVuelta, antes = false, estado
  if accion == "navegar" then
    numVueltas = numVueltas + 1
    vuelta = {vistos = {}, cursor = 0, indice = indiceGrupos(), reglas = {}, modo = modoAjuste(), ops = {}}
    avisarVuelta = vistosUltima ~= nil
    vistosUltima = nil
  end
  ponerEstado("buscando", nil)
  if avisarVuelta and antes == "buscando" then
    avisar(0) -- otra vuelta (sin cambiar de estado): la ventana deja de decir «Escaneo completo»
  end
  apuntarEnvio()
  enviandoYo = true
  local ok, err = pcall(comoPropia, function()
    if accion == "navegar" then
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
  if accion == "navegar" then
    ultimaMia = true
    caminoHasta = GetTime() + Sniper.ESPERA_PAGINA
  end
  despues(Sniper.ESPERA_PAGINA, function()
    sinRespuesta(id)
  end)
end

intentar = function()
  if not corriendo or not pendiente or enVuelo or not SNF.Comercio.activo() then
    return
  end
  if not SNF.Comercio.ventanaVisible() then
    Sniper.parar()
    return
  end
  local b = bloqueo()
  if not b then
    enviar(pendiente)
    return
  end
  if b == "compra" then
    ponerEstado("pausado", "compra")
  elseif not (b == "limitado" and propio) then
    ponerEstado("esperando", b)
  end
  mirar()
end

pedir = function(accion)
  pendiente = accion
  intentar()
end

local function seguir()
  if C_AuctionHouse.HasFullBrowseResults() then
    acabarVuelta(true)
    return
  end
  propio = true -- el sistema aún está ocupado con la respuesta que acaba de llegar
  pedir("mas")
end

---------------------------------------------------------------------------------------------------
-- Eventos (solo mientras corre)
---------------------------------------------------------------------------------------------------

local MANEJADORES = {}

MANEJADORES.AUCTION_HOUSE_BROWSE_RESULTS_UPDATED = function()
  caminoAcabado() -- también con la vuelta dejada (pausado): nuestro navegar ha respondido
  if not (enVuelo and enVuelo.accion == "navegar" and vuelta) then
    return -- no la hemos pedido nosotros
  end
  enVuelo = nil
  local filas = C_AuctionHouse.GetBrowseResults()
  leerFilas(filas, 1)
  vuelta.cursor = type(filas) == "table" and #filas or 0
  seguir()
end

-- Páginas añadidas: solo si nuestra SendBrowseQuery es la última. Las que pide la lista de Blizzard al bajar son de
-- nuestra búsqueda y también valen.
MANEJADORES.AUCTION_HOUSE_BROWSE_RESULTS_ADDED = function(nuevas)
  if not (vuelta and ultimaMia) or (enVuelo and enVuelo.accion == "navegar") then
    return
  end
  if enVuelo and enVuelo.accion == "mas" then
    enVuelo = nil
  end
  if type(nuevas) == "table" then
    leerFilas(nuevas, 1)
    vuelta.cursor = vuelta.cursor + #nuevas
  else
    local filas = C_AuctionHouse.GetBrowseResults()
    leerFilas(filas, vuelta.cursor + 1)
    vuelta.cursor = type(filas) == "table" and #filas or vuelta.cursor
  end
  if not enVuelo then
    seguir()
  end
end

MANEJADORES.AUCTION_HOUSE_THROTTLED_SYSTEM_READY = function()
  intentar()
end

-- El escaneo ha cambiado (por ejemplo, acaba): si se esperaba por él, se mira ya.
MANEJADORES.SNF_COMERCIO_ESCANEO = function()
  if motivo == "escaneo" then
    intentar()
  end
end

local function reanudar()
  if not corriendo or not pausado then
    return
  end
  pausado = false
  ponerEstado("esperando", nil)
  -- En el fotograma siguiente: tras «hecho», la compra puede elegir otra cosa enseguida (y volver a pausar).
  despues(0, function()
    pedir("navegar")
  end)
end

-- La compra ha cambiado (SNF_COMERCIO_COMPRA; se escucha siempre, también con el sniper parado). Lo comprado (o lo que
-- ya no estaba) sale de la lista; elegir otra cosa o descartar olvida el hallazgo elegido. Con el sniper en marcha,
-- en cuanto la compra queda «lista», «hecho», da error o se descarta, sigue.
local function alCambiarCompra(fase, e)
  local item = type(e) == "table" and e.item or nil
  if elegido then
    -- F12: un hallazgo que resulta ser de otro personaje de la cuenta tampoco se queda en la lista.
    local acabada = fase == "hecho"
      or (fase == "error" and type(e) == "table"
        and (e.motivo == "sin_subasta" or e.motivo == "otro_personaje" or e.motivo == "operacion"))
    if acabada and item == elegido.item then
      local clave = elegido.clave
      elegido = nil
      if quitarDeLista(function(h) return h.clave == clave end) > 0 then
        avisar(0)
      end
    elseif fase == nil or (fase == "buscando" and item ~= elegido.item) then
      elegido = nil
    end
  end
  if corriendo and not OCUPADA[fase or ""] then
    if pausado then
      reanudar()
    elseif motivo == "compra" then
      -- En el fotograma siguiente, como reanudar: tras «hecho» la compra elige sola la fila siguiente (y busca su
      -- subasta); si el sniper buscara antes, ella tendría que esperar a que la subasta se libere.
      despues(0, intentar)
    end
  end
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

---------------------------------------------------------------------------------------------------
-- Búsquedas ajenas
---------------------------------------------------------------------------------------------------

local function conTexto(consulta)
  return type(consulta) == "table" and type(consulta.searchString) == "string" and consulta.searchString ~= ""
end

-- nombre: la función de C_AuctionHouse que alguien ha llamado; consulta: lo que se le pasó a SendBrowseQuery.
local function otraBusqueda(nombre, consulta)
  if estadoEscaneo() == "escaneando" then
    return -- es del escaneo (y el sniper no busca mientras escanea)
  end
  if nombre == "SendSearchQuery" and faseCompra() == "buscando" then
    return -- es de SNF.Compra
  end
  if busquedaEnviando() then
    -- Es de SNF.Busqueda: no es ajena (ni calma ni JUGADOR) y ella ya la apunta en la cuenta por minuto. Una
    -- SendBrowseQuery suya sí estropea la vuelta en curso: lo que siga llegando es de la búsqueda.
    if nombre == "SendBrowseQuery" then
      ultimaMia = false
      if corriendo and vuelta then
        vuelta, enVuelo, propio = nil, nil, false
        pendiente = "navegar"
      end
    end
    if corriendo then
      intentar()
    end
    return
  end
  apuntarEnvio() -- también cuenta para el límite del cliente
  local t = GetTime()
  calmaHasta = t + Sniper.CALMA
  if nombre == "SendBrowseQuery" then
    ultimaMia = false
    if conTexto(consulta) then
      jugadorHasta = t + Sniper.JUGADOR
    end
    if corriendo and vuelta then
      -- Nuestra vuelta queda estropeada: lo que siga llegando es de la otra búsqueda. Se empieza otra tras la espera.
      vuelta, enVuelo, propio = nil, nil, false
      pendiente = "navegar"
    end
  end
  if corriendo then
    intentar()
  end
end

local function enganchar()
  if enganchado or type(hooksecurefunc) ~= "function" then
    return
  end
  enganchado = true
  for _, nombre in ipairs({"SendBrowseQuery", "RequestMoreBrowseResults", "SendSearchQuery"}) do
    if funcion(nombre) then
      hooksecurefunc(C_AuctionHouse, nombre, function(consulta)
        if not enviandoYo and SNF.Sniper == Sniper then
          ejecutar(otraBusqueda, nombre, consulta)
        end
      end)
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Interfaz
---------------------------------------------------------------------------------------------------

-- Deja la marcha a cero: generación nueva (los temporizadores de antes ya no hacen nada) y sin vuelta.
local function reiniciarMarcha()
  generacion = generacion + 1
  vuelta, enVuelo, pendiente, propio, mirando, proxima = nil, nil, nil, false, false, false
  vistosUltima = nil
end

function Sniper.empezar()
  if corriendo or not SNF.Comercio.activo() or not SNF.Comercio.ventanaVisible() then
    return false
  end
  reiniciarMarcha()
  corriendo, pausado = true, false
  conocidos, numVueltas = {}, 0
  escuchar(true)
  enganchar()
  ponerEstado("esperando", nil)
  pedir("navegar")
  return true
end

function Sniper.parar()
  reiniciarMarcha()
  corriendo, pausado = false, false -- `elegido` se queda: su «hecho» aún lo quita de la lista
  escuchar(false)
  if caminoHasta and not alLlegar then
    -- Su navegar sigue en camino: un oyente de un solo uso lo ve llegar (Sniper.enCamino).
    alLlegar = function()
      caminoAcabado()
    end
    SNF.Eventos.escuchar("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED", alLlegar)
  end
  ponerEstado("parado", nil)
end

function Sniper.ceder()
  if corriendo then
    Sniper.parar()
  end
end

function Sniper.pausar()
  if not corriendo then
    return
  end
  reiniciarMarcha()
  pausado = true
  ponerEstado("pausado", "compra")
end

function Sniper.activo()
  return corriendo
end

function Sniper.estado()
  return estado
end

function Sniper.enCamino()
  if caminoHasta and GetTime() >= caminoHasta then
    caminoAcabado()
  end
  return caminoHasta ~= nil
end

function Sniper.motivo()
  return motivo
end

function Sniper.vueltas()
  return numVueltas
end

function Sniper.ultimaVuelta()
  return vistosUltima
end

function Sniper.reiniciar()
  if not SNF.Comercio.activo() or not SNF.Comercio.ventanaVisible() then
    return false
  end
  Sniper.parar()
  lista, conocidos = {}, {}
  avisar(0)
  return Sniper.empezar()
end

function Sniper.hallazgos()
  local copia = {}
  for i, h in ipairs(lista) do
    copia[i] = {item = h.item, precio = h.precio, cantidad = h.cantidad, pct = h.pct, hora = h.hora,
      itemKey = copiaClave(h.itemKey), grupo = h.grupo, rotacionSinConfirmar = h.rotacionSinConfirmar,
      operacion = h.operacion, ruta = h.ruta, tope = h.tope, recorte = h.recorte}
  end
  return copia
end

function Sniper.modo()
  return modoAjuste()
end

-- Lo usa SNF.Compra con las compras de un hallazgo del modo operaciones, al empezar, al llegar la cotización y antes de
-- cada clic de compra: ¿sigue mandando esa operación para el objeto (mismo grupo, no ignorada aquí) y su «Precio máximo»
-- de ahora admite `precio`? Lee el árbol, las operaciones y las fuentes de precio de este momento.
function Sniper.vigente(item, itemKey, precio, op)
  item, precio = tonumber(item), tonumber(precio)
  if modoAjuste() ~= "operaciones" or type(op) ~= "table" or not item or not precio or precio <= 0 then
    return false
  end
  local k = type(itemKey) == "table" and itemKey or {itemID = item}
  local ev = evaluarOperacion(item, {itemID = item, battlePetSpeciesID = k.battlePetSpeciesID}, precio, 1)
  return ev.buena == true and ev.operacion == op.operacion and ev.ruta == op.ruta
end

function Sniper.elegir(i)
  local h = lista[tonumber(i) or 0]
  local compra = rawget(SNF, "Compra")
  if not h or not SNF.Comercio.activo() or type(compra) ~= "table" then
    return false
  end
  -- grupo false: sin grupo vale la plantilla (no el grupo elegido en la lista).
  local grupo = h.grupo
  if grupo == nil then
    grupo = false
  end
  local clave, item = h.clave, h.item
  local sniperOp
  if h.operacion then
    -- Modo operaciones: la operación y su fórmula de ahora tienen que admitir aún el precio de la fila. Si no, sale.
    sniperOp = {operacion = h.operacion, ruta = h.ruta}
    if not Sniper.vigente(h.item, h.itemKey, h.precio, sniperOp) then
      quitarDeLista(function(otro) return otro == h end)
      avisar(0)
      return false
    end
  end
  local ok = compra.elegir({item = h.item, precio = h.precio, cantidad = h.cantidad, itemKey = copiaClave(h.itemKey),
    grupo = grupo, origen = "sniper", sniperOp = sniperOp})
  if ok then
    elegido = {clave = clave, item = item} -- solo si la compra lo ha aceptado: si no, sigue el de antes
  end
  return ok
end

-- Cada apertura de la subasta empieza con la lista vacía (lo de antes ya no vale). No empieza solo.
-- Con la subasta cerrada no llegará nada: lo que iba en camino se olvida y no queda nada escuchando. Comercio emite
-- SNF_COMERCIO_CERRADA después de parar a todos (también tras apagarse).
SNF.Eventos.escuchar("SNF_COMERCIO_CERRADA", function()
  caminoAcabado()
end)

SNF.Eventos.escuchar("SNF_COMERCIO_ABIERTA", function()
  ejecutar(function()
    if SNF.Sniper ~= Sniper then
      return
    end
    lista, conocidos, elegido = {}, {}, nil
    calmaHasta, jugadorHasta, ultimaMia = nil, nil, false
    enganchar()
    avisar(0)
  end)
end)

-- Otro modo: lo encontrado con el de antes ya no vale. La vuelta en curso sigue con el nuevo y todo se vuelve a mirar.
SNF.Eventos.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave ~= "comercioSniperModo" or SNF.Sniper ~= Sniper then
    return
  end
  ejecutar(function()
    local protegida = claveElegida()
    if protegida then
      local compra = SNF.Compra.estado()
      local delSniper = compra and compra.origen == "sniper"
      local enviada = delSniper and compra.fase == "comprando" and compra.esperando == "compra"
      if not enviada then
        if delSniper then SNF.Compra.ceder() end
        elegido, protegida = nil, nil
      end
    end
    quitarDeLista(function(h) return h.clave ~= protegida end)
    conocidos = {}
    if vuelta then
      vuelta.modo, vuelta.ops = modoAjuste(), {}
    end
    avisar(0)
  end)
end)

SNF.Eventos.escuchar("SNF_COMERCIO_COMPRA", function(fase, e)
  if SNF.Sniper == Sniper then
    ejecutar(alCambiarCompra, fase, e)
  end
end)
