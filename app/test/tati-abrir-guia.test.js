// abrir_guia de TATI y abrirGuia del chat del juego: una guía de la biblioteca llega al juego TAL CUAL (la conversión de
// guiaBiblioteca.mjs, una sola para las dos entradas), sin que la IA copie sus pasos. Con el andamio de
// tati-acciones.test.js (núcleo con la base de prueba, timbres, AddOns y datos en carpetas temporales; el registro
// publicado se lee del buzón) y guías INVENTADAS con la forma de 4Ever Leveling y de Polestar: nada de esto es de verdad.
import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeFs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
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
import { crearEstadoJuego } from '../src/tati/estado.mjs';
import { crearAcciones, DEFINICIONES_ACCIONES, REGLAS_TATI } from '../src/tati/acciones.mjs';
import { crearIndice, CARPETA_GUIAS, RUTA_INDICE } from '../src/biblioteca/indice.mjs';
import { registro, paso, tarea, t } from './ayuda/cuatroever.mjs';

// T3 (B2): los tramos pendientes duran unos 7 días (antes, 6 h).
const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO = { ruta: join(AQUI, 'falso-claude', 'claude.mjs'), tipo: 'node' };
const COPIA = { ...process.env };
const RAIZ = mkdtempSync(join(tmpdir(), 'snf-abrir-guia-'));
const PJ = 'Tal Cual-Reino Prueba';
const ACTIVO = { puenteTati: { activo: true } };

const carpetaBase = join(RAIZ, 'base');
mkdirSync(carpetaBase);
copyFileSync(join(AQUI, 'fixtures', 'misiones-app.lua'), join(carpetaBase, 'misiones-app.lua'));
writeFileSync(join(carpetaBase, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', ''].join('\n'));
const BASE = cargarBase(carpetaBase);

after(() => {
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
  const dir = join(RAIZ, `t${n}`);
  const addons = join(dir, 'AddOns');
  mkdirSync(join(addons, 'SnetForever'), { recursive: true });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Interface: 16001\n## Title: SnetForever\n\nnucleo.lua\n');
  const raiz = join(dir, 'volumen');
  mkdirSync(raiz);
  prepararAddOns(addons, { raizVolumen: raiz });
  h = { addons, raiz, datos: join(dir, 'datos'), registroFalso: join(dir, 'falso.json') };
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

// Un núcleo de prueba con el puente activo y las acciones de TATI encima; el chat del juego pregunta al claude falso.
function montar({ juegoAbierto, reloj, base } = {}) {
  const timbres = crearTimbres(h.addons, { pulsoMs: { timbre: 15, recibido: 15, vivo: 15 }, fs: nodeFs, raizVolumen: h.raiz });
  const llamadas = [];
  const modulos = {
    claude: { preguntar: async (c, o) => { llamadas.push(o); return preguntarClaude(c, o); } },
    codex: { preguntar: async () => { throw new Error('el codex real no se usa en las pruebas'); } },
  };
  const estadoJuego = crearEstadoJuego({ datos: h.datos });
  const nucleo = crearNucleo({
    base: base ?? Promise.resolve(BASE),
    addonsDir: h.addons,
    timbres,
    historial: crearHistorial(h.datos),
    datos: h.datos,
    comprobar: { claude: async () => ({ estado: 'ok' }), codex: async () => ({ estado: 'sin_instalar' }) },
    programas: { claude: FALSO, codex: { ruta: 'no-existe', tipo: 'node' } },
    modulos,
    raizVolumen: h.raiz,
    config: ACTIVO,
    estadoJuego,
    ...(reloj ? { reloj } : {}),
  });
  const acciones = crearAcciones({ nucleo, estadoJuego, datos: h.datos, carpetaBase, juegoAbierto });
  const yo = { nucleo, acciones, estadoJuego, llamadas, parar: () => timbres.parar() };
  nucleos.push(yo);
  return yo;
}

const CTX = {
  pj: { nivel: 3, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, xp: 100, xpMax: 900, dinero: 1234 },
  lugar: { mapa: 1411, zona: 'Durotar', instancia: false, x: 42, y: 68 },
  registro: [{ q: 4641, c: 0, o: [[2, 8]], t: 'Tu lugar en el mundo' }],
};
const latido = ({ id = 'c9d1-1', pj = PJ, ctx = CTX } = {}) => ({ v: 1, tipo: 'latido', id, pj, idioma: 'es', ctx });
const mensaje = ({ id = 'c9d1-1', pj = PJ, texto = 'hola' } = {}) => ({ v: 1, id, pj, idioma: 'es', modelo: 'haiku', texto, ctx: CTX });
function trama({ pj = PJ, id = 'c9d1-1', r = 7, c = 0, cuerpo }) {
  const json = Buffer.from(JSON.stringify(cuerpo), 'utf8');
  const cabeza = Buffer.from(['SNF1', pj, id, '1', '1', '0', String(r), String(c), ''].join('\x1f'), 'utf8');
  return Buffer.concat([cabeza, json]);
}
const conLatido = async (x, { r = 7, ctx = CTX } = {}) => {
  await x.nucleo.recibirTrama(trama({ r, cuerpo: latido({ ctx }) }));
  await x.nucleo.inactivo();
};
const decir = async (x, texto, { id, r }) => {
  await x.nucleo.recibirTrama(trama({ id, r, cuerpo: mensaje({ id, texto }) }));
  await x.nucleo.inactivo();
};

const rutaRanura = (i) => join(h.addons, `SnetForever_R${String(i).padStart(3, '0')}`, 'buzon.lua');
const fotoRanuras = () => Array.from({ length: 20 }, (_, k) => (existsSync(rutaRanura(k + 1)) ? readFileSync(rutaRanura(k + 1), 'utf8') : null));
function buzonUltimo(i = 1) {
  const m = crearMaquina({ arrancar: false });
  try {
    const b = m.lua(`${readFileSync(rutaRanura(i), 'utf8')}\nreturn SNF_BUZON`);
    const regs = Array.isArray(b.registros) ? b.registros : Object.values(b.registros ?? {});
    return regs.sort((a, c) => a.seq - c.seq).at(-1);
  } finally {
    m.cerrar();
  }
}
const pasosDe = (guia) => Object.values(guia?.pasos ?? {}).map((p) => Object.values(p.elementos ?? {}));
const leerLog = () => (existsSync(join(h.datos, 'registro.log')) ? readFileSync(join(h.datos, 'registro.log'), 'utf8') : '');
const bloque = (json, prosa = 'Te abro tu guía.') => `${prosa}\n\`\`\`snet\n${JSON.stringify(json)}\n\`\`\``;

// ---------- las guías inventadas ----------

// 4Ever Leveling: un capítulo para guerreros y magos, con un paso solo de magos y otro solo de trols. Las misiones son de
// la base de prueba (790, 792); la ubicación «loc-3» no tiene mapa.
const CUATRO = {
  classSegments: { MAGE: ['horde-1-10-chapter-1-aaa'], WARRIOR: ['horde-1-10-chapter-1-aaa'] },
  id: 'horde-1-10',
  locations: [
    { id: 'loc-1', mapID: 1411, title: t('El cruce inventado'), x: 0.452, y: 0.625 },
    { id: 'loc-2', mapID: 1411, title: t('Otro sitio'), x: 0.1, y: 0.9 },
    { coordinateStatus: 'unmapped', id: 'loc-3', title: t('Sin mapa'), waypoint: false },
  ],
  quests: [{ id: 790, minLevel: 1, title: t('Escorpiones de prueba') }, { id: 792, minLevel: 1, title: t('Mineral de prueba') }],
  segments: {
    'horde-1-10-chapter-1-aaa': {
      chapters: [{ id: 'horde-1-10-chapter-1', level: 1, title: t('1-3 Valle inventado'), untilLevel: 3 }],
      id: 'horde-1-10-chapter-1-aaa',
      orders: { MAGE: ['s1', 's2', 's3', 's4', 's5'], WARRIOR: ['s1', 's2', 's3', 's4', 's5'] },
    },
  },
  steps: {
    s1: paso('s1', 'horde-1-10-chapter-1', [tarea('accept', 790)], 'loc-1', { detail: t('Recoge los escorpiones', 'Pick up the scorpids') }),
    s2: paso('s2', 'horde-1-10-chapter-1', [tarea('accept', 792)], 'loc-2', { conditions: { classes: ['MAGE'] } }),
    s3: paso('s3', 'horde-1-10-chapter-1', [tarea('objective', 790)], 'loc-1', { conditions: { races: ['Troll'] } }),
    s4: paso('s4', 'horde-1-10-chapter-1', [tarea('turn_in', 790)], 'loc-1', { detail: t('Entrega los escorpiones', 'Turn in the scorpids') }),
    s5: paso('s5', 'horde-1-10-chapter-1', [tarea('accept', 792)], 'loc-3', { detail: t('Recoge el mineral', 'Pick up the ore') }),
  },
};

// Polestar: la 93001 no está en la base; la 792, sí.
const POLESTAR = `guide forever/horde/07-inventada
title Polestar inventada
faction Horde
levels 1-10

step El campamento
  tip Habla con el guarda.
  accept 93001
  goto 45.5,62.5 map 1411

step La forja
  accept 792
  goto 52.0,43.0 map 1411

step Solo pícaros
  only Rogue
  goto 40.0,40.0 map 1411
`;

// Una guía larga de Polestar: más pasos de los que caben en 8 guías del addon (400 pasos cada una).
const LARGA = ['guide forever/horde/08-larga', 'title Larga inventada', 'faction Horde', '',
  ...Array.from({ length: 3300 }, (_, i) => `step Ve al sitio ${i + 1}\n  goto ${10 + (i % 80)}.5,20.5 map 1411\n`)].join('\n');

async function biblioteca(archivos) {
  for (const [ruta, texto] of Object.entries(archivos)) {
    const destino = join(h.datos, CARPETA_GUIAS, ...ruta.split('/'));
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, texto);
  }
  await crearIndice({ datos: h.datos, fs: nodeFs, base: async () => BASE }).actualizar();
  const indice = JSON.parse(readFileSync(join(h.datos, RUTA_INDICE), 'utf8'));
  return Object.fromEntries(indice.guias.map((g) => [g.archivo, g.id]));
}

const metas = (pasos) => pasos.flat().filter((e) => e.t === 'goto').map((e) => [e.mapa, e.x, e.y]);
const deMision = (pasos) => pasos.flat().filter((e) => Number.isInteger(e.q)).map((e) => [e.t, e.q]);
const notas = (pasos) => pasos.flat().filter((e) => e.t === 'nota' || e.t === 'manual').map((e) => e.texto.es);

// ---------- las definiciones ----------

test('definiciones(): catorce herramientas con abrir_guia; su descripción con la regla de acción cabe en 400', () => {
  const x = montar();
  const defs = x.acciones.definiciones();
  assert.equal(defs.length, 14);
  assert.equal(new Set(defs.map((d) => d.nombre)).size, 14);
  const abrir = defs.find((d) => d.nombre === 'abrir_guia');
  assert.ok(abrir);
  assert.ok(Array.from(abrir.descripcion).length <= 400, `${Array.from(abrir.descripcion).length} caracteres`);
  assert.ok(abrir.descripcion.endsWith(` ${REGLAS_TATI.accion}`));
  assert.match(abrir.descripcion, /buscar_guias/);
  const esquema = DEFINICIONES_ACCIONES.find((d) => d.nombre === 'abrir_guia').esquema;
  assert.deepEqual(esquema.required, ['guia']);
  assert.deepEqual(Object.keys(esquema.properties).sort(), ['desde', 'guia', 'hasta']);
  assert.equal(esquema.additionalProperties, false);
  // crear_ruta queda para las guías que arma la IA
  assert.match(defs.find((d) => d.nombre === 'crear_ruta').descripcion, /arma/);
  for (const d of defs) assert.ok(Array.from(d.descripcion).length <= 400, d.nombre);
});

// ---------- abrir_guia ----------

test('4Ever inventada: los pasos de su clase y su raza en el orden de la guía, con su texto y su punto; se abre sola', async () => {
  const ids = await biblioteca({ 'inventado/Data.lua': registro('horde-1-10', CUATRO) });
  const x = montar();
  await conLatido(x);
  const antes = x.estadoJuego.ranurasQuedan();
  const r = await x.acciones.ejecutar('abrir_guia', { guia: ids['inventado/Data.lua'] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.tramos, 1);
  assert.equal(r.hasta, 5);
  assert.equal(r.deOtraClase, 2);
  assert.equal(r.sinMision, undefined);
  assert.equal(r.siguiente, undefined);
  assert.equal(r.misiones, 2);
  assert.equal(r.ranurasQuedan, antes - 1);
  const reg = buzonUltimo();
  assert.equal(reg.abrirGuiaIA, true);
  assert.equal(reg.origen, 'tati');
  const pasos = pasosDe(reg.guiaIA);
  // s1, s4 y s5 (el s2 es de magos y el s3 de trols), en su orden y con su sitio: el de la guía (45.2, 62.5) y, el s5
  // que no lo trae, el de recoger de la base
  assert.deepEqual(deMision(pasos), [['accept', 790], ['turnin', 790], ['accept', 792]]);
  assert.deepEqual(metas(pasos).slice(0, 2), [[1411, 45.2, 62.5], [1411, 45.2, 62.5]]);
  assert.equal(metas(pasos).length, 3);
  assert.deepEqual(notas(pasos), ['Recoge los escorpiones', 'Entrega los escorpiones', 'Recoge el mineral']);
  // el inglés de la guía va en la nota (con la marca G:)
  assert.equal(pasos.flat().find((e) => e.t === 'nota').texto.en, 'Pick up the scorpids');
  assert.match(leerLog(), /tati: abrir_guia ok \(tramos 1, pasos 3, misiones 2, hasta 5\)/);
});

test('decisión 1: la misión que solo está en una guía de la biblioteca sale igual por abrir_guia, abrirGuia y crear_ruta; una inventada, por ninguna', async () => {
  const ids = await biblioteca({ 'Polestar/07-inventada.txt': POLESTAR });
  const id = ids['Polestar/07-inventada.txt'];
  // La guía cambia después de indexarla: su paso 1 trae además la 93999, que no está ni en la base ni en ninguna guía
  // del índice (inventada). La 93001 no está en la base, pero sí en esta guía de la biblioteca.
  writeFileSync(join(h.datos, CARPETA_GUIAS, 'Polestar', '07-inventada.txt'), POLESTAR.replace('  accept 93001\n', '  accept 93001\n  accept 93999\n'));
  const x = montar();
  await conLatido(x);
  const r = await x.acciones.ejecutar('abrir_guia', { guia: id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.sinMision, 1, 'el paso 1 va sin la inventada');
  assert.equal(r.deOtraClase, 1);
  const deTati = buzonUltimo().guiaIA;
  const pasos = pasosDe(deTati);
  assert.deepEqual(deMision(pasos), [['accept', 93001], ['accept', 792]], 'la 93001 va; la 93999, no');
  assert.deepEqual(metas(pasos), [[1411, 45.5, 62.5], [1411, 52, 43]], 'los dos sitios de la guía');
  assert.ok(notas(pasos).some((t) => t.includes('Habla con el guarda')), JSON.stringify(notas(pasos)));

  // abrirGuia del chat del juego: la misma guía
  const chat = await x.nucleo.armarRespuesta({ mensaje: mensaje({ texto: 'ábreme la guía' }), texto: bloque({ abrirGuia: { guia: id } }), idioma: 'es' });
  assert.equal(chat.parcial.guiaIA.clave, deTati.clave);
  assert.deepEqual(pasosDe(chat.parcial.guiaIA), pasos);

  // La misma guía copiada por la IA en crear_ruta (lo que da leer_guia, con la inventada): las mismas misiones.
  const leida = await x.acciones.ejecutar('leer_guia', { guia: id });
  const copia = { titulo: 'Copia', pasos: leida.pasos.map((p) => ({ texto: p.texto, misiones: p.misiones.map(({ q, accion }) => ({ q, accion })), punto: p.punto?.marca })) };
  assert.ok(copia.pasos[0].misiones.some((m) => m.q === 93999), 'leer_guia sí da la inventada');
  const c = await x.acciones.ejecutar('crear_ruta', { guia: copia });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.deepEqual(deMision(pasosDe(buzonUltimo().guiaIA)), [['accept', 93001], ['accept', 792]]);
  assert.equal(c.quitados.misiones, 1, 'la inventada se quita, como siempre');
});

test('desde y hasta: el tramo pedido con la numeración de leer_guia', async () => {
  const ids = await biblioteca({ 'inventado/Data.lua': registro('horde-1-10', CUATRO) });
  const x = montar();
  await conLatido(x);
  const r = await x.acciones.ejecutar('abrir_guia', { guia: ids['inventado/Data.lua'], desde: 2, hasta: 4 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.hasta, 4);
  assert.equal(r.deOtraClase, 2);
  assert.deepEqual(deMision(pasosDe(buzonUltimo().guiaIA)), [['turnin', 790]]);
  // solo pasos de otra clase: sin_pasos y nada publicado
  const fotos = fotoRanuras();
  const nada = await x.acciones.ejecutar('abrir_guia', { guia: ids['inventado/Data.lua'], desde: 2, hasta: 3 });
  assert.equal(nada.error, 'sin_pasos', JSON.stringify(nada));
  assert.deepEqual(fotoRanuras(), fotos);
});

test('una guía larga: 8 tramos como mucho, `siguiente` dice desde dónde seguir y el «sigue» del juego la continúa sin la IA', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  const id = ids['Polestar/08-larga.txt'];
  const x = montar();
  await conLatido(x, { r: 2 });
  const r = await x.acciones.ejecutar('abrir_guia', { guia: id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.tramos, 8);
  assert.ok(Number.isInteger(r.siguiente) && r.siguiente > 1 && r.siguiente <= 3300, JSON.stringify(r));
  assert.equal(r.hasta, r.siguiente - 1);
  assert.equal(r.pasos, r.hasta, 'un paso del addon por paso de la guía');
  const primero = pasosDe(buzonUltimo().guiaIA);
  assert.ok(primero.length <= 400);
  assert.ok(buzonUltimo().texto.includes(`${r.siguiente}`), buzonUltimo().texto);
  // los 7 tramos que quedan, con «sigue» en el juego; el siguiente «sigue» abre la guía desde `siguiente`
  for (let i = 0; i < 7; i++) await decir(x, 'sigue', { id: `c9d1-${i + 2}`, r: 3 + i });
  assert.equal(x.llamadas.length, 0, 'los tramos se mandan sin la IA');
  assert.match(buzonUltimo(9).texto, /Parte 8 de 8/);
  await decir(x, 'sigue', { id: 'c9d1-9', r: 10 });
  assert.equal(x.llamadas.length, 0, 'seguir la guía tampoco pregunta a la IA');
  const sigue = buzonUltimo(10);
  assert.equal(sigue.abrirGuiaIA, true);
  const otra = pasosDe(sigue.guiaIA);
  assert.deepEqual(metas(otra)[0], [1411, 10 + ((r.siguiente - 1) % 80) + 0.5, 20.5], 'empieza en el paso `siguiente`');
});

test('guía desconocida: guia_desconocida y nada publicado; con el juego cerrado o sin ranuras, los errores comunes', async () => {
  await biblioteca({ 'Polestar/07-inventada.txt': POLESTAR });
  // sin ningún latido todavía (el estado del juego se guarda en la carpeta de datos)
  const cerrado = montar({ juegoAbierto: () => false });
  assert.deepEqual(await cerrado.acciones.ejecutar('abrir_guia', { guia: 'ffffffff' }), { error: 'juego_cerrado' });
  const sinPj = montar({ juegoAbierto: () => true });
  assert.deepEqual(await sinPj.acciones.ejecutar('abrir_guia', { guia: 'ffffffff' }), { error: 'sin_personaje' });
  const x = montar();
  await conLatido(x);
  const fotos = fotoRanuras();
  assert.deepEqual(await x.acciones.ejecutar('abrir_guia', { guia: 'ffffffff' }), { error: 'guia_desconocida' });
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.nucleo.estado().seq, 0);
  assert.match(leerLog(), /tati: abrir_guia guia_desconocida/);
  for (const args of [{}, { guia: 5 }, { guia: 'ffffffff', desde: 0 }, { guia: 'ffffffff', hasta: 'x' }, { guia: 'ffffffff', nivel: 3 }]) {
    assert.deepEqual(await x.acciones.ejecutar('abrir_guia', args), { error: 'argumentos' }, JSON.stringify(args));
  }
  const lleno = montar();
  await conLatido(lleno, { r: 20 });
  assert.deepEqual(await lleno.acciones.ejecutar('escribir_chat', { texto: 'una' }), { ok: true, ranurasQuedan: 0 });
  assert.deepEqual(await lleno.acciones.ejecutar('abrir_guia', { guia: 'ffffffff' }), { error: 'sin_ranuras', consejo: '/reload' });
});

test('cambio de personaje mientras se arma: cambio_personaje y nada publicado', async () => {
  const ids = await biblioteca({ 'Polestar/07-inventada.txt': POLESTAR });
  const x = montar();
  await conLatido(x);
  const otro = 'Otro Tal-Reino Prueba';
  const envuelto = {
    ...x.nucleo,
    armarRespuesta: async (o) => {
      const r = await x.nucleo.armarRespuesta(o);
      await x.estadoJuego.apuntar(otro, { ...latido({ pj: otro, id: 'e2f3-1' }) }, 5);
      return r;
    },
  };
  const acciones = crearAcciones({ nucleo: envuelto, estadoJuego: x.estadoJuego, datos: h.datos, carpetaBase });
  const fotos = fotoRanuras();
  assert.deepEqual(await acciones.ejecutar('abrir_guia', { guia: ids['Polestar/07-inventada.txt'] }), { error: 'cambio_personaje' });
  assert.deepEqual(fotoRanuras(), fotos);
  assert.match(leerLog(), /tati: abrir_guia cambio_personaje/);
});

// ---------- abrirGuia en el chat del juego ----------

test('el chat del juego con abrirGuia y abrir_guia de TATI publican la misma guía', async () => {
  const ids = await biblioteca({ 'Polestar/07-inventada.txt': POLESTAR, 'inventado/Data.lua': registro('horde-1-10', CUATRO) });
  for (const [k, id] of Object.values(ids).entries()) {
    const tati = montar();
    await conLatido(tati);
    assert.equal((await tati.acciones.ejecutar('abrir_guia', { guia: id })).ok, true);
    const deTati = buzonUltimo();

    process.env.FALSO_RESPUESTA = bloque({ abrirGuia: { guia: id } });
    const chat = montar();
    await decir(chat, 'ábreme la guía', { id: `c9d1-${k + 2}`, r: 8 });
    assert.equal(chat.llamadas.length, 1);
    const delChat = buzonUltimo(8);
    assert.equal(delChat.abrirGuiaIA, true);
    assert.deepEqual(delChat.guiaIA, deTati.guiaIA, 'mismos pasos, textos, puntos, misiones y tramos');
    assert.ok(delChat.texto.startsWith('Te abro tu guía.'), delChat.texto);
  }
});

test('el chat del juego: con abrirGuia y guiaNueva gana abrirGuia; un id desconocido no publica guía y lo dice en una línea', async () => {
  const ids = await biblioteca({ 'Polestar/07-inventada.txt': POLESTAR });
  const id = ids['Polestar/07-inventada.txt'];
  const x = montar();
  await conLatido(x);
  const m = mensaje({ texto: 'ábreme la guía' });
  const ambas = await x.nucleo.armarRespuesta({ mensaje: m, texto: bloque({ abrirGuia: { guia: id }, guiaNueva: { titulo: 'Otra', pasos: [{ texto: 'Ve', punto: 'B:n10176' }] } }), idioma: 'es' });
  assert.deepEqual(deMision(pasosDe(ambas.parcial.guiaIA)), [['accept', 93001], ['accept', 792]]);
  assert.equal(ambas.parcial.abrirGuiaIA, true);
  const desconocida = await x.nucleo.armarRespuesta({ mensaje: m, texto: bloque({ abrirGuia: { guia: 'ffffffff' } }), idioma: 'es' });
  assert.equal(desconocida.parcial.guiaIA, undefined);
  assert.equal(desconocida.parcial.abrirGuiaIA, undefined);
  assert.match(desconocida.parcial.texto, /no está en tu biblioteca/);
  assert.deepEqual(desconocida.ruta, { error: 'guia_desconocida' });
});

test('M2: un abrirGuia que no vale dice que el pedido no vale (no que no está en la biblioteca) y no abre la rutaZona del bloque', async () => {
  const ids = await biblioteca({ 'Polestar/07-inventada.txt': POLESTAR });
  const x = montar();
  await conLatido(x);
  const m = mensaje({ texto: 'ábreme la guía' });
  const malo = await x.nucleo.armarRespuesta({ mensaje: m, texto: bloque({ abrirGuia: { guia: ids['Polestar/07-inventada.txt'], desde: '5' }, rutaZona: { zona: 'Durotar' } }), idioma: 'es' });
  assert.equal(malo.parcial.guiaIA, undefined);
  assert.match(malo.parcial.texto, /El pedido de la guía no vale/);
  assert.doesNotMatch(malo.parcial.texto, /no está en tu biblioteca/);
  const en = await x.nucleo.armarRespuesta({ mensaje: { ...m, idioma: 'en' }, texto: bloque({ abrirGuia: { guia: 'x' } }), idioma: 'en' });
  assert.match(en.parcial.texto, /The guide request is not valid/);
});

// ---------- ronda 2: las previas (decisión 2, I3) ----------

// La 788 de la base necesita antes la 4641 (preQuestSingle).
const CON_PREVIA = `guide forever/horde/11-previas
title Previas inventadas
faction Horde

step La primera
  accept 4641
  goto 42.0,68.0 map 1411

step La segunda
  accept 788
  goto 51.0,41.0 map 1411
`;
const SOLO_788 = `guide forever/horde/12-sola
title Sola inventada
faction Horde

step La segunda
  accept 788
  goto 51.0,41.0 map 1411
`;
const SIN_REGISTRO = { ...CTX, registro: [] };

test('previas en frío: la que ya está en su registro no se añade; la que puede coger, sí, y se cuenta', async () => {
  const ids = await biblioteca({ 'Polestar/12-sola.txt': SOLO_788 });
  const id = ids['Polestar/12-sola.txt'];
  const hecha = montar();
  await conLatido(hecha);
  const a = await hecha.acciones.ejecutar('abrir_guia', { guia: id });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.previas, 0);
  assert.deepEqual(deMision(pasosDe(buzonUltimo().guiaIA)), [['accept', 788]]);

  const falta = montar();
  await conLatido(falta, { ctx: SIN_REGISTRO, r: 9 });
  const b = await falta.acciones.ejecutar('abrir_guia', { guia: id });
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.equal(b.previas, 1);
  const reg = buzonUltimo();
  const misiones = deMision(pasosDe(reg.guiaIA));
  assert.ok(misiones.findIndex(([t, q]) => t === 'accept' && q === 4641) < misiones.findIndex(([t, q]) => t === 'accept' && q === 788), JSON.stringify(misiones));
  assert.match(reg.texto, /Añadí delante 1 misión previa/);
});

test('I3: abrir desde un paso de más adelante da por hechas las misiones de los pasos de antes: ni previas repetidas ni misiones perdidas', async () => {
  const ids = await biblioteca({ 'Polestar/11-previas.txt': CON_PREVIA });
  const x = montar();
  await conLatido(x, { ctx: SIN_REGISTRO });
  const r = await x.acciones.ejecutar('abrir_guia', { guia: ids['Polestar/11-previas.txt'], desde: 2 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.previas, 0);
  assert.deepEqual(deMision(pasosDe(buzonUltimo().guiaIA)), [['accept', 788]], 'la 788 se queda y la 4641 no se mete otra vez');
  assert.doesNotMatch(buzonUltimo().texto, /Quité/);
});

// ---------- ronda 2: los tramos pendientes (I1, decisión 3, M1) ----------

const CORTA = { titulo: 'Corta', pasos: [{ texto: 'Habla con él', punto: 'B:n10176' }] };

test('I1: con tramos pendientes, abrir_guia con el `siguiente` que dio manda el siguiente pendiente; sin pendientes, sigue la guía', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  const id = ids['Polestar/08-larga.txt'];
  const x = montar();
  await conLatido(x, { r: 2 });
  const r = await x.acciones.ejecutar('abrir_guia', { guia: id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.pendientes, 7);
  const claves = [buzonUltimo().guiaIA.clave];
  for (let k = 1; k <= 7; k++) {
    const s = await x.acciones.ejecutar('abrir_guia', { guia: id, desde: r.siguiente });
    assert.equal(s.ok, true, JSON.stringify(s));
    assert.equal(s.tramo, k + 1);
    assert.equal(s.pendientes, 7 - k);
    assert.equal(s.siguiente, r.siguiente);
    assert.match(buzonUltimo().texto, new RegExp(`Parte ${k + 1} de 8`));
    claves.push(buzonUltimo().guiaIA.clave);
  }
  assert.deepEqual(claves, Array.from({ length: 8 }, (_, k) => `IA\\Ruta de Larga inventada (Horda, ${k + 1} de 8)`), 'ninguno se salta');
  const sigue = await x.acciones.ejecutar('abrir_guia', { guia: id, desde: r.siguiente });
  assert.equal(sigue.ok, true, JSON.stringify(sigue));
  assert.equal(sigue.tramo, undefined);
  assert.deepEqual(metas(pasosDe(buzonUltimo().guiaIA))[0], [1411, 10 + ((r.siguiente - 1) % 80) + 0.5, 20.5], 'desde el paso siguiente');
  assert.equal(x.llamadas.length, 0);
});

test('I1: una guía que cabe entera en varios tramos da `pendientes` y un `siguiente` para mandarlos; con uno solo, ninguno', async () => {
  const ids = await biblioteca({ 'inventado/Data.lua': registro('horde-1-10', CUATRO) });
  const x = montar();
  await conLatido(x);
  const r = await x.acciones.ejecutar('abrir_guia', { guia: ids['inventado/Data.lua'] });
  assert.equal(r.pendientes, 0);
  assert.equal(r.siguiente, undefined);
});

test('decisión 3: el «sigue» del juego sobrevive a otras preguntas (y a un reinicio de la app) hasta otra guía o 7 días', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  const id = ids['Polestar/08-larga.txt'];
  let reloj = Date.now();
  const x = montar({ reloj: () => reloj });
  await conLatido(x, { r: 2 });
  assert.equal((await x.acciones.ejecutar('abrir_guia', { guia: id })).pendientes, 7);
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await decir(x, '¿qué vendo?', { id: 'c9d1-2', r: 3 });
  assert.equal(x.llamadas.length, 1, 'la otra pregunta va a la IA');
  await decir(x, 'sigue', { id: 'c9d1-3', r: 4 });
  assert.equal(x.llamadas.length, 1, 'el «sigue» no');
  assert.match(buzonUltimo(4).texto, /Parte 2 de 8/);
  // la app se reinicia: los pendientes siguen ahí
  await x.parar();
  const y = montar({ reloj: () => reloj });
  await decir(y, 'sigue', { id: 'c9d1-4', r: 5 });
  assert.equal(y.llamadas.length, 0);
  assert.match(buzonUltimo(5).texto, /Parte 3 de 8/);
  // seis horas después, aún sí (antes caducaban); siete días después, ya no
  reloj += 6 * 60 * 60 * 1000 + 1;
  await decir(y, 'sigue', { id: 'c9d1-5', r: 6 });
  assert.equal(y.llamadas.length, 0, 'a las 6 h siguen');
  assert.match(buzonUltimo(6).texto, /Parte 4 de 8/);
  reloj += SIETE_DIAS + 1;
  await decir(y, 'sigue', { id: 'c9d1-6', r: 7 });
  assert.equal(y.llamadas.length, 1, 'caducados: va a la IA');
});

test('decisión 3: otra guía (crear_ruta) sustituye los pendientes', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  const x = montar();
  await conLatido(x, { r: 2 });
  assert.equal((await x.acciones.ejecutar('abrir_guia', { guia: ids['Polestar/08-larga.txt'] })).pendientes, 7);
  assert.equal((await x.acciones.ejecutar('crear_ruta', { guia: CORTA })).ok, true);
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await decir(x, 'sigue', { id: 'c9d1-2', r: 4 });
  assert.equal(x.llamadas.length, 1, 'sin pendientes, el «sigue» va a la IA');
});

test('M1: si la publicación falla, los tramos pendientes no cambian (abrir_guia y crear_ruta)', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA, 'Polestar/07-inventada.txt': POLESTAR });
  const x = montar();
  await conLatido(x, { r: 2 });
  const primera = await x.acciones.ejecutar('abrir_guia', { guia: ids['Polestar/08-larga.txt'] });
  assert.equal(primera.pendientes, 7);
  const fallida = { ...x.nucleo, empujar: async () => ({ error: 'sin_ranuras' }) };
  const acciones = crearAcciones({ nucleo: fallida, estadoJuego: x.estadoJuego, datos: h.datos, carpetaBase });
  assert.deepEqual(await acciones.ejecutar('abrir_guia', { guia: ids['Polestar/07-inventada.txt'] }), { error: 'sin_ranuras', consejo: '/reload' });
  assert.deepEqual(await acciones.ejecutar('crear_ruta', { guia: CORTA }), { error: 'sin_ranuras', consejo: '/reload' });
  // tampoco avanzan si falla mandar un pendiente
  assert.equal((await acciones.ejecutar('abrir_guia', { guia: ids['Polestar/08-larga.txt'], desde: primera.siguiente })).error, 'sin_ranuras');
  await decir(x, 'sigue', { id: 'c9d1-2', r: 3 });
  assert.equal(x.llamadas.length, 0);
  assert.match(buzonUltimo(3).texto, /Parte 2 de 8/);
});

// ---------- ronda 3 ----------

// Una guía de Polestar de 500 pasos: cabe entera, pero en varios tramos (unos 168 pasos por guía del addon).
const QUINIENTOS = ['guide forever/horde/13-quinientos', 'title Quinientos inventados', 'faction Horde', '',
  ...Array.from({ length: 500 }, (_, i) => `step Ve al sitio ${i + 1}\n  goto ${10 + (i % 80)}.5,20.5 map 1411\n`)].join('\n');
const rutaPendientes = () => join(h.datos, 'tramos-pendientes.json');
const enCuarentena = () => {
  const q = join(h.datos, 'cuarentena');
  return existsSync(q) ? readdirSync(q).filter((d) => readdirSync(join(q, d)).includes('tramos-pendientes.json')).length : 0;
};

test('ronda 3 (I): el `siguiente` de los pendientes los manda traiga o no `hasta`; un `hasta` distinto se ignora y se dice', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  const id = ids['Polestar/08-larga.txt'];
  const x = montar();
  await conLatido(x, { r: 2 });
  const r = await x.acciones.ejecutar('abrir_guia', { guia: id, desde: 1, hasta: 400 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.tramos >= 3, JSON.stringify(r));
  assert.equal(r.hasta, 400);
  assert.equal(r.siguiente, 401);
  const s = await x.acciones.ejecutar('abrir_guia', { guia: id, desde: 401 });
  assert.equal(s.tramo, 2, JSON.stringify(s));
  assert.equal(s.hastaIgnorado, undefined);
  const u = await x.acciones.ejecutar('abrir_guia', { guia: id, desde: 401, hasta: 999 });
  assert.equal(u.tramo, 3, JSON.stringify(u));
  assert.equal(u.hastaIgnorado, true);
  assert.equal(x.llamadas.length, 0);
});

test('ronda 3 (m5): una guía que cabe entera en varios tramos: `siguiente` = hasta + 1 los manda; acabados, sin_pasos', async () => {
  const ids = await biblioteca({ 'Polestar/13-quinientos.txt': QUINIENTOS });
  const id = ids['Polestar/13-quinientos.txt'];
  const x = montar();
  await conLatido(x, { r: 2 });
  const r = await x.acciones.ejecutar('abrir_guia', { guia: id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.tramos >= 2, JSON.stringify(r));
  assert.equal(r.hasta, 500);
  assert.equal(r.pendientes, r.tramos - 1);
  assert.equal(r.siguiente, 501);
  for (let k = 2; k <= r.tramos; k++) {
    const s = await x.acciones.ejecutar('abrir_guia', { guia: id, desde: r.siguiente });
    assert.equal(s.tramo, k, JSON.stringify(s));
    assert.equal(s.pendientes, r.tramos - k);
  }
  assert.equal((await x.acciones.ejecutar('abrir_guia', { guia: id, desde: r.siguiente })).error, 'sin_pasos');
});

test('ronda 3 (m5): cada «sigue» renueva los 7 días; a 7 días − 1 aún vale', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  let reloj = Date.now();
  const x = montar({ reloj: () => reloj });
  await conLatido(x, { r: 2 });
  assert.equal((await x.acciones.ejecutar('abrir_guia', { guia: ids['Polestar/08-larga.txt'] })).pendientes, 7);
  reloj += SIETE_DIAS - 1;
  await decir(x, 'sigue', { id: 'c9d1-2', r: 3 });
  assert.match(buzonUltimo(3).texto, /Parte 2 de 8/);
  reloj += SIETE_DIAS - 1; // más de 7 días desde abrir_guia, pero no desde el último «sigue»
  await decir(x, 'sigue', { id: 'c9d1-3', r: 4 });
  assert.match(buzonUltimo(4).texto, /Parte 3 de 8/);
  assert.equal(x.llamadas.length, 0);
  reloj += SIETE_DIAS + 1;
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await decir(x, 'sigue', { id: 'c9d1-4', r: 5 });
  assert.equal(x.llamadas.length, 1);
});

test('ronda 3 (m4): tramos-pendientes.json roto va entero a la cuarentena; una entrada mala o caducada se descarta sola', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(rutaPendientes(), 'esto no es JSON');
  const roto = montar();
  assert.equal(enCuarentena(), 1);
  assert.equal(existsSync(rutaPendientes()), false);
  await roto.parar();

  const x = montar();
  await conLatido(x, { r: 2 });
  assert.equal((await x.acciones.ejecutar('abrir_guia', { guia: ids['Polestar/08-larga.txt'] })).pendientes, 7);
  await x.nucleo.inactivo();
  await x.parar();
  const j = JSON.parse(readFileSync(rutaPendientes(), 'utf8'));
  j.pjs['Otro Tal-Reino Prueba'] = { guias: 5, mandados: 1, cuando: Date.now() };
  j.pjs['Viejo Tal-Reino Prueba'] = { ...j.pjs[PJ], guias: [{ clave: 'x', pasos: 'no' }] };
  writeFileSync(rutaPendientes(), JSON.stringify(j));
  const y = montar();
  await decir(y, 'sigue', { id: 'c9d1-2', r: 3 });
  assert.equal(y.llamadas.length, 0, 'la entrada buena sigue valiendo');
  assert.match(buzonUltimo(3).texto, /Parte 2 de 8/);
  assert.equal(enCuarentena(), 1, 'por una entrada mala no va el archivo entero a la cuarentena');
  await y.nucleo.inactivo();
  await y.parar();

  // caducada al cargar
  const k = JSON.parse(readFileSync(rutaPendientes(), 'utf8'));
  assert.deepEqual(Object.keys(k.pjs), [PJ], 'las malas ya no se guardan');
  k.pjs[PJ].cuando = Date.now() - SIETE_DIAS - 1000;
  writeFileSync(rutaPendientes(), JSON.stringify(k));
  const z = montar();
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await decir(z, 'sigue', { id: 'c9d1-3', r: 4 });
  assert.equal(z.llamadas.length, 1);
});

test('ronda 3 (m4): se guardan solo los tramos que quedan', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  const x = montar();
  await conLatido(x, { r: 2 });
  await x.acciones.ejecutar('abrir_guia', { guia: ids['Polestar/08-larga.txt'] });
  await decir(x, 'sigue', { id: 'c9d1-2', r: 3 });
  await x.nucleo.inactivo();
  const p = JSON.parse(readFileSync(rutaPendientes(), 'utf8')).pjs[PJ];
  assert.equal(p.guias.length, 6);
  assert.equal(p.mandados, 2);
  assert.equal(p.guias[0].clave, 'IA\\Ruta de Larga inventada (Horda, 3 de 8)');
});

test('ronda 3 (m1): una rutaZona que el jugador no pidió no borra los pendientes; una pedida, sí', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  const x = montar();
  await conLatido(x, { r: 2 });
  assert.equal((await x.acciones.ejecutar('abrir_guia', { guia: ids['Polestar/08-larga.txt'] })).pendientes, 7);
  process.env.FALSO_RESPUESTA = bloque({ rutaZona: { zona: 1411 } }, 'Estas son las de Durotar.');
  await decir(x, '¿qué misiones hay en Durotar?', { id: 'c9d1-2', r: 3 });
  assert.ok(buzonUltimo(3).guiaIA, 'la rutaZona trae su guía');
  await decir(x, 'sigue', { id: 'c9d1-3', r: 4 });
  assert.equal(x.llamadas.length, 1);
  assert.match(buzonUltimo(4).texto, /Parte 2 de 8/);
  await decir(x, 'hazme la ruta de esta zona', { id: 'c9d1-4', r: 5 });
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await decir(x, 'sigue', { id: 'c9d1-5', r: 6 });
  assert.equal(x.llamadas.length, 3, 'tras una rutaZona pedida, el «sigue» va a la IA');
});

test('ronda 3 (m2): confirmar tarde lo armado no resucita unos pendientes que otra guía ya sustituyó', async () => {
  const ids = await biblioteca({ 'Polestar/08-larga.txt': LARGA });
  const id = ids['Polestar/08-larga.txt'];
  const x = montar();
  await conLatido(x, { r: 2 });
  const r = await x.acciones.ejecutar('abrir_guia', { guia: id });
  const armado = await x.nucleo.armarRespuesta({ mensaje: mensaje(), texto: bloque({ abrirGuia: { guia: id, desde: r.siguiente } }), idioma: 'es' });
  assert.match(armado.parcial.texto, /Parte 2 de 8/);
  assert.equal((await x.acciones.ejecutar('crear_ruta', { guia: CORTA })).ok, true);
  armado.confirmar();
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await decir(x, 'sigue', { id: 'c9d1-2', r: 4 });
  assert.equal(x.llamadas.length, 1, 'sin pendientes: a la IA');
});

test('ronda 3 (m3): si seguir la guía falla (la base no carga), la continuación no se pierde', async () => {
  const ids = await biblioteca({ 'Polestar/07-inventada.txt': POLESTAR });
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(rutaPendientes(), JSON.stringify({ version: 1, pjs: { [PJ]: {
    guias: [], mandados: 2, cuando: Date.now(), biblioteca: { guia: ids['Polestar/07-inventada.txt'], desde: 2, sigue: true },
  } } }));
  const rota = Promise.reject(Object.assign(new Error('rota'), { code: 'ROTA' }));
  rota.catch(() => {});
  const x = montar({ base: rota });
  await decir(x, 'sigue', { id: 'c9d1-2', r: 3 });
  assert.equal(x.llamadas.length, 0);
  assert.equal(buzonUltimo(3).guiaIA, undefined);
  await x.parar();
  const y = montar();
  await decir(y, 'sigue', { id: 'c9d1-3', r: 4 });
  assert.equal(y.llamadas.length, 0, 'la continuación sigue ahí: sin la IA');
  assert.deepEqual(deMision(pasosDe(buzonUltimo(4).guiaIA)), [['accept', 792]], 'desde el paso 2');
});
