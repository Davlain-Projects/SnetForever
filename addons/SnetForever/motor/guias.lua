-- SnetForever: elección de guía (plano 1 §7). Guía por defecto de un personaje, cambio de guía, cambio de versión
-- (normal / con mazmorras) conservando el sitio y lista de guías disponibles.
--
-- Guias.faccionDe(guia) -> "Horde" | "Alliance" | nil   guia.faccion (nil = las dos). Solo si la guía no trae el campo
--                                                      y tampoco tiene variantes, se deduce de «(H)» / «(A)» en el grupo.
-- Guias.existe(clave, pj?) -> boolean                  la guía existe para el personaje (facción, filtro y alguna variante).
-- Guias.primeraDisponible(lista, pj?) -> clave | nil   primer destino de la lista que existe y cuyo filtro aplica.
-- Guias.porDefecto(pj?, version?) -> clave | nil       la guía con la que empieza el personaje (version: "normal" o
--                                                      "mazmorras"; por defecto el ajuste «version»): la que contiene
--                                                      su nivel (de la versión y, si no hay, normal) o la anterior
--                                                      más cercana (ver más abajo).
-- Guias.cargar(clave, opciones?) -> boolean            Motor.cargar y SnetForeverPJ.guia = clave.
-- Guias.disponibles(pj?) -> {{grupo, claves}, ...}     grupos y guías (no laterales) que existen para el personaje (el grupo es el de su
--                                                      variante), los grupos por nombre y las guías por niveles[1].
-- Guias.delMenu(version, pj?) -> {{grupo, claves, normal?}, ...}  los grupos del selector para la versión: con
--                                                      «mazmorras», también las normales de los tramos sin mazmorras
--                                                      (normal = true).
-- Guias.variante(guia, pj) -> variante | nil           la variante que ve el personaje (sin variantes, la propia guía).
-- Guias.titulo(clave, pj?) -> texto | nil              L.de(titulo) de esa variante (la ventana y su menú); en una
--                                                      guía de mazmorra con area, «Mazmorra: <nombre de la zona>».
-- Guias.tramo(clave) -> texto | nil                    L.de(guia.tramo) o «Nivel min-max» (el tramo de la ventana).
-- Guias.descripcion(clave) -> texto | nil              lote «Cadenas de mejoras»: L.de(guia.mejora.beneficio) de una guía de
--                                                      mejora, tal cual (un dato del jugador o, sin él, la recompensa de la
--                                                      base); nil en las demás.
-- Guias.niveles(guia) -> min, max                      los niveles de la guía: valen {min = , max = } (laterales) y {1, 60}.
-- Guias.LATERALES = {cadena, mejora, profesion, mazmorra}  los tipos de guía lateral con sección propia en el menú.
-- Guias.esLateral(clave) -> boolean                    la guía existe y es de un tipo lateral o una ruta de la IA (tipo «ia»).
-- Guias.laterales(tipo, pj?) -> clave[]                las laterales de ese tipo con algún paso para el personaje (o con alguna
--                                                      misión suya en el registro o entregada: F3-31), por
--                                                      nivel mínimo y luego por título.
-- Guias.abrirLateral(clave) -> boolean                 carga una guía sin perder la principal: guarda en
--                                                      SnetForeverPJ.volverA la guía desde la que se abrió (la
--                                                      principal si se abre desde otra lateral ya acabada o desde la
--                                                      de una ruta de pines; T3: la lateral si está sin acabar) y en
--                                                      SnetForeverPJ.lateral la clave abierta.
-- Guias.olvidarVuelta()                                16-nov: la X de «Volver a»: quita la cima de la pila (ronda 2).
-- Guias.vueltas() -> {clave...}                        T3, ronda 2: la pila de vueltas desde la cima (volverA y
--                                                      SnetForeverPJ.vueltas, 3 como mucho).
-- Guias.subirVuelta(clave)                             quita de la pila las que están encima de `clave`.
-- Guias.aMedias() -> {clave, titulo, n, total} | nil   T3: la guía cargada si está sin acabar (n: el número del paso actual).
-- Guias.algoQueHacer(clave) -> boolean                 16-nov: la guía tiene algún paso que se puede hacer ahora.
-- Guias.otraVersion(clave) -> clave | nil             la guía del otro tipo con el mismo nombre y la misma facción.
-- Guias.pasoEquivalente(claveDestino, pasoVivo) -> n | nil
-- Guias.firmaPaso(datos) -> texto | nil                T3: la firma de un paso (t, q, i y mapa de sus elementos).
-- Guias.cambiarVersion() -> boolean                    carga la otra versión en el paso equivalente (o en el 1) y guarda
--                                                      el ajuste «version».
-- Guias.elegirVersion(version)                        «normal» o «mazmorras»: cambia de guía si hace falta y guarda el ajuste.
-- Guias.volverPorDefecto() -> boolean
--
-- Una guía sin campo `faccion` vale para las dos facciones (contrato de datos de la fase 1). Si trae `variantes`,
-- se usa la primera cuyo filtro aplica al personaje (su grupo, subgrupo y título son los que se ven).
local _, SNF = ...
local Guias = {}
SNF.Guias = Guias

local Datos = SNF.Datos
local Filtros = SNF.Filtros
local Ajustes = SNF.Ajustes
local Motor = SNF.Motor
local Personaje = SNF.Personaje

-- «mejora»: lote «Cadenas de mejoras» (cadenas que dan una mejora al personaje, como el saco de dormir).
Guias.LATERALES = {cadena = true, mejora = true, profesion = true, mazmorra = true}

-- Las rutas de zona de la IA (tipo «ia», fase 4, SnetForeverPJ.ia.guias) también se abren como laterales, pero no son
-- de ninguna sección de Guias.laterales: salen en su propio apartado del menú.
-- Lote D (D4): la de «Misiones que te quedan en <continente>» (tipo «restantes», motor/continente.lua) también se abre como
-- lateral y no sale en el menú.
local function tipoLateral(tipo)
  return Guias.LATERALES[tipo] == true or tipo == "ia" or tipo == "restantes"
end

---------------------------------------------------------------------------------------------------
-- Existencia de la guía para el personaje.
---------------------------------------------------------------------------------------------------

function Guias.faccionDe(guia)
  if guia.faccion then
    return guia.faccion
  end
  if guia.variantes then
    return nil
  end
  local grupo = guia.grupo or ""
  if string.find(grupo, "(H)", 1, true) then
    return "Horde"
  elseif string.find(grupo, "(A)", 1, true) then
    return "Alliance"
  end
  return nil
end

-- La facción de la guía (nil = las dos) vale para el personaje; «Neutral» o sin facción conocida, cualquiera.
local function faccionCumple(faccion, pj)
  return faccion == nil or pj.faccion == nil or pj.faccion == "Neutral" or pj.faccion == faccion
end

-- La variante de la guía que ve el personaje: la primera cuyo filtro aplica. Sin variantes, la propia guía (sus
-- campos grupo, subgrupo y titulo). nil si ninguna variante aplica.
local function variante(guia, pj)
  local variantes = guia.variantes
  if not variantes then
    return guia
  end
  for _, v in ipairs(variantes) do
    if Filtros.evaluar(v.filtro, pj) then
      return v
    end
  end
  return nil
end

Guias.variante = variante

-- Niveles de una guía: las de RestedXP traen un array ({1, 60}) y las laterales de la fase 3 {min = , max = }.
local function niveles(guia)
  local n = guia.niveles
  return n.min or n[1], n.max or n[2]
end

Guias.niveles = niveles

function Guias.titulo(clave, pj)
  local guia = Datos.guia(clave)
  if not guia then
    return nil
  end
  if guia.tipo == "mazmorra" and guia.area then
    local zona = Datos.nombreZona(guia.area)
    if type(zona) == "string" and not string.find(zona, "^#%d+$") then
      return SNF.L.t("TITULO_MAZMORRA", zona)
    end
    -- Sin nombre de zona ni en el juego ni en los datos: el título de la propia guía.
    return SNF.L.de(guia.titulo) or guia.nombre
  end
  local v = variante(guia, pj or Personaje.actual()) or guia
  return SNF.L.de(v.titulo or guia.titulo) or guia.nombre
end

-- Lote D (D3, visto en el juego el 10-nov): el nombre que se ENSEÑA de un grupo del selector. El grupo es la clave interna (la
-- primera parte de la clave de la guía, como la escribió el autor de la ruta: «Skyrim Horde 22-30 (EN)») y no cambia,
-- porque las guías guardadas la usan; aquí solo se traduce para verlo. Los grupos de los datos tienen su nombre en los
-- dos idiomas en NOMBRES_GRUPO; uno que no esté se traduce palabra a palabra (PALABRAS) y pierde el «(EN)», que solo
-- decía en qué idioma se escribió la ruta.
local NOMBRES_GRUPO = {
  ["RestedXP Forever Guide (A)"] = {es = "RestedXP Forever (Alianza)", en = "RestedXP Forever (Alliance)"},
  ["RestedXP Forever Guide (H)"] = {es = "RestedXP Forever (Horda)", en = "RestedXP Forever (Horde)"},
  ["RestedXP Forever Dungeon Guide (A)"] = {
    es = "RestedXP Forever con mazmorras (Alianza)", en = "RestedXP Forever with dungeons (Alliance)",
  },
  ["RestedXP Forever Dungeon Guide (H)"] = {
    es = "RestedXP Forever con mazmorras (Horda)", en = "RestedXP Forever with dungeons (Horde)",
  },
  ["RestedXP ADV AoE Alliance Mage"] = {es = "RestedXP Mago AoE avanzado (Alianza)", en = "RestedXP ADV AoE Mage (Alliance)"},
  ["RestedXP Alliance Mage"] = {es = "RestedXP Mago (Alianza)", en = "RestedXP Mage (Alliance)"},
  ["RestedXP Horde Mage AoE"] = {es = "RestedXP Mago AoE (Horda)", en = "RestedXP Mage AoE (Horde)"},
  ["Skyrim Horde Mage AoE (EN)"] = {es = "Skyrim Mago AoE (Horda)", en = "Skyrim Mage AoE (Horde)"},
  ["Skyrim Alliance Mage (EN)"] = {es = "Skyrim Mago (Alianza)", en = "Skyrim Mage (Alliance)"},
  ["Skyrim ADV AoE Alliance Mage (EN)"] = {es = "Skyrim Mago AoE avanzado (Alianza)", en = "Skyrim ADV AoE Mage (Alliance)"},
  ["Mis guías"] = {es = "Mis guías", en = "My guides"}, -- motor/misguias.lua
}

-- Palabra a palabra (para los grupos que no están en NOMBRES_GRUPO): {patrón, inglés, español}. Las siglas «(H)» y «(A)»
-- se quedan como están: valen en los dos idiomas.
local PALABRAS = {
  {"Horde", "Horde", "Horda"}, {"Alliance", "Alliance", "Alianza"}, {"Guide", "Guide", "Guía"},
  {"Dungeons?", "Dungeon", "Mazmorras"}, {"Mage", "Mage", "Mago"}, {"Warrior", "Warrior", "Guerrero"},
  {"Paladin", "Paladin", "Paladín"}, {"Hunter", "Hunter", "Cazador"}, {"Rogue", "Rogue", "Pícaro"},
  {"Priest", "Priest", "Sacerdote"}, {"Shaman", "Shaman", "Chamán"}, {"Warlock", "Warlock", "Brujo"},
  {"Druid", "Druid", "Druida"},
}

function Guias.tituloGrupo(grupo)
  if type(grupo) ~= "string" then
    return ""
  end
  local idioma = SNF.L.idioma()
  local propio = NOMBRES_GRUPO[grupo]
  if propio then
    return propio[idioma] or propio.en
  end
  local texto = string.gsub(grupo, "%s*%(EN%)", "")
  for _, p in ipairs(PALABRAS) do
    -- Solo palabras enteras: ni dentro de otra palabra ni pegadas a letras.
    texto = string.gsub(" " .. texto .. " ", "([^%w])" .. p[1] .. "([^%w])", function(antes, despues)
      return antes .. (idioma == "es" and p[3] or p[2]) .. despues
    end)
    texto = string.sub(texto, 2, -2)
  end
  return texto
end

local function aplica(guia, pj)
  return faccionCumple(Guias.faccionDe(guia), pj) and Filtros.evaluar(guia.filtro, pj) and variante(guia, pj) ~= nil
end

function Guias.existe(clave, pj)
  local guia = Datos.guia(clave)
  return guia ~= nil and aplica(guia, pj or Personaje.actual())
end

function Guias.primeraDisponible(lista, pj)
  pj = pj or Personaje.actual()
  for _, entrada in ipairs(lista or {}) do
    local destino = type(entrada) == "string" and {clave = entrada} or entrada
    if type(destino) == "table" and destino.clave and Filtros.evaluar(destino.filtro, pj) then
      local guia = Datos.guia(destino.clave)
      if guia and aplica(guia, pj) then
        return guia.clave
      end
    end
  end
  return nil
end

local function contieneNivel(guia, nivel)
  local minimo, maximo = niveles(guia)
  return minimo <= nivel and nivel <= maximo
end

-- La descripción de una guía de mejora: su beneficio tal cual (un dato del jugador o, si no lo hay, el nombre y el tipo de
-- la recompensa, de la base) y, detrás, lo que dan por el camino las misiones de antes (porElCamino, de la base). Las
-- demás guías no tienen descripción.
function Guias.descripcion(clave)
  local guia = Datos.guia(clave)
  if not guia or guia.tipo ~= "mejora" or type(guia.mejora) ~= "table" then
    return nil
  end
  local beneficio = SNF.L.de(guia.mejora.beneficio)
  -- Ronda 1: lo que dan por el camino las misiones de antes (sale de la base), detrás del beneficio.
  local camino = SNF.L.de(guia.mejora.porElCamino)
  if type(beneficio) == "string" and type(camino) == "string" and camino ~= "" then
    return beneficio .. " " .. camino
  end
  return beneficio or camino
end

-- El texto del tramo de la guía en la ventana: el suyo (profesiones: «Habilidad 1-300») o «Nivel min-max».
function Guias.tramo(clave)
  local guia = Datos.guia(clave)
  if not guia then
    return nil
  end
  local propio = SNF.L.de(guia.tramo)
  if propio then
    return propio
  end
  local minimo, maximo = niveles(guia)
  return SNF.L.t("VENTANA_TRAMO", math.floor(minimo), math.floor(maximo))
end

local function esAoE(guia, pj)
  local v = variante(guia, pj)
  return string.find(guia.grupo or "", "AoE", 1, true) ~= nil
    or (v ~= nil and string.find(v.grupo or "", "AoE", 1, true) ~= nil)
end

---------------------------------------------------------------------------------------------------
-- Guía por defecto.
---------------------------------------------------------------------------------------------------

-- Lote A (revisión 52, I1): las guías con mazmorras solo llegan al nivel 22 y del 22 al 60 todas son normales. Por eso la
-- guía por defecto se busca por pasos:
--   1. entre las de la versión pedida, la que contiene el nivel;
--   2. si no hay ninguna (y la versión no es la normal), entre las normales, la que contiene el nivel;
--   3. si tampoco, la anterior más cercana (la de mayor niveles[2] por debajo del nivel) de las dos, como el elfo de la
--      noche de nivel 12-13, que no tiene guía normal que lo contenga;
--   4. si no hay ninguna anterior (un nivel por debajo de todas), la de porDefecto de menor nivel, como antes.
-- Candidata es una guía de esos tipos que existe para el personaje, que no es de AoE y cuyo porDefecto, si lo trae, le
-- vale (false: nunca; así las de otras razas no salen aunque contengan el nivel).

-- Orden dentro de un mismo paso: primero las que tienen porDefecto, la de menor niveles[1], la de menor niveles[2] (la
-- más corta) y la de clave alfabética.
local function antes(a, b)
  if a.conPorDefecto ~= b.conPorDefecto then
    return a.conPorDefecto
  end
  local minA, maxA = niveles(a.guia)
  local minB, maxB = niveles(b.guia)
  if minA ~= minB then
    return minA < minB
  end
  if maxA ~= maxB then
    return maxA < maxB
  end
  return a.guia.clave < b.guia.clave
end

-- Orden del paso 3: la de mayor niveles[2] (la más cercana por debajo), luego la de la versión pedida, la de mayor
-- niveles[1] (la más corta) y el orden de antes().
local function masCercana(a, b)
  local minA, maxA = niveles(a.guia)
  local minB, maxB = niveles(b.guia)
  if maxA ~= maxB then
    return maxA > maxB
  end
  if a.deLaVersion ~= b.deLaVersion then
    return a.deLaVersion
  end
  if minA ~= minB then
    return minA > minB
  end
  return antes(a, b)
end

local function mejorDe(lista, criterio, ordenar)
  local mejor
  for _, c in ipairs(lista) do
    if criterio(c) and (not mejor or ordenar(c, mejor)) then
      mejor = c
    end
  end
  return mejor and mejor.guia.clave or nil
end

function Guias.porDefecto(pj, version)
  pj = pj or Personaje.actual()
  version = version or Ajustes.get("version")
  local nivel = pj.nivel or 1
  local candidatas = {}
  for _, clave in ipairs(Datos.claves()) do
    local guia = Datos.guia(clave)
    local tipo = guia.tipo
    if (tipo == version or tipo == "normal") and aplica(guia, pj) and not esAoE(guia, pj)
      and (guia.porDefecto == nil or Filtros.evaluar(guia.porDefecto, pj)) then
      local _, maximo = niveles(guia)
      candidatas[#candidatas + 1] = {guia = guia, deLaVersion = tipo == version, conPorDefecto = guia.porDefecto ~= nil,
        contiene = contieneNivel(guia, nivel), anterior = maximo < nivel}
    end
  end
  return mejorDe(candidatas, function(c)
    return c.deLaVersion and c.contiene
  end, antes) or mejorDe(candidatas, function(c)
    return c.guia.tipo == "normal" and c.contiene
  end, antes) or mejorDe(candidatas, function(c)
    return c.anterior
  end, masCercana) or mejorDe(candidatas, function(c)
    return c.conPorDefecto and c.deLaVersion
  end, antes) or mejorDe(candidatas, function(c)
    return c.conPorDefecto
  end, antes)
end

---------------------------------------------------------------------------------------------------
-- Cargar y listar.
---------------------------------------------------------------------------------------------------

-- T3, ronda 2: la vuelta es una pila corta por personaje, de MAX_VUELTAS como mucho. SnetForeverPJ.volverA es la cima
-- (un texto, como antes: lo guardado por la versión anterior vale como una pila de uno) y SnetForeverPJ.vueltas, las de
-- debajo, de la más antigua a la más reciente (nil si no hay). Una guía no se repite y las de rutas de pines no entran.
local MAX_VUELTAS = 3

local function vueltas()
  local v = SnetForeverPJ.vueltas
  if type(v) ~= "table" then
    v = {}
    SnetForeverPJ.vueltas = v
  end
  for k = #v, 1, -1 do
    if type(v[k]) ~= "string" then
      table.remove(v, k)
    end
  end
  return v
end

local function quitarDeVueltas(clave)
  if type(SnetForeverPJ.vueltas) ~= "table" then
    return
  end
  local v = vueltas()
  for k = #v, 1, -1 do
    if v[k] == clave then
      table.remove(v, k)
    end
  end
  if #v == 0 then
    SnetForeverPJ.vueltas = nil
  end
end

-- `clave` pasa a la cima; la de antes baja (sin repetidas y sin pasar del tope: se va la más antigua).
local function apilar(clave)
  quitarDeVueltas(clave)
  local cima = SnetForeverPJ.volverA
  if cima ~= nil and cima ~= clave then
    local v = vueltas()
    v[#v + 1] = cima
    while #v > MAX_VUELTAS - 1 do
      table.remove(v, 1)
    end
  end
  SnetForeverPJ.volverA = clave
end

-- Quita la cima: la siguiente de la pila pasa a ser volverA (o ninguna).
local function desapilar()
  local v = type(SnetForeverPJ.vueltas) == "table" and vueltas() or {}
  SnetForeverPJ.volverA = table.remove(v)
  if #v == 0 then
    SnetForeverPJ.vueltas = nil
  end
end

-- Las guías de la pila desde la cima: {volverA, la de debajo, ...}.
function Guias.vueltas()
  local salida = {SnetForeverPJ.volverA}
  local v = type(SnetForeverPJ.vueltas) == "table" and vueltas() or {}
  for k = #v, 1, -1 do
    salida[#salida + 1] = v[k]
  end
  return salida
end

-- Quita de la pila las que están encima de `clave` (las acabadas o sin nada que hacer que el botón salta).
function Guias.subirVuelta(clave)
  while SnetForeverPJ.volverA ~= nil and SnetForeverPJ.volverA ~= clave do
    desapilar()
  end
end

-- conservarVuelta: lo pasan Guias.abrirLateral (cargas de guías laterales) y Avisos.volver. Cualquier otra carga a mano
-- abandona la vuelta pendiente (la pila entera y lateral).
function Guias.cargar(clave, opciones, conservarVuelta)
  local guia = Datos.guia(clave)
  if not guia or not Motor.cargar(guia.clave, opciones) then
    return false
  end
  SnetForeverPJ.guia = guia.clave
  if not conservarVuelta and (SnetForeverPJ.volverA ~= nil or SnetForeverPJ.vueltas ~= nil) then
    SnetForeverPJ.volverA, SnetForeverPJ.lateral, SnetForeverPJ.vueltas = nil, nil, nil
  end
  return true
end

-- Lo que cargue el motor por su cuenta (la guía siguiente al acabar una) también es la guía del personaje; y llegar
-- a la guía a la que había que volver (Avisos) la desapila: la siguiente de la pila pasa a ser la de volver (y la
-- cargada, la lateral). Una guía cargada no se queda debajo en la pila.
SNF.escuchar("SNF_GUIA_CARGADA", function(clave)
  if type(SnetForeverPJ) ~= "table" then
    return
  end
  SnetForeverPJ.guia = clave
  quitarDeVueltas(clave)
  if SnetForeverPJ.volverA == clave then
    desapilar()
    SnetForeverPJ.lateral = SnetForeverPJ.volverA ~= nil and clave or nil
  end
end)

-- Guías por niveles[1], luego niveles[2] y clave.
local function porNiveles(a, b)
  local minA, maxA = niveles(a)
  local minB, maxB = niveles(b)
  if minA ~= minB then
    return minA < minB
  end
  if maxA ~= maxB then
    return maxA < maxB
  end
  return a.clave < b.clave
end

---------------------------------------------------------------------------------------------------
-- Guías laterales (cadenas de clase, profesiones y mazmorras): se abren sin perder la guía principal.
---------------------------------------------------------------------------------------------------

function Guias.esLateral(clave)
  local guia = clave ~= nil and Datos.guia(clave)
  return guia ~= nil and guia ~= false and tipoLateral(guia.tipo)
end

-- Ruling F3-31 (manda el juego, F3-30): una lateral sale si su filtro aplica y tiene algún paso para el personaje, o si
-- el juego dice que el personaje ya tiene alguna de sus misiones (en el registro o entregada), aunque la base no
-- incluya su raza. En ese segundo caso la facción, la clase y lo demás del filtro siguen mandando: solo se pasan por
-- alto los términos de raza. Lo calculado se memoriza por guía y personaje y se olvida al cambiar el registro.
local memoLaterales = {}

local function olvidarLaterales()
  memoLaterales = {}
end

for _, evento in ipairs({"QUEST_LOG_UPDATE", "QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED"}) do
  SNF.escuchar(evento, olvidarLaterales)
end

-- El personaje en texto (los campos que miran los filtros), para memorizar por personaje.
local function clavePJ(pj)
  return table.concat({tostring(pj.clase), tostring(pj.raza), tostring(pj.faccion), tostring(pj.nivel),
    tostring(pj.sexo), tostring(pj.idioma)}, "|")
end

local function conPasoVisible(guia, pj)
  for _, paso in ipairs(guia.pasos or {}) do
    if Filtros.evaluar(paso.filtro, pj) then
      return true
    end
  end
  return false
end

-- El filtro sin sus términos de raza (r:X y !r:X). nil/true/false se quedan como están.
local function sinRaza(filtro)
  if type(filtro) ~= "table" then
    return filtro
  end
  local salida = {}
  for i, grupo in ipairs(filtro) do
    local nuevo = {}
    for _, termino in ipairs(grupo) do
      local t = string.sub(termino, 1, 1) == "!" and string.sub(termino, 2) or termino
      if string.sub(t, 1, 2) ~= "r:" then
        nuevo[#nuevo + 1] = termino
      end
    end
    salida[i] = nuevo
  end
  return salida
end

-- ¿El juego dice que el personaje ya tiene alguna misión de la guía (en el registro o entregada)?
local function tieneAlgunaMision(guia)
  local Misiones = SNF.Misiones
  for _, paso in ipairs(guia.pasos or {}) do
    for _, el in ipairs(paso.elementos or {}) do
      local qs = el.qs or {el.q}
      for _, q in ipairs(qs) do
        if type(q) == "number" and (Misiones.enDiario(q) or Misiones.entregada(q)) then
          return true
        end
      end
    end
  end
  return false
end

local function lateralVisible(guia, pj)
  local deGuia = memoLaterales[guia.clave]
  if not deGuia then
    deGuia = {}
    memoLaterales[guia.clave] = deGuia
  end
  local k = clavePJ(pj)
  local visto = deGuia[k]
  if visto == nil then
    if aplica(guia, pj) and conPasoVisible(guia, pj) then
      visto = true
    else
      visto = faccionCumple(Guias.faccionDe(guia), pj) and Filtros.evaluar(sinRaza(guia.filtro), pj)
        and tieneAlgunaMision(guia)
    end
    deGuia[k] = visto and true or false
  end
  return deGuia[k]
end

function Guias.laterales(tipo, pj)
  local salida = {}
  if not Guias.LATERALES[tipo] then
    return salida
  end
  pj = pj or Personaje.actual()
  local guias = {}
  for _, clave in ipairs(Datos.claves()) do
    local guia = Datos.guia(clave)
    if guia.tipo == tipo and lateralVisible(guia, pj) then
      guias[#guias + 1] = {guia = guia, titulo = Guias.titulo(clave, pj) or clave}
    end
  end
  table.sort(guias, function(a, b)
    local minA = niveles(a.guia)
    local minB = niveles(b.guia)
    if minA ~= minB then
      return minA < minB
    end
    if a.titulo ~= b.titulo then
      return a.titulo < b.titulo
    end
    return a.guia.clave < b.guia.clave
  end)
  for i, e in ipairs(guias) do
    salida[i] = e.guia.clave
  end
  return salida
end

-- T3: la guía cargada si está a medias (cargada y sin acabar), o nil: {clave, titulo, n, total}. n es el número del paso
-- actual en la lista de la ventana (nil si ese paso no sale en ella) y total, el del último paso que sale.
function Guias.aMedias()
  local e = Motor.estado()
  if e.sinGuia or not e.clave or e.fin then
    return nil
  end
  local pv = Motor.paso(e.actual)
  local total, i = 0, 1
  while Motor.paso(i) do
    total = Motor.paso(i).numero or total
    i = i + 1
  end
  return {clave = e.clave, titulo = Guias.titulo(e.clave) or e.clave, n = pv and pv.numero or nil, total = total}
end

-- Carga la guía `clave` (cadena, profesión, mazmorra o la de un aviso) sin perder la principal. Se vuelve a la guía desde
-- la que se abrió, salvo que esa sea ya la lateral de otra apertura (entonces se sigue volviendo a la principal). T3: una
-- lateral sin acabar (también una ruta de zona de la IA) sí pasa a ser la guía a la que volver; la de una ruta de pines
-- no (se quita al dejarla). Un cambio de guía a mano ya borró volverA y lateral (Guias.cargar). Devuelve true si cargó la
-- guía.
function Guias.abrirLateral(clave)
  local e = Motor.estado()
  local anterior = e.clave or SnetForeverPJ.guia
  local deParadas = anterior ~= nil and SNF.Ruta ~= nil and SNF.Ruta.esGuiaDeParadas(anterior)
  local sinAcabar = e.clave ~= nil and not e.fin
  if not Guias.cargar(clave, nil, true) then
    return false
  end
  -- Ronda 2: la de antes se apila (la de una ruta de pines nunca).
  local vieneDeLateral = SnetForeverPJ.volverA ~= nil and anterior == SnetForeverPJ.lateral
  if anterior and not deParadas and (sinAcabar or not vieneDeLateral) and anterior ~= SnetForeverPJ.guia then
    apilar(anterior)
  end
  if SnetForeverPJ.volverA ~= nil then
    SnetForeverPJ.lateral = SnetForeverPJ.guia
  end
  return true
end

-- 16-nov (en el juego: «Volver a [H] Ciudad de Dalaran» salía siempre, sin X, y esa guía no tenía nada que hacer): la X de
-- «Volver a» olvida la vuelta (volverA y lateral; se guarda por personaje, así que tampoco vuelve tras un /reload). La
-- guía abierta se queda como está y pasa a ser la principal: con otra lateral, o con otra guía de vuelta, vuelve a salir.
function Guias.olvidarVuelta()
  -- Ronda 2: solo la cima; la siguiente de la pila (si hay) pasa a ser la de volver.
  desapilar()
  SnetForeverPJ.lateral = SnetForeverPJ.volverA ~= nil and SnetForeverPJ.guia or nil
end

-- 16-nov: ¿la guía `clave` tiene algún paso que se pueda hacer ahora? Se mira desde su paso guardado (o el primero; nada
-- si se guardó ya acabada) hasta el final, sin los pasos saltados ni los que no son para el personaje. Un paso cuenta si
-- tiene una misión que se puede hacer (aceptar una que no está entregada ni en el diario y que el juego daría; hacer o
-- entregar una que está en el diario) o, sin misiones, algo que no sea solo informativo ni una condición (un collect, un
-- manual...). Con el registro aún sin cargar, sí (no se esconde nada a ciegas). Se memoriza por guía y se olvida con
-- cualquier cambio del registro o de guía.
local memoAlgo = {}
local function olvidarAlgo()
  memoAlgo = {}
end
for _, evento in ipairs({"QUEST_LOG_UPDATE", "QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "SNF_GUIA_CARGADA",
  "SNF_PASOS_CAMBIADOS", "PLAYER_LEVEL_UP"}) do
  SNF.escuchar(evento, olvidarAlgo)
end

local CONDICION = {isOnQuest = true, isNotOnQuest = true, isQuestComplete = true, isQuestNotComplete = true,
  isQuestTurnedIn = true, isQuestAvailable = true}

local function saltadoEn(c, id)
  for _, s in ipairs(type(SnetForeverPJ.saltados) == "table" and SnetForeverPJ.saltados or {}) do
    if s.clave == c and s.id == id then
      return true
    end
  end
  return false
end

local function pasoConAlgo(paso)
  local Misiones = SNF.Misiones
  local informativos = SNF.Elementos and SNF.Elementos.INFORMATIVOS or {}
  local deMision, otro = false, false
  for _, el in ipairs(paso.elementos or {}) do
    local q = type(el.q) == "number" and el.q or nil
    if q and (el.t == "accept" or el.t == "complete" or el.t == "turnin") then
      deMision = true
      if not Misiones.entregada(q) then
        if el.t == "accept" then
          if not Misiones.enDiario(q) and not Misiones.noSePuedeCoger(q) then
            return true
          end
        elseif Misiones.enDiario(q) then
          return true
        end
      end
    elseif not informativos[el.t] and not CONDICION[el.t] and el.t ~= "mob" and el.t ~= "unitscan" then
      otro = true
    end
  end
  return otro and not deMision
end

function Guias.algoQueHacer(clave)
  if clave == nil then
    return false
  end
  local hecho = memoAlgo[clave]
  if hecho ~= nil then
    return hecho
  end
  local guia = Datos.guia(clave)
  if not guia then
    return false
  end
  if not SNF.Misiones.registroListo() then
    return true -- sin memorizar: en cuanto se cargue el registro se mira de verdad
  end
  local pj = Personaje.actual()
  local p = type(SnetForeverPJ.progreso) == "table" and type(SnetForeverPJ.progreso[clave]) == "table"
    and SnetForeverPJ.progreso[clave] or {}
  local pasos = guia.pasos or {}
  local inicio = 1
  for i, paso in ipairs(pasos) do
    if (p.id ~= nil and Motor.idPaso(paso, i) == p.id) or (p.id == nil and p.n ~= nil and tonumber(paso.n) == tonumber(p.n)) then
      inicio = p.pasado and i + 1 or i
      break
    end
  end
  hecho = false
  for i = inicio, #pasos do
    local paso = pasos[i]
    if Filtros.evaluar(paso.filtro, pj) and not saltadoEn(clave, Motor.idPaso(paso, i)) and pasoConAlgo(paso) then
      hecho = true
      break
    end
  end
  memoAlgo[clave] = hecho
  return hecho
end

function Guias.disponibles(pj)
  pj = pj or Personaje.actual()
  local porGrupo, grupos = {}, {}
  for _, clave in ipairs(Datos.claves()) do
    local guia = Datos.guia(clave)
    -- Las laterales (cadenas, mazmorras, profesiones) no salen en el selector principal: se abren con abrirLateral.
    if not tipoLateral(guia.tipo) and aplica(guia, pj) then
      local grupo = variante(guia, pj).grupo or guia.grupo
      if not porGrupo[grupo] then
        porGrupo[grupo] = {}
        grupos[#grupos + 1] = grupo
      end
      table.insert(porGrupo[grupo], guia)
    end
  end
  table.sort(grupos)
  local salida = {}
  for _, grupo in ipairs(grupos) do
    local lista = porGrupo[grupo]
    table.sort(lista, porNiveles)
    local claves = {}
    for i, guia in ipairs(lista) do
      claves[i] = guia.clave
    end
    salida[#salida + 1] = {grupo = grupo, claves = claves}
  end
  return salida
end

-- Lote A (revisión 52, I1): los grupos del selector de la ventana para la versión elegida. Con «normal», las guías
-- normales de cada grupo de disponibles. Con «mazmorras», las de mazmorras y, como las guías con mazmorras solo llegan a
-- un nivel (el 22 en los datos), también las normales de los tramos que no tienen versión con mazmorras: las que acaban
-- por encima del último nivel que cubre alguna guía con mazmorras del personaje. Esos grupos llevan normal = true para
-- que la ventana los distinga. Sin ninguna guía con mazmorras para el personaje, salen todas sus normales.
function Guias.delMenu(version, pj)
  pj = pj or Personaje.actual()
  local grupos = Guias.disponibles(pj)
  local hasta
  if version == "mazmorras" then
    hasta = 0
    for _, g in ipairs(grupos) do
      for _, clave in ipairs(g.claves) do
        local guia = Datos.guia(clave)
        if guia.tipo == "mazmorras" then
          local _, maximo = niveles(guia)
          hasta = math.max(hasta, maximo)
        end
      end
    end
  end
  local salida = {}
  for _, g in ipairs(grupos) do
    local propias, normales = {}, {}
    for _, clave in ipairs(g.claves) do
      local guia = Datos.guia(clave)
      -- «Mis guías» (tipo «propia») no tienen versión: salen con las dos.
      if guia.tipo == version or guia.tipo == "propia" then
        propias[#propias + 1] = clave
      elseif hasta and guia.tipo == "normal" and select(2, niveles(guia)) > hasta then
        normales[#normales + 1] = clave
      end
    end
    if #propias > 0 then
      salida[#salida + 1] = {grupo = g.grupo, claves = propias}
    end
    if #normales > 0 then
      salida[#salida + 1] = {grupo = g.grupo, claves = normales, normal = true}
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Versión (normal / mazmorras).
---------------------------------------------------------------------------------------------------

function Guias.otraVersion(clave)
  local guia = Datos.guia(clave)
  -- «Mis guías» no tienen otra versión: elegir «normal» o «mazmorras» no cambia de guía.
  if not guia or guia.tipo == "propia" then
    return nil
  end
  local pj = Personaje.actual()
  local otro = guia.tipo == "normal" and "mazmorras" or "normal"
  local faccion = Guias.faccionDe(guia)
  local mejor
  for _, c in ipairs(Datos.claves()) do
    local g = Datos.guia(c)
    if g.tipo == otro and g.nombre == guia.nombre and Guias.faccionDe(g) == faccion then
      local candidato = {guia = g, existe = aplica(g, pj), aoe = esAoE(g, pj)}
      -- Entre varias del mismo nombre: la que existe para el personaje, la que no es de AoE y la de clave alfabética.
      local gana = mejor == nil
      if not gana then
        if candidato.existe ~= mejor.existe then
          gana = candidato.existe
        elseif candidato.aoe ~= mejor.aoe then
          gana = not candidato.aoe
        else
          gana = candidato.guia.clave < mejor.guia.clave
        end
      end
      if gana then
        mejor = candidato
      end
    end
  end
  return mejor and mejor.guia.clave or nil
end

-- Un valor de la firma como texto: los números con %d (en fengari un decimal saldría «3.0»).
local function texto(valor)
  if valor == nil then
    return ""
  elseif type(valor) == "number" then
    return string.format("%d", math.floor(valor))
  end
  return tostring(valor)
end

-- La firma de un paso: la secuencia de t de sus elementos con su q, i y mapa. Sin elementos, nil.
local function firma(datos)
  local elementos = datos and datos.elementos
  if not elementos or #elementos == 0 then
    return nil
  end
  local partes = {}
  for i, e in ipairs(elementos) do
    partes[i] = texto(e.t) .. ":" .. texto(e.q) .. ":" .. texto(e.i) .. ":" .. texto(e.mapa)
  end
  return table.concat(partes, ",")
end

-- T3: la misma firma para los datos de un paso (la usa Ruta.aceptarGuia para conservar el progreso de la misma guía).
function Guias.firmaPaso(datos)
  return firma(datos)
end

function Guias.pasoEquivalente(claveDestino, pasoVivo)
  local destino = Datos.guia(claveDestino)
  local buscada = pasoVivo and firma(pasoVivo.datos)
  if not destino or not buscada then
    return nil
  end
  for _, paso in ipairs(destino.pasos) do
    if firma(paso) == buscada then
      return paso.n
    end
  end
  return nil
end

function Guias.cambiarVersion()
  local e = Motor.estado()
  local actual = e.clave or (type(SnetForeverPJ) == "table" and SnetForeverPJ.guia or nil)
  if actual and Guias.esLateral(actual) then
    return false
  end
  local otra = actual and Guias.otraVersion(actual)
  if not otra then
    return false
  end
  -- Pasada la última guía (esperando pegajosos) el paso vivo no existe: se toma el último.
  local pv = e.clave and (Motor.paso(e.actual) or Motor.paso(e.actual - 1))
  local n = pv and Guias.pasoEquivalente(otra, pv) or 1
  if not Guias.cargar(otra, {n = n}) then
    return false
  end
  Ajustes.set("version", Datos.guia(otra).tipo)
  return true
end

-- Elige la versión «normal» o «mazmorras»: si la guía cargada es de la otra, carga su equivalente (cambiarVersion), y
-- guarda el ajuste «version». La usan el menú de la ventana y el panel.
function Guias.elegirVersion(version)
  local clave = Motor.estado().clave or (type(SnetForeverPJ) == "table" and SnetForeverPJ.guia or nil)
  local guia = clave and Datos.guia(clave)
  if guia and guia.tipo ~= version then
    Guias.cambiarVersion()
  end
  if Ajustes.get("version") ~= version then
    Ajustes.set("version", version)
  end
end

-- Vuelve a la guía de su raza para la versión en uso (con el progreso que ya tuviera en ella).
function Guias.volverPorDefecto()
  local clave = Guias.porDefecto()
  return clave ~= nil and Guias.cargar(clave)
end
