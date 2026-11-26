// 11-nov (el jugador: «me marca un paso 1 a 4665 yd y no tengo idea si tengo que caminar, tomar un volador o matarme»): con el
// destino lejos, la flecha dice con qué maestro de vuelo ir y hasta dónde volar (motor/viaje.lua). Mapa de prueba: 1413
// Los Baldíos, de 4000 x 5000 yardas, en Kalimdor (instancia 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const BALDIOS = `BANCO.mapas[1413] = {nombre = "Los Baldíos", inst = 1, padre = 1414, tipo = 3, izquierda = -4000,
  arriba = -2000, ancho = 4000, alto = 5000}`;
const PNJ = (id, nombre, x, y, { faccion = 'H', flags = 8 } = {}) => `SNF_MISIONES.npc[${id}] = {name = ${aLua(nombre)},
  friendlyToFaction = ${aLua(faccion)}, npcFlags = ${flags}, spawns = {[1413] = {{${x}, ${y}}}}}`;
const CLAVE = 'Prueba\\01-60 Guía de prueba';
const ES = { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } } };

function mundo(jugador = { x: 10, y: 10 }) {
  const m = nuevaMaquina({ guardado: ES, jugador: { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 23, mapa: 1411, x: 50, y: 50 } });
  m.lua(BALDIOS);
  m.jugador({ mapa: 1413, ...jugador });
  m.lua(PNJ(96001, 'Maestro del norte', 12, 12));
  m.lua(PNJ(96002, 'Maestro del sur', 88, 88));
  m.lua(PNJ(96003, 'Maestro de la Alianza', 11, 11, { faccion: 'A' }));
  m.lua(PNJ(96004, 'Tabernero', 50, 50, { flags: 128 }));
  return m;
}
const consejo = (m, x, y) => m.lua(`SnetForever.Viaje.consejo({mapa = 1413, x = ${x}, y = ${y}}, SnetForever.Coord.jugador())`);

test('lejos: vuela con el maestro de su facción más cercano hasta el más cercano al destino', () => {
  const m = mundo();
  const c = consejo(m, 90, 90);
  assert.deepEqual([c.origen, c.hasta, c.mapa, c.seguro], [96001, 96002, 1413, false]);
  const texto = m.lua('SnetForever.Viaje.texto(SnetForever.Viaje.consejo({mapa = 1413, x = 90, y = 90}, SnetForever.Coord.jugador()))');
  assert.match(texto, /Maestro del norte/);
  assert.match(texto, /Maestro del sur/);
  assert.match(texto, /si tienes ese vuelo/);
  sinErrores(m);
});

test('solo cuentan los maestros de vuelo de su facción (ni la Alianza ni un PNJ sin la bandera de vuelo)', () => {
  const m = mundo();
  const lista = m.lua('(function() local t = {} for _, x in ipairs(SnetForever.Viaje.maestros("H")) do t[#t + 1] = x.id end return t end)()');
  assert.deepEqual(lista, [96001, 96002]);
  sinErrores(m);
});

test('cerca (menos de 1200 yardas) no hay consejo: se va andando', () => {
  const m = mundo();
  assert.equal(consejo(m, 20, 20), undefined);
  sinErrores(m);
});

test('si el maestro más cercano al jugador es también el del destino, no hay consejo', () => {
  const m = mundo({ x: 85, y: 85 });
  assert.equal(consejo(m, 95, 95), undefined);
  sinErrores(m);
});

test('si volar no ahorra camino (los maestros quedan lejos de los dos), no hay consejo', () => {
  const m = mundo({ x: 50, y: 5 });
  assert.equal(consejo(m, 50, 95), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------
// Vuelos aprendidos y la flecha que lleva al maestro (11-nov, segunda petición del jugador)
// ---------------------------------------------------------------------------------------------------------------
// Kalimdor (1414) con el mismo rectángulo que Los Baldíos: la posición de un nodo (0-1) es la del mapa de la zona / 100.
const KALIMDOR = `BANCO.mapas[1414] = {nombre = "Kalimdor", inst = 1, tipo = 2, izquierda = -4000, arriba = -2000, ancho = 4000,
  alto = 5000}`;
const NODO = (nombre, x, y, state) => ({ nodeID: Math.round(x * 1000), name: nombre, state, position: { x, y } });
function conNodos(m, nodos) {
  m.lua(KALIMDOR);
  m.lua(`BANCO.ponerServicios({mapaTaxi = 1414, nodos = ${aLua(nodos)}})`);
  m.disparar('TAXIMAP_OPENED');
}

test('al abrir el mapa de vuelos se apuntan los maestros de los nodos conocidos (Current y Reachable), no los demás', () => {
  const m = mundo();
  m.lua(PNJ(96005, 'Maestro del centro', 50, 80));
  conNodos(m, [NODO('Norte', 0.12, 0.12, 0), NODO('Centro', 0.5, 0.8, 1), NODO('Sur', 0.88, 0.88, 2)]);
  const v = m.lua('SnetForeverPJ.vuelos');
  assert.deepEqual(Object.keys(v.npcs).map(Number).sort(), [96001, 96005]);
  assert.equal(v.nombres[96005], 'Centro');
  assert.deepEqual(m.lua('SnetForever.Viaje.nombresConocidos(40)'), ['Centro', 'Norte']);
  sinErrores(m);
});

test('con vuelos apuntados: vuela al conocido más cercano al destino (no al que no tiene) y el consejo es seguro', () => {
  const m = mundo();
  m.lua(PNJ(96005, 'Maestro del centro', 50, 80));
  conNodos(m, [NODO('Norte', 0.12, 0.12, 0), NODO('Centro', 0.5, 0.8, 1)]);
  const c = consejo(m, 90, 90);
  assert.deepEqual([c.origen, c.hasta, c.seguro], [96001, 96005, true], 'el del sur no lo tiene: vuela al del centro');
  assert.doesNotMatch(m.lua('SnetForever.Viaje.texto(SnetForever.Viaje.consejo({mapa = 1413, x = 90, y = 90}, SnetForever.Coord.jugador()))'), /si tienes/);
  sinErrores(m);
});

test('lo apuntado sobrevive: abrir otro mapa de vuelos añade, no borra', () => {
  const m = mundo();
  m.lua(PNJ(96005, 'Maestro del centro', 50, 80));
  conNodos(m, [NODO('Norte', 0.12, 0.12, 0)]);
  conNodos(m, [NODO('Centro', 0.5, 0.8, 0)]);
  assert.deepEqual(Object.keys(m.lua('SnetForeverPJ.vuelos.npcs')).map(Number).sort(), [96001, 96005]);
  sinErrores(m);
});

test('la flecha lleva primero al maestro de vuelo (a su distancia) y dice a dónde volar y qué viene después', () => {
  const m = mundo();
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'goto', mapa: 1413, wx: -7600, wy: -6500, inst: 1, modo: 'flecha', texto: { en: 'Camp', es: 'Campamento' } }] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0)');
  const texto = m.lua('SnetForever.Flecha.marcos.texto:GetText()');
  const lineas = texto.split('\n');
  assert.match(lineas[0], /Ve al maestro de vuelo Maestro del norte/);
  // Del jugador (10, 10) al maestro (12, 12): 2 % de 4000 = 80 yd y 2 % de 5000 = 100 yd → 128 yd.
  assert.equal(lineas[1], '128 yd');
  assert.match(lineas[2], /y vuela a .*\(Maestro del sur\), si tienes ese vuelo/);
  assert.match(lineas[3], /Después, a pie: /);
  sinErrores(m);
});

test('junto al maestro de vuelo la flecha dice «Habla con …»; en pleno vuelo, no hay consejo', () => {
  const m = mundo({ x: 12.2, y: 12.2 });
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'goto', mapa: 1413, wx: -7600, wy: -6500, inst: 1, modo: 'flecha' }] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0)');
  assert.match(m.lua('SnetForever.Flecha.marcos.texto:GetText()'), /^Habla con Maestro del norte \(maestro de vuelo\)/);
  m.lua('BANCO.ponerServicios({taxi = true})');
  m.jugador({ mapa: 1413, x: 30, y: 30 });
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.doesNotMatch(m.lua('SnetForever.Flecha.marcos.texto:GetText()'), /maestro de vuelo/);
  sinErrores(m);
});

test('la ventana de la guía dice lo mismo que la flecha: tarjeta «Cómo llegar» con el maestro, el vuelo y el destino', () => {
  const m = mundo();
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'goto', mapa: 1413, wx: -7600, wy: -6500, inst: 1, modo: 'flecha' }] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0); SnetForever.Ventana.pintar()');
  assert.equal(m.lua('SnetForever.Ventana.marcos.viaje:IsShown()'), true);
  const texto = m.lua('SnetForever.Ventana.marcos.viaje.texto:GetText()');
  assert.match(texto, /^Cómo llegar:/);
  assert.match(texto, /1\. Ve al maestro de vuelo Maestro del norte\./);
  assert.match(texto, /2\. Vuela a .*\(Maestro del sur\), si tienes ese vuelo\./);
  assert.match(texto, /3\. Después, a pie/);
  // Cerca del destino ya no hay viaje que contar: la tarjeta se va.
  m.jugador({ mapa: 1413, x: 89, y: 89 });
  m.lua('SnetForever.Flecha.actualizar(0); SnetForever.Ventana.pintar()');
  assert.equal(m.lua('SnetForever.Ventana.marcos.viaje:IsShown()'), false);
  sinErrores(m);
});

test('en pleno vuelo: ni «sin camino» ni camino naranja; la flecha y la tarjeta dicen «En vuelo»', () => {
  const m = mundo({ x: 30, y: 30 });
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'goto', mapa: 1413, wx: -7600, wy: -6500, inst: 1, modo: 'flecha' }] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.lua('BANCO.ponerServicios({taxi = true})');
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0); SnetForever.Ventana.pintar()');
  const flecha = m.lua('SnetForever.Flecha.marcos.texto:GetText()');
  assert.match(flecha, /En vuelo: al aterrizar, sigue a pie/);
  assert.doesNotMatch(flecha, /Sin camino conocido/);
  assert.match(m.lua('SnetForever.Ventana.marcos.viaje.texto:GetText()'), /En vuelo\. Al aterrizar, a pie hasta: /);
  assert.equal(m.lua('SnetForever.RutaPie.actual() == nil'), true);
  sinErrores(m);
});
