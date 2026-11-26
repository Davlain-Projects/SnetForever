-- SnetForever: importar de TSM con un clic (Task 25; diseño de la ventana principal, apartado 8). Mientras TSM está activo,
-- el juego carga su configuración en la global TradeSkillMasterDB; esto la LEE (nunca la cambia) y copia a lo nuestro los
-- grupos, los objetos, las operaciones de los 7 tipos y las fuentes propias. Se importa una vez y después TSM se puede
-- desactivar. No se copia código, texto ni nombres internos de TSM: solo se lee lo que el jugador tiene guardado.
--
-- Qué se lee (SOLO estas claves; las demás de TradeSkillMasterDB, con nombres de otros jugadores y hermandades, ni se miran):
--   _currentProfile["<nombre> - <reino>"]   el perfil de TSM de este personaje (si no está, «Default»). Solo se mira la
--                                           entrada del personaje que juega, nunca se recorre.
--   p@<perfil>@userData@groups       [ruta] = {Auctioning = {"op", ..., override = true}, ...}   «» es el grupo base.
--   p@<perfil>@userData@items        [clave] = ruta         la clave del objeto tal cual («i:1234», «i:1234::…», «p:…»).
--   p@<perfil>@userData@operations   [TipoTSM][nombre] = {campos..., ignorePlayer, ignoreFactionrealm, relationships}
--   g@ @userData@customPriceSources  [nombre] = fórmula
--
-- Cómo se pasa a lo nuestro (SnetForeverCuenta.comercio.v2, los formatos de comercio/arbol.lua y comercio/operaciones.lua):
--   - Los grupos con su ruta, los objetos con su clave tal cual (un objeto en un solo grupo).
--   - Los tipos: Auctioning -> subasta, Crafting -> artesania, Mailing -> correo, Shopping -> compras, Sniper -> sniper,
--     Vendoring -> vendedor, Warehousing -> almacen. Cada campo pasa al nuestro (CAMPOS, más abajo): las fórmulas por
--     Formulas.traducir; la duración 1/2/3 (o 12/24/48) -> «12»/«24»/«48» (la clave es el nombre antiguo y no se cambia
--     para no tocar lo guardado: «12» es el 1 de la API, 2 horas en Forever; «24» el 2, 8 horas; «48» el 3, 24 horas;
--     ver DURACIONES en comercio/operaciones.lua); la puja de 0 a 1 -> de 0 a 100; «qué hacer por
--     debajo del mínimo / por encima del máximo» a nuestras opciones; un beneficio mínimo o un valor propio vacío de
--     Artesanía apaga su interruptor; las fuentes para reponer a las nuestras. Lo que no tiene campo nuestro se deja (los
--     de tamaño de pila de la subasta, que solo existen en las Classic).
--   - Herencia: solo las listas con «override» pasan a ser las propias del grupo; las demás heredan, como en TSM. La lista
--     del grupo base de TSM va al Grupo Base. En los tipos de una sola operación, solo la primera.
--   - Vínculos (relationships): el mismo vínculo en el campo nuestro (si haría un ciclo, no se pone).
--   - Listas de ignorar y destinatario del correo: SOLO personajes y casas propios de la cuenta (Operaciones.propios(), por
--     nombre y reino). Lo que no es propio, o no se sabe, no se guarda (se cuenta en `quitados`).
--   - Fórmulas: la que no se puede calcular (una fuente sin equivalente como dbregionsaleavg) se deja escrita tal cual: el
--     editor la pinta en rojo y la operación no actúa con ella. Al terminar se listan las traducidas y las marcadas.
--   - Fuentes propias: con su nombre (en minúsculas) y la fórmula traducida.
--
-- Juntar o reemplazar:
--   juntar      un grupo que ya existe se usa (no se duplica); sus overrides propios se quedan (solo recibe los de TSM en
--               los tipos que heredaba); lo mismo el Grupo Base. Una operación con el nombre de una que ya existe: si todos sus
--               campos son iguales se usa la que hay; si no, entra como «Nombre 2» y los grupos y vínculos importados
--               apuntan a esa (nunca se pisa una del jugador). Una fuente propia que ya existe se queda la del jugador
--               (`fuentesTuyas`). moverObjetos = false deja donde están los objetos que ya tienen otro grupo (`quedan`);
--               true los pasa al de TSM. Los objetos sin grupo (Grupo Base) entran siempre.
--   reemplazar  lo anterior (grupos, objetos, operaciones de los grupos, operaciones, fuentes propias, las reglas de
--               compra de los grupos propios y los grupos elegidos para el escaneo de compras) va ENTERO a v2._antes, una
--               lista {{cuando, grupos, objetos, gruposOps, operaciones, fuentes, reglas, compra}} (nada se borra), y queda
--               solo lo de TSM.
--   Un grupo nuevo cuya ruta tenía operaciones, reglas o elección de compra huérfanas (de un grupo que ya no existe) no las
--   adopta: van a la papelera de Arbol como una entrada {ruta, grupos = {}, ops, reglas, compra}.
--
-- El trabajo se reparte en pasos con C_Timer (nada de OnUpdate): cada paso hace un trozo acotado (unos cientos de objetos,
-- unas decenas de grupos, unas pocas operaciones). En combate no se empieza; si empieza uno a medias, se pausa sin
-- temporizadores y sigue al salir (PLAYER_REGEN_ENABLED). Al final se COMPRUEBA: se cuentan en lo nuestro los grupos, los
-- objetos, las operaciones y las fuentes de TSM, y tienen que dar lo mismo que analizar(); si no, se dice qué falta.
-- Ronda 1: la importación dura muchos fotogramas y el árbol sigue usable, así que escribir y comprobar miran si el grupo existe
-- AHORA en lo guardado (v2.grupos): si el jugador borra o renombra un grupo a medias, no se escriben objetos ni operaciones
-- en su ruta vieja y la comprobación lo cuenta como que falta (no dice «está todo»). Se eligió esto en vez de bloquear el árbol.
-- Aquí no se calcula ningún precio (las fórmulas solo se copian y se prueban con Formulas.compilar).
--
-- Fallo en el juego (19-nov) y lo que se aprendió con los datos reales:
--   - El cliente de WoW Forever no tiene la librería os: la hora sale de GetServerTime() o time() (ahora()).
--   - En Forever TSM apunta a los personajes como «Nombre Apellido - <tipo de reino>» (Normal, PvP, Roleplay, Roleplay PvP o
--     Hardcore, de C_GameRules), no con GetRealmName(). Así se busca el perfil, y sus listas de ignorar y el reino del
--     destinatario pasan a nuestro reino (reinoNuestro) para compararlos con nuestros personajes propios.
--   - F3: entre el nombre y el apellido TSM pone el separador del cliente (nombreDeTSM), que no tiene por qué ser un
--     espacio. El perfil, los personajes de las listas de ignorar y el destinatario del correo se pasan a nuestro formato
--     («Nombre Apellido», como Personaje.clave()) antes de compararlos. El destinatario se guarda como lo escribió TSM.
--   - Un fallo se apunta en SnetForeverCuenta.comercio.importarFallos (los 5 últimos: {cuando, fase, modo, texto}) y el
--     mensaje al jugador dice el paso y dónde quedó. El error sigue yendo también al manejador de errores del juego.
--   - Una fórmula vacía en un campo que no la admite no se guarda (queda el valor por defecto); dos fuentes propias de TSM
--     que solo cambian en mayúsculas no se pisan (se queda la primera); una con el nombre de una fuente o función nuestra
--     no se escribe y la comprobación la da como que falta.
-- ImportarTSM.disponible() -> true | false, motivo   hace falta TradeSkillMasterDB con las 4 claves en el perfil de este
--                                                   personaje; el motivo dice cómo activar TSM o qué falta.
-- ImportarTSM.analizar() -> resumen | nil, motivo    no cambia nada: {perfil, grupos, objetos, operaciones = {tipo = n},
--                                                   totalOperaciones, fuentes, chocan, enOtroGrupo, hayGrupos, quitados,
--                                                   formulas = {traducidas = {entrada}, marcadas = {entrada}}}
--     grupos cuenta las claves de TSM como las tiene él, con su grupo base (que es nuestro Grupo Base): 353 en los datos del
--     jugador (352 grupos y el base). chocan: los que ya existen en SnetForever; enOtroGrupo: los objetos que ya están en un
--     grupo nuestro distinto del de TSM (los del Grupo Base no cuentan).
--     entrada = {tipo, operacion, campo, antes, despues, desconocidas} o, de una fuente propia, {fuente, antes, despues, ...}.
--     Plan de paridad, entrega 1: también `diagnosticos` = {juntar, reemplazar} (comercio/importar-tsm-diagnostico.lua:
--     fuentes equivalentes, estimaciones locales y fuentes que faltan, con las operaciones y campos afectados, directos, por
--     fuentes propias y por vínculos, y cuántos grupos las usan en el perfil y de verdad), uno por modo porque Juntar conserva
--     tus fuentes propias y tus listas de operaciones y Reemplazar las aparta; `diagnostico` es el de Juntar (y, en
--     `esperado` de una importación, el de su modo). `huella`: un número que cambia si cambia lo leído de TSM (cada objeto
--     con su grupo), tus fuentes propias o las listas de operaciones de tus grupos.
--     Las traducciones no cambian: snfhistorico sigue leyendo lo mismo que snfmercado; el histórico propio (fase 2)
--     es snfhistoricodiario() y se elige a mano.
--     analizar() lo hace de una vez (para las pruebas y para quien no tenga prisa): con los datos del jugador es un tirón de
--     más de 50 ms en el banco, así que la ventanita usa leer().
-- ImportarTSM.leer({alAvanzar = fn(lectura), alTerminar = fn(lectura)}) -> lectura | nil, motivo   Ronda 1: lo mismo que
--     analizar(), repartido en pasos con C_Timer (las 4 fases de leer). lectura = {estado = "leyendo"|"leido"|"cancelada"|
--     "fallo", avance (0..100, solo crece), perfil, resumen (al acabar), mensaje?}. No se pausa en combate: no toca nada y
--     cada paso está acotado. Empezar otra cancela la anterior.
-- ImportarTSM.lectura() -> lectura | nil   la última.   ImportarTSM.cancelarLectura()   la para (la ventanita, al cerrarse).
-- ImportarTSM.importar({modo = "juntar"|"reemplazar", moverObjetos, huella?, alAvanzar = fn(informe), alTerminar = fn(informe)})
--     -> informe | nil, motivo     empieza (nil si no está disponible, en combate o ya hay uno en marcha). Con `huella` (la de
--     la vista previa), si lo leído ya no da la misma huella, termina en «fallo» antes de escribir nada (IMPORTAR_TSM_CAMBIO).
-- ImportarTSM.estado() -> informe | nil   el de la importación en marcha o la última.
--     informe = {estado = "importando"|"pausado"|"hecho"|"fallo", modo, avance (0..100, solo crece), esperado (el
--     resumen), grupos, objetos, operaciones, fuentes, quedan, quitados, fuentesTuyas, formulas = {traducidas, marcadas},
--     comprobacion = {bien, faltan = {grupos = {rutas}, objetos = n, operaciones = {"tipo: nombre"}, fuentes = {nombres}},
--     mensaje}, mensaje?}
--
-- F2 (fallo en el juego, 20-nov): el INVENTARIO de TSM, una vez, con el botón «Importar inventario de TSM» de Ajustes ›
-- Tooltip (solo lee el TradeSkillMasterDB que el juego carga con TSM activo; nada sale del juego). Lo que se lee (SOLO esto):
--   _syncOwner["<Nombre Apellido> - <facción> - <reino de TSM>"] = cuenta dueña, y _syncAccountKey["<facción> - <reino>"]
--     = la cuenta local: un personaje es de esta cuenta si su dueño es la cuenta local de su facción y reino (así lo hace
--     TSM). Solo se recorre _syncOwner, nunca todo TradeSkillMasterDB.
--   de cada personaje propio del reino de ahora (reinoDeTSM(); cualquier facción), sus 4 claves
--     s@<clave>@internalData@bagQuantity, bankQuantity, mailQuantity = {[«i:<id>…»] = n} y classKey.
--   «i:<id>…» pasa a itemID y se suman las variantes; lo que no es «i:» (mascotas) se tira. Ronda 1: un banco o un correo
--   vacío en TSM no cuenta como visto (llega nil: TSM guarda {} también si nunca lo vio), y el nombre se parte por el
--   separador de apellido de TSM (Constants.CharacterNameSeparatorConsts) y se rehace como SNF.Personaje.clave(). No se lee ni se guarda nada
--   más: ni personajes de otras cuentas ni de otros reinos, ni hermandades, ni pendingMail, ni nombres de otros jugadores.
--   Lo escribe InventarioCuenta.rellenar (comercio/inventario.lua): ficha «Nombre Apellido-<nuestro reino>»; no pisa lo
--   que hemos contado nosotros (solo crea las fichas que faltan y rellena el banco y el correo que están a nil), y lo puesto
--   lleva su hora en ficha.tsm.
--   F2b: el banco de cuenta NO se importa: TSM solo lo guarda en retail (g@ @internalData@warbankQuantity; fuera de retail
--   WarbankTracking.Load lo vacía), así que en Forever no trae nada. Lo cuenta el addon al abrir el banco.
-- ImportarTSM.inventarioDisponible() -> true | false, motivo   hace falta TradeSkillMasterDB con _syncOwner y
--                                                   _syncAccountKey.
-- ImportarTSM.inventario() -> {personajes, objetos} | nil, motivo   lo trae (en un solo paso: son unos pocos personajes).
--     Un fallo se apunta en importarFallos con la fase «inventario».
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local ImportarTSM = {}
SNF.ImportarTSM = ImportarTSM

local SEP = "`"
local ROTO = "_roto"
local MAX_NOMBRE_OP = 60 -- el de Operaciones
local MAX_FORMULA = 2000
local PERFIL_DEFECTO = "Default"
local GLOBAL_TSM = "TradeSkillMasterDB"

-- Lo que hace cada paso (medido en el banco: ningún paso pasa de 50 ms; en el juego va mucho más deprisa).
local TROZO = {
  grupos = 40, leerGrupos = 20, leerOperaciones = 3, operaciones = 24, objetos = 500, formulas = 12, comprobar = 800,
  leerObjetos = 800,
}

local TIPOS_TSM = {
  Auctioning = "subasta", Crafting = "artesania", Mailing = "correo", Shopping = "compras", Sniper = "sniper",
  Vendoring = "vendedor", Warehousing = "almacen",
}
local ORDEN_TSM = {"Auctioning", "Crafting", "Mailing", "Shopping", "Sniper", "Vendoring", "Warehousing"}

---------------------------------------------------------------------------------------------------
-- Campos de TSM -> los nuestros. {campo, como, extra}:
--   formula      texto de fórmula (traducido)            sino      verdadero o falso
--   lista        un valor de TSM -> uno nuestro (extra)    varios    {claveTSM = true} -> {nuestras} (extra)
--   ignorar      número 0..3 -> «0».."3»                   duracion  1/2/3 o 12/24/48 -> «12»/«24»/«48»
--                (duracion: la clave es el nombre antiguo; en Forever «12» = 1 de la API = 2 horas, «24» = 2 = 8 horas y
--                «48» = 3 = 24 horas. No se cambia para no tocar lo guardado.)
--   porcentaje   0..1 -> 0..100                            interruptor  fórmula; vacía apaga el interruptor `extra`
--   destinatario un personaje: solo si es propio
---------------------------------------------------------------------------------------------------

local function formula(campo)
  return {campo, "formula"}
end

local PRECIO_SI_FUERA = {none = "noPublicar", minPrice = "minimo", maxPrice = "maximo", normalPrice = "normal", ignore = "ignorar"}

local CAMPOS = {
  Auctioning = {
    ignoreLowDuration = {"ignorarDuracion", "ignorar"}, postCap = formula("tope"), keepQuantity = formula("reservaEnBolsas"),
    maxExpires = formula("caducadasMaximas"), duration = {"duracion", "duracion"}, bidPercent = {"pujaPorcentaje", "porcentaje"},
    undercut = formula("rebaja"), minPrice = formula("precioMinimo"), maxPrice = formula("precioMaximo"),
    normalPrice = formula("precioNormal"), priceReset = {"bajoMinimo", "lista", PRECIO_SI_FUERA},
    aboveMax = {"sobreMaximo", "lista", PRECIO_SI_FUERA}, cancelUndercut = {"cancelarRebajadas", "sino"},
    cancelRepost = {"cancelarParaSubir", "sino"}, cancelRepostThreshold = formula("umbralReponer"),
  },
  Crafting = {
    minRestock = formula("reponerMinimo"), maxRestock = formula("reponerMaximo"),
    minProfit = {"beneficioMinimo", "interruptor", "beneficioMinimoActivo"},
    craftPriceMethod = {"valorFabricado", "interruptor", "cambiarValor"},
  },
  Mailing = {
    maxQtyEnabled = {"limitarCantidad", "sino"}, maxQty = formula("cantidadMaxima"), target = {"destinatario", "destinatario"},
    restock = {"reponerDestino", "sino"}, restockSources = {"fuentesReponer", "varios", {guild = "hermandad", bank = "banco"}},
    keepQty = formula("conservar"),
  },
  Shopping = {
    restockQuantity = formula("reponerCantidad"), maxPrice = formula("precioMaximo"),
    showAboveMaxPrice = {"mostrarSobreMaximo", "sino"},
    restockSources = {"fuentesReponer", "varios", {alts = "alters", auctions = "subastas", bank = "banco", guild = "hermandad"}},
  },
  Sniper = {belowPrice = formula("precioMaximo")},
  Vendoring = {
    sellAfterExpired = formula("caducadasMinimas"), sellSoulbound = {"venderLigados", "sino"}, keepQty = formula("conservar"),
    restockQty = formula("reponerCantidad"),
    restockSources = {"fuentesReponer", "varios",
      {alts = "alters", ah = "subastas", bank = "banco", guild = "hermandad", alts_ah = "subastasAlters", mail = "correo"}},
    enableBuy = {"comprarActivo", "sino"}, enableSell = {"venderActivo", "sino"}, vsMarketValue = formula("valorMercado"),
    vsMaxMarketValue = formula("valorMercadoMaximo"), vsDestroyValue = formula("valorDestruccion"),
    vsMaxDestroyValue = formula("valorDestruccionMaximo"),
  },
  Warehousing = {
    moveQuantity = formula("mover"), stackSize = formula("moverPila"), keepBagQuantity = formula("conservarEnBolsas"),
    keepBankQuantity = formula("conservarEnBanco"), restockQuantity = formula("reponerCantidad"),
    restockStackSize = formula("reponerPila"), restockKeepBankQuantity = formula("reponerConservarEnBanco"),
  },
}

---------------------------------------------------------------------------------------------------
-- Ayudas.
---------------------------------------------------------------------------------------------------

local function msg(clave, ...)
  local L = SNF.L
  if L and L.t then
    return L.t(clave, ...)
  end
  return clave
end

local function sinControl(texto)
  return not string.find(texto, "%c")
end

-- Quita los espacios de los lados en tiempo lineal (los patrones «%s+$» sin ancla al principio son cuadráticos).
local function recortar(texto)
  local desde = string.find(texto, "%S")
  if not desde then
    return ""
  end
  local hasta = #texto
  while hasta > desde and string.find(string.sub(texto, hasta, hasta), "%s") do
    hasta = hasta - 1
  end
  return string.sub(texto, desde, hasta)
end

local function copiar(v)
  if type(v) ~= "table" then
    return v
  end
  local c = {}
  for k, x in pairs(v) do
    c[k] = copiar(x)
  end
  return c
end

local function igual(a, b)
  if type(a) ~= type(b) then
    return false
  end
  if type(a) ~= "table" then
    return a == b
  end
  local x, y = {}, {}
  for _, v in ipairs(a) do
    x[#x + 1] = tostring(v)
  end
  for _, v in ipairs(b) do
    y[#y + 1] = tostring(v)
  end
  if #x ~= #y then
    return false
  end
  table.sort(x)
  table.sort(y)
  for i = 1, #x do
    if x[i] ~= y[i] then
      return false
    end
  end
  return true
end

local function padreDe(ruta)
  local pos, desde = nil, 0
  while true do
    local a = string.find(ruta, SEP, desde + 1, true)
    if not a then
      break
    end
    pos, desde = a, a
  end
  return pos and string.sub(ruta, 1, pos - 1) or ""
end

-- Una ruta de TSM que Arbol aceptaría tal cual: niveles no vacíos, sin espacios a los lados, sin caracteres de control,
-- que no parezcan un comando del chat (T1a) y sin «_roto» en primer nivel. Las que no, no se crean (la comprobación lo dice).
local function rutaValida(ruta)
  if type(ruta) ~= "string" or ruta == "" or not sinControl(ruta) then
    return false
  end
  local A = SNF.Arbol
  local desde, primero = 1, true
  while true do
    local a = string.find(ruta, SEP, desde, true)
    local trozo = string.sub(ruta, desde, (a or #ruta + 1) - 1)
    if trozo == "" or string.find(trozo, "^%s") or string.find(trozo, "%s$") or (A and A.pareceComando(trozo))
      or (primero and trozo == ROTO) then
      return false
    end
    if not a then
      return true
    end
    desde, primero = a + 1, false
  end
end

local function nombreOpValido(n)
  return type(n) == "string" and n ~= "" and #n <= MAX_NOMBRE_OP and n ~= ROTO and sinControl(n) and recortar(n) == n
end

local function claveObjetoValida(clave)
  return type(clave) == "string" and clave ~= "" and clave ~= ROTO
end

-- La hora en segundos. Fallo en el juego (19-nov): el cliente de WoW Forever NO tiene la librería os (el banco sí la daba) y
-- os.time hacía fallar «Reemplazar» nada más empezar a escribir. Se usa la del juego: GetServerTime() o time().
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
  return 0
end

local function enCombate()
  local f = rawget(_G, "InCombatLockdown")
  return f ~= nil and f() and true or false
end

-- comercio y comercio.v2 listos (las tablas de Arbol y Operaciones), o nil si aún no hay cuenta.
local function cuentaComercio(preparar)
  if preparar and SNF.Arbol then
    pcall(SNF.Arbol.preparar)
  end
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  local v2 = type(c) == "table" and c.v2
  if type(v2) ~= "table" then
    return nil
  end
  for _, k in ipairs({"grupos", "objetos", "operaciones", "fuentes"}) do
    if type(v2[k]) ~= "table" then
      return nil
    end
  end
  if v2.gruposOps ~= nil and type(v2.gruposOps) ~= "table" then
    v2.gruposOps = {[ROTO] = v2.gruposOps} -- lo estropeado se guarda, nunca se tira
  end
  return c, v2
end

---------------------------------------------------------------------------------------------------
-- La base de TSM.
---------------------------------------------------------------------------------------------------

local function claves(perfil)
  return {
    grupos = "p@" .. perfil .. "@userData@groups",
    objetos = "p@" .. perfil .. "@userData@items",
    operaciones = "p@" .. perfil .. "@userData@operations",
    fuentes = "g@ @userData@customPriceSources",
  }
end
local ORDEN_CLAVES = {"grupos", "objetos", "operaciones", "fuentes"}
local PARTES = {
  grupos = "IMPORTAR_TSM_PARTE_GRUPOS", objetos = "IMPORTAR_TSM_PARTE_OBJETOS",
  operaciones = "IMPORTAR_TSM_PARTE_OPERACIONES", fuentes = "IMPORTAR_TSM_PARTE_FUENTES",
}

-- El perfil de TSM de este personaje: su entrada en _currentProfile («<nombre> - <reino>»), o «Default».
-- El «reino» con el que TSM apunta a los personajes (fallo en el juego, 19-nov). En WoW Forever no es el nombre del reino:
-- es el tipo de reino que dan las reglas del juego (Hardcore, Roleplay PvP, Roleplay, PvP o Normal). Fuera de Forever (sin
-- C_GameRules), el nombre del reino.
local function reinoDeTSM()
  local ok, reino = pcall(function()
    local reglas, enum = rawget(_G, "C_GameRules"), rawget(_G, "Enum")
    local tipos = enum and enum.GameRule
    if type(reglas) ~= "table" or type(reglas.IsGameRuleActive) ~= "function" or type(tipos) ~= "table" then
      return nil
    end
    local function activa(clave)
      return reglas.IsGameRuleActive(tipos[clave]) and true or false
    end
    if activa("HardcoreRuleset") then
      return "Hardcore"
    end
    local rp, pvp = activa("RPRuleset"), activa("PvPRuleset")
    if rp and pvp then
      return "Roleplay PvP"
    elseif rp then
      return "Roleplay"
    elseif pvp then
      return "PvP"
    end
    return "Normal"
  end)
  if ok and type(reino) == "string" then
    return reino
  end
  return nil
end

-- F3: declarada aquí (la define más abajo nombreDeTSM = function…) para que la vean el perfil, los personajes
-- ignorados y el destinatario del correo de la importación de grupos.
local nombreDeTSM

-- Nuestro nombre del reino y el de TSM para este personaje, y el nombre como lo apuntan los dos («Nombre Apellido» en
-- Forever, como Personaje.clave()). F6b: nuestro reino es SNF.Comercio.reino() (nunca ""; en Forever GetRealmName() puede
-- darlo y entonces el reino de TSM pasaba a "" y no casaba con nada).
local function quienSoy()
  local reino = SNF.Comercio.reino()
  local ok, nombre = pcall(function()
    if SNF.Personaje then
      return SNF.Personaje.clave() -- F3: sin la clave entera, nada (nunca el primer nombre solo)
    end
    return (UnitName("player"))
  end)
  if not ok then
    return nil
  end
  return nombre, reino, reinoDeTSM() or reino
end

-- El perfil de TSM de este personaje: su entrada en _currentProfile («<nombre> - <reino de TSM>»), o «Default».
-- F3: el nombre de la entrada es el de TSM (con su separador de apellido): se compara pasado a nuestro formato.
local function perfilDe(db)
  local actuales = db._currentProfile
  if type(actuales) == "table" then
    local nombre, reino, reinoTSM = quienSoy()
    if type(nombre) == "string" then
      local mios = {} -- [reino] = perfil, solo los de este personaje
      for clave, p in pairs(actuales) do
        local n, r = nil, nil
        if type(clave) == "string" then
          n, r = string.match(clave, "^(.-) %- (.+)$")
        end
        if n and n ~= "" and nombreDeTSM(n) == nombre and type(p) == "string" and p ~= "" then
          mios[r] = p
        end
      end
      for _, r in ipairs({reinoTSM, reino}) do
        local p = type(r) == "string" and mios[r]
        if p then
          return p
        end
      end
    end
  end
  return PERFIL_DEFECTO
end

-- La base, su perfil y las 4 tablas; o nil y el motivo.
local function leerBase()
  local db = rawget(_G, GLOBAL_TSM)
  if type(db) ~= "table" then
    return nil, msg("IMPORTAR_TSM_NO_HAY")
  end
  local perfil = perfilDe(db)
  local nombres = claves(perfil)
  local tablas, faltan = {}, {}
  for _, k in ipairs(ORDEN_CLAVES) do
    local t = db[nombres[k]]
    if type(t) == "table" then
      tablas[k] = t
    else
      faltan[#faltan + 1] = msg(PARTES[k])
    end
  end
  if #faltan > 0 then
    return nil, msg("IMPORTAR_TSM_FALTAN", perfil, table.concat(faltan, ", "))
  end
  return {perfil = perfil, tablas = tablas}
end

function ImportarTSM.disponible()
  local base, motivo = leerBase()
  if not base then
    return false, motivo
  end
  return true
end

---------------------------------------------------------------------------------------------------
-- Leer (sin cambiar nada): lo que hay en TSM pasado a lo nuestro, listo para escribir.
---------------------------------------------------------------------------------------------------

-- Los propios de la cuenta: {personajes = {"Nombre - Reino" = true}, nombres = {nombre = {reinos}}, casas = {"Reino|Faccion" = true}}.
local function propios()
  local O = SNF.Operaciones
  local p = O and O.propios() or {personajes = {}, casas = {}}
  local salida = {personajes = {}, nombres = {}, casas = {}}
  for _, clave in ipairs(p.personajes) do
    salida.personajes[clave] = true
    local nombre, reino = string.match(clave, "^(.-) %- (.+)$")
    if nombre then
      salida.nombres[nombre] = salida.nombres[nombre] or {}
      salida.nombres[nombre][reino] = true
    end
  end
  for _, casa in ipairs(p.casas) do
    salida.casas[casa] = true
  end
  return salida
end

-- «Nombre - Faccion - Reino» (la clave de personaje de TSM) -> «Nombre - Reino», o nil.
-- El reino de TSM pasado al nuestro: el de este personaje (en Forever, «Normal») es nuestro reino (SNF.Comercio.reino()).
local function reinoNuestro(t, reino)
  if reino == t.reinoTSM and t.reinoNuestro then
    return t.reinoNuestro
  end
  return reino
end

local function personajeTSM(t, clave)
  if type(clave) ~= "string" then
    return nil
  end
  local nombre, _, reino = string.match(clave, "^(.-) %- (.-) %- (.+)$")
  if not nombre or nombre == "" or reino == "" then
    return nil
  end
  return (nombreDeTSM(nombre)) .. " - " .. reinoNuestro(t, reino) -- F3: el nombre de TSM, en nuestro formato
end

-- «Faccion - Reino» -> «Reino|Faccion», o nil.
local function casaTSM(t, clave)
  if type(clave) ~= "string" then
    return nil
  end
  local faccion, reino = string.match(clave, "^(.-) %- (.+)$")
  if not faccion or faccion == "" then
    return nil
  end
  return reinoNuestro(t, reino) .. "|" .. faccion
end

-- ¿El destinatario del correo («Nombre» o «Nombre-Reino») es un personaje propio?
local function destinatarioPropio(t, texto)
  local mios = t.mios
  local nombre, reino = string.match(texto, "^([^%-]+)%-(.+)$")
  if not nombre then
    nombre = texto
  end
  nombre = nombreDeTSM(nombre) -- F3: con el separador de apellido de TSM, en nuestro formato
  local reinos = mios.nombres[nombre]
  if not reinos then
    return false
  end
  if not reino then
    return true
  end
  reino = reinoNuestro(t, reino) -- en Forever TSM escribe el tipo de reino («Normal»)
  for r in pairs(reinos) do
    if string.gsub(r, "%s", "") == string.gsub(reino, "%s", "") then
      return true
    end
  end
  return false
end

-- Pasa una fórmula de TSM: el texto traducido y su entrada para la lista (o nil si no es una fórmula que se pueda guardar).
local function pasarFormula(t, valor, donde)
  if type(valor) == "number" then
    valor = tostring(valor)
  end
  if type(valor) ~= "string" or #valor > MAX_FORMULA or not sinControl(valor) then
    return nil
  end
  local antes = recortar(valor)
  if antes == "" then
    return ""
  end
  -- Un número o un importe («5», «1g 50s») no tiene fuentes que traducir; y la misma fórmula se traduce una sola vez.
  local despues, cambios, desconocidas = antes, 0, {}
  if string.find(antes, "%a%a") or string.find(antes, "[^%d%.%s%%gscopGSCOP%+%-%*/%(%)]") then
    local hecha = t.traducidas[antes]
    if not hecha then
      hecha = {SNF.Formulas.traducir(antes)}
      t.traducidas[antes] = hecha
    end
    despues, cambios, desconocidas = hecha[1], hecha[2], hecha[3]
  end
  -- Las fuentes propias que vienen de TSM sí existirán.
  local quedan = {}
  for _, palabra in ipairs(desconocidas) do
    if not t.fuentesTSM[string.lower(palabra)] then
      quedan[#quedan + 1] = string.lower(palabra)
    end
  end
  local entrada = {antes = antes, despues = despues, desconocidas = quedan}
  for k, v in pairs(donde) do
    entrada[k] = v
  end
  if #quedan > 0 then
    t.formulas.marcadas[#t.formulas.marcadas + 1] = entrada
  elseif cambios > 0 then
    t.formulas.traducidas[#t.formulas.traducidas + 1] = entrada
  end
  t.entradas[#t.entradas + 1] = entrada
  return despues
end

-- Un valor ya en nuestro formato y comprobado con la definición del campo (como Operaciones.poner), o nil.
local function valorCampo(def, v)
  local tipo = def.tipo
  if tipo == "sino" then
    if type(v) == "boolean" then
      return v -- false es un valor
    end
    return nil
  elseif tipo == "numero" then
    if type(v) ~= "number" or v ~= v or (def.min and v < def.min) or (def.max and v > def.max) then
      return nil
    end
    return v
  elseif tipo == "lista" then
    for _, o in ipairs(def.opciones or {}) do
      if o.clave == v then
        return v
      end
    end
    return nil
  elseif tipo == "varios" then
    local validas = {}
    for _, o in ipairs(def.opciones or {}) do
      validas[o.clave] = true
    end
    for _, x in ipairs(v) do
      if not validas[x] then
        return nil
      end
    end
    return v
  elseif tipo == "texto" or tipo == "formula" then
    return type(v) == "string" and v or nil
  end
  return nil
end

-- Un campo de TSM en los nuestros: llama a poner(campo, valor) por cada uno.
local function pasarCampo(t, op, spec, valor, poner)
  local campo, como, extra = spec[1], spec[2], spec[3]
  local donde = {tipo = op.tipo, operacion = op.nombre, campo = campo}
  if como == "formula" then
    local texto = pasarFormula(t, valor, donde)
    if texto ~= nil then
      poner(campo, texto)
    end
  elseif como == "interruptor" then
    if valor == "" then
      poner(extra, false)
    else
      local texto = pasarFormula(t, valor, donde)
      if texto ~= nil and texto ~= "" then
        poner(extra, true)
        poner(campo, texto)
      end
    end
  elseif como == "sino" then
    poner(campo, valor)
  elseif como == "lista" then
    poner(campo, extra[valor])
  elseif como == "ignorar" then
    if type(valor) == "number" then
      poner(campo, tostring(valor))
    end
  elseif como == "duracion" then
    -- Índice de la API (1/2/3) o clave antigua (12/24/48) -> nuestra clave. En Forever 1 = 2 h, 2 = 8 h y 3 = 24 h.
    local horas = {[1] = "12", [2] = "24", [3] = "48", [12] = "12", [24] = "24", [48] = "48"}
    poner(campo, horas[valor])
  elseif como == "porcentaje" then
    if type(valor) == "number" then
      poner(campo, math.floor(valor * 100 + 0.5))
    end
  elseif como == "varios" then
    if type(valor) == "table" then
      local lista = {}
      for k, v in pairs(valor) do
        if v == true and extra[k] then
          lista[#lista + 1] = extra[k]
        end
      end
      table.sort(lista)
      poner(campo, lista)
    end
  elseif como == "destinatario" then
    if type(valor) == "string" then
      local texto = recortar(valor)
      if texto == "" or (#texto <= MAX_NOMBRE_OP and sinControl(texto) and destinatarioPropio(t, texto)) then
        poner(campo, texto)
      else
        t.quitados.destinatarios = t.quitados.destinatarios + 1 -- un nombre que no es de la cuenta no se guarda
      end
    end
  end
end

-- Una operación de TSM en nuestro formato: {tipo, nombre, valores, vinculos (campo -> nombre en TSM), ignorarPersonajes,
-- ignorarReinos}.
local function pasarOperacion(t, tsmTipo, nombre, datos)
  local O = SNF.Operaciones
  local tipo = TIPOS_TSM[tsmTipo]
  local op = {tipo = tipo, nombre = nombre, valores = {}, vinculos = {}, ignorarPersonajes = {}, ignorarReinos = {}}
  local mapa = CAMPOS[tsmTipo]
  local function poner(campo, v)
    local def = O.campo(tipo, campo)
    -- Una fórmula vacía en un campo que no la admite vacía no se guarda: queda el valor por defecto (si no, el editor la
    -- pintaría en rojo y la operación no actuaría).
    if def and v ~= nil and not (def.tipo == "formula" and v == "" and not def.vacio) then
      local bueno = valorCampo(def, v)
      if bueno ~= nil then
        op.valores[campo] = bueno
      end
    end
  end
  -- En orden de clave: así las listas de fórmulas salen siempre igual.
  local orden = {}
  for k in pairs(datos) do
    if type(k) == "string" and mapa[k] then
      orden[#orden + 1] = k
    end
  end
  table.sort(orden)
  for _, k in ipairs(orden) do
    pasarCampo(t, op, mapa[k], datos[k], poner)
  end
  if type(datos.ignorePlayer) == "table" then
    for clave, v in pairs(datos.ignorePlayer) do
      local mio = v == true and personajeTSM(t, clave)
      if mio and t.mios.personajes[mio] then
        op.ignorarPersonajes[mio] = true
      elseif v == true then
        t.quitados.personajes = t.quitados.personajes + 1
      end
    end
  end
  if type(datos.ignoreFactionrealm) == "table" then
    for clave, v in pairs(datos.ignoreFactionrealm) do
      local casa = v == true and casaTSM(t, clave)
      if casa and t.mios.casas[casa] then
        op.ignorarReinos[casa] = true
      elseif v == true then
        t.quitados.casas = t.quitados.casas + 1
      end
    end
  end
  if type(datos.relationships) == "table" then
    for k, otra in pairs(datos.relationships) do
      local spec = type(k) == "string" and mapa[k]
      if spec and nombreOpValido(otra) and otra ~= nombre then
        op.vinculos[spec[1]] = otra
        if spec[2] == "interruptor" then
          op.vinculos[spec[3]] = otra
        end
      end
    end
  end
  return op
end

-- Recorre `tabla` con next desde t.cursor, como mucho n entradas. true cuando acaba.
local function recorrer(t, tabla, n, f)
  local k = t.cursor
  for _ = 1, n do
    local v
    k, v = next(tabla, k)
    if k == nil then
      t.cursor = nil
      return true
    end
    f(k, v)
  end
  t.cursor = k
  return false
end

-- Plan de paridad, entrega 1: la huella de lo leído (DiagnosticoTSM.hash de cada entrada, mezclado y sumado: no depende del
-- orden). Importar con la huella de la vista previa se niega si TSM, tus fuentes propias o las listas de operaciones de tus
-- grupos (lo que decide el diagnóstico al juntar) cambiaron desde que se revisó. Los objetos entran uno a uno, clave y
-- grupo juntos (leerObjetos), así que cambiar de grupo dos objetos se nota aunque las cuentas por grupo sigan iguales.
local function huella(t, texto)
  local D = SNF.DiagnosticoTSM
  t.huella = D.sumar(t.huella, D.mezclar(D.hash(texto)))
end

local function leerFuentes(t)
  local nombres = {}
  for nombre, texto in pairs(t.tablas.fuentes) do
    if type(nombre) == "string" and type(texto) == "string" then
      nombres[#nombres + 1] = nombre
      t.fuentesTSM[string.lower(nombre)] = true
    end
  end
  table.sort(nombres)
  for _, nombre in ipairs(nombres) do
    t.cuenta.fuentes = t.cuenta.fuentes + 1
    local original = t.tablas.fuentes[nombre]
    local texto = pasarFormula(t, original, {fuente = string.lower(nombre)})
    t.fuentes[#t.fuentes + 1] = {nombre = string.lower(nombre), escrito = nombre, texto = texto, antes = recortar(original)}
    huella(t, "f|" .. nombre .. "|" .. original)
  end
  -- Las fuentes propias que ya tienes también deciden cómo se traduce y cómo se calcula: entran en la huella.
  for nombre, texto in pairs(SNF.Formulas.fuentes()) do
    huella(t, "t|" .. nombre .. "|" .. texto)
  end
  return true
end

local function leerGrupos(t)
  local O = SNF.Operaciones
  return recorrer(t, t.tablas.grupos, TROZO.leerGrupos, function(ruta, g)
    if type(ruta) ~= "string" then
      return
    end
    -- Se cuentan todas las claves, como las tiene TSM: también su grupo base («»), que pasa a ser nuestro Grupo Base.
    t.cuenta.grupos = t.cuenta.grupos + 1
    if ruta == "" then
      t.conBase = true
    else
      t.rutas[#t.rutas + 1] = ruta
      if t.existentes[ruta] then
        t.cuenta.chocan = t.cuenta.chocan + 1
      end
    end
    huella(t, "g|" .. ruta .. "|" .. SNF.DiagnosticoTSM.serializar(g))
    if type(g) ~= "table" then
      return
    end
    for _, tsmTipo in ipairs(ORDEN_TSM) do
      local lista = g[tsmTipo]
      if type(lista) == "table" and (lista.override == true or ruta == "") then
        local tipo = TIPOS_TSM[tsmTipo]
        local nombres, vistos = {}, {}
        for _, n in ipairs(lista) do
          if type(n) == "string" and not vistos[n] and not (O.TIPOS[tipo].una and #nombres >= 1) then
            vistos[n] = true
            nombres[#nombres + 1] = n
          end
        end
        t.overrides[ruta] = t.overrides[ruta] or {}
        t.overrides[ruta][tipo] = nombres
      end
    end
  end)
end

local function leerOperaciones(t)
  if not t.pendientes then
    t.pendientes = {}
    for _, tsmTipo in ipairs(ORDEN_TSM) do
      local ops = t.tablas.operaciones[tsmTipo]
      if type(ops) == "table" then
        local nombres = {}
        for nombre, datos in pairs(ops) do
          if type(nombre) == "string" and type(datos) == "table" then
            nombres[#nombres + 1] = nombre
          end
        end
        table.sort(nombres)
        for _, nombre in ipairs(nombres) do
          t.pendientes[#t.pendientes + 1] = {tsmTipo, nombre, ops[nombre]}
        end
      end
    end
    t.i = 1
  end
  local hasta = math.min(#t.pendientes, t.i + TROZO.leerOperaciones - 1)
  for k = t.i, hasta do
    local tsmTipo, nombre, datos = t.pendientes[k][1], t.pendientes[k][2], t.pendientes[k][3]
    local tipo = TIPOS_TSM[tsmTipo]
    t.cuenta.operaciones[tipo] = t.cuenta.operaciones[tipo] + 1
    t.cuenta.totalOperaciones = t.cuenta.totalOperaciones + 1
    huella(t, "o|" .. tsmTipo .. "|" .. nombre .. "|" .. SNF.DiagnosticoTSM.serializar(datos))
    local op = pasarOperacion(t, tsmTipo, nombre, datos)
    op.valido = nombreOpValido(nombre)
    t.ops[#t.ops + 1] = op
    t.porId[tipo .. "|" .. nombre] = op
  end
  t.i = hasta + 1
  if t.i > #t.pendientes then
    t.pendientes = nil
    t.progreso = 1
    return true
  end
  t.progreso = (t.i - 1) / #t.pendientes
  return false
end

local function leerObjetos(t)
  local objetos = t.v2.objetos
  local D, memo = SNF.DiagnosticoTSM, t.memoRutas
  local fin = recorrer(t, t.tablas.objetos, TROZO.leerObjetos, function(clave, ruta)
    if type(clave) == "string" and type(ruta) == "string" then
      t.huella = D.sumar(t.huella, D.par(clave, ruta, memo))
    end
    if type(clave) == "string" and type(ruta) == "string" and ruta ~= "" then
      t.porRuta[ruta] = (t.porRuta[ruta] or 0) + 1
      t.cuenta.objetos = t.cuenta.objetos + 1
      local donde = objetos[clave]
      if type(donde) == "string" and donde ~= "" and donde ~= ruta then
        t.cuenta.enOtroGrupo = t.cuenta.enOtroGrupo + 1
      end
    end
  end)
  return fin
end

-- Plan de paridad, entrega 1: el diagnóstico de precios (comercio/importar-tsm-diagnostico.lua), en pasos. Solo lee lo que
-- ya se leyó de TSM y las fuentes propias que tienes; no escribe nada.
-- Un diagnóstico por modo: lo que se revisa tiene que ser lo que quedará. Al leer (la vista previa) se hacen los dos, para
-- enseñar el del modo elegido; al importar, solo el del modo de la importación (es el que sale en el informe final).
--   juntar      con tus fuentes propias (mandan) y las listas de operaciones que ya tienen tus grupos (se quedan).
--   reemplazar  sin nada tuyo: tus fuentes van a _antes (`apartadas`, para decir por qué falta una).

-- Las listas propias de los grupos que ya existen (y del Grupo Base): {[ruta] = {tipo = {nombres}}}. Al juntar se quedan.
-- También entran en la huella, porque deciden el uso efectivo que enseña el diagnóstico de Juntar.
local function listasLocales(t)
  local salida = {}
  local g = type(t.v2.gruposOps) == "table" and t.v2.gruposOps or {}
  local S = SNF.DiagnosticoTSM.serializar
  -- Los nombres que se reutilizan al juntar también dependen de las operaciones locales y de sus campos.
  local operaciones = type(t.v2.operaciones) == "table" and t.v2.operaciones or {}
  for tipo, lista in pairs(operaciones) do
    if type(tipo) == "string" and type(lista) == "table" then
      for nombre, valores in pairs(lista) do
        if type(nombre) == "string" and type(valores) == "table" then
          huella(t, "lo|" .. tipo .. "|" .. nombre .. "|" .. S(valores))
        end
      end
    end
  end
  for ruta, tipos in pairs(g) do
    if type(ruta) == "string" and type(tipos) == "table" and (ruta == "" or t.existentes[ruta]) then
      for tipo, lista in pairs(tipos) do
        if type(tipo) == "string" and type(lista) == "table" then
          local nombres = {}
          for _, n in ipairs(lista) do
            if type(n) == "string" then
              nombres[#nombres + 1] = n
            end
          end
          salida[ruta] = salida[ruta] or {}
          salida[ruta][tipo] = nombres
          huella(t, "l|" .. ruta .. "|" .. tipo .. "|" .. S(lista))
        end
      end
    end
  end
  return salida
end

local resolver -- más abajo (Escribir): el nombre final de una operación

local function diagnosticar(t)
  local D = SNF.DiagnosticoTSM
  -- Para Juntar, primero el nombre final de cada operación (como lo hará resolverOperaciones, que luego lo reutiliza: aún no
  -- se ha escrito nada), en trozos: así una lista tuya que se queda y nombra una operación reutilizada cuenta como uso.
  local conJuntar = t.modo == nil or t.modo == "juntar"
  if conJuntar and not t.diagResuelto then
    local hasta = math.min(#t.ops, t.i + TROZO.operaciones - 1)
    for k = t.i, hasta do
      if t.ops[k].valido then
        resolver(t, t.ops[k], {})
      end
    end
    t.i = hasta + 1
    t.diagResuelto = t.i > #t.ops
    return false
  end
  if not t.diagCola then
    local locales = listasLocales(t)
    local tuyas = SNF.Formulas.fuentes()
    t.diagCola, t.diagnosticos, t.diagI = {}, {}, 1
    for _, modo in ipairs(t.modo and {t.modo} or {"juntar", "reemplazar"}) do
      local juntar = modo == "juntar"
      t.diagCola[#t.diagCola + 1] = {modo = modo, d = D.nuevo({
        modo = modo, ops = t.ops, entradas = t.entradas, fuentes = t.fuentes, rutas = t.rutas, overrides = t.overrides,
        porRuta = t.porRuta, tuyas = juntar and tuyas or {}, apartadas = not juntar and tuyas or nil,
        retained = juntar and t.v2.operaciones or nil, locales = juntar and locales or nil, finales = juntar and t.finales or nil,
      })}
    end
    return false
  end
  local actual = t.diagCola[t.diagI]
  if D.paso(actual.d) then
    t.diagnosticos[actual.modo] = actual.d
    t.diagI = t.diagI + 1
  end
  local siguiente = t.diagCola[t.diagI]
  t.progreso = (t.diagI - 1 + (siguiente and D.avance(siguiente.d) or 0)) / #t.diagCola
  return t.diagI > #t.diagCola
end

---------------------------------------------------------------------------------------------------
-- Escribir.
---------------------------------------------------------------------------------------------------

-- Reemplazar: lo anterior, entero, a v2._antes.
local function guardarAntes(t)
  if t.modo ~= "reemplazar" then
    return true
  end
  local c, v2 = t.c, t.v2
  local antes = {
    cuando = ahora(), grupos = v2.grupos, objetos = v2.objetos, gruposOps = v2.gruposOps, operaciones = v2.operaciones,
    fuentes = v2.fuentes, reglas = {}, compra = c.gruposCompra,
  }
  if type(c.reglas) == "table" then
    for k, regla in pairs(c.reglas) do
      if type(k) == "string" and string.sub(k, 1, 7) == "propio:" then
        antes.reglas[k] = regla
      end
    end
    for k in pairs(antes.reglas) do
      c.reglas[k] = nil
    end
  end
  if type(v2._antes) ~= "table" then
    v2._antes = v2._antes == nil and {} or {[ROTO] = v2._antes}
  end
  table.insert(v2._antes, antes)
  v2.grupos, v2.objetos, v2.gruposOps, v2.operaciones, v2.fuentes = {}, {}, {}, {}, {}
  if c.gruposCompra ~= nil then
    c.gruposCompra = {}
  end
  t.existentes = {}
  if SNF.Arbol then
    SNF.Arbol.olvidarIndice()
  end
  return true
end

local function escribirFuentes(t)
  local suyas = SNF.Formulas.fuentes()
  for _, f in ipairs(t.fuentes) do
    if f.texto and f.texto ~= "" and string.find(f.nombre, "^[%a_][%w_]*$") then
      local ya = suyas[f.nombre]
      if ya == nil then
        local antes = t.v2.fuentes[f.nombre] -- lo que hubiera con ese nombre (aunque no valga como fuente): nunca se pierde
        t.v2.fuentes[f.nombre] = f.texto
        if SNF.Formulas.fuentes()[f.nombre] == nil then
          t.v2.fuentes[f.nombre] = antes -- un nombre que ya es una fuente o función nuestra: no vale (la comprobación lo dirá)
        else
          suyas[f.nombre] = f.texto -- otra de TSM con el mismo nombre en otras mayúsculas ya no la pisa
        end
      elseif ya ~= f.texto then
        t.informe.fuentesTuyas[#t.informe.fuentesTuyas + 1] = f.nombre -- se queda la que ya había
      end
    end
  end
  return true
end

-- Lo huérfano de una ruta (operaciones, reglas y elección de compra de un grupo que ya no existe) va a la papelera, para que
-- el grupo nuevo con esa ruta no lo adopte.
local function apartarHuerfano(t, ruta)
  local c, v2 = t.c, t.v2
  local entrada = {ruta = ruta, grupos = {}}
  local algo = false
  if type(v2.gruposOps) == "table" and v2.gruposOps[ruta] ~= nil then
    entrada.ops = {[ruta] = v2.gruposOps[ruta]}
    v2.gruposOps[ruta] = nil
    algo = true
  end
  local clave = "propio:" .. ruta
  if type(c.reglas) == "table" and c.reglas[clave] ~= nil then
    entrada.reglas = {[ruta] = c.reglas[clave]}
    c.reglas[clave] = nil
    algo = true
  end
  if type(c.gruposCompra) == "table" and c.gruposCompra[ruta] ~= nil then
    entrada.compra = {[ruta] = c.gruposCompra[ruta]}
    c.gruposCompra[ruta] = nil
    algo = true
  end
  if algo then
    if type(v2._papelera) ~= "table" then
      v2._papelera = v2._papelera == nil and {} or {[ROTO] = v2._papelera}
    end
    table.insert(v2._papelera, entrada)
  end
end

-- Ronda 1: ¿el grupo existe AHORA en lo guardado? La importación dura muchos fotogramas y el árbol sigue usable: el jugador
-- puede borrar o renombrar un grupo a medias. Por eso escribir y comprobar miran v2.grupos, no lo que se apuntó al empezar.
-- Los que solo existen como padre de otro (sin su propia entrada, de antes de importar) se miran con Arbol.existe, una vez por
-- paso (t.implicitos se vacía en cada paso).
local function vivo(t, ruta)
  if ruta == "" then
    return true
  end
  if t.v2.grupos[ruta] ~= nil then
    return true
  end
  if not t.existentes[ruta] then
    return false
  end
  local cache = t.implicitos
  if cache[ruta] == nil then
    cache[ruta] = SNF.Arbol.existe(ruta) == true
  end
  return cache[ruta]
end

local function escribirGrupos(t)
  if not t.ordenadas then
    t.ordenadas = {}
    for _, r in ipairs(t.rutas) do
      t.ordenadas[#t.ordenadas + 1] = r
    end
    table.sort(t.ordenadas) -- el padre siempre antes que sus hijos (es un prefijo)
    t.i = 1
  end
  local hasta = math.min(#t.ordenadas, t.i + TROZO.grupos - 1)
  for k = t.i, hasta do
    local ruta = t.ordenadas[k]
    local padre = padreDe(ruta)
    if t.existentes[ruta] and vivo(t, ruta) then
      t.usados[ruta] = true
    elseif rutaValida(ruta) and vivo(t, padre) then
      apartarHuerfano(t, ruta)
      t.v2.grupos[ruta] = true
      t.existentes[ruta] = true
      t.creados[ruta] = true
      t.usados[ruta] = true
    end
  end
  t.i = hasta + 1
  t.progreso = #t.ordenadas > 0 and (t.i - 1) / #t.ordenadas or 1
  if t.i > #t.ordenadas then
    t.ordenadas = nil
    return true
  end
  return false
end

-- ¿Poner `nombre.campo -> otra` haría un ciclo? (siguiendo la cadena desde la otra se vuelve a esta)
local function haceCiclo(ops, nombre, campo, otra)
  local visto, actual = {}, otra
  while type(actual) == "string" and not visto[actual] do
    if actual == nombre then
      return true
    end
    visto[actual] = true
    local o = ops[actual]
    local vinculos = type(o) == "table" and type(o.vinculos) == "table" and o.vinculos
    actual = vinculos and vinculos[campo] or nil
  end
  return false
end

-- ¿La operación que ya existe tiene los mismos campos que la que viene? `enlaces`: los vínculos con los nombres finales.
-- Plan de paridad, entrega 1 (migración repetida): un vínculo de TSM que haría un círculo no se escribió la primera vez
-- (escribirVinculos), así que su ausencia en la que ya existe (`nombre` dentro de `ops`) no la hace distinta: se comparan sus
-- valores propios. Antes, cada importación repetida de un círculo de vínculos creaba «Nombre 2».
local function operacionIgual(existente, op, enlaces, ops, nombre)
  local O = SNF.Operaciones
  if type(existente) ~= "table" then
    return false
  end
  local valores = type(existente.valores) == "table" and existente.valores or {}
  local vinculos = type(existente.vinculos) == "table" and existente.vinculos or {}
  for _, def in ipairs(O.TIPOS[op.tipo].campos) do
    local suyo = vinculos[def.clave]
    local viene = enlaces[def.clave]
    if suyo == nil and viene ~= nil and ops and haceCiclo(ops, nombre, def.clave, viene) then
      viene = nil -- se cortó al escribir: cuenta su valor propio
    end
    if suyo ~= viene then
      return false
    end
    if not suyo then
      local a, b = valores[def.clave], op.valores[def.clave]
      if a == nil then
        a = def.defecto
      end
      if b == nil then
        b = def.defecto
      end
      if not igual(a, b) then
        return false
      end
    end
  end
  return true
end

-- El nombre final de una operación: la suya, o la que hay si es igual, o «Nombre 2»... (nunca se pisa una del jugador).
-- Solo lee lo guardado: apunta el resultado en t.finales, t.reservados y la operación (lo usa también diagnosticar).
function resolver(t, op, pila)
  local id = op.tipo .. "|" .. op.nombre
  if t.finales[id] then
    return t.finales[id]
  end
  if pila[id] then
    return op.nombre -- un ciclo de vínculos (TSM no los deja): se corta aquí
  end
  pila[id] = true
  local enlaces = {}
  for campo, otra in pairs(op.vinculos) do
    local destino = t.porId[op.tipo .. "|" .. otra]
    if destino and destino.valido then
      enlaces[campo] = resolver(t, destino, pila)
    end
  end
  pila[id] = nil
  op.enlaces = enlaces
  local ops = t.v2.operaciones[op.tipo]
  ops = type(ops) == "table" and ops or {}
  local final, accion = op.nombre, "nueva"
  if ops[op.nombre] ~= nil then
    if operacionIgual(ops[op.nombre], op, enlaces, ops, op.nombre) then
      accion = "reutilizar"
    else
      accion = "renombrada"
      local k = 2
      while true do
        local sufijo = " " .. k
        local candidato = string.sub(op.nombre, 1, MAX_NOMBRE_OP - #sufijo) .. sufijo
        local cid = op.tipo .. "|" .. candidato
        if not t.porId[cid] and not t.reservados[cid] then
          if ops[candidato] == nil then
            final = candidato
            break
          elseif operacionIgual(ops[candidato], op, enlaces, ops, candidato) then
            final, accion = candidato, "reutilizar"
            break
          end
        end
        k = k + 1
      end
    end
  end
  t.reservados[op.tipo .. "|" .. final] = true
  t.finales[id] = final
  op.final, op.accion = final, accion
  return final
end

local function resolverOperaciones(t)
  local hasta = math.min(#t.ops, t.i + TROZO.operaciones - 1)
  for k = t.i, hasta do
    local op = t.ops[k]
    if op.valido then
      resolver(t, op, {})
    end
  end
  t.i = hasta + 1
  t.progreso = #t.ops > 0 and (t.i - 1) / #t.ops or 1
  return t.i > #t.ops
end

local function escribirOperaciones(t)
  local hasta = math.min(#t.ops, t.i + TROZO.operaciones - 1)
  for k = t.i, hasta do
    local op = t.ops[k]
    if op.valido and op.accion ~= "reutilizar" then
      if type(t.v2.operaciones[op.tipo]) ~= "table" then
        t.v2.operaciones[op.tipo] = t.v2.operaciones[op.tipo] == nil and {} or {[ROTO] = t.v2.operaciones[op.tipo]}
      end
      local ops = t.v2.operaciones[op.tipo]
      if ops[op.final] == nil then -- nunca se pisa
        local datos = {valores = copiar(op.valores)}
        if next(op.ignorarPersonajes) then
          datos.ignorarPersonajes = copiar(op.ignorarPersonajes)
        end
        if next(op.ignorarReinos) then
          datos.ignorarReinos = copiar(op.ignorarReinos)
        end
        ops[op.final] = datos
        op.escrita = true
      end
    end
  end
  t.i = hasta + 1
  t.progreso = #t.ops > 0 and (t.i - 1) / #t.ops or 1
  return t.i > #t.ops
end

local function escribirVinculos(t)
  for _, op in ipairs(t.ops) do
    if op.escrita then
      local ops = t.v2.operaciones[op.tipo]
      local datos = ops[op.final]
      local campos = {}
      for campo in pairs(op.enlaces or {}) do
        campos[#campos + 1] = campo
      end
      table.sort(campos)
      for _, campo in ipairs(campos) do
        local otra = op.enlaces[campo]
        if type(ops[otra]) == "table" and otra ~= op.final and not haceCiclo(ops, op.final, campo, otra) then
          datos.vinculos = datos.vinculos or {}
          datos.vinculos[campo] = otra
        end
      end
    end
  end
  return true
end

local function escribirGruposOps(t)
  if not t.conOverride then
    t.conOverride = {}
    for ruta in pairs(t.overrides) do
      t.conOverride[#t.conOverride + 1] = ruta
    end
    table.sort(t.conOverride)
    t.i = 1
  end
  local v2 = t.v2
  if type(v2.gruposOps) ~= "table" then
    v2.gruposOps = {}
  end
  local hasta = math.min(#t.conOverride, t.i + TROZO.grupos - 1)
  for k = t.i, hasta do
    local ruta = t.conOverride[k]
    if (ruta == "" or t.usados[ruta]) and vivo(t, ruta) then
      local nuevo = t.creados[ruta] == true
      for tipo, nombres in pairs(t.overrides[ruta]) do
        local g = v2.gruposOps[ruta]
        local suya = type(g) == "table" and type(g[tipo]) == "table"
        -- Juntar: el override que ya tenía el jugador en un grupo suyo (o en el Grupo Base) se queda.
        if nuevo or t.modo == "reemplazar" or not suya then
          local ops = type(v2.operaciones[tipo]) == "table" and v2.operaciones[tipo] or {}
          local lista, vistos = {}, {}
          for _, n in ipairs(nombres) do
            local final = t.finales[tipo .. "|" .. n]
            if final and type(ops[final]) == "table" and not vistos[final] then
              vistos[final] = true
              lista[#lista + 1] = final
            end
          end
          if type(g) ~= "table" then
            g = g == nil and {} or {[ROTO] = g}
            v2.gruposOps[ruta] = g
          end
          g[tipo] = lista
        end
      end
    end
  end
  t.i = hasta + 1
  t.progreso = #t.conOverride > 0 and (t.i - 1) / #t.conOverride or 1
  if t.i > #t.conOverride then
    t.conOverride = nil
    return true
  end
  return false
end

local function escribirObjetos(t)
  local objetos = t.v2.objetos
  local hechos = 0
  local fin = recorrer(t, t.tablas.objetos, TROZO.objetos, function(clave, ruta)
    hechos = hechos + 1
    if claveObjetoValida(clave) and type(ruta) == "string" and t.usados[ruta] and vivo(t, ruta) then
      local donde = objetos[clave]
      if donde ~= ruta and not (t.modo == "juntar" and not t.mover and type(donde) == "string" and donde ~= "") then
        objetos[clave] = ruta
      end
    end
  end)
  if SNF.Arbol then
    SNF.Arbol.olvidarIndice() -- se escribe a mano en v2.objetos (comercio/arbol.lua lo permite así)
  end
  t.vistos = (t.vistos or 0) + hechos
  t.progreso = t.cuenta.objetos > 0 and math.min(1, t.vistos / t.cuenta.objetos) or 1
  if fin then
    t.vistos = nil
  end
  return fin
end

---------------------------------------------------------------------------------------------------
-- Comprobar: se cuenta en lo nuestro lo que TSM tiene, y tiene que dar lo de analizar().
---------------------------------------------------------------------------------------------------

local function comprobarObjetos(t)
  local objetos = t.v2.objetos
  local inf = t.informe
  local hechos = 0
  local fin = recorrer(t, t.tablas.objetos, TROZO.comprobar, function(clave, ruta)
    hechos = hechos + 1
    if type(clave) == "string" and type(ruta) == "string" and ruta ~= "" then
      local donde = objetos[clave]
      if donde == ruta and t.usados[ruta] and vivo(t, ruta) then
        inf.objetos = inf.objetos + 1
      elseif t.modo == "juntar" and not t.mover and type(donde) == "string" and donde ~= "" and t.usados[ruta] and vivo(t, ruta) then
        inf.quedan = inf.quedan + 1 -- se quedó, como se pidió, en el grupo donde ya estaba
      else
        inf.comprobacion.faltan.objetos = inf.comprobacion.faltan.objetos + 1
      end
    end
  end)
  t.vistos = (t.vistos or 0) + hechos
  t.progreso = t.cuenta.objetos > 0 and math.min(1, t.vistos / t.cuenta.objetos) or 1
  return fin
end

local function comprobarResto(t)
  local inf, faltan = t.informe, t.informe.comprobacion.faltan
  if t.conBase then
    inf.grupos = 1 -- el grupo base de TSM es nuestro Grupo Base, que siempre existe
  end
  for _, ruta in ipairs(t.rutas) do
    if t.usados[ruta] and vivo(t, ruta) then
      inf.grupos = inf.grupos + 1
    else
      faltan.grupos[#faltan.grupos + 1] = ruta
    end
  end
  table.sort(faltan.grupos)
  for _, op in ipairs(t.ops) do
    local ops = t.v2.operaciones[op.tipo]
    if op.final and type(ops) == "table" and type(ops[op.final]) == "table" then
      inf.operaciones = inf.operaciones + 1
    else
      faltan.operaciones[#faltan.operaciones + 1] = op.tipo .. ": " .. op.nombre
    end
  end
  local suyas = SNF.Formulas.fuentes()
  for _, f in ipairs(t.fuentes) do
    if suyas[f.nombre] then
      inf.fuentes = inf.fuentes + 1
    else
      faltan.fuentes[#faltan.fuentes + 1] = f.escrito
    end
  end
  return true
end

-- Las fórmulas como quedaron guardadas: se prueban con Formulas.compilar (ya con las fuentes propias puestas).
local function comprobarFormulas(t)
  if not t.revisar then
    t.revisar = {}
    for _, e in ipairs(t.entradas) do
      if e.despues ~= "" then
        t.revisar[#t.revisar + 1] = e
      end
    end
    t.i = 1
  end
  local hasta = math.min(#t.revisar, t.i + TROZO.formulas - 1)
  local F = SNF.Formulas
  for k = t.i, hasta do
    local e = t.revisar[k]
    local salida = {antes = e.antes, despues = e.despues, desconocidas = e.desconocidas, fuente = e.fuente, tipo = e.tipo, campo = e.campo}
    if e.tipo then
      local op = t.porId[e.tipo .. "|" .. e.operacion]
      salida.operacion = op and op.final or e.operacion
    end
    local ok, f = pcall(F.compilar, e.despues)
    if not (ok and f) then
      t.informe.formulas.marcadas[#t.informe.formulas.marcadas + 1] = salida
    elseif e.antes ~= e.despues then
      t.informe.formulas.traducidas[#t.informe.formulas.traducidas + 1] = salida
    end
  end
  t.i = hasta + 1
  t.progreso = #t.revisar > 0 and (t.i - 1) / #t.revisar or 1
  if t.i > #t.revisar then
    t.revisar = nil
    return true
  end
  return false
end

---------------------------------------------------------------------------------------------------
-- El trabajo: fases, pasos y avance.
---------------------------------------------------------------------------------------------------

-- {función, peso en el avance}. Las 5 primeras solo leen (son las de analizar; la quinta es el diagnóstico de precios).
local FASES = {
  {leerFuentes, 1, "leerFuentes"}, {leerGrupos, 3, "leerGrupos"}, {leerOperaciones, 6, "leerOperaciones"},
  {leerObjetos, 10, "leerObjetos"}, {diagnosticar, 3, "diagnosticar"},
  {guardarAntes, 1, "guardarAntes"}, {escribirFuentes, 1, "escribirFuentes"},
  {escribirGrupos, 5, "escribirGrupos"}, {resolverOperaciones, 4, "resolverOperaciones"},
  {escribirOperaciones, 4, "escribirOperaciones"}, {escribirVinculos, 1, "escribirVinculos"},
  {escribirGruposOps, 4, "escribirGruposOps"}, {escribirObjetos, 30, "escribirObjetos"},
  {comprobarObjetos, 15, "comprobarObjetos"}, {comprobarResto, 2, "comprobarResto"},
  {comprobarFormulas, 13, "comprobarFormulas"},
}
local FASES_LEER = 5

local function nuevoTrabajo(base, c, v2)
  local _, reinoNuestroPj, reinoTSMPj = quienSoy()
  local existentes = {}
  for ruta in pairs(SNF.Arbol.grupos()) do
    existentes[ruta] = true
  end
  local O = SNF.Operaciones
  local cuenta = {grupos = 0, objetos = 0, operaciones = {}, totalOperaciones = 0, fuentes = 0, chocan = 0, enOtroGrupo = 0}
  for _, tipo in ipairs(O.ORDEN) do
    cuenta.operaciones[tipo] = 0
  end
  return {
    perfil = base.perfil, tablas = base.tablas, c = c, v2 = v2, mios = propios(), existentes = existentes,
    reinoNuestro = reinoNuestroPj, reinoTSM = reinoTSMPj,
    hayGrupos = next(existentes) ~= nil,
    cuenta = cuenta, fuentesTSM = {}, fuentes = {}, rutas = {}, overrides = {}, ops = {}, porId = {}, entradas = {},
    formulas = {traducidas = {}, marcadas = {}}, quitados = {personajes = 0, casas = 0, destinatarios = 0},
    finales = {}, reservados = {}, creados = {}, usados = {}, traducidas = {}, implicitos = {}, porRuta = {},
    memoRutas = {}, fase = 1, i = 1, cursor = nil, progreso = 0, base = 0, huella = 0,
  }
end

-- diagnosticos = {juntar = diagnostico, reemplazar = diagnostico} (al importar, solo el del modo); diagnostico = el de
-- `modoDiagnostico` (el del modo de la importación o, en la vista previa, el de Juntar, que es lo que se elige primero).
local function resumenDe(t)
  local diagnosticos = {}
  for modo, d in pairs(t.diagnosticos or {}) do
    diagnosticos[modo] = SNF.DiagnosticoTSM.resultado(d)
  end
  local modo = t.modo or "juntar"
  return {
    perfil = t.perfil, grupos = t.cuenta.grupos, objetos = t.cuenta.objetos, operaciones = copiar(t.cuenta.operaciones),
    totalOperaciones = t.cuenta.totalOperaciones, fuentes = t.cuenta.fuentes, chocan = t.cuenta.chocan,
    enOtroGrupo = t.cuenta.enOtroGrupo, hayGrupos = t.hayGrupos, quitados = copiar(t.quitados),
    formulas = copiar(t.formulas), huella = t.huella,
    diagnosticos = diagnosticos, modoDiagnostico = modo, diagnostico = diagnosticos[modo],
  }
end

-- Prepara un trabajo y su lectura, o nil y el motivo.
local function preparar()
  local base, motivo = leerBase()
  if not base then
    return nil, motivo
  end
  if not SNF.Formulas or not SNF.Operaciones or not SNF.Arbol then
    return nil, msg("IMPORTAR_TSM_FALLO")
  end
  local c, v2 = cuentaComercio(true)
  if not c then
    return nil, msg("IMPORTAR_TSM_FALLO")
  end
  return nuevoTrabajo(base, c, v2)
end

local function siguienteFase(t)
  t.base = t.base + FASES[t.fase][2]
  t.fase, t.i, t.cursor, t.progreso = t.fase + 1, 1, nil, 0
end

function ImportarTSM.analizar()
  local t, motivo = preparar()
  if not t then
    return nil, motivo
  end
  while t.fase <= FASES_LEER do
    if FASES[t.fase][1](t) then
      siguienteFase(t)
    end
  end
  return resumenDe(t)
end

local trabajo -- la importación en marcha o la última
local lectura -- la lectura en pasos (ImportarTSM.leer) en marcha o la última
local marcoCombate -- espera a PLAYER_REGEN_ENABLED mientras una importación está en pausa
local PESO_LEER = 0 -- lo que pesan en el avance las fases de leer (para que la lectura vaya de 0 a 100)
for k = 1, FASES_LEER do
  PESO_LEER = PESO_LEER + FASES[k][2]
end

local function avisar(t, clave)
  local f = t[clave]
  if type(f) == "function" then
    local manejador = rawget(_G, "geterrorhandler")
    xpcall(function()
      f(t.informe)
    end, manejador and manejador() or function() end)
  end
end

local function actualizarAvance(t)
  local fase = FASES[t.fase]
  local valor = t.base + (fase and fase[2] * (t.progreso or 0) or 0)
  if t.soloLeer then
    valor = valor * 100 / PESO_LEER
  end
  local n = math.min(99, math.floor(valor))
  if n > t.informe.avance then
    t.informe.avance = n -- solo crece
  end
end

local function mensajeComprobacion(inf)
  local f = inf.comprobacion.faltan
  local partes = {}
  if #f.grupos > 0 then
    partes[#partes + 1] = msg("IMPORTAR_TSM_FALTA_GRUPOS", #f.grupos, table.concat(f.grupos, ", ", 1, math.min(#f.grupos, 5)))
  end
  if f.objetos > 0 then
    partes[#partes + 1] = msg("IMPORTAR_TSM_FALTA_OBJETOS", f.objetos)
  end
  if #f.operaciones > 0 then
    partes[#partes + 1] = msg("IMPORTAR_TSM_FALTA_OPERACIONES", #f.operaciones,
      table.concat(f.operaciones, ", ", 1, math.min(#f.operaciones, 5)))
  end
  if #f.fuentes > 0 then
    partes[#partes + 1] = msg("IMPORTAR_TSM_FALTA_FUENTES", #f.fuentes, table.concat(f.fuentes, ", ", 1, math.min(#f.fuentes, 5)))
  end
  if #partes == 0 then
    return msg("IMPORTAR_TSM_COMPROBADO")
  end
  return msg("IMPORTAR_TSM_NO_CUADRA", table.concat(partes, "; "))
end

local function terminar(t, estado, mensaje)
  local inf = t.informe
  inf.estado = estado
  inf.mensaje = mensaje
  if estado == "hecho" then
    local e, c = inf.esperado, inf.comprobacion
    c.bien = inf.grupos == e.grupos and inf.objetos + inf.quedan == e.objetos and inf.operaciones == e.totalOperaciones
      and inf.fuentes == e.fuentes
    c.mensaje = mensajeComprobacion(inf)
    inf.avance = 100
  end
  if SNF.Arbol then
    pcall(SNF.Arbol.olvidarIndice) -- un fallo aquí no deja la importación sin terminar
  end
  if marcoCombate then
    marcoCombate:UnregisterEvent("PLAYER_REGEN_ENABLED")
  end
  -- Lo que ya no hace falta (las tablas de TSM y lo leído) se suelta; el informe se queda.
  t.tablas, t.ops, t.porId, t.entradas, t.traducidas, t.diagCola, t.diagnosticos, t.porRuta, t.memoRutas =
    nil, nil, nil, nil, nil, nil, nil, nil, nil
  t.rutas, t.overrides, t.fuentes, t.finales, t.reservados, t.creados, t.usados, t.existentes = nil, nil, nil, nil, nil, nil, nil, nil
  avisar(t, "alTerminar")
end

local paso

local function programar(t)
  C_Timer.After(0, function()
    paso(t)
  end)
end

-- Fallo en el juego (19-nov): el texto del error no quedaba en ningún sitio. Ahora se apunta en lo guardado
-- (SnetForeverCuenta.comercio.importarFallos, los 5 últimos: {cuando, fase, modo, texto}) y el mensaje al jugador dice la fase
-- y dónde quedó. El texto es el del error de Lua (sin datos de TSM de otros jugadores: de esas claves no se lee nada),
-- recortado a 300 letras. Devuelve el mensaje para el jugador.
local MAX_FALLOS = 5
local function apuntarFallo(t, fase, texto)
  -- En la tabla de comercio que se guarda AHORA (si la cuenta cambió por debajo, la del trabajo ya no se guarda).
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and type(cuenta.comercio) == "table" and cuenta.comercio or t.c
  if type(c) == "table" then
    if type(c.importarFallos) ~= "table" then
      c.importarFallos = c.importarFallos == nil and {} or {[ROTO] = c.importarFallos}
    end
    local lista = c.importarFallos
    -- Solo la primera línea del error. Este texto NUNCA debe llevar datos de TSM ni nombres de otros jugadores: es el mensaje
    -- de un error de Lua del addon (o el nuestro de la fase «cuenta»), no algo leído de TradeSkillMasterDB.
    local primera = string.match(tostring(texto), "^[^\n]*") or ""
    table.insert(lista, {cuando = ahora(), fase = fase, modo = t.soloLeer and "leer" or t.modo, texto = string.sub(primera, 1, 300)})
    while #lista > MAX_FALLOS do
      table.remove(lista, 1)
    end
  end
  return msg("IMPORTAR_TSM_FALLO_EN", fase)
end

-- Una lectura (ImportarTSM.leer) termina tras las fases de leer: el resumen queda en su informe.
local function terminarLectura(t, estado, mensaje)
  local inf = t.informe
  inf.estado, inf.mensaje = estado, mensaje
  if estado == "leido" then
    inf.resumen = resumenDe(t)
    inf.avance = 100
  end
  t.tablas, t.ops, t.porId, t.entradas, t.traducidas, t.diagCola, t.diagnosticos, t.porRuta, t.memoRutas =
    nil, nil, nil, nil, nil, nil, nil, nil, nil
  t.rutas, t.overrides, t.fuentes, t.existentes = nil, nil, nil, nil
  avisar(t, "alTerminar")
end

paso = function(t)
  local enMarcha = t.soloLeer and "leyendo" or "importando"
  if (t ~= trabajo and t ~= lectura) or t.informe.estado ~= enMarcha then
    return -- otra más nueva, cancelada o terminada
  end
  -- Leer no toca nada y cada paso está acotado: no hace falta parar en combate. Importar sí se pausa.
  if not t.soloLeer and enCombate() then
    -- En pausa, sin temporizadores: sigue con PLAYER_REGEN_ENABLED.
    t.informe.estado = "pausado"
    if not marcoCombate then
      marcoCombate = CreateFrame("Frame")
      marcoCombate:SetScript("OnEvent", function()
        local actual = trabajo
        if actual and actual.informe.estado == "pausado" and not enCombate() then
          marcoCombate:UnregisterEvent("PLAYER_REGEN_ENABLED")
          actual.informe.estado = "importando"
          avisar(actual, "alAvanzar")
          programar(actual)
        end
      end)
    end
    marcoCombate:RegisterEvent("PLAYER_REGEN_ENABLED")
    avisar(t, "alAvanzar")
    return
  end
  local acabar = t.soloLeer and terminarLectura or terminar
  local c, v2 = cuentaComercio(false)
  if c ~= t.c or v2 ~= t.v2 then
    acabar(t, "fallo", apuntarFallo(t, "cuenta", "la cuenta guardada cambió durante la importación")) -- no debería pasar
    return
  end
  t.implicitos = {}
  local ok, acabada = pcall(FASES[t.fase][1], t)
  if not ok then
    -- Un fallo de verdad (o TSM cambió su tabla mientras se recorría): se para, se dice y el error va al manejador del juego.
    acabar(t, "fallo", apuntarFallo(t, FASES[t.fase][3], acabada))
    local manejador = rawget(_G, "geterrorhandler")
    -- Si TSM cambió su tabla mientras se recorría (next da «invalid key»), no es un fallo del addon: basta con decirlo.
    if manejador and not string.find(tostring(acabada), "invalid key to 'next'", 1, true) then
      manejador()(acabada)
    end
    return
  end
  if acabada then
    if t.fase == FASES_LEER then
      t.informe.esperado = resumenDe(t)
      t.informe.quitados = copiar(t.quitados)
      -- Plan de paridad, entrega 1: lo que se va a escribir tiene que ser lo que el jugador revisó. Si TSM (o tus fuentes
      -- propias) cambió desde la vista previa, se para antes de escribir nada.
      if not t.soloLeer and t.huellaPedida ~= nil and t.huellaPedida ~= t.huella then
        terminar(t, "fallo", msg("IMPORTAR_TSM_CAMBIO"))
        return
      end
    end
    siguienteFase(t)
  end
  if t.soloLeer and t.fase > FASES_LEER then
    terminarLectura(t, "leido")
    return
  end
  if t.fase > #FASES then
    terminar(t, "hecho")
    return
  end
  actualizarAvance(t)
  avisar(t, "alAvanzar")
  programar(t)
end

function ImportarTSM.importar(opciones)
  opciones = type(opciones) == "table" and opciones or {}
  if trabajo and (trabajo.informe.estado == "importando" or trabajo.informe.estado == "pausado") then
    return nil, msg("IMPORTAR_TSM_YA")
  end
  if enCombate() then
    return nil, msg("IMPORTAR_TSM_COMBATE")
  end
  local t, motivo = preparar()
  if not t then
    return nil, motivo
  end
  t.modo = opciones.modo == "reemplazar" and "reemplazar" or "juntar"
  t.mover = opciones.moverObjetos == true
  t.huellaPedida = type(opciones.huella) == "number" and opciones.huella or nil
  t.alAvanzar, t.alTerminar = opciones.alAvanzar, opciones.alTerminar
  t.informe = {
    estado = "importando", modo = t.modo, avance = 0, grupos = 0, objetos = 0, operaciones = 0, fuentes = 0, quedan = 0,
    quitados = {personajes = 0, casas = 0, destinatarios = 0}, fuentesTuyas = {},
    formulas = {traducidas = {}, marcadas = {}},
    comprobacion = {bien = false, faltan = {grupos = {}, objetos = 0, operaciones = {}, fuentes = {}}},
  }
  trabajo = t
  programar(t)
  return t.informe
end

function ImportarTSM.estado()
  return trabajo and trabajo.informe or nil
end

-- Ronda 1: la lectura que pide la ventanita, en pasos (las 4 fases de leer), para no dar un tirón al abrirla.
function ImportarTSM.leer(opciones)
  opciones = type(opciones) == "table" and opciones or {}
  ImportarTSM.cancelarLectura()
  local t, motivo = preparar()
  if not t then
    return nil, motivo
  end
  t.soloLeer = true
  t.alAvanzar, t.alTerminar = opciones.alAvanzar, opciones.alTerminar
  t.informe = {estado = "leyendo", avance = 0, perfil = t.perfil}
  lectura = t
  programar(t)
  return t.informe
end

function ImportarTSM.lectura()
  return lectura and lectura.informe or nil
end

function ImportarTSM.cancelarLectura()
  if lectura and lectura.informe.estado == "leyendo" then
    lectura.informe.estado = "cancelada"
    lectura.tablas, lectura.ops, lectura.porId, lectura.entradas = nil, nil, nil, nil
  end
end

---------------------------------------------------------------------------------------------------
-- F2 (fallo en el juego, 20-nov): el inventario que TSM tiene contado, una vez, con un botón de Ajustes › Tooltip.
---------------------------------------------------------------------------------------------------

-- La base de TSM con sus dos tablas de dueños (_syncOwner y _syncAccountKey), o nil y el motivo.
local function baseInventario()
  local db = rawget(_G, GLOBAL_TSM)
  if type(db) ~= "table" then
    return nil, msg("IMPORTAR_TSM_INV_NO_HAY")
  end
  local duenos, cuentas = db._syncOwner, db._syncAccountKey
  if type(duenos) ~= "table" or type(cuentas) ~= "table" then
    return nil, msg("IMPORTAR_TSM_INV_FALTA")
  end
  return db, duenos, cuentas
end

function ImportarTSM.inventarioDisponible()
  local db, motivo = baseInventario()
  if not db then
    return false, motivo
  end
  return true
end

-- {[levelItemString] = n} de TSM -> {[itemID] = n} (las variantes de un objeto se suman; lo que no es «i:», fuera), o nil.
-- Ronda 1: vacía también da nil: TSM guarda {} aunque nunca haya visto ese banco o ese buzón, así que vacío no es «visto».
local function cantidades(t)
  if type(t) ~= "table" then
    return nil
  end
  local salida = {}
  for clave, n in pairs(t) do
    local id = type(clave) == "string" and tonumber(string.match(clave, "^i:(%d+)"))
    if id and id > 0 and type(n) == "number" and n > 0 then
      salida[id] = (salida[id] or 0) + math.floor(n)
    end
  end
  return next(salida) ~= nil and salida or nil
end

-- Ronda 1: en Forever TSM junta nombre y apellido con Constants.CharacterNameSeparatorConsts.CHARACTERNAME_SURNAME_SEPARATOR
-- (su LibTSMWoW/Source/Util/SessionInfo.lua), que no tiene por qué ser un espacio. Su nombre se parte por ese separador (o un
-- espacio si no está) y se rehace como SNF.Personaje.clave() («Nombre Apellido», con un espacio): así la ficha importada y
-- la nuestra tienen la misma clave. Da el nombre en nuestro formato y el primer nombre.
nombreDeTSM = function(nombre)
  local C = rawget(_G, "Constants")
  local seps = type(C) == "table" and rawget(C, "CharacterNameSeparatorConsts")
  local sep = type(seps) == "table" and rawget(seps, "CHARACTERNAME_SURNAME_SEPARATOR")
  if type(sep) ~= "string" or sep == "" then
    sep = " "
  end
  local i, j = string.find(nombre, sep, 1, true)
  if not i or i == 1 or j == #nombre then
    return nombre, nombre
  end
  local primero = string.sub(nombre, 1, i - 1)
  return primero .. " " .. string.sub(nombre, j + 1), primero
end

-- Los personajes propios del reino de ahora como los tiene TSM: {{nombre, clase, bolsas, banco, correo}…}.
-- Solo se recorre _syncOwner; de cada personaje propio se leen solo sus 4 claves.
local function personajesDeTSM(db, duenos, cuentas)
  local _, _, reinoTSM = quienSoy()
  local lista = {}
  if type(reinoTSM) ~= "string" then
    return lista
  end
  local claves = {}
  for clave, dueno in pairs(duenos) do
    local nombre, faccion, reino = nil, nil, nil
    if type(clave) == "string" then
      nombre, faccion, reino = string.match(clave, "^(.-) %- (.-) %- (.+)$")
    end
    -- Solo esta cuenta (el dueño es la cuenta local de esa facción y reino) y el reino de ahora, de cualquier facción.
    if nombre and nombre ~= "" and reino == reinoTSM and type(dueno) == "string" and dueno == cuentas[faccion .. " - " .. reino] then
      claves[#claves + 1] = clave
    end
  end
  table.sort(claves) -- el mismo orden siempre
  for _, clave in ipairs(claves) do
    local s = "s@" .. clave .. "@internalData@"
    local clase = db[s .. "classKey"]
    local nombre, primero = nombreDeTSM(string.match(clave, "^(.-) %- "))
    lista[#lista + 1] = {
      nombre = nombre,
      primero = primero,
      clase = type(clase) == "string" and clase ~= "" and clase or nil,
      bolsas = cantidades(db[s .. "bagQuantity"]),
      banco = cantidades(db[s .. "bankQuantity"]),
      correo = cantidades(db[s .. "mailQuantity"]),
    }
  end
  return lista
end

-- ImportarTSM.inventario() -> {personajes, objetos} | nil, motivo   trae de TSM las bolsas, el banco y el correo de los
-- personajes de esta cuenta y del reino de ahora (InventarioCuenta.rellenar: no pisa lo que ya hemos contado). Sin TSM, nil
-- y el motivo. Un fallo se apunta en importarFallos (fase «inventario») y da nil y el mensaje.
function ImportarTSM.inventario()
  local db, duenos, cuentas = baseInventario()
  if not db then
    return nil, duenos
  end
  local Inv = rawget(SNF, "InventarioCuenta")
  if type(Inv) ~= "table" or type(Inv.rellenar) ~= "function" then
    return nil, msg("IMPORTAR_TSM_INV_FALTA")
  end
  local ok, r = pcall(function()
    return Inv.rellenar(personajesDeTSM(db, duenos, cuentas), ahora())
  end)
  if not ok then
    return nil, apuntarFallo({modo = "inventario"}, "inventario", r)
  end
  return r
end

-- Correo (paridad con TSM, fase 4): el destinatario de una operación de Correo se guarda como lo escribió TSM. Para
-- compararlo con nuestros personajes hace falta pasarlo a nuestro formato con las mismas reglas que la importación.
-- ImportarTSM.nombreDeTSM(nombre) -> «Nombre Apellido», primer nombre   ImportarTSM.reinoDeTSM() -> reino de TSM | nil
function ImportarTSM.nombreDeTSM(nombre)
  if type(nombre) ~= "string" then
    return nil
  end
  return nombreDeTSM(nombre)
end

function ImportarTSM.reinoDeTSM()
  return reinoDeTSM()
end

-- Precio regional: las operaciones y fuentes propias importadas ANTES traducían DBRegionMarketAvg a snfmercado (el mercado
-- local). Ahora va a snfregional() (la media de toda la región que calcula la app). Esto pone al día lo importado entonces,
-- comparando con la configuración de TSM que el juego tiene cargada:
--   · solo un campo cuyo texto guardado es EXACTAMENTE la traducción vieja del de TSM (la operación del mismo tipo y nombre,
--     o «Nombre 2» de una importación al juntar): lo que el jugador editó a mano no se toca;
--   · solo si el de TSM nombra DBRegionMarketAvg (si no, la traducción no cambia).
-- Se hace una vez (comercio.v2.regionalActualizado = true) al entrar al mundo con TSM cargado; sin TSM, se reintenta en la
-- sesión siguiente.
-- ImportarTSM.actualizarRegional() -> cambiados | nil, motivo
function ImportarTSM.actualizarRegional()
  local base, motivo = leerBase()
  if not base then
    return nil, motivo
  end
  local _, v2 = cuentaComercio(false)
  if not v2 then
    return nil, "sin-cuenta"
  end
  local cambiados = 0
  local function revisar(deTSM, guardado)
    if type(deTSM) == "number" then
      deTSM = tostring(deTSM)
    end
    if type(deTSM) ~= "string" or type(guardado) ~= "string" or #deTSM > MAX_FORMULA then
      return nil
    end
    if not string.find(string.lower(deTSM), "dbregionmarketavg", 1, true) then
      return nil
    end
    local antes = recortar(deTSM)
    if SNF.Formulas.traducir(antes, true) ~= guardado then
      return nil
    end
    local nuevo = SNF.Formulas.traducir(antes)
    if nuevo == guardado then
      return nil
    end
    cambiados = cambiados + 1
    return nuevo
  end
  local opsTSM = base.tablas.operaciones
  for tipoTSM, tipo in pairs(TIPOS_TSM) do
    local deTSM, nuestras, campos = opsTSM[tipoTSM], v2.operaciones[tipo], CAMPOS[tipoTSM]
    if type(deTSM) == "table" and type(nuestras) == "table" and campos then
      for nombre, op in pairs(nuestras) do
        local suya = type(nombre) == "string" and (deTSM[nombre] or deTSM[string.match(nombre, "^(.-) %d+$") or ""])
        if type(suya) == "table" and type(op) == "table" and type(op.valores) == "table" then
          for campoTSM, def in pairs(campos) do
            if def[2] == "formula" or def[2] == "interruptor" then
              local nuevo = revisar(suya[campoTSM], op.valores[def[1]])
              if nuevo then
                op.valores[def[1]] = nuevo
              end
            end
          end
        end
      end
    end
  end
  if type(v2.fuentes) == "table" then
    for nombre, texto in pairs(base.tablas.fuentes) do
      local clave = type(nombre) == "string" and string.lower(nombre)
      if clave then
        local nuevo = revisar(texto, v2.fuentes[clave])
        if nuevo then
          v2.fuentes[clave] = nuevo
        end
      end
    end
  end
  v2.regionalActualizado = true
  return cambiados
end

SNF.Eventos.escuchar("PLAYER_ENTERING_WORLD", function()
  local _, v2 = cuentaComercio(false)
  if not v2 or v2.regionalActualizado == true then
    return
  end
  local ok, cambiados = pcall(ImportarTSM.actualizarRegional)
  if ok and type(cambiados) == "number" and cambiados > 0 then
    print(msg("COMERCIO_REGIONAL_ACTUALIZADO", cambiados))
  end
end)
