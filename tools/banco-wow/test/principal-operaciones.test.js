// Ventana principal, parte 1, Task 21: página «Operaciones», panel izquierdo (buscador y árbol de los 7 tipos) y resumen de
// cada tipo (cabecera, cajas MÁS/MENOS, tabla con usos y borrado). Se enchufa en la ventana con Principal.registrar
// («operaciones», ui/principal/operaciones.lua del addon SnetForever_Comercio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const maquina = (opciones = {}) => nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, ...opciones });
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const S = '`';
const q = (t) => JSON.stringify(t);

// Abre la ventana en Operaciones y prepara ayudas de Lua: fila(clave) busca la fila del árbol que se ve; claves() las que se ven.
const ABRIR = `
  SnetForever.Principal.abrir("operaciones")
  local P = SnetForever.PrincipalOperaciones
  local O = SnetForever.Operaciones
  local A = SnetForever.Arbol
  local function fila(clave)
    for _, f in ipairs(P.arbol.filas) do
      if f:IsShown() and f.clave == clave then return f end
    end
  end
  local function claves()
    local t = {}
    for _, f in ipairs(P.arbol.filas) do
      if f:IsShown() and f.clave ~= nil then t[#t + 1] = f.clave end
    end
    return t
  end
  local function textos()
    local t = {}
    for _, f in ipairs(P.arbol.filas) do
      if f:IsShown() and f.clave ~= nil then t[#t + 1] = f.texto:GetText() end
    end
    return t
  end
  -- Los botones que enseña una fila (iconos): la fila se pone «con el ratón encima» como hace el ratón.
  local function botones(clave)
    local f = fila(clave)
    f:GetScript("OnEnter")(f)
    local n = {}
    for i, b in ipairs(f.botones) do if b:IsShown() then n[#n + 1] = i end end
    return f, n
  end
  local function textoCelda(i, col) return P.tabla.filas[i].celdas[col].texto:GetText() end
  local function lineas()
    local t = {}
    for i, f in ipairs(P.tabla.filas) do
      if f:IsShown() then t[#t + 1] = {f.clave, textoCelda(i, "op"), textoCelda(i, "grupos"), textoCelda(i, "objetos")} end
    end
    return t
  end`;

// La cuenta de las pruebas de usos de operaciones.test.js: Base1 (2 grupos, 3 objetos y asterisco), X (3 y 4), Y (1 y 1) y Sola (0 y 0).
function conUsos(m) {
  for (const n of ['Base1', 'X', 'Y', 'Sola']) m.lua(`SnetForever.Operaciones.crear("subasta", ${q(n)})`);
  m.lua(`(function()
    local A, O = SnetForever.Arbol, SnetForever.Operaciones
    A.crear("", "A"); A.crear("A", "B"); A.crear("A", "C"); A.crear("", "D")
    A.poner("i:1", "A"); A.poner("i:2", "A"); A.poner("i:3", "A${S}B"); A.poner("i:4", "A${S}C")
    A.poner("i:5", "D"); A.poner("i:6", "D"); A.poner("i:7", "D"); A.poner("i:8", "")
    O.ponerDeGrupo("", "subasta", {"Base1"})
    O.ponerDeGrupo("A", "subasta", {"X"})
    O.ponerDeGrupo("A${S}C", "subasta", {"Y", "X"})
  end)()`);
}

test('7 tipos en amarillo; abrir uno enseña sus operaciones; ⊕ crea', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Alta"); O.crear("subasta", "Baja")
    P.arbol:refrescar()
    local out = {pestana = SnetForever.Principal.pestana(), claves = claves(), textos = textos()}
    out.colores = {}
    for _, f in ipairs(P.arbol.filas) do
      if f:IsShown() and f.clave ~= nil then out.colores[#out.colores + 1] = {f.texto:GetTextColor()} end
    end
    out.ancho = P.panel:GetWidth()
    out.ph = P.campo.marcador:GetText()
    out.lupa = P.campo.iconoLupa ~= nil
    -- Abrir uno (con su triángulo) enseña sus operaciones, una sangría más adentro y sin ser amarillas.
    fila("t:subasta").triangulo:Click("LeftButton")
    out.abierto = claves()
    out.textosAbierto = textos()
    out.colorOp = {fila("o:subasta:Alta").texto:GetTextColor()}
    -- ⊕ de un tipo (sale sin ratón encima) crea una operación y la elige.
    local _, n = botones("t:correo")
    out.botonesTipo = #n
    fila("t:correo").botones[1]:Click("LeftButton")
    out.creadas = O.lista("correo")
    local tipo, nombre = P.elegida()
    out.elegida = {tipo, nombre}
    out.tipoVisto = P.tipo()
    out.abiertoCorreo = claves()
    return out
  end)()`);
  assert.equal(r.pestana, 'operaciones');
  assert.equal(r.ancho, 278);
  assert.equal(r.ph, 'Buscar operaciones');
  assert.equal(r.lupa, true);
  assert.deepEqual(r.claves, ['t:subasta', 't:artesania', 't:correo', 't:compras', 't:sniper', 't:vendedor', 't:almacen']);
  assert.deepEqual(r.textos, ['Operaciones de Subasta', 'Operaciones de Artesanía', 'Operaciones de Correo', 'Operaciones de Compras',
    'Operaciones de Sniper', 'Operaciones de Vendedor', 'Operaciones de Almacén']);
  for (const c of r.colores) assert.equal(aHex(c), 'e6ac72', 'los tipos van en acento');
  assert.deepEqual(r.abierto, ['t:subasta', `o:subasta:Alta`, `o:subasta:Baja`, 't:artesania', 't:correo', 't:compras', 't:sniper', 't:vendedor', 't:almacen']);
  assert.deepEqual(r.textosAbierto.slice(1, 3), ['Alta', 'Baja']);
  assert.notEqual(aHex(r.colorOp), 'e6ac72');
  assert.equal(r.botonesTipo, 1, 'el ⊕ se ve siempre');
  assert.deepEqual(r.creadas, ['Nueva operación']);
  assert.deepEqual(r.elegida, ['correo', 'Nueva operación']);
  assert.equal(r.tipoVisto, 'correo');
  assert.ok(r.abiertoCorreo.includes('o:correo:Nueva operación'), 'el tipo se abre para enseñar la nueva');
  sinErrores(m);
});

test('el resumen enseña N, las cajas MÁS/MENOS y la tabla con usos', necesitaComercio, () => {
  const m = maquina();
  conUsos(m);
  const r = m.lua(`(function()
    ${ABRIR}
    P.arbol:refrescar()
    fila("t:subasta"):Click("LeftButton")
    local d = P.derecha
    local out = {tipo = P.tipo(), titulo = P.titulo:GetText(), crear = P.enlaceCrear.texto:GetText()}
    local function caja(c)
      return {c.etiquetaMas:GetText(), c.valorMas:GetText(), c.etiquetaMenos:GetText(), c.valorMenos:GetText()}
    end
    out.grupos, out.objetos = caja(P.cajas.grupos), caja(P.cajas.objetos)
    out.lineas = lineas()
    out.cabeceras = {}
    for _, c in ipairs({"op", "grupos", "objetos"}) do out.cabeceras[#out.cabeceras + 1] = P.tabla.cabeceras[c].texto:GetText() end
    out.fuenteNumero = P.tabla.filas[1].celdas.grupos.texto:GetFont()
    out.orden = {P.tabla:orden()}
    out.borrar = {P.botonBorrar.texto:GetText(), P.botonBorrar.snfApagado}
    out.marcar = P.enlaceMarcar.texto:GetText()
    out.limpiar = {P.enlaceLimpiar.texto:GetText(), P.enlaceLimpiar.snfApagado}
    out.etiquetaFuente = P.cajas.grupos.etiquetaMas:GetFont()
    out.valorJust = P.cajas.grupos.valorMas:GetJustifyH()
    -- Otro tipo sin operaciones: N = 0 y las cajas vacías.
    fila("t:correo"):Click("LeftButton")
    out.vacio = {P.titulo:GetText(), P.cajas.grupos.valorMas:GetText(), #lineas()}
    return out
  end)()`);
  assert.equal(r.tipo, 'subasta');
  assert.equal(r.titulo, '|cffe6ac724|r Operaciones de Subasta', 'número en cobre');
  assert.equal(r.crear, 'Crear nueva');
  assert.deepEqual(r.grupos, ['MÁS GRUPOS', 'X', 'MENOS GRUPOS', 'Sola']);
  assert.deepEqual(r.objetos, ['MÁS OBJETOS', 'X', 'MENOS OBJETOS', 'Sola']);
  assert.deepEqual(r.lineas, [['subasta:Base1', 'Base1', '2', '3*'], ['subasta:Sola', 'Sola', '0', '0'], ['subasta:X', 'X', '3', '4'], ['subasta:Y', 'Y', '1', '1']]);
  assert.deepEqual(r.cabeceras, ['Operación', 'Grupos que la usan', 'Objetos que la usan']);
  // B3r: las letras del tema son Montserrat (tablaNegrita, Bold; mayusculas, SemiBold).
  assert.match(r.fuenteNumero, /BarlowSemiCondensed-SemiBold/, 'los números, en negrita');
  assert.match(r.etiquetaFuente, /BarlowSemiCondensed-SemiBold/, 'las etiquetas de las cajas, en la letra de mayúsculas');
  assert.equal(r.valorJust, 'RIGHT');
  assert.deepEqual(r.orden, ['op', true]);
  assert.deepEqual(r.borrar, ['Borrar 0 operaciones', true], 'apagado con 0 marcadas');
  assert.equal(r.marcar, 'Marcar todo');
  assert.deepEqual(r.limpiar, ['Borrar todo', true]);
  assert.deepEqual(r.vacio, ['|cffe6ac720|r Operaciones de Correo', '', 0]);
  sinErrores(m);
});

test('las cajas y los colores salen de las capturas (medidas de op-04)', necesitaComercio, () => {
  const m = maquina();
  conUsos(m);
  const r = m.lua(`(function()
    ${ABRIR}
    P.arbol:refrescar()
    fila("t:subasta"):Click("LeftButton")
    local p = P.pagina
    local function caja(c) return {c:GetWidth(), c:GetHeight(), c:GetLeft() - p:GetLeft(), p:GetTop() - c:GetTop()} end
    return {
      panel = {P.panel:GetWidth(), P.panel:GetHeight() == p:GetHeight()},
      campo = {P.campo:GetWidth(), P.campo:GetHeight(), P.campo:GetLeft() - P.panel:GetLeft(), P.panel:GetTop() - P.campo:GetTop()},
      arbolArriba = P.panel:GetTop() - P.arbol:GetTop(),
      caja1 = caja(P.cajas.grupos), caja2 = caja(P.cajas.objetos),
      tabla = {P.tabla:GetLeft() - p:GetLeft(), p:GetTop() - P.tabla:GetTop(), P.tabla:GetWidth()},
      boton = {P.botonBorrar:GetHeight(), p:GetBottom() - P.botonBorrar:GetBottom()},
      fondoPanel = {P.fondoPanel:GetVertexColor()},
    }
  end)()`);
  assert.deepEqual(r.panel, [278, true]);
  assert.deepEqual(r.campo, [264, 22, 7, 7]);
  assert.equal(r.arbolArriba, 40);
  // Medidas de op-04: cajas de 552 x 44 a 15 px del panel (293 desde la página), con 7 px entre ellas y a 36 px de la parte de arriba.
  assert.deepEqual(r.caja1, [552, 44, 293, 36]);
  assert.deepEqual(r.caja2, [552, 44, 293 + 552 + 7, 36]);
  assert.equal(r.tabla[0], 293);
  assert.equal(r.tabla[1], 94);
  assert.equal(r.tabla[2], 1111, 'la tabla llega a 20 px del borde derecho');
  assert.deepEqual(r.boton, [22, -8]);
  assert.equal(aHex(r.fondoPanel), '232122');
  sinErrores(m);
});

test('marcar 2 y Borrar 2 operaciones las manda a la papelera', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    for _, n in ipairs({"A1", "A2", "A3"}) do O.crear("subasta", n) end
    P.arbol:refrescar()
    fila("t:subasta"):Click("LeftButton")
    local out = {antes = P.botonBorrar.texto:GetText()}
    P.tabla.filas[1].casilla:Click("LeftButton")
    P.tabla.filas[3].casilla:Click("LeftButton")
    out.boton = {P.botonBorrar.texto:GetText(), P.botonBorrar.snfApagado}
    out.limpiar = P.enlaceLimpiar.snfApagado
    P.botonBorrar:Click("LeftButton")
    out.lista = O.lista("subasta")
    out.papelera = O.papelera()
    out.tras = {P.titulo:GetText(), P.botonBorrar.texto:GetText(), P.botonBorrar.snfApagado}
    out.confirmacion = P.confirmacion:IsShown()
    out.arbol = claves()
    -- «Marcar todo» marca todas; «Borrar todo» las desmarca (no borra nada).
    P.enlaceMarcar:Click("LeftButton")
    out.todas = P.botonBorrar.texto:GetText()
    P.enlaceLimpiar:Click("LeftButton")
    out.ninguna = {P.botonBorrar.texto:GetText(), P.botonBorrar.snfApagado}
    out.sigue = O.lista("subasta")
    return out
  end)()`);
  assert.equal(r.antes, 'Borrar 0 operaciones');
  assert.deepEqual(r.boton, ['Borrar 2 operaciones', false]);
  assert.equal(r.limpiar, false, 'con marcas, «Borrar todo» ya no está apagado');
  assert.deepEqual(r.lista, ['A2']);
  assert.deepEqual(r.papelera, [{ tipo: 'subasta', nombre: 'A1' }, { tipo: 'subasta', nombre: 'A3' }]);
  assert.deepEqual(r.tras, ['|cffe6ac721|r Operaciones de Subasta', 'Borrar 0 operaciones', true]);
  assert.equal(r.confirmacion, false, 'sin grupos que las usen no se pregunta');
  assert.deepEqual(r.arbol.slice(0, 3), ['t:subasta', 'o:subasta:A2', 't:artesania']);
  assert.equal(r.todas, 'Borrar 1 operación');
  assert.deepEqual(r.ninguna, ['Borrar 0 operaciones', true]);
  assert.deepEqual(r.sigue, ['A2'], '«Borrar todo» solo quita las marcas');
  sinErrores(m);
});

test('borrar operaciones que usan grupos pide confirmación con un marco propio; Cancelar no borra nada', necesitaComercio, () => {
  const m = maquina();
  conUsos(m);
  const r = m.lua(`(function()
    ${ABRIR}
    P.arbol:refrescar()
    fila("t:subasta"):Click("LeftButton")
    local out = {}
    -- Marca Sola (sin usos, la 2.ª) y X (con usos, la 3.ª).
    P.tabla.filas[2].casilla:Click("LeftButton")
    P.tabla.filas[3].casilla:Click("LeftButton")
    P.botonBorrar:Click("LeftButton")
    out.pregunta = {P.confirmacion:IsShown(), P.confirmacion.texto:GetText(), O.existe("subasta", "X"), O.existe("subasta", "Sola")}
    out.enEspeciales = false
    for _, n in ipairs(UISpecialFrames) do if n == P.confirmacion:GetName() then out.enEspeciales = true end end
    P.confirmacion.botonCancelar:Click("LeftButton")
    out.cancelado = {P.confirmacion:IsShown(), O.existe("subasta", "X"), O.existe("subasta", "Sola"), #O.papelera()}
    P.botonBorrar:Click("LeftButton")
    P.confirmacion.botonBorrar:Click("LeftButton")
    out.confirmado = {P.confirmacion:IsShown(), O.existe("subasta", "X"), O.existe("subasta", "Sola"), #O.papelera()}
    local n, _, faltan = O.deGrupo("A", "subasta")
    out.grupoA = {n, faltan}
    return out
  end)()`);
  assert.equal(r.pregunta[0], true);
  assert.match(r.pregunta[1], /X|Sola|2/);
  assert.match(r.pregunta[1], /papelera/);
  assert.deepEqual(r.pregunta.slice(2), [true, true], 'hasta confirmar no se borra nada');
  assert.equal(r.enEspeciales, true, 'Escape la cierra');
  assert.deepEqual(r.cancelado, [false, true, true, 0]);
  assert.deepEqual(r.confirmado, [false, false, false, 2], 'a la papelera, las dos');
  assert.deepEqual(r.grupoA[1], ['X'], 'el grupo las marca como que faltan (siguen guardadas por si vuelven)');
  sinErrores(m);
});

test('la elegida lleva duplicar y borrar', necesitaComercio, () => {
  const m = maquina();
  conUsos(m);
  const r = m.lua(`(function()
    ${ABRIR}
    P.arbol:refrescar()
    fila("t:subasta"):Click("LeftButton")
    local out = {}
    local probe = UIParent:CreateTexture()
    local function de(nombre) SnetForever.Tema.icono(probe, nombre); return {probe:GetTexCoord()} end
    fila("o:subasta:Sola"):Click("LeftButton")
    local f = fila("o:subasta:Sola")
    local n = {}
    for i, b in ipairs(f.botones) do if b:IsShown() then n[#n + 1] = {b.icono:GetTexCoord()} end end
    out.iconos = n
    out.esperados = {de("copiar"), de("papelera")}
    out.elegida = {P.elegida()}
    local y = fila("o:subasta:Y")
    out.otraSinBotones = 0
    for _, b in ipairs(y.botones) do if b:IsShown() then out.otraSinBotones = out.otraSinBotones + 1 end end
    out.otraConRaton = #select(2, botones("o:subasta:Y"))
    -- Duplicar: nace «Sola 2» y queda elegida.
    fila("o:subasta:Sola").botones[1]:Click("LeftButton")
    out.lista = O.lista("subasta")
    out.elegidaTras = {P.elegida()}
    -- Borrar una sin usos: a la papelera sin preguntar; ya no hay elegida.
    fila("o:subasta:Sola 2").botones[2]:Click("LeftButton")
    out.sinPregunta = P.confirmacion:IsShown()
    out.papelera = O.papelera()
    out.elegidaFinal = {P.elegida()}
    -- Borrar una con usos: pregunta.
    fila("o:subasta:X"):Click("LeftButton")
    fila("o:subasta:X").botones[2]:Click("LeftButton")
    out.preguntaX = {P.confirmacion:IsShown(), O.existe("subasta", "X")}
    P.confirmacion.botonBorrar:Click("LeftButton")
    out.borradaX = {P.confirmacion:IsShown(), O.existe("subasta", "X"), #O.papelera()}
    return out
  end)()`);
  assert.equal(r.iconos.length, 2);
  assert.deepEqual(r.iconos, r.esperados);
  assert.deepEqual(r.elegida, ['subasta', 'Sola']);
  assert.equal(r.otraSinBotones, 0, 'una operación que no es la elegida no los enseña sin el ratón encima');
  assert.equal(r.otraConRaton, 2, 'y con el ratón encima sí');
  assert.deepEqual(r.lista, ['Base1', 'Sola', 'Sola 2', 'X', 'Y']);
  assert.deepEqual(r.elegidaTras, ['subasta', 'Sola 2']);
  assert.equal(r.sinPregunta, false);
  assert.deepEqual(r.papelera, [{ tipo: 'subasta', nombre: 'Sola 2' }]);
  assert.deepEqual(r.elegidaFinal, ['subasta']);
  assert.deepEqual(r.preguntaX, [true, true]);
  assert.deepEqual(r.borradaX, [false, false, 2]);
  sinErrores(m);
});

test('⊕ Crear nueva crea con un nombre libre, la elige y abre el tipo; la papelera no cuenta', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("sniper", "Nueva operación")
    P.arbol:refrescar()
    fila("t:sniper"):Click("LeftButton")
    P.enlaceCrear:Click("LeftButton")
    local out = {lista = O.lista("sniper"), elegida = {P.elegida()}, titulo = P.titulo:GetText()}
    out.arbol = claves()
    return out
  end)()`);
  assert.deepEqual(r.lista, ['Nueva operación', 'Nueva operación 2']);
  assert.deepEqual(r.elegida, ['sniper', 'Nueva operación 2']);
  assert.equal(r.titulo, '|cffe6ac722|r Operaciones de Sniper');
  assert.deepEqual(r.arbol.slice(0, 3), ['t:subasta', 't:artesania', 't:correo']);
  assert.ok(r.arbol.includes('o:sniper:Nueva operación 2'));
  sinErrores(m);
});

test('abrir(tipo, nombre) abre el tipo y elige la operación; si no existe se queda en el tipo', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("compras", "Mía"); O.crear("compras", "Otra")
    P.arbol:refrescar()
    P.abrir("compras", "Otra")
    local out = {elegida = {P.elegida()}, tipo = P.tipo(), claves = claves(), seleccion = P.arbol:elegida()}
    P.abrir("almacen", "No existe")
    out.sinNombre = {P.elegida()}
    out.tipo2 = P.tipo()
    P.abrir("zzz", "Nada")
    out.tipo3 = P.tipo()
    return out
  end)()`);
  assert.deepEqual(r.elegida, ['compras', 'Otra']);
  assert.equal(r.tipo, 'compras');
  assert.equal(r.seleccion, 'o:compras:Otra');
  assert.deepEqual(r.claves.slice(0, 5), ['t:subasta', 't:artesania', 't:correo', 't:compras', 'o:compras:Mía']);
  assert.deepEqual(r.sinNombre, ['almacen']);
  assert.equal(r.tipo2, 'almacen');
  assert.equal(r.tipo3, 'almacen', 'un tipo que no existe no cambia nada');
  sinErrores(m);
});

test('al crearse la página recoge operacionPedida (la de Grupos) y la borra una vez usada', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    SnetForever.Operaciones.crear("vendedor", "Ropa")
    SnetForever.Principal.abrir("grupos")
    SnetForever.PrincipalGrupos.operacionPedida = {tipo = "vendedor", nombre = "Ropa"}
    SnetForever.Principal.elegir("operaciones")
    local P = SnetForever.PrincipalOperaciones
    local out = {elegida = {P.elegida()}, pedida = SnetForever.PrincipalGrupos.operacionPedida}
    -- Sin petición, al volver no cambia lo elegido.
    SnetForever.Principal.elegir("grupos")
    SnetForever.Principal.elegir("operaciones")
    out.sigue = {P.elegida()}
    return out
  end)()`);
  assert.deepEqual(r.elegida, ['vendedor', 'Ropa']);
  assert.equal(r.pedida, undefined, 'la petición se borra al usarla');
  assert.deepEqual(r.sigue, ['vendedor', 'Ropa']);
  sinErrores(m);
});

test('buscar filtra el árbol mientras se escribe; en combate el buscador no se queda con el teclado', necesitaComercio, () => {
  const m = maquina();
  m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Hierbas raras"); O.crear("subasta", "Armas"); O.crear("correo", "Hierbas al banco")
    P.arbol:refrescar()
  end)()`);
  m.lua('SnetForever.PrincipalOperaciones.campo:SetText("hierba")');
  const filtrado = m.lua(`(function()
    local t = {}
    for _, f in ipairs(SnetForever.PrincipalOperaciones.arbol.filas) do
      if f:IsShown() and f.clave ~= nil then t[#t + 1] = f.clave end
    end
    return t
  end)()`);
  assert.deepEqual(filtrado, ['t:subasta', 'o:subasta:Hierbas raras', 't:correo', 'o:correo:Hierbas al banco']);
  m.lua('SnetForever.PrincipalOperaciones.campo:SetText("")');
  m.jugador({ enCombate: true });
  m.lua('(function() local c = SnetForever.PrincipalOperaciones.campo; c:SetFocus(); c:GetScript("OnEditFocusGained")(c) end)()');
  assert.equal(m.lua('SnetForever.PrincipalOperaciones.campo:HasFocus()'), false, 'en combate suelta el teclado');
  m.jugador({ enCombate: false });
  m.lua('(function() local c = SnetForever.PrincipalOperaciones.campo; c:SetFocus(); c:GetScript("OnEditFocusGained")(c) end)()');
  assert.equal(m.lua('SnetForever.PrincipalOperaciones.campo:HasFocus()'), true);
  sinErrores(m);
});

test('los textos de la página salen en inglés con el cliente en inglés y se repintan al cambiar de idioma', necesitaComercio, () => {
  const m = maquina({ jugador: { ...JUGADOR, idioma: 'enUS' } });
  conUsos(m);
  const r = m.lua(`(function()
    ${ABRIR}
    P.arbol:refrescar()
    fila("t:subasta"):Click("LeftButton")
    local out = {
      ph = P.campo.marcador:GetText(), tipo = textos()[1], titulo = P.titulo:GetText(), crear = P.enlaceCrear.texto:GetText(),
      caja = P.cajas.grupos.etiquetaMas:GetText(), col = P.tabla.cabeceras.op.texto:GetText(), borrar = P.botonBorrar.texto:GetText(),
      marcar = P.enlaceMarcar.texto:GetText(), limpiar = P.enlaceLimpiar.texto:GetText(),
    }
    SnetForever.Ajustes.set("idioma", "es")
    out.es = {P.campo.marcador:GetText(), textos()[1], P.titulo:GetText(), P.cajas.objetos.etiquetaMenos:GetText(), P.botonBorrar.texto:GetText()}
    return out
  end)()`);
  assert.deepEqual(r.ph, 'Search operations');
  assert.equal(r.tipo, 'Auctioning operations');
  assert.equal(r.titulo, '|cffe6ac724|r Auctioning operations');
  assert.equal(r.crear, 'Create new');
  assert.equal(r.caja, 'MOST GROUPS');
  assert.equal(r.col, 'Operation');
  assert.equal(r.borrar, 'Delete 0 operations');
  assert.equal(r.marcar, 'Select all');
  assert.equal(r.limpiar, 'Clear all');
  assert.deepEqual(r.es, ['Buscar operaciones', 'Operaciones de Subasta', '|cffe6ac724|r Operaciones de Subasta', 'MENOS OBJETOS', 'Borrar 0 operaciones']);
  sinErrores(m);
});

test('las marcas no pasan de un tipo a otro: ni al elegir otro tipo ni con abrir() (↗)', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Nueva operación"); O.crear("correo", "Nueva operación")
    P.arbol:refrescar()
    local out = {}
    local function estado() return {P.botonBorrar.texto:GetText(), P.botonBorrar.snfApagado, P.enlaceLimpiar.snfApagado} end
    fila("t:subasta"):Click("LeftButton")
    P.tabla.filas[1].casilla:Click("LeftButton")
    out.marcada = estado()
    fila("t:correo"):Click("LeftButton")
    out.correo = estado()
    out.correoMarcadas = 0
    for _ in pairs(P.tabla:marcadas()) do out.correoMarcadas = out.correoMarcadas + 1 end
    -- Lo mismo con abrir() (lo que hace ↗ de Grupos).
    fila("t:subasta"):Click("LeftButton")
    P.tabla.filas[1].casilla:Click("LeftButton")
    P.abrir("correo", "Nueva operación")
    out.abrir = estado()
    P.botonBorrar:Click("LeftButton")
    out.sigue = {O.existe("correo", "Nueva operación"), #O.papelera()}
    return out
  end)()`);
  assert.deepEqual(r.marcada, ['Borrar 1 operación', false, false]);
  assert.deepEqual(r.correo, ['Borrar 0 operaciones', true, true], 'la de Correo no sale marcada');
  assert.equal(r.correoMarcadas, 0);
  assert.deepEqual(r.abrir, ['Borrar 0 operaciones', true, true]);
  assert.deepEqual(r.sigue, [true, 0], 'pulsar el botón apagado no borra nada');
  sinErrores(m);
});

test('el texto del árbol queda a +20 px (tipo) y +31 px (operación), como en op-04', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    O.crear("subasta", "Alta")
    P.arbol:refrescar()
    fila("t:subasta").triangulo:Click("LeftButton")
    local function x(c) local _, _, _, px = fila(c).texto:GetPoint(1); return px end
    local function tri(c) local _, _, _, px = fila(c).triangulo:GetPoint(1); return px end
    return {tipo = x("t:subasta"), op = x("o:subasta:Alta"), triTipo = tri("t:subasta")}
  end)()`);
  assert.equal(r.tipo, 20);
  assert.equal(r.op, 31);
  assert.equal(r.triTipo, 4 - 2, 'el triángulo a 4 px (su zona de 16 px sale 2 px hacia fuera)');
  sinErrores(m);
});

test('en combate, con el foco ya puesto en el buscador, lo suelta al empezar el combate', necesitaComercio, () => {
  const m = maquina();
  m.lua('SnetForever.Principal.abrir("operaciones")');
  m.lua('(function() local c = SnetForever.PrincipalOperaciones.campo; c:SetFocus(); c:GetScript("OnEditFocusGained")(c) end)()');
  assert.equal(m.lua('SnetForever.PrincipalOperaciones.campo:HasFocus()'), true, 'fuera de combate lo tiene');
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('SnetForever.PrincipalOperaciones.campo:HasFocus()'), false);
  sinErrores(m);
});

test('la primera vez que se abre con ↗ los usos se cuentan una sola vez', necesitaComercio, () => {
  const m = maquina();
  m.lua('SnetForever.Operaciones.crear("subasta", "Alta")');
  m.lua('SnetForever.Principal.abrir("grupos")');
  m.lua(`(function()
    local O = SnetForever.Operaciones
    O.ponerDeGrupo("", "subasta", {"Alta"})
    CUENTAS = 0
    local u = O.usosDeTipo
    O.usosDeTipo = function(...) CUENTAS = CUENTAS + 1; return u(...) end
    SnetForever.PrincipalGrupos.abrirOperacion("subasta", "Alta")
  end)()`);
  assert.equal(m.lua('CUENTAS'), 1, 'crear, enseñar y abrir no repiten el cálculo');
  assert.deepEqual(m.lua('{SnetForever.PrincipalOperaciones.elegida()}'), ['subasta', 'Alta']);
  // Con la página ya creada, ↗ también cuenta una sola vez.
  m.lua('SnetForever.Principal.elegir("grupos"); CUENTAS = 0');
  m.lua('SnetForever.PrincipalGrupos.abrirOperacion("subasta", "Alta")');
  assert.equal(m.lua('CUENTAS'), 1);
  // Sin petición, abrir la pestaña por primera vez también cuenta una sola vez.
  const n = maquina();
  n.lua(`CUENTAS = 0; local O = SnetForever.Operaciones; local u = O.usosDeTipo
    O.usosDeTipo = function(...) CUENTAS = CUENTAS + 1; return u(...) end
    SnetForever.Principal.abrir("operaciones")`);
  assert.equal(n.lua('CUENTAS'), 1);
  sinErrores(m);
  sinErrores(n);
});

// Tiempo: la página con 300 operaciones y 150 grupos (el mejor de 3 tras calentar, menos de 500 ms).
function abrirMidiendo() {
  const m = maquina();
  m.lua(`(function()
    local A, O = SnetForever.Arbol, SnetForever.Operaciones
    for i = 1, 50 do
      local r = A.crear("", "Grupo " .. i)
      for j = 1, 2 do A.crear(r, "Hijo " .. j); A.poner("i:" .. (i * 10 + j), r .. "${S}Hijo " .. j) end
    end
    local nombres = {}
    for i = 1, 300 do nombres[i] = O.crear("subasta", "Operación " .. i) end
    for i = 1, 50 do O.ponerDeGrupo("Grupo " .. i, "subasta", {nombres[i], nombres[i + 1]}) end
  end)()`);
  m.lua('BANCO.disposicionDiferida = true');
  m.lua('SnetForever.Principal.abrir("dashboard")');
  m.lua('SnetForever.Principal.elegir("operaciones")');
  const inicio = process.hrtime.bigint();
  m.lua('SnetForever.PrincipalOperaciones.abrir("subasta", "Operación 7")');
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
  return { m, ms };
}

test('con 300 operaciones abrir un tipo tarda poco en el banco (el mejor de 3 tras un intento de calentamiento, menos de 500 ms)', necesitaComercio, () => {
  abrirMidiendo(); // calentamiento: no cuenta
  const tiempos = [];
  for (let i = 0; i < 3; i++) {
    const { m, ms } = abrirMidiendo();
    assert.equal(m.lua('SnetForever.PrincipalOperaciones.tabla:cuantas()'), 300, 'la tabla tiene todas las operaciones');
    assert.equal(m.lua('SnetForever.PrincipalOperaciones.tipo()'), 'subasta');
    tiempos.push(ms);
  }
  const mejor = Math.min(...tiempos);
  assert.ok(mejor < 500, `abrir tardó ${tiempos.map((t) => t.toFixed(1)).join(', ')} ms`);
});

// Task 22, A.1: la cabecera del resumen es ⋮ (a la izquierda) · ✓ · Operación · Grupos que la usan · Objetos que la usan, y
// sus títulos se ven aunque al crearse la tabla la letra propia no hubiera cargado (se vuelven a escribir al enseñarse).
test('la cabecera del resumen lleva ⋮ a la izquierda, ✓ y los tres títulos, que se pintan al enseñarse', necesitaComercio, () => {
  const m = maquina();
  conUsos(m);
  m.lua('BANCO.textoSinCargar = true');
  m.lua('SnetForever.Principal.abrir("operaciones")');
  const antes = m.lua('BANCO.textoPintado(SnetForever.PrincipalOperaciones.tabla.cabeceras.op.texto)');
  m.lua('BANCO.textoSinCargar = false');
  m.lua('SnetForever.Principal.elegir("grupos"); SnetForever.Principal.elegir("operaciones")');
  const r = m.lua(`(function()
    local P = SnetForever.PrincipalOperaciones
    local t = P.tabla
    local probe = UIParent:CreateTexture()
    SnetForever.Tema.icono(probe, "puntos")
    local out = {
      menu = t.botonMenu:GetLeft() - t:GetLeft(), marcar = t.botonMarcar:GetLeft() - t:GetLeft(),
      op = t.cabeceras.op:GetLeft() - t:GetLeft(),
      iconoMenu = {t.botonMenu.icono:GetTexCoord()}, puntos = {probe:GetTexCoord()},
      casilla = P.tabla.filas[1].casilla:GetLeft() - t:GetLeft(),
      pintados = {}, textos = {},
    }
    for _, c in ipairs({"op", "grupos", "objetos"}) do
      out.pintados[#out.pintados + 1] = BANCO.textoPintado(t.cabeceras[c].texto)
      out.textos[#out.textos + 1] = t.cabeceras[c].texto:GetText()
    end
    return out
  end)()`);
  assert.equal(antes, false, 'con la letra sin cargar no se pintaba');
  assert.equal(r.menu, 0, '⋮ el primero, a la izquierda');
  assert.equal(r.marcar, 22, '✓ detrás');
  assert.equal(r.op, 22 + 24, 'y luego «Operación»');
  assert.deepEqual(r.iconoMenu, r.puntos, 'el ⋮ de las piezas de la subasta');
  assert.ok(r.casilla >= 22, 'la casilla de cada fila, bajo la ✓');
  assert.deepEqual(r.textos, ['Operación', 'Grupos que la usan', 'Objetos que la usan']);
  assert.deepEqual(r.pintados, [true, true, true]);
  sinErrores(m);
});

test('el asterisco del Grupo Base lleva un tooltip que lo explica', necesitaComercio, () => {
  const m = maquina();
  conUsos(m);
  const r = m.lua(`(function()
    ${ABRIR}
    P.arbol:refrescar()
    fila("t:subasta"):Click("LeftButton")
    local f1 = P.tabla.filas[1] -- Base1: 3*
    f1:GetScript("OnEnter")(f1)
    return {texto = textoCelda(1, "objetos"), tooltip = BANCO.lineasTooltip(), visto = GameTooltip:IsShown()}
  end)()`);
  assert.equal(r.texto, '3*');
  assert.equal(r.visto, true);
  assert.ok(r.tooltip.some((l) => /Grupo Base/.test(l)), JSON.stringify(r.tooltip));
  sinErrores(m);
});

// Task 22, A.2: ⊕ (círculo blanco con +) para crear y el triángulo ▸ blanco, también en «⊕ Crear nueva».
test('el árbol lleva ⊕ blanco para crear y el triángulo blanco; «Crear nueva» lleva ⊕', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    local probe = UIParent:CreateTexture()
    local function de(nombre) SnetForever.Tema.icono(probe, nombre); return {probe:GetTexCoord()} end
    local f = fila("t:sniper")
    return {
      mas = {f.botones[1].icono:GetTexCoord()}, esperado = de("masCirculo"), colorMas = {f.botones[1].icono:GetVertexColor()},
      colorTri = {f.triangulo.icono:GetVertexColor()}, tri = {f.triangulo.icono:GetTexCoord()}, cerrado = de("cerrado"),
      crear = {P.enlaceCrear.icono:GetTexCoord()},
    }
  end)()`);
  assert.deepEqual(r.mas, r.esperado);
  assert.equal(aHex(r.colorMas), 'f5e8d4', 'blanco');
  assert.deepEqual(r.tri, r.cerrado);
  assert.equal(aHex(r.colorTri), 'f5e8d4', 'el triángulo blanco y claro');
  assert.deepEqual(r.crear, r.esperado);
  sinErrores(m);
});

// Task 22, C (pendiente de la Task 21): la petición de Grupos (operacionPedida) se recoge siempre y no deja nada colgado que se
// trague la siguiente petición.
test('operacionPedida se recoge siempre: sin abrir() detrás no se traga el siguiente abrir, y con la página ya visible también abre', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    local O = SnetForever.Operaciones
    O.crear("vendedor", "Ropa"); O.crear("compras", "Otra")
    SnetForever.Principal.abrir("grupos")
    local G = SnetForever.PrincipalGrupos
    G.operacionPedida = {tipo = "vendedor", nombre = "Ropa"}
    SnetForever.Principal.elegir("operaciones")
    local P = SnetForever.PrincipalOperaciones
    local out = {primera = {P.elegida()}, pedida = G.operacionPedida}
    P.abrir("compras", "Otra")
    P.abrir("vendedor", "Ropa")
    out.segunda = {P.elegida()}
    -- Con Operaciones ya a la vista, abrirOperacion también abre y no deja la petición guardada.
    G.abrirOperacion("compras", "Otra")
    out.visible = {P.elegida()}
    out.pendiente = G.operacionPedida
    return out
  end)()`);
  assert.deepEqual(r.primera, ['vendedor', 'Ropa']);
  assert.equal(r.pedida, undefined);
  assert.deepEqual(r.segunda, ['vendedor', 'Ropa'], 'el abrir() de después no se pierde');
  assert.deepEqual(r.visible, ['compras', 'Otra']);
  assert.equal(r.pendiente, undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------------
// Task 36 (punto 3 de la Fase H): las cabeceras de uso caben enteras y las casillas solo salen al marcar o pasar el ratón.
// ---------------------------------------------------------------------------------------------------------------------

// Anchos de letra de verdad (los de test/principal-grupos.test.js: Montserrat medida con PIL más un 3 %).
const FACTOR_LETRA = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };
const letraReal = (m) => m.lua(`BANCO.letraReal = {${Object.entries(FACTOR_LETRA).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);

test('las cabeceras Grupos que la usan y Objetos que la usan caben enteras en es y en (margen 0,85), a 1000 y a 1424 de ancho', necesitaComercio, () => {
  for (const [idioma, cliente] of [['es', 'esES'], ['en', 'enUS']]) {
    for (const [ancho, alto] of [[1000, 600], [1424, 805]]) {
      const m = maquina({ jugador: { ...JUGADOR, idioma: cliente } });
      letraReal(m);
      conUsos(m);
      const r = m.lua(`(function()
        SnetForever.Principal.abrir("operaciones")
        SnetForever.Principal.marco():SetSize(${ancho}, ${alto})
        local P, Tema = SnetForever.PrincipalOperaciones, SnetForever.Tema
        local t = P.tabla
        local out = {derechaTabla = t:GetRight(), columnas = {}}
        for _, c in ipairs({"grupos", "objetos"}) do
          local b = t.cabeceras[c]
          out.columnas[#out.columnas + 1] = {texto = b.texto:GetText(), medido = Tema.anchoTexto(b.texto),
            ancho = b:GetRight() - b:GetLeft(), derecha = b:GetRight(), visible = b:IsVisible()}
        end
        return out
      end)()`);
      for (const c of r.columnas) {
        const libre = (c.ancho - 2 * 6) * 0.85;
        assert.ok(c.medido <= libre, `${idioma} a ${ancho}: «${c.texto}» mide ${c.medido.toFixed(1)} y caben ${libre.toFixed(1)}`);
        assert.equal(c.visible, true, `${idioma} a ${ancho}: «${c.texto}» se ve`);
        assert.ok(c.derecha <= r.derechaTabla + 0.01, `${idioma} a ${ancho}: «${c.texto}» queda dentro de la tabla`);
      }
      sinErrores(m);
    }
  }
});

test('en el resumen las filas sin marcar no enseñan la casilla y marcar sigue sirviendo para Borrar N operaciones', necesitaComercio, () => {
  const m = maquina();
  conUsos(m);
  const r = m.lua(`(function()
    ${ABRIR}
    P.arbol:refrescar()
    fila("t:subasta"):Click("LeftButton")
    local t = P.tabla
    local function cajas()
      local out = {}
      for _, f in ipairs(t.filas) do
        if f:IsShown() then out[#out + 1] = f.casilla.caja:IsShown() end
      end
      return out
    end
    local out = {inicio = cajas(), zona = t.filas[1].casilla:IsShown()}
    t.filas[2].casilla:Click("LeftButton")
    t.filas[4].casilla:Click("LeftButton")
    out.marcadas = cajas()
    out.borrar = {P.botonBorrar.texto:GetText(), P.botonBorrar.snfApagado}
    local f1 = t.filas[1]
    f1:GetScript("OnEnter")(f1)
    out.encima = f1.casilla.caja:IsShown()
    f1:GetScript("OnLeave")(f1)
    BANCO.avanzar(0.3)
    out.fuera = f1.casilla.caja:IsShown()
    out.cabecera = t.botonMarcar:IsShown()
    return out
  end)()`);
  assert.deepEqual(r.inicio, [false, false, false, false], 'sin marcar, ninguna fila enseña su casilla');
  assert.equal(r.zona, true, 'la zona para marcar sigue ahí');
  assert.deepEqual(r.marcadas, [false, true, false, true], 'las marcadas sí');
  assert.deepEqual(r.borrar, ['Borrar 2 operaciones', false]);
  assert.equal(r.encima, true, 'con el ratón encima sale la casilla');
  assert.equal(r.fuera, false);
  assert.equal(r.cabecera, true, 'la ✓ de la cabecera sigue');
  sinErrores(m);
});
