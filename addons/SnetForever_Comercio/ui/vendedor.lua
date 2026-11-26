-- SnetForever: ventana «Vendedor» (plan de paridad con TSM, fase 4). Enseña lo que SNF.Vendedor calcula con el
-- comerciante abierto: por grupo y operación, el objeto, cuántas llevas, cuántas se venderían, cuántas te quedarían, el
-- precio del comerciante y, si no se vende, por qué; en la otra pestaña, lo que se le compraría para reponer, con su
-- stock y su coste. SOLO DE LECTURA: no tiene botón de vender ni de comprar (el §4 del diseño deja los objetos en manos
-- del jugador; lo que faltaría está en docs/comercio/vendedor.md).
--
-- Se abre y se cierra con «/snet c vendedor» (o «/snet trade vendor») con un comerciante abierto; Escape la cierra y se
-- cierra sola al cerrar el comerciante. Arriba, los dos modos (Vender al comerciante, Reponer del comerciante) y el grupo.
-- Debajo, una línea de estado y la tabla de siempre (Piezas.tabla), una por modo.
--
-- Sin parpadeos: la tabla solo se vuelve a poner cuando la vista cambia de verdad (la huella de SNF.Vendedor), y los
-- cambios de las bolsas y del comerciante se juntan en uno (0,3 s después del último). En combate no se recalcula: la
-- tabla se queda como estaba y la línea de estado dice que está en pausa; al salir del combate se vuelve a mirar.
--
-- SNF.UIVendedor: .abrir(), .cerrar(), .alternar(), .estaAbierta(), .refrescar(forzar), .motivo(fila), .marco (nil hasta
-- la primera vez; .titulo, .ayuda, .pestanas, .desplegable, .estado, .tablas = {vender, reponer}, .botonActualizar,
-- .botonCerrar), .vista (la que se ve).
local SNF = SnetForever
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local UI = {}
SNF.UIVendedor = UI

local NOMBRE = "SnetForeverVendedor"
local ANCHO, ALTO = 1000, 480
local MARGEN = 12
local ESPERA = 0.3
local MODOS = SNF.Vendedor.MODOS
local TEXTO_MODO = {vender = "VENDOR_SELL", reponer = "VENDOR_RESTOCK"}

local marco
local modo = "vender"
local grupo = nil -- nil = todos los grupos con Vendedor
local pendiente = false

local function nombreGrupo(ruta)
  if ruta == "" then
    return L.t("WAREHOUSE_BASE_GROUP")
  end
  return (string.gsub(ruta, "`", " › "))
end

local function dinero(cobre)
  if cobre == nil then
    return nil
  end
  return Tema.dineroPlano(math.floor(cobre + 0.5))
end

local MOTIVOS = {
  conserva = "VENDOR_REASON_KEEP", caducadas = "VENDOR_REASON_EXPIRES", caducadas_sin_id = "VENDOR_REASON_EXPIRES_NO_ID",
  caducadas_sin_datos = "VENDOR_REASON_EXPIRES_NO_DATA", destruccion = "VENDOR_REASON_DESTROY",
  mercado = "VENDOR_REASON_MARKET", sin_dato = "VENDOR_REASON_NO_VALUE", formula = "WAREHOUSE_REASON_FORMULA",
  no_acepta = "VENDOR_REASON_NOT_ACCEPTED", ligado = "VENDOR_REASON_BOUND", ligado_desconocido = "VENDOR_REASON_BOUND_UNKNOWN",
  sin_info = "VENDOR_REASON_NO_INFO", sin_hueco = "VENDOR_REASON_NO_SLOT", huecos = "VENDOR_REASON_SLOTS_UNKNOWN",
  ignorada = "WAREHOUSE_REASON_IGNORED", sin_operacion = "WAREHOUSE_REASON_NO_OPERATION",
  venta_desactivada = "VENDOR_REASON_SELL_OFF", compra_desactivada = "VENDOR_REASON_BUY_OFF",
  variante = "WAREHOUSE_REASON_VARIANT", enlace = "VENDOR_REASON_LINK", mascota = "WAREHOUSE_REASON_PET",
  repuesto = "VENDOR_REASON_RESTOCKED", coste_no_oro = "VENDOR_REASON_NOT_GOLD", no_disponible = "VENDOR_REASON_SOLD_OUT",
  precio = "VENDOR_REASON_PRICE", sin_leer = "VENDOR_REASON_UNREADABLE",
  fuente_sin_cobertura = "VENDOR_REASON_SOURCE", existencias = "VENDOR_REASON_STOCK",
}
local CON_DETALLE = {conserva = true, caducadas = true, caducadas_sin_id = true, caducadas_sin_datos = true,
  destruccion = true, mercado = true, sin_dato = true, formula = true, fuente_sin_cobertura = true, existencias = true}

function UI.motivo(fila)
  local texto
  if fila.estado == "vender" or fila.estado == "comprar" then
    texto = L.t(fila.estado == "vender" and "VENDOR_REASON_SELL" or "VENDOR_REASON_BUY")
    if fila.motivo == "sin_hueco" then
      texto = texto .. " · " .. L.t("VENDOR_REASON_NO_SLOT")
    end
  else
    local clave = MOTIVOS[fila.motivo]
    if not clave then
      texto = fila.motivo or ""
    elseif CON_DETALLE[fila.motivo] then
      texto = L.t(clave, tostring(fila.detalle or "?"))
    else
      texto = L.t(clave)
    end
  end
  if fila.detalleSuma then
    texto = texto .. " · " .. L.t("VENDOR_REASON_SUM", fila.detalleSuma)
  end
  return texto
end

local COLOR_ESTADO = {vender = "acento", comprar = "acento", nada = "apagado", apartada = "apagado", incierta = "error"}

local function pintarEstado(celda, f)
  Piezas.interno.colorTexto(celda.texto, COLOR_ESTADO[f.estado] or "texto")
end

local function comunes()
  return {
    {clave = "grupo", titulo = L.t("WAREHOUSE_COL_GROUP"), flex = 1, valor = function(f) return nombreGrupo(f.ruta) end},
    {clave = "objeto", titulo = L.t("WAREHOUSE_COL_ITEM"), flex = 1.3,
      valor = function(f) return f.nombre or L.t("WAREHOUSE_ITEM", f.item) end},
    {clave = "operaciones", titulo = L.t("WAREHOUSE_COL_OPERATIONS"), flex = 0.9,
      valor = function(f) return table.concat(f.operaciones or {}, ", ") end},
  }
end

local function columnasVender()
  local c = comunes()
  c[#c + 1] = {clave = "tienes", titulo = L.t("VENDOR_COL_HAVE"), ancho = 60, justificado = "RIGHT",
    valor = function(f) return f.tienes end}
  c[#c + 1] = {clave = "vender", titulo = L.t("VENDOR_COL_SELL"), ancho = 60, justificado = "RIGHT",
    valor = function(f) return f.estado == "incierta" and "?" or f.vender end, pintar = pintarEstado}
  c[#c + 1] = {clave = "quedan", titulo = L.t("VENDOR_COL_KEEP"), ancho = 70, justificado = "RIGHT",
    valor = function(f) return f.quedan ~= nil and f.quedan or (f.estado == "incierta" and "?" or nil) end}
  c[#c + 1] = {clave = "precio", titulo = L.t("VENDOR_COL_PRICE"), ancho = 100, justificado = "RIGHT",
    valor = function(f)
      if f.precio ~= nil then return dinero(f.precio) end
      return f.motivo == "sin_info" and "?" or nil
    end}
  c[#c + 1] = {clave = "motivo", titulo = L.t("WAREHOUSE_COL_REASON"), flex = 1.8, valor = UI.motivo, pintar = pintarEstado}
  return c
end

local function columnasReponer()
  local c = comunes()
  c[#c + 1] = {clave = "tienes", titulo = L.t("VENDOR_COL_HAVE"), ancho = 60, justificado = "RIGHT",
    valor = function(f) return f.tienes ~= nil and f.tienes or (f.estado == "incierta" and "?" or nil) end}
  c[#c + 1] = {clave = "objetivo", titulo = L.t("VENDOR_COL_TARGET"), ancho = 76, justificado = "RIGHT",
    valor = function(f) return f.objetivo end}
  c[#c + 1] = {clave = "disponibles", titulo = L.t("VENDOR_COL_STOCK"), ancho = 70, justificado = "RIGHT",
    valor = function(f)
      if f.disponibles == -1 then return L.t("VENDOR_UNLIMITED") end
      return f.disponibles
    end}
  c[#c + 1] = {clave = "comprar", titulo = L.t("VENDOR_COL_BUY"), ancho = 60, justificado = "RIGHT",
    valor = function(f) return f.estado == "incierta" and "?" or f.comprar end, pintar = pintarEstado}
  c[#c + 1] = {clave = "coste", titulo = L.t("VENDOR_COL_COST"), ancho = 90, justificado = "RIGHT",
    valor = function(f) return dinero(f.coste or f.precio) end}
  c[#c + 1] = {clave = "motivo", titulo = L.t("WAREHOUSE_COL_REASON"), flex = 1.6, valor = UI.motivo, pintar = pintarEstado}
  return c
end

local function rutasElegidas()
  if not grupo then
    return nil
  end
  local rutas = {[grupo] = true}
  local prefijo = grupo .. "`"
  for _, ruta in ipairs(SNF.Vendedor.grupos()) do
    if grupo ~= "" and string.sub(ruta, 1, #prefijo) == prefijo then
      rutas[ruta] = true
    end
  end
  return rutas
end

local function textoEstado(v)
  if v.estado == "sin_comerciante" then
    return L.t("VENDOR_STATE_NO_MERCHANT")
  elseif v.estado == "en_combate" then
    return L.t("VENDOR_STATE_COMBAT")
  elseif v.estado == "sin_datos" then
    return L.t(v.motivo == "bolsas" and "WAREHOUSE_STATE_NO_DATA_BAGS" or "VENDOR_STATE_NO_DATA_MERCHANT")
  elseif #v.filas == 0 then
    return L.t("VENDOR_STATE_EMPTY")
  end
  local t = v.totales
  local texto
  if v.modo == "vender" then
    texto = L.t("VENDOR_STATE_READY_SELL", t.filas, t.unidades, dinero(t.valor or 0))
  else
    texto = L.t("VENDOR_STATE_READY_BUY", t.filas, t.unidades, dinero(t.coste or 0))
  end
  local desconocidos = v.requisitos.huecosDesconocidos or 0
  if desconocidos > 0 then
    texto = texto .. "  " .. L.t("WAREHOUSE_STATE_UNKNOWN", desconocidos)
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
  if not SNF.Vendedor.abierto() then
    UI.cerrar()
    return
  end
  local v = SNF.Vendedor.vistaPrevia(modo, rutasElegidas())
  local anterior = UI.vista
  UI.vista = v
  ponerEstado(textoEstado(v))
  local tabla = tablaDelModo()
  if forzar or not anterior or anterior.modo ~= v.modo or anterior.estado ~= v.estado or anterior.motivo ~= v.motivo
      or anterior.huella ~= v.huella then
    tabla:poner(v.filas)
  end
end

local function pedirRefresco()
  if pendiente or not marco or not marco:IsShown() then
    return
  end
  pendiente = true
  C_Timer.After(ESPERA, function()
    if pendiente then
      SNF.Comercio.ejecutar("vendedor", UI.refrescar)
    end
  end)
end

local opciones = {}
local function rellenarOpciones()
  for k = #opciones, 1, -1 do
    opciones[k] = nil
  end
  opciones[1] = {"*", L.t("VENDOR_ALL_GROUPS")}
  local sigue = false
  for _, ruta in ipairs(SNF.Vendedor.grupos()) do
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

local function alCambiarBolsas()
  pedirRefresco()
end

local function totales(campo, conDinero)
  return function(filas)
    local unidades, cobre = 0, 0
    for _, f in ipairs(filas) do
      if f.estado == "vender" or f.estado == "comprar" then
        unidades = unidades + (f[campo] or 0)
        cobre = cobre + (f[conDinero] or 0)
      end
    end
    return L.t(campo == "vender" and "VENDOR_COL_SELL" or "VENDOR_COL_BUY") .. ": " .. unidades .. "  ·  " .. dinero(cobre)
  end
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
  m.titulo:SetText(L.t("VENDOR_TITLE"))
  m.ayuda = Tema.letra(m:CreateFontString(nil, "OVERLAY"), "texto")
  m.ayuda:SetPoint("TOPLEFT", m.titulo, "BOTTOMLEFT", 0, -6)
  m.ayuda:SetPoint("RIGHT", m, "RIGHT", -MARGEN, 0)
  m.ayuda:SetJustifyH("LEFT")
  m.ayuda:SetText(L.t("VENDOR_READ_ONLY"))

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
    vender = Piezas.tabla(m, {columnas = columnasVender(), orden = {clave = "grupo", asc = true},
      totales = totales("vender", "valor")}),
    reponer = Piezas.tabla(m, {columnas = columnasReponer(), orden = {clave = "grupo", asc = true},
      totales = totales("comprar", "coste")}),
  }
  for _, t in pairs(m.tablas) do
    t:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -118)
    t:SetPoint("BOTTOMRIGHT", m, "BOTTOMRIGHT", -MARGEN, 46)
  end
  m.tablas.reponer:Hide()

  m.botonCerrar = Piezas.boton(m, L.t("WAREHOUSE_CLOSE"), function() UI.cerrar() end, {ancho = 110})
  m.botonCerrar:SetPoint("BOTTOMRIGHT", m, "BOTTOMRIGHT", -MARGEN, MARGEN)
  m.botonActualizar = Piezas.boton(m, L.t("WAREHOUSE_REFRESH"), function() UI.refrescar(true) end, {ancho = 110})
  m.botonActualizar:SetPoint("RIGHT", m.botonCerrar, "LEFT", -8, 0)

  m:SetScript("OnHide", Piezas.proteger(function()
    quitarDeEspeciales()
    pendiente = false
    UI.vista = nil
    SNF.Eventos.dejar("BAG_UPDATE_DELAYED", alCambiarBolsas)
  end))
  return m
end

function UI.estaAbierta()
  return marco ~= nil and marco:IsShown()
end

function UI.abrir()
  if not SNF.Vendedor.abierto() then
    print(L.t("VENDOR_NEEDS_MERCHANT"))
    return
  end
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
  SNF.Eventos.escuchar("BAG_UPDATE_DELAYED", alCambiarBolsas)
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

SNF.Eventos.escuchar("SNF_VENDEDOR", function()
  if UI.estaAbierta() and not SNF.Vendedor.abierto() then
    UI.cerrar() -- el comerciante se cerró: la vista ya no vale
    return
  end
  pedirRefresco()
end)
SNF.Eventos.escuchar("PLAYER_REGEN_DISABLED", function()
  if UI.estaAbierta() then
    ponerEstado(L.t("VENDOR_STATE_COMBAT"))
  end
end)
SNF.Eventos.escuchar("PLAYER_REGEN_ENABLED", pedirRefresco)
