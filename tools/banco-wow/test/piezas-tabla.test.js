// Pieza tabla de la ventana principal (ui/piezas/tabla.lua, SnetForever.Piezas.tabla): cabecera con ⋮ y ✓, orden con línea
// amarilla, columnas flex, menú para esconder columnas (que se recuerda), marcas por clave, barra de totales y filas
// reutilizadas (virtualizada; hasta 11.630 objetos).
import assert from 'node:assert/strict';
// 0.7.0: todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo
// (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

// Una tabla con `n` filas {clave = "k<i>", nombre = "Objeto <i>", cant = i % 7 + 1, precio = i * 100}, en un marco de
// 400 px de ancho. Con totales la tabla mide 264 px (22 de cabecera + 10 filas de 22 + 22 de totales) y sin ellos 242.
// B3r: las filas siguen a la letra del tema (Tema.ALTO_FILA, 22 px con Montserrat Medium 12; antes 18,5 con Roboto 11 y la
// tabla medía 264 y 242).
// Columnas: nombre (flex), cant (60 px, a la derecha) y precio (90 px, a la derecha, con `pintar`).
// `extra` es código Lua que se ejecuta antes de crear la tabla y puede cambiar `opc` (las opciones).
const TABLA = (n = 30, extra = '') => `
    local P = SnetForever.Piezas
    local T = SnetForever.Tema
    local marco = CreateFrame("Frame", nil, UIParent)
    marco:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, 100)
    marco:SetSize(400, 300)
    local filas = {}
    for i = 1, ${n} do
      filas[i] = {clave = "k" .. i, nombre = "Objeto " .. i, cant = i % 7 + 1, precio = i * 100}
    end
    local pintadas = 0
    local ordenados = {}
    local opc = {
      marcar = true, menu = true,
      columnas = {
        {clave = "nombre", titulo = "Nombre", flex = 1, valor = function(f) return f.nombre end},
        {clave = "cant", titulo = "Cant", ancho = 60, justificado = "RIGHT", valor = function(f) return f.cant end},
        {clave = "precio", titulo = "Precio", ancho = 90, justificado = "RIGHT", valor = function(f) return f.precio end,
          pintar = function(celda, f) pintadas = pintadas + 1; celda.texto:SetText("$" .. f.precio) end},
      },
      totales = function(lista, marcadas)
        local m = 0
        for _ in pairs(marcadas) do m = m + 1 end
        return "Total: " .. #lista .. " objetos, " .. m .. " marcados"
      end,
      alOrdenar = nil,
    }
    ${extra}
    local t = P.tabla(marco, opc)
    t:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
    t:SetSize(400, opc.totales and 264 or 242)
    t:poner(filas)
    -- Las claves de las filas que se ven, de arriba abajo.
    local function claves()
      local r = {}
      for _, f in ipairs(t.filas) do
        if f:IsShown() then r[#r + 1] = f.clave end
      end
      return r
    end
    local function textoCelda(i, col)
      return t.filas[i].celdas[col].texto:GetText()
    end
    local function rueda(delta, veces)
      for _ = 1, veces or 1 do t:GetScript("OnMouseWheel")(t, delta) end
    end`;

// B3r: filas de Tema.ALTO_FILA (22 px) con la letra «tabla» (Montserrat Medium 12) y títulos en «cabecera» (Montserrat
// Medium 11); antes, filas de 18,5 px en Roboto 11 y títulos en Roboto Medium 10.
test('cabecera #232122 con ⋮ y ✓; filas de 22 px en Barlow', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA()}
    local ref = UIParent:CreateTexture()
    T.icono(ref, "menu")
    local menu = {ref:GetTexCoord()}
    T.icono(ref, "tilde")
    local tilde = {ref:GetTexCoord()}
    local f1, f2 = t.filas[1], t.filas[2]
    local _, _, _, _, y2 = f2:GetPoint(1)
    local cab = t.cabeceras.nombre.texto
    local fuenteCab, tamCab = cab:GetFont()
    local fuenteFila, tamFila = f1.celdas.nombre.texto:GetFont()
    local fuenteTot = t.textoTotales:GetFont()
    return {
      fondoCab = {t.fondoCabecera:GetVertexColor()},
      fondoCuerpo = {t.fondoCuerpo:GetVertexColor()},
      menu = menu, tilde = tilde,
      iconoMenu = {t.botonMenu.icono:GetTexCoord()}, iconoTilde = {t.botonMarcar.icono:GetTexCoord()},
      menuMostrado = t.botonMenu:IsShown(), marcarMostrado = t.botonMarcar:IsShown(),
      alto1 = f1:GetHeight(), alto2 = f2:GetHeight(), y2 = y2,
      textoCab = cab:GetText(), colorCab = {cab:GetTextColor()}, fuenteCab = fuenteCab, tamCab = tamCab,
      fuenteFila = fuenteFila, tamFila = tamFila, colorFila = {f1.celdas.nombre.texto:GetTextColor()},
      celdas = {textoCelda(1, "nombre"), textoCelda(1, "cant"), textoCelda(1, "precio"), textoCelda(2, "nombre")},
      justCant = t.filas[1].celdas.cant.texto:GetJustifyH(), justCabCant = t.cabeceras.cant.texto:GetJustifyH(),
      filas = #t.filas, pintadas = pintadas,
    }
  end)()`);
  assert.equal(aHex(r.fondoCab), '232122', 'cabecera en secundario');
  assert.equal(aHex(r.fondoCuerpo), '110e0f', 'filas sobre hundido');
  assert.deepEqual(r.iconoMenu, r.menu, 'el ⋮ es el icono menu');
  assert.deepEqual(r.iconoTilde, r.tilde, 'el ✓ es el icono tilde');
  assert.notDeepEqual(r.menu, r.tilde);
  assert.equal(r.menuMostrado, true);
  assert.equal(r.marcarMostrado, true);
  assert.equal(r.alto1, 22, 'filas de 22 px (Tema.ALTO_FILA)');
  assert.equal(r.alto2, 22);
  assert.equal(r.y2, -22, 'la segunda fila empieza a 22 px de la primera');
  assert.equal(r.textoCab, 'Nombre');
  assert.equal(aHex(r.colorCab), 'a99b8e', 'texto de cabecera gris');
  assert.match(r.fuenteCab, /BarlowSemiCondensed-SemiBold\.ttf$/);
  assert.equal(r.tamCab, 11, 'cabecera de 11 px');
  assert.match(r.fuenteFila, /BarlowSemiCondensed-Medium\.ttf$/);
  assert.equal(r.tamFila, 12);
  assert.equal(aHex(r.colorFila), 'f5e8d4');
  assert.deepEqual(r.celdas, ['Objeto 1', '2', '$100', 'Objeto 2'], 'valor(fila) pone el texto y pintar lo cambia');
  assert.equal(r.justCant, 'RIGHT');
  assert.equal(r.justCabCant, 'RIGHT', 'la cabecera sigue la justificación de su columna');
  assert.ok(r.filas <= 11, `como mucho 10 filas más una: ${r.filas}`);
  sinErrores(m);
});

test('pulsar una cabecera ordena y pone la línea amarilla de 2 px; otra vez, al revés', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA()}
    local function linea(clave)
      local b = t.cabeceras[clave]
      local punto, rel, _, x, y = b.linea:GetPoint(1)
      return {mostrada = b.linea:IsShown(), alto = b.linea:GetHeight(), color = {b.linea:GetVertexColor()},
        punto = punto, esLaCabecera = rel == b, x = x, y = y, fondo = b.fondo:IsShown(), colorFondo = {b.fondo:GetVertexColor()}}
    end
    local sin = {linea("nombre").mostrada, linea("cant").mostrada, linea("precio").mostrada}
    local antes = claves()
    t.cabeceras.cant:Click()
    local asc = {claves = claves(), cant = linea("cant"), nombre = linea("nombre").mostrada, orden = {t:orden()}}
    t.cabeceras.cant:Click()
    local desc = {claves = claves(), cant = linea("cant"), orden = {t:orden()}}
    t.cabeceras.nombre:Click()
    local nombre = {claves = claves(), cant = linea("cant").mostrada, nombre = linea("nombre").mostrada}
    t.cabeceras.nombre:Click()
    return {sin = sin, antes = antes, asc = asc, desc = desc, nombre = nombre, final = claves(),
      ordenaciones = t.ordenaciones, originalIntacto = filas[1].clave .. filas[2].clave .. filas[30].clave}
  end)()`);
  assert.deepEqual(r.sin, [false, false, false], 'sin orden no hay línea');
  assert.equal(r.antes[0], 'k1');
  // cant = i % 7 + 1: la 1 son k7, k14, k21, k28 (en el orden de la lista: el orden es estable).
  assert.deepEqual(r.asc.claves.slice(0, 5), ['k7', 'k14', 'k21', 'k28', 'k1'], 'ascendente y estable con valores iguales');
  assert.equal(r.asc.cant.mostrada, true);
  assert.equal(r.asc.cant.alto, 2, 'línea de 2 px');
  assert.equal(aHex(r.asc.cant.color), 'e6ac72', 'línea acento');
  assert.equal(r.asc.cant.punto, 'TOPLEFT', 'encima de la cabecera');
  assert.equal(r.asc.cant.esLaCabecera, true);
  assert.equal(r.asc.cant.y, 0);
  assert.equal(r.asc.cant.fondo, true);
  assert.equal(aHex(r.asc.cant.colorFondo), '49372c', 'la columna ordenada lleva fondo pestanaElegida');
  assert.equal(r.asc.nombre, false, 'solo la columna ordenada lleva línea');
  assert.deepEqual(r.asc.orden, ['cant', true]);
  // Al revés: cant 7 primero (i % 7 == 6: k6, k13, k20, k27), también estable.
  assert.deepEqual(r.desc.claves.slice(0, 5), ['k6', 'k13', 'k20', 'k27', 'k5'], 'otra vez, descendente');
  assert.deepEqual(r.desc.orden, ['cant', false]);
  assert.equal(r.desc.cant.mostrada, true);
  assert.deepEqual(r.nombre.claves.slice(0, 4), ['k1', 'k10', 'k11', 'k12'], 'por texto, sin fijarse en mayúsculas');
  assert.equal(r.nombre.cant, false, 'la línea se pasa a la columna nueva');
  assert.equal(r.nombre.nombre, true);
  assert.equal(r.final[0], 'k9', 'nombre descendente: «objeto 9» va el último y sale el primero');
  assert.equal(r.ordenaciones, 4, 'se ordena al pulsar, una vez por pulsación');
  assert.equal(r.originalIntacto, 'k1k2k30', 'la lista que se pasa no se toca');
  sinErrores(m);
});

test('orden: los valores nil van al final (suba o baje), alOrdenar solo avisa y orden inicial', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(6, `
      for i = 1, 6 do filas[i].cant = nil end
      filas[2].cant, filas[4].cant, filas[5].cant = 5, 1, 5
      opc.menu = false
      opc.orden = {clave = "cant", asc = true}`)}
    local inicial = claves()
    t.cabeceras.cant:Click() -- era ascendente: ahora descendente
    local desc = claves()
    -- Con alOrdenar la pieza no ordena: solo avisa y marca la columna.
    local avisos = {}
    local marco2 = CreateFrame("Frame", nil, UIParent)
    local t2 = P.tabla(marco2, {
      columnas = {{clave = "cant", titulo = "Cant", ancho = 60, valor = function(f) return f.cant end}},
      alOrdenar = function(clave, asc) avisos[#avisos + 1] = {clave, asc} end,
      orden = {clave = "cant", asc = false},
    })
    t2:SetPoint("TOPLEFT", marco2, "TOPLEFT", 0, 0)
    t2:SetSize(200, 100)
    t2:poner(filas)
    local primeras = {}
    for i = 1, 6 do primeras[i] = t2:fila(i).clave end
    t2.cabeceras.cant:Click()
    return {inicial = inicial, desc = desc, avisos = avisos, primeras = primeras,
      sinOrdenar = t2.ordenaciones, lineaMostrada = t2.cabeceras.cant.linea:IsShown(), orden2 = {t2:orden()}}
  end)()`);
  // k4 (1), k2 y k5 (5, en su orden), y al final los nil: k1, k3, k6.
  assert.deepEqual(r.inicial, ['k4', 'k2', 'k5', 'k1', 'k3', 'k6'], 'ascendente con los nil al final y estable');
  assert.deepEqual(r.desc, ['k2', 'k5', 'k4', 'k1', 'k3', 'k6'], 'descendente: los nil siguen al final');
  assert.deepEqual(r.avisos, [['cant', true]], 'alOrdenar recibe la clave y el sentido; la primera vez, ascendente');
  assert.deepEqual(r.primeras, ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'], 'con alOrdenar la pieza no reordena la lista');
  assert.equal(r.sinOrdenar, 0);
  assert.equal(r.lineaMostrada, true, 'pero la línea se mueve');
  assert.deepEqual(r.orden2, ['cant', true]);
  sinErrores(m);
});

test('el menú ⋮ esconde una columna y se recuerda', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local guardado = nil
    local sets = 0
    local recordar = {
      get = function() return guardado end,
      set = function(v) guardado = v; sets = sets + 1 end,
    }
    ${TABLA(30, 'opc.recordar = recordar')}
    local anchoNombreAntes = t.cabeceras.nombre:GetWidth()
    local lista0 = rawget(_G, "SnetForeverDesplegableLista")
    local antes = lista0 == nil or not lista0:IsShown()
    t.botonMenu:Click()
    local lista = _G.SnetForeverDesplegableLista
    local abierta = lista:IsShown()
    local textos, tildes = {}, {}
    for i = 1, 3 do
      textos[i] = lista.filas[i].texto:GetText()
      tildes[i] = lista.filas[i].tilde:IsShown()
    end
    lista.filas[2]:Click() -- Cant
    local _, _, _, xPrecio = t.cabeceras.precio:GetPoint(1)
    local tras = {
      cant = t.cabeceras.cant:IsShown(), nombre = t.cabeceras.nombre:IsShown(),
      celdaCant = t.filas[1].celdas.cant:IsShown(), celdaNombre = t.filas[1].celdas.nombre:IsShown(),
      guardado = guardado, sets = sets,
      anchoNombre = t.cabeceras.nombre:GetWidth(), xPrecio = xPrecio,
      tilde2 = lista.filas[2].tilde:IsShown(), abierta = lista:IsShown(),
    }
    -- Se recuerda: otra tabla con el mismo recordar nace ya sin esa columna.
    local marco2 = CreateFrame("Frame", nil, UIParent)
    local t2 = P.tabla(marco2, {
      columnas = opc.columnas, menu = true, recordar = recordar,
    })
    t2:SetPoint("TOPLEFT", marco2, "TOPLEFT", 0, 0)
    t2:SetSize(400, 242)
    t2:poner(filas)
    local otra = {cant = t2.cabeceras.cant:IsShown(), nombre = t2.cabeceras.nombre:IsShown(), celda = t2.filas[1].celdas.cant:IsShown()}
    -- Volver a enseñarla.
    lista.filas[2]:Click()
    local vuelve = {cant = t.cabeceras.cant:IsShown(), guardado = guardado, sets = sets}
    -- La última columna visible no se puede esconder.
    lista.filas[1]:Click(); lista.filas[2]:Click() -- sin Nombre y sin Cant
    local sinNombreNiCant = {nombre = t.cabeceras.nombre:IsShown(), cant = t.cabeceras.cant:IsShown(), precio = t.cabeceras.precio:IsShown()}
    local setsAntes = sets
    lista.filas[3]:Click() -- Precio: era la última
    local ultima = {precio = t.cabeceras.precio:IsShown(), sets = sets - setsAntes, tilde3 = lista.filas[3].tilde:IsShown()}
    return {antes = antes, abierta = abierta, textos = textos, tildes = tildes, anchoNombreAntes = anchoNombreAntes,
      tras = tras, otra = otra, vuelve = vuelve, sinNombreNiCant = sinNombreNiCant, ultima = ultima}
  end)()`);
  assert.equal(r.antes, true);
  assert.equal(r.abierta, true, 'pulsar el ⋮ abre el menú');
  assert.deepEqual(r.textos, ['Nombre', 'Cant', 'Precio']);
  assert.deepEqual(r.tildes, [true, true, true], 'las columnas que se ven llevan ✓');
  assert.equal(r.tras.cant, false, 'la columna escondida desaparece');
  assert.equal(r.tras.nombre, true);
  assert.equal(r.tras.celdaCant, false, 'y sus celdas');
  assert.equal(r.tras.celdaNombre, true);
  assert.deepEqual(r.tras.guardado, { cant: true }, 'recordar.set recibe {clave = true} de las escondidas');
  assert.equal(r.tras.sets, 1);
  assert.equal(r.tras.anchoNombre, r.anchoNombreAntes + 60, 'la columna flex se queda con el ancho que sobra');
  assert.equal(r.tras.xPrecio, 24 + r.tras.anchoNombre, 'las demás se recolocan');
  assert.equal(r.tras.tilde2, false);
  assert.equal(r.tras.abierta, true, 'el menú sigue abierto');
  assert.deepEqual(r.otra, { cant: false, nombre: true, celda: false }, 'otra tabla con el mismo recordar nace así');
  assert.equal(r.vuelve.cant, true, 'se vuelve a enseñar');
  assert.deepEqual(r.vuelve.guardado, [], 'nada escondido (una tabla vacía sale como [])');
  assert.equal(r.vuelve.sets, 2);
  assert.deepEqual(r.sinNombreNiCant, { nombre: false, cant: false, precio: true });
  assert.equal(r.ultima.precio, true, 'la última columna visible no se esconde');
  assert.equal(r.ultima.sets, 0);
  assert.equal(r.ultima.tilde3, true);
  sinErrores(m);
});

test('sin recordar, lo escondido se queda en la tabla (y no se escribe en los ajustes)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA()}
    local antesAjustes = SnetForeverCuenta
    t.botonMenu:Click()
    _G.SnetForeverDesplegableLista.filas[3]:Click()
    return {precio = t.cabeceras.precio:IsShown(), igual = SnetForeverCuenta == antesAjustes}
  end)()`);
  assert.equal(r.precio, false);
  assert.equal(r.igual, true);
  sinErrores(m);
});

test('marcar filas y marcarTodo; marcadas() las devuelve', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA()}
    local function lista(tab)
      local r = {}
      for k in pairs(tab) do r[#r + 1] = k end
      table.sort(r)
      return r
    end
    local c1 = t.filas[1].casilla
    local vacio = lista(t:marcadas())
    local marcadaAntes = c1.marcada
    c1:Click()
    local una = {lista(t:marcadas()), c1.marcada}
    t.filas[8].casilla:Click()
    local dos = lista(t:marcadas())
    -- Sobreviven al reordenar (k1 y k8 siguen marcadas aunque cambien de sitio) y al desplazar.
    t.cabeceras.cant:Click()
    t.cabeceras.cant:Click()
    rueda(-1, 100)
    local marcadasEnPantalla = {}
    for _, f in ipairs(t.filas) do
      if f:IsShown() and f.casilla.marcada then marcadasEnPantalla[#marcadasEnPantalla + 1] = f.clave end
    end
    rueda(1, 100)
    local trasRueda = lista(t:marcadas())
    rueda(-1, 100)
    -- Desmarcar quitando la marca.
    c1 = nil
    for _, f in ipairs(t.filas) do
      if f:IsShown() and f.clave == "k1" then c1 = f.casilla end
    end
    c1:Click()
    local desmarcada = lista(t:marcadas())
    -- Lo que devuelve es una copia.
    t:marcadas().k99 = true
    local copia = lista(t:marcadas())
    t:marcarTodo(true)
    local todo = #lista(t:marcadas())
    local tildeTodo = {t.botonMarcar.icono:GetVertexColor()}
    t:marcarTodo(false)
    local nada = #lista(t:marcadas())
    local tildeNada = {t.botonMarcar.icono:GetVertexColor()}
    -- La ✓ de la cabecera marca todo y, si ya está todo marcado, lo quita.
    t.botonMarcar:Click()
    local cabeceraMarca = #lista(t:marcadas())
    t.botonMarcar:Click()
    local cabeceraQuita = #lista(t:marcadas())
    -- poner con otras filas: las marcas de lo que ya no está se van, las que siguen se quedan.
    t:marcarTodo(true)
    local resto = {}
    for i = 1, 10 do resto[i] = filas[i] end
    t:poner(resto)
    local trasPoner = #lista(t:marcadas())
    local c = t.filas[1].casilla
    return {vacio = vacio, marcadaAntes = marcadaAntes, una = una, dos = dos, enPantalla = marcadasEnPantalla,
      trasRueda = trasRueda, desmarcada = desmarcada, copia = copia, todo = todo, nada = nada,
      tildeTodo = tildeTodo, tildeNada = tildeNada, cabeceraMarca = cabeceraMarca, cabeceraQuita = cabeceraQuita,
      trasPoner = trasPoner, casillaTrasPoner = c.marcada}
  end)()`);
  assert.deepEqual(r.vacio, []);
  assert.equal(r.marcadaAntes, false);
  assert.deepEqual(r.una, [['k1'], true]);
  assert.deepEqual(r.dos, ['k1', 'k8']);
  assert.deepEqual(r.enPantalla.slice().sort(), ['k1', 'k8'], 'las marcas van con la fila, no con la posición');
  assert.deepEqual(r.trasRueda, ['k1', 'k8'], 'desplazar no pierde marcas');
  assert.deepEqual(r.desmarcada, ['k8']);
  assert.deepEqual(r.copia, ['k8'], 'marcadas() devuelve una copia');
  assert.equal(r.todo, 30, 'marcarTodo(true) marca toda la lista, no solo lo que se ve');
  assert.equal(r.nada, 0);
  assert.equal(aHex(r.tildeTodo), 'ffd839', 'con todo marcado, el ✓ de la cabecera va en amarillo');
  assert.equal(aHex(r.tildeNada), 'a99b8e');
  assert.equal(r.cabeceraMarca, 30);
  assert.equal(r.cabeceraQuita, 0);
  assert.equal(r.trasPoner, 10);
  assert.equal(r.casillaTrasPoner, true);
  sinErrores(m);
});

test('barra de totales con el número en amarillo', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA()}
    local b = t.barraTotales
    local p = b.snfTema
    local fuente = t.textoTotales:GetFont()
    local texto0 = t.textoTotales:GetText()
    local alto = b:GetHeight()
    t.filas[1].casilla:Click()
    local texto1 = t.textoTotales:GetText()
    -- Si totales devuelve nil, la barra se esconde y la tabla ocupa su sitio.
    local mostrar = true
    opc.totales = nil
    local marco2 = CreateFrame("Frame", nil, UIParent)
    local t2 = P.tabla(marco2, {
      columnas = opc.columnas,
      totales = function() if mostrar then return "Hay 3 en 2,5 x" end end,
    })
    t2:SetPoint("TOPLEFT", marco2, "TOPLEFT", 0, 0)
    t2:SetSize(300, 264)
    t2:poner(filas)
    local con = {t2.barraTotales:IsShown(), t2.textoTotales:GetText()}
    mostrar = false
    t2:poner(filas)
    local sin = t2.barraTotales:IsShown()
    -- Con códigos de color propios no se toca nada.
    local propio = P.tabla(marco2, {columnas = opc.columnas, totales = function() return "|cff00ff00" .. "7 verdes|r" end})
    propio:SetPoint("TOPLEFT", marco2, "TOPLEFT", 0, 0)
    propio:SetSize(300, 264)
    propio:poner(filas)
    local sinTotales = P.tabla(marco2, {columnas = opc.columnas})
    return {
      shown = b:IsShown(), fondo = {p.fondoMetido[1]:GetVertexColor()}, borde = {p.borde[1]:GetVertexColor()},
      alto = alto, texto0 = texto0, texto1 = texto1, fuente = fuente, color = {t.textoTotales:GetTextColor()},
      con = con, sin = sin, propio = propio.textoTotales:GetText(), conBarra = sinTotales.barraTotales ~= nil,
      tiene = t.barraTotales ~= nil,
    }
  end)()`);
  assert.equal(r.shown, true);
  assert.equal(aHex(r.fondo), '232122', 'barra en secundario');
  assert.equal(aHex(r.borde), '775744', 'con borde');
  assert.equal(r.alto, 22);
  assert.equal(r.texto0, 'Total: |cffe6ac7230|r objetos, |cffe6ac720|r marcados', 'los números van en acento y lo demás, en la letra de la barra');
  assert.equal(r.texto1, 'Total: |cffe6ac7230|r objetos, |cffe6ac721|r marcados', 'totales recibe también las marcadas y se recalcula al marcar');
  assert.match(r.fuente, /BarlowSemiCondensed-SemiBold\.ttf$/, 'etiqueta en Barlow Semibold');
  assert.equal(aHex(r.color), 'ffffff', 'etiqueta blanca');
  assert.deepEqual(r.con, [true, 'Hay |cffe6ac723|r en |cffe6ac722,5|r x']);
  assert.equal(r.sin, false, 'si totales da nil, la barra se esconde');
  assert.equal(r.propio, '|cff00ff007 verdes|r', 'si el texto trae sus códigos de color, se respeta');
  assert.equal(r.conBarra, false, 'sin totales no hay barra');
  assert.equal(r.tiene, true);
  sinErrores(m);
});

test('las columnas flex reparten el ancho que sobra y se recolocan al cambiar el ancho', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(30, `
      opc.columnas[1].flex = 1
      opc.columnas[4] = {clave = "extra", titulo = "Extra", flex = 3, valor = function(f) return f.clave end}`)}
    local function medir()
      local r = {}
      for _, c in ipairs({"nombre", "cant", "precio", "extra"}) do
        local b = t.cabeceras[c]
        local _, _, _, x = b:GetPoint(1)
        local _, _, _, xc = t.filas[1].celdas[c]:GetPoint(1)
        r[c] = {x = x, ancho = b:GetWidth(), xCelda = xc, anchoCelda = t.filas[1].celdas[c]:GetWidth()}
      end
      return r
    end
    local a = medir()
    t:SetSize(600, 264)
    t:GetScript("OnSizeChanged")(t, 600, 264)
    local b = medir()
    local _, _, _, xm = t.botonMenu:GetPoint(1)
    return {a = a, b = b, anchoMenu = t.botonMenu:GetWidth(), anchoMarcar = t.botonMarcar:GetWidth()}
  end)()`);
  // 400 px: ✓ 24 + ⋮ 22 + cant 60 + precio 90 = 196; sobran 204: nombre 51 y extra 153 (pesos 1 y 3).
  assert.equal(r.a.nombre.ancho, 51);
  assert.equal(r.a.extra.ancho, 153);
  assert.equal(r.a.nombre.x, 24, 'la columna ✓ va a la izquierda');
  assert.equal(r.a.cant.x, 24 + 51);
  assert.equal(r.a.precio.x, 24 + 51 + 60);
  assert.equal(r.a.extra.x, 24 + 51 + 60 + 90);
  assert.equal(r.a.cant.ancho, 60);
  assert.equal(r.a.precio.ancho, 90);
  // 600 px: sobran 404: 101 y 303.
  assert.equal(r.b.nombre.ancho, 101);
  assert.equal(r.b.extra.ancho, 303);
  assert.equal(r.b.cant.x, 24 + 101, 'al cambiar el ancho se recolocan');
  assert.equal(r.b.extra.x, 24 + 101 + 60 + 90);
  assert.equal(r.b.cant.ancho, 60, 'las de ancho fijo no cambian');
  for (const c of ['nombre', 'cant', 'precio', 'extra']) {
    assert.equal(r.b[c].xCelda, r.b[c].x, `la celda de ${c} sigue a su cabecera`);
    assert.equal(r.b[c].anchoCelda, r.b[c].ancho);
  }
  assert.equal(r.anchoMenu, 22);
  assert.equal(r.anchoMarcar, 24);
  sinErrores(m);
});

test('t:poner guarda la lista (copia al ordenar), t:fila(i) da la fila en pantalla y desplazar solo reasigna', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(40)}
    local primera = {claves()[1], claves()[10]}
    rueda(-1, 5)
    local tras5 = claves()[1]
    rueda(-1, 500)
    local final = claves()
    rueda(1, 500)
    local arriba = claves()[1]
    local barra = {t.barra:IsShown(), t.barra:GetWidth()}
    t.cabeceras.precio:Click() -- ascendente: igual que la lista
    t.cabeceras.precio:Click() -- descendente
    return {primera = primera, tras5 = tras5, final = final, arriba = arriba, barra = barra,
      fila1 = t:fila(1).clave, fila40 = t:fila(40).clave, fila41 = t:fila(41), cuantas = t:cuantas(),
      ordenaciones = t.ordenaciones}
  end)()`);
  assert.deepEqual(r.primera, ['k1', 'k10']);
  assert.equal(r.tras5, 'k6', 'la rueda baja una fila por muesca');
  assert.equal(r.final.length, 10);
  assert.equal(r.final[9], 'k40', 'llega al final y no pasa');
  assert.equal(r.arriba, 'k1');
  assert.deepEqual(r.barra, [true, 4], 'barra de 4 px cuando no cabe todo');
  assert.equal(r.fila1, 'k40', 'fila(i) sigue el orden de pantalla');
  assert.equal(r.fila40, 'k1');
  assert.equal(r.fila41, undefined);
  assert.equal(r.cuantas, 40);
  assert.equal(r.ordenaciones, 2, 'la rueda no ordena');
  sinErrores(m);
});

test('con 11.630 filas se crean como mucho las visibles más una', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local creados = 0
    local crear = CreateFrame
    CreateFrame = function(...) creados = creados + 1; return crear(...) end
    ${TABLA(11630, `
      opc.totales = function(lista) return "Total: " .. #lista end`)}
    local filasAlCrear = #t.filas
    local creadosAlCrear = creados
    local llamadasPintar = pintadas
    -- Con 10 filas se crea exactamente lo mismo: poner no crea nada por fila.
    local pocas = {}
    for i = 1, 10 do pocas[i] = filas[i] end
    local marco2 = CreateFrame("Frame", nil, UIParent)
    local antes2 = creados
    local t2 = P.tabla(marco2, {columnas = opc.columnas, marcar = true, menu = true, totales = opc.totales})
    t2:SetPoint("TOPLEFT", marco2, "TOPLEFT", 0, 0)
    t2:SetSize(400, 264)
    t2:poner(pocas)
    local creadosConPocas = creados - antes2
    local antes3 = creados
    local t3 = P.tabla(marco2, {columnas = opc.columnas, marcar = true, menu = true, totales = opc.totales})
    t3:SetPoint("TOPLEFT", marco2, "TOPLEFT", 0, 0)
    t3:SetSize(400, 264)
    t3:poner(filas)
    local creadosConMuchas = creados - antes3
    local base = creados
    local ordenaciones = t.ordenaciones
    local inicio = claves()
    rueda(-1, 30)
    local fin = claves()
    rueda(1, 30)
    local vuelta = claves()[1]
    t:irA(#filas)
    local alFinal = claves()
    t:irA(1)
    -- Ordenar es al pulsar, y tampoco crea marcos.
    t.cabeceras.precio:Click()
    t.cabeceras.precio:Click()
    local primeraDesc = claves()[1]
    t:marcarTodo(true)
    local marcadas = 0
    for _ in pairs(t:marcadas()) do marcadas = marcadas + 1 end
    CreateFrame = crear
    return {filasAlCrear = filasAlCrear, creadosAlCrear = creadosAlCrear, creadosConPocas = creadosConPocas,
      creadosConMuchas = creadosConMuchas, filasDespues = #t.filas, creadosDespues = creados - base,
      ordenacionesTrasRueda = ordenaciones, inicio = inicio, fin = fin, vuelta = vuelta, alFinal = alFinal, primeraDesc = primeraDesc,
      cuantas = t:cuantas(), marcadas = marcadas, ordenaciones = t.ordenaciones, texto = t.textoTotales:GetText()}
  end)()`);
  assert.equal(r.cuantas, 11630);
  assert.ok(r.filasAlCrear <= 11, `como mucho 10 filas visibles más una: ${r.filasAlCrear}`);
  assert.equal(r.filasDespues, r.filasAlCrear, 'ordenar y desplazar reutilizan las filas');
  assert.equal(r.creadosConMuchas, r.creadosConPocas, 'con 11.630 filas se crea lo mismo que con 10');
  assert.equal(r.creadosDespues, 0, 'desplazar, ordenar y marcar no crean ningún marco');
  assert.equal(r.ordenacionesTrasRueda, 0, 'la rueda nunca ordena');
  assert.equal(r.inicio.length, 10);
  assert.equal(r.inicio[0], 'k1');
  assert.equal(r.fin[0], 'k31', '30 muescas = 30 filas');
  assert.equal(r.alFinal[9], 'k11630', 't:irA(#filas) llega al final');
  assert.equal(r.alFinal[0], 'k11621');
  assert.equal(r.vuelta, 'k1');
  assert.equal(r.primeraDesc, 'k11630', 'precio descendente');
  assert.equal(r.ordenaciones, 2);
  assert.equal(r.marcadas, 11630);
  assert.equal(r.texto, 'Total: |cffe6ac7211630|r');
  sinErrores(m);
});

test('t:irA(i) pone la fila i arriba, sin pasar del final ni del principio', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(40)}
    local creados = 0
    local crear = CreateFrame
    CreateFrame = function(...) creados = creados + 1; return crear(...) end
    local out = {}
    for _, i in ipairs({1, 20, 31, 32, 40, 41, 1000, 0, -5, 2.7}) do
      t:irA(i)
      out[#out + 1] = claves()[1]
    end
    t:irA(nil)
    local nada = claves()[1]
    CreateFrame = crear
    return {out = out, nada = nada, creados = creados, barra = t.barra:IsShown(), ordenaciones = t.ordenaciones}
  end)()`);
  // 40 filas, caben 10: la última fila de arriba posible es la 31.
  assert.deepEqual(r.out, ['k1', 'k20', 'k31', 'k31', 'k31', 'k31', 'k31', 'k1', 'k1', 'k2'],
    'principio, medio, final (se queda en la 31), fuera de rango por arriba y por abajo; 2,7 se redondea a 2');
  assert.equal(r.nada, 'k2', 'nil no mueve');
  assert.equal(r.creados, 0);
  assert.equal(r.ordenaciones, 0, 'irA no ordena');
  sinErrores(m);
});

test('totales: el número en acento también con códigos de color, iconos y enlaces en el texto', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(3, 'opc.totales = nil')}
    local function pasar(texto)
      local marco2 = CreateFrame("Frame", nil, UIParent)
      local t2 = P.tabla(marco2, {columnas = opc.columnas, totales = function() return texto end})
      t2:SetPoint("TOPLEFT", marco2, "TOPLEFT", 0, 0)
      t2:SetSize(300, 264)
      t2:poner(filas)
      return t2.textoTotales:GetText()
    end
    local dinero = T.dinero(104907)
    local icono = "|TInterface\Icons\INV_Misc_12:14|t"
    local enlace = "|cff1eff00|Hitem:123:0:0|h[Espada 5]|h|r"
    return {
      dinero = pasar("Total: 5 objetos · " .. dinero), dineroPuro = dinero,
      icono = pasar("Hay 3 " .. icono .. " y 7"), iconoPuro = icono,
      enlace = pasar("Quedan 9 " .. enlace .. " de 12"), enlacePuro = enlace,
      enlaceSinColor = pasar("|Hitem:55|h[Casco 4]|h x 8"),
      barraVertical = pasar("Total: 5 objetos"),
    }
  end)()`);
  const A = '|cffe6ac72', R = '|r';
  assert.equal(r.dinero, `Total: ${A}5${R} objetos · ${r.dineroPuro}`, 'el 5 va en acento y el dinero queda intacto');
  assert.equal(r.icono, `Hay ${A}3${R} ${r.iconoPuro} y ${A}7${R}`, 'los números dentro de |T…|t no se tocan');
  assert.equal(r.enlace, `Quedan ${A}9${R} ${r.enlacePuro} de ${A}12${R}`, 'el enlace (con su color) queda intacto');
  assert.equal(r.enlaceSinColor, `|Hitem:55|h[Casco 4]|h x ${A}8${R}`, '|H…|h sin color tampoco se toca por dentro');
  assert.equal(r.barraVertical, `Total: ${A}5${R} objetos`);
  sinErrores(m);
});

test('✓ de la cabecera: con filas sin clave o con claves repetidas puede desmarcar', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(0)}
    local lista = {
      {clave = "a", nombre = "A", cant = 1, precio = 1},
      {clave = "a", nombre = "A otra vez", cant = 2, precio = 2},
      {nombre = "Sin clave", cant = 3, precio = 3},
      {clave = "b", nombre = "B", cant = 4, precio = 4},
    }
    t:poner(lista)
    local function cuantas() local n = 0; for _ in pairs(t:marcadas()) do n = n + 1 end; return n end
    local function tilde() return aHexTilde end
    t.botonMarcar:Click() -- marca todo lo marcable: a y b
    local primera = {cuantas(), {t.botonMarcar.icono:GetVertexColor()}}
    t.botonMarcar:Click() -- ya está todo: desmarca
    local segunda = {cuantas(), {t.botonMarcar.icono:GetVertexColor()}}
    t.botonMarcar:Click()
    return {primera = primera, segunda = segunda, tras = cuantas()}
  end)()`);
  assert.equal(r.primera[0], 2, 'solo cuentan las filas con clave, y una vez cada clave');
  assert.equal(aHex(r.primera[1]), 'ffd839', 'con todo lo marcable marcado, el ✓ va en amarillo');
  assert.equal(r.segunda[0], 0, 'la segunda pulsación desmarca');
  assert.equal(aHex(r.segunda[1]), 'a99b8e');
  assert.equal(r.tras, 2);
  assert.ok(m.errores().length > 0, 'la fila sin clave avisa una vez');
});

test('los errores de valor y de pintar no rompen la tabla: van a geterrorhandler', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(5, `
      opc.columnas[2].valor = function() error("falla valor") end
      opc.columnas[3].pintar = function() error("falla pintar") end`)}
    t.cabeceras.cant:Click()
    return {filas = #claves(), cuantas = t:cuantas()}
  end)()`);
  assert.equal(r.filas, 5);
  assert.equal(r.cuantas, 5);
  assert.ok(m.errores().length > 0, 'los errores se avisan');
});

// Task 20b: opciones para listas de objetos (elegir pulsando, título con copiar, sin cabecera, borde y letra).
test('elegir: sin casillas, clic solo, Ctrl suma, Mayús tramo, sección avisa y no se elige, :marcadas() devuelve lo elegido', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local avisos = {}
    ${TABLA(6, `
      opc.marcar, opc.menu, opc.totales = nil, nil, nil
      opc.elegir = true
      opc.alPulsarSeccion = function(fila) avisos[#avisos + 1] = fila.clave end`)}
    filas[3].seccion = true
    t:poner(filas)
    local function pulsar(i, ctrl, mayus)
      BANCO.ctrl, BANCO.shift = ctrl == true, mayus == true
      local f = t.filas[i]
      f:GetScript("OnMouseUp")(f, "LeftButton")
      BANCO.ctrl, BANCO.shift = false, false
    end
    local function elegidas()
      local o = {}
      for k in pairs(t:marcadas()) do o[#o + 1] = k end
      table.sort(o)
      return table.concat(o, ",")
    end
    local out = {casillas = t.botonMarcar == nil and t.filas[1].casilla == nil}
    pulsar(1); out.uno = elegidas()
    out.fondo = t.filas[1].fondoElegida:IsShown() and not t.filas[2].fondoElegida:IsShown()
    pulsar(2); out.otra = elegidas()
    pulsar(1, true); out.ctrl = elegidas()
    pulsar(2, true); out.ctrlQuita = elegidas()
    pulsar(3); out.seccion = {elegidas(), avisos[1]}
    pulsar(1); pulsar(5, false, true); out.tramo = elegidas()
    out.sinSeccion = t:marcadas().k3 == nil
    return out
  end)()`);
  assert.equal(r.casillas, true);
  assert.equal(r.uno, 'k1');
  assert.equal(r.fondo, true);
  assert.equal(r.otra, 'k2');
  assert.equal(r.ctrl, 'k1,k2');
  assert.equal(r.ctrlQuita, 'k1');
  assert.deepEqual(r.seccion, ['k1', 'k3']);
  assert.equal(r.tramo, 'k1,k2,k4,k5');
  assert.equal(r.sinSeccion, true);
  sinErrores(m);
});

test('titulo: barra con texto y botón de copiar; sinCabecera empieza arriba; borde y letra solo en esta tabla', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local copiado = 0
    ${TABLA(5, `
      opc.marcar, opc.menu, opc.totales = nil, nil, nil
      opc.titulo = {texto = "Mi lista", copiar = function() copiado = copiado + 1 end}
      opc.borde = true
      opc.letra = 9`)}
    local out = {titulo = t.textoTitulo:GetText(), cabecerasVisibles = t.cabeceras.nombre:IsShown(), bordes = #t.bordes}
    t.botonCopiar:Click("LeftButton")
    out.copiado = copiado
    t:ponerTitulo("Otro")
    out.otro = t.textoTitulo:GetText()
    local _, tam = t.filas[1].celdas.nombre.texto:GetFont()
    out.letra = tam
    -- Sin cabecera.
    local sin = P.tabla(marco, {sinCabecera = true, columnas = {{clave = "a", titulo = "A", flex = true, valor = function(f) return f.clave end}}})
    sin:SetSize(200, 100)
    sin:poner({{clave = "x"}})
    local punto, rel, relPunto, x, y = sin.cuerpo:GetPoint(1)
    out.sin = {sin.cabecera:IsShown(), punto, rel == sin and 'marco' or 'otro', relPunto, x, y}
    local _, tam2 = sin.filas[1].celdas.a.texto:GetFont()
    out.letraPorDefecto = tam2
    return out
  end)()`);
  assert.equal(r.titulo, 'Mi lista');
  assert.equal(r.cabecerasVisibles, false);
  assert.equal(r.bordes, 4);
  assert.equal(r.copiado, 1);
  assert.equal(r.otro, 'Otro');
  assert.equal(r.letra, 9);
  assert.equal(r.sin[0], false);
  assert.deepEqual(r.sin.slice(1, 5), ['TOPLEFT', 'marco', 'TOPLEFT', 0], 'el cuerpo empieza donde estaría la cabecera');
  assert.equal(r.sin[5], 0);
  assert.equal(r.letraPorDefecto, 12); // B3r: la letra «tabla» del tema es de 12
  sinErrores(m);
});

// Task 20e: el texto de la barra de título se tiene que VER, no solo existir. En el juego salía vacío con el icono de
// copiar a la derecha: el texto era una región de la propia cabecera y, en el cliente, un marco hijo de la cabecera (el
// botón de copiar, o un botón de columna con fondo) se dibuja por encima de las regiones de su padre. Ahora el texto va en
// su propio marco, por encima de todo lo que haya en la cabecera.
const TITULO_VISIBLE = `
    ${TABLA(5, `
      opc.marcar, opc.menu, opc.totales = nil, nil, nil
      opc.titulo = {texto = "Mi lista", copiar = function() end}
      opc.borde = true
      opc.elegir = true`)}
    t:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
    t:SetSize(300, 150)
    t:poner(filas)
    local tit = t.textoTitulo
    local out = {}
    out.visible = tit:IsVisible()
    out.alfa = tit:GetAlpha()
    out.alfaEfectivo = tit:GetEffectiveAlpha()
    out.ancho = tit:GetRight() - tit:GetLeft()
    out.letra = tit:GetFont()
    out.texto = tit:GetText()
    out.color = {tit:GetTextColor()}
    -- Todos los marcos a la vista de la tabla que pueden tapar el texto: los que tienen una textura a la vista que cae en la
    -- zona del texto, o (aunque no caiga hoy) cualquier hijo de la cabecera, porque un hijo de la cabecera se dibuja por
    -- encima de las regiones de ella.
    local L, R, T, B = tit:GetLeft(), tit:GetRight(), tit:GetTop(), tit:GetBottom()
    local mio = BANCO.nivelReal(tit)
    -- Tapa un marco a la vista, con una textura a la vista y con alfa que se cruza con la zona del texto, que se dibuja por
    -- encima (nivel igual o mayor). Un hijo de la cabecera sin fondo o fuera de la zona (el botón de copiar) no tapa.
    local function quienTapa()
      local tapan = {}
      local function visita(f)
        for _, h in ipairs({f:GetChildren()}) do
          if h:IsShown() then
            local opaco = false
            for _, r in ipairs({h:GetRegions()}) do
              if r:GetObjectType() == "Texture" and r:IsShown() then
                local l, rr, tt, bb = r:GetLeft(), r:GetRight(), r:GetTop(), r:GetBottom()
                local _, _, _, a = r:GetVertexColor()
                if l and l < R and rr > L and tt > B and bb < T and (a or 1) > 0 then opaco = true end
              end
            end
            if h ~= tit:GetParent() and opaco and BANCO.nivelReal(h) >= mio then
              tapan[#tapan + 1] = tostring(h:GetObjectType()) .. " nivel " .. BANCO.nivelReal(h)
            end
            visita(h)
          end
        end
      end
      visita(t)
      return tapan
    end
    out.tapan = quienTapa()
    out.nivelTexto = mio
    return out`;

test('titulo: el texto se ve (a la vista, con alfa, ancho, letra y color) y ningún marco de la cabecera queda encima', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function() ${TITULO_VISIBLE} end)()`);
  assert.equal(r.texto, 'Mi lista');
  assert.equal(r.visible, true);
  assert.ok(r.alfa > 0 && r.alfaEfectivo > 0, 'alfa mayor que 0');
  assert.ok(r.ancho > 0, 'ancho mayor que 0');
  assert.ok(r.letra, 'tiene letra puesta');
  assert.equal(aHex(r.color), 'f5e8d4', 'color «texto»');
  assert.deepEqual(r.tapan, [], 'ningún marco hermano o hijo de la cabecera queda por encima del texto');
  sinErrores(m);
});

test('titulo: aunque un botón de columna con fondo opaco se enseñe encima de la cabecera, el texto queda por encima', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local out
    ${TITULO_VISIBLE.replace('return out', '')}
    -- Un botón de columna que, por lo que sea, se enseña tapando toda la cabecera con su fondo.
    local b = t.cabeceras.nombre
    b:ClearAllPoints()
    b:SetAllPoints(t.cabecera)
    b:Show()
    b.fondo:Show()
    out.tapaConBoton = quienTapa()
    local f = b.fondo
    out.botonPisaElTexto = f:GetLeft() < R and f:GetRight() > L and f:GetTop() > B and f:GetBottom() < T
    return out
  end)()`);
  assert.equal(r.botonPisaElTexto, true, 'el botón de la prueba sí cae en la zona del texto');
  assert.deepEqual(r.tapaConBoton, [], 'el botón con fondo que pisa el texto no queda por encima de él');
  sinErrores(m);
});

test('elegir: el fondo del ratón es más suave que el de elegida, no tapa a una fila elegida y se va al quitarla con Ctrl+clic', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(4, `
      opc.marcar, opc.menu, opc.totales = nil, nil, nil
      opc.elegir = true`)}
    local function color(tex) return {tex:GetVertexColor()} end
    local elegida, suave = T.color("elegida"), T.color("secundario")
    local function es(c, t) return math.abs(c[1] - t[1]) < 0.01 and math.abs(c[2] - t[2]) < 0.01 and math.abs(c[3] - t[3]) < 0.01 end
    local function aspecto(f)
      -- lo que se ve: el color de elegida si el fondo de elegida está o si el del ratón tiene ese color
      local mostrado = {}
      if f.fondoElegida:IsShown() then mostrado[#mostrado + 1] = color(f.fondoElegida) end
      if f.resalte:IsShown() then mostrado[#mostrado + 1] = color(f.resalte) end
      local conElegida = false
      for _, c in ipairs(mostrado) do if es(c, elegida) then conElegida = true end end
      return {#mostrado, conElegida}
    end
    local function entrar(i) local f = t.filas[i]; f:GetScript("OnEnter")(f) end
    local function pulsar(i, ctrl)
      BANCO.ctrl = ctrl == true
      local f = t.filas[i]; f:GetScript("OnMouseUp")(f, "LeftButton")
      BANCO.ctrl = false
    end
    local out = {}
    entrar(1); out.sobre = aspecto(t.filas[1])
    pulsar(1); out.elegidaSobre = aspecto(t.filas[1])
    pulsar(1, true); out.quitada = aspecto(t.filas[1])
    out.suave = es(color(t.filas[1].resalte), suave)
    local f = t.filas[1]; f:GetScript("OnLeave")(f)
    BANCO.avanzar(0.3) -- T1a ronda 1: el fondo del ratón se apaga pasada la espera
    out.fuera = aspecto(t.filas[1])
    return out
  end)()`);
  assert.deepEqual(r.sobre, [1, false], 'con el ratón y sin elegir no parece elegida');
  assert.deepEqual(r.elegidaSobre, [1, true], 'elegida con el ratón encima sigue con el de elegida');
  assert.deepEqual(r.quitada, [1, false], 'tras Ctrl+clic, con el ratón encima, ya no parece elegida');
  assert.equal(r.suave, true);
  assert.deepEqual(r.fuera, [0, false]);
  sinErrores(m);
});

test('elegir: Ctrl+Mayús suma el tramo a lo que había', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(8, `
      opc.marcar, opc.menu, opc.totales = nil, nil, nil
      opc.elegir = true`)}
    local function pulsar(i, ctrl, mayus)
      BANCO.ctrl, BANCO.shift = ctrl == true, mayus == true
      local f = t.filas[i]; f:GetScript("OnMouseUp")(f, "LeftButton")
      BANCO.ctrl, BANCO.shift = false, false
    end
    pulsar(1); pulsar(6, true)       -- k1 y k6
    pulsar(3, true)                  -- ancla en k3
    pulsar(5, true, true)            -- tramo k3..k5 sumado
    local o = {}
    for k in pairs(t:marcadas()) do o[#o + 1] = k end
    table.sort(o)
    return table.concat(o, ",")
  end)()`);
  assert.equal(r, 'k1,k3,k4,k5,k6');
  sinErrores(m);
});

test('elegir: el ancla se borra si su fila ya no está o al vaciar lo elegido: Mayús+clic elige solo esa fila', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(8, `
      opc.marcar, opc.menu, opc.totales = nil, nil, nil
      opc.elegir = true`)}
    local function pulsar(i, ctrl, mayus)
      BANCO.ctrl, BANCO.shift = ctrl == true, mayus == true
      local f = t.filas[i]; f:GetScript("OnMouseUp")(f, "LeftButton")
      BANCO.ctrl, BANCO.shift = false, false
    end
    local function elegidas()
      local o = {}
      for k in pairs(t:marcadas()) do o[#o + 1] = k end
      table.sort(o)
      return table.concat(o, ",")
    end
    local out = {}
    pulsar(1)
    t:marcarTodo(false)
    pulsar(4, false, true); out.vaciada = elegidas()
    t:marcarTodo(false)
    pulsar(2)
    local otras = {}
    for i = 3, 8 do otras[#otras + 1] = filas[i] end
    t:poner(otras) -- k2 ya no está
    t:poner(filas) -- y vuelve
    pulsar(6, false, true); out.sinFila = elegidas()
    return out
  end)()`);
  assert.equal(r.vaciada, 'k4');
  assert.equal(r.sinFila, 'k6');
  sinErrores(m);
});

test('capacidad: cuántas filas enteras caben a la vez (sin contar la cabecera ni los totales); sin tamaño, nil', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(30)}
    local out = {conTotales = t:capacidad()}
    local sin = P.tabla(marco, {columnas = {{clave = "a", titulo = "A", flex = true}}})
    out.sinTamano = sin:capacidad()
    t:SetSize(400, 22 + 22 + 22 * 7 + 5) -- cabecera, totales, siete filas y un trozo
    out.siete = t:capacidad()
    return out
  end)()`);
  assert.equal(r.conTotales, 10);
  assert.equal(r.sinTamano, undefined);
  assert.equal(r.siete, 7);
  sinErrores(m);
});

// Task 20e, ronda 1: el título recibía SetText una sola vez al crearse, cuando la cabecera aún medía 0 y la letra propia podía
// no estar cargada (BANCO.textoSinCargar): no se pintaba y nadie lo volvía a escribir. Ahora se vuelve a escribir (pasando
// antes por un texto distinto, porque el cliente no rehace el dibujo si el texto es el mismo) al enseñarse, al recibir tamaño y
// con cada :ponerTitulo.
const TITULO_TARDE = (despues) => `(function()
    local P = SnetForever.Piezas
    local marco = CreateFrame("Frame", nil, UIParent)
    marco:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, 100)
    marco:SetSize(400, 300)
    BANCO.textoSinCargar = true
    local t = P.tabla(marco, {titulo = {texto = "Mi lista"}, columnas = {{clave = "a", titulo = "A", flex = true}}})
    t:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
    local out = {alCrear = BANCO.textoPintado(t.textoTitulo)}
    BANCO.textoSinCargar = false
    ${despues}
    out.despues = BANCO.textoPintado(t.textoTitulo)
    out.texto = t.textoTitulo:GetText()
    return out
  end)()`;

for (const [nombre, codigo] of [
  ['al recibir tamaño', 'BANCO.disposicionDiferida = true; t:SetSize(300, 150); t:GetWidth()'],
  ['al enseñarse', 't:GetScript("OnShow")(t)'],
  ['con ponerTitulo', 't:ponerTitulo("Mi lista")'],
]) {
  test(`titulo: si al crearse la letra no estaba cargada, el texto se pinta ${nombre}`, () => {
    const m = nuevaMaquina();
    const r = m.lua(TITULO_TARDE(codigo));
    assert.equal(r.alCrear, false, 'al crearse, con la letra sin cargar, no se pinta');
    assert.equal(r.despues, true);
    assert.equal(r.texto, 'Mi lista');
    sinErrores(m);
  });
}

// T1a: el tooltip del objeto en las filas. La pieza solo avisa (alEntrar(fila, marcoFila) / alSalir(marcoFila)); qué se
// enseña es cosa de quien la usa. La casilla está encima de la fila: se cuentan las dos, y si se repinta con el ratón parado
// encima se avisa con la fila que queda debajo.
test('alEntrar y alSalir: la fila avisa al entrar y al salir, la casilla no la hace salir y al desplazar avisa con la de debajo', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local avisos = {}
    ${TABLA(30, `opc.alEntrar = function(fila, f) avisos[#avisos + 1] = "entra " .. fila.clave .. (f == nil and " sin marco" or "") end
    opc.alSalir = function(f) avisos[#avisos + 1] = "sale" end`)}
    local f1 = t.filas[1]
    local out = {}
    f1:GetScript("OnEnter")(f1)
    out.entrar = {unpack(avisos)}
    avisos = {}
    -- La casilla y la fila se cuentan juntas (como ui/comercio_tabla.lua): si la casilla recibe OnEnter antes que la fila su
    -- OnLeave, la fila ni sale ni entra otra vez.
    f1.casilla:GetScript("OnEnter")(f1.casilla)
    f1:GetScript("OnLeave")(f1)
    f1:GetScript("OnEnter")(f1)
    f1.casilla:GetScript("OnLeave")(f1.casilla)
    out.casilla = {unpack(avisos)}
    avisos = {}
    -- La rueda con el ratón parado: la fila de debajo es otra.
    rueda(-1)
    out.rueda = {unpack(avisos)}
    avisos = {}
    -- La lista se queda sin filas: ya no hay fila debajo.
    t:poner({})
    out.vacia = {unpack(avisos)}
    avisos = {}
    f1:GetScript("OnLeave")(f1)
    out.salir = {unpack(avisos)}
    return out
  end)()`);
  assert.deepEqual(r.entrar, ['entra k1']);
  assert.deepEqual(r.casilla, [], 'pasar a la casilla y volver no sale ni entra');
  assert.deepEqual(r.rueda, ['entra k2'], 'la fila bajo el ratón es otra');
  assert.deepEqual(r.vacia, ['sale'], 'sin fila debajo, sale');
  assert.deepEqual(r.salir, [], 'ya había salido: no se avisa dos veces');
  sinErrores(m);
});

// T1a, ronda 1 (Importante 1): la salida no depende de la geometría (IsMouseOver). El juego manda un solo OnLeave por salida:
// si llega con el cursor aún dentro del rectángulo (la fila de abajo, recortada por el cuerpo; el borde que comparten dos
// filas), la fila sale igual.
test('un OnLeave con el cursor aún dentro del rectángulo de la fila la hace salir: sin resalte y con alSalir', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local avisos = {}
    ${TABLA(30, `opc.alEntrar = function(fila) avisos[#avisos + 1] = "entra " .. fila.clave end
    opc.alSalir = function() avisos[#avisos + 1] = "sale" end`)}
    local f = t.filas[1]
    local e = f:GetEffectiveScale()
    BANCO.cursor = {x = (f:GetLeft() + f:GetRight()) / 2 * e, y = (f:GetTop() + f:GetBottom()) / 2 * e}
    f:GetScript("OnEnter")(f)
    f:GetScript("OnLeave")(f)
    BANCO.cursor = {x = 0, y = 0}
    BANCO.avanzar(0.3) -- el fondo del ratón se apaga pasada la espera (ronda 1, sin parpadeos)
    return {avisos = avisos, resalte = f.resalte:IsShown(), sobre = f.sobre == true}
  end)()`);
  assert.deepEqual(r, { avisos: ['entra k1', 'sale'], resalte: false, sobre: false });
  sinErrores(m);
});

test('pasar de una fila a la de al lado por el borde que comparten deja solo la nueva', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local avisos = {}
    ${TABLA(30, `opc.alEntrar = function(fila) avisos[#avisos + 1] = "entra " .. fila.clave end
    opc.alSalir = function() avisos[#avisos + 1] = "sale" end`)}
    local f1, f2 = t.filas[1], t.filas[2]
    -- El cursor justo en el borde que comparten (las dos lo cuentan como dentro).
    local e = f1:GetEffectiveScale()
    BANCO.cursor = {x = (f1:GetLeft() + f1:GetRight()) / 2 * e, y = f1:GetBottom() * e}
    f1:GetScript("OnEnter")(f1)
    f1:GetScript("OnLeave")(f1)
    f2:GetScript("OnEnter")(f2)
    BANCO.cursor = {x = 0, y = 0}
    BANCO.avanzar(0.3) -- el fondo del ratón pasa a la nueva pasada la espera (ronda 1, sin parpadeos)
    local out = {avisos = avisos, uno = {f1.sobre == true, f1.resalte:IsShown()}, dos = {f2.sobre == true, f2.resalte:IsShown()}}
    avisos = {}
    rueda(-1) -- la fila vieja no cree que sigue bajo el ratón
    out.rueda = avisos
    return out
  end)()`);
  // Ronda 1: el aviso va con la luz: al cruzar solo llega alEntrar con la nueva, sin alSalir entre medias.
  assert.deepEqual(r.avisos, ['entra k1', 'entra k2']);
  assert.deepEqual(r.uno, [false, false], 'la vieja ya no tiene el ratón');
  assert.deepEqual(r.dos, [true, true]);
  assert.deepEqual(r.rueda, ['entra k3'], 'con la rueda solo avisa la de debajo del ratón');
  sinErrores(m);
});

// T1a, ronda 2, menor 2: si la fila encendida se va (la lista encoge al repintar) mientras el ratón espera en otra fila, la
// luz pasa a esa fila (y avisa con alEntrar), en vez de quedarse sin ninguna.
test('si la lista encoge y se va la fila encendida mientras el ratón espera en otra, la luz pasa a esa fila', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local avisos = {}
    ${TABLA(30, `opc.alEntrar = function(fila) avisos[#avisos + 1] = "entra " .. fila.clave end
    opc.alSalir = function() avisos[#avisos + 1] = "sale" end`)}
    local f1, f3 = t.filas[1], t.filas[3]
    f3:GetScript("OnEnter")(f3)
    f3:GetScript("OnLeave")(f3)
    f1:GetScript("OnEnter")(f1) -- espera los 0,2 s para pasar la luz a la fila 1
    t:poner({filas[1], filas[2]}) -- la fila 3 se queda sin datos
    BANCO.avanzar(0.5)
    return {avisos = avisos, uno = f1.resalte:IsShown(), tres = f3.resalte:IsShown()}
  end)()`);
  assert.deepEqual(r.avisos, ['entra k3', 'entra k1'], 'pasa directamente a la fila del ratón (sin alSalir entre medias)');
  assert.equal(r.uno, true, 'la fila del ratón lleva la luz');
  assert.equal(r.tres, false);
  sinErrores(m);
});

// Ronda 2, menor 3: la luz no se enciende en una fila que no se ve: si la tabla se esconde dentro de la espera, el cambio
// pendiente se cancela.
test('si la tabla se esconde mientras la luz espera para pasar a otra fila, no se enciende nada ni avisa', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local avisos = {}
    ${TABLA(30, `opc.alEntrar = function(fila) avisos[#avisos + 1] = "entra " .. fila.clave end
    opc.alSalir = function() avisos[#avisos + 1] = "sale" end`)}
    local f1, f2 = t.filas[1], t.filas[2]
    f1:GetScript("OnEnter")(f1)
    f1:GetScript("OnLeave")(f1)
    f2:GetScript("OnEnter")(f2)
    marco:Hide()
    BANCO.avanzar(0.5)
    return {avisos = avisos, uno = f1.resalte:IsShown(), dos = f2.resalte:IsShown()}
  end)()`);
  assert.deepEqual(r.avisos, ['entra k1', 'sale'], 'al esconderse se apaga (y avisa); la fila 2 no llega a encenderse');
  assert.deepEqual([r.uno, r.dos], [false, false]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------------
// Task 36 (punto 3 de la Fase H): casillaDiscreta. En op-04 las filas de TSM no enseñan nada en la columna ✓: la casilla de
// una fila sin marcar no se pinta (la zona sigue y pulsarla marca), sale hueca con el ratón sobre la fila (con la luz de la
// tabla, así que no parpadea al temblar en un borde ni al pasar de la fila a su casilla) y marcada sale amarilla.
// ---------------------------------------------------------------------------------------------------------------------

// El estado de la caja de la casilla de una fila de pantalla: «nada» (no se pinta), «hueca» o «amarilla», más si la zona
// que se pulsa sigue a la vista.
const ESTADO_CASILLA = `
    local function estado(f)
      local c = f.casilla
      if not c.caja:IsShown() then return "nada" end
      local r, g, b = c.caja.snfTema.fondoMetido[1]:GetVertexColor()
      local hex = string.format("%02x%02x%02x", math.floor(r * 255 + 0.5), math.floor(g * 255 + 0.5), math.floor(b * 255 + 0.5))
      local borde = c.caja.snfTema.borde[1]:IsShown()
      if hex == "ffd839" then return "amarilla" end
      if hex == "110e0f" and borde then return "hueca" end
      return "otra " .. hex
    end`;

test('casilla discreta: sin marcar no se pinta; al pasar el ratón sale hueca; marcada, amarilla; pulsar el hueco marca', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(30, 'opc.casillaDiscreta = true')}
    ${ESTADO_CASILLA}
    local f1, f2, f3 = t.filas[1], t.filas[2], t.filas[3]
    local out = {inicio = {}, zona = {}}
    for i = 1, 10 do
      out.inicio[i] = estado(t.filas[i])
      out.zona[i] = t.filas[i].casilla:IsVisible()
    end
    -- Con el ratón sobre la fila sale hueca; de la fila a su casilla y vuelta no cambia nada (ni un fotograma sin ella).
    local pasos = {}
    f1:GetScript("OnEnter")(f1); pasos[#pasos + 1] = estado(f1)
    f1.casilla:GetScript("OnEnter")(f1.casilla); pasos[#pasos + 1] = estado(f1)
    f1:GetScript("OnLeave")(f1); pasos[#pasos + 1] = estado(f1)
    BANCO.avanzar(0.3); pasos[#pasos + 1] = estado(f1)
    f1:GetScript("OnEnter")(f1); pasos[#pasos + 1] = estado(f1)
    f1.casilla:GetScript("OnLeave")(f1.casilla); pasos[#pasos + 1] = estado(f1)
    BANCO.avanzar(0.3); pasos[#pasos + 1] = estado(f1)
    f1:GetScript("OnLeave")(f1); pasos[#pasos + 1] = estado(f1)
    BANCO.avanzar(0.3); pasos[#pasos + 1] = estado(f1)
    out.dentro = pasos
    f1:GetScript("OnEnter")(f1)
    -- Temblando en el borde entre la fila 1 y la 2: la 1 sigue hueca y la 2 no llega a pintarse.
    local temblor = {}
    for _ = 1, 5 do
      f1:GetScript("OnLeave")(f1); f2:GetScript("OnEnter")(f2)
      BANCO.avanzar(0.05)
      temblor[#temblor + 1] = estado(f1) .. "/" .. estado(f2)
      f2:GetScript("OnLeave")(f2); f1:GetScript("OnEnter")(f1)
      BANCO.avanzar(0.05)
      temblor[#temblor + 1] = estado(f1) .. "/" .. estado(f2)
    end
    out.temblor = temblor
    -- Al salir de la tabla, la hueca se va (una vez, pasada la espera de la luz).
    f1:GetScript("OnLeave")(f1)
    BANCO.avanzar(0.3)
    out.fuera = estado(f1)
    -- Pulsar el hueco (sin ratón encima, sin nada pintado) marca: sale amarilla.
    f3.casilla:Click("LeftButton")
    local marcadas = {}
    for k in pairs(t:marcadas()) do marcadas[#marcadas + 1] = k end
    out.marcar = {estado(f3), marcadas}
    -- Con el ratón encima sigue amarilla; al desmarcarla con el ratón encima, hueca; al salir, nada.
    f3:GetScript("OnEnter")(f3)
    out.marcadaEncima = estado(f3)
    f3.casilla:Click("LeftButton")
    out.desmarcadaEncima = estado(f3)
    f3:GetScript("OnLeave")(f3)
    BANCO.avanzar(0.3)
    out.desmarcadaFuera = estado(f3)
    -- La marca va con la fila: al desplazar, la amarilla sube con ella.
    f3.casilla:Click("LeftButton")
    rueda(-1)
    out.rueda = {estado(f2), estado(f3)}
    -- Marcar todo: todas amarillas; desmarcar todo: ninguna.
    t:marcarTodo(true)
    local todas = {}
    for i = 1, 10 do todas[i] = estado(t.filas[i]) end
    t:marcarTodo(false)
    local ninguna = {}
    for i = 1, 10 do ninguna[i] = estado(t.filas[i]) end
    out.todas, out.ninguna = todas, ninguna
    -- La ✓ de la cabecera no cambia.
    out.cabecera = {t.botonMarcar:IsShown(), {t.botonMarcar.icono:GetVertexColor()}}
    return out
  end)()`);
  const nada = Array(10).fill('nada');
  assert.deepEqual(r.inicio, nada, 'sin marcar ni ratón, ninguna casilla se pinta');
  assert.deepEqual(r.zona, Array(10).fill(true), 'la zona de la casilla sigue ahí para pulsarla');
  assert.deepEqual(r.dentro, ['hueca', 'hueca', 'hueca', 'hueca', 'hueca', 'hueca', 'hueca', 'hueca', 'nada'],
    'de la fila a su casilla y vuelta no cambia; solo se va al salir de las dos, pasada la espera');
  assert.deepEqual(r.temblor, Array(10).fill('hueca/nada'), 'temblando en un borde no sale ni se va nada');
  assert.equal(r.fuera, 'nada');
  assert.deepEqual(r.marcar, ['amarilla', ['k3']], 'pulsar el hueco marca');
  assert.equal(r.marcadaEncima, 'amarilla');
  assert.equal(r.desmarcadaEncima, 'hueca');
  assert.equal(r.desmarcadaFuera, 'nada');
  assert.deepEqual(r.rueda, ['amarilla', 'nada'], 'la marca va con la fila, no con el sitio');
  assert.deepEqual(r.todas, Array(10).fill('amarilla'));
  assert.deepEqual(r.ninguna, nada);
  assert.equal(r.cabecera[0], true);
  assert.equal(aHex(r.cabecera[1]), 'a99b8e', 'la ✓ de la cabecera, como siempre');
  sinErrores(m);
});

test('sin casillaDiscreta las casillas se ven siempre, como antes', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${TABLA(30)}
    ${ESTADO_CASILLA}
    local f1 = t.filas[1]
    local out = {inicio = {}}
    for i = 1, 10 do out.inicio[i] = estado(t.filas[i]) end
    f1:GetScript("OnEnter")(f1)
    out.encima = estado(f1)
    f1:GetScript("OnLeave")(f1)
    BANCO.avanzar(0.3)
    out.fuera = estado(f1)
    f1.casilla:Click("LeftButton")
    out.marcada = estado(f1)
    return out
  end)()`);
  assert.deepEqual(r.inicio, Array(10).fill('hueca'));
  assert.equal(r.encima, 'hueca');
  assert.equal(r.fuera, 'hueca');
  assert.equal(r.marcada, 'amarilla');
  sinErrores(m);
});

// Task 36: cómo se porta TSM con el ratón encima está sin confirmar; el interruptor Piezas.interno.CASILLA_HUECA_AL_PASAR lo
// cambia en un solo sitio. Apagado, con el ratón encima no sale nada y la marcada sigue amarilla.
test('casilla discreta con CASILLA_HUECA_AL_PASAR apagado: con el ratón encima no sale nada; marcada, amarilla', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    SnetForever.Piezas.interno.CASILLA_HUECA_AL_PASAR = false
    ${TABLA(30, 'opc.casillaDiscreta = true')}
    ${ESTADO_CASILLA}
    local f1 = t.filas[1]
    f1:GetScript("OnEnter")(f1)
    local out = {encima = estado(f1)}
    f1.casilla:Click("LeftButton")
    out.marcada = estado(f1)
    f1.casilla:Click("LeftButton")
    out.desmarcada = estado(f1)
    return out
  end)()`);
  assert.deepEqual(r, { encima: 'nada', marcada: 'amarilla', desmarcada: 'nada' });
  sinErrores(m);
});
