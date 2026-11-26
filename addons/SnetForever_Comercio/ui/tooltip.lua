-- SnetForever: nuestras líneas en el tooltip de objetos del juego (Task 20d, T1b, Task 37, 38 y 40). Salen en GameTooltip
-- (bolsas, banco, la subasta de Blizzard y nuestras tablas) y en ItemRefTooltip (los enlaces del chat), debajo de lo del
-- juego o, con «Insertarlas en el tooltip del juego» sin marcar, en un tooltip aparte pegado debajo (Task 38, más abajo), en
-- apartados con el título en amarillo:
--   «SnetForever · Información general»
--       Grupo                        la ruta en el árbol de grupos, con « › »
--       Operación de subasta, de artesanía, de correo, de compras, de sniper, de vendedor y de almacén (Task 37: una línea
--                                    por tipo, en el orden de Operaciones.ORDEN, también si la hereda). Por defecto solo
--                                    la de subasta, que enseña solo el primer nombre, como antes. Las otras seis enseñan
--                                    hasta 3: «A», «A y B», «A, B y C» y, desde 4, «A, B, C y N más».
--       Precio de venta al vendedor  si el objeto se vende (aunque el juego ya lo pinte, como hace TSM)
--       Fuente propia «nombre»       Task 37: el valor de cada fuente propia encendida (Formulas.valor), por nombre.
--       Inventario                   «N en bolsas y banco» (o «N en bolsas, banco y correo» si el correo trae alguno; no
--                                    «en total»: no cuenta la casa de subastas, los personajes con los que aún no se ha
--                                    entrado ni los bancos y buzones sin abrir) y, debajo, cada personaje propio que tiene
--                                    alguno, con su nombre entero («Nombre Apellido», F2) en el color de su clase y el
--                                    desglose: «17 (5 Bolsas, 12 Banco)», «20 (5 Bolsas, 12 Banco, 3 Correo)» o «3 (3
--                                    Bolsas, banco sin ver)» si su banco no se ha abierto todavía; lo que viene de la
--                                    importación de TSM lo dice al final: «; de TSM, a 19/11» o «; banco y correo de TSM, a
--                                    19/11». Debajo de todo, en gris, una frase con lo que el total no cuenta (F2): «Sin
--                                    contar: 1 banco, 2 buzones y los personajes sin entrar» (los bancos y buzones sin abrir
--                                    de las fichas del reino, tengan o no el objeto, y siempre los personajes con los que no
--                                    se ha entrado: el juego no dice cuántos hay). F2b: después de los personajes, una
--                                    fila «Banco de cuenta 4» con lo del banco de cuenta (uno para toda la cuenta, en el
--                                    total una sola vez), y la frase dice «el banco de cuenta» si aún no se ha visto. Sale
--                                    de SNF.InventarioCuenta (comercio/inventario.lua). Con el inventario simple (Task 37),
--                                    solo el total y la frase.
--   «SnetForever · Subasta»
--       A la venta                   «400 unidades, 37 subastas (app, hace 17 min)»: detrás, de qué foto salen y de cuándo
--                                    es (fallo F1, más abajo), en azul claro, o en rojo si tiene más de 24 h. Las subastas
--                                    las trae la app y la lista de un objeto suelto (el escaneo no, ni la de una mercancía,
--                                    cuyos escalones no son subastas).
--       Compra mínima                la unidad más barata, de la misma foto que las unidades (si «A la venta» no sale, lleva
--                                    ella el «(app, hace…)»). Con 0 unidades a la venta no sale (ni la línea de la regla):
--                                    el precio que trae la app es de la última vez que se vio el objeto.
--       Valor de mercado             «[▲12%] 10g 00s 00c»: siempre de la app; si la foto de arriba no es la app, detrás lleva
--                                    «(app, hace 17 min)» (o, sin él, la primera línea de la app que salga). Delante, la
--                                    TENDENCIA del valor (las 24 últimas fotos con el objeto a la venta contra todas las de antes que se guardan), con flecha: verde si sube, rojo si baja, «[0%]» gris si no cambia.
--                                    Bajar nunca va en verde. Si la tendencia no se sabe, no hay corchete. La flecha es
--                                    un icono de nuestro atlas (Tema.iconoTexto), no una letra: la del juego puede no
--                                    traer ▲▼. (Antes el % comparaba el mercado con la compra mínima y no se entendía.)
--                                    Task 37: o sin la tendencia (la línea «mercadoSolo»), como el «Market value» de TSM.
--       Salidas locales/día (ventas y retiradas, aprox.)   F5: en una MERCANCÍA, las unidades que dejan la subasta antes de que
--                                    se les acabe el tiempo, sin las que se cancelan por encima de lo más barato que sigue
--                                    intacto (nadie compra por encima de eso: ver app/src/comercio/historial.mjs). Un
--                                    máximo aproximado: vendidas o retiradas, no se pueden distinguir del todo. Entero y
--                                    con el separador de miles del idioma (Texto.entero: «2.054», «2,054»). Antes,
--                                    «Vendidos al día» y luego «Salen sin caducar al día (aprox.)», con un decimal.
--                                    F9p: el número puede estar inflado por cancelaciones de lo más barato, así que es
--                                    un tope: «hasta 2.054». Ronda 1: con menos de media unidad, «menos de 1» (redondeado
--                                    sería un «hasta 0» falso); con 0 exacto, «0».
--       Salen antes de tiempo al día (vendidas o retiradas)   lo mismo en un OBJETO SUELTO, donde no se descuenta nada (el
--                                    comprador elige la subasta): todo lo que sale antes de tiempo. Debajo, en gris, una
--                                    línea sola: «No son ventas: también cuenta lo que retira su dueño». Una fila de la
--                                    app sin el 1 de las mercancías (o de una app de antes) sale así.
--       Parte que sale (vendida o retirada, aprox.)   de las subastas que salen, el % que lo hace antes de caducar, con el
--                                    mismo criterio; en un objeto suelto, «Parte que sale antes de tiempo (vendida o
--                                    retirada)». Antes, «Tasa de venta» y «Parte que sale sin caducar».
--       y, si el grupo tiene regla de compra, si la cumple, con el mínimo con que la ha mirado: «Buena compra según tu regla
--       (a 9g 50s 00c)». F9p: en una mercancía aprobada, en amarillo, «El precio cumple tu regla · rotación sin confirmar».
-- (El orden de las casillas, Tooltip.GRUPOS, es el de TSM: en «Precios de la subasta», histórico detrás del valor de
-- mercado con tendencia; en «Subasta (operación)», la cantidad que se publica primero.)
--   «SnetForever · Operaciones» (Task 37, todo apagado por defecto; solo con el objeto en un grupo)
--       Mínimo / normal / máximo     «1g 20s 00c / 2g 00s 00c / 5g 00s 00c»: las fórmulas de precio de la PRIMERA operación
--                                    de Subasta del grupo, con «—» donde la fórmula no tiene valor. El dinero sale de
--                                    Tema.dinero, el único formato de dinero del addon (con los cobres), o con las monedas
--                                    del juego si el formato del precio es «Iconos» (Task 38; vale para todo el dinero).
--       Máximo a publicar            el campo «tope» de esa operación: un número de unidades, no dinero.
--       Precio máximo (Compras)      la fórmula de la operación de Compras del grupo.
--       Precio máximo (Sniper)       la fórmula de la operación de Sniper del grupo.
--   Al final, si se enciende (está apagado por defecto): ItemID e IconID.
-- Un apartado sin líneas no deja su título suelto.
-- Lo que NO sale porque no lo tenemos: nada de la región ni de otros reinos (la app solo baja las casas del reino), ni el
-- valor reciente, ni destruir o convertir (no hay en el repo una tabla fiable de lo que dan), ni la compra al vendedor (el
-- juego no la da: vendorbuy siempre es «sin valor»). Ni se inventa ni se pone a cero; tampoco salen como casilla.
--
-- Qué mide cada número y con qué fórmula: la cabecera de app/src/comercio/historial.mjs. Los precios de la subasta vienen
-- de la app; del escaneo en vivo solo se enseñan la compra mínima y las unidades, tal cual. Lo único que se calcula aquí
-- son las fórmulas del jugador (fuentes propias y operaciones), con comercio/formulas.lua.
--
-- Una sola forma de escribir (Task 37): Tooltip.componer(salida, datos, g, opciones) decide qué líneas salen y con qué
-- texto (y con qué formato de precio, Task 38). El tooltip de verdad la llama con los datos reales (Tooltip.datos) y una
-- salida que escribe en el tooltip; el ejemplo de Ajustes › Tooltip (Task 40) la llama con los datos inventados de
-- Tooltip.EJEMPLO, {todas = true} y una salida que pinta textos. Así no se pueden separar. Cada línea doble es AddDoubleLine: la etiqueta a la izquierda en gris claro y el valor a la derecha.
-- Solo se añaden líneas: no se toca ni se sustituye nada de otros addons. El mecanismo es el de las marcas del núcleo
-- (ia/marcas.lua): TooltipDataProcessor.AddTooltipPostCall para los objetos y, si no existe, HookScript("OnTooltipSetItem").
-- Se engancha una sola vez, también OnTooltipCleared y OnHide de los dos tooltips del juego (Task 38: esconden el aparte). Como el enganche se llama muchísimo, solo hace búsquedas directas por objeto (nunca recorre
-- árboles, listas ni bolsas) y no crea tablas por línea: los datos reales y la salida son tablas fijas. Nada parpadea ni
-- cambia de color solo, y no hay nada en OnUpdate.
--
-- Errores: un fallo en una fórmula (de una fuente propia o de una operación) solo deja esa línea sin salir; se apunta con
-- Comercio.anotarFallo una sola vez por fórmula y sesión (una fuente propia, por su nombre y su fórmula). Fallo F6 (en el
-- juego, 20-nov): cada parte compone por su cuenta (grupo y operaciones, venta al vendedor, fuentes propias, inventario, el
-- apartado Subasta, el de Operaciones y los ids): un fallo en una solo deja sin salir lo que le quedaba a esa parte, y se
-- apunta una sola vez por parte y sesión («tooltip: inventario: …»). Antes cortaba todo lo de detrás: con una instalación
-- mezclada (un núcleo sin API.bolsasCuenta) el tooltip acababa en el precio de venta. Cualquier otro fallo dentro del
-- tooltip también se apunta (sin pasar por el cortafuegos del comercio) y nunca rompe el tooltip del juego.
--
-- La casa (F6): con la subasta abierta, todo lo de la app es de SU casa (SNF.Precios, la de su subastador). En la neutral,
-- que la app no baja, no sale nada de la app de la Horda (ni valor de mercado, ni lo que sale, ni la parte) y, en su sitio,
-- una línea gris: «Valor de mercado y lo que sale: sin datos de esta subasta (neutral)». La venta y la mínima siguen
-- saliendo de la lista de Navegar de esa casa, si la hay. Ronda 1: tampoco sale el escaneo leído en otra casa (cada dato
-- lleva su facción: SNF.Subasta.foto lo deja fuera).
--
-- Los datos (fallo F1, en el juego: el tooltip enseñaba el mínimo y las unidades de una foto vieja del servidor con la hora
-- de ahora). Regla: cada número dice de qué momento es, y el mínimo, las unidades y las subastas salen siempre de la misma
-- foto, la primera que haya de estas (ronda 1: la elige SNF.Subasta.foto, ia/subasta.lua, la misma para la lista de ofertas,
-- la IA y las reglas de compra; las palabras, UIComercio.momento, las mismas que la columna Foto de la lista):
--   1. la lista de Navegar (SNF.Busqueda.vivo: la última lista ENTERA del objeto con la subasta abierta), lo único de verdad
--      de ahora: «(subasta, ahora mismo)», «(subasta, hace 3 min)»;
--   2. la foto de la app (SNF.Precios.de, con su hora real, SNF.Precios.edad): «(app, hace 17 min)»;
--   3. el escaneo (SNF.Escaneo.datos, {precio, cantidad, hora, origen}), solo si la app no trae el objeto: ReplicateItems y el
--      resumen de navegar dan una foto guardada por el servidor, de cuándo no se sabe (lo más probable, la misma foto de la API
--      de esa hora), y su hora es la de LECTURA: «(escaneo, leído hace 5 min)». Nunca gana a una foto de la app.
-- El valor de mercado, lo que sale y la parte son siempre de la app. Sin /reload no entra una foto nueva de la app con la
-- subasta abierta (comercio/precios.lua): el tooltip dice de cuándo es y ya está. «cantidad» cuenta UNIDADES.
--
-- Los precios de la app se cargan con el primer tooltip de un objeto, sin abrir la subasta (SNF.Precios.consultar: gasta la
-- ranura de la hora anterior, que el cliente ya no ejecuta otra vez, y lo apunta para que Precios.alAbrir no se confunda). Sin tabla de precios sale una sola línea gris que lo explica.
--
-- Sin repetidas: nuestros apartados salen una sola vez por tooltip aunque el juego llame dos veces al enganche para el
-- mismo objeto. Se marca el tooltip con el objeto y las líneas que tenía al terminar; la marca se borra en OnTooltipCleared
-- y, si de pronto hay menos líneas (el juego rehízo el tooltip sin avisar), se vuelve a añadir.
--
-- Al día con la lista (fallo F8, en el juego: con el ratón quieto el tooltip decía 14612 unidades y la fila de Navegar,
-- 14384). Cuando llega una lista ENTERA nueva (aviso SNF_COMERCIO_BUSQUEDA) del objeto que enseña
-- GameTooltip o ItemRefTooltip, ese tooltip se rehace (la tabla Repinte, más abajo). Una lista nueva es una tabla nueva de
-- Busqueda.vivo: se compara esa tabla y no el número de versión, que vuelve a 0 al cerrar la subasta y se repetiría (ronda
-- 1). Las reglas, por la sin parpadeos:
--   · todo en una sola llamada, dentro del mismo fotograma: el tooltip nunca se esconde ni se vuelve a anclar;
--   · como mucho un repintado cada 0,5 s por tooltip (abrirlo cuenta como pintar). Si llegan varias listas, se pinta la
--     última al acabar la espera, con un solo C_Timer.After por tooltip. Nada en OnUpdate;
--   · si los números que se ven (unidades, subastas y compra mínima de las líneas encendidas, o lo que usan las fórmulas) no
--     han cambiado, no se toca nada: tampoco el «(subasta, hace…)», que sigue diciendo de cuándo es lo que se lee;
--   · el ancho no encoge mientras siga el mismo objeto: con GameTooltip:SetMinimumWidth, si el cliente lo tiene, medido y
--     corregido en la misma llamada (no se sabe si su mínimo cuenta el margen). Puede crecer. Al vaciar o esconder el
--     tooltip vuelve el mínimo de antes. Sin SetMinimumWidth, el ancho es el que dé el juego.
-- Con GameTooltip:RefreshData() se rehace el tooltip entero. Sin él e insertado NO se toca: nuestras líneas no se pueden
-- sustituir, y volver a pedir el objeto (SetHyperlink) perdería lo que el juego sabe de ESE objeto (su bolsa, sus cargas, si
-- está ligado). Sale al día la próxima vez que se abra y, mientras, dice de cuándo es. El tooltip aparte es nuestro: se
-- rehace en su sitio (ClearLines, sin SetOwner ni anclar), con RefreshData o sin él, y el del juego no se toca.
-- Ronda 1: RefreshData solo trae lo del juego y lo de los enganches. Las líneas que añade una fila nuestra detrás (el
-- vendedor, los precios, de qué lectura sale la Ctd: UIComercio.tooltipObjeto) se vuelven a poner en la misma llamada, antes
-- del Show. Se guardan solo en memoria (Tooltip.ponerFila) y se olvidan al vaciar o esconder el tooltip o al cambiar de
-- objeto. Si el tooltip tiene más líneas de las que sabemos (otro addon las ha añadido después), se trata como sin
-- RefreshData: no se toca, porque rehacerlo las perdería.
-- Ronda 3: si se ha rehecho no se deduce contando líneas (el juego puede traer más al rehacerlo). Se sabe por
-- OnTooltipCleared y, si no llega, mirando si los textos de la fila siguen en su sitio: si siguen, no se añaden; si no, sí.
-- Si no se pueden leer (sin texto o secretos), antes de rehacerlo no se toca el tooltip, y si dejan de leerse al rehacerlo
-- no se añaden: en la duda, nunca líneas repetidas.
--
-- Los ajustes (la página es Ajustes › Tooltip, por grupos como la de TSM desde la Task 39: ui/principal/ajustes.lua):
--   · SnetForeverCuenta.comercio.tooltip (true por defecto): todo el bloque, la opción «Activar». «/snet comercio tooltip»
--     lo cambia.
--   · SnetForeverCuenta.comercio.tooltipLineas[clave] = true | false: cada línea. Lo que no está vale su valor por defecto.
--     Se cambia solo con Tooltip.ponerLinea (y renombrarFuente): las fuentes encendidas se guardan hechas lista.
--   · SnetForeverCuenta.comercio.tooltipOpciones = {incrustado, formato, tecla} (Task 38): las otras tres opciones de arriba.
--     Es de la cuenta y solo guarda elecciones del jugador (ningún nombre). Se crea al primer cambio, como tooltipLineas,
--     así que la plantilla de nucleo/guardado.lua no cambia. Un valor raro guardado se lee como el de por defecto.
--       incrustado  true (por defecto): nuestras líneas dentro del tooltip del juego. false: en un tooltip aparte,
--                   SnetForeverTooltipAparte (de GameTooltip) o SnetForeverTooltipAparteRef (de ItemRefTooltip), creados la
--                   primera vez que hacen falta con GameTooltipTemplate; pegados por arriba al borde de abajo del tooltip
--                   del juego o, si así se salen de la pantalla, por abajo a su borde de arriba. Se esconden al esconder o
--                   vaciar el del juego, al apagar «Activar» y al volver a insertar. Con el del juego prohibido no se tocan.
--       formato     «texto» (por defecto, Tema.dinero: «345g 12s 67c») o «iconos»: las monedas del propio juego
--                   (GetCoinTextureString si existe y no falla; si no, las texturas UI-GoldIcon, UI-SilverIcon y
--                   UI-CopperIcon de Interface\MoneyFrame). Son de Blizzard.
--       tecla       «ninguna» (por defecto: siempre), «mayus», «ctrl» o «alt»: las líneas solo se añaden si está pulsada
--                   (IsShiftKeyDown, IsControlKeyDown, IsAltKeyDown). Task 39: solo en GameTooltip (pasar el ratón).
--                   ItemRefTooltip, el enlace del chat abierto con un clic, las lleva siempre que «Activar» esté
--                   encendido: se queda fijo para leerlo y no se puede tener la tecla pulsada a la vez. Un marco (Tooltip.marcoTecla) escucha
--                   MODIFIER_STATE_CHANGED, un evento (nada en OnUpdate), y solo hace algo si cambió el estado de esa tecla
--                   y el GameTooltip se ve con un objeto: con GameTooltip:RefreshData() rehace el tooltip; sin él, en modo
--                   aparte enseña o esconde el aparte, e insertado añade las líneas al pulsar (y vuelve a llamar a Show
--                   para que el tamaño y el fondo las cubran) y AL SOLTAR SE QUEDAN hasta que el juego rehaga el tooltip
--                   (sin RefreshData no se pueden quitar). Un cambio por pulsación, nunca repetido; las líneas no salen
--                   dos veces. Con la tecla sin pulsar, el enganche esconde el aparte él mismo (ronda 1: no se fía de que
--                   RefreshData lance OnTooltipCleared).
--
-- Tooltip.activo() -> boolean       el ajuste de todo el bloque.
-- Tooltip.alternar() -> boolean     lo enciende o lo apaga, lo dice en el chat y devuelve el valor nuevo.
-- Tooltip.ponerActivo(valor) -> boolean   lo enciende o lo apaga sin decirlo (la casilla de Ajustes › Tooltip) y avisa con
--                                   SNF_COMERCIO_TOOLTIP. La orden y la casilla cambian el mismo ajuste. Apagado esconde
--                                   también el aparte.
-- Tooltip.OPCIONES                  Task 38: {{clave, texto, defecto, valores = {{valor, texto}…}}…} de incrustado, formato y
--                                   tecla, en ese orden (`texto`, claves de L.t); para la página de Ajustes (Task 39).
--                                   COMERCIO_TT_OPC_F_TEXTO lleva un hueco %s: quien lo enseña lo llena con
--                                   Tema.dineroPlano(3451267) («Texto (345g 12s 67c)»), como la página de Ajustes.
-- Tooltip.opcion(clave) -> valor    el de tooltipOpciones, o el de por defecto (nil con una clave que no existe).
-- Tooltip.ponerOpcion(clave, valor) -> boolean   lo guarda y avisa con SNF_COMERCIO_TOOLTIP; un valor que no vale (o
--                                   una clave que no existe) da false, no se guarda y no avisa.
-- Tooltip.marcoTecla                el marco que escucha MODIFIER_STATE_CHANGED.
-- Tooltip.ultimoMirado() -> id | nil  el último objeto con nuestras líneas en el tooltip (el objeto de ejemplo del editor
--                                   de fórmulas ⧉, Task 23). Solo se apunta el número: no cuesta nada en el enganche.
-- Tooltip.GRUPOS                    Task 37: los grupos de la página Tooltip de TSM, en su orden: {{clave, texto, lineas}…}.
--                                   Cada línea es {clave, texto, defecto, excluye?, llega?}; `texto` es la clave del nombre
--                                   (L.t(texto)). `excluye`: la otra mitad de una pareja (inventario / inventarioSimple y
--                                   mercado / mercadoSolo): marcar una desmarca la otra. `llega`: la clave del texto «llega
--                                   con…»; esa línea no tiene datos todavía: no se guarda, no se marca y no sale. Las
--                                   fuentes propias van en el grupo «valores», detrás de «vendedor», con lineasFuentes().
--                                   Lo que no tenemos (región, otros reinos, valor reciente, destruir, convertir y compra al
--                                   vendedor) no está.
-- Tooltip.LINEAS                    la lista plana de las líneas con datos, en el orden de GRUPOS (por compatibilidad): las
--                                   11 de T1b (grupo, operacion, vendedor, inventario, aLaVenta, minima, mercado, salen,
--                                   parte, regla e ids) y las nuevas de la Task 37, todas apagadas por defecto:
--                                   operacionArtesania, operacionCorreo, operacionCompras, operacionSniper,
--                                   operacionVendedor, operacionAlmacen, inventarioSimple, mercadoSolo, preciosSubasta,
--                                   maximoPublicar, maximoCompras y maximoSniper.
-- Tooltip.lineasFuentes() -> {{clave = "fuente:<nombre>", texto, defecto = false, nombre}}   una por fuente propia
--                                   (Formulas.fuentes()), por nombre. Como en LINEAS, `texto` es la clave del nombre de la
--                                   casilla (L.t(texto) = «Fuente propia»); `nombre` es el de la fuente, que la página pone
--                                   detrás. En el tooltip la línea sale como «Fuente propia «nombre»».
-- Tooltip.lineasGuardadas() -> tabla | nil   SnetForeverCuenta.comercio.tooltipLineas (el `g` de componer), o nil.
-- Tooltip.linea(clave) -> boolean   si esa línea sale (false con una clave que no existe o que «llega con…»).
-- Tooltip.ponerLinea(clave, valor) -> boolean   la enciende o la apaga y lo guarda (marcar una de una pareja apaga la otra);
--                                   false si la clave no existe, si es de las «llega con…» o si es «fuente:<nombre>» de
--                                   una fuente que no existe.
-- Tooltip.renombrarFuente(vieja, nueva) -> boolean   el ajuste de «fuente:vieja» pasa a «fuente:nueva» (Ajustes › Fuentes
--                                   propias lo llama al cambiar el nombre). Al quitar una fuente su clave se queda guardada:
--                                   sin la fuente, la línea no sale y no estorba. Si estaba encendida, Ajustes › Fuentes
--                                   propias la apaga con ponerLinea("fuente:<nombre>", false) (Task 39): no se borra nada,
--                                   y fuentesEncendidas deja de pedirla en cada tooltip.
-- Tooltip.componer(salida, datos, g, opciones)   escribe nuestras líneas en `salida` con los datos de `datos` y los ajustes
--                                   `g` (como tooltipLineas; nil = todo por defecto).
--     salida:titulo(clave)          el título de un apartado (clave del texto); solo antes de su primera línea.
--     salida:doble(izq, der, color, apagada)   una línea de dos columnas; `color` es el de la izquierda (nil = gris
--                                   claro). `apagada` (Task 40) solo llega a true con opciones.todas: esa línea está
--                                   desmarcada (o «Activar» está en No) y el ejemplo la pinta entera en gris.
--     salida:linea(texto, color, apagada)   una línea sola (nil = gris claro); `apagada`, igual.
--                                   Un título no dice si su apartado tiene alguna línea encendida: lo decide la salida.
--     datos, cada dato bajo petición (nil = no hay; en las fórmulas, un segundo valor dice que la fórmula falló):
--       grupo() -> ruta | false     operaciones(tipo) -> {nombres} | nil     venta() -> cobre | nil
--       fuente(nombre) -> valor | nil, error?                inventario() -> total, {{nombre, clase, total, bolsas, banco,
--                                   correo, tsm}}, falta (F2: {bancos, correos, sinEntrar, bancoCuenta}), deCuenta (F2b:
--                                   lo del banco de cuenta | nil), como InventarioCuenta.de
--       subasta() -> precio, cantidad, subastas, edad, preciosDeLaApp, fuente, edadDeLaApp | nil, sinTablaDePrecios
--                                   fuente (F1): "lista" | "app" | "escaneo", de dónde salen precio, cantidad, subastas y
--                                   edad (sin fuente, "app"); edadDeLaApp: la de la foto de la app (la del valor de
--                                   mercado). Con la lista, precio puede ser nil (no hay ninguna que se pueda comprar).
--       campoSubasta(campo) -> valor | nil, error?   de la primera operación de Subasta del grupo («precioMinimo»,
--                                   «precioNormal», «precioMaximo», «tope»)
--       maximo(tipo) -> valor | nil, error?          el «precioMaximo» de la operación de Compras o de Sniper
--       regla() -> true | false | nil                ids() -> item, icono | nil
--       casaSinDatos() -> faccion | nil              F6: con la subasta abierta, su facción si la app no trae su casa (la
--                                   neutral, SNF.Precios.sinDatos). Opcional (sin ella, nil).
--     opciones (opcional): {formato = "texto" | "iconos", todas = true}. Sin formato, o con uno que no vale, el formato
--                                   guardado. Los textos salen siempre en el idioma del cliente (L.t solo traduce a ese;
--                                   las etiquetas se guardan hechas por idioma). Con `todas` (Task 40, el ejemplo de
--                                   Ajustes › Tooltip) salen todas las líneas que tienen datos, encendidas o no, en el
--                                   mismo orden; las desmarcadas con `apagada`, y con «Activar» en No todas. Lo que cambia
--                                   con todas: cada fuente propia que existe sale (no solo las encendidas); el inventario
--                                   sale con su desglose por personaje (apagado si no es el completo); con las dos de la
--                                   pareja del valor de mercado desmarcadas, la línea sale apagada con la tendencia. Las
--                                   «llega con…» no salen nunca. La tecla no cuenta: componer no la mira.
-- Tooltip.EJEMPLO                   Task 40: los datos inventados del ejemplo, con la forma de los de arriba. Fijos, nunca
--                                   del jugador ni de otros: grupo «Ejemplo › Hierbas», la operación «#Ejemplo» en los 7
--                                   tipos, venta al vendedor 8c, cada fuente propia del jugador (su nombre) con 10c,
--                                   inventario 23 con la fila «Personaje de ejemplo: 22 (5 Bolsas, 17 Banco)» (sin clase),
--                                   la del banco de cuenta con 1 (F2b)
--                                   y la frase «Sin contar: 1 banco, 1 buzón y los personajes sin entrar» (F2),
--                                   a la venta 400 unidades y 37 subastas de la app de hace 17 min, mínima 9g 50s, mercado 10g con
--                                   tendencia +12 %, salen 2.054 al día (una mercancía, F5), parte 61 %, la regla
--                                   que se cumple, precios de la
--                                   operación 5g / 12g / 50g, máximo a publicar 40, máximo de Compras 8g y de Sniper 6g,
--                                   ItemID 2447 e IconID 133939. Los nombres, en el idioma del cliente (COMERCIO_TT_EJ_*).
-- Tooltip.datos(item) -> datos      los datos reales de ese objeto (una tabla fija: cada tooltip la vuelve a preparar).
-- Tooltip.COLORES                   {verde, rojo, amarillo, gris, blanco, azul} como {r, g, b}.
-- Tooltip.hex(clave) -> «rrggbb»    el color de COLORES en hexadecimal (para |cff…|r).
-- Tooltip.anadir(tooltip, item, data) añade nuestros apartados al tooltip para ese objeto (lo que llama el enganche), o a
--                                   su aparte, según las opciones (con la tecla elegida sin pulsar, nada).
-- Tooltip.ponerFila(tooltip, dueno, lineas, anadidas)   F8: las líneas que una fila nuestra (`dueno`) acaba de añadir con
--                                   lineas(tt), para volver a ponerlas si el tooltip se rehace. `anadidas`: cuántas han sido
--                                   (ronda 2: solo esas cuentan como conocidas; una de otro addon puesta antes no). Sin
--                                   función, olvida las de antes. Solo en memoria: pueden llevar el nombre de un vendedor.
-- Tooltip.renovarFila(tooltip, dueno, lineas)   F8: la misma fila, con su función de ahora (no añade ni cuenta líneas).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Tooltip = {}
SNF.TooltipComercio = Tooltip

local L = SNF.L
local Texto = SNF.Texto
local API = SNF.API

local floor = math.floor

local COLORES = {
  verde = {0.25, 0.9, 0.25},
  rojo = {1, 0.25, 0.25},
  amarillo = {1, 0.82, 0}, -- el de los títulos del juego
  gris = {0.8, 0.8, 0.8}, -- las etiquetas
  blanco = {1, 1, 1},
  azul = {0.55, 0.8, 1}, -- azul claro: el «(hace 30 min)»
}
Tooltip.COLORES = COLORES

local MAS_DE = 24 * 3600 -- pasado este tiempo, el dato se enseña en rojo
local RAYA = "\226\128\148" -- «—»: el precio de una operación sin valor

local HEX = {}
local function hex(clave)
  local h = HEX[clave]
  if not h then
    local c = COLORES[clave]
    h = string.format("%02x%02x%02x", floor(c[1] * 255 + 0.5), floor(c[2] * 255 + 0.5), floor(c[3] * 255 + 0.5))
    HEX[clave] = h
  end
  return h
end
Tooltip.hex = hex

local function pintar(clave, texto)
  return "|cff" .. hex(clave) .. texto .. "|r"
end

local function recibe(tabla, campo)
  return type(tabla) == "table" and type(tabla[campo]) == "function"
end

---------------------------------------------------------------------------------------------------
-- Los ajustes
---------------------------------------------------------------------------------------------------

local function guardadoComercio()
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  return type(c) == "table" and c or nil
end

function Tooltip.activo()
  local c = guardadoComercio()
  return not (c and c.tooltip == false)
end

-- Lo mismo que la orden, sin decirlo en el chat: la casilla de Ajustes › Tooltip (Task 23). Avisa con SNF_COMERCIO_TOOLTIP
-- para que la casilla siga a la orden aunque la página esté a la vista.
local esconderApartes -- (más abajo, con el enganche) esconde los tooltips aparte que se vean

function Tooltip.ponerActivo(valor)
  pcall(SNF.Guardado.preparar)
  local c = guardadoComercio()
  if not c then
    return false
  end
  c.tooltip = valor and true or false
  if not c.tooltip then
    esconderApartes() -- apagar no deja nada a la vista, tampoco el aparte
  end
  SNF.emitir("SNF_COMERCIO_TOOLTIP")
  return true
end

function Tooltip.alternar()
  local nuevo = not Tooltip.activo()
  Tooltip.ponerActivo(nuevo)
  print(L.t(nuevo and "COMERCIO_TT_ENCENDIDO" or "COMERCIO_TT_APAGADO"))
  return nuevo
end

-- Una línea con datos y una que «llega con…» (sin datos todavía: apagada, sin guardar y sin salir).
local function con(clave, texto, defecto, excluye)
  return {clave = clave, texto = texto, defecto = defecto == true, excluye = excluye}
end
local function llega(clave, texto, aviso)
  return {clave = clave, texto = texto, defecto = false, llega = aviso}
end

-- Los grupos de la página Tooltip de TSM (App/MainUI/Settings/Tooltip.lua), con nuestros nombres y solo lo que tenemos.
Tooltip.GRUPOS = {
  {clave = "gruposOps", texto = "COMERCIO_TT_G_GRUPOS", lineas = {
    con("grupo", "COMERCIO_TT_GRUPO", true),
    con("operacion", "COMERCIO_TT_OPERACION", true),
    con("operacionArtesania", "COMERCIO_TT_OP_ARTESANIA"),
    con("operacionCorreo", "COMERCIO_TT_OP_CORREO"),
    con("operacionCompras", "COMERCIO_TT_OP_COMPRAS"),
    con("operacionSniper", "COMERCIO_TT_OP_SNIPER"),
    con("operacionVendedor", "COMERCIO_TT_OP_VENDEDOR"),
    con("operacionAlmacen", "COMERCIO_TT_OP_ALMACEN"),
  }},
  {clave = "valores", texto = "COMERCIO_TT_G_VALORES", lineas = {
    llega("destruirCompleto", "COMERCIO_TT_DESTRUIR_COMPLETO", "COMERCIO_TT_LLEGA_DESTRUIR"),
    llega("destruirSimple", "COMERCIO_TT_DESTRUIR_SIMPLE", "COMERCIO_TT_LLEGA_DESTRUIR"),
    llega("convertirCompleto", "COMERCIO_TT_CONVERTIR_COMPLETO", "COMERCIO_TT_LLEGA_DESTRUIR"),
    llega("convertirSimple", "COMERCIO_TT_CONVERTIR_SIMPLE", "COMERCIO_TT_LLEGA_DESTRUIR"),
    llega("vendedorCompra", "COMERCIO_TT_VENDEDOR_COMPRA", "COMERCIO_TT_LLEGA_SIN_DATOS"),
    con("vendedor", "COMERCIO_TT_PRECIO_VENTA", true),
  }},
  {clave = "inventario", texto = "COMERCIO_TT_G_INVENTARIO", lineas = {
    con("inventario", "COMERCIO_TT_AJ_INV_COMPLETO", true, "inventarioSimple"),
    con("inventarioSimple", "COMERCIO_TT_AJ_INV_SIMPLE", false, "inventario"),
  }},
  {clave = "contabilidad", texto = "COMERCIO_TT_G_CONTABILIDAD", lineas = {
    llega("contaCompras", "COMERCIO_TT_CONTA_COMPRAS", "COMERCIO_TT_LLEGA_CONTABILIDAD"),
    llega("contaVentas", "COMERCIO_TT_CONTA_VENTAS", "COMERCIO_TT_LLEGA_CONTABILIDAD"),
    llega("contaRitmo", "COMERCIO_TT_CONTA_RITMO", "COMERCIO_TT_LLEGA_CONTABILIDAD"),
    llega("contaCaducadas", "COMERCIO_TT_CONTA_CADUCADAS", "COMERCIO_TT_LLEGA_CONTABILIDAD"),
    llega("contaCanceladas", "COMERCIO_TT_CONTA_CANCELADAS", "COMERCIO_TT_LLEGA_CONTABILIDAD"),
  }},
  {clave = "bdSubasta", texto = "COMERCIO_TT_G_PRECIOS", lineas = {
    con("aLaVenta", "COMERCIO_TT_A_LA_VENTA", true),
    con("minima", "COMERCIO_TT_MINIMA", true),
    con("mercadoSolo", "COMERCIO_TT_MERCADO", false, "mercado"),
    con("mercado", "COMERCIO_TT_AJ_MERCADO_TENDENCIA", true, "mercadoSolo"),
    llega("historico", "COMERCIO_TT_HISTORICO", "COMERCIO_TT_LLEGA_HISTORICO"),
    con("salen", "COMERCIO_TT_SALEN", true),
    con("parte", "COMERCIO_TT_PARTE", true),
  }},
  {clave = "opSubasta", texto = "COMERCIO_TT_G_OP_SUBASTA", lineas = {
    llega("cantidadPublicar", "COMERCIO_TT_CANTIDAD_PUBLICAR", "COMERCIO_TT_LLEGA_VENDER"),
    con("preciosSubasta", "COMERCIO_TT_AJ_PRECIOS_OP"),
    con("maximoPublicar", "COMERCIO_TT_MAX_PUBLICAR"),
  }},
  {clave = "fabricacion", texto = "COMERCIO_TT_G_FABRICACION", lineas = {
    llega("coste", "COMERCIO_TT_COSTE", "COMERCIO_TT_LLEGA_FABRICACION"),
    llega("costeDetallado", "COMERCIO_TT_COSTE_DETALLADO", "COMERCIO_TT_LLEGA_FABRICACION"),
    llega("costeMateriales", "COMERCIO_TT_COSTE_MATERIALES", "COMERCIO_TT_LLEGA_FABRICACION"),
  }},
  {clave = "compras", texto = "COMERCIO_TT_G_COMPRAS", lineas = {
    con("maximoCompras", "COMERCIO_TT_MAX_COMPRAS"),
    con("regla", "COMERCIO_TT_AJ_REGLA", true),
  }},
  {clave = "sniper", texto = "COMERCIO_TT_G_SNIPER", lineas = {
    con("maximoSniper", "COMERCIO_TT_MAX_SNIPER"),
  }},
  {clave = "otros", texto = "COMERCIO_TT_G_OTROS", lineas = {
    con("ids", "COMERCIO_TT_AJ_IDS"),
  }},
}

-- La lista plana de las líneas con datos, su valor por defecto y su pareja.
Tooltip.LINEAS = {}
local DEFECTO, EXCLUYE = {}, {}
for _, grupo in ipairs(Tooltip.GRUPOS) do
  for _, l in ipairs(grupo.lineas) do
    if not l.llega then
      Tooltip.LINEAS[#Tooltip.LINEAS + 1] = l
      DEFECTO[l.clave] = l.defecto
      EXCLUYE[l.clave] = l.excluye
    end
  end
end

-- La línea de cada tipo de operación, en el orden de Operaciones.ORDEN. La de subasta (la de T1b, que sale por defecto)
-- sigue con solo el primer nombre, como antes; las nuevas enseñan hasta 3.
local LINEAS_OPS = {
  {tipo = "subasta", clave = "operacion", texto = "COMERCIO_TT_OPERACION", primera = true},
  {tipo = "artesania", clave = "operacionArtesania", texto = "COMERCIO_TT_OP_ARTESANIA"},
  {tipo = "correo", clave = "operacionCorreo", texto = "COMERCIO_TT_OP_CORREO"},
  {tipo = "compras", clave = "operacionCompras", texto = "COMERCIO_TT_OP_COMPRAS"},
  {tipo = "sniper", clave = "operacionSniper", texto = "COMERCIO_TT_OP_SNIPER"},
  {tipo = "vendedor", clave = "operacionVendedor", texto = "COMERCIO_TT_OP_VENDEDOR"},
  {tipo = "almacen", clave = "operacionAlmacen", texto = "COMERCIO_TT_OP_ALMACEN"},
}

-- Si la línea sale, con los ajustes guardados `g` (SnetForeverCuenta.comercio.tooltipLineas, o nil). Las «fuente:<nombre>»
-- no tienen valor por defecto: apagadas.
local function sale(g, clave)
  local v = g and g[clave]
  if v == nil then
    return DEFECTO[clave] == true
  end
  return v == true
end

local function lineasGuardadas()
  local c = guardadoComercio()
  local g = c and c.tooltipLineas
  return type(g) == "table" and g or nil
end

Tooltip.lineasGuardadas = lineasGuardadas -- Task 40: el ejemplo de Ajustes › Tooltip compone con los mismos ajustes

local function nombreDeFuente(clave)
  local nombre = type(clave) == "string" and string.match(clave, "^fuente:%s*(.-)%s*$")
  if nombre and nombre ~= "" then
    return string.lower(nombre)
  end
  return nil
end

function Tooltip.linea(clave)
  if DEFECTO[clave] == nil then
    local fuente = nombreDeFuente(clave)
    if not fuente then
      return false -- no existe o «llega con…»
    end
    clave = "fuente:" .. fuente
  end
  return sale(lineasGuardadas(), clave)
end

-- Las fuentes encendidas, por nombre, se guardan hechas lista: el enganche no recorre tooltipLineas en cada tooltip. Se
-- rehace al cambiar algo con ponerLinea o renombrarFuente (`version`) o si `g` es otra tabla.
local fuentesHechas = {g = nil, version = -1, nombres = {}}
local version = 0
local NINGUNA = {}

local function fuentesEncendidas(g)
  if not g then
    return NINGUNA
  end
  if fuentesHechas.g == g and fuentesHechas.version == version then
    return fuentesHechas.nombres
  end
  local nombres = {}
  for clave, v in pairs(g) do
    local nombre = v == true and nombreDeFuente(clave)
    if nombre then
      nombres[#nombres + 1] = nombre
    end
  end
  table.sort(nombres)
  fuentesHechas.g, fuentesHechas.version, fuentesHechas.nombres = g, version, nombres
  return nombres
end

function Tooltip.lineasFuentes()
  local lista = {}
  local formulas = rawget(SNF, "Formulas")
  local fuentes = recibe(formulas, "fuentes") and formulas.fuentes() or {}
  local nombres = {}
  for nombre in pairs(fuentes) do
    nombres[#nombres + 1] = nombre
  end
  table.sort(nombres)
  for i, nombre in ipairs(nombres) do
    lista[i] = {clave = "fuente:" .. nombre, texto = "COMERCIO_TT_AJ_FUENTE", defecto = false, nombre = nombre}
  end
  return lista
end

local function existeFuente(nombre)
  local formulas = rawget(SNF, "Formulas")
  return recibe(formulas, "fuentes") and formulas.fuentes()[nombre] ~= nil
end

function Tooltip.ponerLinea(clave, valor)
  local fuente = nombreDeFuente(clave)
  if not fuente and DEFECTO[clave] == nil then
    return false -- no existe o «llega con…»
  end
  pcall(SNF.Guardado.preparar)
  if fuente then
    if valor and not existeFuente(fuente) then
      return false -- encender una fuente que no existe, no; apagar el ajuste de una ya quitada, sí
    end
    clave = "fuente:" .. fuente
  end
  local c = guardadoComercio()
  if not c then
    return false
  end
  if type(c.tooltipLineas) ~= "table" then
    c.tooltipLineas = {}
  end
  c.tooltipLineas[clave] = valor and true or false
  if valor and EXCLUYE[clave] then
    c.tooltipLineas[EXCLUYE[clave]] = false -- marcar una de una pareja desmarca la otra
  end
  version = version + 1
  return true
end

function Tooltip.renombrarFuente(vieja, nueva)
  vieja, nueva = nombreDeFuente("fuente:" .. tostring(vieja)), nombreDeFuente("fuente:" .. tostring(nueva))
  local g = lineasGuardadas()
  if not (vieja and nueva and g) or vieja == nueva or g["fuente:" .. vieja] == nil then
    return false
  end
  g["fuente:" .. nueva] = g["fuente:" .. vieja]
  g["fuente:" .. vieja] = nil
  version = version + 1
  return true
end

-- Las tres opciones de arriba de Ajustes › Tooltip que no son «Activar» (Task 38). Cada valor lleva la clave de su texto.
Tooltip.OPCIONES = {
  {clave = "incrustado", texto = "COMERCIO_TT_OPC_INCRUSTADO", defecto = true, valores = {
    {valor = true, texto = "COMERCIO_TT_OPC_SI"},
    {valor = false, texto = "COMERCIO_TT_OPC_NO"},
  }},
  {clave = "formato", texto = "COMERCIO_TT_OPC_FORMATO", defecto = "texto", valores = {
    {valor = "texto", texto = "COMERCIO_TT_OPC_F_TEXTO"},
    {valor = "iconos", texto = "COMERCIO_TT_OPC_F_ICONOS"},
  }},
  {clave = "tecla", texto = "COMERCIO_TT_OPC_TECLA", defecto = "ninguna", valores = {
    {valor = "ninguna", texto = "COMERCIO_TT_OPC_T_NINGUNA"},
    {valor = "mayus", texto = "COMERCIO_TT_OPC_T_MAYUS"},
    {valor = "ctrl", texto = "COMERCIO_TT_OPC_T_CTRL"},
    {valor = "alt", texto = "COMERCIO_TT_OPC_T_ALT"},
  }},
}
local OPCION = {} -- [clave] = {defecto, vale = {[valor] = true}}
for _, o in ipairs(Tooltip.OPCIONES) do
  local vale = {}
  for _, v in ipairs(o.valores) do
    vale[v.valor] = true
  end
  OPCION[o.clave] = {defecto = o.defecto, vale = vale}
end

-- Lo guardado, o el valor por defecto si no hay nada o lo guardado no vale (de otra versión o tocado a mano).
function Tooltip.opcion(clave)
  local o = OPCION[clave]
  if not o then
    return nil
  end
  local c = guardadoComercio()
  local t = c and c.tooltipOpciones
  local v = nil
  if type(t) == "table" then
    v = t[clave]
  end
  if v ~= nil and o.vale[v] then
    return v
  end
  return o.defecto
end

-- Las tres de una vez, con una sola lectura de lo guardado: el enganche las mira en cada tooltip. Lo mismo que opcion().
local function opcionesGuardadas()
  local c = guardadoComercio()
  local t = c and c.tooltipOpciones
  if type(t) ~= "table" then
    return true, "texto", "ninguna"
  end
  local f, k = t.formato, t.tecla
  return t.incrustado ~= false, OPCION.formato.vale[f] and f or "texto", OPCION.tecla.vale[k] and k or "ninguna"
end

local despuesDeOpcion -- (más abajo, con el enganche) lo que cambia en el momento: el aparte y la tecla

function Tooltip.ponerOpcion(clave, valor)
  local o = OPCION[clave]
  if not o or valor == nil or not o.vale[valor] then
    return false -- no se guarda ni avisa
  end
  pcall(SNF.Guardado.preparar)
  local c = guardadoComercio()
  if not c then
    return false
  end
  if type(c.tooltipOpciones) ~= "table" then
    c.tooltipOpciones = {} -- se crea al primer cambio, como tooltipLineas: la plantilla de nucleo/guardado.lua no cambia
  end
  c.tooltipOpciones[clave] = valor
  despuesDeOpcion(clave)
  SNF.emitir("SNF_COMERCIO_TOOLTIP")
  return true
end

---------------------------------------------------------------------------------------------------
-- Formatos
---------------------------------------------------------------------------------------------------

-- Las etiquetas fijas (las que no llevan números) se guardan por idioma: L.t mira el ajuste del idioma en cada llamada y
-- este enganche pone una docena de etiquetas por tooltip. `idioma` se fija al empezar cada composición (Tooltip.componer).
local idioma = nil
local ETIQUETAS = {}
local function etiqueta(clave)
  local porIdioma = ETIQUETAS[idioma]
  if not porIdioma then
    porIdioma = {}
    ETIQUETAS[idioma] = porIdioma
  end
  local t = porIdioma[clave]
  if not t then
    t = L.t(clave)
    porIdioma[clave] = t
  end
  return t
end

-- Un texto con huecos («%s unidades») relleno: el mismo resultado que L.t(clave, ...), sin volver a mirar el idioma.
local function relleno(clave, ...)
  return string.format(etiqueta(clave), ...)
end

-- El formato del precio de la composición en curso («texto» o «iconos»): lo fija Tooltip.componer.
local formato = "texto"

-- Las monedas del propio juego (texturas de Blizzard), del tamaño de la letra de la línea.
local MONEDA_ORO = "|TInterface\\MoneyFrame\\UI-GoldIcon:0:0:2:0|t"
local MONEDA_PLATA = "|TInterface\\MoneyFrame\\UI-SilverIcon:0:0:2:0|t"
local MONEDA_COBRE = "|TInterface\\MoneyFrame\\UI-CopperIcon:0:0:2:0|t"

-- Cobre con las monedas: GetCoinTextureString del juego si existe y no falla; si no, las mismas partes que Texto.dinero
-- (sin oro si no hay, sin plata si no hay ni oro ni plata, y a dos cifras detrás de otra moneda) con sus texturas.
local function dineroIconos(cobre)
  local juego = rawget(_G, "GetCoinTextureString")
  if type(juego) == "function" then
    local ok, s = pcall(juego, cobre)
    if ok and type(s) == "string" and s ~= "" and not API.esSecreto(s) then
      return s
    end
  end
  local signo = ""
  if cobre < 0 then
    signo, cobre = "-", -cobre
  end
  local oro, plata, resto = floor(cobre / 10000), floor(cobre / 100) % 100, cobre % 100
  local c = string.format((oro > 0 or plata > 0) and "%02d" or "%d", resto) .. MONEDA_COBRE
  if oro > 0 then
    return signo .. oro .. MONEDA_ORO .. " " .. string.format("%02d", plata) .. MONEDA_PLATA .. " " .. c
  elseif plata > 0 then
    return signo .. plata .. MONEDA_PLATA .. " " .. c
  end
  return signo .. c
end

-- Cobre como «1g 40s 03c» con los colores del tema: Tema.dinero, el mismo formato que el resto del addon (B6r, ronda 1:
-- un solo sitio para el dinero). Sin Tema (no debería pasar: va antes en el .toc), el mismo texto sin colores. Con el
-- formato «iconos» (Task 38), con las monedas del juego. Todas las líneas de dinero pasan por aquí.
local function dinero(cobre)
  cobre = floor((tonumber(cobre) or 0) + 0.5)
  if formato == "iconos" then
    return dineroIconos(cobre)
  end
  if SNF.Tema and SNF.Tema.dinero then
    return SNF.Tema.dinero(cobre)
  end
  return Texto.dinero(cobre)
end

-- Lo que da una fórmula como cobre entero hacia abajo (Formulas.cobre: un precio nunca sube); nil si no tiene valor.
local function cobreDe(valor)
  local formulas = rawget(SNF, "Formulas")
  if recibe(formulas, "cobre") then
    return formulas.cobre(valor)
  end
  return type(valor) == "number" and floor(valor) or nil
end

-- El valor de una fórmula como dinero, o «—» si no tiene valor.
local function precioOraya(valor)
  local c = cobreDe(valor)
  return c and dinero(c) or RAYA
end

-- Fallo F1: de qué foto sale cada número y de cuándo es. Todo lo de F1 cuelga de esta tabla (el archivo no gasta más
-- locales de primer nivel). Las palabras son las de UIComercio.momento (ui/comercio.lua), las mismas que la columna Foto de
-- la lista de ofertas, y la foto la elige SNF.Subasta.foto (ia/subasta.lua), la misma para todo lo que enseña un precio de
-- ahora.
--   Momento.CLAVES          las fuentes que se conocen: "lista", "app" y "escaneo".
--   Momento.texto(fuente, segundos)   «(subasta, ahora mismo)», «(app, hace 17 min)», «(escaneo, leído hace 5 min)» (sin
--                           hora, «(escaneo)»), en azul claro; en rojo si pasa de 24 h. «Ahora mismo» solo lo dice la
--                           lista: la app y el escaneo de menos de un minuto dicen «hace menos de 1 min».
--   Momento.appDicha, Momento.edadApp   de la composición en curso (los fija componerSubasta): si lo de la app ya ha dicho
--                           de cuándo es, y la edad de su foto.
--   Momento.conApp(texto)   el texto con «(app, hace…)» detrás la primera vez (lo de la app lo dice una sola vez).
local Momento = {
  CLAVES = {lista = true, app = true, escaneo = true},
  appDicha = false,
  edadApp = nil,
}

function Momento.texto(fuente, segundos)
  local ui = rawget(SNF, "UIComercio")
  local texto = recibe(ui, "momento") and ui.momento(fuente, segundos) or L.t("COMERCIO_SIN_DATO")
  if type(segundos) == "number" and segundos > MAS_DE then
    return pintar("rojo", texto)
  end
  return pintar("azul", texto)
end

-- F6: el nombre de la casa de una facción, en minúsculas («neutral», «horda»), para «sin datos de esta subasta (neutral)».
local CASAS = {Horde = "COMERCIO_CASA_HORDA", Alliance = "COMERCIO_CASA_ALIANZA", Neutral = "COMERCIO_CASA_NEUTRAL"}
function Momento.casa(faccion)
  return string.lower(etiqueta(CASAS[faccion] or "COMERCIO_CASA_NEUTRAL"))
end

function Momento.conApp(texto)
  if Momento.appDicha then
    return texto
  end
  Momento.appDicha = true
  return texto .. " " .. Momento.texto("app", Momento.edadApp)
end

-- La flecha del %: un icono de nuestro atlas teñido del color (la letra del juego puede no traer ▲▼). Se guarda hecha.
local FLECHAS = {}
local function flecha(icono, color)
  local f = FLECHAS[icono]
  if f == nil then
    local tema = rawget(SNF, "Tema")
    local c = COLORES[color]
    f = recibe(tema, "iconoTexto") and tema.iconoTexto(icono, c[1], c[2], c[3]) or (icono == "sube" and "+" or "-")
    FLECHAS[icono] = f
  end
  return f
end

-- La tendencia del valor de mercado, en %: «[▲9%]» en verde si sube, «[▼7%]» en rojo si baja y «[0%]» en gris si no
-- cambia (redondeada). Bajar nunca va en verde. nil si no es un número.
local function tendenciaTexto(x)
  if type(x) ~= "number" then
    return nil
  end
  local n = floor(math.abs(x) + 0.5)
  if n == 0 then
    return pintar("gris", "[0%]")
  elseif x > 0 then
    return pintar("verde", "[" .. flecha("sube", "verde") .. n .. "%]")
  end
  return pintar("rojo", "[" .. flecha("baja", "rojo") .. n .. "%]")
end

-- Los nombres de las operaciones, hasta 3: «A», «A y B», «A, B y C», «A, B, C y 2 más».
local function nombresTexto(n)
  local k = #n
  if k == 1 then
    return n[1]
  elseif k == 2 then
    return relleno("COMERCIO_TT_OPS_Y", n[1], n[2])
  elseif k == 3 then
    return relleno("COMERCIO_TT_OPS_Y", n[1] .. ", " .. n[2], n[3])
  end
  return relleno("COMERCIO_TT_OPS_MAS", n[1] .. ", " .. n[2] .. ", " .. n[3], Texto.numero(k - 3))
end

-- El color de una clase («MAGE»…): RAID_CLASS_COLORS del juego. Sin él, blanco.
local colorDeClase = {}
local function colorClase(clase)
  local c = colorDeClase[clase]
  if c then
    return c
  end
  local tabla = rawget(_G, "RAID_CLASS_COLORS")
  local k = type(tabla) == "table" and type(clase) == "string" and tabla[clase]
  if type(k) == "table" and type(k.r) == "number" and type(k.g) == "number" and type(k.b) == "number" then
    c = {k.r, k.g, k.b}
    colorDeClase[clase] = c
    return c
  end
  return COLORES.blanco
end

-- F2: la fecha de lo importado de TSM: la hora si es de hoy, si no el día («19/11»).
local function fechaTSM(hora)
  local hoy = API.horaServidor()
  local mismoDia = type(hoy) == "number" and date("%Y%m%d", floor(hora)) == date("%Y%m%d", floor(hoy))
  return date(mismoDia and "%H:%M" or "%d/%m", floor(hora))
end

-- El desglose de la fila de un personaje: «5 Bolsas, 12 Banco, 3 Correo» (o «banco sin ver»), y, si alguna parte viene de
-- TSM, «; de TSM, a 19/11» (todas) o «; banco y correo de TSM, a 19/11» (solo esas). El correo solo sale si trae alguno.
local partesTSM = {} -- fija: se vacía en cada fila
local PARTES_TSM = {{"bolsas", "COMERCIO_TT_INV_P_BOLSAS"}, {"banco", "COMERCIO_TT_INV_P_BANCO"}, {"correo", "COMERCIO_TT_INV_P_CORREO"}}
local function partesInventario(p)
  local partes = relleno("COMERCIO_TT_INV_BOLSAS", Texto.numero(p.bolsas))
  if p.banco then
    partes = partes .. ", " .. relleno("COMERCIO_TT_INV_BANCO", Texto.numero(p.banco))
  else -- nil = ese banco no se ha visto: se dice, para que no parezca que tiene 0
    partes = partes .. ", " .. etiqueta("COMERCIO_TT_INV_SIN_BANCO")
  end
  local conCorreo = (p.correo or 0) > 0
  if conCorreo then
    partes = partes .. ", " .. relleno("COMERCIO_TT_INV_CORREO", Texto.numero(p.correo))
  end
  local t = p.tsm
  if type(t) ~= "table" then
    return partes
  end
  for i = #partesTSM, 1, -1 do
    partesTSM[i] = nil
  end
  local hora, vistas = nil, 1 -- vistas: las partes que enseña la fila (las bolsas siempre)
  for i = 1, #PARTES_TSM do
    local parte = PARTES_TSM[i]
    local h = t[parte[1]]
    local enLaFila = parte[1] == "bolsas" or (parte[1] == "banco" and p.banco ~= nil) or (parte[1] == "correo" and conCorreo)
    if enLaFila and parte[1] ~= "bolsas" then
      vistas = vistas + 1
    end
    if enLaFila and type(h) == "number" then
      partesTSM[#partesTSM + 1] = etiqueta(parte[2])
      hora = math.max(hora or h, h)
    end
  end
  if not hora then
    return partes
  end
  if #partesTSM == vistas then
    return partes .. "; " .. relleno("COMERCIO_TT_INV_TSM", fechaTSM(hora))
  end
  return partes .. "; " .. relleno("COMERCIO_TT_INV_TSM_PARTES", nombresTexto(partesTSM), fechaTSM(hora))
end

-- F2: la frase de lo que el total no cuenta, o nil: «Sin contar: 1 banco, 2 buzones y los personajes sin entrar» (los
-- bancos y buzones sin abrir y los personajes con los que no se ha entrado), con las partes que toquen (falta = el tercer
-- valor de InventarioCuenta.de).
local partesFalta = {} -- fija: se vacía en cada frase
local function sinContar(falta)
  if type(falta) ~= "table" then
    return nil
  end
  for i = #partesFalta, 1, -1 do
    partesFalta[i] = nil
  end
  local bancos, correos = tonumber(falta.bancos) or 0, tonumber(falta.correos) or 0
  if bancos == 1 then
    partesFalta[#partesFalta + 1] = etiqueta("COMERCIO_TT_INV_FALTA_BANCO")
  elseif bancos > 1 then
    partesFalta[#partesFalta + 1] = relleno("COMERCIO_TT_INV_FALTA_BANCOS", Texto.numero(bancos))
  end
  if correos == 1 then
    partesFalta[#partesFalta + 1] = etiqueta("COMERCIO_TT_INV_FALTA_CORREO")
  elseif correos > 1 then
    partesFalta[#partesFalta + 1] = relleno("COMERCIO_TT_INV_FALTA_CORREOS", Texto.numero(correos))
  end
  if falta.bancoCuenta then -- F2b: el banco de cuenta aún sin ver
    partesFalta[#partesFalta + 1] = etiqueta("COMERCIO_TT_INV_FALTA_CUENTA")
  end
  if falta.sinEntrar then
    partesFalta[#partesFalta + 1] = etiqueta("COMERCIO_TT_INV_FALTA_PJ")
  end
  if #partesFalta == 0 then
    return nil
  end
  -- F2b: con el banco de cuenta pueden ser 4 partes, y nombresTexto deja «y 1 más» a partir de la cuarta: aquí van todas.
  local k = #partesFalta
  local lista = k > 3 and relleno("COMERCIO_TT_OPS_Y", table.concat(partesFalta, ", ", 1, k - 1), partesFalta[k])
    or nombresTexto(partesFalta)
  return relleno("COMERCIO_TT_INV_SIN_CONTAR", lista)
end

---------------------------------------------------------------------------------------------------
-- Componer: qué líneas salen y con qué texto (la única forma de escribirlas)
---------------------------------------------------------------------------------------------------

-- La salida y los datos de la composición en curso, el título que espera a su primera línea y la ruta del grupo (se pide
-- una sola vez). Son de la composición en curso: componer los vuelve a poner al empezar.
local S, D = nil, nil
local pendiente = nil
local rutaPedida, ruta = false, nil
-- Task 40: con opciones.todas (el ejemplo de Ajustes › Tooltip) salen todas las líneas que tienen datos y las apagadas
-- llegan a la salida con `apagada`; `gris` las marca todas así (con «Activar» en No). El tooltip de verdad los deja en false.
local todas, gris = false, false

local function ponerTitulo()
  if pendiente then
    local clave = pendiente
    pendiente = nil
    S:titulo(clave)
  end
end

local function doble(izq, der, color, apagada)
  ponerTitulo()
  S:doble(izq, der, color, apagada or gris)
end

local function sola(texto, color, apagada)
  ponerTitulo()
  S:linea(texto, color, apagada or gris)
end

local function rutaDe()
  if not rutaPedida then
    rutaPedida = true
    local r = D.grupo()
    ruta = type(r) == "string" and r ~= "" and r or nil
  end
  return ruta
end

local function algunaOperacion(g)
  for i = 1, #LINEAS_OPS do
    if sale(g, LINEAS_OPS[i].clave) then
      return true
    end
  end
  return false
end

-- F6: cada parte del tooltip compone por su cuenta. Un fallo en una (una función que falta en una instalación mezclada, un
-- dato roto) solo deja sin salir lo que le quedaba a esa parte: las demás salen igual. Se apunta con Comercio.anotarFallo
-- una sola vez por parte y sesión («tooltip: <parte>: <error>»), como las fórmulas rotas. Antes, el pcall de Tooltip.anadir
-- cortaba todo lo que venía detrás del fallo (en el juego: el inventario y todo el apartado de la Subasta).
local partesRotas = {} -- [parte] = true: ya apuntada en esta sesión
local function parte(nombre, fn, g)
  local ok, err = pcall(fn, g)
  if ok then
    return
  end
  Momento.appDicha, Momento.edadApp = false, nil
  if not partesRotas[nombre] then
    partesRotas[nombre] = true
    local comercio = rawget(SNF, "Comercio")
    if recibe(comercio, "anotarFallo") then
      pcall(comercio.anotarFallo, "tooltip", nombre .. ": " .. tostring(err))
    end
  end
end

-- Apartado «Información general»: grupo y operaciones, precio de venta al vendedor, fuentes propias e inventario (F6: cada
-- una es una parte; el título espera a la primera línea que salga, sea de la que sea).
local function generalGrupo(g)
  local verGrupo = sale(g, "grupo")
  if (verGrupo or todas or algunaOperacion(g)) and rutaDe() then
    if verGrupo or todas then
      local sep = SNF.Arbol and SNF.Arbol.SEP or "`"
      doble(etiqueta("COMERCIO_TT_GRUPO"), (string.gsub(ruta, sep, " \226\128\186 ")), nil, not verGrupo)
    end
    for i = 1, #LINEAS_OPS do
      local o = LINEAS_OPS[i]
      local ver = sale(g, o.clave)
      if ver or todas then
        local nombres = D.operaciones(o.tipo)
        if type(nombres) == "table" and nombres[1] then
          doble(etiqueta(o.texto), o.primera and nombres[1] or nombresTexto(nombres), nil, not ver)
        end
      end
    end
  end
end

local function generalVenta(g)
  local verVenta = sale(g, "vendedor")
  if verVenta or todas then
    local venta = D.venta()
    if venta then
      doble(etiqueta("COMERCIO_TT_PRECIO_VENTA"), dinero(venta), nil, not verVenta)
    end
  end
end

local function generalFuentes(g)
  -- Con `todas`, cada fuente propia que existe (por nombre), encendida o no; si no, solo las encendidas.
  local fuentes = todas and Tooltip.lineasFuentes() or fuentesEncendidas(g)
  for i = 1, #fuentes do
    local nombre = todas and fuentes[i].nombre or fuentes[i]
    local valor, fallo = D.fuente(nombre)
    local c = not fallo and cobreDe(valor)
    if c then
      doble(relleno("COMERCIO_TT_FUENTE", nombre), dinero(c), nil, todas and not sale(g, fuentes[i].clave))
    end
  end
end

local function generalInventario(g)
  local completo = sale(g, "inventario")
  local verTotal = completo or sale(g, "inventarioSimple")
  if verTotal or todas then
    local total, lista, falta, deCuenta = D.inventario()
    lista = type(lista) == "table" and lista or nil
    deCuenta = type(deCuenta) == "number" and deCuenta > 0 and deCuenta or nil
    if (lista or deCuenta) and type(total) == "number" and total > 0 then
      local conCorreo = false
      for i = 1, lista and #lista or 0 do
        conCorreo = conCorreo or (lista[i].correo or 0) > 0
      end
      doble(etiqueta("COMERCIO_TT_INVENTARIO"), relleno(conCorreo and "COMERCIO_TT_INV_TOTAL_CORREO" or "COMERCIO_TT_INV_TOTAL",
        Texto.numero(total)), nil, not verTotal)
      for i = 1, (completo or todas) and lista and #lista or 0 do
        local p = lista[i]
        doble("  " .. p.nombre, relleno("COMERCIO_TT_INV_PJ", Texto.numero(p.total), partesInventario(p)), colorClase(p.clase),
          not completo)
      end
      -- F2b: el banco de cuenta, una fila sola después de los personajes (no es de ninguno).
      if deCuenta and (completo or todas) then
        doble("  " .. etiqueta("COMERCIO_TT_INV_CUENTA"), Texto.numero(deCuenta), COLORES.blanco, not completo)
      end
      -- F2: debajo, en gris, lo que el total no cuenta (los bancos y buzones sin abrir y los personajes sin entrar).
      local frase = sinContar(falta)
      if frase then
        sola(frase, COLORES.gris, not verTotal)
      end
    end
  end
end

local function componerGeneral(g)
  pendiente = "COMERCIO_TT_SNF"
  parte("grupo", generalGrupo, g)
  parte("venta", generalVenta, g)
  parte("fuentes", generalFuentes, g)
  parte("inventario", generalInventario, g)
  pendiente = nil
end

-- Apartado «Subasta». Sin ningún dato para el objeto no sale el apartado; y si ni siquiera hay tabla de precios (la app aún
-- no los ha dejado, o falta abrir la subasta), sale una sola línea gris que lo explica. Con todas las líneas del apartado
-- apagadas no se pide nada (ni se cargan los precios). F1: unidades, subastas y compra mínima son de una sola foto, y la
-- primera de esas líneas que sale dice cuál y de cuándo.
local function componerSubasta(g)
  local verVenta, verMinima = sale(g, "aLaVenta"), sale(g, "minima")
  local verTendencia = sale(g, "mercado")
  local verMercado = verTendencia or sale(g, "mercadoSolo")
  local verSalen, verParte = sale(g, "salen"), sale(g, "parte")
  local reglaEncendida = sale(g, "regla")
  local verRegla = (reglaEncendida or todas) and rutaDe() -- sin grupo no hay regla que mirar
  if not (verVenta or verMinima or verMercado or verSalen or verParte or verRegla or todas) then
    return
  end
  local precio, cantidad, subastas, edad, p, fuente, edadDeLaApp = D.subasta()
  -- F6: la subasta abierta es de otra casa que la app no trae (la neutral): nada de la app (ni valor de mercado, ni lo que
  -- sale, ni la parte: serían de la casa de la Horda) y una línea gris que lo dice, en el sitio del valor de mercado.
  local sinCasa = (verMercado or verSalen or verParte or todas) and recibe(D, "casaSinDatos") and D.casaSinDatos() or nil
  if sinCasa then
    p = nil
  end
  if not (precio or fuente) then
    if cantidad then -- sin tabla de precios
      sola(etiqueta("COMERCIO_TT_SIN_PRECIOS"), COLORES.gris)
    elseif sinCasa then
      pendiente = "COMERCIO_TT_SUBASTA"
      sola(relleno("COMERCIO_TT_SIN_DATOS_CASA", Momento.casa(sinCasa)), COLORES.gris)
      pendiente = nil
    end
    return
  end
  if not Momento.CLAVES[fuente] then
    fuente, edadDeLaApp = "app", edadDeLaApp or edad -- unos datos sin fuente son los de la app, como antes de F1
  end
  cantidad = tonumber(cantidad) or 0
  pendiente = "COMERCIO_TT_SUBASTA"
  local dicha = false -- ya ha salido una línea que dice de qué foto es y de cuándo
  if verVenta or todas then
    local texto = relleno(cantidad == 1 and "COMERCIO_TT_UNIDAD" or "COMERCIO_TT_UNIDADES", Texto.numero(cantidad))
    if subastas and subastas > 0 then
      texto = texto .. ", " .. relleno(subastas == 1 and "COMERCIO_TT_N_SUBASTA" or "COMERCIO_TT_N_SUBASTAS", Texto.numero(subastas))
    end
    doble(etiqueta("COMERCIO_TT_A_LA_VENTA"), texto .. " " .. Momento.texto(fuente, edad), nil, not verVenta)
    dicha = true
  end
  -- Con 0 unidades el precio es el de la última vez que se vio el objeto (la app lo sigue trayendo): esa subasta ya no
  -- existe, así que ni compra mínima ni veredicto de la regla. Una lista sin ninguna que se pueda comprar (las tuyas o solo
  -- pujas) no tiene compra mínima.
  local hay = cantidad > 0 and precio ~= nil
  if (verMinima or todas) and hay then
    local texto = dinero(precio)
    if not dicha then
      texto, dicha = texto .. " " .. Momento.texto(fuente, edad), true
    end
    doble(etiqueta("COMERCIO_TT_MINIMA"), texto, nil, not verMinima)
  end
  -- Lo de la app (valor de mercado, lo que sale y la parte) dice una vez de cuándo es, en la primera de sus líneas que salga,
  -- salvo que la foto de arriba ya sea la app y lo haya dicho.
  Momento.appDicha, Momento.edadApp = fuente == "app" and dicha, edadDeLaApp
  local conApp = Momento.conApp
  if sinCasa then
    sola(relleno("COMERCIO_TT_SIN_DATOS_CASA", Momento.casa(sinCasa)), COLORES.gris)
  end
  -- Con `todas` y las dos de la pareja apagadas, la línea sale (apagada) con la tendencia, como sale por defecto.
  if (verMercado or todas) and p and type(p.normal) == "number" then
    local conTendencia = verTendencia or not verMercado
    local tendencia = conTendencia and p.conTendencia and tendenciaTexto(p.tendencia) or nil
    doble(etiqueta("COMERCIO_TT_MERCADO"), conApp(tendencia and (tendencia .. " " .. dinero(p.normal)) or dinero(p.normal)),
      nil, not verMercado)
  end
  -- F5: el nombre depende de si es una mercancía (ya sin las cancelaciones de encima del más barato intacto) o un objeto
  -- suelto (todo lo que sale antes de tiempo, con el aviso de que no son ventas). El número, entero y con separador.
  local mercancia = p and p.mercancia == true
  if (verSalen or todas) and p and type(p.vendidosDia) == "number" then
    local salen = Texto.entero(p.vendidosDia)
    if mercancia and p.vendidosDia > 0 then -- F9p: un tope; las cancelaciones de lo más barato se cuelan
      salen = p.vendidosDia < 0.5 and relleno("COMERCIO_TT_MENOS_DE", Texto.entero(1)) or relleno("COMERCIO_TT_HASTA", salen)
    end
    doble(etiqueta(mercancia and "COMERCIO_TT_SALEN" or "COMERCIO_TT_SALEN_SUELTO"), conApp(salen), nil, not verSalen)
    if not mercancia then
      sola(etiqueta("COMERCIO_TT_NO_SON_VENTAS"), COLORES.gris, not verSalen)
    end
  end
  if (verParte or todas) and p and type(p.ritmo) == "number" then
    doble(etiqueta(mercancia and "COMERCIO_TT_PARTE" or "COMERCIO_TT_PARTE_SUELTO"),
      conApp(relleno("COMERCIO_TT_PARTE_VALOR", Texto.numero(floor(p.ritmo * 100 + 0.5)))), nil, not verParte)
  end
  if verRegla and hay then
    local buena, sinConfirmar = D.regla() -- ojo: «false» es un resultado (no cumple la regla), no «sin regla»
    if buena ~= nil then
      -- F1: dice con qué mínimo la ha mirado (el de la foto de arriba). F9p: una mercancía aprobada no sale como prueba de venta.
      local veredicto = not buena and "COMERCIO_TT_NO_CUMPLE" or sinConfirmar and "COMERCIO_TT_BUENA_SIN_CONFIRMAR" or "COMERCIO_TT_BUENA"
      sola(relleno("COMERCIO_TT_REGLA_CON", etiqueta(veredicto), dinero(precio)),
        not buena and COLORES.rojo or sinConfirmar and COLORES.amarillo or COLORES.verde, not reglaEncendida)
    end
  end
  Momento.appDicha, Momento.edadApp = false, nil
  pendiente = nil
end

-- El precio máximo de la operación de Compras o de Sniper del grupo (si la tiene y la fórmula no falla).
local function lineaMaximo(tipo, texto, apagada)
  local nombres = D.operaciones(tipo)
  if type(nombres) == "table" and nombres[1] then
    local valor, fallo = D.maximo(tipo)
    local c = not fallo and cobreDe(valor)
    if c then
      doble(etiqueta(texto), dinero(c), nil, apagada)
    end
  end
end

-- Apartado «Operaciones»: los precios de la primera operación de Subasta, su máximo a publicar y los máximos de Compras y de
-- Sniper. Una fórmula que falla deja su línea sin salir (los datos ya lo han apuntado).
local function componerOperaciones(g)
  local verPrecios, verTope = sale(g, "preciosSubasta"), sale(g, "maximoPublicar")
  local verCompras, verSniper = sale(g, "maximoCompras"), sale(g, "maximoSniper")
  if not (verPrecios or verTope or verCompras or verSniper or todas) or not rutaDe() then
    return
  end
  pendiente = "COMERCIO_TT_OPERACIONES"
  if verPrecios or verTope or todas then
    local nombres = D.operaciones("subasta")
    if type(nombres) == "table" and nombres[1] then
      if verPrecios or todas then
        local minimo, f1 = D.campoSubasta("precioMinimo")
        local normal, f2 = D.campoSubasta("precioNormal")
        local maximo, f3 = D.campoSubasta("precioMaximo")
        if not (f1 or f2 or f3) then
          doble(etiqueta("COMERCIO_TT_PRECIOS_OP"), precioOraya(minimo) .. " / " .. precioOraya(normal) .. " / " .. precioOraya(maximo),
            nil, not verPrecios)
        end
      end
      if verTope or todas then
        local tope, fallo = D.campoSubasta("tope")
        local n = not fallo and cobreDe(tope)
        if n then
          doble(etiqueta("COMERCIO_TT_MAX_PUBLICAR"), Texto.numero(n), nil, not verTope) -- unidades, no dinero
        end
      end
    end
  end
  if verCompras or todas then
    lineaMaximo("compras", "COMERCIO_TT_MAX_COMPRAS", not verCompras)
  end
  if verSniper or todas then
    lineaMaximo("sniper", "COMERCIO_TT_MAX_SNIPER", not verSniper)
  end
  pendiente = nil
end

-- Al final, si se enciende: el número del objeto y el de su icono.
local function componerIds(g)
  local ver = sale(g, "ids")
  if not (ver or todas) then
    return
  end
  local item, icono = D.ids()
  if item then
    doble(etiqueta("COMERCIO_TT_ITEMID"), tostring(item), nil, not ver)
    if icono then
      doble(etiqueta("COMERCIO_TT_ICONID"), tostring(icono), nil, not ver)
    end
  end
end

function Tooltip.componer(salida, datos, g, opciones) -- `opciones`: tabla opcional, {formato, todas}
  idioma = L.idioma() -- siempre el del cliente: L.t solo traduce a ese, y ETIQUETAS se guarda por idioma
  local f = type(opciones) == "table" and opciones.formato
  formato = OPCION.formato.vale[f] and f or Tooltip.opcion("formato")
  todas = type(opciones) == "table" and opciones.todas == true
  gris = todas and not Tooltip.activo()
  S, D = salida, datos
  pendiente = nil
  rutaPedida, ruta = false, nil
  if type(g) ~= "table" then
    g = nil
  end
  -- F6: cada apartado por su cuenta (y las partes de «Información general», dentro de componerGeneral): un fallo solo se
  -- lleva lo suyo. El título que un apartado roto deja esperando no pasa al siguiente.
  componerGeneral(g)
  parte("subasta", componerSubasta, g)
  pendiente = nil
  parte("operaciones", componerOperaciones, g)
  pendiente = nil
  parte("ids", componerIds, g)
  pendiente = nil
  S, D = nil, nil
  todas, gris = false, false
end

---------------------------------------------------------------------------------------------------
-- Los datos del ejemplo de Ajustes › Tooltip (Task 40): fijos e inventados, con la misma forma que los reales
---------------------------------------------------------------------------------------------------

-- Nunca del jugador ni de otros: el único personaje es «Personaje de ejemplo» (sin clase: sale en blanco). Las fuentes
-- propias son las del jugador (sus fórmulas, no personas), todas con 10c. Los nombres van en el idioma del cliente.
do
  local nombres = {""} -- la lista de operaciones (una tabla fija: solo cambia el nombre, por si cambia el idioma)
  local personaje = {nombre = "", total = 22, bolsas = 5, banco = 17}
  local lista = {personaje}
  local falta = {bancos = 1, correos = 1, sinEntrar = true} -- F2: «Sin contar: 1 banco, 1 buzón y los personajes sin entrar»
  -- F5: una mercancía (2447 es una hierba), con un número que lleva separador de miles: «2.054».
  local precios = {normal = 100000, tendencia = 12, conTendencia = true, vendidosDia = 2054.4, ritmo = 0.61, mercancia = true}
  local campos = {precioMinimo = 50000, precioNormal = 120000, precioMaximo = 500000, tope = 40}
  local maximos = {compras = 80000, sniper = 60000}
  Tooltip.EJEMPLO = {
    grupo = function()
      local sep = SNF.Arbol and SNF.Arbol.SEP or "`"
      return L.t("COMERCIO_TT_EJ_GRUPO") .. sep .. L.t("COMERCIO_TT_EJ_SUBGRUPO") -- «Ejemplo › Hierbas»
    end,
    operaciones = function()
      nombres[1] = L.t("COMERCIO_TT_EJ_OPERACION") -- «#Ejemplo», en los 7 tipos
      return nombres
    end,
    venta = function() return 8 end,
    fuente = function() return 10 end,
    inventario = function()
      personaje.nombre = L.t("COMERCIO_TT_EJ_PERSONAJE")
      return 23, lista, falta, 1 -- F2b: 22 del personaje y 1 del banco de cuenta
    end,
    subasta = function() return 95000, 400, 37, 17 * 60, precios, "app", 17 * 60 end, -- mínima 9g 50s, de la app de hace 17 min
    campoSubasta = function(campo) return campos[campo] end,
    maximo = function(tipo) return maximos[tipo] end,
    regla = function() return true, true end, -- F9p: es una mercancía: «El precio cumple tu regla · rotación sin confirmar»
    casaSinDatos = function() return nil end, -- F6: la subasta del ejemplo es la propia (la app tiene sus datos)
    ids = function() return 2447, 133939 end,
  }
end

---------------------------------------------------------------------------------------------------
-- Los datos reales de un objeto (solo búsquedas directas; una tabla fija que cada tooltip vuelve a preparar)
---------------------------------------------------------------------------------------------------

local DATOS = {}
local actual = nil -- el objeto
local grupoPedido, grupoActual = false, nil
local groupReader
local opsPedidas = {} -- [tipo] = {nombres} | false, del objeto actual
local subastaPedida = false
local s1, s2, s3, s4, s5, s6, s7 = nil, nil, nil, nil, nil, nil, nil -- lo de DATOS.subasta()
local apuntadas = {} -- [lugar .. fórmula] = true: cada fórmula rota se apunta una sola vez por sesión

function Tooltip.datos(item)
  actual = item
  groupReader = nil
  grupoPedido, grupoActual = false, nil
  for tipo in pairs(opsPedidas) do
    opsPedidas[tipo] = nil
  end
  subastaPedida = false
  s1, s2, s3, s4, s5, s6, s7 = nil, nil, nil, nil, nil, nil, nil
  return DATOS
end

-- Una fórmula rota: se apunta (una vez) y la línea no sale.
local function apuntar(lugar, texto, fallo)
  local clave = lugar .. "\0" .. tostring(texto)
  if apuntadas[clave] then
    return
  end
  apuntadas[clave] = true
  local formulas = rawget(SNF, "Formulas")
  local ok, mensaje = pcall(formulas.mensaje, fallo)
  pcall(SNF.Comercio.anotarFallo, "tooltip", lugar .. " (" .. tostring(texto) .. "): " .. tostring(ok and mensaje or fallo))
end

local function formula(lugar, texto)
  if type(texto) ~= "string" or string.find(texto, "^%s*$") then
    return nil
  end
  local valor, fallo = SNF.Formulas.valor(texto, actual)
  if fallo then
    apuntar(lugar, texto, fallo)
    return nil, fallo
  end
  return valor
end

-- El grupo del objeto en el árbol (su ruta), o false si no está en ninguno. Se busca una sola vez por tooltip: lo usan
-- las líneas de grupo y operaciones, las de los precios de las operaciones y la de la regla de compra.
function DATOS.grupo()
  if not grupoPedido then
    grupoPedido = true
    local arbol = rawget(SNF, "Arbol")
    local r = type(arbol) == "table" and arbol.objeto("i:" .. actual) or nil
    grupoActual = type(r) == "string" and r ~= "" and r or false
  end
  return grupoActual
end

function DATOS.operaciones(tipo)
  local r = DATOS.grupo()
  if not r then
    return nil
  end
  local nombres = opsPedidas[tipo]
  if nombres == nil then
    local operaciones = rawget(SNF, "Operaciones")
    groupReader = groupReader or (recibe(operaciones, "groupReader") and operaciones.groupReader())
      or (recibe(operaciones, "deGrupo") and operaciones.deGrupo)
    nombres = groupReader and groupReader(r, tipo) or false
    opsPedidas[tipo] = nombres
  end
  return nombres or nil
end

-- El precio de venta al vendedor que da el cliente, en cobre (nil si no se vende).
function DATOS.venta()
  local espacio = rawget(_G, "C_Item")
  local info = type(espacio) == "table" and rawget(espacio, "GetItemInfo") or rawget(_G, "GetItemInfo")
  if type(info) ~= "function" then
    return nil
  end
  local ok, _, _, _, _, _, _, _, _, _, _, precio = pcall(info, actual)
  if ok and type(precio) == "number" and not API.esSecreto(precio) and precio > 0 then
    return precio
  end
  return nil
end

-- Por el mismo camino que cualquier fórmula (Formulas.valor lee las fuentes con Formulas.fuentes(): nombres en
-- minúsculas, también los guardados de antes con mayúsculas). Una fuente propia que ya no existe no da nada ni se apunta:
-- su ajuste se queda guardado y no estorba. Una rota se apunta una vez por nombre y fórmula.
function DATOS.fuente(nombre)
  local valor, fallo = SNF.Formulas.valor(nombre, actual)
  if not fallo then
    return valor
  end
  if type(fallo) == "table" and fallo.c == "fuente" and type(fallo.a) == "string" and string.lower(fallo.a) == nombre then
    return nil -- ya no existe
  end
  apuntar("fuente «" .. nombre .. "»", SNF.Formulas.fuentes()[nombre] or nombre, fallo)
  return nil, fallo
end

function DATOS.inventario()
  local inv = rawget(SNF, "InventarioCuenta")
  if not recibe(inv, "de") then
    return nil
  end
  return inv.de(actual)
end

-- El dato de la subasta (F1): la foto que elige SNF.Subasta.foto (ia/subasta.lua), la misma para el tooltip, la lista de
-- ofertas, la IA y las reglas de compra: la lista de Navegar, si no la foto de la app y, solo si la app no trae el objeto, el
-- escaneo. Da precio (la compra mínima), cantidad (unidades), subastas (si esa foto las trae), edad en segundos (nil si no
-- se sabe), los precios de la app (para el valor de mercado y lo que sale), la fuente ("lista" | "app" | "escaneo") y la
-- edad de la foto de la app. Sin ningún dato, nil. Los precios de la app (SNF.Precios.de usa la casa de la subasta abierta
-- o, sin ella, la que calcula Precios.consultar) se piden antes: Precios.consultar gasta la ranura de la hora anterior y lo
-- apunta.
local function datosDeSubasta(item)
  local subasta = rawget(SNF, "Subasta")
  if not recibe(subasta, "foto") then
    return nil
  end
  return subasta.foto(item)
end

-- F6: con la subasta abierta, su facción si la app no tiene datos de su casa (la neutral): SNF.Precios.sinDatos.
function DATOS.casaSinDatos()
  local precios = rawget(SNF, "Precios")
  return recibe(precios, "sinDatos") and precios.sinDatos() or nil
end

function DATOS.subasta()
  if not subastaPedida then
    subastaPedida = true
    SNF.Precios.consultar()
    s1, s2, s3, s4, s5, s6, s7 = datosDeSubasta(actual)
  end
  if not s6 then
    return nil, SNF.Precios.edad() == nil
  end
  return s1, s2, s3, s4, s5, s6, s7
end

function DATOS.campoSubasta(campo)
  local nombres = DATOS.operaciones("subasta")
  local nombre = nombres and nombres[1]
  if not nombre then
    return nil
  end
  return formula("subasta «" .. nombre .. "» " .. campo, SNF.Operaciones.valor("subasta", nombre, campo))
end

function DATOS.maximo(tipo)
  local nombres = DATOS.operaciones(tipo)
  local nombre = nombres and nombres[1]
  if not nombre then
    return nil
  end
  return formula(tipo .. " «" .. nombre .. "» precioMaximo", SNF.Operaciones.valor(tipo, nombre, "precioMaximo"))
end

function DATOS.regla()
  local reglas = rawget(SNF, "Reglas")
  if not recibe(reglas, "buenaCompra") then
    return nil
  end
  DATOS.subasta()
  if not s1 then
    return nil
  end
  return reglas.buenaCompra(actual, {precio = s1, cantidad = s2}, s5, DATOS.grupo() or nil)
end

function DATOS.ids()
  local icono = API.iconoObjeto(actual)
  if type(icono) ~= "number" or API.esSecreto(icono) then
    icono = nil
  end
  return actual, icono
end

---------------------------------------------------------------------------------------------------
-- La salida que escribe en el tooltip del juego (una tabla fija; `escribirEn` es el tooltip de la llamada en curso)
---------------------------------------------------------------------------------------------------

local escribirEn = nil
local SALIDA = {}

function SALIDA:titulo(clave)
  local c = COLORES.amarillo
  escribirEn:AddLine(etiqueta(clave), c[1], c[2], c[3])
end

function SALIDA:doble(izq, der, color)
  local g, b = color or COLORES.gris, COLORES.blanco
  escribirEn:AddDoubleLine(izq, der, g[1], g[2], g[3], b[1], b[2], b[3])
end

function SALIDA:linea(texto, color)
  local c = color or COLORES.gris
  escribirEn:AddLine(texto, c[1], c[2], c[3])
end

---------------------------------------------------------------------------------------------------
-- Ayudas del enganche
---------------------------------------------------------------------------------------------------

local marcados = setmetatable({}, {__mode = "k"}) -- [tooltip] = {item, lineas}

local function numLineas(tooltip)
  if recibe(tooltip, "NumLines") then
    local n = tooltip:NumLines()
    return type(n) == "number" and n or 0
  end
  return 0
end

-- Solo en GameTooltip e ItemRefTooltip: no en los tooltips de comparar ni en los de otros addons.
local function esNuestro(tooltip)
  return tooltip == rawget(_G, "GameTooltip") or tooltip == rawget(_G, "ItemRefTooltip")
end

local function esSecreto(valor)
  return API.esSecreto(valor)
end

-- Un tooltip prohibido (o que falla al preguntarlo) no se toca.
local function prohibido(tooltip)
  if recibe(tooltip, "IsForbidden") then
    local ok, si = pcall(tooltip.IsForbidden, tooltip)
    return not ok or si and true or false
  end
  return false
end

-- El objeto que enseña el tooltip, por el enlace que da GetItem() (nil si no enseña un objeto).
local function objetoDe(tooltip)
  if not recibe(tooltip, "GetItem") then
    return nil
  end
  local ok, _, enlace = pcall(tooltip.GetItem, tooltip)
  if not ok or type(enlace) ~= "string" or esSecreto(enlace) then
    return nil
  end
  return tonumber(string.match(enlace, "item:(%d+)"))
end

local ultimo = nil -- el último objeto mirado (Tooltip.ultimoMirado)

function Tooltip.ultimoMirado()
  return ultimo
end

---------------------------------------------------------------------------------------------------
-- El tooltip aparte (Task 38: «Insertarlas en el tooltip del juego» sin marcar) y la tecla
---------------------------------------------------------------------------------------------------

-- Un aparte por tooltip del juego, creado la primera vez que hace falta: SnetForeverTooltipAparte para GameTooltip y
-- SnetForeverTooltipAparteRef para ItemRefTooltip. Son tooltips normales del juego (GameTooltipTemplate) hijos de UIParent.
local apartes = {} -- [tooltip del juego] = aparte

-- F8: lo de poner al día un tooltip abierto (ver la cabecera), colgado de una tabla: el archivo no gasta más locales de
-- primer nivel. Las funciones están después de Tooltip.anadir.
local Repinte = {
  ESPERA = 0.5, -- segundos entre dos repintados de un mismo tooltip
  enSitio = false, -- hay un repintado en curso: el aparte no se reancla y vaciar el tooltip no suelta su ancho
  vaciado = false, -- ronda 3: durante ese repintado ha llegado OnTooltipCleared (se ha rehecho de verdad)
  minimos = setmetatable({}, {__mode = "k"}), -- [marco] = el ancho mínimo que tenía antes de sostener el suyo
  esperando = setmetatable({}, {__mode = "k"}), -- [tooltip] = true: ya tiene un temporizador en marcha
  filas = setmetatable({}, {__mode = "k"}), -- [tooltip] = {dueno, lineas}: lo que añade la fila. Solo en memoria
}

-- Devuelve al marco el ancho mínimo que tenía antes de que se lo sostuviéramos.
function Repinte.soltar(marco)
  local minimo = Repinte.minimos[marco]
  if minimo ~= nil then
    Repinte.minimos[marco] = nil
    if recibe(marco, "SetMinimumWidth") then
      marco:SetMinimumWidth(minimo)
    end
  end
end

-- El tooltip deja de enseñar lo que enseñaba: fuera las líneas de la fila y el ancho sostenido, también el de su aparte.
function Repinte.olvidar(tooltip)
  Repinte.filas[tooltip] = nil
  Repinte.soltar(tooltip)
  local a = apartes[tooltip]
  if a then
    Repinte.soltar(a)
  end
end

local function aparteDe(juego)
  local a = apartes[juego]
  if not a then
    local nombre = juego == rawget(_G, "GameTooltip") and "SnetForeverTooltipAparte" or "SnetForeverTooltipAparteRef"
    a = CreateFrame("GameTooltip", nombre, UIParent, "GameTooltipTemplate")
    SNF.WindowSizing.register(a, nombre, false)
    apartes[juego] = a
  end
  return a
end

local function esconderAparte(juego)
  local a = apartes[juego]
  if a then
    Repinte.soltar(a)
    if a:IsShown() then
      a:Hide()
    end
  end
end

esconderApartes = function()
  for juego in pairs(apartes) do
    esconderAparte(juego)
  end
end

-- Pegado por arriba al borde de abajo del tooltip del juego; si así se sale de la pantalla por abajo, pegado por abajo a su
-- borde de arriba. Se mide después de enseñarlo (Show le da su alto). Las medidas se pasan a la escala de la pantalla.
local function anclar(aparte, juego)
  aparte:ClearAllPoints()
  local encima = false
  local abajo, alto = juego:GetBottom(), aparte:GetHeight()
  if type(abajo) == "number" and type(alto) == "number" and not esSecreto(abajo) and not esSecreto(alto) then
    local ej = recibe(juego, "GetEffectiveScale") and juego:GetEffectiveScale() or 1
    local ea = recibe(aparte, "GetEffectiveScale") and aparte:GetEffectiveScale() or 1
    encima = abajo * ej - alto * ea < 0
  end
  if encima then
    aparte:SetPoint("BOTTOMLEFT", juego, "TOPLEFT", 0, 0)
  else
    aparte:SetPoint("TOPLEFT", juego, "BOTTOMLEFT", 0, 0)
  end
end

-- La tecla elegida («mayus», «ctrl» o «alt»): si está pulsada. Sin la función del juego (no debería pasar), como pulsada:
-- mejor enseñar las líneas que no enseñarlas nunca.
local PULSADA = {mayus = "IsShiftKeyDown", ctrl = "IsControlKeyDown", alt = "IsAltKeyDown"}
local function pulsada(tecla)
  local f = rawget(_G, PULSADA[tecla] or "")
  if type(f) ~= "function" then
    return true
  end
  local ok, v = pcall(f)
  return not ok or (v and true or false)
end

-- Con «ninguna», siempre; con una tecla, solo si está pulsada.
local function dejaLaTecla(tecla)
  return tecla == "ninguna" or pulsada(tecla)
end

local OPCIONES_REALES = {formato = "texto"} -- lo que el enganche pasa a componer (una tabla fija)

---------------------------------------------------------------------------------------------------
-- Añadir nuestras líneas
---------------------------------------------------------------------------------------------------

-- Escribe nuestros apartados en el aparte de `juego`, lo enseña y lo ancla; sin ninguna línea, lo esconde. SetOwner lo
-- vacía antes (y ClearLines, por si acaso), así que nunca lleva líneas repetidas. F8: con `enSitio` y el aparte a la vista,
-- solo se cambian sus líneas: sin SetOwner (podría esconderlo) y sin volver a anclarlo.
local function componerEnAparte(juego, item, enSitio)
  local aparte = aparteDe(juego)
  enSitio = enSitio and aparte:IsShown()
  if not enSitio then
    aparte:SetOwner(juego, "ANCHOR_NONE")
  end
  aparte:ClearLines()
  escribirEn = aparte
  local ok, err = pcall(Tooltip.componer, SALIDA, Tooltip.datos(item), lineasGuardadas(), OPCIONES_REALES)
  escribirEn = nil
  if not ok then
    error(err, 0)
  end
  if numLineas(aparte) > 0 then
    aparte:Show()
    if not enSitio then
      anclar(aparte, juego)
    end
  else
    aparte:Hide()
  end
end

function Tooltip.anadir(tooltip, item, data)
  if type(tooltip) ~= "table" or type(item) ~= "number" or not esNuestro(tooltip) or not Tooltip.activo() then
    return
  end
  ultimo = item
  if prohibido(tooltip) then
    return -- ni el del juego ni su aparte
  end
  local previa = marcados[tooltip]
  if previa and previa.item ~= item then
    Repinte.olvidar(tooltip) -- F8: otro objeto sin haber vaciado el tooltip
  end
  local incrustado, formatoGuardado, tecla = opcionesGuardadas()
  -- Task 39: la tecla solo vale para GameTooltip (pasar el ratón). ItemRefTooltip, un enlace del chat abierto con un clic,
  -- se lee con calma y no se puede tener la tecla pulsada a la vez: lleva nuestras líneas siempre que «Activar» lo deje.
  if tooltip ~= rawget(_G, "ItemRefTooltip") and not dejaLaTecla(tecla) then
    -- Con una tecla elegida y sin pulsar, nada (el marco de la tecla lo rehace al pulsarla). Ronda 1: si había un aparte a
    -- la vista se esconde aquí, sin fiarse de que RefreshData lance OnTooltipCleared, y se borra la marca para que al
    -- volver a pulsar se enseñe otra vez. Insertado, la marca se queda: las líneas que ya hubiera no se pueden quitar.
    if not incrustado then
      esconderAparte(tooltip)
      marcados[tooltip] = nil
    end
    return
  end
  local marca = marcados[tooltip]
  if marca and marca.item == item and numLineas(tooltip) >= marca.lineas then
    return -- ya están
  end
  marcados[tooltip] = nil
  -- Un fallo aquí solo se apunta: no pasa por el cortafuegos del comercio (que apagaría el escaneo y la compra con la subasta
  -- abierta) ni toca el tooltip del juego. Se marca igual, para no repetir el fallo en cada llamada.
  local ok, err
  local lineasAntes = numLineas(tooltip)
  OPCIONES_REALES.formato = formatoGuardado
  if incrustado then
    escribirEn = tooltip
    ok, err = pcall(Tooltip.componer, SALIDA, Tooltip.datos(item), lineasGuardadas(), OPCIONES_REALES)
  else
    ok, err = pcall(componerEnAparte, tooltip, item, Repinte.enSitio) -- el del juego no lleva ninguna línea nuestra
  end
  escribirEn = nil
  pendiente, S, D = nil, nil, nil -- por si un fallo dejó la composición a medias
  todas, gris = false, false
  if not ok then
    pcall(SNF.Comercio.anotarFallo, "tooltip", err)
  end
  marcados[tooltip] = Repinte.marca(tooltip, item, lineasAntes)
end

---------------------------------------------------------------------------------------------------
-- F8: poner al día un tooltip abierto cuando llega la lista de su objeto (las reglas, en la cabecera)
---------------------------------------------------------------------------------------------------

-- La última lista entera del objeto (una tabla nueva por lista: Busqueda.vivo), o nil.
function Repinte.vivo(item)
  local busqueda = rawget(SNF, "Busqueda")
  if not recibe(busqueda, "vivo") then
    return nil
  end
  local ok, v = pcall(busqueda.vivo, item)
  return ok and v or nil
end

-- Los números de la foto de ahora que el tooltip enseña con estos ajustes: unidades, subastas y compra mínima (nil los que
-- no se ven). Las fuentes propias y los precios de las operaciones pueden usar la mínima y las unidades de la foto. Ronda 1:
-- la marca y la comparación salen de aquí, las dos de la misma foto (la ya pedida o SNF.Subasta.foto); sin ningún número a
-- la vista no se pide nada, y nunca se llama a Precios.consultar: un tooltip sin líneas de la subasta no carga los precios.
-- Antes de llamarla, Tooltip.datos(item).
function Repinte.numeros(g, item)
  local formulas = fuentesEncendidas(g)[1] ~= nil or ((sale(g, "preciosSubasta") or sale(g, "maximoPublicar")
    or sale(g, "maximoCompras") or sale(g, "maximoSniper")) and DATOS.grupo() and true)
  local verVenta = formulas or sale(g, "aLaVenta")
  local verPrecio = formulas or sale(g, "minima") or (sale(g, "regla") and DATOS.grupo() and true)
  if not (verVenta or verPrecio) then
    return nil, nil, nil
  end
  local precio, cantidad, subastas, fuente, _
  if subastaPedida then
    precio, cantidad, subastas, fuente = s1, s2, s3, s6
  else
    precio, cantidad, subastas, _, _, fuente = datosDeSubasta(item)
  end
  if not (precio or fuente) then
    return nil, nil, nil
  end
  cantidad = tonumber(cantidad) or 0
  return verVenta and cantidad or nil, verVenta and subastas or nil, verPrecio and cantidad > 0 and precio or nil
end

function Repinte.apuntar(marca, item)
  marca.vivo = Repinte.vivo(item)
  marca.cantidad, marca.subastas, marca.precio = Repinte.numeros(lineasGuardadas(), item)
end

-- La marca de «ya están» de un tooltip recién compuesto: también con qué lista y qué números, y cuándo se ha pintado.
function Repinte.marca(tooltip, item, lineasAntes)
  local lineas = numLineas(tooltip)
  -- total: las líneas que sabemos que tiene (con las de la fila, Tooltip.ponerFila). Con más, las ha puesto otro addon.
  local marca = {item = item, lineas = lineas, total = lineas, propias = lineas - lineasAntes, hora = GetTime()}
  pcall(Repinte.apuntar, marca, item) -- un fallo aquí no rompe el tooltip: solo se queda sin ponerse al día
  return marca
end

function Tooltip.ponerFila(tooltip, dueno, lineas, anadidas)
  if type(lineas) ~= "function" then
    Repinte.filas[tooltip] = nil
    return
  end
  local n = tonumber(anadidas) or 0
  local fila = {dueno = dueno, lineas = lineas}
  Repinte.filas[tooltip] = fila
  Repinte.apuntarFila(tooltip, fila, n)
  local marca = marcados[tooltip]
  if marca then
    marca.total = marca.lineas + n
  end
end

function Tooltip.renovarFila(tooltip, dueno, lineas)
  local f = Repinte.filas[tooltip]
  if f and f.dueno == dueno and type(lineas) == "function" then
    f.lineas = lineas
  end
end

-- El texto de la izquierda de la línea i, o nil si no se puede leer (no existe, no tiene texto o es secreto).
function Repinte.textoLinea(tooltip, i)
  local nombre = recibe(tooltip, "GetName") and tooltip:GetName()
  local f = type(nombre) == "string" and rawget(_G, nombre .. "TextLeft" .. i)
  if not recibe(f, "GetText") then
    return nil
  end
  local ok, t = pcall(f.GetText, f)
  if not ok or type(t) ~= "string" or esSecreto(t) then
    return nil
  end
  return t
end

-- Apunta dónde están las n últimas líneas del tooltip (las que acaba de poner la fila) y sus textos. Solo en memoria, con la
-- fila: se olvidan con ella. Sin poder leer alguna, fila.textos = nil.
function Repinte.apuntarFila(tooltip, fila, n)
  fila.desde = numLineas(tooltip) - n + 1
  local textos = {}
  for i = 1, n do
    local t = Repinte.textoLinea(tooltip, fila.desde + i - 1)
    if not t then
      textos = nil
      break
    end
    textos[i] = t
  end
  fila.textos = textos
end

-- Si las líneas de la fila siguen en su sitio: true (todas), false (falta alguna, otra ocupa su sitio o la fila no tenía
-- ninguna) o nil (no se puede saber: alguna no se lee). Se comparan todas: si solo coincide la primera, no son las suyas.
function Repinte.filaSigue(tooltip, fila)
  local textos = fila.textos
  if not textos then
    return nil
  end
  if #textos == 0 then
    return false
  end
  local hay, duda = numLineas(tooltip), false
  for i = 1, #textos do
    local pos = fila.desde + i - 1
    if pos > hay then
      return false
    end
    local t = Repinte.textoLinea(tooltip, pos)
    if t == nil then
      duda = true
    elseif t ~= textos[i] then
      return false
    end
  end
  if duda then
    return nil
  end
  return true
end

-- La fila dueña del tooltip tiene líneas que no se pueden leer: rehacerlo podría perderlas o repetirlas.
function Repinte.filaIlegible(tooltip)
  local fila = Repinte.filaDe(tooltip)
  return fila ~= nil and Repinte.filaSigue(tooltip, fila) == nil
end

-- Lo que añade la fila dueña del tooltip; si el tooltip ya es de otro, se olvida.
function Repinte.filaDe(tooltip)
  local f = Repinte.filas[tooltip]
  if f and recibe(tooltip, "GetOwner") and tooltip:GetOwner() == f.dueno then
    return f
  end
  Repinte.filas[tooltip] = nil
  return nil
end

function Repinte.ancho(marco)
  if not recibe(marco, "GetWidth") then
    return nil
  end
  local w = marco:GetWidth()
  return type(w) == "number" and not esSecreto(w) and w or nil
end

-- Show recalcula el tamaño con las líneas nuevas. Si así encoge, se le pone de mínimo el ancho de antes. No se sabe si el
-- mínimo del cliente cuenta el margen del tooltip: se mide y, si se ha pasado, se corrige. Todo antes de que se dibuje.
function Repinte.sostenerAncho(marco, antes)
  marco:Show()
  if not antes or antes <= 0 or not recibe(marco, "SetMinimumWidth") then
    return
  end
  local ahora = Repinte.ancho(marco)
  if not ahora or ahora >= antes - 0.5 then
    return
  end
  if Repinte.minimos[marco] == nil then
    Repinte.minimos[marco] = recibe(marco, "GetMinimumWidth") and tonumber(marco:GetMinimumWidth()) or 0
  end
  marco:SetMinimumWidth(antes)
  marco:Show()
  ahora = Repinte.ancho(marco)
  if ahora and ahora > antes + 0.5 then
    marco:SetMinimumWidth(math.max(0, antes - (ahora - antes)))
    marco:Show()
  end
end

-- El repintado, en una sola llamada. Insertado, con RefreshData: la marca se queda si había líneas nuestras, para que un
-- cliente que no vacíe el tooltip no las repita (si lo vacía, hay menos líneas que en la marca y el enganche las vuelve a
-- poner). Las líneas de la fila se vuelven a poner, antes del Show, solo si ya no están (ronda 3: ha llegado OnTooltipCleared
-- o sus textos no siguen en su sitio; un RefreshData que no vacía las deja donde estaban). Con el aparte, solo se rehace el
-- aparte. Si el enganche no ha llegado a componer, se deja la marca de antes.
function Repinte.pintar(tooltip, marca, vivo, incrustado)
  local marco = incrustado and tooltip or apartes[tooltip]
  local antes = marco and Repinte.ancho(marco)
  local fila = incrustado and Repinte.filaDe(tooltip) or nil
  marca.vivo, marca.hora = vivo, GetTime()
  Repinte.enSitio, Repinte.vaciado = true, false
  local ok, err
  if incrustado then
    if marca.propias == 0 then
      marcados[tooltip] = nil
    end
    ok, err = pcall(tooltip.RefreshData, tooltip)
  else
    marcados[tooltip] = nil
    ok, err = pcall(Tooltip.anadir, tooltip, marca.item)
  end
  Repinte.enSitio = false
  local nueva = marcados[tooltip]
  if not nueva then
    marcados[tooltip] = marca
  end
  local recien = nueva and nueva ~= marca and nueva or nil
  local sigue = false
  if fila and not Repinte.vaciado then
    sigue = Repinte.filaSigue(tooltip, fila) -- nil: no se sabe, y en la duda no se añaden
  end
  if fila and sigue == false then
    local sinFila = numLineas(tooltip)
    local bien, fallo = pcall(fila.lineas, tooltip)
    if not bien then
      pcall(SNF.Comercio.anotarFallo, "tooltip", fallo)
    end
    local puestas = numLineas(tooltip) - sinFila
    Repinte.apuntarFila(tooltip, fila, puestas)
    if recien then
      recien.total = recien.lineas + puestas
    else
      marca.total = numLineas(tooltip) -- vaciado sin lanzar el enganche: las que hay ahora
    end
  end
  if not ok then
    error(err, 0)
  end
  marco = incrustado and tooltip or apartes[tooltip]
  if marco and marco:IsShown() then
    Repinte.sostenerAncho(marco, antes)
  end
end

-- Mira un tooltip: si a la vista enseña un objeto con una lista nueva y otros números, lo repinta o espera su turno.
function Repinte.mirar(tooltip)
  local marca = marcados[tooltip]
  if not marca then
    return
  end
  local vivo = Repinte.vivo(marca.item)
  if not vivo or vivo == marca.vivo then
    return
  end
  if not Tooltip.activo() or prohibido(tooltip) or not tooltip:IsVisible() or objetoDe(tooltip) ~= marca.item then
    return
  end
  local incrustado, _, tecla = opcionesGuardadas()
  if tooltip ~= rawget(_G, "ItemRefTooltip") and not dejaLaTecla(tecla) then
    return -- con una tecla elegida y sin pulsar no sale nada (la tecla no cuenta en el del enlace, como en Tooltip.anadir)
  end
  Tooltip.datos(marca.item)
  local cantidad, subastas, precio = Repinte.numeros(lineasGuardadas(), marca.item)
  if (cantidad == marca.cantidad and subastas == marca.subastas and precio == marca.precio)
    or (incrustado and (not recibe(tooltip, "RefreshData") or numLineas(tooltip) > marca.total
      or Repinte.filaIlegible(tooltip))) then
    marca.vivo = vivo -- nada que cambiar, o no se puede sin rehacerlo: se verá la próxima vez que se abra
    return
  end
  local falta = marca.hora + Repinte.ESPERA - GetTime()
  if falta > 0.000001 then
    if not Repinte.esperando[tooltip] then
      Repinte.esperando[tooltip] = true
      C_Timer.After(falta, function()
        Repinte.esperando[tooltip] = nil
        Repinte.seguro(tooltip) -- vuelve a mirarlo todo: puede haberse ido el ratón o haber llegado otra lista
      end)
    end
    return
  end
  Repinte.pintar(tooltip, marca, vivo, incrustado)
end

-- Un fallo solo se apunta: no pasa por el cortafuegos del comercio ni toca el tooltip del juego.
function Repinte.seguro(tooltip)
  local ok, err = pcall(Repinte.mirar, tooltip)
  if not ok then
    pcall(SNF.Comercio.anotarFallo, "tooltip", err)
  end
end

-- SNF_COMERCIO_BUSQUEDA llega también por páginas y cambios de estado: Repinte.mirar sale enseguida si la tabla de la lista
-- de su objeto es la misma.
function Repinte.alAviso()
  Repinte.seguro(rawget(_G, "GameTooltip"))
  Repinte.seguro(rawget(_G, "ItemRefTooltip"))
end

-- La tecla (MODIFIER_STATE_CHANGED, un evento: nada en OnUpdate). Solo hace algo si cambió el estado de la tecla elegida
-- (pulsar Ctrl con Mayús elegida no cuenta, ni la otra Mayús con la primera pulsada) y el GameTooltip se ve con un objeto.
-- Un solo cambio por cada vez que se pulsa o se suelta, nunca repetido:
--   · si el juego tiene GameTooltip:RefreshData(), se rehace el tooltip entero y el enganche decide con la tecla como esté
--     (con ella, nuestras líneas o el aparte; sin ella, nada);
--   · si no, en modo aparte, al pulsar se enseña el aparte y al soltar se esconde;
--   · si no, insertado: al pulsar se añaden las líneas (una sola vez: la marca de «ya están» lo impide) y se vuelve a
--     llamar a GameTooltip:Show(), que recalcula el tamaño y el fondo con las líneas nuevas; al soltar SE
--     QUEDAN hasta que el juego rehaga el tooltip (al mover el ratón a otra cosa). Quitar líneas del tooltip del juego no
--     se puede sin rehacerlo, y rehacerlo sin RefreshData no está en nuestra mano.
local teclaAntes = false

local function alCambiarTecla()
  local tecla = Tooltip.opcion("tecla")
  if tecla == "ninguna" then
    return
  end
  local ahora = pulsada(tecla)
  if ahora == teclaAntes then
    return
  end
  teclaAntes = ahora
  local juego = rawget(_G, "GameTooltip")
  if not Tooltip.activo() or type(juego) ~= "table" or not juego:IsVisible() or prohibido(juego) then
    return
  end
  local item = objetoDe(juego)
  if not item then
    return
  end
  if recibe(juego, "RefreshData") then
    juego:RefreshData()
  elseif ahora then
    local antes = numLineas(juego)
    Tooltip.anadir(juego, item) -- insertado o aparte
    if numLineas(juego) > antes then
      juego:Show() -- ronda 1: con líneas nuevas en un tooltip a la vista, Show recalcula su tamaño y su fondo
    end
  elseif not Tooltip.opcion("incrustado") then
    esconderAparte(juego)
    marcados[juego] = nil -- para que al volver a pulsar se vuelva a enseñar
  end
end

-- Lo que una opción cambia en el momento: volver a insertar esconde los apartes; otra tecla parte de su estado de ahora.
despuesDeOpcion = function(clave)
  if clave == "incrustado" then
    -- Ronda 1: la marca de «ya están» era del otro modo; sin borrarla, el tooltip a la vista no se rehace en el nuevo.
    for tooltip in pairs(marcados) do
      marcados[tooltip] = nil
    end
    if Tooltip.opcion("incrustado") then
      esconderApartes()
    end
  elseif clave == "tecla" then
    local tecla = Tooltip.opcion("tecla")
    teclaAntes = tecla ~= "ninguna" and pulsada(tecla)
  end
end

---------------------------------------------------------------------------------------------------
-- El enganche
---------------------------------------------------------------------------------------------------

-- Motor moderno: llamada posterior de TooltipDataProcessor para los objetos; data.id es el id del objeto.
local function alMostrarDatos(tooltip, data)
  local id = type(data) == "table" and data.id or nil
  if type(id) == "number" and not esSecreto(id) then
    Tooltip.anadir(tooltip, id, data)
  end
end

-- Respaldo: OnTooltipSetItem; el id sale del enlace que da GetItem().
local function alMostrarObjeto(tooltip)
  if type(tooltip) ~= "table" or not tooltip.GetItem then
    return
  end
  Tooltip.anadir(tooltip, objetoDe(tooltip))
end

-- Vaciar o esconder el tooltip del juego borra la marca y esconde su aparte.
local function alLimpiar(tooltip)
  marcados[tooltip] = nil
  esconderAparte(tooltip)
  if Repinte.enSitio then -- F8: RefreshData de un repintado vacía el tooltip, pero sigue el mismo objeto
    Repinte.vaciado = true
  else
    Repinte.olvidar(tooltip)
  end
end

local function alEsconder(tooltip)
  marcados[tooltip] = nil
  esconderAparte(tooltip)
  Repinte.olvidar(tooltip)
end

local function instalar()
  local procesador = rawget(_G, "TooltipDataProcessor")
  local enum = rawget(_G, "Enum")
  local tipos = type(enum) == "table" and enum.TooltipDataType or nil
  local tipoObjeto = type(tipos) == "table" and tipos.Item or nil
  local moderno = type(procesador) == "table" and type(procesador.AddTooltipPostCall) == "function" and tipoObjeto ~= nil
  if moderno then
    procesador.AddTooltipPostCall(tipoObjeto, alMostrarDatos)
  end
  for _, nombre in ipairs({"GameTooltip", "ItemRefTooltip"}) do
    local tooltip = rawget(_G, nombre)
    if type(tooltip) == "table" and tooltip.HookScript then
      if not tooltip.HasScript or tooltip:HasScript("OnTooltipCleared") then
        tooltip:HookScript("OnTooltipCleared", alLimpiar)
      end
      if not tooltip.HasScript or tooltip:HasScript("OnHide") then
        tooltip:HookScript("OnHide", alEsconder)
      end
      if not moderno and (not tooltip.HasScript or tooltip:HasScript("OnTooltipSetItem")) then
        tooltip:HookScript("OnTooltipSetItem", alMostrarObjeto)
      end
    end
  end
  -- El marco de la tecla: escucha MODIFIER_STATE_CHANGED (sin OnUpdate). Un fallo dentro solo se apunta.
  local marco = CreateFrame("Frame")
  Tooltip.marcoTecla = marco
  marco:SetScript("OnEvent", function()
    local ok, err = pcall(alCambiarTecla)
    if not ok then
      pcall(SNF.Comercio.anotarFallo, "tooltip", err)
    end
  end)
  pcall(marco.RegisterEvent, marco, "MODIFIER_STATE_CHANGED")
  SNF.escuchar("SNF_COMERCIO_BUSQUEDA", Repinte.alAviso) -- F8: la lista nueva del objeto del tooltip abierto
end

instalar()
