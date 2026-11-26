-- SnetForever: panel de configuración propio (tarea 20, §7 del diseño). Hecho a mano, sin Ace3 ni plantillas de Blizzard,
-- con el aspecto sobrio de ui/estilo.lua. Se abre con /snet, con el botón del minimapa (ui/boton-minimapa.lua), con el ⚙
-- de la ventana y desde Opciones → AddOns del juego.
--
-- Panel.crear() -> marco       crea SnetForeverPanel (una sola vez) y registra la entrada de Opciones → AddOns. Lo llama
--                              arranque.lua en PLAYER_LOGIN si los datos están bien.
-- Disposición (Ruling F3-34, petición del autor: «el apartado de opciones hazlo con tarjetas para no dar scroll eterno»):
--   ┌ SnetForever ─────────────────────────────────────── X ┐  cabecera (se arrastra para mover el panel)
--   │ [icono] Guía          │ Guía                          │
--   │ [icono] Pasos saltados│ ───────────────────────────── │  a la izquierda, una tarjeta por apartado (la elegida
--   │ [icono] Idioma        │ (solo el apartado elegido,    │  resaltada); a la derecha, solo el apartado elegido,
--   │   …                   │  sin barra de desplazamiento) │  que siempre cabe: «Ventana» va en dos columnas y las
--   │ [icono] Versión       │                               │  listas de saltados y avisos pendientes van por páginas.
--   ├────────────── SnetForever v0.3.0 ─────────────────────┤  pie con la versión
--   El último apartado abierto se guarda en el ajuste panel.apartado (sin valor o desconocido: «guia»).
--
-- Panel.abrir(seccion?)        lo enseña (suelto, en UIParent) y, con el nombre de un apartado, abre su tarjeta (y la
--                              recuerda); sin él (o con uno que no existe), abre el último apartado.
-- Panel.elegir(seccion)        abre la tarjeta de ese apartado (lo mismo que pulsarla).
-- Panel.cerrar(), Panel.alternar()   dentro del lienzo de Opciones, cerrar no hace nada y alternar lo saca a UIParent.
-- Panel.refrescar()            vuelve a leer todos los ajustes y a pintar (se llama sola al cambiar un ajuste, la guía o
--                              los pasos con el panel a la vista; si está oculto lo hace al enseñarse).
-- Panel.controles[claveAjuste] = control    casilla, deslizador o selector de cada ajuste (de UI.*, con .refrescar()).
--                              Faltan solo ventana.pos, flecha.pos y objetivos.pos (se guardan al mover), minimapa.angulo
--                              (el botón del minimapa), version (va con los botones «Normal» y «Con mazmorras») y
--                              panel.apartado (las tarjetas).
-- Panel.marcos = {raiz, cabecera, titulo, cerrar, columna, contenido, pie, orden, elegido, secciones = {[nombre] = marco},
--                 tarjetas = {[nombre] = boton}, paginas = {saltados, avisos}, guia = {actual, elegir, volver, normal,
--                 mazmorras}, ia = {motor, estado, abrir}, comercio = {casilla, estado, activar, abrir, ordenes}, saltados = Array<fila>, pendientes = Array<fila>,
--                 restablecerPosicion, fallo}
--   orden = {"guia", "saltados", "idioma", "ventana", "objetivos", "flecha", "pines", "openmap", "avisos", "ia",
--            "comercio", "version"}  (12 tarjetas de 26 px con huecos de 4: 356 de los 358 del cuerpo).
--   Cada sección tiene .titulo. Cada tarjeta tiene .icono, .texto y .acento (la raya de la elegida). Una fila de
--   saltados tiene t1, t2, retomar y quitar; una de pendientes, t1 y empezar. Un paginador tiene anterior, texto
--   («1/3») y siguiente, y solo se ve si la lista no cabe entera.
--   «Comercio» (Task 10b): vive en el núcleo y funciona sin el addon SnetForever_Comercio, también sin su carpeta. Con el
--   comercio cargado, la casilla comercio.casilla («Usar el comercio», SNF.ponerComercio) y, si se desmarca, la línea de
--   comercio.estado («Se apagará al recargar: escribe /reload.»); apagado, esa línea y el botón comercio.activar (lo mismo
--   que «/snet c activar»); sin la carpeta, la línea COMERCIO_NO_INSTALADO. Después, el botón comercio.abrir (apagado
--   mientras no exista SNF.Principal, Task 12) y la nota comercio.ordenes. Se repinta al abrir y tras cada pulsación.
--   «Chat con la IA» (tarea 11, F4-11): el selector ia.modelo («Rápido», «Más listo» o «El más capaz», con el motor
--   entre paréntesis si se conoce), la casilla ia.inventario, «Motor: …», el estado de la app y de la IA (textos de ui/chat.lua), el botón
--   «Abrir el chat» y la nota PANEL_IA_REQUISITO. Se repinta con SNF_IA_APP, SNF_IA_TIMBRE y SNF_IA_REGISTRO.
--
-- Opciones → AddOns: con Settings.RegisterCanvasLayoutCategory y RegisterAddOnCategory se registra el lienzo
-- SnetForeverOpciones («SnetForever»); si no, con InterfaceOptions_AddCategory; si no hay ninguna, nada. Cuando el
-- lienzo se enseña, el panel se pone dentro (SetParent, su tamaño de 640×420 y TOPLEFT) y, si el lienzo es más
-- pequeño, se encoge con SetScale (también cuando el lienzo cambia de tamaño); abrir() lo devuelve a UIParent con
-- escala 1.
--
-- Orden /snet (y /snetforever): sin argumento alterna el panel; «ventana» alterna la ventana de guía; «chat» o «ia»
-- alternan la ventana de chat con la IA (ui/chat.lua); «fallo» abre el aviso de fallo; «reiniciar» devuelve a su sitio
-- la ventana, la flecha, «Objetivos cercanos» y el chat (Panel.restablecerPosiciones, lo mismo que el botón
-- «Restablecer posición»); «prueba» pone los dos puntos de prueba y «prueba fin» los quita (arranque.lua); otra cosa
-- escribe la ayuda. Lote C (revisión 52, Minor 16): también en inglés, con ORDENES_EN («window», «ai», «bug», «reset»,
-- «test» y «test end»; «help» escribe la ayuda). Sin datos válidos solo repite el aviso DATOS_ROTOS. «comercio» (o
-- «trade»), 0.7.0: sin el addon SnetForever_Comercio avisa COMERCIO_NO_CARGADO (SNF.comercioCargado, arranque.lua);
-- «comercio activar» (o «activate») deja de apagar el comercio por el ajuste viejo de la 0.6.4 y, si estaba apagado en la
-- lista, lo activa para el próximo /reload (SNF.activarComercio). Sin SNF.Principal, «/snet c» escribe una sola línea.
local _, SNF = ...
local Panel = {}
SNF.Panel = Panel

local L = SNF.L
local Estilo = SNF.Estilo
local UI = SNF.UI
local Motor = SNF.Motor
local Guias = SNF.Guias
local Avisos = SNF.Avisos
local Ajustes = SNF.Ajustes
local Datos = SNF.Datos
local Fallo = SNF.Fallo
local Ventana = SNF.Ventana
local TAMANOS = Estilo.TAMANOS

local function optionText(parent, size, role)
  return UI.texto(parent, size, role or "body")
end

local NOMBRE = "SnetForeverPanel"
-- Capa del panel suelto (tarea 22): en MEDIUM los marcos de vida de otros addons se dibujaban encima. Por debajo de
-- DIALOG (el diálogo de fallo) y de las listas desplegables (FULLSCREEN_DIALOG, ui/controles.lua).
local CAPA = "HIGH"
local NOMBRE_LIENZO = "SnetForeverOpciones"
local NOMBRE_CATEGORIA = "SnetForever"
-- Medidas (Ruling F3-34). Todo cabe sin desplazamiento: el apartado más alto («Ventana», en dos columnas) mide unos
-- 200 px y un apartado puede medir 350; las listas que crecen (saltados, avisos pendientes) van por páginas.
local ANCHO = 640
local ALTO = 420
local MARGEN = 10 -- a los lados
local ALTO_CABECERA = 28
local ALTO_PIE = 18
local HUECO_V = 8 -- entre la cabecera, el cuerpo y el pie
local ALTO_CUERPO = ALTO - ALTO_CABECERA - ALTO_PIE - 2 * HUECO_V -- 358
local ANCHO_COLUMNA = 170 -- columna de tarjetas
local HUECO_COLUMNA = 8 -- entre la columna y el área de contenido
local ANCHO_CONTENIDO = ANCHO - 2 * MARGEN - ANCHO_COLUMNA - HUECO_COLUMNA -- 442
local ALTO_TARJETA = 26
local HUECO_TARJETAS = 4 -- 12 tarjetas de 26 y 11 huecos de 4 = 356 (el cuerpo mide 358)
local TAM_ICONO = 18
local RELLENO = 4 -- de la sección dentro del área de contenido
local ANCHO_SECCION = ANCHO_CONTENIDO - 2 * RELLENO -- 434
local ALTO_SECCION = ALTO_CUERPO - 2 * RELLENO -- 350: lo más que puede medir un apartado
local SANGRIA = 8 -- de lo que hay dentro de una sección
local ALTO_TITULO = 30 -- franja del título de cada sección (con su raya debajo)
local GAP = 6 -- entre filas de una sección
local ALTO_BOTON = 18
local ALTO_ETIQUETA = 17 -- lo que el deslizador reserva encima para su etiqueta
local X_COLUMNA2 = 228 -- segunda columna de controles («Ventana»), desde la sangría
local ANCHO_COLUMNA1 = 220 -- casillas de la primera columna
local ICONO_MARCA = "Interface\\TargetingFrame\\UI-RaidTargetingIcon_" -- más el número (1-8) de la marca de banda

local ORDEN = {
  "guia", "saltados", "idioma", "ventana", "objetivos", "flecha", "pines", "openmap", "avisos", "ia", "comercio", "version",
}
local TITULOS = {
  guia = "SEC_GUIA", saltados = "SEC_SALTADOS", idioma = "SEC_IDIOMA", ventana = "SEC_VENTANA",
  objetivos = "SEC_OBJETIVOS", flecha = "SEC_FLECHA", pines = "SEC_PINES", openmap = "SEC_OPENMAP",
  avisos = "SEC_AVISOS", ia = "SEC_IA", comercio = "SEC_COMERCIO", version = "SEC_VERSION",
}
-- Icono de cada tarjeta: iconos de Interface\Icons que ya existen en el cliente Classic (1.x).
local ICONOS = {
  guia = "Interface\\Icons\\INV_Misc_Book_09",
  saltados = "Interface\\Icons\\Ability_Rogue_Sprint",
  idioma = "Interface\\Icons\\INV_Misc_Note_01",
  ventana = "Interface\\Icons\\INV_Misc_Gear_01",
  objetivos = "Interface\\Icons\\INV_Sword_04", -- la misma espada que el marco «Objetivos cercanos» (ui/objetivos.lua)
  flecha = "Interface\\Icons\\INV_Misc_Ammo_Arrow_01",
  pines = "Interface\\Icons\\Ability_Tracking",
  openmap = "Interface\\Icons\\INV_Misc_Map_01",
  avisos = "Interface\\Icons\\INV_Scroll_03",
  ia = "Interface\\Icons\\Spell_Holy_MindVision",
  comercio = "Interface\\Icons\\INV_Misc_Coin_01", -- una moneda: existe en el cliente 1.x
  version = "Interface\\Icons\\INV_Misc_QuestionMark",
}
local RECORTE_ICONO = {0.08, 0.92}
local APARTADO_POR_DEFECTO = "guia"
-- Ajustes que cambian solos (al mover la ventana, la flecha o el botón) y no piden repintar el panel. panel.apartado
-- se guarda con Ajustes.guardarSinAviso: no emite nada (ni repinta la ventana de la guía).
local SIN_REPINTAR = {
  ["ventana.pos"] = true, ["flecha.pos"] = true, ["objetivos.pos"] = true, ["chat.pos"] = true,
  ["minimapa.angulo"] = true, ["principal.sitio"] = true, ["principal.pestana"] = true,
}

local marcos = {secciones = {}, orden = ORDEN, tarjetas = {}, paginas = {}, guia = {}, ia = {}, comercio = {}, saltados = {}, pendientes = {}}
Panel.marcos = marcos
local controles = {}
Panel.controles = controles

local raiz, columna, contenido, lienzo
-- true al acabar Panel.crear. El cliente lanza OnSizeChanged (y con él pintar) en cuanto alguien pregunta un tamaño,
-- también a medio construir el panel (error real de la tarea 22: «panel.lua:582: attempt to index field 'actual'»).
local construido = false
local enLienzo = false
local posLibre -- {punto, relPunto, x, y} del panel suelto mientras está dentro del lienzo
local todos = {} -- controles y botones con refrescar()
local selectores = {} -- selectores, para cerrar sus listas

---------------------------------------------------------------------------------------------------
-- Utilidades
---------------------------------------------------------------------------------------------------

local function gris(fs)
  local c = Estilo.COLOR_SECUNDARIO
  fs:SetTextColor(c[1], c[2], c[3], c[4])
  return fs
end

local function alto(fs)
  local t = fs:GetText()
  if t == nil or t == "" then
    return 0
  end
  return fs:GetStringHeight()
end

local function colocar(region, padre, x, y)
  region:ClearAllPoints()
  region:SetPoint("TOPLEFT", padre, "TOPLEFT", x, -y)
end

local function tomar(lista, n, crear)
  local x = lista[n]
  if not x then
    x = crear()
    lista[n] = x
  end
  x:Show()
  return x
end

local function soltar(lista, desde)
  for k = desde, #lista do
    lista[k]:Hide()
  end
end

-- Botón pequeño del estilo; su ancho sigue al texto (los textos cambian con el idioma).
local function boton(padre, texto, alPulsar)
  local b = UI.boton(padre, texto, alPulsar, true)
  Estilo.fuente(b.texto, TAMANOS.pequeno, "control")
  b:SetHeight(ALTO_BOTON)
  local refrescar = b.refrescar
  b.refrescar = function()
    refrescar()
    b:SetWidth(math.max(50, math.floor(b.texto:GetStringWidth() + 16)))
  end
  b.refrescar()
  todos[#todos + 1] = b
  return b
end

-- Los datos de las guías están cargados (si no, el panel sigue funcionando sin sus listas).
local function datosListos()
  return type(SNF_RUTAS) == "table" and type(SNF_RUTAS.guias) == "table"
end

local function texto(clave)
  return function()
    return L.t(clave)
  end
end

-- Valor de un ajuste numérico recortado a sus LIMITES (Ajustes.set no recorta).
local function numerico(clave)
  local limite = Ajustes.LIMITES[clave]
  local valor = Ajustes.get(clave)
  if type(valor) ~= "number" then
    valor = Ajustes.DEFECTO[clave]
  end
  return math.max(limite.min, math.min(limite.max, valor))
end

-- El valor que sale de un deslizador: dentro de los LIMITES y en múltiplos del paso (sin ruido de decimales).
local function recortado(clave, valor)
  local limite = Ajustes.LIMITES[clave]
  valor = math.max(limite.min, math.min(limite.max, valor))
  if limite.paso >= 1 then
    return math.floor(valor + 0.5)
  end
  return math.floor(valor * 1000 + 0.5) / 1000
end

local function cerrarListas()
  for _, s in ipairs(selectores) do
    s.lista:Hide()
  end
end

---------------------------------------------------------------------------------------------------
-- Secciones y sus controles
---------------------------------------------------------------------------------------------------

-- Una sección: vive dentro del área de contenido y solo se ve la del apartado elegido.
local function nuevaSeccion(nombre)
  local s = CreateFrame("Frame", nil, contenido)
  s.nombre = nombre
  s.items = {}
  s.columnaActual = 1
  s:SetSize(ANCHO_SECCION, ALTO_SECCION)
  s:SetPoint("TOPLEFT", contenido, "TOPLEFT", RELLENO, -RELLENO)
  s.titulo = optionText(s, TAMANOS.titulo, "heading")
  s.titulo:SetTextColor(unpack(Estilo.comercio("texto")))
  s.titulo:SetJustifyH("LEFT")
  s.titulo:SetPoint("TOPLEFT", s, "TOPLEFT", SANGRIA, -6)
  local raya = s:CreateTexture(nil, "BORDER")
  raya:SetTexture(Estilo.TEXTURA)
  raya:SetHeight(1)
  raya:SetPoint("TOPLEFT", s, "TOPLEFT", SANGRIA, -(ALTO_TITULO - 7))
  raya:SetPoint("TOPRIGHT", s, "TOPRIGHT", -SANGRIA, -(ALTO_TITULO - 7))
  raya:SetVertexColor(unpack(Estilo.comercio("linea")))
  s:Hide()
  marcos.secciones[nombre] = s
  return s
end

-- Añade un elemento a la sección (en su columna actual): antes = hueco extra por encima; junto = botones que van a su
-- derecha.
local function poner(s, obj, antes, junto)
  s.items[#s.items + 1] = {obj = obj, antes = antes or 0, junto = junto, columna = s.columnaActual}
  return obj
end

-- Ancho de una casilla o de una nota en la columna actual de la sección.
local function anchoUtil(s)
  if s.columnas == 2 and s.columnaActual == 1 then
    return ANCHO_COLUMNA1
  end
  return ANCHO_SECCION - 2 * SANGRIA
end

-- Una nota en gris que sigue al idioma.
local function nota(s, clave)
  local fs = gris(optionText(s, TAMANOS.lista))
  fs:SetJustifyH("LEFT")
  fs:SetWordWrap(true)
  todos[#todos + 1] = {refrescar = function()
    fs:SetText(L.t(clave))
  end}
  fs:SetText(L.t(clave))
  return fs
end

local function casilla(s, clave, textoClave)
  local c = UI.casilla(s, texto(textoClave), function()
    return Ajustes.get(clave) == true
  end, function(valor)
    Ajustes.set(clave, valor and true or false)
  end, true)
  c:SetWidth(anchoUtil(s))
  controles[clave] = c
  todos[#todos + 1] = c
  poner(s, c)
  return c
end

local function deslizador(s, clave, textoClave)
  local limite = Ajustes.LIMITES[clave]
  local d = UI.deslizador(s, texto(textoClave), limite.min, limite.max, limite.paso, function()
    return numerico(clave)
  end, function(valor)
    Ajustes.set(clave, recortado(clave, valor))
  end, true)
  controles[clave] = d
  todos[#todos + 1] = d
  poner(s, d, ALTO_ETIQUETA)
  return d
end

local function selector(s, clave, textoClave, opciones, alElegir)
  local sel = UI.selector(s, texto(textoClave), opciones, function()
    return Ajustes.get(clave)
  end, alElegir, true)
  controles[clave] = sel
  todos[#todos + 1] = sel
  selectores[#selectores + 1] = sel
  poner(s, sel)
  return sel
end

-- Lo que enseña «Pasos saltados» de una guía: su título o, si ya no está, su clave.
local function tituloDeGuia(clave)
  local titulo = datosListos() and Guias.titulo(clave) or nil
  return titulo or tostring(clave)
end

local function claveActual()
  local estado = Motor.estado()
  if estado.clave then
    return estado.clave
  end
  return type(SnetForeverPJ) == "table" and SnetForeverPJ.guia or nil
end

local function elegirVersion(version)
  Guias.elegirVersion(version)
  Panel.refrescar()
end

local function construirGuia()
  local s = nuevaSeccion("guia")
  local g = marcos.guia
  g.actual = optionText(s, TAMANOS.paso)
  g.actual:SetJustifyH("LEFT")
  g.actual:SetWordWrap(true)
  g.elegir = boton(s, texto("ELEGIR_GUIA"), function(self)
    Ventana.crear()
    Ventana.abrirMenu(self)
  end)
  g.volver = boton(s, texto("PANEL_VOLVER_RAZA"), function()
    Guias.volverPorDefecto()
    Panel.refrescar()
  end)
  g.etiquetaVersion = gris(optionText(s, TAMANOS.lista))
  g.etiquetaVersion:SetJustifyH("LEFT")
  g.normal = boton(s, texto("VERSION_NORMAL"), function()
    elegirVersion("normal")
  end)
  g.mazmorras = boton(s, texto("VERSION_MAZMORRAS"), function()
    elegirVersion("mazmorras")
  end)
  poner(s, g.actual)
  poner(s, g.elegir, 0, {g.volver})
  poner(s, g.etiquetaVersion)
  poner(s, g.normal, 0, {g.mazmorras})
  deslizador(s, "guias.xp", "PANEL_GUIAS_XP")
  casilla(s, "guias.objetosActivos", "PANEL_GUIAS_OBJETOS")
  casilla(s, "guias.automatizar", "PANEL_GUIAS_DIALOGOS")
end

local function nuevaFilaSaltado()
  local f = CreateFrame("Frame", nil, marcos.secciones.saltados)
  f.t1 = optionText(f, TAMANOS.paso)
  f.t1:SetJustifyH("LEFT")
  f.t1:SetWordWrap(true)
  f.t2 = gris(optionText(f, TAMANOS.lista))
  f.t2:SetJustifyH("LEFT")
  f.t2:SetWordWrap(true)
  f.retomar = boton(f, texto("PANEL_RETOMAR"), function()
    Motor.retomar(f.clave, f.id)
    Panel.refrescar()
  end)
  f.quitar = boton(f, texto("PANEL_QUITAR"), function()
    Motor.quitarSaltado(f.clave, f.id)
    Panel.refrescar()
  end)
  return f
end

-- Pinta la entrada e de saltados en la fila f y devuelve su alto.
local function pintarFilaSaltado(f, e, ancho)
  f.clave, f.id = e.clave, e.id
  f:SetWidth(ancho)
  local existe = datosListos() and Motor.existePaso(e.clave, e.id)
  local retomado = type(SnetForeverPJ.retomados) == "table" and type(SnetForeverPJ.retomados[e.clave]) == "table"
    and SnetForeverPJ.retomados[e.clave][e.id] == true
  f.t1:SetWidth(ancho)
  -- Lote C (52-M8): un paso de la guía cargada lleva el número de la ventana; uno de otra guía, el n guardado.
  local numero = Motor.numero(e.clave, e.id) or math.floor(tonumber(e.n) or 0)
  f.t1:SetText(L.t("FALLO_PASO", numero, tostring(e.resumen or "")))
  local guia = tituloDeGuia(e.clave)
  -- Lote D (D2): un paso que se saltó solo por gris lo dice.
  if e.motivo == "gris" then
    guia = guia .. " · " .. L.t("PANEL_SALTADO_GRIS", math.floor(tonumber(e.nivel) or 0))
  elseif e.motivo == "no_disponible" and SNF.Texto then
    -- 12-nov: un paso que se saltó porque no se podía hacer dice por qué.
    guia = guia .. " · " .. SNF.Texto.noDisponible(e)
  end
  if not existe then
    guia = guia .. " " .. L.t("PANEL_YA_NO_EXISTE")
  elseif retomado then
    guia = guia .. " " .. L.t("PANEL_RETOMADO")
  end
  f.t2:SetWidth(ancho)
  f.t2:SetText(guia)
  colocar(f.t1, f, 0, 0)
  local y = alto(f.t1) + 2
  colocar(f.t2, f, 0, y)
  y = y + alto(f.t2) + 4
  f.retomar:SetShown(existe)
  if existe then
    if retomado then
      f.retomar:Disable()
    else
      f.retomar:Enable()
    end
    colocar(f.retomar, f, 0, y)
    f.quitar:ClearAllPoints()
    f.quitar:SetPoint("LEFT", f.retomar, "RIGHT", 4, 0)
  else
    colocar(f.quitar, f, 0, y)
  end
  y = y + ALTO_BOTON
  f:SetHeight(y)
  return y
end

---------------------------------------------------------------------------------------------------
-- Páginas (Ruling F3-34: nunca una barra de desplazamiento). Las listas que crecen (pasos saltados y avisos
-- pendientes) enseñan las filas que caben en lo que queda del apartado; si no caben todas, debajo va el paginador
-- «<  1/3  >». Las páginas se calculan midiendo cada entrada en una fila oculta (el medidor), al repintar.
---------------------------------------------------------------------------------------------------

local alturas, inicios = {}, {} -- reutilizadas en cada repintado (alto de cada entrada e inicio de cada página)

-- Activa o desactiva un botón del paginador; desactivado se ve atenuado (alfa 0,4).
local ALFA_DESACTIVADO = 0.4
local function activar(b, si)
  if si then
    b:Enable()
    b:SetAlpha(1)
  else
    b:Disable()
    b:SetAlpha(ALFA_DESACTIVADO)
  end
end

local function nuevoPaginador(s, nombre)
  local pag = CreateFrame("Frame", nil, s)
  pag:SetHeight(ALTO_BOTON)
  pag.actual = 1
  pag.anterior = boton(pag, "<", function()
    pag.actual = pag.actual - 1
    Panel.pintar()
  end)
  pag.texto = gris(optionText(pag, TAMANOS.lista))
  pag.siguiente = boton(pag, ">", function()
    pag.actual = pag.actual + 1
    Panel.pintar()
  end)
  pag.anterior:SetPoint("LEFT", pag, "LEFT", 0, 0)
  pag.texto:SetPoint("LEFT", pag.anterior, "RIGHT", 8, 0)
  pag.siguiente:SetPoint("LEFT", pag.texto, "RIGHT", 8, 0)
  pag:Hide()
  marcos.paginas[nombre] = pag
  return pag
end

-- Pinta la página que toca de `lista` desde la altura y hasta `limite` y devuelve dónde acaba. `filas` es el montón de
-- filas que se reutilizan, nueva() crea una y pintar(fila, entrada, ancho) la pinta y da su alto.
local function paginar(s, pag, lista, filas, nueva, pintar, ancho, y, limite)
  local n = #lista
  if not pag.medidor then
    pag.medidor = nueva()
    pag.medidor:Hide()
  end
  local total = 0
  for k = 1, n do
    alturas[k] = pintar(pag.medidor, lista[k], ancho)
    total = total + alturas[k] + GAP
  end
  local paginas, desde, hasta = 1, 1, n
  if y + total > limite then
    -- No cabe todo: se reserva el sitio del paginador y se reparten las entradas en páginas.
    local sitio = limite - y - ALTO_BOTON - GAP
    local usado = 0
    inicios[1] = 1
    for k = 1, n do
      if usado > 0 and usado + alturas[k] + GAP > sitio then
        paginas = paginas + 1
        inicios[paginas] = k
        usado = 0
      end
      usado = usado + alturas[k] + GAP
    end
    pag.actual = math.max(1, math.min(paginas, pag.actual))
    desde = inicios[pag.actual]
    hasta = pag.actual < paginas and inicios[pag.actual + 1] - 1 or n
  else
    pag.actual = 1
  end
  local m = 0
  for k = desde, hasta do
    m = m + 1
    local f = tomar(filas, m, nueva)
    local h = pintar(f, lista[k], ancho)
    colocar(f, s, SANGRIA, y)
    y = y + h + GAP
  end
  soltar(filas, m + 1)
  pag:SetShown(paginas > 1)
  if paginas > 1 then
    pag.texto:SetText(pag.actual .. "/" .. paginas)
    activar(pag.anterior, pag.actual > 1)
    activar(pag.siguiente, pag.actual < paginas)
    pag:SetWidth(ancho)
    colocar(pag, s, SANGRIA, y)
    y = y + ALTO_BOTON + GAP
  end
  return y
end

-- Lo que va debajo de lo fijo de «Pasos saltados»: la nota o una fila por cada paso saltado (por páginas).
local function dinamicoSaltados(s, ancho, y, limite)
  local lista = type(SnetForeverPJ) == "table" and type(SnetForeverPJ.saltados) == "table" and SnetForeverPJ.saltados
    or {}
  if #lista == 0 then
    s.sin:Show()
    s.sin:SetWidth(ancho)
    colocar(s.sin, s, SANGRIA, y)
    y = y + alto(s.sin) + GAP
  else
    s.sin:Hide()
  end
  return paginar(s, s.paginador, lista, marcos.saltados, nuevaFilaSaltado, pintarFilaSaltado, ancho, y, limite)
end

local function construirSaltados()
  local s = nuevaSeccion("saltados")
  casilla(s, "pasos.saltarPorNivel", "PANEL_SALTAR_POR_NIVEL")
  -- Lote D (D2): los pasos de misiones grises se saltan solos; el margen salta también las verdes más bajas.
  casilla(s, "pasos.saltarGrises", "PANEL_SALTAR_GRISES")
  -- 12-nov: los pasos de misiones que el juego no daría (falta una previa) se saltan solos.
  casilla(s, "pasos.saltarNoDisponibles", "PANEL_SALTAR_NO_DISPONIBLES")
  deslizador(s, "pasos.margenVerdes", "PANEL_MARGEN_VERDES")
  s.sin = nota(s, "PANEL_SIN_SALTADOS")
  s.paginador = nuevoPaginador(s, "saltados")
  s.dinamico = dinamicoSaltados
end

local function construirIdioma()
  local s = nuevaSeccion("idioma")
  selector(s, "idioma", "PANEL_IDIOMA", {
    {valor = "cliente", texto = texto("IDIOMA_CLIENTE")},
    {valor = "es", texto = texto("IDIOMA_ES")},
    {valor = "en", texto = texto("IDIOMA_EN")},
  }, function(valor)
    Ajustes.set("idioma", valor)
  end)
end

local function construirVentana()
  -- En dos columnas para que quepa sin desplazamiento: a la izquierda, cómo se comporta la ventana; a la derecha, su
  -- aspecto (tema, escala, ancho, opacidad y pasos siguientes).
  local s = nuevaSeccion("ventana")
  s.columnas = 2
  casilla(s, "auction.largeText", "WINDOW_LARGE_TEXT")
  casilla(s, "ventana.visible", "PANEL_VENTANA_VISIBLE")
  casilla(s, "ventana.bloqueada", "PANEL_BLOQUEADA")
  casilla(s, "ventana.ocultarEnCombate", "PANEL_OCULTAR_COMBATE")
  casilla(s, "ventana.pasoArriba", "PANEL_PASO_ARRIBA")
  casilla(s, "minimapa.boton", "PANEL_BOTON_MINIMAPA")
  selector(s, "guide.favorite", "FIELD_FAVORITE", {
    {valor = "auto", texto = texto("FIELD_AUTOMATIC")},
    {valor = "notice", texto = texto("FIELD_NOTICE")},
    {valor = "bearing", texto = texto("FIELD_BEARING")},
    {valor = "chart", texto = texto("FIELD_CHART")},
  }, function(valor)
    Ajustes.set("guide.favorite", valor)
  end)
  marcos.restablecerPosicion = poner(s, boton(s, texto("PANEL_RESTABLECER_POS"), function()
    Panel.restablecerPosiciones()
  end), 2)
  s.columnaActual = 2
  selector(s, "ventana.tema", "PANEL_TEMA", {
    {valor = "forge", texto = texto("TEMA_FORGE")},
    {valor = "neutro", texto = texto("TEMA_NEUTRO")},
  }, function(valor)
    Ajustes.set("ventana.tema", valor)
  end)
  deslizador(s, "ventana.escala", "PANEL_ESCALA")
  deslizador(s, "ventana.ancho", "PANEL_ANCHO")
  deslizador(s, "ventana.alfa", "PANEL_ALFA")
  deslizador(s, "ventana.siguientes", "PANEL_SIGUIENTES")
end

local function construirObjetivos()
  local s = nuevaSeccion("objetivos")
  casilla(s, "objetivos.activo", "PANEL_OBJ_ACTIVO")
  casilla(s, "objetivos.marcaPlaca", "PANEL_OBJ_MARCA_PLACA")
  casilla(s, "objetivos.soloCercanos", "PANEL_OBJ_SOLO_CERCANOS")
  -- Lote D (D1): la marca que se pone al pulsar un objetivo: «ninguna» o una de las 8 de banda, con su icono. Se oculta si
  -- el cliente no tiene la orden de marcar (Objetivos.marcaDisponible).
  local opciones = {{valor = 0, texto = texto("MARCA_0")}}
  for n = 1, 8 do
    local icono = string.format("|T%s%d:14|t ", ICONO_MARCA, n)
    opciones[#opciones + 1] = {valor = n, texto = function()
      return icono .. L.t(string.format("MARCA_%d", n))
    end}
  end
  selector(s, "objetivos.marca", "PANEL_OBJ_MARCA", opciones, function(valor)
    Ajustes.set("objetivos.marca", valor)
  end)
  s.items[#s.items].siVisible = function()
    return SNF.Objetivos == nil or SNF.Objetivos.marcaDisponible()
  end
  deslizador(s, "objetivos.escala", "PANEL_OBJ_ESCALA")
end

local function construirFlecha()
  local s = nuevaSeccion("flecha")
  casilla(s, "flecha.activa", "PANEL_FLECHA_ACTIVA")
  deslizador(s, "flecha.escala", "PANEL_FLECHA_ESCALA")
  casilla(s, "flecha.avisoLlegada", "PANEL_FLECHA_LLEGADA")
end

local function construirPines()
  local s = nuevaSeccion("pines")
  casilla(s, "pines.mundo", "PANEL_PINES_MUNDO")
  casilla(s, "pines.minimapa", "PANEL_PINES_MINIMAPA")
  casilla(s, "pines.ia", "PANEL_PINES_IA")
  casilla(s, "pines.caminos", "PANEL_PINES_CAMINOS")
  deslizador(s, "pines.cuantos", "PANEL_PINES_CUANTOS")
end

local function construirOpenMap()
  local s = nuevaSeccion("openmap")
  casilla(s, "openmap.usar", "PANEL_OPENMAP_USAR")
  local ficha = casilla(s, "openmap.ficha", "PANEL_OPENMAP_FICHA")
  -- La ficha depende de «Usar OpenMap»: sin él, la casilla se desactiva y se ve en gris.
  todos[#todos + 1] = {refrescar = function()
    if Ajustes.get("openmap.usar") == false then
      ficha:Disable()
      gris(ficha.texto)
    else
      ficha:Enable()
      local t = Estilo.COLOR_TEXTO
      ficha.texto:SetTextColor(t[1], t[2], t[3], t[4])
    end
  end}
  -- Estado de OpenMap en este PC (se lee en vivo; el addon ni lo toca).
  local estado = gris(optionText(s, TAMANOS.lista))
  estado:SetJustifyH("LEFT")
  estado:SetWordWrap(true)
  local function pintarEstado()
    local nombre, version = SNF.OpenMapFicha.estado()
    if nombre == "sin_openmap" then
      estado:SetText(L.t("PANEL_OPENMAP_ESTADO_NO"))
    else
      if version == nil then
        local api = rawget(_G, "OpenMapAPI")
        version = type(api) == "table" and rawget(api, "version") or nil
      end
      estado:SetText(L.t("PANEL_OPENMAP_ESTADO_SI", math.floor(tonumber(version) or 0)))
    end
  end
  todos[#todos + 1] = {refrescar = pintarEstado}
  pintarEstado()
  poner(s, estado)
  poner(s, nota(s, "PANEL_OPENMAP_NOTA"))
end

local function nuevaFilaPendiente()
  local f = CreateFrame("Frame", nil, marcos.secciones.avisos)
  f.t1 = optionText(f, TAMANOS.paso)
  f.t1:SetJustifyH("LEFT")
  f.t1:SetWordWrap(true)
  f.empezar = boton(f, texto("PANEL_EMPEZAR"), function()
    Avisos.ahora(f.id)
    Panel.refrescar()
  end)
  return f
end

local function pintarFilaPendiente(f, aviso, ancho)
  f.id = aviso.id
  f:SetWidth(ancho)
  f.t1:SetWidth(ancho)
  f.t1:SetText(L.t("AVISO_NIVEL", math.floor(tonumber(aviso.nivel) or 0), tostring(SNF.Avisos.texto(aviso) or "")))
  colocar(f.t1, f, 0, 0)
  local y = alto(f.t1) + 4
  local conGuia = Avisos.tieneGuia(aviso)
  f.empezar:SetShown(conGuia)
  if conGuia then
    colocar(f.empezar, f, 0, y)
    y = y + ALTO_BOTON
  end
  f:SetHeight(y)
  return y
end

local function dinamicoAvisos(s, ancho, y, limite)
  colocar(s.cabecera, s, SANGRIA, y + 4)
  s.cabecera:SetWidth(ancho)
  y = y + 4 + alto(s.cabecera) + GAP
  local lista = Avisos.pendientes()
  if #lista == 0 then
    s.sin:Show()
    s.sin:SetWidth(ancho)
    colocar(s.sin, s, SANGRIA, y)
    y = y + alto(s.sin) + GAP
  else
    s.sin:Hide()
  end
  return paginar(s, s.paginador, lista, marcos.pendientes, nuevaFilaPendiente, pintarFilaPendiente, ancho, y, limite)
end

local function construirAvisos()
  local s = nuevaSeccion("avisos")
  casilla(s, "avisos.cadenas", "PANEL_AVISOS_CADENAS")
  casilla(s, "avisos.mazmorras", "PANEL_AVISOS_MAZMORRAS")
  casilla(s, "avisos.mejoras", "PANEL_AVISOS_MEJORAS")
  s.cabecera = nota(s, "PANEL_PENDIENTES")
  s.sin = nota(s, "PANEL_SIN_PENDIENTES")
  s.paginador = nuevoPaginador(s, "avisos")
  s.dinamico = dinamicoAvisos
end

-- «Chat con la IA»: los textos del modelo, del motor y del estado son los de la ventana de chat (SNF.Chat, que se carga
-- antes que el panel).
local function construirIA()
  local s = nuevaSeccion("ia")
  local opciones = {}
  for _, valor in ipairs(Ajustes.OPCIONES["ia.modelo"]) do
    opciones[#opciones + 1] = {valor = valor, texto = function()
      return SNF.Chat.textoModelo(valor)
    end}
  end
  selector(s, "ia.modelo", "PANEL_IA_MODELO", opciones, function(valor)
    for _, permitido in ipairs(Ajustes.OPCIONES["ia.modelo"]) do
      if permitido == valor then
        Ajustes.set("ia.modelo", valor)
        return
      end
    end
  end)
  casilla(s, "ia.inventario", "PANEL_IA_INVENTARIO")
  local ia = marcos.ia
  ia.motor = optionText(s, TAMANOS.lista)
  ia.motor:SetJustifyH("LEFT")
  ia.motor:SetWordWrap(true)
  ia.estado = gris(optionText(s, TAMANOS.lista))
  ia.estado:SetJustifyH("LEFT")
  ia.estado:SetWordWrap(true)
  -- El estado: «App conectada» o «App sin conexión» y, si la IA de la app no está bien, su texto (P6) debajo.
  todos[#todos + 1] = {refrescar = function()
    ia.motor:SetText(SNF.Chat.textoMotor())
    local estado = SNF.Chat.textoApp()
    local aviso = SNF.Chat.textoAvisoApp()
    if aviso then
      estado = estado .. "\n" .. aviso
    end
    ia.estado:SetText(estado)
  end}
  poner(s, ia.motor, 2)
  poner(s, ia.estado)
  ia.abrir = poner(s, boton(s, texto("PANEL_IA_ABRIR"), function()
    SNF.Chat.abrir()
  end), 2)
  poner(s, nota(s, "PANEL_IA_REQUISITO"))
end

-- Última línea de aviso de la tarjeta «Comercio» (clave de texto) tras un intento que el juego no aceptó; se borra con el
-- siguiente que sale bien.
local avisoComercio = nil

-- La línea de estado de la tarjeta, según el estado del addon (SNF.estadoComercio y SNF.comercioPendiente, arranque.lua).
-- Vacía = no hay línea.
local function lineaComercio()
  local estado = SNF.estadoComercio()
  local pendiente = SNF.comercioPendiente()
  if estado == "cargado" then
    if pendiente == "seApaga" then
      return L.t("PANEL_COMERCIO_SE_APAGA")
    end
    return avisoComercio and L.t(avisoComercio) or ""
  elseif estado == "apagado" then
    if pendiente == "seEnciende" then
      return L.t("COMERCIO_ACTIVAR_RECARGAR")
    end
    return L.t(avisoComercio or "PANEL_COMERCIO_APAGADO")
  end
  return L.t("COMERCIO_NO_INSTALADO")
end

-- ¿Hay ventana principal de comercio? La Task 12 la pondrá en SNF.Principal (con abrir() o, si no, alternar()).
local function ventanaPrincipal()
  local v = rawget(SNF, "Principal")
  return type(v) == "table" and v or nil
end

-- «Comercio» (Task 10b): vive en el núcleo y funciona sin el addon de comercio (también sin su carpeta). Lee y escribe el
-- estado del addon en el cliente (arranque.lua), no un ajuste. Se repinta al abrir el panel y tras cada pulsación.
local function construirComercio()
  local s = nuevaSeccion("comercio")
  local c = marcos.comercio
  c.casilla = UI.casilla(s, texto("PANEL_COMERCIO_USAR"), function()
    return SNF.estadoComercio() == "cargado" and not SNF.comercioDormido() and SNF.comercioPendiente() ~= "seApaga"
  end, function(valor)
    if SNF.ponerComercio(valor) then
      avisoComercio = nil
    else
      avisoComercio = valor and "COMERCIO_NO_REACTIVADO" or "COMERCIO_NO_APAGADO"
    end
    Panel.refrescar()
  end)
  c.casilla:SetWidth(anchoUtil(s))
  todos[#todos + 1] = c.casilla
  poner(s, c.casilla)
  s.items[#s.items].siVisible = function()
    return SNF.estadoComercio() == "cargado"
  end
  c.estado = gris(optionText(s, TAMANOS.lista))
  c.estado:SetJustifyH("LEFT")
  c.estado:SetWordWrap(true)
  todos[#todos + 1] = {refrescar = function()
    c.estado:SetText(lineaComercio())
  end}
  poner(s, c.estado)
  s.items[#s.items].siVisible = function()
    return c.estado:GetText() ~= nil and c.estado:GetText() ~= ""
  end
  c.activar = poner(s, boton(s, texto("PANEL_COMERCIO_ACTIVAR"), function()
    local resultado = SNF.activarComercio()
    avisoComercio = resultado == "noReactivado" and "COMERCIO_NO_REACTIVADO" or nil
    Panel.refrescar()
  end), 2)
  s.items[#s.items].siVisible = function()
    return SNF.estadoComercio() == "apagado" and SNF.comercioPendiente() ~= "seEnciende"
  end
  c.abrir = poner(s, boton(s, function()
    return L.t(ventanaPrincipal() and "PANEL_COMERCIO_ABRIR" or "PANEL_COMERCIO_ABRIR_OBRAS")
  end, function()
    local v = ventanaPrincipal()
    if SNF.estadoComercio() ~= "cargado" or not v then
      return
    end
    if type(v.abrir) == "function" then
      v.abrir()
    elseif type(v.alternar) == "function" then
      v.alternar()
    end
  end), 2)
  -- Apagado mientras no hay ventana o el comercio no está cargado (se ve atenuado, como los del paginador).
  todos[#todos + 1] = {refrescar = function()
    activar(c.abrir, SNF.estadoComercio() == "cargado" and ventanaPrincipal() ~= nil)
  end}
  c.ordenes = poner(s, nota(s, "PANEL_COMERCIO_ORDENES"), 2)
end

local function versiones()
  local rutas, misiones = "?", "?"
  if datosListos() and type(SNF_MISIONES) == "table" then
    local v = Datos.versiones()
    rutas, misiones = v.rutas or "?", v.misiones or "?"
  end
  return L.t("PANEL_VERSIONES", SNF.VERSION, rutas, misiones)
end

local function construirVersion()
  local s = nuevaSeccion("version")
  s.versiones = optionText(s, TAMANOS.paso)
  s.versiones:SetJustifyH("LEFT")
  s.versiones:SetWordWrap(true)
  poner(s, s.versiones)
  marcos.fallo = poner(s, boton(s, texto("FALLO_TITULO"), function()
    Fallo.abrir()
  end))
end

---------------------------------------------------------------------------------------------------
-- Disposición del apartado
---------------------------------------------------------------------------------------------------

local function altoDe(obj, ancho)
  if obj:IsObjectType("FontString") then
    obj:SetWidth(ancho)
    return alto(obj)
  end
  return obj:GetHeight()
end

-- Coloca lo fijo y lo dinámico de una sección (en una o dos columnas) y devuelve su alto, que no pasa de ALTO_SECCION
-- (lo dinámico va por páginas).
local function disponer(s)
  local interior = ANCHO_SECCION - 2 * SANGRIA
  s.titulo:SetText(L.t(TITULOS[s.nombre]))
  local y1, y2 = ALTO_TITULO, ALTO_TITULO
  for _, it in ipairs(s.items) do
    -- Lote D: un control que no vale en este cliente (siVisible da falso) se oculta y no ocupa sitio.
    if it.siVisible then
      it.obj:SetShown(it.siVisible() and true or false)
    end
    if it.siVisible == nil or it.obj:IsShown() then
      local segunda = it.columna == 2
      local y = (segunda and y2 or y1) + it.antes
      colocar(it.obj, s, SANGRIA + (segunda and X_COLUMNA2 or 0), y)
      local previo = it.obj
      for _, otro in ipairs(it.junto or {}) do
        otro:ClearAllPoints()
        otro:SetPoint("LEFT", previo, "RIGHT", 4, 0)
        previo = otro
      end
      local ancho = interior
      if s.columnas == 2 then
        ancho = segunda and (interior - X_COLUMNA2) or ANCHO_COLUMNA1
      end
      y = y + altoDe(it.obj, ancho) + GAP
      if segunda then
        y2 = y
      else
        y1 = y
      end
    end
  end
  local y = math.max(y1, y2)
  if s.dinamico then
    y = s.dinamico(s, interior, y, ALTO_SECCION - 4)
  end
  -- s.alturaReal: lo que mide el apartado de verdad (las pruebas comprueban que no pasa de su sitio); el recorte solo
  -- protege el área si algún día no cupiera.
  s.alturaReal = y + 4
  y = math.min(ALTO_SECCION, s.alturaReal)
  s:SetHeight(y)
  return y
end

local function pintarGuia()
  local g = marcos.guia
  local clave = claveActual()
  local titulo = clave and tituloDeGuia(clave) or L.t("PANEL_SIN_GUIA")
  g.actual:SetText(L.t("PANEL_GUIA_ACTUAL", titulo))
  g.etiquetaVersion:SetText(L.t("PANEL_VERSION_GUIA"))
  local version = Ajustes.get("version")
  for _, b in ipairs({g.normal, g.mazmorras}) do
    local activo = (b == g.normal) == (version == "normal")
    local c = activo and Estilo.COLOR_TEXTO or Estilo.COLOR_SECUNDARIO
    b.texto:SetTextColor(c[1], c[2], c[3], c[4])
  end
end

-- El apartado guardado (panel.apartado) si es uno de los de ORDEN; si no, «guia».
local function apartadoGuardado()
  local valor = Ajustes.get("panel.apartado")
  if type(valor) == "string" and TITULOS[valor] then
    return valor
  end
  return APARTADO_POR_DEFECTO
end

-- Fondo, raya y color del texto de una tarjeta: la elegida con «resalte» y la raya de acento; bajo el ratón, «resalte»
-- más tenue; las demás, «fondoLista» con el texto en gris.
local function pintarTarjeta(t, encima)
  local elegida = t.nombre == marcos.elegido
  Estilo.tarjeta(t, elegida and "resalte" or "fondoLista")
  if encima and not elegida then
    local c = Estilo.color("resalte")
    t.snfFondo:SetVertexColor(c[1], c[2], c[3], Ajustes.get("ventana.alfa") * 0.6)
  end
  t.acento:SetShown(elegida)
  local a = Estilo.comercio("acento")
  t.acento:SetVertexColor(a[1], a[2], a[3], a[4])
  local c = Estilo.color((elegida or encima) and "texto" or "secundario")
  t.texto:SetTextColor(c[1], c[2], c[3], c[4])
end

function Panel.pintar()
  if not construido then
    return
  end
  pintarGuia()
  marcos.titulo:SetText("SnetForever · " .. L.t("FIELD_OPTIONS"))
  marcos.secciones.version.versiones:SetText(versiones())
  marcos.pie.version:SetText(L.t("PIE_VERSION", SNF.VERSION or ""))
  -- Solo se dispone (y se mide, con sus páginas) el apartado elegido: los demás están ocultos y se disponen al elegirlos.
  -- Sus títulos sí siguen al idioma.
  for _, nombre in ipairs(ORDEN) do
    local s = marcos.secciones[nombre]
    local elegido = nombre == marcos.elegido
    if elegido then
      disponer(s)
    else
      s.titulo:SetText(L.t(TITULOS[nombre]))
    end
    s:SetShown(elegido)
    local t = marcos.tarjetas[nombre]
    t.texto:SetText(L.t(TITULOS[nombre]))
    pintarTarjeta(t, t.encima)
  end
end

function Panel.refrescar()
  if not construido then
    return
  end
  marcos.elegido = apartadoGuardado()
  for _, c in ipairs(todos) do
    c.refrescar()
  end
  Panel.pintar()
end

-- Abre la tarjeta de un apartado y la recuerda. Un nombre que no es de ORDEN no cambia nada.
function Panel.elegir(nombre)
  if not TITULOS[nombre] then
    return
  end
  cerrarListas()
  if Ajustes.get("panel.apartado") ~= nombre then
    Ajustes.guardarSinAviso("panel.apartado", nombre)
  end
  Panel.refrescar()
end

---------------------------------------------------------------------------------------------------
-- Marco
---------------------------------------------------------------------------------------------------

local function crearCabecera()
  local cabecera = CreateFrame("Frame", nil, raiz)
  cabecera:SetHeight(ALTO_CABECERA)
  cabecera:SetPoint("TOPLEFT", raiz, "TOPLEFT", 0, 0)
  cabecera:SetPoint("TOPRIGHT", raiz, "TOPRIGHT", 0, 0)
  Estilo.tarjeta(cabecera, "fondoCabecera")
  Estilo.forgeTrim(cabecera)
  cabecera:EnableMouse(true)
  cabecera:SetScript("OnMouseDown", function(_, b)
    if b == "LeftButton" and not enLienzo then
      raiz:StartMoving()
    end
  end)
  cabecera:SetScript("OnMouseUp", function()
    raiz:StopMovingOrSizing()
    raiz:SetUserPlaced(false)
  end)
  local titulo = optionText(cabecera, TAMANOS.titulo, "heading")
  titulo:SetPoint("LEFT", cabecera, "LEFT", MARGEN, 0)
  titulo:SetTextColor(unpack(Estilo.comercio("texto")))
  titulo:SetText("SnetForever")
  marcos.cabecera = cabecera
  marcos.titulo = titulo

  local cerrar = UI.boton(cabecera, "X", function()
    Panel.cerrar()
  end, true)
  cerrar:SetSize(ALTO_BOTON, ALTO_BOTON)
  cerrar:SetPoint("RIGHT", cabecera, "RIGHT", -MARGEN, 0)
  marcos.cerrar = cerrar
end

-- Una tarjeta de la columna: icono del apartado, su nombre y la raya de acento (solo en la elegida).
local function nuevaTarjeta(nombre, k)
  local t = CreateFrame("Button", nil, columna)
  t.nombre = nombre
  t:SetSize(ANCHO_COLUMNA, ALTO_TARJETA)
  t:SetPoint("TOPLEFT", columna, "TOPLEFT", 0, -(k - 1) * (ALTO_TARJETA + HUECO_TARJETAS))
  t:EnableMouse(true)
  Estilo.tarjeta(t, "fondoLista")
  Estilo.forgeTrim(t)
  t.acento = t:CreateTexture(nil, "ARTWORK")
  t.acento:SetTexture(Estilo.TEXTURA)
  t.acento:SetWidth(2)
  t.acento:SetPoint("TOPLEFT", t, "TOPLEFT", 1, -1)
  t.acento:SetPoint("BOTTOMLEFT", t, "BOTTOMLEFT", 1, 1)
  t.icono = t:CreateTexture(nil, "ARTWORK")
  t.icono:SetTexture(ICONOS[nombre])
  t.icono:SetTexCoord(RECORTE_ICONO[1], RECORTE_ICONO[2], RECORTE_ICONO[1], RECORTE_ICONO[2])
  t.icono:SetSize(TAM_ICONO, TAM_ICONO)
  t.icono:SetPoint("LEFT", t, "LEFT", 8, 0)
  t.texto = optionText(t, TAMANOS.paso, "control")
  t.texto:SetJustifyH("LEFT")
  t.texto:SetJustifyV("MIDDLE")
  t.texto:SetWordWrap(false)
  t.texto:SetSize(ANCHO_COLUMNA - 22 - TAM_ICONO, ALTO_TARJETA - 4)
  t.texto:SetPoint("LEFT", t, "LEFT", 16 + TAM_ICONO, 0)
  t:SetScript("OnClick", function(self)
    Panel.elegir(self.nombre)
  end)
  -- t.encima recuerda si el ratón está encima, para que un repintado no le quite el efecto (sin depender de IsMouseOver).
  t:SetScript("OnEnter", function(self)
    self.encima = true
    pintarTarjeta(self, true)
  end)
  t:SetScript("OnLeave", function(self)
    self.encima = false
    pintarTarjeta(self, false)
  end)
  marcos.tarjetas[nombre] = t
  return t
end

-- Cuerpo: la columna de tarjetas a la izquierda, el área de contenido (una tarjeta del estilo) a la derecha y el pie con
-- la versión. Las medidas son fijas (constantes de arriba): no dependen de GetWidth, que en el cliente puede lanzar un
-- OnSizeChanged a medio construir (tarea 22).
local function crearCuerpo()
  columna = CreateFrame("Frame", nil, raiz)
  columna:SetSize(ANCHO_COLUMNA, ALTO_CUERPO)
  columna:SetPoint("TOPLEFT", raiz, "TOPLEFT", MARGEN, -(ALTO_CABECERA + HUECO_V))
  marcos.columna = columna
  for k, nombre in ipairs(ORDEN) do
    nuevaTarjeta(nombre, k)
  end

  contenido = CreateFrame("Frame", nil, raiz)
  contenido:SetSize(ANCHO_CONTENIDO, ALTO_CUERPO)
  contenido:SetPoint("TOPLEFT", columna, "TOPRIGHT", HUECO_COLUMNA, 0)
  Estilo.tarjeta(contenido, "fondoLista")
  Estilo.forgePlate(contenido, 0.76, true)
  marcos.contenido = contenido

  local pie = CreateFrame("Frame", nil, raiz)
  pie:SetHeight(ALTO_PIE)
  pie:SetPoint("BOTTOMLEFT", raiz, "BOTTOMLEFT", 0, 0)
  pie:SetPoint("BOTTOMRIGHT", raiz, "BOTTOMRIGHT", 0, 0)
  Estilo.tarjeta(pie, "fondoCabecera")
  Estilo.forgeTrim(pie)
  pie.version = gris(optionText(pie, TAMANOS.pequeno))
  pie.version:SetJustifyH("CENTER")
  pie.version:SetPoint("CENTER", pie, "CENTER", 0, 0)
  marcos.pie = pie
end

---------------------------------------------------------------------------------------------------
-- Opciones → AddOns
---------------------------------------------------------------------------------------------------

-- Dentro del lienzo el panel conserva su tamaño (las medidas interiores son fijas) y se encoge con SetScale si el lienzo
-- es más pequeño; nunca se agranda. Un lienzo aún sin medidas (0) lo deja a escala 1.
local function escalarEnLienzo()
  if not enLienzo then
    return
  end
  local ancho, alto = lienzo:GetWidth() or 0, lienzo:GetHeight() or 0
  local escala = 1
  if ancho > 0 and alto > 0 then
    escala = math.min(Ajustes.get("auction.largeText") and 1.15 or 1, ancho / ANCHO, alto / ALTO)
  end
  raiz:SetScale(escala)
end

-- Pone el panel dentro del lienzo de Opciones → AddOns.
local function meterEnLienzo()
  if not enLienzo then
    local punto, _, relPunto, x, y = raiz:GetPoint(1)
    posLibre = {punto, relPunto, x, y}
  end
  enLienzo = true
  -- Escape no debe ocultarlo (dejaría la categoría en blanco) ni la X cerrarlo.
  for k = #UISpecialFrames, 1, -1 do
    if UISpecialFrames[k] == NOMBRE then
      table.remove(UISpecialFrames, k)
    end
  end
  marcos.cerrar:Hide()
  SNF.WindowSizing.suspend(raiz, true)
  raiz:SetParent(lienzo)
  raiz:SetFrameStrata(lienzo:GetFrameStrata())
  raiz:SetSize(ANCHO, ALTO)
  raiz:ClearAllPoints()
  raiz:SetPoint("TOPLEFT", lienzo, "TOPLEFT", 0, 0)
  escalarEnLienzo()
  raiz:Show()
end

-- Lo devuelve a UIParent, donde estaba.
local function sacarDelLienzo()
  if not enLienzo then
    return
  end
  enLienzo = false
  table.insert(UISpecialFrames, NOMBRE)
  marcos.cerrar:Show()
  raiz:SetParent(UIParent)
  raiz:SetFrameStrata(CAPA)
  SNF.WindowSizing.suspend(raiz, false)
  raiz:SetSize(ANCHO, ALTO)
  raiz:ClearAllPoints()
  local p = posLibre or {}
  raiz:SetPoint(p[1] or "CENTER", UIParent, p[2] or "CENTER", p[3] or 0, p[4] or 0)
end

local function registrarOpciones()
  local conSettings = type(Settings) == "table" and type(Settings.RegisterCanvasLayoutCategory) == "function"
    and type(Settings.RegisterAddOnCategory) == "function"
  local conInterfaz = type(InterfaceOptions_AddCategory) == "function"
  if not conSettings and not conInterfaz then
    return
  end
  lienzo = CreateFrame("Frame", NOMBRE_LIENZO, UIParent)
  lienzo.name = NOMBRE_CATEGORIA
  lienzo:Hide()
  lienzo:SetScript("OnShow", meterEnLienzo)
  lienzo:SetScript("OnSizeChanged", escalarEnLienzo)
  if conSettings then
    marcos.categoria = Settings.RegisterCanvasLayoutCategory(lienzo, NOMBRE_CATEGORIA)
    Settings.RegisterAddOnCategory(marcos.categoria)
  else
    InterfaceOptions_AddCategory(lienzo)
  end
  marcos.lienzo = lienzo
end

---------------------------------------------------------------------------------------------------
-- Crear, abrir y cerrar
---------------------------------------------------------------------------------------------------

function Panel.crear()
  if raiz then
    return raiz
  end
  raiz = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(raiz, NOMBRE, true)
  marcos.raiz = raiz
  raiz:SetSize(ANCHO, ALTO)
  raiz:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  raiz:SetFrameStrata(CAPA)
  raiz:SetToplevel(true)
  raiz:SetClampedToScreen(true)
  raiz:SetMovable(true)
  raiz:EnableMouse(true)
  Estilo.fondo(raiz)
  Estilo.forgePlate(raiz, 1, true)
  raiz:SetScript("OnShow", function()
    Panel.refrescar()
  end)
  raiz:SetScript("OnSizeChanged", function()
    if raiz:IsVisible() then
      Panel.pintar()
    end
  end)

  crearCabecera()
  crearCuerpo()
  construirGuia()
  construirSaltados()
  construirIdioma()
  construirVentana()
  construirObjetivos()
  construirFlecha()
  construirPines()
  construirOpenMap()
  construirAvisos()
  construirIA()
  construirComercio()
  construirVersion()
  marcos.elegido = apartadoGuardado()
  construido = true

  raiz:Hide()
  table.insert(UISpecialFrames, NOMBRE)
  registrarOpciones()
  return raiz
end

function Panel.abrir(seccion)
  Panel.crear()
  sacarDelLienzo()
  raiz:Show()
  if seccion and TITULOS[seccion] then
    Panel.elegir(seccion)
  else
    Panel.refrescar()
  end
end

function Panel.cerrar()
  -- Dentro de Opciones → AddOns no se cierra: la categoría se quedaría en blanco.
  if raiz and not enLienzo then
    cerrarListas()
    raiz:Hide()
  end
end

function Panel.alternar()
  if raiz and raiz:IsVisible() and not enLienzo then
    Panel.cerrar()
  else
    Panel.abrir()
  end
end

---------------------------------------------------------------------------------------------------
-- Eventos y orden /snet
---------------------------------------------------------------------------------------------------

-- Con el panel oculto no se pinta nada: al enseñarse (OnShow) se lee todo de nuevo.
local function repintar()
  if raiz and raiz:IsVisible() then
    Panel.refrescar()
  end
end

SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if clave == "auction.largeText" and enLienzo then escalarEnLienzo() end
  if not SIN_REPINTAR[clave] then
    repintar()
  end
end)
SNF.escuchar("SNF_PASOS_CAMBIADOS", repintar)
SNF.escuchar("SNF_GUIA_CARGADA", repintar)
SNF.escuchar("SNF_AVISO", repintar)
-- «Chat con la IA»: el estado de la app, el de la IA y el motor llegan con los timbres y el buzón.
SNF.escuchar("SNF_IA_APP", repintar)
SNF.escuchar("SNF_IA_TIMBRE", repintar)
SNF.escuchar("SNF_IA_REGISTRO", repintar)

local function ayuda()
  print(L.t("AYUDA_TITULO"))
  print(L.t("AYUDA_PANEL"))
  print(L.t("AYUDA_VENTANA"))
  print(L.t("AYUDA_COMERCIO"))
  print(L.t("AYUDA_CHAT"))
  print(L.t("AYUDA_FALLO"))
  print(L.t("AYUDA_REINICIAR"))
  print(L.t("AYUDA_PRUEBA"))
  print(L.t("AYUDA_AQUI"))
  print(L.t("AYUDA_IMPORTAR"))
  print(L.t("AYUDA_DIARIO"))
  print(L.t("AYUDA_AYUDA"))
end

-- Lote C (revisión 52, Minor 5): una sola función para «Restablecer posición» y «/snet reiniciar». Cada pieza escucha
-- SNF_AJUSTE_CAMBIADO de su posición y se recoloca (los objetivos, al salir del combate si hace falta).
local POSICIONES = {"ventana.pos", "flecha.pos", "objetivos.pos", "chat.pos", "principal.sitio"}

function Panel.restablecerPosiciones()
  for _, clave in ipairs(POSICIONES) do
    Ajustes.restablecer(clave)
  end
end

-- Lote C (revisión 52, Minor 16): las órdenes en inglés, con su equivalente en español.
local ORDENES_EN = {
  window = "ventana",
  ai = "ia",
  bug = "fallo",
  reset = "reiniciar",
  test = "prueba",
  help = "ayuda",
  here = "aqui",
  log = "diario",
  trade = "comercio",
  import = "importar",
}
local RESTO_EN = {["end"] = "fin", activate = "activar", warehouse = "almacen", vendor = "vendedor", crafting = "artesania", mailing = "correo"}
-- 0.7.0: una letra para las órdenes que más se usan («/snet muestrario» es largo y se olvida). «ia» ya es corta;
-- «reiniciar» y «prueba» no llevan letra, para que no se pulsen sin querer. La ayuda enseña cada letra.
local ORDENES_CORTAS = {
  g = "ventana",
  c = "comercio",
  m = "muestrario",
  d = "diario",
  a = "aqui",
  f = "fallo",
  h = "ayuda",
}

local function orden(argumentos)
  -- Sin datos (o de otra versión) el arranque no crea nada: la orden solo repite el aviso.
  local bien, motivo = Datos.comprobar()
  if not bien then
    print(L.t("DATOS_ROTOS", motivo))
    return
  end
  local texto = string.lower(strtrim(argumentos or ""))
  local palabra, resto = string.match(texto, "^(%S*)%s*(.-)$")
  palabra = ORDENES_CORTAS[palabra] or ORDENES_EN[palabra] or palabra
  resto = RESTO_EN[resto] or resto
  if palabra == "" then
    Panel.alternar()
  elseif palabra == "ventana" then
    Ventana.crear()
    Ventana.alternar()
  elseif palabra == "chat" or palabra == "ia" then
    SNF.Chat.alternar()
  elseif palabra == "fallo" then
    Fallo.abrir()
  elseif palabra == "reiniciar" then
    Panel.restablecerPosiciones()
  elseif palabra == "aqui" or palabra == "aquí" then
    SNF.MisGuias.aqui()
  elseif palabra == "diario" then
    SNF.Diario.mostrar()
  elseif palabra == "importar" then
    SNF.ImportarRXPVentana.abrir()
  elseif palabra == "comercio" then
    -- 0.7.0: el comercio es el addon SnetForever_Comercio. Desactivado en la lista de addons, solo se avisa. Con él, la
    -- ventana principal de comercio (SNF.Principal, Task 12); si por lo que sea no existe, una sola línea (COMERCIO_EN_OBRAS).
    -- «/snet comercio activar»: el jugador quiere usarlo aunque en la 0.6.4 lo tuviera apagado (arranque.lua).
    if resto == "activar" then
      local AVISOS_ACTIVAR = {activado = "COMERCIO_ACTIVADO", noCargado = "COMERCIO_NO_CARGADO", recargar = "COMERCIO_ACTIVAR_RECARGAR",
        noReactivado = "COMERCIO_NO_REACTIVADO", noInstalado = "COMERCIO_NO_INSTALADO"}
      print(L.t(AVISOS_ACTIVAR[SNF.activarComercio()] or "COMERCIO_NO_CARGADO"))
      Panel.refrescar() -- si la tarjeta «Comercio» está a la vista, que lo refleje
    elseif not SNF.comercioCargado() then
      print(L.t("COMERCIO_NO_CARGADO"))
    elseif resto:match("^yield%s") or resto == "yield" then
      local ok = SNF.DisenchantSamples.record(resto:match("^yield%s+(.+)$") or "")
      print(L.t(ok and "TRADE_SAMPLE_SAVED" or "TRADE_SAMPLE_USAGE"))
    elseif resto:match("^materials%s") or resto == "materials" then
      local item, units = resto:match("^materials%s+(%d+)%s+(%d+)$")
      local crafts, cost, materials = SNF.RecipeCosts.materials(tonumber(item), tonumber(units))
      if not crafts then print(L.t("TRADE_MATERIALS_UNAVAILABLE")); return end
      print(L.t("TRADE_MATERIALS_PLAN", crafts, cost))
      for _, row in ipairs(materials) do
        local info = SNF.API.infoObjeto(row.id)
        print(L.t("TRADE_MATERIALS_LINE", info and info.nombre or tostring(row.id), row.needed,
          row.missing and tostring(row.missing) or "?"))
      end
    elseif (resto == "almacen" or resto == "almacén") and type(rawget(SNF, "UIAlmacen")) == "table" then
      -- Fase 4 de la paridad con TSM: la vista previa de solo lectura del banco (ui/almacen.lua del comercio).
      SNF.UIAlmacen.alternar()
    elseif resto == "vendedor" and type(rawget(SNF, "UIVendedor")) == "table" then
      -- Fase 4 de la paridad con TSM: la vista previa de solo lectura del comerciante (ui/vendedor.lua del comercio).
      SNF.UIVendedor.alternar()
    elseif (resto == "artesania" or resto == "artesanía") and type(rawget(SNF, "UIArtesania")) == "table" then
      -- Fase 4 de la paridad con TSM: la vista previa de solo lectura de la reposición de Artesanía (ui/artesania.lua).
      SNF.UIArtesania.alternar()
    elseif resto == "correo" and type(rawget(SNF, "UICorreo")) == "table" then
      -- Fase 4 de la paridad con TSM: la vista previa de solo lectura de los envíos de Correo (ui/correo.lua).
      SNF.UICorreo.alternar()
    elseif resto == "tooltip" and type(rawget(SNF, "TooltipComercio")) == "table" then
      -- Task 20d: enciende o apaga nuestras líneas en el tooltip de los objetos (la casilla llegará con la página Ajustes).
      SNF.TooltipComercio.alternar()
    elseif type(rawget(SNF, "Principal")) == "table" then
      SNF.Principal.alternar()
    else
      -- Sin SNF.Principal (no debería pasar con el comercio cargado): una sola línea (no toda la ayuda).
      print(L.t("COMERCIO_EN_OBRAS"))
    end
  elseif palabra == "muestrario" then
    -- Para la sesión principal (no sale en la ayuda): la ventana de prueba de las piezas, que vive en el addon de comercio.
    if not SNF.comercioCargado() or type(rawget(SNF, "Muestrario")) ~= "table" then
      print(L.t("COMERCIO_NO_CARGADO"))
    else
      SNF.Muestrario.abrir()
    end
  elseif palabra == "prueba" then
    if resto == "fin" then
      SNF.Arranque.quitarPrueba()
    else
      SNF.Arranque.ponerPrueba()
    end
  else
    ayuda()
  end
end

SLASH_SNET1 = "/snet"
SLASH_SNET2 = "/snetforever"
SlashCmdList["SNET"] = orden
