-- SnetForever: ventana de guía con la estructura de RestedXP (tarea D3, docs/plano-restedxp/6-diseno-ventana.md b.5 con
-- las «Decisiones tomadas» y las «Correcciones del autor», que mandan). Es un marco normal (nada seguro, plano 3 §1.8 y
-- §7): sigue funcionando en combate y solo se oculta si el ajuste lo pide. Texturas: solo de Blizzard (las de la tabla
-- b.4 y las de esta cabecera, que aparecen en addons de Forever) o dibujadas con WHITE8X8.
--
--             ┌Paso 12┐                                 bloque activo: una tarjeta por paso activo (más el aviso de
--   ┌─────────┴───────┴─────────────────────────┐       clase y la tarjeta de estado: sin guía, fin, «Volver a…»),
--   │ (○) ⚔ 2/8 Rufián Tótem Siniestro           │       encima de la cabecera (4 de hueco) y apiladas hacia arriba;
--   └────────────────────────────────────────────┘       debajo del pie si no caben o con ventana.pasoArriba falso.
--   ┌────────────────────────────────────────────┐
--   │ (emblema)   Título de la guía en dos       │       cabecera: emblema redondo (icono de clase y retrato), título
--   │               líneas · tramo               │       centrado (2 líneas como mucho) y el tramo debajo.
--   ├────────────────────────────────────────┬───┤
--   │ ⚔ Mata a los Rufianes…              01 │ ▲ │       lista: tarjetas de los pasos de la guía con su número abajo
--   │ 💬 Habla con Makaba                 02 │ ● │       a la derecha; el activo resaltado y la lista colocada en él;
--   │                                        │ ▼ │       barra vertical con flechas y pulgar.
--   ├────────────────────────────────────────┴───┤
--   │ ⚙          SnetForever v0.5.0   Saltados: 3│       pie: engranaje (clic: ajustes; clic derecho: menú), versión.
--   └────────────────────────────────────────────┘
--
-- Ventana.crear() -> marco     crea SnetForeverVentana (una sola vez) y la pinta.
-- Ventana.pintar()             la vuelve a pintar; se llama sola con SNF_PASOS_CAMBIADOS, SNF_GUIA_CARGADA,
--                              SNF_AJUSTE_CAMBIADO y SNF_AVISO, y agrupada (una vez cada 0,25 s como mucho) con
--                              QUEST_LOG_UPDATE y QUEST_WATCH_UPDATE (los objetivos llegan después de entrar).
-- Ventana.mostrar(bool), Ventana.alternar()   guardan ventana.visible.
-- Ventana.abrirMenu(ancla?), Ventana.cerrarMenu()   el menú de guías SnetForeverMenuGuias (clic en la cabecera, F3-21;
--                              clic derecho en la ventana; «Elegir guía» del engranaje y de la tarjeta de estado).
-- Ventana.abrirContexto(ancla, opciones), Ventana.cerrarContexto()   menú propio SnetForeverMenuContexto con
--                              opciones = {{texto, accion}}: clic derecho en un paso o en una tarjeta de la lista y en
--                              el engranaje.
-- Ventana.desplazar(n)         mueve la lista n pasos (negativo: hacia arriba); solo repinta si cambia.
-- Ventana.repintarLista()      repinta solo la lista (y el pie, el alto de la ventana y el sitio del bloque).
-- Ventana.marcos = {raiz, cabecera, emblema = {icono, retrato, ...}, titulo, tramo, descripcion, lista, barra = {arriba, abajo,
--                   deslizador, pulgar}, pie = {version, saltados}, botonPanel, aviso = {texto, ahora, masTarde, ruta},
--                   estado = {mensaje, elegir, volver, olvidar}, viaje = {texto, franja, cerrar}, menu, contexto,
--                   pasos = Array<{marco, i, pestana, lineas, casillas, requisitos, espera, sinVerificar}>,
--                   siguientes = FontString[], siguientesNumeros = FontString[], siguientesGuias = FontString[],
--                   siguientesPasos = índice[], tarjetasLista = Button[], listaActiva = k | nil, confirmar}
--   pasos: solo los que se ven. Cada FontString de pasos[k].lineas lleva .icono (su textura, o nil) y .casilla (su
--   casilla, o nil); una línea de un clicknext lleva .fila, el botón que carga su guía. siguientes[k] es el texto de la
--   tarjeta k de la lista (todas sus líneas con su icono), siguientesNumeros[k] su número («02») y siguientesGuias[k] el
--   de la guía entera («· guía 5», T4).
--
-- Líneas de un paso: el texto de cada elemento (ui/texto.lua) con su icono. Las de recorrido generadas (goto,
-- waypoint, pin, line, loop) no se pintan, porque el camino lo enseña la flecha; solo si traen texto propio o si el
-- paso no tiene otra línea (decisión del controlador, tarea 16). Cada línea que se puede completar lleva su casilla
-- redonda: vacía si falta, con la marca si está hecha; un clic la da por hecha a mano (Motor.marcarHecho) y, si con
-- eso queda hecho el paso, la guía avanza. Saltar el paso y «Avisar de un fallo» van en el clic derecho.
-- T4: un clic izquierdo en una tarjeta de la lista va a ese paso; si hacia delante deja pasos sin hacer, antes lo pregunta
-- la caja fija SnetForeverConfirmarPaso (marcos.confirmar = {texto, ir, cancelar}). Un paso hecho elegido hacia atrás se
-- queda con «Ya hecho · pulsa para seguir» (marcos.pasos[k].seguir).
local _, SNF = ...
local Ventana = {}
SNF.Ventana = Ventana

local L = SNF.L
local Estilo = SNF.Estilo
local UI = SNF.UI
local Texto = SNF.Texto
local Motor = SNF.Motor
local Elementos = SNF.Elementos
local Requisitos = SNF.Requisitos
local Guias = SNF.Guias
local Avisos = SNF.Avisos
local Ajustes = SNF.Ajustes
local Datos = SNF.Datos
local Fallo = SNF.Fallo
local TAMANOS = Estilo.TAMANOS

local function detailText(parent, size, role)
  return UI.texto(parent, size, role or "body")
end

local NOMBRE = "SnetForeverVentana"
local NOMBRE_MENU = "SnetForeverMenuGuias"
local NOMBRE_CONTEXTO = "SnetForeverMenuContexto"

-- Medidas (plano b.5 y correcciones del autor).
local HUECO_BLOQUE = 4 -- entre el bloque activo y la cabecera (o el pie)
local HUECO_TARJETAS = 5 -- entre tarjetas del bloque activo
local ALTO_PESTANA = 17
local SOBRESALE = 11 -- lo que la pestaña «Paso N» asoma por encima de su tarjeta
local X_CASILLA, X_ICONO, X_TEXTO = 6, 20, 34
local TAM_CASILLA, TAM_ICONO = 12, 12
local MARGEN_DERECHO = 6
local RELLENO_ABAJO = 6
local ALTO_BOTON = 16 -- botones de texto («Ahora», «Más tarde», «Elegir guía», «Volver a…»)
local TAM_CERRAR_VIAJE = 14 -- la X del cuadro «Cómo llegar»
local ALTO_CABECERA = 34
local MAX_LINEAS_DESCRIPCION = 6 -- líneas de la descripción de la cabecera (la última acaba en «…» si hay más); ronda 1:
-- 6 y no 3, para que quepan el beneficio y lo que se consigue por el camino
local TAM_EMBLEMA, TAM_RETRATO = 40, 18
local X_TITULO = 46
local ALTO_PIE = 18
local TAM_ENGRANAJE = 14
local ANCHO_BARRA = 16
local HUECO_LISTA = 3
local ANCHO_NUMERO = 18
local MAX_LINEAS_LISTA = 4
local MAX_BLOQUE = 0.40 -- el bloque activo llega como mucho al 40 % de la pantalla
local MAX_RESTO = 0.35 -- cabecera, lista y pie, como mucho al 35 %
local ANCHO_MENU = 220
local ALTO_FILA_MENU = 18
local ALTO_FILA_CONTEXTO = 18
-- Deja sitio a su izquierda a «Objetivos cercanos» (ui/objetivos.lua, en x = 20).
local POS_DEFECTO = {punto = "LEFT", relPunto = "LEFT", x = 160, y = 60}
local PUNTOS = {
  TOPLEFT = true, TOP = true, TOPRIGHT = true, LEFT = true, CENTER = true, RIGHT = true,
  BOTTOMLEFT = true, BOTTOM = true, BOTTOMRIGHT = true,
}
local COLOR_REQUISITO = {ok = "|cFF40FF40", falta = "|cFFFF4040", aviso = "|cFFFFD040"}
local COLOR_SIN_VERIFICAR = "|cFFFFD040"
local COLOR_AVISO = {0xFC / 255, 0xDC / 255, 0, 1} -- franja del aviso de clase (#FCDC00)
local RECORRIDO = {["goto"] = true, waypoint = true, pin = true, line = true, loop = true}

-- Texturas de Blizzard (todas aparecen en addons de Forever; ver el informe de la tarea D3).
local CIRCULO = "Interface\\CharacterFrame\\TempPortraitAlphaMask" -- disco blanco: casillas, emblema y pulgar
local MARCA = "Interface\\Buttons\\UI-CheckBox-Check"
local CLASES = "Interface\\TargetingFrame\\UI-Classes-Circles"
local LIBRO = "Interface\\Icons\\INV_Misc_Book_09"
local FLECHA_ARRIBA = "Interface\\Buttons\\UI-ScrollBar-ScrollUpButton-Up"
local FLECHA_ABAJO = "Interface\\Buttons\\UI-ScrollBar-ScrollDownButton-Up"
local RESALTE = "Interface\\Buttons\\ButtonHilight-Square"
local ICONO_AJUSTES = Estilo.FORGE_CONTROLS
local MENU_ABIERTO = "Interface\\Buttons\\Arrow-Down-Up"
local MENU_CERRADO = "Interface\\ChatFrame\\ChatFrameExpandArrow"
local RECORTE_ICONO = {0.08, 0.92}
local RECORTE_FLECHA = {0.2, 0.8, 0.25, 0.75} -- la flecha dentro de su textura de 32×32

-- Secciones de guías laterales del menú (tarea 14 de la fase 3). «Mejoras» (lote «Cadenas de mejoras») va al lado de las
-- cadenas de clase, con el mismo estilo, y sale aunque el personaje no tenga ninguna cadena de clase.
local SECCIONES = {
  {tipo = "cadena", texto = "MENU_CADENAS"},
  {tipo = "mejora", texto = "MENU_MEJORAS"},
  {tipo = "profesion", texto = "MENU_PROFESIONES"},
  {tipo = "mazmorra", texto = "MENU_MAZMORRAS"},
}

local marcos = {pasos = {}, siguientes = {}, siguientesNumeros = {}, siguientesGuias = {}, siguientesPasos = {}, tarjetasLista = {}}
Ventana.marcos = marcos

local raiz
local ocultaPorCombate = false
local bloques = {} -- pool de tarjetas de paso del bloque activo
local tarjetasLista = {} -- pool de tarjetas de la lista
local offsetLista = 1 -- posición (en la lista de pasos) de la primera tarjeta que se ve
local listaClave, listaActual -- guía y paso en los que se colocó la lista por última vez
local cachePasos -- índices de los pasos que salen en la lista (se rehace al cambiar los pasos)

---------------------------------------------------------------------------------------------------
-- Utilidades
---------------------------------------------------------------------------------------------------

-- Valor de un ajuste numérico recortado a sus LIMITES (Ajustes.set no recorta).
local function ajuste(clave)
  local valor = Ajustes.get(clave)
  local limite = Ajustes.LIMITES[clave]
  if not limite then
    return valor
  end
  if type(valor) ~= "number" then
    valor = Ajustes.DEFECTO[clave]
  end
  return math.max(limite.min, math.min(limite.max, valor))
end

-- Los colores se leen siempre al pintar (cambian con ventana.tema).
local function colorTexto(fs, token)
  local c = Estilo.color(token)
  fs:SetTextColor(c[1], c[2], c[3], c[4])
end

local function colorTextura(t, token, alfa)
  local c = Estilo.color(token)
  t:SetVertexColor(c[1], c[2], c[3], alfa or c[4])
end

-- Ruling F3-20: el alfa de la ventana va en todos los fondos de tarjeta (también los que se pintan aquí a mano).
local function alfaVentana()
  return ajuste("ventana.alfa")
end

local function resolver(texto)
  if type(texto) == "function" then
    return texto()
  end
  return texto
end

local function alto(fs)
  local t = fs:GetText()
  if t == nil or t == "" then
    return 0
  end
  return fs:GetStringHeight()
end

-- Alto de una línea de texto del paso (GW:1312): un 10 % más y 1 de aire.
local function altoLinea(fs)
  return math.ceil(alto(fs) * 1.1) + 1
end

local function colocar(region, padre, x, y)
  region:ClearAllPoints()
  region:SetPoint("TOPLEFT", padre, "TOPLEFT", x, -y)
end

local function textura(padre, capa, ruta)
  local t = padre:CreateTexture(nil, capa)
  t:SetTexture(ruta)
  return t
end

-- Un icono de Interface\Icons o un número de archivo (los de C_Item.GetItemIconByID, que también son iconos).
local function esIconoDeObjeto(ruta)
  return type(ruta) == "number" or (type(ruta) == "string" and string.find(string.lower(ruta), "^interface\\icons\\") ~= nil)
end

-- Recorte de los iconos de Interface\Icons (sin el borde de Blizzard).
local function recortarSiIcono(t, ruta, recorte)
  if recorte then
    t:SetTexCoord(recorte[1], recorte[2], recorte[3], recorte[4])
  elseif esIconoDeObjeto(ruta) then
    t:SetTexCoord(RECORTE_ICONO[1], RECORTE_ICONO[2], RECORTE_ICONO[1], RECORTE_ICONO[2])
  else
    t:SetTexCoord(0, 1, 0, 1)
  end
end

-- Icono dentro de un texto (la lista): |Truta:12:12|t, con el recorte 0,08-0,92 en los de Interface\Icons.
local function iconoEnTexto(ruta, recorte)
  if recorte or esIconoDeObjeto(ruta) then
    local r = recorte or {RECORTE_ICONO[1], RECORTE_ICONO[2], RECORTE_ICONO[1], RECORTE_ICONO[2]}
    return string.format("|T%s:%d:%d:0:0:64:64:%d:%d:%d:%d|t", tostring(ruta), TAM_ICONO, TAM_ICONO,
      math.floor(r[1] * 64 + 0.5), math.floor(r[2] * 64 + 0.5), math.floor(r[3] * 64 + 0.5), math.floor(r[4] * 64 + 0.5))
  end
  return string.format("|T%s:%d:%d|t", tostring(ruta), TAM_ICONO, TAM_ICONO)
end

-- Ayuda con GameTooltip al pasar el ratón (plano 3 §7: se comprueba IsForbidden antes de tocarlo). `texto` puede
-- devolver una segunda línea, que sale en gris.
local function conAyuda(marco, texto)
  marco:SetScript("OnEnter", function(self)
    if not GameTooltip or GameTooltip:IsForbidden() then
      return
    end
    local uno, dos = resolver(texto)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText(uno or "")
    if dos then
      local c = Estilo.color("secundario")
      GameTooltip:AddLine(dos, c[1], c[2], c[3])
    end
    GameTooltip:Show()
  end)
  marco:SetScript("OnLeave", function()
    if GameTooltip and not GameTooltip:IsForbidden() then
      GameTooltip:Hide()
    end
  end)
end

-- Botón de texto pequeño (16 de alto, tamaño pequeño, fondo de cabecera con borde); su ancho sigue al texto.
local function botonTexto(padre, texto, alPulsar)
  local b = UI.boton(padre, texto, alPulsar, true)
  Estilo.tarjeta(b, "fondoCabecera")
  Estilo.fuente(b.texto, TAMANOS.pequeno, "control")
  b:SetHeight(ALTO_BOTON)
  local refrescar = b.refrescar
  b.refrescar = function()
    refrescar()
    b:SetWidth(math.max(40, math.floor(b.texto:GetStringWidth() + 14)))
  end
  b.refrescar()
  return b
end

local function etiquetaActiva(pv, nombre)
  local valor = Motor.etiqueta(pv.datos, nombre)
  return valor ~= nil and valor ~= false
end

local function pantalla()
  return UIParent:GetHeight()
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

local function abrirPanel(seccion)
  if SNF.Panel and SNF.Panel.abrir then
    SNF.Panel.abrir(seccion)
  end
end

-- Pasos saltados del personaje: cuántos hay en total y (T4) cuántos son de la guía `clave` (la cargada).
local function numeroSaltados(clave)
  local lista = type(SnetForeverPJ) == "table" and type(SnetForeverPJ.saltados) == "table" and SnetForeverPJ.saltados
  if not lista then
    return 0, 0
  end
  local deGuia = 0
  if clave ~= nil then
    for _, s in ipairs(lista) do
      if s.clave == clave then
        deGuia = deGuia + 1
      end
    end
  end
  return #lista, deGuia
end

-- Deja en `fs` el texto cortado a `max` renglones como mucho: lo que sobra se quita por palabras y acaba en «…».
local function cortarEnLineas(fs, texto, max)
  fs:SetText("Ag")
  local una = fs:GetStringHeight()
  fs:SetText(texto)
  if una <= 0 or fs:GetStringHeight() <= una * max + 0.5 then
    return
  end
  local palabras = {}
  for p in string.gmatch(texto, "%S+") do
    palabras[#palabras + 1] = p
  end
  for n = #palabras - 1, 1, -1 do
    fs:SetText(table.concat(palabras, " ", 1, n) .. "…")
    if fs:GetStringHeight() <= una * max + 0.5 then
      return
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Menú de guías (propio: sin UIDropDownMenu ni EasyMenu, plano 3 §1.6 y §7)
---------------------------------------------------------------------------------------------------

local menu
local pintarMenu

local function elegirVersion(version)
  Guias.elegirVersion(version)
  pintarMenu()
end

-- Fila de menú: botón con resalte, texto y una flecha opcional (grupos que se pliegan).
local function nuevaFilaMenu(padre)
  local fila = CreateFrame("Button", nil, padre)
  fila:EnableMouse(true)
  fila:SetHeight(ALTO_FILA_MENU)
  local luz = textura(fila, "HIGHLIGHT", Estilo.TEXTURA)
  luz:SetVertexColor(1, 1, 1, 0.08)
  luz:SetAllPoints(fila)
  fila.texto = detailText(fila, TAMANOS.lista)
  fila.texto:SetJustifyH("LEFT")
  fila.texto:SetWordWrap(false) -- un renglón: lo que no cabe se corta
  fila.flecha = fila:CreateTexture(nil, "OVERLAY")
  fila.flecha:SetSize(10, 10)
  fila.flecha:SetPoint("RIGHT", fila, "RIGHT", -4, 0)
  fila.flecha:Hide()
  -- Lote E1b: a la derecha, en gris, la zona y la hora de las rutas de la IA (oculto en las demás filas).
  fila.detalle = detailText(fila, TAMANOS.pequeno)
  fila.detalle:SetJustifyH("RIGHT")
  fila.detalle:SetWordWrap(false)
  fila.detalle:SetPoint("RIGHT", fila, "RIGHT", -4, 0)
  fila.detalle:Hide()
  -- El clic derecho solo lo usan las rutas de la IA (quitar): la acción recibe el botón.
  fila:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  fila:SetScript("OnClick", function(self, boton)
    if boton == "RightButton" and not self.aceptaDerecho then
      return
    end
    if self.accion then
      self.accion(boton)
    end
  end)
  fila:SetScript("OnEnter", function(self)
    if not self.pista or not GameTooltip or GameTooltip:IsForbidden() then
      return
    end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText(self.pista)
    GameTooltip:Show()
  end)
  fila:SetScript("OnLeave", function()
    if GameTooltip and not GameTooltip:IsForbidden() then
      GameTooltip:Hide()
    end
  end)
  return fila
end

pintarMenu = function()
  if not menu then
    return
  end
  local version = Ajustes.get("version")
  SNF.WindowSizing.base(menu, ajuste("ventana.escala"))
  menu.normal.refrescar()
  menu.mazmorras.refrescar()
  local blanco, gris = Estilo.color("texto"), Estilo.color("secundario")
  for _, b in ipairs({menu.normal, menu.mazmorras}) do
    local activo = (b == menu.normal) == (version == "normal")
    local color = activo and blanco or gris
    b.texto:SetTextColor(color[1], color[2], color[3], color[4])
  end
  menu.normal:ClearAllPoints()
  menu.normal:SetPoint("TOPLEFT", menu, "TOPLEFT", 6, -6)
  menu.mazmorras:ClearAllPoints()
  menu.mazmorras:SetPoint("LEFT", menu.normal, "RIGHT", 4, 0)

  local actual = Motor.estado().clave
  local y = 6 + ALTO_BOTON + 6
  local usadas = 0
  local function fila(texto, sangria, accion, abierto, cargada)
    usadas = usadas + 1
    local f = menu.filas[usadas]
    if not f then
      f = nuevaFilaMenu(menu)
      menu.filas[usadas] = f
    end
    f:Show()
    f:SetWidth(ANCHO_MENU - 2)
    f.yMenu = y -- se coloca al final, cuando se sabe cuánto mide todo y cuánto se ha desplazado (rueda)
    f.texto:ClearAllPoints()
    f.texto:SetPoint("LEFT", f, "LEFT", 6 + sangria, 0)
    f.texto:SetWidth(ANCHO_MENU - 2 - 6 - sangria - 16)
    f.texto:SetText(texto)
    local color = (cargada == false) and gris or blanco
    f.texto:SetTextColor(color[1], color[2], color[3], color[4])
    f.accion = accion
    f.pista, f.aceptaDerecho = nil, nil
    f.detalle:SetText("")
    f.detalle:Hide()
    if abierto == nil then
      f.flecha:Hide()
    else
      f.flecha:Show()
      f.flecha:SetTexture(abierto and MENU_ABIERTO or MENU_CERRADO)
    end
    y = y + ALTO_FILA_MENU
    return f
  end
  local function grupoPlegable(id, titulo, claves, cargar)
    local abierto = menu.abiertos[id] == true
    fila(titulo, 0, function()
      menu.abiertos[id] = not menu.abiertos[id] or nil
      pintarMenu()
    end, abierto)
    if abierto then
      for _, clave in ipairs(claves) do
        local f = fila(Guias.titulo(clave) or clave, 12, function()
          cargar(clave)
          Ventana.cerrarMenu()
        end, nil, clave == actual)
        -- Las guías de mejora llevan su beneficio como pista (las demás no tienen descripción: sin pista).
        f.pista = Guias.descripcion(clave)
      end
    end
  end

  -- Lote A (revisión 52, I1): con «Con mazmorras» salen también las guías normales de los tramos sin versión con
  -- mazmorras, en un grupo propio con el mismo estilo y «· normal» en el título.
  for _, grupo in ipairs(Guias.delMenu(version)) do
    -- Lote D (D3): el id es el nombre interno del grupo; lo que se ve, su nombre traducido (Guias.tituloGrupo).
    local nombre = grupo.grupo or ""
    local id, titulo = nombre, Guias.tituloGrupo(nombre)
    if grupo.normal then
      id, titulo = "\002" .. nombre, L.t("MENU_GRUPO_NORMAL", titulo)
    end
    -- Elegir una guía a mano en el selector es empezar de cero: sus marcas a mano se olvidan (F3-23).
    grupoPlegable(id, titulo, grupo.claves, function(clave)
      Motor.olvidarMarcas(Datos.guia(clave).clave)
      Guias.cargar(clave)
    end)
  end
  -- «Mis guías»: importar guías RXP desde un paquete preparado en el PC (ui/importar-rxp.lua).
  fila(L.t("MENU_IMPORTAR_RXP"), 0, function()
    Ventana.cerrarMenu()
    SNF.ImportarRXPVentana.abrir()
  end)
  -- Tarea 14: cadenas de clase, profesiones y mazmorras, cada una solo si tiene guías para el personaje.
  for _, s in ipairs(SECCIONES) do
    local claves = Guias.laterales(s.tipo)
    if #claves > 0 then
      -- abrirLateral apunta volverA después de cargar la guía (y de su repintado): se repinta otra vez para que salga
      -- «Volver a…».
      grupoPlegable("\001" .. s.tipo, L.t(s.texto), claves, function(clave)
        Guias.abrirLateral(clave)
        Ventana.pintar()
      end)
    end
  end
  -- Fase 4 (16c): las rutas de zona que ha propuesto la IA y el jugador abrió. Clic: abrir; clic derecho: quitar.
  -- Lote E1b: también las rutas de pines aceptadas (la activa primero; clic: activarla; clic derecho: quitarla), con la
  -- zona y la hora a la derecha.
  -- Ronda 1 (Minor 2): como mucho 5, las más recientes sumando las dos clases (Ruta.menuRutasIA).
  local rutasMenu = SNF.Ruta.menuRutasIA()
  local function conDetalle(f, partes)
    if #partes == 0 then
      return
    end
    f.detalle:SetText(table.concat(partes, " · "))
    colorTexto(f.detalle, "secundario")
    f.detalle:Show()
    f.texto:SetWidth(math.max(40, ANCHO_MENU - 2 - 18 - math.floor(f.detalle:GetStringWidth()) - 10))
  end
  local function hora(t)
    return t and date("%d/%m %H:%M", t) or nil
  end
  local function quitada()
    if GameTooltip and not GameTooltip:IsForbidden() then
      GameTooltip:Hide()
    end
    Ventana.pintar()
    pintarMenu()
  end
  local function filaPines(r)
    local f = fila(r.titulo ~= "" and r.titulo or L.t("RUTA_IA_TITULO"), 12, function(boton)
      if boton == "RightButton" then
        SNF.Ruta.quitarGuardada(r.id)
        quitada()
      else
        SNF.Ruta.activarGuardada(r.id)
        Ventana.pintar()
        Ventana.cerrarMenu()
      end
    end, nil, r.activa)
    f.pista, f.aceptaDerecho = L.t("MENU_QUITAR_RUTA"), true
    local partes = {}
    if r.activa then
      partes[#partes + 1] = L.t("MENU_RUTA_ACTIVA")
    end
    partes[#partes + 1] = r.zona
    partes[#partes + 1] = hora(r.fecha)
    conDetalle(f, partes)
  end
  local function filaZona(clave)
    local f = fila(Guias.titulo(clave) or clave, 12, function(boton)
      if boton == "RightButton" then
        SNF.Ruta.quitarGuia(clave)
        quitada()
      else
        Guias.abrirLateral(clave)
        Ventana.pintar()
        Ventana.cerrarMenu()
      end
    end, nil, clave == actual)
    f.pista, f.aceptaDerecho = L.t("MENU_QUITAR_RUTA"), true
    conDetalle(f, {hora(SNF.Ruta.horaGuia(clave))})
  end
  if #rutasMenu > 0 then
    local abierto = menu.abiertos["\001ia"] == true
    fila(L.t("MENU_RUTAS_IA"), 0, function()
      menu.abiertos["\001ia"] = not menu.abiertos["\001ia"] or nil
      pintarMenu()
    end, abierto)
    if abierto then
      for _, e in ipairs(rutasMenu) do
        if e.tipo == "pines" then
          filaPines(e.ruta)
        else
          filaZona(e.clave)
        end
      end
    end
  end
  soltar(menu.filas, usadas + 1)
  -- Con muchas guías (decenas de «Mis guías») el menú no pasa del alto de la pantalla: las filas que no caben se
  -- esconden y la rueda del ratón las recorre. Los botones Normal / Con mazmorras se quedan siempre arriba.
  local inicio = 6 + ALTO_BOTON + 6
  local total = y + 6
  local maximo = math.floor((UIParent:GetHeight() or 768) / (menu:GetScale() or 1)) - 20
  local alto = math.max(inicio + ALTO_FILA_MENU + 6, math.min(total, maximo))
  local pasos = math.max(0, math.ceil((total - alto) / ALTO_FILA_MENU))
  local desp = math.max(0, math.min(menu.desplazamiento or 0, pasos))
  menu.desplazamiento = desp
  for i = 1, usadas do
    local f = menu.filas[i]
    local fy = f.yMenu - desp * ALTO_FILA_MENU
    if fy < inicio or fy + ALTO_FILA_MENU > alto - 6 then
      f:Hide()
    else
      f:Show()
      colocar(f, menu, 1, fy)
    end
  end
  menu:SetSize(ANCHO_MENU, alto)
end

-- Fondo invisible que cubre la pantalla por debajo de un menú: pulsar fuera lo cierra.
local function fondoQueCierra(marco, capa)
  local fondo = CreateFrame("Frame", nil, UIParent)
  fondo:SetAllPoints(UIParent)
  fondo:SetFrameStrata(capa)
  fondo:EnableMouse(true)
  fondo:Hide()
  fondo:SetScript("OnMouseDown", function()
    marco:Hide()
  end)
  marco.fondo = fondo
  marco:SetScript("OnShow", function()
    fondo:Show()
  end)
  marco:SetScript("OnHide", function()
    fondo:Hide()
  end)
end

local function crearMenu()
  menu = CreateFrame("Frame", NOMBRE_MENU, UIParent)
  SNF.WindowSizing.register(menu, NOMBRE, false)
  menu:SetFrameStrata("DIALOG")
  menu:SetClampedToScreen(true)
  menu:EnableMouse(true)
  Estilo.fondo(menu)
  Estilo.forgePlate(menu, 0.88, true)
  menu:Hide()
  menu.filas = {}
  menu.abiertos = {}
  menu.desplazamiento = 0
  menu:EnableMouseWheel(true)
  menu:SetScript("OnMouseWheel", function(_, delta)
    menu.desplazamiento = (menu.desplazamiento or 0) - (delta > 0 and 3 or -3)
    pintarMenu()
  end)
  fondoQueCierra(menu, "HIGH")
  menu.normal = botonTexto(menu, function()
    return L.t("VERSION_NORMAL")
  end, function()
    elegirVersion("normal")
  end)
  menu.mazmorras = botonTexto(menu, function()
    return L.t("VERSION_MAZMORRAS")
  end, function()
    elegirVersion("mazmorras")
  end)
  table.insert(UISpecialFrames, NOMBRE_MENU)
  marcos.menu = menu
end

function Ventana.cerrarMenu()
  if menu then
    menu:Hide()
  end
end

function Ventana.abrirMenu(ancla)
  if not raiz then
    return
  end
  Ventana.cerrarContexto()
  Ventana.cerrarConfirmar()
  ancla = ancla or marcos.cabecera
  menu:ClearAllPoints()
  menu:SetPoint("TOPLEFT", ancla, "TOPRIGHT", 4, 0)
  menu.desplazamiento = 0
  pintarMenu()
  menu:Show()
end

local function alternarMenu(ancla)
  if menu:IsShown() then
    Ventana.cerrarMenu()
  else
    Ventana.abrirMenu(ancla)
  end
end

---------------------------------------------------------------------------------------------------
-- Menú contextual (clic derecho en un paso o en el engranaje)
---------------------------------------------------------------------------------------------------

local contexto

local function crearContexto()
  contexto = CreateFrame("Frame", NOMBRE_CONTEXTO, UIParent)
  SNF.WindowSizing.register(contexto, NOMBRE, false)
  contexto:SetFrameStrata("DIALOG")
  contexto:SetClampedToScreen(true)
  contexto:EnableMouse(true)
  Estilo.fondo(contexto)
  Estilo.forgePlate(contexto, 0.88, true)
  contexto:Hide()
  contexto.filas = {}
  fondoQueCierra(contexto, "HIGH")
  table.insert(UISpecialFrames, NOMBRE_CONTEXTO)
  marcos.contexto = contexto
end

function Ventana.cerrarContexto()
  if contexto then
    contexto:Hide()
  end
end

function Ventana.abrirContexto(ancla, opciones, x)
  if not raiz or not opciones or #opciones == 0 then
    return
  end
  Ventana.cerrarMenu()
  Ventana.cerrarConfirmar()
  SNF.WindowSizing.base(contexto, ajuste("ventana.escala"))
  local ancho = 0
  for k, opcion in ipairs(opciones) do
    local f = tomar(contexto.filas, k, function()
      return nuevaFilaMenu(contexto)
    end)
    f:SetHeight(ALTO_FILA_CONTEXTO)
    colocar(f, contexto, 1, 4 + (k - 1) * ALTO_FILA_CONTEXTO)
    f.texto:ClearAllPoints()
    f.texto:SetPoint("LEFT", f, "LEFT", 8, 0)
    f.texto:SetText(opcion.texto)
    colorTexto(f.texto, "texto")
    f.accion = function()
      Ventana.cerrarContexto()
      opcion.accion()
    end
    ancho = math.max(ancho, f.texto:GetStringWidth() + 16)
  end
  soltar(contexto.filas, #opciones + 1)
  ancho = math.max(120, math.floor(ancho + 2))
  for k = 1, #opciones do
    contexto.filas[k]:SetWidth(ancho - 2)
  end
  contexto:SetSize(ancho, 8 + #opciones * ALTO_FILA_CONTEXTO)
  contexto:ClearAllPoints()
  contexto:SetPoint("TOPLEFT", ancla, "TOPRIGHT", x or 4, 0)
  contexto:Show()
end

-- Opciones del clic derecho en un paso: «Ir a este paso» (solo en la lista y si no es el actual), «Saltar este paso»
-- (si no está hecho) y «Avisar de un fallo».
local function opcionesPaso(i, enLista)
  local pv = Motor.paso(i)
  local opciones = {}
  if enLista and i ~= Motor.estado().actual then
    opciones[#opciones + 1] = {texto = L.t("IR_A_PASO"), accion = function()
      Motor.irA(i)
    end}
  end
  if pv and not pv.hecho then
    opciones[#opciones + 1] = {texto = L.t("SALTAR_PASO"), accion = function()
      Motor.saltar(i)
    end}
  end
  opciones[#opciones + 1] = {texto = L.t("FALLO_TITULO"), accion = function()
    Fallo.abrir(i)
  end}
  return opciones
end

---------------------------------------------------------------------------------------------------
-- T4: elegir un paso con un clic (y la caja fija que lo confirma)
---------------------------------------------------------------------------------------------------

-- Caja de confirmación SnetForeverConfirmarPaso: «Ir al paso 6. Los pasos 3 a 5 quedarán en Pasos saltados.» con [Ir] y
-- [Cancelar]. Un marco estático, como el menú contextual: se enseña y se esconde de golpe, sin animación ni cambio de
-- color. Pulsar fuera o Escape es cancelar. (Todo en una tabla: el archivo está cerca del tope de 200 locales de Lua.)
local confirmar = {nombre = "SnetForeverConfirmarPaso", ancho = 220}

function confirmar.crear()
  local f = CreateFrame("Frame", confirmar.nombre, UIParent)
  SNF.WindowSizing.register(f, NOMBRE, false)
  confirmar.marco = f
  f:SetFrameStrata("DIALOG")
  f:SetClampedToScreen(true)
  f:EnableMouse(true)
  Estilo.fondo(f)
  f:Hide()
  f.texto = detailText(f, TAMANOS.lista)
  f.texto:SetJustifyH("LEFT")
  f.texto:SetWordWrap(true)
  f.cancelar = botonTexto(f, function()
    return L.t("CONFIRMAR_CANCELAR")
  end, function()
    f:Hide()
  end)
  f.ir = botonTexto(f, function()
    return L.t("CONFIRMAR_IR")
  end, function()
    local destino = f.destino
    f:Hide()
    if destino and not confirmar.cambio() then
      Motor.irA(destino)
    end
  end)
  fondoQueCierra(f, "HIGH")
  table.insert(UISpecialFrames, confirmar.nombre)
  marcos.confirmar = f
end

-- El texto de la caja: el paso al que se va y los que quedarán saltados (el primero y el último, con su número de la lista).
function confirmar.texto(i, saltos)
  local function numeroDe(j)
    local pv = Motor.paso(j)
    return math.floor(pv and pv.numero or 0)
  end
  local primero, ultimo = numeroDe(saltos[1]), numeroDe(saltos[#saltos])
  local resto
  if #saltos == 1 then
    resto = L.t("CONFIRMAR_SALTA_UNO", primero)
  elseif #saltos == 2 then
    resto = L.t("CONFIRMAR_SALTA_DOS", primero, ultimo)
  elseif ultimo - primero + 1 == #saltos then
    resto = L.t("CONFIRMAR_SALTA_VARIOS", primero, ultimo)
  else
    -- Ronda 1 (M2): si no van seguidos, uno a uno: «Los pasos 1, 3 y 4…».
    local antes = {}
    for k = 1, #saltos - 1 do
      antes[k] = tostring(numeroDe(saltos[k]))
    end
    resto = L.t("CONFIRMAR_SALTA_LISTA", table.concat(antes, ", "), ultimo)
  end
  return L.t("CONFIRMAR_PASO", numeroDe(i)) .. " " .. resto
end

-- Ronda 1 de T4 (I1): ¿cambió la guía o el paso actual desde que se abrió la caja? Entonces su índice y su texto ya no
-- valen: la caja se cierra (repintar, desplazar) e «Ir» no hace nada.
function confirmar.cambio()
  local f = confirmar.marco
  local estado = Motor.estado()
  return estado.sinGuia or estado.clave ~= f.clave or estado.actual ~= f.actual or estado.fin ~= f.fin
end

function confirmar.cerrarSiCambio()
  local f = confirmar.marco
  if f and f:IsShown() and confirmar.cambio() then
    f:Hide()
  end
end

function confirmar.abrir(ancla, i, saltos)
  local f = confirmar.marco
  Ventana.cerrarMenu()
  Ventana.cerrarContexto()
  local estado = Motor.estado()
  f.destino, f.clave, f.actual, f.fin = i, estado.clave, estado.actual, estado.fin
  SNF.WindowSizing.base(f, ajuste("ventana.escala"))
  f.texto:SetWidth(confirmar.ancho - 16)
  f.texto:SetText(confirmar.texto(i, saltos))
  colorTexto(f.texto, "texto")
  colocar(f.texto, f, 8, 8)
  local y = 8 + alto(f.texto) + 6
  f.cancelar.refrescar()
  f.ir.refrescar()
  f.cancelar:ClearAllPoints()
  f.cancelar:SetPoint("TOPRIGHT", f, "TOPRIGHT", -8, -y)
  f.ir:ClearAllPoints()
  f.ir:SetPoint("RIGHT", f.cancelar, "LEFT", -4, 0)
  f:SetSize(confirmar.ancho, y + ALTO_BOTON + 8)
  f:ClearAllPoints()
  -- Como el contextual de la lista: fuera de la ventana, a la derecha de la barra.
  f:SetPoint("TOPLEFT", ancla, "TOPRIGHT", ANCHO_BARRA + 2 + 4, 0)
  f:Show()
end

function Ventana.cerrarConfirmar()
  if confirmar.marco then
    confirmar.marco:Hide()
  end
end

-- Clic izquierdo en una tarjeta de la lista: ir a ese paso (Motor.irA). Hacia delante, si se dejan pasos sin hacer
-- (Motor.saltosDeIrA), antes pregunta. En la del paso actual no hace nada, salvo soltarlo si está retenido.
local function elegirPaso(i, ancla)
  local estado = Motor.estado()
  if estado.sinGuia or not i then
    return
  end
  Ventana.cerrarContexto()
  local pv = Motor.paso(i)
  if not pv or pv.pegajoso then
    -- Ronda 1 (I3): un pegajoso no se elige ni se retiene (ya está activo en el bloque mientras no se hace).
    Ventana.cerrarConfirmar()
    return
  end
  if i == estado.actual and not estado.fin then
    Ventana.cerrarConfirmar()
    if Motor.retenido() == i then
      Motor.seguir()
    end
    return
  end
  local saltos = Motor.saltosDeIrA(i)
  if #saltos > 0 then
    confirmar.abrir(ancla, i, saltos)
  else
    Ventana.cerrarConfirmar()
    Motor.irA(i)
  end
end

-- Opciones del clic derecho en el engranaje.
local function opcionesEngranaje()
  local opciones = {
    {texto = L.t("AJUSTES"), accion = function()
      abrirPanel()
    end},
    {texto = L.t("ELEGIR_GUIA"), accion = function()
      Ventana.abrirMenu(marcos.cabecera)
    end},
    {texto = L.t("FALLO_TITULO"), accion = function()
      local estado = Motor.estado()
      Fallo.abrir(not estado.sinGuia and estado.actual or nil)
    end},
  }
  local n = numeroSaltados()
  if n > 0 then
    opciones[#opciones + 1] = {texto = L.t("SALTADOS", math.floor(n)), accion = function()
      abrirPanel("saltados")
    end}
  end
  return opciones
end

---------------------------------------------------------------------------------------------------
-- Bloque activo: tarjetas de paso
---------------------------------------------------------------------------------------------------

local function textoPropio(el)
  local propio = L.de(el.texto)
  return type(propio) == "string" and propio ~= ""
end

-- ¿Lleva casilla? Un elemento que se puede completar: el motor lo da por hecho o pendiente (o, si el paso aún no se
-- ha activado, tiene evaluador). Los informativos (notas, recorrido, clicknext...) no.
local function completable(e)
  if e.datos.sinCasilla then
    return false
  end
  if e.resultado == "hecho" or e.resultado == "pendiente" then
    return true
  end
  return e.resultado == nil and Elementos.def(e.datos.t) ~= nil
end

-- Líneas que enseña un paso: {k, e, el, texto, icono, recorte, casilla, clicknext}.
local function lineasDe(pv)
  local salida, recorrido = {}, {}
  for k, e in ipairs(pv.elementos) do
    local el = e.datos
    local t = Texto.deElemento(el, e.mem)
    if el.t == "clicknext" and t == "" then
      local destino = Guias.primeraDisponible(el.siguientes or el.guias)
      t = destino and L.t("CARGAR_GUIA", Guias.titulo(destino)) or ""
    end
    if t ~= "" then
      local icono, izq, der, arriba, abajo = Texto.icono(el, e.mem)
      local linea = {k = k, e = e, el = el, texto = t, icono = icono, casilla = completable(e),
        clicknext = el.t == "clicknext"}
      if izq then
        linea.recorte = {izq, der, arriba, abajo}
      end
      if RECORRIDO[el.t] and not textoPropio(el) then
        recorrido[#recorrido + 1] = linea
      else
        salida[#salida + 1] = linea
      end
    end
  end
  if #salida == 0 then
    return recorrido
  end
  return salida
end

Ventana.fieldLines = lineasDe

local function textoCasilla(c)
  local pv = c.i and Motor.paso(c.i)
  local e = pv and pv.elementos[c.k]
  if e and e.mem and (e.mem.forzado or e.mem.marcado) then
    return L.t("CASILLA_QUITAR")
  elseif e and e.resultado == "hecho" then
    return L.t("OBJETIVO_CUMPLIDO")
  end
  return L.t("CASILLA_MARCAR")
end

-- Clic en una casilla: un manual se marca o desmarca; otro elemento se da por hecho a mano o, si ya lo estaba a mano,
-- se desmarca. Uno que el juego ya da por hecho no cambia.
local function pulsarCasilla(c)
  local pv = c.i and Motor.paso(c.i)
  local e = pv and pv.elementos[c.k]
  if not e then
    return
  end
  if e.datos.t == "manual" then
    Motor.marcarManual(c.i, c.k, not (e.mem and e.mem.marcado))
  elseif e.mem and e.mem.forzado then
    Motor.marcarHecho(c.i, c.k, false)
  elseif e.resultado ~= "hecho" then
    Motor.marcarHecho(c.i, c.k, true)
  end
end

-- Casilla redonda de 12×12: aro (borde), disco (fondo de lista) y la marca si está hecha.
local function nuevaCasilla(b)
  local c = CreateFrame("Button", nil, b)
  c:SetSize(TAM_CASILLA, TAM_CASILLA)
  c:EnableMouse(true)
  c.aro = textura(c, "BORDER", CIRCULO)
  c.aro:SetAllPoints(c)
  c.disco = textura(c, "ARTWORK", CIRCULO)
  c.disco:SetPoint("TOPLEFT", c, "TOPLEFT", 1, -1)
  c.disco:SetPoint("BOTTOMRIGHT", c, "BOTTOMRIGHT", -1, 1)
  c.marca = textura(c, "OVERLAY", MARCA)
  c.marca:SetPoint("TOPLEFT", c, "TOPLEFT", -1, 1)
  c.marca:SetPoint("BOTTOMRIGHT", c, "BOTTOMRIGHT", 1, -1)
  local luz = textura(c, "HIGHLIGHT", CIRCULO)
  luz:SetAllPoints(c)
  luz:SetVertexColor(1, 1, 1, 0.25)
  c:SetScript("OnClick", function(self)
    pulsarCasilla(self)
  end)
  conAyuda(c, function()
    return textoCasilla(c)
  end)
  return c
end

local function refrescarCasilla(c, e)
  colorTextura(c.aro, "borde")
  colorTextura(c.disco, "fondoLista")
  c.marca:SetShown(e.resultado == "hecho")
end

local function nuevoEnlace(b)
  local f = CreateFrame("Button", nil, b)
  f:EnableMouse(true)
  f.texto = detailText(f, TAMANOS.paso)
  f.texto:SetJustifyH("LEFT")
  f.texto:SetWordWrap(true)
  f.texto:SetPoint("TOPLEFT", f, "TOPLEFT", 0, 0)
  local luz = textura(f, "HIGHLIGHT", Estilo.TEXTURA)
  luz:SetVertexColor(1, 1, 1, 0.08)
  luz:SetAllPoints(f)
  f:SetScript("OnClick", function(self)
    local destino = Guias.primeraDisponible(self.guias)
    if destino then
      Guias.cargar(destino)
    end
  end)
  return f
end

local function nuevoTextoLinea(b, tamano)
  local fs = detailText(b, tamano)
  fs:SetJustifyH("LEFT")
  fs:SetWordWrap(true)
  return fs
end

local function nuevoIcono(b)
  local t = b:CreateTexture(nil, "ARTWORK")
  t:SetSize(TAM_ICONO, TAM_ICONO)
  return t
end

local function nuevoBloque()
  local b = CreateFrame("Button", nil, raiz)
  b:EnableMouse(true)
  b:RegisterForClicks("RightButtonUp")
  Estilo.tarjeta(b, "fondo")
  b.pestana = Estilo.pestana(b, "")
  b.pestana:SetHeight(ALTO_PESTANA)
  b.pestana:EnableMouse(false)
  b.textos, b.enlaces, b.cajas, b.iconos = {}, {}, {}, {}
  b:SetScript("OnClick", function(self, boton)
    if boton == "RightButton" and self.i then
      Ventana.abrirContexto(self, opcionesPaso(self.i, false))
    end
  end)
  return b
end

-- Lo que enseña un paso del bloque activo, en orden y sin tocar ningún marco (revisión del proyecto, I2): pintarBloque
-- lo pinta y, con los eventos del diario, ponerAlDiaBloque lo compara con lo pintado.
-- Pieza = {clase, texto, icono?, recorte?, casilla?, hecha?, e?, k?, enlace?, guias?}   clase: "linea" (una por línea
--   de lineasDe, con su casilla e icono; enlace en las de clicknext), "sinVerificar", "requisito" o "espera".
local function piezasDe(pv)
  local piezas = {}
  local lineas = lineasDe(pv)
  if #lineas == 0 then
    -- Lote C (52-M8): el número de la lista; un paso que no sale en ella, sin número.
    lineas = {{texto = pv.numero and L.t("PASO_SIN_TEXTO", pv.numero) or L.t("PASO_SIN_NUMERO")}}
  end
  for _, linea in ipairs(lineas) do
    piezas[#piezas + 1] = {clase = "linea", texto = linea.texto, icono = linea.icono, recorte = linea.recorte,
      casilla = linea.casilla or nil, hecha = (linea.casilla and linea.e.resultado == "hecho") or nil, e = linea.e,
      k = linea.k, enlace = linea.clicknext or nil,
      guias = linea.clicknext and (linea.el.siguientes or linea.el.guias) or nil}
  end
  local sinVerificar = pv.datos and pv.datos.sinVerificar
  if sinVerificar == "orden" or sinVerificar == "punto" then
    local clave = sinVerificar == "orden" and "SIN_VERIFICAR_ORDEN" or "SIN_VERIFICAR_PUNTO"
    piezas[#piezas + 1] = {clase = "sinVerificar", texto = COLOR_SIN_VERIFICAR .. L.t(clave) .. "|r"}
  end
  for _, r in ipairs(Requisitos.delPaso(pv)) do
    -- Lote D (D2): el nivel de la misión lleva el color que le da el juego (r.color), no el de su estado.
    local color = r.color or COLOR_REQUISITO[r.estado] or COLOR_REQUISITO.aviso
    piezas[#piezas + 1] = {clase = "requisito", icono = Texto.iconoRequisito(r.estado),
      texto = color .. (r.texto or "") .. "|r"}
  end
  if pv.espera then
    local que
    if pv.espera == "nivel" then
      que = L.t("ESPERA_NIVEL", math.floor(pv.nivelMinimo or 0))
    else
      que = L.t("ESPERA_REQUIERE")
    end
    piezas[#piezas + 1] = {clase = "espera", icono = Texto.iconoRequisito("aviso"), texto = L.t("ESPERANDO", que)}
  end
  -- T4: el paso elegido hacia atrás (retenido) y ya hecho no rebota: espera a que el jugador pulse para seguir.
  local retenido, hecho = Motor.retenido()
  if retenido == pv.i and hecho then
    piezas[#piezas + 1] = {clase = "retenido", texto = L.t("RETENIDO")}
  end
  return piezas
end

-- Alto que ocupa una pieza ya pintada en `fs` (con el 1 de separación).
local function altoPieza(p, fs)
  if p.clase == "linea" then
    return math.max(altoLinea(fs), TAM_CASILLA) + 1
  elseif p.clase == "sinVerificar" or p.clase == "retenido" then
    return altoLinea(fs) + 1
  end
  return math.max(altoLinea(fs), TAM_ICONO) + 1
end

-- Pinta el paso pv en la tarjeta b con ese ancho; devuelve la entrada de marcos.pasos y el alto.
local function pintarBloque(b, pv, ancho)
  b.i = pv.i
  b:SetWidth(ancho)
  local nTextos, nEnlaces, nCajas, nIconos = 0, 0, 0, 0
  -- La entrada de marcos.pasos se reutiliza entre repintados.
  local paso = b.paso or {lineas = {}, casillas = {}, requisitos = {}}
  b.paso = paso
  paso.marco, paso.i, paso.pestana, paso.espera, paso.sinVerificar, paso.seguir = b, pv.i, b.pestana, nil, nil, nil
  for _, lista in ipairs({paso.lineas, paso.casillas, paso.requisitos}) do
    for k = #lista, 1, -1 do
      lista[k] = nil
    end
  end
  local anchoTexto = ancho - X_TEXTO - MARGEN_DERECHO

  -- Pestaña «Paso N»: los pegajosos no la llevan, como RXP (GW:1065-1073).
  -- Lote C, ronda 1: tampoco los que no salen en la lista (sin número).
  b.conPestana = not pv.pegajoso and pv.numero ~= nil
  if b.conPestana then
    b.pestana:Show()
    -- Lote C (52-M8): el número de la lista. T4: al lado, en gris, el de la guía entera («Paso 5 · guía 10»).
    local etiqueta = L.t("PASO_N", pv.numero)
    local n = tonumber(pv.n)
    if n then
      local c = Estilo.color("secundario")
      etiqueta = string.format("%s |cFF%02X%02X%02X%s|r", etiqueta, math.floor(c[1] * 255 + 0.5),
        math.floor(c[2] * 255 + 0.5), math.floor(c[3] * 255 + 0.5), L.t("GUIA_N", math.floor(n)))
    end
    b.pestana.ponerTexto(etiqueta)
    colorTexto(b.pestana.texto, "pestana")
    b.pestana:ClearAllPoints()
    b.pestana:SetPoint("BOTTOMLEFT", b, "TOPLEFT", 7, -(ALTO_PESTANA - SOBRESALE))
  else
    b.pestana:Hide()
  end
  local y = b.conPestana and 10 or 6

  local function icono(ruta, recorte)
    if not ruta then
      return nil
    end
    nIconos = nIconos + 1
    local t = tomar(b.iconos, nIconos, function()
      return nuevoIcono(b)
    end)
    t:SetTexture(ruta)
    recortarSiIcono(t, ruta, recorte)
    t:SetVertexColor(1, 1, 1, 1)
    colocar(t, b, X_ICONO, y)
    return t
  end
  local function texto(t, tamano, token)
    nTextos = nTextos + 1
    local fs = tomar(b.textos, nTextos, function()
      return nuevoTextoLinea(b, TAMANOS.paso)
    end)
    Estilo.fuente(fs, tamano, "body")
    colorTexto(fs, token or "texto")
    fs:SetWidth(anchoTexto)
    fs:SetText(t)
    colocar(fs, b, X_TEXTO, y)
    fs.fila, fs.icono, fs.casilla = nil, nil, nil
    return fs
  end

  -- Lo que se enseña sale de piezasDe(pv); cada pieza guarda con qué marcos se pintó y cuánto alto ocupó, para que
  -- los eventos del diario (ponerAlDiaBloque) toquen solo lo que cambie.
  local piezas = piezasDe(pv)
  b.piezas, b.anchoTexto = piezas, anchoTexto
  for _, p in ipairs(piezas) do
    local fs, c
    if p.clase == "linea" then
      if p.casilla then
        nCajas = nCajas + 1
        c = tomar(b.cajas, nCajas, function()
          return nuevaCasilla(b)
        end)
        c.i, c.k = pv.i, p.k
        refrescarCasilla(c, p.e)
        colocar(c, b, X_CASILLA, y)
        paso.casillas[#paso.casillas + 1] = c
      end
      local ic = icono(p.icono, p.recorte)
      if p.enlace then
        nEnlaces = nEnlaces + 1
        local f = tomar(b.enlaces, nEnlaces, function()
          return nuevoEnlace(b)
        end)
        f.guias = p.guias
        fs = f.texto
        fs:SetWidth(anchoTexto)
        fs:SetText(p.texto)
        f:SetSize(anchoTexto, math.max(alto(fs), 1))
        colocar(f, b, X_TEXTO, y)
        fs.fila = f
      else
        fs = texto(p.texto, TAMANOS.paso)
      end
      fs.icono, fs.casilla = ic, c
      paso.lineas[#paso.lineas + 1] = fs
    elseif p.clase == "sinVerificar" then
      -- Tarea 14: un paso sin verificar lo dice en amarillo, antes de los requisitos.
      fs = texto(p.texto, TAMANOS.lista)
      paso.sinVerificar = fs
    elseif p.clase == "retenido" then
      -- T4: «Ya hecho · pulsa para seguir», en texto fijo; pulsarlo suelta el paso (Motor.seguir).
      local f = b.seguir
      if not f then
        f = CreateFrame("Button", nil, b)
        f:EnableMouse(true)
        f.texto = detailText(f, TAMANOS.lista)
        f.texto:SetJustifyH("LEFT")
        f.texto:SetWordWrap(true)
        f.texto:SetPoint("TOPLEFT", f, "TOPLEFT", 0, 0)
        local luz = textura(f, "HIGHLIGHT", Estilo.TEXTURA)
        luz:SetVertexColor(1, 1, 1, 0.08)
        luz:SetAllPoints(f)
        -- Ronda 1 (M4): el clic derecho abre el menú del paso, como en el resto del bloque.
        f:RegisterForClicks("LeftButtonUp", "RightButtonUp")
        f:SetScript("OnClick", function(_, boton)
          if boton == "RightButton" then
            if b.i then
              Ventana.abrirContexto(b, opcionesPaso(b.i, false))
            end
          else
            Motor.seguir()
          end
        end)
        b.seguir = f
      end
      f:Show()
      fs = f.texto
      fs:SetWidth(anchoTexto)
      fs:SetText(p.texto)
      colorTexto(fs, "texto")
      f:SetSize(anchoTexto, math.max(alto(fs), 1))
      colocar(f, b, X_TEXTO, y)
      paso.seguir = f
    else
      local ic = icono(p.icono)
      if p.clase == "requisito" then
        fs = texto(p.texto, TAMANOS.lista)
        paso.requisitos[#paso.requisitos + 1] = fs
      else
        fs = texto(p.texto, TAMANOS.lista, "secundario")
        paso.espera = fs
      end
      fs.icono = ic
    end
    p.fs, p.c = fs, c
    p.h = altoPieza(p, fs)
    y = y + p.h
  end

  if b.seguir and not paso.seguir then
    b.seguir:Hide()
  end
  soltar(b.textos, nTextos + 1)
  soltar(b.enlaces, nEnlaces + 1)
  soltar(b.cajas, nCajas + 1)
  soltar(b.iconos, nIconos + 1)
  y = y - 1 + RELLENO_ABAJO
  b:SetHeight(y)
  return paso, y
end

local function mismoRecorte(a, b)
  if a == nil or b == nil then
    return a == b
  end
  return a[1] == b[1] and a[2] == b[2] and a[3] == b[3] and a[4] == b[4]
end

-- Eventos del diario (revisión del proyecto, I2): pone al día el paso pintado en b tocando solo las piezas cuyo texto o
-- casilla cambió de verdad. Devuelve false si cambió algo más (otras piezas, iconos, enlaces) o si un texto nuevo ocupa
-- otro alto: entonces hay que repintar la ventana entera, como antes.
local function ponerAlDiaBloque(b, pv)
  local viejas = b.piezas
  if not viejas or b.i ~= pv.i then
    return false
  end
  local nuevas = piezasDe(pv)
  if #nuevas ~= #viejas then
    return false
  end
  for n, p in ipairs(nuevas) do
    local v = viejas[n]
    if p.clase ~= v.clase or p.icono ~= v.icono or not mismoRecorte(p.recorte, v.recorte) or p.casilla ~= v.casilla
      or p.k ~= v.k or p.enlace ~= v.enlace or p.guias ~= v.guias then
      return false
    end
  end
  for n, p in ipairs(nuevas) do
    local v = viejas[n]
    if p.hecha ~= v.hecha then
      v.c.marca:SetShown(p.hecha == true)
      v.hecha = p.hecha
    end
    v.e = p.e
    if p.texto ~= v.texto then
      local fs = v.fs
      fs:SetText(p.texto)
      if v.enlace then
        fs.fila:SetSize(b.anchoTexto, math.max(alto(fs), 1))
      end
      v.texto = p.texto
      if altoPieza(v, fs) ~= v.h then
        return false
      end
    end
  end
  return true
end

-- Pasos que se pintan: los activos y, si espera, el actual (no está en activos). Sin los de hidewindow ni los que
-- no tienen elementos (un paso vacío sigue activo un ciclo antes de avanzar).
local function pasosAPintar(estado)
  local lista, vistos = {}, {}
  local function anadir(i)
    local pv = Motor.paso(i)
    if pv and not vistos[i] and #pv.elementos > 0 and not etiquetaActiva(pv, "hidewindow") then
      lista[#lista + 1] = pv
    end
    vistos[i] = true
  end
  for _, i in ipairs(estado.activos) do
    anadir(i)
  end
  if not estado.fin then
    local pv = Motor.paso(estado.actual)
    if pv and pv.espera and not pv.hecho then
      anadir(estado.actual)
    end
  end
  return lista
end

Ventana.fieldSteps = pasosAPintar

-- El aviso que enseña la franja: el primero de la cola de avisos (clase, mejoras, mazmorras) o, si no hay, el de cambio de
-- continente (lote D, D4: motor/continente.lua).
local function avisoActual()
  return Avisos.cola()[1] or (SNF.Continente and SNF.Continente.aviso()) or nil
end

local function esDeContinente(aviso)
  return aviso ~= nil and aviso.tipo == "continente"
end

-- Aviso de clase: tarjeta con una franja amarilla a la izquierda, el texto y «Ahora» / «Más tarde». El de continente
-- (D4) lleva su texto y «Ver dónde» / «Seguir la guía» y, con la app conectada, «Pedir la ruta a la IA» debajo.
local function pintarAviso(ancho)
  local franja = marcos.aviso
  local aviso = avisoActual()
  if not aviso then
    franja:Hide()
    return 0
  end
  local continente = esDeContinente(aviso)
  franja:Show()
  franja:SetWidth(ancho)
  franja.aviso = aviso
  franja.texto:SetWidth(ancho - 12 - MARGEN_DERECHO)
  if continente then
    franja.texto:SetText(SNF.Continente.texto(aviso))
  else
    franja.texto:SetText(L.t("AVISO_NIVEL", math.floor(aviso.nivel), Avisos.texto(aviso) or ""))
  end
  colorTexto(franja.texto, "texto")
  colocar(franja.texto, franja, 12, 6)
  local y = 6 + alto(franja.texto) + 4
  franja.ahora.refrescar()
  franja.masTarde.refrescar()
  franja.masTarde:ClearAllPoints()
  franja.masTarde:SetPoint("TOPRIGHT", franja, "TOPRIGHT", -MARGEN_DERECHO, -y)
  if continente or Avisos.tieneGuia(aviso) then
    franja.ahora:Show()
    franja.ahora:ClearAllPoints()
    franja.ahora:SetPoint("RIGHT", franja.masTarde, "LEFT", -4, 0)
  else
    franja.ahora:Hide()
  end
  y = y + ALTO_BOTON + 6
  if continente and SNF.Timbres and SNF.Timbres.appViva() then
    franja.ruta.refrescar()
    franja.ruta:Show()
    franja.ruta:ClearAllPoints()
    franja.ruta:SetPoint("TOPRIGHT", franja, "TOPRIGHT", -MARGEN_DERECHO, -(y - 2))
    y = y + ALTO_BOTON + 4
  else
    franja.ruta:Hide()
  end
  franja:SetHeight(y)
  return y
end

-- Tarjeta de estado: «Sin guía» / «Fin de la guía» con «Elegir guía», y «Volver a <guía>» cuando hay una guía a la que
-- volver (tarea 14), no solo al acabar. 16-nov: solo si tiene sentido (Avisos.botonVolver: al acabar la lateral o si la
-- guía de vuelta tiene algo que hacer) y con una X al lado que olvida la vuelta (Guias.olvidarVuelta). Sin animaciones ni
-- cambios de color: se enseña y se esconde de golpe.
local function pintarEstado(estado, ancho)
  local t = marcos.estado
  local mensaje
  if estado.sinGuia then
    mensaje = L.t("SIN_GUIA")
  elseif estado.fin then
    mensaje = L.t("FIN_GUIA")
  end
  local volverA = Avisos.botonVolver()
  if not mensaje and not volverA then
    t:Hide()
    return 0
  end
  t:Show()
  t:SetWidth(ancho)
  local y = 6
  if mensaje then
    t.mensaje:Show()
    t.mensaje:SetWidth(ancho - 12)
    t.mensaje:SetText(mensaje)
    colorTexto(t.mensaje, "texto")
    colocar(t.mensaje, t, 6, y)
    y = y + alto(t.mensaje) + 4
    t.elegir:Show()
    t.elegir.refrescar()
    colocar(t.elegir, t, 6, y)
  else
    t.mensaje:Hide()
    t.elegir:Hide()
  end
  if volverA then
    t.volver.destino = volverA
    t.volver:Show()
    t.volver.refrescar()
    t.volver:ClearAllPoints()
    if mensaje then
      t.volver:SetPoint("LEFT", t.elegir, "RIGHT", 4, 0)
    else
      colocar(t.volver, t, 6, y)
    end
    t.olvidar:Show()
    t.olvidar:ClearAllPoints()
    t.olvidar:SetPoint("LEFT", t.volver, "RIGHT", 4, 0)
  else
    t.volver:Hide()
    t.olvidar:Hide()
  end
  y = y + ALTO_BOTON + 6
  t:SetHeight(y)
  return y
end

---------------------------------------------------------------------------------------------------
-- Cabecera
---------------------------------------------------------------------------------------------------

local function pintarEmblema()
  local em = marcos.emblema
  colorTextura(em.aro, "borde")
  colorTextura(em.disco, "fondo", 1)
  colorTextura(em.aroRetrato, "borde")
  local _, clase = UnitClass("player")
  local coordenadas = CLASS_ICON_TCOORDS and clase and CLASS_ICON_TCOORDS[clase]
  if coordenadas then
    em.icono:SetTexture(CLASES)
    em.icono:SetTexCoord(coordenadas[1], coordenadas[2], coordenadas[3], coordenadas[4])
  else
    em.icono:SetTexture(LIBRO)
    em.icono:SetTexCoord(RECORTE_ICONO[1], RECORTE_ICONO[2], RECORTE_ICONO[1], RECORTE_ICONO[2])
  end
  -- El retrato pequeño superpuesto, como RestedXP. Sin la API (o si falla), sin retrato.
  local conRetrato = SetPortraitTexture ~= nil and pcall(SetPortraitTexture, em.retrato, "player")
  em.retrato:SetShown(conRetrato and true or false)
  em.aroRetrato:SetShown(conRetrato and true or false)
end

local function pintarCabecera(estado, ancho)
  local cab = marcos.cabecera
  cab:SetWidth(ancho)
  pintarEmblema()
  local guia = not estado.sinGuia and estado.clave and Datos.guia(estado.clave)
  local titulo, tramo, descripcion = "SnetForever", "", nil
  if guia then
    titulo = Guias.titulo(guia.clave) or guia.nombre or ""
    tramo = Guias.tramo(guia.clave) or ""
    if guia.sinVerificar then
      tramo = tramo .. " · " .. COLOR_SIN_VERIFICAR .. L.t("SIN_VERIFICAR") .. "|r"
    end
    -- Lote «Cadenas de mejoras»: la descripción (el beneficio de una guía de mejora, tal cual) va debajo del tramo.
    descripcion = Guias.descripcion(guia.clave)
  end
  local anchoTitulo = ancho - X_TITULO - MARGEN_DERECHO
  marcos.titulo:SetWidth(anchoTitulo)
  cortarEnLineas(marcos.titulo, titulo, 2)
  colorTexto(marcos.titulo, "texto")
  marcos.tramo:SetWidth(anchoTitulo)
  marcos.tramo:SetText(tramo)
  colorTexto(marcos.tramo, "secundario")
  -- Sin descripción, la región queda vacía y oculta: la cabecera mide y se coloca como siempre.
  local desc = marcos.descripcion
  desc:SetWidth(anchoTitulo)
  if type(descripcion) == "string" and descripcion ~= "" then
    cortarEnLineas(desc, descripcion, MAX_LINEAS_DESCRIPCION)
    colorTexto(desc, "secundario")
    desc:Show()
  else
    desc:SetText("")
    desc:Hide()
  end
  local hTitulo, hTramo, hDesc = alto(marcos.titulo), alto(marcos.tramo), alto(desc)
  local conTramo = hTramo > 0 and 2 + hTramo or 0
  local interior = hTitulo + conTramo + (hDesc > 0 and 2 + hDesc or 0)
  local h = math.max(ALTO_CABECERA, interior + 12)
  local y = math.floor((h - interior) / 2)
  colocar(marcos.titulo, cab, X_TITULO, y)
  colocar(marcos.tramo, cab, X_TITULO, y + hTitulo + 2)
  colocar(desc, cab, X_TITULO, y + hTitulo + conTramo + 2)
  cab:SetHeight(h)
  return h
end

---------------------------------------------------------------------------------------------------
-- Lista de pasos con barra de desplazamiento
---------------------------------------------------------------------------------------------------

-- Índices de los pasos de la guía que salen en la lista: sin optional, hidewindow ni los que no tienen elementos.
local function pasosDeLista()
  if cachePasos then
    return cachePasos
  end
  local lista, i = {}, 1
  while true do
    local pv = Motor.paso(i)
    if not pv then
      break
    end
    if pv.numero ~= nil then -- Motor.enLista: con elementos, sin optional ni hidewindow (lote C, ronda 1)
      lista[#lista + 1] = i
    end
    i = i + 1
  end
  cachePasos = lista
  return lista
end

-- Posición en la lista del paso actual (o del primero que sale detrás de él; con la guía acabada, el último).
local function posicionActual(lista, estado)
  if estado.fin then
    return #lista
  end
  for pos, i in ipairs(lista) do
    if i >= estado.actual then
      return pos
    end
  end
  return #lista
end

local function cupoLista()
  return 1 + ajuste("ventana.siguientes")
end

local function vaciar(t)
  for k in pairs(t) do
    t[k] = nil
  end
end

-- Texto de una tarjeta: todas las líneas del paso con su icono, como mucho 4 (la 4.ª acaba en «…» si hay más).
local function textoTarjeta(pv)
  local lineas = Texto.lineasPaso(pv, MAX_LINEAS_LISTA)
  if #lineas > MAX_LINEAS_LISTA then
    lineas[MAX_LINEAS_LISTA + 1] = nil
    lineas[MAX_LINEAS_LISTA] = {icono = lineas[MAX_LINEAS_LISTA].icono, recorte = lineas[MAX_LINEAS_LISTA].recorte,
      texto = lineas[MAX_LINEAS_LISTA].texto .. "…"}
  end
  local partes = {}
  -- 12-nov: un paso que viene y no se puede hacer lo dice delante (y sale en gris, ver pintarLista).
  local nd = Motor.noDisponible and Motor.noDisponible(pv)
  if nd then
    partes[1] = Texto.noDisponible(nd)
  end
  for _, l in ipairs(lineas) do
    partes[#partes + 1] = l.icono and (iconoEnTexto(l.icono, l.recorte) .. " " .. l.texto) or l.texto
  end
  return table.concat(partes, "\n")
end

-- Texto de cada tarjeta de la lista (textosLista[pos], rehecho en cada repintado de la lista) y su alto, medido con un
-- FontString oculto (medidor) del mismo tamaño que el de las tarjetas. El alto se guarda por texto (revisión del
-- proyecto, I2) y no se vacía en cada repintado: el mismo texto con el mismo ancho y la misma letra mide lo mismo, y
-- uno que cambia (un objetivo que avanza) es otro texto y se mide de nuevo. Se vacía al cambiar el ancho o la letra
-- y, para no crecer sin fin, al llegar a MAX_ALTURAS textos.
local alturas, textosLista = {}, {}
local MAX_ALTURAS = 500
local cuantasAlturas = 0
local alturasAncho, alturasFuente, alturasTamano, alturasContorno -- con qué se midió lo guardado en alturas

local function altoDeTexto(texto, anchoTexto)
  local medidor = marcos.lista.medidor
  local fuente, tamano, contorno = medidor:GetFont()
  if anchoTexto ~= alturasAncho or fuente ~= alturasFuente or tamano ~= alturasTamano or contorno ~= alturasContorno
    or cuantasAlturas >= MAX_ALTURAS then
    vaciar(alturas)
    cuantasAlturas = 0
    alturasAncho, alturasFuente, alturasTamano, alturasContorno = anchoTexto, fuente, tamano, contorno
  end
  local h = alturas[texto]
  if h == nil then
    medidor:SetWidth(anchoTexto)
    medidor:SetText(texto)
    h = math.max(18, alto(medidor) + 8)
    alturas[texto] = h
    cuantasAlturas = cuantasAlturas + 1
  end
  return h
end

local function medirTarjeta(lista, pos, anchoTexto)
  local texto = textosLista[pos]
  if texto == nil then
    local pv = Motor.paso(lista[pos])
    texto = pv and textoTarjeta(pv) or ""
    textosLista[pos] = texto
  end
  if texto == "" then
    return false
  end
  return altoDeTexto(texto, anchoTexto)
end

-- Última posición de la lista que entra empezando en `desde` (con `cupo` tarjetas y `disponible` de alto).
local function ultimaQueEntra(lista, desde, anchoTexto, disponible, cupo)
  local y, n, ultima = HUECO_LISTA, 0, desde - 1
  for pos = desde, #lista do
    if n >= cupo then
      break
    end
    local h = medirTarjeta(lista, pos, anchoTexto)
    if h then
      if y + h + HUECO_LISTA > disponible then
        break
      end
      y, n = y + h + HUECO_LISTA, n + 1
    end
    ultima = pos
  end
  return ultima
end

-- Desplazamiento máximo: el primero desde el que entran las últimas tarjetas, sumando sus altos reales desde el final
-- hasta llenar `disponible` (ronda 1: con escala alta o pantalla baja el final de la guía tiene que alcanzarse).
local function desplazamientoMaximo(lista, anchoTexto, disponible, cupo)
  local y, n, primero = HUECO_LISTA, 0, #lista
  for pos = #lista, 1, -1 do
    local h = medirTarjeta(lista, pos, anchoTexto)
    if h then
      if n >= cupo or y + h + HUECO_LISTA > disponible then
        break
      end
      y, n = y + h + HUECO_LISTA, n + 1
    end
    primero = pos
  end
  return math.max(1, primero)
end

local maximoLista = 1 -- desplazamiento máximo calculado en el último repintado de la lista

local function nuevaTarjetaLista()
  local t = CreateFrame("Button", nil, marcos.lista)
  t:EnableMouse(true)
  t:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  t.fondo = textura(t, "BACKGROUND", Estilo.TEXTURA)
  t.fondo:SetAllPoints(t)
  local luz = textura(t, "HIGHLIGHT", Estilo.TEXTURA)
  luz:SetVertexColor(1, 1, 1, 0.08)
  luz:SetAllPoints(t)
  t.texto = detailText(t, TAMANOS.lista)
  t.texto:SetJustifyH("LEFT")
  t.texto:SetWordWrap(true)
  -- T4: «05 · guía 10»: el número del personaje y, a su derecha, más pequeño y en gris, el de la guía entera.
  t.guia = detailText(t, TAMANOS.pequeno - 1)
  t.guia:SetJustifyH("RIGHT")
  t.guia:SetPoint("BOTTOMRIGHT", t, "BOTTOMRIGHT", -4, 3)
  t.numero = detailText(t, TAMANOS.pequeno)
  t.numero:SetJustifyH("RIGHT")
  t.numero:SetPoint("BOTTOMRIGHT", t.guia, "BOTTOMLEFT", -2, 0)
  t:SetScript("OnClick", function(self, boton)
    if boton == "RightButton" and self.i then
      -- Fuera de la ventana, a la derecha de la barra, para no taparla.
      Ventana.abrirContexto(self, opcionesPaso(self.i, true), ANCHO_BARRA + 2 + 4)
    elseif boton == "LeftButton" and self.i then
      elegirPaso(self.i, self) -- T4: un clic va al paso
    end
  end)
  -- Al pasar el ratón, el fondo resalte (un color fijo) y la ayuda fija del clic (T4), sin efectos.
  t:SetScript("OnEnter", function(self)
    colorTextura(self.fondo, "resalte", alfaVentana())
    if not GameTooltip or GameTooltip:IsForbidden() then
      return
    end
    local uno
    local pv = Motor.paso(self.i)
    local retenido, hecho = Motor.retenido()
    if not self.activa then
      uno = not (pv and pv.pegajoso) and L.t("CLIC_IR_PASO") or nil -- ronda 1 (I3): un pegajoso no se elige
    elseif retenido == self.i and hecho then
      uno = L.t("RETENIDO") -- ronda 1 (M1): solo si de verdad está hecho
    end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    local c = Estilo.color("secundario")
    if uno then
      GameTooltip:SetText(uno)
      GameTooltip:AddLine(L.t("CLIC_DERECHO_MENU"), c[1], c[2], c[3])
    else
      GameTooltip:SetText(L.t("CLIC_DERECHO_MENU"))
    end
    GameTooltip:Show()
  end)
  t:SetScript("OnLeave", function(self)
    colorTextura(self.fondo, self.activa and "resalte" or "fondoLista", alfaVentana())
    if GameTooltip and not GameTooltip:IsForbidden() then
      GameTooltip:Hide()
    end
  end)
  return t
end

local function pintarBarra(cuantas)
  local barra = marcos.barra
  barra.ajustando = true
  barra.deslizador:SetMinMaxValues(1, maximoLista)
  barra.deslizador:SetValue(offsetLista)
  barra.ajustando = false
  colorTextura(barra.pulgar, "resalte")
  colorTextura(barra.carril, "fondoLista")
  local function estadoFlecha(b, activo)
    if activo then
      b:Enable()
      b.icono:SetVertexColor(1, 1, 1, 1)
    else
      b:Disable()
      b.icono:SetVertexColor(0.4, 0.4, 0.4, 1)
    end
  end
  estadoFlecha(barra.arriba, offsetLista > 1)
  estadoFlecha(barra.abajo, offsetLista < maximoLista and cuantas > 0)
end

-- Pinta las tarjetas que caben en `disponible` desde offsetLista y devuelve el alto de la lista (0 sin pasos).
local function pintarLista(estado, ancho, disponible)
  local lista = estado.sinGuia and {} or pasosDeLista()
  vaciar(textosLista)
  vaciar(marcos.siguientes)
  vaciar(marcos.siguientesNumeros)
  vaciar(marcos.siguientesGuias)
  vaciar(marcos.siguientesPasos)
  vaciar(marcos.tarjetasLista)
  marcos.listaActiva = nil
  local caja = marcos.lista
  if #lista == 0 then
    caja:Hide()
    soltar(tarjetasLista, 1)
    maximoLista = 1
    return 0
  end
  local anchoTarjeta = ancho - 2 - ANCHO_BARRA - 1
  -- T4: la columna del número deja sitio también al de la guía entera (el más largo: el del último paso que trae n;
  -- ronda 1, M3: aunque el último no lo traiga).
  local maxN
  for pos = #lista, 1, -1 do
    local q = Motor.paso(lista[pos])
    maxN = q and tonumber(q.n)
    if maxN then
      break
    end
  end
  local medidorGuia = caja.medidorGuia
  medidorGuia:SetText(maxN and L.t("GUIA_N", math.floor(maxN)) or "")
  local anchoGuia = maxN and math.ceil(medidorGuia:GetStringWidth()) + 2 or 0
  local anchoTexto = anchoTarjeta - 6 - ANCHO_NUMERO - anchoGuia
  local cupo = cupoLista()
  maximoLista = desplazamientoMaximo(lista, anchoTexto, disponible, cupo)
  if estado.clave ~= listaClave or estado.actual ~= listaActual then
    -- Al cambiar de paso o de guía, la lista se coloca en el activo; si con ese desplazamiento el activo no entra
    -- (escala alta, pantalla baja, final de la guía), se sube hasta que entre.
    listaClave, listaActual = estado.clave, estado.actual
    local posActual = posicionActual(lista, estado)
    offsetLista = math.max(1, math.min(maximoLista, posActual))
    while offsetLista < posActual and ultimaQueEntra(lista, offsetLista, anchoTexto, disponible, cupo) < posActual do
      offsetLista = offsetLista + 1
    end
    maximoLista = math.max(maximoLista, offsetLista)
  end
  offsetLista = math.max(1, math.min(maximoLista, offsetLista))
  caja:Show()
  caja:SetWidth(ancho)
  local y = HUECO_LISTA
  local usadas = 0
  for pos = offsetLista, ultimaQueEntra(lista, offsetLista, anchoTexto, disponible, cupo) do
    local h = medirTarjeta(lista, pos, anchoTexto)
    if h then
      local pv = Motor.paso(lista[pos])
      usadas = usadas + 1
      local t = tarjetasLista[usadas]
      if not t then
        t = nuevaTarjetaLista()
        tarjetasLista[usadas] = t
      end
      t:Show()
      t.i = pv.i
      t.activa = pv.i == estado.actual and not estado.fin
      t.texto:SetWidth(anchoTexto)
      t.texto:SetText(textosLista[pos])
      t:SetSize(anchoTarjeta, h)
      colocar(t, caja, 1, y)
      colocar(t.texto, t, 6, 4)
      t.numero:SetText(string.format("%02d", pv.numero))
      colorTexto(t.numero, "secundario")
      local n = tonumber(pv.n)
      t.guia:SetText(n and L.t("GUIA_N", math.floor(n)) or "")
      t.guia:SetWidth(anchoGuia) -- ronda 1 (M3): ancho fijo, así el número del personaje queda en columna
      colorTexto(t.guia, "secundario")
      local apagado = pv.hecho or (Motor.noDisponible and Motor.noDisponible(pv) ~= nil)
      colorTexto(t.texto, (apagado and not t.activa) and "secundario" or "texto")
      colorTextura(t.fondo, t.activa and "resalte" or "fondoLista", alfaVentana())
      marcos.siguientes[usadas] = t.texto
      marcos.siguientesNumeros[usadas] = t.numero
      marcos.siguientesGuias[usadas] = t.guia
      marcos.siguientesPasos[usadas] = pv.i
      marcos.tarjetasLista[usadas] = t
      if t.activa then
        marcos.listaActiva = usadas
      end
      y = y + h + HUECO_LISTA
    end
  end
  soltar(tarjetasLista, usadas + 1)
  if usadas == 0 then
    -- Lo que no cabe se quita: si no cabe ni una tarjeta, no hay lista (el paso activo sigue en el bloque).
    caja:Hide()
    return 0
  end
  -- Alto mínimo para que quepan las dos flechas y el pulgar, si hay sitio.
  local h = y
  local minimo = 2 * ANCHO_BARRA + 14
  if h < minimo and minimo <= disponible then
    h = minimo
  end
  caja:SetHeight(h)
  pintarBarra(usadas)
  return h
end

---------------------------------------------------------------------------------------------------
-- Pie
---------------------------------------------------------------------------------------------------

-- T4: «Saltados» cuenta los de la guía cargada y, si hay de otras, el total: «Saltados: 1 (40 en total)».
local function pintarPie(ancho, clave)
  local pie = marcos.pie
  pie:SetSize(ancho, ALTO_PIE)
  pie.version:SetText(L.t("PIE_VERSION", SNF.VERSION or ""))
  colorTexto(pie.version, "secundario")
  local n, deGuia = numeroSaltados(clave)
  if n > 0 then
    pie.saltados.cuantos, pie.saltados.deGuia = n, deGuia
    pie.saltados:Show()
    pie.saltados.refrescar()
  else
    pie.saltados:Hide()
  end
end

---------------------------------------------------------------------------------------------------
-- Pintar
---------------------------------------------------------------------------------------------------

-- Alto de la parte de arriba de la ventana en la pantalla (unidades de UIParent), a partir de su ancla.
local function arribaEnPantalla(altoRaiz, escala)
  local punto, _, relPunto, _, y = raiz:GetPoint(1)
  local H = pantalla()
  if not punto then
    return H
  end
  local ref = string.find(relPunto, "TOP") and H or (string.find(relPunto, "BOTTOM") and 0 or H / 2)
  local dy = string.find(punto, "TOP") and 0 or (string.find(punto, "BOTTOM") and altoRaiz or altoRaiz / 2)
  return ref + (y + dy) * escala
end

-- Coloca las tarjetas del bloque activo (de la más cercana a la ventana hacia fuera) encima de la cabecera o debajo
-- del pie. Una tarjeta con pestaña deja sitio para lo que la pestaña asoma.
local function colocarBloque(tarjetas, arriba)
  local acumulado = HUECO_BLOQUE
  for _, t in ipairs(tarjetas) do
    local asoma = t.pestana and SOBRESALE or 0
    t.marco:ClearAllPoints()
    if arriba then
      t.marco:SetPoint("BOTTOMLEFT", marcos.cabecera, "TOPLEFT", 0, acumulado)
      acumulado = acumulado + t.h + asoma + HUECO_TARJETAS
    else
      t.marco:SetPoint("TOPLEFT", marcos.pie, "BOTTOMLEFT", 0, -(acumulado + asoma))
      acumulado = acumulado + asoma + t.h + HUECO_TARJETAS
    end
  end
end

local function altoBloque(tarjetas)
  local total = HUECO_BLOQUE
  for _, t in ipairs(tarjetas) do
    total = total + t.h + (t.pestana and SOBRESALE or 0) + HUECO_TARJETAS
  end
  return total - HUECO_TARJETAS
end

-- Entradas del bloque activo del último repintado (tablas reutilizadas): pasos pintados, el estado y el aviso.
local pintados, prioridad, ordenBloque = {}, {}, {}
local cerrarViaje -- la X de «Cómo llegar» (más abajo, junto a pintarViaje)
local entradaEstado, entradaAviso, entradaViaje = {}, {}, {}

-- 11-nov (un jugador: «la flecha me dice qué hacer pero la guía no dice lo mismo»): tarjeta «Cómo llegar» junto al paso
-- actual con lo mismo que dice la flecha (Flecha.viaje): el maestro de vuelo, a dónde volar y que después se sigue a pie
-- por el camino naranja del mapa; o que no hay camino conocido. Sin viaje que contar, no sale.
--
-- 16-nov (un jugador: «si ya estoy en otro destino y me está recomendando arriba del todo seguir con otro contenido,
-- debería dejarme cerrarlo si no quiero retomarlo»): la X del cuadro lo cierra para la guía activa (su clave), el paso
-- actual del motor (su id) y el destino del viaje (Flecha.viaje().clave). Se guarda por personaje en
-- SnetForeverPJ.viajeCerrado = {guia, paso, destino}, así que un /reload no lo hace volver. Vuelve en cuanto cambia
-- cualquiera de los tres (otro paso, otra guía, otro destino) y al volver a elegir la guía (SNF_GUIA_CARGADA que no
-- sea la carga del arranque). Solo esconde el cuadro: la flecha, los pines y la guía siguen igual. Sin animaciones ni
-- cambios de alfa (regla de interfaz): se esconde y vuelve de golpe.
local function firmaViaje(estado, v)
  local pv = estado and estado.actual and Motor.paso(estado.actual)
  return estado and estado.clave or "", pv and pv.id or "", v and v.clave or ""
end

local function viajeCerrado(estado, v)
  local c = type(SnetForeverPJ) == "table" and SnetForeverPJ.viajeCerrado
  if type(c) ~= "table" then
    return false
  end
  local guia, paso, destino = firmaViaje(estado, v)
  return c.guia == guia and c.paso == paso and c.destino == destino
end

cerrarViaje = function()
  local v = SNF.Flecha and SNF.Flecha.viaje and SNF.Flecha.viaje() or nil
  if v and type(SnetForeverPJ) == "table" then
    local guia, paso, destino = firmaViaje(Motor.estado(), v)
    SnetForeverPJ.viajeCerrado = {guia = guia, paso = paso, destino = destino}
  end
  if GameTooltip and not GameTooltip:IsForbidden() and GameTooltip:GetOwner() == marcos.viaje.cerrar then
    GameTooltip:Hide()
  end
  Ventana.pintar()
end

local function pintarViaje(estado, ancho)
  local t = marcos.viaje
  local v = SNF.Flecha and SNF.Flecha.viaje and SNF.Flecha.viaje() or nil
  if v and viajeCerrado(estado, v) then
    v = nil
  end
  if not t or not v then
    if t then
      t:Hide()
    end
    return 0
  end
  local lineas = {L.t("VIAJE_TITULO")}
  if v.enVuelo then
    lineas[#lineas + 1] = L.t("VIAJE_EN_VUELO", v.destino or "")
  elseif v.consejo then
    lineas[#lineas + 1] = L.t("VIAJE_MAESTRO", SNF.Datos.nombrePNJ(v.consejo.origen))
    lineas[#lineas + 1] = L.t(v.consejo.seguro and "VIAJE_VUELA" or "VIAJE_VUELA_SI", v.zonaHasta or "",
      SNF.Datos.nombrePNJ(v.consejo.hasta))
    lineas[#lineas + 1] = L.t(v.conCamino and "VIAJE_A_PIE_CAMINO" or "VIAJE_A_PIE", v.destino or "")
  elseif v.conCamino then
    lineas[#lineas + 1] = L.t("VIAJE_SOLO_CAMINO", v.destino or "")
  else
    lineas[#lineas + 1] = L.t("FLECHA_SIN_CAMINO")
  end
  t:Show()
  t:SetWidth(ancho)
  t.texto:SetWidth(ancho - 12 - MARGEN_DERECHO - TAM_CERRAR_VIAJE - 4) -- sin pisar la X
  t.texto:SetText(table.concat(lineas, "\n"))
  colorTexto(t.texto, "texto")
  colocar(t.texto, t, 12, 6)
  local h = 6 + alto(t.texto) + 6
  t:SetHeight(h)
  return h
end
local principalBloque = 0
local ultimo -- lo que necesita repintarLista del último Ventana.pintar: estado, ancho, escala, altos y topes

-- Pinta las tarjetas del bloque activo (sin colocarlas).
local function prepararBloque(estado, ancho)
  local lista = pasosAPintar(estado)
  vaciar(pintados)
  principalBloque = #lista
  for k, pv in ipairs(lista) do
    local b = tomar(bloques, k, nuevoBloque)
    local paso, h = pintarBloque(b, pv, ancho)
    local e = b.entrada or {}
    b.entrada = e
    e.marco, e.paso, e.h, e.pestana = b, paso, h, b.conPestana
    pintados[k] = e
    if pv.i == estado.actual then
      principalBloque = k
    end
  end
  soltar(bloques, #lista + 1)
  local hEstado = pintarEstado(estado, ancho)
  local hAviso = pintarAviso(ancho)
  local hViaje = pintarViaje(estado, ancho)
  entradaEstado.marco, entradaEstado.h = marcos.estado, hEstado
  entradaAviso.marco, entradaAviso.h = marcos.aviso, hAviso
  entradaViaje.marco, entradaViaje.h = marcos.viaje, hViaje
end

-- Elige lo que cabe en `maximo`: siempre el paso actual (o el último activo); luego el estado, el aviso y los demás
-- pasos. Enseña lo elegido, oculta lo demás y deja en ordenBloque las tarjetas de dentro hacia fuera: el actual, los
-- demás pasos (del último al primero), el estado y el aviso arriba del todo.
local function elegirBloque(maximo)
  vaciar(prioridad)
  vaciar(ordenBloque)
  local function candidata(e)
    if e and e.h > 0 then
      e.dentro = false
      prioridad[#prioridad + 1] = e
    end
  end
  candidata(pintados[principalBloque])
  candidata(entradaViaje)
  candidata(entradaEstado)
  candidata(entradaAviso)
  for k = #pintados, 1, -1 do
    if k ~= principalBloque then
      candidata(pintados[k])
    end
  end
  local usado = HUECO_BLOQUE - HUECO_TARJETAS
  for n, e in ipairs(prioridad) do
    local h = e.h + (e.pestana and SOBRESALE or 0) + HUECO_TARJETAS
    if n == 1 or usado + h <= maximo then
      e.dentro = true
      usado = usado + h
    end
  end
  local function anadir(e)
    if e and e.h > 0 then
      if e.dentro then
        e.marco:Show()
        ordenBloque[#ordenBloque + 1] = e
      else
        e.marco:Hide()
      end
    end
  end
  anadir(pintados[principalBloque])
  anadir(entradaViaje)
  for k = #pintados, 1, -1 do
    if k ~= principalBloque then
      anadir(pintados[k])
    end
  end
  anadir(entradaEstado)
  anadir(entradaAviso)
  vaciar(marcos.pasos)
  for _, e in ipairs(pintados) do
    if e.dentro then
      marcos.pasos[#marcos.pasos + 1] = e.paso
    end
  end
  return ordenBloque
end

-- Coloca el bloque activo: encima de la cabecera si cabe (y ventana.pasoArriba), si no debajo del pie; si no cabe en
-- ningún lado, en el que más sitio tiene, quitando tarjetas para no salirse de la pantalla (ronda 1).
local function situarBloque()
  local u = ultimo
  local H = pantalla()
  local altoRaiz = raiz:GetHeight()
  local arriba = arribaEnPantalla(altoRaiz, u.escala)
  local sitioArriba = (H - arriba) / u.escala
  local sitioAbajo = (arriba - altoRaiz * u.escala) / u.escala
  local orden = elegirBloque(u.maxBloque)
  local alto = altoBloque(orden)
  local subir = false
  if Ajustes.get("ventana.pasoArriba") ~= false then
    if alto <= sitioArriba then
      subir = true
    elseif alto > sitioAbajo then
      subir = sitioArriba >= sitioAbajo
    end
  end
  local sitio = subir and sitioArriba or sitioAbajo
  if alto > sitio then
    orden = elegirBloque(math.min(u.maxBloque, sitio))
  end
  colocarBloque(orden, subir)
end

-- Repinta solo la lista (y lo que depende de su alto: el pie, el alto de la ventana y el sitio del bloque).
function Ventana.repintarLista()
  local u = ultimo
  if not raiz or not u then
    return
  end
  local hLista = pintarLista(u.estado, u.ancho, u.disponible)
  colocar(marcos.lista, raiz, 0, u.hCabecera)
  colocar(marcos.pie, raiz, 0, u.hCabecera + hLista)
  raiz:SetHeight(u.hCabecera + hLista + ALTO_PIE)
  situarBloque()
end

-- Mueve la lista n pasos (negativo: hacia arriba); solo repinta si el desplazamiento cambia.
function Ventana.desplazar(n)
  local nuevo = math.max(1, math.min(maximoLista, offsetLista + math.floor(n)))
  if nuevo ~= offsetLista then
    offsetLista = nuevo
    Ventana.cerrarConfirmar() -- ronda 1 de T4 (I1): la tarjeta de la caja ya enseña otro paso
    Ventana.repintarLista()
  end
end

local sucia = false -- un evento del diario llegó con la ventana oculta: se pinta entera al enseñarla

local function pintarTodo()
  sucia = false
  Texto.olvidar() -- un repintado entero rehace todos los textos, como antes de la memoria de Texto.deElemento
  local estado = Motor.estado()
  local ancho = ajuste("ventana.ancho")
  local escala = ajuste("ventana.escala")
  raiz:SetWidth(ancho)
  SNF.WindowSizing.base(raiz, escala)
  local H = pantalla()

  local hCabecera = pintarCabecera(estado, ancho)
  colocar(marcos.cabecera, raiz, 0, 0)
  pintarPie(ancho, estado.clave)
  ultimo = ultimo or {}
  ultimo.estado, ultimo.ancho, ultimo.escala, ultimo.hCabecera = estado, ancho, escala, hCabecera
  local displayScale = raiz:GetScale()
  ultimo.disponible = H * MAX_RESTO / displayScale - hCabecera - ALTO_PIE
  ultimo.maxBloque = H * MAX_BLOQUE / displayScale
  ultimo.H, ultimo.idioma = H, L.idioma()
  ultimo.saltados, ultimo.saltadosGuia = numeroSaltados(estado.clave)
  ultimo.aviso, ultimo.volverA = avisoActual(), Avisos.botonVolver()
  prepararBloque(estado, ancho)
  Ventana.repintarLista()

  if menu and menu:IsShown() then
    pintarMenu()
  end
end

local function mismaLista(a, b)
  if #a ~= #b then
    return false
  end
  for k = 1, #a do
    if a[k] ~= b[k] then
      return false
    end
  end
  return true
end

-- ¿Cambió algo de lo que pinta la ventana además de los textos y las casillas de los pasos? La guía, el paso actual,
-- los activos, el idioma, el tamaño (ancho, escala, alto de la pantalla), los saltados, el aviso o el «Volver a…».
local function cambioGeneral(u, estado)
  local e = u.estado
  local saltados, deGuia = numeroSaltados(estado.clave)
  return estado.clave ~= e.clave or estado.actual ~= e.actual or estado.fin ~= e.fin or estado.sinGuia ~= e.sinGuia
    or not mismaLista(estado.activos, e.activos) or L.idioma() ~= u.idioma or ajuste("ventana.ancho") ~= u.ancho
    or ajuste("ventana.escala") ~= u.escala or pantalla() ~= u.H or saltados ~= u.saltados
    or deGuia ~= u.saltadosGuia or avisoActual() ~= u.aviso or Avisos.botonVolver() ~= u.volverA
end

-- Eventos del diario (revisión del proyecto, I2): en vez de repintarlo todo, se compara lo que se enseñaría ahora con lo
-- pintado y solo se toca lo que cambió de verdad. Las líneas del bloque activo con otro texto o con la casilla cambiada
-- se reescriben una a una (ponerAlDiaBloque); la lista solo se repinta si cambia el texto de alguna de las tarjetas que
-- se midieron en su último repintado. Con cualquier otro cambio (paso actual, guía, idioma, tamaño, piezas de un paso,
-- un alto distinto), el repintado entero de siempre.
local function ponerAlDiaDiario()
  local u = ultimo
  if sucia or not u then
    return pintarTodo()
  end
  local estado = Motor.estado()
  if cambioGeneral(u, estado) then
    return pintarTodo()
  end
  local lista = pasosAPintar(estado)
  if #lista ~= #pintados then
    return pintarTodo()
  end
  for k, pv in ipairs(lista) do
    if not ponerAlDiaBloque(pintados[k].marco, pv) then
      return pintarTodo()
    end
  end
  u.estado = estado
  local pasos = estado.sinGuia and {} or pasosDeLista()
  for pos, texto in pairs(textosLista) do
    local pv = Motor.paso(pasos[pos])
    if (pv and textoTarjeta(pv) or "") ~= texto then
      Ventana.repintarLista()
      break
    end
  end
  if menu and menu:IsShown() then
    pintarMenu()
  end
end

-- Ventana.pintar(modo): sin modo, el repintado entero; con modo "diario" (los eventos del diario agrupados), solo lo
-- que cambió (ponerAlDiaDiario).
function Ventana.pintar(modo)
  if not raiz then
    return
  end
  if modo == "diario" then
    ponerAlDiaDiario()
  else
    pintarTodo()
  end
end

---------------------------------------------------------------------------------------------------
-- Marco, posición y visibilidad
---------------------------------------------------------------------------------------------------

function Ventana.placeGuideFrame(frame, fallback)
  local pos = Ajustes.get("ventana.pos")
  if type(pos) ~= "table" or not PUNTOS[pos.punto] or not PUNTOS[pos.relPunto] or type(pos.x) ~= "number"
    or type(pos.y) ~= "number" then
    pos = fallback
  end
  frame:ClearAllPoints()
  frame:SetPoint(pos.punto, UIParent, pos.relPunto, pos.x, pos.y)
end

local function colocarVentana()
  Ventana.placeGuideFrame(raiz, POS_DEFECTO)
end

-- Oculta (a mano o en combate), cierra también los menús: cuelgan de UIParent y su fondo invisible, que cubre la
-- pantalla, se comería el primer clic.
local function aplicarVisible()
  if raiz then
    local visible = Ajustes.get("ventana.visible") ~= false and not ocultaPorCombate
    local details = not SNF.GuideViews or SNF.GuideViews.applyVisibility(visible)
    local leavingDetails = raiz:IsShown() and not details
    raiz:SetShown(visible and details)
    if not visible or leavingDetails then
      Ventana.cerrarMenu()
      Ventana.cerrarContexto()
      Ventana.cerrarConfirmar() -- ronda 1 de T4 (I2): también la caja y su fondo de pantalla completa
    end
  end
end

Ventana.refreshVisibility = aplicarVisible

local function guardarPosicion()
  local punto, _, relPunto, x, y = raiz:GetPoint(1)
  if punto then
    Ajustes.set("ventana.pos", {punto = punto, relPunto = relPunto, x = x, y = y})
  end
end

local function empezarArrastre()
  if not Ajustes.get("ventana.bloqueada") then
    raiz.moviendo = true
    raiz:StartMoving()
    return true
  end
  return false
end

local function soltarVentana()
  if raiz.moviendo then
    raiz.moviendo = false
    raiz:StopMovingOrSizing()
    -- La posición la guarda el addon (ventana.pos), no el cliente (layout-local.txt).
    raiz:SetUserPlaced(false)
    guardarPosicion()
    Ventana.pintar()
  end
end

-- Cabecera: tarjeta de cabecera con el emblema redondo (aro, disco, icono de clase y el retrato superpuesto), el título
-- y el tramo. Ruling F3-21, como RestedXP: un clic (izquierdo sin arrastrar, o derecho) abre el menú de guías;
-- arrastrarla con el izquierdo mueve la ventana (si no está bloqueada).
local UMBRAL_ARRASTRE = 4
local function crearCabecera()
  local cab = CreateFrame("Frame", nil, raiz)
  Estilo.tarjeta(cab, "fondoCabecera")
  Estilo.forgePlate(cab, 0.85, true)
  cab:EnableMouse(true)
  -- Sin RegisterForDrag: en el cliente real el arrastre registrado se comía el OnMouseUp del clic (el izquierdo no abría el
  -- menú). Se decide por la distancia que recorre el cursor entre OnMouseDown y OnMouseUp (UMBRAL_ARRASTRE px): al pasarla
  -- empieza a mover la ventana (OnUpdate) y ya no cuenta como clic. Orden de eventos: OnMouseDown -> [OnUpdate] -> OnMouseUp.
  local function vigilar(self)
    local d = self.bajada
    if d and not self.movida then
      local x, y = GetCursorPosition()
      if math.max(math.abs(x - d.x), math.abs(y - d.y)) >= UMBRAL_ARRASTRE then
        self.movida = true
        self.arrastrada = empezarArrastre()
      end
    end
  end
  local function olvidar(self)
    if self.arrastrada then
      soltarVentana() -- si se oculta a mitad de arrastre, no se queda moviéndose sin guardar la posición
    end
    self:SetScript("OnUpdate", nil)
    self.bajada, self.movida, self.arrastrada = nil, false, false
  end
  cab:SetScript("OnMouseDown", function(self, boton)
    if boton == "LeftButton" then
      local x, y = GetCursorPosition()
      self.bajada = {x = x, y = y}
      self.movida, self.arrastrada = false, false
      self:SetScript("OnUpdate", vigilar)
    end
  end)
  cab:SetScript("OnMouseUp", function(self, boton)
    vigilar(self)
    local arrastro = self.movida
    if self.arrastrada then
      soltarVentana()
    end
    olvidar(self)
    if not arrastro and (boton == "LeftButton" or boton == "RightButton") then
      alternarMenu(self)
    end
  end)
  cab:SetScript("OnHide", olvidar)
  marcos.cabecera = cab

  local em = CreateFrame("Frame", nil, cab)
  em:SetSize(TAM_EMBLEMA, TAM_EMBLEMA)
  em:SetPoint("LEFT", cab, "LEFT", -2, 0)
  em.aro = textura(em, "BACKGROUND", CIRCULO)
  em.aro:SetAllPoints(em)
  em.disco = textura(em, "BORDER", CIRCULO)
  em.disco:SetPoint("TOPLEFT", em, "TOPLEFT", 2, -2)
  em.disco:SetPoint("BOTTOMRIGHT", em, "BOTTOMRIGHT", -2, 2)
  em.icono = textura(em, "ARTWORK", CLASES)
  em.icono:SetPoint("TOPLEFT", em, "TOPLEFT", 4, -4)
  em.icono:SetPoint("BOTTOMRIGHT", em, "BOTTOMRIGHT", -4, 4)
  local r = CreateFrame("Frame", nil, em)
  r:SetSize(TAM_RETRATO, TAM_RETRATO)
  r:SetPoint("BOTTOMRIGHT", em, "BOTTOMRIGHT", 4, -2)
  em.aroRetrato = textura(r, "BORDER", CIRCULO)
  em.aroRetrato:SetAllPoints(r)
  em.retrato = r:CreateTexture(nil, "ARTWORK")
  em.retrato:SetPoint("TOPLEFT", r, "TOPLEFT", 1, -1)
  em.retrato:SetPoint("BOTTOMRIGHT", r, "BOTTOMRIGHT", -1, 1)
  marcos.emblema = em

  marcos.titulo = detailText(cab, TAMANOS.titulo, "heading")
  marcos.titulo:SetJustifyH("CENTER")
  marcos.titulo:SetWordWrap(true)
  marcos.tramo = detailText(cab, TAMANOS.pequeno)
  marcos.tramo:SetJustifyH("CENTER")
  -- Lote «Cadenas de mejoras»: la descripción de la guía (solo la traen las de mejora).
  marcos.descripcion = detailText(cab, TAMANOS.pequeno)
  marcos.descripcion:SetJustifyH("CENTER")
  marcos.descripcion:SetWordWrap(true)
  marcos.descripcion:Hide()
end

local function botonFlecha(padre, ruta, paso)
  local b = CreateFrame("Button", nil, padre)
  b:SetSize(ANCHO_BARRA, ANCHO_BARRA)
  b:EnableMouse(true)
  b.icono = textura(b, "ARTWORK", ruta)
  b.icono:SetTexCoord(RECORTE_FLECHA[1], RECORTE_FLECHA[2], RECORTE_FLECHA[3], RECORTE_FLECHA[4])
  local function soltarIcono()
    b.icono:ClearAllPoints()
    b.icono:SetAllPoints(b)
  end
  soltarIcono()
  b:SetHighlightTexture(RESALTE, "ADD")
  b:GetHighlightTexture():SetAllPoints(b)
  -- Pulsado: la flecha baja un píxel (sin texturas «-Down» que no se han visto en Forever).
  b:SetScript("OnMouseDown", function(self)
    if self:IsEnabled() then
      self.icono:ClearAllPoints()
      self.icono:SetPoint("TOPLEFT", self, "TOPLEFT", 1, -1)
      self.icono:SetPoint("BOTTOMRIGHT", self, "BOTTOMRIGHT", 1, -1)
    end
  end)
  b:SetScript("OnMouseUp", soltarIcono)
  b:SetScript("OnClick", function()
    Ventana.desplazar(paso)
  end)
  return b
end

-- Lista: caja de fondo con las tarjetas a la izquierda y la barra vertical a la derecha (flecha arriba, pulgar
-- redondo en su carril y flecha abajo). La rueda del ratón también la mueve.
local function crearLista()
  local caja = CreateFrame("Frame", nil, raiz)
  Estilo.tarjeta(caja, "fondo")
  caja:EnableMouseWheel(true)
  caja:SetScript("OnMouseWheel", function(_, delta)
    Ventana.desplazar(delta > 0 and -1 or 1)
  end)
  marcos.lista = caja
  -- Medidor oculto del mismo tamaño que el texto de las tarjetas: mide su alto antes de pintarlas.
  caja.medidor = detailText(caja, TAMANOS.lista)
  caja.medidor:SetWordWrap(true)
  caja.medidor:Hide()
  caja.medidorGuia = detailText(caja, TAMANOS.pequeno - 1) -- T4: mide «· guía n» (ver pintarLista)
  caja.medidorGuia:SetWordWrap(false)
  caja.medidorGuia:Hide()

  local barra = CreateFrame("Frame", nil, caja)
  barra:SetWidth(ANCHO_BARRA)
  barra:SetPoint("TOPRIGHT", caja, "TOPRIGHT", -1, -1)
  barra:SetPoint("BOTTOMRIGHT", caja, "BOTTOMRIGHT", -1, 1)
  barra.arriba = botonFlecha(barra, FLECHA_ARRIBA, -1)
  barra.arriba:SetPoint("TOP", barra, "TOP", 0, 0)
  barra.abajo = botonFlecha(barra, FLECHA_ABAJO, 1)
  barra.abajo:SetPoint("BOTTOM", barra, "BOTTOM", 0, 0)
  barra.carril = textura(barra, "BACKGROUND", Estilo.TEXTURA)
  barra.carril:SetWidth(4)
  barra.carril:SetPoint("TOP", barra.arriba, "BOTTOM", 0, 0)
  barra.carril:SetPoint("BOTTOM", barra.abajo, "TOP", 0, 0)
  local d = CreateFrame("Slider", nil, barra)
  d:SetOrientation("VERTICAL")
  d:EnableMouse(true)
  d:SetWidth(ANCHO_BARRA)
  d:SetPoint("TOP", barra.arriba, "BOTTOM", 0, 0)
  d:SetPoint("BOTTOM", barra.abajo, "TOP", 0, 0)
  barra.pulgar = textura(d, "OVERLAY", CIRCULO)
  barra.pulgar:SetSize(12, 12)
  d:SetThumbTexture(barra.pulgar)
  d:SetValueStep(1)
  if d.SetObeyStepOnDrag then
    d:SetObeyStepOnDrag(true)
  end
  d:SetMinMaxValues(1, 1)
  d:SetValue(1)
  d:SetScript("OnValueChanged", function(_, valor)
    if not barra.ajustando then
      Ventana.desplazar(math.floor(valor + 0.5) - offsetLista)
    end
  end)
  barra.deslizador = d
  marcos.barra = barra
end

local function crearAviso()
  local franja = CreateFrame("Frame", nil, raiz)
  Estilo.tarjeta(franja, "fondo")
  local amarilla = textura(franja, "ARTWORK", Estilo.TEXTURA)
  amarilla:SetVertexColor(COLOR_AVISO[1], COLOR_AVISO[2], COLOR_AVISO[3], COLOR_AVISO[4])
  amarilla:SetWidth(2)
  amarilla:SetPoint("TOPLEFT", franja, "TOPLEFT", 1, -1)
  amarilla:SetPoint("BOTTOMLEFT", franja, "BOTTOMLEFT", 1, 1)
  franja.franja = amarilla
  franja.texto = detailText(franja, TAMANOS.lista)
  franja.texto:SetJustifyH("LEFT")
  franja.texto:SetWordWrap(true)
  -- Lote D (D4): con el aviso de continente, «Ver dónde» y «Seguir la guía» en el sitio de «Ahora» y «Más tarde».
  franja.ahora = botonTexto(franja, function()
    return L.t(esDeContinente(franja.aviso) and "CONT_VER" or "AHORA")
  end, function()
    if esDeContinente(franja.aviso) then
      SNF.Continente.verDonde()
      Ventana.pintar()
    elseif franja.aviso then
      Avisos.ahora(franja.aviso.id)
      Ventana.pintar()
    end
  end)
  franja.masTarde = botonTexto(franja, function()
    return L.t(esDeContinente(franja.aviso) and "CONT_SEGUIR" or "MAS_TARDE")
  end, function()
    if esDeContinente(franja.aviso) then
      SNF.Continente.seguir()
      Ventana.pintar()
    elseif franja.aviso then
      Avisos.masTarde(franja.aviso.id)
      Ventana.pintar()
    end
  end)
  franja.ruta = botonTexto(franja, function()
    return L.t("CONT_IA")
  end, function()
    if esDeContinente(franja.aviso) then
      SNF.Continente.pedirRuta()
    end
  end)
  franja.ruta:Hide()
  franja:Hide()
  marcos.aviso = franja
end

local function crearViaje()
  local t = CreateFrame("Frame", nil, raiz)
  Estilo.tarjeta(t, "fondo")
  local naranja = textura(t, "ARTWORK", Estilo.TEXTURA)
  naranja:SetVertexColor(1, 0.5, 0.1, 1) -- el color del camino a pie en el mapa
  naranja:SetWidth(2)
  naranja:SetPoint("TOPLEFT", t, "TOPLEFT", 1, -1)
  naranja:SetPoint("BOTTOMLEFT", t, "BOTTOMLEFT", 1, 1)
  t.franja = naranja
  t.texto = detailText(t, TAMANOS.lista)
  t.texto:SetJustifyH("LEFT")
  t.texto:SetWordWrap(true)
  -- 16-nov: la X (como la del chat): cierra el cuadro para esta guía, este paso y este destino (cerrarViaje).
  local cerrar = UI.boton(t, "X", function()
    cerrarViaje()
  end)
  Estilo.tarjeta(cerrar, "fondoCabecera")
  Estilo.fuente(cerrar.texto, TAMANOS.pequeno, "control")
  cerrar:SetSize(TAM_CERRAR_VIAJE, TAM_CERRAR_VIAJE)
  cerrar:SetPoint("TOPRIGHT", t, "TOPRIGHT", -3, -3)
  conAyuda(cerrar, function()
    return L.t("VIAJE_CERRAR"), L.t("VIAJE_CERRAR_AYUDA")
  end)
  t.cerrar = cerrar
  t:Hide()
  marcos.viaje = t
end

local function crearEstado()
  local t = CreateFrame("Frame", nil, raiz)
  Estilo.tarjeta(t, "fondo")
  t.mensaje = detailText(t, TAMANOS.paso)
  t.mensaje:SetJustifyH("LEFT")
  t.mensaje:SetWordWrap(true)
  t.elegir = botonTexto(t, function()
    return L.t("ELEGIR_GUIA")
  end, function(self)
    alternarMenu(self)
  end)
  -- T3: con la guía de vuelta sin acabar, «Volver a <guía> (paso N)».
  t.volver = botonTexto(t, function()
    local destino = t.volver and t.volver.destino
    local titulo = destino and Guias.titulo(destino) or ""
    local n = destino and Avisos.pasoVolver(destino)
    return n and L.t("VOLVER_A_PASO", titulo, n) or L.t("VOLVER_A", titulo)
  end, function()
    Avisos.volver()
  end)
  -- 16-nov: la X de «Volver a» (como la del chat): olvida la vuelta (Guias.olvidarVuelta) y se repinta sin ella.
  local olvidar = UI.boton(t, "X", function()
    Guias.olvidarVuelta()
    if GameTooltip and not GameTooltip:IsForbidden() and GameTooltip:GetOwner() == t.olvidar then
      GameTooltip:Hide()
    end
    Ventana.pintar()
  end)
  Estilo.tarjeta(olvidar, "fondoCabecera")
  Estilo.fuente(olvidar.texto, TAMANOS.pequeno, "control")
  olvidar:SetSize(ALTO_BOTON, ALTO_BOTON)
  conAyuda(olvidar, function()
    return L.t("VOLVER_OLVIDAR"), L.t("VOLVER_OLVIDAR_AYUDA")
  end)
  olvidar:Hide()
  t.olvidar = olvidar
  t:Hide()
  marcos.estado = t
end

-- Pie: engranaje a la izquierda (clic: ajustes; clic derecho: menú), «SnetForever vX.Y.Z» centrado y «Saltados: N» a
-- la derecha si hay alguno (abre el panel en esa sección).
local function crearPie()
  local pie = CreateFrame("Frame", nil, raiz)
  Estilo.tarjeta(pie, "fondoCabecera")
  Estilo.forgeTrim(pie)
  pie.version = detailText(pie, TAMANOS.pequeno)
  pie.version:SetJustifyH("CENTER")
  pie.version:SetPoint("CENTER", pie, "CENTER", 0, 0)

  local engranaje = CreateFrame("Button", nil, pie)
  engranaje:SetSize(TAM_ENGRANAJE, TAM_ENGRANAJE)
  engranaje:EnableMouse(true)
  engranaje:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  engranaje.icono = textura(engranaje, "ARTWORK", ICONO_AJUSTES)
  engranaje.icono:SetTexCoord(0, 0.5, 0, 1)
  engranaje.icono:SetAllPoints(engranaje)
  engranaje:SetHighlightTexture(RESALTE, "ADD")
  engranaje:GetHighlightTexture():SetAllPoints(engranaje)
  engranaje:SetPoint("LEFT", pie, "LEFT", 3, 0)
  engranaje:SetScript("OnClick", function(self, boton)
    if boton == "RightButton" then
      Ventana.abrirContexto(self, opcionesEngranaje())
    else
      abrirPanel()
    end
  end)
  conAyuda(engranaje, function()
    return L.t("AJUSTES"), L.t("CLIC_DERECHO_MENU")
  end)
  marcos.botonPanel = engranaje

  local saltados = CreateFrame("Button", nil, pie)
  saltados:EnableMouse(true)
  saltados:SetHeight(ALTO_PIE - 4)
  saltados.texto = detailText(saltados, TAMANOS.pequeno)
  saltados.texto:SetPoint("RIGHT", saltados, "RIGHT", 0, 0)
  saltados:SetPoint("RIGHT", pie, "RIGHT", -4, 0)
  saltados.refrescar = function()
    local total, deGuia = math.floor(saltados.cuantos or 0), math.floor(saltados.deGuia or 0)
    if deGuia == total then
      saltados.texto:SetText(L.t("SALTADOS", total))
    else
      saltados.texto:SetText(L.t("SALTADOS_TOTAL", deGuia, total))
    end
    colorTexto(saltados.texto, "secundario")
    saltados:SetWidth(math.floor(saltados.texto:GetStringWidth() + 2))
  end
  saltados:SetScript("OnEnter", function(self)
    colorTexto(self.texto, "texto")
  end)
  saltados:SetScript("OnLeave", function(self)
    colorTexto(self.texto, "secundario")
  end)
  saltados:SetScript("OnClick", function()
    abrirPanel("saltados")
  end)
  saltados:Hide()
  pie.saltados = saltados
  marcos.pie = pie
end

function Ventana.crear()
  if raiz then
    return raiz
  end
  -- La raíz no tiene fondo propio: cada pieza pinta el suyo y entre las piezas se ve el juego.
  raiz = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(raiz, NOMBRE, true)
  marcos.raiz = raiz
  raiz:SetFrameStrata("MEDIUM")
  raiz:SetClampedToScreen(true)
  raiz:SetMovable(true)
  raiz:EnableMouse(true)
  raiz:SetScript("OnMouseDown", function(_, boton)
    if boton == "LeftButton" then
      empezarArrastre()
    end
  end)
  raiz:SetScript("OnMouseUp", function(_, boton)
    if boton == "RightButton" then
      alternarMenu(marcos.cabecera)
    else
      soltarVentana()
    end
  end)
  raiz:SetScript("OnHide", soltarVentana)
  -- Lo que llegó del diario mientras estaba oculta se pinta ahora, una vez (revisión del proyecto, I2).
  raiz:SetScript("OnShow", function()
    if sucia then
      Ventana.pintar()
    end
  end)

  crearCabecera()
  crearLista()
  crearPie()
  crearAviso()
  crearViaje()
  crearEstado()
  crearMenu()
  crearContexto()
  confirmar.crear()

  colocarVentana()
  ocultaPorCombate = ajuste("ventana.ocultarEnCombate") == true and InCombatLockdown()
  aplicarVisible()
  Ventana.pintar()
  return raiz
end

function Ventana.mostrar(visible)
  Ajustes.set("ventana.visible", visible and true or false)
end

function Ventana.alternar()
  Ventana.mostrar(Ajustes.get("ventana.visible") == false)
end

---------------------------------------------------------------------------------------------------
-- Eventos
---------------------------------------------------------------------------------------------------

local function repintar()
  cachePasos = nil
  confirmar.cerrarSiCambio() -- ronda 1 de T4 (I1): otra guía u otro paso actual
  Ventana.pintar()
end

-- 16-nov: volver a elegir una guía (cualquier carga que no sea la de la guía guardada al entrar al mundo) vuelve a
-- abrir el «Cómo llegar» cerrado; antes del repintado, que ya lo enseña.
SNF.escuchar("SNF_GUIA_CARGADA", function()
  if type(SnetForeverPJ) == "table" and not (SNF.Arranque and SNF.Arranque.cargandoGuia) then
    SnetForeverPJ.viajeCerrado = nil
  end
end)
SNF.escuchar("SNF_PASOS_CAMBIADOS", repintar)
SNF.escuchar("SNF_GUIA_CARGADA", repintar)
SNF.escuchar("SNF_AVISO", repintar)
SNF.escuchar("SNF_VIAJE", repintar) -- 11-nov: la flecha cambió de plan de viaje (otro vuelo, camino o ninguno)
SNF.escuchar("SNF_AVISO_CONTINENTE", repintar) -- lote D (D4): el jugador cambió de zona y el aviso de continente cambió

-- Tarea 22: al entrar al mundo la ventana se pinta antes de que el cliente tenga los objetivos de las misiones
-- (C_QuestLog.GetQuestObjectives vacío) y sale el texto genérico «misión: 0/1»; cuando llegan, el paso no cambia y
-- nadie la repintaba. Se repinta también con los eventos del diario, agrupados: como mucho un repintado cada
-- AGRUPAR segundos, por muchos eventos que lleguen seguidos.
local AGRUPAR = 0.25
local repintadoPendiente = false

-- Revisión del proyecto, I2: con la ventana oculta (ventana.visible apagado u oculta en combate) no se pinta nada; se
-- apunta que está sucia y se pinta entera una vez al volver a enseñarla (OnShow). Con ella a la vista, la puesta al
-- día solo toca lo que cambió (Ventana.pintar("diario")).
local function oculta()
  if raiz and not raiz:IsShown() then
    sucia = true
    return true
  end
  return false
end

local function repintarAgrupado()
  if repintadoPendiente or oculta() then
    return
  end
  repintadoPendiente = true
  C_Timer.After(AGRUPAR, function()
    repintadoPendiente = false
    if raiz and not oculta() then
      Ventana.pintar("diario")
    end
  end)
end

SNF.escuchar("QUEST_LOG_UPDATE", repintarAgrupado)
SNF.escuchar("QUEST_WATCH_UPDATE", repintarAgrupado)

-- Lote A (Minor 1 de la revisión de I2): el cliente da tarde el nombre de un objeto o de una misión que no tenía en
-- caché. Se olvida el texto memorizado de los elementos que lo citan y, si había alguno, se repinta agrupado, como con el
-- diario. Si el cliente no conoce el evento, Eventos.escuchar no lo registra (nucleo/eventos.lua) y no hay error.
local function nombreRecibido(olvidar)
  return function(id, bien)
    if SNF.API.esSecreto(id) or SNF.API.esSecreto(bien) then
      return
    end
    if bien ~= false and type(id) == "number" and olvidar(id) then
      repintarAgrupado()
    end
  end
end

SNF.escuchar("GET_ITEM_INFO_RECEIVED", nombreRecibido(Texto.olvidarObjeto))
SNF.escuchar("QUEST_DATA_LOAD_RESULT", nombreRecibido(Texto.olvidarMision))
SNF.escuchar("SNF_AJUSTE_CAMBIADO", function(clave)
  if not raiz then
    return
  end
  if clave == "ventana.pos" then
    colocarVentana()
  elseif clave == "ventana.ocultarEnCombate" then
    ocultaPorCombate = ajuste("ventana.ocultarEnCombate") == true and InCombatLockdown()
  end
  sucia = false -- se pinta entera justo después: que el OnShow de aplicarVisible no la pinte otra vez
  aplicarVisible()
  Ventana.pintar()
end)

-- Ocultar en combate (plano 3 §1.8: la ventana es un marco normal y se puede ocultar y enseñar en combate). El bloque
-- activo cuelga de la raíz: se oculta con ella.
SNF.escuchar("PLAYER_REGEN_DISABLED", function()
  if raiz and ajuste("ventana.ocultarEnCombate") == true then
    ocultaPorCombate = true
    aplicarVisible()
  end
end)
SNF.escuchar("PLAYER_REGEN_ENABLED", function()
  if raiz and ocultaPorCombate then
    ocultaPorCombate = false
    aplicarVisible()
  end
end)
