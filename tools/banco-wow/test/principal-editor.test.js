// Ventana principal, parte 1, Task 22: editor de una operación (ui/principal/editor-operacion.lua del addon
// SnetForever_Comercio). Elegir una operación en el árbol de la página «Operaciones» abre su editor a la derecha: cabecera
// (icono, nombre, ✎ Renombrar y ⟳ Restablecer), los campos de su tipo pintados desde Operaciones.TIPOS (Subasta con tres
// pestañas), «Opciones de manejo» y «Administrar grupo».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const maquina = (opciones = {}) => nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, ...opciones });
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const S = '`';
const q = (t) => JSON.stringify(t);
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));

// Abre la ventana en Operaciones y deja ayudas de Lua: abrirOp(tipo, nombre) pulsa la operación en el árbol (como el
// jugador); etiquetas() y secciones() dan lo que enseña la página del editor que se ve, de arriba abajo.
const ABRIR = `
  SnetForever.Principal.abrir("operaciones")
  local P = SnetForever.PrincipalOperaciones
  local O = SnetForever.Operaciones
  local E = P.editor
  local function fila(clave)
    for _, f in ipairs(P.arbol.filas) do
      if f:IsShown() and f.clave == clave then return f end
    end
  end
  local function abrirOp(tipo, nombre)
    P.arbol:refrescar()
    P.arbol:abrir("t:" .. tipo, true)
    fila("o:" .. tipo .. ":" .. nombre):Click("LeftButton")
  end
  local function etiquetas()
    local pag, t = E:pagina(), {}
    for _, clave in ipairs(pag.orden) do t[#t + 1] = pag.bloques[clave].etiqueta.texto:GetText() end
    return t
  end
  local function secciones()
    local t = {}
    for _, s in ipairs(E:pagina().secciones) do t[#t + 1] = s.titulo:GetText() end
    return t
  end
  local function clases()
    local pag, t = E:pagina(), {}
    for _, clave in ipairs(pag.orden) do t[#t + 1] = pag.bloques[clave].clase end
    return t
  end
  -- El banco no coloca los hijos de una zona con desplazamiento: las medidas salen de los puntos de anclaje. arriba(marco) es
  -- lo que baja desde arriba del contenido; ancho(b) y derecha(b) el ancho del control y lo que le queda a su derecha.
  local function arriba(marco) local _, _, _, _, y = marco:GetPoint(1); return -y end
  local function puntos(c)
    local izq, der = 0, 0
    for i = 1, c:GetNumPoints() do
      local p, _, _, x = c:GetPoint(i)
      if p == "TOPLEFT" then izq = x elseif p == "TOPRIGHT" then der = x end
    end
    return izq, der
  end
  local function ancho(b) local izq, der = puntos(b.control); return E:pagina().contenido:GetWidth() + der - izq end
  local function derecha(b) local _, der = puntos(b.control); return -der end`;

const MANEJO = ['Ignorar la operación en estos reinos y facciones', 'Ignorar la operación en estos personajes', 'Aplicar operación a grupo'];

test('Subasta tiene las pestañas Detalles, Publicación y Cancelación con los campos de op-01/02/03', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Alta")
    abrirOp("subasta", "Alta")
    local out = {visto = E:IsShown(), resumen = P.resumen:IsShown(), nombre = E.textoNombre:GetText()}
    out.pestanasVisibles = E.pestanas:IsShown()
    out.pestanas = {}
    for _, b in ipairs(E.pestanas.pestanas) do out.pestanas[#out.pestanas + 1] = b.texto:GetText() end
    out.detalles = {secciones = secciones(), etiquetas = etiquetas(), clases = clases(), elegida = E.pestanas:elegida()}
    E.pestanas.pestanas[2]:Click("LeftButton")
    out.publicacion = {secciones = secciones(), etiquetas = etiquetas(), clases = clases()}
    -- Bloques cada 53 px dentro de una sección (medido en el marco, no en la tabla de posiciones).
    local pag = E:pagina()
    local tops = {}
    for _, clave in ipairs(pag.orden) do tops[#tops + 1] = arriba(pag.bloques[clave].etiqueta) end
    out.tops = tops
    -- La puja (numero) lleva su ayuda a la derecha; las fórmulas, el ⧉; las listas, un desplegable.
    local puja = E:bloque("pujaPorcentaje")
    out.puja = {puja.ayuda:GetText(), puja.control:GetText(), derecha(puja) > 100, ancho(puja) < pag.contenido:GetWidth() - 100}
    out.tope = {E:bloque("tope").control.botonCopiar ~= nil, E:bloque("tope").control:GetText()}
    out.duracion = E:bloque("duracion").control.texto:GetText()
    out.vinculoEnTodos = true
    for _, clave in ipairs(pag.orden) do
      local b = pag.bloques[clave]
      if b.def and not b.def.comun and not b.etiqueta.botonVinculo then out.vinculoEnTodos = false end
    end
    E.pestanas.pestanas[3]:Click("LeftButton")
    out.cancelacion = {secciones = secciones(), etiquetas = etiquetas(), clases = clases()}
    out.radio = {E:bloque("cancelarRebajadas").control.si.texto:GetText(), E:bloque("cancelarRebajadas").control.no.texto:GetText()}
    -- Otra operación de subasta abre en la misma pestaña.
    O.crear("subasta", "Baja")
    abrirOp("subasta", "Baja")
    out.otra = {E.textoNombre:GetText(), E.pestanas:elegida()}
    return out
  end)()`);
  assert.equal(r.visto, true, 'elegir la operación abre su editor');
  assert.equal(r.resumen, false, 'y esconde el resumen');
  assert.equal(r.nombre, 'Alta');
  assert.equal(r.pestanasVisibles, true);
  assert.deepEqual(r.pestanas, ['Detalles', 'Publicación', 'Cancelación']);
  assert.equal(r.detalles.elegida, 1);
  assert.deepEqual(r.detalles.secciones, ['Opciones generales', 'Opciones de manejo', 'Administrar grupo']);
  assert.deepEqual(r.detalles.etiquetas, ['Ignorar subastas por duración', ...MANEJO]);
  assert.deepEqual(r.detalles.clases, ['lista', 'varios', 'varios', 'grupos']);
  assert.deepEqual(r.publicacion.secciones, ['Opciones de publicación', 'Precio de publicación']);
  assert.deepEqual(r.publicacion.etiquetas, ['Duración de la subasta', 'Máximo a publicar', 'Cantidad que se queda en las bolsas',
    'No publicar tras tantas caducadas', 'Puja como porcentaje de la compra directa', 'Rebaja', 'Precio mínimo',
    'Si queda por debajo del mínimo', 'Precio máximo', 'Si queda por encima del máximo', 'Precio normal']);
  assert.deepEqual(r.publicacion.clases, ['lista', 'formula', 'formula', 'formula', 'numero', 'formula', 'formula', 'lista',
    'formula', 'lista', 'formula']);
  // Cuatro bloques en «Opciones de publicación», cada 53 px; la segunda sección empieza más abajo.
  for (let i = 1; i < 4; i++) assert.equal(r.tops[i] - r.tops[i - 1], 53, `bloque ${i}`);
  assert.ok(r.tops[4] - r.tops[3] > 53, 'entre secciones hay más hueco (título y descripción)');
  for (let i = 5; i < 11; i++) assert.equal(r.tops[i] - r.tops[i - 1], 53, `bloque ${i}`);
  assert.deepEqual(r.puja, ['Un valor de 0 a 100 %', '100%', true, true], 'la puja (con %, Task 35) deja sitio a su ayuda a la derecha');
  assert.deepEqual(r.tope, [true, '40000']);
  assert.equal(r.duracion, '8 horas', 'la clave «24» por defecto son 8 horas en Forever (C2a)');
  assert.equal(r.vinculoEnTodos, true, 'cada campo lleva 🔗');
  assert.deepEqual(r.cancelacion.secciones, ['Opciones de cancelación']);
  assert.deepEqual(r.cancelacion.etiquetas, ['Cancelar las subastas rebajadas', 'Cancelar para publicar más caro',
    'Diferencia mínima para volver a publicar']);
  assert.deepEqual(r.cancelacion.clases, ['sino', 'sino', 'formula']);
  assert.deepEqual(r.radio, ['Sí', 'No']);
  assert.deepEqual(r.otra, ['Baja', 3]);
  sinErrores(m);
});

const OTROS = {
  artesania: {
    secciones: ['Opciones de reposición', 'Valor de lo fabricado'],
    etiquetas: ['Cantidad mínima a reponer', 'Cantidad máxima a reponer', 'Pedir un beneficio mínimo', 'Beneficio mínimo',
      'Cambiar el valor de lo fabricado', 'Valor de lo fabricado'],
    clases: ['formula', 'formula', 'sino', 'formula', 'sino', 'formula'],
  },
  correo: {
    secciones: ['Opciones generales'],
    etiquetas: ['Personaje de destino', 'Cantidad que te quedas', 'Poner una cantidad máxima', 'Cantidad máxima',
      'Reponer hasta la cantidad máxima', 'Fuentes para reponer'],
    clases: ['texto', 'formula', 'sino', 'formula', 'sino', 'varios'],
  },
  compras: {
    secciones: ['Opciones generales'],
    etiquetas: ['Precio máximo', 'Enseñar también lo que pasa del máximo', 'Cantidad máxima a reponer', 'Fuentes para reponer'],
    clases: ['formula', 'sino', 'formula', 'varios'],
  },
  sniper: {
    secciones: ['Opciones generales'],
    etiquetas: ['Precio máximo'],
    clases: ['formula'],
  },
  vendedor: {
    secciones: ['Compra', 'Venta'],
    etiquetas: ['Activar la compra', 'Cantidad a reponer', 'Fuentes para reponer', 'Activar la venta', 'Cantidad que te quedas',
      'Mínimo de caducadas', 'Valor de mercado', 'Valor de mercado máximo', 'Valor de destrucción', 'Valor de destrucción máximo',
      'Vender objetos ligados'],
    clases: ['sino', 'formula', 'varios', 'sino', 'formula', 'formula', 'formula', 'formula', 'formula', 'formula', 'sino'],
  },
  almacen: {
    secciones: ['Mover entre el banco y las bolsas', 'Reponer desde el banco'],
    etiquetas: ['Cantidad a mover', 'Múltiplo del tamaño de pila', 'Cantidad que se queda en las bolsas',
      'Cantidad que se queda en el banco', 'Cantidad a reponer', 'Múltiplo del tamaño de pila', 'Cantidad que se queda en el banco'],
    clases: ['formula', 'formula', 'formula', 'formula', 'formula', 'formula', 'formula'],
  },
};

for (const [tipo, esperado] of Object.entries(OTROS)) {
  test(`cada uno de los otros 6 tipos enseña los campos de su captura: ${tipo}`, necesitaComercio, () => {
    const m = maquina();
    const r = m.lua(`(function()
      ${ABRIR}
      O.crear(${q(tipo)}, "Mía")
      abrirOp(${q(tipo)}, "Mía")
      local out = {pestanas = E.pestanas:IsShown(), secciones = secciones(), etiquetas = etiquetas(), clases = clases()}
      -- Cada control es del tipo que dice su clase.
      out.bien = {}
      for _, clave in ipairs(E:pagina().orden) do
        local b = E:bloque(clave)
        local c = b.control
        local ok
        if b.clase == "formula" then ok = c.botonCopiar ~= nil and c.SetTextInsets ~= nil
        elseif b.clase == "numero" or b.clase == "texto" then ok = c.SetTextInsets ~= nil and c.botonCopiar == nil
        elseif b.clase == "sino" then ok = c.si ~= nil and c.no ~= nil
        elseif b.clase == "lista" then ok = c.snfOpciones ~= nil and not c.snfOpciones.varios
        elseif b.clase == "varios" then ok = c.snfOpciones ~= nil and c.snfOpciones.varios == true
        elseif b.clase == "grupos" then ok = c.snfOpciones ~= nil and c.snfOpciones.plano == true end
        out.bien[#out.bien + 1] = ok and true or false
      end
      local primero = E:bloque(E:pagina().orden[1])
      out.valor1 = primero.clase == "formula" and primero.control:GetText() or nil
      return out
    end)()`);
    assert.equal(r.pestanas, false, 'solo Subasta lleva pestañas');
    assert.deepEqual(r.secciones, [...esperado.secciones, 'Opciones de manejo', 'Administrar grupo']);
    assert.deepEqual(r.etiquetas, [...esperado.etiquetas, ...MANEJO]);
    assert.deepEqual(r.clases, [...esperado.clases, 'varios', 'varios', 'grupos']);
    assert.ok(r.bien.every((b) => b), `controles: ${JSON.stringify(r.bien)}`);
    if (tipo === 'sniper') assert.match(r.valor1, /^max\(vendorsell, ifgt\(snfregional\(\), 250000g/, 'la fórmula larga, en una línea');
    sinErrores(m);
  });
}

test('una fórmula con fuente desconocida sale en rojo con su mensaje', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("sniper", "Mía")
    abrirOp("sniper", "Mía")
    local c = E:bloque("precioMaximo").control
    local borde = function() return {c.snfTema.borde[1]:GetVertexColor()} end
    local out = {antes = {error = c.snfError or false, borde = borde()}}
    c:SetFocus()
    c:SetText("fuentequenoexiste * 2")
    out.error = c.snfError
    out.borde = borde()
    out.tooltip = BANCO.lineasTooltip()
    c:GetScript("OnEnterPressed")(c)
    out.guardado = O.valor("sniper", "Mía", "precioMaximo")
    -- Una fórmula buena se guarda y el borde vuelve a su color.
    c:SetText("snfmercado * 0.5")
    c:GetScript("OnEnterPressed")(c)
    out.bueno = {O.valor("sniper", "Mía", "precioMaximo"), c.snfError or false, borde()}
    -- Lo guardado que deja de valer (se borra la fuente propia que usaba) sale en rojo al abrir.
    SnetForeverCuenta.comercio.v2.fuentes = {mifuente = "snfmercado"}
    O.poner("sniper", "Mía", "precioMaximo", "mifuente * 2")
    SnetForeverCuenta.comercio.v2.fuentes = {}
    abrirOp("sniper", "Mía")
    out.roto = {c:GetText(), c.snfError}
    return out
  end)()`);
  assert.equal(r.antes.error, false);
  assert.equal(aHex(r.antes.borde), '775744', 'sin error, el borde normal');
  assert.match(r.error, /fuentequenoexiste no existe/);
  assert.equal(aHex(r.borde), 'e5534b', 'el borde en rojo');
  assert.ok(r.tooltip.some((l) => /fuentequenoexiste no existe/.test(l)), `el mensaje sale en el tooltip: ${JSON.stringify(r.tooltip)}`);
  assert.match(r.guardado, /^max\(vendorsell/, 'lo que no vale no se guarda');
  assert.equal(r.bueno[0], 'snfmercado * 0.5');
  assert.equal(r.bueno[1], false);
  assert.equal(aHex(r.bueno[2]), '775744');
  assert.equal(r.roto[0], 'mifuente * 2');
  assert.match(r.roto[1], /mifuente no existe/);
  sinErrores(m);
});

test('en Correo, con Set max quantity en No, los campos que dependen se apagan', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("correo", "Envío")
    abrirOp("correo", "Envío")
    local function estado()
      local t = {}
      for _, clave in ipairs({"conservar", "cantidadMaxima", "reponerDestino", "fuentesReponer"}) do
        local b = E:bloque(clave)
        t[clave] = {b.control.snfApagado, {b.etiqueta.texto:GetTextColor()}}
      end
      return t
    end
    local out = {no = estado()}
    -- «Sí» en «Poner una cantidad máxima» enciende los dos que dependen de él; las fuentes siguen apagadas (dependen de reponer).
    E:bloque("limitarCantidad").control.si:Click("LeftButton")
    out.si = estado()
    out.guardado = O.valor("correo", "Envío", "limitarCantidad")
    E:bloque("reponerDestino").control.si:Click("LeftButton")
    out.reponer = estado()
    -- Volver a «No» en el primero apaga también las fuentes (aunque reponer siga en «Sí»).
    E:bloque("limitarCantidad").control.no:Click("LeftButton")
    out.otraVez = estado()
    -- Un campo apagado no se edita.
    local c = E:bloque("cantidadMaxima").control
    out.editable = c:IsEnabled()
    return out
  end)()`);
  const gris = 'a99b8e';
  const claro = 'cbbeb1';
  assert.equal(r.no.conservar[0], false);
  assert.equal(aHex(r.no.conservar[1]), claro);
  for (const k of ['cantidadMaxima', 'reponerDestino', 'fuentesReponer']) {
    assert.equal(r.no[k][0], true, `${k} apagado`);
    assert.equal(aHex(r.no[k][1]), gris, `la etiqueta de ${k} en gris`);
  }
  assert.equal(r.guardado, true);
  assert.equal(r.si.cantidadMaxima[0], false);
  assert.equal(r.si.reponerDestino[0], false);
  assert.equal(aHex(r.si.reponerDestino[1]), claro);
  assert.equal(r.si.fuentesReponer[0], true, 'depende de «Reponer», que sigue en No');
  assert.equal(r.reponer.fuentesReponer[0], false);
  for (const k of ['cantidadMaxima', 'reponerDestino', 'fuentesReponer']) assert.equal(r.otraVez[k][0], true, `${k} otra vez apagado`);
  assert.equal(r.editable, false);
  sinErrores(m);
});

test('vincular un campo enseña el valor de la otra operación y no deja editar', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("compras", "A"); O.crear("compras", "B"); O.crear("compras", "C")
    O.poner("compras", "B", "precioMaximo", "snfmercado * 2")
    O.poner("compras", "A", "precioMaximo", "100g")
    abrirOp("compras", "A")
    local b = E:bloque("precioMaximo")
    local out = {antes = {b.control:GetText(), b.control.snfApagado}}
    b.etiqueta.botonVinculo:Click("LeftButton")
    local lista = SnetForeverDesplegableLista
    local opciones = {}
    for _, f in ipairs(lista.filas) do if f:IsShown() then opciones[#opciones + 1] = f.texto:GetText() end end
    out.opciones = opciones
    out.abierta = lista:IsShown()
    -- Elige «B».
    for _, f in ipairs(lista.filas) do if f:IsShown() and f.valor == "B" then f:Click("LeftButton") end end
    out.vinculado = {O.vinculo("compras", "A", "precioMaximo"), b.control:GetText(), b.control.snfApagado, b.control:IsEnabled(),
      {b.etiqueta.iconoVinculo:GetVertexColor()}}
    -- Escribir no cambia nada (el campo está apagado y Operaciones.poner lo rechaza).
    b.control:SetText("1g")
    b.control:GetScript("OnEnterPressed")(b.control)
    out.tras = {O.valor("compras", "A", "precioMaximo"), O.valor("compras", "B", "precioMaximo")}
    -- El tooltip del 🔗 dice con quién está vinculado.
    b.etiqueta.botonVinculo:GetScript("OnEnter")(b.etiqueta.botonVinculo)
    out.tooltip = BANCO.lineasTooltip()
    b.etiqueta.botonVinculo:GetScript("OnLeave")(b.etiqueta.botonVinculo)
    out.colorTrasSalir = {b.etiqueta.iconoVinculo:GetVertexColor()}
    -- Un ciclo no se deja: en B, vincular el mismo campo con A avisa y no se guarda.
    abrirOp("compras", "B")
    local bb = E:bloque("precioMaximo")
    bb.etiqueta.botonVinculo:Click("LeftButton")
    for _, f in ipairs(lista.filas) do if f:IsShown() and f.valor == "A" then f:Click("LeftButton") end end
    out.ciclo = {O.vinculo("compras", "B", "precioMaximo") or false, bb.control.snfApagado}
    -- Quitar el vínculo («Sin vínculo») devuelve el valor propio y deja editar.
    abrirOp("compras", "A")
    b = E:bloque("precioMaximo")
    b.etiqueta.botonVinculo:Click("LeftButton")
    for _, f in ipairs(lista.filas) do if f:IsShown() and f.valor == "" then f:Click("LeftButton") end end
    out.sinVinculo = {O.vinculo("compras", "A", "precioMaximo") or false, b.control:GetText(), b.control.snfApagado}
    return out
  end)()`);
  assert.deepEqual(r.antes, ['100g', false]);
  assert.equal(r.abierta, true);
  assert.deepEqual(r.opciones, ['Sin vínculo (valor propio)', 'B', 'C'], 'las operaciones del mismo tipo menos ella');
  assert.equal(r.vinculado[0], 'B');
  assert.equal(r.vinculado[1], 'snfmercado * 2', 'enseña el valor de la otra');
  assert.equal(r.vinculado[2], true);
  assert.equal(r.vinculado[3], false, 'no deja escribir');
  assert.equal(aHex(r.vinculado[4]), 'e6ac72', 'el enlace usa cobre');
  assert.deepEqual(r.tras, ['snfmercado * 2', 'snfmercado * 2']);
  assert.ok(r.tooltip.some((l) => /Vinculado con «B»/.test(l)), JSON.stringify(r.tooltip));
  assert.equal(aHex(r.colorTrasSalir), 'e6ac72', 'el enlace conserva el acento al quitar el ratón');
  assert.deepEqual(r.ciclo, [false, false], 'el ciclo no se guarda');
  const avisos = impresos(m);
  assert.ok(avisos.some((t) => /no se puede vincular con «A»/.test(t)), `avisa: ${JSON.stringify(avisos)}`);
  assert.deepEqual(r.sinVinculo, [false, '100g', false]);
  sinErrores(m);
});

// Task 33: el menú del 🔗 como el de TSM («Link to Another Operation»): título arriba, borde dorado y la ventana oscurecida.
const MENU_VINCULO = `
    O.crear("compras", "A"); O.crear("compras", "B"); O.crear("compras", "C")
    abrirOp("compras", "A")
    local lista, sombra -- se crean al abrir el primer desplegable
    local function rect(r)
      local s = r:GetEffectiveScale() / UIParent:GetEffectiveScale()
      return {r:GetLeft() * s, r:GetBottom() * s, r:GetRight() * s, r:GetTop() * s}
    end
    -- La ventana principal, por su nombre (ui/principal.lua): el oscurecido tiene que cubrirla justa.
    local ventana = _G.SnetForeverPrincipal
    local function menu()
      E:bloque("precioMaximo").etiqueta.botonVinculo:Click("LeftButton")
      lista, sombra = SnetForeverDesplegableLista, SnetForeverDesplegableSombra
      local opciones = {}
      for _, f in ipairs(lista.filas) do if f:IsShown() then opciones[#opciones + 1] = f.texto:GetText() end end
      local out = {abierta = lista:IsShown(), titulo = lista.titulo:IsShown() and lista.titulo:GetText(),
        borde = {lista.snfTema.borde[1]:GetVertexColor()}, opciones = opciones,
        sombra = {sombra:IsVisible(), rect(sombra), rect(ventana), {sombra:GetVertexColor()}}}
      lista:Hide()
      return out
    end
`;

const comprobarMenu = (r, titulo, sinVinculo) => {
  assert.equal(r.abierta, true);
  assert.equal(r.titulo, titulo, 'el título arriba de la lista');
  assert.equal(aHex(r.borde), 'e6ac72', 'borde dorado («acento»)');
  assert.deepEqual(r.opciones, [sinVinculo, 'B', 'C'], 'sin vínculo y las demás operaciones del tipo');
  assert.equal(r.sombra[0], true, 'la ventana se oscurece');
  assert.deepEqual(r.sombra[1], r.sombra[2], 'el oscurecido cubre la ventana principal');
  assert.deepEqual(r.sombra[3], [0, 0, 0, 0.8]);
};

test('el 🔗 abre «Enlazar con otra operación» con borde dorado, «Sin vínculo (valor propio)» y las demás operaciones del tipo', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    ${MENU_VINCULO}
    local out = {menu = menu()}
    -- Otro desplegable del editor (una lista) vuelve a lo de serie: sin título y borde gris.
    O.crear("subasta", "Alta")
    abrirOp("subasta", "Alta")
    E.pestanas.pestanas[2]:Click("LeftButton")
    local duracion = E:bloque("duracion")
    duracion.control:Click("LeftButton")
    out.otro = {lista:IsShown(), lista.titulo:IsShown(), {lista.snfTema.borde[1]:GetVertexColor()},
      SnetForever.Tema.hex("apagado")}
    lista:Hide()
    return out
  end)()`);
  comprobarMenu(r.menu, 'Enlazar con otra operación', 'Sin vínculo (valor propio)');
  assert.deepEqual([r.otro[0], r.otro[1]], [true, false], 'otro desplegable no lleva título');
  assert.equal(aHex(r.otro[2]), r.otro[3], 'ni borde dorado: el gris «apagado» del tema');
  sinErrores(m);
});

test('en inglés el 🔗 abre «Link to another operation» y el título cambia con el idioma', necesitaComercio, () => {
  const m = maquina({ jugador: { ...JUGADOR, idioma: 'enUS' } });
  const r = m.lua(`(function()
    ${ABRIR}
    ${MENU_VINCULO}
    local en = menu()
    SnetForever.Ajustes.set("idioma", "es")
    return {en = en, es = menu()}
  end)()`);
  comprobarMenu(r.en, 'Link to another operation', 'No link (own value)');
  comprobarMenu(r.es, 'Enlazar con otra operación', 'Sin vínculo (valor propio)');
  sinErrores(m);
});

test('Renombrar, Restablecer, aplicar a un grupo y quitar de un grupo', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    local A = SnetForever.Arbol
    A.crear("", "Telas"); A.crear("Telas", "Seda")
    O.crear("vendedor", "Basura"); O.crear("vendedor", "Otra")
    abrirOp("vendedor", "Basura")
    local out = {}
    -- Renombrar: el nombre pasa a ser un campo; Intro con un nombre que ya existe o que parece un comando no renombra.
    E.enlaceRenombrar:Click("LeftButton")
    local c = E.campoNombre
    out.campo = {c:IsShown(), c:GetText(), E.textoNombre:IsShown()}
    c:SetText("Otra")
    c:GetScript("OnEnterPressed")(c)
    out.repetido = {c.snfError, O.existe("vendedor", "Basura")}
    c:SetText("/run algo")
    c:GetScript("OnEnterPressed")(c)
    out.comando = {c.snfError, O.existe("vendedor", "Basura")}
    c:SetText("Chatarra")
    c:GetScript("OnEnterPressed")(c)
    out.renombrada = {O.lista("vendedor"), E.textoNombre:GetText(), E.textoNombre:IsShown(), c:IsShown(), {P.elegida()},
      P.arbol:elegida()}
    -- Restablecer: valores por defecto y sin vínculos; lo de ignorar se queda. El tooltip lo dice.
    O.poner("vendedor", "Chatarra", "caducadasMinimas", "5")
    O.vincular("vendedor", "Chatarra", "valorMercado", "Otra")
    local propios = O.propios()
    O.poner("vendedor", "Chatarra", "ignorarPersonajes", {propios.personajes[1]})
    abrirOp("vendedor", "Chatarra")
    out.antesRest = E:bloque("caducadasMinimas").control:GetText()
    E.enlaceRestablecer:GetScript("OnEnter")(E.enlaceRestablecer)
    out.tooltipRest = BANCO.lineasTooltip()
    E.enlaceRestablecer:Click("LeftButton")
    SnetForeverEditorRestablecer.botonRestablecer:Click("LeftButton")
    out.restablecida = {O.valor("vendedor", "Chatarra", "caducadasMinimas"), E:bloque("caducadasMinimas").control:GetText(),
      O.vinculo("vendedor", "Chatarra", "valorMercado") or false, #O.valor("vendedor", "Chatarra", "ignorarPersonajes")}
    -- Aplicar a un grupo: el desplegable lista Grupo Base y los grupos; elegir uno lo aplica y sale en la lista, en el color
    -- de su nivel (Task 35).
    local g = E:bloque("grupos")
    g.control:Click("LeftButton")
    local lista = SnetForeverDesplegableLista
    local opciones = {}
    for _, f in ipairs(lista.filas) do if f:IsShown() then opciones[#opciones + 1] = f.texto:GetText() end end
    out.opcionesGrupo = opciones
    out.cabecera = g.control.texto:GetText()
    for _, f in ipairs(lista.filas) do if f:IsShown() and f.valor == "Telas${S}Seda" then f:Click("LeftButton") end end
    out.aplicada = {(O.deGrupo("Telas${S}Seda", "vendedor")), O.gruposDe("vendedor", "Chatarra")}
    local filas = {}
    for _, f in ipairs(E:pagina().filasGrupo) do
      if f:IsShown() then
        filas[#filas + 1] = {f.texto:GetText(), {f.texto:GetTextColor()}, {f.icono:GetVertexColor()}, f.botonQuitar:IsShown()}
      end
    end
    out.filas = filas
    -- Ya aplicada, no sale en el desplegable.
    g.control:Click("LeftButton")
    local despues = {}
    for _, f in ipairs(lista.filas) do if f:IsShown() then despues[#despues + 1] = f.valor end end
    lista:Hide()
    out.opcionesDespues = despues
    -- Quitar con la ✖.
    E:pagina().filasGrupo[1].botonQuitar:Click("LeftButton")
    out.quitada = {(O.deGrupo("Telas${S}Seda", "vendedor")), O.gruposDe("vendedor", "Chatarra"), E:pagina().filasGrupo[1]:IsShown()}
    return out
  end)()`);
  assert.deepEqual(r.campo, [true, 'Basura', false]);
  assert.match(r.repetido[0], /Ya hay una operación/);
  assert.equal(r.repetido[1], true);
  assert.match(r.comando[0], /comando del chat/);
  assert.equal(r.comando[1], true);
  assert.deepEqual(r.renombrada, [['Chatarra', 'Otra'], 'Chatarra', true, false, ['vendedor', 'Chatarra'], 'o:vendedor:Chatarra']);
  assert.equal(r.antesRest, '5');
  assert.ok(r.tooltipRest.some((l) => /se quedan/.test(l)), JSON.stringify(r.tooltipRest));
  assert.deepEqual(r.restablecida, ['20', '20', false, 1], 'por defecto, sin vínculo y con lo ignorado');
  assert.deepEqual(r.opcionesGrupo, ['Grupo Base', 'Telas', 'Telas › Seda']);
  assert.equal(r.cabecera, 'Agregar operación a grupos');
  assert.deepEqual(r.aplicada, [['Chatarra'], [`Telas${S}Seda`]]);
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0][0], 'Telas › Seda');
  assert.equal(aHex(r.filas[0][1]), 'bdaec6', 'el grupo en el color de su nivel, el 2 (Task 35)');
  assert.equal(aHex(r.filas[0][2]), 'a99b8e', 'y su icono de enlace en gris');
  assert.equal(r.filas[0][3], true, 'con su ✖');
  assert.deepEqual(r.opcionesDespues, ['', 'Telas']);
  assert.deepEqual(r.quitada, [[], [], false]);
  sinErrores(m);
});

test('aplicar a un grupo que hereda copia lo heredado; en un tipo de una sola, la sustituye', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    local A = SnetForever.Arbol
    A.crear("", "Telas")
    O.crear("vendedor", "Base"); O.crear("vendedor", "Nueva")
    O.ponerDeGrupo("", "vendedor", {"Base"})
    O.crear("sniper", "S1"); O.crear("sniper", "S2")
    O.ponerDeGrupo("Telas", "sniper", {"S1"})
    abrirOp("vendedor", "Nueva")
    local g = E:bloque("grupos")
    g.control:Click("LeftButton")
    for _, f in ipairs(SnetForeverDesplegableLista.filas) do if f:IsShown() and f.valor == "Telas" then f:Click("LeftButton") end end
    local nombres, de = O.deGrupo("Telas", "vendedor")
    local out = {vendedor = {nombres, de or false}}
    abrirOp("sniper", "S2")
    g = E:bloque("grupos")
    g.control:Click("LeftButton")
    for _, f in ipairs(SnetForeverDesplegableLista.filas) do if f:IsShown() and f.valor == "Telas" then f:Click("LeftButton") end end
    out.sniper = (O.deGrupo("Telas", "sniper"))
    return out
  end)()`);
  assert.deepEqual(r.vendedor[0], ['Base', 'Nueva']);
  assert.equal(r.vendedor[1], false, 'el grupo ya tiene las suyas');
  assert.deepEqual(r.sniper, ['S2']);
  sinErrores(m);
});

test('Opciones de manejo: reinos y facciones y personajes propios, con desplegables de varios', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("almacen", "Banco")
    abrirOp("almacen", "Banco")
    local reinos, pjs = E:bloque("ignorarReinos").control, E:bloque("ignorarPersonajes").control
    local out = {cabeceras = {reinos.texto:GetText(), pjs.texto:GetText()}}
    reinos:Click("LeftButton")
    local lista = SnetForeverDesplegableLista
    local opciones = {}
    for _, f in ipairs(lista.filas) do if f:IsShown() then opciones[#opciones + 1] = {f.valor, f.texto:GetText()} end end
    out.opciones = opciones
    lista.filas[1]:Click("LeftButton")
    lista:Hide()
    out.guardado = O.valor("almacen", "Banco", "ignorarReinos")
    out.texto = reinos.texto:GetText()
    return out
  end)()`);
  assert.deepEqual(r.cabeceras, ['Ningún reino', 'Ningún personaje']);
  assert.deepEqual(r.opciones, [['Normal|Horde', 'Normal - Horde']], 'la casa del personaje, sin la barra (en el juego «|H» es un enlace)');
  assert.deepEqual(r.guardado, ['Normal|Horde']);
  assert.equal(r.texto, '1 elegido');
  sinErrores(m);
});

test('⧉ llama al gancho del editor de fórmulas (Task 23) con lo que hace falta para guardar', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Alta")
    abrirOp("subasta", "Alta")
    E.pestanas.pestanas[2]:Click("LeftButton")
    local c = E:bloque("precioMaximo").control
    local out = {}
    -- El gancho de serie (Task 23): abre el editor de fórmulas ⧉ con el texto del campo.
    c.botonCopiar:Click("LeftButton")
    local F = SnetForever.EditorFormula.marco()
    out.editor = {F:IsShown(), F.campo:GetText()}
    F.botonCancelar:Click("LeftButton")
    local recibido
    SnetForever.EditorOperacion.alEditarFormula = function(datos) recibido = datos end
    c.botonCopiar:Click("LeftButton")
    out.datos = {recibido.tipo, recibido.nombre, recibido.clave, recibido.texto}
    out.mal = recibido.guardar("noexiste + 1")
    out.bien = recibido.guardar("75g")
    out.guardado = {O.valor("subasta", "Alta", "precioMaximo"), c:GetText()}
    return out
  end)()`);
  assert.deepEqual(r.editor, [true, '50000g']);
  assert.deepEqual(r.datos, ['subasta', 'Alta', 'precioMaximo', '50000g']);
  assert.equal(r.mal, false);
  assert.equal(r.bien, true);
  assert.deepEqual(r.guardado, ['75g', '75g']);
  sinErrores(m);
});

test('cambiar los valores en el editor los guarda: número, lista, varios, texto y sí/no', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Alta"); O.crear("correo", "Env")
    abrirOp("subasta", "Alta")
    E.pestanas.pestanas[2]:Click("LeftButton")
    local out = {}
    local puja = E:bloque("pujaPorcentaje").control
    puja:SetText("150")
    out.pujaMal = {puja.snfError, O.valor("subasta", "Alta", "pujaPorcentaje")}
    puja:GetScript("OnEnterPressed")(puja)
    puja:SetText("80")
    puja:GetScript("OnEnterPressed")(puja)
    out.puja = O.valor("subasta", "Alta", "pujaPorcentaje")
    local dur = E:bloque("duracion").control
    dur:Click("LeftButton")
    for _, f in ipairs(SnetForeverDesplegableLista.filas) do if f:IsShown() and f.valor == "48" then f:Click("LeftButton") end end
    out.duracion = {O.valor("subasta", "Alta", "duracion"), dur.texto:GetText()}
    abrirOp("correo", "Env")
    local d = E:bloque("destinatario").control
    d:SetText("  Mialter  ")
    d:GetScript("OnEnterPressed")(d)
    out.destino = {O.valor("correo", "Env", "destinatario"), d:GetText()}
    E:bloque("limitarCantidad").control.si:Click("LeftButton")
    E:bloque("reponerDestino").control.si:Click("LeftButton")
    local f = E:bloque("fuentesReponer").control
    f:Click("LeftButton")
    for _, fila in ipairs(SnetForeverDesplegableLista.filas) do if fila:IsShown() then fila:Click("LeftButton") end end
    SnetForeverDesplegableLista:Hide()
    out.fuentes = {O.valor("correo", "Env", "fuentesReponer"), f.texto:GetText()}
    return out
  end)()`);
  assert.match(r.pujaMal[0], /de 0 a 100/);
  assert.equal(r.pujaMal[1], 100);
  assert.equal(r.puja, 80);
  assert.deepEqual(r.duracion, ['48', '24 horas'], 'la clave «48» es el 3 de la API: 24 horas en Forever (C2a)');
  assert.deepEqual(r.destino, ['Mialter', 'Mialter']);
  assert.deepEqual(r.fuentes, [['banco', 'hermandad'], '2 elegidos']);
  sinErrores(m);
});

// C2a: en Forever la API de la subasta usa 1 = 2 horas, 2 = 8 horas y 3 = 24 horas, y las claves guardadas son «12», «24» y
// «48» (el nombre antiguo). Por defecto, «24»: 8 horas, como el duration = 2 por defecto de TSM.
test('el editor de Subasta enseña la duración por defecto como «8 horas» y ofrece 2, 8 y 24 horas', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Nueva")
    abrirOp("subasta", "Nueva")
    E.pestanas.pestanas[2]:Click("LeftButton")
    local dur = E:bloque("duracion").control
    local out = {clave = O.valor("subasta", "Nueva", "duracion"), texto = dur.texto:GetText(), opciones = {}}
    for _, o in ipairs(dur.snfOpciones.opciones) do out.opciones[#out.opciones + 1] = {o[1], o[2]} end
    SnetForever.Ajustes.set("idioma", "en")
    out.en = dur.texto:GetText()
    return out
  end)()`);
  assert.equal(r.clave, '24', 'la clave por defecto no cambia');
  assert.equal(r.texto, '8 horas');
  assert.deepEqual(r.opciones, [['12', '2 horas'], ['24', '8 horas'], ['48', '24 horas']]);
  assert.equal(r.en, '8 hours');
  sinErrores(m);
});

test('pulsar el nombre del tipo vuelve al resumen; borrar la operación abierta también', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("compras", "Mía")
    abrirOp("compras", "Mía")
    local out = {editor = {E:IsShown(), P.resumen:IsShown()}}
    fila("t:compras"):Click("LeftButton")
    out.tipo = {E:IsShown(), P.resumen:IsShown(), P.titulo:GetText()}
    abrirOp("compras", "Mía")
    fila("o:compras:Mía").botones[2]:Click("LeftButton")
    out.borrada = {E:IsShown(), P.resumen:IsShown(), O.existe("compras", "Mía")}
    return out
  end)()`);
  assert.deepEqual(r.editor, [true, false]);
  assert.deepEqual(r.tipo, [false, true, '|cffe6ac721|r Operaciones de Compras']);
  assert.deepEqual(r.borrada, [false, true, false]);
  sinErrores(m);
});

test('los textos del editor salen en inglés y se repintan al cambiar de idioma', necesitaComercio, () => {
  const m = maquina({ jugador: { ...JUGADOR, idioma: 'enUS' } });
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Alta")
    abrirOp("subasta", "Alta")
    local out = {pestanas = {}, renombrar = E.enlaceRenombrar.texto:GetText(), restablecer = E.enlaceRestablecer.texto:GetText()}
    for _, b in ipairs(E.pestanas.pestanas) do out.pestanas[#out.pestanas + 1] = b.texto:GetText() end
    out.detalles = {secciones(), etiquetas(), E:bloque("ignorarDuracion").control.texto:GetText()}
    E.pestanas.pestanas[3]:Click("LeftButton")
    out.radio = {E:bloque("cancelarRebajadas").control.si.texto:GetText(), E:bloque("cancelarRebajadas").control.no.texto:GetText()}
    SnetForever.Ajustes.set("idioma", "es")
    out.es = {E.enlaceRenombrar.texto:GetText(), E.pestanas.pestanas[3].texto:GetText(), secciones()[1], etiquetas()[1],
      E:bloque("cancelarRebajadas").control.si.texto:GetText()}
    return out
  end)()`);
  assert.deepEqual(r.pestanas, ['Details', 'Posting', 'Canceling']);
  assert.equal(r.renombrar, 'Rename');
  assert.equal(r.restablecer, 'Reset');
  assert.deepEqual(r.detalles[0], ['General options', 'Handling options', 'Manage groups']);
  assert.deepEqual(r.detalles[1], ['Ignore auctions by duration', 'Ignore the operation on these realms and factions',
    'Ignore the operation on these characters', 'Apply operation to group']);
  assert.equal(r.detalles[2], 'None');
  assert.deepEqual(r.radio, ['Yes', 'No']);
  assert.deepEqual(r.es, ['Renombrar', 'Cancelación', 'Opciones de cancelación', 'Cancelar las subastas rebajadas', 'Sí']);
  sinErrores(m);
});

test('cada campo, sección y opción de Operaciones.TIPOS tiene su texto en es y en', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    local L, O = SnetForever.L, SnetForever.Operaciones
    local faltan = {}
    local function mira(clave) if not L.tablas.es[clave] or not L.tablas.en[clave] then faltan[#faltan + 1] = clave end end
    for _, k in ipairs(SnetForever.EditorOperacion.clavesDeTexto()) do mira(k) end
    return {faltan = faltan, n = #SnetForever.EditorOperacion.clavesDeTexto()}
  end)()`);
  assert.deepEqual(r.faltan, []);
  assert.ok(r.n > 150, `hay ${r.n} claves`);
  sinErrores(m);
});

// Task 34: la explicación de cada campo sale al pasar el ratón por la caja (antes solo por la etiqueta pequeña de encima,
// y el jugador no la encontró). Como en TSM (tsm-tooltip-campo-puja.webp): a la derecha de la fila del campo, que llega al
// borde derecho de la zona (con la ayuda «Un valor de 0 a 100» dentro), y arriba a la altura de la caja.
// pasar(b) pasa el ratón por la caja del bloque (en un sí/no, por el «Sí» y por el «No») y da las líneas de cada tooltip.
const PASAR = `
  local L = SnetForever.L
  local function pasar(b)
    local cajas = b.clase == "sino" and {b.control.si, b.control.no} or {b.control}
    local vistos = {}
    for _, caja in ipairs(cajas) do
      caja:GetScript("OnEnter")(caja)
      vistos[#vistos + 1] = {lineas = BANCO.lineasTooltip(), visto = GameTooltip:IsShown(), dueno = GameTooltip:GetOwner() == caja}
      caja:GetScript("OnLeave")(caja)
      vistos[#vistos].trasSalir = GameTooltip:IsShown()
    end
    return vistos
  end`;

test('en los 7 tipos, pasar el ratón por la caja de cada campo enseña su nombre y su explicación', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    ${PASAR}
    local malos, n = {}, 0
    for _, tipo in ipairs(O.ORDEN) do
      O.crear(tipo, "Prueba")
      abrirOp(tipo, "Prueba")
      for p = 1, tipo == "subasta" and 3 or 1 do
        if tipo == "subasta" then E.pestanas.pestanas[p]:Click("LeftButton") end
        local pag = E:pagina()
        for _, clave in ipairs(pag.orden) do
          local b = pag.bloques[clave]
          for _, v in ipairs(pasar(b)) do
            n = n + 1
            local bien = v.visto and v.dueno and not v.trasSalir and v.lineas[1] == L.t(b.claveTexto)
              and v.lineas[2] == L.t(b.claveTexto .. "_A")
            if not bien then
              malos[#malos + 1] = tipo .. "." .. clave .. ": " .. table.concat(v.lineas, " | ")
            end
          end
        end
      end
    end
    return {malos = malos, n = n}
  end)()`);
  assert.deepEqual(r.malos, []);
  assert.ok(r.n > 60, `se han mirado ${r.n} cajas`);
  sinErrores(m);
});

test('la puja explica para qué sirve y su rango sale en el tooltip', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    ${PASAR}
    O.crear("subasta", "Alta")
    abrirOp("subasta", "Alta")
    E.pestanas.pestanas[2]:Click("LeftButton")
    local pag = E:pagina()
    local b = E:bloque("pujaPorcentaje")
    -- El banco no coloca el contenido de una zona con desplazamiento: se ancla a la zona para poder medir.
    pag.contenido:ClearAllPoints()
    pag.contenido:SetPoint("TOPLEFT", pag.zona, "TOPLEFT", 0, 0)
    -- La ventana tiene su escala y el GameTooltip la suya: se mide en unidades de la pantalla.
    local function abs(marco, borde) return marco[borde](marco) * marco:GetEffectiveScale() end
    local c = b.control
    c:GetScript("OnEnter")(c)
    local out = {lineas = BANCO.lineasTooltip(), izquierda = abs(GameTooltip, "GetLeft") - abs(pag.contenido, "GetRight"),
      arriba = abs(GameTooltip, "GetTop") - abs(c, "GetTop"), aLaDerecha = abs(GameTooltip, "GetLeft") >= abs(b.ayuda, "GetRight")}
    c:GetScript("OnLeave")(c)
    -- Un desplegable y un sí/no también salen a la derecha de su fila.
    for _, clave in ipairs({"bajoMinimo"}) do
      local d = E:bloque(clave).control
      d:GetScript("OnEnter")(d)
      out.lista = {abs(GameTooltip, "GetLeft") - abs(pag.contenido, "GetRight"), abs(GameTooltip, "GetTop") - abs(d, "GetTop")}
      d:GetScript("OnLeave")(d)
    end
    E.pestanas.pestanas[3]:Click("LeftButton")
    pag = E:pagina()
    pag.contenido:ClearAllPoints()
    pag.contenido:SetPoint("TOPLEFT", pag.zona, "TOPLEFT", 0, 0)
    local rd = E:bloque("cancelarRebajadas").control
    rd.no:GetScript("OnEnter")(rd.no)
    out.radio = {abs(GameTooltip, "GetLeft") - abs(pag.contenido, "GetRight"), abs(GameTooltip, "GetTop") - abs(rd, "GetTop")}
    rd.no:GetScript("OnLeave")(rd.no)
    return out
  end)()`);
  assert.deepEqual(r.lineas, ['Puja como porcentaje de la compra directa',
    'Al publicar, la puja se calcula como este porcentaje del precio de compra directa.', 'Un valor de 0 a 100 %']);
  assert.ok(Math.abs(r.izquierda) < 0.01, `pegado al borde derecho de la fila: ${r.izquierda}`);
  assert.ok(Math.abs(r.arriba) < 0.01, `arriba a la altura de la caja: ${r.arriba}`);
  assert.equal(r.aLaDerecha, true, 'a la derecha de «Un valor de 0 a 100 %»');
  assert.ok(Math.abs(r.lista[0]) < 0.01 && Math.abs(r.lista[1]) < 0.01, `desplegable: ${JSON.stringify(r.lista)}`);
  assert.ok(Math.abs(r.radio[0]) < 0.01 && Math.abs(r.radio[1]) < 0.01, `sí/no: ${JSON.stringify(r.radio)}`);
  sinErrores(m);
});

test('un campo vinculado dice en su ayuda de qué operación toma el valor', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    ${PASAR}
    O.crear("vendedor", "A"); O.crear("vendedor", "B")
    O.vincular("vendedor", "A", "conservar", "B")
    O.vincular("vendedor", "A", "venderActivo", "B")
    abrirOp("vendedor", "A")
    return {formula = pasar(E:bloque("conservar"))[1].lineas, radio = pasar(E:bloque("venderActivo"))[2].lineas,
      libre = pasar(E:bloque("caducadasMinimas"))[1].lineas, vinculado = L.t("PRINCIPAL_EDITOR_VINCULADO", "B"),
      apagado = E:bloque("conservar").control.snfApagado}
  end)()`);
  assert.equal(r.apagado, true);
  assert.equal(r.formula.at(-1), r.vinculado, `la fórmula vinculada: ${JSON.stringify(r.formula)}`);
  assert.match(r.vinculado, /«B»/);
  assert.equal(r.radio.at(-1), r.vinculado, `el sí/no vinculado: ${JSON.stringify(r.radio)}`);
  assert.ok(!r.libre.includes(r.vinculado), 'uno sin vínculo no lo dice');
  sinErrores(m);
});

// Las explicaciones que solo daban el rango («Un número de 0 a 100.») o que no decían para qué sirve el campo se han
// reescrito. Se miran todas las de los campos de los 7 tipos, las de «Opciones de manejo» y la de «Aplicar operación a
// grupo», en es y en. Las de la duración entran también (el otro agente ya cambió los nombres de las duraciones).
test('ninguna explicación de campo es solo un rango ni una frase de menos de 30 letras', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    local L, O = SnetForever.L, SnetForever.Operaciones
    local claves = {"PRINCIPAL_EDITOR_IGNORAR_REINOS_A", "PRINCIPAL_EDITOR_IGNORAR_PERSONAJES_A", "PRINCIPAL_EDITOR_APLICAR_A"}
    for _, tipo in ipairs(O.ORDEN) do
      for _, c in ipairs(O.TIPOS[tipo].campos) do
        claves[#claves + 1] = "PRINCIPAL_EDITOR_C_" .. string.upper(tipo) .. "_" .. string.upper(c.clave) .. "_A"
      end
    end
    local out = {}
    for _, idioma in ipairs({"es", "en"}) do
      for _, k in ipairs(claves) do out[#out + 1] = {idioma, k, L.tablas[idioma][k] or ""} end
    end
    return out
  end)()`);
  const malos = [];
  for (const [idioma, clave, texto] of r) {
    const letras = (texto.match(/\p{L}/gu) || []).length;
    const soloRango = /^\s*(un número|un valor|a number|a value)\s+(de|from)\s+-?\d+\s+(a|to)\s+-?\d+\.?\s*$/i.test(texto);
    const soloApagar = /^\s*(poner|setting)\s+0c\b/i.test(texto);
    if (letras < 30 || soloRango || soloApagar) malos.push(`${idioma} ${clave} (${letras}): ${texto}`);
  }
  assert.deepEqual(malos, []);
  assert.ok(r.length > 100, `${r.length} explicaciones`);
  sinErrores(m);
});

// El banco no tiene motor de texto: solo aproxima el ancho de la letra. Por eso el margen de 0,85.
for (const [idioma, cliente] of [['es', 'esES'], ['en', 'enUS']]) {
  test(`todo cabe en el ancho de la página en es y en (margen 0,85): ${idioma}`, necesitaComercio, () => {
    for (const ancho of [2560, 1000]) {
      const m = maquina({ jugador: { ...JUGADOR, idioma: cliente } });
      const r = m.lua(`(function()
        ${ancho === 1000 ? 'SnetForever.Principal.abrir("operaciones"); SnetForever.Principal.marco():SetSize(1000, 600)' : ''}
        ${ABRIR}
        local malos = {}
        local function cabe(nombre, fs, disponible)
          local w = fs:GetUnboundedStringWidth()
          if w > disponible * 0.85 then malos[#malos + 1] = nombre .. ": " .. math.floor(w) .. "/" .. math.floor(disponible) end
        end
        for _, tipo in ipairs(O.ORDEN) do
          O.crear(tipo, "Una operación con un nombre largo")
          abrirOp(tipo, "Una operación con un nombre largo")
          local libre = E.enlaceRenombrar.icono:GetLeft() - E.textoNombre:GetLeft()
          cabe(tipo .. " nombre", E.textoNombre, libre)
          local npes = tipo == "subasta" and 3 or 1
          for p = 1, npes do
            if tipo == "subasta" then
              E.pestanas.pestanas[p]:Click("LeftButton")
              cabe("pestaña " .. p, E.pestanas.pestanas[p].texto, E.pestanas.pestanas[p]:GetWidth() - 8)
            end
            local pag = E:pagina()
            for _, s in ipairs(pag.secciones) do cabe(tipo .. " sección", s.titulo, pag.contenido:GetWidth()) end
            for _, clave in ipairs(pag.orden) do
              local b = pag.bloques[clave]
              local w = b.etiqueta:GetWidth()
              if w > pag.contenido:GetWidth() * 0.85 then malos[#malos + 1] = tipo .. " " .. clave .. " etiqueta" end
              if b.ayuda then cabe(tipo .. " " .. clave .. " ayuda", b.ayuda, derecha(b) - 10) end
              if b.control.texto and b.control.snfOpciones then
                -- La lista abierta de un desplegable simple: cada opción cabe en la caja.
                for _, o in ipairs(b.control.snfOpciones.opciones) do
                  local fs = b.control.texto
                  local antes = fs:GetText()
                  fs:SetText(o[2])
                  cabe(tipo .. " " .. clave .. " opción " .. tostring(o[1]), fs, ancho(b) - 28)
                  fs:SetText(antes)
                end
              end
            end
          end
        end
        return {malos = malos, ancho = P.derecha:GetWidth()}
      end)()`);
      assert.deepEqual(r.malos, [], `${idioma} con la ventana a ${ancho}: ${JSON.stringify(r.malos)} (derecha ${r.ancho})`);
      sinErrores(m);
    }
  });
}

// Ronda 1, punto 3 (decisión del coordinador): Restablecer pregunta antes con un cuadro fijo; solo [Restablecer] restablece.
for (const [idioma, cliente, pregunta] of [
  ['es', 'esES', /^¿Restablecer «Basura» a sus valores por defecto\? No se puede deshacer/],
  ['en', 'enUS', /^Reset "Basura" to its default values\? This cannot be undone/],
]) {
  test(`Restablecer pregunta antes: Cancelar y Escape no tocan nada; [Restablecer] restablece (${idioma})`, necesitaComercio, () => {
    const m = maquina({ jugador: { ...JUGADOR, idioma: cliente } });
    const r = m.lua(`(function()
      ${ABRIR}
      O.crear("vendedor", "Basura"); O.crear("vendedor", "Otra")
      O.poner("vendedor", "Basura", "caducadasMinimas", "5")
      O.vincular("vendedor", "Basura", "valorMercado", "Otra")
      local propios = O.propios()
      O.poner("vendedor", "Basura", "ignorarPersonajes", {propios.personajes[1]})
      abrirOp("vendedor", "Basura")
      local function estado()
        return {O.valor("vendedor", "Basura", "caducadasMinimas"), O.vinculo("vendedor", "Basura", "valorMercado") or false,
          #O.valor("vendedor", "Basura", "ignorarPersonajes")}
      end
      local out = {}
      E.enlaceRestablecer:Click("LeftButton")
      local c = SnetForeverEditorRestablecer
      out.abierto = {c:IsShown(), c.texto:GetText(), c.botonRestablecer.texto:GetText(), c.botonCancelar.texto:GetText()}
      out.alAbrir = estado()
      c.botonCancelar:Click("LeftButton")
      out.cancelar = {c:IsShown(), estado()}
      E.enlaceRestablecer:Click("LeftButton")
      BANCO.pulsarTecla("ESCAPE")
      out.escape = {c:IsShown(), estado()}
      SnetForever.Principal.abrir("operaciones")
      abrirOp("vendedor", "Basura")
      E.enlaceRestablecer:Click("LeftButton")
      c.botonRestablecer:Click("LeftButton")
      out.restablecido = {c:IsShown(), estado(), E:bloque("caducadasMinimas").control:GetText()}
      return out
    end)()`);
    assert.equal(r.abierto[0], true, 'pulsar Restablecer abre el cuadro');
    assert.match(r.abierto[1], pregunta);
    assert.deepEqual(r.abierto.slice(2), idioma === 'es' ? ['Restablecer', 'Cancelar'] : ['Reset', 'Cancel']);
    assert.deepEqual(r.alAbrir, ['5', 'Otra', 1], 'abrir el cuadro no cambia nada');
    assert.deepEqual(r.cancelar, [false, ['5', 'Otra', 1]]);
    assert.deepEqual(r.escape, [false, ['5', 'Otra', 1]]);
    assert.deepEqual(r.restablecido, [false, ['20', false, 1], '20'], 'restablece y deja lo ignorado');
    sinErrores(m);
  });
}

// Ronda 1, punto 1: el mensaje de una fórmula mal escrita sale en el idioma del cliente.
test('con el cliente en inglés el mensaje de una fórmula mal escrita sale en inglés', necesitaComercio, () => {
  const m = maquina({ jugador: { ...JUGADOR, idioma: 'enUS' } });
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("sniper", "Mine")
    abrirOp("sniper", "Mine")
    local c = E:bloque("precioMaximo").control
    c:SetFocus()
    c:SetText("unknownsource * 2")
    return {error = c.snfError, tooltip = BANCO.lineasTooltip()}
  end)()`);
  assert.equal(r.error, 'the source unknownsource does not exist in SnetForever');
  assert.ok(r.tooltip.includes('the source unknownsource does not exist in SnetForever'), JSON.stringify(r.tooltip));
  sinErrores(m);
});

// Task 32: op-01 pone dos flechas cruzadas (⇄) delante del nombre de la operación; antes iba el engranaje «operacion».
test('la cabecera del editor lleva el icono intercambio (⇄)', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Alta")
    abrirOp("subasta", "Alta")
    local probe = UIParent:CreateTexture()
    local function de(n) SnetForever.Tema.icono(probe, n); return {probe:GetTexCoord()} end
    return {icono = {E.icono:GetTexCoord()}, intercambio = de("intercambio"), operacion = de("operacion"),
      visto = E.icono:IsShown(), textura = E.icono:GetTexture()}
  end)()`);
  assert.deepEqual(r.icono, r.intercambio);
  assert.notDeepEqual(r.icono, r.operacion);
  assert.equal(r.visto, true);
  assert.equal(r.textura, 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\iconos');
  sinErrores(m);
});

// Task 35 (punto 4): en op-01, del borde de abajo de la última caja de una sección al título de la siguiente hay unos 26 px
// (de 267 a 294 y de 437 a 463). Nosotros dejábamos 15. Se mide en el marco: GetBottom del control y GetTop del título.
const MEDIR_SECCIONES = `
  -- Los huecos de la página que se ve: {sección, px del borde de abajo del último control al título}.
  local function huecos()
    local pag = E:pagina()
    -- El banco no coloca el contenido de una zona con desplazamiento: se ancla a la zona para poder medir.
    pag.contenido:ClearAllPoints()
    pag.contenido:SetPoint("TOPLEFT", pag.zona, "TOPLEFT", 0, 0)
    local t, ultimo = {}, nil
    for _, parte in ipairs(pag.partes) do
      if parte.seccion then
        if ultimo then t[#t + 1] = {parte.marco.titulo:GetText(), ultimo:GetBottom() - parte.marco.titulo:GetTop()} end
      else
        ultimo = parte.bloque.control
      end
    end
    return t
  end`;

test('entre el último control de una sección y el título de la siguiente quedan 26 px (op-01), en Detalles de Subasta y en Correo', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    ${MEDIR_SECCIONES}
    O.crear("subasta", "Alta"); O.crear("correo", "Env")
    abrirOp("subasta", "Alta")
    E.pestanas.pestanas[1]:Click("LeftButton")
    local out = {detalles = huecos()}
    abrirOp("correo", "Env")
    out.correo = huecos()
    return out
  end)()`);
  assert.deepEqual(r.detalles.map((h) => h[0]), ['Opciones de manejo', 'Administrar grupo']);
  assert.deepEqual(r.correo.map((h) => h[0]), ['Opciones de manejo', 'Administrar grupo']);
  for (const [donde, lista] of [['Detalles', r.detalles], ['Correo', r.correo]]) {
    for (const [titulo, px] of lista) assert.ok(Math.abs(px - 26) <= 2, `${donde}, antes de «${titulo}»: ${px} px`);
  }
  sinErrores(m);
});

test('el aire de 26 px entre secciones vale en todos los tipos y pestañas, también tras un sí/no', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    ${MEDIR_SECCIONES}
    local out = {}
    for _, tipo in ipairs(O.ORDEN) do
      O.crear(tipo, "Prueba")
      abrirOp(tipo, "Prueba")
      for p = 1, tipo == "subasta" and 3 or 1 do
        if tipo == "subasta" then E.pestanas.pestanas[p]:Click("LeftButton") end
        for _, h in ipairs(huecos()) do out[#out + 1] = {tipo .. " " .. p .. " " .. h[1], h[2]} end
      end
    end
    return out
  end)()`);
  assert.ok(r.length >= 16, `${r.length} huecos medidos`);
  const malos = r.filter(([, px]) => Math.abs(px - 26) > 2);
  assert.deepEqual(malos, []);
  sinErrores(m);
});

// Task 35 (punto 5): como en op-01, cada grupo aplicado sale en el color de su nivel y lleva detrás un icono de enlace gris.
test('los grupos aplicados salen en el color de su nivel, con el icono de enlace gris y la ✖; Grupo Base en dorado', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    local A = SnetForever.Arbol
    A.crear("", "Telas"); A.crear("Telas", "Seda"); A.crear("Telas${S}Seda", "Fina"); A.crear("Telas${S}Seda${S}Fina", "Muy")
    A.crear("Telas${S}Seda${S}Fina${S}Muy", "Cinco"); A.crear("Telas${S}Seda${S}Fina${S}Muy${S}Cinco", "Seis")
    O.crear("compras", "Mía")
    local rutas = {"", "Telas", "Telas${S}Seda", "Telas${S}Seda${S}Fina", "Telas${S}Seda${S}Fina${S}Muy",
      "Telas${S}Seda${S}Fina${S}Muy${S}Cinco", "Telas${S}Seda${S}Fina${S}Muy${S}Cinco${S}Seis"}
    for _, ruta in ipairs(rutas) do O.ponerDeGrupo(ruta, "compras", {"Mía"}) end
    abrirOp("compras", "Mía")
    local probe = UIParent:CreateTexture()
    SnetForever.Tema.icono(probe, "vinculo")
    local vinculo = {probe:GetTexCoord()}
    SnetForever.Tema.icono(probe, "carpeta")
    local carpeta = {probe:GetTexCoord()}
    local filas = {}
    for _, f in ipairs(E:pagina().filasGrupo) do
      if f:IsShown() then
        local w, h = f.icono:GetSize()
        local _, rel = f.icono:GetPoint(1)
        local _, relQuitar = f.botonQuitar:GetPoint(1)
        filas[#filas + 1] = {texto = f.texto:GetText(), color = {f.texto:GetTextColor()}, icono = {f.icono:GetVertexColor()},
          coords = {f.icono:GetTexCoord()}, lado = {w, h}, quitar = f.botonQuitar:IsShown(),
          orden = rel == f.texto and relQuitar == f.icono}
      end
    end
    return {filas = filas, vinculo = vinculo, carpeta = carpeta}
  end)()`);
  assert.equal(r.filas.length, 7);
  const colores = r.filas.map((f) => aHex(f.color));
  assert.deepEqual(colores, ['fcf141', 'fcf141', 'bdaec6', '06a2cb', 'ffb85c', '2fb8a0', 'fcf141'],
    'Grupo Base en dorado y cada nivel en su color (el 6 vuelve al 1)');
  assert.equal(r.filas[0].texto, 'Grupo Base');
  for (const f of r.filas) {
    assert.deepEqual(f.coords, r.vinculo, `${f.texto}: el icono es el de enlace`);
    assert.notDeepEqual(f.coords, r.carpeta, `${f.texto}: ya no es la carpeta`);
    assert.equal(aHex(f.icono), 'a99b8e', `${f.texto}: el icono en gris (apagado)`);
    assert.deepEqual(f.lado, [12, 12]);
    assert.equal(f.quitar, true, `${f.texto}: con su ✖`);
    assert.equal(f.orden, true, `${f.texto}: nombre, enlace y ✖, en ese orden`);
  }
  sinErrores(m);
});

// Task 35 (punto 5): la puja se escribe con «%», como en TSM («100%»), y se guarda como número (0..100).
test('la puja se ve «100%», acepta 85 y 85 %, guarda 85, y fuera de rango se pone en rojo sin guardar', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Alta")
    abrirOp("subasta", "Alta")
    E.pestanas.pestanas[2]:Click("LeftButton")
    local c = E:bloque("pujaPorcentaje").control
    local function escribir(t)
      c:SetText(t)
      local mal = c.snfError
      c:GetScript("OnEnterPressed")(c)
      return {mal or false, O.valor("subasta", "Alta", "pujaPorcentaje"), c:GetText()}
    end
    local out = {inicio = c:GetText()}
    out.ochenta = escribir("80")
    out.conPorciento = escribir("70%")
    out.conEspacios = escribir(" 85 % ")
    out.alto = escribir("150%")
    out.negativo = escribir("-5")
    out.letras = escribir("mucho")
    out.dosVeces = escribir("50%%")
    c:GetScript("OnEscapePressed")(c)
    out.trasEscape = c:GetText()
    out.tipo = type(O.valor("subasta", "Alta", "pujaPorcentaje"))
    return out
  end)()`);
  assert.equal(r.inicio, '100%');
  assert.deepEqual(r.ochenta, [false, 80, '80%']);
  assert.deepEqual(r.conPorciento, [false, 70, '70%']);
  assert.deepEqual(r.conEspacios, [false, 85, '85%']);
  assert.match(r.alto[0], /de 0 a 100/);
  assert.equal(r.alto[1], 85, 'fuera de rango no se guarda');
  assert.match(r.negativo[0], /de 0 a 100/);
  assert.equal(r.negativo[1], 85);
  assert.ok(r.letras[0], 'unas letras no valen');
  assert.ok(r.dosVeces[0], '«50%%» no vale');
  assert.equal(r.dosVeces[1], 85);
  assert.equal(r.trasEscape, '85%', 'Escape vuelve a lo guardado, con su %');
  assert.equal(r.tipo, 'number', 'se guarda como número');
  sinErrores(m);
});

test('un campo de número sin unidad no cambia: «100» y «Un valor de 0 a 100»', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.campo("subasta", "pujaPorcentaje").unidad = nil
    O.crear("subasta", "Alta")
    abrirOp("subasta", "Alta")
    E.pestanas.pestanas[2]:Click("LeftButton")
    local b = E:bloque("pujaPorcentaje")
    local c = b.control
    local out = {inicio = c:GetText(), ayuda = b.ayuda:GetText()}
    c:SetText("85%")
    out.conPorciento = c.snfError or false
    c:SetText("85")
    c:GetScript("OnEnterPressed")(c)
    out.guardado = {O.valor("subasta", "Alta", "pujaPorcentaje"), c:GetText()}
    return out
  end)()`);
  assert.equal(r.inicio, '100');
  assert.equal(r.ayuda, 'Un valor de 0 a 100');
  assert.ok(r.conPorciento, 'sin unidad, «85%» no vale');
  assert.deepEqual(r.guardado, [85, '85']);
  sinErrores(m);
});

// Corrección del coordinador a la Task 35: en tsm-tooltip-campo-puja.webp la caja de la puja enseña «100%» y sigue
// llevando a su derecha «Enter a value from 0 - 100%»; la caja no va a todo el ancho.
for (const [idioma, cliente, ayuda] of [['es', 'esES', 'Un valor de 0 a 100 %'], ['en', 'enUS', 'A value from 0 to 100%']]) {
  test(`la puja lleva al lado «${ayuda}» y todo cabe (${idioma})`, necesitaComercio, () => {
    const m = maquina({ jugador: { ...JUGADOR, idioma: cliente } });
    const r = m.lua(`(function()
      ${ABRIR}
      O.crear("subasta", "Alta")
      abrirOp("subasta", "Alta")
      E.pestanas.pestanas[2]:Click("LeftButton")
      local b = E:bloque("pujaPorcentaje")
      local pag = E:pagina()
      return {ayuda = b.ayuda:GetText(), visto = b.ayuda:IsShown(), w = b.ayuda:GetUnboundedStringWidth(),
        sitio = derecha(b) - 10, ancho = ancho(b), contenido = pag.contenido:GetWidth(), caja = b.control:GetText()}
    end)()`);
    assert.equal(r.ayuda, ayuda);
    assert.equal(r.visto, true);
    assert.equal(r.caja, '100%');
    assert.ok(r.w <= r.sitio * 0.85, `cabe: ${r.w} de ${r.sitio}`);
    assert.ok(r.ancho < r.contenido - 100, `la caja no va a todo el ancho: ${r.ancho} de ${r.contenido}`);
    sinErrores(m);
  });
}
