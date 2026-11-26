// Códec de la franja: las celdas salen del Lua del addon (banco) y la app las lee con el JS, a través de imágenes pintadas.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { sinErrores } from '../../tools/banco-wow/test/ayuda.js';
import { MAGIA, ESPEC, buscarYDecodificar, pareceFranja } from '../src/franja/codec.mjs';
import { pintarCeldas, imagenPlana, escribirBmp } from './ayuda/pintar.mjs';

const m = crearMaquina();
after(() => m.cerrar());

// Texto de Lua con los bytes dados, con escapes decimales (valen para cualquier byte).
const literalLua = (bytes) => `"${[...bytes].map((b) => `\\${String(b).padStart(3, '0')}`).join('')}"`;

// Celdas que da el Codec de Lua de verdad: {celdas, n}.
function celdasDeLua(id, carga) {
  return m.lua(`(function() local c, n = SnetForever.Codec.codificar(${id}, ${literalLua(carga)}) return {celdas = c, n = n} end)()`);
}

// Carga de pruebas: bytes de todo el rango, repetibles.
function cargaDe(n, semilla = 7) {
  const b = Buffer.alloc(n);
  let a = semilla;
  for (let i = 0; i < n; i++) { a = (Math.imul(a, 1103515245) + 12345) >>> 0; b[i] = a >>> 24; }
  return b;
}

const CASOS = [
  { nombre: 'id 7, paso 2, con ñáé y US, limpia', id: 7, carga: Buffer.from('SNF1Tal Cual…ñáédatos', 'utf8'), pintura: {} },
  { nombre: 'id 4242, paso 2,5 (bordes mezclados), 1000 bytes, ruido 60 y gamma 0,6', id: 4242, carga: cargaDe(1000), pintura: { paso: 2.5, x0: 3.3, y0: 1.7, ruido: 60, gamma: 0.6 } },
  { nombre: 'id 9, paso 2, 1400 bytes (el máximo), ruido 100 (gamma 1,8 no cambia los primarios puros)', id: 9, carga: cargaDe(1400, 99), pintura: { ruido: 100, gamma: 1.8 } },
  { nombre: 'id 77, paso 2 con desfase de 0,2 px (bordes mezclados), 1400 bytes, ruido 30 y gamma 1,8', id: 77, carga: cargaDe(1400, 5), pintura: { x0: 0.2, y0: 0.2, ruido: 30, gamma: 1.8 } },
  { nombre: 'id 65000, paso 3, x0 3, y0 2, ruido 100, gamma 1,8 y fondo de ruido', id: 65000, carga: cargaDe(600, 3), pintura: { paso: 3, x0: 3, y0: 2, ruido: 100, gamma: 1.8, fondo: 'ruido' } },
  { nombre: 'id 31, paso 2, franja desplazada dentro de la ventana (x0 301, y0 100), fondo de ruido', id: 31, carga: cargaDe(900, 21), pintura: { x0: 301, y0: 100, ruido: 60, fondo: 'ruido' } },
  { nombre: 'id 44, paso 2,7, fondo de ruido, ruido 100, gamma 1,8, 800 bytes', id: 44, carga: cargaDe(800, 4), pintura: { paso: 2.7, x0: 100.3, y0: 50.6, ruido: 100, gamma: 1.8, fondo: 'ruido' } },
  { nombre: 'id 12, paso 2, 1400 bytes en una imagen de 1920 × 1080', id: 12, carga: cargaDe(1400, 8), pintura: { x0: 1203, y0: 777, ancho: 1920, alto: 1080, ruido: 40, fondo: 'ruido' } },
];

for (const caso of CASOS) {
  test(`ida y vuelta: ${caso.nombre}`, () => {
    const { celdas, n } = celdasDeLua(caso.id, caso.carga);
    assert.equal(n, caso.carga.length + 8);
    const imagen = pintarCeldas(celdas, caso.pintura);
    assert.equal(pareceFranja(imagen), true, 'pareceFranja');
    const r = buscarYDecodificar(imagen);
    assert.equal(r.tipo, 'decodificada', JSON.stringify(r));
    assert.equal(r.id, caso.id);
    assert.ok(Buffer.isBuffer(r.bytes));
    assert.deepEqual(r.bytes, caso.carga);
    // Con la geometría que acaba de funcionar como pista también decodifica.
    const otra = buscarYDecodificar(imagen, r.geometria);
    assert.equal(otra.tipo, 'decodificada');
    sinErrores(m);
  });
}

test('una captura de 3 canales BGR también se lee', () => {
  const carga = cargaDe(300, 5);
  const { celdas } = celdasDeLua(77, carga);
  const rgba = pintarCeldas(celdas, { ruido: 40 });
  const bgr = { ancho: rgba.ancho, alto: rgba.alto, canales: 3, bgr: true, datos: new Uint8Array(rgba.ancho * rgba.alto * 3) };
  for (let p = 0; p < rgba.ancho * rgba.alto; p++) {
    bgr.datos[p * 3] = rgba.datos[p * 4 + 2];
    bgr.datos[p * 3 + 1] = rgba.datos[p * 4 + 1];
    bgr.datos[p * 3 + 2] = rgba.datos[p * 4];
  }
  const r = buscarYDecodificar(bgr);
  assert.equal(r.tipo, 'decodificada');
  assert.deepEqual(r.bytes, carga);
  assert.equal(pareceFranja(bgr), true);
});

test('un color cambiado en medio de la carga da «rechazada» por suma', () => {
  const carga = cargaDe(120, 11);
  const { celdas, n } = celdasDeLua(5, carga);
  assert.equal(n, 128);
  const rota = [...celdas];
  const medio = Math.floor(rota.length / 2);
  rota[medio] = (rota[medio] + 1) % 8;
  const r = buscarYDecodificar(pintarCeldas(rota));
  assert.equal(r.tipo, 'rechazada');
  assert.equal(r.motivo, 'suma');
  assert.ok(r.geometria && r.geometria.paso > 1.5 && r.geometria.paso < 2.5);
});

test('celdas por debajo de pasoMin dan «rechazada» por paso_pequeno', () => {
  const { celdas } = celdasDeLua(3, cargaDe(60, 2));
  const imagen = pintarCeldas(celdas, { paso: 2 });
  assert.equal(buscarYDecodificar(imagen).tipo, 'decodificada');
  const r = buscarYDecodificar(imagen, null, { pasoMin: 3 });
  assert.equal(r.tipo, 'rechazada');
  assert.equal(r.motivo, 'paso_pequeno');
});

test('una franja cortada por el borde de la imagen da «rechazada» por cortada', () => {
  const { celdas } = celdasDeLua(3, cargaDe(400, 4));
  const r = buscarYDecodificar(pintarCeldas(celdas, { alto: 8 }));
  assert.equal(r.tipo, 'rechazada');
  assert.equal(r.motivo, 'cortada');
});

test('una longitud imposible da «rechazada» por longitud', () => {
  // Magia + trama + longitud 0xFFFF: no cabe en 20 filas.
  const bytes = [0x53, 0x46, 0, 1, 0xff, 0xff];
  const celdas = [];
  let acc = 0;
  let nbits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    nbits += 8;
    while (nbits >= 3) { celdas.push((acc >> (nbits - 3)) & 7); nbits -= 3; acc &= (1 << nbits) - 1; }
  }
  if (nbits) celdas.push((acc << (3 - nbits)) & 7);
  const r = buscarYDecodificar(pintarCeldas(celdas));
  assert.equal(r.tipo, 'rechazada');
  assert.equal(r.motivo, 'longitud');
});

test('ruido sin franja: «nada» y no parece franja; lo plano tampoco', () => {
  const ruido = pintarCeldas([], { fondo: 'ruido', semilla: 123 });
  assert.equal(buscarYDecodificar(ruido).tipo, 'nada');
  assert.equal(pareceFranja(ruido), false);
  assert.equal(pareceFranja(imagenPlana(255)), false);
  assert.equal(pareceFranja(imagenPlana(0)), false);
  assert.equal(buscarYDecodificar(imagenPlana(255)).tipo, 'nada');
  assert.equal(buscarYDecodificar(imagenPlana(0)).tipo, 'nada');
});

// Sin franja, el ruido no puede dar ni «rechazada» ni «nada» distinto de «nada»: la magia de 16 bits coincide por azar.
for (const [ancho, alto] of [[1920, 1080], [2560, 1080]]) {
  test(`ruido a ${ancho}×${alto}, 50 semillas: siempre «nada» y pareceFranja falso`, () => {
    for (let semilla = 1; semilla <= 50; semilla++) {
      const img = pintarCeldas([], { ancho, alto, fondo: 'ruido', semilla });
      assert.equal(pareceFranja(img), false, `pareceFranja, semilla ${semilla}`);
      const r = buscarYDecodificar(img);
      assert.equal(r.tipo, 'nada', `semilla ${semilla}: ${JSON.stringify(r)}`);
    }
  });
}

// Prueba de tiempo: depende de la máquina (medido: 60-73 ms la búsqueda completa); con margen amplio, y se salta con
// SNF_SIN_PRUEBAS_DE_TIEMPO=1 (por ejemplo en un equipo muy cargado o en integración continua).
const SIN_TIEMPOS = Boolean(process.env.SNF_SIN_PRUEBAS_DE_TIEMPO);
test('tiempo: la búsqueda completa y pareceFranja en 1920×1080 ruidosa cuestan poco', { skip: SIN_TIEMPOS && 'SNF_SIN_PRUEBAS_DE_TIEMPO' }, () => {
  const img = pintarCeldas([], { ancho: 1920, alto: 1080, fondo: 'ruido', semilla: 9 });
  buscarYDecodificar(img); // calienta el JIT
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) buscarYDecodificar(img);
  const completa = (performance.now() - t0) / 5;
  const t1 = performance.now();
  for (let i = 0; i < 5; i++) pareceFranja(img);
  const barata = (performance.now() - t1) / 5;
  console.log(`# búsqueda completa ${completa.toFixed(1)} ms, pareceFranja ${barata.toFixed(1)} ms`);
  assert.ok(completa < 500, `búsqueda completa: ${completa} ms`);
  assert.ok(barata < 500, `pareceFranja: ${barata} ms`);
});

test('una carga de 1.401 bytes da error en Lua y la de 1.400 no', () => {
  assert.throws(() => m.lua('SnetForever.Codec.codificar(1, string.rep("a", 1401))'), /1401/);
  assert.doesNotThrow(() => m.lua('SnetForever.Codec.codificar(1, string.rep("a", 1400))'));
  sinErrores(m);
});

test('las constantes del protocolo P1 coinciden en Lua y JS', () => {
  assert.deepEqual(m.lua('SnetForever.Codec.MAGIA'), [0x53, 0x46]);
  assert.deepEqual(MAGIA, [0x53, 0x46]);
  assert.equal(m.lua('SnetForever.Codec.BITS'), 3);
  assert.equal(m.lua('SnetForever.Codec.MAX_CARGA'), 1400);
  assert.equal(m.lua('SnetForever.Codec.CELDAS_FILA'), ESPEC.celdas);
  assert.equal(m.lua('SnetForever.Codec.FILAS_MAX'), ESPEC.filas);
  assert.equal(m.lua('SnetForever.Codec.CELDA'), 2);
  assert.deepEqual(ESPEC, { celdas: 200, filas: 20, filasBusqueda: Infinity, columnasBusqueda: Infinity, pasoMin: 1.5, pasoMax: 12 });
});

test('Lua: fletcher16 y color', () => {
  assert.deepEqual(m.lua('(function() local a, b = SnetForever.Codec.fletcher16({1, 2, 3, 4, 5}, 2, 4) return {a, b} end)()'), [9, 16]);
  assert.deepEqual(m.lua('(function() local r, g, b = SnetForever.Codec.color(5) return {r, g, b} end)()'), [1, 0, 1]);
  assert.deepEqual(m.lua('(function() local r, g, b = SnetForever.Codec.color(2) return {r, g, b} end)()'), [0, 1, 0]);
});

test('Lua: «destino» se reutiliza y se recorta a las celdas de esta trama', () => {
  const r = m.lua(`(function()
    local d = {}
    local c1 = SnetForever.Codec.codificar(1, string.rep("x", 100), d)
    local largo = #d
    local c2, n2 = SnetForever.Codec.codificar(2, "ab", d)
    return {mismo = (c1 == d and c2 == d), largo = largo, corto = #d, n2 = n2}
  end)()`);
  assert.equal(r.mismo, true);
  assert.equal(r.largo, Math.ceil(108 * 8 / 3));
  assert.equal(r.corto, Math.ceil(10 * 8 / 3));
  assert.equal(r.n2, 10);
});

test('escribirBmp deja un BMP de 32 bits de arriba abajo con la franja', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snf-bmp-'));
  const ruta = join(dir, 'franja.bmp');
  const { celdas } = celdasDeLua(1, Buffer.from('hola'));
  escribirBmp(pintarCeldas(celdas), ruta);
  assert.ok(existsSync(ruta));
  const b = readFileSync(ruta);
  assert.equal(b.toString('latin1', 0, 2), 'BM');
  assert.equal(b.readUInt16LE(28), 32);
  assert.equal(b.readInt32LE(22), -208);
  assert.equal(b.length, 54 + 816 * 208 * 4);
  // La primera celda es verde puro (0x53 empieza por 010): píxel BGRA = 0, 255, 0, 255.
  assert.deepEqual([...b.subarray(54, 58)], [0, 255, 0, 255]);
});
