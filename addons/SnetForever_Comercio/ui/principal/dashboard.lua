local SNF = SnetForever
local Theme, P, L = SNF.Tema, SNF.Piezas, SNF.L
local Dashboard = {}
SNF.PrincipalDashboard = Dashboard

local function refresh()
  local panel = Dashboard.pagina
  if not panel then return end
  local book = SNF.Contabilidad.totales()
  panel.title.titulo:SetText(L.t("TRADE_DASHBOARD_TITLE"))
  panel.title.descripcion:SetText(L.t("TRADE_LEDGER_SOURCE"))
  panel.texto:SetText(book.sold == 0 and book.bought == 0 and L.t("TRADE_LEDGER_EMPTY") or "")
  local contents = {
    {"TRADE_SOLD", L.t("TRADE_LEDGER_UNITS_VALUE", book.sold, Theme.dinero(book.gross))},
    {"TRADE_LEDGER_RECEIVED", Theme.dinero(book.received)},
    {"TRADE_LEDGER_FEES", Theme.dinero(book.fees)},
    {"TRADE_LEDGER_PURCHASES", L.t("TRADE_LEDGER_UNITS_VALUE", book.bought, Theme.dinero(book.purchases))},
  }
  for i, data in ipairs(contents) do
    panel.cards[i].title:SetText(L.t(data[1]))
    panel.cards[i].value:SetText(data[2])
  end
end

SNF.Principal.registrar("dashboard", {
  crear = function(panel)
    Dashboard.pagina = panel
    panel.title = P.titulo(panel, "", "")
    panel.title:SetPoint("TOPLEFT", panel, "TOPLEFT", 24, -24)
    panel.title:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -24, -24)
    panel.title:ponerAncho(math.max(300, panel:GetWidth() - 48))
    panel.cards = {}
    for i = 1, 4 do
      local card = P.tarjeta(panel, {})
      card:SetHeight(76)
      local y = i <= 2 and -98 or -188
      if i % 2 == 1 then
        card:SetPoint("TOPLEFT", panel, "TOPLEFT", 24, y)
        card:SetPoint("TOPRIGHT", panel, "TOP", -8, y)
      else
        card:SetPoint("TOPLEFT", panel, "TOP", 8, y)
        card:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -24, y)
      end
      card.title = Theme.letra(card:CreateFontString(nil, "OVERLAY"), "etiqueta")
      card.title:SetPoint("TOPLEFT", card, "TOPLEFT", 14, -12)
      card.value = Theme.letra(card:CreateFontString(nil, "OVERLAY"), "titulo", 17)
      card.value:SetPoint("TOPLEFT", card.title, "BOTTOMLEFT", 0, -8)
      panel.cards[i] = card
    end
    panel.texto = Theme.letra(panel:CreateFontString(nil, "OVERLAY"), "texto")
    panel.texto:SetPoint("TOPLEFT", panel, "TOPLEFT", 24, -292)
  end,
  mostrar = refresh,
  idioma = refresh,
})
SNF.Eventos.escuchar("SNF_TRADE_LEDGER", refresh)
