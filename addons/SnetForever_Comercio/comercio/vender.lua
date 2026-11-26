local SNF = SnetForever
local Vender = {}
SNF.Vender = Vender

local floor, min, max = math.floor, math.min, math.max
local TYPE = "subasta"
local DURATIONS = {["12"] = 1, ["24"] = 2, ["48"] = 3}
local HOURS = {2, 8, 24}
local PRICE_FIELDS = {
  {"minimo", "precioMinimo"}, {"normal", "precioNormal"}, {"maximo", "precioMaximo"},
  {"rebaja", "rebaja"}, {"umbral", "umbralReponer"},
}
local QUANTITY_FIELDS = {{"tope", "tope"}, {"reserva", "reservaEnBolsas"}, {"caducadas", "caducadasMaximas"}}

local function field(name, key)
  return SNF.Operaciones.valor(TYPE, name, key)
end

local function evaluate(item, name, fields, convert)
  local values = {}
  for _, pair in ipairs(fields) do
    local value, problem = SNF.Formulas.valor(field(name, pair[2]), item)
    local result = value and convert(value)
    if result == nil then
      return nil, pair[2], problem
    end
    values[pair[1]] = result
  end
  return values
end

function Vender.duracion(key)
  local index = DURATIONS[key] or 2
  return index, HOURS[index]
end

function Vender.applicableOperations(item)
  local route = SNF.Arbol.objeto("i:" .. item) or ""
  local operations = SNF.Operaciones.deGrupo(route, TYPE)
  local matches = {}
  local ignored = false
  for _, operation in ipairs(operations) do
    if SNF.Operaciones.existe(TYPE, operation) then
      if SNF.Operaciones.ignoradaAqui(TYPE, operation) then
        ignored = true
      else
        matches[#matches + 1] = operation
      end
    end
  end
  return matches, route, ignored and "ignorada" or "sin_operacion"
end

function Vender.operacion(item)
  local matches, route, reason = Vender.applicableOperations(item)
  if #matches == 0 then return nil, reason end
  local first = table.remove(matches, 1)
  return first, route, matches
end

function Vender.precios(item, name)
  return evaluate(item, name, PRICE_FIELDS, SNF.Formulas.cobre)
end

function Vender.cantidades(item, name)
  return evaluate(item, name, QUANTITY_FIELDS, function(n)
    if n >= 0 and n < math.huge then return floor(n) end
  end)
end

-- Freeze the evaluated rules that govern price and confirmation. Bag reserve
-- and the active-unit ceiling are re-evaluated against live stock on each click.
local function ruleSnapshot(item, name, mode, prices, quantities)
  prices = prices or Vender.precios(item, name)
  if not prices then return nil end
  local rules = {}
  for key, value in pairs(prices) do rules[key] = value end
  rules.ignoreDuration = field(name, "ignorarDuracion")
  rules.belowMinimum = field(name, "bajoMinimo")
  rules.aboveMaximum = field(name, "sobreMaximo")
  if mode == "post" then
    quantities = quantities or Vender.cantidades(item, name)
    if not quantities then return nil end
    rules.expirationLimit = quantities.caducadas
    rules.duration = field(name, "duracion")
    rules.bidPercent = field(name, "pujaPorcentaje")
    rules.vendor = SNF.Formulas.valor("vendorsell", item)
    rules.market = SNF.Formulas.valor("snfmercado", item)
  else
    rules.cancelUndercut = field(name, "cancelarRebajadas")
    rules.cancelRepost = field(name, "cancelarParaSubir")
  end
  return rules
end

function Vender.rulesUnchanged(item, operation, mode, previous, quantities)
  local current = ruleSnapshot(item, operation, mode, nil, quantities)
  if previous == false then return current == nil end
  if not previous or not current then return false end
  for key, value in pairs(previous) do
    if current[key] ~= value then return false end
  end
  for key in pairs(current) do
    if previous[key] == nil then return false end
  end
  return true
end

local function priceStep()
  local auction = rawget(_G, "C_AuctionHouse")
  local supportsCopper = auction and rawget(auction, "SupportsCopperValues")
  return supportsCopper and supportsCopper() == false and 100 or 1
end

local function rounded(price, minimum)
  if not price then return nil end
  local step = priceStep()
  price = floor(price / step) * step
  if price > 0 and price >= minimum then
    return price
  end
end

local function cheapest(rows, name, prices, ownAllowed)
  local least, own
  local duration = tonumber(field(name, "ignorarDuracion")) or 0
  local ignoreLow = field(name, "bajoMinimo") == "ignorar"
  for _, row in ipairs(rows or {}) do
    local price = row.precioUnidad
    local mine = row.mia == true or (row.propias or 0) > 0
    local eligible = mine and ownAllowed or not mine and (row.banda == nil or row.banda >= duration)
    if eligible and type(price) == "number" and price > 0 and
        (mine or not ignoreLow or price - prices.rebaja >= prices.minimo) then
      if not least or price < least then
        least, own = price, mine
      elseif price == least and mine then
        own = true
      end
    end
  end
  return least, own
end

local function decidePrice(name, rows, prices)
  if prices.normal < prices.minimo then return nil, "normal_bajo_minimo" end
  if prices.maximo < prices.minimo then return nil, "maximo_bajo_minimo" end
  local least, own = cheapest(rows, name, prices, true)
  local offer = least and (least - (own and 0 or prices.rebaja))
  local price, reason
  if not offer then
    price, reason = prices.normal, "normal"
  elseif offer < prices.minimo then
    price, reason = prices[field(name, "bajoMinimo")], "bajo_minimo"
  elseif own then
    price, reason = least, "mia"
  elseif offer > prices.maximo then
    price, reason = prices[field(name, "sobreMaximo")], "sobre_maximo"
  else
    price, reason = offer, "rebaja"
  end
  if not price then return nil, reason end
  local safePrice = rounded(price, prices.minimo)
  if not safePrice then return nil, "precio_invalido" end
  return safePrice, reason
end

function Vender.precioPara(item, name, rows)
  local prices, key = Vender.precios(item, name)
  if not prices then return nil, key end
  return decidePrice(name, rows, prices)
end

function Vender.decidir(item, name, rows, available, published, commodity)
  local prices, priceKey = Vender.precios(item, name)
  if not prices then return {publicar = false, motivo = priceKey} end
  local price, reason = decidePrice(name, rows, prices)
  if not price then return {publicar = false, motivo = reason} end
  local quantities, key = Vender.cantidades(item, name)
  if not quantities then return {publicar = false, motivo = key == "tope" and "invalid_limit" or key} end
  local rules = ruleSnapshot(item, name, "post", prices, quantities)
  local units = max(0, floor(available)) - quantities.reserva
  if units <= 0 then return {publicar = false, motivo = "pocas"} end
  units = min(units, quantities.tope - max(0, floor(published)))
  if units <= 0 then return {publicar = false, motivo = "tope"} end
  local ledger = rawget(SNF, "Contabilidad")
  if quantities.caducadas > 0 and ledger and ledger.expirations(item) >= quantities.caducadas then
    return {publicar = false, motivo = "caducadas"}
  end

  local info = commodity and SNF.API.infoObjeto(item)
  local stack = info and info.apilado or 1
  local batch = commodity and min(units, max(1, floor(stack)) * 40) or 1
  local duration, hours = Vender.duracion(rules.duration)
  local bid, percent = nil, rules.bidPercent or 100
  if not commodity and percent > 0 and percent < 100 then
    local step = priceStep()
    local minimum = math.ceil(prices.minimo / step) * step
    local wanted = floor(price * percent / (100 * step)) * step
    local starting = max(wanted, minimum)
    if starting > 0 and starting < price then bid = starting end
  end
  local alerts, confirm = {}, nil
  if quantities.caducadas > 0 and not ledger then alerts[#alerts + 1] = "caducadas_sin_datos" end
  local vendor, market = rules.vendor, rules.market
  if vendor and price < vendor then
    alerts[#alerts + 1] = "bajo_vendedor"
    confirm = {motivo = "bajo_vendedor", precio = price, referencia = vendor}
  end
  if market and price < market / 2 then
    alerts[#alerts + 1] = "bajo_mercado"
    confirm = confirm or {motivo = "bajo_mercado", precio = price, referencia = floor(market / 2)}
  end
  return {
    publicar = true, motivo = reason, precioUnidad = price, puja = bid, mercancia = commodity,
    porPublicacion = batch, publicaciones = floor(units / batch), resto = units % batch, unidades = units,
    duracion = duration, horas = hours, total = price * units, avisos = alerts, confirmar = confirm, rules = rules,
  }
end

-- Each operation's cap is a ceiling over all active units for the item.
-- The auction API doesn't tag existing listings with an operation. Earlier
-- proposals consume shared bag stock and count toward later ceilings.
function Vender.postPlans(item, operations, market, available, published, commodity)
  local plans, units = {}, 0
  for _, name in ipairs(operations) do
    local draft = Vender.decidir(item, name, market, available - units, published + units, commodity)
    plans[#plans + 1] = {operation = name, draft = draft}
    units = units + (draft.unidades or 0)
  end
  return plans, units
end

function Vender.avisoDeposito(decision, deposit, faction)
  if faction == "Neutral" then return {tipo = "neutral", deposito = deposit, total = decision.total} end
  local net = decision.total - floor(decision.total * 5 / 100)
  if deposit >= net then return {tipo = "alto", deposito = deposit, total = decision.total, cobrarias = net} end
end

function Vender.decidirCancelar(auction, name, rows)
  local prices, key = Vender.precios(auction.item, name)
  local result = {cancelar = false, motivo = key or "bien", mio = auction.precioUnidad}
  if not prices then return result end
  result.rules = ruleSnapshot(auction.item, name, "cancel", prices)
  local remaining, remove = {}, auction.cantidad
  for _, row in ipairs(rows or {}) do
    local count = row.iguales or row.cantidad or 1
    local own = row.propias and ((row.iguales and row.propias > 0) and count or row.propias)
      or (row.mia and count or 0)
    if own > 0 and row.precioUnidad == auction.precioUnidad and remove > 0 then
      local deducted = min(own, remove)
      remove = remove - deducted
      if count > deducted then
        remaining[#remaining + 1] = {precioUnidad = row.precioUnidad, banda = row.banda,
          propias = own - deducted, mia = own - deducted == count - deducted}
      end
    else
      remaining[#remaining + 1] = row
    end
  end
  result.minimo = prices.minimo
  local competitors = {}
  for _, row in ipairs(remaining) do
    if not row.mia then
      competitors[#competitors + 1] = {precioUnidad = row.precioUnidad, banda = row.banda}
    end
  end
  result.masBarata = cheapest(competitors, name, prices, false)
  result.nuevo = decidePrice(name, remaining, prices)
  -- Cancelling an undercut listing forfeits its deposit. It only pays off when
  -- the repost is cheaper. A competitor below the minimum can resolve to the
  -- same or a higher reset price, which only the repost-higher rule may cancel.
  local undercut = field(name, "cancelarRebajadas") and result.masBarata and result.masBarata < result.mio
  if undercut and result.nuevo and result.nuevo < result.mio then
    result.cancelar, result.motivo = true, "rebajada"
  elseif field(name, "cancelarParaSubir") and result.nuevo and result.nuevo > result.mio + prices.umbral then
    result.cancelar, result.motivo = true, "subir"
  elseif undercut then
    result.motivo = result.nuevo and "bien" or "no_volveria"
  end
  return result
end

-- An owned listing can appear in the queue at most once. Keep the first
-- eligible operation, or the first rejection reason if none can cancel it.
function Vender.cancelPlan(auction, operations, market)
  local first, snapshots = nil, {}
  for _, name in ipairs(operations) do
    local result = {operation = name, draft = Vender.decidirCancelar(auction, name, market)}
    snapshots[name] = result.draft.rules or false
    first = first or result
    if result.draft.cancelar then return result, snapshots end
  end
  return first, snapshots
end
