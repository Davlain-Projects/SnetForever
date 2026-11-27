local SNF = SnetForever
local Shopping = {}
SNF.GroupShopping = Shopping

local tick, session
local nextID = 0
local INTERVAL, TIMEOUT, MAX_UNITS = 0.25, 30, 10000
local ORIGIN = "group-shopping"

local function notify()
  SNF.Eventos.emitir("SNF_COMMERCE_SHOPPING")
end

local function keepOpen()
  return SNF.Comercio.activo() and SNF.Comercio.ventanaVisible()
end

local function positive(number)
  return not SNF.API.esSecreto(number) and type(number) == "number" and number > 0 and number < math.huge
end

local function option(job, field)
  return SNF.Operaciones.valor("compras", job.operation, field)
end

-- The shared rules of Operaciones: group inheritance and the ignore lists for this character and house.
local function effectiveOperation(route)
  return (SNF.Operaciones.aplicable(route, "compras"))
end

local function evaluate(job, field)
  return SNF.Operaciones.cobre("compras", job.operation, field, job.item)
end

-- The prudent cap: «Precio máximo», never above the lower of the house market value and the regional price. The second
-- value says which one lowered it ("mercado" or "regional"), or nil when the formula decides.
local function cap(job)
  return SNF.Operaciones.topeCompra("compras", job.operation, job.item)
end

local function inventorySources(job)
  local flags = {}
  for _, source in ipairs(option(job, "fuentesReponer") or {}) do flags[source] = true end
  return flags
end

local function countStock(item, sources)
  if sources.hermandad then return nil end -- The addon has no verified guild inventory.
  local count = SNF.InventarioCuenta.shoppingStock(item, sources)
  if count == nil then return nil end
  if sources.subastas then
    local posted = SNF.MisSubastas.publicadas(item)
    if posted == nil then return nil end
    count = count + posted
  end
  return count
end

local function restockLimit(job, target)
  if target == 0 then return MAX_UNITS end
  local stock = countStock(job.item, inventorySources(job))
  if stock == nil then return nil end
  return math.min(MAX_UNITS, math.max(0, target - stock))
end

local function buyoutRows(lines)
  local ranked, stop = {}, nil
  for _, line in ipairs(lines) do
    local price = line.precioUnidad
    local mixedOwnership = positive(line.propias) and positive(line.comprables)
    if positive(price) and line.mercancia and (line.dudosa or line.cuenta or line.comprables == nil or mixedOwnership) then
      -- Commodity purchases consume the cheapest tiers first. Do not jump a tier of unknown or account stock.
      stop = math.min(stop or price, price)
    elseif positive(price) and positive(line.comprables) and not line.mia and not line.cuenta and not line.dudosa
      and (line.mercancia or positive(line.auctionID)) then
      ranked[#ranked + 1] = line
    end
  end
  table.sort(ranked, function(a, b)
    if a.precioUnidad ~= b.precioUnidad then return a.precioUnidad < b.precioUnidad end
    return (a.auctionID or 0) < (b.auctionID or 0)
  end)
  return ranked, stop
end

local function addRow(scan, job, price, available, quantity, total, overLimit, auctionID)
  nextID = nextID + 1
  local row = {id = nextID, item = job.item, key = job.key, route = job.route, operation = job.operation,
    name = SNF.Datos.nombreItem(job.item), price = price, available = available, quantity = quantity,
    total = total, threshold = job.threshold, clip = job.clip, overLimit = overLimit, auctionID = auctionID, mercancia = not auctionID}
  scan.rows[#scan.rows + 1] = row
  scan.index[row.id] = {row = row, job = job}
end

local function appendResults(scan, job, lines)
  local ranked, stop = buyoutRows(lines)
  local units, available, total, highest = 0, 0, 0, 0
  local posted = {}
  local showOver = option(job, "mostrarSobreMaximo") == true
  for _, line in ipairs(ranked) do
    local price = line.precioUnidad
    if not line.mercancia or not stop or price < stop then
      if price > job.threshold then
        if showOver and (line.mercancia or not posted[line.auctionID]) then
          addRow(scan, job, price, line.comprables, 0, price, true, line.auctionID)
        end
      elseif line.mercancia then
        available = available + line.comprables
        -- Every tier taken is at or under the cap. Checkout confirms only a quote equal to these tiers.
        local take = math.min(job.remaining - units, line.comprables)
        if take > 0 then
          units, total, highest = units + take, total + take * price, price
        end
      elseif not posted[line.auctionID] then
        addRow(scan, job, price, 1, 1, price, false, line.auctionID)
      end
      if line.auctionID then posted[line.auctionID] = true end
    end
  end
  if units > 0 then addRow(scan, job, highest, available, units, total, false) end
end

local function cancelTicker()
  if tick then tick:Cancel(); tick = nil end
end

function Shopping.stop()
  if not session or session.status == "stopped" then return end
  cancelTicker()
  SNF.Busqueda.cancelShopping()
  local purchase = SNF.Compra.estado()
  if purchase and purchase.origen == ORIGIN then SNF.Compra.cancelar() end
  session.status, session.rows, session.index = "stopped", {}, {}
  notify()
end

local function advance(scan)
  if not keepOpen() then Shopping.stop(); return end
  if scan.waitOwned and SNF.MisSubastas.estado() == "pidiendo" and GetTime() < scan.deadline then return end
  scan.waitOwned = false
  local job = scan.jobs[scan.current + 1]
  if not job then
    cancelTicker()
    SNF.Busqueda.cancelShopping()
    scan.status = "complete"
    notify()
    return
  end

  if not scan.searching then
    if job.target == nil then
      local makeKey = C_AuctionHouse.MakeItemKey
      job.key = type(makeKey) == "function" and makeKey(job.item) or {itemID = job.item}
      job.threshold, job.clip = cap(job)
      job.target = evaluate(job, "reponerCantidad")
      if job.target and job.target > 0 and inventorySources(job).subastas and not scan.ownedRequested then
        scan.ownedRequested = true
        if SNF.MisSubastas.pedir() then
          scan.waitOwned, scan.deadline = true, GetTime() + TIMEOUT
          return
        end
      end
    end
    job.remaining = job.key and positive(job.threshold) and job.target ~= nil and restockLimit(job, job.target) or nil
    if job.remaining and job.remaining > 0 and SNF.Busqueda.pedirSubastas(job.key, {shopping = true}) then
      scan.searching = true
      scan.deadline = GetTime() + TIMEOUT
      return
    end
    if job.remaining ~= 0 then scan.skipped = scan.skipped + 1 end
  else
    local lines, info = SNF.Busqueda.subastas(job.key, "shopping")
    if (not info or info.pendiente) and GetTime() < scan.deadline then return end
    if info and info.completa and not info.pendiente and not info.fallo then
      job.key = info.itemKey or job.key
      appendResults(scan, job, lines)
    else
      scan.skipped = scan.skipped + 1
    end
    SNF.Busqueda.cancelShopping()
  end
  scan.current, scan.searching = scan.current + 1, false
  notify()
end

function Shopping.start(groups)
  if type(groups) ~= "table" or not keepOpen() or InCombatLockdown() then return false end
  local purchase = SNF.Compra.estado()
  if purchase and purchase.fase ~= "hecho" and purchase.fase ~= "error" then return false end
  local routes = {}
  for route, checked in pairs(groups) do
    if checked == true and type(route) == "string" and SNF.Arbol.existe(route) then
      routes[#routes + 1] = route
    end
  end
  if #routes == 0 then return false end
  table.sort(routes)
  local scan = {status = "scanning", current = 0, skipped = 0, rows = {}, index = {}, jobs = {}}
  for _, route in ipairs(routes) do
    local operation = effectiveOperation(route)
    if operation then
      for _, object in ipairs(SNF.Arbol.objetos(route)) do
        -- Imported suffix/bonus/pet strings cannot be treated as base IDs. The game's exact search keys differ.
        local item = tonumber(string.match(object, "^i:(%d+)$"))
        if positive(item) and object == "i:" .. item then
          scan.jobs[#scan.jobs + 1] = {item = item, route = route, operation = operation}
        else
          scan.skipped = scan.skipped + 1
        end
      end
    end
  end
  Shopping.stop()
  session = scan
  tick = C_Timer.NewTicker(INTERVAL, function()
    if session == scan and scan.status == "scanning" then
      local ok = SNF.Comercio.ejecutar("group shopping", advance, scan)
      if not ok then Shopping.stop() end
    end
  end)
  notify()
  return true
end

local function copyRow(row)
  if not row then return nil end
  local copy = {}
  for key, value in pairs(row) do copy[key] = value end
  local key = row.key
  copy.key = {itemID = key.itemID, itemLevel = key.itemLevel, itemSuffix = key.itemSuffix, battlePetSpeciesID = key.battlePetSpeciesID}
  return copy
end

function Shopping.summary()
  local scan = session
  if not scan then return {status = "idle", current = 0, total = 0, skipped = 0, count = 0} end
  return {status = scan.status, current = scan.current, total = #scan.jobs, skipped = scan.skipped, count = #scan.rows}
end

function Shopping.page(offset, limit)
  local rows = {}
  if session and type(offset) == "number" and type(limit) == "number" and offset >= 0 and limit >= 1 then
    local last = math.min(#session.rows, math.floor(offset + limit))
    for i = math.floor(offset) + 1, last do rows[#rows + 1] = copyRow(session.rows[i]) end
  end
  return rows
end

function Shopping.result(id)
  local found = session and session.index[id]
  return found and copyRow(found.row) or nil
end

function Shopping.state()
  local snapshot = Shopping.summary()
  snapshot.rows = Shopping.page(0, snapshot.count)
  return snapshot
end

local function recommendation(id, item, price)
  local found = keepOpen() and session and session.status == "complete" and session.index[id]
  if not found then return nil, 0 end
  local row, job = found.row, found.job
  if row.overLimit or row.item ~= item or price > row.price or SNF.Arbol.objeto("i:" .. item) ~= job.route
    or effectiveOperation(job.route) ~= job.operation then return nil, 0 end
  local threshold, target = (cap(job)), evaluate(job, "reponerCantidad")
  if not threshold or price > threshold or target == nil then return nil, 0 end
  return row, math.min(row.quantity, job.remaining, restockLimit(job, target) or 0), math.min(row.threshold, threshold)
end

function Shopping.allow(id, item, quantity, price)
  return positive(quantity) and quantity <= Shopping.limit(id, item, price)
end

function Shopping.limit(id, item, price)
  local units = Shopping.budget(id, item, price)
  return units
end

function Shopping.budget(id, item, price)
  if not positive(price) then return 0 end
  local _, remaining, cap = recommendation(id, item, price)
  return remaining, cap
end

function Shopping.quoteWithinCap(id, item, quantity, total, price)
  if not positive(quantity) or not positive(total) or not positive(price) then return false end
  -- SNF.Compra requires the quote to equal the current tiers at or under the row price, so each unit is bounded
  -- there. This keeps the quantity within the restock and the average within the cap.
  local row, remaining, cap = recommendation(id, item, price)
  return row ~= nil and quantity <= remaining and total <= cap * quantity
end

function Shopping.prepare(id)
  local found = session and session.index[id]
  if not found then return false end
  local row = found.row
  local _, maxUnits = recommendation(id, row.item, row.price)
  if maxUnits < 1 then return false end
  return SNF.Compra.elegir(row.item, {itemKey = row.key, precio = row.price, cantidad = maxUnits, maxUnits = maxUnits,
    auctionID = row.auctionID, total = row.total, origen = ORIGIN, exacta = true, shoppingId = row.id})
end

SNF.Eventos.escuchar("SNF_COMERCIO_COMPRA", function(phase, purchase)
  local found = phase == "hecho" and purchase and purchase.origen == ORIGIN and session and session.index[purchase.shoppingId]
  if not found or not positive(purchase.cantidad) then return end
  local job, row = found.job, found.row
  job.remaining = math.max(0, job.remaining - purchase.cantidad)
  row.quantity = math.max(0, row.quantity - purchase.cantidad)
  row.available = math.max(0, row.available - purchase.cantidad)
  for i = #session.rows, 1, -1 do
    local entry = session.rows[i]
    if entry.item == job.item and not entry.overLimit and (job.remaining == 0 or entry.quantity == 0) then
      session.index[entry.id] = nil
      table.remove(session.rows, i)
    end
  end
  notify()
end)
SNF.Eventos.escuchar("SNF_COMERCIO_CERRADA", Shopping.stop)
SNF.Eventos.escuchar("SNF_COMERCIO_APAGADO", Shopping.stop)
