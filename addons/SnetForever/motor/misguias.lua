-- SnetForever: «Mis guías». Guías que escribe el propio jugador en el addon aparte SnetForever_MisGuias, que solo vive
-- en su PC: la app no lo instala encima ni lo toca, y no va en el repositorio (en el repositorio solo está la plantilla,
-- templates/SnetForever_MisGuias). Ese addon llena la global SnetForeverMisGuias con una lista de guías en un formato
-- sencillo; aquí se traducen al formato de la fase 1 una sola vez, la primera vez que se piden (Datos.guia y
-- Datos.claves preguntan aquí), así que da igual en qué orden cargue el juego los dos addons.
--
-- Formato de cada guía (lo explica entero el LEEME.txt de la plantilla):
--   {nombre = "texto", niveles? = {min, max}, faccion? = "Horda" | "Alianza", siguiente? = "nombre de otra guía tuya",
--    clase?, raza?, sin_clase?, sin_raza?, nombre_antes? = "el nombre que tenía", pasos = {Paso, ...}}
--   * nombre_antes (ronda 3): el progreso guardado con ese nombre pasa a este (MisGuias.migrarProgreso, al entrar).
--   * clase, raza, sin_clase y sin_raza de la guía (ronda 2): como en un paso, pero para la guía entera (guia.filtro: no
--     sale en el selector a quien no la cumple). Con un nombre que no se entiende, la guía no se usa (con aviso).
--   Paso = {id? = "texto", aceptar? = q | {q, ...}, completar? = q | {q, ...}, objetivo? = k, entregar? = q | {q, ...},
--           ir? = {mapa, x, y}, texto? = "texto", texto_en? = "text", clase? = c | {c, ...}, raza? = r | {r, ...},
--           faccion? = f | {f, ...}, sin_clase? = c | {c, ...}, sin_raza? = r | {r, ...}}
--   * clase, raza, faccion (17-nov): el paso solo sale a esa clase, raza o facción; una lista es O y los campos juntos,
--     Y («Humano» y «Guerrero»: solo humanos guerreros). sin_clase y sin_raza: a todas menos esas. Los nombres, en
--     español o en inglés y sin mirar tildes ni mayúsculas (Mago, MAGE, Trol, Troll, No-muerto, Undead, Horda...). Pasan
--     a paso.filtro (nucleo/filtros.lua). Un paso con un nombre que no se entiende no sale (para nadie). De una lista
--     solo cuenta su parte de lista (1, 2, 3… hasta el primer hueco).
--   * id (ronda 2): el del progreso guardado (idsDePasos); sin él, «m<número del paso>».
--   * texto_en: el texto en inglés (con el juego en inglés); sin él, el mismo texto. nombre_en (de la guía): igual con
--     el título.
--   * niveles: si no están, los de las misiones de la guía (questLevel, como las rutas de la IA) y, si tampoco, 1-60.
--   * faccion: también «Horde» y «Alliance»; sin ella, la guía vale para las dos.
--   * completar sin objetivo: un complete por cada objetivo que la base conoce de la misión (al menos uno); con
--     objetivo = k, solo ese.
--   * ir: con misiones en el paso, la flecha (y el pin) hacia ese sitio; sin misiones, el paso se da por hecho al llegar.
--   * texto: con misiones o con ir, una nota del paso; solo, un paso con casilla que marca el jugador.
--
-- Nunca se inventa nada: una misión que no está en la base, un sitio mal escrito o un campo que no se entiende no se
-- usan y quedan en MisGuias.avisos(), que el arranque enseña en el chat al entrar (MisGuias.anunciar). Un campo de paso
-- que no se entiende no avisa paso a paso: solo un aviso que los resume, y solo en modo de depuración
-- (SnetForeverCuenta.depurar = true).
--
-- MisGuias.GRUPO = "Mis guías"            el grupo del selector (y la primera parte de las claves).
-- MisGuias.guia(clave) -> Guia | nil
-- MisGuias.claves() -> {clave, ...}
-- MisGuias.avisos() -> {{clave de texto, argumentos...}, ...}
-- MisGuias.anunciar()                     en el chat: cuántas guías se cargaron y los avisos (si hay global).
-- MisGuias.aqui()                         /snet aqui: el sitio del jugador como «ir = {mapa, x, y}».
-- MisGuias.olvidar()                      vuelve a traducir la próxima vez (para el banco).
local _, SNF = ...
local MisGuias = {}
SNF.MisGuias = MisGuias

local L = SNF.L

MisGuias.GRUPO = "Mis guías"

local MAX_NOMBRE = 80
local MAX_TEXTO = 300
local MAX_AVISOS_CHAT = 10
local RADIO_LLEGADA = 10 -- yardas para dar por hecho un paso de solo «ir» (el RADIO_LUGAR de las rutas de la IA)
local GRUPOS_OBJETIVO = {1, 2, 3, 5, 6} -- grupos de `objectives` que son objetivos del registro (ver ia/ruta.lua)
local FACCIONES = {Horda = "Horde", Horde = "Horde", Alianza = "Alliance", Alliance = "Alliance"}
-- texto_en: el inglés del texto (lo escribe la app al guardar una guía de la IA; 16-nov: sin él aquí, cada paso daba un
-- aviso y el chat se llenó: «…y 9569 aviso(s) más»).
local CAMPOS_PASO = {aceptar = true, completar = true, objetivo = true, entregar = true, ir = true, texto = true,
  texto_en = true, clase = true, raza = true, faccion = true, sin_clase = true, sin_raza = true, id = true}
local MAX_ID = 40 -- bytes del id de un paso (una letra con tilde cuenta 2)

-- 17-nov: clase, raza y facción del paso (y sin_clase / sin_raza), en español o en inglés, sin mirar tildes, mayúsculas,
-- espacios ni guiones. Los valores son los de nucleo/filtros.lua: la clase como UnitClass, la raza como UnitRace.
local CLASES_PASO = {
  guerrero = "WARRIOR", guerrera = "WARRIOR", warrior = "WARRIOR", paladin = "PALADIN", cazador = "HUNTER",
  cazadora = "HUNTER", hunter = "HUNTER", picaro = "ROGUE", picara = "ROGUE", rogue = "ROGUE", sacerdote = "PRIEST",
  sacerdotisa = "PRIEST", priest = "PRIEST", chaman = "SHAMAN", chamana = "SHAMAN", shaman = "SHAMAN", mago = "MAGE",
  maga = "MAGE", mage = "MAGE", brujo = "WARLOCK", bruja = "WARLOCK", warlock = "WARLOCK", druida = "DRUID",
  druid = "DRUID",
}
local RAZAS_PASO = {
  humano = "Human", humana = "Human", human = "Human", orco = "Orc", orca = "Orc", orc = "Orc", enano = "Dwarf",
  enana = "Dwarf", dwarf = "Dwarf", elfodelanoche = "NightElf", elfadelanoche = "NightElf", nightelf = "NightElf",
  nomuerto = "Scourge", nomuerta = "Scourge", renegado = "Scourge", renegada = "Scourge", undead = "Scourge",
  scourge = "Scourge", tauren = "Tauren", gnomo = "Gnome", gnoma = "Gnome", gnome = "Gnome", trol = "Troll",
  troll = "Troll", goblin = "Goblin", skyborne = "Skyborne",
}
local FACCIONES_PASO = {horda = "Horde", horde = "Horde", alianza = "Alliance", alliance = "Alliance"}
-- Cada campo: su tabla de nombres, la letra del término de filtros.lua y si va negado.
local FILTROS_PASO = {
  {campo = "clase", nombres = CLASES_PASO, letra = "c"},
  {campo = "raza", nombres = RAZAS_PASO, letra = "r"},
  {campo = "faccion", nombres = FACCIONES_PASO, letra = "f"},
  {campo = "sin_clase", nombres = CLASES_PASO, letra = "c", negado = true},
  {campo = "sin_raza", nombres = RAZAS_PASO, letra = "r", negado = true},
}
-- Las tildes que se quitan (agudas, graves, diéresis y eñe, en minúscula y en mayúscula), por sus bytes UTF-8; cualquier
-- otra letra que no sea ASCII se cae después (app/src/misguias.mjs hace lo mismo: SIN_TILDE).
local SIN_TILDE = {
  ["á"] = "a", ["é"] = "e", ["í"] = "i", ["ó"] = "o", ["ú"] = "u", ["ü"] = "u", ["ñ"] = "n",
  ["à"] = "a", ["è"] = "e", ["ì"] = "i", ["ò"] = "o", ["ù"] = "u",
  ["Á"] = "A", ["É"] = "E", ["Í"] = "I", ["Ó"] = "O", ["Ú"] = "U", ["Ü"] = "U", ["Ñ"] = "N",
  ["À"] = "A", ["È"] = "E", ["Ì"] = "I", ["Ò"] = "O", ["Ù"] = "U",
}

local hechas -- {guias = {[clave] = Guia}, claves = {clave, ...}, avisos = {...}, hayGlobal = bool} o nil

local function enteroPositivo(v)
  return type(v) == "number" and v >= 1 and v == math.floor(v)
end

local function enCien(v)
  return type(v) == "number" and v >= 0 and v <= 100
end

-- Un texto del jugador, sin espacios a los lados, cortado y con «|» doblado (así no abre códigos de color del juego).
local function limpio(v, max)
  if type(v) ~= "string" then
    return nil
  end
  local t = string.gsub(string.gsub(v, "^%s+", ""), "%s+$", "")
  if t == "" then
    return nil
  end
  if #t > max then
    t = string.sub(t, 1, max)
  end
  return (string.gsub(t, "|", "||"))
end

-- Un número o una lista de números en una lista; nil si no es ninguna de las dos.
local function listaDe(v)
  if type(v) == "number" then
    return {v}
  elseif type(v) == "table" then
    return v
  end
  return nil
end

-- Cuántos objetivos del registro conoce la base de la misión (al menos 1).
local function objetivosDe(mision)
  local grupos = type(mision) == "table" and mision.objectives or nil
  local n = 0
  if type(grupos) == "table" then
    for _, g in ipairs(GRUPOS_OBJETIVO) do
      local lista = grupos[g]
      if type(lista) == "table" then
        n = n + #lista
      end
    end
  end
  return math.max(n, 1)
end

-- Un nombre de clase, raza o facción en minúsculas, sin tildes y sin lo que no sea letra o cifra («No-muerto» ->
-- «nomuerto», «Elfo de la noche» -> «elfodelanoche»).
-- Por orden: las tildes, lo que no es letra o cifra ASCII y, al final, las mayúsculas (como la app).
local function normalNombre(v)
  local t = v
  for conTilde, llana in pairs(SIN_TILDE) do
    t = string.gsub(t, conTilde, llana)
  end
  return string.lower((string.gsub(t, "[^%w]", "")))
end

-- Los términos de filtros.lua de un campo del paso (un texto o una lista de textos, sin repetir), o nil si alguno no se
-- entiende; `malos` recibe cómo se escribió cada uno que no se entiende.
local function terminosDe(valor, def, malos)
  local lista = type(valor) == "table" and valor or {valor}
  local salida, vistos = {}, {}
  for _, nombre in ipairs(lista) do
    local v = type(nombre) == "string" and def.nombres[normalNombre(nombre)] or nil
    if v then
      local t = (def.negado and "!" or "") .. def.letra .. ":" .. v
      if not vistos[t] then
        vistos[t] = true
        salida[#salida + 1] = t
      end
    else
      malos[#malos + 1] = type(nombre) == "table" and "{…}" or tostring(nombre)
    end
  end
  if type(valor) == "table" and #salida == 0 and #malos == 0 then
    malos[1] = "{}"
  end
  if #malos > 0 then
    return nil
  end
  return salida
end

-- El filtro del paso (forma de nucleo/filtros.lua) con su clase, raza y facción: una lista es O, los campos juntos son
-- Y y sin_clase / sin_raza van negados en todos los grupos. Devuelve filtro (nil: sin ninguno de esos campos) y si se
-- entiende; lo que no se entiende se cuenta en `ilegibles` («clase = Magoo» -> en cuántos pasos), una vez por paso.
local function filtroDePaso(datos, ilegibles, sinFaccion)
  local grupos = {{}}
  local alguno, legible = false, true
  local vistos = {}
  for _, def in ipairs(FILTROS_PASO) do
    local valor = datos[def.campo]
    if valor ~= nil and not (sinFaccion and def.campo == "faccion") then
      alguno = true
      local malos = {}
      local terminos = terminosDe(valor, def, malos)
      if not terminos then
        legible = false
        for _, malo in ipairs(malos) do
          local k = def.campo .. " = " .. malo
          if not vistos[k] then
            vistos[k] = true
            ilegibles[k] = (ilegibles[k] or 0) + 1
          end
        end
      elseif def.negado then
        for _, g in ipairs(grupos) do
          for _, t in ipairs(terminos) do
            g[#g + 1] = t
          end
        end
      else
        local nuevos = {}
        for _, g in ipairs(grupos) do
          for _, t in ipairs(terminos) do
            local copia = {}
            for k, x in ipairs(g) do
              copia[k] = x
            end
            copia[#copia + 1] = t
            nuevos[#nuevos + 1] = copia
          end
        end
        grupos = nuevos
      end
    end
  end
  if not alguno or not legible then
    return nil, legible
  end
  return grupos, true
end

-- `desconocidos`: por nombre de campo, en cuántos pasos salió uno que no se entiende; `ilegibles`, igual con los nombres
-- de clase, raza o facción (no avisan paso a paso: ver avisoResumido). Devuelve los elementos y el filtro del paso.
-- 17-nov: un paso con una clase, raza o facción que no se entiende no sale (no debe salir a todas las clases).
local function traducirPaso(datos, nombre, i, avisos, niveles, desconocidos, ilegibles)
  local function avisar(clave, ...)
    avisos[#avisos + 1] = {clave, nombre, i, ...}
  end
  if type(datos) ~= "table" then
    avisar("MISGUIAS_AVISO_PASO_TABLA")
    return nil
  end
  for campo in pairs(datos) do
    if not CAMPOS_PASO[campo] then
      local k = tostring(campo)
      desconocidos[k] = (desconocidos[k] or 0) + 1
    end
  end
  local filtro, legible = filtroDePaso(datos, ilegibles)
  if not legible then
    return nil
  end
  -- Las misiones del paso que están en la base (las demás, con aviso).
  local function misiones(campo)
    local lista = datos[campo]
    if lista == nil then
      return {}
    end
    lista = listaDe(lista)
    if not lista then
      avisar("MISGUIAS_AVISO_NUMERO", campo)
      return {}
    end
    local validas = {}
    for _, q in ipairs(lista) do
      local mision = enteroPositivo(q) and SNF.Datos.mision(q) or nil
      if mision then
        validas[#validas + 1] = q
        local nivel = mision.questLevel
        if enteroPositivo(nivel) then
          niveles.min = math.min(niveles.min or nivel, nivel)
          niveles.max = math.max(niveles.max or nivel, nivel)
        end
      else
        avisar("MISGUIAS_AVISO_MISION", tostring(q))
      end
    end
    return validas
  end
  local elementos = {}
  for _, q in ipairs(misiones("aceptar")) do
    elementos[#elementos + 1] = {t = "accept", q = q, linea = i}
  end
  local objetivo = datos.objetivo
  if objetivo ~= nil and not enteroPositivo(objetivo) then
    avisar("MISGUIAS_AVISO_NUMERO", "objetivo")
    objetivo = nil
  end
  for _, q in ipairs(misiones("completar")) do
    if objetivo then
      elementos[#elementos + 1] = {t = "complete", q = q, objetivo = objetivo, linea = i}
    else
      for k = 1, objetivosDe(SNF.Datos.mision(q)) do
        elementos[#elementos + 1] = {t = "complete", q = q, objetivo = k, linea = i}
      end
    end
  end
  for _, q in ipairs(misiones("entregar")) do
    elementos[#elementos + 1] = {t = "turnin", q = q, linea = i}
  end
  local conMisiones = #elementos > 0
  local irA
  local ir = datos.ir
  if ir ~= nil then
    if type(ir) == "table" and enteroPositivo(ir[1]) and enCien(ir[2]) and enCien(ir[3]) then
      irA = {t = "goto", mapa = ir[1], x = ir[2], y = ir[3], modo = "flecha", linea = i}
    else
      avisar("MISGUIAS_AVISO_IR")
    end
  end
  local texto = datos.texto
  if texto ~= nil then
    texto = limpio(texto, MAX_TEXTO)
    if not texto then
      avisar("MISGUIAS_AVISO_TEXTO")
    end
  end
  -- El inglés, si lo trae y vale; si no, el mismo texto (como siempre).
  local ingles = datos.texto_en ~= nil and limpio(datos.texto_en, MAX_TEXTO) or nil
  local deTexto = texto and {es = texto, en = ingles or texto} or nil
  if irA then
    if not conMisiones then
      -- Solo un sitio: se da por hecho al llegar (como una parada de lugar de la IA).
      irA.modo, irA.radio = "objetivo", RADIO_LLEGADA
    end
    elementos[#elementos + 1] = irA
  end
  if deTexto then
    if conMisiones or irA then
      elementos[#elementos + 1] = {t = "nota", texto = deTexto, linea = i}
    else
      elementos[#elementos + 1] = {t = "manual", texto = deTexto, linea = i}
    end
  end
  if #elementos == 0 then
    avisar("MISGUIAS_AVISO_PASO_VACIO")
    return nil
  end
  return elementos, filtro
end

-- Los campos desconocidos de los pasos (MISGUIAS_AVISO_CAMPOS) o los nombres de clase, raza o facción que no se
-- entienden (MISGUIAS_AVISO_FILTROS), en un solo aviso y solo en modo de depuración (SnetForeverCuenta.depurar = true,
-- que se pone a mano: /run SnetForeverCuenta.depurar = true y /reload): una guía de otra versión (o con un campo nuevo)
-- no debe llenar el chat. Ordenados por nombre: «a» (30 pasos), «b» (1 paso).
local function avisoResumido(cuentas, clave, avisos)
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local depurar = type(cuenta) == "table" and cuenta.depurar == true
  local nombres = {}
  for campo in pairs(cuentas) do
    nombres[#nombres + 1] = campo
  end
  if not depurar or #nombres == 0 then
    return
  end
  table.sort(nombres)
  for k, campo in ipairs(nombres) do
    local n = cuentas[campo]
    nombres[k] = n == 1 and L.t("MISGUIAS_CAMPO_UN_PASO", campo) or L.t("MISGUIAS_CAMPO_PASOS", campo, n)
  end
  avisos[#avisos + 1] = {clave, table.concat(nombres, ", ")}
end

-- Ronda 2: el id de cada paso (el progreso del jugador se guarda por él). El que trae el paso (`id`, un texto de hasta
-- MAX_ID bytes, único en la guía) o, si no lo trae, «m<número del paso>», como antes; ese, si ya lo lleva otro paso de
-- forma explícita, con «~» detrás hasta que no choque. Un id repetido, vacío o que no es texto no vale y se cuenta en
-- `malos` (aviso resumido en depuración). Así una guía regenerada con pasos nuevos delante conserva el progreso.
local function idsDePasos(lista, malos)
  local ids, usados = {}, {}
  for i, p in ipairs(lista) do
    if type(p) == "table" and p.id ~= nil then
      local id = type(p.id) == "string" and string.gsub(string.gsub(p.id, "^%s+", ""), "%s+$", "") or ""
      if id ~= "" and #id <= MAX_ID and not usados[id] then
        ids[i], usados[id] = id, true
      else
        -- Ronda 3: una tabla no sale como «table: 0x…», sino con su tipo.
        local k = (type(p.id) == "string" or type(p.id) == "number") and tostring(p.id)
          or (type(p.id) == "table" and "(una tabla)" or "(" .. type(p.id) .. ")")
        malos[k] = (malos[k] or 0) + 1
      end
    end
  end
  for i in ipairs(lista) do
    if not ids[i] then
      local id = string.format("m%d", i)
      while usados[id] do
        id = id .. "~"
      end
      ids[i], usados[id] = id, true
    end
  end
  return ids
end

local function traducir()
  local avisos, guias, claves, porNombre, siguientes = {}, {}, {}, {}, {}
  local desconocidos, ilegibles, idsMalos, renombradas = {}, {}, {}, {}
  local lista = rawget(_G, "SnetForeverMisGuias")
  local hayGlobal = lista ~= nil
  if hayGlobal and type(lista) ~= "table" then
    avisos[#avisos + 1] = {"MISGUIAS_AVISO_LISTA"}
    lista = {}
  end
  for g, datos in ipairs(lista or {}) do
    local nombre = type(datos) == "table" and limpio(datos.nombre, MAX_NOMBRE) or nil
    if type(datos) ~= "table" then
      avisos[#avisos + 1] = {"MISGUIAS_AVISO_GUIA_TABLA", g}
    elseif not nombre then
      avisos[#avisos + 1] = {"MISGUIAS_AVISO_SIN_NOMBRE", g}
    else
      -- La barra invertida separa grupo y nombre en las claves: en el nombre se cambia por «/».
      nombre = string.gsub(nombre, "\\", "/")
      local clave = MisGuias.GRUPO .. "\\" .. nombre
      if porNombre[nombre] then
        avisos[#avisos + 1] = {"MISGUIAS_AVISO_REPETIDA", nombre}
      else
        local faccion
        if datos.faccion ~= nil then
          faccion = FACCIONES[datos.faccion]
          if not faccion then
            avisos[#avisos + 1] = {"MISGUIAS_AVISO_FACCION", nombre, tostring(datos.faccion)}
          end
        end
        -- Ronda 2: clase, raza, sin_clase y sin_raza de la guía entera (la facción va aparte, como siempre) a guia.filtro.
        -- Con un nombre que no se entiende, la guía no se usa: no debe salir a todas las clases.
        local deGuia = {}
        local filtroGuia, guiaLegible = filtroDePaso(datos, deGuia, true)
        local deNiveles = {}
        local pasos = {}
        if not guiaLegible then
          local malos = {}
          for k in pairs(deGuia) do
            malos[#malos + 1] = k
          end
          table.sort(malos)
          avisos[#avisos + 1] = {"MISGUIAS_AVISO_FILTRO_GUIA", nombre, table.concat(malos, ", ")}
        elseif type(datos.pasos) ~= "table" then
          avisos[#avisos + 1] = {"MISGUIAS_AVISO_SIN_PASOS", nombre}
        else
          local ids = idsDePasos(datos.pasos, idsMalos)
          for i, p in ipairs(datos.pasos) do
            local elementos, filtro = traducirPaso(p, nombre, i, avisos, deNiveles, desconocidos, ilegibles)
            if elementos then
              local n = #pasos + 1
              pasos[n] = {id = ids[i], n = n, etiquetas = {}, requisitos = {}, linea = i, elementos = elementos,
                filtro = filtro}
            end
          end
          if #pasos == 0 then
            avisos[#avisos + 1] = {"MISGUIAS_AVISO_SIN_PASOS", nombre}
          end
        end
        local niveles = datos.niveles
        local minimo, maximo
        if niveles ~= nil then
          if type(niveles) == "table" and enteroPositivo(niveles[1]) and enteroPositivo(niveles[2])
            and niveles[1] <= niveles[2] and niveles[2] <= 60 then
            minimo, maximo = niveles[1], niveles[2]
          else
            avisos[#avisos + 1] = {"MISGUIAS_AVISO_NIVELES", nombre}
          end
        end
        if not minimo then
          minimo, maximo = deNiveles.min or 1, deNiveles.max or 60
        end
        if #pasos > 0 then
          porNombre[nombre] = clave
          claves[#claves + 1] = clave
          -- nombre_en: el título en inglés, si la guía lo trae (las de la IA); la clave sigue siendo la del nombre.
          local nombreEn = datos.nombre_en ~= nil and limpio(datos.nombre_en, MAX_NOMBRE) or nil
          guias[clave] = {
            clave = clave, grupo = MisGuias.GRUPO, nombre = nombre, titulo = {es = nombre, en = nombreEn or nombre},
            tipo = "propia", faccion = faccion, niveles = {minimo, maximo}, siguientes = {}, mazmorras = {},
            fuente = {archivo = "SnetForever_MisGuias", linea = g}, pasos = pasos, filtro = filtroGuia,
          }
          -- Ronda 3: nombre_antes, el nombre que tenía la guía (al cambiarle la etiqueta): su progreso pasa a esta
          -- (MisGuias.migrarProgreso).
          local antes = datos.nombre_antes ~= nil and limpio(datos.nombre_antes, MAX_NOMBRE) or nil
          if antes then
            local claveAntes = MisGuias.GRUPO .. "\\" .. string.gsub(antes, "\\", "/")
            if claveAntes ~= clave then
              renombradas[claveAntes] = clave
            end
          end
          if datos.siguiente ~= nil then
            siguientes[clave] = datos.siguiente
          end
        else
          porNombre[nombre] = false -- el nombre ya salió (repetirlo también avisa), pero la guía no se usa
        end
      end
    end
  end
  -- La siguiente de cada guía, ya con todas traducidas (puede ser una que va después en la lista).
  for clave, siguiente in pairs(siguientes) do
    local guia = guias[clave]
    local nombre = limpio(siguiente, MAX_NOMBRE)
    nombre = nombre and string.gsub(nombre, "\\", "/") or nil
    local destino = nombre and porNombre[nombre]
    if destino then
      guia.siguientes = {{clave = destino}}
    else
      guia.siguientes = {{sinResolver = nombre or tostring(siguiente)}}
      avisos[#avisos + 1] = {"MISGUIAS_AVISO_SIGUIENTE", guia.nombre, nombre or tostring(siguiente)}
    end
  end
  avisoResumido(desconocidos, "MISGUIAS_AVISO_CAMPOS", avisos)
  avisoResumido(ilegibles, "MISGUIAS_AVISO_FILTROS", avisos)
  avisoResumido(idsMalos, "MISGUIAS_AVISO_IDS", avisos)
  table.sort(claves)
  -- Un nombre de antes que sigue siendo el de otra guía no se pasa (las dos existen).
  for vieja in pairs(renombradas) do
    if guias[vieja] then
      renombradas[vieja] = nil
    end
  end
  return {guias = guias, claves = claves, avisos = avisos, hayGlobal = hayGlobal, renombradas = renombradas}
end

local function preparar()
  if not hechas then
    hechas = traducir()
  end
  return hechas
end

function MisGuias.guia(clave)
  if type(clave) ~= "string" or string.sub(clave, 1, #MisGuias.GRUPO + 1) ~= MisGuias.GRUPO .. "\\" then
    return nil
  end
  return preparar().guias[clave]
end

function MisGuias.claves()
  return preparar().claves
end

function MisGuias.avisos()
  return preparar().avisos
end

-- Ronda 3: el progreso guardado con el nombre de antes de una guía (nombre_antes) pasa al nombre nuevo, una vez por
-- personaje: solo si la guía nueva aún no tiene progreso y la vieja sí. Pasa todo lo que se guarda por la clave de la guía:
-- SnetForeverPJ.progreso (paso actual y marcas), la guía elegida (guia), la de vuelta y la lateral (volverA, vueltas, lateral),
-- los saltados, los retomados y el «Cómo llegar» cerrado (viajeCerrado). Lo llama el arranque (PLAYER_LOGIN), antes
-- de cargar la guía del personaje.
local function vacio(t)
  return t == nil or (type(t) == "table" and next(t) == nil)
end

-- Ronda 4: un progreso sin paso (ni id ni n) y con todas sus marcas vacías también está vacío (el addon de antes crea uno
-- así al abrir la guía nueva, y entonces nunca se pasaba el de la vieja).
local function progresoVacio(p)
  if vacio(p) then
    return true
  end
  if type(p) ~= "table" or p.id ~= nil or p.n ~= nil then
    return false
  end
  for _, v in pairs(p) do
    if type(v) == "table" and next(v) ~= nil then
      return false
    end
  end
  return true
end

function MisGuias.migrarProgreso()
  local pj = rawget(_G, "SnetForeverPJ")
  if type(pj) ~= "table" or type(pj.progreso) ~= "table" then
    return
  end
  for vieja, nueva in pairs(preparar().renombradas) do
    if not progresoVacio(pj.progreso[vieja]) and progresoVacio(pj.progreso[nueva]) then
      pj.progreso[nueva], pj.progreso[vieja] = pj.progreso[vieja], nil
      for _, campo in ipairs({"guia", "volverA", "lateral"}) do
        if pj[campo] == vieja then
          pj[campo] = nueva
        end
      end
      -- T3, ronda 2: las de debajo de la pila de vueltas.
      for k, c in ipairs(type(pj.vueltas) == "table" and pj.vueltas or {}) do
        if c == vieja then
          pj.vueltas[k] = nueva
        end
      end
      for _, s in ipairs(type(pj.saltados) == "table" and pj.saltados or {}) do
        if type(s) == "table" and s.clave == vieja then
          s.clave = nueva
        end
      end
      if type(pj.retomados) == "table" and pj.retomados[vieja] ~= nil and vacio(pj.retomados[nueva]) then
        pj.retomados[nueva], pj.retomados[vieja] = pj.retomados[vieja], nil
      end
      -- Ronda 4: el «Cómo llegar» que el jugador cerró (ui/ventana.lua) también va por la clave de la guía.
      if type(pj.viajeCerrado) == "table" and pj.viajeCerrado.guia == vieja then
        pj.viajeCerrado.guia = nueva
      end
    end
  end
end

function MisGuias.olvidar()
  hechas = nil
end

-- /snet aqui: el sitio del jugador ya escrito como en una guía («ir = {mapa, x, y}»), para copiarlo. Sin mapa o sin
-- posición (dentro de una instancia), solo avisa. Con pcall, como ia/contexto.lua: el cliente puede no dar la posición.
-- Todo el cálculo va dentro del pcall: con el motor moderno la posición puede ser un secreto, y compararlo da error.
function MisGuias.aqui()
  local ok, texto = pcall(function()
    local mapa = C_Map.GetBestMapForUnit("player")
    if not enteroPositivo(mapa) then
      return nil
    end
    local vector = C_Map.GetPlayerMapPosition(mapa, "player")
    if not vector then
      return nil
    end
    local x, y = vector:GetXY()
    if type(x) ~= "number" or type(y) ~= "number" or (x == 0 and y == 0) then
      return nil
    end
    return string.format("ir = {%d, %.1f, %.1f}", mapa, SNF.U.redondear(x * 100, 1), SNF.U.redondear(y * 100, 1))
  end)
  if ok and type(texto) == "string" then
    print(L.t("MISGUIAS_AQUI", texto))
  else
    print(L.t("MISGUIAS_AQUI_NO"))
  end
end

-- ¿El juego cargó el addon SnetForever_MisGuias? (C_AddOns.IsAddOnLoaded o, en clientes viejos, IsAddOnLoaded.)
local function addonCargado(nombre)
  local C = rawget(_G, "C_AddOns")
  local f = type(C) == "table" and C.IsAddOnLoaded or rawget(_G, "IsAddOnLoaded")
  if type(f) ~= "function" then
    return false
  end
  local ok, cargado = pcall(f, nombre)
  return ok and cargado and true or false
end

function MisGuias.anunciar()
  local h = preparar()
  if not h.hayGlobal then
    -- El addon está pero la global no: su archivo tiene un error de escritura (el juego lo enseña aparte) y no se
    -- ejecutó, o no llega a crear SnetForeverMisGuias.
    if addonCargado("SnetForever_MisGuias") then
      print(L.t("MISGUIAS_ROTO"))
    end
    return
  end
  print(L.t("MISGUIAS_CARGADAS", #h.claves))
  for k, aviso in ipairs(h.avisos) do
    if k > MAX_AVISOS_CHAT then
      print(L.t("MISGUIAS_MAS_AVISOS", #h.avisos - MAX_AVISOS_CHAT))
      break
    end
    -- Sin unpack: el juego es Lua 5.1 y el banco 5.3. Los avisos llevan como mucho 4 argumentos.
    print(L.t("MISGUIAS_AVISO", L.t(aviso[1], aviso[2], aviso[3], aviso[4], aviso[5])))
  end
end
