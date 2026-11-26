-- SnetForever: página «Ajustes» de la ventana principal de comercio (Task 23). Se enchufa en la cabecera con
-- Principal.registrar("ajustes"), sin tocarla.
--
-- A la izquierda, una barra de 152 px en el color `secundario` con los 12 apartados de las capturas aj-01 a aj-12, en el
-- mismo orden y con un hueco tras los dos primeros: Ajustes generales, Tooltip · Contabilidad, Apariencia, Subasta, Destruir,
-- Correo, Fuentes propias, Fabricación, Macros, Navegar / Sniper y Venta. El elegido va en amarillo (`acento`); los demás en
-- gris claro, que se aclara con el ratón encima. Pulsar uno lo enseña a la derecha. Al abrir la página por primera vez sale
-- Tooltip (el primero que funciona); luego se queda el último elegido mientras dure la sesión.
--
-- Funcionan tres; los demás dicen «Llega en otra parte» (PRINCIPAL_OTRA_PARTE):
--   - Tooltip (aj-02, Task 39: con la forma de la página de TSM), todo dentro de una zona con desplazamiento:
--     · «Opciones generales» (título y descripción nuestros), con las cuatro opciones de TooltipComercio:
--         «Activar las líneas de SnetForever»: un radio Sí / No con la etiqueta encima. Es el mismo ajuste que «/snet
--           comercio tooltip» (TooltipComercio.ponerActivo); si la orden lo cambia con la página a la vista, el radio lo
--           sigue por SNF_COMERCIO_TOOLTIP. En No, todo lo de debajo se ve apagado y no cambia.
--         «Insertarlas en el tooltip del juego»: una casilla (la opción «incrustado»).
--         «Formato del precio» y «Enseñarlo con una tecla»: dos desplegables simples, cada uno en media columna, uno al
--           lado del otro, con su etiqueta encima. El primero dice «Texto (345g 12s 67c)», con Tema.dineroPlano(3451267),
--           e «Iconos». Cambian TooltipComercio.ponerOpcion; si la opción cambia desde otro sitio, la siguen (el aviso
--           SNF_COMERCIO_TOOLTIP lo da ponerOpcion).
--       Cada control lleva su explicación en el tooltip al pasar el ratón (opción `ayuda` de las piezas, Task 34), con su
--       nombre de título y anclada a la derecha de su fila. La de la tecla dice que un enlace del chat las enseña siempre.
--     · «Líneas del tooltip», en dos columnas: la izquierda mide la mitad del ancho menos 10 px; la derecha (.derecha),
--       igual de ancha y a 10 px del centro, lleva el «Tooltip de ejemplo» (Task 40, más abajo). En la izquierda, por
--       cada grupo de TooltipComercio.GRUPOS, su título (letra «etiqueta», en blanco) y debajo una casilla por línea, cada
--       23 px, que llama a ponerLinea. Marcar una de una pareja (`excluye`, como inventario completo y simple) desmarca la
--       otra también a la vista. Una línea que «llega con…» sale apagada, con el texto en «apagado» y el motivo detrás entre
--       paréntesis; no se pulsa ni guarda nada. Las fuentes propias van dentro de «Valores», detrás de sus líneas, una por
--       fuente (TooltipComercio.lineasFuentes(): «Fuente propia (nombre)»); se rehacen cada vez que se vuelve a la página
--       (al elegir el apartado o al abrir la ventana). Las casillas de las fuentes se reutilizan: las que sobran se esconden.
--     · El «Tooltip de ejemplo» (Task 40, .tooltip.ejemplo): el título encima (letra «etiqueta», en blanco, como los de
--       los grupos) y una caja `hundido` con borde (Tema.panel) que imita nuestro tooltip con los datos inventados de
--       TooltipComercio.EJEMPLO: TooltipComercio.componer(salida, EJEMPLO, ajustes de las líneas, {todas = true}). Salen
--       todas las líneas que tienen datos: las encendidas con sus colores de siempre (los del tooltip de verdad) y las
--       apagadas enteras en `apagado`, sin sus códigos de color y con sus iconos teñidos de gris; un título, apagado si su
--       apartado no tiene ninguna encendida. Con «Activar» en No, todo apagado. El formato del precio se aplica; la tecla
--       no cambia nada. Nunca un nombre de personaje de verdad: solo «Personaje de ejemplo». Filas de 16 px (EJ.FILA) con
--       la etiqueta a la izquierda y el valor a la derecha, de una reserva de FontStrings que se reutilizan (las que
--       sobran se esconden); la caja mide lo que sus filas. Se repinta una sola vez por cambio, sin animación, dentro de
--       colocarTooltip: al marcar una casilla (que llama a refrescarTooltip), con SNF_COMERCIO_TOOLTIP (Activar y las
--       opciones), al volver a la página y al cambiar de idioma.
--       Al lado o debajo: si la columna derecha mide menos de 300 px (EJ.MINIMO) o su fila más ancha no cabe en el 85 %
--       de la columna (EJ.HOLGURA), la caja pasa debajo de la lista, a todo el ancho, antes de los personajes. Para volver
--       al lado desde abajo la columna tiene que pasar el límite en 12 px (EJ.HISTERESIS): un ancho justo en el límite no
--       la hace saltar. Solo se decide con un ancho conocido; repintar con el mismo ancho da siempre el mismo sitio.
--     · Debajo de las líneas, en la columna izquierda, la lista de los personajes propios del inventario
--       (InventarioCuenta.personajes(), solo los de la cuenta: nunca otros jugadores) con una ✖ para olvidar uno borrado.
--       La ✖ pregunta antes con el cuadro fijo del editor de operaciones (EditorOperacion.cuadroConfirmar). No depende de
--       «Activar»: es del inventario, no del tooltip. F2: cada fila dice «Nombre Apellido - Reino» (la clave entera del
--       inventario) y, si algo de su ficha viene de TSM, «(de TSM, a 19/11)». Debajo, el botón «Importar inventario de TSM»
--       (.importarInventario): un clic llama a ImportarTSM.inventario (las bolsas, el banco y el correo de tus personajes de
--       este reino que TSM tiene contados; no pisa lo nuestro) y dice en el chat cuántos personajes y objetos han entrado.
--       Sin TSM (ImportarTSM.inventarioDisponible) sale apagado, no hace nada y su ayuda dice por qué.
--     Todo se coloca de arriba abajo en colocarTooltip, con el alto real de los títulos (su descripción puede ocupar dos
--     líneas en la columna estrecha); al cambiar el ancho de la columna se vuelve a colocar (OnSizeChanged, no OnUpdate).
--   - Fuentes propias (Custom Sources, aj-08): el texto de la captura con vendorsell y vendorbuy en amarillo, la tabla
--     Nombre · Formato · Fórmula y, debajo, la barra «Agregar una fuente propia» (Task 31: a todo el ancho de la columna,
--     de 24 px, con letra 14 y sin paréntesis, como la de TSM). El formato es siempre «Oro»: una fuente propia es
--     un precio (no se guarda otro formato). Pulsar una fila la abre en el editor de fórmulas ⧉ con su nombre, que también se
--     puede cambiar; el botón abre el editor con el nombre vacío. Guarda Formulas.ponerFuente: un nombre que no vale (con
--     espacios, repetido, que ya es una fuente o función de SnetForever...) o una fórmula que no vale no se guarda y el editor
--     dice por qué. Si se le cambia el nombre, las fórmulas que la usaban pasan al nuevo (Task 25) y una línea del chat dice
--     cuántas; su línea del tooltip pasa también al nombre nuevo (TooltipComercio.renombrarFuente, Task 37). La ✖ de cada
--     fila la quita, después de preguntar con el mismo cuadro; si su línea del tooltip estaba encendida, la apaga con
--     ponerLinea("fuente:<nombre>", false) (Task 39: no se borra nada, la clave queda en false, y el tooltip deja de
--     calcularla); si estaba apagada no guarda nada. Las filas no se desplazan: caben unas 28, de sobra para las fuentes
--     que se usan.
--   - Apariencia (aj-04): solo la casilla «Ocultar icono en el minimapa», que cambia el ajuste minimapa.boton (el mismo que la
--     casilla de la ventana de la guía; si cambia allí, esta lo sigue). El resto de aj-04 queda para otra parte.
-- Nada parpadea, gira ni cambia de color solo; no hay OnUpdate.
--
-- SNF.PrincipalAjustes:
--   .APARTADOS                  las claves de los 12 apartados, en orden.
--   .elegir(clave), .elegido()  cambia de apartado / el que se ve.
--   .refrescar()                vuelve a leer todo lo que enseña.
--   .clavesDeTexto() -> {claves} las claves de texto que usa (para comprobar que están en es y en).
--   Partes (nil hasta que se abre la pestaña): .pagina, .barra, .fondoBarra, .botones (clave -> Button con .texto),
--   .derecha, .apartados (clave -> marco; los que no funcionan llevan .otraParte), .tooltip = {zona, contenido, regla (el
--   ancho útil: del borde izquierdo del contenido a 20 px del derecho), titulo, filas = {activar, insertar, precio},
--   etiquetaActivar, general (el radio), incrustado (la casilla), etiquetaFormato, formato, etiquetaTecla, tecla (los
--   desplegables), tituloLineas, izquierda y derecha (las columnas), grupos = {clave -> FontString del título},
--   lineas = {clave -> casilla, las de GRUPOS; las «llega con…» llevan .llega}, fuentes = {casillas con .clave y .nombre},
--   orden = {{tipo = "grupo" | "linea" | "fuente", clave, marco}…} (lo que se ve, de arriba abajo), tituloPersonajes,
--   personajes = {filas con .texto, .quitar y .clave}, ninguno, importarInventario (F2), ejemplo = {titulo, caja, filas = {{izq, der (FontStrings),
--   tipo = "titulo" | "doble" | "linea", apagada}…} (la reserva), n (las que se usan), alto, abajo (debajo de la lista),
--   limite (el ancho de la columna derecha desde el que va al lado), repintados (cuántas veces se ha repintado), FILA,
--   MARGEN, HUECO, HISTERESIS}}, .fuentes = {titulo, descripcion, cabeceras =
--   {nombre, formato, formula}, filas = {Button con .nombre, .formato, .formula, .quitar y .fuente}, agregar},
--   .apariencia = {titulo, minimapa}. El cuadro de preguntar es SnetForeverAjustesConfirmar (se crea al primer ✖).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local Pagina = {}
SNF.PrincipalAjustes = Pagina

local pintar = Piezas.interno.pintar
local plana = Piezas.interno.plana
local colorTexto = Piezas.interno.colorTexto
local botonBase = Piezas.interno.botonBase
local proteger = Piezas.proteger

-- Medidas de las capturas aj-01 a aj-12 (2560 x 1080; la ventana va a escala de píxel real: una unidad es un píxel).
local ANCHO_BARRA = 152
local ARRIBA_BARRA = 14 -- del borde de arriba a la primera fila
local FILA_BARRA = 26
local HUECO_BARRA = 14 -- además, tras los dos primeros
local IZQUIERDA_TEXTO = 12
local IZQUIERDA = 15 -- de la barra a lo de la derecha
local DERECHA = 20
local ARRIBA = 12
local FILA_CASILLA = 23
local FILA = 22
local ANCHO_NOMBRE = 150
local ANCHO_FORMATO = 110
-- Task 31 (aj-08): la barra «Agregar una fuente propia» de TSM mide unos 23 px y su letra es más grande que la de la tabla.
local ALTO_AGREGAR, LETRA_AGREGAR = 24, 14
local TAMANO_MARCA, SEPARACION_TEXTO = 11, 8 -- los de Piezas.casilla
local NOMBRE_CONFIRMAR = "SnetForeverAjustesConfirmar"

local APARTADOS = {"general", "tooltip", "contabilidad", "apariencia", "subasta", "destruir", "correo", "fuentes",
  "fabricacion", "macros", "navegar", "venta"}
local FUNCIONAN = {tooltip = true, fuentes = true, apariencia = true}
Pagina.APARTADOS = APARTADOS

local function claveApartado(clave)
  return "PRINCIPAL_AJ_A_" .. string.upper(clave)
end

local CLAVES_FIJAS = {
  "PRINCIPAL_OTRA_PARTE", "PRINCIPAL_AJ_TT_TITULO", "PRINCIPAL_AJ_TT_DESC", "COMERCIO_TT_OPC_ACTIVAR",
  "PRINCIPAL_AJ_TT_AYUDA_ACTIVAR", "PRINCIPAL_AJ_TT_AYUDA_INSERTAR", "PRINCIPAL_AJ_TT_AYUDA_FORMATO",
  "PRINCIPAL_AJ_TT_AYUDA_TECLA", "COMERCIO_TT_AJ_FUENTE", "PRINCIPAL_AJ_TT_LINEAS", "PRINCIPAL_AJ_TT_LINEAS_DESC", "PRINCIPAL_AJ_TT_PERSONAJES", "PRINCIPAL_AJ_TT_PERSONAJES_DESC",
  "PRINCIPAL_AJ_TT_SIN_PERSONAJES", "PRINCIPAL_AJ_OLVIDAR", "PRINCIPAL_AJ_OLVIDAR_PREGUNTA", "PRINCIPAL_AJ_OLVIDAR_AYUDA",
  "PRINCIPAL_AJ_FUENTES_TITULO", "PRINCIPAL_AJ_FUENTES_DESC", "PRINCIPAL_AJ_FUENTES_NOMBRE", "PRINCIPAL_AJ_FUENTES_FORMATO",
  "PRINCIPAL_AJ_FUENTES_FORMULA", "PRINCIPAL_AJ_FUENTES_ORO", "PRINCIPAL_AJ_FUENTES_AGREGAR", "PRINCIPAL_AJ_FUENTES_EDITOR",
  "PRINCIPAL_AJ_QUITAR", "PRINCIPAL_AJ_QUITAR_PREGUNTA", "PRINCIPAL_AJ_APARIENCIA_TITULO", "PRINCIPAL_AJ_APARIENCIA_DESC",
  "PRINCIPAL_AJ_MINIMAPA", "PRINCIPAL_AJ_FUENTE_RENOMBRADA",
  "PRINCIPAL_AJ_TT_EJEMPLO", "COMERCIO_TT_EJ_GRUPO", "COMERCIO_TT_EJ_SUBGRUPO", "COMERCIO_TT_EJ_OPERACION",
  "COMERCIO_TT_EJ_PERSONAJE", "PRINCIPAL_AJ_TT_DE_TSM", "PRINCIPAL_AJ_TT_IMPORTAR_INV", "PRINCIPAL_AJ_TT_IMPORTAR_INV_AYUDA",
  "IMPORTAR_TSM_INV_HECHO", "IMPORTAR_TSM_INV_NADA", "IMPORTAR_TSM_INV_NO_HAY", "IMPORTAR_TSM_INV_FALTA",
}

function Pagina.clavesDeTexto()
  local t = {}
  for _, k in ipairs(CLAVES_FIJAS) do
    t[#t + 1] = k
  end
  for _, a in ipairs(APARTADOS) do
    t[#t + 1] = claveApartado(a)
  end
  -- Task 39: las de las opciones y de los grupos y líneas del tooltip, que vienen de TooltipComercio.
  local tc = SNF.TooltipComercio
  for _, o in ipairs(tc and tc.OPCIONES or {}) do
    t[#t + 1] = o.texto
    for _, v in ipairs(o.valores) do
      t[#t + 1] = v.texto
    end
  end
  for _, g in ipairs(tc and tc.GRUPOS or {}) do
    t[#t + 1] = g.texto
    for _, l in ipairs(g.lineas) do
      t[#t + 1] = l.texto
      t[#t + 1] = l.llega -- nil en las que tienen datos: no añade nada
    end
  end
  return t
end

local elegido = "tooltip"
local confirmar -- el cuadro de preguntar (se crea al primer ✖)

-- Un texto del jugador para un FontString: en el juego «|» empieza un código (|H es un enlace), así que se dobla.
local function seguro(texto)
  return (string.gsub(tostring(texto or ""), "|", "||"))
end

local function T()
  return SNF.TooltipComercio
end

-- Cambia el texto de una casilla y su ancho (la zona que se pulsa sigue al texto).
local function textoCasilla(c, texto)
  c.texto:SetText(texto)
  c:SetWidth(TAMANO_MARCA + SEPARACION_TEXTO + math.ceil(c.texto:GetStringWidth()))
end

local function verAyuda(dueno, texto)
  local tt = rawget(_G, "GameTooltip")
  if not tt or (tt.IsForbidden and tt:IsForbidden()) then
    return
  end
  tt:SetOwner(dueno, "ANCHOR_RIGHT")
  tt:SetText(texto, 1, 1, 1, 1, true)
  tt:Show()
end

local function esconderAyuda(dueno)
  local tt = rawget(_G, "GameTooltip")
  if tt and not (tt.IsForbidden and tt:IsForbidden()) and tt:GetOwner() == dueno then
    tt:Hide()
  end
end

-- Un ✖ con su ayuda en el tooltip.
local function botonQuitar(padre, claveAyuda, alPulsar)
  local b = Piezas.botonIcono(padre, "cerrar", alPulsar, {tamano = 12, color = "texto"})
  local entrar, salir = b:GetScript("OnEnter"), b:GetScript("OnLeave")
  b:SetScript("OnEnter", proteger(function(self, ...)
    entrar(self, ...)
    verAyuda(self, L.t(claveAyuda))
  end))
  b:SetScript("OnLeave", proteger(function(self, ...)
    salir(self, ...)
    esconderAyuda(self)
  end))
  return b
end

local function preguntar(texto, textoBoton, alAceptar)
  confirmar = confirmar or SNF.EditorOperacion.cuadroConfirmar(NOMBRE_CONFIRMAR)
  confirmar:preguntar(texto, textoBoton, alAceptar)
end

local function cerrarConfirmar()
  if confirmar then
    confirmar:cerrar()
  end
end

---------------------------------------------------------------------------------------------------
-- Tooltip
---------------------------------------------------------------------------------------------------

local refrescarTooltip -- (más abajo)

-- Medidas de Ajustes › Tooltip (Task 39, aj-02), en una tabla para no sumar locales. Las y van de lo alto de una cosa a lo
-- alto de la siguiente.
local TT = {
  TRAS_TITULO = 10, -- del borde de abajo de un título a lo de debajo
  ETIQUETA = 20, -- de lo alto de una etiqueta a lo alto de su control (14 de etiqueta y 6 de hueco, como Piezas.etiqueta)
  RADIO_CASILLA = 28, -- del radio a la casilla «Insertarlas»
  CASILLA_ETIQUETAS = 30, -- de la casilla a las etiquetas de los desplegables
  ALTO_DESPLEGABLE = 22,
  ANTES_LINEAS = 26, -- del borde de abajo de los desplegables al título «Líneas del tooltip»
  CENTRO = 10, -- cada columna (y cada desplegable) se queda a 10 px del centro
  TITULO_GRUPO = 22, -- del título de un grupo a su primera casilla
  TRAS_GRUPO = 8, -- además de los 23 px de la última casilla, antes del título del grupo siguiente
  ANTES_PERSONAJES = 14,
  ANTES_IMPORTAR = 8, -- F2: de la lista de personajes al botón «Importar inventario de TSM»
  ALTO_IMPORTAR = 22,
  EJEMPLO_DINERO = 3451267, -- «345g 12s 67c»: el ejemplo del formato «texto», como el de TSM
}

-- F2: la fila de un personaje del inventario: «Nombre Apellido - Reino» y, si algo de su ficha viene de la importación de
-- TSM, «(de TSM, a 19/11)» con la hora más nueva (la hora si es de hoy).
function TT.textoPersonaje(p)
  local texto = seguro(p.nombre) .. " - " .. seguro(p.reino)
  local hora = nil
  if type(p.tsm) == "table" then
    for _, h in pairs(p.tsm) do
      if type(h) == "number" then
        hora = math.max(hora or h, h)
      end
    end
  end
  if not hora then
    return texto
  end
  local hoy = SNF.API.horaServidor()
  local mismoDia = type(hoy) == "number" and date("%Y%m%d", math.floor(hora)) == date("%Y%m%d", math.floor(hoy))
  return texto .. " " .. L.t("PRINCIPAL_AJ_TT_DE_TSM", date(mismoDia and "%H:%M" or "%d/%m", math.floor(hora)))
end

local function importador()
  return rawget(SNF, "ImportarTSM")
end

-- ¿Se puede importar el inventario de TSM? true, o false y el motivo.
function TT.importarDisponible()
  local I = importador()
  if type(I) ~= "table" or type(I.inventarioDisponible) ~= "function" then
    return false, L.t("IMPORTAR_TSM_INV_NO_HAY")
  end
  return I.inventarioDisponible()
end

-- F2: el botón «Importar inventario de TSM» (debajo de los personajes). Un clic trae de TSM las bolsas, el banco y el correo
-- de tus personajes de este reino (ImportarTSM.inventario: no pisa lo ya contado) y dice en el chat cuántos personajes y
-- objetos ha traído. Sin TSM sale apagado y su ayuda dice por qué.
function TT.crearImportar(t)
  local b = Piezas.boton(t.izquierda, L.t("PRINCIPAL_AJ_TT_IMPORTAR_INV"), function()
    local I = importador()
    if not I or not TT.importarDisponible() then
      return
    end
    local r, motivo = I.inventario()
    if not r then
      print(motivo)
    elseif r.personajes > 0 then
      print(L.t("IMPORTAR_TSM_INV_HECHO", SNF.Texto.numero(r.personajes), SNF.Texto.numero(r.objetos)))
    else
      print(L.t("IMPORTAR_TSM_INV_NADA"))
    end
    refrescarTooltip()
  end, {borde = true, alto = TT.ALTO_IMPORTAR})
  Piezas.ayuda(b, function()
    local ok, motivo = TT.importarDisponible()
    return L.t("PRINCIPAL_AJ_TT_IMPORTAR_INV"), ok and L.t("PRINCIPAL_AJ_TT_IMPORTAR_INV_AYUDA") or motivo
  end)
  t.importarInventario = b
end

-- El «Tooltip de ejemplo» (Task 40): sus medidas y sus funciones, en una tabla para no sumar locales.
--   FILA        alto de cada fila (la etiqueta a la izquierda y el valor a la derecha)
--   MARGEN      de los bordes de la caja a las filas
--   HUECO       lo mínimo entre la etiqueta y el valor
--   LETRA       el tamaño de la letra «texto» de las filas
--   MINIMO      con la columna derecha por debajo de esto, la caja va debajo de la lista
--   HOLGURA     además, al lado solo si la fila más ancha cabe en el 85 % del ancho (la letra del cliente puede medir algo
--               más de lo calculado y un texto cortado no se lee)
--   HISTERESIS  para volver al lado desde abajo, la columna tiene que pasar el límite en esto: con un ancho justo en el
--               límite la caja no salta de un sitio a otro
local EJ = {FILA = 16, MARGEN = 6, HUECO = 12, LETRA = 11, MINIMO = 300, HOLGURA = 0.85, HISTERESIS = 12}

-- Un texto de una línea apagada, entero en gris: sin sus códigos de color y con los iconos de dentro (la flecha de la
-- tendencia, las monedas) teñidos de `apagado` (los seis campos que faltan de |T…|t valen la textura entera).
function EJ.apagar(texto, rgb)
  texto = string.gsub(texto, "|c%x%x%x%x%x%x%x%x", "")
  texto = string.gsub(texto, "|r", "")
  return (string.gsub(texto, "|T(.-)|t", function(dentro)
    local partes = {}
    for p in string.gmatch(dentro .. ":", "([^:]*):") do
      partes[#partes + 1] = p
    end
    if #partes < 14 then
      for i = #partes + 1, 5 do
        partes[i] = "0"
      end
      for i = 6, 11 do
        partes[i] = (i == 8 or i == 10) and "0" or "16"
      end
    end
    partes[12], partes[13], partes[14] = rgb[1], rgb[2], rgb[3]
    return "|T" .. table.concat(partes, ":", 1, 14) .. "|t"
  end))
end

-- La fila k de la reserva (dos FontStrings que se reutilizan: nunca se crean más que las filas que ha habido).
function EJ.fila(ej, k)
  local f = ej.filas[k]
  if f then
    return f
  end
  local y = -(EJ.MARGEN + (k - 1) * EJ.FILA)
  f = {}
  for _, lado in ipairs({"izq", "der"}) do
    local fs = Tema.letra(ej.caja:CreateFontString(nil, "OVERLAY"), "texto", EJ.LETRA)
    fs:SetWordWrap(false)
    fs:SetHeight(EJ.FILA)
    if lado == "izq" then
      fs:SetJustifyH("LEFT")
      fs:SetPoint("TOPLEFT", ej.caja, "TOPLEFT", EJ.MARGEN, y)
    else
      fs:SetJustifyH("RIGHT")
      fs:SetPoint("TOPRIGHT", ej.caja, "TOPRIGHT", -EJ.MARGEN, y)
    end
    f[lado] = fs
  end
  ej.filas[k] = f
  return f
end

-- Lo que Tooltip.componer escribe se apunta en la fila siguiente; se pinta todo al acabar (los títulos necesitan saber si
-- su apartado tiene alguna línea encendida).
function EJ.apuntar(ej, tipo, izq, der, color, apagada)
  ej.n = ej.n + 1
  local f = EJ.fila(ej, ej.n)
  f.tipo, f.textoIzq, f.textoDer, f.color, f.apagada = tipo, izq, der, color, apagada and true or false
end

function EJ.crear(t)
  local ej = {filas = {}, n = 0, repintados = 0, limite = EJ.MINIMO, FILA = EJ.FILA, MARGEN = EJ.MARGEN, HUECO = EJ.HUECO,
    HISTERESIS = EJ.HISTERESIS}
  t.ejemplo = ej
  ej.titulo = Tema.letra(t.contenido:CreateFontString(nil, "OVERLAY"), "etiqueta")
  colorTexto(ej.titulo, "texto")
  ej.titulo:SetJustifyH("LEFT")
  ej.titulo:SetWordWrap(false)
  ej.titulo:SetText(L.t("PRINCIPAL_AJ_TT_EJEMPLO"))
  ej.caja = CreateFrame("Frame", nil, t.contenido)
  Tema.panel(ej.caja, "hundido", {borde = true})
  local colores = T().COLORES
  ej.salida = {
    titulo = function(_, clave) EJ.apuntar(ej, "titulo", L.t(clave), nil, colores.amarillo, false) end,
    doble = function(_, izq, der, color, apagada) EJ.apuntar(ej, "doble", izq, der, color or colores.gris, apagada) end,
    linea = function(_, texto, color, apagada) EJ.apuntar(ej, "linea", texto, nil, color or colores.gris, apagada) end,
  }
end

-- Vuelve a escribir el ejemplo con los ajustes de ahora (un repintado: lo llama colocarTooltip, una vez por cambio), mide
-- la fila más ancha y calcula el límite de la columna derecha para que quepa al lado.
function EJ.repintar(t)
  local ej, tc = t.ejemplo, T()
  ej.n = 0
  tc.componer(ej.salida, tc.EJEMPLO, tc.lineasGuardadas(), {todas = true})
  ej.repintados = ej.repintados + 1
  -- Un título va apagado si su apartado no tiene ninguna línea encendida (con «Activar» en No, ninguna lo está).
  local tituloEn = nil
  for k = 1, ej.n do
    local f = ej.filas[k]
    if f.tipo == "titulo" then
      tituloEn = f
      f.apagada = true
    elseif tituloEn and not f.apagada then
      tituloEn.apagada = false
    end
  end
  local gris = Tema.color("apagado")
  local rgb = {math.floor(gris[1] * 255 + 0.5), math.floor(gris[2] * 255 + 0.5), math.floor(gris[3] * 255 + 0.5)}
  local blanco = tc.COLORES.blanco
  local ancho = Tema.anchoTexto(ej.titulo)
  for k = 1, ej.n do
    local f = ej.filas[k]
    local izq, der = f.textoIzq or "", f.textoDer
    if f.apagada then
      f.izq:SetText(EJ.apagar(izq, rgb))
      f.izq:SetTextColor(gris[1], gris[2], gris[3], 1)
      f.der:SetTextColor(gris[1], gris[2], gris[3], 1)
      der = der and EJ.apagar(der, rgb)
    else
      f.izq:SetText(izq)
      f.izq:SetTextColor(f.color[1], f.color[2], f.color[3], 1)
      f.der:SetTextColor(blanco[1], blanco[2], blanco[3], 1)
    end
    f.izq:Show()
    f.der:SetText(der or "")
    f.der:SetShown(der ~= nil)
    local w = Tema.anchoTexto(f.izq) + (der and (EJ.HUECO + Tema.anchoTexto(f.der)) or 0)
    ancho = math.max(ancho, w)
  end
  for k = ej.n + 1, #ej.filas do
    ej.filas[k].izq:Hide()
    ej.filas[k].der:Hide()
  end
  ej.alto = ej.n * EJ.FILA + 2 * EJ.MARGEN
  ej.caja:SetHeight(ej.alto)
  ej.limite = math.max(EJ.MINIMO, math.ceil((ancho + 2 * EJ.MARGEN) / EJ.HOLGURA))
end

-- ¿Al lado o debajo? Solo con un ancho conocido. Desde abajo, vuelve al lado con el límite más HISTERESIS: un ancho justo
-- en el límite no lo hace saltar. Repintar con el mismo ancho da siempre lo mismo.
function EJ.decidir(t, anchoRegla)
  local ej = t.ejemplo
  if type(anchoRegla) ~= "number" or anchoRegla <= 0 then
    return nil
  end
  local leftMinimum = 0
  for _, row in ipairs(t.orden) do
    if row.marco.texto then
      leftMinimum = math.max(leftMinimum, row.marco:GetWidth())
    end
  end
  leftMinimum = math.ceil(leftMinimum / EJ.HOLGURA)
  local available = anchoRegla - 2 * TT.CENTRO
  local threshold = leftMinimum + ej.limite + (ej.abajo and EJ.HISTERESIS or 0)
  ej.abajo = available < threshold
  if not ej.abajo then
    return math.max(leftMinimum, math.min(available / 2, available - ej.limite))
  end
end

-- Coloca el título y la caja: arriba de la columna derecha, o (`abajo`) a todo el ancho a `yc` de lo alto de la columna
-- izquierda, que está a `y` de lo alto de la regla.
function EJ.colocar(t, abajo, y, yc)
  local ej = t.ejemplo
  ej.titulo:ClearAllPoints()
  ej.caja:ClearAllPoints()
  if abajo then
    ej.titulo:SetPoint("TOPLEFT", t.izquierda, "TOPLEFT", 0, -yc)
    ej.titulo:SetPoint("TOPRIGHT", t.regla, "TOPRIGHT", 0, -(y + yc))
    ej.caja:SetPoint("TOPLEFT", t.izquierda, "TOPLEFT", 0, -(yc + TT.TITULO_GRUPO))
    ej.caja:SetPoint("TOPRIGHT", t.regla, "TOPRIGHT", 0, -(y + yc + TT.TITULO_GRUPO))
  else
    ej.titulo:SetPoint("TOPLEFT", t.derecha, "TOPLEFT", 0, 0)
    ej.titulo:SetPoint("TOPRIGHT", t.derecha, "TOPRIGHT", 0, 0)
    ej.caja:SetPoint("TOPLEFT", t.derecha, "TOPLEFT", 0, -TT.TITULO_GRUPO)
    ej.caja:SetPoint("TOPRIGHT", t.derecha, "TOPRIGHT", 0, -TT.TITULO_GRUPO)
  end
end

-- El texto de la casilla de una línea: su nombre y, si aún no tiene datos, el motivo detrás entre paréntesis.
local function textoLinea(l)
  if l.llega then
    return L.t(l.texto) .. " (" .. L.t(l.llega) .. ")"
  end
  return L.t(l.texto)
end

-- Las opciones de un desplegable ({valor, texto}) sacadas de TooltipComercio.OPCIONES, en el idioma de ahora.
local function opcionesDe(clave)
  local lista = {}
  for _, o in ipairs(T().OPCIONES) do
    if o.clave == clave then
      for _, v in ipairs(o.valores) do
        local texto = v.valor == "texto" and L.t(v.texto, Tema.dineroPlano(TT.EJEMPLO_DINERO)) or L.t(v.texto)
        lista[#lista + 1] = {v.valor, texto}
      end
    end
  end
  return lista
end

-- La explicación de un control para la opción `ayuda` de las piezas: su nombre y lo que hace.
local function ayudaDe(claveNombre, claveAyuda)
  return function()
    return L.t(claveNombre), L.t(claveAyuda)
  end
end

local function filaPersonaje(t, k, padre)
  local f = t.personajes[k]
  if f then
    return f
  end
  f = CreateFrame("Frame", nil, padre)
  f:SetHeight(FILA)
  f.texto = Tema.letra(f:CreateFontString(nil, "OVERLAY"), "texto")
  colorTexto(f.texto, "texto")
  f.texto:SetPoint("LEFT", f, "LEFT", 0, 0)
  f.texto:SetWordWrap(false)
  f.quitar = botonQuitar(f, "PRINCIPAL_AJ_OLVIDAR_AYUDA", function()
    local clave, nombre = f.clave, f.texto:GetText()
    if not clave then
      return
    end
    preguntar(L.t("PRINCIPAL_AJ_OLVIDAR_PREGUNTA", nombre), L.t("PRINCIPAL_AJ_OLVIDAR"), function()
      SNF.InventarioCuenta.olvidar(clave)
      refrescarTooltip()
    end)
  end)
  f.quitar:SetPoint("LEFT", f.texto, "RIGHT", 8, 0)
  t.personajes[k] = f
  return f
end

-- La casilla de una fuente propia (se reutilizan: la k-ésima sirve para la k-ésima fuente de lineasFuentes()).
local function casillaFuente(t, k)
  local c = t.fuentes[k]
  if c then
    return c
  end
  c = Piezas.casilla(t.izquierda, "", function()
    return c and c.clave and T().linea(c.clave) or false -- al crearse, c aún no existe
  end, function(v)
    if c.clave then
      T().ponerLinea(c.clave, v)
      refrescarTooltip() -- Task 40: el ejemplo, al momento (un repintado)
    end
  end)
  t.fuentes[k] = c
  return c
end

-- La fila de un control (su etiqueta y él, a todo el ancho): su explicación sale a la derecha de la fila.
local function fila(t, alto)
  local f = CreateFrame("Frame", nil, t.contenido)
  f:SetHeight(alto)
  return f
end

-- Ancla `marco` en la regla, a `y` de arriba, entre dos puntos de su ancho: «todo», «izquierda» (hasta 10 px antes del
-- centro) o «derecha» (desde 10 px después del centro). Con `soloIzquierda`, solo por la esquina de arriba a la izquierda.
local function enRegla(t, marco, y, parte, soloIzquierda)
  marco:ClearAllPoints()
  if parte == "derecha" then
    marco:SetPoint("TOPLEFT", t.regla, "TOP", TT.CENTRO, -y)
  else
    marco:SetPoint("TOPLEFT", t.regla, "TOPLEFT", 0, -y)
  end
  if soloIzquierda then
    return
  end
  if parte == "izquierda" then
    marco:SetPoint("TOPRIGHT", t.regla, "TOP", -TT.CENTRO, -y)
  else
    marco:SetPoint("TOPRIGHT", t.regla, "TOPRIGHT", 0, -y)
  end
end

-- El alto de un título con su descripción, ya ajustada al ancho que tiene (si se sabe: en el juego siempre).
local function altoTitulo(marco, ancho)
  if type(ancho) == "number" and ancho > 0 then
    marco:ponerAncho(ancho)
  end
  return math.ceil(marco:GetHeight())
end

local function crearTooltip(ap)
  local zona, contenido = Piezas.desplazable(ap)
  zona:SetAllPoints(ap)
  local t = {zona = zona, contenido = contenido, lineas = {}, grupos = {}, fuentes = {}, orden = {}, personajes = {},
    filas = {}}
  Pagina.tooltip = t

  -- La regla: el ancho útil (sin los 20 px de la derecha, donde va la barra de la zona). Todo se ancla a ella.
  t.regla = CreateFrame("Frame", nil, contenido)
  t.regla:SetHeight(1)
  t.regla:SetPoint("TOPLEFT", contenido, "TOPLEFT", 0, 0)
  t.regla:SetPoint("TOPRIGHT", contenido, "TOPRIGHT", -DERECHA, 0)

  t.titulo = Piezas.titulo(contenido, L.t("PRINCIPAL_AJ_TT_TITULO"), L.t("PRINCIPAL_AJ_TT_DESC"))

  -- Opciones generales. Las filas van primero: son el ancla de las explicaciones.
  t.filas.activar = fila(t, TT.ETIQUETA + 15)
  t.filas.insertar = fila(t, 11)
  t.filas.precio = fila(t, TT.ETIQUETA + TT.ALTO_DESPLEGABLE)
  t.etiquetaActivar = Piezas.etiqueta(contenido, L.t("COMERCIO_TT_OPC_ACTIVAR"))
  -- ponerActivo avisa con SNF_COMERCIO_TOOLTIP y eso repinta lo de debajo (más abajo).
  t.general = Piezas.radio(contenido, function() return T().activo() end, function(v)
    T().ponerActivo(v)
  end, {si = L.t("COMERCIO_TT_OPC_SI"), no = L.t("COMERCIO_TT_OPC_NO"), anclaAyuda = t.filas.activar,
    ayuda = ayudaDe("COMERCIO_TT_OPC_ACTIVAR", "PRINCIPAL_AJ_TT_AYUDA_ACTIVAR")})
  t.incrustado = Piezas.casilla(contenido, L.t("COMERCIO_TT_OPC_INCRUSTADO"), function()
    return T().opcion("incrustado")
  end, function(v)
    T().ponerOpcion("incrustado", v and true or false)
  end)
  Piezas.ayuda(t.incrustado, ayudaDe("COMERCIO_TT_OPC_INCRUSTADO", "PRINCIPAL_AJ_TT_AYUDA_INSERTAR"), {ancla = t.filas.insertar})
  for _, o in ipairs({{"formato", "Formato", "PRINCIPAL_AJ_TT_AYUDA_FORMATO", "COMERCIO_TT_OPC_FORMATO"},
    {"tecla", "Tecla", "PRINCIPAL_AJ_TT_AYUDA_TECLA", "COMERCIO_TT_OPC_TECLA"}}) do
    local clave = o[1]
    t[clave] = Piezas.desplegable(contenido, {
      opciones = opcionesDe(clave),
      get = function() return T().opcion(clave) end,
      set = function(v) T().ponerOpcion(clave, v) end,
      ayuda = ayudaDe(o[4], o[3]),
      anclaAyuda = t.filas.precio,
    })
    t["etiqueta" .. o[2]] = Piezas.etiqueta(contenido, L.t(o[4]))
    t["etiqueta" .. o[2]]:anclarSobre(t[clave])
  end

  -- Líneas del tooltip: el título a todo el ancho y las dos columnas.
  t.tituloLineas = Piezas.titulo(contenido, L.t("PRINCIPAL_AJ_TT_LINEAS"), L.t("PRINCIPAL_AJ_TT_LINEAS_DESC"))
  t.izquierda = CreateFrame("Frame", nil, contenido)
  t.derecha = CreateFrame("Frame", nil, contenido) -- la columna del «Tooltip de ejemplo» (Task 40)
  EJ.crear(t)
  for _, g in ipairs(T().GRUPOS) do
    local fs = Tema.letra(t.izquierda:CreateFontString(nil, "OVERLAY"), "etiqueta")
    colorTexto(fs, "texto")
    fs:SetJustifyH("LEFT")
    fs:SetWordWrap(false)
    fs:SetText(L.t(g.texto))
    t.grupos[g.clave] = fs
    for _, l in ipairs(g.lineas) do
      local clave = l.clave
      local c
      if l.llega then
        -- Sin datos todavía: apagada siempre, sin marcar y sin guardar nada (no tiene set).
        c = Piezas.casilla(t.izquierda, textoLinea(l), function() return false end, nil)
        c:ponerApagado(true)
        c.llega = l.llega
      else
        c = Piezas.casilla(t.izquierda, textoLinea(l), function() return T().linea(clave) end, function(v)
          T().ponerLinea(clave, v)
          local pareja = l.excluye and t.lineas[l.excluye] -- marcar una de una pareja desmarca la otra (Task 37)
          if pareja then
            pareja:refrescar()
          end
          refrescarTooltip() -- Task 40: el ejemplo, al momento (un repintado)
        end)
      end
      c.linea = l
      t.lineas[clave] = c
    end
  end

  -- Personajes del inventario, debajo de las líneas, en la columna izquierda.
  t.tituloPersonajes = Piezas.titulo(t.izquierda, L.t("PRINCIPAL_AJ_TT_PERSONAJES"), L.t("PRINCIPAL_AJ_TT_PERSONAJES_DESC"))
  t.ninguno = Tema.letra(t.izquierda:CreateFontString(nil, "OVERLAY"), "texto")
  colorTexto(t.ninguno, "apagado")
  t.ninguno:SetText(L.t("PRINCIPAL_AJ_TT_SIN_PERSONAJES"))
  TT.crearImportar(t)

  -- Si la columna cambia de ancho (la ventana se estira), los títulos pueden ocupar otras líneas: se vuelve a colocar.
  t.izquierda:SetScript("OnSizeChanged", proteger(function(_, ancho)
    if t.colocada and ancho ~= t.anchoVisto then
      t.anchoVisto = ancho
      refrescarTooltip()
    end
  end))
end

-- Coloca todo de arriba abajo y rehace las casillas de las fuentes propias. Lo llama refrescarTooltip.
local function colocarTooltip(t)
  t.colocada = false
  local ancho = t.regla:GetWidth()
  local y = ARRIBA
  enRegla(t, t.titulo, y, "todo")
  y = y + altoTitulo(t.titulo, ancho) + TT.TRAS_TITULO

  enRegla(t, t.filas.activar, y, "todo")
  enRegla(t, t.etiquetaActivar, y, "todo", true)
  enRegla(t, t.general, y + TT.ETIQUETA, "todo", true)
  y = y + TT.ETIQUETA + TT.RADIO_CASILLA
  enRegla(t, t.filas.insertar, y, "todo")
  enRegla(t, t.incrustado, y, "todo", true)
  y = y + TT.CASILLA_ETIQUETAS
  enRegla(t, t.filas.precio, y, "todo")
  enRegla(t, t.formato, y + TT.ETIQUETA, "izquierda")
  enRegla(t, t.tecla, y + TT.ETIQUETA, "derecha")
  y = y + TT.ETIQUETA + TT.ALTO_DESPLEGABLE + TT.ANTES_LINEAS

  enRegla(t, t.tituloLineas, y, "todo")
  y = y + altoTitulo(t.tituloLineas, ancho) + TT.TRAS_TITULO + 4
  enRegla(t, t.izquierda, y, "izquierda")
  enRegla(t, t.derecha, y, "derecha")

  -- La columna izquierda: los grupos con sus casillas, las fuentes propias dentro de «Valores».
  local orden = t.orden
  for i = #orden, 1, -1 do
    orden[i] = nil
  end
  local function poner(tipo, clave, marco, yc)
    marco:ClearAllPoints()
    marco:SetPoint("TOPLEFT", t.izquierda, "TOPLEFT", 0, -yc)
    marco:Show()
    orden[#orden + 1] = {tipo = tipo, clave = clave, marco = marco}
  end
  local fuentes = T().lineasFuentes()
  local yc = 0
  for _, g in ipairs(T().GRUPOS) do
    poner("grupo", g.clave, t.grupos[g.clave], yc)
    yc = yc + TT.TITULO_GRUPO
    for _, l in ipairs(g.lineas) do
      poner("linea", l.clave, t.lineas[l.clave], yc)
      yc = yc + FILA_CASILLA
    end
    if g.clave == "valores" then
      for k, l in ipairs(fuentes) do
        local c = casillaFuente(t, k)
        c.clave, c.nombre = l.clave, l.nombre
        textoCasilla(c, L.t(l.texto) .. " (" .. seguro(l.nombre) .. ")")
        poner("fuente", l.clave, c, yc)
        yc = yc + FILA_CASILLA
      end
    end
    yc = yc + TT.TRAS_GRUPO
  end
  for k = #fuentes + 1, #t.fuentes do
    t.fuentes[k].clave, t.fuentes[k].nombre = nil, nil
    t.fuentes[k]:Hide()
  end

  -- Task 40: el «Tooltip de ejemplo», repintado una vez, al lado o (columna derecha estrecha) debajo de la lista.
  EJ.repintar(t)
  local leftWidth = EJ.decidir(t, ancho)
  if leftWidth then
    t.izquierda:SetPoint("TOPRIGHT", t.regla, "TOPLEFT", leftWidth, -y)
    t.derecha:SetPoint("TOPLEFT", t.regla, "TOPLEFT", leftWidth + 2 * TT.CENTRO, -y)
  end
  local ej = t.ejemplo
  local abajo = ej.abajo == true
  local altoDerecha = 0
  if abajo then
    yc = yc + TT.ANTES_PERSONAJES - TT.TRAS_GRUPO
    EJ.colocar(t, true, y, yc)
    yc = yc + TT.TITULO_GRUPO + ej.alto + TT.TRAS_GRUPO
  else
    EJ.colocar(t, false)
    altoDerecha = TT.TITULO_GRUPO + ej.alto
  end

  -- Los personajes.
  yc = yc + TT.ANTES_PERSONAJES - TT.TRAS_GRUPO
  t.tituloPersonajes:ClearAllPoints()
  t.tituloPersonajes:SetPoint("TOPLEFT", t.izquierda, "TOPLEFT", 0, -yc)
  t.tituloPersonajes:SetPoint("TOPRIGHT", t.izquierda, "TOPRIGHT", 0, -yc)
  yc = yc + altoTitulo(t.tituloPersonajes, t.izquierda:GetWidth()) + TT.TRAS_TITULO + 4
  local lista = SNF.InventarioCuenta.personajes()
  for k, p in ipairs(lista) do
    local f = filaPersonaje(t, k, t.izquierda)
    f.clave = p.clave
    f.texto:SetText(TT.textoPersonaje(p))
    f:ClearAllPoints()
    f:SetPoint("TOPLEFT", t.izquierda, "TOPLEFT", 0, -yc)
    f:SetPoint("TOPRIGHT", t.izquierda, "TOPRIGHT", 0, -yc)
    f:Show()
    yc = yc + FILA
  end
  for k = #lista + 1, #t.personajes do
    t.personajes[k].clave = nil
    t.personajes[k]:Hide()
  end
  t.ninguno:ClearAllPoints()
  t.ninguno:SetPoint("TOPLEFT", t.izquierda, "TOPLEFT", 0, -yc - 4)
  t.ninguno:SetShown(#lista == 0)
  if #lista == 0 then
    yc = yc + FILA
  end
  -- F2: el botón «Importar inventario de TSM», debajo de la lista; apagado sin TSM.
  yc = yc + TT.ANTES_IMPORTAR
  local b = t.importarInventario
  b:ClearAllPoints()
  b:SetPoint("TOPLEFT", t.izquierda, "TOPLEFT", 0, -yc)
  b:ponerApagado(not TT.importarDisponible())
  b:Show()
  yc = yc + TT.ALTO_IMPORTAR
  t.izquierda:SetHeight(yc)
  t.derecha:SetHeight(math.max(yc, altoDerecha))
  t.colocada = true
  t.zona:ponerAlto(y + math.max(yc, altoDerecha) + ARRIBA)
end

function refrescarTooltip()
  local t = Pagina.tooltip
  if not t then
    return
  end
  colocarTooltip(t)
  -- Lo que enseña cada control y, con «Activar» en No, todo lo de debajo apagado (las «llega con…», siempre).
  t.general:refrescar()
  local apagado = not T().activo()
  for _, c in ipairs({t.incrustado, t.formato, t.tecla}) do
    c:refrescar()
    c:ponerApagado(apagado)
  end
  for _, e in ipairs(t.orden) do
    if e.tipo ~= "grupo" and not e.marco.llega then
      e.marco:refrescar()
      e.marco:ponerApagado(apagado)
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Fuentes propias
---------------------------------------------------------------------------------------------------

local refrescarFuentes -- (más abajo)

local function descripcionFuentes()
  local amarillo = "|cff" .. Tema.hex("acento")
  return L.t("PRINCIPAL_AJ_FUENTES_DESC", amarillo .. "vendorsell|r", amarillo .. "vendorbuy|r")
end

-- Abre el editor ⧉ para una fuente nueva (nombre nil) o para cambiar una.
local function editarFuente(nombre)
  SNF.EditorFormula.abrir({
    titulo = L.t("PRINCIPAL_AJ_FUENTES_EDITOR"),
    conNombre = true,
    nombre = nombre or "",
    texto = nombre and SNF.Formulas.fuentes()[nombre] or "",
    guardar = function(texto, nuevo)
      local ok, e = SNF.Formulas.ponerFuente(nuevo, texto, nombre)
      if ok then
        if nombre then
          T().renombrarFuente(nombre, nuevo) -- su línea del tooltip va con ella (no hace nada si el nombre no cambia)
        end
        refrescarFuentes()
        -- Task 25: con otro nombre, las fórmulas que la usaban pasan al nuevo (Formulas.ponerFuente); se dice cuántas.
        if type(e) == "number" and e > 0 then
          print(L.t("PRINCIPAL_AJ_FUENTE_RENOMBRADA", e))
        end
        return true
      end
      return ok, e
    end,
  })
end

local function celda(f, ancho)
  local fs = Tema.letra(f:CreateFontString(nil, "OVERLAY"), "tabla")
  colorTexto(fs, "texto")
  fs:SetJustifyH("LEFT")
  fs:SetWordWrap(false)
  if ancho then
    fs:SetWidth(ancho - 8)
  end
  return fs
end

local function filaFuente(fu, k)
  local f = fu.filas[k]
  if f then
    return f
  end
  f = botonBase(fu.marco, function(self)
    if self.fuente then
      editarFuente(self.fuente)
    end
  end)
  f:SetHeight(FILA)
  f.nombre = celda(f, ANCHO_NOMBRE)
  f.nombre:SetPoint("LEFT", f, "LEFT", 4, 0)
  f.formato = celda(f, ANCHO_FORMATO)
  f.formato:SetPoint("LEFT", f, "LEFT", 4 + ANCHO_NOMBRE, 0)
  f.quitar = botonQuitar(f, "PRINCIPAL_AJ_QUITAR", function()
    local nombre = f.fuente
    if not nombre then
      return
    end
    preguntar(L.t("PRINCIPAL_AJ_QUITAR_PREGUNTA", nombre), L.t("PRINCIPAL_AJ_QUITAR"), function()
      if SNF.Formulas.quitarFuente(nombre) then
        -- Task 39: si su línea del tooltip estaba encendida, se apaga (la clave queda en false: no se borra nada, y el
        -- tooltip deja de calcularla). Si estaba apagada no se guarda nada.
        local clave = "fuente:" .. nombre
        if T().linea(clave) then
          T().ponerLinea(clave, false)
        end
      end
      refrescarFuentes()
    end)
  end)
  f.quitar:SetPoint("RIGHT", f, "RIGHT", -6, 0)
  f.formula = celda(f)
  f.formula:SetPoint("LEFT", f, "LEFT", 4 + ANCHO_NOMBRE + ANCHO_FORMATO, 0)
  f.formula:SetPoint("RIGHT", f.quitar, "LEFT", -8, 0)
  -- El fondo de la fila con el ratón encima (solo mientras está encima: no cambia solo).
  f.luz = plana(f, "BACKGROUND", 0)
  f.luz:SetAllPoints(f)
  pintar(f.luz, "elegida")
  f.luz:Hide()
  f:SetScript("OnEnter", proteger(function(self) self.luz:Show() end))
  f:SetScript("OnLeave", proteger(function(self) self.luz:Hide() end))
  fu.filas[k] = f
  return f
end

local function crearFuentes(ap)
  local fu = {filas = {}, marco = ap}
  Pagina.fuentes = fu
  fu.titulo = Piezas.titulo(ap, L.t("PRINCIPAL_AJ_FUENTES_TITULO"), descripcionFuentes())
  fu.titulo:SetPoint("TOPLEFT", ap, "TOPLEFT", 0, -ARRIBA)
  fu.titulo:SetPoint("TOPRIGHT", ap, "TOPRIGHT", 0, -ARRIBA)
  fu.descripcion = fu.titulo.descripcion

  local cab = CreateFrame("Frame", nil, ap)
  cab:SetHeight(FILA)
  cab:SetPoint("TOPLEFT", fu.titulo, "BOTTOMLEFT", 0, -14)
  cab:SetPoint("TOPRIGHT", fu.titulo, "BOTTOMRIGHT", 0, -14)
  local linea = plana(cab, "ARTWORK", 0)
  linea:SetHeight(1)
  linea:SetPoint("BOTTOMLEFT", cab, "BOTTOMLEFT", 0, 0)
  linea:SetPoint("BOTTOMRIGHT", cab, "BOTTOMRIGHT", 0, 0)
  pintar(linea, "borde")
  fu.cabecera = cab
  local function titulo(clave, x)
    local fs = Tema.letra(cab:CreateFontString(nil, "OVERLAY"), "cabecera")
    colorTexto(fs, "textoPestana")
    fs:SetPoint("LEFT", cab, "LEFT", x, 0)
    fs:SetText(L.t(clave))
    fs.claveTexto = clave
    return fs
  end
  fu.cabeceras = {
    nombre = titulo("PRINCIPAL_AJ_FUENTES_NOMBRE", 4),
    formato = titulo("PRINCIPAL_AJ_FUENTES_FORMATO", 4 + ANCHO_NOMBRE),
    formula = titulo("PRINCIPAL_AJ_FUENTES_FORMULA", 4 + ANCHO_NOMBRE + ANCHO_FORMATO),
  }

  fu.agregar = Piezas.boton(ap, L.t("PRINCIPAL_AJ_FUENTES_AGREGAR"), function() editarFuente(nil) end,
    {alto = ALTO_AGREGAR, letra = LETRA_AGREGAR})
end

function refrescarFuentes()
  local fu = Pagina.fuentes
  if not fu then
    return
  end
  local fuentes = SNF.Formulas.fuentes()
  local nombres = {}
  for nombre in pairs(fuentes) do
    nombres[#nombres + 1] = nombre
  end
  table.sort(nombres)
  local anterior = fu.cabecera
  for k, nombre in ipairs(nombres) do
    local f = filaFuente(fu, k)
    f.fuente = nombre
    f.nombre:SetText(seguro(nombre))
    f.formato:SetText(L.t("PRINCIPAL_AJ_FUENTES_ORO"))
    f.formula:SetText(seguro(fuentes[nombre]))
    f:ClearAllPoints()
    f:SetPoint("TOPLEFT", anterior, "BOTTOMLEFT", 0, 0)
    f:SetPoint("TOPRIGHT", anterior, "BOTTOMRIGHT", 0, 0)
    f:Show()
    anterior = f
  end
  for k = #nombres + 1, #fu.filas do
    fu.filas[k].fuente = nil
    fu.filas[k]:Hide()
  end
  fu.agregar:ClearAllPoints()
  fu.agregar:SetPoint("TOPLEFT", anterior, "BOTTOMLEFT", 0, -8)
  fu.agregar:SetPoint("TOPRIGHT", anterior, "BOTTOMRIGHT", 0, -8)
end

---------------------------------------------------------------------------------------------------
-- Apariencia
---------------------------------------------------------------------------------------------------

local function crearApariencia(ap)
  local a = {}
  Pagina.apariencia = a
  a.titulo = Piezas.titulo(ap, L.t("PRINCIPAL_AJ_APARIENCIA_TITULO"), L.t("PRINCIPAL_AJ_APARIENCIA_DESC"))
  a.titulo:SetPoint("TOPLEFT", ap, "TOPLEFT", 0, -ARRIBA)
  a.titulo:SetPoint("TOPRIGHT", ap, "TOPRIGHT", 0, -ARRIBA)
  -- Marcada = el icono escondido (minimapa.boton apagado).
  a.minimapa = Piezas.casilla(ap, L.t("PRINCIPAL_AJ_MINIMAPA"), function()
    return SNF.Ajustes.get("minimapa.boton") == false
  end, function(ocultar)
    SNF.Ajustes.set("minimapa.boton", not ocultar)
  end)
  a.minimapa:SetPoint("TOPLEFT", a.titulo, "BOTTOMLEFT", 0, -14)
end

---------------------------------------------------------------------------------------------------
-- La barra y la página
---------------------------------------------------------------------------------------------------

local function pintarBarra()
  for clave, b in pairs(Pagina.botones) do
    colorTexto(b.texto, clave == elegido and "acento" or (b.encima and "texto" or "textoPestana"))
  end
end

function Pagina.refrescar()
  if not Pagina.pagina then
    return
  end
  refrescarTooltip()
  refrescarFuentes()
  if Pagina.apariencia then
    Pagina.apariencia.minimapa:refrescar()
  end
end

function Pagina.elegido()
  return elegido
end

local function esApartado(clave)
  for _, a in ipairs(APARTADOS) do
    if a == clave then
      return true
    end
  end
  return false
end

function Pagina.elegir(clave)
  if not esApartado(clave) then
    return
  end
  elegido = clave
  if not Pagina.apartados then
    return -- la página aún no está creada: sale al crearse
  end
  cerrarConfirmar()
  for c, ap in pairs(Pagina.apartados) do
    ap:SetShown(c == clave)
  end
  pintarBarra()
  -- Task 39: al volver a un apartado se vuelve a leer lo que enseña (en Tooltip, las casillas de las fuentes propias, que
  -- pueden haber cambiado en Fuentes propias o desde otro sitio).
  if clave == "tooltip" then
    refrescarTooltip()
  elseif clave == "fuentes" then
    refrescarFuentes()
  end
end

local function crearPagina(padre)
  Pagina.pagina = padre
  local barra = CreateFrame("Frame", nil, padre)
  barra:SetPoint("TOPLEFT", padre, "TOPLEFT", 0, 0)
  barra:SetPoint("BOTTOMLEFT", padre, "BOTTOMLEFT", 0, 0)
  barra:SetWidth(ANCHO_BARRA)
  local fondo = plana(barra, "BACKGROUND", 0)
  fondo:SetAllPoints(barra)
  pintar(fondo, "secundario")
  Pagina.barra, Pagina.fondoBarra = barra, fondo
  Pagina.botones = {}

  local y = ARRIBA_BARRA
  for i, clave in ipairs(APARTADOS) do
    local b = botonBase(barra, function() Pagina.elegir(clave) end)
    b:SetHeight(FILA_BARRA)
    b:SetPoint("TOPLEFT", barra, "TOPLEFT", 0, -y)
    b:SetPoint("TOPRIGHT", barra, "TOPRIGHT", 0, -y)
    b.texto = Tema.letra(b:CreateFontString(nil, "OVERLAY"), "texto")
    b.texto:SetPoint("LEFT", b, "LEFT", IZQUIERDA_TEXTO, 0)
    b.texto:SetPoint("RIGHT", b, "RIGHT", -4, 0)
    b.texto:SetJustifyH("LEFT")
    b.texto:SetWordWrap(false)
    b.texto:SetText(L.t(claveApartado(clave)))
    -- Con el ratón encima, el texto se aclara (solo mientras está encima).
    b:SetScript("OnEnter", proteger(function(self)
      self.encima = true
      pintarBarra()
    end))
    b:SetScript("OnLeave", proteger(function(self)
      self.encima = false
      pintarBarra()
    end))
    Pagina.botones[clave] = b
    y = y + FILA_BARRA + (i == 2 and HUECO_BARRA or 0)
  end

  local der = CreateFrame("Frame", nil, padre)
  der:SetPoint("TOPLEFT", padre, "TOPLEFT", ANCHO_BARRA + IZQUIERDA, 0)
  der:SetPoint("BOTTOMRIGHT", padre, "BOTTOMRIGHT", -DERECHA, 0)
  Pagina.derecha = der
  local apartados = {}
  for _, clave in ipairs(APARTADOS) do
    local ap = CreateFrame("Frame", nil, der)
    ap:SetAllPoints(der)
    ap:Hide()
    if not FUNCIONAN[clave] then
      local c = Tema.color("apagado")
      local fs = Tema.letra(ap:CreateFontString(nil, "OVERLAY"), "titulo", 18)
      fs:SetTextColor(c[1], c[2], c[3], c[4])
      fs:SetPoint("CENTER", ap, "CENTER", 0, 0)
      fs:SetText(L.t("PRINCIPAL_OTRA_PARTE"))
      ap.otraParte = fs
    end
    apartados[clave] = ap
  end
  crearTooltip(apartados.tooltip)
  crearFuentes(apartados.fuentes)
  crearApariencia(apartados.apariencia)
  Pagina.apartados = apartados
  Pagina.refrescar()
  Pagina.elegir(elegido)
end

local function ponerTitulo(marco, titulo, descripcion)
  marco.titulo:SetText(titulo)
  if marco.descripcion then
    marco.descripcion:SetText(descripcion)
  end
  marco:ponerAncho(marco:GetWidth())
end

local function repintarTextos()
  if not Pagina.pagina then
    return
  end
  for clave, b in pairs(Pagina.botones) do
    b.texto:SetText(L.t(claveApartado(clave)))
  end
  for _, ap in pairs(Pagina.apartados) do
    if ap.otraParte then
      ap.otraParte:SetText(L.t("PRINCIPAL_OTRA_PARTE"))
    end
  end
  local t = Pagina.tooltip
  ponerTitulo(t.titulo, L.t("PRINCIPAL_AJ_TT_TITULO"), L.t("PRINCIPAL_AJ_TT_DESC"))
  ponerTitulo(t.tituloLineas, L.t("PRINCIPAL_AJ_TT_LINEAS"), L.t("PRINCIPAL_AJ_TT_LINEAS_DESC"))
  ponerTitulo(t.tituloPersonajes, L.t("PRINCIPAL_AJ_TT_PERSONAJES"), L.t("PRINCIPAL_AJ_TT_PERSONAJES_DESC"))
  t.etiquetaActivar:ponerTexto(L.t("COMERCIO_TT_OPC_ACTIVAR"))
  t.general:ponerTextos(L.t("COMERCIO_TT_OPC_SI"), L.t("COMERCIO_TT_OPC_NO"))
  textoCasilla(t.incrustado, L.t("COMERCIO_TT_OPC_INCRUSTADO"))
  t.etiquetaFormato:ponerTexto(L.t("COMERCIO_TT_OPC_FORMATO"))
  t.etiquetaTecla:ponerTexto(L.t("COMERCIO_TT_OPC_TECLA"))
  t.formato.snfOpciones.opciones = opcionesDe("formato") -- lo que dice la caja, en Pagina.refrescar
  t.tecla.snfOpciones.opciones = opcionesDe("tecla")
  for _, g in ipairs(T().GRUPOS) do
    t.grupos[g.clave]:SetText(L.t(g.texto))
  end
  for _, c in pairs(t.lineas) do
    textoCasilla(c, textoLinea(c.linea))
  end
  t.ninguno:SetText(L.t("PRINCIPAL_AJ_TT_SIN_PERSONAJES"))
  t.importarInventario:ponerTexto(L.t("PRINCIPAL_AJ_TT_IMPORTAR_INV"))
  t.ejemplo.titulo:SetText(L.t("PRINCIPAL_AJ_TT_EJEMPLO")) -- las filas del ejemplo se repintan en Pagina.refrescar
  local fu = Pagina.fuentes
  ponerTitulo(fu.titulo, L.t("PRINCIPAL_AJ_FUENTES_TITULO"), descripcionFuentes())
  for _, fs in pairs(fu.cabeceras) do
    fs:SetText(L.t(fs.claveTexto))
  end
  fu.agregar:ponerTexto(L.t("PRINCIPAL_AJ_FUENTES_AGREGAR"))
  local a = Pagina.apariencia
  ponerTitulo(a.titulo, L.t("PRINCIPAL_AJ_APARIENCIA_TITULO"), L.t("PRINCIPAL_AJ_APARIENCIA_DESC"))
  textoCasilla(a.minimapa, L.t("PRINCIPAL_AJ_MINIMAPA"))
  Pagina.refrescar() -- el «Oro» de las filas
end

SNF.Principal.registrar("ajustes", {
  crear = crearPagina,
  mostrar = function()
    Pagina.refrescar() -- las fuentes, el inventario o el tooltip pueden haber cambiado desde otro sitio
  end,
  ocultar = function()
    cerrarConfirmar()
  end,
  idioma = repintarTextos,
})

-- «/snet comercio tooltip» (y cualquier cambio de las opciones, TooltipComercio.ponerOpcion) con la página a la vista: el
-- radio Activar, la casilla y los desplegables lo siguen.
SNF.escuchar("SNF_COMERCIO_TOOLTIP", function()
  refrescarTooltip()
end)

-- La casilla del minimapa de la ventana de la guía cambia el mismo ajuste.
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "minimapa.boton" and Pagina.apariencia then
    Pagina.apariencia.minimapa:refrescar()
  end
end)
