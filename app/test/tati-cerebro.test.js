// TATI como cerebro de los mensajes del juego (tarea S5): con `cerebro: 'tati'` cada turno va a TATI por el canal de
// archivos `tati` en lugar de a Claude o Codex, y su texto pasa por lo mismo que el de Claude. Un «TATI de prueba» atiende
// el canal con `atender` de correo.mjs; un reloj de prueba hace que los 5 s sin acuse pasen deprisa. Con el andamio de
// nucleo-tati.test.js (el claude falso, timbres de prueba, AddOns y datos en carpetas temporales). Nombres inventados.
import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeFs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { cargarBase } from '../src/base/base.mjs';
import { crearNucleo } from '../src/nucleo.mjs';
import { crearHistorial } from '../src/historial.mjs';
import { crearTimbres } from '../src/timbres.mjs';
import { prepararAddOns } from '../src/instalacion.mjs';
import { preguntar as preguntarClaude, olvidarOpciones } from '../src/claude.mjs';
import { SISTEMA, SISTEMA_TATI, bloqueDatos, neutralizar, construirEntrada } from '../src/prompt.mjs';
import { textoError, textoMotor, textoDetalle, ERRORES_TATI, ERRORES } from '../src/textos.mjs';
import { atender, leerSobre } from '../src/tati/correo.mjs';
import { crearCerebro, TIEMPO_TATI_MS, DETALLES_TATI, SIN_SENAL_MS, SIGUE_CADA_MS } from '../src/tati/cerebro.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO = { ruta: join(AQUI, 'falso-claude', 'claude.mjs'), tipo: 'node' };
const COPIA = { ...process.env };
const RAIZ = mkdtempSync(join(tmpdir(), 'snf-tati-cerebro-'));
const PJ = 'Tal Cual-Reino Prueba';
const CON_TATI = () => ({ activo: true, cerebro: 'tati' });
const CON_SNET = () => ({ activo: true, cerebro: 'snetforever' });
const LARGO = { timeout: 30_000 };

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
let limpiar = [];

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
  limpiar = [];
});

afterEach(async () => {
  for (const fn of limpiar) await fn();
});

function preparar(i) {
  const base = join(RAIZ, `t${i}`);
  const addons = join(base, 'AddOns');
  mkdirSync(join(addons, 'SnetForever'), { recursive: true });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Interface: 16001\n## Title: SnetForever\n\nnucleo.lua\n');
  const raiz = join(base, 'volumen');
  mkdirSync(raiz);
  prepararAddOns(addons, { raizVolumen: raiz });
  return { base, addons, raiz, datos: join(base, 'datos'), puente: join(base, 'datos', 'puente-tati'), registroFalso: join(base, 'falso.json') };
}

// Reloj de prueba: `t` solo avanza en los `dormir` del canal, `paso` veces lo que se duerme (0: parado). Cada `dormir`
// cede de verdad 5 ms para que el TATI de prueba (con temporizadores de verdad) pueda contestar.
function relojDePrueba(paso = 0) {
  const r = { t: 1_000_000, paso };
  r.ahora = () => r.t;
  r.dormir = async (ms) => {
    await new Promise((res) => setTimeout(res, 5));
    r.t += ms * r.paso;
  };
  return r;
}

// El TATI de prueba: atiende el canal `tati` de la carpeta del puente con `manejar(pedido)`.
function tatiDePrueba(reloj, manejar) {
  const pedidos = [];
  const a = atender(h.puente, /^tati$/, async (canal, pedido) => {
    pedidos.push(pedido);
    return manejar(pedido, pedidos.length);
  }, { cada: 10, reloj: { ahora: () => reloj.t, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (x) => clearTimeout(x) } });
  limpiar.push(() => a.parar());
  return { pedidos };
}

const OK = { estado: 'ok' };
const NO = { estado: 'sin_instalar' };

function nucleo({ puente = CON_TATI, cerebro, obtener, reloj } = {}) {
  const timbres = crearTimbres(h.addons, { pulsoMs: { timbre: 15, recibido: 15, vivo: 15 }, raizVolumen: h.raiz });
  limpiar.push(() => timbres.parar());
  const llamadas = [];
  const comprobados = { claude: 0, codex: 0 };
  const modulos = {
    claude: { preguntar: async (c, o) => { llamadas.push(o); return preguntarClaude(c, o); } },
    codex: { preguntar: async () => { throw new Error('el codex real no se usa en las pruebas'); } },
  };
  const x = crearNucleo({
    base: Promise.resolve(BASE),
    addonsDir: h.addons,
    timbres,
    historial: crearHistorial(h.datos),
    datos: h.datos,
    comprobar: {
      claude: async () => { comprobados.claude += 1; return OK; },
      codex: async () => { comprobados.codex += 1; return NO; },
    },
    programas: { claude: FALSO, codex: { ruta: 'no-existe', tipo: 'node' } },
    modulos,
    raizVolumen: h.raiz,
    obtener,
    puente,
    ...(reloj ? { reloj } : {}),
    ...(cerebro ? { cerebro } : {}),
  });
  return { nucleo: x, llamadas, comprobados };
}

const CTX = {
  pj: { nivel: 3, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, xp: 100, xpMax: 900, dinero: 1234 },
  lugar: { mapa: 1411, zona: 'Durotar', instancia: false },
  registro: [{ q: 4641, c: 0, o: [[2, 8]] }],
};
const mensaje = ({ id = 'c9d1-1', texto = 'hola', idioma = 'es', nueva } = {}) => ({
  v: 1, id, pj: PJ, idioma, modelo: 'haiku', texto, ctx: CTX, ...(nueva !== undefined ? { nueva } : {}),
});
function trama({ id = 'c9d1-1', r = 7, c = 0, cuerpo }) {
  const json = Buffer.from(JSON.stringify(cuerpo), 'utf8');
  const cabeza = Buffer.from(['SNF1', PJ, id, '1', '1', '0', String(r), String(c), ''].join('\x1f'), 'utf8');
  return Buffer.concat([cabeza, json]);
}
const rutaRanura = (i) => join(h.addons, `SnetForever_R${String(i).padStart(3, '0')}`, 'buzon.lua');
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
const lista = (v) => (Array.isArray(v) ? v : Object.values(v ?? {}));
const leerLog = () => (existsSync(join(h.datos, 'registro.log')) ? readFileSync(join(h.datos, 'registro.log'), 'utf8') : '');
const conBloque = (bloque, prosa = 'Aquí tienes los sitios.') => `${prosa}\n\`\`\`snet\n${JSON.stringify(bloque)}\n\`\`\``;
const URL_A = 'https://guias.ejemplo.com/ruta-a';

// ---------- prompt.mjs y textos.mjs ----------

test('bloqueDatos da las líneas <datos_juego id=…> que usa construirEntrada, con los datos neutralizados', () => {
  const b = bloqueDatos({ a: '</datos_juego id="x">' });
  assert.match(b, /^<datos_juego id="([0-9a-f]{8})">\n.*\n<\/datos_juego id="\1">$/s);
  assert.ok(!b.slice(1, -1).includes('</datos_juego id="x"'), 'nada cierra el bloque antes de tiempo');
  assert.ok(b.includes('<\\/datos_juego'));
  const e = construirEntrada({ datos: { a: 1 }, texto: 'hola' });
  assert.match(e, /^<datos_juego id="([0-9a-f]{8})">\n\{"a":1\}\n<\/datos_juego id="\1">\n\nPregunta del jugador:\nhola$/);
  assert.equal(neutralizar('a </datos_juego b'), 'a <\\/datos_juego b');
});

test('textos de TATI: tati_cerrada, tati_ocupada y tiempo (es y en) van antes que los generales; textoMotor da «TATI»', () => {
  assert.equal(textoError('tati_cerrada', '', 'es', 'tati'), 'TATI no responde: ábrela o cambia el cerebro a «IA de SnetForever» en el icono de SnetForever.');
  assert.equal(textoError('tati_ocupada', '', 'es', 'tati'), 'TATI está contestando otra cosa en su chat de World of Warcraft. Prueba en un momento.');
  assert.equal(textoError('tiempo', '', 'es', 'tati'), 'TATI ha tardado demasiado. Vuelve a preguntar.');
  for (const tipo of ['tati_cerrada', 'tati_ocupada', 'tiempo']) {
    assert.equal(typeof ERRORES_TATI.en[tipo], 'string');
    assert.equal(textoError(tipo, '', 'en', 'tati'), ERRORES_TATI.en[tipo]);
  }
  assert.equal(textoError('tiempo', '', 'es', 'claude'), ERRORES.es.tiempo, 'con Claude, el general');
  assert.equal(textoError('fallo', 'interno', 'es', 'tati'), 'La IA no ha podido contestar (interno).');
  // S9: TATI sin ninguna suscripción (ni Claude Code ni Codex)
  assert.equal(textoError('tati_sin_suscripcion', '', 'es', 'tati'),
    'TATI no tiene conectada ninguna suscripción (Claude Code o Codex). Conéctala en TATI o cambia el cerebro a «IA de SnetForever» en el icono de SnetForever.');
  assert.equal(textoError('tati_sin_suscripcion', '', 'en', 'tati'),
    'TATI has no subscription connected (Claude Code or Codex). Connect one in TATI or switch the brain to "SnetForever AI" on the SnetForever icon.');
  // el consejo del final, igual que el de tati_cerrada (mismas comillas y palabras)
  const consejo = (t, desde) => t.slice(t.indexOf(desde));
  assert.equal(consejo(ERRORES_TATI.en.tati_sin_suscripcion, 'switch the brain'), consejo(ERRORES_TATI.en.tati_cerrada, 'switch the brain'));
  assert.equal(consejo(ERRORES_TATI.es.tati_sin_suscripcion, 'cambia el cerebro'), consejo(ERRORES_TATI.es.tati_cerrada, 'cambia el cerebro'));
  assert.equal(textoMotor('tati'), 'TATI');
  assert.equal(textoMotor('tati', 'en'), 'TATI');
  assert.equal(textoMotor('claude'), 'Motor: Claude');
});

// ---------- cerebro.mjs ----------

test('crearCerebro.turno: pide {tipo: turno} por el canal tati y da el texto de TATI', LARGO, async () => {
  const reloj = relojDePrueba();
  const t = tatiDePrueba(reloj, async () => ({ estado: 'hecho', texto: 'hola desde TATI' }));
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const r = await c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'en', nueva: true });
  assert.deepEqual({ ...r, ms: typeof r.ms }, { ok: true, texto: 'hola desde TATI', ms: 'number', motor: 'tati' });
  assert.equal(t.pedidos.length, 1);
  const p = t.pedidos[0];
  assert.deepEqual({ tipo: p.tipo, instrucciones: p.instrucciones, datos: p.datos, texto: p.texto, idioma: p.idioma, nueva: p.nueva },
    { tipo: 'turno', instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'en', nueva: true });
  assert.equal(c.ultimo(), 'ok', 'un turno contestado dice que TATI está');
  assert.equal(TIEMPO_TATI_MS, 400_000);
});

test('crearCerebro.turno: los errores de TATI pasan a tati_ocupada, tati_sin_suscripcion y fallo', LARGO, async () => {
  const reloj = relojDePrueba();
  const respuestas = [
    { estado: 'error', tipo: 'ocupada' },
    { estado: 'error', tipo: 'fallo', detalle: 'algo raro' },
    { estado: 'hecho' }, // sin texto
    { estado: 'error', tipo: 'otra_cosa' },
    { estado: 'error', tipo: 'sin_suscripcion' },
  ];
  tatiDePrueba(reloj, async (p, i) => respuestas[i - 1]);
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const tipos = [];
  for (let i = 0; i < respuestas.length; i++) {
    const r = await c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
    assert.equal(r.ok, false);
    assert.equal(r.motor, 'tati');
    tipos.push(r.tipo);
  }
  assert.deepEqual(tipos, ['tati_ocupada', 'fallo', 'fallo', 'fallo', 'tati_sin_suscripcion']);
});

test('crearCerebro.turno: sin acuse en 5 s de reloj de prueba da tati_cerrada; un pedido que no se escribe, fallo', LARGO, async () => {
  const reloj = relojDePrueba(1);
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const t0 = reloj.t;
  const r = await c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
  assert.equal(r.ok, false);
  assert.equal(r.tipo, 'tati_cerrada');
  assert.ok(reloj.t - t0 >= 5000 && reloj.t - t0 < 6000, `${reloj.t - t0} ms de reloj de prueba`);
  assert.equal(c.ultimo(), 'desconocido');

  const roto = { ...nodeFs, writeFileSync() { throw Object.assign(new Error('no'), { code: 'EACCES' }); } };
  const d = crearCerebro({ carpeta: h.puente, fs: roto, ahora: reloj.ahora, dormir: reloj.dormir });
  const s = await d.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
  assert.equal(s.ok, false);
  assert.equal(s.tipo, 'fallo');
});

test('crearCerebro.turno: tras el acuse, sin resultado en TIEMPO_TATI_MS da tiempo', LARGO, async () => {
  const reloj = relojDePrueba(0);
  let soltar;
  tatiDePrueba(reloj, () => {
    reloj.paso = 1000; // con el acuse escrito, el reloj de prueba corre: 250 000 ms por cada vuelta
    return new Promise((res) => { soltar = res; });
  });
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const t0 = reloj.t;
  const r = await c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
  assert.equal(r.tipo, 'tiempo');
  assert.ok(reloj.t - t0 >= TIEMPO_TATI_MS);
  soltar({ estado: 'hecho', texto: 'tarde' });
});

// TATI con señales: acusa y, con el reloj corriendo 20 s por vuelta, escribe `tati.senal.json` cada 20 s hasta `callaEn`
// (ms desde el acuse) y contesta con `resultado` a los `acabaEn` ms. Devuelve el `dormir` para el cerebro y lo visto.
function tatiConSenales(reloj, { acabaEn = Infinity, callaEn = Infinity, resultado = { estado: 'hecho', texto: 'ruta larga' } } = {}) {
  const visto = { id: null, inicio: null, pedidos: [] };
  let soltar = () => {};
  let ultima = -Infinity;
  const t = tatiDePrueba(reloj, (p) => {
    visto.id = p.id;
    visto.inicio = reloj.t;
    visto.pedidos.push(p);
    reloj.paso = 80; // 250 ms de espera son 20 s de reloj de prueba
    return new Promise((res) => { soltar = res; });
  });
  // Antes que el `parar` del TATI de prueba, que espera a que acabe su `manejar`.
  limpiar.unshift(() => soltar({ estado: 'hecho', texto: 'fin de la prueba' }));
  const dormir = async (ms) => {
    await reloj.dormir(ms);
    if (visto.id === null) return;
    const pasado = reloj.t - visto.inicio;
    if (pasado < callaEn && reloj.t - ultima >= 20_000) {
      ultima = reloj.t;
      writeFileSync(join(h.puente, 'tati.senal.json'), JSON.stringify({ v: 1, id: visto.id, cuando: reloj.t, estado: 'trabajando' }));
    }
    if (pasado >= acabaEn) soltar(resultado);
  };
  return { dormir, visto, t, soltar: (r) => soltar(r) };
}

test('un turno de más de 400 s que sigue dando señales no da tiempo', LARGO, async () => {
  const reloj = relojDePrueba(0);
  const tati = tatiConSenales(reloj, { acabaEn: 500_000 });
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: tati.dormir });
  const r = await c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
  assert.equal(r.tipo, undefined, `no debe cortarse: ${JSON.stringify(r)}`);
  assert.equal(r.ok, true);
  assert.equal(r.texto, 'ruta larga');
  assert.ok(r.ms > TIEMPO_TATI_MS, `${r.ms} ms`);
});

test('el pedido de un turno lleva senales: 1 y el de estado no', LARGO, async () => {
  const reloj = relojDePrueba();
  const t = tatiDePrueba(reloj, async (p) => (p.tipo === 'turno' ? { estado: 'hecho', texto: 'x' } : { estado: 'hecho' }));
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  await c.comprobar();
  await c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
  const estado = t.pedidos.find((p) => p.tipo === 'estado');
  const turno = t.pedidos.find((p) => p.tipo === 'turno');
  assert.equal(turno.senales, 1);
  assert.ok(!('senales' in estado), 'el de estado no lo lleva');
});

test('con señales, 120 s de silencio dan tati_cerrada y el cerebro queda libre', LARGO, async () => {
  assert.equal(SIN_SENAL_MS, 120_000);
  const reloj = relojDePrueba(0);
  const tati = tatiConSenales(reloj, { callaEn: 200_000 });
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: tati.dormir });
  const r = await c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
  assert.equal(r.tipo, 'tati_cerrada');
  const pasado = reloj.t - tati.visto.inicio;
  assert.ok(pasado >= 200_000 + 100_000 && pasado <= 200_000 + 160_000, `${pasado} ms`);
  assert.equal(c.ultimo(), 'desconocido');
  assert.equal(await c.parar(), false, 'ya no hay turno');
});

test('parar escribe tati.parar.json con el id del pedido; la respuesta de TATI da detenido con su detalle', LARGO, async () => {
  const reloj = relojDePrueba(0);
  const tati = tatiConSenales(reloj);
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: tati.dormir });
  assert.equal(await c.parar(), false, 'sin turno no hay nada que parar');
  assert.ok(!existsSync(join(h.puente, 'tati.parar.json')));
  const turno = c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
  while (tati.visto.id === null) await new Promise((res) => setTimeout(res, 5));
  assert.equal(await c.parar(), true);
  const sobre = leerSobre(join(h.puente, 'tati.parar.json'));
  assert.equal(sobre.id, tati.visto.id);
  assert.equal(sobre.v, 1);
  assert.ok(Number.isFinite(sobre.cuando));
  tati.soltar({ estado: 'error', tipo: 'detenido', detalle: 'Se detuvo el turno en TATI.' });
  const r = await turno;
  assert.deepEqual({ ok: r.ok, tipo: r.tipo, detalle: r.detalle }, { ok: false, tipo: 'detenido', detalle: 'Se detuvo el turno en TATI.' });
});

test('parar con una TATI vieja que no contesta: detenido a los 15 s', LARGO, async () => {
  const reloj = relojDePrueba(0);
  const tati = tatiConSenales(reloj);
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: tati.dormir });
  const turno = c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
  while (tati.visto.id === null) await new Promise((res) => setTimeout(res, 5));
  await c.parar();
  const t0 = reloj.t;
  const r = await turno;
  assert.equal(r.tipo, 'detenido');
  assert.ok(reloj.t - t0 >= 15_000 && reloj.t - t0 <= 40_000, `${reloj.t - t0} ms`);
});

test('parar con un fallo al escribir el archivo deja de esperar igual, sin agotar el plazo', LARGO, async () => {
  const reloj = relojDePrueba(0);
  const tati = tatiConSenales(reloj);
  const fs = {
    ...nodeFs,
    writeFileSync(r, ...x) {
      if (String(r).includes('tati.parar.json')) throw Object.assign(new Error('no'), { code: 'EACCES' });
      return nodeFs.writeFileSync(r, ...x);
    },
  };
  const c = crearCerebro({ carpeta: h.puente, fs, ahora: reloj.ahora, dormir: tati.dormir });
  const turno = c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false });
  while (tati.visto.id === null) await new Promise((res) => setTimeout(res, 5));
  const t0 = reloj.t;
  assert.equal(await c.parar(), true);
  const r = await turno;
  assert.equal(r.tipo, 'detenido');
  assert.ok(reloj.t - t0 <= 20_000, `${reloj.t - t0} ms`);
});

test('alSeguir se llama como mucho cada 30 s mientras se espera', LARGO, async () => {
  assert.equal(SIGUE_CADA_MS, 30_000);
  const reloj = relojDePrueba(0);
  const tati = tatiConSenales(reloj, { acabaEn: 300_000 });
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: tati.dormir });
  const momentos = [];
  const r = await c.turno({
    instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false,
    alSeguir: () => { momentos.push(reloj.t); throw new Error('un aviso que falla no para el turno'); },
  });
  assert.equal(r.ok, true);
  assert.ok(momentos.length >= 5, `${momentos.length} avisos`);
  for (let i = 1; i < momentos.length; i++) assert.ok(momentos[i] - momentos[i - 1] >= 30_000);
});

test('detenido se dice «Parado» / «Stopped», sin el detalle y sin pedir que se vuelva a preguntar', () => {
  assert.equal(textoError('detenido', textoDetalle('Se detuvo el turno en TATI.', 'es'), 'es', 'tati'), 'Parado');
  assert.equal(textoError('detenido', textoDetalle('Se detuvo el turno en TATI.', 'en'), 'en', 'tati'), 'Stopped');
});

test('crearCerebro.comprobar: pide {tipo: estado}, da ok o desconocido y recuerda el resultado 60 s', LARGO, async () => {
  const reloj = relojDePrueba(0);
  const t = tatiDePrueba(reloj, async () => ({ estado: 'hecho', chat: false }));
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  assert.equal(c.ultimo(), 'desconocido', 'antes de nada');
  assert.equal(await c.comprobar(), 'ok');
  assert.equal(t.pedidos.length, 1);
  assert.equal(t.pedidos[0].tipo, 'estado');
  assert.equal(c.ultimo(), 'ok');
  reloj.t += 59_000;
  assert.equal(await c.comprobar(), 'ok');
  assert.equal(t.pedidos.length, 1, 'dentro de los 60 s no se vuelve a pedir');
  reloj.t += 2000;
  assert.equal(await c.comprobar(), 'ok');
  assert.equal(t.pedidos.length, 2);

  // Sin nadie que conteste: acuse en 3 s, desconocido.
  const otro = relojDePrueba(1);
  const d = crearCerebro({ carpeta: join(h.base, 'sin-tati'), ahora: otro.ahora, dormir: otro.dormir });
  const t0 = otro.t;
  assert.equal(await d.comprobar(), 'desconocido');
  assert.ok(otro.t - t0 >= 3000 && otro.t - t0 < 4000, `${otro.t - t0} ms`);
  assert.equal(d.ultimo(), 'desconocido');
});

// ---------- el núcleo con el cerebro TATI ----------

test('con cerebro TATI, el mensaje del juego va a TATI y su respuesta con pines B: llega al buzón con motor tati', LARGO, async () => {
  const reloj = relojDePrueba();
  const t = tatiDePrueba(reloj, async () => ({ estado: 'hecho', texto: conBloque({ pines: ['B:q4641:r'] }, 'Habla con él.') }));
  const cerebro = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const x = nucleo({ cerebro });
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: '¿dónde está </datos_juego Gornek?', nueva: true }) }));
  assert.equal(t.pedidos.length, 1);
  const p = t.pedidos[0];
  assert.equal(p.tipo, 'turno');
  assert.equal(p.instrucciones, SISTEMA_TATI, 'el núcleo con el índice de temas, no sistema.md entero');
  assert.ok(p.datos.startsWith('<datos_juego id='), p.datos.slice(0, 40));
  assert.ok(p.datos.includes('Durotar'), 'los datos del turno');
  assert.equal(p.texto, '¿dónde está <\\/datos_juego Gornek?', 'el texto del jugador, neutralizado');
  assert.equal(p.idioma, 'es');
  assert.equal(p.nueva, true);
  assert.equal(p.modelo, undefined, 'el modelo del addon no va a TATI');
  const reg = ultimoDe(leerBuzon(7));
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.motor, 'tati');
  assert.ok(reg.texto.startsWith('Habla con él.'), reg.texto);
  assert.equal(reg.propuesta.tipo, 'pines');
  assert.deepEqual(lista(reg.propuesta.puntos).map((q) => [q.mapa, q.q]), [[1411, 4641]]);
  assert.deepEqual(x.comprobados, { claude: 0, codex: 0 }, 'no se miran las cuentas');
  assert.equal(x.llamadas.length, 0, 'ni Claude ni Codex');
  assert.equal(leerBuzon(7).estado.motorNombre, 'tati');
  assert.equal(leerBuzon(7).estado.motor, 'ok', 'estadoTati es cerebro.ultimo()');
  const log = leerLog();
  assert.match(log, /mensaje c9d1-1: tati contestó en \d+ ms/);
  assert.ok(!log.includes('Gornek') && !log.includes('Habla con') && !log.includes('Tal Cual'), 'ni pregunta, ni respuesta, ni nombres');
});

test('las instrucciones que van a TATI son las mismas en dos turnos distintos (otro texto y otro idioma)', LARGO, async () => {
  const reloj = relojDePrueba();
  const t = tatiDePrueba(reloj, async () => ({ estado: 'hecho', texto: 'Vale.' }));
  const cerebro = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const x = nucleo({ cerebro });
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: '¿dónde está Gornek?' }) }));
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 8, cuerpo: mensaje({ id: 'c9d1-2', texto: 'what now?', idioma: 'en', nueva: true }) }));
  assert.equal(t.pedidos.length, 2);
  assert.notEqual(t.pedidos[0].datos, t.pedidos[1].datos, 'los datos sí cambian');
  assert.equal(t.pedidos[0].instrucciones, SISTEMA_TATI);
  assert.equal(t.pedidos[1].instrucciones, t.pedidos[0].instrucciones);
  assert.ok(t.pedidos[0].instrucciones.length < SISTEMA.length / 2);
});

for (const [idioma, tipo, manejar, paso] of [
  ['es', 'tati_cerrada', null, 1],
  ['en', 'tati_cerrada', null, 1],
  ['es', 'tati_ocupada', async () => ({ estado: 'error', tipo: 'ocupada' }), 0],
  ['es', 'tati_sin_suscripcion', async () => ({ estado: 'error', tipo: 'sin_suscripcion' }), 0],
  ['en', 'tati_sin_suscripcion', async () => ({ estado: 'error', tipo: 'sin_suscripcion' }), 0],
]) {
  test(`con cerebro TATI: ${tipo} (${idioma}) da un registro de error con su texto en el idioma del mensaje`, LARGO, async () => {
    const reloj = relojDePrueba(paso);
    if (manejar) tatiDePrueba(reloj, manejar);
    const cerebro = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
    const x = nucleo({ cerebro });
    const t0 = reloj.t;
    await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ idioma }) }));
    const reg = ultimoDe(leerBuzon(7));
    assert.equal(reg.t, 'error');
    assert.equal(reg.tipo, tipo);
    assert.equal(reg.motor, 'tati');
    assert.equal(reg.texto, ERRORES_TATI[idioma][tipo]);
    if (tipo === 'tati_cerrada') assert.ok(reloj.t - t0 < 6000, `${reloj.t - t0} ms de reloj de prueba`);
    assert.deepEqual(x.comprobados, { claude: 0, codex: 0 });
    assert.equal(x.llamadas.length, 0);
    assert.match(leerLog(), new RegExp(`mensaje c9d1-1: tati error ${tipo} en \\d+ ms`));
  });
}

test('con cerebro TATI: la respuesta tardía del turno anterior (otro id) no entra en el siguiente', LARGO, async () => {
  const reloj = relojDePrueba(0);
  let soltar;
  const t = tatiDePrueba(reloj, (pedido, i) => {
    if (i === 1) {
      reloj.paso = 1000; // el primero se queda sin resultado: tiempo enseguida
      return new Promise((res) => { soltar = res; });
    }
    return { estado: 'hecho', texto: 'respuesta dos' };
  });
  const cerebro = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const x = nucleo({ cerebro });
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-1', r: 3, cuerpo: mensaje({ id: 'c9d1-1', texto: 'uno' }) }));
  assert.equal(ultimoDe(leerBuzon(3)).tipo, 'tiempo');
  assert.equal(ultimoDe(leerBuzon(3)).texto, ERRORES_TATI.es.tiempo);
  reloj.paso = 0;
  const rutaPedido = join(h.puente, 'tati.pedido.json');
  const primero = leerSobre(rutaPedido).id;
  const dos = x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 4, cuerpo: mensaje({ id: 'c9d1-2', texto: 'dos' }) }));
  while (leerSobre(rutaPedido)?.id === primero) await new Promise((res) => setTimeout(res, 5));
  soltar({ estado: 'hecho', texto: 'respuesta uno, tarde' }); // TATI acaba el primero con el segundo ya pedido
  await dos;
  const reg = ultimoDe(leerBuzon(4));
  assert.equal(reg.msg, 'c9d1-2');
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.texto, 'respuesta dos');
  assert.deepEqual(t.pedidos.map((p) => p.texto), ['uno', 'dos']);
});

test('con cerebro TATI: un pinesWeb se comprueba con la página que baja la app (sin r.paginas)', LARGO, async () => {
  const reloj = relojDePrueba();
  const pin = (x, y) => ({ zona: 'Durotar', x, y, url: URL_A });
  tatiDePrueba(reloj, async () => ({ estado: 'hecho', texto: conBloque({ pinesWeb: [pin(45.2, 67.8), pin(11.1, 22.2)] }, 'Según una página.') }));
  const pedidas = [];
  const obtener = async (url) => {
    pedidas.push(url);
    return { url, tipo: 'text/html; charset=utf-8', cuerpo: Buffer.from('<html><body><p>El cofre está en 45.2, 67.8.</p></body></html>', 'utf8') };
  };
  const cerebro = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const x = nucleo({ cerebro, obtener });
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: '¿dónde está el cofre?' }) }));
  assert.deepEqual(pedidas, [URL_A]);
  const reg = ultimoDe(leerBuzon(7));
  assert.equal(reg.motor, 'tati');
  assert.deepEqual(lista(reg.propuesta.puntos).map((p) => [p.mapa, p.x, p.y, p.web]), [[1411, 45.2, 67.8, true]]);
  assert.ok(!leerLog().includes('ejemplo.com'), 'nunca la dirección en el registro');
});

test('con el cerebro en snetforever (o sin cerebro), todo como hoy: contesta el claude falso y TATI no recibe nada', LARGO, async () => {
  const reloj = relojDePrueba();
  const t = tatiDePrueba(reloj, async () => ({ estado: 'hecho', texto: 'no debería' }));
  const cerebro = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const x = nucleo({ cerebro, puente: CON_SNET });
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje() }));
  const reg = ultimoDe(leerBuzon(7));
  assert.equal(reg.texto, 'respuesta falsa');
  assert.equal(reg.motor, 'claude');
  assert.equal(x.llamadas.length, 1);
  assert.equal(x.llamadas[0].sistema, SISTEMA, 'el chat propio de la app sigue con sistema.md entero');
  assert.equal(x.comprobados.claude, 1);
  assert.equal(leerBuzon(7).estado.motorNombre, 'claude');

  // El cerebro tati pedido sin un cerebro dado: también como hoy.
  const y = nucleo({ puente: CON_TATI });
  await y.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 8, cuerpo: mensaje({ id: 'c9d1-2' }) }));
  assert.equal(ultimoDe(leerBuzon(8)).texto, 'respuesta falsa');
  assert.equal(y.llamadas.length, 1);
  assert.equal(t.pedidos.length, 0, 'a TATI no le llega nada');
  assert.equal(existsSync(join(h.puente, 'tati.pedido.json')), false);
});

// Revisión final (I4): el `detalle` de un fallo de TATI solo pasa si es uno de sus textos fijos (DETALLES_TATI); cualquier
// otro (una ruta, un mensaje de error de su motor…) se queda fuera. Los fijos se dicen en el idioma del mensaje.
test('I4: el detalle de TATI solo pasa si es uno de sus textos fijos; una ruta nunca llega al chat del juego', LARGO, async () => {
  const reloj = relojDePrueba();
  const RUTA = 'C:\\Users\\alguien\\AppData\\secreto.json no existe';
  const respuestas = [
    { estado: 'error', tipo: 'fallo', detalle: RUTA },
    ...DETALLES_TATI.map((detalle) => ({ estado: 'error', tipo: 'fallo', detalle })),
  ];
  tatiDePrueba(reloj, async (p, i) => respuestas[(i - 1) % respuestas.length]);
  const c = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const detalles = [];
  for (let i = 0; i < respuestas.length; i++) {
    detalles.push((await c.turno({ instrucciones: 'I', datos: 'D', texto: 'T', idioma: 'es', nueva: false })).detalle);
  }
  assert.deepEqual(detalles, ['', ...DETALLES_TATI]);
  assert.deepEqual(DETALLES_TATI, ['El turno no dio respuesta.', 'Se detuvo el turno en TATI.', 'TATI se cerró con el turno a medias.']);
  // Los fijos tienen su texto en los dos idiomas (no el genérico «motivo desconocido»).
  for (const d of DETALLES_TATI) {
    assert.notEqual(textoDetalle(d, 'es'), textoDetalle('', 'es'), d);
    assert.notEqual(textoDetalle(d, 'en'), textoDetalle('', 'en'), d);
    assert.doesNotMatch(textoDetalle(d, 'en'), /[áéíóúñ]|turno/, d);
  }
});

test('I4: en el juego, el fallo de TATI con una ruta en el detalle sale sin ella; con un texto fijo, con él', LARGO, async () => {
  const reloj = relojDePrueba();
  const respuestas = [
    { estado: 'error', tipo: 'fallo', detalle: 'C:\\Users\\alguien\\secreto.txt' },
    { estado: 'error', tipo: 'fallo', detalle: 'TATI se cerró con el turno a medias.' },
  ];
  tatiDePrueba(reloj, async (p, i) => respuestas[i - 1]);
  const cerebro = crearCerebro({ carpeta: h.puente, ahora: reloj.ahora, dormir: reloj.dormir });
  const x = nucleo({ cerebro, puente: CON_TATI });
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje() }));
  const uno = ultimoDe(leerBuzon(7));
  assert.equal(uno.t, 'error');
  assert.ok(!uno.texto.includes('secreto') && !uno.texto.includes('Users'), uno.texto);
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 8, cuerpo: mensaje({ id: 'c9d1-2', idioma: 'en' }) }));
  const dos = ultimoDe(leerBuzon(8));
  assert.equal(dos.t, 'error');
  assert.ok(dos.texto.includes(textoDetalle('TATI se cerró con el turno a medias.', 'en')), dos.texto);
  assert.ok(!leerLog().includes('secreto'));
});
