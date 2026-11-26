-- Read only learned, fixed-output recipes seen in the open profession window.
local SNF = SnetForever
local recipes = {}
SNF.RecipeCosts = {}

local function positive(n)
  return type(n) == "number" and not SNF.API.esSecreto(n) and n > 0 and n < math.huge and n == math.floor(n)
end

local function readRecipe(api, recipe)
  local info = api.GetRecipeInfo(recipe)
  if not info or info.learned ~= true then return end
  local s = api.GetRecipeSchematic(recipe, false)
  if not s or not positive(s.outputItemID) or not positive(s.quantityMin) or s.quantityMin ~= s.quantityMax then return end
  if type(s.reagentSlotSchematics) ~= "table" then return end
  local materials = {}
  for _, slot in ipairs(s.reagentSlotSchematics) do
    if type(slot.required) ~= "boolean" then return end
    if slot.required then
      if not positive(slot.quantityRequired) or type(slot.reagents) ~= "table" or #slot.reagents ~= 1 then return end
      local id = slot.reagents[1].itemID
      if not positive(id) then return end
      materials[id] = (materials[id] or 0) + slot.quantityRequired
    end
  end
  if next(materials) then return s.outputItemID, {count = s.quantityMin, materials = materials} end
end

local function observe()
  local api = rawget(_G, "C_TradeSkillUI")
  if not api or not api.GetAllRecipeIDs or not api.GetRecipeInfo or not api.GetRecipeSchematic then return end
  if (api.IsTradeSkillLinked and api.IsTradeSkillLinked()) or (api.IsTradeSkillGuild and api.IsTradeSkillGuild()) then return end
  local ids = api.GetAllRecipeIDs()
  if type(ids) ~= "table" then return end
  for _, id in ipairs(ids) do
    local ok, item, recipe = pcall(readRecipe, api, id)
    if ok and item then
      recipes[item] = recipes[item] or {}
      recipes[item][id] = recipe
    end
  end
end

local function cheapest(item)
  local best, choice, choiceID
  for id, recipe in pairs(recipes[item] or {}) do
    local cost = 0
    for material, quantity in pairs(recipe.materials) do
      local row = SNF.Precios.de(material)
      if not row or not positive(row.normal) then cost = nil; break end
      cost = cost + row.normal * quantity
    end
    if cost then
      cost = math.ceil(cost / recipe.count)
      if not best or cost < best or (cost == best and id < choiceID) then
        best, choice, choiceID = cost, recipe, id
      end
    end
  end
  return best, choice
end

function SNF.RecipeCosts.unit(item)
  local cost = cheapest(item)
  return cost
end

function SNF.RecipeCosts.materials(item, units)
  if not positive(item) or not positive(units) or units > 99999 then return end
  local cost, recipe = cheapest(item)
  if not recipe then return end
  local crafts = math.ceil(units / recipe.count)
  local list = {}
  for id, quantity in pairs(recipe.materials) do
    local needed = crafts * quantity
    local stock = SNF.InventarioCuenta.shoppingStock(id, {})
    local known = stock ~= nil
    list[#list + 1] = {id = id, needed = needed, missing = known and math.max(0, needed - stock) or nil}
  end
  table.sort(list, function(a, b) return a.id < b.id end)
  return crafts, cost, list
end

SNF.escuchar("TRADE_SKILL_LIST_UPDATE", observe)
