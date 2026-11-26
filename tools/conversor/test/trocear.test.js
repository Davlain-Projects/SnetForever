import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { constantesDe, trocear, archivoLua } from '../src/salida/trocear.js';
import { cargarLua } from './ayuda/cargar-lua.js';

function entradasGrandes(n) {
  return Array.from({ length: n }, (_, i) => [i + 1, [`a${i}`, `b${i}`, `c${i}`, `d${i}`, `e${i}`]]);
}

test('constantesDe distingue tipo y cuenta claves no enteras', () => {
  const c = constantesDe({ nombre: 'x', n: 1, otro: '1', 7: 'x', lista: ['x', 2] });
  assert.ok(c.has('s:nombre'));
  assert.ok(c.has('s:n'));
  assert.ok(c.has('s:otro'));
  assert.ok(c.has('s:lista'));
  assert.ok(c.has('s:x'));
  assert.ok(c.has('s:1'));
  assert.ok(c.has('n:1'));
  assert.ok(c.has('n:2'));
  assert.ok(c.has('n:7')); // clave entera escrita como [7]=
  assert.ok(!c.has('s:7'));
});

test('constantesDe ignora booleanos y valores omitidos', () => {
  const c = constantesDe({ a: true, b: null, c: undefined });
  assert.deepEqual([...c], ['s:a']);
});

test('20.000 entradas de 5 cadenas distintas salen en >= 2 trozos dentro de los límites', () => {
  const entradas = entradasGrandes(20000);
  const trozos = trocear(entradas);
  assert.ok(trozos.length >= 2);
  for (const trozo of trozos) {
    const constantes = new Set();
    for (const [k, v] of trozo) {
      constantesDe(v).forEach((x) => constantes.add(x));
      constantes.add(typeof k === 'number' ? `n:${k}` : `s:${k}`);
    }
    assert.ok(constantes.size <= 50000, `constantes: ${constantes.size}`);
    assert.ok(Buffer.byteLength(archivoLua('SNF_MISIONES.quest', trozo)) <= 500000);
  }
});

test('el orden se conserva al concatenar los trozos', () => {
  const entradas = entradasGrandes(20000);
  const trozos = trocear(entradas);
  assert.deepEqual(trozos.flat(), entradas);
});

test('respeta límites personalizados por bytes', () => {
  const entradas = entradasGrandes(100);
  const trozos = trocear(entradas, { maxBytes: 600 });
  assert.ok(trozos.length > 1);
  for (const trozo of trozos) {
    assert.ok(Buffer.byteLength(archivoLua('T', trozo)) <= 600);
  }
  assert.deepEqual(trozos.flat(), entradas);
});

test('una entrada gigante lanza error con su clave', () => {
  const gigante = Array.from({ length: 60000 }, (_, i) => `s${i}`);
  assert.throws(
    () => trocear([[1, ['a']], [4242, gigante]]),
    (e) => e instanceof Error && e.message.includes('4242'),
  );
});

test('una entrada que pasa maxBytes lanza error con su clave', () => {
  assert.throws(
    () => trocear([['grande', 'x'.repeat(1000)]], { maxBytes: 500 }),
    (e) => e.message.includes('grande'),
  );
});

test('trocear sin entradas devuelve lista vacía', () => {
  assert.deepEqual(trocear([]), []);
});

test('archivoLua cargado en fengari, con prelude, deja T[5]', async () => {
  const texto = archivoLua('SNF_MISIONES.quest', [[5, { nombre: 'Misión', nivel: 3 }], ['x', [1, 2]]]);
  assert.ok(texto.startsWith('local T = SNF_MISIONES.quest\n'));
  const dir = mkdtempSync(join(tmpdir(), 'snf-trocear-'));
  const archivo = join(dir, 'a.lua');
  writeFileSync(archivo, texto);
  const { SNF_MISIONES } = await cargarLua([archivo], { prelude: 'SNF_MISIONES={quest={}}' });
  assert.deepEqual(SNF_MISIONES.quest['5'], { nombre: 'Misión', nivel: 3 });
  assert.deepEqual(SNF_MISIONES.quest.x, [1, 2]);
});
