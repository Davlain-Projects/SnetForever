-- SnetForever: Correo (plan de paridad con TSM, fase 4). Vista previa, SOLO DE LECTURA, de lo que las operaciones de
-- Correo enviarían desde las bolsas a otros personajes propios. No adjunta, no envía, no coge, no devuelve ni borra nada,
-- no toca oro y no escribe en el formulario del buzón: no llama a ninguna función de correo ni de contenedores que actúe.
-- Es una recomendación que el jugador sigue con sus propias manos. Lo que falta por probar en Forever está en
-- docs/comercio/correo.md.
--
-- Las cuentas son las de TSM 4.15.9 (LibTSMSystem/Source/Operation/MailingOperation.lua, SendTargetIterator, y
-- LibTSMApp/Source/Mailing/Internal/Groups.lua, que con isDryRun es justo una vista previa), leídas en la copia instalada:
--   - Por cada objeto de los grupos elegidos que está en las bolsas, lo que se puede enviar: las unidades de los huecos NO
--     ligados (BagTracking.CreateQueryBagsMailable).
--   - Se recorren TODAS las operaciones de Correo del grupo, en su orden y con la herencia de Operaciones.deGrupo. Una
--     ignorada aquí o sin destinatario se salta y deja paso a la siguiente (Correo admite varias, como en TSM).
--   - Cada operación necesita «Cantidad que te quedas» de 0 a 50.000 y, con «Poner una cantidad máxima», una máxima de 1 a
--     50.000. Si no, TSM la salta sin decir nada; aquí la fila dice qué fórmula falla.
--   - reserva = la MAYOR «cantidad que te quedas» de las operaciones vistas hasta ahora (no se suman: una reserva no se
--     cuenta dos veces). disponible = unidades - enviado ya - reserva.
--   - Cuánto se envía (GetNumToSend), con disponible <= 0 nada:
--       sin máxima:                  todo lo disponible (al personaje de ahora, nada).
--       máxima sin reponer:          min(disponible, máxima).
--       máxima y reponer el destino: min(disponible, máxima - lo que ya tiene el destinatario).
--     Si el destinatario es el personaje de ahora, no se envía: esa cantidad pasa a ser reserva (la mayor de las dos).
--   - Lo que ya tiene el destinatario (GetMailingTargetQuantity): bolsas + correo + subastas, más el banco y la hermandad si
--     la operación los marca como fuentes.
--   - El mismo destinatario en varias operaciones recibe la suma.
--
-- Donde se aparta de TSM (todo está en docs/comercio/correo.md):
--   - Destinatario: solo se recomienda enviar a un personaje PROPIO del reino de ahora (Operaciones.propios()). TSM envía a
--     cualquier nombre. Un destinatario que no es propio o es de otro reino no se enseña (ni se escribe en la vista: solo
--     su tipo) y su envío no se recomienda, pero se descuenta de lo disponible como haría TSM, para que las operaciones de
--     después den lo mismo que en TSM.
--   - Lo que tiene el destinatario: solo lo visto. Un buzón o un banco sin abrir, sus subastas (el addon solo ve las del
--     personaje de ahora) y la hermandad no se toman por cero: van en `sinContar` y la cantidad a enviar es un TOPE (con lo
--     que falta por contar solo puede bajar). Si ese tope cambia lo que queda para las operaciones de después, sus
--     cantidades quedan «aproximadas». Lo enviado y aún no abierto por el destinatario no se ve hasta que abre su buzón.
--   - Ligados: un hueco que el juego no dice si está ligado deja el objeto incierto. Los ligados a la cuenta (que TSM sí
--     enviaría) no se distinguen en Forever y no cuentan como enviables.
--   - Variantes y mascotas: se casan los huecos por el objeto base. Si el árbol tiene variantes (sufijo o bonus) de ese
--     objeto, el objeto base solo cuenta los huecos sin variante y los de variante se apartan. Las mascotas en jaula no se
--     casan con su clave «p:».
--
-- Correo.grupos() -> {rutas}   las que tienen alguna operación de Correo (propia o heredada), en el orden del árbol, sin el
--   Grupo Base.
-- Correo.vistaPrevia(rutas?) -> vista   rutas = {[ruta] = true} | nil (todas).
--   vista = {estado = "lista" | "en_combate", filas, lineas, destinatarios, totales, bolsas = {leidas, desconocidos},
--     requisitos = {ejecutable = false, motivoEjecutar = "solo_lectura"}, huella}
--   fila (por objeto) = {clave, item, nombre, ruta, operaciones = {nombres}, unidades, ligados, enviables, reserva, enviar,
--     quedan, reparto = {linea}, estado = "enviar" | "nada" | "apartada" | "incierta", motivo?, detalle?}
--   linea (por objeto y operación) = {clave, item, nombre, ruta, operacion, destino = "yo"|"propio"|"ajeno"|"otro_reino"|
--     "vacio", destinatario (solo si es propio o el de ahora), conservar, maxima, reponer, enDestino, sinContar, disponible,
--     enviar, reserva, estado = "enviar" | "reserva" | "nada" | "apartada" | "incierta", motivo?, detalle?, tope, aprox}
--   destinatario (pestaña) = {nombre, objetos, unidades, tope, aprox}
-- Correo.vigente(vista) -> boolean, motivo?   vuelve a calcular y dice si la vista sigue valiendo.
local SNF = SnetForever
local Correo = {}
SNF.Correo = Correo

local floor = math.floor
local API = SNF.API
local TIPO = "correo"
local MAX_CANTIDAD = 50000

local function enCombate()
  local f = rawget(_G, "InCombatLockdown")
  if type(f) ~= "function" then
    return false
  end
  local ok, si = pcall(f)
  return ok and si == true
end

local function nombreDe(item)
  local info = API.infoObjeto(item)
  if info and info.nombre then
    return info.nombre
  end
  local ok, n = pcall(SNF.Datos.nombreItem, item)
  return ok and type(n) == "string" and n or nil
end

function Correo.grupos()
  local salida = {}
  for _, ruta in ipairs(SNF.Arbol.ordenadas()) do
    if ruta ~= "" and #SNF.Operaciones.deGrupo(ruta, TIPO) > 0 then
      salida[#salida + 1] = ruta
    end
  end
  return salida
end

---------------------------------------------------------------------------------------------------
-- Las bolsas: hueco a hueco, para saber qué está ligado y qué es una variante.
---------------------------------------------------------------------------------------------------

-- Un enlace con sufijo o bonus (la misma lectura que Vendedor). nil si no se puede leer.
local function enlaceVariante(enlace)
  local cuerpo = type(enlace) == "string" and string.match(enlace, "item:([%-%d:]+)")
  if not cuerpo then
    return nil
  end
  local campos = {}
  for v in string.gmatch(cuerpo .. ":", "([^:]*):") do campos[#campos + 1] = v end
  local sufijo, bonus = tonumber(campos[7] or ""), tonumber(campos[13] or "")
  return (sufijo ~= nil and sufijo ~= 0) or (bonus ~= nil and bonus > 0)
end

-- {porId = {[id] = {{n, ligado = true|false|nil, variante}...}}, leidas, desconocidos, firma}
local function leerBolsas()
  local ids = API.bolsasPropias()
  local r = {porId = {}, leidas = 0, desconocidos = 0, firma = {}}
  for _, bolsa in ipairs(ids or {}) do
    local n = API.huecosBolsa(bolsa)
    if n and n > 0 then
      n = floor(n)
      r.leidas = r.leidas + 1
      local vistos = 0
      for hueco = 1, n do
        local c = API.infoContenedor(bolsa, hueco, true)
        if c then
          vistos = vistos + 1
          local h = {n = c.n, variante = enlaceVariante(c.enlace)}
          if c.lc then h.ligado = c.l == 1 end
          local lista = r.porId[c.id] or {}
          lista[#lista + 1] = h
          r.porId[c.id] = lista
          r.firma[#r.firma + 1] = table.concat({bolsa, hueco, c.id, c.n, tostring(h.ligado), tostring(h.variante)}, ":")
        end
      end
      local libres = API.libresBolsa(bolsa)
      if libres ~= nil and libres >= 0 and libres == floor(libres) and n - libres > vistos then
        r.desconocidos = r.desconocidos + (n - libres - vistos)
      end
    end
  end
  r.firma = table.concat(r.firma, ";")
  return r
end

-- Lo de un objeto en las bolsas: unidades, ligadas, enviables, ligado sin saber y variante sin saber. conVariantes: los huecos con
-- sufijo o bonus cuentan (el árbol no tiene variantes de ese objeto) o no.
local function enBolsas(huecos, conVariantes)
  local total, ligadas, enviables, dudosas, varianteDesconocida = 0, 0, 0, 0, 0
  for _, h in ipairs(huecos or {}) do
    if not conVariantes and h.variante == nil then
      varianteDesconocida = varianteDesconocida + h.n
    elseif conVariantes or h.variante == false then
      total = total + h.n
      if h.ligado == true then
        ligadas = ligadas + h.n
      elseif h.ligado == false then
        enviables = enviables + h.n
      else
        dudosas = dudosas + h.n
      end
    end
  end
  return total, ligadas, enviables, dudosas, varianteDesconocida
end

local function hayVariantes(huecos)
  for _, h in ipairs(huecos or {}) do
    if h.variante then return true end
  end
  return false
end

---------------------------------------------------------------------------------------------------
-- El destinatario.
---------------------------------------------------------------------------------------------------

local function recortar(texto)
  return (string.gsub(string.gsub(texto, "^%s+", ""), "%s+$", ""))
end

-- -> {destino = "vacio"|"yo"|"propio"|"ajeno"|"otro_reino", nombre?}. nombre solo en «yo» y «propio» (personajes de la
-- cuenta): el de otro jugador no sale de aquí. Como TSM (PlayerInfo.IsPlayer), sin distinguir mayúsculas.
local function leerDestinatario(texto, propios)
  if type(texto) ~= "string" or recortar(texto) == "" then
    return {destino = "vacio"}
  end
  texto = recortar(texto)
  local nombre, reino = string.match(texto, "^([^%-]+)%-(.+)$")
  if not nombre then
    nombre = texto
  end
  local I = rawget(SNF, "ImportarTSM")
  if I and I.nombreDeTSM then
    nombre = I.nombreDeTSM(recortar(nombre)) or nombre
  end
  nombre = recortar(nombre)
  local miReino = SNF.Comercio.reino()
  if reino then
    reino = recortar(reino)
    local P = SNF.Personaje
    local reinoTSM = I and I.reinoDeTSM and I.reinoDeTSM() or nil
    if not (P.mismoReino(reino, miReino) or (reinoTSM and P.mismoReino(reino, reinoTSM))) then
      return {destino = "otro_reino"}
    end
  end
  local yo = SNF.Personaje.clave()
  local bajo = string.lower(nombre)
  if type(yo) == "string" and string.lower(yo) == bajo then
    return {destino = "yo", nombre = yo}
  end
  if type(miReino) == "string" then
    local sufijo = " - " .. miReino
    for _, clave in ipairs(propios) do
      if string.sub(clave, -#sufijo) == sufijo then
        local suyo = string.sub(clave, 1, #clave - #sufijo)
        if string.lower(suyo) == bajo then
          return {destino = "propio", nombre = suyo}
        end
      end
    end
  end
  return {destino = "ajeno"}
end

-- Lo que ya tiene el destinatario (GetMailingTargetQuantity): total, sinContar.
local function enDestino(d, item, conBanco, conHermandad)
  if d.destino ~= "yo" and d.destino ~= "propio" then
    return 0, {"destinatario"}
  end
  local total, sinVer = SNF.InventarioCuenta.mailingTargetStock(d.nombre, item, conBanco)
  if total == nil then
    return nil
  end
  local sinContar = {}
  for _, f in ipairs(sinVer or {}) do sinContar[#sinContar + 1] = f end
  if d.destino == "yo" then
    local publicadas = SNF.MisSubastas.publicadas(item)
    if publicadas == nil then
      sinContar[#sinContar + 1] = "subastas"
    else
      total = total + publicadas
    end
  else
    sinContar[#sinContar + 1] = "subastasAlters"
  end
  if conHermandad then
    sinContar[#sinContar + 1] = "hermandad"
  end
  return total, sinContar
end

---------------------------------------------------------------------------------------------------
-- El reparto de un objeto entre sus operaciones (SendTargetIterator).
---------------------------------------------------------------------------------------------------

local function cantidad(nombre, campo, item, minimo)
  local v = SNF.Operaciones.cobre(TIPO, nombre, campo, item)
  if v == nil or v < minimo or v > MAX_CANTIDAD then
    return nil
  end
  return v
end

local function contiene(lista, valor)
  for _, v in ipairs(lista or {}) do
    if v == valor then return true end
  end
  return false
end

-- GetNumToSend: lo que pide la operación con `disponible` unidades libres.
local function aEnviar(op, d, disponible, maxima, tiene)
  if disponible <= 0 then
    return 0
  end
  local paraMi = d.destino == "yo"
  local n = 0
  if op.limitar then
    if op.reponer then
      if paraMi and tiene <= maxima then
        n = disponible
      elseif paraMi then
        n = disponible - (tiene - maxima)
      else
        n = math.min(disponible, maxima - tiene)
      end
    else
      n = math.min(disponible, maxima)
    end
  elseif not paraMi then
    n = disponible
  end
  return math.max(n, 0)
end

local function repartir(base, nombres, enviables, propios)
  local lineas = {}
  local usado, reserva = 0, 0
  -- dudaReserva: una línea anterior dejó la reserva sin saber; dudaUsado: lo enviado antes es solo un tope.
  local dudaReserva, dudaUsado = nil, nil
  for _, nombre in ipairs(nombres) do
    local l = {clave = base.clave .. "|" .. nombre, item = base.item, nombre = base.nombre, ruta = base.ruta,
      operacion = nombre, sinContar = {}}
    lineas[#lineas + 1] = l
    local O = SNF.Operaciones
    local d = leerDestinatario(O.valor(TIPO, nombre, "destinatario"), propios)
    l.destino, l.destinatario = d.destino, d.nombre
    local op = {limitar = O.valor(TIPO, nombre, "limitarCantidad") == true,
      reponer = O.valor(TIPO, nombre, "reponerDestino") == true}
    local fuentes = O.valor(TIPO, nombre, "fuentesReponer") or {}
    l.reponer = op.limitar and op.reponer or false
    if O.ignoradaAqui(TIPO, nombre) then
      l.estado, l.motivo = "apartada", "ignorada"
    elseif d.destino == "vacio" then
      l.estado, l.motivo = "apartada", "sin_destinatario"
    else
      local conservar = cantidad(nombre, "conservar", base.item, 0)
      local maxima = op.limitar and cantidad(nombre, "cantidadMaxima", base.item, 1) or nil
      if conservar == nil then
        l.estado, l.motivo, l.detalle = "apartada", "formula", nombre .. " · conservar"
      elseif op.limitar and maxima == nil then
        l.estado, l.motivo, l.detalle = "apartada", "formula", nombre .. " · cantidadMaxima"
      else
        l.conservar, l.maxima = conservar, maxima
        reserva = math.max(reserva, conservar)
        local disponible = enviables - usado - reserva
        l.disponible = disponible
        l.aprox = (dudaReserva or dudaUsado) and true or nil
        l.dependeDe = dudaReserva or dudaUsado
        local tiene, sinContar = 0, {}
        if op.limitar and op.reponer and disponible > 0 then
          tiene, sinContar = enDestino(d, base.item, contiene(fuentes, "banco"), contiene(fuentes, "hermandad"))
          l.enDestino, l.sinContar = tiene, sinContar or {}
        end
        if tiene == nil then
          l.estado, l.motivo, l.detalle = "incierta", "existencias", "bolsas"
          dudaReserva = dudaReserva or nombre
        else
          local n = aEnviar(op, d, disponible, maxima, tiene)
          local sinVer = #l.sinContar > 0
          if d.destino == "yo" then
            l.reserva = n
            reserva = math.max(reserva, n)
            if sinVer then
              -- Con menos contado, a ti te «falta» más: la reserva puede ser menor y dejar más a las de después.
              l.estado, l.motivo, l.detalle = "incierta", "destino_sin_ver", nil
              dudaReserva = dudaReserva or nombre
            elseif n > 0 then
              l.estado, l.motivo = "reserva", "para_ti"
            else
              l.estado, l.motivo = "nada", disponible <= 0 and "sin_disponible" or "para_ti"
            end
          else
            usado = usado + n
            l.enviar = n
            l.tope = sinVer or nil
            if sinVer and n > 0 then
              dudaUsado = dudaUsado or nombre
            end
            if d.destino ~= "propio" then
              -- TSM lo enviaría; aquí no se recomienda (y no se enseña el nombre), pero se descuenta como en TSM.
              l.estado, l.motivo = "apartada", d.destino == "otro_reino" and "otro_reino" or "no_propio"
              if l.reponer and disponible > 0 then
                l.estado = "incierta"
                dudaUsado = dudaUsado or nombre
              end
            elseif n > 0 then
              l.estado = "enviar"
            elseif disponible <= 0 then
              l.estado, l.motivo, l.detalle = "nada", "sin_disponible", enviables .. "/" .. usado .. "/" .. reserva
            else
              l.estado, l.motivo = "nada", "repuesto"
            end
          end
        end
      end
    end
    l.reservaTotal = reserva
  end
  return lineas, usado, reserva
end

---------------------------------------------------------------------------------------------------
-- Filas.
---------------------------------------------------------------------------------------------------

local function fila(item, ruta, clave, bolsas, propios)
  local f = {clave = ruta .. "|" .. clave, item = item, nombre = item and nombreDe(item) or nil, ruta = ruta,
    operaciones = SNF.Operaciones.deGrupo(ruta, TIPO), reparto = {}}
  local huecos = bolsas.porId[item]
  -- Si el árbol tiene variantes de este objeto, las variantes de las bolsas no son del objeto base.
  local base = "i:" .. item
  local conVariantes = not (SNF.Arbol.varianteEnOtraRuta(base, ruta) or SNF.Arbol.rutaVariante(base, {[ruta] = true}))
  local unidades, ligadas, enviables, dudosas, varianteDesconocida = enBolsas(huecos, conVariantes)
  f.unidades, f.ligados, f.enviables = unidades, ligadas, enviables
  if not conVariantes and hayVariantes(huecos) then
    f.variantesApartadas = true
  end
  if varianteDesconocida > 0 then
    f.estado, f.motivo, f.detalle = "incierta", "variante_desconocida", tostring(varianteDesconocida)
    return f
  elseif dudosas > 0 then
    f.estado, f.motivo, f.detalle = "incierta", "ligado_desconocido", tostring(dudosas)
    return f
  end
  if enviables == 0 then
    f.estado, f.motivo = "nada", ligadas > 0 and "ligado" or "solo_variantes"
    return f
  end
  local lineas, usado, reserva = repartir(f, f.operaciones, enviables, propios)
  f.reparto, f.reserva = lineas, reserva
  local enviar, hay, duda = 0, false, false
  for _, l in ipairs(lineas) do
    if l.estado == "enviar" then
      enviar = enviar + l.enviar
      hay = true
    end
    duda = duda or l.estado == "incierta"
  end
  f.enviar, f.quedan = enviar, enviables - usado
  if hay then
    f.estado = "enviar"
  elseif duda then
    f.estado = "incierta"
  else
    f.estado = "nada"
  end
  return f
end

-- Una fila sin reparto (variante, mascota o sin unidades) como una sola línea de la tabla.
local function lineaDeFila(f)
  return {clave = f.clave, item = f.item, nombre = f.nombre, ruta = f.ruta, operacion = table.concat(f.operaciones, ", "),
    estado = f.estado, motivo = f.motivo, detalle = f.detalle, sinContar = {}, unidades = f.unidades, ligados = f.ligados,
    soloFila = true}
end

local function porDestinatario(lineas)
  local porNombre, lista = {}, {}
  for _, l in ipairs(lineas) do
    if l.estado == "enviar" and l.destinatario then
      local d = porNombre[l.destinatario]
      if not d then
        d = {nombre = l.destinatario, objetos = 0, unidades = 0, tope = false, aprox = false, vistos = {}}
        porNombre[l.destinatario] = d
        lista[#lista + 1] = d
      end
      if not d.vistos[l.item] then
        d.vistos[l.item] = true
        d.objetos = d.objetos + 1
      end
      d.unidades = d.unidades + l.enviar
      d.tope = d.tope or l.tope == true
      d.aprox = d.aprox or l.aprox == true
    end
  end
  for _, d in ipairs(lista) do d.vistos = nil end
  table.sort(lista, function(a, b) return a.nombre < b.nombre end)
  return lista
end

local function totales(filas, destinatarios)
  local t = {filas = #filas, enviar = 0, unidades = 0, destinatarios = #destinatarios, inciertas = 0, apartadas = 0,
    tope = false, aprox = false}
  for _, f in ipairs(filas) do
    if f.estado == "enviar" then
      t.enviar = t.enviar + 1
      t.unidades = t.unidades + f.enviar
    elseif f.estado == "incierta" then
      t.inciertas = t.inciertas + 1
    end
    for _, l in ipairs(f.reparto) do
      if l.estado == "enviar" then
        t.tope = t.tope or l.tope == true
        t.aprox = t.aprox or l.aprox == true
      elseif l.estado == "apartada" then
        t.apartadas = t.apartadas + 1
      end
    end
  end
  return t
end

local function huella(v)
  local partes = {v.estado, v.bolsas.firma or "", tostring(v.bolsas.leidas), tostring(v.bolsas.desconocidos)}
  for _, l in ipairs(v.lineas) do
    partes[#partes + 1] = table.concat({tostring(l.item), l.ruta, l.operacion or "", tostring(l.destino),
      tostring(l.destinatario), tostring(l.conservar), tostring(l.maxima), tostring(l.enDestino),
      table.concat(l.sinContar or {}, ","), tostring(l.disponible), tostring(l.enviar), tostring(l.reserva), l.estado,
      tostring(l.motivo), tostring(l.detalle), tostring(l.tope), tostring(l.aprox), l.dependeDe or "", l.nombre or ""}, "|")
  end
  return table.concat(partes, "\n")
end

local function construir(rutas)
  local v = {estado = "lista", filas = {}, lineas = {}, destinatarios = {}, bolsas = {leidas = 0, desconocidos = 0},
    requisitos = {ejecutable = false, motivoEjecutar = "solo_lectura"}}
  if enCombate() then
    v.estado = "en_combate"
    v.totales = totales(v.filas, v.destinatarios)
    return v
  end
  local bolsas = leerBolsas()
  v.bolsas = {leidas = bolsas.leidas, desconocidos = bolsas.desconocidos, firma = bolsas.firma}
  local propios = SNF.Operaciones.propios().personajes
  for _, ruta in ipairs(Correo.grupos()) do
    if rutas == nil or rutas[ruta] then
      for _, clave in ipairs(SNF.Arbol.objetos(ruta)) do
        local item = tonumber(string.match(clave, "^i:(%d+)$"))
        if item then
          -- Como TSM: solo lo que está en las bolsas.
          if bolsas.porId[item] then
            local f = fila(item, ruta, clave, bolsas, propios)
            v.filas[#v.filas + 1] = f
          end
        else
          local id = tonumber(string.match(clave, "^i:(%d+):"))
          if id and bolsas.porId[id] and hayVariantes(bolsas.porId[id]) then
            local f = {clave = ruta .. "|" .. clave, item = id, nombre = nombreDe(id), ruta = ruta,
              operaciones = SNF.Operaciones.deGrupo(ruta, TIPO), reparto = {}, estado = "apartada", motivo = "variante"}
            v.filas[#v.filas + 1] = f
          end
        end
      end
    end
  end
  for _, f in ipairs(v.filas) do
    if #f.reparto > 0 then
      for _, l in ipairs(f.reparto) do v.lineas[#v.lineas + 1] = l end
    else
      v.lineas[#v.lineas + 1] = lineaDeFila(f)
    end
  end
  v.destinatarios = porDestinatario(v.lineas)
  v.totales = totales(v.filas, v.destinatarios)
  v.huella = huella(v)
  v._rutas = rutas
  return v
end

function Correo.vistaPrevia(rutas)
  return construir(rutas)
end

function Correo.vigente(vista)
  if type(vista) ~= "table" or vista.estado ~= "lista" then
    return false, "sin_vista"
  end
  local nueva = construir(vista._rutas)
  if nueva.estado ~= "lista" then
    return false, nueva.estado
  end
  if nueva.huella ~= vista.huella then
    return false, "cambio"
  end
  return true
end
