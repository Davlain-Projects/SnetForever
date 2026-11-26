// Biblioteca de guías: el lector de datos Lua (solo literales: nunca se ejecuta nada). Datos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerSentencias } from '../src/biblioteca/lua.mjs';

test('una llamada con cadenas y una tabla: claves, listas, números y booleanos', () => {
  const s = leerSentencias('_G.Algo.Register("uno-2","1.0",{["a"]=1,b=-2.5e-1,["c"]={"x","y"},[3]=true,["d"]=false})');
  assert.equal(s.length, 1);
  assert.equal(s[0].nombre, '_G.Algo.Register');
  assert.equal(s[0].args.length, 3);
  assert.equal(s[0].args[0], 'uno-2');
  assert.equal(s[0].args[1], '1.0');
  const t = s[0].args[2];
  assert.equal(t.a, 1);
  assert.equal(t.b, -0.25);
  assert.deepEqual(t.c, ['x', 'y']);
  assert.equal(t[3], true);
  assert.equal(t.d, false);
});

test('una asignación y los valores nil (se saltan, como en Lua)', () => {
  const s = leerSentencias('Datos = {["a"]=nil,["b"]={1,2,3},c=nil}; local otro = "hola"');
  assert.deepEqual(s.map((x) => x.nombre), ['Datos', 'otro']);
  assert.deepEqual(s[0].valor, { b: [1, 2, 3] });
  assert.equal(s[1].valor, 'hola');
});

test('escapes de cadena, comillas simples, cadenas largas y números en hexadecimal', () => {
  const [s] = leerSentencias(String.raw`X = {"a\"b\\c\n\t\065\x42\u{E1}", 'd\'e', [[larga
"sin" escapes]], [==[con ]] dentro]==], 0x1F, .5, 3.}`);
  assert.deepEqual(s.valor, ['a"b\\c\n\tABá', "d'e", 'larga\n"sin" escapes', 'con ]] dentro', 31, 0.5, 3]);
});

test('comentarios de línea y de bloque', () => {
  const s = leerSentencias('-- cabecera\n--[[ bloque\n con X = 1 ]]\nX = { 1, -- uno\n 2 } --[==[ fin ]==]');
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].valor, [1, 2]);
});

test('la clave __proto__ es una clave más', () => {
  const [s] = leerSentencias('X = {["__proto__"]={["malo"]=true}}');
  assert.equal(Object.getPrototypeOf(s.valor), Object.prototype);
  assert.deepEqual(Object.keys(s.valor), ['__proto__']);
  assert.equal({}.malo, undefined);
});

test('nunca ejecuta: os.execute dentro de una cadena es texto y fuera es una llamada más (solo se lee)', () => {
  const s = leerSentencias('os.execute("del /q *")\nX = {["t"]="os.execute(\'rm -rf\')"}');
  assert.deepEqual(s[0], { nombre: 'os.execute', args: ['del /q *'] });
  assert.equal(s[1].valor.t, "os.execute('rm -rf')");
});

test('lo que no es un literal da un error con la posición (nada de expresiones ni funciones)', () => {
  for (const malo of [
    'X = {a = 1 + 2}',
    'X = function() end',
    'X = {a = b}',
    'X = {"sin cerrar',
    'X = {1, 2',
    'if x then end',
    'X = {"a" "b"}',
    'X = {[{}] = 1}',
  ]) {
    assert.throws(() => leerSentencias(malo, { nombreArchivo: 'p.lua' }), /^Error: p\.lua:\d+:/, malo);
  }
});

test('una tabla demasiado honda es un error (no tumba la pila)', () => {
  const hondo = 'X = ' + '{'.repeat(5000) + '}'.repeat(5000);
  assert.throws(() => leerSentencias(hondo), /honda/);
});

test('omitir: las claves que se saltan no se construyen pero el resto se lee igual', () => {
  const [s] = leerSentencias('X = {["grande"]={{1,2},{3,{4}}},["queda"]={["grande"]=1}}', { omitir: new Set(['grande']) });
  assert.deepEqual(s.valor, { queda: [] }); // la tabla vacía es [], como en base/leer-lua.mjs
});
