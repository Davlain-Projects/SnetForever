// Ventana principal, parte 1, Task 23: el editor de fórmulas ⧉ (ui/principal/editor-formula.lua del addon
// SnetForever_Comercio, SnetForever.EditorFormula) y la página «Ajustes» (ui/principal/ajustes.lua,
// SnetForever.PrincipalAjustes). En Ajustes funcionan Tooltip, Fuentes propias (Custom Sources) y Apariencia; los demás
// apartados dicen «Llega en otra parte».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const q = (t) => JSON.stringify(t);
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

// Una máquina con precios de prueba: la app (snfmercado y snfhistorico) y el juego (vendorsell).
function maquina(opciones = {}) {
  const m = nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, ...opciones });
  m.lua(`PRE = {[100] = {normal = 10000}, [200] = {normal = 60000}}
    SnetForever.Precios.de = function(i) return PRE[i] end`);
  m.itemInfo(100, { nombre: 'Lingote de cobre', precio: 500 });
  m.itemInfo(200, { nombre: 'Lingote de hierro', precio: 0 });
  return m;
}

const dinero = (m, cobre) => m.lua(`SnetForever.Tema.dinero(${cobre})`);

// Abre Operaciones con la operación de subasta «Alta» aplicada a un grupo con los objetos 100 y 200, y deja ayudas.
const OPERACION = `
  local A, O = SnetForever.Arbol, SnetForever.Operaciones
  local ruta = A.crear("", "Metales")
  A.poner("i:200", ruta); A.poner("i:100", ruta)
  O.crear("subasta", "Alta")
  O.ponerDeGrupo(ruta, "subasta", {"Alta"})
  SnetForever.Principal.abrir("operaciones")
  local P = SnetForever.PrincipalOperaciones
  local E = P.editor
  P.abrir("subasta", "Alta")
  E.pestanas.pestanas[2]:Click("LeftButton")
  local F = SnetForever.EditorFormula.marco()
  local function elegirObjeto(id)
    F.objeto:Click("LeftButton")
    for _, f in ipairs(SnetForeverDesplegableLista.filas) do
      if f:IsShown() and f.valor == id then f:Click("LeftButton") end
    end
  end`;

// ---------------------------------------------------------------------------------------------------
// El editor ⧉
// ---------------------------------------------------------------------------------------------------

test('el editor ⧉ enseña el valor para el objeto de ejemplo y el error claro', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPERACION}
    local c = E:bloque("precioNormal").control
    c.botonCopiar:Click("LeftButton")
    local out = {}
    out.abierto = {F:IsShown(), F.titulo:GetText(), F.campo:GetText(), F.campo:IsMultiLine(), F.campoNombre:IsShown()}
    -- Por defecto, el primer objeto del grupo que usa la operación (i:100 va antes que i:200).
    out.objeto = {SnetForever.EditorFormula.objetoDeEjemplo(), F.objeto.texto:GetText()}
    out.valor100 = F.valor:GetText()
    elegirObjeto(200)
    out.valor200 = F.valor:GetText()
    -- Un precio con decimales se redondea siempre hacia abajo (Formulas.cobre).
    elegirObjeto(100)
    F.campo:SetText("snfmercado * 0.33335")
    out.redondeo = F.valor:GetText()
    -- El error, con el mensaje de Formulas.mensaje; sin valor.
    F.campo:SetText("noexiste + 1")
    out.error = {F.error:GetText(), F.valor:GetText()}
    F.botonGuardar:Click("LeftButton")
    out.trasGuardarMal = {F:IsShown(), O.valor("subasta", "Alta", "precioNormal")}
    -- Una fórmula sin valor para este objeto (no es un error).
    F.campo:SetText("snfminimo")
    out.sinValor = {F.error:GetText(), F.valor:GetText()}
    -- Guardar escribe la fórmula en el campo de la operación (en una sola línea).
    F.campo:SetText("snfmercado\\n * 1.5")
    F.botonGuardar:Click("LeftButton")
    out.guardado = {F:IsShown(), O.valor("subasta", "Alta", "precioNormal"), c:GetText()}
    -- Cancelar no toca nada.
    c.botonCopiar:Click("LeftButton")
    F.campo:SetText("99g")
    F.botonCancelar:Click("LeftButton")
    out.cancelado = {F:IsShown(), O.valor("subasta", "Alta", "precioNormal")}
    -- Escape también cancela.
    c.botonCopiar:Click("LeftButton")
    F:GetScript("OnKeyDown")(F, "ESCAPE")
    out.escape = F:IsShown()
    -- Una cantidad (no un precio) se enseña como número.
    E.pestanas.pestanas[1]:Click("LeftButton")
    E.pestanas.pestanas[2]:Click("LeftButton")
    E:bloque("tope").control.botonCopiar:Click("LeftButton")
    F.campo:SetText("snfmercado / 3")
    out.cantidad = F.valor:GetText()
    F.botonCancelar:Click("LeftButton")
    return out
  end)()`);
  assert.deepEqual(r.abierto, [true, 'Precio normal', 'max(2 * snfmercado, 12 * vendorsell)', true, false]);
  assert.deepEqual(r.objeto, [100, 'Lingote de cobre']);
  assert.equal(r.valor100, dinero(m, 20000), 'max(2 * 10000, 12 * 500)');
  assert.equal(r.valor200, dinero(m, 120000));
  assert.equal(r.redondeo, dinero(m, 3333), '3333,5 cobre se queda en 3333');
  assert.deepEqual(r.error, ['la fuente noexiste no existe en SnetForever', 'sin valor']);
  assert.deepEqual(r.trasGuardarMal, [true, 'max(2 * snfmercado, 12 * vendorsell)'], 'con un error no se guarda');
  assert.deepEqual(r.sinValor, ['', 'sin valor']);
  assert.deepEqual(r.guardado, [false, 'snfmercado * 1.5', 'snfmercado * 1.5']);
  assert.deepEqual(r.cancelado, [false, 'snfmercado * 1.5']);
  assert.equal(r.escape, false);
  assert.equal(r.cantidad, '3333,33', 'una cantidad no lleva oro ni se redondea a cobre');
  sinErrores(m);
});

test('sin grupos que usen la operación, el objeto de ejemplo es el último mirado en el tooltip', necesitaComercio, () => {
  const m = maquina();
  m.tooltipObjeto(200);
  const r = m.lua(`(function()
    SnetForever.Operaciones.crear("subasta", "Suelta")
    SnetForever.Principal.abrir("operaciones")
    local P = SnetForever.PrincipalOperaciones
    P.abrir("subasta", "Suelta")
    P.editor.pestanas.pestanas[2]:Click("LeftButton")
    P.editor:bloque("precioMaximo").control.botonCopiar:Click("LeftButton")
    local F = SnetForever.EditorFormula.marco()
    local out = {SnetForever.EditorFormula.objetoDeEjemplo(), F.objeto.texto:GetText(), F.valor:GetText()}
    F.botonCancelar:Click("LeftButton")
    return out
  end)()`);
  assert.deepEqual(r, [200, 'Lingote de hierro', dinero(m, 500000000)]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------------------------------

const AJUSTES = `
  SnetForever.Principal.abrir("ajustes")
  local A = SnetForever.PrincipalAjustes`;

test('Ajustes enseña los 12 apartados; Tooltip, Custom Sources y Apariencia funcionan, el resto dice «Llega en otra parte»', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${AJUSTES}
    local out = {nombres = {}, otra = {}, funcionan = {}, ancho = A.barra:GetWidth(), color = {}}
    local fondo = {A.fondoBarra:GetVertexColor()}
    out.fondo = fondo
    for _, clave in ipairs(A.APARTADOS) do
      out.nombres[#out.nombres + 1] = A.botones[clave].texto:GetText()
      A.botones[clave]:Click("LeftButton")
      local ap = A.apartados[clave]
      out.color[clave] = {A.botones[clave].texto:GetTextColor()}
      if ap.otraParte then
        out.otra[#out.otra + 1] = clave
        out.textoOtra = ap.otraParte:GetText()
      else
        out.funcionan[#out.funcionan + 1] = clave
      end
      -- Solo se ve el apartado elegido.
      for _, otra in ipairs(A.APARTADOS) do
        if otra ~= clave and A.apartados[otra] and A.apartados[otra]:IsShown() then out.dosALaVez = true end
      end
    end
    out.otroColor = {A.botones.general.texto:GetTextColor()}
    out.elegido = A.elegido()
    return out
  end)()`);
  assert.deepEqual(r.nombres, ['Ajustes generales', 'Tooltip', 'Contabilidad', 'Apariencia', 'Subasta', 'Destruir', 'Correo',
    'Fuentes propias', 'Fabricación', 'Macros', 'Navegar / Sniper', 'Venta']);
  assert.deepEqual(r.funcionan, ['tooltip', 'apariencia', 'fuentes']);
  assert.equal(r.otra.length, 9);
  assert.equal(r.textoOtra, 'Llega en otra parte');
  assert.equal(r.dosALaVez, undefined);
  assert.equal(r.ancho, 152);
  assert.equal(aHex(r.fondo), m.lua('SnetForever.Tema.hex("secundario")'));
  assert.equal(r.elegido, 'venta');
  assert.equal(aHex(r.color.venta), m.lua('SnetForever.Tema.hex("acento")'), 'el elegido, en amarillo');
  assert.notEqual(aHex(r.otroColor), m.lua('SnetForever.Tema.hex("acento")'));
  sinErrores(m);
});

test('Ajustes sale en inglés con el cliente en inglés', necesitaComercio, () => {
  const m = maquina({ jugador: { ...JUGADOR, idioma: 'enUS' } });
  const r = m.lua(`(function()
    ${AJUSTES}
    A.elegir("general")
    return {A.botones.fuentes.texto:GetText(), A.apartados.general.otraParte:GetText(), A.fuentes.agregar.texto:GetText()}
  end)()`);
  assert.deepEqual(r, ['Custom Sources', 'Coming in another part', 'Add a custom source']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Fuentes propias (Custom Sources)
// ---------------------------------------------------------------------------------------------------

const FUENTES = `${AJUSTES}
  A.elegir("fuentes")
  local F = SnetForever.EditorFormula.marco()
  local Fo = SnetForever.Formulas
  local function filas()
    local t = {}
    for _, f in ipairs(A.fuentes.filas) do
      if f:IsShown() then t[#t + 1] = {f.nombre:GetText(), f.formato:GetText(), f.formula:GetText()} end
    end
    return t
  end
  local function agregar(nombre, texto)
    A.fuentes.agregar:Click("LeftButton")
    F.campoNombre:SetText(nombre)
    F.campo:SetText(texto)
    F.botonGuardar:Click("LeftButton")
  end`;

test('agregar la fuente minprice y usarla en una fórmula', necesitaComercio, () => {
  const m = maquina();
  m.tooltipObjeto(100); // sin grupos, el objeto de ejemplo es el último mirado
  const r = m.lua(`(function()
    ${FUENTES}
    local out = {}
    local d = A.fuentes.descripcion:GetText()
    out.descripcion = d
    out.cabeceras = {A.fuentes.cabeceras.nombre:GetText(), A.fuentes.cabeceras.formato:GetText(), A.fuentes.cabeceras.formula:GetText()}
    out.antes = filas()
    A.fuentes.agregar:Click("LeftButton")
    out.editor = {F:IsShown(), F.campoNombre:IsShown(), F.campoNombre:GetText(), F.campo:GetText()}
    F.campoNombre:SetText("minprice")
    F.campo:SetText("max(min(snfhistorico, snfmercado), vendorsell)")
    out.valor = F.valor:GetText()
    F.botonGuardar:Click("LeftButton")
    out.guardada = {F:IsShown(), Fo.fuentes().minprice}
    out.filas = filas()
    -- Se usa en una fórmula como las demás fuentes.
    out.usada = Fo.valor("minprice * 2", 100)
    -- Pulsar la fila la abre en el editor ⧉; cambiar la fórmula la guarda.
    A.fuentes.filas[1]:Click("LeftButton")
    out.editar = {F:IsShown(), F.campoNombre:GetText(), F.campo:GetText()}
    F.campo:SetText("snfmercado")
    F.botonGuardar:Click("LeftButton")
    out.editada = Fo.fuentes().minprice
    -- También se puede cambiar el nombre.
    A.fuentes.filas[1]:Click("LeftButton")
    F.campoNombre:SetText("Precio_Bajo")
    F.botonGuardar:Click("LeftButton")
    out.renombrada = Fo.fuentes()
    -- ✖ pide confirmación y la quita.
    A.fuentes.filas[1].quitar:Click("LeftButton")
    local c = SnetForeverAjustesConfirmar
    out.pregunta = {c:IsShown(), c.texto:GetText()}
    c.botonCancelar:Click("LeftButton")
    out.cancelada = Fo.fuentes().precio_bajo
    A.fuentes.filas[1].quitar:Click("LeftButton")
    c.botonAceptar:Click("LeftButton")
    out.quitada = {next(Fo.fuentes()) == nil, #filas()}
    return out
  end)()`);
  const amarillo = m.lua('SnetForever.Tema.hex("acento")');
  assert.ok(r.descripcion.includes(`|cff${amarillo}vendorsell|r`) && r.descripcion.includes(`|cff${amarillo}vendorbuy|r`),
    `vendorsell y vendorbuy en amarillo: ${r.descripcion}`);
  assert.deepEqual(r.cabeceras, ['Nombre', 'Formato', 'Fórmula']);
  assert.deepEqual(r.antes, []);
  assert.deepEqual(r.editor, [true, true, '', '']);
  assert.equal(r.valor, dinero(m, 10000), 'el ejemplo se calcula mientras se escribe');
  assert.deepEqual(r.guardada, [false, 'max(min(snfhistorico, snfmercado), vendorsell)']);
  assert.deepEqual(r.filas, [['minprice', 'Oro', 'max(min(snfhistorico, snfmercado), vendorsell)']]);
  assert.equal(r.usada, 20000);
  assert.deepEqual(r.editar, [true, 'minprice', 'max(min(snfhistorico, snfmercado), vendorsell)']);
  assert.equal(r.editada, 'snfmercado');
  assert.deepEqual(r.renombrada, { precio_bajo: 'snfmercado' }, 'el nombre se guarda en minúsculas y el viejo se va');
  assert.equal(r.pregunta[0], true);
  assert.match(r.pregunta[1], /precio_bajo/);
  assert.equal(r.cancelada, 'snfmercado', 'Cancelar no quita nada');
  assert.deepEqual(r.quitada, [true, 0], 'sin fuentes y sin filas');
  sinErrores(m);
});

test('nombre repetido o con espacios: no se guarda y lo dice', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${FUENTES}
    agregar("minprice", "snfmercado")
    local out = {}
    local function prueba(nombre, texto)
      agregar(nombre, texto or "vendorsell")
      local r = {abierto = F:IsShown(), error = F.error:GetText()}
      F.botonCancelar:Click("LeftButton")
      return r
    end
    out.espacios = prueba("min price")
    out.repetido = prueba("MinPrice")
    out.existente = prueba("vendorsell")
    out.funcion = prueba("max")
    out.vacio = prueba("  ")
    out.raro = prueba("1precio")
    out.ciclo = prueba("bucle", "bucle + 1g")
    out.mal = prueba("buena", "snfmercado +")
    out.fuentes = Fo.fuentes()
    return out
  end)()`);
  const esperado = {
    espacios: 'el nombre no puede llevar espacios',
    repetido: 'ya tienes una fuente propia que se llama minprice',
    existente: 'vendorsell ya es una fuente de SnetForever: elige otro nombre',
    funcion: 'max ya es una fuente de SnetForever: elige otro nombre',
    vacio: 'escribe un nombre para la fuente',
    raro: 'el nombre solo puede llevar letras, números y _, y no puede empezar por un número',
    ciclo: 'una fuente se usa a sí misma (la fuente bucle)',
    mal: 'la fórmula está incompleta: falta un valor al final',
  };
  for (const [caso, mensaje] of Object.entries(esperado)) {
    assert.deepEqual(r[caso], { abierto: true, error: mensaje }, caso);
  }
  assert.deepEqual(r.fuentes, { minprice: 'snfmercado' }, 'nada de lo que no vale se ha guardado');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Apariencia
// ---------------------------------------------------------------------------------------------------

test('Ocultar icono en el minimapa esconde el botón', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${AJUSTES}
    A.elegir("apariencia")
    local c = A.apariencia.minimapa
    local out = {texto = c.texto:GetText(), antes = {c.marcada, SnetForeverBotonMinimapa:IsShown()}}
    c:Click("LeftButton")
    out.oculto = {c.marcada, SnetForeverBotonMinimapa:IsShown(), SnetForever.Ajustes.get("minimapa.boton")}
    c:Click("LeftButton")
    out.visible = {c.marcada, SnetForeverBotonMinimapa:IsShown(), SnetForever.Ajustes.get("minimapa.boton")}
    -- Si el ajuste cambia desde otro sitio (la ventana de la guía), la casilla lo sigue.
    SnetForever.Ajustes.set("minimapa.boton", false)
    out.fuera = c.marcada
    return out
  end)()`);
  assert.equal(r.texto, 'Ocultar icono en el minimapa');
  assert.deepEqual(r.antes, [false, true]);
  assert.deepEqual(r.oculto, [true, false, false]);
  assert.deepEqual(r.visible, [false, true, true]);
  assert.equal(r.fuera, true);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------------------------------

test('Ajustes › Tooltip: cada casilla apaga y enciende su línea, y el radio Activar las apaga todas', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${AJUSTES}
    A.elegir("tooltip")
    local T = SnetForever.TooltipComercio
    local out = {orden = {}, textos = {}, cambia = {}, apagadas = {}}
    for _, l in ipairs(T.LINEAS) do
      local c = A.tooltip.lineas[l.clave]
      out.orden[#out.orden + 1] = l.clave
      out.textos[#out.textos + 1] = c.texto:GetText() == SnetForever.L.t(l.texto)
      local antes = T.linea(l.clave)
      local marcadaAntes = c.marcada
      c:Click("LeftButton")
      out.cambia[#out.cambia + 1] = {marcadaAntes == antes, T.linea(l.clave) == not antes, c.marcada == not antes}
      c:Click("LeftButton")
    end
    -- Task 39: la casilla general pasa a ser un radio Sí / No con su etiqueta encima.
    out.general = {A.tooltip.etiquetaActivar.texto:GetText(), A.tooltip.general.valor}
    A.tooltip.general.no:Click("LeftButton")
    out.apagado = {T.activo(), A.tooltip.general.valor}
    for _, l in ipairs(T.LINEAS) do
      local c = A.tooltip.lineas[l.clave]
      out.apagadas[#out.apagadas + 1] = c.snfApagado == true
    end
    -- Apagadas no cambian.
    A.tooltip.lineas.grupo:Click("LeftButton")
    out.grupoSigue = T.linea("grupo")
    A.tooltip.general.si:Click("LeftButton")
    out.encendido = {T.activo(), A.tooltip.lineas.grupo.snfApagado}
    return out
  end)()`);
  // Task 37: la lista plana de las líneas con datos, en el orden de los grupos de TSM (la página por grupos, Task 39, en
  // principal-ajustes-tooltip.test.js).
  assert.deepEqual(r.orden, ['grupo', 'operacion', 'operacionArtesania', 'operacionCorreo', 'operacionCompras', 'operacionSniper',
    'operacionVendedor', 'operacionAlmacen', 'vendedor', 'inventario', 'inventarioSimple', 'contaCompras', 'aLaVenta', 'minima', 'mercadoSolo', 'mercado',
    'historico', 'salen', 'parte', 'preciosSubasta', 'maximoPublicar', 'maximoCompras', 'regla', 'maximoSniper', 'ids']);
  assert.ok(r.textos.every(Boolean), 'cada casilla con el texto de su línea');
  for (const c of r.cambia) assert.deepEqual(c, [true, true, true]);
  assert.deepEqual(r.general, ['Activar las líneas de SnetForever', true]);
  assert.deepEqual(r.apagado, [false, false]);
  assert.ok(r.apagadas.every(Boolean), 'con la general apagada, las de cada línea se ven apagadas');
  assert.equal(r.grupoSigue, true);
  assert.deepEqual(r.encendido, [true, false]);
  sinErrores(m);
});

test('Ajustes › Tooltip: marcar una línea de una pareja desmarca la otra también a la vista', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${AJUSTES}
    A.elegir("tooltip")
    local c = A.tooltip.lineas
    local out = {}
    c.inventarioSimple:Click("LeftButton")
    out.simple = {c.inventarioSimple.marcada, c.inventario.marcada}
    c.inventario:Click("LeftButton")
    out.completo = {c.inventarioSimple.marcada, c.inventario.marcada}
    c.mercadoSolo:Click("LeftButton")
    out.mercado = {c.mercadoSolo.marcada, c.mercado.marcada}
    return out
  end)()`);
  assert.deepEqual(r.simple, [true, false]);
  assert.deepEqual(r.completo, [false, true]);
  assert.deepEqual(r.mercado, [true, false]);
  sinErrores(m);
});

test('el radio Activar (antes la casilla general) y /snet comercio tooltip cambian el mismo ajuste', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${AJUSTES}
    A.elegir("tooltip")
    local T = SnetForever.TooltipComercio
    local out = {}
    SlashCmdList.SNET("comercio tooltip")
    out.orden = {T.activo(), A.tooltip.general.valor, A.tooltip.lineas.grupo.snfApagado}
    SlashCmdList.SNET("comercio tooltip")
    out.orden2 = {T.activo(), A.tooltip.general.valor}
    A.tooltip.general.no:Click("LeftButton")
    out.casilla = {T.activo(), SnetForeverCuenta.comercio.tooltip}
    SlashCmdList.SNET("comercio tooltip")
    out.ordenTras = {T.activo(), A.tooltip.general.valor}
    return out
  end)()`);
  assert.deepEqual(r.orden, [false, false, true]);
  assert.deepEqual(r.orden2, [true, true]);
  assert.deepEqual(r.casilla, [false, false]);
  assert.deepEqual(r.ordenTras, [true, true]);
  sinErrores(m);
});

test('quitar un personaje del inventario pide confirmación y lo olvida', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    SnetForever.Guardado.preparar()
    local yo = UnitName("player") .. "-" .. GetRealmName()
    SnetForeverCuenta.comercio.inventario = {v = 1, pj = {
      [yo] = {nombre = UnitName("player"), reino = GetRealmName(), clase = "MAGE", bolsas = {}},
      ["Brok-Normal"] = {nombre = "Brok", reino = "Normal", clase = "WARRIOR", bolsas = {}},
    }}
    SnetForever.InventarioCuenta.olvidarOrden()
    ${AJUSTES}
    A.elegir("tooltip")
    local function filas()
      local t = {}
      for _, f in ipairs(A.tooltip.personajes) do
        if f:IsShown() then t[#t + 1] = f.texto:GetText() end
      end
      return t
    end
    local out = {antes = filas(), yo = UnitName("player")}
    A.tooltip.personajes[2].quitar:Click("LeftButton")
    local c = SnetForeverAjustesConfirmar
    out.pregunta = {c:IsShown(), c.texto:GetText(), c.botonAceptar.texto:GetText(), c.botonCancelar.texto:GetText()}
    c.botonCancelar:Click("LeftButton")
    out.cancelado = {c:IsShown(), filas()}
    A.tooltip.personajes[2].quitar:Click("LeftButton")
    c:GetScript("OnKeyDown")(c, "ESCAPE")
    out.escape = {c:IsShown(), filas()}
    A.tooltip.personajes[2].quitar:Click("LeftButton")
    c.botonAceptar:Click("LeftButton")
    out.quitado = {c:IsShown(), filas(), SnetForeverCuenta.comercio.inventario.pj["Brok-Normal"] == nil}
    return out
  end)()`);
  assert.deepEqual(r.antes, [`${r.yo} - Normal`, 'Brok - Normal']);
  assert.equal(r.pregunta[0], true);
  assert.match(r.pregunta[1], /^¿Olvidar a «Brok - Normal»/);
  assert.deepEqual(r.pregunta.slice(2), ['Olvidar', 'Cancelar']);
  assert.deepEqual(r.cancelado, [false, [`${r.yo} - Normal`, 'Brok - Normal']]);
  assert.deepEqual(r.escape, [false, [`${r.yo} - Normal`, 'Brok - Normal']]);
  assert.deepEqual(r.quitado, [false, [`${r.yo} - Normal`], true]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Textos e idioma
// ---------------------------------------------------------------------------------------------------

test('cada texto del editor ⧉ y de Ajustes está en es y en, y cambiar de idioma los repinta', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    local L = SnetForever.L
    local faltan = {}
    local claves = {}
    for _, k in ipairs(SnetForever.EditorFormula.clavesDeTexto()) do claves[#claves + 1] = k end
    for _, k in ipairs(SnetForever.PrincipalAjustes.clavesDeTexto()) do claves[#claves + 1] = k end
    for _, k in ipairs(claves) do
      if not L.tablas.es[k] or not L.tablas.en[k] then faltan[#faltan + 1] = k end
    end
    ${AJUSTES}
    A.elegir("tooltip")
    SnetForever.Ajustes.set("idioma", "en")
    local out = {faltan = faltan, n = #claves, en = {A.botones.general.texto:GetText(), A.tooltip.etiquetaActivar.texto:GetText(),
      A.botones.apariencia.texto:GetText()}}
    SnetForever.Ajustes.set("idioma", "es")
    out.es = A.botones.general.texto:GetText()
    return out
  end)()`);
  assert.deepEqual(r.faltan, []);
  assert.ok(r.n > 30, `hay ${r.n} claves`);
  assert.deepEqual(r.en, ['General Settings', 'Turn on the SnetForever lines', 'Appearance']);
  assert.equal(r.es, 'Ajustes generales');
  sinErrores(m);
});

test('nada parpadea: ni OnUpdate ni animaciones en el editor ⧉ y en Ajustes', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${AJUSTES}
    for _, clave in ipairs(A.APARTADOS) do A.elegir(clave) end
    A.elegir("fuentes")
    A.fuentes.agregar:Click("LeftButton")
    local malos = {}
    local function mira(f, nombre)
      if f.GetScript and f:GetScript("OnUpdate") then malos[#malos + 1] = nombre end
      if f.GetChildren then
        for i, h in ipairs({f:GetChildren()}) do mira(h, nombre .. "." .. i) end
      end
    end
    mira(A.pagina, "ajustes")
    mira(SnetForeverEditorFormula, "editor")
    return malos
  end)()`);
  assert.deepEqual(r, []);
  sinErrores(m);
});

// Task 31 (aj-08): en TSM «Add a custom source» es una barra a todo el ancho de la columna, de unos 23 px y con la letra más
// grande que la de la tabla, sin paréntesis. Se mide con anchos de letra de verdad (los de test/subasta-ventana.test.js).
const FACTOR_LETRA = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };
const letraReal = (m) => m.lua(`BANCO.letraReal = {${Object.entries(FACTOR_LETRA).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);

test('Agregar una fuente propia es una barra a todo el ancho, de 24 px y letra 14, sin paréntesis, y cabe', necesitaComercio, () => {
  for (const [idioma, cliente, texto] of [['es', 'esES', 'Agregar una fuente propia'], ['en', 'enUS', 'Add a custom source']]) {
    for (const [ancho, alto] of [[1000, 600], [1424, 805]]) {
      const m = maquina({ jugador: { ...JUGADOR, idioma: cliente } });
      letraReal(m);
      const r = m.lua(`(function()
        ${AJUSTES}
        SnetForever.Principal.marco():SetSize(${ancho}, ${alto})
        A.elegir("fuentes")
        local b, cab = A.fuentes.agregar, A.fuentes.cabecera
        local _, letra = b.texto:GetFont()
        local out = {texto = b.texto:GetText(), alto = b:GetHeight(), letra = letra, ajuste = b.texto:GetWordWrap(),
          medido = SnetForever.Tema.anchoTexto(b.texto), ancho = b:GetRight() - b:GetLeft(),
          izq = b:GetLeft() - cab:GetLeft(), der = b:GetRight() - cab:GetRight()}
        -- Con una fuente en la tabla la barra sigue a todo el ancho, debajo de la fila.
        SnetForever.Formulas.ponerFuente("minprice", "vendorsell")
        A.refrescar()
        out.izq2, out.der2 = b:GetLeft() - cab:GetLeft(), b:GetRight() - cab:GetRight()
        out.debajo = b:GetTop() <= A.fuentes.filas[1]:GetBottom()
        return out
      end)()`);
      const donde = `${idioma} a ${ancho}×${alto}`;
      assert.equal(r.texto, texto, `${donde}: sin paréntesis`);
      assert.equal(r.alto, 24, `${donde}: 24 px de alto`);
      assert.equal(r.letra, 14, `${donde}: letra 14`);
      assert.equal(r.ajuste, false, `${donde}: no se parte`);
      assert.ok(r.medido <= r.ancho - 16, `${donde}: cabe (${r.medido.toFixed(1)} de ${r.ancho - 16})`);
      assert.deepEqual([r.izq, r.der, r.izq2, r.der2], [0, 0, 0, 0], `${donde}: a todo el ancho de la columna`);
      assert.equal(r.debajo, true, `${donde}: debajo de la última fila`);
      sinErrores(m);
    }
  }
});
