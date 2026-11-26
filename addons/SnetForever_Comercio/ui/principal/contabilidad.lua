local SNF = SnetForever
local Theme, P, L = SNF.Tema, SNF.Piezas, SNF.L
local LedgerPage = {}
SNF.PrincipalContabilidad = LedgerPage

local function refresh()
  local panel = LedgerPage.pagina
  if not panel then return end
  local search = string.lower(panel.search:GetText() or "")
  local kind = panel.kind
  local filtered = {}
  for _, row in ipairs(SNF.Contabilidad.lista()) do
    if (not kind or row.kind == kind) and string.find(string.lower(row.name), search, 1, true) then
      row.clave = row.id
      filtered[#filtered + 1] = row
    end
  end
  panel.list:poner(filtered)
  panel.texto:SetText(#filtered == 0 and L.t("TRADE_LEDGER_EMPTY") or "")
  panel.note:SetText(L.t("TRADE_LEDGER_SOURCE"))
end

local function moneyColumn(key, textKey)
  return {clave = key, titulo = L.t(textKey), ancho = 105, justificado = "RIGHT",
    valor = function(row) return row[key] end,
    pintar = function(cell, row) cell.texto:SetText(row[key] and Theme.dinero(row[key]) or "—") end,
  }
end

SNF.Principal.registrar("contabilidad", {
  crear = function(panel)
    LedgerPage.pagina = panel
    panel.search = P.campo(panel, {ancho = 216, lupa = true, placeholder = L.t("TRADE_LEDGER_SEARCH")})
    panel.search:SetPoint("TOPLEFT", panel, "TOPLEFT", 20, -18)
    panel.search:HookScript("OnTextChanged", P.proteger(refresh))
    local filter = P.desplegable(panel, {
      ancho = 164,
      opciones = {{"all", L.t("TRADE_LEDGER_ALL")}, {"sale", L.t("TRADE_LEDGER_SALE")},
        {"purchase", L.t("TRADE_LEDGER_PURCHASE")}, {"expired", L.t("TRADE_LEDGER_EXPIRED")}, {"cancelled", L.t("TRADE_LEDGER_CANCELLED")}},
      get = function() return panel.kind or "all" end,
      set = function(value)
        panel.kind = value ~= "all" and value or nil
        refresh()
      end,
    })
    filter:SetPoint("LEFT", panel.search, "RIGHT", 12, 0)
    panel.list = P.tabla(panel, {menu = true, borde = true, orden = {"seen", false}, columnas = {
      {clave = "seen", titulo = L.t("TRADE_LEDGER_SEEN"), ancho = 132, valor = function(row) return row.seen end,
        pintar = function(cell, row) cell.texto:SetText(date("%Y-%m-%d %H:%M", row.seen)) end},
      {clave = "kind", titulo = L.t("TRADE_STATE"), ancho = 98, valor = function(row) return L.t("TRADE_LEDGER_" .. string.upper(row.kind)) end},
      {clave = "item", titulo = L.t("TRADE_ITEM"), flex = 1, valor = function(row) return row.name end},
      {clave = "quantity", titulo = L.t("TRADE_QUANTITY"), ancho = 82, valor = function(row) return row.quantity end},
      moneyColumn("gross", "TRADE_LEDGER_GROSS"), moneyColumn("deposit", "TRADE_LEDGER_DEPOSIT"),
      moneyColumn("fee", "TRADE_LEDGER_FEES"), moneyColumn("net", "TRADE_LEDGER_RECEIVED"),
    }})
    panel.list:SetPoint("TOPLEFT", panel, "TOPLEFT", 20, -58)
    panel.list:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -20, 48)
    panel.texto = Theme.letra(panel:CreateFontString(nil, "OVERLAY"), "texto")
    panel.texto:SetPoint("CENTER", panel, "CENTER")
    panel.note = Theme.letra(panel:CreateFontString(nil, "OVERLAY"), "texto")
    panel.note:SetPoint("BOTTOMLEFT", panel, "BOTTOMLEFT", 20, 19)
  end,
  mostrar = refresh,
  idioma = refresh,
})
SNF.Eventos.escuchar("SNF_TRADE_LEDGER", refresh)
