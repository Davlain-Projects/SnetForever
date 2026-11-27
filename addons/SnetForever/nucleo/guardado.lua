-- SnetForever: SavedVariables (SnetForeverCuenta y SnetForeverPJ) y ajustes con sus valores por defecto. Emite
-- SNF_AJUSTE_CAMBIADO con SNF.emitir (nucleo/eventos.lua, que se carga antes).
local _, SNF = ...

---------------------------------------------------------------------------------------------------
-- Guardado.
---------------------------------------------------------------------------------------------------

local Guardado = {}
SNF.Guardado = Guardado

-- Plantillas de las dos SavedVariables. Lo que no tiene valor por defecto (guia, volverA, ia.ruta, ia.banco y
-- viajeCerrado, el «Cómo llegar» que el jugador cerró: ui/ventana.lua) no aparece.
-- Comercio (fase 1 del comercio): grupos y reglas del jugador, casas conocidas («<reino>|<faccion>» = casa) y la
-- papelera de grupos. `v2` (ventana principal, tarea 11) es el árbol nuevo de grupos y objetos: grupos[ruta] = true,
-- objetos[clave] = ruta (un texto por objeto) y, por ahora vacías, operaciones y fuentes. Lo escribe SnetForever_Comercio
-- (comercio/arbol.lua), pero vive aquí para que sobreviva a apagar el comercio. `identidad`, `ultimoEscaneo`, `escaneos`
-- (F7: uno por subasta, con la facción de su subastador) y `ultimaReplica` (segundos del servidor del último
-- C_AuctionHouse.ReplicateItems, para no repetirlo antes de 15 min; comercio/escaneo.lua) no tienen valor por defecto.
-- F6b, tampoco (se crean cuando hacen falta): SnetForeverCuenta.reino = {ultimo, pj = {["Nombre Apellido"] = reino}}, el
-- último reino bueno de la cuenta y de cada personaje propio (nucleo/personaje.lua, Personaje.reino(): en Forever
-- GetRealmName() puede dar ""), y comercio.conocidasApartadas = {[clave] = {casa, hora}}, las casas conocidas guardadas con
-- el reino vacío que chocaban con otra al pasarlas al reino bueno (comercio/precios.lua; nada se borra).
local PLANTILLA_CUENTA = {
  esquema = 1,
  ajustes = {},
  fallos = {},
  comercio = {
    grupos = {}, reglas = {}, conocidas = {}, papelera = {},
    -- ventanaSubasta = nil: {x, y, ancho, alto} de nuestra ventana de la subasta, en píxeles: la esquina de arriba a la
    -- izquierda medida desde la de la pantalla (y hacia abajo) y el tamaño (bloque B, ui/subasta/ventana.lua; antes era {x, y}
    -- en unidades de UIParent, y se sigue leyendo). Sin valor por defecto: sin ella la ventana ocupa el rectángulo de la
    -- subasta (ui/comercio.lua, tarea 15e).
    tooltip = true, -- nuestras líneas en el tooltip de los objetos (SnetForever_Comercio, ui/tooltip.lua; /snet comercio tooltip)
    -- T1b, sin valor por defecto (los crea SnetForever_Comercio cuando hacen falta; no están aquí para que preparar(),
    -- que se llama muchísimo, no tenga más que mirar):
    --   tooltipLineas = {[clave] = true | false}: qué líneas del tooltip salen (ui/tooltip.lua, TooltipComercio.LINEAS;
    --     lo que no está vale su valor por defecto).
    --   inventario = {v = 2, pj = {["Nombre Apellido-Reino"] = {nombre, reino, clase, bolsas, banco, correo, tsm}},
    --     apartadas, deLaV1, bancoCuenta}: lo que lleva cada personaje propio y, aparte, el banco de cuenta (F2b); la forma
    --     entera, en comercio/inventario.lua.
    v2 = {grupos = {}, objetos = {}, operaciones = {}, fuentes = {}},
  },
}
local PLANTILLA_PJ = {
  esquema = 1,
  ajustes = {},
  progreso = {},
  saltados = {},
  retomados = {},
  avisos = {vistos = {}, pendientes = {}},
  -- Chat con la IA (fase 4). `ruta` y `banco` no tienen valor por defecto.
  ia = {cursor = 0, n = 0, marcas = {vender = {}, usar = {}}, chat = {}},
  -- Diario de objetos (ia/diario.lua): cómo consiguió el personaje cada objeto que importa.
  diario = {v = 1, e = {}, omitidos = 0},
  -- Dibujos de la IA en el mapa del mundo (mapa/dibujos.lua): trazos por uiMapID.
  dibujos = {v = 1, porMapa = {}},
}

-- Completa `destino` con lo que falte de `plantilla`. Un campo que debería ser tabla y no lo es se sustituye por
-- una tabla nueva que guarda el valor viejo en `_roto`, para no perderlo.
local function completar(destino, plantilla)
  for clave, valor in pairs(plantilla) do
    if type(valor) == "table" then
      if type(destino[clave]) ~= "table" then
        local viejo = destino[clave]
        destino[clave] = {}
        if viejo ~= nil then
          destino[clave]._roto = viejo
        end
      end
      completar(destino[clave], valor)
    elseif destino[clave] == nil then
      destino[clave] = valor
    end
  end
end

local function preparada(actual, plantilla)
  local tabla = actual
  if type(tabla) ~= "table" then
    tabla = {}
    if actual ~= nil then
      tabla._roto = actual
    end
  end
  completar(tabla, plantilla)
  return tabla
end

local function themeValue(value)
  return value == "azul" and "forge" or value
end

-- Se llama en ADDON_LOADED: deja las dos variables con todos sus campos.
function Guardado.preparar()
  SnetForeverCuenta = preparada(SnetForeverCuenta, PLANTILLA_CUENTA)
  SnetForeverPJ = preparada(SnetForeverPJ, PLANTILLA_PJ)
  local key = "ventana.tema"
  SnetForeverCuenta.ajustes[key] = themeValue(SnetForeverCuenta.ajustes[key])
  SnetForeverPJ.ajustes[key] = themeValue(SnetForeverPJ.ajustes[key])
end

---------------------------------------------------------------------------------------------------
-- Ajustes. Se guardan planos, con la clave con puntos («ventana.alfa») en SnetForeverPJ.ajustes y, si la clave es de
-- cuenta, también en SnetForeverCuenta.ajustes.
---------------------------------------------------------------------------------------------------

local Ajustes = {}
SNF.Ajustes = Ajustes

Ajustes.DEFECTO = {
  ["idioma"] = "cliente",
  ["version"] = "normal",
  ["guias.xp"] = 1,
  ["guias.automatizar"] = false,
  ["ventana.visible"] = true,
  ["guide.favorite"] = "auto",
  ["guide.details"] = false,
  ["ventana.escala"] = 1,
  ["ventana.ancho"] = 260,
  ["ventana.alfa"] = 0.92,
  ["ventana.tema"] = "forge",
  ["ventana.pasoArriba"] = true,
  ["ventana.bloqueada"] = false,
  ["ventana.siguientes"] = 3,
  ["ventana.ocultarEnCombate"] = false,
  ["objetivos.activo"] = true,
  ["guias.objetosActivos"] = true,
  ["objetivos.marcaPlaca"] = true,
  ["objetivos.soloCercanos"] = false,
  ["objetivos.escala"] = 1,
  ["objetivos.marca"] = 1, -- lote D (D1): marca de banda al pulsar (1-8; 0 = ninguna); la estrella, la que usa RestedXP
  ["flecha.activa"] = true,
  ["flecha.escala"] = 1,
  ["flecha.avisoLlegada"] = true,
  ["pines.mundo"] = true,
  ["pines.minimapa"] = true,
  ["pines.ia"] = true,
  ["pines.caminos"] = true, -- 11-nov: el camino de los PNJ que andan (mapa/pines-mundo.lua)
  ["pines.cuantos"] = 7,
  ["openmap.usar"] = true,
  ["openmap.ficha"] = true,
  ["pasos.saltarPorNivel"] = true,
  ["pasos.saltarGrises"] = true, -- lote D (D2): saltar solos los pasos de misiones grises para el personaje
  ["pasos.saltarNoDisponibles"] = true, -- 12-nov: saltar solos los pasos de misiones que el juego no daría (falta una previa)
  ["pasos.margenVerdes"] = 0, -- lote D (D2): saltar también las N verdes más bajas (las más cerca de ser grises)
  ["avisos.cadenas"] = true,
  ["avisos.mejoras"] = true, -- lote «Cadenas de mejoras»: los avisos de las cadenas de mejoras, encendidos por defecto
  ["avisos.mazmorras"] = false, -- con la versión por defecto («normal»); ver Ajustes.DEFECTO_SEGUN
  ["ia.modelo"] = "haiku",
  ["ia.inventario"] = false,
  ["minimapa.boton"] = true,
  ["minimapa.angulo"] = 225,
  -- Ventana principal de comercio (Task 12): la pestaña que estaba abierta (dashboard, contabilidad, grupos, operaciones o
  -- ajustes; cualquier otro valor se trata como grupos). principal.sitio no tiene valor por defecto: ver SIN_DEFECTO.
  ["principal.pestana"] = "grupos",
  -- Comercio, tarea 13 (en cobre): tope de gasto de la sesión, hasta el próximo /reload (0 = sin tope), y lo que cuesta
  -- una compra para que el botón Comprar la avise en rojo y pida un segundo clic (100000 = 10 de oro).
  ["comercioTope"] = 0,
  ["comercioAvisoOro"] = 100000,
  -- Comercio, tarea 14: segundos entre dos vueltas del sniper y si suena al encontrar algo (casilla en la pestaña
  -- Sniper de la ventana de comercio).
  ["comercioSniperCada"] = 5,
  ["comercioSniperSonido"] = true,
  -- Fase 3 de la paridad con TSM: qué decide un hallazgo del sniper. «regla» (la regla de sniper del grupo, el de siempre y
  -- el de lo guardado sin elegir) u «operaciones» (las operaciones de Sniper de los grupos, como TSM). Casilla en el
  -- engranaje de la barra de abajo.
  ["comercioSniperModo"] = "regla",
  -- Tope prudente: en modo operaciones, Sniper y Compras no pagan más que el menor entre el precio de mercado de tu casa
  -- y el regional, aunque la fórmula del «Precio máximo» permita más (Operaciones.topeCompra). Casilla en el engranaje.
  ["comercioTopePrudente"] = true,
  -- Comercio, ventana de compra (tarea 6): tras comprar, la ventana elige sola la fila buena siguiente (casilla en el
  -- engranaje de la barra de abajo). Con false se queda en «hecho» hasta que el jugador pulse otra fila.
  ["comercioSiguienteSola"] = true,
  ["auction.largeText"] = false,
  -- Comercio, tarea 9: la última vista que eligió el jugador dentro de la subasta, «snet» (la ventana de SnetForever,
  -- que cubre la de Blizzard) o «blizzard» (la de Blizzard). Se abre con la que dejó.
  ["comercioVista"] = "snet",
  -- «comercioActivo» (la casilla de la 0.6.4) ya no es un ajuste: desde la 0.7.0 el comercio es el addon
  -- SnetForever_Comercio y se apaga en la lista de addons. arranque.lua pasa el valor viejo a la lista y lo borra.
}

-- Valores por defecto que dependen de otro ajuste: solo cuentan mientras el jugador no ha guardado el suyo. Lote A, ronda 1
-- (ruling del controlador): los avisos de mazmorra están encendidos con «Con mazmorras» y apagados con «Normal», como
-- dejó la fase 3 (fase-3-cadenas.md:951); si el jugador cambia el ajuste a mano, manda lo que eligió con cualquier versión.
Ajustes.DEFECTO_SEGUN = {
  ["avisos.mazmorras"] = function()
    return Ajustes.get("version") == "mazmorras"
  end,
}

-- Claves que se comparten entre todos los personajes de la cuenta.
Ajustes.DE_CUENTA = {
  ["idioma"] = true,
  ["ventana.escala"] = true,
  ["ventana.ancho"] = true,
  ["ventana.alfa"] = true,
  -- Ruling F3-19: preferencias visuales, como el alfa.
  ["ventana.tema"] = true,
  ["ventana.pasoArriba"] = true,
  ["objetivos.escala"] = true,
  ["flecha.escala"] = true,
  ["ia.modelo"] = true,
  ["minimapa.boton"] = true,
  ["minimapa.angulo"] = true,
}

-- Rango y paso de los ajustes numéricos con control deslizante (para la ventana de ajustes).
Ajustes.LIMITES = {
  ["guias.xp"] = {min = 0.1, max = 10, paso = 0.05},
  ["ventana.escala"] = {min = 0.6, max = 1.6, paso = 0.05},
  ["ventana.ancho"] = {min = 220, max = 500, paso = 10},
  ["ventana.alfa"] = {min = 0.2, max = 1, paso = 0.05},
  ["ventana.siguientes"] = {min = 0, max = 8, paso = 1},
  ["flecha.escala"] = {min = 0.5, max = 2, paso = 0.1},
  ["pines.cuantos"] = {min = 1, max = 15, paso = 1},
  ["objetivos.escala"] = {min = 0.6, max = 1.6, paso = 0.05},
  ["pasos.margenVerdes"] = {min = 0, max = 5, paso = 1},
  -- Comercio, tarea 13 (cobre; paso de 1 de oro; como mucho 100 000 de oro). No tienen deslizador en el panel de la
  -- guía: se ponen en el engranaje de la barra de la ventana de comercio (ui/comercio.lua), en oro entero, y comercio/compra.lua
  -- recorta con estos límites lo que haya guardado. La IA no los toca.
  ["comercioTope"] = {min = 0, max = 1000000000, paso = 10000},
  ["comercioAvisoOro"] = {min = 0, max = 1000000000, paso = 10000},
  -- Comercio, tarea 14 (segundos): comercio/sniper.lua recorta con estos límites lo que haya guardado.
  ["comercioSniperCada"] = {min = 1, max = 60, paso = 1},
}

-- Valores posibles de los ajustes de lista.
Ajustes.OPCIONES = {
  ["ia.modelo"] = {"haiku", "sonnet", "opus"}, -- «Rápido», «Más listo» y «El más capaz»
  ["ventana.tema"] = {"forge", "neutro"},
  ["principal.pestana"] = {"dashboard", "contabilidad", "grupos", "operaciones", "ajustes"},
  ["comercioVista"] = {"snet", "blizzard"},
  ["comercioSniperModo"] = {"regla", "operaciones"},
  ["objetivos.marca"] = {0, 1, 2, 3, 4, 5, 6, 7, 8},
}

-- Claves conocidas que no tienen valor por defecto (nil): las posiciones guardadas de la ventana, la flecha y el marco de
-- objetivos cercanos, y el último apartado abierto del panel de opciones (Ruling F3-34; sin valor, «guia»).
local SIN_DEFECTO = {
  ["window.scales"] = true,
  ["ventana.pos"] = true,
  ["flecha.pos"] = true,
  ["objetivos.pos"] = true,
  ["chat.pos"] = true,
  -- Ventana principal de comercio: {x, y, ancho, alto} en píxeles; x e y son la esquina de arriba a la izquierda de la
  -- ventana medida desde la de la pantalla (y hacia abajo).
  ["principal.sitio"] = true,
  ["panel.apartado"] = true,
}

local function conocida(clave)
  return Ajustes.DEFECTO[clave] ~= nil or SIN_DEFECTO[clave] == true
end

-- Valor guardado en el personaje; si no hay y la clave es de cuenta, el de la cuenta; si no, el valor por defecto.
-- Una clave desconocida da nil. Funciona también antes de Guardado.preparar() (da los valores por defecto).
function Ajustes.get(clave)
  local pj = type(SnetForeverPJ) == "table" and type(SnetForeverPJ.ajustes) == "table" and SnetForeverPJ.ajustes or nil
  if pj and pj[clave] ~= nil then
    return pj[clave]
  end
  if Ajustes.DE_CUENTA[clave] then
    local cuenta = type(SnetForeverCuenta) == "table" and type(SnetForeverCuenta.ajustes) == "table"
      and SnetForeverCuenta.ajustes or nil
    if cuenta and cuenta[clave] ~= nil then
      return cuenta[clave]
    end
  end
  local segun = Ajustes.DEFECTO_SEGUN[clave]
  if segun then
    return segun()
  end
  return Ajustes.DEFECTO[clave]
end

-- Escribe en el personaje y, si la clave es de cuenta, también en la cuenta. Emite SNF_AJUSTE_CAMBIADO(clave, valor).
-- Una clave desconocida da error. Con valor nil se borra lo guardado (vuelve al valor por defecto).
function Ajustes.set(clave, valor)
  if not conocida(clave) then
    error("Ajustes.set: clave desconocida " .. tostring(clave), 2)
  end
  Guardado.preparar()
  if clave == "ventana.tema" then valor = themeValue(valor) end
  SnetForeverPJ.ajustes[clave] = valor
  if Ajustes.DE_CUENTA[clave] then
    SnetForeverCuenta.ajustes[clave] = valor
  end
  SNF.emitir("SNF_AJUSTE_CAMBIADO", clave, valor)
end

-- Como Ajustes.set, pero sin emitir SNF_AJUSTE_CAMBIADO: para lo que solo recuerda el propio marco que lo guarda (el
-- último apartado del panel, panel.apartado) y no debe repintar nada más (ronda 1 de F3-34).
function Ajustes.guardarSinAviso(clave, valor)
  if not conocida(clave) then
    error("Ajustes.guardarSinAviso: clave desconocida " .. tostring(clave), 2)
  end
  Guardado.preparar()
  if clave == "ventana.tema" then valor = themeValue(valor) end
  SnetForeverPJ.ajustes[clave] = valor
  if Ajustes.DE_CUENTA[clave] then
    SnetForeverCuenta.ajustes[clave] = valor
  end
end

-- Vuelve al valor por defecto (borra lo guardado en el personaje y en la cuenta) y emite el cambio con el valor que
-- queda en vigor.
function Ajustes.restablecer(clave)
  if not conocida(clave) then
    error("Ajustes.restablecer: clave desconocida " .. tostring(clave), 2)
  end
  Guardado.preparar()
  SnetForeverPJ.ajustes[clave] = nil
  SnetForeverCuenta.ajustes[clave] = nil
  SNF.emitir("SNF_AJUSTE_CAMBIADO", clave, Ajustes.get(clave))
end
