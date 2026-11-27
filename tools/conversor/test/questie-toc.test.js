// Pruebas del lector del .toc de QuestieDB y del decodificador CBOR.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerToc } from '../src/questie/toc.js';
import { decodificarCbor, valorCbor } from '../src/questie/cbor.js';
import { rutaQuestieToc } from '../src/config.js';

const miniFixture = new URL('./fixtures/mini.toc', import.meta.url);
const incompleteFixture = new URL('./fixtures/mini-roto.toc', import.meta.url);

// ---- codificador CBOR mínimo (solo para fabricar datos de prueba) ----
const cab = (mayor, n) => {
  if (n < 24) return [(mayor << 5) | n];
  if (n < 256) return [(mayor << 5) | 24, n];
  if (n < 65536) return [(mayor << 5) | 25, n >> 8, n & 255];
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return [(mayor << 5) | 27, ...b];
};
const bytesDe = (...partes) => Uint8Array.from(partes.flat());
const cadena = (s) => [...cab(2, Buffer.byteLength(s)), ...Buffer.from(s, 'utf8')];
const array = (...items) => [...cab(4, items.length), ...items.flat()];
const mapa = (...pares) => [...cab(5, pares.length / 2), ...pares.flat()];
const NULO = [0xf6];
const entero = (n) => cab(0, n);

describe('leerToc', () => {
  let toc;
  let tempDirectory;
  before(() => {
    tempDirectory = mkdtempSync(join(tmpdir(), 'snf-questie-toc-'));
    const crlfPath = join(tempDirectory, 'mini.toc');
    const fixture = readFileSync(miniFixture, 'utf8');
    writeFileSync(crlfPath, fixture.replace(/\r?\n/g, '\r\n'));
    toc = leerToc(crlfPath);
  });
  after(() => {
    if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  });

  test('corta en el primer ":" y quita espacios', () => {
    assert.equal(toc.get('Titulo'), 'con: dos puntos');
    assert.equal(toc.get('X-Contract-Version'), '4');
    assert.equal(toc.has('Archivo.lua'), false);
  });

  test('reensambla ~3~', () => {
    assert.deepEqual(valorCbor(toc, 'X-Quest-IDS', { zlib: true }), [10, 20, 30]);
  });

  test('parte que falta da error', () => {
    assert.throws(() => leerToc(incompleteFixture), /parte 2 de X-Roto/);
  });

  test('clave inexistente devuelve undefined', () => {
    assert.equal(valorCbor(toc, 'X-No-Existe'), undefined);
  });
});

describe('decodificarCbor', () => {
  test('entero de 8 bytes 8589934770', () => {
    assert.equal(decodificarCbor(bytesDe(0x1b, 0, 0, 0, 2, 0, 0, 0, 0xb2)), 8589934770);
  });

  test('entero mayor que MAX_SAFE_INTEGER es BigInt', () => {
    const v = decodificarCbor(bytesDe(0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff));
    assert.equal(v, 18446744073709551615n);
  });

  test('negativo -263', () => {
    assert.equal(decodificarCbor(bytesDe(0x39, 0x01, 0x06)), -263);
  });

  test('float16 1.5', () => {
    assert.equal(decodificarCbor(bytesDe(0xf9, 0x3e, 0x00)), 1.5);
  });

  test('float32 y float64', () => {
    assert.equal(decodificarCbor(bytesDe(0xfa, 0x3f, 0xc0, 0, 0)), 1.5);
    const b = Buffer.alloc(9);
    b[0] = 0xfb;
    b.writeDoubleBE(1234.5678, 1);
    assert.equal(decodificarCbor(b), 1234.5678);
  });

  test('null dentro de array', () => {
    assert.deepEqual(decodificarCbor(bytesDe(array(NULO, entero(7)))), [null, 7]);
  });

  test('mapa {1:…, "p":5} con claves texto', () => {
    const v = decodificarCbor(bytesDe(mapa(entero(1), cadena('hola'), cadena('p'), entero(5))));
    assert.deepEqual(Object.keys(v).sort(), ['1', 'p']);
    assert.equal(v.p, 5);
    // las cadenas de bytes (mayor 2) llegan como Uint8Array
    assert.ok(v['1'] instanceof Uint8Array);
    assert.equal(Buffer.from(v['1']).toString('utf8'), 'hola');
  });

  test('tipo no soportado lanza error con byte y posición', () => {
    assert.throws(
      () => decodificarCbor(bytesDe(array(entero(1), [0xc1, 0x00]))),
      /0xc1.*2|2.*0xc1/,
    );
  });

  test('bytes sobrantes dan error', () => {
    assert.throws(() => decodificarCbor(bytesDe(entero(1), entero(2))), /sobran/);
  });
});

describe('integración con el .toc real', () => {
  const ruta = rutaQuestieToc();
  let toc;
  before(() => { if (existsSync(ruta)) toc = leerToc(ruta); });

  test('X-Contract-Version vale "4"', { skip: !existsSync(ruta) }, () => {
    assert.equal(toc.get('X-Contract-Version'), '4');
  });

  // Lote H: un mínimo, no la cifra exacta (5233 en QuestieDB 1.0.11, 5682 en la 1.0.14): cada versión de Questie
  // añade misiones; si baja de las de la 1.0.11, algo se ha perdido al leerlo.
  test('X-Quest-IDS (zlib) es un array ascendente de al menos 5233 IDs', { skip: !existsSync(ruta) }, () => {
    const ids = valorCbor(toc, 'X-Quest-IDS', { zlib: true });
    assert.ok(ids.length >= 5233, `solo ${ids.length} IDs`);
    for (let i = 1; i < ids.length; i++) assert.ok(ids[i] > ids[i - 1]);
  });
});
