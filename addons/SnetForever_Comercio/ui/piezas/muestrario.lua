-- SnetForever: muestrario de piezas de la ventana principal. Es una ventana de PRUEBA, para la sesión principal y no para el
-- jugador: enseña todas las piezas (botones, casillas, radio, campos, desplegables, etiqueta, título, tarjeta, pestañas,
-- árbol, tabla y dinero) con datos inventados parecidos a los de las capturas de TSM, para compararlas en el juego.
--
-- /snet muestrario (solo con el comercio cargado) la abre; otra vez la cierra. Se mueve arrastrándola y se cierra con la X
-- de arriba, con Escape o con la orden. Solo se crea la primera vez que se abre: al entrar al juego no se crea nada.
--
-- SNF.Muestrario.abrir()      abre la ventana (la crea si hace falta) o, si ya está abierta, la cierra.
-- SNF.Muestrario.ventana      el marco (nil hasta la primera vez). También es el global SnetForeverMuestrario.
-- SNF.Muestrario.bloques      lista {nombre, marco, titulo} en el orden en que salen.
-- SNF.Muestrario.piezas       las piezas que se prueban desde fuera: tabla, arbol, pestanas...
-- SNF.Muestrario.zona         la zona con desplazamiento (zona.contenido es donde está todo).
-- SNF.Muestrario.opcionesLista   las 60 opciones de los desplegables largos. .dineros: cuántos importes enseña.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema

local M = {bloques = {}, piezas = {}, opcionesLista = {}, dineros = 0}
SNF.Muestrario = M

local NOMBRE = "SnetForeverMuestrario"
local ANCHO, ALTO = 760, 620
local ANCHO_UTIL = 700 -- ancho de lo que se enseña dentro de la zona
local MARGEN = 8

local function poner(fs, token)
  local c = Tema.color(token)
  fs:SetTextColor(c[1], c[2], c[3], 1)
end

-- Un texto suelto en el padre, en (x, y) desde arriba a la izquierda.
local function texto(padre, cadena, tipo, token, x, y)
  local fs = Tema.letra(padre:CreateFontString(nil, "OVERLAY"), tipo or "texto")
  fs:SetJustifyH("LEFT")
  poner(fs, token or "texto")
  fs:SetPoint("TOPLEFT", padre, "TOPLEFT", x, -y)
  fs:SetText(cadena)
  return fs
end

-- Las opciones largas (60) de los desplegables: para ver el desplazamiento de la lista.
local function crearOpciones()
  local lista = {}
  for i = 1, 60 do
    lista[i] = {"grupo" .. i, string.format("Grupo de ejemplo %02d", i)}
  end
  return lista
end

-- El árbol de ejemplo: una raíz y unos 36 nodos en 5 niveles.
local function nodosArbol()
  local raiz = {clave = "base", texto = "Grupo Base", nivel = 0, hijos = {}}
  local nombres = {"Hierbas", "Minerales", "Telas"}
  for a = 1, 3 do
    local n1 = {clave = "a" .. a, texto = nombres[a], nivel = 1, hijos = {}}
    for b = 1, 2 do
      local n2 = {clave = "a" .. a .. "b" .. b, texto = nombres[a] .. " " .. b, nivel = 2, hijos = {}}
      for c = 1, 2 do
        local n3 = {clave = n2.clave .. "c" .. c, texto = "Lote " .. a .. "-" .. b .. "-" .. c, nivel = 3, hijos = {}}
        local n4 = {clave = n3.clave .. "d", texto = "Sublote " .. a .. b .. c, nivel = 4, hijos = {}}
        if a == 1 then
          n4.hijos[1] = {clave = n4.clave .. "e", texto = "Suelto " .. b .. c, nivel = 5, hijos = {}}
        end
        n3.hijos[1] = n4
        n2.hijos[#n2.hijos + 1] = n3
      end
      n1.hijos[#n1.hijos + 1] = n2
    end
    raiz.hijos[#raiz.hijos + 1] = n1
  end
  return raiz
end

-- Las filas de la tabla: 200 objetos inventados con texto, número, dinero y porcentaje.
local function filasTabla()
  local nombres = {"Hoja de plata", "Raíz de sol", "Barra de cobre", "Paño de lana", "Cuero ligero", "Gema turbia"}
  local filas = {}
  for i = 1, 200 do
    filas[i] = {
      clave = "obj" .. i,
      nombre = nombres[(i - 1) % #nombres + 1] .. " " .. i,
      cantidad = (i * 7) % 45 + 1,
      precio = ((i * 7919) % 90000) + 40,
      pct = (i * 3) % 40,
    }
  end
  return filas
end

-- Cada bloque guarda su nombre, su marco y el título pequeño. Devuelve el marco y la y siguiente.
local function bloque(contenido, y, nombre, titulo, alto)
  local marco = CreateFrame("Frame", nil, contenido)
  marco:SetPoint("TOPLEFT", contenido, "TOPLEFT", 0, -(y + 18))
  marco:SetSize(ANCHO_UTIL, alto)
  local fs = texto(contenido, titulo, "mayusculas", "apagado", 0, y)
  M.bloques[#M.bloques + 1] = {nombre = nombre, marco = marco, titulo = fs}
  return marco, y + 18 + alto + 22
end

local function crearBloques(c)
  local y = 0
  local marco

  -- Botones: relleno, con borde, apagado, con icono y enlaces.
  marco, y = bloque(c, y, "botones", "BOTONES, ENLACES E ICONOS · comparar con op-02 (Renombrar, Reset, la X de arriba) y op-04 (Marcar todo)", 30)
  local b1 = Piezas.boton(marco, "Comprar", function() end)
  b1:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  local b2 = Piezas.boton(marco, "Cancelar", function() end, {borde = true, ancho = 90})
  b2:SetPoint("LEFT", b1, "RIGHT", 10, 0)
  local b3 = Piezas.boton(marco, "Apagado", function() end)
  b3:ponerApagado(true)
  b3:SetPoint("LEFT", b2, "RIGHT", 10, 0)
  local b4 = Piezas.boton(marco, "Crear nuevo", function() end, {icono = "mas", ancho = 110})
  b4:SetPoint("LEFT", b3, "RIGHT", 10, 0)
  local e1 = Piezas.enlace(marco, "Marcar todo", function() end)
  e1:SetPoint("LEFT", b4, "RIGHT", 24, 0)
  local e2 = Piezas.enlace(marco, "Borrar todo", function() end)
  e2:ponerApagado(true)
  e2:SetPoint("LEFT", e1, "RIGHT", 14, 0)
  local i1 = Piezas.botonIcono(marco, "cerrar", function() end, {tamano = 16})
  i1:SetPoint("LEFT", e2, "RIGHT", 24, 0)
  local i2 = Piezas.botonIcono(marco, "papelera", function() end, {tamano = 16, color = "acento"})
  i2:SetPoint("LEFT", i1, "RIGHT", 12, 0)
  local i3 = Piezas.botonIcono(marco, "mas", function() end, {tamano = 16})
  i3:ponerApagado(true)
  i3:SetPoint("LEFT", i2, "RIGHT", 12, 0)
  M.piezas.botonIcono = i1

  -- Casillas.
  marco, y = bloque(c, y, "casillas", "CASILLAS · comparar con aj-04 (apariencia)", 24)
  local marcada, sinMarcar = true, false
  local k1 = Piezas.casilla(marco, "Casilla marcada", function() return marcada end, function(v) marcada = v end)
  k1:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  local k2 = Piezas.casilla(marco, "Casilla sin marcar", function() return sinMarcar end, function(v) sinMarcar = v end)
  k2:SetPoint("LEFT", k1, "RIGHT", 30, 0)
  local k3 = Piezas.casilla(marco, "Casilla apagada", function() return true end, function() end)
  k3:ponerApagado(true)
  k3:SetPoint("LEFT", k2, "RIGHT", 30, 0)

  -- Radio.
  marco, y = bloque(c, y, "radio", "RADIO SÍ / NO · comparar con op-03 (cancelación)", 24)
  local r1, r2 = true, false
  local d1 = Piezas.radio(marco, function() return r1 end, function(v) r1 = v end)
  d1:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  local d2 = Piezas.radio(marco, function() return r2 end, function(v) r2 = v end)
  d2:SetPoint("LEFT", d1, "RIGHT", 60, 0)
  local d3 = Piezas.radio(marco, function() return true end, function() end)
  d3:ponerApagado(true)
  d3:SetPoint("LEFT", d2, "RIGHT", 60, 0)

  -- Campos: a la izquierda los normales (normal, con ⧉, con lupa, en error) y a la derecha los apagados y la lupa en error,
  -- cada uno con su etiqueta encima.
  marco, y = bloque(c, y, "campos", "CAMPOS · comparar con op-02 (Post cap, Precio mínimo con fórmula, buscar con lupa)", 190)
  local valores = {porcentaje = "100%", formula = "min(snfmercado, 2 * snfminimo) + 1g", buscar = ""}
  local function get(clave) return function() return valores[clave] end end
  local function set(clave) return function(v) valores[clave] = v end end
  local function fijo(texto) return function() return texto end end
  local c1 = Piezas.campo(marco, {ancho = 300, get = get("porcentaje"), set = set("porcentaje")})
  c1:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, -16)
  Piezas.etiqueta(marco, "Porcentaje de compra", {vinculo = function() end}):anclarSobre(c1)
  local c2 = Piezas.campo(marco, {ancho = 300, copiar = function() end, get = get("formula"), set = set("formula")})
  c2:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, -62)
  Piezas.etiqueta(marco, "Con fórmula", {}):anclarSobre(c2)
  local c3 = Piezas.campo(marco, {ancho = 300, lupa = true, placeholder = "Buscar operaciones", get = get("buscar"),
    set = set("buscar")})
  c3:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, -108)
  Piezas.etiqueta(marco, "Con lupa", {}):anclarSobre(c3)
  local c4 = Piezas.campo(marco, {ancho = 300, get = fijo("abc"), set = function() end})
  c4:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, -154)
  c4:ponerError("Aquí solo caben números")
  Piezas.etiqueta(marco, "En error", {}):anclarSobre(c4)
  local c5 = Piezas.campo(marco, {ancho = 300, get = fijo("No se puede cambiar"), set = function() end})
  c5:SetPoint("TOPLEFT", marco, "TOPLEFT", 380, -16)
  c5:ponerApagado(true)
  Piezas.etiqueta(marco, "Apagado", {}):anclarSobre(c5)
  local c6 = Piezas.campo(marco, {ancho = 300, lupa = true, placeholder = "Buscar operaciones", get = fijo(""),
    set = function() end})
  c6:SetPoint("TOPLEFT", marco, "TOPLEFT", 380, -62)
  c6:ponerApagado(true)
  Piezas.etiqueta(marco, "Con lupa, apagado", {}):anclarSobre(c6)
  local c7 = Piezas.campo(marco, {ancho = 300, copiar = function() end, get = fijo("min(snfmercado, 2 * snfminimo) + 1g"),
    set = function() end})
  c7:SetPoint("TOPLEFT", marco, "TOPLEFT", 380, -108)
  c7:ponerApagado(true)
  Piezas.etiqueta(marco, "Con fórmula, apagado", {}):anclarSobre(c7)
  local c8 = Piezas.campo(marco, {ancho = 300, lupa = true, get = fijo("zzz"), set = function() end})
  c8:SetPoint("TOPLEFT", marco, "TOPLEFT", 380, -154)
  c8:ponerError("Esa búsqueda no vale")
  Piezas.etiqueta(marco, "Con lupa, en error", {}):anclarSobre(c8)
  M.piezas.campo = c1
  M.piezas.campoLupaApagado = c6
  M.piezas.campoCopiarApagado = c7
  M.piezas.campoLupaError = c8

  -- Desplegables: simple corto, simple largo y de varios largo.
  marco, y = bloque(c, y, "desplegables", "DESPLEGABLES · comparar con op-02 (Duración de subasta, Cuando está por debajo)", 130)
  M.opcionesLista = crearOpciones()
  local duracion, largo, varios = "24", "grupo7", {grupo2 = true, grupo9 = true}
  -- La duración como en el editor: claves «12», «24» y «48» (el nombre antiguo), que en Forever son 2, 8 y 24 horas.
  local dc = Piezas.desplegable(marco, {ancho = 200, opciones = {{"12", "2 horas"}, {"24", "8 horas"}, {"48", "24 horas"}},
    get = function() return duracion end, set = function(v) duracion = v end})
  dc:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, -16)
  Piezas.etiqueta(marco, "Simple, 3 opciones", {}):anclarSobre(dc)
  local dl = Piezas.desplegable(marco, {ancho = 220, opciones = M.opcionesLista,
    get = function() return largo end, set = function(v) largo = v end})
  dl:SetPoint("LEFT", dc, "RIGHT", 20, 0)
  Piezas.etiqueta(marco, "Simple, 60 opciones", {}):anclarSobre(dl)
  local dv = Piezas.desplegable(marco, {ancho = 220, opciones = M.opcionesLista, varios = true, cabecera = "Ninguno",
    get = function() return varios end, set = function(v, si) varios[v] = si or nil end})
  dv:SetPoint("LEFT", dl, "RIGHT", 20, 0)
  Piezas.etiqueta(marco, "De varios, 60 opciones", {}):anclarSobre(dv)
  local da = Piezas.desplegable(marco, {ancho = 200, opciones = {{"12", "2 horas"}, {"24", "8 horas"}},
    get = function() return "24" end, set = function() end})
  da:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, -86)
  da:ponerApagado(true)
  Piezas.etiqueta(marco, "Apagado", {}):anclarSobre(da)
  M.piezas.desplegableApagado = da

  -- Etiqueta con el icono de vínculo.
  marco, y = bloque(c, y, "etiqueta", "ETIQUETA CON 🔗 · comparar con op-02 (nombres de campo)", 20)
  Piezas.etiqueta(marco, "Duración de subasta", {vinculo = function() end}):SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  Piezas.etiqueta(marco, "Sin vínculo", {}):SetPoint("TOPLEFT", marco, "TOPLEFT", 260, 0)

  -- Título con descripción larga.
  marco, y = bloque(c, y, "titulo", "TÍTULO CON DESCRIPCIÓN LARGA · comparar con op-02 y gr-02 (cabeceras de sección)", 60)
  local tit = Piezas.titulo(marco, "Opciones de publicación",
    "Este párrafo es de prueba y no explica ningún ajuste: lo único que importa es que, al ser tan largo, se reparta en " ..
    "varias líneas sin cortarse y que el título y todo lo que tiene debajo sigan en su sitio.")
  tit:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  tit:ponerAncho(ANCHO_UTIL)

  -- Tarjeta.
  marco, y = bloque(c, y, "tarjeta", "TARJETA · comparar con gr-02 (Auctioning, Crafting... con su fila de operación)", 80)
  local tj = Piezas.tarjeta(marco, {ancho = ANCHO_UTIL})
  tj:SetSize(ANCHO_UTIL, 80)
  tj:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  texto(tj, "Operaciones de subasta", "titulo", "texto", 10, 10)
  texto(tj, "Controlan cómo se publica y se cancela en la casa de subastas.", "texto", "apagado", 10, 30)
  local fila = Piezas.boton(tj, "#Default", function() end, {borde = true, ancho = 300})
  fila:SetPoint("TOPLEFT", tj, "TOPLEFT", 10, -50)
  local mas = Piezas.enlace(tj, "Agregar más operaciones", function() end)
  mas:SetPoint("TOPRIGHT", tj, "TOPRIGHT", -10, -52)

  -- Pestañas.
  marco, y = bloque(c, y, "pestanas", "PESTAÑAS · comparar con op-02 (Detalles, Publicación, Cancelación)", 22)
  local pes = Piezas.pestanas(marco, {nombres = {"Detalles", "Publicación", "Cancelación"}, elegida = 2})
  pes:SetSize(ANCHO_UTIL, 22)
  pes:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  M.piezas.pestanas = pes

  -- Árbol.
  marco, y = bloque(c, y, "arbol", "ÁRBOL, 5 NIVELES · comparar con gr-02 y op-02 (grupos y operaciones, colores por nivel)", 240)
  local arbol = Piezas.arbol(marco, {ancho = 340, alto = 240, nodos = nodosArbol, alElegir = function() end,
    botones = function() return {{icono = "lapiz", alPulsar = function() end}, {icono = "papelera", alPulsar = function() end}} end,
    alSoltar = function() end})
  arbol:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  arbol:elegir("a1b1c1d")
  M.piezas.arbol = arbol

  -- Tabla con 200 filas.
  marco, y = bloque(c, y, "tabla", "TABLA, 200 FILAS · comparar con op-04 (cabecera, ✓, ⋮, filas, totales y cajas MÁS/MENOS)", 280)
  local tabla = Piezas.tabla(marco, {
    ancho = ANCHO_UTIL, alto = 280, marcar = true, menu = true, orden = {clave = "precio", asc = false},
    columnas = {
      {clave = "nombre", titulo = "Objeto", flex = 1, valor = function(f) return f.nombre end},
      {clave = "cantidad", titulo = "Cantidad", ancho = 70, justificado = "RIGHT", valor = function(f) return f.cantidad end},
      {clave = "precio", titulo = "Precio", ancho = 120, justificado = "RIGHT", valor = function(f) return f.precio end,
        pintar = function(celda, f) celda.texto:SetText(Tema.dinero(f.precio)) end},
      {clave = "pct", titulo = "Margen", ancho = 70, justificado = "RIGHT", valor = function(f) return f.pct end,
        pintar = function(celda, f) celda.texto:SetText(f.pct .. " %") end},
    },
    totales = function(filas, marcadas)
      local suma, elegidas = 0, 0
      for _, f in ipairs(filas) do
        suma = suma + f.precio
        if marcadas[f.clave] then elegidas = elegidas + 1 end
      end
      return string.format("%d objetos, %d marcados, total %s", #filas, elegidas, Tema.dinero(suma))
    end,
  })
  tabla:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
  tabla:poner(filasTabla())
  M.piezas.tabla = tabla

  -- Dinero.
  marco, y = bloque(c, y, "dinero", "DINERO · comparar con la barra de oro de TSM (10g 49s 07c)", 44)
  local importes = {0, 7, 1234, 104907, 15000000, -2500}
  M.dineros = #importes
  for i, cobre in ipairs(importes) do
    local col, fila = (i - 1) % 3, math.floor((i - 1) / 3)
    texto(marco, Tema.dinero(cobre), "tabla", "texto", col * 200, fila * 22)
  end
  return y
end

local function crear()
  local v = CreateFrame("Frame", NOMBRE, UIParent)
  SNF.WindowSizing.register(v, NOMBRE, true)
  v:SetSize(ANCHO, ALTO)
  v:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  v:SetFrameStrata("DIALOG")
  v:SetToplevel(true)
  v:SetClampedToScreen(true)
  v:SetMovable(true)
  v:EnableMouse(true)
  v:RegisterForDrag("LeftButton")
  v:SetScript("OnDragStart", Piezas.proteger(function(self) self:StartMoving() end))
  v:SetScript("OnDragStop", Piezas.proteger(function(self) self:StopMovingOrSizing() end))
  Tema.panel(v, "fondo", {borde = true})
  M.ventana = v

  texto(v, "Muestrario de piezas (prueba)", "titulo", "texto", MARGEN + 4, 10)
  -- Qué es esto, en gris debajo del título (el jugador no sabía qué estaba viendo). Solo en español, a propósito: el
  -- muestrario es una hoja de pruebas y todo su texto va en español.
  texto(v, "Hoja de pruebas para comparar con TSM. No hace falta usarla.", "texto", "apagado", MARGEN + 4, 28)
  local cerrar = Piezas.botonIcono(v, "cerrar", function() v:Hide() end, {tamano = 16, color = "texto"})
  Piezas.ayuda(cerrar, Piezas.ayudaDe("PIEZAS_AYUDA_CERRAR"))
  cerrar:SetPoint("TOPRIGHT", v, "TOPRIGHT", -MARGEN - 2, -MARGEN - 2)
  v.cerrar = cerrar

  local zona, contenido = Piezas.desplazable(v)
  zona:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN, -48)
  zona:SetPoint("BOTTOMRIGHT", v, "BOTTOMRIGHT", -MARGEN, MARGEN)
  M.zona = zona
  local alto = crearBloques(contenido)
  zona:ponerAlto(alto)

  table.insert(UISpecialFrames, NOMBRE) -- Escape la cierra
  return v
end

function M.abrir()
  local v = M.ventana
  if not v then
    v = crear()
    v:Show()
  elseif v:IsShown() then
    v:Hide()
  else
    v:Show()
  end
end
