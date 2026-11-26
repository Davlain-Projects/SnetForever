-- SnetForever: cuadro de cantidad de la ventana de comercio (ventana de compra, tarea 5). Es el cuadro «Confirmar pedido» de
-- una mercancía: el jugador elige cuántas unidades compra y confirma. Solo imita cómo se porta el cuadro de otros addons de
-- subasta; no copia nada de ellos.
--
-- Se abre desde el botón Comprar de la barra (ui/comercio.lua) cuando la compra preparada es una mercancía «lista»: el
-- botón abre el cuadro EN VEZ de comprar. Un objeto suelto no lo abre y se compra como siempre.
-- Forma (B2r, punto 5: más cerca del «Order Confirmation» de TSM, sin copiar nada suyo): centrado sobre la ventana, con un
-- velo oscuro detrás que la tapa. El título centrado arriba y una X arriba a la derecha (cierra y cancela, como Escape).
-- The quantity dialog uses the same Forge font roles as the results.
--   Izquierda (de arriba abajo, a MARGEN del borde y alineado a su derecha): el objeto en su caja (icono y nombre en el
--              color de su calidad); «Cantidad:» con su campo y debajo los botones rápidos 1 / 5 / 20 / Máx (para comprar
--              1 enseguida); «Precio de la unidad: X (N%)», con el % frente al valor de mercado en el color de su tramo
--              (UIComercio.pctMercado y tokenPct, los de la columna % de resultados); «Precio total: X», exacto; el aviso
--              de precio, corto y en una línea; y abajo el único botón principal, ancho, que dice la cantidad y el total
--              exactos (si no cabe, UIComercio.etiquetaConImporte lo redondea hacia abajo).
--              B3s: Mayús + clic en el objeto (icono o nombre) pone su enlace en el chat y Ctrl + clic lo enseña en el
--              probador (UIComercio.clicModificado, el de todas las filas de objeto); no cambia nada del cuadro.
--   Derecha:   la tabla de escalones (precio, cantidad y %, con su color); pulsar un escalón pone la cantidad acumulada
--              hasta él.
-- Todo sale de SNF.Compra: la cantidad la pone Compra.ponerCantidad (recortada a 1..Compra.maxCantidad), los escalones son
-- Compra.escalones y el cuadro se repinta con SNF_COMERCIO_COMPRA. La ÚNICA llamada que compra es SNF.Compra.pulsar() desde
-- el OnClick del botón principal (lo pulsa el jugador): «Comprar N por X» pide el precio real; «Confirmar N por X» (en rojo
-- si el precio ha subido o la compra pasa del aviso de oro) compra. El cuadro no compra ni confirma nunca por su cuenta.
-- Al quedar hecha la compra, o si se acaba o se cambia la elegida por otra cosa, el cuadro se cierra sin tocarla.
-- La X, Escape y cerrar() lo cierran y descartan la compra (si estaba a medio confirmar, se cancela en el servidor).
-- El cuadro se cierra también cuando se va la ventana: al ocultarse la raíz de ui/comercio.lua (vista de Blizzard, cerrar la
-- subasta), con SNF_COMERCIO_APAGADO y con SNF_COMERCIO_CERRADA (con pcall, así que también con el comercio apagado), y
-- la X funciona aunque el comercio esté apagado. Al abrirse oculta el engranaje y el velo y el cuadro quedan por encima.
-- En combate el botón principal va apagado con un tooltip y no hace nada; al empezar el combate el cuadro se cierra (la
-- compra a medio confirmar la cancela comercio/compra.lua; al salir no se vuelve a abrir nada solo).
-- Con GetMoney() < total el botón principal sale apagado y .aviso (en rojo) dice cuánto falta; si el total pasa de lo normal
-- de la app (SNF.Precios.de(item).normal × cantidad), el botón sale en rojo y .aviso lo dice: el segundo clic es el de
-- confirmar (el primero pide el precio real), como con el aviso de oro.
--
-- Desde la vista de resultados de la subasta (B6r, punto 10) se abre con abrir({sinRojo = true}): por defecto la cantidad de
-- la subasta elegida, como mucho lo que hay a su precio o menos (Compra.maxCantidad), y nada se pinta de rojo: si el juego
-- cotiza más que lo enseñado, .aviso lo dice en el color del texto («antes X, ahora Y») y hace falta pulsar Confirmar.
-- El aviso solo cambia con la respuesta al clic del jugador; nunca parpadea ni cambia solo.
--
-- CantidadComercio.abrir(opciones?) -> boolean   abre el cuadro con la mercancía «lista» (o por confirmar). false si no hay
--                                       ninguna. opciones.sinRojo: lo de la vista de resultados (arriba).
-- CantidadComercio.cerrar()             lo cierra y descarta la compra (como la X).
-- CantidadComercio.abierto() -> boolean
-- CantidadComercio.marco() -> marco | nil   el cuadro (nil hasta la primera vez que se abre): .velo, .titulo, .cerrar (la X,
--                                       con .icono), .objeto (la caja del objeto), .icono, .nombre, .zonaObjeto (T1a:
--                                       recoge el ratón sobre el icono y el nombre: el tooltip del objeto),
--                                       .etiquetaCantidad, .caja (EditBox), .rapidos[1|5|20|"max"] (botones con .texto),
--                                       .etiquetaUnidad, .unidad, .etiquetaTotal, .total, .aviso, .comprar (con .fondo y
--                                       .texto) y .escalones (la tabla).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local CantidadComercio = {}
SNF.CantidadComercio = CantidadComercio

local Estilo = SNF.Estilo
local Tema = SNF.Tema
local TablaComercio = SNF.TablaComercio
local L = SNF.L

-- B3r: con la letra nueva del tema (Montserrat Medium 12), la columna izquierda pasa de 280 a 312 px («Precio de la unidad:»
-- y un importe largo con su %, y los avisos, caben en una línea) y la tabla de escalones de 252 a 228 (cabe «12345g 67s 89c»
-- y el título «Cantidad» con su flecha). El cuadro, de 580 a 588: sigue cabiendo en la ventana de comercio al mínimo.
local ANCHO, ALTO = 588, 270
local MARGEN = 14
local BORDE_X, LADO_X = 8, 20 -- la X: a 8 px de arriba y de la derecha
local ARRIBA = 40 -- de arriba a la caja del objeto y a los escalones
local IZQUIERDA = 312 -- ancho de la columna izquierda (la caja del objeto, los precios y Comprar; B3r: antes 280)
local ALTO_OBJETO, LADO_ICONO = 40, 28
local ANCHO_CAJA, ALTO_CAJA = 90, 24
local ANCHO_RAPIDO, ALTO_RAPIDO = 46, 22
local ALTO_TEXTO = 16
local ALTO_BOTON = 28
local ANCHO_COMPRAR = IZQUIERDA
local MARGEN_TEXTO_BOTON = 16 -- el texto de Comprar deja 8 px a cada lado
local FILAS_ESCALONES = 8
local ALFA_VELO = 0.6
local ALFA_BLOQUEADO = 0.55
local NIVEL_ENCIMA = 30 -- niveles por encima de la ventana: el velo queda sobre el engranaje y todo lo suyo
local TEXTURA = "Interface\\Buttons\\WHITE8X8"
local ICONO_DESCONOCIDO = "Interface\\Icons\\INV_Misc_QuestionMark"
local NOMBRE = "SnetForeverCantidadComercio"
local RAPIDOS = {1, 5, 20, "max"}
local ROJO_TEXTO = {1, 1, 1, 1}
local ESTRATO = "FULLSCREEN_DIALOG" -- por encima de la subasta, de nuestra ventana y de su engranaje (DIALOG)

local marco = nil
local itemAbierto = nil -- la mercancía que enseña el cuadro (nil = cerrado)
local sinDescartar = false -- true mientras se cierra sin tocar la compra (hecha, o ya no es la elegida)
local sinRojo = false -- abierto desde la vista de resultados: nada en rojo y el aviso de que el precio ha subido

---------------------------------------------------------------------------------------------------
-- Ayudas
---------------------------------------------------------------------------------------------------

local function ejecutar(nombre, fn, ...)
  if SNF.Comercio and SNF.Comercio.ejecutar then
    return SNF.Comercio.ejecutar(nombre, fn, ...)
  end
  return pcall(fn, ...)
end

-- Un script del cuadro: un fallo apaga el comercio y no el resto del addon.
local function protegido(fn)
  return function(...)
    return ejecutar("cantidad", fn, ...)
  end
end

-- Para lo que tiene que ir aunque el comercio se haya apagado (Cancelar): con el comercio en marcha pasa por el
-- cortafuegos; apagado, con un pcall sin más.
local function siempre(fn)
  return function(...)
    if SNF.Comercio and SNF.Comercio.activo() then
      return ejecutar("cantidad", fn, ...)
    end
    return pcall(fn, ...)
  end
end

local function compra()
  return rawget(SNF, "Compra")
end

local function ponerColor(fs, c)
  fs:SetTextColor(c[1], c[2], c[3], c[4] or 1)
end

local function dinero(cobre)
  return SNF.UIComercio.dinero(cobre)
end

-- Fondo opaco con un color del tema de comercio y borde de 1 px (el mismo de la ventana).
local panel = Estilo.panelComercio

local function pintarFondo(m, c)
  m.fondo:SetVertexColor(c[1], c[2], c[3], c[4] or 1)
end

-- Un texto con la letra del tema (Tema.letra: titulo, texto o boton), de una sola línea y sin sombra (B3r: nítida, como
-- todas las del tema).
local function texto(padre, tipo, justificado)
  local fs = padre:CreateFontString(nil, "OVERLAY")
  Tema.letra(fs, tipo)
  fs:SetJustifyH(justificado or "LEFT")
  fs:SetWordWrap(false)
  ponerColor(fs, Estilo.comercio("texto"))
  return fs
end

-- Un renglón de la columna izquierda: de MARGEN a su borde derecho, centrado en y (desde arriba), con su alto fijo.
local function renglon(m, fs, y)
  fs:SetPoint("LEFT", m, "TOPLEFT", MARGEN, -y)
  fs:SetSize(IZQUIERDA, ALTO_TEXTO)
end

-- Un botón liso del tema de comercio: fondo de color y texto.
local function boton(padre, ancho, alto, tipo, token, alPulsar, envoltorio)
  local b = CreateFrame("Button", nil, padre)
  b:SetSize(ancho, alto)
  b:EnableMouse(true)
  panel(b, token)
  b.token = token
  b.texto = texto(b, tipo, "CENTER")
  b.texto:SetPoint("CENTER", b, "CENTER", 0, 0)
  b:SetScript("OnClick", (envoltorio or protegido)(function(self)
    alPulsar(self)
  end))
  -- Un doble clic no es una segunda orden: el segundo clic va a OnDoubleClick (vacío) y no a OnClick.
  b:SetScript("OnDoubleClick", function() end)
  b:SetScript("OnEnter", function(self)
    if self.token and self:IsEnabled() then
      pintarFondo(self, Estilo.aclarar(Estilo.comercio(self.token), 5))
    end
  end)
  b:SetScript("OnLeave", function(self)
    if self.token then
      pintarFondo(self, Estilo.comercio(self.token))
    end
  end)
  return b
end

---------------------------------------------------------------------------------------------------
-- Pintar
---------------------------------------------------------------------------------------------------

local function estadoDeLaMercancia()
  local c = compra()
  local e = c and c.estado() or nil
  if e and e.tipo == "mercancia" and e.item == itemAbierto then
    return e
  end
  return nil
end

-- Cierra el cuadro. `descartar`: además, suelta la compra (Cancelar y Escape); sin ello se queda como esté.
local function cerrarCuadro(descartar)
  if not marco or not itemAbierto then
    return
  end
  sinDescartar = not descartar
  marco:Hide() -- OnHide hace el resto (el velo, y descartar si toca)
  sinDescartar = false
end

local function tablaEscalones()
  local lista = {}
  local max = compra().maxCantidad()
  local desde = 0
  for i, f in ipairs(compra().escalones()) do
    lista[i] = {clave = i, precio = f.precio, n = f.n, acumulado = f.acumulado, fuera = desde >= max,
      pct = SNF.UIComercio.pctMercado(itemAbierto, f.precio)}
    desde = f.acumulado
  end
  return lista
end

-- El precio normal de la app de ese objeto (cobre por unidad), o nil si no lo sabe.
local function precioNormal(item)
  local precios = rawget(SNF, "Precios")
  local p = precios and precios.de(item)
  if type(p) == "table" and type(p.normal) == "number" and p.normal > 0 then
    return p.normal
  end
  return nil
end

local function pintar()
  local e = estadoDeLaMercancia()
  if not e or (e.fase ~= "lista" and e.fase ~= "confirmar" and e.fase ~= "comprando") then
    cerrarCuadro(false) -- hecha, error, descartada o cambiada por otra: el cuadro ya no pinta nada
    return
  end
  local n = e.cantidad or 0
  if not marco.caja:HasFocus() then
    marco.caja:SetText(string.format("%d", n))
  end
  marco.total:SetText(dinero(e.total or 0))
  -- «X (N%)»: el % frente al valor de mercado, en el color de su tramo (sin valor de mercado, solo el precio).
  local pct = SNF.UIComercio.pctMercado(itemAbierto, e.precioUnit)
  if pct then
    local color = "|cff" .. Tema.hex(SNF.UIComercio.tokenPct(pct))
    marco.unidad:SetText(L.t("COMERCIO_CANT_UNIDAD_PCT", dinero(e.precioUnit or 0),
      color .. SNF.UIComercio.textoPct(pct) .. "|r"))
  else
    marco.unidad:SetText(dinero(e.precioUnit or 0))
  end
  -- Los escalones: el de la cantidad elegida queda marcado y los que pasan del máximo se ven apagados.
  local filas = tablaEscalones()
  marco.escalones:poner(filas)
  local elegida = nil
  for _, f in ipairs(filas) do
    if f.acumulado >= n then
      elegida = f.clave
      break
    end
  end
  marco.escalones:elegir(elegida)
  -- El botón principal.
  local b = marco.comprar
  local activo = e.fase == "lista" or e.fase == "confirmar"
  -- Sin oro para el total: el botón sale apagado y el cuadro dice cuánto falta. Más caro que lo normal de la app: en rojo.
  local falta = (e.total or 0) - (tonumber(GetMoney()) or 0)
  local sinOro = activo and falta > 0
  local normal = precioNormal(itemAbierto)
  local caro = activo and not sinOro and normal ~= nil and (e.total or 0) > normal * n
  local subio = sinRojo and e.fase == "confirmar" and e.subio and not sinOro
  -- Ronda 1 de B6r: no cabían todas a su precio (fila exacta) y la compra volvió con las que quedan.
  local quedan = e.quedan and e.fase == "lista" and not sinOro
  if sinOro then
    marco.aviso:SetText(L.t("COMERCIO_CANT_SIN_ORO", dinero(falta)))
  elseif quedan then
    marco.aviso:SetText(L.t("COMERCIO_CANT_QUEDAN", SNF.Texto.numero(e.quedan)))
  elseif subio then
    marco.aviso:SetText(L.t("COMERCIO_CANT_SUBIO", dinero(e.totalAntes or 0), dinero(e.total or 0)))
  elseif caro then
    marco.aviso:SetText(L.t("COMERCIO_CANT_CARO", dinero(normal)))
  end
  ponerColor(marco.aviso, Estilo.comercio(sinRojo and "texto" or "rojo"))
  marco.aviso:SetShown(sinOro or quedan or subio or caro)
  -- En combate no se compra ni se confirma: el botón va apagado y gris (con su tooltip) y Compra.pulsar lo rechaza por
  -- dentro. Se mira la marca de los eventos (Compra.combate()): PLAYER_REGEN_DISABLED llega antes que InCombatLockdown().
  local combate = compra().combate()
  local puede = activo and not e.bloqueada and not sinOro and not combate
  local etiqueta
  if e.fase == "lista" then
    etiqueta = SNF.UIComercio.etiquetaConImporte(e.total or 0, b.texto, ANCHO_COMPRAR - MARGEN_TEXTO_BOTON, function(x) return L.t("COMERCIO_CANT_COMPRAR", n, x) end)
  elseif e.fase == "confirmar" then
    etiqueta = SNF.UIComercio.etiquetaConImporte(e.total or 0, b.texto, ANCHO_COMPRAR - MARGEN_TEXTO_BOTON, function(x) return L.t("COMERCIO_CANT_CONFIRMAR", n, x) end)
  else
    etiqueta = L.t("COMERCIO_BOTON_COMPRANDO")
  end
  b.texto:SetText(etiqueta)
  local rojo = not sinRojo and activo and (e.subio or e.aviso or caro) and true or false
  local fondo, letra
  if not activo or sinOro or combate then
    fondo, letra = Estilo.comercio("cabecera"), Estilo.comercio("secundario")
    b.token = nil
  elseif rojo then
    fondo, letra = Estilo.comercio("rojo"), ROJO_TEXTO
    b.token = "rojo"
  else
    fondo, letra = Estilo.comercio("acento"), Estilo.comercio("acentoTexto")
    b.token = "acento"
  end
  b.rojo = rojo
  if activo and not puede and not sinOro and not combate and not sinRojo then
    -- (desde resultados no: el botón no cambia solo de luz al acabar el medio segundo; Compra.pulsar rechaza el clic igual)
    fondo[4] = ALFA_BLOQUEADO -- recién cambiado lo que pide: se ve, pero medio segundo no acepta clics
  end
  pintarFondo(b, fondo)
  ponerColor(b.texto, letra)
  if puede then
    b:Enable()
  else
    b:Disable()
  end
  -- La X: no con una compra ya pedida al servidor.
  local libre = not (e.fase == "comprando" and e.esperando == "compra")
  if libre then
    marco.cerrar:Enable()
  else
    marco.cerrar:Disable()
  end
  local cx = Estilo.comercio(libre and "texto" or "secundario")
  marco.cerrar.icono:SetVertexColor(cx[1], cx[2], cx[3], cx[4] or 1)
  -- Los botones rápidos y la caja cambian la cantidad: valen mientras se puede cambiar.
  local cambia = e.fase == "lista" or e.fase == "confirmar"
  for _, k in ipairs(RAPIDOS) do
    local r = marco.rapidos[k]
    if cambia then
      r:Enable()
    else
      r:Disable()
    end
    ponerColor(r.texto, cambia and Estilo.comercio("texto") or Estilo.comercio("secundario"))
  end
end

-- El oro cambia con el cuadro abierto: se vuelve a mirar si llega para el total.
local function alCambiarDinero()
  if marco and itemAbierto then
    ejecutar("cantidad", pintar)
  end
end

local function textosFijos()
  marco.titulo:SetText(L.t("COMERCIO_CANT_TITULO"))
  marco.etiquetaCantidad:SetText(L.t("COMERCIO_CANT_CANTIDAD"))
  marco.etiquetaUnidad:SetText(L.t("COMERCIO_CANT_PRECIO_UNIDAD"))
  marco.etiquetaTotal:SetText(L.t("COMERCIO_CANT_PRECIO_TOTAL"))
  marco.rapidos.max.texto:SetText(L.t("COMERCIO_CANT_MAX"))
end

local function pintarObjeto()
  local ui = SNF.UIComercio
  local nombre, calidad = ui.nombreYCalidad(itemAbierto)
  marco.nombre:SetText(nombre)
  ponerColor(marco.nombre, ui.colorCalidad(calidad))
  marco.icono:SetTexture(SNF.API.iconoObjeto(itemAbierto) or ICONO_DESCONOCIDO)
end

---------------------------------------------------------------------------------------------------
-- Lo que hace el jugador
---------------------------------------------------------------------------------------------------

local function ponerCantidad(n)
  local c = compra()
  if c then
    c.ponerCantidad(n)
  end
  -- Pulsar un botón o una fila no quita el foco a la caja: si el jugador había escrito algo sin pulsar Intro, la caja
  -- enseña ya la cantidad real y se suelta (un Intro después no aplica lo escrito antes).
  local caja = marco.caja
  if caja:HasFocus() then
    local e = estadoDeLaMercancia()
    caja:SetText(string.format("%d", e and e.cantidad or 1))
    caja:ClearFocus()
  end
  pintar()
end

-- Lo escrito en la caja: un entero de 1 en adelante (más del máximo se recorta); otra cosa vuelve a la última cantidad
-- buena. Escribir lo mismo que ya hay no toca la compra (a medio confirmar la cancelaría).
local function aplicarCaja()
  if not itemAbierto then
    return
  end
  local e = estadoDeLaMercancia()
  local escrito = string.match(marco.caja:GetText() or "", "^%s*(%d+)%s*$")
  local n = escrito and tonumber(escrito) or nil
  if e and n and n >= 1 and n ~= e.cantidad then
    compra().ponerCantidad(n)
  end
  e = estadoDeLaMercancia()
  marco.caja:SetText(e and string.format("%d", e.cantidad or 1) or "1")
  pintar()
end

-- Suelta la compra de esa mercancía si sigue siendo la elegida (Cancelar y Escape).
local function descartar(item)
  local c = compra()
  local e = c and c.estado() or nil
  if e and e.tipo == "mercancia" and e.item == item then
    c.cancelar()
  end
end

---------------------------------------------------------------------------------------------------
-- Crear
---------------------------------------------------------------------------------------------------

local function crear()
  local velo = CreateFrame("Frame", nil, UIParent)
  velo:SetFrameStrata(ESTRATO)
  velo:EnableMouse(true) -- el velo se come los clics: la ventana de detrás no se toca
  local fondoVelo = velo:CreateTexture(nil, "BACKGROUND")
  fondoVelo:SetTexture(TEXTURA)
  fondoVelo:SetAllPoints(velo)
  fondoVelo:SetVertexColor(0, 0, 0, ALFA_VELO)
  velo:Hide()

  local m = CreateFrame("Frame", NOMBRE, velo)
  SNF.WindowSizing.register(m, NOMBRE, true)
  marco = m
  m.velo = velo
  m:SetSize(ANCHO, ALTO)
  m:SetFrameStrata(ESTRATO)
  m:EnableMouse(true)
  panel(m, "fondo")

  m.titulo = texto(m, "titulo", "CENTER")
  m.titulo:SetPoint("TOP", m, "TOP", 0, -12)
  m.titulo:SetSize(ANCHO - 2 * (BORDE_X + LADO_X + 8), ALTO_TEXTO)

  -- La X de arriba a la derecha: cierra y descarta la compra, como Escape (funciona aunque el comercio esté apagado).
  local x = CreateFrame("Button", nil, m)
  x:SetSize(LADO_X, LADO_X)
  x:SetPoint("TOPRIGHT", m, "TOPRIGHT", -BORDE_X, -BORDE_X)
  x:EnableMouse(true)
  x.icono = x:CreateTexture(nil, "ARTWORK")
  x.icono:SetSize(12, 12)
  x.icono:SetPoint("CENTER", x, "CENTER", 0, 0)
  Tema.icono(x.icono, "cerrar")
  x:SetScript("OnClick", siempre(function()
    cerrarCuadro(true)
  end))
  x:SetScript("OnDoubleClick", function() end)
  SNF.Piezas.ayuda(x, SNF.Piezas.ayudaDe("COMMERCE_CLOSE_PURCHASE"))
  m.cerrar = x

  -- Izquierda: el objeto en su caja (icono y nombre en el color de su calidad).
  local objeto = CreateFrame("Frame", nil, m)
  objeto:SetSize(IZQUIERDA, ALTO_OBJETO)
  objeto:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN, -ARRIBA)
  panel(objeto, "filas")
  m.objeto = objeto
  m.icono = objeto:CreateTexture(nil, "ARTWORK")
  m.icono:SetSize(LADO_ICONO, LADO_ICONO)
  m.icono:SetPoint("LEFT", objeto, "LEFT", 6, 0)
  m.icono:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  m.nombre = texto(objeto, "titulo")
  m.nombre:SetPoint("LEFT", m.icono, "RIGHT", 8, 0)
  m.nombre:SetSize(IZQUIERDA - 6 - LADO_ICONO - 8 - 8, ALTO_TEXTO)
  -- T1a: con el ratón sobre el icono o el nombre sale el tooltip del objeto (UIComercio.tooltipObjeto, por su id: una
  -- mercancía no trae sufijo), y al salir se va. La zona solo recoge el ratón; no se ve.
  local zona = CreateFrame("Frame", nil, objeto)
  zona:SetAllPoints(objeto)
  zona:EnableMouse(true)
  zona:SetScript("OnEnter", function(self)
    if itemAbierto then
      pcall(SNF.UIComercio.tooltipObjeto, self, {item = itemAbierto})
    end
  end)
  zona:SetScript("OnLeave", function(self)
    pcall(SNF.UIComercio.esconderTooltipObjeto, self)
  end)
  -- B3s: Mayús + clic en el icono o el nombre pone el enlace del objeto en el chat y Ctrl + clic lo enseña en el probador
  -- (UIComercio.clicModificado, el de todas las filas). Sin tecla, el clic no hace nada (como antes); con tecla, solo eso.
  zona:SetScript("OnMouseUp", function(_, boton)
    if itemAbierto and (boton == nil or boton == "LeftButton") then
      pcall(SNF.UIComercio.clicModificado, nil, itemAbierto)
    end
  end)
  m.zonaObjeto = zona

  -- «Cantidad:» y su campo, alineado a la derecha de la columna; debajo, los botones rápidos.
  local yCantidad = ARRIBA + ALTO_OBJETO + 10 + ALTO_CAJA / 2
  m.etiquetaCantidad = texto(m, "texto")
  renglon(m, m.etiquetaCantidad, yCantidad)
  m.etiquetaCantidad:SetWidth(IZQUIERDA - ANCHO_CAJA - 8)

  local cajaMarco = CreateFrame("Frame", nil, m)
  cajaMarco:SetSize(ANCHO_CAJA, ALTO_CAJA)
  cajaMarco:SetPoint("RIGHT", m, "TOPLEFT", MARGEN + IZQUIERDA, -yCantidad)
  panel(cajaMarco, "filas")
  local caja = CreateFrame("EditBox", nil, cajaMarco)
  caja:SetPoint("TOPLEFT", cajaMarco, "TOPLEFT", 6, -1)
  caja:SetPoint("BOTTOMRIGHT", cajaMarco, "BOTTOMRIGHT", -6, 1)
  caja:SetAutoFocus(false)
  caja:SetMultiLine(false)
  caja:SetMaxLetters(5)
  Tema.letra(caja, "texto")
  ponerColor(caja, Estilo.comercio("texto"))
  caja:SetScript("OnEnterPressed", protegido(function(self)
    aplicarCaja()
    self:ClearFocus()
  end))
  caja:SetScript("OnEditFocusLost", protegido(function()
    aplicarCaja()
  end))
  caja:SetScript("OnEscapePressed", protegido(function(self)
    cerrarCuadro(true) -- Escape dentro de la caja también cierra el cuadro y descarta la compra
    self:ClearFocus()
  end))
  m.caja = caja

  local yRapidos = yCantidad + ALTO_CAJA / 2 + 6
  local anchoRapidos = #RAPIDOS * ANCHO_RAPIDO + (#RAPIDOS - 1) * 4
  m.rapidos = {}
  for i, k in ipairs(RAPIDOS) do
    local b = boton(m, ANCHO_RAPIDO, ALTO_RAPIDO, "boton", "cabecera", function()
      local c = compra()
      ponerCantidad(k == "max" and (c and c.maxCantidad() or 0) or k)
    end)
    b:SetPoint("TOPLEFT", m, "TOPLEFT", MARGEN + IZQUIERDA - anchoRapidos + (i - 1) * (ANCHO_RAPIDO + 4), -yRapidos)
    b.texto:SetText(k == "max" and "" or string.format("%d", k))
    m.rapidos[k] = b
  end

  -- «Precio de la unidad: X (N%)» y «Precio total: X»: el rótulo a la izquierda y el valor a la derecha de la columna.
  local yUnidad = yRapidos + ALTO_RAPIDO + 14
  m.etiquetaUnidad = texto(m, "texto")
  renglon(m, m.etiquetaUnidad, yUnidad)
  m.unidad = texto(m, "tablaNegrita", "RIGHT")
  renglon(m, m.unidad, yUnidad)
  m.etiquetaTotal = texto(m, "texto")
  renglon(m, m.etiquetaTotal, yUnidad + 24)
  m.total = texto(m, "tablaNegrita", "RIGHT")
  renglon(m, m.total, yUnidad + 24)
  -- El aviso (sin oro, más caro que lo normal…), corto y en una línea, sobre el botón principal.
  m.aviso = texto(m, "texto")
  renglon(m, m.aviso, yUnidad + 48)
  ponerColor(m.aviso, Estilo.comercio("rojo"))
  m.aviso:Hide()

  -- Derecha: la tabla de escalones (precio, cantidad y %).
  m.escalones = TablaComercio.crear(m, {
    columnas = {
      {clave = "precio", titulo = function() return L.t("COMERCIO_COL_PRECIO") end, ancho = 106, justificado = "RIGHT",
        valor = function(f) return f.precio end,
        pintar = function(celda, f)
          celda:SetText(dinero(f.precio))
          ponerColor(celda, Estilo.comercio(f.fuera and "secundario" or "texto"))
        end},
      {clave = "n", titulo = function() return L.t("COMERCIO_COL_CANTIDAD") end, ancho = 72, justificado = "RIGHT",
        valor = function(f) return f.n end,
        pintar = function(celda, f)
          celda:SetText(string.format("%d", f.n))
          ponerColor(celda, Estilo.comercio(f.fuera and "secundario" or "texto"))
        end},
      {clave = "pct", titulo = function() return L.t("COMERCIO_COL_PCT") end, ancho = 50, justificado = "RIGHT",
        valor = function(f) return f.pct end,
        pintar = function(celda, f)
          if f.pct then
            celda:SetText(SNF.UIComercio.textoPct(f.pct))
            ponerColor(celda, Tema.color(SNF.UIComercio.tokenPct(f.pct)))
          else
            celda:SetText("")
          end
        end},
    },
    filasVisibles = FILAS_ESCALONES,
    orden = {clave = "precio", asc = true},
    ejecutar = ejecutar,
    alPulsar = function(f)
      ponerCantidad(f.acumulado)
    end,
  })
  m.escalones.marco:SetPoint("TOPRIGHT", m, "TOPRIGHT", -MARGEN, -ARRIBA)

  -- La única llamada que compra: una orden por clic del jugador, y nunca en combate.
  m.comprar = boton(m, ANCHO_COMPRAR, ALTO_BOTON, "boton", "acento", function()
    if not SNF.Compra.combate() then
      SNF.Compra.pulsar()
    end
  end)
  m.comprar.texto:SetWidth(ANCHO_COMPRAR - MARGEN_TEXTO_BOTON)
  local entrarComprar, salirComprar = m.comprar:GetScript("OnEnter"), m.comprar:GetScript("OnLeave")
  m.comprar:SetScript("OnEnter", function(self, ...)
    entrarComprar(self, ...)
    local tt = rawget(_G, "GameTooltip")
    if SNF.Compra.combate() and tt and not tt:IsForbidden() then
      tt:SetOwner(self, "ANCHOR_TOP")
      tt:SetText(L.t("COMERCIO_EN_COMBATE"), 1, 1, 1, 1, true)
      tt:Show()
    end
  end)
  m.comprar:SetScript("OnLeave", function(self, ...)
    salirComprar(self, ...)
    local tt = rawget(_G, "GameTooltip")
    if tt and not tt:IsForbidden() then
      tt:Hide()
    end
  end)
  m.comprar:SetPoint("BOTTOMLEFT", m, "BOTTOMLEFT", MARGEN, MARGEN)

  m:SetScript("OnHide", function()
    local fue = itemAbierto
    itemAbierto = nil
    velo:Hide()
    SNF.Eventos.dejar("PLAYER_MONEY", alCambiarDinero)
    if fue and not sinDescartar then
      ejecutar("cantidad", descartar, fue)
    end
  end)
  table.insert(UISpecialFrames, NOMBRE) -- Escape lo cierra (y OnHide descarta la compra)
  m:Hide()
end

---------------------------------------------------------------------------------------------------
-- Interfaz
---------------------------------------------------------------------------------------------------

function CantidadComercio.abrir(opciones)
  local c = compra()
  local e = c and SNF.Comercio.activo() and c.estado() or nil
  if not e or e.tipo ~= "mercancia" or (e.fase ~= "lista" and e.fase ~= "confirmar") then
    return false
  end
  return (ejecutar("cantidad", function()
    if not marco then
      crear()
    end
    itemAbierto = e.item
    sinRojo = type(opciones) == "table" and opciones.sinRojo == true
    local ventana = SNF.UIComercio.marco()
    local centro = ventana or UIParent
    marco.velo:ClearAllPoints()
    marco.velo:SetAllPoints(centro)
    marco:ClearAllPoints()
    marco:SetPoint("CENTER", centro, "CENTER", 0, 0)
    -- El engranaje de la ventana se cierra y el velo y el cuadro quedan por encima de todo lo de la ventana.
    if ventana and ventana.ajustes then
      ventana.ajustes:Hide()
    end
    local nivel = (ventana and ventana:GetFrameLevel() or 0) + NIVEL_ENCIMA
    marco.velo:SetFrameLevel(nivel)
    marco:SetFrameLevel(nivel + 1)
    SNF.Eventos.escuchar("PLAYER_MONEY", alCambiarDinero)
    textosFijos()
    pintarObjeto()
    marco.velo:Show()
    marco:Show()
    pintar()
  end))
end

function CantidadComercio.cerrar()
  cerrarCuadro(true)
end

function CantidadComercio.abierto()
  return marco ~= nil and itemAbierto ~= nil and marco:IsShown()
end

function CantidadComercio.marco()
  return marco
end

-- Si se va la ventana (se apaga el comercio o se cierra la subasta) el cuadro se cierra siempre, aunque el comercio ya no
-- deje pasar nada por el cortafuegos: de ahí el pcall.
local function cerrarSiempre()
  pcall(cerrarCuadro, true)
end
SNF.Eventos.escuchar("SNF_COMERCIO_APAGADO", cerrarSiempre)
-- Al empezar el combate el cuadro se cierra sin tocar la compra: si estaba a medio confirmar, comercio/compra.lua la
-- cancela («error» combate); al salir no se vuelve a abrir nada solo.
SNF.Eventos.escuchar("PLAYER_REGEN_DISABLED", function()
  SNF.Compra.enCombate = true -- la marca del combate (comercio/compra.lua), por si este oyente va antes
  pcall(cerrarCuadro, false)
end)
SNF.Eventos.escuchar("SNF_COMERCIO_CERRADA", cerrarSiempre)

-- Cada cambio de la compra repinta el cuadro (o lo cierra si ya no hay nada que enseñar).
SNF.Eventos.escuchar("SNF_COMERCIO_COMPRA", function()
  if marco and itemAbierto then
    ejecutar("cantidad", pintar)
  end
end)
