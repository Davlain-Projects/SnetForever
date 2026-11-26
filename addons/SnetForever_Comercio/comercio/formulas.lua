-- SnetForever: evaluador de fórmulas de precio del comercio. La gramática es la de las fórmulas de TSM (importes, %,
-- funciones y fuentes de precio por nombre), con nuestras fuentes. El tokenizador y el analizador (recursivo descendente)
-- son propios; las fórmulas nunca se pasan a loadstring/load. Nada de aquí lanza un error de Lua: lo que falla da
-- «sin valor» (nil) o un error con un mensaje claro para quien no programa (Formulas.mensaje, en el idioma del cliente).
--
-- Gramática (sin distinguir mayúsculas):
--   fórmula  = suma
--   suma     = producto { ("+" | "-") producto }
--   producto = unario { ("*" | "/") unario }
--   unario   = "-" unario | power
--   power    = primario [ "^" unario ]
--   primario = importe | número | porcentaje | función "(" [argumentos] ")" | fuente | "(" suma ")"
--   A built-in source also accepts a single numeric item reference, for example vendorsell(item:1234).
--   importe  = (número unidad)+   unidad: g u o (oro), s o p (plata), c (cobre): «1g 50s 20c» = «1o 50p 20c» = 15020 cobre
--   número   = dígitos con punto decimal opcional («1.5», «.25»)
--   porcentaje = número "%"       «120%» = 1,2; si lo sigue un valor, lo multiplica: «120% snfmercado»
-- Todo se calcula en cobre. Un valor puede ser «sin valor» (nil): first lo salta; min, max y avg lo ignoran; cualquier otra
-- operación con «sin valor» da «sin valor». Dividir por cero da «sin valor».
--
-- Funciones: min(a, b…), max(a, b…), first(a, b…) (el primero con valor), avg(a, b…), round(x[, paso]), roundup(x[, paso]),
-- rounddown(x[, paso]), ifgt / iflt / ifgte / iflte / ifeq(a, b, si, [si no]) (sin «si no» y sin cumplirse, «sin valor») y
-- check(a, si[, si no]) (como en TSM: «si» cuando a es mayor que 0, si no «si no»).
--
-- Fuentes: snfmercado (lo normal de la app), snfminimo (F1: la compra mínima de la foto de SNF.Subasta.foto), snfhistorico (lo
-- normal de la app, igual que snfmercado: es el alias de las importaciones de TSM y de las fórmulas ya guardadas, y no cambia
-- para no mover sus precios), snfhistoricodiario() (fase 2: el histórico propio de la app, Precios.historico, la mediana de
-- los valores diarios de hasta 30 días de la misma casa; se elige a mano, ninguna traducción lo pone; sin valor si la app no
-- lo da, con la razón en Precios.historico, y siempre sin valor para una variante «i:1234:…» o una mascota, porque la app
-- solo tiene el objeto base), snfcostemedio() (fase 2: el coste medio de las unidades que tienes según tus compras,
-- Contabilidad.costeMedio; se elige a mano, ninguna traducción lo pone, smartavgbuy sigue sin fuente; sin valor con la razón
-- en Contabilidad.costeMedio y siempre para una variante o una mascota), snfregional() (el precio regional de la app,
-- Precios.regional: la media de mercado de las casas de toda la región, como DBRegionMarketAvg de TSM, al que traduce;
-- sin valor si la app no lo da y siempre para una variante o una mascota), vendorsell (el
-- precio de venta a vendedor del juego), vendorbuy (last observed merchant unit cost), crafting (sin
-- valor en la parte 1) y las fuentes propias del jugador (SnetForeverCuenta.comercio.v2.fuentes[nombre] = texto).
--
-- Formulas.compilar(texto) -> f | nil, error    f(item) -> cobre | nil [, error]. item: id de objeto o clave «i:1234».
-- Formulas.valor(texto, item) -> cobre | nil [, error]   nil sin error es «sin valor».
-- Formulas.fuentes() -> {nombre = texto}        las fuentes propias guardadas (nombre en minúsculas; lo roto, descartado).
-- Formulas.ponerFuente(nombre, texto, anterior?) -> true, cambiadas | false, error   Task 23 (Ajustes › Fuentes propias):
--                                               guarda una fuente propia (con `anterior`, la que se está editando: así se
--                                               puede cambiar su nombre; Task 25: las fórmulas que la usaban, en las demás
--                                               fuentes propias y en las operaciones, pasan al nombre nuevo, y `cambiadas`
--                                               dice cuántas). El nombre se guarda en minúsculas y tiene que ser una
--                                               palabra (letras, números y _, sin empezar por número), sin espacios, que no
--                                               sea una fuente o una función de SnetForever ni otra fuente propia. La
--                                               fórmula se prueba ya guardada (así se ve si la fuente se usa a sí misma o
--                                               usa una que no existe); si no vale, todo queda como estaba. El error va con
--                                               Formulas.mensaje como los de las fórmulas.
-- Formulas.quitarFuente(nombre) -> boolean      la borra (las fórmulas que la usen dirán que no existe).
-- Formulas.traducir(texto, antes?) -> texto, cambios, desconocidas   pasa las fuentes de TSM a las nuestras (dbmarket ->
--                                               snfmercado; dbregionmarketavg -> snfregional(); dbminbuyout -> snfminimo;
--                                               dbhistorical y dbregionhistorical -> snfhistorico); las demás desconocidas
--                                               quedan como estaban y se listan. Con `antes`, como se traducía antes del
--                                               precio regional (dbregionmarketavg -> snfmercado).
-- Formulas.mensaje(error) -> texto claro en el idioma del cliente (textos/es.lua y textos/en.lua, claves COMERCIO_FORMULA_*).
-- Formulas.cobre(valor) -> cobre entero | nil   Task 22 (pendiente de la Task 14): las fórmulas calculan sin redondear (un
--                                               porcentaje suelto vale 0,5 y una cantidad puede salir con decimales). Lo
--                                               que se use como PRECIO pasa por aquí: cobre entero y siempre hacia abajo,
--                                               para que un precio máximo de compra nunca suba. Solo cuenta como el entero de
--                                               arriba lo que se queda por debajo por el error de la coma flotante
--                                               ((1 - 0,9) * 1000 = 99,99999999999997 es 100; 99,9995 es 99): margen relativo
--                                               de 1e-14 del valor, nunca más de 0,0001 cobre. Un precio no baja de 0; sin
--                                               valor (nil, NaN o infinito) sigue siendo nil.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Formulas = {}
SNF.Formulas = Formulas

local floor, abs = math.floor, math.abs
local MAXIMO = 1e15 -- cobre; por encima, «demasiado grande»
local PROFUNDIDAD = 60 -- paréntesis y funciones anidados
local CACHE_MAX = 500
local MAX_ITEM_ID = 2147483647

local UNIDADES = {g = 10000, o = 10000, s = 100, p = 100, c = 1}
-- dbregionmarketavg pasa a la fuente regional de la app; las importaciones de antes lo pasaban a snfmercado
-- (TRADUCCION_ANTES: la usa ImportarTSM.actualizarRegional para reconocer lo importado y no tocar lo editado a mano).
local TRADUCCION = {
  dbmarket = "snfmercado", dbregionmarketavg = "snfregional()",
  dbminbuyout = "snfminimo",
  dbhistorical = "snfhistorico", dbregionhistorical = "snfhistorico",
}
-- Funciones: {mínimo de argumentos, máximo (nil = sin tope)}.
local FUNCIONES = {
  min = {1}, max = {1}, first = {1}, avg = {1},
  round = {1, 2}, roundup = {1, 2}, rounddown = {1, 2},
  ifgt = {3, 4}, iflt = {3, 4}, ifgte = {3, 4}, iflte = {3, 4}, ifeq = {3, 4},
  check = {2, 3},
}

-- Un error es una tabla {c = código, …}; se lanza con error() dentro y se recoge con pcall en la entrada.
local function falla(codigo, a, b, d)
  error({c = codigo, a = a, b = b, d = d}, 0)
end

---------------------------------------------------------------------------------------------------
-- Datos del juego y de la app (todo protegido: nunca un error, nunca un valor secreto).
---------------------------------------------------------------------------------------------------

local function numeroSeguro(v)
  if type(v) ~= "number" then
    return nil
  end
  local api = SNF.API
  if api and api.esSecreto and api.esSecreto(v) then -- esSecreto ya es seguro: si falla, dice que sí es secreto
    return nil
  end
  if v ~= v or v == math.huge or v == -math.huge then
    return nil
  end
  return v + 0.0
end

local function idDe(item)
  local arbol = SNF.Arbol
  if arbol and arbol.idDe then
    local ok, id = pcall(arbol.idDe, item)
    if ok and id then
      return id
    end
  end
  return type(item) == "number" and item or nil
end

-- Fase 2: una clave con variante («i:8836::1:3») o una mascota («p:…») no es el objeto base que mide la app.
local function esBase(clave)
  return clave == nil or type(clave) == "number" or (type(clave) == "string" and string.find(clave, "^i:%d+$") ~= nil)
end

local function deLaApp(id)
  local precios = SNF.Precios
  if not id or not precios or not precios.de then
    return nil
  end
  local ok, d = pcall(precios.de, id)
  return ok and type(d) == "table" and numeroSeguro(d.normal) or nil
end

local HISTORICO_DIARIO = "snfhistoricodiario"
local COSTE_MEDIO = "snfcostemedio"
local REGIONAL = "snfregional"

-- El precio regional de la app (Precios.regional: la media de mercado de toda la región, como DBRegionMarketAvg de TSM).
-- Solo del objeto base: la app no distingue variantes ni mascotas.
local function regional(id, clave)
  local precios = SNF.Precios
  if not id or not esBase(clave) or not precios or type(precios.regional) ~= "function" then
    return nil
  end
  local ok, v = pcall(precios.regional, id)
  return ok and numeroSeguro(v) or nil
end

local function historicoDiario(id, clave)
  local precios = SNF.Precios
  if not id or not esBase(clave) or not precios or type(precios.historico) ~= "function" then
    return nil
  end
  local ok, d = pcall(precios.historico, id)
  return ok and type(d) == "table" and numeroSeguro(d.valor) or nil
end

-- Fase 2: el coste medio de lo que tienes según tus compras (Contabilidad.costeMedio). Solo del objeto base, como el
-- inventario y los recibos; sin valor con la razón en Contabilidad.costeMedio.
local function costeMedio(id, clave)
  local contabilidad = rawget(SNF, "Contabilidad")
  if not id or not esBase(clave) or type(contabilidad) ~= "table" or type(contabilidad.costeMedio) ~= "function" then
    return nil
  end
  local ok, d = pcall(contabilidad.costeMedio, id)
  return ok and type(d) == "table" and numeroSeguro(d.valor) or nil
end

-- Las fuentes que solo se leen con paréntesis («snfhistoricodiario()»): así no chocan con una fuente propia ya guardada con
-- ese nombre, que se sigue leyendo sin ellos.
local CON_PARENTESIS = {[HISTORICO_DIARIO] = historicoDiario, [COSTE_MEDIO] = costeMedio, [REGIONAL] = regional}

local FUENTES_BASE = {
  snfmercado = deLaApp,
  -- Lo mismo que snfmercado a propósito (compatibilidad): el histórico propio se pide con snfhistoricodiario().
  snfhistorico = deLaApp,
  -- F1 (ronda 2): la compra mínima de ahora con la misma foto que el tooltip (SNF.Subasta.foto: la lista de Navegar, si no la
  -- foto de la app y, solo sin ella, el escaneo). Antes leía solo el escaneo, y una réplica vieja pasaba por de ahora.
  snfminimo = function(id)
    local subasta = rawget(SNF, "Subasta")
    if not id or type(subasta) ~= "table" or type(subasta.foto) ~= "function" then
      return nil
    end
    local ok, precio = pcall(subasta.foto, id)
    return ok and numeroSeguro(precio) or nil
  end,
  -- El del juego o, si el juego aún no tiene el objeto en caché, el guardado (comercio/precio-vendedor.lua).
  vendorsell = function(id)
    local guardado = rawget(SNF, "PrecioVendedor")
    local precio
    if id and guardado then
      precio = numeroSeguro(guardado.de(id))
    else
      local objeto = id and SNF.API.infoObjeto(id)
      precio = objeto and numeroSeguro(objeto.pv)
    end
    return precio and precio > 0 and precio or nil
  end,
  vendorbuy = function(id)
    return SNF.MerchantPrices and SNF.MerchantPrices.value(id) or nil
  end,
  crafting = function(id) return SNF.RecipeCosts.unit(id) end,
}

---------------------------------------------------------------------------------------------------
-- Fuentes propias.
---------------------------------------------------------------------------------------------------

local function nombreValido(n)
  return type(n) == "string" and string.find(n, "^[%a_][%w_]*$") ~= nil and FUENTES_BASE[string.lower(n)] == nil
    and FUNCIONES[string.lower(n)] == nil
end

local function guardadas()
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  local v2 = type(c) == "table" and c.v2
  local f = type(v2) == "table" and v2.fuentes
  return type(f) == "table" and f or nil
end

function Formulas.fuentes()
  local salida = {}
  local origen = guardadas()
  if not origen then
    return salida
  end
  local claves = {}
  for nombre, texto in pairs(origen) do
    if nombreValido(nombre) and type(texto) == "string" and texto ~= "" then
      claves[#claves + 1] = nombre
    end
  end
  table.sort(claves)
  for _, nombre in ipairs(claves) do
    local minuscula = string.lower(nombre)
    if salida[minuscula] == nil then
      salida[minuscula] = origen[nombre]
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Tokenizador.
---------------------------------------------------------------------------------------------------

local function itemPrefix(word)
  word = string.lower(word)
  return word == "item" or word == "i"
end

-- Only bare numeric item references are supported. Variants and names need their own price data.
local function referenceId(text, colon)
  local digits = string.match(text, "^:(%d+)", colon)
  if not digits or #digits > 10 then
    return nil
  end
  local id = tonumber(digits)
  if id <= 0 or id > MAX_ITEM_ID then
    return nil
  end
  return id, colon + #digits + 1
end

-- Devuelve la lista de fichas {k = "num"|"mon"|"pct"|"id"|"item"|"op", v}. Las fichas de importe seguidas se suman.
local function tokenizar(texto)
  local fichas = {}
  local i, n = 1, #texto
  while i <= n do
    local c = string.sub(texto, i, i)
    if string.find(c, "%s") then
      i = i + 1
    elseif string.find(c, "[%d%.]") then
      local numero = string.match(texto, "^%d+%.?%d*", i) or string.match(texto, "^%.%d+", i)
      if not numero then
        falla("caracter", c)
      end
      local fin = i + #numero
      local resto = string.match(texto, "^[%w_]*", fin)
      local valor = tonumber(numero)
      if not valor or valor > MAXIMO then
        falla("grande")
      end
      valor = valor + 0.0
      if string.sub(texto, fin, fin) == "%" then
        fichas[#fichas + 1] = {k = "pct", v = valor / 100}
        i = fin + 1
      elseif resto == "" then
        fichas[#fichas + 1] = {k = "num", v = valor}
        i = fin
      else
        local unidad = UNIDADES[string.lower(string.sub(resto, 1, 1))]
        local siguiente = string.sub(resto, 2, 2)
        if unidad and not string.find(siguiente, "^[%a_]") then
          local cobre = valor * unidad
          if cobre > MAXIMO then
            falla("grande")
          end
          local ultima = fichas[#fichas]
          if ultima and ultima.k == "mon" then
            -- Solo se juntan oro, plata y cobre, cada uno una vez y en ese orden.
            if unidad >= ultima.u then
              falla("importes", numero .. resto)
            end
            ultima.v = ultima.v + cobre
            ultima.u = unidad
            if ultima.v > MAXIMO then
              falla("grande")
            end
          else
            fichas[#fichas + 1] = {k = "mon", v = cobre, u = unidad}
          end
          i = fin + 1
        else
          falla("numero", numero .. resto)
        end
      end
    elseif string.find(c, "[%a_]") then
      local palabra = string.match(texto, "^[%a_][%w_]*", i)
      local finish = i + #palabra
      if itemPrefix(palabra) and string.sub(texto, finish, finish) == ":" then
        local id, nextPosition = referenceId(texto, finish)
        if not id then
          falla("no_entiendo", palabra .. ":")
        end
        fichas[#fichas + 1] = {k = "item", v = id}
        i = nextPosition
      else
        fichas[#fichas + 1] = {k = "id", v = palabra}
        i = finish
      end
    elseif string.find(c, "[%+%-%*/%^%(%),]") then
      fichas[#fichas + 1] = {k = "op", v = c}
      i = i + 1
    else
      falla("caracter", c)
    end
  end
  return fichas
end

---------------------------------------------------------------------------------------------------
-- Cálculo. Cada nodo es una función (item, ctx) -> número | nil.
---------------------------------------------------------------------------------------------------

local function acotado(r)
  if r ~= r or abs(r) > MAXIMO then
    falla("grande")
  end
  return r
end

local function constante(valor)
  return function()
    return valor
  end
end

local function binaria(op, a, b)
  if op == "+" then
    return function(item, ctx)
      local x, y = a(item, ctx), b(item, ctx)
      return x and y and acotado(x + y) or nil
    end
  elseif op == "-" then
    return function(item, ctx)
      local x, y = a(item, ctx), b(item, ctx)
      return x and y and acotado(x - y) or nil
    end
  elseif op == "*" then
    return function(item, ctx)
      local x, y = a(item, ctx), b(item, ctx)
      return x and y and acotado(x * y) or nil
    end
  elseif op == "^" then
    return function(item, ctx)
      local x, y = a(item, ctx), b(item, ctx)
      if not x or not y or (x == 0 and y < 0) then
        return nil
      end
      local value = x ^ y
      return value == value and acotado(value) or nil
    end
  end
  return function(item, ctx)
    local x, y = a(item, ctx), b(item, ctx)
    if not x or not y or y == 0 then
      return nil
    end
    return acotado(x / y)
  end
end

local COMPARACIONES = {
  ifgt = function(x, y) return x > y end,
  iflt = function(x, y) return x < y end,
  ifgte = function(x, y) return x >= y end,
  iflte = function(x, y) return x <= y end,
  ifeq = function(x, y) return x == y end,
}

local function redondeo(nombre, args)
  local x, paso = args[1], args[2] or constante(1.0)
  return function(item, ctx)
    local v, p = x(item, ctx), paso(item, ctx)
    if not v or not p or p <= 0 then
      return nil
    end
    local q = v / p
    if nombre == "round" then
      q = floor(q + 0.5)
    elseif nombre == "roundup" then
      q = math.ceil(q - 1e-9)
    else
      q = floor(q + 1e-9)
    end
    return acotado(q * p + 0.0)
  end
end

local function funcion(nombre, args)
  if COMPARACIONES[nombre] then
    local cmp, a, b, si, no = COMPARACIONES[nombre], args[1], args[2], args[3], args[4]
    return function(item, ctx)
      local x, y = a(item, ctx), b(item, ctx)
      if not x or not y then
        return nil
      end
      if cmp(x, y) then
        return si(item, ctx)
      end
      return no and no(item, ctx) or nil
    end
  elseif nombre == "check" then
    local a, si, no = args[1], args[2], args[3]
    return function(item, ctx)
      local x = a(item, ctx)
      if not x then
        return nil
      end
      if x > 0 then
        return si(item, ctx)
      end
      return no and no(item, ctx) or nil
    end
  elseif nombre == "first" then
    return function(item, ctx)
      for _, a in ipairs(args) do
        local x = a(item, ctx)
        if x then
          return x
        end
      end
      return nil
    end
  elseif nombre == "min" or nombre == "max" then
    local menor = nombre == "min"
    return function(item, ctx)
      local mejor
      for _, a in ipairs(args) do
        local x = a(item, ctx)
        if x and (mejor == nil or (menor and x < mejor) or (not menor and x > mejor)) then
          mejor = x
        end
      end
      return mejor
    end
  elseif nombre == "avg" then
    -- Como en TSM: la media de los que tienen valor (avg(crafting, 1g, 3g) sin receta es 2g); sin ninguno, «sin valor».
    -- Las fórmulas importadas de TSM cuentan con ello: check(first(crafting, dbmarket, …), max(0.25 * avg(crafting, …), …)).
    return function(item, ctx)
      local suma, n = 0.0, 0
      for _, a in ipairs(args) do
        local x = a(item, ctx)
        if x then
          suma = acotado(suma + x)
          n = n + 1
        end
      end
      if n == 0 then
        return nil
      end
      return suma / n
    end
  end
  return redondeo(nombre, args)
end

---------------------------------------------------------------------------------------------------
-- Analizador (recursivo descendente).
---------------------------------------------------------------------------------------------------

local parsear -- (texto) -> {f, refs} | {err}   con caché

local function baseValue(read, explicitId)
  return function(_, ctx)
    local id = explicitId or ctx.id
    if not id then
      return nil
    end
    local memo = ctx.memo
    -- Con una variante («i:1234:…»), «item:1234» se guarda aparte aunque sea el mismo id: la referencia es el objeto base.
    if id ~= ctx.id or (explicitId and ctx.variante) then
      local references = ctx.references
      if not references then
        references = {}
        ctx.references = references
      end
      memo = references[id]
      if not memo then
        memo = {}
        references[id] = memo
      end
    end
    local value = memo[read]
    if value == nil then
      -- La clave del objeto (con su variante) solo va con el objeto de la fórmula, no con «item:1234».
      value = read(id, not explicitId and ctx.clave or nil) or false
      memo[read] = value
    end
    return value or nil
  end
end

local function enlazarFuente(nombre, escrito)
  return function(item, ctx)
    local fuentes = ctx.fuentes
    if not fuentes then
      fuentes = Formulas.fuentes() -- una sola lectura por evaluación
      ctx.fuentes = fuentes
    end
    local texto = fuentes[nombre]
    if not texto then
      falla("fuente", escrito)
    end
    if ctx.pila[nombre] then
      falla("ciclo", nombre)
    end
    local p = parsear(texto)
    if p.err then
      falla("fuente_rota", nombre, p.err)
    end
    ctx.pila[nombre] = true
    local ok, r = pcall(p.f, item, ctx)
    ctx.pila[nombre] = nil
    if not ok then
      error(r, 0)
    end
    return r
  end
end

local function analizar(texto)
  local fichas = tokenizar(texto)
  if #fichas == 0 then
    falla("vacia")
  end
  local pos, profundidad = 1, 0
  local refs, vistas = {}, {}

  local function actual()
    return fichas[pos]
  end
  local function esOp(v)
    local f = fichas[pos]
    return f ~= nil and f.k == "op" and f.v == v
  end
  local function empiezaValor()
    local f = fichas[pos]
    return f ~= nil and (f.k == "num" or f.k == "mon" or f.k == "pct" or f.k == "id" or (f.k == "op" and f.v == "("))
  end
  local function nombreFicha(f)
    return f and tostring(f.k == "op" and f.v or f.k == "id" and f.v or f.v) or ""
  end

  local suma

  local function entrar()
    profundidad = profundidad + 1
    if profundidad > PROFUNDIDAD then
      falla("anidada")
    end
  end

  local unario

  local function primario()
    local f = actual()
    if not f then
      falla("falta_valor")
    end
    if f.k == "num" or f.k == "mon" then
      pos = pos + 1
      return constante(f.v)
    elseif f.k == "pct" then
      pos = pos + 1
      local c = constante(f.v)
      if empiezaValor() then -- «120% snfmercado»: el porcentaje multiplica al valor que sigue
        return binaria("*", c, unario())
      end
      return c
    elseif f.k == "op" and f.v == "(" then
      pos = pos + 1
      entrar()
      local e = suma()
      profundidad = profundidad - 1
      if not esOp(")") then
        falla(actual() and "no_entiendo" or "cierre", nombreFicha(actual()))
      end
      pos = pos + 1
      return e
    elseif f.k == "id" then
      pos = pos + 1
      local nombre = string.lower(f.v)
      local read = FUENTES_BASE[nombre]
      if esOp("(") then
        -- Los paréntesis separan las fuentes nuevas de cualquier fuente propia anterior con el mismo nombre.
        local conParentesis = CON_PARENTESIS[nombre]
        if conParentesis then
          read = conParentesis
        end
        if read then
          pos = pos + 1
          if conParentesis and esOp(")") then
            pos = pos + 1
            return baseValue(read)
          end
          local reference = actual()
          if not reference or reference.k ~= "item" then
            falla("no_entiendo", nombreFicha(reference))
          end
          pos = pos + 1
          if not esOp(")") then
            falla(actual() and "no_entiendo" or "cierre", nombreFicha(actual()))
          end
          pos = pos + 1
          return baseValue(read, reference.v)
        end
        local reglas = FUNCIONES[nombre]
        if not reglas then
          falla("funcion", f.v)
        end
        pos = pos + 1
        entrar()
        local args = {}
        if not esOp(")") then
          while true do
            args[#args + 1] = suma()
            if esOp(",") then
              pos = pos + 1
            else
              break
            end
          end
        end
        profundidad = profundidad - 1
        if not esOp(")") then
          falla(actual() and "no_entiendo" or "cierre", nombreFicha(actual()))
        end
        pos = pos + 1
        if #args < reglas[1] or (reglas[2] and #args > reglas[2]) then
          -- b: lo mínimo; d: lo máximo (nil = sin tope). Formulas.mensaje lo escribe en el idioma del cliente.
          falla("argumentos", nombre, reglas[1], reglas[2])
        end
        return funcion(nombre, args)
      end
      if read then
        return baseValue(read)
      end
      if nombreValido(f.v) then
        if not vistas[nombre] then
          vistas[nombre] = true
          refs[#refs + 1] = {nombre = nombre, escrito = f.v}
        end
        return enlazarFuente(nombre, f.v)
      end
      falla("fuente", f.v)
    end
    falla("no_entiendo", nombreFicha(f))
  end

  local function power()
    local base = primario()
    if not esOp("^") then
      return base
    end
    pos = pos + 1
    entrar()
    local exponent = unario()
    profundidad = profundidad - 1
    return binaria("^", base, exponent)
  end

  function unario()
    local f = actual()
    if f and f.k == "op" and f.v == "-" then
      pos = pos + 1
      entrar()
      local e = unario()
      profundidad = profundidad - 1
      return function(item, ctx)
        local x = e(item, ctx)
        return x and -x or nil
      end
    end
    return power()
  end

  local function producto()
    local e = unario()
    while esOp("*") or esOp("/") do
      local op = actual().v
      pos = pos + 1
      e = binaria(op, e, unario())
    end
    return e
  end

  function suma()
    local e = producto()
    while esOp("+") or esOp("-") do
      local op = actual().v
      pos = pos + 1
      e = binaria(op, e, producto())
    end
    return e
  end

  local raiz = suma()
  if actual() then
    if esOp(")") then
      falla("sobra")
    end
    falla("no_entiendo", nombreFicha(actual()))
  end
  return raiz, refs
end

local cache, tamano = {}, 0
local listas = {} -- fórmulas ya validadas y listas, por texto (se vacía con la caché)

function parsear(texto)
  local c = cache[texto]
  if c then
    return c
  end
  local ok, f, refs = pcall(analizar, texto)
  if ok then
    c = {f = f, refs = refs}
  elseif type(f) == "table" then
    c = {err = f}
  else
    c = {err = {c = "interno"}}
  end
  if tamano >= CACHE_MAX then
    cache, tamano = {}, 0
    listas = {}
  end
  cache[texto] = c
  tamano = tamano + 1
  return c
end

-- Comprueba (con las fuentes propias de ahora) que todo lo que usa la fórmula existe y que no hay ciclos. Lanza el error.
local function validar(p, pila, hechas, fuentes)
  for _, ref in ipairs(p.refs) do
    local nombre = ref.nombre
    local texto = fuentes[nombre]
    if not texto then
      falla("fuente", ref.escrito)
    end
    if pila[nombre] then
      falla("ciclo", nombre)
    end
    if not hechas[nombre] then
      local q = parsear(texto)
      if q.err then
        falla("fuente_rota", nombre, q.err)
      end
      pila[nombre] = true
      validar(q, pila, hechas, fuentes)
      pila[nombre] = nil
      hechas[nombre] = true
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Interfaz.
---------------------------------------------------------------------------------------------------

-- Fórmulas ya validadas y listas, por texto. Las fuentes propias se leen en vivo en cada cálculo, así que un cambio en
-- ellas se ve igual; lo único que no se repite es la validación (existen, sin ciclos) hasta que se llame a compilar.
local function preparar(p)
  return function(item)
    local ctx = {id = idDe(item), clave = item, variante = not esBase(item), memo = {}, pila = {}}
    local bien, r = pcall(p.f, item, ctx)
    if bien then
      return numeroSeguro(r)
    end
    return nil, type(r) == "table" and r or {c = "interno"}
  end
end

function Formulas.compilar(texto)
  if type(texto) ~= "string" or string.find(texto, "^%s*$") then
    return nil, {c = "vacia"}
  end
  local p = parsear(texto)
  if p.err then
    return nil, p.err
  end
  local ok, e = pcall(validar, p, {}, {}, Formulas.fuentes())
  if not ok then
    return nil, type(e) == "table" and e or {c = "interno"}
  end
  local f = preparar(p)
  if listas[texto] == nil then
    if cache[texto] ~= p then -- el análisis se pudo salir de la caché: no se guarda una lista huérfana
      return f
    end
    listas[texto] = f
  end
  return f
end

-- Las fuentes propias guardadas, preparando lo guardado si hace falta (nil si no se puede).
local function guardadasPreparadas()
  local guardado = SNF.Guardado
  if guardado and guardado.preparar then
    pcall(guardado.preparar)
  end
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  if type(c) ~= "table" then
    return nil
  end
  if type(c.v2) ~= "table" then
    c.v2 = {}
  end
  if type(c.v2.fuentes) ~= "table" then
    c.v2.fuentes = {}
  end
  return c.v2.fuentes
end

-- Quita de lo guardado las claves que, en minúsculas, valen `minuscula`, y devuelve lo quitado (para poder devolverlo).
local function sacar(origen, minuscula, quitadas)
  for nombre, texto in pairs(origen) do
    if type(nombre) == "string" and string.lower(nombre) == minuscula then
      quitadas[nombre] = texto
    end
  end
  for nombre in pairs(quitadas) do
    origen[nombre] = nil
  end
  return quitadas
end

-- Task 25 (pendiente de la Task 23): al cambiar el nombre de una fuente propia, las fórmulas que la usaban la siguen usando
-- con el nombre nuevo. Se cambia la palabra entera (sin mirar mayúsculas y si no es una función, como «vieja(»), y solo en
-- fórmulas: las demás fuentes propias y los campos de fórmula de las operaciones (las vivas y las de la papelera). Da
-- cuántas fórmulas cambiaron.
local function cambiarNombre(texto, vieja, nueva)
  local cambiada = false
  local resultado = string.gsub(texto, "()%f[%w_]([%a_][%w_]*)()", function(desde, palabra, hasta)
    if string.lower(palabra) ~= vieja or string.match(texto, "^%s*(.?)", hasta) == "("
      or (itemPrefix(palabra) and referenceId(texto, hasta)) then
      return nil
    end
    cambiada = true
    return nueva
  end)
  return resultado, cambiada
end

local function renombrarEnFormulas(origen, vieja, nueva)
  local n = 0
  for nombre, texto in pairs(origen) do
    if type(texto) == "string" then
      local otro, cambiada = cambiarNombre(texto, vieja, nueva)
      if cambiada then
        origen[nombre] = otro
        n = n + 1
      end
    end
  end
  local O = SNF.Operaciones
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local v2 = O and O.campo and type(cuenta) == "table" and type(cuenta.comercio) == "table" and cuenta.comercio.v2
  if type(v2) ~= "table" then
    return n
  end
  local function enOperacion(tipo, op)
    local valores = type(op) == "table" and op.valores
    if type(valores) ~= "table" then
      return
    end
    for clave, texto in pairs(valores) do
      local def = type(clave) == "string" and O.campo(tipo, clave)
      if def and def.tipo == "formula" and type(texto) == "string" then
        local otro, cambiada = cambiarNombre(texto, vieja, nueva)
        if cambiada then
          valores[clave] = otro
          n = n + 1
        end
      end
    end
  end
  if type(v2.operaciones) == "table" then
    for tipo, ops in pairs(v2.operaciones) do
      if type(ops) == "table" then
        for _, op in pairs(ops) do
          enOperacion(tipo, op)
        end
      end
    end
  end
  if type(v2._papelera) == "table" then
    for _, e in ipairs(v2._papelera) do
      if type(e) == "table" and e.operacion == true then
        enOperacion(e.tipo, e.datos)
      end
    end
  end
  return n
end

function Formulas.ponerFuente(nombre, texto, anterior)
  nombre = type(nombre) == "string" and (string.match(nombre, "^%s*(.-)%s*$")) or ""
  if nombre == "" then
    return false, {c = "nombre_vacio"}
  end
  if string.find(nombre, "%s") then
    return false, {c = "nombre_espacios"}
  end
  if not string.find(nombre, "^[%a_][%w_]*$") then
    return false, {c = "nombre_caracteres"}
  end
  local minuscula = string.lower(nombre)
  if FUENTES_BASE[minuscula] or FUNCIONES[minuscula] then
    return false, {c = "nombre_reservado", a = minuscula}
  end
  local vieja = type(anterior) == "string" and string.lower(anterior) or nil
  if minuscula ~= vieja and Formulas.fuentes()[minuscula] then
    return false, {c = "nombre_repetido", a = minuscula}
  end
  if type(texto) ~= "string" or string.find(texto, "^%s*$") then
    return false, {c = "vacia"}
  end
  local p = parsear(texto)
  if p.err then
    return false, p.err
  end
  local origen = guardadasPreparadas()
  if not origen then
    return false, {c = "interno"}
  end
  -- Se guarda ya (sin la vieja) y se prueba la fuente por su nombre: ahí salen los ciclos y las fuentes que no existen.
  local quitadas = sacar(origen, minuscula, {})
  if vieja then
    sacar(origen, vieja, quitadas)
  end
  origen[minuscula] = texto
  local ok, e = pcall(validar, parsear(minuscula), {}, {}, Formulas.fuentes())
  if not ok then
    origen[minuscula] = nil
    for n, t in pairs(quitadas) do
      origen[n] = t
    end
    return false, type(e) == "table" and e or {c = "interno"}
  end
  if vieja and vieja ~= minuscula then
    return true, renombrarEnFormulas(origen, vieja, minuscula)
  end
  return true, 0
end

function Formulas.quitarFuente(nombre)
  local origen = type(nombre) == "string" and guardadasPreparadas()
  if not origen then
    return false
  end
  return next(sacar(origen, string.lower(nombre), {})) ~= nil
end

function Formulas.valor(texto, item)
  local f = type(texto) == "string" and listas[texto]
  if not f then
    local e
    f, e = Formulas.compilar(texto)
    if not f then
      return nil, e
    end
  end
  return f(item)
end

-- Formulas.traducir(texto, antes?): con `antes`, la traducción de las importaciones anteriores al precio regional
-- (dbregionmarketavg -> snfmercado), para reconocer una fórmula importada entonces.
local TRADUCCION_ANTES = {}
for k, v in pairs(TRADUCCION) do
  TRADUCCION_ANTES[k] = v
end
TRADUCCION_ANTES.dbregionmarketavg = "snfmercado"

function Formulas.traducir(texto, antes)
  if type(texto) ~= "string" then
    return "", 0, {}
  end
  local tabla = antes and TRADUCCION_ANTES or TRADUCCION
  local cambios, desconocidas, vistas = 0, {}, {}
  local propias = Formulas.fuentes()
  local resultado = string.gsub(texto, "()%f[%w_]([%a_][%w_]*)()", function(desde, palabra, hasta)
    local minuscula = string.lower(palabra)
    local despues = string.match(texto, "^%s*(.?)", hasta)
    if FUENTES_BASE[minuscula] or propias[minuscula] or (itemPrefix(palabra) and referenceId(texto, hasta)) then
      return nil
    end
    if despues == "(" then
      local prefix = string.match(texto, "^%s*%(%s*([%a_][%w_]*):%d+%s*%)", hasta)
      if FUNCIONES[minuscula] or CON_PARENTESIS[minuscula] or not prefix or not itemPrefix(prefix) then
        return nil
      end
    end
    local destino = tabla[minuscula]
    if destino then
      cambios = cambios + 1
      -- «dbregionmarketavg(item:1234)» -> «snfregional(item:1234)»: los paréntesis ya los pone la referencia.
      if despues == "(" then
        destino = (string.gsub(destino, "%(%)$", ""))
      end
      return destino
    end
    if not vistas[minuscula] then
      vistas[minuscula] = true
      desconocidas[#desconocidas + 1] = palabra
    end
    return nil
  end)
  return resultado, cambios, desconocidas
end

-- Vista previa de una importación (comercio/importar-tsm.lua). Nada de esto cambia lo guardado ni cómo se calcula un precio.
-- Formulas.palabras(texto) -> {nombres}   las fuentes que nombra la fórmula (en minúsculas, sin repetir y en orden de
--     aparición), con las mismas reglas que traducir: no cuentan las funciones, las referencias «item:1234» ni los importes;
--     sí cuenta «dbmarket(item:1234)».
-- Formulas.traduccion(nombre) -> nuestra fuente | nil   la que pone traducir en lugar de esa fuente de TSM.
-- Formulas.reservado(nombre) -> boolean   es una fuente o una función de SnetForever (no puede ser una fuente propia).
-- Formulas.probar(texto, fuentes) -> true | false, error   como compilar, pero comprobando las referencias contra `fuentes`
--     ({nombre = texto}, las que habrá después de importar) en vez de contra las guardadas. Detecta ciclos y fuentes rotas.
function Formulas.palabras(texto)
  local salida, vistas = {}, {}
  if type(texto) ~= "string" then
    return salida
  end
  for _, palabra, hasta in string.gmatch(texto, "()%f[%w_]([%a_][%w_]*)()") do
    local minuscula = string.lower(palabra)
    local cuenta = not (itemPrefix(palabra) and referenceId(texto, hasta))
    if cuenta and string.match(texto, "^%s*(.?)", hasta) == "(" then
      local prefix = string.match(texto, "^%s*%(%s*([%a_][%w_]*):%d+%s*%)", hasta)
      cuenta = not FUNCIONES[minuscula] and not CON_PARENTESIS[minuscula] and prefix ~= nil and itemPrefix(prefix)
    end
    if cuenta and not vistas[minuscula] then
      vistas[minuscula] = true
      salida[#salida + 1] = minuscula
    end
  end
  return salida
end

function Formulas.traduccion(nombre)
  return type(nombre) == "string" and TRADUCCION[string.lower(nombre)] or nil
end

function Formulas.reservado(nombre)
  if type(nombre) ~= "string" then
    return false
  end
  local minuscula = string.lower(nombre)
  return FUENTES_BASE[minuscula] ~= nil or FUNCIONES[minuscula] ~= nil
end

function Formulas.probar(texto, fuentes)
  if type(texto) ~= "string" or string.find(texto, "^%s*$") then
    return false, {c = "vacia"}
  end
  local p = parsear(texto)
  if p.err then
    return false, p.err
  end
  local ok, e = pcall(validar, p, {}, {}, type(fuentes) == "table" and fuentes or Formulas.fuentes())
  if not ok then
    return false, type(e) == "table" and e or {c = "interno"}
  end
  return true
end

-- Los mensajes salen de textos/es.lua y textos/en.lua (claves COMERCIO_FORMULA_*), en el idioma del cliente (L.t). Los que
-- llevan %s reciben el trozo de la fórmula (e.a) y, si hace falta, el segundo dato (e.b).
local MENSAJES = {
  vacia = "COMERCIO_FORMULA_VACIA", cierre = "COMERCIO_FORMULA_CIERRE", sobra = "COMERCIO_FORMULA_SOBRA",
  falta_valor = "COMERCIO_FORMULA_FALTA_VALOR", no_entiendo = "COMERCIO_FORMULA_NO_ENTIENDO",
  caracter = "COMERCIO_FORMULA_CARACTER", numero = "COMERCIO_FORMULA_NUMERO", funcion = "COMERCIO_FORMULA_FUNCION",
  argumentos = "COMERCIO_FORMULA_ARGUMENTOS", fuente = "COMERCIO_FORMULA_FUENTE", ciclo = "COMERCIO_FORMULA_CICLO",
  importes = "COMERCIO_FORMULA_IMPORTES", grande = "COMERCIO_FORMULA_GRANDE", anidada = "COMERCIO_FORMULA_ANIDADA",
  interno = "COMERCIO_FORMULA_INTERNO",
  -- Los nombres de las fuentes propias (Formulas.ponerFuente).
  nombre_vacio = "COMERCIO_FORMULA_NOMBRE_VACIO", nombre_espacios = "COMERCIO_FORMULA_NOMBRE_ESPACIOS",
  nombre_caracteres = "COMERCIO_FORMULA_NOMBRE_CARACTERES", nombre_reservado = "COMERCIO_FORMULA_NOMBRE_RESERVADO",
  nombre_repetido = "COMERCIO_FORMULA_NOMBRE_REPETIDO",
}

local function texto(clave, ...)
  local L = SNF.L
  if L and L.t then
    return L.t(clave, ...)
  end
  return clave
end

function Formulas.mensaje(error)
  if type(error) == "table" then
    if error.c == "fuente_rota" then
      return texto("COMERCIO_FORMULA_FUENTE_ROTA", tostring(error.a), Formulas.mensaje(error.b))
    end
    if error.c == "argumentos" and type(error.b) == "number" then
      if error.d == nil then
        return texto("COMERCIO_FORMULA_ARGUMENTOS_MINIMO", tostring(error.a), error.b)
      elseif error.d ~= error.b then
        return texto("COMERCIO_FORMULA_ARGUMENTOS_ENTRE", tostring(error.a), error.b, error.d)
      end
    end
    local clave = MENSAJES[error.c]
    if clave then
      return texto(clave, tostring(error.a), tostring(error.b))
    end
  elseif type(error) == "string" and error ~= "" then
    return error
  end
  return texto("COMERCIO_FORMULA_NO_CALCULA")
end

function Formulas.cobre(valor)
  if type(valor) ~= "number" or valor ~= valor or valor == math.huge or valor == -math.huge then
    return nil
  end
  if valor <= 0 then
    return 0
  end
  -- Hacia abajo de verdad: solo sube al entero de arriba lo que le queda por debajo menos que el error de la coma flotante.
  -- Ese error crece con el número (un double guarda unas 16 cifras: cada operación puede errar 2,2e-16 del valor), así que
  -- el margen es relativo: 1e-14 del valor, unas 45 veces el error de una operación, que tapa el de una fórmula normal de
  -- unas pocas operaciones y, en 100 cobre, es 0,000000000001 cobre. Tope de 0,0001 cobre (se alcanza a partir de 1e10 cobre,
  -- un millón de oro), para que con mucho oro una fracción de cobre de verdad tampoco suba.
  local entero = floor(valor)
  local margen = math.min(valor * 1e-14, 0.0001)
  if valor - entero >= 1 - margen then
    return entero + 1
  end
  return entero
end
