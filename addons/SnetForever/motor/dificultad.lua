-- SnetForever: dificultad de las misiones para el personaje (lote D, D2: visto en el juego el 10-nov con una druida de nivel 22,
-- a quien la guía mandaba a «Boticaria Zamah», una misión de nivel 15). Decide el color de una misión como el juego (rojo,
-- naranja, amarillo, verde o gris) y si un paso de la guía es «gris» y se puede saltar solo.
--
-- Lo gris lo decide el cliente. Por orden (Dificultad.fuente() dice cuál se usa; plano 5: «a comprobar» en el juego):
--   1. C_QuestLog.GetTrivialRange(): la que usa Questie en Forever (QuestieCompat.lua:681-697) y EllesmereUI para
--      Forever (EllesmereUI_SharedHelpers.lua:776). Da el margen verde: verde mientras nivel − nivelMisión ≤ margen.
--   2. UnitQuestTrivialLevelRange("player") (retail) y 3. GetQuestGreenRange() (Classic): lo mismo.
--   4. Sin ninguna, la tabla de Classic de Questie (QuestDetailsFrame.lua:137-155, «values observed on wowhead»): gris
--      desde nivelMisión + 5 (misiones de nivel ≤ 4), + 6 (≤ 13), + 7 (≤ 22), + 8 (≤ 31), + 9 (≤ 40), + 10 (≤ 49),
--      + 11 (≤ 58) y + 12.
-- C_QuestLog.IsQuestTrivial(q) existe en Forever, pero solo sabe de las misiones que el cliente tiene en caché (DialogueUI
-- lo avisa: «May not get the correct value during the first call»), así que no se usa para pasos que aún no se han visto.
-- Los colores, como GetQuestDifficultyColor: nivelMisión − nivel ≥ 5 rojo, ≥ 3 naranja, ≥ −2 amarillo, verde hasta el
-- margen y gris por debajo. Una misión de nivel ≤ 0 escala con el jugador: amarilla.
--
-- Dificultad.fuente() -> "C_QuestLog.GetTrivialRange" | "UnitQuestTrivialLevelRange" | "GetQuestGreenRange" | "tabla"
-- Dificultad.color(nivelMision, nivel?) -> "rojo" | "naranja" | "amarillo" | "verde" | "gris"   (nivel: el del personaje)
-- Dificultad.HEX[color] -> "|cFFRRGGBB"   el color del juego (QuestDifficultyColors de Classic).
-- Dificultad.limiteGris(nivel?) -> el nivel de misión más alto que es gris para ese nivel.
-- Dificultad.seSalta(nivelMision, nivel?) -> boolean   gris o, con el margen pasos.margenVerdes = N, una de las N verdes
--                                         más bajas (nunca amarilla ni más).
-- Dificultad.pasoGris(pv, guia) -> nivel | nil   el nivel de misión más alto del paso si el paso entero es «gris» (ver
--                                         abajo) y se puede saltar solo; nil si no. Lo usa el motor (motor/pasos.lua).
--
-- Un paso es gris si (con el ajuste pasos.saltarGrises, encendido por defecto, y en una guía normal o con mazmorras):
--   * tiene alguna misión (accept, turnin, complete o un collect de una misión) que aún no se ha entregado;
--   * todas sus misiones sin entregar se saltan (seSalta) y ninguna está en el registro del jugador (manda el juego);
--   * ninguna es de clase (requiredClasses o un zoneOrSort de clase), de una cadena de mejoras (guías de tipo «mejora»)
--     ni previa (directa o de más atrás) de una misión no gris de la misma guía: la cadena tiene que seguir;
--   * lo demás del paso es informativo (Elementos.INFORMATIVOS: nota, goto, target, mob…) o una condición de misión
--     (isOnQuest y compañía). Un paso que además da un vuelo, un instructor, la piedra… no se salta.
-- Lo que se memoriza (por guía, nivel, margen y datos): el conjunto de previas protegidas de la guía y las misiones de
-- las cadenas de mejoras. El registro y lo entregado se miran cada vez.
local _, SNF = ...
local Dificultad = {}
SNF.Dificultad = Dificultad

local floor = math.floor

local MAX_PROFUNDIDAD = 30 -- eslabones que se suben por las previas de una cadena

-- Colores de QuestDifficultyColors (Classic): rojo (1, 0.1, 0.1), naranja (1, 0.5, 0.25), amarillo (1, 1, 0), verde
-- (0.25, 0.75, 0.25) y gris (0.5, 0.5, 0.5).
Dificultad.HEX = {
  rojo = "|cFFFF1A1A", naranja = "|cFFFF8040", amarillo = "|cFFFFFF00", verde = "|cFF40BF40", gris = "|cFF808080",
}

-- zoneOrSort de clase de QuestieDB (Database/Constants.lua, sortKeys): brujo, guerrero, chamán, paladín, mago, pícaro,
-- cazador, sacerdote y druida.
local SORT_CLASE = {[-61] = true, [-81] = true, [-82] = true, [-141] = true, [-161] = true, [-162] = true, [-261] = true,
  [-262] = true, [-263] = true}

-- Condiciones de misión: no hacen nada por sí solas (como los informativos).
local CONDICIONES = {
  isOnQuest = true, isNotOnQuest = true, isQuestComplete = true, isQuestNotComplete = true, isQuestTurnedIn = true,
  isQuestAvailable = true,
}
local DE_MISION = {accept = true, turnin = true, complete = true}

local function nivelDelJugador()
  local p = SNF.Personaje and SNF.Personaje.actual()
  local n = p and p.nivel
  if type(n) ~= "number" then
    n = UnitLevel("player") or 1
  end
  return n
end

-- El margen verde que da el cliente (y de qué función sale), o nil si no tiene ninguna.
local function margenDelCliente()
  local cq = rawget(_G, "C_QuestLog")
  local f = type(cq) == "table" and rawget(cq, "GetTrivialRange")
  if type(f) == "function" then
    local ok, v = pcall(f)
    if ok and type(v) == "number" then
      return v, "C_QuestLog.GetTrivialRange"
    end
  end
  f = rawget(_G, "UnitQuestTrivialLevelRange")
  if type(f) == "function" then
    local ok, v = pcall(f, "player")
    if ok and type(v) == "number" then
      return v, "UnitQuestTrivialLevelRange"
    end
  end
  f = rawget(_G, "GetQuestGreenRange")
  if type(f) == "function" then
    local ok, v = pcall(f)
    if ok and type(v) == "number" then
      return v, "GetQuestGreenRange"
    end
  end
  return nil
end

function Dificultad.fuente()
  local _, fuente = margenDelCliente()
  return fuente or "tabla"
end

-- Tabla de Classic: lo que se suma al nivel de la misión para el primer nivel del personaje en que es gris.
local function sumaTabla(nivelMision)
  if nivelMision <= 4 then
    return 5
  elseif nivelMision <= 13 then
    return 6
  elseif nivelMision <= 22 then
    return 7
  elseif nivelMision <= 31 then
    return 8
  elseif nivelMision <= 40 then
    return 9
  elseif nivelMision <= 49 then
    return 10
  elseif nivelMision <= 58 then
    return 11
  end
  return 12
end

function Dificultad.limiteGris(nivel)
  nivel = nivel or nivelDelJugador()
  local margen = margenDelCliente()
  if margen then
    return nivel - floor(margen) - 1
  end
  local limite = 0
  for q = 1, nivel do
    if nivel >= q + sumaTabla(q) then
      limite = q
    end
  end
  return limite
end

function Dificultad.color(nivelMision, nivel)
  nivel = nivel or nivelDelJugador()
  nivelMision = tonumber(nivelMision) or 0
  if nivelMision <= 0 then
    return "amarillo"
  end
  local diferencia = nivelMision - nivel
  if diferencia >= 5 then
    return "rojo"
  elseif diferencia >= 3 then
    return "naranja"
  elseif diferencia >= -2 then
    return "amarillo"
  elseif nivelMision > Dificultad.limiteGris(nivel) then
    return "verde"
  end
  return "gris"
end

local function margenVerdes()
  local n = tonumber(SNF.Ajustes.get("pasos.margenVerdes")) or 0
  return math.max(0, floor(n))
end

function Dificultad.seSalta(nivelMision, nivel)
  nivel = nivel or nivelDelJugador()
  nivelMision = tonumber(nivelMision) or 0
  if nivelMision <= 0 then
    return false
  end
  local color = Dificultad.color(nivelMision, nivel)
  if color == "gris" then
    return true
  end
  return color == "verde" and nivelMision <= Dificultad.limiteGris(nivel) + margenVerdes()
end

---------------------------------------------------------------------------------------------------
-- Misiones que nunca se saltan
---------------------------------------------------------------------------------------------------

local deMejoras -- [q] = true: las misiones de las guías de tipo «mejora» de SNF_MISIONES
local origenMejoras

local function enCadenaDeMejoras(q)
  local datos = rawget(_G, "SNF_MISIONES")
  if datos ~= origenMejoras then
    origenMejoras, deMejoras = datos, nil
  end
  if not deMejoras then
    deMejoras = {}
    local guias = type(datos) == "table" and type(datos.guias) == "table" and datos.guias or {}
    for _, g in pairs(guias) do
      if type(g) == "table" and g.tipo == "mejora" then
        for _, paso in ipairs(g.pasos or {}) do
          for _, el in ipairs(paso.elementos or {}) do
            if type(el.q) == "number" then
              deMejoras[el.q] = true
            end
          end
        end
      end
    end
  end
  return deMejoras[q] == true
end

local function deClase(m)
  return (tonumber(m.requiredClasses) or 0) ~= 0 or SORT_CLASE[m.zoneOrSort] == true
end

local function nivelDe(q)
  local m = SNF.Datos.mision(q)
  return m and tonumber(m.questLevel) or nil, m
end

-- La misión de un elemento (accept, turnin, complete o el collect de una misión), o nil.
local function misionDe(datos)
  if DE_MISION[datos.t] or (datos.t == "collect" and datos.q ~= nil) then
    return type(datos.q) == "number" and datos.q or nil
  end
  return nil
end

-- Previas protegidas de una guía: [q] = true para cada previa (de cualquier eslabón hacia atrás) de una misión de la guía
-- que no se salta. Memorizado por guía, nivel, margen, fuente y datos.
local protegidas = setmetatable({}, {__mode = "k"}) -- [guia] = {clave, lista}

local function previasDe(q)
  local m = SNF.Datos.mision(q)
  if not m then
    return nil, nil
  end
  return m.preQuestSingle, m.preQuestGroup
end

local function protegidasDe(guia)
  local nivel = nivelDelJugador()
  local clave = table.concat({tostring(nivel), tostring(margenVerdes()), Dificultad.fuente(),
    tostring(rawget(_G, "SNF_MISIONES"))}, "|")
  local memo = protegidas[guia]
  if memo and memo.clave == clave then
    return memo.lista
  end
  local lista = {}
  local function subir(q, profundidad)
    if profundidad > MAX_PROFUNDIDAD then
      return
    end
    local sola, grupo = previasDe(q)
    for _, previas in ipairs({sola or {}, grupo or {}}) do
      for _, p in ipairs(previas) do
        if type(p) == "number" and not lista[p] then
          lista[p] = true
          subir(p, profundidad + 1)
        end
      end
    end
  end
  for _, paso in ipairs(guia.pasos or {}) do
    for _, el in ipairs(paso.elementos or {}) do
      local q = misionDe(el)
      if q then
        -- Se sube desde las que no se saltan: las no grises y (ronda 1, M1) las de clase o de mejoras, aunque sean
        -- grises, para que su paso se pueda hacer.
        local ql, m = nivelDe(q)
        if not (ql and Dificultad.seSalta(ql, nivel)) or (m and deClase(m)) or enCadenaDeMejoras(q) then
          subir(q, 1)
        end
      end
    end
  end
  protegidas[guia] = {clave = clave, lista = lista}
  return lista
end

---------------------------------------------------------------------------------------------------
-- Pasos grises
---------------------------------------------------------------------------------------------------

local TIPOS_GUIA = {normal = true, mazmorras = true}

function Dificultad.pasoGris(pv, guia)
  if SNF.Ajustes.get("pasos.saltarGrises") == false or type(pv) ~= "table" or type(guia) ~= "table" then
    return nil
  end
  if guia.tipo ~= nil and not TIPOS_GUIA[guia.tipo] then
    return nil
  end
  local Misiones = SNF.Misiones
  local informativos = SNF.Elementos.INFORMATIVOS
  local nivel = nivelDelJugador()
  local maximo
  local lista
  for _, e in ipairs(pv.elementos or {}) do
    local datos = e.datos
    local q = misionDe(datos)
    if q then
      if Misiones.enDiario(q) then
        return nil -- manda el juego
      end
      if not Misiones.entregada(q) then
        local ql, m = nivelDe(q)
        if not ql or not m or not Dificultad.seSalta(ql, nivel) or deClase(m) or enCadenaDeMejoras(q) then
          return nil
        end
        lista = lista or protegidasDe(guia)
        if lista[q] then
          return nil
        end
        maximo = math.max(maximo or ql, ql)
      end
    elseif not informativos[datos.t] and not CONDICIONES[datos.t] then
      return nil
    end
  end
  return maximo
end
