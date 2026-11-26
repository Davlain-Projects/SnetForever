-- Imitación de la API de WoW para el banco de pruebas de SnetForever. Se ejecuta en fengari (Lua 5.3).
-- Todo el estado del banco vive en la tabla global BANCO; src/maquina.js la maneja desde JS.
--
-- Regla del banco: lo que no está imitado da el error «no imitado: <nombre>»:
--   * una global que no existe (salvo las SavedVariables y lo quitado con sinApi, que valen nil);
--   * una función que no existe en un espacio de nombres (C_Timer.X);
--   * un método que no existe en un marco o región (las claves que empiezan por mayúscula son métodos de la API;
--     las que empiezan por minúscula son campos propios del addon y valen nil si no se han puesto);
--   * un tipo de marco, una plantilla, un script o un evento que el banco no conoce.
-- Cada tarea añade al banco lo que use, con un comentario que diga de dónde sale el comportamiento (plano o wowpedia).
--
-- TRAMPA: en fengari los enteros son de 32 bits y desbordan en silencio; en WoW (Lua 5.1) todo son doubles.
--   2147483647 + 1 da -2147483648, 65536 * 65536 da 0 y string.format("%d", 8589934770) falla
--   («number has no integer representation»). Un literal que no cabe en 32 bits (8589934770) es decimal y va bien.
--   Por eso las máscaras de raza/clase se comprueban solo con 2^k, /, math.floor y % (por ejemplo
--   math.floor(mascara / 2 ^ k) % 2 == 1), nunca acumulando con * entre enteros, y ningún valor >= 2^31 se
--   formatea con %d. fengari no tiene ninguna opción para usar solo decimales (LUA_MAXINTEGER está fijo en
--   src/luaconf.js; FENGARICONF solo cambia LUA_COMPAT_FLOATSTRING, LUAI_MAXSTACK, LUA_IDSIZE y LUAL_BUFFERSIZE).

BANCO = {
  PASO = 0.05,          -- segundos de cada salto del tiempo falso
  TIEMPO_BASE = 1000,   -- GetTime() al empezar
  tick = 0,             -- saltos dados desde el principio
  errores = {},         -- mensajes que han llegado a geterrorhandler()
  trazas = {},          -- traza de cada error, para el informe de las pruebas
  llamadas = {},        -- [api] = {{n = nº de argumentos, ...}, ...}
  cargados = {},        -- archivos del addon ejecutados, en orden
  tablasAddon = {},     -- [nombre del addon] = tabla privada que reciben sus archivos
  marcos = {},          -- marcos creados, en orden (para los OnUpdate)
  eventos = {},         -- [evento] = {marco, ...} en orden de registro
  temporizadores = {},  -- C_Timer pendientes
  permitidasNil = {},   -- globales que se pueden leer aunque valgan nil
  quitadas = {},        -- [espacio de nombres] = {[clave] = true}, lo quitado con sinApi
  jugador = nil,
  misiones = {},        -- [q] = {enDiario?, completa?, entregada?, objetivos?}
  objetos = {},         -- [id] = {cuenta, banco?, equipadoEn?}
}
local B = BANCO

-- Lo que el banco usa por dentro y se quita después de _G porque en WoW (Lua 5.1) no existe.
local unpack, pack, cargar, tipoNumero = table.unpack, table.pack, load, math.type
local traza = debug.traceback
local arcotangente = math.atan

---------------------------------------------------------------------------------------------------
-- Errores: geterrorhandler() y llamadas protegidas (como el cliente con los scripts y temporizadores).
---------------------------------------------------------------------------------------------------

-- Manejador por defecto: apunta el mensaje (wowpedia: geterrorhandler devuelve la función que recibe el error).
function B.manejador(mensaje)
  local texto = tostring(mensaje)
  B.errores[#B.errores + 1] = texto
  B.trazas[#B.trazas + 1] = B.trazaPendiente or traza(texto, 2)
  B.trazaPendiente = nil
end

function geterrorhandler()
  return B.manejador
end

local function conTraza(err)
  return {mensaje = err, traza = traza(tostring(err), 2)}
end

-- Llama a f(...); si falla, el error va a geterrorhandler() y no sube (así trata el cliente los scripts).
function B.proteger(f, ...)
  local r = pack(xpcall(f, conTraza, ...))
  if not r[1] then
    B.trazaPendiente = r[2].traza
    geterrorhandler()(r[2].mensaje)
    return false
  end
  return true, unpack(r, 2, r.n)
end

-- Apunta una llamada a una API para m.llamadas(api).
function B.anotar(api, ...)
  local lista = B.llamadas[api] or {}
  B.llamadas[api] = lista
  lista[#lista + 1] = {n = select("#", ...), ...}
end

---------------------------------------------------------------------------------------------------
-- Espacios de nombres estrictos (C_Timer, C_Map...) y sinApi.
---------------------------------------------------------------------------------------------------

function B.espacio(nombre, contenido)
  local t = contenido or {}
  local quitadas = {}
  B.quitadas[t] = quitadas
  setmetatable(t, {__index = function(_, clave)
    if quitadas[clave] then return nil end
    error("no imitado: " .. nombre .. "." .. tostring(clave), 2)
  end})
  rawset(_G, nombre, t)
  return t
end

function B.permitirNil(nombre)
  B.permitidasNil[nombre] = true
end

local estado -- [objeto] = estado del marco o región (se define abajo)

-- Quita una API, por ejemplo "Settings" o "C_Minimap.GetViewRadius". La ruta tiene que existir.
function B.quitarApi(ruta)
  local partes = {}
  for parte in string.gmatch(ruta, "[^.]+") do partes[#partes + 1] = parte end
  if #partes == 1 then
    if rawget(_G, ruta) == nil then error("sinApi: no existe " .. ruta, 2) end
    rawset(_G, ruta, nil)
    B.permitidasNil[ruta] = true
    return
  end
  local t = _G
  for i = 1, #partes - 1 do
    t = type(t) == "table" and rawget(t, partes[i]) or nil
  end
  local clave = partes[#partes]
  if type(t) ~= "table" then error("sinApi: no existe " .. ruta, 2) end
  if estado[t] then
    -- Un método de un marco: se marca como quitado en ese marco.
    local ok, valor = pcall(function() return t[clave] end)
    if not ok or valor == nil then error("sinApi: no existe " .. ruta, 2) end
    estado[t].quitados[clave] = true
    rawset(t, clave, nil)
    return
  end
  if rawget(t, clave) == nil then error("sinApi: no existe " .. ruta, 2) end
  rawset(t, clave, nil)
  if B.quitadas[t] then B.quitadas[t][clave] = true end
end

---------------------------------------------------------------------------------------------------
-- Marcos y regiones (wowpedia: UIOBJECT Region, Frame, Texture, FontString). Sin motor de anclas:
-- GetWidth/GetHeight devuelven lo puesto con SetSize/SetWidth/SetHeight.
---------------------------------------------------------------------------------------------------

estado = {}
B.estado = estado
B.clases = {}

local function nuevaClase(nombre, base)
  local metodos = {}
  if base then setmetatable(metodos, {__index = B.clases[base].metodos}) end
  local clase = {nombre = nombre, base = base, metodos = metodos}
  clase.meta = {__index = function(obj, clave)
    local e = estado[obj]
    if e and e.quitados[clave] then return nil end
    local m = metodos[clave]
    if m ~= nil then return m end
    if type(clave) == "string" and string.find(clave, "^%u") then
      error("no imitado: " .. clave, 2)
    end
    return nil
  end}
  B.clases[nombre] = clase
  return metodos
end

-- Estado de `obj` para el método `metodo`; falla si se llamó con . en vez de :.
local function E(obj, metodo)
  local e = estado[obj]
  if not e then error("uso: objeto:" .. metodo .. "(...) (¿. en vez de :?)", 3) end
  return e
end

local function nombreDe(obj)
  local e = estado[obj]
  return e.nombre or ("[" .. e.tipo .. "]")
end

local function esVisible(obj)
  local e = estado[obj]
  while e do
    if not e.mostrado then return false end
    e = e.padre and estado[e.padre]
  end
  return true
end

local function numero(valor, metodo, que)
  if type(valor) ~= "number" then
    error("uso: " .. metodo .. ": " .. que .. " tiene que ser un número", 3)
  end
  return valor
end

-- Resuelve un marco dado por objeto o por nombre global; nil se queda en nil.
local function resolver(valor, metodo)
  if valor == nil then return nil end
  if type(valor) == "string" then
    local obj = rawget(_G, valor)
    if not estado[obj] then error("uso: " .. metodo .. ": no hay ningún marco llamado " .. valor, 3) end
    return obj
  end
  if not estado[valor] then error("uso: " .. metodo .. ": se esperaba un marco o región", 3) end
  return valor
end

local function quitarDe(lista, valor)
  for i = #lista, 1, -1 do
    if lista[i] == valor then table.remove(lista, i) end
  end
end

local function ponerPadre(obj, padre)
  local e = estado[obj]
  if e.padre then quitarDe(estado[e.padre].hijos, obj) end
  e.padre = padre
  if padre then
    local hijos = estado[padre].hijos
    hijos[#hijos + 1] = obj
  end
end

-- Pruebas: métodos que los objetos que se creen desde ahora no tienen (como un cliente sin ellos), por nombre:
-- BANCO.sinMetodo("SetMouseClickEnabled"). Los de antes los siguen teniendo.
B.metodosQuitados = {}
function B.sinMetodo(nombre) B.metodosQuitados[nombre] = true end

local function crearObjeto(tipo, nombre, padre)
  if nombre ~= nil and type(nombre) ~= "string" then error("uso: el nombre tiene que ser texto", 3) end
  if nombre and padre and string.find(nombre, "$parent", 1, true) then
    nombre = string.gsub(nombre, "%$parent", estado[padre].nombre or "")
  end
  local obj = setmetatable({}, B.clases[tipo].meta)
  estado[obj] = {
    tipo = tipo, nombre = nombre, padre = nil, mostrado = true, puntos = {}, ancho = 0, alto = 0,
    escala = 1, alfa = 1, rotacion = 0, hijos = {}, scripts = {}, eventos = {}, quitados = {},
  }
  for metodo in pairs(B.metodosQuitados) do estado[obj].quitados[metodo] = true end
  if padre then ponerPadre(obj, padre) end
  if nombre then rawset(_G, nombre, obj) end
  return obj
end

local function descendientes(obj, lista)
  lista[#lista + 1] = obj
  for _, hijo in ipairs(estado[obj].hijos) do descendientes(hijo, lista) end
  return lista
end

-- Cambia el mostrado propio y lanza OnShow/OnHide en los marcos cuya visibilidad cambia (wowpedia: OnShow, OnHide).
local function cambiarMostrado(obj, valor)
  local e = estado[obj]
  if e.mostrado == valor then return end
  local afectados = descendientes(obj, {})
  local antes = {}
  for i, o in ipairs(afectados) do antes[i] = esVisible(o) end
  e.mostrado = valor
  for i, o in ipairs(afectados) do
    local ahora = esVisible(o)
    if ahora ~= antes[i] then
      local script = estado[o].scripts[ahora and "OnShow" or "OnHide"]
      if script then B.proteger(script, o) end
    end
  end
end

local PUNTOS = {
  TOPLEFT = true, TOP = true, TOPRIGHT = true, LEFT = true, CENTER = true, RIGHT = true,
  BOTTOMLEFT = true, BOTTOM = true, BOTTOMRIGHT = true,
}

local function punto(valor, metodo)
  local p = type(valor) == "string" and string.upper(valor) or nil
  if not PUNTOS[p] then error("uso: " .. metodo .. ": punto de anclaje no válido " .. tostring(valor), 3) end
  return p
end

-- Region: lo común a marcos, texturas y textos.
local R = nuevaClase("Region")

function R:GetName() return E(self, "GetName").nombre end
function R:GetObjectType() return E(self, "GetObjectType").tipo end
function R:IsObjectType(tipo)
  local clase = B.clases[E(self, "IsObjectType").tipo]
  while clase do
    if clase.nombre == tipo then return true end
    clase = clase.base and B.clases[clase.base]
  end
  return false
end
function R:GetParent() return E(self, "GetParent").padre end
function R:SetParent(padre)
  E(self, "SetParent")
  ponerPadre(self, resolver(padre, "SetParent"))
end
function R:Show() E(self, "Show"); cambiarMostrado(self, true) end
function R:Hide() E(self, "Hide"); cambiarMostrado(self, false) end
function R:SetShown(valor) E(self, "SetShown"); cambiarMostrado(self, not not valor) end
function R:IsShown() return E(self, "IsShown").mostrado end
function R:IsVisible() E(self, "IsVisible"); return esVisible(self) end

-- wowpedia: Region:SetPoint(point [, relativeTo [, relativePoint]] [, offsetX, offsetY]).
-- Sin relativeTo (o nil) se ancla al padre. Un segundo SetPoint con el mismo punto sustituye al primero.
function R:SetPoint(p, a, b, c, d)
  local e = E(self, "SetPoint")
  p = punto(p, "SetPoint")
  local relativo, relPunto, x, y
  if type(a) == "number" then
    relativo, relPunto, x, y = e.padre, p, a, b
  else
    relativo = a == nil and e.padre or resolver(a, "SetPoint")
    if type(b) == "number" then
      relPunto, x, y = p, b, c
    else
      relPunto, x, y = b == nil and p or punto(b, "SetPoint"), c, d
    end
  end
  if relativo == self then error("uso: SetPoint: un marco no se puede anclar a sí mismo", 2) end
  local nuevo = {punto = p, relativo = relativo, relPunto = relPunto, x = x or 0, y = y or 0}
  for i, existente in ipairs(e.puntos) do
    if existente.punto == p then e.puntos[i] = nuevo; return end
  end
  e.puntos[#e.puntos + 1] = nuevo
end
function R:SetAllPoints(relativo)
  local e = E(self, "SetAllPoints")
  relativo = relativo == nil and e.padre or resolver(relativo, "SetAllPoints")
  e.puntos = {
    {punto = "TOPLEFT", relativo = relativo, relPunto = "TOPLEFT", x = 0, y = 0},
    {punto = "BOTTOMRIGHT", relativo = relativo, relPunto = "BOTTOMRIGHT", x = 0, y = 0},
  }
end
function R:ClearAllPoints() E(self, "ClearAllPoints").puntos = {} end
function R:GetNumPoints() return #E(self, "GetNumPoints").puntos end
function R:GetPoint(i)
  local p = E(self, "GetPoint").puntos[i or 1]
  if not p then return nil end
  return p.punto, p.relativo, p.relPunto, p.x, p.y
end
-- GetLeft/GetRight/GetBottom/GetTop: ver la disposición mínima más abajo (rectAbsoluto), con la escala de cada marco.
-- Tarea 22 (error real en el juego): el cliente resuelve la disposición cuando alguien pregunta un tamaño (GetWidth...)
-- y entonces lanza los OnSizeChanged pendientes, aunque el marco esté a medio construir. Con
-- BANCO.disposicionDiferida = true el banco hace lo mismo: un cambio de tamaño queda pendiente y el siguiente
-- GetWidth/GetHeight/GetSize de cualquier región lanza el OnSizeChanged de los marcos con cambios pendientes.
local function cambiarTamano(e, ancho, alto)
  if e.ancho ~= ancho or e.alto ~= alto then e.tamanoPendiente = true end
  e.ancho, e.alto = ancho, alto
end
local function resolverDisposicion()
  if not B.disposicionDiferida then return end
  local pendientes = {}
  for obj, e in pairs(estado) do
    if e.tamanoPendiente then e.tamanoPendiente = nil; pendientes[#pendientes + 1] = obj end
  end
  for _, obj in ipairs(pendientes) do
    local e = estado[obj]
    local script = e.scripts and e.scripts.OnSizeChanged
    if script then B.proteger(script, obj, e.ancho, e.alto) end
  end
end
function R:SetSize(ancho, alto)
  local e = E(self, "SetSize")
  cambiarTamano(e, numero(ancho, "SetSize", "el ancho"), numero(alto, "SetSize", "el alto"))
end
function R:GetSize() local e = E(self, "GetSize"); resolverDisposicion(); return e.ancho, e.alto end
function R:SetWidth(ancho) local e = E(self, "SetWidth"); cambiarTamano(e, numero(ancho, "SetWidth", "el ancho"), e.alto) end
function R:GetWidth() local e = E(self, "GetWidth"); resolverDisposicion(); return e.ancho end
function R:SetHeight(alto) local e = E(self, "SetHeight"); cambiarTamano(e, e.ancho, numero(alto, "SetHeight", "el alto")) end
function R:GetHeight() local e = E(self, "GetHeight"); resolverDisposicion(); return e.alto end
-- wowpedia: SetAlpha recorta a [0, 1].
function R:SetAlpha(alfa)
  E(self, "SetAlpha").alfa = math.max(0, math.min(1, numero(alfa, "SetAlpha", "la transparencia")))
end
function R:GetAlpha() return E(self, "GetAlpha").alfa end
-- Redondea a float de 32 bits (24 bits de mantisa): el cliente guarda la escala así, y GetScale() devuelve p. ej.
-- 0,71111113 en vez de 768/1080. Un addon que compare GetScale() con su valor en double lo ve fallar aquí.
local function aFloat32(x)
  local exp = math.floor(math.log(x) / math.log(2))
  if 2 ^ exp > x then exp = exp - 1 elseif 2 ^ (exp + 1) <= x then exp = exp + 1 end
  local paso = 2 ^ (exp - 23)
  return math.floor(x / paso + 0.5) * paso
end
function R:SetScale(escala)
  local e = E(self, "SetScale")
  if numero(escala, "SetScale", "la escala") <= 0 then error("uso: SetScale: la escala tiene que ser mayor que 0", 2) end
  e.escala = aFloat32(escala)
end
function R:GetScale() return E(self, "GetScale").escala end
-- Escala efectiva: el producto de las escalas hasta el primer marco que ignora la de su padre (wowpedia:
-- Region:SetIgnoreParentScale).
local function escalaEfectiva(obj)
  local e, escala = estado[obj], 1
  while e do
    escala = escala * e.escala
    if e.ignorarEscala then break end
    e = e.padre and estado[e.padre]
  end
  return escala
end
function R:GetEffectiveScale()
  E(self, "GetEffectiveScale")
  return escalaEfectiva(self)
end
function R:SetIgnoreParentScale(valor) E(self, "SetIgnoreParentScale").ignorarEscala = not not valor end
function R:IsIgnoringParentScale() return E(self, "IsIgnoringParentScale").ignorarEscala == true end
-- wowpedia: Region:SetIgnoreParentAlpha / IsIgnoringParentAlpha / GetEffectiveAlpha.
function R:SetIgnoreParentAlpha(valor) E(self, "SetIgnoreParentAlpha").ignorarAlfa = not not valor end
function R:IsIgnoringParentAlpha() return E(self, "IsIgnoringParentAlpha").ignorarAlfa == true end
function R:GetEffectiveAlpha()
  local e, alfa = E(self, "GetEffectiveAlpha"), 1
  while e do
    alfa = alfa * e.alfa
    if e.ignorarAlfa then break end
    e = e.padre and estado[e.padre]
  end
  return alfa
end

-- Pantalla física (opción «pantalla» de crearMaquina): wowpedia: GetPhysicalScreenSize() da ancho y alto en píxeles.
B.pantalla = {ancho = 1920, alto = 1080}
function B.ponerPantalla(p)
  if type(p) ~= "table" or type(p.ancho) ~= "number" or type(p.alto) ~= "number" or p.alto <= 0 then
    error("uso: pantalla = {ancho, alto}", 2)
  end
  B.pantalla = {ancho = p.ancho, alto = p.alto}
end
function GetPhysicalScreenSize() return B.pantalla.ancho, B.pantalla.alto end

-- Disposición mínima para GetLeft/GetRight/GetTop/GetBottom. Todo se calcula en unidades absolutas (la altura de la
-- pantalla es 768; los píxeles son unidades · alto físico / 768). UIParent es siempre la pantalla entera, como en el
-- cliente, que cambia su tamaño al cambiar la escala. Un marco sin anclajes (o anclado a algo sin disposición) no tiene
-- posición: devuelve nil, como el cliente antes de colocarlo. Con dos anclajes de lados distintos se estira; con uno,
-- usa su tamaño.
local X_PUNTO = {TOPLEFT = 0, LEFT = 0, BOTTOMLEFT = 0, TOP = 0.5, CENTER = 0.5, BOTTOM = 0.5, TOPRIGHT = 1, RIGHT = 1, BOTTOMRIGHT = 1}
local Y_PUNTO = {BOTTOMLEFT = 0, BOTTOM = 0, BOTTOMRIGHT = 0, LEFT = 0.5, CENTER = 0.5, RIGHT = 0.5, TOPLEFT = 1, TOP = 1, TOPRIGHT = 1}

local function resolverEje(anclas, tam)
  local h1, h2
  for h in pairs(anclas) do
    if h1 == nil then h1 = h elseif h ~= h1 then h2 = h end
  end
  if h1 == nil then return nil end
  if h2 then
    local largo = (anclas[h2] - anclas[h1]) / (h2 - h1)
    return anclas[h1] - h1 * largo, anclas[h1] + (1 - h1) * largo
  end
  return anclas[h1] - h1 * tam, anclas[h1] + (1 - h1) * tam
end

local anchoTextoEntero -- (más abajo, con los FontString) el ancho del texto entero, sin recortar

-- → izquierda, abajo, derecha, arriba (unidades absolutas) o nil.
-- «memoria» (opcional) guarda el resultado de cada marco dentro de UNA misma consulta: sin ella, cada anclaje resolvía a su
-- padre otra vez y el coste crecía como 2^profundidad. Dentro de una consulta nada cambia, así que el resultado es el mismo.
local function rectAbsoluto(obj, nivel, memoria)
  if (nivel or 0) > 30 then return nil end
  memoria = memoria or {}
  local guardado = memoria[obj]
  if guardado ~= nil then
    if guardado == false then return nil end
    return guardado[1], guardado[2], guardado[3], guardado[4]
  end
  local e = estado[obj]
  if e.sistema and e.nombre == "UIParent" then
    return 0, 0, B.pantalla.ancho * 768 / B.pantalla.alto, 768
  end
  local s = escalaEfectiva(obj)
  local ax, ay = {}, {}
  for _, p in ipairs(e.puntos) do
    local rel = p.relativo or e.padre
    if not rel then return nil end
    local l, b, r, t = rectAbsoluto(rel, (nivel or 0) + 1, memoria)
    if not l then
      memoria[obj] = false
      return nil
    end
    ax[X_PUNTO[p.punto]] = l + (r - l) * X_PUNTO[p.relPunto] + p.x * s
    ay[Y_PUNTO[p.punto]] = b + (t - b) * Y_PUNTO[p.relPunto] + p.y * s
  end
  -- Ruling F3-34: un FontString sin ancho o sin alto usa los de su texto (GetStringWidth/GetStringHeight). B2r ronda 1:
  -- el del texto entero (sin ancho puesto no hay nada que lo recorte).
  local ancho, alto = e.ancho, e.alto
  if e.tipo == "FontString" then
    if ancho == 0 then ancho = anchoTextoEntero(e) end
    if alto == 0 then alto = obj:GetStringHeight() end
  end
  local izq, der = resolverEje(ax, ancho * s)
  local aba, arr = resolverEje(ay, alto * s)
  if not izq or not aba then
    memoria[obj] = false
    return nil
  end
  -- Comercio, tarea 15d r2 (wowpedia: Frame:SetClampedToScreen): un marco sujeto a la pantalla se recoloca dentro de
  -- ella aunque sus anclajes lo pongan fuera (GetPoint sigue dando lo que se puso). Solo con BANCO.sujetarAPantalla =
  -- true, para no mover los marcos sujetos de las pruebas que no lo esperan.
  if e.sujeto and B.sujetarAPantalla then
    local anchoP, altoP = B.pantalla.ancho * 768 / B.pantalla.alto, 768
    local dx, dy = 0, 0
    local i = e.insetsSujeto or {0, 0, 0, 0}
    local ci, cd, ca, cb = izq + i[1] * s, der - i[2] * s, arr - i[3] * s, aba + i[4] * s -- el rectángulo de sujeción
    if ci < 0 then dx = -ci elseif cd > anchoP then dx = anchoP - cd end
    if cb < 0 then dy = -cb elseif ca > altoP then dy = altoP - ca end
    izq, der, aba, arr = izq + dx, der + dx, aba + dy, arr + dy
  end
  memoria[obj] = {izq, aba, der, arr}
  return izq, aba, der, arr
end

-- wowpedia: un marco anclado por dos lados opuestos y sin tamaño propio mide lo que miden sus anclajes. Si no hay tamaño
-- guardado y la disposición lo resuelve, GetWidth/GetHeight/GetSize dan esa medida (en las unidades del marco); si no, el
-- tamaño guardado (0 sin más).
local function medidaPorAnclajes(obj, e, eje)
  if e.tipo == "FontString" or #e.puntos < 2 then return nil end
  local l, b, r, t = rectAbsoluto(obj)
  if not l then return nil end
  return (eje == "ancho" and (r - l) or (t - b)) / escalaEfectiva(obj)
end
function R:GetWidth()
  local e = E(self, "GetWidth"); resolverDisposicion()
  if e.ancho == 0 then return medidaPorAnclajes(self, e, "ancho") or 0 end
  return e.ancho
end
function R:GetHeight()
  local e = E(self, "GetHeight"); resolverDisposicion()
  if e.alto == 0 then return medidaPorAnclajes(self, e, "alto") or 0 end
  return e.alto
end
function R:GetSize()
  local e = E(self, "GetSize"); resolverDisposicion()
  local ancho, alto = e.ancho, e.alto
  if ancho == 0 then ancho = medidaPorAnclajes(self, e, "ancho") or 0 end
  if alto == 0 then alto = medidaPorAnclajes(self, e, "alto") or 0 end
  return ancho, alto
end

-- wowpedia: Region:GetLeft/GetRight/GetTop/GetBottom dan el borde en las unidades de la propia región, medido desde
-- la esquina inferior izquierda de la pantalla.
function R:GetLeft() E(self, "GetLeft"); local l = rectAbsoluto(self); return l and l / escalaEfectiva(self) end
function R:GetBottom() E(self, "GetBottom"); local _, b = rectAbsoluto(self); return b and b / escalaEfectiva(self) end
function R:GetRight() E(self, "GetRight"); local _, _, r = rectAbsoluto(self); return r and r / escalaEfectiva(self) end
function R:GetTop() E(self, "GetTop"); local _, _, _, t = rectAbsoluto(self); return t and t / escalaEfectiva(self) end

-- Frame.
local F = nuevaClase("Frame", "Region")

-- Scripts que acepta un Frame (wowpedia: Widget script handlers).
local SCRIPTS_FRAME = {
  OnEvent = true, OnUpdate = true, OnShow = true, OnHide = true, OnEnter = true, OnLeave = true,
  OnMouseDown = true, OnMouseUp = true, OnMouseWheel = true, OnSizeChanged = true, OnDragStart = true,
  OnDragStop = true, OnKeyDown = true, OnKeyUp = true,
}

-- Scripts propios de cada tipo de marco (wowpedia: Button OnClick; Slider OnValueChanged; EditBox OnTextChanged,
-- OnEscapePressed, OnEnterPressed, OnEditFocusGained, OnEditFocusLost).
local SCRIPTS_TIPO = {
  -- Comercio, tarea 13 (wowpedia: Button OnDoubleClick): ver B.dobleClic.
  Button = {OnClick = true, OnDoubleClick = true},
  Slider = {OnValueChanged = true},
  EditBox = {
    OnTextChanged = true, OnEscapePressed = true, OnEnterPressed = true, OnEditFocusGained = true,
    OnEditFocusLost = true,
  },
  -- Fase 4, tarea 10 (wowpedia: GameTooltip OnTooltipSetItem; en el motor moderno ya no se lanza si existe TooltipDataProcessor).
  -- Comercio, Task 20d (wowpedia: GameTooltip OnTooltipCleared): se lanza al vaciar el tooltip (ClearLines, SetOwner, y antes de
  -- enseñar otro objeto).
  GameTooltip = {OnTooltipSetItem = true, OnTooltipCleared = true},
}

local function permitidoScript(obj, nombre)
  if SCRIPTS_FRAME[nombre] then return true end
  local extra = SCRIPTS_TIPO[estado[obj].tipo]
  return extra ~= nil and extra[nombre] == true
end

local function nombreScript(obj, nombre)
  if not permitidoScript(obj, nombre) then error("no imitado: script " .. tostring(nombre), 3) end
  return nombre
end

function F:SetScript(nombre, funcion)
  local e = E(self, "SetScript")
  if funcion ~= nil and type(funcion) ~= "function" then error("uso: SetScript(nombre, función)", 2) end
  e.scripts[nombreScript(self, nombre)] = funcion
end
function F:GetScript(nombre) return E(self, "GetScript").scripts[nombreScript(self, nombre)] end
function F:HasScript(nombre) E(self, "HasScript"); return permitidoScript(self, nombre) end
-- wowpedia: HookScript llama primero al script que había y después al gancho; sin script, pone el gancho.
-- Comercio, Task 38 (ronda 1): cada gancho se apunta en m.llamadas('HookScript') con el marco y el script.
function F:HookScript(nombre, gancho)
  local e = E(self, "HookScript")
  nombre = nombreScript(self, nombre)
  B.anotar("HookScript", e.nombre, nombre)
  if type(gancho) ~= "function" then error("uso: HookScript(nombre, función)", 2) end
  local anterior = e.scripts[nombre]
  if anterior then
    e.scripts[nombre] = function(...) anterior(...); gancho(...) end
  else
    e.scripts[nombre] = gancho
  end
end

-- Eventos que conoce el banco (wowpedia: los argumentos de cada uno).
B.eventosConocidos = {
  ADDON_LOADED = true,          -- (addOnName)
  PLAYER_LOGIN = true,          -- ()
  PLAYER_ENTERING_WORLD = true, -- (isInitialLogin, isReloadingUi)
  PLAYER_LOGOUT = true,         -- () antes de guardar las SavedVariables
  -- Tarea 21 (wowpedia: PLAYER_LEAVING_WORLD, sin argumentos): justo antes de una pantalla de carga, de /reload o de
  -- salir; el arranque para ahí los temporizadores (RestedXP pausa su bucle, plano 1, RG:1827).
  PLAYER_LEAVING_WORLD = true,  -- ()
  PLAYER_LEVEL_UP = true,       -- (level, ...)
  QUEST_ACCEPTED = true,        -- Classic: (questLogIndex, questId); motor moderno: (questId)
  QUEST_TURNED_IN = true,       -- (questId, xpReward, moneyReward)
  QUEST_REMOVED = true,         -- (questId, wasReplayQuest)
  QUEST_LOG_UPDATE = true,      -- ()
  -- Tarea 22: la ventana se repinta cuando llegan los objetivos (al entrar al mundo aún no están).
  QUEST_WATCH_UPDATE = true,    -- (questID) (Classic: questIndex)
  UNIT_QUEST_LOG_CHANGED = true, -- (unitTarget)
  -- Tarea 9: el motor de pasos escucha los eventos de los elementos de sus pasos activos (motor/elementos-*.lua).
  PLAYER_XP_UPDATE = true,      -- (unitTarget)
  PLAYER_MONEY = true,          -- ()
  BAG_UPDATE_DELAYED = true,    -- ()
  -- Almacén, movimiento por clic (wow-ui-source, rama forever, ContainerDocumentation.lua y CursorDocumentation.lua): un
  -- hueco se bloquea o se desbloquea, cambia una bolsa y cambia el cursor. ADDON_ACTION_FORBIDDEN (addonName, functionName):
  -- el juego prohíbe a un addon una función.
  BAG_UPDATE = true,            -- (bagID)
  ITEM_LOCK_CHANGED = true,     -- (bagOrSlotIndex, slotIndex)
  CURSOR_CHANGED = true,        -- (isDefault, newCursorType, oldCursorType, oldCursorVirtualID)
  ADDON_ACTION_FORBIDDEN = true, -- (addonName, functionName)
  -- Fase 4, tarea 7: el inventario apunta el banco al abrirlo y al cerrarlo (wowpedia: BANKFRAME_OPENED y BANKFRAME_CLOSED, sin argumentos).
  BANKFRAME_OPENED = true,      -- ()
  -- 13-nov: la IA apunta cuándo se abrió la casa de subastas (ia/subasta.lua; wowpedia: sin argumentos).
  AUCTION_HOUSE_SHOW = true,    -- ()
  AUCTION_HOUSE_CLOSED = true,  -- ()
  -- Comercio, tarea 9 (wow-ui-source, rama forever, AuctionHouseDocumentation.lua): los de C_AuctionHouse que imita
  -- el banco (ver «Casa de subastas» al final de este archivo).
  AUCTION_HOUSE_BROWSE_RESULTS_UPDATED = true, -- ()
  AUCTION_HOUSE_BROWSE_RESULTS_ADDED = true,   -- (addedBrowseResults)
  ITEM_SEARCH_RESULTS_UPDATED = true,          -- (itemKey, newAuctionID)
  COMMODITY_SEARCH_RESULTS_UPDATED = true,     -- (itemID)
  -- B2r (wow-ui-source; lo escuchan TSM y Auctionator en WoW Forever): GetItemKeyInfo ya sabe esa clave del objeto.
  ITEM_KEY_ITEM_INFO_RECEIVED = true,          -- (itemID)
  COMMODITY_PRICE_UPDATED = true,              -- (updatedUnitPrice, updatedTotalPrice)
  COMMODITY_PURCHASE_SUCCEEDED = true,         -- ()
  COMMODITY_PURCHASE_FAILED = true,            -- ()
  AUCTION_HOUSE_THROTTLED_SYSTEM_READY = true, -- ()
  AUCTION_HOUSE_THROTTLED_MESSAGE_SENT = true, -- ()
  REPLICATE_ITEM_LIST_UPDATE = true,           -- ()
  COMMODITY_PRICE_UNAVAILABLE = true,          -- ()
  -- Comercio, tarea 13 (wow-ui-source, AuctionHouseDocumentation.lua): AUCTION_HOUSE_SHOW_ERROR(error), un error de la
  -- subasta (Enum.AuctionHouseError). El banco no lo lanza solo: lo disparan las pruebas.
  AUCTION_HOUSE_SHOW_ERROR = true,             -- (error)
  -- Arreglo de la compra suelta (wow-ui-source, rama forever: AuctionHouseDocumentation.lua y la compra ya de
  -- Blizzard_AuctionHouseFrame.lua, que espera este evento con el auctionID de su subasta): el juego da por hecha la
  -- compra de esa subasta de objeto.
  AUCTION_HOUSE_PURCHASE_COMPLETED = true,     -- (auctionID)
  -- wowpedia: UI_ERROR_MESSAGE(errorType, message), el texto rojo del centro de la pantalla (p. ej. sin dinero).
  UI_ERROR_MESSAGE = true,                     -- (errorType, message)
  BANKFRAME_CLOSED = true,      -- ()
  -- F2: el inventario cuenta el correo con el buzón abierto (wowpedia: MAIL_SHOW, MAIL_INBOX_UPDATE y MAIL_CLOSED, sin
  -- argumentos).
  MAIL_SHOW = true,             -- ()
  MAIL_INBOX_UPDATE = true,     -- ()
  MAIL_CLOSED = true,           -- ()
  PLAYER_EQUIPMENT_CHANGED = true, -- (equipmentSlot, hasCurrent)
  ZONE_CHANGED = true,          -- ()
  ZONE_CHANGED_INDOORS = true,  -- ()
  ZONE_CHANGED_NEW_AREA = true, -- ()
  PLAYER_ALIVE = true,          -- ()
  PLAYER_DEAD = true,           -- ()
  PLAYER_UNGHOST = true,        -- ()
  TRADE_SKILL_LIST_UPDATE = true,
  MERCHANT_SHOW = true,         -- ()
  MERCHANT_UPDATE = true,       -- ()
  MERCHANT_CLOSED = true,       -- ()
  -- Diario de objetos (wowpedia: CHAT_MSG_LOOT (text, playerName, languageName, channelName, playerName2, …);
  -- LOOT_OPENED (autoLoot, isFromItem); LOOT_CLOSED ()).
  CHAT_MSG_LOOT = true,
  LOOT_OPENED = true,
  LOOT_CLOSED = true,
  TRAINER_SHOW = true,          -- ()
  TRAINER_CLOSED = true,        -- ()
  TRAINER_UPDATE = true,        -- ()
  PET_STABLE_SHOW = true,       -- ()
  PET_STABLE_CLOSED = true,     -- ()
  GOSSIP_SHOW = true,           -- (uiTextureKit)
  TAXIMAP_OPENED = true,        -- (system)
  UI_INFO_MESSAGE = true,       -- (errorType, message)
  PLAYER_CONTROL_LOST = true,   -- ()
  UNIT_SPELLCAST_SUCCEEDED = true, -- (unitTarget, castGUID, spellID)
  HEARTHSTONE_BOUND = true,     -- ()
  CHAT_MSG_SYSTEM = true,       -- (text, ...)
  SKILL_LINES_CHANGED = true,   -- ()
  UNIT_AURA = true,             -- (unitTarget, updateInfo)
  UPDATE_FACTION = true,        -- ()
  SPELL_UPDATE_COOLDOWN = true, -- ()
  PLAYER_REGEN_ENABLED = true,  -- ()
  -- Tarea 16: la ventana se oculta en combate si el ajuste lo pide.
  PLAYER_REGEN_DISABLED = true, -- () al entrar en combate
  -- Tarea 19: el minimapa cambia de zoom.
  MINIMAP_UPDATE_ZOOM = true,   -- ()
  -- Tarea D4 (wowpedia: NAME_PLATE_UNIT_ADDED / NAME_PLATE_UNIT_REMOVED (namePlateUnitToken), UPDATE_MOUSEOVER_UNIT (),
  -- PLAYER_TARGET_CHANGED (), ADDON_ACTION_BLOCKED (addonName, functionName) y los eventos de charla con un PNJ): lo que
  -- usa «Objetivos cercanos».
  NAME_PLATE_UNIT_ADDED = true,   -- (namePlateUnitToken)
  NAME_PLATE_UNIT_REMOVED = true, -- (namePlateUnitToken)
  UPDATE_MOUSEOVER_UNIT = true,   -- ()
  PLAYER_TARGET_CHANGED = true,   -- ()
  ADDON_ACTION_BLOCKED = true,    -- (addonName, functionName)
  QUEST_GREETING = true,          -- ()
  QUEST_PROGRESS = true,          -- ()
  QUEST_DETAIL = true,            -- ()
  QUEST_COMPLETE = true,          -- ()
  SPELLS_CHANGED = true,          -- ()
  -- Fase 4: la franja de la IA se recoloca al cambiar la escala de la interfaz o el tamaño de la pantalla.
  UI_SCALE_CHANGED = true,        -- ()
  DISPLAY_SIZE_CHANGED = true,    -- ()
  -- Lote A (wowpedia: GET_ITEM_INFO_RECEIVED (itemID, success) y QUEST_DATA_LOAD_RESULT (questID, success)): el cliente
  -- avisa cuando ya tiene los datos de un objeto o de una misión que no tenía en caché. RestedXP los usa en Forever para
  -- repintar los textos (plano 1, RG:1850-1859 y RG:1953-1964).
  GET_ITEM_INFO_RECEIVED = true,  -- (itemID, success)
  QUEST_DATA_LOAD_RESULT = true,  -- (questID, success)
  -- Pines de la IA como «Marcador de mapa» (wowpedia: USER_WAYPOINT_UPDATED, sin argumentos): cambió el marcador.
  USER_WAYPOINT_UPDATED = true,   -- ()
  SUPER_TRACKING_CHANGED = true,  -- () cambió lo que sigue la flecha del juego
  SUPER_TRACKING_CHANGED = true,  -- () cambió lo que sigue la flecha del juego
  -- Comercio, Task 38 (wowpedia: MODIFIER_STATE_CHANGED): se pulsa o se suelta Mayús, Ctrl o Alt. El banco no lo lanza
  -- solo: la prueba pone BANCO.shift/ctrl/alt y lo dispara.
  MODIFIER_STATE_CHANGED = true,  -- (key, down) «LSHIFT», «RCTRL»…; down = 1 al pulsar y 0 al soltar
}

local function evento(nombre)
  if not B.eventosConocidos[nombre] then error("no imitado: evento " .. tostring(nombre), 3) end
  return nombre
end

-- Tarea 22: el motor moderno (WoW Forever) da error al registrar un evento que no conoce. B.eventosInvalidos[nombre] =
-- true hace que el banco se porte así con ese evento (y que C_EventUtils.IsEventValid diga false).
B.eventosInvalidos = {}

function F:RegisterEvent(nombre)
  local e = E(self, "RegisterEvent")
  if B.eventosInvalidos[nombre] then
    B.anotar("RegisterEvent:invalido", nombre)
    error('Attempt to register unknown event "' .. tostring(nombre) .. '"', 2)
  end
  nombre = evento(nombre)
  if e.eventos[nombre] then return end
  e.eventos[nombre] = true
  local lista = B.eventos[nombre] or {}
  B.eventos[nombre] = lista
  lista[#lista + 1] = self
end
function F:UnregisterEvent(nombre)
  local e = E(self, "UnregisterEvent")
  nombre = evento(nombre)
  e.eventos[nombre] = nil
  if B.eventos[nombre] then quitarDe(B.eventos[nombre], self) end
end
function F:UnregisterAllEvents()
  local e = E(self, "UnregisterAllEvents")
  for nombre in pairs(e.eventos) do quitarDe(B.eventos[nombre], self) end
  e.eventos = {}
end
function F:IsEventRegistered(nombre) return E(self, "IsEventRegistered").eventos[evento(nombre)] == true end

local CAPAS = {BACKGROUND = true, BORDER = true, ARTWORK = true, OVERLAY = true, HIGHLIGHT = true}

local function capa(valor, metodo)
  if valor == nil then return "ARTWORK" end
  if not CAPAS[valor] then error("uso: " .. metodo .. ": capa no válida " .. tostring(valor), 3) end
  return valor
end

function F:CreateTexture(nombre, capaDibujo, plantilla, subnivel)
  E(self, "CreateTexture")
  if plantilla ~= nil then error("no imitado: plantilla " .. tostring(plantilla), 2) end
  local t = crearObjeto("Texture", nombre, self)
  estado[t].capa, estado[t].subnivel = capa(capaDibujo, "CreateTexture"), subnivel or 0
  return t
end
function F:CreateFontString(nombre, capaDibujo, plantilla)
  E(self, "CreateFontString")
  if plantilla ~= nil then error("no imitado: plantilla " .. tostring(plantilla), 2) end
  local t = crearObjeto("FontString", nombre, self)
  estado[t].capa = capa(capaDibujo, "CreateFontString")
  return t
end

local function hijosDe(obj, esMarco)
  local salida = {}
  for _, hijo in ipairs(estado[obj].hijos) do
    if (estado[hijo].esMarco == true) == esMarco then salida[#salida + 1] = hijo end
  end
  return unpack(salida)
end
function F:GetChildren() E(self, "GetChildren"); return hijosDe(self, true) end
function F:GetRegions() E(self, "GetRegions"); return hijosDe(self, false) end

local ESTRATOS = {
  BACKGROUND = true, LOW = true, MEDIUM = true, HIGH = true, DIALOG = true, FULLSCREEN = true,
  FULLSCREEN_DIALOG = true, TOOLTIP = true,
}
function F:SetFrameStrata(estrato)
  if not ESTRATOS[estrato] then error("uso: SetFrameStrata: estrato no válido " .. tostring(estrato), 2) end
  E(self, "SetFrameStrata").estrato = estrato
end
function F:GetFrameStrata() return E(self, "GetFrameStrata").estrato or "MEDIUM" end
-- Tarea 22 (wowpedia: Frame:SetToplevel(isTopLevel) / IsToplevel()): el marco sube sobre los de su capa al pulsarlo.
function F:SetToplevel(valor) E(self, "SetToplevel").toplevel = not not valor end
function F:IsToplevel() return E(self, "IsToplevel").toplevel == true end
-- Tarea 22 (wowpedia: Minimap:SetMaskTexture(asset)): la máscara del minimapa (EllesmereUI pone 186178 redonda o
-- 130937 cuadrada). GetMaskTexture no se sabe si existe en el cliente: las pruebas la quitan con sinApi.
function F:SetMaskTexture(mascara) E(self, "SetMaskTexture").mascara = mascara end
function F:GetMaskTexture() return E(self, "GetMaskTexture").mascara end
function F:SetFrameLevel(nivel)
  local e = E(self, "SetFrameLevel")
  e.nivel = numero(nivel, "SetFrameLevel", "el nivel")
  e.nivelPuesto = true
end
function F:GetFrameLevel() return E(self, "GetFrameLevel").nivel or 0 end
-- Medida del banco (no es API del juego): el nivel con el que el cliente dibujaría el marco. Un marco al que nadie le puso
-- nivel con SetFrameLevel recibe el de su padre más 1 (el banco, en cambio, deja GetFrameLevel en 0). Una región cuenta
-- con el nivel del marco que la lleva. Sirve para saber qué marco queda por encima de otro.
function BANCO.nivelReal(obj)
  local e = estado[obj]
  if e.esMarco ~= true then
    return BANCO.nivelReal(e.padre)
  end
  if e.nivelPuesto then
    return e.nivel
  end
  if e.padre == nil then
    return 0
  end
  return BANCO.nivelReal(e.padre) + 1
end

-- wowpedia: EnableMouse(enable) / IsMouseEnabled(): si el marco recibe el ratón (el banco solo lo guarda).
-- Dibujos de la IA (wowpedia: Frame:SetMouseClickEnabled(enabled) / SetMouseMotionEnabled(enabled) y sus
-- IsMouseClickEnabled / IsMouseMotionEnabled): EnableMouse pone las dos cosas a la vez; IsMouseEnabled es cierto si el
-- marco recibe clics o movimiento del ratón.
function F:EnableMouse(valor)
  local e = E(self, "EnableMouse")
  e.clic, e.movimiento = not not valor, not not valor
end
function F:IsMouseEnabled()
  local e = E(self, "IsMouseEnabled")
  return e.clic == true or e.movimiento == true
end
function F:SetMouseClickEnabled(valor) E(self, "SetMouseClickEnabled").clic = not not valor end
function F:IsMouseClickEnabled() return E(self, "IsMouseClickEnabled").clic == true end
function F:SetMouseMotionEnabled(valor) E(self, "SetMouseMotionEnabled").movimiento = not not valor end
function F:IsMouseMotionEnabled() return E(self, "IsMouseMotionEnabled").movimiento == true end

-- wowpedia: Frame:EnableKeyboard(enable) / IsKeyboardEnabled(), el script OnKeyDown(self, key) y
-- SetPropagateKeyboardInput(propagate) / GetPropagateKeyboardInput(). Un marco con el teclado activado que se ve se queda
-- con las teclas, salvo que ponga propagate = true (por defecto es false). B.pulsarTecla(tecla) imita la pulsación.
function F:EnableKeyboard(valor) E(self, "EnableKeyboard").teclado = not not valor end
function F:IsKeyboardEnabled() return E(self, "IsKeyboardEnabled").teclado == true end
function F:SetPropagateKeyboardInput(valor) E(self, "SetPropagateKeyboardInput").propaga = not not valor end
function F:GetPropagateKeyboardInput() return E(self, "GetPropagateKeyboardInput").propaga == true end

-- Tarea 16 (wowpedia: Frame:SetMovable, IsMovable, StartMoving, StopMovingOrSizing, SetClampedToScreen,
-- SetUserPlaced). StartMoving en un marco que no es movible da error, como en el cliente («Frame is not movable»).
-- El banco no tiene ratón: StopMovingOrSizing desplaza los puntos del marco lo que diga BANCO.arrastre = {x, y}
-- (y lo vacía), como si el jugador lo hubiera arrastrado esa distancia sin cambiar el anclaje.
function F:SetMovable(valor) E(self, "SetMovable").movible = not not valor end
function F:IsMovable() return E(self, "IsMovable").movible == true end
-- SetClampedToScreen solo apunta la marca. Recolocar el marco dentro de la pantalla (lo que hace el cliente) solo pasa con
-- BANCO.sujetarAPantalla = true (ver rectAbsoluto, tarea 15d r2): muchos marcos del addon se sujetan a la pantalla
-- (chat, panel, objetivos, ventana…) y sus pruebas cuentan con medidas sin recolocar. Así esas pruebas no cambian y la
-- del comercio que lo necesita lo enciende.
function F:SetClampedToScreen(valor) E(self, "SetClampedToScreen").sujeto = not not valor end
function F:IsClampedToScreen() return E(self, "IsClampedToScreen").sujeto == true end -- tarea 15d r2
-- Tarea 15e (wowpedia: Frame:SetClampRectInsets(izq, der, arriba, abajo) y GetClampRectInsets): un valor negativo ensancha el
-- rectángulo que debe quedar dentro de la pantalla (para que cuente lo que cuelga del marco); uno positivo lo estrecha.
function F:SetClampRectInsets(izq, der, arriba, abajo)
  E(self, "SetClampRectInsets").insetsSujeto = {izq or 0, der or 0, arriba or 0, abajo or 0}
end
function F:GetClampRectInsets()
  local i = E(self, "GetClampRectInsets").insetsSujeto or {0, 0, 0, 0}
  return i[1], i[2], i[3], i[4]
end
function F:SetUserPlaced(valor) E(self, "SetUserPlaced").colocadoPorUsuario = not not valor end
function F:StartMoving()
  local e = E(self, "StartMoving")
  if not e.movible then error("StartMoving: el marco no se puede mover (falta SetMovable(true))", 2) end
  e.moviendo = true
  B.anotar("StartMoving", e.nombre)
end
-- Ventana principal, Task 12 (wowpedia: Frame:SetResizable, IsResizable, SetResizeBounds(minAncho, minAlto, maxAncho?,
-- maxAlto?) y StartSizing(punto)). StartSizing en un marco que no es redimensionable da error. Sin ratón: al soltar
-- (StopMovingOrSizing) el marco cambia de tamaño lo que diga BANCO.redimensionar = {ancho, alto} (sumado al tamaño),
-- recortado a los límites, y lo vacía.
function F:SetResizable(valor) E(self, "SetResizable").redimensionable = not not valor end
function F:IsResizable() return E(self, "IsResizable").redimensionable == true end
function F:SetResizeBounds(minAncho, minAlto, maxAncho, maxAlto)
  E(self, "SetResizeBounds").limites = {minAncho, minAlto, maxAncho, maxAlto}
end
-- wowpedia: Frame:SetMinResize(minAncho, minAlto), el de los clientes sin SetResizeBounds.
function F:SetMinResize(minAncho, minAlto)
  local e = E(self, "SetMinResize")
  e.limites = {minAncho, minAlto, e.limites and e.limites[3], e.limites and e.limites[4]}
end
-- Solo para las pruebas: B.quitarMetodos(marco, {nombres}) hace que ese marco no tenga esos métodos (nil, como un cliente que no
-- los trae).
function B.quitarMetodos(marco, nombres)
  for _, nombre in ipairs(nombres) do estado[marco].quitados[nombre] = true end
end
function F:StartSizing(punto)
  local e = E(self, "StartSizing")
  if not e.redimensionable then error("StartSizing: el marco no se puede redimensionar (falta SetResizable(true))", 2) end
  e.redimensionando = punto or "BOTTOMRIGHT"
  B.anotar("StartSizing", e.nombre, e.redimensionando)
end
function F:StopMovingOrSizing()
  local e = E(self, "StopMovingOrSizing")
  if e.moviendo and B.arrastre then
    for _, p in ipairs(e.puntos) do
      p.x = p.x + (B.arrastre.x or 0)
      p.y = p.y + (B.arrastre.y or 0)
    end
    B.arrastre = nil
  end
  if e.redimensionando and B.redimensionar then
    local l = e.limites or {}
    local ancho, alto = e.ancho + (B.redimensionar.ancho or 0), e.alto + (B.redimensionar.alto or 0)
    if l[1] then ancho = math.max(ancho, l[1]) end
    if l[2] then alto = math.max(alto, l[2]) end
    if l[3] then ancho = math.min(ancho, l[3]) end
    if l[4] then alto = math.min(alto, l[4]) end
    self:SetSize(ancho, alto)
    B.redimensionar = nil
  end
  e.moviendo = false
  e.redimensionando = nil
end

-- wowpedia: IsShiftKeyDown(). BANCO.shift = true la pulsa (el botón del minimapa la mira en OnClick).
B.shift = false
function IsShiftKeyDown() return B.shift end

-- wowpedia: IsControlKeyDown(). BANCO.ctrl = true la pulsa.
B.ctrl = false
function IsControlKeyDown() return B.ctrl end

-- wowpedia: IsAltKeyDown(). BANCO.alt = true la pulsa.
B.alt = false
function IsAltKeyDown() return B.alt end

-- B3s. wowpedia: IsModifiedClick(accion) dice si las teclas pulsadas son las que el jugador tiene puestas para esa acción
-- del clic (en el juego, «Teclas de los clics»). El banco las saca de BANCO.teclasDe (por defecto, las del juego: enlazar
-- en el chat con Mayús y el probador con Ctrl) y pide exactamente esas teclas: Mayús + Ctrl no es ninguna de las dos.
B.teclasDe = {CHATLINK = "SHIFT", DRESSUP = "CTRL"}
function IsModifiedClick(accion)
  local teclas = B.teclasDe[accion or ""]
  if type(teclas) ~= "string" then return false end
  local function lleva(t) return string.find(teclas, t, 1, true) ~= nil end
  return B.shift == lleva("SHIFT") and B.ctrl == lleva("CTRL") and B.alt == lleva("ALT")
end

-- Texture.
local T = nuevaClase("Texture", "Region")

function T:SetTexture(ruta)
  local e = E(self, "SetTexture")
  e.textura, e.color, e.atlas, e.retrato = ruta, nil, nil, nil -- un contenido nuevo sustituye al retrato
  return true
end
function T:GetTexture() return E(self, "GetTexture").textura end
-- Tarea 22 (wowpedia: Texture:SetAtlas(atlas), GetAtlas(), SetBlendMode(mode) / GetBlendMode()). Un atlas que no
-- está en B.atlas (los que tiene el cliente) da error, como en el juego: hay que mirar antes C_Texture.GetAtlasInfo.
function T:SetAtlas(nombre)
  local e = E(self, "SetAtlas")
  if not B.atlas[nombre] then error("SetAtlas: el cliente no tiene el atlas " .. tostring(nombre), 2) end
  e.atlas, e.textura, e.color, e.retrato = nombre, nil, nil, nil
end
function T:GetAtlas() return E(self, "GetAtlas").atlas end
local MEZCLAS = {DISABLE = true, BLEND = true, ALPHAKEY = true, ADD = true, MOD = true}
function T:SetBlendMode(modo)
  if not MEZCLAS[modo] then error("uso: SetBlendMode: modo no válido " .. tostring(modo), 2) end
  E(self, "SetBlendMode").mezcla = modo
end
function T:GetBlendMode() return E(self, "GetBlendMode").mezcla or "BLEND" end
function T:SetColorTexture(r, g, b, a)
  local e = E(self, "SetColorTexture")
  e.textura, e.color, e.retrato = nil, {r, g, b, a or 1}, nil
  B.anotar("Texture:SetColorTexture", r, g, b, a) -- para contar los repintados (m.llamadas)
end
function T:SetVertexColor(r, g, b, a) E(self, "SetVertexColor").colorVertice = {r, g, b, a or 1} end
function T:GetVertexColor()
  local c = E(self, "GetVertexColor").colorVertice or {1, 1, 1, 1}
  return c[1], c[2], c[3], c[4]
end
function T:SetTexCoord(...) E(self, "SetTexCoord").coordenadas = {...} end
-- Tarea D1 (wowpedia: Texture:GetTexCoord() da ULx, ULy, LLx, LLy, URx, URy, LRx, LRy). SetTexCoord(left, right, top,
-- bottom) con cuatro valores equivale a (left, top, left, bottom, right, top, right, bottom); sin SetTexCoord, la
-- textura entera.
function T:GetTexCoord()
  local c = E(self, "GetTexCoord").coordenadas
  if not c then return 0, 0, 0, 1, 1, 0, 1, 1 end
  if #c == 4 then return c[1], c[3], c[1], c[4], c[2], c[3], c[2], c[4] end
  return unpack(c, 1, 8)
end
-- Tarea 17 (wowpedia: Texture:SetRotation(radians [, normalizedRotationPoint])): gira la textura en radianes en sentido
-- antihorario alrededor de su centro (la misma convención que GetPlayerFacing). La imitación guarda el ángulo, sin
-- normalizarlo, y apunta la llamada en m.llamadas("Texture:SetRotation"). GetRotation no está en la API pública de
-- Classic Era; aquí solo devuelve lo guardado (0 por defecto) para que las pruebas lean el giro.
function T:SetRotation(radianes)
  local e = E(self, "SetRotation")
  e.rotacion = numero(radianes, "SetRotation", "el ángulo")
  B.anotar("Texture:SetRotation", radianes)
end
function T:GetRotation() return E(self, "GetRotation").rotacion or 0 end
function T:SetDrawLayer(capaDibujo, subnivel)
  local e = E(self, "SetDrawLayer")
  e.capa, e.subnivel = capa(capaDibujo, "SetDrawLayer"), subnivel or 0
end
function T:GetDrawLayer() local e = E(self, "GetDrawLayer"); return e.capa, e.subnivel end

-- Tarea D3 (wowpedia: SetPortraitTexture(textureObject, unitToken [, disableMasking])): pone en la textura el retrato
-- redondo de la unidad (lo usan 29 addons de Forever). El banco guarda la unidad en el estado de la textura (y
-- GetTexture deja de dar una ruta); B.retrato(textura) la devuelve. Tarea D4: admite «player» y las unidades puestas con
-- B.ponerUnidad o B.ponerPlaca (target, mouseover, nameplateN...); una unidad que no existe da error como el resto del banco.
function SetPortraitTexture(textura, unidad)
  local e = E(textura, "SetPortraitTexture")
  B.anotar("SetPortraitTexture", unidad)
  if unidad ~= "player" and not B.unidades[unidad] then
    error("no imitado: SetPortraitTexture solo admite 'player' y las unidades puestas con B.ponerUnidad o B.ponerPlaca (se pidió "
      .. tostring(unidad) .. ")", 2)
  end
  e.retrato, e.textura, e.color, e.atlas = unidad, nil, nil, nil
end
function B.retrato(textura) return E(textura, "B.retrato").retrato end

-- FontString.
-- Lote E4 (wowpedia: Frame:CreateLine([name, drawLayer, templateName, subLevel]) da un Line, que hereda de Texture;
-- Line:SetStartPoint(relativePoint, relativeTo [, offsetX, offsetY]) y SetEndPoint igual, GetStartPoint/GetEndPoint
-- devuelven lo puesto, SetThickness/GetThickness el grosor). SetStartPoint se apunta en m.llamadas("Line:SetStartPoint")
-- para contar los redibujados.
local Ln = nuevaClase("Line", "Texture")
local function extremo(self, metodo, campo, relPunto, relativo, x, y)
  local e = E(self, metodo)
  e[campo] = {punto(relPunto, metodo), resolver(relativo, metodo), numero(x or 0, metodo, "x"), numero(y or 0, metodo, "y")}
end
function Ln:SetStartPoint(relPunto, relativo, x, y)
  extremo(self, "SetStartPoint", "inicio", relPunto, relativo, x, y)
  B.anotar("Line:SetStartPoint", x, y)
end
function Ln:SetEndPoint(relPunto, relativo, x, y) extremo(self, "SetEndPoint", "fin", relPunto, relativo, x, y) end
function Ln:GetStartPoint()
  local p = E(self, "GetStartPoint").inicio
  if not p then return nil end
  return p[1], p[2], p[3], p[4]
end
function Ln:GetEndPoint()
  local p = E(self, "GetEndPoint").fin
  if not p then return nil end
  return p[1], p[2], p[3], p[4]
end
function Ln:SetThickness(grosor) E(self, "SetThickness").grosor = numero(grosor, "SetThickness", "el grosor") end
function Ln:GetThickness() return E(self, "GetThickness").grosor or 1 end
function F:CreateLine(nombre, capaDibujo, plantilla, subnivel)
  E(self, "CreateLine")
  if plantilla ~= nil then error("no imitado: plantilla " .. tostring(plantilla), 2) end
  local l = crearObjeto("Line", nombre, self)
  estado[l].capa, estado[l].subnivel = capa(capaDibujo or "ARTWORK", "CreateLine"), subnivel or 0
  return l
end

local S = nuevaClase("FontString", "Region")

-- En WoW SetText(número) escribe el número, pero en fengari un decimal sale «3.0»: el banco solo acepta texto
-- (restricción del plan: los números pasan a texto con string.format).
-- wowpedia: FontInstance:SetFont(path, height, flags) da false (o nil) si el archivo de la letra no carga, y la letra
-- anterior se queda. B.existeArchivo(ruta) lo pone la máquina (maquina.js): solo mira «Interface\AddOns\...» contra la
-- carpeta del addon; con BANCO.setFontDevuelveNil = true imita un cliente cuyo SetFont devuelve siempre nil; lo demás («Fonts\...») se da por existente. Sin máquina, todo existe.
function B.archivoDeLetraExiste(ruta)
  if type(ruta) ~= "string" then return false end
  if B.existeArchivo then return B.existeArchivo(ruta) end
  return true
end
function S:SetText(texto)
  local e = E(self, "SetText")
  if texto ~= nil and type(texto) ~= "string" then
    error("uso: SetText: se esperaba texto (pasa los números por string.format)", 2)
  end
  -- Con la letra propia sin cargar (B.textoSinCargar) un texto nuevo no se pinta; el cliente tampoco rehace el dibujo si el
  -- texto es el mismo que ya había. BANCO.textoPintado(fs) dice si el texto se ve.
  if texto ~= e.texto then
    e.pintado = not B.textoSinCargar
  end
  e.texto = texto
end
function BANCO.textoPintado(fs)
  local e = estado[fs]
  return e.pintado == true and e.texto ~= nil and e.texto ~= ""
end
function S:GetText() return E(self, "GetText").texto end
function S:SetFormattedText(formato, ...) E(self, "SetFormattedText").texto = string.format(formato, ...) end
function S:SetFont(ruta, tamano, banderas)
  local e = E(self, "SetFont")
  if not B.archivoDeLetraExiste(ruta) then return false end -- como el cliente: la letra anterior se queda
  e.fuente = {ruta, numero(tamano, "SetFont", "el tamaño"), banderas or ""}
  if B.setFontDevuelveNil then return nil end -- cliente antiguo: funciona pero no devuelve nada
  return true
end
function S:GetFont()
  local f = E(self, "GetFont").fuente
  if not f then return nil end
  return f[1], f[2], f[3]
end
function S:SetTextColor(r, g, b, a) E(self, "SetTextColor").colorTexto = {r, g, b, a or 1} end
function S:GetTextColor()
  local c = E(self, "GetTextColor").colorTexto or {1, 1, 1, 1}
  return c[1], c[2], c[3], c[4]
end
-- Tarea D1 (wowpedia: FontInstance:SetShadowOffset(x, y), SetShadowColor(r, g, b [, a]) y sus Get). Sin ponerlos, sin
-- sombra: desplazamiento (0, 0) y negro transparente.
local function darSombra(clase)
  function clase:SetShadowOffset(x, y) E(self, "SetShadowOffset").sombraDesplazamiento = {x, y} end
  function clase:GetShadowOffset()
    local d = E(self, "GetShadowOffset").sombraDesplazamiento or {0, 0}
    return d[1], d[2]
  end
  function clase:SetShadowColor(r, g, b, a) E(self, "SetShadowColor").sombraColor = {r, g, b, a or 1} end
  function clase:GetShadowColor()
    local c = E(self, "GetShadowColor").sombraColor or {0, 0, 0, 0}
    return c[1], c[2], c[3], c[4]
  end
end
darSombra(S)
-- Tarea 16 (wowpedia: FontString:SetWordWrap, GetStringHeight, GetStringWidth). El banco no tiene motor de texto:
-- aproxima cada carácter visible a medio tamaño de fuente de ancho (un icono |T…|t vale 2 caracteres; |c…, |r no
-- cuentan) y cada renglón a tamaño + 2 px de alto. Con ancho puesto y ajuste de línea (por defecto, como en el
-- cliente) cada línea (\n) ocupa ceil(ancho del texto / ancho) renglones. Sin texto, 0.
local function caracteresVisibles(linea)
  linea = string.gsub(linea, "|T.-|t", "xx")
  linea = string.gsub(linea, "|c%x%x%x%x%x%x%x%x", "")
  linea = string.gsub(linea, "|r", "")
  local _, n = string.gsub(linea, "[^\128-\191]", "")
  return n
end
local function tamanoDe(e) return e.fuente and e.fuente[2] or 12 end
-- B4r ronda 2: BANCO.letraReal = {["Montserrat-Bold"] = 0.61, ...} hace que GetStringWidth cuente, para los textos con esa
-- letra (el nombre del archivo sin «.ttf»), ese ancho por carácter y por punto de tamaño en vez de medio tamaño. Así una
-- prueba mide con anchos de letra de verdad sin cambiar las demás (sin la tabla, todo sigue igual).
local function anchoPorLetra(e)
  local tabla = B.letraReal
  local ruta = type(tabla) == "table" and e.fuente and e.fuente[1]
  local nombre = type(ruta) == "string" and string.match(ruta, "([^\\/]+)%.[tT][tT][fF]$")
  return nombre and tabla[nombre] or 0.5
end
function S:SetWordWrap(valor) E(self, "SetWordWrap").sinAjuste = not valor end
-- B4r (wowpedia: FontString:GetWordWrap): si el texto se parte en líneas (por defecto sí).
function S:GetWordWrap() return not E(self, "GetWordWrap").sinAjuste end
-- B.textoSinCargar = true imita al cliente cuando la letra propia aún no está cargada: el texto mide 0 de ancho.
anchoTextoEntero = function(e)
  if B.textoSinCargar then return 0 end
  local mayor = 0
  for linea in string.gmatch((e.texto or "") .. "\n", "(.-)\n") do
    mayor = math.max(mayor, caracteresVisibles(linea) * tamanoDe(e) * anchoPorLetra(e))
  end
  return mayor
end
-- B2r ronda 1 (wowpedia: FontString:GetStringWidth y GetUnboundedStringWidth; lo dice también un addon instalado en
-- Forever, EllesmereUIMythicTimer): con un ancho (puesto con SetWidth/SetSize o por dos anclajes a los lados) y sin partir
-- la línea, un texto que no cabe se corta con «...» y GetStringWidth da como mucho ese ancho. GetUnboundedStringWidth da
-- siempre el del texto entero.
function S:GetStringWidth()
  local e = E(self, "GetStringWidth")
  local w = anchoTextoEntero(e)
  if e.sinAjuste and w > 0 then
    local caja = e.ancho
    if caja == 0 and #e.puntos >= 2 then
      local l, _, r = rectAbsoluto(self)
      if l then caja = (r - l) / escalaEfectiva(self) end
    end
    if caja > 0 and w > caja then w = caja end
  end
  return w
end
function S:GetUnboundedStringWidth()
  return anchoTextoEntero(E(self, "GetUnboundedStringWidth"))
end
function S:GetStringHeight()
  local e = E(self, "GetStringHeight")
  if e.texto == nil or e.texto == "" then return 0 end
  local tamano, renglones = tamanoDe(e), 0
  for linea in string.gmatch(e.texto .. "\n", "(.-)\n") do
    local ancho = caracteresVisibles(linea) * tamano * 0.5
    if e.sinAjuste or e.ancho <= 0 then
      renglones = renglones + 1
    else
      renglones = renglones + math.max(1, math.ceil(ancho / e.ancho - 1e-9))
    end
  end
  return renglones * (tamano + 2)
end
function S:SetJustifyH(valor) E(self, "SetJustifyH").justificadoH = valor end
-- Tarea D3 (wowpedia: FontInstance:GetJustifyH(); por defecto un FontString va centrado).
function S:GetJustifyH() return E(self, "GetJustifyH").justificadoH or "CENTER" end
function S:SetJustifyV(valor) E(self, "SetJustifyV").justificadoV = valor end
function S:SetDrawLayer(capaDibujo) E(self, "SetDrawLayer").capa = capa(capaDibujo, "SetDrawLayer") end
function S:GetDrawLayer() return E(self, "GetDrawLayer").capa end

-- ScrollingMessageFrame: DEFAULT_CHAT_FRAME y, desde la fase 4 (tarea 11), los que crea el addon (la ventana de chat).
-- wowpedia: AddMessage(text, r, g, b), SetMaxLines (los más viejos se van), GetNumMessages, GetMessageInfo(index) (texto
-- y color; 1 = el más viejo), SetFading, ScrollUp/ScrollDown (una línea), ScrollToBottom, GetScrollOffset/
-- SetScrollOffset (0 = abajo del todo), GetMaxScrollRange y Clear; como FontInstance, SetFont, SetJustifyH y la sombra.
-- El banco no tiene motor de texto: cada mensaje es una línea y el desplazamiento máximo es el número de mensajes - 1.
-- Solo los mensajes del chat del sistema se apuntan en BANCO.llamadas.AddMessage.
local M = nuevaClase("ScrollingMessageFrame", "Frame")
darSombra(M)
local function mensajesDe(e)
  e.mensajes = e.mensajes or {}
  return e.mensajes
end
local function maximoDesplazamiento(e)
  return math.max(0, #mensajesDe(e) - 1)
end
function M:AddMessage(...)
  local e = E(self, "AddMessage")
  if e.sistema then B.anotar("AddMessage", ...) end
  local texto, r, g, b = ...
  local lista = mensajesDe(e)
  lista[#lista + 1] = {texto = tostring(texto), r = r or 1, g = g or 1, b = b or 1}
  while e.maxLineas and #lista > e.maxLineas do table.remove(lista, 1) end
end
function M:SetMaxLines(n)
  local e = E(self, "SetMaxLines")
  e.maxLineas = numero(n, "SetMaxLines", "el máximo")
  local lista = mensajesDe(e)
  while #lista > e.maxLineas do table.remove(lista, 1) end
end
function M:GetMaxLines() return E(self, "GetMaxLines").maxLineas or 128 end
function M:GetNumMessages() return #mensajesDe(E(self, "GetNumMessages")) end
function M:GetMessageInfo(i)
  local m = mensajesDe(E(self, "GetMessageInfo"))[i]
  if not m then return nil end
  return m.texto, m.r, m.g, m.b
end
function M:Clear()
  local e = E(self, "Clear")
  e.mensajes, e.desplazado = {}, 0
end
function M:SetFading(valor) E(self, "SetFading").desvanece = not not valor end
function M:GetFading() return E(self, "GetFading").desvanece == true end
function M:SetFont(ruta, tamano, banderas)
  if not B.archivoDeLetraExiste(ruta) then E(self, "SetFont"); return false end
  E(self, "SetFont").fuente = {ruta, numero(tamano, "SetFont", "el tamaño"), banderas or ""}
  if B.setFontDevuelveNil then return nil end
  return true
end
function M:GetFont()
  local f = E(self, "GetFont").fuente
  if not f then return nil end
  return f[1], f[2], f[3]
end
function M:SetJustifyH(valor) E(self, "SetJustifyH").justificadoH = valor end
function M:SetHyperlinksEnabled(valor) E(self, "SetHyperlinksEnabled").enlaces = not not valor end
function M:GetScrollOffset() return E(self, "GetScrollOffset").desplazado or 0 end
function M:SetScrollOffset(n)
  local e = E(self, "SetScrollOffset")
  numero(n, "SetScrollOffset", "el desplazamiento")
  e.desplazado = math.max(0, math.min(maximoDesplazamiento(e), math.floor(n)))
end
function M:GetMaxScrollRange() return maximoDesplazamiento(E(self, "GetMaxScrollRange")) end
function M:ScrollUp() local e = E(self, "ScrollUp"); e.desplazado = math.min(maximoDesplazamiento(e), (e.desplazado or 0) + 1) end
function M:ScrollDown() local e = E(self, "ScrollDown"); e.desplazado = math.max(0, (e.desplazado or 0) - 1) end
function M:ScrollToBottom() E(self, "ScrollToBottom").desplazado = 0 end
function M:AtBottom() return (E(self, "AtBottom").desplazado or 0) == 0 end

-- Button (tarea 15). wowpedia: Click() ejecuta OnClick(self, button, down) si el botón está activo;
-- Enable/Disable/IsEnabled; RegisterForClicks(...) (el banco solo apunta los tipos de clic: BANCO.clics(boton)).
local Bt = nuevaClase("Button", "Frame")
B.enClic = 0 -- > 0 mientras corre el OnClick de un botón (Click())
function Bt:Click(boton)
  local e = E(self, "Click")
  local script = e.scripts.OnClick
  if e.desactivado or not script then return end
  -- Comercio, tarea 9: mientras corre el OnClick hay «clic del jugador» (las compras de C_AuctionHouse lo exigen).
  B.enClic = B.enClic + 1
  B.proteger(script, self, boton or "LeftButton", false)
  B.enClic = B.enClic - 1
end
function Bt:Enable() E(self, "Enable").desactivado = nil end
function Bt:Disable() E(self, "Disable").desactivado = true end
function Bt:IsEnabled() return not E(self, "IsEnabled").desactivado end
function Bt:RegisterForClicks(...) E(self, "RegisterForClicks").clics = {...} end
function B.clics(boton) return E(boton, "B.clics").clics end
-- Comercio, tarea 13 (wowpedia: Button OnDoubleClick): en un doble clic el primero va a OnClick y el segundo a
-- OnDoubleClick si el botón lo tiene; si no lo tiene, a OnClick otra vez (dos clics seguidos).
function B.dobleClic(boton)
  boton:Click()
  local e = E(boton, "B.dobleClic")
  local doble = e.scripts.OnDoubleClick
  if not doble then
    boton:Click()
    return
  end
  if e.desactivado then return end
  B.enClic = B.enClic + 1
  B.proteger(doble, boton, "LeftButton")
  B.enClic = B.enClic - 1
end
-- Tarea D1 (wowpedia: Button:SetHighlightTexture(texture [, alphaMode]) y GetHighlightTexture()). Con una ruta crea la
-- textura de resalte (modo de mezcla «ADD» salvo que se pida otro); con un objeto Texture lo adopta.
function Bt:SetHighlightTexture(textura, modo)
  local e = E(self, "SetHighlightTexture")
  if type(textura) == "string" then
    local t = e.resalte
    if not t then
      t = crearObjeto("Texture", nil, self)
      e.resalte = t
    end
    t:SetTexture(textura)
    t:SetBlendMode(modo or "ADD")
  else
    e.resalte = textura
  end
end
function Bt:GetHighlightTexture() return E(self, "GetHighlightTexture").resalte end

-- Slider (tarea 15). wowpedia: SetMinMaxValues, SetValueStep, SetValue (recorta al rango, se ajusta al paso y lanza
-- OnValueChanged(self, value) solo si el valor cambia), GetValue, SetOrientation y SetThumbTexture.
local Sl = nuevaClase("Slider", "Frame")
function Sl:SetMinMaxValues(minimo, maximo)
  local e = E(self, "SetMinMaxValues")
  e.minimo, e.maximo = numero(minimo, "SetMinMaxValues", "el mínimo"), numero(maximo, "SetMinMaxValues", "el máximo")
  if e.valor then
    local v = math.max(e.minimo, math.min(e.maximo, e.valor))
    if v ~= e.valor then self:SetValue(v) end
  end
end
function Sl:GetMinMaxValues() local e = E(self, "GetMinMaxValues"); return e.minimo or 0, e.maximo or 1 end
function Sl:SetValueStep(paso)
  if numero(paso, "SetValueStep", "el paso") <= 0 then error("uso: SetValueStep: el paso tiene que ser mayor que 0", 2) end
  E(self, "SetValueStep").paso = paso
end
function Sl:GetValueStep() return E(self, "GetValueStep").paso or 0 end
function Sl:SetValue(valor)
  local e = E(self, "SetValue")
  numero(valor, "SetValue", "el valor")
  local minimo, maximo = e.minimo or 0, e.maximo or 1
  if e.paso then valor = minimo + math.floor((valor - minimo) / e.paso + 0.5) * e.paso end
  valor = math.max(minimo, math.min(maximo, valor))
  if valor == e.valor then return end
  e.valor = valor
  local script = e.scripts.OnValueChanged
  if script then B.proteger(script, self, valor, false) end
end
function Sl:GetValue() return E(self, "GetValue").valor or 0 end
function Sl:SetOrientation(orientacion)
  if orientacion ~= "HORIZONTAL" and orientacion ~= "VERTICAL" then
    error("uso: SetOrientation: orientación no válida " .. tostring(orientacion), 2)
  end
  E(self, "SetOrientation").orientacion = orientacion
end
function Sl:SetThumbTexture(textura) E(self, "SetThumbTexture").pulgar = textura end
-- Ronda 1 de la D3 (wowpedia: Slider:SetObeyStepOnDrag(obeyStep) / GetObeyStepOnDrag()): al arrastrar, el valor salta de
-- paso en paso. El banco solo lo guarda.
function Sl:SetObeyStepOnDrag(valor) E(self, "SetObeyStepOnDrag").obedecePaso = not not valor end
function Sl:GetObeyStepOnDrag() return E(self, "GetObeyStepOnDrag").obedecePaso == true end
function Sl:GetThumbTexture() return E(self, "GetThumbTexture").pulgar end

-- EditBox (tarea 15). wowpedia: SetText/GetText, SetMultiLine, SetMaxLetters (cuenta caracteres, no bytes: un
-- carácter UTF-8 son varios bytes), SetFocus/ClearFocus/HasFocus (lanzan OnEditFocusGained/Lost), SetAutoFocus,
-- SetFont y SetTextColor. SetText recorta al máximo de letras.
local Eb = nuevaClase("EditBox", "Frame")
darSombra(Eb)

-- Los primeros `n` caracteres UTF-8 de `texto`.
local function primerosCaracteres(texto, n)
  local cuenta, i = 0, 1
  while i <= #texto do
    local byte = string.byte(texto, i)
    if byte < 0x80 or byte >= 0xC0 then
      cuenta = cuenta + 1
      if cuenta > n then return string.sub(texto, 1, i - 1) end
    end
    i = i + 1
  end
  return texto
end

function Eb:SetText(texto)
  local e = E(self, "SetText")
  if type(texto) ~= "string" then error("uso: SetText: se esperaba texto", 2) end
  if e.maxLetras and e.maxLetras > 0 then texto = primerosCaracteres(texto, e.maxLetras) end
  if texto == (e.texto or "") then return end
  e.texto = texto
  local script = e.scripts.OnTextChanged
  if script then B.proteger(script, self, false) end
end
function Eb:GetText() return E(self, "GetText").texto or "" end
function Eb:SetMultiLine(valor) E(self, "SetMultiLine").variasLineas = not not valor end
function Eb:IsMultiLine() return E(self, "IsMultiLine").variasLineas == true end
function Eb:SetMaxLetters(n)
  E(self, "SetMaxLetters").maxLetras = numero(n, "SetMaxLetters", "el máximo")
end
function Eb:GetMaxLetters() return E(self, "GetMaxLetters").maxLetras or 0 end
function Eb:SetAutoFocus(valor) E(self, "SetAutoFocus").autoFoco = not not valor end
function Eb:SetFocus()
  local e = E(self, "SetFocus")
  if e.foco then return end
  e.foco = true
  local script = e.scripts.OnEditFocusGained
  if script then B.proteger(script, self) end
end
function Eb:ClearFocus()
  local e = E(self, "ClearFocus")
  if not e.foco then return end
  e.foco = false
  local script = e.scripts.OnEditFocusLost
  if script then B.proteger(script, self) end
end
function Eb:HasFocus() return E(self, "HasFocus").foco == true end
function Eb:SetFont(ruta, tamano, banderas)
  if not B.archivoDeLetraExiste(ruta) then E(self, "SetFont"); return false end
  E(self, "SetFont").fuente = {ruta, numero(tamano, "SetFont", "el tamaño"), banderas or ""}
  if B.setFontDevuelveNil then return nil end
  return true
end
function Eb:GetFont()
  local f = E(self, "GetFont").fuente
  if not f then return nil end
  return f[1], f[2], f[3]
end
function Eb:SetTextColor(r, g, b, a) E(self, "SetTextColor").colorTexto = {r, g, b, a or 1} end
function Eb:GetTextColor()
  local c = E(self, "GetTextColor").colorTexto or {1, 1, 1, 1}
  return c[1], c[2], c[3], c[4]
end
-- wowpedia: EditBox:SetTextInsets(left, right, top, bottom) / GetTextInsets(): lo que el texto se separa del borde.
function Eb:SetTextInsets(izq, der, arriba, abajo)
  E(self, "SetTextInsets").margenTexto = {numero(izq, "SetTextInsets", "el margen izquierdo"),
    numero(der, "SetTextInsets", "el margen derecho"), numero(arriba or 0, "SetTextInsets", "el margen de arriba"),
    numero(abajo or 0, "SetTextInsets", "el margen de abajo")}
end
function Eb:GetTextInsets()
  local m = E(self, "GetTextInsets").margenTexto or {0, 0, 0, 0}
  return m[1], m[2], m[3], m[4]
end
-- Fase 4, tarea 11 (wowpedia: EditBox:Disable/Enable/IsEnabled e Insert(text), que mete el texto donde está el cursor;
-- el banco no tiene cursor: lo pone al final, respetando SetMaxLetters, y lanza OnTextChanged).
function Eb:Disable() E(self, "Disable").desactivado = true end
function Eb:Enable() E(self, "Enable").desactivado = nil end
function Eb:IsEnabled() return not E(self, "IsEnabled").desactivado end
-- wowpedia: EditBox:HighlightText([start, end]) deja el texto elegido (sin argumentos, todo). El banco solo lo anota.
function Eb:HighlightText(inicio, fin)
  E(self, "HighlightText").elegido = {inicio or 0, fin}
end
function Eb:Insert(texto)
  if type(texto) ~= "string" then error("uso: Insert: se esperaba texto", 2) end
  self:SetText(self:GetText() .. texto)
end

-- Tarea 20 (wowpedia: Frame:EnableMouseWheel, SetClipsChildren, RegisterForDrag; ScrollFrame:SetScrollChild,
-- GetScrollChild, SetVerticalScroll, GetVerticalScroll, GetVerticalScrollRange). El banco solo guarda lo puesto.
-- SetScrollChild hace al hijo hijo del ScrollFrame (como el cliente). El rango vertical es el alto del hijo menos el del
-- ScrollFrame (0 si cabe) y SetVerticalScroll recorta a [0, rango] (el cliente lo recorta al rango del contenido).
function F:EnableMouseWheel(valor) E(self, "EnableMouseWheel").rueda = not not valor end
function F:SetClipsChildren(valor) E(self, "SetClipsChildren").recorta = not not valor end
function F:RegisterForDrag(...) E(self, "RegisterForDrag").arrastre = {...} end
local Sf = nuevaClase("ScrollFrame", "Frame")
function Sf:SetScrollChild(hijo)
  local e = E(self, "SetScrollChild")
  hijo = resolver(hijo, "SetScrollChild")
  e.hijoDesplazable = hijo
  if hijo then ponerPadre(hijo, self) end
end
function Sf:GetScrollChild() return E(self, "GetScrollChild").hijoDesplazable end
function Sf:GetVerticalScrollRange()
  local e = E(self, "GetVerticalScrollRange")
  local hijo = e.hijoDesplazable
  if not hijo then return 0 end
  return math.max(0, estado[hijo].alto - e.alto)
end
function Sf:SetVerticalScroll(valor)
  local e = E(self, "SetVerticalScroll")
  numero(valor, "SetVerticalScroll", "el desplazamiento")
  e.desplazado = math.max(0, math.min(self:GetVerticalScrollRange(), valor))
end
function Sf:GetVerticalScroll() return E(self, "GetVerticalScroll").desplazado or 0 end

-- wowpedia: UISpecialFrames es la lista de nombres de marcos que Escape cierra (el banco no cierra nada: solo la guarda).
UISpecialFrames = {}

-- Pulsar una tecla (solo para las pruebas): la reciben los marcos que se ven y tienen el teclado activado (OnKeyDown); si
-- ninguno la retiene (propagate = false) y es Escape, el cliente cierra los marcos de UISpecialFrames
-- (CloseSpecialWindows: TODOS los que se ven). Devuelve true si algún marco con teclado se quedó con la tecla.
function B.pulsarTecla(tecla)
  local receptores = {}
  for obj, e in pairs(estado) do
    if e.esMarco and e.teclado and esVisible(obj) then receptores[#receptores + 1] = obj end
  end
  local retenida = false
  for _, obj in ipairs(receptores) do
    local script = estado[obj].scripts.OnKeyDown
    if script then B.proteger(script, obj, tecla) end
    if not estado[obj].propaga then retenida = true end
  end
  if not retenida and tecla == "ESCAPE" then
    for _, nombre in ipairs(UISpecialFrames) do
      local marco = rawget(_G, nombre)
      if marco and estado[marco] and esVisible(marco) then marco:Hide() end
    end
  end
  return retenida
end

-- wowpedia: GameFontNormal es una fuente de Blizzard; GetFont() da ruta, tamaño y banderas.
GameFontNormal = crearObjeto("FontString", "GameFontNormal", nil)
GameFontNormal:SetFont("Fonts\\FRIZQT__.TTF", 12, "")

-- Tarea 16 (wowpedia: GameTooltip, un marco del sistema; SetOwner(owner, anchor) lo vacía y le pone dueño,
-- SetText(text, r, g, b) deja una sola línea, AddLine(text, r, g, b, wrap) añade otra, GetOwner, NumLines y
-- IsForbidden). Empieza oculto. BANCO.tooltipProhibido hace que IsForbidden dé verdadero; BANCO.lineasTooltip() da
-- los textos de sus líneas.
local Tt = nuevaClase("GameTooltip", "Frame")
-- Comercio, Task 20d: cada línea guarda su texto (e.lineas, «izq<TAB>der» si es doble, como las leen las pruebas de las
-- marcas) y su detalle (e.detalle: {izq, der, colorIzq, colorDer} con colores {r, g, b}). Se reflejan en las líneas de texto
-- del tooltip (GameTooltipTextLeft1…, TextRight1…) como en el cliente.
local MAX_LINEAS_TEXTO = 40
local function reflejarLinea(tt, i)
  local e = estado[tt]
  local nombre = e.nombre
  if not nombre or i > MAX_LINEAS_TEXTO then return end
  local d = e.detalle[i]
  local keys = e.lineKeys
  if not keys then
    keys = {}
    e.lineKeys = keys
  end
  local pair = keys[i]
  if not pair then
    pair = {nombre .. "TextLeft" .. i, nombre .. "TextRight" .. i}
    keys[i] = pair
  end
  local izq, der = rawget(_G, pair[1]), rawget(_G, pair[2])
  if izq then estado[izq].texto = d and d.izq or nil end
  if der then estado[der].texto = d and d.der or nil end
end
local function reflejarLineas(tt, desde, hasta)
  for i = desde, hasta do reflejarLinea(tt, i) end
end
-- sinAviso (Task 38, ronda 1): vacía sin lanzar OnTooltipCleared (ver BANCO.refrescoSinLimpiar en Tt:RefreshData).
local function vaciarTooltip(tt, sinAviso)
  local e = estado[tt]
  local antes = e.detalle and #e.detalle or 0
  e.lineas, e.detalle, e.objeto = {}, {}, nil
  reflejarLineas(tt, 1, antes)
  local dinero = e.nombre and rawget(_G, e.nombre .. "MoneyFrame1")
  if dinero then estado[dinero].mostrado = false end
  tt.shownMoneyFrames = nil
  local script = e.scripts.OnTooltipCleared
  if script and not sinAviso then B.proteger(script, tt) end
end
local function anadirLinea(tt, izq, der, ci, cd)
  local e = estado[tt]
  e.lineas, e.detalle = e.lineas or {}, e.detalle or {}
  e.lineas[#e.lineas + 1] = der ~= nil and (tostring(izq) .. "	" .. tostring(der)) or izq
  e.detalle[#e.detalle + 1] = {izq = izq, der = der, colorIzq = ci, colorDer = cd}
  reflejarLinea(tt, #e.detalle)
end
local function colorDe(r, g, b)
  if r == nil then return nil end
  return {r, g, b}
end
function Tt:SetOwner(dueno, ancla)
  E(self, "SetOwner")
  B.anotar("GameTooltip:SetOwner", dueno, ancla)
  estado[self].dueno = dueno
  vaciarTooltip(self)
end
function Tt:GetOwner() return E(self, "GetOwner").dueno end
function Tt:SetText(texto, r, g, b)
  E(self, "SetText")
  local e = estado[self]
  local antes = e.detalle and #e.detalle or 0
  e.lineas, e.detalle = {}, {}
  reflejarLineas(self, 1, antes)
  anadirLinea(self, texto, nil, colorDe(r, g, b))
end
function Tt:AddLine(texto, r, g, b)
  E(self, "AddLine")
  anadirLinea(self, texto, nil, colorDe(r, g, b))
end
-- wowpedia: GameTooltip:AddDoubleLine(textL, textR, rL, gL, bL, rR, gR, bR).
function Tt:AddDoubleLine(izq, der, lr, lg, lb, rr, rg, rb)
  E(self, "AddDoubleLine")
  anadirLinea(self, izq, der or "", colorDe(lr, lg, lb), colorDe(rr, rg, rb))
end
function Tt:ClearLines() E(self, "ClearLines"); vaciarTooltip(self) end
-- Fase 4, tarea 10 (wowpedia: GameTooltip:GetItem()): nombre y enlace del objeto que enseña, o nil. Lo pone B.mostrarTooltipObjeto.
function Tt:GetItem()
  local o = E(self, "GetItem").objeto
  if not o then return nil end
  return o.nombre, o.enlace
end
function Tt:NumLines() return #(E(self, "NumLines").lineas or {}) end
-- Comercio, Task 38 (wowpedia: GameTooltip:Show() vuelve a calcular el tamaño con sus líneas). Solo en los tooltips creados
-- con GameTooltipTemplate (e.autoTam): unas medidas aproximadas, 10 de margen y 14 por línea; GameTooltip e ItemRefTooltip
-- se quedan con el tamaño que les ponga la prueba.
local ALTO_LINEA_TT = 14
-- Ronda 1: cada Show de un tooltip se apunta en m.llamadas('GameTooltip:Show') con su nombre.
function Tt:Show()
  local e = E(self, "Show")
  B.anotar("GameTooltip:Show", e.nombre)
  if e.autoTam then
    local n = #(e.lineas or {})
    e.alto = n > 0 and (10 + ALTO_LINEA_TT * n) or 0
    if e.ancho == 0 then e.ancho = 200 end
  end
  -- F8: con e.anchoNatural (lo pone la prueba: el ancho que piden sus líneas), Show calcula el ancho respetando el mínimo.
  -- e.margenMinimo imita un cliente cuyo mínimo no cuenta el margen del tooltip (no está comprobado cómo lo cuenta Forever).
  if e.anchoNatural then
    local minimo = e.anchoMinimo or 0
    e.ancho = math.max(e.anchoNatural, minimo > 0 and (minimo + (e.margenMinimo or 0)) or 0)
  end
  return R.Show(self)
end
-- F8 (wowpedia: GameTooltip:SetMinimumWidth(width) y GetMinimumWidth()): el ancho mínimo, que se aplica en el próximo Show.
function Tt:SetMinimumWidth(ancho)
  local e = E(self, "SetMinimumWidth")
  B.anotar("GameTooltip:SetMinimumWidth", e.nombre, ancho)
  e.anchoMinimo = ancho
end
function Tt:GetMinimumWidth() return E(self, "GetMinimumWidth").anchoMinimo or 0 end
function Tt:IsForbidden() E(self, "IsForbidden"); return B.tooltipProhibido == true end
GameTooltip = crearObjeto("GameTooltip", "GameTooltip", nil)
estado[GameTooltip].esMarco = true
estado[GameTooltip].mostrado = false
-- Comercio, Task 20d: el tooltip del enlace del chat y las líneas de texto de los dos.
ItemRefTooltip = crearObjeto("GameTooltip", "ItemRefTooltip", nil)
estado[ItemRefTooltip].esMarco = true
estado[ItemRefTooltip].mostrado = false
for _, tt in ipairs({GameTooltip, ItemRefTooltip}) do
  local nombre = estado[tt].nombre
  estado[tt].lineas, estado[tt].detalle = {}, {}
  for i = 1, MAX_LINEAS_TEXTO do
    crearObjeto("FontString", nombre .. "TextLeft" .. i, tt)
    crearObjeto("FontString", nombre .. "TextRight" .. i, tt)
  end
  estado[crearObjeto("Frame", nombre .. "MoneyFrame1", tt)].mostrado = false
end
-- wowpedia: SELL_PRICE, el texto del cliente para el precio de venta. El cliente lo pinta con SetTooltipMoney (un marco de
-- monedas, <tooltip>MoneyFrame1, y tooltip.shownMoneyFrames), no como texto en TextLeftN; en el motor moderno, además, data.lines trae
-- una línea del tipo Enum.TooltipDataLineType.SellPrice con el precio.
SELL_PRICE = "Sell Price" -- como el cliente: sin los dos puntos
-- Sin argumento, el de siempre: GameTooltip. Con un tooltip (objeto) o su nombre, ese.
local function tooltipDe(t)
  if type(t) == "string" then t = rawget(_G, t) end
  return t or GameTooltip
end
function B.lineasTooltip(t) return estado[tooltipDe(t)].lineas or {} end
-- Lo mismo con todo el detalle: {{izq, der, colorIzq, colorDer}}.
function B.detalleTooltip(t) return estado[tooltipDe(t)].detalle or {} end

-- wowpedia: CreateFrame(frameType [, name, parent, template, id]). Sin padre, el marco no tiene padre.
local TIPOS_MARCO = {Frame = true, Button = true, Slider = true, EditBox = true, ScrollFrame = true, ScrollingMessageFrame = true,
  GameTooltip = true} -- Comercio, Task 38: un tooltip propio (el aparte del comercio)

-- Tarea D4 (wowpedia: Frame:IsForbidden(); SecureActionButtonTemplate, FrameXML): plantillas que el banco conoce. Cada
-- una es de un tipo de marco; un marco con plantilla segura es «protegido» (guarda el nombre en estado.plantilla).
local PLANTILLAS_SEGURAS = {SecureActionButtonTemplate = "Button"}

-- Plantillas de Blizzard que solo dan aspecto (sin acciones protegidas). Comercio, tarea 15c: la pestaña de la subasta de
-- Blizzard (LibAHTab y nuestra pestaña la usan). El banco no dibuja sus texturas: crea un botón normal.
-- Comercio, Task 38: GameTooltipTemplate, la de los tooltips (el banco le da sus líneas vacías y el tamaño al enseñarlo,
-- ver Tt:Show).
local PLANTILLAS_SIMPLES = {AuctionHouseFrameDisplayModeTabTemplate = "Button", GameTooltipTemplate = "GameTooltip"}

-- Nada ha impedido nunca crear marcos seguros salvo el combate: con B.creacionSeguraFalla = true CreateFrame falla como
-- cuando el cliente no encuentra la plantilla («Couldn't find inherited node»), para probar el plan B de los botones.
B.creacionSeguraFalla = false

-- Acciones bloqueadas en combate, en orden: {funcion = "Button:Show()", marco = nombre}.
B.bloqueos = {}

-- Un marco es protegido si lleva plantilla segura o tiene un descendiente que la lleva (en el juego un marco con hijos
-- protegidos queda restringido igual). Los marcos del sistema (UIParent) no cuentan: el addon nunca los toca.
local function esProtegido(obj)
  local e = estado[obj]
  if e.segura then return true end
  if e.sistema then return false end
  for _, hijo in ipairs(e.hijos) do
    if estado[hijo].esMarco and esProtegido(hijo) then return true end
  end
  return false
end

-- wowpedia (evento ADDON_ACTION_BLOCKED): en combate, tocar un marco protegido desde código no seguro no hace nada, apunta
-- un error de «acción bloqueada» y lanza el evento (addonName, functionName). No lanza un error de Lua. Devuelve true si
-- bloquea (la acción no se hace).
local function bloqueado(obj, metodo)
  if not B.jugador or B.jugador.enCombate ~= true then return false end
  local e = type(obj) == "table" and estado[obj]
  if not e or not e.esMarco or not esProtegido(obj) then return false end
  local funcion = e.tipo .. ":" .. metodo .. "()"
  B.anotar("ADDON_ACTION_BLOCKED", funcion, nombreDe(obj))
  B.bloqueos[#B.bloqueos + 1] = {funcion = funcion, marco = nombreDe(obj)}
  B.disparar("ADDON_ACTION_BLOCKED", "SnetForever", funcion)
  return true
end

-- Los métodos que cambian algo de un marco protegido (wowpedia: protected functions; el brief de D4 añade SetAttribute y
-- la ronda 1 SetParent, StartMoving, StopMovingOrSizing, EnableMouse y SetScale). Unos viven en Region (R) y otros en
-- Frame (F): se envuelven sobre la clase donde están, una vez. Fuera de combate, o en marcos no protegidos, hacen lo de
-- siempre.
local function envolverBloqueo(clase, metodos)
  for _, metodo in ipairs(metodos) do
    local original = clase[metodo]
    clase[metodo] = function(self, ...)
      if bloqueado(self, metodo) then return end
      return original(self, ...)
    end
  end
end
envolverBloqueo(R, {"Show", "Hide", "SetShown", "SetPoint", "SetAllPoints", "ClearAllPoints", "SetSize", "SetWidth",
  "SetHeight", "SetParent", "SetScale"})
envolverBloqueo(F, {"StartMoving", "StopMovingOrSizing", "EnableMouse"})

-- wowpedia: Frame:SetAttribute(name, value) / GetAttribute(name). El valor nil quita el atributo. SetAttribute está
-- bloqueado en combate en los marcos protegidos. OJO: el banco lo bloquea también en los ANCESTROS de un marco seguro,
-- y eso es más estricto que el juego (allí solo importa el atributo del propio marco protegido). Así un addon que
-- toque atributos de un contenedor en combate falla en las pruebas aunque el juego lo dejara pasar: es a propósito.
function F:SetAttribute(nombre, valor)
  local e = E(self, "SetAttribute")
  if type(nombre) ~= "string" then error("uso: SetAttribute: el nombre tiene que ser texto", 2) end
  if bloqueado(self, "SetAttribute") then return end
  e.atributos = e.atributos or {}
  e.atributos[nombre] = valor
end
function F:GetAttribute(nombre)
  local e = E(self, "GetAttribute")
  return e.atributos and e.atributos[nombre]
end

-- wowpedia: Frame:IsForbidden() es true en los marcos prohibidos (por ejemplo, ciertas placas de nombre de instancia).
-- El banco los marca con estado.prohibido (B.ponerPlaca con prohibida = true).
function F:IsForbidden() return E(self, "IsForbidden").prohibido == true end

-- wowpedia: Frame:SetHitRectInsets(left, right, top, bottom) / GetHitRectInsets(): lo que la zona de clic se mete desde
-- cada borde del marco (0 por defecto). El banco solo lo guarda: el ratón no usa la zona.
function F:SetHitRectInsets(izq, der, arriba, abajo)
  E(self, "SetHitRectInsets").sangrias = {numero(izq, "SetHitRectInsets", "la sangría izquierda"),
    numero(der, "SetHitRectInsets", "la sangría derecha"), numero(arriba, "SetHitRectInsets", "la sangría de arriba"),
    numero(abajo, "SetHitRectInsets", "la sangría de abajo")}
end
function F:GetHitRectInsets()
  local s = E(self, "GetHitRectInsets").sangrias or {0, 0, 0, 0}
  return s[1], s[2], s[3], s[4]
end

function CreateFrame(tipo, nombre, padre, plantilla)
  if not TIPOS_MARCO[tipo] then error('no imitado: CreateFrame("' .. tostring(tipo) .. '")', 2) end
  local tipoPlantilla
  local deTooltip = plantilla == "GameTooltipTemplate"
  if PLANTILLAS_SIMPLES[plantilla] then
    -- Plantilla de Blizzard sin nada protegido: el marco es un marco normal del tipo dado (sin sus texturas).
    if tipo ~= PLANTILLAS_SIMPLES[plantilla] then
      error("uso: CreateFrame: la plantilla " .. plantilla .. " es de un " .. PLANTILLAS_SIMPLES[plantilla] .. ", no de un " .. tipo, 2)
    end
    plantilla = nil
  end
  if plantilla ~= nil then
    tipoPlantilla = PLANTILLAS_SEGURAS[plantilla]
    if not tipoPlantilla then error("no imitado: plantilla " .. tostring(plantilla), 2) end
    if tipo ~= tipoPlantilla then
      error("uso: CreateFrame: la plantilla " .. plantilla .. " es de un " .. tipoPlantilla .. ", no de un " .. tipo, 2)
    end
    if B.creacionSeguraFalla then error("Couldn't find inherited node \"" .. plantilla .. "\"", 2) end
  end
  local f = crearObjeto(tipo, nombre, resolver(padre, "CreateFrame"))
  estado[f].esMarco = true
  B.marcos[#B.marcos + 1] = f
  if deTooltip then
    estado[f].lineas, estado[f].detalle, estado[f].autoTam = {}, {}, true
  end
  if plantilla then
    estado[f].plantilla, estado[f].segura = plantilla, true
    -- En combate no se pueden crear marcos protegidos: se apunta el bloqueo (el marco existe, sin acción posible).
    bloqueado(f, "CreateFrame")
  end
  return f
end

local function crearMarcoDelSistema(tipo, nombre, padre)
  local f = crearObjeto(tipo, nombre, padre)
  estado[f].esMarco = true
  estado[f].sistema = true
  B.marcos[#B.marcos + 1] = f
  return f
end

UIParent = crearMarcoDelSistema("Frame", "UIParent", nil)
UIParent:SetSize(1920, 1080)
DEFAULT_CHAT_FRAME = crearMarcoDelSistema("ScrollingMessageFrame", "ChatFrame1", UIParent)

-- Estado de un marco para m.marco(): por nombre global o por expresión de Lua.
function B.estadoMarco(referencia)
  local obj
  if string.find(referencia, "^[%a_][%w_]*$") then
    obj = rawget(_G, referencia)
  else
    obj = assert(cargar("return " .. referencia, "=marco"))()
  end
  local e = estado[obj]
  if not e then error("marco: " .. referencia .. " no es un marco ni una región", 2) end
  local puntos, hijos = {}, {}
  for i, p in ipairs(e.puntos) do
    puntos[i] = {punto = p.punto, relativo = p.relativo and nombreDe(p.relativo), relPunto = p.relPunto, x = p.x, y = p.y}
  end
  for i, hijo in ipairs(e.hijos) do hijos[i] = nombreDe(hijo) end
  return {
    tipo = e.tipo, mostrado = e.mostrado, visible = esVisible(obj), puntos = puntos, ancho = e.ancho,
    alto = e.alto, escala = e.escala, alfa = e.alfa, texto = e.texto, rotacion = e.rotacion,
    padre = e.padre and nombreDe(e.padre), hijos = hijos, plantilla = e.plantilla, atributos = e.atributos,
  }
end

-- BANCO.texturasDe(marco) → {escala, pantalla = {ancho, alto}, origen = {x, y}?, lista = {...}}: lo que el marco tiene
-- dibujado con texturas hijas, para pintarlo en una imagen de la pantalla. «escala» es la efectiva del marco;
-- «origen» es la esquina superior izquierda del marco en píxeles desde la esquina superior izquierda de la pantalla (sin
-- redondear; nil si el marco no tiene posición); cada textura da su color {r, g, b, a} (nil si no es de color), el
-- desplazamiento x, y de su primer anclaje respecto a la esquina del marco (y negativo hacia abajo), su tamaño y si
-- está `mostrada` (visible, con su marco).
function B.texturasDe(referencia)
  local marco = referencia
  if type(referencia) == "string" then marco = rawget(_G, referencia) end
  local e = estado[marco]
  if not e then error("texturasDe: " .. tostring(referencia) .. " no es un marco", 2) end
  local k = B.pantalla.alto / 768
  local salida = {
    escala = escalaEfectiva(marco),
    pantalla = {ancho = B.pantalla.ancho, alto = B.pantalla.alto},
    lista = {},
  }
  local l, _, _, t = rectAbsoluto(marco)
  if l then salida.origen = {x = l * k, y = (768 - t) * k} end
  for _, hijo in ipairs(e.hijos) do
    local h = estado[hijo]
    if h.tipo == "Texture" then
      local p = h.puntos[1]
      local c = h.color
      salida.lista[#salida.lista + 1] = {
        color = c and {r = c[1], g = c[2], b = c[3], a = c[4]} or nil,
        x = p and p.x or 0, y = p and p.y or 0, ancho = h.ancho, alto = h.alto, mostrada = esVisible(hijo),
      }
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Eventos y tiempo falso.
---------------------------------------------------------------------------------------------------

-- Llama al OnEvent de cada marco registrado, en orden de registro. Un error en uno no corta a los demás.
function B.disparar(nombre, ...)
  evento(nombre)
  -- Comercio, tarea 9: la casa de subastas del banco solo atiende con la ventana abierta (como el cliente).
  if nombre == "AUCTION_HOUSE_SHOW" then B.subasta.abierta = true end
  if nombre == "AUCTION_HOUSE_CLOSED" then B.subasta.abierta = false end
  local lista = {}
  for i, f in ipairs(B.eventos[nombre] or {}) do lista[i] = f end
  for _, f in ipairs(lista) do
    local e = estado[f]
    local script = e.scripts.OnEvent
    if e.eventos[nombre] and script then B.proteger(script, f, nombre, ...) end
  end
end

-- wowpedia: GetTime() da segundos con decimales; aquí avanza solo con m.avanzar().
function GetTime()
  return B.TIEMPO_BASE + B.tick * B.PASO
end

local function pasosDe(segundos, uso)
  if type(segundos) ~= "number" or segundos < 0 then error("uso: " .. uso .. ": los segundos tienen que ser >= 0", 3) end
  return math.max(1, math.ceil(segundos / B.PASO - 1e-9))
end

local ordenTemporizador = 0
local function programar(t)
  ordenTemporizador = ordenTemporizador + 1
  t.orden = ordenTemporizador
  B.temporizadores[#B.temporizadores + 1] = t
end

local Ticker = {}
local metodosTicker = {}
function metodosTicker:Cancel() self._t.cancelado = true end
function metodosTicker:IsCancelled() return self._t.cancelado end
Ticker.__index = function(_, clave)
  if metodosTicker[clave] then return metodosTicker[clave] end
  error("no imitado: " .. tostring(clave), 2)
end

-- wowpedia: C_Timer.After(seconds, callback); C_Timer.NewTicker(seconds, callback [, iterations]).
-- Un temporizador de 0 s corre en el salto siguiente, nunca en el mismo.
B.espacio("C_Timer", {
  After = function(segundos, funcion)
    local pasos = pasosDe(segundos, "C_Timer.After")
    if type(funcion) ~= "function" then error("uso: C_Timer.After(segundos, función)", 2) end
    programar({vence = B.tick + pasos, f = funcion})
  end,
  NewTicker = function(segundos, funcion, iteraciones)
    local pasos = pasosDe(segundos, "C_Timer.NewTicker")
    if type(funcion) ~= "function" then error("uso: C_Timer.NewTicker(segundos, función [, veces])", 2) end
    local t = {vence = B.tick + pasos, periodo = pasos, f = funcion, restantes = iteraciones}
    t.ticker = setmetatable({_t = t}, Ticker)
    programar(t)
    return t.ticker
  end,
})

-- Avanza el tiempo falso en saltos de PASO: en cada salto, los temporizadores vencidos y luego los OnUpdate
-- de los marcos visibles (wowpedia: OnUpdate(self, elapsed) solo corre en marcos mostrados).
function B.avanzar(segundos)
  local pasos = segundos == 0 and 0 or pasosDe(segundos, "avanzar")
  for _ = 1, pasos do
    B.tick = B.tick + 1
    local vencidos = {}
    for _, t in ipairs(B.temporizadores) do
      if not t.cancelado and t.vence <= B.tick then vencidos[#vencidos + 1] = t end
    end
    table.sort(vencidos, function(a, b)
      if a.vence ~= b.vence then return a.vence < b.vence end
      return a.orden < b.orden
    end)
    for _, t in ipairs(vencidos) do
      if not t.cancelado then
        if t.ticker then
          t.vence = B.tick + t.periodo
          if t.restantes then
            t.restantes = t.restantes - 1
            if t.restantes <= 0 then t.cancelado = true end
          end
          B.proteger(t.f, t.ticker)
        else
          t.cancelado = true
          B.proteger(t.f)
        end
      end
    end
    local vivos = {}
    for _, t in ipairs(B.temporizadores) do
      if not t.cancelado then vivos[#vivos + 1] = t end
    end
    B.temporizadores = vivos
    local marcos = {}
    for i, f in ipairs(B.marcos) do marcos[i] = f end
    for _, f in ipairs(marcos) do
      local script = estado[f].scripts.OnUpdate
      if script and esVisible(f) then B.proteger(script, f, B.PASO) end
    end
    if B.tamanoPorAnclajes then B.revisarTamanos(marcos) end
  end
end

-- Subasta, S1 (wowpedia: OnSizeChanged(self, width, height) salta cuando cambia el tamaño del marco, también el que le dan
-- sus anclajes, p. ej. al estirar su padre). Con BANCO.tamanoPorAnclajes = true, al final de cada salto de avanzar los
-- marcos visibles con OnSizeChanged cuyo tamaño ha cambiado desde el salto anterior lo reciben, como en el cliente al
-- dibujar el fotograma siguiente. La primera vez que se ve un marco solo se apunta su tamaño. Sin la opción, nada cambia.
function B.revisarTamanos(marcos)
  for _, f in ipairs(marcos) do
    local e = estado[f]
    local script = e.scripts.OnSizeChanged
    if script and esVisible(f) then
      local ancho = e.ancho ~= 0 and e.ancho or medidaPorAnclajes(f, e, "ancho") or 0
      local alto = e.alto ~= 0 and e.alto or medidaPorAnclajes(f, e, "alto") or 0
      local visto = e.tamanoVisto
      if not visto or visto[1] ~= ancho or visto[2] ~= alto then
        e.tamanoVisto = {ancho, alto}
        if visto then B.proteger(script, f, ancho, alto) end
      end
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Funciones globales de WoW.
---------------------------------------------------------------------------------------------------

-- wowpedia: hooksecurefunc([table,] "name", hookfunc): la original sigue igual y el gancho va después,
-- con los mismos argumentos; se devuelve lo que devuelve la original.
function hooksecurefunc(a, b, c)
  local tabla, nombre, gancho
  if type(a) == "string" then
    tabla, nombre, gancho = _G, a, b
  else
    tabla, nombre, gancho = a, b, c
  end
  if type(tabla) ~= "table" or type(nombre) ~= "string" or type(gancho) ~= "function" then
    error("uso: hooksecurefunc([tabla,] nombre, función)", 2)
  end
  local original = tabla[nombre]
  if type(original) ~= "function" then error("hooksecurefunc: " .. nombre .. " no es una función", 2) end
  local envoltorio = function(...)
    local r = pack(original(...))
    gancho(...)
    return unpack(r, 1, r.n)
  end
  -- El cliente también deja un envoltorio en la tabla; el banco apunta cuál era la función de antes para que las
  -- pruebas comprueben que no se ha sustituido (BANCO.originalDe(f)).
  B.originales[envoltorio] = B.originales[original] or original
  tabla[nombre] = envoltorio
end

B.originales = setmetatable({}, {__mode = "k"}) -- [envoltorio de hooksecurefunc] = función original
function B.originalDe(f) return B.originales[f] or f end

-- Fase 4, tarea 11 (FrameXML, ChatFrame.lua: ChatEdit_InsertLink(text) mete el enlace en la caja de chat activa y da true;
-- sin ninguna activa, da false). Se apunta en BANCO.llamadas. B3s: la caja de chat del banco es BANCO.chat: cerrada de
-- entrada (entonces da false, como antes); con BANCO.chat.abierta = true el enlace se suma a BANCO.chat.texto y da true.
B.chat = {abierta = false, texto = ""}
local cajaChat = {Insert = function(_, t) B.chat.texto = B.chat.texto .. tostring(t) end}
function ChatEdit_InsertLink(texto)
  B.anotar("ChatEdit_InsertLink", texto)
  if B.chat.abierta and type(texto) == "string" then
    cajaChat:Insert(texto)
    return true
  end
  return false
end

-- B3s (FrameXML, ChatFrame.lua): ChatEdit_GetActiveWindow() da la caja de chat abierta (la que escribe) o nil.
function ChatEdit_GetActiveWindow() return B.chat.abierta and cajaChat or nil end

-- B3s (FrameXML): ChatFrame_OpenChat(texto) abre la caja de chat con ese texto dentro (como Intro o «/»). No envía nada.
function ChatFrame_OpenChat(texto)
  B.anotar("ChatFrame_OpenChat", texto)
  B.chat.abierta = true
  B.chat.texto = type(texto) == "string" and texto or ""
end

-- B3s. wowpedia: SendChatMessage(msg, tipo, idioma, destino) envía un mensaje. Solo se apunta: nada nuestro debe llamarla.
function SendChatMessage(...) B.anotar("SendChatMessage", ...) end

-- B3s. wowpedia: DressUpItemLink(enlace) enseña el objeto en el probador. El banco apunta el último en BANCO.probador.
B.probador = nil
function DressUpItemLink(enlace)
  B.anotar("DressUpItemLink", enlace)
  B.probador = enlace
  return true
end

-- B3s (FrameXML, ItemButtonTemplate): HandleModifiedItemClick(enlace) es el clic con tecla de un objeto del juego. Como el
-- cliente, en sencillo: con la tecla de enlazar, ChatEdit_InsertLink (sin caja de chat abierta da false: no la abre); con
-- la del probador, DressUpItemLink. Da true si se ocupó del clic.
function HandleModifiedItemClick(enlace)
  B.anotar("HandleModifiedItemClick", enlace)
  if not enlace then return false end
  if IsModifiedClick("CHATLINK") and ChatEdit_InsertLink(enlace) then return true end
  if IsModifiedClick("DRESSUP") then return DressUpItemLink(enlace) end
  return false
end

-- wowpedia: print(...) escribe en DEFAULT_CHAT_FRAME los argumentos con tostring, separados por espacios.
function print(...)
  B.anotar("print", ...)
  local partes = {}
  for i = 1, select("#", ...) do partes[i] = tostring((select(i, ...))) end
  DEFAULT_CHAT_FRAME:AddMessage(table.concat(partes, " "))
end

SlashCmdList = {}

-- wowpedia: InCombatLockdown() es verdadero mientras el jugador está en combate (entre PLAYER_REGEN_DISABLED y
-- PLAYER_REGEN_ENABLED). En el banco es el campo `enCombate` del jugador (tarea 16).
function InCombatLockdown() return B.jugador.enCombate == true end

-- wowpedia: date(format [, time]) es el os.date de Lua con otro nombre (tarea 9: fecha de los pasos saltados).
-- Tarea 15: sin hora dada, el banco usa una fecha fija (9-nov-2026 12:00) para que los avisos y los saltados salgan
-- siempre igual.
B.FECHA = os.time({year = 2026, month = 11, day = 9, hour = 12, min = 0, sec = 0})
-- Fallo en el juego (19-nov, Task 25): el cliente de WoW Forever no tiene la librería os; date y time son globales. Se
-- guardan aquí las de Lua para que una prueba pueda quitar «os» (rawset(_G, "os", nil)) como en el juego.
local osDate = os.date
function date(formato, hora) return osDate(formato, hora or B.FECHA) end

-- wowpedia: GetLocale() devuelve el idioma del cliente («enUS», «esES», «esMX», «deDE»...). En el banco es el campo
-- `idioma` del jugador (por defecto «esES»), que se cambia con crearMaquina({jugador = {idioma = "enUS"}}).
function GetLocale()
  B.anotar("GetLocale")
  return B.jugador.idioma
end

-- Alias de WoW (wowpedia: Lua functions).
-- strsplit(delimitadores, texto [, piezas]): cada carácter de `delimitadores` corta; los campos vacíos se quedan.
function strsplit(delimitadores, texto, piezas)
  if type(delimitadores) ~= "string" or type(texto) ~= "string" then error("uso: strsplit(delimitadores, texto [, piezas])", 2) end
  local salida, inicio = {}, 1
  for i = 1, #texto do
    if (not piezas or #salida < piezas - 1) and string.find(delimitadores, string.sub(texto, i, i), 1, true) then
      salida[#salida + 1] = string.sub(texto, inicio, i - 1)
      inicio = i + 1
    end
  end
  salida[#salida + 1] = string.sub(texto, inicio)
  return unpack(salida, 1, #salida)
end

-- strtrim(texto [, caracteres]): quita por los dos lados los caracteres dados (espacio, \t, \r y \n por defecto).
function strtrim(texto, caracteres)
  if type(texto) ~= "string" then error("uso: strtrim(texto [, caracteres])", 2) end
  caracteres = caracteres or " \t\r\n"
  local inicio, fin = 1, #texto
  while inicio <= fin and string.find(caracteres, string.sub(texto, inicio, inicio), 1, true) do inicio = inicio + 1 end
  while fin >= inicio and string.find(caracteres, string.sub(texto, fin, fin), 1, true) do fin = fin - 1 end
  return string.sub(texto, inicio, fin)
end

-- wipe(t): vacía la tabla y la devuelve.
function wipe(t)
  for clave in pairs(t) do t[clave] = nil end
  return t
end

tinsert, tremove = table.insert, table.remove
format, gsub = string.format, string.gsub
strlower, strupper, strfind, strmatch = string.lower, string.upper, string.find, string.match
floor, ceil, max, min, abs = math.floor, math.ceil, math.max, math.min, math.abs

-- Equivalencias de Lua 5.1 que fengari (Lua 5.3) no trae. (unpack es local arriba: la global va con rawset.)
rawset(_G, "unpack", table.unpack)
math.atan2 = function(y, x) return arcotangente(y, x) end
-- En 5.1 math.atan(x) tiene un solo argumento: el segundo se ignora (en 5.3 daría el ángulo de atan2).
math.atan = function(x) return arcotangente(x) end
-- 5.1: load(función [, nombre]) solo acepta una función lectora; el texto se carga con loadstring(texto [, nombre]).
function load(lector, nombre)
  if type(lector) ~= "function" then
    error("load: en Lua 5.1 solo acepta una función (para cargar texto usa loadstring)", 2)
  end
  return cargar(lector, nombre)
end
function loadstring(texto, nombre)
  if type(texto) ~= "string" then error("uso: loadstring(texto [, nombre])", 2) end
  return cargar(texto, nombre or texto, "t")
end
math.pow = function(a, b) return a ^ b end
table.getn = function(t) return #t end

---------------------------------------------------------------------------------------------------
-- Jugador y mapas.
---------------------------------------------------------------------------------------------------

-- Rectángulos inventados pero coherentes (1411 cae dentro de 1414). Fórmulas del plano 3 §3.3:
-- wx = izquierda − ancho·x/100 (este-oeste, crece al oeste), wy = arriba − alto·y/100 (norte-sur, crece al norte).
-- `tipo` es el mapType de C_Map.GetMapInfo (Enum.UIMapType: 2 continente, 3 zona).
B.mapas = {
  [1411] = {nombre = "Durotar", inst = 1, padre = 1414, tipo = 3, izquierda = -2000, arriba = 1800, ancho = 5000, alto = 3500},
  [1414] = {nombre = "Kalimdor", inst = 1, tipo = 2, izquierda = 17000, arriba = 12800, ancho = 36800, alto = 24500},
  [1453] = {nombre = "Stormwind City", inst = 0, tipo = 3, izquierda = 1700, arriba = -8000, ancho = 1700, alto = 1150},
  [2521] = {nombre = "Zephras Isle", inst = 2, tipo = 3, izquierda = 5000, arriba = 5000, ancho = 2000, alto = 1400},
}

function B.aMundo(mapa, x, y)
  local r = B.mapas[mapa]
  if not r then error("el banco no tiene el rectángulo del mapa " .. tostring(mapa), 2) end
  return {wx = r.izquierda - r.ancho * x / 100, wy = r.arriba - r.alto * y / 100, inst = r.inst}
end

-- Mapa más pequeño de la instancia que contiene el punto, y la posición en él (0-100).
function B.aMapa(mundo)
  local mejor, mejorArea, mx, my
  for id, r in pairs(B.mapas) do
    if r.inst == mundo.inst then
      local x = (r.izquierda - mundo.wx) / r.ancho * 100
      local y = (r.arriba - mundo.wy) / r.alto * 100
      local area = r.ancho * r.alto
      if x >= 0 and x <= 100 and y >= 0 and y <= 100 and (not mejor or area < mejorArea) then
        mejor, mejorArea, mx, my = id, area, x, y
      end
    end
  end
  return mejor, mx, my
end

-- Valores por defecto del jugador: un orco guerrero de nivel 1 recién creado en el Valle de los Retos.
local JUGADOR = {
  nombre = "Prueba", reino = "Banco", nivel = 1, raza = "Orc", clase = "WARRIOR", faccion = "Horde", sexo = 2,
  idioma = "esES", xp = 0, xpMax = 400, dinero = 0, mapa = 1411, x = 43.3, y = 69, rumbo = 0,
  enInstancia = false, enCombate = false, fantasma = false, grupo = 0,
  -- Tarea 7: muerto (cadáver aún sin liberar) y los textos de lugar que da el juego (GetZoneText, GetSubZoneText,
  -- GetBindLocation). Valen para esES: el banco no traduce nada.
  muerto = false, zona = "Durotar", subzona = "Valle de los Retos", vinculo = "Valle de los Retos",
  -- F6b (en el juego, 20-nov: en Forever /dump GetRealmName() dio [1]=""): lo que dan las tres funciones del reino. false =
  -- lo de siempre (GetRealmName, `reino`; GetNormalizedRealmName, `reino` sin espacios ni guiones; el reino de
  -- GetPlayerInfoByGUID del propio jugador, "", como dice wowpedia para el reino propio); un texto = ese texto ("" = vacío).
  nombreReino = false, reinoNormalizado = false, reinoGuid = false,
}

-- Diario de objetos: los textos del chat al recibir un objeto (wowpedia: GlobalStrings LOOT_ITEM_SELF,
-- LOOT_ITEM_SELF_MULTIPLE, LOOT_ITEM_PUSHED_SELF, LOOT_ITEM_PUSHED_SELF_MULTIPLE, LOOT_ITEM_CREATED_SELF y
-- LOOT_ITEM_CREATED_SELF_MULTIPLE), en el idioma del jugador: «es» para esES y esMX, inglés para los demás. Se ponen
-- cada vez que cambia el jugador.
local TEXTOS_BOTIN = {
  es = {
    LOOT_ITEM_SELF = "Recibes botín: %s.", LOOT_ITEM_SELF_MULTIPLE = "Recibes botín: %sx%d.",
    LOOT_ITEM_PUSHED_SELF = "Recibes objeto: %s.", LOOT_ITEM_PUSHED_SELF_MULTIPLE = "Recibes objeto: %sx%d.",
    LOOT_ITEM_CREATED_SELF = "Creas: %s.", LOOT_ITEM_CREATED_SELF_MULTIPLE = "Creas: %sx%d.",
  },
  en = {
    LOOT_ITEM_SELF = "You receive loot: %s.", LOOT_ITEM_SELF_MULTIPLE = "You receive loot: %sx%d.",
    LOOT_ITEM_PUSHED_SELF = "You receive item: %s.", LOOT_ITEM_PUSHED_SELF_MULTIPLE = "You receive item: %sx%d.",
    LOOT_ITEM_CREATED_SELF = "You create: %s.", LOOT_ITEM_CREATED_SELF_MULTIPLE = "You create: %sx%d.",
  },
}

local function ponerTextosBotin(idioma)
  local tabla = (idioma == "esES" or idioma == "esMX") and TEXTOS_BOTIN.es or TEXTOS_BOTIN.en
  for nombre, texto in pairs(tabla) do rawset(_G, nombre, texto) end
end

-- Cambia campos del jugador. Con mapa/x/y se recalcula el mundo; con mundo, el mapa y la posición.
function B.ponerJugador(cambios)
  cambios = cambios or {}
  local j = B.jugador
  for clave, valor in pairs(cambios) do
    if JUGADOR[clave] == nil and clave ~= "apellido" and clave ~= "mundo" then
      error("jugador: campo desconocido " .. tostring(clave), 2)
    end
    j[clave] = valor
  end
  local tocaZona = cambios.mapa ~= nil or cambios.x ~= nil or cambios.y ~= nil
  if tocaZona and cambios.mundo == nil then
    j.mundo = B.aMundo(j.mapa, j.x, j.y)
  elseif cambios.mundo ~= nil and not tocaZona then
    j.mapa, j.x, j.y = B.aMapa(j.mundo)
  end
  ponerTextosBotin(j.idioma)
  return j
end

function B.iniciarJugador(cambios)
  B.jugador = {}
  for clave, valor in pairs(JUGADOR) do B.jugador[clave] = valor end
  B.jugador.mundo = B.aMundo(B.jugador.mapa, B.jugador.x, B.jugador.y)
  return B.ponerJugador(cambios)
end

---------------------------------------------------------------------------------------------------
-- Personaje y nombres que da el juego (tarea 4). Todo sale del jugador del banco (B.jugador).
---------------------------------------------------------------------------------------------------

-- Identificadores de clase y raza (wowpedia: API UnitClass / UnitRace; los tokens de raza son los de los filtros).
local ID_CLASE = {WARRIOR = 1, PALADIN = 2, HUNTER = 3, ROGUE = 4, PRIEST = 5, SHAMAN = 7, MAGE = 8, WARLOCK = 9, DRUID = 11}
local ID_RAZA = {Human = 1, Orc = 2, Dwarf = 3, NightElf = 4, Scourge = 5, Tauren = 6, Gnome = 7, Troll = 8, Goblin = 9}

local function soloJugador(api, unidad)
  if unidad ~= 'player' then
    error('no imitado: ' .. api .. " solo admite 'player' (se pidió " .. tostring(unidad) .. ')', 3)
  end
end

-- wowpedia: UnitName(unit) devuelve nombre y un segundo valor (reino, nil si es el propio). El banco usa el campo
-- `apellido` del jugador como segundo valor (nil si no está puesto) para probar la composición de la clave.
-- (UnitName, con las demás funciones de unidades, está más abajo junto a UnitGUID.)

-- wowpedia: UnitClass(unit) devuelve nombre local, token en mayúsculas e id. El nombre local del banco es el token.
function UnitClass(unidad)
  B.anotar('UnitClass', unidad)
  soloJugador('UnitClass', unidad)
  return B.jugador.clase, B.jugador.clase, ID_CLASE[B.jugador.clase]
end

-- Tarea D3 (wowpedia: CLASS_ICON_TCOORDS, constante de FrameXML): recorte {izq, der, arriba, abajo} de cada clase en la
-- textura Interface\TargetingFrame\UI-Classes-Circles (la usan 24 addons de Forever). Los valores son los de Blizzard.
CLASS_ICON_TCOORDS = {
  WARRIOR = {0, 0.25, 0, 0.25},
  MAGE = {0.25, 0.49609375, 0, 0.25},
  ROGUE = {0.49609375, 0.7421875, 0, 0.25},
  DRUID = {0.7421875, 0.98828125, 0, 0.25},
  HUNTER = {0, 0.25, 0.25, 0.5},
  SHAMAN = {0.25, 0.49609375, 0.25, 0.5},
  PRIEST = {0.49609375, 0.7421875, 0.25, 0.5},
  WARLOCK = {0.7421875, 0.98828125, 0.25, 0.5},
  PALADIN = {0, 0.25, 0.5, 0.75},
}

-- T1b (wowpedia: RAID_CLASS_COLORS, constante de FrameXML): el color de cada clase, {r, g, b, colorStr}. Los valores son
-- los de Blizzard para las clases de Classic.
RAID_CLASS_COLORS = {
  WARRIOR = {r = 0.78, g = 0.61, b = 0.43, colorStr = "ffc79c6e"},
  PALADIN = {r = 0.96, g = 0.55, b = 0.73, colorStr = "fff58cba"},
  HUNTER = {r = 0.67, g = 0.83, b = 0.45, colorStr = "ffabd473"},
  ROGUE = {r = 1.00, g = 0.96, b = 0.41, colorStr = "fffff569"},
  PRIEST = {r = 1.00, g = 1.00, b = 1.00, colorStr = "ffffffff"},
  SHAMAN = {r = 0.00, g = 0.44, b = 0.87, colorStr = "ff0070de"},
  MAGE = {r = 0.25, g = 0.78, b = 0.92, colorStr = "ff40c7eb"},
  WARLOCK = {r = 0.53, g = 0.53, b = 0.93, colorStr = "ff8787ed"},
  DRUID = {r = 1.00, g = 0.49, b = 0.04, colorStr = "ffff7d0a"},
}

-- wowpedia: UnitRace(unit) devuelve nombre local, token (el de los filtros: «Scourge», «NightElf»...) e id.
function UnitRace(unidad)
  B.anotar('UnitRace', unidad)
  soloJugador('UnitRace', unidad)
  return B.jugador.raza, B.jugador.raza, ID_RAZA[B.jugador.raza]
end

-- wowpedia: UnitFactionGroup(unit) devuelve «Horde», «Alliance» o «Neutral» y el nombre local. F6: también de las
-- unidades imitadas (target, mouseover, npc…): su campo faccion. Ronda 1: sin campo, la del jugador (lo normal: el
-- subastador de tu capital); faccion = false, nil (un PNJ neutral de los goblins), solo si la prueba lo pide.
function UnitFactionGroup(unidad)
  B.anotar('UnitFactionGroup', unidad)
  if unidad ~= 'player' then
    local u = B.unidades[unidad]
    if u == nil and not (type(unidad) == "string" and (unidad == "target" or unidad == "mouseover" or unidad == "npc"
      or unidad == "pet" or string.find(unidad, "^nameplate%d+$"))) then
      soloJugador('UnitFactionGroup', unidad)
    end
    if u == nil then
      return nil, nil
    end
    if u.faccion == false then
      return nil, nil
    end
    local f = u.faccion or B.jugador.faccion
    return f, f
  end
  return B.jugador.faccion, B.jugador.faccion
end

-- wowpedia: UnitLevel(unit). Tras subir de nivel puede ir por detrás de PLAYER_LEVEL_UP (el banco no lo adelanta).
function UnitLevel(unidad)
  B.anotar('UnitLevel', unidad)
  soloJugador('UnitLevel', unidad)
  return B.jugador.nivel
end

-- wowpedia: UnitSex(unit) devuelve 1 (desconocido), 2 (varón) o 3 (mujer).
function UnitSex(unidad)
  B.anotar('UnitSex', unidad)
  soloJugador('UnitSex', unidad)
  return B.jugador.sexo
end

-- wowpedia: GetRealmName() devuelve el nombre del reino. F6b: con nombreReino (un texto), ese texto: en Forever puede
-- dar "" (visto con /dump en Cima del Trueno el 20-nov).
function GetRealmName()
  B.anotar('GetRealmName')
  local j = B.jugador
  if type(j.nombreReino) == "string" then return j.nombreReino end
  return j.reino
end

-- wowpedia: GetNormalizedRealmName() devuelve el nombre del reino sin espacios ni guiones («Azjol-Nerub» -> «AzjolNerub»).
-- F6b: con reinoNormalizado (un texto), ese texto.
function GetNormalizedRealmName()
  B.anotar('GetNormalizedRealmName')
  local j = B.jugador
  if type(j.reinoNormalizado) == "string" then return j.reinoNormalizado end
  return (string.gsub(tostring(j.reino), "[%s%-]", ""))
end

-- wowpedia: GetPlayerInfoByGUID(guid) -> localizedClass, englishClass, localizedRace, englishRace, sex, name, realmName
-- (realmName "" si es del mismo reino que el jugador). El banco solo conoce el GUID del jugador (UnitGUID("player"));
-- de otro, nil. F6b: el reino es reinoGuid si es un texto; si no, "".
function GetPlayerInfoByGUID(guid)
  B.anotar('GetPlayerInfoByGUID', guid)
  if guid ~= "Player-1-00000001" then return nil end
  local j = B.jugador
  local reino = type(j.reinoGuid) == "string" and j.reinoGuid or ""
  return j.clase, j.clase, j.raza, j.raza, j.sexo, j.nombre, reino
end

-- Nombres que «sabe» el juego (caché del cliente): B.ponerNombre('mision' | 'item' | 'zona', id, nombre).
B.nombresJuego = {mision = {}, item = {}, zona = {}}
function B.ponerNombre(tipo, id, nombre)
  if not B.nombresJuego[tipo] then error('ponerNombre: tipo desconocido ' .. tostring(tipo), 2) end
  B.nombresJuego[tipo][id] = nombre
end

-- Estado de las misiones del jugador. El banco lo guarda en B.misiones[q] = {enDiario?, completa?, entregada?,
-- objetivos?} (m.estadoMision) y de ahí salen todas las APIs de misiones. Cada objetivo es
-- {texto, hecho, pedido, terminado}; texto es el que muestra el juego («Jabalí abatido: 3/7»).
-- El registro de misiones (GetQuestLogTitle...) lista las misiones con enDiario, por id de menor a mayor.
local function entradasDiario()
  local ids = {}
  for q, datos in pairs(B.misiones) do
    if datos.enDiario then ids[#ids + 1] = q end
  end
  table.sort(ids)
  return ids
end

-- Id de la misión en el índice i del registro, o nil si no hay tal índice.
local function misionDelIndice(i)
  if type(i) ~= 'number' then return nil end
  return entradasDiario()[i]
end

-- Misiones bajo una cabecera colapsada: C_QuestLog.GetInfo no las enumera (las demás APIs sí las ven).
B.colapsadas = {}
function B.ponerColapsadas(qs)
  B.colapsadas = {}
  for _, q in ipairs(qs or {}) do B.colapsadas[q] = true end
end

-- Lo que enumera C_QuestLog.GetInfo: las misiones no colapsadas y, si alguna lo está, 'cabecera' (colapsada) delante.
local function entradasVisibles()
  local visibles, hayColapsada = {}, false
  for _, q in ipairs(entradasDiario()) do
    if B.colapsadas[q] then hayColapsada = true else visibles[#visibles + 1] = q end
  end
  if hayColapsada then table.insert(visibles, 1, 'cabecera') end
  return visibles
end

-- wowpedia: C_QuestLog.GetTitleForQuestID(questID): título, o nil si el cliente aún no lo tiene en caché.
-- wowpedia: C_QuestLog.IsOnQuest(questID): true si la misión está en el diario.
-- wowpedia: C_QuestLog.IsQuestFlaggedCompleted(questID): true si la misión se entregó alguna vez.
-- wowpedia: C_QuestLog.IsComplete(questID): true si tiene todos los objetivos hechos (false si no está en el diario).
-- wowpedia: C_QuestLog.GetQuestObjectives(questID): lista de {text, type, finished, numFulfilled, numRequired};
--   vacía si la misión no tiene objetivos.
-- wowpedia: C_QuestLog.GetLogIndexForQuestID(questID): índice en el registro, o nil si no está en el diario.
B.espacio('C_QuestLog', {
  GetTitleForQuestID = function(q)
    B.anotar('C_QuestLog.GetTitleForQuestID', q)
    return B.nombresJuego.mision[q]
  end,
  IsOnQuest = function(q)
    B.anotar('C_QuestLog.IsOnQuest', q)
    local m = B.misiones[q]
    return m ~= nil and m.enDiario == true
  end,
  IsQuestFlaggedCompleted = function(q)
    B.anotar('C_QuestLog.IsQuestFlaggedCompleted', q)
    local m = B.misiones[q]
    return m ~= nil and m.entregada == true
  end,
  IsComplete = function(q)
    B.anotar('C_QuestLog.IsComplete', q)
    local m = B.misiones[q]
    return m ~= nil and m.enDiario == true and m.completa == true
  end,
  GetQuestObjectives = function(q)
    B.anotar('C_QuestLog.GetQuestObjectives', q)
    local lista = {}
    local m = B.misiones[q]
    for i, o in ipairs(m and m.objetivos or {}) do
      lista[i] = {text = o.texto, type = o.tipo or 'monster', finished = o.terminado == true, numFulfilled = o.hecho,
        numRequired = o.pedido}
    end
    return lista
  end,
  GetLogIndexForQuestID = function(q)
    B.anotar('C_QuestLog.GetLogIndexForQuestID', q)
    for i, id in ipairs(entradasDiario()) do
      if id == q then return i end
    end
    return nil
  end,
  -- wowpedia: C_QuestLog.GetNumQuestLogEntries(): nº de entradas del registro (con cabeceras) y nº de misiones.
  GetNumQuestLogEntries = function()
    B.anotar('C_QuestLog.GetNumQuestLogEntries')
    local visibles = entradasVisibles()
    return #visibles, #visibles
  end,
  -- wowpedia: C_QuestLog.GetInfo(logIndex): {questID, title, isHeader, isCollapsed, isHidden...}, o nil si no hay tal
  -- entrada. Lista las misiones con enDiario por id de menor a mayor. Las de B.colapsadas (m.registroColapsado) están
  -- bajo una cabecera colapsada (Classic): no se enumeran y en su lugar sale una cabecera con isCollapsed al principio.
  GetInfo = function(i)
    B.anotar('C_QuestLog.GetInfo', i)
    local q = type(i) == 'number' and entradasVisibles()[i] or nil
    if not q then return nil end
    if q == 'cabecera' then
      return {questID = 0, title = 'Zona', isHeader = true, isCollapsed = true, isHidden = false}
    end
    return {questID = q, title = B.nombresJuego.mision[q] or string.format('Misión %d', q), isHeader = false,
      isCollapsed = false, isHidden = false}
  end,
})

-- wowpedia: IsQuestFlaggedCompleted(questID) (global de Classic): true si la misión se entregó alguna vez.
function IsQuestFlaggedCompleted(q)
  B.anotar('IsQuestFlaggedCompleted', q)
  local m = B.misiones[q]
  return m ~= nil and m.entregada == true
end

-- wowpedia: GetQuestsCompleted([table]): tabla {[questId] = true} con las misiones entregadas (nueva en cada llamada).
function GetQuestsCompleted(destino)
  B.anotar('GetQuestsCompleted', destino)
  local t = destino or {}
  for q, m in pairs(B.misiones) do
    if m.entregada == true then t[q] = true end
  end
  return t
end

-- wowpedia: GetNumQuestLogEntries() devuelve nº de entradas del registro (con cabeceras) y nº de misiones.
function GetNumQuestLogEntries()
  B.anotar('GetNumQuestLogEntries')
  local n = #entradasDiario()
  return n, n
end

-- wowpedia: GetQuestLogTitle(index) (Classic) devuelve title, level, suggestedGroup, isHeader, isCollapsed,
-- isComplete (1 completa, -1 fallida, nil en curso), frequency, questID... Sin entrada, nada.
-- El banco no imita cabeceras: todas las entradas son misiones.
function GetQuestLogTitle(i)
  B.anotar('GetQuestLogTitle', i)
  local q = misionDelIndice(i)
  if not q then return nil end
  local titulo = B.nombresJuego.mision[q] or string.format('Misión %d', q)
  return titulo, 1, 0, false, false, B.misiones[q].completa == true and 1 or nil, 1, q
end

-- wowpedia: GetNumQuestLeaderBoards(questIndex): nº de objetivos de la misión del registro (0 si no hay).
function GetNumQuestLeaderBoards(i)
  B.anotar('GetNumQuestLeaderBoards', i)
  local q = misionDelIndice(i)
  if not q then return 0 end
  return #(B.misiones[q].objetivos or {})
end

-- wowpedia: GetQuestLogLeaderBoard(objIndex [, questIndex]) devuelve desc, objectiveType, isCompleted.
-- Sin objetivo con ese índice, nada. El banco exige el índice de la misión.
function GetQuestLogLeaderBoard(k, i)
  B.anotar('GetQuestLogLeaderBoard', k, i)
  local q = misionDelIndice(i)
  local o = q and (B.misiones[q].objetivos or {})[k]
  if not o then return nil end
  return o.texto, o.tipo or 'monster', o.terminado == true
end

-- wowpedia: C_Item.GetItemNameByID(itemInfo): nombre, o nil si el objeto no está en caché.
-- wowpedia: C_Item.GetItemIconByID(itemInfo): icono (id de archivo), o nil si el objeto no está en caché.
--   Las pruebas ponen los iconos en BANCO.iconosItem[id].
B.iconosItem = {}
B.espacio('C_Item', {
  GetItemNameByID = function(id)
    B.anotar('C_Item.GetItemNameByID', id)
    return B.nombresJuego.item[id]
  end,
  GetItemIconByID = function(id)
    B.anotar('C_Item.GetItemIconByID', id)
    return B.iconosItem[id]
  end,
})

-- wowpedia: C_Map.GetAreaInfo(areaID): nombre de la zona, en el idioma del cliente.
-- wowpedia: C_Map.GetBestMapForUnit(unit): uiMapID del mapa más pequeño que contiene a la unidad; nil si no hay
-- (dentro de una mazmorra, el plano 2 §4 lo da por nulo). El banco devuelve el mapa del jugador, o nil si
-- enInstancia.
--
-- Tarea 13 (coordenadas, plano 3 §2.2 y §3.3; HereBeDragons-2.0.lua:156-212):
-- wowpedia: C_Map.GetWorldPosFromMapPos(uiMapID, mapPosition): instancia (continentID) y un Vector2D en el mundo.
--   Como en HereBeDragons (`top, left = vector:GetXY()`), la X del vector es la coordenada norte-sur (wy) y la Y la
--   este-oeste (wx). nil si el banco no tiene el rectángulo del mapa.
-- wowpedia: C_Map.GetMapRectOnMap(uiMapID, topUiMapID): minX, maxX, minY, maxY (0-1) del mapa dentro del de arriba.
--   El banco lo calcula con los rectángulos (misma instancia) o da lo puesto con B.ponerRectEnMapa; si no, nil.
-- wowpedia: C_Map.GetPlayerMapPosition(uiMapID, unit): Vector2D con la posición en el mapa (0-1); nil dentro de
--   una instancia o si el jugador no está en la instancia de ese mapa.
-- wowpedia: C_Map.GetMapInfo(uiMapID): {mapID, name, mapType, parentMapID}; nil si el mapa no existe.
--   mapType es Enum.UIMapType (2 continente, 3 zona); parentMapID 0 = sin padre en el banco.
B.rectsEnMapa = {} -- ["hijo:padre"] = {minX, maxX, minY, maxY}

function B.ponerRectEnMapa(hijo, padre, minX, maxX, minY, maxY)
  B.rectsEnMapa[string.format("%d:%d", hijo, padre)] = {minX, maxX, minY, maxY}
end

B.espacio('C_Map', {
  GetAreaInfo = function(areaId)
    B.anotar('C_Map.GetAreaInfo', areaId)
    return B.nombresJuego.zona[areaId]
  end,
  GetBestMapForUnit = function(unidad)
    B.anotar('C_Map.GetBestMapForUnit', unidad)
    soloJugador('C_Map.GetBestMapForUnit', unidad)
    if B.jugador.enInstancia then return nil end
    return B.jugador.mapa
  end,
  GetWorldPosFromMapPos = function(mapa, posicion)
    B.anotar('C_Map.GetWorldPosFromMapPos', mapa, posicion)
    local r = B.mapas[mapa]
    if not r then return nil end
    local x, y = posicion:GetXY()
    local w = B.aMundo(mapa, x * 100, y * 100)
    return r.inst, CreateVector2D(w.wy, w.wx)
  end,
  GetMapRectOnMap = function(hijo, padre)
    B.anotar('C_Map.GetMapRectOnMap', hijo, padre)
    local puesto = B.rectsEnMapa[string.format("%d:%d", hijo, padre)]
    if puesto then return puesto[1], puesto[2], puesto[3], puesto[4] end
    local h, p = B.mapas[hijo], B.mapas[padre]
    if not h or not p or h.inst ~= p.inst then return nil end
    return (p.izquierda - h.izquierda) / p.ancho, (p.izquierda - h.izquierda + h.ancho) / p.ancho,
      (p.arriba - h.arriba) / p.alto, (p.arriba - h.arriba + h.alto) / p.alto
  end,
  GetPlayerMapPosition = function(mapa, unidad)
    B.anotar('C_Map.GetPlayerMapPosition', mapa, unidad)
    soloJugador('C_Map.GetPlayerMapPosition', unidad)
    local r, w = B.mapas[mapa], B.jugador.mundo
    if B.jugador.enInstancia or not r or r.inst ~= w.inst then return nil end
    return CreateVector2D((r.izquierda - w.wx) / r.ancho, (r.arriba - w.wy) / r.alto)
  end,
  GetMapInfo = function(mapa)
    B.anotar('C_Map.GetMapInfo', mapa)
    local r = B.mapas[mapa]
    if not r then return nil end
    return {mapID = mapa, name = r.nombre, mapType = r.tipo, parentMapID = r.padre or 0}
  end,
  -- Pines de la IA como «Marcador de mapa» (ver B.marcador más abajo).
  SetUserWaypoint = function(punto)
    B.anotar('C_Map.SetUserWaypoint', punto)
    if type(punto) ~= "table" or type(punto.uiMapID) ~= "number" or type(punto.position) ~= "table" then
      error("uso: C_Map.SetUserWaypoint(uiMapPoint)", 2)
    end
    if B.mapasSinMarcador[punto.uiMapID] then error("C_Map.SetUserWaypoint: no se puede en el mapa " .. punto.uiMapID, 2) end
    local x, y = punto.position:GetXY()
    B.ponerMarcador({mapa = punto.uiMapID, x = x, y = y})
  end,
  GetUserWaypoint = function()
    B.anotar('C_Map.GetUserWaypoint')
    local mk = B.marcador.punto
    if not mk or B.marcadorIlegible then return nil end
    return {uiMapID = mk.mapa, position = CreateVector2D(mk.x, mk.y), z = 0}
  end,
  HasUserWaypoint = function()
    B.anotar('C_Map.HasUserWaypoint')
    return B.marcador.punto ~= nil
  end,
  ClearUserWaypoint = function()
    B.anotar('C_Map.ClearUserWaypoint')
    B.ponerMarcador(nil)
  end,
  CanSetUserWaypointOnMap = function(mapa)
    B.anotar('C_Map.CanSetUserWaypointOnMap', mapa)
    return B.mapas[mapa] ~= nil and not B.mapasSinMarcador[mapa]
  end,
})

-- Pines de la IA como «Marcador de mapa» de Blizzard (el del botón del mapa o Ctrl+clic: flecha de seguimiento y
-- distancia). wowpedia: C_Map.SetUserWaypoint(point) pone el marcador (uno solo); C_Map.GetUserWaypoint() da el
-- UiMapPoint puesto ({uiMapID, position = Vector2D 0-1, z}) o nil; C_Map.HasUserWaypoint(); C_Map.ClearUserWaypoint()
-- lo quita (y deja de seguirse); C_Map.CanSetUserWaypointOnMap(uiMapID) dice si en ese mapa se puede poner.
-- wowpedia: UiMapPoint.CreateFromCoordinates(mapID, x, y [, z]) crea el punto (x, y en 0-1).
-- wowpedia: C_SuperTrack.SetSuperTrackedUserWaypoint(superTracked) / IsSuperTrackingUserWaypoint(): seguirlo con la
-- flecha del juego.
-- wowpedia: USER_WAYPOINT_UPDATED () salta cada vez que cambia el marcador (puesto por un addon o por el jugador, o
-- quitado). El banco lo lanza en el momento, dentro de la llamada (el caso más exigente).
-- wowpedia: SUPER_TRACKING_CHANGED () salta cuando cambia lo que se sigue con la flecha del juego (el marcador, una
-- misión...).
-- El cliente guarda el marcador tras un /reload: B.marcador pasa por recargar(). BANCO.mapasSinMarcador[mapa] = true
-- hace que no se pueda poner en ese mapa; BANCO.ponerMarcadorJugador(mapa, x, y) (x, y en 0-100) simula el que pone el
-- jugador a mano; BANCO.seguirOtraCosa() que el jugador pasa a seguir otra cosa (una misión) con el marcador puesto; y
-- BANCO.marcadorIlegible = true que HasUserWaypoint dice que hay pero GetUserWaypoint aún no lo da (durante la carga).
B.marcador = {punto = nil, seguido = false}
B.mapasSinMarcador = {}
B.marcadorIlegible = false

local function ponerSeguido(valor)
  if B.marcador.seguido ~= valor then
    B.marcador.seguido = valor
    B.disparar("SUPER_TRACKING_CHANGED")
  end
end

function B.ponerMarcador(punto)
  B.marcador.punto = punto
  B.disparar("USER_WAYPOINT_UPDATED")
  if not punto then ponerSeguido(false) end
end

function B.seguirOtraCosa()
  ponerSeguido(false)
end

function B.ponerMarcadorJugador(mapa, x, y)
  B.ponerMarcador({mapa = mapa, x = x / 100, y = y / 100})
end

local META_PUNTO_MAPA = {__index = function(_, clave)
  if type(clave) == "string" and string.find(clave, "^%u") then error("no imitado: UiMapPoint:" .. clave, 2) end
  return nil
end}
B.espacio("UiMapPoint", {
  CreateFromCoordinates = function(mapa, x, y, z)
    B.anotar('UiMapPoint.CreateFromCoordinates', mapa, x, y, z)
    if type(mapa) ~= "number" or type(x) ~= "number" or type(y) ~= "number" then
      error("uso: UiMapPoint.CreateFromCoordinates(mapID, x, y [, z])", 2)
    end
    return setmetatable({uiMapID = mapa, position = CreateVector2D(x, y), z = z or 0}, META_PUNTO_MAPA)
  end,
})

B.espacio("C_SuperTrack", {
  SetSuperTrackedUserWaypoint = function(seguir)
    B.anotar('C_SuperTrack.SetSuperTrackedUserWaypoint', seguir)
    ponerSeguido(seguir == true and B.marcador.punto ~= nil)
  end,
  IsSuperTrackingUserWaypoint = function()
    B.anotar('C_SuperTrack.IsSuperTrackingUserWaypoint')
    return B.marcador.seguido == true
  end,
})

-- Tarea 18 (pines del mapa del mundo; plano 3 §3.1, §3.5 y §7): el mapa del mundo de Blizzard, WorldMapFrame, un
-- Frame que empieza oculto (wowpedia: WorldMapFrame es el MapCanvasFrame del cliente; sus métodos vienen de
-- MapCanvasMixin: GetMapID, GetCanvas, GetCanvasScale, OnMapChanged, OnCanvasScaleChanged, AddDataProvider).
--   * GetCanvas() devuelve el lienzo, un hijo de 1000x667 (en el juego, WorldMapFrame.ScrollContainer.Child).
--   * GetMapID() devuelve BANCO.mapaMundo (el mapa abierto, 1411 por defecto) y GetCanvasScale() BANCO.escalaLienzo
--     (el zoom del lienzo, 1 por defecto).
--   * OnMapChanged y OnCanvasScaleChanged son funciones propias del falso (BANCO.WorldMapFrameOriginal) que solo
--     apuntan la llamada en m.llamadas("WorldMapFrame:OnMapChanged" / "WorldMapFrame:OnCanvasScaleChanged"); el addon
--     las engancha con hooksecurefunc y los tests comparan con BANCO.originalDe.
--   * AddDataProvider apunta la llamada en m.llamadas("AddDataProvider"): el addon no debe usarlo (restricciones).
--   * pinPools es una tabla vacía (el addon no debe escribir en ella).
-- Con sinApi("WorldMapFrame") o sinApi("WorldMapFrame.OnCanvasScaleChanged") faltan, como en un cliente sin ellos.
B.mapaMundo = 1411
B.escalaLienzo = 1
WorldMapFrame = crearMarcoDelSistema("Frame", "WorldMapFrame", UIParent)
estado[WorldMapFrame].mostrado = false
do
  local lienzo = crearMarcoDelSistema("Frame", "WorldMapFrameLienzo", WorldMapFrame)
  lienzo:SetSize(1000, 667)
  local originales = {
    OnMapChanged = function() B.anotar("WorldMapFrame:OnMapChanged") end,
    OnCanvasScaleChanged = function() B.anotar("WorldMapFrame:OnCanvasScaleChanged") end,
  }
  B.WorldMapFrameOriginal = originales
  rawset(WorldMapFrame, "GetCanvas", function() return lienzo end)
  rawset(WorldMapFrame, "GetMapID", function() return B.mapaMundo end)
  rawset(WorldMapFrame, "GetCanvasScale", function() return B.escalaLienzo end)
  rawset(WorldMapFrame, "OnMapChanged", originales.OnMapChanged)
  rawset(WorldMapFrame, "OnCanvasScaleChanged", originales.OnCanvasScaleChanged)
  rawset(WorldMapFrame, "AddDataProvider", function(_, proveedor) B.anotar("AddDataProvider", proveedor) end)
  rawset(WorldMapFrame, "pinPools", {})
end

-- Tarea 19 (minimapa). Todo sale de BANCO.minimapa = {ancho, alto, zoom, radio, rotar, forma, interior}:
--   * Minimap es un marco del sistema de 140x140, mostrado; GetZoom() da el nivel de zoom (0 = el más alejado, 5 =
--     el más cercano; wowpedia: Minimap:GetZoom, rango 0-5 en Classic) y GetWidth/GetHeight son los de Region.
--   * C_Minimap.GetViewRadius() da el radio de vista en yardas (B.minimapa.radio, 200 por defecto). No se sabe si
--     existe en Classic Era (el addon tiene respaldo): con sinApi("C_Minimap.GetViewRadius") falta.
--   * GetCVar("rotateMinimap") da "1" si B.minimapa.rotar y "0" si no (los CVar son siempre texto, wowpedia:
--     API_GetCVar); cualquier otro CVar da «no imitado».
--   * GetMinimapShape() NO es de Blizzard: es la convención de los addons de minimapa (LibDBIcon, Chinchilla...), que
--     la definen y devuelven "ROUND", "SQUARE", "CORNER-TOPLEFT"...; el cliente sin ellos no la tiene (el addon la
--     usa solo si existe). El banco la imita con B.minimapa.forma ("ROUND" por defecto).
--   * IsIndoors() (wowpedia: API_IsIndoors) da B.minimapa.interior: sirve para elegir la escala interior del minimapa.
B.minimapa = {ancho = 140, alto = 140, zoom = 0, radio = 200, rotar = false, forma = "ROUND", interior = false}
Minimap = crearMarcoDelSistema("Frame", "Minimap", UIParent)
Minimap:SetSize(B.minimapa.ancho, B.minimapa.alto)
estado[Minimap].mostrado = true
rawset(Minimap, "GetZoom", function() return B.minimapa.zoom end)
B.espacio("C_Minimap", {
  GetViewRadius = function()
    B.anotar("C_Minimap.GetViewRadius")
    return B.minimapa.radio
  end,
})
function GetCVar(nombre)
  B.anotar("GetCVar", nombre)
  if nombre == "rotateMinimap" then return B.minimapa.rotar and "1" or "0" end
  if B.cvars[nombre] ~= nil then return B.cvars[nombre] end
  error("no imitado: CVar " .. tostring(nombre), 2)
end
function GetMinimapShape() B.anotar("GetMinimapShape"); return B.minimapa.forma end
function IsIndoors() B.anotar("IsIndoors"); return B.minimapa.interior == true end

-- Tarea 20. wowpedia: GetCursorPosition() da la posición del ratón en píxeles de pantalla, sin la escala de la
-- interfaz (el addon divide entre GetEffectiveScale del marco); en el banco es BANCO.cursor = {x, y}. Minimap:GetCenter()
-- da el centro del minimapa en coordenadas de interfaz (BANCO.minimapa.centro = {x, y}); el banco no tiene motor de anclas.
B.cursor = {x = 0, y = 0}
function GetCursorPosition() return B.cursor.x, B.cursor.y end
-- Árbol (ui/piezas/arbol.lua). wowpedia: Region:IsMouseOver() y MouseIsOver(región) dicen si el cursor está dentro del
-- rectángulo de la región. En el banco se compara BANCO.cursor (en píxeles, dividido entre la escala de la región) con
-- GetLeft/GetRight/GetBottom/GetTop; si la región no tiene sitio calculable, no está el cursor encima.
function R:IsMouseOver()
  E(self, "IsMouseOver")
  -- Una sola consulta de la disposición (antes eran cuatro: GetLeft, GetBottom, GetRight y GetTop).
  local l, b, r, t = rectAbsoluto(self)
  if not (l and b and r and t) then return false end
  local escala = self:GetEffectiveScale()
  local izquierda, abajo, derecha, arriba = l / escala, b / escala, r / escala, t / escala
  local x, y = B.cursor.x / escala, B.cursor.y / escala
  return x >= izquierda and x <= derecha and y >= abajo and y <= arriba
end
function MouseIsOver(region) B.anotar("MouseIsOver"); return region:IsMouseOver() end
B.minimapa.centro = {x = 1800, y = 900}
rawset(Minimap, "GetCenter", function() return B.minimapa.centro.x, B.minimapa.centro.y end)

-- Tarea 20 (wowpedia: Settings.RegisterCanvasLayoutCategory(frame, name) -> category; Settings.RegisterAddOnCategory
-- (category); en motores anteriores InterfaceOptions_AddCategory(frame), con frame.name). Se apuntan las llamadas
-- (con el nombre del marco) en m.llamadas(...). Con sinApi("Settings") o sinApi("InterfaceOptions_AddCategory") faltan.
B.espacio("Settings", {
  RegisterCanvasLayoutCategory = function(marco, nombre)
    B.anotar("Settings.RegisterCanvasLayoutCategory", nombreDe(marco), nombre)
    return {marco = marco, nombre = nombre, GetID = function() return 1 end}
  end,
  RegisterAddOnCategory = function(categoria)
    B.anotar("Settings.RegisterAddOnCategory", categoria and categoria.nombre)
  end,
})
function InterfaceOptions_AddCategory(marco)
  B.anotar("InterfaceOptions_AddCategory", nombreDe(marco), marco.name)
end

-- wowpedia: CreateVector2D(x, y): un Vector2DMixin con los campos x, y y el método GetXY().
local METODOS_VECTOR = {GetXY = function(v) return v.x, v.y end}
local META_VECTOR = {__index = function(_, clave)
  local m = METODOS_VECTOR[clave]
  if m == nil and type(clave) == "string" and string.find(clave, "^%u") then error("no imitado: " .. clave, 2) end
  return m
end}
function CreateVector2D(x, y)
  B.anotar('CreateVector2D', x, y)
  return setmetatable({x = x, y = y}, META_VECTOR)
end

-- wowpedia: UnitPosition(unit) devuelve posY, posX, posZ e instanceID: primero la coordenada norte-sur (wy) y luego
-- la este-oeste (wx), como lee HereBeDragons (HBD:661-668). Dentro de una instancia no da nada (plano 2 §4).
function UnitPosition(unidad)
  B.anotar('UnitPosition', unidad)
  soloJugador('UnitPosition', unidad)
  if B.jugador.enInstancia then return nil end
  local w = B.jugador.mundo
  return w.wy, w.wx, 0, w.inst
end

-- wowpedia: GetPlayerFacing(): rumbo en radianes, 0 = norte y creciendo en sentido antihorario; nil dentro de una
-- instancia (restringido). En el banco es B.jugador.rumbo.
function GetPlayerFacing()
  B.anotar('GetPlayerFacing')
  if B.jugador.enInstancia then return nil end
  return B.jugador.rumbo
end

---------------------------------------------------------------------------------------------------
-- Nivel, dinero, objetos y lugar (tarea 7). Todo sale del jugador y de B.objetos del banco.
---------------------------------------------------------------------------------------------------

-- wowpedia: UnitXP(unit) / UnitXPMax(unit): experiencia dentro del nivel y la que hace falta para subir.
function UnitXP(unidad)
  B.anotar('UnitXP', unidad)
  soloJugador('UnitXP', unidad)
  return B.jugador.xp
end

function UnitXPMax(unidad)
  B.anotar('UnitXPMax', unidad)
  soloJugador('UnitXPMax', unidad)
  return B.jugador.xpMax
end

-- wowpedia: GetMoney() devuelve el dinero del jugador en cobre (sin el valor de los objetos).
function GetMoney()
  B.anotar('GetMoney')
  return B.jugador.dinero
end

-- wowpedia: GetNumGroupMembers(): personas del grupo o banda, el jugador incluido; 0 si va solo. En el banco es
-- B.jugador.grupo (0 por defecto).
function GetNumGroupMembers()
  B.anotar('GetNumGroupMembers')
  return B.jugador.grupo or 0
end

-- wowpedia: GetItemCount(itemID [, includeBank]): unidades que lleva el jugador, equipadas incluidas; con
-- includeBank, también las del banco. B.objetos[id] = {cuenta = en bolsas, banco = en el banco, equipadoEn = hueco}.
local function cuentaDeObjeto(api, id, incluirBanco)
  B.anotar(api, id, incluirBanco)
  local o = B.objetos[id]
  if not o then return 0 end
  local n = o.cuenta or 0
  if incluirBanco then n = n + (o.banco or 0) end
  if o.equipadoEn then n = n + 1 end
  return n
end
function GetItemCount(id, incluirBanco) return cuentaDeObjeto('GetItemCount', id, incluirBanco) end
-- Tarea 22: en WoW Forever no existe GetItemCount, solo C_Item.GetItemCount (mismos argumentos y resultado).
rawset(C_Item, 'GetItemCount', function(id, incluirBanco) return cuentaDeObjeto('C_Item.GetItemCount', id, incluirBanco) end)

-- wowpedia: GetInventoryItemID(unit, slot): ID del objeto equipado en el hueco, o nil si está vacío. Con varios
-- objetos puestos en el mismo hueco (el banco no lo impide) gana el de menor ID, para que sea determinista.
function GetInventoryItemID(unidad, hueco)
  B.anotar('GetInventoryItemID', unidad, hueco)
  soloJugador('GetInventoryItemID', unidad)
  local mejor
  for id, o in pairs(B.objetos) do
    if o.equipadoEn == hueco and (not mejor or id < mejor) then mejor = id end
  end
  return mejor
end

-- wowpedia: GetZoneText() / GetRealZoneText() / GetSubZoneText() / GetBindLocation(): textos localizados.
function GetZoneText() B.anotar('GetZoneText'); return B.jugador.zona end
-- GetRealZoneText(id): con un identificador de instancia (la forma que usa OpenMap, Map/Dungeons.lua) da el nombre de
-- esa zona en el idioma del cliente: B.zonasReales[id], o cadena vacía si el banco no la tiene. Sin argumento, la zona
-- del jugador.
B.zonasReales = {}
function GetRealZoneText(id)
  B.anotar('GetRealZoneText', id)
  if id == nil then return B.jugador.zona end
  return B.zonasReales[id] or ''
end
-- wowpedia: GetQuestDifficultyColor(nivelMision) devuelve la tabla {r, g, b} del color de dificultad. Solo existe en el
-- banco si la prueba pone B.colorDificultad = {r, g, b}; si no, da «no imitado» (el addon la llama protegida).
function GetQuestDifficultyColor(nivel)
  B.anotar('GetQuestDifficultyColor', nivel)
  if not B.colorDificultad then error('no imitado: GetQuestDifficultyColor', 2) end
  return B.colorDificultad
end
function GetSubZoneText() B.anotar('GetSubZoneText'); return B.jugador.subzona end
function GetBindLocation() B.anotar('GetBindLocation'); return B.jugador.vinculo end

-- wowpedia: UnitIsDeadOrGhost(unit) / UnitIsGhost(unit).
function UnitIsDeadOrGhost(unidad)
  B.anotar('UnitIsDeadOrGhost', unidad)
  soloJugador('UnitIsDeadOrGhost', unidad)
  return B.jugador.muerto == true or B.jugador.fantasma == true
end

function UnitIsGhost(unidad)
  B.anotar('UnitIsGhost', unidad)
  soloJugador('UnitIsGhost', unidad)
  return B.jugador.fantasma == true
end

-- Tarea 17 (wowpedia: PlaySound(soundKitID [, channel, forceNoDuplicates, runFinishCallback]) devuelve willPlay y
-- soundHandle; SOUNDKIT es la tabla global de identificadores de sonido, con MAP_PING = 3175). El banco no suena:
-- apunta la llamada en m.llamadas("PlaySound") y devuelve true y un manejador falso.
SOUNDKIT = {MAP_PING = 3175, RAID_WARNING = 8959} -- RAID_WARNING: el aviso del sniper (comercio, tarea 14)
function PlaySound(id, ...)
  if type(id) ~= "number" then error("uso: PlaySound: se esperaba el número de un SOUNDKIT", 2) end
  B.anotar("PlaySound", id, ...)
  return true, 1
end

-- Tarea 5 de la fase 4 (wowpedia: PlaySoundFile(soundFile [, channel]) devuelve willPlay y soundHandle; StopSound(handle)
-- para un sonido). Sin la opción addonsDir del banco no hay archivos y nunca suena (false). Con ella, B.sonidoExiste (la
-- pone maquina.js) dice si el archivo existe ahora y estaba en la foto de senales/ sacada al crear la máquina.
B.sonando = {}
local ultimoSonido = 0
function PlaySoundFile(ruta, canal)
  if type(ruta) ~= "string" and type(ruta) ~= "number" then error("uso: PlaySoundFile: se esperaba una ruta o un id de archivo", 2) end
  B.anotar("PlaySoundFile", ruta, canal)
  if type(ruta) ~= "string" or not B.sonidoExiste or not B.sonidoExiste(ruta) then return false end
  ultimoSonido = ultimoSonido + 1
  B.sonando[ultimoSonido] = true
  return true, ultimoSonido
end

function StopSound(manejador)
  B.anotar("StopSound", manejador)
  B.sonando[manejador] = nil
end

-- wowpedia: IsInInstance() devuelve inInstance y el tipo de instancia («party», «raid»... o «none»).
function IsInInstance()
  B.anotar('IsInInstance')
  if B.jugador.enInstancia then return true, "party" end
  return false, "none"
end

local CAMPOS_MISION = {enDiario = true, completa = true, entregada = true, objetivos = true}

function B.ponerMision(q, datos)
  local m = B.misiones[q] or {}
  B.misiones[q] = m
  for clave, valor in pairs(datos or {}) do
    if not CAMPOS_MISION[clave] then error("estadoMision: campo desconocido " .. tostring(clave), 2) end
    m[clave] = valor
  end
  return m
end

function B.ponerObjeto(id, cuenta, opciones)
  opciones = opciones or {}
  B.objetos[id] = {cuenta = cuenta, banco = opciones.banco, equipadoEn = opciones.equipadoEn}
end

---------------------------------------------------------------------------------------------------
-- Servicios, hechizos, auras, profesiones, reputación y viajes (tarea 8). Todo el estado vive en B.servicios y
-- sobrevive a un /reload. Se llena desde las pruebas con las funciones B.poner*.
---------------------------------------------------------------------------------------------------

B.servicios = {
  npc = nil,          -- GUID del PNJ con el que se interactúa (unidad "npc")
  hechizos = {},      -- [id] = nombre que da GetSpellInfo
  conocidos = {},     -- [id] = true: hechizos que conoce el jugador
  habilidades = {},   -- lista de {nombre, rango, max, cabecera?}: las líneas de GetSkillLineInfo
  facciones = {},     -- [id] = {nombre, rango 1-8, minimo, maximo, actual} (valores absolutos, como el juego)
  auras = {},         -- lista de {spellId, nombre, cuenta, duracion, expira (0 = permanente), perjuicio?}
  recarga = {spell = {}, item = {}}, -- [id] = {inicio, duracion}
  taxi = false,       -- UnitOnTaxi("player")
  nodos = {},         -- lista de {nodeID, name, state}: C_TaxiMap.GetAllTaxiNodes
  mapaTaxi = 1414,    -- GetTaxiMapID()
  opcionesCharla = {}, -- lista de {gossipOptionID, name}: C_GossipInfo.GetOptions
}
local S = B.servicios

-- Tarea D4 (B5): unidades que no son el jugador. wowpedia: UnitName(unit), UnitGUID(unit), UnitIsDead(unit),
-- UnitIsPlayer(unit), UnitIsUnit(unit, otherUnit), UnitExists(unit); los tokens «target», «mouseover», «npc» (el PNJ con el
-- que se habla), «pet» y «nameplate1»… «nameplateN» (la unidad de una placa de nombre). El banco las guarda en
-- B.unidades[token] = {guid, nombre, muerto, jugador, nombreSecreto, guidSecreto}; una unidad que no existe da nil/false,
-- como el juego. Cualquier otro token (focus, party1…) sigue dando «no imitado».
B.unidades = {}
-- jugadorSecreto, muertoSecreto y mascotaSecreta hacen que UnitIsPlayer, UnitIsDead y UnitIsUnit(unidad, "pet") den un
-- secreto booleano (el motor moderno puede ocultar estos datos); un addon bien hecho llama antes a issecretvalue.
local CAMPOS_UNIDAD = {guid = true, nombre = true, muerto = true, jugador = true, nombreSecreto = true, guidSecreto = true,
  jugadorSecreto = true, muertoSecreto = true, mascotaSecreta = true, faccion = true}
local TOKENS_UNIDAD = {target = true, mouseover = true, npc = true, pet = true}

local function esTokenUnidad(unidad)
  return type(unidad) == "string" and (TOKENS_UNIDAD[unidad] == true or string.find(unidad, "^nameplate%d+$") ~= nil)
end

-- Valores secretos (motor moderno, «Secret Values»): el addon puede pasarlos de unos a otros y llamar a issecretvalue,
-- pero compararlos, concatenarlos o tratarlos como texto da un error de Lua. En el banco un secreto es una tabla con
-- una metatabla marcada, y type() está envuelto para que devuelva el tipo simulado. Limitación (así es Lua 5.3):
-- `secreto == "texto"` NO da error (solo da false, porque == no llama a metamétodos con tipos distintos); comparar con <, <=, .., #, aritmética, indexar,
-- llamar o pasarlo a string.* sí falla. Un addon bien hecho llama antes a issecretvalue.
local SECRETO = {}
local TIPOS_SECRETOS = setmetatable({}, {__mode = "k"}) -- [secreto] = tipo subyacente que enseña type()
local tipoReal = type
local function errorSecreto(que)
  return function() error("attempt to " .. que .. " a secret value", 2) end
end
SECRETO.__eq = errorSecreto("compare")
SECRETO.__lt = errorSecreto("compare")
SECRETO.__le = errorSecreto("compare")
SECRETO.__concat = errorSecreto("concatenate")
SECRETO.__len = errorSecreto("get the length of")
SECRETO.__index = errorSecreto("index")
SECRETO.__call = errorSecreto("call")
-- tostring(secreto) falla, como cualquier uso que no sea issecretvalue (y también string.format("%s", s) y print(s)).
SECRETO.__tostring = errorSecreto("convert to a string")
for _, operacion in ipairs({"add", "sub", "mul", "div", "mod", "pow", "unm", "idiv"}) do
  SECRETO["__" .. operacion] = errorSecreto("perform arithmetic on")
end

-- `tipo` es el tipo que simula (por defecto «string», como los nombres y GUID): type(secreto) lo devuelve, como el
-- cliente, y no «table» (ronda 1 de D4).
function B.secreto(tipo)
  local secreto = setmetatable({}, SECRETO)
  TIPOS_SECRETOS[secreto] = tipo or "string"
  return secreto
end

function type(...)
  local kind = tipoReal(...)
  if kind == "table" then return TIPOS_SECRETOS[(...)] or kind end
  return kind
end

-- Solo en pruebas (opción vigilarSecretos de crearMaquina): la máquina reescribe `x == nil`, `x ~= nil`, `x == "…"` y
-- `x ~= "…"` de los archivos vigilados como `BANCO.vigilar(x) == …`. Si x es secreto da el error del cliente, que el ==
-- de Lua no da con tipos distintos; si no, devuelve x tal cual.
function B.vigilar(valor)
  if tipoReal(valor) == "table" and TIPOS_SECRETOS[valor] then
    error("attempt to compare a secret value", 2)
  end
  return valor
end

-- Forever (motor moderno): issecretvalue(value) es true si el valor es secreto (aparece en 321 archivos de addons).
function issecretvalue(valor)
  B.anotar("issecretvalue")
  return tipoReal(valor) == "table" and TIPOS_SECRETOS[valor] ~= nil
end

-- Datos de una unidad (nil si no existe); falla con «no imitado» si el token no es de los que el banco conoce.
local function datosUnidad(api, unidad)
  local u = B.unidades[unidad]
  if u then return u end
  if not esTokenUnidad(unidad) then
    error("no imitado: " .. api .. " solo admite 'player' y las unidades target, mouseover, npc, pet y nameplateN (se pidió "
      .. tostring(unidad) .. ")", 3)
  end
  return nil
end

-- Pone (o con datos = nil quita) una unidad. No lanza eventos.
function B.ponerUnidad(unidad, datos)
  if not esTokenUnidad(unidad) then
    error("unidad: no se imita la unidad " .. tostring(unidad) .. " (solo target, mouseover, npc, pet y nameplateN)", 2)
  end
  if datos == nil then
    B.unidades[unidad] = nil
    return
  end
  local copia = {}
  for clave, valor in pairs(datos) do
    if not CAMPOS_UNIDAD[clave] and clave ~= "prohibida" then error("unidad: campo desconocido " .. tostring(clave), 2) end
    if clave ~= "prohibida" then copia[clave] = valor end
  end
  B.unidades[unidad] = copia
end

-- Qué dan UnitName y UnitGUID de la unidad: el valor, un secreto si la unidad lo pide, o nil.
local function nombreDeUnidad(u)
  if u.nombreSecreto then return B.secreto() end
  return u.nombre
end
local function guidDeUnidad(u)
  if u.sinGuid then return nil end
  if u.guidSecreto then return B.secreto() end
  return u.guid
end

function UnitName(unidad)
  B.anotar('UnitName', unidad)
  if unidad ~= "player" then
    local u = datosUnidad('UnitName', unidad)
    if not u then return nil end
    return nombreDeUnidad(u)
  end
  return B.jugador.nombre, B.jugador.apellido
end

function UnitIsDead(unidad)
  B.anotar("UnitIsDead", unidad)
  if unidad == "player" then return B.jugador.muerto == true end
  local u = datosUnidad("UnitIsDead", unidad)
  if u and u.muertoSecreto then return B.secreto("boolean") end
  return u ~= nil and u.muerto == true
end

function UnitIsPlayer(unidad)
  B.anotar("UnitIsPlayer", unidad)
  if unidad == "player" then return true end
  local u = datosUnidad("UnitIsPlayer", unidad)
  if u and u.jugadorSecreto then return B.secreto("boolean") end
  return u ~= nil and u.jugador == true
end

function UnitExists(unidad)
  B.anotar("UnitExists", unidad)
  if unidad == "player" then return true end
  return datosUnidad("UnitExists", unidad) ~= nil
end

-- Identidad de una unidad para UnitIsUnit: su GUID real (aunque UnitGUID dé un secreto: el motor sabe quién es) o, sin
-- GUID, la propia tabla de datos.
local function identidad(api, unidad)
  if unidad == "player" then return "player" end
  local u = datosUnidad(api, unidad)
  if not u then return nil end
  return u.guid or u
end

function UnitIsUnit(unidad, otra)
  B.anotar("UnitIsUnit", unidad, otra)
  if otra == "pet" and B.unidades[unidad] and B.unidades[unidad].mascotaSecreta then return B.secreto("boolean") end
  local a, b = identidad("UnitIsUnit", unidad), identidad("UnitIsUnit", otra)
  return a ~= nil and a == b
end

-- Placas de nombre (wowpedia: C_NamePlate.GetNamePlates([isSecure]), GetNamePlateForUnit(unit [, isSecure]); eventos
-- NAME_PLATE_UNIT_ADDED y NAME_PLATE_UNIT_REMOVED (namePlateUnitToken)). Cada placa es un marco base que cuelga de
-- UIParent con el campo namePlateUnitToken (la unidad). B.placas[token] = marco; B.ordenPlacas = tokens en orden.
-- Con prohibida = true, base:IsForbidden() es true (en el juego pasa con las placas de instancia).
-- Con B.reciclarPlacas = true el banco reutiliza los marcos base como el cliente: al quitar una placa su base se
-- esconde y se guarda, y la siguiente placa que se ponga la recibe (con sus hijos, que el addon tiene que limpiar en
-- NAME_PLATE_UNIT_REMOVED). Por defecto cada placa tiene un marco nuevo.
B.placas = {}
B.ordenPlacas = {}
B.reciclarPlacas = false
B.basesLibres = {}

local function comprobarPlaca(unidad)
  if type(unidad) ~= "string" or not string.find(unidad, "^nameplate%d+$") then
    error("placa: la unidad tiene que ser nameplateN (se pidió " .. tostring(unidad) .. ")", 3)
  end
end

-- Pone una placa con los datos de su unidad ({guid, nombre, muerto, jugador, nombreSecreto, guidSecreto, prohibida}),
-- lanza NAME_PLATE_UNIT_ADDED y devuelve el marco base.
function B.ponerPlaca(unidad, datos)
  comprobarPlaca(unidad)
  if B.placas[unidad] then error("placa: ya existe " .. unidad, 2) end
  datos = datos or {}
  B.ponerUnidad(unidad, datos)
  local base = table.remove(B.basesLibres)
  if base then
    base:Show()
  else
    base = crearObjeto("Frame", nil, UIParent)
    estado[base].esMarco = true
    estado[base].sistema = true
    base:SetSize(110, 30)
    B.marcos[#B.marcos + 1] = base
  end
  estado[base].prohibido = datos.prohibida == true
  base.namePlateUnitToken = unidad
  B.placas[unidad] = base
  B.ordenPlacas[#B.ordenPlacas + 1] = unidad
  B.disparar("NAME_PLATE_UNIT_ADDED", unidad)
  return base
end

-- Quita la placa: lanza NAME_PLATE_UNIT_REMOVED con la unidad todavía válida (con sinGuid = true, UnitGUID da nil
-- durante el evento: Questie avisa de que el GUID de una placa que se va puede faltar) y la borra después.
function B.quitarPlaca(unidad, opciones)
  comprobarPlaca(unidad)
  if not B.placas[unidad] then error("placa: no hay " .. unidad, 2) end
  if opciones and opciones.sinGuid then B.unidades[unidad].sinGuid = true end
  B.disparar("NAME_PLATE_UNIT_REMOVED", unidad)
  local base = B.placas[unidad]
  base:Hide()
  if B.reciclarPlacas then B.basesLibres[#B.basesLibres + 1] = base end
  B.placas[unidad] = nil
  B.unidades[unidad] = nil
  quitarDe(B.ordenPlacas, unidad)
end

B.espacio("C_NamePlate", {
  GetNamePlates = function()
    B.anotar("C_NamePlate.GetNamePlates")
    local lista = {}
    for i, unidad in ipairs(B.ordenPlacas) do lista[i] = B.placas[unidad] end
    return lista
  end,
  GetNamePlateForUnit = function(unidad)
    B.anotar("C_NamePlate.GetNamePlateForUnit", unidad)
    return B.placas[unidad]
  end,
})

-- CVars que el banco conoce (GetCVar). Se cambian con B.ponerCVar; no hay SetCVar (el addon nunca la usa).
-- Comercio, tarea 9: «portal» es la región del cliente («US», «EU», «KR», «TW»; wowpedia: CVar portal).
B.cvars = {nameplateShowEnemies = "1", portal = "US"}
function B.ponerCVar(nombre, valor) B.cvars[nombre] = valor end

-- wowpedia: UnitGUID(unit). El jugador da un GUID «Player-…»; la unidad «npc» (el PNJ con el que se habla) da el
-- que se puso con B.ponerNpc, o nil si no se habla con nadie.
function UnitGUID(unidad)
  B.anotar("UnitGUID", unidad)
  if unidad == "player" then return "Player-1-00000001" end
  local u = datosUnidad("UnitGUID", unidad)
  if u then return guidDeUnidad(u) end
  if unidad == "npc" then return S.npc end
  return nil
end

-- Pone (o con guid = nil quita) el PNJ con el que se habla: el GUID y también la unidad «npc» (UnitExists, UnitName e
-- UnitIsPlayer coherentes). `nombre` es opcional: sin él, UnitName("npc") da nil.
function B.ponerNpc(guid, nombre)
  S.npc = guid
  if guid == nil then
    B.unidades.npc = nil
  else
    B.ponerUnidad("npc", {guid = guid, nombre = nombre, jugador = string.find(guid, "^Player%-") ~= nil})
  end
end

-- GUID de criatura como los del juego («Creature-0-mapa-instancia-zona-idDelPNJ-uid»): el id de PNJ es el 6.º campo.
-- `uid` es opcional; sin él sale un contador, para que dos criaturas del mismo PNJ tengan GUID distinto.
local contadorCriaturas = 0
function B.guidCriatura(id, uid)
  if not uid then
    contadorCriaturas = contadorCriaturas + 1
    uid = contadorCriaturas
  end
  return string.format("Creature-0-1-0-0-%d-%010X", id, uid)
end

-- wowpedia: IsPlayerSpell(spellID) / IsSpellKnown(spellID [, isPetSpell]): true si el jugador conoce el hechizo.
function IsPlayerSpell(id)
  B.anotar("IsPlayerSpell", id)
  return S.conocidos[id] == true
end

function IsSpellKnown(id, mascota)
  B.anotar("IsSpellKnown", id, mascota)
  return S.conocidos[id] == true
end

-- wowpedia: GetSpellInfo(spellID) devuelve name, rank, icon, castTime, minRange, maxRange, spellID; nada si no existe.
-- wowpedia: C_Spell.GetSpellName(spellID): solo el nombre.
function GetSpellInfo(id)
  B.anotar("GetSpellInfo", id)
  local nombre = S.hechizos[id]
  if not nombre then return nil end
  return nombre, nil, "Interface\\Icons\\INV_Misc_QuestionMark", 0, 0, 0, id
end

B.espacio("C_Spell", {
  GetSpellName = function(id)
    B.anotar("C_Spell.GetSpellName", id)
    return S.hechizos[id]
  end,
})

-- B.ponerHechizo(id, nombre, conocido): el nombre que da el juego y si el jugador lo conoce.
function B.ponerHechizo(id, nombre, conocido)
  S.hechizos[id] = nombre
  S.conocidos[id] = conocido and true or nil
end

-- wowpedia: GetNumSkillLines() y GetSkillLineInfo(index) (Classic): skillName, header (1 si es cabecera), isExpanded,
-- skillRank, numTempPoints, skillModifier, skillMaxRank, isAbandonable, stepCost, rankCost, minLevel, skillCostType,
-- skillDescription.
function GetNumSkillLines()
  B.anotar("GetNumSkillLines")
  return #S.habilidades
end

function GetSkillLineInfo(i)
  B.anotar("GetSkillLineInfo", i)
  local h = S.habilidades[i]
  if not h then return nil end
  return h.nombre, h.cabecera and 1 or nil, 1, h.rango, 0, 0, h.max, 1, 0, 0, 0, 0, ""
end

-- B.ponerHabilidad(nombre, rango, max, cabecera, id): añade una línea a la lista de habilidades; con `id` (el skillLine,
-- 171 alquimia...) también la da C_SkillInfo.GetSkillLineInfoByID.
function B.ponerHabilidad(nombre, rango, max, cabecera, id)
  S.habilidades[#S.habilidades + 1] = {nombre = nombre, rango = rango, max = max, cabecera = cabecera or nil, id = id}
end

-- Tarea 22 (WoW Forever; WhatsTraining/Crafting/RecipeFilters.lua:49 y QuestieCompat.lua:906): C_SkillInfo.
-- GetSkillLineInfoByID(skillLineID) da una tabla {name, rank, maxRank, skillID, isHeader} si el jugador tiene la línea
-- y nil si no.
B.espacio("C_SkillInfo", {
  GetSkillLineInfoByID = function(id)
    B.anotar("C_SkillInfo.GetSkillLineInfoByID", id)
    for _, h in ipairs(S.habilidades) do
      if h.id == id then
        return {name = h.nombre, rank = h.rango, maxRank = h.max, skillID = id, isHeader = h.cabecera == true}
      end
    end
    return nil
  end,
})

-- wowpedia: GetFactionInfoByID(factionID) devuelve name, description, standingID, barMin, barMax, barValue...; nada
-- si no se conoce la facción.
-- wowpedia: C_Reputation.GetFactionDataByID(factionID): {factionID, name, reaction, currentReactionThreshold,
-- nextReactionThreshold, currentStanding...}, o nil.
function GetFactionInfoByID(id)
  B.anotar("GetFactionInfoByID", id)
  local f = S.facciones[id]
  if not f then return nil end
  return f.nombre, "", f.rango, f.minimo, f.maximo, f.actual, false, true, false, false, true, false, false, id
end

B.espacio("C_Reputation", {
  GetFactionDataByID = function(id)
    B.anotar("C_Reputation.GetFactionDataByID", id)
    local f = S.facciones[id]
    if not f then return nil end
    return {factionID = id, name = f.nombre, description = "", reaction = f.rango,
      currentReactionThreshold = f.minimo, nextReactionThreshold = f.maximo, currentStanding = f.actual}
  end,
})

-- B.ponerFaccion(id, rango, dentro, largo): la reputación con la facción: `rango` 1-8 (odiado…exaltado), `dentro`
-- puntos dentro del rango y `largo` los puntos que mide ese rango. Los valores absolutos de la barra salen de ahí.
function B.ponerFaccion(id, rango, dentro, largo)
  local minimo = 3000 * (rango - 4) -- da igual el absoluto exacto: el evaluador solo usa las diferencias
  S.facciones[id] = {nombre = "Facción " .. id, rango = rango, minimo = minimo, maximo = minimo + largo,
    actual = minimo + dentro}
end

-- wowpedia: C_UnitAuras.GetPlayerAuraBySpellID(spellID): AuraData {spellId, name, applications, duration,
-- expirationTime} del aura del jugador, o nil.
-- wowpedia: UnitBuff(unit, index) / UnitDebuff(unit, index) (Classic): name, icon, count, debuffType, duration,
-- expirationTime, source, isStealable, nameplateShowPersonal, spellId. Solo el jugador; el índice cuenta los
-- beneficios (o los perjuicios) por separado, como en el juego.
B.espacio("C_UnitAuras", {
  GetPlayerAuraBySpellID = function(id)
    B.anotar("C_UnitAuras.GetPlayerAuraBySpellID", id)
    for _, a in ipairs(S.auras) do
      if a.spellId == id then
        return {spellId = a.spellId, name = a.nombre, applications = a.cuenta, duration = a.duracion,
          expirationTime = a.expira}
      end
    end
    return nil
  end,
})

-- Tarea 22 (wowpedia: C_UnitAuras.GetAuraDataByIndex(unit, index [, filter])): AuraData de la aura nº index de la
-- unidad con el filtro "HELPFUL" (beneficios, por defecto) o "HARMFUL" (perjuicios); nil al acabarse. Solo el jugador.
rawset(C_UnitAuras, "GetAuraDataByIndex", function(unidad, i, filtro)
  B.anotar("C_UnitAuras.GetAuraDataByIndex", unidad, i, filtro)
  soloJugador("C_UnitAuras.GetAuraDataByIndex", unidad)
  local perjuicio = filtro ~= nil and string.find(filtro, "HARMFUL", 1, true) ~= nil
  local n = 0
  for _, a in ipairs(S.auras) do
    if (a.perjuicio == true) == perjuicio then
      n = n + 1
      if n == i then
        return {spellId = a.spellId, name = a.nombre, applications = a.cuenta, duration = a.duracion,
          expirationTime = a.expira}
      end
    end
  end
  return nil
end)

local function aura(api, unidad, i, perjuicio)
  B.anotar(api, unidad, i)
  soloJugador(api, unidad)
  local n = 0
  for _, a in ipairs(S.auras) do
    if (a.perjuicio == true) == perjuicio then
      n = n + 1
      if n == i then
        return a.nombre, "Interface\\Icons\\INV_Misc_QuestionMark", a.cuenta, nil, a.duracion, a.expira, "player",
          false, false, a.spellId
      end
    end
  end
  return nil
end

function UnitBuff(unidad, i) return aura("UnitBuff", unidad, i, false) end
function UnitDebuff(unidad, i) return aura("UnitDebuff", unidad, i, true) end

-- B.ponerAura{spellId, nombre?, cuenta?, duracion?, restante?, perjuicio?}: `restante` en segundos (nada = permanente).
function B.ponerAura(datos)
  S.auras[#S.auras + 1] = {
    spellId = datos.spellId, nombre = datos.nombre or ("Aura " .. datos.spellId), cuenta = datos.cuenta or 1,
    duracion = datos.restante and (datos.duracion or datos.restante) or 0,
    expira = datos.restante and (GetTime() + datos.restante) or 0, perjuicio = datos.perjuicio,
  }
end

-- wowpedia: GetSpellCooldown(spell) y GetItemCooldown(item) / C_Container.GetItemCooldown(item): start, duration,
-- enable. Sin tiempo de reutilización, start y duration valen 0.
local function enfriamiento(api, tipo, id)
  B.anotar(api, id)
  local r = S.recarga[tipo][id]
  if not r then return 0, 0, 1 end
  return r.inicio, r.duracion, 1
end

function GetSpellCooldown(id) return enfriamiento("GetSpellCooldown", "spell", id) end
function GetItemCooldown(id) return enfriamiento("GetItemCooldown", "item", id) end
B.espacio("C_Container", {
  GetItemCooldown = function(id) return enfriamiento("C_Container.GetItemCooldown", "item", id) end,
})
-- Tarea 22 (los de WoW Forever): C_Item.GetItemCooldown(item) da start, duration, enable como el viejo;
-- C_Spell.GetSpellCooldown(spell) da una tabla SpellCooldownInfo {startTime, duration, isEnabled, modRate}.
rawset(C_Item, "GetItemCooldown", function(id) return enfriamiento("C_Item.GetItemCooldown", "item", id) end)
rawset(C_Spell, "GetSpellCooldown", function(id)
  local inicio, duracion = enfriamiento("C_Spell.GetSpellCooldown", "spell", id)
  return {startTime = inicio, duration = duracion, isEnabled = true, modRate = 1}
end)

---------------------------------------------------------------------------------------------------
-- Fase 4, tarea 7: contenedores, objetos y equipo (inventario de la IA). Todo el estado vive en B.inventario y sobrevive
-- a un /reload. Se llena desde las pruebas con m.bolsa, m.equipar y m.itemInfo.
--   bolsas[b] = {huecos = n, objetos = {[hueco] = {id, n, calidad, ligado}}}
--   equipo[hueco] = id          info[id] = lo que da GetItemInfo (ausente = el objeto no está en caché)
-- Bolsas como en el cliente: 0 = mochila, 1-4 = bolsas, -1 = banco, 5-10 = bolsas del banco.
---------------------------------------------------------------------------------------------------
B.inventario = {bolsas = {}, equipo = {}, info = {}}

do
  local function I() return B.inventario end
  local HUECOS_POR_DEFECTO = {[0] = 16, [-1] = 28}

  -- wowpedia: NUM_BAG_SLOTS (bolsas que se llevan puestas) y NUM_BANKBAGSLOTS (bolsas del banco).
  NUM_BAG_SLOTS = 4
  NUM_BANKBAGSLOTS = 6
  -- (Enum.BagIndex se pone con Enum, más abajo.)

  local function idDe(x)
    if type(x) == "number" then return x end
    if type(x) == "string" then return tonumber(string.match(x, "item:(%d+)")) end
    return nil
  end

  local function enlaceDe(id)
    local info = I().info[id]
    return string.format("|cffffffff|Hitem:%d::::::::::::|h[%s]|h|r", id, info and info.nombre or ("Objeto " .. id))
  end

  -- Fase 4, tarea 10 (wowpedia: TooltipDataProcessor.AddTooltipPostCall(dataType, callback(tooltip, data))): guarda las
  -- llamadas en B.postLlamadasTooltip[tipo]. B.mostrarTooltipObjeto(id) enseña el objeto en GameTooltip como el motor
  -- moderno: con TooltipDataProcessor lanza las llamadas con data = {id, type}; sin él, el script OnTooltipSetItem.
  -- Devuelve los textos de las líneas.
  B.postLlamadasTooltip = {}
  B.espacio("TooltipDataProcessor", {
    AddTooltipPostCall = function(tipo, funcion)
      B.anotar("TooltipDataProcessor.AddTooltipPostCall", tipo, funcion)
      if type(funcion) ~= "function" then error("uso: AddTooltipPostCall(tipo, función)", 2) end
      local lista = B.postLlamadasTooltip[tipo] or {}
      B.postLlamadasTooltip[tipo] = lista
      lista[#lista + 1] = funcion
    end,
  })
  -- Enseña el objeto en el tooltip dado como el cliente: vacía (OnTooltipCleared), pone el nombre y las líneas que traiga la
  -- información del objeto (itemInfo(id, {tooltip})) y lanza lo que toque. Es lo que hacen SetItemByID y SetHyperlink.
  local function ensenarObjeto(tt, id, sinAviso)
    local info = I().info[id]
    local e = estado[tt]
    local nombre = info and info.nombre or ("Objeto " .. id)
    vaciarTooltip(tt, sinAviso)
    anadirLinea(tt, nombre)
    for _, linea in ipairs(info and info.tooltip or {}) do anadirLinea(tt, linea) end
    e.objeto = {nombre = nombre, enlace = enlaceDe(id), id = id}
    e.mostrado = true
    -- Con precioEnTooltip (itemInfo) el juego enseña el precio de venta como el cliente: marco de monedas y, en el motor
    -- moderno, una línea SellPrice en data.lines.
    -- precioEnLineas y precioEnMonedas lo separan: solo la línea de data.lines, o solo el marco de monedas.
    local lineas = {}
    local conPrecio = info and (info.precio or 0) > 0
    if conPrecio and (info.precioEnTooltip or info.precioEnLineas) then
      lineas[#lineas + 1] = {type = Enum.TooltipDataLineType.SellPrice, price = info.precio}
    end
    if conPrecio and (info.precioEnTooltip or info.precioEnMonedas) then
      local dinero = e.nombre and rawget(_G, e.nombre .. "MoneyFrame1")
      if dinero then estado[dinero].mostrado = true end
      tt.shownMoneyFrames = 1
    end
    if rawget(_G, "TooltipDataProcessor") then
      for _, f in ipairs(B.postLlamadasTooltip[Enum.TooltipDataType.Item] or {}) do
        f(tt, {id = id, type = Enum.TooltipDataType.Item, lines = lineas})
      end
    else
      local script = e.scripts.OnTooltipSetItem
      if script then script(tt) end
    end
  end
  function B.mostrarTooltipObjeto(id, tooltip)
    local tt = tooltipDe(tooltip)
    ensenarObjeto(tt, id)
    return B.lineasTooltip(tt)
  end
  -- wowpedia: GameTooltip:SetItemByID(itemID) y SetHyperlink(link) (enlaces de objeto).
  function Tt:SetItemByID(id)
    E(self, "SetItemByID")
    if type(id) ~= "number" then error("uso: SetItemByID(número)", 2) end
    ensenarObjeto(self, id)
  end
  -- Comercio, Task 38 (wow-ui-source: GameTooltip:RefreshData(), del motor moderno): vuelve a pedir los datos de lo que
  -- enseña y rehace el tooltip entero (vacía, OnTooltipCleared, y lanza las llamadas otra vez). Sin objeto no hace nada.
  -- Para probar un cliente sin él: BANCO.estado[GameTooltip].quitados.RefreshData = true. Ronda 1: con
  -- BANCO.refrescoSinLimpiar = true rehace las líneas sin lanzar OnTooltipCleared (no está comprobado que el cliente lo
  -- lance aquí: el addon tiene que ir bien de las dos formas).
  B.refrescoSinLimpiar = false
  function Tt:RefreshData()
    local e = E(self, "RefreshData")
    B.anotar("GameTooltip:RefreshData", e.nombre)
    if e.objeto and e.objeto.id then ensenarObjeto(self, e.objeto.id, B.refrescoSinLimpiar) end
  end
  function Tt:SetHyperlink(enlace)
    E(self, "SetHyperlink")
    local id = idDe(enlace)
    if not id then error("no imitado: SetHyperlink con algo que no es un objeto", 2) end
    ensenarObjeto(self, id)
  end

  -- B.ponerBolsa(bolsa, hueco, datos): datos = {id, n, calidad?, ligado?, enlace?, sinValor?}, o nil para vaciar el hueco. La bolsa se
  -- crea con los huecos por defecto (mochila 16, banco 28, las demás 12) y B.ponerHuecos(bolsa, n) los cambia. T1a: enlace es
  -- el hyperlink de ese hueco tal cual (un objeto con sufijo, «|cnIQ<n>:» de WoW Forever…); sin él, el de siempre por su id.
  function B.ponerBolsa(b, hueco, datos)
    local t = I().bolsas[b]
    if not t then
      t = {huecos = HUECOS_POR_DEFECTO[b] or 12, objetos = {}}
      I().bolsas[b] = t
    end
    if hueco < 1 or hueco > t.huecos then error("ponerBolsa: hueco fuera de la bolsa " .. tostring(hueco), 2) end
    if datos == nil then
      t.objetos[hueco] = nil
    else
      t.objetos[hueco] = {id = datos.id, n = datos.n or 1, calidad = datos.calidad or 1, ligado = datos.ligado == true,
        enlace = datos.enlace, sinValor = datos.sinValor == true}
    end
  end

  function B.ponerHuecos(b, n)
    local t = I().bolsas[b] or {objetos = {}}
    t.huecos = n
    I().bolsas[b] = t
  end

  function B.ponerEquipo(hueco, id)
    I().equipo[hueco] = id
  end

  local CAMPOS_INFO = {nombre = true, calidad = true, nivel = true, nivelMin = true, tipo = true, subtipo = true,
    apilado = true, equipa = true, icono = true, precio = true, clase = true, subclase = true, ligadura = true,
    estadisticas = true, tooltip = true, precioEnTooltip = true,
    precioEnLineas = true, precioEnMonedas = true}

  function B.ponerInfoObjeto(id, datos)
    local info = {nombre = "Objeto " .. id, calidad = 1, nivel = 1, nivelMin = 0, tipo = "", subtipo = "", apilado = 1,
      equipa = "", icono = 134400, precio = 0, clase = 0, subclase = 0, ligadura = 0}
    for clave, valor in pairs(datos or {}) do
      if not CAMPOS_INFO[clave] then error("itemInfo: campo desconocido " .. tostring(clave), 2) end
      info[clave] = valor
    end
    I().info[id] = info
  end

  -- wowpedia: C_Container.GetContainerNumSlots(bagIndex): huecos de la bolsa (0 si no hay bolsa).
  local function numHuecos(api, b)
    B.anotar(api, b)
    local t = I().bolsas[b]
    return t and t.huecos or 0
  end
  -- wowpedia: C_Container.GetContainerNumFreeSlots(bagIndex): libres y tipo de bolsa (0 = normal).
  local function numLibres(api, b)
    B.anotar(api, b)
    local t = I().bolsas[b]
    if not t then return 0, 0 end
    local usados = 0
    for _ in pairs(t.objetos) do usados = usados + 1 end
    return t.huecos - usados, t.familia or 0
  end
  -- wowpedia: C_Container.GetContainerItemInfo(bagIndex, slotIndex): ContainerItemInfo {iconFileID, stackCount, isLocked,
  -- quality, isReadable, hasLoot, hasNoValue, itemID, isBound, hyperlink…} o nil si el hueco está vacío.
  -- T1a: el enlace de un hueco como el del cliente: con el color de la calidad del objeto y su nombre; si el objeto aún no
  -- está en la caché (sin itemInfo), con el nombre vacío («[]»), como puede darlo el cliente.
  local COLOR_CALIDAD = {[0] = "ff9d9d9d", "ffffffff", "ff1eff00", "ff0070dd", "ffa335ee", "ffff8000", "ffe6cc80"}
  local function enlaceHueco(o)
    local info = I().info[o.id]
    local color = COLOR_CALIDAD[info and info.calidad or o.calidad] or "ffffffff"
    return string.format("|c%s|Hitem:%d::::::::::::|h[%s]|h|r", color, o.id, info and info.nombre or "")
  end
  local function infoHueco(api, b, h)
    B.anotar(api, b, h)
    local t = I().bolsas[b]
    local o = t and t.objetos[h]
    if not o then return nil end
    return {iconFileID = 134400, stackCount = o.n, isLocked = o.bloqueado == true, quality = o.calidad, isReadable = false,
      hasLoot = false, hasNoValue = o.sinValor == true, itemID = o.id, isBound = o.ligado, hyperlink = o.enlace or enlaceHueco(o)}
  end

  rawset(C_Container, "GetContainerNumSlots", function(b) return numHuecos("C_Container.GetContainerNumSlots", b) end)
  rawset(C_Container, "GetContainerNumFreeSlots", function(b) return numLibres("C_Container.GetContainerNumFreeSlots", b) end)
  rawset(C_Container, "GetContainerItemInfo", function(b, h) return infoHueco("C_Container.GetContainerItemInfo", b, h) end)
  -----------------------------------------------------------------------------------------------------------------
  -- Almacén, un movimiento por clic: el cursor y C_Container.PickupContainerItem / SplitContainerItem (wow-ui-source,
  -- rama forever 1.60.1.71139, ContainerDocumentation.lua: las dos sin marca de restricción, SecretArguments
  -- «AllowedWhenUntainted»). Lo que hace el cliente de verdad está sin medir en la partida; el banco imita esto:
  --   * coger un hueco desbloqueado pone su pila (o, al partir, `amount` unidades) en el cursor y BLOQUEA el hueco;
  --   * con un objeto en el cursor, pulsar un hueco vacío lo suelta: el cursor queda vacío enseguida, el origen sigue
  --     bloqueado y el destino vacío hasta que el «servidor» responde B.contenedores.demora segundos después
  --     (ITEM_LOCK_CHANGED, BAG_UPDATE, BAG_UPDATE_DELAYED); pulsar el hueco de donde salió lo devuelve;
  --   * pulsar un hueco ocupado con el cursor lleno no hace nada (el cursor sigue lleno).
  -- B.contenedores (lo cambian las pruebas):
  --   demora       segundos hasta que el servidor responde (0,2 por defecto)
  --   rechazar     el servidor rechaza: vuelve todo como estaba (el origen se desbloquea)
  --   noSoltar     el cliente no deja soltar en el destino (el cursor sigue lleno)
  --   exigirClic   fuera del OnClick de un botón (Click()) la llamada no hace nada y lanza ADDON_ACTION_BLOCKED
  --   prohibir     la llamada no hace nada y lanza ADDON_ACTION_FORBIDDEN
  --   prohibirSoltar  lo mismo, pero solo al soltar (con un objeto en el cursor)
  --   fallar       la llamada da un error de Lua
  --   sinRespuesta el servidor nunca responde (el origen se queda bloqueado)
  -- B.cursorObjeto = {bolsa, hueco, id, n, enlace} | nil; B.cursorAjeno = "spell"… simula otra cosa en el cursor.
  -----------------------------------------------------------------------------------------------------------------
  B.contenedores = {demora = 0.2}
  B.cursorObjeto = nil
  B.cursorAjeno = nil

  local function cursorCambio()
    B.disparar("CURSOR_CHANGED", B.cursorObjeto == nil and B.cursorAjeno == nil, 0, 0, 0)
  end
  local function bloqueo(b, h)
    B.disparar("ITEM_LOCK_CHANGED", b, h)
  end
  -- Lo que el cliente mira antes de cada llamada: true si la llamada no debe hacer nada.
  local function impedida(api)
    local C = B.contenedores
    if C.fallar then error(api .. ": fallo simulado", 3) end
    if C.prohibir then
      B.disparar("ADDON_ACTION_FORBIDDEN", "SnetForever_Comercio", api)
      return true
    end
    if C.exigirClic and B.enClic == 0 then
      B.anotar("ADDON_ACTION_BLOCKED", api)
      B.disparar("ADDON_ACTION_BLOCKED", "SnetForever_Comercio", api)
      return true
    end
    return false
  end
  local function coger(b, h, cantidad)
    local t = I().bolsas[b]
    local o = t and t.objetos[h]
    if not o or o.bloqueado then return end
    if cantidad and (cantidad < 1 or cantidad >= o.n) then return end
    B.cursorObjeto = {bolsa = b, hueco = h, id = o.id, n = cantidad or o.n, enlace = o.enlace or enlaceHueco(o)}
    o.bloqueado = true
    bloqueo(b, h)
    cursorCambio()
  end
  local function responder(mov)
    local C = B.contenedores
    if C.sinRespuesta then return end
    programar({vence = B.tick + pasosDe(C.demora or 0.2, "B.contenedores.demora"), f = function()
      local to, td = I().bolsas[mov.bolsa], I().bolsas[mov.aBolsa]
      local o = to.objetos[mov.hueco]
      if o then o.bloqueado = nil end
      if o and not C.rechazar and not td.objetos[mov.aHueco] then
        o.n = o.n - mov.n
        if o.n <= 0 then to.objetos[mov.hueco] = nil end
        td.objetos[mov.aHueco] = {id = o.id, n = mov.n, calidad = o.calidad, ligado = o.ligado, enlace = o.enlace}
      end
      bloqueo(mov.bolsa, mov.hueco)
      bloqueo(mov.aBolsa, mov.aHueco)
      B.disparar("BAG_UPDATE", mov.bolsa)
      if mov.aBolsa ~= mov.bolsa then B.disparar("BAG_UPDATE", mov.aBolsa) end
      B.disparar("BAG_UPDATE_DELAYED")
    end})
  end
  local function soltar(b, h)
    local c = B.cursorObjeto
    local t = I().bolsas[b]
    if not t or h < 1 or h > t.huecos then return end
    if b == c.bolsa and h == c.hueco then -- vuelve al hueco de donde salió
      local o = I().bolsas[b].objetos[h]
      if o then o.bloqueado = nil end
      B.cursorObjeto = nil
      bloqueo(b, h)
      cursorCambio()
      return
    end
    if t.objetos[h] or B.contenedores.noSoltar then return end
    B.cursorObjeto = nil
    cursorCambio()
    responder({bolsa = c.bolsa, hueco = c.hueco, aBolsa = b, aHueco = h, n = c.n})
  end
  rawset(C_Container, "PickupContainerItem", function(b, h)
    B.anotar("C_Container.PickupContainerItem", b, h)
    if impedida("PickupContainerItem") or B.cursorAjeno then return end
    if B.cursorObjeto and B.contenedores.prohibirSoltar then
      B.disparar("ADDON_ACTION_FORBIDDEN", "SnetForever_Comercio", "PickupContainerItem")
      return
    end
    if B.cursorObjeto then soltar(b, h) else coger(b, h) end
  end)
  rawset(C_Container, "SplitContainerItem", function(b, h, cantidad)
    B.anotar("C_Container.SplitContainerItem", b, h, cantidad)
    if type(cantidad) ~= "number" then error("uso: SplitContainerItem(bolsa, hueco, cantidad)", 2) end
    if impedida("SplitContainerItem") or B.cursorAjeno or B.cursorObjeto then return end
    coger(b, h, cantidad)
  end)
  -- wowpedia: GetCursorInfo() -> infoType, ... («item», itemID, itemLink con un objeto); nada con el cursor vacío.
  function GetCursorInfo()
    B.anotar("GetCursorInfo")
    if B.cursorAjeno then return B.cursorAjeno, 1 end
    local c = B.cursorObjeto
    if c then return "item", c.id, c.enlace end
    return nil
  end
  -- Para las pruebas: la bolsa `b` es de un tipo especial (GetContainerNumFreeSlots da esa familia).
  function B.ponerFamilia(b, familia)
    local t = I().bolsas[b] or {huecos = HUECOS_POR_DEFECTO[b] or 12, objetos = {}}
    t.familia = familia
    I().bolsas[b] = t
  end
  -- Para las pruebas: bloquea o desbloquea un hueco ocupado (otro addon o el jugador lo tiene cogido).
  function B.bloquearHueco(b, h, si)
    I().bolsas[b].objetos[h].bloqueado = si and true or nil
  end

  -- Las globales viejas (en Forever solo falta GetContainerItemInfo; con el perfil forever se quita). La vieja da valores
  -- sueltos: texture, count, locked, quality, readable, lootable, link, isFiltered, noValue, itemID, isBound.
  function GetContainerNumSlots(b) return numHuecos("GetContainerNumSlots", b) end
  function GetContainerNumFreeSlots(b) return numLibres("GetContainerNumFreeSlots", b) end
  function GetContainerItemInfo(b, h)
    local i = infoHueco("GetContainerItemInfo", b, h)
    if not i then return nil end
    return i.iconFileID, i.stackCount, i.isLocked, i.quality, i.isReadable, i.hasLoot, i.hyperlink, false, i.hasNoValue, i.itemID, i.isBound
  end

  -- wowpedia: C_Item.GetItemInfo(item): itemName, itemLink, itemQuality, itemLevel, itemMinLevel, itemType, itemSubType,
  -- itemStackCount, itemEquipLoc, itemTexture, sellPrice, classID, subclassID, bindType (los 14 primeros); nil si el
  -- objeto no está en caché (el cliente lo pide al servidor y lo da más tarde).
  local function datosObjeto(api, x)
    B.anotar(api, x)
    local id = idDe(x)
    local i = id and I().info[id]
    if not i then return nil end
    return i.nombre, enlaceDe(id), i.calidad, i.nivel, i.nivelMin, i.tipo, i.subtipo, i.apilado, i.equipa, i.icono,
      i.precio, i.clase, i.subclase, i.ligadura
  end
  rawset(C_Item, "GetItemInfo", function(x) return datosObjeto("C_Item.GetItemInfo", x) end)
  function GetItemInfo(x) return datosObjeto("GetItemInfo", x) end

  -- Diario de objetos. wowpedia: C_Item.GetItemInfoInstant(item): itemID, itemType, itemSubType, itemEquipLoc, icon,
  -- classID, subClassID. Siempre responde (sin caché) para un id válido; el banco saca equipLoc, clase y subclase de lo
  -- puesto con m.itemInfo y, si no hay nada, da equipLoc "" (no es equipo). Tipo y subtipo van vacíos.
  local function infoInstantanea(api, x)
    B.anotar(api, x)
    local id = idDe(x)
    if not id then return nil end
    local i = I().info[id]
    return id, "", "", i and i.equipa or "", i and i.icono or 134400, i and i.clase or 0, i and i.subclase or 0
  end
  rawset(C_Item, "GetItemInfoInstant", function(x) return infoInstantanea("C_Item.GetItemInfoInstant", x) end)
  function GetItemInfoInstant(x) return infoInstantanea("GetItemInfoInstant", x) end

  -- Ventana de botín. B.ponerBotin({{enlace, guid}, ...}): cada hueco con su enlace y el GUID de donde sale.
  -- wowpedia: GetNumLootItems(); GetLootSlotLink(slot) → enlace o nil; GetLootSourceInfo(slot) → guid1, cantidad1, ….
  B.botin = {}
  function B.ponerBotin(huecos) B.botin = huecos or {} end
  function GetNumLootItems() B.anotar("GetNumLootItems") return #B.botin end
  function GetLootSlotLink(hueco)
    B.anotar("GetLootSlotLink", hueco)
    local h = B.botin[hueco]
    return h and h[1] or nil
  end
  function GetLootSourceInfo(hueco)
    B.anotar("GetLootSourceInfo", hueco)
    local h = B.botin[hueco]
    if not h then return nil end
    return h[2], 1
  end

  -- Ventana de entregar una misión. B.ponerRecompensas({q, recompensas = {id...}, elegir = {id...}}).
  -- wowpedia: GetQuestID(); GetNumQuestRewards(); GetNumQuestChoices(); GetQuestItemLink(type, index) con type
  -- "reward" o "choice"; GetQuestReward(itemChoice) entrega la misión (el banco solo lo anota).
  B.recompensas = {recompensas = {}, elegir = {}}
  function B.ponerRecompensas(datos)
    B.recompensas = {q = datos.q, recompensas = datos.recompensas or {}, elegir = datos.elegir or {}}
  end
  function GetQuestID() B.anotar("GetQuestID") return B.recompensas.q or 0 end
  function GetNumQuestRewards() B.anotar("GetNumQuestRewards") return #B.recompensas.recompensas end
  function GetNumQuestChoices() B.anotar("GetNumQuestChoices") return #B.recompensas.elegir end
  function GetQuestItemLink(tipo, i)
    B.anotar("GetQuestItemLink", tipo, i)
    local lista = tipo == "choice" and B.recompensas.elegir or tipo == "reward" and B.recompensas.recompensas or {}
    local id = lista[i]
    return id and enlaceDe(id) or nil
  end
  function GetQuestReward(eleccion) B.anotar("GetQuestReward", eleccion) end

  -- Vendedor. B.ponerVendedor({npc = id, {id, precio}, ...}): además pone el PNJ con el que se habla (UnitGUID("npc")).
  -- wowpedia: GetMerchantItemLink(index); GetMerchantItemInfo(index) → name, texture, price, quantity, numAvailable,
  -- isPurchasable, isUsable, extendedCost; BuyMerchantItem(index, quantity) (el banco solo lo anota).
  B.vendedor = {}
  function B.ponerVendedor(datos)
    B.vendedor = datos or {}
    if datos and datos.npc then B.ponerNpc(string.format("Creature-0-1-1-1-%d-0", datos.npc)) end
  end
  function GetMerchantNumItems()
    B.anotar("GetMerchantNumItems")
    return #B.vendedor
  end
  function GetMerchantItemLink(i)
    B.anotar("GetMerchantItemLink", i)
    local o = B.vendedor[i]
    return o and enlaceDe(o[1]) or nil
  end
  function GetMerchantItemInfo(i)
    B.anotar("GetMerchantItemInfo", i)
    local o = B.vendedor[i]
    if not o then return nil end
    local info = I().info[o[1]]
    return info and info.nombre or ("Objeto " .. o[1]), 134400, o[2], 1, -1, true, true, false
  end
  function BuyMerchantItem(i, cantidad) B.anotar("BuyMerchantItem", i, cantidad) end
  -- Revisión final del diario: en WoW Forever GetMerchantItemInfo puede no existir (Auctionator lo suple con
  -- C_MerchantFrame.GetItemInfo). wowpedia: C_MerchantFrame.GetItemInfo(index) → {name, texture, price, stackCount,
  -- numAvailable, isPurchasable, isUsable, hasExtendedCost, …} o nil; GetMerchantItemID(index) → id o nil.
  B.espacio("C_MerchantFrame", {
    GetItemInfo = function(i)
      B.anotar("C_MerchantFrame.GetItemInfo", i)
      local o = B.vendedor[i]
      if not o then return nil end
      local info = I().info[o[1]]
      return {name = info and info.nombre or ("Objeto " .. o[1]), texture = 134400, price = o[2], stackCount = 1,
        numAvailable = -1, isPurchasable = true, isUsable = true, hasExtendedCost = false}
    end,
  })
  function GetMerchantItemID(i)
    B.anotar("GetMerchantItemID", i)
    local o = B.vendedor[i]
    return o and o[1] or nil
  end

  -- Correo. B.ponerCorreo({{indice, adjunto, id, factura = {tipo, jugador, puja}?}, ...}).
  -- wowpedia: GetInboxItemLink(index, itemIndex); GetInboxInvoiceInfo(index) → invoiceType ("buyer", "seller",
  -- "seller_temp_invoice"), itemName, playerName, bid, buyout, deposit, consignment (nil si no es una factura);
  -- TakeInboxItem(index, itemIndex) (el banco solo lo anota).
  B.correo = {}
  function B.ponerCorreo(lista) B.correo = lista or {} end
  local function cartaDe(indice, adjunto)
    for _, c in ipairs(B.correo) do
      if c.indice == indice and (adjunto == nil or c.adjunto == adjunto) then return c end
    end
    return nil
  end
  function GetInboxItemLink(indice, adjunto)
    B.anotar("GetInboxItemLink", indice, adjunto)
    local c = cartaDe(indice, adjunto)
    return c and enlaceDe(c.id) or nil
  end
  function GetInboxInvoiceInfo(indice)
    B.anotar("GetInboxInvoiceInfo", indice)
    local c = cartaDe(indice)
    local f = c and c.factura
    if not f then return nil end
    local info = I().info[c.id]
    return f.tipo, info and info.nombre or ("Objeto " .. c.id), f.jugador, f.puja, f.puja, 0, 0
  end
  function TakeInboxItem(indice, adjunto) B.anotar("TakeInboxItem", indice, adjunto) end
  -- Revisión final del diario. wowpedia: GetInboxItem(index, itemIndex) → name, itemID, texture, count, quality,
  -- canUse; AutoLootMailItem(index) coge todos los adjuntos de una carta (mayúsculas + clic). Una carta puede llevar
  -- `cantidad` (por defecto 1).
  function GetInboxItem(indice, adjunto)
    B.anotar("GetInboxItem", indice, adjunto)
    local c = cartaDe(indice, adjunto)
    if not c then return nil end
    local info = I().info[c.id]
    return info and info.nombre or ("Objeto " .. c.id), c.id, 134400, c.cantidad or 1, info and info.calidad or 1, true
  end
  function AutoLootMailItem(indice) B.anotar("AutoLootMailItem", indice) end
  -- F2 (inventario del correo). wowpedia: GetInboxNumItems() → numItems, totalItems: las cartas que el cliente tiene
  -- cargadas (la carta más alta de B.correo) y las que hay en total (aquí, las mismas).
  function GetInboxNumItems()
    B.anotar("GetInboxNumItems")
    local n = 0
    for _, c in ipairs(B.correo) do
      if c.indice > n then n = c.indice end
    end
    return n, n
  end
  -- wowpedia: C_Item.GetItemStats(itemLink): tabla {ITEM_MOD_…_SHORT = valor}; nil si el objeto no está en caché.
  rawset(C_Item, "GetItemStats", function(enlace)
    B.anotar("C_Item.GetItemStats", enlace)
    local id = idDe(enlace)
    local i = id and I().info[id]
    if not i then return nil end
    local copia = {}
    for clave, valor in pairs(i.estadisticas or {}) do copia[clave] = valor end
    return copia
  end)
  -- wowpedia: C_Item.RequestLoadItemDataByID(itemID): pide los datos al servidor (no devuelve nada).
  rawset(C_Item, "RequestLoadItemDataByID", function(id) B.anotar("C_Item.RequestLoadItemDataByID", id) end)

  -- wowpedia: GetInventoryItemLink(unit, slot): enlace del objeto equipado, o nil.
  function GetInventoryItemLink(unidad, hueco)
    B.anotar("GetInventoryItemLink", unidad, hueco)
    soloJugador("GetInventoryItemLink", unidad)
    local id = I().equipo[hueco]
    return id and enlaceDe(id) or nil
  end
  -- wowpedia: C_TooltipInfo.GetInventoryItem(unit, slot): TooltipData {lines = {{leftText…}}}, o nil si el hueco está vacío.
  B.espacio("C_TooltipInfo", {
    GetInventoryItem = function(unidad, hueco)
      B.anotar("C_TooltipInfo.GetInventoryItem", unidad, hueco)
      soloJugador("C_TooltipInfo.GetInventoryItem", unidad)
      local id = I().equipo[hueco]
      if not id then return nil end
      local i = I().info[id]
      local lineas = {}
      for k, texto in ipairs(i and i.tooltip or {}) do lineas[k] = {leftText = texto} end
      return {lines = lineas}
    end,
  })

  -- wowpedia: GetServerTime(): segundos desde 1970 en el servidor. El banco parte de una hora fija y la avanza con el tiempo falso.
  function GetServerTime()
    B.anotar("GetServerTime")
    return 1790000000 + math.floor(GetTime() - B.TIEMPO_BASE)
  end
end

-- B.ponerEnfriamiento(tipo, id, restante): al jugador le faltan `restante` segundos (0 = lista) para usar el hechizo
-- ("spell") u objeto ("item").
function B.ponerEnfriamiento(tipo, id, restante)
  if not S.recarga[tipo] then error("ponerEnfriamiento: tipo desconocido " .. tostring(tipo), 2) end
  if restante <= 0 then
    S.recarga[tipo][id] = nil
  else
    S.recarga[tipo][id] = {inicio = GetTime(), duracion = restante}
  end
end

-- wowpedia: UnitOnTaxi(unit): true si el jugador va en un vuelo.
-- wowpedia: GetTaxiMapID(): mapa del mapa de vuelos abierto.
-- wowpedia: C_TaxiMap.GetAllTaxiNodes(uiMapID): lista de TaxiNodeInfo {nodeID, name, state, ...}.
function UnitOnTaxi(unidad)
  B.anotar("UnitOnTaxi", unidad)
  soloJugador("UnitOnTaxi", unidad)
  return S.taxi
end

function GetTaxiMapID()
  B.anotar("GetTaxiMapID")
  return S.mapaTaxi
end

B.espacio("C_TaxiMap", {
  GetAllTaxiNodes = function(mapa)
    B.anotar("C_TaxiMap.GetAllTaxiNodes", mapa)
    return S.nodos
  end,
})

-- wowpedia: C_GossipInfo.GetOptions(): lista de {gossipOptionID, name, ...} de la charla abierta.
B.espacio("C_GossipInfo", {
  GetOptions = function()
    B.anotar("C_GossipInfo.GetOptions")
    return S.opcionesCharla
  end,
})

-- wowpedia (GlobalStrings): ERR_NEWTAXIPATH, el mensaje de «nueva ruta de vuelo».
ERR_NEWTAXIPATH = "Nueva ruta de vuelo descubierta."

-- Cambia campos sueltos del estado (taxi, nodos, opcionesCharla, mapaTaxi).
function B.ponerServicios(cambios)
  for clave, valor in pairs(cambios) do
    if clave ~= "taxi" and clave ~= "nodos" and clave ~= "opcionesCharla" and clave ~= "mapaTaxi" then
      error("ponerServicios: campo desconocido " .. tostring(clave), 2)
    end
    S[clave] = valor
  end
end

-- Datos de prueba sobre los addons de datos ya cargados.
function B.ponerGuia(guia)
  local rutas = rawget(_G, "SNF_RUTAS")
  if not rutas then error("ponerGuia: no hay SNF_RUTAS cargado", 2) end
  rutas.guias[guia.clave] = guia
  local grupo = rutas.grupos[guia.grupo] or {}
  rutas.grupos[guia.grupo] = grupo
  for _, clave in ipairs(grupo) do
    if clave == guia.clave then return end
  end
  grupo[#grupo + 1] = guia.clave
end

function B.datoMision(q, registro)
  local misiones = rawget(_G, "SNF_MISIONES")
  if not misiones then error("datoMision: no hay SNF_MISIONES cargado", 2) end
  misiones.quest[q] = registro
end

---------------------------------------------------------------------------------------------------
-- Carga de archivos, globales nuevas, SavedVariables y /reload.
---------------------------------------------------------------------------------------------------

function B.tablaAddon(nombre)
  local t = B.tablasAddon[nombre] or {}
  B.tablasAddon[nombre] = t
  return t
end

-- Archivo de un addon de datos: un fallo aquí es un fallo del fixture y sube.
function B.cargarDatos(fuente, nombreArchivo, addon)
  local f = assert(cargar(fuente, "@" .. nombreArchivo, "t"))
  f(addon, B.tablaAddon(addon))
end

-- Archivo del addon: como en el cliente, recibe (nombre, tabla) y sus errores van a geterrorhandler().
function B.cargarArchivo(fuente, nombreArchivo, addon)
  B.cargados[#B.cargados + 1] = nombreArchivo
  local f, err = cargar(fuente, "@" .. nombreArchivo, "t")
  if not f then
    geterrorhandler()(err)
    return
  end
  B.proteger(f, addon, B.tablaAddon(addon))
end

function B.fotoGlobales()
  B.globalesBase = {}
  for clave in pairs(_G) do B.globalesBase[clave] = true end
end

function B.globalesNuevas()
  local salida = {}
  for clave in pairs(_G) do
    if not B.globalesBase[clave] then salida[#salida + 1] = tostring(clave) end
  end
  table.sort(salida)
  return salida
end

-- Texto de Lua que reconstruye v. Como el cliente al guardar, se saltan funciones y userdata.
function B.serializar(v, enCurso)
  local tipo = type(v)
  if tipo == "boolean" then return tostring(v) end
  if tipo == "number" then
    if v ~= v or v == math.huge or v == -math.huge then error("serializar: número no finito") end
    if tipoNumero(v) == "integer" then return string.format("%d", v) end
    return string.format("%.17g", v)
  end
  if tipo == "string" then return string.format("%q", v) end
  if tipo ~= "table" then return "nil" end
  enCurso = enCurso or {}
  if enCurso[v] then error("serializar: tabla con ciclo") end
  enCurso[v] = true
  local partes = {}
  for clave, valor in pairs(v) do
    local tc, tv = type(clave), type(valor)
    if (tc == "string" or tc == "number" or tc == "boolean") and (tv ~= "function" and tv ~= "userdata" and tv ~= "thread") then
      partes[#partes + 1] = "[" .. B.serializar(clave, enCurso) .. "]=" .. B.serializar(valor, enCurso)
    end
  end
  enCurso[v] = nil
  return "{" .. table.concat(partes, ",") .. "}"
end

-- Lo que sobrevive a un /reload: las SavedVariables y el estado del «servidor» (jugador, diario, objetos, tiempo).
-- Los errores también pasan, para que sinErrores() los vea después de recargar.
function B.estadoParaRecargar(nombresGuardados)
  local guardado = {}
  for _, nombre in ipairs(nombresGuardados) do guardado[nombre] = rawget(_G, nombre) end
  return B.serializar({
    guardado = guardado, jugador = B.jugador, misiones = B.misiones, objetos = B.objetos, tick = B.tick,
    servicios = B.servicios, inventario = B.inventario, marcador = B.marcador,
    errores = B.errores, trazas = B.trazas, personajes = B.otrosPersonajes,
  })
end

-- F2b: lo de cada personaje cuando se sale al menú y se entra con otro (Maquina.cambiarDePersonaje). Es de cada personaje:
-- sus SavedVariablesPerCharacter (nombresPJ) y su estado en el «servidor» (el jugador entero, misiones, objetos y
-- bolsas, servicios y el marcador del mapa); se aparta en B.otrosPersonajes[«nombre|apellido|reino»] y vuelve tal cual si
-- se entra otra vez con él. Es de la cuenta (sigue igual): las SavedVariables de cuenta (nombresCuenta), el tiempo, la
-- caché de nombres de los objetos y los errores. El otro personaje es el de `cambios` (lo que no diga: el nombre y el
-- reino, del de ahora; el apellido, solo si tampoco dice el nombre). Uno nuevo empieza como uno recién creado: el jugador
-- por defecto con el idioma y el reino del de ahora (más `cambios`), sin misiones, sin objetos ni bolsas, los servicios por
-- defecto y sus SavedVariablesPerCharacter sin crear (nil).
B.otrosPersonajes = {}
local function claveDePersonaje(j)
  return tostring(j.nombre) .. "|" .. tostring(j.apellido or "") .. "|" .. tostring(j.reino)
end

function B.estadoParaCambiar(nombresCuenta, nombresPJ, cambios)
  cambios = cambios or {}
  local servicios = {}
  for clave, valor in pairs(S) do servicios[clave] = valor end
  local mio = {jugador = B.jugador, misiones = B.misiones, objetos = B.objetos, servicios = servicios,
    inventario = B.inventario, marcador = B.marcador, guardado = {}}
  for _, nombre in ipairs(nombresPJ) do mio.guardado[nombre] = rawget(_G, nombre) end
  B.otrosPersonajes[claveDePersonaje(B.jugador)] = mio
  local destino = {nombre = cambios.nombre or B.jugador.nombre, reino = cambios.reino or B.jugador.reino}
  if cambios.apellido ~= nil then
    destino.apellido = cambios.apellido
  elseif cambios.nombre == nil then
    destino.apellido = B.jugador.apellido
  end
  local guardado = {}
  for _, nombre in ipairs(nombresCuenta) do guardado[nombre] = rawget(_G, nombre) end
  local t = {guardado = guardado, tick = B.tick, errores = B.errores, trazas = B.trazas, personajes = B.otrosPersonajes,
    cambios = cambios, info = B.inventario.info}
  local suyo = B.otrosPersonajes[claveDePersonaje(destino)]
  if suyo then
    for nombre, valor in pairs(suyo.guardado) do guardado[nombre] = valor end
    t.jugador, t.misiones, t.objetos, t.servicios = suyo.jugador, suyo.misiones, suyo.objetos, suyo.servicios
    t.inventario, t.marcador = suyo.inventario, suyo.marcador
  else
    t.nuevo = {idioma = B.jugador.idioma, reino = destino.reino, nombre = destino.nombre, apellido = destino.apellido}
  end
  return B.serializar(t)
end

function B.restaurarEstado(t)
  B.tick = t.tick
  -- F2b: sin jugador (un personaje nuevo, B.estadoParaCambiar), lo de un personaje recién creado: lo de por defecto.
  if t.jugador then
    B.jugador, B.misiones, B.objetos = t.jugador, t.misiones, t.objetos
  else
    B.iniciarJugador(t.nuevo)
  end
  -- Las funciones del banco guardan B.servicios en un local: se rellena la misma tabla, no se cambia por otra.
  if t.servicios then
    for clave in pairs(S) do S[clave] = nil end
    for clave, valor in pairs(t.servicios) do S[clave] = valor end
  end
  B.inventario = t.inventario or {bolsas = {}, equipo = {}, info = {}}
  if t.info then B.inventario.info = t.info end -- la caché de nombres de los objetos es del cliente, no del personaje
  -- El marcador del mapa lo guarda el cliente (pines de la IA como «Marcador de mapa»).
  B.marcador = t.marcador or {punto = nil, seguido = false}
  B.errores, B.trazas = t.errores, t.trazas
  B.otrosPersonajes = t.personajes or {}
  B.guardadoPendiente = t.guardado
  if t.cambios then B.ponerJugador(t.cambios) end
end

function B.ponerGuardadoPendiente()
  for nombre, valor in pairs(B.guardadoPendiente or {}) do rawset(_G, nombre, valor) end
  B.guardadoPendiente = nil
end

---------------------------------------------------------------------------------------------------
-- Tarea 22: lo que tiene el cliente de WoW Forever (motor moderno) y se comprobó con /dump.
---------------------------------------------------------------------------------------------------

-- wowpedia: C_EventUtils.IsEventValid(eventName): si el cliente conoce el evento. Un evento que el banco no imita sigue
-- dando «no imitado» (las pruebas no deben aceptar eventos inventados).
B.espacio("C_EventUtils", {
  IsEventValid = function(nombre)
    B.anotar("C_EventUtils.IsEventValid", nombre)
    if B.eventosInvalidos[nombre] then return false end
    evento(nombre)
    return true
  end,
})

-- C_Secrets (motor moderno): con ShouldAurasBeSecret() == true los campos de las auras son «valores secretos» que un
-- addon no puede comparar; con ShouldCooldownsBeSecret(), los tiempos de reutilización. BANCO.secretos los enciende.
B.secretos = {auras = false, enfriamientos = false}
B.espacio("C_Secrets", {
  ShouldAurasBeSecret = function() B.anotar("C_Secrets.ShouldAurasBeSecret"); return B.secretos.auras == true end,
  ShouldCooldownsBeSecret = function()
    B.anotar("C_Secrets.ShouldCooldownsBeSecret")
    return B.secretos.enfriamientos == true
  end,
})

---------------------------------------------------------------------------------------------------
-- 17-nov: talentos. El cliente de Forever (motor moderno, tipo de juego «camelot») los da con el sistema de rasgos
-- (C_Traits, C_ClassTalents, C_SpecializationInfo): wow-ui-source, rama forever,
-- Blizzard_PlayerSpells/Camelot/ClassTalents/Blizzard_ClassTalentsFrame.lua. La API de Classic (GetNumTalentTabs y
-- demás) también se imita, con los mismos datos; crearMaquina({forever: true}) la quita (SIN_API_FOREVER).
--
-- B.ponerTalentos({arboles = {{nombre, talentos = {{nombre, fila, columna, rango, maximo, sobrenombre?}}}}, libres})
-- pone los talentos del jugador (los de rango 0 también: están en el árbol). Sin ponerlos, no hay configuración activa
-- (C_ClassTalents.GetActiveConfigID da nil) y GetNumTalentTabs da 0. Viven en B.servicios: sobreviven a un /reload.
-- Identificadores del banco: configuración 900, árbol 700, grupo (cada árbol de la ventana) 10 + nº de árbol, nodo
-- nº de árbol * 100 + nº de talento, entrada nodo * 10, definición 5000 + nodo y hechizo 95000 + nodo (su nombre va a
-- GetSpellInfo y C_Spell.GetSpellName). posX y posY imitan las del cliente: 600 por columna y por fila.
---------------------------------------------------------------------------------------------------

local CONFIG_TALENTOS, ARBOL_TALENTOS = 900, 700

function B.ponerTalentos(datos)
  S.talentos = datos
  for a, arbol in ipairs(datos.arboles or {}) do
    for i, t in ipairs(arbol.talentos or {}) do
      S.hechizos[95000 + a * 100 + i] = t.nombre
    end
  end
end

-- El talento de un nodo (y su árbol), o nil.
local function talentoDeNodo(nodo)
  if type(nodo) ~= "number" then return nil end
  local a, i = math.floor(nodo / 100), nodo % 100
  local arbol = S.talentos and S.talentos.arboles[a]
  return arbol and arbol.talentos[i], a
end

local function puntosArbol(a)
  local p = 0
  for _, t in ipairs(S.talentos.arboles[a].talentos) do p = p + (t.rango or 0) end
  return p
end

local function esConfig(config)
  return S.talentos ~= nil and config == CONFIG_TALENTOS
end

-- wowpedia: C_ClassTalents.GetActiveConfigID() : configID? (la configuración de talentos activa; nil si no hay).
B.espacio("C_ClassTalents", {
  GetActiveConfigID = function()
    B.anotar("C_ClassTalents.GetActiveConfigID")
    return S.talentos and CONFIG_TALENTOS or nil
  end,
})

-- wowpedia: C_SpecializationInfo.GetActiveSpecGroup() : specGroupIndex (1 o 2) y
-- C_SpecializationInfo.GetCombatConfigIDForSpecGroup(specGroupIndex) : configID? (las usa la ventana de Forever).
B.espacio("C_SpecializationInfo", {
  GetActiveSpecGroup = function()
    B.anotar("C_SpecializationInfo.GetActiveSpecGroup")
    return 1
  end,
  GetCombatConfigIDForSpecGroup = function(grupo)
    B.anotar("C_SpecializationInfo.GetCombatConfigIDForSpecGroup", grupo)
    return grupo == 1 and S.talentos and CONFIG_TALENTOS or nil
  end,
})

B.espacio("C_Traits", {
  -- wowpedia: C_Traits.GetConfigInfo(configID) : configInfo? {ID, type, name, treeIDs}.
  GetConfigInfo = function(config)
    B.anotar("C_Traits.GetConfigInfo", config)
    if not esConfig(config) then return nil end
    return {ID = config, type = 1, name = "", treeIDs = {ARBOL_TALENTOS}}
  end,
  -- wow-ui-source (rama forever; wowpedia no la tiene): C_Traits.GetGroupDisplayInfoByTreeID(treeID) : {{groupID,
  -- treeID, orderIndex, displayName}} (cada árbol de la ventana de talentos de Forever es un grupo de nodos).
  GetGroupDisplayInfoByTreeID = function(arbol)
    B.anotar("C_Traits.GetGroupDisplayInfoByTreeID", arbol)
    local salida = {}
    if S.talentos and arbol == ARBOL_TALENTOS then
      -- Al revés a propósito: el orden lo da orderIndex, no la posición en la lista.
      for a = #S.talentos.arboles, 1, -1 do
        salida[#salida + 1] = {groupID = 10 + a, treeID = arbol, orderIndex = a, displayName = S.talentos.arboles[a].nombre}
      end
    end
    return salida
  end,
  -- wow-ui-source (rama forever): C_Traits.GetGroupCurrencyInfo(configID, groupIDs) : {{traitNodeGroupID,
  -- currencyInfos = {{traitCurrencyID, quantity, spent}}}}: los puntos gastados en cada grupo.
  GetGroupCurrencyInfo = function(config, grupos)
    B.anotar("C_Traits.GetGroupCurrencyInfo", config, grupos)
    local salida = {}
    if not esConfig(config) then return salida end
    for _, g in ipairs(grupos or {}) do
      if S.talentos.arboles[g - 10] then
        salida[#salida + 1] = {traitNodeGroupID = g, currencyInfos = {{traitCurrencyID = 1, quantity = 0, spent = puntosArbol(g - 10)}}}
      end
    end
    return salida
  end,
  -- wowpedia: C_Traits.GetTreeCurrencyInfo(configID, treeID, excludeStagedChanges) : {{traitCurrencyID, quantity,
  -- maxQuantity, spent}}: quantity son los puntos sin gastar.
  GetTreeCurrencyInfo = function(config, arbol, sinPendientes)
    B.anotar("C_Traits.GetTreeCurrencyInfo", config, arbol, sinPendientes)
    if not esConfig(config) or arbol ~= ARBOL_TALENTOS then return {} end
    local gastados = 0
    for a in ipairs(S.talentos.arboles) do gastados = gastados + puntosArbol(a) end
    return {{traitCurrencyID = 1, quantity = S.talentos.libres or 0, maxQuantity = nil, spent = gastados}}
  end,
  -- wowpedia: C_Traits.GetTreeNodes(treeID) : {nodeID}: todos los nodos del árbol, tengan puntos o no.
  GetTreeNodes = function(arbol)
    B.anotar("C_Traits.GetTreeNodes", arbol)
    local salida = {}
    if S.talentos and arbol == ARBOL_TALENTOS then
      for a, datos in ipairs(S.talentos.arboles) do
        for i in ipairs(datos.talentos) do salida[#salida + 1] = a * 100 + i end
      end
    end
    return salida
  end,
  -- wowpedia: C_Traits.GetNodeInfo(configID, nodeID) : TraitNodeInfo {ID, posX, posY, currentRank, activeRank,
  -- ranksPurchased, maxRanks, groupIDs, activeEntry = {entryID, rank}?, entryIDs, isVisible}. Con un nodo que no existe, el
  -- cliente da una tabla con ID 0 (no nil).
  GetNodeInfo = function(config, nodo)
    B.anotar("C_Traits.GetNodeInfo", config, nodo)
    local t, a = talentoDeNodo(nodo)
    if not esConfig(config) or not t then return {ID = 0, posX = 0, posY = 0, activeRank = 0, maxRanks = 0, groupIDs = {}, entryIDs = {}} end
    local rango = t.rango or 0
    return {ID = nodo, posX = (a - 1) * 3000 + t.columna * 600, posY = 900 + t.fila * 600, currentRank = rango,
      activeRank = rango, ranksPurchased = rango, maxRanks = t.maximo, groupIDs = {10 + a},
      activeEntry = rango > 0 and {entryID = nodo * 10, rank = rango} or nil, entryIDs = {nodo * 10}, isVisible = true}
  end,
  -- wowpedia: C_Traits.GetEntryInfo(configID, entryID) : TraitEntryInfo {definitionID, type, maxRanks, isAvailable}.
  GetEntryInfo = function(config, entrada)
    B.anotar("C_Traits.GetEntryInfo", config, entrada)
    local nodo = math.floor((entrada or 0) / 10)
    local t = talentoDeNodo(nodo)
    if not esConfig(config) or not t then return nil end
    return {definitionID = 5000 + nodo, type = 0, maxRanks = t.maximo, isAvailable = true}
  end,
  -- wowpedia: C_Traits.GetDefinitionInfo(definitionID) : TraitDefinitionInfo {spellID, overrideName?, overrideIcon?,
  -- overriddenSpellID?, ...}. El nombre suele salir del hechizo; overrideName solo si el rasgo lo cambia.
  GetDefinitionInfo = function(definicion)
    B.anotar("C_Traits.GetDefinitionInfo", definicion)
    local nodo = (definicion or 0) - 5000
    local t = talentoDeNodo(nodo)
    if not t then return nil end
    return {spellID = 95000 + nodo, overrideName = t.sobrenombre}
  end,
})

-- wowpedia (Classic): GetNumTalentTabs() : numTabs; GetTalentTabInfo(tabIndex) : name, iconTexture, pointsSpent,
-- fileName; GetNumTalents(tabIndex) : numTalents; GetTalentInfo(tabIndex, talentIndex) : name, iconTexture, tier,
-- column, rank, maxRank; UnitCharacterPoints("player") : talentPoints (los puntos sin gastar).
function GetNumTalentTabs()
  B.anotar("GetNumTalentTabs")
  return S.talentos and #S.talentos.arboles or 0
end

function GetTalentTabInfo(a)
  B.anotar("GetTalentTabInfo", a)
  local arbol = S.talentos and S.talentos.arboles[a]
  if not arbol then return nil end
  return arbol.nombre, "Interface\\Icons\\INV_Misc_QuestionMark", puntosArbol(a), "Fondo" .. a
end

function GetNumTalents(a)
  B.anotar("GetNumTalents", a)
  local arbol = S.talentos and S.talentos.arboles[a]
  return arbol and #arbol.talentos or 0
end

function GetTalentInfo(a, i)
  B.anotar("GetTalentInfo", a, i)
  local arbol = S.talentos and S.talentos.arboles[a]
  local t = arbol and arbol.talentos[i]
  if not t then return nil end
  return t.sobrenombre or t.nombre, "Interface\\Icons\\INV_Misc_QuestionMark", t.fila, t.columna, t.rango or 0, t.maximo
end

function UnitCharacterPoints(unidad)
  B.anotar("UnitCharacterPoints", unidad)
  soloJugador("UnitCharacterPoints", unidad)
  return S.talentos and S.talentos.libres or 0
end

-- wowpedia: Enum.FlightPathState (estado de cada nodo de C_TaxiMap.GetAllTaxiNodes): 0 el nodo donde estás, 1 al que
-- se puede volar, 2 inalcanzable.
-- Fase 4, tarea 7 (wowpedia: Enum.BagIndex): Backpack 0, Bag_1…Bag_4 1-4, Bank -1 y BankBag_n las siguientes; Forever
-- tiene 6 bolsas del banco.
-- Fase 4, tarea 10 (wowpedia: Enum.TooltipDataType): Item 0, Spell 1, Unit 2.
-- Comercio, tarea 13 (wow-ui-source, AuctionHouseSharedDocumentation.lua: Enum.AuctionHouseSortOrder): el orden de
-- SendSearchQuery (Price 0, Name 1, Level 2, Bid 3, Buyout 4, TimeRemaining 5). El banco no ordena: solo lo acepta.
B.espacio("Enum", {FlightPathState = {Current = 0, Reachable = 1, Unreachable = 2},
  TooltipDataType = {Item = 0, Spell = 1, Unit = 2},
  TooltipDataLineType = {SellPrice = 11}, -- Task 20d: solo la línea del precio de venta
  AuctionHouseSortOrder = {Price = 0, Name = 1, Level = 2, Bid = 3, Buyout = 4, TimeRemaining = 5},
  BagIndex = {Backpack = 0, Bag_1 = 1, Bag_2 = 2, Bag_3 = 3, Bag_4 = 4, Bank = -1,
    BankBag_1 = 5, BankBag_2 = 6, BankBag_3 = 7, BankBag_4 = 8, BankBag_5 = 9, BankBag_6 = 10}})

-- F2b: el Enum.BagIndex de WoW Forever tal cual lo da /dump Enum.BagIndex en el juego (20-nov): la bolsa de componentes
-- (5), las pestañas del banco del personaje (6 a 14) y las del banco de cuenta (15 a 23), los huecos de las bolsas de las
-- pestañas (Characterbanktab -2, Accountbanktab -3) y el llavero en el -1. NO hay Bank ni BankBag_n. Con
-- crearMaquina({bolsas: "forever"}); lo de arriba es la forma clásica (la de siempre).
function B.bolsasDeForever()
  local t = {Backpack = 0, Bag_1 = 1, Bag_2 = 2, Bag_3 = 3, Bag_4 = 4, ReagentBag = 5,
    Characterbanktab = -2, Accountbanktab = -3, Keyring = -1}
  for i = 1, 9 do
    t["CharacterBankTab_" .. i] = 5 + i
    t["AccountBankTab_" .. i] = 14 + i
  end
  Enum.BagIndex = t
end

-- wowpedia: C_Texture.GetAtlasInfo(atlas): {width, height, file...} o nil si el cliente no tiene ese atlas. B.atlas
-- son los que tiene: el del pin de mapa que usa OpenMap (Map/Pins.lua:38, comprobado en Forever) está por defecto.
B.atlas = {["Waypoint-MapPin-Untracked"] = {width = 24, height = 24}, ["Waypoint-MapPin-Tracked"] = {width = 30, height = 30}}
B.espacio("C_Texture", {
  GetAtlasInfo = function(nombre)
    B.anotar("C_Texture.GetAtlasInfo", nombre)
    local a = B.atlas[nombre]
    return a and {width = a.width, height = a.height, file = 0} or nil
  end,
})

-- wowpedia: C_AddOns.IsAddOnLoaded(name). BANCO.addonsCargados[nombre] = true lo da por cargado (maquina.js lo pone para SnetForever_Comercio cuando carga sus archivos).
B.addonsCargados = {}
B.addonsCambiados = {}
-- Los addons instalados (las carpetas de AddOns con su .toc), que pone maquina.js: [nombre] = {titulo, notas, desactivado}.
-- desactivado = true si la sesión empezó con el addon desactivado en la lista (ranurasDesactivadas). Uno que no está
-- aquí no existe: GetAddOnInfo da «MISSING».
B.addonsInstalados = {}
B.espacio("C_AddOns", {
  IsAddOnLoaded = function(nombre)
    B.anotar("C_AddOns.IsAddOnLoaded", nombre)
    return B.addonsCargados[nombre] == true
  end,
  -- wowpedia: C_AddOns.LoadAddOn(name) devuelve loaded y reason («MISSING», «DISABLED»...). Con la opción addonsDir,
  -- B.leerAddon (maquina.js) lee en ese momento el .toc y los archivos de la carpeta; la segunda vez en la sesión da
  -- true sin ejecutar nada. Sin la opción, ningún addon existe.
  LoadAddOn = function(nombre)
    if type(nombre) ~= "string" then error("uso: C_AddOns.LoadAddOn(nombre)", 2) end
    B.anotar("C_AddOns.LoadAddOn", nombre)
    if B.addonsCargados[nombre] then return true end
    if not B.leerAddon then return false, "MISSING" end
    local archivos, razon = B.leerAddon(nombre)
    if not archivos then return false, razon end
    B.addonsCargados[nombre] = true
    for _, archivo in ipairs(archivos) do
      B.cargarArchivo(archivo.fuente, nombre .. "/" .. archivo.ruta, nombre)
    end
    return true
  end,
  -- wowpedia: C_AddOns.DisableAddOn(name [, character]) y C_AddOns.EnableAddOn(name [, character]) cambian la lista de
  -- addons del cliente; no están protegidas y valen desde el siguiente /reload (en la sesión no se descarga ni se carga
  -- nada). Se apuntan en BANCO.addonsCambiados[nombre] = false (desactivado) o true (activado); recargar() de maquina.js
  -- lo pasa a ranurasDesactivadas, así que tras /reload un addon desactivado no se carga (y LoadAddOn da «DISABLED»).
  DisableAddOn = function(nombre, personaje)
    if type(nombre) ~= "string" then error("uso: C_AddOns.DisableAddOn(nombre [, personaje])", 2) end
    B.anotar("C_AddOns.DisableAddOn", nombre, personaje)
    B.addonsCambiados[nombre] = false
  end,
  EnableAddOn = function(nombre, personaje)
    if type(nombre) ~= "string" then error("uso: C_AddOns.EnableAddOn(nombre [, personaje])", 2) end
    B.anotar("C_AddOns.EnableAddOn", nombre, personaje)
    B.addonsCambiados[nombre] = true
  end,
  -- wowpedia: C_AddOns.DoesAddOnExist(name): si hay una carpeta con ese addon.
  DoesAddOnExist = function(nombre)
    B.anotar("C_AddOns.DoesAddOnExist", nombre)
    return B.addonsInstalados[nombre] ~= nil
  end,
  -- wowpedia: C_AddOns.GetAddOnInfo(name) -> name, title, notes, loadable, reason, security, updateAvailable. reason es
  -- nil si se puede cargar; «MISSING» si no está instalado y «DISABLED» si la sesión empezó con él desactivado.
  GetAddOnInfo = function(nombre)
    B.anotar("C_AddOns.GetAddOnInfo", nombre)
    local a = B.addonsInstalados[nombre]
    if not a then
      return nombre, nil, nil, false, "MISSING", "INSECURE", false
    end
    if a.desactivado then
      return nombre, a.titulo, a.notas, false, "DISABLED", "INSECURE", false
    end
    return nombre, a.titulo, a.notas, true, nil, "INSECURE", false
  end,
  -- wowpedia: C_AddOns.GetAddOnEnableState(name [, character]) -> Enum.AddOnEnableState (0 None, 1 Some, 2 All). Un
  -- DisableAddOn / EnableAddOn de la sesión se ve en el acto (la carga cambia tras /reload). Sin instalar, 0.
  GetAddOnEnableState = function(nombre, personaje)
    B.anotar("C_AddOns.GetAddOnEnableState", nombre, personaje)
    local cambio = B.addonsCambiados[nombre]
    if cambio ~= nil then
      return cambio and 2 or 0
    end
    local a = B.addonsInstalados[nombre]
    return (a and not a.desactivado) and 2 or 0
  end,
})

---------------------------------------------------------------------------------------------------
-- Casa de subastas moderna (comercio, tarea 9). Nombres, argumentos y estructuras de wow-ui-source, rama forever,
-- Blizzard_APIDocumentationGenerated/AuctionHouseDocumentation.lua (comprobado el 13-nov-2026). Todo el estado vive en
-- BANCO.subasta y las pruebas lo cambian con B.ponerSubasta(cambios):
--   abierta       la ventana está abierta (lo ponen AUCTION_HOUSE_SHOW y AUCTION_HOUSE_CLOSED en B.disparar). Cerrada,
--                 las búsquedas y compras no hacen nada (se apuntan en BANCO.llamadas["C_AuctionHouse:ignorada"]).
--   lista         con false, el sistema de mensajes está limitado (otro addon acaba de usar la subasta) hasta que la
--                 prueba ponga lista = true y dispare AUCTION_HOUSE_THROTTLED_SYSTEM_READY. Mientras, las búsquedas se
--                 pierden como en el cliente (se apuntan en "C_AuctionHouse:limitada").
--   IsThrottledMessageSystemReady() da lista y que no haya una búsqueda propia en curso: cada búsqueda atendida dispara
--                 AUCTION_HOUSE_THROTTLED_MESSAGE_SENT dentro de la llamada y deja el sistema ocupado; en el salto
--                 siguiente llegan los resultados y después, ya libre, AUCTION_HOUSE_THROTTLED_SYSTEM_READY (si lista).
--   libreAntes    con true, en ese salto el sistema queda libre (y llega AUCTION_HOUSE_THROTTLED_SYSTEM_READY) antes que
--                 los eventos con los resultados: el orden que no se puede descartar en el cliente (parte 3, B1).
--   navegar       filas que da SendBrowseQuery: {itemID | itemKey, totalQuantity, minPrice, containsOwnerItem?};
--   porPagina     filas de cada página (SendBrowseQuery da la primera y cada RequestMoreBrowseResults la siguiente).
--   mercancias    [itemID] = {{quantity, unitPrice, auctionID?}, ...} de menor a mayor precio (SendSearchQuery);
--   objetos       [itemID] = {{quantity, buyoutAmount?, bidAmount?, minBid?, auctionID?, itemLink?}, ...}. Como en WoW
--                 Forever (y como lo lee TSM), una fila de objeto agrupa `quantity` subastas IGUALES de 1 unidad cada una:
--                 buyoutAmount es lo que cuesta UNA (lo que cobra PlaceBid) y comprar quita una del grupo (quantity
--                 baja en 1; con la última, la fila se va). Comprar ya da AUCTION_HOUSE_PURCHASE_COMPLETED(auctionID) y
--                 PLAYER_MONEY;
--   errorAlComprar  arreglo de la compra suelta: un Enum.AuctionHouseError; con él, comprar ya un objeto lanza antes
--                 AUCTION_HOUSE_SHOW_ERROR(ese error) y la compra se hace igual (lo que se vio en el juego: el oro se fue y
--                 llegó un error de la subasta);
--   replica       filas de ReplicateItems: {name, itemID, count, buyoutPrice, qualityID?, minBid?, owner?, hasAllInfo?};
--   compraFalla   true: ConfirmCommoditiesPurchase acaba en COMMODITY_PURCHASE_FAILED;
--   precioCompra  cobre por unidad que anuncia COMMODITY_PRICE_UPDATED (sin él, el de las más baratas).
--   F12: una fila de mercancía puede traer numOwnerItems (0 si no se pone; sinNumOwnerItems = true: el campo no viene; puede
--                 ser BANCO.secreto("number")), containsOwnerItem y containsAccountItem; una de objeto, los dos últimos. El
--                 servidor nunca vende lo propio de una mercancía: propiasServidor (si no, numOwnerItems si se puede leer).
--   foto          B6r, ronda 2: con true, lo que el cliente lee de una búsqueda (GetCommoditySearchResultInfo,
--                 GetItemSearchResultInfo y sus cuentas) es la foto de la última SendSearchQuery de ese objeto, como en el
--                 cliente de verdad; sin ella, se lee en vivo (lo de siempre). El servidor (las cotizaciones y las compras)
--                 sigue con lo de ahora. Opción solo para las pruebas que la piden.
--   nivelObjetos  [itemID] = nivel: las subastas de ese objeto llevan un itemKey con ese itemLevel (equipo). La búsqueda
--                 responde con esa clave y GetNumItemSearchResults/GetItemSearchResultInfo solo dan resultados con ella.
--   nombresClave  B2r: [itemID] = {[itemSuffix] = nombre}: el itemName que da GetItemKeyInfo de una clave con ese sufijo
--                 (en WoW Forever trae el nombre con su sufijo, «Rodela de oso pardo de magia»: así lo lee TSM). Sin él, el
--                 nombre del objeto (el de m.itemInfo).
--   claveTarde    B2r: true: la primera vez que se pide una clave, GetItemKeyInfo da nil (no está en la caché del cliente) y
--                 en el salto siguiente llega ITEM_KEY_ITEM_INFO_RECEIVED(itemID); desde entonces la da.
-- Los resultados llegan en el salto siguiente del tiempo falso (m.avanzar(0.05)), nunca dentro de la llamada. Comprar
-- una mercancía sin unidades bastantes da COMMODITY_PRICE_UNAVAILABLE; pujar sin oro bastante (o por una subasta que
-- no existe) da UI_ERROR_MESSAGE(B.ERROR_SIN_DINERO | B.ERROR_NO_ENCONTRADO, texto), como el error rojo del cliente,
-- y no compra nada. Un auctionID que no se da vale itemID * 1000 + n
-- (n = su posición). PlaceBid, StartCommoditiesPurchase y ConfirmCommoditiesPurchase son protegidas: fuera del OnClick
-- de un botón (Click()) dan error.
---------------------------------------------------------------------------------------------------
B.subasta = {
  abierta = false, lista = true, navegar = {}, porPagina = 50, mercancias = {}, objetos = {}, replica = {},
  compraFalla = false, precioCompra = nil, nivelObjetos = {}, libreAntes = false, nombresClave = {}, claveTarde = false,
  clavesSabidas = {}, -- [clave en texto] = true: GetItemKeyInfo ya la sabe (con claveTarde)
  clavesPedidas = {}, -- [clave en texto] = true: ya se ha pedido y su evento está en camino (con claveTarde)
  -- por dentro:
  entregadas = {},  -- filas de navegar ya dadas (GetBrowseResults)
  vistas = {},      -- [itemID] = true: su búsqueda ya respondió (GetCommoditySearchResultInfo...)
  replicadas = {},  -- filas de ReplicateItems ya dadas
  compra = nil,     -- {itemID, quantity, total} entre StartCommoditiesPurchase y la confirmación
  ocupada = false,  -- una búsqueda propia en curso (IsThrottledMessageSystemReady da false)
}
local AH = B.subasta
AH.fotos = {mercancias = {}, objetos = {}} -- con AH.foto: lo que vio la última búsqueda de cada objeto

-- Lo que el cliente ve de las subastas de un objeto (tabla = "mercancias" u "objetos"): la foto o lo de ahora.
local function vistoPorElCliente(tabla, id)
  if AH.foto then
    return AH.fotos[tabla][id] or {}
  end
  return AH[tabla][id] or {}
end

-- La foto de la búsqueda de un objeto: una copia de cada fila, con su auctionID fijo (sin él, valdría por su posición).
local function fotografiar(id)
  for _, tabla in ipairs({"mercancias", "objetos"}) do
    local copia = {}
    for i, f in ipairs(AH[tabla][id] or {}) do
      local c = {}
      for k, v in pairs(f) do c[k] = v end
      c.auctionID = c.auctionID or (id * 1000 + i)
      copia[i] = c
    end
    AH.fotos[tabla][id] = copia
  end
end

function B.ponerSubasta(cambios)
  for clave, valor in pairs(cambios) do AH[clave] = valor end
end

local function claveObjeto(itemID, nivel, sufijo, mascota)
  return {itemID = itemID, itemLevel = nivel or 0, itemSuffix = sufijo or 0, battlePetSpeciesID = mascota or 0}
end

local function copiaClave(k)
  if type(k) == "number" then return claveObjeto(k) end
  return claveObjeto(k.itemID, k.itemLevel, k.itemSuffix, k.battlePetSpeciesID)
end

local function idDeClave(k, uso)
  if type(k) ~= "table" or type(k.itemID) ~= "number" then error("uso: " .. uso .. ": se esperaba un itemKey", 3) end
  return k.itemID
end

-- Responde en el salto siguiente: dispara los eventos de la lista {{nombre, args...}, ...} que da `que()` (una función
-- de la lista se llama en su turno).
local function responder(que)
  programar({vence = B.tick + 1, f = function()
    for _, ev in ipairs(que()) do
      if type(ev) == "function" then ev() else B.disparar(unpack(ev, 1, ev.n or #ev)) end
    end
  end})
end

-- Errores rojos del cliente que imita el banco (UI_ERROR_MESSAGE(errorType, message)).
B.ERROR_SIN_DINERO = 1
B.ERROR_NO_ENCONTRADO = 2
-- wowpedia (GlobalStrings): los textos de esos dos errores.
ERR_NOT_ENOUGH_MONEY = "No tienes suficiente dinero."
ERR_ITEM_NOT_FOUND = "No se encuentra el objeto."
local function errorRojo(tipo, texto)
  responder(function() return {{"UI_ERROR_MESSAGE", tipo, texto}} end)
end

-- ¿Atiende la subasta una búsqueda? Cerrada o limitada no (y se apunta por qué).
local function atiende(api)
  if not AH.abierta then B.anotar("C_AuctionHouse:ignorada", api); return false end
  if not AH.lista or AH.ocupada then B.anotar("C_AuctionHouse:limitada", api); return false end
  return true
end

-- Una búsqueda: si se atiende, AUCTION_HOUSE_THROTTLED_MESSAGE_SENT ya, los eventos de `que()` en el salto siguiente y
-- después el sistema libre (AUCTION_HOUSE_THROTTLED_SYSTEM_READY si no lo ha limitado la prueba).
local function enviar(api, que)
  if not atiende(api) then return end
  AH.ocupada = true
  B.disparar("AUCTION_HOUSE_THROTTLED_MESSAGE_SENT")
  responder(function()
    local eventos = que()
    local libre = function()
      AH.ocupada = false
      if AH.lista then B.disparar("AUCTION_HOUSE_THROTTLED_SYSTEM_READY") end
    end
    if AH.libreAntes then
      table.insert(eventos, 1, libre)
    else
      eventos[#eventos + 1] = libre
    end
    return eventos
  end)
end

local function protegida(api)
  if B.enClic <= 0 then error(api .. ": función protegida, necesita un clic del jugador", 3) end
end

local function filaNavegar(f)
  return {itemKey = copiaClave(f.itemKey or f.itemID), appearanceLink = f.appearanceLink, totalQuantity = f.totalQuantity or 1,
    minPrice = f.minPrice or 0, containsOwnerItem = f.containsOwnerItem == true}
end

local function siguientePagina()
  local nuevas = {}
  local desde = #AH.entregadas
  for i = desde + 1, math.min(#AH.navegar, desde + AH.porPagina) do
    local fila = filaNavegar(AH.navegar[i])
    AH.entregadas[#AH.entregadas + 1] = fila
    nuevas[#nuevas + 1] = fila
  end
  return nuevas
end

local function copiar(t)
  local c = {}
  for k, v in pairs(t) do c[k] = type(v) == "table" and copiar(v) or v end
  return c
end

-- Total de comprar `cantidad` unidades de las más baratas (nil si no hay tantas).
-- F12: las unidades de una fila que el servidor no vende al jugador (las suyas).
local function propiasDeFila(fila)
  if fila.propiasServidor then return fila.propiasServidor end
  local n = fila.numOwnerItems
  return (n ~= nil and not issecretvalue(n)) and n or 0
end

local function costeMercancia(itemID, cantidad)
  local falta, total = cantidad, 0
  for _, fila in ipairs(AH.mercancias[itemID] or {}) do
    local n = math.min(falta, (fila.quantity or 0) - propiasDeFila(fila))
    total = total + n * (fila.unitPrice or 0)
    falta = falta - n
    if falta <= 0 then return total end
  end
  return nil
end

B.espacio("C_AuctionHouse", {
  -- wowpedia: C_AuctionHouse.CloseAuctionHouse() cierra la casa de subastas y el cliente lanza AUCTION_HOUSE_CLOSED
  -- (si estaba abierta). Sin argumentos y sin devolver nada.
  CloseAuctionHouse = function()
    B.anotar("C_AuctionHouse.CloseAuctionHouse")
    if AH.abierta then B.disparar("AUCTION_HOUSE_CLOSED") end
  end,
  IsThrottledMessageSystemReady = function()
    B.anotar("C_AuctionHouse.IsThrottledMessageSystemReady")
    return AH.lista == true and not AH.ocupada
  end,
  MakeItemKey = function(itemID, nivel, sufijo, mascota)
    if type(itemID) ~= "number" then error("uso: C_AuctionHouse.MakeItemKey(itemID [, itemLevel, itemSuffix, battlePetSpeciesID])", 2) end
    B.anotar("C_AuctionHouse.MakeItemKey", itemID, nivel, sufijo, mascota)
    return claveObjeto(itemID, nivel, sufijo, mascota)
  end,

  -- Navegar (AuctionHouseBrowseQuery = {searchString, sorts, minLevel?, maxLevel?, filters?, itemClassFilters?}).
  SendBrowseQuery = function(consulta)
    if type(consulta) ~= "table" or type(consulta.searchString) ~= "string" or type(consulta.sorts) ~= "table" then
      error("uso: C_AuctionHouse.SendBrowseQuery({searchString, sorts, ...})", 2)
    end
    B.anotar("C_AuctionHouse.SendBrowseQuery", consulta)
    -- Como en WoW Forever (visto en el juego el 14-nov): sin filters ni itemClassFilters (tablas, aunque vacías) la
    -- búsqueda vuelve sin ninguna fila y ya «completa».
    local vacia = type(consulta.filters) ~= "table" or type(consulta.itemClassFilters) ~= "table"
    enviar("SendBrowseQuery", function()
      AH.entregadas = {}
      AH.vacia = vacia
      if not vacia then siguientePagina() end
      return {{"AUCTION_HOUSE_BROWSE_RESULTS_UPDATED"}}
    end)
  end,
  RequestMoreBrowseResults = function()
    B.anotar("C_AuctionHouse.RequestMoreBrowseResults")
    if AH.vacia or #AH.entregadas >= #AH.navegar then return end -- ya están todas: no se pide nada
    enviar("RequestMoreBrowseResults", function()
      local nuevas = siguientePagina()
      if #nuevas == 0 then return {} end
      return {{"AUCTION_HOUSE_BROWSE_RESULTS_ADDED", nuevas, n = 2}}
    end)
  end,
  GetBrowseResults = function()
    B.anotar("C_AuctionHouse.GetBrowseResults")
    return copiar(AH.entregadas)
  end,
  HasFullBrowseResults = function()
    B.anotar("C_AuctionHouse.HasFullBrowseResults")
    return AH.vacia == true or #AH.entregadas >= #AH.navegar
  end,

  -- Buscar un objeto: mercancía (COMMODITY_SEARCH_RESULTS_UPDATED) u objeto (ITEM_SEARCH_RESULTS_UPDATED).
  SendSearchQuery = function(clave, orden, separar, minNivel, maxNivel)
    local id = idDeClave(clave, "C_AuctionHouse.SendSearchQuery(itemKey, sorts, separateOwnerItems [, min, max])")
    if type(orden) ~= "table" then error("uso: C_AuctionHouse.SendSearchQuery: sorts tiene que ser una tabla", 2) end
    B.anotar("C_AuctionHouse.SendSearchQuery", clave, orden, separar, minNivel, maxNivel)
    local k = copiaClave(clave)
    if AH.nivelObjetos[id] then k.itemLevel = AH.nivelObjetos[id] end
    enviar("SendSearchQuery", function()
      AH.vistas[id] = true
      fotografiar(id)
      if AH.objetos[id] and not AH.mercancias[id] then
        return {{"ITEM_SEARCH_RESULTS_UPDATED", k, nil, n = 3}}
      end
      return {{"COMMODITY_SEARCH_RESULTS_UPDATED", id}}
    end)
  end,
  GetNumCommoditySearchResults = function(itemID)
    B.anotar("C_AuctionHouse.GetNumCommoditySearchResults", itemID)
    return AH.vistas[itemID] and #vistoPorElCliente("mercancias", itemID) or 0
  end,
  GetCommoditySearchResultsQuantity = function(itemID)
    B.anotar("C_AuctionHouse.GetCommoditySearchResultsQuantity", itemID)
    local n = 0
    if AH.vistas[itemID] then
      for _, f in ipairs(vistoPorElCliente("mercancias", itemID)) do n = n + (f.quantity or 0) end
    end
    return n
  end,
  GetCommoditySearchResultInfo = function(itemID, indice)
    B.anotar("C_AuctionHouse.GetCommoditySearchResultInfo", itemID, indice)
    local f = AH.vistas[itemID] and vistoPorElCliente("mercancias", itemID)[indice]
    if not f then return nil end
    return {itemID = itemID, quantity = f.quantity or 1, unitPrice = f.unitPrice or 0,
      auctionID = f.auctionID or (itemID * 1000 + indice), owners = {}, totalNumberOfOwners = 1,
      timeLeftSeconds = f.timeLeftSeconds, numOwnerItems = (not f.sinNumOwnerItems) and (f.numOwnerItems or 0) or nil,
      containsOwnerItem = f.containsOwnerItem or false, containsAccountItem = f.containsAccountItem or false}
  end,
  -- wowpedia: C_AuctionHouse.GetItemKeyInfo(itemKey [, restrictQualityToFilter]) -> ItemKeyInfo {itemID,
  -- battlePetSpeciesID, itemName, battlePetLink, appearanceLink, quality, iconFileID, isPet, isCommodity, isEquipment}, o nil
  -- si el cliente aún no la sabe (la pide y avisa con ITEM_KEY_ITEM_INFO_RECEIVED(itemID)). Ver nombresClave y claveTarde.
  GetItemKeyInfo = function(clave, restringir)
    local id = idDeClave(clave, "C_AuctionHouse.GetItemKeyInfo(itemKey [, restrictQualityToFilter])")
    B.anotar("C_AuctionHouse.GetItemKeyInfo", clave, restringir)
    local k = table.concat({id, clave.itemLevel or 0, clave.itemSuffix or 0, clave.battlePetSpeciesID or 0}, ":")
    if AH.claveTarde and not AH.clavesSabidas[k] then
      if not AH.clavesPedidas[k] then
        AH.clavesPedidas[k] = true
        responder(function()
          AH.clavesSabidas[k] = true
          return {{"ITEM_KEY_ITEM_INFO_RECEIVED", id}}
        end)
      end
      return nil
    end
    local info = B.inventario.info[id]
    if not info then return nil end
    local nombres = AH.nombresClave[id]
    return {itemID = id, battlePetSpeciesID = clave.battlePetSpeciesID or 0,
      itemName = nombres and nombres[clave.itemSuffix or 0] or info.nombre, quality = info.calidad,
      iconFileID = info.icono, isPet = false, isCommodity = AH.mercancias[id] ~= nil, isEquipment = (info.equipa or "") ~= ""}
  end,
  HasFullCommoditySearchResults = function(itemID)
    B.anotar("C_AuctionHouse.HasFullCommoditySearchResults", itemID)
    return AH.vistas[itemID] == true
  end,
  GetNumItemSearchResults = function(clave)
    local id = idDeClave(clave, "C_AuctionHouse.GetNumItemSearchResults(itemKey)")
    B.anotar("C_AuctionHouse.GetNumItemSearchResults", clave)
    if AH.nivelObjetos[id] and clave.itemLevel ~= AH.nivelObjetos[id] then return 0 end
    return AH.vistas[id] and #vistoPorElCliente("objetos", id) or 0
  end,
  GetItemSearchResultsQuantity = function(clave)
    local id = idDeClave(clave, "C_AuctionHouse.GetItemSearchResultsQuantity(itemKey)")
    B.anotar("C_AuctionHouse.GetItemSearchResultsQuantity", clave)
    local n = 0
    if AH.vistas[id] then
      for _, f in ipairs(vistoPorElCliente("objetos", id)) do n = n + (f.quantity or 1) end
    end
    return n
  end,
  GetItemSearchResultInfo = function(clave, indice)
    local id = idDeClave(clave, "C_AuctionHouse.GetItemSearchResultInfo(itemKey, index)")
    B.anotar("C_AuctionHouse.GetItemSearchResultInfo", clave, indice)
    if AH.nivelObjetos[id] and clave.itemLevel ~= AH.nivelObjetos[id] then return nil end
    local f = AH.vistas[id] and vistoPorElCliente("objetos", id)[indice]
    if not f then return nil end
    return {itemKey = copiaClave(clave), owners = {}, totalNumberOfOwners = 1, timeLeft = f.timeLeft or 3,
      auctionID = f.auctionID or (id * 1000 + indice), quantity = f.quantity or 1, itemLink = f.itemLink,
      containsOwnerItem = f.containsOwnerItem or false, containsAccountItem = f.containsAccountItem or false,
      containsSocketedItem = false, bidder = nil,
      minBid = f.minBid, bidAmount = f.bidAmount, buyoutAmount = f.buyoutAmount, timeLeftSeconds = f.timeLeftSeconds}
  end,
  HasFullItemSearchResults = function(clave)
    local id = idDeClave(clave, "C_AuctionHouse.HasFullItemSearchResults(itemKey)")
    B.anotar("C_AuctionHouse.HasFullItemSearchResults", clave)
    return AH.vistas[id] == true
  end,

  -- Comprar mercancías: Start → COMMODITY_PRICE_UPDATED(unidad, total) → Confirm → SUCCEEDED (y PLAYER_MONEY) o FAILED.
  StartCommoditiesPurchase = function(itemID, cantidad)
    if type(itemID) ~= "number" or type(cantidad) ~= "number" then error("uso: C_AuctionHouse.StartCommoditiesPurchase(itemID, quantity)", 2) end
    B.anotar("C_AuctionHouse.StartCommoditiesPurchase", itemID, cantidad)
    protegida("C_AuctionHouse.StartCommoditiesPurchase")
    if not AH.abierta then B.anotar("C_AuctionHouse:ignorada", "StartCommoditiesPurchase"); return end
    local total = AH.precioCompra and AH.precioCompra * cantidad or costeMercancia(itemID, cantidad)
    if not total then
      responder(function() return {{"COMMODITY_PRICE_UNAVAILABLE"}} end) -- no hay tantas unidades
      return
    end
    AH.compra = {itemID = itemID, quantity = cantidad, total = total}
    responder(function() return {{"COMMODITY_PRICE_UPDATED", math.ceil(total / cantidad), total}} end)
  end,
  ConfirmCommoditiesPurchase = function(itemID, cantidad)
    if type(itemID) ~= "number" or type(cantidad) ~= "number" then error("uso: C_AuctionHouse.ConfirmCommoditiesPurchase(itemID, quantity)", 2) end
    B.anotar("C_AuctionHouse.ConfirmCommoditiesPurchase", itemID, cantidad)
    protegida("C_AuctionHouse.ConfirmCommoditiesPurchase")
    local c = AH.compra
    AH.compra = nil
    local bien = AH.abierta and c and c.itemID == itemID and c.quantity == cantidad and not AH.compraFalla
      and (B.jugador.dinero or 0) >= c.total
    if not bien then
      responder(function() return {{"COMMODITY_PURCHASE_FAILED"}} end)
      return
    end
    B.jugador.dinero = B.jugador.dinero - c.total
    local falta = cantidad
    for _, fila in ipairs(AH.mercancias[itemID] or {}) do
      local n = math.min(falta, (fila.quantity or 0) - propiasDeFila(fila))
      fila.quantity = (fila.quantity or 0) - n
      falta = falta - n
    end
    responder(function() return {{"COMMODITY_PURCHASE_SUCCEEDED"}, {"PLAYER_MONEY"}} end)
  end,
  CancelCommoditiesPurchase = function()
    B.anotar("C_AuctionHouse.CancelCommoditiesPurchase")
    AH.compra = nil
  end,
  -- Pujar o comprar ya una subasta de objeto (bidAmount >= buyoutAmount: comprada y fuera de la lista).
  PlaceBid = function(subastaID, puja)
    if type(subastaID) ~= "number" or type(puja) ~= "number" then error("uso: C_AuctionHouse.PlaceBid(auctionID, bidAmount)", 2) end
    B.anotar("C_AuctionHouse.PlaceBid", subastaID, puja)
    protegida("C_AuctionHouse.PlaceBid")
    if not AH.abierta then B.anotar("C_AuctionHouse:ignorada", "PlaceBid"); return end
    if (B.jugador.dinero or 0) < puja then
      errorRojo(B.ERROR_SIN_DINERO, ERR_NOT_ENOUGH_MONEY)
      return
    end
    for id, filas in pairs(AH.objetos) do
      for i, f in ipairs(filas) do
        if (f.auctionID or (id * 1000 + i)) == subastaID then
          B.jugador.dinero = B.jugador.dinero - puja
          local comprada = f.buyoutAmount and puja >= f.buyoutAmount
          if comprada and (f.quantity or 1) > 1 then
            f.quantity = f.quantity - 1 -- una del grupo de subastas iguales
          elseif comprada then
            table.remove(filas, i)
          else
            f.bidAmount = puja
          end
          local error = AH.errorAlComprar
          responder(function()
            local eventos = {}
            if comprada and error then eventos[#eventos + 1] = {"AUCTION_HOUSE_SHOW_ERROR", error} end
            if comprada then eventos[#eventos + 1] = {"AUCTION_HOUSE_PURCHASE_COMPLETED", subastaID} end
            eventos[#eventos + 1] = {"PLAYER_MONEY"}
            return eventos
          end)
          return
        end
      end
    end
    errorRojo(B.ERROR_NO_ENCONTRADO, ERR_ITEM_NOT_FOUND)
  end,

  -- La subasta entera de una vez (índices desde 0, como el cliente).
  ReplicateItems = function()
    B.anotar("C_AuctionHouse.ReplicateItems")
    enviar("ReplicateItems", function()
      AH.replicadas = copiar(AH.replica)
      return {{"REPLICATE_ITEM_LIST_UPDATE"}}
    end)
  end,
  GetNumReplicateItems = function()
    B.anotar("C_AuctionHouse.GetNumReplicateItems")
    return #AH.replicadas
  end,
  -- name, texture, count, qualityID, usable, level, levelType, minBid, minIncrement, buyoutPrice, bidAmount,
  -- highBidder, bidderFullName, owner, ownerFullName, saleStatus, itemID, hasAllInfo
  GetReplicateItemInfo = function(indice)
    if type(indice) ~= "number" then error("uso: C_AuctionHouse.GetReplicateItemInfo(index)", 2) end
    B.anotar("C_AuctionHouse.GetReplicateItemInfo", indice)
    local f = AH.replicadas[indice + 1]
    if not f then return nil end
    return f.name, f.texture or 0, f.count or 1, f.qualityID or 1, true, f.level or 1, 0, f.minBid or 0, 0,
      f.buyoutPrice or 0, f.bidAmount or 0, false, nil, f.owner, f.owner, 0, f.itemID, f.hasAllInfo ~= false
  end,
})

-- Comercio, tarea 9: la ranura de precios (SnetForever_P01…P08) pone esta global; sin cargar, vale nil.
B.permitirNil("SNF_PRECIOS")

---------------------------------------------------------------------------------------------------
-- Fuera lo que no existe en WoW (Lua 5.1) y globales estrictas.
---------------------------------------------------------------------------------------------------

table.unpack, table.move, table.pack = nil, nil, nil
math.type, math.tointeger, math.ult = nil, nil, nil
string.pack, string.packsize, string.unpack = nil, nil, nil
math.maxinteger, math.mininteger = nil, nil
-- Solo para las herramientas de las pruebas (test/memoria.js recorre los upvalues): el addon no ve debug.
B.depuracion = {getupvalue = debug.getupvalue, getinfo = debug.getinfo}
for _, nombre in ipairs({"utf8", "io", "package", "require", "dofile", "loadfile", "rawlen", "debug"}) do
  rawset(_G, nombre, nil)
end
-- os: solo time, date, clock y difftime. OJO: el cliente de WoW Forever no tiene «os» (fallo del 19-nov, Task 25); el addon no
-- la usa (lo vigila src/comprobar-lua51.js) y las pruebas pueden quitarla con rawset(_G, "os", nil).
do
  local os = rawget(_G, "os")
  local quedan = {time = os.time, date = os.date, clock = os.clock, difftime = os.difftime}
  wipe(os)
  for nombre, funcion in pairs(quedan) do os[nombre] = funcion end
end

setmetatable(_G, {__index = function(_, clave)
  if B.permitidasNil[clave] then return nil end
  error("no imitado: " .. tostring(clave), 2)
end})
