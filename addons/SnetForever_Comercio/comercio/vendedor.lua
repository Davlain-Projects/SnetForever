-- SnetForever: Vendedor (plan de paridad con TSM, fase 4). Vista previa, SOLO DE LECTURA, de lo que las operaciones de
-- Vendedor venderían al comerciante abierto o le comprarían para reponer. No vende ni compra: usar un objeto con el
-- comerciante abierto (UseContainerItem), partir una pila o comprar (BuyMerchantItem) queda fuera por el §4 del diseño y
-- lo vigila tools/banco-wow/src/comprobar-lua51.js. Lo que faltaría para ejecutar está en docs/comercio/vendedor.md.
--
-- Las cuentas son las de TSM 4.15.9 (LibTSMSystem/Source/Operation/VendoringOperation.lua y LibTSMApp/Source/Vendoring/
-- Internal/Groups.lua, que con isDryRun es justo una vista previa):
--   vender:  por objeto de las bolsas se recorren, en su orden, las operaciones de su grupo (con la herencia de
--            Operaciones.deGrupo) que no están ignoradas aquí y tienen la venta activada. Cada una propone, por su cuenta,
--            tienes - conservar si: su conservar y su mínimo de caducadas son cantidades válidas (0 a 50.000; si no, esa
--            operación no vende nada); con mínimo > 0, las caducadas desde la última venta llegan al mínimo; y, si el máximo
--            de destrucción o de mercado pasa de 0, el valor del objeto queda por debajo. TSM vende las propuestas una tras
--            otra con lo que queda en las bolsas, así que dos operaciones pueden sumar más que una sola: se avisa en la
--            fila. Sin «vender ligados» no cuentan los huecos ligados. Un hueco que haya que partir necesita un hueco
--            libre; sin él, TSM se para en esa pila.
--   reponer: por cada fila del comerciante con precio en oro, del objeto base, de un grupo elegido y con existencias, la
--            PRIMERA operación de su grupo que no esté ignorada: si tiene la compra activada y su cantidad a reponer vale,
--            compra max(reponer - tienes, 0), hasta lo que quede en el comerciante. tienes = las bolsas más las fuentes
--            marcadas que el addon sabe contar.
-- Donde TSM toma un valor que falta como 0 (mercado o destrucción sin precio), aquí la fila queda incierta y no se propone.
--
-- Lo que no se sabe no se da por vacío: un hueco ocupado que no deja leer su id o su cantidad, una bolsa que no da sus
-- huecos libres, un ligado o un precio de venta desconocidos o unas caducadas que dependen de una carta de venta sin ID
-- dejan la fila «incierta». Un comerciante que no compra el objeto (sin precio de venta o marcado sin valor) lo deja
-- «apartada». Con variantes del objeto en el árbol, un hueco con sufijo, bonus o enlace ilegible no se puede casar.
--
-- Vendedor.MODOS = {"vender", "reponer"}
-- Vendedor.abierto() -> boolean
-- Vendedor.grupos() -> {rutas}   las que tienen alguna operación de Vendedor (propia o heredada), en el orden del árbol.
-- Vendedor.vistaPrevia(modo, rutas?) -> vista
--   rutas = {[ruta] = true} | nil (todas). vista = {modo, estado, motivo?, filas, totales, requisitos, huella}.
--   estado: "lista" | "sin_comerciante" | "en_combate" | "modo" | "sin_datos".
--   fila (vender) = {clave, item, nombre, ruta, operaciones, tienes, vender, quedan, precio, valor, estado, motivo, detalle?,
--     porOperacion = {{nombre, propone, motivo?}}}. estado: "vender" | "nada" | "apartada" | "incierta". operaciones = las
--     que venden o, si ninguna tiene la venta activada, las que no están ignoradas aquí.
--   fila (reponer) = {clave, item, nombre, ruta, operaciones, tienes, objetivo, comprar, disponibles, precio, coste, estado,
--     motivo, detalle?}. estado: "comprar" | "nada" | "apartada" | "incierta".
--   requisitos = {comercianteAbierto, fueraDeCombate, bolsasLeidas, ejecutable = false, motivoEjecutar = "solo_lectura"}.
-- Vendedor.vigente(vista) -> boolean, motivo?   vuelve a leerlo todo y dice si la vista sigue valiendo.
local SNF = SnetForever
local Vendedor = {}
SNF.Vendedor = Vendedor

local floor = math.floor
local API = SNF.API

local MODOS = {"vender", "reponer"}
Vendedor.MODOS = MODOS
local ES_MODO = {vender = true, reponer = true}
local MAX_CANTIDAD = 50000
local JAULA_MASCOTA = 82800
local TIPO = "vendedor"

function Vendedor.abierto()
  return SNF.MerchantPrices.abierto() == true
end

local function enCombate()
  local f = rawget(_G, "InCombatLockdown")
  if type(f) ~= "function" then
    return false
  end
  local ok, si = pcall(f)
  return ok and si == true
end

---------------------------------------------------------------------------------------------------
-- Bolsas: la lectura estricta del núcleo (API.infoContenedor con la cantidad obligatoria), hueco a hueco.
---------------------------------------------------------------------------------------------------

-- Un enlace con sufijo o bonus (la misma lectura que la contabilidad). nil si no se puede leer.
local function enlaceVariante(enlace)
  local cuerpo = type(enlace) == "string" and string.match(enlace, "item:([%-%d:]+)")
  if not cuerpo then
    return nil
  end
  local campos = {}
  for v in string.gmatch(cuerpo .. ":", "([^:]*):") do campos[#campos + 1] = v end
  local sufijo, bonus = tonumber(campos[7] or ""), tonumber(campos[13] or "")
  return (sufijo ~= nil and sufijo ~= 0) or (bonus ~= nil and bonus > 0)
end

-- {huecos = {[id] = {{n, ligado = true|false|nil, sinValor, variante}...}}, libres, desconocidos, sinDatos, leidos, firma}
local function leerBolsas()
  local ids, componentes = API.bolsasPropias()
  local r = {huecos = {}, libres = 0, desconocidos = 0, sinDatos = 0, leidos = 0, firma = {}}
  for _, bolsa in ipairs(ids or {}) do
    local n = API.huecosBolsa(bolsa)
    if n and n > 0 then
      n = floor(n)
      r.leidos = r.leidos + n
      local vistos = 0
      for hueco = 1, n do
        local c = API.infoContenedor(bolsa, hueco, true)
        if c then
          vistos = vistos + 1
          local lista = r.huecos[c.id] or {}
          local h = {n = c.n, sinValor = c.sv, variante = enlaceVariante(c.enlace)}
          if c.lc then h.ligado = c.l == 1 end
          lista[#lista + 1] = h
          r.huecos[c.id] = lista
          r.firma[#r.firma + 1] = table.concat({bolsa, hueco, c.id, c.n, tostring(h.ligado), tostring(h.sinValor),
            tostring(h.variante)}, ":")
        end
      end
      local libres = API.libresBolsa(bolsa)
      if libres == nil or libres < 0 or libres > n - vistos or libres ~= floor(libres) then
        r.sinDatos = r.sinDatos + 1
      else
        if n - libres > vistos then
          r.desconocidos = r.desconocidos + (n - libres - vistos)
        end
        if not (componentes and componentes[bolsa]) then
          r.libres = r.libres + libres
        end
      end
    end
  end
  r.firma = table.concat(r.firma, ";")
  return r
end

---------------------------------------------------------------------------------------------------
-- Operaciones
---------------------------------------------------------------------------------------------------

function Vendedor.grupos()
  local salida = {}
  if #SNF.Operaciones.deGrupo("", TIPO) > 0 then
    salida[1] = ""
  end
  for _, ruta in ipairs(SNF.Arbol.ordenadas()) do
    if ruta ~= "" and #SNF.Operaciones.deGrupo(ruta, TIPO) > 0 then
      salida[#salida + 1] = ruta
    end
  end
  return salida
end

-- Las de la ruta que no están ignoradas aquí, en orden: {nombres}, ignoradas.
local function operacionesDe(ruta)
  local validas, ignoradas = {}, 0
  for _, nombre in ipairs(SNF.Operaciones.deGrupo(ruta, TIPO)) do
    if SNF.Operaciones.ignoradaAqui(TIPO, nombre) then
      ignoradas = ignoradas + 1
    else
      validas[#validas + 1] = nombre
    end
  end
  return validas, ignoradas
end

local function cantidad(nombre, campo, item)
  local v = SNF.Operaciones.cobre(TIPO, nombre, campo, item)
  if v == nil or v < 0 or v > MAX_CANTIDAD then
    return nil
  end
  return v
end

local function rutaDe(item)
  return SNF.Arbol.objeto("i:" .. item) or "" -- sin grupo = Grupo Base, como en TSM
end

local function hayVariantes(item)
  return SNF.Arbol.varianteEnOtraRuta("i:" .. item, false)
end

-- El nombre del cliente si ya lo tiene y si no el de los datos del addon (que puede ser «#id»).
local function nombreDe(item)
  local info = API.infoObjeto(item)
  if info and info.nombre then
    return info.nombre
  end
  local ok, n = pcall(SNF.Datos.nombreItem, item)
  return ok and type(n) == "string" and n or nil
end

-- Precio de venta al comerciante por unidad: cobre | 0 | nil (el cliente aún no tiene el objeto).
local function precioVenta(item)
  local info = API.infoObjeto(item)
  local pv = info and info.pv
  if type(pv) ~= "number" or pv < 0 or pv ~= floor(pv) then
    return nil
  end
  return pv
end

---------------------------------------------------------------------------------------------------
-- Vender
---------------------------------------------------------------------------------------------------

-- Un máximo de valor: nil = no se mira; false, detalle = no se sabe; true, detalle = no se vende.
local function superaMaximo(nombre, campoValor, campoMaximo, item)
  local maximo = SNF.Operaciones.cobre(TIPO, nombre, campoMaximo, item)
  if maximo == nil then
    return false, nombre .. " · " .. campoMaximo
  end
  if maximo <= 0 then
    return nil
  end
  local valor = SNF.Operaciones.cobre(TIPO, nombre, campoValor, item)
  if valor == nil then
    return false, nombre .. " · " .. campoValor
  end
  if valor >= maximo then
    return true, nombre .. " · " .. campoMaximo
  end
  return nil
end

-- Lo que propone una operación para un objeto: unidades, ligados | nil, motivo, detalle, incierto.
local function propuesta(nombre, item, tienes, nombreItem)
  local conservar = cantidad(nombre, "conservar", item)
  local minimo = cantidad(nombre, "caducadasMinimas", item)
  if not conservar then
    return 0, nil, "formula", nombre .. " · conservar"
  end
  if not minimo then
    return 0, nil, "formula", nombre .. " · caducadasMinimas"
  end
  local q = tienes - conservar
  if q <= 0 then
    return 0, nil, "conserva", conservar
  end
  if minimo > 0 then
    local c, por = SNF.Contabilidad.caducadasDesdeVenta(item, nombreItem)
    if not c then
      return 0, nil, "caducadas_sin_datos", por, true
    end
    if c.maximo < minimo then
      return 0, nil, "caducadas", c.maximo .. "/" .. minimo
    end
    if c.minimo < minimo then
      return 0, nil, "caducadas_sin_id", c.minimo .. "-" .. c.maximo .. "/" .. minimo, true
    end
  end
  for _, par in ipairs({{"valorDestruccion", "valorDestruccionMaximo", "destruccion"},
      {"valorMercado", "valorMercadoMaximo", "mercado"}}) do
    local supera, detalle = superaMaximo(nombre, par[1], par[2], item)
    if supera == false then
      return 0, nil, "sin_dato", detalle, true
    elseif supera then
      return 0, nil, par[3], detalle
    end
  end
  return q, SNF.Operaciones.valor(TIPO, nombre, "venderLigados") == true
end

-- Simula la venta de TSM con las propuestas en orden: por pilas de menor a mayor, la que pasa de lo que queda se parte
-- en un hueco libre. Devuelve unidades, incierto (un ligado desconocido cuenta), sinHueco.
local function simularVenta(huecos, propuestas, libres)
  local resto = {}
  for i, h in ipairs(huecos) do resto[i] = {n = h.n, ligado = h.ligado, i = i} end
  table.sort(resto, function(a, b)
    if a.n ~= b.n then return a.n < b.n end
    return a.i < b.i
  end)
  local total, incierto, sinHueco = 0, false, false
  for _, p in ipairs(propuestas) do
    local falta = p.unidades
    for _, h in ipairs(resto) do
      if falta <= 0 then break end
      if h.n > 0 then
        if not p.ligados and h.ligado == nil then
          incierto = true
        end
        if p.ligados or h.ligado == false then
          if h.n <= falta then
            falta, total, h.n = falta - h.n, total + h.n, 0
          else
            if libres == nil then
              incierto = true
            elseif libres > 0 then
              h.n, total = h.n - falta, total + falta
            else
              sinHueco = true
            end
            falta = 0
          end
        end
      end
    end
  end
  return total, incierto, sinHueco
end

local function filaVender(item, huecos, ruta, cache, libres, incierto)
  local fila = {clave = ruta .. "|" .. item, item = item, nombre = nombreDe(item), ruta = ruta, operaciones = {},
    porOperacion = {}}
  local tienes = 0
  local variante, sinValor = false, false
  for _, h in ipairs(huecos) do
    tienes = tienes + h.n
    if h.variante ~= false then variante = true end
    if h.sinValor == true then sinValor = true end
  end
  fila.tienes = tienes
  local ops = cache[ruta]
  if not ops then
    local validas, ignoradas = operacionesDe(ruta)
    local activas, desactivadas = {}, 0
    for _, nombre in ipairs(validas) do
      if SNF.Operaciones.valor(TIPO, nombre, "venderActivo") == false then
        desactivadas = desactivadas + 1
      else
        activas[#activas + 1] = nombre
      end
    end
    ops = {lista = activas, validas = validas, ignoradas = ignoradas, desactivadas = desactivadas}
    cache[ruta] = ops
  end
  fila.operaciones = #ops.lista > 0 and ops.lista or ops.validas -- con la venta desactivada se ve cuál es
  if item == JAULA_MASCOTA then
    fila.estado, fila.motivo = "apartada", "mascota"
    return fila
  end
  if variante and hayVariantes(item) then
    fila.estado, fila.motivo = "apartada", "variante"
    return fila
  end
  if #ops.lista == 0 then
    fila.estado = "apartada"
    fila.motivo = ops.desactivadas > 0 and "venta_desactivada" or ops.ignoradas > 0 and "ignorada" or "sin_operacion"
    return fila
  end
  local precio = precioVenta(item)
  fila.precio = precio
  if precio == 0 or sinValor then
    fila.estado, fila.motivo = "apartada", "no_acepta"
    return fila
  end
  -- Para casar una venta sin ID solo vale el nombre que da el juego; sin él, cualquier venta sin ID puede ser esta.
  local info = API.infoObjeto(item)
  local nombreReal = info and info.nombre or nil
  local propuestas, primerMotivo, primerDetalle, dudosa = {}, nil, nil, false
  for _, nombre in ipairs(ops.lista) do
    local q, ligados, motivo, detalle, duda = propuesta(nombre, item, tienes, nombreReal)
    fila.porOperacion[#fila.porOperacion + 1] = {nombre = nombre, propone = q, motivo = motivo}
    if q > 0 then
      propuestas[#propuestas + 1] = {unidades = q, ligados = ligados}
    elseif duda then
      dudosa = true
      primerMotivo, primerDetalle = motivo, detalle
    elseif not primerMotivo then
      primerMotivo, primerDetalle = motivo, detalle
    end
  end
  local vender, ligadoDudoso, sinHueco = simularVenta(huecos, propuestas, libres)
  fila.vender = vender
  fila.quedan = tienes - vender
  if #propuestas > 1 then
    fila.detalleSuma = #propuestas
  end
  if incierto then
    fila.estado, fila.motivo = "incierta", "huecos"
  elseif dudosa then
    fila.estado, fila.motivo, fila.detalle = "incierta", primerMotivo, primerDetalle
  elseif ligadoDudoso then
    fila.estado, fila.motivo = "incierta", "ligado_desconocido"
  elseif precio == nil and vender > 0 then
    fila.estado, fila.motivo = "incierta", "sin_info"
  elseif vender > 0 then
    fila.estado = "vender"
    fila.valor = vender * precio
    if sinHueco then fila.motivo = "sin_hueco" end
  elseif sinHueco then
    fila.estado, fila.motivo = "nada", "sin_hueco"
  elseif #propuestas > 0 then
    fila.estado, fila.motivo = "nada", "ligado"
  else
    fila.estado, fila.motivo, fila.detalle = "nada", primerMotivo, primerDetalle
  end
  if fila.estado == "incierta" then
    fila.quedan, fila.valor = nil, nil
  end
  return fila
end

local function construirVender(v, rutas, B)
  local incierto = B.desconocidos > 0 or B.sinDatos > 0
  local libres = B.sinDatos == 0 and B.libres or nil
  local ids = {}
  for item in pairs(B.huecos) do ids[#ids + 1] = item end
  table.sort(ids)
  local cache, filas, unidades, valor = {}, {}, 0, 0
  for _, item in ipairs(ids) do
    local ruta = rutaDe(item)
    if rutas[ruta] then
      local fila = filaVender(item, B.huecos[item], ruta, cache, libres, incierto)
      filas[#filas + 1] = fila
      if fila.estado == "vender" then
        unidades, valor = unidades + fila.vender, valor + fila.valor
      end
    end
  end
  v.filas = filas
  v.totales = {filas = #filas, unidades = unidades, valor = valor}
end

---------------------------------------------------------------------------------------------------
-- Reponer desde el comerciante
---------------------------------------------------------------------------------------------------

local FUENTES_SABIDAS = {banco = true, alters = true, subastas = true}

-- Lo que tienes según las fuentes de la operación: unidades | nil, motivo, detalle.
local function existencias(nombre, item)
  local fuentes = {}
  for _, f in ipairs(SNF.Operaciones.valor(TIPO, nombre, "fuentesReponer") or {}) do
    if not FUENTES_SABIDAS[f] then
      return nil, "fuente_sin_cobertura", f
    end
    fuentes[f] = true
  end
  local n = SNF.InventarioCuenta.shoppingStock(item, {banco = fuentes.banco, alters = fuentes.alters})
  if n == nil then
    return nil, "existencias", fuentes.banco and "banco" or fuentes.alters and "alters" or "bolsas"
  end
  if fuentes.subastas then
    local publicadas = SNF.MisSubastas.publicadas(item)
    if publicadas == nil then
      return nil, "existencias", "subastas"
    end
    n = n + publicadas
  end
  return n
end

local function construirReponer(v, rutas, B)
  local catalogo = SNF.MerchantPrices.catalogo()
  if not catalogo then
    v.estado, v.motivo = "sin_datos", "comerciante"
    return
  end
  local incierto = B.desconocidos > 0 or B.sinDatos > 0
  -- La misma mercancía puede ocupar varias filas. Una oferta con moneda especial o sin existencias no oculta
  -- la primera oferta del objeto base que sí se puede comprar con oro.
  local ofertas = {}
  for _, c in ipairs(catalogo) do
    if c.item and c.variante == false and not c.motivo and not ofertas[c.item] then ofertas[c.item] = c end
  end
  local filas, vistos, unidades, coste = {}, {}, 0, 0
  for _, c in ipairs(catalogo) do
    local item = c.item
    local ruta = item and rutaDe(item)
    if item and rutas[ruta] and not vistos[item] and (not ofertas[item] or ofertas[item] == c) then
      vistos[item] = true
      local validas = operacionesDe(ruta)
      local fila = {clave = ruta .. "|" .. item, item = item, nombre = nombreDe(item), ruta = ruta, operaciones = validas,
        disponibles = c.disponibles, precio = c.precio}
      local nombre = validas[1]
      if item == JAULA_MASCOTA then
        fila.estado, fila.motivo = "apartada", "mascota"
      elseif c.variante ~= false then
        fila.estado, fila.motivo = "apartada", c.variante == nil and "enlace" or "variante"
      elseif c.motivo then
        fila.estado, fila.motivo = "apartada", c.motivo
      elseif not nombre then
        fila.estado, fila.motivo = "apartada", "sin_operacion"
      elseif SNF.Operaciones.valor(TIPO, nombre, "comprarActivo") == false then
        fila.estado, fila.motivo, fila.operaciones = "apartada", "compra_desactivada", {nombre}
      else
        fila.operaciones = {nombre}
        local objetivo = cantidad(nombre, "reponerCantidad", item)
        fila.objetivo = objetivo
        if not objetivo then
          fila.estado, fila.motivo, fila.detalle = "apartada", "formula", nombre .. " · reponerCantidad"
        else
          local tienes, motivo, detalle = existencias(nombre, item)
          fila.tienes = tienes
          if incierto then
            fila.estado, fila.motivo = "incierta", "huecos"
          elseif tienes == nil then
            fila.estado, fila.motivo, fila.detalle = "incierta", motivo, detalle
          else
            local q = math.max(objetivo - tienes, 0)
            if c.disponibles and c.disponibles >= 0 then q = math.min(q, c.disponibles) end
            fila.comprar = q
            if q > 0 then
              fila.estado, fila.coste = "comprar", q * c.precio
              unidades, coste = unidades + q, coste + fila.coste
            else
              fila.estado, fila.motivo = "nada", "repuesto"
            end
          end
        end
      end
      filas[#filas + 1] = fila
    end
  end
  v.filas = filas
  v.totales = {filas = #filas, unidades = unidades, coste = coste}
end

---------------------------------------------------------------------------------------------------
-- Vista previa
---------------------------------------------------------------------------------------------------

local function vacia(modo, estado, motivo)
  return {modo = modo, estado = estado, motivo = motivo, filas = {}, totales = {filas = 0, unidades = 0},
    requisitos = {comercianteAbierto = Vendedor.abierto(), fueraDeCombate = not enCombate(), ejecutable = false,
      motivoEjecutar = "solo_lectura"}}
end

local function huella(v, B)
  local partes = {v.modo, v.estado, B.firma, B.leidos, B.libres, B.desconocidos, B.sinDatos}
  for _, f in ipairs(v.filas) do
    partes[#partes + 1] = table.concat({f.item, f.ruta, table.concat(f.operaciones or {}, ","), tostring(f.tienes),
      tostring(f.vender), tostring(f.comprar), tostring(f.objetivo), tostring(f.precio), tostring(f.disponibles),
      f.estado, tostring(f.motivo), tostring(f.detalle), f.nombre or ""}, "|")
  end
  return table.concat(partes, "\n")
end

local function construir(modo, rutas)
  if not ES_MODO[modo] then
    return vacia(modo, "modo")
  end
  if not Vendedor.abierto() then
    return vacia(modo, "sin_comerciante")
  end
  if enCombate() then
    return vacia(modo, "en_combate")
  end
  if rutas == nil then
    rutas = {}
    for _, ruta in ipairs(Vendedor.grupos()) do rutas[ruta] = true end
  end
  local B = leerBolsas()
  if B.leidos == 0 then
    return vacia(modo, "sin_datos", "bolsas")
  end
  local v = vacia(modo, "lista")
  if modo == "vender" then
    construirVender(v, rutas, B)
  else
    construirReponer(v, rutas, B)
  end
  v.requisitos.bolsasLeidas = B.desconocidos == 0 and B.sinDatos == 0
  v.requisitos.huecosDesconocidos = B.desconocidos
  v.requisitos.huecosLibres = B.sinDatos == 0 and B.libres or nil
  v.huella = huella(v, B)
  v._rutas = rutas
  return v
end

function Vendedor.vistaPrevia(modo, rutas)
  return construir(modo, rutas)
end

function Vendedor.vigente(vista)
  if type(vista) ~= "table" or vista.estado ~= "lista" then
    return false, "sin_vista"
  end
  local nueva = construir(vista.modo, vista._rutas)
  if nueva.estado ~= "lista" then
    return false, nueva.estado
  end
  if nueva.huella ~= vista.huella then
    return false, "cambio"
  end
  return true
end

---------------------------------------------------------------------------------------------------
-- Eventos: merchant-prices.lua (que va antes en el .toc) ya ha leído el comerciante cuando llegan aquí.
---------------------------------------------------------------------------------------------------

local function avisar()
  SNF.Eventos.emitir("SNF_VENDEDOR")
end

SNF.Eventos.escuchar("MERCHANT_SHOW", avisar)
SNF.Eventos.escuchar("MERCHANT_UPDATE", avisar)
SNF.Eventos.escuchar("MERCHANT_CLOSED", avisar)
