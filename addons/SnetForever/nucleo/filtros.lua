-- SnetForever: evaluador de los filtros de las guías (forma normalizada de la fase 1) y de las máscaras de
-- raza y clase de las misiones. Se comporta igual que `evaluarFiltro` del conversor.
--
-- Un filtro es `nil`/`true` (siempre), `false` (nunca) o una lista de grupos O; cada grupo es una lista Y de
-- términos de texto: `c:WARRIOR`, `r:Scourge`, `f:Horde`, `n:10` (nivel >= 10), `s:male`, `l:esES`, con `!`
-- delante si va negado. Un grupo vacío es verdadero y una lista vacía, falsa.
-- `m:min,max` comprueba la tasa de experiencia de la ruta.
-- `x:<capacidad>` (lote «Cadenas de mejoras», ronda 1): se cumple si este addon entiende esa parte de los datos
-- (Filtros.CAPACIDADES). Un addon anterior no conoce el término «x» y lo da por no cumplido: así las guías de mejora no
-- le salen como guías normales del selector. Cualquier otro término desconocido tampoco se cumple.
--
-- PJ = {clase, raza, faccion, nivel, sexo?, idioma?}: clase en mayúsculas ("WARRIOR"), raza como en el filtro
-- ("Orc", "NightElf", "Skyborne"...), faccion "Horde", "Alliance" o "Neutral", sexo "male" o "female".
--
-- Las máscaras llegan a 2^33, así que se comprueban con aritmética (nunca con `bit`).
local _, SNF = ...
local Filtros = {}
SNF.Filtros = Filtros

Filtros.MASCARA_RAZA = {
  Human = 1, Orc = 2, Dwarf = 4, NightElf = 8, Scourge = 16, Tauren = 32, Gnome = 64, Troll = 128, Goblin = 256,
}
-- Skyborne no tiene bit propio: la máscara trae un bit por facción.
Filtros.SKYBORNE = { Alliance = 2 ^ 32, Horde = 2 ^ 33 }
Filtros.MASCARA_CLASE = {
  WARRIOR = 1, PALADIN = 2, HUNTER = 4, ROGUE = 8, PRIEST = 16, SHAMAN = 64, MAGE = 128, WARLOCK = 256, DRUID = 1024,
}

-- Partes de los datos que este addon entiende (término «x:<capacidad>» de los filtros).
Filtros.CAPACIDADES = {mejora = true}

-- Verdadero si la máscara tiene activo el bit `valorBit` (una potencia de 2).
function Filtros.tieneBit(mascara, valorBit)
  return math.floor(mascara / valorBit) % 2 == 1
end

-- Valor de un término (con `!` opcional) para el personaje.
local function evaluarTermino(termino, pj)
  local negado = string.sub(termino, 1, 1) == "!"
  local t = negado and string.sub(termino, 2) or termino
  local tipo = string.sub(t, 1, 1)
  local valor = string.sub(t, 3)
  local ok = false
  if tipo == "c" then
    ok = string.upper(pj.clase or "") == valor
  elseif tipo == "r" then
    ok = pj.raza == valor
  elseif tipo == "f" then
    ok = pj.faccion == valor or pj.faccion == "Neutral"
  elseif tipo == "n" then
    ok = (pj.nivel or 1) >= (tonumber(valor) or 0)
  elseif tipo == "s" then
    ok = pj.sexo ~= nil and string.lower(pj.sexo) == valor
  elseif tipo == "l" then
    ok = pj.idioma ~= nil and pj.idioma == valor
  elseif tipo == "m" then
    local desde, hasta = string.match(valor, "^([^,]+),([^,]+)$")
    local min, max = tonumber(desde), tonumber(hasta)
    local xp = tonumber(pj.xp or SNF.Ajustes.get("guias.xp")) or 1
    ok = min ~= nil and max ~= nil and xp >= min and xp <= max
  elseif tipo == "x" then
    ok = Filtros.CAPACIDADES[valor] == true
  end
  return ok ~= negado
end

-- Evalúa un filtro normalizado para el personaje `pj`.
function Filtros.evaluar(filtro, pj)
  if filtro == nil or filtro == true then
    return true
  end
  if filtro == false then
    return false
  end
  pj = pj or {}
  for _, grupo in ipairs(filtro) do
    local cumple = true
    for _, termino in ipairs(grupo) do
      if not evaluarTermino(termino, pj) then
        cumple = false
        break
      end
    end
    if cumple then
      return true
    end
  end
  return false
end

-- Skyborne mira el bit de su facción; con «Neutral» (o sin facción conocida), cualquiera de los dos.
local function skyborneCumple(mascara, faccion)
  local alianza = Filtros.tieneBit(mascara, Filtros.SKYBORNE.Alliance)
  local horda = Filtros.tieneBit(mascara, Filtros.SKYBORNE.Horde)
  if faccion == "Alliance" then
    return alianza
  elseif faccion == "Horde" then
    return horda
  end
  return alianza or horda
end

-- La máscara de raza de una misión admite al personaje. 0 o nil: cualquiera; una raza sin bit conocido: sí.
function Filtros.razaCumple(mascara, pj)
  if mascara == nil or mascara == 0 then
    return true
  end
  local raza = pj.raza
  if raza == "Skyborne" then
    return skyborneCumple(mascara, pj.faccion)
  end
  local bit = Filtros.MASCARA_RAZA[raza]
  if bit == nil then
    return true
  end
  return Filtros.tieneBit(mascara, bit)
end

-- La máscara de clase de una misión admite al personaje, con la misma regla de 0/nil.
function Filtros.claseCumple(mascara, pj)
  if mascara == nil or mascara == 0 then
    return true
  end
  local bit = Filtros.MASCARA_CLASE[string.upper(pj.clase or "")]
  if bit == nil then
    return true
  end
  return Filtros.tieneBit(mascara, bit)
end
