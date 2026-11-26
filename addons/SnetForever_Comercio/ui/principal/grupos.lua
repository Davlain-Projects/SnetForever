-- SnetForever: página «Grupos» de la ventana principal de comercio: panel izquierdo (árbol) y derecho (cabecera, Información,
-- Objetos y Operaciones).
-- Un panel de 273 px en el color `secundario` con, arriba, el buscador (campo con lupa «Buscar en grupos») y detrás los iconos
-- exportar e importar; debajo, el árbol de grupos (Piezas.arbol) sobre SNF.Arbol, con Grupo Base arriba.
--   - Al pasar el ratón por una fila salen ⊕ (crear subgrupo) y 🗑 (borrar, con confirmación). Grupo Base solo lleva ⊕.
--   - ⊕ abre un campo para el nombre en la propia fila nueva (Intro o perder el foco con texto lo crea; Escape lo deshace).
--     Los nombres siguen las reglas de Arbol.crear (sin «`», sin repetir entre hermanos) y, T1a, no empiezan por «/» (con
--     espacios delante o no: es un comando del chat pegado en el campo). El campo lo dice en una línea («Eso parece un
--     comando del chat, no un nombre de grupo») y no crea nada; lo mismo al renombrar con ✎ y al importar texto. Un grupo que
--     ya exista con un nombre así no se toca: lo borra el jugador.
--   - 🗑 abre una pequeña confirmación propia (el addon no usa StaticPopup; es un marco como el cuadro de cantidad de
--     comercio_cantidad.lua) y, al confirmar, Arbol.borrar manda el grupo a la papelera y sus objetos al Grupo Base.
--   - Arrastrar un grupo sobre otro llama a Arbol.mover. Soltarlo sobre sí mismo o sobre uno de sus descendientes se rechaza
--     (con un aviso en el chat), y Grupo Base no se arrastra.
--   - El buscador filtra el árbol mientras se escribe (sin fijarse en mayúsculas ni tildes).
--   - Importar abre un menú pequeño: «Importar texto» y «Importar de TSM».
-- Las tres acciones de exportar e importar son GANCHOS: la página los busca en esta tabla al pulsar (Grupos.exportar(ruta),
-- Grupos.importarTexto(), Grupos.importarTSM()). Exportar e importar texto (Task 19, comercio/texto-grupos.lua) abren una
-- ventanita con el texto para copiar o pegar (.texto: .titulo, .ayuda, .caja (EditBox de varias líneas), .resumen, .aviso,
-- .pregunta, .radio (Sí/No), .preguntaModo y .radioModo (Juntar/Reemplazar, solo al importar de TSM), .botonImportar,
-- .botonCerrar). Importar de TSM (Task 25, comercio/importar-tsm.lua) usa la MISMA ventanita: sin TSM activo dice en una
-- línea del chat cómo activarlo; con TSM sale ya, con «Leyendo TSM: N %» mientras lee TSM en pasos (Ronda 1: sin tirón al
-- abrirla; Importar sigue apagado), y al acabar enseña el resumen («N grupos, N objetos, N operaciones») y, en la caja (solo para
-- leer), las operaciones por tipo, las fuentes propias, los grupos que ya existen, los objetos que están en otro grupo y las
-- fórmulas que se traducen o quedan marcadas; encima de todo, el diagnóstico de precios (plan de paridad, entrega 1:
-- TSM.diagnostico, entero y sin recortar) y, al importar, la huella de esa lectura (si TSM cambió, no se escribe nada).
-- El diagnóstico que se ve es el del modo elegido (Juntar conserva tus fuentes y tus listas; Reemplazar las aparta): al cambiar
-- la respuesta se cambia en el mismo paso, e Importar está apagado si lo que se ve no es el del modo elegido (TSM.revisado).
-- Si ya hay grupos pregunta «¿juntar o reemplazar?» y si se mueven los objetos que están en otro grupo. Al importar, el aviso
-- enseña el avance («Importando: N %», un número que solo crece; en combate, que
-- está en pausa) y, al terminar, la misma ventanita dice «Importados N grupos, N objetos y N operaciones», la comprobación y
-- la lista de fórmulas traducidas y marcadas (y lo mismo en el chat). En combate no empieza. Cerrarla no para la importación.
-- Esconderla por donde sea (Cerrar, Cancelar o el Escape general, que solo la esconde) limpia su estado y para la lectura
-- de TSM (Ronda 2): nunca vuelve a salir sola, ni al acabar la lectura ni al acabar la importación (que sigue sin ella).
--
-- Lado derecho (sigue al grupo elegido en el árbol): cabecera con carpeta, nombre en Bold en el color de su nivel y, en subgrupos,
-- ✎ (renombrar en sitio) y exportar (llama a Grupos.exportar(ruta)); pestañas secundarias (Información u Objetos, y Operaciones;
-- ver más abajo). Grupo Base › Información: buscador, «Mostrar los objetos sin grupo como» (específico, nivel de
-- objeto, objeto base; solo dura la sesión), lista de objetos sin grupo de las bolsas, «Seleccionar grupo» y «Mover N objetos»
-- (Task 31: el botón mide lo que «Mover 9999 objetos» en el idioma de ahora, fijo mientras se cuenta; el desplegable sigue
-- anclado a su izquierda).
-- Subgrupo › Objetos: dos listas (sin grupo: bolsas y grupo padre; en el grupo) con «Añadir N objetos» y «Quitar N objetos».
-- Las listas son Piezas.tabla (virtualizadas, con casillas); al juego se le pregunta por un objeto una sola vez y solo por los que
-- se ven (los desconocidos salen como «Objeto N» con interrogación y se repintan con GET_ITEM_INFO_RECEIVED mientras se ve la página).
-- B3s, como TSM: en las listas de objetos, el clic suma o quita esa fila de lo elegido, Alt + clic elige el tramo,
-- Mayús + clic pone el enlace del objeto en el chat (sin chat abierto, lo abre con él dentro) y Ctrl + clic lo enseña en el
-- probador (UIComercio.clicModificado, el de todas las filas de objeto); con Mayús o Ctrl lo elegido no cambia.
-- T1a: con el ratón sobre un objeto de cualquiera de las listas sale su tooltip del juego (UIComercio.tooltipObjeto, a la
-- derecha de la fila) y al salir se va; las filas de sección no sacan nada. Los objetos de las bolsas llevan en su fila el
-- enlace de su hueco (solo en memoria; lo guardado sigue siendo «i:<id>»): nombre, color y tooltip salen de él, con su sufijo
-- («Hacha Natocolina de espíritu»), en los dos formatos de enlace. Como en TSM, los ligados no salen en «Objetos sin grupo en
-- las bolsas» (no se pueden subastar).
-- Partes del lado derecho: .derecha, .cabecera (.icono, .nombre, .botonLapiz, .botonExportar, .campoNombre), .pestanas,
-- .paginaInfo (.textoInfo, .campoObjetosBase, .etiquetaModo, .desplegableModo, .tablaBase, .desplegableGrupo, .botonMover),
-- .paginaObjetos (.campoObjetosGrupo, .tablaSinGrupo, .tablaEnGrupo, .botonAnadir, .botonQuitar), .paginaOperaciones.
-- Métodos: :renombrar(ruta), :cancelarRenombrar(), :ponerDestino(ruta), :moverMarcados(), :anadirMarcados(), :quitarMarcados().
-- Subgrupo/Grupo Base › Operaciones: una tarjeta por tipo (.tarjetas[tipo], en el orden de TSM: subasta, artesanía, correo, compras,
-- sniper, vendedor, almacén) dentro de una zona con desplazamiento (.zonaOperaciones). Cada tarjeta: .titulo («Operaciones de X»),
-- .descripcion, .triangulo, .cabecera, .filas (.numero, .asa, .nombre.texto, .botonAbrir, .botonQuitar), .enlace («Agregar más operaciones», abre el
-- desplegable invisible .desplegable con las que faltan), y en subgrupos .casilla («Usar las suyas») y .heredadas («Heredadas de X»).
--   - Las listas salen de SNF.Operaciones.deGrupo; cualquier cambio llama a ponerDeGrupo (activa el override del grupo).
--   - Arrastrar el asa de una fila sobre otra cambia el orden. «Agregar más operaciones» nunca se apaga: sin nada que añadir avisa en el chat.
--   - Pulsar el título (o su ▼/▶) pliega la tarjeta: solo queda el título. Es por tipo y dura la sesión.
--   - Un subgrupo sin override enseña las del padre («Heredadas de ...»): se pueden abrir con ⧉ pero no se editan. Marcar «Usar las
--     suyas» copia la lista heredada como punto de partida; desmarcarla llama a quitarOverride (vuelve a heredar). Grupo Base no hereda.
--   - Task 32, como gr-02: la barra del nombre (.nombre) llega a 4 px del borde derecho de la tarjeta y lleva dentro ⧉
--     (.botonAbrir, icono «ventana») y ✖ (.botonQuitar), hijos suyos; el nombre acaba 8 px antes del ⧉ y no se parte.
--   - ⧉ llama a Grupos.abrirOperacion(tipo, nombre): guarda Grupos.operacionPedida = {tipo, nombre} y cambia a la pestaña
--     «operaciones», que la recoge; si no la recogió (ya se veía), llama a SNF.PrincipalOperaciones.abrir(tipo, nombre).
--
-- SNF.PrincipalGrupos: .pagina (el marco de la página; nil hasta la primera vez que se abre), .panel, .campo (el buscador),
-- .botonExportar, .botonImportar, .menuImportar (.filaTexto, .filaTSM), .arbol, .campoNuevo (el campo de la fila nueva),
-- .confirmacion (.texto, .botonBorrar, .botonCancelar), .texto (la ventanita del texto), .CLAVE_NUEVO (la clave de la fila que lleva el campo),
-- :crearSubgrupo(rutaPadre), :pedirBorrado(ruta), :cancelarNuevo(), :cerrarTodo().
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local L = SNF.L

local Grupos = {}
SNF.PrincipalGrupos = Grupos

local pintar = Piezas.interno.pintar
local plana = Piezas.interno.plana
local proteger = Piezas.proteger

local ANCHO_PANEL = 273
local MARGEN = 8
local ALTO_CAMPO = 22
local LADO_ICONO = 16
local HUECO_ICONOS = 4
local ANCHO_CAMPO = ANCHO_PANEL - 2 * MARGEN - 3 * LADO_ICONO - 2 * HUECO_ICONOS - 6
local ARRIBA_ARBOL = MARGEN + ALTO_CAMPO + MARGEN -- 38
local ALTO_FILA = 22
local ANCHO_MENU = 150
local NOMBRE_CONFIRMAR = "SnetForeverGruposConfirmar"

local SEP = "`" -- el de SNF.Arbol (Arbol.SEP); aquí solo se necesita para mirar rutas
local CLAVE_NUEVO = "\1nuevo" -- la clave de la fila que lleva el campo del nombre (no puede ser una ruta)
Grupos.CLAVE_NUEVO = CLAVE_NUEVO

local creando -- la ruta del padre mientras hay una fila nueva; nil si no
local eligidaAntes -- lo que estaba elegido antes de empezar a crear

local function arbolDatos()
  return rawget(SNF, "Arbol")
end

local function decir(clave)
  print(L.t(clave))
end

local function recortar(texto)
  -- En tiempo lineal (el patrón «%s+$» sin ancla al principio es cuadrático con muchos espacios).
  local s = tostring(texto or "")
  local desde = string.find(s, "%S")
  if not desde then
    return ""
  end
  local hasta = #s
  while hasta > desde and string.find(string.sub(s, hasta, hasta), "%s") do
    hasta = hasta - 1
  end
  return string.sub(s, desde, hasta)
end

-- El último nivel de una ruta («A`B» -> «B»).
local function nombreDe(ruta)
  return string.match(ruta, "([^" .. SEP .. "]*)$") or ruta
end

-- ¿ruta es `base` o está dentro de él? (con búsquedas literales: los nombres pueden llevar signos raros)
local function dentroDe(ruta, base)
  return ruta == base or string.sub(ruta, 1, #base + #SEP) == base .. SEP
end

-- Los ganchos de exportar e importar (Grupos.exportar, Grupos.importarTexto de la Task 19 y Grupos.importarTSM de la
-- Task 25) están más abajo, con su ventanita.

---------------------------------------------------------------------------------------------------
-- Nodos del árbol
---------------------------------------------------------------------------------------------------

-- La raíz con todos los grupos. Una sola lectura de los datos (grupos y orden de árbol), no una por grupo.
local function nodos()
  local datos = arbolDatos()
  local raiz = {clave = "", texto = L.t("PRINCIPAL_GRUPOS_BASE"), nivel = 0, hijos = {}}
  local porClave = {[""] = raiz}
  if datos then
    -- Solo ordenadas() (cada grupo seguido de sus hijos): el padre, el nombre y el nivel salen de la propia ruta.
    for _, ruta in ipairs(datos.ordenadas()) do
      local padre = porClave[string.match(ruta, "^(.*)" .. SEP .. "[^" .. SEP .. "]*$") or ""]
      if padre then
        local n = {clave = ruta, texto = nombreDe(ruta), nivel = (padre.nivel or 0) + 1, hijos = {}}
        padre.hijos[#padre.hijos + 1] = n
        porClave[ruta] = n
      end
    end
  end
  if creando and porClave[creando] then
    local p = porClave[creando]
    table.insert(p.hijos, 1, {clave = CLAVE_NUEVO, texto = "", nivel = (p.nivel or 0) + 1})
  end
  return raiz
end

---------------------------------------------------------------------------------------------------
-- La fila nueva con su campo
---------------------------------------------------------------------------------------------------

local function filaDe(clave)
  local a = Grupos.arbol
  if not a then
    return nil
  end
  for _, f in ipairs(a.filas) do
    if f:IsShown() and f.clave == clave then
      return f
    end
  end
  return nil
end

-- Termina la creación (con o sin grupo nuevo) y deja el árbol como estaba.
function Grupos.cancelarNuevo()
  if not creando then
    return
  end
  creando = nil
  local a, c = Grupos.arbol, Grupos.campoNuevo
  if c then
    c:ClearFocus() -- sin foco ni teclado capturado (creando ya es nil: el aviso de foco perdido no vuelve aquí)
    c:Hide()
  end
  if a then
    a:refrescar()
    local antes = eligidaAntes
    if antes ~= nil then
      a:elegir(antes)
    end
  end
  eligidaAntes = nil
end

-- Pone el campo sobre la fila nueva; si la fila ya no se ve (se desplazó la lista), se cancela.
local function colocarCampo()
  if not creando then
    return
  end
  local f = filaDe(CLAVE_NUEVO)
  if not f then
    Grupos.cancelarNuevo()
    return
  end
  local c = Grupos.campoNuevo
  c:ClearAllPoints()
  c:SetPoint("LEFT", f, "LEFT", (f.textoX or MARGEN) - 4, 0)
  c:SetPoint("RIGHT", f, "RIGHT", -MARGEN, 0)
  c:SetHeight(ALTO_FILA - 2)
  c:Show()
end

function Grupos.crearSubgrupo(rutaPadre)
  local a = Grupos.arbol
  if not a or not arbolDatos() then
    return
  end
  -- En combate no se abre el campo (pediría el teclado): se avisa.
  if InCombatLockdown and InCombatLockdown() then
    decir("PRINCIPAL_GRUPOS_COMBATE")
    return
  end
  Grupos.cancelarNuevo()
  -- Con filtro puesto la fila nueva no saldría: se quita.
  if Grupos.campo and Grupos.campo:GetText() ~= "" then
    Grupos.campo:SetText("")
    a:filtrar("")
  end
  eligidaAntes = a:elegida()
  creando = rutaPadre
  a:refrescar()
  a:abrir(rutaPadre, true)
  a:elegir(CLAVE_NUEVO)
  colocarCampo()
  if creando then
    Grupos.campoNuevo:SetText("")
    Grupos.campoNuevo:SetFocus()
  end
end

-- Se llama con el texto que escribió el jugador (ya validado). Crea el grupo y lo elige.
local function crearConNombre(texto)
  local padre, datos = creando, arbolDatos()
  if not padre or not datos then
    return
  end
  local nombre = recortar(texto)
  if nombre == "" then
    return
  end
  local ruta = datos.crear(padre, nombre)
  local a = Grupos.arbol
  local antes = eligidaAntes
  eligidaAntes = nil
  creando = nil
  Grupos.campoNuevo:Hide()
  a:refrescar()
  if ruta then
    a:abrir(padre, true)
    a:elegir(ruta)
  elseif antes ~= nil then
    a:elegir(antes) -- no se pudo crear: se vuelve a lo que estaba elegido
  end
end

-- T1a: un nombre que empieza por «/» es un comando del chat pegado en el campo (un jugador acabó con un grupo «/run …»): ni
-- se crea ni se renombra. La regla es una sola, la de SNF.Arbol.pareceComando (que también lo rechaza por debajo).
local function pareceComando(nombre)
  local datos = arbolDatos()
  return datos ~= nil and datos.pareceComando ~= nil and datos.pareceComando(nombre)
end

-- ¿Vale este nombre para un subgrupo nuevo de `creando`? (como Arbol.crear: sin «`», sin «/» delante y sin repetir entre
-- hermanos)
local function validarNombre(texto)
  local nombre = recortar(texto)
  if nombre == "" then
    return true
  end
  if pareceComando(nombre) then
    return false, L.t("PRINCIPAL_GRUPOS_NOMBRE_COMANDO")
  end
  local datos = arbolDatos()
  if string.find(nombre, SEP, 1, true) then
    return false, L.t("PRINCIPAL_GRUPOS_NOMBRE_MALO")
  end
  if datos and creando then
    for _, h in ipairs(datos.hijos(creando)) do
      if nombreDe(h) == nombre then
        return false, L.t("PRINCIPAL_GRUPOS_NOMBRE_MALO")
      end
    end
  end
  return true
end

---------------------------------------------------------------------------------------------------
-- Confirmación de borrado
---------------------------------------------------------------------------------------------------

local rutaPorBorrar

local function quitarDeEspeciales()
  for k = #UISpecialFrames, 1, -1 do
    if UISpecialFrames[k] == NOMBRE_CONFIRMAR then
      table.remove(UISpecialFrames, k)
    end
  end
end

local function cerrarConfirmacion()
  rutaPorBorrar = nil
  if Grupos.confirmacion then
    Grupos.confirmacion:Hide()
  end
  quitarDeEspeciales()
end

local function confirmarBorrado()
  local ruta, datos = rutaPorBorrar, arbolDatos()
  cerrarConfirmacion()
  if not ruta or not datos then
    return
  end
  datos.borrar(ruta)
  local a = Grupos.arbol
  a:refrescar()
  a:elegir("")
end

local function crearConfirmacion()
  local c = CreateFrame("Frame", NOMBRE_CONFIRMAR, UIParent)
  SNF.WindowSizing.register(c, NOMBRE_CONFIRMAR, true)
  c:SetSize(340, 112)
  c:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  c:SetFrameStrata("FULLSCREEN_DIALOG")
  c:EnableMouse(true)
  Tema.panel(c, "fondo", {borde = true})
  local t = Tema.letra(c:CreateFontString(nil, "OVERLAY"), "texto")
  t:SetPoint("TOPLEFT", c, "TOPLEFT", 12, -14)
  t:SetPoint("TOPRIGHT", c, "TOPRIGHT", -12, -14)
  t:SetJustifyH("LEFT")
  t:SetJustifyV("TOP")
  t:SetHeight(56)
  c.texto = t
  c.botonBorrar = Piezas.boton(c, L.t("PRINCIPAL_GRUPOS_BORRAR"), confirmarBorrado, {ancho = 96})
  c.botonBorrar:SetPoint("BOTTOMRIGHT", c, "BOTTOMRIGHT", -12, 12)
  c.botonCancelar = Piezas.boton(c, L.t("PRINCIPAL_GRUPOS_CANCELAR"), cerrarConfirmacion, {ancho = 96, borde = true})
  c.botonCancelar:SetPoint("RIGHT", c.botonBorrar, "LEFT", -8, 0)
  c:Hide()
  return c
end

function Grupos.pedirBorrado(ruta)
  if not Grupos.confirmacion or type(ruta) ~= "string" or ruta == "" then
    return
  end
  Grupos.cancelarNuevo()
  rutaPorBorrar = ruta
  local c = Grupos.confirmacion
  c.texto:SetText(L.t("PRINCIPAL_GRUPOS_BORRAR_PREGUNTA", nombreDe(ruta)))
  c:Show()
  -- Escape la cierra (entra en UISpecialFrames solo mientras está abierta).
  quitarDeEspeciales()
  table.insert(UISpecialFrames, NOMBRE_CONFIRMAR)
end

---------------------------------------------------------------------------------------------------
-- Menú de importar
---------------------------------------------------------------------------------------------------

local function cerrarMenu()
  if Grupos.menuImportar then
    Grupos.menuImportar:Hide()
  end
end

local function crearMenu(panel)
  local m = CreateFrame("Frame", nil, panel)
  m:SetSize(ANCHO_MENU, 22 * 2 + 8)
  m:SetFrameLevel(panel:GetFrameLevel() + 100)
  m:EnableMouse(true)
  Tema.panel(m, "fondo", {borde = true})
  -- Un velo transparente detrás del menú: pulsar fuera lo cierra.
  local velo = CreateFrame("Frame", nil, m)
  velo:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 0, 0)
  velo:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", 0, 0)
  velo:SetFrameLevel(m:GetFrameLevel() - 1)
  velo:EnableMouse(true)
  velo:SetScript("OnMouseDown", proteger(cerrarMenu))
  m.velo = velo
  m.filaTexto = Piezas.boton(m, L.t("PRINCIPAL_GRUPOS_IMPORTAR_TEXTO"), function()
    cerrarMenu()
    Grupos.importarTexto()
  end, {ancho = ANCHO_MENU - 8})
  m.filaTexto:SetPoint("TOPLEFT", m, "TOPLEFT", 4, -4)
  m.filaTSM = Piezas.boton(m, L.t("PRINCIPAL_GRUPOS_IMPORTAR_TSM"), function()
    cerrarMenu()
    Grupos.importarTSM()
  end, {ancho = ANCHO_MENU - 8})
  m.filaTSM:SetPoint("TOPLEFT", m.filaTexto, "BOTTOMLEFT", 0, 0)
  m:Hide()
  return m
end

---------------------------------------------------------------------------------------------------
-- La página
---------------------------------------------------------------------------------------------------

local function botonesDe(clave)
  if clave == CLAVE_NUEVO then
    return {}
  end
  local lista = {{icono = "masCirculo", color = "texto", ayuda = Piezas.ayudaDe("PRINCIPAL_AYUDA_SUBGRUPO"), alPulsar = function(c) Grupos.crearSubgrupo(c) end}}
  if clave ~= "" then
    lista[2] = {icono = "papelera", ayuda = Piezas.ayudaDe("PRINCIPAL_AYUDA_BORRAR_GRUPO"), alPulsar = function(c) Grupos.pedirBorrado(c) end}
  end
  return lista
end

local function alSoltar(origen, destino)
  local datos = arbolDatos()
  if not datos or origen == "" or origen == CLAVE_NUEVO or destino == CLAVE_NUEVO then
    return
  end
  Grupos.cancelarNuevo()
  if dentroDe(destino, origen) then
    decir("PRINCIPAL_GRUPOS_NO_MOVER") -- sobre sí mismo o sobre un descendiente
    return
  end
  local nueva = datos.mover(origen, destino)
  if not nueva then
    decir("PRINCIPAL_GRUPOS_NO_MOVER") -- p. ej. ya hay un hermano con ese nombre en el destino
    return
  end
  local a = Grupos.arbol
  a:refrescar()
  a:abrir(destino, true)
  a:elegir(nueva)
end

---------------------------------------------------------------------------------------------------
-- Ventanita del texto (exportar e importar grupos, Task 19)
---------------------------------------------------------------------------------------------------

-- Un marco pequeño como el de la confirmación de borrado. Exportar: el texto sale elegido, listo para Ctrl+C. Importar: se
-- pega el texto, se enseña «N grupos, N objetos, N operaciones» y se pregunta si se mueven los objetos que ya están en otro
-- grupo (por defecto No). Un cuadro de varias líneas se queda con el teclado: no se le da el foco en combate y lo suelta
-- cuando empieza uno. Escape cierra solo esta ventana. Los grupos importados cuelgan del Grupo Base.
local NOMBRE_TEXTO = "SnetForeverGruposTexto"
local TEXTO_ANCHO, TEXTO_ALTO = 440, 330
local TEXTO_CAJA_ALTO = 150
local PASO_LINEA = 14
local textoModo -- "exportar", "importar" o "tsm" (Task 25); nil con la ventana cerrada
local textoExportado -- lo que se enseña al exportar (y en modo «tsm», la caja que solo se lee)
local textoDatos -- lo leído al importar (nil si el texto no vale)
local textoMover = false
-- Importar de TSM (Task 25), con la misma ventanita: resumen = lo que dio ImportarTSM.analizar(); juntar = la respuesta a
-- «¿juntar o reemplazar?»; ALTO = la ventanita es un poco más alta para la segunda pregunta; esperando = la lectura de TSM
-- en pasos que aún no ha acabado (Ronda 1). Sus funciones, más abajo.
local TSM = {resumen = nil, juntar = true, ALTO = TEXTO_ALTO + 26}

-- Ronda 1: la lectura de TSM en pasos que espera la ventanita (TSM.esperando); al cerrarla o cambiar de modo, se para.
function TSM.olvidarLectura()
  if TSM.esperando then
    TSM.esperando = nil
    local I = rawget(SNF, "ImportarTSM")
    if I then
      I.cancelarLectura()
    end
  end
end

local function textoModulo()
  return rawget(SNF, "TextoGrupos")
end

local function quitarTextoDeEspeciales()
  for k = #UISpecialFrames, 1, -1 do
    if UISpecialFrames[k] == NOMBRE_TEXTO then
      table.remove(UISpecialFrames, k)
    end
  end
end

local function cerrarTexto()
  textoModo, textoExportado, textoDatos, textoMover = nil, nil, nil, false
  TSM.resumen, TSM.juntar, TSM.revisado = nil, true, nil
  TSM.olvidarLectura()
  local t = Grupos.texto
  if t then
    t.caja:ClearFocus()
    t:Hide()
  end
  quitarTextoDeEspeciales()
end

-- El alto del contenido sigue al largo del texto (una estimación por líneas: la caja se parte sola al ancho).
local function ajustarAltoCaja(t)
  local lineas = math.max(1, math.ceil(#t.caja:GetText() / 62))
  t.zona:ponerAlto(math.max(TEXTO_CAJA_ALTO, lineas * PASO_LINEA + 8))
end

local function pintarTextoImportar(t)
  local texto = t.caja:GetText()
  local datos, mensaje
  local T = textoModulo()
  if T and string.find(texto, "%S") then
    datos, mensaje = T.leer(texto)
  end
  textoDatos = datos
  if datos then
    local r = T.resumen(datos)
    t.resumen:SetText(L.t("PRINCIPAL_GRUPOS_TEXTO_RESUMEN", r.grupos, r.objetos, r.operaciones))
    t.aviso:SetText(r.noReconocidos and r.noReconocidos > 0 and L.t("TEXTOGRUPOS_UNRECOGNIZED", r.noReconocidos) or "")
  else
    t.resumen:SetText("")
    t.aviso:SetText(mensaje or "")
  end
  t.botonImportar:ponerApagado(datos == nil)
end

local function importarElTexto()
  local T, datos = textoModulo(), textoDatos
  if textoModo ~= "importar" or not T or not datos then
    return
  end
  local resultado, mensaje = T.importar(datos, {destino = "", moverObjetos = textoMover})
  if not resultado then
    Grupos.texto.aviso:SetText(mensaje or "")
    return
  end
  cerrarTexto()
  local a = Grupos.arbol
  if a then
    a:refrescar()
    local primera = resultado.rutas[1]
    if primera then
      a:abrir(primera, true)
      a:elegir(primera) -- también repinta el lado derecho
    end
  end
  print(L.t("PRINCIPAL_GRUPOS_TEXTO_HECHO", resultado.grupos, resultado.objetos, resultado.operaciones))
end

local function crearTexto()
  local t = CreateFrame("Frame", NOMBRE_TEXTO, UIParent)
  SNF.WindowSizing.register(t, NOMBRE_TEXTO, true)
  t:SetSize(TEXTO_ANCHO, TEXTO_ALTO)
  t:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  t:SetFrameStrata("FULLSCREEN_DIALOG")
  t:EnableMouse(true)
  Tema.panel(t, "fondo", {borde = true})

  t.titulo = Tema.letra(t:CreateFontString(nil, "OVERLAY"), "titulo")
  t.titulo:SetPoint("TOPLEFT", t, "TOPLEFT", 12, -12)
  t.titulo:SetPoint("TOPRIGHT", t, "TOPRIGHT", -12, -12)
  t.titulo:SetJustifyH("LEFT")
  t.ayuda = Tema.letra(t:CreateFontString(nil, "OVERLAY"), "texto")
  t.ayuda:SetPoint("TOPLEFT", t.titulo, "BOTTOMLEFT", 0, -6)
  t.ayuda:SetPoint("TOPRIGHT", t.titulo, "BOTTOMRIGHT", 0, -6)
  t.ayuda:SetJustifyH("LEFT")

  -- El cuadro del texto, con desplazamiento, sobre un fondo hundido.
  local marco = CreateFrame("Frame", nil, t)
  marco:SetPoint("TOPLEFT", t, "TOPLEFT", 12, -56)
  marco:SetPoint("TOPRIGHT", t, "TOPRIGHT", -12, -56)
  marco:SetHeight(TEXTO_CAJA_ALTO)
  Tema.panel(marco, "hundido", {borde = true})
  local zona, contenido = Piezas.desplazable(marco)
  zona:SetPoint("TOPLEFT", marco, "TOPLEFT", 6, -6)
  zona:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", -6, 6)
  t.marcoCaja, t.zona = marco, zona
  local caja = CreateFrame("EditBox", nil, contenido)
  caja:SetMultiLine(true)
  caja:SetAutoFocus(false)
  caja:SetMaxLetters(textoModulo() and textoModulo().LIMITES.texto or 400000)
  caja:SetPoint("TOPLEFT", contenido, "TOPLEFT", 0, 0)
  caja:SetWidth(TEXTO_ANCHO - 12 - 12 - 12 - 8)
  caja:SetHeight(TEXTO_CAJA_ALTO)
  Tema.letra(caja, "texto")
  t.caja = caja

  caja:SetScript("OnEditFocusGained", proteger(function(self)
    if InCombatLockdown and InCombatLockdown() then
      self:ClearFocus() -- en combate no se queda con el teclado
    end
  end))
  caja:SetScript("OnEscapePressed", proteger(function()
    cerrarTexto()
  end))
  caja:SetScript("OnTextChanged", proteger(function(self)
    if textoModo == "exportar" or textoModo == "tsm" then
      -- El texto exportado (o el resumen de TSM) no se edita: si se toca, vuelve a lo que era (al exportar, queda elegido,
      -- listo para copiar).
      if self:GetText() ~= textoExportado then
        self:SetText(textoExportado or "")
        if textoModo == "exportar" then
          self:HighlightText()
        end
      end
    elseif textoModo == "importar" then
      pintarTextoImportar(t)
      ajustarAltoCaja(t)
    end
  end))

  t.resumen = Tema.letra(t:CreateFontString(nil, "OVERLAY"), "etiqueta")
  t.resumen:SetPoint("TOPLEFT", marco, "BOTTOMLEFT", 0, -10)
  t.resumen:SetPoint("TOPRIGHT", marco, "BOTTOMRIGHT", 0, -10)
  t.resumen:SetJustifyH("LEFT")
  t.aviso = Tema.letra(t:CreateFontString(nil, "OVERLAY"), "texto")
  t.aviso:SetPoint("TOPLEFT", t.resumen, "BOTTOMLEFT", 0, -4)
  t.aviso:SetPoint("TOPRIGHT", t.resumen, "BOTTOMRIGHT", 0, -4)
  t.aviso:SetJustifyH("LEFT")
  Piezas.interno.colorTexto(t.aviso, "error")

  t.pregunta = Tema.letra(t:CreateFontString(nil, "OVERLAY"), "texto")
  t.pregunta:SetPoint("BOTTOMLEFT", t, "BOTTOMLEFT", 12, 52)
  t.pregunta:SetJustifyH("LEFT")
  t.pregunta:SetText(L.t("PRINCIPAL_GRUPOS_TEXTO_MOVER"))
  t.radio = Piezas.radio(t, function() return textoMover end, function(valor) textoMover = valor == true end)
  t.radio:SetPoint("LEFT", t.pregunta, "RIGHT", 12, 0)
  -- Task 25, solo al importar de TSM con grupos ya en SnetForever: «¿juntar o reemplazar?» (Sí = Juntar, No = Reemplazar).
  t.preguntaModo = Tema.letra(t:CreateFontString(nil, "OVERLAY"), "texto")
  t.preguntaModo:SetPoint("BOTTOMLEFT", t, "BOTTOMLEFT", 12, 76)
  t.preguntaModo:SetJustifyH("LEFT")
  t.radioModo = Piezas.radio(t, function() return TSM.juntar end, function(valor)
    TSM.juntar = valor == true
    TSM.cambiarModo()
  end,
    {si = L.t("PRINCIPAL_GRUPOS_TSM_JUNTAR"), no = L.t("PRINCIPAL_GRUPOS_TSM_REEMPLAZAR")})
  t.radioModo:SetPoint("LEFT", t.preguntaModo, "RIGHT", 12, 0)
  t.preguntaModo:Hide()
  t.radioModo:Hide()

  t.botonCerrar = Piezas.boton(t, L.t("PRINCIPAL_GRUPOS_TEXTO_CERRAR"), cerrarTexto, {ancho = 96, borde = true})
  t.botonCerrar:SetPoint("BOTTOMRIGHT", t, "BOTTOMRIGHT", -12, 12)
  t.botonImportar = Piezas.boton(t, L.t("PRINCIPAL_GRUPOS_TEXTO_IMPORTAR_BOTON"), function()
    if textoModo == "tsm" then
      TSM.empezar()
    else
      importarElTexto()
    end
  end, {ancho = 96})
  t.botonImportar:SetPoint("RIGHT", t.botonCerrar, "LEFT", -8, 0)

  -- Los textos que dependen del idioma y del modo (al cambiar de idioma con la ventana abierta).
  function t:repintar()
    self.botonCerrar:ponerTexto(textoModo == "importar" and L.t("PRINCIPAL_GRUPOS_CANCELAR") or L.t("PRINCIPAL_GRUPOS_TEXTO_CERRAR"))
    self.botonImportar:ponerTexto(L.t("PRINCIPAL_GRUPOS_TEXTO_IMPORTAR_BOTON"))
    self.pregunta:SetText(L.t("PRINCIPAL_GRUPOS_TEXTO_MOVER"))
    if textoModo == "tsm" then
      TSM.repintar()
    elseif textoModo == "importar" then
      self.titulo:SetText(L.t("PRINCIPAL_GRUPOS_TEXTO_IMPORTAR"))
      self.ayuda:SetText(L.t("PRINCIPAL_GRUPOS_TEXTO_AYUDA_IMPORTAR"))
      pintarTextoImportar(self)
    end
  end

  t:Hide()
  -- Ronda 2 de la Task 25: el Escape general (CloseSpecialWindows) solo la esconde. Al esconderse por donde sea, se limpia su
  -- estado como al cerrarla (y se para la lectura de TSM), para que nada la vuelva a enseñar sola. cerrarTexto pone textoModo
  -- a nil antes de esconderla, así que esa segunda llamada no hace nada (no hay bucle).
  t:HookScript("OnHide", proteger(function()
    if textoModo ~= nil then
      cerrarTexto()
    end
  end))
  return t
end

-- Enseña la ventana en un modo. El foco solo se pide fuera de combate.
local function abrirTexto(modo, titulo, ayuda, texto)
  local t = Grupos.texto
  if not t then
    return
  end
  Grupos.cancelarNuevo()
  cerrarMenu()
  local exportar = modo == "exportar"
  textoModo, textoExportado, textoDatos, textoMover = nil, nil, nil, false
  TSM.resumen, TSM.juntar, TSM.revisado = nil, true, nil
  TSM.olvidarLectura()
  -- Lo que pudo dejar el modo de TSM (Task 25): su alto, su segunda pregunta, los radios apagados y el aviso sin rojo.
  t:SetHeight(TEXTO_ALTO)
  t.preguntaModo:Hide()
  t.radioModo:Hide()
  t.radio:ponerApagado(false)
  t.pregunta:SetText(L.t("PRINCIPAL_GRUPOS_TEXTO_MOVER"))
  Piezas.interno.colorTexto(t.aviso, "error")
  t.titulo:SetText(titulo)
  t.ayuda:SetText(ayuda)
  t.pregunta:SetShown(not exportar)
  t.radio:SetShown(not exportar)
  t.botonImportar:SetShown(not exportar)
  t.botonCerrar:ponerTexto(exportar and L.t("PRINCIPAL_GRUPOS_TEXTO_CERRAR") or L.t("PRINCIPAL_GRUPOS_CANCELAR"))
  t.radio:refrescar()
  t.aviso:SetText("")
  t.resumen:SetText("")
  t.caja:SetText("")
  textoModo, textoExportado = modo, exportar and texto or nil
  t:Show()
  quitarTextoDeEspeciales()
  table.insert(UISpecialFrames, NOMBRE_TEXTO)
  if exportar then
    t.caja:SetText(texto)
    local T = textoModulo()
    local datos = T and T.leer(texto)
    if datos then
      local r = T.resumen(datos)
      t.resumen:SetText(L.t("PRINCIPAL_GRUPOS_TEXTO_RESUMEN", r.grupos, r.objetos, r.operaciones))
    end
  else
    t.botonImportar:ponerApagado(true)
  end
  ajustarAltoCaja(t)
  if InCombatLockdown and InCombatLockdown() then
    print(L.t("PRINCIPAL_GRUPOS_TEXTO_COMBATE"))
  else
    t.caja:SetFocus()
    if exportar then
      t.caja:HighlightText()
    end
  end
end

-- Exportar un grupo (sin ruta: todos, desde el Grupo Base).
function Grupos.exportar(ruta)
  local T = textoModulo()
  if not T then
    return
  end
  if type(ruta) ~= "string" then
    ruta = ""
  end
  local texto, mensaje = T.exportar(ruta)
  if not texto then
    print(mensaje)
    return
  end
  local nombre = ruta == "" and L.t("PRINCIPAL_GRUPOS_BASE") or nombreDe(ruta)
  abrirTexto("exportar", L.t("PRINCIPAL_GRUPOS_TEXTO_EXPORTAR", nombre), L.t("PRINCIPAL_GRUPOS_TEXTO_AYUDA_EXPORTAR"), texto)
end

function Grupos.importarTexto()
  if not textoModulo() then
    return
  end
  abrirTexto("importar", L.t("PRINCIPAL_GRUPOS_TEXTO_IMPORTAR"), L.t("PRINCIPAL_GRUPOS_TEXTO_AYUDA_IMPORTAR"), nil)
end

---------------------------------------------------------------------------------------------------
-- Importar de TSM (Task 25) en la misma ventanita
---------------------------------------------------------------------------------------------------

local function importador()
  return rawget(SNF, "ImportarTSM")
end

-- Un texto del jugador o de TSM para enseñar tal cual (en el juego «|» empieza un código de color o de enlace).
function TSM.seguro(texto)
  return (string.gsub(tostring(texto or ""), "|", "||"))
end

-- «Subasta 3, Artesanía 2, ...» en el orden de las tarjetas.
function TSM.tipos(operaciones)
  local partes = {}
  for _, tipo in ipairs(SNF.Operaciones.ORDEN) do
    partes[#partes + 1] = L.t("PRINCIPAL_GRUPOS_OPS_TIPO_" .. string.upper(tipo)) .. " " .. (operaciones[tipo] or 0)
  end
  return table.concat(partes, ", ")
end

-- Dónde está una fórmula: «Subasta › Raras caras › Precio normal» o «Fuente propia «minprecio»».
function TSM.donde(e)
  if e.fuente then
    return L.t("PRINCIPAL_GRUPOS_TSM_D_FUENTE", TSM.seguro(e.fuente))
  end
  return L.t("PRINCIPAL_GRUPOS_OPS_TIPO_" .. string.upper(e.tipo)) .. " › " .. TSM.seguro(e.operacion) .. " › "
    .. L.t("PRINCIPAL_EDITOR_C_" .. string.upper(e.tipo) .. "_" .. string.upper(e.campo))
end

function TSM.formulas(lineas, formulas)
  if #formulas.traducidas > 0 then
    lineas[#lineas + 1] = ""
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_D_TRADUCIDAS", #formulas.traducidas)
    for _, e in ipairs(formulas.traducidas) do
      lineas[#lineas + 1] = "• " .. TSM.donde(e) .. ": " .. TSM.seguro(e.antes) .. " → " .. TSM.seguro(e.despues)
    end
  end
  if #formulas.marcadas > 0 then
    lineas[#lineas + 1] = ""
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_D_MARCADAS", #formulas.marcadas)
    for _, e in ipairs(formulas.marcadas) do
      lineas[#lineas + 1] = "• " .. TSM.donde(e) .. ": " .. TSM.seguro(e.despues)
    end
  end
end

function TSM.quitados(lineas, q)
  if q and (q.personajes > 0 or q.casas > 0 or q.destinatarios > 0) then
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_D_QUITADOS", q.personajes, q.casas, q.destinatarios)
  end
end

-- Plan de paridad, entrega 1: el diagnóstico de precios (ImportarTSM.analizar/leer -> resumen.diagnostico), arriba del todo
-- y entero (sin recortar: lo que se revisa es todo lo que se importará). Solo texto quieto en la caja que se lee.
local function nombreCampo(tipo, campo)
  return L.t("PRINCIPAL_EDITOR_C_" .. string.upper(tipo) .. "_" .. string.upper(campo))
end

local function clase(c)
  return L.t("PRINCIPAL_GRUPOS_TSM_DIAG_C_" .. string.upper(c))
end

-- El diagnóstico es de un modo (d.modo): la segunda línea dice cuál, para que no haya duda de qué se está revisando.
function TSM.diagnostico(lineas, d)
  if not d then
    return
  end
  local c = d.cuentas
  lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_TITULO")
  lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_MODO_" .. string.upper(d.modo))
  if c.campos.aproximada + c.campos.faltante == 0 and #d.propias == 0 then
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_NADA")
  end
  lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_CAMPOS", c.campos.equivalente, c.campos.aproximada, c.campos.faltante)
  lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_OPS", c.operaciones.bien, c.operaciones.aproximada, c.operaciones.faltante)
  lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_ACTIVAS", c.activas.bien, c.activas.aproximada, c.activas.faltante)
  if c.conservan > 0 then
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_EFECTIVAS", c.efectivas.bien, c.efectivas.aproximada,
      c.efectivas.faltante)
  end
  if c.vinculosCortados > 0 then
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_CORTADOS", c.vinculosCortados)
  end
  if #d.fuentes > 0 then
    lineas[#lineas + 1] = ""
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_FUENTES")
    for _, f in ipairs(d.fuentes) do
      local pasa = f.traduce and L.t("PRINCIPAL_GRUPOS_TSM_DIAG_PASA", f.traduce) or ""
      local porque = f.motivo and L.t("PRINCIPAL_GRUPOS_TSM_DIAG_X_" .. string.upper(f.motivo)) or ""
      lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_FUENTE", TSM.seguro(f.visible), pasa, clase(f.clase), f.campos, porque)
    end
  end
  if #d.propias > 0 then
    lineas[#lineas + 1] = ""
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_PROPIAS")
    for _, p in ipairs(d.propias) do
      local motivo = string.upper(p.motivo or p.clase)
      local tuya = p.tuya and L.t("PRINCIPAL_GRUPOS_TSM_DIAG_TUYA") or ""
      lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_PROPIA", TSM.seguro(p.nombre), tuya,
        L.t("PRINCIPAL_GRUPOS_TSM_DIAG_P_" .. motivo))
    end
  end
  if #d.operaciones > 0 then
    lineas[#lineas + 1] = ""
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_OPERACIONES")
    for _, op in ipairs(d.operaciones) do
      lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_OP", L.t("PRINCIPAL_GRUPOS_OPS_TIPO_" .. string.upper(op.tipo)),
        TSM.seguro(op.nombre), op.grupos, op.objetos, op.conBase and L.t("PRINCIPAL_GRUPOS_TSM_DIAG_BASE") or "",
        L.t("PRINCIPAL_GRUPOS_TSM_DIAG_E_" .. string.upper(op.estado)))
      if op.conservan > 0 then
        local e = op.efectivo
        lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_CONSERVA", op.conservan, e.grupos, e.objetos,
          e.conBase and L.t("PRINCIPAL_GRUPOS_TSM_DIAG_BASE") or "")
      end
      for _, campo in ipairs(op.campos) do
        local partes = {}
        for _, f in ipairs(campo.fuentes) do
          if f.clase ~= "equivalente" then
            local texto = TSM.seguro(f.nombre) .. " (" .. clase(f.clase) .. ")"
            partes[#partes + 1] = f.via and L.t("PRINCIPAL_GRUPOS_TSM_DIAG_VIA", texto, TSM.seguro(f.via)) or texto
          end
        end
        if campo.error then
          partes[#partes + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_ERROR")
        end
        lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_CAMPO", nombreCampo(op.tipo, campo.campo),
          campo.vinculo and L.t("PRINCIPAL_GRUPOS_TSM_DIAG_VINCULO", TSM.seguro(campo.vinculo)) or "", table.concat(partes, ", "))
      end
    end
  end
  lineas[#lineas + 1] = ""
end

-- El modo que se usará al pulsar Importar (sin grupos en SnetForever no se pregunta: Juntar).
function TSM.modoElegido(r)
  return (r and r.hayGrupos and not TSM.juntar) and "reemplazar" or "juntar"
end

-- Lo que se enseña antes de importar: el diagnóstico del modo elegido. TSM.revisado apunta de qué modo es lo que se enseña;
-- Importar solo se puede pulsar si coincide con el elegido.
function TSM.detalle(r)
  local lineas = {}
  local modo = TSM.modoElegido(r)
  local d = r.diagnosticos and r.diagnosticos[modo]
  TSM.revisado = d and modo or nil
  TSM.diagnostico(lineas, d)
  lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_D_OPERACIONES", TSM.tipos(r.operaciones))
  lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_D_FUENTES", r.fuentes)
  if r.hayGrupos then
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_D_CHOCAN", r.chocan)
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_D_OTRO", r.enOtroGrupo)
  end
  TSM.quitados(lineas, r.quitados)
  TSM.formulas(lineas, r.formulas)
  return table.concat(lineas, "\n")
end

-- Lo que se enseña al terminar.
function TSM.final(inf)
  local lineas = {inf.comprobacion.mensaje or inf.mensaje or ""}
  -- El diagnóstico de la importación hecha: el de su modo (ImportarTSM lo calcula con el modo de la importación).
  local d = inf.esperado and inf.esperado.diagnostico
  if d and d.modo == inf.modo then
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_DIAG_FINAL_" .. string.upper(d.modo), d.cuentas.operaciones.aproximada,
      d.cuentas.operaciones.faltante)
  end
  if inf.quedan > 0 then
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_QUEDAN", inf.quedan)
  end
  TSM.quitados(lineas, inf.quitados)
  if #inf.fuentesTuyas > 0 then
    lineas[#lineas + 1] = L.t("PRINCIPAL_GRUPOS_TSM_D_TUYAS", TSM.seguro(table.concat(inf.fuentesTuyas, ", ")))
  end
  TSM.formulas(lineas, inf.formulas)
  return table.concat(lineas, "\n")
end

-- La caja solo se lee: su texto se pone así (OnTextChanged lo devuelve a este si se toca).
function TSM.caja(t, texto)
  textoExportado = texto
  t.caja:SetText(texto)
  ajustarAltoCaja(t)
end

local function enMarcha(inf)
  return inf ~= nil and (inf.estado == "importando" or inf.estado == "pausado")
end

-- El avance: un número que solo crece (ImportarTSM lo da así), en el color del texto; en combate, que está en pausa.
function TSM.avance(inf)
  local t = Grupos.texto
  if not t or textoModo ~= "tsm" or not inf then
    return
  end
  Piezas.interno.colorTexto(t.aviso, "texto")
  if inf.estado == "pausado" then
    t.aviso:SetText(L.t("PRINCIPAL_GRUPOS_TSM_PAUSA", inf.avance))
  else
    t.aviso:SetText(L.t("PRINCIPAL_GRUPOS_TSM_AVANCE", inf.avance))
  end
end

-- Al terminar (con la ventanita abierta o no): el chat lo dice y el árbol se repinta; la ventanita, si sigue abierta, enseña
-- el informe en el mismo sitio.
function TSM.terminado(inf)
  if inf.estado == "hecho" then
    print(L.t("PRINCIPAL_GRUPOS_TSM_HECHO", inf.grupos, inf.objetos, inf.operaciones))
    print(inf.comprobacion.mensaje)
  else
    print(inf.mensaje)
  end
  local a = Grupos.arbol
  if a and Grupos.pagina and Grupos.pagina:IsShown() then
    a:refrescar()
  end
  local t = Grupos.texto
  if not t or textoModo ~= "tsm" then
    return
  end
  TSM.pintarHecho(t, inf)
end

function TSM.pintarHecho(t, inf)
  TSM.resumen, TSM.revisado = nil, nil -- ya no se enseña el análisis: la ventanita queda con el informe
  t.preguntaModo:Hide()
  t.radioModo:Hide()
  t.pregunta:Hide()
  t.radio:Hide()
  t.botonImportar:Hide()
  t.botonCerrar:ponerTexto(L.t("PRINCIPAL_GRUPOS_TEXTO_CERRAR"))
  if inf.estado == "hecho" then
    t.resumen:SetText(L.t("PRINCIPAL_GRUPOS_TSM_HECHO", inf.grupos, inf.objetos, inf.operaciones))
    t.aviso:SetText("")
  else
    t.resumen:SetText("")
    Piezas.interno.colorTexto(t.aviso, "error")
    t.aviso:SetText(inf.mensaje or "")
  end
  if inf.estado == "hecho" and not inf.comprobacion.bien then
    Piezas.interno.colorTexto(t.aviso, "error")
    t.aviso:SetText(inf.comprobacion.mensaje or "")
  end
  TSM.caja(t, TSM.final(inf))
end

-- Pulsar «Importar» en modo TSM.
function TSM.empezar()
  local I, t = importador(), Grupos.texto
  if not I or not t or textoModo ~= "tsm" or enMarcha(I.estado()) then
    return
  end
  if InCombatLockdown and InCombatLockdown() then
    Piezas.interno.colorTexto(t.aviso, "error")
    t.aviso:SetText(L.t("IMPORTAR_TSM_COMBATE"))
    return
  end
  local r = TSM.resumen
  local modo = TSM.modoElegido(r)
  if not r or TSM.revisado ~= modo then
    return -- lo que se ve no es el diagnóstico de este modo (el botón está apagado)
  end
  local inf, motivo = I.importar({
    modo = modo, moverObjetos = textoMover, huella = r and r.huella, alAvanzar = TSM.avance, alTerminar = TSM.terminado,
  })
  if not inf then
    Piezas.interno.colorTexto(t.aviso, "error")
    t.aviso:SetText(motivo or "")
    return
  end
  t.botonImportar:ponerApagado(true)
  t.radio:ponerApagado(true)
  t.radioModo:ponerApagado(true)
  t.botonCerrar:ponerTexto(L.t("PRINCIPAL_GRUPOS_TEXTO_CERRAR"))
  TSM.avance(inf)
end

-- Los textos de la ventanita en modo TSM (al abrirla y al cambiar de idioma).
function TSM.repintar()
  local t, I = Grupos.texto, importador()
  local inf = I and I.estado()
  local r, lec = TSM.resumen, TSM.esperando
  local perfil = r and r.perfil or (lec and lec.perfil) or (inf and inf.esperado and inf.esperado.perfil) or ""
  t.titulo:SetText(L.t("PRINCIPAL_GRUPOS_TSM_TITULO"))
  t.ayuda:SetText(L.t("PRINCIPAL_GRUPOS_TSM_AYUDA", TSM.seguro(perfil)))
  t.preguntaModo:SetText(L.t("PRINCIPAL_GRUPOS_TSM_MODO"))
  t.radioModo:ponerTextos(L.t("PRINCIPAL_GRUPOS_TSM_JUNTAR"), L.t("PRINCIPAL_GRUPOS_TSM_REEMPLAZAR"))
  t.pregunta:SetText(L.t("PRINCIPAL_GRUPOS_TSM_MOVER"))
  t.botonImportar:ponerTexto(L.t("PRINCIPAL_GRUPOS_TEXTO_IMPORTAR_BOTON"))
  if r then
    t.resumen:SetText(L.t("PRINCIPAL_GRUPOS_TEXTO_RESUMEN", r.grupos, r.objetos, r.totalOperaciones))
    t.botonCerrar:ponerTexto(L.t("PRINCIPAL_GRUPOS_CANCELAR"))
    TSM.caja(t, TSM.detalle(r))
    if not enMarcha(inf) then
      t.botonImportar:ponerApagado(TSM.revisado ~= TSM.modoElegido(r))
    end
  elseif lec then
    t.botonCerrar:ponerTexto(L.t("PRINCIPAL_GRUPOS_CANCELAR"))
    TSM.leyendo(lec)
  elseif inf and not enMarcha(inf) then
    TSM.pintarHecho(t, inf)
  end
  if enMarcha(inf) then
    t.botonCerrar:ponerTexto(L.t("PRINCIPAL_GRUPOS_TEXTO_CERRAR"))
    TSM.avance(inf)
  end
end

-- Al cambiar «¿juntar o reemplazar?»: el diagnóstico pasa a ser el del modo nuevo en el mismo paso (texto quieto, sin
-- parpadeo); si no lo hay, Importar se apaga.
function TSM.cambiarModo()
  local t, I = Grupos.texto, importador()
  local r = TSM.resumen
  if not t or textoModo ~= "tsm" or not r or (I and enMarcha(I.estado())) then
    return
  end
  TSM.caja(t, TSM.detalle(r))
  t.botonImportar:ponerApagado(TSM.revisado ~= TSM.modoElegido(r))
end

-- Ronda 1: mientras se lee TSM en pasos (ImportarTSM.leer), «Leyendo TSM: N %», un número que solo crece.
function TSM.leyendo(lec)
  local t = Grupos.texto
  if not t or textoModo ~= "tsm" or TSM.esperando ~= lec or lec.estado ~= "leyendo" then
    return
  end
  Piezas.interno.colorTexto(t.aviso, "texto")
  t.aviso:SetText(L.t("PRINCIPAL_GRUPOS_TSM_LEYENDO", lec.avance))
end

-- Leído TSM: la misma ventanita (sin esconderla) pasa a enseñar el resumen y las preguntas.
function TSM.leido(lec)
  local t = Grupos.texto
  if not t or textoModo ~= "tsm" or TSM.esperando ~= lec then
    return
  end
  TSM.esperando = nil
  if not t:IsShown() then
    return -- ya no está a la vista: nunca se vuelve a enseñar sola
  end
  if lec.estado == "leido" and lec.resumen then
    TSM.abrir(lec.resumen)
  else
    Piezas.interno.colorTexto(t.aviso, "error")
    t.aviso:SetText(lec.mensaje or "")
  end
end

-- Abre la ventanita en modo TSM: con un análisis (r), leyendo TSM (r = nil y TSM.esperando) o, si ya se está importando,
-- con el avance de esa importación.
function TSM.abrir(r)
  local t, I = Grupos.texto, importador()
  if not t or not I then
    return
  end
  Grupos.cancelarNuevo()
  cerrarMenu()
  textoModo, textoExportado, textoDatos, textoMover = nil, nil, nil, false
  TSM.resumen, TSM.juntar, TSM.revisado = r, true, nil
  local inf = I.estado()
  local marcha = enMarcha(inf)
  t:SetHeight(TSM.ALTO)
  local preguntar = r ~= nil and r.hayGrupos and not marcha
  t.preguntaModo:SetShown(preguntar)
  t.radioModo:SetShown(preguntar)
  t.pregunta:SetShown(preguntar)
  t.radio:SetShown(preguntar)
  t.radio:ponerApagado(false)
  t.radioModo:ponerApagado(false)
  t.radio:refrescar()
  t.radioModo:refrescar()
  t.botonImportar:SetShown(not marcha)
  t.botonImportar:ponerApagado(r == nil) -- mientras se lee TSM, aún no se puede importar
  t.aviso:SetText("")
  t.resumen:SetText("")
  textoModo = "tsm"
  TSM.caja(t, "")
  TSM.repintar()
  t:Show()
  quitarTextoDeEspeciales()
  table.insert(UISpecialFrames, NOMBRE_TEXTO)
end

-- El gancho del menú de importar: sin TSM activo, una línea en el chat con el motivo; con TSM, la ventanita.
function Grupos.importarTSM()
  local I = importador()
  if not I then
    return
  end
  local inf = I.estado()
  if enMarcha(inf) then
    TSM.abrir(TSM.resumen or inf.esperado)
    return
  end
  local ok, porque = I.disponible()
  if not ok then
    print(porque)
    return
  end
  -- Ronda 1: se lee en pasos (sin tirón al abrir); la ventanita sale ya, con «Leyendo TSM: N %», y se rellena al acabar.
  local lec, motivo = I.leer({alAvanzar = TSM.leyendo, alTerminar = TSM.leido})
  if not lec then
    print(motivo)
    return
  end
  TSM.esperando = lec
  TSM.abrir(nil)
end

function Grupos.cerrarTodo()
  cerrarTexto()
  cerrarMenu()
  cerrarConfirmacion()
  Grupos.cancelarNuevo()
  Grupos.cancelarRenombrar()
end

---------------------------------------------------------------------------------------------------
-- Lado derecho: cabecera, Información (Grupo Base) y Objetos (subgrupo)
---------------------------------------------------------------------------------------------------

local sinTildes = Piezas.interno.sinTildes
local colorTexto = Piezas.interno.colorTexto

local DER_IZQUIERDA = 12 -- de la columna del árbol a lo de la derecha
local DER_BORDE = 12 -- del borde de la página
local DER_ARRIBA = 10
local ALTO_CABECERA = 24
local ALTO_PESTANAS = 28
local ALTO_BOTON = 24
local ALTO_FILA_ABAJO = 22 -- «Seleccionar grupo» y «Mover N objetos» (TSM: 22 px)
-- El botón «Mover» tiene un ancho fijo para que la barra no se mueva al cambiar la cifra. Task 31: ya no son los 114 px
-- medidos en gr-01 («Mover 0 objetos», en SemiBold 12, mide unos 108 y en 114 caben 98: se partía en dos líneas). Es el
-- ancho del texto más largo posible (con MAS_OBJETOS) más los 8 px de Piezas.boton a cada lado, medido al crear la página
-- y al cambiar de idioma (ajustarAnchoMover). ANCHO_MOVER_SIN_MEDIR solo vale hasta que la letra se puede medir.
local ANCHO_MOVER_SIN_MEDIR = 114
local MARGEN_MOVER = 16
local MAS_OBJETOS = 9999
local HUECO_FILA_ABAJO = 7 -- entre la lista y la fila de abajo (gr-01)
local RELLENO_CELDA = 6
local LADO_ICONO_OBJETO = 14
-- Las letras de TSM miden unos 0,83 de las nuestras con la misma altura de fila: 0,83 de la letra «tabla» del tema (B3r: 10
-- con la de 12; antes 9 con la de 11).
local LETRA_OBJETOS = math.floor(Tema.TAMANOS.tabla * 0.83 + 0.5)
local SANGRIA_OBJETO = 14 -- lo que se meten los objetos bajo su sección
local LADO_TRIANGULO = 10
local ANCHO_COPIAR = 24 -- botón de copiar de Grupo Base (fuera de la lista, junto al buscador)
local ICONO_PREGUNTA = "Interface\\Icons\\INV_Misc_QuestionMark"
local CLAVE_BOLSAS = "\1bolsas" -- fila de sección: los objetos sin grupo de las bolsas
local CLAVE_PADRE = "\1padre" -- fila de sección: los objetos del grupo padre
local FRENO_REPINTADO = 0.3 -- segundos entre dos repintados por eventos del juego
local PRESUPUESTO_BUSQUEDA = 40 -- objetos desconocidos que una búsqueda puede preguntar al juego de una vez
local MODOS = {"especifico", "nivel", "base"}
local TEXTO_MODO = {
  especifico = "PRINCIPAL_GRUPOS_MODO_ESPECIFICO", nivel = "PRINCIPAL_GRUPOS_MODO_NIVEL", base = "PRINCIPAL_GRUPOS_MODO_BASE",
}
-- Colores de calidad del juego (gris, blanco, verde, azul, morado, naranja, dorado).
local COLOR_CALIDAD = {[0] = "9d9d9d", "ffffff", "1eff00", "0070dd", "a335ee", "ff8000", "e6cc80", "e6cc80"}

local modoSinGrupo = "especifico" -- «Mostrar los objetos sin grupo como» (solo dura la sesión)
local rutaActual -- el grupo que enseña la derecha ("" = Grupo Base); nil hasta la primera vez
local destino -- el grupo elegido para «Mover» en Grupo Base
local renombrando -- la ruta del grupo que se está renombrando en la cabecera; nil si no
local abierta = false -- la página se está viendo (oyentes de eventos puestos)
local pendiente = false -- hay un repintado esperando su turno
local ajustando = false -- se está cambiando el texto de un buscador desde aquí (no vale como escritura del jugador)
-- clave de sección -> true (plegada) o false (desplegada): lo que el jugador eligió a mano (dura la sesión; es por sección, no
-- por grupo). Sin elección (nil) manda la regla automática de las bolsas (ver filasSinGrupo).
local plegadas = {}
-- Lo que decidió la regla automática para la sección de las bolsas en el grupo que se ve: true (plegada), false (desplegada) o
-- nil (aún sin decidir: la lista no tenía alto). Se decide una vez por apertura del grupo y no cambia hasta cambiar de grupo.
local autoBolsas
local marcas = {base = 0, singrupo = 0, en = 0} -- objetos marcados en cada lista (sin contar las cabeceras de sección)
local cache = {} -- id -> {nombre, calidad, icono, nivel} de lo que ya dio el juego
local pedidos = {} -- id -> true: ya se preguntó al juego y aún no contestó (o dijo que no existe)
local presupuesto -- nil = sin tope; un número = cuántas preguntas nuevas quedan en esta búsqueda

local function esSeccion(clave)
  return type(clave) == "string" and string.sub(clave, 1, 1) == "\1"
end

local function idDe(clave)
  local datos = arbolDatos()
  return datos and datos.idDe(clave) or nil
end

-- Nombre, calidad, icono y nivel de un objeto; nil si el juego aún no lo conoce. Al juego se le pregunta una sola vez por
-- objeto (hasta que conteste con GET_ITEM_INFO_RECEIVED) y solo por los que se ven o se buscan.
local function infoObjeto(id)
  if not id then
    return nil
  end
  local c = cache[id]
  if c then
    return c[1], c[2], c[3], c[4]
  end
  if pedidos[id] then
    return nil
  end
  if presupuesto then
    if presupuesto <= 0 then
      return nil
    end
    presupuesto = presupuesto - 1
  end
  local f = rawget(_G, "GetItemInfo")
  if not f then
    local ci = rawget(_G, "C_Item")
    f = ci and ci.GetItemInfo
  end
  if not f then
    return nil
  end
  local ok, nombre, _, calidad, nivel, _, _, _, _, _, icono = pcall(f, id)
  if ok and nombre then
    cache[id] = {nombre, calidad, icono, nivel}
    return nombre, calidad, icono, nivel
  end
  pedidos[id] = true
  return nil
end

-- El nombre y la calidad de un enlace de objeto (con su sufijo: «Hacha Natocolina de espíritu»), o nil. En un solo sitio
-- para los dos formatos de enlace: UIComercio.deEnlace (que lee la calidad con SNF.Diario.calidadDeEnlace).
local function deEnlace(enlace)
  local UI = rawget(SNF, "UIComercio")
  if enlace and UI and UI.deEnlace then
    return UI.deEnlace(enlace)
  end
  return nil
end

-- El texto de un objeto (con el color de su calidad) y su icono. Con el enlace del objeto que tiene el jugador (sus bolsas),
-- el nombre y la calidad salen de él (T1a: con su sufijo); el icono y el nivel, del id.
local function textoDeObjeto(clave, enlace)
  local id = idDe(clave)
  local nombre, calidad, icono, nivel = infoObjeto(id)
  local nombreEnlace, calidadEnlace = deEnlace(enlace)
  if nombreEnlace then
    nombre, calidad = nombreEnlace, calidadEnlace or calidad
  end
  if nombre then
    local texto = nombre
    if modoSinGrupo == "nivel" and nivel then
      texto = texto .. " (" .. L.t("PRINCIPAL_GRUPOS_NIVEL_OBJETO", nivel) .. ")"
    end
    return "|cff" .. (COLOR_CALIDAD[calidad or 1] or "ffffff") .. texto .. "|r", icono or ICONO_PREGUNTA
  end
  if id then
    return L.t("PRINCIPAL_GRUPOS_OBJETO_N", id), ICONO_PREGUNTA
  end
  return tostring(clave), ICONO_PREGUNTA
end

-- Pinta una celda de la tabla de objetos: icono y nombre (con sangría si va bajo una sección) o, si es una fila de sección,
-- el triángulo (▼ desplegada, ▶ plegada) y el título en amarillo. El triángulo es un icono del tema porque la letra de la
-- tabla no trae esos signos.
local function pintarObjeto(celda, fila)
  local icono = celda.icono
  if not icono then
    icono = celda:CreateTexture(nil, "OVERLAY")
    icono:SetSize(LADO_ICONO_OBJETO, LADO_ICONO_OBJETO)
    celda.icono = icono
  end
  local triangulo = celda.triangulo
  if not triangulo then
    triangulo = celda:CreateTexture(nil, "OVERLAY")
    triangulo:SetSize(LADO_TRIANGULO, LADO_TRIANGULO)
    celda.triangulo = triangulo
  end
  local t = celda.texto
  t:ClearAllPoints()
  if fila.seccion then
    icono:Hide()
    triangulo:ClearAllPoints()
    triangulo:SetPoint("LEFT", celda, "LEFT", RELLENO_CELDA, 0)
    Tema.icono(triangulo, fila.plegada and "cerrado" or "abierto")
    pintar(triangulo, "acento")
    triangulo:Show()
    t:SetPoint("LEFT", triangulo, "RIGHT", 4, 0)
    t:SetPoint("RIGHT", celda, "RIGHT", -RELLENO_CELDA, 0)
    t:SetText(fila.texto or "")
    colorTexto(t, "acento")
    return
  end
  triangulo:Hide()
  local texto, textura = textoDeObjeto(fila.clave, fila.enlace)
  icono:ClearAllPoints()
  icono:SetPoint("LEFT", celda, "LEFT", RELLENO_CELDA + (fila.sangria and SANGRIA_OBJETO or 0), 0)
  icono:SetTexture(textura)
  icono:Show()
  t:SetPoint("LEFT", icono, "RIGHT", 4, 0)
  t:SetPoint("RIGHT", celda, "RIGHT", -RELLENO_CELDA, 0)
  t:SetText(texto)
end

-- Los objetos de las bolsas (la mochila, las puestas y, F2b, la de componentes: SNF.API.bolsasPropias, donde van los paños,
-- las hierbas y el mineral), una vez cada uno, en el orden de las bolsas: claves «i:<id>»
-- (como siempre: el grupo y su regla van por el id). T1a:
--   - Los ligados no salen (como TSM, que solo enseña los huecos con isBound = false: un objeto ligado no se puede subastar).
--     Si hay uno ligado y otro sin ligar del mismo objeto, sale (con el que no está ligado).
--   - De cada uno se da también el enlace del primer hueco sin ligar (enlaces[clave]): trae el sufijo («Hacha Natocolina de
--     espíritu») y con él salen el nombre, el color y el tooltip. Solo vive en memoria, en las filas de la lista: no se
--     guarda en ningún sitio (lo que se guarda al mover un objeto a un grupo sigue siendo «i:<id>»).
local function objetosDeBolsas()
  local lista, vistos, enlaces = {}, {}, {}
  -- Se lee con SNF.API (nucleo/espacio.lua: C_Container o las globales viejas; un valor secreto del motor se salta).
  local API = SNF.API
  for _, bolsa in ipairs(SNF.InventarioCuenta.bolsas("bolsasPropias") or {}) do
    local n = API.huecosBolsa(bolsa)
    if n and n > 0 then
      for hueco = 1, math.floor(n) do
        local c = API.infoContenedor(bolsa, hueco)
        if c and c.l ~= 1 and not vistos[c.id] then
          vistos[c.id] = true
          local clave = "i:" .. c.id
          lista[#lista + 1] = clave
          enlaces[clave] = c.enlace
        end
      end
    end
  end
  return lista, enlaces
end

-- ¿Coincide el objeto con el texto buscado (sin mayúsculas ni tildes)? Busca en el nombre que ya dio el juego (o el de su
-- enlace, con el sufijo) y en la clave.
local function coincide(clave, buscado, enlace)
  local id = idDe(clave)
  local nombre = deEnlace(enlace) or (id and infoObjeto(id))
  if nombre and string.find(sinTildes(nombre), buscado, 1, true) then
    return true
  end
  return string.find(sinTildes(clave), buscado, 1, true) ~= nil
end

-- Filas de una lista de claves, con el filtro puesto (texto vacío = todas). enlaces (opcional): el enlace de cada clave, que
-- va en su fila (fila.enlace).
local function filasDe(claves, texto, filas, filtradas, enlaces)
  local buscado = sinTildes(recortar(texto))
  for _, clave in ipairs(claves) do
    local enlace = enlaces and enlaces[clave]
    if buscado == "" or coincide(clave, buscado, enlace) then
      filas[#filas + 1] = {clave = clave, enlace = enlace}
      if filtradas then
        filtradas[#filtradas + 1] = clave
      end
    end
  end
end

local function ungrouped(clave)
  local datos = arbolDatos()
  local ruta = datos and datos.objeto(clave)
  return ruta == nil or ruta == ""
end

-- Una fila de sección (no se elige: al pulsarla se pliega o se despliega).
local function filaSeccion(clave, texto, plegada)
  return {clave = clave, seccion = true, texto = texto, plegada = plegada == true}
end

-- Los objetos de una sección, con el filtro puesto y con sangría.
local function objetosEnSeccion(filas, claves, texto)
  local dentro = {}
  filasDe(claves, texto, dentro)
  for _, f in ipairs(dentro) do
    f.sangria = true
    filas[#filas + 1] = f
  end
end

-- Las filas de la lista «sin grupo». En Grupo Base: la sección de los objetos de las bolsas sin grupo. En un subgrupo (la
-- lista de la izquierda): esa sección y «Objetos padre» (los del grupo padre; en un grupo de primer nivel el padre es Grupo
-- Base y sale vacía, porque lo sin grupo ya está en la primera). Las secciones salen siempre, aunque estén vacías o plegadas;
-- plegada, no lleva sus objetos.
-- En un subgrupo, «Objetos padre» tiene que verse sin desplazar la lista: si el jugador no eligió nada para la sección de las
-- bolsas y, desplegada, sus filas más las dos cabeceras no cabrían (capacidad = filas enteras que caben), sale plegada. Eso se
-- decide una sola vez al abrir el grupo (en el primer tamaño válido de la lista) y se guarda en autoBolsas hasta cambiar de
-- grupo: ni las bolsas ni el buscador la vuelven a mover. Si el jugador la pliega o la despliega a mano, esa elección manda.
-- Plegada, no se recorren ni se filtran las bolsas.
local function filasSinGrupo(ruta, texto, capacidad)
  local plegadaBolsas = plegadas[CLAVE_BOLSAS]
  if plegadaBolsas == nil and ruta ~= "" then
    plegadaBolsas = autoBolsas
  end
  local dentro = {}
  if plegadaBolsas ~= true then
    local bolsas = {}
    local deBolsas, enlaces = objetosDeBolsas()
    for _, clave in ipairs(deBolsas) do
      if ungrouped(clave) then
        bolsas[#bolsas + 1] = clave
      end
    end
    local names = {}
    for _, clave in ipairs(bolsas) do
      names[clave] = sinTildes(deEnlace(enlaces[clave]) or infoObjeto(idDe(clave)) or "")
    end
    table.sort(bolsas, function(a, b)
      if names[a] == names[b] then
        return idDe(a) < idDe(b)
      end
      if names[a] == "" or names[b] == "" then
        return names[b] == ""
      end
      return names[a] < names[b]
    end)
    filasDe(bolsas, texto, dentro, nil, enlaces)
    if plegadaBolsas == nil and ruta ~= "" and capacidad ~= nil then
      autoBolsas = #dentro + 2 > capacidad
      plegadaBolsas = autoBolsas
    end
  end
  local filas = {filaSeccion(CLAVE_BOLSAS, L.t("PRINCIPAL_GRUPOS_SECCION_BOLSAS"), plegadaBolsas)}
  if plegadaBolsas ~= true then
    for _, f in ipairs(dentro) do
      f.sangria = true
      filas[#filas + 1] = f
    end
  end
  if ruta ~= "" then
    filas[#filas + 1] = filaSeccion(CLAVE_PADRE, L.t("PRINCIPAL_GRUPOS_SECCION_PADRE"), plegadas[CLAVE_PADRE])
    local datos = arbolDatos()
    local padre = string.match(ruta, "^(.*)" .. SEP .. "[^" .. SEP .. "]*$") or ""
    if padre ~= "" and datos and not plegadas[CLAVE_PADRE] then
      objetosEnSeccion(filas, datos.objetos(padre), texto)
    end
  end
  return filas
end

local function filasEnGrupo(ruta, texto)
  local filas = {}
  local datos = arbolDatos()
  if datos then
    filasDe(datos.objetos(ruta), texto, filas)
  end
  return filas
end

local function textoBuscado()
  local campo = rutaActual == "" and Grupos.campoObjetosBase or Grupos.campoObjetosGrupo
  return campo and campo:GetText() or ""
end

-- «Mover 1 objeto» / «Mover 3 objetos»: con 1 se usa la clave en singular (la misma con el sufijo _UNO).
local function textoCuenta(clave, n)
  return L.t(n == 1 and (clave .. "_UNO") or clave, n)
end

-- Task 31: el ancho fijo del botón «Mover» es el de «Mover 9999 objetos» (el texto más largo) más su margen. Si la letra
-- propia aún no ha cargado (el texto mide 0) se queda el que tenía y se vuelve a intentar en el siguiente actualizarBotones.
local anchoMoverMedido = false
local function ajustarAnchoMover()
  local b = Grupos.botonMover
  if not b then
    return
  end
  local actual = b.texto:GetText()
  b.texto:SetText(textoCuenta("PRINCIPAL_GRUPOS_MOVER", MAS_OBJETOS))
  local medido = Tema.anchoTexto(b.texto)
  b.texto:SetText(actual)
  if medido > 0 then
    local ancho = math.ceil(medido) + MARGEN_MOVER
    b.anchoFijo = ancho
    b:SetWidth(ancho)
    anchoMoverMedido = true
  end
end

local function actualizarBotones()
  if not Grupos.botonMover then
    return
  end
  if not anchoMoverMedido then
    ajustarAnchoMover()
  end
  Grupos.botonMover:ponerTexto(textoCuenta("PRINCIPAL_GRUPOS_MOVER", marcas.base))
  Grupos.botonMover:ponerApagado(marcas.base == 0 or destino == nil)
  Grupos.botonAnadir:ponerTexto(textoCuenta("PRINCIPAL_GRUPOS_ANADIR", marcas.singrupo))
  Grupos.botonAnadir:ponerApagado(marcas.singrupo == 0)
  Grupos.botonQuitar:ponerTexto(textoCuenta("PRINCIPAL_GRUPOS_QUITAR", marcas.en))
  Grupos.botonQuitar:ponerApagado(marcas.en == 0)
end

-- Las tablas avisan de cada cambio de marcas por su «totales» (que nunca saca barra): aquí se cuentan los objetos marcados.
local function alMarcar(cual)
  return function(_, marcadas)
    local n = 0
    for clave in pairs(marcadas or {}) do
      if not esSeccion(clave) then
        n = n + 1
      end
    end
    marcas[cual] = n
    actualizarBotones()
    return nil
  end
end

-- Las claves de los objetos marcados de una tabla (sin las cabeceras de sección).
local function marcados(tabla)
  local lista = {}
  for clave in pairs(tabla:marcadas()) do
    if not esSeccion(clave) then
      lista[#lista + 1] = clave
    end
  end
  return lista
end

-- Vuelve a armar las listas de lo que se está viendo.
local function repintarListas()
  if not Grupos.pagina or rutaActual == nil then
    return
  end
  local texto = textoBuscado()
  presupuesto = recortar(texto) ~= "" and PRESUPUESTO_BUSQUEDA or nil
  if rutaActual == "" then
    Grupos.tablaBase:poner(filasSinGrupo("", texto))
  else
    Grupos.tablaSinGrupo:poner(filasSinGrupo(rutaActual, texto, Grupos.tablaSinGrupo:capacidad()))
    Grupos.tablaEnGrupo:poner(filasEnGrupo(rutaActual, texto))
  end
  presupuesto = nil
  actualizarBotones()
end

-- Repinta solo lo que se ve (cambió el nombre de un objeto o el modo de enseñarlos): las filas, sin rehacer las listas.
local function repintarFilas()
  if not Grupos.pagina then
    return
  end
  for _, t in ipairs({Grupos.tablaBase, Grupos.tablaSinGrupo, Grupos.tablaEnGrupo}) do
    t:refrescar()
  end
end

-- Un repintado como mucho cada FRENO_REPINTADO s. Pedir uno de filas solo repinta lo que se ve; pedir uno de listas (cambiaron las
-- bolsas) deja una marca de «listas sucias» que se mira cuando salta el temporizador, así que una petición de listas que llega
-- mientras espera una de filas sube a reconstruir las listas.
local listasSucias = false
local function pedirRepintado(listas)
  if not abierta then
    return
  end
  if listas then
    listasSucias = true
  end
  if pendiente then
    return
  end
  local function hacer()
    local completo = listasSucias
    listasSucias = false
    if completo then
      repintarListas()
    else
      repintarFilas()
    end
  end
  local temporizador = rawget(_G, "C_Timer")
  if temporizador and temporizador.After then
    pendiente = true
    temporizador.After(FRENO_REPINTADO, function()
      pendiente = false
      if abierta then
        hacer()
      end
    end)
  else
    hacer()
  end
end

local function alRecibirObjeto(id, bien)
  if type(id) == "number" and bien ~= false then
    pedidos[id] = nil -- si el juego dijo que no existe se queda como desconocido (no se vuelve a preguntar)
  end
  pedirRepintado(false)
end

local function alCambiarBolsas()
  pedirRepintado(true)
end

local function escuchar(si)
  local eventos = rawget(SNF, "Eventos")
  if not eventos then
    return
  end
  if si then
    eventos.escuchar("GET_ITEM_INFO_RECEIVED", alRecibirObjeto)
    eventos.escuchar("BAG_UPDATE_DELAYED", alCambiarBolsas)
  else
    eventos.dejar("GET_ITEM_INFO_RECEIVED", alRecibirObjeto)
    eventos.dejar("BAG_UPDATE_DELAYED", alCambiarBolsas)
  end
end

---------------------------------------------------------------------------------------------------
-- Renombrar en la cabecera
---------------------------------------------------------------------------------------------------

function Grupos.cancelarRenombrar()
  if not renombrando then
    return
  end
  renombrando = nil
  local c = Grupos.cabecera
  if c then
    c.campoNombre:ClearFocus()
    c.campoNombre:Hide()
    c.nombre:Show()
  end
end

-- ✎: el nombre del grupo pasa a un campo en la propia cabecera (Intro o perder el foco con otro nombre lo cambia).
function Grupos.renombrar(ruta)
  local c = Grupos.cabecera
  if not c or type(ruta) ~= "string" or ruta == "" or not arbolDatos() then
    return
  end
  if InCombatLockdown and InCombatLockdown() then
    decir("PRINCIPAL_GRUPOS_COMBATE_RENOMBRAR")
    return
  end
  renombrando = ruta
  c.nombre:Hide()
  c.campoNombre:Show()
  c.campoNombre:refrescar()
  c.campoNombre:SetFocus()
end

local function renombrarA(texto)
  local ruta, datos = renombrando, arbolDatos()
  local nombre = recortar(texto)
  if not ruta or not datos then
    return
  end
  if nombre == "" or nombre == nombreDe(ruta) then
    Grupos.cancelarRenombrar()
    return
  end
  local nueva = datos.renombrar(ruta, nombre)
  Grupos.cancelarRenombrar()
  local a = Grupos.arbol
  a:refrescar()
  a:elegir(nueva or ruta)
end

-- ¿Vale este nombre para renombrar `renombrando`? (sin «`», sin «/» delante y sin repetir entre hermanos; el suyo propio vale)
local function validarRenombre(texto)
  local nombre = recortar(texto)
  if nombre == "" or not renombrando then
    return true
  end
  if pareceComando(nombre) then
    return false, L.t("PRINCIPAL_GRUPOS_NOMBRE_COMANDO")
  end
  if string.find(nombre, SEP, 1, true) then
    return false, L.t("PRINCIPAL_GRUPOS_NOMBRE_MALO")
  end
  local datos = arbolDatos()
  if datos and nombre ~= nombreDe(renombrando) then
    local padre = string.match(renombrando, "^(.*)" .. SEP .. "[^" .. SEP .. "]*$") or ""
    for _, h in ipairs(datos.hijos(padre)) do
      if nombreDe(h) == nombre then
        return false, L.t("PRINCIPAL_GRUPOS_NOMBRE_MALO")
      end
    end
  end
  return true
end

local repintarOperaciones -- (más abajo) pone las tarjetas de Operaciones al día con el grupo elegido

---------------------------------------------------------------------------------------------------
-- Qué se enseña según el grupo elegido
---------------------------------------------------------------------------------------------------

local function nivelDe(ruta)
  if ruta == "" then
    return 0
  end
  local n = 1
  for _ in string.gmatch(ruta, SEP) do
    n = n + 1
  end
  return n
end

local function mostrarPaginas()
  local p = Grupos.pestanas
  if not p or rutaActual == nil then
    return
  end
  local i = p:elegida()
  local base = rutaActual == ""
  local function ver(marco, si)
    if si then
      marco:Show()
    else
      marco:Hide()
    end
  end
  ver(Grupos.paginaInfo, i == 1 and base)
  ver(Grupos.paginaObjetos, i == 1 and not base)
  ver(Grupos.paginaOperaciones, i == 2)
end

-- Los grupos entre los que se puede elegir el destino de «Mover» (todos menos Grupo Base).
local function ponerOpcionesDestino()
  local d, datos = Grupos.desplegableGrupo, arbolDatos()
  if not d or not datos then
    return
  end
  local opciones, existe = {}, false
  for _, ruta in ipairs(datos.ordenadas()) do
    opciones[#opciones + 1] = {ruta, (string.gsub(ruta, SEP, " › "))}
    if ruta == destino then
      existe = true
    end
  end
  if not existe then
    destino = nil -- el grupo elegido ya no existe
  end
  d.snfOpciones.opciones = opciones
  d:refrescar()
end

local function ponerTextoBuscador(campo, texto)
  ajustando = true
  campo:SetText(texto)
  ajustando = false
end

-- Pone la derecha al día con el grupo elegido en el árbol.
local function mostrarDerecha()
  local a, c = Grupos.arbol, Grupos.cabecera
  if not a or not c or not Grupos.pagina then
    return
  end
  local elegida = a:elegida()
  if elegida == CLAVE_NUEVO then
    return -- se está creando un subgrupo: la derecha sigue como estaba
  end
  local datos = arbolDatos()
  if type(elegida) ~= "string" or (elegida ~= "" and datos and not datos.existe(elegida)) then
    elegida = ""
  end
  if elegida ~= rutaActual then
    -- Lo elegido no pasa de un grupo a otro (ni los botones se quedan con su cuenta).
    for _, tabla in ipairs({Grupos.tablaBase, Grupos.tablaSinGrupo, Grupos.tablaEnGrupo}) do
      tabla:marcarTodo(false)
    end
    Grupos.cancelarRenombrar()
    autoBolsas = nil -- grupo nuevo: la regla se decide otra vez
    ponerTextoBuscador(Grupos.campoObjetosBase, "")
    ponerTextoBuscador(Grupos.campoObjetosGrupo, "")
  end
  rutaActual = elegida
  local base = elegida == ""
  c.nombre:SetText(base and L.t("PRINCIPAL_GRUPOS_BASE") or nombreDe(elegida))
  local nivel = nivelDe(elegida)
  local colorNivel = nivel == 0 and "base" or ("nivel" .. (((nivel - 1) % 5) + 1))
  colorTexto(c.nombre, colorNivel)
  pintar(c.icono, colorNivel) -- la carpeta, del mismo color que el nombre
  if base then
    c.botonLapiz:Hide()
    c.botonExportar:Hide()
  else
    c.botonLapiz:Show()
    c.botonExportar:Show()
  end
  Grupos.pestanas.pestanas[1].texto:SetText(L.t(base and "PRINCIPAL_GRUPOS_PESTANA_INFO" or "PRINCIPAL_GRUPOS_PESTANA_OBJETOS"))
  mostrarPaginas()
  if base then
    ponerOpcionesDestino()
  end
  repintarListas()
  repintarOperaciones()
end

---------------------------------------------------------------------------------------------------
-- Acciones sobre los objetos marcados
---------------------------------------------------------------------------------------------------

-- Mueve los objetos marcados de la lista de un grupo al grupo `a` (nil = Grupo Base).
local function pasarMarcados(tabla, a)
  local datos = arbolDatos()
  if not datos then
    return
  end
  for _, clave in ipairs(marcados(tabla)) do
    datos.poner(clave, a)
  end
  tabla:marcarTodo(false) -- tras añadir, quitar o mover no queda nada elegido
  repintarListas()
end

function Grupos.ponerDestino(ruta)
  if type(ruta) ~= "string" or ruta == "" then
    destino = nil
  else
    destino = ruta
  end
  if Grupos.desplegableGrupo then
    Grupos.desplegableGrupo:refrescar()
  end
  actualizarBotones()
end

function Grupos.moverMarcados()
  if rutaActual == "" and destino then
    pasarMarcados(Grupos.tablaBase, destino)
  end
end

function Grupos.anadirMarcados()
  if rutaActual and rutaActual ~= "" then
    pasarMarcados(Grupos.tablaSinGrupo, rutaActual)
  end
end

function Grupos.quitarMarcados()
  if rutaActual and rutaActual ~= "" then
    -- Vuelven al grupo padre; si el padre es Grupo Base (primer nivel), a Grupo Base.
    local padre = string.match(rutaActual, "^(.*)" .. SEP .. "[^" .. SEP .. "]*$") or ""
    pasarMarcados(Grupos.tablaEnGrupo, padre ~= "" and padre or nil)
  end
end

---------------------------------------------------------------------------------------------------
-- Operaciones: una tarjeta por tipo
---------------------------------------------------------------------------------------------------

local TIPOS_ORDEN = {"subasta", "artesania", "correo", "compras", "sniper", "vendedor", "almacen"} -- el orden de TSM
local OPS_PAD = 10 -- relleno de la tarjeta
local OPS_ALTO_TITULO = 16
local OPS_ALTO_DESC = 14
local OPS_ALTO_HEREDA = 24
local OPS_PASO_FILA = 28 -- alto de una fila de operación (26) y su hueco
local OPS_ALTO_FILA = 26
local OPS_ALTO_ENLACE = 22
local OPS_HUECO = 8 -- entre tarjetas
local OPS_LADO_ICONO = 14
local OPS_BORDE_BARRA = 4 -- Task 32: la fila (y su barra) llega hasta 4 px del borde derecho de la tarjeta, como gr-02
local OPS_ANCHO_ASA = 16
local OPS_ANCHO_DESPLEGABLE = 220
local OPS_LETRA_NUMERO = 14 -- el número de la fila: Bold, en el color del texto principal (TSM: unos 14 px)
local OPS_LADO_TRIANGULO = 12
local plegadasOp = {} -- tipo de operación -> true: su tarjeta está plegada (dura la sesión; vale para todos los grupos)
local arrastreOperacion -- {tipo, desde}: la asa que se está arrastrando

local function datosOperaciones()
  return rawget(SNF, "Operaciones")
end

-- ⧉: abre esa operación en la pestaña Operaciones. La página puede no existir aún: se deja la petición guardada y la página la
-- recoge (y la borra) al crearse o al enseñarse. Task 22: si después de cambiar de pestaña la petición sigue ahí (la página ya
-- se veía y no la recogió), se llama a SNF.PrincipalOperaciones.abrir(tipo, nombre), que también la borra: nunca se queda
-- colgada ni se abre dos veces.
function Grupos.abrirOperacion(tipo, nombre)
  Grupos.operacionPedida = {tipo = tipo, nombre = nombre}
  SNF.Principal.elegir("operaciones")
  local pagina = rawget(SNF, "PrincipalOperaciones")
  if Grupos.operacionPedida and type(pagina) == "table" and type(pagina.abrir) == "function" then
    proteger(pagina.abrir)(tipo, nombre)
  end
  Grupos.operacionPedida = nil
end

-- La lista del grupo elegido para un tipo si se puede editar (tiene la suya); nil si hereda o no hay datos.
local function listaEditable(tipo)
  local datos = datosOperaciones()
  if not datos or rutaActual == nil then
    return nil
  end
  local nombres, de = datos.deGrupo(rutaActual, tipo)
  if de ~= nil then
    return nil
  end
  return nombres
end

local function guardarOperaciones(tipo, nombres)
  local datos = datosOperaciones()
  if datos and rutaActual ~= nil then
    datos.ponerDeGrupo(rutaActual, tipo, nombres)
  end
  repintarOperaciones()
end

local function agregarOperacion(tipo, nombre)
  local lista = listaEditable(tipo)
  local datos = datosOperaciones()
  if not lista or not datos or type(nombre) ~= "string" then
    return
  end
  if datos.TIPOS[tipo].una and #lista >= 1 then
    return
  end
  for _, n in ipairs(lista) do
    if n == nombre then
      return
    end
  end
  lista[#lista + 1] = nombre
  guardarOperaciones(tipo, lista)
end

local function quitarOperacion(tipo, indice)
  local lista = listaEditable(tipo)
  if lista and lista[indice] then
    table.remove(lista, indice)
    guardarOperaciones(tipo, lista)
  end
end

local function moverOperacion(tipo, desde, hasta)
  local lista = listaEditable(tipo)
  if lista and lista[desde] and lista[hasta] and desde ~= hasta then
    local n = table.remove(lista, desde)
    table.insert(lista, hasta, n)
    guardarOperaciones(tipo, lista)
  end
end

-- «Usar las suyas»: marcada, el grupo parte de la lista que heredaba (como TSM); desmarcada, vuelve a heredar.
local function usarLasSuyas(tipo, si)
  local datos = datosOperaciones()
  if not datos or rutaActual == nil or rutaActual == "" then
    return
  end
  if si then
    local nombres, de = datos.deGrupo(rutaActual, tipo)
    if de ~= nil then
      datos.ponerDeGrupo(rutaActual, tipo, nombres)
    end
  else
    datos.quitarOverride(rutaActual, tipo)
  end
  repintarOperaciones()
end

-- La fila de la tarjeta bajo el cursor (por su alto); nil si ninguna.
local function filaOperacionBajoCursor(tarjeta)
  local _, cy = GetCursorPosition()
  local escala = tarjeta:GetEffectiveScale()
  if not cy or not escala or escala == 0 then
    return nil
  end
  local y = cy / escala
  for i, f in ipairs(tarjeta.filas) do
    local arriba, abajo = f:GetTop(), f:GetBottom()
    if f:IsShown() and arriba and abajo and y <= arriba and y >= abajo then
      return i
    end
  end
  return nil
end

local function crearFilaOperacion(tarjeta, i)
  local tipo = tarjeta.tipo
  local f = CreateFrame("Frame", nil, tarjeta)
  f.indice = i
  f.numero = Tema.letra(f:CreateFontString(nil, "OVERLAY"), "titulo", OPS_LETRA_NUMERO)
  colorTexto(f.numero, "texto")
  f.numero:SetPoint("LEFT", f, "LEFT", 0, 0)
  f.numero:SetWidth(18)
  f.numero:SetJustifyH("LEFT")
  f.asa = Piezas.botonIcono(f, "asa", function() end, {tamano = OPS_ANCHO_ASA, color = "apagado", ayuda = Piezas.ayudaDe("PRINCIPAL_AYUDA_ORDEN")})
  f.asa:SetPoint("LEFT", f.numero, "RIGHT", 2, 0)
  f.asa:RegisterForDrag("LeftButton")
  f.asa:SetScript("OnDragStart", proteger(function()
    arrastreOperacion = {tipo = tipo, desde = f.indice}
  end))
  f.asa:SetScript("OnDragStop", proteger(function()
    local a = arrastreOperacion
    arrastreOperacion = nil
    if a and a.tipo == tipo then
      local hasta = filaOperacionBajoCursor(tarjeta)
      if hasta and hasta ~= a.desde then
        moverOperacion(tipo, a.desde, hasta)
      end
    end
  end))
  -- Task 32, como gr-02: la barra del nombre va del asa hasta 4 px del borde derecho de la tarjeta (la fila llega ahí: la
  -- ancla ponerTarjetaOperacion) y lleva dentro, a la derecha, ✖ (a 6 px del borde) y ⧉ (a 8 px de la ✖). El alto de la
  -- barra es el de antes (del borde de arriba del asa + 5 al de abajo de un icono de 14 centrado - 5).
  f.nombre = CreateFrame("Frame", nil, f)
  Tema.panel(f.nombre, "pestanaElegida")
  f.nombre:SetPoint("TOPLEFT", f.asa, "TOPRIGHT", 6, 5)
  f.nombre:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", 0, (OPS_ALTO_FILA - OPS_LADO_ICONO) / 2 - 5)
  f.botonQuitar = Piezas.botonIcono(f.nombre, "cerrar", function()
    quitarOperacion(tipo, f.indice)
  end, {tamano = OPS_LADO_ICONO})
  Piezas.ayuda(f.botonQuitar, Piezas.ayudaDe("PRINCIPAL_AYUDA_QUITAR_OP"))
  f.botonQuitar:SetPoint("RIGHT", f.nombre, "RIGHT", -6, 0)
  f.botonAbrir = Piezas.botonIcono(f.nombre, "ventana", function()
    if f.operacion then
      Grupos.abrirOperacion(tipo, f.operacion)
    end
  end, {tamano = OPS_LADO_ICONO})
  Piezas.ayuda(f.botonAbrir, Piezas.ayudaDe("PRINCIPAL_AYUDA_ABRIR_OP"))
  f.botonAbrir:SetPoint("RIGHT", f.botonQuitar, "LEFT", -8, 0)
  f.nombre.texto = Tema.letra(f.nombre:CreateFontString(nil, "OVERLAY"), "texto")
  f.nombre.texto:SetPoint("LEFT", f.nombre, "LEFT", 8, 0)
  f.nombre.texto:SetPoint("RIGHT", f.botonAbrir, "LEFT", -8, 0)
  f.nombre.texto:SetJustifyH("LEFT")
  f.nombre.texto:SetWordWrap(false)
  return f
end

local function crearTarjetaOperacion(contenido, tipo)
  local t = Piezas.tarjeta(contenido)
  t.tipo = tipo
  t.filas = {}
  -- Delante del título va ▼ (desplegada) o ▶ (plegada); pulsar el título o el triángulo pliega y despliega la tarjeta.
  t.triangulo = t:CreateTexture(nil, "OVERLAY")
  t.triangulo:SetSize(OPS_LADO_TRIANGULO, OPS_LADO_TRIANGULO)
  t.triangulo:SetPoint("TOPLEFT", t, "TOPLEFT", OPS_PAD, -(OPS_PAD + 2))
  Tema.icono(t.triangulo, "abierto")
  pintar(t.triangulo, "texto")
  t.titulo = Tema.letra(t:CreateFontString(nil, "OVERLAY"), "titulo")
  t.titulo:SetPoint("LEFT", t.triangulo, "RIGHT", 6, 0)
  t.titulo:SetJustifyH("LEFT")
  t.cabecera = Piezas.interno.botonBase(t, function()
    plegadasOp[tipo] = not plegadasOp[tipo] or nil
    repintarOperaciones()
  end)
  t.cabecera:SetPoint("TOPLEFT", t, "TOPLEFT", OPS_PAD, -OPS_PAD)
  t.cabecera:SetPoint("TOPRIGHT", t, "TOPRIGHT", -OPS_PAD, -OPS_PAD)
  t.cabecera:SetHeight(OPS_ALTO_TITULO)
  t.descripcion = Tema.letra(t:CreateFontString(nil, "OVERLAY"), "texto", 10)
  colorTexto(t.descripcion, "textoPestana")
  t.descripcion:SetPoint("TOPLEFT", t, "TOPLEFT", OPS_PAD, -(OPS_PAD + OPS_ALTO_TITULO + 2))
  t.descripcion:SetPoint("TOPRIGHT", t, "TOPRIGHT", -OPS_PAD, -(OPS_PAD + OPS_ALTO_TITULO + 2))
  t.descripcion:SetJustifyH("LEFT")
  t.descripcion:SetWordWrap(false)
  t.heredadas = Tema.letra(t:CreateFontString(nil, "OVERLAY"), "texto", 10)
  colorTexto(t.heredadas, "apagado")
  t.heredadas:SetJustifyH("RIGHT")
  t.suyas = false
  t.casilla = Piezas.casilla(t, L.t("PRINCIPAL_GRUPOS_OPS_USAR_SUYAS"), function() return t.suyas end, function(valor)
    usarLasSuyas(tipo, valor)
  end)
  t.enlace = Piezas.enlace(t, L.t("PRINCIPAL_GRUPOS_OPS_AGREGAR"), function()
    if #t.desplegable.snfOpciones.opciones == 0 then
      -- Nunca se apaga: sin operaciones por añadir, avisa en el chat. Si el tipo solo admite una y ya la tiene, lo dice;
      -- si no, dice dónde se crean las que faltan.
      local datos = datosOperaciones()
      local nombres = datos and rutaActual ~= nil and datos.deGrupo(rutaActual, t.tipo) or {}
      if datos and datos.TIPOS[t.tipo].una and #nombres >= 1 then
        print(L.t("PRINCIPAL_GRUPOS_OPS_SOLO_UNA"))
      else
        print(L.t("PRINCIPAL_GRUPOS_OPS_NO_HAY_MAS"))
      end
    else
      t.desplegable:abrir()
    end
  end)
  -- La lista de «Agregar más operaciones» es un desplegable invisible bajo el enlace.
  t.desplegable = Piezas.desplegable(t, {
    ancho = OPS_ANCHO_DESPLEGABLE, opciones = {},
    get = function() return nil end,
    set = function(valor) agregarOperacion(tipo, valor) end,
  })
  t.desplegable:SetAlpha(0)
  t.desplegable:EnableMouse(false)
  t.desplegable:SetPoint("TOPRIGHT", t.enlace, "BOTTOMRIGHT", 0, 0)
  return t
end

-- Pone una tarjeta con lo del grupo elegido y devuelve su alto.
local function ponerTarjetaOperacion(t, datos)
  local tipo, def = t.tipo, datos.TIPOS[t.tipo]
  local nombres, de = datos.deGrupo(rutaActual, tipo)
  local hereda = de ~= nil
  t.titulo:SetText(L.t("PRINCIPAL_GRUPOS_OPS_TITULO", L.t("PRINCIPAL_GRUPOS_OPS_TIPO_" .. string.upper(tipo))))
  local plegada = plegadasOp[tipo] == true
  Tema.icono(t.triangulo, plegada and "cerrado" or "abierto")
  if plegada then
    -- Plegada: solo queda la línea del título.
    t.descripcion:Hide()
    t.casilla:Hide()
    t.heredadas:Hide()
    t.enlace:Hide()
    t.desplegable:cerrar()
    for _, f in ipairs(t.filas) do
      f:Hide()
    end
    return OPS_PAD + OPS_ALTO_TITULO + OPS_PAD
  end
  t.descripcion:Show()
  t.descripcion:SetText(L.t("PRINCIPAL_GRUPOS_OPS_DESC_" .. string.upper(tipo)))
  local y = OPS_PAD + OPS_ALTO_TITULO + 2 + OPS_ALTO_DESC + 8
  -- Subgrupos: «Usar las suyas» y, si heredan, de quién.
  if rutaActual ~= "" then
    t.suyas = not hereda
    t.casilla:ClearAllPoints()
    t.casilla:SetPoint("TOPLEFT", t, "TOPLEFT", OPS_PAD, -y)
    t.casilla.texto:SetText(L.t("PRINCIPAL_GRUPOS_OPS_USAR_SUYAS"))
    t.casilla:SetWidth(11 + 8 + math.ceil(t.casilla.texto:GetStringWidth()))
    t.casilla:refrescar()
    t.casilla:Show()
    t.heredadas:ClearAllPoints()
    t.heredadas:SetPoint("TOPRIGHT", t, "TOPRIGHT", -OPS_PAD, -(y + 2))
    if hereda then
      local origen = de == "" and L.t("PRINCIPAL_GRUPOS_BASE") or (string.gsub(de, SEP, " › "))
      t.heredadas:SetText(L.t("PRINCIPAL_GRUPOS_OPS_HEREDADAS", origen))
      t.heredadas:Show()
    else
      t.heredadas:Hide()
    end
    y = y + OPS_ALTO_HEREDA
  else
    t.suyas = true
    t.casilla:Hide()
    t.heredadas:Hide()
  end
  -- Las filas «N ⠿ [nombre ⧉ ✖]» (Task 32: ⧉ y ✖ dentro de la barra).
  for i, n in ipairs(nombres) do
    local f = t.filas[i]
    if not f then
      f = crearFilaOperacion(t, i)
      t.filas[i] = f
    end
    f.operacion = n
    f.numero:SetText(tostring(i))
    f.nombre.texto:SetText(n)
    f:ClearAllPoints()
    f:SetPoint("TOPLEFT", t, "TOPLEFT", OPS_PAD, -(y + (i - 1) * OPS_PASO_FILA))
    f:SetPoint("TOPRIGHT", t, "TOPRIGHT", -OPS_BORDE_BARRA, -(y + (i - 1) * OPS_PASO_FILA))
    f:SetHeight(OPS_ALTO_FILA)
    if hereda then
      f.asa:Hide() -- las heredadas se miran, no se tocan
      f.botonQuitar:Hide()
    else
      f.asa:Show()
      f.botonQuitar:Show()
    end
    f:Show()
  end
  for i = #nombres + 1, #t.filas do
    t.filas[i].operacion = nil
    t.filas[i]:Hide()
  end
  y = y + #nombres * OPS_PASO_FILA
  -- «Agregar más operaciones»: va siempre en el color del acento; sin nada que añadir (una puesta en los tipos de una sola,
  -- o ya están todas) pulsarlo avisa en el chat.
  local libres = {}
  if not (def.una and #nombres >= 1) then
    local puestas = {}
    for _, n in ipairs(nombres) do
      puestas[n] = true
    end
    for _, n in ipairs(datos.lista(tipo)) do
      if not puestas[n] then
        libres[#libres + 1] = {n, n}
      end
    end
  end
  t.desplegable.snfOpciones.opciones = libres
  t.desplegable:refrescar()
  if hereda then
    t.enlace:Hide()
  else
    t.enlace:ponerTexto(L.t("PRINCIPAL_GRUPOS_OPS_AGREGAR"))
    t.enlace:ClearAllPoints()
    t.enlace:SetPoint("TOPRIGHT", t, "TOPRIGHT", -OPS_PAD, -(y + 3))
    t.enlace:ponerApagado(false)
    t.enlace:Show()
    y = y + OPS_ALTO_ENLACE
  end
  return y + OPS_PAD
end

repintarOperaciones = function()
  local zona, tarjetas, datos = Grupos.zonaOperaciones, Grupos.tarjetas, datosOperaciones()
  if not zona or not tarjetas or not datos or rutaActual == nil then
    return
  end
  local y = 0
  for _, tipo in ipairs(TIPOS_ORDEN) do
    local t = tarjetas[tipo]
    local alto = ponerTarjetaOperacion(t, datos)
    t:ClearAllPoints()
    t:SetPoint("TOPLEFT", zona.contenido, "TOPLEFT", 0, -y)
    t:SetPoint("TOPRIGHT", zona.contenido, "TOPRIGHT", -12, -y)
    t:SetHeight(alto)
    y = y + alto + OPS_HUECO
  end
  zona:ponerAlto(y)
end

local function crearOperaciones(pagina)
  local zona, contenido = Piezas.desplazable(pagina)
  zona:SetAllPoints(pagina)
  zona.contenido = contenido
  contenido:SetPoint("TOPLEFT", zona, "TOPLEFT", 0, 0) -- el hijo del marco con desplazamiento lleva su sitio explícito
  Grupos.zonaOperaciones = zona
  Grupos.tarjetas = {}
  for _, tipo in ipairs(TIPOS_ORDEN) do
    Grupos.tarjetas[tipo] = crearTarjetaOperacion(contenido, tipo)
  end
end

---------------------------------------------------------------------------------------------------
-- Construcción del lado derecho
---------------------------------------------------------------------------------------------------

-- Pulsar una sección la pliega o la despliega (vale para todos los grupos).
local function alternarSeccion(fila)
  plegadas[fila.clave] = not fila.plegada -- lo que se ve manda: la elección a mano queda guardada, sea cual sea la regla
  repintarListas()
end

-- «Copiar» de una lista: abre la ventana de texto (la de exportar) con las claves de los objetos que se ven en esa lista,
-- separadas por comas («i:2589,i:2592»), sin las filas de sección. Con la lista vacía no hace nada.
local function copiarLista(tabla)
  local claves = {}
  for i = 1, tabla:cuantas() do
    local f = tabla:fila(i)
    if f and not f.seccion and not esSeccion(f.clave) then
      claves[#claves + 1] = f.clave
    end
  end
  if #claves == 0 or not textoModulo() then
    return
  end
  abrirTexto("exportar", L.t("PRINCIPAL_GRUPOS_TEXTO_COPIAR"), L.t("PRINCIPAL_GRUPOS_TEXTO_AYUDA_EXPORTAR"), table.concat(claves, ","))
end

-- T1a: con el ratón sobre un objeto de una lista sale su tooltip del juego (UIComercio.tooltipObjeto: con el enlace de las
-- bolsas si lo hay, si no por su id; a la derecha de la fila), y al salir se va. Las secciones no son objetos: nada.
local function tooltipDeFila(fila, marco)
  local UI = rawget(SNF, "UIComercio")
  if not (UI and UI.tooltipObjeto) then
    return
  end
  if fila.seccion or esSeccion(fila.clave) then
    -- Una sección pasa a ser la fila del ratón (la rueda con el ratón parado): el tooltip del objeto de antes se va.
    UI.soltarTooltipObjeto(marco)
    return
  end
  UI.tooltipObjeto(marco, {enlace = fila.enlace, item = idDe(fila.clave), clave = fila.clave})
end

local function sinTooltipDeFila(marco)
  local UI = rawget(SNF, "UIComercio")
  if UI and UI.esconderTooltipObjeto then
    UI.esconderTooltipObjeto(marco, true) -- la luz de la tabla ya ha esperado (ronda 1)
  end
end

-- Una lista de objetos: en un recuadro, sin casillas (se elige pulsando), con letra pequeña. Con título lleva una barra
-- con su icono de copiar; sin título (Grupo Base › Información) va sin cabecera.
local function nuevaTablaObjetos(padre, cual, titulo)
  local tabla
  local opciones = {
    elegir = true, borde = true, letra = LETRA_OBJETOS,
    columnas = {{clave = "obj", titulo = titulo or "", flex = true, pintar = pintarObjeto}},
    totales = alMarcar(cual),
    alPulsarSeccion = alternarSeccion,
    -- B3s, como TSM: el clic suma o quita, Alt + clic elige el tramo y Mayús o Ctrl + clic llevan el objeto al chat o al
    -- probador (UIComercio.clicModificado), con lo mismo que su tooltip: el enlace de su hueco de las bolsas o su id.
    objeto = function(fila)
      if fila.seccion or esSeccion(fila.clave) then
        return nil
      end
      return fila.enlace, idDe(fila.clave)
    end,
    alEntrar = tooltipDeFila,
    alSalir = sinTooltipDeFila,
  }
  if titulo then
    opciones.titulo = {texto = titulo, copiar = function() copiarLista(tabla) end}
  else
    opciones.sinCabecera = true
  end
  tabla = Piezas.tabla(padre, opciones)
  return tabla
end

-- El botón de copiar de Grupo Base: un icono con recuadro, fuera de la lista y a la derecha del buscador.
local function crearBotonCopiar(padre, alPulsar)
  local b = Piezas.interno.botonBase(padre, alPulsar)
  b:SetSize(ANCHO_COPIAR, ANCHO_COPIAR)
  Tema.panel(b, "secundario", {borde = true})
  b.icono = b:CreateTexture(nil, "OVERLAY")
  b.icono:SetSize(12, 12)
  b.icono:SetPoint("CENTER", b, "CENTER", 0, 0)
  Tema.icono(b.icono, "copiar")
  pintar(b.icono, "apagado")
  b:SetScript("OnEnter", proteger(function(self) pintar(self.icono, "texto") end))
  b:SetScript("OnLeave", proteger(function(self) pintar(self.icono, "apagado") end))
  return b
end

local sinTecladoEnCombate = Piezas.interno.sinTecladoEnCombate -- (ui/piezas/campos.lua; lo usa también Operaciones)

-- Un buscador de objetos con su lupa; escribir vuelve a armar las listas.
local function crearBuscador(padre, marcador)
  local campo = Piezas.campo(padre, {placeholder = marcador, lupa = true})
  sinTecladoEnCombate(campo)
  local previo = campo:GetScript("OnTextChanged")
  campo:SetScript("OnTextChanged", proteger(function(self, ...)
    if previo then
      previo(self, ...)
    end
    if not ajustando then
      repintarListas()
    end
  end))
  return campo
end

-- «Mostrar los objetos sin grupo como:» y su desplegable.
local function crearFilaModo(pagina, y)
  local etiqueta = Tema.letra(pagina:CreateFontString(nil, "OVERLAY"), "texto", 10)
  colorTexto(etiqueta, "textoPestana")
  etiqueta:SetPoint("TOPLEFT", pagina, "TOPLEFT", 0, y - 5)
  etiqueta:SetText(L.t("PRINCIPAL_GRUPOS_MOSTRAR_COMO"))
  local opciones = {}
  for _, m in ipairs(MODOS) do
    opciones[#opciones + 1] = {m, L.t(TEXTO_MODO[m])}
  end
  local d = Piezas.desplegable(pagina, {
    opciones = opciones,
    get = function() return modoSinGrupo end,
    set = function(valor)
      modoSinGrupo = valor
      Grupos.desplegableModo:refrescar()
      Grupos.desplegableModoGrupo:refrescar()
      repintarFilas()
    end,
  })
  d:SetPoint("TOPLEFT", etiqueta, "TOPRIGHT", 8, 5)
  d:SetPoint("RIGHT", pagina, "RIGHT", 0, 0)
  return etiqueta, d
end

local function crearDerecha(padre, panel)
  local der = CreateFrame("Frame", nil, padre)
  der:SetPoint("TOPLEFT", panel, "TOPRIGHT", DER_IZQUIERDA, -DER_ARRIBA)
  der:SetPoint("BOTTOMRIGHT", padre, "BOTTOMRIGHT", -DER_BORDE, DER_ARRIBA)
  Grupos.derecha = der

  -- Cabecera: carpeta, nombre en Bold con el color de su nivel y, en los subgrupos, ✎ y exportar.
  local cab = CreateFrame("Frame", nil, der)
  cab:SetPoint("TOPLEFT", der, "TOPLEFT", 0, 0)
  cab:SetPoint("TOPRIGHT", der, "TOPRIGHT", 0, 0)
  cab:SetHeight(ALTO_CABECERA)
  Grupos.cabecera = cab
  cab.icono = cab:CreateTexture(nil, "OVERLAY")
  cab.icono:SetSize(LADO_ICONO, LADO_ICONO)
  cab.icono:SetPoint("LEFT", cab, "LEFT", 0, 0)
  Tema.icono(cab.icono, "carpeta")
  pintar(cab.icono, "texto")
  cab.nombre = Tema.letra(cab:CreateFontString(nil, "OVERLAY"), "titulo")
  cab.nombre:SetPoint("LEFT", cab.icono, "RIGHT", 8, 0)
  cab.nombre:SetJustifyH("LEFT")
  cab.botonExportar = Piezas.botonIcono(cab, "exportar", function()
    Grupos.exportar(rutaActual)
  end, {tamano = LADO_ICONO})
  Piezas.ayuda(cab.botonExportar, Piezas.ayudaDe("PRINCIPAL_AYUDA_EXPORTAR_GRUPO"))
  cab.botonExportar:SetPoint("RIGHT", cab, "RIGHT", 0, 0)
  cab.botonLapiz = Piezas.botonIcono(cab, "lapiz", function()
    Grupos.renombrar(rutaActual)
  end, {tamano = LADO_ICONO})
  Piezas.ayuda(cab.botonLapiz, Piezas.ayudaDe("PRINCIPAL_AYUDA_RENOMBRAR"))
  cab.botonLapiz:SetPoint("RIGHT", cab.botonExportar, "LEFT", -HUECO_ICONOS * 2, 0)
  cab.nombre:SetPoint("RIGHT", cab.botonLapiz, "LEFT", -8, 0)
  -- El campo del nuevo nombre va sobre el nombre.
  cab.campoNombre = Piezas.campo(cab, {
    get = function() return renombrando and nombreDe(renombrando) or "" end,
    set = renombrarA, validar = validarRenombre,
  })
  cab.campoNombre:SetPoint("LEFT", cab.icono, "RIGHT", 4, 0)
  cab.campoNombre:SetPoint("RIGHT", cab.botonLapiz, "LEFT", -8, 0)
  local previoFoco = cab.campoNombre:GetScript("OnEditFocusLost")
  cab.campoNombre:SetScript("OnEditFocusLost", proteger(function(self, ...)
    if previoFoco then
      previoFoco(self, ...)
    end
    Grupos.cancelarRenombrar()
  end))
  cab.campoNombre:Hide()

  -- Pestañas secundarias: Información (Grupo Base) u Objetos (subgrupo), y Operaciones (la llena la Task 18).
  local pest = Piezas.pestanas(der, {
    nombres = {L.t("PRINCIPAL_GRUPOS_PESTANA_INFO"), L.t("PRINCIPAL_GRUPOS_PESTANA_OPERACIONES")},
    alElegir = function() mostrarPaginas() end,
  })
  pest:SetPoint("TOPLEFT", cab, "BOTTOMLEFT", 0, -6)
  pest:SetPoint("TOPRIGHT", cab, "BOTTOMRIGHT", 0, -6)
  Grupos.pestanas = pest

  local function nuevaPagina()
    local p = CreateFrame("Frame", nil, der)
    p:SetPoint("TOPLEFT", pest, "BOTTOMLEFT", 0, -10)
    p:SetPoint("BOTTOMRIGHT", der, "BOTTOMRIGHT", 0, 0)
    p:Hide()
    return p
  end

  -- Grupo Base › Información.
  local info = nuevaPagina()
  Grupos.paginaInfo = info
  local texto = Tema.letra(info:CreateFontString(nil, "OVERLAY"), "texto", 10)
  colorTexto(texto, "textoPestana")
  texto:SetPoint("TOPLEFT", info, "TOPLEFT", 0, 0)
  texto:SetPoint("TOPRIGHT", info, "TOPRIGHT", 0, 0)
  texto:SetHeight(28)
  texto:SetJustifyH("LEFT")
  texto:SetJustifyV("TOP")
  texto:SetText(L.t("PRINCIPAL_GRUPOS_INFO_TEXTO"))
  Grupos.textoInfo = texto
  Grupos.campoObjetosBase = crearBuscador(info, L.t("PRINCIPAL_GRUPOS_BUSCAR_OBJETOS"))
  Grupos.campoObjetosBase:SetPoint("TOPLEFT", texto, "BOTTOMLEFT", 0, -18)
  Grupos.campoObjetosBase:SetPoint("TOPRIGHT", texto, "BOTTOMRIGHT", -(ANCHO_COPIAR + 6), -18)
  Grupos.botonCopiarBase = crearBotonCopiar(info, function() copiarLista(Grupos.tablaBase) end)
  Grupos.botonCopiarBase:SetPoint("TOPLEFT", Grupos.campoObjetosBase, "TOPRIGHT", 6, 0)
  Grupos.etiquetaModo, Grupos.desplegableModo = crearFilaModo(info, -62)
  Grupos.tablaBase = nuevaTablaObjetos(info, "base", nil)
  Grupos.tablaBase:SetPoint("TOPLEFT", info, "TOPLEFT", 0, -90)
  Grupos.tablaBase:SetPoint("BOTTOMRIGHT", info, "BOTTOMRIGHT", 0, ALTO_FILA_ABAJO + HUECO_FILA_ABAJO)
  Grupos.botonMover = Piezas.boton(info, textoCuenta("PRINCIPAL_GRUPOS_MOVER", 0), Grupos.moverMarcados, {ancho = ANCHO_MOVER_SIN_MEDIR, alto = ALTO_FILA_ABAJO})
  Grupos.botonMover:SetPoint("BOTTOMRIGHT", info, "BOTTOMRIGHT", 0, 0)
  ajustarAnchoMover()
  Grupos.desplegableGrupo = Piezas.desplegable(info, {
    opciones = {}, cabecera = L.t("PRINCIPAL_GRUPOS_ELEGIR_GRUPO"), plano = true,
    get = function() return destino end,
    set = function(valor) Grupos.ponerDestino(valor) end,
  })
  Grupos.desplegableGrupo:SetPoint("BOTTOMLEFT", info, "BOTTOMLEFT", 0, 0)
  Grupos.desplegableGrupo:SetPoint("RIGHT", Grupos.botonMover, "LEFT", -8, 0)

  -- Subgrupo › Objetos: dos listas iguales y debajo Añadir y Quitar.
  local obj = nuevaPagina()
  Grupos.paginaObjetos = obj
  Grupos.campoObjetosGrupo = crearBuscador(obj, L.t("PRINCIPAL_GRUPOS_BUSCAR_EN_GRUPO"))
  Grupos.campoObjetosGrupo:SetPoint("TOPLEFT", obj, "TOPLEFT", 0, 0)
  Grupos.campoObjetosGrupo:SetPoint("TOPRIGHT", obj, "TOPRIGHT", 0, 0)
  Grupos.etiquetaModoGrupo, Grupos.desplegableModoGrupo = crearFilaModo(obj, -28)
  Grupos.tablaSinGrupo = nuevaTablaObjetos(obj, "singrupo", L.t("PRINCIPAL_GRUPOS_SIN_GRUPO"))
  Grupos.tablaSinGrupo:SetPoint("TOPLEFT", obj, "TOPLEFT", 0, -56)
  Grupos.tablaSinGrupo:SetPoint("BOTTOMRIGHT", obj, "BOTTOM", -4, ALTO_BOTON + 8)
  -- Cuántas filas caben decide si la sección de las bolsas empieza plegada: si al abrir la lista aún no tenía alto, en su primer
  -- tamaño válido se rehace (por el freno de repintado).
  Grupos.tablaSinGrupo:HookScript("OnSizeChanged", proteger(function()
    if rutaActual ~= nil and rutaActual ~= "" and autoBolsas == nil and plegadas[CLAVE_BOLSAS] == nil then
      pedirRepintado(true)
    end
  end))
  Grupos.tablaEnGrupo = nuevaTablaObjetos(obj, "en", L.t("PRINCIPAL_GRUPOS_EN_GRUPO"))
  Grupos.tablaEnGrupo:SetPoint("TOPLEFT", obj, "TOP", 4, -56)
  Grupos.tablaEnGrupo:SetPoint("BOTTOMRIGHT", obj, "BOTTOMRIGHT", 0, ALTO_BOTON + 8)
  Grupos.botonAnadir = Piezas.boton(obj, textoCuenta("PRINCIPAL_GRUPOS_ANADIR", 0), Grupos.anadirMarcados, {ancho = 150, alto = ALTO_BOTON})
  Grupos.botonAnadir:SetPoint("BOTTOMLEFT", obj, "BOTTOMLEFT", 0, 0)
  Grupos.botonAnadir:SetPoint("BOTTOMRIGHT", obj, "BOTTOM", -4, 0)
  Grupos.botonQuitar = Piezas.boton(obj, textoCuenta("PRINCIPAL_GRUPOS_QUITAR", 0), Grupos.quitarMarcados, {ancho = 150, alto = ALTO_BOTON})
  Grupos.botonQuitar:SetPoint("BOTTOMLEFT", obj, "BOTTOM", 4, 0)
  Grupos.botonQuitar:SetPoint("BOTTOMRIGHT", obj, "BOTTOMRIGHT", 0, 0)

  -- Operaciones: una tarjeta por tipo (Task 18).
  local ops = nuevaPagina()
  Grupos.paginaOperaciones = ops
  crearOperaciones(ops)

  -- Con el combate empezado no se deja ningún campo de texto con el teclado cogido.
  der:RegisterEvent("PLAYER_REGEN_DISABLED")
  der:SetScript("OnEvent", proteger(function()
    Grupos.cancelarRenombrar()
    Grupos.campoObjetosBase:ClearFocus()
    Grupos.campoObjetosGrupo:ClearFocus()
    Grupos.campo:ClearFocus()
  end))

  actualizarBotones()
  return der
end

local function repintarTextosDerecha()
  local c = Grupos.cabecera
  if not c then
    return
  end
  Grupos.pestanas.pestanas[2].texto:SetText(L.t("PRINCIPAL_GRUPOS_PESTANA_OPERACIONES"))
  Grupos.textoInfo:SetText(L.t("PRINCIPAL_GRUPOS_INFO_TEXTO"))
  Grupos.campoObjetosBase.marcador:SetText(L.t("PRINCIPAL_GRUPOS_BUSCAR_OBJETOS"))
  Grupos.campoObjetosGrupo.marcador:SetText(L.t("PRINCIPAL_GRUPOS_BUSCAR_EN_GRUPO"))
  Grupos.etiquetaModo:SetText(L.t("PRINCIPAL_GRUPOS_MOSTRAR_COMO"))
  Grupos.etiquetaModoGrupo:SetText(L.t("PRINCIPAL_GRUPOS_MOSTRAR_COMO"))
  for _, d in ipairs({Grupos.desplegableModo, Grupos.desplegableModoGrupo}) do
    local opciones = {}
    for _, m in ipairs(MODOS) do
      opciones[#opciones + 1] = {m, L.t(TEXTO_MODO[m])}
    end
    d.snfOpciones.opciones = opciones
    d:refrescar()
  end
  Grupos.desplegableGrupo.snfOpciones.cabecera = L.t("PRINCIPAL_GRUPOS_ELEGIR_GRUPO")
  Grupos.desplegableGrupo:refrescar()
  Grupos.tablaSinGrupo:ponerTitulo(L.t("PRINCIPAL_GRUPOS_SIN_GRUPO"))
  Grupos.tablaEnGrupo:ponerTitulo(L.t("PRINCIPAL_GRUPOS_EN_GRUPO"))
  ajustarAnchoMover() -- Task 31: «Mover 9999 objetos» mide distinto en cada idioma
  mostrarDerecha() -- nombre de Grupo Base, pestaña y secciones; también deja los botones con su texto
end

local function crearPagina(padre)
  local panel = CreateFrame("Frame", nil, padre)
  -- El alto lo da la página: dos anclajes (arriba y abajo a la izquierda) y solo el ancho propio.
  panel:SetPoint("TOPLEFT", padre, "TOPLEFT", 0, 0)
  panel:SetPoint("BOTTOMLEFT", padre, "BOTTOMLEFT", 0, 0)
  panel:SetWidth(ANCHO_PANEL)
  local fondo = plana(panel, "BACKGROUND", 0)
  fondo:SetAllPoints(panel)
  pintar(fondo, "secundario") -- 22,28,28 como el árbol de TSM
  Grupos.fondoPanel = fondo
  Grupos.panel = panel

  -- Arriba: buscador y, a la derecha, exportar e importar.
  local campo = Piezas.campo(panel, {ancho = ANCHO_CAMPO, lupa = true, placeholder = L.t("PRINCIPAL_GRUPOS_BUSCAR")})
  campo:SetPoint("TOPLEFT", panel, "TOPLEFT", MARGEN, -MARGEN)
  Grupos.campo = campo

  Grupos.botonImportar = Piezas.botonIcono(panel, "importar", function()
    local m = Grupos.menuImportar
    if m:IsShown() then
      m:Hide()
    else
      Grupos.cancelarNuevo()
      m:Show()
    end
  end, {tamano = LADO_ICONO})
  Piezas.ayuda(Grupos.botonImportar, Piezas.ayudaDe("PRINCIPAL_AYUDA_IMPORTAR"))
  Grupos.botonImportar:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -MARGEN, -(MARGEN + 3))
  Grupos.botonExportar = Piezas.botonIcono(panel, "exportar", function()
    Grupos.exportar()
  end, {tamano = LADO_ICONO})
  Piezas.ayuda(Grupos.botonExportar, Piezas.ayudaDe("PRINCIPAL_AYUDA_EXPORTAR_TODO"))
  Grupos.botonExportar:SetPoint("RIGHT", Grupos.botonImportar, "LEFT", -HUECO_ICONOS, 0)
  Grupos.botonExpandir = Piezas.botonIcono(panel, "expandirTodo", function()
    Grupos.cancelarNuevo()
    Grupos.arbol:alternarTodos()
  end, {tamano = LADO_ICONO})
  Piezas.ayuda(Grupos.botonExpandir, Piezas.ayudaDe("PRINCIPAL_GRUPOS_EXPAND_ALL"))
  Grupos.botonExpandir:SetPoint("RIGHT", Grupos.botonExportar, "LEFT", -HUECO_ICONOS, 0)

  Grupos.menuImportar = crearMenu(panel)
  Grupos.menuImportar:SetPoint("TOPRIGHT", Grupos.botonImportar, "BOTTOMRIGHT", 0, -4)

  -- El árbol de grupos.
  local a = Piezas.arbol(panel, {raizFija = true, nodos = nodos, botones = botonesDe, alSoltar = alSoltar, alElegir = function() mostrarDerecha() end})
  a:SetPoint("TOPLEFT", panel, "TOPLEFT", 0, -ARRIBA_ARBOL)
  a:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", 0, MARGEN)
  -- El alto del árbol es el de la página (dos anclajes): Piezas.arbol se repinta al enseñarse (OnShow) y al cambiar de
  -- tamaño (OnSizeChanged, p. ej. al estirar la ventana con el asa). Aquí solo se recoloca el campo del nombre si lo hay.
  local previoTamano = a:GetScript("OnSizeChanged")
  a:SetScript("OnSizeChanged", proteger(function(self, ...)
    if previoTamano then
      previoTamano(self, ...)
    end
    colocarCampo()
  end))
  Grupos.arbol = a
  -- Elegir un grupo (con el ratón o por código) cambia lo que enseña la derecha.
  local elegirDelArbol = a.elegir
  a.elegir = function(self, clave)
    elegirDelArbol(self, clave)
    mostrarDerecha()
  end

  -- Con el combate empezado no se deja un campo de texto abierto (la regla del addon es no capturar el teclado en combate).
  panel:RegisterEvent("PLAYER_REGEN_DISABLED")
  panel:SetScript("OnEvent", proteger(function()
    Grupos.cancelarNuevo()
    if Grupos.texto then
      Grupos.texto.caja:ClearFocus() -- la ventanita del texto tampoco se queda con el teclado
    end
  end))

  -- El campo del nombre de un subgrupo nuevo, encima de la fila nueva (se coloca al pulsar ⊕).
  local nuevo = Piezas.campo(a, {
    ancho = ANCHO_PANEL - 2 * MARGEN, placeholder = L.t("PRINCIPAL_GRUPOS_NOMBRE_NUEVO"),
    get = function() return "" end, set = crearConNombre, validar = validarNombre,
  })
  nuevo:SetFrameLevel(a:GetFrameLevel() + 10)
  local previoFoco = nuevo:GetScript("OnEditFocusLost")
  nuevo:SetScript("OnEditFocusLost", proteger(function(self, ...)
    if previoFoco then
      previoFoco(self, ...)
    end
    Grupos.cancelarNuevo() -- sin nombre (o ya creado) la fila nueva se va
  end))
  nuevo:Hide()
  Grupos.campoNuevo = nuevo

  -- La rueda mueve la lista: el campo sigue a su fila (o se cancela si la fila sale de la vista).
  local previoRueda = a:GetScript("OnMouseWheel")
  a:SetScript("OnMouseWheel", proteger(function(self, ...)
    if previoRueda then
      previoRueda(self, ...)
    end
    colocarCampo()
  end))

  -- Buscar filtra mientras se escribe.
  local previoTexto = campo:GetScript("OnTextChanged")
  campo:SetScript("OnTextChanged", proteger(function(self, ...)
    if previoTexto then
      previoTexto(self, ...)
    end
    local texto = self:GetText()
    if texto ~= "" then
      Grupos.cancelarNuevo()
    end
    a:filtrar(texto)
  end))

  sinTecladoEnCombate(campo) -- el buscador del árbol
  Grupos.confirmacion = crearConfirmacion()
  Grupos.texto = crearTexto()
  crearDerecha(padre, panel)
  Grupos.pagina = padre
  mostrarDerecha()
end

local function repintarTextos()
  if not Grupos.pagina then
    return
  end
  Grupos.campo.marcador:SetText(L.t("PRINCIPAL_GRUPOS_BUSCAR"))
  Grupos.campoNuevo.marcador:SetText(L.t("PRINCIPAL_GRUPOS_NOMBRE_NUEVO"))
  Grupos.menuImportar.filaTexto:ponerTexto(L.t("PRINCIPAL_GRUPOS_IMPORTAR_TEXTO"))
  Grupos.menuImportar.filaTSM:ponerTexto(L.t("PRINCIPAL_GRUPOS_IMPORTAR_TSM"))
  local c = Grupos.confirmacion
  c.botonBorrar:ponerTexto(L.t("PRINCIPAL_GRUPOS_BORRAR"))
  c.botonCancelar:ponerTexto(L.t("PRINCIPAL_GRUPOS_CANCELAR"))
  Grupos.texto:repintar()
  if rutaPorBorrar then
    c.texto:SetText(L.t("PRINCIPAL_GRUPOS_BORRAR_PREGUNTA", nombreDe(rutaPorBorrar)))
  end
  Grupos.arbol:refrescar() -- el texto de Grupo Base
  repintarTextosDerecha()
end

SNF.Principal.registrar("grupos", {
  crear = crearPagina,
  mostrar = function()
    abierta = true
    escuchar(true)
    autoBolsas = nil -- la ventana se abre otra vez: la regla de las bolsas se decide de nuevo, con las bolsas de ahora
    mostrarDerecha() -- las bolsas y los grupos pueden haber cambiado desde la última vez
  end,
  ocultar = function()
    abierta = false
    escuchar(false)
    if Grupos.pagina then
      Grupos.cerrarTodo()
    end
  end,
  idioma = repintarTextos,
})
