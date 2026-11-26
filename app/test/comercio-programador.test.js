// Programador horario del comercio (Task 8): con un reloj falso, un cliente falso y sin red de verdad.
// También el estado del comercio (estado.json y lo que se lee de SavedVariables) y el acceso directo de «Arrancar con
// Windows» (inicio.mjs e inicio.ps1, este último en una carpeta de prueba, nunca en la carpeta Inicio de verdad).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import * as nodeFs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearProgramadorComercio } from '../src/comercio/programador.mjs';
import { crearEstadoComercio, leerCuentas } from '../src/comercio/estado.mjs';
import { arranqueConWindows, ponerArranqueConWindows, SCRIPT_INICIO } from '../src/inicio.mjs';
import { POWERSHELL } from '../src/captura.mjs';
import { ARCHIVOS_POR_RANURA } from '../src/comercio/precios-lua.mjs';

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.UTC(2026, 10, 13, 10, 5); // 13-nov-2026 10:05 UTC
const en = (hh, mm) => Date.UTC(2026, 10, 13, hh, mm);
const texto = (ms) => new Date(ms).toUTCString();

const hasta = async (cond, ms = 3000) => {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error('la condición no se cumplió a tiempo');
    await new Promise((ok) => setImmediate(ok));
  }
};

// Reloj falso: `dormir` no pasa nunca solo; `pasar()` avanza el reloj lo que se pidió y espera a la siguiente espera.
function relojFalso(t = T0) {
  const r = { t, esperas: [] };
  r.ahora = () => r.t;
  r.dormir = (ms) => new Promise((ok) => r.esperas.push({ ms, ok }));
  r.espera = async () => {
    await hasta(() => r.esperas.length > 0);
    return r.esperas[0].ms;
  };
  r.pasar = async () => {
    await hasta(() => r.esperas.length > 0);
    const e = r.esperas.shift();
    r.t += e.ms;
    e.ok();
    await hasta(() => r.esperas.length > 0);
  };
  return r;
}

const carpetaTemporal = () => mkdtempSync(join(tmpdir(), 'snf-programador-'));

// Una subasta de prueba.
const subasta = (id, item = 2589, precio = 100, cantidad = 5) => ({ id, item, cantidad, precio, tiempo: 'LONG' });

// Un servidor falso de Blizzard: la foto cambia cada hora a las hh:21; con `desde` igual o posterior, 304 («igual»).
// `trucos(tipo, casa, r)` puede cambiar la respuesta (devolver algo o lanzar).
function servidor(reloj, { trucos } = {}) {
  const s = { llamadas: [] };
  const foto = (t) => {
    const h0 = Math.floor(t / H) * H;
    return t >= h0 + 21 * MIN ? h0 + 21 * MIN : h0 - H + 21 * MIN;
  };
  const responder = (tipo) => async (casa, { desde } = {}) => {
    s.llamadas.push({ t: reloj.t, tipo, casa, desde });
    const truco = trucos?.(tipo, casa, s);
    if (truco) return truco();
    const f = foto(reloj.t);
    if (desde && Date.parse(desde) >= f) return { estado: 'igual' };
    return { estado: 'nueva', hora: texto(f), subastas: [subasta(`${casa}-${tipo}-${f}`)] };
  };
  s.subastas = responder('subastas');
  s.mercancias = responder('mercancias');
  s.objeto = async () => null;
  s.cuando = (t) => s.llamadas.filter((l) => l.t === t);
  return s;
}

function historialFalso() {
  const f = { fotos: [], guardados: [] };
  f.anadirFoto = (casa, hora, subastas, mercancias) => {
    f.fotos.push({ casa, hora, subastas, mercancias });
    return true;
  };
  f.guardar = async (casa) => { f.guardados.push(casa); };
  f.todos = (casa) => {
    const ultima = f.fotos.filter((x) => x.casa === casa).at(-1);
    if (!ultima) return new Map();
    return new Map([[2589, { precio: 100, cantidad: 5, subastas: 3, normal: 100, poco: true, tendencia: null, ritmo: null, vendidosDia: null, hora: ultima.hora }]]);
  };
  return f;
}

function catalogoFalso({ completar } = {}) {
  const f = { pedidos: [] };
  f.completar = async (ids) => {
    f.pedidos.push([...ids]);
    if (completar) return completar();
    return { pedidos: 0, pendientes: 0 };
  };
  f.grupos = () => [];
  f.ficha = (id) => (id === 2589 ? { id, nombre: 'Barra de hierro' } : null);
  return f;
}

const HORDA = { region: 'US', reino: 'Normal', faccion: 'Horde' };
const ALIANZA = { region: 'US', reino: 'Normal', faccion: 'Alliance' };

// F7: ya no hay casa supuesta. Las pruebas de siempre parten de las tres casas de «Normal» ya descubiertas (114 Horda,
// 111 Alianza, 117 neutral) y de personajes de las dos facciones, así se siguen las tres como antes.
function conTresCasas(e) {
  e.aprender('Normal', 'Horde', 114);
  e.aprender('Normal', 'Alliance', 111);
  e.aprender('Normal', 'Neutral', 117);
  return e;
}

function estadoCon({ identidad = HORDA, desde = null, casas = [114, 111, 117] } = {}) {
  const carpeta = carpetaTemporal();
  const e = conTresCasas(crearEstadoComercio({ fs: nodeFs, carpeta }));
  if (identidad) {
    e.ponerIdentidad(identidad.faccion === 'Horde' ? ALIANZA : HORDA);
    e.ponerIdentidad(identidad);
  }
  if (desde) for (const c of casas) e.ponerDesde('us', c, { subastas: texto(desde), mercancias: texto(desde) });
  return { e, carpeta };
}

function montar({ reloj = relojFalso(), estado = estadoCon().e, cliente, historial = historialFalso(), catalogo = catalogoFalso(), escribir } = {}) {
  const s = cliente ?? servidor(reloj);
  const escritos = [];
  const registros = [];
  const p = crearProgramadorComercio({
    cliente: (region) => {
      assert.equal(region, 'us');
      return s;
    },
    historial,
    catalogo,
    casas: estado,
    escribir: escribir ?? (async (textos, { generado }) => { escritos.push({ textos, generado }); }),
    reloj: reloj.ahora,
    dormir: reloj.dormir,
    espacio: 0, // F7: sin el respiro entre casas (lo prueba comercio-neutral.test.js)
    registrar: (nivel, t) => registros.push({ nivel, texto: t }),
  });
  return { p, s, reloj, estado, historial, catalogo, escritos, registros };
}

// ---------- calendario ----------

test('a las hh:20 pide; con 304 vuelve a las hh:22; con la foto nueva escribe la ranura una sola vez y espera a la hora siguiente', async () => {
  const reloj = relojFalso();
  const { e } = estadoCon({ desde: en(9, 21) });
  const m = montar({ reloj, estado: e });
  m.p.arrancar();
  assert.equal(await reloj.espera(), 15 * MIN, 'a las 10:05 espera a las 10:20');
  assert.equal(m.s.llamadas.length, 0);

  await reloj.pasar(); // 10:20
  const a20 = m.s.cuando(en(10, 20));
  assert.equal(a20.length, 6, 'subastas y mercancías de las 3 casas');
  assert.deepEqual([...new Set(a20.map((l) => l.casa))], [114, 111, 117]);
  assert.ok(a20.every((l) => l.desde === texto(en(9, 21))), 'con If-Modified-Since');
  assert.equal(m.escritos.length, 0, 'todo 304: no escribe nada');
  assert.equal(await reloj.espera(), 2 * MIN);

  await reloj.pasar(); // 10:22
  assert.equal(m.s.cuando(en(10, 22)).length, 6);
  assert.equal(m.historial.fotos.length, 3);
  assert.ok(m.historial.fotos.every((f) => f.hora === en(10, 21) / 1000), 'la hora de la foto es la de Last-Modified, en segundos');
  assert.deepEqual(m.historial.guardados, [114, 111, 117]);
  assert.equal(m.escritos.length, 1, 'una sola ranura');
  assert.equal(m.escritos[0].generado, en(10, 21) / 1000);
  assert.equal(m.escritos[0].textos.length, ARCHIVOS_POR_RANURA);
  assert.match(m.escritos[0].textos[0], /region = "us"/);
  // T1b: la fila lleva además las subastas (3) y si se sabe la tendencia (0: no se sabe, y por eso va a 0)
  assert.match(m.escritos[0].textos.join(''), /c\[2589\]=\{100,5,100,0,-1,-1,1,3,0\}/);
  assert.deepEqual(m.catalogo.pedidos, [[2589]]);
  assert.equal(await reloj.espera(), 58 * MIN, 'ya tiene la foto de las tres: hasta las 11:20');

  await reloj.pasar(); // 11:20
  assert.equal(m.s.cuando(en(11, 20)).length, 6);
  assert.ok(m.s.cuando(en(11, 20)).every((l) => l.desde === texto(en(10, 21))), 'el desde nuevo');
  assert.equal(m.escritos.length, 1);
  m.p.parar();
});

test('pasado el minuto 50 sin foto nueva, deja de preguntar hasta las hh:20 siguientes', async () => {
  const reloj = relojFalso(en(10, 48));
  const s = servidor(reloj, { trucos: () => () => ({ estado: 'igual' }) });
  const m = montar({ reloj, cliente: s });
  m.p.arrancar();
  await hasta(() => s.llamadas.length === 6);
  assert.equal(await reloj.espera(), 2 * MIN);
  await reloj.pasar(); // 10:50: fuera de la ventana
  assert.equal(s.llamadas.length, 6, 'a las 10:50 ya no pregunta');
  assert.equal(await reloj.espera(), 30 * MIN);
  m.p.parar();
});

test('sin credenciales no pide hasta la hora siguiente', async () => {
  const reloj = relojFalso();
  const s = servidor(reloj, { trucos: () => () => ({ estado: 'sin_credenciales' }) });
  const m = montar({ reloj, cliente: s });
  m.p.arrancar();
  await reloj.pasar(); // 10:20
  assert.equal(s.cuando(en(10, 20)).length, 1, 'con el primer «sin_credenciales» deja la ronda');
  assert.equal(await reloj.espera(), 60 * MIN, 'hasta las 11:20');
  await reloj.pasar(); // 11:20
  assert.equal(s.cuando(en(11, 20)).length, 1);
  assert.equal(s.llamadas.length, 2);
  assert.equal(m.escritos.length, 0);
  assert.equal(m.historial.fotos.length, 0);
  m.p.parar();
});

test('un error de red (o un fallo al completar el catálogo) no para el programador; la casa que falla se vuelve a pedir', async () => {
  const reloj = relojFalso(en(10, 30));
  let veces = 0;
  const s = servidor(reloj, {
    trucos: (tipo, casa) => {
      if (casa !== 111) return null;
      veces += 1;
      if (veces === 1) return () => { throw new Error('ECONNRESET'); };
      if (veces === 2) return () => ({ estado: 'error' });
      return null;
    },
  });
  const catalogo = catalogoFalso({ completar: () => { throw Object.assign(new Error('x'), { code: 'TEMPORAL' }); } });
  const { e } = estadoCon({ desde: en(9, 21) });
  const m = montar({ reloj, cliente: s, estado: e, catalogo });
  m.p.arrancar();
  await hasta(() => reloj.esperas.length > 0);
  assert.deepEqual(m.historial.fotos.map((f) => f.casa), [114, 117], 'la 111 falló: sin foto');
  assert.equal(m.escritos.length, 1, 'se escriben las que llegaron aunque falle el catálogo');
  assert.equal(await reloj.espera(), 2 * MIN);
  await reloj.pasar(); // 10:32
  assert.deepEqual([...new Set(m.s.cuando(en(10, 32)).map((l) => l.casa))], [111], 'solo la que faltaba');
  assert.deepEqual(m.historial.fotos.map((f) => f.casa), [114, 117, 111]);
  assert.equal(m.escritos.length, 2);
  assert.equal(await reloj.espera(), 48 * MIN);
  assert.ok(m.registros.some((r) => r.nivel === 'aviso' && /111/.test(r.texto)));
  m.p.parar();
});

test('un fallo inesperado dentro de la ronda (al escribir) tampoco para el programador', async () => {
  const reloj = relojFalso(en(10, 30));
  let escritos = 0;
  const m = montar({ reloj, escribir: async () => { escritos += 1; throw Object.assign(new Error('x'), { code: 'ENLACE' }); } });
  m.p.arrancar();
  await hasta(() => reloj.esperas.length > 0);
  assert.equal(escritos, 1);
  assert.ok(m.registros.some((r) => r.nivel === 'error' && /ENLACE/.test(r.texto)));
  assert.ok((await reloj.espera()) > 0);
  m.p.parar();
});

// ---------- la foto de una casa: subastas y mercancías juntas ----------

test('solo añade la foto cuando subastas y mercancías llegan nuevas; la que llegó primero se guarda hasta que llegue la otra', async () => {
  const reloj = relojFalso(en(10, 30));
  let primeraMercancia = true;
  const s = servidor(reloj, {
    trucos: (tipo, casa) => {
      if (tipo === 'mercancias' && casa === 114 && primeraMercancia) {
        primeraMercancia = false;
        return () => ({ estado: 'error' });
      }
      return null;
    },
  });
  const { e } = estadoCon({ desde: en(9, 21) });
  const m = montar({ reloj, cliente: s, estado: e });
  m.p.arrancar();
  await hasta(() => reloj.esperas.length > 0);
  assert.deepEqual(m.historial.fotos.map((f) => f.casa), [111, 117]);
  await reloj.pasar(); // 10:32
  const a32 = m.s.cuando(en(10, 32));
  assert.deepEqual(a32.map((l) => `${l.casa}:${l.tipo}`), ['114:mercancias'], 'las subastas de la 114 ya estaban: no se vuelven a pedir');
  const f114 = m.historial.fotos.find((f) => f.casa === 114);
  assert.equal(f114.subastas[0].id, `114-subastas-${en(10, 21)}`);
  assert.equal(f114.mercancias[0].id, `114-mercancias-${en(10, 21)}`);
  m.p.parar();
});

test('una lista vacía tras una llena no se añade al historial (contaría todo como vendido)', async () => {
  const reloj = relojFalso(en(10, 30));
  const s = servidor(reloj, {
    trucos: (tipo, casa) => (tipo === 'subastas' && casa === 111 ? () => ({ estado: 'nueva', hora: texto(en(10, 21)), subastas: [] }) : null),
  });
  const { e } = estadoCon();
  for (const c of [114, 111, 117]) e.ponerDesde('us', c, { subastas: texto(en(9, 21)), mercancias: texto(en(9, 21)), cuentas: { subastas: 4, mercancias: 4 } });
  const m = montar({ reloj, cliente: s, estado: e });
  m.p.arrancar();
  await hasta(() => reloj.esperas.length > 0);
  assert.deepEqual(m.historial.fotos.map((f) => f.casa), [114, 117]);
  assert.ok(m.registros.some((r) => r.nivel === 'aviso' && /111/.test(r.texto) && /vac/.test(r.texto)));
  m.p.parar();
});

test('una lista vacía vale si la foto anterior de esa casa también la traía vacía, o si la casa aún no tiene historial', async () => {
  const reloj = relojFalso(en(10, 30));
  const s = servidor(reloj, {
    trucos: (tipo, casa) => (tipo === 'mercancias' && casa !== 114 ? () => ({ estado: 'nueva', hora: texto(en(10, 21)), subastas: [] }) : null),
  });
  const { e } = estadoCon();
  e.ponerDesde('us', 111, { subastas: texto(en(9, 21)), mercancias: texto(en(9, 21)), cuentas: { subastas: 4, mercancias: 0 } });
  const m = montar({ reloj, cliente: s, estado: e });
  m.p.arrancar();
  await hasta(() => reloj.esperas.length > 0);
  assert.deepEqual(m.historial.fotos.map((f) => f.casa), [114, 111, 117], '111: también vacía antes; 117: sin historial');
  assert.deepEqual(e.desde('us', 111).cuentas, { subastas: 1, mercancias: 0 });
  m.p.parar();
});

test('si el historial no se puede guardar, los precios se publican igual y la casa queda hecha; si anadirFoto falla, se vuelve a pedir', async () => {
  const reloj = relojFalso(en(10, 30));
  const historial = historialFalso();
  historial.guardar = async () => { throw Object.assign(new Error('x'), { code: 'EBUSY' }); };
  const anadir = historial.anadirFoto;
  let primera = true;
  historial.anadirFoto = (casa, ...resto) => {
    if (casa === 117 && primera) {
      primera = false;
      throw new Error('roto');
    }
    return anadir(casa, ...resto);
  };
  const { e } = estadoCon({ desde: en(9, 21) });
  const m = montar({ reloj, estado: e, historial });
  m.p.arrancar();
  await hasta(() => reloj.esperas.length > 0);
  assert.deepEqual(historial.fotos.map((f) => f.casa), [114, 111]);
  assert.equal(m.escritos.length, 1, 'publica aunque no se haya podido guardar');
  assert.ok(m.registros.some((r) => /EBUSY/.test(r.texto)));
  await reloj.pasar(); // 10:32
  assert.deepEqual([...new Set(m.s.cuando(en(10, 32)).map((l) => l.casa))], [117], 'solo la que falló al añadir');
  assert.deepEqual(historial.fotos.map((f) => f.casa), [114, 111, 117]);
  m.p.parar();
});

test('si los precios de las tres casas no caben, va solo la casa propia con sus nombres y sus objetos en los grupos', async () => {
  const reloj = relojFalso(en(10, 30));
  const historial = historialFalso();
  const filas = (desde) => new Map(Array.from({ length: 40000 }, (_, i) => [desde + i, {
    precio: 123456 + i, cantidad: 12, subastas: 4, normal: 123456, poco: false, tendencia: 1.5, ritmo: 0.25, vendidosDia: 3.5, hora: 1,
    mercancia: i === 5, // F5: la 6 es una mercancía
  }]));
  const porCasa = { 114: filas(1), 111: filas(50001), 117: filas(100001) };
  historial.todos = (casa) => porCasa[casa];
  const catalogo = catalogoFalso();
  catalogo.ficha = (id) => (id === 5 || id === 60000 ? { id, nombre: `Objeto ${id}` } : null);
  catalogo.grupos = () => [
    { clave: 'mezcla', nombre: { es: 'M', en: 'M' }, objetos: [5, 60000], tipo: 'auto' },
    { clave: 'ajeno', nombre: { es: 'A', en: 'A' }, objetos: [60000], tipo: 'auto' },
  ];
  const { e } = estadoCon({ desde: en(9, 21) });
  const m = montar({ reloj, estado: e, historial, catalogo });
  await m.p.ahora();
  assert.equal(m.escritos.length, 1);
  const todo = m.escritos[0].textos.join('');
  assert.ok(todo.includes('Q[114]'));
  assert.ok(todo.includes('c[5]={123460,12,123456,1.5,0.25,3.5,0,4,1}'), 'T1b: con las subastas y la tendencia sabida');
  assert.ok(todo.includes('c[6]={123461,12,123456,1.5,0.25,3.5,0,4,1,1}'), 'F5: una mercancía lleva un 1 detrás');
  assert.ok(!todo.includes('Q[111]') && !todo.includes('Q[117]'), 'solo la casa propia');
  assert.ok(todo.includes('N[5]="Objeto 5"'));
  assert.ok(!todo.includes('N[60000]'), 'sin nombres de otras casas');
  assert.ok(m.escritos[0].textos[0].includes('{clave="mezcla", nombre={es="M", en="M"}, tipo="auto", objetos={5}}'));
  assert.ok(!m.escritos[0].textos[0].includes('ajeno'), 'el grupo que se queda vacío no va');
  assert.ok(m.registros.some((r) => /no caben/.test(r.texto)));
});

// ---------- casas en uso ----------

test('una identidad nueva (otro bando) cambia las casas de la ronda siguiente', async () => {
  const reloj = relojFalso();
  const s = servidor(reloj, { trucos: () => () => ({ estado: 'igual' }) });
  const { e } = estadoCon();
  const m = montar({ reloj, cliente: s, estado: e });
  m.p.arrancar();
  await reloj.pasar(); // 10:20
  assert.deepEqual([...new Set(s.cuando(en(10, 20)).map((l) => l.casa))], [114, 111, 117]);
  e.ponerIdentidad(ALIANZA);
  await reloj.pasar(); // 10:22
  assert.deepEqual([...new Set(s.cuando(en(10, 22)).map((l) => l.casa))], [111, 114, 117], 'la casa del bando nuevo, primero');
  m.p.parar();
});

test('un escaneo del jugador descubre su casa entre las 5 de su bando, se guarda y cambia las casas de la ronda siguiente', async () => {
  const reloj = relojFalso();
  const carpeta = carpetaTemporal();
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  e.alLeerCuenta({
    identidad: ALIANZA,
    escaneo: { hora: en(9, 50) / 1000, identidad: ALIANZA, muestras: { 2589: { 100: 5, 110: 3, 120: 7, 130: 1 } } },
  });
  e.aprender('Normal', 'Neutral', 117); // F7: la neutral ya conocida; la Horda no tiene personajes: no se sigue
  for (const c of [111, 114, 117]) e.ponerDesde('us', c, { subastas: texto(en(9, 21)), mercancias: texto(en(9, 21)) });
  const lista = (casa) => (casa === 112
    ? [subasta('a', 2589, 100, 5), subasta('b', 2589, 110, 2), subasta('c', 2589, 110, 1), subasta('d', 2589, 120, 7), subasta('e', 2589, 130, 1)]
    : [subasta('x', 2589, 100, 9), subasta('y', 2589, 999, 1)]);
  const s = servidor(reloj, {
    trucos: (tipo, casa, srv) => {
      const ultima = srv.llamadas.at(-1);
      if (ultima.desde) return () => ({ estado: 'igual' });
      return () => ({ estado: 'nueva', hora: texto(en(10, 21)), subastas: lista(casa) });
    },
  });
  const m = montar({ reloj, cliente: s, estado: e });
  m.p.arrancar();
  await reloj.pasar(); // 10:20
  const sinDesde = s.cuando(en(10, 20)).filter((l) => !l.desde);
  assert.deepEqual(sinDesde.map((l) => `${l.tipo}:${l.casa}`), [110, 111, 112, 119, 123].map((c) => `mercancias:${c}`));
  assert.deepEqual(e.conocidas(), { 'Normal|Alliance': 112, 'Normal|Neutral': 117 });
  assert.ok(m.registros.some((r) => /112/.test(r.texto)));
  const guardado = JSON.parse(readFileSync(join(carpeta, 'estado.json'), 'utf8'));
  assert.deepEqual(guardado.conocidas, { 'Normal|Alliance': 112, 'Normal|Neutral': 117 });
  await reloj.pasar(); // 10:22
  assert.deepEqual([...new Set(s.cuando(en(10, 22)).map((l) => l.casa))], [112, 117]);
  assert.equal(s.cuando(en(10, 22)).filter((l) => !l.desde && l.casa !== 112).length, 0, 'el mismo escaneo no se vuelve a probar');
  m.p.parar();
});

// F7, ronda 1: tras una descarga a medias se reintenta en la ronda siguiente (2 min), sin volver a bajar lo ya bajado.
test('descubrir: con una casa que falla no vuelve a bajar lo ya bajado; reintenta en las rondas siguientes y lo deja tras 3', async () => {
  const reloj = relojFalso();
  const e = crearEstadoComercio({ fs: nodeFs, carpeta: carpetaTemporal() });
  e.alLeerCuenta({ identidad: ALIANZA, escaneo: { hora: en(9, 50) / 1000, identidad: ALIANZA, muestras: { 2589: { 100: 5 } } } });
  const s = servidor(reloj, {
    trucos: (tipo, casa, srv) => {
      if (srv.llamadas.at(-1).desde) return () => ({ estado: 'igual' });
      if (casa === 119) return () => ({ estado: 'error' });
      return () => ({ estado: 'nueva', hora: texto(en(9, 21)), subastas: [subasta(`${casa}`, 2589, 100, 1)] });
    },
  });
  for (const c of [111, 114, 117]) e.ponerDesde('us', c, { subastas: texto(en(9, 21)), mercancias: texto(en(9, 21)) });
  const m = montar({ reloj, cliente: s, estado: e });
  m.p.arrancar();
  const descargas = () => s.llamadas.filter((l) => !l.desde);
  while (reloj.t < en(14, 0)) await reloj.pasar();
  const horas = descargas().map((l) => new Date(l.t).toISOString().slice(11, 16));
  assert.deepEqual([...new Set(horas)], ['10:20', '10:22', '10:24'], 'un intento por ronda tras el fallo, y nada tras el tercero');
  assert.equal(descargas().filter((l) => l.t === en(10, 20)).length, 4, '110, 111, 112 y la 119 que falla');
  assert.deepEqual(descargas().filter((l) => l.t > en(10, 20)).map((l) => l.casa), [119, 119], 'después, solo la que falta');
  assert.equal(e.porDescubrir(), null, 'tras 3 fallos se da por probado');
  assert.ok(m.registros.some((r) => /3 intentos/.test(r.texto)));
  m.p.parar();
});

test('arrancar() justo después de parar() no deja dos bucles', async () => {
  const reloj = relojFalso();
  const m = montar({ reloj });
  m.p.arrancar();
  await reloj.espera();
  m.p.parar();
  m.p.arrancar();
  await new Promise((ok) => setTimeout(ok, 30));
  assert.equal(reloj.esperas.length, 2, 'la espera vieja (sin resolver) y una sola nueva');
  m.p.parar();
});

test('sin identidad no pregunta nada y lo apunta una sola vez', async () => {
  const reloj = relojFalso();
  const { e } = estadoCon({ identidad: null });
  const m = montar({ reloj, estado: e });
  m.p.arrancar();
  await reloj.pasar(); // 10:20
  await reloj.pasar(); // 10:22
  assert.equal(m.s.llamadas.length, 0);
  assert.equal(m.registros.filter((r) => /identidad/.test(r.texto)).length, 1);
  m.p.parar();
});

test('ahora() fuerza una ronda aunque no sea la hora, y parar() deja de programar', async () => {
  const reloj = relojFalso();
  const m = montar({ reloj });
  const r = await m.p.ahora();
  assert.equal(r.estado, 'ok');
  assert.equal(m.s.cuando(T0).length, 6, 'a las 10:05, sin esperar a las 10:20');
  m.p.arrancar();
  await reloj.espera();
  m.p.parar();
  const e = reloj.esperas.shift();
  reloj.t += e.ms;
  e.ok();
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(reloj.esperas.length, 0, 'parado: no vuelve a esperar');
  assert.equal(m.s.cuando(en(10, 20)).length, 0);
});

// ---------- estado.json y SavedVariables ----------

test('estado: la identidad, las casas conocidas, los desde y el seq se guardan en <datos>\\comercio\\estado.json', async () => {
  const carpeta = carpetaTemporal();
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  assert.equal(e.enUso(), null);
  assert.equal(e.ponerIdentidad({ region: 'US', reino: 'Normal', faccion: 'Horde' }), true);
  assert.equal(e.ponerIdentidad({ region: 'us', reino: 'Normal', faccion: 'Horde' }), false, 'la misma');
  assert.equal(e.ponerIdentidad({ region: 'XX', reino: 'Normal', faccion: 'Horde' }), false, 'región que no existe');
  assert.equal(e.ponerIdentidad({ region: 'US', reino: '', faccion: 'Horde' }), false);
  e.aprender('Normal', 'Horde', 113);
  e.ponerDesde('us', 113, { subastas: 'a', mercancias: 'b' });
  // F7: sin casa supuesta, solo la descubierta (ni la 111 ni la 117 se suponen)
  assert.deepEqual(e.enUso(), { region: 'us', casas: [113] });
  const seq1 = e.siguienteSeq(1_000_000);
  assert.equal(seq1, 1000);
  assert.equal(e.siguienteSeq(1_000_000), 1001, 'siempre crece');
  await e.guardar();
  const j = JSON.parse(readFileSync(join(carpeta, 'estado.json'), 'utf8'));
  assert.deepEqual(j.identidad, { region: 'us', reino: 'Normal', faccion: 'Horde' });
  assert.deepEqual(j.casas, [113]);
  const otra = crearEstadoComercio({ fs: nodeFs, carpeta });
  assert.deepEqual(otra.identidad(), { region: 'us', reino: 'Normal', faccion: 'Horde' });
  assert.deepEqual(otra.conocidas(), { 'Normal|Horde': 113 });
  assert.deepEqual(otra.desde('us', 113), { subastas: 'a', mercancias: 'b' });
  assert.equal(otra.siguienteSeq(0), 1002);
});

test('estado: con personajes en otro tipo de reino se añaden sus casas', () => {
  const e = conTresCasas(crearEstadoComercio({ fs: nodeFs, carpeta: carpetaTemporal() }));
  e.aprender('Raro', 'Horde', 120);
  e.ponerIdentidad({ region: 'US', reino: 'Raro', faccion: 'Horde' });
  e.ponerIdentidad({ region: 'US', reino: 'Normal', faccion: 'Alliance' });
  // F7: en Normal, la Alianza (con personajes) y la neutral; la Horda de Normal no tiene personajes. En Raro, la Horda.
  assert.deepEqual(e.enUso(), { region: 'us', casas: [111, 117, 120] });
});

test('estado: un estado.json roto se aparta (no se borra) y se empieza de cero', () => {
  const carpeta = carpetaTemporal();
  writeFileSync(join(carpeta, 'estado.json'), '{roto');
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  assert.equal(e.identidad(), null);
  assert.ok(readdirSync(carpeta).some((n) => n.startsWith('estado.json.roto-')));
});

test('estado: alLeerCuenta toma la identidad y deja el escaneo para descubrir solo si su casa no se conoce', () => {
  const e = crearEstadoComercio({ fs: nodeFs, carpeta: carpetaTemporal() });
  const escaneo = { hora: 100, identidad: HORDA, muestras: { 2589: { 100: 5 } } };
  assert.deepEqual(e.alLeerCuenta({ identidad: HORDA, escaneo }), {
    identidadCambiada: true, casasCambiadas: false, escaneosNuevos: [{ clave: 'Normal|Horde', faccion: 'Horde' }],
  });
  assert.equal(e.porDescubrir().hora, 100);
  e.descubierto(e.porDescubrir());
  assert.equal(e.porDescubrir(), null);
  assert.deepEqual(e.alLeerCuenta({ identidad: HORDA, escaneo }), { identidadCambiada: false, casasCambiadas: false, escaneosNuevos: [] });
  assert.equal(e.porDescubrir(), null, 'el mismo escaneo no se vuelve a probar');
  e.aprender('Normal', 'Horde', 114);
  e.alLeerCuenta({ identidad: HORDA, escaneo: { ...escaneo, hora: 200 } });
  assert.equal(e.porDescubrir(), null, 'la casa ya se conoce');
});

test('leerCuentas: identidad y último escaneo de SnetForeverCuenta.comercio (el archivo más reciente manda)', () => {
  const raiz = carpetaTemporal();
  const sv = (cuenta) => {
    const d = join(raiz, 'WTF', 'Account', cuenta, 'SavedVariables');
    mkdirSync(d, { recursive: true });
    return join(d, 'SnetForever.lua');
  };
  writeFileSync(sv('VIEJA'), 'SnetForeverCuenta = {\n["comercio"] = {\n["identidad"] = {["region"] = "EU", ["reino"] = "Normal", ["faccion"] = "Alliance"},\n},\n}\n');
  const nueva = sv('NUEVA');
  writeFileSync(nueva, [
    'SnetForeverCuenta = {',
    '["fallos"] = {},',
    '["comercio"] = {',
    '["identidad"] = {["region"] = "US", ["reino"] = "Normal", ["faccion"] = "Horde"},',
    '["ultimoEscaneo"] = {["hora"] = 1763000000, ["identidad"] = {["region"] = "US", ["reino"] = "Normal", ["faccion"] = "Horde"},',
    '  ["muestras"] = {[2589] = {[100] = 5, [120] = 7}, [2592] = {[1] = 3}}},',
    '},',
    '}',
  ].join('\n'));
  const ahora = Date.now() / 1000;
  nodeFs.utimesSync(join(raiz, 'WTF', 'Account', 'VIEJA', 'SavedVariables', 'SnetForever.lua'), ahora - 3600, ahora - 3600);
  nodeFs.utimesSync(nueva, ahora, ahora);
  const r = leerCuentas(raiz, { fs: nodeFs });
  assert.deepEqual(r.identidad, { region: 'us', reino: 'Normal', faccion: 'Horde' });
  assert.equal(r.escaneo.hora, 1763000000);
  assert.deepEqual(r.escaneo.muestras, { 2589: { 100: 5, 120: 7 }, 2592: { 1: 3 } });
  assert.equal(leerCuentas(join(raiz, 'no-hay'), { fs: nodeFs }), null);
});

// ---------- Arrancar con Windows ----------

test('inicio.mjs: pregunta y cambia el acceso directo con inicio.ps1 (estado, crear con el .vbs, quitar a la cuarentena)', async () => {
  const llamadas = [];
  let activo = false;
  const ejecutarPs = async (args) => {
    llamadas.push(args);
    if (args[1] === 'crear') activo = true;
    if (args[1] === 'quitar') activo = false;
    return `${JSON.stringify({ activo })}\n`;
  };
  assert.deepEqual(await arranqueConWindows({ ejecutarPs }), { activo: false });
  assert.deepEqual(llamadas[0], ['-Accion', 'estado']);
  assert.deepEqual(await ponerArranqueConWindows(true, { vbs: 'C:\\SF\\SnetForever.vbs', icono: 'C:\\SF\\snetforever.ico', ejecutarPs }), { activo: true });
  assert.deepEqual(llamadas[1], ['-Accion', 'crear', '-Vbs', 'C:\\SF\\SnetForever.vbs', '-Icono', 'C:\\SF\\snetforever.ico']);
  let pedida = 0;
  await ponerArranqueConWindows(false, { cuarentena: () => { pedida += 1; return 'C:\\cuarentena\\x'; }, ejecutarPs });
  assert.equal(pedida, 1);
  assert.deepEqual(llamadas[2], ['-Accion', 'estado']);
  assert.deepEqual(llamadas[3], ['-Accion', 'quitar', '-Cuarentena', 'C:\\cuarentena\\x']);
  assert.deepEqual(await ponerArranqueConWindows(false, { cuarentena: () => { pedida += 1; return 'y'; }, ejecutarPs }), { activo: false });
  assert.equal(pedida, 1, 'sin acceso directo no hace falta cuarentena');
  await assert.rejects(() => arranqueConWindows({ ejecutarPs: async () => 'no es json' }));
});

test('inicio.ps1 de verdad (en una carpeta de prueba): crea el .lnk a wscript con el .vbs, lo ve y lo quita moviéndolo a la cuarentena', { skip: process.platform !== 'win32' }, () => {
  const base = carpetaTemporal();
  const carpeta = join(base, 'Inicio');
  const cuarentena = join(base, 'cuarentena');
  mkdirSync(carpeta);
  mkdirSync(cuarentena);
  const vbs = join(base, 'SnetForever.vbs');
  writeFileSync(vbs, "' vacío\n");
  const ps = (...args) => {
    const r = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_INICIO, '-Carpeta', carpeta, ...args], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  assert.deepEqual(ps('-Accion', 'estado'), { activo: false });
  assert.deepEqual(ps('-Accion', 'crear', '-Vbs', vbs), { activo: true });
  assert.ok(existsSync(join(carpeta, 'SnetForever.lnk')));
  assert.deepEqual(ps('-Accion', 'estado'), { activo: true });
  assert.deepEqual(ps('-Accion', 'quitar', '-Cuarentena', cuarentena), { activo: false });
  assert.ok(!existsSync(join(carpeta, 'SnetForever.lnk')));
  assert.ok(existsSync(join(cuarentena, 'SnetForever.lnk')), 'se mueve, no se borra');
});

// ---------- arreglo final (tercera ronda): casa con el historial ocupado ----------

test('arreglo final: una casa con el historial ocupado se salta sin bajar nada (un aviso por racha) y vuelve cuando se libera', async () => {
  const historial = historialFalso();
  let ocupada = 'EBUSY';
  historial.ocupada = (casa) => (casa === 114 ? ocupada : null);
  const m = montar({ historial });
  await m.p.ahora();
  assert.deepEqual([...new Set(m.s.llamadas.map((l) => l.casa))], [111, 117], 'la 114 no se pide');
  await m.p.ahora();
  assert.equal(m.s.llamadas.filter((l) => l.casa === 114).length, 0);
  const avisos = m.registros.filter((r) => r.nivel === 'aviso' && r.texto.includes('114') && r.texto.includes('EBUSY'));
  assert.equal(avisos.length, 1, JSON.stringify(m.registros));
  ocupada = null;
  await m.p.ahora();
  assert.ok(m.s.llamadas.some((l) => l.casa === 114), 'liberada, se pide');
  assert.ok(m.historial.fotos.some((f) => f.casa === 114));
});

// En el juego el reino se llama como en WoW Forever («CAMWOW US1 Realm 5 PvE», visto el 14-nov), no «Normal»: no hay
// casa supuesta. Sin ninguna casa en uso la ronda tiene que probar igualmente a descubrirla con el escaneo del jugador.
test('un reino sin casa supuesta (el nombre real de Forever): la ronda descubre la casa con el escaneo y la siguiente ya la baja', async () => {
  const reloj = relojFalso();
  const carpeta = carpetaTemporal();
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  const FOREVER = { region: 'US', reino: 'CAMWOW US1 Realm 5 PvE', faccion: 'Horde' };
  e.alLeerCuenta({
    identidad: FOREVER,
    escaneo: { hora: en(9, 50) / 1000, identidad: FOREVER, muestras: { 2592: { 174: 176, 175: 201, 178: 104, 184: 60 } } },
  });
  assert.deepEqual(e.enUso().casas, [], 'sin casa supuesta para ese reino');
  const lista = (casa) => (casa === 114
    ? [subasta('a', 2592, 174, 176), subasta('b', 2592, 175, 201), subasta('c', 2592, 178, 104), subasta('d', 2592, 184, 60)]
    : [subasta('x', 2592, 170, 9), subasta('y', 2592, 999, 1)]);
  const s = servidor(reloj, {
    trucos: (tipo, casa, srv) => {
      const ultima = srv.llamadas.at(-1);
      if (ultima.desde) return () => ({ estado: 'igual' });
      return () => ({ estado: 'nueva', hora: texto(en(10, 21)), subastas: lista(casa) });
    },
  });
  const m = montar({ reloj, cliente: s, estado: e });
  m.p.arrancar();
  await reloj.pasar(); // 10:20
  assert.deepEqual(s.cuando(en(10, 20)).map((l) => `${l.tipo}:${l.casa}`), [113, 114, 115, 120, 124].map((c) => `mercancias:${c}`));
  assert.deepEqual(e.conocidas(), { 'CAMWOW US1 Realm 5 PvE|Horde': 114 });
  assert.deepEqual(e.enUso().casas, [114]);
  await reloj.pasar(); // la siguiente vuelta ya baja la casa 114
  assert.ok(s.llamadas.some((l) => l.tipo === 'subastas' && l.casa === 114), 'ya se baja la casa descubierta');
  m.p.parar();
});
