local SNF = SnetForever
local Ledger = {}
SNF.Contabilidad = Ledger

local API = SNF.API
local SECONDS_PER_DAY = 86400
local MAX_ENTRIES = 3000
local REORDER_TOLERANCE = 4
local mailOpen = false

local function number(value)
  return not API.esSecreto(value) and type(value) == "number" and value >= 0 and value < math.huge and value or nil
end

local function text(value)
  return not API.esSecreto(value) and type(value) == "string" and value ~= "" and value or nil
end

local function currentOwner()
  local name, realm = SNF.Personaje.clave(), SNF.Comercio.reino()
  if name and realm then return name .. "-" .. realm end
end

local function entries(create)
  local owner = currentOwner()
  if not owner then return nil end
  if create then SNF.Guardado.preparar() end
  local account = rawget(_G, "SnetForeverCuenta")
  local commerce = type(account) == "table" and account.comercio
  if type(commerce) ~= "table" then return nil end
  if commerce.ledger == nil and create then commerce.ledger = {} end
  local ledger = commerce.ledger
  if type(ledger) ~= "table" then return nil end
  if ledger[owner] == nil and create then ledger[owner] = {} end
  return type(ledger[owner]) == "table" and ledger[owner] or nil
end

local function subjectMatches(subject, key)
  local template = text(rawget(_G, key))
  local prefix = template and text(template:match("^(.-)%%"))
  return prefix and string.sub(subject, 1, #prefix) == prefix
end

local function mailItem(index)
  local getItem = rawget(_G, "GetInboxItem")
  if getItem then
    local name, id, _, count = getItem(index, 1)
    return number(id), text(name), number(count)
  end
end

local function receipt(index, now)
  local invoice = rawget(_G, "GetInboxInvoiceInfo")
  local _, _, _, subject, _, _, days = GetInboxHeaderInfo(index)
  days = number(days)
  if not days then return nil end
  local expireTime = math.floor(now + days * SECONDS_PER_DAY + 0.5)
  local kind, name, gross, deposit, fee, quantity
  if invoice then
    -- The counterparty is deliberately discarded at the API boundary.
    local invoiceType, itemName, _, amount, _, returned, charged, _, _, _, units = invoice(index)
    kind, name, gross = text(invoiceType), text(itemName), number(amount)
    deposit, fee, quantity = number(returned), number(charged), number(units)
  end
  local item, attachmentName, attachmentCount = mailItem(index)
  if kind == "seller" and name and gross and gross > 0 and deposit and fee and fee <= gross then
    return {kind = "sale", name = name, item = item, quantity = math.max(1, quantity or 1),
      gross = gross, deposit = deposit, fee = fee, net = gross + deposit - fee, expires = expireTime, seen = now}
  end
  if kind == "buyer" and name and gross and gross > 0 then
    return {kind = "purchase", name = name, item = item, quantity = math.max(1, quantity or attachmentCount or 1),
      gross = gross, expires = expireTime, seen = now}
  end
  subject = text(subject)
  if not kind and subject and item and attachmentName then
    if subjectMatches(subject, "AUCTION_EXPIRED_MAIL_SUBJECT") then
      kind = "expired"
    elseif subjectMatches(subject, "AUCTION_REMOVED_MAIL_SUBJECT") then
      kind = "cancelled"
    end
    if kind then
      return {kind = kind, name = attachmentName, item = item, quantity = math.max(1, attachmentCount or 1),
        expires = expireTime, seen = now}
    end
  end
end

local function same(a, b)
  return type(a) == "table" and type(a.expires) == "number" and a.kind == b.kind and
    a.name == b.name and a.quantity == b.quantity and a.gross == b.gross and a.deposit == b.deposit and
    a.fee == b.fee and math.abs(a.expires - b.expires) <= REORDER_TOLERANCE
end

local function scan()
  if not mailOpen then return end
  local countFn, header = rawget(_G, "GetInboxNumItems"), rawget(_G, "GetInboxHeaderInfo")
  local now = API.horaServidor()
  if not countFn or not header or not number(now) then return end
  local count = number(countFn()) or 0
  local saved, matched, changed
  for i = 1, count do
    local row = receipt(i, now)
    if row then
      saved = saved or entries(true)
      if not saved then return end
      matched = matched or {}
      local found
      for j, previous in ipairs(saved) do
        if not matched[j] and same(previous, row) then
          found = j
          if not previous.item and row.item then previous.item, changed = row.item, true end
          break
        end
      end
      if not found then
        found = #saved + 1
        saved[found], changed = row, true
      end
      matched[found] = true
    end
  end
  if changed then
    while #saved > MAX_ENTRIES do table.remove(saved, 1) end
    SNF.Eventos.emitir("SNF_TRADE_LEDGER")
  end
end

function Ledger.lista()
  local saved, result = entries(false) or {}, {}
  for i = #saved, 1, -1 do
    if type(saved[i]) == "table" then
      local copy = {}
      for key, value in pairs(saved[i]) do copy[key] = value end
      copy.id = i
      result[#result + 1] = copy
    end
  end
  return result
end

function Ledger.totales()
  local out = {sold = 0, bought = 0, gross = 0, purchases = 0, fees = 0, deposits = 0, received = 0}
  for _, row in ipairs(entries(false) or {}) do
    if type(row) == "table" and row.kind == "sale" then
      out.sold, out.gross = out.sold + (number(row.quantity) or 0), out.gross + (number(row.gross) or 0)
      out.fees, out.deposits = out.fees + (number(row.fee) or 0), out.deposits + (number(row.deposit) or 0)
      out.received = out.received + (number(row.net) or 0)
    elseif type(row) == "table" and row.kind == "purchase" then
      out.bought, out.purchases = out.bought + (number(row.quantity) or 0), out.purchases + (number(row.gross) or 0)
    end
  end
  return out
end

function Ledger.expirations(item)
  local count = 0
  for _, row in ipairs(entries(false) or {}) do
    if type(row) == "table" and row.item == item then
      if row.kind == "sale" then count = 0 end
      if row.kind == "expired" then count = count + 1 end
    end
  end
  return count
end

local function readMail()
  pcall(scan)
end

SNF.Eventos.escuchar("MAIL_SHOW", function()
  if mailOpen then return end
  mailOpen = true
  SNF.Eventos.escuchar("MAIL_INBOX_UPDATE", readMail)
  readMail()
end)
SNF.Eventos.escuchar("MAIL_CLOSED", function()
  mailOpen = false
  SNF.Eventos.dejar("MAIL_INBOX_UPDATE", readMail)
end)
