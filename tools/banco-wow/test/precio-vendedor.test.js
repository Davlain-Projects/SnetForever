// Comercio: el precio de vendedor guardado (comercio/precio-vendedor.lua). El juego solo lo da de los objetos que tiene en
// caché; lo que da se guarda y vendorsell lo usa cuando el juego aún no lo tiene.
import assert from 'node:assert/strict';
import { testConComercio as test, nuevaMaquina, sinErrores } from './ayuda.js';

const F = 'SnetForever.Formulas';
const P = 'SnetForever.PrecioVendedor';
const vendorsell = (m, id) => m.lua(`(function() return ${F}.valor("vendorsell", ${id}) end)()`);

test('vendorsell guarda lo que da el juego y usa lo guardado cuando el juego no lo tiene', () => {
  const m = nuevaMaquina();
  m.itemInfo(100, { nombre: 'Uno', precio: 500 });
  m.itemInfo(200, { nombre: 'Dos', precio: 0 });
  assert.equal(vendorsell(m, 100), 500);
  assert.equal(m.lua('SnetForeverCuenta.comercio.precioVendedor[100]'), 500, 'guardado');
  assert.equal(vendorsell(m, 200), undefined, 'el vendedor no lo compra: sin valor');
  assert.equal(m.lua('SnetForeverCuenta.comercio.precioVendedor[200]'), 0, 'pero se sabe (0)');
  // Un objeto que el juego no tiene en caché, con su precio guardado de otra sesión.
  m.lua('SnetForeverCuenta.comercio.precioVendedor[777] = 1234');
  assert.equal(vendorsell(m, 777), 1234);
  assert.equal(vendorsell(m, 778), undefined, 'ni en el juego ni guardado: sin valor');
  assert.equal(m.lua(`${F}.valor("max(1.5 * vendorsell, 1c)", 777)`), 1851);
  sinErrores(m);
});

test('GET_ITEM_INFO_RECEIVED guarda el precio del objeto que llega', () => {
  const m = nuevaMaquina();
  m.itemInfo(300, { nombre: 'Tres', precio: 42 });
  m.disparar('GET_ITEM_INFO_RECEIVED', 300, true);
  assert.equal(m.lua('SnetForeverCuenta.comercio.precioVendedor[300]'), 42);
  m.disparar('GET_ITEM_INFO_RECEIVED', 301, false);
  assert.equal(m.lua('SnetForeverCuenta.comercio.precioVendedor[301]'), undefined);
  sinErrores(m);
});

test('al entrar se piden poco a poco los objetos del árbol sin precio guardado, una vez por sesión', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Arbol.preparar()
    local o = SnetForeverCuenta.comercio.v2.objetos
    for i = 1, 25 do o["i:" .. (1000 + i)] = "Grupo" end
    o["i:1001::r7"] = "Grupo"
    o["p:39:1:3"] = "Grupo"
    SnetForeverCuenta.comercio.precioVendedor = {[1002] = 9}`);
  for (let i = 1; i <= 25; i++) if (i !== 3) m.itemInfo(1000 + i, { nombre: `O${i}`, precio: i * 10 });
  m.lua(`${P}.rellenar()`);
  assert.equal(m.lua(`${P}.estado().enMarcha`), true);
  assert.equal(m.lua('SnetForeverCuenta.comercio.precioVendedor[1001]'), undefined, 'espera antes de empezar');
  for (let i = 0; i < 80; i++) m.avanzar(0.5);
  assert.equal(m.lua('SnetForeverCuenta.comercio.precioVendedor[1001]'), 10);
  assert.equal(m.lua('SnetForeverCuenta.comercio.precioVendedor[1025]'), 250);
  assert.equal(m.lua('SnetForeverCuenta.comercio.precioVendedor[1002]'), 9, 'lo guardado no se toca');
  assert.equal(m.lua('SnetForeverCuenta.comercio.precioVendedor[1003]'), undefined, 'el que el juego no da se queda sin precio');
  assert.deepEqual(m.lua(`{${P}.estado().enMarcha, ${P}.estado().pendientes}`), [false, 1]);
  m.lua(`${P}.rellenar()`);
  assert.equal(m.lua(`${P}.estado().enMarcha`), false, 'una sola vez por sesión');
  sinErrores(m);
});
