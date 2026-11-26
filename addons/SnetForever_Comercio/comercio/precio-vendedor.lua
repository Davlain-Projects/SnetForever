-- SnetForever: el precio de venta al vendedor de cada objeto, guardado (como hace TSM con su caché de objetos).
--
-- POR QUÉ. El juego solo da el precio de vendedor (GetItemInfo) de los objetos que ya tiene en la caché de la sesión. Medido
-- en el juego el 26-11 sobre los 11.630 objetos del árbol, recién entrado: el juego lo daba de 1.689 y TSM de 8.164. Las
-- fórmulas con vendorsell (el suelo de Sniper, el «1,5 × vendedor» de los mínimos de venta) quedaban sin valor o por
-- debajo de las de TSM.
--
-- CÓMO.
--   · Cada vez que el juego da el precio de un objeto (al calcular, o con GET_ITEM_INFO_RECEIVED), se guarda en
--     SnetForeverCuenta.comercio.precioVendedor[id] (cobre; 0 = el vendedor no lo compra). Lo guardado vale para siempre:
--     el precio de vendedor no cambia.
--   · La primera vez que se abre la subasta en la sesión (ESPERA_INICIO s después), se piden al juego los objetos del árbol que aún no
--     tienen precio guardado: LOTE cada CADA s, fuera de combate, y una segunda vuelta para los que llegaron tarde. Como el resto del
--     nada en pantalla.
--
-- PrecioVendedor.de(id) -> cobre | nil   el del juego si lo tiene (y lo guarda); si no, el guardado; si no, nil.
-- PrecioVendedor.rellenar()              empieza a pedir los que faltan (lo llama AUCTION_HOUSE_SHOW).
-- PrecioVendedor.estado() -> {guardados, pendientes, enMarcha}
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local PrecioVendedor = {}
SNF.PrecioVendedor = PrecioVendedor

PrecioVendedor.LOTE = 10
PrecioVendedor.CADA = 0.5
PrecioVendedor.ESPERA_INICIO = 5
PrecioVendedor.VUELTAS = 3

local function tabla()
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  if type(c) ~= "table" then
    return nil
  end
  if type(c.precioVendedor) ~= "table" then
    c.precioVendedor = {}
  end
  return c.precioVendedor
end

local function delJuego(id)
  local info = SNF.API.infoObjeto(id)
  local pv = info and info.pv
  if type(pv) == "number" and pv >= 0 and pv < 1e12 and not SNF.API.esSecreto(pv) then
    return math.floor(pv)
  end
  return nil
end

-- Apunta lo que da el juego y lo devuelve.
local function apuntar(id)
  local pv = delJuego(id)
  if pv then
    local t = tabla()
    if t and t[id] ~= pv then
      t[id] = pv
    end
  end
  return pv
end

function PrecioVendedor.de(id)
  if type(id) ~= "number" or id <= 0 then
    return nil
  end
  local pv = apuntar(id)
  if pv then
    return pv
  end
  local t = tabla()
  local guardado = t and t[id]
  return type(guardado) == "number" and guardado or nil
end

local pendientes, pos, vuelta, enMarcha, hecho = nil, 1, 1, false, false

local function enCombate()
  local f = rawget(_G, "InCombatLockdown")
  return f ~= nil and f() and true or false
end

local siguiente
siguiente = function()
  local t = tabla()
  if not t or not pendientes then
    enMarcha = false
    return
  end
  if enCombate() then
    C_Timer.After(5, siguiente)
    return
  end
  local fin = math.min(#pendientes, pos + PrecioVendedor.LOTE - 1)
  for i = pos, fin do
    local id = pendientes[i]
    if t[id] == nil and not apuntar(id) then
      SNF.API.pedirObjeto(id)
    end
  end
  pos = fin + 1
  if pos <= #pendientes then
    C_Timer.After(PrecioVendedor.CADA, siguiente)
    return
  end
  -- Otra vuelta solo con los que siguen sin precio (los pedidos llegan poco a poco).
  local quedan = {}
  for _, id in ipairs(pendientes) do
    if t[id] == nil then
      quedan[#quedan + 1] = id
    end
  end
  vuelta = vuelta + 1
  if #quedan == 0 or vuelta > PrecioVendedor.VUELTAS then
    pendientes, enMarcha = quedan, false
    return
  end
  pendientes, pos = quedan, 1
  C_Timer.After(5, siguiente)
end

-- Recorre el árbol buscando los objetos sin precio guardado. Corre ESPERA_INICIO s después de abrir la subasta, nunca en la entrada
-- (medido en principal-aguante: recorrer 11.630 claves al entrar alargaba la entrada).
local function preparar()
  local t = tabla()
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local v2 = t and cuenta.comercio.v2
  local objetos = type(v2) == "table" and v2.objetos
  if type(objetos) ~= "table" then
    enMarcha = false
    return
  end
  local vistos, lista = {}, {}
  for clave in pairs(objetos) do
    local id = type(clave) == "string" and tonumber(string.match(clave, "^i:(%d+)"))
    if id and not vistos[id] and t[id] == nil then
      vistos[id] = true
      lista[#lista + 1] = id
    end
  end
  table.sort(lista)
  if #lista == 0 then
    enMarcha = false
    return -- nada que pedir: la siguiente apertura de la subasta vuelve a mirar
  end
  hecho = true -- una vez empezado, no se repite en la sesión (lo que el juego no dio seguiría pidiéndose en cada pantalla de carga)
  pendientes, pos, vuelta = lista, 1, 1
  siguiente()
end

function PrecioVendedor.rellenar()
  if enMarcha or hecho then
    return
  end
  enMarcha = true
  C_Timer.After(PrecioVendedor.ESPERA_INICIO, preparar)
end

function PrecioVendedor.estado()
  local t = tabla()
  local n = 0
  for _ in pairs(t or {}) do
    n = n + 1
  end
  return {guardados = n, pendientes = pendientes and #pendientes or 0, enMarcha = enMarcha}
end

SNF.Eventos.escuchar("GET_ITEM_INFO_RECEIVED", function(id, bien)
  if SNF.API.esSecreto(id) or SNF.API.esSecreto(bien) then
    return
  end
  if bien ~= false and type(id) == "number" then
    apuntar(id)
  end
end)

SNF.Eventos.escuchar("AUCTION_HOUSE_SHOW", function()
  pcall(PrecioVendedor.rellenar)
end)
