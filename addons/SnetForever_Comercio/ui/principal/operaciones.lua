-- SnetForever: página «Operaciones» de la ventana principal de comercio: panel izquierdo (buscador y árbol de los 7 tipos) y,
-- a la derecha, el resumen del tipo elegido o, si se ha elegido una operación, su editor (Task 22,
-- ui/principal/editor-operacion.lua, SNF.EditorOperacion).
--
-- Panel izquierdo: 278 px en el color `secundario` (el de la captura op-04: 22,28,28), con el buscador (264 x 22, a 7 px de los
-- bordes) y debajo el árbol (Piezas.arbol con sinRaiz): los 7 tipos en `acento` («Operaciones de <tipo>»), cada uno con ▸/▾
-- (blancos) y su ⊕ (círculo blanco con la cruz) siempre a la vista (crea una operación con un nombre libre). Bajo el tipo abierto
-- salen sus operaciones, en blanco y una sangría más adentro; la elegida (y la que tiene el ratón encima) lleva copiar (duplica)
-- y papelera (borra).
--   - Pulsar un tipo lo elige, lo abre y enseña su resumen. El triángulo solo abre y cierra.
--   - Pulsar una operación abre su editor en vez del resumen. Si se borra la operación abierta, vuelve el resumen.
--   - El buscador filtra el árbol mientras se escribe (sin fijarse en mayúsculas ni tildes).
--
-- Resumen de un tipo (op-04, 05, 06, 08, 10, 12 y 14): «N Operaciones de <tipo>» (N en amarillo) y, a la derecha, «⊕ Crear nueva»;
-- dos cajas con MÁS/MENOS GRUPOS y MÁS/MENOS OBJETOS (qué operación se usa en más y en menos; con empate, la primera por orden
-- alfabético); la tabla ⋮ (a la izquierda) · ✓ · Operación (ordenada) · Grupos que la usan · Objetos que la usan (números en
-- negrita; el asterisco de «358*» es el Grupo Base, como en TSM, y su fila lo explica en el tooltip; Task 36: las dos columnas
-- de uso miden 160 px para que sus títulos quepan enteros, y las casillas son discretas: como en op-04, una fila sin marcar no
-- enseña la suya, que sale hueca con el ratón encima y amarilla al marcarla); y abajo «Borrar N
-- operaciones» (apagado con 0), «Marcar todo» y «Borrar todo». El resumen se sigue pintando con el editor a la vista (está
-- escondido): así sus números están al día al volver.
--   - Borrar siempre manda a la papelera (Operaciones.borrar), nunca borra del todo. Si alguna la usan grupos, antes pregunta con
--     un marco propio (el addon no usa StaticPopup; es un marco como el de Grupos).
--   - «Borrar todo» solo quita las marcas (es el «Clear All» de TSM, que en español sale así): no borra operaciones.
--   - Los datos salen de SNF.Operaciones (lista, usos, crear, duplicar, borrar).
--
-- Gancho con Grupos: Grupos.abrirOperacion(tipo, nombre) deja SNF.PrincipalGrupos.operacionPedida = {tipo, nombre} y cambia a esta
-- pestaña. La página recoge operacionPedida al enseñarse (también la primera vez, al crearse) y la borra una vez usada; abrir()
-- también la borra (una petición directa manda sobre la de Grupos). Si al volver de elegir la pestaña la petición sigue ahí,
-- Grupos llama a abrir(): nada se queda sin recoger ni se abre dos veces (Task 22; antes, con la marca «yaAbierta», una petición
-- sin abrir() detrás se tragaba el abrir() siguiente).
--
-- SNF.PrincipalOperaciones: .pagina (el marco de la página; nil hasta la primera vez), .panel, .fondoPanel, .campo (el buscador),
-- .arbol, .derecha, .resumen (el marco del resumen), .editor (el del editor), .titulo, .enlaceCrear (con .icono), .cajas (.grupos
-- y .objetos, cada una con .etiquetaMas, .valorMas, .etiquetaMenos, .valorMenos), .tabla, .botonBorrar, .enlaceMarcar,
-- .enlaceLimpiar, .confirmacion (.texto, .botonBorrar, .botonCancelar).
-- Funciones: .abrir(tipo, nombre?) (abre el tipo en el árbol y elige la operación; un tipo que no existe no cambia nada; una
-- operación que no existe deja elegido el tipo), .elegida() -> tipo, nombre (nombre = nil si solo hay tipo), .tipo() (el tipo que
-- enseña el resumen), .refrescar().
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local Pagina = {}
SNF.PrincipalOperaciones = Pagina

local pintar = Piezas.interno.pintar
local plana = Piezas.interno.plana
local proteger = Piezas.proteger
local colorTexto = Piezas.interno.colorTexto
local sinTecladoEnCombate = Piezas.interno.sinTecladoEnCombate

-- Medidas de las capturas op-04 a op-14 (2560 x 1080; la ventana va a escala de píxel real: una unidad es un píxel).
local ANCHO_PANEL = 278
local MARGEN_PANEL = 7 -- del campo y del árbol a los bordes del panel
local ALTO_CAMPO = 22
local ARRIBA_ARBOL = 40
local IZQUIERDA = 15 -- del panel a lo de la derecha
local DERECHA = 20 -- de lo de la derecha al borde de la página
local CENTRO_TITULO = 18 -- del borde de arriba al centro de la cabecera
local ARRIBA_CAJAS = 36
local ALTO_CAJA = 44
local HUECO_CAJAS = 7
local ARRIBA_TABLA = 94
local ABAJO = 8
local ALTO_BOTON = 22
local HUECO_TABLA = 7 -- de la tabla a la fila de botones
local PAD_CAJA = 9 -- del texto de las cajas a su borde
local ANCHO_COLUMNA_OP = 220
-- Task 36: 160 y no los 127 de op-04: en Montserrat Medium 11 «Objetos que la usan» mide unos 123 px y con el relleno no
-- cabía. Op (220) + ✓ (24) + ⋮ (22) + 2 × 160 cabe de sobra en la ventana al mínimo (700).
local ANCHO_COLUMNA_USO = 160
local LETRA_TABLA = 10
local LETRA_CAJA = 10
local NOMBRE_CONFIRMAR = "SnetForeverOperacionesConfirmar"

local tipoActual -- el tipo que enseña la derecha
local nombreElegido -- la operación elegida (nil si solo hay tipo)
local pendiente -- lo que espera confirmación: {{tipo, nombre}, ...}
local marcadasN = 0 -- operaciones marcadas en la tabla
local pedidaLocal -- una petición de abrir() llegada antes de crearse la página
local recienCreada = false -- la página se acaba de crear y aún no se ha enseñado (su primer «mostrar» no repite el cálculo)

local function datos()
  return rawget(SNF, "Operaciones")
end

local function nombreDeTipo(tipo)
  return L.t("PRINCIPAL_GRUPOS_OPS_TIPO_" .. string.upper(tipo))
end

local function textoDeTipo(tipo)
  return L.t("PRINCIPAL_GRUPOS_OPS_TITULO", nombreDeTipo(tipo))
end

-- Las claves de las filas del árbol: «t:<tipo>» y «o:<tipo>:<nombre>» (el nombre puede llevar cualquier signo; el tipo no lleva «:»).
local function claveTipo(tipo)
  return "t:" .. tipo
end

local function claveOperacion(tipo, nombre)
  return "o:" .. tipo .. ":" .. nombre
end

local function analizar(clave)
  local tipo = string.match(clave or "", "^t:(.*)$")
  if tipo then
    return tipo, nil
  end
  local t, n = string.match(clave or "", "^o:([^:]*):(.*)$")
  return t, n
end

---------------------------------------------------------------------------------------------------
-- Árbol de la izquierda
---------------------------------------------------------------------------------------------------

local function nodos()
  local raiz = {clave = "", texto = "", nivel = 0, hijos = {}}
  local d = datos()
  if not d then
    return raiz
  end
  for _, tipo in ipairs(d.ORDEN) do
    local nodo = {clave = claveTipo(tipo), texto = textoDeTipo(tipo), nivel = 0, color = "acento", hijos = {}}
    for _, nombre in ipairs(d.lista(tipo)) do
      nodo.hijos[#nodo.hijos + 1] = {clave = claveOperacion(tipo, nombre), texto = nombre, nivel = 1, color = "texto"}
    end
    raiz.hijos[#raiz.hijos + 1] = nodo
  end
  return raiz
end

local pintarResumen, pintarDerecha -- (más abajo)

-- Cambiar de tipo quita las marcas de la tabla (no pasan de un tipo a otro).
local function cambiarTipo(nuevo)
  if nuevo ~= tipoActual and Pagina.tabla then
    Pagina.tabla:marcarTodo(false)
  end
  tipoActual = nuevo
end

local function elegirEnArbol()
  local a = Pagina.arbol
  if not a or not tipoActual then
    return
  end
  a:elegir(nombreElegido and claveOperacion(tipoActual, nombreElegido) or claveTipo(tipoActual))
end

-- Vuelve a leer los datos: el árbol (sin perder lo abierto) y el resumen.
function Pagina.refrescar()
  if not Pagina.pagina then
    return
  end
  Pagina.arbol:refrescar()
  elegirEnArbol()
  pintarDerecha()
end

function Pagina.abrir(tipo, nombre)
  local d = datos()
  if not (d and type(tipo) == "string" and d.TIPOS[tipo]) then
    return
  end
  -- Una petición directa manda sobre la que hubiera dejado Grupos (que así no se queda colgada).
  local g = rawget(SNF, "PrincipalGrupos")
  if type(g) == "table" then
    g.operacionPedida = nil
  end
  if not Pagina.pagina then
    pedidaLocal = {tipo = tipo, nombre = nombre}
    return
  end
  cambiarTipo(tipo)
  nombreElegido = (type(nombre) == "string" and d.existe(tipo, nombre)) and nombre or nil
  Pagina.arbol:refrescar()
  Pagina.arbol:abrir(claveTipo(tipo), true)
  elegirEnArbol()
  pintarDerecha()
end

function Pagina.elegida()
  return tipoActual, nombreElegido
end

function Pagina.tipo()
  return tipoActual
end

-- Un nombre libre para una operación nueva: «Nueva operación», «Nueva operación 2»... (la papelera no cuenta).
local function nombreLibre(d, tipo)
  local base = L.t("PRINCIPAL_OPS_NUEVA")
  local nombre, n = base, 1
  while d.existe(tipo, nombre) do
    n = n + 1
    nombre = base .. " " .. n
  end
  return nombre
end

local function crearOperacion(tipo)
  local d = datos()
  if not d then
    return
  end
  local nuevo = d.crear(tipo, nombreLibre(d, tipo))
  if nuevo then
    Pagina.abrir(tipo, nuevo)
  end
end

local function duplicarOperacion(tipo, nombre)
  local d = datos()
  local nuevo = d and d.duplicar(tipo, nombre)
  if nuevo then
    Pagina.abrir(tipo, nuevo)
  end
end

local function botonesDe(clave)
  local tipo, nombre = analizar(clave)
  if tipo and not nombre then
    return {{icono = "masCirculo", color = "texto", ayuda = Piezas.ayudaDe("PRINCIPAL_AYUDA_CREAR_OP"), alPulsar = function() crearOperacion(tipo) end}}
  end
  if tipo and nombre then
    return {
      {icono = "copiar", ayuda = Piezas.ayudaDe("PRINCIPAL_AYUDA_DUPLICAR_OP"), alPulsar = function() duplicarOperacion(tipo, nombre) end},
      {icono = "papelera", ayuda = Piezas.ayudaDe("PRINCIPAL_AYUDA_BORRAR_OP"), alPulsar = function() Pagina.pedirBorrado({{tipo = tipo, nombre = nombre}}) end},
    }
  end
  return {}
end

local function alElegir(clave)
  local tipo, nombre = analizar(clave)
  if not tipo then
    return
  end
  cambiarTipo(tipo)
  nombreElegido = nombre
  if not nombre then
    Pagina.arbol:abrir(clave, true) -- pulsar un tipo lo abre
  end
  pintarDerecha()
end

---------------------------------------------------------------------------------------------------
-- Borrar (siempre a la papelera) y su confirmación
---------------------------------------------------------------------------------------------------

local function quitarDeEspeciales()
  for k = #UISpecialFrames, 1, -1 do
    if UISpecialFrames[k] == NOMBRE_CONFIRMAR then
      table.remove(UISpecialFrames, k)
    end
  end
end

local function cerrarConfirmacion()
  pendiente = nil
  if Pagina.confirmacion then
    Pagina.confirmacion:Hide()
  end
  quitarDeEspeciales()
end

local function borrarLista(lista)
  local d = datos()
  if not d then
    return
  end
  for _, op in ipairs(lista) do
    if d.borrar(op.tipo, op.nombre) and op.tipo == tipoActual and op.nombre == nombreElegido then
      nombreElegido = nil
    end
  end
  Pagina.refrescar()
end

local function confirmarBorrado()
  local lista = pendiente
  cerrarConfirmacion()
  if lista then
    borrarLista(lista)
  end
end

local function crearConfirmacion()
  local c = CreateFrame("Frame", NOMBRE_CONFIRMAR, UIParent)
  SNF.WindowSizing.register(c, NOMBRE_CONFIRMAR, true)
  c:SetSize(340, 112)
  c:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  c:SetFrameStrata("FULLSCREEN_DIALOG")
  c:EnableMouse(true)
  Tema.panel(c, "fondo", {borde = true})
  local t = Tema.letra(c:CreateFontString(nil, "OVERLAY"), "texto")
  t:SetPoint("TOPLEFT", c, "TOPLEFT", 12, -14)
  t:SetPoint("TOPRIGHT", c, "TOPRIGHT", -12, -14)
  t:SetJustifyH("LEFT")
  t:SetJustifyV("TOP")
  t:SetHeight(56)
  c.texto = t
  c.botonBorrar = Piezas.boton(c, L.t("PRINCIPAL_GRUPOS_BORRAR"), confirmarBorrado, {ancho = 96})
  c.botonBorrar:SetPoint("BOTTOMRIGHT", c, "BOTTOMRIGHT", -12, 12)
  c.botonCancelar = Piezas.boton(c, L.t("PRINCIPAL_GRUPOS_CANCELAR"), cerrarConfirmacion, {ancho = 96, borde = true})
  c.botonCancelar:SetPoint("RIGHT", c.botonBorrar, "LEFT", -8, 0)
  c:Hide()
  return c
end

-- Los grupos que usan cada operación de la lista: una sola pasada por tipo, no una por operación.
local function gruposDe(lista)
  local d = datos()
  local porTipo, salida = {}, {}
  for i, op in ipairs(lista) do
    if d and not porTipo[op.tipo] then
      porTipo[op.tipo] = d.usosDeTipo(op.tipo)
    end
    local u = porTipo[op.tipo] and porTipo[op.tipo][op.nombre]
    salida[i] = u and u.grupos or 0
  end
  return salida
end

local function textoConfirmacion()
  local lista = pendiente
  if not lista then
    return ""
  end
  local grupos = gruposDe(lista)
  local usadas, primera, gruposPrimera = 0, nil, 0
  for i, op in ipairs(lista) do
    if grupos[i] > 0 then
      usadas = usadas + 1
      if not primera then
        primera, gruposPrimera = op.nombre, grupos[i]
      end
    end
  end
  if #lista == 1 then
    return L.t("PRINCIPAL_OPS_CONFIRMAR_UNA", primera or lista[1].nombre, gruposPrimera)
  end
  return L.t("PRINCIPAL_OPS_CONFIRMAR_VARIAS", #lista, usadas)
end

-- Manda las operaciones a la papelera; si alguna la usan grupos, antes pregunta.
function Pagina.pedirBorrado(lista)
  local d = datos()
  if not d or type(lista) ~= "table" or #lista == 0 then
    return
  end
  local usada = false
  for _, grupos in ipairs(gruposDe(lista)) do
    if grupos > 0 then
      usada = true
      break
    end
  end
  if not usada then
    borrarLista(lista)
    return
  end
  local c = Pagina.confirmacion
  if not c then
    return
  end
  pendiente = lista
  c.texto:SetText(textoConfirmacion())
  c:Show()
  -- Escape la cierra (entra en UISpecialFrames solo mientras está abierta).
  quitarDeEspeciales()
  table.insert(UISpecialFrames, NOMBRE_CONFIRMAR)
end

local function borrarMarcadas()
  if not Pagina.tabla or not tipoActual then
    return
  end
  local lista = {}
  local marcadas = Pagina.tabla:marcadas() -- una copia: se pide una vez, no en cada vuelta
  for _, f in ipairs(Pagina.tabla.todas or {}) do
    if marcadas[f.clave] then
      lista[#lista + 1] = {tipo = tipoActual, nombre = f.nombre}
    end
  end
  Pagina.pedirBorrado(lista)
end

---------------------------------------------------------------------------------------------------
-- Resumen de un tipo
---------------------------------------------------------------------------------------------------

local function textoBorrar(n)
  return L.t(n == 1 and "PRINCIPAL_OPS_BORRAR_N_UNO" or "PRINCIPAL_OPS_BORRAR_N", n)
end

local function actualizarBotones()
  if not Pagina.botonBorrar then
    return
  end
  Pagina.botonBorrar:ponerTexto(textoBorrar(marcadasN))
  Pagina.botonBorrar:ponerApagado(marcadasN == 0)
  Pagina.enlaceLimpiar:ponerApagado(marcadasN == 0)
end

-- La tabla avisa de cada cambio de marcas por su «totales» (que nunca saca barra): aquí se cuentan.
local function alMarcar(_, marcadas)
  local n = 0
  for _ in pairs(marcadas or {}) do
    n = n + 1
  end
  marcadasN = n
  actualizarBotones()
  return nil
end

local function filasDe(tipo)
  local d = datos()
  local filas = {}
  if not d then
    return filas
  end
  local usos = d.usosDeTipo(tipo) -- de una pasada: contar operación a operación recorre todos los grupos una vez por cada una
  for _, nombre in ipairs(d.lista(tipo)) do
    local u = usos[nombre] or {grupos = 0, objetos = 0, conBase = false}
    filas[#filas + 1] = {clave = tipo .. ":" .. nombre, nombre = nombre, grupos = u.grupos, objetos = u.objetos, base = u.conBase}
  end
  return filas
end

-- La operación con más (o menos) usos; con empate, la primera de la lista (orden alfabético).
local function extremo(filas, campo, masAlto)
  local mejor
  for _, f in ipairs(filas) do
    if not mejor or (masAlto and f[campo] > mejor[campo]) or (not masAlto and f[campo] < mejor[campo]) then
      mejor = f
    end
  end
  return mejor and mejor.nombre or ""
end

local function textoTitulo(n)
  return "|cff" .. Tema.hex("acento") .. n .. "|r " .. textoDeTipo(tipoActual)
end

pintarResumen = function()
  if not Pagina.derecha or not tipoActual then
    return
  end
  local filas = filasDe(tipoActual)
  Pagina.titulo:SetText(textoTitulo(#filas))
  local g, o = Pagina.cajas.grupos, Pagina.cajas.objetos
  g.valorMas:SetText(extremo(filas, "grupos", true))
  g.valorMenos:SetText(extremo(filas, "grupos", false))
  o.valorMas:SetText(extremo(filas, "objetos", true))
  o.valorMenos:SetText(extremo(filas, "objetos", false))
  Pagina.tabla.todas = filas
  Pagina.tabla:poner(filas) -- quita las marcas de lo que ya no está y avisa por «totales»
  actualizarBotones()
end

-- Con una operación elegida (que exista) se ve su editor; si no, el resumen del tipo.
local function mostrarVista()
  local d = datos()
  if not (Pagina.editor and Pagina.resumen) then
    return
  end
  if tipoActual and nombreElegido and d and d.existe(tipoActual, nombreElegido) then
    Pagina.resumen:Hide()
    Pagina.editor:Show()
    Pagina.editor:abrir(tipoActual, nombreElegido)
  else
    Pagina.editor:Hide()
    Pagina.resumen:Show()
  end
end

pintarDerecha = function()
  pintarResumen()
  mostrarVista()
end

-- El tooltip del asterisco («3*»: la operación está en el Grupo Base), en las filas que lo llevan. La tabla avisa al cambiar
-- la fila del ratón (alEntrar) y cuando ya no hay ninguna (alSalir).
local duenoTooltip -- la fila de la tabla que enseña el tooltip

local function salirFila()
  local tt = rawget(_G, "GameTooltip")
  if duenoTooltip and tt and not (tt.IsForbidden and tt:IsForbidden()) and tt:GetOwner() == duenoTooltip then
    tt:Hide()
  end
  duenoTooltip = nil
end

local function entrarFila(fila, marco)
  salirFila()
  local tt = rawget(_G, "GameTooltip")
  if not (fila and fila.base and marco) or not tt or (tt.IsForbidden and tt:IsForbidden()) then
    return
  end
  tt:SetOwner(marco, "ANCHOR_RIGHT")
  tt:SetText(L.t("PRINCIPAL_OPS_ASTERISCO"), 1, 1, 1, 1, true)
  tt:Show()
  duenoTooltip = marco
end

-- Los números de la tabla en Roboto Bold (las celdas se reutilizan: la letra se pone una vez por celda).
local function pintarCelda(celda, fila, columna)
  if not celda.snfNegrita then
    celda.snfNegrita = true
    Tema.letra(celda.texto, "tablaNegrita", LETRA_TABLA)
  end
  if columna == "objetos" then
    celda.texto:SetText(fila.base and (fila.objetos .. "*") or tostring(fila.objetos))
  end
end

local function crearTabla(der)
  local columnas = {
    {clave = "op", titulo = L.t("PRINCIPAL_OPS_COL_OPERACION"), ancho = ANCHO_COLUMNA_OP, valor = function(f) return f.nombre end,
      pintar = function(celda, f) pintarCelda(celda, f, "op") end},
    {clave = "grupos", titulo = L.t("PRINCIPAL_OPS_COL_GRUPOS"), ancho = ANCHO_COLUMNA_USO, valor = function(f) return f.grupos end,
      pintar = function(celda, f) pintarCelda(celda, f, "grupos") end},
    {clave = "objetos", titulo = L.t("PRINCIPAL_OPS_COL_OBJETOS"), ancho = ANCHO_COLUMNA_USO, valor = function(f) return f.objetos end,
      pintar = function(celda, f) pintarCelda(celda, f, "objetos") end},
  }
  -- La clave de cada fila lleva el tipo («subasta:Alta»): una marca de un tipo nunca vale para otro.
  local t = Piezas.tabla(der, {
    marcar = true, casillaDiscreta = true, menu = true, menuIzquierda = true, borde = true, letra = LETRA_TABLA, columnas = columnas,
    orden = {clave = "op", asc = true}, totales = alMarcar, alEntrar = entrarFila, alSalir = salirFila,
  })
  t:SetPoint("TOPLEFT", der, "TOPLEFT", 0, -ARRIBA_TABLA)
  t:SetPoint("BOTTOMRIGHT", der, "BOTTOMRIGHT", 0, ABAJO + ALTO_BOTON + HUECO_TABLA)
  return t
end

local function crearCaja(der, etiquetaMas, etiquetaMenos)
  local c = Piezas.tarjeta(der)
  c:SetHeight(ALTO_CAJA)
  local function linea(clave, y)
    local e = Tema.letra(c:CreateFontString(nil, "OVERLAY"), "mayusculas", LETRA_CAJA)
    colorTexto(e, "textoPestana")
    e:SetPoint("LEFT", c, "TOPLEFT", PAD_CAJA, y)
    e:SetJustifyH("LEFT")
    e:SetText(L.t(clave))
    local v = Tema.letra(c:CreateFontString(nil, "OVERLAY"), "tabla", LETRA_CAJA)
    colorTexto(v, "texto")
    v:SetPoint("RIGHT", c, "TOPRIGHT", -PAD_CAJA, y)
    v:SetJustifyH("RIGHT")
    return e, v
  end
  c.claves = {etiquetaMas, etiquetaMenos}
  c.etiquetaMas, c.valorMas = linea(etiquetaMas, -ALTO_CAJA / 4)
  c.etiquetaMenos, c.valorMenos = linea(etiquetaMenos, -3 * ALTO_CAJA / 4)
  return c
end

-- «⊕ Crear nueva»: un enlace amarillo con el icono delante (la zona que se pulsa incluye el icono).
local function crearEnlaceCrear(der)
  local e = Piezas.enlace(der, L.t("PRINCIPAL_OPS_CREAR"), function()
    if tipoActual then
      crearOperacion(tipoActual)
    end
  end)
  e:SetPoint("RIGHT", der, "TOPRIGHT", -13, -CENTRO_TITULO)
  local icono = e:CreateTexture(nil, "OVERLAY")
  icono:SetSize(12, 12)
  icono:SetPoint("RIGHT", e, "LEFT", -4, 0)
  Tema.icono(icono, "masCirculo")
  pintar(icono, "enlace")
  e.icono = icono
  if e.SetHitRectInsets then
    e:SetHitRectInsets(-16, 0, 0, 0)
  end
  return e
end

local function crearDerecha(padre)
  local fuera = CreateFrame("Frame", nil, padre)
  fuera:SetPoint("TOPLEFT", padre, "TOPLEFT", ANCHO_PANEL + IZQUIERDA, 0)
  fuera:SetPoint("BOTTOMRIGHT", padre, "BOTTOMRIGHT", -DERECHA, 0)
  Pagina.derecha = fuera
  -- El editor de una operación ocupa el mismo sitio que el resumen; solo se ve uno de los dos.
  Pagina.editor = SNF.EditorOperacion.crear(fuera, {
    alRenombrar = function(tipo, nuevo) Pagina.abrir(tipo, nuevo) end,
    alCambiar = function() pintarResumen() end, -- se aplicó o se quitó de un grupo: cambian los usos
  })
  Pagina.editor:SetAllPoints(fuera)
  Pagina.editor:Hide()
  local der = CreateFrame("Frame", nil, fuera)
  der:SetAllPoints(fuera)
  Pagina.resumen = der

  local titulo = Tema.letra(der:CreateFontString(nil, "OVERLAY"), "titulo")
  colorTexto(titulo, "texto")
  titulo:SetPoint("LEFT", der, "TOPLEFT", 0, -CENTRO_TITULO)
  titulo:SetJustifyH("LEFT")
  Pagina.titulo = titulo
  Pagina.enlaceCrear = crearEnlaceCrear(der)

  -- Las dos cajas, con 7 px entre ellas (cada una la mitad del ancho que queda).
  local grupos = crearCaja(der, "PRINCIPAL_OPS_MAS_GRUPOS", "PRINCIPAL_OPS_MENOS_GRUPOS")
  grupos:SetPoint("TOPLEFT", der, "TOPLEFT", 0, -ARRIBA_CAJAS)
  grupos:SetPoint("TOPRIGHT", der, "TOP", -HUECO_CAJAS / 2, -ARRIBA_CAJAS)
  local objetos = crearCaja(der, "PRINCIPAL_OPS_MAS_OBJETOS", "PRINCIPAL_OPS_MENOS_OBJETOS")
  objetos:SetPoint("TOPLEFT", der, "TOP", HUECO_CAJAS / 2, -ARRIBA_CAJAS)
  objetos:SetPoint("TOPRIGHT", der, "TOPRIGHT", 0, -ARRIBA_CAJAS)
  Pagina.cajas = {grupos = grupos, objetos = objetos}

  Pagina.tabla = crearTabla(der)

  -- La fila de abajo: «Borrar N operaciones» (ancho, apagado con 0), «Marcar todo» y «Borrar todo».
  Pagina.enlaceLimpiar = Piezas.enlace(der, L.t("PRINCIPAL_OPS_BORRAR_TODO"), function()
    Pagina.tabla:marcarTodo(false)
  end)
  Pagina.enlaceLimpiar:SetPoint("BOTTOMRIGHT", der, "BOTTOMRIGHT", -18, ABAJO + 3)
  Pagina.enlaceMarcar = Piezas.enlace(der, L.t("PRINCIPAL_OPS_MARCAR_TODO"), function()
    Pagina.tabla:marcarTodo(true)
  end)
  Pagina.enlaceMarcar:SetPoint("BOTTOMRIGHT", Pagina.enlaceLimpiar, "BOTTOMLEFT", -36, 0)
  Pagina.botonBorrar = Piezas.boton(der, textoBorrar(0), borrarMarcadas, {alto = ALTO_BOTON})
  Pagina.botonBorrar:SetPoint("BOTTOMLEFT", der, "BOTTOMLEFT", 0, ABAJO)
  Pagina.botonBorrar:SetPoint("BOTTOMRIGHT", Pagina.enlaceMarcar, "BOTTOMLEFT", -23, -3)
  Pagina.botonBorrar:SetHeight(ALTO_BOTON)
end

---------------------------------------------------------------------------------------------------
-- La página
---------------------------------------------------------------------------------------------------

-- Recoge lo que pidió Grupos (↗) o una llamada a abrir() anterior a crearse la página; la petición se borra al usarla.
local function recogerPeticion()
  local p = pedidaLocal
  pedidaLocal = nil
  local g = rawget(SNF, "PrincipalGrupos")
  if type(g) == "table" and type(g.operacionPedida) == "table" then
    p = g.operacionPedida
    g.operacionPedida = nil
  end
  if p then
    Pagina.abrir(p.tipo, p.nombre)
  end
  return p ~= nil
end

local function crearPagina(padre)
  local panel = CreateFrame("Frame", nil, padre)
  panel:SetPoint("TOPLEFT", padre, "TOPLEFT", 0, 0)
  panel:SetPoint("BOTTOMLEFT", padre, "BOTTOMLEFT", 0, 0)
  panel:SetWidth(ANCHO_PANEL)
  local fondo = plana(panel, "BACKGROUND", 0)
  fondo:SetAllPoints(panel)
  pintar(fondo, "secundario") -- 22,28,28 como el panel de la captura op-04
  Pagina.fondoPanel = fondo
  Pagina.panel = panel

  local campo = Piezas.campo(panel, {ancho = ANCHO_PANEL - 2 * MARGEN_PANEL, alto = ALTO_CAMPO, lupa = true, placeholder = L.t("PRINCIPAL_OPS_BUSCAR")})
  campo:SetPoint("TOPLEFT", panel, "TOPLEFT", MARGEN_PANEL, -MARGEN_PANEL)
  Pagina.campo = campo

  local a = Piezas.arbol(panel, {
    sinRaiz = true, sinBarraElegida = true, margen = 4, sangria = 11, colorTriangulo = "texto", nodos = nodos, botones = botonesDe,
    botonesSiempre = function(clave)
      local tipo, nombre = analizar(clave)
      return tipo ~= nil and nombre == nil
    end, alElegir = alElegir,
  })
  a:SetPoint("TOPLEFT", panel, "TOPLEFT", MARGEN_PANEL, -ARRIBA_ARBOL)
  a:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -MARGEN_PANEL, ABAJO)
  Pagina.arbol = a

  -- Buscar filtra mientras se escribe.
  local previoTexto = campo:GetScript("OnTextChanged")
  campo:SetScript("OnTextChanged", proteger(function(self, ...)
    if previoTexto then
      previoTexto(self, ...)
    end
    a:filtrar(self:GetText())
  end))
  sinTecladoEnCombate(campo)
  -- Con el combate empezado el buscador no se queda con el teclado.
  panel:RegisterEvent("PLAYER_REGEN_DISABLED")
  panel:SetScript("OnEvent", proteger(function()
    campo:ClearFocus()
  end))

  crearDerecha(padre)
  Pagina.confirmacion = crearConfirmacion()
  Pagina.pagina = padre
  -- Al principio enseña el primer tipo (sin abrirlo), como TSM enseña el primero que hay.
  tipoActual, nombreElegido = datos() and datos().ORDEN[1] or nil, nil
  recienCreada = true
  -- Si llega una petición, su abrir() ya lo pinta todo; si no, se pinta aquí. El primer «mostrar» no lo repite.
  if not recogerPeticion() then
    Pagina.refrescar()
  end
end

local function repintarTextos()
  if not Pagina.pagina then
    return
  end
  Pagina.campo.marcador:SetText(L.t("PRINCIPAL_OPS_BUSCAR"))
  Pagina.enlaceCrear:ponerTexto(L.t("PRINCIPAL_OPS_CREAR"))
  for _, c in pairs(Pagina.cajas) do
    c.etiquetaMas:SetText(L.t(c.claves[1]))
    c.etiquetaMenos:SetText(L.t(c.claves[2]))
  end
  Pagina.tabla.cabeceras.op.texto:SetText(L.t("PRINCIPAL_OPS_COL_OPERACION"))
  Pagina.tabla.cabeceras.grupos.texto:SetText(L.t("PRINCIPAL_OPS_COL_GRUPOS"))
  Pagina.tabla.cabeceras.objetos.texto:SetText(L.t("PRINCIPAL_OPS_COL_OBJETOS"))
  Pagina.enlaceMarcar:ponerTexto(L.t("PRINCIPAL_OPS_MARCAR_TODO"))
  Pagina.enlaceLimpiar:ponerTexto(L.t("PRINCIPAL_OPS_BORRAR_TODO"))
  local c = Pagina.confirmacion
  c.botonBorrar:ponerTexto(L.t("PRINCIPAL_GRUPOS_BORRAR"))
  c.botonCancelar:ponerTexto(L.t("PRINCIPAL_GRUPOS_CANCELAR"))
  if pendiente then
    c.texto:SetText(textoConfirmacion())
  end
  Pagina.editor:repintarTextos()
  Pagina.refrescar() -- los textos de los tipos, el título y «Borrar N operaciones»
end

SNF.Principal.registrar("operaciones", {
  crear = crearPagina,
  mostrar = function()
    if Pagina.pagina then
      local nueva = recienCreada
      recienCreada = false
      local hubo = recogerPeticion()
      if not nueva and not hubo then
        Pagina.refrescar() -- Grupos u otra página pueden haber cambiado las operaciones o sus usos
      end
    end
  end,
  ocultar = function()
    if Pagina.pagina then
      cerrarConfirmacion()
      Pagina.campo:ClearFocus()
    end
  end,
  idioma = repintarTextos,
})
