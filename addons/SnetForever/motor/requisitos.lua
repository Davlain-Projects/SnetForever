-- SnetForever: requisitos visibles de un paso (O11 del diseño, §2). Para cada paso calcula lo que la ventana enseña
-- al jugador («necesitas grupo», «élite», «nivel 10», «misión previa X», «Herboristería 15», reputación, objeto,
-- mazmorra) y si se cumple. Los requisitos NO deciden el avance: solo informan. Lo que hace esperar al paso lo decide
-- el motor (#level, #requires) o el propio elemento, que no se completa.
--
--   Requisitos.delPaso(pasoVivo) -> lista de {t, clave, estado, texto, color?}
--     t       tipo («nivel», «nivelMision», «mision», «profesion», «reputacion», «objeto», «grupo», «elite», «mazmorra»,
--             «banda», «paso», o el t desconocido tal cual)
--     color   (solo «nivelMision», lote D) el código de color del juego para la dificultad de la misión
--     clave   para no repetir: «nivel», «mision:q», «profesion:p», «reputacion:facción», «objeto:i», «grupo»,
--             «elite», «banda», «mazmorra:d», «paso:etiqueta». Con la misma clave gana el requisito más exigente
--             (el nivel mayor, la profesión más alta...).
--     estado  "ok" (cumplido), "falta" (no cumplido) o "aviso" (no se puede medir)
--     texto   ya en el idioma activo
--
-- Fuentes, por este orden: `paso.requisitos` de la fase 1 (solo los que aplican al personaje, por su `filtro`) y,
-- por cada elemento `accept` del paso, los campos de la misión en SNF_MISIONES (con las correcciones por facción).
local _, SNF = ...
local API = SNF.API -- compatibilidad con el cliente (nucleo/espacio.lua)
local Requisitos = {}
SNF.Requisitos = Requisitos

local L = SNF.L
local Datos = SNF.Datos
local Filtros = SNF.Filtros
local Misiones = SNF.Misiones
local Personaje = SNF.Personaje
local Profesiones = SNF.Profesiones
local Reputacion = SNF.Reputacion

-- skillId de las misiones (QuestieDB) → profesión de SNF.Profesiones (la inversa de Profesiones.SKILL).
local PROFESION_DE_SKILL = {}
for p, skill in pairs(Profesiones.SKILL) do
  PROFESION_DE_SKILL[skill] = p
end

-- Reputación absoluta en la que empieza cada rango (1 odiado … 8 exaltado), para pasar el valor absoluto de
-- `requiredMinRep` a «rango + puntos dentro del rango», que es lo que da Reputacion.de.
local BASE_RANGO = {-42000, -6000, -3000, 0, 3000, 9000, 21000, 42000}

local BIT_BANDA = 64 -- questFlags: la misión es de banda

---------------------------------------------------------------------------------------------------
-- Acumulador sin repetir por clave
---------------------------------------------------------------------------------------------------

local function nuevaLista()
  return {lista = {}, indice = {}, medida = {}}
end

-- Añade un requisito. Con `medida` (nivel, profesión, objetos...), si la clave ya está solo se sustituye cuando
-- el nuevo pide más; sin ella, el primero se queda.
local function anadir(acum, req, medida)
  local i = acum.indice[req.clave]
  if not i then
    acum.lista[#acum.lista + 1] = req
    acum.indice[req.clave] = #acum.lista
    acum.medida[req.clave] = medida
    return
  end
  if medida and (acum.medida[req.clave] or 0) < medida then
    acum.lista[i] = req
    acum.medida[req.clave] = medida
  end
end

local function entero(n)
  return math.floor(tonumber(n) or 0)
end

---------------------------------------------------------------------------------------------------
-- Un constructor por tipo de requisito
---------------------------------------------------------------------------------------------------

local function nivelDelJugador()
  return UnitLevel("player") or Personaje.actual().nivel or 1
end

local function reqNivel(acum, n)
  n = entero(n)
  local actual = nivelDelJugador()
  anadir(acum, {
    t = "nivel", clave = "nivel", estado = actual >= n and "ok" or "falta",
    texto = L.t("REQ_NIVEL", n, actual),
  }, n)
end

-- Lote D (D2): el nivel de la misión (no solo el mínimo), con el color que le da el juego para el personaje
-- (motor/dificultad.lua): «Misión de nivel 15 (gris para ti)». Una por paso: con varias, la de nivel más alto. `color` es
-- el código de color del juego, que la ventana usa en lugar del de su estado; una gris es un aviso.
local function reqNivelMision(acum, nivelMision)
  local ql = entero(nivelMision)
  if ql <= 0 then
    return
  end
  local Dificultad = SNF.Dificultad
  local color = Dificultad.color(ql, nivelDelJugador())
  anadir(acum, {
    t = "nivelMision", clave = "nivelMision", estado = color == "gris" and "aviso" or "ok",
    texto = L.t("REQ_NIVEL_MISION", ql, L.t("DIFICULTAD_" .. string.upper(color))), color = Dificultad.HEX[color],
  }, ql)
end

local function reqMision(acum, q)
  q = entero(q)
  anadir(acum, {
    t = "mision", clave = string.format("mision:%d", q), estado = Misiones.entregada(q) and "ok" or "falta",
    texto = L.t("REQ_MISION", Datos.nombreMision(q)),
  })
end

local function reqProfesion(acum, p, n)
  n = entero(n)
  local nombre = L.tablas[L.idioma()]["PROFESION_" .. string.upper(p)] and L.t("PROFESION_" .. string.upper(p)) or p
  local nivel = Profesiones.nivel(p)
  local estado, texto
  if nivel == nil then
    -- Sin hechizo en la tabla o el cliente aún no da su nombre: no se puede medir.
    estado, texto = "aviso", L.t("REQ_PROFESION_SOLO", nombre, n)
  elseif nivel < 0 then
    estado, texto = "falta", L.t("REQ_PROFESION_NO", nombre, n)
  else
    estado, texto = nivel >= n and "ok" or "falta", L.t("REQ_PROFESION", nombre, n, nivel)
  end
  anadir(acum, {t = "profesion", clave = "profesion:" .. p, estado = estado, texto = texto}, n)
end

-- Habilidad de misión cuyo skillId no está en la tabla: se enseña tal cual, sin medir.
local function reqHabilidadSuelta(acum, skillId, n)
  skillId = entero(skillId)
  anadir(acum, {
    t = "profesion", clave = string.format("profesion:#%d", skillId), estado = "aviso",
    texto = L.t("REQ_HABILIDAD", skillId, entero(n)),
  }, entero(n))
end

local function nombreDeFaccion(id)
  if C_Reputation and C_Reputation.GetFactionDataByID then
    local d = C_Reputation.GetFactionDataByID(id)
    if d and d.name then
      return d.name
    end
  end
  if GetFactionInfoByID then
    local nombre = GetFactionInfoByID(id)
    if nombre then
      return nombre
    end
  end
  return string.format("#%d", id)
end

local function reqReputacion(acum, faccion, rango, valor)
  faccion, rango, valor = entero(faccion), entero(rango), entero(valor)
  if rango < 1 then
    rango = 1
  elseif rango > 8 then
    rango = 8
  end
  local r = Reputacion.de(faccion)
  local cumple = r ~= nil and (r.rango > rango or (r.rango == rango and r.valor >= valor))
  local nombreRango = L.t(string.format("RANGO_%d", rango))
  local texto
  if valor > 0 then
    texto = L.t("REQ_REPUTACION_VALOR", nombreDeFaccion(faccion), nombreRango, valor)
  else
    texto = L.t("REQ_REPUTACION", nombreDeFaccion(faccion), nombreRango)
  end
  -- Para decidir cuál pide más cuando hay varias del mismo bando: el rango y, dentro de él, los puntos.
  anadir(acum, {
    t = "reputacion", clave = string.format("reputacion:%d", faccion), estado = cumple and "ok" or "falta",
    texto = texto,
  }, rango * 100000 + valor)
end

-- `requiredMinRep` de una misión: {facción, reputación absoluta} → rango y puntos dentro del rango.
local function reqReputacionAbsoluta(acum, faccion, absoluta)
  local rango = 1
  for i = 1, 8 do
    if absoluta >= BASE_RANGO[i] then
      rango = i
    end
  end
  reqReputacion(acum, faccion, rango, absoluta - BASE_RANGO[rango])
end

local function reqObjeto(acum, i, n)
  i, n = entero(i), math.max(entero(n), 1)
  local cuenta = API.cuentaObjeto(i) or 0
  anadir(acum, {
    t = "objeto", clave = string.format("objeto:%d", i), estado = cuenta >= n and "ok" or "falta",
    texto = L.t("REQ_OBJETO", Datos.nombreItem(i), cuenta, n),
  }, n)
end

local function reqGrupo(acum, n)
  if n == nil then
    anadir(acum, {t = "grupo", clave = "grupo", estado = "aviso", texto = L.t("REQ_GRUPO_SIN")})
    return
  end
  n = entero(n)
  local actual = GetNumGroupMembers and GetNumGroupMembers() or 0
  anadir(acum, {
    t = "grupo", clave = "grupo", estado = actual >= n and "ok" or "aviso",
    texto = L.t("REQ_GRUPO", n, actual),
  }, n)
end

local function reqAviso(acum, t, clave, texto)
  anadir(acum, {t = t, clave = clave, estado = "aviso", texto = texto})
end

-- #requires de la fase 1 (`{t="paso", etiqueta}`): se cumple como en el motor (motor/pasos.lua, requisitoCumplido):
-- el paso con esa etiqueta no existe tras filtrar, está hecho o saltado o, si no es pegajoso, ya quedó atrás.
local function reqPaso(acum, etiqueta)
  local Motor = SNF.Motor
  local actual = Motor.estado().actual
  local cumple = true
  local i = 1
  while Motor.paso(i) do
    local pv = Motor.paso(i)
    if pv.etiqueta == etiqueta then
      cumple = pv.hecho or pv.saltado or (not pv.pegajoso and i < actual)
      break
    end
    i = i + 1
  end
  anadir(acum, {
    t = "paso", clave = "paso:" .. tostring(etiqueta), estado = cumple and "ok" or "falta",
    texto = L.t("REQ_PASO", tostring(etiqueta)),
  })
end

---------------------------------------------------------------------------------------------------
-- Fuente 1: paso.requisitos de la fase 1
---------------------------------------------------------------------------------------------------

local function delPasoDeDatos(acum, requisitos, personaje)
  for _, r in ipairs(requisitos) do
    if Filtros.evaluar(r.filtro, personaje) then
      local t = r.t
      if t == "grupo" then
        reqGrupo(acum, r.n)
      elseif t == "elite" then
        reqAviso(acum, "elite", "elite", L.t("REQ_ELITE"))
      elseif t == "nivel" then
        reqNivel(acum, r.n)
      elseif t == "paso" then
        reqPaso(acum, r.etiqueta)
      elseif t == "mision" then
        reqMision(acum, r.q)
      elseif t == "profesion" then
        reqProfesion(acum, r.p, r.n)
      elseif t == "reputacion" then
        reqReputacion(acum, r.faccion, r.rango, r.valor)
      elseif t == "objeto" then
        reqObjeto(acum, r.i, r.n)
      elseif t == "mazmorra" then
        -- «!X»: el paso es de las guías que no son de mazmorras; no es algo que pedirle al jugador.
        if type(r.d) == "string" and string.sub(r.d, 1, 1) ~= "!" then
          reqAviso(acum, "mazmorra", "mazmorra:" .. r.d, L.t("REQ_MAZMORRA", r.d))
        end
      else
        -- Vigilancia 1: un requisito que esta versión no conoce no rompe nada: se enseña.
        local nombre = tostring(t)
        reqAviso(acum, nombre, "?:" .. nombre, L.t("REQ_DESCONOCIDO", nombre))
      end
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Fuente 2: la base de misiones, por cada accept del paso
---------------------------------------------------------------------------------------------------

-- ¿Algún objetivo de la misión es un PNJ élite (rank >= 1)? objectives[1] = lista de objetivos de criatura.
local function tienePnjElite(mision)
  local criaturas = mision.objectives and mision.objectives[1]
  if type(criaturas) ~= "table" then
    return false
  end
  for _, objetivo in ipairs(criaturas) do
    local id = type(objetivo) == "table" and objetivo[1]
    local npc = id and Datos.npc(id)
    if npc and (npc.rank or 0) >= 1 then
      return true
    end
  end
  return false
end

local function delaMision(acum, q)
  local m = Datos.mision(q)
  if not m then
    return
  end
  if (m.requiredLevel or 0) > 1 then
    reqNivel(acum, m.requiredLevel)
  end
  reqNivelMision(acum, m.questLevel)
  -- preQuestSingle: basta una. Si alguna ya está entregada solo se enseña esa (cumplida); si no, todas, que faltan.
  if type(m.preQuestSingle) == "table" and #m.preQuestSingle > 0 then
    local hecha
    for _, previa in ipairs(m.preQuestSingle) do
      if Misiones.entregada(previa) then
        hecha = previa
        break
      end
    end
    if hecha then
      reqMision(acum, hecha)
    else
      for _, previa in ipairs(m.preQuestSingle) do
        reqMision(acum, previa)
      end
    end
  end
  -- preQuestGroup: todas.
  for _, previa in ipairs(m.preQuestGroup or {}) do
    reqMision(acum, previa)
  end
  local skill = m.requiredSkill
  if type(skill) == "table" and skill[1] and skill[1] ~= 0 then
    local p = PROFESION_DE_SKILL[skill[1]]
    if p then
      reqProfesion(acum, p, skill[2])
    else
      reqHabilidadSuelta(acum, skill[1], skill[2])
    end
  end
  local rep = m.requiredMinRep
  if type(rep) == "table" and rep[1] and rep[1] ~= 0 then
    reqReputacionAbsoluta(acum, entero(rep[1]), tonumber(rep[2]) or 0)
  end
  for _, i in ipairs(m.requiredSourceItems or {}) do
    if type(i) == "number" and i ~= 0 then
      reqObjeto(acum, i, 1)
    end
  end
  local banderas = tonumber(m.questFlags) or 0
  if math.floor(banderas / BIT_BANDA) % 2 == 1 then
    reqAviso(acum, "banda", "banda", L.t("REQ_BANDA"))
  end
  local zona = m.zoneOrSort
  if type(zona) == "number" and zona > 0 and Datos.esMazmorra(zona) then
    reqAviso(acum, "mazmorra", string.format("mazmorra:%d", zona), L.t("REQ_MAZMORRA", Datos.nombreZona(zona)))
  end
  if tienePnjElite(m) then
    reqAviso(acum, "elite", "elite", L.t("REQ_ELITE"))
  end
end

---------------------------------------------------------------------------------------------------
-- API
---------------------------------------------------------------------------------------------------

function Requisitos.delPaso(pv)
  local acum = nuevaLista()
  if type(pv) ~= "table" or type(pv.datos) ~= "table" then
    return acum.lista
  end
  delPasoDeDatos(acum, pv.datos.requisitos or {}, Personaje.actual())
  for _, el in ipairs(pv.elementos or {}) do
    local datos = el.datos
    if datos and datos.t == "accept" and datos.q then
      delaMision(acum, entero(datos.q))
    end
  end
  return acum.lista
end
