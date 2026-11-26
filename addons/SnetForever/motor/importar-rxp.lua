-- SnetForever: importar guías RXP desde el juego («Mis guías: importar de RestedXP…», /snet importar).
--
-- El juego no lee archivos. En el PC, `npm run importar:rxp -- --juego` convierte las guías elegidas con el mismo
-- conversor que el addon SnetForever_RutasRXP y deja un paquete de texto en partes (tools/conversor/src/rxp/paquete.js).
-- El jugador pega cada parte en la ventana (ui/importar-rxp.lua). Cada parte es una línea:
--
--   SNFRXP1:<id>:<k>:<n>:<suma del paquete>:<suma de la parte>:<trozo>
--
-- El paquete entero es una tabla literal de Lua con solo ASCII imprimible: {f, esquema, version, guias, alias, resumen}.
-- Las guías van en el formato de la fase 1 con sus claves «RXP\…» (ids de paso, filtros, requisitos, eventos, variantes
-- con su alias y la ruta original). No se ejecuta nunca: lo lee un analizador propio que solo admite tablas, cadenas
-- (con los escapes \\ \" \n \r y \ddd), números, true y false. Cualquier otra cosa es un error.
--
-- Nada a medias: sin todas las partes, con una suma que no cuadra, con un dato que no se entiende o con un resumen que no
-- coincide con lo que trae, no se guarda nada y se dice por qué. Solo «confirmar» guarda, y guarda el paquete entero.
--
-- Dónde se guarda: SnetForeverPJ.rxp = {v = 1, orden = {id, ...}, paquetes = {[id] = {texto, version, cuando, claves,
-- guias, pasos}}}. Es el texto del paquete ya comprobado, no las tablas: así las SavedVariables no crecen (WoW escribe
-- una tabla en muchas líneas) y la app, que lee el SnetForever.lua de la cuenta con un tope de 5 MB, no lo ve. Por eso
-- la importación es de este personaje. Las guías se leen una vez por sesión, la primera vez que se piden (Datos.guia,
-- Datos.claves). Un paquete posterior gana al anterior en las claves que comparten, y las importadas ganan a las del
-- addon SnetForever_RutasRXP: el progreso va por la clave de la guía y el id del paso, que son los mismos.
--
-- ImportarRXP.recibir(texto) -> estado | nil, error     una parte pegada. error = {clave de texto, argumentos...}
-- ImportarRXP.estado() -> {id, total, recibidas, faltan, fase, resumen?, error?}   fase: "vacio", "partes",
--                                                   "comprobando", "listo" o "error"
-- ImportarRXP.comprobar(alTerminar?)                   con todas las partes: suma, lectura y validación en trozos
--                                                   (C_Timer; en combate espera a salir). alTerminar(estado).
-- ImportarRXP.confirmar() -> resumen | nil, error      guarda el paquete comprobado y recarga la guía si era suya.
-- ImportarRXP.cancelar()                               olvida las partes y el paquete comprobado.
-- ImportarRXP.paquetes() -> {{id, version, cuando, guias, pasos}, ...}   los guardados, el más reciente al final.
-- ImportarRXP.quitar(id) -> boolean                    quita un paquete guardado.
-- ImportarRXP.datos() -> {guias, alias} | nil          para Datos: las guías de los paquetes guardados.
-- ImportarRXP.anunciar()                               al entrar: los paquetes guardados que ya no se pueden leer.
-- ImportarRXP.leer(texto) -> datos | nil, error        el analizador (para las pruebas).
local _, SNF = ...
local ImportarRXP = {}
SNF.ImportarRXP = ImportarRXP

local L = SNF.L

local CABECERA = "SNFRXP1"
local FORMATO = 1
local PREFIJO_CLAVE = "RXP\\"
local PREFIJO_GRUPO = "Mis guías RXP · "
local MAX_PARTES = 99
local MAX_PARTE = 100000
local MAX_TEXTO = 4000000 -- caracteres de todos los paquetes guardados de un personaje
local MAX_PROFUNDIDAD = 40
local TRABAJO_POR_TROZO = 4000 -- valores leídos (o bytes sumados / 16) entre pausa y pausa
local MAX_LISTA = 8 -- claves que se nombran en un aviso

local byte, sub, find, char = string.byte, string.sub, string.find, string.char

local partes = nil -- {id, total, suma, trozos = {[k] = texto}, recibidas, longitud}
local fase = "vacio"
local comprobado = nil -- {id, datos, texto, resumen}
local fallo = nil -- {clave, ...}
local trabajo = nil -- coroutine en marcha
local cargadas = nil -- {guias, alias, malos = {id, ...}} de los paquetes guardados

local function falla(clave, ...)
  error({clave, ...}, 0)
end

---------------------------------------------------------------------------------------------------
-- Suma Adler-32 (la misma que el conversor), por trozos para poder pausar.
---------------------------------------------------------------------------------------------------

local function adler(texto, a, b, desde, hasta)
  for i = desde, hasta do
    a = (a + byte(texto, i)) % 65521
    b = (b + a) % 65521
  end
  return a, b
end

local function hexAdler(a, b)
  return string.format("%08x", b * 65536 + a)
end

local function sumaDe(texto)
  return hexAdler(adler(texto, 1, 0, 1, #texto))
end

---------------------------------------------------------------------------------------------------
-- Analizador de tablas literales (solo datos).
---------------------------------------------------------------------------------------------------

local ESCAPES = {n = "\n", r = "\r", ["\\"] = "\\", ['"'] = '"'}

local function nuevoLector(texto, cooperativo)
  return {s = texto, i = 1, n = #texto, trabajo = 0, cooperativo = cooperativo}
end

local function pausa(lx, cuanto)
  lx.trabajo = lx.trabajo + (cuanto or 1)
  if lx.cooperativo and lx.trabajo >= TRABAJO_POR_TROZO then
    lx.trabajo = 0
    coroutine.yield()
  end
end

local function espacios(lx)
  lx.i = find(lx.s, "[^ \t\r\n]", lx.i) or (lx.n + 1)
end

local function errorEn(lx, que)
  falla("IMPORTAR_RXP_ERR_LECTURA", lx.i, que)
end

local leerValor

local function leerCadena(lx)
  local s, trozos = lx.s, {}
  local i = lx.i + 1
  while true do
    local j = find(s, '["\\]', i)
    if not j then
      errorEn(lx, "cadena sin cerrar")
    end
    local llano = sub(s, i, j - 1)
    if find(llano, "%c") then
      lx.i = i
      errorEn(lx, "carácter de control en una cadena")
    end
    trozos[#trozos + 1] = llano
    if byte(s, j) == 34 then -- «"»
      lx.i = j + 1
      return table.concat(trozos)
    end
    local c = sub(s, j + 1, j + 1)
    if ESCAPES[c] then
      trozos[#trozos + 1] = ESCAPES[c]
      i = j + 2
    else
      local cifras = string.match(s, "^%d%d?%d?", j + 1)
      local valor = cifras and tonumber(cifras)
      if not valor or valor > 255 then
        lx.i = j
        errorEn(lx, "escape no admitido")
      end
      trozos[#trozos + 1] = char(valor)
      i = j + 1 + #cifras
    end
  end
end

local function leerNumero(lx)
  local s, i = lx.s, lx.i
  local entero = string.match(s, "^%-?%d+", i)
  if not entero then
    errorEn(lx, "número")
  end
  local fin = i + #entero
  local decimales = string.match(s, "^%.%d+", fin)
  if decimales then
    fin = fin + #decimales
  end
  local exponente = string.match(s, "^[eE][%+%-]?%d+", fin)
  if exponente then
    fin = fin + #exponente
  end
  local valor = tonumber(sub(s, i, fin - 1))
  if not valor or valor ~= valor or valor == math.huge or valor == -math.huge then
    errorEn(lx, "número")
  end
  lx.i = fin
  return valor
end

local function leerTabla(lx, profundidad)
  if profundidad > MAX_PROFUNDIDAD then
    errorEn(lx, "demasiadas tablas anidadas")
  end
  local s = lx.s
  local t, posicion = {}, 0
  lx.i = lx.i + 1
  while true do
    espacios(lx)
    local c = byte(s, lx.i)
    if c == 125 then -- «}»
      lx.i = lx.i + 1
      return t
    end
    local clave
    if c == 91 then -- «[»: [clave]=valor
      lx.i = lx.i + 1
      espacios(lx)
      clave = leerValor(lx, profundidad + 1)
      if type(clave) ~= "string" and (type(clave) ~= "number" or clave ~= math.floor(clave)) then
        errorEn(lx, "clave")
      end
      espacios(lx)
      if byte(s, lx.i) ~= 93 then
        errorEn(lx, "«]»")
      end
      lx.i = lx.i + 1
      espacios(lx)
      if byte(s, lx.i) ~= 61 then
        errorEn(lx, "«=»")
      end
      lx.i = lx.i + 1
    else
      local nombre = string.match(s, "^[%a_][%w_]*", lx.i)
      if nombre and nombre ~= "true" and nombre ~= "false" then
        lx.i = lx.i + #nombre
        espacios(lx)
        if byte(s, lx.i) ~= 61 or byte(s, lx.i + 1) == 61 then
          errorEn(lx, "«=»")
        end
        lx.i = lx.i + 1
        clave = nombre
      end
    end
    espacios(lx)
    local valor = leerValor(lx, profundidad + 1)
    if clave == nil then
      posicion = posicion + 1
      clave = posicion
    end
    if t[clave] ~= nil then
      errorEn(lx, "clave repetida")
    end
    t[clave] = valor
    espacios(lx)
    c = byte(s, lx.i)
    if c == 44 or c == 59 then -- «,» o «;»
      lx.i = lx.i + 1
    elseif c ~= 125 then
      errorEn(lx, "«,» o «}»")
    end
  end
end

leerValor = function(lx, profundidad)
  pausa(lx)
  local s, i = lx.s, lx.i
  local c = byte(s, i)
  if c == 123 then -- «{»
    return leerTabla(lx, profundidad)
  elseif c == 34 then
    return leerCadena(lx)
  elseif c == 45 or (c and c >= 48 and c <= 57) then
    return leerNumero(lx)
  elseif sub(s, i, i + 3) == "true" and not find(s, "^[%w_]", i + 4) then
    lx.i = i + 4
    return true
  elseif sub(s, i, i + 4) == "false" and not find(s, "^[%w_]", i + 5) then
    lx.i = i + 5
    return false
  end
  errorEn(lx, "valor")
end

local function leerTodo(texto, cooperativo)
  local lx = nuevoLector(texto, cooperativo)
  espacios(lx)
  if byte(texto, lx.i) ~= 123 then
    errorEn(lx, "«{»")
  end
  local datos = leerValor(lx, 1)
  espacios(lx)
  if lx.i <= lx.n then
    errorEn(lx, "texto de más al final")
  end
  return datos
end

function ImportarRXP.leer(texto)
  local ok, datos = pcall(leerTodo, texto, false)
  if ok then
    return datos
  end
  return nil, type(datos) == "table" and datos or {"IMPORTAR_RXP_ERR_INTERNO", tostring(datos)}
end

---------------------------------------------------------------------------------------------------
-- Validación: todo o nada.
---------------------------------------------------------------------------------------------------

local function empieza(texto, prefijo)
  return type(texto) == "string" and sub(texto, 1, #prefijo) == prefijo
end

local function cuantas(t)
  local n = 0
  for _ in pairs(t) do
    n = n + 1
  end
  return n
end

local function esLista(t)
  return type(t) == "table" and cuantas(t) == #t
end

local function tipoConocido(t)
  local Elementos = SNF.Elementos
  return Elementos.def(t) ~= nil or Elementos.INFORMATIVOS[t] == true
end

-- Comprueba una guía; devuelve cuántos pasos trae. `desconocidos[t]` cuenta los elementos de tipos que este addon no
-- conoce: se guardan igual (como en el addon instalado, no bloquean), pero el resumen los nombra.
local function validarGuia(clave, g, desconocidos, lx)
  local function mala(que)
    falla("IMPORTAR_RXP_ERR_GUIA", clave, que)
  end
  if not empieza(clave, PREFIJO_CLAVE) then
    falla("IMPORTAR_RXP_ERR_CLAVE", tostring(clave))
  end
  if type(g) ~= "table" or g.clave ~= clave then mala("clave") end
  if not empieza(g.grupo, PREFIJO_GRUPO) then mala("grupo") end
  if type(g.nombre) ~= "string" or g.nombre == "" then mala("nombre") end
  local nv = g.niveles
  if type(nv) ~= "table" or type(nv[1]) ~= "number" or type(nv[2]) ~= "number" then mala("niveles") end
  if g.siguientes ~= nil and not esLista(g.siguientes) then mala("siguientes") end
  if g.variantes ~= nil and not esLista(g.variantes) then mala("variantes") end
  if not esLista(g.pasos) then mala("pasos") end
  local ids = {}
  for n, p in ipairs(g.pasos) do
    pausa(lx)
    if type(p) ~= "table" or p.n ~= n or type(p.id) ~= "string" or p.id == "" then
      mala(string.format("paso %d", n))
    end
    if ids[p.id] then
      mala(string.format("paso %d: id repetido", n))
    end
    ids[p.id] = true
    if not esLista(p.elementos) then
      mala(string.format("paso %d: elementos", n))
    end
    for _, el in ipairs(p.elementos) do
      if type(el) ~= "table" or type(el.t) ~= "string" then
        mala(string.format("paso %d: elemento", n))
      end
      if not tipoConocido(el.t) then
        desconocidos[el.t] = (desconocidos[el.t] or 0) + 1
      end
    end
  end
  return #g.pasos
end

local function lista(claves)
  table.sort(claves)
  local salida = {}
  for i = 1, math.min(#claves, MAX_LISTA) do
    salida[i] = claves[i]
  end
  local texto = table.concat(salida, ", ")
  if #claves > MAX_LISTA then
    texto = texto .. " " .. L.t("IMPORTAR_RXP_Y_MAS", #claves - MAX_LISTA)
  end
  return texto
end

-- Comprueba los datos leídos y devuelve el resumen para la ventana. `lx` solo sirve para pausar.
local function validar(datos, lx)
  if type(datos) ~= "table" or datos.f ~= FORMATO then
    falla("IMPORTAR_RXP_ERR_FORMATO")
  end
  if datos.esquema ~= SNF.Datos.ESQUEMA then
    falla("IMPORTAR_RXP_ERR_ESQUEMA", tostring(datos.esquema), SNF.Datos.ESQUEMA)
  end
  if type(datos.guias) ~= "table" or type(datos.resumen) ~= "table" then
    falla("IMPORTAR_RXP_ERR_FORMATO")
  end
  if datos.alias ~= nil and type(datos.alias) ~= "table" then
    falla("IMPORTAR_RXP_ERR_FORMATO")
  end
  local guias, pasos, desconocidos = 0, 0, {}
  for clave, g in pairs(datos.guias) do
    guias = guias + 1
    pasos = pasos + validarGuia(clave, g, desconocidos, lx)
  end
  for variante, principal in pairs(datos.alias or {}) do
    if not empieza(variante, PREFIJO_CLAVE) or type(principal) ~= "string" or not datos.guias[principal] then
      falla("IMPORTAR_RXP_ERR_ALIAS", tostring(variante))
    end
  end
  local r = datos.resumen
  if guias == 0 or r.guias ~= guias or r.pasos ~= pasos then
    falla("IMPORTAR_RXP_ERR_RESUMEN", guias, pasos, tostring(r.guias), tostring(r.pasos))
  end
  local tipos = {}
  for t, n in pairs(desconocidos) do
    tipos[#tipos + 1] = string.format("%s (%d)", t, n)
  end
  return {guias = guias, pasos = pasos, version = datos.version, desconocidos = tipos}
end

-- Lo que el resumen añade al mirar lo que ya hay: guías que se sustituyen y destinos que no se encuentran.
local function completarResumen(resumen, datos)
  local yaImportadas, delAddon, faltan = {}, {}, {}
  local actuales = ImportarRXP.datos()
  for clave in pairs(datos.guias) do
    if actuales and actuales.guias[clave] then
      yaImportadas[#yaImportadas + 1] = clave
    elseif SNF.Datos.guia(clave) then
      delAddon[#delAddon + 1] = clave
    end
  end
  for _, clave in ipairs(esLista(datos.resumen.fuera) and datos.resumen.fuera or {}) do
    if type(clave) == "string" and not SNF.Datos.guia(clave) then
      faltan[#faltan + 1] = clave
    end
  end
  resumen.sustituye = #yaImportadas
  resumen.delAddon = #delAddon
  resumen.faltan = faltan
  resumen.faltanTexto = #faltan > 0 and lista(faltan) or nil
  resumen.desconocidosTexto = #resumen.desconocidos > 0 and lista(resumen.desconocidos) or nil
  return resumen
end

---------------------------------------------------------------------------------------------------
-- Paquetes guardados
---------------------------------------------------------------------------------------------------

local function guardados()
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj) ~= "table" then
    return nil
  end
  if type(pj.rxp) ~= "table" or pj.rxp.v ~= 1 or type(pj.rxp.paquetes) ~= "table" or type(pj.rxp.orden) ~= "table" then
    return nil
  end
  return pj.rxp
end

local function prepararGuardados()
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj) ~= "table" then
    return nil
  end
  if not guardados() then
    pj.rxp = {v = 1, orden = {}, paquetes = {}}
  end
  return pj.rxp
end

local function aplicar(destino, datos)
  for clave, g in pairs(datos.guias) do
    destino.guias[clave] = g
  end
  for variante, principal in pairs(datos.alias or {}) do
    destino.alias[variante] = principal
  end
end

function ImportarRXP.datos()
  if cargadas then
    return cargadas
  end
  local rxp = guardados()
  if not rxp then
    return nil
  end
  local salida = {guias = {}, alias = {}, malos = {}}
  for _, id in ipairs(rxp.orden) do
    local p = rxp.paquetes[id]
    local ok, datos = pcall(function()
      if type(p) ~= "table" or type(p.texto) ~= "string" then
        falla("IMPORTAR_RXP_ERR_FORMATO")
      end
      local leidos = leerTodo(p.texto, false)
      validar(leidos, nuevoLector("", false))
      return leidos
    end)
    if ok then
      aplicar(salida, datos)
    else
      salida.malos[#salida.malos + 1] = id
    end
  end
  cargadas = salida
  return salida
end

function ImportarRXP.paquetes()
  local rxp = guardados()
  local salida = {}
  for _, id in ipairs(rxp and rxp.orden or {}) do
    local p = rxp.paquetes[id]
    if type(p) == "table" then
      salida[#salida + 1] = {id = id, version = p.version, cuando = p.cuando, guias = p.guias, pasos = p.pasos}
    end
  end
  return salida
end

local function sinPaquete(rxp, id)
  for k = #rxp.orden, 1, -1 do
    if rxp.orden[k] == id then
      table.remove(rxp.orden, k)
    end
  end
  rxp.paquetes[id] = nil
end

-- Si la guía del motor es de las que cambiaron, se vuelve a cargar con el progreso guardado; si ya no existe, la del
-- personaje por defecto.
local function recargarSiHaceFalta(claves)
  local actual = SNF.Motor.estado().clave
  if not actual or not claves[actual] then
    return
  end
  if SNF.Datos.guia(actual) then
    SNF.Guias.cargar(actual, nil, true)
  else
    local otra = SNF.Guias.porDefecto()
    if otra then
      SNF.Guias.cargar(otra)
    end
  end
end

function ImportarRXP.quitar(id)
  local rxp = guardados()
  if not rxp or not rxp.paquetes[id] then
    return false
  end
  local antes = ImportarRXP.datos()
  local claves = {}
  for clave in pairs(antes and antes.guias or {}) do
    claves[clave] = true
  end
  sinPaquete(rxp, id)
  cargadas = nil
  recargarSiHaceFalta(claves)
  return true
end

function ImportarRXP.anunciar()
  local d = ImportarRXP.datos()
  if d and #d.malos > 0 then
    print(L.t("IMPORTAR_RXP_GUARDADO_ROTO", table.concat(d.malos, ", ")))
  end
end

---------------------------------------------------------------------------------------------------
-- Partes, comprobación y confirmación
---------------------------------------------------------------------------------------------------

function ImportarRXP.estado()
  local faltan = {}
  if partes then
    for k = 1, partes.total do
      if not partes.trozos[k] then
        faltan[#faltan + 1] = k
      end
    end
  end
  return {
    id = partes and partes.id or (comprobado and comprobado.id), total = partes and partes.total or 0,
    recibidas = partes and partes.recibidas or 0, faltan = faltan, fase = fase,
    resumen = comprobado and comprobado.resumen or nil, error = fallo,
  }
end

function ImportarRXP.cancelar()
  partes, comprobado, fallo, trabajo = nil, nil, nil, nil
  fase = "vacio"
end

local function equivocada(...)
  return nil, {...}
end

function ImportarRXP.recibir(texto)
  if type(texto) ~= "string" then
    return equivocada("IMPORTAR_RXP_ERR_CABECERA")
  end
  -- Un salto de línea puede venir del editor. Un espacio al final del trozo forma parte de la suma.
  texto = string.gsub(string.gsub(texto, "^%s+", ""), "[\r\n]+$", "")
  local id, k, n, suma, sumaParte, trozo = string.match(texto,
    "^" .. CABECERA .. ":(%x%x%x%x%x%x%x%x):(%d+):(%d+):(%x%x%x%x%x%x%x%x):(%x%x%x%x%x%x%x%x):(.+)$")
  k, n = tonumber(k), tonumber(n)
  if not id or not k or not n or n < 1 or n > MAX_PARTES or k < 1 or k > n then
    return equivocada("IMPORTAR_RXP_ERR_CABECERA")
  end
  if #trozo > MAX_PARTE or sumaDe(trozo) ~= sumaParte then
    return equivocada("IMPORTAR_RXP_ERR_SUMA_PARTE", k, n)
  end
  if trabajo then
    return equivocada("IMPORTAR_RXP_ERR_OCUPADO")
  end
  if comprobado and comprobado.id == id then
    return ImportarRXP.estado() -- una parte del paquete ya comprobado: no cambia nada
  end
  if not partes or partes.id ~= id or partes.total ~= n or partes.suma ~= suma then
    -- Otro paquete: el que estaba a medias se olvida entero (nunca se mezclan partes).
    partes = {id = id, total = n, suma = suma, trozos = {}, recibidas = 0, longitud = 0}
    comprobado, fallo = nil, nil
  end
  if not partes.trozos[k] then
    local longitud = partes.longitud + #trozo
    if longitud > MAX_TEXTO then
      return equivocada("IMPORTAR_RXP_ERR_TAMANO_PAQUETE", longitud, MAX_TEXTO)
    end
    partes.trozos[k] = trozo
    partes.recibidas = partes.recibidas + 1
    partes.longitud = longitud
  end
  fase = "partes"
  return ImportarRXP.estado()
end

-- El trabajo de comprobar, dentro de una corrutina: suma del paquete, lectura y validación.
local function comprobarTodo(p)
  local texto = table.concat(p.trozos, "", 1, p.total)
  local a, b = 1, 0
  local paso = TRABAJO_POR_TROZO * 16
  for desde = 1, #texto, paso do
    a, b = adler(texto, a, b, desde, math.min(#texto, desde + paso - 1))
    coroutine.yield()
  end
  if hexAdler(a, b) ~= p.suma then
    falla("IMPORTAR_RXP_ERR_SUMA")
  end
  local lx = nuevoLector(texto, true)
  espacios(lx)
  if byte(texto, lx.i) ~= 123 then
    errorEn(lx, "«{»")
  end
  local datos = leerValor(lx, 1)
  espacios(lx)
  if lx.i <= lx.n then
    errorEn(lx, "texto de más al final")
  end
  local resumen = validar(datos, lx)
  return {id = p.id, datos = datos, texto = texto, resumen = completarResumen(resumen, datos)}
end

-- La hora del juego (el cliente de Forever no tiene la librería os): GetServerTime() o time().
local function ahora()
  for _, nombre in ipairs({"GetServerTime", "time"}) do
    local f = rawget(_G, nombre)
    if type(f) == "function" then
      local ok, t = pcall(f)
      if ok and type(t) == "number" then
        return t
      end
    end
  end
  return nil
end

local function enCombate()
  local f = rawget(_G, "InCombatLockdown")
  return type(f) == "function" and f() == true
end

local alTerminar
local function avanzar()
  local co = trabajo
  if not co then
    return
  end
  if enCombate() then
    return -- sigue al salir del combate (PLAYER_REGEN_ENABLED)
  end
  local ok, resultado = coroutine.resume(co)
  if co ~= trabajo then
    return -- se canceló mientras tanto
  end
  if not ok then
    trabajo, fase = nil, "error"
    fallo = type(resultado) == "table" and resultado or {"IMPORTAR_RXP_ERR_INTERNO", tostring(resultado)}
  elseif coroutine.status(co) == "dead" then
    trabajo, fase, comprobado = nil, "listo", resultado
  else
    C_Timer.After(0, avanzar)
    return
  end
  if alTerminar then
    local f = alTerminar
    alTerminar = nil
    f(ImportarRXP.estado())
  end
end

SNF.escuchar("PLAYER_REGEN_ENABLED", function()
  if trabajo then
    avanzar()
  end
end)

function ImportarRXP.comprobar(cuandoTermine)
  if not partes or partes.recibidas < partes.total or trabajo then
    return false
  end
  local p = partes
  comprobado, fallo, fase = nil, nil, "comprobando"
  alTerminar = cuandoTermine
  trabajo = coroutine.create(function()
    return comprobarTodo(p)
  end)
  avanzar()
  return true
end

function ImportarRXP.confirmar()
  if fase ~= "listo" or not comprobado then
    return nil, {"IMPORTAR_RXP_ERR_SIN_COMPROBAR"}
  end
  local rxp = prepararGuardados()
  if not rxp then
    return nil, {"IMPORTAR_RXP_ERR_INTERNO", "SnetForeverPJ"}
  end
  local total = #comprobado.texto
  for _, id in ipairs(rxp.orden) do
    local p = rxp.paquetes[id]
    if id ~= comprobado.id and type(p) == "table" and type(p.texto) == "string" then
      total = total + #p.texto
    end
  end
  if total > MAX_TEXTO then
    return nil, {"IMPORTAR_RXP_ERR_TAMANO", total, MAX_TEXTO}
  end
  local actuales = ImportarRXP.datos() or {guias = {}, alias = {}, malos = {}}
  local claves, lista = {}, {}
  for clave in pairs(comprobado.datos.guias) do
    claves[clave] = true
    lista[#lista + 1] = clave
  end
  table.sort(lista)
  sinPaquete(rxp, comprobado.id)
  rxp.orden[#rxp.orden + 1] = comprobado.id
  local resumen = comprobado.resumen
  rxp.paquetes[comprobado.id] = {
    texto = comprobado.texto, version = comprobado.datos.version, cuando = ahora(), claves = lista,
    guias = resumen.guias, pasos = resumen.pasos,
  }
  aplicar(actuales, comprobado.datos)
  cargadas = actuales
  partes, comprobado, fallo, fase = nil, nil, nil, "vacio"
  recargarSiHaceFalta(claves)
  return resumen
end

-- Para las pruebas: vuelve a leer los paquetes guardados la próxima vez.
function ImportarRXP.olvidar()
  cargadas = nil
end
