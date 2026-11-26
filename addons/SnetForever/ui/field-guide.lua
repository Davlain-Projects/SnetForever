-- Three presentations of the current guide step. Only Motor owns progression.
local _, SNF = ...
local Views = {frames = {}}
SNF.GuideViews = Views

local frames, L = Views.frames, SNF.L
local folder = "Interface\\AddOns\\SnetForever\\recursos\\"
local plateTexture = folder .. "forge-plate"
local controlsTexture = folder .. "forge-controls"
local arrowTexture = "Interface\\Minimap\\MinimapArrow"
local selected = "notice"
local active, detailReturn, currentStep, previousStep
local modes = {notice = "FIELD_NOTICE", bearing = "FIELD_BEARING", chart = "FIELD_CHART"}

local function label(parent, size, width, height, x, y, role)
  local fs = parent:CreateFontString(nil, "OVERLAY")
  SNF.Estilo.fuente(fs, size, role or "body")
  fs:SetSize(width, height)
  fs:SetPoint("TOPLEFT", parent, "TOPLEFT", x, -y)
  fs:SetJustifyH("LEFT")
  fs:SetJustifyV("MIDDLE")
  fs:SetTextColor(0.96, 0.88, 0.72)
  return fs
end

local function image(parent, layer, file)
  local texture = parent:CreateTexture(nil, layer)
  texture:SetTexture(file)
  return texture
end

-- Stretch the metal surface and straight edges while keeping the riveted corners square.
local function applyPlate(frame, width, height)
  local edge = 24
  local x = {0, edge, width - edge, width}
  local y = {0, edge, height - edge, height}
  local u = {0, 38 / 512, 1 - 38 / 512, 1}
  local v = {0, 38 / 256, 1 - 38 / 256, 1}
  for row = 1, 3 do
    for column = 1, 3 do
      local patch = image(frame, "BACKGROUND", plateTexture)
      patch:SetTexCoord(u[column], u[column + 1], v[row], v[row + 1])
      patch:SetSize(x[column + 1] - x[column], y[row + 1] - y[row])
      patch:SetPoint("TOPLEFT", frame, "TOPLEFT", x[column], -y[row])
      if row == 2 and column == 2 then frame.plate = patch end
    end
  end
end

local function tooltip(button, key)
  local function close(self)
    if GameTooltip and not GameTooltip:IsForbidden() and GameTooltip:GetOwner() == self then
      GameTooltip:Hide()
    end
  end
  button:SetScript("OnEnter", function(self)
    if not GameTooltip or GameTooltip:IsForbidden() then return end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText(L.t(key))
    GameTooltip:Show()
  end)
  button:SetScript("OnLeave", close)
  button:SetScript("OnHide", close)
end

local function iconButton(parent, key, size, action, cell)
  local button = CreateFrame("Button", nil, parent)
  button:SetSize(size, size)
  local texture = cell and controlsTexture or arrowTexture
  button.icon = image(button, "ARTWORK", texture)
  button.icon:SetAllPoints(button)
  button:SetHighlightTexture(texture, "ADD")
  local highlight = button:GetHighlightTexture()
  highlight:SetAllPoints(button)
  highlight:SetAlpha(0.26)
  if cell then
    local left = cell * 0.5
    button.icon:SetTexCoord(left, left + 0.5, 0, 1)
    highlight:SetTexCoord(left, left + 0.5, 0, 1)
  else
    button.icon:SetVertexColor(0.92, 0.64, 0.33)
  end
  tooltip(button, key)
  button:SetScript("OnClick", function()
    action()
  end)
  return button
end

function Views.mode() return selected end

function Views.bearingShown()
  return frames.bearing and frames.bearing:IsShown()
end

local function initialMode()
  local favorite = SNF.Ajustes.get("guide.favorite")
  return modes[favorite] and favorite or "notice"
end

local function selectView(mode)
  if mode == "details" or selected == "details" then
    SNF.Ajustes.guardarSinAviso("guide.details", mode == "details")
  end
  selected = mode
  Views.refresh()
end

local function backButton(parent, anchor, relativePoint, x, y, angle)
  local button = iconButton(parent, "FIELD_BEARING", 23, function() selectView("bearing") end)
  button:SetPoint(anchor, parent, relativePoint, x, y)
  button.icon:SetRotation(angle)
  button:GetHighlightTexture():SetRotation(angle)
  return button
end

local function createFrame(mode, width, height, anchor, x, y)
  local f = CreateFrame("Frame", nil, UIParent)
  SNF.WindowSizing.register(f, "field." .. mode, true)
  frames[mode] = f
  f:Hide()
  f:SetSize(width, height)
  f:SetFrameStrata("MEDIUM")
  f:SetClampedToScreen(true)
  f.defaultPosition = {punto = anchor, relPunto = anchor, x = x, y = y}
  SNF.Ventana.placeGuideFrame(f, f.defaultPosition)
  f:EnableMouse(true)
  f:SetMovable(true)
  f:RegisterForDrag("LeftButton")
  f:SetScript("OnDragStart", function(self)
    if not SNF.Ajustes.get("ventana.bloqueada") then
      self.dragging = true
      self:StartMoving()
    end
  end)
  local function stopDrag(self)
    if not self.dragging then return end
    self.dragging = false
    self:StopMovingOrSizing()
    self:SetUserPlaced(false)
    local point, _, relative, dx, dy = self:GetPoint(1)
    if point then
      SNF.Ajustes.set("ventana.pos", {punto = point, relPunto = relative, x = dx, y = dy})
    end
  end
  f:SetScript("OnDragStop", stopDrag)
  f:SetScript("OnHide", stopDrag)
  applyPlate(f, width, height)
  f.options = iconButton(f, "FIELD_OPTIONS", 27, function()
    SNF.Panel.abrir("ventana")
  end, 0)
  f.options:SetPoint("TOPRIGHT", f, "TOPRIGHT", -9, -9)
  f.details = iconButton(f, "FIELD_DETAILS", 29, function()
    selectView("details")
  end, 1)
  f.details:SetPoint("TOP", f, "BOTTOM", 0, 12)
  return f
end

local function createNotice()
  local f = createFrame("notice", 340, 190, "TOPLEFT", 45, -145)
  f.heading = label(f, 15, 238, 24, 19, 15, "heading")
  local divider = f:CreateTexture(nil, "ARTWORK")
  divider:SetColorTexture(0.66, 0.34, 0.16, 0.75)
  divider:SetSize(300, 1)
  divider:SetPoint("TOPLEFT", f, "TOPLEFT", 19, -43)
  f.art = image(f, "ARTWORK", "Interface\\Icons\\INV_Misc_Map_01")
  f.art:SetPoint("TOPLEFT", f, "TOPLEFT", 21, -58)
  f.art:SetSize(43, 43)
  f.body = label(f, 13, 246, 111, 74, 53)
  f.body:SetJustifyV("TOP")
  f.body:SetWordWrap(true)
  f.next = backButton(f, "TOPRIGHT", "TOPRIGHT", -40, -11, math.pi)
end

local function createBearing()
  local f = createFrame("bearing", 340, 86, "TOP", 0, -45)
  local rule = f:CreateTexture(nil, "ARTWORK")
  rule:SetColorTexture(0.78, 0.50, 0.25, 1)
  rule:SetSize(233, 1)
  rule:SetPoint("TOPLEFT", f, "TOPLEFT", 58, -12)
  for i = 0, 8 do
    local tick = f:CreateTexture(nil, "ARTWORK")
    tick:SetColorTexture(0.88, 0.60, 0.31, 0.9)
    tick:SetSize(i == 4 and 3 or 1, i % 2 == 0 and 6 or 3)
    tick:SetPoint("TOPLEFT", rule, "TOPLEFT", i * 29, 2)
  end
  f.arrow = CreateFrame("Button", nil, f)
  f.arrow:SetSize(62, 54)
  f.arrow:SetPoint("TOPLEFT", f, "TOPLEFT", 8, -17)
  tooltip(f.arrow, "FIELD_CHART")
  f.arrow:SetScript("OnClick", function() selectView("chart") end)
  f.pointer = image(f.arrow, "ARTWORK", arrowTexture)
  f.pointer:SetSize(25, 25)
  f.pointer:SetPoint("TOP", f.arrow, "TOP", 0, 0)
  f.pointer:SetVertexColor(0.92, 0.64, 0.33)
  f.chartIcon = image(f.arrow, "ARTWORK", "Interface\\Icons\\INV_Misc_Map_01")
  f.chartIcon:SetSize(20, 20)
  f.chartIcon:SetPoint("TOP", f.arrow, "TOP", 0, -3)
  f.distance = label(f.arrow, 10, 62, 19, 0, 26, "control")
  f.distance:SetJustifyH("CENTER")
  f.nameButton = CreateFrame("Button", nil, f)
  f.nameButton:SetSize(222, 48)
  f.nameButton:SetPoint("TOPLEFT", f, "TOPLEFT", 74, -20)
  tooltip(f.nameButton, "FIELD_NOTICE")
  f.nameButton:SetScript("OnClick", function() selectView("notice") end)
  f.heading = label(f.nameButton, 14, 222, 22, 0, 0, "heading")
  f.progress = label(f.nameButton, 11, 222, 20, 0, 23)
end

local function createChart()
  local f = createFrame("chart", 340, 207, "BOTTOMLEFT", 36, 140)
  f.heading = label(f, 14, 242, 22, 18, 13, "heading")
  f.plot = CreateFrame("Frame", nil, f)
  f.plot:SetSize(300, 103)
  f.plot:SetPoint("TOPLEFT", f, "TOPLEFT", 20, -43)
  f.player = image(f.plot, "OVERLAY", arrowTexture)
  f.player:SetSize(14, 14)
  f.target = image(f.plot, "OVERLAY", "Interface\\TargetingFrame\\UI-RaidTargetingIcon_1")
  f.target:SetSize(17, 17)
  f.lines = {}
  f.legend = label(f, 11, 302, 22, 19, 144)
  f.progress = label(f, 11, 302, 20, 19, 166)
  f.next = backButton(f, "TOPRIGHT", "TOPRIGHT", -40, -11, math.pi / 2)
end

local function create()
  createNotice()
  createBearing()
  createChart()
  detailReturn = iconButton(UIParent, "FIELD_BEARING", 23, function()
    selectView("bearing")
  end)
  detailReturn:SetPoint("TOPRIGHT", SNF.Ventana.marcos.raiz, "BOTTOMRIGHT", 0, -2)
  detailReturn:SetFrameStrata("MEDIUM")
  detailReturn:Hide()
end

-- Project real world-yard coordinates with north up and equal scale on both axes.
-- Disconnected destinations have a marker but never a fabricated trail.
local function chartPath(goal, player)
  local path, first = SNF.RutaPie.actual()
  local last = path and path[#path]
  if player and last and last.inst == goal.inst and SNF.Coord.vector(last, goal) < 5 then
    return path, first, player
  end
  -- A line or loop supplied by the guide is also real route geometry. Do not
  -- connect the player to it unless the walking navigator supplied that leg.
  for _, item in ipairs(currentStep and currentStep.elementos or {}) do
    local element = item.datos
    if element.t == "line" or element.t == "loop" then
      local vertices, containsGoal = {}, false
      for _, point in ipairs(element.puntos or {}) do
        local world = SNF.Coord.aMundo(point)
        if not world or world.inst ~= goal.inst then break end
        vertices[#vertices + 1] = world
        if SNF.Coord.vector(world, goal) < 5 then containsGoal = true end
      end
      if containsGoal and #vertices > 1 and #vertices == #element.puntos then
        return vertices, 2, vertices[1]
      end
    end
  end
end

local function paintChart(f)
  local destination = SNF.Navegacion.destino()
  local goal = destination and SNF.Coord.aMundo(destination.punto)
  local player = SNF.Coord.jugador()
  local used = 0
  f.player:Hide()
  f.target:Hide()
  local legend = "FIELD_NO_DEST"
  if goal then
    if player and player.inst ~= goal.inst then player = nil end
    local loX, hiX, loY, hiY = goal.wx, goal.wx, goal.wy, goal.wy
    local function include(p)
      loX, hiX = math.min(loX, p.wx), math.max(hiX, p.wx)
      loY, hiY = math.min(loY, p.wy), math.max(hiY, p.wy)
    end
    if player then include(player) end
    local path, first, origin = chartPath(goal, player)
    local known = path ~= nil
    if known then
      include(origin)
      for i = first, #path do include(path[i]) end
    end
    local scale = math.min(280 / math.max(1, hiX - loX), 84 / math.max(1, hiY - loY))
    local function xy(p)
      return ((loX + hiX) / 2 - p.wx) * scale, (p.wy - (loY + hiY) / 2) * scale
    end
    local function marker(tex, p)
      tex:ClearAllPoints()
      tex:SetPoint("CENTER", f.plot, "CENTER", xy(p))
      tex:Show()
    end
    if known then
      local prev = origin
      for i = first, #path do
        used = used + 1
        local line = f.lines[used]
        if not line then
          line = f.plot:CreateLine(nil, "ARTWORK")
          line:SetThickness(2)
          line:SetColorTexture(1, 0.77, 0.33, 1)
          f.lines[used] = line
        end
        line:SetStartPoint("CENTER", f.plot, xy(prev))
        line:SetEndPoint("CENTER", f.plot, xy(path[i]))
        line:Show()
        prev = path[i]
      end
    end
    marker(f.target, goal)
    if player then
      marker(f.player, player)
      f.player:SetRotation(GetPlayerFacing() or 0)
    end
    legend = known and "FIELD_ROUTE" or "FIELD_SINGLE"
  end
  for i = used + 1, #f.lines do f.lines[i]:Hide() end
  local key = L.t(legend)
  if f.player:IsShown() then
    key = "|TInterface\\Minimap\\MinimapArrow:12|t " .. L.t("FIELD_PLAYER") .. "   " .. key
  end
  f.legend:SetText(key)
end

local function paintBearing(f)
  local angle, yards, arrived = SNF.Flecha.fieldBearing()
  f.pointer:SetShown(angle ~= nil)
  f.chartIcon:SetShown(angle == nil)
  if angle then f.pointer:SetRotation(angle) end
  if f.arrived ~= arrived then
    f.arrived = arrived
    SNF.Estilo.fuente(f.progress, arrived and 15 or 11, "body")
  end
  f.distance:SetText(arrived and L.t("HAS_LLEGADO") or yards and L.t("FLECHA_DISTANCIA", SNF.Texto.numero(yards)) or L.t("FIELD_CHART"))
end

-- Quest counters may arrive later than the step transition. Coalesce their updates.
local queued = false
local function schedule()
  if queued or not active or selected == "details" then return end
  queued = true
  C_Timer.After(0.15, function() queued = false; Views.refresh() end)
end
local function needsBagUpdates()
  for _, item in ipairs(currentStep and currentStep.elementos or {}) do
    if item.datos.t == "collect" then return true end
  end
  return false
end

function Views.applyVisibility(visible)
  if not frames.notice then return true end
  for mode in pairs(modes) do frames[mode]:SetShown(visible and active and selected == mode or false) end
  if visible and active and selected ~= "details" and needsBagUpdates() then
    SNF.Eventos.escuchar("BAG_UPDATE_DELAYED", schedule)
  else
    SNF.Eventos.dejar("BAG_UPDATE_DELAYED", schedule)
  end
  detailReturn:SetShown(visible and active and selected == "details" or false)
  return not active or selected == "details"
end

function Views.refresh()
  if not SNF.Ventana.marcos.raiz then return end
  if not frames.notice then create() end
  local state = SNF.Motor.estado()
  local step
  if state.clave and not state.fin then
    local steps = SNF.Ventana.fieldSteps(state)
    step = steps[1]
    for _, candidate in ipairs(steps) do
      if candidate.i == state.actual then step = candidate; break end
    end
  end
  if step ~= currentStep then previousStep, currentStep = currentStep, step end
  active = step ~= nil and step ~= false
  SNF.Ventana.refreshVisibility()
  local f = frames[selected]
  if not active or not f or not f:IsShown() then return end
  local rows = SNF.Ventana.fieldLines(step)
  local summary = SNF.Texto.resumenPaso(step)
  local heading = SNF.Guias.titulo(state.clave)
  local parts, progress, quest = {}, nil, nil
  for _, row in ipairs(rows) do
    local text = row.texto
    parts[#parts + 1] = text
    quest = quest or row.el.q
    if row.casilla and row.e.resultado ~= "hecho" and not progress then progress = text end
  end
  if quest then heading = SNF.Datos.nombreMision(quest) or heading end
  if selected == "notice" then
    f.heading:SetText(heading)
    local body = #parts > 0 and table.concat(parts, "\n") or summary
    f.body:SetText((body:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")))
    f.art:SetTexture(rows[1] and rows[1].icono or "Interface\\Icons\\INV_Misc_Map_01")
  else
    f.heading:SetText(heading or summary)
    f.progress:SetText(progress or (step.numero and L.t("PASO_N", step.numero)) or heading)
    if selected == "chart" then paintChart(f) else paintBearing(f) end
  end
  SNF.WindowSizing.base(f, math.max(0.5, math.min(2, tonumber(SNF.Ajustes.get("ventana.escala")) or 1)))
end

local function start()
  selectView(SNF.Ajustes.get("guide.details") == true and "details" or initialMode())
end
SNF.escuchar("SNF_GUIA_CARGADA", function()
  currentStep, previousStep = nil, nil
  start()
end)
local function mentionsQuest(step, quest)
  for _, element in ipairs(step and step.elementos or {}) do
    if element.datos.q == quest then return true end
  end
  return false
end
SNF.escuchar("QUEST_ACCEPTED", function(first, second)
  local quest = second or first
  if not SNF.API.esSecreto(quest) and type(quest) == "number"
    and (mentionsQuest(currentStep, quest) or mentionsQuest(previousStep, quest)) then
    start()
  end
end)
SNF.escuchar("SNF_PASOS_CAMBIADOS", Views.refresh)
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(key, value)
  if key == "ventana.pos" then
    for _, frame in pairs(frames) do
      SNF.Ventana.placeGuideFrame(frame, frame.defaultPosition)
    end
  end
  if key == "guide.favorite" and modes[value] then
    selectView(value)
  else
    Views.refresh()
  end
end)

SNF.escuchar("QUEST_LOG_UPDATE", schedule)
SNF.escuchar("QUEST_WATCH_UPDATE", schedule)
SNF.escuchar("GET_ITEM_INFO_RECEIVED", schedule)
SNF.escuchar("QUEST_DATA_LOAD_RESULT", schedule)
SNF.escuchar("PLAYER_REGEN_ENABLED", schedule)

local elapsed = 0
local function updateNavigation(_, dt)
  elapsed = elapsed + dt
  if elapsed < 0.2 then return end
  elapsed = 0
  if selected == "chart" then paintChart(frames.chart) else paintBearing(frames.bearing) end
end
SNF.escuchar("PLAYER_ENTERING_WORLD", function()
  Views.refresh()
  if frames.chart then
    frames.chart:SetScript("OnUpdate", updateNavigation)
    frames.bearing:SetScript("OnUpdate", updateNavigation)
  end
end)
