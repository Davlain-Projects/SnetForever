-- SnetForever: codificador JSON (Lua 5.1, sin librerías). Solo codifica: la app es quien lee el JSON.
local _, SNF = ...

local JSON = {}
SNF.JSON = JSON

local format, byte, gsub = string.format, string.byte, string.gsub
local concat, sort = table.concat, table.sort
local floor = math.floor

-- Escapes cortos; el resto de bytes < 0x20 y 0x7F van como \u00XX. Los bytes >= 0x80 pasan tal cual (UTF-8).
local CORTOS = {
  ['"'] = '\\"',
  ["\\"] = "\\\\",
  ["\8"] = "\\b",
  ["\12"] = "\\f",
  ["\n"] = "\\n",
  ["\r"] = "\\r",
  ["\t"] = "\\t",
}

local function escapar(c)
  return CORTOS[c] or format("\\u%04x", byte(c))
end

local function cadena(s)
  return '"' .. gsub(s, '[%c"\\\127]', escapar) .. '"'
end

-- Entero con |n| < 2^31: %d. Los demás: %.2f sin ceros finales. NaN e infinito: null.
local function numero(n)
  if n ~= n or n == 1 / 0 or n == -1 / 0 then
    return "null"
  end
  if n == floor(n) and n > -2147483648 and n < 2147483648 then
    return format("%d", n)
  end
  local s = format("%.2f", n)
  if s:find(".", 1, true) then
    s = (gsub(s, "0+$", ""))
    s = (gsub(s, "%.$", ""))
  end
  if s == "-0" then
    s = "0"
  end
  return s
end

local function esArray(t)
  local n = 0
  for _ in pairs(t) do
    n = n + 1
  end
  if n == 0 then
    return true, 0
  end
  for i = 1, n do
    if t[i] == nil then
      return false
    end
  end
  return true, n
end

local codificar

local function tabla(t, pila)
  if pila[t] then
    error("JSON.codificar: referencia circular", 0)
  end
  pila[t] = true
  local partes = {}
  local array, n = esArray(t)
  if array then
    for i = 1, n do
      partes[i] = codificar(t[i], pila)
    end
    pila[t] = nil
    return "[" .. concat(partes, ",") .. "]"
  end
  local claves = {}
  for k in pairs(t) do
    local tipo = type(k)
    if tipo ~= "string" and tipo ~= "number" then
      error("JSON.codificar: clave de tipo " .. tipo, 0)
    end
    claves[#claves + 1] = tipo == "number" and numero(k) or k -- nunca %d con claves ≥ 2^31 o con decimales
  end
  sort(claves)
  for i, k in ipairs(claves) do
    -- Una clave numérica salió como texto: se busca el valor por el número o por el texto.
    local v = t[k]
    if v == nil then
      v = t[tonumber(k)]
    end
    partes[i] = cadena(k) .. ":" .. codificar(v, pila)
  end
  pila[t] = nil
  return "{" .. concat(partes, ",") .. "}"
end

codificar = function(v, pila)
  local tipo = type(v)
  if tipo == "string" then
    return cadena(v)
  elseif tipo == "number" then
    return numero(v)
  elseif tipo == "boolean" then
    return v and "true" or "false"
  elseif tipo == "nil" then
    return "null"
  elseif tipo == "table" then
    return tabla(v, pila)
  end
  error("JSON.codificar: no se puede codificar un valor de tipo " .. tipo, 0)
end

-- Valor Lua -> texto JSON. Una tabla con claves 1…n seguidas es un array (la vacía, también); las demás son objetos con
-- las claves ordenadas. Una función o un userdata dan error.
function JSON.codificar(valor)
  return codificar(valor, {})
end
