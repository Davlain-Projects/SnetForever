// F7: la app sigue también la casa NEUTRAL (decidido por el jugador), y en general cada casa que el jugador usa: la de
// cada facción en la que tiene personajes más la neutral. Cada casa con su historial, su última foto y su sitio en las
// ranuras; ninguna se mezcla con otra. Ninguna casa se baja por suposición: solo las descubiertas (con el escaneo del
// juego) o ya conocidas. Con un reloj falso, un servidor falso y carpetas temporales: nada de red ni de datos de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import * as nodeFs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearProgramadorComercio, ESPACIO_CASAS_MS, MAX_CASAS_RANURA } from '../src/comercio/programador.mjs';
import { crearEstadoComercio, leerCuentas } from '../src/comercio/estado.mjs';
import { crearHistorial, HORAS_GUARDADAS } from '../src/comercio/historial.mjs';
import { fuenteDeComercio, construirComercio } from '../src/comercio/ia.mjs';
import { tocPrecios, ranuraDeHora, nombreRanuraPrecios } from '../src/comercio/precios-lua.mjs';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.UTC(2026, 10, 13, 10, 5); // 13-nov-2026 10:05 UTC
const en = (hh, mm, ss = 0) => Date.UTC(2026, 10, 13, hh, mm, ss);
const texto = (ms) => new Date(ms).toUTCString();
const carpetaTemporal = () => mkdtempSync(join(tmpdir(), 'snf-f7-'));

const hasta = async (cond, ms = 5000) => {
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
  r.pasar = async () => {
    await hasta(() => r.esperas.length > 0);
    const e = r.esperas.shift();
    r.t += e.ms;
    e.ok();
    await hasta(() => r.esperas.length > 0);
  };
  return r;
}

const HORDA = { region: 'US', reino: 'Normal', faccion: 'Horde' };
const ALIANZA = { region: 'US', reino: 'Normal', faccion: 'Alliance' };
// El precio de la barra de hierro en cada casa: así se ve si algo de una casa sale en otra.
const PRECIO = { 114: 100, 117: 300, 111: 500, 120: 700 };
const VENDEDOR = 'Fulanito';

// Un servidor falso de Blizzard: la foto cambia cada hora a las hh:20 (justo cuando pregunta el programador); con `desde` igual o posterior, 304 («igual»).
// Cada subasta lleva un id numérico distinto por casa, hora y tipo, y un vendedor (que nunca debe guardarse).
function servidor(reloj) {
  const s = { llamadas: [] };
  const foto = (t) => {
    const h0 = Math.floor(t / H) * H;
    return t >= h0 + 20 * MIN ? h0 + 20 * MIN : h0 - H + 20 * MIN;
  };
  s.id = (casa, f, tipo) => casa * 1e9 + (Math.floor(f / H) % 1e6) * 10 + (tipo === 'subastas' ? 1 : 2);
  const responder = (tipo) => async (casa, { desde } = {}) => {
    s.llamadas.push({ t: reloj.t, tipo, casa, desde });
    const f = foto(reloj.t);
    if (desde && Date.parse(desde) >= f) return { estado: 'igual' };
    const lista = [{ id: s.id(casa, f, tipo), item: 2589, cantidad: 5, precio: PRECIO[casa] ?? 1, tiempo: 'LONG', vendedor: VENDEDOR, owner: VENDEDOR }];
    return { estado: 'nueva', hora: texto(f), subastas: lista };
  };
  s.subastas = responder('subastas');
  s.mercancias = responder('mercancias');
  s.objeto = async () => null;
  s.casasEn = (t) => [...new Set(s.llamadas.filter((l) => l.t === t).map((l) => l.casa))];
  return s;
}

function catalogoFalso() {
  return {
    completar: async () => ({ pedidos: 0, pendientes: 0 }),
    grupos: () => [],
    ficha: (id) => (id === 2589 ? { id, nombre: 'Barra de hierro' } : null),
  };
}

// El estado con las casas de Normal ya descubiertas (114, 117 y 111) y el personaje de la Horda en uso.
function estadoNormal({ carpeta = carpetaTemporal(), identidad = HORDA } = {}) {
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  e.aprender('Normal', 'Horde', 114);
  e.aprender('Normal', 'Neutral', 117);
  e.aprender('Normal', 'Alliance', 111);
  e.ponerIdentidad(identidad);
  return e;
}

function montar({ reloj = relojFalso(), estado, historial, espacio, escribir, cliente, catalogo = catalogoFalso() } = {}) {
  const s = cliente ?? servidor(reloj);
  const escritos = [];
  const registros = [];
  const p = crearProgramadorComercio({
    cliente: () => s,
    historial,
    catalogo,
    casas: estado,
    escribir: escribir ?? (async (textos, { generado }) => { escritos.push({ textos, generado }); }),
    reloj: reloj.ahora,
    dormir: reloj.dormir,
    registrar: (nivel, t) => registros.push({ nivel, texto: t }),
    ...(espacio === undefined ? {} : { espacio }),
  });
  return { p, s, reloj, escritos, registros };
}

// Las filas de cada casa de una ranura: {casa: {item: 'fila'}} (de las líneas «c=Q[casa]» y «c[item]={…}»).
function filasDeRanura(textos) {
  const salida = {};
  let casa = null;
  for (const linea of textos.join('\n').split('\n')) {
    const q = /^c=Q\[(\d+)\]$/.exec(linea);
    if (q) {
      casa = q[1];
      salida[casa] ||= {};
      continue;
    }
    const f = /^c\[(\d+)\]=\{([^}]*)\}$/.exec(linea);
    if (f) salida[casa][f[1]] = f[2];
  }
  return salida;
}

const dobleLE = (n) => {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(n);
  return b;
};

// ---------- el programador ----------

test('el programador baja la casa de la facción y la neutral cada hora, espaciadas, y cada una va a su historial', async () => {
  assert.ok(ESPACIO_CASAS_MS >= 10_000, 'un respiro de verdad entre casa y casa');
  const reloj = relojFalso();
  const carpeta = carpetaTemporal();
  const historial = crearHistorial({ fs: nodeFs, carpeta });
  const e = estadoNormal({ carpeta });
  const m = montar({ reloj, estado: e, historial });
  m.p.arrancar();
  while (reloj.t < en(10, 20, 30)) await reloj.pasar();
  // La Horda primero y, tras el respiro, la neutral. La de la Alianza es conocida pero no tiene personajes: no se baja.
  assert.deepEqual(m.s.casasEn(en(10, 20)), [114]);
  assert.deepEqual(m.s.casasEn(en(10, 20) + ESPACIO_CASAS_MS), [117]);
  await hasta(() => m.escritos.length === 1);
  assert.ok(!m.s.llamadas.some((l) => l.casa === 111), 'sin personajes de la Alianza, su casa no se baja');
  // Cada casa en su archivo y con sus precios.
  assert.ok(existsSync(join(carpeta, 'historial-114.bin')));
  assert.ok(existsSync(join(carpeta, 'historial-117.bin')));
  assert.equal(historial.todos(114).get(2589).precio, 100);
  assert.equal(historial.todos(117).get(2589).precio, 300);
  assert.equal(historial.todos(111).size, 0);
  // Al entrar con un personaje de la Alianza, su casa se baja también desde la hora siguiente (la propia, primero).
  e.ponerIdentidad(ALIANZA);
  while (reloj.t < en(11, 21)) await reloj.pasar();
  assert.deepEqual(m.s.casasEn(en(11, 20)), [111]);
  assert.deepEqual(m.s.casasEn(en(11, 20) + ESPACIO_CASAS_MS), [114]);
  assert.deepEqual(m.s.casasEn(en(11, 20) + 2 * ESPACIO_CASAS_MS), [117]);
  await hasta(() => m.escritos.length === 2);
  assert.equal(historial.todos(111).get(2589).precio, 500);
  assert.equal(historial.todos(114).get(2589).precio, 100, 'la Horda no se toca');
  m.p.parar();
});

test('las casas que se siguen: solo las de facciones con personajes y la neutral, y nunca una supuesta', () => {
  const e = crearEstadoComercio({ fs: nodeFs, carpeta: carpetaTemporal() });
  e.ponerIdentidad(HORDA);
  assert.deepEqual(e.enUso(), { region: 'us', casas: [] }, 'sin nada descubierto no se supone ninguna casa');
  e.aprender('Normal', 'Alliance', 111);
  assert.deepEqual(e.enUso().casas, [], 'la Alianza es conocida, pero sin personajes de la Alianza no se baja');
  e.aprender('Normal', 'Horde', 114);
  assert.deepEqual(e.enUso().casas, [114]);
  e.aprender('Normal', 'Neutral', 117);
  assert.deepEqual(e.enUso().casas, [114, 117]);
  e.ponerIdentidad(ALIANZA);
  assert.deepEqual(e.enUso().casas, [111, 114, 117], 'con un personaje de la Alianza, las tres; la del personaje en uso, primero');
  e.ponerIdentidad(HORDA);
  assert.deepEqual(e.enUso().casas, [114, 111, 117], 'la Alianza ya tiene personajes: se sigue');
});

// ---------- el historial ----------

test('un historial viejo de la Horda se sigue leyendo igual y la neutral empieza vacía', async () => {
  const carpeta = carpetaTemporal();
  // La app de antes: solo la Horda, con su historial y su estado.json (versión 1, sin las facciones con personajes).
  const viejo = crearHistorial({ fs: nodeFs, carpeta });
  const hora = Math.floor(en(8, 21) / 1000);
  for (let k = 0; k < 3; k++) {
    viejo.anadirFoto(114, hora + k * 3600, [{ id: 10 + k, item: 2589, cantidad: 5, precio: 100 + k, tiempo: 'LONG' }],
      [{ id: 20 + k, item: 2592, cantidad: 50, precio: 30, tiempo: 'LONG' }]);
  }
  await viejo.guardar(114);
  const antes = viejo.todos(114);
  writeFileSync(join(carpeta, 'estado.json'), JSON.stringify({
    version: 1, identidad: { region: 'us', reino: 'Normal', faccion: 'Horde' }, vistas: { 'us|Normal': 'Horde' },
    conocidas: { 'Normal|Horde': 114 }, desde: {}, seq: 5, escaneoProbado: 0, casas: [114],
  }));
  // La app nueva lo lee igual: la misma Horda, la neutral vacía (aún sin descubrir, no se baja).
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  assert.deepEqual(e.enUso(), { region: 'us', casas: [114] });
  const nuevo = crearHistorial({ fs: nodeFs, carpeta });
  assert.deepEqual(nuevo.todos(114), antes);
  assert.equal(nuevo.todos(117).size, 0);
  assert.equal(nuevo.tieneDatos(117), false);
  // Descubierta la neutral, se sigue también; su primera foto no cambia nada de la Horda.
  e.aprender('Normal', 'Neutral', 117);
  assert.deepEqual(e.enUso().casas, [114, 117]);
  nuevo.anadirFoto(117, hora + 3 * 3600, [{ id: 99, item: 2589, cantidad: 1, precio: 300, tiempo: 'LONG' }], []);
  await nuevo.guardar(117);
  assert.deepEqual(nuevo.todos(114), antes);
  assert.equal(nuevo.todos(117).get(2589).precio, 300);
  assert.equal(e.siguienteSeq(0), 6, 'el seq sigue donde estaba');
});

test('cada casa guarda solo sus 168 horas, también con dos casas', () => {
  const historial = crearHistorial({ fs: nodeFs, carpeta: carpetaTemporal() });
  const inicio = Math.floor(en(0, 21) / 1000);
  // La Horda tiene un objeto que solo estuvo al principio; la neutral, uno que solo está al final.
  historial.anadirFoto(114, inicio, [{ id: 1, item: 4000, cantidad: 1, precio: 50, tiempo: 'LONG' }], []);
  for (let k = 1; k <= HORAS_GUARDADAS + 2; k++) {
    historial.anadirFoto(114, inicio + k * 3600, [{ id: 100 + k, item: 2589, cantidad: 1, precio: 100, tiempo: 'LONG' }], []);
  }
  historial.anadirFoto(117, inicio + (HORAS_GUARDADAS + 2) * 3600, [{ id: 7, item: 4000, cantidad: 1, precio: 60, tiempo: 'LONG' }], []);
  assert.equal(historial.todos(114).has(4000), false, 'lo de hace más de 168 h se olvida en la Horda');
  assert.equal(historial.todos(117).get(4000).precio, 60, 'y la neutral, con su propia hora, no pierde lo suyo');
  assert.equal(historial.todos(117).has(2589), false, 'nada de la Horda en la neutral');
});

// ---------- las ranuras ----------

function historialPorCasa(precios) {
  const casas = new Map(Object.entries(precios).map(([c, p]) => [Number(c), new Map([[2589, {
    precio: p, cantidad: 5, subastas: 1, normal: p, poco: true, tendencia: null, ritmo: null, vendidosDia: null, hora: 1,
  }]])]));
  return {
    anadirFoto: () => true,
    guardar: async () => {},
    todos: (casa) => casas.get(casa) ?? new Map(),
    tieneDatos: (casa) => casas.has(casa),
    casas,
  };
}

test('las ranuras llevan las dos casas y nunca se mezclan', async () => {
  const e = estadoNormal();
  const historial = historialPorCasa({ 114: 100, 117: 300, 111: 500 });
  const m = montar({ estado: e, historial, espacio: 0 });
  await m.p.ahora();
  assert.equal(m.escritos.length, 1);
  const filas = filasDeRanura(m.escritos[0].textos);
  assert.deepEqual(Object.keys(filas).sort(), ['114', '117'], 'la Alianza (sin personajes) no va');
  assert.match(filas[114][2589], /^100,/);
  assert.match(filas[117][2589], /^300,/);
  const p1 = m.escritos[0].textos[0];
  assert.ok(p1.includes('["Normal|Horde"] = 114') && p1.includes('["Normal|Neutral"] = 117'), 'el addon sabe qué casa es cada una');
});

test(`las ranuras llevan como mucho ${MAX_CASAS_RANURA} casas: la propia y la neutral siempre, las demás si caben`, async () => {
  assert.equal(MAX_CASAS_RANURA, 3);
  // Cuatro casas en uso: Normal (Horda, Alianza y neutral) y la Horda de otro tipo de reino.
  const e = estadoNormal();
  e.aprender('Raro', 'Horde', 120);
  e.ponerIdentidad({ region: 'US', reino: 'Raro', faccion: 'Horde' });
  e.ponerIdentidad(ALIANZA);
  e.ponerIdentidad(HORDA);
  assert.deepEqual(e.enUso().casas, [114, 111, 117, 120]);
  const m = montar({ estado: e, historial: historialPorCasa({ 114: 100, 117: 300, 111: 500, 120: 700 }), espacio: 0 });
  await m.p.ahora();
  assert.deepEqual(Object.keys(filasDeRanura(m.escritos[0].textos)).sort(), ['111', '114', '117']);
  assert.ok(m.registros.some((r) => /120/.test(r.texto) && /ranura/.test(r.texto)), JSON.stringify(m.registros));

  // Si no cabe la de la Alianza (demasiados objetos), van la propia y la neutral.
  const grande = historialPorCasa({ 114: 100, 117: 300 });
  grande.casas.set(111, new Map(Array.from({ length: 60000 }, (_, i) => [1 + i, {
    precio: 123456 + i, cantidad: 12, subastas: 4, normal: 123456, poco: false, tendencia: 1.5, ritmo: 0.25, vendidosDia: 3.5, hora: 1,
  }])));
  const e2 = estadoNormal();
  e2.ponerIdentidad(ALIANZA);
  e2.ponerIdentidad(HORDA);
  const m2 = montar({ estado: e2, historial: grande, espacio: 0 });
  await m2.p.ahora();
  assert.deepEqual(Object.keys(filasDeRanura(m2.escritos[0].textos)).sort(), ['114', '117']);
  assert.ok(m2.registros.some((r) => /111/.test(r.texto) && /no caben/.test(r.texto)), JSON.stringify(m2.registros));
});

test('ni vendedores ni identificadores fuera de la última foto de cada casa', async () => {
  const reloj = relojFalso();
  const carpeta = carpetaTemporal();
  const historial = crearHistorial({ fs: nodeFs, carpeta });
  const e = estadoNormal({ carpeta });
  const m = montar({ reloj, estado: e, historial });
  m.p.arrancar();
  while (reloj.t < en(11, 20, 30)) await reloj.pasar();
  await hasta(() => m.escritos.length === 2);
  m.p.parar();
  await historial.guardar(114);
  await historial.guardar(117);
  const ids = (casa, hh) => ['subastas', 'mercancias'].map((t) => m.s.id(casa, en(hh, 20), t));
  // Las ranuras (lo que sale del PC hacia el juego): ni vendedor ni ningún id de subasta.
  for (const { textos } of m.escritos) {
    const t = textos.join('');
    assert.ok(!t.includes(VENDEDOR));
    for (const casa of [114, 117]) for (const hh of [10, 11]) for (const id of ids(casa, hh)) assert.ok(!t.includes(String(id)), `id ${id} en la ranura`);
  }
  // El estado tampoco.
  const estadoTexto = readFileSync(join(carpeta, 'estado.json'), 'utf8');
  assert.ok(!estadoTexto.includes(VENDEDOR));
  // Cada historial: sin vendedor; los ids, solo los de su última foto, y nunca los de la otra casa.
  for (const [casa, otra] of [[114, 117], [117, 114]]) {
    const bin = gunzipSync(readFileSync(join(carpeta, `historial-${casa}.bin`)));
    assert.equal(bin.indexOf(Buffer.from(VENDEDOR)), -1, `vendedor en el historial de ${casa}`);
    for (const id of ids(casa, 11)) assert.notEqual(bin.indexOf(dobleLE(id)), -1, `la última foto de ${casa} guarda su id ${id}`);
    for (const id of ids(casa, 10)) assert.equal(bin.indexOf(dobleLE(id)), -1, `el id viejo ${id} sigue en ${casa}`);
    for (const id of [...ids(otra, 10), ...ids(otra, 11)]) assert.equal(bin.indexOf(dobleLE(id)), -1, `un id de ${otra} en ${casa}`);
  }
  assert.deepEqual(readdirSync(carpeta).filter((n) => n.startsWith('historial-')).sort(), ['historial-114.bin', 'historial-117.bin']);
});

// ---------- descubrir cada casa con el escaneo del juego ----------

test('un escaneo de la subasta neutral descubre la casa neutral entre sus 5 candidatas, sin tocar la de la facción', async () => {
  const reloj = relojFalso();
  const carpeta = carpetaTemporal();
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  e.aprender('Normal', 'Horde', 114);
  const NEUTRAL = { ...HORDA, faccion: 'Neutral' };
  e.alLeerCuenta({
    identidad: HORDA,
    escaneos: [{ hora: en(9, 50) / 1000, identidad: NEUTRAL, jugador: 'Horde', muestras: { 2589: { 100: 5, 110: 3, 120: 7, 130: 1 } } }],
  });
  assert.deepEqual(e.enUso().casas, [114]);
  const s = servidor(reloj);
  const deVerdad = s.mercancias;
  s.mercancias = async (casa, op) => {
    if (op?.desde || casa === 114) return deVerdad(casa, op);
    s.llamadas.push({ t: reloj.t, tipo: 'mercancias', casa });
    const lista = casa === 121
      ? [[100, 5], [110, 3], [120, 7], [130, 1]].map(([precio, cantidad], k) => ({ id: k + 1, item: 2589, cantidad, precio, tiempo: 'LONG' }))
      : [{ id: 9, item: 2589, cantidad: 9, precio: 100, tiempo: 'LONG' }];
    return { estado: 'nueva', hora: texto(en(10, 21)), subastas: lista };
  };
  const m = montar({ reloj, estado: e, historial: historialPorCasa({ 114: 100 }), espacio: 0, cliente: s });
  await m.p.ahora();
  assert.deepEqual(e.conocidas(), { 'Normal|Horde': 114, 'Normal|Neutral': 121 });
  assert.deepEqual(e.enUso().casas, [114, 121]);
  const guardado = JSON.parse(readFileSync(join(carpeta, 'estado.json'), 'utf8'));
  assert.equal(guardado.conocidas['Normal|Neutral'], 121);
});

test('leerCuentas: lee los escaneos de cada subasta (con la facción de su subastador) y alLeerCuenta los deja para descubrir', () => {
  const raiz = carpetaTemporal();
  const d = join(raiz, 'WTF', 'Account', 'CUENTA', 'SavedVariables');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'SnetForever.lua'), [
    'SnetForeverCuenta = {',
    '["comercio"] = {',
    '["identidad"] = {["region"] = "US", ["reino"] = "Normal", ["faccion"] = "Horde"},',
    '["escaneos"] = {',
    '  ["Neutral"] = {["hora"] = 1763000100, ["jugador"] = "Horde", ["identidad"] = {["region"] = "US", ["reino"] = "Normal", ["faccion"] = "Neutral"},',
    '    ["muestras"] = {[2589] = {[100] = 5}}},',
    '  ["Alliance"] = {["hora"] = 1763000200, ["jugador"] = "Alliance", ["identidad"] = {["region"] = "US", ["reino"] = "Normal", ["faccion"] = "Alliance"},',
    '    ["muestras"] = {[2592] = {[30] = 50}}},',
    '},',
    '},',
    '}',
  ].join('\n'));
  const r = leerCuentas(raiz, { fs: nodeFs });
  assert.deepEqual(r.escaneos.map((x) => x.identidad.faccion).sort(), ['Alliance', 'Neutral']);
  const e = crearEstadoComercio({ fs: nodeFs, carpeta: carpetaTemporal() });
  e.aprender('Normal', 'Alliance', 111);
  const { casasCambiadas } = e.alLeerCuenta(r);
  assert.equal(casasCambiadas, true, 'el escaneo de la Alianza dice que hay un personaje de la Alianza');
  assert.deepEqual(e.enUso().casas, [111], 'la Alianza (con personaje y descubierta); la Horda y la neutral, aún sin descubrir');
  const pendientes = [];
  for (let esc = e.porDescubrir(); esc; esc = e.porDescubrir()) {
    pendientes.push(esc.identidad.faccion);
    e.descubierto(esc);
  }
  assert.deepEqual(pendientes, ['Neutral'], 'solo falta la neutral (la Alianza ya se conoce)');
});

// ---------- la IA ----------

test('la IA recibe los precios de la casa de la subasta abierta y sabe de qué casa son; sin datos de la neutral, nada de la Horda', () => {
  const historial = historialPorCasa({ 114: 100, 117: 300 });
  const catalogo = catalogoFalso();
  const estado = { identidad: () => ({ region: 'us', reino: 'Normal', faccion: 'Horde' }), conocidas: () => ({ 'Normal|Horde': 114, 'Normal|Neutral': 117 }) };
  const mensaje = (comercio) => ({ ctx: { pj: { faccion: 'Horde' }, ...(comercio ? { comercio } : {}) } });
  // Cerrada: la de su facción.
  const cerrada = fuenteDeComercio({ estado, historial, catalogo, mensaje: mensaje() });
  assert.equal(cerrada.casa, 114);
  assert.equal(cerrada.bando, 'Horde');
  // En la neutral: la neutral, aunque el personaje sea de la Horda.
  const neutral = fuenteDeComercio({ estado, historial, catalogo, mensaje: mensaje({ casa: 117, faccion: 'Neutral' }) });
  assert.equal(neutral.casa, 117);
  assert.equal(neutral.bando, 'Neutral');
  const datos = construirComercio({ ...neutral, inventarioIds: [2589] });
  assert.equal(datos.casa, 117);
  assert.equal(datos.bando, 'Neutral');
  assert.equal(datos.objetos[0].precio, 300);
  assert.deepEqual(datos.bandos, { 114: 'Horde' }, 'otrasCasas va con el bando de cada casa');
  // La neutral abierta sin casa conocida (el addon manda la facción pero no la casa): nada, y menos la de la Horda.
  const sinCasa = { ...estado, conocidas: () => ({ 'Normal|Horde': 114 }) };
  assert.equal(fuenteDeComercio({ estado: sinCasa, historial, catalogo, mensaje: mensaje({ faccion: 'Neutral' }) }), null);
  // Conocida pero sin datos todavía: tampoco.
  const sinDatos = historialPorCasa({ 114: 100 });
  assert.equal(fuenteDeComercio({ estado, historial: sinDatos, catalogo, mensaje: mensaje({ casa: 117, faccion: 'Neutral' }) }), null);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1 (revisión): la Horda de una app de antes, descubrir la neutral una sola vez y los grupos de la casa propia.
// ---------------------------------------------------------------------------------------------------

test('ronda 1: un estado de antes con solo la 114 supuesta sigue bajando la 114, la escribe en la ranura y el addon enseña los datos de la Horda', async () => {
  const carpeta = carpetaTemporal();
  // La app instalada antes de F7: la 114 solo por suposición (conocidas vacías), y las tres casas de «Normal» en uso.
  writeFileSync(join(carpeta, 'estado.json'), JSON.stringify({
    version: 1, identidad: { region: 'us', reino: 'Normal', faccion: 'Horde' }, vistas: { 'us|Normal': 'Horde' },
    conocidas: {}, desde: {}, seq: 3, escaneoProbado: 0, casas: [114, 111, 117],
  }));
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  assert.deepEqual(e.conocidas(), { 'Normal|Horde': 114 }, 'la 114 (la comprobada) pasa a descubierta; la 111 y la 117, no');
  assert.deepEqual(e.enUso().casas, [114]);
  // La app baja la 114 a la hora del banco y escribe la ranura.
  const AHORA = 1790000000; // GetServerTime() del banco al empezar
  const HB = Math.floor(AHORA / 3600);
  const reloj = relojFalso((HB * 3600 + 21 * 60) * 1000);
  const m = montar({ reloj, estado: e, historial: crearHistorial({ fs: nodeFs, carpeta }), espacio: 0 });
  await m.p.ahora();
  assert.deepEqual([...new Set(m.s.llamadas.map((l) => l.casa))], [114]);
  assert.equal(m.escritos.length, 1);
  const { textos, generado } = m.escritos[0];
  assert.ok(textos[0].includes('["Normal|Horde"] = 114'), textos[0].slice(0, 300));
  // El addon de verdad (en el banco) carga esa ranura y enseña los datos de la Horda.
  const dir = carpetaTemporal();
  mkdirSync(join(dir, 'SnetForever'));
  const i = ranuraDeHora(generado);
  mkdirSync(join(dir, nombreRanuraPrecios(i)));
  writeFileSync(join(dir, nombreRanuraPrecios(i), `${nombreRanuraPrecios(i)}.toc`), tocPrecios(i));
  textos.forEach((t, k) => writeFileSync(join(dir, nombreRanuraPrecios(i), `p${k + 1}.lua`), t));
  const mq = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' } });
  try {
    mq.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - HB * 3600) + 0.5) * 20)}`);
    mq.lua('SnetForever.Precios.alAbrir()');
    assert.equal(mq.lua('return SnetForever.Precios.casaActual()'), 114);
    assert.equal(mq.lua('return SnetForever.Precios.de(2589).precio'), 100);
  } finally {
    mq.cerrar?.();
  }
});

test('ronda 1: la migración no inventa: ni la 111 ni la 117, ni la 114 sin la Horda o fuera de las casas de antes', () => {
  const viejo = (extra) => {
    const carpeta = carpetaTemporal();
    writeFileSync(join(carpeta, 'estado.json'), JSON.stringify({
      version: 1, identidad: { region: 'us', reino: 'Normal', faccion: 'Horde' }, conocidas: {}, desde: {}, seq: 1, casas: [114], ...extra,
    }));
    return crearEstadoComercio({ fs: nodeFs, carpeta }).conocidas();
  };
  assert.deepEqual(viejo({ identidad: { region: 'us', reino: 'Normal', faccion: 'Alliance' }, casas: [111, 114, 117] }), {});
  assert.deepEqual(viejo({ casas: [111, 117] }), {});
  assert.deepEqual(viejo({ jugadas: { 'us|Normal': ['Horde'] } }), {}, 'un estado de F7 no se migra');
  assert.deepEqual(viejo({ conocidas: { 'Normal|Horde': 113 } }), { 'Normal|Horde': 113 }, 'lo descubierto manda');
});

const escNeutral = (hora, muestras = { 2589: { 777: 3 } }) => ({ hora, identidad: { ...HORDA, faccion: 'Neutral' }, jugador: 'Horde', muestras });
const candidatasPedidas = (s, desde = -Infinity) => s.llamadas
  .filter((l) => l.tipo === 'mercancias' && l.casa !== 114 && !l.desde && l.t >= desde).map((l) => l.casa);

test('ronda 1: si ninguna candidata se parece, la neutral no se vuelve a probar en 24 h (ni con escaneos nuevos ni tras reiniciar) y se apunta una vez', async () => {
  const carpeta = carpetaTemporal();
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  e.aprender('Normal', 'Horde', 114);
  e.ponerIdentidad(HORDA);
  e.alLeerCuenta({ escaneos: [escNeutral(en(9, 50) / 1000)] });
  const reloj = relojFalso(en(10, 5));
  const m = montar({ reloj, estado: e, historial: historialPorCasa({ 114: 100 }), espacio: 0 });
  await m.p.ahora();
  assert.deepEqual(candidatasPedidas(m.s), [116, 117, 118, 121, 125]);
  assert.equal(e.conocidas()['Normal|Neutral'], undefined);
  const aviso = (r) => /Normal\|Neutral/.test(r.texto) && /no se ha podido decidir/.test(r.texto) && /24 h/.test(r.texto);
  assert.equal(m.registros.filter(aviso).length, 1, JSON.stringify(m.registros));
  // Una hora después, con un escaneo nuevo de la neutral: nada.
  e.alLeerCuenta({ escaneos: [escNeutral(en(10, 50) / 1000)] });
  reloj.t = en(11, 5);
  await m.p.ahora();
  assert.equal(candidatasPedidas(m.s).length, 5, 'ni una descarga más');
  assert.equal(m.registros.filter(aviso).length, 1, 'y no se vuelve a apuntar');
  // Tras reiniciar la app (el estado.json lo guarda), tampoco.
  const e2 = crearEstadoComercio({ fs: nodeFs, carpeta });
  e2.alLeerCuenta({ escaneos: [escNeutral(en(11, 50) / 1000)] });
  const m2 = montar({ reloj, estado: e2, historial: historialPorCasa({ 114: 100 }), espacio: 0 });
  reloj.t = en(12, 5);
  await m2.p.ahora();
  assert.deepEqual(candidatasPedidas(m2.s), []);
  // Pasadas 24 h, con un escaneo nuevo, se vuelve a probar.
  e2.alLeerCuenta({ escaneos: [escNeutral(en(10, 50) / 1000 + 25 * 3600)] });
  reloj.t = en(10, 5) + 25 * H;
  await m2.p.ahora();
  assert.deepEqual(candidatasPedidas(m2.s), [116, 117, 118, 121, 125]);
});

test('ronda 1: una descarga de candidatas a medias no tira lo bajado: la ronda siguiente pide solo lo que falta', async () => {
  const reloj = relojFalso();
  const e = crearEstadoComercio({ fs: nodeFs, carpeta: carpetaTemporal() });
  e.aprender('Normal', 'Horde', 114);
  e.ponerIdentidad(HORDA);
  e.alLeerCuenta({ escaneos: [escNeutral(en(9, 50) / 1000, { 2589: { 100: 5, 110: 3, 120: 7, 130: 1 } })] });
  const s = servidor(reloj);
  const deVerdad = s.mercancias;
  let fallo118 = true;
  s.mercancias = async (casa, op) => {
    if (op?.desde || casa === 114) return deVerdad(casa, op);
    s.llamadas.push({ t: reloj.t, tipo: 'mercancias', casa });
    if (casa === 118 && fallo118) {
      fallo118 = false;
      return { estado: 'error', motivo: 'TEMPORAL' };
    }
    const lista = casa === 121
      ? [[100, 5], [110, 3], [120, 7], [130, 1]].map(([precio, cantidad], k) => ({ id: k + 1, item: 2589, cantidad, precio, tiempo: 'LONG' }))
      : [{ id: 9, item: 2589, cantidad: 9, precio: 100, tiempo: 'LONG' }];
    return { estado: 'nueva', hora: texto(en(10, 20)), subastas: lista };
  };
  const m = montar({ reloj, estado: e, historial: historialPorCasa({ 114: 100 }), espacio: 0, cliente: s });
  m.p.arrancar();
  await reloj.pasar(); // 10:20: 116, 117 y la 118, que falla
  assert.deepEqual(candidatasPedidas(m.s), [116, 117, 118]);
  await reloj.pasar(); // 10:22: solo la 118 y las que faltaban
  assert.deepEqual(candidatasPedidas(m.s, en(10, 22)), [118, 121, 125]);
  assert.equal(e.conocidas()['Normal|Neutral'], 121);
  m.p.parar();
});

test('ronda 1: los grupos automáticos salen solo de la casa de la facción del personaje; sin ella descubierta, ninguno', async () => {
  const catalogo = (vistos) => ({
    ...catalogoFalso(),
    grupos: (m) => {
      vistos.push(m.get(2589)?.precio ?? null);
      return m.size ? [{ clave: 'auto:telas', nombre: { es: 'Telas', en: 'Cloth' }, tipo: 'auto', objetos: [...m.keys()] }] : [];
    },
  });
  // Horda: los de la 114.
  const vistosH = [];
  const h = montar({ estado: estadoNormal(), historial: historialPorCasa({ 114: 100, 117: 300 }), espacio: 0, catalogo: catalogo(vistosH) });
  await h.p.ahora();
  assert.deepEqual(vistosH, [100]);
  assert.ok(h.escritos[0].textos[0].includes('auto:telas'));
  // Alianza sin su casa descubierta (se siguen la 114, por un personaje de la Horda, y la neutral): ningún grupo de otra casa.
  const e = crearEstadoComercio({ fs: nodeFs, carpeta: carpetaTemporal() });
  e.aprender('Normal', 'Horde', 114);
  e.aprender('Normal', 'Neutral', 117);
  e.ponerIdentidad(HORDA);
  e.ponerIdentidad(ALIANZA);
  assert.deepEqual(e.enUso().casas, [114, 117]);
  const vistosA = [];
  const a = montar({ estado: e, historial: historialPorCasa({ 114: 100, 117: 300 }), espacio: 0, catalogo: catalogo(vistosA) });
  await a.p.ahora();
  assert.ok(!vistosA.includes(100) && !vistosA.includes(300), JSON.stringify(vistosA));
  assert.ok(!a.escritos[0].textos[0].includes('auto:telas'));
  assert.ok(a.escritos[0].textos[0].includes('grupos = {}'));
});

// ---------------------------------------------------------------------------------------------------
// Ronda 2: con el reino VACÍO del juego (GetRealmName() da "" en Forever; F6b). El reino bueno, con espacios, sale de lo
// guardado o del GUID; solo con el normalizado y sin nada guardado es provisional y no va a la app.
// ---------------------------------------------------------------------------------------------------

const REINO = 'CAMWOW US1 Realm 5 PvE';
const NORMALIZADO = 'CAMWOWUS1Realm5PvE';
const VACIO = { nombreReino: '', reinoNormalizado: '', reinoGuid: '' };
const JUGADOR = { nombre: 'Nombre', apellido: 'Uno', reino: REINO, faccion: 'Horde', clase: 'MAGE', idioma: 'esES' };
const AHORA_BANCO = 1790000000; // GetServerTime() del banco al empezar
const H_BANCO = Math.floor(AHORA_BANCO / 3600);

// Una réplica de la subasta neutral (5 mercancías con dos precios) leída de verdad por el addon en el banco.
function escanearNeutral(m) {
  m.lua(`local r = {}
    for i = 1, 5 do
      r[#r + 1] = {name = "M", itemID = 20000 + i, count = 5, buyoutPrice = 500}
      r[#r + 1] = {name = "M", itemID = 20000 + i, count = 2, buyoutPrice = 260}
    end
    BANCO.ponerSubasta({replica = r})`);
  m.lua('BANCO.ponerNpc(BANCO.guidCriatura(8661), "Subastador")');
  m.lua('BANCO.unidades.npc.faccion = false');
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(4);
  assert.equal(m.lua('return SnetForever.Escaneo.estado()'), 'completo');
  return m.lua('return SnetForeverCuenta.comercio');
}

// La lista de mercancías que da la casa neutral de verdad (la 121): la misma que vio el escaneo.
const mercanciasNeutral = (muestras) => Object.entries(muestras).flatMap(([item, precios]) => Object.entries(precios)
  .map(([precio, cantidad], k) => ({ id: Number(item) * 10 + k, item: Number(item), cantidad, precio: Number(precio), tiempo: 'LONG' })));

// Deja los textos de una ranura en una carpeta AddOns nueva (para crear la máquina del banco después).
function carpetaConRanura({ textos, generado }) {
  const dir = carpetaTemporal();
  mkdirSync(join(dir, 'SnetForever'));
  const i = ranuraDeHora(generado);
  mkdirSync(join(dir, nombreRanuraPrecios(i)));
  writeFileSync(join(dir, nombreRanuraPrecios(i), `${nombreRanuraPrecios(i)}.toc`), tocPrecios(i));
  textos.forEach((t, k) => writeFileSync(join(dir, nombreRanuraPrecios(i), `p${k + 1}.lua`), t));
  return dir;
}
const aMinuto40 = (m) => m.lua(`BANCO.tick = BANCO.tick + ${Math.round((H_BANCO * 3600 + 40 * 60 - AHORA_BANCO + 0.5) * 20)}`);

test('ronda 2: con el reino vacío del juego, la neutral se descubre de punta a punta con el reino con espacios guardado', async () => {
  // El juego: una sesión con el reino bueno (lo guarda como último bueno) y otra con las tres funciones del reino vacías.
  const primera = crearMaquina({ jugador: JUGADOR });
  primera.jugador(VACIO);
  const juego = primera.recargar();
  let cuenta;
  try {
    assert.equal(juego.lua('return (GetRealmName())'), '');
    assert.equal(juego.lua('return SnetForever.Personaje.reino()'), REINO, 'el último bueno, guardado');
    cuenta = escanearNeutral(juego);
  } finally {
    juego.cerrar();
  }
  assert.equal(cuenta.identidad.reino, REINO, 'la identidad va con el reino con espacios');
  assert.equal(cuenta.escaneos.Neutral.identidad.reino, REINO, 'y el escaneo de la neutral, también');
  assert.equal(cuenta.escaneos.Neutral.identidad.faccion, 'Neutral');

  // La app: lee lo guardado, descubre la neutral entre sus 5 candidatas y la baja.
  const e = crearEstadoComercio({ fs: nodeFs, carpeta: carpetaTemporal() });
  e.alLeerCuenta({ identidad: cuenta.identidad, escaneos: Object.values(cuenta.escaneos) });
  assert.equal(e.porDescubrir()?.identidad.reino, REINO);
  const reloj = relojFalso((H_BANCO * 3600 + 21 * 60) * 1000);
  const s = servidor(reloj);
  const deVerdad = s.mercancias;
  const lista = mercanciasNeutral(cuenta.escaneos.Neutral.muestras);
  s.mercancias = async (casa, op) => {
    const r = await deVerdad(casa, op);
    return r.estado === 'nueva' && casa === 121 ? { ...r, subastas: lista } : r;
  };
  const m = montar({ reloj, estado: e, historial: crearHistorial({ fs: nodeFs, carpeta: carpetaTemporal() }), espacio: 0, cliente: s });
  await m.p.ahora(); // descubre
  assert.deepEqual(e.conocidas(), { [`${REINO}|Neutral`]: 121 });
  assert.deepEqual(e.enUso().casas, [121]);
  await m.p.ahora(); // y la baja
  assert.equal(m.escritos.length, 1);
  assert.ok(m.escritos[0].textos[0].includes(`["${REINO}|Neutral"] = 121`), m.escritos[0].textos[0].slice(0, 300));

  // El addon (reino vacío): con solo el normalizado y con solo el del GUID, encuentra la neutral en la ranura.
  const dir = carpetaConRanura(m.escritos[0]);
  for (const reinoDelJuego of [{ reinoNormalizado: NORMALIZADO }, { reinoGuid: REINO }]) {
    const b = crearMaquina({ addonsDir: dir, jugador: { ...JUGADOR, ...VACIO, ...reinoDelJuego } });
    try {
      aMinuto40(b);
      b.lua('BANCO.ponerNpc(BANCO.guidCriatura(8661), "Subastador")');
      b.lua('BANCO.unidades.npc.faccion = false');
      b.disparar('AUCTION_HOUSE_SHOW');
      b.avanzar(0.05);
      assert.equal(b.lua('return SnetForever.Precios.casaActual()'), 121, JSON.stringify(reinoDelJuego));
      assert.equal(b.lua('return SnetForever.Precios.de(20001).precio'), 100, JSON.stringify(reinoDelJuego));
    } finally {
      b.cerrar();
    }
  }
});

test('ronda 2: la migración de la 114 de antes de F7 vale con el reino con espacios que manda el addon', () => {
  const carpeta = carpetaTemporal();
  writeFileSync(join(carpeta, 'estado.json'), JSON.stringify({
    version: 1, identidad: { region: 'us', reino: REINO, faccion: 'Horde' }, vistas: { [`us|${REINO}`]: 'Horde' },
    conocidas: {}, desde: {}, seq: 3, escaneoProbado: 0, casas: [114],
  }));
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  assert.deepEqual(e.conocidas(), { [`${REINO}|Horde`]: 114 });
  // La identidad que manda el addon de ahora (F6b): el mismo reino con espacios, aunque GetRealmName() dé "".
  assert.deepEqual(e.alLeerCuenta({ identidad: { region: 'US', reino: REINO, faccion: 'Horde' } }), { identidadCambiada: false, casasCambiadas: false, escaneosNuevos: [] });
  assert.deepEqual(e.enUso(), { region: 'us', casas: [114] });
});

test('ronda 2: con solo un reino provisional (el normalizado, sin nada guardado), nada va a la app como identidad y descubrir espera', () => {
  const juego = crearMaquina({ jugador: { ...JUGADOR, ...VACIO, reinoNormalizado: NORMALIZADO } });
  let cuenta;
  try {
    assert.equal(juego.lua('return select(2, SnetForever.Personaje.reino())'), true, 'provisional');
    cuenta = escanearNeutral(juego);
  } finally {
    juego.cerrar();
  }
  assert.equal(cuenta.identidad?.reino ?? null, null, 'la identidad, sin reino');
  assert.equal(cuenta.escaneos?.Neutral?.identidad?.reino ?? null, null, 'el escaneo, sin reino');
  const e = crearEstadoComercio({ fs: nodeFs, carpeta: carpetaTemporal() });
  assert.deepEqual(e.alLeerCuenta({ identidad: cuenta.identidad, escaneos: Object.values(cuenta.escaneos ?? {}) }),
    { identidadCambiada: false, casasCambiadas: false, escaneosNuevos: [] });
  assert.equal(e.identidad(), null);
  assert.equal(e.porDescubrir(), null, 'descubrir espera a un escaneo con el reino bueno');
});
