-- SnetForever: ventana «Artesanía» (plan de paridad con TSM, fase 4). Enseña lo que SNF.Artesania calcula: por grupo y
-- operación, el objeto, cuántas tienes, el mínimo y el máximo a reponer, cuántas veces se fabricaría y cuántas unidades
-- salen, el coste, el valor y el beneficio por unidad y, si no se fabrica, por qué; en la otra pestaña, los materiales que
-- hacen falta para todo eso, los que llevas en las bolsas, los que faltan y lo que costaría comprarlos. SOLO DE LECTURA:
-- no tiene botón de fabricar ni de comprar (el §4 del diseño deja los objetos en manos del jugador; lo que faltaría está
-- en docs/comercio/artesania.md).
--
-- Se abre y se cierra con «/snet c artesania» (o «/snet trade crafting»); Escape la cierra. No necesita la ventana de la
-- profesión abierta, pero las recetas solo se conocen después de abrirla en esta sesión (comercio/recipe-costs.lua).
--
-- Sin parpadeos, como Vendedor: la tabla solo se vuelve a poner cuando la vista cambia de verdad (la huella de
-- SNF.Artesania) y los cambios de bolsas y recetas se juntan en uno (0,3 s después del último). En combate no se
-- recalcula: la tabla se queda como estaba y la línea de estado dice que está en pausa.
--
-- SNF.UIArtesania: .abrir(), .cerrar(), .alternar(), .estaAbierta(), .refrescar(forzar), .motivo(fila), .marco (nil hasta
-- la primera vez; .titulo, .ayuda, .pestanas, .desplegable, .estado, .tablas = {fabricar, materiales}, .botonActualizar,
-- .botonCerrar), .vista (la que se ve).
local SNF = SnetForever
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local UI = {}
SNF.UIArtesania = UI

local NOMBRE = "SnetForeverArtesania"
local ANCHO, ALTO = 1120, 500
local MARGEN = 12
local ESPERA = 0.3
local MODOS = {"fabricar", "materiales"}
local TEXTO_MODO = {fabricar = "CRAFT_TAB_CRAFT", materiales = "CRAFT_TAB_MATERIALS"}

local marco
local modo = "fabricar"
local grupo = nil -- nil = todos los grupos con Artesanía
local pendiente = false

local function nombreGrupo(ruta)
  return (string.gsub(ruta, "`", " › "))
end

local function dinero(cobre)
  if cobre == nil then
    return nil
  end
  if cobre < 0 then
    return "-" .. Tema.dineroPlano(math.floor(-cobre + 0.5))
  end
  return Tema.dineroPlano(math.floor(cobre + 0.5))
end

local FUENTES = {banco = "CRAFT_SOURCE_BANK", bancoCuenta = "CRAFT_SOURCE_WARBANK", correo = "CRAFT_SOURCE_MAIL",
  alters = "CRAFT_SOURCE_ALTS", subastas = "CRAFT_SOURCE_AUCTIONS", subastasAlters = "CRAFT_SOURCE_ALT_AUCTIONS",
  hermandad = "CRAFT_SOURCE_GUILD", bolsas = "CRAFT_SOURCE_BAGS"}

local function fuentes(lista)
  local salida = {}
  for i, f in ipairs(lista or {}) do
    salida[i] = FUENTES[f] and L.t(FUENTES[f]) or f
  end
  return table.concat(salida, ", ")
end

local MOTIVOS = {
  formula = "WAREHOUSE_REASON_FORMULA", ignorada = "WAREHOUSE_REASON_IGNORED", sin_operacion = "CRAFT_REASON_NO_OPERATION",
  variante = "WAREHOUSE_REASON_VARIANT", mascota = "WAREHOUSE_REASON_PET", min_max = "CRAFT_REASON_MIN_MAX",
  sin_receta = "CRAFT_REASON_NO_RECIPE", recetas_sin_coste = "CRAFT_REASON_RECIPES_NO_COST",
  sin_valor = "CRAFT_REASON_NO_VALUE", sin_coste = "CRAFT_REASON_NO_COST", existencias = "VENDOR_REASON_STOCK",
  repuesto = "CRAFT_REASON_RESTOCKED", bajo_minimo = "CRAFT_REASON_BELOW_MIN", rendimiento = "CRAFT_REASON_YIELD",
}

function UI.motivo(fila)
  local texto
  if fila.estado == "fabricar" then
    texto = L.t("CRAFT_REASON_CRAFT")
    if fila.motivo == "sin_coste" then
      texto = texto .. " · " .. L.t("CRAFT_REASON_NO_COST", tostring(fila.detalle or "?"))
    end
    if fila.tope then
      -- La hermandad y las subastas de otros personajes no se cuentan nunca (lo dice la línea de estado): la fila solo
      -- nombra lo que todavía no se ha visto.
      local sinVer = {}
      for _, f in ipairs(fila.sinContar or {}) do
        if f ~= "hermandad" and f ~= "subastasAlters" then sinVer[#sinVer + 1] = f end
      end
      texto = texto .. " · " .. (#sinVer > 0 and L.t("CRAFT_REASON_AT_MOST", fuentes(sinVer)) or L.t("CRAFT_REASON_AT_MOST_SHORT"))
    end
  elseif fila.motivo == "beneficio" then
    texto = L.t("CRAFT_REASON_PROFIT", dinero(fila.beneficio) or "?", dinero(fila.beneficioMinimo) or "?")
  elseif fila.motivo == "sin_valor" then
    texto = L.t("CRAFT_REASON_NO_VALUE", fila.detalle == "general" and L.t("CRAFT_GENERAL_VALUE") or tostring(fila.detalle))
  elseif fila.motivo == "existencias" then
    texto = L.t("VENDOR_REASON_STOCK", fuentes({fila.detalle}))
  else
    local clave = MOTIVOS[fila.motivo]
    texto = clave and L.t(clave, tostring(fila.detalle or "?")) or (fila.motivo or "")
  end
  return texto
end

local COLOR_ESTADO = {fabricar = "acento", nada = "apagado", apartada = "apagado", incierta = "error"}

local function pintarEstado(celda, f)
  Piezas.interno.colorTexto(celda.texto, COLOR_ESTADO[f.estado] or "texto")
end

local function conTope(f, n)
  if n == nil then
    return f.estado == "incierta" and "?" or nil
  end
  return f.tope and ("≤" .. n) or n
end

local function columnasFabricar()
  return {
    {clave = "grupo", titulo = L.t("WAREHOUSE_COL_GROUP"), flex = 0.8, valor = function(f) return nombreGrupo(f.ruta) end},
    {clave = "objeto", titulo = L.t("WAREHOUSE_COL_ITEM"), flex = 1,
      valor = function(f) return f.nombre or (f.item and L.t("WAREHOUSE_ITEM", f.item)) or f.clave end},
    {clave = "operaciones", titulo = L.t("CRAFT_COL_OPERATION"), flex = 0.7,
      valor = function(f) return table.concat(f.operaciones or {}, ", ") end},
    {clave = "tienes", titulo = L.t("VENDOR_COL_HAVE"), ancho = 56, justificado = "RIGHT",
      valor = function(f) return f.tienes ~= nil and f.tienes or (f.motivo == "existencias" and "?" or nil) end},
    {clave = "reponer", titulo = L.t("CRAFT_COL_MIN_MAX"), ancho = 70, justificado = "RIGHT",
      valor = function(f) return f.minimo and (f.minimo .. "–" .. f.maximo) or nil end},
    {clave = "fabricaciones", titulo = L.t("CRAFT_COL_CRAFTS"), ancho = 80, justificado = "RIGHT", pintar = pintarEstado,
      valor = function(f)
        if f.estado ~= "fabricar" then return f.estado == "incierta" and "?" or nil end
        return conTope(f, f.fabricaciones) .. " × " .. f.rendimiento
      end},
    {clave = "unidades", titulo = L.t("CRAFT_COL_UNITS"), ancho = 60, justificado = "RIGHT",
      valor = function(f) return f.estado == "fabricar" and conTope(f, f.unidades) or nil end},
    {clave = "coste", titulo = L.t("CRAFT_COL_COST"), ancho = 86, justificado = "RIGHT",
      valor = function(f) return dinero(f.coste) or (f.receta and "?" or nil) end},
    {clave = "valor", titulo = L.t("CRAFT_COL_VALUE"), ancho = 86, justificado = "RIGHT",
      valor = function(f) return dinero(f.valor) or (f.receta and "?" or nil) end},
    {clave = "beneficio", titulo = L.t("CRAFT_COL_PROFIT"), ancho = 86, justificado = "RIGHT",
      valor = function(f) return dinero(f.beneficio) or (f.receta and "?" or nil) end},
    {clave = "motivo", titulo = L.t("WAREHOUSE_COL_REASON"), flex = 2.3, valor = UI.motivo, pintar = pintarEstado},
  }
end

local function columnasMateriales()
  return {
    {clave = "objeto", titulo = L.t("CRAFT_COL_MATERIAL"), flex = 1.2,
      valor = function(m) return m.nombre or L.t("WAREHOUSE_ITEM", m.id) end},
    {clave = "necesarias", titulo = L.t("CRAFT_COL_NEEDED"), ancho = 80, justificado = "RIGHT",
      valor = function(m) return m.tope and ("≤" .. m.necesarias) or m.necesarias end},
    {clave = "enBolsas", titulo = L.t("CRAFT_COL_IN_BAGS"), ancho = 80, justificado = "RIGHT",
      valor = function(m) return m.enBolsas ~= nil and m.enBolsas or "?" end},
    {clave = "comprar", titulo = L.t("VENDOR_COL_BUY"), ancho = 70, justificado = "RIGHT",
      valor = function(m)
        if m.comprar == nil then return "?" end
        return m.tope and ("≤" .. m.comprar) or m.comprar
      end},
    {clave = "precio", titulo = L.t("CRAFT_COL_UNIT_PRICE"), ancho = 90, justificado = "RIGHT",
      valor = function(m) return dinero(m.precio) or "?" end},
    {clave = "coste", titulo = L.t("VENDOR_COL_COST"), ancho = 90, justificado = "RIGHT",
      valor = function(m) return dinero(m.coste) or ((m.comprar == 0) and dinero(0) or "?") end},
    {clave = "para", titulo = L.t("CRAFT_COL_FOR"), flex = 1.6, valor = function(m) return table.concat(m.de or {}, ", ") end},
  }
end

local function rutasElegidas()
  if not grupo then
    return nil
  end
  local rutas = {[grupo] = true}
  local prefijo = grupo .. "`"
  for _, ruta in ipairs(SNF.Artesania.grupos()) do
    if string.sub(ruta, 1, #prefijo) == prefijo then
      rutas[ruta] = true
    end
  end
  return rutas
end

local function textoEstado(v)
  if v.estado == "en_combate" then
    return L.t("VENDOR_STATE_COMBAT")
  elseif #v.filas == 0 then
    return L.t("CRAFT_STATE_EMPTY")
  end
  local t = v.totales
  local texto
  if modo == "fabricar" then
    texto = L.t("CRAFT_STATE_READY", t.fabricar, t.fabricaciones, (t.tope and "≤" or "") .. t.unidades,
      (t.costeIncompleto and "≥" or "") .. dinero(t.coste), (t.beneficioIncompleto and "~" or "") .. dinero(t.beneficio))
  else
    texto = L.t("CRAFT_STATE_MATERIALS", #v.materiales, (t.compraIncompleta and "≥" or "") .. dinero(t.compra))
  end
  if v.recetasVistas == 0 then
    texto = texto .. "  " .. L.t("CRAFT_STATE_NO_RECIPES")
  end
  if t.tope then
    texto = texto .. "  " .. L.t("CRAFT_STATE_AT_MOST")
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
  local v = SNF.Artesania.vistaPrevia(rutasElegidas())
  local anterior = UI.vista
  UI.vista = v
  ponerEstado(textoEstado(v))
  local tabla = tablaDelModo()
  local cambio = forzar or not anterior or anterior.estado ~= v.estado or anterior.huella ~= v.huella
  if cambio or UI.modoPuesto ~= modo then
    UI.modoPuesto = modo
    tabla:poner(modo == "fabricar" and v.filas or v.materiales)
  end
end

local function pedirRefresco()
  if pendiente or not marco or not marco:IsShown() then
    return
  end
  pendiente = true
  C_Timer.After(ESPERA, function()
    if pendiente then
      SNF.Comercio.ejecutar("artesania", UI.refrescar)
    end
  end)
end

local opciones = {}
local function rellenarOpciones()
  for k = #opciones, 1, -1 do
    opciones[k] = nil
  end
  opciones[1] = {"*", L.t("CRAFT_ALL_GROUPS")}
  local sigue = false
  for _, ruta in ipairs(SNF.Artesania.grupos()) do
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

local function totalFabricar(filas)
  local fabricaciones, cobre, tope = 0, 0, false
  for _, f in ipairs(filas) do
    if f.estado == "fabricar" then
      fabricaciones = fabricaciones + f.fabricaciones
      cobre = cobre + (f.costeTotal or 0)
      tope = tope or f.tope
    end
  end
  return L.t("CRAFT_COL_CRAFTS") .. ": " .. (tope and "≤" or "") .. fabricaciones .. "  ·  " .. dinero(cobre)
end

local function totalMateriales(materiales)
  local cobre = 0
  for _, m in ipairs(materiales) do
    cobre = cobre + (m.coste or 0)
  end
  return L.t("VENDOR_COL_BUY") .. ": " .. dinero(cobre)
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
  m.titulo:SetText(L.t("CRAFT_TITLE"))
  m.ayuda = Tema.letra(m:CreateFontString(nil, "OVERLAY"), "texto")
  m.ayuda:SetPoint("TOPLEFT", m.titulo, "BOTTOMLEFT", 0, -6)
  m.ayuda:SetPoint("RIGHT", m, "RIGHT", -MARGEN, 0)
  m.ayuda:SetJustifyH("LEFT")
  m.ayuda:SetText(L.t("CRAFT_READ_ONLY"))

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
    fabricar = Piezas.tabla(m, {columnas = columnasFabricar(), orden = {clave = "grupo", asc = true},
      totales = totalFabricar}),
    materiales = Piezas.tabla(m, {columnas = columnasMateriales(), orden = {clave = "objeto", asc = true},
      totales = totalMateriales}),
  }
  for _, t in pairs(m.tablas) do
    t:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -118)
    t:SetPoint("BOTTOMRIGHT", m, "BOTTOMRIGHT", -MARGEN, 46)
  end
  m.tablas.materiales:Hide()

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

SNF.Eventos.escuchar("SNF_ARTESANIA", pedirRefresco)
SNF.Eventos.escuchar("PLAYER_REGEN_DISABLED", function()
  if UI.estaAbierta() then
    ponerEstado(L.t("VENDOR_STATE_COMBAT"))
  end
end)
SNF.Eventos.escuchar("PLAYER_REGEN_ENABLED", pedirRefresco)
