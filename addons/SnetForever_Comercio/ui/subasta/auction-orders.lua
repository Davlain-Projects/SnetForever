local SNF = SnetForever
local P, L, Theme = SNF.Piezas, SNF.L, SNF.Tema
local Orders, Owned, Window = SNF.AuctionOrders, SNF.MisSubastas, SNF.SubastaVentana
local sell, mine

local function label(parent, role)
  local text = Theme.letra(parent:CreateFontString(nil, "OVERLAY"), role or "texto")
  text:SetJustifyH("LEFT")
  return text
end

local function column(key, textKey, options)
  options.clave, options.titulo = key, L.t(textKey)
  return options
end

local function gold(value)
  return value ~= nil and Theme.dinero(value) or "—"
end

local function groupTitle(route)
  return route ~= "" and route:gsub(SNF.Arbol.SEP, " / ") or L.t("PRINCIPAL_GRUPOS_BASE")
end

local function durationBand(seconds)
  if not seconds then return "unknown" end
  if seconds < 1800 then return "short" end
  if seconds < 7200 then return "medium" end
  return "long"
end

local function selectedGroup(marks, route)
  for path in pairs(marks) do
    if path == route or string.sub(route, 1, #path + 1) == path .. SNF.Arbol.SEP then return true end
  end
  return false
end

local function presets(create)
  if create then SNF.Guardado.preparar() end
  local account = rawget(_G, "SnetForeverCuenta")
  local commerce = type(account) == "table" and account.comercio
  if type(commerce) ~= "table" then return nil end
  if commerce.auctionScans == nil and create then commerce.auctionScans = {recent = {}, favorites = {}} end
  local saved = commerce.auctionScans
  if type(saved) == "table" and type(saved.recent) == "table" and type(saved.favorites) == "table" then return saved end
end

local function presetLabel(preset)
  local groups = {}
  for _, route in ipairs(preset.routes) do groups[#groups + 1] = groupTitle(route) end
  return L.t(preset.mode == "post" and "TRADE_PRESET_POST" or "TRADE_PRESET_CANCEL", table.concat(groups, ", "))
end

local function updatePresets(panel)
  local saved = presets(false)
  local key = panel.favoritesOnly and "favorites" or "recent"
  local rows = {}
  for _, preset in ipairs(saved and saved[key] or {}) do
    if type(preset) == "table" and type(preset.id) == "string" and type(preset.routes) == "table" then
      rows[#rows + 1] = {clave = preset.id, name = presetLabel(preset), preset = preset}
    end
  end
  panel.presetRows = rows
  panel.presets:poner(rows)
end

local function pickedPreset(panel)
  local id = next(panel.presets:marcadas())
  for _, row in ipairs(panel.presetRows or {}) do
    if row.clave == id then return row.preset end
  end
end

local function runPreset(panel, mode, marks)
  if not next(marks) or not Orders.escanear(mode, function(row) return selectedGroup(marks, row.route or row.ruta) end) then
    return
  end
  local saved = presets(true)
  if not saved then return end
  local routes = {}
  for route in pairs(marks) do routes[#routes + 1] = route end
  table.sort(routes)
  local id = mode .. "\001" .. table.concat(routes, "\001")
  for i = #saved.recent, 1, -1 do
    if saved.recent[i].id == id then table.remove(saved.recent, i) end
  end
  table.insert(saved.recent, 1, {id = id, mode = mode, routes = routes})
  if #saved.recent > 12 then table.remove(saved.recent) end
  updatePresets(panel)
end

local function orderLine(panel, row, task, waiting)
  if task and task.phase == "scan" then
    return L.t("TRADE_SCAN_PROGRESS", task.scanned, #task.jobs), nil
  end
  if task and task.mode == "post" and Orders.postUnverified() then
    return L.t("TRADE_ORDER_POST_UNVERIFIED"), nil
  end
  if not row then
    if task and task.issue then return L.t("TRADE_ORDER_" .. string.upper(task.issue)), nil end
    return L.t(task and "TRADE_QUEUE_DONE" or "TRADE_CHOOSE_AUCTION"), nil
  end
  if waiting then return L.t("TRADE_WAIT_RESULT", row.name), nil end
  if row.issue then
    local key = L.t("TRADE_ORDER_" .. string.upper(row.issue))
    if key == "TRADE_ORDER_" .. string.upper(row.issue) then key = L.t("TRADE_ORDER_INELIGIBLE") end
    return row.name .. " · " .. key, nil
  end
  if task.mode == "cancel" then
    local cost = Orders.cancelCost(row)
    local detail = L.t("TRADE_CANCEL_DETAIL", row.name, gold(cost))
    if row.operation then
      local draft = row.draft
      local reason = draft.motivo == "rebajada" and L.t("TRADE_CANCEL_UNDERCUT_REASON", gold(draft.masBarata))
        or L.t("TRADE_CANCEL_REPOST_REASON", gold(draft.nuevo))
      detail = detail .. "\n" .. row.operation .. " · " .. reason
    end
    if cost == nil then return detail, nil end
    return detail, L.t("TRADE_CANCEL"), {row = row, cost = cost}
  end
  local plan = row.draft
  local quote = Orders.postQuote(row)
  if not quote then return row.name .. " · " .. L.t("TRADE_ORDER_CHANGED"), nil end
  local quantity = quote.quantity
  local amount = gold(plan.precioUnidad * quantity)
  local detail = L.t("TRADE_POST_DETAIL", row.name, quantity, gold(plan.precioUnidad), plan.horas)
  detail = detail .. " · " .. L.t("TRADE_LEDGER_DEPOSIT") .. " " .. gold(quote.deposit)
  if plan.confirmar then
    local key = plan.confirmar.motivo == "bajo_vendedor" and "TRADE_LOW_VENDOR" or "TRADE_LOW_MARKET"
    detail = detail .. "\n" .. L.t(key, gold(plan.confirmar.precio), gold(plan.confirmar.referencia))
  end
  local confirm = row.gameConfirmation or row.lowQuantity
  return detail, L.t(confirm and "TRADE_CONFIRM_POST" or "TRADE_POST", quantity, amount), quote
end

local function paintReady(panel)
  local disabled = not (panel.canAct and Orders.enabled())
  if panel.action.snfApagado ~= disabled then
    panel.action:ponerApagado(disabled)
  end
end

local function paintOrder(panel)
  local task, row, waiting = Orders.estado()
  local status, text, quote = orderLine(panel, row, task, waiting)
  panel.status:SetText(status)
  panel.action:ponerTexto(text or L.t(panel.kind == "mine" and "TRADE_CANCEL" or "TRADE_POST_DEFAULT"))
  panel.canAct = text ~= nil
  panel.actionQuote = quote
  paintReady(panel)
  panel.skip:ponerTexto(L.t("TRADE_SKIP"))
  panel.skip:ponerApagado(not row or waiting)
end

local function footer(panel)
  local action = P.boton(panel, L.t("TRADE_POST_DEFAULT"), function()
    if panel.actionQuote then Orders.confirmAction(panel.actionQuote) end
  end, {borde = true})
  action:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -14, 10)
  action:SetScript("OnDoubleClick", function() end)
  panel.action = action
  local skip = P.boton(panel, L.t("TRADE_SKIP"), function() Orders.omitir() end)
  skip:SetPoint("RIGHT", action, "LEFT", -8, 0)
  panel.skip = skip
  local status = label(panel)
  status:SetPoint("TOPLEFT", panel, "BOTTOMLEFT", 14, 74)
  status:SetPoint("TOPRIGHT", panel, "BOTTOMRIGHT", -14, 74)
  status:SetHeight(34)
  status:SetWordWrap(true)
  panel.status = status
end

local function refreshBags()
  if not sell or not sell:IsVisible() then return end
  local rows = {}
  for _, row in ipairs(Orders.deBolsas()) do
    local operation = row.operation
    if operation and row.others and #row.others > 0 then operation = operation .. " +" .. #row.others end
    rows[#rows + 1] = {
      clave = row.id, noMarca = operation == nil, name = row.name, count = row.count, operation = operation,
    }
  end
  sell.bags:poner(rows)
  paintOrder(sell)
end

local function updateSell()
  if not sell or not sell:IsVisible() then return end
  local task = Orders.estado()
  local rows = {}
  if task then
    for _, row in ipairs(task.rows) do
      local state = row.result or row.issue
      local status = state and L.t("TRADE_ORDER_" .. string.upper(state)) or L.t("TRADE_READY")
      if state and status == "TRADE_ORDER_" .. string.upper(state) then status = L.t("TRADE_ORDER_INELIGIBLE") end
      rows[#rows + 1] = {clave = row.id, name = row.name, operation = row.operation, status = status}
    end
  end
  sell.queue:poner(rows)
  paintOrder(sell)
end

local function createSell(panel)
  sell = panel
  panel.kind = "sell"
  local groupTable = P.tabla(panel, {marcar = true, borde = true, columnas = {
    column("group", "TRADE_GROUP", {flex = 1, valor = function(row) return row.name end}),
  }})
  groupTable:SetPoint("TOPLEFT", panel, "TOPLEFT", 14, -42)
  groupTable:SetPoint("BOTTOMLEFT", panel, "BOTTOMLEFT", 14, 227)
  groupTable:SetWidth(220)
  panel.groups = groupTable
  local bags = P.tabla(panel, {marcar = true, menu = true, borde = true, columnas = {
    column("item", "TRADE_BAG_ITEMS", {flex = 2, valor = function(row) return row.name end}),
    column("count", "TRADE_QUANTITY", {ancho = 82, valor = function(row) return row.count end}),
    column("operation", "TRADE_OPERATION", {flex = 1, valor = function(row) return row.operation or "—" end}),
  }})
  bags:SetPoint("TOPLEFT", groupTable, "TOPRIGHT", 10, 0)
  bags:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -14, -42)
  bags:SetPoint("BOTTOMLEFT", panel, "LEFT", 244, 0)
  panel.bags = bags
  local queue = P.tabla(panel, {borde = true, columnas = {
    column("item", "TRADE_QUEUE", {flex = 2, valor = function(row) return row.name end}),
    column("operation", "TRADE_OPERATION", {flex = 1, valor = function(row) return row.operation or "—" end}),
    column("status", "TRADE_STATE", {flex = 1, valor = function(row) return row.status end}),
  }})
  queue:SetPoint("TOPLEFT", bags, "BOTTOMLEFT", 0, -8)
  queue:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -14, 85)
  panel.queue = queue
  local function scan(mode)
    runPreset(panel, mode, groupTable:marcadas())
  end
  local postScan = P.boton(panel, L.t("TRADE_SCAN_POST"), function() scan("post") end)
  postScan:SetPoint("TOPLEFT", panel, "TOPLEFT", 14, -10)
  local cancelScan = P.boton(panel, L.t("TRADE_SCAN_CANCEL"), function() scan("cancel") end)
  cancelScan:SetPoint("LEFT", postScan, "RIGHT", 8, 0)
  local postBags = P.boton(panel, L.t("TRADE_SCAN_BAGS"), function()
    local marks = bags:marcadas()
    if next(marks) then Orders.escanear("post", function(row) return marks[row.id] == true end) end
  end)
  postBags:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -14, -10)
  panel.postScan, panel.cancelScan, panel.postBags = postScan, cancelScan, postBags
  local recent = P.boton(panel, L.t("TRADE_RECENT_SCANS"), function()
    panel.favoritesOnly = not panel.favoritesOnly
    panel.scanMode:ponerTexto(L.t(panel.favoritesOnly and "TRADE_FAVORITE_SCANS" or "TRADE_RECENT_SCANS"))
    updatePresets(panel)
  end)
  recent:SetPoint("TOPLEFT", groupTable, "BOTTOMLEFT", 0, -8)
  panel.scanMode = recent
  local actions = P.tabla(panel, {borde = true, elegir = true, sinCabecera = true, columnas = {
    {clave = "preset", flex = 1, valor = function(row) return row.name end},
  }})
  actions:SetPoint("TOPLEFT", recent, "BOTTOMLEFT", 0, -4)
  actions:SetPoint("TOPRIGHT", groupTable, "BOTTOMRIGHT", 0, -36)
  actions:SetPoint("BOTTOMLEFT", panel, "BOTTOMLEFT", 14, 111)
  panel.presets = actions
  local run = P.boton(panel, L.t("TRADE_RUN_SCAN"), function()
    local picked = pickedPreset(panel)
    if not picked then return end
    local marks = {}
    for _, route in ipairs(picked.routes) do marks[route] = true end
    runPreset(panel, picked.mode, marks)
  end)
  run:SetPoint("TOPLEFT", actions, "BOTTOMLEFT", 0, -4)
  local pin = P.boton(panel, "", function()
    local picked, saved = pickedPreset(panel), presets(true)
    if not picked or not saved then return end
    for i, favorite in ipairs(saved.favorites) do
      if favorite.id == picked.id then
        table.remove(saved.favorites, i)
        updatePresets(panel)
        return
      end
    end
    table.insert(saved.favorites, 1, picked)
    if #saved.favorites > 20 then table.remove(saved.favorites) end
    updatePresets(panel)
  end, {ancho = 26})
  local star = pin:CreateTexture(nil, "OVERLAY")
  star:SetTexture("Interface\\TargetingFrame\\UI-RaidTargetingIcon_1")
  star:SetSize(14, 14)
  star:SetPoint("CENTER", pin, "CENTER", 0, 0)
  pin:SetPoint("LEFT", run, "RIGHT", 8, 0)
  P.ayuda(pin, P.ayudaDe("TRADE_TOGGLE_FAVORITE"))
  footer(panel)
end

local function showSell()
  local groups = {{clave = "", name = groupTitle("")}}
  for _, route in ipairs(SNF.Arbol.ordenadas()) do
    groups[#groups + 1] = {clave = route, name = groupTitle(route)}
  end
  sell.groups:poner(groups)
  updatePresets(sell)
  refreshBags()
  SNF.Eventos.escuchar("BAG_UPDATE_DELAYED", refreshBags)
  updateSell()
end

local function updateMine()
  if not mine or not mine:IsVisible() then return end
  local search = string.lower(mine.search:GetText() or "")
  local rows = {}
  for _, row in ipairs(Owned.lista()) do
    local name = string.lower(row.nombre)
    if (search == "" or string.find(name, search, 1, true) or string.find(string.lower(row.ruta), search, 1, true)) and
        (not mine.soldOnly or row.vendida) and (not mine.hideBids or not row.conPuja) and
        (not mine.bidsOnly or row.conPuja) and (not mine.duration or durationBand(row.tiempo) == mine.duration) and
        (not mine.filterRoute or selectedGroup({[mine.filterRoute] = true}, row.ruta)) then
      row.clave = row.auctionID
      rows[#rows + 1] = row
    end
  end
  mine.list:poner(rows)
  local totals = Owned.totales()
  local state = Owned.estado()
  local emptyText = state == "fallo" and "TRADE_OWNED_FAILED" or "TRADE_OWNED_LOADING"
  mine.totals:SetText(state ~= "lista" and L.t(emptyText) or L.t("TRADE_OWNED_TOTALS", totals.publicadas,
    gold(totals.cobrePublicadas), totals.vendidas, gold(totals.cobreVendidas)))
  paintOrder(mine)
end

local function createMine(panel)
  mine = panel
  panel.kind = "mine"
  local refresh = P.boton(panel, L.t("TRADE_REFRESH"), function() Owned.pedir() end, {borde = true})
  refresh:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -14, -10)
  panel.reload = refresh
  local search = P.campo(panel, {ancho = 200, lupa = true, placeholder = L.t("TRADE_SEARCH_OWNED")})
  search:SetPoint("TOPLEFT", panel, "TOPLEFT", 14, -10)
  search:HookScript("OnTextChanged", P.proteger(updateMine))
  panel.search = search
  local sold = P.casilla(panel, L.t("TRADE_SOLD_ONLY"), function() return panel.soldOnly end, function(value)
    panel.soldOnly = value
    updateMine()
  end)
  sold:SetPoint("LEFT", search, "RIGHT", 12, 0)
  local bids = P.casilla(panel, L.t("TRADE_HIDE_BIDS"), function() return panel.hideBids end, function(value)
    panel.hideBids = value
    if value then panel.bidsOnly = false end
    panel.onlyBids:refrescar()
    updateMine()
  end)
  bids:SetPoint("LEFT", sold, "RIGHT", 12, 0)
  panel.onlyBids = P.casilla(panel, L.t("TRADE_ONLY_BIDS"), function() return panel.bidsOnly end, function(value)
    panel.bidsOnly = value
    if value then panel.hideBids = false end
    bids:refrescar()
    updateMine()
  end)
  panel.onlyBids:SetPoint("TOPLEFT", search, "BOTTOMLEFT", 0, -12)
  local duration = P.desplegable(panel, {ancho = 160,
    opciones = {{"all", L.t("TRADE_ALL_DURATIONS")}, {"short", L.t("TRADE_SHORT_DURATION")},
      {"medium", L.t("TRADE_MEDIUM_DURATION")}, {"long", L.t("TRADE_LONG_DURATION")}},
    get = function() return panel.duration or "all" end,
    set = function(value) panel.duration = value ~= "all" and value or nil; updateMine() end,
  })
  duration:SetPoint("LEFT", panel.onlyBids, "RIGHT", 16, 0)
  local groups = {{"\001", L.t("TRADE_ALL_GROUPS")}, {"", groupTitle("")}}
  for _, route in ipairs(SNF.Arbol.ordenadas()) do
    groups[#groups + 1] = {route, groupTitle(route)}
  end
  local group = P.desplegable(panel, {ancho = 205, opciones = groups,
    get = function() return panel.filterRoute or "\001" end,
    set = function(value) panel.filterRoute = value ~= "\001" and value or nil; updateMine() end,
  })
  group:SetPoint("LEFT", duration, "RIGHT", 12, 0)
  panel.list = P.tabla(panel, {borde = true, menu = true, elegir = true, columnas = {
    column("item", "TRADE_ITEM", {flex = 3, valor = function(row) return row.nombre end}),
    column("count", "TRADE_QUANTITY", {ancho = 82, valor = function(row) return row.cantidad end}),
    column("group", "TRADE_GROUP", {flex = 2, valor = function(row) return groupTitle(row.ruta) end}),
    column("bid", "TRADE_BID", {ancho = 90, valor = function(row) return row.puja end,
      pintar = function(cell, row) cell.texto:SetText(row.conPuja and gold(row.puja) or "—") end}),
    column("price", "TRADE_BUYOUT", {ancho = 102, valor = function(row) return row.precioBruto end,
      pintar = function(cell, row) cell.texto:SetText(gold(row.precioBruto)) end}),
    column("state", "TRADE_STATE", {flex = 2, valor = function(row)
      if row.ida then return L.t("TRADE_OWNED_" .. string.upper(row.ida)) end
      if row.vendida then return L.t("TRADE_SOLD_GROSS") end
      return row.tiempo and L.t("TRADE_MINUTES", math.ceil(row.tiempo / 60)) or "—"
    end}),
  }, totales = function(_, marks)
    local selected = next(marks)
    if selected then Orders.elegir(selected) end
  end})
  panel.list:SetPoint("TOPLEFT", panel, "TOPLEFT", 14, -69)
  panel.list:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -14, 104)
  panel.totals = label(panel)
  panel.totals:SetPoint("BOTTOMLEFT", panel, "BOTTOMLEFT", 14, 86)
  footer(panel)
end

local function updateOrders()
  updateSell()
  if mine and mine:IsVisible() then paintOrder(mine) end
end

local READY = "AUCTION_HOUSE_THROTTLED_SYSTEM_READY"
local function updateReady()
  -- Other events refresh the queue. Here only the action button's state can change.
  if sell and sell:IsVisible() then paintReady(sell) end
  if mine and mine:IsVisible() then paintReady(mine) end
end

local function leaveOrders()
  SNF.Eventos.dejar(READY, updateReady)
  Orders.parar()
end

Window.registrar("subasta", {crear = createSell, mostrar = function()
  SNF.Eventos.escuchar(READY, updateReady)
  showSell()
end,
  ocultar = function()
    SNF.Eventos.dejar("BAG_UPDATE_DELAYED", refreshBags)
    leaveOrders()
  end,
  idioma = function() if sell and sell:IsVisible() then showSell() end end,
})
Window.registrar("misSubastas", {crear = createMine, mostrar = function()
  SNF.Eventos.escuchar(READY, updateReady)
  Owned.olvidarIdas()
  Owned.pedir()
  updateMine()
end, ocultar = leaveOrders, idioma = updateMine})

SNF.Eventos.escuchar("SNF_COMMERCE_ORDERS", updateOrders)
SNF.Eventos.escuchar("SNF_COMERCIO_ESCANEO", updateOrders)
SNF.Eventos.escuchar("SNF_COMERCIO_BUSQUEDA", updateOrders)
SNF.Eventos.escuchar("PLAYER_REGEN_ENABLED", updateOrders)
SNF.Eventos.escuchar("PLAYER_REGEN_DISABLED", updateOrders)
SNF.Eventos.escuchar("SNF_COMERCIO_MIS", function()
  updateMine()
  updateSell()
end)
