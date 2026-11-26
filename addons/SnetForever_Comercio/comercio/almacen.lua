-- SnetForever: Almacén (plan de paridad con TSM, fase 4, entrega 1). Vista previa, SOLO DE LECTURA, de lo que las
-- operaciones de Almacén moverían entre las bolsas y el banco personal abierto. Este archivo no mueve nada. El único que
-- puede coger o partir una pila es comercio/almacen-mover.lua (excepción al §4 aprobada por Alain el 26-nov: un
-- movimiento por clic), que usa las ubicaciones y los huecos vacíos que deja aquí la vista (vista._origen, _destino).
-- Lo vigila tools/banco-wow/src/comprobar-lua51.js; el detalle, en docs/comercio/almacen.md.
--
-- Las cuentas son las de TSM 4.15.9 (LibTSMSystem/Source/Operation/WarehousingOperation.lua y LibTSMService/Source/
-- Banking): por objeto se recorren TODAS las operaciones de Almacén de su grupo (con la herencia de Operaciones.deGrupo),
-- saltando las ignoradas aquí, en su orden:
--   guardar (bolsas -> banco):  conserva = max(conservarEnBolsas); cada una añade min(tienes - movido - conserva, mover).
--   sacar   (banco -> bolsas):  conserva = max(conservarEnBanco); cada una añade el múltiplo de moverPila de
--                               min(tienes - movido - conserva, mover).
--   reponer (banco -> bolsas):  solo las de reponerCantidad > 0; conserva = max(reponerConservarEnBanco); cada una cubre con
--                               lo que ya hay en las bolsas y añade el múltiplo de reponerPila de lo que le falta.
--   mover = 0 es «todo lo que se pueda» y pila = 0, sin múltiplo. Si una fórmula de cualquiera de sus operaciones no da una
--   cantidad entera entre 0 y 50.000 (la pila, entre 0 y 200), el objeto entero queda en 0, como en TSM, y aquí con motivo.
-- Como en TSM, un objeto sin grupo cuenta como del Grupo Base y el movimiento usa huecos VACÍOS del destino (no completa
-- pilas): cada hueco de origen que se toca necesita uno libre. La bolsa de componentes no se cuenta como destino.
--
-- Lo que no se sabe no se da por vacío: un hueco ocupado que el juego no deja leer (sin id o con la cantidad secreta), una
-- bolsa que no da sus huecos libres o un banco cerrado dejan la fila «incierta» o la vista sin datos, nunca a cero. Un
-- objeto del árbol con variante («i:<id>:…») o una mascota («p:…») no se puede casar con el id del hueco: sale apartado.
-- El banco de cuenta queda fuera de esta entrega.
--
-- Almacen.DIRECCIONES = {"guardar", "sacar", "reponer"}
-- Almacen.bancoAbierto() -> boolean
-- Almacen.grupos() -> {rutas}   las que tienen alguna operación de Almacén (propia o heredada), en el orden del árbol.
-- Almacen.vistaPrevia(direccion, rutas?) -> vista
--   rutas = {[ruta] = true} | nil (todas las de Almacen.grupos()). vista = {direccion, estado, motivo?, filas, totales,
--   requisitos, huella}. estado: "lista" | "sin_banco" | "en_combate" | "direccion" | "sin_datos".
--   fila = {clave, item, nombre, ruta, operaciones = {nombres}, origen, enBolsas, conserva, mover, destino, estado, motivo,
--   detalle?, reservaMax?, conPila?}. reservaMax = la reserva mayor de TODAS sus operaciones (el ejecutor no la gasta);
--   conPila = alguna exige múltiplos de pila. estado: "mover" | "nada" | "apartada" | "incierta" | "sin_hueco". origen = unidades en el origen;
--   destino = unidades que tendría el destino después (nil si no se sabe).
--   requisitos = {bancoAbierto, fueraDeCombate, cursorLibre, origenLeido, destinoLeido, huecosLibres, ejecutable = false,
--   motivoEjecutar = "solo_lectura"}.
-- Almacen.vigente(vista, conVista?) -> boolean, motivo?, vistaActual?   vuelve a leer bolsas, banco, operaciones y fórmulas
--   y avisa si la vista cambió o ya no se puede leer. Si conVista es true, también devuelve la lectura actual al validarla.
local SNF = SnetForever
local Almacen = {}
SNF.Almacen = Almacen

local floor = math.floor
local API = SNF.API

local DIRECCIONES = {"guardar", "sacar", "reponer"}
Almacen.DIRECCIONES = DIRECCIONES
local ES_DIRECCION = {guardar = true, sacar = true, reponer = true}
local MAX_CANTIDAD, MAX_PILA = 50000, 200
local JAULA_MASCOTA = 82800 -- Jaula de mascota: en las bolsas es un objeto, en el árbol de TSM es «p:<especie>…»

local bancoAbierto = false

function Almacen.bancoAbierto()
  return bancoAbierto
end

local function enCombate()
  local f = rawget(_G, "InCombatLockdown")
  if type(f) ~= "function" then
    return false
  end
  local ok, si = pcall(f)
  return ok and si == true
end

local function cursorLibre()
  local f = rawget(_G, "GetCursorInfo")
  if type(f) ~= "function" then
    return nil -- no se sabe
  end
  local ok, tipo = pcall(f)
  if not ok then
    return nil
  end
  return tipo == nil
end

---------------------------------------------------------------------------------------------------
-- Lectura de las bolsas
---------------------------------------------------------------------------------------------------

-- Lee unas bolsas: {items = {[id] = unidades}, huecos = {[id] = {unidades por hueco, en orden}}, libres, desconocidos,
-- sinDatos (bolsas que no dicen cuántos huecos libres tienen), leidos (huecos que existen)}. `destino` = solo cuenta
-- como libres los de las bolsas normales (sin la de componentes).
-- Para el ejecutor (comercio/almacen-mover.lua) guarda además dónde está cada pila, ubicaciones[id] = {{bolsa, hueco, n,
-- enlace, bloqueado}} en el mismo orden, y los huecos vacíos de las bolsas normales que valen de destino, vacios =
-- {{bolsa, hueco}} (sin la de componentes ni las de otro tipo: la familia que da el juego tiene que ser 0).
local function leer(ids, componentes)
  local r = {items = {}, huecos = {}, libres = 0, desconocidos = 0, sinDatos = 0, leidos = 0, firma = {},
    ubicaciones = {}, vacios = {}}
  for _, bolsa in ipairs(ids or {}) do
    local n = API.huecosBolsa(bolsa)
    if n and n > 0 then
      n = floor(n)
      r.leidos = r.leidos + n
      local vistos = 0
      local vaciosAqui = {}
      for hueco = 1, n do
        local c = API.infoContenedor(bolsa, hueco, true)
        if c then
          vistos = vistos + 1
          r.items[c.id] = (r.items[c.id] or 0) + c.n
          local lista = r.huecos[c.id] or {}
          lista[#lista + 1] = c.n
          r.huecos[c.id] = lista
          local donde = r.ubicaciones[c.id] or {}
          donde[#donde + 1] = {bolsa = bolsa, hueco = hueco, n = c.n, enlace = c.enlace, bloqueado = c.b}
          r.ubicaciones[c.id] = donde
          r.firma[#r.firma + 1] = bolsa .. ":" .. hueco .. "=" .. c.id .. "x" .. c.n
        elseif API.huecoVacio(bolsa, hueco) == true then
          vaciosAqui[#vaciosAqui + 1] = {bolsa = bolsa, hueco = hueco}
        end
      end
      local libres, familia = API.libresBolsa(bolsa)
      if libres == nil or libres < 0 or libres > n - vistos or libres ~= floor(libres) then
        r.sinDatos = r.sinDatos + 1
      else
        local ocupados = n - libres
        if ocupados > vistos then
          r.desconocidos = r.desconocidos + (ocupados - vistos)
        end
        if not (componentes and componentes[bolsa]) then
          r.libres = r.libres + libres
          if familia == 0 then
            for _, v in ipairs(vaciosAqui) do
              r.vacios[#r.vacios + 1] = v
            end
          end
        end
      end
    end
  end
  r.firma = table.concat(r.firma, ";")
  return r
end

local function bolsas()
  local ids, componentes = API.bolsasPropias()
  return leer(ids, componentes)
end

local function banco()
  return leer(API.bolsasBanco(), nil)
end

---------------------------------------------------------------------------------------------------
-- Operaciones de cada objeto
---------------------------------------------------------------------------------------------------

local CAMPOS = {
  guardar = {conserva = "conservarEnBolsas", mover = "mover"},
  sacar = {conserva = "conservarEnBanco", mover = "mover", pila = "moverPila"},
  reponer = {conserva = "reponerConservarEnBanco", objetivo = "reponerCantidad", pila = "reponerPila"},
}

-- Una cantidad de la fórmula del campo para el objeto, o nil si no vale (como el VALUE_RANGES de TSM).
local function cantidad(nombre, campo, item, max)
  local v = SNF.Operaciones.cobre("almacen", nombre, campo, item)
  if v == nil or v < 0 or v > max then
    return nil
  end
  return v
end

-- Las operaciones de Almacén que valen aquí para esa ruta: {nombres}, ignoradas.
local function operacionesDe(ruta)
  local nombres = SNF.Operaciones.deGrupo(ruta, "almacen")
  local validas, ignoradas = {}, 0
  for _, nombre in ipairs(nombres) do
    if SNF.Operaciones.ignoradaAqui("almacen", nombre) then
      ignoradas = ignoradas + 1
    else
      validas[#validas + 1] = nombre
    end
  end
  return validas, ignoradas
end

-- Lo que hay que mover de un objeto: mover, conserva | nil, motivo, detalle. `tienes` = unidades en el origen; `enBolsas`,
-- las que ya hay en las bolsas (para reponer).
local function calcular(direccion, nombres, item, tienes, enBolsas)
  local campos = CAMPOS[direccion]
  local movido, conserva = 0, 0
  local valores = {}
  -- Primero se comprueban todas las fórmulas: una que no vale deja el objeto entero en 0 (TSM: «This operation isn't valid»).
  for _, nombre in ipairs(nombres) do
    local v = {}
    for clave, campo in pairs(campos) do
      v[clave] = cantidad(nombre, campo, item, clave == "pila" and MAX_PILA or MAX_CANTIDAD)
      if v[clave] == nil then
        return nil, nil, "formula", nombre .. " · " .. campo
      end
    end
    valores[#valores + 1] = v
  end
  for _, v in ipairs(valores) do
    if direccion == "guardar" then
      conserva = math.max(conserva, v.conserva)
      local q = math.max(tienes - movido - conserva, 0)
      if v.mover ~= 0 then q = math.min(q, v.mover) end
      movido = movido + q
    elseif direccion == "sacar" then
      conserva = math.max(conserva, v.conserva)
      local q = math.max(tienes - movido - conserva, 0)
      if v.mover ~= 0 then q = math.min(q, v.mover) end
      local pila = v.pila ~= 0 and v.pila or 1
      movido = movido + floor(q / pila) * pila
    elseif v.objetivo ~= 0 then -- reponer
      conserva = math.max(conserva, v.conserva)
      local cubiertas = math.min(enBolsas, v.objetivo)
      enBolsas = enBolsas - cubiertas
      local q = math.min(math.max(tienes - movido - conserva, 0), v.objetivo - cubiertas)
      local pila = v.pila ~= 0 and v.pila or 1
      movido = movido + floor(q / pila) * pila
    end
  end
  -- Para ejecutar: la reserva MAYOR de todas sus operaciones (una posterior puede ser mayor que la que limitó a las de
  -- antes; el ejecutor no la gasta nunca) y si alguna exige múltiplos de pila.
  local reservaMax, conPila = 0, false
  for _, v in ipairs(valores) do
    reservaMax = math.max(reservaMax, v.conserva)
    if v.pila and v.pila > 1 then conPila = true end
  end
  return movido, conserva, nil, nil, reservaMax, conPila
end

-- Cuántos huecos de origen hacen falta para mover esas unidades (TSM toma los huecos en orden y parte el último).
local function huecosNecesarios(lista, unidades)
  local n = 0
  for _, enHueco in ipairs(lista or {}) do
    if unidades <= 0 then
      break
    end
    n = n + 1
    unidades = unidades - enHueco
  end
  return n
end

---------------------------------------------------------------------------------------------------
-- Grupos
---------------------------------------------------------------------------------------------------

function Almacen.grupos()
  local salida = {}
  if #SNF.Operaciones.deGrupo("", "almacen") > 0 then
    salida[1] = ""
  end
  for _, ruta in ipairs(SNF.Arbol.ordenadas()) do
    if ruta ~= "" and #SNF.Operaciones.deGrupo(ruta, "almacen") > 0 then
      salida[#salida + 1] = ruta
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Vista previa
---------------------------------------------------------------------------------------------------

local function nombreDe(item)
  local ok, n = pcall(SNF.Datos.nombreItem, item)
  return ok and type(n) == "string" and n or nil
end

local function vacia(direccion, estado, motivo)
  local cursor = cursorLibre()
  return {direccion = direccion, estado = estado, motivo = motivo, filas = {}, totales = {mover = 0, filas = 0},
    requisitos = {bancoAbierto = bancoAbierto, fueraDeCombate = not enCombate(), cursorLibre = cursor,
      ejecutable = false, motivoEjecutar = "solo_lectura"}}
end

-- Lo que forma la vista, para saber si sigue valiendo: el contenido de las bolsas y del banco y cada fila calculada.
local function huella(vista, bolsas, banco)
  local partes = {vista.direccion, bolsas.firma, banco.firma, tostring(vista.requisitos.cursorLibre),
    bolsas.leidos, bolsas.libres, bolsas.desconocidos, bolsas.sinDatos, banco.leidos, banco.libres,
    banco.desconocidos, banco.sinDatos}
  for _, f in ipairs(vista.filas) do
    partes[#partes + 1] = table.concat({f.item, f.ruta, table.concat(f.operaciones, ","), tostring(f.mover),
      tostring(f.conserva), tostring(f.destino), f.estado, f.motivo or "", tostring(f.detalle), f.nombre or ""}, "|")
  end
  return table.concat(partes, "\n")
end

local function construir(direccion, rutas)
  if not ES_DIRECCION[direccion] then
    return vacia(direccion, "direccion")
  end
  if not bancoAbierto then
    return vacia(direccion, "sin_banco")
  end
  if enCombate() then
    return vacia(direccion, "en_combate")
  end
  if rutas == nil then
    rutas = {}
    for _, ruta in ipairs(Almacen.grupos()) do
      rutas[ruta] = true
    end
  end
  local B, K = bolsas(), banco()
  if K.leidos == 0 then
    return vacia(direccion, "sin_datos", "banco")
  end
  if B.leidos == 0 then
    return vacia(direccion, "sin_datos", "bolsas")
  end
  local origen, destino = direccion == "guardar" and B or K, direccion == "guardar" and K or B
  -- Reponer cuenta también lo que ya hay en las bolsas: unas bolsas con huecos sin leer dejan la cuenta incierta.
  local destinoIncierto = destino.desconocidos > 0 or destino.sinDatos > 0
  local incierto = origen.desconocidos > 0 or origen.sinDatos > 0 or (direccion == "reponer" and destinoIncierto)
  local cache = {}
  local filas = {}
  local ids = {}
  for item in pairs(origen.items) do
    ids[#ids + 1] = item
  end
  table.sort(ids)
  for _, item in ipairs(ids) do
    local claveBase = "i:" .. item
    local ruta = SNF.Arbol.objeto(claveBase) or "" -- sin grupo = Grupo Base, como en TSM
    local mascota = item == JAULA_MASCOTA
    local alterna = SNF.Arbol.rutaVariante(mascota and "p" or claveBase, rutas)
    local fila
    if rutas[ruta] then
      local nombres = cache[ruta]
      if not nombres then
        local validas, ignoradas = operacionesDe(ruta)
        nombres = {lista = validas, ignoradas = ignoradas}
        cache[ruta] = nombres
      end
      fila = {clave = ruta .. "|" .. item, item = item, nombre = nombreDe(item), ruta = ruta, operaciones = nombres.lista,
        origen = origen.items[item], enBolsas = B.items[item] or 0}
      if mascota then
        fila.estado, fila.motivo = "apartada", "mascota"
      elseif alterna or SNF.Arbol.varianteEnOtraRuta(claveBase, ruta) then
        fila.estado, fila.motivo, fila.detalle = "apartada", "variante", alterna
      elseif #nombres.lista == 0 then
        fila.estado, fila.motivo = "apartada", nombres.ignoradas > 0 and "ignorada" or "sin_operacion"
      else
        local mover, conserva, motivo, detalle, reservaMax, conPila = calcular(direccion, nombres.lista, item, fila.origen,
          fila.enBolsas)
        fila.conserva, fila.reservaMax, fila.conPila = conserva, reservaMax, conPila
        if not mover then
          fila.mover, fila.estado, fila.motivo, fila.detalle = 0, "apartada", motivo, detalle
        else
          fila.mover = mover
          if incierto then
            fila.estado, fila.motivo = "incierta", "huecos_origen"
          elseif mover == 0 then
            fila.estado, fila.motivo = "nada", direccion == "reponer" and "repuesto" or "conserva"
          else
            fila.estado = "mover"
          end
        end
      end
      if fila.mover and fila.mover > 0 and not destinoIncierto then
        fila.destino = (destino.items[item] or 0) + fila.mover
      elseif fila.mover == 0 and not destinoIncierto then
        fila.destino = destino.items[item] or 0
      end
    elseif alterna then
      fila = {clave = alterna .. "|" .. item, item = item, nombre = nombreDe(item), ruta = alterna,
        operaciones = {}, origen = origen.items[item], enBolsas = B.items[item] or 0, estado = "apartada",
        motivo = mascota and "mascota" or "variante"}
    end
    if fila then
      filas[#filas + 1] = fila
    end
  end
  -- Huecos libres del destino, en el orden de las filas: lo que no cabe se queda sin hueco.
  local libres, total, necesarios = destino.libres, 0, 0
  for _, fila in ipairs(filas) do
    if fila.estado == "mover" then
      local n = huecosNecesarios(origen.huecos[fila.item], fila.mover)
      if destinoIncierto then
        fila.estado, fila.motivo = "incierta", "huecos_destino"
      elseif n > libres then
        fila.estado, fila.motivo, fila.detalle = "sin_hueco", "sin_hueco", n - libres
        fila.destino = nil
      else
        libres = libres - n
        necesarios = necesarios + n
        total = total + fila.mover
      end
    end
  end
  local v = vacia(direccion, "lista")
  v.filas = filas
  v.totales = {mover = total, filas = #filas, huecos = necesarios, libres = destino.libres}
  v.requisitos.origenLeido = not incierto
  v.requisitos.destinoLeido = not destinoIncierto
  v.requisitos.huecosLibres = destino.libres
  v.requisitos.huecosDesconocidos = origen.desconocidos + destino.desconocidos
  v.requisitos.bolsasSinDatos = origen.sinDatos + destino.sinDatos
  v.huella = huella(v, B, K)
  v._rutas = rutas
  v._origen, v._destino = origen, destino -- para el ejecutor: ubicaciones de cada pila y huecos vacíos válidos
  return v
end

function Almacen.vistaPrevia(direccion, rutas)
  return construir(direccion, rutas)
end

function Almacen.vigente(vista, conVista)
  if type(vista) ~= "table" or vista.estado ~= "lista" then
    return false, "sin_vista"
  end
  local nueva = construir(vista.direccion, vista._rutas)
  if nueva.estado ~= "lista" then
    return false, nueva.estado
  end
  if nueva.huella ~= vista.huella then
    return false, "cambio"
  end
  if conVista then
    return true, nil, nueva
  end
  return true
end

---------------------------------------------------------------------------------------------------
-- Eventos: el banco abierto (como comercio/inventario.lua, que guarda el suyo aparte).
---------------------------------------------------------------------------------------------------

local function avisar()
  SNF.Eventos.emitir("SNF_ALMACEN")
end

SNF.Eventos.escuchar("BANKFRAME_OPENED", function()
  bancoAbierto = true
  avisar()
end)

SNF.Eventos.escuchar("BANKFRAME_CLOSED", function()
  bancoAbierto = false
  avisar()
end)
