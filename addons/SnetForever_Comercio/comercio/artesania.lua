-- SnetForever: Artesanía (plan de paridad con TSM, fase 4). Vista previa, SOLO DE LECTURA, de lo que las operaciones de
-- Artesanía pondrían a fabricar para reponer y de los materiales que hacen falta. No fabrica, no compra, no usa ni mueve
-- nada: no llama a C_TradeSkillUI.CraftRecipe ni a ninguna función que actúe en el juego. Es una recomendación que el
-- jugador sigue con sus propias manos. Lo que falta por probar en Forever está en docs/comercio/artesania.md.
--
-- Las cuentas son las de TSM 4.15.9 (LibTSMSystem/Source/Operation/CraftingOperation.lua y LibTSMApp/Source/Crafting/
-- Internal/Restock.lua), leídas en la copia instalada:
--   - Se reponen los objetos de los grupos elegidos, nunca los del Grupo Base (TSM salta la raíz).
--   - La operación es la primera de Artesanía del grupo, con la herencia de Operaciones.deGrupo. Una ignorada aquí (por
--     personaje o casa) no deja paso a otra: Artesanía admite una sola operación, como en TSM.
--   - Mínimo y máximo a reponer: fórmulas que tienen que dar una cantidad de 0 a 50.000. Si no, o si el mínimo pasa del
--     máximo, la operación no repone nada (TSM lo avisa como operación no válida).
--   - La receta: la más barata con todos los materiales con precio; si ninguna tiene coste y solo hay una, esa sin coste.
--   - Beneficio mínimo (si está activado): valor de lo fabricado - coste por unidad tiene que llegar al mínimo. Sin valor,
--     sin coste o sin mínimo calculable, TSM no repone.
--   - Cantidad: faltan = máximo - tienes. Si faltan <= 0 o faltan < mínimo, nada. Si no, fabricaciones = floor(faltan /
--     rendimiento): una receta que da más de lo que falta no se pone (TSM redondea hacia abajo).
--
-- Donde se aparta de TSM (todo está en docs/comercio/artesania.md):
--   - Tienes: solo lo visto (Inventario.craftingStock y tus subastas si la lista está cargada). Lo que TSM cuenta y aquí no
--     se ve (un banco o buzón sin abrir, las subastas de otros personajes, la hermandad) va en `sinContar` y la cantidad a
--     fabricar es un TOPE: con lo que falta por contar solo puede bajar. Las listas «ignorar personajes/hermandades» de
--     los ajustes generales de Artesanía de TSM no se importan.
--   - Coste: el de SNF.RecipeCosts (recetas vistas en esta sesión con la ventana de profesión abierta, rendimiento fijo,
--     un material por casilla; precio de cada material = lo normal de la app). TSM usa su fórmula general de materiales,
--     redondea al cobre más cercano y puede contar rendimientos extra; aquí se redondea hacia arriba.
--   - Valor de lo fabricado: la fórmula propia de la operación si «Cambiar el valor» está activado y no está vacía; si no,
--     VALOR_GENERAL, la fórmula de fábrica de TSM traducida por el importador. La fórmula general que cada jugador tenga en
--     TSM no se importa.
--   - Lo que falta no se toma por cero: la fila queda «incierta» y dice qué dato falta.
--
-- Artesania.grupos() -> {rutas}   las que tienen operación de Artesanía (propia o heredada), en el orden del árbol.
-- Artesania.vistaPrevia(rutas?) -> vista   rutas = {[ruta] = true} | nil (todas).
--   vista = {estado = "lista" | "en_combate", filas, materiales, totales, recetasVistas, valorGeneral, huella}
--   fila = {clave, item, nombre, ruta, operaciones = {nombre}, minimo, maximo, tienes, sinContar = {fuentes}, faltan,
--     rendimiento, fabricaciones, unidades, coste, valor, beneficio, beneficioMinimo, costeTotal, receta, materiales,
--     estado = "fabricar" | "nada" | "apartada" | "incierta", motivo, detalle, tope (true si sinContar no está vacío)}
--   material = {id, nombre, necesarias, enBolsas, comprar, precio, coste, tope}
-- Artesania.vigente(vista) -> boolean, motivo?   vuelve a calcular y dice si la vista sigue valiendo.
local SNF = SnetForever
local Artesania = {}
SNF.Artesania = Artesania

local floor = math.floor
local API = SNF.API
local TIPO = "artesania"
local MAX_CANTIDAD = 50000
-- defaultCraftPriceMethod de fábrica en TSM 4.15.9 (LibTSMSystem/Source/AddonSettings/Schema.lua),
-- «first(dbminbuyout, dbmarket)*0.95», con las fuentes que pone Formulas.traducir.
local VALOR_GENERAL = "first(snfminimo, snfmercado) * 0.95"
Artesania.VALOR_GENERAL = VALOR_GENERAL
-- Lo que TSM suma en «NumInventory» y SnetForever no tiene manera de ver.
local SIEMPRE_SIN_CONTAR = {"subastasAlters", "hermandad"}

local function enCombate()
  local f = rawget(_G, "InCombatLockdown")
  if type(f) ~= "function" then
    return false
  end
  local ok, si = pcall(f)
  return ok and si == true
end

local function nombreDe(item)
  local info = API.infoObjeto(item)
  if info and info.nombre then
    return info.nombre
  end
  local ok, n = pcall(SNF.Datos.nombreItem, item)
  return ok and type(n) == "string" and n or nil
end

function Artesania.grupos()
  local salida = {}
  for _, ruta in ipairs(SNF.Arbol.ordenadas()) do
    if ruta ~= "" and #SNF.Operaciones.deGrupo(ruta, TIPO) > 0 then
      salida[#salida + 1] = ruta
    end
  end
  return salida
end

-- Una cantidad de la operación: entero de 0 a 50.000 | nil.
local function cantidad(nombre, campo, item)
  local v = SNF.Operaciones.cobre(TIPO, nombre, campo, item)
  if v == nil or v < 0 or v > MAX_CANTIDAD then
    return nil
  end
  return v
end

-- Un importe con signo (el beneficio mínimo puede ser negativo en TSM): cobre | nil.
local function importe(formula, item)
  if type(formula) ~= "string" then
    return nil
  end
  local v = SNF.Formulas.valor(formula, item)
  if API.esSecreto(v) or type(v) ~= "number" or v ~= v or v == math.huge or v == -math.huge then
    return nil
  end
  if v < 0 then
    return -SNF.Formulas.cobre(-v)
  end
  return SNF.Formulas.cobre(v)
end

local function formulaValor(nombre)
  local propia = SNF.Operaciones.valor(TIPO, nombre, "valorFabricado")
  if SNF.Operaciones.valor(TIPO, nombre, "cambiarValor") == true and type(propia) == "string"
      and string.find(propia, "%S") then
    return propia, false
  end
  return VALOR_GENERAL, true
end

local function nombresDe(ids)
  local salida = {}
  for i, id in ipairs(ids) do
    salida[i] = nombreDe(id) or ("#" .. id)
  end
  return table.concat(salida, ", ")
end

-- Tienes: unidades vistas | nil, sinContar.
local function existencias(item)
  local total, sinVer = SNF.InventarioCuenta.craftingStock(item)
  if total == nil then
    return nil
  end
  local sinContar = {}
  for _, f in ipairs(sinVer or {}) do sinContar[#sinContar + 1] = f end
  local publicadas = SNF.MisSubastas.publicadas(item)
  if publicadas == nil then
    sinContar[#sinContar + 1] = "subastas"
  else
    total = total + publicadas
  end
  for _, f in ipairs(SIEMPRE_SIN_CONTAR) do sinContar[#sinContar + 1] = f end
  return total, sinContar
end

local function enBolsas(item)
  local n = SNF.InventarioCuenta.shoppingStock(item, {})
  return n
end

local function materialesDe(receta, fabricaciones)
  local lista, total = {}, 0
  for _, m in ipairs(receta.materials) do
    local necesarias = m.quantity * fabricaciones
    local bolsas = enBolsas(m.id)
    local fila = {id = m.id, nombre = nombreDe(m.id), necesarias = necesarias, enBolsas = bolsas, precio = m.price}
    if bolsas ~= nil then
      fila.comprar = math.max(0, necesarias - bolsas)
      if m.price then fila.coste = fila.comprar * m.price end
    end
    if m.price and total then
      total = total + necesarias * m.price
    else
      total = nil
    end
    lista[#lista + 1] = fila
  end
  return lista, total
end

local function fila(item, ruta, clave)
  local f = {clave = ruta .. "|" .. clave, item = item, nombre = item and nombreDe(item) or nil, ruta = ruta,
    operaciones = {}, sinContar = {}}
  local nombre, motivoOp = SNF.Operaciones.aplicable(ruta, TIPO)
  if nombre then
    f.operaciones = {nombre}
  else
    f.operaciones = SNF.Operaciones.deGrupo(ruta, TIPO)
  end
  if not item then
    f.estado, f.motivo = "apartada", string.sub(clave, 1, 2) == "p:" and "mascota" or "variante"
    return f
  end
  if not nombre then
    f.estado, f.motivo = "apartada", motivoOp == "ignorada" and "ignorada" or "sin_operacion"
    return f
  end
  -- 1. La operación tiene que ser válida (CraftingOperation.IsValid).
  local minimo = cantidad(nombre, "reponerMinimo", item)
  if minimo == nil then
    f.estado, f.motivo, f.detalle = "apartada", "formula", nombre .. " · reponerMinimo"
    return f
  end
  local maximo = cantidad(nombre, "reponerMaximo", item)
  if maximo == nil then
    f.estado, f.motivo, f.detalle = "apartada", "formula", nombre .. " · reponerMaximo"
    return f
  end
  f.minimo, f.maximo = minimo, maximo
  if minimo > maximo then
    f.estado, f.motivo, f.detalle = "apartada", "min_max", minimo .. " > " .. maximo
    return f
  end
  -- 2. La receta (Crafting.GetLowestCostByItem).
  local d = SNF.RecipeCosts.detail(item)
  if not d then
    f.estado, f.motivo = "apartada", "sin_receta"
    return f
  end
  if not d.recipe then
    f.estado, f.motivo, f.detalle = "incierta", "recetas_sin_coste", nombresDe(d.missing)
    return f
  end
  f.receta, f.rendimiento, f.coste = d.recipe.id, d.recipe.count, d.cost
  -- 3. El valor y el beneficio por unidad (se calculan siempre, para verlos; solo deciden con el beneficio mínimo).
  local formula, general = formulaValor(nombre)
  f.valorGeneral = general
  f.valor = importe(formula, item)
  if f.valor and f.coste then
    f.beneficio = f.valor - f.coste
  end
  if SNF.Operaciones.valor(TIPO, nombre, "beneficioMinimoActivo") == true then
    if f.valor == nil then
      f.estado, f.motivo, f.detalle = "incierta", "sin_valor", general and "general" or (nombre .. " · valorFabricado")
      return f
    end
    if f.coste == nil then
      f.estado, f.motivo, f.detalle = "incierta", "sin_coste", nombresDe(d.missing)
      return f
    end
    local minBeneficio = importe(SNF.Operaciones.valor(TIPO, nombre, "beneficioMinimo"), item)
    if minBeneficio == nil then
      f.estado, f.motivo, f.detalle = "incierta", "formula", nombre .. " · beneficioMinimo"
      return f
    end
    f.beneficioMinimo = minBeneficio
    if f.beneficio < minBeneficio then
      f.estado, f.motivo = "nada", "beneficio"
      return f
    end
  end
  -- 4. Cuánto falta (CraftingOperation.GetRestockQuantity) y cuántas veces se fabrica.
  local tienes, sinContar = existencias(item)
  if tienes == nil then
    f.estado, f.motivo, f.detalle = "incierta", "existencias", "bolsas"
    return f
  end
  f.tienes, f.sinContar = tienes, sinContar
  f.tope = #sinContar > 0
  local faltan = maximo - tienes
  f.faltan = math.max(0, faltan)
  if faltan <= 0 then
    f.estado, f.motivo = "nada", "repuesto"
    return f
  end
  if faltan < minimo then
    f.estado, f.motivo, f.detalle = "nada", "bajo_minimo", faltan .. "/" .. minimo
    return f
  end
  local fabricaciones = floor(faltan / f.rendimiento)
  if fabricaciones == 0 then
    f.estado, f.motivo, f.detalle = "nada", "rendimiento", f.rendimiento .. "/" .. faltan
    return f
  end
  f.fabricaciones, f.unidades = fabricaciones, fabricaciones * f.rendimiento
  f.materiales, f.costeTotal = materialesDe(d.recipe, fabricaciones)
  f.estado = "fabricar"
  if f.coste == nil then
    f.motivo, f.detalle = "sin_coste", nombresDe(d.missing)
  end
  return f
end

local function juntarMateriales(filas)
  local porId, lista = {}, {}
  for _, f in ipairs(filas) do
    if f.estado == "fabricar" then
      for _, m in ipairs(f.materiales) do
        local t = porId[m.id]
        if not t then
          t = {id = m.id, nombre = m.nombre, necesarias = 0, enBolsas = m.enBolsas, precio = m.precio, tope = false,
            de = {}}
          porId[m.id] = t
          lista[#lista + 1] = t
        end
        t.necesarias = t.necesarias + m.necesarias
        t.tope = t.tope or f.tope
        t.de[#t.de + 1] = f.nombre or ("#" .. f.item)
      end
    end
  end
  for _, t in ipairs(lista) do
    if t.enBolsas ~= nil then
      t.comprar = math.max(0, t.necesarias - t.enBolsas)
      if t.precio then t.coste = t.comprar * t.precio end
    end
  end
  table.sort(lista, function(a, b) return a.id < b.id end)
  return lista
end

local function totales(filas, materiales)
  local t = {filas = #filas, fabricar = 0, fabricaciones = 0, unidades = 0, coste = 0, beneficio = 0, compra = 0,
    tope = false, costeIncompleto = false, beneficioIncompleto = false, compraIncompleta = false}
  for _, f in ipairs(filas) do
    if f.estado == "fabricar" then
      t.fabricar = t.fabricar + 1
      t.fabricaciones = t.fabricaciones + f.fabricaciones
      t.unidades = t.unidades + f.unidades
      t.tope = t.tope or f.tope
      if f.costeTotal then t.coste = t.coste + f.costeTotal else t.costeIncompleto = true end
      if f.beneficio then t.beneficio = t.beneficio + f.beneficio * f.unidades else t.beneficioIncompleto = true end
    end
  end
  for _, m in ipairs(materiales) do
    if m.coste then t.compra = t.compra + m.coste elseif (m.comprar or 1) > 0 then t.compraIncompleta = true end
  end
  return t
end

local function huella(v)
  local partes = {v.estado, tostring(v.recetasVistas)}
  for _, f in ipairs(v.filas) do
    partes[#partes + 1] = table.concat({tostring(f.item), f.ruta, table.concat(f.operaciones or {}, ","),
      tostring(f.minimo), tostring(f.maximo), tostring(f.tienes), table.concat(f.sinContar or {}, ","),
      tostring(f.receta), tostring(f.rendimiento), tostring(f.fabricaciones), tostring(f.coste), tostring(f.valor),
      tostring(f.beneficioMinimo), f.estado, tostring(f.motivo), tostring(f.detalle), f.nombre or ""}, "|")
  end
  for _, m in ipairs(v.materiales) do
    partes[#partes + 1] = table.concat({m.id, m.necesarias, tostring(m.enBolsas), tostring(m.precio), m.nombre or ""}, "|")
  end
  return table.concat(partes, "\n")
end

local function construir(rutas)
  local v = {estado = "lista", filas = {}, materiales = {}, recetasVistas = SNF.RecipeCosts.count(),
    valorGeneral = VALOR_GENERAL, requisitos = {ejecutable = false, motivoEjecutar = "solo_lectura"}}
  if enCombate() then
    v.estado = "en_combate"
    v.totales = totales(v.filas, v.materiales)
    return v
  end
  local elegidas = {}
  for _, ruta in ipairs(Artesania.grupos()) do
    if rutas == nil or rutas[ruta] then elegidas[#elegidas + 1] = ruta end
  end
  for _, ruta in ipairs(elegidas) do
    for _, clave in ipairs(SNF.Arbol.objetos(ruta)) do
      -- Solo el objeto base: una clave con sufijo, bonus o de mascota no es una receta que se pueda casar.
      local item = tonumber(string.match(clave, "^i:(%d+)$"))
      v.filas[#v.filas + 1] = fila(item, ruta, clave)
    end
  end
  v.materiales = juntarMateriales(v.filas)
  v.totales = totales(v.filas, v.materiales)
  v.huella = huella(v)
  v._rutas = rutas
  return v
end

function Artesania.vistaPrevia(rutas)
  return construir(rutas)
end

function Artesania.vigente(vista)
  if type(vista) ~= "table" or vista.estado ~= "lista" then
    return false, "sin_vista"
  end
  local nueva = construir(vista._rutas)
  if nueva.estado ~= "lista" then
    return false, nueva.estado
  end
  if nueva.huella ~= vista.huella then
    return false, "cambio"
  end
  return true
end

-- recipe-costs.lua (antes en el .toc) ya ha leído la ventana de profesión cuando llega esto.
SNF.Eventos.escuchar("TRADE_SKILL_LIST_UPDATE", function()
  SNF.Eventos.emitir("SNF_ARTESANIA")
end)
