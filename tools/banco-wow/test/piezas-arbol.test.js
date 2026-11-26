// Pieza árbol de la ventana principal (ui/piezas/arbol.lua, SnetForever.Piezas.arbol): sangría, colores por nivel,
// botones al pasar el ratón, arrastrar, filtro y filas reutilizadas (virtualizado).
import assert from 'node:assert/strict';
// Las pruebas con testSiempre no necesitan el comercio: corren también en la pasada de solo núcleo.
import { test as testSiempre } from 'node:test';
// 0.7.0: las pruebas de este archivo (salvo las de testSiempre) necesitan el addon SnetForever_Comercio; en la pasada
// de solo núcleo (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const C = { elegida: '3d2e27', nivel1: 'fcf141', nivel2: 'bdaec6', nivel3: '06a2cb', nivel4: 'ffb85c', nivel5: '2fb8a0', base: 'ffffff' };
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

test('bulk expansion preserves the selected group and rebuilds the visible tree once', () => {
  const m = nuevaMaquina();
  try {
    const state = m.lua(`(function()
      local root = {clave = "root", texto = "Root", hijos = {
        {clave = "a", texto = "Alpha", hijos = {{clave = "b", texto = "Beta"}}},
      }}
      local tree = SnetForever.Piezas.arbol(UIParent, {raizFija = true, nodos = function() return root end})
      tree:SetSize(220, 220)
      tree:elegir("b")
      local before = tree.reconstrucciones
      tree:abrirTodos(false)
      local closed, selected, canOpen = tree:visibles(), tree:elegida(), tree:hayCerrado()
      tree:alternarTodos()
      return {closed, selected, canOpen, tree:visibles(), tree.reconstrucciones - before}
    end)()`);
    assert.deepEqual(state, [2, 'b', true, 3, 2]);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

// Un árbol pequeño: Grupo Base > Armas > Espadas > Largas > Finas > Dagas; Armaduras (hermana de Armas) > Pesadas.
// `a` es la pieza ya creada en un marco de 220 x 220 (10 filas) abajo a la izquierda de la pantalla.
const ARBOL_PEQUENO = `
    local P = SnetForever.Piezas
    local T = SnetForever.Tema
    local elegidos, soltados, pulsados = {}, {}, {}
    local raiz = {clave = "base", texto = "Grupo Base", nivel = 0, hijos = {
      {clave = "armas", texto = "Armas", nivel = 1, hijos = {
        {clave = "espadas", texto = "Espadas", nivel = 2, hijos = {
          {clave = "largas", texto = "Largas", nivel = 3, hijos = {
            {clave = "finas", texto = "Finas", nivel = 4, hijos = {
              {clave = "dagas", texto = "Dagas", nivel = 5},
            }},
          }},
        }},
      }},
      {clave = "armaduras", texto = "Armaduras", nivel = 1, hijos = {
        {clave = "pesadas", texto = "Pesadas", nivel = 2},
      }},
    }}
    local marco = CreateFrame("Frame", nil, UIParent)
    marco:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, 100)
    marco:SetSize(220, 220)
    local a = P.arbol(marco, {
      nodos = function() return raiz end,
      alElegir = function(c) elegidos[#elegidos + 1] = c end,
      botones = function(c)
        return {
          {icono = "mas", alPulsar = function() pulsados[#pulsados + 1] = "mas:" .. c end},
          {icono = "papelera", alPulsar = function() pulsados[#pulsados + 1] = "papelera:" .. c end},
        }
      end,
      alSoltar = function(o, d) soltados[#soltados + 1] = {o, d} end,
    })
    a:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
    a:SetSize(220, 220)
    for _, c in ipairs({"base", "armas", "espadas", "largas", "finas"}) do a:abrir(c, true) end
    -- La fila que enseña esa clave (nil si no se ve).
    local function fila(clave)
      for _, f in ipairs(a.filas) do
        if f:IsShown() and f.clave == clave then return f end
      end
    end`;

test('filas de 22 px, sangría de 12 px por nivel, colores por nivel y Grupo Base en blanco', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    local out = {}
    for _, c in ipairs({"base", "armas", "espadas", "largas", "finas", "dagas"}) do
      local f = fila(c)
      local _, _, _, x = f.triangulo:GetPoint(1)
      out[#out + 1] = {c, f:GetHeight(), x, {f.texto:GetTextColor()}, f.texto:GetText(), f.triangulo:IsShown()}
    end
    local ref = UIParent:CreateTexture()
    T.icono(ref, "cerrado")
    local cerrado = {ref:GetTexCoord()}
    T.icono(ref, "abierto")
    local abierto = {ref:GetTexCoord()}
    return {
      filas = out, visibles = a:visibles(), abierto = abierto, cerrado = cerrado,
      iconoAbierto = {fila("armas").triangulo.icono:GetTexCoord()},
      iconoCerrado = {fila("armaduras").triangulo.icono:GetTexCoord()},
    }
  end)()`);
  const esperados = [['base', 'base'], ['armas', 'nivel1'], ['espadas', 'nivel2'], ['largas', 'nivel3'], ['finas', 'nivel4'], ['dagas', 'nivel5']];
  assert.equal(r.filas.length, 6);
  r.filas.forEach((f, i) => {
    assert.equal(f[0], esperados[i][0]);
    assert.equal(f[1], 22, 'fila de 22 px');
    assert.equal(f[2] - r.filas[0][2], 12 * i, `sangría de 12 px por nivel (${f[0]})`);
    assert.equal(aHex(f[3]), C[esperados[i][1]], `color de ${f[0]}`);
  });
  assert.equal(aHex(r.filas[0][3]), 'ffffff', 'Grupo Base en blanco');
  assert.equal(r.filas[0][4], 'Grupo Base');
  assert.equal(r.filas[5][5], false, 'una hoja no lleva triángulo');
  assert.equal(r.filas[0][5], true);
  assert.equal(r.visibles, 7);
  assert.deepEqual(r.iconoAbierto, r.abierto, 'un nodo abierto lleva ▾');
  assert.deepEqual(r.iconoCerrado, r.cerrado, 'un nodo cerrado lleva ▸');
  assert.notDeepEqual(r.abierto, r.cerrado);
  sinErrores(m);
});

test('la elegida lleva fondo #3d2e27 y barra de 5 px, a 4 px del borde, del color de su nivel', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    a:elegir("espadas")
    local e, o = fila("espadas"), fila("armas")
    local _, _, _, mx = e.marca:GetPoint(1)
    return {
      elegida = a:elegida(), llamadas = #elegidos,
      fondo = {e.resalte:IsShown(), {e.resalte:GetVertexColor()}},
      marca = {e.marca:IsShown(), {e.marca:GetVertexColor()}, e.marca:GetWidth(), mx},
      otraFondo = o.resalte:IsShown(), otraMarca = o.marca:IsShown(),
    }
  end)()`);
  assert.equal(r.elegida, 'espadas');
  assert.equal(r.llamadas, 0, 'a:elegir no llama a alElegir');
  assert.equal(r.fondo[0], true);
  assert.equal(aHex(r.fondo[1]), C.elegida);
  assert.equal(r.marca[0], true);
  assert.equal(aHex(r.marca[1]), C.nivel2, 'barra del color del nivel (Espadas es nivel 2)');
  assert.equal(r.marca[2], 5, 'barra de 5 px');
  assert.equal(r.marca[3], 4, 'empieza 4 px dentro del borde izquierdo de la fila');
  assert.equal(r.otraFondo, false);
  assert.equal(r.otraMarca, false);
  sinErrores(m);
});

test('al pasar el ratón salen los botones de esa fila y al salir se van', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    local function botones(f)
      local r = {}
      for _, b in ipairs(f.botones or {}) do
        if b:IsShown() then r[#r + 1] = b end
      end
      return r
    end
    local ref = UIParent:CreateTexture()
    T.icono(ref, "mas")
    local mas = {ref:GetTexCoord()}
    T.icono(ref, "papelera")
    local papelera = {ref:GetTexCoord()}
    local f, g = fila("armas"), fila("espadas")
    local antes = #botones(f)
    f:GetScript("OnEnter")(f)
    local dentro = botones(f)
    local otra = #botones(g)
    local iconos = {{dentro[1].icono:GetTexCoord()}, {dentro[2].icono:GetTexCoord()}}
    dentro[2]:Click()
    dentro[1]:Click()
    f:GetScript("OnLeave")(f)
    local fuera = #botones(f)
    -- La elegida los lleva siempre, aunque el ratón no esté encima.
    a:elegir("armas")
    local elegida = #botones(fila("armas"))
    return {antes = antes, dentro = #dentro, otra = otra, iconos = iconos, mas = mas, papelera = papelera,
      pulsados = pulsados, fuera = fuera, elegida = elegida, elegidosTrasPulsar = #elegidos}
  end)()`);
  assert.equal(r.antes, 0, 'sin ratón encima no hay botones');
  assert.equal(r.dentro, 2);
  assert.equal(r.otra, 0, 'solo salen en la fila del ratón');
  assert.deepEqual(r.iconos, [r.mas, r.papelera]);
  assert.deepEqual(r.pulsados, ['papelera:armas', 'mas:armas']);
  assert.equal(r.fuera, 0, 'al salir se van');
  assert.equal(r.elegida, 2, 'la fila elegida los lleva siempre');
  assert.equal(r.elegidosTrasPulsar, 0, 'pulsar un botón no elige la fila');
  sinErrores(m);
});

test('pulsar una fila la elige y llama a alElegir; el triángulo abre y cierra', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    fila("largas"):Click()
    local tras = {a:elegida(), #elegidos, elegidos[1]}
    local n0 = a:visibles()
    fila("armas").triangulo:Click()
    local cerrado = a:visibles()
    fila("armas").triangulo:Click()
    return {tras = tras, n0 = n0, cerrado = cerrado, abierto = a:visibles(), elegidosFinal = #elegidos}
  end)()`);
  assert.deepEqual(r.tras, ['largas', 1, 'largas']);
  assert.equal(r.n0, 7);
  assert.equal(r.cerrado, 3, 'al cerrar Armas se van sus 4 descendientes (quedan Grupo Base, Armas y Armaduras)');
  assert.equal(r.abierto, 7, 'al abrirlo vuelven (conserva lo abierto dentro)');
  assert.equal(r.elegidosFinal, 1, 'el triángulo no elige');
  sinErrores(m);
});

test('arrastrar un nodo sobre otro llama a alSoltar(origen, destino)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    local s = a:GetEffectiveScale()
    -- El ratón sobre la fila número n (1 = la de arriba) de la pieza.
    local function raton(n)
      BANCO.cursor = {x = (a:GetLeft() + 30) * s, y = (a:GetTop() - (n - 1) * 22 - 11) * s}
    end
    local function arrastrar(origen, n)
      local f = fila(origen)
      f:GetScript("OnDragStart")(f)
      raton(n)
      f:GetScript("OnDragStop")(f)
    end
    -- Filas: 1 base, 2 armas, 3 espadas, 4 largas, 5 finas, 6 dagas, 7 armaduras.
    arrastrar("dagas", 7)
    local uno = {#soltados, soltados[1] and soltados[1][1], soltados[1] and soltados[1][2]}
    arrastrar("armas", 2) -- sobre sí mismo
    arrastrar("armas", 10) -- debajo de las filas que hay
    BANCO.cursor = {x = (a:GetLeft() - 50) * s, y = (a:GetTop() - 11) * s}
    local f = fila("armas")
    f:GetScript("OnDragStart")(f)
    f:GetScript("OnDragStop")(f) -- fuera de la pieza por la izquierda
    local ninguno = #soltados
    arrastrar("espadas", 1)
    return {uno = uno, ninguno = ninguno, total = #soltados, ultimo = soltados[2],
      registrada = fila("armas"):GetScript("OnDragStart") ~= nil}
  end)()`);
  assert.deepEqual(r.uno, [1, 'dagas', 'armaduras']);
  assert.equal(r.ninguno, 1, 'soltar sobre sí mismo, fuera de las filas o fuera de la pieza no hace nada');
  assert.equal(r.total, 2);
  assert.deepEqual(r.ultimo, ['espadas', 'base']);
  assert.equal(r.registrada, true);
  sinErrores(m);
});

// Un árbol con la raíz y n grupos hijos, cada décimo con dos hijos propios (todos cerrados salvo la raíz).
const ARBOL_GRANDE = (n) => `
    local P = SnetForever.Piezas
    local pedidos = 0
    local hijos = {}
    for i = 1, ${n} do
      local h = {clave = "g" .. i, texto = "Grupo " .. i, nivel = 1}
      if i % 10 == 0 then
        h.hijos = {{clave = "g" .. i .. "a", texto = "Sub " .. i .. "a", nivel = 2}, {clave = "g" .. i .. "b", texto = "Sub " .. i .. "b", nivel = 2}}
      end
      hijos[i] = h
    end
    local raiz = {clave = "base", texto = "Grupo Base", nivel = 0, hijos = hijos}
    local marco = CreateFrame("Frame", nil, UIParent)
    marco:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, 100)
    marco:SetSize(220, 220)
    -- Cuenta los marcos que se crean desde aquí.
    local creados = 0
    local crear = CreateFrame
    CreateFrame = function(...) creados = creados + 1; return crear(...) end
    local a = P.arbol(marco, {
      nodos = function() pedidos = pedidos + 1; return raiz end,
      botones = function() return {{icono = "mas", alPulsar = function() end}} end,
    })
    a:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
    a:SetSize(220, 220)
    a:refrescar()
    local function textos()
      local r = {}
      for _, f in ipairs(a.filas) do
        if f:IsShown() then r[#r + 1] = f.texto:GetText() end
      end
      return r
    end
    local function rueda(delta, veces)
      for _ = 1, veces or 1 do a:GetScript("OnMouseWheel")(a, delta) end
    end`;

test('con 353 nodos se crean como mucho las filas visibles más una', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_GRANDE(353)}
    local alCrear, pedidosAlCrear = creados, pedidos
    local inicio = textos()
    local filas0 = #a.filas
    rueda(-1, 100)
    local tras = textos()
    rueda(-1, 400)
    local final = textos()
    rueda(1, 400)
    local vuelta = textos()[1]
    local barra = {a.barra:IsShown(), a.barra:GetWidth()}
    CreateFrame = crear
    return {alCrear = alCrear, filas0 = filas0, filas = #a.filas, creadosDespues = creados,
      pedidosAlCrear = pedidosAlCrear, pedidosDespues = pedidos, visibles = a:visibles(),
      inicio = inicio, tras = tras, final = final, vuelta = vuelta, barra = barra}
  end)()`);
  assert.equal(r.visibles, 354, 'la raíz y sus 353 grupos');
  assert.ok(r.filas <= 11, `como mucho 10 filas visibles más una: ${r.filas}`);
  assert.ok(r.filas0 <= 11);
  assert.equal(r.creadosDespues, r.alCrear, 'desplazar no crea ningún marco');
  assert.equal(r.pedidosDespues, r.pedidosAlCrear, 'desplazar no vuelve a pedir ni a recorrer el árbol');
  assert.equal(r.inicio.length, 10);
  assert.equal(r.inicio[0], 'Grupo Base');
  assert.equal(r.tras[0], 'Grupo 100', 'la rueda baja de fila en fila: 100 muescas = 100 filas');
  assert.equal(r.final[r.final.length - 1], 'Grupo 353', 'se llega al final y no se pasa');
  assert.equal(r.vuelta, 'Grupo Base');
  assert.deepEqual(r.barra, [true, 4]);
  sinErrores(m);
});

test('el filtro deja los que coinciden y sus padres, sin tildes ni mayúsculas', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local raiz = {clave = "base", texto = "Grupo Base", nivel = 0, hijos = {
      {clave = "armas", texto = "Armas", nivel = 1, hijos = {
        {clave = "can", texto = "Cañón", nivel = 2},
        {clave = "esp", texto = "Espada", nivel = 2},
      }},
      {clave = "arm", texto = "Armaduras", nivel = 1, hijos = {
        {clave = "pla", texto = "ÁRBOL de placas", nivel = 2, hijos = {
          {clave = "pie", texto = "Pieza", nivel = 3},
        }},
      }},
      {clave = "otro", texto = "Otro", nivel = 1},
    }}
    local marco = CreateFrame("Frame", nil, UIParent)
    marco:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, 100)
    marco:SetSize(220, 220)
    local a = P.arbol(marco, {nodos = function() return raiz end})
    a:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
    a:SetSize(220, 220)
    a:refrescar()
    local function textos()
      local r = {}
      for _, f in ipairs(a.filas) do
        if f:IsShown() then r[#r + 1] = f.texto:GetText() end
      end
      return r
    end
    local sin = textos()
    a:filtrar("CANON")
    local canon = textos()
    local canonVisibles = a:visibles()
    a:filtrar("arbol")
    local arbol = textos()
    a:filtrar("zzz")
    local nada = {#textos(), a:visibles()}
    a:filtrar("a")
    local varios = a:visibles()
    a:filtrar("")
    return {sin = sin, canon = canon, canonVisibles = canonVisibles, arbol = arbol, nada = nada, varios = varios,
      final = textos()}
  end)()`);
  assert.deepEqual(r.sin, ['Grupo Base', 'Armas', 'Armaduras', 'Otro'], 'sin filtro, todo cerrado salvo la raíz');
  assert.deepEqual(r.canon, ['Grupo Base', 'Armas', 'Cañón'], 'coincide Cañón con CANON y salen sus padres abiertos');
  assert.equal(r.canonVisibles, 3);
  assert.deepEqual(r.arbol, ['Grupo Base', 'Armaduras', 'ÁRBOL de placas'], 'ÁRBOL coincide con arbol; sus hijos no coinciden y no salen');
  assert.deepEqual(r.nada, [0, 0], 'si nada coincide no sale ni la raíz');
  assert.ok(r.varios > 3);
  assert.deepEqual(r.final, r.sin, 'quitar el filtro devuelve lo que estaba abierto');
  sinErrores(m);
});

test('elegir desde fuera enseña la fila aunque esté oculta y refrescar conserva lo abierto', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_GRANDE(353)}
    a:elegir("g250a")
    local antes = a:visibles()
    local texto = {}
    for _, f in ipairs(a.filas) do
      if f:IsShown() and f.clave == "g250a" then texto = {f.texto:GetText(), f.resalte:IsShown()} end
    end
    a:abrir("g250", false)
    local cerrado = a:visibles()
    a:refrescar()
    CreateFrame = crear
    return {antes = antes, texto = texto, cerrado = cerrado, trasRefrescar = a:visibles(), elegida = a:elegida()}
  end)()`);
  assert.equal(r.antes, 356, 'se abrió Grupo 250 para enseñar su hijo');
  assert.deepEqual(r.texto, ['Sub 250a', true], 'la fila elegida se ve (con fondo) sin tener que desplazar');
  assert.equal(r.cerrado, 354);
  assert.equal(r.trasRefrescar, 354, 'refrescar no reabre lo cerrado');
  assert.equal(r.elegida, 'g250a');
  sinErrores(m);
});

// El banco imita IsMouseOver y MouseIsOver (el árbol los usa para saber si el ratón sigue sobre una fila).
testSiempre('banco: IsMouseOver y MouseIsOver comparan BANCO.cursor con el rectángulo del marco', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local f = CreateFrame("Frame", nil, UIParent)
    f:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, 100)
    f:SetSize(50, 20)
    local s = f:GetEffectiveScale()
    local function en(x, y) BANCO.cursor = {x = x * s, y = y * s} end
    en(120, 110)
    local dentro = {f:IsMouseOver(), MouseIsOver(f)}
    en(99, 110)
    local izquierda = f:IsMouseOver()
    en(120, 121)
    local arriba = MouseIsOver(f)
    local sinSitio = CreateFrame("Frame", nil, nil):IsMouseOver()
    BANCO.cursor = {x = 0, y = 0}
    return {dentro = dentro, izquierda = izquierda, arriba = arriba, sinSitio = sinSitio}
  end)()`);
  assert.deepEqual(r.dentro, [true, true]);
  assert.equal(r.izquierda, false);
  assert.equal(r.arriba, false);
  assert.equal(r.sinSitio, false);
  sinErrores(m);
});

// ---- Ronda 1 de la revisión ----

test('con filtro, el triángulo abre y cierra en la vista filtrada y al quitarlo lo abierto está como antes', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    local antes = a:visibles()
    a:filtrar("dagas")
    local filtrada = a:visibles()
    fila("armas").triangulo:Click()
    local cerrada = {a:visibles(), fila("armas") ~= nil, fila("espadas") == nil}
    local ref = UIParent:CreateTexture()
    T.icono(ref, "cerrado")
    local iconoCerrado = {fila("armas").triangulo.icono:GetTexCoord()}
    local cerradoRef = {ref:GetTexCoord()}
    fila("armas").triangulo:Click()
    local reabierta = a:visibles()
    fila("armas").triangulo:Click()
    -- Cambiar de filtro borra ese estado: Armas vuelve a verse abierta.
    a:filtrar("finas")
    local otro = a:visibles()
    fila("armas").triangulo:Click()
    a:filtrar("")
    T.icono(ref, "abierto")
    return {antes = antes, filtrada = filtrada, cerrada = cerrada, iconoCerrado = iconoCerrado, cerradoRef = cerradoRef,
      reabierta = reabierta, otro = otro, tras = a:visibles(), armas = {fila("armas").triangulo.icono:GetTexCoord()},
      abiertoRef = {ref:GetTexCoord()}}
  end)()`);
  assert.equal(r.antes, 7);
  assert.equal(r.filtrada, 6, 'Grupo Base, Armas, Espadas, Largas, Finas y Dagas');
  assert.deepEqual(r.cerrada, [2, true, true], 'cerrar Armas en la vista filtrada se ve: solo quedan Grupo Base y Armas');
  assert.deepEqual(r.iconoCerrado, r.cerradoRef);
  assert.equal(r.reabierta, 6, 'volver a pulsar la abre');
  assert.equal(r.otro, 5, 'al cambiar de filtro el estado de la vista filtrada se borra');
  assert.equal(r.tras, 7, 'al quitar el filtro lo abierto está como antes de filtrar');
  assert.deepEqual(r.armas, r.abiertoRef, 'Armas sigue abierta');
  sinErrores(m);
});

test('al quitar el filtro se ve la fila elegida o, si no hay, vuelve al sitio de antes; al poner uno, empieza arriba', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_GRANDE(353)}
    rueda(-1, 50)
    local antes = textos()[1]
    a:filtrar("grupo 3")
    local arriba = textos()[1]
    a:filtrar("grupo 2")
    a:filtrar("")
    local sin = textos()[1]
    -- Con una fila elegida, quitar el filtro la enseña.
    a:elegir("g300")
    rueda(1, 1000)
    a:filtrar("grupo 3")
    rueda(-1, 3)
    a:filtrar("")
    local visible = false
    for _, f in ipairs(a.filas) do
      if f:IsShown() and f.clave == "g300" then visible = f.resalte:IsShown() end
    end
    CreateFrame = crear
    return {antes = antes, arriba = arriba, sin = sin, visible = visible}
  end)()`);
  assert.equal(r.antes, 'Grupo 50');
  assert.equal(r.arriba, 'Grupo Base', 'con un filtro la lista empieza arriba');
  assert.equal(r.sin, 'Grupo 50', 'sin fila elegida, al quitar el filtro vuelve donde estaba');
  assert.equal(r.visible, true, 'con fila elegida, al quitar el filtro se desplaza hasta ella');
  sinErrores(m);
});

test('desplazar con el cursor sobre una fila: los botones salen en la fila de debajo, con la clave nueva, y en ninguna otra', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_GRANDE(353)}
    local s = a:GetEffectiveScale()
    BANCO.cursor = {x = (a:GetLeft() + 30) * s, y = (a:GetTop() - 2 * 22 - 11) * s}
    local function conBotones()
      local r = {}
      for i, f in ipairs(a.filas) do
        for _, b in ipairs(f.botones) do
          if b:IsShown() then r[#r + 1] = {i, b.clave} end
        end
      end
      return r
    end
    rueda(-1, 5)
    local tras = conBotones()
    rueda(-1, 20)
    local mas = conBotones()
    BANCO.cursor = {x = 0, y = 0}
    rueda(1, 1)
    local fuera = conBotones()
    CreateFrame = crear
    return {tras = tras, mas = mas, fuera = fuera}
  end)()`);
  assert.deepEqual(r.tras, [[3, 'g7']], 'la tercera fila, con el nodo que ahora hay debajo (Grupo 7)');
  assert.deepEqual(r.mas, [[3, 'g27']]);
  assert.deepEqual(r.fuera, [], 'sin cursor encima no sale ninguno');
  sinErrores(m);
});

test('la rueda no reconstruye la lista plana; abrir, filtrar y refrescar sí', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_GRANDE(353)}
    local base = a.reconstrucciones
    rueda(-1, 100)
    rueda(1, 30)
    local rueda_ = a.reconstrucciones
    a:abrir("g10", true)
    local abrir = a.reconstrucciones
    a:filtrar("grupo 3")
    local filtrar = a.reconstrucciones
    CreateFrame = crear
    return {base = base, rueda = rueda_, abrir = abrir, filtrar = filtrar}
  end)()`);
  assert.ok(r.base >= 1);
  assert.equal(r.rueda, r.base, 'desplazar no reconstruye');
  assert.ok(r.abrir > r.rueda, 'abrir sí');
  assert.ok(r.filtrar > r.abrir, 'filtrar sí');
  sinErrores(m);
});

test('un nodo sin clave se salta (con lo de debajo), se avisa una sola vez y el resto del árbol funciona', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local P = SnetForever.Piezas
    local raiz = {clave = "base", texto = "Grupo Base", nivel = 0, hijos = {
      {clave = "a", texto = "Uno", nivel = 1},
      {texto = "Sin clave", nivel = 1, hijos = {{clave = "z", texto = "Hijo perdido", nivel = 2}}},
      {clave = "b", texto = "Dos", nivel = 1},
    }}
    local marco = CreateFrame("Frame", nil, UIParent)
    marco:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, 100)
    marco:SetSize(220, 220)
    local a = P.arbol(marco, {nodos = function() return raiz end})
    a:SetPoint("TOPLEFT", marco, "TOPLEFT", 0, 0)
    a:SetSize(220, 220)
    a:refrescar()
    a:refrescar()
    local textos = {}
    for _, f in ipairs(a.filas) do
      if f:IsShown() then textos[#textos + 1] = f.texto:GetText() end
    end
    return {textos = textos, visibles = a:visibles()}
  end)()`);
  assert.deepEqual(r.textos, ['Grupo Base', 'Uno', 'Dos']);
  assert.equal(r.visibles, 3);
  const errores = m.errores();
  assert.equal(errores.length, 1, 'un solo aviso aunque se refresque dos veces');
  assert.match(String(errores[0].mensaje ?? errores[0]), /clave/);
});

test('raizFija: la raíz va sin triángulo, con el texto a 17 px, siempre abierta, y pulsarla solo la elige', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    local f = P.arbol(marco, {nodos = function() return raiz end, alElegir = function(c) elegidos[#elegidos + 1] = c end, raizFija = true})
    f:SetAllPoints(marco)
    f:refrescar()
    local function fil(c) for _, x in ipairs(f.filas) do if x:IsShown() and x.clave == c then return x end end end
    local base = fil("base")
    local _, _, _, tx = base.texto:GetPoint(1)
    local out = {triangulo = base.triangulo:IsShown(), textoX = tx, visiblesAntes = f:visibles(), hijaTriangulo = fil("armas").triangulo:IsShown()}
    base:Click("LeftButton")
    out.elegidos = elegidos
    out.visiblesDespues = f:visibles()
    f:abrir("base", false)
    out.visiblesTrasCerrar = f:visibles()
    f:filtrar("dagas")
    out.conFiltro = {fil("base") ~= nil, fil("base").triangulo:IsShown()}
    local g = P.arbol(marco, {nodos = function() return raiz end})
    g:SetAllPoints(marco); g:refrescar()
    out.normal = g.filas[1].triangulo:IsShown()
    return out
  end)()`);
  assert.equal(r.triangulo, false);
  assert.equal(r.textoX, 17);
  assert.equal(r.hijaTriangulo, true, 'los demás nodos con hijos conservan su triángulo');
  assert.deepEqual(r.elegidos, ['base']);
  assert.equal(r.visiblesDespues, r.visiblesAntes, 'pulsarla no la pliega');
  assert.equal(r.visiblesTrasCerrar, r.visiblesAntes);
  assert.deepEqual(r.conFiltro, [true, false]);
  assert.equal(r.normal, true);
  sinErrores(m);
});

test('sinRaiz: la raíz no sale como fila (los hijos van arriba) y botonesSiempre deja sus botones a la vista', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    local f = P.arbol(marco, {
      nodos = function() return raiz end, sinRaiz = true,
      botones = function(c) return {{icono = "mas", alPulsar = function() end}} end,
      botonesSiempre = function(c) return c == "armas" end,
    })
    f:SetAllPoints(marco)
    f:refrescar()
    local function claves()
      local t = {}
      for _, x in ipairs(f.filas) do if x:IsShown() and x.clave ~= nil then t[#t + 1] = x.clave end end
      return t
    end
    local out = {sin = claves(), visibles = f:visibles()}
    local function nBotones(c)
      for _, x in ipairs(f.filas) do
        if x:IsShown() and x.clave == c then
          local n = 0
          for _, b in ipairs(x.botones) do if b:IsShown() then n = n + 1 end end
          return n
        end
      end
    end
    out.armas = nBotones("armas")
    out.armaduras = nBotones("armaduras")
    f:abrir("armas", true)
    out.abierto = claves()
    f:filtrar("espadas")
    out.filtrado = claves()
    f:filtrar("zzz")
    out.vacio = f:visibles()
    return out
  end)()`);
  assert.deepEqual(r.sin, ['armas', 'armaduras'], 'sin la fila de la raíz');
  assert.equal(r.visibles, 2);
  assert.equal(r.armas, 1, 'botonesSiempre dice que sí');
  assert.equal(r.armaduras, 0, 'y a esa no: solo con el ratón encima');
  assert.deepEqual(r.abierto, ['armas', 'espadas', 'armaduras']);
  assert.deepEqual(r.filtrado, ['armas', 'espadas']);
  assert.equal(r.vacio, 0);
  sinErrores(m);
});

test('margen y sangria: el árbol puede acercar el texto al borde (por defecto 8 y 12, sin cambios)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    local g = P.arbol(marco, {nodos = function() return raiz end, margen = 4, sangria = 11})
    g:SetAllPoints(marco)
    g:abrir("armas", true)
    local function x(arbol, c)
      for _, f in ipairs(arbol.filas) do
        if f:IsShown() and f.clave == c then
          local _, _, _, tx = f.texto:GetPoint(1)
          local _, _, _, ix = f.triangulo:GetPoint(1)
          return {tx, ix}
        end
      end
    end
    return {por = {x(a, "armas"), x(a, "espadas")}, otro = {x(g, "armas"), x(g, "espadas")}}
  end)()`);
  assert.deepEqual(r.por, [[8 + 12 + 12 + 4, 8 + 12 - 2], [8 + 24 + 16, 8 + 24 - 2]], 'por defecto: margen 8 y 12 por nivel');
  assert.deepEqual(r.otro, [[4 + 11 + 16, 4 + 11 - 2], [4 + 22 + 16, 4 + 22 - 2]]);
  sinErrores(m);
});

// Subasta, bloque B (Task B3): en Navegar la barra no marca la fila elegida sino los grupos elegidos para el escaneo de
// compras (opción marcas). Elegido: barra en el color de su nivel y sin fondo; sin elegir: barra oscura (secundario) y la
// fila hundida; sin marca (nil): sin barra y hundida. Barras de 5 × 14 px, a 4 px del borde y centradas en la fila.
test('marcas: barra de color en las marcadas, oscura en las no marcadas, ninguna con nil; repintar las vuelve a mirar', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    local marcadas = {armas = true, espadas = false}
    local g = P.arbol(marco, {nodos = function() return raiz end, marcas = function(c) return marcadas[c] end,
      alElegir = function(c) elegidos[#elegidos + 1] = c end})
    g:SetAllPoints(marco)
    g:abrir("armas", true)
    local function ver(c)
      for _, f in ipairs(g.filas) do
        if f:IsShown() and f.clave == c then
          return {barra = f.marca:IsShown() and {f.marca:GetVertexColor()} or false, fondo = f.resalte:IsShown() and {f.resalte:GetVertexColor()} or false,
            ancho = f.marca:GetWidth(), alto = f.marca:GetHeight(), izq = f.marca:GetLeft() - f:GetLeft(), arriba = f:GetTop() - f.marca:GetTop(), fila = f}
        end
      end
    end
    local antes = {armas = ver("armas"), espadas = ver("espadas"), base = ver("base")}
    -- Pulsar llama a alElegir, pero la fila pulsada no lleva el fondo de la elegida.
    ver("armaduras").fila:Click()
    local pulsada = ver("armaduras")
    marcadas.espadas = true
    g:repintar()
    return {antes = antes, pulsada = pulsada, elegidos = elegidos, despues = ver("espadas")}
  end)()`);
  const tok = (n) => aHex(m.lua(`SnetForever.Tema.color(${JSON.stringify(n)})`));
  assert.equal(aHex(r.antes.armas.barra), C.nivel1, 'marcada: color de su nivel');
  assert.equal(r.antes.armas.fondo, false, 'marcada: sin fondo');
  assert.deepEqual([r.antes.armas.ancho, r.antes.armas.alto, r.antes.armas.izq, r.antes.armas.arriba], [5, 14, 4, 4]);
  assert.equal(aHex(r.antes.espadas.barra), tok('secundario'), 'sin marcar: barra oscura');
  assert.equal(aHex(r.antes.espadas.fondo), tok('hundido'), 'sin marcar: fila hundida');
  assert.equal(r.antes.base.barra, false, 'nil: sin barra');
  assert.equal(aHex(r.antes.base.fondo), tok('hundido'));
  assert.deepEqual(r.elegidos, ['armaduras']);
  assert.equal(r.pulsada.barra, false, 'la pulsada no gana la barra de la elegida');
  assert.equal(aHex(r.pulsada.fondo), tok('hundido'), 'ni su fondo');
  assert.equal(aHex(r.despues.barra), C.nivel2, 'repintar mira otra vez las marcas');
  sinErrores(m);
});

// B4r: opción relleno (token). El hueco que queda debajo de la última fila se pinta de ese color hasta abajo del árbol, como
// en TSM: el fondo oscuro del árbol llega siempre hasta el final de su sitio, tenga las filas que tenga. Con más filas de las
// que caben no queda hueco y el relleno no se ve. Sin la opción no hay relleno (como siempre).
test('relleno: el hueco bajo la última fila va del color pedido hasta abajo, al abrir, cerrar, filtrar y desplazar', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    ${ARBOL_PEQUENO}
    local g = P.arbol(marco, {nodos = function() return raiz end, relleno = "hundido"})
    g:SetAllPoints(marco)
    g:repintar() -- en el juego lo haría OnSizeChanged; el banco no lo lanza al anclar
    local function ver()
      local t = g.relleno
      if not t:IsShown() then return {visible = false, filas = g:visibles()} end
      return {visible = true, arriba = g:GetTop() - t:GetTop(), abajo = t:GetBottom() - g:GetBottom(), izq = t:GetLeft() - g:GetLeft(),
        der = g:GetRight() - t:GetRight(), color = {t:GetVertexColor()}, filas = g:visibles(), capa = t:GetDrawLayer()}
    end
    local plegado = ver() -- Grupo Base, Armas y Armaduras
    g:abrir("armas", true)
    local abierto = ver() -- + Espadas
    g:filtrar("pesadas")
    local filtrado = ver() -- Grupo Base, Armaduras y Pesadas
    g:filtrar("")
    for _, c in ipairs({"armas", "espadas", "largas", "finas", "armaduras"}) do g:abrir(c, true) end
    local lleno = ver() -- 8 filas en 10 que caben
    marco:SetHeight(100) -- caben 4 filas y media: no queda hueco
    g:SetAllPoints(marco)
    g:repintar()
    local bajo = ver()
    g:GetScript("OnMouseWheel")(g, -1)
    local desplazado = ver()
    local sin = P.arbol(marco, {nodos = function() return raiz end})
    return {plegado = plegado, abierto = abierto, filtrado = filtrado, lleno = lleno, bajo = bajo, desplazado = desplazado,
      sinRelleno = sin.relleno == nil or not sin.relleno:IsShown()}
  end)()`);
  const tok = (n) => aHex(m.lua(`SnetForever.Tema.color(${JSON.stringify(n)})`));
  for (const [nombre, v, filas] of [['plegado', r.plegado, 3], ['abierto', r.abierto, 4], ['filtrado', r.filtrado, 3], ['lleno', r.lleno, 8]]) {
    assert.equal(v.visible, true, `${nombre}: se ve`);
    assert.equal(v.filas, filas, `${nombre}: ${filas} filas`);
    assert.ok(Math.abs(v.arriba - filas * 22) < 0.01, `${nombre}: empieza justo debajo de la última fila (${v.arriba})`);
    assert.ok(Math.abs(v.abajo) < 0.01 && Math.abs(v.izq) < 0.01 && Math.abs(v.der) < 0.01, `${nombre}: hasta abajo y de lado a lado`);
    assert.equal(aHex(v.color), tok('hundido'), `${nombre}: del color pedido`);
    assert.equal(v.capa, 'BACKGROUND', `${nombre}: detrás de todo`);
  }
  assert.equal(r.bajo.visible, false, 'con más filas de las que caben no hay hueco');
  assert.equal(r.desplazado.visible, false, 'ni al desplazar');
  assert.equal(r.sinRelleno, true, 'sin la opción, nada nuevo');
  sinErrores(m);
});
