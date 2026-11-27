-- SnetForever: la pestaña Sniper de nuestra ventana de la subasta, parte 3, bloque B (tarea S2). Es la página «sniper» de
-- SNF.SubastaVentana. Tiene la misma distribución que el sniper de TSM (sniper-tsm.png y sniper-tsm-2.png), sin copiar nada
-- suyo: todo está dibujado y escrito por nosotros. Los datos son los de SNF.Sniper (comercio/sniper.lua), que solo busca:
-- nunca compra solo.
--
-- Parado (el sniper no arranca solo): solo el botón «Empezar» (240 × 32) en el centro. Al pulsarlo empieza y sale la vista
-- (marcos.vista), que se queda hasta «‹ Salir del escaneo» o hasta cerrar la subasta:
--   - Arriba, una sola fila, 8 px bajo la cabecera y de 22 px de alto, con 12 px a cada borde:
--       «‹ Salir del escaneo» a la izquierda, en «acento» y sin recuadro (como en la vista de resultados): para el sniper,
--       suelta la compra elegida aquí y vuelve a Navegar.
--       El título «Sniper de compra», centrado en la página y en blanco (letra «titulo»).
--       «Reiniciar» a la derecha: oscuro con borde fino, como «Vista de Blizzard» (22 px de alto, Montserrat Medium de
--       11 y 14 px de relleno a cada lado). SNF.Sniper.reiniciar(): vacía lo encontrado y vuelve a la primera vuelta.
--   - La tabla (TablaComercio con estirar), con su marco fino (Estilo.panelComercio «filas»: borde de 1 px), 8 px bajo la
--     fila de arriba y 8 px sobre la barra de abajo, con 12 px a cada lado. Las opciones de B6r: triángulos, ⋮ apagado,
--     separadores y orden al pulsar una cabecera. Columnas: (!) (con el ⋮ y el triángulo de las filas delante), Objeto
--     (icono y nombre en el color de su calidad), Niv., Ctd, Compra (objeto), % y Foto (F1: «navegar 14:32», de dónde sale
--     el precio y a qué hora se leyó; ver la excepción en comercio/sniper.lua): las de la vista de resultados menos el
--     reloj, el vendedor y la puja. La búsqueda general que lee el sniper no trae vendedor, ni puja ni tiempo: sin el dato
--     no hay columna (la tarea lo pide para el vendedor; ronda 1, decisión del coordinador: también la puja, y sus 112 px
--     pasan al Objeto).
--       (!) marca lo que está muy por debajo de su valor de mercado: un % de UIComercio.PCT_MERCADO.AZUL (40) o menos,
--       con el icono «alerta» del atlas en el azul de ese tramo, quieto; su título lleva el mismo icono y un tooltip, y
--       el tooltip de la fila lo dice también. F9p: a su derecha, en la misma columna, la interrogación amarilla fija de una
--       mercancía aprobada (UIComercio.ICONO_SIN_CONFIRMAR): rotación sin confirmar; su tooltip lo explica.
--       Compra: el precio por unidad (el de un objeto, como «Compra (objeto)» de TSM) con Tema.dinero, el mismo formato que
--       el oro de la cabecera (g, s y c en sus colores). %: frente al valor de mercado (UIComercio.pctMercado, vacío si no
--       hay), con el texto y el color de su tramo (UIComercio.textoPct y tokenPct). Ctd: todas las unidades a la venta de
--       ese objeto. Niv.: el de su itemKey (equipo) o el del objeto.
--       Los mismos objetos juntos: los hallazgos del mismo itemID (variantes con otro nivel o sufijo) salen en una fila con
--       triángulo y «(n)» en dorado junto al nombre, que enseña la Compra más barata, su % y nivel y, en Ctd, la suma.
--       Se despliega en sus hallazgos, de más barato a más caro (cada uno con el nombre de su itemKey si el juego lo da).
--       Un objeto solo va en su fila, sin triángulo ni número. Pulsar una fila de grupo la despliega o la pliega.
--   - Abajo, una sola barra oscura (token «hundido») a todo lo ancho y pegada abajo (1 px dentro del borde de la ventana).
--     Sus piezas, a 8 px del borde de abajo y 24 px de alto, de izquierda a derecha con 8 px entre ellas:
--       La pausa/seguir: botón cuadrado (Piezas.botonCuadrado) con el icono «pausa» (dos rayas) en marcha y «seguir» (un
--       triángulo) en pausa. Pausa = SNF.Sniper.parar() (lo encontrado se queda); seguir = SNF.Sniper.empezar(). Tooltip.
--       El engranaje (botón cuadrado con el icono «operacion»): abre y cierra la ventanita de ajustes de compra de la ventana
--       (UIComercio.alternarAjustes), que lleva el tope de gasto, el aviso de oro, la fila siguiente y la casilla «Sonido
--       al encontrar algo» (comercioSniperSonido), encima del engranaje.
--       El estado, un campo ancho con el texto centrado: «Escaneando · vuelta N» mientras busca, «Escaneo completo: N
--       objetos» entre una vuelta acabada y la siguiente, «En pausa | N para comprar» (o, con una fila elegida, «En pausa |
--       Comprar i / N»), lo que espera (escaneo, tu búsqueda, otro addon, la subasta ocupada, el límite) y, con una compra
--       de aquí, su error («No se ha comprado: …», como «Esa subasta ya no está» o «Cambió de precio»), que no se va solo.
--       Con la tabla llena (ver «sin parpadeos»), «Tabla llena: pausa para ver lo nuevo (N)». Siempre en el color del texto y
--       sin barra de color: el estado solo cambia de texto.
--       «Descartar» (100 px): suelta la compra elegida aquí (SNF.Compra.cancelar).
--       «Comprar» (210 px, antes del asa): gris apagado hasta que haya una fila elegida con su compra «lista» o por
--       confirmar, y fuera de combate. Su texto dice lo que hará el clic (como en los resultados: «Comprar N por X»,
--       «Confirmar N por X» o, con una mercancía, «Elegir cantidad…», que abre el cuadro de cantidad). Su tooltip lleva lo
--       que antes iba en la barra: «Lista para comprar: N por X», lo gastado («Llevas X (sin tope)» o «Llevas X de Y») y
--       que compra exactamente la fila marcada; en combate, «En combate no se compra».
--     En la esquina, el asa de la ventana.
-- Pulsar una fila (o una subfila) llama a SNF.Sniper.elegir con su hallazgo: prepara su compra (SNF.Compra, origen
-- 'sniper'); nunca compra. Se compra EXACTAMENTE esa fila: su precio por unidad es el tope de cada unidad; si su subasta ya
-- no está o cambió de precio, no se compra nada y el estado lo dice. Solo compra el clic del jugador en Comprar
-- (SNF.Compra.pulsar() desde su OnClick), nunca en combate. Un objeto suelto (arreglo de la compra suelta, 2026-11-19)
-- pide dos clics: «Comprar 1 por X» no compra y pasa a «Confirmar 1 por X»; el segundo clic compra. X es siempre el importe
-- exacto, sin «~»: si no cabe en sus 210 px, el botón se ensancha lo justo y el estado se encoge (UIComercio.ajustarBoton).
-- La fila marcada es la del hallazgo que el jugador ha pulsado
-- aquí, mientras su compra (origen 'sniper', del mismo objeto) sigue en pie (Compra.estado() no dice la itemKey); si deja de
-- verse (se pliega su grupo), su compra se suelta: nunca se compra lo que no se ve. Mayús + clic y Ctrl + clic llevan el
-- objeto al chat o al probador (UIComercio.clicModificado): ni eligen ni preparan compra. Con el ratón sobre una fila, el
-- tooltip del objeto (UIComercio.tooltipObjeto).
-- El vendedor y el auctionID no pasan por aquí (el sniper no los tiene) y nada de esto se guarda.
--
-- Sin parpadeos (regla del coordinador): nada parpadea, gira ni destella, nada en OnUpdate. La regla de
-- las filas: en TSM (sus capturas) la tabla va siempre ordenada por % y cada hallazgo nuevo entra en su sitio, empujando lo
-- que hay debajo. Aquí no: lo que se ve nunca sube ni baja solo, haya o no ratón encima o fila elegida (ronda 1).
--   - Con la tabla vacía, lo primero que llega sale ya ordenado (de entrada por %, de menos a más).
--   - La pestaña guarda su propia lista (`mostradas`), aparte de la del sniper (que tiene un tope de 50 y saca la más
--     vieja). Las filas que ya se ven se quedan en su sitio y se ponen al día en él (precio, cantidad, %, «(n)»); las
--     nuevas entran abajo del todo, en el orden en que llegan (TablaComercio:poner con mantener): nunca encima de lo que
--     se ve.
--   - Una fila que se va (vendida, que deja de ser buena o que el sniper saca por su tope) se queda donde estaba, sin
--     cambiar de color; pulsarla dice «Esa subasta ya no está» y no prepara nada. Las subfilas nuevas de un grupo abierto
--     esperan, y las que se van de él se quedan. Un objeto solo que pasa a tener variantes se queda en su fila (pasa a
--     ser un grupo plegado, salvo que sea la fila elegida, que sigue sola).
--   - Todo eso se pone al día de una vez solo con un gesto del jugador: pulsar una cabecera (y se ordena), la
--     pausa/seguir, Empezar o Reiniciar. Quitar el ratón de la tabla no cambia nada.
--   - Tope propio: como mucho SubastaSniper.TOPE_FILAS (100) filas de arriba. Llena, lo nuevo no entra (nada sale para
--     hacerle sitio) y el estado dice «Tabla llena: pausa para ver lo nuevo (N)».
--   - Las filas nuevas entran con el fondo normal: ni se resaltan ni destellan. Solo cambia el fondo del ratón y el de la
--     elegida (los de TablaComercio).
-- Se repinta con SNF_COMERCIO_SNIPER, SNF_COMERCIO_COMPRA, al entrar y salir de combate y con los nombres que llegan
-- (agrupados cada 0,2 s), solo con la página a la vista.
--
-- SubastaSniper.marcos   {pagina, grande (Empezar), vista, salir (con .texto), titulo, reiniciar, marcoTabla (con .fondo),
--     tabla (TablaComercio; sus huecos llevan .snfIcono, .snfCuenta, .snfAlerta y .snfSinConfirmar), vacio, pie, pausa (con .icono),
--     engranaje, estado (con .texto), descartar, comprar}.
-- SubastaSniper.ORIGEN   'sniper': el origen de las compras elegidas aquí (SNF.Compra.estado().origen).
-- SubastaSniper.TOPE_FILAS   filas de arriba como mucho en la tabla (100; se lee cada vez, las pruebas lo bajan).
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Piezas = SNF.Piezas
local Tema = SNF.Tema
local Estilo = SNF.Estilo
local L = SNF.L
local Ventana = SNF.SubastaVentana
local TablaComercio = SNF.TablaComercio

local SubastaSniper = {}
SNF.SubastaSniper = SubastaSniper

local ORIGEN = "sniper"
SubastaSniper.ORIGEN = ORIGEN
SubastaSniper.TOPE_FILAS = 100

local proteger = Piezas.proteger
local botonBase = Piezas.interno.botonBase
local floor, max = math.floor, math.max

-- Medidas, en píxeles de la ventana (píxeles reales).
local MARGEN = 12 -- a los bordes de la ventana
local ARRIBA = 8 -- de la cabecera a la fila de arriba
local ALTO_FILA = 22 -- la fila de arriba
local HUECO = 8 -- entre las piezas de una fila y entre filas
local ABAJO = 8 -- del borde de abajo a las piezas de la barra
local ALTO_PIE = 24 -- las piezas de la barra de abajo
local ALTO_BARRA = ABAJO + ALTO_PIE + ABAJO -- la barra oscura de abajo
local BORDE = 1 -- la barra de abajo deja ver el borde de la ventana
local ANCHO_COMPRAR, ANCHO_DESCARTAR = 210, 100
local ANCHO_GRANDE, ALTO_GRANDE = 240, 32 -- «Empezar», en el centro
local TAMANO_LETRA = 12 -- «Salir», el estado
local TAMANO_REINICIAR, RELLENO_REINICIAR = 11, 14 -- como «Vista de Blizzard»
local LADO_ICONO_PIE = 12
local TOPE_SUBFILAS = 10 -- subfilas que salen como mucho al desplegar un grupo (el resto, «y N más…»)
-- Dentro de la fila (desde su borde izquierdo): la columna (!) con el ⋮ y el triángulo delante, y la de Objeto.
local ANCHO_AVISO = 44
local LADO_ALERTA = 12
local X_ALERTA = 22 -- el centro del icono (!), a la derecha del sitio del triángulo
local X_ICONO = ANCHO_AVISO + 4
local LADO_ICONO = 14
local X_NOMBRE = X_ICONO + LADO_ICONO + 4
local ANCHO_CUENTA = 34 -- el sitio de «(n)» a la derecha del nombre (cabe «(999)»)
local ESPERA_NOMBRES = 0.2 -- s que se agrupan los nombres de objetos que llegan
local ICONO_DESCONOCIDO = "Interface\\Icons\\INV_Misc_QuestionMark"
-- El estado de la barra según por qué espera el sniper (SNF.Sniper.motivo()).
local ESPERAS = {
  escaneo = "SUBASTA_SNIPER_ESPERA_ESCANEO", busqueda = "SUBASTA_SNIPER_ESPERA_BUSQUEDA",
  ajena = "SUBASTA_SNIPER_ESPERA_AJENA", limitado = "SUBASTA_SNIPER_ESPERA_LIMITADO", ritmo = "SUBASTA_SNIPER_ESPERA_RITMO",
}

local marcos = {}
SubastaSniper.marcos = marcos
local visible = false
local empezado = false -- el jugador lo ha empezado (sin él, solo el botón Empezar); se olvida al salir o cerrar
local mostradas = {} -- la lista propia de la pestaña: las filas (de arriba) que tiene puestas la tabla
local fuera = 0 -- hallazgos nuevos que no han entrado porque la tabla está llena (SubastaSniper.TOPE_FILAS)
local porQue = nil -- la clave del texto que dice por qué no se ha podido elegir la fila pulsada
-- El hallazgo que el jugador ha elegido aquí ({claveH, item}): el de la compra de SNF.Compra con origen 'sniper' mientras
-- sea del mismo objeto (Compra.estado() no dice la itemKey).
local elegido = nil
local nombresPendientes = false

---------------------------------------------------------------------------------------------------
-- Ayudas
---------------------------------------------------------------------------------------------------

local function ejecutar(fn, ...)
  return SNF.Comercio.ejecutar("sniper-ventana", fn, ...)
end

-- El sniper, si existe con todo lo que usa la pestaña.
local function sniper()
  local s = rawget(SNF, "Sniper")
  if type(s) ~= "table" then
    return nil
  end
  for _, f in ipairs({"activo", "estado", "motivo", "vueltas", "hallazgos", "empezar", "parar", "elegir"}) do
    if type(rawget(s, f)) ~= "function" then
      return nil
    end
  end
  return s
end

local function uiComercio()
  return rawget(SNF, "UIComercio")
end

-- En combate: la marca de los eventos de SNF.Compra (PLAYER_REGEN_DISABLED llega antes que InCombatLockdown()).
local function enCombate()
  local C = rawget(SNF, "Compra")
  if C and C.combate then
    return C.combate()
  end
  return InCombatLockdown and InCombatLockdown() and true or false
end

local function sinTooltip()
  local tt = rawget(_G, "GameTooltip")
  if tt and not tt:IsForbidden() then
    tt:Hide()
  end
end

-- Un texto de celda con su color (de la paleta de la tabla de comercio): la tabla no repone el color sola.
local function celdaTexto(fs, texto, color)
  fs:SetText(texto or "")
  local c = color or Estilo.comercio("texto")
  fs:SetTextColor(c[1], c[2], c[3], c[4] or 1)
end

local function gris()
  return Estilo.comercio("secundario")
end

local function numero(n)
  return SNF.Texto.numero(n or 0)
end

local function titulo(clave)
  return function()
    return L.t(clave)
  end
end

-- La clave de un hallazgo: su itemKey entera en texto (la misma que usa SNF.Sniper por dentro).
local function claveDeKey(k)
  if type(k) ~= "table" then
    return nil
  end
  return table.concat({tostring(k.itemID), tostring(k.itemLevel or 0), tostring(k.itemSuffix or 0),
    tostring(k.battlePetSpeciesID or 0)}, ":")
end

-- La compra elegida en esta vista (nil si no hay o es de otra página).
local function compraNuestra()
  local C = rawget(SNF, "Compra")
  if not C or not SNF.Comercio.activo() then
    return nil
  end
  local e = C.estado()
  return e and e.origen == ORIGEN and e or nil
end

-- El hallazgo de la compra elegida aquí, mientras sigue en pie (ni hecha ni con error).
local function claveElegida()
  local e = compraNuestra()
  if e and elegido and e.item == elegido.item and e.fase ~= "error" and e.fase ~= "hecho" then
    return elegido.claveH
  end
  return nil
end

-- Suelta la compra elegida aquí, si aún no está pedida al servidor.
local function soltarCompra()
  local e = compraNuestra()
  if e and not (e.fase == "comprando" and e.esperando == "compra") then
    SNF.Compra.cancelar()
  end
end

local function pctDe(item, precio)
  local UI = uiComercio()
  return UI and UI.pctMercado and UI.pctMercado(item, precio) or nil
end

-- (!): muy por debajo de su valor de mercado (el tramo azul del %).
local function alerta(f)
  local UI = uiComercio()
  return type(f.pct) == "number" and UI ~= nil and f.pct <= UI.PCT_MERCADO.AZUL
end

local function nombreYCalidad(item)
  local UI = uiComercio()
  if UI and UI.nombreYCalidad then
    return UI.nombreYCalidad(item)
  end
  return "#" .. tostring(item), nil, nil
end

local function colorCalidad(calidad)
  local UI = uiComercio()
  return UI and UI.colorCalidad and UI.colorCalidad(calidad) or Estilo.comercio("texto")
end

-- El nombre de una variante (con su sufijo), si el juego lo da por su itemKey (GetItemKeyInfo); si no, nil.
local function nombreDeClave(k)
  local A = rawget(_G, "C_AuctionHouse")
  local f = type(A) == "table" and rawget(A, "GetItemKeyInfo")
  if type(f) ~= "function" or type(k) ~= "table" then
    return nil
  end
  local ok, info = pcall(f, k)
  if ok and type(info) == "table" and type(info.itemName) == "string" and info.itemName ~= "" then
    return info.itemName
  end
  return nil
end

local function icono(item)
  local API = rawget(SNF, "API")
  return API and API.iconoObjeto and API.iconoObjeto(item) or ICONO_DESCONOCIDO
end

---------------------------------------------------------------------------------------------------
-- Filas
---------------------------------------------------------------------------------------------------

-- Una fila de arriba con un solo hallazgo (el de `h`), con el nombre y el icono de su objeto (los de `g`).
local function filaSuelta(g, h)
  return {
    clave = g.clave, item = g.item, nombre = g.nombre, calidad = g.calidad, icono = g.icono, hijos = {h},
    claveH = h.claveH, itemKey = h.itemKey, nivel = h.nivel, cantidad = h.cantidad, precio = h.precio, pct = h.pct,
    hora = h.hora, rotacionSinConfirmar = h.rotacionSinConfirmar, tope = h.tope, recorte = h.recorte,
  }
end

-- Las filas de ahora, de SNF.Sniper.hallazgos(), agrupadas por objeto (itemID) en el orden en que llegaron (la más vieja
-- primero: las nuevas van detrás). Un grupo de varias variantes lleva sus subfilas (de más barata a más cara).
local function filasDeAhora()
  local s = sniper()
  local lista = s and s.hallazgos() or {}
  local grupos, orden = {}, {}
  for i = #lista, 1, -1 do -- hallazgos() da los más nuevos arriba
    local h = lista[i]
    local k = type(h.itemKey) == "table" and h.itemKey or {itemID = h.item}
    local g = grupos[h.item]
    if not g then
      local nombre, calidad, nivel = nombreYCalidad(h.item)
      g = {clave = "s:" .. tostring(h.item), item = h.item, nombre = nombre, calidad = calidad, nivelObjeto = nivel,
        icono = icono(h.item), hijos = {}}
      grupos[h.item] = g
      orden[#orden + 1] = g
    end
    local nivel = tonumber(k.itemLevel)
    local claveH = claveDeKey(k)
    g.hijos[#g.hijos + 1] = {
      clave = "h:" .. claveH, claveH = claveH, sub = true, item = h.item, itemKey = k,
      nivel = (nivel and nivel > 0) and nivel or g.nivelObjeto, cantidad = tonumber(h.cantidad) or 0,
      precio = tonumber(h.precio), pct = pctDe(h.item, tonumber(h.precio)), orden = #g.hijos + 1, hora = tonumber(h.hora),
      rotacionSinConfirmar = h.rotacionSinConfirmar, tope = tonumber(h.tope), recorte = h.recorte,
    }
  end
  local filas = {}
  for _, g in ipairs(orden) do
    table.sort(g.hijos, function(a, b)
      if a.precio ~= b.precio then
        return (a.precio or math.huge) < (b.precio or math.huge)
      end
      return a.orden < b.orden
    end)
    if #g.hijos == 1 then
      filas[#filas + 1] = filaSuelta(g, g.hijos[1])
    else
      local total = 0
      for _, h in ipairs(g.hijos) do
        total = total + h.cantidad
        h.nombre = nombreDeClave(h.itemKey) or g.nombre
        h.calidad = g.calidad
      end
      local barata = g.hijos[1]
      filas[#filas + 1] = {
        clave = g.clave, item = g.item, nombre = g.nombre, calidad = g.calidad, icono = g.icono, hijos = g.hijos,
        subfilas = g.hijos, n = #g.hijos, nivel = barata.nivel, cantidad = total, precio = barata.precio, pct = barata.pct,
        hora = barata.hora, rotacionSinConfirmar = barata.rotacionSinConfirmar,
      }
    end
  end
  return filas
end

-- Las subfilas de un grupo abierto: las que se veían, en su sitio (con lo de ahora si siguen; si no, tal cual y marcadas
-- como idas). Las nuevas esperan a un gesto del jugador.
local function subfilasQuietas(viejas, hijos)
  local ahora = {}
  for _, h in ipairs(hijos) do
    ahora[h.clave] = h
  end
  local r = {}
  for _, v in ipairs(viejas) do
    local h = ahora[v.clave]
    if h then
      h.nombre, h.calidad = h.nombre or v.nombre, h.calidad or v.calidad
      r[#r + 1] = h
    else
      v.ida = true
      r[#r + 1] = v
    end
  end
  return r
end

-- Las filas que se ponen en la tabla (ver «sin parpadeos» arriba): las que se veían, en su sitio y puestas al día (las que se
-- han ido, tal cual), y las nuevas detrás, hasta el tope. Con `alDia` (un gesto del jugador), solo las de ahora (hasta el
-- tope). Cuenta en `fuera` las que no caben.
local function filasParaLaTabla(nuevas, alDia)
  local tope = SubastaSniper.TOPE_FILAS
  fuera = 0
  if alDia then
    local r = {}
    for _, f in ipairs(nuevas) do
      if #r < tope then
        r[#r + 1] = f
      else
        fuera = fuera + 1
      end
    end
    return r
  end
  local t = marcos.tabla
  local elegida = claveElegida()
  local porClave = {}
  for _, f in ipairs(nuevas) do
    porClave[f.clave] = f
  end
  local r, puestas = {}, {}
  for _, vieja in ipairs(mostradas) do
    local f = porClave[vieja.clave]
    if not f then
      vieja.ida = true -- ya no está: se queda donde estaba
      r[#r + 1] = vieja
    elseif vieja.subfilas and t:estaAbierta(vieja.clave) then
      -- Un grupo abierto: sus subfilas de antes se quedan (aunque ahora sea un objeto solo).
      f.subfilas = subfilasQuietas(vieja.subfilas, f.hijos)
      f.n, f.claveH, f.itemKey = #f.hijos, nil, nil
      r[#r + 1] = f
    elseif vieja.claveH and f.subfilas and vieja.claveH == elegida then
      -- La fila elegida, que ahora tiene más variantes: sigue sola en su fila (la suya, con lo de ahora), para no
      -- esconder su compra dentro de un grupo plegado.
      local suya = nil
      for _, h in ipairs(f.hijos) do
        if h.claveH == vieja.claveH then
          suya = h
        end
      end
      r[#r + 1] = suya and filaSuelta(f, suya) or f
    else
      r[#r + 1] = f
    end
    puestas[vieja.clave] = true
  end
  for _, f in ipairs(nuevas) do
    if not puestas[f.clave] then
      if #r < tope then
        r[#r + 1] = f
      else
        fuera = fuera + 1 -- llena: no entra (nada sale para hacerle sitio)
      end
    end
  end
  return r
end

-- Lo que va debajo de las subfilas de un grupo abierto (topeSubfilas de la tabla): «y N más…» con las que no salen.
local function filaMas(f, ocultas)
  if ocultas > 0 then
    return {clave = f.clave .. ":mas", aviso = "SUBASTA_RES_Y_N_MAS", avisoN = ocultas, elegible = false}
  end
  return nil
end

---------------------------------------------------------------------------------------------------
-- Tabla
---------------------------------------------------------------------------------------------------

-- Lo que añaden las columnas (!) y Objeto a cada hueco de la tabla (se crea una vez por hueco).
local function adornos(h)
  if not h.snfIcono then
    h.snfIcono = h:CreateTexture(nil, "ARTWORK")
    h.snfIcono:SetSize(LADO_ICONO, LADO_ICONO)
    h.snfIcono:SetPoint("LEFT", h, "LEFT", X_ICONO, 0)
    h.snfCuenta = Tema.letra(h:CreateFontString(nil, "OVERLAY"), "tabla")
    h.snfCuenta:SetJustifyH("RIGHT")
    h.snfCuenta:SetWordWrap(false)
    h.snfCuenta:SetWidth(ANCHO_CUENTA)
    local c = Tema.color("oro")
    h.snfCuenta:SetTextColor(c[1], c[2], c[3], c[4])
    h.snfCuenta:Hide()
    -- (!): el icono de aviso del atlas, quieto, en el azul del tramo de abajo del %.
    h.snfAlerta = h:CreateTexture(nil, "ARTWORK")
    h.snfAlerta:SetSize(LADO_ALERTA, LADO_ALERTA)
    h.snfAlerta:SetPoint("CENTER", h, "LEFT", X_ALERTA, 0)
    Tema.icono(h.snfAlerta, "alerta")
    local a = Tema.color("azul")
    h.snfAlerta:SetVertexColor(a[1], a[2], a[3], a[4])
    h.snfAlerta:Hide()
    -- F9p: la marca de rotación sin confirmar, quieta, justo a la derecha del (!) y antes del icono del objeto.
    h.snfSinConfirmar = h:CreateTexture(nil, "ARTWORK")
    h.snfSinConfirmar:SetSize(LADO_ALERTA, LADO_ALERTA)
    h.snfSinConfirmar:SetPoint("CENTER", h, "LEFT", X_ALERTA + LADO_ALERTA + 1, 0)
    h.snfSinConfirmar:SetTexture(uiComercio().ICONO_SIN_CONFIRMAR)
    h.snfSinConfirmar:Hide()
  end
  return h
end

-- (!): el icono si la fila está muy por debajo de su valor de mercado (la celda de texto queda vacía).
local function pintarAviso(celda, f)
  local h = adornos(celda:GetParent())
  celda:SetText("")
  h.snfAlerta:SetShown(not f.aviso and alerta(f))
  h.snfSinConfirmar:SetShown(not f.aviso and f.rotacionSinConfirmar == true)
end

-- Objeto: icono, nombre y «(n)» en una fila de arriba; en una subfila, solo el nombre; en un aviso, su texto en gris. Se
-- ancla desde el borde de la fila (la columna (!) va antes y no cambia de ancho).
local function pintarObjeto(celda, f, ancho)
  local h = adornos(celda:GetParent())
  celda:ClearAllPoints()
  celda:SetPoint("LEFT", h, "LEFT", X_NOMBRE, 0)
  local fin = ANCHO_AVISO + ancho - 6 -- el borde derecho de la columna, menos su margen
  celda:SetWidth(max(1, fin - X_NOMBRE))
  if f.sub or f.aviso then
    h.snfCuenta:Hide()
    h.snfIcono:Hide()
    if f.aviso then
      celdaTexto(celda, L.t(f.aviso, numero(f.avisoN)), gris())
    else
      celdaTexto(celda, f.nombre, colorCalidad(f.calidad))
    end
    return
  end
  h.snfIcono:SetTexture(f.icono or ICONO_DESCONOCIDO)
  h.snfIcono:Show()
  -- El sitio de «(n)» se guarda siempre: el nombre no cambia de ancho cuando un objeto pasa a tener variantes.
  celda:SetWidth(max(1, fin - X_NOMBRE - ANCHO_CUENTA))
  celdaTexto(celda, f.nombre, colorCalidad(f.calidad))
  h.snfCuenta:ClearAllPoints()
  h.snfCuenta:SetPoint("RIGHT", h, "LEFT", fin, 0)
  if f.n and f.n > 1 then
    h.snfCuenta:SetText(L.t("SUBASTA_RES_CUENTA", numero(f.n)))
    h.snfCuenta:Show()
  else
    h.snfCuenta:Hide()
  end
end

-- Una columna de texto (vacía en los avisos), con el color que dé `fn` (un token del tema) o el normal.
local function pintarCelda(fn)
  return function(celda, f)
    local texto, color = "", nil
    if not f.aviso and fn then
      texto, color = fn(f)
    end
    celdaTexto(celda, texto or "", color and Tema.color(color) or nil)
  end
end

local COLUMNAS = {
  {clave = "aviso", titulo = "", icono = "alerta", ayuda = function()
    return L.t("SUBASTA_SNIPER_COL_AVISO", uiComercio().textoPct(uiComercio().PCT_MERCADO.AZUL))
  end, ancho = ANCHO_AVISO, justificado = "CENTER", valor = function(f) return alerta(f) and 1 or nil end,
    pintar = pintarAviso},
  {clave = "objeto", titulo = titulo("COMERCIO_COL_OBJETO"), ancho = 302, peso = 12, justificado = "LEFT", -- 190 + los 112 de Pujar
    valor = function(f) return f.nombre end, pintar = pintarObjeto},
  {clave = "nivel", titulo = titulo("SUBASTA_RES_COL_NIVEL"), ancho = 44, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.nivel end,
    pintar = pintarCelda(function(f) return f.nivel and tostring(f.nivel) end)},
  {clave = "cantidad", titulo = titulo("SUBASTA_RES_COL_CTD"), ancho = 52, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.cantidad end,
    pintar = pintarCelda(function(f) return numero(f.cantidad) end)},
  {clave = "compra", titulo = titulo("SUBASTA_RES_COL_COMPRA"), ancho = 120, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.precio end,
    pintar = pintarCelda(function(f) return f.precio and Tema.dinero(f.precio) end)},
  {clave = "pct", titulo = titulo("COMERCIO_COL_PCT"), ancho = 50, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.pct end,
    pintar = pintarCelda(function(f)
      if f.pct then
        return uiComercio().textoPct(f.pct), uiComercio().tokenPct(f.pct)
      end
    end)},
  -- F1 (ronda 2): de dónde sale el precio y a qué hora se leyó: «navegar 14:32» (el resumen de la búsqueda general; ver la
  -- excepción en la cabecera de comercio/sniper.lua). La hora es fija: no envejece ni cambia sola en pantalla.
  {clave = "foto", titulo = titulo("COMERCIO_COL_FOTO"), ancho = 100, peso = 1, justificado = "RIGHT",
    valor = function(f) return f.hora or 0 end,
    pintar = pintarCelda(function(f) return uiComercio().momentoHora("navegar", f.hora), "apagado" end)},
}

-- La clave de la fila que se ve con el hallazgo `claveH`: la suya si va sola, o su subfila si su grupo está abierto.
local function filaQueSeVe(claveH)
  local t = marcos.tabla
  for _, f in ipairs(mostradas) do
    if f.claveH == claveH then
      return f.clave
    end
    if f.subfilas and t:estaAbierta(f.clave) then
      for i, sf in ipairs(f.subfilas) do
        if sf.claveH == claveH and i <= TOPE_SUBFILAS then
          return sf.clave
        end
      end
    end
  end
  return nil
end

-- La fila marcada es la de la compra elegida aquí. Si ya no se ve, su compra se suelta: nunca se compra lo que no se ve.
local function marcarElegida()
  local t = marcos.tabla
  if not t then
    return
  end
  local k = claveElegida()
  local fila = k and filaQueSeVe(k) or nil
  if k and not fila then
    soltarCompra()
  end
  t:elegir(fila)
end

local pintarBarra -- (más abajo)

-- gesto: nil (lo que llega solo: nada de lo que se ve se mueve), "alDia" (pausa/seguir, Empezar: se van las que ya no
-- están, sin reordenar) u "ordenar" (una cabecera: se van y se ordena todo).
local function pintarTabla(gesto)
  local t = marcos.tabla
  if not t then
    return
  end
  local filas = filasParaLaTabla(filasDeAhora(), gesto ~= nil)
  -- Con la tabla vacía, lo que llega sale ya ordenado; después nada se mueve solo (las nuevas, detrás).
  t:poner(filas, gesto ~= "ordenar" and #mostradas > 0)
  mostradas = filas
  -- Un grupo abierto que vuelve a ser un objeto solo se olvida abierto: si vuelve a tener variantes, sale plegado.
  for _, f in ipairs(filas) do
    if not f.subfilas and t:estaAbierta(f.clave) then
      t:abrir(f.clave, false)
    end
  end
  marcarElegida()
  marcos.vacio:SetShown(empezado and #filas == 0)
end

local function repintar(gesto)
  if not marcos.pagina then
    return
  end
  local s = sniper()
  if s and s.activo() then
    empezado = true
  end
  marcos.grande:SetShown(not empezado)
  marcos.vista:SetShown(empezado)
  if empezado then
    pintarTabla(gesto)
    pintarBarra()
  end
end

-- El índice de un hallazgo en SNF.Sniper.hallazgos() (lo que pide SNF.Sniper.elegir), o nil si ya no está.
local function indiceDe(claveH)
  local s = sniper()
  for i, h in ipairs(s and s.hallazgos() or {}) do
    if claveDeKey(h.itemKey) == claveH then
      return i
    end
  end
  return nil
end

-- Pulsar una fila: un grupo se despliega o se pliega; un hallazgo prepara su compra (nunca compra), o el estado dice por
-- qué no.
local function alPulsar(f)
  local t = marcos.tabla
  local s = sniper()
  porQue = nil
  if f.aviso then
    marcarElegida()
    return
  end
  if f.subfilas and not f.ida then
    t:abrir(f.clave, not t:estaAbierta(f.clave))
  elseif not s or f.ida or not indiceDe(f.claveH) then
    porQue = "COMERCIO_MOTIVO_YA_NO_ESTA"
  else
    -- Antes de elegir: la compra avisa enseguida y la tabla tiene que marcar ya esta fila (no soltar la compra nueva).
    local antes = elegido
    elegido = {claveH = f.claveH, item = f.item}
    if not s.elegir(indiceDe(f.claveH)) then
      elegido = antes
      if SNF.Comercio.activo() then
        porQue = "SUBASTA_RES_POR_QUE_OTRA_COMPRA" -- otra compra espera aún al servidor
      end
    end
  end
  marcarElegida()
  pintarBarra()
end

-- El triángulo: la tabla ya ha abierto o cerrado el grupo (si se cierra con la compra dentro, marcarElegida la suelta).
local function alAbrir()
  porQue = nil
  marcarElegida()
  pintarBarra()
end

-- El tooltip de una fila: el del objeto del juego (con nuestras líneas de ui/tooltip.lua) y, con (!), por qué.
local function alEntrar(f, hueco)
  local UI = uiComercio()
  if not (UI and UI.tooltipObjeto) then
    return
  end
  if f.aviso or not f.item then
    UI.soltarTooltipObjeto(hueco)
    return
  end
  UI.tooltipObjeto(hueco, {item = f.item, clave = f.clave, lineas = function(tt)
    if alerta(f) then
      local c = Tema.color("azul")
      tt:AddLine(L.t("SUBASTA_SNIPER_COL_AVISO", UI.textoPct(UI.PCT_MERCADO.AZUL)), c[1], c[2], c[3])
    end
    if f.rotacionSinConfirmar then
      UI.lineaSinConfirmar(tt)
    end
    -- Tope prudente: el tope de la operación se bajó al precio de tu casa o al regional.
    if f.recorte and f.tope then
      local clave = f.recorte == "regional" and "SUBASTA_SNIPER_TOPE_REGIONAL"
        or f.recorte == "vendedor" and "SUBASTA_SNIPER_TOPE_VENDEDOR" or "SUBASTA_SNIPER_TOPE_MERCADO"
      local c = Tema.color("texto")
      tt:AddLine(L.t(clave, Tema.dinero(f.tope)), c[1], c[2], c[3])
    end
  end})
end

-- El ratón sale de la tabla (la luz se apaga): fuera el tooltip. La tabla no cambia (ronda 1: nada se aplica de golpe).
local function alSalir(hueco)
  local UI = uiComercio()
  if UI and UI.esconderTooltipObjeto then
    UI.esconderTooltipObjeto(hueco, true) -- la luz de la tabla ya ha esperado
  else
    sinTooltip()
  end
end

-- El jugador ha pulsado una cabecera (la tabla ya se ha ordenado): es un gesto suyo, la tabla se pone al día y se ordena.
local function alOrdenar()
  repintar("ordenar")
end

---------------------------------------------------------------------------------------------------
-- Barra de abajo
---------------------------------------------------------------------------------------------------

-- Los hallazgos que enseña la tabla (los de cada fila de arriba, en su orden) y la posición entre ellos del elegido aquí
-- (nil sin ninguno): «Comprar i / N».
local function posicionElegida()
  local k = claveElegida()
  local t = marcos.tabla
  local n, posicion, i = 0, nil, 1
  local f = t and t:fila(1)
  while f do
    if not f.sub and not f.aviso then
      for _, h in ipairs(f.hijos or {}) do
        n = n + 1
        if k and h.claveH == k then
          posicion = n
        end
      end
    end
    i = i + 1
    f = t:fila(i)
  end
  return posicion, n
end

-- Lo que la compra elegida aquí tiene que decir en el estado (lo demás va en el tooltip de Comprar), o nil.
local function textoCompra(e)
  local UI = uiComercio()
  if e.fase == "error" then
    return L.t("COMERCIO_BARRA_ERROR", UI and UI.textoMotivo and UI.textoMotivo(e) or L.t("COMERCIO_MOTIVO_FALLO"))
  elseif e.fase == "confirmar" and e.subio then
    return L.t("COMERCIO_BARRA_SUBIO", numero(e.cantidad), Tema.dinero(e.totalAntes or 0), Tema.dinero(e.total or 0))
  elseif (e.fase == "lista" or e.fase == "confirmar") and enCombate() then
    return L.t("SUBASTA_RES_EN_COMBATE")
  end
  return nil
end

local function textoEstado()
  local s = sniper()
  if not s then
    return ""
  end
  local e = compraNuestra()
  local linea = e and textoCompra(e)
  if linea then
    return linea
  end
  if porQue then
    return L.t(porQue)
  end
  if fuera > 0 then
    return L.t("SUBASTA_SNIPER_LLENA", numero(fuera))
  end
  local estado = s.estado()
  if estado == "parado" or estado == "pausado" then
    local i, n = posicionElegida()
    if i then
      return L.t("SUBASTA_SNIPER_PAUSA_ELEGIDA", numero(i), numero(n))
    end
    return L.t("SUBASTA_SNIPER_PAUSA", numero(n))
  elseif estado == "buscando" then
    local vistos = s.ultimaVuelta and s.ultimaVuelta()
    if vistos then
      return L.t("SUBASTA_SNIPER_COMPLETO", numero(vistos))
    end
    return L.t("SUBASTA_SNIPER_ESCANEANDO", numero(s.vueltas()))
  end
  return L.t(ESPERAS[s.motivo() or ""] or "SUBASTA_SNIPER_ESPERA")
end

-- Lo que hará el clic de Comprar (lo de la vista de resultados): con una mercancía «lista», «Elegir cantidad…»; si no, lo
-- que se va a comprar, cuántas y el total (redondeado con «~» si no cabe, UIComercio.etiquetaConImporte). Siempre del mismo
-- color.
local function etiquetaComprar(e)
  if e.fase == "buscando" then
    return L.t("COMERCIO_BOTON_BUSCANDO")
  elseif e.fase == "comprando" then
    return L.t("COMERCIO_BOTON_COMPRANDO")
  elseif e.fase == "lista" and e.tipo == "mercancia" then
    return L.t("COMERCIO_ELEGIR_CANTIDAD")
  elseif (e.fase == "lista" or e.fase == "confirmar") and e.total then
    local clave = e.fase == "confirmar" and "SUBASTA_RES_CONFIRMAR" or "SUBASTA_RES_COMPRAR"
    local n = numero(e.cantidad)
    local UI = uiComercio()
    if e.tipo == "objeto" and UI and UI.dinero then
      -- Ronda 1 del arreglo de la compra suelta: un objeto suelto, siempre con el importe exacto (sin «~»; el botón se
      -- ensancha si hace falta, UIComercio.ajustarBoton).
      return L.t(clave, n, UI.dinero(e.total)), true
    end
    if UI and UI.etiquetaConImporte then
      return UI.etiquetaConImporte(e.total, marcos.comprar.texto, ANCHO_COMPRAR - 8, function(x) return L.t(clave, n, x) end)
    end
    return L.t(clave, n, Tema.dinero(e.total))
  end
  return L.t("COMERCIO_COMPRAR")
end

-- El tope de gasto de la sesión (cobre; 0 = sin tope), recortado a sus límites como lo usa SNF.Compra.
local function tope()
  local limite = SNF.Ajustes.LIMITES.comercioTope
  local v = tonumber(SNF.Ajustes.get("comercioTope"))
  if not v or v ~= v then
    v = SNF.Ajustes.DEFECTO.comercioTope
  end
  return floor(math.max(limite.min, math.min(limite.max, v)))
end

-- El tooltip de Comprar: lo que se va a comprar, lo gastado y que compra exactamente la fila marcada (o, en combate, que no
-- se compra).
local function lineasComprar()
  local lineas = {}
  local e = compraNuestra()
  if enCombate() then
    lineas[#lineas + 1] = L.t("SUBASTA_RES_EN_COMBATE")
  end
  if e and e.fase == "lista" then
    if e.quedan then
      lineas[#lineas + 1] = L.t("COMERCIO_BARRA_QUEDAN", numero(e.pedidas), numero(e.quedan))
    elseif e.aviso then
      lineas[#lineas + 1] = L.t("SUBASTA_RES_CARA", numero(e.cantidad), Tema.dinero(e.total or 0))
    else
      lineas[#lineas + 1] = L.t("COMERCIO_BARRA_LISTA", floor(e.cantidad or 0), Tema.dinero(e.total or 0))
    end
  elseif e and e.fase == "confirmar" and e.tipo == "objeto" then
    -- Arreglo de la compra suelta: el primer clic de un objeto suelto solo pide confirmar; el segundo compra.
    lineas[#lineas + 1] = L.t("COMERCIO_BARRA_CONFIRMAR_OBJETO", numero(e.cantidad), Tema.dinero(e.total or 0))
  elseif e and e.fase == "confirmar" then
    lineas[#lineas + 1] = L.t("COMERCIO_BARRA_CONFIRMANDO")
  end
  local C = rawget(SNF, "Compra")
  local gastado = C and C.gastado and C.gastado() or 0
  local t = tope()
  if t > 0 then
    lineas[#lineas + 1] = L.t("COMERCIO_GASTO_LLEVAS", Tema.dinero(gastado), Tema.dinero(t))
  else
    lineas[#lineas + 1] = L.t("COMERCIO_GASTO_LLEVAS_SIN_TOPE", Tema.dinero(gastado))
  end
  lineas[#lineas + 1] = L.t("SUBASTA_SNIPER_COMPRAR_AYUDA")
  return lineas
end

local function pintarPausa()
  local s = sniper()
  Tema.icono(marcos.pausa.icono, s and s.activo() and "pausa" or "seguir")
end

pintarBarra = function()
  if not marcos.estado then
    return
  end
  pintarPausa()
  marcos.estado.texto:SetText(textoEstado())
  local e = compraNuestra()
  local b = marcos.comprar
  local etiqueta, exacto = L.t("COMERCIO_COMPRAR"), false
  if e then
    etiqueta, exacto = etiquetaComprar(e)
  end
  b:ponerTexto(etiqueta)
  local UI = uiComercio()
  if UI and UI.ajustarBoton then
    UI.ajustarBoton(b, b.texto, etiqueta, ANCHO_COMPRAR, b.espacioFijo, exacto) -- ronda 1: el importe exacto cabe entero
  end
  b:ponerApagado(not (e ~= nil and (e.fase == "lista" or e.fase == "confirmar") and not enCombate()))
  marcos.descartar:ponerApagado(not (e ~= nil and not (e.fase == "comprando" and e.esperando == "compra")))
end

-- El clic de Comprar, antes de comprar: el flujo de siempre. true si toca SNF.Compra.pulsar(); false en combate, sin
-- compra elegida aquí o si una mercancía «lista» ha abierto el cuadro de cantidad (que pide la confirmación).
local function alComprar()
  if enCombate() then
    return false
  end
  local e = compraNuestra()
  if not e then
    return false
  end
  local cuadro = rawget(SNF, "CantidadComercio")
  if e.fase == "lista" and e.tipo == "mercancia" and cuadro and cuadro.abrir({sinRojo = true}) == true then
    return false
  end
  return true
end

---------------------------------------------------------------------------------------------------
-- Empezar, pausar, reiniciar y salir
---------------------------------------------------------------------------------------------------

local function alEmpezar()
  local s = sniper()
  if s and (s.activo() or s.empezar()) then
    empezado = true
  end
  repintar("alDia")
end

local function alPausa()
  local s = sniper()
  if not s then
    return
  end
  porQue = nil
  if s.activo() then
    s.parar()
  else
    s.empezar()
  end
  repintar("alDia") -- un gesto del jugador: se van las filas que ya no están y entra lo nuevo
end

local function alReiniciar()
  local s = sniper()
  if not (s and s.reiniciar) then
    return
  end
  soltarCompra() -- lo encontrado se va: su compra no se queda preparada
  porQue = nil
  mostradas = {}
  marcos.tabla:poner({})
  marcos.tabla:desplazar(-1000000)
  s.reiniciar()
  repintar()
end

local function alSalirDelEscaneo()
  local s = sniper()
  soltarCompra()
  if s then
    s.parar()
  end
  empezado = false
  porQue = nil
  Ventana.elegir("navegar")
end

---------------------------------------------------------------------------------------------------
-- Crear
---------------------------------------------------------------------------------------------------

-- Añade a un botón un tooltip con las líneas que da `lineas()` (solo con el ratón; sin animación).
local function conAyuda(b, lineas)
  local entrar, salir = b:GetScript("OnEnter"), b:GetScript("OnLeave")
  b:SetScript("OnEnter", proteger(function(self, ...)
    if entrar then
      entrar(self, ...)
    end
    local tt = rawget(_G, "GameTooltip")
    local lista = lineas()
    if lista and lista[1] and tt and not tt:IsForbidden() then
      tt:SetOwner(self, "ANCHOR_TOP")
      tt:SetText(lista[1], 1, 1, 1, 1, true)
      for i = 2, #lista do
        tt:AddLine(lista[i], 1, 1, 1, true)
      end
      tt:Show()
    end
  end))
  b:SetScript("OnLeave", proteger(function(self, ...)
    if salir then
      salir(self, ...)
    end
    sinTooltip()
  end))
end

-- Lo que depende del texto: el ancho de «Salir» y el de «Reiniciar».
local function colocar()
  local s = marcos.salir
  if not s then
    return
  end
  s:SetWidth(math.ceil(s.texto:GetStringWidth()) + 2)
  local r = marcos.reiniciar
  r:SetWidth(math.ceil(r.texto:GetStringWidth()) + 2 * RELLENO_REINICIAR + 2)
end

local function crearArriba(v)
  local s = botonBase(v, function()
    ejecutar(alSalirDelEscaneo)
  end)
  s:SetHeight(ALTO_FILA)
  s:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN, -ARRIBA)
  s.texto = Tema.letra(s:CreateFontString(nil, "OVERLAY"), "texto", TAMANO_LETRA)
  s.texto:SetPoint("LEFT", s, "LEFT", 0, 0)
  s.texto:SetWordWrap(false)
  s.texto:SetText(L.t("SUBASTA_RES_SALIR"))
  Piezas.interno.colorTexto(s.texto, "acento")
  marcos.salir = s

  local t = Tema.letra(v:CreateFontString(nil, "OVERLAY"), "titulo")
  t:SetPoint("TOP", v, "TOP", 0, -ARRIBA)
  t:SetHeight(ALTO_FILA)
  t:SetJustifyH("CENTER")
  t:SetWordWrap(false)
  t:SetText(L.t("SUBASTA_SNIPER_TITULO"))
  Piezas.interno.colorTexto(t, "texto")
  marcos.titulo = t

  -- Como «Vista de Blizzard»: oscuro con borde fino, Montserrat Medium de 11 y el texto en el centro.
  local r = Piezas.boton(v, L.t("SUBASTA_SNIPER_REINICIAR"), function()
    ejecutar(alReiniciar)
  end, {borde = true, alto = ALTO_FILA})
  Tema.letra(r.texto, "texto", TAMANO_REINICIAR)
  r.texto:ClearAllPoints()
  r.texto:SetPoint("CENTER", r, "CENTER", 0, 0)
  r:SetPoint("TOPRIGHT", v, "TOPRIGHT", -MARGEN, -ARRIBA)
  conAyuda(r, function()
    return {L.t("SUBASTA_SNIPER_REINICIAR_AYUDA")}
  end)
  marcos.reiniciar = r
end

local function crearTabla(v, pie)
  local fondo = CreateFrame("Frame", nil, v)
  fondo:SetPoint("TOPLEFT", v, "TOPLEFT", MARGEN, -(ARRIBA + ALTO_FILA + HUECO))
  fondo:SetPoint("BOTTOMRIGHT", pie, "TOPRIGHT", -(MARGEN - BORDE), HUECO)
  Estilo.panelComercio(fondo, "filas") -- el marco fino alrededor, como TSM
  marcos.marcoTabla = fondo
  local t = TablaComercio.crear(fondo, {
    columnas = COLUMNAS,
    filasVisibles = 12,
    estirar = true, -- llena su marco y sigue a la ventana (tarea S1)
    orden = {clave = "pct", asc = true},
    ejecutar = function(nombre, fn, ...)
      return SNF.Comercio.ejecutar(nombre, fn, ...)
    end,
    triangulos = true,
    separadores = true,
    menu = {ayuda = titulo("SUBASTA_RES_MENU_PRONTO")},
    topeSubfilas = {n = TOPE_SUBFILAS, fila = filaMas},
    alPulsar = alPulsar,
    alAbrir = alAbrir,
    -- B3s: Mayús + clic al chat, Ctrl + clic al probador; con tecla no se elige ni se despliega.
    objeto = function(f)
      if f.aviso or not f.item then
        return nil
      end
      return nil, f.item
    end,
    alEntrar = alEntrar,
    alSalir = alSalir,
    alOrdenar = alOrdenar,
  })
  t.marco:SetPoint("TOPLEFT", fondo, "TOPLEFT", 1, -1)
  t.marco:SetPoint("BOTTOMRIGHT", fondo, "BOTTOMRIGHT", -1, 1)
  marcos.tabla = t
  local vacio = Tema.letra(fondo:CreateFontString(nil, "OVERLAY"), "texto")
  vacio:SetPoint("LEFT", fondo, "LEFT", 16, 0)
  vacio:SetPoint("RIGHT", fondo, "RIGHT", -16, 0)
  vacio:SetJustifyH("CENTER")
  vacio:SetWordWrap(true)
  celdaTexto(vacio, L.t("COMERCIO_SNIPER_VACIO"), gris())
  vacio:Hide()
  marcos.vacio = vacio
end

local function crearPie(v, p)
  local pie = CreateFrame("Frame", nil, v)
  pie:SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", BORDE, BORDE)
  pie:SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT", -BORDE, BORDE)
  pie:SetHeight(ALTO_BARRA - BORDE)
  local fondo = Piezas.interno.plana(pie, "BACKGROUND", 0)
  fondo:SetAllPoints(pie)
  Piezas.interno.pintar(fondo, "hundido")
  marcos.pie = pie

  local pausa = Piezas.botonCuadrado(pie, "pausa", function()
    ejecutar(alPausa)
  end, {lado = ALTO_PIE, tamanoIcono = LADO_ICONO_PIE})
  pausa:SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", MARGEN, ABAJO)
  conAyuda(pausa, function()
    local s = sniper()
    if s and s.activo() then
      return {L.t("SUBASTA_SNIPER_PAUSAR"), L.t("SUBASTA_SNIPER_AL_DIA"), L.t("COMERCIO_SNIPER_AVISO_BLIZZARD")}
    end
    return {L.t("SUBASTA_SNIPER_SEGUIR"), L.t("SUBASTA_SNIPER_AL_DIA"), L.t("COMERCIO_SNIPER_AVISO_BLIZZARD")}
  end)
  marcos.pausa = pausa

  local engranaje = Piezas.botonCuadrado(pie, "operacion", function()
    local UI = uiComercio()
    if UI and UI.alternarAjustes then
      UI.alternarAjustes(marcos.engranaje, "izquierda")
    end
  end, {lado = ALTO_PIE, tamanoIcono = LADO_ICONO_PIE})
  engranaje:SetPoint("LEFT", pausa, "RIGHT", HUECO, 0)
  conAyuda(engranaje, function()
    return {L.t("COMERCIO_AJUSTES")}
  end)
  marcos.engranaje = engranaje

  -- SNF.Compra.pulsar() solo desde aquí, el OnClick del botón que pulsa el jugador (una compra por clic).
  local b = Piezas.boton(pie, L.t("COMERCIO_COMPRAR"), function()
    ejecutar(function()
      if alComprar() then
        SNF.Compra.pulsar()
      end
    end)
  end, {alto = ALTO_PIE, ancho = ANCHO_COMPRAR})
  b:SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT", -(MARGEN + Piezas.CABECERA.asa), ABAJO) -- el asa va en la esquina
  b.texto:SetWordWrap(false)
  conAyuda(b, lineasComprar)
  b:ponerApagado(true)
  marcos.comprar = b

  local d = Piezas.boton(pie, L.t("COMERCIO_DESCARTAR"), function()
    ejecutar(function()
      soltarCompra()
      porQue = nil
      repintar()
    end)
  end, {alto = ALTO_PIE, ancho = ANCHO_DESCARTAR})
  d:SetPoint("BOTTOMRIGHT", b, "BOTTOMLEFT", -HUECO, 0)
  d.texto:SetWordWrap(false)
  d:ponerApagado(true)
  marcos.descartar = d

  -- El estado: un campo con el texto centrado, sin relleno de color.
  local estado = CreateFrame("Frame", nil, pie)
  estado:SetPoint("BOTTOMLEFT", engranaje, "BOTTOMRIGHT", HUECO, 0)
  estado:SetPoint("TOPRIGHT", d, "TOPLEFT", -HUECO, 0)
  Tema.panel(estado, "secundario", {borde = true})
  estado.texto = Tema.letra(estado:CreateFontString(nil, "OVERLAY"), "texto", TAMANO_LETRA)
  estado.texto:SetPoint("LEFT", estado, "LEFT", 8, 0)
  estado.texto:SetPoint("RIGHT", estado, "RIGHT", -8, 0)
  estado.texto:SetJustifyH("CENTER")
  estado.texto:SetWordWrap(false)
  Piezas.interno.colorTexto(estado.texto, "texto")
  marcos.estado = estado
end

local function crear(p)
  marcos.pagina = p
  local grande = Piezas.boton(p, L.t("COMERCIO_SNIPER_EMPEZAR"), function()
    ejecutar(alEmpezar)
  end, {ancho = ANCHO_GRANDE, alto = ALTO_GRANDE})
  grande:SetPoint("CENTER", p, "CENTER", 0, 0)
  marcos.grande = grande
  local v = CreateFrame("Frame", nil, p)
  v:SetAllPoints(p)
  v:Hide()
  marcos.vista = v
  crearArriba(v)
  crearPie(v, p)
  crearTabla(v, marcos.pie)
  -- Combate (el botón Comprar) y nombres de objetos: solo mientras la página se ve.
  p:SetScript("OnEvent", proteger(function(_, evento)
    if evento == "GET_ITEM_INFO_RECEIVED" then
      if not nombresPendientes and C_Timer then
        nombresPendientes = true
        C_Timer.After(ESPERA_NOMBRES, function()
          nombresPendientes = false
          if visible then
            ejecutar(repintar)
          end
        end)
      end
      return
    end
    -- La marca del combate (por si este oyente va antes que el de SNF.Compra): solo con los dos eventos del combate.
    local C = rawget(SNF, "Compra")
    if C and evento == "PLAYER_REGEN_DISABLED" then
      C.enCombate = true
    elseif C and evento == "PLAYER_REGEN_ENABLED" then
      C.enCombate = false
    end
    ejecutar(function()
      if empezado then
        pintarBarra()
      end
    end)
  end))
  ejecutar(colocar)
end

-- La ventanita de ajustes de la ventana (la del engranaje), si existe.
local function esconderAjustes()
  local UI = uiComercio()
  local raiz = UI and UI.marco and UI.marco()
  if raiz and raiz.ajustes then
    raiz.ajustes:Hide()
  end
end

local function mostrar()
  local p = marcos.pagina
  if not p then
    return
  end
  visible = true
  p:RegisterEvent("PLAYER_REGEN_DISABLED")
  p:RegisterEvent("PLAYER_REGEN_ENABLED")
  p:RegisterEvent("GET_ITEM_INFO_RECEIVED")
  ejecutar(function()
    colocar()
    repintar()
  end)
end

local function ocultar()
  local p = marcos.pagina
  if not p then
    return
  end
  visible = false
  p:UnregisterEvent("PLAYER_REGEN_DISABLED")
  p:UnregisterEvent("PLAYER_REGEN_ENABLED")
  p:UnregisterEvent("GET_ITEM_INFO_RECEIVED")
  sinTooltip()
  esconderAjustes()
  -- La compra elegida aquí no se queda preparada fuera de su vista (ni su cuadro de cantidad abierto).
  local cuadro = rawget(SNF, "CantidadComercio")
  if cuadro and cuadro.abierto() then
    pcall(cuadro.cerrar)
  end
  if compraNuestra() then
    ejecutar(soltarCompra)
  end
end

local function idioma()
  marcos.salir.texto:SetText(L.t("SUBASTA_RES_SALIR"))
  marcos.titulo:SetText(L.t("SUBASTA_SNIPER_TITULO"))
  marcos.reiniciar:ponerTexto(L.t("SUBASTA_SNIPER_REINICIAR"))
  marcos.grande:ponerTexto(L.t("COMERCIO_SNIPER_EMPEZAR"))
  marcos.descartar:ponerTexto(L.t("COMERCIO_DESCARTAR"))
  marcos.vacio:SetText(L.t("COMERCIO_SNIPER_VACIO"))
  ejecutar(function()
    colocar()
    repintar()
  end)
end

Ventana.registrar("sniper", {crear = crear, mostrar = mostrar, ocultar = ocultar, idioma = idioma})

-- El sniper ha encontrado algo o ha cambiado de estado: con la página a la vista, se repinta.
SNF.escuchar("SNF_COMERCIO_SNIPER", function()
  if visible then
    ejecutar(repintar)
  end
end)

-- La compra cambia (elegida, lista, hecha, error…): la barra, el botón y la fila marcada. Si la compra queda libre, el
-- porqué de «otra compra espera» ya no vale.
SNF.escuchar("SNF_COMERCIO_COMPRA", function(_, e)
  if not (type(e) == "table" and e.fase == "comprando" and e.esperando == "compra") then
    if porQue == "SUBASTA_RES_POR_QUE_OTRA_COMPRA" then
      porQue = nil
    end
  end
  if visible then
    ejecutar(repintar)
  end
end)

-- Cada apertura de la subasta empieza parada y con la tabla vacía (el sniper empieza también con la lista vacía).
SNF.escuchar("SNF_COMERCIO_ABIERTA", function()
  empezado, porQue, elegido = false, nil, nil
  mostradas, fuera = {}, 0
  if marcos.tabla then
    pcall(marcos.tabla.poner, marcos.tabla, {})
  end
end)

SNF.escuchar("SNF_COMERCIO_CERRADA", function()
  empezado = false
end)

-- El comercio se apaga: Comprar se apaga también (el cortafuegos ya no deja pasar nada: un pcall sin más).
SNF.escuchar("SNF_COMERCIO_APAGADO", function()
  if visible and marcos.comprar then
    pcall(marcos.comprar.ponerApagado, marcos.comprar, true)
  end
end)
