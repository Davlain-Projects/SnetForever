// Biblioteca de guías: los enlaces (bajar una página una vez y guardar una copia limpia del texto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { anadirEnlace, enlacesPendientes, revisarEnlaces, actualizarEnlaces } from '../src/biblioteca/enlaces.mjs';
import { ErrorRed } from '../src/actualizar/red.mjs';
import { leerArchivoGuia } from '../src/biblioteca/leer.mjs';
import * as fs from 'node:fs';

const nuevaCarpeta = (prefijo) => {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  return mkdtempSync(join(process.env.SNF_DATOS, prefijo));
};
const escribir = (ruta, texto) => {
  mkdirSync(join(ruta, '..'), { recursive: true });
  writeFileSync(ruta, texto);
};
const URL_A = 'https://guias.ejemplo.test/baldios';
const AHORA = () => Date.UTC(2026, 10, 15, 12, 0, 0);

// «ñ» en windows-1252 es 0xF1
const html1252 = Buffer.concat([
  Buffer.from('<html><head><title>Baldíos</title></head><body><h1>Gu', 'latin1'),
  Buffer.from([0xed]), Buffer.from('a Ala ', 'latin1'), Buffer.from([0xf1]),
  Buffer.from('o</h1><p>1. Acepta "Colmillos" en (40.5, 30.5)</p><div id="comments"><h2>Comments</h2><p>basura de comentarios</p></div></body></html>', 'latin1'),
]);
const falso = (cuerpo, tipo = 'text/html; charset=windows-1252') => {
  const llamadas = [];
  const f = async (url) => { llamadas.push(url); return { url, tipo, cuerpo }; };
  f.llamadas = llamadas;
  return f;
};
const copias = (datos) => {
  try { return readdirSync(join(datos, 'guias', 'enlaces')); } catch { return []; }
};

test('una página windows-1252 se guarda con la ñ y sin comentarios, y leer.mjs la lee como página', async () => {
  const datos = nuevaCarpeta('datos-');
  const r = await anadirEnlace(URL_A, { datos, fs, obtener: falso(html1252), ahora: AHORA });
  assert.equal(r.ok, true);
  assert.equal(r.host, 'guias.ejemplo.test');
  assert.match(r.archivo, /^enlaces\/guias\.ejemplo\.test-[0-9a-f]{8}\.txt$/);
  const ruta = join(datos, 'guias', ...r.archivo.split('/'));
  const texto = readFileSync(ruta, 'utf8');
  assert.ok(texto.startsWith(`# Dirección: ${URL_A}\n# Bajada: 2026-11-15T12:00:00.000Z\n\n`), texto);
  assert.match(texto, /Guía Ala ño/);
  assert.doesNotMatch(texto, /basura de comentarios/);
  const l = leerArchivoGuia(ruta, { fs });
  assert.equal(l.formato, 'pagina');
});

test('http se pide como https y el nombre sale del sha1 de la url normalizada', async () => {
  const datos = nuevaCarpeta('datos-');
  const obt = falso(Buffer.from('Paso uno'), 'text/plain; charset=utf-8');
  const a = await anadirEnlace('http://guias.ejemplo.test/baldios', { datos, fs, obtener: obt, ahora: AHORA });
  const b = await anadirEnlace(URL_A, { datos, fs, obtener: obt, ahora: AHORA });
  assert.equal(a.archivo, b.archivo);
  assert.deepEqual(obt.llamadas, [URL_A, URL_A]);
  assert.equal(copias(datos).length, 1);
});

test('una página text/plain se guarda como texto', async () => {
  const datos = nuevaCarpeta('datos-');
  const r = await anadirEnlace(URL_A, { datos, fs, obtener: falso(Buffer.from('Línea <b>uno</b>\nlínea dos'), 'text/plain; charset=utf-8'), ahora: AHORA });
  const texto = readFileSync(join(datos, 'guias', ...r.archivo.split('/')), 'utf8');
  assert.match(texto, /Línea <b>uno<\/b>\nlínea dos/);
});

test('una dirección de la red local da red_local sin llamar a obtener; una mal escrita, url', async () => {
  const datos = nuevaCarpeta('datos-');
  const obt = falso(Buffer.from('x'));
  for (const t of ['https://192.168.1.5/x', 'http://localhost/guia', 'https://router.local/x', 'https://intranet/x']) {
    assert.deepEqual(await anadirEnlace(t, { datos, fs, obtener: obt }), { ok: false, motivo: 'red_local' }, t);
  }
  for (const t of ['esto no es una dirección', 'ftp://guias.ejemplo.test/x', '', 'https://8.8.8.8/x']) {
    assert.deepEqual(await anadirEnlace(t, { datos, fs, obtener: obt }), { ok: false, motivo: 'url' }, t);
  }
  assert.equal(obt.llamadas.length, 0);
  assert.deepEqual(copias(datos), []);
});

test('los fallos de red salen como su motivo', async () => {
  const datos = nuevaCarpeta('datos-');
  const falla = (code) => async () => { throw new ErrorRed(code, 'x'); };
  for (const [code, motivo] of [['tamano', 'tamano'], ['estado', 'estado'], ['tiempo', 'tiempo'], ['conexion', 'conexion'], ['red_local', 'red_local'], ['redireccion', 'conexion']]) {
    assert.deepEqual(await anadirEnlace(URL_A, { datos, fs, obtener: falla(code) }), { ok: false, motivo }, code);
  }
  assert.deepEqual(await anadirEnlace(URL_A, { datos, fs, obtener: async () => { throw new Error('raro'); } }), { ok: false, motivo: 'conexion' });
  assert.deepEqual(copias(datos), []);
});

test('una página sin texto da vacio y no guarda nada', async () => {
  const datos = nuevaCarpeta('datos-');
  const r = await anadirEnlace(URL_A, { datos, fs, obtener: falso(Buffer.from('<html><body><script>x()</script></body></html>'), 'text/html'), ahora: AHORA });
  assert.deepEqual(r, { ok: false, motivo: 'vacio' });
  assert.deepEqual(copias(datos), []);
});

test('.url y enlaces.txt salen como pendientes hasta que se bajan', async () => {
  const datos = nuevaCarpeta('datos-');
  escribir(join(datos, 'guias', 'Mis enlaces', 'baldios.url'), `[InternetShortcut]\r\nURL=${URL_A}\r\nIconIndex=0\r\n`);
  escribir(join(datos, 'guias', 'enlaces.txt'), '# mis páginas\n\nhttps://otra.ejemplo.test/b\nhttps://192.168.1.5/no\nno es dirección\n');
  const antes = enlacesPendientes({ datos, fs });
  assert.deepEqual([...antes].sort(), [URL_A, 'https://otra.ejemplo.test/b'].sort());
  await anadirEnlace(URL_A, { datos, fs, obtener: falso(Buffer.from('uno'), 'text/plain'), ahora: AHORA });
  assert.deepEqual(enlacesPendientes({ datos, fs }), ['https://otra.ejemplo.test/b']);
  await anadirEnlace('https://otra.ejemplo.test/b', { datos, fs, obtener: falso(Buffer.from('dos'), 'text/plain'), ahora: AHORA });
  assert.deepEqual(enlacesPendientes({ datos, fs }), []);
});

test('sin carpeta de guías no hay pendientes', () => {
  assert.deepEqual(enlacesPendientes({ datos: nuevaCarpeta('datos-'), fs }), []);
});

test('actualizarEnlaces aparta la copia vieja a la cuarentena antes de escribir la nueva', async () => {
  const datos = nuevaCarpeta('datos-');
  const r = await anadirEnlace(URL_A, { datos, fs, obtener: falso(Buffer.from('versión vieja'), 'text/plain'), ahora: AHORA });
  const ruta = join(datos, 'guias', ...r.archivo.split('/'));
  let vistoAntes = null;
  const obtener = async (url) => {
    vistoAntes = readFileSync(ruta, 'utf8');
    return { url, tipo: 'text/plain', cuerpo: Buffer.from('versión nueva') };
  };
  const res = await actualizarEnlaces({ datos, fs, obtener, ahora: () => Date.UTC(2026, 10, 16) });
  assert.deepEqual(res, { bajados: 1, fallidos: 0, rechazados: 0 });
  assert.match(vistoAntes, /versión vieja/);
  assert.match(readFileSync(ruta, 'utf8'), /versión nueva/);
  assert.match(readFileSync(ruta, 'utf8'), /2026-11-16T00:00:00\.000Z/);
  const cuarentena = join(datos, 'cuarentena');
  const apartados = readdirSync(cuarentena).flatMap((d) => readdirSync(join(cuarentena, d)));
  assert.equal(apartados.length, 1);
  const dentro = readdirSync(cuarentena).map((d) => join(cuarentena, d, apartados[0])).find((p) => existsSync(p));
  assert.match(readFileSync(dentro, 'utf8'), /versión vieja/);
});

test('si la bajada falla al actualizar, la copia vieja se queda y cuenta como fallida', async () => {
  const datos = nuevaCarpeta('datos-');
  const r = await anadirEnlace(URL_A, { datos, fs, obtener: falso(Buffer.from('copia buena'), 'text/plain'), ahora: AHORA });
  const ruta = join(datos, 'guias', ...r.archivo.split('/'));
  const res = await actualizarEnlaces({ datos, fs, obtener: async () => { throw new ErrorRed('tiempo', 'x'); } });
  assert.deepEqual(res, { bajados: 0, fallidos: 1, rechazados: 0 });
  assert.match(readFileSync(ruta, 'utf8'), /copia buena/);
});

test('el registro no lleva la dirección ni el sitio', async () => {
  const datos = nuevaCarpeta('datos-');
  await anadirEnlace(URL_A, { datos, fs, obtener: async () => { throw new ErrorRed('estado', 'x'); } });
  await anadirEnlace(URL_A, { datos, fs, obtener: falso(Buffer.from('hola'), 'text/plain'), ahora: AHORA });
  await actualizarEnlaces({ datos, fs, obtener: falso(Buffer.from('hola 2'), 'text/plain'), ahora: AHORA });
  const log = readFileSync(join(process.env.SNF_DATOS, 'registro.log'), 'utf8');
  assert.match(log, /estado/);
  assert.doesNotMatch(log, /ejemplo\.test|baldios|https?:/);
});

// Punto de prueba A: un enlaces.txt con una dirección de la red de casa se descartaba sin decirlo.
test('revisarEnlaces: las pendientes y, aparte, las rechazadas (red local o mal escritas), sin repetir', () => {
  const datos = nuevaCarpeta('datos-');
  escribir(join(datos, 'guias', 'enlaces.txt'), '# mis páginas\nhttps://otra.ejemplo.test/b\nhttps://192.168.1.1/\nno es dirección\nhttps://192.168.1.1/\n');
  escribir(join(datos, 'guias', 'casa.url'), '[InternetShortcut]\r\nURL=http://localhost/guia\r\n');
  const r = revisarEnlaces({ datos, fs });
  assert.deepEqual(r.pendientes, enlacesPendientes({ datos, fs }));
  assert.deepEqual(r.pendientes, ['https://otra.ejemplo.test/b']);
  assert.deepEqual([...r.rechazadas].sort(), ['http://localhost/guia', 'https://192.168.1.1/', 'no es dirección'].sort());
});

test('actualizarEnlaces cuenta aparte las rechazadas y el registro lo dice sin la dirección', async () => {
  const datos = nuevaCarpeta('datos-');
  escribir(join(datos, 'guias', 'enlaces', 'vieja.txt'), '# Dirección: https://192.168.1.1/guia\n\nx\n');
  const res = await actualizarEnlaces({ datos, fs, obtener: falso(Buffer.from('hola'), 'text/plain'), ahora: AHORA });
  assert.deepEqual(res, { bajados: 0, fallidos: 0, rechazados: 1 });
  const log = readFileSync(join(process.env.SNF_DATOS, 'registro.log'), 'utf8');
  assert.match(log, /enlaces actualizados 0, fallidos 0, rechazados 1/);
  assert.doesNotMatch(log, /192\.168/);
});
