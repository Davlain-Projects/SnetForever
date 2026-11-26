// Cliente de la API de Blizzard para Forever, con `enviar` falso: nunca toca la red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteBlizzard } from '../src/comercio/blizzard.mjs';

const json = (o) => Buffer.from(JSON.stringify(o));
const ok = (cuerpo, cabeceras = {}) => ({ estado: 200, cabeceras, cuerpo: json(cuerpo) });
const sin = (estado, cabeceras = {}) => ({ estado, cabeceras, cuerpo: Buffer.alloc(0) });
const TOKEN = { access_token: 'tok-1', token_type: 'bearer', expires_in: 86399 };

// Un `enviar` falso que contesta con lo que dice `responder(url, opciones, n)` y apunta las llamadas.
function falso(responder) {
  const llamadas = [];
  const enviar = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), ...opciones });
    return responder(String(url), opciones, llamadas.length);
  };
  return { enviar, llamadas };
}
const esToken = (url) => url.includes('/token');
function crear(responder, extra = {}) {
  const f = falso(responder);
  let ahora = 1_000_000;
  const reloj = () => ahora;
  const cliente = crearClienteBlizzard({
    region: 'us', locale: 'es_MX', credenciales: async () => ({ id: 'IDX', secreto: 'SECRETOX' }), enviar: f.enviar, reloj, ...extra,
  });
  return { cliente, ...f, avanzar: (ms) => { ahora += ms; } };
}

test('subastas: pide token, luego la casa con Bearer, y pasa time_left tal cual; precio por unidad', async () => {
  const { cliente, llamadas } = crear((url) => esToken(url) ? ok(TOKEN) : ok({ auctions: [
    { id: 1, item: { id: 2589 }, buyout: 1000, quantity: 20, time_left: 'SHORT' },
    { id: 2, item: { id: 2592 }, buyout: 500, quantity: 1, time_left: 'MEDIUM' },
    { id: 3, item: { id: 3 }, bid: 99, quantity: 1, time_left: 'LONG' },
    { id: 4, item: { id: 4 }, buyout: 7, quantity: 1, time_left: 'VERY_LONG' },
  ] }, { 'last-modified': 'Fri, 13 Nov 2026 14:22:37 GMT' }));
  const r = await cliente.subastas(110, {});
  assert.equal(r.estado, 'nueva');
  assert.equal(r.hora, 'Fri, 13 Nov 2026 14:22:37 GMT');
  assert.deepEqual(r.subastas.map((s) => s.tiempo), ['SHORT', 'MEDIUM', 'VERY_LONG']);
  assert.deepEqual(r.subastas[0], { id: 1, item: 2589, cantidad: 20, precio: 50, tiempo: 'SHORT' });
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[0].metodo, 'POST');
  assert.match(llamadas[0].url, /^https:\/\/oauth\.[^/]+\/token$/);
  assert.match(llamadas[0].cuerpo, /grant_type=client_credentials/);
  assert.equal(llamadas[0].cabeceras.Authorization, `Basic ${Buffer.from('IDX:SECRETOX').toString('base64')}`);
  assert.match(llamadas[1].url, /^https:\/\/us\.api\.[^/]+\/data\/wow\/ruleset\/2\/auctions\/110\?/);
  assert.match(llamadas[1].url, /namespace=dynamic-forever-us/);
  assert.match(llamadas[1].url, /locale=es_MX/);
  assert.equal(llamadas[1].cabeceras.Authorization, 'Bearer tok-1');
  assert.ok(llamadas[1].maxBytes >= 32 * 1024 * 1024);
});

test('subastas con desde: manda If-Modified-Since y un 304 es igual; el token se reutiliza', async () => {
  let n = 0;
  const { cliente, llamadas } = crear((url) => {
    if (esToken(url)) return ok(TOKEN);
    n += 1;
    return n === 1 ? ok({ auctions: [] }, { 'last-modified': 'H1' }) : sin(304);
  });
  await cliente.subastas(110, {});
  const r = await cliente.subastas(110, { desde: 'H1' });
  assert.deepEqual(r, { estado: 'igual' });
  assert.equal(llamadas.at(-1).cabeceras['If-Modified-Since'], 'H1');
  assert.equal(llamadas.filter((l) => esToken(l.url)).length, 1, 'un solo token');
});

test('el token caduca en expires_in menos 60 s y se pide otro', async () => {
  const { cliente, llamadas, avanzar } = crear((url) => esToken(url) ? ok({ ...TOKEN, expires_in: 1000 }) : ok({ auctions: [] }));
  await cliente.subastas(110, {});
  avanzar(900_000);
  await cliente.subastas(110, {});
  assert.equal(llamadas.filter((l) => esToken(l.url)).length, 1);
  avanzar(50_000); // 950 s: dentro de los últimos 60 s
  await cliente.subastas(110, {});
  assert.equal(llamadas.filter((l) => esToken(l.url)).length, 2);
});

test('mercancías: precio es unit_price', async () => {
  const { cliente, llamadas } = crear((url) => esToken(url) ? ok(TOKEN) : ok({ auctions: [
    { id: 9, item: { id: 2589 }, quantity: 200, unit_price: 13, time_left: 'LONG' },
  ] }, { 'last-modified': 'H' }));
  const r = await cliente.mercancias(114, {});
  assert.deepEqual(r.subastas, [{ id: 9, item: 2589, cantidad: 200, precio: 13, tiempo: 'LONG' }]);
  assert.match(llamadas[1].url, /\/auctions\/114\/commodities\?/);
});

test('un 401 borra el token y reintenta una vez', async () => {
  let api = 0;
  let tokens = 0;
  const { cliente } = crear((url) => {
    if (esToken(url)) { tokens += 1; return ok({ ...TOKEN, access_token: `t${tokens}` }); }
    api += 1;
    return api === 1 ? sin(401) : ok({ auctions: [] }, { 'last-modified': 'H' });
  });
  const r = await cliente.subastas(110, {});
  assert.equal(r.estado, 'nueva');
  assert.equal(tokens, 2);
});

test('dos 401 seguidos: sin_credenciales, y antes de 1 h no toca la red; pasada 1 h vuelve a probar', async () => {
  const { cliente, llamadas, avanzar } = crear((url) => esToken(url) ? ok(TOKEN) : sin(401));
  assert.equal((await cliente.subastas(110, {})).estado, 'sin_credenciales');
  const n = llamadas.length;
  assert.equal((await cliente.subastas(110, {})).estado, 'sin_credenciales');
  assert.equal((await cliente.mercancias(110, {})).estado, 'sin_credenciales');
  await assert.rejects(cliente.objeto(1), { code: 'SIN_CREDENCIALES' });
  assert.equal(llamadas.length, n, 'no toca la red');
  avanzar(3_600_001);
  await cliente.subastas(110, {});
  assert.ok(llamadas.length > n);
});

test('credenciales malas al pedir el token (401 del token): sin_credenciales y espera 1 h', async () => {
  const { cliente, llamadas } = crear((url) => esToken(url) ? sin(401) : ok({}));
  assert.equal((await cliente.subastas(110, {})).estado, 'sin_credenciales');
  const n = llamadas.length;
  await cliente.subastas(110, {});
  assert.equal(llamadas.length, n);
});

test('credenciales null: sin_credenciales sin red', async () => {
  const f = falso(() => { throw new Error('no debe tocar la red'); });
  const cliente = crearClienteBlizzard({ region: 'us', locale: 'es_MX', credenciales: async () => null, enviar: f.enviar });
  assert.equal((await cliente.subastas(110, {})).estado, 'sin_credenciales');
  assert.equal((await cliente.mercancias(110, {})).estado, 'sin_credenciales');
  await assert.rejects(cliente.objeto(2589), { code: 'SIN_CREDENCIALES' });
  await assert.rejects(cliente.mision(1), { code: 'SIN_CREDENCIALES' });
  assert.equal(f.llamadas.length, 0);
});

// Visto el 14-nov en la casa 115 de Forever (US): una casa vacía responde 200 con su ficha y sin `auctions`
// (objetos: {_links, id, name, commodities, ruleset}; mercancías: {_links}). Es una foto válida sin subastas, no un error:
// si no, descubrir la casa del personaje fallaba siempre en esa casa.
test('una casa vacía (200 con _links y sin auctions) es una foto nueva sin subastas, en objetos y en mercancías', async () => {
  const vacia = (url) => (/commodities/.test(url) ? { _links: { self: { href: 'x' } } }
    : { _links: { self: { href: 'x' } }, id: 115, name: 'Casa', commodities: { href: 'y' }, ruleset: { id: 2 } });
  const { cliente } = crear((url) => esToken(url) ? ok(TOKEN) : ok(vacia(url), { 'last-modified': 'H1' }));
  assert.deepEqual(await cliente.subastas(115, {}), { estado: 'nueva', hora: 'H1', subastas: [] });
  assert.deepEqual(await cliente.mercancias(115, {}), { estado: 'nueva', hora: 'H1', subastas: [] });
  const raro = crear((url) => esToken(url) ? ok(TOKEN) : ok({ algo: 1 }));
  assert.equal((await raro.cliente.subastas(115, {})).estado, 'error', 'sin _links ni auctions sigue siendo un error');
});

test('errores de red, 5xx, 429, 404 y json roto dan estado error sin lanzar ni nombrar el secreto', async () => {
  const a = crear((url) => { if (esToken(url)) return ok(TOKEN); throw new Error('boom'); });
  const ra = await a.cliente.subastas(110, {});
  assert.equal(ra.estado, 'error');
  assert.ok(!JSON.stringify(ra).includes('SECRETOX'));
  for (const e of [500, 429, 404]) {
    const b = crear((url) => esToken(url) ? ok(TOKEN) : sin(e));
    assert.equal((await b.cliente.subastas(110, {})).estado, 'error', String(e));
  }
  const c = crear((url) => esToken(url) ? ok(TOKEN) : { estado: 200, cabeceras: {}, cuerpo: Buffer.from('no es json') });
  assert.equal((await c.cliente.subastas(110, {})).estado, 'error');
});

test('objeto: mapea la ficha; 404 es null; usa el espacio static', async () => {
  const { cliente, llamadas } = crear((url) => {
    if (esToken(url)) return ok(TOKEN);
    if (url.includes('/item/404')) return sin(404);
    return ok({ id: 2589, name: 'Paño de lino', quality: { type: 'COMMON', name: 'Común' }, item_class: { name: 'Comerciar' },
      item_subclass: { name: 'Tela' }, sell_price: 13 });
  });
  assert.deepEqual(await cliente.objeto(2589), {
    id: 2589, nombre: 'Paño de lino', calidad: 'COMMON', clase: 'Comerciar', subclase: 'Tela', precioVendedor: 13,
  });
  assert.match(llamadas[1].url, /\/data\/wow\/item\/2589\?namespace=static-forever-us&locale=es_MX/);
  assert.equal(await cliente.objeto(404), null);
});

test('misiones: índice de zonas, misiones de zona y misión; 404 es null', async () => {
  const { cliente, llamadas } = crear((url) => {
    if (esToken(url)) return ok(TOKEN);
    if (url.includes('/quest/999')) return sin(404);
    return ok({ ruta: url });
  });
  assert.ok(await cliente.indiceZonasMision());
  assert.ok(await cliente.misionesDeZona(400));
  assert.ok(await cliente.mision(25));
  assert.equal(await cliente.mision(999), null);
  const urls = llamadas.filter((l) => !esToken(l.url)).map((l) => l.url);
  assert.ok(urls[0].includes('/data/wow/quest/area/index?namespace=static-forever-us'));
  assert.ok(urls[1].includes('/data/wow/quest/area/400?'));
  assert.ok(urls[2].includes('/data/wow/quest/25?'));
});

test('región no permitida: lanza al crear', () => {
  assert.throws(() => crearClienteBlizzard({ region: 'xx', credenciales: async () => null, enviar: async () => ({}) }));
});

test('objeto: solo el 404 da null; 500, 429, red caída y JSON roto lanzan TEMPORAL sin secretos', async () => {
  for (const e of [500, 429, 503]) {
    const { cliente } = crear((url) => esToken(url) ? ok(TOKEN) : sin(e));
    await assert.rejects(cliente.objeto(1), (err) => err.code === 'TEMPORAL' && !/SECRETOX|IDX|tok-1/.test(err.message), String(e));
  }
  const red = crear((url) => { if (esToken(url)) return ok(TOKEN); throw new Error('boom SECRETOX'); });
  await assert.rejects(red.cliente.objeto(1), (err) => err.code === 'TEMPORAL' && !/SECRETOX/.test(err.message));
  const roto = crear((url) => esToken(url) ? ok(TOKEN) : { estado: 200, cabeceras: {}, cuerpo: Buffer.from('<html>') });
  await assert.rejects(roto.cliente.objeto(1), { code: 'TEMPORAL' });
  await assert.rejects(roto.cliente.mision(1), { code: 'TEMPORAL' });
  const n404 = crear((url) => esToken(url) ? ok(TOKEN) : sin(404));
  assert.equal(await n404.cliente.objeto(1), null);
});

test('la región oauth no vale como sitio de la API', () => {
  assert.throws(() => crearClienteBlizzard({ region: 'oauth', credenciales: async () => null, enviar: async () => ({}) }));
});

test('token sin expires_in válido: error, no se guarda un token de vida cero', async () => {
  for (const malo of [{ access_token: 'x' }, { access_token: 'x', expires_in: 'ya' }, { access_token: 'x', expires_in: 0 }]) {
    const { cliente, llamadas } = crear((url) => esToken(url) ? ok(malo) : ok({ auctions: [] }));
    assert.equal((await cliente.subastas(110, {})).estado, 'error');
    assert.ok(!llamadas.some((l) => !esToken(l.url)), 'no llega a pedir la casa');
  }
});
