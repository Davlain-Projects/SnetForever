-- SnetForever: espacio de nombres del addon. Publica la tabla del addon como SnetForever, con la versión y
-- las utilidades comunes (U). El resto de archivos usan la misma tabla con `local _, SNF = ...`; los del addon de
-- comercio (SnetForever_Comercio, 0.7.0), que tiene su propia tabla de addon, con `local SNF = SnetForever`.
local _, SNF = ...
SnetForever = SNF

SNF.VERSION = "0.7.0"
SNF.U = {}
local U = SNF.U

-- Redondea n a `decimales` cifras (0 si no se da), con las mitades lejos del cero.
-- Con 0 decimales devuelve el resultado de math.floor/math.ceil, sin dividir.
function U.redondear(n, decimales)
  local factor = 10 ^ (decimales or 0)
  local escalado = n * factor
  local redondo
  if escalado >= 0 then
    redondo = math.floor(escalado + 0.5)
  else
    redondo = math.ceil(escalado - 0.5)
  end
  if not decimales or decimales == 0 then
    return redondo
  end
  return redondo / factor
end

-- Copia profunda de t (las tablas repetidas o con ciclos se copian una sola vez). Las metatablas no se copian.
-- Un valor que no es tabla se devuelve tal cual.
function U.copiar(t, copias)
  if type(t) ~= "table" then
    return t
  end
  copias = copias or {}
  if copias[t] then
    return copias[t]
  end
  local copia = {}
  copias[t] = copia
  for clave, valor in pairs(t) do
    copia[U.copiar(clave, copias)] = U.copiar(valor, copias)
  end
  return copia
end

---------------------------------------------------------------------------------------------------
-- API: capa de compatibilidad con el cliente (tarea 22, revisión final). WoW Forever 1.60.1 (interfaz 16001) corre
-- sobre el motor moderno: comprobado con /dump, NO tiene GetItemCount, GetNumSkillLines, GetSkillLineInfo,
-- GetSpellCooldown, UnitBuff, UnitDebuff, GetMinimapShape ni GetQuestLogTitle, y SÍ C_Item.GetItemCount,
-- C_SkillInfo.GetSkillLineInfoByID, C_Spell.GetSpellCooldown, C_Item.GetItemCooldown, C_UnitAuras, C_Secrets y
-- C_EventUtils. Cada función prueba primero la API nueva y luego la vieja; sin ninguna da el valor neutro. Todo el
-- addon pasa por aquí: ningún otro archivo llama a esas APIs.
--
-- API.cuentaObjeto(id, banco?) -> n             unidades del objeto (C_Item.GetItemCount → GetItemCount → 0).
-- API.habilidadPorId(skillId) -> rango, maximo  la línea de habilidad por su id (C_SkillInfo.GetSkillLineInfoByID,
--                                               que da una tabla {name, rank, maxRank...}); nil si el jugador no
--                                               la tiene (también con rank 0 y maxRank 0: no aprendida). Sin esa API devuelve false (hay que usar la vieja).
-- API.habilidades() -> iterador de nombre, rango, maximo   las líneas de la API vieja (GetNumSkillLines y
--                                               GetSkillLineInfo, o C_SkillInfo.GetNumSkillLines/GetSkillLineInfo).
-- API.hayHabilidadesPorNombre() -> bool         ¿hay esa API vieja?
-- API.enfriamientoHechizo(id) -> inicio, duracion | nil   C_Spell.GetSpellCooldown (tabla) → GetSpellCooldown.
-- API.enfriamientoObjeto(id) -> inicio, duracion | nil    C_Item.GetItemCooldown → C_Container → GetItemCooldown.
--                                               Los dos dan nil sin API, y también si el cliente oculta los tiempos
--                                               (C_Secrets.ShouldCooldownsBeSecret): un valor secreto no se compara.
-- API.auraPorHechizo(unidad, idHechizo) -> {cuenta, expira} | nil   el aura de ese hechizo en la unidad
--                                               (C_UnitAuras → UnitBuff/UnitDebuff). expira 0 = permanente.
-- API.aurasSecretas() -> bool                   C_Secrets.ShouldAurasBeSecret(): no se pueden leer las auras.
-- API.iconoObjeto(id) -> icono | nil            C_Item.GetItemIconByID → GetItemIcon; nil sin API, sin el objeto en
--                                               caché o si la llamada falla.
-- API.registroMisiones() -> {q...}, incompleto   las misiones del registro por su id, en su orden, sin cabeceras ni
--                                               ocultas (C_QuestLog.GetNumQuestLogEntries y GetInfo; sin ellas,
--                                               GetNumQuestLogEntries y GetQuestLogTitle). Un valor secreto se salta.
--                                               incompleto = true si hay una cabecera colapsada (sus misiones puede que
--                                               no se enumeren; no se expanden: cambiaría la interfaz del jugador).
--                                               Con la tabla `titulos` (lote E2), apunta en ella titulos[q] = el título
--                                               que da el cliente (en el idioma del jugador); los secretos, no.
-- API.tituloMision(q) -> texto | nil            C_QuestLog.GetTitleForQuestID(q) (lote E2); nil sin la API, sin el
--                                               título en caché, vacío o secreto.
-- API.enRegistro(q) -> bool                     C_QuestLog.IsOnQuest(q); false sin la API.
-- API.esSecreto(valor) -> bool                  issecretvalue (sin la función, ninguno lo es; si falla, es secreto).
-- API.formaMinimapa() -> forma                 "ROUND", "SQUARE", "CORNER-..." (la convención de GetMinimapShape).
---------------------------------------------------------------------------------------------------
local API = {}
SNF.API = API

-- Una función de un espacio de nombres del cliente, o nil si el espacio o la función no existen. Con rawget: en el
-- cliente son tablas normales, y así se pregunta sin tocar nada (el banco da error al leer lo que no imita).
local function de(espacio, nombre)
  local t = rawget(_G, espacio)
  local f = type(t) == "table" and rawget(t, nombre)
  return type(f) == "function" and f or nil
end

local function global(nombre)
  local f = rawget(_G, nombre)
  return type(f) == "function" and f or nil
end

-- ¿Es un valor secreto del motor moderno? (issecretvalue; sin la función, ninguno lo es.) Si la pregunta falla, se
-- trata como secreto.
function API.esSecreto(valor)
  local f = global("issecretvalue")
  if not f then
    return false
  end
  local ok, secreto = pcall(f, valor)
  return not ok or secreto == true
end
local esSecreto = API.esSecreto

function API.cuentaObjeto(id, banco)
  local f = de("C_Item", "GetItemCount") or global("GetItemCount")
  return f and tonumber(f(id, banco)) or 0
end

function API.habilidadPorId(skillId)
  local f = de("C_SkillInfo", "GetSkillLineInfoByID")
  if not f then
    return false
  end
  local info = f(skillId)
  if type(info) ~= "table" then
    return nil
  end
  local rango = tonumber(info.rank or info.skillRank)
  if rango == nil then
    return nil
  end
  local maximo = tonumber(info.maxRank or info.skillMaxRank) or rango
  -- Rango 0 y máximo 0: la línea existe pero el jugador no la ha aprendido (decisión P21(b) de la fase 2).
  if rango == 0 and maximo == 0 then
    return nil
  end
  return rango, maximo
end

-- ¿Tiene el cliente la API vieja de habilidades (por índice y nombre)?
function API.hayHabilidadesPorNombre()
  local cuantas = de("C_SkillInfo", "GetNumSkillLines") or global("GetNumSkillLines")
  local linea = de("C_SkillInfo", "GetSkillLineInfo") or global("GetSkillLineInfo")
  return cuantas ~= nil and linea ~= nil
end

-- Las líneas de habilidad con la API vieja: nombre, rango y máximo de cada una (sin cabeceras).
function API.habilidades()
  local cuantas = de("C_SkillInfo", "GetNumSkillLines") or global("GetNumSkillLines")
  local linea = de("C_SkillInfo", "GetSkillLineInfo") or global("GetSkillLineInfo")
  local n = cuantas and linea and tonumber(cuantas()) or 0
  local i = 0
  return function()
    while i < n do
      i = i + 1
      local nombre, cabecera, _, rango, _, _, maximo = linea(i)
      if type(nombre) == "table" then
        -- C_SkillInfo.GetSkillLineInfo da una tabla (Questie, QuestieCompat.lua:906-916)
        local t = nombre
        nombre, cabecera, rango, maximo = t.name, t.isHeader, t.rank, t.maxRank
      end
      if nombre and not cabecera then
        return nombre, rango, maximo
      end
    end
    return nil
  end
end

local function tiemposSecretos()
  local f = de("C_Secrets", "ShouldCooldownsBeSecret")
  return f ~= nil and f() == true
end

function API.enfriamientoHechizo(id)
  if tiemposSecretos() then
    return nil
  end
  local nuevo = de("C_Spell", "GetSpellCooldown")
  if nuevo then
    local info = nuevo(id)
    if type(info) == "table" then
      return tonumber(info.startTime) or 0, tonumber(info.duration) or 0
    end
    return 0, 0 -- sin datos: el hechizo no tiene tiempo de reutilización
  end
  local viejo = global("GetSpellCooldown")
  if viejo then
    local inicio, duracion = viejo(id)
    return tonumber(inicio) or 0, tonumber(duracion) or 0
  end
  return nil
end

function API.enfriamientoObjeto(id)
  if tiemposSecretos() then
    return nil
  end
  local f = de("C_Item", "GetItemCooldown") or de("C_Container", "GetItemCooldown") or global("GetItemCooldown")
  if not f then
    return nil
  end
  local inicio, duracion = f(id)
  if type(inicio) == "table" then
    inicio, duracion = inicio.startTime, inicio.duration
  end
  return tonumber(inicio) or 0, tonumber(duracion) or 0
end

function API.iconoObjeto(id)
  local f = de("C_Item", "GetItemIconByID") or global("GetItemIcon")
  if not f then
    return nil
  end
  -- pcall: con el objeto sin cargar algunos clientes dan error en vez de nil.
  local ok, icono = pcall(f, id)
  return ok and icono or nil
end

function API.aurasSecretas()
  local f = de("C_Secrets", "ShouldAurasBeSecret")
  return f ~= nil and f() == true
end

local MAX_AURAS = 40
local FILTROS_AURA = {"HELPFUL", "HARMFUL"}

local function deAuraData(a)
  return {cuenta = tonumber(a.applications) or 1, expira = tonumber(a.expirationTime) or 0}
end

function API.auraPorHechizo(unidad, spell)
  local delJugador = de("C_UnitAuras", "GetPlayerAuraBySpellID")
  if unidad == "player" and delJugador then
    local a = delJugador(spell)
    return a and deAuraData(a) or nil
  end
  local porIndice = de("C_UnitAuras", "GetAuraDataByIndex")
  if porIndice then
    for _, filtro in ipairs(FILTROS_AURA) do
      for i = 1, MAX_AURAS do
        local a = porIndice(unidad, i, filtro)
        if not a then
          break
        end
        if a.spellId == spell then
          return deAuraData(a)
        end
      end
    end
    return nil
  end
  -- Cliente viejo: UnitBuff/UnitDebuff, 1-32 de cada.
  for _, nombreFuncion in ipairs({"UnitBuff", "UnitDebuff"}) do
    local f = global(nombreFuncion)
    if f then
      for i = 1, 32 do
        local nombre, _, cuenta, _, _, expira, _, _, _, id = f(unidad, i)
        if not nombre then
          break
        end
        if id == spell then
          return {cuenta = tonumber(cuenta) or 1, expira = tonumber(expira) or 0}
        end
      end
    end
  end
  return nil
end

-- El título de una entrada del registro, si se puede leer (no secreto, texto no vacío).
local function apuntarTitulo(titulos, q, titulo)
  if titulos and not esSecreto(titulo) and type(titulo) == "string" and titulo ~= "" then
    titulos[q] = titulo
  end
end

function API.registroMisiones(titulos)
  local salida = {}
  local incompleto = false
  local cuantas = de("C_QuestLog", "GetNumQuestLogEntries")
  local info = de("C_QuestLog", "GetInfo")
  if cuantas and info then
    local n = cuantas()
    if esSecreto(n) then
      return salida, true
    end
    for i = 1, tonumber(n) or 0 do
      local t = info(i)
      if type(t) == "table" then
        local q, cabecera, oculta, colapsada = t.questID, t.isHeader, t.isHidden, t.isCollapsed
        if esSecreto(cabecera) or esSecreto(colapsada) then
          incompleto = true
        elseif cabecera and colapsada then
          incompleto = true
        end
        if not esSecreto(q) and not esSecreto(cabecera) and not esSecreto(oculta) and not cabecera and not oculta
          and type(q) == "number" and q > 0 then
          salida[#salida + 1] = q
          apuntarTitulo(titulos, q, t.title)
        end
      end
    end
    return salida, incompleto
  end
  local viejaCuantas, viejaTitulo = global("GetNumQuestLogEntries"), global("GetQuestLogTitle")
  if viejaCuantas and viejaTitulo then
    local n = viejaCuantas()
    if esSecreto(n) then
      return salida, true
    end
    for i = 1, tonumber(n) or 0 do
      local titulo, _, _, cabecera, colapsada, _, _, q = viejaTitulo(i)
      if esSecreto(cabecera) or esSecreto(colapsada) or (cabecera and colapsada) then
        incompleto = true
      end
      if not esSecreto(q) and not esSecreto(cabecera) and not cabecera and type(q) == "number" and q > 0 then
        salida[#salida + 1] = q
        apuntarTitulo(titulos, q, titulo)
      end
    end
  end
  return salida, incompleto
end

function API.tituloMision(q)
  local f = de("C_QuestLog", "GetTitleForQuestID")
  if not f then
    return nil
  end
  local ok, titulo = pcall(f, q)
  if not ok or esSecreto(titulo) or type(titulo) ~= "string" or titulo == "" then
    return nil
  end
  return titulo
end

-- ¿Dice el juego (C_QuestLog.IsOnQuest) que la misión q está en el registro? false sin la API o con un valor secreto.
function API.enRegistro(q)
  local f = de("C_QuestLog", "IsOnQuest")
  if not f then
    return false
  end
  local ok, esta = pcall(f, q)
  return ok and not esSecreto(esta) and esta == true
end

-- Contenedores y objetos (fase 4, inventario de la IA). Solo se lee: nunca se usa, vende, equipa ni coge nada. Un valor
-- secreto del motor no se compara: el dato se salta.
--   API.huecosBolsa(b) -> n | nil              huecos de la bolsa (C_Container.GetContainerNumSlots → global → nil).
--   API.libresBolsa(b) -> n | nil              huecos libres (C_Container.GetContainerNumFreeSlots → global → nil).
--   API.infoContenedor(b, h) -> {id, n, ca, l, enlace} | nil   lo que hay en el hueco (C_Container.GetContainerItemInfo,
--                                              que da una tabla → la global vieja, que da valores sueltos → nil). l = 0|1.
--   API.infoObjeto(idOEnlace) -> {nombre, ca, nv, h, pv, apilado} | nil   C_Item.GetItemInfo → GetItemInfo; nil sin caché.
--                                              ca calidad, nv nivel, h equipLoc, pv precio de venta, apilado tamaño de pila.
--   API.estadisticas(enlace) -> {ITEM_MOD_…=n} | nil   C_Item.GetItemStats → GetItemStats; nil si no hay o están vacías.
--   API.pedirObjeto(id)                        C_Item.RequestLoadItemDataByID (sin la API, nada).
--   API.enlaceEquipado(h) -> enlace | nil      GetInventoryItemLink("player", h).
--   API.lineasEquipado(h) -> {texto…} | nil    C_TooltipInfo.GetInventoryItem("player", h): el texto izquierdo de cada línea.
--   API.bolsasPropias() -> {ids}, {[id] = true}   F2b: las bolsas del jugador: la mochila (0), las puestas (1 a
--                                              NUM_BAG_SLOTS) y la de componentes (Enum.BagIndex.ReagentBag, la 5 en Forever;
--                                              sin ese enum, las NUM_REAGENTBAG_SLOTS que siguen, si el cliente las da). El
--                                              segundo valor (F2b) dice cuáles son de componentes: sus huecos solo
--                                              admiten componentes. El llavero
--                                              (Enum.BagIndex.Keyring, el -1 en Forever) no: solo lleva llaves (ligadas, no se
--                                              venden) y sus huecos no valen para otra cosa; TSM tampoco lo cuenta.
--   API.bolsasBanco() -> {ids}                 el banco del personaje. F2b: si el cliente tiene Enum.BagIndex.CharacterBankTab_n
--                                              (Forever: las pestañas 1 a 9, del 6 al 14), esas; si no, Enum.BagIndex.Bank y
--                                              BankBag_1…7; sin nada de eso, {-1, las NUM_BANKBAGSLOTS que siguen a las
--                                              propias}. Nunca una de bolsasPropias() (la de componentes no se cuenta dos
--                                              veces) ni el -1 si es el llavero (Forever: Keyring = -1 y no hay Bank).
--   API.bolsasCuenta() -> {ids}                F2b: el banco de cuenta, compartido por todos los personajes:
--                                              Enum.BagIndex.AccountBankTab_1…9 (Forever: del 15 al 23); {} si no hay.
--                                              Ojo: Characterbanktab (-2) y Accountbanktab (-3) no son bancos que leer: son
--                                              los huecos donde se ponen las bolsas de las pestañas (como las bolsas puestas).
--   API.horaServidor() -> segundos | nil       GetServerTime → time.
local function numero(valor)
  if type(valor) == "number" and not esSecreto(valor) then
    return valor
  end
  return nil
end

local function texto(valor)
  if type(valor) == "string" and not esSecreto(valor) then
    return valor
  end
  return nil
end

-- Codificación del cliente (fase 4, envío a la IA).
--   API.codificacion() -> util, metodo | nil   C_EncodingUtil y Enum.CompressionMethod.Deflate (0 = deflate crudo si falta
--                                              el enum); nil si el cliente no trae C_EncodingUtil.
function API.codificacion()
  local util = rawget(_G, "C_EncodingUtil")
  if type(util) ~= "table" then
    return nil
  end
  local enum = rawget(_G, "Enum")
  local metodos = type(enum) == "table" and rawget(enum, "CompressionMethod")
  local metodo = type(metodos) == "table" and rawget(metodos, "Deflate")
  return util, type(metodo) == "number" and metodo or 0
end

function API.huecosBolsa(bolsa)
  local f = de("C_Container", "GetContainerNumSlots") or global("GetContainerNumSlots")
  if not f then
    return nil
  end
  local ok, n = pcall(f, bolsa)
  return ok and numero(n) or nil
end

function API.libresBolsa(bolsa)
  local f = de("C_Container", "GetContainerNumFreeSlots") or global("GetContainerNumFreeSlots")
  if not f then
    return nil
  end
  local ok, n = pcall(f, bolsa)
  return ok and numero(n) or nil
end

-- Del hueco de una bolsa: {id, n, ca, l, enlace}. C_Container da una tabla ContainerItemInfo; la global vieja,
-- texture, count, locked, quality, readable, lootable, link, isFiltered, noValue, itemID, isBound.
function API.infoContenedor(bolsa, hueco)
  local f = de("C_Container", "GetContainerItemInfo") or global("GetContainerItemInfo")
  if not f then
    return nil
  end
  local ok, a, n, _, calidad, _, _, enlace, _, _, id, ligado = pcall(f, bolsa, hueco)
  if not ok or a == nil then
    return nil
  end
  if type(a) == "table" then
    id, n, calidad, ligado, enlace = a.itemID, a.stackCount, a.quality, a.isBound, a.hyperlink
  end
  id = numero(id)
  if not id or id <= 0 then
    return nil
  end
  if esSecreto(n) then
    return nil -- sin saber cuántas hay, el hueco no cuenta
  end
  n = numero(n) or 1
  return {id = id, n = n, ca = numero(calidad), l = (not esSecreto(ligado) and ligado == true) and 1 or 0, enlace = texto(enlace)}
end

function API.infoObjeto(idOEnlace)
  local f = de("C_Item", "GetItemInfo") or global("GetItemInfo")
  if not f then
    return nil
  end
  local ok, nombre, _, calidad, nivel, _, _, _, apilado, equipa, _, precio = pcall(f, idOEnlace)
  nombre = ok and texto(nombre) or nil
  if not nombre then
    return nil
  end
  return {nombre = nombre, ca = numero(calidad), nv = numero(nivel), h = texto(equipa),
    pv = numero(precio), apilado = numero(apilado)}
end

function API.estadisticas(enlace)
  local f = de("C_Item", "GetItemStats") or global("GetItemStats")
  if not f then
    return nil
  end
  local ok, t = pcall(f, enlace)
  if not ok or type(t) ~= "table" then
    return nil
  end
  local salida
  for clave, valor in pairs(t) do
    if texto(clave) and numero(valor) then
      salida = salida or {}
      salida[clave] = valor
    end
  end
  return salida
end

function API.pedirObjeto(id)
  local f = de("C_Item", "RequestLoadItemDataByID")
  if f then
    pcall(f, id)
  end
end

function API.enlaceEquipado(hueco)
  local f = global("GetInventoryItemLink")
  if not f then
    return nil
  end
  local ok, enlace = pcall(f, "player", hueco)
  return ok and texto(enlace) or nil
end

function API.lineasEquipado(hueco)
  local f = de("C_TooltipInfo", "GetInventoryItem")
  if not f then
    return nil
  end
  local ok, datos = pcall(f, "player", hueco)
  if not ok or type(datos) ~= "table" or type(datos.lines) ~= "table" then
    return nil
  end
  local salida = {}
  for _, linea in ipairs(datos.lines) do
    local t = type(linea) == "table" and texto(linea.leftText)
    if t and t ~= "" then
      salida[#salida + 1] = t
    end
  end
  return salida
end

-- F2b: Enum.BagIndex (o nil) y cuántas bolsas se llevan puestas (NUM_BAG_SLOTS, o 4).
local function indicesBolsas()
  local enum = rawget(_G, "Enum")
  local t = type(enum) == "table" and rawget(enum, "BagIndex")
  return type(t) == "table" and t or nil
end

function API.bolsasPropias()
  local puestas = numero(rawget(_G, "NUM_BAG_SLOTS")) or 4
  puestas = math.floor(puestas)
  local ids = {}
  for i = 0, puestas do
    ids[#ids + 1] = i
  end
  local indices = indicesBolsas()
  local componentes = indices and numero(indices.ReagentBag)
  local deComponentes = {}
  if componentes then
    if componentes > puestas then
      ids[#ids + 1] = componentes
      deComponentes[componentes] = true
    end
  else
    local n = numero(rawget(_G, "NUM_REAGENTBAG_SLOTS"))
    for i = 1, n and math.floor(n) or 0 do
      ids[#ids + 1] = puestas + i
      deComponentes[puestas + i] = true
    end
  end
  return ids, deComponentes
end

-- Los ids de Enum.BagIndex[prefijo .. 1…max] que existen, sin los de `fuera` ni repetidos.
local function pestanas(indices, prefijo, max, fuera)
  local ids = {}
  for i = 1, max do
    local v = numero(indices[prefijo .. i])
    if v and not fuera[v] then
      fuera[v] = true
      ids[#ids + 1] = v
    end
  end
  return ids
end

function API.bolsasBanco()
  local fuera, ultima = {}, 0
  for _, b in ipairs(API.bolsasPropias()) do
    fuera[b] = true
    ultima = math.max(ultima, b)
  end
  local indices = indicesBolsas()
  if indices then
    local tabs = pestanas(indices, "CharacterBankTab_", 9, fuera)
    if #tabs > 0 then
      return tabs
    end
    local banco = numero(indices.Bank)
    if banco and banco ~= numero(indices.Keyring) and not fuera[banco] then
      fuera[banco] = true
      local ids = {banco}
      for _, v in ipairs(pestanas(indices, "BankBag_", 7, fuera)) do
        ids[#ids + 1] = v
      end
      return ids
    end
  end
  local delBanco = numero(rawget(_G, "NUM_BANKBAGSLOTS")) or 6
  local ids = {}
  if not (indices and numero(indices.Keyring) == -1) then
    ids[1] = -1
  end
  for i = ultima + 1, ultima + math.floor(delBanco) do
    ids[#ids + 1] = i
  end
  return ids
end

function API.bolsasCuenta()
  local indices = indicesBolsas()
  if not indices then
    return {}
  end
  local fuera = {}
  for _, b in ipairs(API.bolsasPropias()) do
    fuera[b] = true
  end
  for _, b in ipairs(API.bolsasBanco()) do
    fuera[b] = true
  end
  return pestanas(indices, "AccountBankTab_", 9, fuera)
end

function API.horaServidor()
  local f = global("GetServerTime") or global("time")
  if not f then
    return nil
  end
  local ok, t = pcall(f)
  return ok and numero(t) or nil
end

-- Forma del minimapa. GetMinimapShape no es de Blizzard (la definen los addons de minimapa) y en Forever no existe;
-- EllesmereUI tampoco la define y su minimapa es cuadrado. Por orden:
--   1. GetMinimapShape(), si algún addon la define;
--   2. la máscara del minimapa: Minimap:GetMaskTexture() si el cliente la tiene, o la última que alguien puso con
--      Minimap:SetMaskTexture (se apunta con hooksecurefunc, sin tocar nada). La redonda de Blizzard es
--      Textures\MinimapMask (186178, la misma que pone EllesmereUI para el círculo; EUI_Minimap_Apply.lua:247) o
--      TempPortraitAlphaMask; cualquier otra es cuadrada;
--   3. sin saber la máscara: cuadrado si está cargado EllesmereUIMinimap (que la cambia al cargar, antes que
--      nosotros) y redondo si no (el de Blizzard).
local MASCARAS_REDONDAS = {[186178] = true}
local mascaraPuesta -- la última de Minimap:SetMaskTexture desde que cargó el addon

local function formaDeMascara(m)
  if type(m) == "number" then
    return MASCARAS_REDONDAS[m] and "ROUND" or "SQUARE"
  end
  if type(m) == "string" and m ~= "" then
    local l = string.lower(m)
    if string.find(l, "minimapmask", 1, true) or string.find(l, "tempportraitalphamask", 1, true) then
      return "ROUND"
    end
    return "SQUARE"
  end
  return nil
end

local function addonCargado(nombre)
  local f = de("C_AddOns", "IsAddOnLoaded") or global("IsAddOnLoaded")
  return f ~= nil and f(nombre) and true or false
end

function API.formaMinimapa()
  local propia = global("GetMinimapShape")
  if propia then
    return propia() or "ROUND"
  end
  local forma
  if Minimap and type(Minimap.GetMaskTexture) == "function" then
    forma = formaDeMascara(Minimap:GetMaskTexture())
  end
  forma = forma or formaDeMascara(mascaraPuesta)
  if forma then
    return forma
  end
  return addonCargado("EllesmereUIMinimap") and "SQUARE" or "ROUND"
end

if Minimap and type(Minimap.SetMaskTexture) == "function" then
  hooksecurefunc(Minimap, "SetMaskTexture", function(_, mascara)
    mascaraPuesta = mascara
  end)
end
