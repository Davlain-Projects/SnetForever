-- SnetForever: registro de evaluadores de elementos de paso. Cada tipo de elemento (el campo `t` de los datos de
-- la fase 1) se registra con su evaluador; el motor de pasos pregunta aquí si un elemento está hecho.
--
-- Elementos.registrar(t, def)  def = {campos = {string}, opcionales? = {string}, eventos = {string}, evaluar = function,
--                                     extra = libre}
--   * campos: los campos que TODO elemento real de ese tipo trae (los comprueba test/contrato.test.js con los
--     datos de la fase 1). Los que el evaluador lee solo si están van en `opcionales`.
--   * eventos: eventos del juego tras los cuales hay que reevaluar el elemento.
--   * evaluar(el, mem, evento, ...) -> resultado, extra. `mem` es una tabla por elemento y por activación del
--     paso; `evento` es nil al activarse el paso y en los repasos periódicos.
--   * extra: libre para quien registra; el motor no lo lee.
--   * puro (T1): true (o una función(el) -> boolean) si el resultado no depende de eventos: evaluado sin evento y con
--     la mem con la que se activa el paso (la que pone el motor), da lo mismo que al activarlo. El motor lo usa para
--     ver hacia delante qué pasos ya están hechos sin activarlos.
-- Elementos.evaluar(el, mem, evento, ...) -> resultado, extra
-- Elementos.eventos(el) -> lista de eventos del tipo del elemento ({} si no tiene evaluador)
-- Elementos.def(t) -> la definición registrada, o nil
-- Elementos.esPuro(el) -> boolean   T1: se puede evaluar sin activar el paso (puro, informativo o sin casilla).
-- Elementos.INFORMATIVOS[t] = true: tipos conocidos que solo informan. Un tipo registrado gana a esta lista.
-- Elementos.desconocidos[t] = cuenta de elementos de tipos que ni están registrados ni son informativos.
--
-- Resultados:
--   "hecho" / "pendiente"  objetivo con casilla.
--   "info"                 no bloquea.
--   "saltar_paso"          condición: el paso se da por hecho y no va a saltados.
--   "ir_a"                 extra = etiqueta a la que saltar.
--   "ir_guia"              extra = lista de {clave, filtro?} de guías a las que pasar.
local _, SNF = ...
local Elementos = {}
SNF.Elementos = Elementos

local registro = {} -- [t] = def

Elementos.INFORMATIVOS = {
  nota = true,
  line = true,
  link = true,
  xpto60 = true,
  clicknext = true,
  use = true,
  usespell = true,
  pin = true,
  waypoint = true,
  ["goto"] = true, -- entre corchetes: en fengari (Lua 5.3) goto es palabra reservada.
  loop = true,
  target = true,
  mob = true,
  unitscan = true,
  timer = true,
  itemStat = true, -- contrato de la fase 1 (R21): hasta implementarlo, no bloquea.
  enabledungeon = true, -- plano 2 §10: ya está resuelto en Guia.mazmorras (datos de la fase 1); el elemento no hace nada.
  solo = true, -- plano 2 §10 «.solo»: marca el paso como «en solitario»; lo usa el filtro de grupo del motor de pasos.
  blastedLands = true, -- plano 2 §7 «.blastedLands»: recuento de las Tierras Devastadas; sin evaluador, no bloquea.
}

Elementos.desconocidos = {}

local SIN_EVENTOS = {}

function Elementos.registrar(t, def)
  registro[t] = def
end

function Elementos.def(t)
  return registro[t]
end

-- Un tipo sin evaluador solo es puro si es informativo (uno desconocido no se sabe qué es).
function Elementos.esPuro(el)
  if el.sinCasilla then
    return true
  end
  local def = registro[el.t]
  if not def then
    return Elementos.INFORMATIVOS[el.t] == true
  end
  local puro = def.puro
  if type(puro) == "function" then
    return puro(el) and true or false
  end
  return puro == true
end

function Elementos.eventos(el)
  local def = registro[el.t]
  return def and def.eventos or SIN_EVENTOS
end

function Elementos.evaluar(el, mem, evento, ...)
  -- Un elemento sin casilla (p. ej. marcado por .disablecheckbox) nunca bloquea ni salta.
  if el.sinCasilla then
    return "info"
  end
  local def = registro[el.t]
  if not def then
    if not Elementos.INFORMATIVOS[el.t] then
      Elementos.desconocidos[el.t] = (Elementos.desconocidos[el.t] or 0) + 1
    end
    return "info"
  end
  return def.evaluar(el, mem, evento, ...)
end
