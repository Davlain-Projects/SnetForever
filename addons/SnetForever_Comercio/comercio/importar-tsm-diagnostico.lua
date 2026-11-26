-- SnetForever: diagnóstico de precios de la importación de TSM (primera entrega del plan de paridad). Lo usa
-- comercio/importar-tsm.lua al LEER la configuración de TSM, antes de que el jugador decida importar. Aquí no se escribe nada
-- en lo guardado ni se calcula ningún precio: solo se clasifica lo que se va a copiar.
--
-- Cada fuente de precio que nombra una fórmula de TSM queda en una de tres clases:
--   equivalente  mismo precio de comerciante (vendorsell, vendorbuy), cuando el dato está disponible.
--   aproximada   se traduce a una estimación local de SnetForever con un significado distinto (dbmarket y dbregionmarketavg ->
--                snfmercado; dbhistorical y dbregionhistorical -> snfhistorico, que hoy lee el mismo valor que snfmercado;
--                dbminbuyout -> snfminimo con otra foto, y crafting con precios de material locales).
--                La operación puede publicar o comprar a otro precio.
--   faltante     SnetForever no tiene la fuente (dbregionsaleavg, smartavgbuy, contabilidad, tasas regionales, nombres
--                desconocidos), la fuente propia hace un ciclo o no se puede guardar, o la fórmula no se entiende. La fórmula se
--                guarda tal cual, sale en rojo y la operación no actúa con ella.
-- Las traducciones son las de Formulas.traducir y no cambian aquí: la compatibilidad con lo ya importado se conserva.
--
-- Lo indirecto también cuenta: una fuente propia de TSM hereda la peor clase de lo que usa (con protección de ciclos), y un
-- campo vinculado (relationships) se juzga con el valor de la operación de la que sale, siguiendo los vínculos que de verdad se
-- copiarán (los que harían un ciclo no se copian, como en escribirVinculos). Los campos que TSM no trae se quedan con el valor
-- por defecto de SnetForever y no se juzgan; tampoco los que dependen de un interruptor apagado.
--
-- El diagnóstico es de UN modo: lo que se juzga es lo que quedará guardado después de importar en ese modo.
--   juntar      tus fuentes propias se quedan y mandan: una fórmula que nombra una de ellas se juzga con la TUYA (también si
--               es inválida, hace un ciclo o choca con una de TSM del mismo nombre), igual que las que se usan a través de
--               otras. Los grupos que ya tienes conservan su lista de operaciones (`locales`): el uso efectivo se cuenta
--               aparte del uso en el perfil de TSM. Límite: solo se recorren los grupos del perfil de TSM (un grupo que solo
--               existe en SnetForever y hereda una lista importada no cuenta) y los objetos son los que trae TSM.
--   reemplazar  se parte sin fuentes propias ni grupos (van a _antes): una fórmula que nombra una fuente tuya se queda sin
--               ella (`apartadas`, motivo «apartada»), y el uso efectivo es el del perfil de TSM.
-- Uso (en pasos acotados, para no dar tirones):
--   local d = DiagnosticoTSM.nuevo(entrada)   entrada = {modo = "juntar"|"reemplazar", ops = {{tipo, nombre, valores,
--       vinculos, valido}}, entradas = {{tipo, operacion, campo, antes, despues} | {fuente, antes, despues}}, fuentes =
--       {{nombre, texto, antes}}, tuyas = {nombre = texto} (las fuentes propias que habrá: las guardadas al juntar, {} al
--       reemplazar), apartadas = {nombre = texto} (al reemplazar, las guardadas que se apartan), locales = {[ruta] = {tipo =
--       {nombres}}} (al juntar, las listas propias de los grupos que ya existen, que se quedan; el Grupo Base es «»), finales =
--       {["tipo|nombre"] = nombre final} (al juntar, el nombre que tendrá cada operación de TSM: la suya, una tuya igual que
--       se reutiliza o «Nombre 2»), rutas = {rutas}, overrides = {[ruta] = {tipo = {nombres}}}, porRuta = {[ruta] = objetos}}
--   DiagnosticoTSM.paso(d) -> true al acabar (cada llamada hace un trozo)
--   DiagnosticoTSM.resultado(d) -> diagnostico = {modo,
--       cuentas = {campos = {equivalente, aproximada, faltante}, operaciones = {bien, aproximada, faltante},
--                  activas = {bien, aproximada, faltante} (usadas en el perfil de TSM), efectivas = {...} (usadas de verdad
--                  tras importar en este modo), conservan (grupos donde TSM la usa pero se queda tu lista, que no la
--                  nombra), vinculosCortados},
--       fuentes = {{nombre, visible, clase, traduce, motivo, campos}},   las fuentes vistas (sin las propias), de peor a mejor
--       propias = {{nombre, clase, motivo, choca, tuya}},               las fuentes propias (de TSM o tuyas) con problemas
--       operaciones = {{tipo, nombre, estado, grupos, objetos, conBase, efectivo = {grupos, objetos, conBase}, conservan,
--                      campos = {{campo, estado, vinculo, fuentes = {{nombre, clase, via}}, error}}}}
--                      las que no quedan «bien», de peor a mejor y más usadas (grupos, objetos y conBase: en el perfil)
--   }
-- DiagnosticoTSM.hash(texto), .mezclar(n), .par(clave, ruta, memo) -> número   y   DiagnosticoTSM.serializar(valor) -> texto
--   para la huella de la lectura.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local DiagnosticoTSM = {}
SNF.DiagnosticoTSM = DiagnosticoTSM

local SEP = "`"
local PESO = {equivalente = 1, aproximada = 2, faltante = 3}
local ESTADO = {[1] = "bien", [2] = "aproximada", [3] = "faltante"}
local TROZO = {rutas = 40, ops = 4}

-- Las fuentes de TSM que se conocen: {clase, nombre como lo escribe TSM, motivo (clave de texto DIAG_*)}. Lo que no está aquí
-- y no es una fuente propia ni de SnetForever es «faltante» con el motivo «desconocida».
local CATALOGO = {
  vendorsell = {"equivalente", "VendorSell", "vendorsell"},
  vendorbuy = {"equivalente", "VendorBuy", "vendorbuy"},
  dbminbuyout = {"aproximada", "DBMinBuyout", "dbminbuyout"},
  dbmarket = {"aproximada", "DBMarket", "dbmarket"},
  dbregionmarketavg = {"aproximada", "DBRegionMarketAvg", "dbregionmarketavg"},
  dbhistorical = {"aproximada", "DBHistorical", "dbhistorical"},
  dbregionhistorical = {"aproximada", "DBRegionHistorical", "dbregionhistorical"},
  crafting = {"aproximada", "Crafting", "crafting"},
  snfhistorico = {"aproximada", "snfhistorico", "snfhistorico"},
  dbregionsaleavg = {"faltante", "DBRegionSaleAvg", "dbregionsaleavg"},
  dbregionsalerate = {"faltante", "DBRegionSaleRate", "ventasregion"},
  dbregionsoldperday = {"faltante", "DBRegionSoldPerDay", "ventasregion"},
  smartavgbuy = {"faltante", "SmartAvgBuy", "smartavgbuy"},
  avgbuy = {"faltante", "AvgBuy", "contabilidad"},
  avgsell = {"faltante", "AvgSell", "contabilidad"},
  maxbuy = {"faltante", "MaxBuy", "contabilidad"},
  maxsell = {"faltante", "MaxSell", "contabilidad"},
  minbuy = {"faltante", "MinBuy", "contabilidad"},
  minsell = {"faltante", "MinSell", "contabilidad"},
  itemquality = {"faltante", "ItemQuality", "propiedad"},
  itemlevel = {"faltante", "ItemLevel", "propiedad"},
  requiredlevel = {"faltante", "RequiredLevel", "propiedad"},
  destroy = {"faltante", "Destroy", "destroy"},
}
DiagnosticoTSM.CATALOGO = CATALOGO

local function peor(a, b)
  return (PESO[b] or 0) > (PESO[a] or 0) and b or a
end

local function padreDe(ruta)
  local pos, desde = nil, 0
  while true do
    local a = string.find(ruta, SEP, desde + 1, true)
    if not a then
      break
    end
    pos, desde = a, a
  end
  return pos and string.sub(ruta, 1, pos - 1) or ""
end

---------------------------------------------------------------------------------------------------
-- Huella: un número que cambia si cambia lo leído. Cada entrada se resume aparte, se MEZCLA y se suman, así no importa el
-- orden de next. La mezcla no es lineal: con una suma de resúmenes lineales (h(clave)*31^n + h(ruta)) cambiar de grupo dos
-- objetos con rutas del mismo largo daba la misma suma. Al elevar al cuadrado, (A+R1)^2 + (B+R2)^2 y (A+R2)^2 + (B+R1)^2
-- difieren en 2(A-B)(R1-R2): solo coinciden si A = B o R1 = R2.
---------------------------------------------------------------------------------------------------

local MODULO = 2147483647
local MEZCLA = 67108859 -- primo < 2^26: su cuadrado (< 2^52) es exacto con los números de Lua

function DiagnosticoTSM.hash(texto)
  local h = 7
  local byte = string.byte
  for i = 1, #texto do
    h = (h * 31 + byte(texto, i)) % MODULO
  end
  return h
end

function DiagnosticoTSM.mezclar(n)
  local a = n % MEZCLA
  a = (a * a + 40503) % MEZCLA
  a = (a * a + 2654435) % MEZCLA
  return a
end

-- Un objeto y su grupo (el resumen de la ruta se guarda en `memo`: se repite en miles de objetos).
function DiagnosticoTSM.par(clave, ruta, memo)
  local hr = memo[ruta]
  if not hr then
    hr = DiagnosticoTSM.hash("r|" .. ruta)
    memo[ruta] = hr
  end
  return DiagnosticoTSM.mezclar((DiagnosticoTSM.hash(clave) * 65599 + hr) % MODULO)
end

function DiagnosticoTSM.sumar(a, b)
  return (a + b) % MODULO
end

function DiagnosticoTSM.serializar(v, nivel)
  nivel = nivel or 0
  local t = type(v)
  if t ~= "table" then
    return t .. ":" .. tostring(v)
  end
  if nivel >= 4 then
    return "{…}"
  end
  local claves = {}
  for k in pairs(v) do
    claves[#claves + 1] = k
  end
  table.sort(claves, function(a, b)
    return type(a) .. tostring(a) < type(b) .. tostring(b)
  end)
  local partes = {}
  for _, k in ipairs(claves) do
    partes[#partes + 1] = tostring(k) .. "=" .. DiagnosticoTSM.serializar(v[k], nivel + 1)
  end
  return "{" .. table.concat(partes, ",") .. "}"
end

---------------------------------------------------------------------------------------------------
-- Clasificar.
---------------------------------------------------------------------------------------------------

local function nombreGuardable(nombre)
  return not SNF.Formulas.reservado(nombre) and string.find(nombre, "^[%a_][%w_]*$") ~= nil
end

-- Una fuente propia de TSM que se guardará con su fórmula: su peor clase y por qué (memo; un ciclo es faltante para todas
-- las de la cadena).
local function claseFuente(d, nombre, pila)
  local hecha = d.propias[nombre]
  if hecha then
    return hecha.clase
  end
  local f = d.fuentesTSM[nombre]
  if pila[nombre] then
    d.ciclos[nombre] = true
    return "faltante"
  end
  local F = SNF.Formulas
  local entrada = {nombre = nombre, clase = "equivalente", fuentes = {}}
  if not nombreGuardable(nombre) then
    entrada.clase, entrada.motivo = "faltante", "reservada" -- no se guardará: las fórmulas leerían otra cosa
  elseif type(f.texto) ~= "string" or f.texto == "" then
    entrada.clase, entrada.motivo = "faltante", "vacia" -- no se guardará
  end
  pila[nombre] = true
  for _, palabra in ipairs(F.palabras(f.antes or f.texto or "")) do
    local clase, via = d.clasificar(palabra, pila)
    entrada.fuentes[#entrada.fuentes + 1] = {nombre = palabra, clase = clase, via = via}
    entrada.clase = peor(entrada.clase, clase)
  end
  pila[nombre] = nil
  if d.ciclos[nombre] then
    entrada.clase, entrada.motivo = "faltante", "ciclo"
  elseif entrada.clase == "faltante" and not entrada.motivo then
    entrada.motivo = "depende" -- usa algo que falta (o una fuente de un ciclo)
  end
  if entrada.clase ~= "faltante" and not F.probar(f.texto, d.despues) then
    entrada.clase, entrada.motivo = "faltante", "invalida"
  end
  d.propias[nombre] = entrada
  return entrada.clase
end

-- Al juntar, una fuente propia TUYA (se queda la tuya): se juzga su fórmula de verdad, con lo que habrá después. Si choca
-- con una de TSM del mismo nombre y otra fórmula, además es «aproximada»: la operación no calculará lo que calculaba en TSM.
local function claseTuya(d, nombre, pila)
  local hecha = d.tuyasClase[nombre]
  if hecha then
    return hecha.clase
  end
  if pila[nombre] then
    d.ciclos[nombre] = true
    return "faltante"
  end
  local F = SNF.Formulas
  local texto = d.tuyas[nombre]
  local entrada = {nombre = nombre, clase = "equivalente", fuentes = {}, tuya = true}
  pila[nombre] = true
  for _, palabra in ipairs(F.palabras(texto)) do
    local clase, via = d.clasificar(palabra, pila)
    entrada.fuentes[#entrada.fuentes + 1] = {nombre = palabra, clase = clase, via = via}
    entrada.clase = peor(entrada.clase, clase)
  end
  pila[nombre] = nil
  if d.ciclos[nombre] then
    entrada.clase, entrada.motivo = "faltante", "ciclo"
  elseif not F.probar(texto, d.despues) then
    entrada.clase, entrada.motivo = "faltante", "invalida"
  elseif entrada.clase == "faltante" then
    entrada.motivo = "depende"
  end
  if d.fuentesTSM[nombre] then
    entrada.choca = true -- al Juntar se queda la del jugador, con otra fórmula
    entrada.clase = peor(entrada.clase, "aproximada")
    entrada.motivo = entrada.motivo or "choca"
  end
  d.tuyasClase[nombre] = entrada
  return entrada.clase
end

-- Una palabra de una fórmula -> clase y, si viene de una fuente propia (de TSM o tuya), su nombre.
local function nuevoClasificar(d)
  return function(palabra, pila)
    pila = pila or {}
    local tuya, tsm = d.tuyas[palabra], d.fuentesTSM[palabra]
    if tuya ~= nil and not (tsm and tsm.texto == tuya) then
      return claseTuya(d, palabra, pila), palabra
    end
    if tsm then
      return claseFuente(d, palabra, pila), palabra -- una tuya igual que la de TSM se juzga con lo que traía TSM
    end
    local c = CATALOGO[palabra]
    if c then
      return c[1]
    end
    if SNF.Formulas.reservado(palabra) then
      return "equivalente" -- una fuente de SnetForever escrita tal cual
    end
    return "faltante"
  end
end

-- Las fuentes que habrá después de importar (para probar las fórmulas): las tuyas y, si no chocan, las de TSM que se guardan.
local function fuentesDespues(d)
  local salida = {}
  for nombre, texto in pairs(d.tuyas) do
    salida[nombre] = texto
  end
  for nombre, f in pairs(d.fuentesTSM) do
    if salida[nombre] == nil and type(f.texto) == "string" and f.texto ~= "" and nombreGuardable(nombre) then
      salida[nombre] = f.texto
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Pasos.
---------------------------------------------------------------------------------------------------

function DiagnosticoTSM.nuevo(e)
  local d = {
    modo = e.modo == "reemplazar" and "reemplazar" or "juntar",
    retained = e.retained or {}, ops = e.ops or {}, rutas = e.rutas or {}, overrides = e.overrides or {}, porRuta = e.porRuta or {},
    tuyas = e.tuyas or {}, apartadas = e.apartadas or {}, locales = e.locales or {}, fuentesTSM = {}, propias = {},
    tuyasClase = {}, ciclos = {}, campos = {}, usos = {}, sim = {}, vistas = {}, resultadoOps = {}, cortados = 0,
    etapa = 1, i = 1,
  }
  for _, f in ipairs(e.fuentes or {}) do
    if d.fuentesTSM[f.nombre] == nil then -- dos que solo cambian en mayúsculas: se queda la primera, como al escribir
      d.fuentesTSM[f.nombre] = f
    end
  end
  for _, en in ipairs(e.entradas or {}) do
    if en.tipo then
      local id = en.tipo .. "|" .. en.operacion
      d.campos[id] = d.campos[id] or {}
      d.campos[id][en.campo] = en
    end
  end
  d.porId, d.porFinal = {}, {}
  local finales = e.finales or {}
  for _, op in ipairs(d.ops) do
    local id = op.tipo .. "|" .. op.nombre
    d.porId[id] = op
    if op.valido then
      d.porFinal[op.tipo] = d.porFinal[op.tipo] or {}
      d.porFinal[op.tipo][finales[id] or op.nombre] = op.nombre
    end
  end
  d.clasificar = nuevoClasificar(d)
  return d
end

-- ¿Poner nombre.campo -> otra haría un ciclo en lo simulado? (como haceCiclo de la importación)
local function haceCiclo(ops, nombre, campo, otra)
  local visto, actual = {}, otra
  while type(actual) == "string" and not visto[actual] do
    if actual == nombre then
      return true
    end
    visto[actual] = true
    local v = ops[actual]
    actual = v and v[campo] or nil
  end
  return false
end

-- La operación de la que sale un campo, siguiendo los vínculos simulados.
local function origen(d, tipo, nombre, campo)
  local ops = d.sim[tipo] or {}
  local visto, actual = {}, nombre
  while true do
    visto[actual] = true
    local siguiente = ops[actual] and ops[actual][campo]
    if type(siguiente) ~= "string" or not ops[siguiente] or visto[siguiente] then
      local imported = d.porFinal[tipo][actual]
      return imported or actual, imported == nil
    end
    actual = siguiente
  end
end

local function etapaFuentes(d)
  local nombres = {}
  for nombre in pairs(d.fuentesTSM) do
    nombres[#nombres + 1] = nombre
  end
  table.sort(nombres)
  d.despues = fuentesDespues(d) -- antes de juzgar: las tuyas se prueban con lo que habrá
  for _, nombre in ipairs(nombres) do
    d.clasificar(nombre)
  end
  return true
end

-- Los vínculos que se copiarán de verdad: mismo orden que escribirVinculos (operaciones por tipo y nombre, campos por nombre).
local function etapaVinculos(d)
  local merge = d.modo == "juntar"
  for kind, operations in pairs(d.retained) do
    d.sim[kind] = {}
    for name, saved in pairs(operations) do
      if type(saved) == "table" then d.sim[kind][name] = saved.vinculos or {} end
    end
  end
  for _, op in ipairs(d.ops) do
    if op.valido then
      local name = merge and op.final or op.nombre
      d.sim[op.tipo] = d.sim[op.tipo] or {}
      if not (merge and op.accion == "reutilizar") then d.sim[op.tipo][name] = {} end
    end
  end
  for _, op in ipairs(d.ops) do
    if op.valido and not (merge and op.accion == "reutilizar") then
      local name = merge and op.final or op.nombre
      local links = merge and op.enlaces or op.vinculos
      local campos = {}
      for campo in pairs(links or {}) do
        campos[#campos + 1] = campo
      end
      table.sort(campos)
      local ops = d.sim[op.tipo]
      for _, campo in ipairs(campos) do
        local otra = links[campo]
        if ops[otra] and otra ~= name then
          if haceCiclo(ops, name, campo, otra) then
            d.cortados = d.cortados + 1
          else
            ops[name][campo] = otra
          end
        end
      end
    end
  end
  return true
end

-- La lista de un tipo que usa una ruta, con la herencia de TSM: un grupo sin lista propia usa la de su padre (y al final la
-- del base). Con `locales` (al juntar), un grupo que ya existe con su lista propia de ese tipo la conserva: la de TSM no se
-- escribe ahí y cuentan las operaciones de TSM que esa lista nombra con su nombre final (las reutilizadas).
local function listaDe(d, ruta, tipo, locales)
  local actual = ruta
  while true do
    local l = locales and locales[actual]
    if l and type(l[tipo]) == "table" then
      local salida, porFinal = {}, d.porFinal[tipo] or {}
      for _, n in ipairs(l[tipo]) do
        if porFinal[n] then
          salida[#salida + 1] = porFinal[n]
        end
      end
      return salida, true
    end
    local g = d.overrides[actual]
    local lista = g and g[tipo]
    if lista then
      return lista
    end
    if actual == "" then
      return nil
    end
    actual = padreDe(actual)
  end
end

local function usoDe(d, id)
  local u = d.usos[id]
  if not u then
    u = {grupos = 0, objetos = 0, conBase = false, efectivo = {grupos = 0, objetos = 0, conBase = false}, conservan = 0}
    d.usos[id] = u
  end
  return u
end

local function anotar(d, lista, efectivo, ruta, tipo)
  local vistos = {}
  for _, n in ipairs(lista or {}) do
    local id = tipo .. "|" .. n
    if d.porId[id] and not vistos[id] then
      vistos[id] = true
      local u = usoDe(d, id)
      local donde = efectivo and u.efectivo or u
      donde.grupos = donde.grupos + 1
      if ruta == "" then
        donde.conBase = true
      else
        donde.objetos = donde.objetos + (d.porRuta[ruta] or 0)
      end
    end
  end
end

-- Qué grupos usan cada operación: en el perfil de TSM y, después de importar en este modo, de verdad.
local function etapaUsos(d)
  local hasta = math.min(#d.rutas + 1, d.i + TROZO.rutas - 1)
  local O = SNF.Operaciones
  local juntar = d.modo == "juntar"
  for k = d.i, hasta do
    local ruta = k <= #d.rutas and d.rutas[k] or ""
    for _, tipo in ipairs(O.ORDEN) do
      local perfil = listaDe(d, ruta, tipo)
      anotar(d, perfil, false, ruta, tipo)
      local efectiva, tuya = perfil, false
      if juntar then
        efectiva, tuya = listaDe(d, ruta, tipo, d.locales)
      end
      anotar(d, efectiva, true, ruta, tipo)
      if tuya then
        local queda = {}
        for _, n in ipairs(efectiva) do
          queda[n] = true
        end
        for _, n in ipairs(perfil or {}) do
          local u = d.porId[tipo .. "|" .. n] and usoDe(d, tipo .. "|" .. n)
          if u and not queda[n] then
            u.conservan = u.conservan + 1 -- en TSM la usa; al juntar se queda tu lista, que no la nombra
            queda[n] = true
          end
        end
      end
    end
  end
  d.i = hasta + 1
  return d.i > #d.rutas + 1
end

-- Cuenta una vez por campo cada fuente que no es propia de TSM, también las que se usan a través de fuentes propias.
local function contarHojas(d, palabra, contadas)
  if contadas[palabra] then
    return
  end
  contadas[palabra] = true
  local e = d.tuyasClase[palabra] or (d.fuentesTSM[palabra] and d.propias[palabra])
  if not e then
    d.vistas[palabra] = (d.vistas[palabra] or 0) + 1
    return
  end
  for _, s in ipairs(e.fuentes) do
    contarHojas(d, s.nombre, contadas)
  end
end

-- Un campo de fórmula: su texto de TSM efectivo (siguiendo vínculos) clasificado y probado con las fuentes de después.
local function juzgarCampo(d, op, def)
  local O, F = SNF.Operaciones, SNF.Formulas
  local name = d.modo == "juntar" and op.final or op.nombre
  if def.depende then
    local from, retained = origen(d, op.tipo, name, def.depende)
    local de = retained and d.retained[op.tipo][from] or d.porId[op.tipo .. "|" .. from]
    local v = de and de.valores and de.valores[def.depende]
    if v == nil then
      v = O.campo(op.tipo, def.depende).defecto
    end
    if v ~= true then
      return nil -- apagado: no se usa
    end
  end
  local fuente, retained = origen(d, op.tipo, name, def.clave)
  local mapa = d.campos[op.tipo .. "|" .. fuente]
  local e = mapa and mapa[def.clave]
  if retained then
    local values = d.retained[op.tipo][fuente].valores or {}
    local expr = values[def.clave] or def.defecto
    e = type(expr) == "string" and {antes = expr, despues = expr} or nil
  end
  if not e or e.despues == "" then
    return nil -- no viene de TSM: el valor por defecto de SnetForever
  end
  local salida = {campo = def.clave, estado = "equivalente", fuentes = {}, vinculo = fuente ~= op.nombre and fuente or nil}
  local contadas = {}
  for _, palabra in ipairs(F.palabras(e.antes)) do
    local clase, via = d.clasificar(palabra)
    salida.fuentes[#salida.fuentes + 1] = {nombre = palabra, clase = clase, via = via}
    salida.estado = peor(salida.estado, clase)
    contarHojas(d, palabra, contadas)
  end
  local ok, err = F.probar(e.despues, d.despues)
  if not ok then
    salida.estado, salida.error = "faltante", err and err.c or "interno"
  end
  return salida
end

local function etapaOperaciones(d)
  local O = SNF.Operaciones
  local hasta = math.min(#d.ops, d.i + TROZO.ops - 1)
  for k = d.i, hasta do
    local op = d.ops[k]
    if op.valido then
      local r = {tipo = op.tipo, nombre = op.nombre, estado = "equivalente", campos = {}}
      for _, def in ipairs(O.TIPOS[op.tipo].campos) do
        if def.tipo == "formula" then
          local c = juzgarCampo(d, op, def)
          if c then
            d.cuentaCampos[c.estado] = d.cuentaCampos[c.estado] + 1
            r.estado = peor(r.estado, c.estado)
            if c.estado ~= "equivalente" then
              r.campos[#r.campos + 1] = c
            end
          end
        end
      end
      local u = usoDe(d, op.tipo .. "|" .. op.nombre)
      r.grupos, r.objetos, r.conBase, r.conservan = u.grupos, u.objetos, u.conBase, u.conservan
      r.efectivo = {grupos = u.efectivo.grupos, objetos = u.efectivo.objetos, conBase = u.efectivo.conBase}
      r.estado = ESTADO[PESO[r.estado]]
      d.resultadoOps[#d.resultadoOps + 1] = r
    end
  end
  d.i = hasta + 1
  return d.i > #d.ops
end

local ETAPAS = {etapaFuentes, etapaVinculos, etapaUsos, etapaOperaciones}

function DiagnosticoTSM.paso(d)
  if d.etapa > #ETAPAS then
    return true
  end
  d.cuentaCampos = d.cuentaCampos or {equivalente = 0, aproximada = 0, faltante = 0}
  if ETAPAS[d.etapa](d) then
    d.etapa, d.i = d.etapa + 1, 1
  end
  return d.etapa > #ETAPAS
end

function DiagnosticoTSM.avance(d)
  return math.min(1, (d.etapa - 1) / #ETAPAS)
end

local ORDEN_TIPO = {}

function DiagnosticoTSM.resultado(d)
  local O = SNF.Operaciones
  for i, tipo in ipairs(O.ORDEN) do
    ORDEN_TIPO[tipo] = i
  end
  local cuentas = {
    campos = d.cuentaCampos or {equivalente = 0, aproximada = 0, faltante = 0},
    operaciones = {bien = 0, aproximada = 0, faltante = 0}, activas = {bien = 0, aproximada = 0, faltante = 0},
    efectivas = {bien = 0, aproximada = 0, faltante = 0}, conservan = 0, vinculosCortados = d.cortados,
  }
  local ops = {}
  for _, r in ipairs(d.resultadoOps) do
    cuentas.operaciones[r.estado] = cuentas.operaciones[r.estado] + 1
    if r.grupos > 0 then
      cuentas.activas[r.estado] = cuentas.activas[r.estado] + 1
    end
    if r.efectivo.grupos > 0 then
      cuentas.efectivas[r.estado] = cuentas.efectivas[r.estado] + 1
    end
    cuentas.conservan = cuentas.conservan + r.conservan
    if r.estado ~= "bien" then
      ops[#ops + 1] = r
    end
  end
  table.sort(ops, function(a, b)
    if a.estado ~= b.estado then
      return PESO[a.estado] > PESO[b.estado]
    end
    if a.grupos ~= b.grupos then
      return a.grupos > b.grupos
    end
    if a.tipo ~= b.tipo then
      return (ORDEN_TIPO[a.tipo] or 99) < (ORDEN_TIPO[b.tipo] or 99)
    end
    return a.nombre < b.nombre
  end)
  local fuentes = {}
  for nombre, n in pairs(d.vistas) do
    local c = CATALOGO[nombre]
    local clase = d.clasificar(nombre)
    local motivo = c and c[3] or nil
    if not motivo and clase == "faltante" then
      motivo = d.apartadas[nombre] ~= nil and "apartada" or "desconocida" -- apartada: una tuya que Reemplazar quita
    end
    fuentes[#fuentes + 1] = {
      nombre = nombre, visible = c and c[2] or nombre, clase = clase, motivo = motivo,
      traduce = SNF.Formulas.traduccion(nombre), campos = n,
    }
  end
  table.sort(fuentes, function(a, b)
    if a.clase ~= b.clase then
      return PESO[a.clase] > PESO[b.clase]
    end
    return a.nombre < b.nombre
  end)
  local propias = {}
  for _, lista in ipairs({d.propias, d.tuyasClase}) do
    for nombre, p in pairs(lista) do
      if p.clase ~= "equivalente" then
        propias[#propias + 1] = {nombre = nombre, clase = p.clase, motivo = p.motivo, choca = p.choca == true,
          tuya = p.tuya == true}
      end
    end
  end
  table.sort(propias, function(a, b) return a.nombre < b.nombre end)
  return {modo = d.modo, cuentas = cuentas, fuentes = fuentes, propias = propias, operaciones = ops}
end
