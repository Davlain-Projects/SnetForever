-- SnetForever: controles propios hechos con marcos básicos (sin plantillas de Blizzard, sin UIDropDownMenu).
-- Todos devuelven el marco y guardan marco.refrescar(), que vuelve a leer el valor y el texto (por ejemplo al
-- cambiar de idioma). Un `texto` puede ser un texto o una función que lo da.
--
-- UI.texto(padre, tamano?)                          texto blanco con la fuente del estilo.
-- UI.boton(padre, texto, alPulsar)                  botón; alPulsar(boton). Su texto es boton.texto.
-- UI.botonIcono(padre, ruta, tamano, ayuda?, alPulsar?)   botón cuadrado de tamano×tamano con un icono (boton.icono,
--                                                   recortado a 0,08-0,92), fondo fondoCabecera con borde, resalte
--                                                   ButtonHilight-Square en ADD y ayuda con GameTooltip (texto o función).
-- UI.casilla(padre, texto, get, set)                casilla; set(nuevoValor).
-- UI.deslizador(padre, texto, min, max, paso, get, set)  Slider horizontal con el valor en la etiqueta.
-- UI.selector(padre, texto, opciones, get, set)     botón que despliega una lista propia; opciones = {{valor, texto}}.
--                                                   La lista (selector.lista) cuelga de UIParent, en la capa FULLSCREEN_DIALOG;
--                                                   pulsar fuera la cierra (selector.fondo) y se esconde con el selector.
local _, SNF = ...
local UI = {}
SNF.UI = UI

local Estilo = SNF.Estilo
local Texto = SNF.Texto
local TAMANOS = Estilo.TAMANOS

local ALTO_FILA = 20
local COLOR_PULGAR = {0.7, 0.7, 0.7, 1}

local function resolver(texto)
  if type(texto) == "function" then
    return texto()
  end
  return texto
end

function UI.texto(padre, tamano, role)
  local fs = padre:CreateFontString(nil, "OVERLAY")
  fs.refrescar = function()
    Estilo.fuente(fs, tamano, role)
  end
  fs.refrescar()
  local t = Estilo.COLOR_TEXTO
  fs:SetTextColor(t[1], t[2], t[3], t[4])
  return fs
end

function UI.boton(padre, texto, alPulsar, forge)
  local boton = CreateFrame("Button", nil, padre)
  boton:SetSize(90, ALTO_FILA + 2)
  boton:EnableMouse(true)
  Estilo.fondo(boton)
  if forge then Estilo.forgeTrim(boton) end
  boton.texto = UI.texto(boton, TAMANOS.paso, forge and "control")
  boton.texto:SetPoint("CENTER", boton, "CENTER", 0, 0)
  boton:SetScript("OnClick", function(self)
    if alPulsar then
      alPulsar(self)
    end
  end)
  boton.refrescar = function()
    boton.texto:SetText(resolver(texto) or "")
  end
  boton.refrescar()
  return boton
end

-- Zona de la textura que se enseña de un icono de Blizzard: sin el borde de 8 % por cada lado.
local RECORTE_ICONO = {0.08, 0.92}
local RESALTE_ICONO = "Interface\\Buttons\\ButtonHilight-Square"
local ALFA_RESALTE = 0.35
local resaltes = {} -- resaltes de los botones de icono: siguen a ventana.tema

local function pintarResalte(resalte)
  local c = Estilo.color("resalte")
  resalte:SetVertexColor(c[1], c[2], c[3], ALFA_RESALTE)
end

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "ventana.tema" then
    for _, resalte in ipairs(resaltes) do
      pintarResalte(resalte)
    end
  end
end)

function UI.botonIcono(padre, ruta, tamano, ayuda, alPulsar)
  local boton = CreateFrame("Button", nil, padre)
  boton:SetSize(tamano, tamano)
  boton:EnableMouse(true)
  Estilo.tarjeta(boton, "fondoCabecera")
  local icono = boton:CreateTexture(nil, "ARTWORK")
  icono:SetTexture(ruta)
  icono:SetPoint("TOPLEFT", boton, "TOPLEFT", 1, -1)
  icono:SetPoint("BOTTOMRIGHT", boton, "BOTTOMRIGHT", -1, 1)
  icono:SetTexCoord(RECORTE_ICONO[1], RECORTE_ICONO[2], RECORTE_ICONO[1], RECORTE_ICONO[2])
  boton.icono = icono
  boton:SetHighlightTexture(RESALTE_ICONO, "ADD")
  local resalte = boton:GetHighlightTexture()
  resalte:SetAllPoints(boton)
  pintarResalte(resalte)
  resaltes[#resaltes + 1] = resalte
  boton:SetScript("OnClick", function(self)
    if alPulsar then
      alPulsar(self)
    end
  end)
  if ayuda then
    boton:SetScript("OnEnter", function(self)
      if not GameTooltip or GameTooltip:IsForbidden() then
        return
      end
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetText(resolver(ayuda) or "")
      GameTooltip:Show()
    end)
    boton:SetScript("OnLeave", function()
      if GameTooltip and not GameTooltip:IsForbidden() then
        GameTooltip:Hide()
      end
    end)
  end
  return boton
end

function UI.casilla(padre, texto, get, set, forge)
  local casilla = CreateFrame("Button", nil, padre)
  casilla:SetSize(220, ALTO_FILA)
  casilla:EnableMouse(true)
  local caja = CreateFrame("Frame", nil, casilla)
  caja:SetSize(14, 14)
  caja:SetPoint("LEFT", casilla, "LEFT", 0, 0)
  Estilo.fondo(caja)
  local marca = caja:CreateTexture(nil, "OVERLAY")
  marca:SetTexture("Interface\\Buttons\\UI-CheckBox-Check")
  marca:SetAllPoints(caja)
  if forge then
    Estilo.forgeTrim(caja)
    marca:SetVertexColor(0.94, 0.65, 0.39, 1)
  end
  casilla.marca = marca
  casilla.texto = UI.texto(casilla, TAMANOS.lista, forge and "control")
  casilla.texto:SetPoint("LEFT", caja, "RIGHT", 6, 0)
  casilla.refrescar = function()
    marca:SetShown(get() and true or false)
    casilla.texto:SetText(resolver(texto) or "")
  end
  casilla:SetScript("OnClick", function()
    set(not get())
    casilla.refrescar()
  end)
  casilla.refrescar()
  return casilla
end

-- Cifras decimales que hacen falta para enseñar los valores de un deslizador con ese paso.
local function decimalesDe(paso)
  if paso % 1 == 0 then
    return nil
  end
  if math.abs(paso * 10 - math.floor(paso * 10 + 0.5)) < 1e-9 then
    return 1
  end
  return 2
end

function UI.deslizador(padre, texto, min, max, paso, get, set, forge)
  local d = CreateFrame("Slider", nil, padre)
  d:SetOrientation("HORIZONTAL")
  d:SetSize(180, 12)
  d:EnableMouse(true)
  Estilo.fondo(d)
  local pulgar = d:CreateTexture(nil, "OVERLAY")
  if forge then
    for x = 12, 168, 12 do
      local tick = d:CreateTexture(nil, "ARTWORK")
      tick:SetTexture(Estilo.TEXTURA)
      tick:SetSize(1, x % 24 == 0 and 5 or 3)
      tick:SetPoint("BOTTOMLEFT", d, "BOTTOMLEFT", x, 1)
      tick:SetVertexColor(0.68, 0.41, 0.24, 1)
    end
    pulgar:SetTexture(Estilo.FORGE_CONTROLS)
    pulgar:SetTexCoord(0, 0.5, 0, 1)
    pulgar:SetSize(13, 13)
  else
    pulgar:SetTexture(Estilo.TEXTURA)
    pulgar:SetVertexColor(COLOR_PULGAR[1], COLOR_PULGAR[2], COLOR_PULGAR[3], COLOR_PULGAR[4])
    pulgar:SetSize(6, 16)
  end
  d:SetThumbTexture(pulgar)
  d:SetMinMaxValues(min, max)
  d:SetValueStep(paso)
  d.etiqueta = UI.texto(d, TAMANOS.lista, forge and "control")
  d.etiqueta:SetPoint("BOTTOMLEFT", d, "TOPLEFT", 0, 4)
  local decimales = decimalesDe(paso)

  local function ponerEtiqueta()
    d.etiqueta:SetText((resolver(texto) or "") .. ": " .. Texto.numero(d:GetValue(), decimales))
  end

  d.ajustando = false
  d:SetScript("OnValueChanged", function(_, valor)
    ponerEtiqueta()
    if not d.ajustando then
      set(valor)
    end
  end)
  d.refrescar = function()
    d.ajustando = true
    d:SetValue(get())
    d.ajustando = false
    ponerEtiqueta()
  end
  d.refrescar()
  return d
end

function UI.selector(padre, texto, opciones, get, set, forge)
  local selector = CreateFrame("Button", nil, padre)
  local width = 180
  selector:SetSize(width, ALTO_FILA + 2)
  selector:EnableMouse(true)
  Estilo.fondo(selector)
  selector.texto = UI.texto(selector, TAMANOS.lista, forge and "control")
  if forge then
    Estilo.forgeTrim(selector)
    selector.texto:SetSize(width - 28, ALTO_FILA)
    selector.texto:SetPoint("LEFT", selector, "LEFT", 6, 0)
    selector.texto:SetJustifyH("LEFT")
    selector.texto:SetJustifyV("MIDDLE")
    selector.texto:SetWordWrap(false)
    local marker = selector:CreateTexture(nil, "ARTWORK")
    marker:SetTexture(Estilo.FORGE_CONTROLS)
    marker:SetTexCoord(0.5, 1, 0, 1)
    marker:SetSize(13, 13)
    marker:SetPoint("RIGHT", selector, "RIGHT", -4, 0)
  else
    selector.texto:SetPoint("LEFT", selector, "LEFT", 6, 0)
  end

  -- La lista cuelga de UIParent y no del selector: así no la recorta un ScrollFrame (el panel de ajustes) ni cambia con
  -- su escala. Se esconde con el selector.
  local lista = CreateFrame("Frame", nil, UIParent)
  lista:SetFrameStrata("FULLSCREEN_DIALOG")
  lista:SetPoint("TOPLEFT", selector, "BOTTOMLEFT", 0, -2)
  lista:SetSize(180, #opciones * ALTO_FILA + 2)
  lista:EnableMouse(true)
  Estilo.fondo(lista)
  if forge then Estilo.forgeTrim(lista) end
  lista:Hide()
  selector.lista = lista

  -- Pulsar fuera cierra la lista: un fondo invisible que cubre la pantalla, justo por debajo de la lista.
  local fondo = CreateFrame("Frame", nil, UIParent)
  fondo:SetAllPoints(UIParent)
  fondo:SetFrameStrata("FULLSCREEN")
  fondo:EnableMouse(true)
  fondo:Hide()
  fondo:SetScript("OnMouseDown", function()
    lista:Hide()
  end)
  selector.fondo = fondo
  lista:SetScript("OnShow", function()
    lista:SetScale(selector:GetEffectiveScale() / UIParent:GetEffectiveScale())
    fondo:Show()
  end)
  lista:SetScript("OnHide", function()
    fondo:Hide()
  end)
  selector:SetScript("OnHide", function()
    lista:Hide()
  end)

  selector.filas = {}
  for k, opcion in ipairs(opciones) do
    local fila = UI.boton(lista, opcion.texto, function()
      set(opcion.valor)
      lista:Hide()
      selector.refrescar()
    end, forge)
    fila:SetSize(178, ALTO_FILA)
    fila:SetPoint("TOPLEFT", lista, "TOPLEFT", 1, -1 - (k - 1) * ALTO_FILA)
    selector.filas[k] = fila
  end

  selector.refrescar = function()
    local actual = get()
    local nombre = ""
    for _, opcion in ipairs(opciones) do
      if opcion.valor == actual then
        nombre = resolver(opcion.texto) or ""
      end
    end
    selector.texto:SetText((resolver(texto) or "") .. ": " .. nombre)
    for _, fila in ipairs(selector.filas) do
      fila.refrescar()
    end
  end
  selector:SetScript("OnClick", function()
    lista:SetShown(not lista:IsShown())
  end)
  selector.refrescar()
  return selector
end
