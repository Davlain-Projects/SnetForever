-- Formula inputs observed from the last merchant this character opened.
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

local function observe()
  if not merchantOpen then return end
  observed = nil
  local api = rawget(_G, "C_MerchantFrame")
  local count = read(rawget(_G, "GetMerchantNumItems"))
  if count == nil and type(api) == "table" then count = read(api.GetNumItems) end
  if type(api) ~= "table" or not integerInRange(count, 1, MAX_ITEMS) then return end

  local itemID = rawget(_G, "GetMerchantItemID")
  local itemLink = rawget(_G, "GetMerchantItemLink")
  local prices = {}
  for index = 1, count do
    local price = goldUnitPrice(read(api.GetItemInfo, index))
    if price then
      local item = read(itemID, index)
      if not integerInRange(item, 1, MAX_ITEM_ID) then
        local link = read(itemLink, index)
        if type(link) == "string" then item = tonumber(link:match("|Hitem:(%d+):")) end
      end
      if integerInRange(item, 1, MAX_ITEM_ID) and (prices[item] == nil or price < prices[item]) then
        prices[item] = price
      end
    end
  end
  observed = {prices = prices, expires = GetTime() + TTL}
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
  merchantOpen = false
end)
SNF.escuchar("UPDATE_FACTION", function()
  observed = nil
end)
SNF.escuchar("PLAYER_ENTERING_WORLD", function()
  observed, merchantOpen = nil, false
end)
