// Biblioteca de guías: guardar una guía de internet (página, archivo suelto o .zip) sin dar herramientas de archivos a la IA.
// Sin red de verdad: la red va inyectada (una función falsa o obtenerPagina contra un servidor de esta prueba en 127.0.0.1).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { guardarGuia, nombreSeguro, TOPES, ERRORES, MENSAJES, ESPERA_INDICE_MS } from '../src/biblioteca/guardar.mjs';
import { crearIndice } from '../src/biblioteca/indice.mjs';
import { obtenerPagina, ErrorRed } from '../src/actualizar/red.mjs';
import { hacerZip } from './hacer-zip.mjs';

const nuevaCarpeta = () => {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  return mkdtempSync(join(process.env.SNF_DATOS, 'guardar-'));
};
const guias = (datos) => join(datos, 'guias');
const lista = (dir) => {
  try { return readdirSync(dir).sort(); } catch { return []; }
};
const falso = (cuerpo, tipo = 'application/octet-stream', url = null) => {
  const llamadas = [];
  const f = async (u, opciones) => { llamadas.push({ url: u, opciones }); return { url: url ?? u, tipo, cuerpo: Buffer.from(cuerpo) }; };
  f.llamadas = llamadas;
  return f;
};
const fallaRed = (codigo, extra) => async () => { throw new ErrorRed(codigo, 'falso', extra); };
const conIndice = (datos) => {
  const indice = crearIndice({ datos, fs, base: async () => null });
  return async () => { await indice.actualizar(); return indice.indice(); };
};
const TXT = '# Guía de prueba\n1. Acepta «Colmillos» en (40.5, 30.5)\n2. Entrega «Colmillos» en (41.2, 31.0)\n';
const HTML = '<html><head><title>Baldíos</title></head><body><h1>Guía Baldíos</h1><ol><li>Acepta "Colmillos" en (40.5, 30.5)</li>'
  + '<li>Entrega "Colmillos" en (41.2, 31.0)</li></ol></body></html>';

// ---------- el servidor de prueba (solo 127.0.0.1) ----------
const servidor = http.createServer((req, res) => {
  if (req.url === '/prohibido.zip') { res.writeHead(403, { 'content-type': 'text/html' }); res.end('<html>no</html>'); return; }
  if (req.url === '/a-casa.zip') { res.writeHead(302, { location: 'http://192.168.1.10/guia.zip' }); res.end(); return; }
  if (req.url === '/grande.zip') { res.writeHead(200, { 'content-type': 'application/zip' }); res.end(Buffer.alloc(5000)); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;
after(() => servidor.close());
// las direcciones públicas de las pruebas se piden de verdad (obtenerPagina) al servidor local
const red = (url, opciones) => obtenerPagina(url.replace('https://guias.ejemplo.com', BASE), { ...opciones, permitirLocal: true, transporte: http.get });

test('página web: se guarda como enlace de la biblioteca (como «Añadir enlace») y se reindexa', async () => {
  const datos = nuevaCarpeta();
  const obtener = falso(HTML, 'text/html; charset=utf-8');
  const r = await guardarGuia({ url: 'https://guias.ejemplo.com/baldios' }, { datos, obtener, reindexar: conIndice(datos) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.guardado.tipo, 'pagina');
  assert.match(r.guardado.enlace, /^enlaces\/guias\.ejemplo\.com-[0-9a-f]{8}\.txt$/);
  assert.deepEqual(r.guardado.archivos, [r.guardado.enlace]);
  const texto = readFileSync(join(guias(datos), ...r.guardado.enlace.split('/')), 'utf8');
  assert.ok(texto.startsWith('# Dirección: https://guias.ejemplo.com/baldios\n'), texto);
  assert.ok(r.guiasNuevas >= 1, `guiasNuevas: ${r.guiasNuevas}`);
  assert.equal(obtener.llamadas.length, 1, 'se baja una sola vez');
  assert.equal(obtener.llamadas[0].opciones.maxBytes, TOPES.descarga);
});

test('un .lua o .txt suelto se guarda tal cual en guias\\<nombre>\\ y el índice lo lee', async () => {
  const datos = nuevaCarpeta();
  const r = await guardarGuia({ url: 'https://raw.ejemplo.com/autor/guias/main/Baldios_Horda.txt' },
    { datos, obtener: falso(TXT, 'text/plain'), reindexar: conIndice(datos) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.guardado, { tipo: 'archivo', carpeta: 'Baldios_Horda', archivos: ['Baldios_Horda/Baldios_Horda.txt'] });
  assert.equal(readFileSync(join(guias(datos), 'Baldios_Horda', 'Baldios_Horda.txt'), 'utf8'), TXT);
  assert.equal(r.guiasNuevas, 1);
  const lua = await guardarGuia({ url: 'https://raw.ejemplo.com/a/b/guia.lua', nombre: 'Mi guía' }, { datos, obtener: falso('SNF = {}', 'text/plain') });
  assert.equal(lua.guardado.carpeta, 'Mi guía');
  assert.equal(readFileSync(join(guias(datos), 'Mi guía', 'guia.lua'), 'utf8'), 'SNF = {}');
  assert.equal(lua.guiasNuevas, null, 'sin índice no se sabe');
});

test('un .zip: se descomprime en una carpeta nueva y solo se quedan .lua, .txt, .md y .html (nada que se pueda ejecutar)', async () => {
  const datos = nuevaCarpeta();
  const zip = hacerZip([
    { nombre: 'GuiasBaldios-main/', datos: '' },
    { nombre: 'GuiasBaldios-main/guias/baldios.txt', datos: TXT },
    { nombre: 'GuiasBaldios-main/LEEME.md', datos: '# Léeme', metodo: 'store' },
    { nombre: 'GuiasBaldios-main/indice.html', datos: '<p>hola</p>' },
    { nombre: 'GuiasBaldios-main/Guias.lua', datos: 'SNF = {}' },
    { nombre: 'GuiasBaldios-main/icono.png', datos: Buffer.from([0x89, 0x50]) },
    { nombre: 'GuiasBaldios-main/instalar.exe', datos: 'MZ' },
    { nombre: 'GuiasBaldios-main/codigo.js', datos: 'process.exit(1)' },
    { nombre: 'GuiasBaldios-main/arranque.bat', datos: 'del *' },
  ]);
  const r = await guardarGuia({ url: 'https://github.com/autor/GuiasBaldios/archive/refs/heads/main.zip' },
    { datos, obtener: falso(zip, 'application/zip'), reindexar: conIndice(datos) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.guardado.tipo, 'zip');
  assert.equal(r.guardado.carpeta, 'GuiasBaldios');
  assert.deepEqual([...r.guardado.archivos].sort(), ['GuiasBaldios/GuiasBaldios-main/Guias.lua', 'GuiasBaldios/GuiasBaldios-main/LEEME.md',
    'GuiasBaldios/GuiasBaldios-main/guias/baldios.txt', 'GuiasBaldios/GuiasBaldios-main/indice.html']);
  const raiz = join(guias(datos), 'GuiasBaldios', 'GuiasBaldios-main');
  assert.deepEqual(lista(raiz), ['Guias.lua', 'LEEME.md', 'guias', 'indice.html']);
  assert.equal(readFileSync(join(raiz, 'guias', 'baldios.txt'), 'utf8'), TXT);
  assert.ok(r.guiasNuevas >= 1);
  // en guias\ no queda ninguna carpeta temporal
  assert.deepEqual(lista(guias(datos)).filter((n) => n.startsWith('.')), []);
});

test('zip slip (../x.lua, C:\\x.lua, /x.lua): error y nada escrito', async () => {
  for (const nombre of ['../x.lua', 'C:\\x.lua', '/x.lua']) {
    const datos = nuevaCarpeta();
    const zip = hacerZip([{ nombre: 'bien.lua', datos: 'x' }, { nombre, datos: 'malo' }]);
    const r = await guardarGuia({ url: 'https://ejemplo.com/guias.zip' }, { datos, obtener: falso(zip, 'application/zip') });
    assert.equal(r.error, 'zip_peligroso', nombre);
    assert.equal(r.detalle, ERRORES.es.zip_peligroso);
    assert.deepEqual(lista(guias(datos)), [], nombre);
    assert.ok(!existsSync(join(datos, 'x.lua')) && !existsSync(join(datos, '..', 'x.lua')));
  }
});

test('topes: la descarga (por la red de verdad), lo descomprimido por archivo y en total, y el número de archivos', async () => {
  const datos = nuevaCarpeta();
  const descarga = await guardarGuia({ url: 'https://guias.ejemplo.com/grande.zip' }, { datos, obtener: red, topes: { ...TOPES, descarga: 4000 } });
  assert.equal(descarga.error, 'tamano');
  const muchos = hacerZip(Array.from({ length: 11 }, (_, i) => ({ nombre: `g${i}.txt`, datos: 'x' })));
  const r1 = await guardarGuia({ url: 'https://ejemplo.com/a.zip' }, { datos, obtener: falso(muchos), topes: { ...TOPES, archivos: 10 } });
  assert.equal(r1.error, 'demasiados_archivos');
  const grande = hacerZip([{ nombre: 'g.txt', datos: 'x'.repeat(3000) }, { nombre: 'h.txt', datos: 'y'.repeat(3000) }]);
  const r2 = await guardarGuia({ url: 'https://ejemplo.com/b.zip' }, { datos, obtener: falso(grande), topes: { ...TOPES, porArchivo: 2000 } });
  assert.equal(r2.error, 'tamano');
  const r3 = await guardarGuia({ url: 'https://ejemplo.com/c.zip' }, { datos, obtener: falso(grande), topes: { ...TOPES, total: 5000 } });
  assert.equal(r3.error, 'tamano');
  // un archivo suelto también tiene su tope
  const r4 = await guardarGuia({ url: 'https://ejemplo.com/d.txt' }, { datos, obtener: falso('x'.repeat(3000), 'text/plain'), topes: { ...TOPES, porArchivo: 2000 } });
  assert.equal(r4.error, 'tamano');
  assert.deepEqual(lista(guias(datos)), []);
  assert.equal(TOPES.descarga, 50 * 1024 * 1024);
  assert.equal(TOPES.archivos, 2000);
});

test('file:, ftp:, IP privada y localhost: error sin llegar a la red', async () => {
  const datos = nuevaCarpeta();
  const obtener = falso('x');
  for (const [url, error] of [['file:///C:/Windows/win.ini', 'url'], ['ftp://ejemplo.com/g.zip', 'url'], ['http://192.168.1.10/g.zip', 'red_local'],
    ['https://127.0.0.1/g.zip', 'red_local'], ['http://localhost:8080/g.zip', 'red_local'], ['https://[::1]/g.zip', 'red_local'],
    ['https://router.local/g.zip', 'red_local'], ['no es una url', 'url'], ['', 'argumentos']]) {
    const r = await guardarGuia({ url }, { datos, obtener });
    assert.equal(r.error, error, url);
    assert.equal(typeof r.detalle, 'string');
  }
  assert.deepEqual(await guardarGuia({}, { datos, obtener }), { error: 'argumentos', detalle: ERRORES.es.argumentos });
  assert.equal(obtener.llamadas.length, 0);
});

test('una redirección a una IP privada da red_local (comprobada por obtenerPagina en cada salto)', async () => {
  const datos = nuevaCarpeta();
  const r = await guardarGuia({ url: 'https://guias.ejemplo.com/a-casa.zip' }, { datos, obtener: red });
  assert.equal(r.error, 'red_local');
  assert.deepEqual(lista(guias(datos)), []);
});

test('bloqueada: un 403, o HTML (página de espera) en vez del zip o del archivo; con un detalle fijo que dice qué hacer', async () => {
  const datos = nuevaCarpeta();
  const r403 = await guardarGuia({ url: 'https://guias.ejemplo.com/prohibido.zip' }, { datos, obtener: red });
  assert.deepEqual(r403, { error: 'bloqueada', detalle: ERRORES.es.bloqueada });
  assert.match(ERRORES.es.bloqueada, /carpeta de guías/);
  for (const url of ['https://www.curseforge.com/wow/addons/polestar/download/123456', 'https://ejemplo.com/guias.zip', 'https://ejemplo.com/guia.lua']) {
    const r = await guardarGuia({ url }, { datos, obtener: falso('<!DOCTYPE html><html><body>Tu descarga empieza en 5 s…</body></html>', 'text/html') });
    assert.deepEqual(r, { error: 'bloqueada', detalle: ERRORES.es.bloqueada }, url);
  }
  for (const estado of [401, 429]) {
    assert.equal((await guardarGuia({ url: 'https://ejemplo.com/g.zip' }, { datos, obtener: fallaRed('estado', { estado }) })).error, 'bloqueada');
  }
  assert.equal((await guardarGuia({ url: 'https://ejemplo.com/g.zip' }, { datos, obtener: fallaRed('estado', { estado: 404 }) })).error, 'estado');
  assert.deepEqual(lista(guias(datos)), []);
  // en inglés si el turno es en inglés, y nunca una ruta del PC
  const en = await guardarGuia({ url: 'https://guias.ejemplo.com/prohibido.zip' }, { datos, obtener: red, idioma: 'en' });
  assert.equal(en.detalle, ERRORES.en.bloqueada);
  for (const textos of [ERRORES.es, ERRORES.en]) {
    for (const t of Object.values(textos)) assert.doesNotMatch(t, /[A-Za-z]:\\|\\\\|AppData|LOCALAPPDATA/, t);
  }
  assert.deepEqual(Object.keys(ERRORES.es).sort(), Object.keys(ERRORES.en).sort());
});

test('nombre: sin barras, sin «..», sin nombres reservados de Windows y corto; si falta, sale de la url', async () => {
  assert.equal(nombreSeguro('../../fuera'), 'fuera');
  assert.equal(nombreSeguro('a/b\\c'), 'a b c');
  assert.equal(nombreSeguro('..'), 'guia');
  assert.equal(nombreSeguro('CON'), 'guia-CON');
  assert.equal(nombreSeguro('nul.txt'), 'guia-nul.txt');
  assert.equal(nombreSeguro('  .oculta. '), 'oculta');
  assert.equal(nombreSeguro('dos:puntos*y?<>|"'), 'dos puntos y');
  assert.equal(nombreSeguro('x'.repeat(200)).length, 60);
  assert.equal(nombreSeguro(''), 'guia');
  const datos = nuevaCarpeta();
  const r = await guardarGuia({ url: 'https://ejemplo.com/g.txt', nombre: '../../fuera' }, { datos, obtener: falso(TXT, 'text/plain') });
  assert.equal(r.guardado.carpeta, 'fuera');
  assert.ok(existsSync(join(guias(datos), 'fuera', 'g.txt')));
  assert.ok(!existsSync(join(datos, 'fuera')) && !existsSync(join(datos, '..', 'fuera')));
  const c = await guardarGuia({ url: 'https://ejemplo.com/g.txt', nombre: 'CON' }, { datos, obtener: falso(TXT, 'text/plain') });
  assert.equal(c.guardado.carpeta, 'guia-CON');
  // de la url: el último trozo con sentido (no «main», «download» ni números)
  const p = await guardarGuia({ url: 'https://ejemplo.com/wow/addons/polestar/download/123456' }, { datos, obtener: falso(hacerZip([{ nombre: 'a.txt', datos: TXT }]), 'application/zip') });
  assert.equal(p.guardado.carpeta, 'polestar');
});

test('carpeta existente: no se pisa (nombre-2, nombre-3…), y las de la biblioteca (enlaces, Mis guías, Del addon) tampoco', async () => {
  const datos = nuevaCarpeta();
  mkdirSync(join(guias(datos), 'Baldios'), { recursive: true });
  writeFileSync(join(guias(datos), 'Baldios', 'mia.txt'), 'la del jugador');
  const a = await guardarGuia({ url: 'https://ejemplo.com/Baldios.txt' }, { datos, obtener: falso(TXT, 'text/plain') });
  const b = await guardarGuia({ url: 'https://ejemplo.com/Baldios.txt' }, { datos, obtener: falso(TXT, 'text/plain') });
  assert.equal(a.guardado.carpeta, 'Baldios-2');
  assert.equal(b.guardado.carpeta, 'Baldios-3');
  assert.deepEqual(lista(join(guias(datos), 'Baldios')), ['mia.txt']);
  assert.equal(readFileSync(join(guias(datos), 'Baldios', 'mia.txt'), 'utf8'), 'la del jugador');
  for (const nombre of ['enlaces', 'Mis guías', 'del addon']) {
    const r = await guardarGuia({ url: 'https://ejemplo.com/g.txt', nombre }, { datos, obtener: falso(TXT, 'text/plain') });
    assert.equal(r.guardado.carpeta, `${nombre}-2`, nombre);
  }
});

test('si falla a medias, nada queda en guias\\: la temporal va a la cuarentena (no se borra)', async () => {
  const datos = nuevaCarpeta();
  let escritos = 0;
  const fsRoto = { ...fs, writeFileSync: (...a) => { if (++escritos === 2) throw Object.assign(new Error('disco lleno'), { code: 'ENOSPC' }); return fs.writeFileSync(...a); } };
  const zip = hacerZip([{ nombre: 'a.txt', datos: TXT }, { nombre: 'b.txt', datos: TXT }]);
  const r = await guardarGuia({ url: 'https://ejemplo.com/guias.zip' }, { datos, fs: fsRoto, obtener: falso(zip, 'application/zip') });
  assert.equal(r.error, 'escritura');
  assert.deepEqual(lista(guias(datos)), []);
  const cuarentena = join(datos, 'cuarentena');
  const apartadas = lista(cuarentena).flatMap((s) => lista(join(cuarentena, s)));
  assert.equal(apartadas.length, 1);
  assert.match(apartadas[0], /^\.guardando-/);
});

test('lo bajado es solo dato: guardar.mjs y zip.mjs no cargan ni ejecutan nada', () => {
  for (const nombre of ['guardar.mjs', 'zip.mjs']) {
    const texto = readFileSync(new URL(`../src/biblioteca/${nombre}`, import.meta.url), 'utf8');
    for (const malo of [/\bimport\s*\(/, /\brequire\s*\(/, /\beval\s*\(/, /new\s+Function\b/, /child_process/, /node:vm/, /\bspawn\b|\bexecFile\b/, /chmod/]) {
      assert.doesNotMatch(texto, malo, `${nombre}: ${malo}`);
    }
  }
});

// ---------- GitHub por sus enlaces oficiales ----------

test('GitHub «blob»: se pide su enlace oficial raw (raw.githubusercontent.com) y se guarda como archivo', async () => {
  const datos = nuevaCarpeta();
  const obtener = falso(TXT, 'text/plain');
  const r = await guardarGuia({ url: 'https://github.com/autor/GuiasBaldios/blob/main/guias/Baldios_Horda.txt' }, { datos, obtener });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(obtener.llamadas.map((l) => l.url), ['https://raw.githubusercontent.com/autor/GuiasBaldios/main/guias/Baldios_Horda.txt']);
  assert.deepEqual(r.guardado, { tipo: 'archivo', carpeta: 'Baldios_Horda', archivos: ['Baldios_Horda/Baldios_Horda.txt'] });
  assert.equal(readFileSync(join(guias(datos), 'Baldios_Horda', 'Baldios_Horda.txt'), 'utf8'), TXT);
  // la vista HTML de GitHub ya no da «bloqueada»: nunca se pide
  assert.equal(obtener.llamadas.length, 1);
});

test('GitHub repo o «tree»: se pide su zip oficial (archive/<ref>.zip, HEAD.zip sin ref)', async () => {
  const datos = nuevaCarpeta();
  const zip = hacerZip([{ nombre: 'GuiasBaldios-HEAD/LEEME.md', datos: '# hola' }, { nombre: 'GuiasBaldios-HEAD/baldios.txt', datos: TXT }]);
  for (const [url, pedida] of [
    ['https://github.com/autor/GuiasBaldios', 'https://github.com/autor/GuiasBaldios/archive/HEAD.zip'],
    ['https://github.com/autor/GuiasBaldios/', 'https://github.com/autor/GuiasBaldios/archive/HEAD.zip'],
    ['https://github.com/autor/GuiasBaldios.git', 'https://github.com/autor/GuiasBaldios/archive/HEAD.zip'],
    ['http://www.github.com/autor/GuiasBaldios/tree/v2', 'https://github.com/autor/GuiasBaldios/archive/v2.zip'],
  ]) {
    const obtener = falso(zip, 'application/zip');
    const r = await guardarGuia({ url }, { datos, obtener });
    assert.equal(r.ok, true, `${url}: ${JSON.stringify(r)}`);
    assert.deepEqual(obtener.llamadas.map((l) => l.url), [pedida], url);
    assert.equal(r.guardado.tipo, 'zip');
    assert.match(r.guardado.carpeta, /^GuiasBaldios(-\d+)?$/, url);
  }
  // otras páginas de GitHub siguen siendo páginas
  const otra = falso(HTML, 'text/html');
  const p = await guardarGuia({ url: 'https://github.com/autor/GuiasBaldios/issues/3' }, { datos, obtener: otra });
  assert.equal(p.guardado.tipo, 'pagina');
  assert.deepEqual(otra.llamadas.map((l) => l.url), ['https://github.com/autor/GuiasBaldios/issues/3']);
});

test('GitHub «tree» con subcarpeta: del zip oficial solo se queda esa subcarpeta (con las mismas comprobaciones)', async () => {
  const datos = nuevaCarpeta();
  const zip = hacerZip([
    { nombre: 'GuiasBaldios-main/LEEME.md', datos: '# fuera' },
    { nombre: 'GuiasBaldios-main/Guias/Horda/baldios.txt', datos: TXT },
    { nombre: 'GuiasBaldios-main/Guias/Horda/extra/mas.lua', datos: 'SNF = {}' },
    { nombre: 'GuiasBaldios-main/Guias/Alianza/elwynn.txt', datos: TXT },
    { nombre: 'GuiasBaldios-main/Guias/HordaVieja/x.txt', datos: TXT },
  ]);
  const obtener = falso(zip, 'application/zip');
  const r = await guardarGuia({ url: 'https://github.com/autor/GuiasBaldios/tree/main/Guias/Horda' }, { datos, obtener });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(obtener.llamadas.map((l) => l.url), ['https://github.com/autor/GuiasBaldios/archive/main.zip']);
  assert.equal(r.guardado.carpeta, 'Horda');
  assert.deepEqual([...r.guardado.archivos].sort(), ['Horda/baldios.txt', 'Horda/extra/mas.lua']);
  assert.deepEqual(lista(join(guias(datos), 'Horda')), ['baldios.txt', 'extra']);
  // una subcarpeta que no está: sin_guias; un zip slip en cualquier parte del zip: zip_peligroso
  const nada = await guardarGuia({ url: 'https://github.com/autor/GuiasBaldios/tree/main/NoEsta' }, { datos, obtener });
  assert.equal(nada.error, 'sin_guias');
  const malo = hacerZip([{ nombre: 'G-main/Guias/Horda/a.txt', datos: TXT }, { nombre: '../x.txt', datos: 'malo' }]);
  const r2 = await guardarGuia({ url: 'https://github.com/autor/G/tree/main/Guias/Horda' }, { datos, obtener: falso(malo, 'application/zip') });
  assert.equal(r2.error, 'zip_peligroso');
});

// ---------- la respuesta no espera al índice ----------

test('con un índice lento contesta en cuanto la guía está guardada («el índice la leerá en unos segundos») y reindexa por detrás', async () => {
  const datos = nuevaCarpeta();
  let acabado = false;
  let soltar;
  const terminado = new Promise((r) => { soltar = r; });
  const reindexar = () => new Promise((r) => setTimeout(() => { acabado = true; soltar(); r({ guias: [{ archivo: 'Lenta/Lenta.txt' }] }); }, 300));
  const t0 = Date.now();
  const r = await guardarGuia({ url: 'https://ejemplo.com/Lenta.txt' }, { datos, obtener: falso(TXT, 'text/plain'), reindexar, esperaIndice: 30 });
  assert.ok(Date.now() - t0 < 250, 'no esperó al índice');
  assert.equal(r.ok, true);
  assert.equal(r.guiasNuevas, null);
  assert.equal(r.mensaje, MENSAJES.es.pendiente);
  assert.match(MENSAJES.es.pendiente, /^Guardada; el índice la leerá en unos segundos/);
  assert.equal(acabado, false);
  await terminado;
  assert.equal(acabado, true, 'la reindexación sigue por detrás');
  // si acaba dentro del plazo, también cuántas leyó
  const rapido = await guardarGuia({ url: 'https://ejemplo.com/Rapida.txt' }, { datos, obtener: falso(TXT, 'text/plain'), reindexar: async () => ({ guias: [{ archivo: 'Rapida/Rapida.txt' }] }) });
  assert.equal(rapido.guiasNuevas, 1);
  assert.equal(rapido.mensaje, MENSAJES.es.leida);
  const en = await guardarGuia({ url: 'https://ejemplo.com/Otra.txt' }, { datos, obtener: falso(TXT, 'text/plain'), idioma: 'en' });
  assert.equal(en.mensaje, MENSAJES.en.pendiente);
  // un fallo del índice por detrás no tumba nada
  const roto = await guardarGuia({ url: 'https://ejemplo.com/Rota.txt' }, { datos, obtener: falso(TXT, 'text/plain'), reindexar: async () => { throw new Error('roto'); } });
  assert.equal(roto.ok, true);
  assert.equal(roto.guiasNuevas, null);
  assert.equal(ESPERA_INDICE_MS, 5000);
});
