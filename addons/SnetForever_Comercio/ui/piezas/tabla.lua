-- SnetForever: piezas de la ventana principal (parte 1): tabla con cabecera, columna ✓ (marcar), columna ⋮ (menú de
-- columnas), orden con línea amarilla y barra de totales, con el aspecto de TSM. Aguanta listas de miles de filas
-- (11.630 objetos) porque solo existen las filas que se ven.
--
-- Amplía SNF.Piezas (lo crea ui/piezas/botones.lua, que va antes en el .toc). Es la pieza VISUAL: de dónde salen las filas
-- (el escaneo, el inventario...) es cosa de quien la usa. NO es ui/comercio_tabla.lua (la tabla de la subasta, con otro
-- estilo): no comparten nada.
--
-- Piezas.tabla(padre, opciones) -> t
--                  Un marco (el que se coloca y se mide con SetPoint/SetSize; también vale opciones.ancho y opciones.alto)
--                  con la tabla dentro. De arriba abajo: la cabecera (22 px), las filas y, si hay opciones.totales, la barra
--                  de totales (22 px). Opciones:
--                  - columnas = {{clave, titulo, ancho | flex, justificado, valor(fila), pintar?(celda, fila)}}
--                      clave       texto único de la columna (con ella se recuerda qué columna está escondida u ordenada).
--                      titulo      lo que dice la cabecera, tal cual (sin pasarlo a mayúsculas).
--                      ancho       píxeles fijos (60 si no se dice ni ancho ni flex).
--                      flex        peso (true = 1): las columnas flex se reparten, según su peso, el ancho que sobra. Si
--                                  una columna lleva ancho y flex, vale flex. Si cambia el ancho de la tabla
--                                  (OnSizeChanged) se recolocan.
--                      justificado "LEFT" (por defecto), "CENTER" o "RIGHT": vale para la cabecera y para las celdas.
--                      valor(fila) el valor de la celda. Es lo que se enseña (texto o número) y lo que sirve para ordenar:
--                                  un número se ordena como número y un texto sin fijarse en mayúsculas ni tildes. nil
--                                  se enseña vacío y va siempre al final, ordenes hacia arriba o hacia abajo. Una columna
--                                  sin valor no se puede ordenar (salvo que haya alOrdenar).
--                      pintar(celda, fila) (opcional) se llama después de poner el texto de valor(fila), para cambiarlo
--                                  (dinero, colores, iconos). La celda es un marco con .texto (el FontString); lo que
--                                  se le añada se queda en la celda, que se reutiliza: pintar tiene que dejar bien
--                                  todas las filas (no basta con tocar solo algunas). El color del texto se restablece
--                                  antes de cada llamada.
--                  - marcar = bool: columna ✓ a la izquierda con una casilla por fila. La ✓ de la cabecera marca toda la
--                    lista o, si ya está toda marcada, la desmarca.
--                  - casillaDiscreta = bool (con marcar; Task 36, como las filas de TSM en op-04): la casilla de una fila sin
--                    marcar no se pinta, pero su zona sigue ahí y pulsarla marca. Marcada sale amarilla, como siempre. Con
--                    el ratón sobre la fila sale hueca si Piezas.interno.CASILLA_HUECA_AL_PASAR es true (el único sitio
--                    donde se decide; sin confirmar en TSM). La hueca va con la luz de la tabla (ver abajo), no con cada
--                    OnEnter/OnLeave: sale una vez al entrar en la fila, se va una vez al salir, no cambia al pasar de la
--                    fila a su casilla y no sale ni se va al temblar en un borde. La ✓ de la cabecera no cambia.
--                  - elegir = bool: SIN casillas: se elige pulsando la fila (fondo «elegida»). Clic: solo esa. Ctrl+clic: la añade
--                    o la quita sin tocar las demás. Mayús+clic: elige el tramo desde la última pulsada hasta esta, en el orden
--                    en que se ven (con Ctrl+Mayús se suma a lo que había). Lee Ctrl y Mayús con IsControlKeyDown() e
--                    IsShiftKeyDown(). Una fila con `seccion = true` no se elige: al pulsarla se llama a
--                    alPulsarSeccion(fila) (plegar o desplegar es cosa de quien usa la pieza: vuelve a llamar a :poner). Lo
--                    elegido va en las mismas marcas: :marcadas() lo devuelve, los totales lo reciben y desaparece si la
--                    fila deja de estar en la lista. No se mezcla con marcar.
--                  - objeto = fn(fila) -> enlace?, item?: B3s, con elegir, una lista de objetos, como en TSM. El clic solo
--                    suma o quita esa fila (sin tocar las demás); Alt+clic elige el tramo desde la última pulsada (con
--                    IsAltKeyDown()); Mayús+clic y Ctrl+clic (las teclas del jugador: IsModifiedClick) llevan el objeto
--                    que da objeto(fila) al chat o al probador con UIComercio.clicModificado y no cambian lo elegido (una
--                    fila sin enlace todavía, con tecla, no hace nada). Las secciones, igual que sin objeto.
--                  - alPulsarSeccion(fila): ver elegir.
--                  - alEntrar(fila, marcoFila) / alSalir(marcoFila): la fila del ratón (la que lleva el fondo del ratón, ver
--                    abajo) pasa a ser esta, o deja de haber ninguna (T1a: el tooltip del objeto; qué se enseña lo decide quien
--                    usa la pieza). Van con la luz y no con cada OnEnter/OnLeave (ronda 1, sin parpadeos): al cruzar de una fila a
--                    otra solo se llama a alEntrar con la nueva (sin alSalir entre medias), y temblando en un borde no se llama.
--                    La fila y su casilla se cuentan juntas. Si la lista se repinta con el ratón parado encima (rueda, :poner,
--                    :irA), se vuelve a llamar a alEntrar con la fila que queda en ese sitio si es otra (por clave), y a alSalir
--                    si ya no queda ninguna.
--                  El fondo del ratón (el resalte) va con Piezas.interno.nuevaLuz (T1a, ronda 1, sin parpadeos): sale enseguida al
--                  entrar en la tabla, pero solo pasa a otra fila (o se apaga) cuando el ratón lleva Piezas.interno.ESPERA_LUZ s
--                  quieto en ella (o fuera). Al cruzar de una fila a otra nunca hay un fotograma sin ninguna encendida, y si el
--                  ratón tiembla en un borde (entre dos filas, o en el de la última) ningún fondo sale y se va.
--                  - titulo = {texto, copiar?}: la cabecera pasa a ser una barra de título (texto claro a la izquierda y, si hay
--                    copiar, un icono «copiar» a la derecha que llama a copiar()); no salen los títulos de columna. Quedan
--                    t.textoTitulo (en su propio marco t.marcoTitulo, por encima de todo lo de la cabecera) y t.botonCopiar; :ponerTitulo(texto) lo cambia.
--                  - sinCabecera = bool: sin cabecera ni título: las filas empiezan arriba del todo.
--                  - borde = bool: recuadro fino («borde», 1 px) alrededor de toda la tabla (t.bordes).
--                  - letra = número: tamaño de letra de las celdas (por defecto el de «tabla», 12). Solo afecta a esta tabla.
--                  - menu = bool: columna ⋮ a la derecha. Pulsarla abre la lista de columnas (el mismo desplegable de varios
--                    de Piezas.desplegable, anclado a la ⋮ y sin caja visible): cada columna con ✓ se ve; pulsar una la
--                    esconde o la enseña. La última columna que queda no se puede esconder.
--                  - menuIzquierda = bool (con menu): la ⋮ va a la izquierda del todo, delante de la ✓, con los tres puntos
--                    en vertical del atlas («puntos», el ⋮ de la tabla de la subasta), como la cabecera del resumen de
--                    Operaciones de TSM. La casilla de cada fila sigue bajo la ✓.
--                  - recordar = {get = fn() -> {clave = true}, set = fn({clave = true})}: dónde se guardan las columnas
--                    escondidas. Quien usa la tabla decide el sitio (sus ajustes, otra tabla...): la pieza no escribe en los
--                    ajustes del addon por su cuenta. get se lee al crear la tabla y en :refrescar(); set se llama (con una
--                    copia nueva) cada vez que el jugador esconde o enseña una columna. Sin recordar, lo escondido solo
--                    dura lo que dure la tabla.
--                  - orden = {clave, asc}: columna por la que sale ordenada al principio (asc = true: de menos a más).
--                    Pulsar una cabecera ordena por ella (la primera vez, ascendente; la segunda, al revés; otra columna
--                    empieza otra vez ascendente). La columna ordenada lleva el fondo «pestanaElegida» y una línea de 2 px
--                    «acento» encima. El orden es estable: con valores iguales se conserva el orden en que llegaron las filas.
--                  - alOrdenar(clave, asc): si se da, la pieza NO ordena: solo marca la columna y avisa (al pulsar una
--                    cabecera, no al llamar a :poner). Quien la use ordena él y vuelve a llamar a t:poner. Sin alOrdenar la
--                    pieza ordena sola con valor(fila), una vez por pulsación y en cada :poner; la lista que se le pasa no
--                    se toca (se ordena una copia).
--                  - totales(filas, marcadas) -> texto|nil: la barra de abajo. filas es la lista que se enseña (en el orden de
--                    pantalla; no la cambies) y marcadas una copia de las marcas {clave = true}. Se vuelve a pedir al poner
--                    filas y al marcar, nunca al desplazar ni al ordenar. nil (o vacío) esconde la barra. Aspecto: fondo
--                    «secundario» con borde, la letra en negrita y blanca y los números en «acento» (amarillo). Si el texto
--                    trae códigos |c…|r (por ejemplo Tema.dinero), iconos |T…|t o enlaces |H…|h…|h, esos trozos se respetan
--                    tal cual y se colorean los números del resto del texto.
--                  Las filas son tablas del que usa la pieza. Cada fila lleva una `clave` (única y estable, texto o número):
--                  con ella se guardan las marcas, así que sobreviven a ordenar, desplazar y volver a poner la lista. Una fila
--                  sin clave no se puede marcar (no sale su casilla) y se avisa una sola vez por geterrorhandler.
--                  Métodos:
--                  :poner(filas)     guarda la lista (no crea nada por fila), quita las marcas de las filas que ya no están,
--                                    ordena si toca y repinta. Es lo único que hay que llamar cuando cambian los datos. Con
--                                    orden puesto (y sin alOrdenar) reordena la lista ENTERA cada vez: con miles de filas no
--                                    hay que llamarlo en cada fotograma, solo cuando los datos cambian de verdad.
--                  :marcadas()       copia {clave = true} de lo marcado (con elegir, de lo elegido).
--                  :pulsarFila(f)    lo que hace el clic en una fila de pantalla f (con elegir).
--                  :marcarTodo(si)   si = true marca toda la lista (también lo que no se ve); si no, desmarca todo.
--                  :fila(i)          la fila i de la lista tal como se ve (con el orden puesto), o nil.
--                  :irA(i)           pone la fila i (de la lista tal como se ve) arriba del todo y repinta, o lo más cerca que se
--                                    pueda sin pasar del final; un valor fuera de rango se queda en el principio o en el final.
--                                    No ordena ni crea marcos. Es el «ir a» de verdad: la rueda va de fila en fila.
--                  :cuantas()        cuántas filas hay en la lista.
--                  :capacidad()      cuántas filas enteras caben a la vez (nil si la tabla aún no tiene alto).
--                  :orden()          clave, asc de la columna ordenada (nil si no hay).
--                  :refrescar()      vuelve a leer recordar.get() y repinta.
--                  Aspecto: filas de Tema.ALTO_FILA px (B3r: 22, siguen a la letra; antes 18,5 con Roboto 11) con la letra
--                  «tabla» del tema sobre el fondo «hundido»; al pasar el ratón la fila se aclara. Cabecera «secundario» con
--                  los títulos en la letra «cabecera» del tema (B3r; antes Roboto Medium de 10 px) y separadores finos. La rueda mueve una fila por muesca y sale una barra de 4 px a la derecha si no
--                  cabe todo.
--                  Virtualizado: solo existen las filas que caben más una, y se reutilizan al desplazar (desplazar solo
--                  reasigna esas filas; no ordena ni recorre la lista). Ordenar se hace al pulsar la cabecera.
--                  Partes: .cabecera, .fondoCabecera, .cabeceras[clave] (cada una con .texto, .fondo y .linea), .botonMarcar y
--                  .botonMenu (con .icono), .menuColumnas (el desplegable), .cuerpo, .fondoCuerpo, .filas (cada una con
--                  .clave, .fila, .celdas[clave] y .casilla, con su .caja: lo que se pinta), .barra y .marcoBarra, .barraTotales y .textoTotales (solo con
--                  totales). .ordenaciones cuenta cuántas veces se ha ordenado (para las pruebas).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
SNF.Piezas = SNF.Piezas or {}
local Piezas = SNF.Piezas
local Tema = SNF.Tema

local pintar = Piezas.interno.pintar
local plana = Piezas.interno.plana
local colorTexto = Piezas.interno.colorTexto
local botonBase = Piezas.interno.botonBase
local ponerBarra = Piezas.interno.ponerBarra
local sinTildes = Piezas.interno.sinTildes

local ALTO_FILA = Tema.ALTO_FILA -- B3r: sigue a la letra «tabla» (antes 18,5, la medida de TSM con Roboto 11)
local ALTO_CAB = 22
local ALTO_TOT = 22
local ANCHO_MARCAR = 24 -- columna ✓
local ANCHO_MENU = 22 -- columna ⋮
local ANCHO_DEFECTO = 60
local RELLENO = 6 -- del borde de la celda al texto
local ICONO = 12
local CAJA = 11 -- lado de la casilla de una fila
local ALTO_LINEA = 2 -- línea de la columna ordenada
local ANCHO_MENU_LISTA = 170
local NIVEL_TITULO = 10 -- niveles por encima de la cabecera a los que va el texto del título

-- Llama a fn protegida y devuelve su resultado (nil si falla: el error va a geterrorhandler()).
local function llamar(fn, ...)
  if not fn then
    return nil
  end
  local n, args = select("#", ...), {...}
  local ok, resultado = xpcall(function()
    return fn(unpack(args, 1, n))
  end, geterrorhandler())
  if ok then
    return resultado
  end
  return nil
end

-- En el texto de totales, los números van en acento (amarillo) y lo demás se queda en el color de la letra de la barra. El
-- texto se recorre por trozos: los códigos |c…|r (color, con todo lo que llevan dentro), |T…|t (icono) y |H…|h…|h (enlace) se
-- dejan tal cual; los números del resto se colorean.
local function numerosEnAcento(texto)
  local antes, despues = "|cff" .. Tema.hex("acento"), "|r"
  local function colorear(trozo)
    local coloreado = string.gsub(trozo, "%d[%d%.,]*", function(numero)
      local cola = string.match(numero, "[%.,]*$") -- el punto o la coma de al final no son del número
      return antes .. string.sub(numero, 1, #numero - #cola) .. despues .. cola
    end)
    return coloreado
  end
  local salida, p, n = {}, 1, #texto
  while p <= n do
    local barra = string.find(texto, "|", p, true)
    if not barra then
      salida[#salida + 1] = colorear(string.sub(texto, p))
      break
    end
    if barra > p then
      salida[#salida + 1] = colorear(string.sub(texto, p, barra - 1))
    end
    local tipo = string.sub(texto, barra + 1, barra + 1)
    local fin
    if tipo == "c" then
      local _, e = string.find(texto, "|r", barra + 2, true)
      fin = e or n
    elseif tipo == "T" then
      local _, e = string.find(texto, "|t", barra + 2, true)
      fin = e or n
    elseif tipo == "H" then
      -- |Hdatos|h[texto]|h: hasta el |h que cierra el enlace.
      local _, e1 = string.find(texto, "|h", barra + 2, true)
      local e2
      if e1 then
        _, e2 = string.find(texto, "|h", e1 + 1, true)
      end
      fin = e2 or n
    else
      fin = math.min(n, barra + 1)
    end
    salida[#salida + 1] = string.sub(texto, barra, fin)
    p = fin + 1
  end
  return table.concat(salida)
end

-- Lo que se compara al ordenar: números tal cual, textos sin tildes ni mayúsculas, sí/no como 1/0 y nil (o NaN) como «nada».
local function claveDeOrden(v)
  local tipo = type(v)
  if tipo == "number" then
    if v ~= v then
      return nil
    end
    return v
  elseif tipo == "string" then
    return sinTildes(v)
  elseif tipo == "boolean" then
    return v and 1 or 0
  elseif v == nil then
    return nil
  end
  return sinTildes(tostring(v))
end

-- T1a, ronda 1 (sin parpadeos): el fondo del ratón de una tabla, uno por tabla. luz:mover(marco) dice sobre qué fila está ahora
-- el ratón (nil: sobre ninguna). Sin ninguna encendida, la fila se enciende al momento. Si no, el cambio (a otra fila o a
-- ninguna) espera ESPERA_LUZ s y solo se hace si el ratón no se ha movido de fila entre tanto: al temblar en un borde el
-- destino cambia cada fotograma y la luz se queda donde estaba; al cruzar, la fila de antes sigue encendida hasta que se
-- enciende la nueva (nunca un fotograma sin ninguna). luz:apagar() la apaga sin esperar (la fila se esconde, la tabla se
-- esconde) y cancela lo pendiente; si el ratón ya esperaba en otra fila que se ve, la luz pasa a ella directamente.
-- alCambiar(antes, nueva) pinta las dos. alVolver(marco), si se da, se llama cuando el ratón vuelve a la fila que ya está
-- encendida (ronda 2: con dos tablas a la vista, otra pudo quedarse el tooltip entre medias). Nada se enciende en una fila
-- que no se ve (IsVisible). Un C_Timer por cambio pedido, nada en OnUpdate.
Piezas.interno.ESPERA_LUZ = 0.2

-- Task 36: con casillaDiscreta, ¿sale la casilla hueca con el ratón sobre la fila? true: sí (lo que se eligió). false:
-- solo se ve la marcada. Está sin confirmar cómo lo hace TSM: si cambia, se cambia aquí y en nada más.
Piezas.interno.CASILLA_HUECA_AL_PASAR = true

local function seVe(marco)
  local ok, si = pcall(marco.IsVisible, marco)
  return ok and si == true
end

function Piezas.interno.nuevaLuz(alCambiar, alVolver)
  local luz = {encendida = nil, destino = nil, turno = 0}
  local function poner(marco)
    if marco ~= nil and not seVe(marco) then
      marco = nil
    end
    if luz.encendida ~= marco then
      local antes = luz.encendida
      luz.encendida = marco
      alCambiar(antes, marco)
    end
  end
  function luz:mover(marco)
    luz.destino = marco
    luz.turno = luz.turno + 1
    if marco == luz.encendida then
      if marco ~= nil and alVolver then
        alVolver(marco)
      end
      return
    end
    local temporizador = rawget(_G, "C_Timer")
    if luz.encendida == nil or not (temporizador and temporizador.After) then
      poner(marco)
      return
    end
    local turno = luz.turno
    temporizador.After(Piezas.interno.ESPERA_LUZ, function()
      if luz.turno == turno then
        poner(luz.destino)
      end
    end)
  end
  function luz:apagar()
    local destino = luz.destino
    luz.turno = luz.turno + 1
    if destino ~= nil and destino ~= luz.encendida and seVe(destino) then
      poner(destino) -- el ratón ya esperaba en otra fila: la luz pasa a ella (sin apagarse entre medias)
    else
      luz.destino = nil
      poner(nil)
    end
  end
  return luz
end

function Piezas.tabla(padre, opciones)
  opciones = opciones or {}
  local columnas = opciones.columnas or {}
  local porClave = {}
  for i, c in ipairs(columnas) do
    if c.clave == nil then
      error("uso: Piezas.tabla: la columna " .. i .. " no tiene clave", 2)
    end
    porClave[c.clave] = c
  end

  -- Sin cabecera (opciones.sinCabecera) la lista empieza arriba del todo. Con título (opciones.titulo) la cabecera es la
  -- barra de título y no enseña los títulos de columna.
  local altoCab = opciones.sinCabecera and 0 or ALTO_CAB
  local menuIzq = opciones.menu and opciones.menuIzquierda == true
  local xMarcar = menuIzq and ANCHO_MENU or 0 -- dónde empieza la columna ✓
  local conTitulo = type(opciones.titulo) == "table" and not opciones.sinCabecera
  local elegir = opciones.elegir == true

  local t = CreateFrame("Frame", nil, padre)
  if opciones.ancho or opciones.alto then
    t:SetSize(opciones.ancho or 300, opciones.alto or 200)
  end
  t:EnableMouseWheel(true)
  t.filas = {}
  t.cabeceras = {}
  t.ordenaciones = 0

  -- Los datos.
  local crudas = {} -- la lista tal como llegó (nunca se toca)
  local lista = crudas -- la lista que se ve: la misma, o una copia ordenada
  local inicio = 0 -- cuántas filas quedan por encima de la primera que se ve
  local ocultas = {} -- clave de columna -> true
  local marcadas = {} -- clave de fila -> true
  local nMarcadas = 0
  local ancla -- clave de la última fila pulsada (el principio de un tramo con Mayús)
  local ordenClave, ordenAsc
  if type(opciones.orden) == "table" then
    ordenClave, ordenAsc = opciones.orden.clave, opciones.orden.asc ~= false
  end
  local totalesVisible = false
  local avisado = false -- ya se avisó de una fila sin clave
  local pos = {} -- columnas que se ven, con su sitio: {col, x, w}
  local posPorClave = {}
  local anchoCalculado -- el ancho con el que se calculó `pos`

  local asignar -- (más abajo) pone en las filas lo que toca según `inicio`
  local discreta = opciones.marcar and opciones.casillaDiscreta == true
  -- Task 36, casillaDiscreta: la caja de la casilla se pinta si está marcada o si la fila lleva la luz (el ratón). Solo se
  -- toca cuando cambia de verdad (SetShown con el mismo valor no hace nada).
  local function pintarCasilla(f)
    local c = discreta and f.casilla
    if c then
      local ver = c.marcada == true or (f.luz == true and Piezas.interno.CASILLA_HUECA_AL_PASAR == true)
      if c.caja:IsShown() ~= ver then
        c.caja:SetShown(ver)
      end
    end
  end
  -- El fondo del ratón (ver Piezas.interno.nuevaLuz): f.luz dice si la fila lo lleva; una fila elegida ya lleva el suyo.
  -- Con casillaDiscreta, la casilla hueca va con él.
  local function pintarResalte(f)
    f.resalte:SetShown(f.luz == true and not (f.fondoElegida and f.fondoElegida:IsShown()))
    pintarCasilla(f)
  end
  -- El tooltip va con la luz (ronda 1): alEntrar con la fila que se enciende; alSalir solo cuando se apaga sin otra.
  local luz = Piezas.interno.nuevaLuz(function(antes, nueva)
    if antes then
      antes.luz = false
      pintarResalte(antes)
    end
    if nueva then
      nueva.luz = true
      pintarResalte(nueva)
      if nueva.fila and opciones.alEntrar then
        llamar(opciones.alEntrar, nueva.fila, nueva)
      end
    elseif antes then
      llamar(opciones.alSalir, antes)
    end
  end, function(f)
    -- El ratón vuelve a la fila encendida y el tooltip no es suyo (se lo quedó otra tabla): se le vuelve a dar.
    local tt = rawget(_G, "GameTooltip")
    if f.fila and opciones.alEntrar and not (tt and tt:IsShown() and tt:GetOwner() == f) then
      llamar(opciones.alEntrar, f.fila, f)
    end
  end)
  local distribuir -- (más abajo) recoloca las columnas
  local actualizarTotales -- (más abajo)

  ---------------------------------------------------------------------------------------------------
  -- Columnas escondidas (se recuerdan donde diga quien usa la pieza)
  ---------------------------------------------------------------------------------------------------

  local function leerOcultas()
    local r = opciones.recordar
    if not (r and r.get) then
      return
    end
    local guardado = llamar(r.get)
    if type(guardado) ~= "table" then
      return
    end
    local nuevas, escondidas = {}, 0
    for _, c in ipairs(columnas) do
      if guardado[c.clave] then
        nuevas[c.clave] = true
        escondidas = escondidas + 1
      end
    end
    -- Con todo escondido no se vería nada: se enseña todo.
    if escondidas >= #columnas then
      nuevas = {}
    end
    ocultas = nuevas
  end

  local function guardarOcultas()
    local r = opciones.recordar
    if r and r.set then
      local copia = {}
      for k in pairs(ocultas) do
        copia[k] = true
      end
      llamar(r.set, copia)
    end
  end

  -- Esconde (mostrar = false) o enseña una columna. La última que se ve no se esconde.
  local function cambiarColumna(clave, mostrar)
    if not porClave[clave] then
      return
    end
    if mostrar then
      if not ocultas[clave] then
        return
      end
      ocultas[clave] = nil
    else
      if ocultas[clave] then
        return
      end
      local quedan = 0
      for _, c in ipairs(columnas) do
        if c.clave ~= clave and not ocultas[c.clave] then
          quedan = quedan + 1
        end
      end
      if quedan == 0 then
        return
      end
      ocultas[clave] = true
    end
    guardarOcultas()
    distribuir()
    asignar()
  end

  ---------------------------------------------------------------------------------------------------
  -- Marcos de la tabla
  ---------------------------------------------------------------------------------------------------

  local cabecera = CreateFrame("Frame", nil, t)
  cabecera:SetPoint("TOPLEFT", t, "TOPLEFT", 0, 0)
  cabecera:SetPoint("TOPRIGHT", t, "TOPRIGHT", 0, 0)
  cabecera:SetHeight(altoCab)
  if altoCab == 0 then
    cabecera:Hide()
  end
  t.cabecera = cabecera
  t.fondoCabecera = plana(cabecera, "BACKGROUND", 0)
  t.fondoCabecera:SetAllPoints(cabecera)
  pintar(t.fondoCabecera, "secundario")

  -- Las filas van en su propio marco, que recorta la de abajo si asoma a medias.
  local cuerpo = CreateFrame("Frame", nil, t)
  if cuerpo.SetClipsChildren then
    cuerpo:SetClipsChildren(true)
  end
  t.cuerpo = cuerpo
  t.fondoCuerpo = plana(cuerpo, "BACKGROUND", 0)
  t.fondoCuerpo:SetAllPoints(cuerpo)
  pintar(t.fondoCuerpo, "hundido")

  local function anclarCuerpo()
    cuerpo:ClearAllPoints()
    cuerpo:SetPoint("TOPLEFT", t, "TOPLEFT", 0, -altoCab)
    cuerpo:SetPoint("BOTTOMRIGHT", t, "BOTTOMRIGHT", 0, totalesVisible and ALTO_TOT or 0)
  end
  anclarCuerpo()

  -- La barra va en un marco hijo por encima de las filas (como en el árbol y el desplegable).
  local marcoBarra = CreateFrame("Frame", nil, t)
  marcoBarra:SetAllPoints(t)
  marcoBarra:SetFrameLevel(t:GetFrameLevel() + 5)
  t.marcoBarra = marcoBarra
  if opciones.borde then
    t.bordes = Piezas.interno.marcoBorde(marcoBarra, "borde") -- el recuadro fino de siempre, por encima de las filas
  end
  t.barra = plana(marcoBarra, "OVERLAY", 0)
  pintar(t.barra, "apagado")
  t.barra:SetWidth(Piezas.interno.ANCHO_BARRA)
  t.barra:Hide()

  if opciones.totales then
    local b = CreateFrame("Frame", nil, t)
    b:SetPoint("BOTTOMLEFT", t, "BOTTOMLEFT", 0, 0)
    b:SetPoint("BOTTOMRIGHT", t, "BOTTOMRIGHT", 0, 0)
    b:SetHeight(ALTO_TOT)
    Tema.panel(b, "secundario", {borde = true})
    local fs = Tema.letra(b:CreateFontString(nil, "OVERLAY"), "tablaNegrita")
    fs:SetPoint("LEFT", b, "LEFT", 8, 0)
    fs:SetPoint("RIGHT", b, "RIGHT", -8, 0)
    fs:SetJustifyH("LEFT")
    fs:SetWordWrap(false)
    colorTexto(fs, "base")
    b:Hide()
    t.barraTotales, t.textoTotales = b, fs
  end

  ---------------------------------------------------------------------------------------------------
  -- Cabecera: ✓, una por columna y ⋮
  ---------------------------------------------------------------------------------------------------

  -- ¿Está marcada toda la lista? Solo cuentan las filas con clave, y cada clave una vez (basta con que cada una esté marcada).
  local function todasMarcadas()
    if nMarcadas == 0 then
      return false
    end
    for _, fila in ipairs(lista) do
      local k = fila.clave
      if k ~= nil and not marcadas[k] then
        return false
      end
    end
    return true
  end

  local function pintarTilde()
    if t.botonMarcar then
      pintar(t.botonMarcar.icono, todasMarcadas() and "marca" or "apagado")
    end
  end

  -- La columna ordenada lleva fondo y línea; el resto, nada.
  local function pintarCabeceras()
    for _, c in ipairs(columnas) do
      local b = t.cabeceras[c.clave]
      if c.clave == ordenClave then
        b.fondo:Show()
        b.linea:Show()
        colorTexto(b.texto, "texto")
      else
        b.fondo:Hide()
        b.linea:Hide()
        colorTexto(b.texto, "apagado")
      end
    end
  end

  -- Ordena una copia de la lista por la columna: estable, con nil (y NaN) al final. valor(fila) se pide una sola vez por fila.
  local function ordenarLista()
    t.ordenaciones = t.ordenaciones + 1
    local col = ordenClave and porClave[ordenClave]
    if not (col and col.valor) then
      lista = crudas
      return
    end
    local n = #crudas
    local valores, orden = {}, {}
    local ok = xpcall(function()
      for i = 1, n do
        valores[i] = claveDeOrden(col.valor(crudas[i]))
      end
    end, geterrorhandler())
    if not ok then
      lista = crudas -- el error ya se avisó: la lista se queda como llegó
      return
    end
    for i = 1, n do
      orden[i] = i
    end
    local asc = ordenAsc ~= false
    table.sort(orden, function(a, b)
      local va, vb = valores[a], valores[b]
      if va == nil or vb == nil then
        if va == nil and vb == nil then
          return a < b
        end
        return vb == nil -- el que tiene valor va antes que el que no
      end
      if va == vb then
        return a < b -- iguales: el orden en que llegaron
      end
      local ta, tb = type(va), type(vb)
      if ta ~= tb then
        return ta == "number" -- números antes que textos, suba o baje
      end
      if asc then
        return va < vb
      end
      return va > vb
    end)
    local salida = {}
    for k = 1, n do
      salida[k] = crudas[orden[k]]
    end
    lista = salida
  end

  local function reordenar()
    if ordenClave and not opciones.alOrdenar then
      ordenarLista()
    else
      lista = crudas
    end
  end

  local function pulsarCabecera(c)
    if not (c.valor or opciones.alOrdenar) then
      return
    end
    local asc = true
    if ordenClave == c.clave then
      asc = not (ordenAsc ~= false)
    end
    ordenClave, ordenAsc = c.clave, asc
    reordenar()
    pintarCabeceras()
    asignar()
    llamar(opciones.alOrdenar, c.clave, asc)
  end

  for _, c in ipairs(columnas) do
    local b = botonBase(cabecera, function()
      pulsarCabecera(c)
    end)
    b:SetHeight(ALTO_CAB)
    b.fondo = plana(b, "BACKGROUND", 1)
    b.fondo:SetAllPoints(b)
    pintar(b.fondo, "pestanaElegida")
    b.fondo:Hide()
    b.linea = plana(b, "ARTWORK", 1)
    b.linea:SetPoint("TOPLEFT", b, "TOPLEFT", 0, 0)
    b.linea:SetPoint("TOPRIGHT", b, "TOPRIGHT", 0, 0)
    b.linea:SetHeight(ALTO_LINEA)
    pintar(b.linea, "acento")
    b.linea:Hide()
    b.separador = plana(b, "ARTWORK", 0)
    b.separador:SetPoint("RIGHT", b, "RIGHT", 0, 0)
    b.separador:SetSize(1, 12)
    pintar(b.separador, "borde")
    b.texto = Tema.letra(b:CreateFontString(nil, "OVERLAY"), "cabecera")
    b.texto:SetPoint("LEFT", b, "LEFT", RELLENO, 0)
    b.texto:SetPoint("RIGHT", b, "RIGHT", -RELLENO, 0)
    b.texto:SetJustifyH(c.justificado or "LEFT")
    b.texto:SetWordWrap(false)
    b.texto:SetText(c.titulo or "")
    b:SetScript("OnEnter", Piezas.proteger(function(self)
      colorTexto(self.texto, "texto")
    end))
    b:SetScript("OnLeave", Piezas.proteger(function()
      pintarCabeceras()
    end))
    t.cabeceras[c.clave] = b
  end

  -- Un botón de la cabecera que solo lleva un icono: gris, y blanco al pasar el ratón.
  local function botonIcono(nombre, ancho, alPulsar)
    local b = botonBase(cabecera, alPulsar)
    b:SetSize(ancho, ALTO_CAB)
    b.icono = b:CreateTexture(nil, "OVERLAY")
    b.icono:SetSize(ICONO, ICONO)
    b.icono:SetPoint("CENTER", b, "CENTER", 0, 0)
    Tema.icono(b.icono, nombre)
    pintar(b.icono, "apagado")
    return b
  end

  if opciones.marcar then
    local b = botonIcono("tilde", ANCHO_MARCAR, function()
      t:marcarTodo(not todasMarcadas())
    end)
    b:SetPoint("TOPLEFT", cabecera, "TOPLEFT", xMarcar, 0)
    b:SetScript("OnEnter", Piezas.proteger(function(self)
      pintar(self.icono, "texto")
    end))
    b:SetScript("OnLeave", Piezas.proteger(function()
      pintarTilde()
    end))
    Piezas.ayuda(b, opciones.ayudaMarcar or Piezas.ayudaDe("PRINCIPAL_AYUDA_MARCAR"))
    t.botonMarcar = b
  end

  -- Escribe otra vez el texto del título. Al crearse la cabecera mide 0 y la letra propia puede no haber cargado: el cliente no
  -- pinta ese texto. Se sospecha que tampoco repinta un texto igual al que ya tenía, así que se vuelve a escribir pasando antes
  -- por un texto vacío. Está sin confirmar en el juego (principal.lua no escribe antes un texto vacío).
  local textoDelTitulo = conTitulo and opciones.titulo.texto or ""
  -- Task 22, A.1: lo mismo con los títulos de las columnas (en el juego la cabecera del resumen de Operaciones salía sin
  -- ellos): se vuelven a escribir, con el texto que tengan ahora (quien usa la tabla puede haberlo cambiado al cambiar de
  -- idioma), al enseñarse y al cambiar de tamaño. Sigue sin confirmar en el juego, como lo del título.
  local function repintarTitulo()
    if t.textoTitulo then
      t.textoTitulo:SetText("")
      t.textoTitulo:SetText(textoDelTitulo)
    end
    for _, c in ipairs(columnas) do
      local b = t.cabeceras[c.clave]
      local texto = b and b.texto:GetText()
      if texto and texto ~= "" then
        b.texto:SetText("")
        b.texto:SetText(texto)
      end
    end
  end

  if conTitulo then
    -- El texto va en su propio marco, por encima de todo lo que haya en la cabecera: en el cliente un marco hijo (el botón
    -- de copiar, un botón de columna con fondo) se dibuja por encima de las regiones de su padre, y el texto de la
    -- cabecera misma se quedaba debajo. El marco no coge el ratón y solo lleva el texto.
    local marcoTitulo = CreateFrame("Frame", nil, cabecera)
    marcoTitulo:SetAllPoints(cabecera)
    marcoTitulo:SetFrameLevel(cabecera:GetFrameLevel() + NIVEL_TITULO)
    marcoTitulo:EnableMouse(false)
    t.marcoTitulo = marcoTitulo
    local tit = Tema.letra(marcoTitulo:CreateFontString(nil, "OVERLAY"), "tabla", 10)
    tit:SetDrawLayer("OVERLAY", 7)
    tit:SetPoint("LEFT", cabecera, "LEFT", RELLENO + 2, 0)
    tit:SetPoint("RIGHT", cabecera, "RIGHT", -(ANCHO_MENU + RELLENO), 0)
    tit:SetJustifyH("LEFT")
    tit:SetWordWrap(false)
    colorTexto(tit, "texto")
    tit:SetText(textoDelTitulo)
    t.textoTitulo = tit
    if opciones.titulo.copiar then
      local b = botonIcono("copiar", ANCHO_MENU, function()
        llamar(opciones.titulo.copiar)
      end)
      b:SetPoint("TOPRIGHT", cabecera, "TOPRIGHT", 0, 0)
      b:SetScript("OnEnter", Piezas.proteger(function(self)
        pintar(self.icono, "texto")
      end))
      b:SetScript("OnLeave", Piezas.proteger(function(self)
        pintar(self.icono, "apagado")
      end))
      Piezas.ayuda(b, opciones.ayudaCopiar or Piezas.ayudaDe("PRINCIPAL_AYUDA_COPIAR_LISTA"))
      t.botonCopiar = b
    end
  end

  if opciones.menu then
    local b = botonIcono(menuIzq and "puntos" or "menu", ANCHO_MENU, function()
      t.menuColumnas:abrir()
    end)
    if menuIzq then
      b:SetPoint("TOPLEFT", cabecera, "TOPLEFT", 0, 0)
    else
      b:SetPoint("TOPRIGHT", cabecera, "TOPRIGHT", 0, 0)
    end
    b:SetScript("OnEnter", Piezas.proteger(function(self)
      pintar(self.icono, "texto")
    end))
    b:SetScript("OnLeave", Piezas.proteger(function(self)
      pintar(self.icono, "apagado")
    end))
    Piezas.ayuda(b, opciones.ayudaMenu or Piezas.ayudaDe("PRINCIPAL_AYUDA_COLUMNAS"))
    t.botonMenu = b

    -- La lista de columnas es el desplegable de varios, sin caja visible (transparente y sin ratón) y pegado a la ⋮: se
    -- abre justo debajo de la cabecera. Con ✓ las columnas que se ven.
    local opcionesMenu = {}
    for i, c in ipairs(columnas) do
      opcionesMenu[i] = {c.clave, c.titulo or tostring(c.clave)}
    end
    local d = Piezas.desplegable(b, {
      ancho = ANCHO_MENU_LISTA,
      varios = true,
      opciones = opcionesMenu,
      get = function()
        local visibles = {}
        for _, c in ipairs(columnas) do
          if not ocultas[c.clave] then
            visibles[c.clave] = true
          end
        end
        return visibles
      end,
      set = cambiarColumna,
    })
    if menuIzq then
      d:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 0, 0)
    else
      d:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", 0, 0)
    end
    d:SetAlpha(0)
    d:EnableMouse(false)
    t.menuColumnas = d
  end

  ---------------------------------------------------------------------------------------------------
  -- Columnas: sitio de cada una según el ancho
  ---------------------------------------------------------------------------------------------------

  local function pesoFlex(c)
    return type(c.flex) == "number" and c.flex > 0 and c.flex or 1
  end

  local function calcular()
    pos, posPorClave = {}, {}
    local ancho = t:GetWidth() or 0
    anchoCalculado = ancho
    local x0 = xMarcar + (opciones.marcar and ANCHO_MARCAR or 0)
    local fijo = x0 + ((opciones.menu and not menuIzq) and ANCHO_MENU or 0)
    local pesos = 0
    for _, c in ipairs(columnas) do
      if not ocultas[c.clave] then
        if c.flex then
          pesos = pesos + pesoFlex(c)
        else
          fijo = fijo + (c.ancho or ANCHO_DEFECTO)
        end
      end
    end
    local sobra = math.max(0, ancho - fijo)
    local x = x0
    for _, c in ipairs(columnas) do
      if not ocultas[c.clave] then
        local w = c.flex and (sobra * pesoFlex(c) / pesos) or (c.ancho or ANCHO_DEFECTO)
        local p = {col = c, x = x, w = w}
        pos[#pos + 1] = p
        posPorClave[c.clave] = p
        x = x + w
      end
    end
  end

  local function colocarCeldas(f)
    for _, c in ipairs(columnas) do
      local celda = f.celdas[c.clave]
      local p = posPorClave[c.clave]
      if p then
        celda:ClearAllPoints()
        celda:SetPoint("TOPLEFT", f, "TOPLEFT", p.x, 0)
        celda:SetSize(p.w, ALTO_FILA)
        celda:Show()
      else
        celda:Hide()
      end
    end
  end

  distribuir = function()
    calcular()
    for _, c in ipairs(columnas) do
      local b = t.cabeceras[c.clave]
      local p = posPorClave[c.clave]
      if p and not (conTitulo or opciones.sinCabecera) then
        b:ClearAllPoints()
        b:SetPoint("TOPLEFT", cabecera, "TOPLEFT", p.x, 0)
        b:SetSize(p.w, ALTO_CAB)
        b:Show()
      else
        b:Hide()
      end
    end
    pintarCabeceras()
    for _, f in ipairs(t.filas) do
      colocarCeldas(f)
    end
  end

  ---------------------------------------------------------------------------------------------------
  -- Marcas
  ---------------------------------------------------------------------------------------------------

  local function copiaDeMarcadas()
    local copia = {}
    for k in pairs(marcadas) do
      copia[k] = true
    end
    return copia
  end

  local function cambioDeMarcas()
    pintarTilde()
    actualizarTotales()
  end

  local function ponerMarca(clave, si)
    if clave == nil then
      return
    end
    local antes = marcadas[clave] == true
    if si and not antes then
      marcadas[clave] = true
      nMarcadas = nMarcadas + 1
    elseif not si and antes then
      marcadas[clave] = nil
      nMarcadas = nMarcadas - 1
    end
    cambioDeMarcas()
  end

  ---------------------------------------------------------------------------------------------------
  -- Filas (se crean las que hacen falta y se reutilizan)
  ---------------------------------------------------------------------------------------------------

  local function nuevaFila(i)
    local f = CreateFrame("Frame", nil, cuerpo)
    f:SetHeight(ALTO_FILA)
    f:SetPoint("TOPLEFT", cuerpo, "TOPLEFT", 0, -(i - 1) * ALTO_FILA)
    f:SetPoint("TOPRIGHT", cuerpo, "TOPRIGHT", 0, -(i - 1) * ALTO_FILA)
    f:EnableMouse(true)
    f.resalte = plana(f, "BACKGROUND", 0)
    f.resalte:SetAllPoints(f)
    pintar(f.resalte, elegir and "secundario" or "elegida") -- con elegir, el del ratón es más suave que el de «elegida»
    f.resalte:Hide()
    if elegir then
      f.fondoElegida = plana(f, "BACKGROUND", 0)
      f.fondoElegida:SetAllPoints(f)
      pintar(f.fondoElegida, "elegida")
      f.fondoElegida:Hide()
      f:SetScript("OnMouseUp", Piezas.proteger(function(self, boton)
        if boton == nil or boton == "LeftButton" then
          t:pulsarFila(self)
        end
      end))
    end
    -- La casilla está encima de la fila: al pasar de una a otra la fila recibe OnLeave. Como en ui/comercio_tabla.lua, se
    -- cuenta cuántos de los dos (fila y casilla) tienen el ratón, llegue en el orden que llegue, y la fila solo «sale» cuando
    -- no queda ninguno. No se mira la geometría (IsMouseOver): el juego manda un solo OnLeave por salida, y con el cursor aún
    -- dentro del rectángulo (la fila de abajo, recortada por el cuerpo; el borde que comparten dos filas) la fila sale igual.
    -- Que el fondo y el tooltip no salgan y se vayan en fotogramas seguidos (pasar de una fila a otra, temblar en un borde)
    -- es cosa de la luz de la tabla (Piezas.interno.nuevaLuz): alEntrar y alSalir llegan con ella, tras su espera, y quien
    -- enseña el tooltip lo esconde al momento.
    f._dentro = 0
    local function entrar()
      f._dentro = f._dentro + 1
      if f._dentro == 1 then
        f.sobre = true
        luz:mover(f) -- alEntrar llega con la luz
      end
    end
    local function salir()
      if f._dentro > 0 then
        f._dentro = f._dentro - 1
        if f._dentro == 0 then
          f.sobre = false
          if luz.destino == f then -- si ya entró en otra fila (OnEnter antes que este OnLeave), la luz va a esa
            luz:mover(nil) -- alSalir llega con la luz, cuando se apaga
          end
        end
      end
    end
    f:SetScript("OnEnter", Piezas.proteger(entrar))
    f:SetScript("OnLeave", Piezas.proteger(salir))

    if opciones.marcar then
      f.casilla = Piezas.casilla(f, "", function()
        return marcadas[f.clave] == true
      end, function(si)
        ponerMarca(f.clave, si)
      end)
      f.casilla:SetSize(CAJA, CAJA)
      f.casilla:SetPoint("LEFT", f, "LEFT", xMarcar + (ANCHO_MARCAR - CAJA) / 2, 0)
      if discreta then
        -- Cada vez que la casilla se repinta (al pulsarla, al ponerle otra fila) se decide si se ve su caja. La zona que se
        -- pulsa es la casilla misma, que sigue a la vista.
        local refrescarCasilla = f.casilla.refrescar
        function f.casilla:refrescar()
          refrescarCasilla(self)
          pintarCasilla(f)
        end
        pintarCasilla(f)
      end
      local entrarCasilla, salirCasilla = f.casilla:GetScript("OnEnter"), f.casilla:GetScript("OnLeave")
      f.casilla:SetScript("OnEnter", Piezas.proteger(function(self, ...)
        if entrarCasilla then
          entrarCasilla(self, ...)
        end
        entrar()
      end))
      f.casilla:SetScript("OnLeave", Piezas.proteger(function(self, ...)
        if salirCasilla then
          salirCasilla(self, ...)
        end
        salir()
      end))
    end

    f.celdas = {}
    for _, c in ipairs(columnas) do
      local celda = CreateFrame("Frame", nil, f)
      local role = c.justificado == "RIGHT" and "tablaNegrita" or "tabla"
      celda.texto = Tema.letra(celda:CreateFontString(nil, "OVERLAY"), role, opciones.letra)
      celda.texto:SetPoint("LEFT", celda, "LEFT", RELLENO, 0)
      celda.texto:SetPoint("RIGHT", celda, "RIGHT", -RELLENO, 0)
      celda.texto:SetJustifyH(c.justificado or "LEFT")
      celda.texto:SetWordWrap(false)
      f.celdas[c.clave] = celda
    end
    colocarCeldas(f)
    t.filas[i] = f
    return f
  end

  -- Pone una fila de datos en una fila de pantalla: la casilla y el texto de cada columna que se ve.
  local function ponerFila(f, fila)
    f.fila, f.clave = fila, fila.clave
    if f.fondoElegida then
      local elegida = not fila.seccion and fila.clave ~= nil and marcadas[fila.clave] == true
      f.fondoElegida:SetShown(elegida)
      f.resalte:SetShown(f.luz == true and not elegida)
    end
    if f.casilla then
      if fila.noMarca then
        f.casilla:Hide()
      elseif fila.clave == nil then
        f.casilla:Hide()
        if not avisado then
          avisado = true
          geterrorhandler()("SnetForever: Piezas.tabla: una fila sin clave no se puede marcar")
        end
      else
        f.casilla:Show()
        if f.casilla.marcada ~= (marcadas[fila.clave] == true) then
          f.casilla:refrescar()
        end
      end
    end
    for _, p in ipairs(pos) do
      local c = p.col
      local celda = f.celdas[c.clave]
      local texto = ""
      if c.valor then
        local v = llamar(c.valor, fila)
        if v ~= nil then
          texto = tostring(v)
        end
      end
      celda.texto:SetText(texto)
      colorTexto(celda.texto, "texto")
      if c.pintar then
        llamar(c.pintar, celda, fila)
      end
    end
    f:Show()
  end

  -- Cuántas filas enteras caben (hasta donde se puede desplazar) y cuántas hay que dibujar (con la de abajo a medias).
  local function medidas()
    local alto = (t:GetHeight() or 0) - altoCab - (totalesVisible and ALTO_TOT or 0)
    return math.max(1, math.floor(alto / ALTO_FILA)), math.max(1, math.ceil(alto / ALTO_FILA))
  end

  -- Bajo el ratón parado puede quedar otra fila (la rueda, :poner, :irA): se avisa con la nueva (alEntrar) si su clave es
  -- otra y, si la fila se esconde, alSalir (y la fila queda sin ratón: el OnLeave que llegue después ya no avisa).
  asignar = function()
    if t:GetWidth() ~= anchoCalculado then
      distribuir() -- el cliente no avisó del cambio de ancho: se recolocan las columnas ahora
    end
    local encendida = luz.encendida
    local claveAntes = encendida and encendida.clave
    local n = #lista
    local completas, dibujadas = medidas()
    inicio = math.max(0, math.min(inicio, n - completas))
    for i = 1, dibujadas do
      local fila = lista[inicio + i]
      if fila then
        ponerFila(t.filas[i] or nuevaFila(i), fila)
      elseif t.filas[i] then
        t.filas[i]:Hide()
      end
    end
    for i = dibujadas + 1, #t.filas do
      t.filas[i]:Hide()
    end
    for _, f in ipairs(t.filas) do
      if f.sobre and not f:IsShown() then
        f._dentro, f.sobre = 0, false -- se ha ido con el ratón encima
        if luz.encendida == f or luz.destino == f then
          luz:apagar() -- y con él la luz (alSalir)
        end
      end
    end
    if encendida and luz.encendida == encendida and encendida.clave ~= claveAntes and opciones.alEntrar then
      llamar(opciones.alEntrar, encendida.fila, encendida) -- en el sitio de la luz hay otra fila
    end
    ponerBarra(t.barra, t, completas * ALTO_FILA, altoCab, completas, n, inicio)
  end

  actualizarTotales = function()
    if not opciones.totales then
      return
    end
    local texto = llamar(opciones.totales, lista, copiaDeMarcadas())
    if type(texto) == "number" then
      texto = tostring(texto)
    end
    local visible = type(texto) == "string" and texto ~= ""
    if visible then
      t.textoTotales:SetText(numerosEnAcento(texto))
    end
    if visible ~= totalesVisible then
      totalesVisible = visible
      if visible then
        t.barraTotales:Show()
      else
        t.barraTotales:Hide()
      end
      anclarCuerpo()
      asignar() -- cambia el alto de las filas
    end
  end

  ---------------------------------------------------------------------------------------------------
  -- Métodos
  ---------------------------------------------------------------------------------------------------

  function t:poner(filas)
    crudas = type(filas) == "table" and filas or {}
    -- Las marcas de filas que ya no están se van; las demás se quedan.
    if nMarcadas > 0 then
      local quedan, n = {}, 0
      for _, fila in ipairs(crudas) do
        local k = fila.clave
        if k ~= nil and not fila.noMarca and marcadas[k] and not quedan[k] then
          quedan[k] = true
          n = n + 1
        end
      end
      marcadas, nMarcadas = quedan, n
    end
    -- La última fila pulsada se olvida si ya no está en la lista.
    if ancla ~= nil then
      local sigue = false
      for _, fila in ipairs(crudas) do
        if fila.clave == ancla then
          sigue = true
          break
        end
      end
      if not sigue then
        ancla = nil
      end
    end
    reordenar()
    pintarTilde()
    actualizarTotales()
    asignar()
  end

  function t:marcadas()
    return copiaDeMarcadas()
  end

  function t:marcarTodo(si)
    if si then
      for _, fila in ipairs(lista) do
        local k = fila.clave
        if k ~= nil and not fila.seccion and not fila.noMarca and not marcadas[k] then
          marcadas[k] = true
          nMarcadas = nMarcadas + 1
        end
      end
    else
      marcadas, nMarcadas = {}, 0
      ancla = nil
    end
    asignar()
    cambioDeMarcas()
  end

  -- Pulsar una fila (solo con opciones.elegir; el clic del ratón llega aquí). Una fila de sección (fila.seccion) no se
  -- elige: avisa por alPulsarSeccion(fila). Una fila normal: sola; con Ctrl se añade o se quita sin tocar las demás; con
  -- Mayús se elige el tramo desde la última pulsada hasta esta (Ctrl+Mayús lo suma a lo que había). Con opciones.objeto
  -- (B3s, como TSM): el clic solo suma o quita, Alt elige el tramo y Mayús o Ctrl son del objeto (chat o probador).
  function t:pulsarFila(f)
    local fila = f and f.fila
    if not (elegir and fila) then
      return
    end
    if fila.seccion then
      llamar(opciones.alPulsarSeccion, fila)
      return
    end
    local clave = fila.clave
    if clave == nil then
      return
    end
    local ctrl = IsControlKeyDown and IsControlKeyDown() or false
    local mayus = IsShiftKeyDown and IsShiftKeyDown() or false
    if opciones.objeto then
      -- B3s, como TSM: con tecla (Mayús o Ctrl, las del jugador), el clic es del objeto (UIComercio.clicModificado: al
      -- chat o al probador) y lo elegido no cambia. Sin ella, el clic suma o quita esa fila; con Alt, el tramo.
      local UI = rawget(SNF, "UIComercio")
      if UI and UI.clicModificado and UI.clicModificado(opciones.objeto(fila)) then
        return
      end
      local alt = IsAltKeyDown and IsAltKeyDown() or false
      ctrl, mayus = not alt, alt
    end
    local hasta, desde
    for i, otra in ipairs(lista) do
      if otra.clave == clave and not hasta then
        hasta = i
      end
      if ancla ~= nil and otra.clave == ancla and not desde then
        desde = i
      end
    end
    local nuevas, n = {}, 0
    if not ctrl then
      -- sin Ctrl, lo que había se va
    else
      for k in pairs(marcadas) do
        nuevas[k], n = true, n + 1
      end
    end
    if mayus and desde and hasta then
      local a, b = math.min(desde, hasta), math.max(desde, hasta)
      for i = a, b do
        local otra = lista[i]
        if otra.clave ~= nil and not otra.seccion and not nuevas[otra.clave] then
          nuevas[otra.clave], n = true, n + 1
        end
      end
    else
      if ctrl and nuevas[clave] then
        nuevas[clave], n = nil, n - 1
      elseif not nuevas[clave] then
        nuevas[clave], n = true, n + 1
      end
      ancla = clave
    end
    marcadas, nMarcadas = nuevas, n
    asignar()
    cambioDeMarcas()
  end

  function t:ponerTitulo(texto)
    if t.textoTitulo then
      textoDelTitulo = texto or ""
      repintarTitulo()
    end
  end

  function t:fila(i)
    return lista[i]
  end

  function t:irA(i)
    i = tonumber(i)
    if not i or i ~= i then
      return
    end
    inicio = math.floor(i) - 1 -- asignar() lo deja entre 0 y lo último que se puede desplazar
    asignar()
  end

  function t:cuantas()
    return #lista
  end

  -- Cuántas filas enteras caben a la vez (sin la cabecera ni los totales). nil si la tabla aún no tiene alto.
  function t:capacidad()
    if (t:GetHeight() or 0) <= 0 then
      return nil
    end
    return (medidas())
  end

  function t:orden()
    if ordenClave == nil then
      return nil
    end
    return ordenClave, ordenAsc ~= false
  end

  function t:refrescar()
    leerOcultas()
    distribuir()
    pintarTilde()
    actualizarTotales()
    asignar()
  end

  ---------------------------------------------------------------------------------------------------
  -- Rueda, tamaño y mostrar
  ---------------------------------------------------------------------------------------------------

  -- La rueda desplaza una fila por muesca, sin pasar del principio ni del final. Solo se reasignan las filas que hay.
  t:SetScript("OnMouseWheel", Piezas.proteger(function(_, delta)
    local completas = medidas()
    local nuevo = inicio - (delta > 0 and 1 or -1)
    nuevo = math.max(0, math.min(math.max(0, #lista - completas), nuevo))
    if nuevo ~= inicio then
      inicio = nuevo
      asignar()
    end
  end))
  t:SetScript("OnSizeChanged", Piezas.proteger(function()
    distribuir()
    asignar()
    repintarTitulo()
  end))
  -- Al esconderse la tabla (se cierra la ventana) la luz se apaga y lo pendiente se cancela: nada se enciende escondido.
  t:SetScript("OnHide", Piezas.proteger(function()
    luz:apagar()
  end))
  t:SetScript("OnShow", Piezas.proteger(function()
    asignar()
    repintarTitulo()
  end))

  leerOcultas()
  distribuir()
  pintarTilde()
  return t
end
