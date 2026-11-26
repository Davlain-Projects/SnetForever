-- SnetForever: reglas de compra y de sniper del comercio. Todo el dinero va en cobre (50000 = 5 de oro).
-- Cada grupo puede tener su regla en SnetForeverCuenta.comercio.reglas[clave]; sin ella vale la PLANTILLA.
--
-- Reglas.RITMO_MIN                   0,25: el ritmoMin por defecto (ver abajo por qué).
-- Reglas.PLANTILLA                   compraPct 85, ritmoMin 0,25, valorMin 50000, sniperPct 90, maxUnidades 200,
--                                    maxOro 1000000.
-- Reglas.de(clave) -> regla          una copia: la del grupo o la plantilla.
-- Reglas.poner(clave, regla) -> true | false, campo   valida los rangos (compraPct y sniperPct 1-100, ritmoMin 0-1,
--                                    valorMin >= 0, maxUnidades entero 1-10000, maxOro >= 0). Lo que falte se toma de la
--                                    plantilla. Si algo no cumple no se guarda nada y dice qué campo falla.
-- Reglas.valida(regla) -> true | false, campo   los mismos rangos que poner, sin guardar nada (tarea 15: la propuesta
--                                    de la IA se comprueba antes de crear su grupo).
-- Reglas.deObjeto(item) -> clave, regla | nil    la regla guardada del grupo del objeto (árbol nuevo); ver abajo.
-- Reglas.buenaCompra(item, vivo, precios) -> true | false | nil [, true]   ¿cumple la regla de su grupo? nil sin regla; ver abajo.
-- Reglas.evaluar(item, vivo, precios, regla, modo) -> {buena, pct, motivo, rotacionSinConfirmar?}
--   vivo = {precio, cantidad} (lo que hay ahora en la subasta); precios = lo que da Precios.de (usa normal y ritmo);
--   modo = «compra» (usa compraPct) o «sniper» (usa sniperPct).
--   buena si precio <= normal * pct / 100, ritmo >= ritmoMin y normal >= valorMin. pct es el precio en % del normal.
--   motivo: sin_normal (no se sabe el precio normal), barato (el objeto vale menos que valorMin), sin_ritmo (sin
--   credenciales de Blizzard, o sin un día de datos, no se sabe cuánto sale sin caducar: nunca es buena), sin_venta
--   (vivo.cantidad es 0: ahora no hay ninguno a la venta y el precio es de la última vez que se vio), caro, lento u ok.
--   F9p: rotacionSinConfirmar = true cuando aprueba una mercancía (precios.mercancia, el décimo campo de la app). En ellas
--   el ritmo puede estar inflado por cancelaciones: uno bajo es fiable (el veto «lento» sigue igual) y uno alto no prueba
--   que se venda. No cambia quién pasa la regla, solo cómo se presenta el aprobado. Sin el dato, como un objeto suelto.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Reglas = {}
SNF.Reglas = Reglas

-- El mínimo por defecto de «ritmo»: de las subastas que salen, la parte que tiene que salir sin caducar (vendida o
-- retirada por su dueño; ver app/src/comercio/historial.mjs). Hasta T1b era 0,40, pensado para la cuenta vieja, que
-- tomaba por vendidas la mitad de las caducadas y salía inflada. Con la de ahora un objeto que se mueve bien anda por
-- 0,25 (la tasa de venta de TSM del hacha de la captura es 0,244). Solo cambia el valor por defecto: una regla que el
-- jugador ya guardó lleva su ritmoMin escrito (se guardan completas) y no se toca.
Reglas.RITMO_MIN = 0.25
Reglas.PLANTILLA = {compraPct = 85, ritmoMin = Reglas.RITMO_MIN, valorMin = 50000, sniperPct = 90, maxUnidades = 200, maxOro = 1000000}

-- {mínimo, máximo, entero?}; máximo nil = sin tope; entero = true: sin decimales (como en la app, comercio/ia.mjs).
local RANGOS = {
  compraPct = {1, 100},
  sniperPct = {1, 100},
  ritmoMin = {0, 1},
  valorMin = {0, nil},
  maxUnidades = {1, 10000, true},
  maxOro = {0, nil},
}

-- Una regla completa: lo que falta o no es número se toma de la plantilla.
local function completa(regla)
  local c = {}
  for k, v in pairs(Reglas.PLANTILLA) do
    c[k] = type(regla) == "table" and type(regla[k]) == "number" and regla[k] or v
  end
  return c
end

local function guardadas()
  pcall(SNF.Guardado.preparar)
  -- Las reglas de los grupos de la 0.6.2 pasan a la clave nueva al migrar el árbol (comercio/arbol.lua): que ya esté hecho.
  local arbol = rawget(SNF, "Arbol")
  if type(arbol) == "table" then
    arbol.preparar()
  end
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  if type(c) ~= "table" then
    return nil
  end
  if type(c.reglas) ~= "table" then
    c.reglas = {}
  end
  return c.reglas
end

function Reglas.de(clave)
  local r = guardadas()
  return completa(r and r[clave])
end

function Reglas.valida(regla)
  if type(regla) ~= "table" then
    return false, "regla"
  end
  for campo, rango in pairs(RANGOS) do
    local v = regla[campo]
    if v ~= nil then
      if type(v) ~= "number" or v ~= v or v < rango[1] or (rango[2] and v > rango[2]) or (rango[3] and v ~= math.floor(v)) then
        return false, campo
      end
    end
  end
  return true
end

function Reglas.poner(clave, regla)
  local r = guardadas()
  if type(clave) ~= "string" or type(regla) ~= "table" or not r then
    return false, "regla"
  end
  local ok, campo = Reglas.valida(regla)
  if not ok then
    return false, campo
  end
  r[clave] = completa(regla)
  return true
end

function Reglas.evaluar(item, vivo, precios, regla, modo)
  regla = completa(regla)
  -- T1b: con 0 unidades a la venta el precio es el de la última vez que se vio el objeto: ya no hay nada que comprar a
  -- ese precio, así que no hay veredicto. (Sin `cantidad`, quien llama no la sabe y se juzga como siempre.)
  if type(vivo) == "table" and type(vivo.cantidad) == "number" and vivo.cantidad <= 0 then
    return {buena = false, pct = nil, motivo = "sin_venta"}
  end
  local pct = modo == "sniper" and regla.sniperPct or regla.compraPct
  local normal = type(precios) == "table" and precios.normal
  if type(normal) ~= "number" or normal <= 0 or type(vivo) ~= "table" or type(vivo.precio) ~= "number" then
    return {buena = false, pct = nil, motivo = "sin_normal"}
  end
  local actual = vivo.precio / normal * 100
  if normal < regla.valorMin then
    return {buena = false, pct = actual, motivo = "barato"}
  end
  local ritmo = precios.ritmo
  if type(ritmo) ~= "number" then
    return {buena = false, pct = actual, motivo = "sin_ritmo"}
  end
  if vivo.precio > normal * pct / 100 then
    return {buena = false, pct = actual, motivo = "caro"}
  end
  if ritmo < regla.ritmoMin then
    return {buena = false, pct = actual, motivo = "lento"}
  end
  return {buena = true, pct = actual, motivo = "ok", rotacionSinConfirmar = precios.mercancia == true or nil}
end

-- Reglas.deObjeto(item) -> clave, regla | nil   la regla de compra del grupo del objeto en el árbol nuevo (clave
--   «propio:<ruta>», una copia completa). nil si el objeto no está en un grupo (el Grupo Base cuenta como ninguno) o si su
--   grupo no tiene regla guardada (la plantilla no cuenta: «tu regla» es la que el jugador puso). Solo búsquedas directas.
--   T1b: quien ya sabe el grupo del objeto (el tooltip, que lo acaba de buscar) lo pasa en `ruta` y no se busca otra vez.
function Reglas.deObjeto(item, ruta)
  local arbol = rawget(SNF, "Arbol")
  if type(arbol) ~= "table" or type(item) ~= "number" then
    return nil
  end
  if ruta == nil then
    ruta = arbol.objeto("i:" .. item)
  end
  if type(ruta) ~= "string" or ruta == "" then
    return nil
  end
  local clave = "propio:" .. ruta
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  local guardada = type(c) == "table" and type(c.reglas) == "table" and c.reglas[clave]
  if type(guardada) ~= "table" then
    return nil
  end
  return clave, completa(guardada)
end

-- Reglas.buenaCompra(item, vivo, precios) -> true | false | nil   ¿cumple el objeto la regla de compra de su grupo?
--   vivo = {precio, cantidad} y precios = lo que da Precios.de, como en Reglas.evaluar (modo «compra»). nil si el objeto
--   no tiene regla (ver Reglas.deObjeto) o si faltan datos para juzgar (sin_normal, sin_ritmo o sin_venta: no se sabe, no es «no cumple»).
--   Vale para cualquier objeto: el tooltip lo usa con el que tenga delante. `ruta` (opcional): el grupo del objeto, si
--   quien llama ya lo sabe (ver Reglas.deObjeto). F9p: si aprueba una mercancía, un segundo valor true (rotación sin confirmar).
function Reglas.buenaCompra(item, vivo, precios, ruta)
  local _, regla = Reglas.deObjeto(item, ruta)
  if not regla then
    return nil
  end
  local ev = Reglas.evaluar(item, vivo, precios, regla, "compra")
  if ev.motivo == "sin_normal" or ev.motivo == "sin_ritmo" or ev.motivo == "sin_venta" then
    return nil
  end
  if ev.rotacionSinConfirmar then
    return true, true
  end
  return ev.buena == true
end
