-- SnetForever: marco «Objetivos cercanos» (nuestra versión de «Active Targets» de RestedXP, plano 6 §b.6 y §c.4).
-- Hasta 12 botones con el icono (o el retrato) de cada PNJ que pide el paso activo: pulsar uno hace que el JUGADOR fije
-- ese objetivo (macro «/targetexact <nombre>» de un botón seguro). La lista y la detección (visto, cerca, lejos) son de
-- mapa/cercanos.lua; aquí solo se dibuja.
--
-- Excepción aprobada (F3-10): este es el ÚNICO archivo del addon que usa SecureActionButtonTemplate (el comprobador de
-- Lua 5.1 lo permite solo aquí y solo con esa plantilla). Es un clic del jugador con el ratón, como en RestedXP: el
-- addon no fija objetivos, no llama a TargetUnit, SetRaidTarget ni SetCVar y no crea macros.
--
-- Marca de banda (lote D, D1: petición del autor, 10-nov, tras ponerle a mano la estrella a Helbrim): al pulsar, además de
-- fijar el objetivo, se le pone una marca (ajuste objetivos.marca: 1-8, la estrella por defecto, o 0 = ninguna). Marcar
-- es solo visual y no juega por el jugador. En Forever SetRaidTarget no se puede llamar desde el código (RestedXP sale
-- antes de llamarla y lo dice: «Retail/Forever cannot SetRaidTarget automatically, leverage button», Targeting.lua:56;
-- ForeverDungeonJournal deja la marca «dentro de la macro del clic», MapMarkers.lua:158-162), así que la marca va en la
-- misma macro del botón seguro y la pone el clic del jugador, también en combate. Ronda 1 (I1): como el RestedXP instalado
-- (Targeting.lua:53-71), con marca la macro es «/cleartarget», «/targetexact <nombre>» y «/tm !N», en todos los estados.
-- «!» es la forma de Forever que no alterna (RXP Targeting.lua:64 y :244; «~» es la de retail ≥ 12.0): pulsar otra vez
-- no quita la marca, también con los amistosos (ruling del controlador; RXP los deja alternar). /cleartarget va delante
-- para que, si el PNJ no está a tiro, no quede objetivo y /tm no marque al que el jugador ya tenía (como RXP: con marca,
-- pulsar un PNJ lejano deja al jugador sin objetivo). Con «ninguna», solo la línea /targetexact, sin /cleartarget. La
-- marca del cliente pasa sola al nuevo objetivo. Si el cliente no tiene la orden (SecureCmdList sin TARGET_MARKER), no hay
-- marca y el panel oculta la opción. Nada de GetRaidTargetIndex (puede ser secreto en Forever).
--
-- Objetivos.crear() -> marco     crea SnetForeverObjetivos (una sola vez), cuelga de UIParent en MEDIUM, sujeto a la
--                                pantalla, movible por su pestaña (la posición se guarda en objetivos.pos; por defecto
--                                LEFT, 20, 60: a la izquierda de la ventana). NO se ancla a la ventana. Los 12 botones
--                                se crean aquí si se está fuera de combate; si no, al salir (PLAYER_REGEN_ENABLED).
-- Objetivos.pintar()             pinta la lista (SNF_OBJETIVOS_CAMBIADOS y los ajustes objetivos.* lo llaman).
--                                Fuera de combate aplica todo: atributos, posiciones, tamaño, escala y visibilidad.
--                                En combate solo toca las REGIONES (icono, retrato, borde y alfa) y apunta pendiente;
--                                al salir de combate lo aplaza todo (el marco y sus botones quedan protegidos).
-- Objetivos.hayPendiente()       si hay cambios aplazados por el combate.
-- Objetivos.macroTodos()         la macro del atajo único SnetForeverObjetivosTodos (o nil): todos los objetivos que
--                                enseña el marco en una sola pulsación del jugador. Van en orden inverso de prioridad
--                                (el primero de la lista es la última línea: gana el último /targetexact que encuentra
--                                a su PNJ), con la marca como en los botones y con MAX_MACRO bytes como mucho, el límite
--                                de una macro del cliente. Si no cabe todo, se quitan primero los últimos de la lista. Se
--                                aplica solo fuera de combate, como los 12 botones: en combate sigue la anterior y la
--                                nueva se pone al salir. No crea ni edita macros del jugador.
-- Objetivos.marcos = {raiz, pestana, botones}   (para las pruebas). Cada botón: .icono (textura), .bordes (arriba,
--                                abajo, izquierda, derecha; el juego visible) y .bordesFinos/.bordesGruesos, .clave (de la entrada que lleva), .entrada, .seguro.
--
-- Medidas (b.6): botón de 26x26 cada 28, 4 por fila; márgenes laterales de 6, superior de 15 (por la pestaña) e inferior
-- de 6; 5 de hueco entre el bloque de enemigos (mob y unitscan, arriba) y el de amistosos (target, abajo).
--   ancho = max(pestaña + 10, 6 + columnas·28 − 2 + 6)   con columnas = lo que mide la fila más ancha (como mucho 4)
--   alto  = 15 + filas·28 − 2 + 6                         más 5 si hay enemigos y amistosos
-- Estados (el borde de 2 px se dibuja con WHITE8X8 y el icono cambia de transparencia; el botón seguro no se toca con
-- SetAlpha): lejos (alfa 0,45, borde de 1 px «borde»), cerca (0,8, 1 px «secundario») y visto (1, 2 px del color del
-- tipo: enemigo #FF5722, peligroso #FCDC00, amistoso #00FF25). Un unitscan que aún no se ha visto lleva el borde de
-- aviso (#FCDC00) en lugar del de su estado. Orden: vistos, cercanos y lejos; dentro de cada grupo, el de la guía.
-- Iconos: provisional hasta ver la unidad (INV_Sword_04 para enemigos, ChatBubble_64Grey para amistosos) y su
-- retrato (SetPortraitTexture) cuando se ve; el último retrato se queda mientras el botón siga con ese PNJ.
--
-- Si CreateFrame falla con la plantilla segura salen botones normales (el marco sigue informando) y la ayuda dice
-- «Escribe /tar Nombre». Las APIs que pueden faltar (SetPortraitTexture, GetCVar) se tratan con pcall o comprobando
-- antes: nunca dan error.
local _, SNF = ...
local Objetivos = {}
SNF.Objetivos = Objetivos

local L = SNF.L
local Ajustes = SNF.Ajustes
local Estilo = SNF.Estilo

local NOMBRE = "SnetForeverObjetivos"
local NOMBRE_TODOS = "SnetForeverObjetivosTodos" -- el atajo único (CLICK SnetForeverObjetivosTodos:LeftButton)
local MAXIMO = 12
local MAX_MACRO = 255 -- bytes de una macro del cliente
local MAX_NOMBRE = 200 -- caracteres del nombre en la macro
local PREFIJO_MARCA = "!" -- Forever: «/tm !N» pone la marca sin alternar (RXP Targeting.lua:64); «~» es de retail ≥ 12.0
local TAMANO = 26 -- botón
local PASO = 28 -- de botón a botón
local POR_FILA = 4
local LATERAL = 6
local SUPERIOR = 15
local INFERIOR = 6
local HUECO = 5 -- entre enemigos y amistosos
local ALTO_PESTANA = 17
local POS_PESTANA = {x = 5, y = 8}
local GROSOR_BORDE = {lejos = 1, cerca = 1, visto = 2}
local ALFA_ICONO = {lejos = 0.45, cerca = 0.8, visto = 1}
local ICONO_ENEMIGO = "Interface\\Icons\\INV_Sword_04"
local ICONO_AMISTOSO = "Interface\\WorldMap\\ChatBubble_64Grey"
local RESALTE = "Interface\\Buttons\\ButtonHilight-Square"
local RECORTE = {0.08, 0.92}
-- A la izquierda de la ventana de guía y a su altura (como «Active Targets» respecto a RestedXP): la ventana empieza en
-- x = 160 y este marco mide como mucho 122 de ancho (4 columnas) con la escala 1.
local POS_DEFECTO = {punto = "LEFT", relPunto = "LEFT", x = 20, y = 60}
local PUNTOS = {
  CENTER = true, TOP = true, BOTTOM = true, LEFT = true, RIGHT = true,
  TOPLEFT = true, TOPRIGHT = true, BOTTOMLEFT = true, BOTTOMRIGHT = true,
}

-- «RRGGBB» a {r, g, b}.
local function hex(h)
  return {
    tonumber(string.sub(h, 1, 2), 16) / 255,
    tonumber(string.sub(h, 3, 4), 16) / 255,
    tonumber(string.sub(h, 5, 6), 16) / 255,
  }
end

local COLOR_TIPO = {mob = hex("FF5722"), unitscan = hex("FCDC00"), target = hex("00FF25")}
local COLOR_AVISO = COLOR_TIPO.unitscan

local raiz, pestana
local botones = {}
local todos -- el botón seguro del atajo único (oculto: se pulsa con su tecla)
local creados = false -- ya están los 12 botones
local pendiente = false -- hay cambios aplazados por el combate
local pendienteAjustes = false -- un ajuste (escala, posición, activo...) cambió en combate
local firmaAplicada -- la lista que llevan ahora los botones (atributos y posiciones)
local debeColocar = true -- hay que volver a poner el marco en objetivos.pos
local moviendo = false -- arrastrando la pestaña
local soltarPendiente = false -- se soltó la pestaña en combate
local pintando = false -- contra la reentrada (Cercanos.ordenada puede emitir mientras se pinta)

Objetivos.marcos = {botones = botones}

---------------------------------------------------------------------------------------------------
-- Utilidades
---------------------------------------------------------------------------------------------------

local function enCombate()
  return InCombatLockdown() == true
end

local function esEnemigo(e)
  return e.tipo ~= "target"
end

local function colorTipo(tipo)
  return COLOR_TIPO[tipo] or COLOR_TIPO.mob
end

local function nombreDe(e)
  return e.nombreMacro or (type(e.nombres) == "table" and e.nombres[1]) or e.clave or ""
end

-- ¿El cliente tiene la orden de marcar (/tm)? Sin SecureCmdList no se puede saber y se da por buena (Forever la tiene:
-- la usan RestedXP y ForeverDungeonJournal); solo si SecureCmdList existe y no trae TARGET_MARKER, no.
function Objetivos.marcaDisponible()
  local lista = rawget(_G, "SecureCmdList")
  if type(lista) ~= "table" then
    return true
  end
  return lista.TARGET_MARKER ~= nil
end

-- La marca elegida (1-8) o 0: «ninguna», un valor que no es una marca o un cliente sin la orden.
local function marcaElegida()
  local n = tonumber(Ajustes.get("objetivos.marca"))
  if n == nil or n ~= math.floor(n) or n < 1 or n > 8 or not Objetivos.marcaDisponible() then
    return 0
  end
  return n
end

-- Sin marca, una línea /targetexact; con marca, la macro de RestedXP en Forever (ver la cabecera). El nombre va sin
-- controles (saltos de línea...) ni «|» (códigos de color) y con 200 caracteres como mucho: no puede meter otra línea.
local function lineaObjetivo(e)
  local nombre = (string.gsub(nombreDe(e), "[%c|]", "")) -- los paréntesis: gsub devuelve también la cuenta
  return "/targetexact " .. string.sub(nombre, 1, MAX_NOMBRE)
end

local function macroDe(e)
  local marca = marcaElegida()
  if marca == 0 then
    return lineaObjetivo(e)
  end
  return "/cleartarget\n" .. lineaObjetivo(e) .. "\n/tm " .. PREFIJO_MARCA .. string.format("%d", marca)
end

-- La macro del atajo único con las entradas en su orden de prioridad (ver la cabecera), o nil si no cabe ninguna.
local function macroDeTodas(lista)
  local marca = marcaElegida()
  local antes = marca > 0 and "/cleartarget\n" or ""
  local despues = marca > 0 and ("\n/tm " .. PREFIJO_MARCA .. string.format("%d", marca)) or ""
  local lineas, vistas = {}, {}
  local bytes = #antes + #despues
  for _, e in ipairs(lista) do
    local linea = lineaObjetivo(e)
    if not vistas[linea] then
      local extra = #linea + (#lineas > 0 and 1 or 0)
      if bytes + extra > MAX_MACRO then
        break
      end
      vistas[linea] = true
      bytes = bytes + extra
      lineas[#lineas + 1] = linea
    end
  end
  if #lineas == 0 then
    return nil
  end
  local inversas = {}
  for i = #lineas, 1, -1 do
    inversas[#inversas + 1] = lineas[i]
  end
  return antes .. table.concat(inversas, "\n") .. despues
end

-- Valor del CVar (solo se LEE), o nil si la API no está.
local function leerCVar(nombre)
  local f = rawget(_G, "GetCVar")
  if type(f) ~= "function" then
    return nil
  end
  local ok, valor = pcall(f, nombre)
  return ok and valor or nil
end

-- Las entradas que hay que enseñar: las de Cercanos.ordenada(), como mucho 12.
local function visibles()
  local Cercanos = SNF.Cercanos
  local lista = Cercanos and Cercanos.ordenada() or {}
  local salida = {}
  for i = 1, math.min(#lista, MAXIMO) do
    salida[i] = lista[i]
  end
  return salida
end

-- Reparte en el bloque de enemigos (mob y unitscan) y el de amistosos (target), cada uno en el orden de la lista.
local function repartir(lista)
  local enemigos, amistosos = {}, {}
  for _, e in ipairs(lista) do
    local grupo = esEnemigo(e) and enemigos or amistosos
    grupo[#grupo + 1] = e
  end
  return enemigos, amistosos
end

-- Las entradas vivas de Cercanos por clave: en combate el botón sigue con su clave, pero su estado es el de ahora.
local function vivasPorClave()
  local salida = {}
  local Cercanos = SNF.Cercanos
  local lista = Cercanos and Cercanos.lista() or {}
  for _, e in ipairs(lista) do
    salida[e.clave] = e
  end
  return salida
end

-- Lo que lleva cada botón (clave, tipo y macro, en orden): si cambia, hay que reaplicar atributos y posiciones.
local function firmaDe(enemigos, amistosos)
  local partes = {}
  for _, grupo in ipairs({enemigos, amistosos}) do
    for _, e in ipairs(grupo) do
      partes[#partes + 1] = e.clave .. "\1" .. e.tipo .. "\1" .. macroDe(e)
    end
    partes[#partes + 1] = "\2"
  end
  return table.concat(partes, "\3")
end

---------------------------------------------------------------------------------------------------
-- Regiones (se pueden cambiar en combate)
---------------------------------------------------------------------------------------------------

-- Cada botón lleva dos juegos de bordes ya dimensionados (1 y 2 px): cambiar el grosor es mostrar uno y ocultar el otro
-- (texturas, que no están protegidas), sin SetHeight ni SetWidth. b.bordes es el juego visible.
local function ponerBorde(b, color, grosor)
  local activo = grosor == 2 and b.bordesGruesos or b.bordesFinos
  local otro = grosor == 2 and b.bordesFinos or b.bordesGruesos
  for _, t in pairs(otro) do
    t:Hide()
  end
  for _, t in pairs(activo) do
    t:SetVertexColor(color[1], color[2], color[3], 1)
    t:Show()
  end
  b.bordes = activo
end

-- Una entrada «vista» por el ratón lo sigue estando 10 s, pero "mouseover" es la unidad que hay bajo el ratón AHORA: su
-- retrato solo vale si esa unidad sigue siendo esta entrada (si no, se pintaría otra unidad o nada).
local function unidadEsLaEntrada(e)
  if e.unidad ~= "mouseover" then
    return true
  end
  local ok, actual = pcall(SNF.Cercanos.reconocer, "mouseover")
  return ok and type(actual) == "table" and actual.clave == e.clave
end

-- Retrato de la unidad con la que se ve; si no, el icono provisional (o el último retrato si sigue siendo el mismo PNJ).
local function ponerIcono(b, e)
  if e.unidad ~= nil and unidadEsLaEntrada(e) then
    local retrato = rawget(_G, "SetPortraitTexture")
    if type(retrato) == "function" and pcall(retrato, b.icono, e.unidad) then
      b.retratoDe = e.clave
      b.icono:SetTexCoord(0, 1, 0, 1)
      return
    end
  end
  if b.retratoDe == e.clave then
    return
  end
  b.retratoDe = nil
  b.icono:SetTexture(esEnemigo(e) and ICONO_ENEMIGO or ICONO_AMISTOSO)
  b.icono:SetTexCoord(RECORTE[1], RECORTE[2], RECORTE[1], RECORTE[2])
end

local function pintarRegiones(vivas)
  for _, b in ipairs(botones) do
    local e = b.clave and (vivas[b.clave] or b.entrada) or nil
    if e then
      b.entrada = e
      local estado = ALFA_ICONO[e.estado] and e.estado or "lejos"
      ponerIcono(b, e)
      b.icono:SetAlpha(ALFA_ICONO[estado])
      local color
      if estado == "visto" then
        color = colorTipo(e.tipo)
      elseif e.tipo == "unitscan" then
        color = COLOR_AVISO
      elseif estado == "cerca" then
        color = Estilo.color("secundario")
      else
        color = Estilo.color("borde")
      end
      ponerBorde(b, color, GROSOR_BORDE[estado])
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Estructura (solo fuera de combate)
---------------------------------------------------------------------------------------------------

local function colocar()
  local pos = Ajustes.get("objetivos.pos")
  if type(pos) ~= "table" or not PUNTOS[pos.punto] or not PUNTOS[pos.relPunto] or type(pos.x) ~= "number"
    or type(pos.y) ~= "number" then
    pos = POS_DEFECTO
  end
  raiz:ClearAllPoints()
  raiz:SetPoint(pos.punto, UIParent, pos.relPunto, pos.x, pos.y)
  debeColocar = false
end

local function escala()
  local limites = Ajustes.LIMITES["objetivos.escala"]
  local valor = tonumber(Ajustes.get("objetivos.escala")) or 1
  return math.max(limites.min, math.min(limites.max, valor))
end

-- Pone el botón k en la fila y columna dadas (solo si cambia).
local function colocarBoton(b, fila, columna, extra)
  if b.fila == fila and b.columna == columna and b.extra == extra then
    return
  end
  b.fila, b.columna, b.extra = fila, columna, extra
  b:ClearAllPoints()
  b:SetPoint("TOPLEFT", raiz, "TOPLEFT", LATERAL + columna * PASO, -(SUPERIOR + fila * PASO + extra))
end

local function ocultarBoton(b)
  b.clave, b.entrada, b.retratoDe = nil, nil, nil
  if b:IsShown() then
    b:Hide()
  end
end

-- Asigna cada entrada a un botón (atributos, posición y visibilidad) y da tamaño, escala y visibilidad al marco.
local function aplicar(enemigos, amistosos)
  local texto = L.t("SEC_OBJETIVOS")
  if pestana.texto:GetText() ~= texto then
    pestana.ponerTexto(texto)
  end
  local nE, nA = #enemigos, #amistosos
  local filasE = math.ceil(nE / POR_FILA)
  local filasA = math.ceil(nA / POR_FILA)
  local k = 0
  local function poner(grupo, filaInicial, extra)
    for i, e in ipairs(grupo) do
      k = k + 1
      local b = botones[k]
      b.clave, b.entrada = e.clave, e
      if b.seguro then
        local macro = macroDe(e)
        if b:GetAttribute("macrotext") ~= macro then
          b:SetAttribute("macrotext", macro)
        end
      end
      colocarBoton(b, filaInicial + math.floor((i - 1) / POR_FILA), (i - 1) % POR_FILA, extra)
      if not b:IsShown() then
        b:Show()
      end
    end
  end
  poner(enemigos, 0, 0)
  poner(amistosos, filasE, nE > 0 and HUECO or 0)
  for i = k + 1, #botones do
    ocultarBoton(botones[i])
  end

  local columnas = math.max(math.min(nE, POR_FILA), math.min(nA, POR_FILA))
  local ancho = math.max(pestana:GetWidth() + 10, LATERAL + columnas * PASO - 2 + LATERAL)
  local alto = SUPERIOR + (filasE + filasA) * PASO - 2 + INFERIOR + ((nE > 0 and nA > 0) and HUECO or 0)
  if raiz:GetWidth() ~= ancho or raiz:GetHeight() ~= alto then
    raiz:SetSize(ancho, alto)
  end
  SNF.WindowSizing.base(raiz, escala())
  if debeColocar and not moviendo then
    colocar()
  end
  local visible = Ajustes.get("objetivos.activo") ~= false and k > 0
  if raiz:IsShown() ~= visible then
    raiz:SetShown(visible)
  end
  if todos then
    local macro = visible and macroDeTodas(visibles()) or nil
    if todos:GetAttribute("macrotext") ~= macro then
      todos:SetAttribute("macrotext", macro)
    end
  end
  firmaAplicada = firmaDe(enemigos, amistosos)
  pendiente, pendienteAjustes = false, false
end

---------------------------------------------------------------------------------------------------
-- Ayuda
---------------------------------------------------------------------------------------------------

local function tooltipLibre()
  return GameTooltip ~= nil and not GameTooltip:IsForbidden()
end

local function ayudaBoton(b)
  local e = b.entrada
  if e == nil or not tooltipLibre() then
    return
  end
  local nombre = nombreDe(e)
  local c = colorTipo(e.tipo)
  local g = Estilo.color("secundario")
  GameTooltip:SetOwner(b, "ANCHOR_RIGHT")
  GameTooltip:SetText(nombre, c[1], c[2], c[3])
  -- Lote C, ronda 1: el número de la lista de la ventana; un paso que no sale en ella, sin número.
  local paso = tonumber(e.paso)
  local linea = paso and L.t(esEnemigo(e) and "OBJ_ENEMIGO" or "OBJ_PNJ", math.floor(paso))
    or L.t(esEnemigo(e) and "OBJ_ENEMIGO_SIN_NUMERO" or "OBJ_PNJ_SIN_NUMERO")
  GameTooltip:AddLine(linea, g[1], g[2], g[3])
  GameTooltip:AddLine(b.seguro and L.t("OBJ_CLIC") or L.t("OBJ_ESCRIBE", nombre), g[1], g[2], g[3])
  if enCombate() then
    GameTooltip:AddLine(L.t("OBJ_COMBATE"), g[1], g[2], g[3])
  end
  GameTooltip:Show()
end

local function ayudaPestana(p)
  if not tooltipLibre() then
    return
  end
  local g = Estilo.color("secundario")
  GameTooltip:SetOwner(p, "ANCHOR_RIGHT")
  GameTooltip:SetText(L.t("OBJ_AYUDA_PESTANA"))
  if leerCVar("nameplateShowEnemies") == "0" then
    GameTooltip:AddLine(L.t("OBJ_AYUDA_PLACAS"), g[1], g[2], g[3])
  end
  GameTooltip:Show()
end

local function ocultarAyuda()
  if GameTooltip and not GameTooltip:IsForbidden() then
    GameTooltip:Hide()
  end
end

---------------------------------------------------------------------------------------------------
-- Arrastre de la pestaña (solo fuera de combate)
---------------------------------------------------------------------------------------------------

local function guardarPosicion()
  local punto, _, relPunto, x, y = raiz:GetPoint(1)
  if punto then
    Ajustes.set("objetivos.pos", {punto = punto, relPunto = relPunto, x = x, y = y})
  end
end

local function empezarArrastre()
  if enCombate() then
    return
  end
  moviendo = true
  raiz:StartMoving()
end

-- Soltar en combate no se puede (StopMovingOrSizing está restringido): se aplaza a PLAYER_REGEN_ENABLED.
local function soltar()
  if not moviendo then
    return
  end
  if enCombate() then
    soltarPendiente = true
    return
  end
  moviendo, soltarPendiente = false, false
  raiz:StopMovingOrSizing()
  -- La posición la guarda el addon (objetivos.pos), no el cliente (layout-local.txt).
  raiz:SetUserPlaced(false)
  guardarPosicion()
end

---------------------------------------------------------------------------------------------------
-- Creación
---------------------------------------------------------------------------------------------------

-- Un lado del borde del botón, con su grosor fijo.
local function lado(b, nombre, grosor)
  local t = b:CreateTexture(nil, "OVERLAY")
  t:SetTexture(Estilo.TEXTURA)
  if nombre == "arriba" or nombre == "abajo" then
    t:SetHeight(grosor)
  else
    t:SetWidth(grosor)
  end
  if nombre == "arriba" then
    t:SetPoint("TOPLEFT", b, "TOPLEFT", 0, 0)
    t:SetPoint("TOPRIGHT", b, "TOPRIGHT", 0, 0)
  elseif nombre == "abajo" then
    t:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 0, 0)
    t:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", 0, 0)
  elseif nombre == "izquierda" then
    t:SetPoint("TOPLEFT", b, "TOPLEFT", 0, 0)
    t:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 0, 0)
  else
    t:SetPoint("TOPRIGHT", b, "TOPRIGHT", 0, 0)
    t:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", 0, 0)
  end
  return t
end

function Objetivos.crearBotonSeguro(nombre, padre)
  local ok, boton = pcall(CreateFrame, "Button", nombre, padre, "SecureActionButtonTemplate")
  if ok and type(boton) == "table" then
    boton:RegisterForClicks("AnyUp", "AnyDown")
    return boton
  end
end

local function crearBoton(i)
  local boton = Objetivos.crearBotonSeguro("SnetForeverObjetivo" .. i, raiz)
  local seguro = boton ~= nil
  if not seguro then
    boton = CreateFrame("Button", nil, raiz) -- plan B: botón normal, sin acción
  end
  boton.seguro = seguro
  boton:SetSize(TAMANO, TAMANO)
  boton:EnableMouse(true)
  if seguro then
    -- Las dos mitades, como RestedXP en Forever (Targeting.lua:1180): el botón seguro moderno solo ejecuta la que pide
    -- ActionButtonUseKeyDown, así que la macro va una vez. Con una sola, no haría nada con la variable al revés (lote C,
    -- revisión 52, Minor 12: se deja así a propósito).
    boton:SetAttribute("type", "macro")
  end
  boton.icono = boton:CreateTexture(nil, "ARTWORK")
  boton.icono:SetAllPoints(boton)
  boton.icono:SetTexture(ICONO_ENEMIGO)
  boton.icono:SetTexCoord(RECORTE[1], RECORTE[2], RECORTE[1], RECORTE[2])
  local function juego(grosor)
    return {
      arriba = lado(boton, "arriba", grosor), abajo = lado(boton, "abajo", grosor),
      izquierda = lado(boton, "izquierda", grosor), derecha = lado(boton, "derecha", grosor),
    }
  end
  boton.bordesFinos, boton.bordesGruesos = juego(1), juego(2)
  ponerBorde(boton, Estilo.color("borde"), 1)
  boton:SetHighlightTexture(RESALTE, "ADD")
  local resalte = boton:GetHighlightTexture()
  resalte:SetAllPoints(boton)
  boton:SetScript("OnEnter", ayudaBoton)
  boton:SetScript("OnLeave", ocultarAyuda)
  boton:Hide()
  return boton
end

-- Los 12 botones, solo fuera de combate (un botón seguro no se puede crear en combate).
local function crearBotones()
  if creados or enCombate() then
    return
  end
  for i = 1, MAXIMO do
    botones[i] = crearBoton(i)
  end
  todos = Objetivos.crearBotonSeguro(NOMBRE_TODOS, UIParent)
  if todos then
    todos:SetAttribute("type", "macro")
    todos:Hide()
    Objetivos.marcos.todos = todos
  end
  creados = true
end

function Objetivos.crear()
  if raiz then
    return raiz
  end
  raiz = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(raiz, NOMBRE, true)
  raiz:SetFrameStrata("MEDIUM")
  raiz:SetClampedToScreen(true)
  raiz:SetMovable(true)
  raiz:SetSize(TAMANO + 2 * LATERAL, SUPERIOR + TAMANO + INFERIOR)
  Estilo.tarjeta(raiz, "fondo")

  pestana = Estilo.pestana(raiz, L.t("SEC_OBJETIVOS"))
  pestana:SetHeight(ALTO_PESTANA)
  pestana:SetPoint("TOPLEFT", raiz, "TOPLEFT", POS_PESTANA.x, POS_PESTANA.y)
  pestana:SetScript("OnEnter", ayudaPestana)
  pestana:SetScript("OnLeave", ocultarAyuda)
  pestana:RegisterForDrag("LeftButton")
  pestana:SetScript("OnDragStart", empezarArrastre)
  pestana:SetScript("OnDragStop", soltar)

  Objetivos.marcos.raiz, Objetivos.marcos.pestana = raiz, pestana
  colocar()
  raiz:Hide()
  crearBotones()
  Objetivos.pintar()
  return raiz
end

---------------------------------------------------------------------------------------------------
-- Pintar
---------------------------------------------------------------------------------------------------

local function pintarInterno()
  if not creados then
    crearBotones()
    if not creados then -- en combate: se crean al salir
      pendiente = true
      return
    end
  end
  local enemigos, amistosos = repartir(visibles())
  if enCombate() then
    pendiente = pendienteAjustes or firmaDe(enemigos, amistosos) ~= firmaAplicada
  else
    aplicar(enemigos, amistosos)
  end
  pintarRegiones(vivasPorClave())
end

function Objetivos.pintar()
  if raiz == nil or pintando then
    return
  end
  pintando = true
  local ok, motivo = pcall(pintarInterno)
  pintando = false
  if not ok then
    error(motivo, 0)
  end
end

function Objetivos.hayPendiente()
  return pendiente
end

function Objetivos.macroTodos()
  return todos and todos:GetAttribute("macrotext") or nil
end

---------------------------------------------------------------------------------------------------
-- Eventos
---------------------------------------------------------------------------------------------------

SNF.escuchar("SNF_OBJETIVOS_CAMBIADOS", function()
  Objetivos.pintar()
end)

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if raiz == nil then
    return
  end
  if clave == "objetivos.pos" then
    debeColocar = true
  elseif string.sub(clave, 1, 10) ~= "objetivos." and clave ~= "idioma" then
    return
  end
  if enCombate() then
    pendienteAjustes, pendiente = true, true
  end
  Objetivos.pintar()
end)

-- Al salir de combate: se crean los botones si se cargó en combate, se suelta la pestaña y se aplica lo aplazado.
SNF.escuchar("PLAYER_REGEN_ENABLED", function()
  if raiz == nil then
    return
  end
  if soltarPendiente then
    soltar()
  end
  Objetivos.pintar()
end)
