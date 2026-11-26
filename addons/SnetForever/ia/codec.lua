-- Adaptado de NeverQuestAlone (MIT; © 2026 chelinho139 y los autores de NeverQuestAlone), addon/NeverQuestAlone/Codec.lua, commit 3a9b93c.
-- SnetForever: códec de la franja de cuadritos de colores (fase 4). Lua puro, sin APIs de WoW.
--
-- Una trama son bytes seguidos:
--   [0x53 0x46] [trama hi, lo] [len hi, lo] [carga: len bytes] [Fletcher-16 s1, s2]
-- La suma cubre desde «trama» hasta el final de la carga. Los bytes se empaquetan de 3 en 3 bits,
-- el bit más alto primero, y cada celda se pinta como un cuadrito cuyos canales R, G y B están
-- encendidos o apagados del todo (bit 2 = R, bit 1 = G, bit 0 = B). Los colores primarios puros
-- sobreviven a cualquier gamma o contraste, no así los tonos intermedios. La app los lee de la pantalla.
-- La magia (0x53 0x46) es la de SnetForever: no se lee con la de NeverQuestAlone ni al revés.
local _, SNF = ...

local Codec = {}
SNF.Codec = Codec

Codec.MAGIA = {0x53, 0x46}
Codec.BITS = 3
Codec.MAX_CARGA = 1400
Codec.CELDAS_FILA = 200
Codec.FILAS_MAX = 20
Codec.CELDA = 2

local floor = math.floor

-- Suma de comprobación Fletcher-16 de bytes[desde..hasta].
function Codec.fletcher16(bytes, desde, hasta)
  local s1, s2 = 0, 0
  for i = desde, hasta do
    s1 = (s1 + bytes[i]) % 255
    s2 = (s2 + s1) % 255
  end
  return s1, s2
end

-- Los bytes de la trama, guardados entre llamadas: en cada una solo se leen los primeros 8 + len.
local trabajo = {}

-- Devuelve la lista de celdas (valores 0..7) y el número de bytes codificados.
-- «destino»: una tabla que se rellena y se devuelve en vez de crear otra (la franja pasa siempre la misma,
-- así una trama no genera basura); las celdas que sobran de la trama anterior se borran, de modo que
-- #celdas es el de esta trama en los dos casos.
function Codec.codificar(id, carga, destino)
  local len = #carga
  if len > Codec.MAX_CARGA then
    error(string.format("SnetForever.Codec: carga de %d bytes, el máximo es %d", len, Codec.MAX_CARGA), 2)
  end
  local bytes = trabajo
  bytes[1], bytes[2] = Codec.MAGIA[1], Codec.MAGIA[2]
  bytes[3], bytes[4] = floor(id / 256) % 256, id % 256
  bytes[5], bytes[6] = floor(len / 256) % 256, len % 256
  for i = 1, len do
    bytes[6 + i] = carga:byte(i)
  end
  local s1, s2 = Codec.fletcher16(bytes, 3, 6 + len)
  local nb = 8 + len
  bytes[nb - 1], bytes[nb] = s1, s2

  local BITS = Codec.BITS
  local base = 2 ^ BITS
  local celdas = destino or {}
  local antes, n = #celdas, 0
  local acc, nbits = 0, 0
  for i = 1, nb do
    acc = acc * 256 + bytes[i]
    nbits = nbits + 8
    while nbits >= BITS do
      local desp = nbits - BITS
      n = n + 1
      celdas[n] = floor(acc / 2 ^ desp) % base
      nbits = desp
      acc = acc % 2 ^ nbits
    end
  end
  if nbits > 0 then
    n = n + 1
    celdas[n] = (acc * 2 ^ (BITS - nbits)) % base
  end
  for i = n + 1, antes do celdas[i] = nil end
  return celdas, nb
end

-- Color de una celda: cada canal encendido (1) o apagado (0) del todo.
function Codec.color(v)
  local r = floor(v / 4) % 2
  local g = floor(v / 2) % 2
  local b = v % 2
  return r, g, b
end
