-- SnetForever: piezas de la ventana principal (parte 1): campo de texto, desplegable y etiqueta, con el aspecto de TSM.
--
-- Amplía SNF.Piezas (lo crea ui/piezas/botones.lua, que va antes en el .toc).
--
-- Piezas.campo(padre, {ancho, alto = 22, lupa = bool, copiar = fn?, placeholder?, get, set, validar?})
--                  Cuadro de texto hundido con borde de 1 px y el texto a 8 px del borde. Es un EditBox.
--                  - get() da el texto guardado; set(texto) se llama al aplicar: con Intro o al perder el foco. Después
--                    se vuelve a leer get() y el campo enseña eso (si set normaliza el valor, se ve lo guardado). Sin get, el
--                    campo conserva lo escrito.
--                    Escape deshace lo escrito (vuelve a get()) sin llamar a set.
--                  - Fondo hundido con borde y esquinas de unos 3 px (Tema.panel); con un error el borde pasa a rojo.
--                  - lupa: el icono de la lupa a la izquierda. copiar: el icono ⧉ a la derecha; pulsarlo llama a copiar().
--                  - placeholder: texto apagado mientras el campo está vacío.
--                  - validar(texto) -> ok, mensaje: si no vale, el borde se pone rojo, sale el mensaje en el GameTooltip
--                    (si el cursor está encima o el campo tiene el foco) y el texto no se aplica.
--                  - ayuda = fn, anclaAyuda? (Task 34): la explicación del campo (fn como en Piezas.ayuda) sale con el
--                    cursor encima, a la derecha de anclaAyuda (por defecto, el campo). Se junta con el error: si hay error,
--                    es un solo tooltip con el título, la explicación y, debajo, el mensaje en rojo. Apagado sale igual.
--                  - El tooltip se repinta solo cuando cambia lo que enseña (no con cada letra que da el mismo error): no
--                    aparece y desaparece a cada tecla. Sin ayuda, el error sale solo, debajo del campo, como antes.
--                  Métodos: :ponerApagado(bool), :ponerError(mensaje|nil) y :refrescar() (vuelve a leer get()).
--                  Partes: .iconoLupa, .iconoCopiar y .botonCopiar (los que existan).
-- Piezas.desplegable(padre, {ancho, opciones = {{valor, texto}}, varios = bool, get, set, cabecera?, plano?, titulo?,
--                  colorBorde?, ayuda?, anclaAyuda?})
--                  Caja hundida con «⌄» (es un Button de 22 px de alto). Al pulsarla se abre una lista flotante con borde claro
--                  y la ventana del desplegable se oscurece; pulsar fuera, Escape o esconder la caja la cierra.
--                  - El oscurecido (Task 33, como TSM): una textura negra al 80 % (SnetForeverDesplegableSombra) que cubre
--                    solo la ventana del desplegable: el primer padre cuyo padre es UIParent, buscado con GetParent(). Sin
--                    ventana propia (la caja es hija directa de UIParent), cubre la pantalla. Se coloca en cada apertura, así
--                    sigue a la ventana si se mueve o se estira. La lista va por encima. Medido en la captura de TSM con su
--                    menú abierto (tsm-menu-enlazar-operacion-abierto.webp): lo oscurecido queda a un 21 % de su luz.
--                    sin parpadeos: entra de una vez al abrir y se va de una vez al cerrar, sin fundido (ni OnUpdate ni
--                    AnimationGroup ni cambios de alfa): cada clic da un solo cambio de luz.
--                  - titulo: una fila de 32 px arriba de la lista con ese texto (letra «etiqueta» en «texto»), que no se
--                    pulsa, sobre un fondo gris «tituloLista» y con una línea de 1 px «borde» debajo. La lista crece lo que
--                    mide (también al contar las filas que caben). Los 32 px y el gris salen de la captura de TSM con el
--                    menú abierto (29 px de gris a escala 0,907, la de su campo de 22 px que sale a 20; ronda 1).
--                  - ayuda = fn, anclaAyuda? (Task 34): la explicación sale al pasar por la caja (Piezas.ayuda, a la
--                    derecha de anclaAyuda o de la caja), apagada también; con la lista abierta no sale, y al abrirla se va.
--                  - colorBorde: el token del borde de la lista (por defecto «apagado», gris).
--                    La lista es una sola para todos: el título y el color del borde se ponen en cada apertura y vuelven a
--                    lo de serie al abrir otro desplegable que no los lleve.
--                  - La lista tiene 14 filas como mucho (y nunca se sale de la pantalla: se abre hacia arriba si abajo no hay
--                    sitio). Con más opciones se recorre con la rueda, fila a fila, y sale una barra de 4 px a la derecha.
--                    Solo existen las filas que se ven (se reutilizan). Al abrir vuelve arriba; el simple se desplaza
--                    hasta la opción elegida si no se ve.
--                  - Escape: la lista usa su propio teclado (OnKeyDown) y cierra solo la lista, sin tocar otras ventanas.
--                  - Simple: get() da el valor elegido; elegir una opción llama a set(valor) y cierra.
--                  - varios = true: get() da una tabla {[valor] = true} con los elegidos; cada opción lleva «✓» a la derecha
--                    cuando está elegida; pulsarla llama a set(valor, marcado) (marcado = true o false) y la lista sigue
--                    abierta. La caja dice «1 elegido» o «N elegidos» (o lo que dé opciones.contar(n), para otro idioma).
--                  - cabecera: lo que dice la caja cuando no hay nada elegido (en el de varios, el texto de «ninguno»; por
--                    defecto «Ninguno»; en el simple, por defecto vacío).
--                  - plano: true = barra plana (token «selector», sin borde) con un «+» a la derecha en vez de la flecha, como
--                    el «Seleccionar grupo» de TSM. Por defecto false (caja hundida con borde y flecha).
--                  Métodos: :refrescar() (vuelve a leer get()), :ponerApagado(bool), :abrir() y :cerrar().
--                  La lista es un solo marco para todos los desplegables (SnetForeverDesplegableLista) con su telón
--                  (SnetForeverDesplegableTelon): solo hay una lista abierta a la vez. El telón cubre la pantalla entera,
--                  solo para recoger el clic que cierra la lista y la rueda; no pinta nada suyo: lo único que lleva es el
--                  oscurecido. Partes de la lista: .titulo (FontString), .fondoTitulo (las dos texturas del gris) y
--                  .lineaTitulo (la línea de debajo).
-- Piezas.etiqueta(padre, texto, {vinculo = fn?})
--                  Texto SemiBold en gris claro (textoPestana) para poner sobre un campo. Con vinculo, el icono 🔗 va detrás y
--                  pulsarlo llama a vinculo(). Métodos: :anclarSobre(campo) (la deja 6 px encima del campo, alineada a su
--                  izquierda) y :ponerTexto(t). Partes: .texto, .iconoVinculo y .botonVinculo (si hay vínculo).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
SNF.Piezas = SNF.Piezas or {}
local Piezas = SNF.Piezas
local Tema = SNF.Tema

local proteger = Piezas.proteger
local pintar = Piezas.interno.pintar
local plana = Piezas.interno.plana
local colorTexto = Piezas.interno.colorTexto
local botonBase = Piezas.interno.botonBase
local ponerBarra = Piezas.interno.ponerBarra

local MARGEN = 8 -- del borde al texto
local ICONO = 12 -- lado de los iconos
local HUECO_ICONO = 4 -- entre un icono y el texto
local ALTO_CAMPO = 22
local ALTO_FILA = 22

-- Un icono del atlas de 12 px, teñido del color del token.
local function icono(padre, nombre, token, capa)
  local t = padre:CreateTexture(nil, capa or "OVERLAY")
  t:SetSize(ICONO, ICONO)
  Tema.icono(t, nombre)
  pintar(t, token)
  return t
end

-- Un botón que solo lleva un icono de 12 px (con 16 px de zona para pulsar). Se enciende al pasar el ratón.
local function botonIcono(padre, nombre, alPulsar)
  local b = botonBase(padre, alPulsar)
  b:SetSize(ICONO + 4, ICONO + 4)
  local t = icono(b, nombre, "apagado")
  t:SetPoint("CENTER", b, "CENTER", 0, 0)
  b.icono = t
  b:SetScript("OnEnter", proteger(function(self)
    pintar(self.icono, self.snfApagado and "apagado" or "texto")
  end))
  b:SetScript("OnLeave", proteger(function(self)
    pintar(self.icono, "apagado")
  end))
  return b
end

---------------------------------------------------------------------------------------------------
-- Tooltip del error (GameTooltip si existe; se mira con rawget porque en un cliente raro puede no estar)
---------------------------------------------------------------------------------------------------

-- Sin ayuda (opciones.ayuda), el error sale solo, debajo del campo, como hasta la Task 34.
local function verMensaje(dueno, mensaje)
  local tt = Piezas.interno.tooltipLibre()
  if not tt then
    return
  end
  proteger(function()
    local rojo = Tema.color("error")
    tt:SetOwner(dueno, "ANCHOR_BOTTOMLEFT")
    tt:SetText(mensaje, rojo[1], rojo[2], rojo[3], 1, true)
    tt:Show()
  end)()
end

local function esconderMensaje(dueno)
  proteger(Piezas.interno.esconderAyuda)(dueno)
end

---------------------------------------------------------------------------------------------------
-- Campo de texto
---------------------------------------------------------------------------------------------------

-- En combate un campo de texto no se queda con el teclado: si coge el foco, lo suelta. Se pone sobre cualquier campo (conserva
-- lo que ya hiciera su OnEditFocusGained). Lo usan los buscadores de las páginas de la ventana principal.
function Piezas.interno.sinTecladoEnCombate(campo)
  local previo = campo:GetScript("OnEditFocusGained")
  campo:SetScript("OnEditFocusGained", proteger(function(self, ...)
    if previo then
      previo(self, ...)
    end
    if InCombatLockdown and InCombatLockdown() then
      self:ClearFocus()
    end
  end))
end

function Piezas.campo(padre, opciones)
  opciones = opciones or {}
  local c = CreateFrame("EditBox", nil, padre)
  c:SetSize(opciones.ancho or 150, opciones.alto or ALTO_CAMPO)
  c:SetAutoFocus(false)
  Tema.letra(c, "texto")
  c.snfApagado = false
  c.snfError = nil
  c.snfRaton = false

  -- Fondo hundido con borde y esquinas de unos 3 px, como la casilla (el borde pasa a rojo con un error).

  local izquierda, derecha = MARGEN, MARGEN
  if opciones.lupa then
    c.iconoLupa = icono(c, "lupa", "apagado")
    c.iconoLupa:SetPoint("LEFT", c, "LEFT", MARGEN, 0)
    izquierda = MARGEN + ICONO + HUECO_ICONO
  end
  if opciones.copiar then
    -- El botón mide 16 px y su icono 12: queda a 8 px del borde, como el texto.
    c.botonCopiar = botonIcono(c, "copiar", function()
      opciones.copiar()
    end)
    Piezas.ayuda(c.botonCopiar, opciones.ayudaCopiar or Piezas.ayudaDe("PRINCIPAL_AYUDA_FORMULA"))
    c.botonCopiar:SetPoint("RIGHT", c, "RIGHT", -(MARGEN - 2), 0)
    c.iconoCopiar = c.botonCopiar.icono
    derecha = MARGEN + ICONO + HUECO_ICONO
  end
  c:SetTextInsets(izquierda, derecha, 0, 0)

  if opciones.placeholder then
    local ph = Tema.letra(c:CreateFontString(nil, "OVERLAY"), "texto")
    ph:SetPoint("LEFT", c, "LEFT", izquierda, 0)
    ph:SetPoint("RIGHT", c, "RIGHT", -derecha, 0)
    ph:SetJustifyH("LEFT")
    colorTexto(ph, "apagado")
    ph:SetText(opciones.placeholder)
    c.marcador = ph
  end

  -- Lo último que se aplicó (o se leyó de get): con él se sabe si hay algo que aplicar.
  local aplicado = ""
  local function leer()
    local v = opciones.get and opciones.get()
    if v == nil then
      return ""
    end
    return tostring(v)
  end

  -- validar(texto) -> ok, mensaje. Si validar falla, el error va al manejador del juego y el texto se da por bueno.
  local function evaluar(texto)
    if not opciones.validar then
      return true
    end
    local ok, vale, mensaje = xpcall(function()
      return opciones.validar(texto)
    end, geterrorhandler())
    if not ok or vale then
      return true
    end
    return false, mensaje or ""
  end

  local function pintarBorde()
    Tema.panel(c, "hundido", {borde = true, colorBorde = c.snfError and "error" or "borde"})
  end

  local function mostrarMarcador()
    if c.marcador then
      if c:GetText() == "" then
        c.marcador:Show()
      else
        c.marcador:Hide()
      end
    end
  end

  -- Lo que enseña ahora el tooltip del campo, como una firma (nil: nada). Si no cambia y el tooltip sigue siendo del campo
  -- y a la vista, no se vuelve a pintar: escribir letras que dan el mismo error no lo hace aparecer y desaparecer a cada
  -- tecla (Task 34).
  local pintado

  local function esconder()
    pintado = nil
    esconderMensaje(c)
  end

  local function sigueAhi()
    local tt = Piezas.interno.tooltipLibre()
    return tt and tt.GetOwner and tt:GetOwner() == c and tt:IsShown()
  end

  -- El mensaje solo sale mientras se escribe o con el cursor encima (no al abrir la ventana con un valor viejo en rojo).
  -- Con ayuda (Task 34): con el cursor encima sale siempre la explicación y, si hay error, debajo y en rojo; con el foco y
  -- un error, lo mismo. Es un solo tooltip con un solo dueño, el campo.
  local function actualizarMensaje()
    local hayError = c.snfError and c.snfError ~= ""
    local ayuda = opciones.ayuda
    local titulo, texto
    if ayuda and (c.snfRaton or (hayError and c:HasFocus())) then
      local ok, t1, t2 = xpcall(ayuda, geterrorhandler())
      if ok then
        titulo, texto = t1, t2
      end
    end
    local mensaje = hayError and (c.snfRaton or c:HasFocus()) and c.snfError or nil
    if titulo == nil and texto == nil and not mensaje then
      esconder()
      return
    end
    local lineas = type(texto) == "table" and table.concat(texto, "\n") or tostring(texto or "")
    local firma = tostring(titulo or "") .. "\1" .. lineas .. "\1" .. tostring(mensaje or "") .. "\1" .. ((titulo or texto) and "a" or "")
    if firma == pintado and sigueAhi() then
      return
    end
    pintado = firma
    if titulo == nil and texto == nil then
      verMensaje(c, mensaje)
    else
      proteger(Piezas.interno.pintarAyuda)(c, Piezas.interno.anclaDe(opciones.anclaAyuda), titulo, texto, mensaje)
    end
  end

  function c:ponerError(mensaje)
    self.snfError = mensaje
    pintarBorde()
    actualizarMensaje()
  end

  function c:ponerApagado(apagado)
    self.snfApagado = apagado and true or false
    colorTexto(self, self.snfApagado and "apagado" or "texto")
    if self.snfApagado then
      self:Disable()
    else
      self:Enable()
    end
    if self.iconoLupa then
      pintar(self.iconoLupa, "apagado")
    end
    if self.botonCopiar then
      self.botonCopiar.snfApagado = self.snfApagado
    end
  end

  local function revisar()
    local vale, mensaje = evaluar(c:GetText())
    c:ponerError(vale and nil or mensaje)
  end

  -- Aplica el texto si cambió y vale. Devuelve false si no vale (se queda en rojo, sin aplicar).
  local function aplicar()
    if c.snfApagado then
      return true
    end
    local texto = c:GetText()
    if texto == aplicado then
      return true
    end
    local vale, mensaje = evaluar(texto)
    if not vale then
      c:ponerError(mensaje)
      return false
    end
    aplicado = texto
    if opciones.set then
      proteger(opciones.set)(texto)
      -- Se vuelve a leer lo guardado: si set normaliza el valor (recorta espacios...), se ve lo que quedó.
      if opciones.get then
        aplicado = leer()
        if c:GetText() ~= aplicado then
          c:SetText(aplicado)
        end
      end
    end
    return true
  end

  function c:refrescar()
    aplicado = leer()
    if self:GetText() ~= aplicado then
      self:SetText(aplicado)
    end
    revisar()
    mostrarMarcador()
  end

  c:SetScript("OnTextChanged", proteger(function()
    revisar()
    mostrarMarcador()
  end))
  c:SetScript("OnEnterPressed", proteger(function(self)
    if aplicar() then
      self:ClearFocus()
    end
  end))
  c:SetScript("OnEscapePressed", proteger(function(self)
    aplicado = leer()
    self:SetText(aplicado)
    self:ClearFocus()
  end))
  c:SetScript("OnEditFocusGained", proteger(function()
    aplicado = leer()
    actualizarMensaje()
  end))
  c:SetScript("OnEditFocusLost", proteger(function()
    aplicar()
    esconder()
  end))
  c:SetScript("OnEnter", proteger(function(self)
    self.snfRaton = true
    actualizarMensaje()
  end))
  c:SetScript("OnLeave", proteger(function(self)
    self.snfRaton = false
    if self:HasFocus() then
      actualizarMensaje() -- con el foco sigue el error (sin repintar si no cambia); sin error, se va la explicación
    else
      esconder()
    end
  end))

  pintarBorde()
  c:ponerApagado(false)
  c:refrescar()
  return c
end

---------------------------------------------------------------------------------------------------
-- Desplegable
---------------------------------------------------------------------------------------------------

local NOMBRE_LISTA = "SnetForeverDesplegableLista"
local NOMBRE_TELON = "SnetForeverDesplegableTelon"
local NOMBRE_SOMBRA = "SnetForeverDesplegableSombra"
local PLANO = "Interface\\Buttons\\WHITE8X8" -- la misma textura blanca que las piezas, para teñir
local OSCURO = 0.8 -- alfa del oscurecido: negro al 80 %, como TSM (medido en su captura: queda un 21 % de la luz)
local ALTO_TITULO = 32 -- la fila del título, con su línea de 1 px abajo (medida en TSM; el plan decía 24)
local RADIO_DENTRO = 2 -- las esquinas del fondo de la lista (Tema.panel: 3 px por fuera, 2 por dentro del borde)
-- Lo más alto que hay: la lista se ve por encima de cualquier ventana. El telón va debajo de la lista, pero también arriba.
local ESTRATO = "TOOLTIP"
local NIVEL_TELON, NIVEL_LISTA = 100, 110
local MAX_FILAS = 14 -- filas a la vez; las demás se recorren con la rueda
local MARGEN_FILAS = 2 -- de las filas al borde de la lista, arriba y abajo: el resalte no pisa las esquinas redondeadas
local MARGEN_PANTALLA = 10 -- lo que la lista deja libre hasta el borde de la pantalla
local ANCHO_BARRA = Piezas.interno.ANCHO_BARRA
local NIVEL_FILAS, NIVEL_BARRA = NIVEL_LISTA + 1, NIVEL_LISTA + 5

local telon, lista, sombra -- marcos compartidos (se crean al abrir el primero)
local abierto -- el desplegable que tiene ahora la lista
local alRodar -- (más abajo) la rueda desplaza la lista

-- Escape de la lista. Con teclado propio (EnableKeyboard + OnKeyDown) Escape cierra solo la lista; sin él, la lista se mete
-- en UISpecialFrames solo mientras está abierta (como panel.lua) para que Escape también la cierre.
local function conTeclado()
  return lista.EnableKeyboard ~= nil and lista.SetPropagateKeyboardInput ~= nil
end

local function enEspeciales(dentro)
  for k = #UISpecialFrames, 1, -1 do
    if UISpecialFrames[k] == NOMBRE_LISTA then
      if dentro then
        return
      end
      table.remove(UISpecialFrames, k)
    end
  end
  if dentro then
    table.insert(UISpecialFrames, NOMBRE_LISTA)
  end
end

local function crearMarcos()
  if lista then
    return
  end
  -- El telón: un marco a pantalla completa que cierra la lista al pulsarlo. No pinta nada suyo (hasta la Task 33 era negro
  -- al 50 % en toda la pantalla, y sobre la ventana casi negra apenas se notaba).
  telon = CreateFrame("Frame", NOMBRE_TELON, UIParent)
  telon:SetFrameStrata(ESTRATO)
  telon:SetFrameLevel(NIVEL_TELON)
  telon:SetAllPoints(UIParent)
  telon:EnableMouse(true)
  telon:EnableMouseWheel(true) -- la rueda nunca llega al juego: desplaza la lista esté donde esté el cursor
  -- El oscurecido: negro al 80 %, en el telón (debajo de la lista); se ancla a la ventana en cada apertura. Su color no
  -- cambia nunca: se ve o no se ve con el telón, de una vez.
  sombra = telon:CreateTexture(NOMBRE_SOMBRA, "BACKGROUND", nil, 0)
  sombra:SetTexture(PLANO)
  sombra:SetVertexColor(0, 0, 0, OSCURO)
  sombra:SetAllPoints(telon)
  telon:Hide()

  lista = CreateFrame("Frame", NOMBRE_LISTA, UIParent)
  lista:SetFrameStrata(ESTRATO)
  lista:SetFrameLevel(NIVEL_LISTA)
  lista:SetClampedToScreen(true)
  lista:EnableMouse(true)
  lista:EnableMouseWheel(true)
  -- Fondo un poco más claro que las cajas y borde claro (apagado) para que la lista se separe del telón.
  Tema.panel(lista, "lateral", {borde = true, colorBorde = "apagado"})
  lista.filas = {} -- solo las que se ven (hasta MAX_FILAS): se reutilizan al desplazar
  lista.inicio = 0 -- cuántas opciones hay por encima de la primera fila
  lista.visibles = 0
  lista.arriba = 0 -- lo que ocupa el título encima de las filas (0 sin título)
  -- El título (opciones.titulo): un texto de la propia lista, no una fila, así que no se pulsa; debajo, 1 px «borde».
  -- Su fondo gris va dentro del borde, hasta la línea: un rectángulo y, en sus 2 px de arriba, una franja metida 2 px por
  -- cada lado, para no tapar las esquinas redondeadas de la lista.
  local fondo = plana(lista, "BACKGROUND", 2)
  fondo:SetPoint("TOPLEFT", lista, "TOPLEFT", 1, -(1 + RADIO_DENTRO))
  fondo:SetPoint("BOTTOMRIGHT", lista, "TOPRIGHT", -1, -(ALTO_TITULO - 1))
  local franja = plana(lista, "BACKGROUND", 2)
  franja:SetPoint("TOPLEFT", lista, "TOPLEFT", 1 + RADIO_DENTRO, -1)
  franja:SetPoint("BOTTOMRIGHT", lista, "TOPRIGHT", -(1 + RADIO_DENTRO), -(1 + RADIO_DENTRO))
  lista.fondoTitulo = {fondo, franja}
  for _, t in ipairs(lista.fondoTitulo) do
    pintar(t, "tituloLista")
    t:Hide()
  end
  local titulo = Tema.letra(lista:CreateFontString(nil, "OVERLAY"), "etiqueta")
  titulo:SetPoint("LEFT", lista, "TOPLEFT", MARGEN, -ALTO_TITULO / 2)
  titulo:SetPoint("RIGHT", lista, "TOPRIGHT", -MARGEN, -ALTO_TITULO / 2)
  titulo:SetJustifyH("LEFT")
  titulo:SetWordWrap(false)
  colorTexto(titulo, "texto")
  titulo:Hide()
  lista.titulo = titulo
  local linea = plana(lista, "ARTWORK", 0)
  linea:SetHeight(1)
  linea:SetPoint("TOPLEFT", lista, "TOPLEFT", 1, -(ALTO_TITULO - 1))
  linea:SetPoint("TOPRIGHT", lista, "TOPRIGHT", -1, -(ALTO_TITULO - 1))
  pintar(linea, "borde")
  linea:Hide()
  lista.lineaTitulo = linea
  -- La barra va en un marco hijo de la lista por encima de las filas: el resalte de una fila nunca la tapa.
  local marcoBarra = CreateFrame("Frame", nil, lista)
  marcoBarra:SetAllPoints(lista)
  marcoBarra:SetFrameLevel(NIVEL_BARRA)
  lista.marcoBarra = marcoBarra
  lista.barra = plana(marcoBarra, "OVERLAY", 0)
  pintar(lista.barra, "apagado")
  lista.barra:SetWidth(ANCHO_BARRA)
  lista.barra:Hide()
  lista:Hide()

  telon:SetScript("OnMouseDown", proteger(function()
    lista:Hide()
  end))
  lista:SetScript("OnShow", proteger(function(self)
    telon:Show()
    if conTeclado() then
      self:EnableKeyboard(true)
    else
      enEspeciales(true)
    end
  end))
  lista:SetScript("OnHide", proteger(function()
    telon:Hide()
    abierto = nil
    enEspeciales(false)
  end))
  local rueda = proteger(function(_, delta)
    alRodar(delta)
  end)
  lista:SetScript("OnMouseWheel", rueda)
  telon:SetScript("OnMouseWheel", rueda)
  lista:SetScript("OnKeyDown", proteger(function(self, tecla)
    -- En combate no se toca la propagación (el cliente la bloquea a un código no seguro): Escape cierra la lista igual.
    local libre = not (InCombatLockdown and InCombatLockdown())
    if tecla == "ESCAPE" then
      if libre then
        self:SetPropagateKeyboardInput(false)
      end
      self:Hide()
    elseif libre then
      self:SetPropagateKeyboardInput(true)
    end
  end))
end

local function seleccion(d)
  local get = d.snfOpciones.get
  return get and get() or (d.snfOpciones.varios and {} or nil)
end

local function estaElegida(d, valor, elegidos)
  if d.snfOpciones.varios then
    return elegidos ~= nil and elegidos[valor] and true or false
  end
  return elegidos == valor
end

-- Pinta cada fila de la lista abierta: el ✓ (varios) o el texto amarillo (simple) en la elegida.
local function pintarFilas(d)
  local elegidos = seleccion(d)
  for _, fila in ipairs(lista.filas) do
    if fila:IsShown() then
      local elegida = estaElegida(d, fila.valor, elegidos)
      if d.snfOpciones.varios then
        if elegida then fila.tilde:Show() else fila.tilde:Hide() end
        colorTexto(fila.texto, "texto")
      else
        fila.tilde:Hide()
        colorTexto(fila.texto, elegida and "marca" or "texto")
      end
    end
  end
end

-- La barra de la derecha: solo si hay más opciones de las que caben; su alto y su sitio son proporcionales a lo que se ve.
local function pintarBarra(d)
  local n, visibles = #d.snfOpciones.opciones, lista.visibles
  ponerBarra(lista.barra, lista, visibles * ALTO_FILA, lista.arriba + MARGEN_FILAS, visibles, n, lista.inicio)
end

local function elegir(fila)
  local d = fila.desplegable
  local o = d.snfOpciones
  if o.varios then
    local marcado = not estaElegida(d, fila.valor, seleccion(d))
    if o.set then
      proteger(o.set)(fila.valor, marcado)
    end
    d:refrescar()
    pintarFilas(d)
  else
    lista:Hide()
    if o.set then
      proteger(o.set)(fila.valor)
    end
    d:refrescar()
  end
end

local function nuevaFila(i)
  local fila = botonBase(lista, elegir)
  fila:SetHeight(ALTO_FILA)
  fila:SetFrameLevel(NIVEL_FILAS)
  local resalte = plana(fila, "BACKGROUND", 0)
  resalte:SetAllPoints(fila)
  pintar(resalte, "elegida")
  resalte:Hide()
  fila.resalte = resalte
  fila.tilde = icono(fila, "tilde", "marca")
  fila.tilde:SetPoint("RIGHT", fila, "RIGHT", -MARGEN, 0)
  fila.tilde:Hide()
  local fs = Tema.letra(fila:CreateFontString(nil, "OVERLAY"), "texto")
  fs:SetPoint("LEFT", fila, "LEFT", MARGEN, 0)
  fs:SetJustifyH("LEFT")
  fila.texto = fs
  fila:SetScript("OnEnter", proteger(function(self)
    self.resalte:Show()
  end))
  fila:SetScript("OnLeave", proteger(function(self)
    self.resalte:Hide()
  end))
  lista.filas[i] = fila
  return fila
end

-- Pone en las filas las opciones que tocan según lista.inicio (solo se usan `visibles` filas, reutilizadas).
local function asignarFilas(d)
  local o = d.snfOpciones
  local ancho = d:GetWidth()
  for i = 1, lista.visibles do
    local opcion = o.opciones[lista.inicio + i]
    local fila = lista.filas[i] or nuevaFila(i)
    fila.desplegable, fila.valor = d, opcion[1]
    fila.texto:SetText(opcion[2] or tostring(opcion[1]))
    fila.texto:ClearAllPoints()
    fila.texto:SetPoint("LEFT", fila, "LEFT", MARGEN, 0)
    fila.texto:SetPoint("RIGHT", fila, "RIGHT", -(o.varios and (MARGEN + ICONO + HUECO_ICONO) or MARGEN), 0)
    fila:ClearAllPoints()
    fila:SetPoint("TOPLEFT", lista, "TOPLEFT", 1, -(lista.arriba + MARGEN_FILAS + (i - 1) * ALTO_FILA))
    fila:SetSize(ancho - 2, ALTO_FILA)
    fila.resalte:Hide()
    fila:Show()
  end
  for i = lista.visibles + 1, #lista.filas do
    lista.filas[i]:Hide()
  end
  pintarFilas(d)
  pintarBarra(d)
end

-- Cuántas filas caben (nunca más de MAX_FILAS) y hacia dónde se abre: abajo si cabe todo; si no, hacia el lado con más sitio.
-- Devuelve filas, haciaArriba. La lista nunca se sale de la pantalla (deja MARGEN_PANTALLA libres). extra: lo que ocupa el
-- título (0 sin título), que también tiene que caber.
local function plantear(d, n, extra)
  local escala = d:GetEffectiveScale() / UIParent:GetEffectiveScale()
  lista:SetScale(escala)
  local pantalla = UIParent:GetHeight() or 768
  local function caben(espacio)
    return math.max(0, math.floor((espacio / escala - 2 * MARGEN_FILAS - extra) / ALTO_FILA))
  end
  local deseadas = math.min(n, MAX_FILAS)
  local abajoCaja, arribaCaja = d:GetBottom(), d:GetTop()
  if not abajoCaja or not arribaCaja then
    return math.max(1, math.min(deseadas, caben(pantalla - 2 * MARGEN_PANTALLA))), false
  end
  local hueco = 2 * escala
  local filasAbajo = caben(abajoCaja * escala - MARGEN_PANTALLA - hueco)
  local filasArriba = caben(pantalla - arribaCaja * escala - MARGEN_PANTALLA - hueco)
  if deseadas <= filasAbajo then
    return deseadas, false
  elseif filasArriba > filasAbajo then
    return math.max(1, math.min(deseadas, filasArriba)), true
  end
  return math.max(1, filasAbajo), false
end

-- La ventana del desplegable: el primer padre cuyo padre es UIParent. nil si la caja es hija directa de UIParent (o no
-- cuelga de UIParent): entonces el oscurecido cubre la pantalla.
local function ventanaDe(d)
  local p = d:GetParent()
  while p and p ~= UIParent do
    local arriba = p:GetParent()
    if arriba == UIParent then
      return p
    end
    p = arriba
  end
  return nil
end

-- Lo que cambia de un desplegable a otro en la lista compartida: el borde, el título y dónde va el oscurecido.
local function vestir(d)
  local o = d.snfOpciones
  Tema.panel(lista, "lateral", {borde = true, colorBorde = o.colorBorde or "apagado"})
  if o.titulo then
    lista.titulo:SetText(o.titulo)
    lista.titulo:Show()
    lista.lineaTitulo:Show()
    for _, t in ipairs(lista.fondoTitulo) do t:Show() end
    lista.arriba = ALTO_TITULO
  else
    lista.titulo:SetText("")
    lista.titulo:Hide()
    lista.lineaTitulo:Hide()
    for _, t in ipairs(lista.fondoTitulo) do t:Hide() end
    lista.arriba = 0
  end
  sombra:ClearAllPoints()
  sombra:SetAllPoints(ventanaDe(d) or telon)
end

local function abrir(d)
  crearMarcos()
  if lista:IsShown() then
    lista:Hide() -- la de otro desplegable (o la de este mismo): se cierra y se vuelve a montar
  end
  local o = d.snfOpciones
  local n = #o.opciones
  if n == 0 then
    return
  end
  -- Task 34: con la lista abierta no sale la ayuda de la caja; si estaba a la vista, se va de una vez al abrir.
  Piezas.interno.esconderAyuda(d)
  vestir(d)
  local filas, haciaArriba = plantear(d, n, lista.arriba)
  lista.visibles = math.min(n, filas)
  -- Siempre arriba del todo; el desplegable simple se desplaza hasta la opción elegida si no se ve.
  lista.inicio = 0
  if not o.varios then
    local elegido = seleccion(d)
    for i, opcion in ipairs(o.opciones) do
      if opcion[1] == elegido then
        if i > lista.visibles then
          lista.inicio = math.max(0, math.min(n - lista.visibles, i - 1 - math.floor((lista.visibles - 1) / 2)))
        end
        break
      end
    end
  end
  lista:SetSize(d:GetWidth(), lista.arriba + lista.visibles * ALTO_FILA + 2 * MARGEN_FILAS)
  lista:ClearAllPoints()
  if haciaArriba then
    lista:SetPoint("BOTTOMLEFT", d, "TOPLEFT", 0, 2)
  else
    lista:SetPoint("TOPLEFT", d, "BOTTOMLEFT", 0, -2)
  end
  abierto = d
  asignarFilas(d)
  lista:Show()
end

-- La rueda desplaza la lista fila a fila, sin pasar del principio ni del final.
alRodar = function(delta)
  local d = abierto
  if not d then
    return
  end
  local nuevo = lista.inicio - (delta > 0 and 1 or -1)
  nuevo = math.max(0, math.min(#d.snfOpciones.opciones - lista.visibles, nuevo))
  if nuevo ~= lista.inicio then
    lista.inicio = nuevo
    asignarFilas(d)
  end
end

function Piezas.desplegable(padre, opciones)
  opciones = opciones or {}
  opciones.opciones = opciones.opciones or {}
  local d = botonBase(padre, function(self)
    if abierto == self and lista and lista:IsShown() then
      lista:Hide()
    else
      abrir(self)
    end
  end)
  d.snfOpciones = opciones
  d:SetSize(opciones.ancho or 150, ALTO_CAMPO)

  -- Fondo hundido con borde y esquinas de unos 3 px, como la casilla. Con opciones.plano: barra plana (token «selector»,
  -- sin borde) y un «+» en vez de la flecha, como el «Seleccionar grupo» de TSM.
  if opciones.plano then
    Tema.panel(d, "selector")
  else
    Tema.panel(d, "hundido", {borde = true})
  end

  d.flecha = icono(d, opciones.plano and "mas" or "desplegar", "texto")
  d.flecha:SetPoint("RIGHT", d, "RIGHT", -MARGEN, 0)
  local fs = Tema.letra(d:CreateFontString(nil, "OVERLAY"), "texto")
  fs:SetPoint("LEFT", d, "LEFT", MARGEN, 0)
  fs:SetPoint("RIGHT", d, "RIGHT", -(MARGEN + ICONO + HUECO_ICONO), 0)
  fs:SetJustifyH("LEFT")
  d.texto = fs

  -- Lo que dice la caja: la opción elegida o, en el de varios, cuántas hay.
  function d:refrescar()
    local o = self.snfOpciones
    local elegidos = seleccion(self)
    local ninguno = o.cabecera or (o.varios and "Ninguno" or "")
    local texto = ninguno
    if o.varios then
      local cuantos = 0
      for _, opcion in ipairs(o.opciones) do
        if estaElegida(self, opcion[1], elegidos) then
          cuantos = cuantos + 1
        end
      end
      if cuantos > 0 and o.contar then
        texto = o.contar(cuantos)
      elseif cuantos == 1 then
        texto = "1 elegido"
      elseif cuantos > 1 then
        texto = cuantos .. " elegidos"
      end
    else
      for _, opcion in ipairs(o.opciones) do
        if estaElegida(self, opcion[1], elegidos) then
          texto = opcion[2] or tostring(opcion[1])
          break
        end
      end
    end
    self.texto:SetText(texto)
  end

  function d:abrir()
    if not self.snfApagado then
      abrir(self)
    end
  end

  function d:cerrar()
    if abierto == self and lista then
      lista:Hide()
    end
  end

  function d:ponerApagado(apagado)
    self.snfApagado = apagado and true or false
    colorTexto(self.texto, self.snfApagado and "apagado" or "texto")
    pintar(self.flecha, self.snfApagado and "apagado" or "texto")
    if self.snfApagado then
      self:cerrar()
    end
  end

  -- Task 34: la ayuda al pasar por la caja (no con su lista abierta), a la derecha de opciones.anclaAyuda (o de la caja).
  if opciones.ayuda then
    Piezas.ayuda(d, function()
      if abierto == d and lista and lista:IsShown() then
        return nil
      end
      local fn = d.snfOpciones.ayuda
      if fn then
        return fn()
      end
    end, {ancla = function() return Piezas.interno.anclaDe(d.snfOpciones.anclaAyuda) end})
  end

  -- Si se esconde la caja (o algo de arriba) con la lista abierta, la lista se cierra con su telón.
  d:SetScript("OnHide", proteger(function(self)
    self:cerrar()
  end))

  d:ponerApagado(false)
  d:refrescar()
  return d
end

---------------------------------------------------------------------------------------------------
-- Etiqueta
---------------------------------------------------------------------------------------------------

local SEPARACION_ETIQUETA = 6 -- entre la etiqueta y el campo de debajo
local ALTO_ETIQUETA = 14
local HUECO_VINCULO = 8

function Piezas.etiqueta(padre, texto, opciones)
  opciones = opciones or {}
  local f = CreateFrame("Frame", nil, padre)
  local fs = Tema.letra(f:CreateFontString(nil, "OVERLAY"), "etiqueta")
  fs:SetPoint("LEFT", f, "LEFT", 0, 0)
  colorTexto(fs, "texto")
  f.texto = fs

  if opciones.vinculo then
    f.botonVinculo = botonIcono(f, "vinculo", function()
      opciones.vinculo()
    end)
    Piezas.ayuda(f.botonVinculo, opciones.ayudaVinculo or Piezas.ayudaDe("PRINCIPAL_AYUDA_VINCULO"))
    f.botonVinculo:SetPoint("LEFT", fs, "RIGHT", HUECO_VINCULO, 0)
    f.iconoVinculo = f.botonVinculo.icono
  end

  local function medir()
    local ancho = math.ceil(fs:GetStringWidth())
    if f.botonVinculo then
      ancho = ancho + HUECO_VINCULO + ICONO + 4
    end
    f:SetSize(math.max(1, ancho), ALTO_ETIQUETA)
  end

  function f:ponerTexto(t)
    self.texto:SetText(t or "")
    medir()
  end

  function f:anclarSobre(campo)
    self:ClearAllPoints()
    self:SetPoint("BOTTOMLEFT", campo, "TOPLEFT", 0, SEPARACION_ETIQUETA)
  end

  f:ponerTexto(texto)
  return f
end
