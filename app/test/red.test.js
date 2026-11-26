// Pruebas de app/src/actualizar/origen.mjs y app/src/actualizar/red.mjs (fase 5, tarea 6; R5, R6 y vigilancia 4): la
// única puerta de red de la app. Nunca se sale a internet: todo va a un servidor node:http en 127.0.0.1:0 creado aquí,
// con `permitirLocal: true` y `transporte: http.get` (los dos atajos que solo existen para las pruebas). Las URL que se
// rechazan se comprueban con un transporte que solo apunta si lo llaman.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { setTimeout as esperar } from 'node:timers/promises';
import { REPO_POR_DEFECTO, HOSTS, repoDe, crearOrigen } from '../src/actualizar/origen.mjs';
import { ErrorRed, obtener, obtenerPagina, urlDePagina, ipPrivada, MAX_PAGINA } from '../src/actualizar/red.mjs';
import { VERSION } from '../src/version.mjs';

const MiB = 1024 * 1024;
const OK = Buffer.from('hola desde el servidor falso: ñ\u0000ÿ');

let servidor;
let base;
const vistas = []; // cada petición que llega: {ruta, metodo, cabeceras, cuerpo}
const grande = { cerrado: false, escrito: false };
const trozos = { enviados: 0, cerrado: false };

function redirigir(res, codigo, lugar) {
  res.writeHead(codigo, lugar === undefined ? {} : { Location: lugar });
  res.end();
}

function atender(req, res) {
  const partes = [];
  req.on('data', (t) => partes.push(t));
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://127.0.0.1').pathname;
    vistas.push({ ruta, metodo: req.method, cabeceras: req.headers, cuerpo: Buffer.concat(partes) });
    let m;
    if (ruta === '/ok') {
      res.writeHead(200, { 'Content-Length': OK.length });
      res.end(OK);
    } else if (ruta === '/r1') {
      redirigir(res, 302, '/ok');
    } else if ((m = /^\/r\/(\d+)$/.exec(ruta))) {
      redirigir(res, Number(m[1]), `${base}/ok`);
    } else if (ruta === '/fuera') {
      redirigir(res, 302, 'https://evil.example/x');
    } else if (ruta === '/fuera-http') {
      redirigir(res, 302, 'http://github.com/x');
    } else if (ruta === '/fuera-usuario') {
      redirigir(res, 301, 'https://u:p@github.com/x');
    } else if (ruta === '/sin-lugar') {
      redirigir(res, 302);
    } else if ((m = /^\/cadena\/(\d+)$/.exec(ruta))) {
      const n = Number(m[1]);
      if (n > 0) redirigir(res, 302, `/cadena/${n - 1}`);
      else {
        res.writeHead(200, { 'Content-Length': 3 });
        res.end('fin');
      }
    } else if ((m = /^\/pausa\/(\d+)$/.exec(ruta))) {
      // cada salto tarda 150 ms en contestar: ninguno pasa de 300 ms, pero la cadena entera sí
      const n = Number(m[1]);
      setTimeout(() => {
        if (res.destroyed) return;
        if (n > 0) redirigir(res, 302, `/pausa/${n - 1}`);
        else res.end('fin');
      }, 150);
    } else if (ruta === '/404' || ruta === '/403') {
      res.writeHead(Number(ruta.slice(1)), { 'Content-Type': 'text/plain' });
      res.end('no');
    } else if (ruta === '/500') {
      res.writeHead(500);
      res.end();
    } else if (ruta === '/grande') {
      // anuncia 2 MiB y espera: el cuerpo solo se manda si el cliente sigue ahí al cabo de 1,5 s
      res.writeHead(200, { 'Content-Length': 2 * MiB });
      res.flushHeaders();
      const reloj = setTimeout(() => {
        if (grande.cerrado) return;
        grande.escrito = true;
        res.end(Buffer.alloc(2 * MiB));
      }, 1500);
      res.on('close', () => {
        grande.cerrado = true;
        clearTimeout(reloj);
      });
    } else if (ruta === '/trozos') {
      // por trozos y sin longitud: 64 KiB cada vez hasta 2 MiB, mientras el cliente siga
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.on('close', () => {
        trozos.cerrado = true;
      });
      const trozo = Buffer.alloc(64 * 1024, 0x61);
      const seguir = () => {
        if (res.destroyed || trozos.cerrado) return;
        if (trozos.enviados >= 2 * MiB) return void res.end();
        trozos.enviados += trozo.length;
        res.write(trozo);
        setTimeout(seguir, 1);
      };
      seguir();
    } else if (ruta === '/cortado') {
      // anuncia 100 bytes, manda 10 y corta la conexión
      res.writeHead(200, { 'Content-Length': 100 });
      res.write(Buffer.alloc(10));
      setTimeout(() => res.socket?.destroy(), 20);
    } else if (ruta === '/pagina') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<p>guía</p>');
    } else if (ruta === '/pagina-r') {
      redirigir(res, 301, '/pagina');
    } else if (ruta === '/a-red-local') {
      redirigir(res, 302, 'https://192.168.1.5/');
    } else if (ruta === '/seis') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(Buffer.alloc(6 * MiB, 0x61));
    } else if (ruta === '/lento') {
      // no contesta nunca
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}

before(async () => {
  servidor = http.createServer(atender);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  servidor.closeAllConnections();
  await new Promise((r) => servidor.close(r));
});

// Las opciones de las pruebas: el servidor local y 1 MiB de tope.
const LOCAL = { permitirLocal: true, transporte: http.get, maxBytes: MiB };

// Un transporte que apunta cada URL que le piden y pasa la petición a http.get, pero solo si va al servidor local: con
// cualquier otra lanza sin abrir nada (y la apunta en `fuera`), para que un fallo de urlPermitida nunca salga a internet
// desde las pruebas. Al lanzar, obtener da 'conexion' en vez del código esperado, y la prueba falla.
const SOLO_LOCAL = 'http://127.0.0.1:';
function apuntador() {
  const urls = [];
  const fuera = [];
  const transporte = (url, opciones, cb) => {
    if (typeof url !== 'string' || !url.startsWith(SOLO_LOCAL)) {
      fuera.push(url);
      throw new Error(`las pruebas no salen de 127.0.0.1: ${String(url)}`);
    }
    urls.push(url);
    return http.get(url, opciones, cb);
  };
  return { urls, fuera, transporte };
}

test('el apuntador de las pruebas nunca pide nada fuera de http://127.0.0.1:', async () => {
  const a = apuntador();
  for (const url of ['https://github.com/x', 'http://github.com/x', 'http://127.0.0.1/x', 'http://127.0.0.10:80/x', new URL(`${base}/ok`)]) {
    assert.throws(() => a.transporte(url, {}, () => {}), /no salen de 127\.0\.0\.1/, String(url));
  }
  assert.equal(a.fuera.length, 5);
  assert.deepEqual(a.urls, []);
  // por obtener, una URL válida de GitHub llega al apuntador y da 'conexion' sin salir
  await fallaCon(obtener('https://github.com/x', { maxBytes: MiB, transporte: a.transporte }), 'conexion');
  assert.deepEqual(a.fuera.at(-1), 'https://github.com/x');
  assert.deepEqual(a.urls, []);
});

async function fallaCon(promesa, code) {
  await assert.rejects(promesa, (e) => {
    assert.ok(e instanceof ErrorRed, `no es ErrorRed: ${e}`);
    assert.equal(e.code, code, e.message);
    return true;
  });
}

test('origen (R6): repositorio por defecto, hosts y URL de las versiones', () => {
  assert.equal(REPO_POR_DEFECTO, 'alvarezalain262-create/SnetForever');
  assert.deepEqual(HOSTS, ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
  assert.equal(repoDe({ actualizaciones: { repo: 'a/b c' } }), REPO_POR_DEFECTO);
  assert.equal(repoDe({ actualizaciones: { repo: 'Otro-Usuario/mi.repo_2-x' } }), 'Otro-Usuario/mi.repo_2-x');
  for (const malo of ['', 'a', 'a/', '/b', 'a/b/c', 'a_b/c', `${'a'.repeat(40)}/b`, `a/${'b'.repeat(101)}`, 'a/b\n', ' a/b',
    'a/b?x=1', 'a/b#x', 'a/..', 'a/.', 'ñ/b', 7, null, ['a/b']]) {
    assert.equal(repoDe({ actualizaciones: { repo: malo } }), REPO_POR_DEFECTO, String(malo));
  }
  for (const config of [undefined, null, {}, { actualizaciones: null }, { actualizaciones: 'a/b' }]) {
    assert.equal(repoDe(config), REPO_POR_DEFECTO);
  }

  const o = crearOrigen({});
  assert.equal(o.manifiesto, 'https://github.com/alvarezalain262-create/SnetForever/releases/latest/download/snetforever-manifiesto.json');
  assert.equal(o.firma, 'https://github.com/alvarezalain262-create/SnetForever/releases/latest/download/snetforever-manifiesto.json.sig');
  assert.equal(o.paquete('v0.5.0-2026.11.10.1', 'SnetForever-addon-0.5.0.snfpaq'),
    'https://github.com/alvarezalain262-create/SnetForever/releases/download/v0.5.0-2026.11.10.1/SnetForever-addon-0.5.0.snfpaq');
  const otro = crearOrigen({ actualizaciones: { repo: 'yo/prueba' } });
  assert.equal(otro.manifiesto, 'https://github.com/yo/prueba/releases/latest/download/snetforever-manifiesto.json');
});

test('origen: la publicación y el archivo van siempre como un único segmento', () => {
  const o = crearOrigen({});
  const prefijo = 'https://github.com/alvarezalain262-create/SnetForever/releases/download/';
  assert.equal(o.paquete('v1/../../x', 'a b?#.snfpaq'), `${prefijo}v1%2F..%2F..%2Fx/a%20b%3F%23.snfpaq`);
  assert.equal(new URL(o.paquete('v1/../../x', 'a')).pathname, '/alvarezalain262-create/SnetForever/releases/download/v1%2F..%2F..%2Fx/a');
  // un «%2e%2e» escrito tal cual se codifica (%252e%252e) y ya no es «..» para la URL
  assert.equal(new URL(o.paquete('%2e%2e', 'a')).pathname, '/alvarezalain262-create/SnetForever/releases/download/%252e%252e/a');
  // «.», «..», vacío o algo que no es texto: encodeURIComponent los deja igual y la URL los resolvería; nunca se monta
  for (const [p, a] of [['..', 'a'], ['.', 'a'], ['', 'a'], ['v1', '..'], ['v1', '.'], ['v1', ''], [null, 'a'], ['v1', 3]]) {
    assert.throws(() => o.paquete(p, a), TypeError, `${p} ${a}`);
  }
});

test('obtener /ok: los bytes, y llega un GET sin cuerpo con solo User-Agent y Accept', async () => {
  vistas.length = 0;
  const b = await obtener(`${base}/ok`, LOCAL);
  assert.ok(Buffer.isBuffer(b));
  assert.deepEqual(b, OK);
  assert.equal(vistas.length, 1);
  const v = vistas[0];
  assert.equal(v.metodo, 'GET');
  assert.equal(v.cuerpo.length, 0);
  assert.equal(v.cabeceras['user-agent'], `SnetForever/${VERSION}`);
  assert.equal(v.cabeceras.accept, '*/*');
  for (const nombre of ['authorization', 'cookie', 'content-length', 'transfer-encoding', 'accept-encoding', 'referer']) {
    assert.equal(v.cabeceras[nombre], undefined, nombre);
  }
  // solo las dos nuestras y las que pone node:http por su cuenta
  assert.deepEqual(Object.keys(v.cabeceras).filter((k) => !['host', 'connection'].includes(k)).sort(), ['accept', 'user-agent']);
});

test('obtener: la versión del User-Agent sale de la opción version', async () => {
  vistas.length = 0;
  await obtener(`${base}/ok`, { ...LOCAL, version: '9.8.7' });
  assert.equal(vistas[0].cabeceras['user-agent'], 'SnetForever/9.8.7');
});

test('obtener: sigue las redirecciones 301, 302, 303, 307 y 308 (y las relativas)', async () => {
  assert.deepEqual(await obtener(`${base}/r1`, LOCAL), OK);
  for (const codigo of [301, 302, 303, 307, 308]) assert.deepEqual(await obtener(`${base}/r/${codigo}`, LOCAL), OK, String(codigo));
  // cinco en cadena todavía valen
  assert.deepEqual(await obtener(`${base}/cadena/5`, LOCAL), Buffer.from('fin'));
});

test('vigilancia 4: una redirección a otro sitio, sin destino o la sexta en cadena dan redireccion', async () => {
  const a = apuntador();
  await fallaCon(obtener(`${base}/fuera`, { ...LOCAL, transporte: a.transporte }), 'redireccion');
  await fallaCon(obtener(`${base}/fuera-http`, { ...LOCAL, transporte: a.transporte }), 'redireccion');
  await fallaCon(obtener(`${base}/fuera-usuario`, { ...LOCAL, transporte: a.transporte }), 'redireccion');
  await fallaCon(obtener(`${base}/sin-lugar`, { ...LOCAL, transporte: a.transporte }), 'redireccion');
  // nunca se llegó a pedir nada fuera de 127.0.0.1
  assert.deepEqual(a.urls, ['/fuera', '/fuera-http', '/fuera-usuario', '/sin-lugar'].map((r) => `${base}${r}`));
  assert.deepEqual(a.fuera, []);

  const b = apuntador();
  await fallaCon(obtener(`${base}/cadena/6`, { ...LOCAL, transporte: b.transporte }), 'redireccion');
  assert.equal(b.urls.length, 6, 'la sexta redirección no se sigue');
  assert.deepEqual(b.fuera, []);
  // con maxRedirecciones: 0 ni una
  await fallaCon(obtener(`${base}/r1`, { ...LOCAL, maxRedirecciones: 0 }), 'redireccion');
});

test('vigilancia 4: 404, 403 y 500 dan estado con el código', async () => {
  for (const codigo of [404, 403, 500]) {
    await assert.rejects(obtener(`${base}/${codigo}`, LOCAL), (e) => {
      assert.ok(e instanceof ErrorRed);
      assert.equal(e.code, 'estado');
      assert.equal(e.estado, codigo);
      return true;
    });
  }
});

test('vigilancia 4: si anuncia más de maxBytes se corta sin que el servidor mande el cuerpo', async () => {
  await fallaCon(obtener(`${base}/grande`, LOCAL), 'tamano');
  for (let i = 0; i < 100 && !grande.cerrado; i++) await esperar(10);
  assert.equal(grande.cerrado, true, 'el cliente cerró la conexión');
  assert.equal(grande.escrito, false, 'el servidor no llegó a mandar el cuerpo');
});

test('vigilancia 4: por trozos y sin longitud, se corta al pasar de maxBytes', async () => {
  await fallaCon(obtener(`${base}/trozos`, LOCAL), 'tamano');
  for (let i = 0; i < 100 && !trozos.cerrado; i++) await esperar(10);
  assert.equal(trozos.cerrado, true);
  assert.ok(trozos.enviados < 2 * MiB, `se cortó antes del final (${trozos.enviados})`);
  // y justo en el tope vale: /ok con maxBytes igual a su tamaño
  assert.deepEqual(await obtener(`${base}/ok`, { ...LOCAL, maxBytes: OK.length }), OK);
  await fallaCon(obtener(`${base}/ok`, { ...LOCAL, maxBytes: OK.length - 1 }), 'tamano');
});

test('vigilancia 4: una respuesta que no llega da tiempo en menos de 1 s', async () => {
  const t0 = Date.now();
  await fallaCon(obtener(`${base}/lento`, { ...LOCAL, tiempoMax: 300 }), 'tiempo');
  const t = Date.now() - t0;
  assert.ok(t >= 250 && t < 1000, `${t} ms`);
});

test('vigilancia 4: tiempoMax cuenta la petición entera, con las redirecciones', async () => {
  // tres saltos de 150 ms y el final: ninguno pasa de 300 ms, pero juntos sí
  const t0 = Date.now();
  await fallaCon(obtener(`${base}/pausa/3`, { ...LOCAL, tiempoMax: 300 }), 'tiempo');
  assert.ok(Date.now() - t0 < 1000);
  // con tiempo de sobra, llega
  assert.deepEqual(await obtener(`${base}/pausa/1`, { ...LOCAL, tiempoMax: 5000 }), Buffer.from('fin'));
});

test('vigilancia 4: un puerto cerrado o una conexión cortada a mitad dan conexion', async () => {
  const cerrado = http.createServer();
  await new Promise((r) => cerrado.listen(0, '127.0.0.1', r));
  const puerto = cerrado.address().port;
  await new Promise((r) => cerrado.close(r));
  await fallaCon(obtener(`http://127.0.0.1:${puerto}/x`, LOCAL), 'conexion');
  await fallaCon(obtener(`${base}/cortado`, LOCAL), 'conexion');
});

test('URL no válidas: dan url sin llamar al transporte', async () => {
  const a = apuntador();
  for (const url of ['http://github.com/x', 'https://u:p@github.com/x', 'https://u@github.com/x', 'https://github.com.evil.io/x',
    'https://github.com:8443/x', 'https://127.0.0.1/x', 'https://evil.example/x', 'ftp://github.com/x', 'https://api.github.com/x',
    'https://xgithub.com/x', 'https://github.com./x', 'no es una url', '', 'https://[::1]/x', 'https://localhost/x']) {
    await fallaCon(obtener(url, { maxBytes: MiB, transporte: a.transporte }), 'url');
  }
  // sin permitirLocal, ni siquiera 127.0.0.1 por http
  await fallaCon(obtener(`${base}/ok`, { maxBytes: MiB, transporte: a.transporte }), 'url');
  // con permitirLocal, solo http://127.0.0.1 con puerto (no otro host, ni sin puerto, ni con usuario)
  for (const url of ['http://localhost:80/x', 'http://127.0.0.2:8080/x', 'http://127.0.0.1/x', 'http://u:p@127.0.0.1:8080/x',
    'http://github.com/x', 'http://[::1]:8080/x']) {
    await fallaCon(obtener(url, { ...LOCAL, transporte: a.transporte }), 'url');
  }
  assert.deepEqual(a.urls, []);
  assert.deepEqual(a.fuera, []);
});

test('URL válidas: https a los tres hosts, con puerto vacío o 443, llegan al transporte', async () => {
  const pedidas = [];
  // un transporte falso que no abre ninguna conexión: devuelve una petición que falla en el siguiente tic
  const falso = (url, opciones) => {
    pedidas.push({ url, opciones });
    const p = new EventEmitter();
    p.destroy = () => {};
    process.nextTick(() => p.emit('error', new Error('sin red en las pruebas')));
    return p;
  };
  for (const url of ['https://github.com/x', 'https://GitHub.com:443/x', 'https://objects.githubusercontent.com/a?b=c',
    'https://release-assets.githubusercontent.com/a']) {
    await fallaCon(obtener(url, { maxBytes: MiB, transporte: falso }), 'conexion');
  }
  assert.equal(pedidas.length, 4);
  assert.equal(pedidas[1].url, 'https://github.com/x');
  for (const { opciones } of pedidas) {
    assert.deepEqual(opciones.headers, { 'User-Agent': `SnetForever/${VERSION}`, Accept: '*/*' });
    assert.equal(Object.hasOwn(opciones, 'method'), false);
  }
});

test('obtener sin maxBytes válido no abre ninguna conexión', async () => {
  const a = apuntador();
  for (const maxBytes of [undefined, -1, 1.5, '10', NaN]) {
    await assert.rejects(obtener(`${base}/ok`, { ...LOCAL, maxBytes, transporte: a.transporte }), TypeError);
  }
  assert.deepEqual(a.urls, []);
  assert.deepEqual(a.fuera, []);
});

test('ronda 1: tiempoMax y maxRedirecciones no válidos dan TypeError sin abrir ninguna conexión', async () => {
  const a = apuntador();
  for (const tiempoMax of [0, -1, 1.5, '300', NaN, Infinity, null, 2 ** 31]) {
    await assert.rejects(obtener(`${base}/ok`, { ...LOCAL, tiempoMax, transporte: a.transporte }), TypeError, String(tiempoMax));
  }
  for (const maxRedirecciones of [-1, 1.5, '5', NaN, Infinity, null]) {
    await assert.rejects(obtener(`${base}/ok`, { ...LOCAL, maxRedirecciones, transporte: a.transporte }), TypeError,
      String(maxRedirecciones));
  }
  assert.deepEqual(a.urls, []);
  assert.deepEqual(a.fuera, []);
  // los límites que sí valen: 1 ms de reloj (no hay servidor tan rápido para /lento) y 0 redirecciones
  await fallaCon(obtener(`${base}/lento`, { ...LOCAL, tiempoMax: 1 }), 'tiempo');
  assert.deepEqual(await obtener(`${base}/ok`, { ...LOCAL, maxRedirecciones: 0 }), OK);
  assert.deepEqual(await obtener(`${base}/ok`, { ...LOCAL, tiempoMax: 2 ** 31 - 1 }), OK);
});

test('ronda 1: version tiene que ser una versión como las de la app (si no, TypeError sin conectar)', async () => {
  const a = apuntador();
  for (const version of ['', '1', '0.5.0\r\nX-Otra: 1', '0.5.0 ', 'v0.5.0', '0.5.0-beta', '1.2.3.4.5', 5, null, '0..5']) {
    await assert.rejects(obtener(`${base}/ok`, { ...LOCAL, version, transporte: a.transporte }), TypeError, String(version));
  }
  assert.deepEqual(a.urls, []);
  for (const version of ['1.2', '0.5.0', '2026.11.10.1']) {
    vistas.length = 0;
    await obtener(`${base}/ok`, { ...LOCAL, version });
    assert.equal(vistas[0].cabeceras['user-agent'], `SnetForever/${version}`);
  }
});

test('urlDePagina: https públicas; http pasa a https; fuera la red local, usuarios y puertos raros', () => {
  assert.equal(urlDePagina('https://www.wowhead.com/classic/guide/x'), 'https://www.wowhead.com/classic/guide/x');
  assert.equal(urlDePagina('http://games.gg/wow/guia'), 'https://games.gg/wow/guia');
  for (const malo of ['ftp://x.com/a', 'file:///C:/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://192.168.1.5/a',
    'https://10.0.0.80/a', 'https://[::1]/a', 'https://169.254.1.1/a', 'https://router/a', 'https://nas.local/a',
    'https://x.localhost/a', 'https://u:p@x.com/a', 'https://x.com:8443/a', 'texto']) assert.equal(urlDePagina(malo), null, malo);
});

test('ipPrivada: bucle, privadas, enlace local, CGNAT y las IPv6 de la red local', () => {
  for (const s of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.0.1', '100.64.0.1',
    '0.0.0.0', '::1', 'fe80::1', 'fc00::1', '::ffff:192.168.1.1']) assert.equal(ipPrivada(s), true, s);
  for (const s of ['8.8.8.8', '172.32.0.1', '2606:4700::1']) assert.equal(ipPrivada(s), false, s);
});

test('obtenerPagina: devuelve url final, tipo y cuerpo, y sigue una redirección a otra página pública', async () => {
  const r = await obtenerPagina(`${base}/pagina-r`, { permitirLocal: true, transporte: http.get });
  assert.equal(r.url, `${base}/pagina`);
  assert.equal(r.tipo, 'text/html; charset=utf-8');
  assert.equal(r.cuerpo.toString('utf8'), '<p>guía</p>');
  assert.equal(MAX_PAGINA, 5 * MiB);
});

test('obtenerPagina: una redirección a la red local da red_local, y las URL malas dan url sin llamar al transporte', async () => {
  await fallaCon(obtenerPagina(`${base}/a-red-local`, { permitirLocal: true, transporte: http.get }), 'red_local');
  const a = apuntador();
  for (const url of ['https://192.168.1.5/x', 'https://localhost/x', 'ftp://x.com/a', 'texto', '']) {
    await fallaCon(obtenerPagina(url, { transporte: a.transporte }), 'url');
  }
  assert.deepEqual(a.fuera, []);
});

test('obtenerPagina: un cuerpo de 6 MB da tamano; un 404 da estado; las opciones malas dan TypeError', async () => {
  await fallaCon(obtenerPagina(`${base}/seis`, { permitirLocal: true, transporte: http.get }), 'tamano');
  await fallaCon(obtenerPagina(`${base}/404`, { permitirLocal: true, transporte: http.get }), 'estado');
  await assert.rejects(obtenerPagina(`${base}/pagina`, { maxBytes: -1 }), TypeError);
  await assert.rejects(obtenerPagina(`${base}/pagina`, { version: 'x' }), TypeError);
});

test('obtenerPagina: si el nombre resuelve a una IP de la red local, red_local sin pedir nada', async () => {
  let peticiones = 0;
  const falso = () => {
    const p = new EventEmitter();
    p.destroyed = false;
    p.destroy = () => { p.destroyed = true; };
    const socket = new EventEmitter();
    process.nextTick(() => {
      p.emit('socket', socket);
      socket.emit('lookup', null, '10.0.0.80', 4, 'ejemplo.com');
    });
    peticiones += 1;
    return p;
  };
  let peticion;
  const transporte = (...args) => { peticion = falso(...args); return peticion; };
  await fallaCon(obtenerPagina('https://ejemplo.com/guia', { transporte }), 'red_local');
  assert.equal(peticiones, 1);
  assert.equal(peticion.destroyed, true);
});
