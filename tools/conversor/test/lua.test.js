import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aLua } from '../src/salida/lua.js';
import { cargarLua } from './ayuda/cargar-lua.js';

// Escribe `SNF_RUTAS = <valor>` en un archivo temporal, lo carga y devuelve el valor en JS.
async function idaYVuelta(valor) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-'));
  const archivo = join(dir, 'datos.lua');
  const texto = aLua(valor);
  writeFileSync(archivo, `SNF_RUTAS = ${texto}\nSNF_MISIONES = {}\n`, 'utf8');
  const { SNF_RUTAS } = await cargarLua([archivo]);
  return { vuelta: SNF_RUTAS, texto };
}

test('ida y vuelta de tipos básicos', async () => {
  const original = { a: 1, b: 'x', c: true, d: [1, 2, 3], e: { 4641: { n: 'Q' } } };
  const { vuelta } = await idaYVuelta(original);
  assert.deepEqual(vuelta, original);
});

test('cadenas difíciles intactas', async () => {
  const s = 'di "hola" \\ ]] |cRXP_WARN_ojo|r\nñandú á';
  const { vuelta } = await idaYVuelta([s]);
  assert.equal(vuelta[0], s);
});

test('entero grande exacto', async () => {
  const { vuelta, texto } = await idaYVuelta([8589934770]);
  assert.equal(vuelta[0], 8589934770);
  assert.match(texto, /8589934770/);
  assert.doesNotMatch(texto, /e/i);
});

test('array con huecos', async () => {
  const { vuelta, texto } = await idaYVuelta([1, null, 3]);
  assert.deepEqual(vuelta, { 1: 1, 3: 3 });
  assert.match(texto, /\[3\]=3/);
});

test('rechaza NaN', () => {
  assert.throws(() => aLua(NaN));
});

test('NUL seguido de dígito intacto', async () => {
  const { vuelta, texto } = await idaYVuelta(['a\u00001']);
  assert.equal(vuelta[0], 'a\u00001');
  assert.match(texto, /000/);
});

test('array disperso trata los huecos como null', async () => {
  // eslint-disable-next-line no-sparse-arrays
  const { vuelta } = await idaYVuelta([1, , 3]);
  assert.deepEqual(vuelta, { 1: 1, 3: 3 });
});

test('rechaza objetos no planos', () => {
  assert.throws(() => aLua(new Map()), /Map/);
  assert.throws(() => aLua(new Set()), /Set/);
  assert.throws(() => aLua(new Date()), /Date/);
});
