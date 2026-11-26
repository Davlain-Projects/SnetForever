-- SnetForever: exportar e importar grupos como texto propio (página «Grupos» de la ventana principal del comercio).
-- Un texto lleva un grupo, todos sus subgrupos, sus objetos, las operaciones que esos grupos tienen asignadas (solo las
-- propias de cada grupo, no las heredadas) y las operaciones usadas con sus campos (y los vínculos entre ellas).
--
-- Formato (versión 1): la cabecera «SNF1:» y, detrás, base64 de un serializador propio (sin dependencias, todo escrito aquí):
--   valor  = «T» | «F»                               verdadero y falso
--          | «n» <número> «;»                        el número con 17 cifras («%.17g»)
--          | «s» <largo> «:» <bytes>                 un texto
--          | «t» <cuántas> «:» (<clave> <valor>)*    una tabla; las claves son textos o números, ordenadas
--   Los datos son {v = 1, g = {grupos}, p = {operaciones}}:
--     grupo     {r = ruta relativa («Hierbas`Raras»), o = {claves de objeto}, a = {tipo = {nombres de operación}}}
--               las rutas llevan primero al padre; la del grupo exportado es de un solo nivel (su nombre).
--     operación {t = tipo, n = nombre, v = {campo = valor} (solo lo que no es el valor por defecto), l = {campo = otra operación}}
--   Lo que NO se exporta (para no llevar nombres de personajes ni de casas): los campos de tipo texto (el «Personaje de
--   destino» del correo) y las listas «Ignorar en estas casas» / «Ignorar en estos personajes». Tampoco las reglas de compra
--   ni los objetos del Grupo Base sin grupo. Al exportar el Grupo Base van todos los grupos, pero no las operaciones del propio
--   Grupo Base (colgarían del grupo de destino al importar).
--
-- El texto que se importa es un dato que no se fía: el lector nunca ejecuta nada (ni loadstring ni load), pone tope al largo,
-- al anidado y a las cantidades, comprueba el tipo de cada campo y, si algo no cuadra, devuelve nil y un mensaje claro. Importar
-- es todo o nada: primero se valida y se planea todo, y solo entonces se aplica (si algo fallara a medias, se deshace).
--
-- TextoGrupos.LIMITES                              los topes del lector.
-- TextoGrupos.exportar(ruta) -> texto | nil, mensaje, código     ruta «» (o nil) es el Grupo Base: todos los grupos.
-- TextoGrupos.leer(texto) -> datos | nil, mensaje, código        códigos: vacio, roto, otraVersion, tsm, grande, comando
--     (T1a: un grupo cuyo nombre empieza por «/», un comando del chat: el texto entero no se importa).
-- TextoGrupos.resumen(datos) -> {grupos, objetos, operaciones, enOtroGrupo}   enOtroGrupo: objetos que ya están en otro grupo.
-- TextoGrupos.importar(datos, {destino = ruta, moverObjetos = bool}) -> resultado | nil, mensaje, código
--     Los grupos cuelgan de `destino` (Grupo Base por defecto); si el nombre ya está, «Nombre 2». Una operación con el nombre de
--     una que ya existe en ese tipo: si todos sus campos son iguales se usa la que hay; si no, entra con un nombre libre
--     («X 2») y los grupos apuntan a ese. Nunca se pisa una operación del jugador. moverObjetos = false deja donde están los
--     objetos que ya tienen otro grupo; true los pasa al grupo importado. Los objetos sin grupo (Grupo Base) entran siempre.
--     resultado = {grupos, objetos, operaciones, nuevas, reutilizadas, renombradas, quedan, rutas}.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local TextoGrupos = {}
SNF.TextoGrupos = TextoGrupos

local SEP = "`"
local ROTO = "_roto"
local VERSION = 1
local CABECERA = "SNF1:"
local MAX_NOMBRE_OP = 60 -- el de Operaciones

local LIMITES = {
  texto = 400000, -- caracteres del texto entero
  bytes = 300000, -- bytes ya descodificados
  nodos = 120000, -- valores en total
  profundidad = 8, -- tablas dentro de tablas
  cadena = 2000, -- bytes de un texto suelto
  grupos = 1000,
  niveles = 12, -- niveles de una ruta
  segmento = 100, -- bytes del nombre de un grupo
  objetos = 20000, -- en total
  clave = 120, -- bytes de la clave de un objeto
  operaciones = 300,
  porLista = 20, -- operaciones de un tipo en un grupo
}
TextoGrupos.LIMITES = LIMITES

local function msg(clave, ...)
  local L = SNF.L
  if L and L.t then
    return L.t(clave, ...)
  end
  return clave
end

local ERRORES = {
  vacio = "TEXTOGRUPOS_ERR_VACIO",
  roto = "TEXTOGRUPOS_ERR_ROTO",
  otraVersion = "TEXTOGRUPOS_ERR_VERSION",
  tsm = "TEXTOGRUPOS_ERR_TSM",
  grande = "TEXTOGRUPOS_ERR_GRANDE",
  destino = "TEXTOGRUPOS_ERR_DESTINO",
  fallo = "TEXTOGRUPOS_ERR_FALLO",
  noExiste = "TEXTOGRUPOS_ERR_NOEXISTE",
  nada = "TEXTOGRUPOS_ERR_NADA",
  comando = "PRINCIPAL_GRUPOS_NOMBRE_COMANDO",
}

local function fallar(codigo)
  return nil, msg(ERRORES[codigo] or ERRORES.roto), codigo
end

---------------------------------------------------------------------------------------------------
-- Base64 (el alfabeto estándar, con relleno «=»). Solo aritmética: Lua 5.1 no tiene operaciones de bits.
---------------------------------------------------------------------------------------------------

local ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local DECODIFICA = {}
for i = 1, #ALFABETO do
  DECODIFICA[string.byte(ALFABETO, i)] = i - 1
end

local function aBase64(datos)
  local salida = {}
  local largo = #datos
  local i = 1
  while i <= largo do
    local a, b, c = string.byte(datos, i, i + 2)
    local n = a * 65536 + (b or 0) * 256 + (c or 0)
    local c1 = math.floor(n / 262144)
    local c2 = math.floor(n / 4096) % 64
    local c3 = math.floor(n / 64) % 64
    local c4 = n % 64
    salida[#salida + 1] = string.sub(ALFABETO, c1 + 1, c1 + 1) .. string.sub(ALFABETO, c2 + 1, c2 + 1)
      .. (b and string.sub(ALFABETO, c3 + 1, c3 + 1) or "=") .. (c and string.sub(ALFABETO, c4 + 1, c4 + 1) or "=")
    i = i + 3
  end
  return table.concat(salida)
end

-- Estricto: solo el alfabeto, el relleno al final y el largo múltiplo de 4. nil si algo no cuadra.
local function deBase64(texto)
  local largo = #texto
  if largo % 4 ~= 0 or not string.find(texto, "^[A-Za-z0-9+/]*=?=?$") then
    return nil
  end
  local salida = {}
  local i = 1
  while i <= largo do
    local a, b, c, d = string.byte(texto, i, i + 3)
    local relleno = 0
    if d == 61 then
      relleno = 1
      d = 65
    end
    if c == 61 then
      relleno = 2
      c = 65
    end
    local n = DECODIFICA[a] * 262144 + DECODIFICA[b] * 4096 + DECODIFICA[c] * 64 + DECODIFICA[d]
    local x, y, z = math.floor(n / 65536), math.floor(n / 256) % 256, n % 256
    if relleno == 2 then
      salida[#salida + 1] = string.char(x)
    elseif relleno == 1 then
      salida[#salida + 1] = string.char(x, y)
    else
      salida[#salida + 1] = string.char(x, y, z)
    end
    i = i + 4
  end
  return table.concat(salida)
end

---------------------------------------------------------------------------------------------------
-- Serializador y lector. El lector no ejecuta nada: solo recorre el texto con topes (largo, anidado y cantidades).
---------------------------------------------------------------------------------------------------

local function ordenClaves(a, b)
  local ta, tb = type(a), type(b)
  if ta ~= tb then
    return ta == "number"
  end
  return a < b
end

local function escribir(v, salida, profundidad)
  local t = type(v)
  if t == "boolean" then
    salida[#salida + 1] = v and "T" or "F"
  elseif t == "number" then
    salida[#salida + 1] = "n" .. string.format("%.17g", v) .. ";"
  elseif t == "string" then
    salida[#salida + 1] = "s" .. #v .. ":" .. v
  elseif t == "table" and profundidad < 64 then
    local claves = {}
    for k in pairs(v) do
      claves[#claves + 1] = k
    end
    table.sort(claves, ordenClaves)
    salida[#salida + 1] = "t" .. #claves .. ":"
    for _, k in ipairs(claves) do
      escribir(k, salida, profundidad + 1)
      escribir(v[k], salida, profundidad + 1)
    end
  else
    error("valor que no se puede escribir")
  end
end

local function serializar(valor)
  local salida = {}
  escribir(valor, salida, 0)
  return table.concat(salida)
end

local function numeroValido(texto)
  if not (string.find(texto, "^%-?%d+%.?%d*$") or string.find(texto, "^%-?%d+%.?%d*[eE][%+%-]?%d+$")) then
    return nil
  end
  local n = tonumber(texto)
  if n == nil or n ~= n or n == math.huge or n == -math.huge then
    return nil
  end
  return n
end

-- Lee un valor en `pos`; devuelve el valor y la posición siguiente. Lo que no cuadra lanza el texto «roto» (se recoge en
-- desserializar con pcall; nunca llega fuera).
local function leerValor(s, pos, profundidad, estado)
  estado.nodos = estado.nodos + 1
  if estado.nodos > LIMITES.nodos then
    error("roto")
  end
  local marca = string.sub(s, pos, pos)
  if marca == "T" then
    return true, pos + 1
  elseif marca == "F" then
    return false, pos + 1
  elseif marca == "n" then
    local fin = string.find(s, ";", pos + 1, true)
    if not fin or fin - pos > 40 then
      error("roto")
    end
    local n = numeroValido(string.sub(s, pos + 1, fin - 1))
    if n == nil then
      error("roto")
    end
    return n, fin + 1
  elseif marca == "s" then
    local _, fin, cifras = string.find(s, "^(%d+):", pos + 1)
    if not fin or #cifras > 5 then
      error("roto")
    end
    local largo = tonumber(cifras)
    if largo > LIMITES.cadena or fin + largo > #s then
      error("roto")
    end
    return string.sub(s, fin + 1, fin + largo), fin + largo + 1
  elseif marca == "t" then
    if profundidad >= LIMITES.profundidad then
      error("roto")
    end
    local _, fin, cifras = string.find(s, "^(%d+):", pos + 1)
    if not fin or #cifras > 6 then
      error("roto")
    end
    local cuantas = tonumber(cifras)
    if cuantas > LIMITES.nodos then
      error("roto")
    end
    local tabla = {}
    local actual = fin + 1
    for _ = 1, cuantas do
      local clave, valor
      clave, actual = leerValor(s, actual, profundidad + 1, estado)
      if type(clave) ~= "string" and type(clave) ~= "number" then
        error("roto")
      end
      if tabla[clave] ~= nil then
        error("roto")
      end
      valor, actual = leerValor(s, actual, profundidad + 1, estado)
      tabla[clave] = valor
    end
    return tabla, actual
  end
  error("roto")
end

local function desserializar(s)
  local ok, valor, pos = pcall(leerValor, s, 1, 0, {nodos = 0})
  if not ok or pos ~= #s + 1 or type(valor) ~= "table" then
    return nil
  end
  return valor
end

---------------------------------------------------------------------------------------------------
-- Comprobaciones de los datos leídos (todo lo que llega es de fuera).
---------------------------------------------------------------------------------------------------

-- Quita los espacios de los lados en tiempo lineal (los patrones «%s+$» sin ancla al principio son cuadráticos).
local function recortar(texto)
  local desde = string.find(texto, "%S")
  if not desde then
    return ""
  end
  local hasta = #texto
  while hasta > desde and string.find(string.sub(texto, hasta, hasta), "%s") do
    hasta = hasta - 1
  end
  return string.sub(texto, desde, hasta)
end

local function sinControl(texto)
  return not string.find(texto, "%c")
end

local function esLista(t, tope)
  if type(t) ~= "table" then
    return false
  end
  local n = 0
  for k in pairs(t) do
    n = n + 1
    if type(k) ~= "number" or k < 1 or k ~= math.floor(k) then
      return false
    end
  end
  return n <= tope and n == #t
end

-- Una tabla cuyas claves están todas en `permitidas`.
local function soloClaves(t, permitidas)
  for k in pairs(t) do
    if not permitidas[k] then
      return false
    end
  end
  return true
end

local function claveObjeto(clave)
  return type(clave) == "string" and clave ~= "" and clave ~= ROTO and #clave <= LIMITES.clave and sinControl(clave)
end

local function nombreOperacion(n)
  return type(n) == "string" and n ~= "" and #n <= MAX_NOMBRE_OP and n ~= ROTO and sinControl(n)
    and not string.find(n, "^%s") and not string.find(n, "%s$")
end

-- Los niveles de una ruta, o nil si está mal formada.
local function niveles(ruta)
  if type(ruta) ~= "string" or ruta == "" then
    return nil
  end
  local lista, desde = {}, 1
  while true do
    local a = string.find(ruta, SEP, desde, true)
    local trozo = string.sub(ruta, desde, (a or #ruta + 1) - 1)
    if trozo == "" or #trozo > LIMITES.segmento or trozo == ROTO or not sinControl(trozo)
      or string.find(trozo, "^%s") or string.find(trozo, "%s$") then
      return nil
    end
    lista[#lista + 1] = trozo
    if not a then
      break
    end
    desde = a + 1
  end
  if #lista > LIMITES.niveles then
    return nil
  end
  return lista
end

local function formulaCompila(texto)
  local F = SNF.Formulas
  if not F or not F.compilar then
    return true
  end
  local ok, f = pcall(F.compilar, texto)
  return ok and f ~= nil and f ~= false
end

-- El valor de un campo listo para guardar, o nil si no vale (como Operaciones.poner). false es un valor.
local function valorCampo(def, valor)
  local t = def.tipo
  if t == "formula" then
    if type(valor) ~= "string" or #valor > LIMITES.cadena then
      return nil
    end
    local texto = recortar(valor)
    if texto == "" then
      return def.vacio and "" or nil
    end
    return formulaCompila(texto) and texto or nil
  elseif t == "numero" then
    if type(valor) ~= "number" or valor ~= valor or (def.min and valor < def.min) or (def.max and valor > def.max) then
      return nil
    end
    return valor
  elseif t == "sino" then
    if type(valor) ~= "boolean" then
      return nil
    end
    return valor
  elseif t == "lista" then
    if type(valor) == "number" then
      valor = tostring(valor)
    end
    for _, o in ipairs(def.opciones or {}) do
      if o.clave == valor then
        return valor
      end
    end
    return nil
  elseif t == "varios" then
    if not esLista(valor, 50) then
      return nil
    end
    local validas = {}
    for _, o in ipairs(def.opciones or {}) do
      validas[o.clave] = true
    end
    local vistas, salida = {}, {}
    for _, v in ipairs(valor) do
      if type(v) ~= "string" or not validas[v] then
        return nil
      end
      if not vistas[v] then
        vistas[v] = true
        salida[#salida + 1] = v
      end
    end
    table.sort(salida)
    return salida
  end
  return nil -- «texto» y lo desconocido: no se importa
end

local function igual(a, b)
  if type(a) ~= type(b) then
    return false
  end
  if type(a) ~= "table" then
    return a == b
  end
  local copiaA, copiaB = {}, {}
  for _, v in ipairs(a) do
    copiaA[#copiaA + 1] = v
  end
  for _, v in ipairs(b) do
    copiaB[#copiaB + 1] = v
  end
  table.sort(copiaA)
  table.sort(copiaB)
  if #copiaA ~= #copiaB then
    return false
  end
  for i = 1, #copiaA do
    if copiaA[i] ~= copiaB[i] then
      return false
    end
  end
  return true
end

-- Los campos propios de un tipo (sin los comunes ni los de texto: no viajan).
local function camposDe(tipo)
  local O = SNF.Operaciones
  local def = O and O.TIPOS and O.TIPOS[tipo]
  return def and def.campos or {}
end

local function defCampo(tipo, clave)
  local O = SNF.Operaciones
  local def = O and O.campo(tipo, clave)
  if def and not def.comun and def.tipo ~= "texto" then
    return def
  end
  return nil
end

local function validarOperaciones(crudas, validas)
  local salida, vistas = {}, {}
  if not esLista(crudas, LIMITES.operaciones) then
    return nil
  end
  for _, op in ipairs(crudas) do
    if type(op) ~= "table" or not soloClaves(op, {t = true, n = true, v = true, l = true}) then
      return nil
    end
    local tipo, nombre = op.t, op.n
    if type(tipo) ~= "string" or not SNF.Operaciones.TIPOS[tipo] or not nombreOperacion(nombre) then
      return nil
    end
    local id = tipo .. "|" .. nombre
    if vistas[id] then
      return nil
    end
    local nueva = {t = tipo, n = nombre, v = {}, l = {}}
    vistas[id] = nueva
    if op.v ~= nil then
      if type(op.v) ~= "table" then
        return nil
      end
      for clave, valor in pairs(op.v) do
        local def = type(clave) == "string" and defCampo(tipo, clave)
        local bueno = def and valorCampo(def, valor)
        if bueno == nil then
          return nil
        end
        nueva.v[clave] = bueno
      end
    end
    if op.l ~= nil then
      if type(op.l) ~= "table" then
        return nil
      end
      for clave, otra in pairs(op.l) do
        if type(clave) ~= "string" or not defCampo(tipo, clave) or not nombreOperacion(otra) or otra == nombre
          or nueva.v[clave] ~= nil then
          return nil
        end
        nueva.l[clave] = otra
      end
    end
    salida[#salida + 1] = nueva
  end
  -- Los vínculos van a operaciones que vienen en el texto, y sin ciclos.
  for _, op in ipairs(salida) do
    for clave, otra in pairs(op.l) do
      if not vistas[op.t .. "|" .. otra] then
        return nil
      end
    end
  end
  for _, op in ipairs(salida) do
    for clave in pairs(op.l) do
      local visto, actual = {}, op
      while actual and actual.l[clave] do
        if visto[actual.n] then
          return nil
        end
        visto[actual.n] = true
        actual = vistas[actual.t .. "|" .. actual.l[clave]]
      end
    end
  end
  for id, op in pairs(vistas) do
    validas[id] = op
  end
  return salida
end

-- Los datos comprobados y copiados (tabla nueva), o nil y el código del fallo.
local function validar(crudos)
  if type(crudos) ~= "table" or not SNF.Operaciones or not SNF.Arbol then
    return nil, "roto"
  end
  if crudos.v ~= VERSION then
    return nil, type(crudos.v) == "number" and "otraVersion" or "roto"
  end
  if not soloClaves(crudos, {v = true, g = true, p = true}) or not esLista(crudos.g, LIMITES.grupos) then
    return nil, "roto"
  end
  local porId = {}
  local ops = validarOperaciones(crudos.p == nil and {} or crudos.p, porId)
  if not ops then
    return nil, "roto"
  end
  local grupos, vistos, claves, total = {}, {}, {}, 0
  for _, g in ipairs(crudos.g) do
    if type(g) ~= "table" or not soloClaves(g, {r = true, o = true, a = true}) then
      return nil, "roto"
    end
    local partes = niveles(g.r)
    if not partes or vistos[g.r] then
      return nil, "roto"
    end
    for _, trozo in ipairs(partes) do
      if SNF.Arbol.pareceComando(trozo) then
        return nil, "comando"
      end
    end
    if #partes > 1 then
      local padre = table.concat(partes, SEP, 1, #partes - 1)
      if not vistos[padre] then
        return nil, "roto" -- el padre va antes
      end
    end
    vistos[g.r] = true
    local nuevo = {r = g.r, o = {}, a = {}}
    if g.o ~= nil then
      if not esLista(g.o, LIMITES.objetos) then
        return nil, "roto"
      end
      for _, clave in ipairs(g.o) do
        if not claveObjeto(clave) or claves[clave] then
          return nil, "roto"
        end
        claves[clave] = true
        total = total + 1
        if total > LIMITES.objetos then
          return nil, "roto"
        end
        nuevo.o[#nuevo.o + 1] = clave
      end
    end
    if g.a ~= nil then
      if type(g.a) ~= "table" then
        return nil, "roto"
      end
      for tipo, lista in pairs(g.a) do
        local def = type(tipo) == "string" and SNF.Operaciones.TIPOS[tipo]
        if not def or not esLista(lista, LIMITES.porLista) or (def.una and #lista > 1) then
          return nil, "roto"
        end
        local propia, repetidas = {}, {}
        for _, nombre in ipairs(lista) do
          if not nombreOperacion(nombre) or not porId[tipo .. "|" .. nombre] or repetidas[nombre] then
            return nil, "roto"
          end
          repetidas[nombre] = true
          propia[#propia + 1] = nombre
        end
        nuevo.a[tipo] = propia
      end
    end
    grupos[#grupos + 1] = nuevo
  end
  return {v = VERSION, g = grupos, p = ops}
end

---------------------------------------------------------------------------------------------------
-- Exportar.
---------------------------------------------------------------------------------------------------

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

local function dentroDe(ruta, base)
  return base == "" or ruta == base or string.sub(ruta, 1, #base + #SEP) == base .. SEP
end

function TextoGrupos.exportar(ruta)
  local A, O = SNF.Arbol, SNF.Operaciones
  if ruta == nil then
    ruta = ""
  end
  if type(ruta) ~= "string" or not A or not O then
    return fallar("fallo")
  end
  if not A.existe(ruta) then
    return fallar("noExiste")
  end
  local padre = padreDe(ruta)
  local grupos, usadas, incluidos = {}, {}, {}
  for _, r in ipairs(A.ordenadas()) do
    local relativa = padre == "" and r or string.sub(r, #padre + #SEP + 1)
    local partes = r ~= "" and dentroDe(r, ruta) and niveles(relativa)
    -- Lo que el lector no aceptaría (nombres con caracteres de control, larguísimos...) se deja fuera, con sus subgrupos.
    if partes and (#partes == 1 or incluidos[table.concat(partes, SEP, 1, #partes - 1)]) then
      incluidos[relativa] = true
      local g = {r = relativa}
      local objetos = {}
      for _, clave in ipairs(A.objetos(r)) do
        if claveObjeto(clave) then
          objetos[#objetos + 1] = clave
        end
      end
      if #objetos > 0 then
        g.o = objetos
      end
      local propias
      for _, tipo in ipairs(O.ORDEN) do
        local nombres, heredada = O.deGrupo(r, tipo)
        if heredada == nil then -- override propio (aunque esté vacío)
          propias = propias or {}
          propias[tipo] = nombres
          for _, n in ipairs(nombres) do
            usadas[tipo .. "|" .. n] = {tipo, n}
          end
        end
      end
      g.a = propias
      grupos[#grupos + 1] = g
    end
  end
  if #grupos == 0 then
    return fallar("nada")
  end
  -- Las operaciones usadas y, siguiendo los vínculos, las que ellas usan.
  local pendientes, hechas, ops = {}, {}, {}
  for id, par in pairs(usadas) do
    pendientes[#pendientes + 1] = par
    hechas[id] = true
  end
  local i = 1
  while pendientes[i] do
    local tipo, nombre = pendientes[i][1], pendientes[i][2]
    i = i + 1
    local op = {t = tipo, n = nombre, v = {}, l = {}}
    for _, def in ipairs(camposDe(tipo)) do
      if def.tipo ~= "texto" then
        local otra = O.vinculo(tipo, nombre, def.clave)
        if otra then
          op.l[def.clave] = otra
          if not hechas[tipo .. "|" .. otra] then
            hechas[tipo .. "|" .. otra] = true
            pendientes[#pendientes + 1] = {tipo, otra}
          end
        else
          local valor = O.valor(tipo, nombre, def.clave)
          if valor ~= nil and not igual(valor, def.defecto) then
            op.v[def.clave] = valor
          end
        end
      end
    end
    if next(op.v) == nil then
      op.v = nil
    end
    ops[#ops + 1] = op
  end
  -- Un ciclo de vínculos no se puede leer: se corta donde se cierra (el campo vuelve a su valor por defecto).
  local porId = {}
  for _, op in ipairs(ops) do
    porId[op.t .. "|" .. op.n] = op
  end
  for _, op in ipairs(ops) do
    for clave in pairs(op.l) do
      local visto, actual = {}, op
      while actual and actual.l[clave] do
        if visto[actual.n] then
          actual.l[clave] = nil
          break
        end
        visto[actual.n] = true
        actual = porId[actual.t .. "|" .. actual.l[clave]]
      end
    end
  end
  local orden = {}
  for k, tipo in ipairs(O.ORDEN) do
    orden[tipo] = k
  end
  table.sort(ops, function(a, b)
    if a.t ~= b.t then
      return (orden[a.t] or 99) < (orden[b.t] or 99)
    end
    return a.n < b.n
  end)
  for _, op in ipairs(ops) do
    if next(op.l) == nil then
      op.l = nil
    end
  end
  if #grupos > LIMITES.grupos or #ops > LIMITES.operaciones then
    return fallar("grande")
  end
  local ok, texto = pcall(function()
    return CABECERA .. aBase64(serializar({v = VERSION, g = grupos, p = ops}))
  end)
  if not ok or #texto > LIMITES.texto then
    return fallar("grande")
  end
  return texto
end

---------------------------------------------------------------------------------------------------
-- Leer.
---------------------------------------------------------------------------------------------------

-- Keep import-only diagnostics out of the persisted, validated group schema.
local itemImportDiagnostics = setmetatable({}, {__mode = "k"})

-- Preserve supported qualified keys as opaque identities. A variant or pet must
-- never end up in a different group by silently dropping its qualifier.
local function plainItemKey(token)
  if #token > LIMITES.clave then return nil end
  local kind, id, suffix = token:match("^([ip]):(%d+)(.*)$")
  if not kind then
    kind, id, suffix = "i", token:match("^(%d+)$"), ""
  end
  local number = id and #id <= 10 and tonumber(id)
  if not number or number < 1 or number > 2147483647 then return nil end
  if suffix ~= "" then
    if kind == "p" then
      if not suffix:match("^:%d+:%d+$") then return nil end
    else
      local qualifier = suffix:match("^::(.+)$")
      if not qualifier then return nil end
      if not qualifier:match("^r%d+$") then
        if not qualifier:match("^%d[%d:]*$") or qualifier:sub(-1) == ":"
          or qualifier:find("::", 1, true) then return nil end
      end
    end
  end
  return kind .. ":" .. number .. suffix
end

local function readItemList(source)
  local groups, routes, seen = {}, {}, {}
  local route, unread, total = nil, 0, 0
  local function groupAt(path)
    local parts = niveles(path:gsub("/", SEP))
    if not parts then return nil end
    local joined = ""
    for _, part in ipairs(parts) do
      joined = joined == "" and part or (joined .. SEP .. part)
      if not routes[joined] then
        if #groups >= LIMITES.grupos then return nil end
        local group = {r = joined, o = {}}
        routes[joined], groups[#groups + 1] = group, group
      end
    end
    return routes[joined]
  end
  local function item(token)
    local key = plainItemKey(token)
    total = total + 1
    if total > LIMITES.objetos then return false end
    if not key then
      unread = unread + 1
      return true
    end
    if not seen[key] then
      route = route or groupAt(msg("TEXTOGRUPOS_IMPORTED_GROUP"))
      if not route then return false end
      route.o[#route.o + 1], seen[key] = key, true
    end
    return true
  end
  local function tokens(text)
    for token in text:gmatch("[^,\r\n]+") do
      token = recortar(token)
      local name = token:match("^group:(.+)$")
      if name then
        route = groupAt(recortar(name))
        if not route then return false end
      elseif token ~= "" and not item(token) then
        return false
      end
    end
    return true
  end
  if source:sub(1, 1) == "^" then
    if source:match("^%^%d+%^") then return nil end
    local chunks = {}
    for chunk in source:gmatch("%^([^%^]+)") do
      chunks[#chunks + 1] = chunk
      if #chunks > LIMITES.grupos * 2 then return nil end
    end
    if #chunks == 0 or #chunks % 2 ~= 0 then return nil end
    for i = 1, #chunks, 2 do
      route = groupAt(recortar(chunks[i]))
      if not route or not tokens(chunks[i + 1]) then return nil end
    end
  elseif source:match("^group:") or source:match("^[ip]:%d") or source:match("^%d[%d,%s]*$") then
    if not tokens(source) then return nil end
  else
    return nil
  end
  if next(seen) == nil then return nil end
  return {v = VERSION, g = groups, p = {}}, unread
end

---------------------------------------------------------------------------------------------------
-- Exportaciones de grupos de TSM (la cadena que se copia de la web o de «Exportar» en TSM).
--
-- La cadena es LibDeflate:EncodeForPrint(LibDeflate:CompressDeflate(LibSerialize:Serialize(...))). Aquí se deshace todo
-- sin librerías ni código ajeno: el alfabeto de 64 caracteres se descodifica a mano, la descompresión la hace el cliente
-- (C_EncodingUtil.DecompressString, deflate sin cabecera) y el formato de LibSerialize (versión 1) se lee con un lector
-- propio que nunca ejecuta nada, con topes de nodos, anidado y largo, y comprueba cada tipo.
-- Los valores son, en orden: «TSM_EXPORT», la versión (1), el nombre del grupo exportado, {clave de objeto = ruta relativa},
-- {ruta relativa = true}, las operaciones de cada grupo, las operaciones y las fuentes propias. SOLO se usan los grupos y
-- los objetos: SnetForever usa sus propias operaciones (Alain, 26-11). La ruta «» es el grupo exportado.
-- Medido con una exportación real de «WoW Forever» (26-11): 42.340 caracteres, 102.724 bytes descomprimidos, 193 grupos,
-- 8.701 objetos.
---------------------------------------------------------------------------------------------------

local TSM_ALFABETO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()"
local TSM_VALOR = {}
for i = 1, #TSM_ALFABETO do
  TSM_VALOR[string.byte(TSM_ALFABETO, i)] = i - 1
end
local TSM_BYTES = 4000000 -- descomprimidos
local TSM_NODOS = 400000
local TSM_PROFUNDIDAD = 12

local function pareceExportacionTSM(texto)
  return #texto >= 16 and string.find(texto, "^[%w%(%)]+$") ~= nil
end

-- LibDeflate:DecodeForPrint: de 4 en 4 caracteres, 3 bytes (6 bits por carácter, el primero el más bajo).
local function deImprimible(texto)
  local partes, n, i = {}, #texto, 1
  local byte, char, floor = string.byte, string.char, math.floor
  while i + 3 <= n do
    local a, b, c, d = TSM_VALOR[byte(texto, i)], TSM_VALOR[byte(texto, i + 1)], TSM_VALOR[byte(texto, i + 2)],
      TSM_VALOR[byte(texto, i + 3)]
    if not (a and b and c and d) then
      return nil
    end
    local v = a + b * 64 + c * 4096 + d * 262144
    partes[#partes + 1] = char(v % 256, floor(v / 256) % 256, floor(v / 65536))
    i = i + 4
  end
  local cache, bits = 0, 0
  while i <= n do
    local x = TSM_VALOR[byte(texto, i)]
    if not x then
      return nil
    end
    cache = cache + x * 2 ^ bits
    bits = bits + 6
    i = i + 1
  end
  while bits >= 8 do
    partes[#partes + 1] = char(cache % 256)
    cache = floor(cache / 256)
    bits = bits - 8
  end
  return table.concat(partes)
end

local function descomprimirTSM(binario)
  local util = rawget(_G, "C_EncodingUtil")
  if type(util) ~= "table" or type(util.DecompressString) ~= "function" then
    return nil
  end
  -- Enum.CompressionMethod.Deflate es 0 (deflate sin cabecera) en wow-ui-source; si el cliente no trae el Enum, 0.
  local enum = rawget(_G, "Enum")
  local metodos = type(enum) == "table" and rawget(enum, "CompressionMethod")
  local metodo = type(metodos) == "table" and metodos.Deflate or 0
  local ok, crudo = pcall(util.DecompressString, binario, metodo)
  if ok and type(crudo) == "string" and #crudo <= TSM_BYTES then
    return crudo
  end
  return nil
end

-- Un double de 8 bytes en orden de red (big-endian), sin operaciones de bits.
local function dobleDe(s, p)
  local b1, b2, b3, b4, b5, b6, b7, b8 = string.byte(s, p, p + 7)
  local signo = b1 >= 128 and -1 or 1
  local exponente = (b1 % 128) * 16 + math.floor(b2 / 16)
  local mantisa = ((((((b2 % 16) * 256 + b3) * 256 + b4) * 256 + b5) * 256 + b6) * 256 + b7) * 256 + b8
  if exponente == 0 then
    return signo * mantisa * 2 ^ -1074
  elseif exponente == 2047 then
    error("numero")
  end
  return signo * (1 + mantisa / 2 ^ 52) * 2 ^ (exponente - 1023)
end

-- Lector de LibSerialize (versión 1). Lanza error si algo no cuadra (lo recoge un pcall).
local function leerLibSerialize(s)
  local p, nodos = 1, 0
  local cadenas, tablas = {}, {}
  local byte, sub, floor = string.byte, string.sub, math.floor
  local function uno()
    local v = byte(s, p)
    if not v then
      error("corto")
    end
    p = p + 1
    return v
  end
  local function entero(n)
    local v = 0
    for _ = 1, n do
      v = v * 256 + uno()
    end
    return v
  end
  local function texto(n)
    if n > LIMITES.cadena * 50 or p + n - 1 > #s then
      error("cadena")
    end
    local v = sub(s, p, p + n - 1)
    p = p + n
    if n > 2 then
      cadenas[#cadenas + 1] = v
    end
    return v
  end
  local objeto
  local function tabla(nPares, nLista, nivel, t)
    if not t then
      t = {}
      tablas[#tablas + 1] = t
    end
    if nivel > TSM_PROFUNDIDAD then
      error("hondo")
    end
    for i = 1, nLista do
      t[i] = objeto(nivel + 1)
    end
    for _ = 1, nPares do
      local k = objeto(nivel + 1)
      local v = objeto(nivel + 1)
      if k == nil or type(k) == "table" or k ~= k then
        error("clave")
      end
      t[k] = v
    end
    return t
  end
  objeto = function(nivel)
    nodos = nodos + 1
    if nodos > TSM_NODOS then
      error("grande")
    end
    local v = uno()
    if v % 2 == 1 then
      return (v - 1) / 2
    end
    if v % 4 == 2 then
      local tipo = (v - 2) / 4
      local cuenta = floor(tipo / 4)
      tipo = tipo % 4
      if tipo == 0 then
        return texto(cuenta)
      elseif tipo == 1 then
        return tabla(cuenta, 0, nivel)
      elseif tipo == 2 then
        return tabla(0, cuenta, nivel)
      end
      return tabla(floor(cuenta / 4) + 1, cuenta % 4 + 1, nivel)
    end
    if v % 8 == 4 then
      local junto = uno() * 256 + v
      if v % 16 == 12 then
        return -(junto - 12) / 16
      end
      return (junto - 4) / 16
    end
    local t = v / 8
    if t == 0 then
      return nil
    elseif t <= 8 then
      local largo = ({2, 2, 3, 3, 4, 4, 7, 7})[t]
      local x = entero(largo)
      return t % 2 == 1 and x or -x
    elseif t == 9 then
      if p + 7 > #s then
        error("corto")
      end
      local x = dobleDe(s, p)
      p = p + 8
      return x
    elseif t == 10 or t == 11 then
      local x = tonumber(texto(uno()))
      if not x then
        error("numero")
      end
      return t == 10 and x or -x
    elseif t == 12 then
      return true
    elseif t == 13 then
      return false
    elseif t >= 14 and t <= 16 then
      return texto(entero(t - 13))
    elseif t >= 17 and t <= 19 then
      return tabla(entero(t - 16), 0, nivel)
    elseif t >= 20 and t <= 22 then
      return tabla(0, entero(t - 19), nivel)
    elseif t >= 23 and t <= 25 then
      local nLista = entero(t - 22)
      return tabla(entero(t - 22), nLista, nivel)
    elseif t >= 26 and t <= 28 then
      local x = cadenas[entero(t - 25)]
      if x == nil then
        error("ref")
      end
      return x
    elseif t >= 29 and t <= 31 then
      local x = tablas[entero(t - 28)]
      if x == nil then
        error("ref")
      end
      return x
    end
    error("tipo")
  end
  if uno() ~= 1 then
    error("version")
  end
  local valores = {}
  while p <= #s do
    valores[#valores + 1] = objeto(1)
    if #valores > 16 then
      error("grande")
    end
  end
  return valores
end

-- La exportación de TSM a nuestros datos ({v, g, p = {}}) y cuántos objetos no se entendieron; nil si no es una.
local function readTsmExport(source)
  if not pareceExportacionTSM(source) then
    return nil
  end
  local binario = deImprimible(source)
  local crudo = binario and descomprimirTSM(binario)
  if not crudo then
    return nil
  end
  local ok, v = pcall(leerLibSerialize, crudo)
  if not ok or type(v) ~= "table" or v[1] ~= "TSM_EXPORT" or type(v[3]) ~= "string" or type(v[4]) ~= "table" then
    return nil
  end
  local nombre = recortar(string.gsub(v[3], SEP, " "))
  if nombre == "" then
    nombre = msg("TEXTOGRUPOS_IMPORTED_GROUP")
  end
  local grupos, rutas = {}, {}
  local function grupoEn(relativa)
    local completa = relativa == "" and nombre or (nombre .. SEP .. relativa)
    local partes = niveles(completa)
    if not partes then
      return nil
    end
    local unida = ""
    for _, parte in ipairs(partes) do
      unida = unida == "" and parte or (unida .. SEP .. parte)
      if not rutas[unida] then
        if #grupos >= LIMITES.grupos then
          return nil
        end
        local g = {r = unida, o = {}}
        rutas[unida], grupos[#grupos + 1] = g, g
      end
    end
    return rutas[unida]
  end
  if not grupoEn("") then
    return nil
  end
  -- Los grupos vacíos también (ordenados, así cada padre va antes que sus hijos).
  local lista = {}
  if type(v[5]) == "table" then
    for ruta in pairs(v[5]) do
      if type(ruta) == "string" then
        lista[#lista + 1] = ruta
      end
    end
  end
  table.sort(lista)
  for _, ruta in ipairs(lista) do
    grupoEn(ruta) -- una ruta que no vale se salta: sus objetos irán al grupo exportado
  end
  local claves, unread, total = {}, 0, 0
  for clave in pairs(v[4]) do
    if type(clave) == "string" then
      claves[#claves + 1] = clave
    else
      unread = unread + 1
    end
  end
  table.sort(claves)
  for _, clave in ipairs(claves) do
    total = total + 1
    if total > LIMITES.objetos then
      return nil
    end
    local key = plainItemKey(clave)
    local relativa = v[4][clave]
    local g = key and (type(relativa) == "string" and grupoEn(relativa) or rutas[nombre])
    if g then
      g.o[#g.o + 1] = key
    else
      unread = unread + 1
    end
  end
  return {v = VERSION, g = grupos, p = {}}, unread
end

-- Recognize opaque formats so the UI can explain which input it accepts.
local function pareceTSM(texto)
  return string.sub(texto, 1, 1) == "^" or string.find(texto, "^[ip]:%d") ~= nil or string.find(texto, "[,%^][ip]:%d") ~= nil
    or string.find(texto, "^!TSM:") ~= nil or string.find(texto, "^group:") ~= nil
    or string.find(texto, "^return%s*[%{%(]") ~= nil or string.find(texto, "^[%[%{]") ~= nil
    or pareceExportacionTSM(texto)
end

function TextoGrupos.leer(texto)
  if type(texto) ~= "string" then
    return fallar("vacio")
  end
  if #texto > LIMITES.texto + 1000 then -- antes de tocarlo: un texto enorme no se recorre
    return fallar("grande")
  end
  texto = recortar(texto)
  if texto == "" then
    return fallar("vacio")
  end
  if #texto > LIMITES.texto then
    return fallar("grande")
  end
  local version = string.match(texto, "^SNF(%d+):")
  if not version then
    local raw, unread = readItemList(texto)
    if not raw then
      raw, unread = readTsmExport(texto)
    end
    if raw then
      local groups, code = validar(raw)
      if not groups then return fallar(code) end
      itemImportDiagnostics[groups] = unread
      return groups
    end
    if pareceTSM(texto) then
      return fallar("tsm")
    end
    return fallar("roto")
  end
  if tonumber(version) ~= VERSION then
    return fallar("otraVersion")
  end
  local cuerpo = string.gsub(string.sub(texto, #CABECERA + 1), "%s", "")
  local okB, binario = pcall(deBase64, cuerpo)
  if not okB or not binario or #binario > LIMITES.bytes then
    return fallar("roto")
  end
  local crudo = desserializar(binario)
  if not crudo then
    return fallar("roto")
  end
  local ok, datos, codigo = pcall(validar, crudo)
  if not ok or not datos then
    return fallar(ok and codigo or "roto")
  end
  return datos
end

function TextoGrupos.resumen(datos)
  local salida = {grupos = 0, objetos = 0, operaciones = 0, enOtroGrupo = 0}
  if type(datos) == "table" and itemImportDiagnostics[datos] then
    salida.noReconocidos = itemImportDiagnostics[datos]
  end
  local ok, bueno = pcall(validar, datos)
  if not ok or not bueno then
    return salida
  end
  local A = SNF.Arbol
  salida.grupos, salida.operaciones = #bueno.g, #bueno.p
  for _, g in ipairs(bueno.g) do
    for _, clave in ipairs(g.o) do
      salida.objetos = salida.objetos + 1
      local donde = A.objeto(clave)
      if donde ~= nil and donde ~= "" then
        salida.enOtroGrupo = salida.enOtroGrupo + 1
      end
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Importar.
---------------------------------------------------------------------------------------------------

local function recortarUtf8(texto, largo)
  if #texto <= largo then
    return texto
  end
  local corte = largo
  while corte > 0 do
    local b = string.byte(texto, corte + 1)
    if b and b >= 0x80 and b < 0xC0 then
      corte = corte - 1
    else
      break
    end
  end
  return string.sub(texto, 1, corte)
end

-- ¿La operación que ya existe tiene los mismos campos que la que viene? `enlaces` son los vínculos ya con los nombres finales.
local function operacionIgual(tipo, existente, op, enlaces)
  local O = SNF.Operaciones
  for _, def in ipairs(camposDe(tipo)) do
    if def.tipo ~= "texto" then
      local suyo = O.vinculo(tipo, existente, def.clave)
      local nuevo = enlaces[def.clave]
      if suyo ~= nuevo then
        return false
      end
      if not nuevo then
        local a = O.valor(tipo, existente, def.clave)
        local b = op.v[def.clave]
        if b == nil then
          b = def.defecto
        end
        if not igual(a, b) then
          return false
        end
      end
    end
  end
  return true
end

-- Decide, sin tocar nada, qué hacer con cada operación: usar la que hay o crear una con su nombre o con uno libre.
local function planearOperaciones(datos)
  local O = SNF.Operaciones
  local porId, finales, plan, reservados, importados = {}, {}, {}, {}, {}
  for _, op in ipairs(datos.p) do
    porId[op.t .. "|" .. op.n] = op
    importados[op.t .. "|" .. op.n] = true
  end
  local function resolver(op)
    local id = op.t .. "|" .. op.n
    if finales[id] then
      return finales[id]
    end
    local enlaces = {}
    for clave, otra in pairs(op.l) do
      enlaces[clave] = resolver(porId[op.t .. "|" .. otra])
    end
    local final, accion
    if not O.existe(op.t, op.n) then
      final, accion = op.n, "nueva"
    elseif operacionIgual(op.t, op.n, op, enlaces) then
      final, accion = op.n, "reutilizar"
    else
      -- «X 2», «X 3»...: el primero libre; y si ya hay uno con todos los campos iguales (de una importación anterior), ese.
      accion = "renombrada"
      local k = 2
      while true do
        local sufijo = " " .. k
        local candidato = recortarUtf8(op.n, MAX_NOMBRE_OP - #sufijo) .. sufijo
        local clave = op.t .. "|" .. candidato
        if not importados[clave] and not reservados[clave] then
          if not O.existe(op.t, candidato) then
            final = candidato
            break
          elseif operacionIgual(op.t, candidato, op, enlaces) then
            final, accion = candidato, "reutilizar"
            break
          end
        end
        k = k + 1
      end
    end
    reservados[op.t .. "|" .. final] = true
    finales[id] = final
    plan[#plan + 1] = {op = op, final = final, accion = accion, enlaces = enlaces}
    return final
  end
  for _, op in ipairs(datos.p) do
    resolver(op)
  end
  return plan, finales
end

local function unir(padre, nombre)
  if padre == "" then
    return nombre
  end
  return padre .. SEP .. nombre
end

function TextoGrupos.importar(datos, opciones)
  local A, O = SNF.Arbol, SNF.Operaciones
  opciones = type(opciones) == "table" and opciones or {}
  local destino = opciones.destino
  if destino == nil then
    destino = ""
  end
  local mover = opciones.moverObjetos == true
  local bueno, codigo = validar(datos)
  if not bueno then
    return fallar(codigo)
  end
  if type(destino) ~= "string" or not A.existe(destino) then
    return fallar("destino")
  end

  -- Planear (no se toca nada).
  local plan, finales = planearOperaciones(bueno)
  local usados = {}
  for _, h in ipairs(A.hijos(destino)) do
    usados[string.sub(h, #destino + (destino == "" and 1 or #SEP + 1))] = true
  end
  local rutas, arriba = {}, {}
  for _, g in ipairs(bueno.g) do
    local ultimo = string.match(g.r, "([^" .. SEP .. "]*)$")
    local padreRel = padreDe(g.r)
    if padreRel == "" then
      local nombre, k = ultimo, 2
      while usados[nombre] do
        nombre = ultimo .. " " .. k
        k = k + 1
      end
      usados[nombre] = true
      rutas[g.r] = unir(destino, nombre)
      arriba[#arriba + 1] = rutas[g.r]
    else
      rutas[g.r] = unir(rutas[padreRel], ultimo)
    end
  end
  local colocar, quedan = {}, 0
  for _, g in ipairs(bueno.g) do
    for _, clave in ipairs(g.o) do
      local donde = A.objeto(clave)
      if donde ~= nil and donde ~= "" and not mover then
        quedan = quedan + 1
      else
        colocar[#colocar + 1] = {clave, rutas[g.r], donde}
      end
    end
  end

  -- Aplicar; si algo falla se deshace lo hecho.
  local deshacer = {}
  local function hecho(f)
    deshacer[#deshacer + 1] = f
  end
  local function aplicar()
    local nuevas, reutilizadas, renombradas = 0, 0, 0
    for _, p in ipairs(plan) do
      if p.accion == "reutilizar" then
        reutilizadas = reutilizadas + 1
      else
        if p.accion == "renombrada" then
          renombradas = renombradas + 1
        end
        nuevas = nuevas + 1
        if O.crear(p.op.t, p.final) ~= p.final then
          return false
        end
        hecho(function()
          O.borrar(p.op.t, p.final)
        end)
      end
    end
    for _, p in ipairs(plan) do
      if p.accion ~= "reutilizar" then
        for clave, valor in pairs(p.op.v) do
          if not O.poner(p.op.t, p.final, clave, valor) then
            return false
          end
        end
        for clave, otra in pairs(p.enlaces) do
          if not O.vincular(p.op.t, p.final, clave, otra) then
            return false
          end
        end
      end
    end
    for _, g in ipairs(bueno.g) do
      local ruta = rutas[g.r]
      local nombre = string.match(ruta, "([^" .. SEP .. "]*)$")
      if A.crear(padreDe(ruta), nombre) ~= ruta then
        return false
      end
      hecho(function()
        A.borrar(ruta)
      end)
      for tipo, lista in pairs(g.a) do
        local mapeadas = {}
        for _, n in ipairs(lista) do
          mapeadas[#mapeadas + 1] = finales[tipo .. "|" .. n]
        end
        if not O.ponerDeGrupo(ruta, tipo, mapeadas) then
          return false
        end
      end
    end
    for _, c in ipairs(colocar) do
      local clave, ruta, antes = c[1], c[2], c[3]
      if not A.poner(clave, ruta) then
        return false
      end
      hecho(function()
        if antes == nil then
          A.quitar(clave)
        else
          A.poner(clave, antes)
        end
      end)
    end
    return true, nuevas, reutilizadas, renombradas
  end
  local ok, bien, nuevas, reutilizadas, renombradas = pcall(aplicar)
  if not ok or not bien then
    for k = #deshacer, 1, -1 do
      pcall(deshacer[k])
    end
    return fallar("fallo")
  end
  return {
    grupos = #bueno.g, objetos = #colocar, operaciones = #bueno.p, nuevas = nuevas, reutilizadas = reutilizadas,
    renombradas = renombradas, quedan = quedan, rutas = arriba,
  }
end

-- Para las pruebas: el serializador y el base64 propios.
TextoGrupos.interno = {aBase64 = aBase64, deBase64 = deBase64, serializar = serializar, desserializar = desserializar}
