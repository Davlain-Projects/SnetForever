-- SnetForever: aviso antes de cambiar de continente (lote D, D4: visto en el juego el 10-nov). Tras «18-22» su ruta sigue con
-- «22-24 Laderas de Trabalomas» (Reinos del Este) cuando en Kalimdor aún le quedan misiones de su nivel. El orden de sus
-- guías es suyo y no se toca: el addon solo avisa, en la cola de avisos de la ventana, «Aún te quedan N misiones de tu
-- nivel en Kalimdor», con tres opciones:
--   «Seguir la guía»        guarda el cruce (SnetForeverPJ.continente.cruce = {desde, hacia}, sobrevive a /reload) y no
--                           vuelve a avisar de él mientras el jugador siga en el continente de salida (ronda 1, I2: la
--                           guía siguiente ya no avisa en cada paso). Al cruzar se olvida: si vuelve y otra vez se le
--                           manda fuera, puede avisar de nuevo;
--   «Ver dónde»             abre una guía lateral de solo lectura, «Misiones que te quedan en Kalimdor»: una tarjeta por
--                           zona, de la que más tiene a la que menos, con un goto al sitio donde empieza la primera y sus
--                           misiones (accept). La flecha y los pines son los de siempre. Todo sale de la base;
--   «Pedir la ruta a la IA» solo con la app conectada: envía al chat la petición de la ruta de la zona con más misiones,
--                           que la app construye desde la base (rutaZona, tarea 16b).
--
-- Cuándo hay aviso (en una guía normal o con mazmorras, con el jugador en el mundo):
--   * un goto, waypoint, pin, line, loop o zone del paso actual va a un mapa de zona de otro continente (la instancia de
--     mundo del mapa, Coord.rect, no es la del jugador; los mapas de mazmorra no cuentan); o
--   * el paso actual es ya el último de la guía con algún punto y la guía siguiente (la que cargaría el motor) tiene la
--     mayoría de sus puntos en otro continente (la del autor empieza en Orgrimmar, pero casi todo es en Trabalomas);
--   * y en el continente del jugador quedan Continente.MINIMO (5) misiones o más que puede hacer.
-- Las que cuentan (Continente.contar): de su facción, raza y clase, ni entregadas ni en el registro, con requiredLevel ≤
-- su nivel (y sin requiredMaxLevel por debajo), que no se saltan por grises (motor/dificultad.lua) ni son rojas (5
-- niveles o más por encima: aunque se puedan coger, no son «de su nivel»), con sus previas
-- entregadas y sin una excluyente ya hecha o en el registro, que no son de mazmorra, de profesión, de reputación,
-- repetibles, de fiesta o de campo de batalla (zoneOrSort negativo que no es de clase) ni de las de relleno de la base
-- («REUSE», «NYI», «TEST»), y que empiezan en un PNJ de su bando (friendlyToFaction) o en un objeto con algún punto
-- en una zona de ese continente. Las que empiezan con un objeto de la bolsa no cuentan: no tienen sitio.
-- Caché: el recuento se guarda por disparo (guía y paso), continente y nivel: como mucho una pasada por la base por paso
-- (Continente.pasadas las cuenta). Cargar una guía (también volver de «Ver dónde») lo olvida.
--
-- Continente.aviso() -> {id, tipo = "continente", clave, n, inst, hacia, zona} | nil
-- Continente.texto(aviso) -> «Aún te quedan N misiones de tu nivel en <continente>»
-- Continente.seguir()       no vuelve a avisar de este cruce hasta que el jugador cruce.
-- Continente.verDonde() -> boolean   construye la guía lateral (SnetForeverPJ.continente.guia) y la abre.
-- Continente.pedirRuta() -> boolean  abre el chat y envía la petición (Chat.enviar).
-- Continente.contar(inst?) -> {n, zonas = {{mapa, punto = {mapa, x, y}, misiones = {q...}}...}}  sin caché.
-- Continente.CLAVE           la clave de la guía lateral («Restantes\continente»).
-- Emite SNF_AVISO_CONTINENTE cuando el jugador cambia de zona y el aviso cambia (la ventana se repinta).
local _, SNF = ...
local Continente = {}
SNF.Continente = Continente

local L = SNF.L
local Datos = SNF.Datos
local Filtros = SNF.Filtros
local Personaje = SNF.Personaje
local Motor = SNF.Motor

Continente.CLAVE = "Restantes\\continente"
Continente.MINIMO = 5
Continente.pasadas = 0

local MAX_ZONAS = 8 -- tarjetas de la guía lateral
local MAX_POR_ZONA = 10 -- misiones de cada tarjeta
local TIPOS_GUIA = {normal = true, mazmorras = true}
local DE_LUGAR = {["goto"] = true, waypoint = true, pin = true, line = true, loop = true, zone = true}
-- Enum.UIMapType: 3 zona, 5 «micro» y 6 «huérfano» son del mundo abierto; 4 es una mazmorra.
local MAPAS_DE_MUNDO = {[2] = true, [3] = true, [5] = true, [6] = true}
local SORT_CLASE = {[-61] = true, [-81] = true, [-82] = true, [-141] = true, [-161] = true, [-162] = true, [-261] = true,
  [-262] = true, [-263] = true}
local RELLENO = {"REUSE", "NYI", "TEST"}

local instDe = {} -- [mapa] = instancia de mundo, o false si no es un mapa del mundo abierto o el juego no la da
local cuentas = {} -- [clave del disparo|inst|nivel] = resultado de contar
local actual -- {firma, aviso} del último cálculo
local posicion = {} -- la del jugador (Coord.jugador la rellena, sin crear tablas)

---------------------------------------------------------------------------------------------------
-- Mapas y continentes
---------------------------------------------------------------------------------------------------

local function tipoDeMapa(mapa)
  local f = C_Map and rawget(C_Map, "GetMapInfo")
  if type(f) ~= "function" then
    return nil
  end
  local ok, info = pcall(f, mapa)
  return ok and type(info) == "table" and info.mapType or nil
end

-- La instancia de mundo de un mapa del mundo abierto (0 Reinos del Este, 1 Kalimdor…), o nil.
local function instDeMapa(mapa)
  if type(mapa) ~= "number" then
    return nil
  end
  local v = instDe[mapa]
  if v == nil then
    v = false
    local tipo = tipoDeMapa(mapa)
    if tipo == nil or MAPAS_DE_MUNDO[tipo] then
      local r = SNF.Coord.rect(mapa)
      v = r and r.inst or false
    end
    instDe[mapa] = v
  end
  return v or nil
end

local function instDelJugador()
  local yo = SNF.Coord.jugador(posicion)
  return yo and yo.inst or nil
end

-- Nombre del continente de una instancia: Kalimdor y Reinos del Este en el idioma del addon; otro, el del juego (el mapa
-- de tipo continente por encima del del jugador) o «#inst».
local function nombreContinente(inst)
  if inst == 1 then
    return L.t("CONTINENTE_KALIMDOR")
  elseif inst == 0 then
    return L.t("CONTINENTE_REINOS")
  end
  local f = C_Map and rawget(C_Map, "GetBestMapForUnit")
  local mapa = type(f) == "function" and f("player") or nil
  for _ = 1, 10 do
    if not mapa then
      break
    end
    local info = C_Map.GetMapInfo(mapa)
    if not info then
      break
    end
    if info.mapType == 2 and type(info.name) == "string" then
      return info.name
    end
    mapa = info.parentMapID ~= 0 and info.parentMapID or nil
  end
  return string.format("#%d", inst or 0)
end

-- Nombre de una zona en los dos idiomas: el de los datos (SNF_MISIONES.zonas.nombre) o el del juego.
local function nombreZona(mapa)
  local zonas = type(SNF_MISIONES.zonas) == "table" and SNF_MISIONES.zonas.nombre
  local propio = type(zonas) == "table" and zonas[mapa]
  if type(propio) == "table" then
    return {en = propio.en or propio.es, es = propio.es or propio.en}
  end
  local info = C_Map and C_Map.GetMapInfo and C_Map.GetMapInfo(mapa)
  local nombre = info and info.name or string.format("#%d", mapa)
  return {en = nombre, es = nombre}
end

---------------------------------------------------------------------------------------------------
-- Recuento
---------------------------------------------------------------------------------------------------

local function relleno(nombre)
  if type(nombre) ~= "string" or nombre == "" then
    return true
  end
  for _, palabra in ipairs(RELLENO) do
    if string.find(nombre, palabra, 1, true) then
      return true
    end
  end
  return false
end

local function previasHechas(m, Misiones)
  if type(m.preQuestSingle) == "table" and #m.preQuestSingle > 0 then
    local alguna = false
    for _, p in ipairs(m.preQuestSingle) do
      if Misiones.entregada(p) then
        alguna = true
        break
      end
    end
    if not alguna then
      return false
    end
  end
  for _, p in ipairs(type(m.preQuestGroup) == "table" and m.preQuestGroup or {}) do
    if not Misiones.entregada(p) then
      return false
    end
  end
  return true
end

local function excluidaPorOtra(m, Misiones)
  for _, otra in ipairs(type(m.exclusiveTo) == "table" and m.exclusiveTo or {}) do
    if Misiones.entregada(otra) or Misiones.enDiario(otra) then
      return true
    end
  end
  return false
end

local function vale(m, q, pj, nivel, Misiones)
  if relleno(m.name) or not Filtros.razaCumple(m.requiredRaces, pj) or not Filtros.claseCumple(m.requiredClasses, pj) then
    return false
  end
  if (tonumber(m.requiredLevel) or 0) > nivel then
    return false
  end
  local tope = tonumber(m.requiredMaxLevel) or 0
  if tope > 0 and nivel > tope then
    return false
  end
  local zona = m.zoneOrSort
  if type(zona) == "number" and ((zona < 0 and not SORT_CLASE[zona]) or (zona > 0 and Datos.esMazmorra(zona))) then
    return false
  end
  if (tonumber(m.specialFlags) or 0) % 2 == 1 then
    return false -- repetible
  end
  local skill, rep = m.requiredSkill, m.requiredMinRep
  if (type(skill) == "table" and (skill[1] or 0) ~= 0) or (type(rep) == "table" and (rep[1] or 0) ~= 0) then
    return false
  end
  -- Ni grises (las que se saltarían) ni rojas (5 niveles o más por encima: no son «de su nivel» aunque las pueda coger).
  local ql = tonumber(m.questLevel) or 0
  if ql > 0 and (SNF.Dificultad.seSalta(ql, nivel) or SNF.Dificultad.color(ql, nivel) == "rojo") then
    return false
  end
  if Misiones.entregada(q) or Misiones.enDiario(q) then
    return false
  end
  return previasHechas(m, Misiones) and not excluidaPorOtra(m, Misiones)
end

-- El primer punto (por mapa y en el orden de los datos) de los spawns que cae en una zona de ese continente, o nil.
local function puntoEn(spawns, inst)
  if type(spawns) ~= "table" then
    return nil
  end
  local mejor
  for mapa, puntos in pairs(spawns) do
    if type(mapa) == "number" and (mejor == nil or mapa < mejor) and instDeMapa(mapa) == inst
      and type(puntos) == "table" and type(puntos[1]) == "table" then
      mejor = mapa
    end
  end
  if not mejor then
    return nil
  end
  local p = spawns[mejor][1]
  return {mapa = mejor, x = p[1], y = p[2]}
end

-- Dónde empieza la misión en ese continente: un PNJ de su bando o un objeto. nil si no empieza allí.
local function inicioDe(m, inst, letra)
  local por = m.startedBy
  if type(por) ~= "table" then
    return nil
  end
  for _, id in ipairs(type(por[1]) == "table" and por[1] or {}) do
    local npc = SNF_MISIONES.npc[id]
    local bando = type(npc) == "table" and npc.friendlyToFaction
    if type(npc) == "table" and (type(bando) ~= "string" or letra == nil or string.find(bando, letra, 1, true)) then
      local p = puntoEn(npc.spawns, inst)
      if p then
        return p
      end
    end
  end
  for _, id in ipairs(type(por[2]) == "table" and por[2] or {}) do
    local objeto = SNF_MISIONES.object[id]
    local p = type(objeto) == "table" and puntoEn(objeto.spawns, inst)
    if p then
      return p
    end
  end
  return nil
end

function Continente.contar(inst)
  Continente.pasadas = Continente.pasadas + 1
  inst = inst or instDelJugador()
  local salida = {n = 0, zonas = {}}
  if inst == nil or type(SNF_MISIONES) ~= "table" or type(SNF_MISIONES.quest) ~= "table" then
    return salida
  end
  local Misiones = SNF.Misiones
  local pj = Personaje.actual()
  local nivel = pj.nivel or 1
  local letra = pj.faccion == "Horde" and "H" or pj.faccion == "Alliance" and "A" or nil
  local porMapa = {}
  for q, bruta in pairs(SNF_MISIONES.quest) do
    -- Lo barato primero, con los datos sin corregir; luego, con las correcciones de facción y clase.
    if type(bruta) == "table" and (tonumber(bruta.requiredLevel) or 0) <= nivel + 1 then
      local m = Datos.mision(q)
      if m and vale(m, q, pj, nivel, Misiones) then
        local p = inicioDe(m, inst, letra)
        if p then
          local z = porMapa[p.mapa]
          if not z then
            z = {mapa = p.mapa, punto = p, misiones = {}, niveles = {}}
            porMapa[p.mapa] = z
            salida.zonas[#salida.zonas + 1] = z
          end
          z.misiones[#z.misiones + 1] = q
          z.niveles[q] = tonumber(m.questLevel) or 0
          salida.n = salida.n + 1
        end
      end
    end
  end
  for _, z in ipairs(salida.zonas) do
    table.sort(z.misiones, function(a, b)
      if z.niveles[a] ~= z.niveles[b] then
        return z.niveles[a] < z.niveles[b]
      end
      return a < b
    end)
    -- El goto de la zona: donde empieza la primera (la de nivel más bajo).
    z.punto = inicioDe(Datos.mision(z.misiones[1]), inst, letra) or z.punto
    z.niveles = nil
  end
  table.sort(salida.zonas, function(a, b)
    if #a.misiones ~= #b.misiones then
      return #a.misiones > #b.misiones
    end
    return a.mapa < b.mapa
  end)
  return salida
end

---------------------------------------------------------------------------------------------------
-- Cuándo hay aviso
---------------------------------------------------------------------------------------------------

-- Llama a f(mapa) por cada mapa de un elemento de lugar; para en cuanto f devuelve algo y lo devuelve.
local function porMapas(datos, f)
  if not DE_LUGAR[datos.t] then
    return nil
  end
  if type(datos.mapa) == "number" then
    local r = f(datos.mapa)
    if r ~= nil then
      return r
    end
  end
  for _, p in ipairs(type(datos.puntos) == "table" and datos.puntos or {}) do
    if type(p) == "table" and type(p.mapa) == "number" then
      local r = f(p.mapa)
      if r ~= nil then
        return r
      end
    end
  end
  return nil
end

local function otroContinente(yo)
  return function(mapa)
    local i = instDeMapa(mapa)
    if i ~= nil and i ~= yo then
      return i
    end
    return nil
  end
end

-- La instancia de otro continente a la que lleva el paso, o nil.
local function destinoDePaso(pv, yo)
  local f = otroContinente(yo)
  for _, e in ipairs(pv.elementos or {}) do
    local i = porMapas(e.datos, f)
    if i then
      return i
    end
  end
  return nil
end

-- ¿El paso tiene algún punto?
local function conPunto(datos)
  for _, el in ipairs(datos.elementos or {}) do
    if porMapas(el, function()
      return true
    end) then
      return true
    end
  end
  return false
end

-- El último índice (de los pasos del motor) con algún punto. Memorizado por guía.
local ultimos = setmetatable({}, {__mode = "k"})
local function ultimoConPunto(guia)
  local u = ultimos[guia]
  if u == nil then
    u = 0
    local i = 1
    while Motor.paso(i) do
      if conPunto(Motor.paso(i).datos) then
        u = i
      end
      i = i + 1
    end
    ultimos[guia] = u
  end
  return u
end

-- La guía que cargaría el motor al acabar esta (la primera de siguientes con clave, filtro y guía).
local function siguienteDe(guia)
  local pj = Personaje.actual()
  for _, s in ipairs(guia.siguientes or {}) do
    if type(s) == "string" then
      s = {clave = s}
    end
    if type(s) == "table" and s.clave and Filtros.evaluar(s.filtro, pj) and Datos.guia(s.clave) then
      return Datos.guia(s.clave)
    end
  end
  return nil
end

-- La instancia con más puntos de una guía. Memorizada por guía.
local mayorias = setmetatable({}, {__mode = "k"})
local function continenteDeGuia(guia)
  local v = mayorias[guia]
  if v == nil then
    local cuenta = {}
    for _, paso in ipairs(guia.pasos or {}) do
      for _, el in ipairs(paso.elementos or {}) do
        porMapas(el, function(mapa)
          local i = instDeMapa(mapa)
          if i ~= nil then
            cuenta[i] = (cuenta[i] or 0) + 1
          end
        end)
      end
    end
    local mejor, n = false, 0
    for i, c in pairs(cuenta) do
      if c > n or (c == n and mejor and i < mejor) then
        mejor, n = i, c
      end
    end
    v = mejor
    mayorias[guia] = v
  end
  return v or nil
end

local function guardado()
  SNF.Guardado.preparar()
  local c = SnetForeverPJ.continente
  if type(c) ~= "table" then
    c = {}
    SnetForeverPJ.continente = c
  end
  return c
end

-- El disparo de ahora: clave (guía y paso, o guía y «siguiente») e instancia de destino; nil si no hay.
local function disparo(estado, yo)
  local guia = estado.clave and Datos.guia(estado.clave)
  if not guia or not TIPOS_GUIA[guia.tipo or "normal"] then
    return nil
  end
  local pv = Motor.paso(estado.actual)
  if not pv then
    return nil
  end
  local destino = destinoDePaso(pv, yo)
  if destino then
    return estado.clave .. "|" .. tostring(pv.id), destino
  end
  if estado.actual >= ultimoConPunto(guia) then
    local siguiente = siguienteDe(guia)
    local i = siguiente and continenteDeGuia(siguiente)
    if i ~= nil and i ~= yo then
      return estado.clave .. "|siguiente", i
    end
  end
  return nil
end

local function calcular()
  local estado = Motor.estado()
  local yo = instDelJugador()
  local nivel = Personaje.actual().nivel or 1
  local firma = table.concat({tostring(estado.clave), tostring(estado.actual), tostring(yo), tostring(nivel)}, "|")
  if actual and actual.firma == firma and not actual.sucio then
    return actual.aviso
  end
  actual = {firma = firma}
  if yo == nil or estado.fin or estado.sinGuia then
    return nil
  end
  -- Ronda 1 (I2): «Seguir la guía» guarda el cruce (de qué continente a cuál). Mientras el jugador siga en el de salida,
  -- ningún disparo hacia el mismo destino avisa; en cuanto está en otro continente, el cruce se olvida.
  local g = guardado()
  local cruce = type(g.cruce) == "table" and g.cruce or nil
  if cruce and cruce.desde ~= yo then
    g.cruce, cruce = nil, nil
  end
  local clave, destino = disparo(estado, yo)
  if not clave or (cruce and cruce.hacia == destino) then
    return nil
  end
  local claveCuenta = clave .. "|" .. tostring(yo) .. "|" .. tostring(nivel)
  local c = cuentas[claveCuenta]
  if not c then
    c = Continente.contar(yo)
    cuentas[claveCuenta] = c
  end
  if c.n < Continente.MINIMO then
    return nil
  end
  actual.aviso = {id = "continente:" .. clave, tipo = "continente", clave = clave, n = c.n, inst = yo, hacia = destino,
    zona = c.zonas[1] and c.zonas[1].mapa}
  actual.cuenta = c
  return actual.aviso
end

function Continente.aviso()
  return calcular()
end

function Continente.texto(aviso)
  return L.t("CONT_AVISO", math.floor(aviso.n or 0), nombreContinente(aviso.inst))
end

function Continente.seguir()
  local a = calcular()
  if not a then
    return
  end
  guardado().cruce = {desde = a.inst, hacia = a.hacia}
  actual.sucio = true
end

---------------------------------------------------------------------------------------------------
-- «Ver dónde» y «Pedir la ruta a la IA»
---------------------------------------------------------------------------------------------------

-- La guía lateral de solo lectura a partir del recuento (formato de las guías de la fase 3).
local function construirGuia(c, inst, nivel)
  local pasos = {}
  for k, z in ipairs(c.zonas) do
    if k > MAX_ZONAS then
      break
    end
    local nombre = nombreZona(z.mapa)
    local n = #z.misiones
    -- Ronda 1 (M3): si no caben todas, la tarjeta dice cuántas enseña («10 de 33 misiones»).
    local function nota(idioma)
      if n > MAX_POR_ZONA then
        return string.format(L.tablas[idioma].CONT_ZONA_PARTE, nombre[idioma], MAX_POR_ZONA, n)
      end
      return string.format(L.tablas[idioma].CONT_ZONA, nombre[idioma], n)
    end
    local elementos = {
      {t = "nota", linea = 0, texto = {es = nota("es"), en = nota("en")}},
      {t = "goto", mapa = z.punto.mapa, x = z.punto.x, y = z.punto.y, modo = "flecha", linea = 0},
    }
    for j, q in ipairs(z.misiones) do
      if j > MAX_POR_ZONA then
        break
      end
      elementos[#elementos + 1] = {t = "accept", q = q, linea = 0}
    end
    pasos[k] = {id = string.format("z%d", z.mapa), n = k, etiquetas = {}, requisitos = {}, linea = 0, elementos = elementos}
  end
  local function titulo(idioma)
    local nombre = inst == 1 and L.tablas[idioma].CONTINENTE_KALIMDOR or inst == 0 and L.tablas[idioma].CONTINENTE_REINOS
      or nombreContinente(inst)
    return string.format(L.tablas[idioma].CONT_TITULO, nombre)
  end
  return {
    clave = Continente.CLAVE, grupo = "Restantes", nombre = "continente", tipo = "restantes",
    titulo = {es = titulo("es"), en = titulo("en")}, niveles = {min = nivel, max = nivel}, siguientes = {},
    mazmorras = {}, fuente = {archivo = "continente", linea = 0}, pasos = pasos,
  }
end

function Continente.guia()
  local pj = rawget(_G, "SnetForeverPJ")
  local c = type(pj) == "table" and pj.continente
  local g = type(c) == "table" and c.guia
  return type(g) == "table" and g or nil
end

function Continente.verDonde()
  local a = calcular()
  if not a or not actual.cuenta then
    return false
  end
  guardado().guia = construirGuia(actual.cuenta, a.inst, Personaje.actual().nivel or 1)
  return SNF.Guias.abrirLateral(Continente.CLAVE)
end

function Continente.pedirRuta()
  local a = calcular()
  if not a or not a.zona or not SNF.Chat then
    return false
  end
  local texto = L.t("CONT_PEDIR_RUTA", L.de(nombreZona(a.zona)), a.zona)
  SNF.Chat.abrir()
  return SNF.Chat.enviar(texto)
end

---------------------------------------------------------------------------------------------------
-- Eventos
---------------------------------------------------------------------------------------------------

-- Cargar una guía (también volver de «Ver dónde» tras hacer misiones) vuelve a contar.
SNF.escuchar("SNF_GUIA_CARGADA", function()
  cuentas = {}
  if actual then
    actual.sucio = true
  end
end)

-- Al cambiar de zona o de continente, si el aviso cambia, la ventana se repinta.
local function alMoverse()
  local antes = actual and actual.aviso
  if calcular() ~= antes then
    SNF.emitir("SNF_AVISO_CONTINENTE")
  end
end
SNF.escuchar("PLAYER_ENTERING_WORLD", alMoverse)
SNF.escuchar("ZONE_CHANGED_NEW_AREA", alMoverse)
