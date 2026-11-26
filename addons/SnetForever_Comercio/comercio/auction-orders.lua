local SNF = SnetForever
local Orders = {}
SNF.AuctionOrders = Orders

local API = SNF.API
local queue, action, nextClick = nil, nil, 0
local unresolvedPost, syncPostWatch
local acceptedPostIDs = {}
local acknowledgedBagLimits = {}
local actionEvents = {}
local SCAN_TIMEOUT, ACTION_TIMEOUT = 35, 15

local function auctionFunction(name)
  local auction = rawget(_G, "C_AuctionHouse")
  return type(auction) == "table" and rawget(auction, name) or nil
end

local function usableNumber(value)
  return not API.esSecreto(value) and type(value) == "number" and value >= 0 and value < math.huge
end

local function keyID(key)
  if type(key) ~= "table" or not usableNumber(key.itemID) or key.itemID == 0 then return nil end
  return table.concat({key.itemID, key.itemLevel or 0, key.itemSuffix or 0, key.battlePetSpeciesID or 0}, ":")
end

local function notify()
  SNF.Eventos.emitir("SNF_COMMERCE_ORDERS")
end

function Orders.deBolsas()
  local byKey, rows = {}, {}
  local location = rawget(_G, "ItemLocation")
  local classify = auctionFunction("GetItemCommodityStatus")
  local sellable = auctionFunction("IsSellItemValid")
  local getKey = auctionFunction("GetItemKeyFromItem")
  if not location or not classify or not sellable or not getKey then return rows end
  for _, bag in ipairs(API.bolsasPropias()) do
    for slot = 1, API.huecosBolsa(bag) or 0 do
      local data = API.infoContenedor(bag, slot)
      if data and data.l ~= 1 and data.n > 0 then
        local loc = location:CreateFromBagAndSlot(bag, slot)
        if loc:IsValid() and sellable(loc, false) then
          local key = getKey(loc)
          local id = keyID(key)
          local commodity = classify(loc)
          if id and (commodity == 1 or commodity == 2) then
            local row = byKey[id]
            if not row then
              local info = API.infoObjeto(data.enlace or data.id) or {}
              local name, route, others = SNF.Vender.operacion(data.id)
              row = {
                id = id, item = data.id, key = key, name = info.nombre or ("#" .. data.id),
                route = name and route or (SNF.Arbol.objeto("i:" .. data.id) or ""), operation = name,
                others = others, commodity = commodity == 2, count = 0, location = loc,
              }
              byKey[id], rows[#rows + 1] = row, row
            end
            row.count = row.count + data.n
          end
        end
      end
    end
  end
  table.sort(rows, function(left, right)
    local a, b = string.lower(left.name), string.lower(right.name)
    if a ~= b then return a < b end
    return left.id < right.id
  end)
  return rows
end

local function currentRow()
  return queue and queue.rows[queue.index] or nil
end

local function waitForClick()
  nextClick = GetTime() + 0.5
  local expected = queue
  C_Timer.After(0.5, function()
    if queue == expected and queue then notify() end
  end)
end

local function advance()
  queue.index = queue.index + 1
  waitForClick()
  notify()
end

local function watchAction(listen)
  for event, handler in pairs(actionEvents) do
    if listen then
      SNF.Eventos.escuchar(event, handler)
    else
      SNF.Eventos.dejar(event, handler)
    end
  end
end

local function completed(success, issue, createdID, definitiveRejection)
  local pending = action
  if not pending then return end
  action = nil
  watchAction(false)
  local row = pending.row
  row.gameConfirmation = nil
  if not success then
    row.issue = issue or "rejected"
    row.blocked = true
    if pending.mode == "post" and not definitiveRejection then
      queue.recheckItems[row.item] = true
      unresolvedPost = pending
    end
  elseif pending.mode == "cancel" then
    SNF.MisSubastas.marcarCancelada(row.auctionID)
    row.result = "cancelled"
  else
    acceptedPostIDs[createdID] = true
    acknowledgedBagLimits[row.bagID] = pending.inventoryAfter
    row.remaining = row.remaining - pending.quantity
    queue.postedByKey[row.bagID] = (queue.postedByKey[row.bagID] or 0) + pending.quantity
    queue.ownedFloor[row.item] = pending.ownedAfter
    if row.remaining == 0 then row.result = "posted" end
  end
  syncPostWatch()
  if pending.mode == "cancel" and SNF.Comercio.ventanaVisible() then SNF.MisSubastas.pedir() end
  if success and row.result then
    advance()
  else
    waitForClick()
    notify()
  end
end

local function postToReconcile()
  if action and action.mode == "post" then return action end
  return unresolvedPost
end

local function ownedPostSnapshot()
  local pending = postToReconcile()
  if not pending or pending.ambiguous or SNF.MisSubastas.estado() ~= "lista" then return end
  local match
  for _, owned in ipairs(SNF.MisSubastas.lista()) do
    local id = owned.auctionID
    -- An event can be missed while closed. A detached submission can settle
    -- only from a unique exact match newly present in the complete owned list.
    local newDetachedListing = pending == unresolvedPost and not pending.before[id] and not acceptedPostIDs[id]
    if (pending.created[id] or newDetachedListing) and not owned.ida and owned.cantidad == pending.quantity
      and owned.item == pending.row.item and (pending.row.draft.mercancia or keyID(owned.itemKey) == pending.itemKey)
      and owned.precioBruto == pending.total then
      if match then pending.ambiguous = true; return end
      match = id
    end
  end
  if not match then return end
  if pending == action then
    completed(true, nil, match)
  else
    acceptedPostIDs[match] = true
    acknowledgedBagLimits[pending.row.bagID] = pending.inventoryAfter
    unresolvedPost = nil
    syncPostWatch()
    notify()
  end
end

local function auctionCreated(id)
  local pending = postToReconcile()
  if not pending or not SNF.Comercio.ventanaVisible() or not usableNumber(id) or id == 0
    or acceptedPostIDs[id] or pending.before[id] then return end
  pending.created[id] = true
  SNF.MisSubastas.pedir()
end

syncPostWatch = function()
  local events = SNF.Eventos
  if queue and queue.mode == "post" and postToReconcile() then
    events.escuchar("AUCTION_HOUSE_AUCTION_CREATED", auctionCreated)
    events.escuchar("SNF_COMERCIO_MIS", ownedPostSnapshot)
  else
    events.dejar("AUCTION_HOUSE_AUCTION_CREATED", auctionCreated)
    events.dejar("SNF_COMERCIO_MIS", ownedPostSnapshot)
  end
end

local function operationsForBag(row)
  local operations = {row.operation}
  for _, name in ipairs(row.others or {}) do operations[#operations + 1] = name end
  return operations
end

-- A rescan creates a new queue before the client necessarily updates its bags.
-- Keep the acknowledged balance until a fresh bag read reflects that post.
local function availableInBags(key, observed)
  local limit = acknowledgedBagLimits[key]
  if limit == nil then return observed end
  if observed > limit then return limit end
  acknowledgedBagLimits[key] = nil
  return observed
end

local function jobFor(mode, row)
  if mode == "post" and row.operation then
    row.count = availableInBags(row.id, row.count)
    row.operations = operationsForBag(row)
    return row
  end
  if mode == "cancel" and not row.vendida and not row.ida then
    local operations = SNF.Vender.applicableOperations(row.item)
    if #operations > 0 then
      return {id = row.auctionID, key = row.itemKey, item = row.item, name = row.nombre,
        operations = operations, auction = row}
    end
  end
end

local function appendPlan(task, row)
  local draft = row.draft
  row.blocked = not (draft.publicar or draft.cancelar)
  row.issue = row.blocked and draft.motivo or nil
  task.rows[#task.rows + 1] = row
end

local function preparePostRows(task, job, market)
  local planned = task.plannedByItem[job.item] or 0
  local owned = SNF.MisSubastas.publicadas(job.item)
  local plans, units = SNF.Vender.postPlans(job.item, job.operations, market, job.count, owned + planned, job.commodity)
  for index, plan in ipairs(plans) do
    appendPlan(task, {id = job.id .. ":" .. index, bagID = job.id, item = job.item, name = job.name,
      draft = plan.draft, remaining = plan.draft.unidades, operation = plan.operation, operations = job.operations,
      inventory = job.count})
  end
  task.plannedByItem[job.item] = planned + units
end

local function scanStep(task)
  if queue ~= task or not SNF.Comercio.ventanaVisible() then return end
  if SNF.MisSubastas.estado() == "fallo" or GetTime() >= task.deadline then
    task.phase, task.issue = "ready", "scan_timeout"
    SNF.Busqueda.cancelSale()
    notify()
    return
  end
  if SNF.MisSubastas.estado() == "lista" then
    if task.mode == "cancel" and not task.prepared then
      task.prepared = true
      local seen = {}
      for _, row in ipairs(SNF.MisSubastas.lista()) do
        local job = not seen[row.auctionID] and task.selectRow(row) and jobFor("cancel", row)
        if job then
          seen[row.auctionID] = true
          task.jobs[#task.jobs + 1] = job
        end
      end
    end
    local job = task.jobs[task.scanned + 1]
    if not job then
      task.phase = "ready"
      SNF.Busqueda.cancelSale()
      notify()
      return
    end
    if not task.query then
      task.query = SNF.Busqueda.pedirSubastas(job.key, {vender = true})
      if task.query then task.deadline = GetTime() + SCAN_TIMEOUT end
    else
      local rows, info = SNF.Busqueda.subastas(job.key, "vender")
      if info and not info.pendiente then
        task.scanned, task.query = task.scanned + 1, nil
        if info.completa and not info.fallo then
          if task.mode == "post" then
            preparePostRows(task, job, rows)
          else
            local plan, snapshots = SNF.Vender.cancelPlan(job.auction, job.operations, rows)
            appendPlan(task, {id = job.id, auctionID = job.auction.auctionID, item = job.item, name = job.name,
              operation = plan.operation, operations = job.operations, draft = plan.draft, auction = job.auction,
              ruleSnapshots = snapshots})
          end
        else
          task.rows[#task.rows + 1] = {id = job.id, item = job.item, name = job.name, blocked = true, issue = "incomplete"}
        end
        notify()
      end
    end
  end
  C_Timer.After(0.25, function()
    SNF.Comercio.ejecutar("auction scan", scanStep, task)
  end)
end

function Orders.escanear(mode, selected)
  if action or not SNF.Comercio.ventanaVisible() or not SNF.MisSubastas.pedir() then return false end
  SNF.Busqueda.cancelSale()
  local task = {mode = mode, deadline = GetTime() + SCAN_TIMEOUT, phase = "scan", rows = {}, jobs = {}, index = 1,
    scanned = 0, plannedByItem = {}, postedByKey = {}, ownedFloor = {}, recheckItems = {}}
  if mode == "post" then
    for _, row in ipairs(Orders.deBolsas()) do
      local job = selected(row) and jobFor("post", row)
      if job then task.jobs[#task.jobs + 1] = job end
    end
  else
    task.selectRow = selected
  end
  queue = task
  syncPostWatch()
  scanStep(task)
  notify()
  return true
end

function Orders.escanearItem(item, key)
  local target = keyID(key)
  return Orders.escanear("post", function(row)
    return row.item == item and (row.commodity or not target or row.id == target)
  end)
end

function Orders.elegir(id)
  if action or not SNF.Comercio.ventanaVisible() then return false end
  for _, row in ipairs(SNF.MisSubastas.lista()) do
    if row.auctionID == id and not row.vendida and not row.ida then
      queue = {mode = "cancel", phase = "ready", index = 1, rows = {
        {id = id, auctionID = id, item = row.item, name = row.nombre},
      }}
      syncPostWatch()
      notify()
      return true
    end
  end
  return false
end

function Orders.estado()
  if not queue then return nil end
  return queue, currentRow(), action ~= nil
end

function Orders.postUnverified()
  return unresolvedPost ~= nil
end

function Orders.omitir()
  local row = currentRow()
  if action or not row or queue.phase ~= "ready" then return false end
  row.result = "skipped"
  advance()
  return true
end

local function startAction(row, mode, fn, terms, ...)
  if not fn or not SNF.Comercio.ventanaVisible() then return false end
  local pending = {mode = mode, row = row, quantity = terms and terms.quantity, ownedAfter = terms and terms.ownedAfter,
    inventoryAfter = terms and terms.inventoryAfter}
  if mode == "post" then
    pending.before, pending.created = {}, {}
    pending.itemKey, pending.total = row.bagID, row.draft.precioUnidad * terms.quantity
    for _, owned in ipairs(SNF.MisSubastas.lista()) do pending.before[owned.auctionID] = true end
  end
  action = pending
  watchAction(true)
  syncPostWatch()
  local ok, requiresConfirmation = pcall(fn, ...)
  if not ok then
    if action == pending then completed(false, nil, nil, next(pending.created or {}) == nil) end
    return false
  end
  if action ~= pending then return true end
  if mode == "post" and requiresConfirmation == true then
    row.gameConfirmation, action = terms.quantity, nil
    watchAction(false)
    syncPostWatch()
    waitForClick()
    notify()
    return true
  end
  C_Timer.After(ACTION_TIMEOUT, function()
    if action == pending then completed(false, "action_timeout") end
  end)
  notify()
  return true
end

local function sameOperationOrder(original, current)
  if #current ~= #original then return false end
  for index, name in ipairs(original) do
    if current[index] ~= name then return false end
  end
  return true
end

local function postingTerms(row)
  if not queue or unresolvedPost or queue.recheckItems[row.item] then return nil end
  local available, deposit
  for _, bag in ipairs(Orders.deBolsas()) do
    if bag.id == row.bagID and sameOperationOrder(row.operations, operationsForBag(bag)) then
      available = bag
      break
    end
  end
  local draft = row.draft
  if not available then return nil end
  local current = SNF.Vender.cantidades(row.item, row.operation)
  if not current or not SNF.Vender.rulesUnchanged(row.item, row.operation, "post", row.draft.rules, current) then
    return nil
  end
  local ledger = rawget(SNF, "Contabilidad")
  if current.caducadas > 0 and ledger and ledger.expirations(row.item) >= current.caducadas then return nil end
  local owned = SNF.MisSubastas.publicadas(row.item)
  if owned == nil then return nil end
  -- Bag updates and the owned-auction snapshot can lag behind a successful post.
  local remainingBags = math.min(availableInBags(row.bagID, available.count),
    row.inventory - (queue.postedByKey[row.bagID] or 0))
  local activeUnits = math.max(owned, queue.ownedFloor[row.item] or 0)
  local maxPost = auctionFunction("GetAvailablePostCount")
  local limit = maxPost and maxPost(available.location)
  if not usableNumber(limit) then return nil end
  local quantity = math.floor(math.min(row.remaining, draft.porPublicacion,
    remainingBags - current.reserva, current.tope - activeUnits, limit))
  if quantity <= 0 or (row.gameConfirmation and row.gameConfirmation ~= quantity) then return nil end
  local location = available.location
  if draft.mercancia then
    local calculate = auctionFunction("CalculateCommodityDeposit")
    deposit = calculate and calculate(row.item, draft.duracion, quantity)
  else
    local calculate = auctionFunction("CalculateItemDeposit")
    deposit = calculate and calculate(location, draft.duracion, quantity)
  end
  if not usableNumber(deposit) then return nil end
  return {quantity = quantity, location = location, deposit = deposit, ownedAfter = activeUnits + quantity,
    inventoryAfter = remainingBags - quantity}
end

function Orders.postQuote(row)
  local terms = row == currentRow() and row and row.draft and row.draft.publicar and postingTerms(row)
  if terms then return {row = row, quantity = terms.quantity, deposit = terms.deposit} end
end

function Orders.deposit(row)
  local quote = Orders.postQuote(row)
  return quote and quote.deposit or nil
end

local function post(row, shown)
  local terms = postingTerms(row)
  local gold = GetMoney()
  if not terms or not usableNumber(gold) or terms.deposit > gold then return false end
  local quantity, location, draft = terms.quantity, terms.location, row.draft
  if shown and (shown.quantity ~= quantity or shown.deposit ~= terms.deposit) then
    notify()
    return true
  end
  if draft.confirmar and not row.gameConfirmation and (row.lowQuantity ~= quantity or row.lowDeposit ~= terms.deposit) then
    row.lowQuantity, row.lowDeposit = quantity, terms.deposit
    waitForClick()
    notify()
    return true
  end
  row.lowQuantity, row.lowDeposit = nil, nil
  if draft.mercancia then
    local send = auctionFunction(row.gameConfirmation and "ConfirmPostCommodity" or "PostCommodity")
    return startAction(row, "post", send, terms,
      location, draft.duracion, quantity, draft.precioUnidad)
  end
  local send = auctionFunction(row.gameConfirmation and "ConfirmPostItem" or "PostItem")
  return startAction(row, "post", send, terms,
    location, draft.duracion, quantity, draft.puja, draft.precioUnidad)
end

function Orders.cancelCost(row)
  local cost = auctionFunction("GetCancelCost")
  local amount = row and row.auctionID and cost and cost(row.auctionID)
  if usableNumber(amount) then return amount end
end

local function cancellationRulesUnchanged(row)
  for name, snapshot in pairs(row.ruleSnapshots) do
    if not SNF.Vender.rulesUnchanged(row.item, name, "cancel", snapshot) then return false end
  end
  return true
end

local function cancel(row, shown)
  local present = false
  for _, owned in ipairs(SNF.MisSubastas.lista()) do
    if owned.auctionID == row.auctionID and not owned.vendida and not owned.ida and owned.item == row.item then
      local prior = row.auction
      present = not prior or (owned.cantidad == prior.cantidad and owned.precioBruto == prior.precioBruto
        and owned.conPuja == prior.conPuja and sameOperationOrder(row.operations, SNF.Vender.applicableOperations(row.item))
        and cancellationRulesUnchanged(row))
      break
    end
  end
  local allowed = auctionFunction("CanCancelAuction")
  local cost, gold = Orders.cancelCost(row), GetMoney()
  if not present or not allowed or allowed(row.auctionID) ~= true or cost == nil or not usableNumber(gold) or cost > gold then
    return false
  end
  if shown and shown.cost ~= cost then
    notify()
    return true
  end
  return startAction(row, "cancel", auctionFunction("CancelAuction"), nil, row.auctionID)
end

function Orders.enabled()
  local row = currentRow()
  if action or not row or queue.phase ~= "ready" or row.blocked or row.result or GetTime() < nextClick or
      SNF.MisSubastas.estado() ~= "lista" or not SNF.Comercio.ventanaVisible() or InCombatLockdown() or
      SNF.Busqueda.ocupada() or SNF.Escaneo.enCamino() then
    return false
  end
  if queue.mode == "post" and unresolvedPost then return false end
  local ready = auctionFunction("IsThrottledMessageSystemReady")
  local purchase = SNF.Compra.estado()
  if purchase and (purchase.fase == "comprando" or purchase.fase == "confirmar") then return false end
  return ready and ready() == true or false
end

function Orders.confirmAction(shown)
  if not Orders.enabled() then return false end
  local row = currentRow()
  if shown and shown.row ~= row then return false end
  local ok
  if queue.mode == "post" then ok = post(row, shown) else ok = cancel(row, shown) end
  if not ok and not row.blocked then
    row.issue = "changed"
    notify()
  end
  return ok
end

function Orders.parar()
  if action and action.mode == "post" then unresolvedPost = action end
  queue, action = nil, nil
  watchAction(false)
  syncPostWatch()
  SNF.Busqueda.cancelSale()
  notify()
end
Orders.ceder = Orders.parar

actionEvents.AUCTION_CANCELED = function(id)
  if action and action.mode == "cancel" and action.row.auctionID == id then completed(true) end
end
actionEvents.AUCTION_HOUSE_SHOW_ERROR = function()
  if action then completed(false) end
end
actionEvents.AUCTION_HOUSE_POST_ERROR = function()
  if action and action.mode == "post" then completed(false, nil, nil, next(action.created) == nil) end
end
actionEvents.AUCTION_MULTISELL_FAILURE = function()
  if action and action.mode == "post" then completed(false) end
end
