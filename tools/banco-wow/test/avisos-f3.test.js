// Avisos con el formato de la fase 3 (tarea 13): filtro por raza, avisos de mazmorra, `hasta` y apagado al hacer la
// cadena o la mazmorra (`hechas` y `modoHechas`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const DATOS = [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(FIXTURES, 'avisos-f3-mini.lua')];

const DRUIDA_TAUREN = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 10 };
const DRUIDA_SKYBORNE = { clase: 'DRUID', raza: 'Skyborne', faccion: 'Horde', nivel: 10 };
const GUERRERO = { clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', nivel: 15 };

const maquina = (jugador) => nuevaMaquina({ datos: DATOS, jugador });
const ids = (lista) => lista.map((a) => a.id);
const cola = (m) => ids(m.lua('SnetForever.Avisos.cola()'));
const pendientes = (m) => ids(m.lua('SnetForever.Avisos.pendientes()'));
const revisar = (m, nivel) => m.lua(`SnetForever.Avisos.revisar(${nivel})`);
const conMazmorras = (m) => {
  m.lua('SnetForever.Ajustes.set("version", "mazmorras")');
  m.lua('SnetForever.Ajustes.set("avisos.mazmorras", true)');
};

test('un druida tauren de nivel 10 recibe el aviso del oso y un druida Skyborne no (filtro por raza)', () => {
  const tauren = maquina(DRUIDA_TAUREN);
  revisar(tauren, 10);
  assert.ok(cola(tauren).includes('cadena-oso-H'));
  sinErrores(tauren);
  const skyborne = maquina(DRUIDA_SKYBORNE);
  revisar(skyborne, 10);
  assert.ok(!cola(skyborne).includes('cadena-oso-H'));
  assert.ok(cola(skyborne).includes('druida-10-fase2'), 'el de la fase 2 sigue llegando');
  sinErrores(skyborne);
});

test('un aviso sin tipo (formato de la fase 2) se trata como cadena: pide clase y el ajuste avisos.cadenas', () => {
  const m = maquina(GUERRERO);
  revisar(m, 15);
  assert.ok(!cola(m).includes('druida-10-fase2'));
  const apagado = maquina(DRUIDA_TAUREN);
  apagado.lua('SnetForever.Ajustes.set("avisos.cadenas", false)');
  revisar(apagado, 10);
  assert.deepEqual(cola(apagado), []);
  sinErrores(m);
});

test('vigilancia 1: con la misión 6002 entregada el aviso del oso no sale', () => {
  const m = maquina(DRUIDA_TAUREN);
  m.estadoMision(6002, { entregada: true });
  revisar(m, 10);
  assert.ok(!cola(m).includes('cadena-oso-H'));
  sinErrores(m);
});

test('vigilancia 1: si el aviso ya estaba en la cola o en pendientes y se hace la cadena, desaparece al momento', () => {
  const m = maquina(DRUIDA_TAUREN);
  revisar(m, 10);
  assert.ok(cola(m).includes('cadena-oso-H'));
  m.estadoMision(6002, { entregada: true });
  assert.ok(!cola(m).includes('cadena-oso-H'), 'fuera de la cola');

  const p = maquina(DRUIDA_TAUREN);
  revisar(p, 10);
  p.lua('SnetForever.Avisos.masTarde("cadena-oso-H")');
  assert.deepEqual(pendientes(p), ['cadena-oso-H']);
  p.estadoMision(6002, { entregada: true });
  assert.deepEqual(pendientes(p), []);
  sinErrores(m);
  sinErrores(p);
});

// Lote A, ronda 1 (ruling del controlador): el valor por defecto de avisos.mazmorras depende de la versión (encendido con
// «Con mazmorras», apagado con «Normal»); si el jugador lo cambia a mano, manda lo que eligió, con cualquier versión.
test('mazmorra (ronda 1): con la versión normal y el ajuste sin tocar, no sale', () => {
  const m = maquina(GUERRERO);
  assert.equal(m.lua('SnetForever.Ajustes.get("avisos.mazmorras")'), false);
  revisar(m, 15);
  assert.ok(!cola(m).includes('mazmorra-1581-H'));
  sinErrores(m);
});

test('mazmorra (ronda 1): con «Con mazmorras» y el ajuste sin tocar, sale', () => {
  const m = maquina(GUERRERO);
  m.lua('SnetForever.Ajustes.set("version", "mazmorras")');
  assert.equal(m.lua('SnetForever.Ajustes.get("avisos.mazmorras")'), true);
  revisar(m, 15);
  assert.ok(cola(m).includes('mazmorra-1581-H'));
  sinErrores(m);
});

test('mazmorra (ronda 1): con «Con mazmorras» y el ajuste apagado a mano, no sale (y se conserva al cambiar de versión)', () => {
  const m = maquina(GUERRERO);
  m.lua('SnetForever.Ajustes.set("avisos.mazmorras", false)');
  m.lua('SnetForever.Ajustes.set("version", "mazmorras")');
  revisar(m, 15);
  assert.ok(!cola(m).includes('mazmorra-1581-H'));
  m.lua('SnetForever.Ajustes.set("version", "normal"); SnetForever.Ajustes.set("version", "mazmorras")');
  assert.equal(m.lua('SnetForever.Ajustes.get("avisos.mazmorras")'), false, 'lo elegido a mano se conserva');
  sinErrores(m);
});

test('mazmorra: con la versión normal también sale si el ajuste avisos.mazmorras está encendido a mano', () => {
  const m = maquina(GUERRERO);
  m.lua('SnetForever.Ajustes.set("avisos.mazmorras", true)');
  assert.equal(m.lua('SnetForever.Ajustes.get("version")'), 'normal');
  revisar(m, 15);
  assert.ok(cola(m).includes('mazmorra-1581-H'));
  sinErrores(m);
});

test('mazmorra: con la versión «mazmorras» sale entre los niveles 15 y 21 y no antes ni en el 22', () => {
  for (const [nivel, sale] of [[14, false], [15, true], [21, true], [22, false]]) {
    const m = maquina({ ...GUERRERO, nivel });
    conMazmorras(m);
    revisar(m, nivel);
    assert.equal(cola(m).includes('mazmorra-1581-H'), sale, `nivel ${nivel}`);
    sinErrores(m);
  }
});

test('mazmorra: sin el ajuste avisos.mazmorras no sale; la facción y la clase no la limitan salvo la facción', () => {
  const m = maquina(GUERRERO);
  conMazmorras(m);
  m.lua('SnetForever.Ajustes.set("avisos.mazmorras", false)');
  revisar(m, 15);
  assert.ok(!cola(m).includes('mazmorra-1581-H'));

  const alianza = maquina({ clase: 'WARRIOR', raza: 'Human', faccion: 'Alliance', nivel: 15 });
  conMazmorras(alianza);
  revisar(alianza, 15);
  assert.ok(!cola(alianza).includes('mazmorra-1581-H'), 'el aviso es de la Horda');

  const mago = maquina({ clase: 'MAGE', raza: 'Troll', faccion: 'Horde', nivel: 15 });
  conMazmorras(mago);
  revisar(mago, 15);
  assert.ok(cola(mago).includes('mazmorra-1581-H'), 'cualquier clase de la Horda');
  sinErrores(m);
});

test('mazmorra: un guerrero lo recibe; con una de las dos misiones entregada sigue y con las dos se apaga', () => {
  const m = maquina(GUERRERO);
  conMazmorras(m);
  revisar(m, 15);
  assert.ok(cola(m).includes('mazmorra-1581-H'));
  m.estadoMision(788, { entregada: true });
  assert.ok(cola(m).includes('mazmorra-1581-H'), 'con una sola sigue');
  m.estadoMision(789, { entregada: true });
  assert.ok(!cola(m).includes('mazmorra-1581-H'), 'con las dos se apaga');
  sinErrores(m);
});

test('modoHechas «alguna» (por defecto): basta una misión entregada para apagar el aviso', () => {
  const m = maquina(GUERRERO);
  conMazmorras(m);
  m.lua('for _, a in ipairs(SNF_RUTAS.avisos) do if a.id == "mazmorra-1581-H" then a.modoHechas = nil end end');
  m.estadoMision(788, { entregada: true });
  revisar(m, 15);
  assert.ok(!cola(m).includes('mazmorra-1581-H'));
  sinErrores(m);
});

test('Avisos.texto: manda el texto propio; sin él y con area, lleva el nombre de la zona', () => {
  const m = maquina(GUERRERO);
  const texto = (expr) => m.lua(`SnetForever.Avisos.texto(${expr})`);
  assert.equal(texto('SNF_RUTAS.avisos[2]'), 'Misiones de mazmorra: Las Minas de la Muerte', 'su texto propio manda');
  assert.equal(texto('SNF_RUTAS.avisos[1]'), 'Cadena de druida: Forma de oso');
  assert.match(texto('{id = "x", nivel = 1, area = 1581}'), /^Mazmorra: .*The Deadmines/);
  // Ruling F3-22: en inglés, «Dungeon: <zona>».
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.match(texto('{id = "x", nivel = 1, area = 1581}'), /^Dungeon: /);
  sinErrores(m);
});

test('un aviso de mazmorra encolado desaparece al pasar de «hasta» (cola y pendientes)', () => {
  const m = maquina(GUERRERO);
  conMazmorras(m);
  revisar(m, 15);
  assert.ok(cola(m).includes('mazmorra-1581-H'));
  m.lua('SnetForever.Avisos.masTarde("mazmorra-1581-H")');
  assert.deepEqual(pendientes(m), ['mazmorra-1581-H']);
  m.jugador({ nivel: 22 });
  assert.deepEqual(pendientes(m), []);
  const n = maquina(GUERRERO);
  conMazmorras(n);
  revisar(n, 15);
  n.jugador({ nivel: 22 });
  assert.ok(!cola(n).includes('mazmorra-1581-H'));
  sinErrores(m);
  sinErrores(n);
});

test('pendientes aplica el ajuste de su tipo: con avisos.mazmorras apagado, el de mazmorra pospuesto no sale', () => {
  const m = maquina(GUERRERO);
  conMazmorras(m);
  revisar(m, 15);
  m.lua('SnetForever.Avisos.masTarde("mazmorra-1581-H")');
  assert.deepEqual(pendientes(m), ['mazmorra-1581-H']);
  m.lua('SnetForever.Ajustes.set("avisos.mazmorras", false)');
  assert.deepEqual(pendientes(m), []);
  sinErrores(m);
});

test('Datos.nombreZona: cae a SNF_MISIONES.porMazmorra y no falla si faltan las tablas', () => {
  const m = maquina(GUERRERO);
  const nombre = () => m.lua('SnetForever.Datos.nombreZona(1581)');
  m.lua('SNF_MISIONES.mazmorra = nil; SNF_MISIONES.porMazmorra = {[1581] = {nombre = "Minas nuevas"}}');
  assert.equal(nombre(), 'Minas nuevas');
  m.lua('SNF_MISIONES.porMazmorra = nil');
  assert.equal(typeof nombre(), 'string');
  sinErrores(m);
});

// Revisión final: PLAYER_LEVEL_UP llega antes de que UnitLevel dé el nivel nuevo; la cola y los pendientes miran el nivel
// del evento (Personaje.actual), no el de UnitLevel, para que el aviso recién ganado salga.
test('al subir de nivel (PLAYER_LEVEL_UP con UnitLevel aún viejo) el aviso recién ganado sale en la cola y en pendientes', () => {
  const m = maquina({ ...DRUIDA_TAUREN, nivel: 9 });
  m.disparar('PLAYER_ENTERING_WORLD');
  assert.ok(!cola(m).includes('cadena-oso-H'), 'a nivel 9 no toca');
  m.disparar('PLAYER_LEVEL_UP', 10);
  assert.equal(m.lua('UnitLevel("player")'), 9, 'el banco imita el UnitLevel que va por detrás');
  assert.ok(cola(m).includes('cadena-oso-H'), `cola: ${cola(m).join(', ')}`);
  m.lua('SnetForever.Avisos.masTarde("cadena-oso-H")');
  assert.ok(pendientes(m).includes('cadena-oso-H'), `pendientes: ${pendientes(m).join(', ')}`);
  sinErrores(m);
});
