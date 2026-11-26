// Ventana principal, parte 1, Task 39: la página «Ajustes › Tooltip» con la forma de la de TSM (aj-02), en
// ui/principal/ajustes.lua del addon SnetForever_Comercio (SnetForever.PrincipalAjustes.tooltip):
//   · arriba, «Opciones generales»: el radio Activar, la casilla Insertar y los desplegables Formato y Tecla, cada uno con su
//     explicación en el tooltip;
//   · debajo, «Líneas del tooltip» en dos columnas: a la izquierda las casillas agrupadas como Tooltip.GRUPOS, con las
//     fuentes propias en «Valores» y la lista de personajes debajo; a la derecha, el «Tooltip de ejemplo» (Task 40).
// Y lo que añade el controlador: quitar una fuente propia encendida apaga su línea del tooltip.
// Task 40: el «Tooltip de ejemplo» (Pagina.tooltip.ejemplo), con los datos fijos de Tooltip.EJEMPLO y
// Tooltip.componer(salida, Tooltip.EJEMPLO, g, {todas = true}): todas las líneas con datos, las encendidas en su color y las
// apagadas en gris, que cambia al marcar cada casilla. Todos los datos son inventados.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

function maquina(opciones = {}) {
  return nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, ...opciones });
}

// Abre Ajustes › Tooltip. `elegir(d, valor)` abre un desplegable y pulsa la fila de ese valor.
const TOOLTIP = `
  SnetForever.Principal.abrir("ajustes")
  local A = SnetForever.PrincipalAjustes
  A.elegir("tooltip")
  local t = A.tooltip
  local T = SnetForever.TooltipComercio
  local L = SnetForever.L
  local function elegir(d, valor)
    d:Click("LeftButton")
    for _, f in ipairs(SnetForeverDesplegableLista.filas) do
      if f:IsShown() and f.valor == valor then f:Click("LeftButton") return true end
    end
    return false
  end
  local function ayuda(marco)
    marco:GetScript("OnEnter")(marco)
    local l = BANCO.lineasTooltip()
    marco:GetScript("OnLeave")(marco)
    return l
  end
  -- El banco no coloca el contenido de una zona con desplazamiento: se ancla a la zona y se le da su ancho (lo que hace el
  -- cliente) para poder medir.
  local function colocarContenido()
    t.contenido:ClearAllPoints()
    t.contenido:SetPoint("TOPLEFT", t.zona, "TOPLEFT", 0, 0)
    t.contenido:SetWidth(t.zona:GetWidth())
    A.refrescar()
  end`;

test('arriba salen el radio Activar, la casilla Insertar y los desplegables Formato y Tecla, cada uno con su efecto', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    local out = {}
    out.titulo = t.titulo.titulo:GetText()
    out.textos = {t.etiquetaActivar.texto:GetText(), t.general.si.texto:GetText(), t.general.no.texto:GetText(),
      t.incrustado.texto:GetText(), t.etiquetaFormato.texto:GetText(), t.etiquetaTecla.texto:GetText()}
    local function opciones(d)
      local o = {}
      for i, x in ipairs(d.snfOpciones.opciones) do o[i] = {tostring(x[1]), x[2]} end
      return o
    end
    out.opcFormato, out.opcTecla = opciones(t.formato), opciones(t.tecla)
    out.antes = {t.general.valor, t.incrustado.marcada, t.formato.texto:GetText(), t.tecla.texto:GetText()}
    -- Cada control cambia su opción.
    t.incrustado:Click("LeftButton")
    out.insertar = {T.opcion("incrustado"), t.incrustado.marcada}
    out.elegidoFormato = elegir(t.formato, "iconos")
    out.formato = {T.opcion("formato"), t.formato.texto:GetText()}
    out.elegidoTecla = elegir(t.tecla, "alt")
    out.tecla = {T.opcion("tecla"), t.tecla.texto:GetText()}
    t.general.no:Click("LeftButton")
    out.activarNo = {T.activo(), t.general.valor}
    t.general.si:Click("LeftButton")
    out.activarSi = {T.activo(), t.general.valor}
    -- Si cambian desde fuera (la página de ejemplo, otro sitio), los controles las siguen.
    T.ponerOpcion("incrustado", true); T.ponerOpcion("formato", "texto"); T.ponerOpcion("tecla", "ninguna")
    out.fuera = {t.incrustado.marcada, t.formato.texto:GetText(), t.tecla.texto:GetText()}
    -- La explicación de cada uno sale en el tooltip, con su nombre de título.
    out.ayudas = {ayuda(t.general.si), ayuda(t.general.no), ayuda(t.incrustado), ayuda(t.formato), ayuda(t.tecla)}
    out.dinero = SnetForever.Tema.dineroPlano(3451267)
    return out
  end)()`);
  assert.equal(r.titulo, 'Opciones generales');
  assert.deepEqual(r.textos, ['Activar las líneas de SnetForever', 'Sí', 'No', 'Insertarlas en el tooltip del juego',
    'Formato del precio', 'Enseñarlo con una tecla']);
  assert.equal(r.dinero, '345g 12s 67c');
  assert.deepEqual(r.opcFormato, [['texto', 'Texto (345g 12s 67c)'], ['iconos', 'Iconos']]);
  assert.deepEqual(r.opcTecla, [['ninguna', 'Ninguna (siempre)'], ['mayus', 'Mayús'], ['ctrl', 'Ctrl'], ['alt', 'Alt']]);
  assert.deepEqual(r.antes, [true, true, 'Texto (345g 12s 67c)', 'Ninguna (siempre)']);
  assert.deepEqual(r.insertar, [false, false]);
  assert.equal(r.elegidoFormato, true);
  assert.deepEqual(r.formato, ['iconos', 'Iconos']);
  assert.equal(r.elegidoTecla, true);
  assert.deepEqual(r.tecla, ['alt', 'Alt']);
  assert.deepEqual(r.activarNo, [false, false]);
  assert.deepEqual(r.activarSi, [true, true]);
  assert.deepEqual(r.fuera, [true, 'Texto (345g 12s 67c)', 'Ninguna (siempre)']);
  const [si, no, insertar, formato, tecla] = r.ayudas;
  assert.deepEqual(si, no, 'el «Sí» y el «No» dan la misma explicación');
  assert.equal(si[0], 'Activar las líneas de SnetForever');
  assert.match(si[1], /\/snet comercio tooltip/);
  assert.equal(insertar[0], 'Insertarlas en el tooltip del juego');
  assert.match(insertar[1], /aparte/);
  assert.equal(formato[0], 'Formato del precio');
  assert.match(formato[1], /monedas/);
  assert.equal(tecla[0], 'Enseñarlo con una tecla');
  assert.match(tecla[1], /enlace del chat/, 'dice que un enlace del chat las enseña siempre');
  for (const a of r.ayudas) assert.equal(a.length, 2, JSON.stringify(a));
  sinErrores(m);
});

test('el radio Activar y /snet comercio tooltip cambian el mismo ajuste y se siguen', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    local out = {}
    SlashCmdList.SNET("comercio tooltip")
    out.orden = {T.activo(), t.general.valor, t.lineas.grupo.snfApagado, t.incrustado.snfApagado}
    SlashCmdList.SNET("comercio tooltip")
    out.orden2 = {T.activo(), t.general.valor, t.lineas.grupo.snfApagado}
    t.general.no:Click("LeftButton")
    out.radio = {T.activo(), SnetForeverCuenta.comercio.tooltip}
    SlashCmdList.SNET("comercio tooltip")
    out.ordenTras = {T.activo(), t.general.valor}
    -- Pulsar el que ya está elegido no cambia nada.
    t.general.si:Click("LeftButton")
    out.otraVez = {T.activo(), t.general.valor}
    return out
  end)()`);
  assert.deepEqual(r.orden, [false, false, true, true]);
  assert.deepEqual(r.orden2, [true, true, false]);
  assert.deepEqual(r.radio, [false, false]);
  assert.deepEqual(r.ordenTras, [true, true]);
  assert.deepEqual(r.otraVez, [true, true]);
  sinErrores(m);
});

test('la lista va agrupada en el orden de TSM: cada grupo con su título y sus casillas', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    colocarContenido()
    local out = {esperado = {}, visto = {}, textos = {}, letras = {}, colores = {}, pasos = {}, izquierdas = {}}
    for _, g in ipairs(T.GRUPOS) do
      out.esperado[#out.esperado + 1] = "grupo:" .. g.clave
      for _, l in ipairs(g.lineas) do out.esperado[#out.esperado + 1] = "linea:" .. l.clave end
    end
    local izq = t.izquierda:GetLeft()
    local anterior
    for _, e in ipairs(t.orden) do
      out.visto[#out.visto + 1] = e.tipo .. ":" .. e.clave
      local fs = e.tipo == "grupo" and e.marco or e.marco.texto
      if e.tipo == "grupo" then
        local g
        for _, x in ipairs(T.GRUPOS) do if x.clave == e.clave then g = x end end
        out.textos[#out.textos + 1] = fs:GetText() == L.t(g.texto)
        out.letras[#out.letras + 1] = (fs:GetFont()):match("([^\\\\]+)%.ttf$")
        out.colores[#out.colores + 1] = {fs:GetTextColor()}
      elseif anterior and anterior.tipo == "linea" then
        out.pasos[#out.pasos + 1] = anterior.marco:GetTop() - e.marco:GetTop()
      end
      out.izquierdas[#out.izquierdas + 1] = math.abs(e.marco:GetLeft() - izq) < 0.01
      if anterior then out.bajando = (out.bajando ~= false) and e.marco:GetTop() < anterior.marco:GetTop() end
      anterior = e
    end
    out.lineaTexto = {t.lineas.grupo.texto:GetText(), t.lineas.inventario.texto:GetText(), t.lineas.ids.texto:GetText()}
    -- Las columnas: la izquierda, la mitad del ancho menos 10 px; la derecha, para el ejemplo de la Task 40.
    local ancho = t.regla:GetRight() - t.regla:GetLeft()
    out.columnas = {t.izquierda:GetRight() - t.izquierda:GetLeft(), ancho / 2 - 10,
      t.derecha:GetLeft() - (t.regla:GetLeft() + ancho / 2), t.derecha:GetRight() - t.regla:GetRight(),
      math.abs(t.derecha:GetTop() - t.izquierda:GetTop()) < 0.01}
    -- La lista de personajes va debajo de las líneas, en la columna izquierda.
    out.personajes = {t.tituloPersonajes:GetTop() < anterior.marco:GetBottom(),
      math.abs(t.tituloPersonajes:GetLeft() - izq) < 0.01, t.tituloPersonajes:GetRight() <= t.izquierda:GetRight() + 0.01}
    -- «Líneas del tooltip» va debajo de las opciones de arriba y encima de las columnas.
    out.tituloLineas = {t.tituloLineas.titulo:GetText(), t.tituloLineas:GetTop() < t.formato:GetBottom(),
      t.tituloLineas:GetBottom() >= t.izquierda:GetTop() - 0.01}
    return out
  end)()`);
  assert.deepEqual(r.visto, r.esperado, 'los grupos de Tooltip.GRUPOS, en su orden, cada uno con sus líneas');
  assert.ok(r.textos.length === 10 && r.textos.every(Boolean), 'cada grupo con su título');
  assert.ok(r.letras.every((x) => x === 'BarlowSemiCondensed-SemiBold'), `títulos en letra etiqueta: ${r.letras}`);
  const blanco = m.lua('SnetForever.Tema.hex("texto")');
  assert.ok(r.colores.every((c) => aHex(c) === blanco), 'títulos en blanco');
  assert.ok(r.pasos.length > 20 && r.pasos.every((p) => Math.abs(p - 23) < 0.01), `una casilla cada 23 px: ${r.pasos}`);
  assert.ok(r.izquierdas.every(Boolean), 'todo pegado a la izquierda de la columna');
  assert.equal(r.bajando, true, 'cada cosa debajo de la anterior');
  assert.deepEqual(r.lineaTexto, ['Grupo', 'Inventario completo', 'ItemID e IconID']);
  assert.ok(Math.abs(r.columnas[0] - r.columnas[1]) < 0.01, `izquierda de la mitad menos 10: ${r.columnas}`);
  assert.ok(Math.abs(r.columnas[2] - 10) < 0.01 && Math.abs(r.columnas[3]) < 0.01 && r.columnas[4], `derecha: ${r.columnas}`);
  assert.deepEqual(r.personajes, [true, true, true]);
  assert.deepEqual(r.tituloLineas, ['Líneas del tooltip', true, true]);
  sinErrores(m);
});

test('las líneas «llega con…» se ven apagadas con su motivo y pulsarlas no guarda nada', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    SnetForever.Guardado.preparar()
    local out = {llegan = {}, textos = {}}
    local apagado = SnetForever.Tema.hex("apagado")
    local function hex(fs)
      local r, g, b = fs:GetTextColor()
      return string.format("%02x%02x%02x", math.floor(r * 255 + 0.5), math.floor(g * 255 + 0.5), math.floor(b * 255 + 0.5))
    end
    local antes = SnetForeverCuenta.comercio.tooltipLineas
    for _, g in ipairs(T.GRUPOS) do
      for _, l in ipairs(g.lineas) do
        if l.llega then
          local c = t.lineas[l.clave]
          c:Click("LeftButton")
          out.llegan[#out.llegan + 1] = {c.snfApagado, c.marcada, hex(c.texto) == apagado, T.linea(l.clave)}
          out.textos[l.clave] = c.texto:GetText()
        end
      end
    end
    out.nada = SnetForeverCuenta.comercio.tooltipLineas == antes and (antes == nil or next(antes) == nil)
    -- Apagar y encender Activar no las enciende.
    t.general.no:Click("LeftButton")
    t.general.si:Click("LeftButton")
    out.siguen = {t.lineas.contaCompras.snfApagado, t.lineas.historico.snfApagado, t.lineas.grupo.snfApagado}
    return out
  end)()`);
  assert.equal(r.llegan.length, 15);
  for (const x of r.llegan) assert.deepEqual(x, [true, false, true, false]);
  assert.equal(r.nada, true, 'no se guarda nada');
  assert.equal(r.textos.contaCompras, 'Compras (llega con Contabilidad)');
  assert.equal(r.textos.historico, 'Precio histórico (llega más adelante)');
  assert.equal(r.textos.cantidadPublicar, 'Cantidad que se publica (llega con Vender)');
  assert.equal(r.textos.costeDetallado, 'Coste detallado (llega con Fabricación)');
  assert.deepEqual(r.siguen, [true, true, false]);
  sinErrores(m);
});

test('marcar Inventario simple desmarca el completo y al revés; lo mismo con el valor de mercado', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    local c = t.lineas
    local out = {}
    c.inventarioSimple:Click("LeftButton")
    out.simple = {c.inventarioSimple.marcada, c.inventario.marcada, T.linea("inventarioSimple"), T.linea("inventario")}
    c.inventario:Click("LeftButton")
    out.completo = {c.inventarioSimple.marcada, c.inventario.marcada, T.linea("inventarioSimple"), T.linea("inventario")}
    c.mercadoSolo:Click("LeftButton")
    out.mercadoSolo = {c.mercadoSolo.marcada, c.mercado.marcada}
    c.mercado:Click("LeftButton")
    out.mercado = {c.mercadoSolo.marcada, c.mercado.marcada}
    -- Desmarcar una no marca la otra.
    c.mercado:Click("LeftButton")
    out.ninguna = {c.mercadoSolo.marcada, c.mercado.marcada}
    return out
  end)()`);
  assert.deepEqual(r.simple, [true, false, true, false]);
  assert.deepEqual(r.completo, [false, true, false, true]);
  assert.deepEqual(r.mercadoSolo, [true, false]);
  assert.deepEqual(r.mercado, [false, true]);
  assert.deepEqual(r.ninguna, [false, false]);
  sinErrores(m);
});

test('una fuente propia nueva sale en Valores al volver a la página', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    local function fuentes()
      local v = {}
      for _, e in ipairs(t.orden) do
        if e.tipo == "fuente" then v[#v + 1] = {e.clave, e.marco.texto:GetText(), e.marco:IsShown()} end
      end
      return v
    end
    local function detras()
      for i, e in ipairs(t.orden) do
        if e.tipo == "fuente" then return t.orden[i - 1].clave end
      end
    end
    local out = {antes = fuentes()}
    assert(SnetForever.Formulas.ponerFuente("minprice", "vendorsell"))
    out.sinVolver = fuentes()
    -- Volver a la página: otro apartado y de vuelta.
    A.elegir("fuentes"); A.elegir("tooltip")
    out.vuelta = fuentes()
    out.detras = detras()
    -- O cerrar la ventana y abrirla otra vez.
    assert(SnetForever.Formulas.ponerFuente("barato", "vendorsell / 2"))
    SnetForever.Principal.abrir("dashboard"); SnetForever.Principal.abrir("ajustes")
    out.otraVez = fuentes()
    -- Su casilla la enciende y la apaga.
    local c
    for _, e in ipairs(t.orden) do if e.clave == "fuente:minprice" then c = e.marco end end
    out.marcadaAntes = c.marcada
    c:Click("LeftButton")
    out.encendida = {c.marcada, T.linea("fuente:minprice")}
    -- Con una fuente menos, su casilla se va (se esconde: las casillas se reutilizan).
    SnetForever.Formulas.quitarFuente("barato")
    A.elegir("fuentes"); A.elegir("tooltip")
    out.menos = fuentes()
    local escondidas = 0
    for _, f in ipairs(t.fuentes) do if not f:IsShown() then escondidas = escondidas + 1 end end
    out.escondidas = escondidas
    return out
  end)()`);
  assert.deepEqual(r.antes, []);
  assert.deepEqual(r.sinVolver, [], 'se rehacen al volver a la página');
  assert.deepEqual(r.vuelta, [['fuente:minprice', 'Fuente propia (minprice)', true]]);
  assert.equal(r.detras, 'vendedor', 'dentro de Valores, detrás del precio de venta al vendedor');
  assert.deepEqual(r.otraVez, [['fuente:barato', 'Fuente propia (barato)', true], ['fuente:minprice', 'Fuente propia (minprice)', true]]);
  assert.equal(r.marcadaAntes, false);
  assert.deepEqual(r.encendida, [true, true]);
  assert.deepEqual(r.menos, [['fuente:minprice', 'Fuente propia (minprice)', true]]);
  assert.equal(r.escondidas, 1);
  sinErrores(m);
});

test('quitar una fuente propia encendida apaga su línea del tooltip (no borra nada) y una apagada no deja nada guardado', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    local Fo = SnetForever.Formulas
    assert(Fo.ponerFuente("minprice", "vendorsell"))
    assert(Fo.ponerFuente("otra", "vendorsell * 2"))
    assert(T.ponerLinea("fuente:minprice", true))
    A.elegir("fuentes")
    local function quitar(nombre)
      for _, f in ipairs(A.fuentes.filas) do
        if f:IsShown() and f.fuente == nombre then
          f.quitar:Click("LeftButton")
          SnetForeverAjustesConfirmar.botonAceptar:Click("LeftButton")
          return true
        end
      end
    end
    local out = {}
    out.quitada = quitar("minprice")
    local g = SnetForeverCuenta.comercio.tooltipLineas
    out.guardado = {g["fuente:minprice"], T.linea("fuente:minprice")}
    out.otra = quitar("otra")
    out.otraGuardada = g["fuente:otra"]
    A.elegir("tooltip")
    local hay = 0
    for _, e in ipairs(t.orden) do if e.tipo == "fuente" then hay = hay + 1 end end
    out.casillas = hay
    return out
  end)()`);
  assert.equal(r.quitada, true);
  assert.deepEqual(r.guardado, [false, false], 'la clave se queda, en false: el enganche ya no la compila');
  assert.equal(r.otra, true);
  assert.equal(r.otraGuardada, undefined, 'una fuente que no salía no deja ninguna clave');
  assert.equal(r.casillas, 0);
  sinErrores(m);
});

test('con Activar en No, todo lo de debajo sale apagado y no cambia', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    assert(SnetForever.Formulas.ponerFuente("minprice", "vendorsell"))
    A.refrescar()
    t.general.no:Click("LeftButton")
    local out = {apagados = {}}
    local controles = {t.incrustado, t.formato, t.tecla}
    for _, e in ipairs(t.orden) do
      if e.tipo ~= "grupo" then controles[#controles + 1] = e.marco end
    end
    for _, c in ipairs(controles) do out.apagados[#out.apagados + 1] = c.snfApagado == true end
    -- Pulsar no cambia nada.
    local lineas = {}
    for _, e in ipairs(t.orden) do
      if e.tipo ~= "grupo" then lineas[e.clave] = T.linea(e.clave); e.marco:Click("LeftButton") end
    end
    local cambia = {}
    for clave, v in pairs(lineas) do if T.linea(clave) ~= v then cambia[#cambia + 1] = clave end end
    out.cambia = cambia
    t.incrustado:Click("LeftButton")
    t.formato:Click("LeftButton")
    local lista = rawget(_G, "SnetForeverDesplegableLista")
    out.lista = lista ~= nil and lista:IsShown()
    out.opciones = {T.opcion("incrustado"), T.opcion("formato"), T.opcion("tecla")}
    -- Con Activar en Sí, se encienden otra vez (menos las «llega con…»).
    t.general.si:Click("LeftButton")
    out.encendidos = {t.incrustado.snfApagado, t.formato.snfApagado, t.tecla.snfApagado, t.lineas.grupo.snfApagado,
      t.fuentes[1].snfApagado, t.lineas.coste.snfApagado}
    return out
  end)()`);
  assert.ok(r.apagados.length > 30 && r.apagados.every(Boolean), `todo apagado: ${r.apagados}`);
  assert.deepEqual(r.cambia, []);
  assert.equal(r.lista, false, 'el desplegable apagado no se abre');
  assert.deepEqual(r.opciones, [true, 'texto', 'ninguna']);
  assert.deepEqual(r.encendidos, [false, false, false, false, false, true]);
  sinErrores(m);
});

// Anchos de letra de verdad (los de test/subasta-ventana.test.js), más un 3 %.
const FACTOR_LETRA = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };
const letraReal = (m, advances = FACTOR_LETRA) => m.lua(`BANCO.letraReal = {${Object.entries(advances).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);

for (const [idioma, cliente] of [['es', 'esES'], ['en', 'enUS']]) {
  test(`todo cabe en su columna en ${idioma} (margen 0,85) con la ventana al mínimo y a 1424 de ancho`, necesitaComercio, () => {
    for (const [ancho, alto] of [[1000, 600], [1424, 805]]) {
      const m = maquina({ jugador: { ...JUGADOR, idioma: cliente } });
      letraReal(m);
      const r = m.lua(`(function()
        SnetForever.Principal.abrir("ajustes")
        SnetForever.Principal.marco():SetSize(${ancho}, ${alto})
        assert(SnetForever.Formulas.ponerFuente("minprice", "vendorsell"))
        ${TOOLTIP}
        colocarContenido()
        local Tema = SnetForever.Tema
        local malos, vistos = {}, 0
        local function cabe(nombre, medido, disponible)
          vistos = vistos + 1
          if medido > disponible * 0.85 then
            malos[#malos + 1] = nombre .. ": " .. math.floor(medido) .. "/" .. math.floor(disponible * 0.85)
          end
        end
        local function ancho(f) return f:GetRight() - f:GetLeft() end
        local columna = t.izquierda
        local function finDe(c) return c:GetLeft() - columna:GetLeft() + 19 + Tema.anchoTexto(c.texto) end
        -- Las líneas, los títulos de los grupos y el de los personajes, en la columna izquierda.
        for _, e in ipairs(t.orden) do
          if e.tipo == "grupo" then
            cabe("grupo " .. e.clave, Tema.anchoTexto(e.marco), ancho(columna))
          else
            cabe(e.tipo .. " " .. e.clave, finDe(e.marco), ancho(columna))
          end
        end
        cabe("personajes", Tema.anchoTexto(t.tituloPersonajes.titulo), ancho(columna))
        -- Arriba: los títulos, la etiqueta y la casilla a todo el ancho; cada desplegable, en su media columna.
        local todo = t.regla
        cabe("título", Tema.anchoTexto(t.titulo.titulo), ancho(todo))
        cabe("título líneas", Tema.anchoTexto(t.tituloLineas.titulo), ancho(todo))
        cabe("activar", Tema.anchoTexto(t.etiquetaActivar.texto), ancho(todo))
        cabe("radio", ancho(t.general), ancho(todo))
        cabe("insertar", 19 + Tema.anchoTexto(t.incrustado.texto), ancho(todo))
        for _, par in ipairs({{t.etiquetaFormato, t.formato}, {t.etiquetaTecla, t.tecla}}) do
          local etiqueta, d = par[1], par[2]
          cabe("etiqueta " .. etiqueta.texto:GetText(), Tema.anchoTexto(etiqueta.texto), ancho(d))
          local antes = d.texto:GetText()
          for _, o in ipairs(d.snfOpciones.opciones) do
            d.texto:SetText(o[2])
            cabe("opción " .. tostring(o[1]), Tema.anchoTexto(d.texto), ancho(d) - 28)
          end
          d.texto:SetText(antes)
          -- Cada desplegable, en su media columna (sin margen: es una medida, no un texto).
          if math.abs(ancho(d) - (ancho(todo) / 2 - 10)) > 0.01 then malos[#malos + 1] = "media columna " .. ancho(d) end
          if d:GetLeft() < todo:GetLeft() - 0.01 or d:GetRight() > todo:GetRight() + 0.01 then malos[#malos + 1] = "fuera" end
        end
        return {malos = malos, vistos = vistos, columna = ancho(columna)}
      end)()`);
      assert.deepEqual(r.malos, [], `${idioma} a ${ancho}×${alto} (columna de ${r.columna})`);
      assert.ok(r.vistos > 50, `se mira todo: ${r.vistos}`);
      sinErrores(m);
    }
  });
}

// F2 (fallo en el juego): el nombre entero («Nombre Apellido») y, si sus datos vienen de TSM, de cuándo; debajo, el botón
// «Importar inventario de TSM». Todo cabe en la columna, con la letra real, en es y en, a 1000 y a 1424. Nombres inventados.
for (const [idioma, cliente] of [['es', 'esES'], ['en', 'enUS']]) {
  test(`Personajes del inventario enseña el nombre con apellido y el botón Importar inventario de TSM (${idioma})`, necesitaComercio, () => {
    for (const [ancho, alto] of [[1000, 600], [1424, 805]]) {
      const m = maquina({ jugador: { ...JUGADOR, idioma: cliente, nombre: 'Nombre', apellido: 'Apellido' } });
      letraReal(m);
      const hora = m.lua('GetServerTime() - 3 * 86400');
      m.lua(`SnetForever.Guardado.preparar()
        SnetForeverCuenta.comercio.inventario = {v = 2, pj = {
          ["Nombre Apellido-Normal"] = {nombre = "Nombre Apellido", reino = "Normal", clase = "MAGE", bolsas = {}},
          ["Alter Inventado-Normal"] = {nombre = "Alter Inventado", reino = "Normal", clase = "PRIEST", bolsas = {}, banco = {},
            tsm = {bolsas = ${hora}, banco = ${hora}}},
        }}
        SnetForever.InventarioCuenta.olvidarOrden()`);
      const r = m.lua(`(function()
        SnetForever.Principal.abrir("ajustes")
        SnetForever.Principal.marco():SetSize(${ancho}, ${alto})
        ${TOOLTIP}
        colocarContenido()
        local Tema = SnetForever.Tema
        local function w(f) return f:GetRight() - f:GetLeft() end
        local col = t.izquierda
        local filas, malos = {}, {}
        for i, f in ipairs(t.personajes) do
          if f:IsShown() then
            filas[#filas + 1] = f.texto:GetText()
            local fin = f.quitar:GetRight() - col:GetLeft()
            if fin > w(col) * 0.85 then malos[#malos + 1] = f.texto:GetText() .. ": " .. math.floor(fin) end
          end
        end
        local b = t.importarInventario
        local ultima = t.personajes[2]
        if (b:GetRight() - col:GetLeft()) > w(col) * 0.85 then malos[#malos + 1] = "botón " .. math.floor(b:GetRight() - col:GetLeft()) end
        if Tema.anchoTexto(b.texto) + 16 > b:GetWidth() + 0.01 then malos[#malos + 1] = "texto del botón" end
        return {filas = filas, malos = malos, boton = b.texto:GetText(), visible = b:IsShown(),
          debajo = b:GetTop() <= ultima:GetBottom() + 0.01, alto = col:GetHeight() >= col:GetTop() - b:GetBottom() - 0.01}
      end)()`);
      const fecha = m.lua(`date("%d/%m", ${hora})`);
      const tsm = idioma === 'es' ? `(de TSM, a ${fecha})` : `(TSM, ${fecha})`;
      assert.deepEqual(r.filas, ['Nombre Apellido - Normal', `Alter Inventado - Normal ${tsm}`], `${idioma} a ${ancho}`);
      assert.equal(r.boton, idioma === 'es' ? 'Importar inventario de TSM' : 'Import TSM inventory');
      assert.deepEqual([r.visible, r.debajo, r.alto], [true, true, true], `${idioma} a ${ancho}: debajo de la lista y dentro de la columna`);
      assert.deepEqual(r.malos, [], `${idioma} a ${ancho}`);
      sinErrores(m);
    }
  });
}

test('cada texto nuevo está en es y en, y cambiar de idioma los repinta', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    assert(SnetForever.Formulas.ponerFuente("minprice", "vendorsell"))
    A.refrescar()
    local faltan, claves = {}, {}
    for _, k in ipairs(A.clavesDeTexto()) do
      claves[k] = true
      if not L.tablas.es[k] or not L.tablas.en[k] then faltan[#faltan + 1] = k end
    end
    -- Las de la página del tooltip están todas en la lista.
    local fuera = {}
    local function mira(k) if k and not claves[k] then fuera[#fuera + 1] = k end end
    for _, o in ipairs(T.OPCIONES) do mira(o.texto); for _, v in ipairs(o.valores) do mira(v.texto) end end
    for _, g in ipairs(T.GRUPOS) do
      mira(g.texto)
      for _, l in ipairs(g.lineas) do mira(l.texto); mira(l.llega) end
    end
    mira("COMERCIO_TT_OPC_ACTIVAR"); mira("COMERCIO_TT_AJ_FUENTE")
    local function leer()
      return {t.titulo.titulo:GetText(), t.etiquetaActivar.texto:GetText(), t.general.si.texto:GetText(),
        t.general.no.texto:GetText(), t.incrustado.texto:GetText(), t.etiquetaFormato.texto:GetText(),
        t.formato.texto:GetText(), t.etiquetaTecla.texto:GetText(), t.tecla.texto:GetText(), t.tituloLineas.titulo:GetText(),
        t.grupos.gruposOps:GetText(), t.lineas.grupo.texto:GetText(), t.lineas.contaVentas.texto:GetText(),
        t.fuentes[1].texto:GetText(), t.tituloPersonajes.titulo:GetText()}
    end
    local out = {faltan = faltan, fuera = fuera, es = leer()}
    SnetForever.Ajustes.set("idioma", "en")
    out.en = leer()
    out.ayudaEn = ayuda(t.tecla)
    out.ancho = {t.incrustado:GetWidth(), 11 + 8 + math.ceil(t.incrustado.texto:GetStringWidth())}
    SnetForever.Ajustes.set("idioma", "es")
    out.vuelta = leer()
    return out
  end)()`);
  assert.deepEqual(r.faltan, []);
  assert.deepEqual(r.fuera, []);
  assert.deepEqual(r.es, ['Opciones generales', 'Activar las líneas de SnetForever', 'Sí', 'No', 'Insertarlas en el tooltip del juego',
    'Formato del precio', 'Texto (345g 12s 67c)', 'Enseñarlo con una tecla', 'Ninguna (siempre)', 'Líneas del tooltip',
    'Grupos y operaciones', 'Grupo', 'Ventas (llega con Contabilidad)', 'Fuente propia (minprice)', 'Personajes del inventario']);
  assert.deepEqual(r.en, ['General options', 'Turn on the SnetForever lines', 'Yes', 'No', 'Put them inside the game tooltip',
    'Price format', 'Text (345g 12s 67c)', 'Show it with a key', 'None (always)', 'Tooltip lines',
    'Groups and operations', 'Group', 'Sales (coming with Accounting)', 'Custom source (minprice)', 'Inventory characters']);
  assert.equal(r.ayudaEn[0], 'Show it with a key');
  assert.match(r.ayudaEn[1], /chat link/);
  assert.equal(r.ancho[0], r.ancho[1], 'la casilla mide su texto nuevo');
  assert.deepEqual(r.vuelta, r.es);
  sinErrores(m);
});

test('nada parpadea: ni OnUpdate ni animaciones en Ajustes › Tooltip', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    local animaciones = 0
    local crear = BANCO.clases.Region.metodos.CreateAnimationGroup
    BANCO.clases.Region.metodos.CreateAnimationGroup = function(...)
      animaciones = animaciones + 1
      if crear then return crear(...) end
    end
    ${TOOLTIP}
    assert(SnetForever.Formulas.ponerFuente("minprice", "vendorsell"))
    A.refrescar()
    -- Se usa todo: el radio, la casilla, los desplegables, las líneas y el idioma.
    t.general.no:Click("LeftButton"); t.general.si:Click("LeftButton")
    t.incrustado:Click("LeftButton"); t.incrustado:Click("LeftButton")
    elegir(t.formato, "iconos"); elegir(t.tecla, "mayus")
    for _, e in ipairs(t.orden) do if e.tipo ~= "grupo" then e.marco:Click("LeftButton") end end
    ayuda(t.tecla)
    SnetForever.Ajustes.set("idioma", "en"); SnetForever.Ajustes.set("idioma", "es")
    local malos = {}
    local function mira(f, nombre)
      if f.GetScript and f:GetScript("OnUpdate") then malos[#malos + 1] = nombre end
      if f.GetChildren then
        for i, h in ipairs({f:GetChildren()}) do mira(h, nombre .. "." .. i) end
      end
    end
    mira(A.apartados.tooltip, "tooltip")
    BANCO.clases.Region.metodos.CreateAnimationGroup = crear
    return {malos = malos, animaciones = animaciones}
  end)()`);
  assert.deepEqual(r.malos, []);
  assert.equal(r.animaciones, 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Task 40: el «Tooltip de ejemplo»
// ---------------------------------------------------------------------------------------------------

// Lee las filas del ejemplo: {izq, der, tipo, apagada, ci (color de la izquierda en hex), cd (el de la derecha), visible}.
const LEER_EJEMPLO = `
  local function hexDe(fs)
    local r, g, b = fs:GetTextColor()
    return string.format("%02x%02x%02x", math.floor(r * 255 + 0.5), math.floor(g * 255 + 0.5), math.floor(b * 255 + 0.5))
  end
  local function leerEjemplo()
    local ej, v = t.ejemplo, {}
    for i = 1, ej.n do
      local f = ej.filas[i]
      v[i] = {izq = f.izq:GetText(), der = f.der:IsShown() and f.der:GetText() or "-", tipo = f.tipo, apagada = f.apagada,
        ci = hexDe(f.izq), cd = hexDe(f.der), visible = f.izq:IsShown()}
    end
    return v
  end
  local function filaEj(izq)
    for _, f in ipairs(leerEjemplo()) do if f.izq == izq then return f end end
  end`;
const sinCodigos = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '').replace(/\|T[^|]*\|t/g, '^');
const conColor = (s) => /\|c[0-9a-fA-F]{8}/.test(String(s ?? ''));
const T_GENERAL = 'SnetForever · Información general';
const T_SUBASTA = 'SnetForever · Subasta';
const T_OPS = 'SnetForever · Operaciones';
// F5: el ejemplo es una mercancía (2447, una hierba): los nombres de las mercancías y el número entero con separador.
const SALEN = 'Salidas locales/día (ventas y retiradas, aprox.)';
const PARTE = 'Parte que sale (vendida o retirada, aprox.)';
const OPS6 = ['Operación de artesanía', 'Operación de correo', 'Operación de compras', 'Operación de sniper',
  'Operación de vendedor', 'Operación de almacén'];
// Lo que dice el ejemplo con los ajustes por defecto y una fuente propia «minprice» (apagada): [izq, der, apagada].
const EJEMPLO_DEFECTO = [
  [T_GENERAL, '-', false],
  ['Grupo', 'Ejemplo › Hierbas', false],
  ['Operación de subasta', '#Ejemplo', false],
  ...OPS6.map((o) => [o, '#Ejemplo', true]),
  ['Precio de venta al vendedor', '8c', false],
  ['Fuente propia «minprice»', '10c', true],
  ['Inventario', '23 en bolsas y banco', false],
  ['  Personaje de ejemplo', '22 (5 Bolsas, 17 Banco)', false],
  // F2b: el banco de cuenta, su fila sola (22 + 1 = 23).
  ['  Banco de cuenta', '1', false],
  // F2: lo que el total no cuenta, como en el tooltip de verdad.
  ['Sin contar: 1 banco, 1 buzón y los personajes sin entrar', '-', false],
  [T_SUBASTA, '-', false],
  ['A la venta', '400 unidades, 37 subastas (app, hace 17 min)', false],
  ['Compra mínima', '9g 50s 00c', false],
  ['Valor de mercado', '[^12%] 10g 00s 00c', false],
  [SALEN, 'hasta 2.054', false],
  [PARTE, '61 %', false],
  ['El precio cumple tu regla · rotación sin confirmar (a 9g 50s 00c)', '-', false],
  [T_OPS, '-', true],
  ['Mínimo / normal / máximo', '5g 00s 00c / 12g 00s 00c / 50g 00s 00c', true],
  ['Máximo a publicar', '40', true],
  ['Precio máximo (Compras)', '8g 00s 00c', true],
  ['Precio máximo (Sniper)', '6g 00s 00c', true],
  ['ItemID', '2447', true],
  ['IconID', '133939', true],
];

test('el ejemplo enseña todas las líneas con datos: las encendidas en su color y las apagadas en gris', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    assert(SnetForever.Formulas.ponerFuente("minprice", "vendorsell"))
    ${TOOLTIP}
    ${LEER_EJEMPLO}
    local Tema = SnetForever.Tema
    local ej = t.ejemplo
    return {filas = leerEjemplo(), titulo = ej.titulo:GetText(), tituloColor = hexDe(ej.titulo),
      tituloLetra = (ej.titulo:GetFont()):match("([^\\\\]+)%.ttf$"),
      apagado = Tema.hex("apagado"), amarillo = T.hex("amarillo"), gris = T.hex("gris"), blanco = T.hex("blanco"),
      verde = T.hex("verde"), texto = Tema.hex("texto"),
      fondo = ej.caja.snfTema ~= nil and ej.caja.snfTema.fondoMetido ~= nil,
      alto = ej.caja:GetHeight(), n = ej.n, fila = ej.FILA, margen = ej.MARGEN}
  end)()`);
  assert.equal(r.titulo, 'Tooltip de ejemplo');
  assert.equal(r.tituloColor, r.texto, 'el título en blanco, como los de los grupos');
  assert.equal(r.tituloLetra, 'BarlowSemiCondensed-SemiBold');
  assert.deepEqual(r.filas.map((f) => [sinCodigos(f.izq), sinCodigos(f.der), f.apagada]), EJEMPLO_DEFECTO);
  assert.ok(r.filas.every((f) => f.visible));
  for (const f of r.filas) {
    const que = `${sinCodigos(f.izq)}: ${JSON.stringify(f)}`;
    if (f.apagada) {
      // Apagada: entera en `apagado`, sin ningún código de color dentro (el dinero y la flecha, también grises).
      assert.equal(f.ci, r.apagado, que);
      if (f.der !== '-') assert.equal(f.cd, r.apagado, que);
      assert.ok(!conColor(f.izq) && !conColor(f.der), que);
      for (const tex of String(f.der).match(/\|T[^|]*\|t/g) || []) assert.match(tex, /:145:152:151\|t$/, que);
    } else if (f.tipo === 'titulo') {
      assert.equal(f.ci, r.amarillo, que);
    } else if (f.izq.startsWith('  ')) {
      assert.equal(f.ci, r.blanco, que); // el personaje de ejemplo no tiene clase: blanco
    } else if (f.tipo === 'linea') {
      // F9p: el aprobado de una mercancía, en amarillo; F2: la frase de lo que no cuenta el inventario, en gris.
      assert.equal(f.ci, sinCodigos(f.izq).startsWith('Sin contar') ? r.gris : r.amarillo, que);
    } else {
      assert.equal(f.ci, r.gris, que);
      assert.equal(f.cd, r.blanco, que);
    }
  }
  // Las encendidas llevan sus colores de siempre: el dinero con los del tema y la flecha en verde.
  const venta = r.filas.find((f) => sinCodigos(f.izq) === 'Precio de venta al vendedor');
  assert.ok(conColor(venta.der), venta.der);
  const mercado = r.filas.find((f) => sinCodigos(f.izq) === 'Valor de mercado');
  assert.ok(conColor(mercado.der) && /\|T[^|]*:64:230:64\|t/.test(mercado.der), mercado.der);
  // La caja: fondo hundido con borde, filas de 16 px y el alto según las líneas.
  assert.equal(r.fondo, true, 'Tema.panel con borde');
  assert.equal(r.fila, 16);
  assert.ok(Math.abs(r.alto - (r.n * 16 + 2 * r.margen)) < 0.01, `alto ${r.alto} con ${r.n} filas`);
  sinErrores(m);
});

test('desmarcar una línea la pone gris en el ejemplo al momento y marcarla la vuelve a su color', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    assert(SnetForever.Formulas.ponerFuente("minprice", "vendorsell"))
    ${TOOLTIP}
    ${LEER_EJEMPLO}
    local ej = t.ejemplo
    local out = {}
    local antes = ej.repintados
    t.lineas.grupo:Click("LeftButton")
    out.grupoNo = {filaEj("Grupo").apagada, filaEj("Grupo").ci, ej.repintados - antes}
    t.lineas.grupo:Click("LeftButton")
    out.grupoSi = {filaEj("Grupo").apagada, filaEj("Grupo").ci, ej.repintados - antes}
    -- Una fuente propia: marcarla la enciende, con el dinero en sus colores.
    local c
    for _, e in ipairs(t.orden) do if e.clave == "fuente:minprice" then c = e.marco end end
    c:Click("LeftButton")
    local f = filaEj("Fuente propia «minprice»")
    out.fuente = {f.apagada, f.ci, f.cd, f.der:find("|c", 1, true) ~= nil}
    -- Encender una de «Operaciones» enciende también su título.
    t.lineas.maximoPublicar:Click("LeftButton")
    out.ops = {filaEj("SnetForever · Operaciones").apagada, filaEj("SnetForever · Operaciones").ci, filaEj("Máximo a publicar").apagada}
    -- La pareja: marcar «Inventario simple» deja el total encendido y el personaje en gris.
    t.lineas.inventarioSimple:Click("LeftButton")
    out.simple = {filaEj("Inventario").apagada, filaEj("  Personaje de ejemplo").apagada}
    -- «Valor de mercado» sin tendencia: la línea sale sin el corchete.
    t.lineas.mercadoSolo:Click("LeftButton")
    out.mercadoSolo = {filaEj("Valor de mercado").apagada, filaEj("Valor de mercado").der}
    t.lineas.mercadoSolo:Click("LeftButton") -- ninguna de las dos: gris, con la tendencia
    out.ninguno = {filaEj("Valor de mercado").apagada, filaEj("Valor de mercado").der:find("|T", 1, true) ~= nil}
    out.repintados = ej.repintados - antes
    out.apagado, out.gris, out.blanco, out.amarillo = SnetForever.Tema.hex("apagado"), T.hex("gris"), T.hex("blanco"), T.hex("amarillo")
    return out
  end)()`);
  assert.deepEqual(r.grupoNo, [true, r.apagado, 1], 'gris al momento, con un solo repintado');
  assert.deepEqual(r.grupoSi, [false, r.gris, 2]);
  assert.deepEqual(r.fuente, [false, r.gris, r.blanco, true]);
  assert.deepEqual(r.ops, [false, r.amarillo, false]);
  assert.deepEqual(r.simple, [false, true]);
  assert.equal(r.mercadoSolo[0], false);
  assert.equal(sinCodigos(r.mercadoSolo[1]), '10g 00s 00c');
  assert.deepEqual(r.ninguno, [true, true]);
  assert.equal(r.repintados, 7, 'un repintado por cada casilla pulsada');
  sinErrores(m);
});

test('formato iconos cambia el dinero del ejemplo; Activar en No lo pone todo gris', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    ${LEER_EJEMPLO}
    local ej = t.ejemplo
    local function der(izq) return filaEj(izq).der end
    local out = {texto = der("Precio de venta al vendedor")}
    local antes = ej.repintados
    elegir(t.formato, "iconos")
    out.iconos = {der("Precio de venta al vendedor"), der("Compra mínima"), ej.repintados - antes}
    elegir(t.formato, "texto")
    out.vuelta = der("Precio de venta al vendedor")
    -- La tecla no cambia el ejemplo.
    local sinTecla = leerEjemplo()
    elegir(t.tecla, "alt")
    out.tecla = {leerEjemplo(), sinTecla}
    -- Activar en No: todo gris, también los títulos y lo que estaba encendido.
    antes = ej.repintados
    t.general.no:Click("LeftButton")
    out.no = leerEjemplo()
    out.noRepintados = ej.repintados - antes
    t.general.si:Click("LeftButton")
    out.si = leerEjemplo()
    out.apagado = SnetForever.Tema.hex("apagado")
    return out
  end)()`);
  assert.equal(sinCodigos(r.texto), '8c');
  assert.match(r.iconos[0], /^8\|TInterface\\MoneyFrame\\UI-CopperIcon[^|]*\|t$/, 'las monedas del juego');
  assert.match(r.iconos[1], /UI-GoldIcon.*UI-SilverIcon.*UI-CopperIcon/);
  assert.equal(r.iconos[2], 1, 'un solo repintado');
  assert.equal(r.vuelta, r.texto);
  assert.deepEqual(r.tecla[0], r.tecla[1], 'la tecla no cambia el ejemplo');
  assert.ok(r.no.length > 25 && r.no.every((f) => f.apagada && f.ci === r.apagado), JSON.stringify(r.no.filter((f) => !f.apagada)));
  assert.ok(r.no.every((f) => !conColor(f.izq) && !conColor(f.der)), 'sin colores dentro');
  assert.equal(r.noRepintados, 1);
  assert.ok(r.si.find((f) => f.izq === 'Grupo').apagada === false);
  sinErrores(m);
});

// Una ranura de precios como la escribe la app (lo mismo que test/comercio-tooltip.test.js): el lino 2589 a 8g, 400
// unidades, mercado 10g que sube un 12 %, 37 subastas, sale el 42 % y 85 al día; F5: una mercancía (el 1 del final), como
// el ejemplo.
const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });
const AHORA = 1790000000; // GetServerTime() del banco al empezar
const H = Math.floor(AHORA / 3600);
function maquinaConPrecios() {
  const dir = mkdtempSync(join(tmpdir(), 'snf-ejemplo-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  const n = `SnetForever_P${String((H % 8) + 1).padStart(2, '0')}`;
  mkdirSync(join(dir, n), { recursive: true });
  writeFileSync(join(dir, n, `${n}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\np2.lua\n');
  writeFileSync(join(dir, n, 'p1.lua'), `if SNF_PRECIOS == nil or (SNF_PRECIOS.seq or 0) < 1 then
  SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114}, casas = {}, grupos = {}, nombres = {}}
end
`);
  writeFileSync(join(dir, n, 'p2.lua'), 'local P = SNF_PRECIOS; if not (P and P.seq == 1) then return end\n'
    + 'P.casas[114] = {[2589] = {80000, 400, 100000, 12, 0.42, 85, 0, 37, 1, 1}}\nP.completo = true\n');
  const m = nuevaMaquina({ addonsDir: dir, jugador: JUGADOR, pantalla: PANTALLA });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua('SnetForever.Precios.alAbrir()');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 250 });
  m.lua('BANCO.iconosItem[2589] = 132889');
  return m;
}

test('el ejemplo y el tooltip de verdad dicen las mismas líneas en el mismo orden', necesitaComercio, () => {
  const m = maquinaConPrecios();
  // El lino en un grupo con una operación de cada tipo y su regla de compra, y dos personajes propios que lo tienen.
  m.lua(`local A, O = SnetForever.Arbol, SnetForever.Operaciones
    local r1 = A.crear("", "Paños"); local r2 = A.crear(r1, "Lino")
    assert(A.poner("i:2589", r2))
    for _, tipo in ipairs({"subasta", "artesania", "correo", "compras", "sniper", "vendedor", "almacen"}) do
      assert(O.crear(tipo, "Op " .. tipo)); assert(O.ponerDeGrupo(r2, tipo, {"Op " .. tipo}))
    end
    assert(O.poner("subasta", "Op subasta", "precioMinimo", "1g"))
    assert(O.poner("compras", "Op compras", "precioMaximo", "9g"))
    assert(O.poner("sniper", "Op sniper", "precioMaximo", "7g"))
    assert(SnetForever.Reglas.poner("propio:" .. r2, {compraPct = 85}))
    assert(SnetForever.Formulas.ponerFuente("barato", "vendorsell * 2"))
    SnetForever.Guardado.preparar()
    local yo = UnitName("player") .. "-" .. GetRealmName()
    SnetForeverCuenta.comercio.inventario = {v = 1, pj = {
      [yo] = {nombre = UnitName("player"), reino = GetRealmName(), clase = "MAGE", bolsas = {[2589] = 5}, banco = {[2589] = 12}},
      ["Brok-Normal"] = {nombre = "Brok", reino = "Normal", clase = "WARRIOR", bolsas = {[2589] = 3}},
    }, bancoCuenta = {objetos = {[2589] = 4}, hora = 1}} -- F2b: el banco de cuenta, con su fila
    SnetForever.InventarioCuenta.olvidarOrden()
    BANCO.ponerObjeto(2589, 5)`);
  // Una fila de personaje vale lo mismo en los dos: el nombre no cuenta (el ejemplo nunca lleva uno de verdad). F1: la regla
  // dice con qué mínimo la ha mirado («(a 9g 50s 00c)»), que no es el mismo en el ejemplo: cuenta solo el veredicto.
  // F2: la frase de lo que no cuenta el inventario dice cuántos bancos y buzones faltan, que no son los mismos: cuenta solo que sale.
  // F2b: la fila del banco de cuenta es la misma en los dos (no es un personaje).
  const etiqueta = (izq) => (sinCodigos(izq) === '  Banco de cuenta' ? '  Banco de cuenta' : sinCodigos(izq).startsWith('  ') ? '  (personaje)'
    : sinCodigos(izq).replace(/ \(a [^)]*\)$/, '').replace(/^Sin contar: .*$/, 'Sin contar'));
  const comparar = (que) => {
    m.tooltipObjeto(2589);
    const deVerdad = m.detalleTooltip().slice(1).map((x) => etiqueta(x.izq));
    const ejemplo = m.lua(`(function()
      ${TOOLTIP}
      ${LEER_EJEMPLO}
      local v = {}
      for _, f in ipairs(leerEjemplo()) do if not f.apagada then v[#v + 1] = f.izq end end
      return v
    end)()`).map(etiqueta);
    // El tooltip de verdad tiene una fila por personaje (aquí dos); el ejemplo, una.
    const unaFila = deVerdad.filter((x, i) => !(x === '  (personaje)' && deVerdad[i - 1] === '  (personaje)'));
    assert.deepEqual(ejemplo, unaFila, `${que}\nejemplo: ${JSON.stringify(ejemplo)}\nde verdad: ${JSON.stringify(deVerdad)}`);
    return unaFila;
  };
  const defecto = comparar('por defecto');
  assert.ok(defecto.includes('El precio cumple tu regla · rotación sin confirmar') && defecto.includes('  (personaje)') && defecto.includes('Sin contar'), JSON.stringify(defecto));
  assert.ok(defecto.includes('  Banco de cuenta'), JSON.stringify(defecto));
  // Todas las líneas encendidas (en las parejas gana la última: inventario simple y mercado con tendencia), y la fuente.
  m.lua(`local T = SnetForever.TooltipComercio
    for _, l in ipairs(T.LINEAS) do T.ponerLinea(l.clave, true) end
    T.ponerLinea("fuente:barato", true)`);
  const todas = comparar('todas encendidas');
  for (const e of ['ItemID', 'IconID', 'Mínimo / normal / máximo', 'Precio máximo (Sniper)', 'Fuente propia «barato»', 'Operación de almacén']) {
    assert.ok(todas.includes(e), `${e}: ${JSON.stringify(todas)}`);
  }
  // Y unas pocas: solo el grupo y la compra mínima.
  m.lua(`local T = SnetForever.TooltipComercio
    for _, l in ipairs(T.LINEAS) do T.ponerLinea(l.clave, false) end
    T.ponerLinea("fuente:barato", false); T.ponerLinea("grupo", true); T.ponerLinea("minima", true)`);
  assert.deepEqual(comparar('pocas'), [T_GENERAL, 'Grupo', T_SUBASTA, 'Compra mínima']);
  sinErrores(m);
});

test('en una mercancía el tooltip dice hasta N, con separador de miles, y el ejemplo de Ajustes cuadra', necesitaComercio, () => {
  const m = maquinaConPrecios();
  m.lua(`local A = SnetForever.Arbol; local r = A.crear("", "Paños"); assert(A.poner("i:2589", r))
    assert(SnetForever.Reglas.poner("propio:" .. r, {compraPct = 85}))`);
  for (const [idioma, salen, hasta, ejemplo, veredicto] of [
    ['es', SALEN, 'hasta 85', 'hasta 2.054', 'El precio cumple tu regla · rotación sin confirmar'],
    ['en', 'Local departures/day (sales and removals, est.)', 'up to 85', 'up to 2,054', 'Price meets your rule · turnover unconfirmed'],
  ]) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    m.tooltipObjeto(2589);
    const real = m.detalleTooltip();
    assert.equal(sinCodigos(real.find((x) => sinCodigos(x.izq) === salen).der).replace(/ \(.*$/, ''), hasta, idioma);
    assert.ok(real.some((x) => sinCodigos(x.izq).startsWith(`${veredicto} (`)), JSON.stringify(real));
    const filas = m.lua(`(function()
      ${TOOLTIP}
      ${LEER_EJEMPLO}
      return leerEjemplo()
    end)()`);
    assert.equal(sinCodigos(filas.find((f) => sinCodigos(f.izq) === salen).der), ejemplo, idioma);
    assert.ok(filas.some((f) => sinCodigos(f.izq).startsWith(`${veredicto} (`)), JSON.stringify(filas.map((f) => f.izq)));
  }
  sinErrores(m);
});

test('el ejemplo no lleva ningún nombre de personaje: ni los propios guardados ni el del jugador; solo «Personaje de ejemplo»', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    SnetForever.Guardado.preparar()
    local yo = UnitName("player") .. "-" .. GetRealmName()
    SnetForeverCuenta.comercio.inventario = {v = 1, pj = {
      [yo] = {nombre = UnitName("player"), reino = GetRealmName(), clase = "MAGE", bolsas = {[2447] = 5}, banco = {[2447] = 17}},
      ["Brokenwing-Normal"] = {nombre = "Brokenwing", reino = "Normal", clase = "WARRIOR", bolsas = {[2447] = 3}},
    }}
    SnetForever.InventarioCuenta.olvidarOrden()
    ${TOOLTIP}
    ${LEER_EJEMPLO}
    local out = {yo = UnitName("player"), es = leerEjemplo()}
    SnetForever.Ajustes.set("idioma", "en")
    out.en = leerEjemplo()
    return out
  end)()`);
  for (const [idioma, filas, nombre, cuenta] of [['es', r.es, '  Personaje de ejemplo', '  Banco de cuenta'], ['en', r.en, '  Example character', '  Account bank']]) {
    const todo = JSON.stringify(filas);
    assert.ok(!todo.includes(r.yo), `${idioma}: sin el nombre del jugador`);
    assert.ok(!todo.includes('Brokenwing'), `${idioma}: sin los personajes guardados`);
    const personajes = filas.filter((f) => f.izq.startsWith('  '));
    assert.deepEqual(personajes.map((f) => f.izq), [nombre, cuenta], `${idioma}: el personaje de ejemplo y el banco de cuenta (F2b)`);
  }
  assert.equal(sinCodigos(r.en.find((f) => f.izq === 'Group').der), 'Example › Herbs');
  assert.equal(sinCodigos(r.en.find((f) => f.izq === 'Auction operation').der), '#Example');
  sinErrores(m);
});

test('las líneas «llega con…» no salen en el ejemplo', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    ${LEER_EJEMPLO}
    local llegan, filas = {}, {}
    for _, g in ipairs(T.GRUPOS) do
      for _, l in ipairs(g.lineas) do if l.llega then llegan[#llegan + 1] = L.t(l.texto) end end
    end
    for _, f in ipairs(leerEjemplo()) do filas[#filas + 1] = f.izq end
    return {llegan = llegan, filas = filas}
  end)()`);
  assert.equal(r.llegan.length, 15);
  for (const x of r.llegan) assert.ok(!r.filas.includes(x) && !r.filas.some((f) => f.includes('llega')), `${x}: ${JSON.stringify(r.filas)}`);
  sinErrores(m);
});

for (const [idioma, cliente] of [['es', 'esES'], ['en', 'enUS']]) {
  test(`el ejemplo cabe en su columna en ${idioma} (margen 0,85), y con la ventana estrecha pasa debajo de la lista`, necesitaComercio, () => {
    // A wider fallback face exercises stacking at the minimum supported window width.
    const wide = Object.fromEntries(Object.entries(FACTOR_LETRA).map(([face, width]) => [face, width * 1.35]));
    for (const [ancho, alto, advances, stacked] of [
      [1000, 600, FACTOR_LETRA, false], [1424, 805, FACTOR_LETRA, false], [1000, 600, wide, true],
    ]) {
      const m = maquina({ jugador: { ...JUGADOR, idioma: cliente } });
      letraReal(m, advances);
      const r = m.lua(`(function()
        SnetForever.Principal.abrir("ajustes")
        SnetForever.Principal.marco():SetSize(${ancho}, ${alto})
        assert(SnetForever.Formulas.ponerFuente("minprice", "vendorsell"))
        ${TOOLTIP}
        colocarContenido()
        local Tema = SnetForever.Tema
        local ej = t.ejemplo
        local malos, vistos = {}, 0
        local function w(f) return f:GetRight() - f:GetLeft() end
        local dentro = w(ej.caja) - 2 * ej.MARGEN
        for i = 1, ej.n do
          local f = ej.filas[i]
          vistos = vistos + 1
          local medido = Tema.anchoTexto(f.izq) + (f.der:IsShown() and (ej.HUECO + Tema.anchoTexto(f.der)) or 0)
          if medido > dentro * 0.85 then malos[#malos + 1] = f.izq:GetText() .. ": " .. math.floor(medido) .. "/" .. math.floor(dentro * 0.85) end
          if f.izq:GetLeft() < ej.caja:GetLeft() or (f.der:IsShown() and f.der:GetRight() > ej.caja:GetRight() + 0.01) then malos[#malos + 1] = "fuera " .. i end
        end
        if Tema.anchoTexto(ej.titulo) > w(ej.caja) * 0.85 then malos[#malos + 1] = "título" end
        local ultima = t.orden[#t.orden].marco
        local out = {malos = malos, vistos = vistos, abajo = ej.abajo, derecha = w(t.derecha), limite = ej.limite}
        if ej.abajo then
          -- Debajo de la lista: después de la última casilla, antes de los personajes, a todo el ancho.
          out.sitio = {ej.titulo:GetTop() < ultima:GetBottom(), ej.caja:GetBottom() > t.tituloPersonajes:GetTop(),
            math.abs(ej.caja:GetLeft() - t.izquierda:GetLeft()) < 0.01, math.abs(ej.caja:GetRight() - t.regla:GetRight()) < 0.01,
            t.contenido:GetHeight() >= t.regla:GetTop() - t.tituloPersonajes:GetBottom()}
        else
          -- Al lado: en la columna derecha, con su título arriba, a la altura del primer grupo.
          out.sitio = {math.abs(ej.caja:GetLeft() - t.derecha:GetLeft()) < 0.01, math.abs(ej.caja:GetRight() - t.derecha:GetRight()) < 0.01,
            math.abs(ej.titulo:GetTop() - t.derecha:GetTop()) < 0.01, ej.caja:GetTop() < ej.titulo:GetBottom(),
            t.contenido:GetHeight() >= t.regla:GetTop() - ej.caja:GetBottom()}
        end
        return out
      end)()`);
      assert.deepEqual(r.malos, [], `${idioma} a ${ancho}×${alto} (columna derecha de ${r.derecha}, límite ${r.limite})`);
      assert.ok(r.vistos > 25, `se mira todo: ${r.vistos}`);
      assert.ok(r.limite >= 300, `nunca al lado con la columna derecha por debajo de 300 px: ${r.limite}`);
      assert.equal(r.abajo, r.derecha < r.limite, `${ancho}: al lado solo si cabe`);
      assert.equal(r.abajo, stacked, `${idioma} at ${ancho}: fallback and Forge font layout`);
      assert.deepEqual(r.sitio, [true, true, true, true, true], `${idioma} a ${ancho}`);
      sinErrores(m);
    }
  });
}

test('con la columna derecha justo en el límite el ejemplo no salta de un sitio a otro', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${TOOLTIP}
    colocarContenido()
    local ej = t.ejemplo
    local left = 0
    for _, row in ipairs(t.orden) do
      if row.marco.texto then left = math.max(left, row.marco:GetWidth()) end
    end
    local function ponerDerecha(d)
      t.contenido:SetWidth(math.ceil(left / 0.85) + d + 40)
      A.refrescar()
      return t.derecha:GetRight() - t.derecha:GetLeft()
    end
    local limite = ej.limite
    local out = {limite = limite, margen = ej.HISTERESIS}
    local function tres()
      local v = {}
      for i = 1, 3 do A.refrescar(); v[i] = ej.abajo end
      return v
    end
    out.medida = ponerDerecha(limite + 50)
    out.anchoLado = tres()
    ponerDerecha(limite)
    out.justoDesdeLado = tres() -- al lado se queda
    ponerDerecha(limite - 1)
    out.debajo = tres()
    ponerDerecha(limite)
    out.justoDesdeAbajo = tres() -- debajo se queda: para volver al lado hace falta el margen
    ponerDerecha(limite + ej.HISTERESIS - 1)
    out.casi = tres()
    ponerDerecha(limite + ej.HISTERESIS)
    out.vuelve = tres()
    -- Repintar sin cambiar el ancho (cambiar una casilla) no lo mueve.
    local antes = ej.repintados
    ponerDerecha(limite)
    t.lineas.grupo:Click("LeftButton"); t.lineas.grupo:Click("LeftButton")
    out.casillas = {ej.abajo, ej.repintados > antes}
    return out
  end)()`);
  assert.ok(r.limite >= 300, String(r.limite));
  assert.ok(r.margen > 0);
  assert.ok(r.medida >= r.limite, `el ejemplo tiene sitio: ${r.medida}`);
  assert.deepEqual(r.anchoLado, [false, false, false]);
  assert.deepEqual(r.justoDesdeLado, [false, false, false]);
  assert.deepEqual(r.debajo, [true, true, true]);
  assert.deepEqual(r.justoDesdeAbajo, [true, true, true]);
  assert.deepEqual(r.casi, [true, true, true]);
  assert.deepEqual(r.vuelve, [false, false, false]);
  assert.deepEqual(r.casillas, [false, true]);
  sinErrores(m);
});

test('repintar el ejemplo reutiliza sus textos: marcar y desmarcar 20 veces no crea más FontStrings', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    assert(SnetForever.Formulas.ponerFuente("minprice", "vendorsell"))
    ${TOOLTIP}
    local ej = t.ejemplo
    elegir(t.formato, "texto") -- la lista del desplegable crea sus filas la primera vez que se abre
    local nuevos = 0
    local crear = BANCO.clases.Frame.metodos.CreateFontString
    BANCO.clases.Frame.metodos.CreateFontString = function(...)
      nuevos = nuevos + 1
      return crear(...)
    end
    local n, reserva = ej.n, #ej.filas
    for i = 1, 20 do
      t.lineas.grupo:Click("LeftButton"); t.lineas.preciosSubasta:Click("LeftButton")
    end
    elegir(t.formato, "iconos"); elegir(t.formato, "texto")
    t.general.no:Click("LeftButton"); t.general.si:Click("LeftButton")
    BANCO.clases.Frame.metodos.CreateFontString = crear
    -- Con una fuente propia menos, sobra una fila: se esconde, no se borra.
    SnetForever.Formulas.quitarFuente("minprice")
    A.elegir("fuentes"); A.elegir("tooltip")
    local escondidas = 0
    for i = ej.n + 1, #ej.filas do if not ej.filas[i].izq:IsShown() and not ej.filas[i].der:IsShown() then escondidas = escondidas + 1 end end
    return {nuevos = nuevos, n = {n, ej.n}, reserva = {reserva, #ej.filas}, escondidas = escondidas}
  end)()`);
  assert.equal(r.nuevos, 0, 'ningún FontString nuevo');
  assert.equal(r.n[1], r.n[0] - 1, 'una fila menos sin la fuente propia');
  assert.equal(r.reserva[1], r.reserva[0], 'la reserva no crece');
  assert.ok(r.escondidas >= 1);
  sinErrores(m);
});
