-- SnetForever: el editor de fórmulas ⧉ (Task 23). Es una ventanita propia, encima de la ventana principal de comercio, para
-- escribir una fórmula con sitio y ver lo que da antes de guardarla. La abren el ⧉ de los campos de fórmula del editor de
-- operaciones (este archivo pone SNF.EditorOperacion.alEditarFormula) y Ajustes › Fuentes propias (para crear o cambiar una
-- fuente propia; ahí lleva además el campo del nombre).
--
-- De arriba abajo: el título (el nombre del campo, o «Fuente propia»); en las fuentes propias, «Nombre» y su campo; «Fórmula» y
-- un campo de varias líneas; «Objeto de ejemplo» con un desplegable y, a su derecha, «Valor de ejemplo» con lo que da la fórmula
-- para ese objeto; debajo, en rojo, el error de la fórmula (Formulas.mensaje, en el idioma del cliente); abajo a la derecha,
-- Guardar y Cancelar.
--   - El valor se calcula cada vez que cambia el texto o el objeto (nunca en OnUpdate). Si es un precio va con Tema.dinero,
--     redondeado con Formulas.cobre (nunca hacia arriba); si es una cantidad, como número con dos decimales como mucho. Sin
--     valor para ese objeto (la app no tiene su precio, por ejemplo) dice «sin valor», que no es un error.
--   - Un campo de operación es una cantidad (no un precio) si su valor por defecto es un número sin unidad («0», «10»,
--     «40000»): así son los de cantidades de Operaciones.TIPOS; los precios llevan unidad o fuente («0c», «1g», «snfmercado»).
--   - El objeto de ejemplo: en una operación, los objetos de los grupos que la tienen en su lista propia
--     (Operaciones.gruposDe) y, al final, el último objeto mirado en el tooltip (TooltipComercio.ultimoMirado); por defecto el
--     primero. En una fuente propia, primero el último mirado y luego los objetos de los grupos. Como mucho 30.
--   - Guardar: los saltos de línea pasan a espacios (la fórmula se guarda en una línea). En una operación, la fórmula se
--     valida igual que en su campo y, si no vale, no se guarda y sale el motivo; el guardado lo hace el gancho de la operación
--     (datos.guardar), que vuelve a validarla. En una fuente propia, quien abre el editor guarda (Formulas.ponerFuente) y el
--     motivo de no guardar sale igual. Bien guardado, se cierra. Cancelar, Escape o cerrarse la ventana principal no tocan nada.
--   - Escape: la ventanita tiene teclado propio y se queda la tecla (sin esas funciones, entra en UISpecialFrames). Con el
--     cursor en un campo, Escape solo saca el cursor del campo.
--   - En combate los campos no se quedan con el teclado (Piezas.interno.sinTecladoEnCombate).
-- Nada parpadea, gira ni cambia de color solo; no hay OnUpdate.
--
-- SNF.EditorFormula:
--   .abrir(datos)   datos = {titulo?, texto, guardar = fn(texto, nombre?) -> true | false, error?, precio = bool (true por
--                   defecto), rutas = {rutas de grupo} | nil, conNombre = bool, nombre?}. Con conNombre sale el campo del
--                   nombre y guardar recibe también lo escrito ahí; `error` es un error de Formulas (sale con Formulas.mensaje).
--   .cerrar()       la cierra sin guardar.
--   .marco()        el marco SnetForeverEditorFormula (lo crea escondido la primera vez).
--   .estaAbierto() -> boolean     .objetoDeEjemplo() -> id | nil
--   .clavesDeTexto() -> {claves}  las claves de texto que usa (para comprobar que están en es y en).
-- El marco es SnetForeverEditorFormula: .titulo, .etiquetaNombre, .campoNombre, .etiquetaFormula, .caja (el fondo del campo),
-- .campo (el EditBox de varias líneas), .etiquetaObjeto, .objeto (el desplegable), .etiquetaValor, .valor, .error,
-- .botonGuardar y .botonCancelar. Se crea la primera vez que se abre.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local EditorFormula = {}
SNF.EditorFormula = EditorFormula

local proteger = Piezas.proteger
local colorTexto = Piezas.interno.colorTexto
local sinTecladoEnCombate = Piezas.interno.sinTecladoEnCombate

local NOMBRE = "SnetForeverEditorFormula"
local ANCHO = 560
local MARGEN = 12
local ALTO_CAMPO = 22
local ALTO_FORMULA = 72
local ANCHO_OBJETO = 260
local ANCHO_BOTON = 110
local MAX_OBJETOS = 30
local MAX_LETRAS = 1000

local CLAVES = {
  "PRINCIPAL_FORMULA_TITULO", "PRINCIPAL_FORMULA_NOMBRE", "PRINCIPAL_FORMULA_FORMULA", "PRINCIPAL_FORMULA_OBJETO",
  "PRINCIPAL_FORMULA_OBJETO_N", "PRINCIPAL_FORMULA_SIN_OBJETO", "PRINCIPAL_FORMULA_VALOR", "PRINCIPAL_FORMULA_SIN_VALOR",
  "PRINCIPAL_FORMULA_NO_GUARDA", "PRINCIPAL_FORMULA_GUARDAR", "PRINCIPAL_GRUPOS_CANCELAR",
}

function EditorFormula.clavesDeTexto()
  local t = {}
  for i, k in ipairs(CLAVES) do
    t[i] = k
  end
  return t
end

local marco -- la ventanita (se crea la primera vez)
local datos -- lo que pidió quien la abrió
local objeto -- el id del objeto de ejemplo
local enganchada = false -- ¿ya se cierra con la ventana principal?
local nombreEscrito = "" -- lo último aplicado en el campo del nombre (Escape vuelve ahí)

-- Una fórmula escrita en varias líneas, en una sola y sin espacios a los lados.
local function limpio(texto)
  local s = string.gsub(tostring(texto or ""), "%s*[\r\n]+%s*", " ")
  return (string.match(s, "^%s*(.-)%s*$"))
end

---------------------------------------------------------------------------------------------------
-- Objetos de ejemplo
---------------------------------------------------------------------------------------------------

local function nombreObjeto(id)
  local info = SNF.API.infoObjeto(id)
  if info then return (string.gsub(info.nombre, "|", "||")) end
  return L.t("PRINCIPAL_FORMULA_OBJETO_N", id)
end

local function ultimoMirado()
  local t = rawget(SNF, "TooltipComercio")
  return t and t.ultimoMirado and t.ultimoMirado() or nil
end

-- Los ids de ejemplo: de los grupos dados (o de todos) y el último mirado (al final en una operación, primero si no).
local function objetosDeEjemplo(rutas)
  local lista, vistos = {}, {}
  local A = SNF.Arbol
  local function anadir(id)
    if type(id) == "number" and not vistos[id] and #lista < MAX_OBJETOS then
      vistos[id] = true
      lista[#lista + 1] = id
    end
  end
  local function deGrupos(lasRutas)
    for _, ruta in ipairs(lasRutas) do
      if #lista >= MAX_OBJETOS then
        return
      end
      for _, clave in ipairs(A.objetos(ruta)) do
        anadir(A.idDe(clave))
      end
    end
  end
  if rutas then
    deGrupos(rutas)
    anadir(ultimoMirado())
  else
    anadir(ultimoMirado())
    local todas = {""}
    for _, ruta in ipairs(A.ordenadas()) do
      todas[#todas + 1] = ruta
    end
    deGrupos(todas)
  end
  return lista
end

---------------------------------------------------------------------------------------------------
-- El valor de ejemplo
---------------------------------------------------------------------------------------------------

local function textoCantidad(v)
  local s
  if v == math.floor(v) then
    s = SNF.Texto.numero(v)
  else
    s = SNF.Texto.numero(v, 2)
    if L.idioma() == "es" then
      s = string.gsub(s, "%.", ",")
    end
  end
  return s
end

-- El error, en rojo. Puede traer un trozo de lo escrito: en el juego «|» empieza un código, así que se dobla.
local function ponerError(texto)
  marco.error:SetText((string.gsub(tostring(texto or ""), "|", "||")))
end

local function calcular()
  if not marco then
    return
  end
  local texto = limpio(marco.campo:GetText())
  local sinValor = L.t("PRINCIPAL_FORMULA_SIN_VALOR")
  if texto == "" then
    ponerError("")
    marco.valor:SetText(sinValor)
    return
  end
  local Formulas = SNF.Formulas
  local f, e = Formulas.compilar(texto)
  if not f then
    ponerError(Formulas.mensaje(e))
    marco.valor:SetText(sinValor)
    return
  end
  ponerError("")
  local v
  if objeto then
    v, e = f(objeto)
  end
  if v == nil then
    if e then
      ponerError(Formulas.mensaje(e))
    end
    marco.valor:SetText(sinValor)
  elseif datos and datos.precio == false then
    marco.valor:SetText(textoCantidad(v))
  else
    marco.valor:SetText(Tema.dinero(Formulas.cobre(v)))
  end
end

---------------------------------------------------------------------------------------------------
-- La ventanita
---------------------------------------------------------------------------------------------------

local function quitarDeEspeciales()
  for k = #UISpecialFrames, 1, -1 do
    if UISpecialFrames[k] == NOMBRE then
      table.remove(UISpecialFrames, k)
    end
  end
end

function EditorFormula.cerrar()
  if marco and marco:IsShown() then
    marco:Hide()
  end
end

local function guardar()
  if not datos then
    return
  end
  local Formulas = SNF.Formulas
  local texto = limpio(marco.campo:GetText())
  if datos.conNombre then
    local ok, e = datos.guardar(texto, marco.campoNombre:GetText())
    if not ok then
      ponerError(e and Formulas.mensaje(e) or L.t("PRINCIPAL_FORMULA_NO_GUARDA"))
      return
    end
  else
    if texto ~= "" then
      local f, e = Formulas.compilar(texto)
      if not f then
        ponerError(Formulas.mensaje(e))
        return
      end
    end
    if not datos.guardar(texto) then
      ponerError(texto == "" and Formulas.mensaje({c = "vacia"}) or L.t("PRINCIPAL_FORMULA_NO_GUARDA"))
      return
    end
  end
  EditorFormula.cerrar()
end

local function etiqueta(padre, clave)
  local fs = Tema.letra(padre:CreateFontString(nil, "OVERLAY"), "etiqueta")
  colorTexto(fs, "textoPestana")
  fs:SetJustifyH("LEFT")
  fs:SetText(L.t(clave))
  fs.claveTexto = clave
  return fs
end

local function crear()
  local v = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(v, NOMBRE, true)
  v:SetWidth(ANCHO)
  v:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  v:SetFrameStrata("DIALOG")
  v:SetToplevel(true)
  v:SetClampedToScreen(true)
  v:EnableMouse(true)
  Tema.panel(v, "fondo", {borde = true})

  local titulo = Tema.letra(v:CreateFontString(nil, "OVERLAY"), "titulo")
  colorTexto(titulo, "texto")
  titulo:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN, -MARGEN)
  titulo:SetPoint("TOPRIGHT", v, "TOPRIGHT", -MARGEN, -MARGEN)
  titulo:SetJustifyH("LEFT")
  titulo:SetWordWrap(false)
  v.titulo = titulo

  -- El nombre (solo en las fuentes propias).
  v.etiquetaNombre = etiqueta(v, "PRINCIPAL_FORMULA_NOMBRE")
  v.campoNombre = Piezas.campo(v, {
    alto = ALTO_CAMPO,
    get = function() return nombreEscrito end,
    set = function(t) nombreEscrito = t end,
  })
  v.campoNombre:SetMaxLetters(60)
  sinTecladoEnCombate(v.campoNombre)

  -- La fórmula, en varias líneas: un EditBox dentro de una caja hundida con borde (pulsar la caja pone el cursor).
  v.etiquetaFormula = etiqueta(v, "PRINCIPAL_FORMULA_FORMULA")
  local caja = CreateFrame("Frame", nil, v)
  caja:SetHeight(ALTO_FORMULA)
  Tema.panel(caja, "hundido", {borde = true})
  caja:EnableMouse(true)
  v.caja = caja
  local campo = CreateFrame("EditBox", nil, caja)
  campo:SetPoint("TOPLEFT", caja, "TOPLEFT", 8, -6)
  campo:SetPoint("BOTTOMRIGHT", caja, "BOTTOMRIGHT", -8, 6)
  campo:SetMultiLine(true)
  campo:SetAutoFocus(false)
  campo:SetMaxLetters(MAX_LETRAS)
  Tema.letra(campo, "texto")
  colorTexto(campo, "texto")
  campo:SetScript("OnEscapePressed", proteger(function(self)
    self:ClearFocus()
  end))
  campo:SetScript("OnTextChanged", proteger(function()
    calcular()
  end))
  sinTecladoEnCombate(campo)
  caja:SetScript("OnMouseDown", proteger(function()
    campo:SetFocus()
  end))
  v.campo = campo

  -- El objeto de ejemplo y su valor.
  v.etiquetaObjeto = etiqueta(v, "PRINCIPAL_FORMULA_OBJETO")
  v.objeto = Piezas.desplegable(v, {
    ancho = ANCHO_OBJETO, opciones = {},
    cabecera = L.t("PRINCIPAL_FORMULA_SIN_OBJETO"),
    get = function() return objeto end,
    set = function(id)
      objeto = id
      calcular()
    end,
  })
  v.etiquetaValor = etiqueta(v, "PRINCIPAL_FORMULA_VALOR")
  local valor = Tema.letra(v:CreateFontString(nil, "OVERLAY"), "texto")
  colorTexto(valor, "texto")
  valor:SetJustifyH("LEFT")
  valor:SetWordWrap(false)
  v.valor = valor

  local err = Tema.letra(v:CreateFontString(nil, "OVERLAY"), "texto")
  colorTexto(err, "error")
  err:SetJustifyH("LEFT")
  err:SetJustifyV("TOP")
  err:SetHeight(30)
  v.error = err

  v.botonGuardar = Piezas.boton(v, L.t("PRINCIPAL_FORMULA_GUARDAR"), guardar, {ancho = ANCHO_BOTON})
  v.botonGuardar:SetPoint("BOTTOMRIGHT", v, "BOTTOMRIGHT", -MARGEN, MARGEN)
  v.botonCancelar = Piezas.boton(v, L.t("PRINCIPAL_GRUPOS_CANCELAR"), EditorFormula.cerrar, {ancho = ANCHO_BOTON, borde = true})
  v.botonCancelar:SetPoint("RIGHT", v.botonGuardar, "LEFT", -8, 0)

  local conTeclado = v.EnableKeyboard ~= nil and v.SetPropagateKeyboardInput ~= nil
  if conTeclado then
    v:SetScript("OnKeyDown", proteger(function(self, tecla)
      -- En combate no se toca la propagación (el cliente la bloquea a un código no seguro): Escape cierra igual.
      local libre = not (InCombatLockdown and InCombatLockdown())
      if tecla == "ESCAPE" then
        if libre then
          self:SetPropagateKeyboardInput(false)
        end
        EditorFormula.cerrar()
      elseif libre then
        self:SetPropagateKeyboardInput(true)
      end
    end))
  end
  v:SetScript("OnShow", proteger(function(self)
    if conTeclado then
      self:EnableKeyboard(true)
    else
      quitarDeEspeciales()
      table.insert(UISpecialFrames, NOMBRE)
    end
  end))
  v:SetScript("OnHide", proteger(function(self)
    self.campo:ClearFocus()
    self.campoNombre:ClearFocus()
    self.objeto:cerrar()
    datos = nil
    if conTeclado then
      self:EnableKeyboard(false)
    end
    quitarDeEspeciales()
  end))
  v:Hide()
  return v
end

-- Coloca las filas de arriba abajo; sin el nombre, todo sube.
local function colocar(conNombre)
  local v = marco
  local y = MARGEN + 28
  local function fila(fs, control, alto)
    fs:ClearAllPoints()
    fs:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN, -y)
    control:ClearAllPoints()
    control:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN, -(y + 18))
    control:SetPoint("TOPRIGHT", v, "TOPRIGHT", -MARGEN, -(y + 18))
    y = y + 18 + alto + 12
  end
  v.etiquetaNombre:SetShown(conNombre)
  v.campoNombre:SetShown(conNombre)
  if conNombre then
    fila(v.etiquetaNombre, v.campoNombre, ALTO_CAMPO)
  end
  fila(v.etiquetaFormula, v.caja, ALTO_FORMULA)
  v.etiquetaObjeto:ClearAllPoints()
  v.etiquetaObjeto:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN, -y)
  v.objeto:ClearAllPoints()
  v.objeto:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN, -(y + 18))
  v.etiquetaValor:ClearAllPoints()
  v.etiquetaValor:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN + ANCHO_OBJETO + 20, -y)
  v.valor:ClearAllPoints()
  v.valor:SetPoint("LEFT", v.objeto, "RIGHT", 20, 0)
  v.valor:SetPoint("RIGHT", v, "RIGHT", -MARGEN, 0)
  y = y + 18 + ALTO_CAMPO + 10
  v.error:ClearAllPoints()
  v.error:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN, -y)
  v.error:SetPoint("TOPRIGHT", v, "TOPRIGHT", -MARGEN, -y)
  v:SetHeight(y + 30 + 8 + ALTO_CAMPO + MARGEN)
end

local function repintarTextos()
  local v = marco
  for _, fs in ipairs({v.etiquetaNombre, v.etiquetaFormula, v.etiquetaObjeto, v.etiquetaValor}) do
    fs:SetText(L.t(fs.claveTexto))
  end
  v.botonGuardar:ponerTexto(L.t("PRINCIPAL_FORMULA_GUARDAR"))
  v.botonCancelar:ponerTexto(L.t("PRINCIPAL_GRUPOS_CANCELAR"))
  v.objeto.snfOpciones.cabecera = L.t("PRINCIPAL_FORMULA_SIN_OBJETO")
end

function EditorFormula.abrir(d)
  if type(d) ~= "table" or type(d.guardar) ~= "function" then
    return
  end
  marco = marco or crear()
  if not enganchada and rawget(SNF, "Principal") then
    -- Si se cierra la ventana principal, la ventanita se va con ella (sin guardar).
    SNF.Principal.marco():HookScript("OnHide", proteger(EditorFormula.cerrar))
    enganchada = true
  end
  EditorFormula.cerrar() -- si estaba abierta con otra fórmula, se descarta
  Piezas.escalaReal(marco)
  repintarTextos()
  colocar(d.conNombre == true)
  marco.titulo:SetText(d.titulo or L.t("PRINCIPAL_FORMULA_TITULO"))
  nombreEscrito = d.conNombre and tostring(d.nombre or "") or ""
  marco.campoNombre:refrescar()
  local lista = objetosDeEjemplo(d.rutas)
  local opciones = {}
  for i, id in ipairs(lista) do
    opciones[i] = {id, nombreObjeto(id)}
  end
  marco.objeto.snfOpciones.opciones = opciones
  objeto = lista[1]
  marco:Show()
  datos = d
  marco.campo:SetText("") -- que OnTextChanged calcule aunque el texto sea el mismo de la otra vez
  marco.campo:SetText(d.texto ~= nil and tostring(d.texto) or "")
  marco.objeto:refrescar()
  calcular()
end

-- El marco (lo crea escondido la primera vez).
function EditorFormula.marco()
  marco = marco or crear()
  return marco
end

function EditorFormula.estaAbierto()
  return marco ~= nil and marco:IsShown()
end

function EditorFormula.objetoDeEjemplo()
  return objeto
end

-- ¿Es una cantidad el campo de operación? Su valor por defecto es un número sin unidad (ver la cabecera).
local function esCantidad(def)
  return type(def) == "table" and type(def.defecto) == "string" and string.find(def.defecto, "^%d+%.?%d*$") ~= nil
end

-- El gancho de ⧉ del editor de operaciones.
SNF.EditorOperacion.alEditarFormula = function(d)
  if type(d) ~= "table" or type(d.guardar) ~= "function" then
    return
  end
  local O = SNF.Operaciones
  local claveTitulo = "PRINCIPAL_EDITOR_C_" .. string.upper(tostring(d.tipo)) .. "_" .. string.upper(tostring(d.clave))
  EditorFormula.abrir({
    titulo = L.t(claveTitulo),
    texto = d.texto,
    precio = not esCantidad(O.campo(d.tipo, d.clave)),
    rutas = O.gruposDe(d.tipo, d.nombre),
    guardar = d.guardar,
  })
end
