-- SnetForever: inventario de la IA (fase 4). Lo que el addon sabe de las bolsas, el equipo y el banco del personaje, con
-- la forma `inv` de P2. Solo lee: nunca vende, usa, equipa, coge ni borra nada. Quien decide si se manda es Envio, con
-- el ajuste ia.inventario; este módulo solo lo prepara.
--
-- Inventario.bolsas() -> {libres, huecos, libresComponentes?, huecosComponentes?, objetos}   la mochila, las bolsas
--                              puestas y la de componentes (F2b: API.bolsasPropias; el llavero no). F2b: los huecos de la
--                              de componentes solo admiten componentes: no cuentan en huecos ni en libres; van aparte en
--                              huecosComponentes y libresComponentes (nil sin bolsa de componentes), y cada pareja cuadra
--                              por su lado. Sus objetos sí cuentan. objetos = {Obj…}
--                              agrupados por (id, l) con `b` = {{bolsa, hueco}…}: Obj = {id, n, ca?, pv?, nv?, h?, l = 0|1, b}.
--                              ca calidad, pv precio de venta, nv nivel del objeto, h equipLoc. Un objeto que el cliente
--                              aún no tiene en caché lleva solo id, n, l y b, y se pide con RequestLoadItemDataByID.
-- Inventario.equipo() -> {Eq…}                 los huecos 1 a 19: Eq = {s, id, nv?, ca?, st?, tt?}. st son las
--                              estadísticas del objeto; si el cliente no las da, tt lleva como mucho 12 líneas del tooltip
--                              de 60 bytes como mucho.
-- Inventario.banco() -> {fecha, objetos} | nil   el último banco visto (SnetForeverPJ.ia.banco): se apunta en
--                              BANKFRAME_OPENED, en BAG_UPDATE_DELAYED con el banco abierto y en BANKFRAME_CLOSED. Con el banco
--                              cerrado el cliente no deja leerlo, así que lo que no se pueda leer no borra lo apuntado.
-- Inventario.leer() -> inv                     {libres, huecos, libresComponentes?, huecosComponentes?, dinero, bolsas,
--                              equipo, banco?} (P2).
local _, SNF = ...

local Inventario = {}
SNF.Inventario = Inventario

local API = SNF.API
local floor = math.floor
local format = string.format

local PRIMER_HUECO_EQUIPO = 1
local ULTIMO_HUECO_EQUIPO = 19
local MAX_LINEAS_TOOLTIP = 12
local MAX_BYTES_LINEA = 60

-- Corta el texto a `max` bytes sin dejar a medias un carácter UTF-8.
local function recortarBytes(s, max)
  if #s <= max then
    return s
  end
  local corte = max
  while corte > 0 do
    local siguiente = s:byte(corte + 1)
    if siguiente and siguiente >= 128 and siguiente < 192 then
      corte = corte - 1
    else
      break
    end
  end
  return s:sub(1, corte)
end

-- Las bolsas que lleva el jugador: F2b, las de API.bolsasPropias (la mochila, las puestas y la de componentes), y cuáles
-- son de componentes ({[id] = true}).
local function bolsasJugador()
  return API.bolsasPropias()
end

-- Pide al cliente los datos de un objeto que aún no tiene en caché (una vez por lectura).
local function pedir(pedidos, id)
  if not pedidos[id] then
    pedidos[id] = true
    API.pedirObjeto(id)
  end
end

-- Recorre las bolsas dadas: libres, huecos y los Obj agrupados por (id, l), en el orden en que aparecen. F2b: los huecos
-- y libres de las bolsas de `aparte` ({[id] = true}, las de componentes) no van en huecos ni en libres: se dan en el cuarto
-- valor, {huecos, libres} (nil si no hay ninguna de esas bolsas). Sus objetos sí van con los demás.
local function recorrer(bolsas, aparte)
  local libres, huecos, enAparte = 0, 0, nil
  local objetos, porClave, pedidos = {}, {}, {}
  for _, bolsa in ipairs(bolsas) do
    local n = API.huecosBolsa(bolsa)
    if n and n > 0 then
      if aparte and aparte[bolsa] then
        enAparte = enAparte or {huecos = 0, libres = 0}
        enAparte.huecos = enAparte.huecos + n
        enAparte.libres = enAparte.libres + (API.libresBolsa(bolsa) or 0)
      else
        huecos = huecos + n
        libres = libres + (API.libresBolsa(bolsa) or 0)
      end
      for hueco = 1, floor(n) do
        local c = API.infoContenedor(bolsa, hueco)
        if c then
          local clave = format("%d|%d", c.id, c.l)
          local o = porClave[clave]
          if not o then
            o = {id = c.id, n = 0, l = c.l, b = {}}
            porClave[clave] = o
            objetos[#objetos + 1] = o
            local info = API.infoObjeto(c.id)
            if info then
              o.ca = info.ca or c.ca
              o.pv = info.pv
              if info.nv and info.nv > 0 then
                o.nv = info.nv
              end
              if info.h and info.h ~= "" then
                o.h = info.h
              end
            else
              pedir(pedidos, c.id)
            end
          end
          o.n = o.n + c.n
          o.b[#o.b + 1] = {bolsa, hueco}
        end
      end
    end
  end
  return libres, huecos, objetos, enAparte
end

function Inventario.bolsas()
  local libres, huecos, objetos, componentes = recorrer(bolsasJugador())
  return {libres = libres, huecos = huecos, libresComponentes = componentes and componentes.libres,
    huecosComponentes = componentes and componentes.huecos, objetos = objetos}
end

-- Hasta 12 líneas del tooltip, de 60 bytes como mucho cada una.
local function tooltip(hueco)
  local lineas = API.lineasEquipado(hueco)
  if not lineas or #lineas == 0 then
    return nil
  end
  local salida = {}
  for i = 1, #lineas do
    if i > MAX_LINEAS_TOOLTIP then
      break
    end
    salida[i] = recortarBytes(lineas[i], MAX_BYTES_LINEA)
  end
  return salida
end

function Inventario.equipo()
  local salida, pedidos = {}, {}
  for hueco = PRIMER_HUECO_EQUIPO, ULTIMO_HUECO_EQUIPO do
    local enlace = API.enlaceEquipado(hueco)
    local id = enlace and tonumber(enlace:match("item:(%d+)"))
    if id then
      local eq = {s = hueco, id = id}
      local info = API.infoObjeto(enlace)
      if info then
        if info.nv and info.nv > 0 then
          eq.nv = info.nv
        end
        eq.ca = info.ca
        eq.st = API.estadisticas(enlace)
        if not eq.st then
          eq.tt = tooltip(hueco)
        end
      else
        pedir(pedidos, id)
      end
      salida[#salida + 1] = eq
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Banco
---------------------------------------------------------------------------------------------------

local function guardadoIa()
  local pj = rawget(_G, "SnetForeverPJ")
  return type(pj) == "table" and type(pj.ia) == "table" and pj.ia or nil
end

-- Lee el banco ahora; nil si el cliente no lo deja leer (ninguna de sus bolsas tiene huecos). F2b: en Forever el banco
-- son pestañas (API.bolsasBanco) y la primera puede no tener nada puesto; por eso se miran todas, no solo la primera.
local function leerBanco()
  local _, huecos, objetos = recorrer(API.bolsasBanco())
  if huecos <= 0 then
    return nil
  end
  return {fecha = floor(API.horaServidor() or 0), objetos = objetos}
end

-- Apunta el banco leído. Al cerrarlo (`cerrando`), un banco que sale vacío no sustituye a lo apuntado: puede que el
-- cliente ya no deje leer los objetos aunque diga cuántos huecos tiene. Lo que se vacía de verdad con el banco abierto
-- ya se apuntó en BAG_UPDATE_DELAYED.
local function apuntarBanco(cerrando)
  local ia = guardadoIa()
  local banco = ia and leerBanco()
  if banco and not (cerrando and #banco.objetos == 0 and ia.banco) then
    ia.banco = banco
  end
end

function Inventario.banco()
  local ia = guardadoIa()
  local banco = ia and ia.banco
  return type(banco) == "table" and banco or nil
end

-- Solo se escucha BAG_UPDATE_DELAYED mientras el banco está abierto (así el addon no registra ese evento el resto del tiempo).
local function alCambiarBolsas()
  apuntarBanco()
end

SNF.Eventos.escuchar("BANKFRAME_OPENED", function()
  SNF.Eventos.escuchar("BAG_UPDATE_DELAYED", alCambiarBolsas)
  apuntarBanco()
end)

SNF.Eventos.escuchar("BANKFRAME_CLOSED", function()
  apuntarBanco(true)
  SNF.Eventos.dejar("BAG_UPDATE_DELAYED", alCambiarBolsas)
end)

-- Copia superficial del banco apuntado: el mensaje no debe compartir tabla con las SavedVariables (el recorte la toca).
local function copiaBanco()
  local banco = Inventario.banco()
  if not banco then
    return nil
  end
  local copia = {}
  for k, v in pairs(banco) do
    copia[k] = v
  end
  return copia
end

function Inventario.leer()
  local b = Inventario.bolsas()
  local dinero = rawget(_G, "GetMoney")
  dinero = type(dinero) == "function" and dinero() or 0
  if type(dinero) ~= "number" or API.esSecreto(dinero) then
    dinero = 0
  end
  return {
    libres = b.libres,
    huecos = b.huecos,
    libresComponentes = b.libresComponentes,
    huecosComponentes = b.huecosComponentes,
    dinero = floor(dinero),
    bolsas = b.objetos,
    equipo = Inventario.equipo(),
    banco = copiaBanco(),
  }
end
