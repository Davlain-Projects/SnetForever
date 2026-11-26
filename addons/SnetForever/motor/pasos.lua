-- SnetForever: motor de pasos (plano 1 §5). Carga una guía, decide qué pasos se ven, los avanza con los eventos
-- (T1: en un ciclo, el actual y todos los ya hechos que vienen detrás; ver «Ver hacia delante»), permite «Saltar» (los
-- saltados van a una lista para retomarlos) y guarda el progreso por personaje en SnetForeverPJ.
--
-- Motor.cargar(clave, opciones?) -> boolean   opciones.n: empezar en el primer paso con n >= opciones.n.
-- Motor.recargar()                            vuelve a filtrar (con el nivel de ahora) conservando el paso actual
--                                             por id (si no, por n) y la mem de los pasos que siguen activos.
-- Motor.actualizar()                          un ciclo; Motor.ciclos los cuenta.
-- Motor.estado() -> {clave, actual, activos, siguientes, fin, sinGuia}   T1: siguientes sin los ya hechos.
-- Motor.activos() -> índices de los pasos activos, la MISMA lista del motor (sin copia): solo se lee y no se
--                    guarda (cambia con cada ciclo). La usa la navegación en cada fotograma para no crear tablas.
-- Motor.paso(i) -> PasoVivo = {i, id, n, datos, hecho, saltado, pegajoso, espera, activo,
--                              completaCon, requiere, nivelMinimo, etiqueta, elementos = {{datos, resultado, extra, mem}}}
--   id es datos.id o, en un paso sin id, la clave de respaldo «n:<n>» (la que usan progreso, saltados y retomados).
--   espera: "requiere" (#requires sin cumplir) o "nivel" (#level mayor que el del personaje); nil si no espera.
-- Motor.saltar(i), Motor.retomar(clave, id) -> boolean, Motor.quitarSaltado(clave, id), Motor.marcarManual(i, k, valor),
-- Motor.irA(i)                                T4: hacia delante, los de en medio sin hacer van a saltados (motivo ir_a);
--                                             hacia atrás, el paso queda retenido (ver `retenido`).
-- Motor.saltosDeIrA(i) -> índices             T4: los que irA(i) dejaría en saltados (la ventana lo pregunta antes).
-- Motor.retenido() -> i, hecho | nil          T4: el paso retenido y si ya está completo.
-- Motor.seguir()                              T4: suelta el retenido y hace un ciclo (el adelanto de T1 sigue solo).
-- Motor.marcarHecho(i, k, valor?)              la casilla de la ventana: el elemento k queda hecho a mano (true, por
--                                             defecto) o deja de estarlo (false); se guarda en progreso.forzados[id][k].
-- Motor.olvidarMarcas(clave)                  borra las marcas a mano (forzados y manuales) de esa guía.
-- Motor.marcarLlegado(i, k)                   el elemento k del paso i (un goto objetivo) se dio por llegado: mem.llegado
--                                             y progreso.llegados[id][k]; al reactivar el paso se recupera de ahí.
-- Motor.marcarAlcanzado(i, k, valor)          punto de flecha alcanzado (true) o de nuevo en juego (false, #loop):
--                                             mem.alcanzado y progreso.alcanzados[id][k]; se recupera al activar.
-- Motor.parar(), Motor.reanudar()            quitan y vuelven a poner el temporizador (PLAYER_LEAVING_WORLD y la vuelta
--                                             al mundo, arranque.lua). Parado, cargar() no lo pone hasta reanudar().
-- Motor.etiqueta(paso, nombre) -> valor de la etiqueta de paso para el personaje (etiquetasPorFiltro gana).
-- Motor.numeroGuardado(clave) -> n | nil, acabada   T3: el número del paso guardado de una guía (cargada o no) y si se
--                                             guardó acabada.
-- Motor.resumir(pasoVivo) -> texto para la lista de saltados (ui/texto.lua lo cambia por Texto.resumenPaso al cargar).
-- Motor.noDisponible(pasoVivo) -> {q, previa?, viaje?} | nil   12-nov: el paso no se puede hacer (ver «Pasos que no se
--                                             pueden hacer» abajo); el motor lo salta al llegar, la ventana lo enseña
--                                             en gris y la ruta no va a él.
-- Emite SNF_GUIA_CARGADA(clave) y SNF_PASOS_CAMBIADOS.
--
-- Pegajosos (plano 1 §2.2, §5.3-5.4): un paso con #completewith o #sticky. El puntero (el paso actual) nunca descansa
-- en uno: los pasa de largo y quedan activos junto a los siguientes hasta completarse (por sus elementos o, con
-- #completewith, al pasar el paso indicado). Completados, se apuntan en progreso.pegajosos[id].
-- Activos = los pegajosos anteriores sin hacer con su #requires cumplido y nivel suficiente + los retomados + el
-- actual (si no espera). Un paso con #requires sin cumplir o #level sin alcanzar espera (no se activa ni avanza)
-- hasta que se cumple o se salta (O11: #level espera, no salta).
--
-- Eventos: el motor escucha solo los eventos de los elementos de los pasos activos, más PLAYER_LEVEL_UP (que
-- recarga la guía con el nivel nuevo y luego llega a los evaluadores con su argumento). Cada evento evalúa los
-- elementos que lo escuchan y solo pide un ciclo. Un temporizador de 0,2 s hace un ciclo si se pidió (como mucho uno
-- por tick) y, cada 5 ticks (~1 s), repasa sin evento todos los elementos activos (fly, itemcount, cooldown, aura y
-- las demás condiciones sin evento propio); si el repaso cambia algo, pide un ciclo.
local _, SNF = ...
local Motor = {}
SNF.Motor = Motor

local Elementos = SNF.Elementos
local Eventos = SNF.Eventos
local Filtros = SNF.Filtros
local Datos = SNF.Datos
local Personaje = SNF.Personaje

local PERIODO = 0.2 -- segundos entre ticks del temporizador
local CICLOS_POR_REPASO = 5 -- un repaso sin evento cada ~1 s
local MAX_SIGUIENTES = 20 -- pasos que da estado().siguientes (la ventana y los pines toman los que necesitan)
local MAX_MIRAR = 60 -- ronda 1 de T1 (I3): pasos de delante que estado() mira para no enseñar los ya hechos

-- Resultados de un elemento que no impiden completar el paso. ir_a e ir_guia se atienden antes de completar (ver
-- buscarSalto); si la etiqueta o la guía no existen, no hacen nada y no bloquean.
local NO_BLOQUEA = {hecho = true, info = true, ir_a = true, ir_guia = true}

Motor.ciclos = 0

local guia -- la Guia de los datos cargada (nil sin guía)
local clave -- su clave real (la de SNF_RUTAS.guias)
local pasos = {} -- PasoVivo, ya filtrados
local porId = {} -- [id] = índice en pasos
local porEtiqueta = {} -- [#label] = índice en pasos
local actual = 0 -- #pasos + 1: pasado el último paso, esperando a los pegajosos que quedan
local fin = false
local activos = {}
local sucio = false -- algún resultado cambió desde el último SNF_PASOS_CAMBIADOS
local pedido = false -- algo pidió un ciclo al temporizador
local conservar -- [id] = PasoVivo de antes de recargar(): sus elementos conservan la mem al reactivarse
local nivelVisto -- el último nivel que dio PLAYER_LEVEL_UP (UnitLevel puede ir por detrás)
local temporizador
local parado = false -- Motor.parar(): fuera del mundo (pantalla de carga, /reload), sin temporizador
local pendiente = false -- había (o se pidió) temporizador mientras estaba parado
local tics = 0
local escuchados = {} -- [evento] = true, los que el motor tiene registrados en Eventos
-- Ronda 1 de T1 (I3): la lista de siguientes de Motor.estado() se guarda hasta que algo cambia (un evento que llega al
-- motor o a las misiones, un ciclo, el repaso de cada segundo, un aviso de pasos cambiados o colocar la guía). Así
-- llamarlo varias veces seguidas no vuelve a mirar los pasos de delante.
local versionEstado = 0
local guardadoSiguientes -- {version, pasos, desde, lista}
-- T4: el paso puesto con Motor.irA hacia atrás (su índice, que es el actual). Ni el ciclo ni el adelanto lo completan
-- solos: así el jugador puede mirar un paso ya hecho sin que rebote. Se suelta con Motor.seguir(), al marcar algo, al
-- elegir otro paso o al moverse el actual.
local retenido
-- T4: algo cambió en el registro de misiones: el ciclo vuelve a mirar los saltados por «no disponible».
local revisarNoDisponibles = false

local function olvidarEstado()
  versionEstado = versionEstado + 1
end
local manejadores = {} -- [evento] = función que se registra en Eventos

---------------------------------------------------------------------------------------------------
-- Etiquetas y filtrado (plano 1 §5.1-5.2).
---------------------------------------------------------------------------------------------------

-- El personaje para filtros y #level: la copia de Personaje con, como poco, el nivel del último PLAYER_LEVEL_UP
-- (así no depende del orden en que los marcos reciben el evento).
local function pj()
  local p = Personaje.actual()
  if nivelVisto and (p.nivel or 1) < nivelVisto then
    local copia = {}
    for k, v in pairs(p) do
      copia[k] = v
    end
    copia.nivel = nivelVisto
    return copia
  end
  return p
end

-- Valor de la etiqueta `nombre` del paso (datos de la fase 1) para el personaje: gana la primera de
-- etiquetasPorFiltro con ese nombre cuyo filtro aplica; si no hay, etiquetas[nombre].
function Motor.etiqueta(datos, nombre, personaje)
  personaje = personaje or pj()
  local porFiltro = datos.etiquetasPorFiltro
  if porFiltro then
    for _, e in ipairs(porFiltro) do
      if e.nombre == nombre and Filtros.evaluar(e.filtro, personaje) then
        return e.valor
      end
    end
  end
  return datos.etiquetas and datos.etiquetas[nombre]
end

-- Ajuste «saltar pasos por nivel» (como en motor/elementos-mundo.lua): sin valor guardado, activado.
local function saltarPorNivel()
  return SNF.Ajustes.get("pasos.saltarPorNivel") ~= false
end

-- Mazmorras: con los campos mazmorra/sinMazmorra manda guia.mazmorras; sin ellos (necesidad 4), cada requisito
-- {t="mazmorra", d} que aplica deja el paso solo en las guías de tipo "mazmorras" («!» delante: solo en las otras).
local function mazmorraVisible(datos, g, personaje)
  local activas = g.mazmorras or {}
  if datos.mazmorra then
    return activas[datos.mazmorra] == true
  end
  if datos.sinMazmorra then
    return activas[datos.sinMazmorra] ~= true
  end
  local deMazmorras = g.tipo == "mazmorras"
  for _, r in ipairs(datos.requisitos or {}) do
    if r.t == "mazmorra" and type(r.d) == "string" and Filtros.evaluar(r.filtro, personaje) then
      local negado = string.sub(r.d, 1, 1) == "!"
      if negado == deMazmorras then
        return false
      end
    end
  end
  return true
end

-- Lote C, ronda 1 (52-M8): ¿sale el paso en la lista de la ventana? Con elementos y sin las etiquetas optional ni
-- hidewindow (la ventana se los salta). Solo los que salen llevan número (pv.numero: 1, 2, 3… entre ellos).
local function etiquetaActiva(datos, nombre, personaje)
  local valor = Motor.etiqueta(datos, nombre, personaje)
  return valor ~= nil and valor ~= false
end

function Motor.enLista(pv, personaje)
  return type(pv) == "table" and #pv.elementos > 0 and not etiquetaActiva(pv.datos, "optional", personaje)
    and not etiquetaActiva(pv.datos, "hidewindow", personaje)
end

local function pasoVisible(datos, g, personaje)
  if not Filtros.evaluar(datos.filtro, personaje) then
    return false
  end
  if Motor.etiqueta(datos, "ssf", personaje) then
    return false
  end
  local tope = tonumber(Motor.etiqueta(datos, "maxlevel", personaje))
  if tope and saltarPorNivel() and (personaje.nivel or 1) > tope then
    return false
  end
  return mazmorraVisible(datos, g, personaje)
end

-- Clave del paso para el progreso, los saltados, los retomados y las marcas: su id o, si no tiene, «n:<n>» (o
-- «i:<índice>» si tampoco tiene n), para no indexar nunca con nil.
local function idDe(datos, i)
  if datos.id ~= nil then
    return datos.id
  end
  local n = tonumber(datos.n)
  if n then
    return string.format("n:%d", math.floor(n))
  end
  return string.format("i:%d", i)
end

-- Clave de un paso (de los datos de la guía) para el progreso, los saltados y los retomados; la usa también la interfaz.
Motor.idPaso = idDe

-- ¿La guía `c` tiene hoy un paso con la clave `id`? (Los saltados de una guía que cambió pueden apuntar a pasos que ya no están.)
function Motor.existePaso(c, id)
  local g = Datos.guia(c)
  if not g then
    return false
  end
  for i, datos in ipairs(g.pasos or {}) do
    if idDe(datos, i) == id then
      return true
    end
  end
  return false
end

-- Plano 1 §5.2.7 (GuideWindow.lua:1984-1994): si un paso no pegajoso requiere una etiqueta ya vista que es de un
-- #sticky sin #completewith, ese sticky se completará con este paso (completaCon = la etiqueta de este paso; si no
-- tiene, se le crea una estable a partir de su id). Gana el primer paso que lo requiere. Se mira antes de indexar la
-- etiqueta del propio paso, como en el original. Devuelve la etiqueta del paso (la creada, si hizo falta).
local function completarStickyRequerido(pv)
  if pv.pegajoso or pv.requiere == nil then
    return pv.etiqueta
  end
  local j = porEtiqueta[pv.requiere]
  local q = j and pasos[j]
  if not q or not q.pegajoso or q.completaCon ~= nil then
    return pv.etiqueta
  end
  if pv.etiqueta == nil then
    if type(pv.id) == "string" then
      pv.etiqueta = "snf:" .. pv.id
    else
      pv.etiqueta = string.format("snf:i%d", pv.i)
    end
  end
  q.completaCon = pv.etiqueta
  return pv.etiqueta
end

-- T1 (vendedor o instructor que acompaña): un vendor en un paso que también tiene collect (o un trainer con train) está
-- ahí para comprar o aprender eso. e.sigue = índices de esos elementos en el paso; en ellos, e.seguidores = los índices de
-- quienes los siguen. Con todos los seguidos hechos, el vendor da info (ver `seguido`); si no, lo suyo, como antes.
local ACOMPANA = {vendor = "collect", trainer = "train"}

local function unirAcompanantes(elementos)
  for k, e in ipairs(elementos) do
    local busca = ACOMPANA[e.datos.t]
    if busca then
      for j, o in ipairs(elementos) do
        if o.datos.t == busca then
          e.sigue = e.sigue or {}
          e.sigue[#e.sigue + 1] = j
          o.seguidores = o.seguidores or {}
          o.seguidores[#o.seguidores + 1] = k
        end
      end
    end
  end
end

-- T1 (vuelo conocido): el maestro de vuelo de un fp. Los ids de los target del mismo paso (dato de la guía) o, si no
-- hay, el maestro de la base a menos de 120 yd del primer goto del paso (SNF.Viaje.maestroCerca). Sin ninguno, el fp
-- queda como antes. Va en e.maestros y de ahí a mem.maestros al activar.
local function puntoDeGoto(d)
  if type(d.wx) == "number" and type(d.wy) == "number" then
    return {wx = d.wx, wy = d.wy, inst = d.inst}
  end
  local Coord = SNF.Coord
  if Coord and d.mapa and d.x and d.y then
    return Coord.aMundo({mapa = d.mapa, x = d.x, y = d.y})
  end
  return nil
end

local function ponerMaestros(elementos)
  local fps = {}
  local ids, w = {}, nil
  for _, e in ipairs(elementos) do
    local d = e.datos
    if d.t == "fp" then
      fps[#fps + 1] = e
    elseif d.t == "target" and type(d.npcs) == "table" then
      for _, npc in ipairs(d.npcs) do
        if type(npc) == "table" and type(npc.id) == "number" then
          ids[#ids + 1] = npc.id
        end
      end
    elseif d.t == "goto" and w == nil then
      w = puntoDeGoto(d)
    end
  end
  if #fps == 0 then
    return
  end
  if #ids == 0 then
    local cerca = w and SNF.Viaje and SNF.Viaje.maestroCerca(w)
    if cerca then
      ids[1] = cerca
    end
  end
  for _, e in ipairs(fps) do
    e.maestros = #ids > 0 and ids or nil
  end
end

-- Rehace pasos, porId y porEtiqueta a partir de la guía cargada. Las etiquetas que cambian el avance se leen una
-- vez aquí (con etiquetasPorFiltro). Como en RestedXP (guide.labels[X] = índice en el bucle), si dos pasos tienen
-- la misma #label gana el último.
local function construir()
  local personaje = pj()
  pasos, porId, porEtiqueta = {}, {}, {}
  for _, datos in ipairs(guia.pasos or {}) do
    if pasoVisible(datos, guia, personaje) then
      local elementos = {}
      local acepta = {} -- [q] = true: misiones que se aceptan en este mismo paso
      for _, el in ipairs(datos.elementos or {}) do
        if Filtros.evaluar(el.filtro, personaje) then
          elementos[#elementos + 1] = {datos = el, resultado = nil, mem = {}}
          if el.t == "accept" and el.q ~= nil then
            acepta[el.q] = true
          end
        end
      end
      -- 12-nov: hacer o entregar una misión que no se coge en este paso; sin ella en el diario, no se puede (ver
      -- motor/elementos-misiones.lua, sinLaMision).
      for _, e in ipairs(elementos) do
        local t = e.datos.t
        if (t == "complete" or t == "turnin") and e.datos.q ~= nil and not acepta[e.datos.q] then
          e.sinMision = true
        end
      end
      unirAcompanantes(elementos)
      ponerMaestros(elementos)
      local i = #pasos + 1
      local id = idDe(datos, i)
      local completaCon = Motor.etiqueta(datos, "completewith", personaje)
      local sticky = Motor.etiqueta(datos, "sticky", personaje)
      local etiqueta = Motor.etiqueta(datos, "label", personaje)
      pasos[i] = {
        i = i, id = id, n = datos.n, datos = datos,
        hecho = false, saltado = false, espera = nil, activo = false,
        pegajoso = completaCon ~= nil or (sticky ~= nil and sticky ~= false),
        completaCon = completaCon,
        requiere = Motor.etiqueta(datos, "requires", personaje),
        nivelMinimo = tonumber(Motor.etiqueta(datos, "level", personaje)),
        etiqueta = etiqueta,
        elementos = elementos,
      }
      if porId[id] == nil then
        porId[id] = i
      end
      etiqueta = completarStickyRequerido(pasos[i])
      if etiqueta ~= nil then
        porEtiqueta[etiqueta] = i
      end
    end
  end
  -- 12-nov: si la guía acepta la misión en un paso posterior, el autor cuenta con que se avance antes de cogerla
  -- (recoger los objetos de camino, como los cristales de Un'Goro): ese complete o turnin espera como siempre.
  local despues = {}
  for i = #pasos, 1, -1 do
    for _, e in ipairs(pasos[i].elementos) do
      if e.sinMision and despues[e.datos.q] then
        e.sinMision = nil
      end
    end
    for _, e in ipairs(pasos[i].elementos) do
      if e.datos.t == "accept" and e.datos.q ~= nil then
        despues[e.datos.q] = true
      end
    end
  end
  -- Lote C, ronda 1 (52-M8): el número que ve el jugador cuenta solo los pasos que salen en la lista de la ventana.
  local numero = 0
  for _, pv in ipairs(pasos) do
    if Motor.enLista(pv, personaje) then
      numero = numero + 1
      pv.numero = numero
    end
  end
end

-- Índice del primer paso con n >= n (nil si no hay).
local function primeroConN(n)
  n = tonumber(n)
  if not n then
    return nil
  end
  for i, pv in ipairs(pasos) do
    local suyo = tonumber(pv.n)
    if suyo and suyo >= n then
      return i
    end
  end
  return nil
end

---------------------------------------------------------------------------------------------------
-- Guardado: progreso, saltados y retomados.
---------------------------------------------------------------------------------------------------

local function tabla(padre, campo)
  if type(padre[campo]) ~= "table" then
    padre[campo] = {}
  end
  return padre[campo]
end

-- SnetForeverPJ.progreso[clave], con sus tablas.
local function progreso()
  local p = tabla(SnetForeverPJ.progreso, clave)
  tabla(p, "pegajosos")
  tabla(p, "manuales")
  tabla(p, "forzados")
  tabla(p, "llegados")
  tabla(p, "alcanzados")
  return p
end

-- Borra las marcas a mano (casillas de la ventana y manuales) de la guía c. Ruling F3-23: son de la guía de su clave y
-- solo se borran al acabarla (también si pasa sola a la siguiente) o al elegirla a mano en el selector de la ventana
-- (Motor.olvidarMarcas); abrir una lateral y volver no las toca. Mientras se sigue en ella se quedan: «Ir a» un paso
-- todo marcado lo deja hecho y el ciclo lo pasa de largo.
local function limpiarMarcas(c)
  local p = c ~= nil and type(SnetForeverPJ.progreso[c]) == "table" and SnetForeverPJ.progreso[c] or nil
  if p then
    p.forzados, p.manuales = {}, {}
  end
end

-- Guarda el paso actual. Pasado el último paso (esperando a los pegajosos) o con la guía acabada, guarda el último
-- con pasado = true: al cargar se vuelve detrás de él, no a él.
local function guardarProgreso()
  local p = progreso()
  local pv = not fin and pasos[actual]
  if pv then
    p.id, p.n, p.pasado = pv.id, pv.n, nil
  elseif (fin or actual > #pasos) and #pasos > 0 then
    local ultimo = pasos[#pasos]
    p.id, p.n, p.pasado = ultimo.id, ultimo.n, true
  end
  SnetForeverPJ.guia = clave
end

local function indiceSaltado(c, id)
  for k, s in ipairs(SnetForeverPJ.saltados) do
    if s.clave == c and s.id == id then
      return k
    end
  end
  return nil
end

local function retomado(c, id)
  local r = SnetForeverPJ.retomados[c]
  return type(r) == "table" and r[id] == true
end

local function olvidarRetomado(c, id)
  local r = SnetForeverPJ.retomados[c]
  if type(r) == "table" then
    r[id] = nil
    if next(r) == nil then
      SnetForeverPJ.retomados[c] = nil
    end
  end
end

-- Da el paso por saltado y lo apunta en saltados (una vez). Lote D (D2): un salto solo por gris lleva motivo = "gris" y
-- el nivel de la misión, que la lista de «Pasos saltados» enseña.
-- 12-nov: un salto por «no disponible» lleva además la misión y la previa que falta (nd = Motor.noDisponible(pv)).
local function marcarSaltado(pv, motivo, nivel, nd)
  pv.saltado, pv.hecho = true, true
  olvidarRetomado(clave, pv.id)
  if not indiceSaltado(clave, pv.id) then
    local saltados = SnetForeverPJ.saltados
    saltados[#saltados + 1] = {
      clave = clave, id = pv.id, n = pv.n, resumen = Motor.resumir(pv), fecha = date("%Y-%m-%d %H:%M"),
      motivo = motivo, nivel = nivel, q = nd and nd.q, previa = nd and nd.previa,
    }
  end
end

-- Lo saca de saltados y de retomados.
local function olvidarSaltado(c, id)
  local k = indiceSaltado(c, id)
  if k then
    table.remove(SnetForeverPJ.saltados, k)
  end
  olvidarRetomado(c, id)
end

---------------------------------------------------------------------------------------------------
-- Elementos.
---------------------------------------------------------------------------------------------------

-- T1: el resultado de un vendor (o trainer) que acompaña (e.sigue, ver unirAcompanantes): con lo suyo pendiente y todos
-- los seguidos hechos, info; si no, lo suyo.
local function seguido(pv, e, propio)
  if propio ~= "pendiente" or not e.sigue then
    return propio
  end
  for _, j in ipairs(e.sigue) do
    local o = pv.elementos[j]
    if not o or o.resultado ~= "hecho" then
      return propio
    end
  end
  return "info"
end

local function poner(e, resultado, extra)
  local cambio = resultado ~= e.resultado or (type(extra) ~= "table" and extra ~= e.extra)
  e.extra = extra
  if cambio then
    e.resultado = resultado
    sucio = true
    pedido = true
  end
end

-- Evalúa el elemento k del paso con el evento y sus argumentos (nil al activarse y en los repasos). Un evaluador
-- que falla manda su error a geterrorhandler() (una vez por elemento) y queda pendiente: el paso no avanza solo.
-- Un cambio de resultado pide un ciclo. e.propio es lo que dio el evaluador; e.resultado, lo que cuenta (con el
-- vendedor que acompaña ya resuelto). Si otros elementos del paso siguen a este, se rehacen con su e.propio.
local function evaluar(pv, k, evento, ...)
  local e = pv.elementos[k]
  local ok, resultado, extra = pcall(Elementos.evaluar, e.datos, e.mem, evento, ...)
  if not ok then
    if not e.fallo then
      e.fallo = true
      geterrorhandler()(resultado)
    end
    resultado, extra = "pendiente", nil
  end
  -- El extra de ir_guia es una lista nueva en cada evaluación: solo se comparan los extras que no son tablas.
  -- Un elemento dado por hecho a mano (Motor.marcarHecho, la casilla de la ventana) queda hecho pase lo que pase.
  if e.mem and e.mem.forzado then
    resultado, extra = "hecho", nil
  end
  e.propio = resultado
  poner(e, seguido(pv, e, resultado), extra)
  for _, j in ipairs(e.seguidores or {}) do
    local s = pv.elementos[j]
    if s and s.propio ~= nil then
      poner(s, seguido(pv, s, s.propio), s.extra)
    end
  end
end

-- La mem con la que empieza el elemento k del paso al activarse: las marcas guardadas en el progreso (manual, a mano,
-- llegado, alcanzado) y lo que puso construir (sinMision, maestros).
local function memNueva(pv, k, e)
  local p = progreso()
  local mem = {}
  local function marca(lista)
    lista = lista[pv.id]
    return type(lista) == "table" and lista[k] and true or nil
  end
  mem.marcado = marca(p.manuales)
  mem.forzado = marca(p.forzados)
  mem.llegado = marca(p.llegados)
  mem.alcanzado = marca(p.alcanzados)
  mem.sinMision = e.sinMision
  mem.maestros = e.maestros
  return mem
end

-- Activa el paso: memoria nueva en cada elemento (con la marca manual guardada) y primera evaluación sin evento.
-- Tras recargar(), un elemento que ya estaba activo conserva su mem (hay estados que solo llegan por evento: la
-- ventana abierta del vendedor, el fantasma, el fp/hs ya visto...). Un paso normal sin elementos se da por hecho
-- (uno pegajoso se completa en el ciclo, para apuntarlo en pegajosos).
local function activar(pv)
  local previo = conservar and conservar[pv.id]
  local viejos = {}
  if previo then
    for _, e in ipairs(previo.elementos) do
      viejos[e.datos] = e
    end
  end
  for k, e in ipairs(pv.elementos) do
    local viejo = viejos[e.datos]
    if viejo then
      e.mem, e.resultado, e.extra, e.fallo, e.saltoHecho = viejo.mem, viejo.resultado, viejo.extra, viejo.fallo, viejo.saltoHecho
      e.propio = viejo.propio
      e.mem.sinMision, e.mem.maestros = e.sinMision, e.maestros
    else
      e.mem = memNueva(pv, k, e)
      e.resultado, e.extra, e.fallo, e.saltoHecho, e.propio = nil, nil, nil, nil, nil
    end
    evaluar(pv, k, nil)
  end
  if #pv.elementos == 0 and not pv.pegajoso then
    pv.hecho = true
  end
  pv.activo = true
end

local function completo(pv)
  if pv.saltado or #pv.elementos == 0 then
    return true
  end
  local todos = true
  for _, e in ipairs(pv.elementos) do
    if e.resultado == "saltar_paso" then
      return true
    end
    if not NO_BLOQUEA[e.resultado] then
      todos = false
    end
  end
  return todos
end

---------------------------------------------------------------------------------------------------
-- Pegajosos, #requires y #level.
---------------------------------------------------------------------------------------------------

-- #requires X: cumplido si el paso X no existe tras filtrar, está hecho o saltado o, si no es pegajoso, ya quedó
-- atrás. No sigue cadenas, así que un ciclo de requires no cuelga: los pasos del ciclo esperan hasta saltarlos.
local function requisitoCumplido(pv)
  if pv.requiere == nil then
    return true
  end
  local j = porEtiqueta[pv.requiere]
  if not j or j == pv.i then
    return true
  end
  local q = pasos[j]
  if q.hecho or q.saltado then
    return true
  end
  return not q.pegajoso and j < actual
end

local function esperaDe(pv)
  if not requisitoCumplido(pv) then
    return "requiere"
  end
  if pv.nivelMinimo and (pj().nivel or 1) < pv.nivelMinimo then
    return "nivel"
  end
  return nil
end

-- #completewith: "next" se da por hecho cuando el actual pasa del índice + 1; una etiqueta, cuando el actual pasa
-- de ese paso o, si ese paso es pegajoso, cuando está hecho (en pegajosos). Una etiqueta que no existe no completa.
local function completadoPorEtiqueta(pv)
  local cw = pv.completaCon
  if cw == nil then
    return false
  end
  if cw == "next" then
    return actual > pv.i + 1
  end
  local j = porEtiqueta[cw]
  if not j or j == pv.i then
    return false
  end
  local q = pasos[j]
  if q.pegajoso then
    return q.hecho
  end
  return actual > j
end

-- Último índice de los pasos «anteriores» (pegajosos y retomados): los de antes del actual y, con la guía acabada,
-- también el último.
local function tope()
  if fin then
    return actual
  end
  return math.min(actual - 1, #pasos)
end

-- ¿Queda algún pegajoso que pueda estar activo? (con todos hechos, pasado el último paso se pasa a la siguiente guía)
local function pegajososPendientes()
  for _, pv in ipairs(pasos) do
    if pv.pegajoso and not pv.hecho and esperaDe(pv) == nil then
      return true
    end
  end
  return false
end

---------------------------------------------------------------------------------------------------
-- Eventos.
---------------------------------------------------------------------------------------------------

local function escucha(el, evento)
  for _, ev in ipairs(Elementos.eventos(el)) do
    if ev == evento then
      return true
    end
  end
  return false
end

-- Cada evento evalúa los elementos activos que lo escuchan y pide un ciclo (no lo hace).
local function alEvento(evento, ...)
  pedido = true
  olvidarEstado()
  for _, i in ipairs(activos) do
    local pv = pasos[i]
    for k, e in ipairs(pv.elementos) do
      if escucha(e.datos, evento) then
        evaluar(pv, k, evento, ...)
      end
    end
  end
end

-- PLAYER_LEVEL_UP(nivel): recarga con el nivel nuevo (términos n:, #level, maxlevel) y luego el evento llega con
-- su nivel a los evaluadores de los pasos activos.
local function alSubirNivel(nivel, ...)
  if type(nivel) == "number" and (nivelVisto == nil or nivel > nivelVisto) then
    nivelVisto = nivel
  end
  Motor.recargar()
  alEvento("PLAYER_LEVEL_UP", nivel, ...)
end

local function manejador(evento)
  local f = manejadores[evento]
  if not f then
    if evento == "PLAYER_LEVEL_UP" then
      f = alSubirNivel
    else
      f = function(...)
        alEvento(evento, ...)
      end
    end
    manejadores[evento] = f
  end
  return f
end

-- Deja registrados en Eventos solo los eventos de los elementos de los pasos activos, más PLAYER_LEVEL_UP.
local function sincronizarEventos()
  local quiero = {}
  if guia then
    quiero.PLAYER_LEVEL_UP = true
  end
  for _, i in ipairs(activos) do
    for _, e in ipairs(pasos[i].elementos) do
      for _, ev in ipairs(Elementos.eventos(e.datos)) do
        quiero[ev] = true
      end
    end
  end
  for ev in pairs(escuchados) do
    if not quiero[ev] then
      Eventos.dejar(ev, manejador(ev))
      escuchados[ev] = nil
    end
  end
  for ev in pairs(quiero) do
    if not escuchados[ev] then
      Eventos.escuchar(ev, manejador(ev))
      escuchados[ev] = true
    end
  end
end

-- Repaso periódico: todos los elementos de los pasos activos, sin evento.
local function repasar()
  olvidarEstado()
  for _, i in ipairs(activos) do
    local pv = pasos[i]
    for k = 1, #pv.elementos do
      evaluar(pv, k, nil)
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Activos, avance y fin de la guía.
---------------------------------------------------------------------------------------------------

-- Activos = los pegajosos anteriores sin hacer que no esperan + los retomados anteriores sin hacer + el actual si no
-- espera. Pone `espera` en cada paso, activa (activar) los que entran y apaga los que salen. Devuelve true si la
-- lista cambió.
local function calcularActivos()
  local nuevos = {}
  for _, pv in ipairs(pasos) do
    pv.espera = nil
  end
  if guia then
    for i = 1, tope() do
      local pv = pasos[i]
      -- Un pegajoso cuyo #completewith ya quedó atrás se cierra en el ciclo: no se activa ni registra eventos.
      if not pv.hecho and not (pv.pegajoso and completadoPorEtiqueta(pv)) then
        if pv.pegajoso then
          pv.espera = esperaDe(pv)
          if not pv.espera then
            nuevos[#nuevos + 1] = i
          end
        elseif retomado(clave, pv.id) then
          nuevos[#nuevos + 1] = i
        end
      end
    end
    -- El actual, si no espera ni está ya hecho (saltado): ese avanza en el ciclo sin activarse.
    local pv = not fin and pasos[actual]
    if pv and not pv.hecho then
      pv.espera = esperaDe(pv)
      if not pv.espera then
        nuevos[#nuevos + 1] = actual
      end
    end
  end
  local dentro = {}
  for _, i in ipairs(nuevos) do
    dentro[i] = true
    if not pasos[i].activo then
      activar(pasos[i])
    end
  end
  for i, pv in ipairs(pasos) do
    if pv.activo and not dentro[i] then
      pv.activo = false
    end
  end
  local distinto = #nuevos ~= #activos
  for k = 1, #nuevos do
    if nuevos[k] ~= activos[k] then
      distinto = true
    end
  end
  activos = nuevos
  return distinto
end

local function avisar()
  olvidarEstado()
  sincronizarEventos()
  sucio = false
  pedido = true
  Eventos.emitir("SNF_PASOS_CAMBIADOS")
end

local function cambiado()
  calcularActivos()
  avisar()
end

local function siguienteGuia()
  return SNF.Guias.primeraDisponible(guia.siguientes, pj())
end

-- Pone el actual en j, pasando de largo los pegajosos (quedan activos como anteriores). Pasado el último paso:
-- si quedan pegajosos que pueden estar activos, espera (actual = #pasos + 1); si no, la guía siguiente o, si no hay,
-- fin (el actual se queda en el último paso). Devuelve true si cargó otra guía.
local function avanzarA(j)
  retenido = nil
  while pasos[j] and pasos[j].pegajoso do
    j = j + 1
  end
  if j > #pasos then
    actual = #pasos + 1 -- para pegajososPendientes: todos los pasos ya quedan atrás
    if pegajososPendientes() then
      guardarProgreso()
      return false
    end
    local siguiente = siguienteGuia()
    if siguiente then
      limpiarMarcas(clave) -- la guía se ha acabado
      Motor.cargar(siguiente)
      return true
    end
    fin = true
    actual = #pasos
    guardarProgreso()
    limpiarMarcas(clave)
    return false
  end
  actual = j
  local pv = pasos[j]
  if not pv.saltado then
    pv.hecho = false
  end
  guardarProgreso()
  return false
end

-- Un paso que se completa sin saltarlo sale de saltados y de retomados. Un pegajoso, además, se apunta por id.
local function completar(pv)
  pv.hecho = true
  if pv.pegajoso then
    progreso().pegajosos[pv.id] = true
  end
  if not pv.saltado then
    olvidarSaltado(clave, pv.id)
  end
end

-- Primer ir_guia (con una guía válida) o ir_a (con una etiqueta que existe y no es el actual) de los activos. Cada
-- elemento salta una vez por activación. Devuelve "guia", clave o "paso", índice.
local function buscarSalto()
  for _, i in ipairs(activos) do
    -- T4: un paso retenido no salta solo a otro sitio (sería el mismo rebote).
    for _, e in ipairs(i ~= retenido and pasos[i].elementos or {}) do
      if not e.saltoHecho then
        if e.resultado == "ir_guia" then
          local destino = e.extra and SNF.Guias.primeraDisponible(e.extra, pj()) or (e.extra == nil and siguienteGuia())
          if destino then
            e.saltoHecho = true
            return "guia", destino
          end
        elseif e.resultado == "ir_a" then
          local j = e.extra ~= nil and porEtiqueta[e.extra]
          if j and j ~= actual then
            e.saltoHecho = true
            return "paso", j
          end
        end
      end
    end
  end
  return nil
end

-- Coloca la guía en el paso `inicio` (#pasos + 1: pasado el último), pasando de largo los pegajosos. Los pasos
-- anteriores cuentan como hechos, los de saltados como saltados (los retomados no) y los pegajosos según
-- progreso.pegajosos. No activa nada: lo hace calcularActivos.
local function colocar(inicio)
  olvidarEstado()
  fin = false
  retenido = nil
  if #pasos == 0 then
    actual = 0
  else
    actual = math.max(1, math.min(inicio or 1, #pasos + 1))
    while pasos[actual] and pasos[actual].pegajoso do
      actual = actual + 1
    end
  end
  local enSaltados = {}
  for _, s in ipairs(SnetForeverPJ.saltados) do
    if s.clave == clave and s.id ~= nil then
      enSaltados[s.id] = true
    end
  end
  local hechos = progreso().pegajosos
  for j, pv in ipairs(pasos) do
    local enLista = enSaltados[pv.id] == true
    if enLista and retomado(clave, pv.id) then
      pv.saltado, pv.hecho = false, false
    elseif enLista then
      pv.saltado, pv.hecho = true, true
    elseif pv.pegajoso then
      pv.saltado, pv.hecho = false, hechos[pv.id] == true
    else
      pv.saltado, pv.hecho = false, j < actual
    end
  end
  guardarProgreso()
end

-- Lote D (D2): el paso actual se salta solo si es «gris» para el personaje (motor/dificultad.lua: todas sus misiones son
-- grises, ninguna está en el registro, ni es de clase, de mejoras o previa de una no gris de la guía). Va a saltados con
-- el motivo, como un «Saltar» del jugador, y se puede retomar (un retomado no se vuelve a saltar).
local function saltarSiGris(pv)
  if pv.hecho or pv.pegajoso or retomado(clave, pv.id) or indiceSaltado(clave, pv.id) then
    return false
  end
  local nivel = SNF.Dificultad and SNF.Dificultad.pasoGris(pv, guia)
  if not nivel then
    return false
  end
  marcarSaltado(pv, "gris", nivel)
  return true
end

---------------------------------------------------------------------------------------------------
-- Pasos que no se pueden hacer (12-nov).
---------------------------------------------------------------------------------------------------

-- En el juego, con capturas: «todavía me manda hacer misiones que no tengo». En la 26-28 de Vallefresno la guía mandaba
-- a cazar a Shadumbra, Ursangous y Garrafilada sin «La Caza de Vallefresno» entregada: el juego no daba esas misiones.
-- Un paso no se puede hacer si (con pasos.saltarNoDisponibles y el registro cargado: Misiones.noSePuedeCoger):
--   * tiene alguna misión (accept, turnin, complete o el collect de una misión) sin entregar y ninguna está en el diario;
--   * cada misión sin entregar o no se puede coger (le falta una previa) o, en un complete o turnin, no se tiene y el paso
--     no la acepta (sinMision);
--   * lo demás es informativo (nota, goto, target, unitscan...) o una condición de misión.
-- Un paso que solo es ir a un sitio («Corre hacia...») tampoco, si el siguiente que no es otro viaje ni pegajoso no se
-- puede hacer. El motor lo salta al llegar y va a «Pasos saltados» con motivo «no_disponible» (se puede retomar); la
-- ventana lo enseña en gris con el motivo y la navegación no le pone pines ni ruta.
local CONDICIONES = {
  isOnQuest = true, isNotOnQuest = true, isQuestComplete = true, isQuestNotComplete = true, isQuestTurnedIn = true,
  isQuestAvailable = true,
}
local DE_MISION = {accept = true, turnin = true, complete = true}

local function misionDeElemento(datos)
  if DE_MISION[datos.t] or (datos.t == "collect" and datos.q ~= nil) then
    return type(datos.q) == "number" and datos.q or nil
  end
  return nil
end

-- Previsión de la guía desde el paso actual: [i] = {q, previa?, viaje?} o false. Para los pasos que vienen cuenta lo que
-- los de en medio darán por el camino (`tendra`: las misiones que aceptarán y las que entregarán, si esos pasos se
-- pueden hacer): «Liberar a Ruul» se acepta un paso antes de hacerla, y no por no tenerla aún es «no disponible». Se
-- rehace al cambiar las misiones, los ajustes, la guía o el paso actual.
local prevision

local function olvidarNoDisponibles()
  prevision = nil
  olvidarEstado()
end

for _, evento in ipairs({"QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE", "SNF_GUIA_CARGADA",
  "SNF_AJUSTE_CAMBIADO", "SNF_PASOS_CAMBIADOS"}) do
  Eventos.escuchar(evento, olvidarNoDisponibles)
end

local function calcularNoDisponible(pv, tendra)
  local Misiones = SNF.Misiones
  local informativos = Elementos.INFORMATIVOS
  local motivo
  for _, e in ipairs(pv.elementos) do
    local datos = e.datos
    local q = misionDeElemento(datos)
    if q then
      if Misiones.enDiario(q) or tendra.diario[q] then
        return nil -- manda el juego (o la tendrá cuando llegue)
      end
      if not (Misiones.entregada(q) or tendra.entregadas[q]) then
        local no, previa = Misiones.noSePuedeCoger(q, tendra)
        if no then
          motivo = motivo or {q = q, previa = previa}
        elseif e.sinMision then
          motivo = motivo or {q = q}
        else
          return nil
        end
      end
    elseif not informativos[datos.t] and not CONDICIONES[datos.t] then
      return nil
    end
  end
  return motivo
end

-- Lo que un paso que sí se puede hacer dejará hecho: sus accept (de misiones que se pueden coger) y sus turnin (de las
-- que se tendrán).
local function anotarLoQueDa(pv, tendra)
  local Misiones = SNF.Misiones
  for _, e in ipairs(pv.elementos) do
    local d = e.datos
    if type(d.q) == "number" then
      if d.t == "accept" and not Misiones.noSePuedeCoger(d.q, tendra) then
        tendra.diario[d.q] = true
      elseif d.t == "turnin" and (Misiones.enDiario(d.q) or tendra.diario[d.q]) then
        tendra.diario[d.q] = nil
        tendra.entregadas[d.q] = true
      end
    end
  end
end

-- Paso de viaje: lleva algún goto, zone, subzone o fly y, aparte, solo informativos (notas, target...) o condiciones de
-- lugar (zoneskip, subzoneskip). T1: antes solo contaba goto.
local VIAJE = {["goto"] = true, zone = true, subzone = true, fly = true}
local CONDICION_DE_LUGAR = {zoneskip = true, subzoneskip = true}

local function soloViaje(pv)
  local alguno = false
  for _, e in ipairs(pv.elementos) do
    local t = e.datos.t
    if VIAJE[t] then
      alguno = true
    elseif not Elementos.INFORMATIVOS[t] and not CONDICION_DE_LUGAR[t] then
      return false
    end
  end
  return alguno
end

local adelantando = false -- T1: dentro de adelantar(), la previsión de antes vale (ver prever)

local function prever()
  -- T1: mientras se adelanta por pasos ya hechos, la previsión hecha desde un paso anterior sigue valiendo: lo que esos
  -- pasos dan ya está en el diario (o entregado) y los que se saltan no daban nada. Así no se rehace en cada paso.
  if prevision and prevision.pasos == pasos
      and (prevision.actual == actual or (adelantando and prevision.actual <= actual)) then
    return prevision
  end
  local p = {actual = actual, pasos = pasos}
  local tendra = {diario = {}, entregadas = {}}
  local desde = math.max(actual, 1)
  -- Los pegajosos de antes que siguen sin hacer también dan lo suyo por el camino (la misión que inicia el objeto de
  -- un raro, como «El elemento podrido» de Tideress).
  for i = 1, desde - 1 do
    local pv = pasos[i]
    if pv.pegajoso and not pv.hecho and not calcularNoDisponible(pv, tendra) then
      anotarLoQueDa(pv, tendra)
    end
  end
  for i = desde, #pasos do
    local pv = pasos[i]
    local nd = calcularNoDisponible(pv, tendra)
    if not pv.pegajoso then
      p[i] = nd or false
    end
    if not nd and not pv.saltado then
      anotarLoQueDa(pv, tendra)
    end
  end
  -- Los «Corre hacia…» que solo llevan a un paso que no se puede hacer.
  for i = desde, #pasos do
    if p[i] == false and soloViaje(pasos[i]) then
      local j = i + 1
      while pasos[j] and (pasos[j].pegajoso or soloViaje(pasos[j])) do
        j = j + 1
      end
      local siguiente = p[j]
      if siguiente then
        p[i] = {q = siguiente.q, previa = siguiente.previa, viaje = true}
      end
    end
  end
  prevision = p
  return p
end

function Motor.noDisponible(pv)
  if type(pv) ~= "table" or pv.pegajoso or pasos[pv.i] ~= pv or pv.i < actual or not SNF.Misiones.registroListo()
      or SNF.Ajustes.get("pasos.saltarNoDisponibles") == false then
    return nil
  end
  return prever()[pv.i] or nil
end

-- T4: un saltado por «no disponible» se vuelve a mirar al cargar la guía y cuando cambia el registro de misiones. ¿Ya
-- se puede hacer? Con previa (s.previa): si la misión ya se puede coger. Sin ella (no se tenía la misión y el paso no la
-- acepta, o una excluyente): si ya está en el diario.
local function yaDisponible(s)
  local Misiones = SNF.Misiones
  if type(s.q) ~= "number" or not Misiones.registroListo() then
    return false
  end
  if s.previa ~= nil then
    return Misiones.disponible(s.q) == true
  end
  return Misiones.enDiario(s.q)
end

-- Los saltados por no disponible de la guía cargada que ya se pueden hacer pasan solos a retomados (como «Retomar» en
-- el panel): vuelven a estar activos aunque queden atrás. Devuelve true si cambió alguno.
local function retomarDisponibles()
  local alguno = false
  for _, s in ipairs(SnetForeverPJ.saltados) do
    if s.clave == clave and s.motivo == "no_disponible" and s.id ~= nil and not retomado(clave, s.id)
        and yaDisponible(s) then
      tabla(SnetForeverPJ.retomados, clave)[s.id] = true
      local i = porId[s.id]
      if i then
        local pv = pasos[i]
        pv.saltado, pv.hecho, pv.activo = false, false, false
      end
      alguno = true
    end
  end
  if alguno then
    sucio = true
    olvidarNoDisponibles()
  end
  return alguno
end

local function mirarNoDisponibles()
  if not revisarNoDisponibles or not guia then
    return false
  end
  revisarNoDisponibles = false
  return retomarDisponibles()
end

for _, evento in ipairs({"QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE"}) do
  Eventos.escuchar(evento, function()
    revisarNoDisponibles = true
  end)
end

local function saltarSiNoDisponible(pv)
  if pv.hecho or pv.pegajoso or retomado(clave, pv.id) or indiceSaltado(clave, pv.id) then
    return false
  end
  local nd = Motor.noDisponible(pv)
  if not nd then
    return false
  end
  marcarSaltado(pv, "no_disponible", nil, nd)
  return true
end

---------------------------------------------------------------------------------------------------
-- Ver hacia delante qué está ya hecho (T1).
---------------------------------------------------------------------------------------------------

-- Como RestedXP: al cargar y en cada ciclo, el paso actual tiene que ser el primero con trabajo de verdad. Un paso que
-- aún no se ha activado se puede dar por hecho si todos sus elementos son puros o informativos (Elementos.esPuro):
-- evaluados sin evento y con la mem con la que se activaría (memNueva: marcas guardadas, sinMision, maestros), dan lo
-- mismo que al activarlo. Si alguno no lo es (un manual, un vendor solo, un fly...), no se sabe: cuenta como pendiente.
-- Un vendor (o trainer) que acompaña (e.sigue) es info si lo que sigue está hecho y, si no, pendiente.
local ADELANTE = {hecho = true, info = true}
local DE_MISION_REAL = {accept = true, turnin = true, complete = true, collect = true}

-- Ronda 1 (I1): ¿la misión del elemento está de verdad entregada o en el diario? Lo que da «hecho» sin eso (sinMision,
-- noSePuedeCoger, siFalta) es una misión que no se tiene ahora, pero quizá sí al llegar (se acepta antes).
local function misionDeVerdad(d)
  local q = DE_MISION_REAL[d.t] and type(d.q) == "number" and d.q
  return not q or SNF.Misiones.entregada(q) or SNF.Misiones.enDiario(q)
end

-- Evalúa los elementos del paso sin activarlo. true si todos quedan hechos o info (o alguno salta el paso). Con
-- `estricto`, un elemento de misión solo cuenta como hecho si la misión está entregada o en el diario (para la lista
-- de siguientes y lo que hay detrás de un viaje: lo que se mira desde lejos, con el diario de ahora).
local function evaluarAdelante(pv, estricto)
  if #pv.elementos == 0 then
    return true
  end
  local mems, resultados = {}, {}
  for k, e in ipairs(pv.elementos) do
    local mem = memNueva(pv, k, e)
    mems[k] = mem
    -- Ronda 1 (M1): dado por hecho a mano (la casilla, o un manual marcado), como al activarlo, sea puro o no.
    if mem.forzado or (e.datos.t == "manual" and mem.marcado) then
      resultados[k] = "hecho"
    elseif not e.sigue and not Elementos.esPuro(e.datos) then
      return false
    end
  end
  local salta = false
  for k, e in ipairs(pv.elementos) do
    if resultados[k] == nil and not e.sigue then
      local ok, r = pcall(Elementos.evaluar, e.datos, mems[k], nil)
      if not ok then
        return false -- el error lo dará al activarse
      end
      if r == "ir_a" or r == "ir_guia" then
        return false -- un salto lo atiende el ciclo con el paso activo
      end
      if estricto and (r == "hecho" or r == "saltar_paso") and not misionDeVerdad(e.datos) then
        return false
      end
      salta = salta or r == "saltar_paso"
      resultados[k] = r
    end
  end
  for k, e in ipairs(pv.elementos) do
    if resultados[k] == nil then
      local r = "info"
      for _, j in ipairs(e.sigue) do
        if resultados[j] ~= "hecho" then
          r = "pendiente"
        end
      end
      resultados[k] = r
    end
  end
  if salta then
    return true
  end
  for k = 1, #pv.elementos do
    if not ADELANTE[resultados[k]] then
      return false
    end
  end
  return true
end

local function yaHecho(pv, estricto)
  if pv.pegajoso or pv.saltado or esperaDe(pv) ~= nil then
    return false
  end
  return evaluarAdelante(pv, estricto)
end

-- ¿Al paso (que aún no ha llegado) no le queda trabajo? Ya hecho (con el diario de ahora: ronda 1, I1), saltado, o que
-- se saltaría al llegar (no se puede hacer o es gris, según la previsión, que cuenta lo que darán los pasos de antes).
local function sinTrabajo(pv)
  if pv.hecho or pv.saltado or yaHecho(pv, true) then
    return true
  end
  if retomado(clave, pv.id) then
    return false
  end
  if Motor.noDisponible(pv) then
    return true
  end
  return SNF.Dificultad ~= nil and SNF.Dificultad.pasoGris(pv, guia) ~= nil
end

-- Un paso de viaje (soloViaje, no pegajoso) sobra si todos los pasos que tiene detrás, hasta el siguiente paso de viaje,
-- ya están hechos: no hace falta ir. Los viajes que siguen justo detrás son el mismo camino. Sin ningún paso detrás (el
-- final de la guía), no sobra. Si alguno tiene trabajo, el viaje sigue mandando, como antes.
-- Ronda 1 (C1): un pegajoso del bloque sin hacer también es trabajo (se hace allí), salvo que se cierre dentro del propio
-- bloque: #completewith next o la etiqueta de un paso del bloque (como en RestedXP, se da por cerrado al pasar).
-- Un viaje de solo goto sin objetivo y notas (M4) ya es info al activarse: lo pasa yaHecho, haya lo que haya detrás; en
-- los datos no hay ninguno que no sea pegajoso.
local function cierraEnBloque(q, desde, hasta)
  local cw = q.completaCon
  if cw == "next" then
    return true
  end
  local j = cw ~= nil and porEtiqueta[cw]
  return j ~= nil and j ~= false and j ~= q.i and j >= desde and j <= hasta
end

local function viajeSobra(pv)
  -- En una ruta de la IA (tipo «ia») cada parada es un destino elegido, también las de lugar: no se pasan de largo.
  if pv.pegajoso or pv.saltado or (guia and guia.tipo == "ia") or not soloViaje(pv) or esperaDe(pv) ~= nil then
    return false
  end
  local j = pv.i + 1
  while pasos[j] and soloViaje(pasos[j]) do
    j = j + 1
  end
  local desde = j
  while pasos[j] and not soloViaje(pasos[j]) do
    j = j + 1
  end
  local hasta = j - 1
  local alguno = false
  for k = desde, hasta do
    local q = pasos[k]
    if q.pegajoso then
      if not q.hecho and not cierraEnBloque(q, desde, hasta)
          and not (esperaDe(q) == nil and evaluarAdelante(q, true)) then
        return false
      end
    else
      if not sinTrabajo(q) then
        return false
      end
      alguno = true
    end
  end
  return alguno
end

-- ¿El paso, aún sin activar, se puede pasar de largo completándolo? Con `estricto`, con el diario de ahora (I1).
local function sobra(pv, estricto)
  return yaHecho(pv, estricto) or viajeSobra(pv)
end

-- Desde el paso actual, sin activarlo, pasa en este mismo ciclo por todos los que no tienen trabajo: los que no se pueden
-- hacer y los grises (a saltados con su motivo, como siempre: van antes porque sus misiones «hechas» son en realidad
-- misiones que no se tienen) y los ya hechos y los viajes que sobran (se completan: no van a saltados). Con `soloHechos`
-- (al cargar) solo los ya hechos y los viajes: ante uno que no se puede hacer o gris se para (eso lo sigue haciendo el
-- ciclo, como antes) y no pasa del último paso (no acaba la guía ni carga otra). Se para en el primero con trabajo.
-- Devuelve true si pasó a otra guía (Motor.cargar ya avisó).
-- ¿Queda algún paso no pegajoso después del i? (si no, completar el i acaba la guía)
local function quedaOtro(i)
  for j = i + 1, #pasos do
    if not pasos[j].pegajoso then
      return true
    end
  end
  return false
end

-- Ronda 1 (I2): ¿el actual es un viaje activo que ya sobra?
local function viajeActualSobra()
  local pv = not fin and pasos[actual]
  return pv and pv.activo and not pv.espera and viajeSobra(pv) or false
end

local function adelantar(soloHechos)
  local antes = adelantando
  adelantando = true
  local otra = false
  while not fin do
    local pv = pasos[actual]
    if not pv or (soloHechos and not quedaOtro(actual)) then
      break
    end
    local pasa = true
    if pv.saltado then
      completar(pv)
    elseif soloHechos then
      if not sobra(pv) or Motor.noDisponible(pv)
          or (SNF.Dificultad and not retomado(clave, pv.id) and SNF.Dificultad.pasoGris(pv, guia)) then
        pasa = false
      else
        completar(pv)
      end
    elseif saltarSiNoDisponible(pv) or saltarSiGris(pv) then
      -- A saltados, con su motivo. Ronda 1 (M2): lo que ese paso iba a dar ya no cuenta en la previsión.
      prevision = nil
    elseif sobra(pv) then
      completar(pv)
    else
      pasa = false
    end
    if not pasa then
      break
    end
    if avanzarA(actual + 1) then
      otra = true
      break
    end
  end
  adelantando = antes
  return otra
end

function Motor.actualizar()
  if not guia then
    return
  end
  Motor.ciclos = Motor.ciclos + 1
  pedido = false
  olvidarEstado()
  mirarNoDisponibles()
  local cambio = sucio
  -- Saltos de los elementos: ir_guia carga otra guía; ir_a fija el actual en el paso de la etiqueta.
  local tipo, destino = buscarSalto()
  if tipo == "guia" then
    Motor.cargar(destino)
    return
  elseif tipo == "paso" then
    colocar(destino)
    cambio = true
  elseif retenido ~= nil and retenido == actual and not fin then
    -- T4: el paso elegido hacia atrás se queda, hecho o no, hasta que el jugador lo suelte (no se completa, ni se
    -- salta por gris o no disponible).
  elseif not fin then
    -- El actual; uno que espera no avanza. T1: tras él, en el mismo ciclo, los que ya están hechos (adelantar).
    local pv = pasos[actual]
    if pv == nil then
      local antes = actual
      if avanzarA(actual + 1) then
        return
      end
      cambio = cambio or fin or actual ~= antes
    elseif saltarSiNoDisponible(pv) or (not (not pv.espera and completo(pv)) and saltarSiGris(pv)) then
      -- Lote D (D2) y 12-nov: los pasos grises o que no se pueden hacer seguidos se saltan en el mismo ciclo (no hay
      -- nada que evaluar en ellos). T1: y también los ya hechos (adelantar).
      if avanzarA(actual + 1) or adelantar() then
        return
      end
      cambio = true
    elseif not pv.espera and (completo(pv) or viajeSobra(pv)) then
      -- T1: un viaje cuyo destino ya no tiene nada que hacer también se completa; y luego, en el mismo ciclo, todos
      -- los ya hechos que vienen detrás.
      completar(pv)
      if avanzarA(actual + 1) or adelantar() then
        return
      end
      cambio = true
    end
  end
  -- Pegajosos y retomados anteriores.
  for i = 1, tope() do
    local pv = pasos[i]
    if pv and not pv.hecho then
      if pv.pegajoso then
        if (pv.activo and completo(pv)) or completadoPorEtiqueta(pv) then
          completar(pv)
          cambio = true
        end
      elseif pv.activo and retomado(clave, pv.id) and completo(pv) then
        completar(pv)
        cambio = true
      end
    end
  end
  if calcularActivos() or cambio then
    avisar()
  end
end

local function arrancar()
  if temporizador then
    return
  end
  if parado then
    -- Fuera del mundo no corre: Motor.reanudar() lo pone al volver.
    pendiente = true
    return
  end
  temporizador = C_Timer.NewTicker(PERIODO, function()
    if not guia then
      return
    end
    -- T4: con el registro cambiado, los saltados por no disponible que ya se pueden hacer vuelven (y piden un ciclo).
    if mirarNoDisponibles() then
      pedido = true
    end
    -- El ciclo va antes del repaso, para no pisar el resultado de un evento antes de que el ciclo lo vea.
    if pedido then
      Motor.actualizar()
    end
    tics = tics + 1
    if tics >= CICLOS_POR_REPASO then
      tics = 0
      repasar()
      -- Ronda 1 (I2): un viaje actual solo escucha sus eventos de lugar; si lo de detrás ya está hecho (se consiguió el
      -- objeto, se entregó la misión...), un ciclo lo pasa sin esperar a cambiar de zona.
      if not pedido and viajeActualSobra() then
        pedido = true
      end
    end
  end)
end

-- PLAYER_LEAVING_WORLD (arranque.lua): quita el temporizador y no deja ponerlo hasta Motor.reanudar(). Los eventos
-- siguen apuntando lo que cambia y pidiendo ciclo; el ciclo pendiente se hace al volver.
function Motor.parar()
  parado = true
  if temporizador then
    temporizador:Cancel()
    temporizador = nil
    pendiente = true
  end
end

-- PLAYER_ENTERING_WORLD tras un Motor.parar(): vuelve a poner el temporizador si lo había (o se pidió).
function Motor.reanudar()
  parado = false
  if pendiente then
    pendiente = false
    arrancar()
  end
end

---------------------------------------------------------------------------------------------------
-- Interfaz.
---------------------------------------------------------------------------------------------------

function Motor.cargar(c, opciones)
  local g = Datos.guia(c)
  if not g then
    return false
  end
  SNF.Guardado.preparar()
  guia, clave = g, g.clave
  construir()
  -- T4: al cargar, los saltados por no disponible que ya se pueden hacer se retoman (colocar ya los ve así).
  revisarNoDisponibles = false
  retomarDisponibles()
  local inicio
  if opciones and opciones.n then
    inicio = primeroConN(opciones.n) or #pasos
  else
    local p = progreso()
    local i = p.id ~= nil and porId[p.id]
    if i then
      inicio = p.pasado and i + 1 or i
    elseif p.n ~= nil then
      inicio = (p.pasado and primeroConN(p.n + 1)) or primeroConN(p.n) or #pasos
    else
      inicio = 1
    end
  end
  colocar(inicio)
  -- T1: el actual pasa a ser el primero con trabajo (también con el progreso guardado). Al cargar no se acaba la guía:
  -- con todo hecho se queda en el último paso y el primer ciclo la acaba (o pasa a la siguiente), como antes.
  adelantar(true)
  olvidarEstado()
  arrancar()
  -- Activos y eventos al día antes de avisar: quien escuche SNF_GUIA_CARGADA ya ve la guía nueva.
  calcularActivos()
  sincronizarEventos()
  sucio = false
  pedido = true
  Eventos.emitir("SNF_GUIA_CARGADA", clave)
  Eventos.emitir("SNF_PASOS_CAMBIADOS")
  return true
end

function Motor.recargar()
  if not guia then
    return
  end
  local pv = pasos[actual]
  local id, n = pv and pv.id, pv and pv.n
  local idRetenido = retenido ~= nil and retenido == actual and pv and pv.id or nil
  local acabada = fin
  local pasado = fin or (#pasos > 0 and actual > #pasos)
  local previos = {}
  for _, viejo in ipairs(pasos) do
    if viejo.activo then
      previos[viejo.id] = viejo
    end
  end
  guia = Datos.guia(clave) or guia
  construir()
  local inicio
  if pasado then
    inicio = #pasos + 1
  else
    inicio = (id ~= nil and porId[id]) or (n ~= nil and (primeroConN(n) or #pasos)) or 1
  end
  colocar(inicio)
  if acabada then
    -- Una guía acabada sigue acabada (sin un segundo aviso en el ciclo siguiente).
    fin, actual = true, #pasos
  elseif idRetenido ~= nil and porId[idRetenido] == actual then
    retenido = actual -- T4: el paso retenido sigue retenido con el nivel nuevo
  end
  conservar = previos
  calcularActivos()
  conservar = nil
  avisar()
end

function Motor.estado()
  local siguientes = {}
  if guia and not fin then
    local desde = math.max(actual, activos[#activos] or 0) + 1
    local g = guardadoSiguientes
    if g and g.version == versionEstado and g.pasos == pasos and g.desde == desde then
      for k, i in ipairs(g.lista) do
        siguientes[k] = i
      end
      desde = #pasos + 1 -- ya está
    else
      guardadoSiguientes = {version = versionEstado, pasos = pasos, desde = desde, lista = siguientes}
    end
    for i = desde, #pasos do
      if #siguientes >= MAX_SIGUIENTES then
        break
      end
      local pv = pasos[i]
      -- T1: los que ya están hechos (o un viaje que sobra) no se enseñan: se pasarán de largo al llegar. Ronda 1 (I1): con
      -- el diario de ahora; lo que se hará con una misión que se acepta antes, o lo que no se puede hacer, sí sale.
      -- Ronda 1 (I3): como mucho MAX_MIRAR pasos se miran así; los de más allá salen como antes (al llegar se pasan).
      if not pv.hecho and #pv.elementos > 0 and (i - desde >= MAX_MIRAR or not sobra(pv, true)) then
        siguientes[#siguientes + 1] = i
      end
    end
  end
  local copia = {}
  for k, i in ipairs(activos) do
    copia[k] = i
  end
  if guardadoSiguientes and guardadoSiguientes.lista == siguientes then
    -- lo guardado es una copia: quien llama puede cambiar la suya
    local propia = {}
    for k, i in ipairs(siguientes) do
      propia[k] = i
    end
    siguientes = propia
  end
  return {clave = clave, actual = actual, activos = copia, siguientes = siguientes, fin = fin, sinGuia = guia == nil}
end

function Motor.activos()
  return activos
end

function Motor.paso(i)
  return pasos[i]
end

-- Lote C (revisión 52, Minor 8, y ronda 1): el número que ve el jugador es pv.numero, la posición del paso entre los que
-- salen en la lista de la ventana para ese personaje (1, 2, 3…; sin los de otra raza o clase ni los optional o
-- hidewindow), no el `n` de los datos. Un paso que no sale en la lista no tiene número (nil). Motor.numero(c, id) lo da
-- para un paso de la guía cargada (nil si `c` no es la cargada, el paso no está o no tiene número); el progreso sigue
-- en los ids.
function Motor.numero(c, id)
  if not guia or c ~= clave or id == nil then
    return nil
  end
  local i = porId[id]
  return i and pasos[i] and pasos[i].numero or nil
end

-- T3: el paso guardado de la guía `c` sin cargarla: su número en la lista de la ventana (como pv.numero) y si se guardó
-- acabada (pasado el último paso). Se busca como al cargarla (por id, si no por n y si no el primero) y, si ese paso no
-- sale en la lista, vale el siguiente que sale. Con la guía cargada, el paso actual. nil si no hay número.
function Motor.numeroGuardado(c)
  if guia and c == clave then
    local pv = not fin and pasos[actual]
    return pv and pv.numero or nil, fin == true
  end
  local g = Datos.guia(c)
  local p = type(SnetForeverPJ.progreso) == "table" and SnetForeverPJ.progreso[c]
  p = type(p) == "table" and p or {}
  if not g then
    return nil, false
  elseif p.pasado then
    return nil, true
  end
  local personaje = pj()
  local lista, numero = {}, 0
  for _, datos in ipairs(g.pasos or {}) do
    if pasoVisible(datos, g, personaje) then
      local elementos = {}
      for _, el in ipairs(datos.elementos or {}) do
        if Filtros.evaluar(el.filtro, personaje) then
          elementos[#elementos + 1] = el
        end
      end
      local suyo
      if Motor.enLista({datos = datos, elementos = elementos}, personaje) then
        numero = numero + 1
        suyo = numero
      end
      lista[#lista + 1] = {id = idDe(datos, #lista + 1), n = tonumber(datos.n), numero = suyo}
    end
  end
  local inicio
  for i, e in ipairs(lista) do
    if p.id ~= nil and e.id == p.id then
      inicio = i
      break
    end
  end
  -- Ronda 1 (Menor 3): como Motor.cargar, un n sin ningún paso igual o mayor va al último.
  if not inicio and tonumber(p.n) then
    for i, e in ipairs(lista) do
      if e.n and e.n >= tonumber(p.n) then
        inicio = i
        break
      end
    end
    inicio = inicio or #lista
  end
  for i = inicio or 1, #lista do
    if lista[i].numero then
      return lista[i].numero, false
    end
  end
  return nil, false
end

-- Texto corto del paso para la lista de saltados: por defecto, el t del primer elemento (ui/texto.lua lo reemplaza).
function Motor.resumir(pv)
  local e = pv.elementos[1]
  return e and e.datos.t or ""
end

function Motor.saltar(i)
  local pv = guia and pasos[i]
  if not pv then
    return
  end
  retenido = nil -- T4: saltar un paso también suelta el retenido
  marcarSaltado(pv)
  if i == actual and not fin and avanzarA(actual + 1) then
    return
  end
  cambiado()
end

function Motor.retomar(c, id)
  SNF.Guardado.preparar()
  if not indiceSaltado(c, id) then
    return false
  end
  tabla(SnetForeverPJ.retomados, c)[id] = true
  local i = guia and c == clave and porId[id]
  if i then
    local pv = pasos[i]
    pv.saltado, pv.hecho, pv.activo = false, false, false
    cambiado()
  end
  return true
end

function Motor.quitarSaltado(c, id)
  SNF.Guardado.preparar()
  olvidarSaltado(c, id)
  local i = guia and c == clave and porId[id]
  if i then
    local pv = pasos[i]
    pv.saltado = false
    if pv.pegajoso then
      pv.hecho = progreso().pegajosos[pv.id] == true
    else
      -- Un paso ya pasado sigue contando como hecho; uno de más adelante se hará al llegar a él.
      pv.hecho = i < actual or fin
    end
    cambiado()
  end
end

function Motor.marcarManual(i, k, valor)
  local pv = guia and pasos[i]
  local e = pv and pv.elementos[k]
  if not e then
    return
  end
  retenido = nil -- T4: marcar algo suelta el paso retenido
  local marcas = progreso().manuales
  if valor then
    e.mem.marcado = true
    tabla(marcas, pv.id)[k] = true
  else
    e.mem.marcado = nil
    if type(marcas[pv.id]) == "table" then
      marcas[pv.id][k] = nil
      if next(marcas[pv.id]) == nil then
        marcas[pv.id] = nil
      end
    end
  end
  evaluar(pv, k, nil)
  cambiado()
end

-- Olvida las marcas a mano de la guía c (F3-23: la ventana lo llama al elegir esa guía a mano en el selector, que es
-- empezar de cero).
function Motor.olvidarMarcas(c)
  SNF.Guardado.preparar()
  limpiarMarcas(c)
end

-- La casilla de una línea de la ventana (tarea D3, como RestedXP): da el elemento k del paso i por hecho a mano (valor
-- nil o true) o le quita esa marca (false). En un manual es marcarManual. Si no, mem.forzado y
-- progreso.forzados[id][k], que se guardan por personaje como lo saltado y vuelven al activar el paso; evaluar() da
-- el elemento por hecho mientras dure la marca. El paso no va a saltados: si queda completo, el ciclo lo avanza.
function Motor.marcarHecho(i, k, valor)
  local pv = guia and pasos[i]
  local e = pv and pv.elementos[k]
  if not e then
    return
  end
  if valor == nil then
    valor = true
  end
  if e.datos.t == "manual" then
    Motor.marcarManual(i, k, valor)
    return
  end
  e.mem = e.mem or {}
  retenido = nil -- T4: marcar algo suelta el paso retenido
  local forzados = progreso().forzados
  if valor then
    e.mem.forzado = true
    tabla(forzados, pv.id)[k] = true
  else
    e.mem.forzado = nil
    if type(forzados[pv.id]) == "table" then
      forzados[pv.id][k] = nil
      if next(forzados[pv.id]) == nil then
        forzados[pv.id] = nil
      end
    end
  end
  evaluar(pv, k, nil)
  cambiado()
end

-- La navegación (mapa/navegacion.lua) llama aquí cuando el jugador llega a un goto objetivo. El cambio de resultado
-- pide un ciclo, que avanza el paso si ya está completo.
function Motor.marcarLlegado(i, k)
  local pv = guia and pasos[i]
  local e = pv and pv.elementos[k]
  if not e then
    return
  end
  e.mem = e.mem or {}
  e.mem.llegado = true
  tabla(progreso().llegados, pv.id)[k] = true
  evaluar(pv, k, nil)
end

-- La navegación marca así un punto de flecha alcanzado (true) o lo vuelve a poner en juego al reiniciar un #loop
-- (false): mem.alcanzado y progreso.alcanzados[id][k] (como RXPCData.completedWaypoints, plano 3 §2.5). No cambia
-- el resultado del elemento.
function Motor.marcarAlcanzado(i, k, valor)
  local pv = guia and pasos[i]
  local e = pv and pv.elementos[k]
  if not e then
    return
  end
  e.mem = e.mem or {}
  local alcanzados = progreso().alcanzados
  if valor then
    e.mem.alcanzado = true
    tabla(alcanzados, pv.id)[k] = true
  else
    e.mem.alcanzado = false
    if type(alcanzados[pv.id]) == "table" then
      alcanzados[pv.id][k] = nil
      if next(alcanzados[pv.id]) == nil then
        alcanzados[pv.id] = nil
      end
    end
  end
end

-- T4: el destino de Motor.irA(i) como índice válido (1..#pasos), o nil sin guía.
local function destinoIrA(i)
  if not guia or #pasos == 0 then
    return nil
  end
  return math.max(1, math.min(math.floor(tonumber(i) or 1), #pasos))
end

-- T4: los pasos que Motor.irA(i) hacia delante deja en «Pasos saltados»: los de en medio (el actual incluido) que salen
-- en la lista y no están hechos. Cada uno con su motivo: no_disponible o gris si el ciclo los iba a saltar igual, ir_a
-- si no. No van: los pegajosos (siguen activos como anteriores), los que ya están saltados o retomados, los que no
-- salen en la lista (sin número: optional, hidewindow, sin elementos), los ya hechos y los viajes que sobran.
local function saltosHasta(i)
  local lista = {}
  local d = destinoIrA(i)
  if not d or fin or d <= actual then
    return lista
  end
  for j = math.max(actual, 1), d - 1 do
    local pv = pasos[j]
    if not pv.pegajoso and not pv.hecho and not pv.saltado and pv.numero ~= nil and not retomado(clave, pv.id)
        and not indiceSaltado(clave, pv.id) then
      local nd = Motor.noDisponible(pv)
      local nivel = not nd and SNF.Dificultad and SNF.Dificultad.pasoGris(pv, guia)
      if nd then
        lista[#lista + 1] = {i = j, motivo = "no_disponible", nd = nd}
      elseif nivel then
        lista[#lista + 1] = {i = j, motivo = "gris", nivel = nivel}
      else
        local hecho
        if pv.activo then
          hecho = completo(pv)
        else
          hecho = yaHecho(pv, true) or viajeSobra(pv)
        end
        if not hecho then
          lista[#lista + 1] = {i = j, motivo = "ir_a"}
        end
      end
    end
  end
  return lista
end

-- T4: los índices de los pasos que Motor.irA(i) dejaría en «Pasos saltados» (la ventana lo avisa antes de ir).
function Motor.saltosDeIrA(i)
  local indices = {}
  for k, s in ipairs(saltosHasta(i)) do
    indices[k] = s.i
  end
  return indices
end

-- Pone el actual en el paso i, como al cargar en él: los anteriores cuentan como hechos y los posteriores no (salvo los
-- saltados). T4:
--   * hacia delante, los de en medio sin hacer van a «Pasos saltados» (saltosHasta; motivo ir_a), retomables;
--   * hacia atrás, los ir_a de ese paso en adelante vuelven al camino (dejan de ser saltos) y el paso queda retenido
--     (ver `retenido`);
--   * el paso elegido, si estaba saltado, se retoma.
-- No toca las marcas a mano (forzados ni manuales).
function Motor.irA(i)
  local d = destinoIrA(i)
  if not d then
    return
  end
  local atras = fin or d < actual
  if not atras then
    for _, s in ipairs(saltosHasta(d)) do
      marcarSaltado(pasos[s.i], s.motivo, s.nivel, s.nd)
    end
  else
    local saltados = SnetForeverPJ.saltados
    for k = #saltados, 1, -1 do
      local s = saltados[k]
      local j = s.clave == clave and s.motivo == "ir_a" and porId[s.id]
      if j and j >= d then
        olvidarSaltado(clave, s.id)
      end
    end
  end
  local pv = pasos[d]
  if indiceSaltado(clave, pv.id) then
    tabla(SnetForeverPJ.retomados, clave)[pv.id] = true
  end
  colocar(d)
  -- Ronda 1 (I3): solo se retiene el paso elegido. Un pegajoso no (colocar pasa de largo y el actual cae en otro paso, o
  -- en #pasos + 1 si la guía acaba en pegajosos: un retenido sin paso pararía la guía sin que se viera nada).
  if atras and not fin and actual == d and pasos[actual] then
    retenido = actual
  end
  cambiado()
end

-- T4: el paso retenido (índice) y si ya está completo; nada si no hay ninguno.
function Motor.retenido()
  local pv = retenido ~= nil and retenido == actual and not fin and pasos[retenido]
  if not pv then
    return nil
  end
  return retenido, completo(pv)
end

-- T4: «Seguir»: suelta el paso retenido y hace un ciclo; si ya está hecho, el adelanto de T1 lleva al primer paso que de
-- verdad falta.
function Motor.seguir()
  if retenido == nil then
    return
  end
  retenido = nil
  pedido = true
  Motor.actualizar()
end

-- Lote D (D2): al cambiar «Saltar misiones grises» o su margen, un ciclo vuelve a mirar el paso actual.
-- Lote C (revisión 52, Minor 4): «Saltar pasos por nivel» decide qué pasos tiene la guía (los de #maxlevel): se rehace
-- al momento con Motor.recargar(), que conserva el paso actual.
Eventos.escuchar("SNF_AJUSTE_CAMBIADO", function(c)
  if c == "pasos.saltarGrises" or c == "pasos.margenVerdes" or c == "pasos.saltarNoDisponibles" then
    pedido = true
  elseif c == "pasos.saltarPorNivel" then
    Motor.recargar()
    pedido = true
  elseif c == "guias.xp" and guia then
    if SNF.Guias.existe(clave, pj()) then
      Motor.recargar()
    else
      SNF.Guias.volverPorDefecto()
    end
  end
end)
