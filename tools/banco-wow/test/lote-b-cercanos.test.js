// Lote B (B3, revisión 5.1 I3): «Objetivos cercanos» con los PNJ por id. El conversor ya pone el id a los PNJ de target y
// mob cuando la base deja decidirlo; aquí, el addon:
//   - mide «cerca» solo con los puntos de ese id, aunque otro paso activo pida un homónimo sin id;
//   - pone en la macro el UnitName de una placa visible cuyo GUID es de ese id (luego el objetivo y el ratón, luego lo
//     último visto y, al final, el nombre del idioma del cliente).
// Datos del banco: PNJ 3 «Flesh Eater» (esp. «Comecarne», puntos (47, 62) y (48, 61) del mapa 1411). Aquí se añade un
// homónimo, el 7777, con un punto lejos, en (10, 10). Mundo del mapa 1411: wx = -2000 - 50·x, wy = 1800 - 35·y, inst 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const GUID_3 = 'Creature-0-1-0-0-3-0000ABCDEF';
const GUID_7777 = 'Creature-0-1-0-0-7777-0000000002';
const mundo = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });
const ACEPTAR = (q) => ({ t: 'accept', q, texto: { en: `Accept ${q}`, es: `Acepta ${q}` } });

// La máquina con el homónimo 7777 en la base y la guía con los pasos dados (activos los dos primeros con «sticky»).
function conHomonimo(pasos, opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.lua('SNF_MISIONES.npc[7777] = {name = "Flesh Eater", spawns = {[1411] = {{10, 10}}}}');
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  return m;
}
const entrada = (m) => m.lua(`(function()
  local e = SnetForever.Cercanos.lista()[1]
  return e and {ids = e.ids, estado = e.estado, nombreMacro = e.nombreMacro} or false
end)()`);

// Un paso con el mob por id (lo que da ahora el conversor) y otro target del mismo nombre sin id.
const CON_ID_Y_SIN_ID = [{ elementos: [
  ACEPTAR(788),
  { t: 'mob', npcs: [{ nombre: 'Flesh Eater', id: 3 }] },
  { t: 'target', npcs: [{ nombre: 'Flesh Eater' }] },
] }];

test('B3: «cerca» usa solo los puntos del id de la guía, aunque el mismo nombre salga sin id en otro elemento', () => {
  const m = conHomonimo(CON_ID_Y_SIN_ID);
  // La entrada junta los dos (mismo nombre) y reconoce por GUID a los dos id...
  assert.deepEqual(entrada(m).ids.slice().sort((a, b) => a - b), [3, 7777]);
  // ...pero al lado del punto del homónimo no está «cerca»: ese no es el PNJ que pide la guía.
  const lejos = mundo(10, 10);
  m.jugador({ mundo: { wx: lejos.wx, wy: lejos.wy + 10, inst: 1 } });
  m.avanzar(1.1);
  assert.equal(entrada(m).estado, 'lejos');
  // Al lado de un punto del 3, sí.
  const cerca = mundo(47, 62);
  m.jugador({ mundo: { wx: cerca.wx, wy: cerca.wy + 10, inst: 1 } });
  m.avanzar(1.1);
  assert.equal(entrada(m).estado, 'cerca');
  sinErrores(m);
});

test('B3: sin id en la guía, «cerca» sigue usando los puntos de todos los homónimos (como antes)', () => {
  const m = conHomonimo([{ elementos: [ACEPTAR(788), { t: 'mob', npcs: [{ nombre: 'Flesh Eater' }] }] }]);
  const lejos = mundo(10, 10);
  m.jugador({ mundo: { wx: lejos.wx, wy: lejos.wy + 10, inst: 1 } });
  m.avanzar(1.1);
  assert.equal(entrada(m).estado, 'cerca');
  sinErrores(m);
});

test('B3: la macro usa el UnitName de la placa cuyo GUID es del id, aunque luego se vea un homónimo por nombre', () => {
  const m = conHomonimo([{ elementos: [ACEPTAR(788), { t: 'mob', npcs: [{ nombre: 'Flesh Eater', id: 3 }] }] }],
    { jugador: { idioma: 'esMX' } });
  assert.equal(entrada(m).nombreMacro, 'Comecarne'); // sin ver nada: el español de los datos
  // La placa del 3 trae el nombre del cliente (esMX), distinto del de los datos (esES).
  m.placa('nameplate1', { guid: GUID_3, nombre: 'Come carne' });
  assert.equal(entrada(m).nombreMacro, 'Come carne');
  // Un homónimo que no es el 3 pasa por el ratón y se reconoce por nombre: la macro no cambia mientras la placa del 3 siga.
  m.unidad('mouseover', { guid: GUID_7777, nombre: 'Comecarne' });
  m.disparar('UPDATE_MOUSEOVER_UNIT');
  assert.equal(entrada(m).nombreMacro, 'Come carne');
  sinErrores(m);
});

test('B3: sin placa del id, el objetivo con ese GUID; y sin nada, lo último visto o el nombre del cliente', () => {
  const m = conHomonimo([{ elementos: [ACEPTAR(788), { t: 'mob', npcs: [{ nombre: 'Flesh Eater', id: 3 }] }] }],
    { jugador: { idioma: 'esMX' } });
  m.unidad('target', { guid: GUID_3, nombre: 'Come carne' });
  m.disparar('PLAYER_TARGET_CHANGED');
  assert.equal(entrada(m).nombreMacro, 'Come carne');
  m.unidad('target', undefined);
  m.disparar('PLAYER_TARGET_CHANGED');
  assert.equal(entrada(m).nombreMacro, 'Come carne', 'lo último visto se recuerda');
  sinErrores(m);
});

// ---- Ronda 1 (Important 1): nada se compara con un GUID o un nombre secreto antes de issecretvalue ----
// En el banco `secreto == nil` no da error (Lua no llama a __eq con tipos distintos). Con `vigilarSecretos`, la máquina
// reescribe en esos archivos cada `x == nil`, `x ~= nil`, `x == "…"` y `x ~= "…"` como BANCO.vigilar(x) …, que da el
// error del cliente («attempt to compare a secret value») si x es secreto.
const VIGILADO = { vigilarSecretos: ['mapa/cercanos.lua'] };

test('banco: vigilarSecretos hace que comparar un secreto con nil o con un texto dé error', () => {
  const m = nuevaMaquina();
  assert.throws(() => m.lua('BANCO.vigilar(BANCO.secreto()) == nil'), /compare a secret value/);
  assert.equal(m.lua('BANCO.vigilar("x") == "x"'), true);
});

test('B3, ronda 1: una placa con el GUID secreto no da error y la macro cae en el siguiente nombre', () => {
  const m = conHomonimo([{ elementos: [ACEPTAR(788), { t: 'mob', npcs: [{ nombre: 'Flesh Eater', id: 3 }] }] }],
    { jugador: { idioma: 'esMX' }, ...VIGILADO });
  m.placa('nameplate1', { guidSecreto: true, nombre: 'COMECARNE' });
  m.avanzar(1.1);
  // Se reconoce por nombre (el GUID no se puede leer) y la macro usa el nombre visto, no el de la placa por GUID.
  assert.equal(entrada(m).estado, 'visto');
  assert.equal(entrada(m).nombreMacro, 'COMECARNE');
  sinErrores(m);
});

test('B3, ronda 1: el objetivo y el ratón con el GUID secreto tampoco dan error', () => {
  const m = conHomonimo([{ elementos: [ACEPTAR(788), { t: 'mob', npcs: [{ nombre: 'Flesh Eater', id: 3 }] }] }],
    { jugador: { idioma: 'esMX' }, ...VIGILADO });
  m.unidad('target', { guidSecreto: true, nombre: 'COMECARNE' });
  m.disparar('PLAYER_TARGET_CHANGED');
  m.unidad('mouseover', { guidSecreto: true, nombreSecreto: true });
  m.disparar('UPDATE_MOUSEOVER_UNIT');
  m.avanzar(1.1);
  assert.equal(entrada(m).nombreMacro, 'COMECARNE');
  // Con el nombre también secreto, la macro no lo usa: cae en el español de los datos.
  const otra = conHomonimo([{ elementos: [ACEPTAR(788), { t: 'mob', npcs: [{ nombre: 'Flesh Eater', id: 3 }] }] }],
    { jugador: { idioma: 'esMX' }, ...VIGILADO });
  otra.placa('nameplate1', { guid: GUID_3, nombreSecreto: true });
  otra.avanzar(1.1);
  assert.equal(entrada(otra).nombreMacro, 'Comecarne');
  sinErrores(m);
  sinErrores(otra);
});

// T2: los PNJ de los objetivos de una entrega a medias van por id: «cerca» mira solo los puntos de ese id (aquí el 3,
// no su homónimo 7777).
test('T2: un objetivo sin terminar de una entrega a medias sale como mob con el id de la base', () => {
  const m = nuevaMaquina();
  m.lua('SNF_MISIONES.npc[7777] = {name = "Flesh Eater", spawns = {[1411] = {{10, 10}}}}');
  m.datoMision(97901, { name: 'Misión inventada', requiredLevel: 1, questLevel: 5, objectives: [[[3]]] });
  m.estadoMision(97901, { enDiario: true, objetivos: [{ texto: 'Flesh Eater: 0/2', hecho: 0, pedido: 2, terminado: false }] });
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'turnin', q: 97901 }] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.deepEqual(m.lua('(function() local e = SnetForever.Cercanos.lista()[1] return {e.tipo, e.ids} end)()'), ['mob', [3]]);
  const lejos = mundo(10, 10);
  m.jugador({ mundo: { wx: lejos.wx, wy: lejos.wy + 10, inst: 1 } });
  m.avanzar(1.1);
  assert.equal(entrada(m).estado, 'lejos', 'el homónimo no cuenta');
  const cerca = mundo(47, 62);
  m.jugador({ mundo: { wx: cerca.wx, wy: cerca.wy + 10, inst: 1 } });
  m.avanzar(1.1);
  assert.equal(entrada(m).estado, 'cerca');
  sinErrores(m);
});
