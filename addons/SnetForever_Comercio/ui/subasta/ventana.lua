-- SnetForever: la ventana de la subasta, parte 3, bloque B (Task B2). Lo de encima de la ventana, como TSM: la cabecera
-- (fila 1), las páginas de cada pestaña y el tamaño. La ventana es `raiz` de ui/comercio.lua: ese archivo la crea, la
-- pone sobre la subasta de Blizzard (o donde la dejó el jugador), la esconde y la enseña, y llama aquí para montar la
-- cabecera, cambiar de página y medir. Solo mira: no usa funciones protegidas ni hace nada en la subasta.
--
-- Fila 1, con las piezas y medidas de la ventana principal (Piezas.cabeceraVentana, 38 px): el logo; las pestañas
-- Navegar, Subasta, Sniper y Mis Subastas (16 px en negrita, 16 px entre ellas, la elegida en acento y sin fondo); y a la
-- derecha, por este orden, el punto rojo de aviso con un «!» blanco (solo con avisos que duran; aparece y desaparece sin
-- animación), el oro (Tema.dinero), el botón «Vista de Blizzard» (recuadro oscuro con borde fino, texto en Montserrat
-- Medium de 11 px como «WoW UI») y la X sin fondo. Medidas de subasta-tsm-2.png (2560 × 1080, píxeles reales): el botón
-- mide 22 de alto con el texto a 14 px de cada borde; el punto, 12 px; huecos punto-oro 9, oro-botón 9 y botón-X 13; la X
-- a 12 px del borde.
-- El oro se acorta solo si la fila 1 no cabe al ancho de ahora (con al menos 8 px libres entre la última pestaña y el
-- punto, o el oro sin punto): primero sin el cobre, luego sin la plata (solo «1234g», en su color). Cuarto paso: si ni el
-- oro solo cabe con esos 8 px, se escribe si cabe sin margen; si no, no se escribe y solo queda el tooltip. Nunca se pisa
-- con nada. Se decide solo cuando cambia algo (el oro, el tamaño de la ventana, la escala, la pantalla, el idioma o el punto
-- rojo), nunca en OnUpdate, y con el mismo ancho y el mismo oro siempre sale lo mismo: no va y viene. Tras un cambio de
-- tamaño, escala, pantalla o idioma se mide en el fotograma siguiente (una sola vez aunque lleguen varios cambios: el
-- cliente puede tener aún los bordes de antes), así que cambia de forma como mucho una vez; lo mismo si el botón «Vista de
-- Blizzard» acaba de cambiar de ancho.
-- Con el asa cogida (revisión B7, regla de interfaz) el oro solo puede acortarse: con el ratón parado justo en el
-- ancho en que cambia de forma, el temblor de la mano (1 px a cada lado en fotogramas seguidos) lo haría ir y venir. La
-- forma larga vuelve al soltar el asa (soltar pide otra medida), una sola vez. Las tablas que estiran (resultados, sniper y
-- lista vieja) siguen también al asa: al cogerla y al soltarla se les dice con TablaComercio.arrastre (ver
-- ui/comercio_tabla.lua, «Tabla que estira»).
-- Al abrir, el oro (y el punto, que va pegado a él) no se ve hasta estar medido de verdad, y sale una sola vez, ya en su
-- forma final. Nada aparece y cambia al poco:
--   - Nunca se mide en el mismo fotograma de abrir. Se mide en el fotograma siguiente al último cambio (colocar, tamaño,
--     avisos, oro), y solo si no queda ninguna recolocación pendiente (opciones.pendiente, de ui/comercio.lua: el velo,
--     esconder la subasta de Blizzard, las pestañas de otros addons); si queda, se espera otro fotograma, ESPERA_ABRIR s
--     como mucho. Lo normal es que el oro salga uno o dos fotogramas después que la ventana.
--   - Con la letra propia aún sin cargar (GetStringWidth da 0) o los bordes sin resolver se vuelve a medir cada
--     ESPERA_LETRA s, como mucho MAX_INTENTOS veces (2 s); pasados, sale la forma más corta que cabe con lo que haya.
--   - Sin C_Timer no se puede esperar: se mide y se enseña al momento.
--   - Con la ventana escondida no se mide ni se apunta nada. El punto sin enseñar no coge el ratón.
-- Con sitio de sobra sale entero. El tooltip del oro da siempre la cantidad entera.
--
-- SubastaVentana.montar(raiz, opciones)   monta la cabecera, la zona de las páginas y el asa en raiz. opciones:
--     alCerrar()            la X;
--     alVistaBlizzard()     el botón «Vista de Blizzard»;
--     puedeMover() -> bool  si ahora se puede mover o estirar la ventana (el asa no hace nada si dice false);
--     alCambiarPantalla()   cambió la escala de interfaz o la pantalla con la ventana a la vista (hay que recolocarla);
--     pendiente() -> bool   si queda alguna recolocación pendiente que pueda cambiar la ventana un fotograma después (al
--                           abrir, el oro espera a que no quede ninguna).
--   El arrastre de la cabecera (Task 15e) lo pone ui/comercio.lua.
-- SubastaVentana.registrar(nombre, {crear = fn(marco), mostrar = fn(), ocultar = fn(), idioma = fn()})
--     enchufa la página de una pestaña (navegar, subasta, sniper o misSubastas) o una página interna, sin pestaña:
--     «ofertas» (la lista vieja: la abre la Búsqueda de grandes ofertas) o «resultados» (lo que trae una búsqueda: la
--     abre Navegar al buscar). Con una página interna, arriba sigue elegida Navegar. Como Principal.registrar: crear se llama una vez, con
--     el marco de la página; mostrar y ocultar, cada vez que sale o se va; idioma, al cambiar de idioma. Registrar otra vez
--     una página ya creada no vuelve a llamar a crear. Un nombre desconocido es un error de uso.
-- SubastaVentana.preparar(nombre)   crea ya la página (escondida), para lo que hace falta antes de verla.
-- SubastaVentana.elegir(nombre)     cambia de página. SubastaVentana.pagina() -> la elegida.
-- SubastaVentana.alInicio()         vuelve a Navegar (al abrir la subasta siempre se está ahí).
-- SubastaVentana.alMostrar() / alOcultar()   los llama raiz al enseñarse y al esconderse.
-- SubastaVentana.ponerAvisos(lista)  los avisos que duran: con alguno sale el punto rojo y su tooltip los lista. Lo que va
--                                   y viene (esperar a la subasta, una búsqueda ajena…) no se pasa aquí: no debe parpadear.
-- SubastaVentana.pintarOro()        el oro del personaje, acortado si no cabe (ver Fila 1), ya (al abrir, con el oro aún
--                                   sin enseñar, en el fotograma siguiente; escondida, nada). SubastaVentana.pedirOro():
--                                   lo mismo en el fotograma siguiente (tras cambiar el tamaño). SubastaVentana.idioma(): los
--                                   textos en el idioma de ahora.
--
-- Tamaño y sitio, en píxeles reales como la ventana principal (Piezas.escalaReal: una unidad es un píxel, con cualquier
-- escala de interfaz; se recalcula al colocarla y con UI_SCALE_CHANGED y DISPLAY_SIZE_CHANGED). Sin sitio guardado ni
-- subasta de Blizzard que tapar, 860 × 545; como mínimo 830 × 500, y como máximo hasta el borde de la pantalla desde donde
-- está la ventana: nunca se estira ni se guarda saliéndose. TSM mide unos 763-780 de ancho; somos más anchos por la
-- cabecera: «SnetForever» ocupa unos 100 px más que «TSM» y «Vista de Blizzard» unos 50 más que «WoW UI». A 830 la fila 1
-- cabe con los huecos medidos de TSM porque el oro se acorta si hace falta (arriba); caben también los 4 botones de
-- Navegar, la lista vieja y el sniper. Las ventanas guardadas antes (p. ej. 960 × 560) no se tocan: solo sube al mínimo
-- la que quede por debajo.
-- Se guarda en SnetForeverCuenta.comercio.ventanaSubasta = {x, y, ancho, alto}: la esquina de arriba a la izquierda medida
-- desde la de la pantalla (y hacia abajo) y el tamaño, todo en píxeles.
-- SubastaVentana.ajustarEscala()
-- SubastaVentana.sitioActual() -> {x, y, ancho, alto} | nil
-- SubastaVentana.sitioGuardado() -> {x, y, ancho?, alto?} | nil   lo guardado, si está sano. Lo guardado antes del
--     bloque B ({x, y} en unidades de UIParent, y desde abajo) se lee como la posición, sin tamaño.
-- SubastaVentana.guardarSitio() / borrarSitio()
-- SubastaVentana.desdeUIParent({x, y, ancho, alto}) -> sitio   un rectángulo en unidades de UIParent (x desde la
--     izquierda, y = su borde de arriba medido desde abajo; lo que da medirSubasta) pasado a píxeles de la ventana.
-- SubastaVentana.colocar(sitio?, abajo?)   pone la escala, el tamaño y el sitio: el sitio dado (sin x e y, centrada; sin
--     tamaño, el de siempre) metido entre el mínimo y la pantalla, dejando `abajo` píxeles libres debajo (nuestra pestaña).
-- SubastaVentana.marcos   {cabecera, icono, logo, orden, pestanas = {nombre = boton}, punto, oro, zonaOro, verBlizzard, cerrar,
--     contenido, asa, paginas = {nombre = marco}}.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local SubastaVentana = {}
SNF.SubastaVentana = SubastaVentana

local CABECERA = Piezas.CABECERA
local ANCHO, ALTO = 860, 545 -- sin subasta de Blizzard que tapar ni sitio guardado
local MIN_ANCHO, MIN_ALTO = 830, 500
local ALTO_BOTON = 22 -- «Vista de Blizzard», medido contra «WoW UI»
local RELLENO_BOTON = 14 -- del texto al borde, a cada lado
local TAMANO_BOTON = 11
local TAMANO_PUNTO = 12
local HUECO_X = 13 -- entre el botón y la X
local HUECO_ORO = 9 -- entre el oro y el botón
local HUECO_PUNTO = 9 -- entre el punto y el oro
local LIBRE_ORO = 8 -- px que quedan libres, como poco, entre la última pestaña y el punto (o el oro): si no, se acorta
local ESPERA_LETRA = 0.2 -- s hasta volver a medir el oro si no se pudo (letra sin cargar, bordes sin resolver)
local MAX_INTENTOS = 10 -- reintentos seguidos como mucho (2 s); luego sale la forma más corta que cabe
local ESPERA_ABRIR = 2 -- s que el oro espera como mucho, al abrir, a que acaben las recolocaciones pendientes

local PESTANAS = {"navegar", "subasta", "sniper", "misSubastas"}
local TEXTOS_PESTANA = {
  navegar = "SUBASTA_PESTANA_NAVEGAR",
  subasta = "SUBASTA_PESTANA_SUBASTA",
  sniper = "COMERCIO_PESTANA_SNIPER",
  misSubastas = "SUBASTA_PESTANA_MIS",
}
local INTERNAS = {ofertas = "navegar", resultados = "navegar"} -- página sin pestaña -> la pestaña que sigue elegida
local INICIO = "navegar"
SubastaVentana.PESTANAS = PESTANAS
SubastaVentana.MINIMO = {ancho = MIN_ANCHO, alto = MIN_ALTO}

local raiz
local opciones = {}
local marcos = {orden = PESTANAS, pestanas = {}, paginas = {}}
SubastaVentana.marcos = marcos
local registradas = {} -- nombre -> {crear, mostrar, ocultar, idioma, creada}
local elegida = INICIO
local visible -- la página que se ve ahora
local avisos = {}
local reservaAbajo = 0 -- lo que se deja libre debajo de la ventana (nuestra pestaña), el último que dio colocar

local function esPagina(nombre)
  return TEXTOS_PESTANA[nombre] ~= nil or INTERNAS[nombre] ~= nil
end

local function poner(fs, token)
  local c = Tema.color(token)
  fs:SetTextColor(c[1], c[2], c[3], c[4])
end

local function llamar(fn)
  if fn then
    fn()
  end
end

-- Las tablas que estiran siguen al asa (revisión B7): cogida, no sale ninguna fila nueva; al soltar, las que caben.
local function arrastreTablas(si)
  local T = rawget(SNF, "TablaComercio")
  if T and T.arrastre then
    T.arrastre(si)
  end
end

---------------------------------------------------------------------------------------------------
-- Tooltips
---------------------------------------------------------------------------------------------------

local function tooltip(dueno, titulo, lineas)
  if not GameTooltip or GameTooltip:IsForbidden() then
    return
  end
  GameTooltip:SetOwner(dueno, "ANCHOR_BOTTOM")
  GameTooltip:SetText(titulo)
  for _, linea in ipairs(lineas or {}) do
    GameTooltip:AddLine(linea, 1, 1, 1, true)
  end
  GameTooltip:Show()
end

local function sinTooltip()
  if GameTooltip and not GameTooltip:IsForbidden() then
    GameTooltip:Hide()
  end
end

---------------------------------------------------------------------------------------------------
-- Tamaño y sitio
---------------------------------------------------------------------------------------------------

local function esNumero(v)
  return type(v) == "number" and v == v and v > -1e7 and v < 1e7
end

local function limitar(valor, minimo, maximo)
  return math.max(minimo, math.min(valor, maximo))
end

local function guardadoComercio()
  pcall(SNF.Guardado.preparar)
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  return type(c) == "table" and c or nil
end

-- Escala efectiva de UIParent y de la ventana (sin cero: con cero no se puede dividir).
local function escalas()
  local u, f = UIParent:GetEffectiveScale(), raiz:GetEffectiveScale()
  if not (type(u) == "number" and u > 0) then
    u = 1
  end
  if not (type(f) == "number" and f > 0) then
    f = 1
  end
  return u, f
end

function SubastaVentana.ajustarEscala()
  if raiz then
    Piezas.escalaReal(raiz)
  end
end

function SubastaVentana.sitioActual()
  return raiz and Piezas.sitioDe(raiz) or nil
end

function SubastaVentana.desdeUIParent(m)
  local u, f = escalas()
  local k = u / f
  return {x = m.x * k, y = ((UIParent:GetTop() or 0) - m.y) * k, ancho = m.ancho * k, alto = m.alto * k}
end

function SubastaVentana.sitioGuardado()
  local c = guardadoComercio()
  local s = c and c.ventanaSubasta
  if type(s) ~= "table" or not esNumero(s.x) or not esNumero(s.y) then
    return nil
  end
  if esNumero(s.ancho) and esNumero(s.alto) and s.ancho > 0 and s.alto > 0 then
    return {x = s.x, y = s.y, ancho = s.ancho, alto = s.alto}
  end
  if s.ancho ~= nil or s.alto ~= nil or not raiz then
    return nil
  end
  -- Lo de antes del bloque B: {x, y} de la esquina de arriba a la izquierda en unidades de UIParent, con y desde abajo.
  local viejo = SubastaVentana.desdeUIParent({x = s.x, y = s.y, ancho = 0, alto = 0})
  return {x = viejo.x, y = viejo.y}
end

-- Lo que se guarda queda siempre dentro de la pantalla (con el sitio de abajo libre): como mucho la pantalla y la esquina
-- metida para que quepa.
function SubastaVentana.guardarSitio()
  local s = SubastaVentana.sitioActual()
  local c = guardadoComercio()
  if not (s and c) then
    return
  end
  local pw, ph = Piezas.pantallaDe(raiz)
  local maxAlto = math.max(1, math.floor(ph - reservaAbajo + 0.5))
  pw = math.floor(pw + 0.5)
  s.ancho, s.alto = math.min(s.ancho, pw), math.min(s.alto, maxAlto)
  s.x, s.y = limitar(s.x, 0, pw - s.ancho), limitar(s.y, 0, maxAlto - s.alto)
  c.ventanaSubasta = s
end

-- Los límites del asa: el mínimo y, como máximo, hasta el borde de la pantalla desde la esquina de arriba a la izquierda.
local function limitesAsa(x, y)
  local pw, ph = Piezas.pantallaDe(raiz)
  local maxAlto = math.max(1, ph - reservaAbajo)
  local minAncho, minAlto = math.min(MIN_ANCHO, pw), math.min(MIN_ALTO, maxAlto)
  local maxA, maxH = math.max(minAncho, pw - (x or 0)), math.max(minAlto, maxAlto - (y or 0))
  if raiz.SetResizeBounds then
    raiz:SetResizeBounds(minAncho, minAlto, maxA, maxH)
  elseif raiz.SetMinResize then
    raiz:SetMinResize(minAncho, minAlto)
  end
end

function SubastaVentana.borrarSitio()
  local c = guardadoComercio()
  if c then
    c.ventanaSubasta = nil
  end
end

local layoutTabs = function() end

function SubastaVentana.colocar(sitio, abajo)
  if not raiz then
    return
  end
  SubastaVentana.ajustarEscala()
  reservaAbajo = math.max(0, abajo or 0)
  local pw, ph = Piezas.pantallaDe(raiz)
  local maxAlto = math.max(1, ph - reservaAbajo)
  local minAncho, minAlto = math.min(MIN_ANCHO, pw), math.min(MIN_ALTO, maxAlto)
  local ancho = limitar(sitio and sitio.ancho or ANCHO, minAncho, pw)
  local alto = limitar(sitio and sitio.alto or ALTO, minAlto, maxAlto)
  raiz:SetSize(ancho, alto)
  layoutTabs()
  raiz:ClearAllPoints()
  if sitio and sitio.x and sitio.y then
    local x, y = limitar(sitio.x, 0, pw - ancho), limitar(sitio.y, 0, maxAlto - alto)
    raiz:SetPoint("TOPLEFT", UIParent, "TOPLEFT", x, -y)
    limitesAsa(x, y)
  else
    raiz:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
    limitesAsa((pw - ancho) / 2, (ph - alto) / 2)
  end
  SubastaVentana.pedirOro() -- con otro ancho, el oro puede ir entero o acortado (se mide en el fotograma siguiente)
end

---------------------------------------------------------------------------------------------------
-- Páginas
---------------------------------------------------------------------------------------------------

-- La pestaña que se ve elegida (con una página interna, la suya).
local function pestanaElegida()
  return INTERNAS[elegida] or elegida
end

-- Rellena el marco de la página la primera vez que hace falta (con la página registrada o con un aviso).
local function crearContenido(nombre)
  local reg = registradas[nombre]
  local m = marcos.paginas[nombre]
  if not m or (reg and reg.creada) then
    return
  end
  if reg then
    reg.creada = true
    if m.sinPagina then
      m.sinPagina:Hide()
    end
    if reg.crear then
      reg.crear(m)
    end
  elseif not m.sinPagina then
    local fs = Tema.letra(m:CreateFontString(nil, "OVERLAY"), "texto", 14)
    poner(fs, "apagado")
    fs:SetPoint("CENTER", m, "CENTER", 0, 0)
    fs:SetText(L.t("PRINCIPAL_SIN_PAGINA"))
    m.sinPagina = fs
  end
end

local function paginaDe(nombre)
  local m = marcos.paginas[nombre]
  if not m then
    m = CreateFrame("Frame", nil, marcos.contenido)
    m:SetAllPoints(marcos.contenido)
    m:Hide()
    marcos.paginas[nombre] = m
  end
  crearContenido(nombre)
  return m
end

local function pintarPestanas()
  if marcos.cabecera then
    marcos.cabecera:pintar()
  end
end

-- Esconde la página que se veía y enseña la elegida (solo con la ventana a la vista).
local function mostrarPagina()
  if visible and visible ~= elegida then
    local anterior = marcos.paginas[visible]
    if anterior then
      anterior:Hide()
    end
    local reg = registradas[visible]
    visible = nil
    llamar(reg and reg.ocultar)
  end
  pintarPestanas()
  if raiz and raiz:IsShown() and visible ~= elegida then
    paginaDe(elegida):Show()
    visible = elegida
    local reg = registradas[elegida]
    llamar(reg and reg.mostrar)
  end
end

function SubastaVentana.pagina()
  return elegida
end

function SubastaVentana.elegir(nombre)
  if not esPagina(nombre) then
    return
  end
  elegida = nombre
  if raiz then
    sinTooltip()
    mostrarPagina()
  end
end

function SubastaVentana.alInicio()
  SubastaVentana.elegir(INICIO)
end

function SubastaVentana.registrar(nombre, pagina)
  if not esPagina(nombre) then
    error("uso: SubastaVentana.registrar: página desconocida " .. tostring(nombre), 2)
  end
  pagina = type(pagina) == "table" and pagina or {}
  local previo = registradas[nombre]
  if previo and previo.creada then
    -- Ya está creada: otra registración no vuelve a llamar a crear (duplicaría el contenido); solo cambia el resto.
    previo.mostrar, previo.ocultar, previo.idioma = pagina.mostrar, pagina.ocultar, pagina.idioma
    return
  end
  registradas[nombre] = {crear = pagina.crear, mostrar = pagina.mostrar, ocultar = pagina.ocultar, idioma = pagina.idioma}
  -- Si la ventana ya enseñaba esa página con el aviso, se rellena ahora.
  if marcos.paginas[nombre] then
    crearContenido(nombre)
    if raiz and raiz:IsShown() and visible == nombre then
      llamar(registradas[nombre].mostrar)
    end
  end
end

function SubastaVentana.preparar(nombre)
  if raiz and esPagina(nombre) then
    return paginaDe(nombre)
  end
end

-- Navegar: vacía hasta que ui/subasta/navegar.lua (después en el .toc) registre la suya. Resultados: vacía hasta la
-- Task B5 (ui/subasta/resultados.lua); Navegar pasa a ella al buscar.
SubastaVentana.registrar("navegar", {})
SubastaVentana.registrar("resultados", {})

---------------------------------------------------------------------------------------------------
-- Cabecera
---------------------------------------------------------------------------------------------------

-- «Vista de Blizzard»: el ancho sigue al texto, con el relleno medido a cada lado.
local function anchoBoton()
  local b = marcos.verBlizzard
  b:SetWidth(math.ceil(b.texto:GetStringWidth()) + 2 * RELLENO_BOTON + 2)
end

-- Las formas del oro, de la más larga a la más corta: entera (Tema.dinero), sin el cobre y solo el oro (las dos últimas,
-- solo con oro; con plata o cobre solos el texto es corto y siempre cabe).
local function formasOro(cobre)
  local formas = {Tema.dinero(cobre)}
  local oro = math.floor(cobre / 10000)
  if oro > 0 then
    local g = "|cff" .. Tema.hex("oro") .. oro .. "g|r"
    formas[2] = g .. " |cff" .. Tema.hex("plata") .. string.format("%02ds", math.floor(cobre / 100) % 100) .. "|r"
    formas[3] = g
  end
  return formas
end

-- El sitio que hay para el texto del oro: desde la última pestaña hasta el botón (menos el hueco oro-botón y, si se ve, el
-- punto con su hueco). No depende del oro (el punto va pegado al oro, pero aquí se cuenta su ancho, no su sitio), así que
-- acortar el oro no cambia el sitio y no hay ida y vuelta. nil si aún no se puede medir.
local function sitioOro()
  local ultima = marcos.pestanas[PESTANAS[#PESTANAS]]
  local fin = ultima and ultima:GetRight()
  local boton = marcos.verBlizzard and marcos.verBlizzard:GetLeft()
  if not (fin and boton) then
    return nil
  end
  local punto = marcos.punto and marcos.punto:IsShown() and (TAMANO_PUNTO + HUECO_PUNTO) or 0
  return boton - HUECO_ORO - punto - fin
end

-- Lo que se mide más tarde va con C_Timer, como en el resto del addon. Devuelve false si no hay C_Timer.
local function luego(segundos, fn)
  local temporizador = rawget(_G, "C_Timer")
  if type(temporizador) == "table" and type(temporizador.After) == "function" then
    temporizador.After(segundos, fn)
    return true
  end
  return false
end

local pintar -- (más abajo) mide y pinta el oro
local esperaFotograma, esperaLetra = false, false -- ya hay una medida pedida: para el fotograma siguiente / reintento
local pedidoEn -- GetTime() del fotograma en que se pidió la medida que espera
local turno = 0 -- la medida pedida que vale: las pedidas antes ya no miden
local abiertaEn -- GetTime() de cuando se abrió la ventana (nil con ella cerrada)
local intentos = 0 -- reintentos seguidos sin poder medir (hasta MAX_INTENTOS; luego sale lo que haya)
local oroVisto = false -- el oro ya se enseña medido desde que se abrió la ventana
local esperoBoton = false -- la medida de ahora se dejó para el fotograma siguiente porque el botón cambió de ancho
local formaVista -- la forma del oro que se ve (1 la entera; 0 nada; nil sin enseñar): con el asa cogida, solo se acorta
SubastaVentana.medidasOro = 0 -- cuántas veces se ha medido el oro de verdad (para las pruebas)

local function aLaVista()
  return raiz ~= nil and raiz:IsShown()
end

-- El oro y el punto, a la vista o no. Mientras el oro no está medido de verdad no se ve (ni el punto, que va pegado a él y
-- se movería): al abrir sale una sola vez, ya en su forma final. Sin animación, de golpe y una sola vez. El punto sin
-- enseñar tampoco coge el ratón (ni saca su tooltip).
local function verOro(si)
  local a = si and 1 or 0
  marcos.oro:SetAlpha(a)
  if marcos.punto then
    marcos.punto:SetAlpha(a)
    marcos.punto:EnableMouse(si and true or false)
  end
end

-- La letra propia aún no ha cargado (la primera vez que se usa): GetStringWidth da 0 y nada se puede medir.
local function letraSinCargar()
  local ultima = marcos.pestanas[PESTANAS[#PESTANAS]]
  return marcos.oro:GetStringWidth() <= 0 or (ultima ~= nil and ultima.texto:GetStringWidth() <= 0)
end

-- Al abrir (el oro aún sin enseñar): ¿queda alguna recolocación pendiente que pueda cambiar el ancho de la ventana un
-- fotograma después? Lo dice ui/comercio.lua (opciones.pendiente). Se le hace caso ESPERA_ABRIR s como mucho.
local function quedaPendiente()
  if oroVisto or not opciones.pendiente or GetTime() - (abiertaEn or 0) >= ESPERA_ABRIR then
    return false
  end
  local ok, si = pcall(opciones.pendiente)
  return ok and si and true or false
end

-- Pide una medida del oro para el fotograma siguiente. Sin C_Timer, mide al momento.
--   - Con el oro ya a la vista (tras un cambio de tamaño, de escala, de pantalla o de idioma): el cliente puede tener aún
--     los bordes de antes, así que se mide en el fotograma siguiente y solo entonces (cambia de forma como mucho una
--     vez). Varios cambios antes de que llegue dan una sola medida.
--   - Al abrir (el oro aún sin enseñar): se mide en el fotograma siguiente al último cambio. Si llega otro cambio en un
--     fotograma posterior con la medida aún sin hacer, la medida pasa al siguiente a ese (la pedida antes ya no mide); y
--     si al ir a medir queda una recolocación pendiente, se espera otro fotograma. Todo ello ESPERA_ABRIR s como mucho:
--     no hay cadena sin fin.
local function pedirOro()
  if not aLaVista() then
    return -- escondida no se mide: al abrir se pide de nuevo
  end
  local t = GetTime()
  if esperaFotograma and (oroVisto or pedidoEn == t or t - (abiertaEn or t) >= ESPERA_ABRIR) then
    return -- ya hay una medida pedida, y vale
  end
  esperaFotograma, pedidoEn = true, t
  turno = turno + 1
  local mio = turno
  local pedida = luego(0, function()
    if mio ~= turno then
      return -- después se pidió otra: mide esa
    end
    esperaFotograma = false
    if not aLaVista() then
      return
    end
    if quedaPendiente() then
      pedirOro()
    else
      pintar()
    end
  end)
  if not pedida then
    esperaFotograma = false
    pintar()
  end
end

-- Si no se pudo medir (letra sin cargar o bordes sin resolver), otra medida ESPERA_LETRA s después, como mucho
-- MAX_INTENTOS veces seguidas (2 s): no hay cadena sin fin. Devuelve true si queda una medida esperando; false si ya no se
-- espera más (se acabaron los intentos o no hay C_Timer).
local function reintentar()
  if esperaLetra then
    return true
  end
  if intentos >= MAX_INTENTOS then
    return false
  end
  local pedida = luego(ESPERA_LETRA, function()
    esperaLetra = false
    if not aLaVista() or esperaFotograma then
      return -- escondida, o ya hay una medida pedida para el fotograma siguiente
    end
    if quedaPendiente() then
      pedirOro()
    else
      pintar()
    end
  end)
  if not pedida then
    return false
  end
  esperaLetra = true
  intentos = intentos + 1
  return true
end

-- Elige la forma: la entera si cabe con LIBRE_ORO px libres; si no, sin el cobre; si no, solo el oro. Si ni así, solo el
-- oro si cabe sin margen; y si no, nada (queda el tooltip con la cantidad). Devuelve el texto, su ancho y el número de la
-- forma (1 la entera, #formas + 1 nada). Con `desde`, solo las formas desde esa (las de antes, más largas, no se miran):
-- mientras se estira, el oro solo se acorta.
local function elegirForma(formas, sitio, desde)
  local oro = marcos.oro
  desde = desde or 1
  for i = desde, #formas do
    local t = formas[i]
    oro:SetText(t)
    local w = oro:GetStringWidth()
    if w + LIBRE_ORO <= sitio then
      return t, w, i
    end
  end
  if desde <= #formas then
    oro:SetText(formas[#formas])
    local w = oro:GetStringWidth()
    if w <= sitio then
      return formas[#formas], w, #formas
    end
  end
  return "", 0, #formas + 1
end

-- El ancho de un texto del oro cuando no se puede medir: medio tamaño de letra por cada letra (sin contar los colores).
-- Se queda corto antes que largo, para que la zona del tooltip no pise el punto.
local function anchoAprox(t)
  local limpio = string.gsub(string.gsub(t, "|c%x%x%x%x%x%x%x%x", ""), "|r", "")
  return #limpio * CABECERA.oro * 0.5
end

-- Mide y pinta el oro. Todo en una sola llamada: lo que se ve es solo la forma elegida, y con el mismo sitio y el mismo oro
-- la elección es siempre la misma.
--   - Con la ventana escondida no hace nada: ni mide, ni marca el oro como visto, ni gasta reintentos.
--   - Si el botón «Vista de Blizzard» acaba de cambiar de ancho (su letra cargó tarde, otro idioma), sus bordes pueden ir
--     un paso por detrás: se mide en el fotograma siguiente (una vez como mucho por esto).
--   - Si no se puede medir (letra sin cargar o bordes sin resolver), lo que ya se ve se queda como está (o, si aún no se
--     ha enseñado, sigue sin verse) y se reintenta. Pasados MAX_INTENTOS sin poder medir, o sin C_Timer para reintentar,
--     sale la forma más corta que cabe con lo que haya. La zona del tooltip va entonces con un ancho aproximado
--     (anchoAprox, sin pasarse del sitio), porque el texto no se puede medir; el tooltip sigue funcionando.
--   - Medido: sale la forma elegida y, si aún no se veía, se enseña ya (una sola vez).
pintar = function()
  local oro = marcos.oro
  if not oro or not aLaVista() then
    return
  end
  local antes = marcos.verBlizzard:GetWidth()
  anchoBoton() -- el botón sigue a su texto (también si su letra ha cargado tarde)
  if marcos.verBlizzard:GetWidth() ~= antes and not esperoBoton then
    esperoBoton = true
    pedirOro()
    return
  end
  esperoBoton = false
  local formas = formasOro(GetMoney())
  local sitio = sitioOro()
  local medible = sitio ~= nil
  if medible then
    oro:SetText(formas[1])
    medible = not letraSinCargar()
  end
  local elegida, ancho, cual
  if medible then
    -- Con el asa cogida, solo una forma igual o más corta que la que se ve (o nada, si ya no se ve nada).
    local desde
    if oroVisto and formaVista and marcos.asa and marcos.asa.estirando then
      desde = formaVista == 0 and #formas + 1 or math.min(formaVista, #formas)
    end
    elegida, ancho, cual = elegirForma(formas, sitio, desde)
    intentos = 0
  elseif reintentar() then
    -- Aún se puede esperar: lo que se ve no cambia y se vuelve a medir más tarde.
    if not oroVisto then
      oro:SetText("")
    end
    return
  else
    -- Ya no se espera más: la forma más corta que cabe con lo que haya (sin sitio, la más corta).
    if sitio then
      elegida = elegirForma({formas[#formas]}, sitio)
    else
      elegida = formas[#formas]
    end
    cual = #formas
    if elegida ~= "" then
      ancho = anchoAprox(elegida)
      if sitio then
        ancho = math.min(ancho, sitio)
      end
    end
  end
  SubastaVentana.medidasOro = SubastaVentana.medidasOro + 1
  oro:SetText(elegida)
  formaVista = elegida == "" and 0 or cual -- 0: no se ve nada (con el asa cogida, así se queda)
  if marcos.zonaOro then
    -- Sin texto, la zona del tooltip ocupa el hueco entre el punto y el botón (no pisa el punto, que tiene el suyo).
    marcos.zonaOro:SetWidth(math.max(HUECO_PUNTO, ancho or 0))
  end
  if not oroVisto then
    oroVisto = true
    verOro(true)
  end
end

-- Al esconder la ventana: la próxima vez que se abra, el oro no se ve hasta estar medido. Las medidas pedidas ya no valen.
local function olvidarOro()
  oroVisto = false
  intentos = 0
  esperoBoton = false
  formaVista = nil
  esperaFotograma = false
  turno = turno + 1
  abiertaEn = nil
  if marcos.oro then
    verOro(false)
  end
end

-- El oro, ya. Con la ventana escondida, nada. Al abrir (el oro aún sin enseñar) nunca al momento: se pide para el fotograma
-- siguiente, por si queda alguna recolocación (pedirOro).
function SubastaVentana.pintarOro()
  if not aLaVista() then
    return
  end
  if oroVisto then
    pintar()
  else
    pedirOro()
  end
end
SubastaVentana.pedirOro = pedirOro

function SubastaVentana.ponerAvisos(lista)
  avisos = {}
  for _, t in ipairs(type(lista) == "table" and lista or {}) do
    if type(t) == "string" and t ~= "" then
      avisos[#avisos + 1] = t
    end
  end
  if marcos.punto then
    marcos.punto:refresh()
  end
end

local function crearDerecha(cab)
  local b = Piezas.boton(cab, L.t("COMERCIO_VER_BLIZZARD"), function()
    if opciones.alVistaBlizzard then
      opciones.alVistaBlizzard()
    end
  end, {borde = true, alto = ALTO_BOTON})
  -- B3r: Montserrat Medium 11 (la letra «texto» del tema), no la «boton» (SemiBold): es la medida de «WoW UI» de TSM, y con
  -- SemiBold, a 830 px, el oro (5g 00s 00c sin el punto) ya no cabría entero en la fila 1.
  Tema.letra(b.texto, "boton", TAMANO_BOTON)
  b.texto:ClearAllPoints()
  b.texto:SetPoint("CENTER", b, "CENTER", 0, 0)
  b:SetPoint("RIGHT", cab.cerrar, "LEFT", -HUECO_X, 0)
  marcos.verBlizzard = b
  anchoBoton()

  local oro = Tema.letra(cab:CreateFontString(nil, "OVERLAY"), "tablaNegrita", CABECERA.oro)
  oro:SetJustifyH("RIGHT")
  oro:SetPoint("RIGHT", b, "LEFT", -HUECO_ORO, 0)
  poner(oro, "texto")
  marcos.oro = oro
  -- El tooltip del oro (siempre la cantidad entera, aunque el texto vaya acortado). La zona recoge el ratón, así que lo que
  -- se hace con él ahí (arrastrar, el clic derecho) se pasa a la cabecera: desde el oro se sigue moviendo la ventana.
  local zona = CreateFrame("Frame", nil, cab)
  zona:SetPoint("RIGHT", oro, "RIGHT", 0, 0)
  zona:SetSize(1, ALTO_BOTON)
  zona:EnableMouse(true)
  zona:RegisterForDrag("LeftButton")
  for _, script in ipairs({"OnDragStart", "OnDragStop", "OnMouseUp"}) do
    zona:SetScript(script, function(_, ...)
      local f = cab:GetScript(script)
      if f then
        f(cab, ...)
      end
    end)
  end
  zona:SetScript("OnEnter", Piezas.proteger(function(self)
    tooltip(self, Tema.dinero(GetMoney()))
  end))
  zona:SetScript("OnLeave", Piezas.proteger(sinTooltip))
  marcos.zonaOro = zona

  local punto = Piezas.puntoEstado(cab, TAMANO_PUNTO, function() return avisos end)
  punto:SetPoint("RIGHT", oro, "LEFT", -HUECO_PUNTO, 0)
  marcos.punto = punto
  verOro(false) -- hasta que el oro esté medido no se ve (ni el punto, que tampoco coge el ratón)
end

function SubastaVentana.idioma()
  if not marcos.cabecera then
    return
  end
  marcos.cabecera:ponerTextos()
  layoutTabs()
  marcos.verBlizzard:ponerTexto(L.t("COMERCIO_VER_BLIZZARD"))
  anchoBoton()
  SubastaVentana.pedirOro() -- las pestañas y el botón cambian de ancho (se mide en el fotograma siguiente)
  for _, m in pairs(marcos.paginas) do
    if m.sinPagina then
      m.sinPagina:SetText(L.t("PRINCIPAL_SIN_PAGINA"))
    end
  end
  for _, reg in pairs(registradas) do
    if reg.creada and reg.idioma then
      reg.idioma()
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Montar
---------------------------------------------------------------------------------------------------

function SubastaVentana.montar(r, o)
  raiz = r
  opciones = type(o) == "table" and o or {}
  -- The backing color is also visible beneath the textured iron plate.
  if raiz.fondo then
    local c = Tema.color("fondo")
    raiz.fondo:SetVertexColor(c[1], c[2], c[3], 1)
  end
  raiz:SetResizable(true)

  local cab = Piezas.cabeceraVentana(raiz, {
    nombres = PESTANAS,
    texto = function(nombre) return L.t(TEXTOS_PESTANA[nombre]) end,
    elegida = pestanaElegida,
    alElegir = SubastaVentana.elegir,
    alCerrar = function()
      if opciones.alCerrar then
        opciones.alCerrar()
      end
    end,
  })
  marcos.cabecera = cab
  marcos.icono, marcos.logo, marcos.pestanas, marcos.cerrar = cab.icono, cab.logo, cab.pestanas, cab.cerrar
  crearDerecha(cab)
  -- Los botones de la cabecera recogen el ratón antes que ella: pulsarlos no arrastra la ventana.
  for _, b in pairs(cab.pestanas) do
    b:EnableMouse(true)
  end
  -- (El punto rojo no: coge el ratón solo cuando se enseña, ver verOro.)
  for _, b in ipairs({cab.cerrar, marcos.verBlizzard}) do
    b:EnableMouse(true)
  end
  -- La escala de interfaz o la pantalla cambian: la ventana se vuelve a colocar (sigue midiendo lo mismo en píxeles).
  cab:SetScript("OnEvent", Piezas.proteger(function()
    if raiz:IsShown() and opciones.alCambiarPantalla then
      opciones.alCambiarPantalla()
    end
  end))
  -- La ventana cambia de ancho (el asa, o al colocarla): se vuelve a decidir cómo va el oro. Solo cuando cambia el tamaño.
  cab:SetScript("OnSizeChanged", Piezas.proteger(function()
    SubastaVentana.pedirOro()
  end))

  local contenido = CreateFrame("Frame", nil, raiz)
  contenido:SetPoint("TOPLEFT", cab, "BOTTOMLEFT", 0, 0)
  contenido:SetPoint("BOTTOMRIGHT", raiz, "BOTTOMRIGHT", 0, 0)
  marcos.contenido = contenido
  layoutTabs = Piezas.resizableTabs(raiz, cab, PESTANAS, "auctionTabSizes", function()
    return HUECO_X + marcos.verBlizzard:GetWidth() + HUECO_ORO + TAMANO_PUNTO + HUECO_PUNTO + LIBRE_ORO + 60
  end, function()
    local scale = limitar(math.min(raiz:GetWidth() / 1080, raiz:GetHeight() / 700), 1, 1.35)
    if SNF.Ajustes.get("auction.largeText") then scale = math.min(scale * 1.15, 1.5) end
    contenido:SetScale(scale)
    return scale
  end, SubastaVentana.pedirOro)

  -- El asa estira desde la esquina de arriba a la izquierda, que no se mueve: se ancla ahí antes de empezar.
  marcos.asa = Piezas.asaVentana(raiz, {
    empezar = function()
      if not raiz:IsShown() or (opciones.puedeMover and not opciones.puedeMover()) then
        return false
      end
      local s = SubastaVentana.sitioActual()
      if s then
        raiz:ClearAllPoints()
        raiz:SetPoint("TOPLEFT", UIParent, "TOPLEFT", s.x, -s.y)
        limitesAsa(s.x, s.y) -- no se estira más allá del borde de la pantalla
      end
      arrastreTablas(true) -- mientras se arrastra no sale ninguna fila nueva en las tablas (revisión B7)
    end,
    soltar = function()
      arrastreTablas(false) -- las filas que caben, una sola vez
      SubastaVentana.guardarSitio()
      SubastaVentana.pedirOro()
    end,
  })
  SubastaVentana.ponerAvisos(avisos)
  return marcos
end

function SubastaVentana.alMostrar()
  if not raiz then
    return
  end
  local cab = marcos.cabecera
  layoutTabs()
  cab:RegisterEvent("UI_SCALE_CHANGED")
  cab:RegisterEvent("DISPLAY_SIZE_CHANGED")
  if not oroVisto and not abiertaEn then
    abiertaEn = GetTime()
  end
  SubastaVentana.pintarOro() -- al abrir, en el fotograma siguiente a la última recolocación pendiente
  mostrarPagina()
  luego(0.25, function()
    if SNF.Comercio.ventanaVisible() and SNF.MisSubastas.estado() == "nada" then
      SNF.MisSubastas.pedir()
    end
  end)
end

function SubastaVentana.alOcultar()
  if not raiz then
    return
  end
  local cab = marcos.cabecera
  cab:UnregisterEvent("UI_SCALE_CHANGED")
  cab:UnregisterEvent("DISPLAY_SIZE_CHANGED")
  olvidarOro() -- al volver a abrir, el oro no se ve hasta estar medido
  sinTooltip()
  -- Escondida a medio estirar: se suelta y se guarda como quedó.
  local asa = marcos.asa
  if asa and asa.estirando then
    asa.estirando = false
    raiz:StopMovingOrSizing()
    raiz:SetUserPlaced(false)
    arrastreTablas(false)
    SubastaVentana.guardarSitio()
  end
  if visible then
    local m = marcos.paginas[visible]
    if m then
      m:Hide()
    end
    local reg = registradas[visible]
    visible = nil
    llamar(reg and reg.ocultar)
  end
end

-- El jugador cambia de idioma con la ventana creada: la cabecera y las páginas se repintan.
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "auction.largeText" and raiz then
    layoutTabs()
    SubastaVentana.pedirOro()
  end
  if clave == "idioma" and raiz then
    SubastaVentana.idioma()
  end
end)
