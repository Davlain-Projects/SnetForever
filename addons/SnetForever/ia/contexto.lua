-- SnetForever: contexto del personaje para la IA (fase 4). Lo que el addon sabe del jugador y se manda en cada mensaje
-- (P2 del plan): personaje, lugar, registro de misiones, profesiones, guía cargada, guías a su nivel, cadenas de clase
-- pendientes y misiones de mazmorra. El inventario (`inv`) no lo pone este módulo sino Envio.
--
-- Manda el juego sobre la base de datos: QuestieDB Forever tiene máscaras de raza incompletas (las cadenas de druida
-- tauren son también de los Skyborne de la Horda). Una misión que el personaje tiene en el registro o ya entregó cuenta
-- como suya aunque la base diga otra cosa; las cadenas se completan con lo que dice el juego (Misiones.enDiario y
-- Misiones.entregada) y no se descartan por el término de raza de un paso.
--
-- Contexto.construir() -> ctx                  P2: {pj, lugar, registro, registroIncompleto?, prof, guia?, guias, cadenas,
--                                              mazmorras, talentos?, talentosFalta?}. registroIncompleto = true si el registro tiene una cabecera colapsada;
--                                              talentosFalta = true si no se pudieron leer los talentos.
-- Contexto.recortar(mensaje, maxBytes?) -> mensaje, cabe   Quita partes de mensaje.ctx, en el orden de P2, hasta que el JSON
--                                              codificado mida <= maxBytes (Contexto.MAX_JSON por defecto). Cada recorte
--                                              aplicado se apunta en ctx.recorte (los últimos, «registro.t»: los títulos, y «talentos»). Cambia el mensaje y lo devuelve; cabe es
--                                              false si, agotados los recortes, sigue por encima del tope (Envio lo rechaza).
-- Contexto.mazmorras(pj) -> {{area, nombre, misiones}}   hasta 4 mazmorras de 8 misiones, sin entregar y a su nivel.
-- Contexto.zonas() -> {{mapa, n}}             11-nov: hasta 6 zonas de su continente con más misiones de su nivel
--                                              (Continente.contar: sin mazmorras, ni entregadas ni en el registro). La IA
--                                              elige de aquí la zona de la ruta cuando le piden una ruta para subir de nivel.
-- Contexto.entradaCumple(e, pj) -> bool        ¿sirve la entrada del índice de mazmorras (SNF_MISIONES.porMazmorra[area].misiones)
--                                              al personaje por facción, clase y raza? (Fase 5: la usa mapa/openmap.lua.)
-- Contexto.indiceMazmorras() ->{[area] = {q...}} | nil  el índice de la fase 3 (SNF_MISIONES.porMazmorra) traducido
--                                              para este personaje; nil si los datos no lo traen. Sin él, mazmorras()
--                                              recorre SNF_MISIONES.quest.
-- Contexto.comercio() -> {casa, faccion, edadPrecios, grupo?, oportunidades} | nil   tarea 15: solo con la subasta abierta
--                                              (Comercio.activo()). casa = Precios.casaActual() (F6: la de la subasta
--                                              abierta; nil si no se conoce, o Precios.casa() sin casaActual); edadPrecios
--                                              = Precios.edad() solo si la app trae esa casa (F6, ronda 2: en la neutral,
--                                              nil si la foto cargada no trae su casa); F7: faccion = la de la
--                                              subasta (Precios.faccionActual: «Neutral» en la neutral), para que la app
--                                              sepa de qué subasta son los precios aunque no conozca su casa;
--                                              grupo = {clave, nombre} del grupo abierto en la ventana de comercio
--                                              (UIComercio.grupo(), si existe); oportunidades = hasta 20 {id, precio, pct,
--                                              ritmo?, fuente, edad?, mercancia? (F9p, ronda 1: true si la fila de la app
--                                              lo dice: la oportunidad puede quedarse fuera de los 60 objetos)} buenas según la regla del grupo abierto (o la
--                                              plantilla), por pct de menor a mayor. Fallo F1 (ronda 1): los objetos son
--                                              los de la app de la casa (SNF_PRECIOS) y los del escaneo, y el precio de
--                                              cada uno sale de la foto que elige SNF.Subasta.foto (la lista de Navegar, si
--                                              no la foto de la app y, solo sin ella, el escaneo), la misma que juzga la
--                                              regla. fuente = "lista" | "app" | "escaneo"; edad = segundos desde la foto
--                                              (el escaneo: desde que se leyó; nil si no se sabe): la IA nunca toma por de
--                                              ahora el mínimo de una réplica. Sin escaneo ni listas, con memoria hasta que
--                                              cambia la ranura, la casa, el grupo o su regla. Con un grupo abierto, solo
--                                              sus objetos. Protegida: si algo falla, nil.
-- Contexto.MAX_JSON = 20000, Contexto.PROFESIONES = {skillLine...}
local _, SNF = ...

local Contexto = {}
SNF.Contexto = Contexto

local floor = math.floor

Contexto.MAX_JSON = 20000
Contexto.PROFESIONES = {171, 164, 185, 333, 202, 129, 356, 182, 165, 186, 393, 197}

local MAX_REGISTRO = 40 -- misiones del registro que se mandan (el juego deja 25 en Classic y 35 en el motor moderno)
local MAX_OBJETIVOS = 8 -- objetivos por misión
local MAX_COMPLEMENTO = 60 -- misiones candidatas que se preguntan al juego si el registro está incompleto
local PASOS_GUIA = 15 -- pasos de la guía (el actual y los siguientes) de los que salen las misiones
local MAX_MISIONES = 20 -- misiones de la guía y de cada cadena
local MAX_GUIAS = 8
local MAX_MAZMORRAS = 4
local MAX_ZONAS = 6
local MAX_VUELOS = 40
local MAX_TITULO = 80 -- bytes del título de una misión del registro (lote E2)
local MAX_MISIONES_MAZMORRA = 8

-- Los elementos de guía que dicen qué misión toca.
local ELEMENTOS_MISION = {accept = true, turnin = true, dailyturnin = true, complete = true}

---------------------------------------------------------------------------------------------------
-- Ayudas
---------------------------------------------------------------------------------------------------

local esSecreto = SNF.API.esSecreto

-- Llama a f(...) protegida: si la API falta o falla, nil; un resultado secreto tampoco se da. Solo el primer valor.
local function seguro(f, ...)
  local ok, valor = pcall(f, ...)
  if not ok or esSecreto(valor) then
    return nil
  end
  return valor
end

-- El valor si es un número que se puede leer; si no, nil.
local function numero(valor)
  if esSecreto(valor) or type(valor) ~= "number" then
    return nil
  end
  return valor
end

-- Añade a `lista` las misiones de un elemento de guía (q o qs), sin repetir y hasta `max`. `omitir(q)` descarta.
local function sumarMisiones(el, lista, vistas, max, omitir)
  local qs = el.qs
  if type(qs) ~= "table" then
    qs = {el.q}
  end
  for _, q in ipairs(qs) do
    if #lista >= max then
      return
    end
    if type(q) == "number" and not vistas[q] and not (omitir and omitir(q)) then
      vistas[q] = true
      lista[#lista + 1] = q
    end
  end
end

-- El filtro sin sus términos de raza (r:X y !r:X): en las cadenas manda el juego, no la base. nil/true/false no cambian.
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

---------------------------------------------------------------------------------------------------
-- Personaje, lugar, registro y profesiones
---------------------------------------------------------------------------------------------------

local function personaje()
  local pj = SNF.Personaje.actual()
  local xp = numero(seguro(function() return UnitXP("player") end))
  local xpMax = numero(seguro(function() return UnitXPMax("player") end))
  local dinero = numero(seguro(function() return GetMoney() end))
  return {
    nivel = pj.nivel,
    clase = pj.clase,
    raza = pj.raza,
    faccion = pj.faccion,
    sexo = pj.sexo,
    xp = xp and floor(xp) or nil,
    xpMax = xpMax and floor(xpMax) or nil,
    dinero = dinero and floor(dinero) or nil,
  }
end

-- Mapa y posición (x, y en 0-100 con un decimal) del jugador; dentro de una instancia el juego no da ni uno ni otro.
-- Cada dato va protegido por separado: si una API falta o da un valor secreto, ese dato no sale y el resto sí.
local function lugar()
  local salida = {instancia = seguro(function() return IsInInstance() end) and true or false}
  local zona = seguro(function() return GetRealZoneText() end)
  if type(zona) == "string" and zona ~= "" then
    salida.zona = zona
  end
  local subzona = seguro(function() return GetSubZoneText() end)
  if type(subzona) == "string" and subzona ~= "" then
    salida.subzona = subzona
  end
  local mapa = numero(seguro(function() return C_Map.GetBestMapForUnit("player") end))
  if mapa then
    salida.mapa = mapa
    local ok, x, y = pcall(function()
      local vector = C_Map.GetPlayerMapPosition(mapa, "player")
      if vector then
        return vector:GetXY()
      end
    end)
    if ok and numero(x) and numero(y) then
      salida.x = SNF.U.redondear(x * 100, 1)
      salida.y = SNF.U.redondear(y * 100, 1)
    end
  end
  return salida
end

-- `texto` cortado a `max` bytes sin partir un carácter UTF-8.
local function cortar(texto, max)
  if #texto <= max then
    return texto
  end
  local fin = max
  while fin > 0 do
    local b = string.byte(texto, fin + 1)
    if b < 128 or b >= 192 then
      break
    end
    fin = fin - 1
  end
  return string.sub(texto, 1, fin)
end

-- {{q, c = 0|1, o = {{hecho, pedido}...}, t?}...} en el orden del registro, y `incompleto` (true si hay una cabecera
-- colapsada). Lote E2: t es el título de la misión como lo da el cliente (en el idioma del jugador; cortado a MAX_TITULO
-- bytes): la app lo usa como nombre de la misión.
-- Una misión completa lleva `o` vacío. Con una cabecera colapsada el juego puede no enumerar las misiones de debajo (no se
-- expanden: cambiaría la interfaz del jugador); se completa el registro con las `candidatas` (las de la guía, las de las
-- cadenas y las de mazmorra) que C_QuestLog.IsOnQuest da como presentes, hasta MAX_COMPLEMENTO comprobaciones.
local function registro(candidatas)
  local Misiones = SNF.Misiones
  local titulos = {}
  local lista, incompleto = SNF.API.registroMisiones(titulos)
  if incompleto then
    local en = {}
    for _, q in ipairs(lista) do
      en[q] = true
    end
    local comprobadas = 0
    for _, q in ipairs(candidatas or {}) do
      if comprobadas >= MAX_COMPLEMENTO then
        break
      end
      if not en[q] then
        comprobadas = comprobadas + 1
        if SNF.API.enRegistro(q) then
          en[q] = true
          lista[#lista + 1] = q
        end
      end
    end
  end
  local salida = {}
  for _, q in ipairs(lista) do
    if #salida >= MAX_REGISTRO then
      break
    end
    local completa = Misiones.completa(q)
    local objetivos = {}
    if not completa then
      for k = 1, MAX_OBJETIVOS do
        local o = Misiones.objetivo(q, k)
        if not o then
          break
        end
        objetivos[#objetivos + 1] = {floor(numero(o.hecho) or 0), floor(numero(o.pedido) or 0)}
      end
    end
    local titulo = titulos[q] or SNF.API.tituloMision(q)
    salida[#salida + 1] = {q = q, c = completa and 1 or 0, o = objetivos, t = titulo and cortar(titulo, MAX_TITULO) or nil}
  end
  return salida, incompleto
end

local function profesiones()
  local salida = {}
  for _, id in ipairs(Contexto.PROFESIONES) do
    local rango, maximo = SNF.API.habilidadPorId(id)
    if rango then
      salida[#salida + 1] = {id = id, r = floor(rango), m = floor(maximo or rango)}
    end
  end
  return salida
end

-- 13-nov (el autor: «si le pregunto si los puntos de talento que tengo dados están bien, ¿me sabe responder?»): los
-- talentos del personaje. Por árbol: nombre (el del cliente), puntos gastados y los talentos con algún punto {n = nombre,
-- f = fila, c = columna, r = rango, m = rango máximo}; y los puntos sin gastar.
-- 17-nov (TATI decía «no puedo ver tus talentos»): el cliente Forever (motor moderno, tipo de juego «camelot») no tiene
-- GetNumTalentTabs: sus talentos van en el sistema de rasgos (wow-ui-source, rama forever,
-- Blizzard_PlayerSpells/Camelot/ClassTalents/Blizzard_ClassTalentsFrame.lua). Primero se leen de ahí (talentosRasgos) y,
-- si no se puede, con la API de Classic (talentosClassic, las dos formas de GetTalentTabInfo). Sin ninguna, nil, y
-- Contexto.construir pone ctx.talentosFalta = true para que la IA lo sepa.
local MAX_ARBOLES = 4
local MAX_TALENTOS_ARBOL = 30
local MAX_NODOS = 400 -- nodos del árbol de rasgos que se miran (un árbol de Classic tiene unos 60)

-- Las funciones de un espacio de nombres del cliente (C_Traits...), o nil si no está.
local function espacioApi(nombre)
  local t = rawget(_G, nombre)
  if type(t) == "table" then
    return t
  end
  return nil
end

-- La fila (o columna) de cada posición: la posición menos la más pequeña, partida por el paso más corto entre dos
-- posiciones distintas, desde 1. Así una fila sin talentos no corre las de debajo.
local function aRejilla(posiciones)
  local distintas, vistas = {}, {}
  for _, p in ipairs(posiciones) do
    if not vistas[p] then
      vistas[p] = true
      distintas[#distintas + 1] = p
    end
  end
  table.sort(distintas)
  local paso
  for i = 2, #distintas do
    local d = distintas[i] - distintas[i - 1]
    if d > 0 and (not paso or d < paso) then
      paso = d
    end
  end
  local menor = distintas[1]
  return function(p)
    if not paso then
      return 1
    end
    return floor((p - menor) / paso + 0.5) + 1
  end
end

-- El nombre de un rasgo: overrideName si lo trae y, si no, el del hechizo.
local function nombreRasgo(T, config, entrada)
  local info = numero(entrada) and seguro(T.GetEntryInfo, config, entrada)
  local definicion = type(info) == "table" and numero(info.definitionID)
  local def = definicion and seguro(T.GetDefinitionInfo, definicion)
  if type(def) ~= "table" then
    return nil
  end
  local nombre = def.overrideName
  if esSecreto(nombre) or type(nombre) ~= "string" or nombre == "" then
    nombre = nil
    local hechizo = numero(def.spellID)
    local CS = espacioApi("C_Spell")
    if hechizo and CS then
      nombre = seguro(function() return CS.GetSpellName(hechizo) end)
    end
    if hechizo and type(nombre) ~= "string" then
      nombre = seguro(function() return GetSpellInfo(hechizo) end)
    end
  end
  if type(nombre) == "string" and nombre ~= "" then
    return cortar(nombre, 40)
  end
  return nil
end

-- La configuración de talentos activa: C_ClassTalents.GetActiveConfigID y, si no, la del grupo de especialización activo
-- (C_SpecializationInfo.GetCombatConfigIDForSpecGroup, la que usa la ventana de talentos de Forever).
local function configActiva()
  local CT, SI = espacioApi("C_ClassTalents"), espacioApi("C_SpecializationInfo")
  local config = CT and numero(seguro(function() return CT.GetActiveConfigID() end))
  if not config and SI then
    local grupo = numero(seguro(function() return SI.GetActiveSpecGroup() end))
      or numero(seguro(function() return GetActiveSpecGroup() end)) or 1
    config = numero(seguro(function() return SI.GetCombatConfigIDForSpecGroup(grupo) end))
  end
  return config
end

local function talentosRasgos()
  local T = espacioApi("C_Traits")
  if not T then
    return nil
  end
  local config = configActiva()
  local info = config and seguro(T.GetConfigInfo, config)
  if type(info) ~= "table" or type(info.treeIDs) ~= "table" then
    return nil
  end
  -- Los árboles de la ventana son grupos de nodos de los árboles de la configuración, en el orden de orderIndex.
  local arbolesRasgo, grupos = {}, {}
  for _, arbol in ipairs(info.treeIDs) do
    arbol = numero(arbol)
    if arbol then
      arbolesRasgo[#arbolesRasgo + 1] = arbol
      local lista = seguro(T.GetGroupDisplayInfoByTreeID, arbol)
      for _, g in ipairs(type(lista) == "table" and lista or {}) do
        if type(g) == "table" and numero(g.groupID) then
          grupos[#grupos + 1] = {id = g.groupID, orden = numero(g.orderIndex) or #grupos, nombre = g.displayName}
        end
      end
    end
  end
  if #arbolesRasgo == 0 or #grupos == 0 then
    return nil
  end
  table.sort(grupos, function(x, y) return x.orden < y.orden end)
  local ids, porGrupo, arboles = {}, {}, {}
  for i = 1, math.min(#grupos, MAX_ARBOLES) do
    local g = grupos[i]
    local nombre = g.nombre
    local salida = {a = type(nombre) == "string" and not esSecreto(nombre) and cortar(nombre, 40) or tostring(i), p = 0, t = {}}
    ids[i] = g.id
    porGrupo[g.id] = {salida = salida, nodos = {}, suma = 0}
    arboles[i] = salida
  end
  -- Los nodos de cada grupo (todos, para sacar las filas y las columnas de sus posiciones).
  local vistos = 0
  for _, arbol in ipairs(arbolesRasgo) do
    local nodos = seguro(T.GetTreeNodes, arbol)
    for _, id in ipairs(type(nodos) == "table" and nodos or {}) do
      if vistos >= MAX_NODOS then
        break
      end
      vistos = vistos + 1
      local n = numero(id) and seguro(T.GetNodeInfo, config, id)
      local g = type(n) == "table" and type(n.groupIDs) == "table" and porGrupo[n.groupIDs[1]]
      local x, y = g and numero(n.posX), g and numero(n.posY)
      if x and y then
        local rango = numero(n.activeRank) or numero(n.currentRank) or numero(n.ranksPurchased) or 0
        local entrada = type(n.activeEntry) == "table" and n.activeEntry.entryID or nil
        g.nodos[#g.nodos + 1] = {x = x, y = y, r = floor(rango), m = numero(n.maxRanks), entrada = entrada}
        g.suma = g.suma + floor(rango)
      end
    end
  end
  for _, g in pairs(porGrupo) do
    local xs, ys = {}, {}
    for i, n in ipairs(g.nodos) do
      xs[i], ys[i] = n.x, n.y
    end
    local columna, fila = aRejilla(xs), aRejilla(ys)
    for _, n in ipairs(g.nodos) do
      if n.r > 0 and #g.salida.t < MAX_TALENTOS_ARBOL then
        g.salida.t[#g.salida.t + 1] = {n = nombreRasgo(T, config, n.entrada), f = fila(n.y), c = columna(n.x), r = n.r,
          m = n.m and floor(n.m) or nil}
      end
    end
    g.salida.p = g.suma
  end
  -- Los puntos gastados de cada grupo, como los enseña la ventana (si no, la suma de los rangos).
  local gastos = seguro(T.GetGroupCurrencyInfo, config, ids)
  for _, c in ipairs(type(gastos) == "table" and gastos or {}) do
    local g = type(c) == "table" and porGrupo[c.traitNodeGroupID]
    local moneda = g and type(c.currencyInfos) == "table" and c.currencyInfos[1]
    local gastado = type(moneda) == "table" and numero(moneda.spent)
    if gastado then
      g.salida.p = floor(gastado)
    end
  end
  local libres
  local monedas = seguro(T.GetTreeCurrencyInfo, config, arbolesRasgo[1], false)
  if type(monedas) == "table" and type(monedas[1]) == "table" then
    libres = numero(monedas[1].quantity)
  end
  return {arboles = arboles, libres = libres and floor(libres) or nil}
end

local function talentosClassic()
  local nArboles = numero(seguro(function() return GetNumTalentTabs() end))
  if not nArboles or nArboles < 1 then
    return nil
  end
  local arboles = {}
  for arbol = 1, math.min(floor(nArboles), MAX_ARBOLES) do
    local ok, a, b, c, d, e = pcall(GetTalentTabInfo, arbol)
    if ok then
      local nombre, puntos
      if type(a) == "string" then
        nombre, puntos = a, c
      else
        nombre, puntos = b, e
      end
      local salida = {a = type(nombre) == "string" and cortar(nombre, 40) or tostring(arbol), p = floor(numero(puntos) or 0), t = {}}
      local nTalentos = numero(seguro(function() return GetNumTalents(arbol) end)) or 0
      for i = 1, math.min(floor(nTalentos), MAX_TALENTOS_ARBOL) do
        local bien, n, _, fila, columna, rango, maximo = pcall(GetTalentInfo, arbol, i)
        rango = bien and numero(rango) or nil
        if rango and rango > 0 then
          salida.t[#salida.t + 1] = {n = type(n) == "string" and cortar(n, 40) or nil, f = numero(fila), c = numero(columna),
            r = floor(rango), m = numero(maximo) and floor(maximo) or nil}
        end
      end
      arboles[#arboles + 1] = salida
    end
  end
  if #arboles == 0 then
    return nil
  end
  local libres = numero(seguro(function() return UnitCharacterPoints("player") end))
    or numero(seguro(function() return GetUnspentTalentPoints() end))
  return {arboles = arboles, libres = libres and floor(libres) or nil}
end

local function talentos()
  local ok, salida = pcall(talentosRasgos)
  if ok and salida then
    return salida
  end
  ok, salida = pcall(talentosClassic)
  if ok and salida then
    return salida
  end
  return nil
end

---------------------------------------------------------------------------------------------------
-- Guía cargada, guías disponibles y cadenas
---------------------------------------------------------------------------------------------------

-- {clave, titulo, n, paso, misiones, fin?, volverA?}: el paso actual y las misiones (hasta 20) de los 15 pasos que
-- empiezan en él. Con la guía acabada, fin = true y sin n ni paso. T3: volverA = {titulo, n?}, la guía de «Volver a».
local function guiaCargada(pj)
  local Motor = SNF.Motor
  local estado = Motor.estado()
  if estado.sinGuia or not estado.clave then
    return nil
  end
  local guia = {clave = estado.clave, titulo = SNF.Guias.titulo(estado.clave, pj) or estado.clave, misiones = {}}
  -- T1: con la guía acabada, el motor deja `actual` en el último paso, pero ya no es el paso en curso: se manda fin y
  -- ni paso ni n.
  local actual = not estado.fin and Motor.paso(estado.actual)
  if estado.fin then
    guia.fin = true
  elseif actual then
    guia.n = actual.numero -- lote C, ronda 1: el número de la lista de la ventana (nil si no sale en ella)
    guia.paso = SNF.Texto and SNF.Texto.resumenPaso(actual) or nil
  end
  -- T3: la guía a la que puede volver con «Volver a» y el paso por el que va (sin n si está acabada o no se sabe). Ronda
  -- 1 (Menor 2): solo si sale el botón (Avisos.botonVolver), para no mandarle a uno que no ve.
  local vuelta = SNF.Avisos and SNF.Avisos.botonVolver()
  if vuelta then
    guia.volverA = {titulo = SNF.Guias.titulo(vuelta, pj) or vuelta, n = SNF.Avisos.pasoVolver(vuelta)}
  end
  local pasos, vistos = {}, {}
  local function sumarPaso(i)
    if i and not vistos[i] and #pasos < PASOS_GUIA and Motor.paso(i) then
      vistos[i] = true
      pasos[#pasos + 1] = i
    end
  end
  if not estado.fin then
    sumarPaso(estado.actual)
  end
  for _, i in ipairs(estado.activos) do
    sumarPaso(i)
  end
  for _, i in ipairs(estado.siguientes) do
    sumarPaso(i)
  end
  local vistas = {}
  for _, i in ipairs(pasos) do
    for _, el in ipairs(Motor.paso(i).elementos) do
      if ELEMENTOS_MISION[el.datos.t] then
        sumarMisiones(el.datos, guia.misiones, vistas, MAX_MISIONES)
      end
    end
  end
  return guia
end

-- Las guías (no laterales) que valen para el personaje y cuyo tramo de niveles incluye el suyo: hasta 8.
local function guiasDisponibles(pj)
  local salida = {}
  local nivel = pj.nivel or 1
  for _, grupo in ipairs(SNF.Guias.disponibles(pj)) do
    for _, clave in ipairs(grupo.claves) do
      local guia = SNF.Datos.guia(clave)
      local minimo, maximo = SNF.Guias.niveles(guia)
      if minimo <= nivel and nivel <= maximo then
        if #salida >= MAX_GUIAS then
          return salida
        end
        salida[#salida + 1] = {clave = clave, titulo = SNF.Guias.titulo(clave, pj) or clave}
      end
    end
  end
  return salida
end

-- Misiones de una guía lateral (hasta 20, en el orden de la guía) que el juego no da por entregadas. Los términos de raza
-- de los pasos no cuentan: manda el juego.
local function misionesDeCadena(clave, pj)
  local salida = {}
  local guia = clave and SNF.Datos.guia(clave)
  if not guia then
    return salida
  end
  local vistas = {}
  local function entregada(q)
    return SNF.Misiones.entregada(q)
  end
  for _, paso in ipairs(guia.pasos or {}) do
    if SNF.Filtros.evaluar(sinRaza(paso.filtro), pj) then
      for _, el in ipairs(paso.elementos or {}) do
        if type(el) == "table" and ELEMENTOS_MISION[el.t] then
          sumarMisiones(el, salida, vistas, MAX_MISIONES, entregada)
        end
      end
    end
  end
  return salida
end

local function cadenas(pj)
  local salida = {}
  for _, aviso in ipairs(SNF.Avisos.pendientes()) do
    local guia = aviso.guia and SNF.Datos.guia(aviso.guia) and aviso.guia or nil
    salida[#salida + 1] = {id = aviso.id, texto = SNF.Avisos.texto(aviso), guia = guia, misiones = misionesDeCadena(guia, pj)}
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Mazmorras
---------------------------------------------------------------------------------------------------

-- ¿Contiene la lista (de texto) el valor? Una lista vacía o ausente admite a cualquiera.
local function admite(lista, valor)
  if type(lista) ~= "table" or #lista == 0 then
    return true
  end
  for _, v in ipairs(lista) do
    if v == valor then
      return true
    end
  end
  return false
end

-- Una entrada del índice de la fase 3 sirve al personaje por facción, clase y raza.
local function entradaCumple(e, pj)
  if e.faccion and pj.faccion and pj.faccion ~= "Neutral" and e.faccion ~= pj.faccion then
    return false
  end
  return admite(e.clases, string.upper(pj.clase or "")) and admite(e.razas, pj.raza)
end
Contexto.entradaCumple = entradaCumple -- también la usa la ficha de mazmorra de OpenMap (mapa/openmap.lua)

-- Traduce SNF_MISIONES.porMazmorra a {[area] = {q...}} para este personaje: misiones a su nivel (nivel de misión entre su
-- nivel − 3 y su nivel + 5, y requerido ≤ su nivel + 3), por nivel de misión. Una misión del registro entra aunque la
-- facción, la clase o la raza de la base digan otra cosa. nil si la base no trae el índice. Segundo valor: {[q] = nivel de
-- misión de la entrada}, con el que se ordena.
function Contexto.indiceMazmorras()
  local datos = rawget(_G, "SNF_MISIONES")
  local porMazmorra = type(datos) == "table" and datos.porMazmorra or nil
  if type(porMazmorra) ~= "table" or next(porMazmorra) == nil then
    return nil
  end
  local pj = SNF.Personaje.actual()
  local nivel = pj.nivel or 1
  local indice, niveles = {}, {}
  for area, zona in pairs(porMazmorra) do
    local entradas = {}
    for _, e in ipairs(type(zona) == "table" and zona.misiones or {}) do
      if type(e) == "table" and type(e.q) == "number" then
        local nivelMision = e.nivelMision or e.nivel or nivel
        local enNivel = nivelMision >= nivel - 3 and nivelMision <= nivel + 5 and (e.nivel or 0) <= nivel + 3
        if enNivel and (entradaCumple(e, pj) or SNF.Misiones.enDiario(e.q)) then
          entradas[#entradas + 1] = e
        end
      end
    end
    if #entradas > 0 then
      table.sort(entradas, function(a, b)
        local na, nb = a.nivelMision or a.nivel or 0, b.nivelMision or b.nivel or 0
        if na ~= nb then
          return na < nb
        end
        return a.q < b.q
      end)
      local lista = {}
      for i, e in ipairs(entradas) do
        lista[i] = e.q
        niveles[e.q] = e.nivelMision or e.nivel
      end
      indice[area] = lista
    end
  end
  return indice, niveles
end

local candidatasMemo = {} -- [nivel|raza|clase|facción] = {{q, area, nivelMision, cumple}...}
local candidatasOrigen -- la tabla SNF_MISIONES con la que se llenó la memoria

-- Sin índice: una pasada por SNF_MISIONES.quest (con memoria por nivel y personaje). Solo las misiones cuyo zoneOrSort es una
-- mazmorra pasan por Datos.mision (con las correcciones de facción y clase). `cumple` es lo que dicen raza y clase en la
-- base; la entrega y el registro se miran cada vez, porque cambian.
local function candidatas(pj)
  local datos = rawget(_G, "SNF_MISIONES")
  if type(datos) ~= "table" or type(datos.quest) ~= "table" or type(datos.mazmorra) ~= "table" then
    return {}
  end
  if candidatasOrigen ~= datos then
    candidatasMemo = {}
    candidatasOrigen = datos
  end
  local nivel = pj.nivel or 1
  local clave = table.concat({tostring(nivel), tostring(pj.raza), tostring(pj.clase), tostring(pj.faccion)}, "|")
  local hechas = candidatasMemo[clave]
  if hechas then
    return hechas
  end
  hechas = {}
  for q, bruta in pairs(datos.quest) do
    local zona = type(bruta) == "table" and bruta.zoneOrSort
    if type(zona) == "number" and SNF.Datos.esMazmorra(zona) then
      local mision = SNF.Datos.mision(q)
      local nivelMision = mision and mision.questLevel or 0
      if mision and nivelMision >= nivel - 3 and nivelMision <= nivel + 5 and (mision.requiredLevel or 0) <= nivel + 3 then
        hechas[#hechas + 1] = {
          q = q, area = zona, nivelMision = nivelMision,
          cumple = SNF.Filtros.razaCumple(mision.requiredRaces, pj) and SNF.Filtros.claseCumple(mision.requiredClasses, pj),
        }
      end
    end
  end
  candidatasMemo[clave] = hechas
  return hechas
end

function Contexto.mazmorras(pj)
  pj = pj or SNF.Personaje.actual()
  local Misiones = SNF.Misiones
  local porArea = {} -- [area] = {misiones = {q...}, nivelMin}
  local function sumar(area, q, nivelMision)
    local z = porArea[area]
    if not z then
      z = {area = area, misiones = {}, nivelMin = nivelMision}
      porArea[area] = z
    end
    if #z.misiones < MAX_MISIONES_MAZMORRA then
      z.misiones[#z.misiones + 1] = q
    end
    if nivelMision < z.nivelMin then
      z.nivelMin = nivelMision
    end
  end

  local indice, niveles = Contexto.indiceMazmorras()
  if indice then
    for area, lista in pairs(indice) do
      for _, q in ipairs(lista) do
        if not Misiones.entregada(q) then
          -- El nivel de la entrada del índice; un índice sin niveles (uno de pruebas) cae al de la misión.
          local nivel = niveles and niveles[q]
          if nivel == nil then
            local mision = SNF.Datos.mision(q)
            nivel = mision and mision.questLevel or 0
          end
          sumar(area, q, nivel)
        end
      end
    end
  else
    local lista = candidatas(pj)
    local ordenadas = {}
    for i, c in ipairs(lista) do
      ordenadas[i] = c
    end
    table.sort(ordenadas, function(a, b)
      if a.nivelMision ~= b.nivelMision then
        return a.nivelMision < b.nivelMision
      end
      return a.q < b.q
    end)
    for _, c in ipairs(ordenadas) do
      if not Misiones.entregada(c.q) and (c.cumple or Misiones.enDiario(c.q)) then
        sumar(c.area, c.q, c.nivelMision)
      end
    end
  end

  local zonas = {}
  for _, z in pairs(porArea) do
    zonas[#zonas + 1] = z
  end
  table.sort(zonas, function(a, b)
    if a.nivelMin ~= b.nivelMin then
      return a.nivelMin < b.nivelMin
    end
    return a.area < b.area
  end)
  local salida = {}
  for i = 1, math.min(#zonas, MAX_MAZMORRAS) do
    local z = zonas[i]
    salida[i] = {area = z.area, nombre = SNF.Datos.nombreZona(z.area), misiones = z.misiones}
  end
  return salida
end

function Contexto.zonas()
  local salida = {}
  local Continente = SNF.Continente
  if not Continente or type(Continente.contar) ~= "function" then
    return salida
  end
  local ok, c = pcall(Continente.contar)
  if not ok or type(c) ~= "table" then
    return salida
  end
  for i, z in ipairs(c.zonas or {}) do
    if i > MAX_ZONAS then
      break
    end
    salida[i] = {mapa = z.mapa, n = #z.misiones}
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Comercio (tarea 15)
---------------------------------------------------------------------------------------------------

local MAX_OPORTUNIDADES = 20

-- El grupo abierto en la ventana de comercio ({clave, nombre, objetos}) o nil. La ventana es de la tarea 12: si aún no
-- existe o no dice qué grupo tiene abierto, no hay grupo.
local function grupoAbierto()
  local ui = rawget(SNF, "UIComercio")
  local f = type(ui) == "table" and rawget(ui, "grupo")
  if type(f) ~= "function" then
    return nil
  end
  local ok, clave = pcall(f)
  if not ok or type(clave) ~= "string" or esSecreto(clave) then
    return nil
  end
  -- SNF.Grupos es del addon de comercio: sin él (o si aún no se ha cargado) no hay grupo.
  local grupos = rawget(SNF, "Grupos")
  if type(grupos) ~= "table" then
    return nil
  end
  for _, g in ipairs(grupos.lista()) do
    if g.clave == clave then
      return g
    end
  end
  return nil
end

-- Una oportunidad si el objeto es buena compra con la regla, mirada con la foto que elige SNF.Subasta.foto (F1): {id,
-- precio, pct, ritmo?, fuente, edad?, mercancia?, orden}; si no, nil (tampoco sin foto o sin ninguna que se pueda comprar).
local function oportunidad(item, casa, regla)
  local precio, cantidad, _, edad, p, fuente = SNF.Subasta.foto(item, casa)
  if type(precio) ~= "number" then
    return nil
  end
  local r = SNF.Reglas.evaluar(item, {precio = precio, cantidad = cantidad}, p, regla, "compra")
  if not r.buena then
    return nil
  end
  return {id = item, precio = floor(precio), pct = floor(r.pct + 0.5),
    ritmo = p and p.ritmo and SNF.U.redondear(p.ritmo, 2) or nil, fuente = fuente, edad = edad and floor(edad) or nil,
    mercancia = p and p.mercancia == true or nil, orden = r.pct}
end

-- La regla en texto (para la clave de la memoria de oportunidades).
local function claveRegla(regla)
  local partes = {}
  for _, campo in ipairs({"compraPct", "sniperPct", "ritmoMin", "valorMin", "maxUnidades", "maxOro"}) do
    partes[#partes + 1] = tostring(regla[campo])
  end
  return table.concat(partes, ",")
end

-- Memoria de las oportunidades sacadas solo de los precios de la app (sin escaneo ni listas de Navegar): no cambian hasta que
-- cambia la ranura de precios cargada (SNF_PRECIOS es otra tabla), la casa, el grupo abierto o su regla.
local memoria = {clave = nil, lista = nil}

-- ¿Hay alguna lista de Navegar para el tooltip (SNF.Busqueda.versionVivo() > 0)? Con ella, la memoria no vale.
local function versionListas()
  local B = rawget(SNF, "Busqueda")
  local f = type(B) == "table" and rawget(B, "versionVivo")
  local ok, v = false, nil
  if type(f) == "function" then
    ok, v = pcall(f)
  end
  return ok and type(v) == "number" and v or 0
end

-- Las oportunidades sin ordenar ni cortar (F1, ronda 1): cada objeto de la app de la casa (SNF_PRECIOS.casas[casa]) y del
-- escaneo, una vez, con la foto que elige SNF.Subasta.foto. Sin escaneo ni listas, con memoria.
local function candidatas(casa, regla, soloDe, claveGrupo)
  local lista = {}
  local datos = nil
  local Escaneo = rawget(SNF, "Escaneo")
  if type(Escaneo) == "table" and type(rawget(Escaneo, "datos")) == "function" then
    local ok, d = pcall(Escaneo.datos)
    if ok and type(d) == "table" and next(d) ~= nil then
      datos = d
    end
  end
  local precios = rawget(_G, "SNF_PRECIOS")
  local objetos = casa and type(precios) == "table" and type(precios.casas) == "table" and precios.casas[casa]
  if type(objetos) ~= "table" then
    objetos = nil
  end
  local listas = versionListas()
  local clave = nil
  if objetos and not datos and listas == 0 then
    clave = table.concat({tostring(precios), tostring(precios.generado), tostring(precios.seq), tostring(casa),
      tostring(claveGrupo), claveRegla(regla)}, "|")
    if memoria.clave == clave then
      return memoria.lista
    end
  end
  for item in pairs(objetos or {}) do
    if type(item) == "number" and (not soloDe or soloDe[item]) then
      lista[#lista + 1] = oportunidad(item, casa, regla)
    end
  end
  for item, vivo in pairs(datos or {}) do
    if type(item) == "number" and type(vivo) == "table" and not (objetos and objetos[item] ~= nil)
      and (not soloDe or soloDe[item]) then
      lista[#lista + 1] = oportunidad(item, casa, regla)
    end
  end
  if clave then
    memoria.clave, memoria.lista = clave, lista
  end
  return lista
end

-- F6, ronda 1: la casa de los precios de ahora: con la subasta abierta, la suya (Precios.casaActual; en la neutral, que la
-- app no trae, ninguna: ni oportunidades de la app ni la casa de la Horda en salida.casa); cerrada, la propia.
local function casaDeAhora()
  local P = SNF.Precios
  local f = rawget(P, "casaActual")
  if type(f) == "function" then
    return f()
  end
  return P.casa()
end

local function comercio()
  local casa = casaDeAhora()
  -- F6, ronda 2: la edad de los precios solo si la foto cargada trae esa casa; en la neutral (o con una casa que la app no
  -- trae) nil, para que la IA no diga «precios de hace X min» de una casa sin precios.
  local precios = rawget(_G, "SNF_PRECIOS")
  local conDatos = casa ~= nil and type(precios) == "table" and type(precios.casas) == "table"
    and type(precios.casas[casa]) == "table"
  local salida = {casa = casa, edadPrecios = conDatos and SNF.Precios.edad() or nil, oportunidades = {}}
  -- F7: de qué subasta son (la de la abierta o, cerrada, la del jugador): la app elige con eso la casa de sus precios.
  local faccionActual = rawget(SNF.Precios, "faccionActual")
  if type(faccionActual) == "function" then
    salida.faccion = faccionActual()
  end
  local grupo = grupoAbierto()
  local regla = SNF.Reglas.de(grupo and grupo.clave)
  local soloDe = nil
  if grupo then
    salida.grupo = {clave = grupo.clave, nombre = grupo.nombre}
    soloDe = {}
    for _, id in ipairs(type(grupo.objetos) == "table" and grupo.objetos or {}) do
      soloDe[id] = true
    end
  end
  -- Una copia ordenada: la lista de la memoria no se toca.
  local lista = {}
  for i, o in ipairs(candidatas(casa, regla, soloDe, grupo and grupo.clave)) do
    lista[i] = o
  end
  table.sort(lista, function(a, b)
    if a.orden ~= b.orden then
      return a.orden < b.orden
    end
    return a.id < b.id
  end)
  -- F1 (ronda 2): la edad de lo que sale de la app se mira ahora (la de la memoria se quedaría parada): es la de la foto
  -- cargada, la misma que edadPrecios.
  local edadApp = type(salida.edadPrecios) == "number" and floor(salida.edadPrecios) or nil
  for i = 1, math.min(#lista, MAX_OPORTUNIDADES) do
    local o = lista[i]
    salida.oportunidades[i] = {id = o.id, precio = o.precio, pct = o.pct, ritmo = o.ritmo, fuente = o.fuente,
      edad = o.fuente == "app" and edadApp or o.edad, mercancia = o.mercancia}
  end
  return salida
end

function Contexto.comercio()
  local Comercio = rawget(SNF, "Comercio")
  if type(Comercio) ~= "table" or not Comercio.activo() then
    return nil
  end
  local ok, salida = pcall(comercio)
  if not ok then
    return nil
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Contexto completo y recorte
---------------------------------------------------------------------------------------------------

-- Una sola pasada por contexto, cuando la app va a mandar un mensaje (no por fotograma). `registroIncompleto = true` avisa a la IA
-- de que el registro puede tener menos misiones de las que el jugador lleva (hay una cabecera colapsada).
function Contexto.construir()
  local pj = SNF.Personaje.actual()
  local ctx = {pj = personaje(), lugar = lugar()}
  ctx.prof = profesiones()
  ctx.talentos = talentos()
  -- 17-nov: sin talentos que leer (ninguna de las dos API), la IA lo sabe y no dice solo «no me han llegado».
  if not ctx.talentos then
    ctx.talentosFalta = true
  end
  -- 13-nov: la IA sabe que hay precios de subasta y cuándo se abrió la subasta por última vez. 14-nov: la fuente es siempre
  -- SnetForever (escaneo propio y precios de la app); nunca se nombra otro addon.
  if SNF.Subasta and SNF.Subasta.disponible() then
    ctx.subasta = {fuente = "SnetForever", vista = SNF.Subasta.vista()}
  end
  ctx.guia = guiaCargada(pj)
  ctx.guias = guiasDisponibles(pj)
  ctx.cadenas = cadenas(pj)
  ctx.mazmorras = Contexto.mazmorras(pj)
  ctx.zonas = Contexto.zonas()
  -- Tarea 15: con la subasta abierta, lo que la IA necesita del comercio (casa, edad de los precios, grupo abierto y las
  -- mejores oportunidades).
  ctx.comercio = Contexto.comercio()
  -- 11-nov: los vuelos que tiene aprendidos (apuntados al abrir un mapa de vuelos, motor/viaje.lua); sin apuntar, no va.
  local vuelos = SNF.Viaje and SNF.Viaje.nombresConocidos and SNF.Viaje.nombresConocidos(MAX_VUELOS) or {}
  if #vuelos > 0 then
    ctx.vuelos = vuelos
    -- Tarea 16: los mismos vuelos por id de PNJ (la app los casa con la base sin depender del idioma del nombre).
    local ids = SNF.Viaje.idsConocidos and SNF.Viaje.idsConocidos(MAX_VUELOS) or {}
    if #ids > 0 then
      ctx.vuelosIds = ids
    end
  end
  local candidatas, vistas = {}, {}
  local function sumar(lista)
    for _, q in ipairs(lista or {}) do
      if not vistas[q] then
        vistas[q] = true
        candidatas[#candidatas + 1] = q
      end
    end
  end
  sumar(ctx.guia and ctx.guia.misiones)
  for _, c in ipairs(ctx.cadenas) do
    sumar(c.misiones)
  end
  for _, z in ipairs(ctx.mazmorras) do
    sumar(z.misiones)
  end
  local reg, incompleto = registro(candidatas)
  ctx.registro = reg
  if incompleto then
    ctx.registroIncompleto = true
  end
  return ctx
end

-- Los recortes de P2, en orden. Cada uno quita algo de `ctx` y dice si quitó algo (si no, no se apunta).
local RECORTES = {
  {"inv.banco", function(ctx)
    if ctx.inv and ctx.inv.banco ~= nil then
      ctx.inv.banco = nil
      return true
    end
  end},
  {"inv.equipo.st", function(ctx)
    local quitado = false
    for _, eq in ipairs(ctx.inv and ctx.inv.equipo or {}) do
      if eq.st ~= nil or eq.tt ~= nil then
        eq.st, eq.tt = nil, nil
        quitado = true
      end
    end
    return quitado
  end},
  {"inv.bolsas.detalle", function(ctx)
    local quitado = false
    for i, o in ipairs(ctx.inv and ctx.inv.bolsas or {}) do
      local conDetalle = false
      for campo in pairs(o) do
        if campo ~= "id" and campo ~= "n" and campo ~= "l" and campo ~= "b" then
          conDetalle = true
        end
      end
      if conDetalle then
        ctx.inv.bolsas[i] = {id = o.id, n = o.n, l = o.l, b = o.b}
        quitado = true
      end
    end
    return quitado
  end},
  {"mazmorras", function(ctx)
    if ctx.mazmorras ~= nil then
      ctx.mazmorras = nil
      return true
    end
  end},
  -- Tarea 15: el comercio, justo antes que las zonas.
  {"comercio", function(ctx)
    if ctx.comercio ~= nil then
      ctx.comercio = nil
      return true
    end
  end},
  {"zonas", function(ctx)
    if ctx.zonas ~= nil then
      ctx.zonas = nil
      return true
    end
  end},
  {"vuelos", function(ctx)
    if ctx.vuelos ~= nil then
      ctx.vuelos = nil
      ctx.vuelosIds = nil
      return true
    end
  end},
  {"cadenas", function(ctx)
    if ctx.cadenas ~= nil then
      ctx.cadenas = nil
      return true
    end
  end},
  {"guias", function(ctx)
    if ctx.guias ~= nil then
      ctx.guias = nil
      return true
    end
  end},
  {"registro.o", function(ctx)
    local quitado = false
    for _, e in ipairs(ctx.registro or {}) do
      if e.o ~= nil then
        e.o = nil
        quitado = true
      end
    end
    return quitado
  end},
  {"inv", function(ctx)
    if ctx.inv ~= nil then
      ctx.inv = nil
      return true
    end
  end},
  -- Lote E2: los títulos del registro, lo último (ocupan poco y sin ellos la IA nombraría las misiones en inglés).
  {"registro.t", function(ctx)
    local quitado = false
    for _, e in ipairs(ctx.registro or {}) do
      if e.t ~= nil then
        e.t = nil
        quitado = true
      end
    end
    return quitado
  end},
  -- 17-nov: los talentos, lo último de todo: ocupan poco (unos 450 bytes con 23 puntos; con 51, unos 1.300) y sin ellos
  -- la IA no puede decir si sus puntos están bien.
  {"talentos", function(ctx)
    if ctx.talentos ~= nil then
      ctx.talentos = nil
      return true
    end
  end},
}

function Contexto.recortar(mensaje, maxBytes)
  maxBytes = maxBytes or Contexto.MAX_JSON
  local ctx = mensaje.ctx
  if #SNF.JSON.codificar(mensaje) <= maxBytes then
    return mensaje, true
  end
  if type(ctx) ~= "table" then
    return mensaje, false
  end
  for _, recorte in ipairs(RECORTES) do
    if recorte[2](ctx) then
      ctx.recorte = ctx.recorte or {}
      ctx.recorte[#ctx.recorte + 1] = recorte[1]
      if #SNF.JSON.codificar(mensaje) <= maxBytes then
        return mensaje, true
      end
    end
  end
  return mensaje, false
end
