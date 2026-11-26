// T1: la guía se coloca sola en el primer paso que de verdad falta (motor/pasos.lua, «Ver hacia delante»). Al cargar y en
// cada ciclo se pasa de largo, en el mismo ciclo, por los pasos ya hechos (todos sus elementos puros o informativos y
// hechos) y por los viajes cuyo destino ya no tiene trabajo. Fixture inventado: ni nombres de personajes ni texto de guías
// de terceros.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = guiaDePrueba([]).clave;

const MISION_ENTREGADA = 95101;
const MISION_DUENA = 95102;
const MISION_NUEVA = 95103;
const OBJETO = 95013;
const NOMBRE_OBJETO = 'Especias de prueba';
const HECHIZO = 2550;
const MAESTRO = 96101;
const MAPA_LEJOS = 1420;

const texto = (es) => ({ en: es, es });

// Los pasos del caso: el jugador está en el mapa 1411 y la guía le manda a otro mapa, pero lo que hay allí ya lo tiene.
const PASOS = [
  // 1: pegajoso «ve a la torre» (#completewith next).
  { etiquetas: { completewith: 'next' }, elementos: [{ t: 'manual', texto: texto('Ve a la torre') }] },
  // 2: viaje a otro mapa.
  { elementos: [{ t: 'zone', mapa: MAPA_LEJOS, texto: texto('Llega a los Llanos lejanos') }] },
  // 3: accept de una misión ya entregada.
  { elementos: [{ t: 'accept', q: MISION_ENTREGADA }] },
  // 4: train ya aprendido.
  { elementos: [{ t: 'train', spell: HECHIZO, efecto: 'objetivo' }] },
  // 5: vendor + collect de un objeto para una misión que el diario tiene completa.
  { elementos: [{ t: 'vendor', texto: texto('Compra especias') }, { t: 'collect', i: OBJETO, n: 1 }] },
  // 6: fp con su maestro ya conocido.
  { elementos: [{ t: 'target', npcs: [{ nombre: 'Maestro de prueba', id: MAESTRO }] }, { t: 'fp', nombre: 'Torre' }] },
  // 7: fly con #completewith next.
  { etiquetas: { completewith: 'next' }, elementos: [{ t: 'fly', destino: 'Molino', texto: texto('Vuela al molino') }, { t: 'zoneskip', mapas: [1421] }] },
  // 8: el primer paso con trabajo de verdad: un accept que no tiene.
  { elementos: [{ t: 'accept', q: MISION_NUEVA }] },
];

const cargar = (m) => m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
const estado = (m) => m.lua('SnetForever.Motor.estado()');
const actual = (m) => estado(m).actual;
const paso = (m, i) => m.lua(`SnetForever.Motor.paso(${i})`);
const actualizar = (m) => m.lua('SnetForever.Motor.actualizar()');
const progreso = (m) => m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}]`);

// Máquina con el caso puesto. opciones.dueña = false: el diario no tiene la misión del objeto; opciones.vuelo = false:
// ese vuelo no se conoce.
function caso({ duena = true, vuelo = true, pasos = PASOS } = {}) {
  const m = nuevaMaquina({ jugador: { faccion: 'Horde', mapa: 1411 } });
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`BANCO.mapas[${MAPA_LEJOS}] = {nombre = "Llanos lejanos", inst = 0, tipo = 3, izquierda = 1000, arriba = 1000, ancho = 3000,
    alto = 2000}`);
  m.estadoMision(MISION_ENTREGADA, { entregada: true });
  m.lua(`BANCO.ponerHechizo(${HECHIZO}, "Cocina", true)`);
  m.itemInfo(OBJETO, { nombre: NOMBRE_OBJETO });
  if (duena) {
    m.estadoMision(MISION_DUENA, {
      enDiario: true, completa: true,
      objetivos: [{ texto: `${NOMBRE_OBJETO}: 1/1`, hecho: 1, pedido: 1, terminado: true, tipo: 'item' }],
    });
  } else {
    m.estadoMision(90999, { enDiario: true }); // otra misión: el registro está cargado
  }
  if (vuelo) m.lua(`SnetForeverPJ.vuelos = {npcs = {[${MAESTRO}] = true}, nombres = {}}`);
  return m;
}

test('esPuro: los tipos que leen el estado sí; manual, vendor, fly y goto objetivo no', () => {
  const m = nuevaMaquina();
  const puro = (el) => m.lua(`SnetForever.Elementos.esPuro(${aLua(el)})`);
  for (const el of [{ t: 'accept', q: 1 }, { t: 'turnin', q: 1 }, { t: 'complete', q: 1, objetivo: 1 }, { t: 'collect', i: 1, n: 1 },
    { t: 'train', spell: 1, efecto: 'objetivo' }, { t: 'fp' }, { t: 'zoneskip', mapas: [1] }, { t: 'isOnQuest', qs: [1] },
    { t: 'nota' }, { t: 'goto', mapa: 1, modo: 'paso' }]) {
    assert.equal(puro(el), true, el.t);
  }
  for (const el of [{ t: 'manual' }, { t: 'vendor' }, { t: 'trainer' }, { t: 'fly' }, { t: 'hs' }, { t: 'cast', spells: [1] },
    { t: 'goto', mapa: 1, modo: 'objetivo' }, { t: 'desconocido' }]) {
    assert.equal(puro(el), false, el.t);
  }
  sinErrores(m);
});

test('al cargar, en un solo ciclo: el actual es el primer paso con trabajo y lo de antes queda completado, no saltado', () => {
  const m = caso();
  assert.equal(cargar(m), true);
  assert.equal(actual(m), 8, 'ya al cargar');
  const ciclos = m.lua('SnetForever.Motor.ciclos');
  actualizar(m);
  assert.equal(actual(m), 8);
  assert.equal(m.lua('SnetForever.Motor.ciclos'), ciclos + 1);
  for (const i of [2, 3, 4, 5, 6]) {
    assert.equal(paso(m, i).hecho, true, `paso ${i} hecho`);
    assert.equal(paso(m, i).saltado, false, `paso ${i} no saltado`);
  }
  assert.deepEqual(m.lua('SnetForeverPJ.saltados'), []);
  assert.equal(progreso(m).id, 'p8');
  // El fly con #completewith next acompaña al paso 8; el «ve a la torre» ya se cerró.
  assert.ok(estado(m).activos.includes(7), 'el fly pegajoso sigue activo');
  assert.ok(estado(m).activos.includes(8));
  assert.equal(paso(m, 1).hecho, true);
  sinErrores(m);
});

test('variante: con el collect sin dueña, el viaje sigue mandando; el paso del collect es el primero con trabajo detrás', () => {
  const m = caso({ duena: false });
  cargar(m);
  actualizar(m);
  assert.equal(actual(m), 2, 'el zone sigue siendo el actual');
  assert.equal(estado(m).siguientes[0], 5, 'los ya hechos (3 y 4) no salen en la lista');
  assert.deepEqual(m.lua('SnetForeverPJ.saltados'), []);
  // Al llegar al mapa, en un ciclo pasa los ya hechos y se para en el collect.
  m.jugador({ mapa: MAPA_LEJOS });
  m.disparar('ZONE_CHANGED_NEW_AREA');
  actualizar(m);
  assert.equal(actual(m), 5);
  sinErrores(m);
});

test('variante: con el vuelo desconocido, el viaje sigue mandando y la mirada hacia delante se para en el fp', () => {
  const m = caso({ vuelo: false });
  cargar(m);
  actualizar(m);
  assert.equal(actual(m), 2);
  assert.equal(estado(m).siguientes[0], 6, 'el fp es el primero que sale en la lista');
  m.jugador({ mapa: MAPA_LEJOS });
  m.disparar('ZONE_CHANGED_NEW_AREA');
  actualizar(m);
  assert.equal(actual(m), 6, 'se para en el fp');
  sinErrores(m);
});

test('con el progreso guardado: al volver a entrar, desde el paso guardado hasta el primero con trabajo', () => {
  const m = caso({ duena: false });
  cargar(m);
  m.lua('SnetForever.Motor.irA(3)');
  assert.equal(progreso(m).id, 'p3');
  // Ahora el diario tiene la misión dueña completa y el jugador recarga.
  m.estadoMision(MISION_DUENA, {
    enDiario: true, completa: true,
    objetivos: [{ texto: `${NOMBRE_OBJETO}: 1/1`, hecho: 1, pedido: 1, terminado: true, tipo: 'item' }],
  });
  // El arranque vuelve a cargar sola la guía guardada (SnetForeverPJ.guia), con su progreso.
  const m2 = m.recargar();
  assert.equal(estado(m2).clave, CLAVE);
  assert.equal(actual(m2), 8);
  sinErrores(m2);
});

test('un paso con un fly o un vendor solo de por medio no se da por hecho', () => {
  const conFly = caso({
    pasos: [{ elementos: [{ t: 'accept', q: MISION_ENTREGADA }] }, { elementos: [{ t: 'fly', destino: 'Molino' }] },
      { elementos: [{ t: 'accept', q: MISION_NUEVA }] }],
  });
  cargar(conFly);
  assert.equal(actual(conFly), 2, 'el fly es un viaje con trabajo detrás');
  sinErrores(conFly);

  const conVendor = caso({
    pasos: [{ elementos: [{ t: 'accept', q: MISION_ENTREGADA }] }, { elementos: [{ t: 'vendor' }] },
      { elementos: [{ t: 'accept', q: MISION_NUEVA }] }],
  });
  cargar(conVendor);
  assert.equal(actual(conVendor), 2, 'un vendor solo no se sabe: pendiente');
  sinErrores(conVendor);
});

test('un viaje al final de la guía, sin nada detrás, no se da por hecho', () => {
  const m = caso({ pasos: [{ elementos: [{ t: 'accept', q: MISION_ENTREGADA }] }, { elementos: [{ t: 'zone', mapa: MAPA_LEJOS }] }] });
  cargar(m);
  assert.equal(actual(m), 2);
  assert.equal(estado(m).fin, false);
  sinErrores(m);
});

test('todo hecho hasta el final: al cargar se queda en el último paso y el primer ciclo acaba la guía', () => {
  const m = caso({ pasos: [{ elementos: [{ t: 'accept', q: MISION_ENTREGADA }] }, { elementos: [{ t: 'train', spell: HECHIZO, efecto: 'objetivo' }] }] });
  cargar(m);
  assert.equal(actual(m), 2);
  assert.equal(estado(m).fin, false, 'al cargar no se acaba la guía');
  actualizar(m);
  assert.equal(estado(m).fin, true);
  assert.deepEqual(m.lua('SnetForeverPJ.saltados'), []);
  sinErrores(m);
});

test('dos guías ya hechas que se mandan una a la otra: una por ciclo, nunca sin fin', () => {
  const m = nuevaMaquina({ jugador: { faccion: 'Horde', mapa: 1411 } });
  m.estadoMision(MISION_ENTREGADA, { entregada: true });
  const A = 'Prueba\\01-02 Ida';
  const B = 'Prueba\\02-03 Vuelta';
  const pasos = [{ elementos: [{ t: 'accept', q: MISION_ENTREGADA }] }];
  m.ponerGuia(guiaDePrueba(pasos, { clave: A, nombre: '01-02 Ida', siguientes: [B] }));
  m.ponerGuia(guiaDePrueba(pasos, { clave: B, nombre: '02-03 Vuelta', siguientes: [A] }));
  assert.equal(m.lua(`SnetForever.Motor.cargar(${aLua(A)})`), true);
  assert.equal(estado(m).clave, A, 'al cargar no pasa a otra guía');
  actualizar(m);
  assert.equal(estado(m).clave, B);
  actualizar(m);
  assert.equal(estado(m).clave, A);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1 de la revisión
// ---------------------------------------------------------------------------------------------------

// C1: un pegajoso con trabajo detrás del viaje, que se cierra más allá del bloque, es trabajo: el viaje sigue mandando.
test('C1: un pegajoso pendiente detrás del viaje que se cierra fuera del bloque es trabajo', () => {
  const JABALIES = 95104;
  const pasos = [
    { elementos: [{ t: 'zone', mapa: MAPA_LEJOS }] },
    { etiquetas: { completewith: 'fin' }, elementos: [{ t: 'complete', q: JABALIES, objetivo: 1 }] },
    { elementos: [{ t: 'accept', q: MISION_ENTREGADA }] },
    { elementos: [{ t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'objetivo' }] },
    { etiquetas: { label: 'fin' }, elementos: [{ t: 'turnin', q: JABALIES }] },
  ];
  const m = caso({ pasos });
  m.estadoMision(JABALIES, { enDiario: true, objetivos: [{ texto: 'Jabalí: 0/10', hecho: 0, pedido: 10, terminado: false }] });
  cargar(m);
  actualizar(m);
  assert.equal(actual(m), 1, 'el zone sigue mandando: el pegajoso tiene trabajo allí');
  sinErrores(m);

  // Con #completewith next (se cierra dentro del bloque) no cuenta, como en RestedXP.
  const conNext = caso({ pasos: [pasos[0], { ...pasos[1], etiquetas: { completewith: 'next' } }, ...pasos.slice(2)] });
  conNext.estadoMision(JABALIES, { enDiario: true, objetivos: [{ texto: 'Jabalí: 0/10', hecho: 0, pedido: 10, terminado: false }] });
  cargar(conNext);
  assert.equal(actual(conNext), 4);
  sinErrores(conNext);

  // Con el pegajoso ya hecho (la misión completa), el viaje sobra.
  const hecho = caso({ pasos });
  hecho.estadoMision(JABALIES, { enDiario: true, completa: true });
  cargar(hecho);
  assert.equal(actual(hecho), 4);
  sinErrores(hecho);
});

// I1: siguientes no esconde un complete o turnin de una misión que se acepta en un paso anterior aún pendiente, ni un
// paso que no se puede hacer (sale en gris, como antes).
test('I1: siguientes enseña lo que se hará con una misión que se acepta antes y los no disponibles', () => {
  const m = caso({
    pasos: [{ elementos: [{ t: 'accept', q: MISION_NUEVA }] }, { elementos: [{ t: 'complete', q: MISION_NUEVA, objetivo: 1 }] },
      { elementos: [{ t: 'turnin', q: MISION_NUEVA }] }, { elementos: [{ t: 'accept', q: MISION_ENTREGADA }] },
      { elementos: [{ t: 'accept', q: 95105 }] }],
  });
  cargar(m);
  assert.equal(actual(m), 1);
  assert.deepEqual(estado(m).siguientes, [2, 3, 5], 'solo se esconde el accept de la ya entregada');
  sinErrores(m);

  const nd = caso({ pasos: [{ elementos: [{ t: 'accept', q: MISION_NUEVA }] }, { elementos: [{ t: 'accept', q: 95106 }] },
    { elementos: [{ t: 'accept', q: 95105 }] }] });
  nd.datoMision(95106, { name: 'Con previa', startedBy: [[3143]], finishedBy: [[3143]], requiredLevel: 1, questLevel: 10,
    requiredRaces: 0, requiredClasses: 0, objectivesText: ['x'], preQuestSingle: [95107] });
  cargar(nd);
  assert.equal(nd.lua('SnetForever.Motor.noDisponible(SnetForever.Motor.paso(2)) ~= nil'), true);
  assert.deepEqual(estado(nd).siguientes, [2, 3], 'el no disponible sale (en gris)');
  sinErrores(nd);
});

// I2: el viaje actual se vuelve a mirar aunque no llegue un evento de zona.
test('I2: al conseguir el objeto del collect de detrás, el viaje deja de mandar sin cambiar de zona', () => {
  const m = caso({
    pasos: [{ elementos: [{ t: 'zone', mapa: MAPA_LEJOS }] }, { elementos: [{ t: 'collect', i: 159, n: 1 }] },
      { elementos: [{ t: 'zone', mapa: 1453 }] }, { elementos: [{ t: 'accept', q: MISION_NUEVA }] }],
  });
  cargar(m);
  m.avanzar(1.2);
  assert.equal(actual(m), 1);
  m.objeto(159, 1);
  m.disparar('BAG_UPDATE_DELAYED');
  m.avanzar(1.2);
  assert.equal(actual(m), 3);
  sinErrores(m);
});

// I3: Motor.estado() seguido, sin cambios, no vuelve a evaluar los pasos de delante.
test('I3: varias llamadas a Motor.estado() sin cambios no vuelven a mirar los pasos de delante', () => {
  const pasos = [{ elementos: [{ t: 'accept', q: MISION_NUEVA }] }];
  for (let i = 0; i < 120; i++) {
    pasos.push(i % 6 === 0 ? { elementos: [{ t: 'zone', mapa: MAPA_LEJOS }] } : { elementos: [{ t: 'accept', q: MISION_ENTREGADA }] });
  }
  const m = caso({ pasos });
  cargar(m);
  estado(m);
  const antes = m.llamadas('C_QuestLog.IsQuestFlaggedCompleted').length;
  for (let k = 0; k < 5; k++) estado(m);
  assert.equal(m.llamadas('C_QuestLog.IsQuestFlaggedCompleted').length, antes, 'de memoria');
  // Un cambio (un evento de misiones) la olvida.
  m.disparar('QUEST_LOG_UPDATE');
  estado(m);
  assert.ok(m.llamadas('C_QuestLog.IsQuestFlaggedCompleted').length > antes);
  sinErrores(m);
});

// M1: un elemento no puro dado por hecho a mano cuenta como hecho al mirar hacia delante.
test('M1: un paso con un vendor marcado a mano se pasa de largo como al activarlo', () => {
  const m = caso({ pasos: [{ elementos: [{ t: 'manual' }] }, { elementos: [{ t: 'vendor' }] }, { elementos: [{ t: 'manual' }] }] });
  m.lua(`SnetForever.Guardado.preparar()
    SnetForeverPJ.progreso[${aLua(CLAVE)}] = {id = "p1", forzados = {p2 = {true}}, manuales = {}, pegajosos = {}, llegados = {}, alcanzados = {}}`);
  cargar(m);
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)');
  actualizar(m);
  assert.equal(actual(m), 3);
  sinErrores(m);
});
