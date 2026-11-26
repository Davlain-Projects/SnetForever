// 11-nov (el jugador vio en Cima del Trueno la línea de Questie con el camino de un PNJ que anda y pidió lo mismo): los PNJ
// de los pasos activos que tienen `waypoints` en la base se dibujan en el mapa con su camino, y el camino lleva tooltip
// (mapa/pines-mundo.lua, sección «Caminos de los PNJ que se mueven»). Mapa del banco: 1411 Durotar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const ES = { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } } };
const ACEPTAR = (q) => ({ t: 'accept', q, texto: { en: `Accept ${q}`, es: `Acepta ${q}` } });
const ENTREGAR = (q) => ({ t: 'turnin', q, texto: { en: `Turn in ${q}`, es: `Entrega ${q}` } });
const IR = (x, y) => ({ t: 'goto', mapa: 1411, x, y, modo: 'flecha' });

// 97001 anda por un camino de 7 vértices en Durotar; 97002 está quieto (sin waypoints).
const ANDA = `SNF_MISIONES.npc[97001] = {name = "Corredor del risco", friendlyToFaction = "H", spawns = {[1411] = {{40, 40}}},
  waypoints = {[1411] = {{{40, 40}, {42, 40}, {44, 41}, {46, 42}, {48, 42}, {50, 41}, {52, 40}}}}}`;
const QUIETO = 'SNF_MISIONES.npc[97002] = {name = "Tabernero", friendlyToFaction = "H", spawns = {[1411] = {{60, 60}}}}';

function mundo(pasos, { caminos } = {}) {
  const m = nuevaMaquina({ guardado: ES });
  m.lua(ANDA);
  m.lua(QUIETO);
  m.datoMision(97101, { name: 'La caza', startedBy: [[97001]], finishedBy: [[97002]], requiredLevel: 1, questLevel: 5 });
  m.datoMision(97102, { name: 'El encargo', startedBy: [[97002]], finishedBy: [[97001]], requiredLevel: 1, questLevel: 5 });
  m.ponerGuia(guiaDePrueba(pasos));
  if (caminos !== undefined) m.lua(`SnetForever.Ajustes.set("pines.caminos", ${aLua(caminos)})`);
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.lua('BANCO.mapaMundo = 1411; BANCO.escalaLienzo = 1');
  m.lua('SnetForever.PinesMundo.crear(); WorldMapFrame:Show(); SnetForever.PinesMundo.pintar()');
  return m;
}

const tramos = (m) => m.lua(`(function()
  local n = 0
  for _, l in ipairs(SnetForever.PinesMundo.marcos.caminos) do if l:IsShown() then n = n + 1 end end
  return n
end)()`);
const botones = (m) => m.lua(`(function()
  local n = 0
  for _, b in ipairs(SnetForever.PinesMundo.marcos.caminoBotones) do if b:IsShown() then n = n + 1 end end
  return n
end)()`);

test('un accept cuyo PNJ anda: su camino se dibuja (6 tramos para 7 vértices) con puntos de tooltip', () => {
  const m = mundo([{ elementos: [IR(40, 40), ACEPTAR(97101)] }]);
  assert.deepEqual(m.lua('SnetForever.PinesMundo.pnjsConCamino()'), [{ id: 97001, papel: 'accept', q: 97101 }]);
  assert.equal(tramos(m), 6);
  assert.equal(botones(m), 3, 'un punto con tooltip cada 3 vértices: el 1, el 4 y el 7');
  sinErrores(m);
});

test('el tooltip del camino dice el PNJ, la misión que da y que se mueve por ahí', () => {
  const m = mundo([{ elementos: [IR(40, 40), ACEPTAR(97101)] }]);
  const texto = m.lua('SnetForever.PinesMundo.textoCamino(SnetForever.PinesMundo.pnjsConCamino()[1])');
  assert.match(texto, /Corredor del risco/);
  assert.match(texto, /Da: /);
  assert.match(texto, /Se mueve por este camino/);
  sinErrores(m);
});

test('un turnin cuyo PNJ anda también lleva camino, con «Entrega»', () => {
  const m = mundo([{ elementos: [IR(40, 40), ENTREGAR(97102)] }]);
  const lista = m.lua('SnetForever.PinesMundo.pnjsConCamino()');
  assert.deepEqual(lista, [{ id: 97001, papel: 'turnin', q: 97102 }]);
  assert.match(m.lua('SnetForever.PinesMundo.textoCamino(SnetForever.PinesMundo.pnjsConCamino()[1])'), /Entrega: /);
  sinErrores(m);
});

test('un PNJ quieto (sin waypoints) no tiene camino', () => {
  const m = mundo([{ elementos: [IR(60, 60), ACEPTAR(97102)] }]);
  assert.deepEqual(m.lua('SnetForever.PinesMundo.pnjsConCamino()'), []);
  assert.equal(tramos(m), 0);
  assert.equal(botones(m), 0);
  sinErrores(m);
});

test('con el ajuste pines.caminos apagado no se dibuja nada', () => {
  const m = mundo([{ elementos: [IR(40, 40), ACEPTAR(97101)] }], { caminos: false });
  assert.equal(tramos(m), 0);
  assert.equal(botones(m), 0);
  sinErrores(m);
});

test('al cerrar el mapa en otro mapa sin el camino, los tramos se esconden', () => {
  const m = mundo([{ elementos: [IR(40, 40), ACEPTAR(97101)] }]);
  assert.equal(tramos(m), 6);
  m.lua('BANCO.mapaMundo = 1453; SnetForever.PinesMundo.pintar()');
  assert.equal(tramos(m), 0);
  sinErrores(m);
});
