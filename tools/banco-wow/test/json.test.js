// ia/json.lua: codificador JSON del addon (Lua 5.1, sin librerías).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const codificar = (m, expr) => m.lua(`SnetForever.JSON.codificar(${expr})`);

test('objeto con claves ordenadas, array, array vacío y booleano', () => {
  const m = nuevaMaquina();
  assert.equal(codificar(m, '{b = 1, a = {1, 2.5, "x\\"\\n"}, c = {}, d = true}'), '{"a":[1,2.5,"x\\"\\n"],"b":1,"c":[],"d":true}');
  sinErrores(m);
});

test('números: entero sin «.0», decimales con %.2f sin ceros finales, NaN e infinito a null', () => {
  const m = nuevaMaquina();
  assert.equal(codificar(m, '3/1'), '3');
  assert.equal(codificar(m, '45.15'), '45.15');
  assert.equal(codificar(m, '45.10'), '45.1');
  assert.equal(codificar(m, '-7'), '-7');
  assert.equal(codificar(m, '0/0'), 'null');
  assert.equal(codificar(m, '1/0'), 'null');
  assert.equal(codificar(m, '-1/0'), 'null');
  // Más de 2^31: sale con %.2f sin ceros finales (nunca %d).
  assert.equal(codificar(m, '2^40'), '1099511627776');
  sinErrores(m);
});

test('claves numéricas sueltas salen como objeto con la clave como %d', () => {
  const m = nuevaMaquina();
  assert.equal(codificar(m, '{[5] = "a", [10] = "b"}'), '{"10":"b","5":"a"}');
  assert.equal(codificar(m, '{[1] = "a", [3] = "c"}'), '{"1":"a","3":"c"}');
  assert.equal(codificar(m, '{x = {y = {}}}'), '{"x":{"y":[]}}');
  sinErrores(m);
});

test('cadenas: escapes de comillas, barra, controles y 0x7F; los bytes altos van tal cual', () => {
  const m = nuevaMaquina();
  assert.equal(codificar(m, '"ñ\\1"'), '"ñ\\u0001"');
  assert.equal(codificar(m, '"a\\\\b"'), '"a\\\\b"');
  assert.equal(codificar(m, '"\\127"'), '"\\u007f"');
  assert.equal(codificar(m, '"\\t\\r\\n"'), '"\\t\\r\\n"');
  assert.equal(codificar(m, '"|cff00ff00x|r"'), '"|cff00ff00x|r"');
  sinErrores(m);
});

test('una función dentro o un valor que no es JSON dan error', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('(pcall(SnetForever.JSON.codificar, {function() end}))'), false);
  assert.equal(m.lua('(pcall(SnetForever.JSON.codificar, {a = print}))'), false);
  assert.equal(m.lua('(pcall(SnetForever.JSON.codificar, print))'), false);
  sinErrores(m);
});

test('una tabla con referencias circulares da error en vez de colgarse', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('local t = {}; t.a = t; return (pcall(SnetForever.JSON.codificar, t))'), false);
  sinErrores(m);
});

// Revisión de la tarea 1: claves numéricas grandes o con decimales no pasan por %d; -0,001 sale como 0.
test('claves numéricas raras y el «-0»', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.JSON.codificar({[4294967296] = 1, x = 2})'), '{"4294967296":1,"x":2}');
  assert.equal(m.lua('SnetForever.JSON.codificar({[2.5] = "a", y = true})'), '{"2.5":"a","y":true}');
  assert.equal(m.lua('SnetForever.JSON.codificar(-0.001)'), '0');
  sinErrores(m);
});
