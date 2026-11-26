-- SnetForever: texto en pantalla (tarea 14). Convierte lo que traen los datos de los pasos (marcadores |cRXP_<TIPO>_,
-- iconos |T…|t, nombres con ::id y saltos \n escritos a mano) y los textos generados para los elementos sin texto en
-- el texto final que enseña la ventana, en español o inglés.
--
-- Texto.colorear(s) -> s     |cRXP_<TIPO>_ pasa a |c<color> (los seis colores del tema); un RXP_X_ desconocido se
--                            quita entero; \n escrito (barra y n) pasa a salto de línea. Los iconos |T…|t se respetan.
-- Texto.limpiar(s, el?) -> s «Nombre::id» pasa al nombre del PNJ en el idioma activo; se queda el nombre escrito si
--                            los datos no tienen ese PNJ en ese idioma o si el escrito ya contiene el de los datos
--                            (plurales); un ::id suelto se quita; *quest* pasa al nombre de la misión de `el`.
-- Texto.deElemento(el, mem) -> s  texto final de un elemento: el de los datos (L.de(el.texto)) o uno generado con L;
--                            T2: una entrega a medias (Elementos.faltan: la misión está en el diario y le faltan
--                            objetivos) dice «Completa «X» antes de entregarla:» y una línea por objetivo con su texto
--                            y su hecho/pedido del juego, también si la guía trae su propio texto;
--                            "" si el elemento no tiene nada que enseñar (condiciones, mob, target...). `mem` es la
--                            memoria del elemento vivo; hoy ningún texto la necesita. Memorizado por elemento hasta
--                            que cambie el idioma, su objetivo (complete) o lo que se lleva (collect).
-- Texto.olvidar()            olvida esa memoria (la ventana lo llama en cada repintado entero).
-- Texto.olvidarObjeto(id) / Texto.olvidarMision(id) -> boolean  olvida solo la de los elementos que citan ese objeto
--                            (i, is) o esa misión (q, qs); dice si había alguno. La ventana los llama cuando el
--                            cliente da tarde un nombre (GET_ITEM_INFO_RECEIVED, QUEST_DATA_LOAD_RESULT).
-- Texto.resumenPaso(pasoVivo) -> s  primer elemento con texto, sin colores ni iconos, en una línea y de 60 caracteres
--                            como mucho. Al cargar, Motor.resumir pasa a ser esta función (lista de saltados).
-- Texto.icono(el, mem?) -> ruta, izq, der, arriba, abajo  icono de Blizzard de un elemento (tabla b.4 del plano de
--                            diseño): por tipo de elemento; un complete mira el tipo de su objetivo (monstruo
--                            espadas, objeto de misión bolsa, otro el sanador); nota/manual con «Habla con…» o
--                            «Talk to…» y gossipoption, el bocadillo (salvo si su texto ya lo trae); use, equip y
--                            destroy el icono del propio objeto. nil si el elemento no lleva icono. Solo el goto
--                            devuelve además el recorte de textura (0,08-0,92).
-- Texto.lineasPaso(pasoVivo, max?) -> {{icono?, recorte?, texto, sangria}, ...}  líneas de un paso para la ventana,
--                            en orden: los elementos con texto (el recorrido solo si no hay otros), con su icono,
--                            en una sola línea cada una. `sangria` son los píxeles a la izquierda del texto: 0 con
--                            icono y 16 (12 del icono y 4 de espacio) sin él, para alinear. Con más de `max` líneas
--                            se quedan las `max` primeras y una última «…». T2: una entrega a medias sale con la
--                            primera línea (sin los objetivos): la lista enseña que le faltan.
-- Texto.iconoRequisito(estado) -> ruta  ReadyCheck de un requisito ("ok", "falta" o "aviso").
-- Texto.numero(n, decimales?) -> s  número a texto con string.format: sin decimales, un entero sale sin «.0» (en el
--                            juego un 10 es «10», en fengari un 10/1 es 10.0) y un decimal sale con uno.
-- Texto.entero(n) -> s       F5: redondeado a entero (las mitades lejos del cero) y con el separador de miles del idioma
--                            del addon: «2.054» en español, «2,054» en inglés. Sin número, «0».
-- Texto.dinero(cobre, colores?) -> s  el dinero de todo el addon (revisión B7, menor 10): «10g 49s 07c». Sin ceros a la
--                            izquierda; los céntimos y, con oro, la plata llevan dos cifras; negativo, con «-». Las letras
--                            son los textos COMERCIO_ORO, COMERCIO_PLATA y COMERCIO_COBRE («g», «s», «c»), guardadas y
--                            rehechas al cambiar de idioma (revisión B7, menor 11: antes se pedían en cada llamada y el
--                            tooltip de objeto, que lo llama mucho, costaba un 15 % más). colores = {oro, plata, cobre}
--                            («rrggbb»): cada parte en su color. Es el único sitio del dinero: lo usan Tema.dinero y
--                            Tema.dineroPlano (el comercio: ventana, botones, tooltip), el chat y el diario.
local _, SNF = ...
local API = SNF.API -- compatibilidad con el cliente (nucleo/espacio.lua)
local Texto = {}
SNF.Texto = Texto

local L = SNF.L
local letrasDinero -- {oro, plata, cobre} en el idioma de ahora; nil: por hacer (Texto.dinero)
local Datos = SNF.Datos
local Misiones = SNF.Misiones

local MAX_RESUMEN = 60 -- caracteres del resumen de un paso

-- Colores de los marcadores de las guías (plano 2 §11, plano 3 §6.1).
local COLORES = {
  FRIENDLY = "FF00FF25",
  ENEMY = "FFFF5722",
  LOOT = "FF00BCD4",
  WARN = "FFFCDC00",
  PICK = "FFDB2EEF",
  BUY = "FF0E8312",
}

-- Iconos por tipo de elemento (todas son texturas de Blizzard que existen en Forever). Los que dependen del
-- elemento (complete, notas, objetos) se resuelven en Texto.icono.
local ICONO_BOCADILLO = "Interface\\WorldMap\\ChatBubble_64Grey"
local ICONO_BOLSA = "Interface\\GossipFrame\\VendorGossipIcon"
local ICONO_ESPADAS = "Interface\\GossipFrame\\BattleMasterGossipIcon"
local ICONO_SANADOR = "Interface\\GossipFrame\\HealerGossipIcon"
local ICONO_INTERROGANTE = "Interface\\Icons\\INV_Misc_QuestionMark"

local ICONOS = {
  accept = "Interface\\GossipFrame\\AvailableQuestIcon",
  daily = "Interface\\GossipFrame\\AvailableQuestIcon",
  turnin = "Interface\\GossipFrame\\ActiveQuestIcon",
  dailyturnin = "Interface\\GossipFrame\\ActiveQuestIcon",
  collect = ICONO_BOLSA,
  ["goto"] = "Interface\\Icons\\INV_Misc_Map_01",
  hs = "Interface\\Minimap\\Tracking\\Innkeeper",
  home = "Interface\\Minimap\\Tracking\\Innkeeper",
  fp = "Interface\\Minimap\\Tracking\\FlightMaster",
  fly = "Interface\\Minimap\\Tracking\\FlightMaster",
  trainer = "Interface\\GossipFrame\\TrainerGossipIcon",
  train = "Interface\\GossipFrame\\TrainerGossipIcon",
  vendor = ICONO_BOLSA,
  stable = "Interface\\Minimap\\Tracking\\StableMaster",
  xp = "Interface\\Icons\\INV_Misc_Book_09",
}

-- Recorte de textura (izq, der, arriba, abajo) del icono del goto: quita el borde del icono de Blizzard.
local RECORTE_GOTO = {0.08, 0.92, 0.08, 0.92}

-- Tipo de objetivo (Misiones.objetivo) → icono del complete; el que no está (object, event, sin dato) usa el sanador.
local ICONOS_COMPLETE = {monster = ICONO_ESPADAS, item = ICONO_BOLSA}

local SANGRIA_SIN_ICONO = 16 -- 12 del icono y 4 de espacio

local ICONOS_REQUISITO = {
  ok = "Interface\\RaidFrame\\ReadyCheck-Ready",
  falta = "Interface\\RaidFrame\\ReadyCheck-NotReady",
  aviso = "Interface\\RaidFrame\\ReadyCheck-Waiting",
}

-- Elementos de recorrido: su texto generado solo vale si no hay otro con texto en el paso (resumenPaso).
local NAVEGACION = {["goto"] = true, waypoint = true, pin = true, line = true, loop = true}

---------------------------------------------------------------------------------------------------
-- Números
---------------------------------------------------------------------------------------------------

local LIMITE_D = 2147483648 -- 2^31: %d no se usa con valores así (en el banco los enteros son de 32 bits)

function Texto.numero(n, decimales)
  n = tonumber(n) or 0
  if n ~= n or n == math.huge or n == -math.huge then
    return "0"
  end
  if decimales and decimales > 0 then
    return string.format(string.format("%%.%df", math.floor(decimales)), n)
  end
  if n >= LIMITE_D or n <= -LIMITE_D then
    return string.format("%.0f", n)
  end
  if n == math.floor(n) then
    return string.format("%d", n)
  end
  return string.format("%.1f", n)
end

-- F5: entero (las mitades lejos del cero) y con el separador de miles del idioma del addon: «2.054» en es y «2,054» en
-- en. No usa BreakUpLargeNumbers del cliente: ese sigue el idioma del juego, no el del addon.
function Texto.entero(n)
  n = tonumber(n) or 0
  if n ~= n or n == math.huge or n == -math.huge then
    return "0"
  end
  local signo = ""
  if n < 0 then
    signo, n = "-", -n
  end
  n = math.floor(n + 0.5)
  if n == 0 then
    return "0"
  end
  local s = string.format("%.0f", n)
  local sep = L.idioma() == "en" and "," or "."
  local hechos
  repeat
    s, hechos = string.gsub(s, "^(%d+)(%d%d%d)", "%1" .. sep .. "%2")
  until hechos == 0
  return signo .. s
end

-- Las letras del dinero, del idioma de ahora: se hacen la primera vez y se rehacen al cambiar de idioma.
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "idioma" then
    letrasDinero = nil
  end
end)

function Texto.dinero(cobre, colores)
  local l = letrasDinero
  if not l then
    l = {oro = L.t("COMERCIO_ORO"), plata = L.t("COMERCIO_PLATA"), cobre = L.t("COMERCIO_COBRE")}
    letrasDinero = l
  end
  cobre = math.floor(tonumber(cobre) or 0)
  local signo = ""
  if cobre < 0 then
    signo, cobre = "-", -cobre
  end
  local oro = math.floor(cobre / 10000)
  local plata = math.floor(cobre / 100) % 100
  local resto = cobre % 100
  local o, p
  if oro > 0 then
    o = oro .. l.oro
  end
  if oro > 0 or plata > 0 then
    p = string.format(oro > 0 and "%02d" or "%d", plata) .. l.plata
  end
  local c = string.format(p and "%02d" or "%d", resto) .. l.cobre
  if colores then
    c = "|cff" .. colores.cobre .. c .. "|r"
    p = p and ("|cff" .. colores.plata .. p .. "|r")
    o = o and ("|cff" .. colores.oro .. o .. "|r")
  end
  if o then
    return signo .. o .. " " .. p .. " " .. c
  elseif p then
    return signo .. p .. " " .. c
  end
  return signo .. c
end

-- Entero para un %d de L.t.
local function entero(n)
  return math.floor(tonumber(n) or 0)
end

---------------------------------------------------------------------------------------------------
-- Colores y nombres
---------------------------------------------------------------------------------------------------

function Texto.colorear(s)
  s = string.gsub(s, "|cRXP_(%u+)_", function(tipo)
    local color = COLORES[tipo]
    return color and ("|c" .. color) or ""
  end)
  s = string.gsub(s, "\\n", "\n")
  -- Un «|» suelto que no abre un código válido del juego (algunos textos de RestedXP traen «!|==|r») se escapa como
  -- «||» para que se vea tal cual y no rompa la línea. Los «||» ya escapados se respetan.
  s = string.gsub(s, "||", "\001")
  s = string.gsub(s, "|([^cCrRnNhHtTaAkK])", "||%1")
  s = string.gsub(s, "|$", "||")
  s = string.gsub(s, "\001", "||")
  return s
end

-- Nombre del PNJ `id` en el idioma activo, o nil si los datos no lo tienen en ese idioma. En español, un PNJ sin
-- nombre español en los datos da nil (Datos.nombrePNJ daría el inglés): el nombre escrito en el texto ya está en
-- español y es mejor que uno en inglés.
local function nombreDelPNJ(id)
  id = tonumber(id)
  if L.idioma() == "es" then
    local es = SNF_MISIONES and SNF_MISIONES.es and SNF_MISIONES.es.npc and SNF_MISIONES.es.npc[id]
    if not (es and es.name) then
      return nil
    end
  end
  local ok, nombre = pcall(Datos.nombrePNJ, id)
  if ok and type(nombre) == "string" and not string.find(nombre, "^#%d+$") then
    return nombre
  end
  return nil
end

-- ¿El nombre escrito ya contiene el de los datos («Vuldrens» ya tiene «Vuldren»)? Entonces se queda el escrito
-- (un plural o un añadido del autor de la guía), no se pierde por el singular de los datos.
local function yaLoLleva(escrito, nombre)
  return string.find(string.lower(escrito), string.lower(nombre), 1, true) ~= nil
end

local function nombreDeMision(el)
  local q = el and (el.q or (el.qs and el.qs[1]))
  return q and Datos.nombreMision(q) or ""
end

-- «Color» + «Nombre::id»: el nombre del PNJ en el idioma activo o, sin él, el escrito.
local function cambiarNombre(color, escrito, id)
  local nombre = nombreDelPNJ(id)
  if nombre and not (escrito ~= "" and yaLoLleva(escrito, nombre)) then
    return color .. nombre
  end
  return color .. escrito
end

function Texto.limpiar(s, el)
  s = string.gsub(s, "(|c%x%x%x%x%x%x%x%x)([^|]-)::(%d+)", cambiarNombre)
  s = string.gsub(s, "(|cRXP_%u+_)([^|]-)::(%d+)", cambiarNombre)
  s = string.gsub(s, "::%d+", "")
  if string.find(s, "*quest*", 1, true) then
    local nombre = nombreDeMision(el)
    s = string.gsub(s, "%*quest%*", function()
      return nombre
    end)
  end
  return s
end

---------------------------------------------------------------------------------------------------
-- Textos generados
---------------------------------------------------------------------------------------------------

-- Nombres de varias misiones o varios objetos, unidos con «/» o «,».
local function nombresDeMisiones(qs)
  local nombres = {}
  for i = 1, #qs do
    nombres[i] = Datos.nombreMision(qs[i])
  end
  return table.concat(nombres, " / ")
end

local function nombresDeObjetos(ids)
  local nombres = {}
  for i = 1, #ids do
    nombres[i] = Datos.nombreItem(ids[i])
  end
  return table.concat(nombres, ", ")
end

local function nombreDeHechizo(id)
  local nombre
  if C_Spell and C_Spell.GetSpellName then
    nombre = C_Spell.GetSpellName(id)
  end
  if not nombre and GetSpellInfo then
    nombre = (GetSpellInfo(id))
  end
  return nombre or string.format("#%d", entero(id))
end

local function nombreDeProfesion(p)
  local clave = "PROFESION_" .. string.upper(p)
  if L.tablas[L.idioma()][clave] or L.tablas.en[clave] then
    return L.t(clave)
  end
  return p
end

local function nombreDeMapa(mapa)
  local info = mapa and C_Map and C_Map.GetMapInfo and C_Map.GetMapInfo(mapa)
  return info and info.name or nil
end

-- Una coordenada con un decimal y sin «.0» final (tarea 16, Vigilancia 4): 43.29 → «43.3», 69.0 → «69».
local function coordenada(v)
  return Texto.numero(SNF.U.redondear(v, 1))
end

-- Coordenadas «43.3, 69» de un goto: x, y si están; si no, las de zona a partir del punto de mundo.
local function coordenadas(el)
  local x, y = el.x, el.y
  if (x == nil or y == nil) and SNF.Coord and el.mapa then
    local ok, cx, cy = pcall(SNF.Coord.aMapa, el)
    if ok then
      x, y = cx, cy
    end
  end
  if x == nil or y == nil then
    return nil
  end
  return string.format("%s, %s", coordenada(x), coordenada(y))
end

local function textoDeGoto(el)
  local nombre = nombreDeMapa(el.mapa)
  local coords = coordenadas(el)
  if nombre and coords then
    return L.t("VE_A", nombre, coords)
  end
  if nombre or coords then
    return L.t("VE_A_LUGAR", nombre or coords)
  end
  return ""
end

-- Cuántos lleva el jugador de los objetos de un collect (los de `is` o el de `i`).
local function llevaDe(ids)
  local total = 0
  for i = 1, #ids do
    total = total + (API.cuentaObjeto(ids[i]) or 0)
  end
  return total
end

-- Lote F: con el motor moderno el texto o los números del objetivo pueden ser secretos; no se usan (ni se comparan) y
-- sale el texto generado con lo que no lo sea.
local function textoDeComplete(el)
  local objetivo = Misiones.objetivo(el.q, el.objetivo or 1)
  local texto = objetivo and objetivo.texto
  if type(texto) == "string" and not API.esSecreto(texto) and texto ~= "" then
    return texto
  end
  local hecho = objetivo and not API.esSecreto(objetivo.hecho) and objetivo.hecho or 0
  local pedido = el.max or (objetivo and not API.esSecreto(objetivo.pedido) and objetivo.pedido) or 1
  return L.t("TEXTO_CUENTA", Datos.nombreMision(el.q), entero(hecho), entero(pedido))
end

local function textoDeCollect(el)
  local ids = el.is or {el.i}
  return L.t("TEXTO_CUENTA", nombresDeObjetos(ids), entero(llevaDe(ids)), entero(el.n))
end

-- T2: una línea por objetivo de la misión q, como los da el juego: su texto si ya trae la cuenta («Raíz: 1/3»); si no,
-- con su hecho/pedido. Lo secreto (lote F) no se usa.
local MAX_OBJETIVOS = 10

local function lineaObjetivo(o, k)
  local texto = o.texto
  if type(texto) ~= "string" or API.esSecreto(texto) or texto == "" then
    texto = nil
  end
  if texto and string.find(texto, "%d+%s*/%s*%d+") then
    return "- " .. texto
  end
  local nombre = texto or L.t("OBJETIVO_SIN_TEXTO", k)
  local hecho = not API.esSecreto(o.hecho) and tonumber(o.hecho) or nil
  local pedido = not API.esSecreto(o.pedido) and tonumber(o.pedido) or nil
  if hecho and pedido then
    return "- " .. L.t("TEXTO_CUENTA", nombre, entero(hecho), entero(pedido))
  end
  return "- " .. nombre
end

local function textoAMedias(el)
  local partes = {L.t("ENTREGA_A_MEDIAS", Datos.nombreMision(el.q))}
  for k = 1, MAX_OBJETIVOS do
    local o = Misiones.objetivo(el.q, k)
    if not o then
      break
    end
    partes[#partes + 1] = lineaObjetivo(o, k)
  end
  return table.concat(partes, "\n")
end

-- ¿Es una entrega a medias? (Elementos.faltan; sin el registro de elementos, no). Ronda 1: con la casilla marcada a mano
-- (mem.forzado) el motor la da por hecha: no lo es.
local function esAMedias(el, mem)
  local Elementos = SNF.Elementos
  return type(el) == "table" and el.t == "turnin" and not (type(mem) == "table" and mem.forzado)
    and Elementos ~= nil and Elementos.faltan ~= nil and Elementos.faltan(el) ~= nil
end

local function textoDeXp(el)
  if el.faltan then
    return L.t("SUBE_XP", Texto.numero(el.faltan), entero(el.nivel))
  end
  return L.t("SUBE_NIVEL", entero(el.nivel))
end

-- Texto generado por tipo de elemento (los que no están no enseñan nada sin texto propio).
local GENERADORES = {
  -- Con `objeto` (lote «Cadenas de mejoras»: se acepta o se entrega en un objeto del mundo), también su nombre.
  accept = function(el)
    if el.objeto then
      return L.t("ACEPTA_EN", Datos.nombreMision(el.q), Datos.nombreObjeto(el.objeto))
    end
    -- 12-nov: la misión la inicia un objeto de la bolsa: se dice cómo aceptarla.
    local objetos = Datos.objetosQueInician and Datos.objetosQueInician(el.q)
    if objetos then
      return L.t("ACEPTA_OBJETO", Datos.nombreItem(objetos[1]), Datos.nombreMision(el.q))
    end
    -- 12-nov: el juego no la da: se dice qué previa falta.
    if not Misiones.enDiario(el.q) then
      local no, previa = Misiones.noSePuedeCoger(el.q)
      if no and previa then
        return L.t("ACEPTA_NO_DISPONIBLE", Datos.nombreMision(el.q), Datos.nombreMision(previa))
      end
    end
    return L.t("ACEPTA", Datos.nombreMision(el.q))
  end,
  daily = function(el)
    return L.t("ACEPTA", nombresDeMisiones(el.qs))
  end,
  turnin = function(el)
    if el.objeto then
      return L.t("ENTREGA_EN", Datos.nombreMision(el.q), Datos.nombreObjeto(el.objeto))
    end
    return L.t("ENTREGA", Datos.nombreMision(el.q))
  end,
  dailyturnin = function(el)
    return L.t("ENTREGA", nombresDeMisiones(el.qs))
  end,
  abandon = function(el)
    return L.t("ABANDONA", nombresDeMisiones(el.qs))
  end,
  complete = textoDeComplete,
  collect = textoDeCollect,
  ["goto"] = textoDeGoto,
  xp = textoDeXp,
  skill = function(el)
    return L.t("HABILIDAD_SUBE", nombreDeProfesion(el.p), entero(el.n))
  end,
  train = function(el)
    return L.t("APRENDE", nombreDeHechizo(el.spell))
  end,
  aura = function(el)
    return L.t("AURA", nombreDeHechizo(el.spell))
  end,
  vendor = function()
    return L.t("COMPRA_VENDE")
  end,
  trainer = function()
    return L.t("ENTRENA")
  end,
  stable = function()
    return L.t("ESTABLO")
  end,
  fp = function(el)
    if el.nombre then
      return L.t("VUELO_COGE_DE", el.nombre)
    end
    return L.t("VUELO_COGE")
  end,
  fly = function(el)
    if el.destino then
      return L.t("VUELA_A", el.destino)
    end
    return L.t("VUELA")
  end,
  hs = function()
    return L.t("HOGAR_USA")
  end,
  home = function()
    return L.t("HOGAR_VINCULA")
  end,
  deathskip = function()
    return L.t("MUERTE_SALTA")
  end,
  use = function(el)
    return L.t("USA", nombresDeObjetos(el.is))
  end,
  destroy = function(el)
    return L.t("TIRA", Datos.nombreItem(el.i))
  end,
  equip = function(el)
    if el.i then
      return L.t("EQUIPA", Datos.nombreItem(el.i))
    end
    return ""
  end,
  bankdeposit = function(el)
    return L.t("DEPOSITA", nombresDeObjetos(el.is))
  end,
  zone = function(el)
    local nombre = nombreDeMapa(el.mapa)
    return nombre and L.t("ENTRA_EN", nombre) or ""
  end,
  subzone = function(el)
    return L.t("ENTRA_EN", Datos.nombreZona(el.area))
  end,
}

-- Texto de los datos del elemento, o nil si no lo trae.
local function textoDeDatos(el)
  local propio = L.de(el.texto)
  if type(propio) == "string" and propio ~= "" then
    return propio
  end
  return nil
end

local function generado(el, mem)
  local generador = GENERADORES[el.t]
  if not generador then
    return ""
  end
  return generador(el, mem)
end

local function calcularTexto(el, mem)
  local propio = textoDeDatos(el)
  local s
  if esAMedias(el, mem) then
    s = textoAMedias(el) -- T2: manda también sobre el texto de la guía
  else
    s = propio or generado(el, mem)
  end
  if s == "" then
    return ""
  end
  return Texto.colorear(Texto.limpiar(s, el))
end

-- Memoria de Texto.deElemento (revisión del proyecto, I2): la ventana pide los mismos textos en cada evento del diario
-- y rehacerlos (nombres, colores, varios gsub) no sale gratis. Se guarda el texto de cada elemento con lo que hace que
-- cambie: el idioma, el objetivo de un complete (texto, hecho y pedido, como los da el juego) y lo que se lleva de un
-- collect. Lo demás (nombres del cliente que llegan tarde, como el de un objeto) se rehace con Texto.olvidar(), que
-- llama la ventana en cada repintado entero.
local memoria = setmetatable({}, {__mode = "k"}) -- [el] = {version, idioma, a, b, c, texto}
local version = 0

-- Ronda 1 del lote A: además de cambiar de versión se vacía la memoria. Así, tras cada repintado entero, solo quedan los
-- textos de lo que se ha pintado desde entonces, y olvidarObjeto/olvidarMision solo piden repintar por algo a la vista.
function Texto.olvidar()
  version = version + 1
  memoria = setmetatable({}, {__mode = "k"})
end

-- Lote A (Minor 1 de la revisión de I2): cuando el cliente recibe los datos de un objeto o de una misión que no tenía
-- en caché (GET_ITEM_INFO_RECEIVED, QUEST_DATA_LOAD_RESULT), la ventana olvida solo los textos de los elementos que lo
-- citan (`i`/`is` o `q`/`qs`). Devuelven si olvidaron alguno: si no, no hace falta repintar.
local function cita(el, uno, varios, id)
  if el[uno] == id then
    return true
  end
  local lista = el[varios]
  if type(lista) == "table" then
    for i = 1, #lista do
      if lista[i] == id then
        return true
      end
    end
  end
  return false
end

local function olvidarLosQue(uno, varios, id)
  local alguno = false
  for el in pairs(memoria) do
    if cita(el, uno, varios, id) then
      memoria[el] = nil
      alguno = true
    end
  end
  return alguno
end

function Texto.olvidarObjeto(id)
  return olvidarLosQue("i", "is", id)
end

function Texto.olvidarMision(id)
  return olvidarLosQue("q", "qs", id)
end

-- Lote F: un valor secreto no se guarda ni se compara en la memoria (textoDeComplete tampoco lo usa): va esta marca.
local SECRETO = {}
local function legible(v)
  if API.esSecreto(v) then
    return SECRETO
  end
  return v
end

-- T2: lo que cambia el texto de una entrega a medias: los objetivos como los da el juego (texto, hecho, pedido y si están
-- terminados), en un texto; nil si no está a medias.
local function firmaAMedias(el, mem)
  if not esAMedias(el, mem) then
    return nil
  end
  local partes = {"m"}
  for k = 1, MAX_OBJETIVOS do
    local o = Misiones.objetivo(el.q, k)
    if not o then
      break
    end
    for _, v in ipairs({o.texto, o.hecho, o.pedido, o.terminado}) do
      partes[#partes + 1] = API.esSecreto(v) and "?" or tostring(v)
    end
  end
  return table.concat(partes, "\1")
end

-- Hasta tres valores con lo que cambia en el juego el texto de `el` (nil si nada).
local function variable(el, mem)
  if el.t == "turnin" then
    return firmaAMedias(el, mem)
  end
  if textoDeDatos(el) then
    return nil
  end
  if el.t == "complete" then
    local objetivo = Misiones.objetivo(el.q, el.objetivo or 1)
    if objetivo then
      return legible(objetivo.texto), legible(objetivo.hecho), legible(objetivo.pedido)
    end
    return nil
  elseif el.t == "collect" then
    return llevaDe(el.is or {el.i})
  end
  return nil
end

function Texto.deElemento(el, mem)
  if type(el) ~= "table" then
    return calcularTexto(el, mem)
  end
  local idioma = L.idioma()
  local a, b, c = variable(el, mem)
  local m = memoria[el]
  if m and m.version == version and m.idioma == idioma and m.a == a and m.b == b and m.c == c then
    return m.texto
  end
  local texto = calcularTexto(el, mem)
  if not m then
    m = {}
    memoria[el] = m
  end
  m.version, m.idioma, m.a, m.b, m.c, m.texto = version, idioma, a, b, c, texto
  return texto
end

---------------------------------------------------------------------------------------------------
-- Resumen de un paso
---------------------------------------------------------------------------------------------------

-- Sin colores, iconos ni saltos de línea, en una sola línea.
local function sinFormato(s)
  s = string.gsub(s, "|T.-|t", "")
  s = string.gsub(s, "|c%x%x%x%x%x%x%x%x", "")
  s = string.gsub(s, "|r", "")
  s = string.gsub(s, "|+", "") -- lo que quede (un «|» suelto o escapado) no pinta nada en una sola línea
  s = string.gsub(s, "%s+", " ")
  s = string.gsub(s, "^ ", "")
  s = string.gsub(s, " $", "")
  return s
end

-- Como mucho `max` caracteres UTF-8: si pasa, los primeros max - 3 y «...» (no parte un acento por la mitad).
local function acortar(s, max)
  local inicios = {}
  for pos in string.gmatch(s, "()[\1-\127\194-\244][\128-\191]*") do
    inicios[#inicios + 1] = pos
    if #inicios > max then
      break
    end
  end
  if #inicios <= max then
    return s
  end
  local corte = string.sub(s, 1, inicios[max - 2] - 1)
  corte = string.gsub(corte, " $", "")
  return corte .. "..."
end

-- Primer texto del paso: primero el que traen los datos, luego el generado que no es de recorrido y, por último,
-- el de recorrido (un «Ve a…»).
local function primerTexto(pv)
  local elementos = pv.elementos or {}
  for _, e in ipairs(elementos) do
    local s = textoDeDatos(e.datos) and Texto.deElemento(e.datos, e.mem) or ""
    if s ~= "" then
      return s
    end
  end
  for pasada = 1, 2 do
    for _, e in ipairs(elementos) do
      if (NAVEGACION[e.datos.t] == true) == (pasada == 2) then
        local s = Texto.deElemento(e.datos, e.mem)
        if s ~= "" then
          return s
        end
      end
    end
  end
  return ""
end

-- 12-nov: por qué un paso no se puede hacer: nd = Motor.noDisponible(pv) o una entrada de saltados ({q, previa?}).
function Texto.noDisponible(nd)
  if type(nd) ~= "table" then
    return ""
  end
  if nd.previa then
    return L.t("NO_DISPONIBLE_PREVIA", Datos.nombreMision(nd.previa))
  end
  return L.t("NO_DISPONIBLE_SIN_MISION", Datos.nombreMision(nd.q))
end

function Texto.resumenPaso(pv)
  return acortar(sinFormato(primerTexto(pv)), MAX_RESUMEN)
end

---------------------------------------------------------------------------------------------------
-- Iconos
---------------------------------------------------------------------------------------------------

-- Icono del objeto del elemento (use: el primero de `is`; equip y destroy: `i`). Sin él, el signo de interrogación.
local function iconoDeObjeto(el)
  local id = el.i or (type(el.is) == "table" and el.is[1]) or nil
  if id then
    -- Sin API (o con el objeto sin cargar) no hay icono, no un error.
    local icono = API.iconoObjeto(id)
    if icono then
      return icono
    end
  end
  return ICONO_INTERROGANTE
end

-- Los textos de «Habla con…» (y su original «Talk to…») llevan el bocadillo delante.
local function esHablaCon(s)
  s = string.lower(sinFormato(s))
  return string.find(s, "^habla con") ~= nil or string.find(s, "^talk to") ~= nil
end

local function iconoDeNota(el, mem)
  local s = Texto.deElemento(el, mem)
  if string.find(string.lower(s), "chatbubble_64grey", 1, true) then
    return nil -- el texto ya trae su bocadillo: no se pone otro
  end
  if el.t == "gossipoption" or esHablaCon(s) then
    return ICONO_BOCADILLO
  end
  return nil
end

-- Tipo de un objetivo, en caché por (q, k): la ventana repinta a menudo (QUEST_LOG_UPDATE) y el tipo de un objetivo no
-- cambia. Solo se guarda cuando se sabe (sin datos todavía, se vuelve a preguntar).
local tiposObjetivo = {}

local function tipoObjetivo(q, k)
  local porMision = q ~= nil and tiposObjetivo[q] or nil
  if porMision and porMision[k] then
    return porMision[k]
  end
  local objetivo = Misiones.objetivo(q, k)
  local tipo = objetivo and objetivo.tipo
  if tipo and q ~= nil then
    tiposObjetivo[q] = porMision or {}
    tiposObjetivo[q][k] = tipo
  end
  return tipo
end

function Texto.icono(el, mem)
  local t = type(el) == "table" and el.t or nil
  if not t then
    return nil
  end
  if t == "complete" then
    return ICONOS_COMPLETE[tipoObjetivo(el.q, el.objetivo or 1) or ""] or ICONO_SANADOR
  elseif t == "nota" or t == "manual" or t == "gossipoption" then
    return iconoDeNota(el, mem)
  elseif t == "use" or t == "equip" or t == "destroy" then
    return iconoDeObjeto(el)
  elseif t == "goto" then
    return ICONOS["goto"], RECORTE_GOTO[1], RECORTE_GOTO[2], RECORTE_GOTO[3], RECORTE_GOTO[4]
  end
  return ICONOS[t]
end

-- Una línea de paso: el texto en una sola línea y su icono (con el recorte, si lo trae).
local function lineaDe(el, mem, s)
  s = string.gsub(s, "%s*\n%s*", " ")
  local icono, izq, der, arriba, abajo = Texto.icono(el, mem)
  if not icono then
    return {texto = s, sangria = SANGRIA_SIN_ICONO}
  end
  local linea = {icono = icono, texto = s, sangria = 0}
  if izq then
    linea.recorte = {izq, der, arriba, abajo}
  end
  return linea
end

-- T2: la primera línea de un texto, sin los dos puntos del final («Completa «X» antes de entregarla»).
local function cabecera(s)
  s = string.match(s, "^[^\n]*")
  return (string.gsub(s, "%s*:%s*$", ""))
end

function Texto.lineasPaso(pv, max)
  local salida, recorrido = {}, {}
  for _, e in ipairs(pv.elementos or {}) do
    local s = Texto.deElemento(e.datos, e.mem)
    if s ~= "" and e.datos.t == "turnin" and esAMedias(e.datos, e.mem) then
      s = cabecera(s)
    end
    if s ~= "" then
      local lista = (NAVEGACION[e.datos.t] and not textoDeDatos(e.datos)) and recorrido or salida
      lista[#lista + 1] = lineaDe(e.datos, e.mem, s)
    end
  end
  local lineas = #salida > 0 and salida or recorrido
  if max and #lineas > max then
    for i = #lineas, max + 1, -1 do
      lineas[i] = nil
    end
    lineas[max + 1] = {texto = "…", sangria = SANGRIA_SIN_ICONO}
  end
  return lineas
end

function Texto.iconoRequisito(estado)
  return ICONOS_REQUISITO[estado] or ICONOS_REQUISITO.aviso
end

SNF.Motor.resumir = Texto.resumenPaso
