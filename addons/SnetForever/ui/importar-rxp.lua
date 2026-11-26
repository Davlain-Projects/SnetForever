-- SnetForever: la ventana «Importar guías RXP» (selector de guías → «Mis guías: importar de RestedXP…», o
-- /snet importar). El trabajo lo hace motor/importar-rxp.lua; aquí solo se pega, se enseña y se confirma.
--
-- Pegar una parte (Ctrl+V en el cuadro) la lee al momento y vacía el cuadro: el texto pegado no se queda en pantalla.
-- Con todas las partes, la ventana comprueba el paquete y enseña su resumen. Nada se guarda hasta pulsar «Importar».
-- Debajo, los paquetes que ya tiene el personaje, cada uno con «Quitar».
--
-- ImportarRXPVentana.abrir()
-- ImportarRXPVentana.pegar(texto)     lo que hace el cuadro al pegar (también para las pruebas)
-- ImportarRXPVentana.importar()       el botón «Importar»
-- ImportarRXPVentana.marcos = {dialogo}
local _, SNF = ...
local VentanaRXP = {}
SNF.ImportarRXPVentana = VentanaRXP

local L = SNF.L
local Estilo = SNF.Estilo
local UI = SNF.UI
local ImportarRXP = SNF.ImportarRXP

local NOMBRE = "SnetForeverImportarRXP"
local ANCHO, ALTO = 460, 360
local MAX_FILAS = 4
local COLOR_ERROR = {1, 0.45, 0.35, 1}

local dialogo
local aviso = nil -- {clave, ...}: lo último que pasó (error al pegar o importación hecha)
local pagina = 1

VentanaRXP.marcos = {}

local function texto(t)
  return L.t(t[1], t[2], t[3], t[4], t[5])
end

local function lineasDeEstado()
  local e = ImportarRXP.estado()
  local lineas, esError = {}, false
  if e.fase == "vacio" then
    lineas[1] = L.t("IMPORTAR_RXP_ESPERA")
  elseif e.fase == "partes" then
    local faltan = {}
    for i, k in ipairs(e.faltan) do
      faltan[i] = tostring(k)
    end
    lineas[1] = #faltan > 0 and L.t("IMPORTAR_RXP_PARTES", e.id, e.recibidas, e.total, table.concat(faltan, ", "))
      or L.t("IMPORTAR_RXP_COMPROBANDO", e.id)
  elseif e.fase == "comprobando" then
    lineas[1] = L.t("IMPORTAR_RXP_COMPROBANDO", e.id)
  elseif e.fase == "listo" then
    local r = e.resumen
    lineas[#lineas + 1] = L.t("IMPORTAR_RXP_LISTO", e.id, r.guias, r.pasos)
    if r.sustituye > 0 then
      lineas[#lineas + 1] = L.t("IMPORTAR_RXP_SUSTITUYE", r.sustituye)
    end
    if r.delAddon > 0 then
      lineas[#lineas + 1] = L.t("IMPORTAR_RXP_DEL_ADDON", r.delAddon)
    end
    if r.faltanTexto then
      lineas[#lineas + 1] = L.t("IMPORTAR_RXP_FALTAN", #r.faltan, r.faltanTexto)
    end
    if r.desconocidosTexto then
      lineas[#lineas + 1] = L.t("IMPORTAR_RXP_DESCONOCIDOS", r.desconocidosTexto)
    end
    lineas[#lineas + 1] = L.t("IMPORTAR_RXP_CONFIRMAR")
  elseif e.fase == "error" then
    lineas[1] = L.t("IMPORTAR_RXP_NADA", texto(e.error))
    esError = true
  end
  if aviso then
    table.insert(lineas, 1, texto(aviso))
    esError = esError or aviso.error == true
  end
  return table.concat(lineas, "\n"), esError
end

local function refrescar()
  if not dialogo then
    return
  end
  local d = dialogo
  d.titulo:SetText(L.t("IMPORTAR_RXP_TITULO"))
  d.ayuda:SetText(L.t("IMPORTAR_RXP_AYUDA"))
  local estado, esError = lineasDeEstado()
  d.estado:SetText(estado)
  local c = esError and COLOR_ERROR or Estilo.color("texto")
  d.estado:SetTextColor(c[1], c[2], c[3], c[4])
  local listo = ImportarRXP.estado().fase == "listo"
  d.botonImportar.refrescar()
  local ci = listo and Estilo.color("texto") or Estilo.color("secundario")
  d.botonImportar.texto:SetTextColor(ci[1], ci[2], ci[3], ci[4])
  d.botonCerrar.refrescar()
  local paquetes = ImportarRXP.paquetes()
  d.tituloGuardados:SetText(#paquetes > 0 and L.t("IMPORTAR_RXP_GUARDADOS", #paquetes) or L.t("IMPORTAR_RXP_SIN_GUARDADOS"))
  local totalPaginas = math.max(1, math.ceil(#paquetes / MAX_FILAS))
  pagina = math.max(1, math.min(pagina, totalPaginas))
  d.pagina:SetText(string.format("%d/%d", pagina, totalPaginas))
  d.pagina:SetShown(totalPaginas > 1)
  d.anterior:SetShown(pagina > 1)
  d.siguiente:SetShown(pagina < totalPaginas)
  local desplazamiento = (pagina - 1) * MAX_FILAS
  for i, fila in ipairs(d.filas) do
    local p = paquetes[#paquetes - desplazamiento - i + 1] -- el más reciente arriba
    if p then
      fila.id = p.id
      fila.texto:SetText(L.t("IMPORTAR_RXP_FILA", p.id, p.guias or 0, p.pasos or 0,
        p.cuando and date("%d/%m %H:%M", p.cuando) or "?"))
      fila:Show()
    else
      fila.id = nil
      fila:Hide()
    end
  end
end

function VentanaRXP.pegar(contenido)
  aviso = nil
  local estado, err = ImportarRXP.recibir(contenido)
  if not estado then
    aviso = {err[1], err[2], err[3], err[4], err[5], error = true}
  elseif estado.recibidas == estado.total and estado.fase == "partes" then
    ImportarRXP.comprobar(refrescar)
  end
  refrescar()
end

function VentanaRXP.importar()
  local resumen, err = ImportarRXP.confirmar()
  if not resumen then
    aviso = {err[1], err[2], err[3], err[4], err[5], error = true}
  else
    pagina = 1
    aviso = {"IMPORTAR_RXP_HECHO", resumen.guias, resumen.pasos}
    print(L.t("IMPORTAR_RXP_HECHO", resumen.guias, resumen.pasos))
    if SNF.Ventana and SNF.Ventana.pintar then
      SNF.Ventana.pintar()
    end
  end
  refrescar()
end

local function cerrar()
  if dialogo then
    dialogo:Hide()
  end
end

local function crear()
  local d = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(d, NOMBRE, true)
  d:SetSize(ANCHO, ALTO)
  d:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  d:SetFrameStrata("DIALOG")
  d:SetToplevel(true)
  d:EnableMouse(true)
  Estilo.fondo(d)
  local ancho = ANCHO - 24
  local gris = Estilo.COLOR_SECUNDARIO

  d.titulo = UI.texto(d, Estilo.TAMANOS.titulo)
  d.titulo:SetPoint("TOPLEFT", d, "TOPLEFT", 12, -10)

  d.ayuda = UI.texto(d, Estilo.TAMANOS.pequeno)
  d.ayuda:SetPoint("TOPLEFT", d.titulo, "BOTTOMLEFT", 0, -6)
  d.ayuda:SetWidth(ancho)
  d.ayuda:SetJustifyH("LEFT")
  d.ayuda:SetTextColor(gris[1], gris[2], gris[3], gris[4])

  local marcoTexto = CreateFrame("Frame", nil, d)
  marcoTexto:SetPoint("TOPLEFT", d, "TOPLEFT", 12, -78)
  marcoTexto:SetSize(ancho, 44)
  Estilo.fondo(marcoTexto)
  local caja = CreateFrame("EditBox", nil, marcoTexto)
  caja:SetMultiLine(true)
  caja:SetMaxLetters(100128) -- hasta 100 000 caracteres de contenido más la cabecera
  caja:SetAutoFocus(false)
  Estilo.fuente(caja, Estilo.TAMANOS.pequeno)
  caja:SetTextColor(1, 1, 1, 1)
  caja:SetPoint("TOPLEFT", marcoTexto, "TOPLEFT", 6, -6)
  caja:SetPoint("BOTTOMRIGHT", marcoTexto, "BOTTOMRIGHT", -6, 6)
  caja:SetWidth(ancho - 12)
  caja:SetScript("OnEscapePressed", cerrar)
  -- Solo lo que escribe o pega el jugador; el SetText("") de después no vuelve a entrar (userInput = false).
  caja:SetScript("OnTextChanged", function(self, userInput)
    if not userInput then
      return
    end
    local pegado = self:GetText()
    if #pegado >= 16 then
      self:SetText("")
      VentanaRXP.pegar(pegado)
    end
  end)
  d.caja = caja

  d.estado = UI.texto(d, Estilo.TAMANOS.lista)
  d.estado:SetPoint("TOPLEFT", marcoTexto, "BOTTOMLEFT", 0, -8)
  d.estado:SetWidth(ancho)
  d.estado:SetJustifyH("LEFT")
  d.estado:SetJustifyV("TOP")

  d.tituloGuardados = UI.texto(d, Estilo.TAMANOS.lista)
  d.tituloGuardados:SetPoint("BOTTOMLEFT", d, "BOTTOMLEFT", 12, 44 + MAX_FILAS * 20)
  d.tituloGuardados:SetTextColor(gris[1], gris[2], gris[3], gris[4])
  d.siguiente = UI.boton(d, function() return ">" end, function()
    pagina = pagina + 1
    refrescar()
  end)
  d.siguiente:SetSize(22, 18)
  d.siguiente:SetPoint("RIGHT", d, "RIGHT", -12, 0)
  d.siguiente:SetPoint("TOP", d.tituloGuardados, "TOP", 0, 2)
  d.pagina = UI.texto(d, Estilo.TAMANOS.pequeno)
  d.pagina:SetPoint("RIGHT", d.siguiente, "LEFT", -4, 0)
  d.anterior = UI.boton(d, function() return "<" end, function()
    pagina = pagina - 1
    refrescar()
  end)
  d.anterior:SetSize(22, 18)
  d.anterior:SetPoint("RIGHT", d.pagina, "LEFT", -4, 0)
  d.filas = {}
  for i = 1, MAX_FILAS do
    local fila = CreateFrame("Frame", nil, d)
    fila:SetSize(ancho, 18)
    fila:SetPoint("BOTTOMLEFT", d, "BOTTOMLEFT", 12, 44 + (MAX_FILAS - i) * 20)
    fila.texto = UI.texto(fila, Estilo.TAMANOS.pequeno)
    fila.texto:SetPoint("LEFT", fila, "LEFT", 0, 0)
    fila.texto:SetWidth(ancho - 80)
    fila.texto:SetJustifyH("LEFT")
    fila.quitar = UI.boton(fila, function()
      return L.t("IMPORTAR_RXP_QUITAR")
    end, function()
      if fila.id and ImportarRXP.quitar(fila.id) then
        aviso = {"IMPORTAR_RXP_QUITADO", fila.id}
        if SNF.Ventana and SNF.Ventana.pintar then
          SNF.Ventana.pintar()
        end
      end
      refrescar()
    end)
    fila.quitar:SetSize(72, 18)
    fila.quitar:SetPoint("RIGHT", fila, "RIGHT", 0, 0)
    fila:Hide()
    d.filas[i] = fila
  end

  d.botonImportar = UI.boton(d, function()
    return L.t("IMPORTAR_RXP_IMPORTAR")
  end, VentanaRXP.importar)
  d.botonImportar:SetPoint("BOTTOMRIGHT", d, "BOTTOMRIGHT", -12, 12)
  d.botonCerrar = UI.boton(d, function()
    return L.t("IMPORTAR_RXP_CERRAR")
  end, cerrar)
  d.botonCerrar:SetPoint("RIGHT", d.botonImportar, "LEFT", -6, 0)

  d:SetScript("OnHide", function()
    caja:ClearFocus()
  end)
  d:Hide()
  table.insert(UISpecialFrames, NOMBRE)
  VentanaRXP.marcos.dialogo = d
  return d
end

function VentanaRXP.abrir()
  if not dialogo then
    dialogo = crear()
  end
  aviso = nil
  pagina = 1
  refrescar()
  dialogo:Show()
  dialogo.caja:SetFocus()
end

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "idioma" and dialogo and dialogo:IsShown() then
    refrescar()
  end
end)
