// Puente con TATI (tarea S4): el núcleo guarda los latidos del addon (sin ranuras, sin timbres, sin registro), publica
// los registros que manda TATI sin pregunta (`empujar`) y arma una respuesta a partir de un texto (`armarRespuesta`).
// Con el andamio de nucleo.test.js: el claude falso, timbres de prueba, AddOns y datos en carpetas temporales. Nombres de
// personaje inventados.
import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeFs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { cargarBase } from '../src/base/base.mjs';
import { crearNucleo, LATIDO_VALE_MS } from '../src/nucleo.mjs';
import { crearHistorial } from '../src/historial.mjs';
import { crearTimbres } from '../src/timbres.mjs';
import { prepararAddOns } from '../src/instalacion.mjs';
import { preguntar as preguntarClaude, olvidarOpciones } from '../src/claude.mjs';
import { crearEstadoJuego } from '../src/tati/estado.mjs';
import { textoGuiaNueva } from '../src/textos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO = { ruta: join(AQUI, 'falso-claude', 'claude.mjs'), tipo: 'node' };
const COPIA = { ...process.env };
const RAIZ = mkdtempSync(join(tmpdir(), 'snf-nucleo-tati-'));
const PJ = 'Tal Cual-Reino Prueba';
const PJ_DOS = 'Otro Tal-Reino Prueba';
const ACTIVO = { puenteTati: { activo: true } };

const carpetaBase = join(RAIZ, 'base');
mkdirSync(carpetaBase);
copyFileSync(join(AQUI, 'fixtures', 'misiones-app.lua'), join(carpetaBase, 'misiones-app.lua'));
writeFileSync(join(carpetaBase, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', ''].join('\n'));
const BASE = cargarBase(carpetaBase);

const maquinas = [];
after(() => {
  maquinas.forEach((m) => m.cerrar());
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, COPIA);
});

let n = 0;
let h;
let nucleos = [];

beforeEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in COPIA)) delete process.env[k];
  Object.assign(process.env, COPIA);
  n += 1;
  h = preparar(n);
  process.env.SNF_DATOS = h.datos;
  process.env.FALSO_REGISTRO = h.registroFalso;
  delete process.env.FALSO_MODO;
  delete process.env.FALSO_RESPUESTA;
  olvidarOpciones();
  nucleos = [];
});

afterEach(async () => {
  for (const x of nucleos) await x.parar();
});

function preparar(i) {
  const base = join(RAIZ, `t${i}`);
  const addons = join(base, 'AddOns');
  mkdirSync(join(addons, 'SnetForever'), { recursive: true });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Interface: 16001\n## Title: SnetForever\n\nnucleo.lua\n');
  const raiz = join(base, 'volumen');
  mkdirSync(raiz);
  prepararAddOns(addons, { raizVolumen: raiz });
  return { base, addons, raiz, datos: join(base, 'datos'), registroFalso: join(base, 'falso.json') };
}

const OK = { estado: 'ok' };
const NO = { estado: 'sin_instalar' };

// Un núcleo de prueba con el estado del juego de TATI. `sacados`: los timbres que salen; `apuntados`: las llamadas a
// apuntar del estado del juego.
function nucleo(opciones = {}) {
  const sacados = [];
  const fs = {
    ...nodeFs,
    renameSync(de, a) {
      const r = nodeFs.renameSync(de, a);
      const m = /([a-z_]+)\.wav\.fuera$/.exec(String(a));
      if (m) sacados.push(m[1]);
      return r;
    },
  };
  const timbres = crearTimbres(h.addons, { pulsoMs: { timbre: 15, recibido: 15, vivo: 15 }, fs, raizVolumen: h.raiz });
  const llamadas = [];
  const modulos = {
    claude: { preguntar: async (c, o) => { llamadas.push(o); return preguntarClaude(c, o); } },
    codex: { preguntar: async () => { throw new Error('el codex real no se usa en las pruebas'); } },
  };
  const apuntados = [];
  const gastos = { n: 0 };
  const real = opciones.estadoJuego === null ? null : opciones.estadoJuego ?? crearEstadoJuego({ datos: h.datos });
  const estadoJuego = real && {
    ...real,
    apuntar: (pj, m, r) => { apuntados.push({ pj, m, r }); return real.apuntar(pj, m, r); },
    gastar: () => { gastos.n += 1; return real.gastar(); },
  };
  const historial = crearHistorial(h.datos);
  const x = crearNucleo({
    base: Promise.resolve(BASE),
    addonsDir: h.addons,
    timbres,
    historial,
    datos: h.datos,
    comprobar: { claude: async () => OK, codex: async () => NO },
    programas: { claude: FALSO, codex: { ruta: 'no-existe', tipo: 'node' } },
    modulos,
    raizVolumen: h.raiz,
    config: opciones.config,
    obtener: opciones.obtener,
    reloj: opciones.reloj,
    ...(estadoJuego ? { estadoJuego } : {}),
    ...(opciones.puente ? { puente: opciones.puente } : {}),
    ...(opciones.estadoTati ? { estadoTati: opciones.estadoTati } : {}),
    ...(opciones.cerebro ? { cerebro: opciones.cerebro } : {}),
  });
  const yo = { nucleo: x, timbres, sacados, llamadas, apuntados, gastos, estadoJuego, historial, parar: () => timbres.parar() };
  nucleos.push(yo);
  return yo;
}

const CTX = {
  pj: { nivel: 3, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, xp: 100, xpMax: 900, dinero: 1234 },
  lugar: { mapa: 1411, zona: 'Durotar', instancia: false },
  registro: [{ q: 4641, c: 0, o: [[2, 8]] }],
};
const mensaje = ({ id = 'c9d1-1', pj = PJ, texto = 'hola', idioma = 'es', nivel = 3 } = {}) => ({
  v: 1, id, pj, idioma, modelo: 'haiku', texto, ctx: { ...CTX, pj: { ...CTX.pj, nivel } },
});
const latido = ({ id = 'c9d1-1', pj = PJ, idioma = 'es' } = {}) => ({ v: 1, tipo: 'latido', id, pj, idioma, ctx: CTX });

function trama({ pj = PJ, id = 'c9d1-1', r = 7, c = 0, cuerpo }) {
  const json = Buffer.from(JSON.stringify(cuerpo), 'utf8');
  const cabeza = Buffer.from(['SNF1', pj, id, '1', '1', '0', String(r), String(c), ''].join('\x1f'), 'utf8');
  return Buffer.concat([cabeza, json]);
}

const nombreRanura = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;
const rutaRanura = (i) => join(h.addons, nombreRanura(i), 'buzon.lua');
const fotoRanuras = () => Array.from({ length: 20 }, (_, k) => (existsSync(rutaRanura(k + 1)) ? readFileSync(rutaRanura(k + 1), 'utf8') : null));
// Cada lectura crea una máquina Lua y la cierra al acabar: guardarlas todas hasta el final del archivo agotaba el
// montón de Node (cerca de 3 GB en nucleo.test.js).
function leerBuzon(i) {
  const m = crearMaquina({ arrancar: false });
  try {
    return m.lua(`${readFileSync(rutaRanura(i), 'utf8')}\nreturn SNF_BUZON`);
  } finally {
    m.cerrar();
  }
}
const ultimoDe = (b) => {
  const regs = Array.isArray(b.registros) ? b.registros : Object.values(b.registros ?? {});
  return regs.sort((a, c) => a.seq - c.seq).at(-1);
};
const timbresDeBuzon = (x) => x.sacados.filter((s) => s.startsWith('timbre_') || s.startsWith('recibido_'));
const leerLog = () => (existsSync(join(h.datos, 'registro.log')) ? readFileSync(join(h.datos, 'registro.log'), 'utf8') : '');

// ---------- el latido ----------

test('un latido no escribe ninguna ranura, no toca timbres ni sube seq, y deja el estado del juego con su r', async () => {
  const x = nucleo({ config: ACTIVO });
  const antes = fotoRanuras();
  const r = await x.nucleo.recibirTrama(trama({ r: 7, cuerpo: latido() }));
  await x.nucleo.inactivo();
  assert.equal(r, null);
  assert.deepEqual(fotoRanuras(), antes, 'ninguna ranura escrita');
  assert.deepEqual(timbresDeBuzon(x), [], 'ni timbre de buzón ni recibido');
  assert.equal(x.nucleo.estado().seq, 0);
  assert.equal(x.nucleo.estado().publicaciones, 0);
  assert.equal(x.llamadas.length, 0, 'no se pregunta a la IA');
  assert.equal(existsSync(join(h.datos, 'estado.json')), false, 'ni registro ni recibidos');
  assert.deepEqual(x.historial.recientes(PJ, 12), [], 'sin historial');
  assert.equal(x.estadoJuego.ultimo().r, 7);
  assert.equal(x.estadoJuego.ultimo().pj, PJ);
  assert.equal(x.estadoJuego.ultimo().mensaje.ctx.lugar.zona, 'Durotar');
  const log = leerLog();
  assert.match(log, /latido/);
  assert.ok(!log.includes('Tal Cual'), 'sin nombres en registro.log');
});

test('con el puente activo, un mensaje normal también apunta el estado y se contesta como siempre', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 4, cuerpo: mensaje() }));
  assert.equal(x.apuntados.length, 1);
  assert.equal(x.apuntados[0].pj, PJ);
  assert.equal(x.apuntados[0].r, 4);
  assert.equal(x.estadoJuego.ultimo().r, 4);
  assert.equal(x.llamadas.length, 1);
  assert.equal(ultimoDe(leerBuzon(4)).texto, 'respuesta falsa');
});

test('cabecera: con el puente activo lleva latido; con el cerebro tati, motorNombre tati y el estado de estadoTati', async () => {
  const a = nucleo({ config: ACTIVO });
  await a.nucleo.publicarEstado();
  const ea = leerBuzon(1).estado;
  assert.equal(ea.latido, true);
  assert.equal(ea.motorNombre, 'claude');
  assert.equal(ea.motor, 'ok');

  const b = nucleo({ puente: () => ({ activo: true, cerebro: 'tati' }) });
  await b.nucleo.publicarEstado();
  const eb = leerBuzon(1).estado;
  assert.equal(eb.latido, true);
  assert.equal(eb.motorNombre, 'tati');
  assert.equal(eb.motor, 'desconocido', 'sin estadoTati: desconocido');

  const c = nucleo({ puente: () => ({ activo: true, cerebro: 'tati' }), estadoTati: () => 'ok' });
  await c.nucleo.publicarEstado();
  assert.equal(leerBuzon(1).estado.motor, 'ok');
  assert.equal(leerBuzon(1).estado.motorNombre, 'tati');
});

// ---------- la versión pública ----------

for (const [nombre, opciones] of [
  ['sin puenteTati en la config', {}],
  ['con puente() inactivo', { puente: () => ({ activo: false, cerebro: 'snetforever' }) }],
]) {
  test(`versión pública (${nombre}): un latido se ignora y la cabecera no lleva latido ni tati`, async () => {
    const x = nucleo(opciones);
    const antes = fotoRanuras();
    const r = await x.nucleo.recibirTrama(trama({ r: 7, cuerpo: latido() }));
    await x.nucleo.inactivo();
    assert.equal(r, null);
    assert.deepEqual(fotoRanuras(), antes, 'sin ranuras');
    assert.deepEqual(timbresDeBuzon(x), []);
    assert.equal(x.nucleo.estado().seq, 0, 'sin registro');
    assert.equal(x.llamadas.length, 0);
    assert.deepEqual(x.apuntados, [], 'sin apuntar nada');
    assert.equal(x.estadoJuego.ultimo(), null);
    // Un mensaje normal: como siempre, sin apuntar el estado.
    await x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 3, cuerpo: mensaje({ id: 'c9d1-2' }) }));
    assert.deepEqual(x.apuntados, []);
    assert.equal(x.gastos.n, 0, 'con el puente apagado no se cuentan ranuras');
    assert.deepEqual(await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } }), { error: 'sin_puente' });
    const e = leerBuzon(3).estado;
    assert.equal(e.latido, undefined);
    assert.equal(e.motorNombre, 'claude');
    assert.equal(ultimoDe(leerBuzon(3)).origen, undefined);
  });
}

// ---------- empujar ----------

test('empujar tras un latido: escribe de 1 a 16 y de 7 a 20, con timbre, y su registro es de TATI', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 7, cuerpo: latido() }));
  const antes = x.estadoJuego.ranurasQuedan();
  const r = await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } });
  assert.ok(r.registro, JSON.stringify(r));
  assert.equal(r.registro.msg, 'tati-1');
  for (const i of [1, 2, 7, 16, 17, 20]) {
    const reg = ultimoDe(leerBuzon(i));
    assert.equal(reg.pj, PJ, `ranura ${i}`);
    assert.equal(reg.msg, 'tati-1');
    assert.equal(reg.origen, 'tati');
    assert.equal(reg.t, 'respuesta');
    assert.equal(reg.texto, 'hola');
    assert.equal(reg.seq, 1);
  }
  assert.deepEqual(x.sacados.filter((s) => s.startsWith('timbre_')), ['timbre_a']);
  assert.deepEqual(x.sacados.filter((s) => s.startsWith('recibido_')), []);
  assert.equal(x.estadoJuego.ranurasQuedan(), antes - 1, 'gasta una ranura');
  assert.equal(leerBuzon(7).recibidos?.[PJ], undefined, 'no toca recibidos');
  const log = leerLog();
  assert.ok(!log.includes('Tal Cual') && !log.includes('hola'), 'registro.log solo con códigos');
});

test('empujar: los campos del registro los pone el núcleo (el parcial no cambia seq, pj, msg ni origen)', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 2, cuerpo: latido() }));
  const r = await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'a|b', seq: 99, pj: 'x', msg: 'y', origen: 'z' } });
  assert.equal(r.registro.seq, 1);
  assert.equal(r.registro.pj, PJ);
  assert.equal(r.registro.msg, 'tati-1');
  assert.equal(r.registro.origen, 'tati');
  const s = await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'otra' } });
  assert.equal(s.registro.msg, 'tati-2');
});

test('empujar sin estado del juego da sin_personaje y no escribe nada', async () => {
  for (const opciones of [{ config: ACTIVO }, { config: ACTIVO, estadoJuego: null }]) {
    const x = nucleo(opciones);
    const antes = fotoRanuras();
    assert.deepEqual(await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } }), { error: 'sin_personaje' });
    assert.deepEqual(fotoRanuras(), antes);
    assert.deepEqual(timbresDeBuzon(x), []);
    assert.equal(x.nucleo.estado().seq, 0);
  }
});

test('ranuras gastadas: sin_ranuras y nada escrito; tras un /reload el primer latido trae r = 1 y vuelve a funcionar', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 20, cuerpo: latido() }));
  assert.equal(x.estadoJuego.ranurasQuedan(), 1);
  assert.ok((await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'una' } })).registro);
  assert.equal(x.estadoJuego.ranurasQuedan(), 0);
  const antes = fotoRanuras();
  const timbresAntes = x.sacados.length;
  assert.deepEqual(await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'dos' } }), { error: 'sin_ranuras' });
  assert.deepEqual(fotoRanuras(), antes);
  assert.equal(x.sacados.length, timbresAntes);
  assert.equal(x.nucleo.estado().seq, 1);

  await x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 1, cuerpo: latido({ id: 'c9d1-2' }) }));
  const r = await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'tres' } });
  assert.equal(r.registro.msg, 'tati-2');
  assert.equal(ultimoDe(leerBuzon(1)).texto, 'tres');
});

test('empujar va al personaje del último latido', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 3, cuerpo: latido() }));
  await x.nucleo.recibirTrama(trama({ pj: PJ_DOS, id: 'e2f3-1', r: 5, cuerpo: latido({ pj: PJ_DOS, id: 'e2f3-1' }) }));
  const r = await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } });
  assert.equal(r.registro.pj, PJ_DOS);
  assert.equal(ultimoDe(leerBuzon(5)).pj, PJ_DOS);
});

// ---------- armarRespuesta ----------

const conBloque = (bloque, prosa = 'Aquí tienes la ruta.') => `${prosa}\n\`\`\`snet\n${JSON.stringify(bloque)}\n\`\`\``;
const DALARAN = {
  titulo: 'Dalaran',
  pasos: [
    { texto: 'Habla con Gornek', punto: 'B:q4641:r', misiones: [{ q: 4641, accion: 'aceptar' }] },
    { texto: 'Una inventada', misiones: [{ q: 999999, accion: 'aceptar' }] },
    { misiones: [{ q: 4641, accion: 'entregar' }], punto: 'B:q4641:e' },
  ],
};

test('armarRespuesta con un bloque guiaNueva da el mismo parcial que turno() con esa respuesta del claude falso', async () => {
  const textoIA = conBloque({ guiaNueva: DALARAN });
  process.env.FALSO_RESPUESTA = textoIA;
  const m = mensaje({ texto: 'créame la ruta de Dalaran' });
  const a = nucleo();
  await a.nucleo.recibirTrama(trama({ r: 7, cuerpo: m }));
  const guardado = JSON.parse(readFileSync(join(h.datos, 'estado.json'), 'utf8')).registros.at(-1);
  const { seq, pj, msg, ...deTurno } = guardado;
  assert.equal(msg, 'c9d1-1');
  assert.ok(deTurno.guiaIA, JSON.stringify(deTurno));

  const b = nucleo();
  const publicacionesAntes = b.nucleo.estado().publicaciones;
  const { parcial, historia } = await b.nucleo.armarRespuesta({ pj: PJ, mensaje: m, texto: textoIA, idioma: 'es', id: 'c9d1-1', motor: 'claude' });
  assert.deepEqual(JSON.parse(JSON.stringify(parcial)), deTurno, 'misma guía, mismas notas');
  assert.ok(parcial.texto.includes(textoGuiaNueva('quitados', { misiones: 1, puntos: 0, pasos: 0, tramos: 0, textos: 0 }, 'es')), parcial.texto);
  assert.equal(historia[0][0], 'jugador');
  assert.equal(historia[0][1], 'créame la ruta de Dalaran');
  assert.equal(historia[1][0], 'ia');
  assert.equal(b.llamadas.length, 0, 'no pregunta a la IA');
  assert.equal(b.nucleo.estado().seq, 1, 'no añade ningún registro');
  assert.equal(b.nucleo.estado().publicaciones, publicacionesAntes, 'no publica nada');
});

test('armarRespuesta con paginas «propias»: la app baja ella misma las páginas de los puntos de internet', async () => {
  const URL_A = 'https://guias.ejemplo.com/ruta-a';
  const pedidas = [];
  const obtener = async (url) => {
    pedidas.push(url);
    return { url, tipo: 'text/html; charset=utf-8', cuerpo: Buffer.from('<html><body><p>El PNJ está en 45.2, 67.8.</p></body></html>', 'utf8') };
  };
  const pasoWeb = (x, y) => ({ texto: `Ve a ${x}, ${y}`, web: { zona: 'Durotar', x, y, url: URL_A } });
  const textoIA = conBloque({ guiaNueva: { titulo: 'Web', pasos: [pasoWeb(45.2, 67.8), pasoWeb(11.1, 22.2)] } });
  const x = nucleo({ obtener });
  const m = mensaje({ texto: '' });

  const sin = await x.nucleo.armarRespuesta({ pj: PJ, mensaje: m, texto: textoIA, idioma: 'es', id: 'tati', paginas: null });
  assert.deepEqual(pedidas, [], 'con null, como sin stream: no se baja nada');
  assert.ok(sin.parcial.texto.includes(textoGuiaNueva('quitados', { puntos: 2 }, 'es')), sin.parcial.texto);

  const con = await x.nucleo.armarRespuesta({ pj: PJ, mensaje: m, texto: textoIA, idioma: 'es', id: 'tati', paginas: 'propias' });
  assert.deepEqual(pedidas, [URL_A]);
  const pasos = Object.values(con.parcial.guiaIA.pasos).flatMap((p) => Object.values(p.elementos ?? {}));
  assert.deepEqual(pasos.filter((e) => e.t === 'goto').map((e) => [e.x, e.y]), [[45.2, 67.8]]);
  assert.ok(con.parcial.texto.includes(textoGuiaNueva('quitados', { puntos: 1 }, 'es')), con.parcial.texto);
  assert.ok(!leerLog().includes('ejemplo.com'));
});

// ---------- ronda de la revisión de S4 ----------

test('I1: sin estado.json, empujar pone el seq por encima del cursor del addon (c del latido)', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 7, c: 9, cuerpo: latido() }));
  const r = await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } });
  assert.equal(r.registro.seq, 10);
  assert.equal(r.registro.msg, 'tati-10');
  assert.equal(ultimoDe(leerBuzon(7)).seq, 10);
  assert.equal(leerBuzon(7).seq, 10);
  // También con el cursor de un mensaje normal.
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 8, c: 30, cuerpo: mensaje({ id: 'c9d1-2' }) }));
  assert.equal(ultimoDe(leerBuzon(8)).seq, 31, 'la respuesta, como siempre');
  const s = await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'otra' } });
  assert.equal(s.registro.seq, 32);
});

test('I2 (Ruling P8): la respuesta a un mensaje normal con r = 18 gasta su ranura: quedan 2', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 18, cuerpo: mensaje() }));
  assert.equal(x.estadoJuego.ranurasQuedan(), 2);
  assert.equal(x.gastos.n, 1);
  // Un registro de TATI gasta una más, en el mismo sitio (no dos).
  await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } });
  assert.equal(x.estadoJuego.ranurasQuedan(), 1);
  assert.equal(x.gastos.n, 2);
});

test('M1: con el puente apagado, empujar da sin_puente y no escribe nada aunque haya estado del juego', async () => {
  const estadoJuego = crearEstadoJuego({ datos: h.datos });
  await estadoJuego.apuntar(PJ, latido(), 7);
  const x = nucleo({ estadoJuego });
  const antes = fotoRanuras();
  assert.deepEqual(await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } }), { error: 'sin_puente' });
  assert.deepEqual(fotoRanuras(), antes);
  assert.deepEqual(timbresDeBuzon(x), []);
  assert.equal(x.nucleo.estado().seq, 0);
  assert.equal(x.gastos.n, 0);
});

// Revisión final (I1): tras reiniciar la app (el estado del juego sigue en estados.json) aún no se sabe en qué ranura va
// el addon: sin ningún latido ni mensaje en esta ejecución, empujar no escribe nada (antes escribía sin timbre y daba ok,
// y el juego no lo veía).
test('M2 / I1: sin ningún latido ni mensaje en esta ejecución, empujar da sin_latido y no escribe nada', async () => {
  const estadoJuego = crearEstadoJuego({ datos: h.datos });
  await estadoJuego.apuntar(PJ, latido(), 7); // el estado guardado de una ejecución anterior
  const x = nucleo({ config: ACTIVO, estadoJuego });
  const antes = fotoRanuras();
  assert.deepEqual(await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } }), { error: 'sin_latido' });
  assert.deepEqual(fotoRanuras(), antes, 'ninguna ranura escrita');
  assert.deepEqual(timbresDeBuzon(x), [], 'sin timbre');
  assert.equal(x.nucleo.estado().seq, 0);
  assert.equal(x.gastos.n, 0);
  assert.equal(x.estadoJuego.ranurasQuedan(), 14);
  assert.match(leerLog(), /tati: registro sin_latido/);
  // Con el primer latido de esta ejecución, ya.
  await x.nucleo.recibirTrama(trama({ r: 8, cuerpo: latido() }));
  const r = await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } });
  assert.equal(r.registro.msg, 'tati-1');
  assert.equal(ultimoDe(leerBuzon(8)).texto, 'hola');
  assert.deepEqual(x.sacados.filter((s) => s.startsWith('timbre_')), ['timbre_a']);
});

// Revisión final (M1): un latido cuyo JSON no se puede leer no es un mensaje del jugador: ni error en el chat, ni
// recibidos, ni ranura gastada.
test('M1 (revisión final): un latido ilegible (id …-L<n>) se descarta sin publicar nada; un mensaje ilegible, como siempre', async () => {
  const x = nucleo({ config: ACTIVO });
  const ilegible = (id, r) => {
    const cabeza = Buffer.from(['SNF1', PJ, id, '1', '1', '0', String(r), '0', ''].join('\x1f'), 'utf8');
    return Buffer.concat([cabeza, Buffer.from('{esto no es json', 'utf8')]);
  };
  const antes = fotoRanuras();
  assert.equal(await x.nucleo.recibirTrama(ilegible('c9d1-L3', 6)), null);
  await x.nucleo.inactivo();
  assert.deepEqual(fotoRanuras(), antes, 'ninguna ranura escrita');
  assert.deepEqual(timbresDeBuzon(x), [], 'ni timbre de buzón ni recibido');
  assert.equal(x.nucleo.estado().seq, 0);
  assert.equal(x.gastos.n, 0);
  assert.equal(existsSync(join(h.datos, 'estado.json')), false, 'sin recibidos');
  assert.deepEqual(x.apuntados, []);
  // Un mensaje normal ilegible sigue dando su error en el chat.
  const r = await x.nucleo.recibirTrama(ilegible('c9d1-4', 6));
  assert.equal(r?.t, 'error');
  assert.equal(ultimoDe(leerBuzon(6)).t, 'error');
});

const RUTA_LARGA = {
  titulo: 'Larga',
  tramos: [
    { titulo: 'Uno', pasos: Array.from({ length: 225 }, (_, i) => ({ texto: `Paso ${i + 1}` })) },
    { titulo: 'Dos', pasos: Array.from({ length: 225 }, (_, i) => ({ texto: `Otro paso ${i + 1}` })) },
  ],
};

test('M4: armarRespuesta da quitados y los contadores de la ruta; sin pj usa el del último estado', async () => {
  const x = nucleo({ config: ACTIVO });
  const sinRuta = await x.nucleo.armarRespuesta({ mensaje: mensaje(), texto: 'Nada que ver.', idioma: 'es' });
  assert.deepEqual(sinRuta.quitados, []);
  assert.equal(sinRuta.ruta, null);

  const d = await x.nucleo.armarRespuesta({ pj: PJ, mensaje: mensaje(), texto: conBloque({ guiaNueva: DALARAN }), idioma: 'es' });
  assert.ok(Array.isArray(d.quitados));
  assert.equal(d.ruta.tramos, 1);
  assert.equal(d.ruta.misiones, 1);
  assert.equal(d.ruta.pasos, Object.values(d.parcial.guiaIA.pasos).length);
  assert.equal(d.ruta.quitados.misiones, 1);
  assert.equal(d.ruta.quitados.puntos, 0);

  // Sin pj: los tramos pendientes quedan para el personaje del último latido y su «sigue» no pregunta a la IA.
  await x.nucleo.recibirTrama(trama({ r: 3, cuerpo: latido() }));
  const larga = await x.nucleo.armarRespuesta({ mensaje: x.estadoJuego.ultimo().mensaje, texto: conBloque({ guiaNueva: RUTA_LARGA }), idioma: 'es' });
  assert.equal(larga.ruta.tramos, 2);
  // Ronda 2 (M1): los pendientes cambian cuando quien publica lo confirma.
  larga.confirmar();
  assert.equal(larga.ruta.pasos, 450);
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 4, cuerpo: mensaje({ id: 'c9d1-2', texto: 'sigue' }) }));
  assert.equal(x.llamadas.length, 0, 'el «sigue» se contesta sin la IA');
  assert.ok(ultimoDe(leerBuzon(4)).guiaIA, 'con el segundo tramo');
});

test('M6: «latido» en registro.log solo si cambia la r o ha pasado un minuto', async () => {
  let t = 1_000_000;
  const x = nucleo({ config: ACTIVO, reloj: { ahora: () => t } });
  const lineas = () => leerLog().split('\n').filter((l) => /\[info\] latido$/.test(l)).length;
  await x.nucleo.recibirTrama(trama({ id: 'f1-1', r: 5, cuerpo: latido({ id: 'f1-1' }) }));
  assert.equal(lineas(), 1);
  t += 10_000;
  await x.nucleo.recibirTrama(trama({ id: 'f1-2', r: 5, cuerpo: latido({ id: 'f1-2' }) }));
  assert.equal(lineas(), 1, 'misma r y menos de un minuto: no se apunta');
  assert.equal(x.apuntados.length, 2, 'el estado sí se guarda');
  t += 10_000;
  await x.nucleo.recibirTrama(trama({ id: 'f1-3', r: 6, cuerpo: latido({ id: 'f1-3' }) }));
  assert.equal(lineas(), 2, 'otra r');
  t += 60_000;
  await x.nucleo.recibirTrama(trama({ id: 'f1-4', r: 6, cuerpo: latido({ id: 'f1-4' }) }));
  assert.equal(lineas(), 3, 'un minuto después');
});

// ---------- tras reiniciar la app: lo último que se supo del addon, en disco ----------

// Con el chat del juego cerrado no llegan latidos: la app reiniciada usa lo que guardó del último latido o mensaje
// (personaje, ranura siguiente del addon, su cursor y la hora) si es reciente y del mismo personaje.
const rutaLatido = () => join(h.datos, 'puente-tati', 'latido.json');

// «Reinicia la app»: para el núcleo de antes y crea otro con los mismos datos (el estado del juego se vuelve a leer).
async function reiniciar(x, opciones = {}) {
  await x.nucleo.inactivo();
  await x.parar();
  return nucleo({ config: ACTIVO, ...opciones });
}

test('reinicio: empujar usa lo guardado del último latido, en la ranura que el addon va a cargar y con seq > su cursor', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 7, c: 9, cuerpo: latido() }));
  const y = await reiniciar(x);
  const r = await y.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'sin esperar' } });
  assert.ok(r.registro, 'sin esperar un latido');
  assert.equal(r.registro.seq, 10, 'por encima del cursor del addon (9), aunque no haya estado.json');
  assert.equal(r.registro.pj, PJ);
  assert.equal(ultimoDe(leerBuzon(7)).texto, 'sin esperar', 'la ranura 7, la que el addon va a cargar');
  assert.equal(ultimoDe(leerBuzon(1)).texto, 'sin esperar', 'y de 1 a 16, por si el juego se reinició');
  assert.deepEqual(y.sacados.filter((s) => s.startsWith('timbre_')), ['timbre_a'], 'con timbre');
  assert.equal(y.gastos.n, 1);
  assert.ok(!leerLog().includes('Tal Cual'), 'sin nombres en registro.log');
  assert.ok(!readFileSync(rutaLatido(), 'utf8').includes('hola'), 'sin preguntas en lo guardado');
});

test('reinicio tras un registro de TATI: el siguiente va en la ranura que toca (r + gastadas) con un seq mayor', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 7, c: 9, cuerpo: latido() }));
  const a = await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'antes' } });
  assert.equal(a.registro.seq, 10); // el addon carga la 7: su cursor pasa a 10 y su siguiente ranura es la 8
  const y = await reiniciar(x);
  const r = await y.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'después' } });
  assert.equal(r.registro.seq, 11);
  assert.equal(ultimoDe(leerBuzon(8)).texto, 'después', 'la 8, la que el addon carga ahora');
  assert.equal(y.estadoJuego.ranurasQuedan(), 12);
});

test('reinicio: lo guardado de otro personaje no vale: sin_latido con nada escrito', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 7, c: 9, cuerpo: latido() }));
  const y = await reiniciar(x);
  const antes = fotoRanuras();
  assert.deepEqual(await y.nucleo.empujar({ pj: PJ_DOS, parcial: { t: 'respuesta', texto: 'hola' } }), { error: 'sin_latido' });
  assert.deepEqual(fotoRanuras(), antes, 'ninguna ranura escrita');
  assert.deepEqual(timbresDeBuzon(y), []);
  assert.equal(y.gastos.n, 0);
  // Con el suyo, sí.
  assert.ok((await y.nucleo.empujar({ pj: PJ, parcial: { t: 'respuesta', texto: 'hola' } })).registro);
});

test(`reinicio: lo guardado hace más de ${LATIDO_VALE_MS / 3_600_000} h no vale (sin_latido); justo antes, sí`, async () => {
  assert.equal(LATIDO_VALE_MS, 6 * 60 * 60 * 1000);
  const t0 = 1_000_000_000;
  const x = nucleo({ config: ACTIVO, reloj: { ahora: () => t0 } });
  await x.nucleo.recibirTrama(trama({ r: 7, c: 9, cuerpo: latido() }));
  const viejo = await reiniciar(x, { reloj: { ahora: () => t0 + LATIDO_VALE_MS + 1 } });
  const antes = fotoRanuras();
  assert.deepEqual(await viejo.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } }), { error: 'sin_latido' });
  assert.deepEqual(fotoRanuras(), antes);
  assert.equal(viejo.gastos.n, 0);
  const reciente = await reiniciar(viejo, { reloj: { ahora: () => t0 + LATIDO_VALE_MS - 60_000 } });
  const r = await reciente.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } });
  assert.equal(r.registro.seq, 10);
  assert.equal(ultimoDe(leerBuzon(7)).texto, 'hola');
});

test('reinicio: si el addon avanzó con la app cerrada, el primer latido nuevo corrige lo guardado (r y cursor)', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 7, c: 9, cuerpo: latido() }));
  const y = await reiniciar(x);
  await y.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 3, c: 20, cuerpo: latido({ id: 'c9d1-2' }) }));
  const r = await y.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'corregido' } });
  assert.equal(r.registro.seq, 21, 'por encima del cursor nuevo');
  assert.equal(ultimoDe(leerBuzon(3)).texto, 'corregido');
  // Y queda guardado para el siguiente reinicio (otro latido, sin registro: lo guardado es lo de este).
  await y.nucleo.recibirTrama(trama({ id: 'c9d1-3', r: 4, c: 40, cuerpo: latido({ id: 'c9d1-3' }) }));
  const z = await reiniciar(y);
  const s = await z.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'otra vez' } });
  assert.equal(s.registro.seq, 41);
  assert.equal(ultimoDe(leerBuzon(4)).texto, 'otra vez');
});

test('reinicio: un mensaje normal también deja guardado su r y su cursor', async () => {
  const x = nucleo({ config: ACTIVO });
  await x.nucleo.recibirTrama(trama({ r: 5, c: 30, cuerpo: mensaje() }));
  const y = await reiniciar(x);
  const r = await y.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'tras el mensaje' } });
  assert.equal(r.registro.seq, 32, 'la respuesta fue la 31');
  assert.equal(ultimoDe(leerBuzon(6)).texto, 'tras el mensaje', 'la respuesta gastó la 5: el addon va por la 6');
});

test('reinicio: lo guardado roto va a la cuarentena de datos (no se borra); sin_latido hasta el primer latido', async () => {
  mkdirSync(join(h.datos, 'puente-tati'), { recursive: true });
  writeFileSync(rutaLatido(), '{esto no es json');
  const estadoJuego = crearEstadoJuego({ datos: h.datos });
  await estadoJuego.apuntar(PJ, latido(), 7);
  const x = nucleo({ config: ACTIVO, estadoJuego });
  assert.equal(existsSync(rutaLatido()), false, 'apartado');
  const cuarentena = join(h.datos, 'cuarentena');
  const guardados = readdirSync(cuarentena).flatMap((d) => readdirSync(join(cuarentena, d)).map((f) => readFileSync(join(cuarentena, d, f), 'utf8')));
  assert.ok(guardados.includes('{esto no es json'), 'en la cuarentena de datos');
  assert.match(leerLog(), /latido\.json roto/);
  assert.deepEqual(await x.nucleo.empujar({ parcial: { t: 'respuesta', texto: 'hola' } }), { error: 'sin_latido' });
  await x.nucleo.recibirTrama(trama({ r: 8, cuerpo: latido() }));
  await x.nucleo.inactivo();
  assert.equal(JSON.parse(readFileSync(rutaLatido(), 'utf8')).r, 8, 'se vuelve a guardar');
  // Lo que no tiene la forma de lo guardado también se aparta.
  const y = await reiniciar(x);
  await y.parar();
  writeFileSync(rutaLatido(), JSON.stringify({ version: 1, pj: PJ, r: 'siete', c: 0, cuando: 1 }));
  nucleo({ config: ACTIVO });
  assert.equal(existsSync(rutaLatido()), false);
});

test('versión pública: ni latidos ni mensajes guardan nada del addon en disco', async () => {
  const x = nucleo({});
  await x.nucleo.recibirTrama(trama({ r: 5, cuerpo: latido() }));
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 5, cuerpo: mensaje({ id: 'c9d1-2' }) }));
  await x.nucleo.inactivo();
  assert.equal(existsSync(rutaLatido()), false);
});

// ---------- turno largo de TATI: pulsos, cabecera `turno` y parar ----------

const CON_TATI = () => ({ activo: true, cerebro: 'tati' });
const parar = ({ id = 'c9d1-P1', turno = 'c9d1-1', pj = PJ } = {}) => ({ v: 1, tipo: 'parar', pj, idioma: 'es', id, turno });
const hasta = async (cond) => {
  for (let i = 0; i < 400 && !cond(); i++) await new Promise((res) => setTimeout(res, 5));
  assert.ok(cond(), 'no llegó a pasar');
};

// Un cerebro a mano: cada turno espera a `soltar`; `parar` lo acaba con `detenido`.
function cerebroFalso() {
  const c = {
    pedidos: [],
    parados: 0,
    alSeguir: null,
    soltar: null,
    turno(o) {
      c.pedidos.push(o);
      c.alSeguir = o.alSeguir;
      return new Promise((res) => { c.soltar = res; });
    },
    async parar() {
      c.parados += 1;
      c.soltar?.({ ok: false, tipo: 'detenido', detalle: 'Se detuvo el turno en TATI.', motor: 'tati' });
      return true;
    },
    comprobar: async () => 'ok',
    ultimo: () => 'ok',
  };
  return c;
}
const respuestaTati = { ok: true, texto: 'ruta larga', ms: 1, motor: 'tati' };

for (const [n2, pulso] of [[1, 'recibido_impar'], [2, 'recibido_par']]) {
  test(`alSeguir toca ${pulso} sin escribir ranuras y sin acumular pulsos`, async () => {
    const cerebro = cerebroFalso();
    const x = nucleo({ puente: CON_TATI, cerebro });
    const id = `c9d1-${n2}`;
    const fin = x.nucleo.recibirTrama(trama({ id, r: 5, cuerpo: mensaje({ id }) }));
    await hasta(() => cerebro.alSeguir);
    await hasta(() => x.sacados.filter((s) => s === pulso).length === 1);
    await new Promise((res) => setTimeout(res, 40)); // acaba el pulso del «recibido»
    const antes = fotoRanuras();
    const publicaciones = x.nucleo.estado().publicaciones;
    for (let i = 0; i < 3; i++) cerebro.alSeguir();
    await hasta(() => x.sacados.filter((s) => s === pulso).length === 2);
    await new Promise((res) => setTimeout(res, 60));
    assert.equal(x.sacados.filter((s) => s === pulso).length, 2, 'tres avisos seguidos son un pulso');
    assert.deepEqual(fotoRanuras(), antes, 'ninguna ranura escrita');
    assert.equal(x.nucleo.estado().publicaciones, publicaciones);
    cerebro.alSeguir();
    await hasta(() => x.sacados.filter((s) => s === pulso).length === 3);
    cerebro.soltar(respuestaTati);
    await fin;
  });
}

test('cabecera: lleva turno mientras TATI trabaja, publicada sin timbre, y el buzón del final ya no', async () => {
  const cerebro = cerebroFalso();
  const x = nucleo({ puente: CON_TATI, cerebro });
  const fin = x.nucleo.recibirTrama(trama({ r: 6, cuerpo: mensaje() }));
  await hasta(() => cerebro.pedidos.length === 1);
  assert.equal(leerBuzon(6).estado.turno, 'c9d1-1');
  assert.equal(leerBuzon(6).estado.motorNombre, 'tati');
  assert.deepEqual(x.sacados.filter((s) => s.startsWith('timbre_')), [], 'sin timbre al empezar');
  assert.equal(x.gastos.n, 0, 'no gasta ranura');
  cerebro.soltar(respuestaTati);
  const registro = await fin;
  assert.equal(registro.texto, 'ruta larga');
  assert.equal(leerBuzon(6).estado.turno, undefined);
  assert.equal(ultimoDe(leerBuzon(6)).texto, 'ruta larga');
  assert.deepEqual(x.sacados.filter((s) => s.startsWith('timbre_')), ['timbre_a'], 'solo el timbre del final');
});

test('juego cerrado a mitad: la app acaba, publica y no se queda nada pendiente', async () => {
  const cerebro = cerebroFalso();
  const x = nucleo({ puente: CON_TATI, cerebro });
  const fin = x.nucleo.recibirTrama(trama({ r: 6, cuerpo: mensaje() }));
  await hasta(() => cerebro.pedidos.length === 1);
  // Nadie mira el buzón ni manda nada más: TATI acaba igual.
  cerebro.soltar(respuestaTati);
  await fin;
  await x.nucleo.inactivo();
  assert.equal(x.nucleo.estado().enCola, 0);
  assert.equal(leerBuzon(6).estado.turno, undefined);
  assert.equal(ultimoDe(leerBuzon(6)).texto, 'ruta larga');
});

test('parar del turno en curso: llama a cerebro.parar, sin ranura, registro, recibidos, historial ni seq', async () => {
  const c = cerebroFalso();
  const x = nucleo({ puente: CON_TATI, cerebro: c });
  const fin = x.nucleo.recibirTrama(trama({ r: 6, cuerpo: mensaje() }));
  await hasta(() => c.pedidos.length === 1);
  const antes = fotoRanuras();
  const seq = x.nucleo.estado().seq;
  c.parar = async () => { c.parados += 1; return true; }; // que no acabe el turno todavía
  assert.equal(await x.nucleo.recibirTrama(trama({ id: 'c9d1-P1', r: 6, cuerpo: parar() })), null);
  assert.equal(c.parados, 1);
  assert.deepEqual(fotoRanuras(), antes, 'ninguna ranura escrita');
  assert.equal(x.nucleo.estado().seq, seq);
  assert.equal(x.nucleo.estado().enCola, 1, 'no entra en la cola');
  // repetido: nada
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-P1', r: 6, cuerpo: parar() }));
  assert.equal(c.parados, 1);
  c.soltar({ ok: false, tipo: 'detenido', detalle: 'Se detuvo el turno en TATI.', motor: 'tati' });
  const registro = await fin;
  assert.deepEqual({ t: registro.t, tipo: registro.tipo, texto: registro.texto }, { t: 'error', tipo: 'detenido', texto: 'Parado' });
  const log = leerLog();
  assert.match(log, /mensaje c9d1-1: tati detenido en \d+ ms/);
  assert.ok(!log.includes('Tal Cual'), 'sin nombres');
  assert.deepEqual(x.historial.recientes(PJ, 12), [], 'un turno parado no va al historial');
});

test('parar de otro turno o de otro personaje se ignora', async () => {
  const c = cerebroFalso();
  const x = nucleo({ puente: CON_TATI, cerebro: c });
  const fin = x.nucleo.recibirTrama(trama({ r: 6, cuerpo: mensaje() }));
  await hasta(() => c.pedidos.length === 1);
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-P1', r: 6, cuerpo: parar({ turno: 'c9d1-99' }) }));
  await x.nucleo.recibirTrama(trama({ pj: PJ_DOS, id: 'c9d1-P2', r: 6, cuerpo: parar({ id: 'c9d1-P2', pj: PJ_DOS }) }));
  assert.equal(c.parados, 0);
  c.soltar(respuestaTati);
  assert.equal((await fin).texto, 'ruta larga');
});

test('parar de un mensaje en la cola: al tocarle contesta detenido sin preguntar a TATI', async () => {
  const c = cerebroFalso();
  const x = nucleo({ puente: CON_TATI, cerebro: c });
  const uno = x.nucleo.recibirTrama(trama({ r: 6, cuerpo: mensaje() }));
  await hasta(() => c.pedidos.length === 1);
  const dos = x.nucleo.recibirTrama(trama({ pj: PJ_DOS, id: 'c9d1-2', r: 7, cuerpo: mensaje({ id: 'c9d1-2', pj: PJ_DOS }) }));
  await hasta(() => x.nucleo.estado().enCola === 2);
  await x.nucleo.recibirTrama(trama({ pj: PJ_DOS, id: 'c9d1-P1', r: 7, cuerpo: parar({ turno: 'c9d1-2', pj: PJ_DOS }) }));
  assert.equal(c.parados, 0, 'el de otro personaje que está en marcha sigue');
  c.soltar(respuestaTati);
  assert.equal((await uno).texto, 'ruta larga');
  const registro = await dos;
  assert.deepEqual({ tipo: registro.tipo, texto: registro.texto }, { tipo: 'detenido', texto: 'Parado' });
  assert.equal(c.pedidos.length, 1, 'a TATI solo le llegó el primero');
  assert.match(leerLog(), /mensaje c9d1-2: tati detenido en \d+ ms/);
});

test('con el puente apagado o sin el cerebro TATI, un parar no hace nada', async () => {
  for (const puente of [() => ({ activo: false }), () => ({ activo: true, cerebro: 'snetforever' })]) {
    const c = cerebroFalso();
    const x = nucleo({ puente, cerebro: c });
    const antes = fotoRanuras();
    assert.equal(await x.nucleo.recibirTrama(trama({ id: 'c9d1-P1', r: 6, cuerpo: parar() })), null);
    assert.equal(c.parados, 0);
    assert.deepEqual(fotoRanuras(), antes);
    assert.equal(x.nucleo.estado().seq, 0);
  }
});

test('un parar ilegible (id …-P<k>) se descarta sin error en el chat ni ranura', async () => {
  const c = cerebroFalso();
  const x = nucleo({ puente: CON_TATI, cerebro: c });
  const antes = fotoRanuras();
  const cabeza = Buffer.from(['SNF1', PJ, 'c9d1-P1', '1', '1', '0', '6', '0', ''].join('\x1f'), 'utf8');
  assert.equal(await x.nucleo.recibirTrama(Buffer.concat([cabeza, Buffer.from('{roto', 'utf8')])), null);
  assert.deepEqual(fotoRanuras(), antes);
  assert.equal(x.nucleo.estado().seq, 0);
});

test('ronda1 p1: con otro mensaje del mismo pj en la cola, el turno en curso deja de pulsar', async () => {
  const c = cerebroFalso();
  const x = nucleo({ puente: CON_TATI, cerebro: c });
  const cuenta = () => x.sacados.filter((s) => s === 'recibido_impar').length;
  const uno = x.nucleo.recibirTrama(trama({ r: 6, cuerpo: mensaje() }));
  await hasta(() => c.alSeguir && cuenta() === 1);
  await new Promise((res) => setTimeout(res, 40));
  const seguir = c.alSeguir;
  const dos = x.nucleo.recibirTrama(trama({ id: 'c9d1-3', r: 7, cuerpo: mensaje({ id: 'c9d1-3' }) })); // la misma paridad
  await hasta(() => x.nucleo.estado().enCola === 2 && cuenta() === 2);
  await new Promise((res) => setTimeout(res, 40));
  seguir();
  await new Promise((res) => setTimeout(res, 60));
  assert.equal(cuenta(), 2, 'su pulso se tomaría por el acuse del mensaje de detrás');
  c.soltar(respuestaTati);
  await uno;
  await hasta(() => c.pedidos.length === 2);
  c.soltar(respuestaTati);
  await dos;
});

test('ronda1 p1: un mensaje de otro personaje en la cola no le quita los pulsos', async () => {
  const c = cerebroFalso();
  const x = nucleo({ puente: CON_TATI, cerebro: c });
  const cuenta = () => x.sacados.filter((s) => s === 'recibido_impar').length;
  const uno = x.nucleo.recibirTrama(trama({ r: 6, cuerpo: mensaje() }));
  await hasta(() => c.alSeguir && cuenta() === 1);
  await new Promise((res) => setTimeout(res, 40));
  const seguir = c.alSeguir;
  const dos = x.nucleo.recibirTrama(trama({ pj: PJ_DOS, id: 'e7aa-2', r: 7, cuerpo: mensaje({ id: 'e7aa-2', pj: PJ_DOS }) }));
  await hasta(() => x.nucleo.estado().enCola === 2);
  seguir();
  await hasta(() => cuenta() === 2);
  c.soltar(respuestaTati);
  await uno;
  await hasta(() => c.pedidos.length === 2);
  c.soltar(respuestaTati);
  await dos;
});

test('ronda1 p2: parar un mensaje en cola tras un turno de TATI del mismo pj para también el de en curso', async () => {
  const c = cerebroFalso();
  const x = nucleo({ puente: CON_TATI, cerebro: c });
  const uno = x.nucleo.recibirTrama(trama({ r: 6, cuerpo: mensaje() }));
  await hasta(() => c.pedidos.length === 1);
  // Tras un /reload: otra sesión, y el turno viejo sigue en marcha.
  const dos = x.nucleo.recibirTrama(trama({ id: 'e7aa-2', r: 1, cuerpo: mensaje({ id: 'e7aa-2' }) }));
  await hasta(() => x.nucleo.estado().enCola === 2);
  await x.nucleo.recibirTrama(trama({ id: 'e7aa-P1', r: 1, cuerpo: parar({ id: 'e7aa-P1', turno: 'e7aa-2' }) }));
  try {
    assert.equal(c.parados, 1);
  } finally {
    c.soltar(respuestaTati);
  }
  assert.equal((await uno).tipo, 'detenido');
  assert.equal((await dos).tipo, 'detenido');
  assert.equal(c.pedidos.length, 1, 'el de la cola no llega a TATI');
});

test('ronda1 p3: cambiar de cerebro a mitad no deja imparable el turno de TATI en curso', async () => {
  let elegido = 'tati';
  const c = cerebroFalso();
  const x = nucleo({ puente: () => ({ activo: true, cerebro: elegido }), cerebro: c });
  const uno = x.nucleo.recibirTrama(trama({ r: 6, cuerpo: mensaje() }));
  await hasta(() => c.pedidos.length === 1);
  elegido = 'snetforever';
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-P1', r: 6, cuerpo: parar() }));
  try {
    assert.equal(c.parados, 1);
  } finally {
    c.soltar(respuestaTati);
  }
  assert.equal((await uno).tipo, 'detenido');
});

test('ronda1 p6: la cabecera dice sabeParar siempre, también con el puente apagado', async () => {
  for (const opciones of [{}, { puente: CON_TATI }]) {
    const x = nucleo(opciones);
    await x.nucleo.publicarEstado();
    assert.equal(leerBuzon(1).estado.sabeParar, true);
  }
});
