-- SnetForever: evaluadores de los elementos de nivel, dinero, objetos y lugar (plano 2 §4-§7 y §10). Solo leen
-- el estado del jugador (UnitLevel, GetMoney, GetItemCount, GetZoneText...) y de las misiones (SNF.Misiones);
-- no compran, destruyen, depositan, equipan ni mueven nada por el jugador.
-- T1: son puros (Elementos.esPuro) todos salvo bankwithdraw, que se completa al abrir y cerrar el banco.
--
-- Regla común de las condiciones (campo `efecto` de los datos de la fase 1):
--   "objetivo"               hecho cuando la condición se cumple; si no, pendiente.
--   "saltar_si_alcanzado"    saltar_paso cuando se cumple; si no, info.
--   "saltar_si_no_alcanzado" saltar_paso cuando no se cumple; si no, info.
-- `invertir = true` niega la condición antes de aplicar el efecto. Con `etiqueta`, en vez de saltar_paso se da
-- «ir_a, etiqueta» (el motor de pasos decide si la etiqueta existe).
--
-- Cada `def` declara en `campos` solo los campos que TODO elemento real trae (los que prueba el contrato con los
-- datos de la fase 1) y en `opcionales` los que lee si están.
local _, SNF = ...
local API = SNF.API -- compatibilidad con el cliente (nucleo/espacio.lua)
local Elementos = SNF.Elementos
local Misiones = SNF.Misiones

local EV_NIVEL = {"PLAYER_XP_UPDATE", "PLAYER_LEVEL_UP"}
local EV_OBJETOS = {"BAG_UPDATE_DELAYED", "QUEST_LOG_UPDATE"}
local EV_LUGAR = {"ZONE_CHANGED", "ZONE_CHANGED_INDOORS", "ZONE_CHANGED_NEW_AREA"}

-- Último hueco de equipo de Classic (INVSLOT_LAST_EQUIPPED): 19 es el tabardo.
local HUECO_ULTIMO = 19

local TUBO_DE_BRONCE = 4371 -- .bronzetube: el tubo que hace falta
local MISION_DEL_TUBO = 174 -- si ya está entregada, no hace falta ninguno

local function hechoPendiente(cumplido)
  return cumplido and "hecho" or "pendiente"
end

-- «Salta el paso»: saltar_paso, o ir_a con la etiqueta si el elemento la trae.
local function saltar(el)
  if el.etiqueta then
    return "ir_a", el.etiqueta
  end
  return "saltar_paso"
end

-- Aplica la regla común a una condición ya calculada.
local function conEfecto(el, cumple)
  if el.invertir then
    cumple = not cumple
  end
  local efecto = el.efecto
  if efecto == "objetivo" then
    return hechoPendiente(cumple)
  end
  if efecto == "saltar_si_alcanzado" then
    if cumple then
      return saltar(el)
    end
    return "info"
  end
  if efecto == "saltar_si_no_alcanzado" then
    if not cumple then
      return saltar(el)
    end
    return "info"
  end
  return "info"
end

-- Lote A, ronda 1 (Minor 3 de la revisión del lote A): lo que da un evaluador que no puede medir (falta la API, el
-- cliente aún no da el nombre del área, una profesión o facción que no conoce, auras secretas). Un objetivo (sin efecto o
-- con efecto «objetivo») queda pendiente, con su casilla para marcarlo a mano: si diera «info», un paso que solo lo
-- tuviera a él se completaría solo, y el conversor (bloqueo.js) lo cuenta como bloqueante. Una condición informa.
local function sinMedir(el)
  if el.efecto == nil or el.efecto == "objetivo" then
    return "pendiente"
  end
  return "info"
end

-- La regla común la reutilizan los demás archivos de elementos (motor/elementos-servicios.lua).
Elementos.sinMedir = sinMedir
Elementos.hechoPendiente = hechoPendiente
Elementos.saltar = saltar
Elementos.conEfecto = conEfecto

-- Ajuste «saltar pasos por nivel» (enableXpStepSkipping de RestedXP, activado por defecto): sin valor guardado,
-- activado. La ventana de ajustes (tarea 20) lo ofrece con la clave pasos.saltarPorNivel.
local function saltarPorNivel()
  local valor = SNF.Ajustes and SNF.Ajustes.get("pasos.saltarPorNivel")
  return valor ~= false
end

---------------------------------------------------------------------------------------------------
-- Nivel y experiencia (plano 2 §6)
---------------------------------------------------------------------------------------------------

-- Nivel actual. PLAYER_LEVEL_UP llega antes de que UnitLevel dé el nivel nuevo (ver nucleo/personaje.lua): manda
-- el del argumento del evento.
local function nivelActual(evento, nuevoNivel)
  if evento == "PLAYER_LEVEL_UP" and nuevoNivel then
    return nuevoNivel
  end
  return UnitLevel("player")
end

-- Plano 2 §6 «.xp [<]N[±xp | .fracción][,s[,etiqueta]]» (functions.lua:3315-3437). «Llegué» es nivel > N, o
-- nivel == N con xp ≥ el objetivo (`xp`, `fraccion` · UnitXPMax, o 0); con `faltan` (sufijo negativo), nivel ≥ N, o
-- nivel N-1 con xp ≥ máx − faltan. El efecto lo fija la fase 1: objetivo (sin s), saltar_si_alcanzado o
-- saltar_si_no_alcanzado (con s); `invertir` es el `<` de un objetivo. `segunAjuste`: condición de salto que solo
-- se evalúa con «saltar pasos por nivel» (functions.lua:3370-3375); sin él, informativa.
-- Con PLAYER_LEVEL_UP, UnitXP aún da la xp del nivel anterior: en el nivel nuevo se da por 0.
Elementos.registrar("xp", {
  puro = true,
  campos = {"nivel", "efecto"},
  opcionales = {"xp", "fraccion", "faltan", "invertir", "etiqueta", "segunAjuste"},
  eventos = EV_NIVEL,
  evaluar = function(el, _, evento, nuevoNivel)
    if el.segunAjuste and not saltarPorNivel() then
      return "info"
    end
    local nivel = nivelActual(evento, nuevoNivel)
    local n = el.nivel
    local cumple
    if el.faltan then
      local xp = (evento == "PLAYER_LEVEL_UP") and 0 or UnitXP("player")
      cumple = nivel >= n or (nivel == n - 1 and xp >= UnitXPMax("player") - el.faltan)
    elseif nivel ~= n then
      cumple = nivel > n
    else
      local xp = (evento == "PLAYER_LEVEL_UP") and 0 or UnitXP("player")
      local pedido = el.xp or (el.fraccion and el.fraccion * UnitXPMax("player")) or 0
      cumple = xp >= pedido
    end
    return conEfecto(el, cumple)
  end,
})

-- Plano 2 §6 «.maxlevel N[,etiqueta]» (functions.lua:5957-6024): salta el paso (o va a la etiqueta) si nivel > N y
-- está activado «saltar pasos por nivel».
Elementos.registrar("maxlevel", {
  puro = true,
  campos = {"nivel"},
  opcionales = {"etiqueta"},
  eventos = EV_NIVEL,
  evaluar = function(el, _, evento, nuevoNivel)
    if saltarPorNivel() and nivelActual(evento, nuevoNivel) > el.nivel then
      return saltar(el)
    end
    return "info"
  end,
})

---------------------------------------------------------------------------------------------------
-- Dinero (plano 2 §6)
---------------------------------------------------------------------------------------------------

-- Plano 2 §6 «.money <X|>X[,1]» (functions.lua:3812-3852): la condición es «dinero ≥ X» y la fase 1 ya puso el
-- efecto según el prefijo (`<` = saltar_si_no_alcanzado, `>` = saltar_si_alcanzado). `total` (patrimonio con el
-- valor de las bolsas) se ignora: solo se compara con GetMoney(), sin inventario.
Elementos.registrar("money", {
  puro = true,
  campos = {"cobre", "efecto"},
  opcionales = {"total"},
  eventos = {"PLAYER_MONEY"},
  evaluar = function(el)
    return conEfecto(el, GetMoney() >= el.cobre)
  end,
})

---------------------------------------------------------------------------------------------------
-- Objetos (plano 2 §7)
---------------------------------------------------------------------------------------------------

-- Cuántos lleva del objeto `id`: GetItemCount y, si da 0, el objeto equipado cuenta 1 (functions.lua:3092-3108 y
-- 6164-6243). No se mira el juguete (PlayerHasToy es de Retail).
local function cuenta(id, banco)
  local n = API.cuentaObjeto(id, banco)
  if n == 0 then
    for hueco = 1, HUECO_ULTIMO do
      if GetInventoryItemID("player", hueco) == id then
        return 1
      end
    end
  end
  return n
end

-- Suma de cuenta() de una lista de objetos. Con `sinEquipo`, es la suma de GetItemCount a secas.
local function contar(ids, banco, sinEquipo)
  local total = 0
  for i = 1, #ids do
    if sinEquipo then
      total = total + API.cuentaObjeto(ids[i], banco)
    else
      total = total + cuenta(ids[i], banco)
    end
  end
  return total
end

-- Los objetos de un elemento: `is` si hay varios, si no `i`.
local function objetosDe(el)
  return el.is or {el.i}
end

-- Objetivos de la misión que marca la máscara (bit k = objetivo k+1, hasta 8). Con aritmética, no con `bit`.
local function indicesDeMascara(mascara)
  local indices = {}
  for k = 1, 8 do
    if math.floor(mascara / 2 ^ (k - 1)) % 2 == 1 then
      indices[#indices + 1] = k
    end
  end
  return indices
end

-- Lo que pide el collect tras las reducciones de la ficha (functions.lua:3125-3182). Todas valen solo con misión
-- y máscara ≠ 0 (con máscara 0 la rama solo apunta el objeto como activo):
--   profesion  pide n − max(0, nivel − profesionInicio) · multiplicador, con el nivel de SNF.Profesiones.nivel (de la
--              tarea 8; sin él o sin la profesión, no se reduce); con «item», n − cuenta(profesionInicio) · multiplicador.
--   restar     pide n − (suma de lo hecho en los objetivos de la máscara) · multiplicador.
-- Sin bajar de 0, y con `minimo` como suelo. `siNinguno` se aplica fuera, al contar.
local function pedido(el)
  local n = el.n
  local mascara = el.mascara or 0
  if el.q and mascara ~= 0 then
    local mult = el.multiplicador or 1
    if el.profesion then
      if el.profesion == "item" then
        if el.profesionInicio then
          n = math.max(0, n - cuenta(el.profesionInicio, el.banco == true) * mult)
        end
      else
        local Profesiones = SNF.Profesiones
        local nivel = Profesiones and Profesiones.nivel(el.profesion)
        if nivel and nivel >= 0 then
          n = math.max(0, n - math.max(0, nivel - (el.profesionInicio or 0)) * mult)
        end
      end
    elseif el.restar then
      local hecho = 0
      local indices = indicesDeMascara(mascara)
      for i = 1, #indices do
        local objetivo = Misiones.objetivo(el.q, indices[i])
        if objetivo then
          hecho = hecho + (objetivo.hecho or 0)
        end
      end
      n = math.max(0, n - hecho * mult)
    end
  end
  return math.max(math.ceil(n), el.minimo or 0)
end

-- ¿Están terminados todos los objetivos de la máscara? (porObjetivos, flag 4.) Sin objetivos en la máscara, no.
local function objetivosTerminados(q, mascara)
  local indices = indicesDeMascara(mascara)
  if #indices == 0 then
    return false
  end
  for i = 1, #indices do
    local objetivo = Misiones.objetivo(q, indices[i])
    if not (objetivo and objetivo.terminado) then
      return false
    end
  end
  return true
end

-- Plano 2 §7 «.collect idObjeto,cantidad[,idMisión[,objFlags[,flags[,a1,a2,a3,a4]]]]» (functions.lua:2985-3253).
-- Hecho si cuenta ≥ lo pedido (n tras las reducciones de pedido()); o, con misión q:
--   · con máscara 0 o sin ella, si estás en la misión (el objeto la inicia);
--   · salvo noAlEntregar (flag 16), si la misión está completa o entregada, o con porObjetivos (flag 4) si todos
--     los objetivos de la máscara están terminados.
-- `banco` (flag 8) cuenta también el banco. `siNinguno` (flag 64): si no llevas ninguno, ni en el banco salvo
-- `ignorarBanco`, lo pedido pasa a 0. No se mira CHAT_MSG_LOOT (el objeto de misión recién despojado).
-- T1: sin q (y con un solo objeto), hecho si las misiones del diario que lo piden están completas o tienen ese objetivo
-- terminado, y lo pedido no pasa de lo que piden ellas (Misiones.duenasDeObjeto).
Elementos.registrar("collect", {
  puro = true,
  campos = {"i", "n"},
  opcionales = {"is", "q", "mascara", "banco", "noAlEntregar", "restar", "multiplicador", "profesion",
    "profesionInicio", "minimo", "porObjetivos", "siNinguno", "ignorarBanco"},
  eventos = EV_OBJETOS,
  evaluar = function(el)
    local ids = objetosDe(el)
    local lleva = contar(ids, el.banco == true)
    local pide = pedido(el)
    if lleva == 0 and el.siNinguno then
      if el.ignorarBanco or contar(ids, true, true) == 0 then
        pide = 0
      end
    end
    if lleva >= pide then
      return "hecho"
    end
    local q = el.q
    if q then
      local mascara = el.mascara or 0
      if mascara == 0 and Misiones.enDiario(q) then
        return "hecho"
      end
      if not el.noAlEntregar then
        if (el.porObjetivos and mascara ~= 0 and objetivosTerminados(q, mascara))
            or Misiones.entregada(q) or Misiones.completa(q) then
          return "hecho"
        end
      end
      -- 12-nov: el objeto es para una misión que el juego no daría (la cabeza de Shadumbra sin «La Caza de
      -- Vallefresno»): no hace falta buscarlo.
      if not Misiones.enDiario(q) and not Misiones.entregada(q) and Misiones.noSePuedeCoger(q) then
        return "hecho"
      end
    elseif el.is == nil then
      -- T1: sin misión en la guía, las que lo piden en el diario del juego (Misiones.duenasDeObjeto). Si todas están
      -- completas, o con el objetivo de ese objeto terminado, y el paso no pide más de lo que piden entre todas (ronda 1,
      -- I4: un collect de 10 para una profesión no se da por hecho por una misión que pide 1), ya no hace falta. Sin
      -- dueña, pendiente como antes.
      local duenas = Misiones.duenasDeObjeto(el.i)
      if duenas then
        local todas, suma = true, 0
        for _, d in ipairs(duenas) do
          local objetivo = Misiones.objetivo(d.q, d.k)
          if not (Misiones.completa(d.q) or (objetivo and objetivo.terminado)) then
            todas = false
          end
          suma = suma + (objetivo and tonumber(objetivo.pedido) or 0)
        end
        if todas and pide <= suma then
          return "hecho"
        end
      end
    end
    return "pendiente"
  end,
})

-- Plano 2 §7 «.itemcount id[/id2…],[<|>][=]N[,banco]» (functions.lua:6164-6243): cuenta (suma de los objetos de
-- `is`, con el equipado si da 0) comparada con `n` según `op`. Sin eventos propios: se evalúa al activarse el paso y
-- en el repaso periódico. La fase 1 emite efecto saltar_si_no_alcanzado: el paso solo se muestra si pasa.
local function comparar(op, lleva, n)
  if op == ">=" then
    return lleva >= n
  elseif op == ">" then
    return lleva > n
  elseif op == "<" then
    return lleva < n
  elseif op == "<=" then
    return lleva <= n
  elseif op == "==" then
    return lleva == n
  end
  return nil
end

Elementos.registrar("itemcount", {
  puro = true,
  campos = {"is", "op", "n", "efecto"},
  opcionales = {"banco"},
  eventos = {},
  evaluar = function(el)
    local cumple = comparar(el.op, contar(el.is, el.banco == true), el.n)
    if cumple == nil then
      return "info"
    end
    return conEfecto(el, cumple)
  end,
})

-- Plano 2 §7 «.destroy id» (functions.lua:3255-3313): hecho cuando GetItemCount llega a 0. No destruye nada.
Elementos.registrar("destroy", {
  puro = true,
  campos = {"i"},
  eventos = EV_OBJETOS,
  evaluar = function(el)
    return hechoPendiente(API.cuentaObjeto(el.i, false) == 0)
  end,
})

-- Plano 2 §7 «.bankdeposit id1,…» (functions.lua:5450-5501): hecho cuando ninguno está en las bolsas. No mueve
-- nada al banco por el jugador.
Elementos.registrar("bankdeposit", {
  puro = true,
  campos = {"is"},
  eventos = EV_OBJETOS,
  evaluar = function(el)
    return hechoPendiente(contar(el.is, false, true) == 0)
  end,
})

-- Plano 2 §7 «.bankwithdraw id1,…» (functions.lua:5474-5501). Lote A (revisión 52, I2): con texto es un objetivo, hecho
-- cuando todos los objetos de `is` están en las bolsas (GetItemCount sin el banco, como bankdeposit) o, ronda 1, cuando
-- el jugador abre el banco y lo cierra (BANKFRAME_OPENED y luego BANKFRAME_CLOSED): RestedXP lo da por hecho con el banco
-- abierto (IsItemNotInBank), así que un objeto que ya no tiene no lo deja atascado. Sin texto, solo informa. No saca
-- nada del banco por el jugador.
local EV_RETIRAR = {"BAG_UPDATE_DELAYED", "QUEST_LOG_UPDATE", "BANKFRAME_OPENED", "BANKFRAME_CLOSED"}

Elementos.registrar("bankwithdraw", {
  campos = {"is"},
  opcionales = {"texto"},
  eventos = EV_RETIRAR,
  evaluar = function(el, mem, evento)
    if el.texto == nil then
      return "info"
    end
    mem = mem or {}
    if evento == "BANKFRAME_OPENED" then
      mem.abierto = true
    elseif evento == "BANKFRAME_CLOSED" and mem.abierto then
      mem.abierto, mem.visitado = nil, true
    end
    if mem.visitado then
      return "hecho"
    end
    for i = 1, #el.is do
      if API.cuentaObjeto(el.is[i], false) < 1 then
        return "pendiente"
      end
    end
    return "hecho"
  end,
})

-- Plano 2 §7 «.equip [-]hueco[,idObjeto] [>>texto]» (functions.lua:7940-7978): «equipado» es que haya algo en el
-- hueco, y que sea ese objeto si se da `i`. El hueco negativo llega como `invertir`. Con texto es objetivo; sin
-- texto, saltar_si_alcanzado (efecto de la fase 1). No equipa nada.
Elementos.registrar("equip", {
  puro = true,
  campos = {"hueco", "efecto"},
  opcionales = {"i", "invertir"},
  eventos = {"PLAYER_EQUIPMENT_CHANGED"},
  evaluar = function(el)
    local puesto = GetInventoryItemID("player", el.hueco)
    return conEfecto(el, puesto ~= nil and (el.i == nil or el.i == puesto))
  end,
})

-- Plano 2 §7 «.bronzetube [rev]» (functions.lua:5547-5571): hacen falta 1 tubo de bronce (4371) si la misión 174 no
-- está entregada, y 0 si lo está. Salta el paso si los tienes; `invertir` (cualquier argumento del original) lo niega.
Elementos.registrar("bronzetube", {
  puro = true,
  campos = {},
  opcionales = {"invertir"},
  eventos = EV_OBJETOS,
  evaluar = function(el)
    local hacen = Misiones.entregada(MISION_DEL_TUBO) and 0 or 1
    local cumple = API.cuentaObjeto(TUBO_DE_BRONCE, false) >= hacen
    if el.invertir then
      cumple = not cumple
    end
    if cumple then
      return "saltar_paso"
    end
    return "info"
  end,
})

---------------------------------------------------------------------------------------------------
-- Lugar (plano 2 §4 y §5)
---------------------------------------------------------------------------------------------------

-- Mapa actual (nil dentro de una mazmorra).
local function mapaActual()
  return C_Map.GetBestMapForUnit("player")
end

-- ¿Estás en la zona o subzona llamada `nombre`? Se compara el nombre localizado con GetZoneText y GetSubZoneText.
-- Con `soloInstancia` (flag 2) solo vale si no hay mapa, es decir, dentro de una mazmorra.
local function enArea(el, nombre)
  if el.soloInstancia and mapaActual() then
    return false
  end
  return GetZoneText() == nombre or GetSubZoneText() == nombre
end

-- Plano 2 §4 «.zone mapa >>texto» (functions.lua:4651-4682): al estar en el mapa (el mejor mapa del jugador) se
-- completa el elemento y también el paso, así que da saltar_paso; antes de llegar, pendiente.
Elementos.registrar("zone", {
  puro = true,
  campos = {"mapa"},
  eventos = EV_LUGAR,
  evaluar = function(el)
    if mapaActual() == el.mapa then
      return "saltar_paso"
    end
    return "pendiente"
  end,
})

-- Plano 2 §4 «.subzone idÁrea[,flags] >>texto» (functions.lua:4571-4610): hecho si GetZoneText o GetSubZoneText es
-- el nombre de C_Map.GetAreaInfo(area). `invertir` (flag 1) se completa al salir; `soloInstancia` (flag 2) solo vale
-- sin mapa. Si el cliente aún no da el nombre del área no se puede comparar: info.
Elementos.registrar("subzone", {
  puro = true,
  campos = {"area"},
  opcionales = {"invertir", "soloInstancia"},
  eventos = EV_LUGAR,
  evaluar = function(el)
    local nombre = C_Map.GetAreaInfo(el.area)
    if not nombre then
      return sinMedir(el)
    end
    local cumple = enArea(el, nombre)
    if el.invertir then
      cumple = not cumple
    end
    return hechoPendiente(cumple)
  end,
})

-- Plano 2 §5 «.zoneskip mapa[+mapa2/mapa3…][,flags]» (functions.lua:4723-4759): salta el paso si el mapa actual está
-- en `mapas`; con `invertir` (flag 1), si no está en ninguno. Sin mapa (mazmorra) no hace nada.
Elementos.registrar("zoneskip", {
  puro = true,
  campos = {"mapas"},
  opcionales = {"invertir"},
  eventos = EV_LUGAR,
  evaluar = function(el)
    local actual = mapaActual()
    if not actual then
      return "info"
    end
    local esta = false
    for i = 1, #el.mapas do
      if el.mapas[i] == actual then
        esta = true
      end
    end
    if esta ~= (el.invertir == true) then
      return "saltar_paso"
    end
    return "info"
  end,
})

-- Plano 2 §5 «.subzoneskip idÁrea[,flags]» (functions.lua:4612-4649): salta el paso si estás en esa zona o subzona
-- (por nombre localizado); `invertir` (flag 1) lo niega y `soloInstancia` (flag 2) solo vale sin mapa.
Elementos.registrar("subzoneskip", {
  puro = true,
  campos = {"area"},
  opcionales = {"invertir", "soloInstancia"},
  eventos = EV_LUGAR,
  evaluar = function(el)
    local nombre = C_Map.GetAreaInfo(el.area)
    if not nombre then
      return "info"
    end
    local cumple = enArea(el, nombre)
    if el.invertir then
      cumple = not cumple
    end
    return cumple and "saltar_paso" or "info"
  end,
})

-- Plano 2 §5 «.bindlocation idÁrea[,flags]» (functions.lua:2707-2728): salta el paso si GetBindLocation() es el
-- nombre de C_Map.GetAreaInfo(area); con `invertir` (flag 1), si no lo es. No vincula nada.
Elementos.registrar("bindlocation", {
  puro = true,
  campos = {"area"},
  opcionales = {"invertir"},
  eventos = EV_LUGAR,
  evaluar = function(el)
    local nombre = C_Map.GetAreaInfo(el.area)
    if not nombre then
      return "info"
    end
    local cumple = GetBindLocation() == nombre
    if el.invertir then
      cumple = not cumple
    end
    return cumple and "saltar_paso" or "info"
  end,
})

-- Plano 2 §10 «.showwhiledead» (functions.lua:8596-8607): si estás vivo, salta el paso (el paso solo se ve muerto
-- o fantasma).
Elementos.registrar("showwhiledead", {
  puro = true,
  campos = {},
  eventos = {"PLAYER_ALIVE", "PLAYER_DEAD", "PLAYER_UNGHOST"},
  evaluar = function()
    if UnitIsDeadOrGhost("player") then
      return "info"
    end
    return "saltar_paso"
  end,
})
