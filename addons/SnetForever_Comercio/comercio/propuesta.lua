-- SnetForever: propuestas de comercio de la IA (tarea 15). La app valida el bloque `comercio` de la respuesta y lo manda
-- en registro.comercio; el chat (ui/chat.lua) lo pasa aquí y enseña «La IA propone el grupo…» con [Aplicar] y
-- [Descartar]. Nada cambia hasta que el jugador pulsa Aplicar, y aplicar solo crea un grupo propio y pone una regla:
-- nunca compra, puja ni publica nada.
--
-- comercio = {grupo? = {nombre, objetos = {id...}}, regla? = {compraPct, ritmoMin, valorMin, sniperPct, maxUnidades,
--             maxOro}, paraGrupo? = {clave, nombre}}
--   grupo: un grupo propio nuevo con esos objetos (y la regla, si viene).
--   regla sin grupo: va al grupo paraGrupo (el que el jugador tenía abierto en la subasta al preguntar).
--
-- Propuesta.proponer(comercio) -> boolean   la comprueba otra vez (nombre no vacío y sin «|», cortado a 40 letras y
--                                           60 bytes; ids enteros positivos, como mucho MAX_IDS; regla en rango con
--                                           Reglas.valida; regla sola con paraGrupo) y, si
--                                           vale, la deja pendiente (en memoria, como la ruta de la IA). La pendiente de
--                                           antes se olvida siempre, valga o no la nueva, y se emite
--                                           SNF_COMERCIO_PROPUESTA(propuesta | nil). Da si la nueva vale.
-- Propuesta.pendiente() -> propuesta | nil
-- Propuesta.descartar()                     olvida la pendiente; no toca nada guardado.
-- Propuesta.aplicar() -> true, clave | false, motivo   la pendiente deja de estarlo. Con grupo: Grupos.crear(nombre),
--                                           Grupos.anadir de cada objeto y Reglas.poner(clave, regla) si hay regla. Con
--                                           una regla sola: Reglas.poner(paraGrupo.clave, regla), solo si ese grupo sigue
--                                           en Grupos.lista(). motivo: «nada», «regla», «grupo» o «sin_grupo».
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Propuesta = {}
SNF.Propuesta = Propuesta

Propuesta.MAX_IDS = 200
local MAX_NOMBRE = 40 -- letras (la app ya lo comprueba; aquí se corta por si acaso)
local MAX_BYTES_NOMBRE = 60 -- el tope de Grupos (corta en bytes): así nunca parte un carácter UTF-8
local MAX_CLAVE = 100

local pendiente = nil

local function quitarEspacios(t)
  t = string.gsub(t, "^%s+", "")
  return (string.gsub(t, "%s+$", ""))
end

-- El nombre limpio o nil: sin `|` (los códigos de escape del juego: color, enlaces, texturas), sin espacios a los lados,
-- y como mucho MAX_NOMBRE letras y MAX_BYTES_NOMBRE bytes, cortado entre caracteres.
local function nombreValido(nombre)
  if type(nombre) ~= "string" then
    return nil
  end
  nombre = quitarEspacios((string.gsub(nombre, "|", "")))
  if nombre == "" then
    return nil
  end
  local letras, fin = 0, 0
  for inicio, letra in string.gmatch(nombre, "()([%z\1-\127\194-\244][\128-\191]*)") do
    letras = letras + 1
    local hasta = inicio + #letra - 1
    if letras > MAX_NOMBRE or hasta > MAX_BYTES_NOMBRE then
      break
    end
    fin = hasta
  end
  nombre = quitarEspacios(string.sub(nombre, 1, fin))
  return nombre ~= "" and nombre or nil
end

local function esId(v)
  return type(v) == "number" and v == v and v >= 1 and v == math.floor(v) and v < 2 ^ 31
end

-- Copia de la regla con solo los campos numéricos conocidos (los de la plantilla), o nil si no vale.
local function reglaValida(regla)
  if type(regla) ~= "table" then
    return nil
  end
  local copia, alguno = {}, false
  for campo in pairs(SNF.Reglas.PLANTILLA) do
    if regla[campo] ~= nil then
      copia[campo] = regla[campo]
      alguno = true
    end
  end
  if not alguno or not SNF.Reglas.valida(copia) then
    return nil
  end
  return copia
end

local function grupoValido(grupo)
  if type(grupo) ~= "table" then
    return nil
  end
  local nombre = nombreValido(grupo.nombre)
  if not nombre or type(grupo.objetos) ~= "table" then
    return nil
  end
  local objetos, vistos = {}, {}
  for _, id in ipairs(grupo.objetos) do
    if not esId(id) then
      return nil -- la app solo manda ids buenos: algo raro, mejor no proponer nada
    end
    if not vistos[id] and #objetos < Propuesta.MAX_IDS then
      vistos[id] = true
      objetos[#objetos + 1] = id
    end
  end
  if #objetos == 0 then
    return nil
  end
  return {nombre = nombre, objetos = objetos}
end

-- La que se comprueba; nil si no vale.
local function comprobar(comercio)
  if type(comercio) ~= "table" then
    return nil
  end
  local propuesta = {}
  if comercio.grupo ~= nil then
    propuesta.grupo = grupoValido(comercio.grupo)
    if not propuesta.grupo then
      return nil
    end
  end
  if comercio.regla ~= nil then
    propuesta.regla = reglaValida(comercio.regla)
    if not propuesta.regla then
      return nil
    end
    if not propuesta.grupo then
      local para = comercio.paraGrupo
      local clave = type(para) == "table" and type(para.clave) == "string" and para.clave or nil
      if not clave or clave == "" or #clave > MAX_CLAVE then
        return nil
      end
      propuesta.paraGrupo = {clave = clave, nombre = nombreValido(para.nombre) or clave}
    end
  end
  if not propuesta.grupo and not propuesta.regla then
    return nil
  end
  return propuesta
end

-- Una propuesta nueva sustituye siempre a la anterior: la pendiente se olvida antes de comprobarla (aunque la nueva no
-- valga) y se emite el evento en los dos casos, para que el chat repinte.
function Propuesta.proponer(comercio)
  pendiente = nil
  local propuesta = comprobar(comercio)
  pendiente = propuesta
  SNF.Eventos.emitir("SNF_COMERCIO_PROPUESTA", propuesta)
  return propuesta ~= nil
end

function Propuesta.pendiente()
  return pendiente
end

function Propuesta.descartar()
  pendiente = nil
end

-- ¿Sigue existiendo el grupo (propio o de la app)?
local function existeGrupo(clave)
  for _, g in ipairs(SNF.Grupos.lista()) do
    if g.clave == clave then
      return true
    end
  end
  return false
end

function Propuesta.aplicar()
  local p = pendiente
  pendiente = nil
  if type(p) ~= "table" then
    return false, "nada"
  end
  -- La regla se comprueba antes de crear nada: o se aplica todo o nada.
  if p.regla and not SNF.Reglas.valida(p.regla) then
    return false, "regla"
  end
  if p.grupo then
    local clave = SNF.Grupos.crear(p.grupo.nombre)
    if not clave then
      return false, "grupo"
    end
    for _, id in ipairs(p.grupo.objetos) do
      SNF.Grupos.anadir(clave, id)
    end
    if p.regla then
      SNF.Reglas.poner(clave, p.regla)
    end
    return true, clave
  end
  local clave = p.paraGrupo and p.paraGrupo.clave
  if not clave or not existeGrupo(clave) then
    return false, "sin_grupo"
  end
  if not SNF.Reglas.poner(clave, p.regla) then
    return false, "regla"
  end
  return true, clave
end
