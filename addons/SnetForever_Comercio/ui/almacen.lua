-- SnetForever: ventana «Almacén» (plan de paridad con TSM, fase 4, entrega 1). Enseña lo que SNF.Almacen calcula para el
-- banco personal abierto: por grupo y operación, el objeto, cuánto hay en el origen, cuánto se movería, cómo quedaría el
-- destino y, si no se mueve, por qué. La vista previa sigue siendo de solo lectura; la excepción al §4 aprobada por Alain
-- (26-nov, «Sí, un movimiento por clic») añade UN botón, «Mover una pila»: el jugador elige UNA fila y cada clic suyo mueve
-- una sola pila (o parte de una) del hueco de origen al hueco vacío del destino que enseña la línea de debajo
-- (SNF.AlmacenMover, comercio/almacen-mover.lua). Mientras el juego no lo confirma, el botón está apagado. Sin las
-- funciones del cliente, o si el juego bloquea la llamada, la ventana vuelve a ser solo de lectura.
--
-- Se abre y se cierra con «/snet c almacen» (o «/snet trade warehouse»); Escape la cierra. Arriba, las tres direcciones
-- (Guardar en el banco, Sacar del banco, Reponer las bolsas) y el grupo («Todos los grupos con Almacén» o uno con sus
-- subgrupos). Debajo, una línea de estado, la línea del siguiente movimiento y la tabla de siempre (Piezas.tabla), en la
-- que se elige la fila pulsándola.
--
-- Sin parpadeos: la tabla solo se vuelve a poner cuando la vista cambia de verdad (SNF.Almacen.vigente), y los cambios de
-- las bolsas se juntan en uno (0,3 s después del último BAG_UPDATE_DELAYED). En combate no se recalcula: la tabla se queda
-- como estaba y la línea de estado dice que está en pausa; al salir del combate se vuelve a mirar.
--
-- SNF.UIAlmacen: .abrir(), .cerrar(), .alternar(), .estaAbierta(), .refrescar(forzar), .marco (nil hasta la primera vez;
-- .titulo, .ayuda, .pestanas, .desplegable, .estado, .paso, .tabla, .botonMover, .botonActualizar, .botonCerrar), .vista
-- (la que se ve), .paso (el movimiento del siguiente clic, o nil), .textoPaso(paso).
local SNF = SnetForever
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local UI = {}
SNF.UIAlmacen = UI

local NOMBRE = "SnetForeverAlmacen"
local ANCHO, ALTO = 860, 480
local MARGEN = 12
local ESPERA = 0.3
local DIRECCIONES = SNF.Almacen.DIRECCIONES
local TEXTO_DIRECCION = {guardar = "WAREHOUSE_DEPOSIT", sacar = "WAREHOUSE_WITHDRAW", reponer = "WAREHOUSE_RESTOCK"}

local marco
local direccion = "guardar"
local grupo = nil -- nil = todos los grupos con Almacén
local pendiente = false

local function nombreGrupo(ruta)
  if ruta == "" then
    return L.t("WAREHOUSE_BASE_GROUP")
  end
  return (string.gsub(ruta, "`", " › "))
end

local MOTIVOS = {
  conserva = "WAREHOUSE_REASON_KEEP", repuesto = "WAREHOUSE_REASON_RESTOCKED", ignorada = "WAREHOUSE_REASON_IGNORED",
  sin_operacion = "WAREHOUSE_REASON_NO_OPERATION", formula = "WAREHOUSE_REASON_FORMULA", variante = "WAREHOUSE_REASON_VARIANT",
  mascota = "WAREHOUSE_REASON_PET", huecos_origen = "WAREHOUSE_REASON_SOURCE_UNKNOWN",
  huecos_destino = "WAREHOUSE_REASON_TARGET_UNKNOWN", sin_hueco = "WAREHOUSE_REASON_NO_SLOT",
}

function UI.motivo(fila)
  if fila.estado == "mover" then
    return L.t("WAREHOUSE_REASON_MOVE")
  end
  local clave = MOTIVOS[fila.motivo]
  if not clave then
    return fila.motivo or ""
  end
  if fila.motivo == "conserva" then
    return L.t(clave, math.min(fila.conserva or 0, fila.origen or 0))
  elseif fila.motivo == "formula" or fila.motivo == "sin_hueco" then
    return L.t(clave, fila.detalle or "?")
  end
  return L.t(clave)
end

local COLOR_ESTADO = {mover = "acento", nada = "apagado", apartada = "apagado", incierta = "error", sin_hueco = "error"}

local function columnas()
  local function numero(v)
    return v ~= nil and v or nil
  end
  return {
    {clave = "grupo", titulo = L.t("WAREHOUSE_COL_GROUP"), flex = 1, valor = function(f) return nombreGrupo(f.ruta) end},
    {clave = "objeto", titulo = L.t("WAREHOUSE_COL_ITEM"), flex = 1.4,
      valor = function(f) return f.nombre or L.t("WAREHOUSE_ITEM", f.item) end},
    {clave = "operaciones", titulo = L.t("WAREHOUSE_COL_OPERATIONS"), flex = 1,
      valor = function(f) return table.concat(f.operaciones or {}, ", ") end},
    {clave = "origen", titulo = L.t("WAREHOUSE_COL_SOURCE"), ancho = 70, justificado = "RIGHT", valor = function(f) return numero(f.origen) end},
    {clave = "mover", titulo = L.t("WAREHOUSE_COL_MOVE"), ancho = 70, justificado = "RIGHT",
      valor = function(f) return f.estado == "incierta" and "?" or numero(f.mover) end,
      pintar = function(celda, f) Piezas.interno.colorTexto(celda.texto, COLOR_ESTADO[f.estado] or "texto") end},
    {clave = "destino", titulo = L.t("WAREHOUSE_COL_TARGET"), ancho = 110, justificado = "RIGHT",
      valor = function(f) return f.destino ~= nil and f.destino or "?" end},
    {clave = "motivo", titulo = L.t("WAREHOUSE_COL_REASON"), flex = 1.8, valor = UI.motivo,
      pintar = function(celda, f) Piezas.interno.colorTexto(celda.texto, COLOR_ESTADO[f.estado] or "texto") end},
  }
end

local function rutasElegidas()
  if not grupo then
    return nil
  end
  local rutas = {[grupo] = true}
  local prefijo = grupo .. "`"
  for _, ruta in ipairs(SNF.Almacen.grupos()) do
    if grupo ~= "" and string.sub(ruta, 1, #prefijo) == prefijo then
      rutas[ruta] = true
    end
  end
  return rutas
end

local function textoEstado(v)
  if v.estado == "sin_banco" then
    return L.t("WAREHOUSE_STATE_NO_BANK")
  elseif v.estado == "en_combate" then
    return L.t("WAREHOUSE_STATE_COMBAT")
  elseif v.estado == "sin_datos" then
    return L.t(v.motivo == "bolsas" and "WAREHOUSE_STATE_NO_DATA_BAGS" or "WAREHOUSE_STATE_NO_DATA_BANK")
  elseif #v.filas == 0 then
    return L.t("WAREHOUSE_STATE_EMPTY")
  end
  local t = v.totales
  local texto = L.t("WAREHOUSE_STATE_READY", t.filas, t.mover, t.libres - t.huecos, t.libres)
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

---------------------------------------------------------------------------------------------------
-- Un movimiento por clic
---------------------------------------------------------------------------------------------------

local Mover = SNF.AlmacenMover
local ultimo = {} -- {motivo, dato, clave}: lo que dijo el último clic que no movió

local function nombreBolsa(bolsa)
  for i, b in ipairs(SNF.API.bolsasPropias()) do
    if b == bolsa then
      return i == 1 and L.t("WAREHOUSE_BACKPACK") or L.t("WAREHOUSE_BAG", i - 1)
    end
  end
  for i, b in ipairs(SNF.API.bolsasBanco()) do
    if b == bolsa then
      return L.t("WAREHOUSE_BANK_BAG", i)
    end
  end
  return tostring(bolsa)
end

local function nombreFila(clave, item)
  for _, f in ipairs(UI.vista and UI.vista.filas or {}) do
    if f.clave == clave then
      return f.nombre or L.t("WAREHOUSE_ITEM", item)
    end
  end
  return L.t("WAREHOUSE_ITEM", item)
end

function UI.textoPaso(p)
  local t = L.t("WAREHOUSE_STEP", p.cantidad, nombreFila(p.clave, p.item), nombreBolsa(p.origen.bolsa), p.origen.hueco,
    nombreBolsa(p.destino.bolsa), p.destino.hueco)
  if p.partir then
    t = t .. " · " .. L.t("WAREHOUSE_STEP_SPLIT", p.origen.n)
  end
  if p.limitado then
    t = t .. " · " .. L.t("WAREHOUSE_STEP_RESERVE", p.reservaMax)
  end
  return t
end

local POR_MOTIVO = {sin_vista = "WAREHOUSE_MOVE_PICK", sin_fila = "WAREHOUSE_MOVE_PICK", en_curso = "WAREHOUSE_MOVE_WAITING"}

local function textoMotivo(motivo, dato)
  local clave = POR_MOTIVO[motivo] or ("WAREHOUSE_MOVE_" .. string.upper(motivo or ""))
  local texto = dato ~= nil and L.t(clave, dato) or L.t(clave)
  if texto == clave then
    return L.t("WAREHOUSE_MOVE_CAMBIO") -- un estado de la vista sin texto propio (sin_datos, direccion…)
  end
  return texto
end

local function textoResultado(e)
  if e.fase == "en_curso" then
    return L.t("WAREHOUSE_MOVE_WAITING")
  elseif e.fase == "sin_confirmar" then
    return L.t("WAREHOUSE_MOVE_UNCONFIRMED")
  elseif e.resultado == "detenido" and e.motivo == "cursor_ajeno" then
    return L.t("WAREHOUSE_RESULT_DETENIDO_AJENO")
  elseif e.resultado then
    return L.t("WAREHOUSE_RESULT_" .. string.upper(e.resultado))
  end
  return nil
end

local function ponerTexto(fs, texto)
  if fs:GetText() ~= texto then
    fs:SetText(texto)
  end
end

-- Recalcula el movimiento del siguiente clic para la fila elegida y pone la línea y el botón (sin repintar lo que no cambia).
local function actualizarPaso(marcadas)
  if not marco or not marco.botonMover then
    return
  end
  local disponible = Mover.capacidades() and not Mover.restringido()
  ponerTexto(marco.ayuda, L.t(disponible and "WAREHOUSE_ONE_CLICK" or "WAREHOUSE_READ_ONLY"))
  marcadas = marcadas or marco.tabla:marcadas()
  local clave, n = nil, 0
  for k in pairs(marcadas) do
    clave, n = k, n + 1
  end
  local e = Mover.estado()
  local paso, motivo, dato
  if n == 1 then
    paso, motivo, dato = Mover.paso(UI.vista, clave)
  else
    motivo = "sin_fila"
  end
  UI.paso = paso
  local partes = {}
  if e.fase ~= "libre" then
    partes[1] = textoResultado(e)
  else
    if ultimo.motivo and ultimo.clave == clave then
      partes[#partes + 1] = textoMotivo(ultimo.motivo, ultimo.dato)
    elseif e.resultado and e.paso and e.paso.clave == clave then
      partes[#partes + 1] = textoResultado(e)
    end
    partes[#partes + 1] = paso and UI.textoPaso(paso) or textoMotivo(motivo, dato)
  end
  ponerTexto(marco.paso, table.concat(partes, "  "))
  local apagado = not (paso and e.fase == "libre" and not InCombatLockdown())
  if marco.botonMover.snfApagado ~= apagado then
    marco.botonMover:ponerApagado(apagado)
  end
end
UI.actualizarPaso = actualizarPaso

-- El OnClick del botón: el único sitio que pide un movimiento. Un clic, una pila.
local function alPulsarMover()
  local paso = UI.paso
  if not paso then
    return
  end
  ultimo = {}
  local ok, motivo, dato = Mover.ejecutar(paso, UI.vista)
  -- Si no se movió por una comprobación de antes (no por un resultado del juego), se dice por qué.
  if not ok and motivo ~= Mover.estado().resultado then
    ultimo = {motivo = motivo, dato = dato, clave = paso.clave}
  end
  actualizarPaso()
end

function UI.refrescar(forzar)
  pendiente = false
  if not marco or not marco:IsShown() then
    return
  end
  if InCombatLockdown() then
    ponerEstado(L.t("WAREHOUSE_STATE_COMBAT")) -- la tabla se queda como estaba
    actualizarPaso() -- el botón se apaga en combate
    return
  end
  local v = SNF.Almacen.vistaPrevia(direccion, rutasElegidas())
  local anterior = UI.vista
  UI.vista = v
  ponerEstado(textoEstado(v))
  if forzar or not anterior or anterior.estado ~= v.estado or anterior.motivo ~= v.motivo or anterior.huella ~= v.huella then
    marco.tabla:poner(v.filas)
  end
  actualizarPaso()
end

local function pedirRefresco()
  if pendiente or not marco or not marco:IsShown() then
    return
  end
  pendiente = true
  C_Timer.After(ESPERA, function()
    if pendiente then
      SNF.Comercio.ejecutar("almacen", UI.refrescar)
    end
  end)
end

-- La lista del desplegable es siempre la misma tabla: se rellena al abrir la ventana (los grupos pueden haber cambiado).
local opciones = {}
local function rellenarOpciones()
  for k = #opciones, 1, -1 do
    opciones[k] = nil
  end
  opciones[1] = {"*", L.t("WAREHOUSE_ALL_GROUPS")}
  local sigue = false
  for _, ruta in ipairs(SNF.Almacen.grupos()) do
    opciones[#opciones + 1] = {ruta, nombreGrupo(ruta)}
    sigue = sigue or ruta == grupo
  end
  if not sigue then
    grupo = nil -- el grupo elegido ya no tiene Almacén
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
  m.titulo:SetText(L.t("WAREHOUSE_TITLE"))
  m.ayuda = Tema.letra(m:CreateFontString(nil, "OVERLAY"), "texto")
  m.ayuda:SetPoint("TOPLEFT", m.titulo, "BOTTOMLEFT", 0, -6)
  m.ayuda:SetPoint("RIGHT", m, "RIGHT", -MARGEN, 0)
  m.ayuda:SetJustifyH("LEFT")
  m.ayuda:SetText(L.t("WAREHOUSE_READ_ONLY"))

  local nombres = {}
  for i, d in ipairs(DIRECCIONES) do
    nombres[i] = L.t(TEXTO_DIRECCION[d])
  end
  m.pestanas = Piezas.pestanas(m, {nombres = nombres, elegida = 1, alElegir = function(indice)
    direccion = DIRECCIONES[indice]
    UI.refrescar(true)
  end})
  m.pestanas:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -58)
  m.pestanas:SetSize(480, 26)

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
  -- El siguiente movimiento de la fila elegida (o por qué no lo hay), y el resultado del último clic.
  m.paso = Tema.letra(m:CreateFontString(nil, "OVERLAY"), "texto")
  m.paso:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -116)
  m.paso:SetPoint("RIGHT", m, "RIGHT", -MARGEN, 0)
  m.paso:SetJustifyH("LEFT")
  m.paso:SetWordWrap(false)

  -- elegir: se elige UNA fila pulsándola; su siguiente pila sale en la línea de arriba (totales se llama al elegir).
  m.tabla = Piezas.tabla(m, {columnas = columnas(), orden = {clave = "grupo", asc = true}, elegir = true,
    totales = function(filas, marcadas)
      local unidades = 0
      for _, f in ipairs(filas) do
        if f.estado == "mover" then unidades = unidades + (f.mover or 0) end
      end
      actualizarPaso(marcadas)
      return L.t("WAREHOUSE_COL_MOVE") .. ": " .. unidades
    end})
  m.tabla:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -138)
  m.tabla:SetPoint("BOTTOMRIGHT", m, "BOTTOMRIGHT", -MARGEN, 46)

  m.botonCerrar = Piezas.boton(m, L.t("WAREHOUSE_CLOSE"), function() UI.cerrar() end, {ancho = 110})
  m.botonCerrar:SetPoint("BOTTOMRIGHT", m, "BOTTOMRIGHT", -MARGEN, MARGEN)
  m.botonActualizar = Piezas.boton(m, L.t("WAREHOUSE_REFRESH"), function()
    Mover.comprobar() -- solo mira si el juego ya confirmó; nunca vuelve a mover
    UI.refrescar(true)
  end, {ancho = 110})
  m.botonActualizar:SetPoint("RIGHT", m.botonCerrar, "LEFT", -8, 0)
  m.botonMover = Piezas.boton(m, L.t("WAREHOUSE_MOVE_ONE"), alPulsarMover, {borde = true})
  m.botonMover:SetPoint("BOTTOMLEFT", m, "BOTTOMLEFT", MARGEN, MARGEN)
  m.botonMover:ponerApagado(true)

  m:SetScript("OnHide", Piezas.proteger(function()
    quitarDeEspeciales()
    pendiente = false
    SNF.Eventos.dejar("BAG_UPDATE_DELAYED", alCambiarBolsas)
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

SNF.Eventos.escuchar("SNF_ALMACEN", pedirRefresco)
SNF.Eventos.escuchar("PLAYER_REGEN_DISABLED", function()
  if UI.estaAbierta() then
    ponerEstado(L.t("WAREHOUSE_STATE_COMBAT"))
    actualizarPaso()
  end
end)
SNF.Eventos.escuchar("SNF_ALMACEN_MOVER", function()
  if UI.estaAbierta() then
    actualizarPaso()
  end
end)
SNF.Eventos.escuchar("PLAYER_REGEN_ENABLED", pedirRefresco)
