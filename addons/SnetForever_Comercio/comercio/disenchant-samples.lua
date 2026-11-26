-- A player records the combined outputs from a measured batch of identical items.
-- Replace the batch on edit so repeating a command never double-counts a sample.
local SNF = SnetForever
local Samples = {}
SNF.DisenchantSamples = Samples

local function integer(n, maximum)
  return type(n) == "number" and n >= 1 and n <= maximum and n == math.floor(n)
end

function Samples.record(input)
  local id, attempts, outputs = input:match("^(%d+)%s+(%d+)%s+(.+)$")
  id, attempts = tonumber(id), tonumber(attempts)
  if not integer(id, 2147483647) or not integer(attempts, 99999) then return false end
  local materials = {}
  for token in outputs:gmatch("%S+") do
    local material, count = token:match("^(%d+):(%d+)$")
    material, count = tonumber(material), tonumber(count)
    if not integer(material, 2147483647) or not integer(count, 999999) or materials[material] then return false end
    materials[material] = count
  end
  if not next(materials) then return false end
  local c = SnetForeverCuenta.comercio
  if type(c.disenchantSamples) ~= "table" then c.disenchantSamples = {} end
  c.disenchantSamples[id] = {attempts = attempts, materials = materials}
  return true
end

function Samples.estimate(id)
  local samples = SnetForeverCuenta.comercio.disenchantSamples
  local batch = type(samples) == "table" and samples[id]
  if type(batch) ~= "table" or not integer(batch.attempts, 99999) or type(batch.materials) ~= "table" then return end
  local value = 0
  for material, count in pairs(batch.materials) do
    if not integer(material, 2147483647) or not integer(count, 999999) then return end
    local row = SNF.Precios.de(material)
    if not row or type(row.normal) ~= "number" or row.normal <= 0 or row.normal >= math.huge then return end
    value = value + row.normal * count
  end
  if value > 0 then return math.floor(value / batch.attempts), batch.attempts end
end
