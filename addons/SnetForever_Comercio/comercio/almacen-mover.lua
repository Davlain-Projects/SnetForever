-- SnetForever: Almacén, UN movimiento por clic (excepción al §4 del diseño aprobada por Alain el 26-nov: «Sí, un
-- movimiento por clic»). Es el ÚNICO archivo del addon que puede llamar a C_Container.PickupContainerItem y
-- C_Container.SplitContainerItem (lo vigila tools/banco-wow/src/comprobar-lua51.js). Solo entre las bolsas y el banco
-- personal abierto, solo desde el OnClick del botón «Mover una pila» de la ventana de Almacén (ui/almacen.lua) y solo una
-- pila (o una parte de una pila) por clic. Nada de comprar, vender, usar, equipar, destruir ni otras zonas.
--
-- Cómo mueve (lo mismo que TSM 4.15.9, LibTSMService/Source/Banking/Internal/MoveContext.lua: partir el origen al cursor
-- y soltarlo en un hueco VACÍO del destino), pero con el jugador al mando:
--   1. Mover.paso(vista, clave) dice, para la fila elegida, el hueco de origen (por orden de bolsa, respetando los
--      múltiplos de pila de la operación), el hueco vacío del destino (el primero de una bolsa normal, nunca la de componentes ni una
--      especial) y cuántas unidades: min(pila del hueco, lo que mueve la fila, origen - reserva MAYOR de sus operaciones).
--      Si una reserva posterior es mayor que la que limitó a las anteriores, se conserva la mayor; si además hay
--      múltiplos de pila, se bloquea y se explica (no se inventa otro redondeo).
--   2. ejecutar(paso, vista), en el clic: vuelve a leerlo todo justo antes (vista vigente, banco abierto, fuera de
--      combate, el mismo objeto con el mismo enlace y la misma cantidad en el origen y sin bloquear, el destino vacío y
--      de una bolsa normal, el cursor vacío de verdad) y entonces hace UNA cosa: parte (o coge) el origen y lo suelta en
--      el destino.
--   3. Hasta que el juego enseña los dos huecos como se esperaban (origen con lo que queda, destino con lo movido, los dos
--      sin bloquear) y el cursor vacío, el movimiento está «en curso» y no se acepta otro clic. Los eventos y el
--      temporizador solo MIRAN: nunca vuelven a mover ni a intentar.
--   Si el destino no acepta la pila y el cursor sigue ocupado, se para y se deja el cursor al jugador.
--   Si el juego bloquea o prohíbe la llamada (ADDON_ACTION_BLOCKED / ADDON_ACTION_FORBIDDEN) o da un error, el ejecutor se
--   apaga hasta el /reload y la ventana queda en vista previa. Sin las funciones (capacidades()), lo mismo.
--
-- Lo que no se sabe sin probarlo en la partida está en docs/comercio/almacen.md («Comprobaciones en el cliente Forever»).
--
-- SNF.AlmacenMover:
--   .capacidades() -> true | false, falta
--   .restringido() -> motivo | nil       el juego bloqueó, prohibió o dio error: no se vuelve a mover en esta sesión.
--   .paso(vista, clave) -> paso | nil, motivo
--      paso = {clave, direccion, item, enlace, cantidad, partir, origen = {bolsa, hueco, n}, destino = {bolsa, hueco},
--              reservaMax, origenTotal, limitado, huella}
--   .ejecutar(paso, vista) -> true, "en_curso" | false, motivo, dato?      SOLO desde el OnClick del botón.
--   .estado() -> {fase = "libre" | "en_curso" | "sin_confirmar", resultado?, motivo?, paso?}
--      resultado (fase libre, del último movimiento): "hecho" | "rechazado" | "detenido" |
--      "interrumpido" | "bloqueado_juego" | "error_api".
--   .comprobar() -> fase    mira los dos huecos y el cursor; nunca mueve.
-- Avisa con SNF_ALMACEN_MOVER (y SNF_ALMACEN) cada vez que cambia el estado.
local SNF = SnetForever
local Mover = {}
SNF.AlmacenMover = Mover

local API = SNF.API
local ESPERA_CONFIRMAR = 5 -- segundos sin respuesta del juego hasta avisar (no se reintenta: solo se avisa)
local ADDONS = {SnetForever = true, SnetForever_Comercio = true}

local estado = {fase = "libre"}
local restriccion -- motivo por el que el ejecutor quedó apagado en esta sesión
local dentroDelClic = false
local bloqueadoAhora = false
local turno = 0

---------------------------------------------------------------------------------------------------
-- Lo que el cliente expone
---------------------------------------------------------------------------------------------------

function Mover.capacidades()
  if type(rawget(_G, "C_Container")) ~= "table" then
    return false, "C_Container"
  end
  if type(C_Container.PickupContainerItem) ~= "function" then
    return false, "PickupContainerItem"
  end
  if type(C_Container.SplitContainerItem) ~= "function" then
    return false, "SplitContainerItem"
  end
  if type(C_Container.GetContainerItemInfo) ~= "function" then
    return false, "GetContainerItemInfo"
  end
  if type(rawget(_G, "GetCursorInfo")) ~= "function" then
    return false, "GetCursorInfo"
  end
  return true
end

function Mover.restringido()
  return restriccion
end

function Mover.estado()
  return estado
end

-- El cursor: "vacio" | "item", id, enlace | "otro" | nil (no se sabe).
local function cursor()
  local f = rawget(_G, "GetCursorInfo")
  if type(f) ~= "function" then
    return nil
  end
  local ok, tipo, id, enlace = pcall(f)
  if not ok or API.esSecreto(tipo) then
    return nil
  end
  if tipo == nil then
    return "vacio"
  elseif tipo == "item" and not API.esSecreto(id) and type(id) == "number" then
    if API.esSecreto(enlace) or type(enlace) ~= "string" then enlace = nil end
    return "item", id, enlace
  end
  return "otro"
end

local function enCombate()
  local f = rawget(_G, "InCombatLockdown")
  if type(f) ~= "function" then
    return false
  end
  local ok, si = pcall(f)
  return not ok or si == true
end

local function ahora()
  local f = rawget(_G, "GetTime")
  return type(f) == "function" and f() or 0
end

-- Un enlace de objeto sin variante: solo el id, sin encantamiento, gemas, sufijo ni bonus (los campos 2 a 7 y el 13 de
-- «item:id:encantamiento:gema1:gema2:gema3:gema4:sufijo:único:nivel:espec:modificadores:contexto:nBonus:…»).
local function enlaceSimple(enlace, item)
  if type(enlace) ~= "string" then
    return false
  end
  local cadena = string.match(enlace, "|Hitem:([^|]+)|h")
  if not cadena then
    return false
  end
  local campos = {}
  for c in string.gmatch(cadena .. ":", "([^:]*):") do
    campos[#campos + 1] = c
  end
  if tonumber(campos[1]) ~= item then
    return false
  end
  for i = 2, 7 do
    if campos[i] ~= nil and campos[i] ~= "" and campos[i] ~= "0" then
      return false
    end
  end
  return campos[13] == nil or campos[13] == "" or campos[13] == "0"
end
Mover.enlaceSimple = enlaceSimple

local function contiene(lista, valor)
  for _, v in ipairs(lista or {}) do
    if v == valor then
      return true
    end
  end
  return false
end

-- ¿Puede `bolsa` ser destino de esa dirección? Guardar: una del banco personal. Sacar y reponer: una propia que no sea la
-- de componentes. Y en las dos, que el juego diga que es de tipo normal (familia 0).
local function destinoValido(direccion, bolsa, hueco)
  if direccion == "guardar" then
    if not contiene(API.bolsasBanco(), bolsa) then
      return false
    end
  else
    local propias, componentes = API.bolsasPropias()
    if not contiene(propias, bolsa) or (componentes and componentes[bolsa]) then
      return false
    end
  end
  local n = API.huecosBolsa(bolsa)
  if not n or hueco < 1 or hueco > n then
    return false
  end
  local libres, familia = API.libresBolsa(bolsa)
  return familia == 0 and libres ~= nil and libres >= 1
end

---------------------------------------------------------------------------------------------------
-- Avisos y estado
---------------------------------------------------------------------------------------------------

local function avisar()
  SNF.Eventos.emitir("SNF_ALMACEN_MOVER")
  SNF.Eventos.emitir("SNF_ALMACEN")
end

---------------------------------------------------------------------------------------------------
-- Eventos: solo miran, y solo mientras hay un movimiento en curso (BAG_UPDATE_DELAYED y los demás saltan mucho).
---------------------------------------------------------------------------------------------------

local function bloqueado(nombreAddon)
  if ADDONS[nombreAddon] and (dentroDelClic or estado.fase ~= "libre") then
    bloqueadoAhora = true
    if not dentroDelClic then Mover.comprobar() end
  end
end

local function mirar()
  if estado.fase ~= "libre" then
    Mover.comprobar()
  end
end

local EVENTOS = {
  ADDON_ACTION_BLOCKED = bloqueado, ADDON_ACTION_FORBIDDEN = bloqueado,
  BAG_UPDATE_DELAYED = mirar, ITEM_LOCK_CHANGED = mirar, CURSOR_CHANGED = mirar, BANKFRAME_CLOSED = mirar,
}
local ORDEN_EVENTOS = {"ADDON_ACTION_BLOCKED", "ADDON_ACTION_FORBIDDEN", "BAG_UPDATE_DELAYED", "ITEM_LOCK_CHANGED",
  "CURSOR_CHANGED", "BANKFRAME_CLOSED"}

local function vigilar(si)
  for _, evento in ipairs(ORDEN_EVENTOS) do
    if si then
      SNF.Eventos.escuchar(evento, EVENTOS[evento])
    else
      SNF.Eventos.dejar(evento, EVENTOS[evento])
    end
  end
end

local function terminar(resultado, motivo)
  estado = {fase = "libre", resultado = resultado, motivo = motivo, paso = estado.paso}
  vigilar(false)
  avisar()
end

local function apagar(motivo)
  restriccion = restriccion or motivo
end

---------------------------------------------------------------------------------------------------
-- El paso de una fila
---------------------------------------------------------------------------------------------------

function Mover.paso(vista, clave)
  local ok, falta = Mover.capacidades()
  if not ok then
    return nil, "sin_api", falta
  end
  if restriccion then
    return nil, "restringido"
  end
  if type(vista) ~= "table" or vista.estado ~= "lista" or not vista._origen or not vista._destino then
    return nil, "sin_vista"
  end
  local fila
  for _, f in ipairs(vista.filas) do
    if f.clave == clave then
      fila = f
      break
    end
  end
  if not fila then
    return nil, "sin_fila"
  end
  if (fila.estado ~= "mover" and fila.estado ~= "sin_hueco") or not fila.mover or fila.mover <= 0 or type(fila.reservaMax) ~= "number" then
    return nil, "fila_no_mueve"
  end
  local permitido = math.min(fila.mover, fila.origen - fila.reservaMax)
  if permitido <= 0 then
    return nil, "reserva", fila.reservaMax
  end
  local limitado = permitido < fila.mover
  if limitado and fila.conPila then
    return nil, "reserva_pila", fila.reservaMax
  end
  local donde = vista._origen.ubicaciones[fila.item]
  if not donde or not donde[1] then
    return nil, "sin_origen"
  end
  for _, u in ipairs(donde) do
    if not enlaceSimple(u.enlace, fila.item) then
      return nil, "variante_hueco"
    end
  end
  local o = donde[1]
  -- Con múltiplo, una pila más pequeña no puede cumplir el cálculo completo de la fila en este clic.
  if fila.conPila then
    for _, u in ipairs(donde) do
      if u.n >= permitido and u.bloqueado == false then
        o = u
        break
      end
    end
    if o.n < permitido then return nil, "pila_incompleta", permitido end
  end
  if o.bloqueado == nil then
    return nil, "origen_incierto"
  elseif o.bloqueado then
    return nil, "origen_bloqueado"
  end
  local d = vista._destino.vacios[1]
  if not d then
    return nil, "sin_destino"
  end
  local cantidad = math.min(o.n, permitido)
  return {clave = fila.clave, direccion = vista.direccion, item = fila.item, enlace = o.enlace, cantidad = cantidad,
    partir = cantidad < o.n, origen = {bolsa = o.bolsa, hueco = o.hueco, n = o.n},
    destino = {bolsa = d.bolsa, hueco = d.hueco}, reservaMax = fila.reservaMax, origenTotal = fila.origen,
    limitado = limitado, huella = vista.huella}
end

---------------------------------------------------------------------------------------------------
-- Comprobaciones justo antes del clic
---------------------------------------------------------------------------------------------------

local function comprobarAntes(paso, vista)
  if estado.fase ~= "libre" then
    return "en_curso"
  end
  local ok, falta = Mover.capacidades()
  if not ok then
    return "sin_api", falta
  end
  if restriccion then
    return "restringido"
  end
  if type(paso) ~= "table" or type(vista) ~= "table" then
    return "sin_vista"
  end
  if not SNF.Almacen.bancoAbierto() then
    return "sin_banco"
  end
  if enCombate() then
    return "en_combate"
  end
  if paso.huella ~= vista.huella or paso.direccion ~= vista.direccion then
    return "cambio"
  end
  local vale, motivo, nueva = SNF.Almacen.vigente(vista, true)
  if not vale then
    return motivo == "cambio" and "cambio" or (motivo or "cambio")
  end
  -- La tabla puede verse igual aunque llegue otra reserva, variante o pila bloqueada. Calcula con la lectura nueva.
  local otra, porque, dato = Mover.paso(nueva, paso.clave)
  if not otra then
    return porque, dato
  end
  for _, campo in ipairs({"item", "enlace", "cantidad", "partir", "reservaMax", "origenTotal"}) do
    if otra[campo] ~= paso[campo] then
      return "cambio"
    end
  end
  if otra.origen.bolsa ~= paso.origen.bolsa or otra.origen.hueco ~= paso.origen.hueco or otra.origen.n ~= paso.origen.n
    or otra.destino.bolsa ~= paso.destino.bolsa or otra.destino.hueco ~= paso.destino.hueco then
    return "cambio"
  end
  -- La reserva mayor no se toca nunca.
  if paso.origenTotal - paso.cantidad < paso.reservaMax or paso.cantidad < 1 or paso.cantidad > paso.origen.n then
    return "reserva", paso.reservaMax
  end
  -- El origen, tal cual: mismo objeto, mismo enlace, misma cantidad y sin bloquear.
  local o = API.infoContenedor(paso.origen.bolsa, paso.origen.hueco, true)
  if not o or o.id ~= paso.item or o.enlace ~= paso.enlace or o.n ~= paso.origen.n then
    return "origen_cambio"
  end
  if o.b ~= false then
    return o.b == nil and "origen_incierto" or "origen_bloqueado"
  end
  -- El destino: vacío de verdad, dentro de la bolsa y de una bolsa normal de esa dirección.
  if API.huecoVacio(paso.destino.bolsa, paso.destino.hueco) ~= true
    or not destinoValido(paso.direccion, paso.destino.bolsa, paso.destino.hueco) then
    return "destino_cambio"
  end
  local c = cursor()
  if c ~= "vacio" then
    return "cursor_ocupado"
  end
  return nil
end

---------------------------------------------------------------------------------------------------
-- El clic
---------------------------------------------------------------------------------------------------

function Mover.ejecutar(paso, vista)
  local motivo, dato = comprobarAntes(paso, vista)
  if motivo then
    return false, motivo, dato
  end
  turno = turno + 1
  local este = turno
  estado = {fase = "en_curso", paso = paso, desde = ahora(), turno = este}
  dentroDelClic, bloqueadoAhora = true, false
  vigilar(true)
  local ok, err
  if paso.partir then
    ok, err = pcall(C_Container.SplitContainerItem, paso.origen.bolsa, paso.origen.hueco, paso.cantidad)
  else
    ok, err = pcall(C_Container.PickupContainerItem, paso.origen.bolsa, paso.origen.hueco)
  end
  if not ok or bloqueadoAhora then
    dentroDelClic = false
    apagar(not ok and "error_api" or "bloqueado_juego")
    if cursor() == "vacio" then
      terminar(not ok and "error_api" or "bloqueado_juego", not ok and tostring(err) or nil)
    else
      terminar("detenido", "cursor_lleno")
    end
    return false, estado.resultado
  end
  local c, id, enlace = cursor()
  if c == "vacio" then
    dentroDelClic = false
    terminar("rechazado", "no_cogio")
    return false, "rechazado"
  elseif c ~= "item" or id ~= paso.item or enlace ~= paso.enlace then
    dentroDelClic = false
    terminar("detenido", "cursor_ajeno")
    return false, "detenido"
  end
  if not SNF.Almacen.bancoAbierto() or enCombate() or API.huecoVacio(paso.destino.bolsa, paso.destino.hueco) ~= true
    or not destinoValido(paso.direccion, paso.destino.bolsa, paso.destino.hueco) then
    dentroDelClic = false
    terminar("detenido", "cursor_lleno")
    return false, "detenido"
  end
  ok, err = pcall(C_Container.PickupContainerItem, paso.destino.bolsa, paso.destino.hueco)
  dentroDelClic = false
  if not ok or bloqueadoAhora then
    local error = not ok and "error_api" or "bloqueado_juego"
    apagar(error)
    if cursor() ~= "vacio" then
      terminar("detenido", "cursor_lleno")
    else
      terminar(error, not ok and tostring(err) or nil)
    end
    return false, estado.resultado
  end
  if cursor() ~= "vacio" then
    terminar("detenido", "cursor_lleno")
    return false, "detenido"
  end
  avisar()
  C_Timer.After(ESPERA_CONFIRMAR, function()
    if estado.turno == este and estado.fase == "en_curso" then
      estado.fase = "sin_confirmar"
      avisar()
    end
  end)
  Mover.comprobar()
  return true, "en_curso"
end

---------------------------------------------------------------------------------------------------
-- Confirmación: solo se mira
---------------------------------------------------------------------------------------------------

function Mover.comprobar()
  if dentroDelClic or (estado.fase ~= "en_curso" and estado.fase ~= "sin_confirmar") then
    return estado.fase
  end
  if bloqueadoAhora then
    apagar("bloqueado_juego")
    terminar("bloqueado_juego")
    return estado.fase
  end
  local paso = estado.paso
  if not SNF.Almacen.bancoAbierto() then
    terminar("interrumpido", "sin_banco")
    return estado.fase
  end
  local o = API.infoContenedor(paso.origen.bolsa, paso.origen.hueco, true)
  local oVacio = API.huecoVacio(paso.origen.bolsa, paso.origen.hueco)
  local d = API.infoContenedor(paso.destino.bolsa, paso.destino.hueco, true)
  local dVacio = API.huecoVacio(paso.destino.bolsa, paso.destino.hueco)
  -- Mientras algún hueco esté bloqueado o no se pueda leer, el juego aún no ha terminado.
  if (o and o.b ~= false) or (d and d.b ~= false) or (not o and oVacio ~= true) or (not d and dVacio ~= true) then
    return estado.fase
  end
  local queda = paso.origen.n - paso.cantidad
  local origenBien = (queda == 0 and oVacio == true)
    or (queda > 0 and o and o.id == paso.item and o.enlace == paso.enlace and o.n == queda)
  local destinoBien = d and d.id == paso.item and d.n == paso.cantidad and d.enlace == paso.enlace
  -- Una lectura anterior o parcial también puede llegar sin bloqueos. Solo se abre paso a otro clic con ambos cambios.
  if origenBien and destinoBien and cursor() == "vacio" then
    terminar("hecho")
  end
  return estado.fase
end
