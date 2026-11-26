// Almacén (plan de paridad con TSM, fase 4, entrega 1): la vista previa de solo lectura entre las bolsas y el banco
// personal, con las cuentas de WarehousingOperation de TSM 4.15.9.
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const A = 'SnetForever.Almacen';
const JUGADOR = { nombre: 'Buyer', reino: 'Normal', faccion: 'Horde' };
const MENA = 2770;
const BARRA = 2840;

function maquina() {
  const m = nuevaMaquina({ jugador: JUGADOR, bolsas: 'forever' });
  m.huecos(0, 6);
  m.huecos(6, 4); // la primera pestaña del banco del personaje (Forever: 6 a 14)
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  return m;
}

// Mats tiene dos operaciones; Mats`Ore no tiene lista propia y las hereda.
function grupos(m) {
  m.lua(`local S = SnetForever
    assert(S.Arbol.crear("", "Mats"))
    assert(S.Arbol.crear("Mats", "Ore"))
    assert(S.Arbol.poner("i:${MENA}", "Mats\`Ore"))
    assert(S.Arbol.poner("i:${BARRA}", "Mats"))
    assert(S.Operaciones.crear("almacen", "Keep5"))
    assert(S.Operaciones.poner("almacen", "Keep5", "conservarEnBolsas", "5"))
    assert(S.Operaciones.crear("almacen", "Keep8Move3"))
    assert(S.Operaciones.poner("almacen", "Keep8Move3", "conservarEnBolsas", "8"))
    assert(S.Operaciones.poner("almacen", "Keep8Move3", "mover", "3"))
    assert(S.Operaciones.ponerDeGrupo("Mats", "almacen", {"Keep5", "Keep8Move3"}))`);
}

const vista = (m, direccion, rutas) => m.lua(`return ${A}.vistaPrevia(${JSON.stringify(direccion)}${rutas ? `, ${rutas}` : ''})`);
const fila = (v, item) => v.filas.find((f) => f.item === item);

test('sin banco abierto ni en combate no hay vista previa y nada cuenta como vacío', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: MENA, n: 20 });
    assert.equal(vista(m, 'guardar').estado, 'sin_banco');
    m.disparar('BANKFRAME_OPENED');
    m.lua('BANCO.jugador.enCombate = true');
    assert.equal(vista(m, 'guardar').estado, 'en_combate');
    m.lua('BANCO.jugador.enCombate = false');
    m.huecos(6, 0);
    const v = vista(m, 'guardar');
    assert.equal(v.estado, 'sin_datos');
    assert.equal(v.motivo, 'banco');
    assert.equal(v.filas.length, 0);
    assert.equal(vista(m, 'mover').estado, 'direccion');
    m.disparar('BANKFRAME_CLOSED');
    assert.equal(m.lua(`return ${A}.bancoAbierto()`), false);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('guardar recorre las operaciones heredadas con la reserva más alta, como TSM', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: MENA, n: 12 });
    m.bolsa(0, 2, { id: MENA, n: 8 });
    m.bolsa(0, 3, { id: BARRA, n: 10 });
    m.disparar('BANKFRAME_OPENED');
    const v = vista(m, 'guardar');
    assert.equal(v.estado, 'lista');
    const mena = fila(v, MENA);
    // Keep5: max(20 - 0 - 5, 0) = 15; Keep8Move3: conserva 8, max(20 - 15 - 8, 0) = 0. Total 15.
    assert.equal(mena.ruta, 'Mats`Ore');
    assert.deepEqual(mena.operaciones, ['Keep5', 'Keep8Move3']);
    assert.equal(mena.origen, 20);
    assert.equal(mena.mover, 15);
    assert.equal(mena.conserva, 8);
    assert.equal(mena.estado, 'mover');
    assert.equal(mena.destino, 15);
    assert.equal(fila(v, BARRA).mover, 5);
    assert.equal(v.totales.mover, 20);
    assert.equal(v.totales.huecos, 3, 'dos huecos de mena y uno de barras');
    assert.equal(v.requisitos.ejecutable, false);
    assert.equal(v.requisitos.motivoEjecutar, 'solo_lectura');
    assert.equal(m.llamadas('C_Container.PickupContainerItem').length, 0);
    assert.equal(m.llamadas('C_Container.SplitContainerItem').length, 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('una operación ignorada aquí se salta y deja pasar a las demás; sin ninguna, la fila sale apartada', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: MENA, n: 20 });
    m.disparar('BANKFRAME_OPENED');
    m.lua('SnetForeverCuenta.comercio.v2.operaciones.almacen.Keep5.ignorarPersonajes = {["Buyer - Normal"] = true}');
    let mena = fila(vista(m, 'guardar'), MENA);
    assert.deepEqual(mena.operaciones, ['Keep8Move3']);
    assert.equal(mena.mover, 3, 'conserva 8 y mueve como mucho 3');
    m.lua('SnetForeverCuenta.comercio.v2.operaciones.almacen.Keep8Move3.ignorarReinos = {["Normal|Horde"] = true}');
    mena = fila(vista(m, 'guardar'), MENA);
    assert.equal(mena.estado, 'apartada');
    assert.equal(mena.motivo, 'ignorada');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('una fórmula sin valor o fuera de rango deja el objeto entero sin mover y dice cuál', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: MENA, n: 20 });
    m.disparar('BANKFRAME_OPENED');
    m.lua('assert(SnetForever.Operaciones.poner("almacen", "Keep8Move3", "mover", "snfmercado"))');
    let mena = fila(vista(m, 'guardar'), MENA);
    assert.equal(mena.estado, 'apartada');
    assert.equal(mena.motivo, 'formula');
    assert.equal(mena.detalle, 'Keep8Move3 · mover');
    assert.equal(mena.mover, 0, 'la otra operación tampoco mueve: TSM da 0 al objeto entero');
    m.lua('assert(SnetForever.Operaciones.poner("almacen", "Keep8Move3", "mover", "60000"))');
    assert.equal(fila(vista(m, 'guardar'), MENA).motivo, 'formula', 'más de 50.000 no vale');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('sacar y reponer respetan la reserva del banco, lo que ya hay en las bolsas y el múltiplo de pila', () => {
  const m = maquina();
  try {
    m.lua(`local S = SnetForever
      assert(S.Arbol.crear("", "Mats"))
      assert(S.Arbol.poner("i:${MENA}", "Mats"))
      assert(S.Operaciones.crear("almacen", "Bank"))
      assert(S.Operaciones.poner("almacen", "Bank", "conservarEnBanco", "2"))
      assert(S.Operaciones.poner("almacen", "Bank", "moverPila", "10"))
      assert(S.Operaciones.poner("almacen", "Bank", "reponerCantidad", "20"))
      assert(S.Operaciones.poner("almacen", "Bank", "reponerPila", "5"))
      assert(S.Operaciones.poner("almacen", "Bank", "reponerConservarEnBanco", "10"))
      assert(S.Operaciones.ponerDeGrupo("Mats", "almacen", {"Bank"}))`);
    m.bolsa(0, 1, { id: MENA, n: 4 });
    m.bolsa(6, 1, { id: MENA, n: 20 });
    m.bolsa(6, 2, { id: MENA, n: 10 });
    m.disparar('BANKFRAME_OPENED');
    // Sacar: max(30 - 2, 0) = 28 -> múltiplo de 10 = 20.
    const sacar = fila(vista(m, 'sacar'), MENA);
    assert.equal(sacar.origen, 30);
    assert.equal(sacar.mover, 20);
    assert.equal(sacar.destino, 24);
    // Reponer: faltan 20 - 4 = 16, el banco deja 30 - 10 = 20 -> 16 -> múltiplo de 5 = 15.
    const reponer = fila(vista(m, 'reponer'), MENA);
    assert.equal(reponer.mover, 15);
    assert.equal(reponer.enBolsas, 4);
    m.bolsa(0, 1, { id: MENA, n: 20 });
    const lleno = fila(vista(m, 'reponer'), MENA);
    assert.equal(lleno.estado, 'nada');
    assert.equal(lleno.motivo, 'repuesto');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('un hueco ocupado sin datos deja la cuenta incierta y un destino sin hueco libre no se promete', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: MENA, n: 12 });
    m.bolsa(0, 2, { id: MENA, n: 8 });
    m.bolsa(0, 3, { id: undefined, n: 5 }); // el juego dice que está ocupado pero no da el objeto
    m.disparar('BANKFRAME_OPENED');
    let v = vista(m, 'guardar');
    assert.equal(fila(v, MENA).estado, 'incierta');
    assert.equal(fila(v, MENA).motivo, 'huecos_origen');
    assert.equal(v.requisitos.origenLeido, false);
    assert.equal(v.totales.mover, 0);
    m.bolsa(0, 3, undefined);
    m.lua(`local original = C_Container.GetContainerItemInfo
      C_Container.GetContainerItemInfo = function(bolsa, hueco)
        local f = original(bolsa, hueco)
        if f and bolsa == 0 and hueco == 2 then f.stackCount = nil end
        return f
      end
      BANCO.restaurarInfoContenedor = function() C_Container.GetContainerItemInfo = original end`);
    v = vista(m, 'guardar');
    assert.equal(fila(v, MENA).estado, 'incierta', 'un ID conocido sin cantidad no cuenta como una unidad');
    assert.equal(v.totales.mover, 0);
    m.lua('BANCO.restaurarInfoContenedor()');
    // El banco tiene 4 huecos; con 3 ocupados por otra cosa solo queda 1 y la mena necesita 2.
    for (let h = 1; h <= 3; h++) m.bolsa(6, h, { id: 6948, n: 1 });
    v = vista(m, 'guardar');
    const mena = fila(v, MENA);
    assert.equal(mena.estado, 'sin_hueco');
    assert.equal(mena.detalle, 1, 'falta un hueco');
    assert.equal(mena.destino, undefined);
    assert.equal(v.requisitos.huecosLibres, 1);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('variantes y mascotas del árbol no se casan con el id del hueco', () => {
  const m = maquina();
  try {
    m.lua(`local S = SnetForever
      assert(S.Arbol.crear("", "Gear"))
      assert(S.Arbol.poner("i:15200::99", "Gear"))
      assert(S.Arbol.poner("p:39:1:1", "Gear"))
      assert(S.Operaciones.crear("almacen", "All"))
      assert(S.Operaciones.ponerDeGrupo("Gear", "almacen", {"All"}))
      assert(S.Operaciones.ponerDeGrupo("", "almacen", {"All"}))`);
    m.bolsa(0, 1, { id: 15200, n: 1 });
    m.bolsa(0, 2, { id: 82800, n: 1 });
    m.disparar('BANKFRAME_OPENED');
    m.lua(`local objetos = SnetForever.Arbol.objetos
      BANCO.listadosAlmacen = 0
      SnetForever.Arbol.objetos = function(...)
        BANCO.listadosAlmacen = BANCO.listadosAlmacen + 1
        return objetos(...)
      end`);
    const v = vista(m, 'guardar');
    assert.equal(fila(v, 15200).estado, 'apartada');
    assert.equal(fila(v, 15200).motivo, 'variante');
    assert.equal(fila(v, 82800).motivo, 'mascota');
    assert.equal(v.totales.mover, 0);
    assert.equal(m.lua('BANCO.listadosAlmacen'), 0, 'consulta variantes por ID, sin listar los objetos de cada grupo');
    m.lua(`local S = SnetForever
      assert(S.Arbol.crear("", "BaseKey"))
      assert(S.Arbol.poner("i:15200", "BaseKey"))
      assert(S.Operaciones.ponerDeGrupo("BaseKey", "almacen", {"All"}))`);
    assert.equal(fila(vista(m, 'guardar', '{BaseKey = true}'), 15200).motivo, 'variante',
      'la variante aún cuenta cuando su grupo no está incluido en la vista');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('la vista deja de valer si cambia una fórmula, una cantidad o el banco antes de mover', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: MENA, n: 20 });
    m.disparar('BANKFRAME_OPENED');
    m.lua(`_G.__v = ${A}.vistaPrevia("guardar")`);
    assert.deepEqual(m.lua(`return {${A}.vigente(_G.__v)}`), [true]);
    m.lua('assert(SnetForever.Operaciones.poner("almacen", "Keep5", "conservarEnBolsas", "6"))');
    assert.deepEqual(m.lua(`return {${A}.vigente(_G.__v)}`), [false, 'cambio']);
    m.lua(`_G.__v = ${A}.vistaPrevia("guardar")`);
    m.bolsa(0, 1, { id: MENA, n: 19 });
    assert.deepEqual(m.lua(`return {${A}.vigente(_G.__v)}`), [false, 'cambio']);
    m.lua(`_G.__v = ${A}.vistaPrevia("guardar")`);
    m.disparar('BANKFRAME_CLOSED');
    assert.deepEqual(m.lua(`return {${A}.vigente(_G.__v)}`), [false, 'sin_banco']);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('solo entran los grupos elegidos y Almacen.grupos da los que tienen operación', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: MENA, n: 20 });
    m.bolsa(0, 2, { id: BARRA, n: 10 });
    m.bolsa(0, 3, { id: 6948, n: 1 }); // sin grupo y el Grupo Base sin operación de Almacén
    m.disparar('BANKFRAME_OPENED');
    assert.deepEqual(m.lua(`return ${A}.grupos()`), ['Mats', 'Mats`Ore']);
    const v = vista(m, 'guardar', '{Mats = true}');
    assert.deepEqual(v.filas.map((f) => f.item), [BARRA]);
    assert.equal(fila(vista(m, 'guardar'), 6948), undefined);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('la ventana se abre con la orden, enseña los motivos y no se repinta sin cambios', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: MENA, n: 20 });
    m.bolsa(0, 2, { id: BARRA, n: 3 });
    m.lua('SlashCmdList.SNET("c almacen")');
    assert.equal(m.lua('SnetForever.UIAlmacen.estaAbierta()'), true);
    assert.match(m.lua('SnetForeverAlmacen.estado:GetText()'), /Abre el banco/);
    m.disparar('BANKFRAME_OPENED');
    m.avanzar(0.5);
    const celdas = m.lua(`(function()
      local t, salida = SnetForeverAlmacen.tabla, {}
      for i = 1, t:cuantas() do
        local f = t:fila(i)
        salida[#salida + 1] = {item = f.item, motivo = SnetForever.UIAlmacen.motivo(f)}
      end
      return salida
    end)()`);
    assert.deepEqual(celdas, [
      { item: BARRA, motivo: 'Se conservan 3 en el origen' },
      { item: MENA, motivo: 'Se movería' },
    ]);
    assert.match(m.lua('SnetForeverAlmacen.estado:GetText()'), /^2 objetos · 15 unidades a mover/);
    const antes = m.lua('SnetForeverAlmacen.tabla.ordenaciones');
    m.disparar('BAG_UPDATE_DELAYED');
    m.avanzar(0.5);
    assert.equal(m.lua('SnetForeverAlmacen.tabla.ordenaciones'), antes, 'sin cambios no se vuelve a poner la tabla');
    m.bolsa(0, 1, { id: MENA, n: 18 });
    m.disparar('BAG_UPDATE_DELAYED');
    m.disparar('BAG_UPDATE_DELAYED');
    m.avanzar(0.5);
    assert.equal(m.lua('SnetForeverAlmacen.tabla.ordenaciones'), antes + 1, 'dos avisos seguidos, un solo repintado');
    // En combate la tabla se queda como estaba y la línea dice que está en pausa.
    m.lua('BANCO.jugador.enCombate = true');
    m.disparar('PLAYER_REGEN_DISABLED');
    m.bolsa(0, 1, { id: MENA, n: 30 });
    m.disparar('BAG_UPDATE_DELAYED');
    m.avanzar(0.5);
    assert.match(m.lua('SnetForeverAlmacen.estado:GetText()'), /En combate/);
    assert.equal(m.lua('SnetForeverAlmacen.tabla:cuantas()'), 2);
    m.lua('BANCO.jugador.enCombate = false');
    m.disparar('PLAYER_REGEN_ENABLED');
    m.avanzar(0.5);
    assert.equal(m.lua('SnetForever.UIAlmacen.vista.totales.mover'), 25);
    m.lua('BANCO.jugador.enCombate = true');
    m.disparar('PLAYER_REGEN_DISABLED');
    m.avanzar(0.5);
    assert.match(m.lua('SnetForeverAlmacen.estado:GetText()'), /En combate/);
    m.lua('BANCO.jugador.enCombate = false');
    m.disparar('PLAYER_REGEN_ENABLED');
    m.avanzar(0.5);
    assert.match(m.lua('SnetForeverAlmacen.estado:GetText()'), /^2 objetos · 25 unidades a mover/);
    m.lua('SlashCmdList.SNET("trade warehouse")');
    assert.equal(m.lua('SnetForever.UIAlmacen.estaAbierta()'), false);
    assert.equal(m.llamadas('C_Container.PickupContainerItem').length, 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});
