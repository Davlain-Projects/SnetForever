// Almacén, un movimiento por clic (excepción al §4 aprobada por Alain el 26-nov: «Sí, un movimiento por clic»): el botón
// «Mover una pila» mueve UNA pila (o parte) entre las bolsas y el banco personal abierto, y no acepta otro clic hasta que el
// juego confirma. El banco imita el cursor, C_Container.PickupContainerItem / SplitContainerItem, los huecos bloqueados y
// la respuesta demorada del servidor (B.contenedores en wow-falso.lua).
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const MV = 'SnetForever.AlmacenMover';
const UI = 'SnetForeverAlmacen';
const JUGADOR = { nombre: 'Buyer', reino: 'Normal', faccion: 'Horde' };
const MENA = 2770;
const BARRA = 2840;
const BANCO = 6; // la primera pestaña del banco del personaje en Forever (6 a 14)

function maquina(opciones = {}) {
  const m = nuevaMaquina({ jugador: JUGADOR, bolsas: 'forever', ...opciones });
  m.huecos(0, 6);
  m.huecos(BANCO, 4);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  return m;
}

// Una operación por nombre en el grupo Mats (con la mena y las barras).
function operaciones(m, ops) {
  const lineas = ['local S = SnetForever', 'assert(S.Arbol.crear("", "Mats"))',
    `assert(S.Arbol.poner("i:${MENA}", "Mats"))`, `assert(S.Arbol.poner("i:${BARRA}", "Mats"))`];
  for (const [nombre, campos] of Object.entries(ops)) {
    lineas.push(`assert(S.Operaciones.crear("almacen", ${JSON.stringify(nombre)}))`);
    for (const [campo, valor] of Object.entries(campos)) {
      lineas.push(`assert(S.Operaciones.poner("almacen", ${JSON.stringify(nombre)}, ${JSON.stringify(campo)}, ${JSON.stringify(String(valor))}))`);
    }
  }
  lineas.push(`assert(S.Operaciones.ponerDeGrupo("Mats", "almacen", ${luaLista(Object.keys(ops))}))`);
  m.lua(lineas.join('\n'));
}
const luaLista = (xs) => `{${xs.map((x) => JSON.stringify(x)).join(', ')}}`;

const DIRECCION = { guardar: 1, sacar: 2, reponer: 3 };
// Abre la ventana con el banco abierto en esa dirección y elige la fila del objeto (como el jugador: pulsándola).
function abrir(m, direccion, item) {
  m.disparar('BANKFRAME_OPENED');
  m.lua('SlashCmdList.SNET("c almacen")');
  if (direccion !== 'guardar') m.lua(`${UI}.pestanas.pestanas[${DIRECCION[direccion]}]:Click()`);
  m.avanzar(0.5);
  if (item) elegir(m, item);
}
function elegir(m, item) {
  m.lua(`(function()
    for _, f in ipairs(${UI}.tabla.filas) do
      if f.fila and f.fila.item == ${item} then ${UI}.tabla:pulsarFila(f) return end
    end
    error("sin fila ${item}")
  end)()`);
}
const pulsar = (m) => m.lua(`${UI}.botonMover:Click()`);
const apagado = (m) => m.lua(`${UI}.botonMover.snfApagado`);
const linea = (m) => m.lua(`${UI}.paso:GetText()`);
const paso = (m) => m.lua('SnetForever.UIAlmacen.paso');
const estado = (m) => m.lua(`${MV}.estado()`);
const hueco = (m, b, h) => m.lua(`local c = C_Container.GetContainerItemInfo(${b}, ${h}); return c and {id = c.itemID, n = c.stackCount, b = c.isLocked}`);
const coger = (m) => m.llamadas('C_Container.PickupContainerItem').length + m.llamadas('C_Container.SplitContainerItem').length;

test('Guardar: un clic coge la pila entera, la suelta en el primer hueco vacío del banco y espera a que el juego confirme', () => {
  const m = maquina();
  try {
    operaciones(m, { Todo: {} });
    m.bolsa(0, 2, { id: MENA, n: 12 });
    m.bolsa(0, 3, { id: MENA, n: 8 });
    m.bolsa(BANCO, 1, { id: BARRA, n: 5 });
    m.lua('BANCO.contenedores.exigirClic = true'); // fuera de un OnClick de verdad, el juego lo bloquearía
    abrir(m, 'guardar', MENA);
    assert.equal(m.lua(`${UI}.ayuda:GetText()`), m.lua('SnetForever.L.t("WAREHOUSE_ONE_CLICK")'));
    const p = paso(m);
    assert.deepEqual({ cantidad: p.cantidad, partir: p.partir, origen: p.origen, destino: p.destino },
      { cantidad: 12, partir: false, origen: { bolsa: 0, hueco: 2, n: 12 }, destino: { bolsa: BANCO, hueco: 2 } });
    assert.equal(linea(m), 'Siguiente clic: 12 de #2770 · Mochila, hueco 2 → Banco 1, hueco 2');
    assert.equal(apagado(m), false);
    pulsar(m);
    assert.deepEqual(m.llamadas('C_Container.PickupContainerItem').map((l) => [l[0], l[1]]), [[0, 2], [BANCO, 2]]);
    assert.equal(m.llamadas('C_Container.SplitContainerItem').length, 0);
    assert.equal(m.llamadas('ADDON_ACTION_BLOCKED').length, 0, 'las dos llamadas van dentro del OnClick');
    assert.equal(estado(m).fase, 'en_curso');
    assert.equal(apagado(m), true);
    assert.match(linea(m), /Esperando a que el juego confirme/);
    // Un segundo clic antes de la confirmación no empieza otra transferencia.
    pulsar(m);
    m.lua(`${MV}.ejecutar(SnetForever.UIAlmacen.paso or ${MV}.estado().paso, SnetForever.UIAlmacen.vista)`);
    assert.equal(coger(m), 2);
    m.avanzar(0.5);
    assert.equal(estado(m).fase, 'libre');
    assert.equal(estado(m).resultado, 'hecho');
    assert.deepEqual(hueco(m, 0, 2), undefined);
    assert.deepEqual(hueco(m, BANCO, 2), { id: MENA, n: 12, b: false });
    // La vista se rehace y la misma fila ofrece la pila siguiente; no se mueve sola.
    assert.match(linea(m), /^Hecho: la pila se movió\.  Siguiente clic: 8 de #2770 · Mochila, hueco 3 → Banco 1, hueco 3$/);
    m.avanzar(10);
    assert.equal(coger(m), 2, 'ni eventos ni temporizadores vuelven a mover');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Guardar con reserva: parte la pila y deja en las bolsas lo que pide la operación', () => {
  const m = maquina();
  try {
    operaciones(m, { Keep5: { conservarEnBolsas: 5 } });
    m.bolsa(0, 1, { id: MENA, n: 20 });
    abrir(m, 'guardar', MENA);
    const p = paso(m);
    assert.equal(p.cantidad, 15);
    assert.equal(p.partir, true);
    assert.match(linea(m), /15 de #2770 · Mochila, hueco 1 → Banco 1, hueco 1 · parte la pila de 20$/);
    pulsar(m);
    assert.deepEqual(m.llamadas('C_Container.SplitContainerItem').map((l) => [l[0], l[1], l[2]]), [[0, 1, 15]]);
    assert.deepEqual(m.llamadas('C_Container.PickupContainerItem').map((l) => [l[0], l[1]]), [[BANCO, 1]]);
    m.avanzar(0.5);
    assert.deepEqual(hueco(m, 0, 1), { id: MENA, n: 5, b: false });
    assert.deepEqual(hueco(m, BANCO, 1), { id: MENA, n: 15, b: false });
    assert.match(linea(m), /Esta fila no mueve nada/);
    assert.equal(apagado(m), true);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Sacar con reserva: una reserva posterior mayor no se gasta nunca (se mueve menos que la vista previa de TSM)', () => {
  const m = maquina();
  try {
    // TSM: Saca10 mueve 10 y Keep50 llega tarde (55 - 10 - 50 < 0): la vista previa dice 10 y dejaría 45 en el banco.
    operaciones(m, { Saca10: { mover: 10 }, Keep50: { conservarEnBanco: 50 } });
    m.bolsa(BANCO, 1, { id: MENA, n: 55 });
    abrir(m, 'sacar', MENA);
    const fila = m.lua('SnetForever.UIAlmacen.vista').filas.find((f) => f.item === MENA);
    assert.equal(fila.mover, 10, 'la vista previa sigue siendo la de TSM');
    assert.equal(fila.reservaMax, 50);
    const p = paso(m);
    assert.equal(p.cantidad, 5);
    assert.equal(p.limitado, true);
    assert.deepEqual(p.destino, { bolsa: 0, hueco: 1 });
    assert.match(linea(m), / · parte la pila de 55 · limitado para conservar 50$/);
    pulsar(m);
    m.avanzar(0.5);
    assert.deepEqual(hueco(m, BANCO, 1), { id: MENA, n: 50, b: false });
    assert.deepEqual(hueco(m, 0, 1), { id: MENA, n: 5, b: false });
    assert.match(linea(m), /No se mueve: se conservan 50 en el origen/);
    assert.equal(apagado(m), true);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Sacar un múltiplo elige una pila que permita mover las unidades completas en ese clic', () => {
  const m = maquina();
  try {
    operaciones(m, { Diez: { mover: 10, moverPila: 5 } });
    m.bolsa(BANCO, 1, { id: MENA, n: 4 });
    m.bolsa(BANCO, 2, { id: MENA, n: 7 });
    abrir(m, 'sacar', MENA);
    assert.equal(apagado(m), true);
    assert.match(linea(m), /una pila de al menos 10 unidades/);
    m.bolsa(BANCO, 2, { id: MENA, n: 14 });
    m.disparar('BAG_UPDATE_DELAYED');
    m.avanzar(0.5);
    assert.equal(paso(m).origen.hueco, 2);
    assert.equal(paso(m).cantidad, 10);
    pulsar(m);
    m.avanzar(0.5);
    assert.deepEqual(hueco(m, 0, 1), { id: MENA, n: 10, b: false });
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Reponer comprueba la reserva mayor actual aunque la tabla conserve los mismos números', () => {
  const m = maquina();
  try {
    operaciones(m, { Reponer10: { reponerCantidad: 10 }, Reserva: { reponerConservarEnBanco: 50 } });
    m.bolsa(BANCO, 1, { id: MENA, n: 55 });
    abrir(m, 'reponer', MENA);
    assert.equal(paso(m).cantidad, 5);
    m.lua('assert(SnetForever.Operaciones.poner("almacen", "Reserva", "reponerConservarEnBanco", "52"))');
    assert.equal(m.lua('SnetForever.Almacen.vigente(SnetForever.UIAlmacen.vista)'), true);
    pulsar(m);
    assert.equal(coger(m), 0);
    assert.match(linea(m), /cambió desde la vista previa/);
    m.lua(`${UI}.botonActualizar:Click()`);
    assert.equal(paso(m).cantidad, 3);
    pulsar(m);
    m.avanzar(0.5);
    assert.equal(hueco(m, BANCO, 1).n, 52);
    assert.equal(hueco(m, 0, 1).n, 3);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Sacar con reserva y múltiplos de pila: se bloquea y se explica en vez de inventar otro redondeo', () => {
  const m = maquina();
  try {
    operaciones(m, { Saca10: { mover: 10, moverPila: 5 }, Keep50: { conservarEnBanco: 50 } });
    m.bolsa(BANCO, 1, { id: MENA, n: 55 });
    abrir(m, 'sacar', MENA);
    assert.equal(paso(m), undefined);
    assert.match(linea(m), /^Bloqueado: la reserva mayor \(50\)/);
    assert.equal(apagado(m), true);
    pulsar(m);
    assert.equal(coger(m), 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Reponer: cuenta lo que ya hay en las bolsas y parte la pila del banco hasta el objetivo', () => {
  const m = maquina();
  try {
    operaciones(m, { Repon20: { reponerCantidad: 20 } });
    m.bolsa(0, 1, { id: MENA, n: 5 });
    m.bolsa(BANCO, 3, { id: MENA, n: 30 });
    abrir(m, 'reponer', MENA);
    const p = paso(m);
    assert.deepEqual({ cantidad: p.cantidad, partir: p.partir, origen: p.origen, destino: p.destino },
      { cantidad: 15, partir: true, origen: { bolsa: BANCO, hueco: 3, n: 30 }, destino: { bolsa: 0, hueco: 2 } });
    pulsar(m);
    m.avanzar(0.5);
    assert.equal(estado(m).resultado, 'hecho');
    assert.deepEqual(hueco(m, BANCO, 3), { id: MENA, n: 15, b: false });
    assert.deepEqual(hueco(m, 0, 2), { id: MENA, n: 15, b: false });
    assert.equal(linea(m), 'Hecho: la pila se movió.  Esta fila no mueve nada.');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Reponer nunca usa la bolsa de componentes ni una bolsa especial como destino', () => {
  const m = maquina();
  try {
    operaciones(m, { Repon20: { reponerCantidad: 20 } });
    for (let h = 1; h <= 6; h++) m.bolsa(0, h, { id: BARRA, n: 1 }); // mochila llena
    m.huecos(5, 4); // la de componentes, vacía
    m.huecos(1, 4);
    m.lua('BANCO.ponerFamilia(1, 8)'); // una bolsa especial vacía
    m.bolsa(BANCO, 1, { id: MENA, n: 30 });
    abrir(m, 'reponer', MENA);
    assert.equal(paso(m), undefined);
    assert.match(linea(m), /No hay un hueco vacío de una bolsa normal en el destino/);
    pulsar(m);
    assert.equal(coger(m), 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Destino lleno o cambiado y origen bloqueado: no se coge nada', () => {
  const m = maquina();
  try {
    operaciones(m, { Todo: {} });
    m.bolsa(0, 1, { id: MENA, n: 12 });
    for (let h = 1; h <= 4; h++) m.bolsa(BANCO, h, { id: BARRA, n: 1 });
    abrir(m, 'guardar', MENA);
    assert.match(linea(m), /No hay un hueco vacío/, 'sin hueco libre la fila sale «sin hueco»');
    // Se libera un hueco: la fila vuelve a mover; antes del clic alguien lo ocupa sin que la vista lo sepa.
    m.bolsa(BANCO, 4, undefined);
    m.disparar('BAG_UPDATE_DELAYED');
    m.avanzar(0.5);
    assert.deepEqual(paso(m).destino, { bolsa: BANCO, hueco: 4 });
    m.bolsa(BANCO, 4, { id: BARRA, n: 1 });
    pulsar(m);
    assert.equal(coger(m), 0);
    assert.match(linea(m), /^Algo cambió desde la vista previa/);
    // Origen bloqueado (otro addon o el jugador lo tiene cogido).
    m.bolsa(BANCO, 4, undefined);
    m.lua('BANCO.bloquearHueco(0, 1, true)');
    m.disparar('BAG_UPDATE_DELAYED');
    m.avanzar(0.5);
    elegir(m, MENA);
    assert.equal(paso(m), undefined);
    assert.match(linea(m), /La pila de origen está bloqueada/);
    pulsar(m);
    assert.equal(coger(m), 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Cursor ocupado, combate, operación cambiada y banco cerrado: el clic no coge nada', () => {
  const m = maquina();
  try {
    operaciones(m, { Todo: {} });
    m.bolsa(0, 1, { id: MENA, n: 12 });
    abrir(m, 'guardar', MENA);
    const p = 'SnetForever.UIAlmacen.paso';
    const vista = 'SnetForever.UIAlmacen.vista';
    m.lua('BANCO.cursorAjeno = "spell"');
    assert.deepEqual(m.lua(`return {${MV}.ejecutar(${p}, ${vista})}`)[1], 'cambio', 'la vista sabe si el cursor estaba libre');
    m.lua('SnetForever.UIAlmacen.refrescar(true)');
    assert.equal(paso(m).cantidad, 12);
    pulsar(m);
    assert.match(linea(m), /Suelta lo que llevas en el cursor/);
    m.lua('BANCO.cursorAjeno = nil');
    m.lua('SnetForever.UIAlmacen.refrescar(true)');
    m.lua('BANCO.jugador.enCombate = true');
    m.disparar('PLAYER_REGEN_DISABLED');
    assert.equal(apagado(m), true, 'en combate el botón se apaga');
    assert.deepEqual(m.lua(`return {${MV}.ejecutar(${p}, ${vista})}`), [false, 'en_combate']);
    m.lua('BANCO.jugador.enCombate = false');
    m.disparar('PLAYER_REGEN_ENABLED');
    m.avanzar(0.5);
    m.lua('assert(SnetForever.Operaciones.poner("almacen", "Todo", "conservarEnBolsas", "2"))');
    pulsar(m);
    assert.match(linea(m), /^Algo cambió desde la vista previa/);
    m.disparar('BANKFRAME_CLOSED');
    assert.deepEqual(m.lua(`return {${MV}.ejecutar(${p}, ${vista})}`), [false, 'sin_banco']);
    assert.equal(coger(m), 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Si el servidor deja ambos huecos como estaban, sigue sin confirmar y no se vuelve a intentar', () => {
  const m = maquina();
  try {
    operaciones(m, { Keep5: { conservarEnBolsas: 5 } });
    m.bolsa(0, 1, { id: MENA, n: 20 });
    m.lua('BANCO.contenedores.rechazar = true');
    abrir(m, 'guardar', MENA);
    pulsar(m);
    assert.equal(coger(m), 2);
    m.avanzar(0.5);
    assert.equal(estado(m).fase, 'en_curso');
    assert.deepEqual(hueco(m, 0, 1), { id: MENA, n: 20, b: false });
    assert.equal(hueco(m, BANCO, 1), undefined);
    for (const e of ['BAG_UPDATE_DELAYED', 'ITEM_LOCK_CHANGED', 'CURSOR_CHANGED']) m.disparar(e, 0, 1);
    m.avanzar(10);
    assert.equal(estado(m).fase, 'sin_confirmar');
    assert.equal(apagado(m), true);
    assert.match(linea(m), /El juego no ha confirmado el movimiento/);
    assert.equal(coger(m), 2, 'ni eventos ni temporizadores reintentan');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Confirmación demorada: avisa a los 5 s, sigue sin aceptar clics y termina cuando el juego responde', () => {
  const m = maquina();
  try {
    operaciones(m, { Todo: {} });
    m.bolsa(0, 1, { id: MENA, n: 12 });
    m.bolsa(0, 2, { id: BARRA, n: 3 });
    m.lua('BANCO.contenedores.demora = 8');
    abrir(m, 'guardar', MENA);
    pulsar(m);
    // Un aviso puede llegar antes de que el servidor cambie las cantidades; incluso un hueco desbloqueado puede ser viejo.
    m.lua('BANCO.bloquearHueco(0, 1, false)');
    m.disparar('ITEM_LOCK_CHANGED', 0, 1);
    assert.equal(estado(m).fase, 'en_curso');
    m.avanzar(5.5);
    assert.equal(estado(m).fase, 'sin_confirmar');
    assert.match(linea(m), /El juego no ha confirmado el movimiento/);
    elegir(m, BARRA);
    assert.equal(apagado(m), true, 'tampoco otra fila');
    pulsar(m);
    m.lua(`${UI}.botonActualizar:Click()`);
    assert.equal(coger(m), 2);
    m.avanzar(3);
    assert.equal(estado(m).resultado, 'hecho');
    assert.equal(apagado(m), false);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Sin respuesta del juego: el movimiento queda en curso y «Actualizar» solo mira', () => {
  const m = maquina();
  try {
    operaciones(m, { Todo: {} });
    m.bolsa(0, 1, { id: MENA, n: 12 });
    m.lua('BANCO.contenedores.sinRespuesta = true');
    abrir(m, 'guardar', MENA);
    pulsar(m);
    m.avanzar(30);
    for (let i = 0; i < 3; i++) m.lua(`${UI}.botonActualizar:Click()`);
    assert.equal(estado(m).fase, 'sin_confirmar');
    assert.equal(coger(m), 2);
    // Cerrar el banco lo interrumpe y deja el control al jugador.
    m.disparar('BANKFRAME_CLOSED');
    assert.deepEqual({ fase: estado(m).fase, resultado: estado(m).resultado }, { fase: 'libre', resultado: 'interrumpido' });
    assert.equal(coger(m), 2);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('El destino no acepta la pila: se queda en el cursor y el addon no hace otra llamada', () => {
  const m = maquina();
  try {
    operaciones(m, { Keep5: { conservarEnBolsas: 5 } });
    m.bolsa(0, 1, { id: MENA, n: 20 });
    m.lua('BANCO.contenedores.noSoltar = true');
    abrir(m, 'guardar', MENA);
    pulsar(m);
    assert.deepEqual(m.llamadas('C_Container.PickupContainerItem').map((l) => [l[0], l[1]]), [[BANCO, 1]]);
    assert.deepEqual({ fase: estado(m).fase, resultado: estado(m).resultado }, { fase: 'libre', resultado: 'detenido' });
    assert.equal(m.lua('GetCursorInfo()'), 'item');
    assert.match(linea(m), /^Detenido: la pila sigue en el cursor/);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('El juego prohíbe soltar: no se vuelve a llamar para devolverla, se para y la pila queda al jugador', () => {
  const m = maquina();
  try {
    operaciones(m, { Keep5: { conservarEnBolsas: 5 } });
    m.bolsa(0, 1, { id: MENA, n: 20 });
    m.lua('BANCO.contenedores.prohibirSoltar = true');
    abrir(m, 'guardar', MENA);
    pulsar(m);
    assert.equal(m.llamadas('C_Container.SplitContainerItem').length, 1);
    assert.deepEqual(m.llamadas('C_Container.PickupContainerItem').map((l) => [l[0], l[1]]), [[BANCO, 1]]);
    assert.deepEqual({ fase: estado(m).fase, resultado: estado(m).resultado }, { fase: 'libre', resultado: 'detenido' });
    assert.equal(m.lua(`${MV}.restringido()`), 'bloqueado_juego');
    assert.equal(m.lua('GetCursorInfo()'), 'item');
    assert.match(linea(m), /^Detenido: la pila sigue en el cursor/);
    assert.equal(apagado(m), true);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('Un bloqueo notificado después del clic desactiva el movimiento', () => {
  const m = maquina();
  try {
    operaciones(m, { Todo: {} });
    m.bolsa(0, 1, { id: MENA, n: 12 });
    m.lua('BANCO.contenedores.sinRespuesta = true');
    abrir(m, 'guardar', MENA);
    pulsar(m);
    m.disparar('ADDON_ACTION_BLOCKED', 'SnetForever_Comercio', 'PickupContainerItem');
    assert.equal(estado(m).resultado, 'bloqueado_juego');
    assert.equal(m.lua(`${MV}.restringido()`), 'bloqueado_juego');
    assert.equal(apagado(m), true);
    assert.equal(coger(m), 2);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('El juego bloquea, prohíbe o da error: el ejecutor se apaga y la ventana vuelve a la vista previa', () => {
  for (const [ajuste, resultado] of [['exigirClic', 'bloqueado_juego'], ['prohibir', 'bloqueado_juego'], ['fallar', 'error_api']]) {
    const m = maquina();
    try {
      operaciones(m, { Todo: {} });
      m.bolsa(0, 1, { id: MENA, n: 12 });
      abrir(m, 'guardar', MENA);
      m.lua(`BANCO.contenedores.${ajuste} = true`);
      // exigirClic: la llamada fuera de un OnClick de verdad (un temporizador o un evento) la bloquea el juego.
      if (ajuste === 'exigirClic') m.lua(`${MV}.ejecutar(SnetForever.UIAlmacen.paso, SnetForever.UIAlmacen.vista)`);
      else pulsar(m);
      assert.equal(estado(m).resultado, resultado, ajuste);
      assert.ok(m.lua(`${MV}.restringido()`), ajuste);
      assert.equal(m.lua('GetCursorInfo()'), undefined, ajuste);
      assert.deepEqual(hueco(m, 0, 1), { id: MENA, n: 12, b: false }, ajuste);
      m.lua('BANCO.contenedores = {demora = 0.2}');
      m.lua('SnetForever.UIAlmacen.refrescar(true)');
      assert.equal(m.lua(`${UI}.ayuda:GetText()`), m.lua('SnetForever.L.t("WAREHOUSE_READ_ONLY")'), ajuste);
      assert.equal(apagado(m), true, ajuste);
      assert.match(linea(m), /El juego bloqueó el movimiento/, ajuste);
      const antes = coger(m);
      pulsar(m);
      assert.equal(coger(m), antes, ajuste);
      sinErrores(m);
    } finally { m.cerrar(); }
  }
});

test('Sin las funciones del cliente la ventana se queda en vista previa', () => {
  for (const falta of ['C_Container.PickupContainerItem', 'C_Container.SplitContainerItem', 'GetCursorInfo']) {
    const m = maquina({ sinApi: [falta] });
    try {
      operaciones(m, { Todo: {} });
      m.bolsa(0, 1, { id: MENA, n: 12 });
      abrir(m, 'guardar', MENA);
      assert.equal(m.lua(`${MV}.capacidades()`), false, falta);
      assert.equal(paso(m), undefined, falta);
      assert.equal(m.lua(`${UI}.ayuda:GetText()`), m.lua('SnetForever.L.t("WAREHOUSE_READ_ONLY")'), falta);
      assert.match(linea(m), /Este cliente no deja mover desde el addon/, falta);
      assert.equal(apagado(m), true, falta);
      const v = m.lua('SnetForever.UIAlmacen.vista');
      assert.equal(v.filas.find((f) => f.item === MENA).mover, 12, 'la vista previa sigue igual');
      sinErrores(m);
    } finally { m.cerrar(); }
  }
});

test('Una variante en un hueco, varias filas elegidas o ninguna: no hay paso', () => {
  const m = maquina();
  try {
    operaciones(m, { Todo: {} });
    m.bolsa(0, 1, { id: MENA, n: 12 });
    m.bolsa(0, 2, { id: MENA, n: 1, enlace: `|cffffffff|Hitem:${MENA}::::::1205::::::::|h[Mena]|h|r` });
    m.bolsa(0, 3, { id: BARRA, n: 4 });
    abrir(m, 'guardar');
    assert.match(linea(m), /Elige una sola fila/);
    elegir(m, MENA);
    assert.equal(paso(m), undefined);
    assert.match(linea(m), /tiene variante/);
    elegir(m, BARRA);
    assert.equal(paso(m).cantidad, 4);
    m.lua('BANCO.ctrl = true');
    elegir(m, MENA);
    m.lua('BANCO.ctrl = false');
    assert.equal(paso(m), undefined);
    assert.match(linea(m), /Elige una sola fila/);
    pulsar(m);
    assert.equal(coger(m), 0);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('enlaceSimple: solo el id, sin encantamiento, gemas, sufijo ni bonus', () => {
  const m = maquina();
  try {
    const simple = (e) => m.lua(`return ${MV}.enlaceSimple(${JSON.stringify(e)}, ${MENA})`);
    assert.equal(simple(`|cffffffff|Hitem:${MENA}::::::::::::|h[Mena]|h|r`), true);
    assert.equal(simple(`|cnIQ1:|Hitem:${MENA}::::::::60:::::::::|h[Mena]|h|r`), true, 'formato de Forever con nivel');
    assert.equal(simple(`|Hitem:${MENA}:0:0:0:0:0:0:0:60:0:0:0:0|h[Mena]|h`), true);
    assert.equal(simple(`|Hitem:${MENA}:15::::::::::::|h[x]|h`), false, 'encantamiento');
    assert.equal(simple(`|Hitem:${MENA}::3001:::::::::::|h[x]|h`), false, 'gema');
    assert.equal(simple(`|Hitem:${MENA}::::::-14:::::::|h[x]|h`), false, 'sufijo');
    assert.equal(simple(`|Hitem:${MENA}::::::::60::::2:1:2|h[x]|h`), false, 'bonus');
    assert.equal(simple(`|Hitem:${BARRA}::::::::::::|h[x]|h`), false, 'otro objeto');
    assert.equal(m.lua(`return ${MV}.enlaceSimple(nil, ${MENA})`), false);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('one free bank slot accepts one selected stack even if the entire row does not fit', () => {
  const m = maquina();
  operaciones(m, { Todo: {} });
  m.huecos(BANCO, 1);
  m.bolsa(0, 1, { id: MENA, n: 12 });
  m.bolsa(0, 2, { id: MENA, n: 8 });
  abrir(m, 'guardar', MENA);
  assert.equal(paso(m).cantidad, 12);
  pulsar(m);
  m.avanzar(0.5);
  assert.equal(hueco(m, BANCO, 1).n, 12);
  assert.equal(hueco(m, 0, 2).n, 8);
  sinErrores(m);
});
