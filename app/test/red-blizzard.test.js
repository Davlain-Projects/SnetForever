// La segunda puerta de red (enviar, en actualizar/red.mjs): solo https y solo a los sitios de Blizzard, con transporte falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { enviar, obtener, ErrorRed } from '../src/actualizar/red.mjs';
import { HOSTS_BLIZZARD, HOSTS } from '../src/actualizar/origen.mjs';

// Un transporte falso: apunta lo que recibe y contesta con `respuesta` ({estado, cabeceras, trozos}).
function falso(respuesta) {
  const visto = { llamadas: 0 };
  const transporte = (url, opciones, cb) => {
    visto.llamadas += 1;
    visto.url = url;
    visto.opciones = opciones;
    const peticion = new EventEmitter();
    peticion.destroy = () => { visto.destruida = true; };
    peticion.end = (cuerpo) => {
      visto.cuerpo = cuerpo;
      const res = Readable.from(respuesta.trozos ?? []);
      res.statusCode = respuesta.estado ?? 200;
      res.headers = respuesta.cabeceras ?? {};
      res.complete = true;
      cb(res);
    };
    return peticion;
  };
  return { transporte, visto };
}

test('los sitios de Blizzard son los cinco de la regla R5 y no se mezclan con los de GitHub', () => {
  assert.deepEqual([...HOSTS_BLIZZARD], ['oauth.battle.net', 'us.api.blizzard.com', 'eu.api.blizzard.com', 'kr.api.blizzard.com', 'tw.api.blizzard.com']);
  for (const h of HOSTS_BLIZZARD) assert.ok(!HOSTS.includes(h));
});

test('POST a oauth.battle.net: el transporte recibe método, cabeceras y cuerpo, y la respuesta llega entera', async () => {
  const { transporte, visto } = falso({ estado: 200, cabeceras: { 'content-type': 'application/json' }, trozos: [Buffer.from('{"a":'), Buffer.from('1}')] });
  const r = await enviar('https://oauth.battle.net/token', {
    metodo: 'POST', cabeceras: { Authorization: 'Basic eHg=', 'Content-Type': 'application/x-www-form-urlencoded' },
    cuerpo: 'grant_type=client_credentials', maxBytes: 1000, transporte, version: '0.6.0',
  });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.toString(), '{"a":1}');
  assert.equal(r.cabeceras['content-type'], 'application/json');
  assert.equal(visto.url, 'https://oauth.battle.net/token');
  assert.equal(visto.opciones.method, 'POST');
  assert.equal(visto.opciones.headers.Authorization, 'Basic eHg=');
  assert.equal(visto.opciones.headers['User-Agent'], 'SnetForever/0.6.0');
  assert.equal(visto.opciones.headers['Content-Length'], String('grant_type=client_credentials'.length));
  assert.equal(visto.cuerpo, 'grant_type=client_credentials');
});

test('GET a una API de región con Authorization pasa, y el User-Agent no se puede cambiar', async () => {
  const { transporte, visto } = falso({ estado: 200, trozos: [Buffer.from('ok')] });
  const r = await enviar('https://eu.api.blizzard.com/data/wow/auctions', {
    cabeceras: { Authorization: 'Bearer t', 'User-Agent': 'otro' }, maxBytes: 10, transporte,
  });
  assert.equal(r.cuerpo.toString(), 'ok');
  assert.match(visto.opciones.headers['User-Agent'], /^SnetForever\/\d/);
  assert.equal(visto.opciones.method, 'GET');
});

test('a un sitio que no es de Blizzard (GitHub, otro) con Authorization falla con HOST, sin conectar', async () => {
  for (const url of ['https://github.com/x/y', 'https://evil.example/token', 'https://oauth.battle.net.evil.example/token',
    'https://us.api.blizzard.com:8443/x', 'https://u:p@oauth.battle.net/token']) {
    const { transporte, visto } = falso({});
    await assert.rejects(enviar(url, { cabeceras: { Authorization: 'Bearer t' }, maxBytes: 10, transporte }),
      (e) => e instanceof ErrorRed && e.code === 'HOST', url);
    assert.equal(visto.llamadas, 0, url);
  }
});

test('http (sin cifrar) falla con ESQUEMA, sin conectar', async () => {
  const { transporte, visto } = falso({});
  await assert.rejects(enviar('http://us.api.blizzard.com/x', { maxBytes: 10, transporte }), (e) => e instanceof ErrorRed && e.code === 'ESQUEMA');
  await assert.rejects(enviar('no es una url', { maxBytes: 10, transporte }), (e) => e.code === 'ESQUEMA');
  assert.equal(visto.llamadas, 0);
});

test('un 304 devuelve {estado: 304} con el cuerpo vacío', async () => {
  const { transporte } = falso({ estado: 304, cabeceras: { 'last-modified': 'x' } });
  const r = await enviar('https://us.api.blizzard.com/x', { cabeceras: { 'If-Modified-Since': 'x' }, maxBytes: 10, transporte });
  assert.equal(r.estado, 304);
  assert.equal(r.cuerpo.length, 0);
});

test('un 401 y un 3xx se devuelven tal cual (no se siguen redirecciones)', async () => {
  const a = falso({ estado: 401, trozos: [Buffer.from('no')] });
  assert.equal((await enviar('https://us.api.blizzard.com/x', { maxBytes: 10, transporte: a.transporte })).estado, 401);
  const b = falso({ estado: 302, cabeceras: { location: 'https://evil.example/' }, trozos: [] });
  const r = await enviar('https://us.api.blizzard.com/x', { maxBytes: 10, transporte: b.transporte });
  assert.equal(r.estado, 302);
  assert.equal(b.visto.llamadas, 1);
});

test('una respuesta mayor que maxBytes falla con GRANDE (anunciada o al leerla)', async () => {
  const a = falso({ estado: 200, cabeceras: { 'content-length': '100' }, trozos: [Buffer.alloc(100)] });
  await assert.rejects(enviar('https://us.api.blizzard.com/x', { maxBytes: 10, transporte: a.transporte }), (e) => e.code === 'GRANDE');
  const b = falso({ estado: 200, trozos: [Buffer.alloc(6), Buffer.alloc(6)] });
  await assert.rejects(enviar('https://us.api.blizzard.com/x', { maxBytes: 10, transporte: b.transporte }), (e) => e.code === 'GRANDE');
});

test('un fallo del transporte o de la conexión es CONEXION, y el reloj es TIEMPO', async () => {
  const roto = () => { throw new Error('boom'); };
  await assert.rejects(enviar('https://us.api.blizzard.com/x', { maxBytes: 10, transporte: roto }), (e) => e.code === 'CONEXION');
  const caido = () => {
    const p = new EventEmitter();
    p.destroy = () => {};
    p.end = () => setImmediate(() => p.emit('error', new Error('reset')));
    return p;
  };
  await assert.rejects(enviar('https://us.api.blizzard.com/x', { maxBytes: 10, transporte: caido }), (e) => e.code === 'CONEXION');
  const mudo = () => { const p = new EventEmitter(); p.destroy = () => {}; p.end = () => {}; return p; };
  await assert.rejects(enviar('https://us.api.blizzard.com/x', { maxBytes: 10, tiempoMax: 20, transporte: mudo }), (e) => e.code === 'TIEMPO');
});

test('opciones raras: TypeError sin conectar', async () => {
  const { transporte, visto } = falso({});
  const u = 'https://us.api.blizzard.com/x';
  await assert.rejects(enviar(u, { metodo: 'PUT', maxBytes: 10, transporte }), TypeError);
  await assert.rejects(enviar(u, { maxBytes: -1, transporte }), TypeError);
  await assert.rejects(enviar(u, { maxBytes: 10, tiempoMax: 0, transporte }), TypeError);
  await assert.rejects(enviar(u, { maxBytes: 10, cuerpo: 'x', transporte }), TypeError);
  await assert.rejects(enviar(u, { metodo: 'POST', cuerpo: 5, maxBytes: 10, transporte }), TypeError);
  assert.equal(visto.llamadas, 0);
});

test('enviar no deja cambiar Host, Content-Length ni Transfer-Encoding (sin distinguir mayúsculas)', async () => {
  const { transporte, visto } = falso({});
  for (const nombre of ['Host', 'host', 'Content-Length', 'CONTENT-LENGTH', 'Transfer-Encoding', 'transfer-encoding']) {
    await assert.rejects(enviar('https://us.api.blizzard.com/x', { cabeceras: { [nombre]: '1' }, maxBytes: 10, transporte }), TypeError, nombre);
  }
  assert.equal(visto.llamadas, 0);
});

test('un segundo envío con cuerpo pone él mismo el Content-Length (en bytes, no en letras)', async () => {
  const { transporte, visto } = falso({ trozos: [] });
  await enviar('https://oauth.battle.net/token', { metodo: 'POST', cuerpo: 'ñ', maxBytes: 10, transporte });
  assert.equal(visto.opciones.headers['Content-Length'], '2');
});

test('obtener (GitHub) sigue siendo siempre GET: sin method, sin cuerpo, sin Authorization y sin llamar a write ni a end', async () => {
  const visto = { destinos: [], opciones: [], write: 0, end: 0 };
  const transporte = (url, opciones, cb) => {
    visto.destinos.push(url);
    visto.opciones.push(opciones);
    const p = new EventEmitter();
    p.write = () => { visto.write += 1; };
    p.end = () => { visto.end += 1; };
    p.destroy = () => {};
    setImmediate(() => {
      const res = Readable.from([Buffer.from('ok')]);
      res.statusCode = 200;
      res.headers = {};
      res.complete = true;
      cb(res);
    });
    return p;
  };
  const r = await obtener('https://github.com/x/y', { maxBytes: 10, transporte });
  assert.equal(r.toString(), 'ok');
  assert.deepEqual(visto.destinos, ['https://github.com/x/y']);
  const o = visto.opciones[0];
  assert.ok(o.method === undefined || o.method === 'GET');
  assert.deepEqual(Object.keys(o.headers).sort(), ['Accept', 'User-Agent']);
  assert.equal(visto.write, 0);
  assert.equal(visto.end, 0);
  // y no va a Blizzard
  await assert.rejects(obtener('https://oauth.battle.net/token', { maxBytes: 10, transporte }), (e) => e.code === 'url');
});
