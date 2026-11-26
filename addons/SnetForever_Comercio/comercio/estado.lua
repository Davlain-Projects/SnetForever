local SNF = SnetForever
local Estado = {}
SNF.EstadoComercio = Estado

local STABLE_SECONDS = 10
local STARTUP_GRACE = 15
local CONTACT_TIMEOUT = 60
local NEWER_SNAPSHOT_AGE = 65 * 60

function Estado.newFilter()
  local shown, changedAt, candidate, since
  return function(color, now)
    if not shown then
      shown, changedAt = color, now
    elseif color == shown then
      candidate, since = nil, nil
    else
      if candidate ~= color then
        candidate, since = color, now
      end
      if now - since >= STABLE_SECONDS and now - changedAt >= STABLE_SECONDS then
        shown, changedAt = color, now
        candidate, since = nil, nil
      end
    end
    return shown
  end
end

local stableColor = Estado.newFilter()
local startedAt = GetTime()
local lastSample, current
local sound, nextSoundCheck
local failed = false
local rank = {verde = 1, acento = 2, error = 3}

local function sample(now)
  local prices, signals, L = SNF.Precios, SNF.Timbres, SNF.L
  local color = "verde"
  local lines = {}
  local function add(key, level, ...)
    lines[#lines + 1] = L.t(key, ...)
    if level then
      if rank[level] > rank[color] then color = level end
    end
  end

  local identity = prices.identidad()
  local house = prices.casaActual()
  local faction = prices.faccionActual()
  local factionLabel = faction and L.t("COMMERCE_STATUS_FACTION_" .. string.upper(faction)) or "?"
  add("COMMERCE_STATUS_HOUSE", nil, string.upper(identity.region or "?"), identity.reino or "?", factionLabel)
  if not nextSoundCheck or now >= nextSoundCheck then
    sound = signals and signals.sonido()
    nextSoundCheck = now + 10
  end
  local contactAge = signals and signals.segundosDesdeVivo()
  if not sound then
    add("COMMERCE_STATUS_SOUND", "acento")
  elseif contactAge and contactAge < CONTACT_TIMEOUT then
    add("COMMERCE_STATUS_CONTACT", nil, math.floor(contactAge))
  elseif now - startedAt >= CONTACT_TIMEOUT then
    add("COMMERCE_STATUS_OFFLINE", "error")
  else
    add("COMMERCE_STATUS_WAITING", now - startedAt >= STARTUP_GRACE and "acento" or nil)
  end

  local info = prices.infoCasa(house)
  local age = prices.edad()
  local serverTime = SNF.API.horaServidor()
  if info and type(serverTime) == "number" then
    age = math.max(0, serverTime - info.hora)
  end
  if failed then
    add("COMERCIO_APAGADO", "error")
  end
  if not age then
    add("COMMERCE_STATUS_NO_SNAPSHOT")
  elseif not prices.hasHouse(house) then
    add("COMERCIO_SIN_PRECIOS", "error")
  else
    add("COMMERCE_STATUS_SNAPSHOT", age >= prices.VIEJOS and "acento" or nil, math.floor(age / 60))
    if info and info.desde > 0 and type(date) == "function" then
      add("COMMERCE_STATUS_HISTORY", nil, date("%Y-%m-%d", info.desde), info.pares)
    end
    if not prices.hayRitmo(house) then
      add("COMERCIO_SIN_RITMO", "acento")
    end
    -- Fase 2: la cobertura de las series de esta casa. Informativa (sin color): pocos días es lo normal al empezar.
    local coverage = prices.cobertura and prices.cobertura(house)
    if coverage then
      local n = SNF.Texto.numero
      local daily = coverage.historico
      if daily then
        add("COMMERCE_STATUS_DAILY", nil, n(daily.conValor), n(coverage.objetos), n(daily.minDias or 0))
      elseif coverage.historicoRazon then
        add("COMMERCE_STATUS_DAILY_NO", nil, L.t(coverage.historicoRazon == "no-cabe" and "COMERCIO_TT_HIST_NO_CABE"
          or "COMERCIO_TT_HIST_FORMATO_ANTERIOR"))
      end
    end
    add("COMMERCE_STATUS_SCOPE")
    if prices.hayQueRecargar() or (contactAge and contactAge < CONTACT_TIMEOUT and age >= NEWER_SNAPSHOT_AGE) then
      add("COMMERCE_STATUS_RELOAD", "acento")
    end
  end
  local displayed = stableColor(color, now)
  return {color = displayed, warning = displayed ~= "verde", lines = lines}
end

function Estado.current()
  local now = GetTime()
  if lastSample == nil or now - lastSample >= 1 then
    lastSample = now
    current = sample(now)
  end
  return current
end

SNF.Eventos.escuchar("SNF_COMERCIO_APAGADO", function()
  failed, lastSample = true, nil
end)
SNF.Eventos.escuchar("SNF_IDIOMA", function()
  lastSample = nil
end)
