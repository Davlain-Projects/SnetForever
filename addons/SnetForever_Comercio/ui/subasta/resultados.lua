-- SnetForever: la vista de resultados de la búsqueda de nuestra ventana de la subasta, parte 3, bloque B (Task B5). Es la
-- página interna «resultados» de SNF.SubastaVentana (sin pestaña: arriba sigue elegida Navegar). Navegar pasa a ella al
-- buscar (SubastaNavegar.buscar), con la búsqueda ya pedida a SNF.Busqueda. Imita la vista de resultados de TSM
-- (tooltip-tsm.png) sin copiar nada suyo.
--
-- Fila 2, 8 px bajo la cabecera y de 22 px de alto, de lado a lado con 12 px a cada borde y 8 px entre las piezas:
--   - «‹ Salir del escaneo», texto en «acento» sin fondo: SNF.Busqueda.salir() y vuelta al inicio de Navegar.
--   - El campo con lupa y el texto buscado, con su X a la derecha (borra el campo; no busca), a todo lo ancho que queda.
--     Intro busca lo escrito (SubastaNavegar.buscar: se apunta en las recientes y se queda en resultados).
--   - «Volver a escanear»: repite la búsqueda (lo escrito en el campo o, con el campo vacío, la última buscada).
-- La tabla (TablaComercio de ui/comercio_tabla.lua, con estirar: llena su sitio y sigue a la ventana; el brief decía
-- Piezas.tabla, pero esa es la tabla de la ventana principal, sin subfilas: la de la subasta es TablaComercio), ordenable
-- y de entrada por Compra de menos a más (cada búsqueda nueva vuelve a ese orden). Lleva encendidas las opciones de la
-- tabla de B6r: triángulos ▸/▾ del atlas para desplegar, el botón ⋮ (apagado: aún no hay menú de columnas; su tooltip
-- lo dice), separadores finos entre los títulos y el tope de subfilas. Columnas, como TSM (B6r): Objeto (icono y nombre
-- en el color de su calidad), Niv., Ctd, el reloj (icono del atlas con el tooltip «Tiempo que le queda»), Vendedor,
-- Pujar (objeto), Compra (objeto) y %. Cada columna tiene su ancho y su peso; Objeto se lleva casi todo lo que sobra. El
-- texto de cada celda tiene el ancho de su columna y no se parte (el juego lo corta con puntos suspensivos).
--   - Fila de objeto (una por objeto de SNF.Busqueda.resultados()): Ctd, lo disponible en total; Compra, el precio mínimo
--     por unidad (Tema.dinero); %, frente al valor de mercado (SNF.Precios.de(item).normal; vacío si no hay), sin espacio
--     («100%») y con el color de su tramo (UIComercio.tokenPct y textoPct, B3r: hasta 40 azul, hasta 80 verde, de 81 a 110
--     amarillo, más naranja y desde 1000 rojo, que sale «>999%»; los mismos en el sniper y en el cuadro de cantidad); reloj,
--     Vendedor y Pujar vacíos. Toda fila de objeto se puede desplegar (triángulo ▸; abierta, ▾). Una variante con sufijo
--     enseña su nombre completo sin desplegarla (B2r, punto 4; lo da SNF.Busqueda): su texto cambia como mucho una vez y
--     sin reordenar la tabla.
--   - Subfila de subasta: en Objeto, solo el nombre del objeto (sin icono); Ctd, su cantidad (en un objeto suelto, 1: lo
--     que compra un clic; arreglo de la compra suelta, 2026-11-19: en WoW Forever una fila agrupa subastas iguales de 1
--     unidad y antes salía su número como Ctd, con la compra dividida entre él); el reloj, su tiempo sin
--     espacio («23h», «30m») o su franja («<12h»…) con el color de su tramo (TIEMPO: más de 24 h verde, de 12 a 24
--     naranja, de 2 a 12 amarillo, menos de 2 rojo; una franja, el de su tramo de abajo); Vendedor, el vendedor (solo en
--     pantalla); Pujar, su puja; Compra, su precio por unidad (los dos con Tema.dinero, a la derecha). En las mercancías
--     no hay vendedor ni puja (B2r, punto 3: ni en la columna ni en el tooltip, en ninguna fila, como TSM; SNF.Busqueda no
--     lo lee): esas celdas quedan vacías, pero las columnas se ven igual.
-- B3r, la lectura (como TSM): con la búsqueda acabada, se leen las subastas de cada objeto de la lista sin desplegarlo, uno
-- tras otro y en el orden de la tabla (SNF.Busqueda.pedirSubastas con leer: una sola petición a la vez, después de todo lo
-- demás, y esperando a la compra en pie y a los navegar del sniper y del escaneo en camino; leer nunca compra). Mientras una
-- fila espera su lectura, en vez del triángulo lleva ↻ (el icono «leyendo» del atlas propio, quieto: ni gira ni late); pasa
-- a triángulo una sola vez, cuando llega. Con la lectura llegan su mínimo de verdad y lo disponible (SNF.Busqueda:
-- resultados().resumen; en un objeto suelto cuentan también las subastas iguales que el juego agrupa en una fila) y, si
-- tiene varias subastas, «(n)» en dorado (token «oro») a la derecha de su nombre. El sitio de
-- «(n)» se guarda siempre en las filas de objeto, así el nombre no cambia de ancho al llegar. Desplegar una fila la lee
-- primero (sus subastas van antes que la lectura). La tabla no se reordena con lo que llega. Solo con la página a la vista.
-- Pulsar una fila (o su triángulo) pide sus subastas (SNF.Busqueda.pedirSubastas con la fila de resultados(), así el
-- equipo va con su itemKey) y la abre: debajo salen las de SNF.Busqueda.subastas(fila), con «Cargando subastas…» hasta
-- que llegan, pero solo si tardan más de CARGANDO.UMBRAL s (revisión B7, menor 5: con un servidor rápido no sale y se va
-- en unos fotogramas); hasta entonces la fila abierta no enseña nada debajo. Una vez a la vista, «Cargando…» se queda como
-- poco CARGANDO.MINIMO s (si las subastas llegan antes, salen al acabar ese tiempo): nunca sale y se va en fotogramas
-- seguidos. Un C_Timer por clic (y otro, como mucho, para el mínimo), nada en OnUpdate.
-- Solo hay una abierta a la vez (la búsqueda guarda las de un objeto); el triángulo de la abierta la cierra.
-- Salen como mucho sus TOPE_SUBFILAS (10) subastas más baratas y, si tiene más, una fila gris «y N más…» (o solo «y
-- más…» si el servidor no dio la lista entera), así se ven los demás objetos. Los avisos («Cargando…», «y N más…») no se
-- pueden elegir. Si la subasta elegida queda fuera de las 10 (aparecen otras más baratas), su compra se suelta
-- (SNF.Compra.cancelar) y deja de estar marcada: nunca se compra una subasta que no se ve. Lo mismo si, con la lista ya
-- llegada entera (ni a medias ni pedida otra vez), su escalón o su subasta ya no está (revisión B7, menor 2): la compra se
-- suelta y la barra dice «Esa subasta ya no está». Comprar nunca se queda encendido sin una fila marcada.
-- La tabla no se mueve sola (revisión B7, menor 5): las filas que ya se ven se quedan en su sitio y las que llegan van
-- detrás, en el orden en que llegan (TablaComercio:poner con mantener), mientras se busca y también cuando llegan los
-- nombres o las subastas de una fila. Se ordena una sola vez, al acabar la búsqueda, y cuando el jugador pulsa una
-- cabecera.
-- Las subastas van por precio por unidad, de menos a más (las que solo admiten puja, al final). Su clave sigue a la
-- subasta aunque la lista cambie (objeto: auctionID; mercancía: su precio, que es uno por escalón). El vendedor y el
-- auctionID solo viven en memoria y en pantalla: no se guardan en ningún sitio.
-- Ratón sobre una fila de objeto o una subfila: el tooltip normal del objeto del juego (con el enlace de la subasta si lo
-- hay, que trae su sufijo; si no, SetItemByID), con nuestras líneas de precio de ui/tooltip.lua; en una subfila, después,
-- una línea gris con el vendedor (si lo hay) y otra con «Puja X / Compra X» (o «Compra X»). Al salir se esconde. Solo Show.
-- Lo enseña el ayudante común de todas las filas (T1a, UIComercio.tooltipObjeto): a la derecha de la fila, como TSM, o a la
-- izquierda si no cabe.
-- F4 (fallo en el juego: el tooltip decía 10494 unidades y la fila 10557): Ctd, Compra (el mínimo) y «(n)» de la fila de un
-- objeto salen siempre de UNA lectura, y su tooltip dice cuál, en gris: «Ctd: del resumen de la búsqueda» mientras lleva ↻
-- (o si se quedó con lo de navegar), «Ctd: de su lista, leída a las hh:mm» cuando ya se leyó (la hora, fija, de esa lista)
-- y «Ctd: de su lista (a medias), leída a las hh:mm» si esa lista llegó a medias. Con la lista de debajo a medias y una
-- entera de antes en esta búsqueda, la fila es la de la entera (SNF.Busqueda no deja que una a medias la pise): la fila
-- leída y el tooltip («A la venta», de Busqueda.vivo) salen así de la misma lectura entera. Las subfilas siguen siendo la
-- lista de ahora (lo que se compra) y el tooltip de la fila lo dice: «Debajo: lista a medias, hh:mm». Sin entera, una lista
-- a medias da las tres si trae más unidades que navegar; si no, las tres son de navegar y, con la fila desplegada
-- (las subfilas son esa lista a medias), el tooltip también dice «Debajo: lista a medias, hh:mm», con la hora de esa
-- lista (F5). No se piden más páginas de una
-- mercancía (RequestMoreCommoditySearchResults): no se sabe si Forever la tiene.
-- B3s: Mayús + clic en una fila o subfila (o en su triángulo) pone el enlace de verdad del objeto en la caja del chat (la abre
-- si no hay ninguna) y Ctrl + clic lo enseña en el probador (UIComercio.clicModificado, el de todas las filas; teclas del
-- jugador). El de una subfila es el de su subasta, con su sufijo; el de una fila, el del juego por su id (una variante con
-- sufijo, el de su primera subasta si se ven; si no, nada). Con tecla no se elige, no se despliega, no se pide nada ni se
-- prepara compra; sin enlace todavía («#id»), nada. Nada se envía: el jugador pulsa Intro.
-- Abajo, a 8 px del borde y de 24 px de alto, de izquierda a derecha con 8 px entre piezas (B6r, como TSM):
--   - El botón cuadrado de pausa/seguir (24 × 24, iconos del atlas): buscando, pausa (SNF.Busqueda.detener: para sin
--     borrar lo que llegó; el brief decía parar(), pero parar() borra los resultados; B3r, ronda 1: la lectura queda en
--     pausa con ella y no sale ninguna petición más: a medias, ⏯ vuelve a escanear); con la búsqueda acabada y objetos
--     por leer (B3r), pausa la lectura (SNF.Busqueda.soltarLectura: la que va en camino llega) y, en pausa, la sigue; si
--     no, parada a medias (completa con motivo), seguir: repite la búsqueda como «Volver a escanear»; acabada y leída, o
--     sin búsqueda, apagado con el icono de seguir. Su tooltip dice lo que hará.
--   - La barra de estado, que llena lo que sobra: «Buscando…» / «Buscando… N objetos» / «Leyendo N / M» (B3r, N los
--     objetos leídos y M los de la lista) / «En pausa | N / M» / «N objetos» (y «a medias» si la búsqueda no acabó entera)
--     y un avance fijo en «acento» que nunca cambia de color ni late: medio lleno mientras se busca, lleno al acabar, vacío
--     sin búsqueda (la lectura no lo mueve: ninguna barra de color cambia sola). Con una compra elegida aquí, el texto dice cómo va la compra (y su
--     error, en rojo, que no se va solo); con la compra lista en combate, «En combate no se compra». Al pulsar una subasta
--     que no se puede comprar (toda tuya, sin saber cuántas son tuyas, solo puja; F12: una fila con parte tuya y parte de
--     otros sí se compra, solo lo de otros) o si SNF.Compra.elegir no la deja (otra compra espera al servidor), la
--     barra dice por qué en una línea, sin rojo (B6r, punto 9): Comprar nunca se queda apagado sin decir por qué.
--   - «Publicar» y «Pujar» (100 px): apagados siempre, con su tooltip («Llega con Vender»; «Llega pronto» o, con una
--     mercancía elegida, «Las mercancías no admiten puja»). Pujar nunca puja.
--   - «Comprar» (210 px, a la izquierda del asa de la ventana): encendido con una subasta elegida (SNF.Compra «lista» o
--     por confirmar, con origen 'resultados') y fuera de combate. Pulsar una subasta llama a SNF.Compra.elegir con
--     exacta = true, su precio por unidad, lo que se puede comprar de ella (comprables), la itemKey de su objeto y, de un
--     objeto, su auctionID y su total;
--     no compra. Se compra EXACTAMENTE esa subasta (regla del coordinador, ronda 1): si ya no está o cambió de precio,
--     no se compra nada y la barra lo dice en una línea. La lista se pone al día sola sin pedir nada más: la búsqueda de la
--     compra deja en el cliente las subastas de ahora y SNF.Busqueda las vuelve a leer (punto 12 de B6r); una subasta de
--     objeto que ya no está, o que se acaba de comprar aquí (revisión B7, menor 7), se quita además de la lista en
--     memoria (vuelve si el jugador pulsa otra vez la fila y el servidor aún la trae). La fila del objeto saca Ctd,
--     el mínimo y «(n)» de UNA sola lectura (la regla de la F4, en su párrafo de arriba): con las subastas llegadas
--     enteras, de ellas; si no, de la entera de antes, de la lista a medias o de navegar, y su tooltip dice de cuál.
--     El total, el botón y la barra salen de las subastas que se ven (las subfilas, la lista de ahora). De una mercancía (B6r, punto 10), la cantidad la elige el
--     jugador en el cuadro de cantidad: por defecto la de la subasta, como mucho lo acumulado hasta su precio, comprando de
--     la más barata hacia arriba; su precio por unidad es el tope: si el servidor cotiza más, nada. Sin regla de grupo (ni la del grupo elegido en
--     ofertas); el tope de gasto de siempre sí. La fila marcada es la que se compra.
--     Un objeto suelto (arreglo de la compra suelta, 2026-11-19) pide siempre dos clics: el botón dice «Comprar 1 por X»
--     con el total exacto; el primer clic no compra (SNF.Compra lo pasa a «confirmar» sin llamar al juego) y el botón
--     pasa a «Confirmar 1 por X»; el segundo clic compra esa subasta por lo que de verdad cuesta en lo último que dio el
--     juego, nunca por más que el total del botón.
--     Comprar es el flujo de siempre: con una mercancía «lista» abre el cuadro de cantidad (SNF.CantidadComercio, con
--     sinRojo: si el juego cotiza más de lo enseñado lo dice sin rojo y hace falta otro clic), que
--     pide la confirmación; si no, SNF.Compra.pulsar() desde su OnClick (una compra por clic; doble clic no cuenta). En
--     combate va apagado con su tooltip y el clic no hace nada. El botón dice siempre lo que hará el clic («Comprar N
--     por X», «Confirmar N por X»; con una mercancía «lista», «Elegir cantidad…», sin cifras: B2r, punto 1) y siempre
--     con el mismo estilo: sin rojo y sin nada que cambie solo (una compra cara
--     pide dos clics y la barra lo dice, siempre igual; el «Otra vez» armado de la barra vieja no se enseña).
-- Sin resultados: el texto gris «No hay nada a la venta con ese nombre» (solo con la búsqueda acabada).
-- Al irse de la vista, la compra elegida aquí se suelta (SNF.Compra.cancelar) y el cuadro de cantidad se cierra. Lo mismo
-- con una búsqueda nueva (otra cosa o «Volver a escanear»; ronda 1 del arreglo de la compra suelta): nunca se compra lo que
-- ya no se ve. Con un objeto suelto, Comprar dice siempre el importe exacto, sin «~»: si no cabe en sus 210 px, el botón
-- se ensancha lo justo y la barra de estado se encoge (UIComercio.ajustarBoton).
-- Nada parpadea: sin OnUpdate; se repinta con SNF_COMERCIO_BUSQUEDA (como mucho una vez por fotograma), con
-- SNF_COMERCIO_COMPRA, al entrar y salir de combate y con los nombres de objetos que llegan (agrupados cada 0,2 s), y
-- solo mientras la página se ve. Los eventos del juego solo se escuchan mientras se ve.
--
-- SubastaResultados.marcos   {pagina, salir (con .texto), campo, borrar, volver, fondoTabla, tabla (TablaComercio; sus
--     huecos llevan .snfIcono), vacio, pausa (con .icono), barra (con .relleno y .texto), publicar, pujar, comprar}.
-- SubastaResultados.ORIGEN   'resultados': el origen de las compras elegidas aquí (SNF.Compra.estado().origen).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local Estilo = SNF.Estilo
local L = SNF.L
local Ventana = SNF.SubastaVentana
local TablaComercio = SNF.TablaComercio

local SubastaResultados = {}
SNF.SubastaResultados = SubastaResultados

local ORIGEN = "resultados"
SubastaResultados.ORIGEN = ORIGEN

local proteger = Piezas.proteger
local botonBase = Piezas.interno.botonBase
local floor, max = math.floor, math.max

-- Medidas, en píxeles de la ventana (píxeles reales).
local MARGEN = 12 -- a los bordes de la ventana
local ARRIBA = 8 -- de la cabecera a la fila 2
local ALTO_FILA2 = 22
local HUECO = 8 -- entre las piezas de una fila y entre filas
local ABAJO = 8 -- del borde de abajo a la barra y a Comprar
local ALTO_PIE = 24
local ANCHO_COMPRAR = 210 -- cabe «Comprar N por X» (B3r: antes 190; con la letra «boton» nueva caben los mismos importes)
local ANCHO_PUBLICAR, ANCHO_PUJAR = 100, 100
local TOPE_SUBFILAS = 10 -- subastas que salen como mucho al desplegar un objeto
-- Tramos (B6r). El tiempo que le queda, en segundos: más de VERDE, verde; desde NARANJA, naranja; desde AMARILLO, amarillo;
-- menos, rojo. Una franja sin segundos (Enum.AuctionHouseTimeLeftBand) va con el color de su tramo de abajo. El % va con
-- los tramos de UIComercio (B3r: hasta 40 azul, hasta 80 verde, hasta 110 amarillo, más naranja y desde 1000 rojo). Los
-- colores son tokens del tema.
local TIEMPO = {VERDE = 24 * 3600, NARANJA = 12 * 3600, AMARILLO = 2 * 3600, BANDA = {[0] = "rojo", "rojo", "amarillo", "naranja"}}
local TAMANO_LETRA = 12 -- campo y «Salir»
local MARGEN_CAMPO = 24 -- del borde del campo al texto, a cada lado (lupa a un lado, X al otro)
local LADO_X = 12
local HOLGURA = 0.85 -- el texto de un botón ocupa como mucho esto de su sitio
-- Dentro de la columna Objeto (desde el borde izquierdo de la fila).
local X_ICONO = 18 -- tras el sitio del triángulo de la tabla
local LADO_ICONO = 14
local X_NOMBRE = X_ICONO + LADO_ICONO + 4
local LADO_PAUSA_ICONO = 12
local ESPERA_NOMBRES = 0.2 -- s que se agrupan los nombres de objetos que llegan
-- «Cargando subastas…» (revisión B7, menor 5): solo si la respuesta tarda más de UMBRAL s y, una vez a la vista, como poco
-- MINIMO s. pedidoEn: GetTime() del clic que pidió las subastas; vistoEn: desde cuándo se ve; turno: el del último clic.
local CARGANDO = {UMBRAL = 0.4, MINIMO = 0.4, pedidoEn = nil, vistoEn = nil, turno = 0, esperaMinimo = false}
local AVANCE = {esperando = 0.5, buscando = 0.5, completa = 1} -- lo lleno de la barra según la búsqueda
local ALFA_AVANCE = 0.35
local ICONO_DESCONOCIDO = "Interface\\Icons\\INV_Misc_QuestionMark"

local marcos = {}
SubastaResultados.marcos = marcos
local visible = false
local abierta = nil -- la clave de la fila abierta (la de las subastas pedidas)
local ultimoEstado = "parada" -- el de SNF.Busqueda la última vez que se miró
local ultimoTexto = "" -- lo último buscado (para «Volver a escanear» con el campo vacío)
local nombresPendientes = false
local subElegida = nil -- la clave de la subasta que el jugador eligió para comprar (la fila marcada)
local subElegidaMercancia = false -- la subasta elegida es de una mercancía (Pujar lo dice en su tooltip)
local porQue = nil -- la clave del texto que dice por qué la subasta pulsada no se puede comprar (punto 9 de B6r)
-- Las subastas de objeto quitadas de la lista en memoria tras un «ya no está» de su compra o tras comprarla ([clave] = true).
-- Se olvidan al pedir otra vez las subastas de una fila (clic del jugador) y con cada búsqueda nueva.
local quitadas = {}
local ordenarAlAcabar = false -- la búsqueda acaba de acabar: la próxima vez la tabla se ordena (una sola vez)
-- B3r: la lectura de los objetos. pausada: el jugador la paró con ⏯ (hasta que la siga o haya otra búsqueda); leidas y
-- total: los objetos de la lista ya leídos y todos (de la última vez que se pintó la tabla).
-- trasParar (ronda 1): el jugador paró la búsqueda con ⏯: la lectura queda en pausa con ella (parar es parar: no sale
-- ninguna petición más), la barra dice «a medias» y ⏯ ofrece volver a escanear, como antes de B3r.
local LECTURA = {pausada = false, trasParar = false, leidas = 0, total = 0}
local ANCHO_CUENTA = 34 -- el sitio de «(n)» a la derecha del nombre de una fila de objeto (cabe «(999)»)

---------------------------------------------------------------------------------------------------
-- Ayudas
---------------------------------------------------------------------------------------------------

local function ejecutar(fn, ...)
  return SNF.Comercio.ejecutar("resultados", fn, ...)
end

local function busqueda()
  return rawget(SNF, "Busqueda")
end

local function uiComercio()
  return rawget(SNF, "UIComercio")
end

-- En combate: la marca de los eventos de SNF.Compra (PLAYER_REGEN_DISABLED llega antes que InCombatLockdown()).
local function enCombate()
  local C = rawget(SNF, "Compra")
  if C and C.combate then
    return C.combate()
  end
  return InCombatLockdown and InCombatLockdown() and true or false
end

local function sinTooltip()
  local tt = rawget(_G, "GameTooltip")
  if tt and not tt:IsForbidden() then
    tt:Hide()
  end
end

-- Un texto de celda con su color (de la paleta de la tabla de comercio): la tabla no repone el color sola.
local function celdaTexto(fs, texto, color)
  fs:SetText(texto or "")
  local c = color or Estilo.comercio("texto")
  fs:SetTextColor(c[1], c[2], c[3], c[4] or 1)
end

local function gris()
  return Estilo.comercio("secundario")
end

local function numero(n)
  return SNF.Texto.numero(n or 0)
end

-- La clave de una fila: el itemKey entero en texto (el equipo, una por nivel).
local function claveDe(res)
  local k = res.clave
  if type(k) == "table" then
    return string.format("r:%s:%s:%s:%s", tostring(k.itemID or res.item), tostring(k.itemLevel or 0),
      tostring(k.itemSuffix or 0), tostring(k.battlePetSpeciesID or 0))
  end
  return string.format("r:%s:%s", tostring(res.item), tostring(res.nivel or 0))
end

-- El % del precio frente al valor de mercado de la app (nil si no hay): UIComercio.pctMercado (B2r: el mismo sitio que el
-- cuadro de cantidad).
local function pctDe(item, precio)
  local UI = uiComercio()
  return UI and UI.pctMercado and UI.pctMercado(item, precio) or nil
end

-- Lo que le queda a una subasta, sin espacio («23h», «30m»), y el token del color de su tramo: sus segundos o, si no los
-- hay, su franja (Enum.AuctionHouseTimeLeftBand, 0 a 3).
local function tiempoDe(s)
  local t = tonumber(s.tiempo)
  if t then
    t = max(0, floor(t))
    local color = t > TIEMPO.VERDE and "verde" or t >= TIEMPO.NARANJA and "naranja" or t >= TIEMPO.AMARILLO and "amarillo"
      or "rojo"
    if t < 60 then
      return L.t("SUBASTA_RES_TIEMPO_MENOS"), color
    elseif t < 3600 then
      return L.t("SUBASTA_RES_TIEMPO_M", floor(t / 60)), color
    end
    return L.t("SUBASTA_RES_TIEMPO_H", floor(t / 3600)), color
  end
  local banda = tonumber(s.banda)
  if banda and banda >= 0 and banda <= 3 then
    return L.t("SUBASTA_RES_BANDA_" .. floor(banda)), TIEMPO.BANDA[floor(banda)]
  end
  return L.t("COMERCIO_SIN_DATO"), nil
end

-- El token del color del % frente al valor de mercado y su texto (UIComercio.tokenPct y textoPct, los mismos que el
-- sniper y el cuadro de cantidad; B3r: «>999%» desde 1000).
local function colorPct(pct)
  return uiComercio().tokenPct(pct)
end

local function textoPct(pct)
  return uiComercio().textoPct(pct)
end

-- El nombre (con su sufijo) y la calidad del enlace de una subasta, o nil: UIComercio.deEnlace (T1a: un solo sitio para los
-- dos formatos, «|cnIQ<n>:» de WoW Forever y «|cffRRGGBB»; la calidad la lee SNF.Diario.calidadDeEnlace).
local function deEnlace(enlace)
  local UI = uiComercio()
  if UI and UI.deEnlace then
    return UI.deEnlace(enlace)
  end
  return nil
end

local function nombreYCalidad(res)
  local nombre, calidad = res.nombre, res.calidad
  local UI = uiComercio()
  if (not nombre or calidad == nil) and UI and UI.nombreYCalidad then
    local n, q = UI.nombreYCalidad(res.item)
    -- B2r ronda 1: una variante con sufijo no enseña el nombre sin sufijo mientras espera el suyo (lo da SNF.Busqueda).
    local sufijo = type(res.clave) == "table" and (tonumber(res.clave.itemSuffix) or 0) ~= 0
    nombre, calidad = nombre or (not sufijo and n or nil), calidad or q
  end
  return nombre or ("#" .. tostring(res.item)), calidad
end

local function colorCalidad(calidad)
  local UI = uiComercio()
  return UI and UI.colorCalidad and UI.colorCalidad(calidad) or Estilo.comercio("texto")
end

-- La compra elegida en esta vista (nil si no hay o es de otra página).
local function compraNuestra()
  local C = rawget(SNF, "Compra")
  if not C or not SNF.Comercio.activo() then
    return nil
  end
  local e = C.estado()
  return e and e.origen == ORIGEN and e or nil
end

---------------------------------------------------------------------------------------------------
-- Filas
---------------------------------------------------------------------------------------------------

local repintarLuego -- (más abajo) repintar, para los C_Timer de «Cargando…»

-- Las subfilas de la fila abierta: sus subastas o un aviso (cargando, ninguna). f.incompleta: el servidor no dio la
-- lista entera (la tabla pone «y más…» debajo, con su tope). f.pendiente: se han vuelto a pedir y aún no han llegado.
local function subfilasDe(f)
  local B = busqueda()
  local lista, info = nil, nil
  if B then
    lista, info = B.subastas(f.res)
  end
  local ahora = GetTime()
  local aviso = {{clave = f.clave .. ":cargando", aviso = "SUBASTA_RES_CARGANDO", elegible = false}}
  if type(lista) ~= "table" then
    if not CARGANDO.vistoEn and ahora - (CARGANDO.pedidoEn or 0) < CARGANDO.UMBRAL - 0.001 then
      return {} -- aún no: si llegan pronto, «Cargando…» no sale y se va
    end
    CARGANDO.vistoEn = CARGANDO.vistoEn or ahora
    return aviso
  end
  if CARGANDO.vistoEn then
    local falta = CARGANDO.MINIMO - (ahora - CARGANDO.vistoEn)
    if falta > 0.001 then
      -- Ya llegaron, pero «Cargando…» lleva poco a la vista: se queda hasta cumplir su mínimo (un solo C_Timer).
      if not CARGANDO.esperaMinimo and C_Timer then
        CARGANDO.esperaMinimo = true
        C_Timer.After(falta, function()
          CARGANDO.esperaMinimo = false
          if visible then
            ejecutar(repintarLuego)
          end
        end)
      end
      return aviso
    end
    CARGANDO.vistoEn = nil
  end
  f.cargadas = true -- sus subastas ya han llegado (aunque no quede ninguna)
  f.incompleta = type(info) == "table" and info.completa == false
  f.pendiente = type(info) == "table" and info.pendiente == true -- pedida otra vez y aún sin respuesta
  -- B3r, ronda 1: sus subastas no respondieron (tras los reintentos): la fila sigue con lo que enseñaba (lo de su lectura o
  -- de la búsqueda), sin vaciar su mínimo ni su %.
  f.sinRespuesta = type(info) == "table" and info.fallo == true
  local subs, vistas = {}, {}
  for i, s in ipairs(lista) do
    local nombre, calidadEnlace = deEnlace(s.enlace)
    local sf = {
      subasta = true, item = f.item, itemKey = f.res.clave, cantidad = tonumber(s.cantidad) or 0,
      precioUnidad = tonumber(s.precioUnidad), puja = tonumber(s.puja),
      vendedor = s.mercancia ~= true and s.vendedor or nil, -- una mercancía no lleva vendedor (B2r, punto 3)
      mia = s.mia == true, auctionID = tonumber(s.auctionID), total = tonumber(s.total), orden = i,
      -- F12: el juego junta lo tuyo y lo de otros en una fila: cuántas son tuyas y cuántas se compran (nil: no se sabe).
      propias = tonumber(s.propias), comprables = tonumber(s.comprables), cuenta = s.cuenta == true,
      paraMinimo = s.paraMinimo == true, dudosa = s.dudosa == true,
      iguales = tonumber(s.iguales), -- objeto suelto: cuántas subastas iguales de 1 agrupa esta fila (cuentan en la padre)
      mercancia = s.mercancia == true, enlace = s.enlace, nombre = nombre or f.nombre,
      colorNombre = colorCalidad(calidadEnlace or f.calidad),
    }
    sf.tiempo, sf.colorTiempo = tiempoDe(s)
    sf.comprable = sf.precioUnidad ~= nil and (sf.comprables or 0) > 0
    -- La clave sigue a la subasta aunque la lista cambie (la fila marcada es la que se compra): un objeto por su
    -- auctionID; una mercancía solo por su precio (hay un escalón por precio: si cambia su cantidad, sigue marcado).
    local k = sf.auctionID and ("a" .. sf.auctionID) or ("p" .. tostring(sf.precioUnidad))
    vistas[k] = (vistas[k] or 0) + 1
    sf.clave = f.clave .. ":" .. k .. (vistas[k] > 1 and ("-" .. vistas[k]) or "")
    if not quitadas[sf.clave] then
      subs[#subs + 1] = sf
    end
  end
  -- Por precio por unidad, de menos a más (las que solo admiten puja, al final; a igual precio, como llegaron).
  table.sort(subs, function(a, b)
    if a.precioUnidad ~= b.precioUnidad then
      if a.precioUnidad == nil or b.precioUnidad == nil then
        return b.precioUnidad == nil
      end
      return a.precioUnidad < b.precioUnidad
    end
    return a.orden < b.orden
  end)
  if #subs == 0 then
    subs[1] = {clave = f.clave .. ":ninguna", aviso = "SUBASTA_RES_SIN_SUBASTAS", elegible = false}
  end
  return subs
end

-- Lo que va debajo de las subastas de una fila abierta (topeSubfilas de la tabla): «y más…» si la lista no está entera;
-- si no, «y N más…» con las que no salen.
local function filaMas(f, ocultas)
  if f.incompleta then
    return {clave = f.clave .. ":mas", aviso = "SUBASTA_RES_Y_MAS", elegible = false}
  elseif ocultas > 0 then
    return {clave = f.clave .. ":mas", aviso = "SUBASTA_RES_Y_N_MAS", avisoN = ocultas, elegible = false}
  end
  return nil
end

local function filasDeAhora()
  local B = busqueda()
  local filas = {}
  for _, res in ipairs(B and B.resultados() or {}) do
    local nombre, calidad = nombreYCalidad(res)
    local f = {
      clave = claveDe(res), res = res, item = res.item, nombre = nombre, calidad = calidad, icono = res.icono,
      nivel = tonumber(res.nivel), cantidad = tonumber(res.cantidad) or 0, precioMin = tonumber(res.precioMin),
    }
    -- Toda fila de objeto se puede desplegar: la abierta con sus subastas; las demás, vacías hasta que se abran.
    f.subfilas = f.clave == abierta and subfilasDe(f) or {}
    -- Con sus subastas ya llegadas, el mínimo y lo disponible salen de ellas (punto 12 de B6r: lo de la búsqueda puede ser
    -- viejo); antes, lo de la búsqueda. Ronda 1: el mínimo no cuenta las tuyas (no se pueden comprar) y, sin ninguna
    -- subasta, queda vacío. Con la lista a medias, ver F4 abajo.
    local r = res.resumen -- B3r: su lectura (sin desplegar), si ya llegó
    local entera = type(r) == "table" and not r.fallo and r.completa == true
    local fuente = nil -- F4: de qué lectura sale lo de la fila: "lista", "medias" o nil (navegar)
    if f.cargadas and not f.sinRespuesta then
      local minimo, aparte, total, n = nil, nil, 0, 0
      for _, s in ipairs(f.subfilas) do
        if s.subasta then
          local iguales = s.iguales or 1 -- arreglo de la compra suelta: las subastas iguales que agrupa la fila
          n = n + iguales
          total = total + s.cantidad * iguales
          -- F12: la regla de SNF.Busqueda (resumir): cuenta la fila con algo de otros; lo dudoso se dice aparte.
          if s.precioUnidad and s.paraMinimo and (not minimo or s.precioUnidad < minimo) then
            minimo = s.precioUnidad
          elseif s.precioUnidad and s.dudosa and (not aparte or s.precioUnidad < aparte) then
            aparte = s.precioUnidad
          end
        end
      end
      aparte = aparte and (not minimo or aparte < minimo) and aparte or nil
      -- F4: Ctd, el mínimo y «(n)» salen siempre de UNA lectura (la misma regla que el tooltip), y fuente dice cuál:
      --   - la lista de debajo entera: de ella ("lista");
      --   - a medias, con una entera de antes en esta búsqueda (SNF.Busqueda no deja que la pise): de la entera ("lista"),
      --     como el tooltip (Busqueda.vivo); las subfilas siguen siendo la lista de ahora (lo que se compra) y el tooltip
      --     de la fila dice que están a medias (debajoMedias, con la hora de esa lista);
      --   - a medias sin entera: de la lista a medias si trae más unidades que navegar ("medias"); si no, todo de navegar,
      --     y el tooltip de la fila dice que lo de debajo es una lista a medias (debajoMedias, con la hora de esa lista).
      if not f.incompleta then
        f.cantidad, f.precioMin, f.subastas, fuente = total, minimo, n, "lista"
        f.minimoDudoso = aparte
      elseif entera then
        f.cantidad, f.precioMin, f.subastas, fuente = r.disponible or 0, r.minimo, r.subastas, "lista"
        f.minimoDudoso = r.minimoDudoso
        f.debajoMedias = r.pendiente and r.horaPendiente or nil
      elseif total > f.cantidad then
        f.cantidad, f.precioMin, f.subastas, fuente = total, minimo, n, "medias"
        f.minimoDudoso = aparte
      else
        -- F5 (detalle de la F4): la fila sale de navegar, pero debajo está la lista a medias: el tooltip lo dice,
        -- con su hora.
        f.debajoMedias = type(r) == "table" and not r.fallo and r.hora or nil
      end
    elseif type(r) == "table" and not r.fallo then
      -- Como con las subastas llegadas (F4: las tres de la misma lectura): la lista entera; a medias, la lista si trae
      -- más unidades que navegar y, si no, todo de navegar.
      if r.completa then
        fuente = "lista"
      elseif (r.disponible or 0) > f.cantidad then
        fuente = "medias"
      end
      if fuente then
        f.cantidad, f.precioMin, f.subastas = r.disponible or 0, r.minimo, r.subastas
        f.minimoDudoso = r.minimoDudoso
      end
    end
    -- F4: de qué lectura sale lo de la fila (lo dice su tooltip): "lista" o "medias", con la hora de esa lectura; nil, de
    -- navegar (sin leer, con la lectura fallida o con una lista a medias que trae menos).
    f.fuenteCtd = fuente
    f.horaLista = type(r) == "table" and r.hora or nil
    -- Espera su lectura (↻) hasta que llega (o llegan sus subastas al desplegarla).
    f.leida = f.cargadas == true or r ~= nil
    f.esperando = not f.leida
    f.pct = pctDe(f.item, f.precioMin)
    filas[#filas + 1] = f
  end
  return filas
end

---------------------------------------------------------------------------------------------------
-- Tabla
---------------------------------------------------------------------------------------------------

-- Lo que la columna Objeto añade a cada hueco de la tabla (se crea una vez por hueco): el icono.
local function adornos(h)
  if not h.snfIcono then
    h.snfIcono = h:CreateTexture(nil, "ARTWORK")
    h.snfIcono:SetSize(LADO_ICONO, LADO_ICONO)
    h.snfIcono:SetPoint("LEFT", h, "LEFT", X_ICONO, 0)
    -- B3r: «(n)» a la derecha del nombre, en dorado.
    h.snfCuenta = Tema.letra(h:CreateFontString(nil, "OVERLAY"), "tabla")
    h.snfCuenta:SetJustifyH("RIGHT")
    h.snfCuenta:SetWordWrap(false)
    h.snfCuenta:SetWidth(ANCHO_CUENTA)
    local c = Tema.color("oro")
    h.snfCuenta:SetTextColor(c[1], c[2], c[3], c[4])
    h.snfCuenta:Hide()
  end
  return h
end

-- Objeto: el icono y el nombre de la fila del objeto; en una subasta, solo el nombre (gris si no se puede comprar); en un
-- aviso, su texto en gris.
local function pintarObjeto(celda, f, ancho)
  local h = adornos(celda:GetParent())
  celda:ClearAllPoints()
  celda:SetPoint("LEFT", h, "LEFT", X_NOMBRE, 0)
  celda:SetWidth(max(1, ancho - X_NOMBRE - 6))
  if f.subasta or f.aviso then
    h.snfCuenta:Hide()
    h.snfIcono:Hide()
    if f.aviso then
      celdaTexto(celda, f.avisoN and L.t(f.aviso, numero(f.avisoN)) or L.t(f.aviso), gris())
    else
      celdaTexto(celda, f.nombre, f.comprable and f.colorNombre or gris())
    end
    return
  end
  h.snfIcono:SetTexture(f.icono or ICONO_DESCONOCIDO)
  h.snfIcono:Show()
  -- El sitio de «(n)» se guarda siempre: el nombre no cambia de ancho cuando llega la lectura.
  celda:SetWidth(max(1, ancho - X_NOMBRE - 6 - ANCHO_CUENTA))
  celdaTexto(celda, f.nombre, colorCalidad(f.calidad))
  h.snfCuenta:ClearAllPoints()
  h.snfCuenta:SetPoint("RIGHT", h, "LEFT", ancho - 6, 0)
  if f.subastas and f.subastas > 1 then
    h.snfCuenta:SetText(L.t("SUBASTA_RES_CUENTA", numero(f.subastas)))
    h.snfCuenta:Show()
  else
    h.snfCuenta:Hide()
  end
end

-- Una columna de texto: lo de la fila del objeto (fila) o lo de la subasta (sub), cada uno con su color si lo da (si no,
-- el normal, o gris en una subasta que no se puede comprar); vacía en los avisos.
local function pintarCelda(fila, sub)
  return function(celda, f)
    local texto, color = "", nil
    if f.subasta then
      if sub then
        texto, color = sub(f)
      end
      -- Una subasta que no se puede comprar va toda en gris, también su tiempo (ronda 1 de B6r).
      color = (not f.comprable and gris()) or (color and Tema.color(color)) or nil
    elseif not f.aviso and fila then
      texto, color = fila(f)
      color = color and Tema.color(color) or nil
    end
    celdaTexto(celda, texto or "", color)
  end
end

local function titulo(clave)
  return function()
    return L.t(clave)
  end
end

-- F12: la columna Vendedor de una subasta: otro personaje tuyo, «¿Tuya?» si no se sabe, su vendedor, «Tuya» si es toda
-- tuya o «Tú (5)» si la fila junta 5 tuyas con las de otros.
local function vendedorDeSubasta(s)
  if s.cuenta then
    return L.t("SUBASTA_RES_OTRO_PJ")
  elseif s.dudosa then
    return L.t("SUBASTA_RES_SIN_SABER")
  elseif s.vendedor then
    return s.vendedor
  elseif s.mia then
    return L.t("SUBASTA_RES_TUYA")
  elseif (s.propias or 0) > 0 then
    return L.t("SUBASTA_RES_TUYAS_N", numero(s.propias))
  end
  return ""
end

local COLUMNAS = {
  {clave = "objeto", titulo = titulo("COMERCIO_COL_OBJETO"), ancho = 190, peso = 12, justificado = "LEFT",
    valor = function(f) return f.nombre end, pintar = pintarObjeto},
  {clave = "nivel", titulo = titulo("SUBASTA_RES_COL_NIVEL"), ancho = 44, peso = 1, justificado = "RIGHT", -- B3r: antes 40
    valor = function(f) return f.nivel end,
    pintar = pintarCelda(function(f) return f.nivel and tostring(f.nivel) end)},
  {clave = "cantidad", titulo = titulo("SUBASTA_RES_COL_CTD"), ancho = 52, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.cantidad end,
    pintar = pintarCelda(function(f) return numero(f.cantidad) end, function(s) return numero(s.cantidad) end)},
  {clave = "tiempo", titulo = "", icono = "reloj", ayuda = titulo("SUBASTA_RES_COL_TIEMPO"), ancho = 34, peso = 1,
    justificado = "CENTER", valor = function() return nil end,
    pintar = pintarCelda(nil, function(s) return s.tiempo, s.colorTiempo end)},
  {clave = "vendedor", titulo = titulo("SUBASTA_RES_COL_VENDEDOR"), ancho = 96, peso = 1, justificado = "LEFT",
    valor = function() return nil end,
    pintar = pintarCelda(nil, vendedorDeSubasta)},
  {clave = "puja", titulo = titulo("SUBASTA_RES_COL_PUJA"), ancho = 112, peso = 1, justificado = "RIGHT",
    valor = function() return nil end,
    pintar = pintarCelda(nil, function(s) return s.puja and Tema.dinero(s.puja) or "" end)},
  {clave = "compra", titulo = titulo("SUBASTA_RES_COL_COMPRA"), ancho = 120, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.precioMin end,
    pintar = pintarCelda(function(f) return f.precioMin and Tema.dinero(f.precioMin) end,
      function(s) return s.precioUnidad and Tema.dinero(s.precioUnidad) or "" end)},
  {clave = "pct", titulo = titulo("COMERCIO_COL_PCT"), ancho = 50, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.pct end,
    pintar = pintarCelda(function(f)
      if f.pct then
        return textoPct(f.pct), colorPct(f.pct)
      end
    end)},
}

local pintarBarra -- (más abajo)

-- La fila marcada es la que se compra: la subasta elegida mientras su compra sigue en pie; si no, la fila abierta.
local function marcarElegida()
  local t = marcos.tabla
  if not t then
    return
  end
  local e = compraNuestra()
  if e and subElegida and e.fase ~= "error" and e.fase ~= "hecho" then
    t:elegir(subElegida)
  else
    t:elegir(abierta)
  end
end

-- Suelta la subasta elegida aquí: su compra se cancela si aún no está pedida al servidor y, con `motivo`, la barra dice
-- por qué.
local function soltarSubasta(motivo)
  local e = compraNuestra()
  if e and not (e.fase == "comprando" and e.esperando == "compra") then
    SNF.Compra.cancelar()
  end
  subElegida = nil
  porQue = motivo
end

-- La compra elegida aquí ya no se ve: una subasta que queda fuera de las TOPE_SUBFILAS de su fila (otras más baratas han
-- aparecido) se suelta (SNF.Compra.cancelar): nunca se compra una subasta que no se ve. Revisión B7, menor 2: si con la
-- lista ya llegada entera (ni a medias ni pedida otra vez) el escalón de una mercancía ya no está y su compra está lista
-- o por confirmar, también, y la barra dice «Esa subasta ya no está». (SNF.Compra no lo ve: con las más baratas caben las
-- unidades. Una subasta de objeto que ya no está la suelta SNF.Compra con «ya no está», con la lista entera, buscándola por
-- su auctionID; y la red del segundo clic no compra una que no está en lo último que dio el juego.) Ronda 2 del arreglo de
-- la compra suelta: el escalón de una mercancía se suelta también mientras la compra busca o espera su precio.
local function soltarSiNoSeVe(filas)
  if not subElegida then
    return
  end
  for _, f in ipairs(filas) do
    if f.clave == abierta then
      for i, s in ipairs(f.subfilas or {}) do
        if s.clave == subElegida then
          if i > TOPE_SUBFILAS then
            soltarSubasta(nil)
          end
          return
        end
      end
      -- Ronda 2 del arreglo de la compra suelta: también si la compra aún busca su subasta (el sistema de la subasta
      -- ocupado) o la mercancía espera su precio: no puede llegar tarde a un escalón que ya no se ve. Una compra ya pedida
      -- al juego, hecha o con error no se toca.
      local e = compraNuestra()
      if subElegidaMercancia and f.cargadas and not f.incompleta and not f.pendiente and e
        and not (e.fase == "comprando" and e.esperando == "compra") and e.fase ~= "hecho" and e.fase ~= "error" then
        soltarSubasta("COMERCIO_MOTIVO_YA_NO_ESTA")
      end
      return
    end
  end
end

local function pintarTabla()
  local t = marcos.tabla
  if not t then
    return
  end
  local filas = filasDeAhora()
  soltarSiNoSeVe(filas)
  if abierta then
    local sigue = false
    for _, f in ipairs(filas) do
      if f.clave == abierta then
        sigue = true
        break
      end
    end
    if not sigue then
      -- La fila abierta ya no está (o no queda ninguna): se olvida, también con la lista vacía. Ronda 2 del arreglo de la
      -- compra suelta: su subasta elegida ya no se ve, así que su compra se suelta (si aún no está pedida al juego).
      t:abrir(abierta, false)
      abierta = nil
      if subElegida then
        soltarSubasta(nil)
      end
    end
  end
  local leidas = 0
  for _, f in ipairs(filas) do
    if f.leida then
      leidas = leidas + 1
    end
  end
  LECTURA.leidas, LECTURA.total = leidas, #filas
  -- Nada se mueve solo (revisión B7, menor 5): se mantiene el orden de lo que ya se ve, salvo justo al acabar la búsqueda.
  t:poner(filas, not ordenarAlAcabar)
  ordenarAlAcabar = false
  marcarElegida()
  local B = busqueda()
  marcos.vacio:SetShown(B ~= nil and B.estado() == "completa" and #filas == 0)
end

-- Una búsqueda nueva: se cierra la fila abierta, se vuelve arriba y al orden de entrada (Compra, de menos a más).
local function nuevaBusqueda()
  -- Ronda 1 del arreglo de la compra suelta: nunca se compra lo que no se ve. Una búsqueda nueva (otra cosa o «Volver a
  -- escanear») suelta la compra elegida aquí, lista o por confirmar; una ya pedida al servidor sigue hasta que responda.
  local e = compraNuestra()
  if e and not (e.fase == "comprando" and e.esperando == "compra") then
    SNF.Compra.cancelar()
  end
  local t = marcos.tabla
  if t then
    if abierta then
      t:abrir(abierta, false)
    end
    t:elegir(nil)
    t:desplazar(-1000000)
    subElegida = nil
    porQue = nil
    quitadas = {}
    local clave, asc = t:orden()
    if clave ~= "compra" or asc ~= true then
      t:ordenarPor("compra", true)
    end
    t:olvidarOrden() -- lo que llega de esta búsqueda, en el orden en que llega
  end
  abierta = nil
  LECTURA.pausada, LECTURA.trasParar = false, false
end

-- Mira si ha empezado otra búsqueda desde la última vez (pasa a esperar o buscar desde parada o completa).
local function mirarEstado()
  local B = busqueda()
  local e = B and B.estado() or "parada"
  local antes = ultimoEstado
  ultimoEstado = e
  local busca = e == "esperando" or e == "buscando"
  if busca and antes ~= "esperando" and antes ~= "buscando" then
    nuevaBusqueda()
  elseif e == "completa" and antes ~= "completa" then
    ordenarAlAcabar = true -- acaba de acabar: la tabla se ordena una vez
  end
end

-- B3r: pide la lectura del primer objeto de la tabla (en su orden de ahora) que aún no está leído, si no hay otra pedida, la
-- búsqueda ha acabado y el jugador no la ha pausado. Una a la vez: la siguiente, cuando llegue esta (el aviso de la búsqueda
-- repinta). Solo con la página a la vista.
local function leerSiguiente()
  local B, t = busqueda(), marcos.tabla
  if not (visible and t and B and B.leyendo) or LECTURA.pausada or B.estado() ~= "completa" or B.leyendo() then
    return
  end
  local i = 1
  local f = t:fila(i)
  while f do
    if f.res and not f.subasta and not f.aviso and not f.leida then
      B.pedirSubastas(f.res, {leer = true})
      return
    end
    i = i + 1
    f = t:fila(i)
  end
end

local function repintar()
  if not marcos.pagina then
    return
  end
  mirarEstado()
  pintarTabla()
  leerSiguiente()
  pintarBarra()
end
repintarLuego = repintar

-- La subasta elegida deja de verse (se cierra su fila o se abre otra; ronda 1 de B6r): su compra se suelta
-- (SNF.Compra.cancelar, si no está ya pedida al servidor) y deja de estar marcada, como cuando queda fuera de las 10.
local function soltarElegida()
  if not subElegida then
    return
  end
  local e = compraNuestra()
  if e and not (e.fase == "comprando" and e.esperando == "compra") then
    SNF.Compra.cancelar()
  end
  subElegida = nil
end

-- Abre una fila de objeto: pide sus subastas y la abre (la de antes se cierra y su subasta elegida se suelta).
local function abrirFila(f)
  local t = marcos.tabla
  local B = busqueda()
  if not B then
    return
  end
  porQue = nil
  if abierta and abierta ~= f.clave then
    t:abrir(abierta, false)
    soltarElegida()
  end
  abierta = f.clave
  quitadas = {} -- llegan sus subastas de ahora
  -- «Cargando…» solo si tardan más de CARGANDO.UMBRAL s: pasado ese tiempo se repinta una vez (si ya llegaron, no cambia).
  CARGANDO.pedidoEn, CARGANDO.vistoEn = GetTime(), nil
  CARGANDO.turno = CARGANDO.turno + 1
  local turno = CARGANDO.turno
  if C_Timer then
    C_Timer.After(CARGANDO.UMBRAL, function()
      if turno == CARGANDO.turno and visible then
        ejecutar(repintar)
      end
    end)
  end
  B.pedirSubastas(f.res)
  pintarTabla()
  t:abrir(f.clave, true)
end

-- Pulsar una subasta: prepara su compra o, si no se puede, la barra dice por qué (punto 9 de B6r: nunca callado).
local function pulsarSubasta(f)
  local C = rawget(SNF, "Compra")
  porQue = nil
  if not C then
    marcarElegida()
    return
  end
  if not f.comprable then
    -- La de antes se suelta (el jugador ha pulsado otra) y la barra dice por qué esta no.
    local e = compraNuestra()
    if e and not (e.fase == "comprando" and e.esperando == "compra") then
      C.cancelar()
    end
    subElegida = nil
    porQue = (f.mia and "SUBASTA_RES_POR_QUE_TUYA") or (f.precioUnidad and f.dudosa and "SUBASTA_RES_POR_QUE_SIN_SABER")
      or "SUBASTA_RES_POR_QUE_SOLO_PUJA"
  -- EXACTAMENTE esta subasta (regla del coordinador): su precio por unidad, su cantidad y, de un objeto, su auctionID y su
  -- total; sin regla de grupo (exacta). No compra: deja la compra «lista» para el botón Comprar.
  -- F12: de una fila mixta se piden solo las de otros (comprables), nunca las tuyas.
  elseif C.elegir({item = f.item, precio = f.precioUnidad, cantidad = f.comprables, itemKey = f.itemKey, origen = ORIGEN,
    exacta = true, auctionID = f.auctionID, total = f.total}) then
    subElegida = f.clave
    subElegidaMercancia = f.mercancia == true
  elseif SNF.Comercio.activo() then
    -- SNF.Compra.elegir no la deja: otra compra (de esta vista, de la lista o del sniper) espera aún al servidor.
    porQue = "SUBASTA_RES_POR_QUE_OTRA_COMPRA"
  end
  marcarElegida()
  pintarBarra()
end

-- Pulsar una fila de objeto la abre; una subasta prepara su compra (los avisos no se pueden elegir).
local function alPulsar(f)
  if f.aviso then
    marcarElegida()
  elseif f.subasta then
    pulsarSubasta(f)
  else
    abrirFila(f)
  end
end

-- El triángulo de una fila: la tabla ya la ha abierto o cerrado. Abierta, como pulsarla; cerrada, se olvida.
local function alAbrir(f)
  local t = marcos.tabla
  porQue = nil
  if t:estaAbierta(f.clave) then
    abrirFila(f)
  else
    if abierta == f.clave then
      abierta = nil
      soltarElegida()
    end
    pintarTabla()
    marcarElegida()
    pintarBarra()
  end
end

-- El tooltip de una fila: el del objeto del juego (con el enlace de la subasta si lo hay: trae su sufijo) y, en una
-- subasta, el vendedor en gris y sus precios. Nuestras líneas de precio las pone ui/tooltip.lua. Solo Show.
local function lineasSubasta(f, tt)
  if not f.subasta then
    -- F4: la fila de un objeto dice de qué lectura sale su Ctd: del resumen de la búsqueda (con ↻, o si se quedó con lo
    -- de navegar) o de su lista, con la hora a la que se leyó (fija: no envejece en pantalla). Así se entiende si no
    -- coincide con «A la venta» de arriba, que es la última lista entera.
    -- Ronda 1: «(a medias)» si sale de una lista a medias; y, si debajo está la lista de ahora a medias y la fila sale de
    -- la entera de antes, «Debajo: lista a medias, hh:mm».
    local g = gris()
    if f.fuenteCtd and type(f.horaLista) == "number" then
      local clave = f.fuenteCtd == "medias" and "SUBASTA_RES_TT_CTD_LISTA_MEDIAS" or "SUBASTA_RES_TT_CTD_LISTA"
      tt:AddLine(L.t(clave, date("%H:%M", floor(f.horaLista))), g[1], g[2], g[3])
    else
      tt:AddLine(L.t("SUBASTA_RES_TT_CTD_RESUMEN"), g[1], g[2], g[3])
    end
    if f.fuenteCtd == "lista" and f.res and f.res.cantidad ~= f.cantidad then
      tt:AddLine(L.t("TRADE_QUANTITY_SNAPSHOTS", numero(f.res.cantidad), numero(f.cantidad)), g[1], g[2], g[3])
    end
    if type(f.debajoMedias) == "number" then
      tt:AddLine(L.t("SUBASTA_RES_TT_DEBAJO_MEDIAS", date("%H:%M", floor(f.debajoMedias))), g[1], g[2], g[3])
    end
    if f.minimoDudoso then -- F12: hay un precio más bajo que no se ha tomado como mínimo
      tt:AddLine(L.t("SUBASTA_RES_TT_MIN_APARTE", Tema.dinero(f.minimoDudoso)), g[1], g[2], g[3])
    end
  else
    if f.vendedor and not f.mercancia then -- una mercancía no lleva vendedor (B2r, punto 3)
      local g = gris()
      tt:AddLine(L.t("SUBASTA_RES_TT_VENDEDOR", f.vendedor), g[1], g[2], g[3])
    end
    -- F12: de quién es esta fila, si no es toda de otros.
    local g2 = gris()
    if f.cuenta then
      tt:AddLine(L.t("SUBASTA_RES_TT_OTRO_PJ"), g2[1], g2[2], g2[3])
    elseif f.dudosa then
      tt:AddLine(L.t("SUBASTA_RES_TT_SIN_SABER"), g2[1], g2[2], g2[3])
    elseif f.mercancia and not f.mia and (f.propias or 0) > 0 then
      local linea = L.t("SUBASTA_RES_TT_TUYAS", numero(f.propias), numero(f.cantidad), numero(f.comprables))
      tt:AddLine(linea, g2[1], g2[2], g2[3])
      -- Los campos del juego no distinguen a otro personaje tuyo dentro de una fila mixta (SNF.Comercio.duenoMercancia).
      tt:AddLine(L.t("SUBASTA_RES_TT_QUIZA_OTRO_PJ"), g2[1], g2[2], g2[3])
    end
    local c = Estilo.comercio("texto")
    local compra = f.precioUnidad and Tema.dinero(f.precioUnidad) or L.t("COMERCIO_SIN_DATO")
    if f.puja then
      tt:AddLine(L.t("SUBASTA_RES_TT_PRECIOS", Tema.dinero(f.puja), compra), c[1], c[2], c[3])
    else
      tt:AddLine(L.t("SUBASTA_RES_TT_COMPRA", compra), c[1], c[2], c[3])
    end
  end
end

-- T1a: con el ayudante común (UIComercio.tooltipObjeto: anclado a la derecha de la fila, o a la izquierda si no cabe).
local function enseniarTooltip(f, hueco)
  local UI = uiComercio()
  if not (UI and UI.tooltipObjeto) then
    return
  end
  if f.aviso or not f.item then
    -- No es un objeto («Cargando…», «y N más…»): si pasa a ser la fila del ratón, el tooltip del de antes se va.
    UI.soltarTooltipObjeto(hueco)
    return
  end
  UI.tooltipObjeto(hueco, {enlace = f.enlace, item = f.item, clave = f.clave, lineas = function(tt)
    -- F8: al rehacerse el tooltip con una lista nueva, los datos de ahora de esa fila (la tabla ya la ha repintado).
    local viva = hueco.fila
    lineasSubasta(viva and viva.clave == f.clave and viva or f, tt)
  end})
end

-- B3s: el objeto de una fila para el clic con tecla (TablaComercio, opciones.objeto): lo mismo que enseña su tooltip. Una
-- subfila, el enlace de su subasta (con su sufijo). Una fila de objeto no trae enlace: el del juego por su id, salvo en una
-- variante con sufijo, que tomaría el objeto sin sufijo; esa, el de su primera subasta si ya se ven (si no, nada). Un
-- aviso no es un objeto.
local function objetoDeFila(f)
  if f.aviso or not f.item then
    return nil
  end
  local clave = f.subasta and f.itemKey or (f.res and f.res.clave)
  local sufijo = type(clave) == "table" and (tonumber(clave.itemSuffix) or 0) ~= 0
  local enlace = f.enlace
  if not enlace and not f.subasta and sufijo then
    local primera = f.subfilas and f.subfilas[1]
    enlace = primera and primera.subasta and primera.enlace or nil
  end
  return enlace, not sufijo and f.item or nil
end

local function esconderTooltip(hueco)
  local UI = uiComercio()
  if UI and UI.esconderTooltipObjeto then
    UI.esconderTooltipObjeto(hueco, true) -- la luz de la tabla ya ha esperado (ronda 1)
  else
    sinTooltip()
  end
end

---------------------------------------------------------------------------------------------------
-- Barra de abajo
---------------------------------------------------------------------------------------------------

local function textoBusqueda()
  local B = busqueda()
  if not B then
    return ""
  end
  local e = B.estado()
  local n = #B.resultados()
  if e == "esperando" or (e == "buscando" and n == 0) then
    return L.t("SUBASTA_RES_BUSCANDO")
  elseif e == "buscando" then
    return L.t("SUBASTA_RES_BUSCANDO_N", numero(n))
  elseif e == "completa" then
    -- B3r: con objetos por leer, cómo va la lectura (o que está en pausa).
    if LECTURA.total > 0 and LECTURA.leidas < LECTURA.total and not LECTURA.trasParar then
      return L.t(LECTURA.pausada and "SUBASTA_RES_EN_PAUSA" or "SUBASTA_RES_LEYENDO", numero(LECTURA.leidas),
        numero(LECTURA.total))
    end
    if B.motivo() then
      return L.t("SUBASTA_RES_A_MEDIAS", numero(n))
    end
    return n == 1 and L.t("SUBASTA_RES_UN_OBJETO") or L.t("SUBASTA_RES_OBJETOS", numero(n))
  end
  return ""
end

-- Lo que dice la barra de una compra elegida aquí (nil si no hay nada que decir) y si es un error.
local function textoCompra(e)
  local n = numero(e.cantidad or 0)
  local UI = uiComercio()
  if e.fase == "buscando" then
    return L.t(e.esperando == "sistema" and "COMERCIO_BARRA_OCUPADA" or "COMERCIO_BARRA_BUSCANDO")
  elseif e.fase == "lista" then
    -- Ronda 1 de B6r: no cabían todas a su precio y la compra volvió con las que quedan.
    if e.quedan then
      return L.t("COMERCIO_BARRA_QUEDAN", numero(e.pedidas), numero(e.quedan))
    end
    -- Una compra cara pide dos clics: se dice siempre igual, sin depender de si el primero ya llegó (nada cambia solo).
    if e.aviso then
      return L.t("SUBASTA_RES_CARA", n, Tema.dinero(e.total or 0))
    end
    return L.t("COMERCIO_BARRA_LISTA", floor(e.cantidad or 0), Tema.dinero(e.total or 0))
  elseif e.fase == "confirmar" then
    if e.subio then
      return L.t("COMERCIO_BARRA_SUBIO", n, Tema.dinero(e.totalAntes or 0), Tema.dinero(e.total or 0))
    end
    if e.tipo == "objeto" then
      -- Arreglo de la compra suelta: el primer clic de un objeto suelto solo pide confirmar; el segundo compra.
      return L.t("COMERCIO_BARRA_CONFIRMAR_OBJETO", n, Tema.dinero(e.total or 0))
    end
    return L.t("COMERCIO_BARRA_CONFIRMANDO")
  elseif e.fase == "comprando" then
    if e.esperando == "precio" then
      return L.t("COMERCIO_BARRA_PRECIO", n)
    end
    return L.t("COMERCIO_BARRA_COMPRANDO", n, Tema.dinero(e.total or 0))
  elseif e.fase == "hecho" then
    return L.t("COMERCIO_BARRA_HECHO", n, Tema.dinero(e.total or 0))
  elseif e.fase == "error" then
    local motivo = UI and UI.textoMotivo and UI.textoMotivo(e) or L.t("COMERCIO_MOTIVO_FALLO")
    return L.t("COMERCIO_BARRA_ERROR", motivo), true
  end
  return nil
end

-- El texto de Comprar: lo que hará el clic. Con una mercancía «lista» el clic abre el cuadro de cantidad: «Elegir
-- cantidad…», sin unidades ni importe (B2r, punto 1: «Comprar 235 por X» hacía creer que solo se compraba la subasta
-- entera; la cantidad y el total se ven en el cuadro y la barra dice lo elegido con su importe exacto). Si no, lo que se va
-- a comprar, cuántas y el total: exacto si cabe con la letra del botón y, si no, redondeado hacia abajo con «~»
-- (UIComercio.etiquetaConImporte). Siempre del mismo color: ni rojo ni nada que cambie solo con el tiempo (el «Otra vez»
-- armado de la barra vieja se apaga solo a los 5 s; aquí no se enseña).
local function etiquetaComprar(e)
  if e.fase == "buscando" then
    return L.t("COMERCIO_BOTON_BUSCANDO")
  elseif e.fase == "comprando" then
    return L.t("COMERCIO_BOTON_COMPRANDO")
  elseif e.fase == "lista" and e.tipo == "mercancia" then
    return L.t("COMERCIO_ELEGIR_CANTIDAD")
  elseif (e.fase == "lista" or e.fase == "confirmar") and e.total then
    local clave = e.fase == "confirmar" and "SUBASTA_RES_CONFIRMAR" or "SUBASTA_RES_COMPRAR"
    local n = numero(e.cantidad or 0)
    local UI = uiComercio()
    if e.tipo == "objeto" and UI and UI.dinero then
      -- Ronda 1 del arreglo de la compra suelta: un objeto suelto, siempre con el importe exacto (sin «~»; el botón se
      -- ensancha si hace falta, UIComercio.ajustarBoton).
      return L.t(clave, n, UI.dinero(e.total)), true
    end
    if UI and UI.etiquetaConImporte then
      return UI.etiquetaConImporte(e.total, marcos.comprar.texto, ANCHO_COMPRAR - 8, function(x) return L.t(clave, n, x) end)
    end
    return L.t(clave, n, Tema.dinero(e.total))
  end
  return L.t("COMERCIO_COMPRAR")
end

-- El botón de pausa/seguir según la búsqueda: buscando, pausa; parada a medias, seguir; acabada o sin búsqueda, apagado
-- con el icono de seguir. Lo que hará (para su tooltip), o nil si no hará nada.
local function queHaraPausa()
  local B = busqueda()
  local e = B and B.estado() or "parada"
  if e == "esperando" or e == "buscando" then
    return "parar"
  elseif e == "completa" and LECTURA.total > 0 and LECTURA.leidas < LECTURA.total and not LECTURA.trasParar then
    return LECTURA.pausada and "seguirLectura" or "pausarLectura" -- B3r
  elseif e == "completa" and B.motivo() then
    return "seguir"
  end
  return nil
end

local function pintarPausa()
  local b = marcos.pausa
  if not b then
    return
  end
  local hara = queHaraPausa()
  Tema.icono(b.icono, (hara == "parar" or hara == "pausarLectura") and "pausa" or "seguir")
  b:ponerApagado(hara == nil)
end

pintarBarra = function()
  local barra = marcos.barra
  if not barra then
    return
  end
  pintarPausa()
  local B = busqueda()
  local e = compraNuestra()
  -- El avance sigue solo a la búsqueda: el mismo color siempre, más lleno al acabar y nunca hacia atrás en una búsqueda.
  local lleno = AVANCE[B and B.estado() or "parada"] or 0
  local ancho = barra:GetWidth() or 0
  barra.relleno:SetWidth(max(1, (ancho - 2) * lleno))
  barra.relleno:SetShown(lleno > 0 and ancho > 2)
  local linea, esError = nil, false
  if e then
    linea, esError = textoCompra(e)
    if (e.fase == "lista" or e.fase == "confirmar") and enCombate() then
      linea = L.t("SUBASTA_RES_EN_COMBATE") -- Comprar va apagado: la barra dice por qué
    end
  elseif porQue then
    linea = L.t(porQue)
  end
  barra.texto:SetText(linea or textoBusqueda())
  local c = Tema.color(esError and "error" or "texto")
  barra.texto:SetTextColor(c[1], c[2], c[3], c[4])

  local b = marcos.comprar
  local etiqueta, exacto = L.t("COMERCIO_COMPRAR"), false
  if e then
    etiqueta, exacto = etiquetaComprar(e)
  end
  b:ponerTexto(etiqueta)
  local UI = uiComercio()
  if UI and UI.ajustarBoton then
    UI.ajustarBoton(b, b.texto, etiqueta, ANCHO_COMPRAR, b.espacioFijo, exacto) -- ronda 1: el importe exacto cabe entero
  end
  b:ponerApagado(not (e ~= nil and (e.fase == "lista" or e.fase == "confirmar") and not enCombate()))
  if marcos.publicar then
    marcos.publicar:ponerApagado(not (e and e.item and e.fase ~= "comprando" and not enCombate()))
  end
end

-- El clic de Comprar, antes de comprar: el flujo de siempre. true si toca SNF.Compra.pulsar(); false en combate, sin
-- compra elegida aquí o si una mercancía «lista» ha abierto el cuadro de cantidad (que pide la confirmación).
local function alComprar()
  if enCombate() then
    return false
  end
  local e = compraNuestra()
  if not e then
    return false
  end
  local cuadro = rawget(SNF, "CantidadComercio")
  if e.fase == "lista" and e.tipo == "mercancia" and cuadro and cuadro.abrir({sinRojo = true}) == true then
    return false
  end
  return true
end

---------------------------------------------------------------------------------------------------
-- Buscar y salir
---------------------------------------------------------------------------------------------------

local function lanzar(texto)
  local Navegar = rawget(SNF, "SubastaNavegar")
  local B = busqueda()
  if not (Navegar and B) then
    return
  end
  local antes = B.estado()
  if Navegar.buscar(texto) then
    ultimoTexto = Navegar.marcos.campo:GetText() -- lo buscado, ya recortado
    marcos.campo:SetText(ultimoTexto)
    if antes == "esperando" or antes == "buscando" then
      nuevaBusqueda() -- sin pasar por parada o completa: mirarEstado no lo vería
    end
    repintar()
  end
end

local function volverAEscanear()
  local t = marcos.campo:GetText()
  if not string.find(t, "%S") then
    t = ultimoTexto
  end
  marcos.campo:ClearFocus()
  lanzar(t)
end

local function salirDelEscaneo()
  local B = busqueda()
  if B then
    B.salir()
  end
  Ventana.elegir("navegar")
end

---------------------------------------------------------------------------------------------------
-- Crear
---------------------------------------------------------------------------------------------------

-- Lo que depende del ancho: el de «Salir» (su texto), el de «Volver a escanear» y el del campo entre los dos.
local function colocar()
  local p = marcos.pagina
  if not p then
    return
  end
  local s = marcos.salir
  s:SetWidth(math.ceil(s.texto:GetStringWidth()) + 2)
  -- «Volver a escanear» con holgura: la letra del juego mide algo más que la que se calcula.
  local v = marcos.volver
  v:SetWidth(math.ceil(Tema.anchoTexto(v.texto) / HOLGURA) + 2 * 8) -- texto anclado a los dos lados: entero (B2r ronda 1)
  local libre = (p:GetWidth() or 0) - 2 * MARGEN - s:GetWidth() - marcos.volver:GetWidth() - 2 * HUECO
  marcos.campo:SetWidth(max(80, libre))
  pintarBarra()
end

local function crearFila2(p)
  local s = botonBase(p, function()
    ejecutar(salirDelEscaneo)
  end)
  s:SetHeight(ALTO_FILA2)
  s:SetPoint("TOPLEFT", p, "TOPLEFT", MARGEN, -ARRIBA)
  s.texto = Tema.letra(s:CreateFontString(nil, "OVERLAY"), "texto", TAMANO_LETRA)
  s.texto:SetPoint("LEFT", s, "LEFT", 0, 0)
  s.texto:SetWordWrap(false)
  s.texto:SetText(L.t("SUBASTA_RES_SALIR"))
  Piezas.interno.colorTexto(s.texto, "acento")
  marcos.salir = s

  local volver = Piezas.boton(p, L.t("SUBASTA_RES_VOLVER"), function()
    ejecutar(volverAEscanear)
  end, {alto = ALTO_FILA2})
  volver:SetPoint("TOPRIGHT", p, "TOPRIGHT", -MARGEN, -ARRIBA)
  marcos.volver = volver

  local campo = Piezas.campo(p, {ancho = 300, lupa = true, placeholder = L.t("SUBASTA_NAV_BUSCAR_CASA")})
  Tema.letra(campo, "texto", TAMANO_LETRA)
  Tema.letra(campo.marcador, "texto", TAMANO_LETRA)
  campo:SetPoint("TOPLEFT", s, "TOPRIGHT", HUECO, 0)
  campo:SetTextInsets(MARGEN_CAMPO, MARGEN_CAMPO, 0, 0)
  campo.marcador:SetPoint("RIGHT", campo, "RIGHT", -MARGEN_CAMPO, 0)
  campo:SetScript("OnEnterPressed", proteger(function(self)
    self:ClearFocus()
    ejecutar(lanzar, self:GetText())
  end))
  Piezas.interno.sinTecladoEnCombate(campo)
  marcos.campo = campo

  local borrar = Piezas.botonIcono(campo, "cerrar", function()
    campo:SetText("")
  end, {tamano = LADO_X, color = "apagado"})
  borrar:SetPoint("RIGHT", campo, "RIGHT", -8, 0)
  marcos.borrar = borrar
end

local function crearTabla(p)
  local fondo = CreateFrame("Frame", nil, p)
  fondo:SetPoint("TOPLEFT", p, "TOPLEFT", MARGEN, -(ARRIBA + ALTO_FILA2 + HUECO))
  fondo:SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT", -MARGEN, ABAJO + ALTO_PIE + HUECO)
  Estilo.panelComercio(fondo, "filas")
  marcos.fondoTabla = fondo
  local t = TablaComercio.crear(fondo, {
    columnas = COLUMNAS,
    filasVisibles = 15,
    estirar = true, -- llena su sitio y sigue a la ventana
    orden = {clave = "compra", asc = true},
    ejecutar = function(nombre, fn, ...)
      return SNF.Comercio.ejecutar(nombre, fn, ...)
    end,
    -- Las opciones de B6r: triángulos, ⋮ apagado (aún sin menú de columnas), separadores y tope de subfilas.
    triangulos = true,
    separadores = true,
    menu = {ayuda = titulo("SUBASTA_RES_MENU_PRONTO")},
    topeSubfilas = {n = TOPE_SUBFILAS, fila = filaMas},
    alPulsar = alPulsar,
    alAbrir = alAbrir,
    objeto = objetoDeFila, -- B3s: Mayús + clic al chat, Ctrl + clic al probador; con tecla no se elige ni se despliega
    alEntrar = enseniarTooltip,
    alSalir = esconderTooltip,
  })
  t.marco:SetPoint("TOPLEFT", fondo, "TOPLEFT", 1, -1)
  t.marco:SetPoint("BOTTOMRIGHT", fondo, "BOTTOMRIGHT", -1, 1)
  marcos.tabla = t
  local vacio = Tema.letra(fondo:CreateFontString(nil, "OVERLAY"), "texto")
  vacio:SetPoint("CENTER", fondo, "CENTER", 0, 0)
  vacio:SetText(L.t("SUBASTA_RES_VACIO"))
  celdaTexto(vacio, L.t("SUBASTA_RES_VACIO"), gris())
  vacio:Hide()
  marcos.vacio = vacio
end

-- Añade a un botón un tooltip con el texto que da `texto()` (solo con el ratón; sin animación).
local function conAyuda(b, texto)
  local entrar, salir = b:GetScript("OnEnter"), b:GetScript("OnLeave")
  b:SetScript("OnEnter", proteger(function(self, ...)
    if entrar then
      entrar(self, ...)
    end
    local tt = rawget(_G, "GameTooltip")
    local t = texto()
    if t and tt and not tt:IsForbidden() then
      tt:SetOwner(self, "ANCHOR_TOP")
      tt:SetText(t, 1, 1, 1, 1, true)
      tt:Show()
    end
  end))
  b:SetScript("OnLeave", proteger(function(self, ...)
    if salir then
      salir(self, ...)
    end
    sinTooltip()
  end))
end

-- La pausa del escaneo (pulsar hace lo que dice su tooltip).
local function alPausa()
  local hara = queHaraPausa()
  local B = busqueda()
  if hara == "parar" and B then
    -- Ronda 1: parar es parar: la lectura de lo que ya llegó queda en pausa con la búsqueda (ninguna petición más).
    LECTURA.pausada, LECTURA.trasParar = true, true
    B.detener()
    if B.soltarLectura then
      B.soltarLectura()
    end
    repintar()
  elseif hara == "pausarLectura" and B then
    -- B3r: la lectura en pausa: la que espera a salir se olvida (la que va en camino llega).
    LECTURA.pausada = true
    if B.soltarLectura then
      B.soltarLectura()
    end
    repintar()
  elseif hara == "seguirLectura" then
    LECTURA.pausada = false
    repintar()
  elseif hara == "seguir" then
    volverAEscanear()
  end
end

local function crearPie(p)
  -- La pausa/seguir del escaneo, a la izquierda: cuadrada, del alto de la barra.
  local pausa = Piezas.botonCuadrado(p, "seguir", function()
    ejecutar(alPausa)
  end, {lado = ALTO_PIE, tamanoIcono = LADO_PAUSA_ICONO})
  pausa:SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", MARGEN, ABAJO)
  conAyuda(pausa, function()
    local hara = queHaraPausa()
    return L.t(hara == "parar" and "SUBASTA_RES_PAUSA_PARAR" or hara == "seguir" and "SUBASTA_RES_PAUSA_SEGUIR"
      or hara == "pausarLectura" and "SUBASTA_RES_PAUSA_LECTURA" or hara == "seguirLectura" and "SUBASTA_RES_SEGUIR_LECTURA"
      or "SUBASTA_RES_PAUSA_NADA")
  end)
  pausa:ponerApagado(true)
  marcos.pausa = pausa

  -- SNF.Compra.pulsar() solo desde aquí, el OnClick del botón que pulsa el jugador (una compra por clic).
  local b = Piezas.boton(p, L.t("COMERCIO_COMPRAR"), function()
    ejecutar(function()
      if alComprar() then
        SNF.Compra.pulsar()
      end
    end)
  end, {alto = ALTO_PIE, ancho = ANCHO_COMPRAR})
  b:SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT", -(MARGEN + Piezas.CABECERA.asa), ABAJO) -- el asa va en la esquina
  b.texto:SetWordWrap(false)
  local entrar, salir = b:GetScript("OnEnter"), b:GetScript("OnLeave")
  b:SetScript("OnEnter", proteger(function(self, ...)
    if entrar then
      entrar(self, ...)
    end
    local tt = rawget(_G, "GameTooltip")
    if enCombate() and tt and not tt:IsForbidden() then
      tt:SetOwner(self, "ANCHOR_TOP")
      tt:SetText(L.t("SUBASTA_RES_EN_COMBATE"), 1, 1, 1, 1, true)
      tt:Show()
    end
  end))
  b:SetScript("OnLeave", proteger(function(self, ...)
    if salir then
      salir(self, ...)
    end
    sinTooltip()
  end))
  b:ponerApagado(true)
  marcos.comprar = b

  -- Bidding is separate. The sell shortcut prepares a queue and leaves the actual posting to its button.
  local pujar = Piezas.boton(p, L.t("SUBASTA_RES_PUJAR"), nil, {alto = ALTO_PIE, ancho = ANCHO_PUJAR})
  pujar:SetPoint("BOTTOMRIGHT", b, "BOTTOMLEFT", -HUECO, 0)
  pujar.texto:SetWordWrap(false)
  pujar:ponerApagado(true)
  conAyuda(pujar, function()
    local e = compraNuestra()
    local mercancia = e and (e.tipo == "mercancia" or (e.tipo == nil and subElegidaMercancia))
    return L.t(mercancia and "SUBASTA_RES_PUJAR_MERCANCIA" or "SUBASTA_RES_PUJAR_AYUDA")
  end)
  marcos.pujar = pujar
  local publicar = Piezas.boton(p, L.t("SUBASTA_RES_PUBLICAR"), function()
    ejecutar(function()
      local e = compraNuestra()
      if not e or not e.item or e.fase == "comprando" or enCombate() then return end
      SNF.SubastaVentana.elegir("subasta")
      SNF.AuctionOrders.escanearItem(e.item, e.clave)
    end)
  end, {alto = ALTO_PIE, ancho = ANCHO_PUBLICAR})
  publicar:SetPoint("BOTTOMRIGHT", pujar, "BOTTOMLEFT", -HUECO, 0)
  publicar.texto:SetWordWrap(false)
  publicar:ponerApagado(true)
  conAyuda(publicar, function()
    return L.t("TRADE_SCAN_SELECTED")
  end)
  marcos.publicar = publicar

  local barra = CreateFrame("Frame", nil, p)
  barra:SetPoint("BOTTOMLEFT", pausa, "BOTTOMRIGHT", HUECO, 0)
  barra:SetPoint("TOPRIGHT", publicar, "TOPLEFT", -HUECO, 0)
  Tema.panel(barra, "hundido", {borde = true})
  local relleno = Piezas.interno.plana(barra, "ARTWORK", 0)
  relleno:SetPoint("TOPLEFT", barra, "TOPLEFT", 1, -1)
  relleno:SetPoint("BOTTOMLEFT", barra, "BOTTOMLEFT", 1, 1)
  local c = Estilo.comercio("acento")
  relleno:SetVertexColor(c[1], c[2], c[3], ALFA_AVANCE)
  relleno:Hide()
  barra.relleno = relleno
  barra.texto = Tema.letra(barra:CreateFontString(nil, "OVERLAY"), "texto", TAMANO_LETRA)
  barra.texto:SetPoint("LEFT", barra, "LEFT", 8, 0)
  barra.texto:SetPoint("RIGHT", barra, "RIGHT", -8, 0)
  barra.texto:SetJustifyH("CENTER")
  barra.texto:SetWordWrap(false)
  barra:SetScript("OnSizeChanged", proteger(function()
    ejecutar(pintarBarra)
  end))
  marcos.barra = barra
end

local function crear(p)
  marcos.pagina = p
  crearFila2(p)
  crearTabla(p)
  crearPie(p)
  local previo = p:GetScript("OnSizeChanged")
  p:SetScript("OnSizeChanged", proteger(function(self, ...)
    if previo then
      previo(self, ...)
    end
    ejecutar(colocar)
  end))
  -- Combate (el botón Comprar y el teclado del campo) y nombres de objetos: solo mientras la página se ve.
  p:SetScript("OnEvent", proteger(function(_, evento)
    if evento == "GET_ITEM_INFO_RECEIVED" then
      if not nombresPendientes and C_Timer then
        nombresPendientes = true
        C_Timer.After(ESPERA_NOMBRES, function()
          nombresPendientes = false
          if visible then
            ejecutar(pintarTabla)
          end
        end)
      end
      return
    end
    -- La marca del combate (por si este oyente va antes que el de SNF.Compra): solo con los dos eventos del combate.
    local C = rawget(SNF, "Compra")
    if C and evento == "PLAYER_REGEN_DISABLED" then
      C.enCombate = true
    elseif C and evento == "PLAYER_REGEN_ENABLED" then
      C.enCombate = false
    end
    if evento == "PLAYER_REGEN_DISABLED" then
      marcos.campo:ClearFocus()
    end
    ejecutar(pintarBarra)
  end))
  ejecutar(colocar)
end

local function mostrar()
  local p = marcos.pagina
  if not p then
    return
  end
  visible = true
  p:RegisterEvent("PLAYER_REGEN_DISABLED")
  p:RegisterEvent("PLAYER_REGEN_ENABLED")
  p:RegisterEvent("GET_ITEM_INFO_RECEIVED")
  ejecutar(function()
    local Navegar = rawget(SNF, "SubastaNavegar")
    local buscado = Navegar and Navegar.marcos.campo and Navegar.marcos.campo:GetText() or ""
    if string.find(buscado, "%S") then
      ultimoTexto = buscado
    end
    marcos.campo:SetText(ultimoTexto)
    colocar()
    repintar()
  end)
end

local function ocultar()
  local p = marcos.pagina
  if not p then
    return
  end
  visible = false
  p:UnregisterEvent("PLAYER_REGEN_DISABLED")
  p:UnregisterEvent("PLAYER_REGEN_ENABLED")
  p:UnregisterEvent("GET_ITEM_INFO_RECEIVED")
  sinTooltip()
  marcos.campo:ClearFocus()
  -- B3r: la lectura solo corre con la vista a la vista: la que espera a salir se olvida (al volver, sigue por donde iba).
  local B = busqueda()
  if B and B.soltarLectura then
    B.soltarLectura()
  end
  -- La compra elegida aquí no se queda preparada fuera de su vista (ni su cuadro de cantidad abierto).
  local cuadro = rawget(SNF, "CantidadComercio")
  if cuadro and cuadro.abierto() then
    pcall(cuadro.cerrar)
  end
  if compraNuestra() then
    ejecutar(SNF.Compra.cancelar)
  end
end

local function idioma()
  marcos.salir.texto:SetText(L.t("SUBASTA_RES_SALIR"))
  marcos.volver:ponerTexto(L.t("SUBASTA_RES_VOLVER"))
  marcos.publicar:ponerTexto(L.t("SUBASTA_RES_PUBLICAR"))
  marcos.pujar:ponerTexto(L.t("SUBASTA_RES_PUJAR"))
  marcos.campo.marcador:SetText(L.t("SUBASTA_NAV_BUSCAR_CASA"))
  marcos.vacio:SetText(L.t("SUBASTA_RES_VACIO"))
  ejecutar(function()
    colocar()
    repintar()
  end)
end

Ventana.registrar("resultados", {crear = crear, mostrar = mostrar, ocultar = ocultar, idioma = idioma})

-- La búsqueda avisa (como mucho una vez por fotograma): se mira si empezó otra y, si la página se ve, se repinta.
SNF.escuchar("SNF_COMERCIO_BUSQUEDA", function()
  ejecutar(function()
    if visible then
      repintar()
    else
      mirarEstado()
    end
  end)
end)

-- La compra cambia (elegida, lista, hecha, error…): la barra, el botón y la fila marcada. Si la subasta de objeto elegida
-- aquí ya no está, se quita de la lista en memoria y la tabla se repinta sin ella, sin pedir nada al servidor (sin
-- destellos: solo se va esa fila).
SNF.escuchar("SNF_COMERCIO_COMPRA", function(fase, e)
  -- Ronda 1 de B6r: si la compra queda libre (ninguna, hecha, con error), el porqué de «otra compra espera» ya no vale.
  -- Ronda 2: también con la vista escondida (si no, al volver saldría el viejo).
  if not (type(e) == "table" and e.fase == "comprando" and e.esperando == "compra") then
    porQue = nil
  end
  if not visible then
    return
  end
  ejecutar(function()
    -- Solo una subasta de objeto que «ya no está» (por su auctionID): la lista de ahora ya llega sola con la búsqueda de la
    -- compra (Busqueda la vuelve a leer), y una mercancía que cambió de cantidad o de precio sigue a la vista con lo de
    -- ahora (punto 12 de B6r: esconderla dejaba fuera de la vista subastas que la compra sí usa).
    if fase == "error" and type(e) == "table" and e.origen == ORIGEN and e.motivo == "ya_no_esta" and subElegida
      and not subElegidaMercancia then
      quitadas[subElegida] = true
      subElegida = nil
      pintarTabla()
    end
    -- Revisión B7, menor 7: la subasta de objeto elegida aquí y ya comprada se quita también (solo si la «hecha» es la
    -- compra de ahora: una compra vieja que se ve hecha después no es la elegida).
    local ahora = compraNuestra()
    if fase == "hecho" and type(e) == "table" and e.origen == ORIGEN and e.tipo == "objeto" and subElegida
      and not subElegidaMercancia and ahora and ahora.fase == "hecho" then
      quitadas[subElegida] = true
      subElegida = nil
      pintarTabla()
    end
    marcarElegida()
    pintarBarra()
  end)
end)

-- El comercio se apaga: Comprar se apaga también (el cortafuegos ya no deja pasar nada: un pcall sin más).
SNF.escuchar("SNF_COMERCIO_APAGADO", function()
  if visible and marcos.comprar then
    pcall(marcos.comprar.ponerApagado, marcos.comprar, true)
  end
end)
