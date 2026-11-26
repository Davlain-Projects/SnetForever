-- SnetForever: editor de una operación, la parte derecha de la página «Operaciones» cuando se elige una operación en el árbol
-- (Task 22). Los campos se pintan desde SNF.Operaciones.TIPOS: no hay una pantalla escrita a mano para cada tipo.
--
-- De arriba abajo (medidas de las capturas op-01 a op-15 y de las del jugador, en píxeles reales):
--   - Cabecera: el icono «intercambio» (⇄, como op-01; hasta la Task 32 era el engranaje «operacion»), el nombre en Bold
--     y, a la derecha, «✎ Renombrar» y «⟳ Restablecer» en `enlace`.
--       ✎ cambia el nombre por un campo (Intro renombra; Escape o salir sin cambiar lo deja como estaba). No vale un nombre
--       vacío, repetido en el tipo, de más de 60 letras ni uno que parezca un comando del chat (empieza por «/»): el campo se
--       pone en rojo con el motivo y no renombra.
--       ⟳ vuelve a los valores por defecto y quita los vínculos (Operaciones.restablecer). Lo de ignorar (reinos y personajes)
--       se queda: así lo decidimos para no borrar sin querer lo que se puso a mano en «Opciones de manejo», y el tooltip del
--       botón lo dice. Antes pregunta (decisión del coordinador, ronda 1) con un cuadro fijo, sin animación, como el de borrar
--       de la página (un marco propio, no StaticPopup): «¿Restablecer «<nombre>» a sus valores por defecto? No se puede
--       deshacer…», [Restablecer] y [Cancelar]. Solo [Restablecer] restablece; Cancelar, Escape o esconderse el editor no tocan
--       nada. Escape: el cuadro tiene teclado propio y se queda la tecla (sin esas funciones, entra en UISpecialFrames).
--   - Subasta: tres pestañas secundarias, Detalles, Publicación y Cancelación (op-01, op-02 y op-03), cada una con su zona con
--     desplazamiento. Al cambiar a otra operación de subasta se queda la pestaña que estaba. Los demás tipos van en una sola
--     página con desplazamiento (op-09).
--   - Secciones: título en Bold y su descripción; debajo, un bloque por campo cada 53 px: la etiqueta (gris claro) con 🔗
--     detrás y, 20 px más abajo, el control a todo lo ancho. Del borde de abajo del último control de una sección al título
--     de la siguiente quedan 26 px, como en op-01 (Task 35; antes, 15), también cuando ese control es un sí/no.
--     La explicación del campo (Task 34, como en TSM): sale al pasar el ratón por la caja (en un sí/no, por el «Sí» y por el
--     «No») y también por la etiqueta. Es un tooltip con el nombre del campo en blanco, su explicación
--     (PRINCIPAL_EDITOR_C_<TIPO>_<CAMPO>_A) y, en otras líneas, el rango de un número («Un valor de 0 a 100 %») y, si está
--     vinculado, de qué operación toma el valor (PRINCIPAL_EDITOR_VINCULADO). Sale a la derecha de la fila del bloque
--     (b.fila: un marco sin dibujo a la altura de la caja que llega al borde derecho del contenido, con la ayuda del número
--     dentro) y arriba a la altura de la caja, como en tsm-tooltip-campo-puja.webp. Apagado o vinculado sale igual; con la
--     lista de un desplegable abierta, no. El error de una fórmula o un número va en el mismo tooltip, debajo y en rojo, y
--     no se repinta con cada letra que da el mismo error (Piezas.campo).
--       formula  campo con ⧉; se valida con Formulas.compilar y lo que no vale (una fuente desconocida, un paréntesis...)
--                sale en rojo con el mensaje de Formulas.mensaje en el tooltip, y no se guarda.
--       numero   campo, con la ayuda «Un valor de 0 a 100» a la derecha (fuera de rango, en rojo y sin guardar). Con
--                `unidad` (Task 35, la puja: «%»), el campo enseña «100%», acepta «85», «85%» y « 85 % » y guarda el
--                número 85; la ayuda acaba en la unidad, como la de TSM («Un valor de 0 a 100 %»,
--                PRINCIPAL_EDITOR_NUMERO_RANGO_UNIDAD), y la caja deja el mismo sitio a la ayuda que sin unidad.
--       texto    campo.
--       sino     radio Sí / No.
--       lista    desplegable.   varios: desplegable de varios.
--     Los campos con `depende` se apagan (control y etiqueta en gris) cuando su interruptor está en «No», siguiendo la cadena
--     (en Correo, «Fuentes para reponer» depende de «Reponer», que depende de «Poner una cantidad máxima»).
--   - 🔗 abre una lista con el título «Enlazar con otra operación» y borde dorado (Task 33, como TSM), «Sin vínculo (valor
--     propio)» y las demás operaciones del mismo tipo; la ventana se oscurece detrás (Piezas.desplegable). El título se
--     repinta al cambiar de idioma. Vinculado, el campo enseña el valor de la otra, no se edita y el 🔗 va en amarillo (su
--     tooltip dice con cuál). Un vínculo que haría un ciclo (B toma ya ese valor de esta) no se guarda y se avisa en el chat.
--   - Al final de cada editor (en Subasta, al final de Detalles, como op-01):
--       «Opciones de manejo»: dos desplegables de varios, reinos y facciones, y personajes, solo con los propios de la cuenta
--       (Operaciones.propios; nunca nombres de otros jugadores).
--       «Administrar grupo»: «Aplicar operación a grupo» con la barra plana «Agregar operación a grupos +» (Grupo Base y los
--       grupos que aún no la tienen) y debajo los grupos que la tienen en su lista propia, con una ✖ que la quita. Como en
--       op-01 (Task 35): el nombre va en el color de su nivel en el árbol (nivel1 a nivel5, y vuelta a empezar; Grupo Base en
--       `base`, blanco) y detrás lleva el icono `vinculo` de 12 px en `apagado` (hasta la Task 35, `acento` y una carpeta). Aplicarla a un grupo que heredaba copia lo heredado y añade esta (como «Usar las suyas» de Grupos); en
--       los tipos de una sola operación, esta sustituye a la que hubiera.
--   - ⧉ es el gancho del editor de fórmulas de la Task 23: llama a SNF.EditorOperacion.alEditarFormula(datos), con datos =
--     {tipo, nombre, clave, texto, campo, guardar = fn(texto) -> boolean}. La función de serie solo pone el cursor en el
--     campo para escribir; ui/principal/editor-formula.lua (Task 23) la cambia por la que abre el editor de fórmulas ⧉.
--
-- SNF.EditorOperacion:
--   .crear(padre, {alRenombrar = fn(tipo, nuevo), alCambiar = fn()}) -> ed   alCambiar: se han aplicado o quitado grupos.
--   .alEditarFormula(datos)   el gancho de ⧉ (ver arriba).
--   .cuadroConfirmar(nombreMarco) -> c   el cuadro fijo de preguntar (el de ⟳; Task 23: también lo usa Ajustes).
--                             c:preguntar(texto, textoBoton, alAceptar) y c:cerrar(); partes .texto, .botonAceptar y
--                             .botonCancelar; c.alOcultar(c), si se pone, se llama al esconderse. Solo el botón hace lo
--                             pedido; Cancelar y Escape no tocan nada.
--   .clavesDeTexto() -> {claves}   todas las claves de texto que usa (para comprobar que están en es y en).
-- ed (el marco del editor): :abrir(tipo, nombre), :refrescar() (vuelve a leer los valores), :repintarTextos() (al cambiar
--   de idioma), :pagina() (la que se ve: {tipo, pestana, zona, contenido, bloques = {clave -> bloque}, orden = {claves},
--   secciones = {marcos de Piezas.titulo}, filasGrupo}) y :bloque(clave). Un bloque: {clave, clase (el tipo del campo o
--   «grupos»), def, etiqueta, control, ayuda? (el FontString del rango de un número, también con unidad), fila (Task 34),
--   vinculada, y}. Partes: .icono, .textoNombre, .enlaceRenombrar,
--   .enlaceRestablecer (con .icono), .campoNombre, .pestanas y .vinculo (el desplegable del 🔗).
-- El cuadro de Restablecer es el marco SnetForeverEditorRestablecer (.texto, .botonRestablecer = .botonAceptar,
-- .botonCancelar); se crea la primera vez que se pulsa ⟳.
-- Nada se mueve, parpadea ni cambia de color solo; no hay OnUpdate.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local Editor = {}
SNF.EditorOperacion = Editor

local pintar = Piezas.interno.pintar
local colorTexto = Piezas.interno.colorTexto
local proteger = Piezas.proteger

local CENTRO_CABECERA = 18 -- del borde de arriba al centro de la cabecera (como el resumen)
local LADO_ICONO = 14
local HUECO_LINKS = 16 -- entre «Renombrar» y «Restablecer»
local ARRIBA_PESTANAS = 34
local ARRIBA_ZONA = 40
local ARRIBA_ZONA_PESTANAS = 72 -- bajo las pestañas (28 px) y 10 px de aire
local ABAJO = 8
local BLOQUE = 53 -- un campo: etiqueta, control y aire hasta el siguiente
local BAJO_ETIQUETA = 20 -- de la etiqueta (14 px) al control
local ALTO_CONTROL = 22
local HUECO_TITULO = 18 -- de la descripción de una sección a su primera etiqueta
local HUECO_SECCION = 15 -- además del aire bajo el último control (11 px), antes del título de la sección siguiente: 26 px
-- en total, como op-01 (Task 35)
local AIRE_BLOQUE = BLOQUE - BAJO_ETIQUETA - ALTO_CONTROL -- 11: del borde de abajo de una caja al bloque siguiente
local DERECHA = 10 -- del control al borde derecho (sitio para la barra de desplazamiento)
local ANCHO_AYUDA = 180 -- la columna de la ayuda de un campo de número
local LETRA_AYUDA = 11
local FILA_GRUPO = 31 -- de centro a centro: la barra «Agregar» y cada grupo aplicado
local ALTO_FILA_GRUPO = 16
local ABAJO_CONTENIDO = 16
local ANCHO_NOMBRE = 320
local ANCHO_VINCULO = 260
local MAX_NOMBRE = 60
local SEP = "`" -- el de SNF.Arbol
local NOMBRE_CONFIRMAR = "SnetForeverEditorRestablecer"

local PESTANAS_SUBASTA = {"detalles", "publicacion", "cancelacion"}
local TEXTO_PESTANA = {
  detalles = "PRINCIPAL_EDITOR_PESTANA_DETALLES", publicacion = "PRINCIPAL_EDITOR_PESTANA_PUBLICACION",
  cancelacion = "PRINCIPAL_EDITOR_PESTANA_CANCELACION",
}
local TEXTO_COMUN = {ignorarReinos = "PRINCIPAL_EDITOR_IGNORAR_REINOS", ignorarPersonajes = "PRINCIPAL_EDITOR_IGNORAR_PERSONAJES"}
local CABECERA_COMUN = {ignorarReinos = "PRINCIPAL_EDITOR_SIN_REINOS", ignorarPersonajes = "PRINCIPAL_EDITOR_SIN_PERSONAJES"}
local GUARDADO_COMUN = {ignorarReinos = "casas", ignorarPersonajes = "personajes"}

local function O()
  return SNF.Operaciones
end

local function recortar(texto)
  local s = tostring(texto or "")
  local desde = string.find(s, "%S")
  if not desde then
    return ""
  end
  local hasta = #s
  while hasta > desde and string.find(string.sub(s, hasta, hasta), "%s") do
    hasta = hasta - 1
  end
  return string.sub(s, desde, hasta)
end

-- Un texto del jugador para un FontString: en el juego «|» empieza un código (|H es un enlace), así que se dobla.
local function seguro(texto)
  return (string.gsub(tostring(texto or ""), "|", "||"))
end

local function conjunto(lista)
  local c = {}
  for _, v in ipairs(lista or {}) do
    c[v] = true
  end
  return c
end

-- El texto del rango de un campo de número: «Un valor de 0 a 100» o, con unidad, «Un valor de 0 a 100 %» (Task 35).
local function textoRango(def)
  if def.unidad then
    return L.t("PRINCIPAL_EDITOR_NUMERO_RANGO_UNIDAD", def.min, def.max, def.unidad)
  end
  return L.t("PRINCIPAL_EDITOR_NUMERO_RANGO", def.min, def.max)
end

-- El número que escribe el jugador en un campo de número, o nil si no lo es. Con unidad (Task 35) vale con ella detrás o
-- sin ella, y con espacios: «85», «85%» y « 85 % » dan 85; «85%%» no vale.
local function leerNumero(def, texto)
  local t = recortar(texto)
  local u = def.unidad
  if u and u ~= "" and string.sub(t, -string.len(u)) == u then
    t = recortar(string.sub(t, 1, -string.len(u) - 1))
  end
  return tonumber(t)
end

-- Group links use the level color. The base group uses the first-level accent here.
local function colorRuta(ruta, grupos)
  if ruta == "" then
    return "nivel1"
  end
  local g = grupos and grupos[ruta]
  local nivel = g and g.nivel
  if not nivel then
    local _, seps = string.gsub(ruta, SEP, "")
    nivel = seps + 1
  end
  return "nivel" .. (((math.floor(nivel) - 1) % 5) + 1)
end

---------------------------------------------------------------------------------------------------
-- Claves de texto
---------------------------------------------------------------------------------------------------

local function claveCampo(tipo, clave)
  return "PRINCIPAL_EDITOR_C_" .. string.upper(tipo) .. "_" .. string.upper(clave)
end

local function claveSeccion(tipo, n)
  return "PRINCIPAL_EDITOR_S_" .. string.upper(tipo) .. "_" .. n
end

local function claveOpcion(campo, opcion)
  return "PRINCIPAL_EDITOR_O_" .. string.upper(campo) .. "_" .. string.upper(opcion)
end

-- Lo que dice un desplegable de varios sin nada elegido.
local function claveVacia(def)
  if def.comun then
    return CABECERA_COMUN[def.clave]
  end
  return def.clave == "fuentesReponer" and "PRINCIPAL_EDITOR_SIN_FUENTES" or "PRINCIPAL_EDITOR_NINGUNO"
end

-- Las secciones de un tipo, en el orden de TIPOS: {{n, pestana, campos = {defs}}}. n cuenta en todo el tipo.
local function seccionesDe(tipo)
  local lista, porNombre = {}, {}
  for _, c in ipairs(O().TIPOS[tipo].campos) do
    local s = porNombre[c.seccion or ""]
    if not s then
      s = {n = #lista + 1, pestana = c.pestana, campos = {}}
      porNombre[c.seccion or ""] = s
      lista[#lista + 1] = s
    end
    s.campos[#s.campos + 1] = c
  end
  return lista
end

local CLAVES_FIJAS = {
  "PRINCIPAL_EDITOR_RENOMBRAR", "PRINCIPAL_EDITOR_RESTABLECER", "PRINCIPAL_EDITOR_RESTABLECER_AYUDA",
  "PRINCIPAL_EDITOR_RESTABLECER_PREGUNTA", "PRINCIPAL_GRUPOS_CANCELAR",
  "PRINCIPAL_EDITOR_PESTANA_DETALLES", "PRINCIPAL_EDITOR_PESTANA_PUBLICACION", "PRINCIPAL_EDITOR_PESTANA_CANCELACION",
  "PRINCIPAL_EDITOR_MANEJO", "PRINCIPAL_EDITOR_MANEJO_A", "PRINCIPAL_EDITOR_IGNORAR_REINOS", "PRINCIPAL_EDITOR_IGNORAR_REINOS_A",
  "PRINCIPAL_EDITOR_IGNORAR_PERSONAJES", "PRINCIPAL_EDITOR_IGNORAR_PERSONAJES_A", "PRINCIPAL_EDITOR_SIN_REINOS",
  "PRINCIPAL_EDITOR_SIN_PERSONAJES", "PRINCIPAL_EDITOR_SIN_FUENTES", "PRINCIPAL_EDITOR_NINGUNO", "PRINCIPAL_EDITOR_GRUPOS", "PRINCIPAL_EDITOR_GRUPOS_A",
  "PRINCIPAL_EDITOR_APLICAR", "PRINCIPAL_EDITOR_APLICAR_A", "PRINCIPAL_EDITOR_AGREGAR", "PRINCIPAL_EDITOR_QUITAR_GRUPO",
  "PRINCIPAL_EDITOR_SIN_VINCULO", "PRINCIPAL_EDITOR_VINCULO_TITULO", "PRINCIPAL_EDITOR_VINCULO_AYUDA", "PRINCIPAL_EDITOR_VINCULADO",
  "PRINCIPAL_EDITOR_VINCULO_CICLO", "PRINCIPAL_EDITOR_NUMERO_RANGO", "PRINCIPAL_EDITOR_NUMERO_RANGO_UNIDAD",
  "PRINCIPAL_EDITOR_NUMERO_MAL",
  "PRINCIPAL_EDITOR_NOMBRE_VACIO", "PRINCIPAL_EDITOR_NOMBRE_COMANDO", "PRINCIPAL_EDITOR_NOMBRE_REPETIDO",
  "PRINCIPAL_EDITOR_NOMBRE_LARGO", "PRINCIPAL_EDITOR_ELEGIDO_UNO", "PRINCIPAL_EDITOR_ELEGIDOS", "PRINCIPAL_EDITOR_SI",
  "PRINCIPAL_EDITOR_NO", "PRINCIPAL_GRUPOS_BASE",
}

function Editor.clavesDeTexto()
  local claves = {}
  for _, k in ipairs(CLAVES_FIJAS) do
    claves[#claves + 1] = k
  end
  for _, tipo in ipairs(O().ORDEN) do
    for _, s in ipairs(seccionesDe(tipo)) do
      claves[#claves + 1] = claveSeccion(tipo, s.n)
      claves[#claves + 1] = claveSeccion(tipo, s.n) .. "_A"
      for _, def in ipairs(s.campos) do
        claves[#claves + 1] = claveCampo(tipo, def.clave)
        claves[#claves + 1] = claveCampo(tipo, def.clave) .. "_A"
        for _, o in ipairs(def.opciones or {}) do
          claves[#claves + 1] = claveOpcion(def.clave, o.clave)
        end
      end
    end
  end
  return claves
end

---------------------------------------------------------------------------------------------------
-- Tooltip
---------------------------------------------------------------------------------------------------

local function verAyuda(dueno, titulo, texto)
  local tt = rawget(_G, "GameTooltip")
  if not tt or (tt.IsForbidden and tt:IsForbidden()) then
    return
  end
  tt:SetOwner(dueno, "ANCHOR_RIGHT")
  if titulo then
    tt:SetText(titulo, 1, 1, 1, 1, true)
    if texto then
      local c = Tema.color("textoPestana")
      tt:AddLine(texto, c[1], c[2], c[3], true)
    end
  else
    tt:SetText(texto or "", 1, 1, 1, 1, true)
  end
  tt:Show()
end

local function esconderAyuda(dueno)
  local tt = rawget(_G, "GameTooltip")
  if tt and not (tt.IsForbidden and tt:IsForbidden()) and tt:GetOwner() == dueno then
    tt:Hide()
  end
end

-- El texto de un grupo: «Grupo Base» o la ruta con « › » entre niveles.
local function textoRuta(ruta)
  if ruta == "" then
    return L.t("PRINCIPAL_GRUPOS_BASE")
  end
  return (string.gsub(seguro(ruta), SEP, " › "))
end

-- «Reino|Facción» como «Reino - Facción» (la facción, con el nombre del juego si lo da).
local function textoCasa(casa)
  local reino, faccion = string.match(casa, "^(.*)|([^|]*)$")
  if not reino then
    return seguro(casa)
  end
  local nombre = rawget(_G, "FACTION_" .. string.upper(faccion))
  return seguro(reino) .. " - " .. seguro(type(nombre) == "string" and nombre or faccion)
end

local function contar(n)
  if n == 1 then
    return L.t("PRINCIPAL_EDITOR_ELEGIDO_UNO")
  end
  return L.t("PRINCIPAL_EDITOR_ELEGIDOS", n)
end

-- El gancho de ⧉ hasta la Task 23: el cursor al campo.
function Editor.alEditarFormula(datos)
  if datos and datos.campo and datos.campo.SetFocus then
    datos.campo:SetFocus()
  end
end

---------------------------------------------------------------------------------------------------
-- El cuadro fijo que pregunta antes de hacer algo que no se puede deshacer
---------------------------------------------------------------------------------------------------

local function quitarDeEspeciales(nombreMarco)
  for k = #UISpecialFrames, 1, -1 do
    if UISpecialFrames[k] == nombreMarco then
      table.remove(UISpecialFrames, k)
    end
  end
end

-- Un marco propio (no StaticPopup), sin animación, en el centro de la pantalla: el texto de la pregunta, [botón] y
-- [Cancelar]. Lo usan ⟳ Restablecer y Ajustes (quitar una fuente propia u olvidar un personaje). Solo el botón de la
-- derecha (el que dice lo que se va a hacer) lo hace; Cancelar, Escape o esconderse no tocan nada.
function Editor.cuadroConfirmar(nombreMarco)
  local c = CreateFrame("Frame", nombreMarco, UIParent)
  SNF.WindowSizing.register(c, nombreMarco, true)
  c:SetSize(380, 118)
  c:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  c:SetFrameStrata("FULLSCREEN_DIALOG")
  c:EnableMouse(true)
  Tema.panel(c, "fondo", {borde = true})
  local t = Tema.letra(c:CreateFontString(nil, "OVERLAY"), "texto")
  t:SetPoint("TOPLEFT", c, "TOPLEFT", 12, -14)
  t:SetPoint("TOPRIGHT", c, "TOPRIGHT", -12, -14)
  t:SetJustifyH("LEFT")
  t:SetJustifyV("TOP")
  t:SetHeight(62)
  c.texto = t

  function c:cerrar()
    self.alAceptar = nil
    self:Hide()
  end

  -- Enseña la pregunta; [textoAceptar] llama a alAceptar() (una vez, después de cerrar el cuadro).
  function c:preguntar(texto, textoAceptar, alAceptar)
    self.botonAceptar:ponerTexto(textoAceptar)
    self.botonCancelar:ponerTexto(L.t("PRINCIPAL_GRUPOS_CANCELAR"))
    self.texto:SetText(texto)
    self:Show()
    self.alAceptar = alAceptar
  end

  c.botonAceptar = Piezas.boton(c, "", function()
    local fn = c.alAceptar
    c:cerrar()
    if fn then
      fn()
    end
  end, {ancho = 110})
  c.botonAceptar:SetPoint("BOTTOMRIGHT", c, "BOTTOMRIGHT", -12, 12)
  c.botonCancelar = Piezas.boton(c, L.t("PRINCIPAL_GRUPOS_CANCELAR"), function() c:cerrar() end, {ancho = 110, borde = true})
  c.botonCancelar:SetPoint("RIGHT", c.botonAceptar, "LEFT", -8, 0)
  local conTeclado = c.EnableKeyboard ~= nil and c.SetPropagateKeyboardInput ~= nil
  if conTeclado then
    c:SetScript("OnKeyDown", proteger(function(self, tecla)
      -- En combate no se toca la propagación (el cliente la bloquea a un código no seguro): Escape cancela igual.
      local libre = not (InCombatLockdown and InCombatLockdown())
      if tecla == "ESCAPE" then
        if libre then
          self:SetPropagateKeyboardInput(false)
        end
        self:cerrar()
      elseif libre then
        self:SetPropagateKeyboardInput(true)
      end
    end))
  end
  c:SetScript("OnShow", proteger(function(self)
    if conTeclado then
      self:EnableKeyboard(true)
    else
      quitarDeEspeciales(nombreMarco)
      table.insert(UISpecialFrames, nombreMarco)
    end
  end))
  c:SetScript("OnHide", proteger(function(self)
    self.alAceptar = nil
    if self.alOcultar then
      self.alOcultar(self)
    end
    if conTeclado then
      self:EnableKeyboard(false)
    end
    quitarDeEspeciales(nombreMarco)
  end))
  c:Hide()
  return c
end

---------------------------------------------------------------------------------------------------
-- El editor
---------------------------------------------------------------------------------------------------

function Editor.crear(padre, opciones)
  opciones = opciones or {}
  local ed = CreateFrame("Frame", nil, padre)
  local paginas = {} -- clave «tipo:pestana» -> página (se crean la primera vez que se abren)
  local actual -- la página que se ve
  local pestanaSubasta = "detalles"

  local function llamar(fn, ...)
    if fn then
      proteger(fn)(...)
    end
  end

  -- ¿Está encendido el campo? Sigue la cadena de interruptores (un campo apagado apaga a los que dependen de él).
  local function activo(def)
    local vueltas = 0
    while def and def.depende and vueltas < 10 do
      if O().valor(ed.tipo, ed.nombre, def.depende) ~= true then
        return false
      end
      def = O().campo(ed.tipo, def.depende)
      vueltas = vueltas + 1
    end
    return true
  end

  local refrescarTodo -- (más abajo)

  local function poner(b, valor)
    if O().poner(ed.tipo, ed.nombre, b.clave, valor) then
      refrescarTodo()
    end
  end

  ---------------------------------------------------------------------------------------------------
  -- Cabecera
  ---------------------------------------------------------------------------------------------------

  local icono = ed:CreateTexture(nil, "OVERLAY")
  icono:SetSize(LADO_ICONO, LADO_ICONO)
  icono:SetPoint("LEFT", ed, "TOPLEFT", 0, -CENTRO_CABECERA)
  Tema.icono(icono, "intercambio") -- Task 32: ⇄, como op-01
  pintar(icono, "texto")
  ed.icono = icono

  -- Un enlace amarillo con su icono delante (la zona que se pulsa incluye el icono).
  local function enlaceConIcono(clave, nombreIcono, alPulsar)
    local e = Piezas.enlace(ed, L.t(clave), alPulsar)
    local ic = e:CreateTexture(nil, "OVERLAY")
    ic:SetSize(12, 12)
    ic:SetPoint("RIGHT", e, "LEFT", -4, 0)
    Tema.icono(ic, nombreIcono)
    pintar(ic, "enlace")
    e.icono = ic
    if e.SetHitRectInsets then
      e:SetHitRectInsets(-16, 0, 0, 0)
    end
    e.claveTexto = clave
    return e
  end

  -- El cuadro que pregunta antes de restablecer (Editor.cuadroConfirmar). Recuerda la operación por la que se preguntó:
  -- [Restablecer] restablece esa.
  local confirmar

  local function cerrarConfirmar()
    if confirmar then
      confirmar:cerrar()
    end
  end

  local function restablecer()
    if not (ed.tipo and O().existe(ed.tipo, ed.nombre)) then
      return
    end
    if not confirmar then
      confirmar = Editor.cuadroConfirmar(NOMBRE_CONFIRMAR)
      confirmar.botonRestablecer = confirmar.botonAceptar
      confirmar.alOcultar = function(c)
        c.tipo, c.nombre = nil, nil
      end
    end
    local tipo, nombreOp = ed.tipo, ed.nombre
    confirmar:preguntar(L.t("PRINCIPAL_EDITOR_RESTABLECER_PREGUNTA", seguro(nombreOp)), L.t("PRINCIPAL_EDITOR_RESTABLECER"),
      function()
        if O().restablecer(tipo, nombreOp) and ed.tipo == tipo and ed.nombre == nombreOp then
          refrescarTodo()
        end
      end)
    confirmar.tipo, confirmar.nombre = tipo, nombreOp
  end

  ed.enlaceRestablecer = enlaceConIcono("PRINCIPAL_EDITOR_RESTABLECER", "restablecer", restablecer)
  ed.enlaceRestablecer:SetPoint("RIGHT", ed, "TOPRIGHT", -13, -CENTRO_CABECERA)
  ed.enlaceRestablecer:SetScript("OnEnter", proteger(function(self)
    verAyuda(self, L.t("PRINCIPAL_EDITOR_RESTABLECER"), L.t("PRINCIPAL_EDITOR_RESTABLECER_AYUDA"))
  end))
  ed.enlaceRestablecer:SetScript("OnLeave", proteger(function(self)
    esconderAyuda(self)
  end))

  local nombre = Tema.letra(ed:CreateFontString(nil, "OVERLAY"), "titulo")
  colorTexto(nombre, "texto")
  nombre:SetPoint("LEFT", icono, "RIGHT", 6, 0)
  nombre:SetJustifyH("LEFT")
  nombre:SetWordWrap(false)
  ed.textoNombre = nombre

  local campoNombre
  local function cerrarRenombrar()
    if campoNombre:IsShown() then
      campoNombre:Hide()
      campoNombre:ponerError(nil)
    end
    nombre:Show()
  end

  local function validarNombre(texto)
    local t = recortar(texto)
    if t == "" then
      return false, L.t("PRINCIPAL_EDITOR_NOMBRE_VACIO")
    end
    if SNF.Arbol and SNF.Arbol.pareceComando(t) then
      return false, L.t("PRINCIPAL_EDITOR_NOMBRE_COMANDO")
    end
    if string.len(t) > MAX_NOMBRE then
      return false, L.t("PRINCIPAL_EDITOR_NOMBRE_LARGO")
    end
    if t ~= ed.nombre and O().existe(ed.tipo, t) then
      return false, L.t("PRINCIPAL_EDITOR_NOMBRE_REPETIDO")
    end
    return true
  end

  local function renombrar(texto)
    local nuevo = O().renombrar(ed.tipo, ed.nombre, recortar(texto))
    if nuevo and nuevo ~= ed.nombre then
      ed.nombre = nuevo
      nombre:SetText(seguro(nuevo))
      cerrarRenombrar()
      llamar(opciones.alRenombrar, ed.tipo, nuevo)
    end
  end

  campoNombre = Piezas.campo(ed, {
    ancho = ANCHO_NOMBRE, get = function() return ed.nombre end, set = renombrar, validar = validarNombre,
  })
  campoNombre:SetPoint("LEFT", icono, "RIGHT", 2, 0)
  local perderFoco = campoNombre:GetScript("OnEditFocusLost")
  campoNombre:SetScript("OnEditFocusLost", proteger(function(self, ...)
    if perderFoco then
      perderFoco(self, ...)
    end
    cerrarRenombrar()
  end))
  Piezas.interno.sinTecladoEnCombate(campoNombre)
  campoNombre:Hide()
  ed.campoNombre = campoNombre

  ed.enlaceRenombrar = enlaceConIcono("PRINCIPAL_EDITOR_RENOMBRAR", "lapiz", function()
    if not ed.nombre then
      return
    end
    nombre:Hide()
    campoNombre:Show()
    campoNombre:refrescar()
    campoNombre:SetFocus()
    if campoNombre.HighlightText then
      campoNombre:HighlightText()
    end
  end)
  ed.enlaceRenombrar:SetPoint("RIGHT", ed.enlaceRestablecer.icono, "LEFT", -HUECO_LINKS, 0)
  nombre:SetPoint("RIGHT", ed.enlaceRenombrar.icono, "LEFT", -12, 0)

  ---------------------------------------------------------------------------------------------------
  -- Pestañas de Subasta
  ---------------------------------------------------------------------------------------------------

  local mostrarPagina -- (más abajo)
  local nombresPestanas = {}
  for i, p in ipairs(PESTANAS_SUBASTA) do
    nombresPestanas[i] = L.t(TEXTO_PESTANA[p])
  end
  ed.pestanas = Piezas.pestanas(ed, {nombres = nombresPestanas, alElegir = function(i)
    pestanaSubasta = PESTANAS_SUBASTA[i]
    mostrarPagina()
  end})
  ed.pestanas:SetPoint("TOPLEFT", ed, "TOPLEFT", 0, -ARRIBA_PESTANAS)
  ed.pestanas:SetPoint("TOPRIGHT", ed, "TOPRIGHT", 0, -ARRIBA_PESTANAS)
  ed.pestanas:Hide()

  ---------------------------------------------------------------------------------------------------
  -- 🔗: un solo desplegable para todos los campos, sin caja a la vista, pegado al 🔗 que se pulsa
  ---------------------------------------------------------------------------------------------------

  local vinculo
  -- Task 33: con título arriba y borde dorado, como el «Link to Another Operation» de TSM.
  vinculo = Piezas.desplegable(ed, {
    ancho = ANCHO_VINCULO, opciones = {}, titulo = L.t("PRINCIPAL_EDITOR_VINCULO_TITULO"), colorBorde = "acento",
    get = function()
      local b = vinculo and vinculo.bloque -- al crearse, la pieza ya pregunta y vinculo aún no existe
      return b and O().vinculo(ed.tipo, ed.nombre, b.clave) or ""
    end,
    set = function(valor)
      local b = vinculo.bloque
      if not b then
        return
      end
      if valor == "" then
        O().vincular(ed.tipo, ed.nombre, b.clave, nil)
      else
        local ok, motivo = O().vincular(ed.tipo, ed.nombre, b.clave, valor)
        if not ok and motivo == "ciclo" then
          print(L.t("PRINCIPAL_EDITOR_VINCULO_CICLO", valor, ed.nombre))
        end
      end
      refrescarTodo()
    end,
  })
  vinculo:SetAlpha(0)
  vinculo:EnableMouse(false)
  ed.vinculo = vinculo

  local function abrirVinculo(b)
    local lista = {{"", L.t("PRINCIPAL_EDITOR_SIN_VINCULO")}}
    for _, n in ipairs(O().lista(ed.tipo)) do
      if n ~= ed.nombre then
        lista[#lista + 1] = {n, seguro(n)}
      end
    end
    vinculo.snfOpciones.opciones = lista
    vinculo.snfOpciones.titulo = L.t("PRINCIPAL_EDITOR_VINCULO_TITULO") -- en el idioma de ahora
    vinculo.bloque = b
    vinculo:ClearAllPoints()
    vinculo:SetPoint("BOTTOMLEFT", b.etiqueta.botonVinculo, "BOTTOMLEFT", 0, 0)
    vinculo:abrir()
  end

  local function pintarVinculo(b)
    if b.etiqueta.iconoVinculo then
      pintar(b.etiqueta.iconoVinculo, b.vinculada and "acento" or "apagado")
    end
  end

  ---------------------------------------------------------------------------------------------------
  -- Bloques
  ---------------------------------------------------------------------------------------------------

  -- Lo que enseña la caja; un número con unidad, con ella detrás («100%», Task 35).
  local function valorTexto(b)
    local v = O().valor(ed.tipo, ed.nombre, b.clave)
    if v == nil then
      return ""
    end
    if b.clase == "numero" and b.def.unidad then
      return tostring(v) .. b.def.unidad
    end
    return tostring(v)
  end

  local function validarFormula(def, texto)
    local t = recortar(texto)
    if t == "" then
      if def.vacio then
        return true
      end
      return false, SNF.Formulas.mensaje({c = "vacia"})
    end
    local f, e = SNF.Formulas.compilar(t)
    if f then
      return true
    end
    return false, SNF.Formulas.mensaje(e)
  end

  local function editarFormula(b)
    local tipo, nombreOp, def = ed.tipo, ed.nombre, b.def
    llamar(Editor.alEditarFormula, {
      tipo = tipo, nombre = nombreOp, clave = b.clave, texto = O().valor(tipo, nombreOp, b.clave), campo = b.control,
      guardar = function(texto)
        if type(texto) ~= "string" or not validarFormula(def, texto) then
          return false
        end
        if not O().poner(tipo, nombreOp, def.clave, texto) then
          return false
        end
        if ed.tipo == tipo and ed.nombre == nombreOp then
          refrescarTodo()
        end
        return true
      end,
    })
  end

  local function opcionesDe(def)
    local lista = {}
    for _, o in ipairs(def.opciones or {}) do
      lista[#lista + 1] = {o.clave, L.t(claveOpcion(def.clave, o.clave))}
    end
    return lista
  end

  local function opcionesComunes(def)
    local propios = O().propios()[GUARDADO_COMUN[def.clave]] or {}
    local lista = {}
    for _, v in ipairs(propios) do
      lista[#lista + 1] = {v, def.clave == "ignorarReinos" and textoCasa(v) or seguro(v)}
    end
    return lista
  end

  -- Task 34: la explicación del bloque, para Piezas.ayuda y la opción `ayuda` de las piezas: el nombre del campo y su
  -- explicación; en un número, su rango en otra línea; vinculado, de qué operación toma el valor.
  local function ayudaDe(b)
    return function()
      local lineas = {L.t(b.claveTexto .. "_A")}
      local def = b.def -- nil en el bloque de «Aplicar operación a grupo»
      if b.clase == "numero" and def.min and def.max then
        lineas[#lineas + 1] = textoRango(def)
      end
      local otra = def and not def.comun and ed.tipo and O().vinculo(ed.tipo, ed.nombre, b.clave)
      if otra then
        lineas[#lineas + 1] = L.t("PRINCIPAL_EDITOR_VINCULADO", seguro(otra))
      end
      return L.t(b.claveTexto), lineas
    end
  end

  -- Las opciones de una pieza con la ayuda del bloque, que sale a la derecha de su fila (b.fila).
  local function conAyuda(b, o)
    o.ayuda = ayudaDe(b)
    o.anclaAyuda = b.fila
    return o
  end

  local function crearControl(pag, b)
    local def, padre = b.def, pag.contenido
    local clase = b.clase
    if clase == "formula" then
      return Piezas.campo(padre, conAyuda(b, {
        copiar = function() editarFormula(b) end,
        get = function() return valorTexto(b) end,
        set = function(t) poner(b, recortar(t)) end,
        validar = function(t)
          if b.vinculada then
            return true -- enseña el valor de otra operación: se valida allí
          end
          return validarFormula(def, t)
        end,
      }))
    elseif clase == "numero" then
      b.ayuda = Tema.letra(padre:CreateFontString(nil, "OVERLAY"), "texto", LETRA_AYUDA)
      colorTexto(b.ayuda, "apagado")
      b.ayuda:SetJustifyH("LEFT")
      return Piezas.campo(padre, conAyuda(b, {
        get = function() return valorTexto(b) end,
        set = function(t) poner(b, leerNumero(def, t)) end,
        validar = function(t)
          local n = leerNumero(def, t)
          if b.vinculada or (n and not (def.min and n < def.min) and not (def.max and n > def.max)) then
            return true
          end
          return false, L.t("PRINCIPAL_EDITOR_NUMERO_MAL", def.min or 0, def.max or 0)
        end,
      }))
    elseif clase == "texto" then
      return Piezas.campo(padre, conAyuda(b, {get = function() return valorTexto(b) end, set = function(t) poner(b, recortar(t)) end}))
    elseif clase == "sino" then
      return Piezas.radio(padre, function()
        return O().valor(ed.tipo, ed.nombre, b.clave) == true
      end, function(v)
        poner(b, v == true)
      end, conAyuda(b, {si = L.t("PRINCIPAL_EDITOR_SI"), no = L.t("PRINCIPAL_EDITOR_NO")}))
    elseif clase == "lista" then
      return Piezas.desplegable(padre, conAyuda(b, {
        opciones = opcionesDe(def),
        get = function() return O().valor(ed.tipo, ed.nombre, b.clave) end,
        set = function(v) poner(b, v) end,
      }))
    elseif clase == "varios" then
      local d
      d = Piezas.desplegable(padre, conAyuda(b, {
        varios = true, contar = contar,
        opciones = def.comun and opcionesComunes(def) or opcionesDe(def),
        cabecera = L.t(claveVacia(def)),
        get = function() return conjunto(O().valor(ed.tipo, ed.nombre, b.clave)) end,
        set = function(v, marcado)
          local elegidos = conjunto(O().valor(ed.tipo, ed.nombre, b.clave))
          elegidos[v] = marcado and true or nil
          local lista = {}
          for _, o in ipairs(d.snfOpciones.opciones) do
            if elegidos[o[1]] then
              lista[#lista + 1] = o[1]
            end
          end
          poner(b, lista)
        end,
      }))
      return d
    end
  end

  local function nuevaParteSeccion(pag, claveTitulo, claveAyuda)
    local marco = Piezas.titulo(pag.contenido, L.t(claveTitulo), L.t(claveAyuda))
    local s = {seccion = true, marco = marco, claveTitulo = claveTitulo, claveAyuda = claveAyuda}
    pag.partes[#pag.partes + 1] = s
    pag.secciones[#pag.secciones + 1] = marco
  end

  local function apuntarBloque(pag, b)
    pag.bloques[b.clave] = b
    pag.orden[#pag.orden + 1] = b.clave
    pag.partes[#pag.partes + 1] = {bloque = b}
  end

  -- La etiqueta conserva su tooltip: el mismo que el de la caja y en el mismo sitio (Task 34).
  local function ayudaDeEtiqueta(b)
    local e = b.etiqueta
    e:EnableMouse(true)
    Piezas.ayuda(e, ayudaDe(b), {ancla = b.fila})
  end

  -- La fila del bloque (Task 34): un marco sin dibujo ni ratón a la altura de la caja, de la izquierda del contenido a su
  -- borde derecho (con la ayuda «Un valor de 0 a 100» dentro). El tooltip de la explicación sale a su derecha, como en TSM.
  local function nuevaFila(pag)
    local f = CreateFrame("Frame", nil, pag.contenido)
    f:SetHeight(ALTO_CONTROL)
    return f
  end

  local function nuevoBloque(pag, def)
    local b = {clave = def.clave, clase = def.tipo, def = def, vinculada = false}
    b.claveTexto = def.comun and TEXTO_COMUN[def.clave] or claveCampo(pag.tipo, def.clave)
    b.fila = nuevaFila(pag)
    b.etiqueta = Piezas.etiqueta(pag.contenido, L.t(b.claveTexto), not def.comun and {vinculo = function() abrirVinculo(b) end} or nil)
    ayudaDeEtiqueta(b)
    local bv = b.etiqueta.botonVinculo
    if bv then
      bv:SetScript("OnEnter", proteger(function(self)
        pintar(self.icono, "texto")
        local otra = O().vinculo(ed.tipo, ed.nombre, b.clave)
        verAyuda(self, nil, otra and L.t("PRINCIPAL_EDITOR_VINCULADO", seguro(otra)) or L.t("PRINCIPAL_EDITOR_VINCULO_AYUDA"))
      end))
      bv:SetScript("OnLeave", proteger(function(self)
        pintarVinculo(b)
        esconderAyuda(self)
      end))
    end
    b.control = crearControl(pag, b)
    if b.ayuda then
      b.ayuda:SetPoint("LEFT", b.control, "RIGHT", 10, 0)
      if def.min and def.max then
        b.ayuda:SetText(textoRango(def))
      end
    end
    apuntarBloque(pag, b)
  end

  ---------------------------------------------------------------------------------------------------
  -- Administrar grupo
  ---------------------------------------------------------------------------------------------------

  local function aplicarGrupo(ruta)
    local tipo, nombreOp = ed.tipo, ed.nombre
    local lista = {}
    if not O().TIPOS[tipo].una then
      for _, n in ipairs((O().deGrupo(ruta, tipo))) do
        if n ~= nombreOp then
          lista[#lista + 1] = n
        end
      end
    end
    lista[#lista + 1] = nombreOp
    if O().ponerDeGrupo(ruta, tipo, lista) then
      llamar(opciones.alCambiar)
    end
    refrescarTodo()
  end

  local function quitarGrupo(ruta)
    local tipo, nombreOp = ed.tipo, ed.nombre
    local lista = {}
    for _, n in ipairs((O().deGrupo(ruta, tipo))) do
      if n ~= nombreOp then
        lista[#lista + 1] = n
      end
    end
    if O().ponerDeGrupo(ruta, tipo, lista) then
      llamar(opciones.alCambiar)
    end
    refrescarTodo()
  end

  local function nuevoBloqueGrupos(pag)
    local b = {clave = "grupos", clase = "grupos", claveTexto = "PRINCIPAL_EDITOR_APLICAR", vinculada = false}
    b.fila = nuevaFila(pag)
    b.etiqueta = Piezas.etiqueta(pag.contenido, L.t(b.claveTexto))
    ayudaDeEtiqueta(b)
    b.control = Piezas.desplegable(pag.contenido, conAyuda(b, {
      plano = true, opciones = {}, cabecera = L.t("PRINCIPAL_EDITOR_AGREGAR"),
      get = function() return nil end,
      set = function(ruta) aplicarGrupo(ruta) end,
    }))
    apuntarBloque(pag, b)
  end

  local function nuevaFilaGrupo(pag, k)
    local f = CreateFrame("Frame", nil, pag.contenido)
    f:SetHeight(ALTO_FILA_GRUPO)
    f.texto = Tema.letra(f:CreateFontString(nil, "OVERLAY"), "texto")
    f.texto:SetPoint("LEFT", f, "LEFT", 0, 0)
    f.texto:SetWordWrap(false)
    -- Task 35: detrás del nombre, el icono de enlace en gris (op-01); el color del nombre lo pone refrescarGrupos.
    f.icono = f:CreateTexture(nil, "OVERLAY")
    f.icono:SetSize(12, 12)
    Tema.icono(f.icono, "vinculo")
    pintar(f.icono, "apagado")
    f.icono:SetPoint("LEFT", f.texto, "RIGHT", 6, 0)
    f.botonQuitar = Piezas.botonIcono(f, "cerrar", function()
      if f.ruta then
        quitarGrupo(f.ruta)
      end
    end, {tamano = 12, color = "texto"})
    f.botonQuitar:SetPoint("LEFT", f.icono, "RIGHT", 6, 0)
    local entrar, salir = f.botonQuitar:GetScript("OnEnter"), f.botonQuitar:GetScript("OnLeave")
    f.botonQuitar:SetScript("OnEnter", proteger(function(self, ...)
      entrar(self, ...)
      verAyuda(self, nil, L.t("PRINCIPAL_EDITOR_QUITAR_GRUPO"))
    end))
    f.botonQuitar:SetScript("OnLeave", proteger(function(self, ...)
      salir(self, ...)
      esconderAyuda(self)
    end))
    pag.filasGrupo[k] = f
    return f
  end

  local function refrescarGrupos(pag, b)
    local aplicados = O().gruposDe(ed.tipo, ed.nombre)
    local ya = conjunto(aplicados)
    local lista = {}
    if not ya[""] then
      lista[1] = {"", textoRuta("")}
    end
    for _, ruta in ipairs(SNF.Arbol and SNF.Arbol.ordenadas() or {}) do
      if not ya[ruta] then
        lista[#lista + 1] = {ruta, textoRuta(ruta)}
      end
    end
    b.control.snfOpciones.opciones = lista
    b.control.snfOpciones.cabecera = L.t("PRINCIPAL_EDITOR_AGREGAR")
    b.control:refrescar()
    local grupos = #aplicados > 0 and SNF.Arbol and SNF.Arbol.grupos() or nil
    for k, ruta in ipairs(aplicados) do
      local f = pag.filasGrupo[k] or nuevaFilaGrupo(pag, k)
      f.ruta = ruta
      f.texto:SetText(textoRuta(ruta))
      colorTexto(f.texto, colorRuta(ruta, grupos))
      f:SetWidth(math.ceil(f.texto:GetStringWidth()) + 6 + 12 + 6 + 12)
      f:Show()
    end
    for k = #aplicados + 1, #pag.filasGrupo do
      pag.filasGrupo[k].ruta = nil
      pag.filasGrupo[k]:Hide()
    end
  end

  ---------------------------------------------------------------------------------------------------
  -- Páginas
  ---------------------------------------------------------------------------------------------------

  -- Coloca secciones, bloques y filas de grupo de arriba abajo y da el alto del contenido.
  local function disponer(pag)
    local ancho = pag.zona:GetWidth() or 0
    if ancho > 0 and pag.contenido:GetWidth() ~= ancho then
      pag.contenido:SetWidth(ancho)
    end
    local contenido = pag.contenido
    local y = 0
    local fondo -- lo que baja el borde de abajo del último control colocado (el de un sí/no queda más arriba)
    for i, parte in ipairs(pag.partes) do
      if parte.seccion then
        if i > 1 then
          -- Task 35: 26 px del borde de abajo del último control al título (op-01).
          y = fondo and (fondo + AIRE_BLOQUE + HUECO_SECCION) or (y + HUECO_SECCION)
        end
        local m = parte.marco
        m:ClearAllPoints()
        m:SetPoint("TOPLEFT", contenido, "TOPLEFT", 0, -y)
        m:ponerAncho(math.max(1, ancho - DERECHA))
        y = y + m:GetHeight() + HUECO_TITULO
      else
        local b = parte.bloque
        b.y = y
        b.etiqueta:ClearAllPoints()
        b.etiqueta:SetPoint("TOPLEFT", contenido, "TOPLEFT", 0, -y)
        local c = b.control
        c:ClearAllPoints()
        -- La fila, con su borde de arriba a la altura de la caja (en un sí/no, la de los círculos, centrados en los 22 px).
        local arribaCaja = y + BAJO_ETIQUETA
        if b.clase == "sino" then
          arribaCaja = arribaCaja + (ALTO_CONTROL - (c:GetHeight() or ALTO_CONTROL)) / 2
        end
        b.fila:ClearAllPoints()
        b.fila:SetPoint("TOPLEFT", contenido, "TOPLEFT", 0, -arribaCaja)
        b.fila:SetPoint("TOPRIGHT", contenido, "TOPRIGHT", 0, -arribaCaja)
        if b.clase == "sino" then
          c:SetPoint("LEFT", contenido, "TOPLEFT", 0, -(y + BAJO_ETIQUETA + ALTO_CONTROL / 2))
          fondo = y + BAJO_ETIQUETA + (ALTO_CONTROL + (c:GetHeight() or ALTO_CONTROL)) / 2
        else
          c:SetPoint("TOPLEFT", contenido, "TOPLEFT", 0, -(y + BAJO_ETIQUETA))
          c:SetPoint("TOPRIGHT", contenido, "TOPRIGHT", -(DERECHA + (b.ayuda and ANCHO_AYUDA or 0)), -(y + BAJO_ETIQUETA))
          c:SetHeight(ALTO_CONTROL)
          fondo = y + BAJO_ETIQUETA + ALTO_CONTROL
        end
        y = y + BLOQUE
        if b.clase == "grupos" then
          local centro = b.y + BAJO_ETIQUETA + ALTO_CONTROL / 2
          local n = 0
          for _, f in ipairs(pag.filasGrupo) do
            if f:IsShown() then
              n = n + 1
              f:ClearAllPoints()
              f:SetPoint("LEFT", contenido, "TOPLEFT", 0, -(centro + FILA_GRUPO * n))
            end
          end
          if n > 0 then
            y = centro + FILA_GRUPO * n + ALTO_FILA_GRUPO
            fondo = centro + FILA_GRUPO * n + ALTO_FILA_GRUPO / 2
          end
        end
      end
    end
    pag.zona:ponerAlto(y + ABAJO_CONTENIDO)
  end

  local function crearPagina(tipo, pestana)
    local zona, contenido = Piezas.desplazable(ed)
    zona:SetPoint("TOPLEFT", ed, "TOPLEFT", 0, -(pestana and ARRIBA_ZONA_PESTANAS or ARRIBA_ZONA))
    zona:SetPoint("BOTTOMRIGHT", ed, "BOTTOMRIGHT", 0, ABAJO)
    local pag = {
      tipo = tipo, pestana = pestana, zona = zona, contenido = contenido, bloques = {}, orden = {}, secciones = {},
      partes = {}, filasGrupo = {},
    }
    for _, s in ipairs(seccionesDe(tipo)) do
      if s.pestana == pestana then
        nuevaParteSeccion(pag, claveSeccion(tipo, s.n), claveSeccion(tipo, s.n) .. "_A")
        for _, def in ipairs(s.campos) do
          nuevoBloque(pag, def)
        end
      end
    end
    if pestana == nil or pestana == PESTANAS_SUBASTA[1] then
      nuevaParteSeccion(pag, "PRINCIPAL_EDITOR_MANEJO", "PRINCIPAL_EDITOR_MANEJO_A")
      for _, def in ipairs(O().COMUNES) do
        nuevoBloque(pag, def)
      end
      nuevaParteSeccion(pag, "PRINCIPAL_EDITOR_GRUPOS", "PRINCIPAL_EDITOR_GRUPOS_A")
      nuevoBloqueGrupos(pag)
    end
    local previo = zona:GetScript("OnSizeChanged")
    zona:SetScript("OnSizeChanged", proteger(function(self, ...)
      if previo then
        previo(self, ...)
      end
      disponer(pag)
    end))
    zona:Hide()
    return pag
  end

  local function refrescarBloque(pag, b)
    if b.clase == "grupos" then
      refrescarGrupos(pag, b)
      return
    end
    local def, c = b.def, b.control
    b.vinculada = not def.comun and O().vinculo(ed.tipo, ed.nombre, b.clave) ~= nil
    pintarVinculo(b)
    local encendido = activo(def)
    colorTexto(b.etiqueta.texto, encendido and "textoPestana" or "apagado")
    local apagado = not encendido or b.vinculada
    if def.comun then
      c.snfOpciones.opciones = opcionesComunes(def)
    end
    if b.clase == "formula" or b.clase == "numero" or b.clase == "texto" then
      c:ponerApagado(apagado)
      if not c:HasFocus() then
        c:refrescar()
      end
    else
      c:refrescar()
      c:ponerApagado(apagado)
    end
  end

  refrescarTodo = function()
    local pag = actual
    if not pag or not ed.tipo or not O().existe(ed.tipo, ed.nombre) then
      return
    end
    for _, clave in ipairs(pag.orden) do
      refrescarBloque(pag, pag.bloques[clave])
    end
    disponer(pag)
  end

  mostrarPagina = function()
    local pestana = ed.tipo == "subasta" and pestanaSubasta or nil
    local clave = ed.tipo .. ":" .. (pestana or "")
    local pag = paginas[clave]
    if not pag then
      pag = crearPagina(ed.tipo, pestana)
      paginas[clave] = pag
    end
    for _, otra in pairs(paginas) do
      if otra ~= pag then
        otra.zona:Hide()
      end
    end
    actual = pag
    pag.zona:Show()
    if pestana then
      for i, p in ipairs(PESTANAS_SUBASTA) do
        if p == pestana then
          ed.pestanas:elegir(i)
        end
      end
    end
    refrescarTodo()
  end

  ---------------------------------------------------------------------------------------------------
  -- Métodos
  ---------------------------------------------------------------------------------------------------

  function ed:abrir(tipo, nombreOp)
    if not (O().TIPOS[tipo] and O().existe(tipo, nombreOp)) then
      return
    end
    vinculo:cerrar()
    if confirmar and (confirmar.tipo ~= tipo or confirmar.nombre ~= nombreOp) then
      cerrarConfirmar()
    end
    self.tipo, self.nombre = tipo, nombreOp
    cerrarRenombrar()
    nombre:SetText(seguro(nombreOp))
    if tipo == "subasta" then
      self.pestanas:Show()
    else
      self.pestanas:Hide()
    end
    mostrarPagina()
  end

  function ed:refrescar()
    refrescarTodo()
  end

  function ed:pagina()
    return actual
  end

  function ed:bloque(clave)
    return actual and actual.bloques[clave]
  end

  function ed:repintarTextos()
    self.vinculo.snfOpciones.titulo = L.t("PRINCIPAL_EDITOR_VINCULO_TITULO")
    self.enlaceRenombrar:ponerTexto(L.t("PRINCIPAL_EDITOR_RENOMBRAR"))
    self.enlaceRestablecer:ponerTexto(L.t("PRINCIPAL_EDITOR_RESTABLECER"))
    for i, p in ipairs(PESTANAS_SUBASTA) do
      self.pestanas.pestanas[i].texto:SetText(L.t(TEXTO_PESTANA[p]))
    end
    for _, pag in pairs(paginas) do
      for _, parte in ipairs(pag.partes) do
        if parte.seccion then
          parte.marco.titulo:SetText(L.t(parte.claveTitulo))
          parte.marco.descripcion:SetText(L.t(parte.claveAyuda))
        else
          local b = parte.bloque
          b.etiqueta:ponerTexto(L.t(b.claveTexto))
          local c, def = b.control, b.def
          if b.clase == "sino" then
            c:ponerTextos(L.t("PRINCIPAL_EDITOR_SI"), L.t("PRINCIPAL_EDITOR_NO"))
          elseif b.clase == "lista" then
            c.snfOpciones.opciones = opcionesDe(def)
          elseif b.clase == "varios" then
            if not def.comun then
              c.snfOpciones.opciones = opcionesDe(def)
            end
            c.snfOpciones.cabecera = L.t(claveVacia(def))
          end
          if b.ayuda and def.min and def.max then
            b.ayuda:SetText(textoRango(def))
          end
        end
      end
    end
    -- Las demás páginas leen sus valores (y se recolocan) al enseñarse.
    refrescarTodo()
  end

  -- Al esconderse (otra pestaña de la ventana, o el resumen) se deja de renombrar y se cierra la lista del 🔗.
  ed:SetScript("OnHide", proteger(function()
    cerrarConfirmar()
    vinculo:cerrar()
    if campoNombre:IsShown() then
      campoNombre:ClearFocus()
      cerrarRenombrar()
    end
  end))

  return ed
end
