-- SnetForever: buzón de la IA (fase 4). La app de Windows deja sus respuestas en 20 carpetas-ranura
-- «SnetForever_R001…R020» (cada una con un buzon.lua que pone la global SNF_BUZON). Cada ranura solo se puede cargar una
-- vez por sesión (LoadAddOn no vuelve a ejecutar), así que cada respuesta gasta una; con /reload vuelven todas.
-- Lote G: eran 100 y llenaban la lista de addons; ahora son 20, plegadas bajo SnetForever (## Group: SnetForever).
--
-- Buzon.RANURAS = 20
-- Buzon.nombre(i)          «SnetForever_R007» para i = 7.
-- Buzon.proxima()          la siguiente ranura sin cargar en esta sesión (1…21; 21 = se acabaron).
-- Buzon.cargar(motivo)     carga la siguiente ranura, aplica su contenido y devuelve la tabla del buzón (nil si no se
--                          pudo cargar, si se acabaron las ranuras o si la ranura estaba vacía). `motivo` («timbre»,
--                          «vida»…) solo dice por qué se carga; no cambia lo que se hace.
-- Buzon.estadoApp()        {claude = «ok»|«sin_instalar»|«sin_sesion»|«pago_por_uso»|«desconocido»} del último buzón con
--                          estado, o nil si aún no ha llegado ninguno.
-- Buzon.cursor()           SnetForeverPJ.ia.cursor: el seq más alto ya visto por este personaje.
--
-- Al cargar un buzón: SNF_BUZON = nil, LoadAddOn, se lee, SNF_BUZON = nil otra vez. Después:
--   · los registros con seq > cursor y pj == Personaje.clave(), en orden de seq: SNF_IA_REGISTRO(registro);
--   · el cursor pasa al seq más alto del buzón (nunca baja);
--   · recibidos[pj] del personaje: SNF_IA_RECIBIDO_ID(id);
--   · si traía cabecera (estado), SNF_IA_CABECERA(estado), lo último (puente con TATI: el latido de ia/latido.lua).
-- Avisos (SNF_IA_AVISO(clave); los textos son L[clave]): RANURAS_FALTAN, RANURAS_DESACTIVADAS, RANURAS_AGOTADAS (este
-- con un %d que es Buzon.RANURAS).
-- En el primer SNF_IA_APP(true) de la sesión carga una ranura (motivo «vida»): así llegan el estado de la app y los
-- errores (sin sesión de Claude…) sin esperar a que el jugador pregunte nada.
local _, SNF = ...

local Buzon = {}
SNF.Buzon = Buzon

Buzon.RANURAS = 20

local floor = math.floor

local siguiente = 1 -- próxima ranura sin cargar en esta sesión
local estado = nil -- estado de la app en el último buzón que traía uno
local vidaHecha = false

function Buzon.nombre(i)
  return string.format("SnetForever_R%03d", floor(i))
end

function Buzon.proxima()
  return siguiente
end

function Buzon.estadoApp()
  return estado
end

local function guardadoIa()
  local pj = rawget(_G, "SnetForeverPJ")
  return type(pj) == "table" and type(pj.ia) == "table" and pj.ia or nil
end

function Buzon.cursor()
  local ia = guardadoIa()
  local c = ia and ia.cursor
  return type(c) == "number" and c or 0
end

-- C_AddOns.LoadAddOn, o LoadAddOn en un cliente que aún no tenga el espacio.
local function cargarAddon(nombre)
  local espacio = rawget(_G, "C_AddOns")
  if type(espacio) == "table" and type(rawget(espacio, "LoadAddOn")) == "function" then
    return espacio.LoadAddOn(nombre)
  end
  local f = rawget(_G, "LoadAddOn")
  if type(f) == "function" then
    return f(nombre)
  end
  return false, "MISSING"
end

local function aviso(clave)
  SNF.Eventos.emitir("SNF_IA_AVISO", clave)
end

-- Aplica el contenido de un buzón ya leído.
local function aplicar(buzon)
  if type(buzon.estado) == "table" then
    estado = buzon.estado
  end
  local yo = SNF.Personaje.clave()
  local cursor = Buzon.cursor()
  local nuevos = {}
  local masAlto = type(buzon.seq) == "number" and buzon.seq or 0
  if type(buzon.registros) == "table" then
    for _, registro in ipairs(buzon.registros) do
      if type(registro) == "table" and type(registro.seq) == "number" then
        if registro.seq > masAlto then
          masAlto = registro.seq
        end
        if registro.seq > cursor and registro.pj == yo then
          nuevos[#nuevos + 1] = registro
        end
      end
    end
  end
  table.sort(nuevos, function(a, b)
    return a.seq < b.seq
  end)
  -- El cursor se mueve antes de emitir: si un oyente falla, el registro no se repite en la ranura siguiente.
  local ia = guardadoIa()
  if ia and masAlto > cursor then
    ia.cursor = masAlto
  end
  for _, registro in ipairs(nuevos) do
    SNF.Eventos.emitir("SNF_IA_REGISTRO", registro)
  end
  if type(buzon.recibidos) == "table" then
    local id = buzon.recibidos[yo]
    if type(id) == "string" then
      SNF.Eventos.emitir("SNF_IA_RECIBIDO_ID", id)
    end
  end
  if type(buzon.estado) == "table" then
    SNF.Eventos.emitir("SNF_IA_CABECERA", buzon.estado)
  end
end

function Buzon.cargar(motivo)
  local i = siguiente
  if i > Buzon.RANURAS then
    aviso("RANURAS_AGOTADAS")
    return nil
  end
  SNF_BUZON = nil
  local cargada, razon = cargarAddon(Buzon.nombre(i))
  if not cargada then
    SNF_BUZON = nil
    aviso(razon == "DISABLED" and "RANURAS_DESACTIVADAS" or "RANURAS_FALTAN")
    return nil
  end
  siguiente = i + 1
  local buzon = rawget(_G, "SNF_BUZON")
  SNF_BUZON = nil
  if type(buzon) ~= "table" then
    return nil
  end
  aplicar(buzon)
  return buzon
end

SNF.Eventos.escuchar("SNF_IA_APP", function(viva)
  if viva and not vidaHecha then
    vidaHecha = true
    Buzon.cargar("vida")
  end
end)

-- Un timbre de buzón nuevo (timbre_a o timbre_b): la app ha dejado algo, se carga la siguiente ranura.
SNF.Eventos.escuchar("SNF_IA_TIMBRE", function()
  Buzon.cargar("timbre")
end)
