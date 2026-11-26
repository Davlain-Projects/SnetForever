-- SnetForever: lista y detección de «Objetivos cercanos» (nuestra versión de «Active Targets» de RestedXP), sin nada
-- protegido (plano 6 §b.6 y §c.2-c.3). El marco con los botones es de ui/objetivos.lua; aquí solo está la lista de PNJ
-- que pide el paso activo, si se han visto (placa de nombre, ratón u objetivo), si están cerca (por los puntos de
-- aparición de la base de datos) o lejos, y la marca propia sobre su placa.
--
-- Cercanos.lista() -> entradas {clave, tipo, paso, ids, nombres, nombreMacro, estado, unidad}, como mucho 12, en el orden
--     de la guía con primero unitscan, luego mob y luego target. La tabla es la VIVA de este archivo (solo se lee).
--       clave       nombre en inglés en minúsculas, sin «*» delante (las repetidas se juntan en una entrada).
--       tipo        "unitscan" | "mob" | "target" (el de mayor prioridad si el PNJ sale con varios).
--       paso        n del primer paso activo que lo pide (el «paso 12» de la ayuda).
--       ids         id del dato o, si no hay, todos los de SNF_MISIONES.npc con ese nombre (Datos.idsPNJPorNombres).
--                   Si el mismo nombre sale con id en un elemento y sin él en otro, los dos. Para «cerca» y la macro solo
--                   cuentan los que trae la guía (idsGuia) cuando los hay (lote B, B3).
--       nombres     el inglés y los españoles de esos id (con las mayúsculas de los datos).
--       nombreMacro lo que va en «/targetexact»: el UnitName de una placa visible con el GUID del id (luego el del
--                   objetivo o el ratón con ese GUID, luego el último visto); si no, el nombre del idioma del CLIENTE
--                   (Datos.nombrePNJCliente) y, sin id, el nombre inglés de la guía.
--       estado      "visto" | "cerca" | "lejos".
--       unidad      con qué se ve ahora: "target", el token de su placa o "mouseover" (10 s); nil si no se ve.
-- Cercanos.ordenada() -> lista para pintar: primero los vistos, luego los cercanos y luego los lejos (dentro de cada
--     grupo, el orden de lista()); sin los lejos si el ajuste objetivos.soloCercanos es true.
-- Cercanos.reconocer(unidad) -> entrada|nil   qué entrada es esa unidad ("target", "mouseover", "nameplateN"): primero
--     por el id de su GUID de criatura (no depende del idioma) y luego por nombre. Nunca compara un valor secreto
--     sin issecretvalue y cada comparación va protegida con pcall. Descarta jugadores, mascotas y enemigos muertos.
-- Cercanos.marcaPlaca(unidad, entrada) -> marco|nil   pone encima de la placa de la unidad un icono de 16x16 (espadas
--     para un enemigo, bocadillo para un amistoso), en un marco hijo de la base de la placa (BOTTOM -> TOP, 0, 2).
--     nil si el ajuste objetivos.marcaPlaca está apagado, si se está en una instancia, si no hay C_NamePlate o si el
--     marco base está prohibido (IsForbidden).
-- Cercanos.marcas = {[unidad] = marco}   las marcas puestas ahora.
-- Cercanos.relojes() -> distancia, placas   si están en marcha el reloj de 1 s y el recorrido de placas de 0,5 s (para las pruebas).
--
-- T2: una entrega a medias (Elementos.entregaAMedias) pide como «mob» a los PNJ de sus objetivos sin terminar
-- (Elementos.faltanDe, solo los que casan con la base: Misiones.casaConBase), con el id y el nombre inglés de la base
-- (Datos.sitiosObjetivo; como mucho MAX_PNJ_OBJETIVO por objetivo). Al terminar un objetivo o completar la misión, el
-- extra del turnin cambia, llega SNF_PASOS_CAMBIADOS y salen de la lista.
--
-- Eventos del juego: PLAYER_ENTERING_WORLD (en una instancia quita las marcas), NAME_PLATE_UNIT_ADDED/REMOVED,
-- UPDATE_MOUSEOVER_UNIT, PLAYER_TARGET_CHANGED y la charla con un PNJ (GOSSIP_SHOW, QUEST_GREETING, QUEST_PROGRESS, QUEST_COMPLETE, MERCHANT_SHOW: un PNJ amistoso hablado sale de la lista,
-- por id, hasta que cambian los pasos activos). La lista se rehace con SNF_PASOS_CAMBIADOS solo si cambian las entradas
-- que pide la guía (firma de clave, tipo, paso e id). Estos eventos solo se escuchan mientras la lista tiene entradas.
-- Con el ajuste objetivos.activo = false no hay entradas (ni relojes ni eventos) hasta que se vuelve a encender.
-- Un solo marco con OnUpdate (sin C_Timer.NewTicker), mostrado solo mientras haya entradas: cada 1 s mide la distancia
-- por la base (cerca = algún punto de aparición a 50 yardas o menos) y, si el cliente no conoce NAME_PLATE_UNIT_ADDED,
-- cada 0,5 s recorre C_NamePlate.GetNamePlates().
-- Emite SNF_OBJETIVOS_CAMBIADOS cuando cambia la lista o el estado, la unidad o el nombre de una entrada.
-- Solo se LEE (UnitGUID, UnitName, GetCVar...): ni fija objetivos, ni marca, ni llama a nada protegido.
local _, SNF = ...
local Cercanos = {}
SNF.Cercanos = Cercanos

local Datos = SNF.Datos
local Motor = SNF.Motor
local Coord = SNF.Coord
local Ajustes = SNF.Ajustes

local MAXIMO = 12
local MAX_PNJ_OBJETIVO = 5 -- T2: PNJ de cada objetivo de una entrega a medias (los que sueltan un objeto pueden ser muchos)
local DISTANCIA_CERCA = 50 -- yardas
local INTERVALO_DISTANCIA = 1 -- segundos
local INTERVALO_PLACAS = 0.5 -- segundos
local SEGUNDOS_RATON = 10
local TAMANO_MARCA = 16
local ICONO_ESPADAS = "Interface\\GossipFrame\\BattleMasterGossipIcon"
local ICONO_BOCADILLO = "Interface\\WorldMap\\ChatBubble_64Grey"
local PATRON_ID = "^%a+%-%d+%-%d+%-%d+%-%d+%-(%d+)%-"
local PRIORIDAD = {unitscan = 1, mob = 2, target = 3}
local RANGO_ESTADO = {visto = 1, cerca = 2, lejos = 3}
local OBJETIVO_Y_RATON = {"target", "mouseover"} -- (lote B) fija: nombreMacroDe corre cada segundo y no deja tablas
local EVENTOS_CHARLA = {"GOSSIP_SHOW", "QUEST_GREETING", "QUEST_PROGRESS", "QUEST_COMPLETE", "MERCHANT_SHOW"}

local entradas -- la lista actual (nil hasta la primera vez)
local porId = {} -- [id de PNJ] = entrada
local porNombre = {} -- [nombre en minúsculas] = entrada
local porPlaca = {} -- [token de placa] = entrada que se ve en ella
local memoria = {} -- [clave] = {ratonHasta, nombreVisto}: lo que se recuerda al rehacer la lista
local hablados = {} -- [clave] = true: PNJ con los que ya se habló mientras no cambien los pasos activos
local firmaPasos = "" -- los pasos activos de la última vez (para olvidar a los hablados)
local reloj = CreateFrame("Frame") -- con OnUpdate, solo mostrado mientras haya entradas
reloj:Hide()
local acumuladoDistancia, acumuladoPlacas = 0, 0
local sinEventoPlacas = false -- el cliente no conoce NAME_PLATE_UNIT_ADDED: se recorren las placas cada 0,5 s
local temporizadorRaton = false
local marcasPorBase = setmetatable({}, {__mode = "k"}) -- [base de placa] = marco de la marca (se reutiliza)

Cercanos.marcas = {}

---------------------------------------------------------------------------------------------------
-- Valores secretos y APIs que pueden faltar
---------------------------------------------------------------------------------------------------

local function esSecreto(valor)
  local f = rawget(_G, "issecretvalue")
  if type(f) ~= "function" then
    return false
  end
  local ok, secreto = pcall(f, valor)
  return ok and secreto == true
end

-- Texto utilizable (ni nil, ni secreto, ni de otro tipo), o nil.
local function textoSeguro(valor)
  if esSecreto(valor) or type(valor) ~= "string" then -- primero esSecreto: nada se compara antes
    return nil
  end
  return valor
end

-- Función global del juego, o nil (sin error si falta).
local function api(nombre)
  local f = rawget(_G, nombre)
  return type(f) == "function" and f or nil
end

-- Función f del espacio de nombres `espacio` (p. ej. C_NamePlate.GetNamePlates), o nil.
local function funcionDe(espacio, nombre)
  local t = rawget(_G, espacio)
  if type(t) ~= "table" then
    return nil
  end
  local f = rawget(t, nombre)
  return type(f) == "function" and f or nil
end

-- Resultado de f(...) protegido con pcall (nil si falla o no existe).
local function llamar(f, ...)
  if f == nil then
    return nil
  end
  local ok, valor = pcall(f, ...)
  if ok then
    return valor
  end
  return nil
end

-- Resultado booleano de una API del juego: true o false, o nil si da un valor secreto (no se puede comparar) o falla.
-- Sin la función, false. Es la única forma de leer UnitIsPlayer, UnitIsUnit, UnitIsDead, IsInInstance, IsForbidden...
local function esVerdad(valor)
  return valor == true
end

local function booleano(f, ...)
  if f == nil then
    return false
  end
  local ok, valor = pcall(f, ...)
  if not ok or esSecreto(valor) then
    return nil
  end
  -- Sin issecretvalue un secreto no se reconoce: comparar da error en el cliente y se trata como «no se sabe».
  local comparado, verdad = pcall(esVerdad, valor)
  if not comparado then
    return nil
  end
  return verdad
end

-- Ante la duda (secreto o error) se cuenta como instancia: sin marcas.
local function enInstancia()
  return booleano(api("IsInInstance")) ~= false
end

local function eventoPlacasValido()
  local valida = funcionDe("C_EventUtils", "IsEventValid")
  if valida == nil then
    return true
  end
  return booleano(valida, "NAME_PLATE_UNIT_ADDED") ~= false
end

---------------------------------------------------------------------------------------------------
-- Reconocer una unidad
---------------------------------------------------------------------------------------------------

-- Id de PNJ del GUID de una criatura o vehículo (6.º campo), o nil.
local function idDeGuid(guid)
  if type(guid) ~= "string" then
    return nil
  end
  local tipo = string.match(guid, "^(%a+)%-")
  if tipo ~= "Creature" and tipo ~= "Vehicle" then
    return nil
  end
  return tonumber(string.match(guid, PATRON_ID))
end

function Cercanos.reconocer(unidad)
  if type(unidad) ~= "string" or entradas == nil then
    return nil
  end
  local entrada = nil
  -- 1-2. Por el id del GUID.
  local guid = llamar(api("UnitGUID"), unidad)
  if not esSecreto(guid) and guid ~= nil then
    local ok, id = pcall(idDeGuid, guid)
    if ok and id then
      entrada = porId[id]
    end
  end
  -- 3. Por nombre (si el nombre es secreto o no existe, la unidad no cuenta).
  local nombre = textoSeguro(llamar(api("UnitName"), unidad))
  if entrada == nil and nombre then
    local ok, minuscula = pcall(string.lower, nombre)
    if ok then
      entrada = porNombre[minuscula]
    end
  end
  if entrada == nil then
    return nil
  end
  -- 4. Fuera jugadores, mascotas y enemigos muertos. Si no se puede saber si es jugador o mascota (valor secreto), la
  -- unidad no cuenta; si no se puede saber si está muerta, sí cuenta (mejor no ocultar un objetivo vivo).
  if booleano(api("UnitIsPlayer"), unidad) ~= false or booleano(api("UnitIsUnit"), unidad, "pet") ~= false then
    return nil
  end
  if entrada.tipo ~= "target" and booleano(api("UnitIsDead"), unidad) == true then
    return nil
  end
  if nombre and entrada.nombreVisto ~= nombre then
    entrada.nombreVisto = nombre
    memoria[entrada.clave].nombreVisto = nombre
  end
  return entrada
end

---------------------------------------------------------------------------------------------------
-- Marca sobre la placa
---------------------------------------------------------------------------------------------------

local function quitarMarca(unidad)
  local marco = Cercanos.marcas[unidad]
  if marco then
    Cercanos.marcas[unidad] = nil
    pcall(marco.Hide, marco)
  end
end

function Cercanos.marcaPlaca(unidad, entrada)
  if type(unidad) ~= "string" or type(entrada) ~= "table" then
    return nil
  end
  if Ajustes.get("objetivos.marcaPlaca") == false or enInstancia() then
    quitarMarca(unidad)
    return nil
  end
  local base = llamar(funcionDe("C_NamePlate", "GetNamePlateForUnit"), unidad)
  if type(base) ~= "table" then
    return nil
  end
  if booleano(base.IsForbidden, base) ~= false then
    return nil
  end
  local marco = marcasPorBase[base]
  if marco == nil then
    local creado, nuevo = pcall(CreateFrame, "Frame", nil, base)
    if not creado then
      return nil
    end
    marco = nuevo
    marco:SetSize(TAMANO_MARCA, TAMANO_MARCA)
    marco:SetPoint("BOTTOM", base, "TOP", 0, 2)
    marco.icono = marco:CreateTexture(nil, "OVERLAY")
    marco.icono:SetAllPoints(marco)
    marcasPorBase[base] = marco
  end
  marco.icono:SetTexture(entrada.tipo == "target" and ICONO_BOCADILLO or ICONO_ESPADAS)
  marco:Show()
  -- Si el token apuntaba a otra base (sin NAME_PLATE_UNIT_REMOVED), su marca vieja no se queda huérfana.
  local anterior = Cercanos.marcas[unidad]
  if anterior and anterior ~= marco then
    anterior:Hide()
  end
  Cercanos.marcas[unidad] = marco
  return marco
end

---------------------------------------------------------------------------------------------------
-- Estado de cada entrada
---------------------------------------------------------------------------------------------------

-- ¿Están los datos de PNJ (SNF_MISIONES.npc)? Sin ellos no hay id, ni nombres españoles, ni puntos de aparición.
local function hayDatosPNJ()
  return type(SNF_MISIONES) == "table" and type(SNF_MISIONES.npc) == "table"
end

local function hayEntradas()
  return entradas ~= nil and #entradas > 0
end

-- Estado y unidad con los que se ve ahora la entrada.
local function estadoDe(e, ahora)
  if e.esObjetivo then
    return "visto", "target"
  end
  if e.placas[1] then
    return "visto", e.placas[1]
  end
  if e.ratonHasta and e.ratonHasta > ahora then
    return "visto", "mouseover"
  end
  if e.cerca then
    return "cerca", nil
  end
  return "lejos", nil
end

-- Lote B (B3): los id que valen para la entrada. Los de la guía (el conversor ya los pone cuando la base deja decidirlo)
-- si los hay; si no, todos los de la base con ese nombre. Así un homónimo sin id en otro paso no mete sus puntos.
local function idsPropios(e)
  return #e.idsGuia > 0 and e.idsGuia or e.ids
end

-- El UnitName de la unidad si su GUID es de uno de los id propios de la entrada; nil si no (o si algo es secreto).
local function nombreSiEsSuyo(e, unidad)
  local guid = llamar(api("UnitGUID"), unidad)
  -- Primero esSecreto: en el cliente, comparar un secreto (también con nil) da error (ronda 1, Important 1).
  if esSecreto(guid) or guid == nil then
    return nil
  end
  local ok, id = pcall(idDeGuid, guid)
  if not (ok and id) then
    return nil
  end
  for _, propio in ipairs(idsPropios(e)) do
    if propio == id then
      return textoSeguro(llamar(api("UnitName"), unidad))
    end
  end
  return nil
end

-- Lo que va en «/targetexact»: el UnitName de una placa visible cuyo GUID es del id (lote B, B3), luego el del objetivo
-- o el ratón con ese GUID, luego el último nombre visto, el nombre del idioma del cliente y, sin id, el inglés de la guía.
local function nombreMacroDe(e)
  for _, unidad in ipairs(e.placas) do
    local nombre = nombreSiEsSuyo(e, unidad)
    if nombre then
      return nombre
    end
  end
  for _, unidad in ipairs(OBJETIVO_Y_RATON) do
    local nombre = nombreSiEsSuyo(e, unidad)
    if nombre then
      return nombre
    end
  end
  if e.nombreVisto then
    return e.nombreVisto
  end
  local id = idsPropios(e)[1]
  return id and hayDatosPNJ() and Datos.nombrePNJCliente(id) or e.nombreIngles
end

local function emitir()
  SNF.emitir("SNF_OBJETIVOS_CAMBIADOS")
end

-- Recalcula estado, unidad y nombre de la macro de todas las entradas; devuelve si algo cambió (y emite si `emite`).
local function revisar(emite)
  local cambio = false
  if entradas then
    local ahora = GetTime()
    for _, e in ipairs(entradas) do
      local estado, unidad = estadoDe(e, ahora)
      local nombre = nombreMacroDe(e)
      if estado ~= e.estado or unidad ~= e.unidad or nombre ~= e.nombreMacro then
        e.estado, e.unidad, e.nombreMacro = estado, unidad, nombre
        cambio = true
      end
    end
  end
  if cambio and emite then
    emitir()
  end
  return cambio
end

-- Mientras algún ratón siga vigente, vuelve a revisar cuando caduque.
local function vigilarRaton()
  if temporizadorRaton or entradas == nil then
    return
  end
  local ahora = GetTime()
  local mas = nil
  for _, e in ipairs(entradas) do
    if e.ratonHasta and e.ratonHasta > ahora and (mas == nil or e.ratonHasta > mas) then
      mas = e.ratonHasta
    end
  end
  if mas == nil then
    return
  end
  temporizadorRaton = true
  C_Timer.After(mas - ahora + 0.05, function()
    temporizadorRaton = false
    revisar(true)
    vigilarRaton()
  end)
end

---------------------------------------------------------------------------------------------------
-- Placas
---------------------------------------------------------------------------------------------------

-- `conservarMarca`: la marca se queda (quien llama la va a poner de nuevo enseguida: así no parpadea).
local function quitarPlaca(unidad, conservarMarca)
  local e = porPlaca[unidad]
  porPlaca[unidad] = nil
  if not conservarMarca then
    quitarMarca(unidad)
  end
  if e then
    for i = #e.placas, 1, -1 do
      if e.placas[i] == unidad then
        table.remove(e.placas, i)
      end
    end
  end
end

local function anadirPlaca(unidad, e)
  porPlaca[unidad] = e
  e.placas[#e.placas + 1] = unidad
  Cercanos.marcaPlaca(unidad, e)
end

-- Pone al día las placas con lo que dice C_NamePlate.GetNamePlates() (al cambiar de paso y, sin evento de placas, cada
-- 0,5 s). Devuelve si hay API de placas.
local function barrerPlacas()
  local listar = funcionDe("C_NamePlate", "GetNamePlates")
  if listar == nil then
    return false
  end
  local placas = llamar(listar)
  local vistas = {}
  if type(placas) == "table" then
    for _, placa in ipairs(placas) do
      local unidad = type(placa) == "table" and textoSeguro(placa.namePlateUnitToken)
      if unidad then
        vistas[unidad] = true
        local nueva = Cercanos.reconocer(unidad) or nil
        if porPlaca[unidad] ~= nueva then
          quitarPlaca(unidad, nueva ~= nil)
          if nueva then
            anadirPlaca(unidad, nueva)
          end
        end
      end
    end
  end
  for unidad in pairs(porPlaca) do
    if not vistas[unidad] then
      quitarPlaca(unidad)
    end
  end
  return true
end

local function alAnadirPlaca(unidad)
  if entradas == nil or textoSeguro(unidad) == nil then
    return
  end
  local e = Cercanos.reconocer(unidad)
  quitarPlaca(unidad, e ~= nil)
  if e then
    anadirPlaca(unidad, e)
    revisar(true)
  end
end

local function alQuitarPlaca(unidad)
  if textoSeguro(unidad) == nil or porPlaca[unidad] == nil then
    return
  end
  quitarPlaca(unidad)
  revisar(true)
end

---------------------------------------------------------------------------------------------------
-- Distancia por la base de datos
---------------------------------------------------------------------------------------------------

-- Puntos de aparición de la entrada en yardas ({wx, wy, inst}); se piden una vez. Con id en la guía, solo los de ese id
-- (lote B, B3); sin él, los de todos los PNJ de la base con ese nombre.
local function puntosDe(e)
  if e.puntos == nil then
    e.puntos = {}
    for _, id in ipairs(hayDatosPNJ() and idsPropios(e) or {}) do
      for _, punto in ipairs(Datos.puntosPNJ(id)) do
        local w = Coord.aMundo(punto)
        if w then
          e.puntos[#e.puntos + 1] = w
        end
      end
    end
  end
  return e.puntos
end

local function estaCerca(e, jugador)
  for _, w in ipairs(puntosDe(e)) do
    if w.inst == nil or jugador.inst == nil or w.inst == jugador.inst then
      if Coord.vector(jugador, w) <= DISTANCIA_CERCA then
        return true
      end
    end
  end
  return false
end

local function revisarDistancias(emite)
  if not hayEntradas() then
    return
  end
  local jugador = Coord.jugador() -- nil dentro de instancias: sin estado «cerca»
  for _, e in ipairs(entradas) do
    e.cerca = jugador ~= nil and estaCerca(e, jugador)
    memoria[e.clave].cerca = e.cerca
  end
  revisar(emite)
end

---------------------------------------------------------------------------------------------------
-- Rehacer la lista
---------------------------------------------------------------------------------------------------

-- Elemento vivo del padre (`padre` es el índice desde 0 en datos.elementos), o nil.
local function padreDe(pv, e)
  local indice = tonumber(e.datos.padre)
  local datos = indice and pv.datos.elementos and pv.datos.elementos[indice + 1]
  if datos then
    for _, otro in ipairs(pv.elementos) do
      if otro.datos == datos then
        return otro
      end
    end
  end
  return nil
end

local function nombreInicial(nombre)
  if type(nombre) ~= "string" then
    return nil
  end
  local limpio = string.gsub(nombre, "^%*+", "")
  if limpio == "" then
    return nil
  end
  return limpio
end

local function anadirUnico(lista, valor)
  for _, v in ipairs(lista) do
    if v == valor then
      return
    end
  end
  lista[#lista + 1] = valor
end

-- Una entrada con los id y los nombres de un PNJ de la guía.
local function nuevaEntrada(clave, tipo, paso, nombre, orden)
  return {
    clave = clave, tipo = tipo, paso = paso, ids = {}, idsGuia = {}, nombres = {}, nombreIngles = nombre, orden = orden,
    placas = {}, esObjetivo = false, cerca = false, estado = "lejos", minusculas = {},
  }
end

local function anadirNombre(e, nombre)
  if type(nombre) == "string" and nombre ~= "" then
    anadirUnico(e.nombres, nombre)
    e.minusculas[string.lower(nombre)] = true
  end
end

-- T2: los PNJ de los objetivos sin terminar de una entrega a medias, como los npcs de un mob: {nombre inglés, id}.
local function pnjDeObjetivos(el)
  local q = el.datos.q
  local npcs = {}
  for _, k in ipairs(SNF.Elementos.faltanDe(el) or {}) do
    local sitios = SNF.Misiones.casaConBase(q, k) and Datos.sitiosObjetivo(q, k, true) or nil
    local n = 0
    for _, id in ipairs(sitios and sitios.npcs or {}) do
      local base = hayDatosPNJ() and SNF_MISIONES.npc[id] or nil
      local nombre = type(base) == "table" and base.name or nil
      if type(nombre) == "string" and nombre ~= "" and n < MAX_PNJ_OBJETIVO then
        n = n + 1
        npcs[#npcs + 1] = {nombre = nombre, id = id}
      end
    end
  end
  return npcs
end

-- Los PNJ pedidos por los pasos activos, ya juntos por clave y sin los hablados.
local function recogerEntradas()
  local porClave, orden = {}, {}
  local contador = 0
  local function anadir(pv, t, npcs)
    for _, npc in ipairs(npcs) do
      local nombre = type(npc) == "table" and nombreInicial(npc.nombre) or nil
      if nombre and not hablados[string.lower(nombre)] then
        local clave = string.lower(nombre)
        local e = porClave[clave]
        if e == nil then
          contador = contador + 1
          e = nuevaEntrada(clave, t, pv.numero, nombre, contador) -- lote C: el número de la lista
          porClave[clave] = e
          orden[#orden + 1] = e
        elseif PRIORIDAD[t] < PRIORIDAD[e.tipo] then
          e.tipo = t
        end
        if npc.id ~= nil then
          anadirUnico(e.ids, npc.id)
          anadirUnico(e.idsGuia, npc.id)
        else
          e.buscarIds = true -- sus id se buscan por nombre cuando ya se sabe qué entradas se quedan
        end
      end
    end
  end
  for _, i in ipairs(Motor.activos()) do
    local pv = Motor.paso(i)
    if pv then
      for _, el in ipairs(pv.elementos) do
        local datos = el.datos
        if PRIORIDAD[datos.t] and type(datos.npcs) == "table" then
          local padre = datos.padre ~= nil and padreDe(pv, el) or nil
          if not (padre and padre.resultado == "hecho") then
            anadir(pv, datos.t, datos.npcs)
          end
        elseif SNF.Elementos.entregaAMedias(el) then
          anadir(pv, "mob", pnjDeObjetivos(el))
        end
      end
    end
  end
  return orden
end

local function firmaDePasos()
  local partes = {}
  for _, i in ipairs(Motor.activos()) do
    local pv = Motor.paso(i)
    partes[#partes + 1] = pv and tostring(pv.id) or "?"
  end
  return table.concat(partes, "|")
end

-- Los dos temporizadores (1 s la distancia y, sin evento de placas, 0,5 s el recorrido de placas) son un solo marco con
-- OnUpdate que solo está mostrado mientras haya entradas. No usa C_Timer.NewTicker: no hay que pararlo al cambiar de
-- mundo (un marco oculto por la pantalla de carga no corre) y no suma temporizadores al motor y la navegación.
local function alPasarTiempo(_, dt)
  acumuladoDistancia = acumuladoDistancia + dt
  if acumuladoDistancia >= INTERVALO_DISTANCIA - 0.001 then
    acumuladoDistancia = 0
    local ok, err = pcall(revisarDistancias, true)
    if not ok then
      geterrorhandler()(err)
    end
  end
  if sinEventoPlacas then
    acumuladoPlacas = acumuladoPlacas + dt
    if acumuladoPlacas >= INTERVALO_PLACAS - 0.001 then
      acumuladoPlacas = 0
      local ok, hecho = pcall(barrerPlacas)
      if ok and hecho then
        revisar(true)
      end
    end
  end
end

reloj:SetScript("OnUpdate", alPasarTiempo)

local function ponerRelojes()
  if not hayEntradas() then
    reloj:Hide()
    sinEventoPlacas = false
    return
  end
  sinEventoPlacas = not eventoPlacasValido() and funcionDe("C_NamePlate", "GetNamePlates") ~= nil
  if not reloj:IsShown() then
    acumuladoDistancia, acumuladoPlacas = 0, 0
    reloj:Show()
  end
end

local activarEventos -- se define al final: pone o quita los oyentes de los eventos del juego

-- Con «Objetivos cercanos» apagado (objetivos.activo = false) no se detecta nada: como si no hubiera entradas.
local function detectar()
  return Ajustes.get("objetivos.activo") ~= false
end

-- Las entradas que pide la guía ahora, ordenadas (unitscan, mob, target y el orden de la guía); vacía si está apagado.
local function entradasPedidas()
  if not detectar() then
    return {}
  end
  local todas = recogerEntradas()
  table.sort(todas, function(a, b)
    if PRIORIDAD[a.tipo] ~= PRIORIDAD[b.tipo] then
      return PRIORIDAD[a.tipo] < PRIORIDAD[b.tipo]
    end
    return a.orden < b.orden
  end)
  return todas
end

-- Firma de las entradas que se quedan (clave, tipo, paso e id de la guía): si no cambia, la lista no se rehace.
local function firmaDe(todas)
  local partes = {hayDatosPNJ() and "d" or "-"}
  for i = 1, math.min(#todas, MAXIMO) do
    local e = todas[i]
    local ids = {}
    for k, id in ipairs(e.ids) do
      ids[k] = string.format("%.0f", id)
    end
    partes[#partes + 1] = table.concat({e.clave, e.tipo, string.format("%.0f", e.paso or 0), table.concat(ids, ","),
      e.buscarIds and "*" or ""}, "\1")
  end
  return table.concat(partes, "\2")
end

local firmaEntradas -- la de la última lista hecha (nil: hay que hacerla)

-- Los hablados se olvidan al cambiar de pasos activos.
local function olvidarHablados()
  local firma = firmaDePasos()
  if firma ~= firmaPasos then
    firmaPasos = firma
    hablados = {}
  end
end

-- Rehace la lista entera (con `pedidas`, las entradas ya recogidas por entradasPedidas()).
local function reconstruir(pedidas)
  olvidarHablados()
  local todas = pedidas or entradasPedidas()
  firmaEntradas = firmaDe(todas)
  porPlaca = {} -- las marcas puestas se quedan: barrerPlacas solo cambia las que cambian
  entradas, porId, porNombre = {}, {}, {}

  local quedan, porBuscar = math.min(#todas, MAXIMO), {}
  for i = 1, quedan do
    if todas[i].buscarIds then
      porBuscar[#porBuscar + 1] = todas[i].clave
    end
  end
  local datosPNJ = hayDatosPNJ()
  local encontrados = #porBuscar > 0 and datosPNJ and Datos.idsPNJPorNombres(porBuscar) or nil
  for i = 1, quedan do
    local e = todas[i]
    if e.buscarIds and encontrados then
      for _, id in ipairs(encontrados[e.clave] or {}) do
        anadirUnico(e.ids, id)
      end
    end
    anadirNombre(e, e.nombreIngles)
    for _, id in ipairs(e.ids) do
      if datosPNJ then
        local base = SNF_MISIONES.npc[id]
        anadirNombre(e, type(base) == "table" and base.name)
        local es = type(SNF_MISIONES.es) == "table" and type(SNF_MISIONES.es.npc) == "table" and SNF_MISIONES.es.npc[id]
        anadirNombre(e, type(es) == "table" and es.name)
      end
      porId[id] = porId[id] or e
    end
    for minuscula in pairs(e.minusculas) do
      porNombre[minuscula] = porNombre[minuscula] or e
    end
    local recuerdo = memoria[e.clave]
    if recuerdo == nil then
      recuerdo = {}
      memoria[e.clave] = recuerdo
    end
    e.ratonHasta, e.nombreVisto, e.cerca = recuerdo.ratonHasta, recuerdo.nombreVisto, recuerdo.cerca == true
    entradas[#entradas + 1] = e
  end

  -- Lo que se ve ahora: las placas y el objetivo (la distancia se mide en el siguiente segundo).
  if hayEntradas() then
    barrerPlacas()
    local e = Cercanos.reconocer("target")
    if e then
      e.esObjetivo = true
    end
  end
  -- Las marcas que quedan sin placa de la lista (o sin API de placas) se quitan; las demás no se tocan.
  for unidad in pairs(Cercanos.marcas) do
    if porPlaca[unidad] == nil then
      quitarMarca(unidad)
    end
  end
  revisar(false)
  activarEventos(hayEntradas())
  ponerRelojes()
  vigilarRaton()
  emitir()
end

-- Vuelve a hacer la lista ahora (lo mismo que SNF_PASOS_CAMBIADOS).
Cercanos.reconstruir = reconstruir

function Cercanos.relojes()
  local enMarcha = reloj:IsShown()
  return enMarcha, enMarcha and sinEventoPlacas
end

function Cercanos.lista()
  if entradas == nil then
    reconstruir()
  end
  return entradas
end

function Cercanos.ordenada()
  local salida = {}
  local soloCercanos = Ajustes.get("objetivos.soloCercanos") == true
  for rango = 1, 3 do
    for _, e in ipairs(Cercanos.lista()) do
      if RANGO_ESTADO[e.estado] == rango and not (soloCercanos and e.estado == "lejos") then
        salida[#salida + 1] = e
      end
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Ratón, objetivo y charla
---------------------------------------------------------------------------------------------------

local function alPasarRaton()
  local e = Cercanos.reconocer("mouseover")
  if e == nil then
    return
  end
  e.ratonHasta = GetTime() + SEGUNDOS_RATON
  memoria[e.clave].ratonHasta = e.ratonHasta
  revisar(true)
  vigilarRaton()
end

local function alCambiarObjetivo()
  if entradas == nil then
    return
  end
  for _, e in ipairs(entradas) do
    e.esObjetivo = false
  end
  local e = Cercanos.reconocer("target")
  if e then
    e.esObjetivo = true
  end
  revisar(true)
end

-- Hablar con un PNJ amistoso de la lista (por id, no por nombre): sale de la lista.
local function alHablar()
  if entradas == nil then
    return
  end
  local guid = llamar(api("UnitGUID"), "npc")
  if esSecreto(guid) or guid == nil then -- el secreto se mira antes de comparar
    return
  end
  local ok, id = pcall(idDeGuid, guid)
  local e = ok and id and porId[id] or nil
  if e and e.tipo == "target" then
    hablados[e.clave] = true
    reconstruir()
  end
end

-- Al entrar en una instancia se quitan las marcas que hubiera sobre placas vivas (no se ponen dentro).
local function alEntrarEnMundo()
  if enInstancia() then
    for unidad in pairs(Cercanos.marcas) do
      quitarMarca(unidad)
    end
  end
end

-- Los eventos del juego solo se escuchan mientras la lista tiene entradas (sin ellas no hay nada que detectar y el marco
-- de eventos de SnetForever no registra, por ejemplo, MERCHANT_SHOW para nada).
local eventosActivos = false

activarEventos = function(activar)
  if activar == eventosActivos then
    return
  end
  eventosActivos = activar
  local poner = activar and SNF.escuchar or SNF.Eventos.dejar
  poner("NAME_PLATE_UNIT_ADDED", alAnadirPlaca)
  poner("NAME_PLATE_UNIT_REMOVED", alQuitarPlaca)
  poner("UPDATE_MOUSEOVER_UNIT", alPasarRaton)
  poner("PLAYER_TARGET_CHANGED", alCambiarObjetivo)
  poner("PLAYER_ENTERING_WORLD", alEntrarEnMundo)
  for _, evento in ipairs(EVENTOS_CHARLA) do
    poner(evento, alHablar)
  end
end

-- SNF_PASOS_CAMBIADOS llega a menudo (cada muerte de un 3/8): si las entradas que pide la guía son las mismas, la lista
-- se queda como está y no se emite nada.
SNF.escuchar("SNF_PASOS_CAMBIADOS", function()
  olvidarHablados()
  local pedidas = entradasPedidas()
  if entradas ~= nil and firmaDe(pedidas) == firmaEntradas then
    return
  end
  reconstruir(pedidas)
end)

-- Apagar «Objetivos cercanos» para la detección (la lista se queda vacía) y encenderlo la vuelve a poner en marcha.
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "objetivos.activo" and entradas ~= nil then
    reconstruir()
  end
end)

-- La marca de la placa se enciende y se apaga con su ajuste.
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave ~= "objetivos.marcaPlaca" or entradas == nil then
    return
  end
  for unidad, e in pairs(porPlaca) do
    Cercanos.marcaPlaca(unidad, e)
  end
end)
