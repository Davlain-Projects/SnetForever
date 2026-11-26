-- SnetForever: «Avisar de un fallo» (O12). Un diálogo propio con un cuadro de texto de varias líneas. Al guardar,
-- el aviso queda en SnetForeverCuenta.fallos para que la app lo recoja y el autor lo corrija en la siguiente versión.
--
-- Fallo.abrir(i?)        abre el diálogo SnetForeverFallo para el paso i del motor (por defecto el actual).
-- Fallo.guardar(texto)   guarda el aviso y devuelve true; con el texto vacío o solo espacios no guarda y da false.
--                        Cierra el diálogo y escribe en el chat (solo para el jugador) «Aviso guardado. Gracias».
--
-- Cada aviso: {fecha, personaje, nivel, raza, clase, faccion, guia, paso, n, addon, datos, texto, pos}. `guia` es la
-- clave de la guía cargada, `paso` el id del paso, `n` su número en la guía y `pos` = {mapa, x, y} con dos
-- decimales (nil dentro de instancias). `texto` lleva 500 caracteres como mucho.
--
-- Lote C (revisión 52, Minor 13): como mucho Fallo.MAX_AVISOS (200) avisos, porque hasta la fase 5 nadie los recoge. Al
-- llegar al tope se avisa una vez en el chat (FALLO_TOPE; SnetForeverCuenta.falloTopeAvisado lo recuerda hasta que vuelva a
-- haber sitio) sin perder nada; a partir del aviso nuevo siguiente, cada uno descarta solo el más viejo
-- (SnetForeverCuenta.fallosDescartados los cuenta). Ronda 1: quien ya tenía más de 200 los pierde de uno en uno, nunca de
-- golpe, y siempre después del aviso.
local _, SNF = ...
local Fallo = {}
SNF.Fallo = Fallo

local L = SNF.L
local U = SNF.U
local Estilo = SNF.Estilo
local UI = SNF.UI
local Motor = SNF.Motor
local Datos = SNF.Datos
local Personaje = SNF.Personaje
local Texto = SNF.Texto

local MAX_LETRAS = 500
Fallo.MAX_AVISOS = 200
local NOMBRE = "SnetForeverFallo"

local dialogo

-- Los primeros n caracteres UTF-8 de texto (un carácter son varios bytes: los de continuación valen 0x80-0xBF).
local function primeros(texto, n)
  local cuenta = 0
  for i = 1, #texto do
    local byte = string.byte(texto, i)
    if byte < 128 or byte >= 192 then
      cuenta = cuenta + 1
      if cuenta > n then
        return string.sub(texto, 1, i - 1)
      end
    end
  end
  return texto
end

local function contar(texto)
  local cuenta = 0
  for i = 1, #texto do
    local byte = string.byte(texto, i)
    if byte < 128 or byte >= 192 then
      cuenta = cuenta + 1
    end
  end
  return cuenta
end

-- {mapa, x, y} del jugador con dos decimales, o nil dentro de instancias o si el juego no da la posición.
local function posicion()
  if IsInInstance() then
    return nil
  end
  local mapa = C_Map.GetBestMapForUnit("player")
  if not mapa then
    return nil
  end
  local vector = C_Map.GetPlayerMapPosition(mapa, "player")
  if not vector then
    return nil
  end
  local x, y = vector:GetXY()
  return {mapa = mapa, x = U.redondear(x * 100, 2), y = U.redondear(y * 100, 2)}
end

local function cerrar()
  if dialogo then
    dialogo:Hide()
  end
end

function Fallo.guardar(texto)
  if type(texto) ~= "string" then
    return false
  end
  texto = strtrim(texto)
  if texto == "" then
    return false
  end
  texto = primeros(texto, MAX_LETRAS)

  SNF.Guardado.preparar()
  local estado = Motor.estado()
  local i = dialogo and dialogo.objetivo or estado.actual
  local pv = i and Motor.paso(i) or nil
  local pj = Personaje.leer()
  table.insert(SnetForeverCuenta.fallos, {
    fecha = date("%Y-%m-%d %H:%M"),
    personaje = Personaje.clave(),
    nivel = pj.nivel,
    raza = pj.raza,
    clase = pj.clase,
    faccion = pj.faccion,
    guia = estado.clave,
    paso = pv and pv.id or nil,
    n = pv and pv.n or nil,
    addon = SNF.VERSION,
    datos = Datos.versiones(),
    texto = texto,
    pos = posicion(),
  })
  local fallos = SnetForeverCuenta.fallos
  if #fallos < Fallo.MAX_AVISOS then
    SnetForeverCuenta.falloTopeAvisado = nil
  elseif not SnetForeverCuenta.falloTopeAvisado then
    -- Ronda 1: el aviso sale antes de perder nada (también con más de 200 de antes del tope).
    SnetForeverCuenta.falloTopeAvisado = true
    print(L.t("FALLO_TOPE", Fallo.MAX_AVISOS))
  elseif #fallos > Fallo.MAX_AVISOS then
    -- Ya avisado: este aviso nuevo descarta solo el más viejo (nunca todos los que sobran de golpe).
    table.remove(fallos, 1)
    SnetForeverCuenta.fallosDescartados = (tonumber(SnetForeverCuenta.fallosDescartados) or 0) + 1
  end

  cerrar()
  print(L.t("FALLO_GUARDADO"))
  return true
end

local function crear()
  local d = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(d, NOMBRE, true)
  d:SetSize(380, 240)
  d:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  d:SetFrameStrata("DIALOG") -- por encima del panel (HIGH) y de los marcos de otros addons
  d:SetToplevel(true)
  d:EnableMouse(true)
  Estilo.fondo(d)

  d.titulo = UI.texto(d, Estilo.TAMANOS.titulo)
  d.titulo:SetPoint("TOPLEFT", d, "TOPLEFT", 12, -10)

  local gris = Estilo.COLOR_SECUNDARIO
  d.etiquetaPaso = UI.texto(d, Estilo.TAMANOS.lista)
  d.etiquetaPaso:SetPoint("TOPLEFT", d.titulo, "BOTTOMLEFT", 0, -6)
  d.etiquetaPaso:SetWidth(356)
  d.etiquetaPaso:SetJustifyH("LEFT")
  d.etiquetaPaso:SetTextColor(gris[1], gris[2], gris[3], gris[4])

  d.ayuda = UI.texto(d, Estilo.TAMANOS.pequeno)
  d.ayuda:SetPoint("TOPLEFT", d.etiquetaPaso, "BOTTOMLEFT", 0, -6)
  d.ayuda:SetWidth(356)
  d.ayuda:SetJustifyH("LEFT")
  d.ayuda:SetTextColor(gris[1], gris[2], gris[3], gris[4])

  local marcoTexto = CreateFrame("Frame", nil, d)
  marcoTexto:SetPoint("TOPLEFT", d, "TOPLEFT", 12, -84)
  marcoTexto:SetPoint("BOTTOMRIGHT", d, "BOTTOMRIGHT", -12, 44)
  Estilo.fondo(marcoTexto)

  local caja = CreateFrame("EditBox", nil, marcoTexto)
  caja:SetMultiLine(true)
  caja:SetMaxLetters(MAX_LETRAS)
  caja:SetAutoFocus(false)
  Estilo.fuente(caja, Estilo.TAMANOS.paso)
  caja:SetTextColor(1, 1, 1, 1)
  caja:SetPoint("TOPLEFT", marcoTexto, "TOPLEFT", 6, -6)
  caja:SetPoint("BOTTOMRIGHT", marcoTexto, "BOTTOMRIGHT", -6, 6)
  caja:SetWidth(332)
  caja:SetScript("OnEscapePressed", cerrar)
  d.caja = caja

  d.contador = UI.texto(d, Estilo.TAMANOS.pequeno)
  d.contador:SetPoint("BOTTOMLEFT", d, "BOTTOMLEFT", 12, 18)
  d.contador:SetTextColor(gris[1], gris[2], gris[3], gris[4])
  local function contarLetras()
    d.contador:SetText(string.format("%d/%d", contar(caja:GetText()), MAX_LETRAS))
  end
  caja:SetScript("OnTextChanged", contarLetras)
  d.contarLetras = contarLetras

  d.botonGuardar = UI.boton(d, function()
    return L.t("FALLO_GUARDAR")
  end, function()
    Fallo.guardar(caja:GetText())
  end)
  d.botonGuardar:SetPoint("BOTTOMRIGHT", d, "BOTTOMRIGHT", -12, 12)

  d.botonCancelar = UI.boton(d, function()
    return L.t("FALLO_CANCELAR")
  end, cerrar)
  d.botonCancelar:SetPoint("RIGHT", d.botonGuardar, "LEFT", -6, 0)

  d:SetScript("OnHide", function()
    d.objetivo = nil
    caja:ClearFocus()
  end)

  d.refrescar = function()
    d.titulo:SetText(L.t("FALLO_TITULO"))
    d.ayuda:SetText(L.t("FALLO_AYUDA"))
    local pv = d.objetivo and Motor.paso(d.objetivo) or nil
    if pv then
      -- El número de la lista de la ventana (lote C, 52-M8); un paso que no sale en ella, sin número.
      local resumen = Texto.resumenPaso(pv)
      d.etiquetaPaso:SetText(pv.numero and L.t("FALLO_PASO", pv.numero, resumen) or L.t("FALLO_PASO_SIN_NUMERO", resumen))
    else
      d.etiquetaPaso:SetText(L.t("FALLO_SIN_PASO"))
    end
    d.botonGuardar.refrescar()
    d.botonCancelar.refrescar()
    contarLetras()
  end

  d:Hide()
  table.insert(UISpecialFrames, NOMBRE)
  return d
end

function Fallo.abrir(i)
  if not dialogo then
    dialogo = crear()
  end
  dialogo.objetivo = i or Motor.estado().actual
  dialogo.caja:SetText("")
  dialogo.refrescar()
  dialogo:Show()
  dialogo.caja:SetFocus()
end
