-- SnetForever: piezas de la ventana principal (parte 1): árbol con sangría, colores por nivel, botones al pasar el ratón,
-- arrastrar y filtro, con el aspecto de TSM. Lo usarán los grupos del jugador y el árbol de operaciones.
--
-- Amplía SNF.Piezas (lo crea ui/piezas/botones.lua, que va antes en el .toc). Es la pieza VISUAL: los datos de los grupos
-- (SNF.Arbol, más adelante en comercio/) van aparte y solo le pasan nodos.
--
-- Piezas.arbol(padre, opciones) -> a
--                  Un marco (el que se coloca y se mide con SetPoint/SetSize; también vale opciones.ancho y opciones.alto)
--                  con el árbol dentro. Opciones:
--                  - nodos() -> raiz: el nodo de arriba {clave, texto, nivel, hijos = {...}, color?}. La raíz se enseña
--                    como primera fila («Grupo Base») y empieza abierta; el resto empieza cerrado. clave es única y estable
--                    (con ella se recuerda qué está abierto y qué está elegido). nivel (0 = base, 1 a 5) decide el color
--                    del texto (base, nivel1 a nivel5; más de 5 vuelve a empezar) y la sangría; sin nivel vale la
--                    profundidad. color = nombre de un token del tema para cambiar el color de ese nodo.
--                  - alElegir(clave): al pulsar una fila (no al llamar a :elegir).
--                  - botones(clave) -> {{icono, alPulsar, color?}}: iconos del atlas (Tema.icono) que salen a la derecha cuando el
--                    ratón está sobre la fila y siempre en la elegida. Pulsar uno llama a alPulsar(clave) y no elige la fila.
--                    Solo se pide la lista cuando una fila los va a enseñar. color = token del icono sin el ratón encima
--                    (por defecto «apagado»; con el ratón, «texto»).
--                  - colorTriangulo: token de los triángulos ▸/▾ (por defecto «apagado»; Operaciones los quiere blancos, «texto»).
--                  - alSoltar(origen, destino): se arrastra una fila y se suelta sobre otra (con el botón izquierdo).
--                    Soltar sobre sí misma o fuera de las filas no hace nada. Decidir si el destino vale (no se puede meter
--                    un grupo dentro de sí mismo, por ejemplo) es cosa de quien la usa.
--                  - filtro: texto inicial del filtro o función sin argumentos que lo da (se lee en cada :refrescar).
--                  - raizFija: true = la fila de la raíz va sin triángulo, con el texto a 17 px del borde, y no se puede
--                    plegar (sus hijos se ven siempre; pulsarla solo la elige). Por defecto false.
--                  - sinRaiz: true = la fila de la raíz no sale (la raíz solo agrupa: sus hijos van arriba del todo, sin
--                    sangría extra si ellos llevan `nivel`). Por defecto false. La raíz sigue abierta por dentro.
--                  - botonesSiempre(clave) -> bool: si da true, los botones de esa fila se ven siempre, no solo con el
--                    ratón encima o en la elegida (el ⊕ de cada tipo de Operaciones). Por defecto, ninguna.
--                  - marcas(clave) -> true | false | nil: la barra de la izquierda deja de marcar la fila elegida y marca
--                    otra cosa (en Navegar de la subasta, los grupos elegidos para el escaneo de compras). true = barra en
--                    el color de su nivel y sin fondo; false = barra oscura («secundario») y la fila hundida («hundido»);
--                    nil = sin barra y la fila hundida. Las barras miden 5 × 14 px, a 4 px del borde y centradas en la fila.
--                    La fila pulsada no lleva ni el fondo ni la barra de la elegida. Se pregunta por cada fila que se dibuja.
--                  - relleno: token del tema para el hueco que queda debajo de la última fila, que se pinta de ese
--                    color hasta abajo del árbol (en Navegar, «hundido»: el fondo oscuro del árbol llega siempre hasta el
--                    botón de abajo, como en TSM). Con más filas de las que caben no hay hueco. Sin la opción, nada.
--                    Parte: .relleno.
--                  - margen (8 por defecto): px del borde izquierdo de la fila al triángulo del primer nivel (sube o baja todo el
--                    texto; no mueve los botones de la derecha). sangria (12 por defecto): px que se mete cada nivel.
--                  Aspecto: filas de 22 px, sangría de 12 px por nivel, triángulos ▸/▾ en los nodos con hijos. La fila
--                  elegida lleva el fondo «elegida» y una barra de 5 px, a 4 px del borde izquierdo, en el color de su nivel. Desplazamiento
--                  fino: la rueda mueve una fila por muesca y sale una barra de 4 px a la derecha si no cabe todo.
--                  Virtualizado: solo existen las filas que caben más una (se reutilizan al desplazar); con 353 grupos no
--                  hay 353 marcos. La lista plana de lo que se ve se recalcula solo al refrescar, abrir o cerrar un nodo o
--                  filtrar, nunca al desplazar.
--                  Métodos: :refrescar() (vuelve a pedir nodos() y conserva lo abierto y lo elegido), :repintar() (vuelve a
--                  dibujar las filas que se ven, sin pedir nodos(): para cuando cambian las marcas), :elegir(clave) (sin
--                  llamar a alElegir: abre a sus padres y se desplaza hasta ella), :elegida() (la clave), :abrir(clave, si)
--                  (si = false cierra; otro valor abre), :visibles() (cuántas filas hay en total en la lista plana, las
--                  que se ven y las que quedan fuera por desplazamiento) y :filtrar(texto) (también :filtro(texto); vacío
--                  quita el filtro).
--                  Filtro: sin fijarse en mayúsculas ni tildes, enseña los nodos que coinciden y sus padres (abiertos,
--                  aunque estén cerrados). Los hijos de uno que coincide no salen si ellos no coinciden.
--                  Con filtro, el triángulo abre y cierra en un estado propio de la vista filtrada: no toca lo abierto de
--                  verdad, y ese estado se borra al cambiar o quitar el filtro. Al poner un filtro la lista empieza arriba;
--                  al quitarlo se enseña la fila elegida o, si no hay, se vuelve al sitio que tenía antes de filtrar.
--                  Un nodo sin clave se salta (con sus hijos) y se avisa una sola vez por geterrorhandler.
--                  Partes: .filas (el grupo de filas que se reutilizan; cada una con .clave, .texto, .triangulo, .resalte,
--                  .marca y .botones), .barra y .marcoBarra.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
SNF.Piezas = SNF.Piezas or {}
local Piezas = SNF.Piezas
local Tema = SNF.Tema

local proteger = Piezas.proteger
local pintar = Piezas.interno.pintar
local plana = Piezas.interno.plana
local colorTexto = Piezas.interno.colorTexto
local botonBase = Piezas.interno.botonBase
local ponerBarra = Piezas.interno.ponerBarra
local ANCHO_BARRA = Piezas.interno.ANCHO_BARRA

local ALTO_FILA = 22
local SANGRIA = 12 -- por nivel
local ANCHO_MARCA = 5 -- barra izquierda de la fila elegida
local MARGEN_MARCAS = 4 -- con la opción marcas, la barra deja 4 px arriba y abajo (14 px en una fila de 22)
local SANGRIA_MARCA = 4 -- de la barra al borde izquierdo de la fila
local MARGEN = 8 -- del borde de la fila al triángulo y del último botón al borde derecho
local ICONO = 12
local ZONA = 16 -- zona para pulsar un icono (triángulo o botón)
local HUECO = 4 -- entre el triángulo y el texto
local TEXTO_RAIZ_FIJA = 17 -- dónde empieza el texto de la raíz sin triángulo (gr-01)

-- Minúsculas y sin tildes, para buscar sin fijarse en ellas. string.lower del juego solo conoce las letras sin tilde;
-- las vocales con tilde, la ñ y la ü (UTF-8, dos bytes) se cambian a mano. (La misma idea que ui/comercio.lua: la pieza va
-- antes en el .toc y se queda con su copia; las que vengan pueden usar Piezas.interno.sinTildes.)
local SIN_TILDE = {
  ["á"] = "a", ["é"] = "e", ["í"] = "i", ["ó"] = "o", ["ú"] = "u", ["ü"] = "u", ["ñ"] = "n",
  ["Á"] = "a", ["É"] = "e", ["Í"] = "i", ["Ó"] = "o", ["Ú"] = "u", ["Ü"] = "u", ["Ñ"] = "n",
}
local function sinTildes(texto)
  local s = string.gsub(tostring(texto or ""), "[\195][\128-\191]", function(c)
    return SIN_TILDE[c]
  end)
  return string.lower(s)
end
Piezas.interno.sinTildes = sinTildes

-- Llama a fn protegida y devuelve su resultado (nil si falla: el error va a geterrorhandler()).
local function llamar(fn, ...)
  if not fn then
    return nil
  end
  local n, args = select("#", ...), {...}
  local ok, resultado = xpcall(function()
    return fn(unpack(args, 1, n))
  end, geterrorhandler())
  if ok then
    return resultado
  end
  return nil
end

-- El token de color de un nivel: 0 (o menos) es el base, blanco; de 1 a 5 su color, y más de 5 vuelve a empezar.
local function tokenDeNivel(nivel)
  if not nivel or nivel <= 0 then
    return "base"
  end
  return "nivel" .. (((math.floor(nivel) - 1) % 5) + 1)
end

-- ¿Está el ratón encima de este marco? true o false; nil si el cliente no sabe decirlo.
local function ratonSobre(marco)
  if type(marco.IsMouseOver) == "function" then
    local ok, r = pcall(marco.IsMouseOver, marco)
    if ok then
      return r and true or false
    end
  end
  local global = rawget(_G, "MouseIsOver")
  if type(global) == "function" then
    local ok, r = pcall(global, marco)
    if ok then
      return r and true or false
    end
  end
  return nil
end

function Piezas.arbol(padre, opciones)
  opciones = opciones or {}
  local raizFija = opciones.raizFija == true
  local sinRaiz = opciones.sinRaiz == true
  local margenIzq = tonumber(opciones.margen) or MARGEN
  local sangria = tonumber(opciones.sangria) or SANGRIA
  local marcas = opciones.marcas
  local a = CreateFrame("Frame", nil, padre)
  if opciones.ancho or opciones.alto then
    a:SetSize(opciones.ancho or 200, opciones.alto or 220)
  end
  if a.SetClipsChildren then
    a:SetClipsChildren(true) -- la fila de abajo, si asoma a medias, se recorta
  end
  a:EnableMouseWheel(true)
  a.filas = {}

  -- Los datos. Una «entrada» es {nodo, padre (entrada), prof, norm (texto sin tildes), hijos (lista o nil)}.
  local indice = {} -- clave -> entrada (todos los nodos; se rehace solo en :refrescar)
  local raiz -- la entrada de arriba
  local lista = {} -- las entradas que se ven, en orden (con filtro, solo las que coinciden y sus padres)
  local abiertos = {} -- clave -> true/false, lo que el jugador abrió o cerró
  local elegida -- la clave elegida
  local filtro = "" -- ya sin tildes ni mayúsculas
  local inicio = 0 -- cuántas entradas quedan por encima de la primera fila
  local abiertosFiltro = {} -- clave -> true/false: lo abierto o cerrado con el triángulo mientras hay filtro (solo de esa vista)
  local inicioPrevio -- el inicio que había al poner el filtro, para volver a él al quitarlo
  local avisado = false -- ya se avisó de un nodo sin clave
  a.reconstrucciones = 0 -- cuántas veces se ha rehecho la lista plana (para las pruebas: la rueda nunca la rehace)
  a.asignaciones = 0

  local function normalizarFiltro(texto)
    local limpio = string.gsub(tostring(texto or ""), "^%s+", "")
    limpio = string.gsub(limpio, "%s+$", "")
    return sinTildes(limpio)
  end

  local function estaAbierto(e)
    if raizFija and e.prof == 0 then
      return true -- la raíz sin triángulo no se pliega: sus hijos se ven siempre
    end
    local v = abiertos[e.nodo.clave]
    if v == nil then
      return e.prof == 0
    end
    return v
  end

  -- Lo que se enseña en el triángulo: con filtro, abiertos los padres de lo que coincide.
  local function seVeAbierto(e)
    if raizFija and e.prof == 0 then
      return true
    end
    if filtro ~= "" then
      return e.abiertaFiltro == true
    end
    return estaAbierto(e)
  end

  -- Un nodo sin clave no se puede recordar ni elegir: se salta con lo que cuelga de él y se avisa una sola vez.
  local function indexar(nodo, padreEntrada, prof)
    if type(nodo) ~= "table" or nodo.clave == nil then
      if not avisado then
        avisado = true
        geterrorhandler()("SnetForever: Piezas.arbol: un nodo sin clave se salta (con sus hijos)")
      end
      return nil
    end
    local e = {nodo = nodo, padre = padreEntrada, prof = prof, norm = sinTildes(nodo.texto)}
    indice[nodo.clave] = e
    if nodo.hijos and #nodo.hijos > 0 then
      local hijos = {} -- entradas, no nodos
      for _, h in ipairs(nodo.hijos) do
        hijos[#hijos + 1] = indexar(h, e, prof + 1)
      end
      if #hijos > 0 then
        e.hijos = hijos
      end
    end
    return e
  end

  -- La lista plana sin filtro: cada nodo y, si está abierto, sus hijos.
  local function llenar(e, salida)
    salida[#salida + 1] = e
    if e.hijos and estaAbierto(e) then
      for _, h in ipairs(e.hijos) do
        llenar(h, salida)
      end
    end
  end

  -- La lista plana con filtro: lo que coincide y sus padres. Devuelve si e o algo de debajo coincide; si no, lo que
  -- añadió de más se quita.
  local function llenarFiltrado(e, salida)
    local pos = #salida + 1
    salida[pos] = e
    local alguno = string.find(e.norm, filtro, 1, true) ~= nil
    if e.hijos then
      for _, h in ipairs(e.hijos) do
        if llenarFiltrado(h, salida) then
          alguno = true
        end
      end
    end
    if not alguno then
      for k = #salida, pos, -1 do
        salida[k] = nil
      end
      e.abiertaFiltro = false
      e.filteredChildren = false
      return false
    end
    e.filteredChildren = #salida > pos
    -- Los padres de lo que coincide salen abiertos, salvo los que el jugador cerró con el triángulo en esta vista filtrada.
    if abiertosFiltro[e.nodo.clave] == false and not (raizFija and e.prof == 0) then
      for k = #salida, pos + 1, -1 do
        salida[k] = nil
      end
    end
    e.abiertaFiltro = #salida > pos
    return true
  end

  local function reconstruir()
    a.reconstrucciones = a.reconstrucciones + 1
    lista = {}
    if raiz then
      if filtro ~= "" then
        llenarFiltrado(raiz, lista)
      else
        llenar(raiz, lista)
      end
      -- Sin raíz visible: sus hijos quedan arriba del todo.
      if sinRaiz and lista[1] == raiz then
        table.remove(lista, 1)
      end
    end
  end

  -- Cuántas filas enteras caben (hasta donde se puede desplazar) y cuántas hay que dibujar (con la de abajo a medias).
  local function medidas()
    local alto = a:GetHeight() or 0
    return math.max(1, math.floor(alto / ALTO_FILA)), math.max(1, math.ceil(alto / ALTO_FILA))
  end

  -- Desplaza la lista (sin dibujar) lo justo para que la entrada se vea. Devuelve false si no está en la lista.
  local function mostrar(e)
    local completas = medidas()
    for pos, x in ipairs(lista) do
      if x == e then
        if pos - 1 < inicio then
          inicio = pos - 1
        elseif pos > inicio + completas then
          inicio = pos - completas
        end
        return true
      end
    end
    return false
  end

  ---------------------------------------------------------------------------------------------------
  -- Las filas (se crean las que hacen falta y se reutilizan)
  ---------------------------------------------------------------------------------------------------

  local asignar -- (más abajo) pone en las filas lo que toca según `inicio`

  local function claveBajoCursor()
    local cx, cy = GetCursorPosition()
    local escala = a:GetEffectiveScale()
    local izquierda, arriba = a:GetLeft(), a:GetTop()
    if not cx or not cy or not escala or escala == 0 or not izquierda or not arriba then
      return nil
    end
    local x, y = cx / escala, cy / escala
    local alto, ancho = a:GetHeight() or 0, a:GetWidth() or 0
    if x < izquierda or x > izquierda + ancho or y > arriba or y < arriba - alto then
      return nil
    end
    local e = lista[inicio + math.floor((arriba - y) / ALTO_FILA) + 1]
    return e and e.nodo.clave or nil
  end

  -- Enseña (o esconde) los botones de una fila: con el ratón encima o en la elegida.
  local function ajustarBotones(f)
    local e = f.entrada
    local defs = nil
    local siempre = opciones.botonesSiempre and llamar(opciones.botonesSiempre, f.clave) == true
    if e and f:IsShown() and (f.sobre or f.clave == elegida or siempre) and opciones.botones then
      defs = llamar(opciones.botones, f.clave)
    end
    defs = defs or {}
    local n = #defs
    for i, d in ipairs(defs) do
      local b = f.botones[i]
      if not b then
        b = botonBase(f, function(self)
          if self.accion then
            self.accion(self.clave)
          end
        end)
        b:SetSize(ZONA, ZONA)
        local t = b:CreateTexture(nil, "OVERLAY")
        t:SetSize(ICONO, ICONO)
        t:SetPoint("CENTER", b, "CENTER", 0, 0)
        b.icono = t
        b:SetScript("OnEnter", proteger(function(self)
          pintar(self.icono, "texto")
          f.sobre = true
          ajustarBotones(f)
        end))
        b:SetScript("OnLeave", proteger(function(self)
          pintar(self.icono, self.color or "apagado")
          local sobre = ratonSobre(f)
          f.sobre = sobre == true
          ajustarBotones(f)
        end))
        Piezas.ayuda(b, function()
          if b.helpText then
            return b.helpText()
          end
        end, {espera = 0.2})
        f.botones[i] = b
      end
      Tema.icono(b.icono, d.icono)
      b.color = d.color
      pintar(b.icono, d.color or "apagado")
      b.clave, b.accion = f.clave, d.alPulsar
      b.helpText = d.ayuda
      b:ClearAllPoints()
      b:SetPoint("RIGHT", f, "RIGHT", -(MARGEN - 2 + (n - i) * ZONA), 0)
      b:Show()
    end
    for i = n + 1, #f.botones do
      f.botones[i]:Hide()
    end
    f.texto:ClearAllPoints()
    f.texto:SetPoint("LEFT", f, "LEFT", f.textoX, 0)
    f.texto:SetPoint("RIGHT", f, "RIGHT", -(MARGEN + (n > 0 and (n * ZONA + HUECO) or 0)), 0)
  end

  local function alternar(f)
    local e = f.entrada
    if e and e.hijos then
      a:abrir(f.clave, not seVeAbierto(e))
    end
  end

  local function nuevaFila(i)
    local f = botonBase(a, function(self)
      elegida = self.clave
      asignar()
      llamar(opciones.alElegir, self.clave)
    end)
    f:SetHeight(ALTO_FILA)
    f.botones = {}
    f.sobre = false

    f.resalte = plana(f, "BACKGROUND", 0)
    f.resalte:SetAllPoints(f)
    pintar(f.resalte, "elegida")
    f.resalte:Hide()

    f.marca = plana(f, "ARTWORK", 0)
    local vertical = marcas and MARGEN_MARCAS or 0
    f.marca:SetPoint("TOPLEFT", f, "TOPLEFT", SANGRIA_MARCA, -vertical)
    f.marca:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", SANGRIA_MARCA, vertical)
    f.marca:SetWidth(ANCHO_MARCA)
    f.marca:Hide()

    f.triangulo = botonBase(f, function()
      alternar(f)
    end)
    f.triangulo:SetSize(ZONA, ZONA)
    f.triangulo.snfSinAyuda = "tree disclosure"
    f.triangulo.icono = f.triangulo:CreateTexture(nil, "OVERLAY")
    f.triangulo.icono:SetSize(ICONO, ICONO)
    f.triangulo.icono:SetPoint("CENTER", f.triangulo, "CENTER", 0, 0)
    Tema.icono(f.triangulo.icono, "cerrado")
    pintar(f.triangulo.icono, opciones.colorTriangulo or "apagado")

    f.texto = Tema.letra(f:CreateFontString(nil, "OVERLAY"), "texto")
    f.texto:SetJustifyH("LEFT")
    f.texto:SetWordWrap(false)

    f:SetScript("OnEnter", proteger(function(self)
      self.sobre = true
      ajustarBotones(self)
    end))
    f:SetScript("OnLeave", proteger(function(self)
      -- Al pasar del texto a uno de sus botones la fila sigue con el ratón encima.
      self.sobre = ratonSobre(self) == true
      ajustarBotones(self)
    end))

    -- Arrastrar: al soltar se mira qué fila hay bajo el cursor (las filas se reutilizan y el cursor no entra en ellas
    -- mientras se arrastra, así que no vale fiarse de OnEnter).
    if opciones.alSoltar then
      f:RegisterForDrag("LeftButton")
      f:SetScript("OnDragStart", proteger(function(self)
        a.origen = self.clave
      end))
      f:SetScript("OnDragStop", proteger(function()
        local origen = a.origen
        a.origen = nil
        if not origen then
          return
        end
        local destino = claveBajoCursor()
        if destino and destino ~= origen then
          llamar(opciones.alSoltar, origen, destino)
        end
      end))
    end

    a.filas[i] = f
    return f
  end

  -- Pone una entrada en una fila: texto, sangría, color de su nivel, triángulo, fondo y barra de la elegida.
  local function ponerFila(f, e, i)
    local nodo = e.nodo
    f.clave, f.entrada = nodo.clave, e
    f:ClearAllPoints()
    f:SetPoint("TOPLEFT", a, "TOPLEFT", 0, -(i - 1) * ALTO_FILA)
    f:SetPoint("TOPRIGHT", a, "TOPRIGHT", 0, -(i - 1) * ALTO_FILA)
    f:SetHeight(ALTO_FILA)

    local nivel = nodo.nivel or e.prof
    local izquierda = margenIzq + sangria * math.max(0, nivel)
    f.textoX = izquierda + ICONO + HUECO
    local sinTriangulo = raizFija and e.prof == 0
    if sinTriangulo then
      f.textoX = TEXTO_RAIZ_FIJA
    end
    local token = nodo.color or tokenDeNivel(nivel)
    f.texto:SetText(nodo.texto or "")
    colorTexto(f.texto, token)

    f.triangulo:ClearAllPoints()
    f.triangulo:SetPoint("LEFT", f, "LEFT", izquierda - (ZONA - ICONO) / 2, 0)
    if e.hijos and not sinTriangulo then
      Tema.icono(f.triangulo.icono, seVeAbierto(e) and "abierto" or "cerrado")
      f.triangulo:Show()
    else
      f.triangulo:Hide()
    end

    if marcas then
      -- La barra marca lo que diga marcas(clave), no la fila elegida.
      local estado = llamar(marcas, nodo.clave)
      if estado == true then
        f.resalte:Hide()
        pintar(f.marca, token)
        f.marca:Show()
      else
        pintar(f.resalte, "hundido")
        f.resalte:Show()
        if estado == false then
          pintar(f.marca, "secundario")
          f.marca:Show()
        else
          f.marca:Hide()
        end
      end
    elseif nodo.clave == elegida then
      f.resalte:Show()
      pintar(f.marca, token)
      f.marca:SetShown(not opciones.sinBarraElegida)
    else
      f.resalte:Hide()
      f.marca:Hide()
    end

    -- Las filas se reutilizan: se mira de nuevo dónde está el ratón (si el cliente no sabe decirlo, no está encima).
    f.sobre = ratonSobre(f) == true
    f:Show()
    ajustarBotones(f)
  end

  asignar = function()
    a.asignaciones = a.asignaciones + 1
    local n = #lista
    local completas, dibujadas = medidas()
    inicio = math.max(0, math.min(inicio, n - completas))
    for i = 1, dibujadas do
      local e = lista[inicio + i]
      if e then
        ponerFila(a.filas[i] or nuevaFila(i), e, i)
      elseif a.filas[i] then
        a.filas[i]:Hide()
      end
    end
    for i = dibujadas + 1, #a.filas do
      a.filas[i]:Hide()
    end
    ponerBarra(a.barra, a, completas * ALTO_FILA, 0, completas, n, inicio)
    -- El hueco bajo la última fila, del color del relleno hasta abajo del árbol (solo cambia al cambiar la lista o el alto).
    if a.relleno then
      local usado = math.min(dibujadas, math.max(0, n - inicio)) * ALTO_FILA
      if usado < (a:GetHeight() or 0) then
        a.relleno:ClearAllPoints()
        a.relleno:SetPoint("TOPLEFT", a, "TOPLEFT", 0, -usado)
        a.relleno:SetPoint("BOTTOMRIGHT", a, "BOTTOMRIGHT", 0, 0)
        a.relleno:Show()
      else
        a.relleno:Hide()
      end
    end
  end

  -- Con la opción relleno, una textura detrás de las filas para el hueco de debajo de la última.
  if opciones.relleno then
    a.relleno = plana(a, "BACKGROUND", 0)
    pintar(a.relleno, opciones.relleno)
    a.relleno:Hide()
  end

  -- La barra va en un marco hijo por encima de las filas (como en el desplegable): el fondo de una fila nunca la tapa.
  local marcoBarra = CreateFrame("Frame", nil, a)
  marcoBarra:SetAllPoints(a)
  marcoBarra:SetFrameLevel(a:GetFrameLevel() + 5)
  a.marcoBarra = marcoBarra
  a.barra = plana(marcoBarra, "OVERLAY", 0)
  pintar(a.barra, "apagado")
  a.barra:SetWidth(ANCHO_BARRA)
  a.barra:Hide()

  ---------------------------------------------------------------------------------------------------
  -- Métodos
  ---------------------------------------------------------------------------------------------------

  -- Cambia el texto del filtro (ya normalizado). Al cambiarlo se borra lo abierto en la vista filtrada. Al ponerlo la lista
  -- empieza arriba y se recuerda dónde estaba; al quitarlo se enseña la fila elegida o, si no hay, se vuelve a ese sitio.
  local function ponerFiltro(nuevo)
    if nuevo == filtro then
      return
    end
    local antes = filtro
    filtro = nuevo
    abiertosFiltro = {}
    reconstruir()
    if nuevo == "" then
      local e = elegida and indice[elegida]
      if not (e and mostrar(e)) then
        inicio = inicioPrevio or inicio
      end
      inicioPrevio = nil
    else
      if antes == "" then
        inicioPrevio = inicio
      end
      inicio = 0
    end
  end

  function a:refrescar()
    indice = {}
    local r = llamar(opciones.nodos)
    raiz = r and indexar(r, nil, 0) or nil
    if type(opciones.filtro) == "function" then
      local t = llamar(opciones.filtro)
      if type(t) == "string" then
        ponerFiltro(normalizarFiltro(t))
      end
    end
    reconstruir()
    asignar()
  end

  function a:filtrar(texto)
    ponerFiltro(normalizarFiltro(texto))
    reconstruir()
    asignar()
  end
  a.filtro = a.filtrar

  -- Con filtro, el triángulo toca solo el estado de la vista filtrada; sin filtro, lo abierto de verdad.
  function a:abrir(clave, si)
    if raizFija and raiz and clave == raiz.nodo.clave then
      return -- la raíz sin triángulo siempre está abierta
    end
    local estado = filtro ~= "" and abiertosFiltro or abiertos
    estado[clave] = si ~= false
    reconstruir()
    asignar()
  end

  local function canFold(e)
    return e.hijos and not (raizFija and e.prof == 0) and (filtro == "" or e.filteredChildren)
  end

  function a:hayCerrado()
    for _, e in ipairs(lista) do
      if canFold(e) and not seVeAbierto(e) then
        return true
      end
    end
    return false
  end

  function a:abrirTodos(si)
    local estado = filtro ~= "" and abiertosFiltro or abiertos
    for clave, e in pairs(indice) do
      if canFold(e) then
        estado[clave] = si ~= false
      end
    end
    reconstruir()
    if si ~= false and elegida and indice[elegida] then
      mostrar(indice[elegida])
    end
    asignar()
  end

  function a:alternarTodos()
    self:abrirTodos(self:hayCerrado())
  end

  function a:elegir(clave)
    elegida = clave
    local e = indice[clave]
    if e then
      -- Se abren sus padres para que se vea.
      local estado = filtro ~= "" and abiertosFiltro or abiertos
      local cambio = false
      local p = e.padre
      while p do
        if not seVeAbierto(p) then
          estado[p.nodo.clave] = true
          cambio = true
        end
        p = p.padre
      end
      if cambio then
        reconstruir()
      end
      mostrar(e) -- y se desplaza hasta ella si no está a la vista
    end
    asignar()
  end

  function a:elegida()
    return elegida
  end

  function a:repintar()
    asignar()
  end

  function a:visibles()
    return #lista
  end

  ---------------------------------------------------------------------------------------------------
  -- Rueda, tamaño y mostrar
  ---------------------------------------------------------------------------------------------------

  -- La rueda desplaza una fila por muesca, sin pasar del principio ni del final. Solo se reasignan las filas que hay.
  a:SetScript("OnMouseWheel", proteger(function(_, delta)
    local completas = medidas()
    local nuevo = inicio - (delta > 0 and 1 or -1)
    nuevo = math.max(0, math.min(math.max(0, #lista - completas), nuevo))
    if nuevo ~= inicio then
      inicio = nuevo
      asignar()
    end
  end))
  a:SetScript("OnSizeChanged", proteger(function()
    asignar()
  end))
  a:SetScript("OnShow", proteger(function()
    a:refrescar()
  end))

  if type(opciones.filtro) == "string" then
    filtro = normalizarFiltro(opciones.filtro)
  end
  a:refrescar()
  return a
end
