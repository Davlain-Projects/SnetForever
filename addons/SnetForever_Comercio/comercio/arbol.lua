-- SnetForever: árbol de grupos y objetos del comercio (los propios del jugador). Las rutas y los nombres siguen a TSM:
-- cada grupo se identifica por su ruta, con los niveles separados por «`» («Hierbas`Raras»); el grupo Base es la ruta «».
-- Un objeto está en un solo grupo. Los grupos de la app («auto» y «calculado») no pasan por aquí: los da Grupos.lista().
--
-- Guardado (SnetForeverCuenta.comercio.v2, la plantilla está en el núcleo, nucleo/guardado.lua, para que sobreviva a
-- apagar el comercio):
--   grupos[ruta] = true            solo los grupos que existen. Una ruta importada sin sus padres («A`B`C» sin «A`B») se
--                                  lee con los padres que faltan como si existieran. Las rutas mal formadas («A``B», «A`»)
--                                  se dejan como están y no cuentan.
--   objetos[clave] = ruta          un texto por objeto, sin una tabla por objeto: «» es el grupo Base. La clave es la
--                                  cadena de TSM tal cual («i:1234», «i:1234::…», «p:…»); no se interpreta, salvo en idDe.
--   _papelera = {{ruta, grupos = {rutas}, objetos = {clave = ruta}, reglas = {ruta = regla}?, ops = {ruta = tipos}?,
--                                  compra = {ruta = true}?}}   lo
--                                  borrado, con todo lo que tenía, las reglas y las operaciones de sus grupos; se crea al
--                                  borrar el primero. (comercio/operaciones.lua guarda ahí también las operaciones borradas.)
--   gruposOps[ruta] = {tipo = {nombres}}   las operaciones de cada grupo (comercio/operaciones.lua); se mueven con el grupo.
--   _roto                          lo que había donde debía haber una tabla (datos estropeados): nunca se tira.
-- Las reglas de compra (comercio.reglas["propio:<ruta>"], comercio/reglas.lua) cuelgan de la ruta: renombrar, mover, borrar
-- y recuperar las llevan consigo (llevarReglas / ponerReglas, el único sitio que las toca); las operaciones de los grupos
-- (v2.gruposOps) igual (llevarOps / ponerOps), y también los grupos elegidos para el escaneo de compras
-- (comercio.gruposCompra[ruta] = true, ui/subasta/navegar.lua; llevarCompra / ponerCompra): un grupo nuevo con el nombre
-- de uno renombrado, movido o borrado no hereda su elección.
-- El índice inverso (ruta → claves) vive solo en memoria. Lo hacen las ediciones y Arbol.listar; Arbol.objetos y
-- Arbol.contar(ruta) y Arbol.cuantosPorGrupo, si aún no está, recorren los objetos una vez sin hacerlo.
--
-- Arbol.SEP                                  el separador de niveles, «`».
-- Arbol.grupos() -> {ruta = {nombre, nivel, padre}}        todos menos el Base; padre es «» en primer nivel.
-- Arbol.hijos(ruta) -> {rutas}               los de un nivel por debajo, por nombre.
-- Arbol.ordenadas() -> {rutas}               todas, en orden de árbol (cada grupo seguido de sus hijos).
-- Arbol.listar() -> {{ruta, nombre, nivel, claves}}   todas, en orden de árbol, con sus objetos (sin ordenar). Una sola
--                                            lectura de los datos; la usa Grupos.lista.
-- Arbol.existe(ruta) -> boolean              «» (Base) siempre existe.
-- Arbol.crear(rutaPadre, nombre) -> ruta | nil              nil con nombre vacío, con «`», repetido entre hermanos, con un
--                                                           padre que no existe, con el nombre «_roto» en primer nivel o
--                                                           si parece un comando del chat (T1a: empieza por «/», con
--                                                           espacios delante o no). Recorta los espacios de los lados.
-- Arbol.pareceComando(nombre) -> boolean     T1a: ¿empieza por «/» (tras los espacios)? Un jugador pegó un «/run …» en el
--                                            campo de grupo nuevo. Crear y renombrar no lo aceptan; los grupos que ya
--                                            existen con un nombre así no se tocan (los borra el jugador).
-- Arbol.renombrar(ruta, nombre) -> nuevaRuta, cambios | nil mueve hijos, objetos y reglas; cambios = {{vieja, nueva}}.
--                                                           nil también si el nombre parece un comando del chat.
-- Arbol.mover(ruta, nuevoPadre) -> nuevaRuta, cambios | nil nil si es dentro de sí mismo, o si choca con un hermano.
-- Arbol.borrar(ruta) -> boolean              como TSM: se va el grupo y todos sus subgrupos y sus objetos quedan sin grupo,
--                                            en el Base. Todo (grupos, objetos y reglas) va a _papelera, nada se pierde.
-- Arbol.recuperar(ruta) -> boolean, rutaNueva  lo último borrado con esa ruta. Si la ruta ya está ocupada, vuelve con un
--                                            nombre libre («Hierbas 2»); falla si el padre ya no existe. Un objeto que
--                                            mientras tanto se puso en otro grupo se queda donde está.
-- Arbol.papelera() -> {{ruta, nombre}}
-- Arbol.objeto(clave) -> ruta | nil          «» es el Base; nil, que no está apuntado en ningún grupo.
-- Arbol.objetos(ruta) -> {claves}            ordenadas.
-- Arbol.contar(ruta?) -> número              los objetos de un grupo, o todos.
-- Arbol.cuantosPorGrupo() -> {ruta = número}  los objetos de cada grupo (todos los grupos, también los vacíos y los padres
--                                            que faltan; sin el Base), de una sola pasada y sin hacer el índice ni una
--                                            tabla por grupo (Task 26: lo usa Operaciones.usosDeTipo, que solo cuenta).
-- Arbol.poner(clave, ruta|nil) -> boolean    lo saca de donde estuviera; nil lo manda al Base; false si el grupo no existe.
-- Arbol.quitar(clave) -> boolean             lo borra del árbol (no está en ningún grupo, ni en el Base).
-- Arbol.idDe(clave) -> itemID | nil          «i:1234» y «i:1234::…» dan 1234; «p:…» y lo desconocido, nil; un número vale él.
-- Arbol.preparar()                           deja los datos listos y migra la 0.6.2 si falta (lo piden Reglas y quien lea antes).
-- Arbol.olvidarIndice()                      para quien toque SnetForeverCuenta.comercio.v2.objetos a mano.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Arbol = {}
SNF.Arbol = Arbol

local SEP = "`"
Arbol.SEP = SEP
local ROTO = "_roto" -- lo que deja Guardado.preparar (y este módulo) con lo que no era una tabla

-- Índice inverso en memoria: porRuta[ruta] = {[clave] = true}. Es de la tabla `objetos` que indexa (si la cuenta se
-- sustituye, se rehace solo).
local indice = {fuente = nil, porRuta = nil}
local indiceVariantes = {fuente = nil, porBase = nil}

---------------------------------------------------------------------------------------------------
-- Rutas. Todo con búsquedas literales (el nombre puede traer %, ( ), [ ], |c…|r, etc.).
---------------------------------------------------------------------------------------------------

local function posUltimoSep(ruta)
  local pos, desde = nil, 0
  while true do
    local a = string.find(ruta, SEP, desde + 1, true)
    if not a then
      return pos
    end
    pos, desde = a, a
  end
end

local function padreDe(ruta)
  local pos = posUltimoSep(ruta)
  return pos and string.sub(ruta, 1, pos - 1) or ""
end

local function nombreDe(ruta)
  local pos = posUltimoSep(ruta)
  return pos and string.sub(ruta, pos + 1) or ruta
end

local function nivelDe(ruta)
  local n, desde = 1, 0
  while true do
    local a = string.find(ruta, SEP, desde + 1, true)
    if not a then
      return n
    end
    n, desde = n + 1, a
  end
end

local function unir(padre, nombre)
  if padre == "" then
    return nombre
  end
  return padre .. SEP .. nombre
end

-- ¿La ruta es `base` o está dentro de ella? (base «» lo contiene todo)
local function dentroDe(ruta, base)
  return base == "" or ruta == base or string.sub(ruta, 1, #base + 1) == base .. SEP
end

-- Una ruta bien formada: sin niveles vacíos y que no sea «_roto». Las que no lo están se dejan como están y no cuentan.
local function valida(ruta)
  return type(ruta) == "string" and ruta ~= "" and ruta ~= ROTO and string.sub(ruta, 1, 1) ~= SEP
    and string.sub(ruta, -1) ~= SEP and not string.find(ruta, SEP .. SEP, 1, true)
end

-- Una clave de objeto de verdad (un texto; «_roto» es el cajón de lo estropeado).
local function claveValida(clave)
  return type(clave) == "string" and clave ~= ROTO
end

-- T1a: ¿parece un comando del chat? Empieza por «/» (con espacios delante o no): un jugador pegó un «/run …» en el campo
-- de grupo nuevo. Es la única regla: la usan nombreValido, los campos de Grupos y el import de texto.
function Arbol.pareceComando(nombre)
  return type(nombre) == "string" and string.find(nombre, "^%s*/") ~= nil
end

-- Un nombre que escribe el jugador: sin espacios a los lados, no vacío, sin el separador (TSM tampoco lo admite) y que no
-- parezca un comando del chat.
local function nombreValido(nombre)
  if type(nombre) ~= "string" then
    return nil
  end
  nombre = string.gsub(nombre, "^%s+", "")
  nombre = string.gsub(nombre, "%s+$", "")
  if nombre == "" or string.find(nombre, SEP, 1, true) or Arbol.pareceComando(nombre) then
    return nil
  end
  return nombre
end

---------------------------------------------------------------------------------------------------
-- Datos.
---------------------------------------------------------------------------------------------------

-- ¿Existe el grupo? Cuentan las rutas bien formadas, solas o como padre de otra.
local function existeRuta(v2, ruta)
  if ruta == "" then
    return true
  end
  if not valida(ruta) then
    return false
  end
  if v2.grupos[ruta] ~= nil then
    return true
  end
  local prefijo = ruta .. SEP
  for otra in pairs(v2.grupos) do
    if valida(otra) and string.sub(otra, 1, #prefijo) == prefijo then
      return true
    end
  end
  return false
end

local function olvidar()
  indice.fuente, indice.porRuta = nil, nil
  indiceVariantes.fuente, indiceVariantes.porBase = nil, nil
end

local function copiaRegla(regla)
  local c = {}
  for k, v in pairs(regla) do
    c[k] = v
  end
  return c
end

-- La clave de un grupo propio en Grupos.lista() y en las reglas es «propio:<ruta>» (comercio/grupos.lua).
local function claveRegla(ruta)
  return "propio:" .. ruta
end

-- Reglas: el único sitio que las mueve. llevarReglas saca las de las rutas dadas de comercio.reglas y las devuelve
-- ({ruta = regla}); ponerReglas las pone (con la ruta que corresponda a cada una). Sin `pisar`, no toca una regla que ya
-- esté en esa clave.
local function llevarReglas(c, rutas)
  local sacadas = {}
  local reglas = c.reglas
  if type(reglas) == "table" then
    for _, r in ipairs(rutas) do
      local k = claveRegla(r)
      if reglas[k] ~= nil then
        sacadas[r] = reglas[k]
        reglas[k] = nil
      end
    end
  end
  return sacadas
end

local function ponerReglas(c, reglasPorRuta, pisar)
  if next(reglasPorRuta) == nil then
    return
  end
  if c.reglas == nil then
    c.reglas = {}
  end
  if type(c.reglas) ~= "table" then
    return
  end
  for r, regla in pairs(reglasPorRuta) do
    local k = claveRegla(r)
    if pisar or c.reglas[k] == nil then
      c.reglas[k] = regla
    end
  end
end

-- Operaciones de los grupos (v2.gruposOps[ruta], las escribe comercio/operaciones.lua): igual que las reglas, siguen al grupo.
local function llevarOps(v2, rutas)
  local sacadas = {}
  local grupos = v2.gruposOps
  if type(grupos) == "table" then
    for _, r in ipairs(rutas) do
      if grupos[r] ~= nil then
        sacadas[r] = grupos[r]
        grupos[r] = nil
      end
    end
  end
  return sacadas
end

local function ponerOps(v2, opsPorRuta, pisar)
  if next(opsPorRuta) == nil then
    return
  end
  if v2.gruposOps == nil then
    v2.gruposOps = {}
  end
  if type(v2.gruposOps) ~= "table" then
    return
  end
  for r, ops in pairs(opsPorRuta) do
    if pisar or v2.gruposOps[r] == nil then
      v2.gruposOps[r] = ops
    end
  end
end

-- Los grupos elegidos para el escaneo de compras (comercio.gruposCompra[ruta] = true, los elige Navegar de la subasta):
-- igual que las reglas, siguen al grupo. Si no es una tabla no se toca.
local function llevarCompra(c, rutas)
  local sacadas = {}
  local elegidos = c.gruposCompra
  if type(elegidos) == "table" then
    for _, r in ipairs(rutas) do
      if elegidos[r] ~= nil then
        sacadas[r] = elegidos[r]
        elegidos[r] = nil
      end
    end
  end
  return sacadas
end

local function ponerCompra(c, porRuta, pisar)
  if next(porRuta) == nil then
    return
  end
  if c.gruposCompra == nil then
    c.gruposCompra = {}
  end
  if type(c.gruposCompra) ~= "table" then
    return
  end
  for r, v in pairs(porRuta) do
    if pisar or c.gruposCompra[r] == nil then
      c.gruposCompra[r] = v
    end
  end
end

-- Un nombre de la lista plana vieja convertido en un nombre de grupo de primer nivel.
local function nombreMigrado(nombre)
  if type(nombre) ~= "string" then
    nombre = ""
  end
  nombre = string.gsub(nombre, SEP, "'")
  nombre = string.gsub(nombre, "^%s+", "")
  nombre = string.gsub(nombre, "%s+$", "")
  if nombre == "" or nombre == ROTO then
    nombre = "Grupo"
  end
  return nombre
end

local function idValido(id)
  return type(id) == "number" and id > 0 and id == math.floor(id)
end

-- Pone una tabla donde hace falta; si había otra cosa, se guarda en _roto (nunca se tira).
local function asegurarTabla(padre, campo)
  local v = padre[campo]
  if type(v) ~= "table" then
    padre[campo] = v == nil and {} or {[ROTO] = v}
  end
end

-- Todo lo que hay que escribir para migrar, calculado sin tocar nada (si algo falla aquí, no queda nada a medias).
local function planMigracion(c, v2, viejos, vieja)
  local plan = {grupos = {}, objetos = {}, papelera = {}, reglasNuevas = {}, reglasViejas = {}}
  local usados = {}
  local reglas = type(c.reglas) == "table" and c.reglas or nil
  local function regla(claveVieja)
    local r = reglas and type(claveVieja) == "string" and reglas[claveVieja]
    if type(r) == "table" then
      plan.reglasViejas[claveVieja] = r
      return copiaRegla(r)
    end
    return nil
  end
  for _, g in ipairs(viejos) do
    if type(g) == "table" then
      local base = nombreMigrado(g.nombre)
      local nombre, n = base, 1
      while usados[nombre] or existeRuta(v2, nombre) do
        n = n + 1
        nombre = base .. " " .. n
      end
      usados[nombre] = true
      plan.grupos[#plan.grupos + 1] = nombre
      if type(g.objetos) == "table" then
        for _, id in ipairs(g.objetos) do
          if idValido(id) then
            local clave = "i:" .. string.format("%d", id)
            if v2.objetos[clave] == nil and plan.objetos[clave] == nil then
              plan.objetos[clave] = nombre
            end
          end
        end
      end
      local r = regla(g.clave)
      if r then
        plan.reglasNuevas[claveRegla(nombre)] = r
      end
    end
  end
  for _, g in ipairs(vieja) do
    if type(g) == "table" then
      local nombre = nombreMigrado(g.nombre)
      local entrada = {ruta = nombre, grupos = {nombre}, objetos = {}}
      if type(g.objetos) == "table" then
        for _, id in ipairs(g.objetos) do
          if idValido(id) then
            entrada.objetos["i:" .. string.format("%d", id)] = nombre
          end
        end
      end
      local r = regla(g.clave)
      if r then
        entrada.reglas = {[nombre] = r}
      end
      plan.papelera[#plan.papelera + 1] = entrada
    end
  end
  return plan
end

-- La lista plana de la 0.6.2 (comercio.grupos) pasa a grupos de primer nivel con sus objetos «i:<id>»; la papelera vieja
-- (comercio.papelera) pasa a v2._papelera. Un objeto que estaba en dos grupos se queda en el primero de la lista vieja.
-- Las listas viejas no se tiran: quedan en comercio._v1grupos y comercio._v1papelera. Las reglas se MUEVEN a la clave nueva
-- («propio:<nombre>»; las de la papelera van dentro de su entrada) y las entradas viejas de reglas quedan en
-- comercio._v1reglas, así una clave vieja («propio:1») no la hereda un grupo nuevo que se llame «1». Se hace una vez: con
-- _v1grupos puesto no vuelve a pasar, y sin nada que migrar no se escribe nada. Primero se calcula todo (pcall) y después
-- se escribe, con la marca _v1grupos la última: un fallo no deja la migración a medias.
local function migrar(c, v2)
  if c._v1grupos ~= nil then
    return
  end
  local viejos = type(c.grupos) == "table" and c.grupos or {}
  local vieja = type(c.papelera) == "table" and c.papelera or {}
  if #viejos == 0 and #vieja == 0 then
    return
  end
  local ok, plan = pcall(planMigracion, c, v2, viejos, vieja)
  if not ok then
    return
  end
  if next(plan.reglasViejas) ~= nil then
    c._v1reglas = {}
    for k, r in pairs(plan.reglasViejas) do
      c._v1reglas[k] = r
      c.reglas[k] = nil
    end
    for k, r in pairs(plan.reglasNuevas) do
      c.reglas[k] = r
    end
  end
  for _, nombre in ipairs(plan.grupos) do
    v2.grupos[nombre] = true
  end
  for clave, nombre in pairs(plan.objetos) do
    v2.objetos[clave] = nombre
  end
  if #plan.papelera > 0 then
    asegurarTabla(v2, "_papelera")
    for _, entrada in ipairs(plan.papelera) do
      table.insert(v2._papelera, entrada)
    end
  end
  c._v1papelera = vieja
  c.grupos = {}
  c.papelera = {}
  olvidar()
  c._v1grupos = viejos -- la marca, lo último
end

-- Lo guardado del árbol (comercio.v2, y comercio para las reglas) listo para usar, o nil si aún no hay cuenta. Migra la
-- primera vez.
local function datos()
  local account = rawget(_G, "SnetForeverCuenta")
  local commerce = type(account) == "table" and account.comercio
  local tree = type(commerce) == "table" and commerce.v2
  -- The tooltip needs only the current tree. Repair incomplete saved data
  -- below, and still check for legacy groups even when the schema is complete.
  if type(tree) == "table" and type(tree.grupos) == "table" and type(tree.objetos) == "table"
    and type(tree.operaciones) == "table" and type(tree.fuentes) == "table"
    and type(commerce.reglas) == "table" and type(commerce.grupos) == "table" and type(commerce.papelera) == "table" then
    migrar(commerce, tree)
    return tree, commerce
  end
  pcall(SNF.Guardado.preparar)
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  if type(c) ~= "table" then
    return nil
  end
  asegurarTabla(c, "v2")
  local v2 = c.v2
  for _, campo in ipairs({"grupos", "objetos", "operaciones", "fuentes"}) do
    asegurarTabla(v2, campo)
  end
  migrar(c, v2)
  return v2, c
end

---------------------------------------------------------------------------------------------------
-- Índice inverso.
---------------------------------------------------------------------------------------------------

local function indiceListo(v2)
  return indice.fuente == v2.objetos and indice.porRuta ~= nil
end

local function porRutas(v2)
  if not indiceListo(v2) then
    local porRuta = {}
    for clave, ruta in pairs(v2.objetos) do
      if claveValida(clave) and type(ruta) == "string" then
        local set = porRuta[ruta]
        if not set then
          set = {}
          porRuta[ruta] = set
        end
        set[clave] = true
      end
    end
    indice.fuente, indice.porRuta = v2.objetos, porRuta
  end
  return indice.porRuta
end

local function baseVariante(clave)
  return string.match(clave, "^(i:%d+):") or (string.sub(clave, 1, 2) == "p:" and "p" or nil)
end

-- Apunta un objeto en una ruta («» = Base) o, con nil, lo borra del árbol; mantiene el índice si ya está hecho.
local function apuntar(v2, clave, ruta)
  local actual = v2.objetos[clave]
  if actual == ruta then
    return
  end
  local porRuta = indiceListo(v2) and indice.porRuta or nil
  if porRuta and type(actual) == "string" then
    local set = porRuta[actual]
    if set then
      set[clave] = nil
      if next(set) == nil then
        porRuta[actual] = nil
      end
    end
  end
  v2.objetos[clave] = ruta
  -- Mover una variante conserva su clave en el índice: la ruta se lee del árbol al consultar.
  if (actual == nil or ruta == nil) and indiceVariantes.fuente == v2.objetos and baseVariante(clave) then
    indiceVariantes.fuente, indiceVariantes.porBase = nil, nil
  end
  if porRuta and ruta ~= nil then
    local set = porRuta[ruta]
    if not set then
      set = {}
      porRuta[ruta] = set
    end
    set[clave] = true
  end
end

---------------------------------------------------------------------------------------------------
-- Grupos.
---------------------------------------------------------------------------------------------------

-- Todos los grupos con sus padres que falten como si existieran.
local function vista(v2)
  local salida = {}
  for ruta in pairs(v2.grupos) do
    if valida(ruta) then
      local r = ruta
      while r ~= "" and not salida[r] do
        salida[r] = {nombre = nombreDe(r), nivel = nivelDe(r), padre = padreDe(r)}
        r = padreDe(r)
      end
    end
  end
  return salida
end

local function porNombre(a, b)
  local la, lb = string.lower(a.nombre), string.lower(b.nombre)
  if la ~= lb then
    return la < lb
  end
  return a.ruta < b.ruta
end

-- Las rutas hijas de cada ruta en una tabla {padre = {rutas por nombre}}.
local function hijosDe(grupos)
  local mapa = {}
  for ruta, g in pairs(grupos) do
    local lista = mapa[g.padre]
    if not lista then
      lista = {}
      mapa[g.padre] = lista
    end
    lista[#lista + 1] = {ruta = ruta, nombre = g.nombre}
  end
  for _, lista in pairs(mapa) do
    table.sort(lista, porNombre)
  end
  return mapa
end

function Arbol.grupos()
  local v2 = datos()
  return v2 and vista(v2) or {}
end

function Arbol.hijos(ruta)
  local v2 = datos()
  local salida = {}
  if not v2 or type(ruta) ~= "string" then
    return salida
  end
  local lista = hijosDe(vista(v2))[ruta]
  for i, h in ipairs(lista or {}) do
    salida[i] = h.ruta
  end
  return salida
end

function Arbol.ordenadas()
  local v2 = datos()
  local salida = {}
  if not v2 then
    return salida
  end
  local mapa = hijosDe(vista(v2))
  local function bajar(padre)
    for _, h in ipairs(mapa[padre] or {}) do
      salida[#salida + 1] = h.ruta
      bajar(h.ruta)
    end
  end
  bajar("")
  return salida
end

function Arbol.listar()
  local v2 = datos()
  local salida = {}
  if not v2 then
    return salida
  end
  local grupos = vista(v2)
  local mapa = hijosDe(grupos)
  local porRuta = porRutas(v2)
  local function bajar(padre)
    for _, h in ipairs(mapa[padre] or {}) do
      local claves = {}
      local set = porRuta[h.ruta]
      if set then
        for clave in pairs(set) do
          claves[#claves + 1] = clave
        end
      end
      local g = grupos[h.ruta]
      salida[#salida + 1] = {ruta = h.ruta, nombre = g.nombre, nivel = g.nivel, claves = claves}
      bajar(h.ruta)
    end
  end
  bajar("")
  return salida
end

function Arbol.existe(ruta)
  local v2 = datos()
  return v2 ~= nil and type(ruta) == "string" and existeRuta(v2, ruta)
end

function Arbol.crear(rutaPadre, nombre)
  nombre = nombreValido(nombre)
  local v2 = datos()
  if rutaPadre == nil then
    rutaPadre = ""
  end
  if not nombre or not v2 or type(rutaPadre) ~= "string" then
    return nil
  end
  if not existeRuta(v2, rutaPadre) then
    return nil
  end
  local ruta = unir(rutaPadre, nombre)
  if not valida(ruta) or existeRuta(v2, ruta) then
    return nil
  end
  v2.grupos[ruta] = true
  return ruta
end

-- Cambia la ruta de `ruta` y de todo lo que cuelga de ella por la nueva, con sus objetos y sus reglas. Todo lo viejo se
-- quita antes de poner lo nuevo, así que las rutas viejas y las nuevas no se pisan. Da {{vieja, nueva}}.
local function reubicar(v2, c, ruta, nueva)
  local cambios = {}
  for r in pairs(vista(v2)) do
    if dentroDe(r, ruta) then
      cambios[#cambios + 1] = {r, nueva .. string.sub(r, #ruta + 1)}
    end
  end
  table.sort(cambios, function(a, b)
    return a[1] < b[1]
  end)
  local porRuta = porRutas(v2)
  local viejas = {}
  for i, par in ipairs(cambios) do
    viejas[i] = par[1]
    v2.grupos[par[1]] = nil
  end
  local reglasViejas = llevarReglas(c, viejas)
  local opsViejas = llevarOps(v2, viejas)
  local compraViejas = llevarCompra(c, viejas)
  local compraNuevas = {}
  local opsNuevas = {}
  local reglasNuevas = {}
  local movidos = {}
  for _, par in ipairs(cambios) do
    v2.grupos[par[2]] = true
    if reglasViejas[par[1]] ~= nil then
      reglasNuevas[par[2]] = reglasViejas[par[1]]
    end
    if opsViejas[par[1]] ~= nil then
      opsNuevas[par[2]] = opsViejas[par[1]]
    end
    if compraViejas[par[1]] ~= nil then
      compraNuevas[par[2]] = compraViejas[par[1]]
    end
    local set = porRuta[par[1]]
    if set then
      porRuta[par[1]] = nil
      movidos[#movidos + 1] = {par[2], set}
    end
  end
  for _, mv in ipairs(movidos) do
    porRuta[mv[1]] = mv[2]
    for clave in pairs(mv[2]) do
      v2.objetos[clave] = mv[1]
    end
  end
  ponerReglas(c, reglasNuevas, true)
  ponerOps(v2, opsNuevas, true)
  ponerCompra(c, compraNuevas, true)
  return cambios
end

function Arbol.renombrar(ruta, nombre)
  nombre = nombreValido(nombre)
  local v2, c = datos()
  if not nombre or not v2 or not valida(ruta) or not existeRuta(v2, ruta) then
    return nil
  end
  local nueva = unir(padreDe(ruta), nombre)
  if nueva == ruta then
    return ruta, {}
  end
  if not valida(nueva) or existeRuta(v2, nueva) then
    return nil
  end
  return nueva, reubicar(v2, c, ruta, nueva)
end

function Arbol.mover(ruta, nuevoPadre)
  local v2, c = datos()
  if nuevoPadre == nil then
    nuevoPadre = ""
  end
  if not v2 or not valida(ruta) or type(nuevoPadre) ~= "string" or not existeRuta(v2, ruta) then
    return nil
  end
  if not existeRuta(v2, nuevoPadre) then
    return nil
  end
  if dentroDe(nuevoPadre, ruta) then
    return nil -- dentro de sí mismo o de un descendiente
  end
  local nueva = unir(nuevoPadre, nombreDe(ruta))
  if nueva == ruta then
    return ruta, {}
  end
  if existeRuta(v2, nueva) then
    return nil
  end
  return nueva, reubicar(v2, c, ruta, nueva)
end

function Arbol.borrar(ruta)
  local v2, c = datos()
  if not v2 or not valida(ruta) or not existeRuta(v2, ruta) then
    return false
  end
  local porRuta = porRutas(v2)
  local entrada = {ruta = ruta, grupos = {}, objetos = {}}
  for r in pairs(vista(v2)) do
    if dentroDe(r, ruta) then
      entrada.grupos[#entrada.grupos + 1] = r
    end
  end
  table.sort(entrada.grupos)
  for _, r in ipairs(entrada.grupos) do
    local claves = {}
    for clave in pairs(porRuta[r] or {}) do
      claves[#claves + 1] = clave
    end
    for _, clave in ipairs(claves) do
      entrada.objetos[clave] = r
      apuntar(v2, clave, "") -- sin grupo, como en TSM: al Base
    end
    v2.grupos[r] = nil
  end
  local reglas = llevarReglas(c, entrada.grupos)
  if next(reglas) ~= nil then
    entrada.reglas = reglas
  end
  local ops = llevarOps(v2, entrada.grupos)
  if next(ops) ~= nil then
    entrada.ops = ops
  end
  local compra = llevarCompra(c, entrada.grupos)
  if next(compra) ~= nil then
    entrada.compra = compra
  end
  asegurarTabla(v2, "_papelera") -- si había otra cosa, queda en _roto
  table.insert(v2._papelera, entrada)
  return true
end

-- ¿La entrada de la papelera se puede leer? (los datos pueden estar estropeados)
local function entradaBuena(e)
  return type(e) == "table" and valida(e.ruta) and type(e.grupos) == "table"
    and (e.objetos == nil or type(e.objetos) == "table") and (e.reglas == nil or type(e.reglas) == "table")
    and (e.ops == nil or type(e.ops) == "table") and (e.compra == nil or type(e.compra) == "table")
end

function Arbol.recuperar(ruta)
  local v2, c = datos()
  if not v2 or not valida(ruta) or type(v2._papelera) ~= "table" then
    return false
  end
  local entrada, pos = nil, nil
  for i = #v2._papelera, 1, -1 do
    local e = v2._papelera[i]
    if entradaBuena(e) and e.ruta == ruta then
      entrada, pos = e, i
      break
    end
  end
  local padre = padreDe(ruta)
  if not entrada or not existeRuta(v2, padre) then
    return false
  end
  -- Si la ruta está ocupada (otro grupo con el mismo nombre), vuelve con un nombre libre.
  local destino = ruta
  local n = 1
  while existeRuta(v2, destino) do
    n = n + 1
    destino = unir(padre, nombreDe(ruta) .. " " .. n)
  end
  local function nueva(r)
    if valida(r) and dentroDe(r, ruta) then
      return destino .. string.sub(r, #ruta + 1)
    end
    return nil
  end
  for _, r in ipairs(entrada.grupos) do
    local d = nueva(r)
    if d then
      v2.grupos[d] = true
    end
  end
  if not v2.grupos[destino] then
    v2.grupos[destino] = true
  end
  for clave, r in pairs(entrada.objetos or {}) do
    local d = claveValida(clave) and nueva(r)
    local actual = v2.objetos[clave]
    if d and (actual == nil or actual == "") then
      apuntar(v2, clave, d)
    end
  end
  local reglas = {}
  for r, regla in pairs(entrada.reglas or {}) do
    local d = nueva(r)
    if d then
      reglas[d] = regla
    end
  end
  ponerReglas(c, reglas, false)
  local opsGrupos = {}
  for r, ops in pairs(entrada.ops or {}) do
    local d = nueva(r)
    if d then
      opsGrupos[d] = ops
    end
  end
  ponerOps(v2, opsGrupos, false)
  local compra = {}
  for r, v in pairs(entrada.compra or {}) do
    local d = nueva(r)
    if d then
      compra[d] = v
    end
  end
  ponerCompra(c, compra, false)
  table.remove(v2._papelera, pos)
  return true, destino
end

function Arbol.papelera()
  local v2 = datos()
  local salida = {}
  if v2 and type(v2._papelera) == "table" then
    for _, e in ipairs(v2._papelera) do
      if entradaBuena(e) then
        salida[#salida + 1] = {ruta = e.ruta, nombre = nombreDe(e.ruta)}
      end
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Objetos.
---------------------------------------------------------------------------------------------------

function Arbol.objeto(clave)
  local v2 = datos()
  local ruta = v2 and claveValida(clave) and v2.objetos[clave]
  if type(ruta) == "string" then
    return ruta
  end
  return nil
end

-- Solo las variantes del objeto consultado. «p» agrupa las claves de mascotas que el banco solo ve como una jaula.
local function variantesDe(base)
  local v2 = datos()
  if not v2 then return nil end
  local objetos = v2.objetos
  if indiceVariantes.fuente ~= objetos then
    local porBase = {}
    for clave in pairs(objetos) do
      local id = type(clave) == "string" and baseVariante(clave)
      if id then
        local variantes = porBase[id] or {}
        variantes[#variantes + 1] = clave
        porBase[id] = variantes
      end
    end
    indiceVariantes.fuente, indiceVariantes.porBase = objetos, porBase
  end
  return indiceVariantes.porBase[base], objetos
end

-- La búsqueda general no distingue los bonus de TSM. Comprueba la ruta actual de las variantes de ese objeto.
function Arbol.varianteEnOtraRuta(base, ruta)
  local variantes, objetos = variantesDe(base)
  if variantes then
    for _, clave in ipairs(variantes) do
      if objetos[clave] ~= ruta then return true end
    end
  end
  return false
end

-- En Almacén permite mostrar la fila ambigua solo si su variante o mascota pertenece a un grupo elegido.
function Arbol.rutaVariante(base, rutas)
  local variantes, objetos = variantesDe(base)
  local elegida
  if variantes then
    for _, clave in ipairs(variantes) do
      local ruta = objetos[clave]
      if type(ruta) == "string" and rutas[ruta] and (not elegida or ruta < elegida) then elegida = ruta end
    end
  end
  return elegida
end

function Arbol.objetos(ruta)
  local v2 = datos()
  local salida = {}
  if not v2 or type(ruta) ~= "string" then
    return salida
  end
  if indiceListo(v2) then
    for clave in pairs(indice.porRuta[ruta] or {}) do
      salida[#salida + 1] = clave
    end
  else
    -- Sin índice: una pasada por todos los objetos, sin crear más tabla que el resultado.
    for clave, r in pairs(v2.objetos) do
      if r == ruta and claveValida(clave) then
        salida[#salida + 1] = clave
      end
    end
  end
  table.sort(salida)
  return salida
end

function Arbol.contar(ruta)
  local v2 = datos()
  local n = 0
  if not v2 then
    return 0
  end
  if ruta ~= nil and type(ruta) ~= "string" then
    return 0
  end
  if ruta ~= nil and indiceListo(v2) then
    for _ in pairs(indice.porRuta[ruta] or {}) do
      n = n + 1
    end
    return n
  end
  for clave, r in pairs(v2.objetos) do
    if claveValida(clave) and type(r) == "string" and (ruta == nil or r == ruta) then
      n = n + 1
    end
  end
  return n
end

-- Una sola tabla: las rutas de los grupos (las de vista(), sin hacer su tabla de cada uno) y una pasada por los objetos.
function Arbol.cuantosPorGrupo()
  local v2 = datos()
  local salida = {}
  if not v2 then
    return salida
  end
  for ruta in pairs(v2.grupos) do
    if valida(ruta) then
      local r = ruta
      while r ~= "" and salida[r] == nil do
        salida[r] = 0
        r = padreDe(r)
      end
    end
  end
  if indiceListo(v2) then
    -- Con el índice hecho (lo hacen las ediciones y Arbol.listar), sus conjuntos ya están contados por ruta.
    for ruta, set in pairs(indice.porRuta) do
      local n = salida[ruta]
      if n then
        for _ in pairs(set) do
          n = n + 1
        end
        salida[ruta] = n
      end
    end
    return salida
  end
  -- Sin índice, una pasada. Solo las rutas de los grupos tienen cuenta (salida[ruta] ~= nil implica un texto válido), y la
  -- comprobación de la clave va escrita aquí (es claveValida) porque con 11.630 objetos cada llamada se nota.
  for clave, ruta in pairs(v2.objetos) do
    local n = salida[ruta]
    if n and type(clave) == "string" and clave ~= ROTO then
      salida[ruta] = n + 1
    end
  end
  return salida
end

function Arbol.poner(clave, ruta)
  local v2 = datos()
  if not v2 or not claveValida(clave) or clave == "" then
    return false
  end
  if ruta == nil then
    ruta = ""
  end
  if type(ruta) ~= "string" or not existeRuta(v2, ruta) then
    return false
  end
  apuntar(v2, clave, ruta)
  return true
end

function Arbol.quitar(clave)
  local v2 = datos()
  if not v2 or not claveValida(clave) or v2.objetos[clave] == nil then
    return false
  end
  apuntar(v2, clave, nil)
  return true
end

function Arbol.idDe(clave)
  if type(clave) == "number" then
    if clave > 0 and clave == math.floor(clave) then
      return clave
    end
    return nil
  end
  if type(clave) ~= "string" then
    return nil
  end
  local id = string.match(clave, "^i:(%d+)$") or string.match(clave, "^i:(%d+):")
  id = id and tonumber(id)
  if id and id > 0 then
    return id
  end
  return nil
end

function Arbol.preparar()
  datos()
end

function Arbol.olvidarIndice()
  olvidar()
end
