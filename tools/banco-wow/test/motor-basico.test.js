// Motor de pasos (motor/pasos.lua), tarea 9: carga y filtrado, avance de un paso por ciclo, «Saltar», retomar,
// progreso por personaje y fin de la guía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const INICIO = 'Prueba (H)\\01-02 Inicio';
const INICIO_MAZMORRAS = 'Prueba (H) Mazmorras\\01-02 Inicio';
const SIGUE = 'Prueba (H)\\02-03 Sigue';
const SKYBORNE = 'Prueba\\01-03 Skyborne';

const NOTA = { t: 'nota', texto: { en: 'Note', es: 'Nota' } };
const MANUAL = { t: 'manual', texto: { en: 'Do it', es: 'Hazlo' } };
const ACEPTAR = (q) => ({ t: 'accept', q });

// Máquina con una guía de prueba (guiaDePrueba) puesta en los datos.
function conGuia(pasos, campos = {}, opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.ponerGuia(guiaDePrueba(pasos, campos));
  return m;
}

const cargar = (m, clave = CLAVE, opciones) =>
  m.lua(`SnetForever.Motor.cargar(${aLua(clave)}${opciones ? `, ${aLua(opciones)}` : ''})`);
const estado = (m) => m.lua('SnetForever.Motor.estado()');
const actual = (m) => estado(m).actual;
const paso = (m, i) => m.lua(`SnetForever.Motor.paso(${i})`);
const actualizar = (m) => m.lua('SnetForever.Motor.actualizar()');
const pj = (m) => m.lua('SnetForeverPJ');

// Ids de todos los pasos de la guía cargada, en orden.
const ids = (m) => m.lua(`(function()
  local t, i = {}, 1
  while SnetForever.Motor.paso(i) do t[i] = SnetForever.Motor.paso(i).id; i = i + 1 end
  return t
end)()`);

// Cuenta los mensajes internos `evento` y guarda el último argumento en la global CUENTA_<evento>.
function contar(m, evento) {
  m.lua(`CUENTA_${evento} = {n = 0}
  SnetForever.Eventos.escuchar("${evento}", function(a) CUENTA_${evento}.n = CUENTA_${evento}.n + 1; CUENTA_${evento}.ultimo = a end)`);
  return () => m.lua(`CUENTA_${evento}`);
}

// ---------------------------------------------------------------------------------------------------
// Carga y filtrado
// ---------------------------------------------------------------------------------------------------

test('cargar: sin guía, estado().sinGuia; una clave que no existe da false', () => {
  const m = nuevaMaquina({ entrar: false }); // sin entrar al mundo: el arranque aún no ha cargado la guía
  const e = estado(m);
  assert.equal(e.sinGuia, true);
  assert.equal(e.fin, false);
  assert.deepEqual(e.activos, []);
  assert.equal(cargar(m, 'No\\existe'), false);
  assert.equal(estado(m).sinGuia, true);
  sinErrores(m);
});

test('cargar: un paso c:MAGE no está para un guerrero y un elemento c:MAGE desaparece de su paso', () => {
  const pasos = [
    { elementos: [NOTA] },
    { filtro: [['c:MAGE']], elementos: [NOTA] },
    { elementos: [{ ...NOTA, filtro: [['c:MAGE']] }, MANUAL] },
  ];
  const m = conGuia(pasos);
  assert.equal(cargar(m), true);
  const e = estado(m);
  assert.equal(e.clave, CLAVE);
  assert.equal(e.sinGuia, false);
  assert.equal(e.actual, 2, 'T1: el paso de solo nota ya está hecho y se pasa al cargar');
  assert.deepEqual(ids(m), ['p1', 'p3']);
  const p = paso(m, 2);
  assert.equal(p.i, 2);
  assert.equal(p.n, 3);
  assert.equal(p.datos.id, 'p3');
  assert.equal(p.elementos.length, 1);
  assert.equal(p.elementos[0].datos.t, 'manual');
  sinErrores(m);

  const mago = conGuia(pasos, {}, { jugador: { clase: 'MAGE' } });
  cargar(mago);
  assert.deepEqual(ids(mago), ['p1', 'p2', 'p3']);
  assert.equal(paso(mago, 3).elementos.length, 2);
  sinErrores(mago);
});

test('cargar: ssf oculto, ah visible y maxlevel 5 oculto a nivel 6 (visible a nivel 5)', () => {
  const pasos = [
    { etiquetas: { ssf: true }, elementos: [NOTA] },
    { etiquetas: { ah: true }, elementos: [NOTA] },
    { etiquetas: { maxlevel: '5' }, elementos: [NOTA] },
    { elementos: [NOTA] },
  ];
  const m6 = conGuia(pasos, {}, { jugador: { nivel: 6 } });
  cargar(m6);
  assert.deepEqual(ids(m6), ['p2', 'p4']);
  sinErrores(m6);
  const m5 = conGuia(pasos, {}, { jugador: { nivel: 5 } });
  cargar(m5);
  assert.deepEqual(ids(m5), ['p2', 'p3', 'p4']);
  sinErrores(m5);
});

test('Motor.etiqueta: la primera etiquetasPorFiltro que aplica gana sobre etiquetas; un ssf por filtro oculta', () => {
  const pasos = [
    {
      etiquetas: { label: 'base' },
      etiquetasPorFiltro: [
        { nombre: 'label', valor: 'mago', filtro: [['c:MAGE']] },
        { nombre: 'label', valor: 'guerrero', filtro: [['c:WARRIOR']] },
        { nombre: 'label', valor: 'otro', filtro: [['f:Horde']] },
      ],
      elementos: [NOTA],
    },
    { etiquetasPorFiltro: [{ nombre: 'ssf', valor: true, filtro: [['c:WARRIOR']] }], elementos: [NOTA] },
    { etiquetasPorFiltro: [{ nombre: 'ssf', valor: true, filtro: [['c:MAGE']] }], elementos: [NOTA] },
  ];
  const m = conGuia(pasos);
  cargar(m);
  assert.deepEqual(ids(m), ['p1', 'p3']);
  assert.equal(m.lua('SnetForever.Motor.etiqueta(SnetForever.Motor.paso(1).datos, "label")'), 'guerrero');
  assert.equal(m.lua('SnetForever.Motor.etiqueta({etiquetas = {label = "base"}}, "label")'), 'base');
  assert.equal(m.lua('SnetForever.Motor.etiqueta({etiquetas = {}}, "label")'), undefined);
  sinErrores(m);
});

test('cargar: en la guía de mazmorras del fixture el paso RFC está; en la normal, no', () => {
  const m = nuevaMaquina();
  assert.equal(cargar(m, INICIO_MAZMORRAS), true);
  assert.ok(ids(m).includes('h00000r1'));
  assert.equal(cargar(m, INICIO), true);
  assert.equal(estado(m).clave, INICIO);
  assert.ok(!ids(m).includes('h00000r1'));
  assert.equal(ids(m).length, 6);
  sinErrores(m);
});

test('cargar: mazmorra/sinMazmorra según guia.mazmorras y, sin esos campos, el requisito mazmorra según el tipo', () => {
  const pasos = [
    { mazmorra: 'RFC', elementos: [NOTA] },
    { sinMazmorra: 'RFC', elementos: [NOTA] },
    { requisitos: [{ t: 'mazmorra', d: 'RFC' }], elementos: [NOTA] },
    { requisitos: [{ t: 'mazmorra', d: '!RFC' }], elementos: [NOTA] },
    { requisitos: [{ t: 'mazmorra', d: 'RFC', filtro: [['c:MAGE']] }], elementos: [NOTA] },
    { mazmorra: 'WC', elementos: [NOTA] },
  ];
  const normal = conGuia(pasos, { tipo: 'normal', mazmorras: { RFC: false } });
  cargar(normal);
  assert.deepEqual(ids(normal), ['p2', 'p4', 'p5']);
  sinErrores(normal);
  const conMazmorras = conGuia(pasos, { tipo: 'mazmorras', mazmorras: { RFC: true } });
  cargar(conMazmorras);
  assert.deepEqual(ids(conMazmorras), ['p1', 'p3', 'p5']);
  sinErrores(conMazmorras);
});

// ---------------------------------------------------------------------------------------------------
// Avance
// ---------------------------------------------------------------------------------------------------

test('accept 4641 sin la misión → actual 1; con QUEST_ACCEPTED(4641), tras avanzar(0.3) → actual 2', () => {
  const m = conGuia([{ elementos: [ACEPTAR(4641)] }, { elementos: [MANUAL] }]);
  const cambios = contar(m, 'SNF_PASOS_CAMBIADOS');
  cargar(m);
  assert.equal(actual(m), 1);
  assert.equal(paso(m, 1).elementos[0].resultado, 'pendiente');
  m.avanzar(0.3);
  assert.equal(actual(m), 1);
  const antes = cambios().n;
  m.estadoMision(4641, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 4641);
  m.avanzar(0.3);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 1).hecho, true);
  assert.equal(paso(m, 1).saltado, false);
  assert.deepEqual(estado(m).activos, [2]);
  assert.ok(cambios().n > antes, 'se emite SNF_PASOS_CAMBIADOS al avanzar');
  sinErrores(m);
});

test('eventos: el motor reenvía los argumentos del evento al elemento y lo repasa sin evento cada ~1 s', () => {
  const m = conGuia([{ elementos: [{ t: 'eco' }] }, { elementos: [MANUAL] }]);
  m.lua(`SnetForever.Elementos.registrar("eco", {
    campos = {}, eventos = {"QUEST_TURNED_IN", "PLAYER_LEVEL_UP"},
    evaluar = function(el, mem, evento, a, b)
      if evento then mem.visto = {evento, a, b} else mem.repasos = (mem.repasos or 0) + 1 end
      return "pendiente"
    end,
  })`);
  cargar(m);
  assert.equal(paso(m, 1).elementos[0].mem.repasos, 1, 'se evalúa al activarse');
  m.disparar('QUEST_TURNED_IN', 77, 120, 35);
  assert.deepEqual(paso(m, 1).elementos[0].mem.visto, ['QUEST_TURNED_IN', 77, 120]);
  m.disparar('PLAYER_LEVEL_UP', 2);
  assert.deepEqual(paso(m, 1).elementos[0].mem.visto, ['PLAYER_LEVEL_UP', 2]);
  m.avanzar(2.1);
  assert.ok(paso(m, 1).elementos[0].mem.repasos >= 3, 'repaso periódico con evento nil');
  assert.equal(actual(m), 1);
  sinErrores(m);
});

// T1: antes, un paso por ciclo. Ahora el ciclo pasa de largo por todos los ya hechos que vienen detrás del actual.
test('todos los ya hechos en un ciclo: al completarse el actual, los dos siguientes ya hechos pasan en el mismo ciclo', () => {
  const m = conGuia([{ elementos: [ACEPTAR(4640)] }, { elementos: [ACEPTAR(4641)] }, { elementos: [ACEPTAR(788)] },
    { elementos: [MANUAL] }]);
  m.estadoMision(4641, { enDiario: true });
  m.estadoMision(788, { enDiario: true });
  cargar(m);
  assert.equal(actual(m), 1, 'el primero aún tiene trabajo');
  assert.deepEqual(estado(m).siguientes, [4], 'los ya hechos no salen en la lista');
  m.estadoMision(4640, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 1, 4640);
  const ciclos = m.lua('SnetForever.Motor.ciclos');
  actualizar(m);
  assert.equal(actual(m), 4);
  assert.equal(m.lua('SnetForever.Motor.ciclos'), ciclos + 1);
  assert.equal(paso(m, 2).hecho, true);
  assert.equal(paso(m, 3).hecho, true);
  assert.deepEqual(pj(m).saltados, [], 'se completan, no van a saltados');
  sinErrores(m);
});

test('al cargar, los ya hechos del principio pasan sin esperar al ciclo', () => {
  const m = conGuia([{ elementos: [ACEPTAR(4641)] }, { elementos: [ACEPTAR(788)] }, { elementos: [MANUAL] }]);
  m.estadoMision(4641, { enDiario: true });
  m.estadoMision(788, { enDiario: true });
  cargar(m);
  assert.equal(actual(m), 3);
  assert.equal(pj(m).progreso[CLAVE].id, 'p3');
  sinErrores(m);
});

test('el temporizador de 0,2 s hace los ciclos solo', () => {
  const m = conGuia([{ elementos: [ACEPTAR(4641)] }, { elementos: [NOTA] }, { elementos: [MANUAL] }]);
  cargar(m);
  assert.equal(actual(m), 1);
  m.estadoMision(4641, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 1, 4641);
  const ciclos = m.lua('SnetForever.Motor.ciclos');
  m.avanzar(1);
  assert.equal(actual(m), 3);
  const hechos = m.lua('SnetForever.Motor.ciclos') - ciclos;
  // Tarea 10: el temporizador solo hace un ciclo si se pidió. T1: un ciclo para el avance (el de nota pasa en el mismo)
  // y alguno más que ya no cambia nada.
  assert.ok(hechos >= 1 && hechos <= 5, `ciclos en 1 s: ${hechos}`);
  sinErrores(m);
});

test('un paso con solo nota pasa solo; un manual espera hasta marcarManual(i, 1, true)', () => {
  const m = conGuia([{ elementos: [NOTA] }, { elementos: [MANUAL, NOTA] }, { elementos: [MANUAL] }]);
  cargar(m);
  actualizar(m);
  assert.equal(actual(m), 2);
  actualizar(m);
  actualizar(m);
  assert.equal(actual(m), 2);
  m.lua('SnetForever.Motor.marcarManual(2, 1, true)');
  assert.equal(paso(m, 2).elementos[0].resultado, 'hecho');
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].manuales.p2[1]`), true);
  actualizar(m);
  assert.equal(actual(m), 3);
  sinErrores(m);
});

test('marcarManual: la marca se guarda, vuelve al activar el paso y se quita con false', () => {
  const m = conGuia([{ elementos: [MANUAL, MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)');
  const m2 = m.recargar();
  cargar(m2);
  assert.equal(paso(m2, 1).elementos[0].resultado, 'hecho');
  assert.equal(paso(m2, 1).elementos[1].resultado, 'pendiente');
  m2.lua('SnetForever.Motor.marcarManual(1, 1, false)');
  assert.equal(paso(m2, 1).elementos[0].resultado, 'pendiente');
  assert.equal(m2.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].manuales.p1`), undefined);
  sinErrores(m2);
});

// Tarea D3: la casilla de una línea da su elemento por hecho a mano (como RestedXP, GW:1096-1101). Se guarda por
// personaje, como lo saltado, en progreso.forzados[id][k].
test('marcarHecho: el elemento queda hecho a mano, se guarda y, si es el último pendiente, la guía avanza', () => {
  const m = conGuia([{ elementos: [ACEPTAR(789), MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  actualizar(m);
  assert.equal(paso(m, 1).elementos[0].resultado, 'pendiente');
  m.lua('SnetForever.Motor.marcarHecho(1, 1)');
  assert.equal(paso(m, 1).elementos[0].resultado, 'hecho');
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].forzados.p1[1]`), true);
  actualizar(m);
  assert.equal(actual(m), 1, 'queda el manual: no avanza');
  // En un manual, marcarHecho es marcarManual: el paso queda completo y la guía pasa al siguiente.
  m.lua('SnetForever.Motor.marcarHecho(1, 2, true)');
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].manuales.p1[2]`), true);
  actualizar(m);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 1).saltado, false, 'el paso no va a saltados');
  assert.deepEqual(pj(m).saltados, []);
  sinErrores(m);
});

test('marcarHecho: la marca sobrevive a un evento, vuelve al recargar y se quita con false', () => {
  const m = conGuia([{ elementos: [ACEPTAR(789), ACEPTAR(790)] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.lua('SnetForever.Motor.marcarHecho(1, 1, true)');
  m.disparar('QUEST_LOG_UPDATE');
  m.lua('SnetForever.Motor.actualizar()');
  assert.equal(paso(m, 1).elementos[0].resultado, 'hecho', 'un evento no la borra');
  const m2 = m.recargar();
  cargar(m2);
  assert.equal(paso(m2, 1).elementos[0].resultado, 'hecho');
  assert.equal(paso(m2, 1).elementos[1].resultado, 'pendiente');
  m2.lua('SnetForever.Motor.marcarHecho(1, 1, false)');
  assert.equal(paso(m2, 1).elementos[0].resultado, 'pendiente');
  assert.equal(m2.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].forzados.p1`), undefined);
  // Fuera de rango o sin guía no hace nada.
  m2.lua('SnetForever.Motor.marcarHecho(99, 1); SnetForever.Motor.marcarHecho(1, 99)');
  sinErrores(m2);
});

// Ronda 1 de la D3 y F3-23: las marcas a mano (forzados y manuales) de una guía se borran al acabarla; cambiar de guía
// no las borra.
test('marcas a mano: se borran al acabar la guía; se quedan mientras se sigue en ella y al cambiar de guía', () => {
  const m = conGuia([{ elementos: [ACEPTAR(789), MANUAL] }, { elementos: [ACEPTAR(790)] }]);
  cargar(m);
  m.lua('SnetForever.Motor.marcarHecho(1, 1); SnetForever.Motor.marcarManual(1, 2, true)');
  const forzado = (id, k) => m.lua(`(SnetForeverPJ.progreso[${aLua(CLAVE)}].forzados[${aLua(id)}] or {})[${k}]`);
  actualizar(m);
  assert.equal(actual(m), 2);
  assert.equal(forzado('p1', 1), true, 'mientras se sigue en la guía, se quedan');
  // «Ir a» un paso todo marcado: vuelve con sus marcas. T4: se queda retenido; al seguir, el ciclo lo da por hecho.
  m.lua('SnetForever.Motor.irA(1)');
  assert.equal(paso(m, 1).elementos[0].resultado, 'hecho');
  actualizar(m);
  assert.equal(actual(m), 1, 'T4: retenido');
  m.lua('SnetForever.Motor.seguir()');
  assert.equal(actual(m), 2);
  m.lua('SnetForever.Motor.marcarHecho(2, 1)');
  actualizar(m);
  assert.equal(estado(m).fin, true);
  assert.equal(m.lua(`next(SnetForeverPJ.progreso[${aLua(CLAVE)}].forzados) == nil`), true, 'al acabar la guía se borran');
  assert.equal(m.lua(`next(SnetForeverPJ.progreso[${aLua(CLAVE)}].manuales) == nil`), true);
  // Ruling F3-23: cambiar de guía (una lateral y volver) no las borra: son de la guía de su clave.
  cargar(m);
  m.lua('SnetForever.Motor.irA(1); SnetForever.Motor.marcarHecho(1, 1)');
  assert.equal(forzado('p1', 1), true);
  cargar(m, INICIO);
  assert.equal(forzado('p1', 1), true, 'al cambiar de guía se quedan');
  cargar(m);
  assert.equal(paso(m, 1).elementos[0].resultado, 'hecho', 'al volver, el elemento sigue hecho a mano');
  // Motor.olvidarMarcas(clave) las borra (lo usa la ventana al elegir la guía a mano en el selector).
  m.lua(`SnetForever.Motor.olvidarMarcas(${aLua(CLAVE)})`);
  assert.equal(m.lua(`next(SnetForeverPJ.progreso[${aLua(CLAVE)}].forzados) == nil`), true, 'olvidarMarcas las borra');
  m.lua('SnetForever.Motor.olvidarMarcas("No existe")');
  sinErrores(m);
});

test('marcas a mano: al acabar una guía que pasa sola a la siguiente, también se borran (F3-23)', () => {
  const m = conGuia([{ elementos: [ACEPTAR(789), MANUAL] }], { siguientes: [{ clave: INICIO }] });
  cargar(m);
  m.lua('SnetForever.Motor.marcarHecho(1, 1); SnetForever.Motor.marcarManual(1, 2, true)');
  actualizar(m);
  assert.equal(estado(m).clave, INICIO, 'pasó a la guía siguiente');
  assert.equal(m.lua(`next(SnetForeverPJ.progreso[${aLua(CLAVE)}].forzados) == nil`), true);
  assert.equal(m.lua(`next(SnetForeverPJ.progreso[${aLua(CLAVE)}].manuales) == nil`), true);
  sinErrores(m);
});

test('un paso sin elementos tras filtrar se da por hecho al activarse', () => {
  const m = conGuia([{ elementos: [{ ...NOTA, filtro: [['c:MAGE']] }] }, { elementos: [MANUAL] }]);
  cargar(m);
  assert.equal(paso(m, 1).elementos.length, 0);
  assert.equal(paso(m, 1).hecho, true);
  actualizar(m);
  assert.equal(actual(m), 2);
  sinErrores(m);
});

test('isOnQuest sin la misión → el paso pasa y saltados sigue vacío', () => {
  const m = conGuia([{ elementos: [{ t: 'isOnQuest', qs: [4641] }, MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  actualizar(m);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 1).hecho, true);
  assert.equal(paso(m, 1).saltado, false);
  assert.deepEqual(pj(m).saltados, []);
  sinErrores(m);
});

test('estado().siguientes: los pasos que vienen detrás del actual', () => {
  const m = conGuia([{ elementos: [MANUAL] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  assert.deepEqual(estado(m).siguientes, [2, 3]);
  m.lua('SnetForever.Motor.saltar(1)');
  assert.deepEqual(estado(m).siguientes, [3]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// «Saltar», retomar y quitar
// ---------------------------------------------------------------------------------------------------

test('saltar(1) → actual 2 y saltados[1] con clave, id, n, resumen y fecha; saltarlo otra vez no lo repite', () => {
  const m = conGuia([{ elementos: [ACEPTAR(4641)] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.lua('SnetForever.Motor.saltar(1)');
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 1).saltado, true);
  assert.equal(paso(m, 1).hecho, true);
  const saltados = pj(m).saltados;
  assert.equal(saltados.length, 1);
  assert.equal(saltados[0].clave, CLAVE);
  assert.equal(saltados[0].id, 'p1');
  assert.equal(saltados[0].n, 1);
  assert.equal(saltados[0].resumen, 'Acepta Tu lugar en el mundo'); // Motor.resumir es Texto.resumenPaso (tarea 14)
  assert.match(saltados[0].fecha, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  m.lua('SnetForever.Motor.saltar(1)');
  assert.equal(pj(m).saltados.length, 1);
  assert.equal(actual(m), 2);
  sinErrores(m);
});

test('retomar(clave, id1) → activos = {1, actual}; al aceptar 4641 el 1 se completa y sale de saltados', () => {
  const m = conGuia([{ elementos: [ACEPTAR(4641)] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.lua('SnetForever.Motor.saltar(1)');
  assert.equal(m.lua(`SnetForever.Motor.retomar(${aLua(CLAVE)}, "p1")`), true);
  assert.equal(pj(m).retomados[CLAVE].p1, true);
  assert.deepEqual(estado(m).activos, [1, 2]);
  assert.equal(paso(m, 1).saltado, false);
  assert.equal(paso(m, 1).hecho, false);
  m.avanzar(0.3);
  assert.deepEqual(estado(m).activos, [1, 2]);
  m.estadoMision(4641, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 4641);
  m.avanzar(0.3);
  assert.deepEqual(pj(m).saltados, []);
  assert.equal(pj(m).retomados[CLAVE]?.p1, undefined);
  assert.deepEqual(estado(m).activos, [2]);
  assert.equal(paso(m, 1).hecho, true);
  assert.equal(actual(m), 2);
  sinErrores(m);
});

test('retomar: un paso que no está en saltados da false; tras /reload el retomado sigue activo', () => {
  const m = conGuia([{ elementos: [ACEPTAR(4641)] }, { elementos: [MANUAL] }]);
  cargar(m);
  assert.equal(m.lua(`SnetForever.Motor.retomar(${aLua(CLAVE)}, "p2")`), false);
  m.lua('SnetForever.Motor.saltar(1)');
  m.lua(`SnetForever.Motor.retomar(${aLua(CLAVE)}, "p1")`);
  const m2 = m.recargar();
  cargar(m2);
  assert.deepEqual(estado(m2).activos, [1, 2]);
  sinErrores(m2);
});

test('quitarSaltado: lo quita de saltados y de retomados y deja de estar activo', () => {
  const m = conGuia([{ elementos: [ACEPTAR(4641)] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.lua('SnetForever.Motor.saltar(1)');
  m.lua(`SnetForever.Motor.retomar(${aLua(CLAVE)}, "p1")`);
  m.lua(`SnetForever.Motor.quitarSaltado(${aLua(CLAVE)}, "p1")`);
  assert.deepEqual(pj(m).saltados, []);
  assert.equal(pj(m).retomados[CLAVE]?.p1, undefined);
  assert.deepEqual(estado(m).activos, [2]);
  assert.equal(paso(m, 1).hecho, true);
  sinErrores(m);
});

test('irA(i): fija el actual; los anteriores cuentan como hechos y los posteriores no', () => {
  const m = conGuia([{ elementos: [MANUAL] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.lua('SnetForever.Motor.irA(3)');
  assert.equal(actual(m), 3);
  assert.equal(paso(m, 2).hecho, true);
  assert.equal(pj(m).progreso[CLAVE].id, 'p3');
  m.lua('SnetForever.Motor.irA(1)');
  assert.equal(actual(m), 1);
  assert.equal(paso(m, 2).hecho, false);
  assert.deepEqual(estado(m).activos, [1]);
  sinErrores(m);
});

// T4: «Ir a» hacia delante ya no da por hechos en silencio los pasos de en medio: los que no están hechos van a
// «Pasos saltados» con motivo ir_a y se pueden retomar. Los que ya estaban hechos, no. Las marcas a mano no se tocan.
test('T4: irA hacia delante deja en saltados los pasos de en medio sin hacer, con motivo ir_a', () => {
  const m = conGuia([
    { elementos: [MANUAL, MANUAL] }, // p1: el actual, a medias
    { elementos: [ACEPTAR(788)] }, // p2: ya hecho (788 en el diario)
    { elementos: [MANUAL] }, // p3
    { elementos: [MANUAL] }, // p4
    { elementos: [MANUAL] }, // p5: el destino
  ]);
  m.estadoMision(788, { enDiario: true });
  cargar(m);
  assert.equal(actual(m), 1);
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)');
  assert.deepEqual(m.lua('SnetForever.Motor.saltosDeIrA(5)'), [1, 3, 4], 'lo que la ventana avisa antes de ir');
  assert.deepEqual(m.lua('SnetForever.Motor.saltosDeIrA(1)'), [], 'hacia atrás no se salta nada');
  m.lua('SnetForever.Motor.irA(5)');
  assert.equal(actual(m), 5);
  assert.deepEqual(pj(m).saltados.map((s) => [s.id, s.motivo]), [['p1', 'ir_a'], ['p3', 'ir_a'], ['p4', 'ir_a']]);
  assert.equal(paso(m, 3).saltado, true);
  assert.equal(paso(m, 2).saltado, false, 'el ya hecho no va a saltados');
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].manuales.p1[1]`), true, 'las marcas a mano se quedan');
  // Se pueden retomar: vuelve a estar activo aunque quede atrás.
  assert.equal(m.lua(`SnetForever.Motor.retomar(${aLua(CLAVE)}, "p3")`), true);
  assert.deepEqual(estado(m).activos, [3, 5]);
  // Volver atrás, antes de ellos, los devuelve al camino: ya no son saltos.
  m.lua('SnetForever.Motor.irA(1)');
  assert.deepEqual(pj(m).saltados, []);
  assert.equal(paso(m, 4).hecho, false);
  assert.equal(paso(m, 4).saltado, false);
  sinErrores(m);
});

test('T4: irA a un paso saltado lo retoma; el ir_a de un paso saltado por otro motivo no lo cambia', () => {
  const m = conGuia([{ elementos: [MANUAL] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.lua('SnetForever.Motor.saltar(2)');
  m.lua('SnetForever.Motor.irA(4)');
  assert.deepEqual(pj(m).saltados.map((s) => [s.id, s.motivo]), [['p2', undefined], ['p1', 'ir_a'], ['p3', 'ir_a']]);
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 2).saltado, false);
  assert.equal(paso(m, 2).hecho, false);
  assert.equal(pj(m).retomados[CLAVE].p2, true, 'el elegido se retoma');
  assert.deepEqual(pj(m).saltados.map((s) => s.id), ['p2', 'p1'], 'el p3 vuelve al camino; el p1 queda atrás, saltado');
  sinErrores(m);
});

// T4: antes, «Ir a» un paso de atrás que ya estaba hecho rebotaba al ciclo siguiente (0,2 s). Ahora se queda
// «retenido» hasta que el jugador sigue (Motor.seguir), marca algo o elige otro paso.
// Ronda 1 de T4 (I3): un pegajoso no se retiene. Con pegajosos al final, irA a uno de ellos dejaba el actual en
// #pasos + 1 retenido (invisible) y la guía no acababa ni cargaba la siguiente.
test('T4: irA a un pegajoso que queda atrás no retiene nada; la guía acaba y carga la siguiente', () => {
  const m = conGuia([
    { elementos: [MANUAL] }, { elementos: [MANUAL] },
    { elementos: [ACEPTAR(789)], etiquetas: { sticky: true } },
  ], { siguientes: [{ clave: INICIO }] });
  cargar(m);
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)');
  m.avanzar(0.3);
  m.lua('SnetForever.Motor.marcarManual(2, 1, true)');
  m.avanzar(0.3);
  assert.equal(actual(m), 4, 'esperando al pegajoso, pasado el último paso');
  m.lua('SnetForever.Motor.irA(2)'); // un paso normal hacia atrás sí se retiene
  assert.deepEqual(m.lua('{SnetForever.Motor.retenido()}'), [2, true]);
  m.lua('SnetForever.Motor.irA(3)'); // el pegajoso lo suelta sin retener otro
  assert.deepEqual(m.lua('{SnetForever.Motor.retenido()}'), []);
  assert.equal(actual(m), 4);
  m.lua('SnetForever.Motor.irA(3)'); // y desde #pasos + 1, hacia atrás, tampoco retiene
  assert.deepEqual(m.lua('{SnetForever.Motor.retenido()}'), []);
  assert.equal(actual(m), 4);
  m.avanzar(0.6);
  m.estadoMision(789, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 1, 789);
  m.avanzar(1);
  assert.equal(estado(m).clave, INICIO, 'acaba la guía y carga la siguiente');
  sinErrores(m);
});

test('T4: irA hacia atrás a un paso hecho se queda en él tras varios ciclos, y al soltarlo avanza', () => {
  const m = conGuia([{ elementos: [ACEPTAR(4641)] }, { elementos: [ACEPTAR(788)] }, { elementos: [MANUAL] }]);
  m.estadoMision(4641, { enDiario: true });
  m.estadoMision(788, { enDiario: true });
  cargar(m);
  assert.equal(actual(m), 3);
  assert.deepEqual(m.lua('{SnetForever.Motor.retenido()}'), []);
  m.lua('SnetForever.Motor.irA(1)');
  assert.equal(actual(m), 1);
  assert.deepEqual(m.lua('{SnetForever.Motor.retenido()}'), [1, true], 'retenido y ya hecho');
  for (let k = 0; k < 4; k++) actualizar(m);
  m.avanzar(2);
  assert.equal(actual(m), 1, 'ni el ciclo ni el adelanto lo pasan');
  assert.deepEqual(pj(m).saltados, []);
  // «Seguir»: el adelanto lo coloca en el primer paso que de verdad falta.
  m.lua('SnetForever.Motor.seguir()');
  assert.equal(actual(m), 3);
  assert.deepEqual(m.lua('{SnetForever.Motor.retenido()}'), []);
  // Marcar algo también lo suelta.
  m.lua('SnetForever.Motor.irA(2)');
  m.avanzar(1);
  assert.equal(actual(m), 2);
  m.lua('SnetForever.Motor.marcarHecho(3, 1)');
  m.avanzar(0.3);
  assert.equal(estado(m).fin, true, 'suelto, avanza: el 2 ya hecho y el 3 marcado');
  // Hacia delante no retiene.
  m.lua('SnetForever.Motor.irA(1)');
  m.lua('SnetForever.Motor.irA(2)');
  assert.deepEqual(m.lua('{SnetForever.Motor.retenido()}'), []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Progreso
// ---------------------------------------------------------------------------------------------------

test('progreso: tras avanzar a 3, /reload y cargar → actual 3', () => {
  const m = conGuia([{ elementos: [NOTA] }, { elementos: [NOTA] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  const cargadas = contar(m, 'SNF_GUIA_CARGADA');
  cargar(m);
  assert.deepEqual(cargadas(), { n: 1, ultimo: CLAVE });
  actualizar(m);
  actualizar(m);
  assert.equal(actual(m), 3);
  assert.equal(pj(m).guia, CLAVE);
  const progreso = pj(m).progreso[CLAVE];
  assert.equal(progreso.id, 'p3');
  assert.equal(progreso.n, 3);
  for (const campo of ['pegajosos', 'manuales', 'llegados']) assert.ok(campo in progreso, campo);
  const m2 = m.recargar();
  cargar(m2);
  assert.equal(actual(m2), 3);
  assert.equal(paso(m2, 1).hecho, true);
  assert.equal(paso(m2, 2).hecho, true);
  sinErrores(m2);
});

test('progreso: con el id del paso 3 cambiado en los datos y n = 3 → actual = el paso con n 3', () => {
  const pasos = [{ elementos: [NOTA] }, { elementos: [NOTA] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }];
  const m = conGuia(pasos);
  cargar(m);
  actualizar(m);
  actualizar(m);
  assert.equal(actual(m), 3);
  const m2 = m.recargar();
  m2.ponerGuia(guiaDePrueba([
    { elementos: [NOTA] },
    { elementos: [NOTA] },
    { id: 'p2b', n: 2, elementos: [MANUAL] },
    { id: 'p3-nuevo', n: 3, elementos: [MANUAL] },
    { id: 'p4', n: 4, elementos: [MANUAL] },
  ]));
  cargar(m2);
  assert.equal(actual(m2), 4);
  assert.equal(paso(m2, 4).id, 'p3-nuevo');
  sinErrores(m2);
});

test('progreso: Motor.recargar() vuelve a filtrar y conserva el paso actual por id', () => {
  const m = conGuia([
    { elementos: [NOTA] },
    { elementos: [NOTA] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  actualizar(m);
  actualizar(m);
  assert.equal(actual(m), 3);
  m.ponerGuia(guiaDePrueba([
    { id: 'p0', n: 0, elementos: [NOTA] },
    { elementos: [NOTA] },
    { elementos: [NOTA] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ].map((p, i) => (i === 0 ? p : { ...p, id: `p${i}`, n: i }))));
  const cambios = contar(m, 'SNF_PASOS_CAMBIADOS');
  m.lua('SnetForever.Motor.recargar()');
  assert.equal(actual(m), 4);
  assert.equal(paso(m, 4).id, 'p3');
  assert.ok(cambios().n >= 1);
  sinErrores(m);
});

test('cargar con opciones.n empieza en el primer paso con n mayor o igual, sin mirar el progreso', () => {
  const m = conGuia([{ elementos: [NOTA] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  actualizar(m);
  assert.equal(actual(m), 2);
  cargar(m, CLAVE, { n: 4 });
  assert.equal(actual(m), 4);
  assert.equal(pj(m).progreso[CLAVE].id, 'p4');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Fin de la guía
// ---------------------------------------------------------------------------------------------------

test('fin: último paso hecho → carga 02-03 Sigue', () => {
  const m = conGuia([{ elementos: [NOTA] }], { siguientes: [{ clave: SIGUE }] });
  const cargadas = contar(m, 'SNF_GUIA_CARGADA');
  cargar(m);
  actualizar(m);
  const e = estado(m);
  assert.equal(e.clave, SIGUE);
  assert.equal(e.actual, 1);
  assert.equal(e.fin, false);
  assert.equal(pj(m).guia, SIGUE);
  assert.equal(cargadas().ultimo, SIGUE);
  sinErrores(m);
});

test('fin: una entrada de siguientes con filtro que no aplica, sin clave o sin guía se salta', () => {
  const m = conGuia([{ elementos: [NOTA] }], {
    siguientes: [
      { clave: SIGUE, filtro: [['c:MAGE']] },
      { sinResolver: 'Algo que no se encontró' },
      { clave: 'No\\existe' },
      { clave: SKYBORNE },
    ],
  });
  cargar(m);
  actualizar(m);
  assert.equal(estado(m).clave, SKYBORNE);
  sinErrores(m);
});

test('fin: sin ninguna siguiente válida, estado().fin == true', () => {
  const m = conGuia([{ elementos: [NOTA] }, { elementos: [NOTA] }], { siguientes: [{ clave: SIGUE, filtro: [['c:MAGE']] }] });
  cargar(m);
  assert.equal(estado(m).fin, false);
  assert.equal(actual(m), 2, 'T1: al cargar pasa el de nota y se queda en el último');
  actualizar(m);
  const e = estado(m);
  assert.equal(e.fin, true);
  assert.equal(e.clave, CLAVE);
  assert.deepEqual(e.activos, []);
  actualizar(m);
  assert.equal(estado(m).fin, true);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglos de la ronda 1
// ---------------------------------------------------------------------------------------------------

// Un oyente de SNF_GUIA_CARGADA que apunta la clave, los activos y el id del primer activo que ve en ese momento.
function vigilarCarga(m) {
  m.lua(`VISTO_CARGA = {}
  SnetForever.Eventos.escuchar("SNF_GUIA_CARGADA", function(c)
    local e = SnetForever.Motor.estado()
    local primero = e.activos[1] and SnetForever.Motor.paso(e.activos[1])
    VISTO_CARGA[#VISTO_CARGA + 1] = {clave = c, activos = e.activos, id = primero and primero.id}
  end)`);
  return () => m.lua('VISTO_CARGA');
}

test('SNF_GUIA_CARGADA: el oyente ya ve los activos de la guía nueva, al cargar y al pasar sola a la siguiente', () => {
  const m = conGuia([{ elementos: [NOTA] }, { elementos: [NOTA] }], { siguientes: [{ clave: SIGUE }] });
  const vistos = vigilarCarga(m);
  cargar(m);
  // T1: el paso 1 (solo nota) ya está hecho: al cargar se pasa al 2, que es el último.
  assert.deepEqual(vistos()[0], { clave: CLAVE, activos: [2], id: 'p2' });
  actualizar(m);
  assert.equal(estado(m).clave, SIGUE);
  assert.deepEqual(vistos()[1], { clave: SIGUE, activos: [1], id: 'h0000101' });
  sinErrores(m);
});

test('quitarSaltado de un paso de más adelante: deja de estar hecho y vuelve a siguientes', () => {
  const m = conGuia([{ elementos: [MANUAL] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.lua('SnetForever.Motor.saltar(3)');
  assert.deepEqual(estado(m).siguientes, [2]);
  m.lua(`SnetForever.Motor.quitarSaltado(${aLua(CLAVE)}, "p3")`);
  assert.equal(paso(m, 3).hecho, false);
  assert.equal(paso(m, 3).saltado, false);
  assert.deepEqual(estado(m).siguientes, [2, 3]);
  sinErrores(m);
});

test('un evaluador que lanza error da pendiente: el paso no avanza y el error va a geterrorhandler()', () => {
  const m = conGuia([{ elementos: [{ t: 'roto' }] }, { elementos: [MANUAL] }]);
  m.lua(`SnetForever.Elementos.registrar("roto", {
    campos = {}, eventos = {}, evaluar = function() error("evaluador roto") end,
  })`);
  cargar(m);
  assert.equal(paso(m, 1).elementos[0].resultado, 'pendiente');
  actualizar(m);
  m.avanzar(1.1);
  assert.equal(actual(m), 1);
  assert.equal(m.errores().length, 1);
  assert.match(m.errores()[0], /evaluador roto/);
});

test('un paso sin id usa la clave de respaldo "n:<n>" para manuales, saltados y retomados', () => {
  const g = guiaDePrueba([{ elementos: [MANUAL, MANUAL] }, { elementos: [MANUAL] }]);
  delete g.pasos[0].id;
  const m = nuevaMaquina();
  m.ponerGuia(g);
  cargar(m);
  assert.equal(paso(m, 1).id, 'n:1');
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)');
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].manuales["n:1"][1]`), true);
  const m2 = m.recargar();
  cargar(m2);
  assert.equal(actual(m2), 1);
  assert.equal(paso(m2, 1).elementos[0].resultado, 'hecho');
  m2.lua('SnetForever.Motor.saltar(1)');
  assert.equal(pj(m2).saltados[0].id, 'n:1');
  assert.equal(m2.lua(`SnetForever.Motor.retomar(${aLua(CLAVE)}, "n:1")`), true);
  assert.deepEqual(estado(m2).activos, [1, 2]);
  sinErrores(m2);
});
