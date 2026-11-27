-- SnetForever: ventana de comercio dentro de la subasta (fase 1 del comercio, tarea 12; dentro de la subasta, tarea 9). Grupos a la izquierda y, a la
-- derecha, la lista de lo que da el escaneo en vivo: icono y nombre (color de calidad), cantidad, precio unitario,
-- % de lo normal con colores, ritmo de venta en la misma fila y la señal de buena compra (regla de compra del grupo). F1
-- (ronda 1): el precio, las unidades y el veredicto de cada fila salen de una sola foto, la que elige SNF.Subasta.foto (la
-- lista de Navegar, si no la foto de la app y, solo sin ella, el escaneo), y la columna Foto dice cuál y de cuándo.
-- La lista es una tabla ordenable (ui/comercio_tabla.lua): columnas objeto, nivel, cantidad, precio, %, ritmo y foto; pulsar
-- una cabecera ordena (otra vez, al revés). Con el ratón sobre una fila (y en el sniper) sale el tooltip del objeto con el
-- ayudante común UIComercio.tooltipObjeto (T1a), también en los escalones de una mercancía. Sin elegir nada, sin precios de la app va por cantidad de mayor a menor y
-- con precios por % de menor a mayor. El orden elegido se guarda en SnetForeverCuenta.comercio.ordenLista = {clave, asc}.
-- La fila elegida sale siempre de SNF.Compra.estado().item. Se repinta como mucho cada 0,5 s al llegar
-- SNF_COMERCIO_ESCANEO y, con el mismo límite, al llegar SNF_COMERCIO_BUSQUEDA solo si trae una lista nueva de verdad
-- (SNF.Busqueda.versionVivo() distinta de la del último repintado por ese aviso; al cerrar la subasta se olvida).
--
-- No se crea nada hasta SNF_COMERCIO_ABIERTA (la subasta abierta); se oculta con SNF_COMERCIO_CERRADA. Todo el trabajo
-- (oyentes, repintados, scripts) va dentro de Comercio.ejecutar: un fallo apaga el comercio, no el resto del addon.
-- Con el comercio apagado (SNF_COMERCIO_APAGADO) la cabecera lo dice, la barra de compra se queda sin botones y la
-- ventana se puede seguir ocultando con «Vista de Blizzard» y volviendo a enseñar con su pestaña (esos scripts van con un
-- pcall sin más cuando el cortafuegos está cerrado).
--
-- Barra de abajo (pie, 28 px; tareas 13 y 6): pulsar una fila llama a SNF.Compra.elegir con esa fila. A la izquierda, la barra
-- de progreso dice el estado: escaneando, escaneo completo, buscando la subasta, lista para comprar N por X y
-- confirmando (o el error, en rojo). A la derecha, Comprar (relleno de acento; rojo y con el total cuando la compra pasa
-- de comercioAvisoOro o el precio ha subido; gris si no se puede pulsar) y Descartar (gris), de 107 px. Comprar llama a
-- SNF.Compra.pulsar() desde su OnClick (la única llamada del addon: las compras solo las hace un clic del jugador) o,
-- con una mercancía «lista», abre el cuadro de cantidad. Un objeto suelto (arreglo de la compra suelta, 2026-11-19) pide
-- siempre dos clics: «Comprar 1 por X» y, tras el primero (que no compra), «Confirmar 1 por X», con el total exacto (sin
-- «~»: si no cabe en sus 107 px, el botón se ensancha lo justo y la barra de progreso se encoge; UIComercio.ajustarBoton). Se repinta con SNF_COMERCIO_COMPRA, que también apunta en el
-- chat lo comprado. Junto a los botones, «Llevas X de Y» en pequeño (SNF.Compra.gastado()) y el engranaje.
-- Ventanita del engranaje (marco.ajustes): dos cajas en oro entero, el tope de gasto de la sesión (comercioTope, 0 = sin
-- tope) y desde cuánto pide un segundo clic una compra (comercioAvisoOro), la casilla «elegir sola la fila siguiente
-- tras comprar» (comercioSiguienteSola) y, desde la tarea S2, la casilla «Sonido al encontrar algo» del sniper
-- (comercioSniperSonido), y la del tope prudente (comercioPrudente). Intro o salir de la caja guarda (recortado a 0..Ajustes.LIMITES); lo que no es un
-- número entero no negativo no cambia nada y la caja vuelve a lo que había; Escape deshace. Solo las cambia el jugador:
-- la IA no tiene forma de tocarlas.
--
-- El escaneo en vivo (SNF.Escaneo, tarea 10) puede no existir: sin él la lista sale vacía y la cabecera dice
-- COMERCIO_ESPERANDO. Se usa su interfaz prevista: estado() -> 'parado'|'esperando'|'escaneando'|'completo' y
-- datos() -> {[item] = {precio, cantidad, hora}} (hora en segundos del servidor, como GetServerTime).
--
-- UIComercio.abrir() -> boolean        enseña la ventana (la crea la primera vez); solo con el comercio activo.
-- UIComercio.cerrar()                  la oculta.
-- UIComercio.aLaVista() -> boolean     F13: nuestra ventana se ve de verdad: IsVisible (también sus padres: Alt+Z), sin el velo ni
--                                      la espera de los primeros fotogramas (TSM aún puede quedarse la subasta) y con la subasta
--                                      nuestra o usable. Es lo que mira SNF.Comercio.ventanaVisible, la puerta de toda petición.
-- UIComercio.momento(fuente, segundos) y UIComercio.momentoHora(fuente, hora) -> texto   F1: de qué foto sale un precio de
--                                      ahora y de cuándo es (ver junto a sus funciones): el tooltip con «hace N min», las
--                                      tablas (columna Foto de la lista y del sniper) con la hora fija de la foto.
-- UIComercio.fila(i) -> {item, nombre, nivel, cantidad, precio, pct, color, ritmo, buena, rotacionSinConfirmar?, fuente, edad, hora} | nil   la fila i de la
--                                      lista en el orden que se ve (color: 'azul'|'verde'|'amarillo'|'naranja'|'rojo',
--                                      nil sin %; ritmo nil si la app no lo sabe; nivel = nivel de objeto, nil si no se
--                                      sabe; rotacionSinConfirmar, F9p: una mercancía aprobada, ver Reglas.evaluar).
-- UIComercio.ICONO_SIN_CONFIRMAR       F9p: la marca fija de una mercancía aprobada (la interrogación amarilla del juego), en vez
--                                      del visto verde; la usan la lista y el sniper.
-- UIComercio.lineaSinConfirmar(tt)     F9p: añade al tooltip de esa fila la línea que lo explica.
-- UIComercio.lineasDeFila(item) -> fn(tt)   F9p, ronda 1: las líneas de la fila de la lista, miradas cada vez con la foto de
--                                      ahora: el repintado del tooltip (F8) las vuelve a poner y dicen lo mismo que la marca.
-- UIComercio.tabla() -> t | nil        la tabla de la lista (TablaComercio), para las pruebas.
-- UIComercio.grupo() -> clave | nil    el grupo elegido en la ventana (nil si se ven todos o la ventana está cerrada).
-- UIComercio.elegirGrupo(clave)        elige un grupo (nil = todos) y repinta.
-- UIComercio.ventanita(dueno, item)    enseña en GameTooltip el tooltip normal del objeto (lo usa el ratón sobre cada fila); nuestras
--                                      líneas de comercio las añade ui/tooltip.lua por el enganche del juego.
-- UIComercio.tooltipObjeto(fila, {enlace?, item?, clave?, lineas = fn(tt)?}) -> boolean   T1a: el ayudante de TODAS las filas con un
--                                      objeto (lista, sniper, resultados, Grupos, cuadro de cantidad): SetHyperlink con el
--                                      enlace (trae su sufijo) o SetItemByID sin él; anclado a la derecha de la fila (a la
--                                      izquierda si no cabe), solo Show, nada con el tooltip prohibido ni sin objeto. Si ya
--                                      enseña lo mismo (misma fila, enlace, id y clave), no lo vuelve a poner (sin SetOwner).
--                                      F8: `lineas` se apunta también en TooltipComercio.ponerFila (solo en memoria), para
--                                      volver a ponerlas si el tooltip abierto se rehace al llegar una lista nueva.
-- UIComercio.soltarTooltipObjeto(fila?)   lo esconde al momento si sigue en la fila a la que lo puso tooltipObjeto (una fila
--                                      que no es un objeto pasa a ser la del ratón: el tooltip del objeto de antes se va).
--                                      Con fila, solo si esa fila es de la misma tabla (el mismo padre): no quita el de otra.
-- UIComercio.esconderTooltipObjeto(fila?, alMomento?)   lo esconde si sigue siendo de esa fila (sin fila, siempre). Las
--                                      tablas lo llaman con alMomento (su luz ya ha esperado; ronda 1). T1a,
--                                      ronda 1 (sin parpadeos): no al momento, sino pasados UIComercio.ESPERA_TOOLTIP s (un
--                                      C_Timer), y solo si entre tanto ninguna fila ha vuelto a pedir el tooltip. Así, al
--                                      pasar de una fila a otra el tooltip cambia de objeto sin esconderse entre medias (no hay
--                                      Hide, llegue antes el OnLeave o el OnEnter), y si el ratón tiembla en un borde (entre dos
--                                      filas, o en el de la última, la que recorta el cuerpo) no sale y se va en fotogramas
--                                      seguidos. alMomento: sin espera.
-- UIComercio.deEnlace(enlace) -> nombre, calidad | nil   el nombre (con su sufijo) y la calidad de un enlace de objeto, en los
--                                      dos formatos («|cnIQ<n>:» de WoW Forever y «|cffRRGGBB»; la calidad la lee
--                                      SNF.Diario.calidadDeEnlace).
-- UIComercio.enlaceDe(enlace?, item?) -> enlace | nil   B3s: el enlace de verdad del objeto de una fila, de lo mismo que su
--                                      tooltip: el enlace que trae (con su sufijo) o el del juego por su id; nil si aún no hay.
-- UIComercio.clicModificado(enlace?, item?) -> boolean   B3s: Mayús + clic y Ctrl + clic en las filas de objeto (la lista
--                                      vieja y sus escalones, el sniper, la vista de resultados y sus subfilas, las listas
--                                      de objetos de Grupos y el objeto del cuadro de cantidad; TablaComercio y Piezas.tabla
--                                      lo llaman con opciones.objeto). Con las teclas del jugador (IsModifiedClick):
--                                      «CHATLINK» pone el enlace en la caja del chat abierta (sin ninguna, ChatFrame_OpenChat
--                                      la abre con él dentro) y «DRESSUP» lo enseña en el probador, por
--                                      HandleModifiedItemClick. Nada se envía. true = el clic llevaba tecla y la fila no hace
--                                      nada más (sin enlace, nada).
-- UIComercio.textoMotivo(e) -> texto   por qué falló una compra (e = SNF.Compra.estado() en «error»); lo usa la vista de
--                                      resultados de la búsqueda (ui/subasta/resultados.lua).
-- UIComercio.olvidarGrupos()           vuelve a leer los grupos en el siguiente repintado (tras editar uno propio).
-- UIComercio.marco() -> marco | nil    la ventana, con huecos para las tareas siguientes:
--                                      .pestanas (las de la cabecera: navegar, subasta, sniper y misSubastas; bloque B)
--                                      y .cuerpo (la lista, en la página interna «ofertas»); .pie con la barra de abajo
--                                      (.pie.progreso con .texto y .relleno, .pie.comprar y .pie.descartar con .fondo,
--                                      .pie.engranaje y .pie.llevas; .pie.info = .pie.progreso.texto); .ajustes con la
--                                      ventanita del engranaje (.ajustes.tope, .aviso, .siguiente, .sonido, .topePrudente, .titulo,
--                                      .textoTope, .textoAviso y .llevas = .pie.llevas). También .cabecera (la fila 1, con .oro,
--                                      .cerrar y .logo), .avisos, .tabla (la de la lista), .filas (sus huecos), .grupos,
--                                      .panelGrupos, .verBlizzard (el botón de la cabecera) y .pestanaSnet (la pestaña
--                                      «SnetForever», junto a las de la subasta con la vista de Blizzard y bajo la ventana
--                                      con la nuestra).
-- UIComercio.vista() -> 'snet' | 'blizzard'   la vista de la subasta que se abre: la última que eligió el jugador
--                                      (ajuste comercioVista, por defecto 'snet').
-- UIComercio.ponerVista(v)             elige 'snet' (enseña la ventana) o 'blizzard' (la oculta) y lo recuerda.
-- UIComercio.alPulsarFila              se llama con la fila pulsada; por defecto prepara su compra (SNF.Compra.elegir).
-- UIComercio.alternarAjustes(ancla, lado?)   abre la ventanita del engranaje encima de `ancla` (su borde derecho; con lado
--                                      «izquierda», el izquierdo) o la cierra si ya se ve (tarea S2: el engranaje de la
--                                      lista vieja y el del sniper).
-- UIComercio.pestana() -> nombre       la página elegida: 'navegar', 'subasta', 'sniper', 'misSubastas' u 'ofertas'.
-- UIComercio.elegirPestana(nombre)     cambia de página (SNF.SubastaVentana.elegir); 'lista' es 'ofertas'.
--
-- Bloque B, Task B2: la cabecera de TSM (fila 1), las páginas y el tamaño los pone ui/subasta/ventana.lua
-- (SNF.SubastaVentana). Aquí se registra la página interna «ofertas» (los grupos y la lista por %, que abrirá la Búsqueda
-- de grandes ofertas). Los avisos de arriba y la barra de compra solo salen en ella; los avisos salen también en el punto
-- rojo de la cabecera. Al abrir la subasta siempre se está en Navegar.
--
-- Pestaña Sniper (tarea 14, SNF.Sniper): desde la tarea S2 del bloque B es una página propia, ui/subasta/sniper.lua
-- (SNF.SubastaSniper), con su fila de arriba, su tabla y su barra de abajo (sin los avisos ni la barra de compra de aquí).
-- Aquí solo quedan la ventanita del engranaje, que el sniper abre desde su engranaje (UIComercio.alternarAjustes) y que
-- lleva su casilla del sonido (comercioSniperSonido), y el aviso de arriba de la lista vieja mientras el sniper corre.
--
-- Colocación (tareas 9, 15b y 15d): con nuestra vista la subasta de Blizzard se esconde, sin Hide() (cerraría la
-- subasta) y sin tocar su escala: AuctionHouseFrame pasa a alfa 0, sin ratón y fuera de la pantalla, con sus pestañas y
-- todo lo que cuelga de ella, y la subasta sigue abierta con sus eventos. Antes se guardan su escala, su alfa, su ratón y
-- todos sus puntos de anclaje. Al volver a tener escala usable (la devuelve TSM o nosotros) se pide al skin de EllesmereUI
-- que recalcule sus bordes (EllesmereUI.PP.ResnapBordersUnder, si existe; ver sub.pedirResnap). Nuestra
-- ventana (hija de UIParent, con el estrato de la subasta y un nivel por encima, el ratón recogido) ocupa el rectángulo
-- que tenía la subasta en pantalla justo antes de esconderla; sin medidas válidas, centrada y de su tamaño de siempre. Se
-- arrastra por la cabecera y se estira con el asa de abajo a la derecha, y guarda su sitio y su tamaño en
-- SnetForeverCuenta.comercio.ventanaSubasta = {x, y, ancho, alto} en píxeles reales (bloque B; clic derecho en la
-- cabecera lo borra y vuelve al sitio de siempre; tarea 15e). Mide en píxeles reales (SubastaVentana.colocar): el
-- rectángulo de la subasta se pasa a píxeles, como mínimo 920 × 500 y como mucho la pantalla. «Vista de
-- Blizzard» (en la cabecera) oculta la ventana y repone la subasta (puntos, alfa y ratón guardados, mientras sigamos
-- siendo sus dueños); pulsar una pestaña de la subasta hace lo mismo; la pestaña «SnetForever» vuelve a la vista nuestra. La pestaña
-- «SnetForever» va a la derecha de la última visible de la subasta con la vista de Blizzard (las de Blizzard y las de otros
-- addons que cuelguen del borde de abajo; sin ninguna, abajo a la izquierda) y, con la nuestra, bajo la ventana (la
-- subasta escondida se la llevaría). Al cerrar la subasta todo queda como estaba. Si otro addon le pone una escala
-- diminuta (TSM) mientras la tenemos escondida, la soltamos y se esconde lo nuestro: se le devuelven ya el alfa y el
-- ratón, y si luego aparece nuestro punto con escala usable (TSM repone el que se guardó), sus puntos de antes. Si solo la
-- recoloca, le cambia el alfa o le pone una escala usable, seguimos siendo dueños y se vuelve a esconder (el alfa al
-- momento; el sitio, un fotograma después si sigue fuera de la pantalla). Si su rectángulo queda en pantalla (un «mover»
-- la devuelve a su sitio o la sujeta a la pantalla), pasa en el acto al escondido de reserva, a escala 0,001; si otro
-- addon deshace también eso, vista de Blizzard con todo devuelto. Nada de la subasta se ve ni un fotograma para desaparecer en el siguiente (el
-- jugador tiene sin parpadeos: nada puede parpadear). Cuando la devuelve otro addon solo sale nuestra pestaña. En combate,
-- esconderla espera a PLAYER_REGEN_ENABLED; devolverla (y volver a esconderla si otro addon la mueve) es enseguida, porque
-- AuctionHouseFrame no está protegida; SetDisplayMode, las listas y el skin esperan a salir. Sin AuctionHouseFrame (otro
-- cliente) la ventana sale centrada en pantalla, de su tamaño de siempre.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local UIComercio = {}
SNF.UIComercio = UIComercio

local Estilo = SNF.Estilo
local TablaComercio = SNF.TablaComercio
local UI = SNF.UI
local L = SNF.L
local Texto = SNF.Texto
local API = SNF.API
local Ventana = SNF.SubastaVentana -- la cabecera, las páginas y el tamaño (ui/subasta/ventana.lua)
local TAMANOS = Estilo.TAMANOS

local floor = math.floor

local ANCHO_GRUPOS = 150
local MARGEN = 6
local FILAS_LISTA = 15 -- las de la tabla de la lista al crearla; luego, las que quepan en su panel (la tabla estira)
local ALTO_GRUPO = 19
local ALTO_BUSCAR = 20 -- el buscador de grupos
local ANCHO_RAYA = 3 -- la raya de color de cada grupo
local ALTO_PESTANA = 24
local COLOR_RAYA = {{252 / 255, 241 / 255, 65 / 255, 1}} -- por nivel de grupo: hoy solo el 1, amarillo #fcf141
local GRUPOS_VISIBLES = 16
local ALTO_PIE = 28 -- la barra de abajo
local ABAJO = ALTO_PIE + MARGEN -- lo que dejan abajo la lista y los grupos
local ANCHO_CAJA = 64
local ALTO_CAJA = 18
local ANCHO_BOTON = 107 -- Comprar y Descartar
local ANCHO_LLEVAS = 140 -- «Llevas X de Y», en pequeño, a la izquierda de los botones
local LADO_ENGRANAJE = 20
local ANCHO_AJUSTES, ALTO_AJUSTES = 320, 194 -- la ventanita del engranaje (tarea S2: con la casilla del sonido del sniper;
-- fase 3 de la paridad: con la del modo del sniper; tope prudente: con la suya)
local ALFA_BLOQUEADO = 0.55 -- Comprar recién cambiado: se ve, pero medio segundo no acepta clics
local ICONO_ENGRANAJE = "Interface\\Buttons\\UI-OptionsButton"
local REPINTADO = 0.5 -- segundos entre repintados por SNF_COMERCIO_ESCANEO
local PASO_RUEDA = 3

local ICONO_BUENA = "Interface\\RaidFrame\\ReadyCheck-Ready"
UIComercio.ICONO_SIN_CONFIRMAR = "Interface\\RaidFrame\\ReadyCheck-Waiting"
function UIComercio.lineaSinConfirmar(tt)
  tt:AddLine(L.t("COMERCIO_ROTACION_SIN_CONFIRMAR"), 1, 0.82, 0)
end
local ICONO_DESCONOCIDO = "Interface\\Icons\\INV_Misc_QuestionMark"
local RESALTE = "Interface\\Buttons\\WHITE8X8"
local RECORTE_ICONO = {0.08, 0.92}

-- Colores del % (Global Constraints): azul < 50, verde < 80, amarillo < 110, naranja < 135, rojo el resto.
local LIMITES_PCT = {{50, "azul"}, {80, "verde"}, {110, "amarillo"}, {135, "naranja"}}
local CLAVES_LISTA = {objeto = true, nivel = true, cantidad = true, precio = true, pct = true, ritmo = true}
local BLANCO = {1, 1, 1, 1} -- la letra sobre un botón rojo
local COLORES_PCT = {
  azul = {0.30, 0.60, 1.00}, verde = {0.25, 0.90, 0.25}, amarillo = {1.00, 0.85, 0.20},
  naranja = {1.00, 0.55, 0.10}, rojo = {1.00, 0.25, 0.25},
}
-- Colores de calidad de los objetos (los de siempre del juego: pobre, común, poco común, raro, épico, legendario...).
local COLORES_CALIDAD = {
  [0] = {0.62, 0.62, 0.62}, [1] = {1, 1, 1}, [2] = {0.12, 1, 0}, [3] = {0, 0.44, 0.87}, [4] = {0.64, 0.21, 0.93},
  [5] = {1, 0.50, 0}, [6] = {0.90, 0.80, 0.50}, [7] = {0, 0.80, 1},
}

local raiz = nil
local filas = {} -- las filas calculadas (la tabla las ordena)
local tabla = nil -- la tabla de la lista
local aplicandoOrden = false -- true mientras se pone un orden que no ha elegido el jugador
local desplGrupos = 0
local grupoElegido = nil
local filtroGrupos = "" -- lo escrito en el buscador de grupos, ya sin tildes ni mayúsculas
local escuchandoDinero = false
local indice = nil -- grupos leídos: {lista, deGrupo = {[clave] = {[item] = true}}, porItem = {[item] = {nombres, regla}}}
local indicePrecios = nil -- el SNF_PRECIOS con el que se leyó el índice
local ritmoMemo = {tabla = nil, casa = nil, hay = false}
local ultimoRepintado = nil
local pendiente = false
local accionPendiente = nil -- lo que hará el repintado que espera (el entero o solo las filas)
local escuchandoObjetos = false
local sniperActivo = false -- el último estado pintado en la cabecera

---------------------------------------------------------------------------------------------------
-- Ayudas
---------------------------------------------------------------------------------------------------

local function ejecutar(nombre, fn, ...)
  return SNF.Comercio.ejecutar(nombre, fn, ...)
end

-- Un script de marco protegido por el cortafuegos del comercio.
local function protegido(nombre, fn)
  return function(...)
    ejecutar(nombre, fn, ...)
  end
end

-- Para lo que tiene que ir aunque el comercio se haya apagado por un fallo (mover, ocultar, esconder la ventanita): con
-- el comercio en marcha pasa por el cortafuegos; apagado (o con la subasta cerrada), con un pcall sin más y sin ruido.
local function siempre(nombre, fn)
  return function(...)
    if SNF.Comercio.activo() then
      ejecutar(nombre, fn, ...)
    else
      pcall(fn, ...)
    end
  end
end

local function guardadoComercio()
  pcall(SNF.Guardado.preparar)
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  return type(c) == "table" and c or nil
end

local function escaneo()
  local e = rawget(SNF, "Escaneo")
  return type(e) == "table" and e or nil
end

local function datosVivos()
  local e = escaneo()
  if not e or type(e.datos) ~= "function" then
    return {}
  end
  local d = e.datos()
  return type(d) == "table" and d or {}
end

local function estadoEscaneo()
  local e = escaneo()
  if not e or type(e.estado) ~= "function" then
    return nil
  end
  return e.estado()
end

-- Por qué espera o se ha parado el escaneo ('compra', 'limitado', 'ajena' o nil); nil si el módulo no lo sabe decir.
-- El sniper, si existe con todo lo que usa la pestaña (las pruebas pueden poner uno a medias).
local function sniper()
  local s = rawget(SNF, "Sniper")
  if type(s) ~= "table" then
    return nil
  end
  for _, f in ipairs({"activo", "estado", "motivo", "vueltas", "hallazgos", "empezar", "parar", "elegir"}) do
    if type(rawget(s, f)) ~= "function" then
      return nil
    end
  end
  return s
end

local function motivoEscaneo()
  local e = escaneo()
  local f = e and rawget(e, "motivo")
  if type(f) ~= "function" then
    return nil
  end
  return f()
end

local function colorPct(pct)
  if type(pct) ~= "number" then
    return nil
  end
  for _, limite in ipairs(LIMITES_PCT) do
    if pct < limite[1] then
      return limite[2]
    end
  end
  return "rojo"
end

-- Cobre como «1g 40s 03c»: el dinero sin colores de toda la ventana, Tema.dineroPlano (el mismo formato y las mismas
-- letras que Tema.dinero; B6r, punto 11: antes era «1o 40p 3c», otro formato con otras letras). Pública: también la usa el
-- diario de objetos (ia/diario.lua).
function UIComercio.dinero(cobre)
  return SNF.Tema.dineroPlano(floor((tonumber(cobre) or 0) + 0.5))
end
local dinero = UIComercio.dinero

-- Ronda 1 del arreglo de la compra suelta: con un objeto suelto el botón de compra dice SIEMPRE el importe exacto, sin «~»
-- (Alain no vuelve a pagar sin ver antes el total real). Pone `etiqueta` en `texto` y, con `exacto`, ensancha el botón lo
-- justo si no cabe en `anchoBase` (lo que va a su izquierda está encadenado a él y se encoge, sin pisarse); sin `exacto`, o
-- si cabe, el botón vuelve a `anchoBase`. `espacio` = lo que el botón deja libre alrededor del texto. Solo cambia con lo
-- que pide el botón (un clic del jugador o la compra que cambia), nunca solo. Devuelve el ancho puesto. La usan la barra
-- de esta ventana, la vista de resultados y el sniper.
function UIComercio.ajustarBoton(boton, texto, etiqueta, anchoBase, espacio, exacto)
  texto:SetText(etiqueta)
  local ancho = anchoBase
  if exacto then
    ancho = math.max(anchoBase, math.ceil(SNF.Tema.anchoTexto(texto)) + espacio)
  end
  if math.abs((boton:GetWidth() or 0) - ancho) > 0.01 then
    boton:SetWidth(ancho)
  end
  return ancho
end

-- El texto de un botón de compra con su importe. Si el importe completo cabe en el sitio del texto del botón (medido con
-- su letra: Tema.anchoTexto, el ancho del texto entero: B2r ronda 1) se enseña tal cual. Si no cabe, se redondea HACIA ABAJO a la
-- unidad mayor que tenga y se marca con «~» (B2r, punto 2: «~4g» por 4g 27s 70c, nunca «~5g»; «~99s» por 99s 99c; solo
-- cobre sale siempre entero). Es el único «~» de dinero del addon. El importe exacto sale siempre en la barra de abajo
-- («Lista para comprar») y en el cuadro de cantidad.
-- `texto`: el FontString del botón (se usa para medir); `ancho`: el sitio del texto (el botón menos su margen);
-- `formar(importe)` da la etiqueta.
function UIComercio.etiquetaConImporte(cobre, texto, ancho, formar)
  cobre = floor((tonumber(cobre) or 0) + 0.5)
  local completa = formar(dinero(cobre))
  texto:SetText(completa)
  if SNF.Tema.anchoTexto(texto) <= ancho or cobre < 100 then
    return completa
  end
  local aprox
  if cobre >= 10000 then
    aprox = Texto.numero(floor(cobre / 10000)) .. L.t("COMERCIO_ORO")
  else
    aprox = Texto.numero(floor(cobre / 100)) .. L.t("COMERCIO_PLATA")
  end
  return formar("~" .. aprox)
end
local etiquetaConImporte = UIComercio.etiquetaConImporte

-- B2r, punto 5: el % de un precio frente al valor de mercado de la app (SNF.Precios.de(item).normal), redondeado, o nil si
-- no lo hay; el token de Tema de su tramo y su texto. Un solo sitio para la columna % de los resultados de la subasta, la
-- del sniper (B3r) y el cuadro de cantidad (su precio de la unidad y sus escalones). B3r, tramos (constantes con nombre y
-- tokens del tema): hasta AZUL (40) azul, hasta VERDE (80) verde, hasta AMARILLO (110) amarillo, más naranja y desde ROJO
-- (1000) rojo, que sale «>999%» (UIComercio.textoPct). Antes, más de 110 era rojo.
UIComercio.PCT_MERCADO = {AZUL = 40, VERDE = 80, AMARILLO = 110, ROJO = 1000}
function UIComercio.pctMercado(item, precio)
  local Precios = rawget(SNF, "Precios")
  if not Precios or type(precio) ~= "number" or type(item) ~= "number" then
    return nil
  end
  local ok, p = pcall(Precios.de, item)
  local normal = ok and type(p) == "table" and tonumber(p.normal) or nil
  if not normal or normal <= 0 then
    return nil
  end
  return floor(precio * 100 / normal + 0.5)
end
function UIComercio.tokenPct(pct)
  local t = UIComercio.PCT_MERCADO
  pct = floor(pct + 0.5)
  return pct <= t.AZUL and "azul" or pct <= t.VERDE and "verde" or pct <= t.AMARILLO and "amarillo"
    or pct < t.ROJO and "naranja" or "rojo"
end
-- «40%» (redondeado, sin espacio) o, desde ROJO, «>999%».
function UIComercio.textoPct(pct)
  pct = floor(pct + 0.5)
  if pct >= UIComercio.PCT_MERCADO.ROJO then
    return L.t("COMERCIO_PCT_MUCHO")
  end
  return L.t("COMERCIO_PCT", Texto.numero(pct))
end

-- Dos decimales, con coma en español.
local function decimal2(v)
  local s = string.format("%.2f", v)
  if L.idioma() == "es" then
    s = (string.gsub(s, "%.", ","))
  end
  return s
end

local function hace(segundos)
  if type(segundos) ~= "number" then
    return L.t("COMERCIO_SIN_DATO")
  end
  segundos = math.max(0, floor(segundos))
  if segundos < 60 then
    return L.t("COMERCIO_HACE_AHORA")
  elseif segundos < 3600 then
    return L.t("COMERCIO_HACE_MIN", floor(segundos / 60))
  end
  return L.t("COMERCIO_HACE_H", floor(segundos / 3600))
end

-- Lo que le queda a una subasta («2 h», «30 min»). Sin dato (una mercancía no lo trae) sale «—».
local function restante(segundos)
  if type(segundos) ~= "number" then
    return L.t("COMERCIO_SIN_DATO")
  end
  segundos = math.max(0, floor(segundos))
  if segundos < 60 then
    return L.t("COMERCIO_RESTA_MENOS")
  elseif segundos < 3600 then
    return L.t("COMERCIO_RESTA_MIN", floor(segundos / 60))
  end
  return L.t("COMERCIO_RESTA_H", floor(segundos / 3600))
end

-- Lo usa el tooltip de objetos (ui/tooltip.lua).
UIComercio.hace = hace

-- Fallo F1: de qué foto sale un precio de ahora y de cuándo es. Va colgado de UIComercio (sin locales nuevos).
-- UIComercio.momento(fuente, segundos) -> texto   para el tooltip, que se rehace cada vez que se abre: «(subasta, ahora mismo)»,
--   «(app, hace 17 min)», «(escaneo, leído hace 5 min)». fuente: "lista" | "app" | "escaneo" (SNF.Subasta.foto). «Ahora»
--   solo lo dice la lista: la app y el escaneo de menos de un minuto dicen «hace menos de 1 min». Sin hora, solo la fuente:
--   «(escaneo)». Una fuente que no es de estas, "".
-- UIComercio.momentoHora(fuente, hora) -> texto   ronda 2, para las tablas (la columna Foto de la lista de ofertas y la del
--   sniper): la hora de la foto, fija, que nunca envejece ni cambia sola en pantalla: «app 14:15», «subasta 14:32»,
--   «escaneo 14:02», «navegar 14:32» (fuente "navegar": el resumen de la búsqueda general que lee el sniper). Una foto de
--   otro día dice el día en vez de la hora: «app 18/11». hora = segundos del servidor (date del cliente, con su hora
--   local). Sin hora, solo la fuente: «escaneo».
UIComercio.MOMENTO = {
  largo = {lista = "COMERCIO_DE_LISTA", app = "COMERCIO_DE_APP", escaneo = "COMERCIO_DE_ESCANEO"},
  hora = {lista = "COMERCIO_FOTO_LISTA", app = "COMERCIO_FOTO_APP", escaneo = "COMERCIO_FOTO_ESCANEO",
    navegar = "COMERCIO_FOTO_NAVEGAR"},
}

function UIComercio.momento(fuente, segundos)
  local base = UIComercio.MOMENTO.largo[fuente]
  if not base then
    return ""
  end
  if type(segundos) ~= "number" then
    return L.t(base .. "_SIN")
  end
  segundos = math.max(0, floor(segundos))
  if segundos < 60 and fuente ~= "lista" then
    return L.t(base .. "_YA")
  end
  return L.t(base, hace(segundos))
end

function UIComercio.momentoHora(fuente, hora)
  local base = UIComercio.MOMENTO.hora[fuente]
  if not base then
    return ""
  end
  if type(hora) ~= "number" then
    return L.t(base .. "_SIN")
  end
  local ahora = SNF.API.horaServidor()
  local mismoDia = type(ahora) == "number" and date("%Y%m%d", floor(hora)) == date("%Y%m%d", floor(ahora))
  return L.t(base, date(mismoDia and "%H:%M" or "%d/%m", floor(hora)))
end

local function textoPct(pct)
  if type(pct) ~= "number" then
    return L.t("COMERCIO_SIN_DATO")
  end
  return L.t("COMERCIO_PCT", Texto.numero(floor(pct + 0.5)))
end

-- Nombre, calidad y nivel del objeto: el juego (C_Item.GetItemInfo o GetItemInfo, después GetItemNameByID), los
-- nombres de los precios de la app o «#id». El nivel es nil si no se sabe.
local function nombreYCalidad(item)
  local espacio = rawget(_G, "C_Item")
  local info = type(espacio) == "table" and rawget(espacio, "GetItemInfo") or rawget(_G, "GetItemInfo")
  local nombre, calidad, nivel
  if type(info) == "function" then
    local ok, n, _, q, nv = pcall(info, item)
    if ok and type(n) == "string" and n ~= "" then
      nombre, calidad, nivel = n, q, nv
    end
  end
  if not nombre then
    local porId = type(espacio) == "table" and rawget(espacio, "GetItemNameByID")
    if type(porId) == "function" then
      local ok, n = pcall(porId, item)
      if ok and type(n) == "string" and n ~= "" then
        nombre = n
      end
    end
  end
  if not nombre then
    local P = rawget(_G, "SNF_PRECIOS")
    local n = type(P) == "table" and type(P.nombres) == "table" and P.nombres[item]
    if type(n) == "string" and n ~= "" then
      nombre = n
    end
  end
  return nombre or ("#" .. tostring(item)), tonumber(calidad), tonumber(nivel)
end

local function colorCalidad(calidad)
  return COLORES_CALIDAD[calidad] or COLORES_CALIDAD[1]
end
-- Los usa el cuadro de cantidad (ui/comercio_cantidad.lua).
UIComercio.nombreYCalidad = nombreYCalidad
UIComercio.colorCalidad = colorCalidad

---------------------------------------------------------------------------------------------------
-- Precios, casas y grupos
---------------------------------------------------------------------------------------------------

-- F6, ronda 1: la casa de ahora (con la subasta abierta, la suya: en la neutral, que la app no trae, no hay precios).
local function preciosDeCasa()
  local P = rawget(_G, "SNF_PRECIOS")
  local casa = (SNF.Precios.casaActual or SNF.Precios.casa)()
  if type(P) ~= "table" or type(P.casas) ~= "table" or casa == nil or type(P.casas[casa]) ~= "table" then
    return nil
  end
  return P.casas[casa], P, casa
end

-- ¿Trae la casa algún ritmo de venta? (Sin credenciales de Blizzard, la app los deja todos a -1.) Se recuerda por
-- tabla de precios y casa: recorrerla entera solo pasa una vez.
local function hayRitmo()
  local objetos, P, casa = preciosDeCasa()
  if not objetos then
    return false
  end
  if ritmoMemo.tabla ~= P or ritmoMemo.casa ~= casa then
    ritmoMemo.tabla, ritmoMemo.casa, ritmoMemo.hay = P, casa, false
    for _, f in pairs(objetos) do
      if type(f) == "table" and type(f[5]) == "number" and f[5] >= 0 then
        ritmoMemo.hay = true
        break
      end
    end
  end
  return ritmoMemo.hay
end

-- Lee los grupos (SNF.Grupos.lista) y apunta de cada objeto sus grupos y el grupo cuya regla manda (el primer propio;
-- si no hay, el primero). Las entradas rotas se saltan; los objetos de un grupo no se tocan.
local function leerGrupos()
  local lista, deGrupo, porItem = {}, {}, {}
  for _, g in ipairs(SNF.Grupos.lista()) do
    if type(g) == "table" and g.clave ~= nil and type(g.objetos) == "table" then
      lista[#lista + 1] = {clave = g.clave, nombre = tostring(g.nombre or g.clave)}
      local miembros = {}
      for _, item in ipairs(g.objetos) do
        if type(item) == "number" then
          miembros[item] = true
          local datos = porItem[item]
          if not datos then
            datos = {nombres = {}}
            porItem[item] = datos
          end
          datos.nombres[#datos.nombres + 1] = tostring(g.nombre or g.clave)
          if datos.regla == nil then
            datos.regla = g.clave
          end
        end
      end
      deGrupo[g.clave] = miembros
    end
  end
  indice = {lista = lista, deGrupo = deGrupo, porItem = porItem}
  indicePrecios = rawget(_G, "SNF_PRECIOS")
end

local function grupos()
  if not indice or indicePrecios ~= rawget(_G, "SNF_PRECIOS") then
    leerGrupos()
  end
  return indice
end

---------------------------------------------------------------------------------------------------
-- Filas
---------------------------------------------------------------------------------------------------

-- Orden de entrada a la tabla: la tabla ordena por la columna elegida y, a igual valor, deja el de entrada. Primero el
-- más barato y, a igual precio, el de menor número de objeto (para que no dependa de pairs).
local function antes(a, b)
  if a.precio ~= b.precio then
    return a.precio < b.precio
  end
  return a.item < b.item
end

-- La foto de una fila de la lista: la que elige SNF.Subasta.foto o, sin ella, el escaneo.
local function fotoDeFila(item, v, foto, ahora)
  local precio, cantidad, _, edad, p, fuente, hora
  if foto then
    precio, cantidad, _, edad, p, fuente, _, hora = foto(item)
  end
  if not fuente then -- sin el núcleo de precios (no debería pasar): el escaneo, que dice que lo es
    precio, cantidad, p, fuente, hora = v.precio, v.cantidad, SNF.Precios.de(item), "escaneo", v.hora
    edad = type(v.hora) == "number" and math.max(0, (ahora or v.hora) - v.hora) or nil
  end
  return precio, cantidad, edad, p, fuente, hora
end

-- El veredicto de una fila con la regla de su grupo. `reglas` guarda las ya leídas en esta pasada.
local function veredictoDeFila(item, precio, cantidad, p, idx, reglas)
  local datos = idx.porItem[item]
  local clave = grupoElegido or (datos and datos.regla) or false
  local regla = reglas[clave]
  if not regla then
    regla = SNF.Reglas.de(clave or nil)
    reglas[clave] = regla
  end
  return SNF.Reglas.evaluar(item, {precio = precio, cantidad = cantidad}, p, regla, "compra")
end

local function calcular()
  local idx = grupos()
  local filtro = grupoElegido ~= nil and idx.deGrupo[grupoElegido] or nil
  if grupoElegido ~= nil and not filtro then
    grupoElegido = nil -- el grupo ya no existe
  end
  local reglas = {}
  local nuevas = {}
  -- F1 (ronda 1): los objetos son los del escaneo, pero el precio y las unidades de cada fila salen de la foto elegida
  -- (SNF.Subasta.foto: la lista de Navegar, si no la foto de la app y, solo sin ella, el escaneo), y el veredicto se mira con
  -- esa misma foto. La fila dice cuál es y de cuándo (columna Foto).
  local foto = rawget(SNF, "Subasta") and SNF.Subasta.foto
  local ahora = SNF.API.horaServidor()
  for item, v in pairs(datosVivos()) do
    if type(item) == "number" and type(v) == "table" and type(v.precio) == "number" and (not filtro or filtro[item]) then
      local precio, cantidad, edad, p, fuente, hora = fotoDeFila(item, v, foto, ahora)
      if type(precio) == "number" then
        local ev = veredictoDeFila(item, precio, cantidad, p, idx, reglas)
        nuevas[#nuevas + 1] = {
          clave = item, item = item, cantidad = tonumber(cantidad) or 0, precio = precio, fuente = fuente, edad = edad,
          hora = type(hora) == "number" and floor(hora) or nil, -- la hora de la foto misma (ronda 3: no se mueve al repintar)
          pct = ev.pct, color = colorPct(ev.pct), ritmo = p and p.ritmo or nil, buena = ev.buena == true,
          rotacionSinConfirmar = ev.rotacionSinConfirmar,
        }
      end
    end
  end
  table.sort(nuevas, antes)
  filas = nuevas
end

---------------------------------------------------------------------------------------------------
-- Tooltip del ratón sobre una fila
---------------------------------------------------------------------------------------------------

-- F9p, ronda 1: se mira al poner las líneas y no al entrar en la fila: con el ratón quieto, una lista nueva puede aprobar o
-- dejar de aprobar la mercancía, y el repintado del tooltip llega antes o después que el de la tabla.
function UIComercio.lineasDeFila(item)
  return function(tt)
    local v = datosVivos()[item]
    if type(v) ~= "table" or type(v.precio) ~= "number" then
      return
    end
    local foto = rawget(SNF, "Subasta") and SNF.Subasta.foto
    local precio, cantidad, _, p = fotoDeFila(item, v, foto, SNF.API.horaServidor())
    if type(precio) == "number" and veredictoDeFila(item, precio, cantidad, p, grupos(), {}).rotacionSinConfirmar then
      UIComercio.lineaSinConfirmar(tt)
    end
  end
end

-- La fila de la lista como la ven los de fuera (UIComercio.fila y UIComercio.alPulsarFila).
local function datosDeFila(f)
  local nombre, _, nivel = nombreYCalidad(f.item)
  return {
    item = f.item, nombre = nombre, nivel = nivel, cantidad = f.cantidad, precio = f.precio, pct = f.pct,
    color = f.color, ritmo = f.ritmo, buena = f.buena, rotacionSinConfirmar = f.rotacionSinConfirmar, fuente = f.fuente,
    edad = f.edad, hora = f.hora,
  }
end

-- T1a: el tooltip del objeto de cualquier fila nuestra (las tablas de la subasta, Grupos, el cuadro de cantidad). Es el
-- tooltip normal del objeto del juego: con el enlace de verdad (SetHyperlink: trae su sufijo) o, sin enlace, por su id
-- (SetItemByID). Nuestras líneas no se ponen aquí: llegan por el enganche de ui/tooltip.lua, igual que en las bolsas.
-- datos.lineas(tt), si se da, añade líneas al final (la vista de resultados: vendedor y precios). Se ancla como TSM: a la
-- derecha de la fila, centrado en alto, o a la izquierda si a la derecha no cabe en la pantalla. Solo Show, sin animación.
-- Devuelve true si lo enseña. Sin objeto (una fila de grupo, un aviso) o con el tooltip prohibido no hace nada.
function UIComercio.tooltipObjeto(fila, datos)
  local tt = rawget(_G, "GameTooltip")
  if not fila or type(datos) ~= "table" or not tt or tt:IsForbidden() then
    return false
  end
  local enlace = type(datos.enlace) == "string" and string.find(datos.enlace, "|Hitem:", 1, true) and datos.enlace or nil
  local item = tonumber(datos.item)
  if not enlace and not item then
    return false
  end
  local salida = UIComercio._salida
  salida.turno = salida.turno + 1 -- una fila pide el tooltip de un objeto: lo que esperaba para esconderlo ya no vale
  -- La misma fila con lo mismo (volver a ella temblando en su borde): ya está puesto; no se vuelve a llamar a SetOwner ni
  -- se ancla otra vez (en el cliente, SetOwner lo vacía y lo vuelve a llenar).
  local u = salida.ultimo
  local enganche = rawget(SNF, "TooltipComercio")
  if u and u.fila == fila and u.enlace == enlace and u.item == item and u.clave == datos.clave and tt:IsShown()
    and tt:GetOwner() == fila then
    if enganche then
      enganche.renovarFila(tt, fila, datos.lineas) -- F8: la fila puede traer datos de ahora
    end
    return true
  end
  salida.ultimo = nil
  tt:SetOwner(fila, "ANCHOR_NONE")
  -- Un enlace raro no rompe la fila: se cae al id.
  if not (enlace and pcall(tt.SetHyperlink, tt, enlace)) then
    if not item then
      tt:Hide()
      return false
    end
    if tt.SetItemByID then
      tt:SetItemByID(item)
    else
      tt:SetHyperlink("item:" .. string.format("%d", item))
    end
  end
  local deLaFila = 0 -- F8, ronda 2: solo las que añade la fila; una de otro addon puesta antes no cuenta como suya
  if type(datos.lineas) == "function" then
    local antes = tt:NumLines()
    datos.lineas(tt)
    deLaFila = tt:NumLines() - antes
  end
  if enganche then
    enganche.ponerFila(tt, fila, datos.lineas, deLaFila) -- F8: para no perderlas si el tooltip se rehace con una lista nueva
  end
  tt:Show()
  -- Ya con su ancho (tras Show): ¿cabe a la derecha? Todo en píxeles de pantalla (cada marco con su escala).
  local derecha, ancho = fila:GetRight(), tt:GetWidth()
  local pantalla = UIParent and UIParent:GetRight()
  local cabe = true
  if derecha and ancho and pantalla then
    cabe = derecha * fila:GetEffectiveScale() + ancho * tt:GetEffectiveScale() <= pantalla * UIParent:GetEffectiveScale()
  end
  tt:ClearAllPoints()
  if cabe then
    tt:SetPoint("LEFT", fila, "RIGHT", 0, 0)
  else
    tt:SetPoint("RIGHT", fila, "LEFT", 0, 0)
  end
  salida.ultimo = {fila = fila, enlace = enlace, item = item, clave = datos.clave}
  return true
end

-- Esconde el tooltip del objeto de esa fila (si otro marco ya se lo ha quedado, no lo toca). Sin fila, lo esconde siempre.
-- Espera ESPERA_TOOLTIP s (ver la cabecera): si entre tanto otra fila (u otra vez esta) pide el tooltip, no se esconde y el
-- tooltip pasa directamente de un objeto a otro. Un temporizador por salida, nada en OnUpdate.
UIComercio.ESPERA_TOOLTIP = 0.2
UIComercio._salida = {turno = 0} -- turno: sube con cada tooltip pedido y con cada salida; solo esconde la salida del último

function UIComercio.esconderTooltipObjeto(fila, alMomento)
  local tt = rawget(_G, "GameTooltip")
  if not tt or tt:IsForbidden() or (fila ~= nil and tt:GetOwner() ~= fila) then
    return
  end
  local salida = UIComercio._salida
  salida.turno = salida.turno + 1
  local turno = salida.turno
  local function esconder()
    if salida.turno == turno and not tt:IsForbidden() and (fila == nil or tt:GetOwner() == fila) then
      tt:Hide()
    end
  end
  local temporizador = rawget(_G, "C_Timer")
  if alMomento or not (temporizador and temporizador.After) then
    esconder()
  else
    temporizador.After(UIComercio.ESPERA_TOOLTIP, esconder)
  end
end

-- El nombre (con su sufijo) y la calidad de un enlace de objeto, o nil. La calidad la lee SNF.Diario.calidadDeEnlace (un solo
-- sitio para los dos formatos: WoW Forever escribe «|cnIQ<n>:|Hitem…», los clientes clásicos «|cffRRGGBB|Hitem…»).
function UIComercio.deEnlace(enlace)
  if type(enlace) ~= "string" then
    return nil
  end
  local nombre = string.match(enlace, "|h%[(.-)%]|h")
  if not nombre or nombre == "" then
    return nil
  end
  local Diario = rawget(SNF, "Diario")
  return nombre, Diario and Diario.calidadDeEnlace and Diario.calidadDeEnlace(enlace) or nil
end

-- B3s: el enlace de verdad del objeto de una fila, de lo mismo que enseña su tooltip (tooltipObjeto): el enlace que trae la
-- fila (el de una subasta lleva su sufijo) o, sin él, el que da el juego por su id (C_Item.GetItemInfo o GetItemInfo).
-- nil si aún no hay ninguno (el juego no sabe el objeto todavía: una fila «#id»).
function UIComercio.enlaceDe(enlace, item)
  if type(enlace) == "string" and string.find(enlace, "|Hitem:", 1, true) then
    return enlace
  end
  item = tonumber(item)
  if not item then
    return nil
  end
  local espacio = rawget(_G, "C_Item")
  local info = type(espacio) == "table" and rawget(espacio, "GetItemInfo") or rawget(_G, "GetItemInfo")
  if type(info) ~= "function" then
    return nil
  end
  local ok, _, e = pcall(info, item)
  if ok and type(e) == "string" and string.find(e, "|Hitem:", 1, true) then
    return e
  end
  return nil
end

-- B3s: el clic con tecla de una fila de objeto (cuáles, en la cabecera). Las teclas son las que el jugador tenga puestas en
-- el juego (IsModifiedClick): «CHATLINK» (Mayús) pone el enlace en la caja del chat abierta; «DRESSUP» (Ctrl) lo enseña en
-- el probador. Las dos van por HandleModifiedItemClick, la del juego. Sin caja de chat abierta, la del juego no la abre
-- (ChatEdit_InsertLink puede ir a otra caja a la vista, como el buscador de la subasta de Blizzard, que la tenemos escondida
-- pero sigue «visible» para el juego): entonces se abre el chat con el enlace dentro (ChatFrame_OpenChat, lo que hace
-- Intro). Nada se envía: el jugador pulsa Intro.
-- Devuelve true si el clic llevaba una de esas teclas: entonces la fila no hace nada más (ni elige, ni abre, ni prepara
-- compra), también si aún no tiene enlace (entonces no hace nada). false sin tecla: el clic sigue como siempre.
function UIComercio.clicModificado(enlace, item)
  local tecla = rawget(_G, "IsModifiedClick")
  if type(tecla) ~= "function" then
    return false
  end
  local chat, probador = tecla("CHATLINK"), tecla("DRESSUP")
  if not (chat or probador) then
    return false
  end
  enlace = UIComercio.enlaceDe(enlace, item)
  if not enlace then
    return true
  end
  local activa = rawget(_G, "ChatEdit_GetActiveWindow")
  local abrirChat = rawget(_G, "ChatFrame_OpenChat")
  if chat and type(abrirChat) == "function" and not (type(activa) == "function" and activa()) then
    pcall(abrirChat, enlace)
    return true
  end
  local delJuego = rawget(_G, "HandleModifiedItemClick")
  local hacer = type(delJuego) == "function" and delJuego
    or (chat and rawget(_G, "ChatEdit_InsertLink")) or (probador and rawget(_G, "DressUpItemLink"))
  if type(hacer) == "function" then
    pcall(hacer, enlace)
  end
  return true
end

function UIComercio.soltarTooltipObjeto(fila)
  local u = UIComercio._salida.ultimo
  if u and (fila == nil or u.fila:GetParent() == fila:GetParent()) then
    UIComercio.esconderTooltipObjeto(u.fila, true)
  end
end

local function enseniarObjeto(dueno, item, lineas)
  UIComercio.tooltipObjeto(dueno, {item = item, lineas = lineas})
end

function UIComercio.ventanita(dueno, item)
  ejecutar("ventanita", enseniarObjeto, dueno, item)
end

local function esconderVentanita()
  if GameTooltip and not GameTooltip:IsForbidden() then
    GameTooltip:Hide()
  end
end

---------------------------------------------------------------------------------------------------
-- Pintado
---------------------------------------------------------------------------------------------------

local function ponerColor(fs, c)
  fs:SetTextColor(c[1], c[2], c[3], c[4] or 1)
end

-- Fondo liso de un marco con un color de la paleta de comercio (un token o un color {r, g, b, a}). La textura se crea la
-- primera vez y queda en marco.fondo.
local function ponerFondo(marco, token)
  local c = type(token) == "table" and token or Estilo.comercio(token)
  if not marco.fondo then
    marco.fondo = marco:CreateTexture(nil, "BACKGROUND")
    marco.fondo:SetAllPoints(marco)
    marco.fondo:SetTexture(Estilo.TEXTURA)
  end
  marco.fondo:SetVertexColor(c[1], c[2], c[3], c[4] or 1)
end

-- Minúsculas y sin tildes, para buscar sin fijarse en ellas. string.lower del juego solo conoce las letras sin tilde;
-- las vocales con tilde, la ñ y la ü (UTF-8, dos bytes) se cambian a mano.
local SIN_TILDE = {
  ["á"] = "a", ["é"] = "e", ["í"] = "i", ["ó"] = "o", ["ú"] = "u", ["ü"] = "u", ["ñ"] = "n",
  ["Á"] = "a", ["É"] = "e", ["Í"] = "i", ["Ó"] = "o", ["Ú"] = "u", ["Ü"] = "u", ["Ñ"] = "n",
}
local function sinTildes(texto)
  local s = string.gsub(tostring(texto or ""), "[\195][\128-\191]", function(c)
    return SIN_TILDE[c]
  end)
  return string.lower(s)
end

-- El oro del personaje, en la cabecera (Tema.dinero, en tres colores).
local function pintarOro()
  if raiz then
    Ventana.pintarOro()
  end
end

-- Los avisos de arriba y el punto rojo de la cabecera. La línea de avisos lo dice todo; el punto, solo lo que dura (sin
-- precios, sin ritmo, /reload, el escaneo parado por otro addon o por la subasta vacía y el comercio apagado): esperar a la
-- subasta, una búsqueda ajena, el sniper en marcha u otro addon con la subasta van y vienen en un momento, y el punto se
-- encendería y se apagaría solo (regla de interfaz: nada puede parpadear).
local function pintarCabecera()
  pintarOro()
  local avisos, duran = {}, {}
  local function avisar(texto, dura)
    avisos[#avisos + 1] = texto
    if dura then
      duran[#duran + 1] = texto
    end
  end
  local estado = estadoEscaneo()
  local total = 0
  for _ in pairs(datosVivos()) do
    total = total + 1
  end
  local motivo = motivoEscaneo()
  if motivo == "ajena" and estado == "parado" then
    avisar(L.t("COMERCIO_ESCANEO_PARADO_AJENA"), true)
  elseif motivo == "ajena" and estado == "esperando" then
    avisar(L.t("COMERCIO_ESCANEO_AJENA"))
  elseif motivo == "otro" and estado == "parado" and not UIComercio.subastaUsable() then
    avisar(L.t("COMERCIO_ESCANEO_OTRO"))
  elseif motivo == "vacia" and estado == "parado" then
    avisar(L.t("COMERCIO_ESCANEO_VACIA"), true)
  elseif estado == nil or estado == "esperando" or (estado == "parado" and total == 0) then
    avisar(L.t("COMERCIO_ESPERANDO"))
  end
  if not preciosDeCasa() then
    avisar(L.t("COMERCIO_SIN_PRECIOS"), true)
  elseif not hayRitmo() then
    avisar(L.t("COMERCIO_SIN_RITMO"), true)
  end
  local s = sniper()
  sniperActivo = s ~= nil and s.activo()
  if sniperActivo then
    avisar(L.t("COMERCIO_LISTA_SNIPER"))
  end
  if SNF.Precios.hayQueRecargar() then
    local horas = floor((SNF.Precios.edad() or 0) / 3600)
    avisar(L.t("COMERCIO_RELOAD_CABECERA", horas), true)
  end
  raiz.avisos:SetText(table.concat(avisos, "\n"))
  ponerColor(raiz.avisos, COLORES_PCT.amarillo)
  Ventana.ponerAvisos(duran)
end

-- Los grupos que pasan el buscador (sin mirar tildes ni mayúsculas). «Todos los objetos» no es de esta lista: siempre sale.
local function gruposVisibles()
  local lista = grupos().lista
  if filtroGrupos == "" then
    return lista
  end
  local visibles = {}
  for _, g in ipairs(lista) do
    if string.find(sinTildes(g.nombre), filtroGrupos, 1, true) then
      visibles[#visibles + 1] = g
    end
  end
  return visibles
end

-- Fondo de una fila de grupo como el de una fila de la tabla: normal, ratón encima +5 %, elegida +5 %, elegida con ratón +8 %.
local function pintarFilaGrupo(b)
  local pct = 0
  if b.elegido then
    pct = b.raton and 8 or 5
  elseif b.raton then
    pct = 5
  end
  ponerFondo(b, Estilo.aclarar(Estilo.comercio("filas"), pct))
end

local function pintarGrupos()
  local lista = gruposVisibles()
  desplGrupos = math.max(0, math.min(desplGrupos, #lista + 1 - GRUPOS_VISIBLES))
  for k, b in ipairs(raiz.grupos) do
    local n = desplGrupos + k
    if n == 1 then
      b.clave, b.etiqueta = nil, L.t("COMERCIO_TODOS")
    else
      local g = lista[n - 1]
      b.clave, b.etiqueta = g and g.clave, g and g.nombre
    end
    if b.etiqueta then
      b.refrescar()
      b.elegido = b.clave == grupoElegido
      pintarFilaGrupo(b)
      b:Show()
    else
      b:Hide()
    end
  end
  local buscar = raiz.grupos.buscar
  buscar.vacia:SetShown(buscar:GetText() == "" and not buscar:HasFocus())
end

-- Orden de la lista: el guardado (si es válido) o el de fábrica.
local function ordenGuardado()
  local c = guardadoComercio()
  local o = c and c.ordenLista
  if type(o) == "table" and type(o.asc) == "boolean" and CLAVES_LISTA[o.clave] then
    return o.clave, o.asc
  end
  return nil
end

local function ordenDeFabrica()
  if preciosDeCasa() then
    return "pct", true
  end
  return "cantidad", false
end

-- Una mercancía «lista» abre el cuadro de cantidad en vez de comprar: ahí se elige cuántas y se confirma. Lo demás (un objeto
-- suelto, una mercancía ya por confirmar) sigue como antes. true si ha abierto el cuadro.
local function abrirCuadro()
  local cuadro = rawget(SNF, "CantidadComercio")
  local e = SNF.Compra.estado()
  return cuadro ~= nil and e ~= nil and e.fase == "lista" and e.tipo == "mercancia" and cuadro.abrir() == true
end

-- La fila elegida es la de la compra preparada (SNF.Compra.estado().item); si ya no está en la lista, o no hay compra,
-- ninguna se pinta (la compra sigue). No recalcula nada.
local function elegirDeLaCompra()
  if not tabla then
    return
  end
  local compra = rawget(SNF, "Compra")
  local e = compra and compra.estado()
  local elegida = nil
  for _, f in ipairs(filas) do
    if e and f.item == e.item then
      elegida = f.item
      break
    end
  end
  -- Ronda 1 del arreglo de la compra suelta: nunca se compra lo que no se ve. Si la fila de la compra elegida en esta lista
  -- estaba a la vista y deja de estar (otro grupo, otra lista del escaneo), la compra se suelta. Ronda 2: en cualquier fase
  -- en que aún no se ha pedido nada que gaste (también «buscando», con el sistema de la subasta ocupado, y la mercancía que
  -- espera su precio), como hace la vista de resultados; una compra ya pedida al juego, hecha o con error no se toca.
  local pedida = e and e.fase == "comprando" and e.esperando == "compra"
  if e and e.origen == nil and elegida == nil and tabla.snfCompraVista == e.item
    and not pedida and e.fase ~= "hecho" and e.fase ~= "error" then
    tabla.snfCompraVista = nil
    tabla:elegir(nil)
    compra.cancelar()
    return
  end
  -- La marca de «a la vista» no se borra mientras siga la compra de ese objeto (ronda 2): si la fila vuelve, sigue marcada.
  if elegida or not e or e.item ~= tabla.snfCompraVista then
    tabla.snfCompraVista = elegida
  end
  tabla:elegir(elegida)
end

-- Los escalones de precio de la fila elegida. Solo ella los tiene (abrir cualquier otra pediría una búsqueda al servidor
-- por fila): sus subfilas salen de SNF.Compra.escalones() y cada una lleva precio, cantidad y tiempo. En una mercancía,
-- las que quedan por encima del límite de la regla (más allá de Compra.maxCantidad) van atenuadas.
local escalonesDe = nil -- el objeto cuyas subfilas están puestas
local firmaEscalones = nil

local function subfilasDe(item)
  local compra = rawget(SNF, "Compra")
  local e = compra and compra.estado()
  if not e or e.item ~= item then
    return nil
  end
  local lista = compra.escalones()
  if #lista == 0 then
    return nil
  end
  local tope = e.tipo == "mercancia" and compra.maxCantidad() or nil
  local subs = {}
  for i, s in ipairs(lista) do
    subs[i] = {
      clave = "esc:" .. item .. ":" .. i, escalon = true, item = item, precio = s.precio, n = s.n, acumulado = s.acumulado,
      tiempo = s.tiempo, fuera = tope ~= nil and (s.acumulado - s.n) >= tope,
    }
  end
  return subs
end

-- Pone las subfilas en la fila elegida (y se las quita a las demás). true si algo ha cambiado.
local function ponerSubfilas()
  local compra = rawget(SNF, "Compra")
  local e = compra and compra.estado()
  local item = nil
  for _, f in ipairs(filas) do
    if e and f.item == e.item then
      item = f.item
      break
    end
  end
  local subs = item and subfilasDe(item) or nil
  local partes = {tostring(subs and item or "")}
  for _, s in ipairs(subs or {}) do
    partes[#partes + 1] = string.format("%s,%s,%s,%s,%s", s.precio, s.n, s.acumulado, tostring(s.tiempo), tostring(s.fuera))
  end
  local firma = table.concat(partes, ";")
  for _, f in ipairs(filas) do
    f.subfilas = (subs and f.item == item) and subs or nil
  end
  local nuevo = subs and item or nil
  if escalonesDe ~= nil and escalonesDe ~= nuevo and tabla then
    tabla:abrir(escalonesDe, false) -- la fila que ya no es la elegida se cierra
  end
  escalonesDe = nuevo
  local cambia = firma ~= firmaEscalones
  firmaEscalones = firma
  return cambia
end

-- Los escalones han llegado o cambiado: se repinta la tabla solo si hace falta.
local function refrescarEscalones()
  if tabla and ponerSubfilas() then
    tabla:poner(filas)
  end
end

local function pintarFilas()
  if not tabla then
    return
  end
  local clave, asc = ordenGuardado()
  if clave == nil then
    clave, asc = ordenDeFabrica()
  end
  local actual, actualAsc = tabla:orden()
  if actual ~= clave or actualAsc ~= asc then
    aplicandoOrden = true
    local ok, err = pcall(tabla.ordenarPor, tabla, clave, asc)
    aplicandoOrden = false
    if not ok then
      error(err, 0)
    end
  end
  ponerSubfilas()
  tabla:poner(filas)
  elegirDeLaCompra()
  raiz.vacio:SetShown(#filas == 0)
end

local function textosFijos()
  raiz.pestanaSnet.ponerTexto(L.t("COMERCIO_PESTANA_SNET"))
  raiz.grupos.buscar.vacia:SetText(L.t("COMERCIO_BUSCAR_GRUPO"))
  raiz.vacio:SetText(L.t("COMERCIO_VACIO"))
  raiz.pie.descartar.refrescar()
end

local function textoMotivo(e)
  local m = e.motivo
  if m == "sin_oro" then
    return L.t("COMERCIO_MOTIVO_SIN_ORO", dinero(e.total))
  elseif m == "tope" then
    return L.t("COMERCIO_MOTIVO_TOPE", dinero(SNF.Compra.gastado()), dinero(SNF.Ajustes.get("comercioTope")))
  elseif m == "regla" then
    return L.t("COMERCIO_MOTIVO_REGLA", Texto.numero(e.regla.maxUnidades), dinero(e.regla.maxOro))
  elseif m == "operacion" then
    return L.t("COMERCIO_MOTIVO_OPERACION")
  elseif m == "sin_subasta" then
    return L.t("COMERCIO_MOTIVO_SIN_SUBASTA")
  elseif m == "ya_no_esta" then
    return L.t("COMERCIO_MOTIVO_YA_NO_ESTA")
  elseif m == "combate" then
    return L.t("COMERCIO_MOTIVO_COMBATE")
  elseif m == "cambio_precio" then
    return L.t("COMERCIO_MOTIVO_CAMBIO_PRECIO")
  elseif m == "sin_unidades" then
    return L.t("COMERCIO_MOTIVO_SIN_UNIDADES")
  elseif m == "propias_desconocidas" then -- F12: con e.corte, la fila que frena la compra puede no ser la marcada
    return e.corte and L.t("COMERCIO_MOTIVO_SIN_SABER_PRECIO", dinero(e.corte)) or L.t("COMERCIO_MOTIVO_SIN_SABER")
  elseif m == "otro_personaje" then
    return e.corte and L.t("COMERCIO_MOTIVO_OTRO_PJ_PRECIO", dinero(e.corte)) or L.t("COMERCIO_MOTIVO_OTRO_PJ")
  elseif m == "sin_respuesta" then
    return L.t("COMERCIO_MOTIVO_SIN_RESPUESTA")
  elseif m == "sin_confirmar" then
    return L.t("COMERCIO_MOTIVO_SIN_CONFIRMAR")
  elseif e.texto then
    return L.t("COMERCIO_MOTIVO_FALLO_TEXTO", e.texto)
  end
  return L.t("COMERCIO_MOTIVO_FALLO")
end
-- Lo usa la vista de resultados de la búsqueda (ui/subasta/resultados.lua) para decir por qué falló su compra.
UIComercio.textoMotivo = textoMotivo

-- Un ajuste de dinero del comercio (cobre) recortado a sus LIMITES, como lo usa comercio/compra.lua.
local function cobreDe(clave)
  local limite = SNF.Ajustes.LIMITES[clave]
  local v = tonumber(SNF.Ajustes.get(clave))
  if not v or v ~= v then
    v = SNF.Ajustes.DEFECTO[clave]
  end
  return floor(math.max(limite.min, math.min(limite.max, v)))
end

-- Lo que enseña una caja del gasto: el ajuste en oro entero.
local function oroDe(clave)
  return string.format("%d", floor(cobreDe(clave) / 10000))
end

-- El gasto: las dos cajas de la ventanita del engranaje (salvo la que el jugador está escribiendo), su casilla de la fila
-- siguiente y, en la barra, «Llevas X de Y» en pequeño.
local function pintarGasto()
  local g = raiz.ajustes
  if not g then
    return
  end
  g.titulo:SetText(L.t("COMERCIO_AJUSTES"))
  g.textoTope:SetText(L.t("COMERCIO_GASTO_TOPE"))
  g.textoAviso:SetText(L.t("COMERCIO_GASTO_AVISO"))
  if not g.tope:HasFocus() then
    g.tope:SetText(oroDe("comercioTope"))
  end
  if not g.aviso:HasFocus() then
    g.aviso:SetText(oroDe("comercioAvisoOro"))
  end
  g.siguiente.refrescar()
  g.sonido.refrescar()
  g.sniperOperaciones.refrescar()
  g.largeText.refrescar()
  local compra = rawget(SNF, "Compra")
  local gastado = compra and type(compra.gastado) == "function" and compra.gastado() or 0
  local tope = cobreDe("comercioTope")
  if tope > 0 then
    g.llevas:SetText(L.t("COMERCIO_GASTO_LLEVAS", dinero(gastado), dinero(tope)))
    ponerColor(g.llevas, gastado >= tope and COLORES_PCT.rojo or Estilo.comercio("secundario"))
  else
    g.llevas:SetText(L.t("COMERCIO_GASTO_LLEVAS_SIN_TOPE", dinero(gastado)))
    ponerColor(g.llevas, Estilo.comercio("secundario"))
  end
end

-- Pinta el relleno de un botón de la barra (y se acuerda del color base para el ratón encima).
local function pintarBoton(b, fondo, letra)
  b.colorBase = fondo
  b.fondo:SetVertexColor(fondo[1], fondo[2], fondo[3], fondo[4] or 1)
  ponerColor(b.texto, letra)
end

-- Cuánto hay escaneado (los objetos con precio en el escaneo en vivo).
local function objetosEscaneados()
  local total = 0
  for _ in pairs(datosVivos()) do
    total = total + 1
  end
  return total
end

-- La barra de abajo según SNF.Compra.estado() y el escaneo: el texto del progreso, los dos botones y «Llevas X de Y».
-- tono del progreso: "nada" (sin relleno), "trabajo" (esperando al servidor), "listo" o "error".
local function pintarBarra()
  pintarGasto()
  local pie = raiz.pie
  local activo = SNF.Comercio.activo()
  local compra = rawget(SNF, "Compra")
  local e = activo and compra and compra.estado() or nil
  local etiqueta = L.t("COMERCIO_COMPRAR")
  local linea, tono = activo and L.t("COMERCIO_BARRA_NADA") or "", "nada"
  local puedeComprar, puedeDescartar, rojo = false, e ~= nil, false
  local exacto = false -- ronda 1 del arreglo de la compra suelta: el importe exacto de un objeto suelto
  if e then
    local n = Texto.numero(e.cantidad or 0)
    if e.fase == "buscando" then
      etiqueta, tono = L.t("COMERCIO_BOTON_BUSCANDO"), "trabajo"
      linea = e.esperando == "sistema" and L.t("COMERCIO_BARRA_OCUPADA") or L.t("COMERCIO_BARRA_BUSCANDO")
    elseif e.fase == "lista" then
      puedeComprar, tono = true, "listo"
      linea = L.t("COMERCIO_BARRA_LISTA", floor(e.cantidad or 0), dinero(e.total))
      -- Una compra cara pide dos clics y la barra lo dice, siempre igual (ronda 2 de B5, sin parpadeos): el armado del primer
      -- clic no se enseña, porque se apaga solo a los 5 s y el botón cambiaría solo de texto.
      if e.aviso then
        linea = L.t("COMERCIO_BARRA_CARA", floor(e.cantidad or 0), dinero(e.total))
        etiqueta, rojo = etiquetaConImporte(e.total, pie.comprar.texto, ANCHO_BOTON - 8, function(x) return L.t("COMERCIO_COMPRAR_ORO", x) end), true
      end
      -- B2r, punto 1: una mercancía «lista» no se compra con este clic, abre el cuadro de cantidad (abrirCuadro): el botón
      -- lo dice, sin unidades ni importe y sin rojo (el aviso de compra cara lo da el cuadro). La barra sigue diciendo lo
      -- elegido con su importe.
      if e.tipo == "mercancia" then
        etiqueta, rojo = L.t("COMERCIO_ELEGIR_CANTIDAD"), false
      elseif e.tipo == "objeto" then
        -- Arreglo de la compra suelta: «Comprar 1 por X» con el total exacto (ronda 1: sin «~»; el botón se ensancha si
        -- hace falta). El primer clic solo pide confirmar.
        etiqueta, exacto = L.t("SUBASTA_RES_COMPRAR", n, dinero(e.total)), true
      end
      -- B6r, ronda 2: no cabían todas a su precio y la compra volvió con las que quedan.
      if e.quedan then
        linea = L.t("COMERCIO_BARRA_QUEDAN", Texto.numero(e.pedidas or 0), Texto.numero(e.quedan))
      end
    elseif e.fase == "confirmar" and e.tipo == "objeto" then
      -- Arreglo de la compra suelta: un objeto suelto pide siempre el segundo clic; el botón y la barra dicen el total.
      puedeComprar, tono = true, "listo"
      etiqueta, exacto = L.t("SUBASTA_RES_CONFIRMAR", n, dinero(e.total)), true
      linea = L.t("COMERCIO_BARRA_CONFIRMAR_OBJETO", n, dinero(e.total))
    elseif e.fase == "confirmar" then
      puedeComprar, tono = true, "listo"
      etiqueta, rojo = etiquetaConImporte(e.total, pie.comprar.texto, ANCHO_BOTON - 8, function(x) return L.t("COMERCIO_CONFIRMAR", x) end), e.aviso or e.subio
      if e.subio then
        linea, tono = L.t("COMERCIO_BARRA_SUBIO", n, dinero(e.totalAntes), dinero(e.total)), "error"
      else
        linea = L.t("COMERCIO_BARRA_CONFIRMANDO")
      end
    elseif e.fase == "comprando" then
      etiqueta, tono = L.t("COMERCIO_BOTON_COMPRANDO"), "trabajo"
      puedeDescartar = e.esperando ~= "compra" -- una compra ya pedida al servidor no se puede soltar
      if e.esperando == "precio" then
        linea = L.t("COMERCIO_BARRA_PRECIO", n)
      else
        linea = L.t("COMERCIO_BARRA_COMPRANDO", n, dinero(e.total))
      end
    elseif e.fase == "hecho" then
      tono = "listo"
      linea = L.t("COMERCIO_BARRA_HECHO", n, dinero(e.total))
    elseif e.fase == "error" then
      linea, tono = L.t("COMERCIO_BARRA_ERROR", textoMotivo(e)), "error"
    end
  elseif activo then
    -- Sin compra preparada, la barra dice cómo va el escaneo.
    local escaneo = estadoEscaneo()
    if escaneo == "escaneando" then
      linea, tono = L.t("COMERCIO_BARRA_ESCANEANDO", objetosEscaneados()), "trabajo"
    elseif escaneo == "completo" then
      linea, tono = L.t("COMERCIO_BARRA_COMPLETO", objetosEscaneados()), "listo"
    end
  end
  local prog = pie.progreso
  prog.texto:SetText(linea)
  local relleno = tono == "error" and Estilo.comercio("rojo") or Estilo.comercio("acento")
  relleno[4] = tono == "error" and 0.8 or (tono == "listo" and 0.55 or 0.3)
  prog.relleno:SetVertexColor(relleno[1], relleno[2], relleno[3], relleno[4])
  prog.relleno:SetShown(tono ~= "nada")
  ponerColor(prog.texto, tono == "nada" and Estilo.comercio("secundario") or Estilo.comercio("texto"))
  pie.comprar.etiqueta = etiqueta
  local ancho = UIComercio.ajustarBoton(pie.comprar, pie.comprar.texto, etiqueta, ANCHO_BOTON, 8, exacto)
  pie.comprar.texto:SetWidth(ancho - 8) -- el texto nunca se sale del botón
  pie.comprar.refrescar()
  -- En combate no se compra: el botón va apagado (con su tooltip) y Compra.pulsar lo rechaza también por dentro. Se mira
  -- la marca de los eventos (SNF.Compra.combate()): PLAYER_REGEN_DISABLED llega antes que InCombatLockdown().
  local combate = SNF.Compra.combate()
  -- Recién cambiado lo que pide el botón (total nuevo por confirmar…): medio segundo atenuado. Tras el primer clic de una
  -- compra cara (armada) no se atenúa, y en combate tampoco (sale ya gris): nada cambia de aspecto solo.
  local bloqueada = puedeComprar and e.bloqueada and not e.armada and not combate and true or false
  puedeComprar = puedeComprar and not bloqueada and not combate
  if puedeComprar then
    pie.comprar:Enable()
  else
    pie.comprar:Disable()
  end
  if puedeComprar or bloqueada then
    local fondo = rojo and Estilo.comercio("rojo") or Estilo.comercio("acento")
    if bloqueada then
      fondo[4] = ALFA_BLOQUEADO
    end
    pintarBoton(pie.comprar, fondo, rojo and BLANCO or Estilo.comercio("acentoTexto"))
  else
    pintarBoton(pie.comprar, Estilo.comercio("cabecera"), Estilo.comercio("secundario"))
  end
  if puedeDescartar then
    pie.descartar:Enable()
  else
    pie.descartar:Disable()
  end
  pintarBoton(pie.descartar, Estilo.comercio("cabecera"),
    puedeDescartar and Estilo.comercio("texto") or Estilo.comercio("secundario"))
end

local function repintar()
  calcular()
  textosFijos()
  pintarCabecera()
  pintarGrupos()
  pintarFilas()
  pintarBarra()
end

-- Repintado por SNF_COMERCIO_ESCANEO: como mucho uno cada REPINTADO segundos; el que llega antes espera y pinta lo
-- último.
local function pedirRepintado(accion)
  if not raiz or not raiz:IsShown() then
    return
  end
  accion = accion or repintar
  local t = GetTime()
  local pasado = ultimoRepintado and (t - ultimoRepintado) or REPINTADO
  if pasado >= REPINTADO - 0.001 then
    ultimoRepintado = t
    accion()
  elseif not pendiente then
    pendiente = true
    accionPendiente = accion
    C_Timer.After(REPINTADO - pasado, function()
      pendiente = false
      local hacer = accionPendiente
      accionPendiente = nil
      ejecutar("ventana", function()
        if raiz and raiz:IsShown() then
          ultimoRepintado = GetTime()
          hacer()
        end
      end)
    end)
  elseif accion == repintar then
    accionPendiente = repintar -- el repintado entero vale por el parcial
  end
end

---------------------------------------------------------------------------------------------------
-- Posición
---------------------------------------------------------------------------------------------------

local MARGEN_ENTRE_PESTANAS = 4 -- hueco con el botón plano de reserva (sin plantilla) cuando no se puede copiar el de la última
local ALTURA_BORDE_PESTANAS = 15 -- una pestaña cuelga del borde de abajo si su parte de arriba no sube más de esto

local function subastaDeBlizzard()
  local subasta = rawget(_G, "AuctionHouseFrame")
  if type(subasta) == "table" and type(subasta.GetRight) == "function" then
    return subasta
  end
  return nil
end

-- Escala mínima de la subasta respecto a UIParent para poder usarla. TSM la deja en 0,001; un jugador que la achica
-- (BlizzMove, ElvUI, pantallas 4K con la interfaz a 0,36) no baja de 0,3, así que 0,1 los separa de sobra. Se mide
-- contra UIParent porque la escala efectiva absoluta depende de la escala de la interfaz.
local ESCALA_RELATIVA_MINIMA = 0.1

-- La subasta se puede usar si se ve, no está encogida y su rectángulo toca la pantalla. Sin medidas (justo tras un
-- ClearAllPoints, o recién enseñada) deciden solo la visibilidad y la escala: no se esconde nada por no saber.
local function subastaUsable(subasta)
  if type(subasta) ~= "table" or type(subasta.IsVisible) ~= "function" or not subasta:IsVisible() then
    return false
  end
  local escala = subasta:GetEffectiveScale()
  local escalaPantalla = UIParent:GetEffectiveScale()
  if type(escala) ~= "number" then
    return false
  end
  if type(escalaPantalla) ~= "number" or escalaPantalla <= 0 then
    escalaPantalla = 1
  end
  if escala / escalaPantalla < ESCALA_RELATIVA_MINIMA then
    return false
  end
  local izq, der, arriba, abajo = subasta:GetLeft(), subasta:GetRight(), subasta:GetTop(), subasta:GetBottom()
  local ancho, alto = UIParent:GetRight(), UIParent:GetTop()
  if type(izq) ~= "number" or type(der) ~= "number" or type(arriba) ~= "number" or type(abajo) ~= "number"
    or type(ancho) ~= "number" or type(alto) ~= "number" then
    return true
  end
  ancho, alto = ancho * escalaPantalla, alto * escalaPantalla
  izq, der, arriba, abajo = izq * escala, der * escala, arriba * escala, abajo * escala
  return der > 0 and izq < ancho and arriba > 0 and abajo < alto
end


---------------------------------------------------------------------------------------------------
-- Esconder la subasta de Blizzard (como TSM) y devolverla
---------------------------------------------------------------------------------------------------

-- Con nuestra vista la subasta de Blizzard se esconde sin Hide() (cerraría la subasta) y sin tocar su escala (tarea 15d):
-- alfa 0, fuera de la pantalla y sin coger el ratón. Sus pestañas y todo lo que cuelga de ella se van con ella (el alfa
-- se hereda). Con la escala buena, lo que la mide mientras está escondida (el skin de EllesmereUI, que calcula el grosor de
-- sus bordes con la escala) mide bien. Todo lo que toca la subasta va con pcall.
-- Escondido de reserva (15d r1 y r2): SetAlpha(0) no quita los clics y EnableMouse(false) no llega a sus botones; lo que
-- impide pulsarla sin verla es estar fuera de la pantalla. Se mira su rectángulo real (sub.quedaFuera), no su punto: si
-- alguna parte queda en pantalla (un «mover», como EnhanceQoLMover, la vuelve a poner en su sitio, o la sujeta a la
-- pantalla con SetClampedToScreen), pasa en el acto a escala 0,001 (ni se ve ni se puede pulsar; sub.ponerReserva), y se
-- comprueba. Si otro addon lo deshace en muchos fotogramas seguidos, nos rendimos: vista de Blizzard con todo devuelto
-- (sub.rendirse).
-- Siempre con el alfa ya en 0: no hay ningún fotograma en que se vea (regla de interfaz: nada puede parpadear).
-- Al abrir la subasta, ella y nuestra ventana pasan a alfa 0 en el mismo aviso y la subasta se esconde del todo un
-- fotograma después: entonces sale lo que toque (ver colocar).
local FUERA_X, FUERA_Y = -100000, 100000 -- desde su esquina de arriba a la izquierda
local PUNTO_FUERA = {{"TOPLEFT", UIParent, "TOPLEFT", FUERA_X, FUERA_Y}}
local ESCALA_RESERVA = 0.001

-- El estado de la subasta escondida, en una sola tabla:
--   dueno    {subasta, escala, alfa, raton, puntos = {{punto, relativo, relPunto, x, y}, ...}, reserva} mientras la tenemos
--            escondida nosotros (lo que tenía antes, para devolvérselo igual); nil si no la tenemos. reserva = true con el
--            escondido de reserva (escala 0,001): al devolverla se repone también la escala. racha: la cuenta de
--            fotogramas seguidos en que la deshacen (sub.fotogramasDeshecha).
--   tocando  true mientras SetAlpha/EnableMouse/SetScale/ClearAllPoints/SetPoint son nuestros (los ganchos los saltan: no
--            son de otro addon).
--   cambios  true si hay algo que hacerle a la subasta y estamos en combate: se hace al salir (PLAYER_REGEN_ENABLED).
--   medidas  {x, y, ancho, alto} del rectángulo que tenía en pantalla antes de esconderla, en unidades de UIParent.
--   nuestra  true si la ventana se coloca como vista nuestra (la subasta escondida); false con la vista de Blizzard.
--   deHecho  'blizzard' si otro addon tuvo la subasta y la devolvió: solo se enseña la pestaña (la vista guardada no cambia).
--   retrasar true solo durante el abrir() de un SNF_COMERCIO_ABIERTA: la subasta se esconde un fotograma después.
--   puntosAjenos     lo que teníamos guardado cuando otro addon (TSM) se quedó la subasta con su escala diminuta. Si luego
--                    aparece nuestro punto exacto con una escala usable (la devuelve solo con la escala, o TSM repone el
--                    punto que se guardó al esconderla, que era el nuestro), se reponen esos puntos. No se olvida cuando
--                    pone sus propios puntos ni al cerrar la subasta; sí cuando la volvemos a esconder nosotros.
--   preAlfa          {subasta, alfa} mientras la subasta está en alfa 0 desde el AUCTION_HOUSE_SHOW, esperando a
--                    esconderse del todo un fotograma después: alfa es el que tenía (el que se guarda o se devuelve).
--   pendiente        {subasta, puntos, alfa, raton, escala, modo} lo que no se pudo devolver (solo las partes que fallaron):
--                    se pone al salir de combate; modo = después, SetDisplayMode(Buy).
--   modoPendiente    true si se devolvió en combate: SetDisplayMode(Buy) y las listas, al salir.
--   reEsconderPedido true si hay un «volver a esconderla» pedido para el fotograma siguiente (se juntan).
--   rendida          true si en esta apertura no hubo forma de esconderla sin que se pudiera pulsar (otro addon deshace el
--                    escondido de reserva): se queda la vista de Blizzard hasta cerrar la subasta (sin vaivenes).
--   colocando        true mientras colocar() la esconde en el acto: si nos rendimos ahí, abrir() ya enseña la de Blizzard.
--   velada           true mientras nuestra ventana y su pestaña esperan en alfa 0 y sin ratón a que la subasta se
--                    esconda (al abrir). sinRaton: los marcos nuestros a los que se les quitó el ratón, para devolvérselo.
--   revisar          revisarSubasta (para llamarla desde sub.rendirse, que va antes en el archivo).
--   eraDiminuta      true si la última escala vista de la subasta era diminuta (la tiene TSM): al pasar a usable se pide
--                    al skin que recalcule sus bordes.
--   reservaQuieta    fotogramas que lleva la reserva sin que nadie la deshaga (para quitar el velo al abrir).
--   avisada, ultimoAviso  el aviso de rendidos ya salió en esta apertura, y cuándo salió el último.
--   ajustandoPestana true mientras ajustamos nosotros la pestaña (PanelTemplates_TabResize): el gancho de TabResize la salta.
--   recolocarPedido  true si ya hay una recolocación de la pestaña pedida para el fotograma siguiente (se junta con las demás).
--   tabResizeEnganchado true cuando ya está puesto el gancho de PanelTemplates_TabResize (se pone una sola vez).
--   huecoPlantilla, sangriasPlantilla, listasSubasta: constantes de la pestaña y de las listas que se reenseñan al volver a Comprar.
--   y funciones: estadoDe, apuntarPendiente, quitarPreAlfa, mirarAjenos, volverAComprar, reEsconder, pedirReEsconder,
--   reEsconderAhora, pedirResnap, resnap, colgadaDe, huecoPestana, sangriasPestana, estiloPestana, pestanaDeLaSubasta,
--   pedirRecolocar.
local sub = {tocando = false, cambios = false, nuestra = false}
sub.huecoPlantilla = -14 -- hueco entre pestañas con la plantilla de Blizzard en Forever (LibAHTab: OFFSET_X = -14)
sub.sangriasPlantilla = {5.5, 5.5, 0, 0} -- sangrías de clic de LibAHTab (SetHitRectInsets)

-- Para nosotros es usable la subasta que se puede usar y la que hemos escondido nosotros.
local function subastaNuestraOUsable(subasta)
  if sub.dueno and sub.dueno.subasta == subasta then
    return true
  end
  return subastaUsable(subasta)
end

-- El rectángulo de la subasta en pantalla, en unidades de UIParent (donde va a vivir nuestra ventana); nil sin medidas.
local function medirSubasta(subasta)
  local ok, r = pcall(function()
    local izq, der, arriba, abajo = subasta:GetLeft(), subasta:GetRight(), subasta:GetTop(), subasta:GetBottom()
    local escala, escalaPantalla = subasta:GetEffectiveScale(), UIParent:GetEffectiveScale()
    if type(izq) ~= "number" or type(der) ~= "number" or type(arriba) ~= "number" or type(abajo) ~= "number"
      or type(escala) ~= "number" then
      return nil
    end
    if type(escalaPantalla) ~= "number" or escalaPantalla <= 0 then
      escalaPantalla = 1
    end
    local k = escala / escalaPantalla
    local ancho, alto = (der - izq) * k, (arriba - abajo) * k
    if ancho <= 0 or alto <= 0 then
      return nil
    end
    return {x = izq * k, y = arriba * k, ancho = ancho, alto = alto}
  end)
  return ok and r or nil
end

-- Lo que tiene la subasta ahora: escala, alfa, ratón y todos sus puntos de anclaje.
local function guardarSubasta(subasta)
  local guardado = {subasta = subasta, escala = subasta:GetScale(), alfa = subasta:GetAlpha(),
    raton = subasta:IsMouseEnabled() and true or false, puntos = {}}
  for i = 1, subasta:GetNumPoints() do
    local punto, relativo, relPunto, x, y = subasta:GetPoint(i)
    guardado.puntos[#guardado.puntos + 1] = {punto, relativo, relPunto, x, y}
  end
  return guardado
end

-- Pone en la subasta lo que traiga estado = {alfa, raton, escala, puntos} (lo que falte no se toca), con los ganchos
-- avisados de que es nuestro. El alfa va primero (al esconderla, invisible antes de nada) y cada parte con su pcall: si
-- fallan los puntos, el alfa y el ratón se ponen igual (la subasta no puede quedar invisible por un fallo). Devuelve true
-- si todo fue bien y las partes que fallaron ({alfa = ..., puntos = ...}).
local function ponerSubasta(subasta, estado)
  local antes = sub.tocando
  sub.tocando = true
  local fallos = {}
  if estado.alfa ~= nil and not pcall(subasta.SetAlpha, subasta, estado.alfa) then
    fallos.alfa = estado.alfa
  end
  if estado.raton ~= nil and not pcall(subasta.EnableMouse, subasta, estado.raton) then
    fallos.raton = estado.raton
  end
  if estado.escala ~= nil and not pcall(subasta.SetScale, subasta, estado.escala) then
    fallos.escala = estado.escala
  end
  if estado.puntos and not pcall(function()
    subasta:ClearAllPoints()
    for _, p in ipairs(estado.puntos) do
      subasta:SetPoint(p[1], p[2], p[3], p[4], p[5])
    end
  end) then
    fallos.puntos = estado.puntos
  end
  sub.tocando = antes
  return next(fallos) == nil, fallos
end

-- Lo que hay que ponerle para devolverla como estaba: sus puntos, su alfa y su ratón; la escala, solo si la tocamos
-- nosotros (escondido de reserva).
function sub.estadoDe(guardado)
  return {puntos = guardado.puntos, alfa = guardado.alfa, raton = guardado.raton,
    escala = guardado.reserva and guardado.escala or nil}
end

-- Apunta lo que no se pudo devolver (solo las partes que fallaron, ver ponerSubasta) para ponerlo al salir de combate.
function sub.apuntarPendiente(subasta, fallos, modo)
  local p = sub.pendiente
  if not p or p.subasta ~= subasta then
    p = {subasta = subasta}
  end
  for parte, valor in pairs(fallos) do
    p[parte] = valor
  end
  p.modo = p.modo or modo
  sub.pendiente = p
  sub.cambios = true
end

-- La subasta estaba en alfa 0 desde el AUCTION_HOUSE_SHOW y al final no se esconde (TSM la tiene, se cerró, la vista es la
-- de Blizzard o hay combate): vuelve su alfa.
function sub.quitarPreAlfa()
  local pre = sub.preAlfa
  sub.preAlfa = nil
  if pre and not (sub.dueno and sub.dueno.subasta == pre.subasta) then
    ponerSubasta(pre.subasta, {alfa = pre.alfa})
  end
end

-- La hora del juego (GetTime). Vale lo mismo durante todo un fotograma: sirve para saber si dos cosas pasan en el mismo.
function sub.ahora()
  local ok, ahora = pcall(rawget(_G, "GetTime"))
  return ok and type(ahora) == "number" and ahora or 0
end

-- Mientras está velada, nuestra ventana tampoco coge el ratón (15d r4): con alfa 0 no se ve, pero sus botones se podrían
-- pulsar sin verlos. Se le quita el ratón al marco raíz, a todo lo que cuelga de él y a su pestaña (EnableMouse(false) no
-- llega a los hijos: hay que ir uno por uno), y se apunta a quién se le quitó (sub.sinRaton) para devolvérselo igual. Se
-- puede llamar varias veces: lo que se haya creado después también se queda sin ratón.
function sub.quitarRaton()
  if not raiz then
    return
  end
  local quitados = sub.sinRaton or {}
  sub.sinRaton = quitados
  local function quitar(marco)
    pcall(function()
      if marco:IsMouseEnabled() then
        marco:EnableMouse(false)
        quitados[#quitados + 1] = marco
      end
    end)
    local ok, hijos = pcall(function() return {marco:GetChildren()} end)
    if ok then
      for _, hijo in ipairs(hijos) do
        quitar(hijo)
      end
    end
  end
  quitar(raiz)
  if raiz.pestanaSnet then
    quitar(raiz.pestanaSnet)
  end
end

-- Devuelve el ratón a los que se lo quitó sub.quitarRaton, y solo a esos: lo que no lo cogía sigue sin cogerlo.
function sub.devolverRaton()
  local quitados = sub.sinRaton
  sub.sinRaton = nil
  if quitados then
    for _, marco in ipairs(quitados) do
      pcall(marco.EnableMouse, marco, true)
    end
  end
end

-- Al abrir, nuestra ventana y su pestaña esperan en alfa 0 y sin coger el ratón a que la subasta se esconda un fotograma
-- después (15d r2 y r4): si entonces nos rendimos o la tiene TSM, nuestra ventana no se ha visto ni un fotograma para irse
-- en el siguiente, y mientras no se ve tampoco se puede pulsar.
function sub.velar(si)
  sub.velada = si and true or nil
  if not raiz then
    return
  end
  if si then
    sub.quitarRaton()
  end
  pcall(raiz.SetAlpha, raiz, si and 0 or 1)
  if raiz.pestanaSnet then
    pcall(raiz.pestanaSnet.SetAlpha, raiz.pestanaSnet, si and 0 or 1)
  end
  if not si then
    sub.devolverRaton()
    if sub.arrancarEscaneo then
      sub.arrancarEscaneo() -- F13: el escaneo que llegó a su hora con la ventana aún velada
    end
  end
end

-- ¿Una escala así deja la subasta sin poder usarse (la esconde otro addon)? La subasta cuelga de UIParent: su escala
-- relativa es la suya, como en subastaUsable.
local function escalaDiminuta(escala)
  return type(escala) == "number" and escala < ESCALA_RELATIVA_MINIMA
end

-- ¿Tiene la subasta como único punto el nuestro, fuera de la pantalla?
local function puntoFuera(subasta)
  local ok, igual = pcall(function()
    if subasta:GetNumPoints() ~= 1 then
      return false
    end
    local punto, relativo, relPunto, x, y = subasta:GetPoint(1)
    return punto == "TOPLEFT" and relativo == UIParent and relPunto == "TOPLEFT"
      and type(x) == "number" and type(y) == "number" and math.abs(x - FUERA_X) < 1 and math.abs(y - FUERA_Y) < 1
  end)
  return ok and igual == true
end

-- Al devolver la subasta, vuelve a la pantalla de Comprar con SetDisplayMode (como TSM): eso enseña otra vez la lista y lo
-- que la pinta la vuelve a medir (tarea 15c). Se llama después de poner los puntos, el alfa y el ratón. Si la subasta ya
-- estaba en Comprar, SetDisplayMode puede no volver a enseñar la lista: por eso cada lista de la subasta que está a la
-- vista se esconde y se enseña en la misma llamada, para que salte su OnShow. Todo con pcall; nunca en combate; con la
-- subasta oculta no hace falta (al enseñarse se mide sola). Lo que haga con la escala, el alfa o los puntos no es de otro
-- addon (tocando).
sub.listasSubasta = {
  {"BrowseResultsFrame", "ItemList"}, {"CommoditiesBuyFrame", "ItemList"}, {"ItemBuyFrame", "ItemList"},
  {"AuctionsFrame", "ItemList"}, {"ItemSellList"}, {"CommoditiesSellList"},
}
function sub.volverAComprar(subasta)
  if InCombatLockdown() then
    return
  end
  local antes = sub.tocando
  sub.tocando = true
  pcall(function()
    if not subasta:IsShown() then
      return
    end
    pcall(function()
      local modos = rawget(_G, "AuctionHouseFrameDisplayMode")
      local comprar = type(modos) == "table" and modos.Buy or nil
      local poner = subasta.SetDisplayMode
      if comprar ~= nil and type(poner) == "function" then
        poner(subasta, comprar)
      end
    end)
    for _, ruta in ipairs(sub.listasSubasta) do
      -- Cada lista con su pcall: una que falla no impide las demás. Las que no se ven no se tocan.
      pcall(function()
        local lista = subasta[ruta[1]]
        if ruta[2] and lista then
          lista = lista[ruta[2]]
        end
        if lista and lista:IsShown() then
          lista:Hide()
          lista:Show()
        end
      end)
    end
  end)
  sub.tocando = antes
end

-- Otro addon (TSM) se quedó la subasta con su escala diminuta y ahora aparece nuestro punto exacto con una escala usable: la
-- ha devuelto solo con la escala, o TSM ha repuesto el punto que se guardó al esconderla (era el nuestro). Se le ponen los
-- puntos que tenía antes de esconderla nosotros: nunca queda fuera de la pantalla por nuestra culpa.
function sub.mirarAjenos(subasta)
  local ajenos = sub.puntosAjenos
  if not ajenos then
    return
  end
  if ajenos.subasta ~= subasta then
    sub.puntosAjenos = nil
    return
  end
  local ok, escala = pcall(subasta.GetScale, subasta)
  if not ok or type(escala) ~= "number" or escalaDiminuta(escala) or not puntoFuera(subasta) then
    return
  end
  local bien, fallos = ponerSubasta(subasta, {puntos = ajenos.puntos})
  if not bien then
    sub.apuntarPendiente(subasta, fallos)
  end
end

-- ¿Queda la subasta del todo fuera de la pantalla? Se mira su rectángulo real frente a la pantalla de UIParent, no su punto
-- de anclaje (15d r2): una subasta sujeta a la pantalla (SetClampedToScreen, lo pone EnhanceQoLMover) la mete WoW dentro
-- aunque GetPoint siga dando nuestro punto. true = fuera del todo; false = alguna parte dentro, o sujeta a la pantalla; nil
-- = sin medidas.
function sub.quedaFuera(subasta)
  local ok, fuera = pcall(function()
    if type(subasta.IsClampedToScreen) == "function" and subasta:IsClampedToScreen() then
      return false
    end
    local izq, der, arriba, abajo = subasta:GetLeft(), subasta:GetRight(), subasta:GetTop(), subasta:GetBottom()
    local escala, escalaPantalla = subasta:GetEffectiveScale(), UIParent:GetEffectiveScale()
    local ancho, alto = UIParent:GetRight(), UIParent:GetTop()
    if type(izq) ~= "number" or type(der) ~= "number" or type(arriba) ~= "number" or type(abajo) ~= "number"
      or type(escala) ~= "number" or type(escalaPantalla) ~= "number" or type(ancho) ~= "number"
      or type(alto) ~= "number" then
      return nil
    end
    ancho, alto = ancho * escalaPantalla, alto * escalaPantalla
    izq, der, arriba, abajo = izq * escala, der * escala, arriba * escala, abajo * escala
    return not (der > 0 and izq < ancho and arriba > 0 and abajo < alto)
  end)
  if not ok then
    return nil
  end
  return fuera
end

-- ¿No se ve ni se puede pulsar? Fuera de la pantalla, tan pequeña que no llega a 2 × 2 (el escondido de reserva) o sin
-- anclajes (sin rectángulo no se dibuja).
function sub.noSeVe(subasta)
  if sub.quedaFuera(subasta) == true then
    return true
  end
  local ok, diminuta = pcall(function()
    local izq, der, arriba, abajo = subasta:GetLeft(), subasta:GetRight(), subasta:GetTop(), subasta:GetBottom()
    local escala = subasta:GetEffectiveScale()
    if type(izq) ~= "number" or type(der) ~= "number" or type(arriba) ~= "number" or type(abajo) ~= "number" then
      return true
    end
    if type(escala) ~= "number" then
      return false
    end
    return (der - izq) * escala < 2 and (arriba - abajo) * escala < 2
  end)
  return ok and diminuta == true
end

-- Seguimos siendo dueños de la subasta, pero otro addon le ha cambiado el sitio, el alfa o el ratón: otra vez alfa 0, sin
-- ratón y (sin el escondido de reserva) nuestro punto fuera. Solo se toca lo que ya no está como lo dejamos. La escala
-- de reserva la pone sub.ponerReserva.
function sub.reEsconder(subasta)
  local guardado = sub.dueno
  if not guardado or guardado.subasta ~= subasta then
    return
  end
  local estado = {}
  local okAlfa, alfa = pcall(subasta.GetAlpha, subasta)
  if not okAlfa or alfa ~= 0 then
    estado.alfa = 0
  end
  local okRaton, raton = pcall(subasta.IsMouseEnabled, subasta)
  if not okRaton or raton then
    estado.raton = false
  end
  if not guardado.reserva and not puntoFuera(subasta) then
    estado.puntos = PUNTO_FUERA
  end
  if next(estado) then
    ponerSubasta(subasta, estado)
  end
end

-- Volver a esconderla un fotograma después de un cambio de sitio ajeno que la deja fuera de la pantalla o sin medidas (se
-- juntan los avisos): así no nos peleamos con quien la está moviendo (TSM pone sus puntos y luego su escala, y entonces ya
-- es suya). Si el cambio la deja a la vista, no se espera: ver alCambiar. Sin C_Timer, al momento.
function sub.pedirReEsconder()
  if sub.reEsconderPedido then
    return
  end
  local temporizador = rawget(_G, "C_Timer")
  local ok = type(temporizador) == "table" and type(temporizador.After) == "function"
  if ok then
    sub.reEsconderPedido = true
    ok = pcall(temporizador.After, 0, siempre("ventana", function()
      sub.reEsconderPedido = false
      sub.reEsconderAhora()
    end))
  end
  if not ok then
    sub.reEsconderPedido = false
    sub.reEsconderAhora()
  end
end

-- La vuelve a esconder y, si no queda fuera de la pantalla de verdad, el escondido de reserva en el acto. Mira el dueño de
-- ahora (si cambió de dueño entre medias, es el nuevo el que se esconde, sin arrastrar nada del anterior). También en
-- combate: AuctionHouseFrame no está protegida (TSM la mueve en combate) y en pantalla con alfa 0 se podría pulsar sin verla.
function sub.reEsconderAhora()
  local guardado = sub.dueno
  if not guardado then
    return
  end
  local subasta = guardado.subasta
  sub.reEsconder(subasta)
  if guardado.reserva then
    local ok, escala = pcall(subasta.GetScale, subasta)
    if not ok or type(escala) ~= "number" or math.abs(escala - ESCALA_RESERVA) > 1e-6 or not sub.noSeVe(subasta) then
      sub.ponerReserva()
    end
  elseif sub.quedaFuera(subasta) ~= true then
    sub.ponerReserva()
  end
end

-- ¿En cuántos fotogramas seguidos, contando este, han deshecho la reserva (15d r4)? Se cuentan fotogramas, no veces:
-- varias veces en el mismo fotograma cuentan como una (el mover pone su escala en cada SetPoint, y una recolocación son
-- varios SetPoint). Si pasa un fotograma entero sin que nadie la deshaga, la cuenta vuelve a empezar.
-- guardado.racha = {n, tiempo, ultimo, seguidos}:
--   n, tiempo  el fotograma por el que va nuestro reloj (un C_Timer por fotograma mientras dura la racha) y su GetTime;
--   ultimo     el último fotograma en que la deshicieron;
--   seguidos   en cuántos fotogramas seguidos la han deshecho.
-- El fotograma de ahora es n si GetTime sigue igual que cuando corrió nuestro reloj, y n + 1 si ya ha cambiado (nuestro
-- reloj aún no ha corrido en este fotograma). Así da lo mismo que el otro addon actúe antes o después que nuestro reloj
-- (con un C_Timer o con un OnUpdate): la cuenta sale igual.
function sub.fotogramasDeshecha(guardado)
  local ahora = sub.ahora()
  local racha = guardado.racha
  if not racha then
    racha = {n = 0, tiempo = ahora, seguidos = 0}
    guardado.racha = racha
    sub.latirRacha(guardado, racha)
  end
  local fotograma = ahora == racha.tiempo and racha.n or racha.n + 1
  if racha.ultimo ~= fotograma then
    racha.seguidos = (racha.ultimo and fotograma == racha.ultimo + 1) and racha.seguidos + 1 or 1
    racha.ultimo = fotograma
  end
  return racha.seguidos
end

-- El reloj de la racha: un paso por fotograma. Se para solo (y la cuenta vuelve a cero) cuando pasa un fotograma entero
-- con la reserva puesta sin que nadie la deshaga, o cuando la subasta deja de ser nuestra.
function sub.latirRacha(guardado, racha)
  local temporizador = rawget(_G, "C_Timer")
  if type(temporizador) ~= "table" or type(temporizador.After) ~= "function" then
    return
  end
  pcall(temporizador.After, 0, siempre("ventana", function()
    if sub.dueno ~= guardado or guardado.racha ~= racha then
      return
    end
    local ahora = sub.ahora()
    if ahora ~= racha.tiempo then
      racha.n = racha.n + 1
      racha.tiempo = ahora
    end
    if racha.n > racha.ultimo + 1 then
      guardado.racha = nil -- un fotograma entero quieta: la cuenta vuelve a cero
      return
    end
    sub.latirRacha(guardado, racha)
  end))
end

-- Escondido de reserva: escala 0,001 con el alfa ya en 0 (no se ve en ningún momento) y sin ratón. SetScale no se pelea con
-- TSM (TSM no engancha SetScale), así que va en el acto. Después se comprueba que la escala quedó puesta y que no se ve:
-- si no, nos rendimos en el acto (sub.rendirse; quedaría invisible y pulsable).
-- Si otro addon la deshace más tarde, se vuelve a poner en el acto (siempre con alfa 0: ni se ve ni se puede pulsar). Nos
-- rendimos si la deshacen en más de FOTOGRAMAS_RENDIRSE fotogramas seguidos (15d r4, ver sub.fotogramasDeshecha): eso es
-- un addon que se pelea con nosotros en cada fotograma. El mover (EnhanceQoLMover pone su escala en cada SetPoint, al
-- enseñarse y un fotograma después) la deshace en dos o tres fotogramas seguidos como mucho, y no nos rinde. Son
-- fotogramas, no segundos: a 60 por segundo nos rendimos en una décima; a 20, en tres décimas.
sub.FOTOGRAMAS_RENDIRSE = 5
function sub.ponerReserva()
  local guardado = sub.dueno
  if not guardado then
    return
  end
  local subasta = guardado.subasta
  sub.reservaQuieta = 0 -- para el velo de nuestra ventana al abrir (sub.esperarQuieta)
  if guardado.reserva and sub.fotogramasDeshecha(guardado) > sub.FOTOGRAMAS_RENDIRSE then
    sub.rendirse()
    return
  end
  guardado.reserva = true
  ponerSubasta(subasta, {alfa = 0, raton = false, escala = ESCALA_RESERVA})
  if not sub.noSeVe(subasta) then
    -- anclada por dos lados se estira aunque sea diminuta: con un solo punto, el nuestro, vuelve a ser diminuta
    ponerSubasta(subasta, {puntos = PUNTO_FUERA})
  end
  local okEscala, escala = pcall(subasta.GetScale, subasta)
  if not okEscala or type(escala) ~= "number" or math.abs(escala - ESCALA_RESERVA) > 1e-6 or not sub.noSeVe(subasta) then
    sub.rendirse()
  end
end

-- Al abrir con el escondido de reserva, nuestra ventana sigue velada (sub.velar) hasta que la reserva lleve
-- FOTOGRAMAS_QUIETA fotogramas sin que nadie la deshaga (15d r3): si en ese tiempo hay que rendirse, nuestra ventana no
-- llega a verse. También se quita el velo si la subasta deja de ser nuestra (nos rendimos, o la tiene TSM), y como mucho
-- a los ESPERA_VELO segundos de reloj (GetTime; no depende de los fotogramas por segundo, 15d r4). Si al cumplirse ese
-- tiempo la están deshaciendo en fotogramas seguidos (dos o más), espera a que acabe la racha: acaba en pocos fotogramas,
-- porque o paran o nos rendimos (sub.FOTOGRAMAS_RENDIRSE), y así nuestra ventana no sale para irse enseguida. Mientras
-- espera, lo nuevo que se cree en nuestra ventana tampoco coge el ratón (sub.quitarRaton).
sub.FOTOGRAMAS_QUIETA = 3
sub.ESPERA_VELO = 1
function sub.esperarQuieta()
  sub.reservaQuieta = 0
  local temporizador = rawget(_G, "C_Timer")
  if type(temporizador) ~= "table" or type(temporizador.After) ~= "function" then
    sub.velar(false)
    return
  end
  local desde = sub.ahora()
  local function paso()
    if not sub.velada then
      return
    end
    local guardado = sub.dueno
    sub.reservaQuieta = (sub.reservaQuieta or 0) + 1
    local racha = guardado and guardado.racha
    local enRacha = racha and racha.seguidos >= 2
    if not guardado or not guardado.reserva or sub.reservaQuieta >= sub.FOTOGRAMAS_QUIETA
      or (sub.ahora() - desde >= sub.ESPERA_VELO and not enRacha) then
      sub.velar(false)
      return
    end
    sub.quitarRaton()
    if not pcall(temporizador.After, 0, siempre("ventana", paso)) then
      sub.velar(false)
    end
  end
  if not pcall(temporizador.After, 0, siempre("ventana", paso)) then
    sub.velar(false)
  end
end

-- Aviso en el chat de que nos hemos rendido: una sola vez por apertura al rendirnos; al pulsar nuestra pestaña rendidos,
-- como mucho una vez cada ESPERA_AVISO segundos.
sub.ESPERA_AVISO = 5
function sub.avisarRendida(porPestana)
  local ahora = sub.ahora()
  if porPestana then
    if sub.ultimoAviso and ahora - sub.ultimoAviso < sub.ESPERA_AVISO then
      return
    end
  elseif sub.avisada then
    return
  end
  sub.avisada = true
  sub.ultimoAviso = ahora
  print(L.t("COMERCIO_RENDIDA"))
end

-- No hay forma de esconderla sin que se pueda pulsar: se suelta y se enseña la vista de Blizzard, con todo devuelto (alfa,
-- ratón, puntos y escala), que se ve y se usa. Una sola vez: hasta cerrar la subasta no se vuelve a intentar (sub.rendida),
-- así no hay vaivén entre las dos vistas. Si pasa mientras se coloca (sub.colocando), abrir() ya enseña la de Blizzard.
function sub.rendirse()
  sub.rendida = true
  local guardado = sub.dueno
  if not guardado then
    return
  end
  sub.dueno = nil
  sub.medidas = nil
  sub.cambios = false
  sub.nuestra = false
  sub.deHecho = "blizzard"
  local subasta = guardado.subasta
  local estado = sub.estadoDe(guardado)
  estado.escala = guardado.escala
  local bien, fallos = ponerSubasta(subasta, estado)
  if not bien then
    sub.apuntarPendiente(subasta, fallos, true)
  elseif InCombatLockdown() then
    sub.modoPendiente = true
    sub.cambios = true
  else
    sub.volverAComprar(subasta)
  end
  sub.avisarRendida(false)
  if not sub.colocando and sub.revisar then
    sub.revisar(true)
  end
end

-- El skin de EllesmereUI calcula el grosor de sus bordes de 1 píxel con la escala de la subasta. Si lo hizo mientras otro
-- addon (TSM) la tenía a escala 0,001, los bordes salen unas 1000 veces más gruesos (franjas grises) y no se recalculan
-- solos al volver. Cuando la subasta vuelve a tener escala usable (la devuelve otro addon o la devolvemos nosotros) se
-- le pide que los recalcule con su API pública, EllesmereUI.PP.ResnapBordersUnder(subasta), en el acto (15d r2): en la
-- misma llamada que pone la escala, para que no se dibuje ni un fotograma con las franjas (el grosor solo depende de la
-- escala, no de los puntos). También en combate (15d r3): solo cambia el alto de unas texturas de un marco que no está
-- protegido. Solo si la subasta sigue con escala usable. Es una llamada opcional a otro addon: sin él no pasa nada, y va
-- con pcall.
function sub.pedirResnap()
  sub.resnap()
end

function sub.resnap()
  local subasta = subastaDeBlizzard()
  if not subasta then
    return
  end
  local ok, escala = pcall(subasta.GetScale, subasta)
  if not ok or type(escala) ~= "number" or escalaDiminuta(escala) then
    return -- otra vez escondida con su escala: lo mediría mal; se pedirá cuando vuelva
  end
  local eui = rawget(_G, "EllesmereUI")
  if type(eui) ~= "table" then
    return
  end
  pcall(function()
    local pp = eui.PP
    local recalcular = type(pp) == "table" and pp.ResnapBordersUnder or nil
    if type(recalcular) == "function" then
      recalcular(subasta)
    end
  end)
end

-- Esconde la subasta si la podemos esconder (usable, aún no nuestra y sin habernos rendido en esta apertura). En combate se
-- aplaza, salvo si ya estaba en alfa 0 desde el AUCTION_HOUSE_SHOW (el combate empezó en ese fotograma): entonces se
-- termina de esconder, para que no vuelva a verse un fotograma (destello) ni se quede en pantalla con alfa 0, que se
-- podría pulsar sin verla. Si no queda fuera de la pantalla de verdad, el escondido de reserva en el acto.
local function esconderSubasta(subasta)
  if sub.dueno or sub.rendida or not subastaUsable(subasta) then
    sub.quitarPreAlfa()
    return
  end
  local pre = sub.preAlfa
  if pre and pre.subasta ~= subasta then
    sub.quitarPreAlfa()
    pre = nil
  end
  if InCombatLockdown() and not pre then
    sub.cambios = true
    return
  end
  sub.cambios = false
  local bien, guardado = pcall(guardarSubasta, subasta)
  if not bien then
    sub.quitarPreAlfa()
    return
  end
  sub.preAlfa = nil
  if pre then
    guardado.alfa = pre.alfa -- el de antes del primer fotograma, no nuestro 0
  end
  local estado = {raton = false, puntos = PUNTO_FUERA}
  local okAlfa, alfa = pcall(subasta.GetAlpha, subasta)
  if not okAlfa or alfa ~= 0 then
    estado.alfa = 0
  end
  if ponerSubasta(subasta, estado) then
    sub.dueno = guardado
    sub.puntosAjenos = nil
    if raiz and sub.nuestra then
      sub.ponerPosicion() -- ya la tenemos escondida: nuestra ventana pasa a su posición en esta misma llamada
    end
    if sub.quedaFuera(subasta) ~= true then
      sub.ponerReserva() -- otro addon la ha vuelto a poner en pantalla, o está sujeta a la pantalla
    end
  else
    ponerSubasta(subasta, sub.estadoDe(guardado)) -- a medias: se deja como estaba (puntos, alfa y ratón)
  end
end

-- Devuelve la subasta a lo que tenía (puntos, alfa y ratón; la escala, si la tocamos nosotros) mientras seamos sus dueños.
-- Después de esto no queda nada guardado. También en combate (15d r1): AuctionHouseFrame no está protegida y así nunca
-- espera invisible a que acabe; SetDisplayMode, las listas y el skin sí esperan a salir (modoPendiente, resnap). Con el
-- escondido de reserva el recálculo de los bordes lo pide el gancho de SetScale, en la misma llamada.
local function reponerSubasta()
  sub.quitarPreAlfa()
  local guardado = sub.dueno
  sub.cambios = false
  if not guardado then
    return
  end
  sub.dueno = nil
  local subasta = guardado.subasta
  local bien, fallos = ponerSubasta(subasta, sub.estadoDe(guardado))
  if not bien then
    sub.apuntarPendiente(subasta, fallos, true)
  elseif InCombatLockdown() then
    sub.modoPendiente = true
    sub.cambios = true
  else
    sub.volverAComprar(subasta)
  end
  if not guardado.reserva then
    sub.pedirResnap()
  end
end

-- Otro addon (TSM) ha puesto una escala diminuta a la subasta que teníamos escondida: ahora es suya y no la reponemos.
-- Pero nunca queda invisible ni sin ratón por nuestra culpa: se le devuelven ya el alfa y el ratón (con su 0,001 no se
-- ve). Los puntos no se tocan (los pone ese addon; si aparece el nuestro con escala usable, ver sub.mirarAjenos). Lo que
-- ahora no se pueda poner se pone al salir de combate.
local function soltarSubasta()
  local guardado = sub.dueno
  sub.dueno = nil
  sub.cambios = false
  sub.medidas = nil
  sub.deHecho = "blizzard"
  if not guardado then
    return
  end
  sub.puntosAjenos = guardado
  local bien, fallos = ponerSubasta(guardado.subasta, {alfa = guardado.alfa, raton = guardado.raton})
  if not bien then
    sub.apuntarPendiente(guardado.subasta, fallos)
  end
end

-- La subasta de Blizzard en una sola vista: con nuestra vista, escondida; con la de Blizzard, repuesta. Antes, lo que no
-- se pudo devolver (solo esas partes: lo ya devuelto no se vuelve a poner) y lo que esperaba a salir de combate.
local function sincronizarSubasta()
  local subasta = subastaDeBlizzard()
  if not subasta then
    return
  end
  local p = sub.pendiente
  sub.pendiente = nil
  local modo = sub.modoPendiente
  sub.modoPendiente = nil
  if p and p.subasta == subasta then
    local estado = {alfa = p.alfa, raton = p.raton, escala = p.escala}
    if p.puntos then
      -- los puntos, solo si sigue el nuestro o se quedó sin ninguno a medias: si otro addon puso los suyos, son suyos
      local okPuntos, nPuntos = pcall(subasta.GetNumPoints, subasta)
      if puntoFuera(subasta) or (okPuntos and nPuntos == 0) then
        estado.puntos = p.puntos
      end
    end
    local bien, fallos = ponerSubasta(subasta, estado)
    if not bien then
      sub.apuntarPendiente(subasta, fallos, p.modo)
    end
    modo = modo or p.modo
  end
  if modo and not sub.dueno and not InCombatLockdown() and subastaUsable(subasta) then
    sub.volverAComprar(subasta)
  end
  local quiere = raiz ~= nil and sub.nuestra and raiz:IsShown() and SNF.Comercio.abierta()
  if quiere and not sub.dueno then
    esconderSubasta(subasta)
  elseif not quiere and sub.dueno then
    reponerSubasta()
  end
end

local enganchadas = setmetatable({}, {__mode = "k"}) -- pestañas de la subasta con nuestro gancho puesto

-- Pulsar una pestaña de la subasta (de Blizzard o de otro addon) enseña su contenido: nuestra ventana, que lo taparía,
-- se aparta y la vista queda en Blizzard.
local function enganchar(pestana)
  if enganchadas[pestana] or type(pestana.HookScript) ~= "function" then
    return
  end
  enganchadas[pestana] = true
  -- Con pcall: un gancho que falla en otro cliente no debe apagar el comercio.
  pcall(pestana.HookScript, pestana, "OnClick", siempre("ventana", function()
    if raiz and raiz:IsShown() then
      UIComercio.ponerVista("blizzard")
    end
  end))
end

-- ¿Está f anclado a objetivo, directa o indirectamente (cadena de anclajes)? Para no anclar nuestra pestaña a algo que
-- ya cuelga de ella (sería un ciclo).
function sub.colgadaDe(f, objetivo, vistos)
  if f == objetivo then
    return true
  end
  if type(f) ~= "table" or vistos[f] or type(f.GetNumPoints) ~= "function" then
    return false
  end
  vistos[f] = true
  for i = 1, f:GetNumPoints() do
    local _, relativo = f:GetPoint(i)
    if type(relativo) == "table" and sub.colgadaDe(relativo, objetivo, vistos) then
      return true
    end
  end
  return false
end

-- La última pestaña visible de la subasta, la que está más a la derecha: las de AuctionHouseFrame.Tabs y cualquier
-- botón que cuelgue del borde de abajo, hijo de la subasta o de uno de sus hijos (las de otros addons: LibAHTab, que usan
-- Auctionator y TSM, las cuelga de un marco raíz hijo de la subasta). Cuesta poco: solo se mira al abrir la subasta.
local function ultimaPestana(subasta)
  local mejor, mejorDerecha = nil, nil
  local abajo = subasta:GetBottom()
  local function mirar(f, deTabs)
    -- Solo botones: un marco cualquiera colgando del borde no es una pestaña (ni se engancha, ni se mide).
    if type(f) ~= "table" or f == raiz.pestanaSnet or type(f.IsObjectType) ~= "function"
      or not f:IsObjectType("Button") or type(f.IsShown) ~= "function" or not f:IsShown()
      or type(f.GetRight) ~= "function" then
      return
    end
    local derecha = f:GetRight()
    if type(derecha) ~= "number" then
      return
    end
    if not deTabs then
      local arriba, fondo = f:GetTop(), f:GetBottom()
      if type(abajo) ~= "number" or type(arriba) ~= "number" or type(fondo) ~= "number"
        or arriba > abajo + ALTURA_BORDE_PESTANAS or fondo >= abajo then
        return
      end
    end
    enganchar(f)
    local ok, colgada = pcall(sub.colgadaDe, f, raiz.pestanaSnet, {})
    if ok and colgada then
      return -- cuelga de nuestra pestaña: anclarnos a ella sería un ciclo
    end
    if not mejorDerecha or derecha > mejorDerecha then
      mejor, mejorDerecha = f, derecha
    end
  end
  local tabs = rawget(subasta, "Tabs") -- rawget: un marco sin Tabs no da error
  if type(tabs) == "table" then
    for _, f in ipairs(tabs) do
      mirar(f, true)
    end
  end
  if type(subasta.GetChildren) == "function" then
    for _, f in ipairs({subasta:GetChildren()}) do
      mirar(f, false)
      if type(f) == "table" and f ~= raiz.pestanaSnet and type(f.GetChildren) == "function" then
        local ok, nietos = pcall(function() return {f:GetChildren()} end)
        if ok then
          for _, nieto in ipairs(nietos) do
            mirar(nieto, false)
          end
        end
      end
    end
  end
  return mejor
end

-- El hueco de nuestra pestaña respecto a la última de la fila: el desplazamiento x del anclaje de esa última respecto a la
-- anterior (TOPLEFT/LEFT de una al TOPRIGHT/RIGHT de otra pestaña). Si no se puede medir, el de la plantilla en Forever o el
-- del botón plano.
function sub.huecoPestana(ultima, conPlantilla)
  local porDefecto = conPlantilla and sub.huecoPlantilla or MARGEN_ENTRE_PESTANAS
  if not ultima then
    return porDefecto
  end
  local ok, hueco = pcall(function()
    local punto, relativo, relPunto, x = ultima:GetPoint(1)
    if (punto == "TOPLEFT" or punto == "LEFT") and (relPunto == "TOPRIGHT" or relPunto == "RIGHT")
      and type(relativo) == "table" and type(relativo.IsObjectType) == "function" and relativo:IsObjectType("Button")
      and type(x) == "number" then
      return x
    end
  end)
  if ok and hueco then
    return hueco
  end
  return porDefecto
end

-- Las sangrías de clic de la última pestaña (las mismas para la nuestra); si no se pueden leer, las de LibAHTab.
function sub.sangriasPestana(ultima)
  if ultima then
    local ok, izq, der, arriba, abajo = pcall(ultima.GetHitRectInsets, ultima)
    if ok and type(izq) == "number" and type(der) == "number" and type(arriba) == "number" and type(abajo) == "number" then
      return {izq, der, arriba, abajo}
    end
  end
  return sub.sangriasPlantilla
end

-- La pestaña lleva el aspecto de la plantilla de Blizzard (AuctionHouseFrameDisplayModeTabTemplate) con la vista de
-- Blizzard, en la fila de abajo, y el nuestro (fondo y texto propios) con la vista nuestra, bajo nuestra ventana. Solo si
-- se pudo crear con la plantilla (p.deLaPlantilla: sus regiones, las que se ven al crearla). Todo con pcall.
sub.ajustandoPestana = false -- true mientras ajustamos nosotros la pestaña: el gancho de PanelTemplates_TabResize la salta
function sub.estiloPestana(p, deBlizzard, sangrias)
  local propias = p.deLaPlantilla
  if not propias then
    return
  end
  p.estiloBlizzard = deBlizzard
  if deBlizzard then
    p.sangrias = sangrias
  end
  sub.ajustandoPestana = true
  -- Cada paso con su pcall: si uno falla en otro cliente, los demás se hacen igual.
  local function paso(fn)
    pcall(fn)
  end
  paso(function()
    for _, region in ipairs(propias) do
      region:SetShown(deBlizzard)
    end
  end)
  paso(function()
    local s = deBlizzard and sangrias or {0, 0, 0, 0}
    p:SetHitRectInsets(s[1], s[2], s[3], s[4])
  end)
  paso(function() p.fondo:SetShown(not deBlizzard) end)
  paso(function() p.texto:SetShown(not deBlizzard) end)
  if deBlizzard then
    -- Como LibAHTab: texto, ajuste de ancho (relleno 20, mínimo 70) y sin elegir.
    paso(function() p:SetText(p.etiqueta or "") end)
    paso(function()
      if type(p.alturaPlantilla) == "number" and p.alturaPlantilla > 0 then
        p:SetHeight(p.alturaPlantilla)
      end
    end)
    paso(function()
      local ajustar = rawget(_G, "PanelTemplates_TabResize")
      if type(ajustar) == "function" then
        ajustar(p, 20, nil, 70)
      end
    end)
    paso(function()
      local deseleccionar = rawget(_G, "PanelTemplates_DeselectTab")
      if type(deseleccionar) == "function" then
        deseleccionar(p)
      end
    end)
  else
    paso(function()
      p:SetHeight(ALTO_PESTANA)
      p.ponerAncho()
    end)
  end
  sub.ajustandoPestana = false
end

-- Ancla nuestra pestaña. Con la vista de Blizzard, a la derecha de la última de la subasta (y engancha las pestañas
-- nuevas); con la nuestra, la subasta está escondida y la pestaña cuelga de UIParent, bajo nuestra ventana. Se repite
-- poco después de abrir y al enseñarse la ventana: otros addons (Auctionator) crean o recolocan las suyas después que
-- nosotros, o la subasta aún no tiene medidas al abrirse.
local function colocarPestana(subasta)
  -- Siempre se miran las pestañas de la subasta: así se enganchan aunque ahora no se vean.
  local ultima = subasta and ultimaPestana(subasta) or nil
  raiz.pestanaSnet:ClearAllPoints()
  if subasta and not sub.nuestra then
    raiz.pestanaSnet:SetParent(subasta)
    sub.estiloPestana(raiz.pestanaSnet, true, sub.sangriasPestana(ultima))
    if ultima then
      raiz.pestanaSnet:SetPoint("TOPLEFT", ultima, "TOPRIGHT", sub.huecoPestana(ultima, raiz.pestanaSnet.conPlantilla), 0)
    else
      raiz.pestanaSnet:SetPoint("TOPLEFT", subasta, "BOTTOMLEFT", MARGEN, 0)
    end
    -- Una más de la fila: el estrato y el nivel de la última (no los de nuestra ventana, que son más altos y taparían).
    local referencia = ultima or subasta
    raiz.pestanaSnet:SetFrameStrata(referencia:GetFrameStrata())
    raiz.pestanaSnet:SetFrameLevel(referencia:GetFrameLevel() + (ultima and 0 or 1))
  else
    raiz.pestanaSnet:SetParent(UIParent)
    sub.estiloPestana(raiz.pestanaSnet, false)
    raiz.pestanaSnet:SetPoint("TOPLEFT", raiz, "BOTTOMLEFT", MARGEN, 0)
    raiz.pestanaSnet:SetFrameStrata(raiz:GetFrameStrata())
    raiz.pestanaSnet:SetFrameLevel(raiz:GetFrameLevel())
  end
end

-- ¿Se puede mover nuestra ventana? Solo si no hay subasta de Blizzard que tapar o si ya la tenemos escondida (o alfa 0 a la
-- espera de esconderla, o la esconde otro addon). Mientras la subasta siga a la vista (combate: esconderla espera a salir)
-- la ventana la tapa en su rectángulo y no se arrastra ni se estira: moverla dejaría dos subastas pulsables a la vez y la de
-- Blizzard desaparecería de golpe al salir del combate.
function sub.libre()
  return subastaDeBlizzard() == nil or sub.dueno ~= nil or sub.preAlfa ~= nil or sub.rendida == true
end

-- Lo que cuelga debajo de la ventana (nuestra pestaña, ALTO_PESTANA en unidades de UIParent), en unidades de la ventana:
-- tiene que quedar sitio para verla.
function sub.altoPestana()
  local ok, k = pcall(function()
    return UIParent:GetEffectiveScale() / raiz:GetEffectiveScale()
  end)
  return ALTO_PESTANA * ((ok and type(k) == "number" and k > 0) and k or 1)
end

-- Pone la escala, el tamaño y el sitio de la ventana (en píxeles reales, Ventana.colocar): donde la dejó el jugador, con el
-- tamaño que le dio (SnetForeverCuenta.comercio.ventanaSubasta = {x, y, ancho, alto}); sin sitio guardado, en el rectángulo
-- que tenía la subasta de Blizzard (sub.medidas) o centrada. Siempre entre el mínimo y la pantalla, dentro de ella y con
-- sitio debajo para nuestra pestaña. Lo guardado antes del bloque B ({x, y}) se lee como la posición, con el tamaño de la
-- subasta (se mide en cada apertura, para que no encoja al reabrir).
function sub.ponerPosicion()
  Ventana.ajustarEscala()
  local m = sub.medidas and Ventana.desdeUIParent(sub.medidas) or nil
  local sitio = Ventana.sitioGuardado()
  if sitio and not sub.libre() then
    sitio = nil -- la subasta de Blizzard sigue a la vista: se tapa en su rectángulo
  end
  if sitio and not sitio.ancho then
    sitio.ancho, sitio.alto = m and m.ancho, m and m.alto
  end
  raiz:SetClampRectInsets(0, 0, 0, -sub.altoPestana()) -- nuestra pestaña cuelga debajo: cuenta para no salirse de la pantalla
  Ventana.colocar(sitio or m, sub.altoPestana())
end

-- Arrastre por la cabecera (botón izquierdo). Solo con nuestra vista y la ventana a la vista: con la de Blizzard no se ve y
-- no se toca nada. Nuestro marco no está protegido: se mueve también en combate.
function sub.empezarArrastre()
  if sub.moviendo or not sub.nuestra or sub.velada or not raiz:IsShown() or not sub.libre() then
    return
  end
  esconderVentanita() -- el tooltip de ayuda sobra al empezar a arrastrar
  sub.moviendo = true
  raiz:StartMoving()
end

-- Al soltar (o si la ventana se esconde en pleno arrastre): guarda el sitio y el tamaño, en píxeles (Ventana.guardarSitio).
function sub.terminarArrastre()
  if not sub.moviendo then
    return
  end
  sub.moviendo = false
  raiz:StopMovingOrSizing()
  raiz:SetUserPlaced(false) -- la posición la guarda el addon, no el cliente
  Ventana.guardarSitio()
end

-- Clic derecho en la cabecera: borra el sitio guardado y la ventana vuelve al rectángulo de la subasta. No cambia el
-- alfa, el estrato ni si se ve: solo los puntos y el tamaño (nada de destellos).
function sub.volverAlSitio()
  if not sub.nuestra or not raiz:IsShown() then
    return
  end
  sub.terminarArrastre()
  Ventana.borrarSitio()
  sub.ponerPosicion()
end

-- Tooltip de la cabecera: cómo se mueve y cómo se vuelve a su sitio.
function sub.ayudaCabecera(dueno)
  if not GameTooltip or GameTooltip:IsForbidden() then
    return
  end
  GameTooltip:SetOwner(dueno, "ANCHOR_BOTTOM")
  GameTooltip:SetText(L.t("COMERCIO_ARRASTRE_AYUDA"))
  GameTooltip:Show()
end

-- Coloca la ventana y la subasta según la vista (se hace cada vez que se abre la subasta o cambia la vista).
-- Con nuestra vista: la ventana ocupa el rectángulo que tenía la subasta en pantalla justo antes de esconderla (si no hay
-- medidas válidas, centrada y de su tamaño de siempre) con el estrato de la subasta y un nivel por encima, y la
-- subasta se esconde. Con la de Blizzard: la subasta se repone y nuestra pestaña vuelve a colgar de ella.
local function colocar(nuestra, retraso)
  local subasta = subastaDeBlizzard()
  sub.nuestra = nuestra
  if subasta and nuestra then
    if not sub.dueno then
      sub.medidas = medirSubasta(subasta) -- antes de esconderla
    end
    sub.ponerPosicion()
    raiz:SetFrameStrata(subasta:GetFrameStrata())
    raiz:SetFrameLevel(subasta:GetFrameLevel() + 20)
    local temporizador = rawget(_G, "C_Timer")
    if retraso and type(temporizador) == "table" and type(temporizador.After) == "function" then
      -- Al abrir la subasta, un fotograma después: otro addon (TSM, que carga después que nosotros) puede esconderla en
      -- el mismo aviso y entonces es suya; esconderSubasta lo vuelve a mirar. Mientras tanto, alfa 0 ya, en su sitio (15d
      -- r1): que no se vea ni un fotograma para desaparecer en el siguiente (nada de destellos). En combate no: esconderla
      -- espera a salir y en pantalla con alfa 0 se podría pulsar sin verla.
      -- Y nuestra ventana también espera invisible (15d r2), pero solo junto con la subasta (15d r3): en combate las dos
      -- se ven a la vez desde el principio, sin salto de una sola a las dos.
      if not sub.dueno and not sub.preAlfa and not sub.rendida and not InCombatLockdown() and subastaUsable(subasta) then
        local ok, alfa = pcall(subasta.GetAlpha, subasta)
        if ok and type(alfa) == "number" then
          sub.preAlfa = {subasta = subasta, alfa = alfa}
          ponerSubasta(subasta, {alfa = 0})
          sub.velar(true)
          sub.ponerPosicion() -- las dos con alfa 0 en la misma llamada: ya se puede ir a la posición guardada
        end
      end
      sub.porEsconder = true -- hasta que pase ese fotograma, la ventana aún puede cambiar de sitio y de tamaño
      temporizador.After(0, siempre("ventana", function()
        sub.porEsconder = nil
        local actual = subastaDeBlizzard()
        if actual and sub.nuestra and raiz:IsShown() and SNF.Comercio.abierta() then
          esconderSubasta(actual)
        else
          sub.quitarPreAlfa()
        end
        -- Con el escondido de reserva, el velo espera a que aguante unos fotogramas (o a que nos rindamos).
        if sub.velada and sub.dueno and sub.dueno.reserva then
          sub.esperarQuieta()
        else
          sub.velar(false)
        end
      end))
    else
      sub.colocando = true
      esconderSubasta(subasta)
      sub.colocando = false
    end
  elseif subasta then
    reponerSubasta()
    sub.medidas = nil
    raiz:SetFrameStrata(subasta:GetFrameStrata())
    raiz:SetFrameLevel(subasta:GetFrameLevel() + 20)
  else
    raiz:SetFrameStrata("HIGH")
    sub.ponerPosicion()
  end
  colocarPestana(subasta)
end

-- Vuelve a anclar la pestaña (con la subasta abierta y la ventana creada).
local function recolocarPestana()
  if raiz and SNF.Comercio.abierta() then
    colocarPestana(subastaDeBlizzard())
  end
end

-- ¿Cuelga de la subasta la pestaña que se está ajustando (hija, nieta o en AuctionHouseFrame.Tabs)? La nuestra no cuenta.
function sub.pestanaDeLaSubasta(pestana)
  local subasta = subastaDeBlizzard()
  if not subasta or not raiz or type(pestana) ~= "table" or pestana == raiz.pestanaSnet then
    return false
  end
  local tabs = rawget(subasta, "Tabs")
  if type(tabs) == "table" then
    for _, f in ipairs(tabs) do
      if f == pestana then
        return true
      end
    end
  end
  local ok, cuelga = pcall(function()
    local padre = pestana:GetParent()
    return padre ~= nil and (padre == subasta or padre:GetParent() == subasta)
  end)
  return ok and cuelga == true
end

-- Otro addon ha añadido o ajustado una pestaña (PanelTemplates_TabResize) o la subasta se ha enseñado: nuestra pestaña
-- vuelve a su sitio un fotograma después, una sola vez aunque lleguen varios avisos seguidos. Con la subasta cerrada, nada.
sub.recolocarPedido = false
function sub.pedirRecolocar()
  if sub.recolocarPedido or sub.ajustandoPestana or not raiz or not SNF.Comercio.abierta() then
    return
  end
  local temporizador = rawget(_G, "C_Timer")
  if type(temporizador) ~= "table" or type(temporizador.After) ~= "function" then
    return
  end
  sub.recolocarPedido = true
  local ok = pcall(temporizador.After, 0, siempre("ventana", function()
    sub.recolocarPedido = false
    recolocarPestana()
  end))
  if not ok then
    sub.recolocarPedido = false
  end
end

---------------------------------------------------------------------------------------------------
-- Creación
---------------------------------------------------------------------------------------------------

local function texto(padre, tamano, justificado)
  local fs = UI.texto(padre, tamano or TAMANOS.lista)
  fs:SetJustifyH(justificado or "LEFT")
  fs:SetWordWrap(false)
  ponerColor(fs, Estilo.comercio("texto"))
  return fs
end

-- La cabecera de TSM (fila 1), las páginas y el asa los monta ui/subasta/ventana.lua; aquí se enchufan la X (cierra la
-- subasta entera), «Vista de Blizzard» y el arrastre de la Task 15e (botón izquierdo; clic derecho: volver al sitio; con
-- su tooltip).
local function crearCabecera()
  local m = Ventana.montar(raiz, {
    alCerrar = siempre("ventana", function()
      esconderVentanita()
      -- Cierra la subasta entera: el juego avisa con AUCTION_HOUSE_CLOSED y la ventana se esconde sola.
      local casa = rawget(_G, "C_AuctionHouse")
      local cierra = type(casa) == "table" and rawget(casa, "CloseAuctionHouse") or nil
      if type(cierra) == "function" then
        cierra()
      elseif type(rawget(_G, "HideUIPanel")) == "function" and rawget(_G, "AuctionHouseFrame") then
        HideUIPanel(AuctionHouseFrame)
      end
    end),
    alVistaBlizzard = siempre("ventana", function()
      UIComercio.ponerVista("blizzard")
    end),
    puedeMover = function()
      return sub.nuestra and not sub.velada and sub.libre()
    end,
    alCambiarPantalla = siempre("ventana", function()
      sub.ponerPosicion()
    end),
    -- Al abrir: ¿queda algo pendiente que pueda recolocar la ventana un fotograma después? (el velo, esconder la subasta
    -- de Blizzard o recolocar por las pestañas de otros addons). Mientras tanto el oro de la cabecera no sale.
    pendiente = function()
      return (sub.velada or sub.porEsconder or sub.recolocarPedido or sub.reEsconderPedido) and true or false
    end,
  })
  local cab = m.cabecera
  cab:RegisterForDrag("LeftButton") -- los botones de la cabecera recogen el ratón antes y no arrastran
  cab:SetScript("OnDragStart", siempre("ventana", sub.empezarArrastre))
  cab:SetScript("OnDragStop", siempre("ventana", sub.terminarArrastre))
  cab:SetScript("OnMouseUp", siempre("ventana", function(_, boton)
    if boton == "RightButton" then
      sub.volverAlSitio()
    end
  end))
  cab:SetScript("OnEnter", siempre("ventana", sub.ayudaCabecera))
  cab:SetScript("OnLeave", siempre("ventana", esconderVentanita))
  cab.oro = m.oro
  raiz.cabecera = cab
  raiz.verBlizzard = m.verBlizzard
  raiz.pestanas = m.pestanas
end

local function crearGrupos(padre, arriba)
  local panel = CreateFrame("Frame", nil, padre)
  panel:SetPoint("TOPLEFT", padre, "TOPLEFT", MARGEN, arriba)
  panel:SetPoint("BOTTOMLEFT", padre, "BOTTOMLEFT", MARGEN, ABAJO)
  panel:SetWidth(ANCHO_GRUPOS)
  ponerFondo(panel, "contenedor")
  panel:EnableMouseWheel(true)
  panel:SetScript("OnMouseWheel", protegido("ventana", function(_, delta)
    esconderVentanita()
    desplGrupos = math.max(0, desplGrupos - delta * PASO_RUEDA)
    pintarGrupos()
  end))
  raiz.panelGrupos = panel
  raiz.grupos = {}
  -- Buscador: arriba del panel. Filtra los grupos por nombre sin mirar tildes ni mayúsculas (raiz.grupos.buscar).
  -- Decisión del plan: no hay casillas para marcar varios grupos. En TSM sirven para lanzar un escaneo de grupos y aquí el
  -- escaneo ya lee toda la subasta; un grupo se elige pulsándolo.
  local marcoBuscar = CreateFrame("Frame", nil, panel)
  marcoBuscar:SetPoint("TOPLEFT", panel, "TOPLEFT", 2, -2)
  marcoBuscar:SetSize(ANCHO_GRUPOS - 4, ALTO_BUSCAR)
  ponerFondo(marcoBuscar, "filas")
  local buscar = CreateFrame("EditBox", nil, marcoBuscar)
  buscar:SetPoint("TOPLEFT", marcoBuscar, "TOPLEFT", 6, 0)
  buscar:SetPoint("BOTTOMRIGHT", marcoBuscar, "BOTTOMRIGHT", -6, 0)
  buscar:SetAutoFocus(false)
  buscar:SetMultiLine(false)
  buscar:SetMaxLetters(40)
  SNF.Tema.letra(buscar, "texto") -- B3r: la letra del tema
  ponerColor(buscar, Estilo.comercio("texto"))
  buscar.vacia = texto(marcoBuscar, TAMANOS.lista)
  SNF.Tema.letra(buscar.vacia, "texto")
  ponerColor(buscar.vacia, Estilo.comercio("secundario"))
  buscar.vacia:SetPoint("LEFT", marcoBuscar, "LEFT", 6, 0)
  buscar:SetScript("OnTextChanged", protegido("ventana", function(self)
    filtroGrupos = sinTildes(self:GetText())
    desplGrupos = 0
    pintarGrupos()
  end))
  buscar:SetScript("OnEditFocusGained", protegido("ventana", function()
    buscar.vacia:Hide()
  end))
  buscar:SetScript("OnEditFocusLost", protegido("ventana", function()
    pintarGrupos()
  end))
  buscar:SetScript("OnEscapePressed", protegido("ventana", function(self)
    self:ClearFocus()
  end))
  buscar:SetScript("OnEnterPressed", protegido("ventana", function(self)
    self:ClearFocus()
  end))
  raiz.grupos.buscar = buscar
  for k = 1, GRUPOS_VISIBLES do
    local b = CreateFrame("Button", nil, panel)
    b:EnableMouse(true)
    b:SetSize(ANCHO_GRUPOS - 4, ALTO_GRUPO)
    b:SetPoint("TOPLEFT", panel, "TOPLEFT", 2, -2 - ALTO_BUSCAR - 2 - (k - 1) * (ALTO_GRUPO + 1))
    ponerFondo(b, "filas")
    -- La raya de color de la izquierda: hoy todos los grupos son de nivel 1 (la lista es plana) y llevan el mismo color.
    -- Si un día hay subgrupos, el color irá por nivel.
    b.raya = b:CreateTexture(nil, "ARTWORK")
    b.raya:SetTexture(Estilo.TEXTURA)
    b.raya:SetWidth(ANCHO_RAYA)
    b.raya:SetPoint("TOPLEFT", b, "TOPLEFT", 0, 0)
    b.raya:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 0, 0)
    b.raya:SetVertexColor(COLOR_RAYA[1][1], COLOR_RAYA[1][2], COLOR_RAYA[1][3], COLOR_RAYA[1][4])
    b.texto = b:CreateFontString(nil, "OVERLAY")
    SNF.Tema.letra(b.texto, "texto")
    ponerColor(b.texto, Estilo.comercio("texto"))
    b.texto:SetPoint("LEFT", b, "LEFT", ANCHO_RAYA + 5, 0)
    b.texto:SetWidth(ANCHO_GRUPOS - 4 - ANCHO_RAYA - 9)
    b.texto:SetJustifyH("LEFT")
    b.texto:SetWordWrap(false)
    b.refrescar = function()
      b.texto:SetText(b.etiqueta or "")
    end
    b:SetScript("OnClick", protegido("ventana", function()
      UIComercio.elegirGrupo(b.clave)
    end))
    b:SetScript("OnEnter", protegido("ventana", function()
      b.raton = true
      pintarFilaGrupo(b)
    end))
    b:SetScript("OnLeave", protegido("ventana", function()
      b.raton = false
      pintarFilaGrupo(b)
    end))
    b:Hide()
    raiz.grupos[k] = b
  end
end

-- Las celdas de la tabla de la lista. El icono y la marca de buena compra son texturas del hueco (se crean la primera
-- vez que se pinta); el nombre se corre a la derecha del icono y deja sitio a la marca.
local LADO_ICONO = 16
local LADO_BUENA = 14
local function adornosDe(hueco)
  if not hueco.icono then
    hueco.icono = hueco:CreateTexture(nil, "ARTWORK")
    hueco.icono:SetSize(LADO_ICONO, LADO_ICONO)
    hueco.icono:SetPoint("LEFT", hueco, "LEFT", 3, 0)
    hueco.icono:SetTexCoord(RECORTE_ICONO[1], RECORTE_ICONO[2], RECORTE_ICONO[1], RECORTE_ICONO[2])
    hueco.buena = hueco:CreateTexture(nil, "OVERLAY")
    hueco.buena:SetTexture(ICONO_BUENA)
    hueco.buena:SetSize(LADO_BUENA, LADO_BUENA)
  end
  return hueco
end

local function textoCelda(celda, texto, color)
  celda:SetText(texto)
  ponerColor(celda, color or Estilo.comercio("texto"))
end

local function nivelDe(f)
  local _, _, nivel = nombreYCalidad(f.item)
  return nivel
end

-- Las columnas de la lista vieja (página «ofertas»). La tabla estira (S1): cada columna mide como poco su `ancho` y lo
-- que sobra del panel se reparte por `peso`, casi todo para Objeto (6 de cada 11). pintar recibe el ancho de ahora de
-- su columna.
local COLUMNAS_TABLA = {
  {clave = "objeto", titulo = function() return L.t("COMERCIO_COL_OBJETO") end, ancho = 204, peso = 6, justificado = "LEFT",
    valor = function(f) return (nombreYCalidad(f.item)) end,
    pintar = function(celda, f, ancho)
      local hueco = adornosDe(celda:GetParent())
      local nombre, calidad = nombreYCalidad(f.item)
      hueco.icono:SetTexture(API.iconoObjeto(f.item) or ICONO_DESCONOCIDO)
      hueco.icono:Show()
      celda:ClearAllPoints()
      celda:SetPoint("LEFT", hueco, "LEFT", 3 + LADO_ICONO + 4, 0)
      celda:SetWidth(ancho - (3 + LADO_ICONO + 4) - LADO_BUENA - 6)
      textoCelda(celda, nombre, colorCalidad(calidad))
      hueco.buena:ClearAllPoints()
      hueco.buena:SetPoint("RIGHT", hueco, "LEFT", ancho - 4, 0)
      -- F9p: el hueco se reutiliza; la textura solo se cambia si es otra (nada se repinta de más).
      local marca = f.rotacionSinConfirmar and UIComercio.ICONO_SIN_CONFIRMAR or ICONO_BUENA
      if hueco.buenaMarca ~= marca then
        hueco.buenaMarca = marca
        hueco.buena:SetTexture(marca)
      end
      hueco.buena:SetShown(f.buena)
    end},
  {clave = "nivel", titulo = function() return L.t("COMERCIO_COL_NIVEL") end, ancho = 44, peso = 1, justificado = "RIGHT",
    valor = nivelDe,
    pintar = function(celda, f)
      local nivel = nivelDe(f)
      textoCelda(celda, nivel and Texto.numero(nivel) or L.t("COMERCIO_SIN_DATO"))
    end},
  {clave = "cantidad", titulo = function() return L.t("COMERCIO_COL_CANTIDAD") end, ancho = 60, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.cantidad end,
    pintar = function(celda, f) textoCelda(celda, Texto.numero(f.cantidad)) end},
  {clave = "precio", titulo = function() return L.t("COMERCIO_COL_PRECIO") end, ancho = 100, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.precio end,
    pintar = function(celda, f) textoCelda(celda, dinero(f.precio)) end},
  {clave = "pct", titulo = function() return L.t("COMERCIO_COL_PCT") end, ancho = 52, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.pct end,
    pintar = function(celda, f) textoCelda(celda, textoPct(f.pct), COLORES_PCT[f.color] or Estilo.comercio("secundario")) end},
  {clave = "ritmo", titulo = function() return L.t("COMERCIO_COL_RITMO") end, ancho = 52, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.ritmo end,
    pintar = function(celda, f)
      textoCelda(celda, f.ritmo and decimal2(f.ritmo) or L.t("COMERCIO_SIN_DATO"), f.ritmo == nil and Estilo.comercio("secundario") or nil)
    end},
  -- F1: de qué foto salen el precio y las unidades de la fila y su hora (ronda 2: la hora fija, que no envejece ni cambia
  -- sola): «subasta 14:32», «app 14:15», «escaneo 14:02». Ordena por la hora (sin hora, primero).
  {clave = "foto", titulo = function() return L.t("COMERCIO_COL_FOTO") end, ancho = 116, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.hora or 0 end,
    pintar = function(celda, f)
      textoCelda(celda, UIComercio.momentoHora(f.fuente, f.hora), f.fuente ~= "lista" and Estilo.comercio("secundario") or nil)
    end},
}

-- Las subfilas (escalones) usan las mismas columnas: precio y cantidad del escalón, y el tiempo restante en la primera. El
-- resto va vacío. Atenuadas si quedan por encima del límite de la regla.
local function pintarEscalon(clave, celda, f)
  local color = f.fuera and Estilo.comercio("secundario") or nil
  if clave == "objeto" then
    local hueco = adornosDe(celda:GetParent())
    hueco.icono:Hide()
    hueco.buena:Hide()
    textoCelda(celda, restante(f.tiempo), color)
  elseif clave == "cantidad" then
    textoCelda(celda, Texto.numero(f.n), color)
  elseif clave == "precio" then
    textoCelda(celda, dinero(f.precio), color)
  else
    textoCelda(celda, "")
  end
end
for _, col in ipairs(COLUMNAS_TABLA) do
  local normal = col.pintar
  col.pintar = function(celda, f, ancho)
    if f.escalon then
      pintarEscalon(col.clave, celda, f)
    else
      normal(celda, f, ancho)
    end
  end
end

-- Una pestaña de arriba: botón de 24 px con letra de texto. Elegida lleva el color de acento (ver pintarPestana).
local MARGEN_PESTANA = 24 -- ancho de la pestaña = texto + 24
local function crearPestana(padre, etiqueta, plantilla, nombre)
  local p
  if plantilla then
    -- Con plantilla de Blizzard; si el cliente no la tiene, un botón normal (sin su aspecto).
    local ok, creado = pcall(CreateFrame, "Button", nombre, padre, plantilla)
    if ok and creado then
      p = creado
      p.conPlantilla = true
    end
  end
  p = p or CreateFrame("Button", nil, padre)
  if p.conPlantilla then
    -- Lo que la plantilla ya dibuja (para esconderlo con nuestra vista) y su altura (para la vista de Blizzard).
    p.deLaPlantilla = {}
    pcall(function()
      for _, region in ipairs({p:GetRegions()}) do
        if region:IsShown() then
          p.deLaPlantilla[#p.deLaPlantilla + 1] = region
        end
      end
      p.alturaPlantilla = p:GetHeight()
    end)
  end
  p:EnableMouse(true)
  p:SetHeight(ALTO_PESTANA)
  ponerFondo(p, "cabecera")
  p.texto = p:CreateFontString(nil, "OVERLAY")
  SNF.Tema.letra(p.texto, "texto")
  p.texto:SetPoint("CENTER", p, "CENTER", 0, 0)
  p.ponerAncho = function()
    p:SetWidth(p.texto:GetStringWidth() + MARGEN_PESTANA)
  end
  p.ponerTexto = function(nuevo)
    p.etiqueta = nuevo or ""
    p.texto:SetText(p.etiqueta)
    p.ponerAncho()
  end
  p.ponerTexto(etiqueta)
  return p
end

local function pintarPestana(p, elegida)
  ponerFondo(p, elegida and "acento" or "cabecera")
  ponerColor(p.texto, Estilo.comercio(elegida and "acentoTexto" or "texto"))
end

-- Nuestra pestaña de abajo: en acento mientras se ve la ventana. colocar() la ancla: con la vista de Blizzard, cuelga de
-- AuctionHouseFrame junto a las suyas; con la nuestra (la subasta escondida), de UIParent bajo la ventana.
local function crearPestanaSnet()
  local p = crearPestana(UIParent, L.t("COMERCIO_PESTANA_SNET"), "AuctionHouseFrameDisplayModeTabTemplate",
    "SnetForeverPestanaSubasta")
  p:SetFrameStrata("HIGH")
  local ponerTextoBase = p.ponerTexto
  p.ponerTexto = function(nuevo)
    ponerTextoBase(nuevo)
    if p.estiloBlizzard then
      sub.estiloPestana(p, true, p.sangrias) -- con el aspecto de Blizzard, el ancho lo ajusta PanelTemplates_TabResize
    end
  end
  p:SetScript("OnClick", siempre("ventana", function()
    UIComercio.ponerVista("snet")
  end))
  pintarPestana(p, false)
  p:Hide()
  raiz.pestanaSnet = p
end

-- La lista de ofertas por % (la página interna «ofertas»), a la derecha de los grupos.
local function crearCuerpo(padre, arriba)
  local cuerpo = CreateFrame("Frame", nil, padre)
  cuerpo:SetPoint("TOPLEFT", padre, "TOPLEFT", MARGEN + ANCHO_GRUPOS + MARGEN, arriba)
  cuerpo:SetPoint("BOTTOMRIGHT", padre, "BOTTOMRIGHT", -MARGEN, ABAJO)
  Estilo.panelComercio(cuerpo, "filas")
  raiz.cuerpo = cuerpo
  local clave, asc = ordenGuardado()
  if clave == nil then
    clave, asc = ordenDeFabrica()
  end
  tabla = TablaComercio.crear(cuerpo, {
    columnas = COLUMNAS_TABLA,
    filasVisibles = FILAS_LISTA,
    estirar = true, -- llena el panel y sigue a la ventana (S1)
    orden = {clave = clave, asc = asc},
    ejecutar = ejecutar,
    alPulsar = function(f)
      if f.escalon then
        UIComercio.alPulsarEscalon(f)
        elegirDeLaCompra() -- la elegida sigue siendo la fila del objeto, no el escalón
        return
      end
      local alPulsar = UIComercio.alPulsarFila
      if type(alPulsar) == "function" then
        alPulsar(datosDeFila(f))
      end
      -- La tabla ya ha marcado la fila; si la compra no se ha preparado (rechazada), se vuelve a lo que dice la compra.
      elegirDeLaCompra()
    end,
    alOrdenar = function(clave2, asc2)
      if aplicandoOrden then
        return
      end
      local c = guardadoComercio()
      if c then
        c.ordenLista = {clave = clave2, asc = asc2}
      end
    end,
    -- B3s: Mayús + clic y Ctrl + clic (UIComercio.clicModificado), también en los escalones: el objeto de la fila, por su id.
    objeto = function(f)
      return nil, f.item
    end,
    -- T1a: el tooltip del objeto en cada fila, también en los escalones de una mercancía (son el mismo objeto, como en
    -- resultados). Va con la luz de la tabla (ronda 1). Una fila sin objeto esconde el de antes; al apagarse, solo el suyo.
    alEntrar = function(f, hueco)
      if f.item then
        enseniarObjeto(hueco, f.item, not f.escalon and UIComercio.lineasDeFila(f.item) or nil)
      else
        UIComercio.soltarTooltipObjeto(hueco)
      end
    end,
    alSalir = function(hueco)
      UIComercio.esconderTooltipObjeto(hueco, true)
    end,
  })
  tabla.marco:SetPoint("TOPLEFT", cuerpo, "TOPLEFT", 0, 0)
  tabla.marco:SetPoint("BOTTOMRIGHT", cuerpo, "BOTTOMRIGHT", 0, 0)
  raiz.tabla = tabla
  raiz.filas = tabla.huecos
  raiz.vacio = texto(cuerpo, TAMANOS.lista, "CENTER")
  raiz.vacio:SetPoint("CENTER", cuerpo, "CENTER", 0, 0)
  ponerColor(raiz.vacio, Estilo.comercio("secundario"))
end

-- Viste un botón de la barra (el botón del tema de comercio): 107 px y un relleno de color encima del fondo, que se aclara
-- con el ratón encima si se puede pulsar. El color lo pone pintarBarra (pintarBoton).
local function vestirBoton(b)
  b:SetSize(ANCHO_BOTON, ALTO_PIE - 4)
  b.texto:SetWidth(ANCHO_BOTON - 8) -- el texto nunca se sale del botón
  b.texto:SetWordWrap(false)
  local fondo = b:CreateTexture(nil, "ARTWORK")
  fondo:SetTexture(RESALTE)
  fondo:SetPoint("TOPLEFT", b, "TOPLEFT", 1, -1)
  fondo:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -1, 1)
  b.fondo = fondo
  local c = Estilo.comercio("cabecera")
  b.colorBase = c
  fondo:SetVertexColor(c[1], c[2], c[3], c[4])
  b:SetScript("OnEnter", function(self)
    if self:IsEnabled() and self.colorBase then
      local a = Estilo.aclarar(self.colorBase, 5)
      self.fondo:SetVertexColor(a[1], a[2], a[3], a[4])
    end
  end)
  b:SetScript("OnLeave", function(self)
    local a = self.colorBase
    if a then
      self.fondo:SetVertexColor(a[1], a[2], a[3], a[4] or 1)
    end
  end)
  b:Disable()
  return b
end


-- La barra de abajo (28 px): a la izquierda la barra de progreso con el estado (escaneo, búsqueda o compra), «Llevas X
-- de Y» en pequeño, el engranaje de los ajustes de compra y, a la derecha, Descartar (gris) y Comprar (relleno de acento).
-- Comprar llama a SNF.Compra.pulsar() desde su OnClick: es la única llamada del addon (una compra solo la hace un clic
-- del jugador). Con una mercancía «lista», Comprar abre en cambio el cuadro de cantidad (SNF.CantidadComercio), que es
-- quien llama a pulsar.
local function crearBarra()
  local pie = CreateFrame("Frame", nil, raiz)
  pie:SetHeight(ALTO_PIE)
  pie:SetPoint("BOTTOMLEFT", raiz, "BOTTOMLEFT", 0, 0)
  pie:SetPoint("BOTTOMRIGHT", raiz, "BOTTOMRIGHT", 0, 0)
  Estilo.panelComercio(pie, "cabecera")
  SNF.WindowSizing.register(pie, "auctionFooter", false)
  raiz.pie = pie
  local comprar
  comprar = vestirBoton(Estilo.botonComercio(pie, function() return comprar and comprar.etiqueta or L.t("COMERCIO_COMPRAR") end,
    protegido("compra", function()
      if SNF.Compra.combate() or abrirCuadro() then return end
      SNF.Compra.pulsar()
    end)))
  comprar:SetPoint("RIGHT", pie, "RIGHT", -MARGEN - SNF.Piezas.CABECERA.asa, 0) -- el asa de la ventana va en la esquina
  -- Un doble clic no es una segunda compra: el segundo clic va a OnDoubleClick (vacío) y no a OnClick.
  comprar:SetScript("OnDoubleClick", function() end)
  -- En combate, apagado y con un tooltip que dice por qué.
  local entrarComprar, salirComprar = comprar:GetScript("OnEnter"), comprar:GetScript("OnLeave")
  comprar:SetScript("OnEnter", function(self, ...)
    entrarComprar(self, ...)
    if SNF.Compra.combate() and GameTooltip and not GameTooltip:IsForbidden() then
      GameTooltip:SetOwner(self, "ANCHOR_TOP")
      GameTooltip:SetText(L.t("COMERCIO_EN_COMBATE"), 1, 1, 1, 1, true)
      GameTooltip:Show()
    end
  end)
  comprar:SetScript("OnLeave", function(self, ...)
    salirComprar(self, ...)
    esconderVentanita()
  end)
  pie.comprar = comprar
  local descartar = vestirBoton(Estilo.botonComercio(pie, function() return L.t("COMERCIO_DESCARTAR") end,
    protegido("compra", function()
      SNF.Compra.cancelar()
    end)))
  descartar:SetPoint("RIGHT", comprar, "LEFT", -4, 0)
  pie.descartar = descartar
  pie.engranaje = Estilo.botonIconoComercio(pie, ICONO_ENGRANAJE, LADO_ENGRANAJE, function() return L.t("COMERCIO_AJUSTES") end,
    protegido("ventana", function()
      UIComercio.alternarAjustes(pie.engranaje)
    end))
  pie.engranaje:SetPoint("RIGHT", descartar, "LEFT", -6, 0)
  pie.llevas = texto(pie, TAMANOS.pequeno, "RIGHT")
  pie.llevas:SetWidth(ANCHO_LLEVAS)
  pie.llevas:SetPoint("RIGHT", pie.engranaje, "LEFT", -8, 0)
  -- La barra de progreso: un marco con un relleno de color (más fuerte cuando está listo, rojo con un error) y el texto.
  local prog = CreateFrame("Frame", nil, pie)
  prog:SetHeight(ALTO_PIE - 8)
  prog:SetPoint("LEFT", pie, "LEFT", MARGEN, 0)
  prog:SetPoint("RIGHT", pie.llevas, "LEFT", -8, 0)
  Estilo.panelComercio(prog, "filas")
  prog.relleno = prog:CreateTexture(nil, "ARTWORK")
  prog.relleno:SetTexture(RESALTE)
  prog.relleno:SetPoint("TOPLEFT", prog, "TOPLEFT", 1, -1)
  prog.relleno:SetPoint("BOTTOMRIGHT", prog, "BOTTOMRIGHT", -1, 1)
  prog.relleno:Hide()
  prog.texto = texto(prog, TAMANOS.lista, "LEFT")
  prog.texto:SetPoint("LEFT", prog, "LEFT", 6, 0)
  prog.texto:SetPoint("RIGHT", prog, "RIGHT", -6, 0)
  pie.progreso = prog
  pie.info = prog.texto -- el nombre de antes: el texto del estado
end

-- Guarda en `clave` (cobre) lo escrito en la caja (oro entero), recortado a los LIMITES. Lo que no es un entero no
-- negativo no cambia nada, y lo mismo que ya enseñaba la caja tampoco (así un tope guardado de 1,5 de oro no se
-- redondea a 1 por salir de la caja). Después la caja enseña lo que ha quedado y se repinta la barra (el botón Comprar
-- depende del aviso de oro).
local function guardarOro(clave, caja)
  local escrito = string.match(caja:GetText() or "", "^%s*(%d+)%s*$")
  if escrito and string.format("%d", tonumber(escrito)) ~= oroDe(clave) then
    -- Se recorta en oro antes de pasar a cobre: un número enorme por 10000 podría desbordarse.
    local limite = SNF.Ajustes.LIMITES[clave]
    local oro = math.min(tonumber(escrito), floor(limite.max / 10000))
    local cobre = math.max(limite.min, oro * 10000)
    if cobre ~= SNF.Ajustes.get(clave) then
      SNF.Ajustes.set(clave, cobre)
    end
  end
  caja:SetText(oroDe(clave))
  pintarBarra()
end

-- Una caja de oro entero con su texto delante. Intro o salir de la caja guarda; Escape deshace lo escrito.
local function cajaOro(padre, clave)
  local etiqueta = texto(padre, TAMANOS.pequeno)
  ponerColor(etiqueta, Estilo.comercio("secundario"))
  local marco = CreateFrame("Frame", nil, padre)
  marco:SetSize(ANCHO_CAJA, ALTO_CAJA)
  marco:SetPoint("LEFT", etiqueta, "RIGHT", 4, 0)
  Estilo.panelComercio(marco, "filas")
  local caja = CreateFrame("EditBox", nil, marco)
  caja:SetPoint("TOPLEFT", marco, "TOPLEFT", 4, -1)
  caja:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", -4, 1)
  caja:SetAutoFocus(false)
  caja:SetMultiLine(false)
  caja:SetMaxLetters(9)
  Estilo.fuente(caja, TAMANOS.lista)
  ponerColor(caja, Estilo.comercio("texto"))
  caja:SetScript("OnEnterPressed", protegido("ventana", function(self)
    guardarOro(clave, self)
    self:ClearFocus()
  end))
  caja:SetScript("OnEditFocusLost", protegido("ventana", function(self)
    guardarOro(clave, self)
  end))
  caja:SetScript("OnEscapePressed", protegido("ventana", function(self)
    self:SetText(oroDe(clave)) -- antes de soltarla: al soltarla se guarda lo que enseña
    self:ClearFocus()
  end))
  return etiqueta, caja, marco
end

-- La ventanita del engranaje, sobre la barra: el tope de gasto, el aviso de oro y si se elige sola la fila siguiente tras
-- comprar. Empieza cerrada; el engranaje la abre y la cierra (al cerrarla, una caja a medio escribir guarda lo escrito).
-- «Llevas X de Y» vive en la barra (pie.llevas); aquí se repite el mismo texto en .llevas.
local function crearGasto()
  local g = CreateFrame("Frame", nil, raiz)
  SNF.WindowSizing.register(g, "auctionSettings", true)
  g:SetSize(ANCHO_AJUSTES, ALTO_AJUSTES)
  g:SetFrameStrata("DIALOG")
  g:EnableMouse(true)
  g:SetPoint("BOTTOMRIGHT", raiz.pie.engranaje, "TOPRIGHT", 0, 4)
  Estilo.panelComercio(g, "cabecera")
  raiz.ajustes = g
  g.llevas = raiz.pie.llevas
  g.titulo = texto(g, TAMANOS.lista)
  g.titulo:SetPoint("TOPLEFT", g, "TOPLEFT", MARGEN + 2, -8)
  g.textoTope, g.tope = cajaOro(g, "comercioTope")
  g.textoTope:SetPoint("LEFT", g, "TOPLEFT", MARGEN + 2, -38)
  g.textoAviso, g.aviso = cajaOro(g, "comercioAvisoOro")
  g.textoAviso:SetPoint("LEFT", g, "TOPLEFT", MARGEN + 2, -62)
  g.siguiente = Estilo.casillaComercio(g, function() return L.t("COMERCIO_SIGUIENTE_SOLA") end, function()
    return SNF.Ajustes.get("comercioSiguienteSola") == true
  end, function(valor)
    SNF.Ajustes.set("comercioSiguienteSola", valor and true or false)
  end)
  g.siguiente:SetWidth(ANCHO_AJUSTES - 2 * MARGEN - 4)
  g.siguiente:SetPoint("TOPLEFT", g, "TOPLEFT", MARGEN + 2, -80)
  -- Tarea S2: la casilla del sonido del sniper, que antes iba arriba en su pestaña.
  g.sonido = Estilo.casillaComercio(g, function() return L.t("COMERCIO_SNIPER_SONIDO") end, function()
    return SNF.Ajustes.get("comercioSniperSonido") and true or false
  end, function(valor)
    SNF.Ajustes.set("comercioSniperSonido", valor and true or false)
  end)
  g.sonido:SetWidth(ANCHO_AJUSTES - 2 * MARGEN - 4)
  g.sonido:SetPoint("TOPLEFT", g, "TOPLEFT", MARGEN + 2, -102)
  -- Fase 3 de la paridad: el modo del sniper (comercioSniperModo). Marcada, deciden las operaciones de Sniper de los grupos.
  g.sniperOperaciones = Estilo.casillaComercio(g, function() return L.t("COMERCIO_SNIPER_OPERACIONES") end, function()
    return SNF.Ajustes.get("comercioSniperModo") == "operaciones"
  end, function(valor)
    SNF.Ajustes.set("comercioSniperModo", valor and "operaciones" or "regla")
  end)
  g.sniperOperaciones:SetWidth(ANCHO_AJUSTES - 2 * MARGEN - 4)
  g.sniperOperaciones:SetPoint("TOPLEFT", g, "TOPLEFT", MARGEN + 2, -124)
  -- Tope prudente (comercioPrudente): Sniper y Compras no pagan más que el precio de tu casa o el regional.
  g.topePrudente = Estilo.casillaComercio(g, function() return L.t("COMERCIO_TOPE_PRUDENTE") end, function()
    return SNF.Ajustes.get("comercioPrudente") ~= false
  end, function(valor)
    SNF.Ajustes.set("comercioPrudente", valor and true or false)
  end)
  g.topePrudente:SetWidth(ANCHO_AJUSTES - 2 * MARGEN - 4)
  g.topePrudente:SetPoint("TOPLEFT", g, "TOPLEFT", MARGEN + 2, -146)
  g.largeText = Estilo.casillaComercio(g, function() return L.t("AUCTION_LARGE_TEXT") end,
    function() return SNF.Ajustes.get("auction.largeText") end,
    function(value) SNF.Ajustes.set("auction.largeText", value) end)
  g.largeText:SetWidth(ANCHO_AJUSTES - 2 * MARGEN - 4)
  g.largeText:SetPoint("TOPLEFT", g, "TOPLEFT", MARGEN + 2, -168)
  g:SetScript("OnHide", siempre("ventana", function()
    g.tope:ClearFocus() -- salir de una caja guarda lo escrito
    g.aviso:ClearFocus()
  end))
  g:Hide()
end

-- La ventanita del engranaje: encima de `ancla` (pegada a su borde derecho; con lado «izquierda», al izquierdo) o, si ya se
-- ve, se cierra. La usan el engranaje de la lista vieja y el del sniper (tarea S2).
function UIComercio.alternarAjustes(ancla, lado)
  local g = raiz and raiz.ajustes
  if not g then
    return
  end
  if g:IsShown() then
    g:Hide()
    return
  end
  g:ClearAllPoints()
  if lado == "izquierda" then
    g:SetPoint("BOTTOMLEFT", ancla, "TOPLEFT", 0, 4)
  else
    g:SetPoint("BOTTOMRIGHT", ancla, "TOPRIGHT", 0, 4)
  end
  pintarGasto()
  g:Show()
end

local function crear()
  raiz = CreateFrame("Frame", nil, UIParent)
  raiz:SetFrameStrata("HIGH") -- colocar() lo cambia por el de la subasta
  raiz:SetToplevel(true)
  raiz:EnableMouse(true) -- no deja pasar el ratón a lo que haya debajo
  raiz:SetMovable(true) -- se arrastra por la cabecera (sub.empezarArrastre)
  raiz:SetClampedToScreen(true)
  Estilo.panelComercio(raiz, "fondo")
  crearCabecera()
  crearPestanaSnet()
  local contenido = Ventana.marcos.contenido
  raiz.avisos = UI.texto(raiz, TAMANOS.pequeno)
  raiz.avisos:SetJustifyH("LEFT")
  raiz.avisos:SetPoint("TOPLEFT", contenido, "TOPLEFT", MARGEN, -3)
  raiz.avisos:SetPoint("TOPRIGHT", contenido, "TOPRIGHT", -MARGEN, -3)
  ponerColor(raiz.avisos, COLORES_PCT.amarillo)
  crearBarra()
  crearGasto()
  -- Los avisos de arriba y la barra de compra de abajo solo salen en la lista vieja (ofertas); el sniper tiene su barra.
  local function conCompra(si)
    raiz.avisos:SetShown(si)
    raiz.pie:SetShown(si)
    if not si then
      raiz.ajustes:Hide()
      -- El cuadro de cantidad tampoco se queda abierto en una página sin barra de compra.
      local cuadro = rawget(SNF, "CantidadComercio")
      if cuadro and cuadro.abierto() then
        pcall(cuadro.cerrar)
      end
    end
  end
  local arriba = -30 -- bajo los avisos
  Ventana.registrar("ofertas", {
    crear = function(p)
      crearGrupos(p, arriba)
      crearCuerpo(p, arriba)
    end,
    mostrar = function() conCompra(true) end,
    ocultar = function() conCompra(false) end,
  })
  -- La lista y el sniper (ui/subasta/sniper.lua) existen desde el principio (el repintado y las compras usan la lista
  -- aunque no se vea; las pruebas miran el sniper antes de enseñarlo).
  Ventana.preparar("ofertas")
  Ventana.preparar("sniper")
  conCompra(false)
  raiz:SetScript("OnShow", siempre("ventana", function()
    pintarPestana(raiz.pestanaSnet, true)
    recolocarPestana()
    Ventana.alMostrar()
    sub.arrancarEscaneo() -- F13: también al volver a verse por su padre (Alt+Z), sin pasar por abrir()
  end))
  raiz:SetScript("OnHide", siempre("ventana", function()
    sub.terminarArrastre() -- si se esconde en pleno arrastre, el arrastre acaba aquí
    if not sub.creando then -- el Hide de crear() no es que se esconda: aún no ha salido
      SNF.Comercio.ceder() -- F13: sin la ventana a la vista no se pide nada a la subasta
    end
    raiz.ajustes:Hide() -- la ventanita del engranaje no se queda abierta al volver
    local cuadro = rawget(SNF, "CantidadComercio")
    if cuadro then
      pcall(cuadro.cerrar) -- el cuadro de cantidad no se queda encima de la subasta de Blizzard sin su ventana
    end
    esconderVentanita()
    pintarPestana(raiz.pestanaSnet, false)
    Ventana.alOcultar()
  end))
  sub.creando = true
  raiz:Hide()
  sub.creando = nil
  sub.ponerPosicion()
end

---------------------------------------------------------------------------------------------------
-- Interfaz
---------------------------------------------------------------------------------------------------

-- Llega el nombre de un objeto: se repintan solo las filas (y la barra) si lo enseñan; la lista no se recalcula.
local function alRecibirObjeto(item)
  if not raiz or not raiz:IsShown() then
    return
  end
  ejecutar("ventana", function()
    local compra = rawget(SNF, "Compra")
    local e = compra and compra.estado()
    local hace = e ~= nil and (item == nil or e.item == item)
    for _, w in ipairs(raiz.filas) do
      if w:IsShown() and w.fila and (item == nil or w.fila.item == item) then
        hace = true
        break
      end
    end
    if hace then
      -- Con el mismo freno de 0,5 s que el escaneo: muchos nombres que llegan seguidos no repintan la tabla cada vez.
      pedirRepintado(function()
        pintarFilas()
        pintarBarra()
      end)
    end
  end)
end

local function escucharObjetos(si)
  if si and not escuchandoObjetos then
    SNF.Eventos.escuchar("GET_ITEM_INFO_RECEIVED", alRecibirObjeto)
  elseif not si and escuchandoObjetos then
    SNF.Eventos.dejar("GET_ITEM_INFO_RECEIVED", alRecibirObjeto)
  end
  escuchandoObjetos = si
end

-- El oro de la cabecera sigue a PLAYER_MONEY mientras la ventana está abierta.
local function alCambiarDinero()
  if raiz and raiz:IsShown() then
    ejecutar("ventana", pintarOro)
  end
end

local function escucharDinero(si)
  if si and not escuchandoDinero then
    SNF.Eventos.escuchar("PLAYER_MONEY", alCambiarDinero)
  elseif not si and escuchandoDinero then
    SNF.Eventos.dejar("PLAYER_MONEY", alCambiarDinero)
  end
  escuchandoDinero = si
end

---------------------------------------------------------------------------------------------------
-- Convivencia con otros addons de subasta (TSM)
---------------------------------------------------------------------------------------------------

-- Cuando TSM (u otro addon) enseña su propia ventana saca AuctionHouseFrame de la pantalla y le pone una escala diminuta
-- (sin ocultarla). Nosotros también la sacamos de la pantalla con nuestra vista (con alfa 0, sin tocar la escala), así que
-- hay que distinguir lo nuestro de lo de otro: una subasta escondida por nosotros cuenta como usable; si otro addon le pone
-- una escala diminuta mientras la tenemos (los ganchos de SetScale, SetPoint, ClearAllPoints y SetAlpha saltan también con
-- lo nuestro, pero se salta cuando sub.tocando), la soltamos: ahora es suya, no la reponemos y se esconde lo nuestro (su
-- sitio, su alfa o una escala usable no: la volvemos a esconder). Cuando ese addon la devuelve no la
-- volvemos a esconder por nuestra cuenta: solo sale nuestra pestaña (la vista guardada no cambia, y al abrir la subasta
-- otra vez manda esa vista).

-- Sin argumentos: mira AuctionHouseFrame (true si no existe). F13: forma parte de UIComercio.aLaVista, la puerta de toda
-- petición a la subasta.
function UIComercio.subastaUsable()
  local subasta = subastaDeBlizzard()
  return subasta == nil or subastaNuestraOUsable(subasta)
end

function UIComercio.aLaVista()
  if not raiz or not raiz:IsVisible() or sub.velada or sub.porEsconder then
    return false
  end
  return UIComercio.subastaUsable() == true
end

-- Esconde lo nuestro sin tocar la vista guardada (no es elegir la vista de Blizzard).
local function esconderPorSubasta()
  if not raiz then
    return
  end
  sub.deHecho = "blizzard" -- cuando la devuelva, solo nuestra pestaña
  raiz:Hide()
  raiz.pestanaSnet:Hide()
  escucharObjetos(false)
  escucharDinero(false)
end

-- El escaneo que se paró porque nuestra ventana no estaba a la vista (parado, motivo «otro») arranca cuando vuelve a verse:
-- lo llaman abrir() tras raiz:Show(), el OnShow de la ventana y el final del velo. Con la vista de Blizzard la ventana no
-- sale y no se arranca nada. Escaneo.iniciar() ya respeta el sniper y el límite del servidor. SNF.Escaneo puede ser un módulo
-- de prueba: solo se llama si tiene estas funciones.
local function arrancarEscaneoPendiente()
  local e = rawget(SNF, "Escaneo")
  if not raiz or type(e) ~= "table" or not SNF.Comercio.ventanaVisible() then
    return
  end
  local estado, motivo, iniciar = rawget(e, "estado"), rawget(e, "motivo"), rawget(e, "iniciar")
  if type(estado) == "function" and type(motivo) == "function" and type(iniciar) == "function"
    and estado() == "parado" and motivo() == "otro" then
    iniciar()
  end
end
sub.arrancarEscaneo = arrancarEscaneoPendiente

-- Mira si la subasta se puede usar: si no, esconde la ventana y la pestaña; si vuelve a poderse (o con forzar), recoloca
-- y enseña según la vista guardada. Nunca crea la ventana (solo abrir() lo hace).
local function revisarSubasta(forzar)
  if not raiz or not SNF.Comercio.abierta() then
    return
  end
  local subasta = subastaDeBlizzard()
  if not subasta then
    return
  end
  if not subastaNuestraOUsable(subasta) then
    if raiz:IsShown() or raiz.pestanaSnet:IsShown() then
      esconderPorSubasta()
    end
  elseif forzar or not raiz.pestanaSnet:IsShown() then
    UIComercio.abrir()
  end
end
sub.revisar = revisarSubasta

local subastaEnganchada = nil -- la AuctionHouseFrame que ya lleva nuestros ganchos (se ponen una sola vez)

-- Ganchos que solo miran (hooksecurefunc y HookScript no cambian lo que hace la subasta). Con pcall: un fallo aquí no
-- puede romper la subasta.
sub.tabResizeEnganchado = false -- el gancho de PanelTemplates_TabResize se pone una sola vez

local function engancharSubasta()
  -- Todas las pestañas de otros addons llaman a PanelTemplates_TabResize al crearse: nuestra pestaña se recoloca detrás.
  if not sub.tabResizeEnganchado and type(rawget(_G, "PanelTemplates_TabResize")) == "function" then
    sub.tabResizeEnganchado = true
    pcall(hooksecurefunc, "PanelTemplates_TabResize", siempre("ventana", function(pestana)
      if sub.pestanaDeLaSubasta(pestana) then
        sub.pedirRecolocar()
      end
    end))
  end
  local subasta = subastaDeBlizzard()
  if not subasta or subasta == subastaEnganchada then
    return
  end
  subastaEnganchada = subasta
  local mirar = siempre("ventana", function() revisarSubasta(false) end)
  -- Un cambio que no es nuestro (15d r1):
  -- * sin ser nuestra: si aparece nuestro punto con escala usable, se reponen los puntos de antes (sub.mirarAjenos);
  -- * una escala diminuta (TSM): ahora es de ese addon, ver soltarSubasta;
  -- * cualquier otra cosa (su sitio, como el gestor de paneles de Blizzard al abrir otros paneles, o una escala usable): no
  --   nos la quita. Si la deja a la vista (o sujeta a la pantalla), escondido de reserva en el acto (15d r2); si la deja
  --   fuera o sin medidas, se vuelve a esconder un fotograma después (sub.pedirReEsconder), para no pelearse con TSM, que
  --   pone sus puntos y luego su escala. Con el escondido de reserva, una escala usable ajena se deshace en el acto (SetScale
  --   no se pelea con TSM) y un cambio de sitio no importa. Una escala usable es de quien la puso: es la que se devuelve si
  --   la tocamos nosotros.
  local function alCambiar(esEscala)
    return siempre("ventana", function()
      if sub.tocando then
        return
      end
      local guardado = sub.dueno
      if not guardado or guardado.subasta ~= subasta then
        sub.mirarAjenos(subasta)
        revisarSubasta(false)
        return
      end
      local ok, escala = pcall(subasta.GetScale, subasta)
      local diminuta = ok and type(escala) == "number" and escalaDiminuta(escala)
      if diminuta and (esEscala or not guardado.reserva) then
        soltarSubasta()
        revisarSubasta(true)
        return
      end
      if esEscala and ok and type(escala) == "number" and not diminuta then
        guardado.escala = escala
      end
      if guardado.reserva then
        if esEscala or not sub.noSeVe(subasta) then
          sub.ponerReserva()
        end
      elseif sub.quedaFuera(subasta) == false then
        sub.ponerReserva()
      else
        sub.pedirReEsconder()
      end
    end)
  end
  pcall(hooksecurefunc, subasta, "SetScale", alCambiar(true))
  pcall(hooksecurefunc, subasta, "SetPoint", alCambiar(false))
  pcall(hooksecurefunc, subasta, "ClearAllPoints", alCambiar(false))
  -- Sujetarla a la pantalla con la subasta escondida por nosotros (EnhanceQoLMover lo hace): WoW la mete en la pantalla
  -- sin pasar por SetPoint. Escondido de reserva en el acto.
  if type(subasta.SetClampedToScreen) == "function" then
    pcall(hooksecurefunc, subasta, "SetClampedToScreen", siempre("ventana", function(_, sujeta)
      local guardado = sub.dueno
      if sub.tocando or not sujeta or not guardado or guardado.subasta ~= subasta or guardado.reserva then
        return
      end
      sub.ponerReserva()
    end))
  end
  -- Un SetAlpha ajeno con la subasta escondida por nosotros no nos la quita (TSM la esconde con la escala, no con el alfa):
  -- se vuelve a poner alfa 0 al momento, también en combate, para que no se vea ni un fotograma. Mientras está en alfa 0
  -- desde el AUCTION_HOUSE_SHOW, lo que ponga ese addon es lo que se devolverá. Sin ser nuestra, no se mira.
  pcall(hooksecurefunc, subasta, "SetAlpha", siempre("ventana", function()
    if sub.tocando then
      return
    end
    local guardado = sub.dueno
    local pre = sub.preAlfa
    if guardado and guardado.subasta == subasta then
      ponerSubasta(subasta, {alfa = 0})
    elseif pre and pre.subasta == subasta then
      local ok, alfa = pcall(subasta.GetAlpha, subasta)
      if ok and type(alfa) == "number" then
        pre.alfa = alfa
      end
      ponerSubasta(subasta, {alfa = 0})
    end
  end))
  -- Cuando la escala pasa de diminuta (la tenía otro addon) a usable, sus bordes se recalculan (ver sub.pedirResnap). Mira
  -- también nuestras llamadas: lo que cuenta es la escala que queda.
  local okEscala, escalaAhora = pcall(subasta.GetScale, subasta)
  sub.eraDiminuta = okEscala and escalaDiminuta(escalaAhora)
  pcall(hooksecurefunc, subasta, "SetScale", siempre("ventana", function()
    local ok, escala = pcall(subasta.GetScale, subasta)
    local diminuta = ok and escalaDiminuta(escala)
    if sub.eraDiminuta and not diminuta then
      sub.pedirResnap()
    end
    sub.eraDiminuta = diminuta
  end))
  if type(subasta.HookScript) == "function" then
    -- Mostrarse u ocultarse no suelta nada: cerrar la subasta la oculta y aún hay que reponerla.
    pcall(subasta.HookScript, subasta, "OnShow", mirar)
    pcall(subasta.HookScript, subasta, "OnHide", mirar)
    pcall(subasta.HookScript, subasta, "OnShow", siempre("ventana", sub.pedirRecolocar)) -- otros addons ponen sus pestañas al abrirse
  end
end

function UIComercio.abrir()
  if not SNF.Comercio.activo() then
    return false
  end
  return (ejecutar("ventana", function()
    if not raiz then
      crear()
    end
    engancharSubasta()
    local subasta = subastaDeBlizzard()
    if subasta and not subastaNuestraOUsable(subasta) then
      esconderPorSubasta() -- TSM tiene la subasta: nada nuestro se ve hasta que vuelva a ser usable
      return
    end
    local vista = sub.deHecho or UIComercio.vista() -- tras devolverla otro addon, solo la pestaña
    if sub.rendida then
      vista = "blizzard" -- en esta apertura no se pudo esconder sin que se pudiera pulsar (sub.rendirse)
    end
    local retraso = sub.retrasar
    sub.retrasar = nil
    colocar(vista ~= "blizzard", retraso)
    if sub.rendida then
      vista = "blizzard" -- nos hemos rendido al esconderla ahora mismo
    end
    indice = nil
    raiz.pestanaSnet:Show()
    -- Otra vez enseguida y medio segundo después (ver colocarPestana).
    local temporizador = rawget(_G, "C_Timer")
    if type(temporizador) == "table" and type(temporizador.After) == "function" then
      local de_nuevo = siempre("ventana", recolocarPestana)
      temporizador.After(0, de_nuevo)
      temporizador.After(0.5, de_nuevo)
    end
    if vista == "blizzard" then
      raiz:Hide() -- la última vista fue la de Blizzard: la pestaña queda abajo para volver
      escucharObjetos(false)
      escucharDinero(false)
      return
    end
    raiz:Show()
    arrancarEscaneoPendiente() -- cubre «WoW UI» y la pestaña nuestra
    escucharObjetos(true)
    escucharDinero(true)
    repintar()
    if sub.velada then
      sub.quitarRaton() -- lo que se acaba de crear tampoco coge el ratón mientras no se ve
    end
  end))
end

function UIComercio.cerrar()
  Ventana.alInicio() -- al volver a abrir la subasta, otra vez en Navegar
  -- F1: se olvida la versión de la última lista de Navegar: al volver a abrir, la primera lista repinta las ofertas.
  UIComercio._versionListas = nil
  sub.deHecho = nil
  sub.nuestra = false
  sub.medidas = nil
  sub.rendida = nil
  sub.avisada = nil
  sub.velar(false)
  -- Lo que tiene otro addon se conserva (la devolverá en otra apertura); si ya aparece nuestro punto con escala usable,
  -- se reponen sus puntos (sub.mirarAjenos).
  local subasta = subastaDeBlizzard()
  if subasta then
    sub.mirarAjenos(subasta)
  end
  if raiz then
    raiz:Hide()
    raiz.pestanaSnet:Hide()
  end
  reponerSubasta() -- si seguimos siendo dueños (si no, la subasta es de otro addon y no se toca); también en combate
  escucharObjetos(false)
  escucharDinero(false)
end

function UIComercio.vista()
  return SNF.Ajustes.get("comercioVista") == "blizzard" and "blizzard" or "snet"
end

-- Elige la vista de la subasta y la recuerda. Con la vista «blizzard» se oculta nuestra ventana y se repone la subasta de
-- Blizzard (puntos, alfa y ratón que tenía; la escala, solo si la tocamos con el escondido de reserva); con la «snet» se
-- esconde. AuctionHouseFrame nunca se oculta con Hide(): cerraría
-- la subasta.
function UIComercio.ponerVista(vista)
  vista = vista == "blizzard" and "blizzard" or "snet"
  if vista == "snet" and sub.rendida and SNF.Comercio.abierta() then
    sub.avisarRendida(true) -- rendidos (sub.rendirse): ni se cambia la vista guardada ni se intenta otra vez
    return
  end
  SNF.Ajustes.set("comercioVista", vista)
  sub.deHecho = nil -- el jugador elige: manda su elección
  if not raiz or not SNF.Comercio.abierta() then
    return
  end
  if vista == "blizzard" then
    esconderVentanita()
    local estabaVisible = raiz:IsShown()
    raiz:Hide()
    if estabaVisible then
      colocar(false) -- la subasta vuelve y nuestra pestaña con las suyas
    end
  elseif not raiz:IsShown() then
    if not UIComercio.abrir() and UIComercio.subastaUsable() then
      raiz:Show() -- comercio apagado: se enseña tal cual, con su aviso (salvo que otro addon tenga la subasta)
    end
  end
end

function UIComercio.fila(i)
  -- La i-ésima de la lista en el orden que se ve. Los escalones de la fila elegida no cuentan: solo hay filas de objetos.
  local n = 0
  local j = 1
  local f = tabla and tabla:fila(j)
  while f do
    if not f.escalon then
      n = n + 1
      if n == i then
        return datosDeFila(f)
      end
    end
    j = j + 1
    f = tabla:fila(j)
  end
  return nil
end

function UIComercio.tabla()
  return tabla
end

function UIComercio.pestana()
  return Ventana.pagina()
end

-- Cambia de página (la de una pestaña o «ofertas»); «lista», el nombre de antes, es «ofertas».
function UIComercio.elegirPestana(nombre)
  esconderVentanita()
  Ventana.elegir(nombre == "lista" and "ofertas" or nombre)
end

function UIComercio.grupo()
  if raiz and raiz:IsShown() then
    return grupoElegido
  end
  return nil
end

function UIComercio.elegirGrupo(clave)
  grupoElegido = clave
  if tabla then
    tabla:desplazar(-1e9) -- otra vez desde arriba
  end
  if raiz and raiz:IsShown() then
    ejecutar("ventana", repintar)
  end
end

function UIComercio.olvidarGrupos()
  indice = nil
end

function UIComercio.marco()
  return raiz
end

-- Tras /reload no llega AUCTION_HOUSE_SHOW y Comercio.abierta() es falso: no se crea ni se enseña nada hasta el siguiente.
-- Con la subasta ya abierta (cambio de zona), se recoloca si se puede usar o se esconde si TSM la tiene.
SNF.Eventos.escuchar("PLAYER_ENTERING_WORLD", function()
  pcall(engancharSubasta)
  siempre("ventana", function() revisarSubasta(true) end)()
end)

SNF.Eventos.escuchar("SNF_COMERCIO_ABIERTA", function()
  sub.rendida = nil -- otra apertura: se vuelve a intentar esconderla
  sub.avisada = nil
  sub.retrasar = true -- la subasta se esconde un fotograma después
  Ventana.alInicio() -- al abrir la subasta siempre se está en Navegar
  UIComercio.abrir()
  sub.retrasar = nil
end)

-- Lo que se le debía a la subasta de Blizzard y no se pudo en combate (esconderla o reponerla) se hace al salir de él, según
-- lo último que se pidió: escondida si nuestra ventana se ve con la subasta abierta, repuesta si no.
SNF.Eventos.escuchar("PLAYER_REGEN_ENABLED", function()
  if not sub.cambios and not sub.pendiente and not sub.modoPendiente then
    return
  end
  local habiaPendientes = sub.pendiente ~= nil
  sub.cambios = false
  pcall(sincronizarSubasta)
  if habiaPendientes then
    siempre("ventana", function() revisarSubasta(false) end)() -- la subasta ya se puede usar: vuelve nuestra pestaña
  end
end)

SNF.Eventos.escuchar("SNF_COMERCIO_CERRADA", function()
  ejecutar("ventana", UIComercio.cerrar)
end)

SNF.Eventos.escuchar("SNF_COMERCIO_ESCANEO", function()
  ejecutar("ventana", pedirRepintado)
end)

-- F1, ronda 2: ha llegado una lista de Navegar: la lista de ofertas puede tener otra foto para algún objeto. Igual que con el
-- aviso del escaneo: con la ventana a la vista y como mucho un repintado cada medio segundo. Ronda 3: solo si ha llegado
-- una lista nueva de verdad (SNF.Busqueda.versionVivo() distinta de la del último repintado por este aviso); las páginas de
-- una búsqueda y las listas a medias no la cambian y no recalculan nada.
UIComercio._versionListas = nil
SNF.Eventos.escuchar("SNF_COMERCIO_BUSQUEDA", function()
  ejecutar("ventana", function()
    local B = rawget(SNF, "Busqueda")
    local f = type(B) == "table" and rawget(B, "versionVivo")
    local v = type(f) == "function" and f() or nil
    if v == nil or v ~= UIComercio._versionListas then
      UIComercio._versionListas = v
      pedirRepintado()
    end
  end)
end)

-- El sniper ha empezado o parado: la cabecera (que avisa de que la lista enseña la última lectura del escaneo). Su pestaña
-- se repinta sola (ui/subasta/sniper.lua).
SNF.Eventos.escuchar("SNF_COMERCIO_SNIPER", function()
  if raiz and raiz:IsShown() then
    ejecutar("ventana", function()
      local s = sniper()
      if (s ~= nil and s.activo()) ~= sniperActivo then
        pintarCabecera()
      end
    end)
  end
end)

-- Pulsar una fila prepara su compra (la tarea 14 puede poner otra cosa).
UIComercio.alPulsarFila = function(fila)
  local compra = rawget(SNF, "Compra")
  if fila and compra then
    compra.elegir(fila)
  end
end

-- Pulsar un escalón NO compra: con una mercancía pone todas las unidades hasta él (como mucho Compra.maxCantidad) y abre el
-- cuadro de cantidad, donde el jugador confirma. Primero se pone la cantidad y luego se abre el cuadro, que ya la enseña.
-- Un objeto suelto no cambia de cantidad (cada escalón es una subasta entera): no pasa nada.
UIComercio.alPulsarEscalon = function(escalon)
  local compra = rawget(SNF, "Compra")
  if compra and compra.combate() then
    return false -- en combate el cuadro de cantidad no se abre
  end
  local e = compra and compra.estado()
  if not (e and escalon and e.item == escalon.item and e.tipo == "mercancia") then
    return false
  end
  local n = math.min(escalon.acumulado or 0, compra.maxCantidad())
  if n >= 1 then
    compra.ponerCantidad(n)
  end
  return abrirCuadro()
end

SNF.Eventos.escuchar("SNF_COMERCIO_COMPRA", function(fase, e)
  ejecutar("compra", function()
    if fase == "hecho" and type(e) == "table" then
      print(L.t("COMERCIO_COMPRADO", (nombreYCalidad(e.item)), Texto.numero(e.cantidad or 0), dinero(e.total)))
    end
    if raiz then
      pintarBarra()
      refrescarEscalones() -- llegan los escalones (o se quitan con la compra)
      elegirDeLaCompra() -- Descartar, o una compra elegida desde el Sniper, cambian la fila marcada
    end
  end)
end)

-- Entrar y salir de combate: el botón Comprar se apaga y se enciende (en combate no se compra).
-- Solo con la ventana a la vista (al abrirla ya se repinta). La marca se pone aquí también por si este oyente va antes.
SNF.Eventos.escuchar("PLAYER_REGEN_DISABLED", function()
  SNF.Compra.enCombate = true
  if raiz and raiz:IsShown() then
    ejecutar("compra", pintarBarra)
  end
end)
SNF.Eventos.escuchar("PLAYER_REGEN_ENABLED", function()
  SNF.Compra.enCombate = false
  if raiz and raiz:IsShown() then
    ejecutar("compra", pintarBarra)
  end
end)

-- Lo gastado ha cambiado sin cambiar la compra (p. ej. vence una compra fallida y se quita su gasto).
SNF.Eventos.escuchar("SNF_COMERCIO_GASTO", function()
  if raiz then
    ejecutar("ventana", pintarGasto)
  end
end)

-- El comercio se ha apagado por un fallo: el cortafuegos ya no deja pasar nada, así que esto va con un pcall propio.
local function alApagarse()
  if not raiz then
    return
  end
  esconderVentanita()
  raiz.avisos:SetText(L.t("COMERCIO_APAGADO"))
  ponerColor(raiz.avisos, COLORES_PCT.rojo)
  Ventana.ponerAvisos({L.t("COMERCIO_APAGADO")})
  pintarBarra()
end

SNF.Eventos.escuchar("SNF_COMERCIO_APAGADO", function()
  pcall(alApagarse)
end)

SNF.Eventos.escuchar("SNF_COMERCIO_AVISO", function()
  if raiz and raiz:IsShown() then
    ejecutar("ventana", pintarCabecera)
  end
end)
