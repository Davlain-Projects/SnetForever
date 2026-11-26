-- SnetForever: diario de objetos (docs/ia/2026-11-13-ia-con-herramientas-diseno.md, 5.2). Apunta, desde ahora, cómo
-- consigue el personaje cada objeto que importa, para que la IA pueda contestar «¿dónde lo obtuve?» con seguridad: ni
-- la base de misiones ni la API de Blizzard saben qué objetos da cada misión. Solo escucha eventos y lee: no llama a
-- nada protegido, no cambia nada del juego y nadie más del addon depende de él (un fallo aquí no rompe la guía).
--
-- SnetForeverPJ.diario = {v = 1, e = {Entrada, ...}, omitidos = n}, de la más vieja a la más nueva.
-- Entrada = {i = id, c = cantidad, t = GetServerTime(), nv = nivel, m = uiMapID | nil, o = origen, q?, npc?, obj?, p?,
--            eq? = true si es equipo}. o ∈ mision, botin, vendedor, correo, subasta, fabricado, desconocido.
--   * Solo se apunta el equipo (armas, armaduras, abalorios: equipLoc de GetItemInfoInstant) y lo de calidad poco común
--     o mejor; la calidad sale del enlace del mensaje («|cnIQ<n>:» en WoW Forever, o su color en los clientes clásicos),
--     así que no hace falta que el objeto esté en caché.
--   * Como mucho Diario.MAX entradas: al pasarse, sale la más vieja que no es equipo (si todas lo son, la más vieja).
--   * Un texto secreto (motor moderno) no se compara ni se apunta: suma en `omitidos`.
--
-- Diario.leerMensaje(texto) -> {id, cantidad, creado, calidad?} | nil   un «Recibes botín/objeto…» o «Creas…» del
--                              propio personaje (los patrones salen de las globales LOOT_ITEM_*, en el idioma del cliente).
-- Diario.apuntar(id, cantidad, contexto, calidad?) -> Entrada | nil       contexto = {o, q?, npc?, obj?, p?}; nil si el
--                              filtro lo descarta.
-- Diario.entradas() -> {Entrada, ...}
-- Diario.contextoPara(id) -> contexto | nil   el contexto pendiente que gana para ese objeto (misión, vendedor, botín), que
--                              se gasta. El correo y la subasta se apuntan al coger el adjunto (ver más abajo).
local _, SNF = ...
local Diario = {}
SNF.Diario = Diario

local API = SNF.API
local esSecreto = API.esSecreto

Diario.MAX = 2000
Diario.VENTANA = 10 -- segundos (GetTime) que vive un contexto pendiente

-- Calidad por el color del enlace (|cffRRGGBB): gris, blanco, verde, azul, morado y naranja.
local CALIDAD_DE_COLOR = {["9d9d9d"] = 0, ffffff = 1, ["1eff00"] = 2, ["0070dd"] = 3, a335ee = 4, ff8000 = 5}
-- equipLoc que no son equipo del personaje (bolsas, carcaj, munición) o que no se equipan.
local NO_ES_EQUIPO = {[""] = true, INVTYPE_NON_EQUIP_IGNORE = true, INVTYPE_NON_EQUIP = true, INVTYPE_BAG = true,
  INVTYPE_QUIVER = true, INVTYPE_AMMO = true}
-- Las globales de los textos, en el orden en que se prueban (las de varias unidades primero: «(.+)» de la de una sola
-- también se tragaría el «x3»). El segundo valor dice si es un objeto fabricado.
local TEXTOS = {
  {"LOOT_ITEM_CREATED_SELF_MULTIPLE", true}, {"LOOT_ITEM_CREATED_SELF", true},
  {"LOOT_ITEM_PUSHED_SELF_MULTIPLE", false}, {"LOOT_ITEM_PUSHED_SELF", false},
  {"LOOT_ITEM_SELF_MULTIPLE", false}, {"LOOT_ITEM_SELF", false},
}

-- Un texto de formato del juego («Recibes botín: %sx%d.») como patrón de Lua anclado.
local function patronDe(formato)
  local p = string.gsub(formato, "[%^%$%(%)%%%.%[%]%*%+%-%?]", "%%%0")
  p = string.gsub(p, "%%%%s", "(.+)")
  p = string.gsub(p, "%%%%d", "(%%d+)")
  return "^" .. p .. "$"
end

local patrones = {} -- [global] = {formato, patrón}: se rehace si el texto cambia (otro idioma)
local function patron(global)
  local formato = rawget(_G, global)
  if type(formato) ~= "string" then
    return nil
  end
  local p = patrones[global]
  if not p or p[1] ~= formato then
    p = {formato, patronDe(formato)}
    patrones[global] = p
  end
  return p[2]
end

-- La calidad de un enlace. WoW Forever los escribe «|cnIQ<n>:|Hitem…» (revisión final: 488 enlaces en sus
-- SavedVariables, todos así); los clientes clásicos, con el color «|cffRRGGBB». nil si no se sabe.
local function calidadDe(enlace)
  if type(enlace) ~= "string" or esSecreto(enlace) then
    return nil
  end
  local n = tonumber(string.match(enlace, "|cnIQ(%d+):"))
  if n then
    return n
  end
  local color = string.match(enlace, "|c%x%x(%x%x%x%x%x%x)")
  return color and CALIDAD_DE_COLOR[string.lower(color)] or nil
end

-- Pública (B6r, ronda 1): la vista de resultados de la subasta saca de aquí la calidad del enlace de una subasta.
Diario.calidadDeEnlace = calidadDe

function Diario.leerMensaje(texto)
  if type(texto) ~= "string" or esSecreto(texto) then
    return nil
  end
  for _, t in ipairs(TEXTOS) do
    local p = patron(t[1])
    if p then
      local enlace, n = string.match(texto, p)
      if enlace then
        local id = tonumber(string.match(enlace, "item:(%d+)"))
        if not id then
          return nil
        end
        return {id = id, cantidad = tonumber(n) or 1, creado = t[2], calidad = calidadDe(enlace)}
      end
    end
  end
  return nil
end

local function guardado()
  local pj = rawget(_G, "SnetForeverPJ")
  local d = type(pj) == "table" and pj.diario or nil
  if type(d) ~= "table" then
    return nil
  end
  if type(d.e) ~= "table" then
    d.e = {}
  end
  return d
end

local function esEquipo(id)
  local C = rawget(_G, "C_Item")
  local f = type(C) == "table" and C.GetItemInfoInstant or rawget(_G, "GetItemInfoInstant")
  if type(f) ~= "function" then
    return false
  end
  local ok, _, _, _, equipLoc = pcall(f, id)
  return ok and type(equipLoc) == "string" and not NO_ES_EQUIPO[equipLoc]
end

local function mapaActual()
  local ok, mapa = pcall(function()
    return C_Map.GetBestMapForUnit("player")
  end)
  return ok and type(mapa) == "number" and mapa or nil
end

-- Al pasarse de MAX: fuera la más vieja que no es equipo; si todas son equipo, la más vieja. La recién apuntada (la
-- última) nunca es candidata: si no, una nueva que no es equipo entre puro equipo se tiraría a sí misma.
local function recortar(e)
  while #e > Diario.MAX do
    local quitar = 1
    for k = 1, #e - 1 do
      if not e[k].eq then
        quitar = k
        break
      end
    end
    table.remove(e, quitar)
  end
end

function Diario.apuntar(id, cantidad, contexto, calidad)
  local d = guardado()
  if not d or type(id) ~= "number" then
    return nil
  end
  local eq = esEquipo(id)
  if not eq and not (type(calidad) == "number" and calidad >= 2) then
    return nil
  end
  contexto = contexto or {}
  local pj = SNF.Personaje.actual()
  local entrada = {i = id, c = cantidad or 1, t = GetServerTime(), nv = pj and pj.nivel or nil, m = mapaActual(),
    o = contexto.o or "desconocido", q = contexto.q, npc = contexto.npc, obj = contexto.obj, p = contexto.p,
    eq = eq or nil}
  d.e[#d.e + 1] = entrada
  recortar(d.e)
  return entrada
end

function Diario.entradas()
  local d = guardado()
  return d and d.e or {}
end

---------------------------------------------------------------------------------------------------
-- Contextos pendientes: lo que estaba pasando justo antes del «Recibes…» (entregar una misión, comprar, abrir un
-- botín). pendientes[id] = lista de {ctx, t} en orden de llegada; cada mensaje gasta uno. Si hay varios vivos para el
-- mismo objeto gana, por este orden, misión, vendedor y botín. Lo de más de Diario.VENTANA segundos se tira.
-- El correo y la subasta se apuntan al coger el objeto (no está claro que el juego escriba «Recibes…» al cogerlo del
-- buzón); si luego llega ese mensaje, se ignora una vez (yaApuntados).
---------------------------------------------------------------------------------------------------

local PRIORIDAD = {mision = 1, vendedor = 2, botin = 3}
local pendientes = {} -- [id] = {{ctx, t}, ...}
local yaApuntados = {} -- [id] = {t, ...}

local function ahora()
  return GetTime()
end

local function vivos(lista)
  local limite = ahora() - Diario.VENTANA
  local i = 1
  while lista[i] do
    if lista[i].t < limite then
      table.remove(lista, i)
    else
      i = i + 1
    end
  end
  return lista
end

local function anadir(id, ctx)
  if type(id) ~= "number" then
    return
  end
  local lista = pendientes[id] or {}
  pendientes[id] = lista
  lista[#lista + 1] = {ctx = ctx, t = ahora()}
end

-- Quita los contextos de un tipo (p. ej. el botín anterior al abrir otro).
local function quitarTipo(tipo)
  for _, lista in pairs(pendientes) do
    local i = 1
    while lista[i] do
      if lista[i].ctx.o == tipo then
        table.remove(lista, i)
      else
        i = i + 1
      end
    end
  end
end

-- El contexto que gana para el objeto `id`, que se gasta; nil si no hay ninguno vivo.
function Diario.contextoPara(id)
  local lista = pendientes[id]
  if not lista then
    return nil
  end
  vivos(lista)
  local mejor
  for k, x in ipairs(lista) do
    if not mejor or PRIORIDAD[x.ctx.o] < PRIORIDAD[lista[mejor].ctx.o] then
      mejor = k
    end
  end
  if not mejor then
    return nil
  end
  return table.remove(lista, mejor).ctx
end

local function idDeEnlace(enlace)
  return type(enlace) == "string" and not esSecreto(enlace) and tonumber(string.match(enlace, "item:(%d+)")) or nil
end

-- Un número de verdad (ni secreto ni otra cosa) y mayor que cero.
local function positivo(v)
  return type(v) == "number" and not esSecreto(v) and v > 0
end

-- «Creature-0-mapa-instancia-zona-id-uid» (o Vehicle-…) → "npc", id; «GameObject-…» → "obj", id.
local function origenDeGuid(guid)
  if type(guid) ~= "string" or esSecreto(guid) then
    return nil
  end
  local tipo, id = string.match(guid, "^(%a+)%-%d+%-%d+%-%d+%-%d+%-(%d+)")
  id = tonumber(id)
  if not id then
    return nil
  elseif tipo == "Creature" or tipo == "Vehicle" then
    return "npc", id
  elseif tipo == "GameObject" then
    return "obj", id
  end
  return nil
end

-- Llama a una función del cliente si existe; nunca da error.
local function llamar(nombre, ...)
  local f = rawget(_G, nombre)
  if type(f) ~= "function" then
    return nil
  end
  -- Sin unpack (el comprobador de Lua 5.1 no deja usar table.unpack): ninguna de las funciones que se usan aquí
  -- devuelve más de ocho valores que interesen.
  local ok, a, b, c, d, e, f2, g, h = pcall(f, ...)
  if not ok then
    return nil
  end
  return a, b, c, d, e, f2, g, h
end

-- Engancha `gancho` detrás de la función del cliente `nombre`, si existe. El gancho va protegido: un fallo suyo va a
-- geterrorhandler() (como los oyentes de SNF.escuchar) y nunca llega a quien llamó a la función del juego.
local function enganchar(nombre, gancho)
  if type(rawget(_G, nombre)) ~= "function" then
    return
  end
  pcall(hooksecurefunc, nombre, function(...)
    local ok, fallo = pcall(gancho, ...)
    if not ok then
      local manejador = rawget(_G, "geterrorhandler")
      if type(manejador) == "function" then
        pcall(manejador(), fallo)
      end
    end
  end)
end

-- Misión: al abrirse la ventana de entregar, sus recompensas fijas y las opciones; GetQuestReward(eleccion) deja los
-- contextos de las fijas y de la elegida, y QUEST_TURNED_IN renueva su hora.
local entrega -- {q, fijas = {id...}, opciones = {id...}} de la ventana abierta

SNF.escuchar("QUEST_COMPLETE", function()
  local q = llamar("GetQuestID")
  local fijas, opciones = {}, {}
  for i = 1, tonumber(llamar("GetNumQuestRewards")) or 0 do
    fijas[#fijas + 1] = idDeEnlace(llamar("GetQuestItemLink", "reward", i))
  end
  for i = 1, tonumber(llamar("GetNumQuestChoices")) or 0 do
    opciones[i] = idDeEnlace(llamar("GetQuestItemLink", "choice", i)) or false
  end
  entrega = {q = positivo(q) and q or nil, fijas = fijas, opciones = opciones}
end)

enganchar("GetQuestReward", function(eleccion)
  if not entrega then
    return
  end
  local ctx = {o = "mision", q = entrega.q}
  for _, id in ipairs(entrega.fijas) do
    anadir(id, ctx)
  end
  local elegida = type(eleccion) == "number" and entrega.opciones[eleccion] or nil
  if elegida then
    anadir(elegida, ctx)
  end
end)

SNF.escuchar("QUEST_TURNED_IN", function(q)
  if not entrega or entrega.q ~= q then
    return
  end
  local t = ahora()
  for _, lista in pairs(pendientes) do
    for _, x in ipairs(lista) do
      if x.ctx.o == "mision" and x.ctx.q == q then
        x.t = t
      end
    end
  end
  entrega = nil
end)

-- Precio y tamaño del lote de un objeto del vendedor. Revisión final: en WoW Forever GetMerchantItemInfo puede no existir
-- (Auctionator lo suple con C_MerchantFrame.GetItemInfo, que da una tabla); se prueba primero esa.
local function precioVendedor(indice)
  local C = rawget(_G, "C_MerchantFrame")
  if type(C) == "table" and type(C.GetItemInfo) == "function" then
    local ok, info = pcall(C.GetItemInfo, indice)
    if ok and type(info) == "table" then
      return info.price, info.stackCount
    end
  end
  local _, _, precio, lote = llamar("GetMerchantItemInfo", indice)
  return precio, lote
end

-- Vendedor: cada compra deja el contexto con el PNJ y lo pagado.
enganchar("BuyMerchantItem", function(indice, cantidad)
  local id = idDeEnlace(llamar("GetMerchantItemLink", indice)) or llamar("GetMerchantItemID", indice)
  if not positivo(id) then
    return
  end
  local precio, lote = precioVendedor(indice)
  local ctx = {o = "vendedor"}
  local tipo, npc = origenDeGuid(llamar("UnitGUID", "npc"))
  if tipo == "npc" then
    ctx.npc = npc
  end
  if positivo(precio) then
    lote = positivo(lote) and lote or 1
    ctx.p = math.floor(precio * (positivo(cantidad) and cantidad or lote) / lote + 0.5)
  end
  anadir(id, ctx)
end)

-- Botín: al abrirse, cada hueco con el PNJ o el objeto del mundo de donde sale (el anterior se olvida).
SNF.escuchar("LOOT_OPENED", function()
  quitarTipo("botin")
  for hueco = 1, tonumber(llamar("GetNumLootItems")) or 0 do
    local id = idDeEnlace(llamar("GetLootSlotLink", hueco))
    local tipo, de = origenDeGuid((llamar("GetLootSourceInfo", hueco)))
    if id and tipo then
      anadir(id, {o = "botin", [tipo] = de})
    end
  end
end)

-- Correo: se apunta al coger el adjunto (TakeInboxItem) o todos los de una carta (AutoLootMailItem, mayúsculas + clic).
-- La cantidad y la calidad salen de GetInboxItem (si no, 1 y la del enlace). Una factura de comprador es una compra en
-- la subasta (con lo pagado); el nombre del vendedor que trae nunca se guarda. El mismo adjunto cogido otra vez dentro
-- de la ventana (doble clic) no se apunta dos veces.
local ADJUNTOS_MAX = 16 -- ATTACHMENTS_MAX_RECEIVE del cliente
local cogidos = {} -- ["indice:adjunto:id"] = GetTime() de la última vez

local function apuntarAdjunto(indice, adjunto)
  local enlace = llamar("GetInboxItemLink", indice, adjunto)
  local _, idCarta, _, cantidad, calidad = llamar("GetInboxItem", indice, adjunto)
  local id = idDeEnlace(enlace) or (positivo(idCarta) and idCarta or nil)
  if not id then
    return
  end
  local clave = string.format("%s:%s:%d", tostring(indice), tostring(adjunto), id)
  if cogidos[clave] and ahora() - cogidos[clave] <= Diario.VENTANA then
    return
  end
  cogidos[clave] = ahora()
  local ctx = {o = "correo"}
  local tipoFactura, _, _, puja = llamar("GetInboxInvoiceInfo", indice)
  if type(tipoFactura) == "string" and not esSecreto(tipoFactura) and tipoFactura == "buyer" then
    ctx.o = "subasta"
    if positivo(puja) then
      ctx.p = puja
    end
  end
  if type(calidad) ~= "number" or esSecreto(calidad) then
    calidad = calidadDe(enlace)
  end
  if Diario.apuntar(id, positivo(cantidad) and cantidad or 1, ctx, calidad) then
    local lista = yaApuntados[id] or {}
    yaApuntados[id] = lista
    lista[#lista + 1] = {t = ahora()}
  end
end

enganchar("TakeInboxItem", apuntarAdjunto)

enganchar("AutoLootMailItem", function(indice)
  for adjunto = 1, tonumber(rawget(_G, "ATTACHMENTS_MAX_RECEIVE")) or ADJUNTOS_MAX do
    if llamar("GetInboxItemLink", indice, adjunto) or llamar("GetInboxItem", indice, adjunto) then
      apuntarAdjunto(indice, adjunto)
    end
  end
end)

-- ¿Este objeto ya se apuntó al cogerlo del correo hace poco? Si sí, se gasta la marca.
local function gastarYaApuntado(id)
  local lista = yaApuntados[id]
  if not lista then
    return false
  end
  vivos(lista)
  return table.remove(lista, 1) ~= nil
end

local function contextoDe(leido)
  if leido.creado then
    return {o = "fabricado"}
  end
  return Diario.contextoPara(leido.id) or {o = "desconocido"}
end

SNF.escuchar("CHAT_MSG_LOOT", function(texto)
  if esSecreto(texto) then
    local d = guardado()
    if d then
      d.omitidos = (tonumber(d.omitidos) or 0) + 1
    end
    return
  end
  local leido = Diario.leerMensaje(texto)
  if leido and not gastarYaApuntado(leido.id) then
    Diario.apuntar(leido.id, leido.cantidad, contextoDe(leido), leido.calidad)
  end
end)

---------------------------------------------------------------------------------------------------
-- /snet diario (Diario.mostrar): las últimas n entradas (5 por defecto), de la más nueva a la más vieja, una por línea:
-- «SnetForever: <objeto> — <origen>». Los nombres salen de la base (Datos); el precio, con el formato de comercio.
---------------------------------------------------------------------------------------------------

-- Con el addon de comercio, su formato (UIComercio.dinero, que es Tema.dineroPlano). Sin él (0.7.0: desactivado en la
-- lista de addons), el mismo texto del mismo sitio, SNF.Texto.dinero: «1g 40s 03c» (B6r, punto 11; revisión B7).
local function dinero(cobre)
  local UIComercio = rawget(SNF, "UIComercio")
  if type(UIComercio) == "table" and type(UIComercio.dinero) == "function" then
    return UIComercio.dinero(cobre)
  end
  return SNF.Texto.dinero(math.floor((tonumber(cobre) or 0) + 0.5))
end

local function textoOrigen(e)
  local L, Datos = SNF.L, SNF.Datos
  local o = e.o
  if o == "mision" then
    return L.t("DIARIO_MISION", e.q and Datos.nombreMision(e.q) or "?")
  elseif o == "botin" then
    local de = e.npc and Datos.nombrePNJ(e.npc) or e.obj and Datos.nombreObjeto(e.obj)
    return de and L.t("DIARIO_BOTIN", de) or L.t("DIARIO_BOTIN_SIN")
  elseif o == "vendedor" then
    local texto = L.t("DIARIO_VENDEDOR", e.npc and Datos.nombrePNJ(e.npc) or L.t("DIARIO_UN_VENDEDOR"))
    return e.p and (texto .. L.t("DIARIO_POR", dinero(e.p))) or texto
  elseif o == "subasta" then
    return e.p and (L.t("DIARIO_SUBASTA") .. L.t("DIARIO_POR", dinero(e.p))) or L.t("DIARIO_SUBASTA")
  elseif o == "correo" then
    return L.t("DIARIO_CORREO")
  elseif o == "fabricado" then
    return L.t("DIARIO_FABRICADO")
  end
  return L.t("DIARIO_DESCONOCIDO")
end

function Diario.mostrar(n)
  local L, Datos = SNF.L, SNF.Datos
  local e = Diario.entradas()
  if #e == 0 then
    print(L.t("DIARIO_VACIO"))
    return
  end
  n = tonumber(n) or 5
  for k = #e, math.max(1, #e - n + 1), -1 do
    local x = e[k]
    print(L.t("DIARIO_LINEA", Datos.nombreItem(x.i), textoOrigen(x)))
  end
end
