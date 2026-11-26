-- Formula inputs observed from the last merchant this character opened.
-- Vendedor (phase 4 of the TSM parity plan) also reads the open merchant's catalog, read only:
--   MerchantPrices.abierto() -> boolean
--   MerchantPrices.catalogo() -> rows | nil   while the merchant is open. row = {indice, item | nil, precio (copper per
--     unit) | nil, pila, disponibles (-1 = unlimited) | nil, variante, motivo | nil}. motivo: "sin_leer" (no info or no
--     item ID), "coste_no_oro" (extended cost, currency or spell), "no_disponible" (not purchasable or none left),
--     "precio" (price or stack size unreadable). Nothing is bought.
local SNF = SnetForever
local MerchantPrices = {}
SNF.MerchantPrices = MerchantPrices

local MAX_ITEMS = 512
local MAX_ITEM_ID = 2147483647
local MAX_COPPER = 1e15
local TTL = 15 * 60
local observed
local merchantOpen = false

local isSecret = SNF.API.esSecreto

local function read(fn, ...)
  if type(fn) ~= "function" then return nil end
  local ok, value = pcall(fn, ...)
  if ok and not isSecret(value) then return value end
end

local function integerInRange(value, minimum, maximum)
  return type(value) == "number" and not isSecret(value)
    and value >= minimum and value <= maximum and value == math.floor(value)
end

local function goldUnitPrice(info)
  if type(info) ~= "table" then return nil end
  local extended, currency, spell = info.hasExtendedCost, info.currencyID, info.spellID
  local purchasable, available = info.isPurchasable, info.numAvailable
  if isSecret(extended) or extended ~= false or isSecret(currency) or currency ~= nil
    or isSecret(spell) or spell ~= nil or isSecret(purchasable) or purchasable ~= true
    or not integerInRange(available, -1, MAX_ITEM_ID) or available == 0 then
    return nil
  end
  local price, count = info.price, info.stackCount
  if not integerInRange(price, 1, MAX_COPPER) or not integerInRange(count, 1, MAX_ITEM_ID) then
    return nil
  end
  return price / count
end

-- Why a catalog row has no gold unit price (the same checks as goldUnitPrice, named).
local function catalogReason(info)
  if type(info) ~= "table" then return "sin_leer" end
  local extended, currency, spell = info.hasExtendedCost, info.currencyID, info.spellID
  if isSecret(extended) or extended ~= false or isSecret(currency) or currency ~= nil or isSecret(spell) or spell ~= nil then
    return "coste_no_oro"
  end
  local purchasable, available = info.isPurchasable, info.numAvailable
  if isSecret(purchasable) or purchasable ~= true or not integerInRange(available, -1, MAX_ITEM_ID) or available == 0 then
    return "no_disponible"
  end
  return "precio"
end

-- A merchant link with a random suffix or bonus IDs is not the base item.
local function isVariantLink(link)
  local body = type(link) == "string" and link:match("|Hitem:([%-%d:]+)")
  if not body then return nil end
  local fields = {}
  for value in string.gmatch(body .. ":", "([^:]*):") do fields[#fields + 1] = value end
  local suffix, bonuses = tonumber(fields[7] or ""), tonumber(fields[13] or "")
  return (suffix ~= nil and suffix ~= 0) or (bonuses ~= nil and bonuses > 0)
end

local catalog

local function observe()
  if not merchantOpen then return end
  observed, catalog = nil, nil
  local api = rawget(_G, "C_MerchantFrame")
  local count = read(rawget(_G, "GetMerchantNumItems"))
  if count == nil and type(api) == "table" then count = read(api.GetNumItems) end
  if type(api) ~= "table" or not integerInRange(count, 1, MAX_ITEMS) then return end

  local itemID = rawget(_G, "GetMerchantItemID")
  local itemLink = rawget(_G, "GetMerchantItemLink")
  local prices, rows = {}, {}
  for index = 1, count do
    local info = read(api.GetItemInfo, index)
    local price = goldUnitPrice(info)
    local link = read(itemLink, index)
    local item = read(itemID, index)
    if not integerInRange(item, 1, MAX_ITEM_ID) then
      item = type(link) == "string" and tonumber(link:match("|Hitem:(%d+):")) or nil
    end
    if not integerInRange(item, 1, MAX_ITEM_ID) then item = nil end
    if price and item and (prices[item] == nil or price < prices[item]) then
      prices[item] = price
    end
    local row = {indice = index, item = item, precio = price, variante = isVariantLink(link)}
    if type(info) == "table" then
      row.pila = integerInRange(info.stackCount, 1, MAX_ITEM_ID) and info.stackCount or nil
      row.disponibles = integerInRange(info.numAvailable, -1, MAX_ITEM_ID) and info.numAvailable or nil
    end
    if not item then
      row.motivo = "sin_leer"
    elseif not price then
      row.motivo = catalogReason(info)
    end
    rows[#rows + 1] = row
  end
  observed = {prices = prices, expires = GetTime() + TTL}
  catalog = rows
end

function MerchantPrices.abierto()
  return merchantOpen
end

function MerchantPrices.catalogo()
  if merchantOpen then return catalog end
end

function MerchantPrices.value(item)
  if observed and GetTime() < observed.expires and integerInRange(item, 1, MAX_ITEM_ID) then
    return observed.prices[item]
  end
end

SNF.escuchar("MERCHANT_SHOW", function()
  merchantOpen = true
  observe()
end)
SNF.escuchar("MERCHANT_UPDATE", observe)
SNF.escuchar("MERCHANT_CLOSED", function()
  merchantOpen, catalog = false, nil
end)
SNF.escuchar("UPDATE_FACTION", function()
  observed = nil
end)
SNF.escuchar("PLAYER_ENTERING_WORLD", function()
  observed, merchantOpen, catalog = nil, false, nil
end)
