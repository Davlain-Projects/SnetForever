-- SnetForever: tabla ordenable de la ventana de comercio (ventana de compra, tarea 2). Un componente suelto que usan la
-- lista, el sniper, el cuadro de cantidad y los escalones: cabeceras que ordenan, una fila elegida, filas que se abren
-- en subfilas y la rueda del ratón. No sabe nada de subastas: solo pinta las filas que se le dan.
--
-- TablaComercio.crear(padre, opciones) -> t
--   opciones.columnas = {{clave, titulo, ancho, justificado, valor = fn(fila) -> número|texto|nil,
--       pintar = fn(celda, fila, ancho)?, peso?}}
--       titulo es un texto o una función que lo da (para que siga el idioma). pintar llena la celda (un FontString) a su
--       manera; sin pintar, la celda enseña valor(fila). pintar recibe también el ancho de ahora de su columna. peso: ver
--       «Tabla que estira».
--   opciones.filasVisibles   cuántas filas caben (los huecos que se crean). Con estirar, las del principio.
--   opciones.estirar         true: la tabla mide lo que su marco (ver «Tabla que estira», abajo)
--   opciones.alPulsar(fila)  se llama al pulsar una fila (o subfila); la tabla ya la ha elegido
--   opciones.alAbrir(fila)   se llama al pulsar el botón +/- de una fila con subfilas
--   opciones.objeto(fila) -> enlace?, item?   B3s: la tabla es de objetos. El clic con tecla (Mayús o Ctrl, las que el
--                            jugador tenga puestas) en una fila, su subfila o su +/- va a UIComercio.clicModificado con lo
--                            que dé objeto(fila) (lo mismo que enseña su tooltip): enlace al chat o probador, y nada más:
--                            ni elige, ni abre o cierra, ni llama a alPulsar o alAbrir, ni toca la luz. Sin tecla, como
--                            siempre. Una fila sin objeto (un aviso) da nil: con tecla no hace nada.
--   opciones.orden = {clave, asc}   orden de salida (sin él, el de las filas tal cual llegan)
--   opciones.alOrdenar(clave, asc)  se llama cuando el jugador cambia el orden
--   opciones.alEntrar(fila, hueco) / opciones.alSalir(hueco)   ratón sobre una fila (para la ventanita de datos)
--   opciones.ejecutar(nombre, fn, ...)   cómo se protege cada script. Sin él se usa SNF.Comercio.ejecutar (un fallo apaga
--       el comercio y no el resto del addon); sin comercio, un pcall sin más.
-- Opciones que se encienden (B6r, la vista de resultados de la subasta, y desde la tarea S2 el sniper; la lista vieja no):
--   opciones.triangulos      true: la marca de abrir y cerrar es el triángulo ▸/▾ del atlas propio (Tema.icono «cerrado»
--                            y «abierto») en vez del +/- de Blizzard. B3r: una fila con fila.esperando = true (espera su
--                            lectura) lleva en su lugar ↻ (Tema.icono «leyendo»), quieto; sigue abriéndose al pulsarla.
--   opciones.separadores     true: una línea vertical de 1 px (color «linea» de la paleta) entre los títulos de las
--                            columnas (t.separadores[n], a la derecha de la columna n). Las filas no llevan.
--   opciones.menu = {ayuda = texto|fn, alPulsar = fn?}   el botón ⋮ (atlas «puntos») arriba a la izquierda de la
--                            cabecera, en la columna de los triángulos de las filas (t.menu). Sin alPulsar va apagado;
--                            ayuda es su tooltip. El título de la primera columna empieza tras él.
--   opciones.topeSubfilas = {n, fila = fn(fila, ocultas) -> subfila|nil}   de una fila abierta salen como mucho sus n
--                            primeras subfilas y, debajo, la que dé fila() (ocultas = las que no salen; 0 si salen todas).
--   col.icono                el nombre de un icono del atlas: el título es ese icono, centrado, en vez de texto (cab.icono).
--   col.ayuda                texto o función: el tooltip del título al pasar el ratón.
--   fila.elegible = false    pulsar esa fila no la elige ni llama a alPulsar (un aviso como «y N más…»).
-- Los tooltips de la tabla salen solo con el ratón y sin animación (solo Show).
--
-- Cada fila es una tabla con `clave` (única, también entre subfilas) y, si se puede abrir, `subfilas` (lista de filas con
-- clave). Las subfilas salen en el orden en que llegan, justo debajo de su fila, con sangría.
--
-- Métodos de t:
--   t:poner(filas, mantener?)  ordena y pinta; conserva la elegida y las abiertas por clave (la elegida que ya no está se
--                           suelta). Con mantener (revisión B7, menor 5: la vista de resultados mientras llega la búsqueda y
--                           con los nombres que llegan), las filas que ya se veían se quedan en su sitio y las nuevas van
--                           detrás, en el orden en que llegan: nada se mueve solo. Sin mantener, se ordena. Pulsar una
--                           cabecera (ordenarPor) ordena siempre.
--   t:olvidarOrden()        olvida lo que se veía: con mantener, todo en el orden en que llega (una búsqueda nueva).
--   Si se repinta con el ratón parado encima (poner, abrir, la rueda), alEntrar se vuelve a llamar con la fila que queda
--   debajo si es otra (por clave), y alSalir si ya no queda ninguna (revisión B7, menor 8): la ventanita no se queda con
--   la fila de antes. T1a, ronda 1 (sin parpadeos): alEntrar y alSalir van con el fondo del ratón (t._luz, ver «Colores del
--   fondo»), no con cada OnEnter/OnLeave: al cruzar de una fila a otra solo llega alEntrar con la nueva cuando se enciende,
--   alSalir solo cuando se apaga sin otra, y temblando en un borde no llega nada.
--   t:elegir(clave|nil)     t:elegida() -> clave | nil
--   t:abrir(clave, si)      abre o cierra las subfilas de una fila. t:estaAbierta(clave) -> boolean
--   t:ordenarPor(clave, asc?)  sin asc, pulsar la misma columna da la vuelta y una columna nueva va de menor a mayor
--   t:orden() -> clave, asc    (nada si no hay orden)
--   t:visible(i) -> fila | nil  la fila pintada en el hueco i, contando las subfilas abiertas
--   t:fila(i) -> fila | nil     la fila i del orden completo (con las subfilas abiertas contadas), sin depender del
--                               desplazamiento de la rueda
--   t:ajustar(ancho?, alto?, soloQuitar?)  solo con estirar: reparte el ancho y pone las filas que caben (sin medidas,
--                             mide el marco; con soloQuitar, ninguna nueva: el asa cogida, ver «Tabla que estira»). Lo
--                             llama la propia tabla; está a mano por si hace falta.
-- TablaComercio.arrastre(si)  el asa de la ventana se coge o se suelta (lo llama ui/subasta/ventana.lua).
--   t:anchoDe(clave) -> número   el ancho de ahora de una columna
--   t.marco, t.cabeceras[clave] (.fondo, .raya, .texto, .flecha, .icono?), t.huecos[i] (.fondo, .flecha, .abrir,
--   .celdas[clave]), t.separadores, t.menu y t.capaCabecera (el marco de los separadores y del ⋮, sobre los títulos)
--   (t.huecos son los huecos de ahora, del 1 al último que cabe; es siempre la misma lista aunque cambie cuántos hay)
--   (cabecera .flecha: textura ▲/▼ de la columna ordenada; fila .flecha: textura +/- o triángulo de abrir y cerrar)
--
-- Tabla que estira (opciones.estirar; tarea S1 del bloque B: el sniper y la lista vieja de ofertas). Quien la crea ancla
-- t.marco por dos esquinas (p. ej. TOPLEFT y BOTTOMRIGHT en su panel) y la tabla se ajusta sola cada vez que cambia el
-- tamaño de su marco (OnSizeChanged: el agarre de la ventana, la escala de interfaz...) y al enseñarse (OnShow: escondida
-- puede no enterarse de un cambio):
--   - Ancho: cada columna tiene como poco su `ancho`; lo que sobra se reparte según `peso` (sin peso, nada). Los anchos son
--     píxeles enteros y lo que queda del redondeo va a la columna de más peso. Si no cabe, cada una se queda en su `ancho`
--     (la ventana tiene un tamaño mínimo para que no pase).
--   - Alto: caben las filas de Tema.ALTO_FILA px (22) que deja el alto debajo de la cabecera (al menos una); las filas no
--     cambian de alto.
--     Los huecos que faltan se crean una sola vez (se guardan en t._todos) y los que sobran se esconden y salen de
--     t.huecos; al volver a crecer se reutilizan. Nunca se crean y se borran en cada fotograma.
--   - Solo se repinta si cambia algo (los anchos o cuántas filas caben), y en ese mismo momento: un hueco nuevo sale ya
--     pintado y uno que sobra se va de una vez, sin ir y venir (nada destella).
--   - Con el asa cogida (revisión B7, regla de interfaz): con el ratón parado justo donde cabe una fila más, el
--     temblor de la mano (1 px arriba y abajo en fotogramas seguidos) haría salir y esconderse la última fila. Por eso la
--     tabla sigue al asa, como el oro de la cabecera, y no al reloj: mientras se arrastra (TablaComercio.arrastre(true),
--     lo dice la ventana de la subasta al coger el asa) no sale ninguna fila nueva; solo se va la que deja de caber (una
--     fila nunca se sale del marco), y una vez ida no vuelve hasta soltar. Así cada fila cambia como mucho una vez por
--     arrastre. Las columnas sí siguen al ancho (no hacen salir ni esconder nada). Al soltar
--     (TablaComercio.arrastre(false)) se ponen las filas exactas que caben, una sola vez, en todas las tablas que estiran.
--   - Los cambios de tamaño que no vienen del asa (la escala, colocar la ventana) se aplican una vez, agrupados: en el
--     fotograma siguiente al aviso (un solo C_Timer.After(0) pendiente por tabla, así varios avisos de un fotograma dan un
--     solo cambio; nada en OnUpdate). Sin C_Timer, al momento. OnShow pone las filas exactas al momento.
-- Sin estirar, la tabla mide la suma de sus columnas por filasVisibles filas, como siempre (el cuadro de cantidad).
--
-- Cabecera (B3r): la columna que ordena va resaltada, además de su flecha y su raya: su fondo un 12 % más claro y su título
-- en el color del texto; los demás títulos, en gris («secundario»).
-- Colores del fondo de una fila (sobre el token «filas»): normal, ratón encima +5 %, elegida +5 %, elegida con ratón +8 %.
-- El «ratón encima» va con SNF.Piezas.interno.nuevaLuz (T1a, ronda 1, sin parpadeos; t._luz, una por tabla): sale enseguida al
-- entrar en la tabla, pero solo pasa a otra fila (o se apaga) cuando el ratón lleva un momento quieto en ella (o fuera).
-- Al cruzar de una fila a otra siempre hay una encendida, y temblando en un borde (entre dos filas, o en el de la última)
-- ningún fondo sale y se va en fotogramas seguidos.
-- Las filas sin valor en la columna ordenada van al final en los dos sentidos.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local TablaComercio = {}
SNF.TablaComercio = TablaComercio

local Estilo = SNF.Estilo

local floor = math.floor
local max, min = math.max, math.min

-- Alto de fila y de cabecera: el del tema, que sigue a la letra de las filas (B3r: 22 px con la letra «tabla» de 12; antes,
-- 20 px con ARIALN 11 y sombra). Las letras son las del tema: «tabla» en las celdas y «cabecera» en los títulos.
local ALTO = SNF.Tema.ALTO_FILA
local ALTO_RAYA = 2
local ANCHO_FLECHA = 14 -- sitio del botón +/- al principio de la primera columna
local SANGRIA = 12
local MARGEN_CELDA = 4
local PASO_RUEDA = 3
-- Las marcas son texturas de Blizzard: las letras ▲ ▼ ▸ ▾ no están en todas las fuentes del cliente.
local TEX_CERRADA, TEX_ABIERTA = "Interface\\Buttons\\UI-PlusButton-Up", "Interface\\Buttons\\UI-MinusButton-Up"
local TEX_ORDEN = "Interface\\Buttons\\UI-SortArrow"
local ANCHO_ORDEN, ALTO_ORDEN = 9, 8
local LADO_ABRIR = 12
-- Opciones que se encienden (B6r): triángulos ▸/▾ del atlas propio (Tema.icono «cerrado»/«abierto»), el botón ⋮ del atlas
-- («puntos»), los separadores de la cabecera y el icono de un título.
local LADO_TRIANGULO = 10
local LADO_MENU = 12
local LADO_ICONO_TITULO = 12
local MARGEN_SEPARADOR = 4 -- del borde de arriba y de abajo de la cabecera a cada separador
local SUBIR_CAPA = 5 -- niveles por encima de la tabla de la capa de la cabecera (separadores y ⋮, sobre los títulos)
-- Tabla que estira y asa de la ventana (ver «Tabla que estira»): si el asa está cogida y las tablas que estiran (claves
-- débiles: una tabla que ya nadie usa se va).
local arrastrando = false
local estirables = setmetatable({}, {__mode = "k"})

local function protegida(opciones, nombre, fn, ...)
  if opciones.ejecutar then
    return opciones.ejecutar(nombre, fn, ...)
  end
  if SNF.Comercio and SNF.Comercio.ejecutar then
    return SNF.Comercio.ejecutar(nombre, fn, ...)
  end
  return pcall(fn, ...)
end

-- La marca de abrir y cerrar de una fila: el triángulo del atlas (opciones.triangulos) o la textura +/- de Blizzard.
local function ponerMarca(t, tex, abierta, esperando)
  if t._opciones.triangulos then
    SNF.Tema.icono(tex, esperando and "leyendo" or abierta and "abierto" or "cerrado")
  else
    tex:SetTexture(abierta and TEX_ABIERTA or TEX_CERRADA)
  end
end

-- El tooltip de una pieza: una línea con el texto que da `ayuda()` (o nada). Solo Show: sin animación.
local function enseniarAyuda(dueno, ayuda)
  local tt = rawget(_G, "GameTooltip")
  local texto = type(ayuda) == "function" and ayuda() or ayuda
  if not texto or not tt or tt:IsForbidden() then
    return
  end
  tt:SetOwner(dueno, "ANCHOR_TOP")
  tt:SetText(texto, 1, 1, 1, 1, true)
  tt:Show()
end

local function esconderAyuda()
  local tt = rawget(_G, "GameTooltip")
  if tt and not tt:IsForbidden() then
    tt:Hide()
  end
end

local function textoDe(valor)
  if valor == nil then
    return ""
  end
  if type(valor) == "number" then
    if valor == floor(valor) then
      return string.format("%d", valor)
    end
    return tostring(valor)
  end
  return tostring(valor)
end

local function titulo(col)
  local t = col.titulo
  if type(t) == "function" then
    t = t()
  end
  return textoDe(t)
end

-- Compara dos valores de la misma columna: números como números y textos sin distinguir mayúsculas. Si uno es número y
-- el otro texto, los números van antes. Devuelve -1, 0 o 1.
local function comparar(a, b)
  local ta, tb = type(a), type(b)
  if ta ~= tb then
    return ta == "number" and -1 or 1
  end
  if ta ~= "number" then
    a, b = string.lower(tostring(a)), string.lower(tostring(b))
  end
  if a < b then
    return -1
  elseif a > b then
    return 1
  end
  return 0
end

---------------------------------------------------------------------------------------------------
-- Pintar
---------------------------------------------------------------------------------------------------

local function colorFila(t, hueco, fila)
  local elegida = fila ~= nil and fila.clave == t._elegida
  local pct = 0
  if elegida then
    pct = hueco.luz and 8 or 5
  elseif hueco.luz then
    pct = 5
  end
  return Estilo.aclarar(Estilo.comercio("filas"), pct)
end

local function pintarFondo(t, hueco)
  local c = colorFila(t, hueco, hueco.fila)
  hueco.fondo:SetVertexColor(c[1], c[2], c[3], c[4])
end

local function pintarCabeceras(t)
  for _, col in ipairs(t._columnas) do
    local cab = t.cabeceras[col.clave]
    local ordenada = t._ordenClave == col.clave
    local base = Estilo.comercio("cabecera")
    if ordenada then
      base = Estilo.aclarar(base, 12)
    end
    cab.fondo:SetVertexColor(base[1], base[2], base[3], base[4])
    local ct = Estilo.comercio(ordenada and "texto" or "secundario")
    cab.texto:SetTextColor(ct[1], ct[2], ct[3], ct[4])
    if ordenada then
      -- UI-SortArrow: (0, 0.5625, 0, 1) es la flecha hacia arriba y con el alto al revés, hacia abajo.
      if t._ordenAsc then
        cab.flecha:SetTexCoord(0, 0.5625, 0, 1)
      else
        cab.flecha:SetTexCoord(0, 0.5625, 1, 0)
      end
      cab.flecha:Show()
      local r = Estilo.comercio(t._ordenAsc and "acento" or "secundario")
      cab.raya:SetVertexColor(r[1], r[2], r[3], r[4])
      cab.raya:Show()
    else
      cab.raya:Hide()
      cab.flecha:Hide()
    end
    cab.texto:SetText(titulo(col))
  end
end

local function pintarHueco(t, i)
  local hueco = t.huecos[i]
  local entrada = t._plano[t._desplazamiento + i]
  if not entrada then
    hueco.fila = nil
    hueco.raton = false
    hueco._dentro = 0
    if t._luz.encendida == hueco or t._luz.destino == hueco then
      t._luz:apagar()
    end
    hueco:Hide()
    return
  end
  local fila = entrada.fila
  hueco.fila = fila
  hueco.nivel = entrada.nivel
  hueco:Show()
  pintarFondo(t, hueco)
  local reserva = t._hayAbribles and ANCHO_FLECHA or 0
  local x = 0
  for n, col in ipairs(t._columnas) do
    local celda = hueco.celdas[col.clave]
    local anchoCol = t._anchos[n]
    local dentro = x + MARGEN_CELDA
    local ancho = anchoCol - 2 * MARGEN_CELDA
    if n == 1 then
      local sangria = reserva + entrada.nivel * SANGRIA
      dentro = dentro + sangria
      ancho = ancho - sangria
    end
    celda:ClearAllPoints()
    celda:SetPoint("LEFT", hueco, "LEFT", dentro, 0)
    celda:SetWidth(max(1, ancho))
    if col.pintar then
      celda:SetText("")
      col.pintar(celda, fila, anchoCol)
    else
      celda:SetText(textoDe(col.valor and col.valor(fila)))
    end
    x = x + anchoCol
  end
  if fila.subfilas and entrada.nivel == 0 then
    ponerMarca(t, hueco.flecha, t._abiertas[fila.clave], fila.esperando == true)
    hueco.abrir:Show()
  else
    hueco.abrir:Hide()
  end
end

local function pintar(t)
  pintarCabeceras(t)
  for i = 1, #t.huecos do
    pintarHueco(t, i)
  end
end

---------------------------------------------------------------------------------------------------
-- Orden y lista plana
---------------------------------------------------------------------------------------------------

local function columnaDe(t, clave)
  for _, col in ipairs(t._columnas) do
    if col.clave == clave then
      return col
    end
  end
  return nil
end

-- Con mantener: las filas que ya se veían (t._ordenVisto) en su sitio y las nuevas detrás, en el orden en que llegan.
local function mantenidas(t, lista)
  local sitio = {}
  for i, clave in ipairs(t._ordenVisto) do
    sitio[clave] = i
  end
  local entradas = {}
  for i, fila in ipairs(lista) do
    entradas[i] = {fila = fila, i = i, s = sitio[fila.clave]}
  end
  table.sort(entradas, function(a, b)
    if a.s and b.s then
      return a.s < b.s
    elseif a.s or b.s then
      return a.s ~= nil
    end
    return a.i < b.i
  end)
  for i, e in ipairs(entradas) do
    lista[i] = e.fila
  end
end

-- Las filas en el orden vigente. Las que no tienen valor en la columna ordenada, al final en los dos sentidos. Con
-- t._mantener (poner con mantener), el orden de lo que ya se veía. Apunta el orden que sale (t._ordenVisto).
local function ordenadas(t)
  local lista = {}
  for i, fila in ipairs(t._filas) do
    lista[i] = fila
  end
  local col = t._ordenClave and columnaDe(t, t._ordenClave)
  if t._mantener and t._ordenVisto then
    mantenidas(t, lista)
  elseif col and col.valor then
    local entradas = {}
    for i, fila in ipairs(lista) do
      entradas[i] = {fila = fila, i = i, v = col.valor(fila)}
    end
    local asc = t._ordenAsc
    table.sort(entradas, function(a, b)
      if a.v == nil or b.v == nil then
        if a.v == nil and b.v == nil then
          return a.i < b.i
        end
        return b.v == nil
      end
      local c = comparar(a.v, b.v)
      if c == 0 then
        return a.i < b.i
      end
      if asc then
        return c < 0
      end
      return c > 0
    end)
    for i, e in ipairs(entradas) do
      lista[i] = e.fila
    end
  end
  local visto = {}
  for i, fila in ipairs(lista) do
    visto[i] = fila.clave
  end
  t._ordenVisto = visto
  return lista
end

-- La lista de lo que se ve: cada fila y, si está abierta, sus subfilas debajo. Con opciones.topeSubfilas, como mucho
-- las n primeras y, después, la fila que dé tope.fila(fila, ocultas) (si da alguna).
local function aplanar(t)
  local plano = {}
  local tope = t._opciones.topeSubfilas
  for _, fila in ipairs(ordenadas(t)) do
    plano[#plano + 1] = {fila = fila, nivel = 0}
    if fila.subfilas and t._abiertas[fila.clave] then
      local total = #fila.subfilas
      local hasta = total
      if tope and tope.n and total > tope.n then
        hasta = tope.n
      end
      for i = 1, hasta do
        plano[#plano + 1] = {fila = fila.subfilas[i], nivel = 1}
      end
      local extra = tope and tope.fila and tope.fila(fila, total - hasta) or nil
      if extra then
        plano[#plano + 1] = {fila = extra, nivel = 1}
      end
    end
  end
  t._plano = plano
  local sobran = #plano - #t.huecos
  t._desplazamiento = min(max(0, t._desplazamiento), max(0, sobran))
end

-- Aplana y pinta. Bajo el ratón parado puede quedar otra fila (revisión B7, menor 8): se avisa con la nueva (alEntrar) si
-- su clave es otra (o siempre, con `siempre`: la rueda), y si ya no queda ninguna, alSalir.
local function repintar(t, siempre)
  local o = t._opciones
  -- Ronda 1: la fila del ratón es la de la luz (si su hueco se queda sin fila, pintarHueco la apaga y llega alSalir).
  local h = t._luz.encendida
  local antes = h and h.fila and h.fila.clave
  aplanar(t)
  pintar(t)
  if h and t._luz.encendida == h and h.fila and o.alEntrar and (siempre or h.fila.clave ~= antes) then
    o.alEntrar(h.fila, h)
  end
end

local function existe(t, clave)
  if clave == nil then
    return false
  end
  for _, fila in ipairs(t._filas) do
    if fila.clave == clave then
      return true
    end
    for _, sub in ipairs(fila.subfilas or {}) do
      if sub.clave == clave then
        return true
      end
    end
  end
  return false
end

---------------------------------------------------------------------------------------------------
-- Métodos
---------------------------------------------------------------------------------------------------

local Metodos = {}

function Metodos:poner(filas, mantener)
  self._filas = filas or {}
  self._mantener = mantener and true or false
  self._hayAbribles = false
  for _, fila in ipairs(self._filas) do
    if fila.subfilas then
      self._hayAbribles = true
    end
  end
  if self._elegida ~= nil and not existe(self, self._elegida) then
    self._elegida = nil
  end
  repintar(self)
end

function Metodos:olvidarOrden()
  self._ordenVisto = {}
end

function Metodos:elegir(clave)
  self._elegida = clave
  for i = 1, #self.huecos do
    pintarFondo(self, self.huecos[i])
  end
end

function Metodos:elegida()
  return self._elegida
end

function Metodos:abrir(clave, si)
  if clave == nil then
    return
  end
  self._abiertas[clave] = si and true or nil
  repintar(self)
end

function Metodos:estaAbierta(clave)
  return clave ~= nil and self._abiertas[clave] == true
end

function Metodos:ordenarPor(clave, asc)
  if asc == nil then
    if self._ordenClave == clave then
      asc = not self._ordenAsc
    else
      asc = true
    end
  end
  self._ordenClave = clave
  self._ordenAsc = asc and true or false
  self._ordenVisto = nil -- el jugador ordena: se ordena de verdad (y lo que salga es lo que se mantiene después)
  repintar(self)
  if self._opciones.alOrdenar then
    protegida(self._opciones, "tabla", self._opciones.alOrdenar, clave, self._ordenAsc)
  end
end

function Metodos:orden()
  if self._ordenClave == nil then
    return nil
  end
  return self._ordenClave, self._ordenAsc
end

function Metodos:visible(i)
  local entrada = self._plano[self._desplazamiento + i]
  return entrada and entrada.fila or nil
end

function Metodos:fila(i)
  local entrada = self._plano[i]
  return entrada and entrada.fila or nil
end

function Metodos:desplazar(delta)
  self._desplazamiento = self._desplazamiento + delta
  repintar(self, true) -- bajo el ratón hay ahora otra fila: se avisa de nuevo con la fila nueva
end

---------------------------------------------------------------------------------------------------
-- Crear
---------------------------------------------------------------------------------------------------

-- La cabecera de una columna. Su ancho y su sitio los pone colocarCabeceras.
local function crearCabecera(t, col)
  local opciones = t._opciones
  local cab = CreateFrame("Button", nil, t.marco)
  cab:SetHeight(ALTO)
  cab:EnableMouse(true)
  cab.fondo = cab:CreateTexture(nil, "BACKGROUND")
  cab.fondo:SetAllPoints(cab)
  cab.fondo:SetTexture(Estilo.TEXTURA)
  cab.raya = cab:CreateTexture(nil, "OVERLAY")
  cab.raya:SetTexture(Estilo.TEXTURA)
  cab.raya:SetHeight(ALTO_RAYA)
  cab.raya:SetPoint("TOPLEFT", cab, "TOPLEFT", 0, 0)
  cab.raya:SetPoint("TOPRIGHT", cab, "TOPRIGHT", 0, 0)
  cab.raya:Hide()
  cab.texto = SNF.Tema.letra(cab:CreateFontString(nil, "OVERLAY"), "cabecera")
  cab.flecha = cab:CreateTexture(nil, "OVERLAY")
  cab.flecha:SetTexture(TEX_ORDEN)
  cab.flecha:SetSize(ANCHO_ORDEN, ALTO_ORDEN)
  cab.flecha:Hide()
  cab.texto:SetJustifyH(col.justificado or "LEFT")
  cab.texto:SetWordWrap(false)
  -- col.icono: el título es un icono del atlas (Tema.icono) en vez de texto, en el centro de la columna.
  if col.icono then
    cab.icono = cab:CreateTexture(nil, "OVERLAY")
    cab.icono:SetSize(LADO_ICONO_TITULO, LADO_ICONO_TITULO)
    cab.icono:SetPoint("CENTER", cab, "CENTER", 0, 0)
    SNF.Tema.icono(cab.icono, col.icono)
    local ci = Estilo.comercio("texto")
    cab.icono:SetVertexColor(ci[1], ci[2], ci[3], ci[4])
  end
  -- Con el botón ⋮, el título de la primera columna empieza tras él (alineado con los nombres de las filas).
  local desplazar = (opciones.menu and t._columnas[1] == col) and ANCHO_FLECHA or 0
  if col.justificado == "RIGHT" then
    -- Columna pegada a la derecha: la flecha en el borde y el título a su izquierda.
    cab.flecha:SetPoint("RIGHT", cab, "RIGHT", -MARGEN_CELDA, 0)
    cab.texto:SetPoint("RIGHT", cab.flecha, "LEFT", -3, 0)
  else
    -- El título a la izquierda y la flecha a su derecha.
    cab.texto:SetPoint("LEFT", cab, "LEFT", MARGEN_CELDA + desplazar, 0)
    cab.flecha:SetPoint("LEFT", cab.texto, "RIGHT", 3, 0)
  end
  local c = Estilo.comercio("texto")
  cab.texto:SetTextColor(c[1], c[2], c[3], c[4])
  cab:SetScript("OnClick", function()
    protegida(opciones, "tabla", function()
      t:ordenarPor(col.clave)
    end)
  end)
  -- col.ayuda (texto o función): tooltip al pasar el ratón por el título.
  if col.ayuda then
    cab:SetScript("OnEnter", function(self)
      protegida(opciones, "tabla", enseniarAyuda, self, col.ayuda)
    end)
    cab:SetScript("OnLeave", function()
      protegida(opciones, "tabla", esconderAyuda)
    end)
  end
  return cab
end

-- B3s: el clic con tecla (Mayús o Ctrl, las del jugador) en una tabla de objetos (opciones.objeto) es del objeto de la fila:
-- lo lleva UIComercio.clicModificado (un solo sitio para todas). true = no se hace nada más. Sin opciones.objeto, false.
local function conTecla(opciones, fila)
  local UI = rawget(SNF, "UIComercio")
  if not (opciones.objeto and fila and UI and UI.clicModificado) then
    return false
  end
  return UI.clicModificado(opciones.objeto(fila))
end

local function crearHueco(t, i)
  local opciones = t._opciones
  local hueco = CreateFrame("Button", nil, t.marco)
  hueco:SetHeight(ALTO)
  hueco:SetPoint("TOPLEFT", t.marco, "TOPLEFT", 0, -ALTO - (i - 1) * ALTO)
  hueco:SetPoint("TOPRIGHT", t.marco, "TOPRIGHT", 0, -ALTO - (i - 1) * ALTO)
  hueco:EnableMouse(true)
  hueco.raton = false
  hueco.fondo = hueco:CreateTexture(nil, "BACKGROUND")
  hueco.fondo:SetAllPoints(hueco)
  hueco.fondo:SetTexture(Estilo.TEXTURA)
  hueco.celdas = {}
  for n, col in ipairs(t._columnas) do
    local role = col.justificado == "RIGHT" and "tablaNegrita" or "tabla"
    local celda = SNF.Tema.letra(hueco:CreateFontString(nil, "OVERLAY"), role)
    celda:SetJustifyH(col.justificado or "LEFT")
    celda:SetWordWrap(false) -- un nombre largo se recorta: nunca se parte en dos renglones (la fila mide Tema.ALTO_FILA)
    local c = Estilo.comercio("texto")
    celda:SetTextColor(c[1], c[2], c[3], c[4])
    hueco.celdas[col.clave] = celda
    hueco.celdas[n] = celda
  end
  -- Abrir y cerrar: un botón pequeño al principio de la fila con una textura + o -.
  hueco.abrir = CreateFrame("Button", nil, hueco)
  hueco.abrir:SetSize(ANCHO_FLECHA, ALTO)
  hueco.abrir:SetPoint("LEFT", hueco, "LEFT", 2, 0)
  hueco.abrir:EnableMouse(true)
  hueco.flecha = hueco.abrir:CreateTexture(nil, "OVERLAY")
  ponerMarca(t, hueco.flecha, false)
  if opciones.triangulos then
    hueco.flecha:SetSize(LADO_TRIANGULO, LADO_TRIANGULO)
    local c = Estilo.comercio("texto")
    hueco.flecha:SetVertexColor(c[1], c[2], c[3], c[4])
  else
    hueco.flecha:SetSize(LADO_ABRIR, LADO_ABRIR)
  end
  hueco.flecha:SetPoint("CENTER", hueco.abrir, "CENTER", 0, 0)
  hueco.abrir:Hide()
  hueco._dentro = 0
  hueco.abrir:SetScript("OnClick", function()
    protegida(opciones, "tabla", function()
      local fila = hueco.fila
      if conTecla(opciones, fila) then
        return -- B3s: con tecla, el triángulo tampoco abre ni cierra
      end
      if fila and fila.subfilas then
        t:abrir(fila.clave, not t._abiertas[fila.clave])
        if opciones.alAbrir then
          opciones.alAbrir(fila)
        end
      end
    end)
  end)
  hueco:SetScript("OnClick", function()
    protegida(opciones, "tabla", function()
      local fila = hueco.fila
      if conTecla(opciones, fila) then
        return -- B3s: con tecla, el clic es del objeto: ni se elige ni avisa
      end
      if fila and fila.elegible ~= false then -- una fila con elegible = false (un aviso) ni se elige ni avisa
        t:elegir(fila.clave)
        if opciones.alPulsar then
          opciones.alPulsar(fila)
        end
      end
    end)
  end)
  -- El botón de abrir está encima del hueco: al pasar de uno a otro el hueco recibe OnLeave. Se cuenta cuántos de los dos
  -- tienen el ratón (sea cual sea el orden en que lleguen) y el hueco solo «sale» cuando no queda ninguno.
  local function entrar()
    protegida(opciones, "tabla", function()
      hueco._dentro = hueco._dentro + 1
      if hueco._dentro == 1 then
        hueco.raton = true
        t._luz:mover(hueco) -- alEntrar llega con la luz
      end
    end)
  end
  local function salir()
    protegida(opciones, "tabla", function()
      hueco._dentro = max(0, hueco._dentro - 1)
      if hueco._dentro == 0 then
        hueco.raton = false
        if t._luz.destino == hueco then -- si ya entró en otra fila (OnEnter antes que este OnLeave), la luz va a esa
          t._luz:mover(nil) -- alSalir llega con la luz, cuando se apaga
        end
      end
    end)
  end
  hueco:SetScript("OnEnter", entrar)
  hueco:SetScript("OnLeave", salir)
  hueco.abrir:SetScript("OnEnter", entrar)
  hueco.abrir:SetScript("OnLeave", salir)
  hueco:Hide()
  return hueco
end

---------------------------------------------------------------------------------------------------
-- Tamaño (tabla que estira)
---------------------------------------------------------------------------------------------------

-- Los anchos de las columnas para un ancho total: cada una su mínimo y lo que sobra según su peso, en píxeles enteros.
local function repartir(columnas, total)
  local anchos, minimo, pesos, mayor = {}, 0, 0, nil
  for n, col in ipairs(columnas) do
    anchos[n] = col.ancho
    minimo = minimo + col.ancho
    local peso = col.peso or 0
    pesos = pesos + peso
    if peso > 0 and (mayor == nil or peso > (columnas[mayor].peso or 0)) then
      mayor = n
    end
  end
  local sobra = floor(total + 0.001) - minimo
  if sobra <= 0 or pesos <= 0 then
    return anchos
  end
  local dado = 0
  for n, col in ipairs(columnas) do
    local parte = floor(sobra * (col.peso or 0) / pesos)
    anchos[n] = anchos[n] + parte
    dado = dado + parte
  end
  anchos[mayor] = anchos[mayor] + (sobra - dado) -- lo que queda del redondeo
  return anchos
end

-- Pone cada cabecera en su sitio, una detrás de otra, con el ancho de ahora (y los separadores en sus bordes).
local function colocarCabeceras(t)
  local x = 0
  for n, col in ipairs(t._columnas) do
    local cab = t.cabeceras[col.clave]
    cab:SetWidth(t._anchos[n])
    cab:ClearAllPoints()
    cab:SetPoint("TOPLEFT", t.marco, "TOPLEFT", x, 0)
    x = x + t._anchos[n]
    local s = t.separadores[n]
    if s then
      s:ClearAllPoints()
      s:SetPoint("TOPLEFT", t.marco, "TOPLEFT", x - 1, -MARGEN_SEPARADOR)
    end
  end
end

-- La capa de la cabecera (opciones.separadores u opciones.menu): un marco sin ratón por encima de los títulos con las
-- líneas finas entre columnas (1 px, el color «linea» de la paleta) y el botón ⋮ arriba a la izquierda, sobre la columna
-- de los triángulos de las filas. El ⋮ va apagado si no hay menu.alPulsar; menu.ayuda es su tooltip.
local function crearCapaCabecera(t)
  local opciones = t._opciones
  if not (opciones.separadores or opciones.menu) then
    return
  end
  local capa = CreateFrame("Frame", nil, t.marco)
  capa:SetPoint("TOPLEFT", t.marco, "TOPLEFT", 0, 0)
  capa:SetPoint("TOPRIGHT", t.marco, "TOPRIGHT", 0, 0)
  capa:SetHeight(ALTO)
  capa:SetFrameLevel(t.marco:GetFrameLevel() + SUBIR_CAPA)
  t.capaCabecera = capa
  if opciones.separadores then
    local c = Estilo.comercio("linea")
    for n = 1, #t._columnas - 1 do
      local s = capa:CreateTexture(nil, "OVERLAY")
      s:SetTexture(Estilo.TEXTURA)
      s:SetVertexColor(c[1], c[2], c[3], c[4])
      s:SetSize(1, ALTO - 2 * MARGEN_SEPARADOR)
      t.separadores[n] = s
    end
  end
  local menu = opciones.menu
  if menu then
    local alPulsar = menu.alPulsar and function()
      protegida(opciones, "tabla", menu.alPulsar)
    end or nil
    local b = SNF.Piezas.botonIcono(capa, "puntos", alPulsar, {tamano = LADO_MENU, color = "texto"})
    b:SetPoint("CENTER", t.marco, "TOPLEFT", 2 + ANCHO_FLECHA / 2, -ALTO / 2)
    b:ponerApagado(menu.alPulsar == nil)
    local entrar, salir = b:GetScript("OnEnter"), b:GetScript("OnLeave")
    b:SetScript("OnEnter", function(self, ...)
      entrar(self, ...)
      protegida(opciones, "tabla", enseniarAyuda, self, menu.ayuda)
    end)
    b:SetScript("OnLeave", function(self, ...)
      salir(self, ...)
      protegida(opciones, "tabla", esconderAyuda)
    end)
    t.menu = b
  end
end

-- Deja n huecos en t.huecos: crea los que falten (una sola vez) y esconde los que sobran.
local function ponerHuecos(t, n)
  for i = 1, n do
    if not t._todos[i] then
      t._todos[i] = crearHueco(t, i)
    end
    t.huecos[i] = t._todos[i]
  end
  for i = #t.huecos, n + 1, -1 do
    local hueco = t.huecos[i]
    hueco.fila = nil
    hueco.raton = false
    hueco._dentro = 0
    if t._luz.encendida == hueco or t._luz.destino == hueco then
      t._luz:apagar()
    end
    hueco:Hide()
    t.huecos[i] = nil
  end
end

-- t:ajustar(ancho?, alto?, soloQuitar?): con soloQuitar (el asa cogida), ninguna fila nueva: solo se va la que ya no cabe.
-- Sin él, las filas exactas que caben.
function Metodos:ajustar(ancho, alto, soloQuitar)
  if ancho == nil or alto == nil then
    ancho, alto = self.marco:GetWidth(), self.marco:GetHeight()
  end
  if type(ancho) ~= "number" or type(alto) ~= "number" or ancho <= 0 or alto <= 0 then
    return -- aún sin medidas: ya llegará otro aviso
  end
  local anchos = repartir(self._columnas, ancho)
  local filas = max(1, floor((alto - ALTO) / ALTO + 0.001))
  if soloQuitar then
    filas = min(filas, #self.huecos)
  end
  local cambia = filas ~= #self.huecos
  for n = 1, #anchos do
    if anchos[n] ~= self._anchos[n] then
      cambia = true
    end
  end
  if not cambia then
    return
  end
  self._anchos = anchos
  colocarCabeceras(self)
  ponerHuecos(self, filas)
  repintar(self)
end

function Metodos:anchoDe(clave)
  for n, col in ipairs(self._columnas) do
    if col.clave == clave then
      return self._anchos[n]
    end
  end
  return nil
end

-- El asa de la ventana se coge (true) o se suelta (false). Al soltar, cada tabla que estira pone las filas exactas que
-- caben, una sola vez (ver «Tabla que estira»).
function TablaComercio.arrastre(si)
  local antes = arrastrando
  arrastrando = si and true or false
  if antes and not arrastrando then
    for t in pairs(estirables) do
      protegida(t._opciones, "tabla", function()
        t:ajustar()
      end)
    end
  end
end

function TablaComercio.crear(padre, opciones)
  local t = {
    _opciones = opciones,
    _columnas = opciones.columnas,
    _filas = {},
    _plano = {},
    _abiertas = {},
    _elegida = nil,
    _desplazamiento = 0,
    _hayAbribles = false,
    cabeceras = {},
    huecos = {},
    _todos = {}, -- todos los huecos creados: los de t.huecos y los que sobran, escondidos
    _anchos = {}, -- el ancho de ahora de cada columna
    separadores = {}, -- con opciones.separadores: la línea a la derecha de cada columna menos la última
  }
  if opciones.orden and opciones.orden.clave ~= nil then
    t._ordenClave = opciones.orden.clave
    t._ordenAsc = opciones.orden.asc ~= false
  end
  for nombre, fn in pairs(Metodos) do
    t[nombre] = fn
  end
  -- El tooltip va con la luz (ronda 1): alEntrar con la fila que se enciende; alSalir solo cuando se apaga sin otra. Puede
  -- llegar desde el C_Timer de la luz: va protegido.
  t._luz = SNF.Piezas.interno.nuevaLuz(function(antes, nuevo)
    protegida(opciones, "tabla", function()
      if antes then
        antes.luz = false
        pintarFondo(t, antes)
      end
      if nuevo then
        nuevo.luz = true
        pintarFondo(t, nuevo)
        if nuevo.fila and opciones.alEntrar then
          opciones.alEntrar(nuevo.fila, nuevo)
        end
      elseif antes and opciones.alSalir then
        opciones.alSalir(antes) -- se va con el ratón encima: fuera la ventanita
      end
    end)
  end, function(hueco)
    -- Ronda 2: el ratón vuelve a la fila encendida y el tooltip no es suyo (se lo quedó otra tabla): se le vuelve a dar.
    protegida(opciones, "tabla", function()
      local tt = rawget(_G, "GameTooltip")
      if hueco.fila and opciones.alEntrar and not (tt and tt:IsShown() and tt:GetOwner() == hueco) then
        opciones.alEntrar(hueco.fila, hueco)
      end
    end)
  end)

  local ancho = 0
  for n, col in ipairs(t._columnas) do
    ancho = ancho + col.ancho
    t._anchos[n] = col.ancho
  end
  local visibles = opciones.filasVisibles or 10
  t.marco = CreateFrame("Frame", nil, padre)
  -- Ronda 2: al esconderse la tabla (se cierra la ventana) la luz se apaga y lo pendiente se cancela.
  t.marco:SetScript("OnHide", function()
    protegida(opciones, "tabla", function()
      t._luz:apagar()
    end)
  end)
  if not opciones.estirar then
    t.marco:SetSize(ancho, ALTO + visibles * ALTO) -- con estirar, el tamaño lo dan los anclajes de quien la crea
  end
  t.marco:EnableMouseWheel(true)
  t.marco:SetScript("OnMouseWheel", function(_, delta)
    protegida(opciones, "tabla", function()
      t:desplazar(delta > 0 and -PASO_RUEDA or PASO_RUEDA)
    end)
  end)

  for _, col in ipairs(t._columnas) do
    t.cabeceras[col.clave] = crearCabecera(t, col)
  end
  crearCapaCabecera(t)
  colocarCabeceras(t)
  ponerHuecos(t, visibles)
  pintarCabeceras(t)
  if opciones.estirar then
    -- OnShow: las filas exactas. OnSizeChanged: con el asa cogida, solo se quitan las que no caben (las columnas sí siguen
    -- al ancho); si no, las exactas en el fotograma siguiente, una vez aunque lleguen varios avisos (un solo C_Timer).
    estirables[t] = true
    local temporizador = rawget(_G, "C_Timer")
    local esperando = false -- hay un C_Timer pendiente para poner las filas exactas
    t.marco:SetScript("OnSizeChanged", function()
      protegida(opciones, "tabla", function()
        if arrastrando then
          t:ajustar(nil, nil, true)
        elseif type(temporizador) == "table" and type(temporizador.After) == "function" then
          if not esperando then
            esperando = true
            temporizador.After(0, function()
              esperando = false
              protegida(opciones, "tabla", function()
                if not arrastrando then -- si el asa se ha cogido entretanto, las exactas llegan al soltar
                  t:ajustar()
                end
              end)
            end)
          end
        else
          t:ajustar()
        end
      end)
    end)
    t.marco:SetScript("OnShow", function()
      protegida(opciones, "tabla", function()
        t:ajustar(nil, nil, arrastrando)
      end)
    end)
  end
  return t
end
