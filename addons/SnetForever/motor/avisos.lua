-- SnetForever: avisos de cadenas de clase, de mejoras y de mazmorra por nivel (plano 1 §7). Lee SNF_RUTAS.avisos (si falta, no hace
-- nada):
--   avisos = Array<{id, tipo?, clase?, faccion?, filtro?, nivel, hasta?, texto = {en, es?}, area?, guia?, hechas?,
--                   modoHechas?}>
--   id texto único; tipo "cadena" (por defecto), "mejora" o "mazmorra"; clase en mayúsculas ("DRUID"; solo los de cadena la
--   exigen); faccion "Horde" o "Alliance" (sin ella, las dos); filtro el de las guías (raza, sexo...); nivel desde el que
--   toca y hasta (opcional) el último nivel en que toca; area (mazmorra) da el nombre al texto; guia la clave de la guía
--   (sin ella o si no existe, el aviso solo informa); hechas = misiones que lo apagan: con modoHechas "alguna" (por
--   defecto) basta una entregada y con "todas" hacen falta todas.
--   Cadena: ajuste «avisos.cadenas». Mazmorra: «avisos.mazmorras» (por defecto encendido solo con la versión
--   «Con mazmorras»; si el jugador lo cambia a mano, manda lo suyo con cualquier versión). Mejora (lote «Cadenas de
--   mejoras»: «Puedes conseguir: Saco de dormir acogedor»): «avisos.mejoras», encendido por defecto; vale para cualquier
--   clase (manda el filtro de raza y la facción). Un addon anterior la trataría como de cadena sin clase: no la enseña.
--   inicio = {mapa, x, y} (ronda 1 del lote de mejoras): dónde empieza. El texto lo dice («… (empieza en <zona>)») y el
--   aviso no se mete en la cola mientras el personaje esté en otro continente.
--
-- Avisos.revisar(nivel?)   Mete en la cola cada aviso activo para la clase, la facción y la raza del personaje
--                          con nivel <= el suyo que no esté visto ni ya en la cola, y emite SNF_AVISO(aviso).
--                          Se llama en PLAYER_LEVEL_UP, al entrar al mundo y (lote C, revisión 52, Minor 4) al cambiar
--                          avisos.cadenas, avisos.mazmorras, avisos.mejoras o la versión (de la que depende el valor por
--                          defecto de avisos.mazmorras). La ventana (tarea 16) enseña la cola.
-- Avisos.cola() -> Aviso[]               sin los que ya están hechos.
-- Avisos.texto(aviso) -> string          su texto propio; sin él y con area, «Mazmorra: <nombre del área>».
-- Avisos.ahora(id) -> boolean   abre la guía del aviso con Guias.abrirLateral (guarda la actual en SnetForeverPJ.volverA,
--                               salvo que sea ya la lateral de otro aviso; se apunta en SnetForeverPJ.lateral) y devuelve
--                               true si cargó la guía.
-- Avisos.masTarde(id)           lo añade a pendientes.
--   Las dos marcan vistos[id] y lo sacan de la cola (ahora también de pendientes).
-- Avisos.pendientes() -> Aviso[]; Avisos.tieneGuia(aviso) -> boolean (aviso o id).
-- Avisos.volverA() -> clave | nil          la guía a la que volver (SnetForeverPJ.volverA).
-- Avisos.ofrecerVuelta() -> clave | nil    volverA solo si la guía cargada ha acabado: el estado de fin lo ofrece.
-- Avisos.botonVolver() -> clave | nil      16-nov: la del botón «Volver a» de la ventana: volverA al acabar la lateral o
--                                          si la guía de vuelta tiene algo que hacer ahora (Guias.algoQueHacer).
-- Avisos.pasoVolver(clave?) -> n | nil     T3: el número del paso guardado de la guía de vuelta (nil si está acabada).
-- Avisos.volver() -> boolean              carga volverA (y llegar a ella la desapila: ronda 2, la vuelta es una pila).
--
-- Persistencia (SnetForeverPJ.avisos): vistos[id] = true y pendientes = {id, ...}. La cola no se guarda: se rehace al
-- entrar al mundo, y los avisos sin atender (ni «ahora» ni «más tarde») vuelven a aparecer.
local _, SNF = ...
local Avisos = {}
SNF.Avisos = Avisos

local Datos = SNF.Datos
local Ajustes = SNF.Ajustes
local Personaje = SNF.Personaje
local Guias = SNF.Guias
local Motor = SNF.Motor

local enCola = {} -- Aviso[], en el orden en que llegaron

-- La lista de avisos de los datos, o nil si no hay.
local function lista()
  if type(SNF_RUTAS) ~= "table" or type(SNF_RUTAS.avisos) ~= "table" then
    return nil
  end
  return SNF_RUTAS.avisos
end

local function porId(id)
  for _, aviso in ipairs(lista() or {}) do
    if type(aviso) == "table" and aviso.id == id then
      return aviso
    end
  end
  return nil
end

local function indiceEnCola(id)
  for i, aviso in ipairs(enCola) do
    if aviso.id == id then
      return i
    end
  end
  return nil
end

local function estado()
  SNF.Guardado.preparar()
  return SnetForeverPJ.avisos
end

-- ¿Ya está hecho? `hechas` son misiones; con modoHechas «alguna» (por defecto) basta una entregada, con «todas» hacen
-- falta todas. Sin `hechas` (o vacío) nunca está hecho.
local function estaHecho(aviso)
  local hechas = aviso.hechas
  if type(hechas) ~= "table" or #hechas == 0 then
    return false
  end
  local todas = aviso.modoHechas == "todas"
  for _, q in ipairs(hechas) do
    local entregada = SNF.Misiones.entregada(q)
    if todas and not entregada then
      return false
    elseif not todas and entregada then
      return true
    end
  end
  return todas
end

-- El ajuste del tipo de aviso está activo. Lote A (revisión 52, I1): los de mazmorra dependen solo de su ajuste, no de
-- la versión elegida (las guías con mazmorras acaban en el 22 y los avisos siguen hasta el 60). Ronda 1: el valor por
-- defecto de ese ajuste sí sigue a la versión (Ajustes.DEFECTO_SEGUN, nucleo/guardado.lua) mientras el jugador no lo toca.
local function tipoActivo(aviso)
  if aviso.tipo == "mazmorra" then
    return Ajustes.get("avisos.mazmorras") and true or false
  elseif aviso.tipo == "mejora" then
    return Ajustes.get("avisos.mejoras") and true or false
  end
  return Ajustes.get("avisos.cadenas")
end

-- El nivel está dentro de la ventana del aviso: desde `nivel` y, si lo trae, hasta `hasta`.
-- El nivel del personaje para la cola y los pendientes: el de Personaje.actual() (que toma el de PLAYER_LEVEL_UP, porque
-- UnitLevel va por detrás en ese evento) o el de UnitLevel si es mayor. Así el aviso recién ganado sale al subir de nivel.
local function nivelActual()
  local delEvento = Personaje.actual().nivel or 1
  local delJuego = Personaje.leer().nivel or 1
  return math.max(delEvento, delJuego)
end

local function vigente(aviso, nivel)
  return aviso.nivel <= nivel and (aviso.hasta == nil or nivel <= aviso.hasta)
end

-- Ronda 1 (M4): el aviso empieza en otro continente que el del personaje (las instancias de mundo de los dos puntos no
-- coinciden). Sin saberlo (sin `inicio`, un mapa que el juego no mide o el personaje dentro de una instancia), no.
local function enOtroContinente(aviso)
  if type(aviso.inicio) ~= "table" or not SNF.Coord then
    return false
  end
  local destino = SNF.Coord.aMundo(aviso.inicio)
  local yo = SNF.Coord.jugador()
  return destino ~= nil and yo ~= nil and destino.inst ~= nil and yo.inst ~= nil and destino.inst ~= yo.inst
end

-- El aviso es para este personaje y este nivel, y todavía no se ha hecho. Tipo nil o «cadena»: de la clase del
-- personaje; «mazmorra» y «mejora»: de cualquier clase.
local function toca(aviso, pj, nivel)
  if type(aviso) ~= "table" or aviso.id == nil or type(aviso.nivel) ~= "number" then
    return false
  end
  if not tipoActivo(aviso) then
    return false
  end
  local deClase = aviso.tipo ~= "mazmorra" and aviso.tipo ~= "mejora"
  if deClase and string.upper(aviso.clase or "") ~= string.upper(pj.clase or "") then
    return false
  end
  local faccion = aviso.faccion
  if faccion ~= nil and pj.faccion ~= nil and pj.faccion ~= "Neutral" and pj.faccion ~= faccion then
    return false
  end
  if not SNF.Filtros.evaluar(aviso.filtro, pj) then
    return false
  end
  if not vigente(aviso, nivel) then
    return false
  end
  -- Un aviso con `inicio` en otro continente espera: se vuelve a mirar al entrar al mundo (cada pantalla de carga).
  if enOtroContinente(aviso) then
    return false
  end
  return not estaHecho(aviso)
end

-- Texto visible: el texto propio del aviso; sin él y con area, el nombre de la mazmorra (pedido al juego por área).
-- Nombre que da el juego al mapa de un punto, o nil (el mapa no existe o la API falta).
local function nombreDeMapa(mapa)
  local info = mapa and C_Map and C_Map.GetMapInfo and C_Map.GetMapInfo(mapa)
  local nombre = info and info.name
  return type(nombre) == "string" and nombre ~= "" and nombre or nil
end

function Avisos.texto(aviso)
  local propio = SNF.L.de(aviso.texto)
  if propio == nil and aviso.area ~= nil then
    return SNF.L.t("AVISO_MAZMORRA", Datos.nombreZona(aviso.area))
  end
  -- Ronda 1 (M4): con `inicio`, dónde empieza («… (empieza en Los Baldíos)»), si el juego sabe el nombre del mapa.
  local zona = type(aviso.inicio) == "table" and nombreDeMapa(aviso.inicio.mapa) or nil
  if propio ~= nil and zona ~= nil then
    return SNF.L.t("AVISO_EMPIEZA_EN", propio, zona)
  end
  return propio
end

function Avisos.revisar(nivel)
  if not lista() then
    return
  end
  local vistos = estado().vistos
  -- Clase y facción no cambian; el nivel es el del evento (UnitLevel puede ir por detrás) o el del personaje.
  local pj = Personaje.leer()
  if type(nivel) ~= "number" then
    nivel = pj.nivel or 1
  end
  for _, aviso in ipairs(lista()) do
    if toca(aviso, pj, nivel) and not vistos[aviso.id] and not indiceEnCola(aviso.id) then
      enCola[#enCola + 1] = aviso
      SNF.emitir("SNF_AVISO", aviso)
    end
  end
end

function Avisos.cola()
  -- Los que ya están hechos (o cuyo ajuste se apagó) se quitan en el momento.
  local copia = {}
  local nivel = nivelActual()
  for _, aviso in ipairs(enCola) do
    if tipoActivo(aviso) and vigente(aviso, nivel) and not estaHecho(aviso) then
      copia[#copia + 1] = aviso
    end
  end
  return copia
end

-- Lo marca visto y lo saca de la cola.
local function atender(id)
  estado().vistos[id] = true
  local i = indiceEnCola(id)
  if i then
    table.remove(enCola, i)
  end
end

local function indicePendiente(id)
  for i, p in ipairs(estado().pendientes) do
    if p == id then
      return i
    end
  end
  return nil
end

function Avisos.tieneGuia(aviso)
  if type(aviso) ~= "table" then
    aviso = porId(aviso)
  end
  return aviso ~= nil and aviso.guia ~= nil and Datos.guia(aviso.guia) ~= nil
end

function Avisos.ahora(id)
  local aviso = porId(id)
  if not aviso then
    return false
  end
  atender(id)
  local i = indicePendiente(id)
  if i then
    table.remove(estado().pendientes, i)
  end
  if not Avisos.tieneGuia(aviso) then
    return false
  end
  return Guias.abrirLateral(aviso.guia)
end

function Avisos.masTarde(id)
  if not porId(id) then
    return
  end
  atender(id)
  if not indicePendiente(id) then
    local pendientes = estado().pendientes
    pendientes[#pendientes + 1] = id
  end
end

function Avisos.pendientes()
  local salida = {}
  local nivel = nivelActual()
  for _, id in ipairs(estado().pendientes) do
    local aviso = porId(id)
    if aviso and tipoActivo(aviso) and vigente(aviso, nivel) and not estaHecho(aviso) then
      salida[#salida + 1] = aviso
    end
  end
  return salida
end

function Avisos.volverA()
  estado()
  local clave = SnetForeverPJ.volverA
  return clave and Datos.guia(clave) and clave or nil
end

function Avisos.ofrecerVuelta()
  return Motor.estado().fin and Avisos.volverA() or nil
end

-- 16-nov: la guía del botón «Volver a <guía>» de la ventana, o nil: volverA solo cuando tiene sentido, al acabar la
-- lateral o si la guía de vuelta tiene algún paso que se pueda hacer ahora (Guias.algoQueHacer, que con la guía guardada
-- acabada es false). T3: la regla se queda (la pidió el jugador); lo que cambia es el texto, con «(paso N)» mientras la
-- guía de vuelta no esté acabada (Avisos.pasoVolver). La X del botón la olvida (Guias.olvidarVuelta).
-- Ronda 2 (la vuelta es una pila): sale la primera de la pila, desde la cima, que tiene algo que hacer; las de encima
-- (acabadas o sin nada que hacer) se quitan de la pila al mirarlas. Si ninguna vale, no se quita nada y, al acabar la
-- lateral, sale la cima.
function Avisos.botonVolver()
  if not Avisos.volverA() then
    return nil
  end
  for _, clave in ipairs(Guias.vueltas()) do
    if Datos.guia(clave) and Guias.algoQueHacer(clave) then
      Guias.subirVuelta(clave)
      return clave
    end
  end
  return Motor.estado().fin and Avisos.volverA() or nil
end

-- T3: el número del paso por el que va la guía de vuelta `clave` (volverA si no se pasa), o nil si está acabada o no se
-- sabe: el botón dice «Volver a <guía> (paso N)».
-- Ronda 1 (Menor 4): Motor.numeroGuardado recorre la guía entera (la principal tiene miles de pasos) y la ventana lo
-- pide en cada repintado: se memoriza por guía, con su progreso guardado de entonces (id, n, pasado), y se olvida con los
-- mismos eventos que Guias.algoQueHacer.
local memoPaso = {}
for _, evento in ipairs({"QUEST_LOG_UPDATE", "QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "SNF_GUIA_CARGADA",
  "SNF_PASOS_CAMBIADOS", "PLAYER_LEVEL_UP"}) do
  SNF.escuchar(evento, function()
    memoPaso = {}
  end)
end

function Avisos.pasoVolver(clave)
  clave = clave or Avisos.volverA()
  if not clave then
    return nil
  end
  local p = type(SnetForeverPJ.progreso) == "table" and SnetForeverPJ.progreso[clave]
  p = type(p) == "table" and p or {}
  local m = memoPaso[clave]
  if not (m and m.id == p.id and m.n == p.n and m.pasado == p.pasado) then
    local n, acabada = Motor.numeroGuardado(clave)
    m = {id = p.id, n = p.n, pasado = p.pasado, numero = not acabada and n or nil}
    memoPaso[clave] = m
  end
  return m.numero
end

function Avisos.volver()
  local clave = Avisos.volverA()
  if not clave then
    return false
  end
  -- Ronda 2: se carga conservando la vuelta; llegar a ella la desapila (la siguiente de la pila pasa a ser volverA).
  return Guias.cargar(clave, nil, true)
end

-- PLAYER_LEVEL_UP llega con el nivel nuevo; al entrar al mundo se usa el del personaje. Marco propio, como
-- nucleo/personaje.lua: no pasa por Eventos para no alterar los eventos que el motor registra por su cuenta.
local marco = CreateFrame("Frame")
marco:RegisterEvent("PLAYER_ENTERING_WORLD")
marco:RegisterEvent("PLAYER_LEVEL_UP")
marco:SetScript("OnEvent", function(_, evento, nivel)
  Avisos.revisar(evento == "PLAYER_LEVEL_UP" and nivel or nil)
end)

-- Lote C (revisión 52, Minor 4): encender un tipo de aviso mete en la cola lo que ya toca, sin esperar a subir de nivel ni
-- a volver a entrar. Apagarlo no hace falta: Avisos.cola() y Avisos.pendientes() ya miran el ajuste.
local AJUSTES_DE_AVISOS = {
  ["avisos.cadenas"] = true,
  ["avisos.mazmorras"] = true,
  ["avisos.mejoras"] = true,
  ["version"] = true,
}
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if AJUSTES_DE_AVISOS[clave] then
    Avisos.revisar()
  end
end)
