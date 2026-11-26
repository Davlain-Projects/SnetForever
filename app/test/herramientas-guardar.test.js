// Servidor de herramientas: guardar_guia (meter una guía de internet en la biblioteca), en el catálogo y en el servidor de
// verdad. Sin red: las direcciones de estas pruebas se rechazan antes de llegar a ella.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearCatalogo } from '../src/herramientas/catalogo.mjs';
import { HERRAMIENTAS } from '../src/herramientas/config.mjs';
import { ERRORES } from '../src/biblioteca/guardar.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const herramienta = (fuentes) => crearCatalogo(fuentes).find((h) => h.nombre === 'guardar_guia');

test('guardar_guia está en el catálogo y en las que Claude tiene permitidas, con su descripción de 400 caracteres como mucho', () => {
  const h = herramienta({ turno: () => null, base: () => null, lector: {} });
  assert.ok(h, 'en el catálogo');
  assert.ok(HERRAMIENTAS.includes('guardar_guia'));
  assert.ok(Array.from(h.descripcion).length <= 400, `${Array.from(h.descripcion).length} caracteres`);
  assert.match(h.descripcion, /bloqueada/);
  assert.match(h.descripcion, /carpeta de guías/);
  assert.deepEqual(h.esquema.required, ['url']);
  assert.equal(h.esquema.properties.url.type, 'string');
  assert.equal(h.esquema.properties.nombre.type, 'string');
  assert.equal(h.esquema.additionalProperties, false);
});

test('guardar_guia le pasa a fuentes.guardarGuia los argumentos y el idioma del turno; sin ella, no_disponible', async () => {
  const vistos = [];
  const fuentes = {
    turno: () => ({ idioma: 'en' }), base: () => null, lector: {},
    guardarGuia: async (args, opciones) => { vistos.push({ args, opciones }); return { ok: true }; },
  };
  assert.deepEqual(await herramienta(fuentes).ejecutar({ url: 'https://ejemplo.com/g.zip', nombre: 'G' }), { ok: true });
  assert.deepEqual(vistos, [{ args: { url: 'https://ejemplo.com/g.zip', nombre: 'G' }, opciones: { idioma: 'en' } }]);
  const sin = await herramienta({ turno: () => null, base: () => null, lector: {} }).ejecutar({ url: 'https://ejemplo.com/g.zip' });
  assert.equal(sin.error, 'no_disponible');
  assert.equal(typeof sin.detalle, 'string');
});

test('el servidor de verdad ofrece guardar_guia y la ejecuta (una dirección de la red de casa: red_local, sin red ni nada escrito)', async () => {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const datos = mkdtempSync(join(process.env.SNF_DATOS, 'herr-guardar-'));
  const hijo = spawn(process.execPath, [join('src', 'herramientas', 'servidor.mjs'), '--datos', datos], { cwd: APP, stdio: ['pipe', 'pipe', 'pipe'] });
  let salida = '';
  let errores = '';
  hijo.stdout.on('data', (d) => { salida += d; });
  hijo.stderr.on('data', (d) => { errores += d; });
  const fin = new Promise((resolver) => hijo.on('close', resolver));
  hijo.stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n');
  hijo.stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
  hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'guardar_guia', arguments: { url: 'http://192.168.1.10/guias.zip' } } }) + '\n');
  hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'guardar_guia', arguments: { url: 'file:///C:/x.lua' } } }) + '\n');
  hijo.stdin.end();
  assert.equal(await fin, 0, errores);
  const lineas = salida.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  assert.ok(lineas[1].result.tools.some((t) => t.name === 'guardar_guia'));
  assert.deepEqual(JSON.parse(lineas[2].result.content[0].text), { error: 'red_local', detalle: ERRORES.es.red_local });
  assert.deepEqual(JSON.parse(lineas[3].result.content[0].text), { error: 'url', detalle: ERRORES.es.url });
  assert.deepEqual(readdirSync(datos), []);
});
