local _, SNF = ...
local Sizing = {}
SNF.WindowSizing = Sizing

-- Store player choices, never frame objects, in SavedVariables.
local windows = {}
local settingsKey = "window.scales"

local function zoom(id)
  local sizes = SNF.Ajustes.get(settingsKey)
  local n = type(sizes) == "table" and sizes[id]
  return type(n) == "number" and n == n and math.max(0.65, math.min(2, n)) or 1
end

local function save(id, value)
  local sizes = SNF.Ajustes.get(settingsKey)
  if type(sizes) ~= "table" then sizes = {} end
  sizes[id] = value
  SNF.Ajustes.guardarSinAviso(settingsKey, sizes)
end

local function apply(frame, state)
  if state.suspended or InCombatLockdown() then return end
  local value = state.base * (state.preview or zoom(state.id))
  if SNF.Ajustes.get("auction.largeText") then value = value * 1.15 end
  if frame.sizingGrip and value > state.base then
    local parent = frame:GetParent()
    local ratio = UIParent:GetEffectiveScale() / parent:GetEffectiveScale()
    local width, height = frame:GetWidth(), frame:GetHeight()
    if width > 0 and height > 0 then
      value = math.min(value, ratio * UIParent:GetWidth() / width, ratio * UIParent:GetHeight() / height)
    end
  end
  if value > 0 and math.abs(frame:GetScale() - value) > 0.00001 then frame:SetScale(value) end
end

-- Existing screen-density or player scale remains the base for this window.
function Sizing.base(frame, value)
  local state = windows[frame]
  if not state then
    frame:SetScale(value)
    return
  end
  state.base = value
  apply(frame, state)
end

function Sizing.suspend(frame, suspended)
  local state = windows[frame]
  state.suspended = suspended
  if frame.sizingGrip then frame.sizingGrip:SetShown(not suspended) end
  apply(frame, state)
end

local function gripFor(frame, state)
  local grip = CreateFrame("Button", nil, frame)
  frame.sizingGrip = grip
  grip:SetSize(16, 16)
  grip:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -1, 1)
  grip:SetFrameLevel(frame:GetFrameLevel() + 12)
  grip:EnableMouse(true)
  -- Copper diagonal knurling stays visible against both Forge and neutral panels.
  for row = 0, 2 do
    for col = row, 2 do
      local dot = grip:CreateTexture(nil, "OVERLAY")
      dot:SetTexture("Interface\\Buttons\\WHITE8X8")
      dot:SetVertexColor(0.9, 0.67, 0.45, 1)
      dot:SetSize(2, 2)
      dot:SetPoint("BOTTOMRIGHT", grip, "BOTTOMRIGHT", -2 - (2 - col) * 4, 2 + row * 4)
    end
  end
  local startX, startY, width, height, initial
  local function cancel()
    startX, state.preview = nil, nil
    grip:SetScript("OnUpdate", nil)
    apply(frame, state)
  end
  local function update()
    if InCombatLockdown() then
      cancel()
      return
    end
    local x, y = GetCursorPosition()
    local delta = ((x - startX) * width + (startY - y) * height) / (width * width + height * height)
    state.preview = math.max(0.65, math.min(2, initial * (1 + delta)))
    apply(frame, state)
  end
  grip:SetScript("OnMouseDown", function(_, button)
    if button ~= "LeftButton" or state.suspended or InCombatLockdown() then return end
    startX, startY = GetCursorPosition()
    initial = zoom(state.id)
    width = math.max(1, frame:GetWidth() * frame:GetEffectiveScale())
    height = math.max(1, frame:GetHeight() * frame:GetEffectiveScale())
    grip:SetScript("OnUpdate", update)
  end)
  grip:SetScript("OnMouseUp", function(_, button)
    if button ~= "LeftButton" or not startX then return end
    update()
    if state.preview then save(state.id, state.preview) end
    cancel()
  end)
  grip:SetScript("OnHide", function() if startX then cancel() end end)
  grip:SetScript("OnEnter", function()
    GameTooltip:SetOwner(grip, "ANCHOR_TOP")
    GameTooltip:SetText(SNF.L.t("WINDOW_RESIZE_HINT"))
    GameTooltip:Show()
  end)
  grip:SetScript("OnLeave", function()
    if GameTooltip:GetOwner() == grip then GameTooltip:Hide() end
  end)
end

function Sizing.register(frame, id, grip)
  local state = {id = id, base = frame:GetScale()}
  windows[frame] = state
  if grip then gripFor(frame, state) end
  apply(frame, state)
end

local function refresh()
  for frame, state in pairs(windows) do apply(frame, state) end
end

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(key)
  if key == "auction.largeText" then refresh() end
end)
SNF.escuchar("PLAYER_REGEN_ENABLED", refresh)
