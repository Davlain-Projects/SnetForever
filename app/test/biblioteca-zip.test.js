// Biblioteca de guías: el lector de .zip propio (sin dependencias: directorio central y node:zlib).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerZip, ErrorZip } from '../src/biblioteca/zip.mjs';
import { hacerZip } from './hacer-zip.mjs';

const TOPES = { archivos: 2000, porArchivo: 1024 * 1024, total: 4 * 1024 * 1024 };
const deTexto = (ruta) => /\.(?:lua|txt|md|html)$/i.test(ruta);
const fallaCon = (fn, codigo) => assert.throws(fn, (e) => e instanceof ErrorZip && e.code === codigo, codigo);

test('lee entradas store y deflate y se queda solo con las que pide', () => {
  const zip = hacerZip([
    { nombre: 'Guias/', datos: '' },
    { nombre: 'Guias/baldios.lua', datos: 'SNF = { pasos = {} }', metodo: 'deflate' },
    { nombre: 'Guias/LEEME.md', datos: '# Hola', metodo: 'store' },
    { nombre: 'Guias/icono.png', datos: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    { nombre: 'Guias/instalar.exe', datos: 'MZ' },
  ]);
  const r = leerZip(zip, { topes: TOPES, quedarse: deTexto });
  assert.deepEqual(r.archivos.map((a) => a.ruta), ['Guias/baldios.lua', 'Guias/LEEME.md']);
  assert.equal(r.archivos[0].datos.toString('utf8'), 'SNF = { pasos = {} }');
  assert.equal(r.archivos[1].datos.toString('utf8'), '# Hola');
  assert.equal(r.saltados, 2);
});

test('zip slip: rutas absolutas, con unidad, con «..» o con barras de Windows dan peligroso', () => {
  for (const nombre of ['../x.lua', 'C:\\x.lua', '/x.lua', 'a/../../x.lua', 'a\\..\\x.lua', '\\x.lua', 'c:x.lua', 'a/x.lua:flujo',
    'con.lua', 'a/NUL', 'a/x.lua.', 'x\u0000.lua']) {
    const zip = hacerZip([{ nombre: 'bien.lua', datos: 'x' }, { nombre, datos: 'y' }]);
    fallaCon(() => leerZip(zip, { topes: TOPES, quedarse: deTexto }), 'peligroso');
  }
  // aunque la entrada mala no sea de las que se quedan
  fallaCon(() => leerZip(hacerZip([{ nombre: '../x.png', datos: 'y' }]), { topes: TOPES, quedarse: deTexto }), 'peligroso');
});

test('un enlace simbólico dentro del zip da peligroso', () => {
  const zip = hacerZip([{ nombre: 'enlace.lua', datos: '/etc/passwd', enlace: true }]);
  fallaCon(() => leerZip(zip, { topes: TOPES, quedarse: deTexto }), 'peligroso');
  // un archivo normal hecho en Unix vale
  const bueno = hacerZip([{ nombre: 'a.lua', datos: 'x', hostUnix: true }]);
  assert.equal(leerZip(bueno, { topes: TOPES, quedarse: deTexto }).archivos.length, 1);
});

test('cifrado, zip64, otro método, CRC que no cuadra o lo que no es zip dan zip', () => {
  fallaCon(() => leerZip(hacerZip([{ nombre: 'a.lua', datos: 'x', flags: 1 }]), { topes: TOPES, quedarse: deTexto }), 'zip');
  fallaCon(() => leerZip(hacerZip([{ nombre: 'a.lua', datos: 'x' }], { zip64: true }), { topes: TOPES, quedarse: deTexto }), 'zip');
  fallaCon(() => leerZip(hacerZip([{ nombre: 'a.lua', datos: 'x', metodo: 'raro' }]), { topes: TOPES, quedarse: deTexto }), 'zip');
  fallaCon(() => leerZip(hacerZip([{ nombre: 'a.lua', datos: 'x', crc: 1234 }]), { topes: TOPES, quedarse: deTexto }), 'zip');
  fallaCon(() => leerZip(Buffer.from('<html>espera</html>'), { topes: TOPES, quedarse: deTexto }), 'zip');
  fallaCon(() => leerZip(hacerZip([{ nombre: 'a.lua', datos: 'x' }]).subarray(0, 40), { topes: TOPES, quedarse: deTexto }), 'zip');
  // dos rutas que en Windows son la misma
  fallaCon(() => leerZip(hacerZip([{ nombre: 'A.lua', datos: 'x' }, { nombre: 'a.lua', datos: 'y' }]), { topes: TOPES, quedarse: deTexto }), 'zip');
});

test('topes: número de archivos, tamaño por archivo, total y una cabecera que miente', () => {
  const muchos = hacerZip(Array.from({ length: 6 }, (_, i) => ({ nombre: `f${i}.png`, datos: 'x' })));
  fallaCon(() => leerZip(muchos, { topes: { ...TOPES, archivos: 5 }, quedarse: deTexto }), 'demasiados');
  assert.equal(leerZip(muchos, { topes: { ...TOPES, archivos: 6 }, quedarse: deTexto }).saltados, 6);

  const grande = hacerZip([{ nombre: 'a.lua', datos: 'x'.repeat(5000) }]);
  fallaCon(() => leerZip(grande, { topes: { ...TOPES, porArchivo: 4999 }, quedarse: deTexto }), 'tamano');
  const dos = hacerZip([{ nombre: 'a.lua', datos: 'x'.repeat(3000) }, { nombre: 'b.lua', datos: 'y'.repeat(3000) }]);
  fallaCon(() => leerZip(dos, { topes: { ...TOPES, total: 5000 }, quedarse: deTexto }), 'tamano');
  // los que no se quedan no cuentan para el total
  assert.equal(leerZip(dos, { topes: { ...TOPES, total: 5000 }, quedarse: (r) => r === 'a.lua' }).archivos.length, 1);
  // bomba: la cabecera dice 10 bytes y descomprimido son 100 000
  const bomba = hacerZip([{ nombre: 'a.lua', datos: 'x'.repeat(100_000), tamano: 10 }]);
  assert.throws(() => leerZip(bomba, { topes: TOPES, quedarse: deTexto }), (e) => e instanceof ErrorZip && ['tamano', 'zip'].includes(e.code));
});
