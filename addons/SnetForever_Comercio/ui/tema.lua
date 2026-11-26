-- SnetForever: tema de la ventana principal de comercio (colores, letras, iconos, dinero y paneles con esquinas).
--
-- Tema.color(token)          copia {r, g, b, a} del color del token (el que se cambie no toca el tema). Tokens:
--                            fondo, lateral, secundario, hundido, elegida, pestanaElegida, boton, botonApagado, borde,
--                            texto, textoPestana, apagado, acento, enlace, enlaceApagado, marca, error (rojo propio, no
--                            sale del inventario de TSM: borde de un campo que no vale), oro, plata, cobre, nivel1 a
--                            nivel5, base y, propios de la vista de resultados (tramos del tiempo y del %), verde,
--                            naranja, amarillo, rojo y azul. The Forge palette also defines radioVacio, bordeRadio
--                            and tituloLista for radio buttons and dropdown headings.
-- Tema.hex(token)            el mismo color como «rrggbb» (para los códigos |cff...|r).
-- Tema.letra(fs, tipo, tamano?) applies the Forge face for the role and returns fs without a shadow or outline.
--                            Heading roles use Alegreya SC. Body, table and control roles use Barlow Semi Condensed.
--                            Tema.TAMANOS gives the default sizes. If the bundle cannot be used, the client font takes over.
-- Tema.TAMANOS[tipo]         el tamaño por defecto de cada tipo.
-- Tema.ALTO_FILA             el alto de fila de las tablas (TablaComercio y Piezas.tabla): sigue a la letra «tabla» (B3r:
--                            22 px con la letra de 12; TSM: unos 1,9 veces su letra).
-- Tema.icono(tex, nombre)    pone en la textura el trozo del atlas recursos\iconos.tga (celdas de 16 x 16, en blanco:
--                            se tiñe con SetVertexColor). Un nombre desconocido es un error de uso.
-- Tema.iconoTexto(nombre, r?, g?, b?)   el icono como texto «|T…|t» para ponerlo dentro de una línea, teñido (0 a 1).
-- Tema.dinero(cobre)         «10g 49s 07c» con los colores de oro, plata y cobre. Sin ceros a la izquierda; los
--                            céntimos y, con oro, la plata llevan dos cifras.
-- Tema.dineroPlano(cobre)    lo mismo sin colores: el único formato de dinero sin colores (B6r, punto 11): lo usan los
--                            botones, la lista vieja y el cuadro de cantidad (UIComercio.dinero). Los dos salen de
--                            SNF.Texto.dinero (ui/texto.lua del núcleo; revisión B7, menores 10 y 11), el mismo sitio que
--                            el dinero del chat y del diario: las letras «g», «s», «c» (COMERCIO_ORO…), guardadas y
--                            rehechas al cambiar de idioma.
-- Tema.anchoTexto(fs)        el ancho del texto entero (GetUnboundedStringWidth si existe; si no, GetStringWidth): el que
--                            sirve para decidir si un texto de ancho fijo cabe (B2r ronda 1).
-- Tema.panel(marco, token, opciones?)   fondo plano del color del token con las esquinas de unos 3 px (esquina.tga).
--                            opciones.borde = true añade un borde de 1 px del token «borde» (o del que diga
--                            opciones.colorBorde, p. ej. "error"). Se puede llamar otra vez para cambiar el color.
--                            Devuelve marco.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Tema = {}
SNF.Tema = Tema

-- «rrggbb» a {r, g, b, 1}.
local function hex(h)
  return {
    tonumber(string.sub(h, 1, 2), 16) / 255,
    tonumber(string.sub(h, 3, 4), 16) / 255,
    tonumber(string.sub(h, 5, 6), 16) / 255,
    1,
  }
end

local HEX = {
  fondo = "191717",
  lateral = "272222",
  secundario = "232122",
  -- Group selector uses a distinct raised surface.
  selector = "423532",
  hundido = "110e0f",
  elegida = "3d2e27",
  pestanaElegida = "49372c",
  boton = "473832",
  botonApagado = "2c2524",
  borde = "775744",
  texto = "f5e8d4",
  textoPestana = "cbbeb1",
  apagado = "a99b8e",
  acento = "e6ac72",
  enlace = "d5a77d",
  enlaceApagado = "7a6353",
  marca = "ffd839",
  -- Empty radio buttons remain lighter than the surrounding iron plate.
  radioVacio = "352d2a",
  bordeRadio = "84644f",
  -- The title of an open selector uses its own raised color.
  tituloLista = "382e2a",
  -- Propio de SnetForever (el inventario de TSM no trae un rojo): borde de un campo cuyo texto no vale.
  error = "e5534b",
  oro = "dfbd0b",
  plata = "c9cfcf",
  cobre = "c08850",
  nivel1 = "fcf141",
  nivel2 = "bdaec6",
  nivel3 = "06a2cb",
  nivel4 = "ffb85c",
  nivel5 = "2fb8a0",
  base = "ffffff",
  -- B6r, propios (no salen del inventario de TSM): los tramos del tiempo que le queda a una subasta y del % frente al
  -- valor de mercado en la vista de resultados.
  verde = "4cbf63",
  naranja = "f0962e",
  amarillo = "e6d24a",
  rojo = "e5534b",
  azul = "4aa3e8",
}
Tema.HEX = HEX

local COLORES = {}
for token, h in pairs(HEX) do
  COLORES[token] = hex(h)
end

function Tema.color(token)
  local c = COLORES[token]
  if not c then
    error("uso: Tema.color: token desconocido " .. tostring(token), 2)
  end
  return {c[1], c[2], c[3], c[4]}
end

function Tema.hex(token)
  if not HEX[token] then
    error("uso: Tema.hex: token desconocido " .. tostring(token), 2)
  end
  return HEX[token]
end

---------------------------------------------------------------------------------------------------
-- Letras
---------------------------------------------------------------------------------------------------

-- Font role, existing pixel size and native fallback for each commerce control.
local LETRA_JUEGO = "Fonts\\FRIZQT__.TTF"
local LETRA_JUEGO_TABLA = "Fonts\\ARIALN.TTF"
local LETRAS = {
  logo = {"heading", 16, LETRA_JUEGO},
  titulo = {"heading", 14, LETRA_JUEGO},
  pestana = {"control", 12, LETRA_JUEGO},
  etiqueta = {"control", 12, LETRA_JUEGO},
  texto = {"body", 12, LETRA_JUEGO},
  boton = {"control", 12, LETRA_JUEGO},
  tabla = {"body", 12, LETRA_JUEGO_TABLA},
  tablaNegrita = {"control", 12, LETRA_JUEGO_TABLA},
  mayusculas = {"control", 10, LETRA_JUEGO_TABLA},
  cabecera = {"control", 11, LETRA_JUEGO_TABLA},
}

Tema.TAMANOS = {}
for tipo, letra in pairs(LETRAS) do
  Tema.TAMANOS[tipo] = letra[2]
end

-- El alto de fila de las tablas sigue a la letra de las filas: TSM deja unas 1,9 veces su letra (filas de 18,3 a 19,7 px
-- con una letra de unos 10). Con la de 12, 22 px: la letra (unos 15 px de renglón) no se pisa con la fila de al lado.
Tema.ALTO_FILA = math.floor(LETRAS.tabla[2] * 1.85 + 0.5)

function Tema.letra(fs, tipo, tamano)
  local letra = LETRAS[tipo]
  if not letra then
    error("uso: Tema.letra: tipo desconocido " .. tostring(tipo), 2)
  end
  SNF.Estilo.forgeFont(fs, letra[1], tamano or letra[2], letra[3])
  -- Nítida: sin sombra (un cuadro de texto también la tiene).
  if fs.SetShadowOffset then
    fs:SetShadowOffset(0, 0)
  end
  return fs
end

---------------------------------------------------------------------------------------------------
-- Iconos
---------------------------------------------------------------------------------------------------

-- El orden es el del atlas (herramientas\texturas\generar.mjs): posición 0 = primera celda; 16 celdas por fila.
-- Keep the grid in sync with tools/texturas/generar.mjs.
local NOMBRES_ICONOS = {
  "copiar", "vinculo", "mas", "papelera", "lapiz", "importar", "exportar", "menu", "tilde", "restablecer", "operacion",
  "lupa", "carpeta", "abierto", "cerrado", "cerrar", "asa", "desplegar", "alerta", "circulo", "aro", "abrir",
  "puntos", "reloj", "pausa", "seguir", "leyendo", "sube", "baja", "masCirculo", "ventana", "intercambio",
  "expandirTodo",
}
local ATLAS_COLUMNAS, ATLAS_FILAS = 16, 4
Tema.ATLAS = "Interface\\AddOns\\SnetForever_Comercio\\recursos\\iconos"
Tema.ESQUINA = "Interface\\AddOns\\SnetForever_Comercio\\recursos\\esquina"

local ICONOS = {}
for n, nombre in ipairs(NOMBRES_ICONOS) do
  local columna, fila = (n - 1) % ATLAS_COLUMNAS, math.floor((n - 1) / ATLAS_COLUMNAS)
  -- izquierda, derecha, arriba, abajo (0..1)
  ICONOS[nombre] = {
    columna / ATLAS_COLUMNAS, (columna + 1) / ATLAS_COLUMNAS, fila / ATLAS_FILAS, (fila + 1) / ATLAS_FILAS,
  }
end

function Tema.icono(tex, nombre)
  local c = ICONOS[nombre]
  if not c then
    error("uso: Tema.icono: icono desconocido " .. tostring(nombre), 2)
  end
  tex:SetTexture(Tema.ATLAS)
  tex:SetTexCoord(c[1], c[2], c[3], c[4])
  return tex
end

-- El icono como texto («|T…|t»), para meterlo dentro de una línea (T1b: las flechas del % del tooltip). Sale del alto de
-- la letra y teñido con r, g, b (de 0 a 1; sin ellos, blanco).
function Tema.iconoTexto(nombre, r, g, b)
  local c = ICONOS[nombre]
  if not c then
    error("uso: Tema.iconoTexto: icono desconocido " .. tostring(nombre), 2)
  end
  local ancho, alto = ATLAS_COLUMNAS * 16, ATLAS_FILAS * 16
  local function canal(v)
    return math.floor((tonumber(v) or 1) * 255 + 0.5)
  end
  return string.format("|T%s:0:0:0:0:%d:%d:%d:%d:%d:%d:%d:%d:%d|t", Tema.ATLAS, ancho, alto,
    c[1] * ancho, c[2] * ancho, c[3] * alto, c[4] * alto, canal(r), canal(g), canal(b))
end

-- Los nombres de los iconos, en orden (para las pruebas y para enseñar la lista).
function Tema.nombresIconos()
  local copia = {}
  for i, nombre in ipairs(NOMBRES_ICONOS) do
    copia[i] = nombre
  end
  return copia
end

---------------------------------------------------------------------------------------------------
-- Dinero
---------------------------------------------------------------------------------------------------

-- El dinero sale de un solo sitio, SNF.Texto.dinero (el núcleo): con los colores del tema (HEX.oro, HEX.plata, HEX.cobre)
-- o sin ellos.
function Tema.dinero(cobre)
  return SNF.Texto.dinero(cobre, HEX)
end

function Tema.dineroPlano(cobre)
  return SNF.Texto.dinero(cobre)
end

-- El ancho del texto entero de un FontString (B2r ronda 1). Con un ancho (SetWidth, o anclado por los dos lados) el cliente
-- corta lo que no cabe y GetStringWidth da como mucho ese ancho; GetUnboundedStringWidth da el entero. Para decidir si un
-- texto cabe, o para dar a un marco el ancho de su texto, se mide con este. Sin GetUnboundedStringWidth (un cliente viejo),
-- GetStringWidth.
function Tema.anchoTexto(fs)
  if fs.GetUnboundedStringWidth then
    return fs:GetUnboundedStringWidth()
  end
  return fs:GetStringWidth()
end

---------------------------------------------------------------------------------------------------
-- Paneles
---------------------------------------------------------------------------------------------------

local RADIO = 3
local PLANO = "Interface\\Buttons\\WHITE8X8"

-- Una forma con esquinas: un centro, una franja arriba y otra abajo, y cuatro esquinas redondas. `margen` es lo que se
-- mete desde el borde del marco y `r` el radio de las esquinas. Devuelve la lista de texturas.
local function forma(marco, subnivel, margen, r)
  local lista = {}
  local function nueva(esquina)
    local t = marco:CreateTexture(nil, "BACKGROUND", nil, subnivel)
    t:SetTexture(esquina and Tema.ESQUINA or PLANO)
    lista[#lista + 1] = t
    return t
  end
  local centro = nueva()
  centro:SetPoint("TOPLEFT", marco, "TOPLEFT", margen, -(margen + r))
  centro:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", -margen, margen + r)
  local arriba = nueva()
  arriba:SetPoint("TOPLEFT", marco, "TOPLEFT", margen + r, -margen)
  arriba:SetPoint("TOPRIGHT", marco, "TOPRIGHT", -(margen + r), -margen)
  arriba:SetHeight(r)
  local abajo = nueva()
  abajo:SetPoint("BOTTOMLEFT", marco, "BOTTOMLEFT", margen + r, margen)
  abajo:SetPoint("BOTTOMRIGHT", marco, "BOTTOMRIGHT", -(margen + r), margen)
  abajo:SetHeight(r)
  -- esquina.tga es un cuarto de círculo con el vértice abajo a la derecha: se gira para cada esquina.
  local esquinas = {
    {"TOPLEFT", margen, -margen, 0, 1, 0, 1},
    {"TOPRIGHT", -margen, -margen, 1, 0, 0, 1},
    {"BOTTOMLEFT", margen, margen, 0, 1, 1, 0},
    {"BOTTOMRIGHT", -margen, margen, 1, 0, 1, 0},
  }
  for _, e in ipairs(esquinas) do
    local t = nueva(true)
    t:SetSize(r, r)
    t:SetPoint(e[1], marco, e[1], e[2], e[3])
    t:SetTexCoord(e[4], e[5], e[6], e[7])
  end
  return lista
end

local function pintar(lista, color)
  for _, t in ipairs(lista) do
    t:SetVertexColor(color[1], color[2], color[3], color[4])
  end
end

function Tema.panel(marco, token, opciones)
  local conBorde = opciones ~= nil and opciones.borde == true
  local panel = marco.snfTema
  if not panel then
    panel = {}
    marco.snfTema = panel
  end
  -- Cada llamada deja el panel como se pide. Sin borde, el fondo ocupa todo. Con borde, el borde es la forma entera y
  -- el fondo la misma forma metida 1 px, con esquinas un poco más cerradas. Las formas se crean la primera vez que
  -- hacen falta y después solo se enseñan o se esconden.
  local function poner(lista, visible)
    for _, t in ipairs(lista or {}) do
      if visible then t:Show() else t:Hide() end
    end
  end
  local fondo
  if conBorde then
    panel.borde = panel.borde or forma(marco, 0, 0, RADIO)
    panel.fondoMetido = panel.fondoMetido or forma(marco, 1, 1, RADIO - 1)
    fondo = panel.fondoMetido
    pintar(panel.borde, Tema.color(opciones.colorBorde or "borde"))
  else
    panel.fondoPleno = panel.fondoPleno or forma(marco, 1, 0, RADIO)
    fondo = panel.fondoPleno
  end
  poner(panel.borde, conBorde)
  poner(panel.fondoMetido, conBorde)
  poner(panel.fondoPleno, not conBorde)
  pintar(fondo, Tema.color(token))
  return marco
end
