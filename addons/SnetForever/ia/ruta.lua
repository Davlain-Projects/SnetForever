-- SnetForever: ruta y pines de la IA (fase 4, tarea 9). La app devuelve una propuesta de ruta (paradas con sitio sacado
-- de la base, nunca inventado por la IA); el jugador la acepta y sus puntos pasan a la capa «ia» como pines numerados.
--
-- Propuesta = {titulo, tipo?, puntos = {{mapa, x, y, etiqueta, tipo, q, obj, objetivo?, npcs?, seguir}, ...}}   (tipo de
--     la propuesta, lote E1c: «ruta» si trae paradas que seguir o «pines» si solo señala sitios; tipo de un punto: recoger,
--     objetivo, entregar o lugar; q = misión; obj = texto del objetivo, solo en «objetivo»; objetivo = su índice en el
--     registro del juego y npcs = ids de los PNJ del sitio, lote F; seguir = es una parada de la ruta, si no es un pin).
--
-- Lote F (petición del autor, 10-nov: la tarjeta «Ruta de la IA» del lote E era «algo plain»): una propuesta con paradas
-- se ve con el diseño de la guía. Al aceptarla se convierte en una guía lateral `tipo = "ia"` (el formato de las rutas
-- de zona de la 16c, contrato F4-21), con un paso por parada y en orden, y se abre con Guias.abrirLateral: la ventana la
-- pinta como cualquier guía (cabecera «IA: <título>», tarjetas de paso con sus iconos, lista y «Volver a …»), la flecha
-- sigue su paso actual y sus PNJ salen en «Objetivos cercanos». Cada parada es un paso:
--     recoger   accept q + goto + target (los PNJ que la dan);
--     objetivo  complete q objetivo = k + goto (objetivo = k) + mob (los PNJ del objetivo);
--     entregar  turnin q + goto + target (los PNJ que la recogen);
--     lugar     goto «objetivo» de RADIO_LUGAR yardas con la etiqueta por texto (se da por hecha al llegar).
--   El goto va sin pin (los pines son los de la capa «ia», numerados como las paradas). Los PNJ y el objetivo k salen de lo
--   que manda la app (lote F) o, si no los trae (una ruta guardada con la 0.4.6), de la base: startedBy/finishedBy y el
--   objetivo cuyo nombre es `obj` (también si la app manda un k que la base no tiene, ronda 1). Un objetivo que no se
--   encuentra se trata como un lugar. Topes: los de la ruta (40
--   paradas: caben en los 60 misiones y 400 pasos de la 16c) y textos cortados sin partir UTF-8. El goto se valida como
--   en la 16c (mapa entero y x/y en 0-100); sin sitio válido, la parada va sin goto y un lugar no sale (ronda 1).
--   «Volver a la guía» es el «Volver» de las laterales y «Saltar parada», el saltar paso de la guía. «Volver» (o cargar
--   otra guía) quita la ruta del todo, como «Quitar pines» (Ruta.quitar, que con la ruta abierta vuelve además a la guía
--   de antes); sigue en «Rutas de la IA» para volver a elegirla (ronda 1).
--   La guía no se guarda: se rehace de SnetForeverPJ.ia.ruta (Ruta.guia, que lee Datos.guia), y su progreso es el de
--   cualquier guía (SnetForeverPJ.progreso[clave]). Clave: «IA\Paradas <id>», id el de la ruta guardada (lote E1b).
--
-- Ruta.proponer(propuesta)   la deja pendiente y emite SNF_IA_PROPUESTA(propuesta). No toca la capa.
-- Ruta.pendiente()           la propuesta pendiente, o nil.
-- Ruta.aceptar()             consume la propuesta pendiente (también si devuelve false). Pone los puntos en la capa «ia»
--                            (Capa.poner("ia", puntos), sin `seguir`: la flecha va con la guía), la guarda en
--                            SnetForeverPJ.ia.ruta y, con paradas, abre su guía. Las paradas llevan orden = i (su número
--                            entre las paradas: los pines no cuentan) y etiqueta «i. <etiqueta>»; los PINES (lo que no
--                            es parada: los de una propuesta «pines» y los que vienen sin `seguir` en una ruta) llevan
--                            esPin = true, sin orden y la etiqueta sin número, y el primero con sitio válido pasa a ser
--                            el «Marcador de mapa» de Blizzard (Marcador.seguirPreguntando, mapa/marcador.lua: con un
--                            marcador del jugador, SNF_IA_MARCADOR_PREGUNTA(pin); en combate,
--                            SNF_IA_MARCADOR_COMBATE(pin)). Sin pines, o si el primero no se puede marcar, se quita el
--                            marcador nuestro de antes (Marcador.quitar: nunca uno del jugador). false si no había
--                            propuesta o no traía ningún punto con sitio.
-- Ruta.descartar()           quita la propuesta pendiente (la capa no cambia).
-- Ruta.quitar()              Capa.quitar("ia"), Marcador.quitar() (solo el nuestro), borra lo guardado y, si su guía
--                            estaba abierta, vuelve a la de antes. La
--                            interfaz debe usar Ruta.quitar y no Capa.quitar("ia") a pelo (si pasa, se detecta
--                            —SNF_PUNTOS_CAMBIADOS("ia") con la capa vacía— y se hace lo mismo).
-- Ruta.guia(clave) -> Guia lateral | nil   la guía de la ruta activa con esa clave (Datos.guia la busca aquí).
-- Ruta.claveGuia() -> clave | nil          la de la ruta activa, si tiene paradas.
-- Ruta.esGuiaDeParadas(clave) -> boolean   T3: la clave es la de la guía de una ruta de pines («IA\Paradas <id>»).
-- Ruta.estado() -> {titulo, n, total, punto, texto, quedan = {{n, texto, punto}...}} | nil
--     con la guía de la ruta abierta y sin terminar, la parada de su paso actual (n = su número, el de su pin; total = el
--     de la última parada) y las de los pasos que siguen, en orden. La usa la línea del mapa (lote E4). nil si no.
-- Ruta.hecho(p) -> true|false|nil   (nil si p no es un punto de la capa «ia») si la parada está hecha según su tipo:
--     recoger   true con la misión en el registro (o ya entregada), false si no;
--     objetivo  true con la misión completa o con el objetivo cuyo texto contiene `obj` terminado, false si no;
--     entregar  true con la misión entregada, false si no;
--     lugar (y todo lo demás) nil.
--     Se calcula una vez y se guarda hasta el siguiente evento de misión.
-- Ruta.progreso(p) -> texto|nil     en «objetivo», los objetivos de q como los da el juego («Jabalí: 2/8»; solo el que
--     coincide con `obj` si lo hay); en «recoger», «Por recoger» o «En el registro»; en «entregar», «Falta completarla»
--     o «Lista para entregar».
--
-- Eventos de misión (QUEST_ACCEPTED, QUEST_TURNED_IN, QUEST_REMOVED, QUEST_LOG_UPDATE y UNIT_QUEST_LOG_CHANGED de
-- "player"): se reescriben las etiquetas («i. <etiqueta> — <progreso>»; un pin, sin el «i. ») en los mismos puntos y, solo
-- si alguna cambió, se emite SNF_PUNTOS_CAMBIADOS("ia").
-- Mensajes: SNF_IA_PROPUESTA; SNF_IA_RUTA_CAMBIADA, cuando cambia lo que da Ruta.estado (aceptar, quitar, otro paso de
-- su guía, abrirla o dejarla); SNF_IA_RUTA_TERMINADA, una vez, cuando su guía llega al final (queda apuntado en lo
-- guardado para no repetirlo tras un /reload).
-- Lo guardado tiene tope: 40 puntos, etiqueta y obj de 120 bytes, 5 PNJ por punto y título de 80 (cortados sin partir un
-- carácter UTF-8).
-- Rutas de zona de la IA como guía lateral (proponerGuia, aceptarGuia, guiasIA, quitarGuia): sección propia más abajo.
-- El plan llama a este módulo RutaIA (alias SNF.RutaIA); el andamio exige el nombre SNF.Ruta.
-- En el primer PLAYER_ENTERING_WORLD vuelve a poner los pines de la ruta guardada (el marcador de mapa no: lo guarda el
-- cliente y Marcador lo reconoce por SnetForeverPJ.ia.marcador).
local _, SNF = ...

local Ruta = {}
SNF.Ruta = Ruta
SNF.RutaIA = Ruta -- el plan lo llama RutaIA

local Eventos = SNF.Eventos
local Capa = SNF.Capa
local Misiones = SNF.Misiones
local L = SNF.L
local esSecreto = SNF.API.esSecreto

local floor = math.floor

local MAX_PUNTOS = 40 -- puntos que se guardan de una ruta
local MAX_TEXTO = 120 -- bytes de la etiqueta y del obj de un punto
local MAX_TITULO = 80 -- bytes del título
local MAX_OBJETIVOS = 10 -- objetivos de una misión que se leen para el progreso
local MAX_PNJ = 5 -- PNJ de una parada (el target o el mob de su paso)
local RADIO_LUGAR = 10 -- yardas para dar por hecha una parada de lugar (el RADIO_RUTA de la navegación)
local PREFIJO_RUTA = "IA\\Paradas " -- clave de la guía de una ruta de pines (lote F)
local SIN_VALOR = {} -- «nil» guardado en la caché de hecho()

local MAX_RUTAS = 5 -- rutas de pines aceptadas que se guardan para volver a elegirlas (lote E1b)

local pendiente -- propuesta pendiente
local actual -- {id?, titulo, puntos = {Punto...}, terminada, clave?, guia?} de la capa «ia», o nil
local bases = setmetatable({}, {__mode = "k"}) -- [Punto] = etiqueta sin número ni progreso
local cache = setmetatable({}, {__mode = "k"}) -- [Punto] = true | false | SIN_VALOR
local recuperada = false -- ya se pusieron los pines de la ruta guardada (primer PLAYER_ENTERING_WORLD)
local leida = false -- ya se leyó la ruta guardada (SnetForeverPJ.ia.ruta)

local function guardadoIa()
  local pj = rawget(_G, "SnetForeverPJ")
  return type(pj) == "table" and type(pj.ia) == "table" and pj.ia or nil
end

local function hayNumero(v)
  return type(v) == "number" and not esSecreto(v)
end

local function enteroPositivo(v)
  return hayNumero(v) and v == floor(v) and v >= 1 and v < 2147483648
end

-- Un punto con sitio: mapa y (x, y) o (wx, wy).
local function conSitio(p)
  if type(p) ~= "table" or not hayNumero(p.mapa) then
    return false
  end
  return (hayNumero(p.x) and hayNumero(p.y)) or (hayNumero(p.wx) and hayNumero(p.wy))
end

---------------------------------------------------------------------------------------------------
-- Estado de las paradas.
---------------------------------------------------------------------------------------------------

-- Los objetivos de q (como mucho MAX_OBJETIVOS) que da el juego, con su texto leído; los secretos no cuentan.
local function objetivosDe(q)
  local lista = {}
  for k = 1, MAX_OBJETIVOS do
    local o = Misiones.objetivo(q, k)
    if not o then
      break
    end
    if type(o.texto) == "string" and not esSecreto(o.texto) then
      lista[#lista + 1] = o
    end
  end
  return lista
end

local function contiene(texto, parte)
  return string.find(string.lower(texto), string.lower(parte), 1, true) ~= nil
end

-- El objetivo de la lista cuyo texto contiene `obj`, o nil.
local function coincidente(lista, obj)
  if type(obj) ~= "string" or obj == "" then
    return nil
  end
  for _, o in ipairs(lista) do
    if contiene(o.texto, obj) then
      return o
    end
  end
  return nil
end

local function calcularHecho(p)
  local q = p.q
  if not hayNumero(q) then
    return nil
  end
  local tipo = p.tipo
  if tipo == "recoger" then
    return (Misiones.enDiario(q) or Misiones.entregada(q)) and true or false
  elseif tipo == "entregar" then
    return Misiones.entregada(q) and true or false
  elseif tipo == "objetivo" then
    if Misiones.entregada(q) or Misiones.completa(q) then
      return true
    end
    local o = coincidente(objetivosDe(q), p.obj)
    return o ~= nil and o.terminado == true
  end
  return nil
end

function Ruta.hecho(p)
  if type(p) ~= "table" or p.origen ~= "ia" then
    return nil
  end
  local v = cache[p]
  if v == nil then
    v = calcularHecho(p)
    if v == nil then
      v = SIN_VALOR
    end
    cache[p] = v
  end
  if v == SIN_VALOR then
    return nil
  end
  return v
end

-- «Jabalí: 2/8»: el texto del juego; si no trae números y la misión pide más de uno, se le añaden.
local function textoDeObjetivo(o)
  local texto = o.texto
  if string.find(texto, "%d+/%d+") then
    return texto
  end
  if hayNumero(o.hecho) and hayNumero(o.pedido) and o.pedido > 1 then
    return string.format("%s: %d/%d", texto, floor(o.hecho), floor(o.pedido))
  end
  return texto
end

function Ruta.progreso(p)
  if type(p) ~= "table" or not hayNumero(p.q) then
    return nil
  end
  local q = p.q
  if p.tipo == "recoger" then
    if Misiones.enDiario(q) or Misiones.entregada(q) then
      return L.t("IA_RUTA_EN_REGISTRO")
    end
    return L.t("IA_RUTA_POR_RECOGER")
  elseif p.tipo == "entregar" then
    if Misiones.completa(q) or Misiones.entregada(q) then
      return L.t("IA_RUTA_LISTA_ENTREGAR")
    end
    return L.t("IA_RUTA_FALTA_COMPLETARLA")
  elseif p.tipo == "objetivo" then
    local lista = objetivosDe(q)
    local elegido = coincidente(lista, p.obj)
    local partes = {}
    for _, o in ipairs(elegido and {elegido} or lista) do
      partes[#partes + 1] = textoDeObjetivo(o)
    end
    if #partes == 0 then
      return nil
    end
    return table.concat(partes, "; ")
  end
  return nil
end

---------------------------------------------------------------------------------------------------
-- Etiquetas y guardado.
---------------------------------------------------------------------------------------------------

-- Marcador de mapa: un pin va sin el «i. » del número; el número de una parada es su `orden`, que cuenta solo las
-- paradas (una ruta con parada, pin y parada da «1.» y «2.»).
local function etiquetaDe(p, conProgreso)
  local base = bases[p] or ""
  local progreso = conProgreso and Ruta.progreso(p) or nil
  if p.esPin or not p.orden then
    return progreso and string.format("%s — %s", base, progreso) or base
  end
  if progreso then
    return string.format("%d. %s — %s", p.orden, base, progreso)
  end
  return string.format("%d. %s", p.orden, base)
end

-- Devuelve si alguna etiqueta cambió.
local function reescribirEtiquetas()
  local cambio = false
  for _, p in ipairs(actual.puntos) do
    local nueva = etiquetaDe(p, true)
    if nueva ~= p.etiqueta then
      p.etiqueta = nueva
      cambio = true
    end
  end
  return cambio
end

-- Los datos de un punto para guardarlo (en ia.ruta o en las rutas elegibles): `seguir` dice si es una parada.
local function datosDePunto(p)
  return {mapa = p.mapa, x = p.x, y = p.y, wx = p.wx, wy = p.wy, inst = p.inst, etiqueta = bases[p], tipo = p.tipo,
    q = p.q, obj = p.obj, objetivo = p.objetivo, npcs = p.npcs, seguir = p.parada or nil}
end

local function guardar()
  local ia = guardadoIa()
  if not ia then
    return
  end
  if not actual then
    ia.ruta = nil
    return
  end
  local puntos = {}
  for i, p in ipairs(actual.puntos) do
    puntos[i] = datosDePunto(p)
  end
  ia.ruta = {id = actual.id, titulo = actual.titulo, puntos = puntos, terminada = actual.terminada or nil}
end

-- `texto` cortado a `max` bytes sin partir un carácter UTF-8.
local function cortar(texto, max)
  if #texto <= max then
    return texto
  end
  local fin = max
  -- Si el byte que sigue al corte es de continuación (10xxxxxx), el corte parte un carácter: se retrocede.
  while fin > 0 do
    local b = string.byte(texto, fin + 1)
    if b < 128 or b >= 192 then
      break
    end
    fin = fin - 1
  end
  return string.sub(texto, 1, fin)
end

-- Los ids de PNJ de un punto (enteros positivos, como mucho MAX_PNJ), o nil si no trae ninguno.
local function pnjDe(v)
  if type(v) ~= "table" then
    return nil
  end
  local ids = {}
  for _, id in ipairs(v) do
    if #ids >= MAX_PNJ then
      break
    end
    if enteroPositivo(id) then
      ids[#ids + 1] = id
    end
  end
  return #ids > 0 and ids or nil
end

-- Hace los puntos de una lista de datos (propuesta o lo guardado), con tope: los que no tienen sitio se quitan. Ninguno
-- lleva `seguir` (la flecha va con la guía de la ruta, lote F): `parada` dice si es una parada. Con soloPines (una
-- propuesta de tipo «pines», lote E1c) ninguno es parada aunque traiga `seguir`.
-- Marcador de mapa: lo que no es parada es un PIN (esPin = true): sin `orden` (sin número en el mapa) y con la etiqueta
-- sin el «i. ». Las paradas llevan orden = su número entre las paradas (los pines no cuentan).
local function hacerPuntos(datos, soloPines)
  local puntos = {}
  local paradas = 0
  for _, d in ipairs(datos) do
    if #puntos >= MAX_PUNTOS then
      break
    end
    if conSitio(d) then
      local parada = not soloPines and d.seguir == true or nil
      if parada then
        paradas = paradas + 1
      end
      local p = {mapa = d.mapa, x = d.x, y = d.y, wx = d.wx, wy = d.wy, inst = d.inst, tipo = d.tipo, q = d.q,
        obj = type(d.obj) == "string" and cortar(d.obj, MAX_TEXTO) or nil, parada = parada,
        objetivo = enteroPositivo(d.objetivo) and d.objetivo or nil, npcs = pnjDe(d.npcs),
        orden = parada and paradas or nil, esPin = not parada or nil}
      bases[p] = type(d.etiqueta) == "string" and cortar(d.etiqueta, MAX_TEXTO) or ""
      puntos[#puntos + 1] = p
    end
  end
  return puntos
end

local function tituloDe(t)
  return type(t) == "string" and cortar(t, MAX_TITULO) or ""
end

local function olvidar()
  cache = setmetatable({}, {__mode = "k"})
end

---------------------------------------------------------------------------------------------------
-- La guía de la ruta (lote F).
---------------------------------------------------------------------------------------------------

local GRUPOS_OBJETIVO = {1, 2, 3, 5, 6} -- grupos de `objectives` en el orden del registro (Misiones.tipoDeBase)
local TIPO_GRUPO = {[1] = "npc", [2] = "object", [3] = "item"} -- los que tienen nombre en los datos

local function misionesDatos()
  local datos = rawget(_G, "SNF_MISIONES")
  return type(datos) == "table" and datos or nil
end

-- El nombre del dato en inglés y en español (los dos pueden faltar).
local function nombresDato(tipo, id)
  local datos = misionesDatos()
  local en = datos and type(datos[tipo]) == "table" and datos[tipo][id]
  local es = datos and type(datos.es) == "table" and type(datos.es[tipo]) == "table" and datos.es[tipo][id]
  return type(en) == "table" and en.name or nil, type(es) == "table" and es.name or nil
end

-- Los PNJ de una lista de ids con su nombre inglés de los datos («Objetivos cercanos» busca por él), como mucho MAX_PNJ.
local function npcsDe(ids)
  local lista = {}
  for _, id in ipairs(ids or {}) do
    local nombre = nombresDato("npc", id)
    if type(nombre) == "string" and nombre ~= "" and #lista < MAX_PNJ then
      lista[#lista + 1] = {nombre = nombre, id = id}
    end
  end
  return lista
end

-- Los PNJ de startedBy o finishedBy de la base ({{PNJ...}, {objetos...}, {ítems...}}).
local function pnjDeRelacion(relacion)
  local ids = {}
  local lista = type(relacion) == "table" and relacion[1]
  for _, id in ipairs(type(lista) == "table" and lista or {}) do
    if enteroPositivo(id) then
      ids[#ids + 1] = id
    end
  end
  return ids
end

-- El objetivo k de q en la base y los PNJ que pide (T2: de Datos.objetivoDeBase y Datos.sitiosObjetivo, que el motor
-- también usa): con k, ese; sin k, el primero cuyo nombre (inglés o español) es `obj`. Devuelve k (o nil si no se
-- encuentra) y la lista de ids (los del objetivo de PNJ o de crédito de muerte y, de un objeto que saquear, los PNJ que
-- lo sueltan, como mucho MAX_PNJ; en el juego no están: son de los archivos de la app, que los manda en el `pnj` del
-- complete; ver limpiarPaso). Ronda 1 (Menor 5): un k que la base no tiene se ignora (se busca por el nombre).
local function objetivoDeBase(q, obj, k)
  local Datos = SNF.Datos
  local hallado = enteroPositivo(q) and Datos.objetivoDeBase(q, obj, k) or nil
  if hallado == nil then
    return nil, {}
  end
  local sitios = Datos.sitiosObjetivo(q, hallado, true)
  local ids = {}
  for _, id in ipairs(sitios and sitios.npcs or {}) do
    if sitios.grupo ~= 3 or #ids < MAX_PNJ then
      ids[#ids + 1] = id
    end
  end
  return hallado, ids
end

-- Los elementos del paso de una parada (ver la cabecera). El target o el mob van con padre = 0 (el accept, el complete
-- o el turnin): con él hecho, el PNJ sale de «Objetivos cercanos».
-- Ronda 1 (Menor 2): el goto se valida como en las rutas de zona (F4-21): mapa entero y x/y en 0-100. Si no, la parada va
-- sin goto (no se inventa un sitio) y un lugar, que no tiene otra cosa que hacer, no sale como paso (nil).
local function enCien(v)
  return hayNumero(v) and v >= 0 and v <= 100
end

local function elementosDeParada(p)
  local irA
  if enteroPositivo(p.mapa) and enCien(p.x) and enCien(p.y) then
    irA = {t = "goto", mapa = p.mapa, x = p.x, y = p.y, modo = "flecha", sinPin = true, linea = 0}
  end
  local q = enteroPositivo(p.q) and p.q or nil
  local mision = q and SNF.Datos.mision(q) or nil
  local elementos, tipoPNJ, ids
  if q and p.tipo == "recoger" then
    elementos = {{t = "accept", q = q, linea = 0}, irA}
    tipoPNJ, ids = "target", p.npcs or pnjDeRelacion(mision and mision.startedBy)
  elseif q and p.tipo == "entregar" then
    elementos = {{t = "turnin", q = q, linea = 0}, irA}
    tipoPNJ, ids = "target", p.npcs or pnjDeRelacion(mision and mision.finishedBy)
  elseif q and p.tipo == "objetivo" then
    local k, deBase = objetivoDeBase(q, p.obj, p.objetivo)
    if k then
      if irA then
        irA.objetivo = k
      end
      elementos = {{t = "complete", q = q, objetivo = k, linea = 0}, irA}
      tipoPNJ, ids = "mob", p.npcs or deBase
    end
  end
  if not elementos then
    -- Un lugar (o un objetivo que la base no tiene): un goto con la etiqueta por texto (la línea del paso y la de la
    -- flecha) que se da por hecho al llegar.
    if not irA then
      return nil
    end
    irA.modo, irA.radio = "objetivo", RADIO_LUGAR
    if bases[p] and bases[p] ~= "" then
      irA.texto = bases[p]
    end
    return {irA}
  end
  local npcs = npcsDe(ids)
  if #npcs > 0 then
    elementos[#elementos + 1] = {t = tipoPNJ, npcs = npcs, padre = 0, linea = 0}
  end
  return elementos
end

-- Rehace la guía de la ruta activa (actual.clave y actual.guia); sin paradas, la ruta no tiene guía.
local function prepararGuia()
  actual.clave, actual.guia = nil, nil
  local pasos = {}
  local minimo, maximo
  for i, p in ipairs(actual.puntos) do
    local elementos = p.parada and elementosDeParada(p) or nil
    if elementos then
      local n = #pasos + 1
      pasos[n] = {id = string.format("i%d", n), n = n, etiquetas = {}, requisitos = {}, linea = 0,
        elementos = elementos, parada = i}
      local m = enteroPositivo(p.q) and SNF.Datos.mision(p.q) or nil
      local nivel = type(m) == "table" and m.questLevel or nil
      if enteroPositivo(nivel) then
        minimo, maximo = math.min(minimo or nivel, nivel), math.max(maximo or nivel, nivel)
      end
    end
  end
  if #pasos == 0 then
    return
  end
  if not minimo then
    minimo = SNF.Personaje.actual().nivel or 1
    maximo = minimo
  end
  local function titulo(idioma)
    local t = L.tablas[idioma]
    return string.format(t.RUTA_IA_GUIA, actual.titulo ~= "" and actual.titulo or t.RUTA_IA_TITULO)
  end
  local nombre = string.format("Paradas %d", actual.id or 0)
  actual.clave = PREFIJO_RUTA .. string.format("%d", actual.id or 0)
  actual.guia = {
    clave = actual.clave, grupo = "IA", nombre = nombre, titulo = {es = titulo("es"), en = titulo("en")}, tipo = "ia",
    sinVerificar = true, niveles = {min = minimo, max = maximo}, siguientes = {}, mazmorras = {},
    fuente = {archivo = "ia", linea = 0}, pasos = pasos,
  }
end

-- La ruta guardada (SnetForeverPJ.ia.ruta), leída una vez: la guía de la ruta tiene que existir en cuanto se cargue la
-- guía del personaje al entrar al mundo. No toca la capa (los pines se ponen en el primer PLAYER_ENTERING_WORLD).
local series = 0 -- cada ruta puesta lleva su número (actual.serie), para que la firma cambie aunque se repita
local function leerGuardada()
  if leida then
    return
  end
  local ia = guardadoIa()
  if not ia then
    return
  end
  leida = true
  local guardada = ia.ruta
  if type(guardada) ~= "table" or type(guardada.puntos) ~= "table" then
    return
  end
  local puntos = hacerPuntos(guardada.puntos)
  if #puntos == 0 then
    return
  end
  series = series + 1
  actual = {id = enteroPositivo(guardada.id) and guardada.id or nil, titulo = tituloDe(guardada.titulo), puntos = puntos,
    terminada = guardada.terminada == true, serie = series}
  prepararGuia()
end

function Ruta.guia(clave)
  if type(clave) ~= "string" or string.sub(clave, 1, #PREFIJO_RUTA) ~= PREFIJO_RUTA then
    return nil
  end
  leerGuardada()
  return actual and actual.clave == clave and actual.guia or nil
end

function Ruta.claveGuia()
  leerGuardada()
  return actual and actual.clave or nil
end

-- T3: ¿es `clave` la de la guía de una ruta de pines? Esa guía se quita al dejarla (ronda 1, Importante 1): no sirve para
-- volver a ella (Guias.abrirLateral no la apunta en volverA).
function Ruta.esGuiaDeParadas(clave)
  return type(clave) == "string" and string.sub(clave, 1, #PREFIJO_RUTA) == PREFIJO_RUTA
end

-- ¿Está abierta la guía de la ruta activa? Devuelve el estado del motor si lo está.
local function guiaAbierta()
  if not actual or not actual.clave then
    return nil
  end
  local e = SNF.Motor.estado()
  return e.clave == actual.clave and e or nil
end

function Ruta.estado()
  local e = guiaAbierta()
  if not e or actual.terminada or e.fin or e.sinGuia then
    return nil
  end
  local pv = SNF.Motor.paso(e.actual)
  local i = pv and pv.datos and pv.datos.parada
  local p = i and actual.puntos[i]
  if not p then
    return nil
  end
  -- n y total cuentan solo las paradas (su `orden`), nunca los pines.
  local total = 0
  for _, otro in ipairs(actual.puntos) do
    if otro.parada and otro.orden then
      total = math.max(total, otro.orden)
    end
  end
  local quedan = {}
  for _, j in ipairs(e.siguientes or {}) do
    local otro = SNF.Motor.paso(j)
    local k = otro and otro.datos and otro.datos.parada
    if k and k > i and actual.puntos[k] then
      quedan[#quedan + 1] = {n = actual.puntos[k].orden or k, texto = bases[actual.puntos[k]] or "",
        punto = actual.puntos[k]}
    end
  end
  return {titulo = actual.titulo, n = p.orden or i, total = total, punto = p, texto = bases[p] or "", quedan = quedan}
end

-- SNF_IA_RUTA_CAMBIADA: lo que da Ruta.estado cambió. Solo se emite si cambió de verdad.
local firmaEmitida = ""
local function avisarCambio()
  local e = Ruta.estado()
  local firma = e and string.format("%d|%d|%d", actual.serie or 0, e.n, #e.quedan) or ""
  if firma ~= firmaEmitida then
    firmaEmitida = firma
    Eventos.emitir("SNF_IA_RUTA_CAMBIADA")
  end
end

-- La ruta termina cuando su guía llega al final (una vez: queda apuntado en lo guardado).
local function comprobarFin()
  local e = guiaAbierta()
  if e and not actual.terminada and e.fin then
    actual.terminada = true
    guardar()
    Eventos.emitir("SNF_IA_RUTA_TERMINADA")
  end
end

---------------------------------------------------------------------------------------------------
-- Interfaz.
---------------------------------------------------------------------------------------------------

local apuntarGuardada -- (más abajo, con las rutas guardadas)
local abrirGuia -- (más abajo, con las rutas de zona: abre la guía de la ruta; nueva = empieza de cero)
local dejarGuia -- (más abajo: si la guía `clave` está abierta, vuelve a la de antes; borra su progreso)

-- Pone `actual` en la capa y, si tiene paradas, abre su guía.
local function ponerRuta(nueva)
  prepararGuia()
  guardar()
  Capa.poner("ia", actual.puntos)
  if actual.guia then
    abrirGuia(nueva)
  end
  comprobarFin()
  avisarCambio()
end

function Ruta.proponer(propuesta)
  if type(propuesta) ~= "table" then
    return
  end
  pendiente = propuesta
  Eventos.emitir("SNF_IA_PROPUESTA", propuesta)
end

function Ruta.pendiente()
  return pendiente
end

function Ruta.descartar()
  pendiente = nil
end

-- Marcador de mapa: el primer pin con sitio válido pasa a ser el marcador de Blizzard (Marcador.seguirPreguntando: con
-- un marcador del jugador emite SNF_IA_MARCADOR_PREGUNTA; en combate, SNF_IA_MARCADOR_COMBATE; si no se puede, el pin
-- sigue en el mapa y nada más). Sin pines, o si el primero no se puede marcar, el marcador nuestro de la ruta anterior
-- se quita (nunca uno del jugador).
local function seguirPrimerPin()
  for _, p in ipairs(actual.puntos) do
    if p.esPin and SNF.Marcador.clave(p) then
      if SNF.Marcador.seguirPreguntando(p) == "no_se_puede" then
        SNF.Marcador.quitar()
      end
      return
    end
  end
  SNF.Marcador.quitar()
end

function Ruta.aceptar()
  local propuesta = pendiente
  pendiente = nil
  if type(propuesta) ~= "table" or type(propuesta.puntos) ~= "table" then
    return false
  end
  -- Lote E1c: una propuesta de solo pines (tipo «pines» de la app) no es una ruta: ninguna parada, aunque algún punto
  -- trajera `seguir`. Así solo una ruta abre su guía (lote F).
  local puntos = hacerPuntos(propuesta.puntos, propuesta.tipo == "pines")
  if #puntos == 0 then
    return false
  end
  local antes = actual and actual.clave
  olvidar()
  series = series + 1
  leida = true
  actual = {titulo = tituloDe(propuesta.titulo), puntos = puntos, serie = series}
  for _, p in ipairs(puntos) do
    p.etiqueta = etiquetaDe(p, false)
  end
  apuntarGuardada()
  ponerRuta(true)
  -- La guía de la ruta anterior, si sigue abierta (la nueva no tiene paradas), deja paso a la de antes.
  if antes and antes ~= actual.clave then
    dejarGuia(antes)
  end
  seguirPrimerPin()
  return true
end

function Ruta.quitar()
  local clave = actual and actual.clave
  actual = nil
  leida = true
  olvidar()
  guardar()
  SNF.Marcador.quitar() -- marcador de mapa: solo el nuestro
  Capa.quitar("ia")
  if clave then
    dejarGuia(clave)
  end
  avisarCambio()
end

---------------------------------------------------------------------------------------------------
-- Rutas de pines guardadas para volver a elegirlas (lote E1b).
---------------------------------------------------------------------------------------------------

-- SnetForeverPJ.ia.rutas = {{id, titulo, mapa, fecha, puntos = {datos...}}...} (de la más antigua a la más reciente, como
-- mucho MAX_RUTAS; la sexta echa a la más antigua) y ia.rutaId, el último id dado. Se guarda cada propuesta aceptada
-- (P1/P2 de la IA). La activa es ia.ruta, con el mismo id.
--
-- Ruta.rutasGuardadas() -> {{id, titulo, zona, fecha, activa}...}   la activa primero y después de la más reciente a la
--     más antigua. zona = nombre de la zona de su primera parada; fecha = segundos del servidor al aceptarla (o nil).
-- Ruta.activarGuardada(id) -> boolean   la vuelve a poner como ruta activa y abre su guía (lote F): desde el principio
--     o, si ya era la activa y su guía está a medias, por donde iba. Como al aceptar, su primer pin pasa a ser el
--     marcador de mapa (con la pregunta si el marcador es del jugador y la espera en combate).
-- Ruta.quitarGuardada(id) -> boolean    la quita de lo guardado (si era la activa, quita también la ruta).

-- Una hora del servidor razonable (segundos enteros entre 1970 y 2100), o nil: una fecha rara se descarta, no la ruta.
local HORA_MAXIMA = 4102444800 -- 1-ene-2100
local function horaValida(t)
  if hayNumero(t) and t == floor(t) and t >= 1 and t < HORA_MAXIMA then
    return t
  end
  return nil
end
Ruta.horaValida = horaValida

-- Ronda 1 (Minor 1): lo guardado se limpia la primera vez que se lee (y cada vez que SnetForeverPJ.ia.rutas es otra
-- tabla): solo entradas con id entero positivo (sin repetir) y puntos; fecha razonable o ninguna; las MAX_RUTAS más
-- recientes. ia.rutaId queda como un entero positivo no menor que el mayor id guardado (los ids no se repiten).
local rutasLimpias -- la tabla que se limpió por última vez
local function limpiarRutas(ia)
  local validas, vistos = {}, {}
  for _, r in ipairs(ia.rutas) do
    if type(r) == "table" and enteroPositivo(r.id) and not vistos[r.id] and type(r.puntos) == "table" then
      vistos[r.id] = true
      r.fecha = horaValida(r.fecha)
      validas[#validas + 1] = r
    end
  end
  while #validas > MAX_RUTAS do
    table.remove(validas, 1)
  end
  for k = #ia.rutas, 1, -1 do
    ia.rutas[k] = nil
  end
  local mayor = 0
  for k, r in ipairs(validas) do
    ia.rutas[k] = r
    mayor = math.max(mayor, r.id)
  end
  if not enteroPositivo(ia.rutaId) or ia.rutaId < mayor then
    ia.rutaId = mayor > 0 and mayor or nil
  end
  rutasLimpias = ia.rutas
end

local function rutasDeGuardado(crear)
  local ia = guardadoIa()
  if not ia then
    return nil
  end
  if type(ia.rutas) ~= "table" then
    if not crear then
      return nil
    end
    ia.rutas = {}
  end
  if ia.rutas ~= rutasLimpias then
    limpiarRutas(ia)
  end
  return ia.rutas
end

-- Copia de los puntos de la ruta activa (para guardarla como ruta elegible).
local function datosDePuntos(puntos)
  local salida = {}
  for i, p in ipairs(puntos) do
    salida[i] = datosDePunto(p)
  end
  return salida
end

-- Guarda la ruta recién aceptada (actual) en la lista de rutas elegibles y le da su id.
apuntarGuardada = function()
  local rutas = rutasDeGuardado(true)
  if not rutas then
    return
  end
  local ia = guardadoIa()
  local id = (enteroPositivo(ia.rutaId) and ia.rutaId or 0) + 1
  ia.rutaId = id
  actual.id = id
  rutas[#rutas + 1] = {id = id, titulo = actual.titulo, mapa = actual.puntos[1] and actual.puntos[1].mapa,
    fecha = SNF.API.horaServidor(), puntos = datosDePuntos(actual.puntos)}
  while #rutas > MAX_RUTAS do
    table.remove(rutas, 1)
  end
end

-- Nombre de la zona de un mapa: el de los datos (SNF_MISIONES.zonas.nombre) en el idioma del addon o el del juego.
local function nombreZona(mapa)
  if not hayNumero(mapa) then
    return nil
  end
  local datos = rawget(_G, "SNF_MISIONES")
  local zonas = type(datos) == "table" and type(datos.zonas) == "table" and datos.zonas.nombre
  local propio = type(zonas) == "table" and zonas[mapa]
  if type(propio) == "table" then
    local nombre = L.de(propio)
    if type(nombre) == "string" and nombre ~= "" then
      return nombre
    end
  end
  local f = type(C_Map) == "table" and rawget(C_Map, "GetMapInfo")
  if type(f) ~= "function" then
    return nil
  end
  local ok, info = pcall(f, mapa)
  local nombre = ok and type(info) == "table" and info.name or nil
  if type(nombre) == "string" and not esSecreto(nombre) and nombre ~= "" then
    return nombre
  end
  return nil
end

local function guardadaPorId(id)
  for k, r in ipairs(rutasDeGuardado(false) or {}) do
    if type(r) == "table" and r.id == id then
      return r, k
    end
  end
  return nil
end

function Ruta.rutasGuardadas()
  local lista = {}
  local rutas = rutasDeGuardado(false) or {}
  local activa = actual and actual.id
  for k = #rutas, 1, -1 do
    local r = rutas[k]
    if type(r) == "table" and hayNumero(r.id) and type(r.puntos) == "table" then
      local e = {id = r.id, titulo = tituloDe(r.titulo), zona = nombreZona(r.mapa),
        fecha = horaValida(r.fecha), activa = activa ~= nil and r.id == activa}
      if e.activa then
        table.insert(lista, 1, e)
      else
        lista[#lista + 1] = e
      end
    end
  end
  return lista
end

function Ruta.activarGuardada(id)
  local r = guardadaPorId(id)
  if not r then
    return false
  end
  -- Lote F: si ya es la activa y su guía sigue a medias, se vuelve a abrir con su progreso.
  if actual and actual.id == id and actual.guia and not actual.terminada then
    local abierta = abrirGuia(false)
    seguirPrimerPin()
    return abierta
  end
  local puntos = hacerPuntos(r.puntos)
  if #puntos == 0 then
    return false
  end
  local antes = actual and actual.clave
  olvidar()
  series = series + 1
  leida = true
  actual = {id = r.id, titulo = tituloDe(r.titulo), puntos = puntos, serie = series}
  reescribirEtiquetas()
  ponerRuta(true)
  if antes and antes ~= actual.clave then
    dejarGuia(antes)
  end
  seguirPrimerPin()
  return true
end

function Ruta.quitarGuardada(id)
  local r, k = guardadaPorId(id)
  if not r then
    return false
  end
  table.remove(rutasDeGuardado(false), k)
  if actual and actual.id == id then
    Ruta.quitar()
  end
  return true
end

---------------------------------------------------------------------------------------------------
-- Rutas de zona de la IA como guía lateral (fase 4, tarea 16c).
---------------------------------------------------------------------------------------------------

-- La app puede traer en el registro una Guía lateral completa (campo guiaIA, formato de la fase 3 con tipo = "ia" y
-- clave «IA\Ruta de <zona> (<facción>)»). Aquí se valida, se espera a que el jugador la acepte y, al aceptarla, se guarda
-- en SnetForeverPJ.ia.guias (Datos.guia y Datos.claves la encuentran) y se abre como lateral (Guias.abrirLateral).
--
-- Ruta.proponerGuia(guia) -> boolean   valida, deja la guía pendiente y emite SNF_IA_PROPUESTA_GUIA(guia). Si no vale
--                                      (clave sin «IA\», tipo distinto de «ia» o sin ningún paso válido) la descarta y
--                                      emite SNF_IA_AVISO «IA_GUIA_DESCARTADA»; si la recorta por los topes,
--                                      SNF_IA_AVISO «IA_GUIA_RECORTADA».
-- Ruta.guiaPendiente()                 la guía validada que espera respuesta, o nil.
-- Ruta.aceptarGuia() -> boolean        la guarda y la abre con Guias.abrirLateral («Volver» lleva a la principal).
--                                      T3: con la misma clave y la guía entera igual, paso a paso (ronda 1, I1),
--                                      sigue por donde iba; si no, de cero.
-- Ruta.guardarGuiaPendiente() -> boolean   ronda 1 (I2): guarda la pendiente sin abrirla y la deja pendiente (no si es
--                                      la cargada).
-- Ruta.descartarGuia()                 quita la pendiente (si ya se guardó, sigue en lo guardado).
-- Ruta.guiasIA() -> {clave...}         las guardadas, de la más antigua a la más reciente.
-- Ruta.quitarGuia(clave) -> boolean    la quita de lo guardado; si era la cargada, vuelve a la principal.
-- Ruta.horaGuia(clave) -> segundos|nil   la hora del servidor a la que se aceptó (lote E1b; las de antes, nil).
-- Topes: 60 misiones y 400 pasos por ruta; 5 rutas guardadas (la sexta sustituye a la más antigua que no sea la cargada
-- ni la de volver, T3).

local MAX_MISIONES_GUIA = 60 -- misiones de una ruta de zona
local MAX_PASOS_GUIA = 400 -- pasos de una ruta de zona
local MAX_GUIAS_IA = 5 -- rutas de la IA guardadas
local MAX_CLAVE = 160 -- bytes de la clave de la guía
local MAX_ELEMENTOS_PASO = 30 -- elementos de un paso
local MAX_TEXTO_PASO = 300 -- bytes de una nota o un paso manual
local MAX_QS = 30 -- misiones de un isQuestTurnedIn
local PREFIJO_GUIA = "IA\\"
local MISION = {accept = true, turnin = true, complete = true} -- elementos con una misión propia de la ruta
local FACCIONES = {Horde = true, Alliance = true}

local guiaPendienteIA -- la guía validada que espera respuesta del jugador

local function entero(v)
  return hayNumero(v) and v == floor(v) and v >= 1 and v < 2147483648
end

local function enRango(v)
  return hayNumero(v) and v >= 0 and v <= 100
end

local function texto(v, max)
  return type(v) == "string" and not esSecreto(v) and cortar(v, max) or nil
end

-- Un número o un texto corto (el objetivo de una misión), o nil.
local function objetivoDe(v)
  if hayNumero(v) then
    return v
  end
  return texto(v, MAX_TEXTO)
end

-- Un elemento de paso limpio (una copia con solo lo conocido) o nil si no es válido. El segundo valor es true si se
-- recortó algo (un isQuestTurnedIn con más de MAX_QS misiones): la guía se avisa como recortada, nunca en silencio.
local function limpiarElemento(e)
  if type(e) ~= "table" or type(e.t) ~= "string" or esSecreto(e.t) then
    return nil
  end
  local t = e.t
  if MISION[t] then
    if not entero(e.q) then
      return nil
    end
    local limpio = {t = t, q = e.q, linea = 0}
    if t == "complete" then
      limpio.objetivo = objetivoDe(e.objetivo)
      if limpio.objetivo == nil then
        return nil
      end
      if entero(e.max) then
        limpio.max = e.max
      end
    end
    -- 16-nov (en el juego: «al llegar a los puntos se saltan los objetivos sin completar las quest»): siFalta solo si lo
    -- trae el paso. Antes (12-nov) se ponía a todos los complete y turnin, y un objetivo de una misión que no se tenía (o
    -- que se acepta más adelante) pasaba en silencio. El motor ya trata la misión que no se tiene como en las guías
    -- normales: sinMision, «no disponible», en gris y en saltados (motor/pasos.lua).
    if e.siFalta == true then
      limpio.siFalta = true
    end
    -- 16-nov: quién suelta el objeto de un objetivo de saquear (la app lo saca de npcDrops, que el juego no tiene): ids
    -- enteros, como mucho MAX_PNJ. No se guarda en el elemento: limpiarPaso lo pone de mob.
    local pnj
    if t == "complete" and type(e.pnj) == "table" then
      pnj = {}
      for _, id in ipairs(e.pnj) do
        if entero(id) and #pnj < MAX_PNJ then
          pnj[#pnj + 1] = id
        end
      end
    end
    return limpio, nil, pnj
  elseif t == "goto" then
    if not entero(e.mapa) or not enRango(e.x) or not enRango(e.y) then
      return nil
    end
    local ir = {t = t, mapa = e.mapa, x = e.x, y = e.y, modo = "flecha", objetivo = objetivoDe(e.objetivo), linea = 0}
    -- Radio entero de 1 a 100 yardas. Con modo «objetivo», un sitio que se da por hecho al llegar (como en
    -- motor/misguias.lua); 16-nov: con «flecha», un punto de paso que se da por alcanzado al llegar y no bloquea (el sitio
    -- de un paso sin misión que la app une al siguiente).
    if entero(e.radio) and e.radio <= 100 then
      ir.radio = e.radio
      if e.modo == "objetivo" then
        ir.modo = "objetivo"
      end
    end
    return ir
  elseif t == "nota" or t == "manual" then
    -- Un paso de solo texto (los mismos elementos de motor/misguias.lua), en es y en, de 300 bytes como mucho.
    if type(e.texto) ~= "table" then
      return nil
    end
    local es, en = texto(e.texto.es, MAX_TEXTO_PASO), texto(e.texto.en, MAX_TEXTO_PASO)
    es, en = es ~= "" and es or nil, en ~= "" and en or nil
    if not es and not en then
      return nil
    end
    return {t = t, texto = {es = es or en, en = en or es}, linea = 0}
  elseif t == "isQuestTurnedIn" then
    if type(e.qs) ~= "table" then
      return nil
    end
    local qs, sobran = {}, false
    for _, q in ipairs(e.qs) do
      if entero(q) then
        if #qs < MAX_QS then
          qs[#qs + 1] = q
        else
          sobran = true
        end
      end
    end
    if #qs == 0 then
      return nil
    end
    return {t = t, qs = qs, linea = 0}, sobran
  end
  return nil
end

-- Los elementos válidos de un paso. Una misión nueva más allá de MAX_MISIONES_GUIA se quita con su elemento. Devuelve
-- la lista, si se quitó algo por el tope y si queda algún elemento que no sea un punto.
local function limpiarPaso(paso, misiones)
  local elementos, recortado, hayMision = {}, false, false
  local soltadores = {} -- [elemento limpio] = ids de PNJ que manda la app (pnj de un complete)
  for _, e in ipairs(type(paso.elementos) == "table" and paso.elementos or {}) do
    local limpio, sobran, pnj = limpiarElemento(e)
    if limpio and pnj then
      soltadores[limpio] = pnj
    end
    if sobran then
      recortado = true
    end
    if limpio and #elementos >= MAX_ELEMENTOS_PASO then
      recortado = true
    elseif limpio then
      local fuera = false
      if MISION[limpio.t] and not misiones.vistas[limpio.q] then
        if misiones.n >= MAX_MISIONES_GUIA then
          fuera = true
        else
          misiones.vistas[limpio.q] = true
          misiones.n = misiones.n + 1
        end
      end
      if fuera then
        recortado = true
      else
        elementos[#elementos + 1] = limpio
        if limpio.t ~= "goto" then
          hayMision = true
        end
      end
    end
  end
  -- 12-nov (un jugador: «con la ruta de la IA no me da la opción de marcar objetivo cercano»): como en las rutas del chat
  -- (elementosDeParada), cada accept y turnin lleva el target de quien da o recoge la misión, y cada complete el mob de
  -- su objetivo, todo de la base. Van con padre = el elemento de la misión: con él hecho, el PNJ sale de «Objetivos
  -- cercanos». Dentro del tope de elementos del paso. 16-nov: en un objetivo de saquear un objeto, el mob son los PNJ que
  -- lo sueltan (npcDrops de los datos o, como en el juego no están, el `pnj` que manda la app).
  local n = #elementos
  for k = 1, n do
    local e = elementos[k]
    if MISION[e.t] and #elementos < MAX_ELEMENTOS_PASO then
      local mision = SNF.Datos.mision(e.q)
      local tipo, ids
      if e.t == "accept" then
        tipo, ids = "target", pnjDeRelacion(mision and mision.startedBy)
      elseif e.t == "turnin" then
        tipo, ids = "target", pnjDeRelacion(mision and mision.finishedBy)
      elseif hayNumero(e.objetivo) then
        local _, deBase = objetivoDeBase(e.q, nil, e.objetivo)
        -- 16-nov: un objeto que saquear sin quien lo suelte en los datos del juego: los que manda la app.
        tipo, ids = "mob", (#deBase > 0 or not soltadores[e]) and deBase or soltadores[e]
      end
      local npcs = tipo and npcsDe(ids) or {}
      if #npcs > 0 then
        elementos[#elementos + 1] = {t = tipo, npcs = npcs, padre = k - 1, linea = 0}
      end
    end
  end
  return elementos, recortado, hayMision
end

-- Valida la guía recibida. Devuelve la guía limpia y si se recortó, o nil si no vale.
local function validarGuia(g)
  if type(g) ~= "table" or g.tipo ~= "ia" or type(g.clave) ~= "string" or esSecreto(g.clave)
    or #g.clave > MAX_CLAVE or string.sub(g.clave, 1, #PREFIJO_GUIA) ~= PREFIJO_GUIA or type(g.pasos) ~= "table" then
    return nil
  end
  local misiones = {vistas = {}, n = 0}
  local pasos, recortada = {}, false
  for _, paso in ipairs(g.pasos) do
    if type(paso) == "table" then
      local elementos, recorte, hayMision = limpiarPaso(paso, misiones)
      recortada = recortada or recorte
      -- Un paso al que el tope le quitó su misión se va entero: sus puntos no llevarían a nada.
      if #elementos > 0 and not (recorte and not hayMision) then
        if #pasos >= MAX_PASOS_GUIA then
          recortada = true
          break
        end
        local n = #pasos + 1
        pasos[n] = {id = string.format("i%d", n), n = n, etiquetas = {}, requisitos = {}, linea = 0,
          elementos = elementos}
        -- F4-31: de las etiquetas del paso solo se conserva «level» (entero de 1 a 60), con el formato de la fase 3:
        -- etiquetas.level y el requisito {t = "nivel", n}. El motor lo lee con Motor.etiqueta y espera al nivel.
        local nivel = type(paso.etiquetas) == "table" and rawget(paso.etiquetas, "level") or nil
        if hayNumero(nivel) and nivel >= 1 and nivel <= 60 and nivel == floor(nivel) then
          pasos[n].etiquetas.level = nivel
          pasos[n].requisitos[1] = {t = "nivel", n = nivel}
        end
        if paso.sinVerificar == "orden" or paso.sinVerificar == "punto" then
          pasos[n].sinVerificar = paso.sinVerificar
        end
      end
    end
  end
  if #pasos == 0 then
    return nil
  end
  local resto = string.sub(g.clave, #PREFIJO_GUIA + 1)
  local titulo = {}
  if type(g.titulo) == "table" then
    titulo.es, titulo.en = texto(g.titulo.es, MAX_TITULO), texto(g.titulo.en, MAX_TITULO)
  elseif type(g.titulo) == "string" then
    titulo.es = texto(g.titulo, MAX_TITULO)
  end
  titulo.es = titulo.es or titulo.en or resto
  titulo.en = titulo.en or titulo.es
  local minimo, maximo = 1, 60
  if type(g.niveles) == "table" and hayNumero(g.niveles.min) and hayNumero(g.niveles.max) then
    minimo, maximo = floor(g.niveles.min), floor(g.niveles.max)
  end
  local resumen
  if type(g.resumen) == "table" then
    resumen = {}
    for _, campo in ipairs({"misiones", "pasos", "elites", "grupo"}) do
      if hayNumero(g.resumen[campo]) then
        resumen[campo] = floor(g.resumen[campo])
      end
    end
  end
  return {
    clave = g.clave, grupo = "IA", nombre = resto, titulo = titulo, tipo = "ia", sinVerificar = true,
    faccion = FACCIONES[g.faccion] and g.faccion or nil, niveles = {min = minimo, max = maximo}, siguientes = {},
    mazmorras = {}, fuente = {archivo = "ia", linea = 0}, resumen = resumen, pasos = pasos,
  }, recortada
end

function Ruta.proponerGuia(guia)
  local limpia, recortada = validarGuia(guia)
  if not limpia then
    -- Una guía inválida no borra la pendiente válida: solo avisa.
    Eventos.emitir("SNF_IA_AVISO", "IA_GUIA_DESCARTADA")
    return false
  end
  guiaPendienteIA = limpia
  if recortada then
    Eventos.emitir("SNF_IA_AVISO", "IA_GUIA_RECORTADA")
  end
  Eventos.emitir("SNF_IA_PROPUESTA_GUIA", limpia)
  return true
end

function Ruta.guiaPendiente()
  return guiaPendienteIA
end

function Ruta.descartarGuia()
  guiaPendienteIA = nil
end

-- Las guías guardadas (SnetForeverPJ.ia.guias), creando la tabla si hace falta; nil sin SnetForeverPJ.
local function guardadas()
  local ia = guardadoIa()
  if not ia then
    return nil
  end
  if type(ia.guias) ~= "table" then
    ia.guias = {}
  end
  return ia.guias
end

local function fechaDe(guia)
  return type(guia) == "table" and hayNumero(guia.guardada) and guia.guardada or 0
end

function Ruta.guiasIA()
  local lista = {}
  local guias = guardadas()
  for clave, guia in pairs(guias or {}) do
    if type(guia) == "table" and type(clave) == "string" then
      lista[#lista + 1] = clave
    end
  end
  table.sort(lista, function(a, b)
    local fa, fb = fechaDe(guias[a]), fechaDe(guias[b])
    if fa ~= fb then
      return fa < fb
    end
    return a < b
  end)
  return lista
end

function Ruta.horaGuia(clave)
  local guias = guardadas()
  local guia = guias and type(clave) == "string" and guias[clave]
  return type(guia) == "table" and Ruta.horaValida(guia.guardadaEn) or nil
end

-- Ronda 1 (Minor 2, ruling del controlador): el grupo «Rutas de la IA» del menú enseña como mucho MAX_MENU_IA, las más
-- recientes sumando las de pines y las de zona (lo guardado sigue en 5 + 5). La ruta de pines activa va siempre la
-- primera. Ruta.menuRutasIA() -> {{tipo = "pines", ruta = <de rutasGuardadas>} | {tipo = "zona", clave}...}
local MAX_MENU_IA = 5
function Ruta.menuRutasIA()
  local lista = {}
  for k, r in ipairs(Ruta.rutasGuardadas()) do
    lista[#lista + 1] = {tipo = "pines", ruta = r, fecha = r.fecha or 0, activa = r.activa, orden = k}
  end
  local zonas = Ruta.guiasIA()
  for k = #zonas, 1, -1 do
    local clave = zonas[k]
    lista[#lista + 1] = {tipo = "zona", clave = clave, fecha = Ruta.horaGuia(clave) or 0, orden = 100 + #zonas - k}
  end
  table.sort(lista, function(a, b)
    if (a.activa == true) ~= (b.activa == true) then
      return a.activa == true
    end
    if a.fecha ~= b.fecha then
      return a.fecha > b.fecha
    end
    return a.orden < b.orden
  end)
  for k = #lista, MAX_MENU_IA + 1, -1 do
    lista[k] = nil
  end
  return lista
end

-- Lo saltado y retomado va por clave e id de paso: al quitar o volver a aceptar una ruta se limpia (sus ids se repiten).
local function limpiarSaltados(clave)
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj.saltados) == "table" then
    for k = #pj.saltados, 1, -1 do
      local s = pj.saltados[k]
      if type(s) == "table" and s.clave == clave then
        table.remove(pj.saltados, k)
      end
    end
  end
  if type(pj.retomados) == "table" then
    pj.retomados[clave] = nil
  end
end

-- Cargar una guía lateral apunta volverA después del repintado de la ventana (y cargar una a mano lo borra después):
-- se repinta otra vez para que «Volver a …» salga o se vaya.
local function repintarVentana()
  if SNF.Ventana then
    SNF.Ventana.pintar()
  end
end

-- Si era la guía cargada, vuelve a la principal (la de la que se abrió o, si no hay, la de por defecto).
function Ruta.quitarGuia(clave)
  local guias = guardadas()
  if type(clave) ~= "string" or not guias or type(guias[clave]) ~= "table" then
    return false
  end
  local abierta = SNF.Motor.estado().clave == clave
  guias[clave] = nil
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj.progreso) == "table" then
    pj.progreso[clave] = nil
  end
  limpiarSaltados(clave)
  if abierta then
    if not SNF.Avisos.volver() then
      SNF.Guias.volverPorDefecto()
    end
    repintarVentana()
  end
  return true
end

-- Ronda 1 (I1): un valor de un elemento como texto, para comparar dos guías: los números con dos decimales (en fengari
-- un entero saldría «3.0»), las tablas con sus claves en orden y sin `linea`.
local function aTexto(valor)
  local tipo = type(valor)
  if tipo == "number" then
    return string.format("%.2f", valor)
  elseif tipo == "table" then
    local claves = {}
    for k in pairs(valor) do
      if k ~= "linea" then
        claves[#claves + 1] = k
      end
    end
    table.sort(claves, function(a, b)
      return tostring(a) < tostring(b)
    end)
    local partes = {}
    for i, k in ipairs(claves) do
      partes[i] = tostring(k) .. "=" .. aTexto(valor[k])
    end
    return "{" .. table.concat(partes, ",") .. "}"
  end
  return tostring(valor)
end

-- T3, ronda 1 (I1): ¿es la `nueva` la misma guía que la `vieja`, paso a paso? El mismo número de pasos y, en cada uno,
-- la misma firma (Guias.firmaPaso) y los mismos elementos, también coordenadas y textos. La clave es la de la zona y una
-- ruta rehecha corre sus pasos: con cualquier cambio se empieza de cero (T1 coloca al jugador en el que falta).
local function mismaGuia(vieja, nueva)
  if type(vieja) ~= "table" or type(vieja.pasos) ~= "table" or #vieja.pasos ~= #nueva.pasos then
    return false
  end
  for i, paso in ipairs(nueva.pasos) do
    local antes = vieja.pasos[i]
    if SNF.Motor.idPaso(antes, i) ~= SNF.Motor.idPaso(paso, i) or SNF.Guias.firmaPaso(antes) ~= SNF.Guias.firmaPaso(paso)
      or aTexto(antes.elementos) ~= aTexto(paso.elementos) then
      return false
    end
  end
  return true
end

-- La sexta guía sustituye a la más antigua que no sea la cargada ni la de volver (T3), y la misma clave, a la anterior.
-- La ruta empieza de cero, salvo (T3) que sea la misma clave y la guía entera siga igual: entonces sigue por donde iba.
-- Guarda la guía validada `guia` en SnetForeverPJ.ia.guias (sin abrirla). false si no se pudo guardar.
local function guardarGuia(guia)
  local guias = guardadas()
  if not guias then
    Eventos.emitir("SNF_IA_AVISO", "IA_GUIA_NO_GUARDADA")
    return false
  end
  local clave = guia.clave
  local vieja = guias[clave]
  guias[clave] = nil
  local ultima = 0
  for _, otra in pairs(guias) do
    ultima = math.max(ultima, fechaDe(otra))
  end
  guia.guardada = ultima + 1
  guia.guardadaEn = SNF.API.horaServidor() -- lote E1b: la hora sale en el menú «Rutas de la IA»
  guias[clave] = guia
  -- Con más de las que caben, fuera las más antiguas (la recién guardada es la más reciente: no se toca). T3: ni la
  -- cargada ni la de volver, que se perderían a medias.
  local lista = Ruta.guiasIA()
  local sobran = #lista - MAX_GUIAS_IA
  local cargada, vuelta = SNF.Motor.estado().clave, SNF.Avisos.volverA()
  for _, otra in ipairs(lista) do
    if sobran <= 0 then
      break
    end
    if otra ~= clave and otra ~= cargada and otra ~= vuelta then
      Ruta.quitarGuia(otra)
      sobran = sobran - 1
    end
  end
  local pj = rawget(_G, "SnetForeverPJ")
  if not mismaGuia(vieja, guia) then
    if type(pj.progreso) == "table" then
      pj.progreso[clave] = nil
    end
    limpiarSaltados(clave)
    SNF.Motor.olvidarMarcas(clave)
  end
  return true
end

function Ruta.aceptarGuia()
  local guia = guiaPendienteIA
  guiaPendienteIA = nil
  if type(guia) ~= "table" or not guardarGuia(guia) then
    return false
  end
  local abierta = SNF.Guias.abrirLateral(guia.clave)
  repintarVentana()
  return abierta
end

-- Ronda 1 (I2): la guía pedida que se queda en la tarjeta (había otra a medias) se guarda ya en «Rutas de la IA», sin
-- abrirla y sin quitarla de la tarjeta: un /reload no la pierde y la tarjeta solo decide si se abre ahora. La misma
-- clave que la cargada no se cambia por debajo del motor: se guarda al abrirla.
function Ruta.guardarGuiaPendiente()
  local guia = guiaPendienteIA
  if type(guia) ~= "table" or guia.clave == SNF.Motor.estado().clave or not guardarGuia(guia) then
    return false
  end
  repintarVentana()
  return true
end


---------------------------------------------------------------------------------------------------
-- Abrir y dejar la guía de la ruta de pines (lote F).
---------------------------------------------------------------------------------------------------

-- Su progreso es el de cualquier guía, por clave: al empezar de cero (o al quitarla) se borra.
local function olvidarProgreso(clave)
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj) ~= "table" then
    return
  end
  if type(pj.progreso) == "table" then
    pj.progreso[clave] = nil
  end
  limpiarSaltados(clave)
  SNF.Motor.olvidarMarcas(clave)
end

-- Abre la guía de la ruta activa como lateral («Volver» lleva a la de antes). nueva: empieza de cero.
abrirGuia = function(nueva)
  if nueva then
    olvidarProgreso(actual.clave)
  end
  local abierta = SNF.Guias.abrirLateral(actual.clave)
  repintarVentana()
  return abierta
end

-- Si la guía `clave` está abierta, vuelve a la de antes (la de la que se abrió o, si no hay, la de por defecto). Su
-- progreso se borra.
dejarGuia = function(clave)
  if SNF.Motor.estado().clave == clave then
    if not SNF.Avisos.volver() then
      SNF.Guias.volverPorDefecto()
    end
    repintarVentana()
  end
  olvidarProgreso(clave)
end

---------------------------------------------------------------------------------------------------
-- Eventos.
---------------------------------------------------------------------------------------------------

-- Vuelve a escribir las etiquetas en los mismos puntos tras un cambio en las misiones.
local function alCambiarMisiones()
  olvidar()
  if not actual then
    return
  end
  if reescribirEtiquetas() then
    Eventos.emitir("SNF_PUNTOS_CAMBIADOS", "ia")
  end
end

for _, evento in ipairs({"QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE"}) do
  Eventos.escuchar(evento, alCambiarMisiones)
end

Eventos.escuchar("UNIT_QUEST_LOG_CHANGED", function(unidad)
  if not esSecreto(unidad) and unidad == "player" then
    alCambiarMisiones()
  end
end)

-- La guía de la ruta avanzó, se abrió o se dejó: la línea del mapa (Ruta.estado) y el fin de la ruta.
local function alCambiarGuia()
  if actual then
    comprobarFin()
  end
  avisarCambio()
end
Eventos.escuchar("SNF_PASOS_CAMBIADOS", alCambiarGuia)

-- Ronda 1 (Importante 1): si estaba abierta la guía de la ruta y se carga otra que no es la de la ruta activa («Volver a
-- …», otra guía del menú), la ruta se quita del todo, como con «Quitar pines»: pines, línea, lo guardado, su progreso y
-- su clave. Sigue en las rutas elegibles (ia.rutas): «Rutas de la IA» la vuelve a abrir desde el principio. Aceptar otra
-- ruta o elegir una del menú no la quita: para entonces `actual` ya es la nueva.
local claveCargada -- la guía cargada en el SNF_GUIA_CARGADA anterior
Eventos.escuchar("SNF_GUIA_CARGADA", function()
  local antes = claveCargada
  claveCargada = SNF.Motor.estado().clave
  if actual and actual.clave and antes == actual.clave and claveCargada ~= actual.clave then
    Ruta.quitar()
  end
  alCambiarGuia()
end)

-- Los pines de la ruta guardada, con las etiquetas al día (un solo SNF_PUNTOS_CAMBIADOS, el de Capa.poner). Su guía ya
-- la encontró Datos.guia (Ruta.guia lee lo guardado) si era la guía del personaje.
local function recuperar()
  leerGuardada()
  if not actual then
    return
  end
  reescribirEtiquetas()
  Capa.poner("ia", actual.puntos)
  comprobarFin()
  avisarCambio()
end

-- Si la capa «ia» se vacía desde fuera (Capa.quitar("ia") directo), se hace lo mismo que Ruta.quitar.
Eventos.escuchar("SNF_PUNTOS_CAMBIADOS", function(origen)
  if origen == "ia" and actual and #Capa.puntos("ia") == 0 then
    local clave = actual.clave
    actual = nil
    olvidar()
    guardar()
    SNF.Marcador.quitar()
    if clave then
      dejarGuia(clave)
    end
    avisarCambio()
  end
end)

-- Ronda 1 (Minor 1): las rutas de zona guardadas, como mucho MAX_GUIAS_IA (fuera las más antiguas).
local function topeGuiasIA()
  local lista = Ruta.guiasIA()
  while #lista > MAX_GUIAS_IA do
    Ruta.quitarGuia(table.remove(lista, 1))
  end
end

Eventos.escuchar("PLAYER_ENTERING_WORLD", function()
  if recuperada then
    return
  end
  recuperada = true
  rutasDeGuardado(false) -- limpia lo guardado (tope y fechas)
  topeGuiasIA()
  recuperar()
end)

-- La navegación pregunta aquí si una parada de una ruta de la capa «ia» está hecha por lo que pasa en el juego. Desde el
-- lote F los puntos de la ruta de la IA no llevan `seguir` (la flecha va con su guía), así que solo cuenta si alguien pone
-- en esa capa puntos que se siguen.
SNF.Navegacion.ponerFinDeParada(Ruta.hecho)
