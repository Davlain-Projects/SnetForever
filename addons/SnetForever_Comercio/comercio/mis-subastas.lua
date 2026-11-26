local SNF = SnetForever
local MisSubastas = {}
SNF.MisSubastas = MisSubastas

local Eventos, API = SNF.Eventos, SNF.API
local request, rows, state = nil, {}, "nada"
local confirmedCancelled = {}
local onUpdated
local scheduled = false
local READ_TIMEOUT, READY_TIMEOUT = 15, 30

local function number(value)
  return not API.esSecreto(value) and type(value) == "number" and value >= 0 and value < math.huge and value or nil
end

local function notice(newState)
  state = newState
  if scheduled then return end
  scheduled = true
  C_Timer.After(0, function()
    scheduled = false
    Eventos.emitir("SNF_COMERCIO_MIS", state)
  end)
end

local function finish(newState)
  request = nil
  Eventos.dejar("OWNED_AUCTIONS_UPDATED", onUpdated)
  notice(newState)
end

local function fromApi(info)
  if type(info) ~= "table" or API.esSecreto(info) then return nil end
  local key = info.itemKey
  local id = number(info.auctionID)
  local item = type(key) == "table" and number(key.itemID)
  local quantity = number(info.quantity)
  local status = number(info.status)
  if not id or id == 0 or not item or item == 0 or not quantity or quantity == 0 or (status ~= 0 and status ~= 1) then
    return nil
  end
  local link = not API.esSecreto(info.itemLink) and type(info.itemLink) == "string" and info.itemLink or nil
  local details = API.infoObjeto(link or item) or {}
  local gross = number(info.buyoutAmount) or 0
  local bid = number(info.bidAmount) or 0
  local bidder = info.bidder
  return {
    auctionID = id, item = item, itemLink = link, itemKey = {
      itemID = item, itemLevel = number(key.itemLevel) or 0, itemSuffix = number(key.itemSuffix) or 0,
      battlePetSpeciesID = number(key.battlePetSpeciesID) or 0,
    },
    nombre = details.nombre or ("#" .. item), calidad = details.ca, cantidad = quantity,
    precioUnidad = math.floor(gross / quantity), precioBruto = gross, puja = bid, tiempo = number(info.timeLeftSeconds),
    conPuja = not API.esSecreto(bidder) and type(bidder) == "string" and bidder ~= "",
    vendida = status == 1, ruta = SNF.Arbol.objeto("i:" .. item) or "",
  }
end

local function read()
  if not request or not request.sent or not SNF.Comercio.ventanaVisible() then return end
  local auction = C_AuctionHouse
  if not auction.HasFullOwnedAuctionResults() then return end
  local fresh, order = {}, {}
  for index = 1, number(auction.GetNumOwnedAuctions()) or 0 do
    local row = fromApi(auction.GetOwnedAuctionInfo(index))
    if row and not confirmedCancelled[row.auctionID] and not fresh[row.auctionID] then
      fresh[row.auctionID] = row
      order[#order + 1] = row
    end
  end
  local result, inserted = {}, {}
  for _, previous in ipairs(rows) do
    local id = previous.auctionID
    if not fresh[id] then
      previous.ida = previous.ida or "no_esta"
    end
    result[#result + 1], inserted[id] = fresh[id] or previous, true
  end
  for _, row in ipairs(order) do
    if not inserted[row.auctionID] then result[#result + 1] = row end
  end
  rows = result
  finish("lista")
end

local function attempt()
  local pending = request
  if not pending or pending.sent or not SNF.Comercio.ventanaVisible() then return end
  local auction = C_AuctionHouse
  if GetTime() >= pending.deadline then
    finish("fallo")
    return
  end
  local purchase = SNF.Compra.estado()
  if SNF.Busqueda.ocupada() or SNF.Escaneo.enCamino() or (purchase and purchase.fase == "comprando") or
      not auction.IsThrottledMessageSystemReady() then
    C_Timer.After(0.25, function() if request == pending then attempt() end end)
    return
  end
  if not SNF.Comercio.ventanaVisible() then return end
  pending.sent = true
  local ok = pcall(auction.QueryOwnedAuctions, {})
  if not ok then
    finish("fallo")
    return
  end
  C_Timer.After(READ_TIMEOUT, function()
    if request == pending then
      finish("fallo")
    end
  end)
end

function MisSubastas.pedir()
  if not SNF.Comercio.ventanaVisible() then return false end
  if request then return true end
  local auction = rawget(_G, "C_AuctionHouse")
  if not auction or not rawget(auction, "QueryOwnedAuctions") or not rawget(auction, "GetNumOwnedAuctions") or
      not rawget(auction, "GetOwnedAuctionInfo") or not rawget(auction, "HasFullOwnedAuctionResults") or
      not rawget(auction, "IsThrottledMessageSystemReady") then
    notice("fallo")
    return false
  end
  request = {deadline = GetTime() + READY_TIMEOUT}
  Eventos.escuchar("OWNED_AUCTIONS_UPDATED", onUpdated)
  notice("pidiendo")
  attempt()
  return true
end

function MisSubastas.estado()
  return state
end

function MisSubastas.lista()
  if state ~= "lista" then return {} end
  local copy = {}
  for _, row in ipairs(rows) do
    local entry, key = {}, {}
    for k, v in pairs(row) do entry[k] = v end
    for k, v in pairs(row.itemKey) do key[k] = v end
    entry.itemKey = key
    copy[#copy + 1] = entry
  end
  return copy
end

function MisSubastas.publicadas(item)
  if state ~= "lista" then return nil end
  local total = 0
  for _, row in ipairs(rows) do
    if row.item == item and not row.vendida and not row.ida then
      total = total + row.cantidad
    end
  end
  return total
end

function MisSubastas.totales()
  local totals = {vendidas = 0, cobreVendidas = 0, publicadas = 0, cobrePublicadas = 0}
  if state ~= "lista" then return totals end
  for _, row in ipairs(rows) do
    if not row.ida then
      if row.vendida then
        totals.vendidas = totals.vendidas + 1
        totals.cobreVendidas = totals.cobreVendidas + row.precioBruto
      else
        totals.publicadas = totals.publicadas + 1
        totals.cobrePublicadas = totals.cobrePublicadas + row.precioBruto
      end
    end
  end
  return totals
end

function MisSubastas.marcarCancelada(id)
  confirmedCancelled[id] = true
  for _, row in ipairs(rows) do
    if row.auctionID == id then row.ida = "cancelada" end
  end
end

function MisSubastas.olvidarIdas()
  local live = {}
  for _, row in ipairs(rows) do
    if not row.ida then live[#live + 1] = row end
  end
  rows = live
end

function MisSubastas.parar()
  rows, confirmedCancelled = {}, {}
  finish("nada")
end
MisSubastas.ceder = MisSubastas.parar

onUpdated = function()
  if request then
    SNF.Comercio.ejecutar("owned auctions", read)
  end
end
