// Paquete de texto para importar guías RXP desde el juego (rxp/paquete.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adler32, aLuaAscii, crearPaquete } from '../src/rxp/paquete.js';

const guia = (clave, pasos = 1) => ({
  clave, grupo: 'Mis guías RXP · Prueba', nombre: clave.split('\\').pop(), niveles: [1, 2], siguientes: [],
  pasos: Array.from({ length: pasos }, (_, i) => ({ id: `p${i}`, n: i + 1, elementos: [{ t: 'manual', texto: { en: 'a|b ñ' } }] })),
});

test('Adler-32 como el de referencia', () => {
  assert.equal(adler32('Wikipedia'), '11e60398');
  assert.equal(adler32(''), '00000001');
});

test('el Lua del paquete solo lleva ASCII imprimible: «|», controles y no ASCII van como \\ddd', () => {
  assert.equal(aLuaAscii({ t: 'a|b\tñ' }), '{t="a\\124b\\009\\195\\177"}');
});

test('las partes juntas son el paquete; cada una lleva su suma y la del paquete', () => {
  const guias = new Map([['RXP\\Prueba\\01-02 A', guia('RXP\\Prueba\\01-02 A', 40)]]);
  guias.get('RXP\\Prueba\\01-02 A').siguientes = [{ clave: 'RXP\\Prueba\\02-03 B' }];
  const p = crearPaquete(guias, { version: '2026.01.01.1', tamanoParte: 500 });
  assert.ok(p.partes.length > 1);
  const trozos = p.partes.map((parte) => {
    const [cabecera, id, k, n, suma, sumaParte, ...resto] = parte.split(':');
    const trozo = resto.join(':');
    assert.deepEqual([cabecera, id, Number(n), suma, sumaParte], ['SNFRXP1', p.id, p.partes.length, p.suma, adler32(trozo)]);
    return [Number(k), trozo];
  });
  assert.equal(trozos.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(''), p.texto);
  assert.equal(adler32(p.texto), p.suma);
  assert.deepEqual([p.resumen.guias, p.resumen.pasos, p.resumen.fuera], [1, 40, ['RXP\\Prueba\\02-03 B']]);
  assert.throws(() => crearPaquete(guias, { version: 'v', tamanoParte: 10 }), /máximo 99 partes/);
  assert.throws(() => crearPaquete(new Map(), { version: 'v' }), /ninguna guía/);
});

test('el conversor rechaza un paquete que supera el límite del juego', () => {
  const clave = 'RXP\\Prueba\\01-02 A';
  const larga = guia(clave);
  larga.pasos[0].elementos[0].texto.en = 'a'.repeat(4000000);
  assert.throws(() => crearPaquete(new Map([[clave, larga]]), { version: 'v' }), /el juego admite 4000000/);
});
