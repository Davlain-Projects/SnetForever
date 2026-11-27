-- SnetForever: la página Navegar de nuestra ventana de la subasta, parte 3, bloque B (Task B3). Es la vista principal: la
-- subasta siempre se abre aquí. Se registra en SNF.SubastaVentana como «navegar».
--
-- Izquierda, un panel de 251 px en «secundario» (medido en ah-navegar-tsm-entera.webp, que está a la escala de
-- subasta-tsm-2.png: «Mis Subastas» mide 100 px en las dos), a 12 px del borde, 4 px bajo la cabecera y 11 px sobre el
-- borde de abajo:
--   - «Buscar en grupos»: campo con lupa (165 × 22, letra de 12 px) que filtra el árbol mientras se escribe, y dos botoncitos
--     cuadrados con su tooltip: desplegar todo y plegar todo (Piezas.botonCuadrado de 16 px, con borde y nuestro triángulo
--     dentro, ▾ y ▸; sus centros a 52 y 26 px del borde derecho del panel, como en TSM).
--   - El árbol de grupos (SNF.Arbol con Piezas.arbol y la opción marcas): la barra de la izquierda de cada fila marca los
--     grupos elegidos para el escaneo de compras, en el color de su nivel si está elegido y oscura (con la fila hundida)
--     si no. Grupo Base lleva la barra oscura (como TSM, decisión del jugador) y no se elige. Pulsar un grupo lo elige o lo quita junto con todo lo que cuelga de él.
--     Si el grupo y todo lo suyo ya estaban elegidos, pulsarlo lo quita todo; si no (nada o a medias), lo elige todo.
--     Se guarda en SnetForeverCuenta.comercio.gruposCompra = {[ruta] = true} (solo las rutas elegidas). SNF.Arbol la lleva
--     con el grupo al renombrar, mover, borrar (a la papelera) y recuperar. El fondo oscuro del árbol («hundido», el de las
--     filas sin elegir) llega siempre hasta 8 px encima del botón de abajo, tenga las filas que tenga (opción relleno).
--   - Abajo, «Ejecutar escaneo de compras» (237 × 26). Group shopping uses the selected groups and opens the list
--     of recommendations alongside the tree. A selected recommendation is checked again through Compra.
-- Derecha, una columna que empieza 16 px tras el panel y acaba a 17 px del borde derecho:
--   - El campo «Buscar en la casa de subastas» con lupa y el botón «Buscar» (72 × 22) a 8 px, 11 px bajo la cabecera.
--     Intro o Buscar llaman a SNF.Busqueda.buscar (dentro de SNF.Comercio.ejecutar) y pasan a la página «resultados».
--   - Cuatro botones con borde, en dos filas de 26 px (8 px entre filas y entre columnas, letra de 14 px):
--     «Búsqueda avanzada de objetos», «Búsqueda de vendedores» y «Búsqueda para desencantar», apagados con el tooltip
--     «Llega más adelante»; y «Búsqueda de grandes ofertas», encendido si hay precios de la app para esta casa
--     (SNF_PRECIOS y SNF.Precios.casa(), como el aviso de la ventana): abre la página «ofertas» (la lista vieja) ordenada
--     por % de menor a mayor, aunque hubiera otro orden guardado (queda guardado ese). Sin precios va apagado, en gris y
--     con el tooltip «Hacen falta los precios de la app».
--   - 15 px más abajo, las pestañas «Búsquedas recientes» / «Búsquedas favoritas» (Piezas.pestanas) y debajo su lista,
--     con filas de 22 px que se desplazan con la rueda. Un clic en una fila vuelve a lanzar esa búsqueda. Con el ratón
--     encima sale una ★ a la derecha que la marca o la desmarca como favorita (no busca). Con la lista vacía, un texto gris.
-- Combate: ningún campo se queda con el teclado (sinTecladoEnCombate y, al empezar el combate, se suelta el foco).
-- Nada late ni cambia solo: la ★ y el resalte de las filas salen solo con el ratón encima. El evento del combate solo se
-- escucha mientras la página se ve; el aviso SNF_COMERCIO_BUSQUEDA (interno) repinta la lista solo si se ve.
--
-- SubastaNavegar.buscar(texto) -> boolean   busca ese texto (recortado; vacío no hace nada), lo pone en el campo y pasa a
--     «resultados». false si no se lanzó (texto vacío, subasta cerrada o comercio apagado): entonces se queda en Navegar.
-- SubastaNavegar.hayPrecios() -> boolean    si hay precios de la app para la casa de ahora.
-- SubastaNavegar.marcos   {pagina, panel, fondoPanel, campoGrupos, desplegar, plegar, arbol, escaneoCompras, campo, buscar,
--     avanzada, vendedores, desencantar, ofertas, pestanas, zona, vacio, filas = {Button con .texto, .resalte, .estrella
--     (con .icono) y .valor}}.
--
-- Lo que espera de la Task B5 (ui/subasta/resultados.lua): que registre la página interna «resultados» (ventana.lua
-- deja una vacía hasta entonces; se puede registrar encima porque aún no está creada). Al entrar en ella ya hay una
-- búsqueda pedida con SNF.Busqueda.buscar y SubastaNavegar.marcos.campo tiene el texto buscado. Para volver,
-- «‹ Salir del escaneo» llama a SNF.Busqueda.salir() y a SNF.SubastaVentana.elegir("navegar"); «Volver a escanear» y el
-- campo de su fila 2 pueden usar SubastaNavegar.buscar(texto), que apunta la búsqueda en las recientes y se queda en
-- resultados. Al volver a Navegar, la lista de recientes se repinta sola (mostrar).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L
local Ventana = SNF.SubastaVentana

local SubastaNavegar = {}
SNF.SubastaNavegar = SubastaNavegar

local proteger = Piezas.proteger
local pintar = Piezas.interno.pintar
local plana = Piezas.interno.plana
local colorTexto = Piezas.interno.colorTexto
local botonBase = Piezas.interno.botonBase
local sinTecladoEnCombate = Piezas.interno.sinTecladoEnCombate

local SEP = "`" -- el de SNF.Arbol (Arbol.SEP)

-- Izquierda (px de la ventana, que son píxeles reales).
local ANCHO_PANEL = 251
local PANEL_IZQ, PANEL_ARRIBA, PANEL_ABAJO = 12, 4, 11
local CAMPO_GRUPOS_X, CAMPO_GRUPOS_Y, ANCHO_CAMPO_GRUPOS = 15, 14, 165
local LADO_ICONO = 12 -- la ★ de las búsquedas
local LADO_CUADRADO = 16 -- desplegar y plegar todo: algo menos que el campo (22)
local ICONO_CUADRADO = 10
local ICONO_DER = 18 -- del borde derecho del panel al de «plegar todo» (su centro a 26 px, como en TSM)
local HUECO_ICONOS = 10 -- entre los dos cuadrados (sus centros a 26 px)
local RELLENO_ARBOL = 7 -- del panel al árbol y a «Ejecutar escaneo de compras»
local ARBOL_ARRIBA = 44
local ALTO_ESCANEO = 26
local HUECO_ESCANEO = 8 -- entre el árbol y el botón
-- Derecha.
local COLUMNA_X = PANEL_IZQ + ANCHO_PANEL + 16 -- 279
local MARGEN_DER = 17
local ARRIBA_CAMPO = 11
local ALTO_CAMPO = 22
local ANCHO_BUSCAR = 72
local HUECO = 8 -- campo-Buscar, entre filas y entre columnas de botones
local ALTO_BOTON = 26
local HUECO_PESTANAS = 15
local HUECO_LISTA = 6
local ALTO_FILA = 22
local TEXTO_FILA = 4 -- del borde de la fila al texto
local LADO_ESTRELLA = 16
local TAMANO_LETRA_CAMPO = 12
local TAMANO_LETRA_BOTON = 14
-- «Ejecutar escaneo de compras»: a 14 px mide unos 220 px en el juego (213 con PIL; la captura b1 da 150 + 63 en dos
-- líneas) y solo hay 221 libres, así que el juego lo partía. A 13 px mide unos 202 (197 con PIL). En inglés cabe de sobra.
local TAMANO_LETRA_ESCANEO = 13
local ESTRELLA = "Interface\\TargetingFrame\\UI-RaidTargetingIcon_1" -- la estrella amarilla de las marcas de banda

local BOTONES = {
  {nombre = "avanzada", clave = "SUBASTA_NAV_AVANZADA", fila = 1, izquierda = true},
  {nombre = "vendedores", clave = "SUBASTA_NAV_VENDEDORES", fila = 1},
  {nombre = "desencantar", clave = "SUBASTA_NAV_DESENCANTAR", fila = 2, izquierda = true},
  {nombre = "ofertas", clave = "SUBASTA_NAV_OFERTAS", fila = 2},
}

local marcos = {filas = {}}
SubastaNavegar.marcos = marcos
local pestanaLista = 1 -- 1 = recientes, 2 = favoritas
local visible = false -- la página se ve
local shoppingVisible, shoppingStartFailed = false, false
local selectedRecommendation, shoppingMessage
local SHOPPING_ORIGIN = "group-shopping"
local SHOPPING_ROW_HEIGHT = 40
local SHOPPING_PAGE_SIZE = 8
local paintShopping, paintShoppingButton, closeShopping

---------------------------------------------------------------------------------------------------
-- Ayudas
---------------------------------------------------------------------------------------------------

local function recortar(texto)
  local s = tostring(texto or "")
  local desde = string.find(s, "%S")
  if not desde then
    return ""
  end
  local hasta = #s
  while hasta > desde and string.find(string.sub(s, hasta, hasta), "%s") do
    hasta = hasta - 1
  end
  return string.sub(s, desde, hasta)
end

local function tooltip(dueno, texto)
  local tt = rawget(_G, "GameTooltip")
  if not tt or tt:IsForbidden() then
    return
  end
  tt:SetOwner(dueno, "ANCHOR_BOTTOM")
  tt:SetText(texto, 1, 1, 1, 1, true)
  tt:Show()
end

local function sinTooltip()
  local tt = rawget(_G, "GameTooltip")
  if tt and not tt:IsForbidden() then
    tt:Hide()
  end
end

-- Pone el tooltip fijo de un botón (además de lo que ya hiciera al entrar y salir).
local function conTooltip(b, texto)
  local entrar, salir = b:GetScript("OnEnter"), b:GetScript("OnLeave")
  b:SetScript("OnEnter", proteger(function(self, ...)
    if entrar then
      entrar(self, ...)
    end
    local t = texto(self)
    if t then
      tooltip(self, t)
    end
  end))
  b:SetScript("OnLeave", proteger(function(self, ...)
    if salir then
      salir(self, ...)
    end
    sinTooltip()
  end))
end

local function ratonSobre(marco)
  local ok, r = pcall(marco.IsMouseOver, marco)
  return ok and r == true
end

local function guardadoComercio()
  pcall(SNF.Guardado.preparar)
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  return type(c) == "table" and c or nil
end

function SubastaNavegar.hayPrecios()
  local P = rawget(_G, "SNF_PRECIOS")
  local Precios = rawget(SNF, "Precios")
  if type(P) ~= "table" or type(P.casas) ~= "table" or not Precios then
    return false
  end
  -- F6, ronda 1: la casa de la subasta abierta (en la neutral, que la app no trae, no hay precios).
  local ok, casa = pcall(Precios.casaActual or Precios.casa)
  return ok and casa ~= nil and type(P.casas[casa]) == "table"
end

---------------------------------------------------------------------------------------------------
-- Grupos elegidos para el escaneo de compras
---------------------------------------------------------------------------------------------------

local function elegidos(crear)
  local c = guardadoComercio()
  if not c then
    return nil
  end
  if type(c.gruposCompra) ~= "table" then
    if not crear or c.gruposCompra ~= nil then
      return nil -- lo que no es una tabla no se tira
    end
    c.gruposCompra = {}
  end
  return c.gruposCompra
end

local function nombreDe(ruta)
  return string.match(ruta, "([^" .. SEP .. "]*)$") or ruta
end

-- La raíz con todos los grupos (una sola lectura de SNF.Arbol).
local function nodos()
  local datos = rawget(SNF, "Arbol")
  local raiz = {clave = "", texto = L.t("PRINCIPAL_GRUPOS_BASE"), nivel = 0, hijos = {}}
  local porClave = {[""] = raiz}
  if datos then
    for _, ruta in ipairs(datos.ordenadas()) do
      local padre = porClave[string.match(ruta, "^(.*)" .. SEP .. "[^" .. SEP .. "]*$") or ""]
      if padre then
        local n = {clave = ruta, texto = nombreDe(ruta), nivel = (padre.nivel or 0) + 1, hijos = {}}
        padre.hijos[#padre.hijos + 1] = n
        porClave[ruta] = n
      end
    end
  end
  return raiz
end

local function marca(clave)
  if clave == "" then
    return false -- Grupo Base: la barra oscura de uno sin elegir, como TSM (no se elige: alternarGrupo lo descarta)
  end
  local g = elegidos(false)
  return g ~= nil and g[clave] == true
end

-- Pulsar un grupo: si él y todo lo que cuelga de él están elegidos, lo quita todo; si no (nada o a medias), lo elige todo.
local function alternarGrupo(clave)
  local g = clave ~= "" and elegidos(true)
  if not g then
    return
  end
  local rutas = {clave}
  local datos = rawget(SNF, "Arbol")
  if datos then
    local prefijo = clave .. SEP
    for _, ruta in ipairs(datos.ordenadas()) do
      if string.sub(ruta, 1, #prefijo) == prefijo then
        rutas[#rutas + 1] = ruta
      end
    end
  end
  local entero = true
  for _, ruta in ipairs(rutas) do
    if g[ruta] ~= true then
      entero = false
      break
    end
  end
  for _, ruta in ipairs(rutas) do
    g[ruta] = (not entero) or nil
  end
  marcos.arbol:repintar()
  paintShoppingButton()
end

local function abrirTodo(si)
  marcos.arbol:abrirTodos(si)
end

---------------------------------------------------------------------------------------------------
-- Buscar
---------------------------------------------------------------------------------------------------

function SubastaNavegar.buscar(texto)
  texto = recortar(texto)
  local B = rawget(SNF, "Busqueda")
  if texto == "" or not B then
    return false
  end
  if shoppingVisible then closeShopping() end
  local ok, lanzada = SNF.Comercio.ejecutar("navegar", B.buscar, texto)
  if not (ok and lanzada) then
    return false
  end
  if marcos.campo and marcos.campo:GetText() ~= texto then
    marcos.campo:SetText(texto)
  end
  sinTooltip()
  Ventana.elegir("resultados")
  return true
end

local function abrirOfertas()
  if not SubastaNavegar.hayPrecios() then
    return
  end
  local UI = rawget(SNF, "UIComercio")
  -- Siempre por % de menos a más (ordenarPor lo deja guardado como el orden de la lista, como si pulsara la columna).
  local tabla = UI and UI.tabla and UI.tabla()
  if tabla then
    SNF.Comercio.ejecutar("navegar", tabla.ordenarPor, tabla, "pct", true)
  end
  if UI and UI.elegirPestana then
    UI.elegirPestana("ofertas")
  else
    Ventana.elegir("ofertas")
  end
end

local function pintarOfertas()
  if marcos.ofertas then
    marcos.ofertas:ponerApagado(not SubastaNavegar.hayPrecios())
  end
end

---------------------------------------------------------------------------------------------------
-- Group shopping
---------------------------------------------------------------------------------------------------

local function selectedGroups()
  local selected, count = {}, 0
  local saved = elegidos(false) or {}
  local tree = rawget(SNF, "Arbol")
  for _, route in ipairs(tree and tree.ordenadas() or {}) do
    if saved[route] == true then
      selected[route] = true
      count = count + 1
    end
  end
  return selected, count
end

local function shoppingState()
  local engine = SNF.GroupShopping
  return engine and engine.summary() or {status = "idle", count = 0}
end

local function shoppingPurchase()
  local purchase = SNF.Compra and SNF.Compra.estado()
  if purchase and purchase.origen == SHOPPING_ORIGIN then return purchase end
end

local function inCombat()
  local purchase = SNF.Compra
  return (purchase and purchase.combate()) or (InCombatLockdown and InCombatLockdown()) or false
end

local function stopShoppingScan()
  if SNF.GroupShopping and shoppingState().status == "scanning" then
    SNF.Comercio.ejecutar("group-shopping", SNF.GroupShopping.stop)
  end
end

local function cancelShoppingPurchase()
  local purchase = shoppingPurchase()
  if not purchase or (purchase.fase == "comprando" and purchase.esperando == "compra") then return end
  if SNF.CantidadComercio and SNF.CantidadComercio.abierto() then SNF.CantidadComercio.cerrar() end
  SNF.Compra.cancelar()
end

closeShopping = function()
  if not shoppingVisible then return end
  shoppingVisible, shoppingStartFailed = false, false
  selectedRecommendation, shoppingMessage = nil, nil
  stopShoppingScan()
  cancelShoppingPurchase()
  marcos.shopping:Hide()
  marcos.browse:Show()
  paintShoppingButton()
end

paintShoppingButton = function(state)
  local button = marcos.escaneoCompras
  if not button then return end
  state = state or shoppingState()
  local scanning = state.status == "scanning"
  local enabled = scanning
  if not scanning then
    local _, count = selectedGroups()
    enabled = SNF.GroupShopping ~= nil and count > 0 and not inCombat()
  end
  button:ponerTexto(L.t(scanning and "SUBASTA_SHOP_STOP" or "SUBASTA_NAV_ESCANEO_COMPRAS"))
  button:ponerApagado(not enabled)
end

local function onScan()
  if shoppingState().status == "scanning" then
    stopShoppingScan()
    return
  end
  local engine = SNF.GroupShopping
  local groups, count = selectedGroups()
  if not engine or count == 0 or inCombat() then return end
  cancelShoppingPurchase()
  selectedRecommendation, shoppingMessage = nil, nil
  shoppingVisible, shoppingStartFailed = true, false
  marcos.campo:ClearFocus()
  marcos.campoGrupos:ClearFocus()
  marcos.browse:Hide()
  marcos.shopping:Show()
  marcos.shopping.page = 1
  marcos.shopping.list:SetVerticalScroll(0)
  local ok, started = SNF.Comercio.ejecutar("group-shopping", engine.start, groups)
  shoppingStartFailed = not (ok and started)
  paintShopping()
end

local function recommendation(id)
  if shoppingStartFailed or id == nil or shoppingState().status ~= "complete" then return end
  return SNF.GroupShopping.result(id)
end

local function prepareShoppingPurchase(id)
  local row = recommendation(id)
  if not row or inCombat() then return end
  selectedRecommendation, shoppingMessage = id, nil
  local purchase = shoppingPurchase()
  if purchase and purchase.fase == "comprando" and purchase.esperando == "compra" then
    shoppingMessage = "SUBASTA_RES_POR_QUE_OTRA_COMPRA"
  elseif row.overLimit then
    cancelShoppingPurchase()
    shoppingMessage = "SUBASTA_SHOP_OVER_LIMIT"
  else
    local ok, prepared = SNF.Comercio.ejecutar("group-shopping", SNF.GroupShopping.prepare, id)
    if not (ok and prepared) then
      cancelShoppingPurchase()
      shoppingMessage = "SUBASTA_SHOP_STALE"
    end
  end
  paintShopping()
end

local function pressShoppingPurchase()
  local purchase = shoppingPurchase()
  local row = recommendation(selectedRecommendation)
  if not purchase or not row or row.overLimit or inCombat() or purchase.shoppingId ~= row.id then
    return
  end
  if purchase.fase == "lista" and purchase.tipo == "mercancia" and SNF.CantidadComercio then
    SNF.CantidadComercio.abrir({sinRojo = true})
  elseif purchase.fase == "lista" or purchase.fase == "confirmar" then
    SNF.Comercio.ejecutar("group-shopping", SNF.Compra.pulsar)
  end
end

local function shoppingLine(parent, kind, x, y, right)
  local label = Tema.letra(parent:CreateFontString(nil, "OVERLAY"), kind)
  label:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
  label:SetPoint("TOPRIGHT", parent, "TOPRIGHT", -right, y)
  label:SetJustifyH("LEFT")
  label:SetWordWrap(false)
  return label
end

local function shoppingRow(panel, index)
  local content = panel.list.contenido
  local row = botonBase(content, function(self) prepareShoppingPurchase(self.recommendationId) end)
  row:SetHeight(SHOPPING_ROW_HEIGHT)
  row:SetPoint("TOPLEFT", content, "TOPLEFT", 0, -(index - 1) * SHOPPING_ROW_HEIGHT)
  row:SetWidth(math.max(1, content:GetWidth() - 6))
  local background = plana(row, "BACKGROUND", 0)
  background:SetAllPoints(row)
  row.background = background
  row.title = shoppingLine(row, "texto", 7, -4, 213)
  row.prices = Tema.letra(row:CreateFontString(nil, "OVERLAY"), "texto")
  row.prices:SetPoint("TOPRIGHT", row, "TOPRIGHT", -7, -4)
  row.prices:SetWidth(198)
  row.prices:SetJustifyH("RIGHT")
  row.prices:SetWordWrap(false)
  row.detail = shoppingLine(row, "texto", 7, -21, 7)
  panel.rows[index] = row
  return row
end

local function shoppingSummary(purchase, row)
  if shoppingMessage then return L.t(shoppingMessage) end
  if purchase and (purchase.shoppingId == selectedRecommendation or purchase.fase == "hecho") then
    if purchase.fase == "buscando" then
      return L.t("SUBASTA_SHOP_RECHECK")
    elseif purchase.fase == "lista" or purchase.fase == "confirmar" then
      return L.t("COMERCIO_BARRA_LISTA", math.floor(purchase.cantidad or 0), Tema.dinero(purchase.total or 0))
    elseif purchase.fase == "comprando" then
      return L.t("COMERCIO_BOTON_COMPRANDO")
    elseif purchase.fase == "hecho" then
      return L.t("COMERCIO_BARRA_HECHO", tostring(purchase.cantidad or 0), Tema.dinero(purchase.total or 0))
    elseif purchase.fase == "error" then
      local ui = SNF.UIComercio
      return L.t("COMERCIO_BARRA_ERROR", ui and ui.textoMotivo(purchase) or L.t("SUBASTA_SHOP_STALE"))
    end
  end
  return row and L.t("SUBASTA_SHOP_STALE") or L.t("SUBASTA_SHOP_SELECT")
end

paintShopping = function()
  local state = shoppingState()
  paintShoppingButton(state)
  local panel = marcos.shopping
  if not (visible and shoppingVisible and panel) then return end
  panel.close:ponerTexto(L.t("SUBASTA_SHOP_BACK"))
  local scanning = not shoppingStartFailed and state.status == "scanning"
  local complete = not shoppingStartFailed and state.status == "complete"
  local pages = complete and math.max(1, math.ceil(state.count / SHOPPING_PAGE_SIZE)) or 1
  local showPager = pages > 1
  if showPager ~= panel.pagination:IsShown() then
    panel.status:SetPoint("TOPRIGHT", panel, "TOPRIGHT", showPager and -276 or -130, -10)
    panel.pagination:SetShown(showPager)
  end
  if shoppingStartFailed then
    panel.status:SetText(L.t("SUBASTA_SHOP_NO_SCAN"))
  elseif scanning then
    panel.status:SetText(L.t("SUBASTA_SHOP_PROGRESS", state.current or 0, state.total or 0))
  elseif complete then
    panel.status:SetText(L.t("SUBASTA_SHOP_RESULTS", state.count, state.skipped or 0))
  else
    panel.status:SetText(L.t("SUBASTA_SHOP_STOPPED"))
  end
  if not complete then
    if panel.hasResults then
      for _, row in ipairs(panel.rows) do row:Hide() end
      panel.list:ponerAlto(0)
      panel.hasResults = false
    end
    panel.buy:ponerApagado(true)
    panel.summary:SetText("")
    return
  end
  panel.page = math.min(panel.page, pages)
  panel.previous:ponerApagado(panel.page == 1)
  panel.next:ponerApagado(panel.page == pages)
  panel.pageText:SetText(L.t("SUBASTA_SHOP_PAGE", panel.page, pages))
  local rows = SNF.GroupShopping.page((panel.page - 1) * SHOPPING_PAGE_SIZE, SHOPPING_PAGE_SIZE)
  local selectedRow
  for index, offer in ipairs(rows) do
    local row = panel.rows[index] or shoppingRow(panel, index)
    row.recommendationId = offer.id
    if offer.id == selectedRecommendation then selectedRow = offer end
    local name = tostring(offer.name or offer.item):gsub("|", "")
    local route = tostring(offer.route or ""):gsub(SEP, " › "):gsub("|", "")
    local operation = tostring(offer.operation or ""):gsub("|", "")
    local price, cap = Tema.dinero(offer.price), Tema.dinero(offer.threshold)
    pintar(row.background, offer.id == selectedRecommendation and "elegida" or "hundido")
    row.title:SetText(offer.overLimit and L.t("SUBASTA_SHOP_ROW_LISTED", name, offer.available)
      or L.t("SUBASTA_SHOP_ROW", name, offer.quantity))
    -- Prudent cap: say when the house value or the regional price lowered the operation's limit.
    local pricesKey = offer.clip == "regional" and "SUBASTA_SHOP_PRICES_CLIP_REGIONAL"
      or offer.clip == "mercado" and "SUBASTA_SHOP_PRICES_CLIP_MERCADO" or "SUBASTA_SHOP_PRICES"
    row.prices:SetText(L.t(pricesKey, price, cap))
    row.detail:SetText(L.t(offer.overLimit and "SUBASTA_SHOP_ROW_OVER" or "SUBASTA_SHOP_ROW_DETAIL", route, operation))
    colorTexto(row.title, offer.overLimit and "apagado" or "texto")
    colorTexto(row.prices, offer.overLimit and "apagado" or "texto")
    colorTexto(row.detail, "textoPestana")
    row:Show()
  end
  for index = #rows + 1, #panel.rows do panel.rows[index]:Hide() end
  panel.list:ponerAlto(#rows * SHOPPING_ROW_HEIGHT)
  panel.hasResults = #rows > 0
  local purchase = shoppingPurchase()
  local empty = #rows == 0 and not purchase
  panel.summary:SetText(empty and L.t("SUBASTA_SHOP_EMPTY") or shoppingSummary(purchase, selectedRow))
  local ready = selectedRow and not selectedRow.overLimit and purchase and purchase.shoppingId == selectedRow.id
    and not inCombat() and (purchase.fase == "lista" or purchase.fase == "confirmar")
  local key = "COMERCIO_COMPRAR"
  if ready then
    if purchase.fase == "confirmar" then key = "SUBASTA_SHOP_CONFIRM"
    elseif purchase.tipo == "mercancia" then key = "COMERCIO_ELEGIR_CANTIDAD" end
  end
  panel.buy:ponerTexto(L.t(key))
  panel.buy:ponerApagado(not ready)
end

local function changeShoppingPage(offset)
  local panel = marcos.shopping
  panel.page = math.max(1, panel.page + offset)
  selectedRecommendation, shoppingMessage = nil, nil
  panel.list:SetVerticalScroll(0)
  cancelShoppingPurchase()
  paintShopping()
end

local function createShoppingPane(page)
  local panel = CreateFrame("Frame", nil, page)
  panel:SetPoint("TOPLEFT", page, "TOPLEFT", COLUMNA_X, -PANEL_ARRIBA)
  panel:SetPoint("BOTTOMRIGHT", page, "BOTTOMRIGHT", -MARGEN_DER, PANEL_ABAJO)
  Tema.panel(panel, "secundario", {borde = true})
  panel.status = shoppingLine(panel, "texto", 8, -10, 130)
  panel.close = Piezas.boton(panel, L.t("SUBASTA_SHOP_BACK"), closeShopping, {ancho = 112, alto = ALTO_CAMPO})
  panel.close:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -7, -6)
  panel.buy = Piezas.boton(panel, L.t("COMERCIO_COMPRAR"), pressShoppingPurchase, {ancho = 180, alto = ALTO_CAMPO})
  panel.buy:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -7, 6)
  panel.summary = Tema.letra(panel:CreateFontString(nil, "OVERLAY"), "texto")
  panel.summary:SetJustifyH("LEFT")
  panel.summary:SetWordWrap(true)
  panel.summary:SetPoint("BOTTOMLEFT", panel, "BOTTOMLEFT", 8, 4)
  panel.summary:SetPoint("TOPRIGHT", panel.buy, "TOPLEFT", -6, 5)
  panel.list = Piezas.desplazable(panel)
  panel.list:SetPoint("TOPLEFT", panel, "TOPLEFT", 7, -34)
  panel.list:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -7, 36)
  panel.pagination = CreateFrame("Frame", nil, panel)
  panel.pagination:SetPoint("TOPRIGHT", panel.close, "TOPLEFT", -8, 0)
  panel.pagination:SetSize(140, ALTO_CAMPO)
  panel.previous = Piezas.boton(panel.pagination, "‹", function() changeShoppingPage(-1) end, {ancho = 26, alto = ALTO_CAMPO})
  panel.previous:SetPoint("TOPLEFT", panel.pagination, "TOPLEFT", 0, 0)
  conTooltip(panel.previous, function() return L.t("SUBASTA_SHOP_PREVIOUS") end)
  panel.next = Piezas.boton(panel.pagination, "›", function() changeShoppingPage(1) end, {ancho = 26, alto = ALTO_CAMPO})
  panel.next:SetPoint("TOPRIGHT", panel.pagination, "TOPRIGHT", 0, 0)
  conTooltip(panel.next, function() return L.t("SUBASTA_SHOP_NEXT") end)
  panel.pageText = shoppingLine(panel.pagination, "texto", 32, -3, 32)
  panel.pageText:SetJustifyH("CENTER")
  panel.pagination:Hide()
  panel.page = 1
  panel.rows = {}
  panel:Hide()
  marcos.shopping = panel
end

---------------------------------------------------------------------------------------------------
-- Búsquedas recientes y favoritas
---------------------------------------------------------------------------------------------------

local pintarLista -- (más abajo)

local function esFavorita(texto)
  local B = rawget(SNF, "Busqueda")
  return B ~= nil and B.esFavorita(texto) == true
end

local function pintarEstrella(f)
  local e = f.estrella
  if f.favorita then
    e.icono:SetVertexColor(1, 1, 1, 1)
  else
    pintar(e.icono, "apagado")
  end
  e:SetShown(f.sobre == true)
  f.resalte:SetShown(f.sobre == true)
end

local function alternarFavorita(f)
  local B = rawget(SNF, "Busqueda")
  if not (B and f.valor) then
    return
  end
  SNF.Comercio.ejecutar("navegar", B.marcarFavorita, f.valor, not esFavorita(f.valor))
  pintarLista()
end

local function crearFila(i)
  local contenido = marcos.zona.contenido
  local f = botonBase(contenido, function(self)
    SubastaNavegar.buscar(self.valor)
  end)
  f:SetHeight(ALTO_FILA)
  -- El ancho lo pone pintarLista (el de la zona): el contenido de un ScrollFrame lo coloca el cliente.
  f:SetPoint("TOPLEFT", contenido, "TOPLEFT", 0, -(i - 1) * ALTO_FILA)
  f.resalte = plana(f, "BACKGROUND", 0)
  f.resalte:SetAllPoints(f)
  pintar(f.resalte, "elegida")
  f.resalte:Hide()
  f.texto = Tema.letra(f:CreateFontString(nil, "OVERLAY"), "texto")
  f.texto:SetJustifyH("LEFT")
  f.texto:SetWordWrap(false)
  f.texto:SetPoint("LEFT", f, "LEFT", TEXTO_FILA, 0)
  f.texto:SetPoint("RIGHT", f, "RIGHT", -(LADO_ESTRELLA + 2 * TEXTO_FILA + 2), 0)
  colorTexto(f.texto, "texto")

  local e = botonBase(f, function()
    alternarFavorita(f)
  end)
  e:SetSize(LADO_ESTRELLA, LADO_ESTRELLA)
  e:SetPoint("RIGHT", f, "RIGHT", -6, 0)
  e.icono = e:CreateTexture(nil, "OVERLAY")
  e.icono:SetSize(LADO_ICONO, LADO_ICONO)
  e.icono:SetPoint("CENTER", e, "CENTER", 0, 0)
  e.icono:SetTexture(ESTRELLA)
  e:Hide()
  e:SetScript("OnEnter", proteger(function(self)
    f.sobre = true
    pintarEstrella(f)
    tooltip(self, L.t(f.favorita and "SUBASTA_NAV_QUITAR_FAVORITA" or "SUBASTA_NAV_MARCAR_FAVORITA"))
  end))
  e:SetScript("OnLeave", proteger(function()
    sinTooltip()
    f.sobre = ratonSobre(f)
    pintarEstrella(f)
  end))
  f.estrella = e

  f:SetScript("OnEnter", proteger(function(self)
    self.sobre = true
    pintarEstrella(self)
  end))
  f:SetScript("OnLeave", proteger(function(self)
    -- Al pasar de la fila a su ★ la fila sigue con el ratón encima.
    self.sobre = ratonSobre(self)
    pintarEstrella(self)
  end))
  marcos.filas[i] = f
  return f
end

pintarLista = function()
  if not marcos.zona then
    return
  end
  local B = rawget(SNF, "Busqueda")
  local textos = {}
  if B then
    textos = pestanaLista == 2 and B.favoritas() or B.recientes()
  end
  local ancho = marcos.zona.contenido:GetWidth()
  for i, t in ipairs(textos) do
    local f = marcos.filas[i] or crearFila(i)
    f:SetWidth(ancho)
    f.valor = t
    f.texto:SetText(t)
    f.favorita = esFavorita(t)
    f.sobre = f:IsShown() and ratonSobre(f) -- las filas se reutilizan: se mira de nuevo dónde está el ratón
    f:Show()
    pintarEstrella(f)
  end
  for i = #textos + 1, #marcos.filas do
    marcos.filas[i].sobre = false
    marcos.filas[i]:Hide()
  end
  marcos.vacio:SetText(L.t(pestanaLista == 2 and "SUBASTA_NAV_SIN_FAVORITAS" or "SUBASTA_NAV_SIN_RECIENTES"))
  marcos.vacio:SetShown(#textos == 0)
  marcos.zona:ponerAlto(#textos * ALTO_FILA)
end

---------------------------------------------------------------------------------------------------
-- Crear
---------------------------------------------------------------------------------------------------

-- Lo que depende del ancho de la ventana: el ancho de la columna de la derecha y de lo que va en ella.
local function colocar()
  local p = marcos.pagina
  if not p then
    return
  end
  local col = math.max(2 * HUECO + ANCHO_BUSCAR, (p:GetWidth() or 0) - COLUMNA_X - MARGEN_DER)
  local mitad = math.floor((col - HUECO) / 2)
  marcos.campo:SetWidth(col - ANCHO_BUSCAR - HUECO)
  for _, d in ipairs(BOTONES) do
    marcos[d.nombre]:SetWidth(d.izquierda and mitad or col - HUECO - mitad)
  end
  local pe = marcos.pestanas
  pe:SetWidth(col)
  local alCambiar = pe:GetScript("OnSizeChanged")
  if alCambiar then
    alCambiar(pe, col, pe:GetHeight())
  end
  marcos.zona.contenido:SetWidth(col)
  local shoppingContent = marcos.shopping.list.contenido
  shoppingContent:SetWidth(col - 14)
  for _, row in ipairs(marcos.shopping.rows) do
    row:SetWidth(shoppingContent:GetWidth() - 6)
  end
  pintarLista()
end

local function crearIzquierda(pagina)
  local panel = CreateFrame("Frame", nil, pagina)
  panel:SetPoint("TOPLEFT", pagina, "TOPLEFT", PANEL_IZQ, -PANEL_ARRIBA)
  panel:SetPoint("BOTTOMLEFT", pagina, "BOTTOMLEFT", PANEL_IZQ, PANEL_ABAJO)
  panel:SetWidth(ANCHO_PANEL)
  local fondo = plana(panel, "BACKGROUND", 0)
  fondo:SetAllPoints(panel)
  pintar(fondo, "secundario")
  marcos.panel, marcos.fondoPanel = panel, fondo

  local campo = Piezas.campo(panel, {ancho = ANCHO_CAMPO_GRUPOS, lupa = true, placeholder = L.t("SUBASTA_NAV_BUSCAR_GRUPOS")})
  Tema.letra(campo, "texto", TAMANO_LETRA_CAMPO)
  Tema.letra(campo.marcador, "texto", TAMANO_LETRA_CAMPO)
  campo:SetPoint("TOPLEFT", panel, "TOPLEFT", CAMPO_GRUPOS_X, -CAMPO_GRUPOS_Y)
  local previoTexto = campo:GetScript("OnTextChanged")
  campo:SetScript("OnTextChanged", proteger(function(self, ...)
    if previoTexto then
      previoTexto(self, ...)
    end
    if marcos.arbol then
      marcos.arbol:filtrar(self:GetText())
    end
  end))
  sinTecladoEnCombate(campo)
  marcos.campoGrupos = campo

  local cuadrado = {lado = LADO_CUADRADO, tamanoIcono = ICONO_CUADRADO}
  local plegar = Piezas.botonCuadrado(panel, "cerrado", function()
    abrirTodo(false)
  end, cuadrado)
  plegar:SetPoint("RIGHT", panel, "TOPRIGHT", -ICONO_DER, -(CAMPO_GRUPOS_Y + ALTO_CAMPO / 2))
  local desplegar = Piezas.botonCuadrado(panel, "abierto", function()
    abrirTodo(true)
  end, cuadrado)
  desplegar:SetPoint("RIGHT", plegar, "LEFT", -HUECO_ICONOS, 0)
  conTooltip(desplegar, function() return L.t("SUBASTA_NAV_DESPLEGAR") end)
  conTooltip(plegar, function() return L.t("SUBASTA_NAV_PLEGAR") end)
  marcos.desplegar, marcos.plegar = desplegar, plegar

  local escaneo = Piezas.boton(panel, L.t("SUBASTA_NAV_ESCANEO_COMPRAS"), onScan,
    {alto = ALTO_ESCANEO, ancho = ANCHO_PANEL - 2 * RELLENO_ARBOL})
  Tema.letra(escaneo.texto, "boton", TAMANO_LETRA_ESCANEO)
  escaneo.texto:SetWordWrap(false) -- en una sola línea, siempre
  escaneo:SetPoint("BOTTOMLEFT", panel, "BOTTOMLEFT", RELLENO_ARBOL, RELLENO_ARBOL)
  -- Apagado, el texto un poco más claro que el apagado común (solo este botón): sobre el fondo del botón apagado se lee mejor.
  local apagarComun = escaneo.ponerApagado
  function escaneo:ponerApagado(apagado)
    apagarComun(self, apagado)
    if self.snfApagado then
      colorTexto(self.texto, "textoPestana")
    end
  end
  escaneo:ponerApagado(true)
  conTooltip(escaneo, function()
    local _, count = selectedGroups()
    if count == 0 then return L.t("SUBASTA_SHOP_NO_GROUPS") end
    return L.t("SUBASTA_SHOP_SELECTED_GROUPS", count)
  end)
  marcos.escaneoCompras = escaneo

  local a = Piezas.arbol(panel, {
    raizFija = true, margen = 4, sangria = 12, nodos = nodos, marcas = marca, alElegir = alternarGrupo, relleno = "hundido",
  })
  a:SetPoint("TOPLEFT", panel, "TOPLEFT", RELLENO_ARBOL, -ARBOL_ARRIBA)
  a:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -RELLENO_ARBOL, RELLENO_ARBOL + ALTO_ESCANEO + HUECO_ESCANEO)
  marcos.arbol = a
end

local function crearDerecha(pagina)
  local campo = Piezas.campo(pagina, {ancho = 300, lupa = true, placeholder = L.t("SUBASTA_NAV_BUSCAR_CASA")})
  Tema.letra(campo, "texto", TAMANO_LETRA_CAMPO)
  Tema.letra(campo.marcador, "texto", TAMANO_LETRA_CAMPO)
  campo:SetPoint("TOPLEFT", pagina, "TOPLEFT", COLUMNA_X, -ARRIBA_CAMPO)
  campo:SetScript("OnEnterPressed", proteger(function(self)
    self:ClearFocus()
    SubastaNavegar.buscar(self:GetText())
  end))
  sinTecladoEnCombate(campo)
  marcos.campo = campo

  local buscar = Piezas.boton(pagina, L.t("SUBASTA_NAV_BUSCAR"), function()
    marcos.campo:ClearFocus()
    SubastaNavegar.buscar(marcos.campo:GetText())
  end, {alto = ALTO_CAMPO, ancho = ANCHO_BUSCAR})
  buscar:SetPoint("TOPRIGHT", pagina, "TOPRIGHT", -MARGEN_DER, -ARRIBA_CAMPO)
  marcos.buscar = buscar

  local arribaFila = {ARRIBA_CAMPO + ALTO_CAMPO + HUECO, ARRIBA_CAMPO + ALTO_CAMPO + 2 * HUECO + ALTO_BOTON} -- 41 y 75
  for _, d in ipairs(BOTONES) do
    local action
    if d.nombre == "ofertas" then action = abrirOfertas
    else
      local prefix = ({vendedores = "vendor:", desencantar = "disenchant:", avanzada = "advanced:0:0:"})[d.nombre]
      action = function()
        local term = recortar(campo:GetText())
        if prefix ~= "advanced:0:0:" then
          term = prefix .. term:gsub("^advanced:%d+:%d+:", ""):gsub("^vendor:", ""):gsub("^disenchant:", "")
        elseif not term:match("^advanced:") then
          term = prefix .. term:gsub("^vendor:", ""):gsub("^disenchant:", "")
        end
        campo:SetText(term)
        if not SubastaNavegar.buscar(term) then campo:SetFocus() end
      end
    end
    local b = Piezas.boton(pagina, L.t(d.clave), action,
      {borde = true, alto = ALTO_BOTON, ancho = 200})
    Tema.letra(b.texto, "boton", TAMANO_LETRA_BOTON)
    if d.izquierda then
      b:SetPoint("TOPLEFT", pagina, "TOPLEFT", COLUMNA_X, -arribaFila[d.fila])
    else
      b:SetPoint("TOPRIGHT", pagina, "TOPRIGHT", -MARGEN_DER, -arribaFila[d.fila])
    end
    if d.nombre == "ofertas" then
      conTooltip(b, function(self)
        if self.snfApagado then
          return L.t("SUBASTA_NAV_SIN_PRECIOS")
        end
      end)
    else
      local help = ({avanzada = "TRADE_ADVANCED_HELP", vendedores = "TRADE_VENDOR_HELP", desencantar = "TRADE_DISENCHANT_HELP"})[d.nombre]
      conTooltip(b, function() return L.t(help) end)
    end
    marcos[d.nombre] = b
  end
  pintarOfertas()

  local pe = Piezas.pestanas(pagina, {
    nombres = {L.t("SUBASTA_NAV_RECIENTES"), L.t("SUBASTA_NAV_FAVORITAS")},
    alElegir = function(i)
      pestanaLista = i
      pintarLista()
    end,
  })
  pe:SetPoint("TOPLEFT", pagina, "TOPLEFT", COLUMNA_X, -(arribaFila[2] + ALTO_BOTON + HUECO_PESTANAS))
  marcos.pestanas = pe

  local zona = Piezas.desplazable(pagina)
  zona:SetPoint("TOPLEFT", pe, "BOTTOMLEFT", 0, -HUECO_LISTA)
  zona:SetPoint("BOTTOMRIGHT", pagina, "BOTTOMRIGHT", -MARGEN_DER, PANEL_ABAJO)
  marcos.zona = zona

  local vacio = Tema.letra(pagina:CreateFontString(nil, "OVERLAY"), "texto")
  vacio:SetJustifyH("LEFT")
  vacio:SetPoint("LEFT", zona, "TOPLEFT", TEXTO_FILA, -ALTO_FILA / 2)
  colorTexto(vacio, "apagado")
  marcos.vacio = vacio
end

local function crear(pagina)
  marcos.pagina = pagina
  crearIzquierda(pagina)
  local browse = CreateFrame("Frame", nil, pagina)
  browse:SetAllPoints(pagina)
  marcos.browse = browse
  crearDerecha(browse)
  createShoppingPane(pagina)
  -- La ventana cambia de tamaño (el asa): la columna de la derecha se reparte otra vez.
  local previo = pagina:GetScript("OnSizeChanged")
  pagina:SetScript("OnSizeChanged", proteger(function(self, ...)
    if previo then
      previo(self, ...)
    end
    colocar()
  end))
  -- Con el combate empezado ningún campo se queda con el teclado (solo se escucha mientras la página se ve).
  pagina:SetScript("OnEvent", proteger(function(_, event)
    if event == "PLAYER_REGEN_DISABLED" then
      marcos.campo:ClearFocus()
      marcos.campoGrupos:ClearFocus()
    end
    paintShopping()
  end))
  colocar()
end

local function mostrar()
  local p = marcos.pagina
  if not p then
    return
  end
  visible = true
  p:RegisterEvent("PLAYER_REGEN_DISABLED")
  p:RegisterEvent("PLAYER_REGEN_ENABLED")
  pintarOfertas()
  marcos.arbol:refrescar() -- los grupos pueden haber cambiado en la ventana principal
  colocar() -- también repinta la lista: al volver de resultados ya está la búsqueda nueva
  paintShopping()
end

local function ocultar()
  local p = marcos.pagina
  if not p then
    return
  end
  visible = false
  closeShopping()
  p:UnregisterEvent("PLAYER_REGEN_DISABLED")
  p:UnregisterEvent("PLAYER_REGEN_ENABLED")
  sinTooltip()
  marcos.campo:ClearFocus()
  marcos.campoGrupos:ClearFocus()
  for _, f in ipairs(marcos.filas) do
    f.sobre = false
  end
end

local function idioma()
  marcos.campoGrupos.marcador:SetText(L.t("SUBASTA_NAV_BUSCAR_GRUPOS"))
  marcos.campo.marcador:SetText(L.t("SUBASTA_NAV_BUSCAR_CASA"))
  marcos.buscar:ponerTexto(L.t("SUBASTA_NAV_BUSCAR"))
  for _, d in ipairs(BOTONES) do
    marcos[d.nombre]:ponerTexto(L.t(d.clave))
  end
  marcos.pestanas.pestanas[1].texto:SetText(L.t("SUBASTA_NAV_RECIENTES"))
  marcos.pestanas.pestanas[2].texto:SetText(L.t("SUBASTA_NAV_FAVORITAS"))
  marcos.arbol:refrescar() -- el texto de Grupo Base
  pintarLista()
  paintShopping()
end

Ventana.registrar("navegar", {crear = crear, mostrar = mostrar, ocultar = ocultar, idioma = idioma})

-- Una búsqueda lanzada con Navegar a la vista (desde fuera) cambia las recientes: la lista se repinta. El aviso llega como
-- mucho una vez por fotograma y solo hace algo mientras la página se ve.
SNF.escuchar("SNF_COMERCIO_BUSQUEDA", function()
  if visible then
    SNF.Comercio.ejecutar("navegar", pintarLista)
  end
end)

SNF.escuchar("SNF_COMMERCE_SHOPPING", function()
  if visible then SNF.Comercio.ejecutar("group-shopping", paintShopping) end
end)

SNF.escuchar("SNF_COMERCIO_COMPRA", function()
  if visible and shoppingVisible then SNF.Comercio.ejecutar("group-shopping", paintShopping) end
end)
