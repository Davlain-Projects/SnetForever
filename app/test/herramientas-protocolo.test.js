// Protocolo MCP mínimo: JSON-RPC por líneas, sin disco ni procesos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidorMcp, VERSIONES_MCP } from '../src/herramientas/protocolo.mjs';

const eco = { nombre: 'eco', descripcion: 'Devuelve lo recibido.', esquema: { type: 'object', properties: {} },
  ejecutar: async (args) => ({ args }) };
const lista = '{"jsonrpc":"2.0","id":2,"method":"tools/list"}';
const llamada = (name, args) => JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } });
const crear = (extra = {}) => crearServidorMcp({ nombre: 'snetforever', version: '0.0.0', herramientas: [eco], ...extra });
const hablar = async (s, linea) => JSON.parse(await s.manejar(linea));

test('versiones, initialize, notificaciones, ping, lista y errores', async () => {
  assert.deepEqual(VERSIONES_MCP, ['2025-06-18', '2025-03-26', '2024-11-05']);
  const s = crear({ maxLlamadas: 2, maxTexto: 50 });
  const r = await hablar(s, '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}');
  assert.equal(r.id, 1);
  assert.equal(r.result.protocolVersion, '2024-11-05');
  assert.deepEqual(r.result.capabilities, { tools: { listChanged: false } });
  assert.deepEqual(r.result.serverInfo, { name: 'snetforever', version: '0.0.0' });
  const rara = await hablar(s, '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1999"}}');
  assert.equal(rara.result.protocolVersion, '2025-06-18');
  assert.equal(await s.manejar('{"jsonrpc":"2.0","method":"notifications/initialized"}'), null);
  assert.equal(await s.manejar('{"jsonrpc":"2.0","method":"lo-que-sea"}'), null);
  assert.deepEqual((await hablar(s, '{"jsonrpc":"2.0","id":5,"method":"ping"}')).result, {});
  const l = (await hablar(s, lista)).result.tools;
  assert.deepEqual(l.map((t) => t.name), ['eco']);
  assert.equal(l[0].description, 'Devuelve lo recibido.');
  assert.deepEqual(l[0].inputSchema, eco.esquema);
  assert.equal((await hablar(s, llamada('eco', { a: 1 }))).result.isError, false);
  assert.equal((await hablar(s, llamada('nada', {}))).result.isError, true);
  assert.match((await hablar(s, llamada('eco', {}))).result.content[0].text, /límite/);
  const otro = await hablar(s, '{"jsonrpc":"2.0","id":9,"method":"otro"}');
  assert.equal(otro.error.code, -32601);
  assert.equal(otro.id, 9);
  const roto = await hablar(s, '{no es json');
  assert.equal(roto.error.code, -32700);
  assert.equal(roto.id, null);
});

test('la respuesta de una llamada lleva el JSON de la herramienta', async () => {
  const r = await hablar(crear(), llamada('eco', { a: 1 }));
  assert.equal(r.id, 3);
  assert.equal(r.result.content[0].type, 'text');
  assert.deepEqual(JSON.parse(r.result.content[0].text), { args: { a: 1 } });
});

test('una herramienta que lanza da un error corto sin pila; a la IA solo le llega el código, nunca el mensaje', async () => {
  // Revisión final: el mensaje de un error puede llevar rutas o nombres de archivo (C:\Users\…\guia.txt): no sale.
  const malo = { nombre: 'malo', descripcion: 'x', esquema: {}, ejecutar: async () => { throw Object.assign(new Error('se rompió en C:\\Users\\x\\guia.txt'), { code: 'ENOENT' }); } };
  const r = await hablar(crear({ herramientas: [malo] }), llamada('malo', {}));
  assert.equal(r.result.isError, true);
  const t = r.result.content[0].text;
  assert.deepEqual(JSON.parse(t), { error: 'La herramienta falló (ENOENT).' });
  assert.doesNotMatch(t, /se rompió|guia\.txt|Users/);
  assert.doesNotMatch(t, /\bat \S+ \(|\.mjs|\.js:\d/);
  // Sin código (o con uno raro), un texto fijo.
  for (const e of [new Error('mensaje con datos'), 'una cadena', Object.assign(new Error('x'), { code: 'raro con espacios y más' })]) {
    const otro = { nombre: 'otro', descripcion: 'x', esquema: {}, ejecutar: async () => { throw e; } };
    const r2 = await hablar(crear({ herramientas: [otro] }), llamada('otro', {}));
    assert.deepEqual(JSON.parse(r2.result.content[0].text), { error: 'La herramienta falló.' });
  }
});

test('una salida larga se recorta y sigue siendo JSON válido con recortado: true', async () => {
  const largo = { nombre: 'largo', descripcion: 'x', esquema: {}, ejecutar: async () => ({ t: 'ñ"\n'.repeat(100) }) };
  const r = await hablar(crear({ herramientas: [largo], maxTexto: 80 }), llamada('largo', {}));
  const t = r.result.content[0].text;
  assert.ok(t.length <= 80);
  const j = JSON.parse(t);
  assert.equal(j.recortado, true);
  assert.equal(typeof j.texto, 'string');
  assert.equal(r.result.isError, false);
});

test('con instrucciones, initialize las lleva en `instructions`; sin ellas (o vacías), no lleva el campo', async () => {
  const ini = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}';
  const con = await hablar(crear({ instrucciones: 'Llama primero a eco.\n/ Call eco first.' }), ini);
  assert.equal(con.result.instructions, 'Llama primero a eco.\n/ Call eco first.');
  assert.deepEqual(con.result.serverInfo, { name: 'snetforever', version: '0.0.0' });
  for (const extra of [{}, { instrucciones: '' }, { instrucciones: 7 }]) {
    const sin = await hablar(crear(extra), ini);
    assert.ok(!('instructions' in sin.result), JSON.stringify(extra));
    assert.deepEqual(Object.keys(sin.result).sort(), ['capabilities', 'protocolVersion', 'serverInfo']);
  }
});
