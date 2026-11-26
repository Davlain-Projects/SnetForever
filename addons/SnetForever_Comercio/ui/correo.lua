-- SnetForever: ventana «Correo» (plan de paridad con TSM, fase 4). Enseña lo que SNF.Correo calcula: por objeto de las
-- bolsas y operación, el destinatario guardado (solo si es un personaje tuyo), lo que se puede enviar, la reserva que se
-- queda, lo que se enviaría y, si no, por qué; en la otra pestaña, lo que recibiría cada destinatario. SOLO DE LECTURA: no
-- tiene botón de enviar, no adjunta, no escribe en el formulario del buzón y no toca el oro (el §4 del diseño deja los
-- objetos en manos del jugador; lo que faltaría está en docs/comercio/correo.md).
--
-- Se abre y se cierra con «/snet c correo» (o «/snet trade mailing»); Escape la cierra. No necesita el buzón abierto.
--
-- Sin parpadeos, como Artesanía: la tabla solo se vuelve a poner cuando la vista cambia de verdad (la huella de SNF.Correo)
-- y los cambios de bolsas, banco y buzón se juntan en uno (0,3 s después del último). En combate no se recalcula.
--
-- SNF.UICorreo: .abrir(), .cerrar(), .alternar(), .estaAbierta(), .refrescar(forzar), .motivo(linea), .destinatario(linea),
-- .columnas("enviar" | "destinatarios"),
-- .marco (nil hasta la primera vez; .titulo, .ayuda, .pestanas, .desplegable, .estado, .tablas = {enviar, destinatarios},
-- .botonActualizar, .botonCerrar), .vista (la que se ve).
local SNF = SnetForever
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local UI = {}
SNF.UICorreo = UI

local NOMBRE = "SnetForeverCorreo"
local ANCHO, ALTO = 1120, 500
local MARGEN = 12
local ESPERA = 0.3
local MODOS = {"enviar", "destinatarios"}
local TEXTO_MODO = {enviar = "MAIL_TAB_SEND", destinatarios = "MAIL_TAB_TARGETS"}

local marco
local modo = "enviar"
local grupo = nil -- nil = todos los grupos con Correo
local pendiente = false

local function nombreGrupo(ruta)
  return (string.gsub(ruta, "`", " › "))
end

local FUENTES = {banco = "CRAFT_SOURCE_BANK", correo = "CRAFT_SOURCE_MAIL", subastas = "CRAFT_SOURCE_AUCTIONS",
  subastasAlters = "MAIL_SOURCE_TARGET_AUCTIONS", hermandad = "CRAFT_SOURCE_GUILD", bolsas = "CRAFT_SOURCE_BAGS",
  personaje = "MAIL_SOURCE_CHARACTER", destinatario = "MAIL_SOURCE_TARGET"}

local function fuentes(lista)
  local salida = {}
  for i, f in ipairs(lista or {}) do
    salida[i] = FUENTES[f] and L.t(FUENTES[f]) or f
  end
  return table.concat(salida, ", ")
end

local CAMPOS = {conservar = "MAIL_FIELD_KEEP", cantidadMaxima = "MAIL_FIELD_MAX"}

local MOTIVOS = {
  ignorada = "MAIL_REASON_IGNORED", sin_destinatario = "MAIL_REASON_NO_TARGET", no_propio = "MAIL_REASON_NOT_OWN",
  otro_reino = "MAIL_REASON_OTHER_REALM", repuesto = "MAIL_REASON_RESTOCKED", para_ti = "MAIL_REASON_FOR_YOU",
  sin_disponible = "MAIL_REASON_NONE_LEFT", ligado = "MAIL_REASON_BOUND", ligado_desconocido = "MAIL_REASON_BOUND_UNKNOWN",
  variante = "WAREHOUSE_REASON_VARIANT", solo_variantes = "MAIL_REASON_ONLY_VARIANTS", existencias = "VENDOR_REASON_STOCK",
  variante_desconocida = "MAIL_REASON_VARIANT_UNKNOWN",
}

function UI.destinatario(l)
  if l.destino == "yo" then
    return L.t("MAIL_TARGET_YOU")
  elseif l.destino == "propio" then
    return l.destinatario
  elseif l.destino == "ajeno" or l.destino == "otro_reino" then
    return L.t("MAIL_TARGET_HIDDEN")
  elseif l.destino == "vacio" then
    return "—"
  end
  return nil
end

function UI.motivo(l)
  local texto
  if l.estado == "enviar" then
    texto = L.t("MAIL_REASON_SEND")
    if l.tope then
      texto = texto .. " · " .. L.t(l.aprox and "MAIL_REASON_UNSEEN" or "CRAFT_REASON_AT_MOST", fuentes(l.sinContar))
    end
  elseif l.motivo == "formula" then
    local campo = l.detalle and string.match(l.detalle, "· (%w+)$")
    texto = L.t("MAIL_REASON_FORMULA", campo and CAMPOS[campo] and L.t(CAMPOS[campo]) or tostring(l.detalle))
  elseif l.motivo == "destino_sin_ver" then
    texto = L.t("MAIL_REASON_SELF_UNSEEN", fuentes(l.sinContar))
  elseif l.motivo == "para_ti" and l.reserva and l.reserva > 0 then
    texto = L.t("MAIL_REASON_FOR_YOU_KEEP", l.reserva)
  elseif l.motivo == "existencias" then
    texto = L.t("VENDOR_REASON_STOCK", fuentes({l.detalle}))
  elseif l.motivo == "no_propio" or l.motivo == "otro_reino" then
    texto = L.t(MOTIVOS[l.motivo])
    if (l.enviar or 0) > 0 then
      texto = texto .. " · " .. L.t("MAIL_REASON_TSM_WOULD", l.enviar)
    end
    if l.estado == "incierta" then
      texto = texto .. " · " .. L.t("MAIL_REASON_TARGET_STOCK")
    end
  else
    local clave = MOTIVOS[l.motivo]
    texto = clave and L.t(clave, tostring(l.detalle or "?")) or (l.motivo or "")
  end
  if l.aprox and l.dependeDe then
    texto = texto .. " · " .. L.t("MAIL_REASON_DEPENDS", l.dependeDe)
  end
  return texto
end

local COLOR_ESTADO = {enviar = "acento", reserva = "texto", nada = "apagado", apartada = "apagado", incierta = "error"}

local function pintarEstado(celda, l)
  Piezas.interno.colorTexto(celda.texto, COLOR_ESTADO[l.estado] or "texto")
end

local function marcado(l, n)
  if n == nil then
    return nil
  end
  if l.aprox then return "≈" .. n end
  if l.tope then return "≤" .. n end
  return n
end

local function columnasEnviar()
  return {
    {clave = "grupo", titulo = L.t("WAREHOUSE_COL_GROUP"), flex = 0.8, valor = function(l) return nombreGrupo(l.ruta) end},
    {clave = "objeto", titulo = L.t("WAREHOUSE_COL_ITEM"), flex = 1,
      valor = function(l) return l.nombre or (l.item and L.t("WAREHOUSE_ITEM", l.item)) or l.clave end},
    {clave = "operacion", titulo = L.t("CRAFT_COL_OPERATION"), flex = 0.7, valor = function(l) return l.operacion end},
    {clave = "destinatario", titulo = L.t("MAIL_COL_TARGET"), flex = 0.8, valor = UI.destinatario},
    {clave = "disponible", titulo = L.t("MAIL_COL_AVAILABLE"), ancho = 70, justificado = "RIGHT",
      valor = function(l) return l.disponible ~= nil and marcado({aprox = l.aprox}, math.max(l.disponible, 0)) or nil end},
    {clave = "reserva", titulo = L.t("MAIL_COL_KEEP"), ancho = 64, justificado = "RIGHT",
      valor = function(l) return l.conservar ~= nil and l.reservaTotal or nil end},
    {clave = "enDestino", titulo = L.t("MAIL_COL_TARGET_HAS"), ancho = 70, justificado = "RIGHT",
      valor = function(l)
        if l.enDestino == nil or not l.reponer then return nil end
        return #(l.sinContar or {}) > 0 and ("≥" .. l.enDestino) or l.enDestino
      end},
    {clave = "enviar", titulo = L.t("MAIL_COL_SEND"), ancho = 64, justificado = "RIGHT", pintar = pintarEstado,
      valor = function(l)
        if l.estado == "enviar" then return marcado(l, l.enviar) end
        if l.estado == "reserva" then return "(" .. l.reserva .. ")" end
        return l.estado == "incierta" and "?" or nil
      end},
    {clave = "motivo", titulo = L.t("WAREHOUSE_COL_REASON"), flex = 2.3, valor = UI.motivo, pintar = pintarEstado},
  }
end

local function columnasDestinatarios()
  return {
    {clave = "nombre", titulo = L.t("MAIL_COL_TARGET"), flex = 1.2, valor = function(d) return d.nombre end},
    {clave = "objetos", titulo = L.t("MAIL_COL_ITEMS"), ancho = 80, justificado = "RIGHT", valor = function(d) return d.objetos end},
    {clave = "unidades", titulo = L.t("CRAFT_COL_UNITS"), ancho = 80, justificado = "RIGHT",
      valor = function(d) return marcado(d, d.unidades) end},
    {clave = "nota", titulo = L.t("WAREHOUSE_COL_REASON"), flex = 2,
      valor = function(d)
        if d.aprox then return L.t("MAIL_TARGET_NOTE_APPROX") end
        return d.tope and L.t("MAIL_TARGET_NOTE") or ""
      end},
  }
end

-- Las columnas de una pestaña («enviar» o «destinatarios»), tal como las pinta la tabla.
function UI.columnas(cual)
  return cual == "destinatarios" and columnasDestinatarios() or columnasEnviar()
end

local function rutasElegidas()
  if not grupo then
    return nil
  end
  local rutas = {[grupo] = true}
  local prefijo = grupo .. "`"
  for _, ruta in ipairs(SNF.Correo.grupos()) do
    if string.sub(ruta, 1, #prefijo) == prefijo then
      rutas[ruta] = true
    end
  end
  return rutas
end

local function textoEstado(v)
  if v.estado == "en_combate" then
    return L.t("VENDOR_STATE_COMBAT")
  elseif v.bolsas.leidas == 0 then
    return L.t("WAREHOUSE_STATE_NO_DATA_BAGS")
  elseif #v.filas == 0 then
    return v.bolsas.desconocidos > 0 and L.t("MAIL_STATE_UNREAD_SLOTS", v.bolsas.desconocidos) or L.t("MAIL_STATE_EMPTY")
  end
  local t = v.totales
  local texto = L.t("MAIL_STATE_READY", t.enviar, tostring(marcado(t, t.unidades)), t.destinatarios)
  if t.inciertas > 0 then
    texto = texto .. "  " .. L.t("MAIL_STATE_UNCERTAIN", t.inciertas)
  end
  if v.bolsas.desconocidos > 0 then
    texto = texto .. "  " .. L.t("MAIL_STATE_UNREAD_SLOTS", v.bolsas.desconocidos)
  end
  if t.tope then
    texto = texto .. "  " .. L.t("MAIL_STATE_AT_MOST")
  end
  return texto
end

local function ponerEstado(texto)
  if marco.estado:GetText() ~= texto then
    marco.estado:SetText(texto)
  end
end

local function tablaDelModo()
  for _, m in ipairs(MODOS) do
    local t = marco.tablas[m]
    if m == modo then
      if not t:IsShown() then t:Show() end
    elseif t:IsShown() then
      t:Hide()
    end
  end
  return marco.tablas[modo]
end

function UI.refrescar(forzar)
  pendiente = false
  if not marco or not marco:IsShown() then
    return
  end
  if InCombatLockdown() then
    ponerEstado(L.t("VENDOR_STATE_COMBAT")) -- la tabla se queda como estaba
    return
  end
  local v = SNF.Correo.vistaPrevia(rutasElegidas())
  local anterior = UI.vista
  UI.vista = v
  ponerEstado(textoEstado(v))
  local tabla = tablaDelModo()
  local cambio = forzar or not anterior or anterior.estado ~= v.estado or anterior.huella ~= v.huella
  if cambio or UI.modoPuesto ~= modo then
    UI.modoPuesto = modo
    tabla:poner(modo == "enviar" and v.lineas or v.destinatarios)
  end
end

local function pedirRefresco()
  if pendiente or not marco or not marco:IsShown() then
    return
  end
  pendiente = true
  C_Timer.After(ESPERA, function()
    if pendiente then
      SNF.Comercio.ejecutar("correo", UI.refrescar)
    end
  end)
end

local opciones = {}
local function rellenarOpciones()
  for k = #opciones, 1, -1 do
    opciones[k] = nil
  end
  opciones[1] = {"*", L.t("MAIL_ALL_GROUPS")}
  local sigue = false
  for _, ruta in ipairs(SNF.Correo.grupos()) do
    opciones[#opciones + 1] = {ruta, nombreGrupo(ruta)}
    sigue = sigue or ruta == grupo
  end
  if not sigue then
    grupo = nil
  end
end

local function quitarDeEspeciales()
  for k = #UISpecialFrames, 1, -1 do
    if UISpecialFrames[k] == NOMBRE then
      table.remove(UISpecialFrames, k)
    end
  end
end

local EVENTOS_EXISTENCIAS = {"BAG_UPDATE_DELAYED", "BANKFRAME_OPENED", "BANKFRAME_CLOSED", "MAIL_SHOW",
  "MAIL_INBOX_UPDATE", "MAIL_CLOSED", "SNF_COMERCIO_MIS"}

local function totalEnviar(lineas)
  local unidades, total = 0, {}
  for _, l in ipairs(lineas) do
    if l.estado == "enviar" then
      unidades = unidades + l.enviar
      total.tope = total.tope or l.tope
      total.aprox = total.aprox or l.aprox
    end
  end
  return L.t("MAIL_COL_SEND") .. ": " .. marcado(total, unidades)
end

local function totalDestinatarios(lista)
  local unidades, total = 0, {}
  for _, d in ipairs(lista) do
    unidades = unidades + d.unidades
    total.tope = total.tope or d.tope
    total.aprox = total.aprox or d.aprox
  end
  return L.t("CRAFT_COL_UNITS") .. ": " .. marcado(total, unidades)
end

local function crear()
  local m = CreateFrame("Frame", NOMBRE, UIParent)
  m:SetSize(ANCHO, ALTO)
  m:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  m:SetFrameStrata("HIGH")
  m:EnableMouse(true)
  m:SetMovable(true)
  m:RegisterForDrag("LeftButton")
  m:SetScript("OnDragStart", Piezas.proteger(function(self) self:StartMoving() end))
  m:SetScript("OnDragStop", Piezas.proteger(function(self) self:StopMovingOrSizing() end))
  Tema.panel(m, "fondo", {borde = true})
  SNF.WindowSizing.register(m, NOMBRE, true)
  m:Hide()

  m.titulo = Tema.letra(m:CreateFontString(nil, "OVERLAY"), "titulo")
  m.titulo:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -MARGEN)
  m.titulo:SetJustifyH("LEFT")
  m.titulo:SetText(L.t("MAIL_TITLE"))
  m.ayuda = Tema.letra(m:CreateFontString(nil, "OVERLAY"), "texto")
  m.ayuda:SetPoint("TOPLEFT", m.titulo, "BOTTOMLEFT", 0, -6)
  m.ayuda:SetPoint("RIGHT", m, "RIGHT", -MARGEN, 0)
  m.ayuda:SetJustifyH("LEFT")
  m.ayuda:SetText(L.t("MAIL_READ_ONLY"))

  local nombres = {}
  for i, md in ipairs(MODOS) do
    nombres[i] = L.t(TEXTO_MODO[md])
  end
  m.pestanas = Piezas.pestanas(m, {nombres = nombres, elegida = 1, alElegir = function(indice)
    modo = MODOS[indice]
    UI.refrescar(true)
  end})
  m.pestanas:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -58)
  m.pestanas:SetSize(400, 26)

  m.desplegable = Piezas.desplegable(m, {ancho = 300, opciones = opciones,
    get = function() return grupo or "*" end,
    set = function(valor)
      grupo = valor ~= "*" and valor or nil
      UI.refrescar(true)
    end})
  m.desplegable:SetPoint("TOPRIGHT", m, "TOPRIGHT", -MARGEN, -60)

  m.estado = Tema.letra(m:CreateFontString(nil, "OVERLAY"), "etiqueta")
  m.estado:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -96)
  m.estado:SetPoint("RIGHT", m, "RIGHT", -MARGEN, 0)
  m.estado:SetJustifyH("LEFT")

  m.tablas = {
    enviar = Piezas.tabla(m, {columnas = columnasEnviar(), orden = {clave = "grupo", asc = true}, totales = totalEnviar}),
    destinatarios = Piezas.tabla(m, {columnas = columnasDestinatarios(), orden = {clave = "nombre", asc = true},
      totales = totalDestinatarios}),
  }
  for _, t in pairs(m.tablas) do
    t:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -118)
    t:SetPoint("BOTTOMRIGHT", m, "BOTTOMRIGHT", -MARGEN, 46)
  end
  m.tablas.destinatarios:Hide()

  m.botonCerrar = Piezas.boton(m, L.t("WAREHOUSE_CLOSE"), function() UI.cerrar() end, {ancho = 110})
  m.botonCerrar:SetPoint("BOTTOMRIGHT", m, "BOTTOMRIGHT", -MARGEN, MARGEN)
  m.botonActualizar = Piezas.boton(m, L.t("WAREHOUSE_REFRESH"), function() UI.refrescar(true) end, {ancho = 110})
  m.botonActualizar:SetPoint("RIGHT", m.botonCerrar, "LEFT", -8, 0)

  m:SetScript("OnHide", Piezas.proteger(function()
    quitarDeEspeciales()
    pendiente = false
    UI.vista = nil
    UI.modoPuesto = nil
    for _, evento in ipairs(EVENTOS_EXISTENCIAS) do
      SNF.Eventos.dejar(evento, pedirRefresco)
    end
  end))
  return m
end

function UI.estaAbierta()
  return marco ~= nil and marco:IsShown()
end

function UI.abrir()
  marco = marco or crear()
  UI.marco = marco
  if marco:IsShown() then
    return
  end
  rellenarOpciones()
  marco.desplegable:refrescar()
  marco:Show()
  quitarDeEspeciales()
  table.insert(UISpecialFrames, NOMBRE)
  for _, evento in ipairs(EVENTOS_EXISTENCIAS) do
    SNF.Eventos.escuchar(evento, pedirRefresco)
  end
  UI.refrescar(true)
end

function UI.cerrar()
  if marco then
    marco:Hide()
  end
end

function UI.alternar()
  if UI.estaAbierta() then
    UI.cerrar()
  else
    UI.abrir()
  end
end

SNF.Eventos.escuchar("PLAYER_REGEN_DISABLED", function()
  if UI.estaAbierta() then
    ponerEstado(L.t("VENDOR_STATE_COMBAT"))
  end
end)
SNF.Eventos.escuchar("PLAYER_REGEN_ENABLED", pedirRefresco)
