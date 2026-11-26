local SNF = SnetForever
local Ledger = {}
SNF.Contabilidad = Ledger

local API = SNF.API
local SECONDS_PER_DAY = 86400
local MAX_ENTRIES = 3000
local REORDER_TOLERANCE = 4
local mailOpen = false
local revision = 0 -- bumped whenever a scan changes saved rows, so cached costs are rebuilt

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

-- Phase 2: the item ID and variant written in an item link. variant = true when it carries a random suffix or bonus IDs,
-- which the base ID that the inventory counts does not separate. nil, nil without a readable link.
function Ledger.parseItemLink(link)
  link = text(link)
  local body = link and string.match(link, "item:([%-%d:]+)")
  if not body then return nil, nil end
  local fields = {}
  for value in string.gmatch(body .. ":", "([^:]*):") do fields[#fields + 1] = value end
  local id = tonumber(fields[1] or "")
  local suffix, bonuses = tonumber(fields[7] or ""), tonumber(fields[13] or "")
  return id, (suffix ~= nil and suffix ~= 0) or (bonuses ~= nil and bonuses > 0)
end

local ATTACHMENTS_MAX = 16 -- ATTACHMENTS_MAX_RECEIVE of the client

-- Phase 2: what a purchase mail proves about the lot it pays for, kept as facts so that the rules that read them
-- (`proofOf`) can change without migrating rows. Nothing about the counterparty is read.
--   evidence = {v = 1, attachments = header item count (8th return of GetInboxHeaderInfo) | nil,
--               invoiceUnits = 11th return of GetInboxInvoiceInfo | nil, gaps = true | nil,
--               slots = {{slot, id, linkId, count, variant}...}, late = true | nil}
--   slots lists every attachment the client shows, in slot order; id and count come from GetInboxItem, linkId and
--   variant from GetInboxItemLink. A secret or missing value is left out. gaps = an empty slot before a full one.
--   late = read to enrich a receipt recorded earlier, when some attachments may already have been taken.
local function mailEvidence(index, attachments, invoiceUnits)
  local getItem, getLink = rawget(_G, "GetInboxItem"), rawget(_G, "GetInboxItemLink")
  local evidence = {v = 1, attachments = attachments, invoiceUnits = invoiceUnits, slots = {}}
  local max = number(rawget(_G, "ATTACHMENTS_MAX_RECEIVE")) or ATTACHMENTS_MAX
  local empty = false
  for slot = 1, max do
    local id, count, linkId, variant
    if getItem then
      local ok, _, itemId, _, itemCount = pcall(getItem, index, slot)
      if ok then id, count = number(itemId), number(itemCount) end
    end
    if getLink then
      local ok, link = pcall(getLink, index, slot)
      if ok then linkId, variant = Ledger.parseItemLink(link) end
    end
    if id or count or linkId then
      if empty then evidence.gaps = true end
      evidence.slots[#evidence.slots + 1] = {slot = slot, id = id, linkId = linkId, count = count, variant = variant}
    else
      empty = true
    end
  end
  return evidence
end

local function receipt(index, now)
  local invoice = rawget(_G, "GetInboxInvoiceInfo")
  local _, _, _, subject, _, _, days, attachments = GetInboxHeaderInfo(index)
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
    local evidence = mailEvidence(index, number(attachments), quantity)
    local first = evidence.slots[1]
    local variant
    if item and first and first.slot == 1 then variant = first.variant end
    -- `quantity` keeps its old meaning so the ledger's figures do not move; the average cost reads `evidence`.
    return {kind = "purchase", name = name, item = item, quantity = math.max(1, quantity or attachmentCount or 1),
      gross = gross, expires = expireTime, seen = now, variant = variant, evidence = evidence}
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

-- Two rows are the same mail when everything they record agrees; an item ID only counts when both rows know it.
local function same(a, b)
  return type(a) == "table" and type(a.expires) == "number" and a.kind == b.kind and
    a.name == b.name and a.quantity == b.quantity and a.gross == b.gross and a.deposit == b.deposit and
    a.fee == b.fee and (a.item == nil or b.item == nil or a.item == b.item) and
    math.abs(a.expires - b.expires) <= REORDER_TOLERANCE
end

-- Phase 2: a receipt read again gains the variant and the evidence it lacked, but only when the pairing is certain: the
-- mail matches that one saved row and no other mail of the inbox matches it. Evidence read late is marked as such.
local proofOf
local function enrich(previous, row)
  if row.kind ~= "purchase" or previous.item == nil or previous.item ~= row.item then return false end
  local changed = false
  if previous.variant == nil and row.variant ~= nil then previous.variant, changed = row.variant, true end
  local oldCount, _, oldVariant = proofOf(previous, previous.item)
  local newCount, _, newVariant = proofOf(row, row.item)
  if type(row.evidence) == "table" and (previous.evidence == nil or
    (not oldCount and not oldVariant and (newCount or newVariant))) then
    row.evidence.late = true
    previous.evidence, changed = row.evidence, true
  end
  return changed
end

local function scan()
  if not mailOpen then return end
  local countFn, header = rawget(_G, "GetInboxNumItems"), rawget(_G, "GetInboxHeaderInfo")
  local now = API.horaServidor()
  if not countFn or not header or not number(now) then return end
  local count = number(countFn()) or 0
  local rows = {}
  for i = 1, count do
    local row = receipt(i, now)
    if row then rows[#rows + 1] = row end
  end
  if #rows == 0 then return end
  local saved = entries(true)
  if not saved then return end
  -- Which saved rows each mail could be, and how many mails could be each saved row.
  local candidates, wanted = {}, {}
  for r, row in ipairs(rows) do
    local list = {}
    for j, previous in ipairs(saved) do
      if same(previous, row) then
        list[#list + 1] = j
        wanted[j] = (wanted[j] or 0) + 1
      end
    end
    candidates[r] = list
  end
  local matched, changed = {}, false
  for r, row in ipairs(rows) do
    local found
    for _, j in ipairs(candidates[r]) do
      if not matched[j] then
        found = j
        local previous = saved[j]
        if not previous.item and row.item then previous.item, changed = row.item, true end
        if #candidates[r] == 1 and wanted[j] == 1 and enrich(previous, row) then changed = true end
        break
      end
    end
    if not found then
      found = #saved + 1
      saved[found], changed = row, true
    end
    matched[found] = true
  end
  if changed then
    while #saved > MAX_ENTRIES do table.remove(saved, 1) end
    revision = revision + 1
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

---------------------------------------------------------------------------------------------------
-- Phase 2: average cost of the units you hold, from your own purchase receipts (the `snfcostemedio()` source).
--
-- Ledger.costeMedio(item) -> result (read-only, may be shared between calls). item: a base item ID or "i:1234".
--   result = {valor = copper per unit | nil, razon = nil | code, id, existencias, cubiertas, partidas = {{unidades,
--             lote, unitario, caduca}...}, compras = {partidas, unidades}, excluidas = {variante, rotas},
--             sinPruebas = {partidas, antes, motivos = {[motivo] = n}}, sinObjeto = {partidas, unidades},
--             falta = {bancos, correos, bancoCuenta} | nil}
--   It takes the most recent purchases of that item ID, newest first, until they cover the units the inventory counts
--   for the characters of the current realm (InventarioCuenta.de). A lot that is only partly needed counts for the units
--   it covers. valor = covered cost / units held.
--   Only a proven receipt enters the cost (`proofOf`): its mail showed how many attachments it had, every one of them with
--   the receipt's item ID (GetInboxItem and the link agree), base variant (the link has no suffix or bonus IDs) and a
--   whole unit count. The paid copper must be known and the attachments must add up to the invoice's original unit
--   count. Even the first read may follow partial collection. The lot is the sum of all attachments. Any other receipt of
--   that item ID is counted in `sinPruebas` (`antes` = how many sit before the cut, `motivos` = why) and, when it is
--   reached before the stock is covered, stops the walk: older proven receipts never stand in for it.
--   Purchases whose expiry times are within REORDER_TOLERANCE are simultaneous: nothing says which came first, so the
--   character name or the row order never decides. When the cut falls inside such a group and its unit prices differ,
--   there is no value.
--   Codes, in the order they are checked:
--     variante        the key is a variant or a pet: receipts and stock only know the base ID.
--     sin-personaje   the character or realm is not known yet.
--     sin-info        the client has not loaded the item yet (it is not cached; asking again can answer).
--     no-apilable     the item does not stack, so the inventory can join variants under one ID.
--     sin-existencias the inventory counts no units.
--     existencias-incompletas  a bank, mailbox or the account bank of this realm has not been seen (`falta`).
--     sin-compras     no receipt of this item ID other than ones proven (or flagged) to be another variant.
--     faltan-datos    a receipt of this item ID that cannot be proven is newer than the cut (`sinPruebas.antes` > 0).
--     empate          the cut splits simultaneous purchases with different unit prices.
--     compras-insuficientes    the receipts cover fewer units than you hold (`cubiertas` < `existencias`).
--   Receipts are only matched by item ID, never by name. A receipt without an item ID is reported in `sinObjeto` when its
--   name is the item's name, but it never enters the cost. A receipt proven or flagged as another variant is excluded.
--   Identical receipts are separate purchases: the scan stores one row per mail.
-- The purchase index of the realm is built once and rebuilt only when the ledger changes; each result is cached until the
-- index or the item's stock changes, so a tooltip never walks the whole ledger.
---------------------------------------------------------------------------------------------------

local purchaseIndex = nil -- {signature, realm, lots = {[id] = {lot...}}, unnamed = {[name] = {partidas, unidades}}, broken}
local costCache = {} -- [id] = {index = purchaseIndex, stock = signature, result}

local function realmOf(owner)
  return type(owner) == "string" and string.match(owner, "^[^%-]+%-(.+)$") or nil
end

local function sameRealm(a, b)
  local commerce = rawget(SNF, "Comercio")
  if type(commerce) == "table" and type(commerce.mismoReino) == "function" then
    return commerce.mismoReino(a, b)
  end
  return a == b
end

local function ownersOf(realm)
  local account = rawget(_G, "SnetForeverCuenta")
  local commerce = type(account) == "table" and account.comercio
  local ledger = type(commerce) == "table" and commerce.ledger
  local owners, parts = {}, {tostring(revision), realm}
  if type(ledger) ~= "table" then return owners, table.concat(parts, "|") end
  for owner, rows in pairs(ledger) do
    local ownerRealm = realmOf(owner)
    if type(rows) == "table" and ownerRealm and sameRealm(ownerRealm, realm) then owners[#owners + 1] = owner end
  end
  table.sort(owners)
  for _, owner in ipairs(owners) do
    local rows = ledger[owner]
    parts[#parts + 1] = owner .. "=" .. tostring(rows) .. ":" .. #rows .. ":" .. tostring(rows[#rows])
  end
  return owners, table.concat(parts, "|"), ledger
end

local expiryIndex

-- La vista de un comerciante puede evaluar muchos objetos y operaciones. Lee cada carta una vez por cambio del libro.
local function indexExpirations(realm)
  local owners, signature, ledger = ownersOf(realm)
  if expiryIndex and expiryIndex.signature == signature then return expiryIndex end
  local index = {signature = signature, sales = {}, names = {}, unidentified = {}, expirations = {}}
  for _, owner in ipairs(owners) do
    for _, row in ipairs(ledger[owner]) do
      local at = type(row) == "table" and number(row.expires)
      if at then
        local id = number(row.item)
        if row.kind == "sale" then
          if id then
            index.sales[id] = math.max(at, index.sales[id] or -math.huge)
          elseif row.item == nil then
            index.unidentified[#index.unidentified + 1] = at
            local name = text(row.name)
            if name then
              local dates = index.names[name] or {}
              dates[#dates + 1] = at
              index.names[name] = dates
            end
          end
        elseif row.kind == "expired" and id then
          local rows = index.expirations[id] or {}
          rows[#rows + 1] = {at = at, units = number(row.quantity) or 1}
          index.expirations[id] = rows
        end
      end
    end
  end
  expiryIndex = index
  return index
end

-- Phase 4 (Vendedor): the units that expired since the last auction sale, as TSM's NumExpires source counts them (sum of
-- expired units of the base item since the last non-vendor sale, all characters of the realm).
-- Ledger.caducadasDesdeVenta(item, nombre) -> {minimo, maximo, sinId} | nil, motivo
--   A sale mail has no attachment, so most sale rows have no item ID: they are matched only by name and never trusted
--   blindly. `maximo` counts from the last sale proven by item ID; `minimo` also starts after any sale without an ID
--   whose name is the item's (any sale without an ID when the name is not known). The two agree when no such sale is
--   newer than the expirations. Rows within REORDER_TOLERANCE of the cut count only in `maximo`. sinId = how many
--   sales without an ID are newer than the last proven one. motivo: "sin-personaje" (realm unknown) or "variante" (not a base ID).
-- Only mails this addon has read are counted, so the figure can only fall short of TSM's history.
function Ledger.caducadasDesdeVenta(item, nombre)
  local realm = SNF.Comercio.reino()
  if not realm or not SNF.Personaje.clave() then return nil, "sin-personaje" end
  local id = type(item) == "number" and item or (type(item) == "string" and tonumber(string.match(item, "^i:(%d+)$")))
  if not id then return nil, "variante" end
  local index = indexExpirations(realm)
  local confirmed = index.sales[id] or -math.huge
  local candidates = nombre == nil and index.unidentified or index.names[nombre]
  local lower, out = confirmed, {minimo = 0, maximo = 0, sinId = 0}
  for _, at in ipairs(candidates or {}) do
    lower = math.max(lower, at)
    if at > confirmed then out.sinId = out.sinId + 1 end
  end
  for _, e in ipairs(index.expirations[id] or {}) do
    if e.at > confirmed - REORDER_TOLERANCE then out.maximo = out.maximo + e.units end
    if e.at > lower + REORDER_TOLERANCE then out.minimo = out.minimo + e.units end
  end
  return out
end

local function wholeUnits(value)
  value = number(value)
  return value and value >= 1 and value == math.floor(value) and value or nil
end

-- Phase 2: the units a purchase receipt proves it paid for, or why it cannot (see the block above).
--   proofOf(row, id) -> units | nil, motivo, variant
--   variant = true when the evidence (or the old flag) shows another variant: such a receipt is a different item, not a
--   gap in the data. Motives: sin-pruebas (no evidence: recorded before it was kept), rota (no valid copper or expiry),
--   sin-adjuntos (the header gave no attachment count), adjuntos-incompletos (the attachments seen do not match that
--   count, or one is missing), sin-unidades (an attachment without a whole count), sin-enlace (no link, so the variant is
--   unknown), discordante (IDs, variants or the invoice count disagree), sin-unidades-factura (no original invoice count).
proofOf = function(row, id)
  local evidence = row.evidence
  if row.variant == true and type(evidence) ~= "table" then return nil, "variante", true end
  if not number(row.gross) or row.gross <= 0 or not number(row.expires) then return nil, "rota" end
  if type(evidence) ~= "table" or evidence.v ~= 1 then return nil, "sin-pruebas" end
  local attachments = wholeUnits(evidence.attachments)
  if not attachments then return nil, "sin-adjuntos" end
  local slots = evidence.slots
  if type(slots) ~= "table" or #slots ~= attachments or evidence.gaps then return nil, "adjuntos-incompletos" end
  local total, variants = 0, 0
  for position = 1, attachments do
    local slot = slots[position]
    if type(slot) ~= "table" or slot.slot ~= position then return nil, "adjuntos-incompletos" end
    local count = wholeUnits(slot.count)
    if not count then return nil, "sin-unidades" end
    if slot.linkId == nil or type(slot.variant) ~= "boolean" then return nil, "sin-enlace" end
    if slot.linkId ~= id or slot.id ~= id then return nil, "discordante" end
    if slot.variant then variants = variants + 1 end
    total = total + count
  end
  -- Even the first scan can see a letter with some attachments already collected.
  if evidence.invoiceUnits == nil then return nil, "sin-unidades-factura" end
  if wholeUnits(evidence.invoiceUnits) ~= total then return nil, "discordante" end
  if variants == attachments then return nil, "variante", true end
  if variants > 0 then return nil, "discordante" end
  return total
end

local function buildIndex(realm)
  local owners, signature, ledger = ownersOf(realm)
  if purchaseIndex and purchaseIndex.signature == signature then return purchaseIndex end
  local lots, unnamed, broken = {}, {}, 0
  for _, owner in ipairs(owners) do
    for position, row in ipairs(ledger[owner]) do
      if type(row) == "table" and row.kind == "purchase" then
        local units, gross, expires = wholeUnits(row.quantity), number(row.gross), number(row.expires)
        local id = wholeUnits(row.item)
        local whole = units and gross and gross > 0 and expires
        if not whole then broken = broken + 1 end
        if id then
          -- Every receipt with this item ID is listed, proven or not, so an unproven one is never invisible. One
          -- without an expiry cannot be placed in time: it is treated as the newest.
          local proven, motive, variant = proofOf(row, id)
          local list = lots[id] or {}
          list[#list + 1] = {unidades = proven, total = gross, caduca = expires or math.huge, owner = owner,
            position = position, variante = variant == true, motivo = not proven and not variant and motive or nil}
          lots[id] = list
        elseif whole then
          local name = text(row.name)
          if name then
            local entry = unnamed[name] or {partidas = 0, unidades = 0}
            entry.partidas, entry.unidades = entry.partidas + 1, entry.unidades + units
            unnamed[name] = entry
          end
        end
      end
    end
  end
  for _, list in pairs(lots) do
    -- The owner and the row only make the order of simultaneous lots stable for display; `compute` never lets them
    -- decide which of those lots is covered.
    table.sort(list, function(a, b)
      if a.caduca ~= b.caduca then return a.caduca > b.caduca end
      if a.owner ~= b.owner then return a.owner < b.owner end
      return a.position > b.position
    end)
  end
  purchaseIndex = {signature = signature, realm = realm, lots = lots, unnamed = unnamed, broken = broken}
  costCache = {}
  return purchaseIndex
end

local function baseId(item)
  if type(item) == "number" then return wholeUnits(item) end
  if type(item) == "string" then
    local digits = string.match(item, "^i:(%d+)$")
    return digits and wholeUnits(tonumber(digits)) or nil
  end
end

local function stockOf(id)
  local inventory = rawget(SNF, "InventarioCuenta")
  if type(inventory) ~= "table" or type(inventory.de) ~= "function" then return nil end
  local ok, total, _, missing = pcall(inventory.de, id)
  if not ok or type(total) ~= "number" then return nil end
  local falta
  if type(missing) == "table" then
    local banks, mails = tonumber(missing.bancos) or 0, tonumber(missing.correos) or 0
    if banks > 0 or mails > 0 or missing.bancoCuenta == true then
      falta = {bancos = banks, correos = mails, bancoCuenta = missing.bancoCuenta == true}
    end
  end
  return total, falta
end

-- Whether every proven lot of a group has the same unit price (compared without dividing).
local function samePrice(group)
  local first
  for _, lot in ipairs(group) do
    if lot.unidades then
      if not first then
        first = lot
      elseif lot.total * first.unidades ~= first.total * lot.unidades then
        return false
      end
    end
  end
  return true
end

local function compute(id, index, stock, falta, name)
  local list = index.lots[id] or {}
  local unnamed = name and index.unnamed[name]
  local result = {id = id, existencias = stock, cubiertas = 0, partidas = {}, falta = falta,
    compras = {partidas = 0, unidades = 0}, excluidas = {variante = 0, rotas = index.broken},
    sinPruebas = {partidas = 0, antes = 0, motivos = {}},
    sinObjeto = {partidas = unnamed and unnamed.partidas or 0, unidades = unnamed and unnamed.unidades or 0}}
  local need, cost, stop = stock, 0, nil
  local i = 1
  while i <= #list do
    -- A group of simultaneous lots: each within REORDER_TOLERANCE of the previous one.
    local group, j = {list[i]}, i + 1
    while j <= #list and list[j - 1].caduca - list[j].caduca <= REORDER_TOLERANCE do
      group[#group + 1] = list[j]
      j = j + 1
    end
    local reached = need > 0 and not stop
    local units = 0
    for _, lot in ipairs(group) do
      if lot.variante then
        result.excluidas.variante = result.excluidas.variante + 1
      elseif not lot.unidades then
        local missing = result.sinPruebas
        missing.partidas = missing.partidas + 1
        missing.motivos[lot.motivo] = (missing.motivos[lot.motivo] or 0) + 1
        if reached then
          missing.antes = missing.antes + 1
          stop = stop or "faltan-datos"
        end
      else
        result.compras.partidas = result.compras.partidas + 1
        result.compras.unidades = result.compras.unidades + lot.unidades
        units = units + lot.unidades
      end
    end
    if reached and not stop and units > need and not samePrice(group) then stop = "empate" end
    if reached and not stop then
      for _, lot in ipairs(group) do
        if lot.unidades and need > 0 then
          local take = math.min(lot.unidades, need)
          local unit = lot.total / lot.unidades
          cost, need = cost + unit * take, need - take
          result.partidas[#result.partidas + 1] = {unidades = take, lote = lot.unidades, unitario = unit,
            caduca = lot.caduca}
        end
      end
    end
    i = j
  end
  result.cubiertas = stock - need
  if stock <= 0 then
    result.razon = "sin-existencias"
  elseif falta then
    result.razon = "existencias-incompletas"
  elseif result.compras.partidas == 0 and result.sinPruebas.partidas == 0 then
    result.razon = "sin-compras"
  elseif stop then
    result.razon = stop
  elseif need > 0 then
    result.razon = "compras-insuficientes"
  else
    result.valor = cost / stock
  end
  return result
end

function Ledger.costeMedio(item)
  local id = baseId(item)
  if not id then return {razon = "variante"} end
  local realm = text(SNF.Comercio.reino())
  if not realm or not currentOwner() then return {id = id, razon = "sin-personaje"} end
  local info = API.infoObjeto(id)
  if not info then return {id = id, razon = "sin-info"} end
  if not info.apilado or info.apilado <= 1 then return {id = id, razon = "no-apilable"} end
  local stock, falta = stockOf(id)
  if not stock then return {id = id, razon = "sin-personaje"} end
  local index = buildIndex(realm)
  local stockSignature = stock .. (falta and (":" .. falta.bancos .. ":" .. falta.correos .. ":" ..
    tostring(falta.bancoCuenta)) or "")
  local cached = costCache[id]
  if cached and cached.index == index and cached.stock == stockSignature then return cached.result end
  local result = compute(id, index, stock, falta, info.nombre)
  costCache[id] = {index = index, stock = stockSignature, result = result}
  return result
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
