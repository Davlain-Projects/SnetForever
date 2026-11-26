-- SnetForever: piezas de la ventana principal (parte 1): botones, enlaces, casilla y radio, con el aspecto de TSM.
--
-- SNF.Piezas es un espacio compartido: este archivo lo crea y los demás de ui/piezas/ lo amplían.
--
-- Piezas.proteger(fn)                  devuelve una función que llama a fn protegida: si falla, el error va a
--                                      geterrorhandler() y no rompe al que la llamó. Todo script de las piezas pasa por aquí.
-- Piezas.boton(padre, texto, alPulsar, opciones?)
--                                      botón de texto. opciones: borde (true = transparente con borde de 1 px), ancho,
--                                      alto (22 por defecto), icono (nombre del atlas de Tema.icono) y letra (el tamaño;
--                                      por defecto el del tipo «boton»: Task 31, la barra de TSM lleva la letra más grande).
--                                      Task 31: el texto nunca se parte en dos líneas (SetWordWrap(false)); si no cabe se
--                                      corta, así que quien da un ancho fijo tiene que darlo suficiente (el texto más largo
--                                      más .espacioFijo). Métodos: :ponerApagado(bool) y :ponerTexto(t). Apagado no llama
--                                      a alPulsar.
-- Piezas.botonIcono(padre, icono, alPulsar, opciones?)
--                                      solo el icono del atlas (Tema.icono), sin fondo. opciones: tamano (16) y color (token del
--                                      tema, "texto"). Al pasar el ratón se aclara un poco; apagado va en «apagado» y no llama a
--                                      alPulsar. Método :ponerApagado(bool). Parte: .icono.
-- Piezas.botonCuadrado(padre, icono, alPulsar, opciones?)
--                                      cuadrado pequeño con borde de 1 px («borde»), fondo hundido y el icono del atlas en el
--                                      centro (desplegar y plegar todo de Navegar). opciones: lado (16), tamanoIcono (10) y
--                                      color (token del icono, "texto"). Al pasar el ratón se aclaran el icono y el borde, como
--                                      en botonIcono (sin animación); apagado van en «apagado» y «botonApagado» y no llama a
--                                      alPulsar. Método :ponerApagado(bool). Partes: .icono, .fondo y .bordes.
-- Piezas.enlace(padre, texto, alPulsar)  texto amarillo sin fondo. Métodos :ponerApagado(bool) y :ponerTexto(t).
-- Piezas.casilla(padre, texto, get, set) cuadrado de 11 px con borde. Marcada: relleno amarillo, sin tilde. Pulsar llama
--                                      a set(not get()). Métodos :refrescar() y :ponerApagado(bool).
-- Piezas.radio(padre, get, set, opciones?)  «Sí» y «No» en línea con círculos de 12 px (Task 31, como TSM en op-03): el
--                                      vacío relleno de «radioVacio», el elegido de «marca», los dos con el aro en
--                                      «bordeRadio»; apagado, el elegido en «apagado» y el aro en «botonApagado». Pulsar uno
--                                      llama a set(true) o set(false). opciones.si y opciones.no cambian los dos textos (el
--                                      editor de operaciones los da en el idioma del jugador). Métodos :refrescar(),
--                                      :ponerApagado(bool) y :ponerTextos(si, no) (recoloca el «No» detrás del «Sí»).
--                                      Task 34: opciones.ayuda (fn, como en Piezas.ayuda) sale al pasar por el «Sí» y por
--                                      el «No», a la derecha de opciones.anclaAyuda (por defecto, el radio entero).
-- Piezas.ayuda(marco, fn, opciones?)    (Task 34) la explicación de un control en el GameTooltip al pasar el ratón.
--                                      fn() -> titulo, texto (texto: una cadena o una lista de líneas; nil, nil: no sale
--                                      nada). Envuelve el OnEnter y el OnLeave que ya tuviera el marco, sin quitarlos. Al
--                                      entrar, el título en blanco y el texto en «textoPestana», con ajuste de línea; el
--                                      tooltip va con su esquina de arriba a la izquierda en la de arriba a la derecha de
--                                      opciones.ancla (un marco o una función que lo da; por defecto el propio marco). Así
--                                      sale como en TSM (tsm-tooltip-campo-puja.webp): quien pinta una fila de etiqueta y
--                                      caja pasa la fila, que llega al borde derecho, con su borde de arriba a la altura de
--                                      la caja. El juego lo mantiene dentro de la pantalla. Al salir lo esconde, solo si
--                                      sigue siendo su dueño. Con el GameTooltip prohibido no hace nada.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
SNF.Piezas = SNF.Piezas or {}
local Piezas = SNF.Piezas
local Tema = SNF.Tema

local PLANO = "Interface\\Buttons\\WHITE8X8"
local TAMANO_MARCA = 11 -- la casilla
local TAMANO_RADIO = 15
local SEPARACION_TEXTO = 8

function Piezas.proteger(fn)
  return function(...)
    local n, args = select("#", ...), {...}
    -- xpcall (Lua 5.1 no pasa argumentos): el manejador del juego se llama donde falla, con la traza completa.
    xpcall(function()
      return fn(unpack(args, 1, n))
    end, geterrorhandler())
  end
end
local proteger = Piezas.proteger

local function pintar(tex, token)
  local c = Tema.color(token)
  tex:SetVertexColor(c[1], c[2], c[3], c[4])
end

local function plana(marco, capa, subnivel)
  local t = marco:CreateTexture(nil, capa or "BACKGROUND", nil, subnivel or 0)
  t:SetTexture(PLANO)
  return t
end

local function colorTexto(fs, token)
  local c = Tema.color(token)
  fs:SetTextColor(c[1], c[2], c[3], c[4])
end

-- Un borde de 1 px (cuatro tiras) alrededor del marco, del color del token. Devuelve la lista de tiras.
local function marcoBorde(marco, token)
  local arriba, abajo, izq, der = plana(marco), plana(marco), plana(marco), plana(marco)
  arriba:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  arriba:SetPoint("TOPRIGHT", marco, "TOPRIGHT", 0, 0)
  arriba:SetHeight(1)
  abajo:SetPoint("BOTTOMLEFT", marco, "BOTTOMLEFT", 0, 0)
  abajo:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", 0, 0)
  abajo:SetHeight(1)
  izq:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, -1)
  izq:SetPoint("BOTTOMLEFT", marco, "BOTTOMLEFT", 0, 1)
  izq:SetWidth(1)
  der:SetPoint("TOPRIGHT", marco, "TOPRIGHT", 0, -1)
  der:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", 0, 1)
  der:SetWidth(1)
  local lista = {arriba, abajo, izq, der}
  for _, t in ipairs(lista) do
    pintar(t, token)
  end
  return lista
end

-- Un botón sin aspecto propio que solo llama a alPulsar (protegido) cuando no está apagado. En un doble clic el primer
-- clic va a OnClick y el segundo a OnDoubleClick, que está vacío a propósito para que alPulsar no se dispare dos veces.
local function botonBase(padre, alPulsar)
  local b = CreateFrame("Button", nil, padre)
  b.snfApagado = false
  b:SetScript("OnClick", proteger(function(self, ...)
    if self.snfApagado or not alPulsar then
      return
    end
    alPulsar(self, ...)
  end))
  b:SetScript("OnDoubleClick", function() end)
  return b
end

-- La barra de desplazamiento fina (la del desplegable y la de Piezas.desplazable): 4 px de ancho, en gris (apagado),
-- pegada a la derecha del marco. Su alto y su sitio son proporcionales a lo que se ve. Se mide en las mismas unidades
-- (filas o píxeles) que visible, total y posicion:
--   util      píxeles del recorrido de la barra (el alto de la zona que se ve)
--   margen    píxeles entre el borde de arriba del marco y el principio de esa zona
--   visible   cuánto cabe a la vez; total: cuánto hay en todo; posicion: desde dónde se ve (de 0 a total - visible)
-- Si todo cabe, la barra se esconde.
local ANCHO_BARRA = 4
local MIN_BARRA = 8
local function ponerBarra(barra, marco, util, margen, visible, total, posicion)
  if total <= visible then
    barra:Hide()
    return
  end
  local alto = math.max(MIN_BARRA, util * visible / total)
  local libre = util - alto
  local y = margen + libre * posicion / (total - visible)
  barra:ClearAllPoints()
  barra:SetPoint("TOPRIGHT", marco, "TOPRIGHT", -2, -y)
  barra:SetSize(ANCHO_BARRA, alto)
  barra:Show()
end

---------------------------------------------------------------------------------------------------
-- La ayuda de un control en el GameTooltip (Task 34)
---------------------------------------------------------------------------------------------------

-- El GameTooltip, o nil si no se puede usar (no existe, o está prohibido). Se mira con rawget: en un cliente raro puede no estar.
local function tooltipLibre()
  local tt = rawget(_G, "GameTooltip")
  if not tt or not tt.SetOwner or (tt.IsForbidden and tt:IsForbidden()) then
    return nil
  end
  return tt
end

-- Pinta la ayuda: el título en blanco, el texto (una cadena o una lista de líneas) en textoPestana y, si hay mensaje,
-- debajo y en rojo («error»). Todo con ajuste de línea. El tooltip sale con su esquina de arriba a la izquierda en la
-- esquina de arriba a la derecha del ancla (ancla nil: el propio dueño). El juego lo mantiene dentro de la pantalla
-- (GameTooltip va sujeto a ella de serie; aquí no se toca).
local function pintarAyuda(dueno, ancla, titulo, texto, mensaje)
  local tt = tooltipLibre()
  if not tt then
    return false
  end
  tt:SetOwner(dueno, "ANCHOR_NONE")
  tt:ClearAllPoints()
  tt:SetPoint("TOPLEFT", ancla or dueno, "TOPRIGHT", 0, 0)
  local primera = true
  local function linea(t, c)
    if t == nil or t == "" then
      return
    end
    if primera then
      tt:SetText(t, c[1], c[2], c[3], 1, true)
      primera = false
    else
      tt:AddLine(t, c[1], c[2], c[3], true)
    end
  end
  linea(titulo, {1, 1, 1})
  local gris = Tema.color("textoPestana")
  if type(texto) == "table" then
    for _, t in ipairs(texto) do
      linea(t, gris)
    end
  else
    linea(texto, gris)
  end
  linea(mensaje, Tema.color("error"))
  tt:Show()
  return true
end

-- Esconde el tooltip solo si sigue siendo de ese dueño.
local function esconderAyuda(dueno)
  local tt = tooltipLibre()
  if tt and tt.GetOwner and tt:GetOwner() == dueno then
    tt:Hide()
  end
end

-- ancla puede ser un marco o una función que lo da (se lee al entrar el ratón).
local function anclaDe(ancla)
  if type(ancla) == "function" then
    return ancla()
  end
  return ancla
end

function Piezas.ayuda(marco, fn, opciones)
  opciones = opciones or {}
  marco.snfAyuda = fn
  local generation = 0
  local entrar, salir = marco:GetScript("OnEnter"), marco:GetScript("OnLeave")
  local function hide(self)
    generation = generation + 1
    esconderAyuda(self)
  end
  marco:SetScript("OnEnter", proteger(function(self, ...)
    if entrar then
      entrar(self, ...)
    end
    generation = generation + 1
    local hover = generation
    local function show()
      if hover ~= generation or not self:IsVisible() then
        return
      end
      local titulo, texto = fn()
      if titulo ~= nil or texto ~= nil then
        pintarAyuda(self, anclaDe(opciones.ancla), titulo, texto)
      end
    end
    if opciones.espera and opciones.espera > 0 and C_Timer and C_Timer.After then
      C_Timer.After(opciones.espera, proteger(show))
    else
      show()
    end
  end))
  marco:SetScript("OnLeave", proteger(function(self, ...)
    if salir then
      salir(self, ...)
    end
    hide(self)
  end))
  marco:HookScript("OnHide", proteger(hide))
  return marco
end

function Piezas.ayudaDe(clave)
  return function() return SNF.L.t(clave) end
end

-- Las ayudas de dibujo de este archivo, para que ui/piezas/campos.lua (y las piezas que vengan) no las copien.
-- Son internas de las piezas: el resto del addon usa solo las piezas.
Piezas.interno = {
  pintar = pintar, plana = plana, colorTexto = colorTexto, marcoBorde = marcoBorde, botonBase = botonBase,
  ponerBarra = ponerBarra, ANCHO_BARRA = ANCHO_BARRA,
  tooltipLibre = tooltipLibre, pintarAyuda = pintarAyuda, esconderAyuda = esconderAyuda, anclaDe = anclaDe,
}

---------------------------------------------------------------------------------------------------
-- Botón
---------------------------------------------------------------------------------------------------

function Piezas.boton(padre, texto, alPulsar, opciones)
  opciones = opciones or {}
  local b = botonBase(padre, alPulsar)
  local fs = Tema.letra(b:CreateFontString(nil, "OVERLAY"), "boton", opciones.letra)
  b.texto = fs
  b.conBorde = opciones.borde == true
  -- Task 31: una sola línea siempre. Antes «Mover 0 objetos» se partía en dos en el botón de 114 px.
  fs:SetWordWrap(false)
  fs:SetText(texto or "")

  local margen = 8
  local izquierda = margen
  if opciones.icono then
    local ic = b:CreateTexture(nil, "OVERLAY")
    ic:SetSize(12, 12)
    ic:SetPoint("LEFT", b, "LEFT", margen, 0)
    Tema.icono(ic, opciones.icono)
    b.icono = ic
    izquierda = margen + 12 + 4
  end
  fs:SetPoint("LEFT", b, "LEFT", izquierda, 0)
  fs:SetPoint("RIGHT", b, "RIGHT", -margen, 0)
  fs:SetJustifyH(opciones.icono and "LEFT" or "CENTER")

  b.anchoFijo = opciones.ancho
  b.espacioFijo = izquierda + margen
  -- El texto va anclado a los dos lados del botón: se mide entero (Tema.anchoTexto; B2r ronda 1).
  b:SetSize(opciones.ancho or (math.ceil(Tema.anchoTexto(fs)) + b.espacioFijo), opciones.alto or 22)

  if b.conBorde then
    b.bordes = marcoBorde(b, "borde")
  end

  function b:ponerApagado(apagado)
    self.snfApagado = apagado and true or false
    colorTexto(self.texto, self.snfApagado and "apagado" or "texto")
    if not self.conBorde then
      Tema.panel(self, self.snfApagado and "botonApagado" or "boton")
    end
    if self.bordes then
      -- Apagado, el borde baja al color del botón apagado.
      for _, tira in ipairs(self.bordes) do
        pintar(tira, self.snfApagado and "botonApagado" or "borde")
      end
    end
    if self.icono then
      pintar(self.icono, self.snfApagado and "apagado" or "texto")
    end
  end

  function b:ponerTexto(t)
    self.texto:SetText(t or "")
    if not self.anchoFijo then
      self:SetWidth(math.ceil(Tema.anchoTexto(self.texto)) + self.espacioFijo)
    end
  end

  b:ponerApagado(false)
  return b
end


---------------------------------------------------------------------------------------------------
-- Botón de icono
---------------------------------------------------------------------------------------------------

-- Un color más claro: un cuarto del camino hacia el blanco (el aclarado al pasar el ratón).
local function aclarado(token)
  local c = Tema.color(token)
  return {c[1] + (1 - c[1]) * 0.25, c[2] + (1 - c[2]) * 0.25, c[3] + (1 - c[3]) * 0.25, c[4]}
end

function Piezas.botonIcono(padre, icono, alPulsar, opciones)
  opciones = opciones or {}
  local token = opciones.color or "texto"
  local tamano = opciones.tamano or 16
  local b = botonBase(padre, alPulsar)
  b:SetSize(tamano, tamano)
  local ic = b:CreateTexture(nil, "OVERLAY")
  ic:SetAllPoints(b)
  Tema.icono(ic, icono)
  b.icono = ic

  local function repintar(encima)
    if b.snfApagado then
      pintar(ic, "apagado")
    elseif encima then
      local c = aclarado(token)
      ic:SetVertexColor(c[1], c[2], c[3], c[4])
    else
      pintar(ic, token)
    end
  end
  b:SetScript("OnEnter", proteger(function() repintar(true) end))
  b:SetScript("OnLeave", proteger(function() repintar(false) end))

  function b:ponerApagado(apagado)
    self.snfApagado = apagado and true or false
    repintar(false)
  end

  repintar(false)
  if opciones.ayuda then
    Piezas.ayuda(b, opciones.ayuda)
  end
  return b
end

---------------------------------------------------------------------------------------------------
-- Botón cuadrado
---------------------------------------------------------------------------------------------------

function Piezas.botonCuadrado(padre, icono, alPulsar, opciones)
  opciones = opciones or {}
  local token = opciones.color or "texto"
  local lado = opciones.lado or 16
  local tamanoIcono = opciones.tamanoIcono or 10
  local b = botonBase(padre, alPulsar)
  b:SetSize(lado, lado)
  b.fondo = plana(b, "BACKGROUND", -1) -- por debajo de las tiras del borde (BACKGROUND 0)
  b.fondo:SetAllPoints(b)
  pintar(b.fondo, "hundido")
  b.bordes = marcoBorde(b, "borde")
  local ic = b:CreateTexture(nil, "OVERLAY")
  ic:SetSize(tamanoIcono, tamanoIcono)
  ic:SetPoint("CENTER", b, "CENTER", 0, 0)
  Tema.icono(ic, icono)
  b.icono = ic

  -- Encima, el icono y el borde se aclaran (el mismo realce que botonIcono). Solo cambia al entrar y al salir el ratón.
  local function repintar(encima)
    local colorIcono, colorBorde
    if b.snfApagado then
      colorIcono, colorBorde = Tema.color("apagado"), Tema.color("botonApagado")
    elseif encima then
      colorIcono, colorBorde = aclarado(token), aclarado("borde")
    else
      colorIcono, colorBorde = Tema.color(token), Tema.color("borde")
    end
    ic:SetVertexColor(colorIcono[1], colorIcono[2], colorIcono[3], colorIcono[4])
    for _, tira in ipairs(b.bordes) do
      tira:SetVertexColor(colorBorde[1], colorBorde[2], colorBorde[3], colorBorde[4])
    end
  end
  b:SetScript("OnEnter", proteger(function() repintar(true) end))
  b:SetScript("OnLeave", proteger(function() repintar(false) end))

  function b:ponerApagado(apagado)
    self.snfApagado = apagado and true or false
    repintar(false)
  end

  repintar(false)
  if opciones.ayuda then
    Piezas.ayuda(b, opciones.ayuda)
  end
  return b
end

---------------------------------------------------------------------------------------------------
-- Enlace
---------------------------------------------------------------------------------------------------

function Piezas.enlace(padre, texto, alPulsar)
  local b = botonBase(padre, alPulsar)
  local fs = Tema.letra(b:CreateFontString(nil, "OVERLAY"), "texto")
  fs:SetPoint("LEFT", b, "LEFT", 0, 0)
  b.texto = fs
  fs:SetText(texto or "")
  b:SetSize(math.max(1, math.ceil(fs:GetStringWidth())), 16)

  function b:ponerApagado(apagado)
    self.snfApagado = apagado and true or false
    colorTexto(self.texto, self.snfApagado and "enlaceApagado" or "enlace")
  end

  function b:ponerTexto(nuevo)
    self.texto:SetText(nuevo or "")
    self:SetWidth(math.max(1, math.ceil(self.texto:GetStringWidth())))
  end

  b:ponerApagado(false)
  return b
end

---------------------------------------------------------------------------------------------------
-- Casilla
---------------------------------------------------------------------------------------------------

function Piezas.casilla(padre, texto, get, set)
  local b = botonBase(padre, function(self)
    if set then
      set(not (get and get()))
    end
    self:refrescar()
  end)
  local caja = CreateFrame("Frame", nil, b)
  caja:SetSize(TAMANO_MARCA, TAMANO_MARCA)
  caja:SetPoint("LEFT", b, "LEFT", 0, 0)
  b.caja = caja

  local fs = Tema.letra(b:CreateFontString(nil, "OVERLAY"), "texto")
  fs:SetPoint("LEFT", caja, "RIGHT", SEPARACION_TEXTO, 0)
  fs:SetText(texto or "")
  b.texto = fs
  b:SetSize(TAMANO_MARCA + SEPARACION_TEXTO + math.ceil(fs:GetStringWidth()), TAMANO_MARCA)

  function b:refrescar()
    self.marcada = get and get() and true or false
    -- Panel con borde y esquinas de 3 px: el relleno es amarillo si está marcada, sin tilde.
    Tema.panel(self.caja, self.marcada and "marca" or "hundido", {borde = true})
  end

  function b:ponerApagado(apagado)
    self.snfApagado = apagado and true or false
    colorTexto(self.texto, self.snfApagado and "apagado" or "texto")
  end

  b:ponerApagado(false)
  b:refrescar()
  return b
end

---------------------------------------------------------------------------------------------------
-- Radio Sí / No
---------------------------------------------------------------------------------------------------

function Piezas.radio(padre, get, set, opciones)
  opciones = opciones or {}
  local r = CreateFrame("Frame", nil, padre)
  r.snfApagado = false
  r.opciones = {}

  local function opcion(valor, etiqueta)
    local b = botonBase(r, function()
      if r.snfApagado then
        return
      end
      if set then
        set(valor)
      end
      r:refrescar()
    end)
    -- El círculo son dos iconos del atlas de 12 px: un disco (circulo) y su contorno (aro) encima.
    local disco = b:CreateTexture(nil, "ARTWORK", nil, 0)
    disco:SetSize(TAMANO_RADIO, TAMANO_RADIO)
    disco:SetPoint("LEFT", b, "LEFT", 0, 0)
    Tema.icono(disco, "circulo")
    local contorno = b:CreateTexture(nil, "ARTWORK", nil, 1)
    contorno:SetSize(TAMANO_RADIO, TAMANO_RADIO)
    contorno:SetPoint("LEFT", b, "LEFT", 0, 0)
    Tema.icono(contorno, "aro")
    b.disco, b.contorno = disco, contorno
    local fs = Tema.letra(b:CreateFontString(nil, "OVERLAY"), "texto")
    fs:SetPoint("LEFT", disco, "RIGHT", 4, 0)
    fs:SetText(etiqueta)
    b.texto = fs
    local ancho = TAMANO_RADIO + 4 + math.ceil(fs:GetStringWidth())
    b:SetSize(ancho, TAMANO_RADIO)
    b.valor = valor
    r.opciones[#r.opciones + 1] = b
    return b, ancho
  end

  local si = opcion(true, opciones.si or "Sí")
  local no = opcion(false, opciones.no or "No")
  r.si, r.no = si, no
  -- Task 34: la ayuda sale al pasar por cualquiera de los dos, a la derecha de anclaAyuda (por defecto, el radio entero).
  if opciones.ayuda then
    for _, b in ipairs({si, no}) do
      Piezas.ayuda(b, function() return opciones.ayuda() end, {ancla = opciones.anclaAyuda or r})
    end
  end

  -- Mide los dos textos y coloca el «No» 12 px detrás del «Sí».
  function r:ponerTextos(textoSi, textoNo)
    self.si.texto:SetText(textoSi or "Sí")
    self.no.texto:SetText(textoNo or "No")
    local anchoSi = TAMANO_RADIO + 4 + math.ceil(self.si.texto:GetStringWidth())
    local anchoNo = TAMANO_RADIO + 4 + math.ceil(self.no.texto:GetStringWidth())
    self.si:SetSize(anchoSi, TAMANO_RADIO)
    self.no:SetSize(anchoNo, TAMANO_RADIO)
    self.si:ClearAllPoints()
    self.si:SetPoint("LEFT", self, "LEFT", 0, 0)
    self.no:ClearAllPoints()
    self.no:SetPoint("LEFT", self, "LEFT", anchoSi + 12, 0)
    self:SetSize(anchoSi + 12 + anchoNo, TAMANO_RADIO)
  end
  r:ponerTextos(opciones.si, opciones.no)

  function r:refrescar()
    self.valor = get and get() and true or false
    for _, b in ipairs(self.opciones) do
      local elegido = b.valor == self.valor
      local apagado = self.snfApagado
      -- Task 31, como TSM: el elegido va relleno de amarillo (apagado: gris) y el otro de «radioVacio», más claro que el
      -- fondo. Los dos llevan el aro en «bordeRadio» (apagado: el color del botón apagado).
      pintar(b.disco, elegido and (apagado and "apagado" or "marca") or "radioVacio")
      pintar(b.contorno, apagado and "botonApagado" or "bordeRadio")
    end
  end

  function r:ponerApagado(apagado)
    self.snfApagado = apagado and true or false
    for _, b in ipairs(self.opciones) do
      colorTexto(b.texto, self.snfApagado and "apagado" or "texto")
    end
    self:refrescar()
  end

  r:ponerApagado(false)
  r:refrescar()
  return r
end
