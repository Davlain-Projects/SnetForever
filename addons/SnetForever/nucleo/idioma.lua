-- SnetForever: idioma. L.idioma() decide es/en, L.t() y L.de() dan los textos. Las tablas de textos las rellenan
-- textos/es.lua y textos/en.lua (se cargan después de este archivo).
local _, SNF = ...

local L = {}
SNF.L = L
L.tablas = {es = {}, en = {}}

-- "es" o "en". El ajuste `idioma` vale "cliente" (el del cliente: esES y esMX dan español, los demás inglés),
-- "es" o "en". Antes de que Guardado.preparar() haya corrido se sigue al cliente.
function L.idioma()
  local ajuste = SNF.Ajustes and SNF.Ajustes.get("idioma") or "cliente"
  if ajuste == "es" or ajuste == "en" then
    return ajuste
  end
  local cliente = GetLocale()
  if cliente == "esES" or cliente == "esMX" then
    return "es"
  end
  return "en"
end

-- Texto de la clave en el idioma activo; si falta, el inglés; si falta también, la propia clave.
-- Con argumentos se da formato con string.format; sin ellos el texto sale tal cual (puede llevar un «%»).
function L.t(clave, ...)
  local texto = L.tablas[L.idioma()][clave] or L.tablas.en[clave] or clave
  if select("#", ...) > 0 then
    return string.format(texto, ...)
  end
  return texto
end

-- Texto bilingüe {en = ..., es = ...} (el formato de los datos de la fase 1): el del idioma activo, o el inglés
-- si falta el español; si solo hay español, ese. Una cadena pasa tal cual.
function L.de(bilingue)
  if type(bilingue) ~= "table" then
    return bilingue
  end
  if L.idioma() == "es" then
    return bilingue.es or bilingue.en
  end
  return bilingue.en or bilingue.es
end
