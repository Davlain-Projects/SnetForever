// Comercio, tarea 5: casas de subastas en uso y descubrimiento de la casa del personaje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CASAS, bandoDe, casaDe, casasDelReino, casasSeguidas, descubrir } from '../src/comercio/casas.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/comercio-114.json', import.meta.url), 'utf8'));
const fotos = () => new Map(Object.entries(fx.fotos).map(([c, f]) => [Number(c), f]));

test('descubrir: con los datos reales gana la 114', () => {
  const r = descubrir(fx.escaneo, fotos());
  assert.equal(r.casa, 114);
  // El fixture es un extracto: con estos pares salen 4 aciertos exactos (en los datos completos fueron 10 de 20).
  assert.ok(r.aciertos >= 4, `aciertos ${r.aciertos}`);
  assert.ok(r.total >= r.aciertos);
  assert.ok(r.aciertos - r.segunda >= 3, `ventaja ${r.aciertos - r.segunda}`);
});

test('descubrir: empate o poca ventaja da null', () => {
  const f = fotos();
  f.set(113, f.get(114));
  assert.equal(descubrir(fx.escaneo, f), null);
  assert.equal(descubrir(fx.escaneo, new Map()), null);
  assert.equal(descubrir({ 1: { 5: 1 } }, new Map([[114, { 1: { 5: 2 } }]])), null);
});

test('descubrir: acepta también un objeto como fotos', () => {
  assert.equal(descubrir(fx.escaneo, fx.fotos).casa, 114);
});

// F7: ya no hay casa supuesta: sin descubrir, null.
test('casaDe: solo lo descubierto; nada se supone', () => {
  assert.equal(casaDe({ reino: 'Normal', faccion: 'Horde' }, {}), null);
  assert.equal(casaDe({ reino: 'Normal', faccion: 'Alliance' }, {}), null);
  assert.equal(casaDe({ reino: 'Normal', faccion: 'Horde' }, { 'Normal|Horde': 115 }), 115);
  assert.equal(casaDe({ reino: 'Normal', faccion: 'Horde' }, { 'Normal|Horde': '115' }), 115);
  assert.equal(casaDe({ reino: 'Normal', faccion: 'Horde' }, { 'Normal|Horde': 'x' }), null);
  assert.equal(casaDe({ reino: 'Normal', faccion: 'Horde' }, { 'Normal:Horde': 115 }), null);
  assert.equal(casaDe({ reino: 'Normal', faccion: 'Horde' }, undefined), null);
});

test('casasDelReino: las conocidas del bando, del otro bando y la neutral', () => {
  const tres = { 'Normal|Horde': 114, 'Normal|Alliance': 111, 'Normal|Neutral': 117 };
  assert.deepEqual(casasDelReino({ reino: 'Normal', faccion: 'Horde' }, tres), [114, 111, 117]);
  assert.deepEqual(casasDelReino({ reino: 'Normal', faccion: 'Alliance' }, tres), [111, 114, 117]);
  assert.deepEqual(casasDelReino({ reino: 'Normal', faccion: 'Horde' }, { 'Normal|Alliance': 112 }), [112]);
  assert.deepEqual(casasDelReino({ reino: 'Normal', faccion: 'Horde' }, {}), []);
});

test('casasSeguidas: la del personaje, la de cada otra facción con personajes y la neutral, solo las conocidas', () => {
  const tres = { 'Normal|Horde': 114, 'Normal|Alliance': 111, 'Normal|Neutral': 117 };
  const horda = { reino: 'Normal', faccion: 'Horde' };
  assert.deepEqual(casasSeguidas(horda, tres, ['Horde']), [114, 117]);
  assert.deepEqual(casasSeguidas(horda, tres, ['Horde', 'Alliance']), [114, 111, 117]);
  assert.deepEqual(casasSeguidas({ reino: 'Normal', faccion: 'Alliance' }, tres, ['Horde', 'Alliance']), [111, 114, 117]);
  assert.deepEqual(casasSeguidas(horda, { 'Normal|Horde': 114 }, ['Horde']), [114]);
  assert.deepEqual(casasSeguidas(horda, {}, ['Horde', 'Alliance']), []);
  assert.equal(bandoDe('Normal', 117, tres), 'Neutral');
  assert.equal(bandoDe('Normal', 999, tres), null);
});

test('las tablas de casas son las de Forever', () => {
  assert.deepEqual(CASAS.Horde, [113, 114, 115, 120, 124]);
  assert.deepEqual(CASAS.Alliance, [110, 111, 112, 119, 123]);
  assert.deepEqual(CASAS.Neutral, [116, 117, 118, 121, 125]);
});
