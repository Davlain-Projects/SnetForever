// Tarea 18: núcleo de la app e historial. SIEMPRE con el claude falso de test/falso-claude (nunca el de verdad) y con
// `comprobar` de prueba para Codex: el codex real no se ejecuta nunca. Todo en carpetas temporales: los datos van a
// SNF_DATOS y la cuarentena del volumen a una «raíz» de prueba.
import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeFs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { cargarBase } from '../src/base/base.mjs';
import { crearNucleo, apuntarRecibido, acotarRanura, crearProgramas, esSigue, pideGuia, pideRuta, tramoDePendientes, TRAMOS_CADUCAN_MS } from '../src/nucleo.mjs';
import { crearHistorial, nombreArchivo, MAX_BYTES_HISTORIAL } from '../src/historial.mjs';
import { crearTimbres } from '../src/timbres.mjs';
import { prepararAddOns } from '../src/instalacion.mjs';
import { comprobar as comprobarClaude, preguntar as preguntarClaude, olvidarOpciones } from '../src/claude.mjs';
import { ERRORES, ERRORES_CODEX, TEXTOS_RUTA_ZONA, TEXTOS_GUIA_NUEVA, textoDetalle, textoHerramientas, textoGuiaNueva } from '../src/textos.mjs';
import { CARPETA_ENLACES } from '../src/biblioteca/enlaces.mjs';
import { crearIndice, CARPETA_GUIAS, RUTA_INDICE } from '../src/biblioteca/indice.mjs';
import { rutaTurno, rutaMcp, HERRAMIENTAS, turnoDe, escribirTurno } from '../src/herramientas/config.mjs';
import { crearFuentes } from '../src/herramientas/fuentes.mjs';
import { crearCatalogo } from '../src/herramientas/catalogo.mjs';
import { LINEA_HERRAMIENTAS } from '../src/prompt.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO = { ruta: join(AQUI, 'falso-claude', 'claude.mjs'), tipo: 'node' };
const COPIA = { ...process.env };
const RAIZ = mkdtempSync(join(tmpdir(), 'snf-nucleo-'));
const PJ = 'Tal Cual-Reino Prueba';

// La base del fixture.
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
let h; // la carpeta de prueba de cada test
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

// Carpeta de prueba: datos, AddOns con SnetForever, las 20 ranuras y los timbres, y la «raíz del volumen».
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

// Un núcleo de prueba. `sacados` apunta cada timbre que sale (x.wav -> x.wav.fuera); `llamadas`, cada pregunta al falso.
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
  const turnoAlPreguntar = []; // tarea 14: si turno.json ya estaba escrito en cada pregunta a Claude
  const comprobaciones = [];
  const comprobar = opciones.comprobar || {
    claude: async () => { comprobaciones.push('claude'); return OK; },
    codex: async () => { comprobaciones.push('codex'); return NO; },
  };
  const modulos = {
    claude: {
      preguntar: async (c, o) => {
        llamadas.push(o);
        turnoAlPreguntar.push(existsSync(rutaTurno(h.datos)));
        if (opciones.fallarUnaVez && llamadas.length === 1) throw new Error('fallo inesperado de prueba');
        return preguntarClaude(c, o);
      },
    },
    codex: {
      preguntar: async (c, o) => {
        if (!opciones.codex) throw new Error('el codex real no se usa en las pruebas');
        llamadas.push(o);
        return opciones.codex(o);
      },
    },
  };
  const historial = crearHistorial(h.datos);
  const x = crearNucleo({
    base: opciones.base || Promise.resolve(BASE),
    addonsDir: h.addons,
    timbres,
    historial,
    datos: h.datos,
    comprobar,
    programas: { claude: FALSO, codex: { ruta: 'no-existe', tipo: 'node' } },
    modulos,
    raizVolumen: h.raiz,
    config: opciones.config,
    reloj: opciones.reloj,
    tiempoMax: opciones.tiempoMax,
    herramientas: opciones.herramientas,
    carpetaBase: opciones.carpetaBase,
    obtener: opciones.obtener,
  });
  const yo = { nucleo: x, timbres, sacados, llamadas, turnoAlPreguntar, comprobaciones, historial, parar: () => timbres.parar() };
  nucleos.push(yo);
  return yo;
}

function mensaje({ id = 'a3f1-1', texto = 'hola', idioma = 'es', modelo = 'haiku', nueva, ctx = {}, pj = PJ } = {}) {
  const m = {
    v: 1, id, pj, idioma, modelo, texto,
    ctx: {
      pj: { nivel: 3, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, xp: 100, xpMax: 900, dinero: 1234 },
      lugar: { mapa: 1411, zona: 'Durotar', instancia: false },
      registro: [{ q: 4641, c: 0, o: [[2, 8]] }, { q: 792, c: 0, o: [[0, 5]] }],
      guias: [{ clave: 'Horde\\1-12', titulo: 'Durotar 1-12' }],
      ...ctx,
    },
  };
  if (nueva) m.nueva = true;
  return m;
}

// Carga P1 de una trama de una sola parte (z = 0).
function trama({ pj = PJ, id = 'a3f1-1', r = 7, c = 0, cuerpo }) {
  const json = Buffer.from(JSON.stringify(cuerpo ?? mensaje({ id, pj })), 'utf8');
  const cabeza = Buffer.from(['SNF1', pj, id, '1', '1', '0', String(r), String(c), ''].join('\x1f'), 'utf8');
  return Buffer.concat([cabeza, json]);
}

const nombreRanura = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;
const textoRanura = (i) => readFileSync(join(h.addons, nombreRanura(i), 'buzon.lua'), 'utf8');

// Cada lectura crea una máquina Lua y la cierra al acabar: guardarlas todas hasta el final del archivo (121 en total)
// agotaba el montón de Node. Para leer SNF_BUZON no hace falta el addon de comercio.
function leerBuzon(i) {
  const m = crearMaquina({ arrancar: false, sinComercio: true });
  try {
    return m.lua(`${textoRanura(i)}\nreturn SNF_BUZON`);
  } finally {
    m.cerrar();
  }
}

const loApuntado = () => JSON.parse(readFileSync(h.registroFalso, 'utf8'));
const tras = (argv, opcion) => argv[argv.indexOf(opcion) + 1];

// ---------- el camino entero ----------

test('una trama completa: recibido_impar, haiku, el buzón en las ranuras r…r+15, timbre_a y el historial', async () => {
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ r: 3, cuerpo: mensaje({ texto: 'hola, ¿qué hago?' }) }));

  assert.ok(x.sacados.includes('recibido_impar'), 'n = 1: recibido_impar');
  assert.ok(!x.sacados.includes('recibido_par'));
  assert.ok(x.sacados.includes('timbre_a'));
  assert.ok(!x.sacados.includes('timbre_b'));

  const argv = loApuntado().argv;
  assert.equal(tras(argv, '--model'), 'haiku');

  const b = leerBuzon(3);
  assert.equal(b.v, 1);
  assert.equal(b.estado.claude, 'ok');
  assert.equal(b.estado.motor, 'ok');
  assert.equal(b.estado.motorNombre, 'claude');
  assert.equal(b.recibidos[PJ], 'a3f1-1');
  const reg = b.registros.find((r) => r.msg === 'a3f1-1');
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.pj, PJ);
  assert.equal(reg.motor, 'claude');
  assert.equal(reg.texto, 'respuesta falsa');
  assert.equal(reg.seq, b.seq);

  for (let i = 3; i <= 18; i++) assert.equal(textoRanura(i), textoRanura(3), `ranura ${i}`);
  assert.equal(textoRanura(2), 'SNF_BUZON = nil\n');
  assert.equal(textoRanura(19), 'SNF_BUZON = nil\n');

  assert.deepEqual(x.historial.recientes(PJ).map((l) => [l.rol, l.texto]), [['jugador', 'hola, ¿qué hago?'], ['ia', 'respuesta falsa']]);
});

test('el modelo: sonnet y opus pasan tal cual y cualquier otro valor cae en haiku', async () => {
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ id: 'b-1', cuerpo: mensaje({ id: 'b-1', modelo: 'sonnet' }) }));
  assert.equal(tras(loApuntado().argv, '--model'), 'sonnet');
  await x.nucleo.recibirTrama(trama({ id: 'b-2', cuerpo: mensaje({ id: 'b-2', modelo: 'fable' }) }));
  assert.equal(tras(loApuntado().argv, '--model'), 'haiku');
  await x.nucleo.recibirTrama(trama({ id: 'b-3', cuerpo: mensaje({ id: 'b-3', modelo: 'opus' }) }));
  assert.equal(tras(loApuntado().argv, '--model'), 'opus');
});

test('el mismo id otra vez: el falso se llama una sola vez (también tras reiniciar el núcleo)', async () => {
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({}));
  await x.nucleo.recibirTrama(trama({}));
  assert.equal(x.llamadas.length, 1);
  const y = nucleo();
  await y.nucleo.recibirTrama(trama({}));
  assert.equal(y.llamadas.length, 0, 'el id ya estaba en recibidos de estado.json');
});

test('Vigilancia 5: con estado.json en seq 5 y un mensaje con c = 9, el registro lleva seq 10', async () => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'estado.json'), JSON.stringify({ seq: 5 }));
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ c: 9 }));
  const b = leerBuzon(7);
  assert.equal(b.registros.find((r) => r.msg === 'a3f1-1').seq, 10);
  assert.equal(b.seq, 10);
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'estado.json'), 'utf8')).seq, 10);
  // Con un cursor más bajo manda lo guardado.
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', c: 2, cuerpo: mensaje({ id: 'a3f1-2' }) }));
  assert.equal(leerBuzon(7).registros.find((r) => r.msg === 'a3f1-2').seq, 11);
});

test('estado.json roto: va a la cuarentena de datos (no se borra) y se empieza de cero', async () => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'estado.json'), '{roto');
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ c: 3 }));
  assert.equal(leerBuzon(7).seq, 4);
  const cuarentena = join(h.datos, 'cuarentena');
  const guardados = readdirSync(cuarentena).flatMap((d) => readdirSync(join(cuarentena, d)).map((f) => readFileSync(join(cuarentena, d, f), 'utf8')));
  assert.ok(guardados.includes('{roto'));
});

// ---------- errores de la cuenta y del motor ----------

test('sin_sesion: registro de error en español (y en inglés con idioma = "en") y estado.claude = sin_sesion, sin preguntar', async () => {
  process.env.FALSO_MODO = 'sin_sesion';
  const comprobar = { claude: () => comprobarClaude(FALSO), codex: async () => NO };
  const x = nucleo({ comprobar });
  await x.nucleo.recibirTrama(trama({}));
  let b = leerBuzon(7);
  let reg = b.registros.find((r) => r.msg === 'a3f1-1');
  assert.equal(reg.t, 'error');
  assert.equal(reg.tipo, 'sin_sesion');
  assert.equal(reg.texto, ERRORES.es.sin_sesion);
  assert.equal(b.estado.claude, 'sin_sesion');
  assert.equal(x.nucleo.estado().estados.claude, 'sin_sesion');
  assert.equal(x.llamadas.length, 0, 'nunca se pregunta sin un motor en ok');
  assert.equal(existsSync(h.registroFalso), false);

  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', r: 8, cuerpo: mensaje({ id: 'a3f1-2', idioma: 'en' }) }));
  b = leerBuzon(8);
  reg = b.registros.find((r) => r.msg === 'a3f1-2');
  assert.equal(reg.tipo, 'sin_sesion');
  assert.equal(reg.texto, ERRORES.en.sin_sesion);
});

test('la sesión se cae al preguntar: error sin_sesion, estado.claude al día y se vuelve a comprobar en el turno siguiente', async () => {
  let t = 1_000_000;
  const x = nucleo({ reloj: { ahora: () => t } });
  process.env.FALSO_MODO = 'sin_sesion';
  await x.nucleo.recibirTrama(trama({}));
  const b = leerBuzon(7);
  assert.equal(b.registros[0].tipo, 'sin_sesion');
  assert.equal(b.estado.claude, 'sin_sesion');
  assert.equal(x.comprobaciones.filter((m) => m === 'claude').length, 1);

  delete process.env.FALSO_MODO;
  t += 5_000; // dentro de los 60 s, pero tras un sin_sesion se comprueba siempre
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2' }) }));
  assert.equal(x.comprobaciones.filter((m) => m === 'claude').length, 2);
  assert.equal(leerBuzon(7).estado.claude, 'ok');

  t += 5_000; // tras un ok, la memoria de 60 s vale
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-3', cuerpo: mensaje({ id: 'a3f1-3' }) }));
  assert.equal(x.comprobaciones.filter((m) => m === 'claude').length, 2);
  t += 61_000;
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-4', cuerpo: mensaje({ id: 'a3f1-4' }) }));
  assert.equal(x.comprobaciones.filter((m) => m === 'claude').length, 3);
});

test('sin motor: ninguno instalado da sin_instalar (texto de Claude); dos sin ok dan sin_motor; nunca se pregunta', async () => {
  const x = nucleo({ comprobar: { claude: async () => NO, codex: async () => NO } });
  await x.nucleo.recibirTrama(trama({}));
  let reg = leerBuzon(7).registros.find((r) => r.msg === 'a3f1-1');
  assert.equal(reg.tipo, 'sin_instalar');
  assert.equal(reg.texto, ERRORES.es.sin_instalar);

  const y = nucleo({ comprobar: { claude: async () => ({ estado: 'sin_sesion' }), codex: async () => ({ estado: 'pago_por_uso' }) } });
  await y.nucleo.recibirTrama(trama({ id: 'c-2', r: 9, cuerpo: mensaje({ id: 'c-2' }) }));
  reg = leerBuzon(9).registros.find((r) => r.msg === 'c-2');
  assert.equal(reg.tipo, 'sin_motor');
  assert.equal(reg.texto, ERRORES.es.sin_motor);
  assert.equal(x.llamadas.length + y.llamadas.length, 0);
});

test('Codex forzado en config.motor (datos/config.json) y sin sesión: error sin_sesion con el texto de ChatGPT/Codex', async () => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'config.json'), JSON.stringify({ motor: 'codex' }));
  const x = nucleo({ comprobar: { claude: async () => OK, codex: async () => ({ estado: 'sin_sesion' }) } });
  await x.nucleo.recibirTrama(trama({}));
  const reg = leerBuzon(7).registros[0];
  assert.equal(reg.tipo, 'sin_sesion');
  assert.equal(reg.texto, ERRORES_CODEX.es.sin_sesion);
  assert.equal(x.llamadas.length, 0);
});

test('un fallo inesperado en un turno da un registro de error «fallo» y el núcleo sigue vivo', async () => {
  const x = nucleo({ fallarUnaVez: true });
  await x.nucleo.recibirTrama(trama({}));
  const reg = leerBuzon(7).registros.find((r) => r.msg === 'a3f1-1');
  assert.equal(reg.t, 'error');
  assert.equal(reg.tipo, 'fallo');
  assert.match(reg.texto, /^La IA no ha podido contestar \(/);
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2' }) }));
  assert.equal(leerBuzon(7).registros.find((r) => r.msg === 'a3f1-2').t, 'respuesta');
});

test('una base que no carga: error «fallo» sin preguntar', async () => {
  const x = nucleo({ base: Promise.reject(new Error('sin base')) });
  await x.nucleo.recibirTrama(trama({}));
  assert.equal(leerBuzon(7).registros[0].tipo, 'fallo');
  assert.equal(x.llamadas.length, 0);
});

// ---------- la cola ----------

test('con el falso en lento y 4 pj a la vez, el cuarto recibe ocupado (y los otros tres se contestan de uno en uno)', async () => {
  process.env.FALSO_MODO = 'lento';
  const x = nucleo({ tiempoMax: 1000 });
  const pjs = ['Uno-R', 'Dos-R', 'Tres-R', 'Cuatro-R'];
  const promesas = pjs.map((pj, i) => x.nucleo.recibirTrama(trama({ pj, id: `d0${i}-1`, cuerpo: mensaje({ pj, id: `d0${i}-1` }) })));
  assert.equal(x.nucleo.estado().enCola, 3);
  await promesas[3];
  let b = leerBuzon(7);
  const ocupado = b.registros.find((r) => r.pj === 'Cuatro-R');
  assert.equal(ocupado.t, 'error');
  assert.equal(ocupado.tipo, 'ocupado');
  assert.equal(ocupado.texto, ERRORES.es.ocupado);
  assert.equal(b.recibidos['Cuatro-R'], 'd03-1');
  await Promise.all(promesas);
  b = leerBuzon(7);
  for (const pj of pjs.slice(0, 3)) assert.equal(b.registros.find((r) => r.pj === pj).tipo, 'tiempo', pj);
  assert.equal(x.llamadas.length, 3);
  assert.equal(x.nucleo.estado().enCola, 0);
});

// ---------- lo que se manda a la IA ----------

test('sin inv y «¿qué vendo?»: el stdin del falso contiene no_permitido', async () => {
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: '¿qué vendo?' }) }));
  const { stdin } = loApuntado();
  assert.ok(stdin.includes('no_permitido'));
  assert.ok(stdin.includes('¿qué vendo?'));
});

test('15-nov: «revisa mis guías» lleva a la IA las guías propias de SnetForever_MisGuias (y sin archivo, nada)', async () => {
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'revisa mis guías' }) }));
  assert.ok(!loApuntado().stdin.includes('misGuias'), 'sin el archivo no hay bloque');
  mkdirSync(join(h.addons, 'SnetForever_MisGuias'));
  writeFileSync(join(h.addons, 'SnetForever_MisGuias', 'mis-guias.lua'),
    'SnetForeverMisGuias = {\n  {nombre = "Mi valle inventado", niveles = {1, 4}, pasos = {{aceptar = 788}, {entregar = 788}}},\n}\n');
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2', texto: 'revisa mis guías' }) }));
  const { stdin } = loApuntado();
  assert.ok(stdin.includes('"misGuias"'));
  assert.ok(stdin.includes('Mi valle inventado'));
  assert.ok(stdin.includes('aceptar 788'));
});

// En el juego: la pregunta siguiente («ok y despues… que sigue…») perdía la guía de la pregunta anterior. El núcleo recuerda
// por personaje las guías que entraron con pasos (los 3 últimos turnos) y «nueva» lo borra.
test('las guías del turno anterior vuelven en la pregunta siguiente y «nueva» las olvida', async () => {
  mkdirSync(join(h.addons, 'SnetForever_MisGuias'), { recursive: true });
  writeFileSync(join(h.addons, 'SnetForever_MisGuias', 'mis-guias.lua'),
    'SnetForeverMisGuias = {\n  {nombre = "[H] 40-45 Lejana inventada", niveles = {40, 45}, pasos = {{aceptar = 788, texto = "PASO_LEJANO"}}},\n}\n');
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'ruta de la lejana inventada' }) }));
  assert.ok(loApuntado().stdin.includes('PASO_LEJANO'), 'la nombrada entra');
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2', texto: 'y despues que sigue' }) }));
  assert.ok(loApuntado().stdin.includes('PASO_LEJANO'), 'vuelve como reciente');
  assert.ok(loApuntado().stdin.includes('"reciente"'));
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-3', cuerpo: mensaje({ id: 'a3f1-3', texto: 'y despues que sigue', nueva: true }) }));
  assert.ok(!loApuntado().stdin.includes('PASO_LEJANO'), 'una conversación nueva la olvida');
});

// Revisión: la memoria caduca. Una guía que no se vuelve a nombrar sale a los 3 turnos (las que vuelven como «reciente» no
// se apuntan otra vez y cada turno cuenta, aunque no traiga guías).
test('las guías recientes caducan a los 3 turnos si no se vuelven a nombrar', async () => {
  mkdirSync(join(h.addons, 'SnetForever_MisGuias'), { recursive: true });
  writeFileSync(join(h.addons, 'SnetForever_MisGuias', 'mis-guias.lua'),
    'SnetForeverMisGuias = {\n  {nombre = "[H] 40-45 Lejana inventada", niveles = {40, 45}, pasos = {{aceptar = 788, texto = "PASO_LEJANO"}}},\n}\n');
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'ruta de la lejana inventada' }) }));
  const vistas = [];
  for (let i = 2; i <= 5; i++) {
    await x.nucleo.recibirTrama(trama({ id: `a3f1-${i}`, cuerpo: mensaje({ id: `a3f1-${i}`, texto: 'y despues que sigue' }) }));
    vistas.push(loApuntado().stdin.includes('PASO_LEJANO'));
  }
  assert.deepEqual(vistas, [true, true, true, false]);
});

// Revisión: «nueva» borra la memoria aunque el turno acabe antes de preparar los datos (sin motor, cola llena…).
test('«nueva» borra las guías recientes aunque el turno no llegue a preguntar', async () => {
  mkdirSync(join(h.addons, 'SnetForever_MisGuias'), { recursive: true });
  writeFileSync(join(h.addons, 'SnetForever_MisGuias', 'mis-guias.lua'),
    'SnetForeverMisGuias = {\n  {nombre = "[H] 40-45 Lejana inventada", niveles = {40, 45}, pasos = {{aceptar = 788, texto = "PASO_LEJANO"}}},\n}\n');
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'ruta de la lejana inventada' }) }));
  assert.ok(loApuntado().stdin.includes('PASO_LEJANO'));
  // Un turno con «nueva» que acaba sin motor (Codex forzado y sin instalar).
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'config.json'), JSON.stringify({ motor: 'codex' }));
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2', texto: 'hola', nueva: true }) }));
  rmSync(join(h.datos, 'config.json'));
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-3', cuerpo: mensaje({ id: 'a3f1-3', texto: 'y despues que sigue' }) }));
  assert.ok(!loApuntado().stdin.includes('PASO_LEJANO'), 'la conversación nueva la ha olvidado');
});

test('la guía elegida de SnetForever_Rutas entra con sus pasos (el núcleo la lee del disco)', async () => {
  const rutas = join(h.addons, 'SnetForever_Rutas');
  mkdirSync(rutas, { recursive: true });
  writeFileSync(join(rutas, 'SnetForever_Rutas.toc'), '## Interface: 16001\n\nnucleo.lua\nguias_1.lua\n');
  writeFileSync(join(rutas, 'nucleo.lua'), 'SNF_RUTAS = {version="x", esquema=1, guias = {}, grupos = {}, alias = {}}\n');
  writeFileSync(join(rutas, 'guias_1.lua'), 'local T = SNF_RUTAS.guias\nT["Leveling (H)\\\\01-06 Inventada"]={clave="Leveling (H)\\\\01-06 Inventada",'
    + 'grupo="Leveling (H)",nombre="01-06 Inventada",titulo={en="1-6 Made Up"},niveles={1,6},faccion="Horde",pasos={{id="a",n=1,'
    + 'elementos={{t="goto",mapa=1411,x=40,y=60},{t="accept",q=788,texto={en="PASO_DE_RUTAS"}}}}}}\n');
  const x = nucleo();
  const ctx = { guia: { clave: 'Leveling (H)\\01-06 Inventada', titulo: '1-6 Made Up', misiones: [788] } };
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'creame la ruta de mi guia', ctx }) }));
  const { stdin } = loApuntado();
  assert.ok(stdin.includes('PASO_DE_RUTAS'), stdin.slice(0, 400));
  assert.ok(stdin.includes('"elegida"'));
});

test('el historial pasa a la IA y «nueva» lo corta', async () => {
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'PRIMERA_PREGUNTA' }) }));
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2', texto: 'segunda' }) }));
  assert.ok(loApuntado().stdin.includes('Jugador: PRIMERA_PREGUNTA'));
  assert.ok(loApuntado().stdin.includes('IA: respuesta falsa'));
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-3', cuerpo: mensaje({ id: 'a3f1-3', texto: 'tercera', nueva: true }) }));
  assert.ok(!loApuntado().stdin.includes('PRIMERA_PREGUNTA'));
  assert.deepEqual(x.historial.recientes(PJ).map((l) => l.texto), ['tercera', 'respuesta falsa']);
  const lineas = readFileSync(join(h.datos, 'historial', nombreArchivo(PJ)), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lineas.map((l) => l.t), ['jugador', 'ia', 'jugador', 'ia', 'nueva', 'jugador', 'ia']);
});

test('registro.log no contiene ni la pregunta ni la respuesta', async () => {
  process.env.FALSO_RESPUESTA = 'RESPUESTA_SECRETA_5540';
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'PREGUNTA_SECRETA_9182' }) }));
  const log = readFileSync(join(h.datos, 'registro.log'), 'utf8');
  assert.ok(log.length > 0);
  assert.ok(!log.includes('PREGUNTA_SECRETA_9182'));
  assert.ok(!log.includes('RESPUESTA_SECRETA_5540'));
  assert.ok(!log.includes('Tal Cual'), 'tampoco el nombre del personaje');
  assert.ok(x.historial.recientes(PJ).some((l) => l.texto === 'RESPUESTA_SECRETA_5540'));
});

test('17-nov: si el addon no pudo leer los talentos, la IA recibe talentosFalta y registro.log lo apunta sin la pregunta ni el nombre', async () => {
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'PREGUNTA_TALENTOS_7731 talentos', ctx: { talentosFalta: true } }) }));
  assert.ok(loApuntado().stdin.includes('"talentosFalta":true'));
  const log = readFileSync(join(h.datos, 'registro.log'), 'utf8');
  assert.match(log, /mensaje a3f1-1: el addon no pudo leer los talentos/);
  assert.ok(!log.includes('PREGUNTA_TALENTOS_7731'));
  assert.ok(!log.includes('Tal Cual'));
  // Una vez por personaje y sesión: el segundo turno no repite la línea.
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2', ctx: { talentosFalta: true } }) }));
  assert.equal(readFileSync(join(h.datos, 'registro.log'), 'utf8').match(/no pudo leer los talentos/g).length, 1);
  // Con los talentos, nada.
  const y = nucleo();
  await y.nucleo.recibirTrama(trama({ id: 'a3f1-3', cuerpo: mensaje({ id: 'a3f1-3', pj: 'Otro-Reino Prueba', ctx: { talentos: { arboles: [{ a: 'Armas', p: 0, t: [] }] } } }) }));
  assert.equal(readFileSync(join(h.datos, 'registro.log'), 'utf8').match(/no pudo leer los talentos/g).length, 1);
});

// ---------- la respuesta ----------

test('bloque snet: la ruta con coordenadas de la base, la guía con su título, y rutaZona sin zona añade su aviso', async () => {
  process.env.FALSO_RESPUESTA = 'Ve a ver a Gornek.\n```snet\n{"ruta":{"titulo":"Empieza","puntos":["P1","P99"]},"guia":"Horde\\\\1-12","rutaZona":{"zona":"Zona que no existe"}}\n```';
  const x = nucleo();
  // «¿dónde…?» pide puntos: P1 es recoger 4641 (Gornek) en Durotar.
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: '¿qué hago ahora?' }) }));
  const reg = leerBuzon(7).registros[0];
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.propuesta.titulo, 'Empieza');
  assert.equal(reg.propuesta.puntos.length, 1);
  const p = reg.propuesta.puntos[0];
  assert.equal(p.q, 4641);
  assert.equal(p.tipo, 'recoger');
  assert.equal(p.seguir, true);
  assert.equal(typeof p.x, 'number');
  assert.equal(p.mapa, 1411);
  assert.deepEqual(reg.guia, { clave: 'Horde\\1-12', titulo: 'Durotar 1-12' });
  assert.ok(reg.texto.startsWith('Ve a ver a Gornek.'));
  assert.ok(reg.texto.includes(TEXTOS_RUTA_ZONA.es.sin_zona));
  assert.ok(!reg.texto.includes('```'));
  assert.equal(reg.guiaIA, undefined);
});

// T3 (S2, 17-nov: una ruta improvisada se ponía delante de la guía a medias): con una guía sin acabar o con tramos
// pendientes, y sin pedir una ruta, la `ruta` de la IA sale como pines (se marca en el mapa, no se abre como guía).
test('T3 (S2): con la guía a medias y sin pedir ruta, la ruta sale como pines; pidiéndola o con la guía acabada, ruta', async () => {
  process.env.FALSO_RESPUESTA = 'Ve a ver a Gornek.\n```snet\n{"ruta":{"titulo":"Empieza","puntos":["P1"]}}\n```';
  const x = nucleo();
  const guia = (extra = {}) => ({ guia: { clave: 'Horde\\1-12', titulo: 'Durotar 1-12', n: 3, paso: 'Habla con Gornek', misiones: [], ...extra } });
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-1', cuerpo: mensaje({ id: 'a3f1-1', texto: '¿qué hago ahora?', ctx: guia() }) }));
  const pines = leerBuzon(7).registros.find((r) => r.msg === 'a3f1-1').propuesta;
  assert.equal(pines.tipo, 'pines');
  assert.ok(lista(pines.puntos).every((p) => p.seguir === false));
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2', texto: 'hazme una ruta a Gornek', ctx: guia() }) }));
  assert.equal(leerBuzon(7).registros.find((r) => r.msg === 'a3f1-2').propuesta.tipo, 'ruta', 'la pidió');
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-3', cuerpo: mensaje({ id: 'a3f1-3', texto: '¿qué hago ahora?', ctx: guia({ fin: true, n: undefined, paso: undefined }) }) }));
  assert.equal(leerBuzon(7).registros.find((r) => r.msg === 'a3f1-3').propuesta.tipo, 'ruta', 'acabada y sin pendientes');
  // Con tramos pendientes, aunque la guía esté acabada, pines.
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'créame una ruta larga' }));
  process.env.FALSO_RESPUESTA = 'Ve a ver a Gornek.\n```snet\n{"ruta":{"titulo":"Empieza","puntos":["P1"]}}\n```';
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: '¿qué hago ahora?', ctx: guia({ clave: registroRuta('b7c2-1').guiaIA.clave, fin: true }) }));
  assert.equal(registroRuta('b7c2-2').propuesta.tipo, 'pines');
  // Ronda 1 (I3): los pendientes de otra guía (la de la IA, abandonada) no cuentan si la cargada está acabada: la IA ve
  // `pendientes: 0` y la red hace lo mismo.
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-3', texto: '¿qué hago ahora?', ctx: guia({ clave: 'Horde\\1-12', fin: true }) }));
  assert.equal(registroRuta('b7c2-3').propuesta.tipo, 'ruta', 'otra guía acabada: los pendientes de la de la IA no cuentan');
  // Ronda 1 (M8): cuando la red actúa, el texto lo dice.
  assert.ok(registroRuta('b7c2-2').texto.includes(textoGuiaNueva('ruta_en_pines', {}, 'es')), registroRuta('b7c2-2').texto);
  assert.ok(!registroRuta('b7c2-3').texto.includes(textoGuiaNueva('ruta_en_pines', {}, 'es')));
});

// Ronda 1 (M7): el tramo que ve la IA es coherente también con la continuación de una guía de la biblioteca y con
// entradas viejas de tramos-pendientes.json (sin `clave`).
test('ronda 1 (M7): tramoDePendientes: la continuación cuenta como una parte más; una entrada vieja sin «i de n» también vale', () => {
  const g = (clave) => ({ clave, pasos: [] });
  assert.deepEqual(tramoDePendientes('IA\\Ruta de A (Horda, 1 de 2)', { guias: [g('x')], mandados: 1, clave: 'IA\\Ruta de A (Horda, 1 de 2)' }), { i: 1, n: 2, pendientes: 1 });
  // Mandadas todas las guías, pero la de la biblioteca sigue: «2 de 3» con una pendiente (antes, «2 de 2» con una).
  assert.deepEqual(tramoDePendientes('IA\\Ruta de A (Horda, 2 de 2)', { guias: [], mandados: 2, clave: 'IA\\Ruta de A (Horda, 2 de 2)', biblioteca: { sigue: true } }),
    { i: 2, n: 3, pendientes: 1 });
  // Entrada vieja sin clave y una sola guía mandada (clave sin «i de n»): vale.
  assert.deepEqual(tramoDePendientes('IA\\Ruta de A (Horda)', { guias: [], mandados: 1, biblioteca: { sigue: true } }), { i: 1, n: 2, pendientes: 1 });
  // Pendientes de otra guía: no cuentan.
  assert.deepEqual(tramoDePendientes('IA\\Ruta de B (Horda, 2 de 3)', { guias: [g('x')], mandados: 1, clave: 'IA\\Ruta de A (Horda, 1 de 2)' }), { i: 2, n: 3, pendientes: 0 });
  assert.deepEqual(tramoDePendientes('IA\\Ruta de B (Horda)', null), { i: 1, n: 1, pendientes: 0 });
  assert.equal(tramoDePendientes('Horde\\1-12', null), null);
});

// Ronda 1 (I1): S2 tiene su propio detector, más ancho que pideGuia: si el mensaje pide una ruta o llegar a un sitio, no actúa.
test('ronda 1 (I1): pideRuta reconoce las formas corrientes de pedir una ruta o llegar a un sitio (es y en)', () => {
  for (const t of ['¿Me haces una ruta para entregar estas?', 'puedes hacerme una ruta', 'necesito una ruta para hacer estas misiones',
    'márcame la ruta', 'ruta para entregar todo', '¿Cómo llego a Orgrimmar?', 'guíame hasta el maestro', 'can you route me to the camp',
    'how do I get to Orgrimmar', 'Llévame a Durotar', '¿Dónde entrego esto?', 'where do I turn this in?', 'hazme una guía',
    'dame la guía de aquí', 'necesito llegar al campamento', '¿a dónde tengo que ir?', 'take me to the inn', 'show me the way']) {
    assert.equal(pideRuta(t), true, t);
  }
  for (const t of ['¿qué hago ahora?', '¿por dónde voy?', '¿qué vendo?', 'hola', 'what should I sell', 'sigue', '', undefined]) {
    assert.equal(pideRuta(t), false, String(t));
  }
});

test('rutaZona de una zona de la base: el registro lleva guiaIA y su resumen se añade al texto de la IA', async () => {
  process.env.FALSO_RESPUESTA = 'Te preparo la ruta.\n```snet\n{"rutaZona":{"zona":1411}}\n```';
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'hazme la ruta de esta zona' }) }));
  const reg = leerBuzon(7).registros[0];
  assert.equal(reg.t, 'respuesta');
  assert.equal(typeof reg.guiaIA, 'object');
  assert.equal(typeof reg.guiaIA.clave, 'string');
  assert.ok(reg.texto.startsWith('Te preparo la ruta.'));
  assert.match(reg.texto, /misi(ón|ones)/);
  assert.equal(reg.propuesta, undefined);
});

test('renderizar: el texto que llega al juego lleva los | escapados y líneas de ≤ 450 bytes', async () => {
  process.env.FALSO_RESPUESTA = `|cFFFF0000rojo|r ${'palabra '.repeat(200)}`;
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({}));
  const reg = leerBuzon(7).registros[0];
  assert.ok(reg.texto.startsWith('||cFFFF0000rojo||r'));
  for (const l of reg.texto.split('\n')) assert.ok(Buffer.byteLength(l) <= 450);
});

// ---------- una ranura por mensaje ----------

test('una ranura por mensaje: el recibido va en el mismo buzón que la respuesta (un timbre de buzón por mensaje)', async () => {
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ r: 7 }));
  assert.equal(x.sacados.filter((s) => s.startsWith('timbre_')).length, 1);
  assert.equal(x.nucleo.estado().publicaciones, 1);
  const b = leerBuzon(7);
  assert.equal(b.recibidos[PJ], 'a3f1-1');
  assert.equal(b.registros.length, 1);

  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', r: 8, cuerpo: mensaje({ id: 'a3f1-2' }) }));
  assert.deepEqual(x.sacados.filter((s) => s.startsWith('timbre_')), ['timbre_a', 'timbre_b']);
  assert.deepEqual(x.sacados.filter((s) => s.startsWith('recibido_')), ['recibido_impar', 'recibido_par']);
  assert.equal(x.nucleo.estado().publicaciones, 2);
  assert.equal(leerBuzon(8).recibidos[PJ], 'a3f1-2');
  assert.equal(leerBuzon(20).recibidos[PJ], 'a3f1-2', 'de 8 a 20: r + 15 se acota a la última ranura');
  assert.equal(leerBuzon(7).recibidos[PJ], 'a3f1-1', 'la ranura 7 ya no se vuelve a escribir');
});

// ---------- publicarEstado, estado() y alCambiar ----------

test('publicarEstado: al arrancar escribe las 20 ranuras sin timbre; después, de r a r+15 con timbre', async () => {
  const x = nucleo();
  const cambios = [];
  x.nucleo.alCambiar((e) => cambios.push(e));
  await x.nucleo.publicarEstado();
  for (let i = 1; i <= 20; i++) assert.equal(leerBuzon(i).estado.claude, 'ok', `ranura ${i}`);
  assert.equal(x.sacados.filter((s) => s.startsWith('timbre_')).length, 0);
  assert.equal(x.nucleo.estado().motor, 'claude');
  assert.ok(cambios.length > 0);

  await x.nucleo.recibirTrama(trama({ r: 3 }));
  await x.nucleo.publicarEstado({ claude: { estado: 'sin_sesion' }, codex: { estado: 'ok' } });
  const b = leerBuzon(18);
  assert.equal(b.estado.claude, 'sin_sesion');
  assert.equal(b.estado.codex, 'ok');
  assert.equal(b.estado.motor, 'ok');
  assert.equal(b.estado.motorNombre, 'codex');
  assert.equal(leerBuzon(19).estado.claude, 'ok', 'la 19 se quedó con el buzón de arranque');
  assert.equal(x.sacados.filter((s) => s.startsWith('timbre_')).length, 2);
  assert.equal(x.nucleo.estado().motor, 'codex');
});

// Revisión final, Minor 5: tras reiniciar el juego (o /reload) sin reiniciar la app, el addon vuelve a la ranura 1; una
// publicación de estado escribe también de 1 a 16 para que no cargue una ranura vieja. Los mensajes, como siempre.
test('publicarEstado tras un mensaje escribe de r a r+15 y también de 1 a 16; un mensaje sigue gastando solo su ranura', async () => {
  const x = nucleo();
  await x.nucleo.publicarEstado();
  await x.nucleo.recibirTrama(trama({ r: 18 }));
  assert.equal(leerBuzon(1).registros.length, 0, 'el mensaje no reescribe la ranura 1');
  assert.equal(leerBuzon(18).registros.length, 1);
  const timbresAntes = x.sacados.filter((s) => s.startsWith('timbre_')).length;
  const r = await x.nucleo.publicarEstado({ claude: { estado: 'sin_sesion' }, codex: { estado: 'ok' } });
  for (const i of [1, 2, 16, 18, 20]) assert.equal(leerBuzon(i).estado.claude, 'sin_sesion', `ranura ${i}`);
  for (const i of [17]) assert.equal(leerBuzon(i).estado.claude, 'ok', `ranura ${i} sin tocar`);
  assert.equal(leerBuzon(1).registros.length, 1, 'el addon recién cargado también ve el último registro');
  assert.deepEqual(r.escritas, [...Array.from({ length: 16 }, (_, k) => 1 + k), 18, 19, 20], 'de 1 a 16 y de 18 a 20 (r + 15 se acota a 20)');
  assert.equal(x.sacados.filter((s) => s.startsWith('timbre_')).length - timbresAntes, 1, 'un solo timbre');
  // con r = 5 los dos tramos se juntan: de 1 a 20, sin repetir ninguna
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', r: 5, cuerpo: mensaje({ id: 'a3f1-2' }) }));
  const r2 = await x.nucleo.publicarEstado({ claude: { estado: 'ok' }, codex: { estado: 'ok' } });
  assert.deepEqual(r2.escritas, Array.from({ length: 20 }, (_, k) => 1 + k));
});

test('apuntarRecibido: por recencia; el tope de 50 conserva los más recientes', () => {
  const r = {};
  apuntarRecibido(r, 'A', 'a-1');
  apuntarRecibido(r, 'B', 'b-1');
  apuntarRecibido(r, 'A', 'a-2');
  assert.deepEqual(Object.keys(r), ['B', 'A']);
  assert.equal(r.A, 'a-2');
  for (let i = 0; i < 60; i++) apuntarRecibido(r, `P${i}`, `p-${i}`);
  apuntarRecibido(r, 'P0', 'p-0b');
  assert.equal(Object.keys(r).length, 50);
  assert.equal(r.P0, 'p-0b');
  assert.equal(r.P10, undefined);
  assert.equal(r.P59, 'p-59');
});

// ---------- historial ----------

test('historial: una línea por turno, solo crece, cuenta solo su pj y lo de después de la última «nueva» (12 por defecto)', async () => {
  const dir = join(h.base, 'hist');
  const hi = crearHistorial(dir);
  assert.deepEqual(hi.recientes(PJ), []);
  await hi.anadir(PJ, { t: 'jugador', texto: 'uno' });
  await hi.anadir(PJ, { t: 'ia', texto: 'dos' });
  await hi.anadir(PJ, { t: 'nueva' });
  for (let i = 0; i < 14; i++) await hi.anadir(PJ, { t: i % 2 ? 'ia' : 'jugador', texto: `t${i}` });
  assert.deepEqual(hi.recientes(PJ).map((l) => l.texto), Array.from({ length: 12 }, (_, i) => `t${i + 2}`));
  assert.deepEqual(hi.recientes(PJ, 2).map((l) => [l.rol, l.texto]), [['jugador', 't12'], ['ia', 't13']]);
  // Otro personaje con el mismo nombre de archivo no se mezcla, y una línea rota no rompe nada.
  const otro = 'Tal Cual Reino-Prueba';
  assert.equal(nombreArchivo(otro), nombreArchivo(PJ));
  await hi.anadir(otro, { t: 'jugador', texto: 'de otro' });
  nodeFs.appendFileSync(join(dir, 'historial', nombreArchivo(PJ)), '{roto\n');
  assert.equal(hi.recientes(PJ).some((l) => l.texto === 'de otro'), false);
  assert.deepEqual(hi.recientes(otro).map((l) => l.texto), ['de otro']);
  await assert.rejects(() => hi.anadir(PJ, { t: 'otro', texto: 'x' }));
});

test('historial: nombres de archivo sin signos ni nombres reservados de Windows (también COM¹ y LPT²)', () => {
  assert.equal(nombreArchivo('Tal Cual-Reino Prueba'), 'Tal_Cual_Reino_Prueba.jsonl');
  assert.equal(nombreArchivo('Ñandú-Reino'), 'Ñandú_Reino.jsonl');
  assert.equal(nombreArchivo('..\\..\\x'), '_x.jsonl');
  assert.equal(nombreArchivo('CON'), '_CON.jsonl');
  assert.equal(nombreArchivo('com¹'), '_com¹.jsonl');
  assert.equal(nombreArchivo('LPT²'), '_LPT².jsonl');
  assert.equal(nombreArchivo('COM³'), '_COM³.jsonl');
  assert.equal(nombreArchivo('COMA'), 'COMA.jsonl');
  assert.equal(nombreArchivo(''), '_.jsonl');
});

test('historial: al pasar de 1 MB se renombra con reintentos (no se borra) y se sigue en uno nuevo', async () => {
  const dir = join(h.base, 'hist');
  let bloqueos = 1;
  const fs = {
    ...nodeFs,
    renameSync(de, a) {
      if (bloqueos-- > 0) throw Object.assign(new Error('ocupado'), { code: 'EBUSY' });
      return nodeFs.renameSync(de, a);
    },
  };
  const hi = crearHistorial(dir, { fs });
  await hi.anadir(PJ, { t: 'jugador', texto: 'viejo' });
  const archivo = join(dir, 'historial', nombreArchivo(PJ));
  nodeFs.appendFileSync(archivo, `${'x'.repeat(MAX_BYTES_HISTORIAL)}\n`);
  await hi.anadir(PJ, { t: 'jugador', texto: 'nuevo' });
  const nombres = readdirSync(join(dir, 'historial'));
  assert.equal(nombres.length, 2);
  const rotado = nombres.find((x) => x !== nombreArchivo(PJ));
  assert.match(rotado, /^Tal_Cual_Reino_Prueba-.+\.jsonl$/);
  assert.ok(statSync(join(dir, 'historial', rotado)).size > MAX_BYTES_HISTORIAL);
  assert.equal(bloqueos, -1, 'el primer renombre se reintentó');
});

test('historial: con menos de 12 turnos desde la última «nueva», también lee el final del archivo rotado más reciente', async () => {
  const dir = join(h.base, 'hist');
  const carpeta = join(dir, 'historial');
  mkdirSync(carpeta, { recursive: true });
  const linea = (t, texto) => `${JSON.stringify({ cuando: 1, pj: PJ, t, texto })}\n`;
  const base = nombreArchivo(PJ).slice(0, -'.jsonl'.length);
  writeFileSync(join(carpeta, `${base}-2026-01-01T00-00-00-000Z.jsonl`), linea('jugador', 'muy viejo'));
  writeFileSync(join(carpeta, `${base}-2026-02-01T00-00-00-000Z.jsonl`), linea('jugador', 'r0') + linea('nueva', '') + linea('jugador', 'r1') + linea('ia', 'r2'));
  nodeFs.utimesSync(join(carpeta, `${base}-2026-01-01T00-00-00-000Z.jsonl`), new Date('2026-01-01'), new Date('2026-01-01'));
  const hi = crearHistorial(dir);
  await hi.anadir(PJ, { t: 'jugador', texto: 'c1' });
  assert.deepEqual(hi.recientes(PJ).map((l) => l.texto), ['r1', 'r2', 'c1']);
  await hi.anadir(PJ, { t: 'nueva' });
  await hi.anadir(PJ, { t: 'jugador', texto: 'c2' });
  assert.deepEqual(hi.recientes(PJ).map((l) => l.texto), ['c2'], 'con una «nueva» en el actual no se mira el rotado');
});

test('historial: recientes lee solo el final del archivo (64 KB)', async () => {
  const dir = join(h.base, 'hist');
  let leidos = 0;
  const fs = {
    ...nodeFs,
    readSync(fd, buf, ...resto) {
      const n = nodeFs.readSync(fd, buf, ...resto);
      leidos += n;
      return n;
    },
    readFileSync() {
      throw new Error('recientes no debe leer el archivo entero');
    },
  };
  const hi = crearHistorial(dir, { fs });
  await hi.anadir(PJ, { t: 'nueva' });
  const archivo = join(dir, 'historial', nombreArchivo(PJ));
  let relleno = '';
  for (let i = 0; i < 3000; i++) relleno += `${JSON.stringify({ cuando: 1, pj: PJ, t: i % 2 ? 'ia' : 'jugador', texto: `l${i}-${'z'.repeat(80)}` })}\n`;
  nodeFs.appendFileSync(archivo, relleno);
  assert.ok(statSync(archivo).size > 250 * 1024);
  const r = hi.recientes(PJ);
  assert.equal(r.length, 12);
  assert.ok(r[11].texto.startsWith('l2999-'));
  assert.ok(leidos <= 64 * 1024, `leídos ${leidos} bytes`);
});

// ---------- ronda 1 (Ruling F4-34) ----------

test('estado.motor es un ESTADO y motorNombre el motor: usuario solo de Codex, auto sin ok y Codex forzado', async () => {
  const casos = [
    [{ claude: NO, codex: OK }, undefined, { motor: 'ok', motorNombre: 'codex', claude: 'sin_instalar', codex: 'ok' }],
    [{ claude: OK, codex: OK }, undefined, { motor: 'ok', motorNombre: 'claude', claude: 'ok', codex: 'ok' }],
    [{ claude: { estado: 'sin_sesion' }, codex: NO }, undefined, { motor: 'sin_sesion', motorNombre: undefined, claude: 'sin_sesion', codex: 'sin_instalar' }],
    [{ claude: NO, codex: { estado: 'pago_por_uso' } }, undefined, { motor: 'pago_por_uso', motorNombre: undefined, claude: 'sin_instalar', codex: 'pago_por_uso' }],
    [{ claude: OK, codex: { estado: 'sin_sesion' } }, { motor: 'codex' }, { motor: 'sin_sesion', motorNombre: 'codex', claude: 'ok', codex: 'sin_sesion' }],
  ];
  for (const [est, config, esperado] of casos) {
    const x = nucleo({ config, comprobar: { claude: async () => est.claude, codex: async () => est.codex } });
    await x.nucleo.publicarEstado();
    assert.deepEqual({ ...leerBuzon(1).estado }, Object.fromEntries(Object.entries({ ...esperado, sabeParar: true }).filter(([, v]) => v !== undefined)), JSON.stringify(esperado));
  }
});

test('el historial que va a la IA son 12 líneas como mucho y se recorta por lo más viejo hasta ≤ 4.000 caracteres', async () => {
  const hi = crearHistorial(h.datos);
  for (let i = 1; i <= 12; i++) await hi.anadir(PJ, { t: i % 2 ? 'jugador' : 'ia', texto: `H${String(i).padStart(2, '0')}:${'x'.repeat(896)}` });
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ texto: 'nueva pregunta' }) }));
  const { stdin } = loApuntado();
  for (const i of [9, 10, 11, 12]) assert.ok(stdin.includes(`H${String(i).padStart(2, '0')}:`), `H${i}`);
  for (const i of [1, 5, 8]) assert.ok(!stdin.includes(`H${String(i).padStart(2, '0')}:`), `H${i}`);
});

test('con idioma en, el detalle del error va en inglés (conocidos traducidos, desconocidos genéricos)', async () => {
  const SIN_ESPANOL = /respuesta|ilegible|código|arrancar|cuenta|no se pudo|desconocid|fallo|interno/i;
  process.env.FALSO_MODO = 'basura'; // claude.mjs da «respuesta ilegible»
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ cuerpo: mensaje({ idioma: 'en' }) }));
  let reg = leerBuzon(7).registros[0];
  assert.equal(reg.tipo, 'fallo');
  assert.ok(reg.texto.startsWith('The AI could not answer ('), reg.texto);
  assert.ok(!SIN_ESPANOL.test(reg.texto), reg.texto);

  process.env.FALSO_MODO = 'error_json'; // detalle libre de la IA («Fallo interno desconocido»): genérico
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2', idioma: 'en' }) }));
  reg = leerBuzon(7).registros.find((r) => r.msg === 'a3f1-2');
  assert.ok(!SIN_ESPANOL.test(reg.texto), reg.texto);
  assert.ok(!reg.texto.includes('Fallo'));

  const y = nucleo({ config: { motor: 'claude' }, comprobar: { claude: async () => ({ estado: 'desconocido', motivo: 'no se pudo comprobar la cuenta' }), codex: async () => NO } });
  await y.nucleo.recibirTrama(trama({ id: 'e-1', r: 12, cuerpo: mensaje({ id: 'e-1', idioma: 'en' }) }));
  reg = leerBuzon(12).registros.find((r) => r.msg === 'e-1');
  assert.equal(reg.tipo, 'desconocido');
  assert.ok(!SIN_ESPANOL.test(reg.texto.replace('Could not check', '')), reg.texto);
  assert.equal(textoDetalle('respuesta ilegible', 'es'), 'respuesta ilegible');
  assert.equal(textoDetalle('código 3', 'en'), 'exit code 3');
  assert.equal(textoDetalle('algo raro que dijo la IA', 'en'), textoDetalle('otra cosa', 'en'));
});

test('r se acota a 1…20 (150 -> 20, 21 -> 20, 0 -> 1, lo que no vale -> 1)', async () => {
  assert.equal(acotarRanura(150), 20);
  assert.equal(acotarRanura(21), 20);
  assert.equal(acotarRanura(20), 20);
  assert.equal(acotarRanura(0), 1);
  assert.equal(acotarRanura(Number.NaN), 1);
  assert.equal(acotarRanura('7'), 1);
  assert.equal(acotarRanura(12), 12);
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({ r: 150 }));
  assert.equal(leerBuzon(20).registros[0].msg, 'a3f1-1');
  assert.equal(textoRanura(19), 'SNF_BUZON = nil\n');
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', r: 0, cuerpo: mensaje({ id: 'a3f1-2' }) }));
  assert.ok(leerBuzon(1).registros.some((r) => r.msg === 'a3f1-2'));
  assert.ok(leerBuzon(16).registros.some((r) => r.msg === 'a3f1-2'));
  assert.equal(textoRanura(17), 'SNF_BUZON = nil\n');
});

test('la ruta de claude/codex se resuelve una vez y se vuelve a buscar si el archivo ya no existe', () => {
  let llamadas = 0;
  let hay = true;
  const p = crearProgramas({
    resolvedores: { claude: () => { llamadas++; return { ruta: `C:\\x\\claude${llamadas}.exe`, tipo: 'exe' }; }, codex: () => null },
    existe: () => hay,
  });
  assert.equal(p.claude.ruta, 'C:\\x\\claude1.exe');
  assert.equal(p.claude.ruta, 'C:\\x\\claude1.exe');
  assert.equal(llamadas, 1);
  hay = false;
  assert.equal(p.claude.ruta, 'C:\\x\\claude2.exe');
  assert.equal(llamadas, 2);
  assert.equal(p.codex, null);
});

test('«nueva» se apunta también con ocupado; con un JSON que no se puede leer, no (Ruling F4-35)', async () => {
  process.env.FALSO_MODO = 'lento';
  const x = nucleo({ tiempoMax: 600 });
  const pjs = ['Uno-R', 'Dos-R', 'Tres-R', 'Cuatro-R'];
  const promesas = pjs.map((pj, i) => x.nucleo.recibirTrama(trama({ pj, id: `n0${i}-1`, cuerpo: mensaje({ pj, id: `n0${i}-1`, nueva: i === 3 }) })));
  await promesas[3];
  assert.equal(leerBuzon(7).registros.find((r) => r.pj === 'Cuatro-R').tipo, 'ocupado');
  assert.deepEqual(x.historial.recientes('Cuatro-R'), []);
  const lineas = (pj) => readFileSync(join(h.datos, 'historial', nombreArchivo(pj)), 'utf8').trim().split('\n').map((l) => JSON.parse(l).t);
  assert.deepEqual(lineas('Cuatro-R'), ['nueva']);
  await Promise.all(promesas);

  const roto = Buffer.concat([Buffer.from(['SNF1', 'Roto-R', 'f1-1', '1', '1', '0', '7', '0', ''].join('\x1f')), Buffer.from('{esto no es json')]);
  await x.nucleo.recibirTrama(roto);
  assert.equal(leerBuzon(7).registros.find((r) => r.pj === 'Roto-R').tipo, 'fallo');
  assert.equal(existsSync(join(h.datos, 'historial', nombreArchivo('Roto-R'))), false, 'sin línea «nueva» (ni ninguna otra)');
});

test('historial: dos anadir a la vez del mismo pj que obligan a rotar no se pisan (cola por pj, destino sin sobrescribir)', async () => {
  const dir = join(h.base, 'hist');
  // Un sello fijo hace que las dos rotaciones elegirían el mismo destino si fueran a la vez.
  const hi = crearHistorial(dir, { sello: () => 'SELLO' });
  await hi.anadir(PJ, { t: 'jugador', texto: 'primera' });
  const archivo = join(dir, 'historial', nombreArchivo(PJ));
  const base = archivo.slice(0, -'.jsonl'.length);
  writeFileSync(`${base}-SELLO.jsonl`, 'ya estaba\n'); // un destino ocupado: no se sobrescribe
  nodeFs.appendFileSync(archivo, `${'x'.repeat(MAX_BYTES_HISTORIAL)}\n`);
  await Promise.all([hi.anadir(PJ, { t: 'jugador', texto: 'a' }), hi.anadir(PJ, { t: 'ia', texto: 'b' })]);
  assert.equal(readFileSync(`${base}-SELLO.jsonl`, 'utf8'), 'ya estaba\n');
  const rotados = readdirSync(join(dir, 'historial')).filter((n) => n.startsWith(`${nombreArchivo(PJ).slice(0, -6)}-`));
  assert.equal(rotados.length, 2, rotados.join(', ')); // el que ya estaba y una sola rotación nueva
  assert.ok(statSync(`${base}-SELLO-1.jsonl`).size > MAX_BYTES_HISTORIAL);
  const actual = readFileSync(archivo, 'utf8').trim().split('\n').map((l) => JSON.parse(l).texto);
  assert.deepEqual(actual, ['a', 'b']);
});

test('una base que lanza de forma síncrona no rompe crearNucleo: el turno da «fallo»', async () => {
  let x;
  assert.doesNotThrow(() => {
    x = nucleo({ base: () => { throw new Error('síncrono'); } });
  });
  await x.nucleo.recibirTrama(trama({}));
  assert.equal(leerBuzon(7).registros[0].tipo, 'fallo');
  assert.equal(x.llamadas.length, 0);
});

const REGISTRO_RARO = { seq: 3, pj: PJ, msg: 'v-3', t: 'respuesta', texto: 'x', propuesta: { 'clave-rara': 1 } };

test('un registro anterior que no se puede pasar a Lua se sustituye por un error y el buzón se escribe', async () => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'estado.json'), JSON.stringify({ seq: 3, recibidos: {}, registros: [REGISTRO_RARO] }));
  const x = nucleo();
  await x.nucleo.recibirTrama(trama({}));
  const b = leerBuzon(7);
  const viejo = b.registros.find((r) => r.msg === 'v-3');
  assert.equal(viejo.t, 'error');
  assert.equal(viejo.tipo, 'fallo');
  assert.equal(b.registros.find((r) => r.msg === 'a3f1-1').t, 'respuesta');
});

test('el sustituto de textoBuzon: si el único registro (el último) no se puede pasar a Lua, sale un error con su msg', async () => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'estado.json'), JSON.stringify({ seq: 3, recibidos: {}, registros: [REGISTRO_RARO] }));
  const x = nucleo();
  await x.nucleo.publicarEstado();
  const b = leerBuzon(1);
  assert.equal(b.registros.length, 1);
  assert.equal(b.registros[0].msg, 'v-3');
  assert.equal(b.registros[0].tipo, 'fallo');
  assert.equal(b.registros[0].seq, 3);
});

test('si la base no carga, se reintenta en un turno posterior, como mucho una vez por minuto', async () => {
  let t = 5_000_000;
  let cargas = 0;
  const base = () => {
    cargas++;
    return cargas === 1 ? Promise.reject(new Error('todavía no')) : Promise.resolve(BASE);
  };
  const x = nucleo({ base, reloj: { ahora: () => t } });
  await x.nucleo.recibirTrama(trama({}));
  assert.equal(leerBuzon(7).registros.at(-1).tipo, 'fallo');
  t += 10_000;
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-2', cuerpo: mensaje({ id: 'a3f1-2' }) }));
  assert.equal(leerBuzon(7).registros.at(-1).tipo, 'fallo');
  assert.equal(cargas, 1);
  t += 61_000;
  await x.nucleo.recibirTrama(trama({ id: 'a3f1-3', cuerpo: mensaje({ id: 'a3f1-3' }) }));
  assert.equal(leerBuzon(7).registros.at(-1).t, 'respuesta');
  assert.equal(cargas, 2);
});

// Tarea 13, ronda 1 (duda 5): recargarBase carga otra vez en segundo plano y solo cambia la base si la nueva carga bien.
test('recargarBase: con una base nueva que carga, se usa la nueva; si la nueva falla, se sigue con la vieja y se apunta', async () => {
  const NUEVA = { ...BASE, marca: 'nueva' };
  let cargas = 0;
  let siguiente = () => Promise.resolve(NUEVA);
  const base = () => {
    cargas++;
    return cargas === 1 ? Promise.resolve(BASE) : siguiente();
  };
  const x = nucleo({ base });
  assert.equal(await x.nucleo.baseActual(), BASE);
  assert.equal(await x.nucleo.recargarBase(), true);
  assert.equal(await x.nucleo.baseActual(), NUEVA);
  siguiente = () => Promise.reject(Object.assign(new Error('a medias'), { code: 'ENOENT' }));
  assert.equal(await x.nucleo.recargarBase(), false);
  assert.equal(await x.nucleo.baseActual(), NUEVA, 'la que ya estaba se queda');
  assert.match(readFileSync(join(h.datos, 'registro.log'), 'utf8'), /la base nueva no cargó \(ENOENT\): se sigue con la anterior/);
  // y el turno sigue contestando con la que hay
  await x.nucleo.recibirTrama(trama({}));
  assert.equal(leerBuzon(7).registros.at(-1).t, 'respuesta');
});

test('recargarBase: con una base que no es una función (ya cargada) no hace nada', async () => {
  const x = nucleo();
  assert.equal(await x.nucleo.recargarBase(), false);
  assert.equal(await x.nucleo.baseActual(), BASE);
});

test('trama de varias partes: se contesta una vez, cuando llega la última', async () => {
  const x = nucleo();
  const json = Buffer.from(JSON.stringify(mensaje({ texto: 'en dos partes' })), 'utf8');
  const mitad = Math.floor(json.length / 2);
  const parte = (k, datos) => Buffer.concat([Buffer.from(['SNF1', PJ, 'a3f1-1', String(k), '2', '0', '7', '0', ''].join('\x1f')), datos]);
  assert.equal(await x.nucleo.recibirTrama(parte(2, json.subarray(mitad))), null);
  assert.equal(x.llamadas.length, 0);
  await x.nucleo.recibirTrama(parte(1, json.subarray(0, mitad)));
  assert.equal(x.llamadas.length, 1);
  assert.ok(loApuntado().stdin.includes('en dos partes'));
});

test('bytes basura en recibirTrama: nada se rompe ni se publica', async () => {
  const x = nucleo();
  for (const b of [Buffer.from('basura'), Buffer.alloc(0), null, undefined, 'texto', Buffer.from([0x53, 0x4e, 0x46, 0x31, 0x1f, 0xff, 0xfe]), Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 37) % 256))]) {
    assert.equal(await x.nucleo.recibirTrama(b), null);
  }
  assert.equal(x.nucleo.estado().publicaciones, 0);
  assert.equal(textoRanura(1), 'SNF_BUZON = nil\n');
});

// ---------- tarea 14: la pregunta con las herramientas de guías ----------

const AYUDA_REAL = join(AQUI, 'falso-claude', 'ayuda-real.txt');
const FIXTURES_BIBLIOTECA = join(AQUI, 'fixtures', 'biblioteca');
const registroDe = (msg, i = 7) => leerBuzon(i).registros.find((r) => r.msg === msg);
// Las pruebas de la tarea 14 usan un personaje inventado solo para ellas.
const PJ_PRUEBA = 'Ejemplo-Reino';
const tramaT14 = ({ id = 'a3f1-1', ...m } = {}) => trama({ pj: PJ_PRUEBA, id, cuerpo: mensaje({ pj: PJ_PRUEBA, id, ...m }) });

// La biblioteca de fixtures copiada e indexada en la carpeta de datos de la prueba (la que lee el servidor de verdad).
async function bibliotecaIndexada() {
  const guias = join(h.datos, CARPETA_GUIAS);
  mkdirSync(guias, { recursive: true });
  nodeFs.cpSync(FIXTURES_BIBLIOTECA, guias, { recursive: true });
  await crearIndice({ datos: h.datos, fs: nodeFs, base: async () => BASE }).actualizar();
  return JSON.parse(readFileSync(join(h.datos, RUTA_INDICE), 'utf8'));
}

test('tarea 14: punta a punta, el claude falso arranca el servidor de mcp.json y la respuesta trae la guía de baldios.txt', async () => {
  const indice = await bibliotecaIndexada();
  const nombre = indice.guias.find((g) => g.archivo === 'baldios.txt').nombre;
  assert.ok(nombre);
  process.env.FALSO_AYUDA = AYUDA_REAL;
  process.env.FALSO_MODO = 'herramientas';
  process.env.FALSO_LLAMADAS = JSON.stringify([{ nombre: 'buscar_guias', argumentos: { zona: 'Los Baldíos' } }]);
  const x = nucleo({ herramientas: true, carpetaBase });
  await x.nucleo.recibirTrama(tramaT14({ texto: 'PREGUNTA_SECRETA_7310 ¿qué guía de los Baldíos hago?' }));

  const reg = registroDe('a3f1-1');
  assert.equal(reg.t, 'respuesta', JSON.stringify(reg));
  assert.ok(reg.texto.includes(nombre), reg.texto);
  assert.ok(!reg.texto.includes('(Las herramientas'), 'el servidor arrancó: sin aviso');
  assert.equal(x.llamadas.length, 1);
  assert.deepEqual(x.llamadas[0].herramientas, { mcpConfig: rutaMcp(h.datos), nombres: HERRAMIENTAS });
  assert.deepEqual(x.turnoAlPreguntar, [true], 'turno.json se escribe antes de preguntar');
  const argv = loApuntado().argv;
  assert.equal(tras(argv, '--mcp-config'), rutaMcp(h.datos));
  const log = readFileSync(join(h.datos, 'registro.log'), 'utf8');
  assert.match(log, /claude herramientas: buscar_guias 1 \(mcp connected\)/);
  for (const prohibido of ['PREGUNTA_SECRETA_7310', nombre, 'baldios.txt', PJ_PRUEBA, 'Ejemplo', 'Reino']) assert.ok(!log.includes(prohibido), `el registro contiene «${prohibido}»`);
});

test('tarea 14: turno.json lleva el nivel y el mapa del mensaje y nunca el nombre del personaje; en modo json no hay aviso', async () => {
  const x = nucleo({ herramientas: true, carpetaBase });
  await x.nucleo.recibirTrama(tramaT14({ texto: 'qué guía sigo' }));
  const crudo = readFileSync(rutaTurno(h.datos), 'utf8');
  const turno = JSON.parse(crudo);
  assert.equal(turno.pj.nivel, 3);
  assert.equal(turno.lugar.mapa, 1411);
  assert.equal(turno.carpetaBase, carpetaBase);
  assert.ok(!Object.hasOwn(turno, 'addonsDir'), 'el servidor no usa la carpeta AddOns (revisión final)');
  assert.ok(!crudo.includes('AddOns'), crudo);
  for (const parte of [PJ_PRUEBA, 'Ejemplo', 'Reino']) assert.ok(!crudo.includes(parte), crudo);
  // La ayuda de muestra no tiene --verbose: va en json, sin saber el estado del servidor, y no se dice que falló.
  assert.equal(registroDe('a3f1-1').texto, 'respuesta falsa');
  assert.ok(x.llamadas[0].herramientas);
});

test('22-nov: Codex recibe las herramientas que leen; el aviso solo sale si no pudo usarlas y el mensaje va de guías', async () => {
  let resultado = { ok: true, texto: 'respuesta de codex', ms: 1, usadas: 1, mcpFallo: false };
  const x = nucleo({
    herramientas: true, carpetaBase, config: { motor: 'codex' },
    comprobar: { claude: async () => OK, codex: async () => OK },
    codex: async () => resultado,
  });
  await x.nucleo.recibirTrama(tramaT14({ texto: '¿qué guía sigo ahora?' }));
  assert.equal(registroDe('a3f1-1').texto, 'respuesta de codex');
  resultado = { ok: true, texto: 'respuesta de codex', ms: 1, usadas: 0, mcpFallo: true };
  await x.nucleo.recibirTrama(tramaT14({ id: 'a3f1-2', texto: 'hola' }));
  assert.equal(registroDe('a3f1-2').texto, 'respuesta de codex');
  await x.nucleo.recibirTrama(tramaT14({ id: 'a3f1-3', texto: 'which guide next?', idioma: 'en' }));
  assert.equal(registroDe('a3f1-3').texto, `respuesta de codex\n${textoHerramientas('codex', 'en')}`);
  resultado = { ok: true, texto: 'respuesta de codex', ms: 1, sinHerramientas: true };
  await x.nucleo.recibirTrama(tramaT14({ id: 'a3f1-4', texto: '¿qué guía sigo ahora?' }));
  assert.equal(registroDe('a3f1-4').texto, `respuesta de codex\n${textoHerramientas('codex', 'es')}`);
  assert.equal(x.llamadas.length, 4);
  for (const o of x.llamadas) {
    assert.ok(o.mcp.args.includes('--solo-lectura'));
    assert.ok(!o.mcp.nombres.includes('guardar_guia'));
    assert.ok(!('herramientas' in o), 'a Codex no se le pasa la configuración de Claude');
  }
  assert.ok(existsSync(rutaTurno(h.datos)), 'con Codex también se escribe turno.json');
  assert.ok(!existsSync(rutaMcp(h.datos)), 'pero no mcp.json');
  // Al historial va la respuesta de la IA, sin el aviso de la app.
  assert.ok(x.historial.recientes(PJ_PRUEBA).filter((l) => l.rol === 'ia').every((l) => l.texto === 'respuesta de codex'));
});

test('tarea 14 (Review Focus 4): un stream cuyo init dice failed: la respuesta llega y acaba con no_arrancaron', async () => {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  process.env.FALSO_MODO = 'stream';
  process.env.FALSO_STREAM = JSON.stringify([
    { type: 'system', subtype: 'init', mcp_servers: [{ name: 'snetforever', status: 'failed' }] },
    { type: 'result', subtype: 'success', is_error: false, result: 'respuesta sin biblioteca' },
  ]);
  const x = nucleo({ herramientas: true, carpetaBase });
  await x.nucleo.recibirTrama(tramaT14({ texto: 'qué guía sigo' }));
  const reg = registroDe('a3f1-1');
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.texto, `respuesta sin biblioteca\n${textoHerramientas('no_arrancaron', 'es')}`);
  // En inglés, el aviso en inglés.
  await x.nucleo.recibirTrama(tramaT14({ id: 'a3f1-2', texto: 'which guide', idioma: 'en' }));
  assert.equal(registroDe('a3f1-2').texto, `respuesta sin biblioteca\n${textoHerramientas('no_arrancaron', 'en')}`);
  assert.match(readFileSync(join(h.datos, 'registro.log'), 'utf8'), /mensaje a3f1-1: herramientas no_arrancaron/);
});

test('tarea 14: si mcp.json no se puede preparar, se pregunta sin herramientas y la respuesta acaba con no_arrancaron', async () => {
  mkdirSync(rutaMcp(h.datos), { recursive: true }); // una carpeta donde va mcp.json: no se puede leer ni escribir
  const x = nucleo({ herramientas: true, carpetaBase });
  await x.nucleo.recibirTrama(tramaT14({ texto: 'qué guía sigo' }));
  const reg = registroDe('a3f1-1');
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.texto, `respuesta falsa\n${textoHerramientas('no_arrancaron', 'es')}`);
  assert.equal(x.llamadas.length, 1);
  assert.ok(!x.llamadas[0].herramientas, 'la pregunta va sin herramientas');
  assert.ok(!loApuntado().argv.join(' ').includes('mcp__'));
});

test('tarea 14: con sinHerramientas la respuesta acaba con sin_opciones y el turno no falla', async () => {
  const ayuda = join(h.base, 'ayuda-sin-strict.txt');
  writeFileSync(ayuda, readFileSync(join(AQUI, 'falso-claude', 'ayuda.txt'), 'utf8').replace(/^.*--strict-mcp-config.*$/m, ''));
  process.env.FALSO_AYUDA = ayuda;
  const x = nucleo({ herramientas: true, carpetaBase });
  await x.nucleo.recibirTrama(tramaT14({ texto: 'hola' }));
  const reg = registroDe('a3f1-1');
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.texto, `respuesta falsa\n${textoHerramientas('sin_opciones', 'es')}`);
});

test('tarea 14: con herramientas: false (por defecto) ni turno.json ni mcp.json ni herramientas en la pregunta', async () => {
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaT14({ texto: 'qué guía sigo' }));
  assert.equal(registroDe('a3f1-1').texto, 'respuesta falsa');
  assert.equal(x.llamadas[0].herramientas, undefined);
  assert.ok(!existsSync(rutaTurno(h.datos)));
  assert.ok(!existsSync(rutaMcp(h.datos)));
});

test('prueba B: la línea que pide usar las herramientas va en la entrada con las herramientas listas', async () => {
  // Con Claude y herramientas: la línea va justo antes de la pregunta.
  const x = nucleo({ herramientas: true, carpetaBase });
  await x.nucleo.recibirTrama(tramaT14({ texto: 'creame una guía de mi nivel' }));
  const entrada = x.llamadas[0].entrada;
  assert.ok(entrada.includes(`${LINEA_HERRAMIENTAS}\nPregunta del jugador:`), entrada.slice(-300));
  // Sin herramientas (por defecto): nada.
  const y = nucleo();
  await y.nucleo.recibirTrama(tramaT14({ id: 'a3f1-2', texto: 'creame una guía de mi nivel' }));
  assert.ok(!y.llamadas[0].entrada.includes(LINEA_HERRAMIENTAS));
  // 22-nov: con Codex, también.
  const z = nucleo({
    herramientas: true, carpetaBase, config: { motor: 'codex' },
    comprobar: { claude: async () => OK, codex: async () => OK },
    codex: async () => ({ ok: true, texto: 'respuesta de codex', ms: 1 }),
  });
  await z.nucleo.recibirTrama(tramaT14({ id: 'a3f1-3', texto: 'creame una guía de mi nivel' }));
  assert.ok(z.llamadas[0].entrada.includes(LINEA_HERRAMIENTAS));
});

test('prueba B: con herramientas pedidas pero sin poder preparar mcp.json, la pregunta va sin ellas y sin la línea', async () => {
  mkdirSync(rutaMcp(h.datos), { recursive: true }); // una carpeta donde va mcp.json: no se puede leer ni escribir
  const w = nucleo({ herramientas: true, carpetaBase });
  await w.nucleo.recibirTrama(tramaT14({ id: 'a3f1-1', texto: 'creame una guía de mi nivel' }));
  assert.ok(!w.llamadas[0].herramientas);
  assert.ok(!w.llamadas[0].entrada.includes(LINEA_HERRAMIENTAS));
});

test('tarea 14 (revisión 1): con una respuesta de más de 4000 caracteres y init failed, el aviso llega entero y todo cabe', async () => {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  process.env.FALSO_MODO = 'stream';
  process.env.FALSO_STREAM = JSON.stringify([
    { type: 'system', subtype: 'init', mcp_servers: [{ name: 'snetforever', status: 'failed' }] },
    { type: 'result', subtype: 'success', is_error: false, result: 'palabra larga '.repeat(500) },
  ]);
  const x = nucleo({ herramientas: true, carpetaBase });
  await x.nucleo.recibirTrama(tramaT14({ texto: 'qué guía sigo' }));
  const { texto } = registroDe('a3f1-1');
  const aviso = textoHerramientas('no_arrancaron', 'es');
  assert.ok(texto.endsWith(`\n${aviso}`), texto.slice(-200));
  assert.ok(texto.length <= 4000, String(texto.length));
  assert.ok(Buffer.byteLength(texto, 'utf8') <= 12000);
  assert.ok(texto.includes('…'), 'el cuerpo se recorta, no el aviso');
});

test('tarea 14 (revisión 1): con el servidor en pending pero alguna de nuestras herramientas usada, no hay aviso', async () => {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  process.env.FALSO_MODO = 'stream';
  const stream = (usada) => JSON.stringify([
    { type: 'system', subtype: 'init', mcp_servers: [{ name: 'snetforever', status: 'pending' }] },
    ...(usada ? [{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'mcp__snetforever__buscar_guias', input: {} }] } }] : []),
    { type: 'result', subtype: 'success', is_error: false, result: 'respuesta con guías' },
  ]);
  process.env.FALSO_STREAM = stream(true);
  const x = nucleo({ herramientas: true, carpetaBase });
  await x.nucleo.recibirTrama(tramaT14({ texto: 'qué guía sigo' }));
  assert.equal(registroDe('a3f1-1').texto, 'respuesta con guías');
  // En pending y sin usar ninguna, sí.
  process.env.FALSO_STREAM = stream(false);
  await x.nucleo.recibirTrama(tramaT14({ id: 'a3f1-2', texto: 'qué guía sigo' }));
  assert.equal(registroDe('a3f1-2').texto, `respuesta con guías\n${textoHerramientas('no_arrancaron', 'es')}`);
});

// ---------- tarea 20: la guía que crea la IA llega al juego, con «sigue» para los tramos ----------

// Personajes inventados solo para estas pruebas.
const PJ_RUTA = 'Ejemplo-Reino';
const PJ_RUTA_DOS = 'Otro-Ejemplo';
const conBloque = (bloque, prosa = 'Aquí tienes la ruta.') => `${prosa}\n\`\`\`snet\n${JSON.stringify(bloque)}\n\`\`\``;
const tramaRuta = ({ id = 'b7c2-1', pj = PJ_RUTA, nivel = 3, ...m } = {}) => trama({
  pj, id,
  cuerpo: mensaje({
    pj, id, ...m,
    ctx: { pj: { nivel, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, xp: 0, xpMax: 900, dinero: 0 }, ...(m.ctx ?? {}) },
  }),
});
const registroRuta = (msg) => leerBuzon(7).registros.find((r) => r.msg === msg);
const lista = (v) => (Array.isArray(v) ? v : Object.values(v ?? {}));
const elementosDe = (guia) => lista(guia.pasos).flatMap((p) => lista(p.elementos));
// Las misiones de la ruta de Dalaran: 4641 (de nivel 1) y 791, una de mazmorra de nivel 12.
const DALARAN = {
  titulo: 'Dalaran',
  pasos: [
    { texto: 'Habla con Gornek', punto: 'B:q4641:r', misiones: [{ q: 4641, accion: 'aceptar' }] },
    { texto: 'La de la mazmorra', misiones: [{ q: 791, accion: 'aceptar' }] },
    { misiones: [{ q: 4641, accion: 'entregar' }], punto: 'B:q4641:e' },
  ],
};

test('tarea 20: textoGuiaNueva en es y en (resumen, quitados con la frase del brief, tramo y sin_pasos)', () => {
  assert.equal(textoGuiaNueva('quitados', { misiones: 2, puntos: 1 }, 'es'),
    'Se han quitado 2 misiones que no están en la base ni en tus guías y 1 punto que no se pudo comprobar.');
  assert.equal(textoGuiaNueva('quitados', {}, 'es'), '');
  assert.match(textoGuiaNueva('quitados', { misiones: 1 }, 'es'), /^Se ha quitado 1 misión /);
  assert.match(textoGuiaNueva('quitados', { misiones: 2, puntos: 1 }, 'en'), /^Removed 2 quests .* and 1 point /);
  assert.match(textoGuiaNueva('quitados', { textos: 2 }, 'es'), /2 textos/);
  for (const idioma of ['es', 'en']) {
    assert.ok(Object.hasOwn(TEXTOS_GUIA_NUEVA, idioma));
    const r1 = textoGuiaNueva('resumen', { titulo: 'Dalaran', pasos: 3, misiones: 2, tramo: 1, tramos: 1 }, idioma);
    assert.ok(r1.includes('Dalaran') && r1.includes('3') && r1.includes('2'), r1);
    assert.ok(!/sigue|next/i.test(r1), 'con un solo tramo no se habla de «sigue»');
    const r2 = textoGuiaNueva('resumen', { titulo: 'Dalaran', pasos: 450, misiones: 0, tramo: 1, tramos: 2 }, idioma);
    assert.ok(r2.includes(idioma === 'es' ? '«sigue»' : '"next"'), r2);
    assert.ok(textoGuiaNueva('tramo', { i: 2, n: 3, titulo: 'Ruta de X' }, idioma).includes('2'));
    assert.equal(typeof textoGuiaNueva('sin_pasos', {}, idioma), 'string');
    assert.ok(textoGuiaNueva('sin_pasos', {}, idioma).length > 0);
  }
  // T3 (B1): solo se parte lo que no cabe en una guía; el resumen lo dice así, con los pasos de la parte que llega.
  assert.equal(textoGuiaNueva('resumen', { titulo: 'X', pasos: 450, misiones: 0, tramo: 1, tramos: 2, pasosTramo: 370 }, 'es'),
    'Te he preparado la ruta «X»: 450 pasos y 0 misiones. No cabe en una sola guía: va en 2 partes y te mando la 1 (370 pasos). '
    + 'Cuando la acabes, escribe «sigue» y te mando la siguiente.');
  assert.match(textoGuiaNueva('resumen', { titulo: 'X', pasos: 450, misiones: 0, tramo: 1, tramos: 2, pasosTramo: 370 }, 'en'),
    /doesn't fit in one guide: it comes in 2 parts and this is part 1 \(370 steps\)\. When you finish it, type "next"/);
  assert.equal(textoGuiaNueva('tramo', { i: 2, n: 3, titulo: 'R' }, 'es'), 'Parte 2 de 3: «R». Cuando la acabes, escribe «sigue» y te mando la siguiente.');
  assert.equal(textoGuiaNueva('tramo', { i: 3, n: 3, titulo: 'R' }, 'es'), 'Parte 3 de 3: «R». Es la última.');
  // Ronda 1 (M6): la guía de la biblioteca que sigue dice «esta guía» si llega en una sola parte.
  assert.match(textoGuiaNueva('biblioteca', { hasta: 10, total: 50, siguiente: 11, partes: 1 }, 'es'), /Cuando acabes esta guía, escribe «sigue» y te la abro desde el paso 11\./);
  assert.match(textoGuiaNueva('biblioteca', { hasta: 10, total: 50, siguiente: 11, partes: 2 }, 'es'), /Cuando acabes estas partes, escribe «sigue»/);
  assert.match(textoGuiaNueva('biblioteca', { hasta: 10, total: 50, siguiente: 11, partes: 1 }, 'en'), /When you finish this guide, type "next"/);
  assert.equal(textoGuiaNueva('resumen', { titulo: 'X', pasos: 1, misiones: 1, tramo: 1, tramos: 1 }, 'fr'),
    textoGuiaNueva('resumen', { titulo: 'X', pasos: 1, misiones: 1, tramo: 1, tramos: 1 }, 'es'));
});

test('tarea 20: esSigue y pideGuia (sin tildes, mayúsculas ni signos)', () => {
  for (const t of ['sigue', 'Sigue', '¡SIGUE!', 'siguiente', 'Siguiente tramo.', 'continúa', 'Continua', 'continue', 'Next', ' next ']) {
    assert.equal(esSigue(t), true, t);
  }
  for (const t of ['', 'sigue con la ruta de Durotar', 'qué sigue', 'nexto', 'continuar luego', null, 5]) assert.equal(esSigue(t), false, String(t));
  for (const t of ['créame la ruta de Dalaran', 'Hazme una guía', 'haz la ruta de esta zona', 'dame una ruta', 'ponme la guía',
    'quiero una ruta para subir', 'make me a route', 'create a guide for Durotar', 'give me a guide', 'quiero llegar a Orgrimmar',
    'quiero ir a Dalaran', 'Llévame a Durotar', 'how do I get to Orgrimmar?', 'take me to the Barrens']) {
    assert.equal(pideGuia(t), true, t);
  }
  for (const t of ['¿qué misiones hay en Durotar?', 'hola', 'esta ruta es larga', 'what quests are in the Barrens', '', undefined]) {
    assert.equal(pideGuia(t), false, String(t));
  }
});

test('tarea 20: «créame la ruta de Dalaran» con un personaje de nivel 1 y otro de 28: misma guía (nada quitado por nivel), abierta sola', async () => {
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: DALARAN });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', nivel: 1, texto: 'créame la ruta de Dalaran' }));
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', pj: PJ_RUTA_DOS, nivel: 28, texto: 'créame la ruta de Dalaran' }));
  const a = registroRuta('b7c2-1');
  const b = registroRuta('b7c2-2');
  for (const reg of [a, b]) {
    assert.equal(reg.t, 'respuesta', JSON.stringify(reg));
    assert.equal(reg.guiaIA.clave, 'IA\\Ruta de Dalaran (Horda)');
    assert.equal(reg.guiaIA.tipo, 'ia');
    assert.equal(reg.abrirGuiaIA, true, 'el jugador la pidió: se abre sola');
    assert.ok(reg.texto.startsWith('Aquí tienes la ruta.'), reg.texto);
    assert.ok(!reg.texto.includes('```'));
  }
  assert.equal(JSON.stringify(a.guiaIA.pasos), JSON.stringify(b.guiaIA.pasos), 'los mismos pasos en los dos');
  const qs = elementosDe(a.guiaIA).map((e) => e.q).filter(Boolean);
  assert.ok(qs.includes(791), 'la misión de mazmorra se queda');
  assert.ok(qs.includes(4641));
  // La marca de origen se resuelve: el primer paso lleva su goto en Durotar.
  const goto = elementosDe(a.guiaIA).find((e) => e.t === 'goto');
  assert.equal(goto.mapa, 1411);
  const resumen = textoGuiaNueva('resumen', { titulo: 'Dalaran', pasos: lista(a.guiaIA.pasos).length, misiones: 2, tramo: 1, tramos: 1 }, 'es');
  assert.ok(a.texto.includes(resumen), a.texto);
  assert.ok(!a.texto.includes('Se han quitado') && !a.texto.includes('Se ha quitado'), a.texto);
});

test('tarea 20: una misión inventada sale en el texto como quitada y no está en la guía; una de la biblioteca se queda', async () => {
  // Un índice de la biblioteca con una misión que no está en la base (777777).
  mkdirSync(dirname(join(h.datos, RUTA_INDICE)), { recursive: true });
  writeFileSync(join(h.datos, RUTA_INDICE), JSON.stringify({ version: 1, guias: [{ id: 'abcdef01', archivo: 'x.txt', misiones: [777777] }] }));
  process.env.FALSO_RESPUESTA = conBloque({
    guiaNueva: {
      titulo: 'Inventos',
      pasos: [
        { texto: 'Una que no existe', misiones: [{ q: 999999, accion: 'aceptar' }, { q: 4641, accion: 'aceptar' }] },
        { texto: 'Una de tus guías', misiones: [{ q: 777777, accion: 'aceptar' }] },
        { texto: 'Un punto inventado', punto: 'B:q999999:r' },
      ],
    },
  });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'hazme una guía' }));
  const reg = registroRuta('b7c2-1');
  const qs = elementosDe(reg.guiaIA).map((e) => e.q).filter(Boolean);
  assert.ok(!qs.includes(999999), 'la inventada no está en la guía');
  assert.ok(qs.includes(4641));
  assert.ok(qs.includes(777777), 'la de la biblioteca se queda');
  const quitados = textoGuiaNueva('quitados', { misiones: 1, puntos: 1, pasos: 0, tramos: 0, textos: 0 }, 'es');
  assert.ok(reg.texto.includes(quitados), reg.texto);
});

test('tarea 20: lo que corta guiaNuevaValida también se cuenta en el aviso de lo quitado', async () => {
  const pasos = Array.from({ length: 402 }, (_, i) => ({ texto: `Paso ${i + 1} ${'x'.repeat(i === 0 ? 250 : 0)}`.trim() }));
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: { titulo: 'Larga', pasos } });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'hazme una ruta' }));
  const reg = registroRuta('b7c2-1');
  assert.ok(reg.guiaIA);
  const quitados = textoGuiaNueva('quitados', { misiones: 0, puntos: 0, pasos: 2, tramos: 0, textos: 1 }, 'es');
  assert.ok(reg.texto.includes(quitados), reg.texto);
});

// 16-nov: la previa que falta entra delante (con el registro del turno) y la que no se puede hacer quita su misión, con
// una línea al final de la respuesta.
test('16-nov: guiaNueva con una previa que falta la mete delante; con una que no es para el personaje, quita la misión y lo dice al final', async () => {
  const RUTA = { titulo: 'Previas', pasos: [{ texto: 'Coge las dos', misiones: [{ q: 788, accion: 'aceptar' }, { q: 792, accion: 'aceptar' }] }] };
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'hazme una ruta', ctx: { registro: [] } }));
  const horda = registroRuta('b7c2-1');
  const acciones = elementosDe(horda.guiaIA).filter((e) => e.q !== undefined).map((e) => `${e.t} ${e.q}`);
  assert.deepEqual(acciones.slice(0, 4), ['accept 4641', 'complete 4641', 'turnin 4641', 'accept 788'], 'la previa (4641) va delante');
  const anadida = textoGuiaNueva('previas', { previas: 1 }, 'es');
  assert.equal(anadida, 'Añadí delante 1 misión previa que faltaba.');
  assert.ok(horda.texto.trimEnd().endsWith(anadida), horda.texto);
  // Con la 4641 en el registro no hace falta meter nada.
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: 'hazme una ruta', ctx: { registro: [{ q: 4641, c: 0 }] } }));
  const conElla = registroRuta('b7c2-2');
  assert.ok(!elementosDe(conElla.guiaIA).some((e) => e.q === 4641 && e.t === 'turnin'));
  assert.ok(!conElla.texto.includes('Añadí'), conElla.texto);
  // Un humano (Alianza) no puede coger la 4641 (es de razas de la Horda): se quita la 788 y se dice en una línea.
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-3', texto: 'hazme una ruta',
    ctx: { pj: { nivel: 3, clase: 'WARRIOR', raza: 'Human', faccion: 'Alliance', sexo: 2, xp: 0, xpMax: 900, dinero: 0 }, registro: [] } }));
  const alianza = registroRuta('b7c2-3');
  const qs = elementosDe(alianza.guiaIA).map((e) => e.q).filter(Boolean);
  assert.ok(!qs.includes(788) && qs.includes(792), JSON.stringify(qs));
  const linea = 'Quité «Dientes afilados» porque necesita «Tu lugar en el mundo», que no es para tu facción, raza o clase.';
  assert.ok(alianza.texto.trimEnd().endsWith(linea), alianza.texto);
});

// 17-nov (T2-app, A1): la guiaNueva que recoge y entrega una misión sin completarla lleva sus objetivos de la base entre
// medias; si el registro dice que ya está lista para entregar, no.
test('T2 (A1): guiaNueva sin «completar» lleva los objetivos de la base antes de la entrega, salvo si ya está lista', async () => {
  const RUTA = { titulo: 'Objetivos', pasos: [
    { texto: 'Recoge', misiones: [{ q: 4641, accion: 'aceptar' }], punto: 'B:q4641:r' },
    { texto: 'Entrega', misiones: [{ q: 4641, accion: 'entregar' }], punto: 'B:q4641:e' },
  ] };
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA });
  const x = nucleo();
  const acciones = (reg) => elementosDe(reg.guiaIA).filter((e) => e.q !== undefined).map((e) => `${e.t} ${e.q}`);
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'hazme una ruta', ctx: { registro: [{ q: 4641, c: 0 }] } }));
  assert.deepEqual(acciones(registroRuta('b7c2-1')), ['accept 4641', 'complete 4641', 'turnin 4641']);
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: 'hazme una ruta', ctx: { registro: [{ q: 4641, c: 1 }] } }));
  assert.deepEqual(acciones(registroRuta('b7c2-2')), ['accept 4641', 'turnin 4641'], 'lista para entregar: nada que completar');
});

test('tarea 20: sin ningún paso válido, el texto dice sin_pasos y no hay guiaIA', async () => {
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: { titulo: 'Nada', pasos: [{ misiones: [{ q: 999999, accion: 'aceptar' }] }] } });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'hazme una ruta' }));
  const reg = registroRuta('b7c2-1');
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.guiaIA, undefined);
  assert.equal(reg.abrirGuiaIA, undefined);
  assert.ok(reg.texto.includes(textoGuiaNueva('sin_pasos', {}, 'es')), reg.texto);
  // Y un «sigue» después va a la IA: no hay tramos pendientes.
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: 'sigue' }));
  assert.equal(x.llamadas.length, 2);
});

// 450 pasos en dos tramos (225 + 225): no caben en una guía (400 pasos, 40 KB). T3 (B1): la primera guía lleva el tramo
// uno y lo que cabe del dos (con el título de la ruta); la segunda, el resto del dos.
const RUTA_LARGA = {
  titulo: 'TITULO_SECRETO_RUTA',
  tramos: [
    { titulo: 'TITULO_SECRETO_UNO', pasos: Array.from({ length: 225 }, (_, i) => ({ texto: `Paso ${i + 1}` })) },
    { titulo: 'TITULO_SECRETO_DOS', pasos: Array.from({ length: 225 }, (_, i) => ({ texto: `Otro paso ${i + 1}` })) },
  ],
};

test('tarea 20: 450 pasos van en tramos; «Sigue» trae el siguiente sin preguntar a la IA y un tercero sin pendientes sí pregunta', async () => {
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'créame una ruta larga' }));
  const r1 = registroRuta('b7c2-1');
  assert.equal(r1.guiaIA.clave, 'IA\\Ruta de TITULO_SECRETO_RUTA (Horda, 1 de 2)');
  assert.equal(r1.abrirGuiaIA, true);
  const primera = lista(r1.guiaIA.pasos).length;
  assert.ok(primera > 225 && primera <= 400, String(primera));
  const resumen = textoGuiaNueva('resumen', { titulo: 'TITULO_SECRETO_RUTA', pasos: 450, misiones: 0, tramo: 1, tramos: 2, pasosTramo: primera }, 'es');
  assert.ok(r1.texto.includes(resumen), r1.texto);
  const antes = readFileSync(h.registroFalso, 'utf8');
  assert.equal(x.llamadas.length, 1);

  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: 'Sigue' }));
  const r2 = registroRuta('b7c2-2');
  assert.equal(r2.t, 'respuesta');
  assert.equal(r2.guiaIA.clave, 'IA\\Ruta de TITULO_SECRETO_DOS (Horda, 2 de 2)');
  assert.equal(lista(r2.guiaIA.pasos).length, 450 - primera);
  assert.equal(r2.abrirGuiaIA, true);
  assert.equal(r2.texto, textoGuiaNueva('tramo', { i: 2, n: 2, titulo: r2.guiaIA.titulo.es }, 'es'));
  assert.equal(x.llamadas.length, 1, 'no se ha vuelto a preguntar');
  assert.equal(readFileSync(h.registroFalso, 'utf8'), antes, 'el claude falso no se ha vuelto a lanzar');

  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-3', texto: 'sigue' }));
  const r3 = registroRuta('b7c2-3');
  assert.equal(x.llamadas.length, 2, 'sin pendientes, el «sigue» va a la IA');
  assert.equal(r3.texto, 'respuesta falsa');
  assert.equal(r3.guiaIA, undefined);
});

test('T3 (B2): los tramos pendientes son de cada personaje y caducan a los 7 días (antes, 6 h; y antes, 2 h)', async () => {
  let ahora = 1_000_000;
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  const x = nucleo({ reloj: { ahora: () => ahora } });
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'créame una ruta larga' }));
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  // Otro personaje: su «sigue» va a la IA.
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', pj: PJ_RUTA_DOS, texto: 'sigue' }));
  assert.equal(x.llamadas.length, 2);
  // A las 6 h aún valen (sin la IA)…
  ahora += 6 * 60 * 60 * 1000 + 1;
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-3', texto: 'sigue' }));
  assert.equal(x.llamadas.length, 2);
  assert.ok(registroRuta('b7c2-3').guiaIA);
  // …y pasados 7 días desde el último «sigue», ya no.
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-4', texto: 'créame una ruta larga' }));
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  assert.equal(TRAMOS_CADUCAN_MS, 7 * 24 * 60 * 60 * 1000);
  ahora += 7 * 24 * 60 * 60 * 1000 + 1;
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-5', texto: 'sigue' }));
  assert.equal(x.llamadas.length, 4);
  assert.equal(registroRuta('b7c2-5').guiaIA, undefined);
});

// T3 (B5): la IA sabe en qué parte de su guía va y si «sigue» trae otra (datos.ruta.tramo); con la guía acabada, `fin`.
test('T3 (B5): datos.ruta.tramo con la parte que lleva y las pendientes; tras la última, sin pendientes; fin pasa tal cual', async () => {
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'créame una ruta larga' }));
  const clave1 = registroRuta('b7c2-1').guiaIA.clave;
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  const conGuia = (clave, extra = {}) => ({ guia: { clave, titulo: 'Ruta', misiones: [], ...extra } });
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: '¿por dónde voy?', ctx: conGuia(clave1, { fin: true }) }));
  const datos1 = JSON.parse(loApuntado().stdin.match(/<datos_juego id="[0-9a-f]+">\n(.*)\n<\/datos_juego/)[1]);
  assert.deepEqual(datos1.ruta.tramo, { i: 1, n: 2, pendientes: 1 });
  assert.equal(datos1.ruta.fin, true);
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-3', texto: 'sigue' }));
  const clave2 = registroRuta('b7c2-3').guiaIA.clave;
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-4', texto: '¿por dónde voy?', ctx: conGuia(clave2) }));
  const datos2 = JSON.parse(loApuntado().stdin.match(/<datos_juego id="[0-9a-f]+">\n(.*)\n<\/datos_juego/)[1]);
  assert.deepEqual(datos2.ruta.tramo, { i: 2, n: 2, pendientes: 0 });
  assert.equal('fin' in datos2.ruta, false);
  // Una guía que no es de la IA no lleva tramo.
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-5', texto: '¿por dónde voy?', ctx: conGuia('Horde\\1-12') }));
  const datos3 = JSON.parse(loApuntado().stdin.match(/<datos_juego id="[0-9a-f]+">\n(.*)\n<\/datos_juego/)[1]);
  assert.equal('tramo' in datos3.ruta, false);
});

// Ronda 2 de abrir_guia (decisión 3 del coordinador): los tramos pendientes duran hasta otra guía o un tiempo (entonces 6 h;
// desde T3, 7 días); «nueva» (una charla nueva) ya no los borra.
test('tarea 20: «nueva» ya no borra los tramos pendientes (ronda 2)', async () => {
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'créame una ruta larga' }));
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: 'sigue', nueva: true }));
  assert.equal(x.llamadas.length, 1, 'con «nueva», el «sigue» sigue sin la IA');
  assert.ok(registroRuta('b7c2-2').guiaIA);
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-3', texto: 'sigue' }));
  assert.equal(x.llamadas.length, 2, 'sin pendientes, a la IA');
});

test('tarea 20: registro.log no lleva el título de la ruta (solo contadores)', async () => {
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'créame una ruta larga' }));
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: 'sigue' }));
  const log = readFileSync(join(h.datos, 'registro.log'), 'utf8');
  assert.match(log, /guiaNueva: tramos 2, pasos 450, quitados 0/);
  for (const prohibido of ['TITULO_SECRETO', 'Ruta de', PJ_RUTA, 'Ejemplo', 'créame']) assert.ok(!log.includes(prohibido), `el registro contiene «${prohibido}»`);
});

test('tarea 20: con un texto de la IA muy largo, el resumen y lo quitado llegan enteros y todo cabe', async () => {
  const guia = { titulo: 'Dalaran', pasos: [...DALARAN.pasos, { texto: 'Inventada', misiones: [{ q: 999999, accion: 'aceptar' }] }] };
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: guia }, 'palabra larga '.repeat(500));
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'créame la ruta de Dalaran' }));
  const { texto, guiaIA } = registroRuta('b7c2-1');
  const resumen = textoGuiaNueva('resumen', { titulo: 'Dalaran', pasos: lista(guiaIA.pasos).length, misiones: 2, tramo: 1, tramos: 1 }, 'es');
  const quitados = textoGuiaNueva('quitados', { misiones: 1 }, 'es');
  assert.ok(texto.endsWith(`${resumen}\n${quitados}`), texto.slice(-300));
  assert.ok(texto.length <= 4000, String(texto.length));
  assert.ok(Buffer.byteLength(texto, 'utf8') <= 12000);
  assert.ok(texto.includes('…'), 'se recorta la prosa de la IA');
});

test('tarea 20 (R2): rutaZona se abre sola solo si el jugador pide una guía o una ruta', async () => {
  process.env.FALSO_RESPUESTA = 'Te preparo la ruta.\n```snet\n{"rutaZona":{"zona":1411}}\n```';
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'hazme la ruta de esta zona' }));
  assert.equal(typeof registroRuta('b7c2-1').guiaIA, 'object');
  assert.equal(registroRuta('b7c2-1').abrirGuiaIA, true);
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: '¿qué misiones hay en Durotar?' }));
  assert.equal(typeof registroRuta('b7c2-2').guiaIA, 'object');
  assert.equal(registroRuta('b7c2-2').abrirGuiaIA, undefined);
});

// ---------- R15: los puntos de internet se comprueban con la página de verdad ----------

const URL_A = 'https://guias.ejemplo.com/ruta-a';
const URL_B = 'https://guias.ejemplo.com/ruta-b';
// Un stream de Claude con los WebFetch de `urls` (su «resumen» lleva unas coordenadas que no están en la página) y la
// respuesta con el bloque.
function streamConPaginas(urls, bloque) {
  const lineas = [{ type: 'system', subtype: 'init', mcp_servers: [{ name: 'snetforever', status: 'connected' }] }];
  urls.forEach((url, i) => {
    lineas.push({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `toolu_${i}`, name: 'WebFetch', input: { url, prompt: 'coordenadas' } }] } });
    lineas.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `toolu_${i}`, content: 'Resumen: el PNJ está en 11.1, 22.2' }] } });
  });
  lineas.push({ type: 'result', subtype: 'success', is_error: false, result: conBloque(bloque) });
  return JSON.stringify(lineas);
}
const pasoWeb = (url, x, y) => ({ texto: `Ve a ${x}, ${y}`, web: { zona: 'Durotar', x, y, url } });
const paginaHtml = (texto) => ({ url: URL_A, tipo: 'text/html; charset=utf-8', cuerpo: Buffer.from(`<html><body><p>${texto}</p></body></html>`, 'utf8') });
const gotosDe = (guia) => elementosDe(guia).filter((e) => e.t === 'goto').map((e) => [e.x, e.y]);

function preparaStream(urls, pasos) {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  process.env.FALSO_MODO = 'stream';
  process.env.FALSO_STREAM = streamConPaginas(urls, { guiaNueva: { titulo: 'Web', pasos } });
}

test('tarea 20 (R15): el punto de internet se comprueba con la página que baja la app, no con el resumen de Claude', async () => {
  preparaStream([URL_A], [pasoWeb(URL_A, 45.2, 67.8), pasoWeb(URL_A, 11.1, 22.2)]);
  const pedidas = [];
  const obtener = async (url, opciones) => { pedidas.push({ url, opciones }); return paginaHtml('El PNJ está en 45.2, 67.8.'); };
  const x = nucleo({ herramientas: true, carpetaBase, obtener });
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'créame una ruta' }));
  const reg = registroRuta('b7c2-1');
  assert.deepEqual(pedidas.map((p) => p.url), [URL_A]);
  assert.ok(pedidas[0].opciones.tiempoMax <= 15000);
  assert.deepEqual(gotosDe(reg.guiaIA), [[45.2, 67.8]], 'el del resumen (11.1, 22.2) no vale');
  assert.ok(reg.texto.includes(textoGuiaNueva('quitados', { puntos: 1 }, 'es')), reg.texto);
  const log = readFileSync(join(h.datos, 'registro.log'), 'utf8');
  assert.ok(!log.includes('ejemplo.com'), 'nunca la dirección en el registro');
});

test('tarea 20 (R15): una página que Claude no leyó no se baja y su punto se quita; si la bajada falla, también', async () => {
  preparaStream([URL_A], [pasoWeb(URL_B, 45.2, 67.8), pasoWeb(URL_A, 45.2, 67.8)]);
  const pedidas = [];
  const obtener = async (url) => { pedidas.push(url); throw Object.assign(new Error('sin red'), { code: 'conexion' }); };
  const x = nucleo({ herramientas: true, carpetaBase, obtener });
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'créame una ruta' }));
  const reg = registroRuta('b7c2-1');
  assert.deepEqual(pedidas, [URL_A], 'la de B no se pide: Claude no la leyó');
  assert.equal(reg.t, 'respuesta');
  // Los dos pasos se quedan con su texto, sin punto.
  assert.deepEqual(gotosDe(reg.guiaIA), []);
  assert.ok(reg.texto.includes(textoGuiaNueva('quitados', { puntos: 2 }, 'es')), reg.texto);
});

test('tarea 20 (R15): con una copia guardada de esa página en la biblioteca no se baja nada', async () => {
  const carpeta = join(h.datos, CARPETA_GUIAS, CARPETA_ENLACES);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'guias.ejemplo.com-0a1b2c3d.txt'), `# Dirección: ${URL_A}\n# Bajada: 2026-11-01T00:00:00.000Z\n\nEl PNJ está en 33.3, 44.4.\n`);
  preparaStream([`${URL_A}#seccion`], [pasoWeb(URL_A, 33.3, 44.4)]);
  const pedidas = [];
  const obtener = async (url) => { pedidas.push(url); return paginaHtml('nada'); };
  const x = nucleo({ herramientas: true, carpetaBase, obtener });
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'créame una ruta' }));
  const reg = registroRuta('b7c2-1');
  assert.deepEqual(pedidas, []);
  assert.deepEqual(gotosDe(reg.guiaIA), [[33.3, 44.4]]);
});

test('tarea 20 (R15): como mucho 3 páginas por respuesta (en paralelo)', async () => {
  const urls = [1, 2, 3, 4].map((i) => `https://guias.ejemplo.com/p${i}`);
  preparaStream(urls, urls.map((u) => pasoWeb(u, 45.2, 67.8)));
  const pedidas = [];
  let enCurso = 0;
  let maximo = 0;
  const obtener = async (url) => {
    pedidas.push(url);
    enCurso++;
    maximo = Math.max(maximo, enCurso);
    await new Promise((r) => setTimeout(r, 20));
    enCurso--;
    return paginaHtml('En 45.2, 67.8.');
  };
  const x = nucleo({ herramientas: true, carpetaBase, obtener });
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'créame una ruta' }));
  const reg = registroRuta('b7c2-1');
  assert.deepEqual(pedidas, urls.slice(0, 3));
  assert.equal(maximo, 3, 'a la vez');
  assert.equal(gotosDe(reg.guiaIA).length, 3);
  assert.ok(reg.texto.includes(textoGuiaNueva('quitados', { puntos: 1 }, 'es')), reg.texto);
});

// ---------- revisión final: los pinesWeb se comprueban como los web de guiaNueva ----------

const NOTA_QUITADO = '(Se ha quitado lo que la IA propuso y no está en la base.)';
const pinWeb = (url, x, y, extra = {}) => ({ zona: 'Durotar', x, y, ...(url ? { url } : {}), ...extra });
function preparaStreamBloque(urls, bloque) {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  process.env.FALSO_MODO = 'stream';
  process.env.FALSO_STREAM = streamConPaginas(urls, bloque);
}

test('revisión final: un pinesWeb vale solo con la url de una página leída y su par escrito en la página de verdad', async () => {
  preparaStreamBloque([URL_A], { pinesWeb: [
    pinWeb(URL_A, 45.2, 67.8, { texto: 'Cofre' }),
    pinWeb(URL_A, 11.1, 22.2), // el par del resumen de Claude, no el de la página
    pinWeb(null, 45.2, 67.8), // sin url
    pinWeb(URL_B, 45.2, 67.8), // página que Claude no leyó
  ] });
  const pedidas = [];
  const obtener = async (url) => { pedidas.push(url); return paginaHtml('El cofre está en 45.2, 67.8.'); };
  const x = nucleo({ herramientas: true, carpetaBase, obtener });
  await x.nucleo.recibirTrama(tramaRuta({ texto: '¿dónde está el cofre?' }));
  const reg = registroRuta('b7c2-1');
  assert.deepEqual(pedidas, [URL_A]);
  assert.equal(reg.propuesta.tipo, 'pines');
  assert.deepEqual(lista(reg.propuesta.puntos).map((p) => [p.mapa, p.x, p.y, p.web]), [[1411, 45.2, 67.8, true]]);
  assert.ok(reg.texto.includes(NOTA_QUITADO), reg.texto);
  const log = readFileSync(join(h.datos, 'registro.log'), 'utf8');
  assert.ok(!log.includes('ejemplo.com'), 'nunca la dirección en el registro');
});

test('revisión final: los pinesWeb comparten con los web de guiaNueva el tope de 3 páginas', async () => {
  const urls = [1, 2, 3, 4].map((i) => `https://guias.ejemplo.com/p${i}`);
  preparaStreamBloque(urls, {
    guiaNueva: { titulo: 'Web', pasos: [pasoWeb(urls[0], 45.2, 67.8), pasoWeb(urls[1], 45.2, 67.8)] },
    pinesWeb: [pinWeb(urls[2], 45.2, 67.8), pinWeb(urls[3], 45.2, 67.8)],
  });
  const pedidas = [];
  const obtener = async (url) => { pedidas.push(url); return paginaHtml('En 45.2, 67.8.'); };
  const x = nucleo({ herramientas: true, carpetaBase, obtener });
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'créame una ruta' }));
  const reg = registroRuta('b7c2-1');
  assert.deepEqual(pedidas, urls.slice(0, 3));
  assert.equal(gotosDe(reg.guiaIA).length, 2);
  assert.equal(lista(reg.propuesta.puntos).length, 1, 'el pin de la cuarta página se quita');
  assert.ok(reg.texto.includes(NOTA_QUITADO), reg.texto);
});

test('revisión final: con Codex (sin páginas leídas) todos los pinesWeb se quitan y no se baja nada', async () => {
  const pedidas = [];
  const x = nucleo({
    config: { motor: 'codex' },
    comprobar: { claude: async () => OK, codex: async () => OK },
    codex: async () => ({ ok: true, texto: conBloque({ pinesWeb: [pinWeb(URL_A, 45.2, 67.8)] }, 'Según una página.'), ms: 1 }),
    obtener: async (url) => { pedidas.push(url); return paginaHtml('En 45.2, 67.8.'); },
  });
  await x.nucleo.recibirTrama(tramaRuta({ texto: '¿dónde está el cofre?' }));
  const reg = registroRuta('b7c2-1');
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.propuesta, undefined);
  assert.deepEqual(pedidas, []);
  assert.ok(reg.texto.includes(NOTA_QUITADO), reg.texto);
});

// ---------- revisión final: «sigue» solo justo después de la guía o de uno de sus tramos ----------

test('revisión final: una rutaZona después de una guía en tramos borra los pendientes: el «sigue» va a la IA', async () => {
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'créame una ruta larga' }));
  process.env.FALSO_RESPUESTA = 'Te preparo la ruta.\n```snet\n{"rutaZona":{"zona":1411}}\n```';
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: 'hazme la ruta de esta zona' }));
  assert.match(registroRuta('b7c2-2').guiaIA.clave, /^IA\\Ruta de Durotar/);
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-3', texto: 'sigue' }));
  assert.equal(x.llamadas.length, 3, 'el «sigue» va a la IA');
  assert.equal(registroRuta('b7c2-3').texto, 'respuesta falsa');
  assert.equal(registroRuta('b7c2-3').guiaIA, undefined);
});

test('ronda 2 (decisión 3): otra pregunta entre la guía y el «sigue» ya no borra los pendientes; otra guía, sí', async () => {
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  const x = nucleo();
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', texto: 'créame una ruta larga' }));
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', texto: '¿qué vendo?' }));
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-3', texto: 'sigue' }));
  assert.equal(x.llamadas.length, 2, 'el «sigue» no va a la IA');
  assert.equal(registroRuta('b7c2-3').guiaIA.clave, 'IA\\Ruta de TITULO_SECRETO_DOS (Horda, 2 de 2)');
  // una guía nueva de un solo tramo sustituye a la de antes
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-31', texto: 'créame una ruta larga' }));
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: DALARAN });
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-32', texto: 'créame la de Dalaran' }));
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-33', texto: 'sigue' }));
  assert.equal(x.llamadas.length, 5, 'tras otra guía, el «sigue» va a la IA');
  assert.equal(registroRuta('b7c2-33').guiaIA, undefined);
  // Otro personaje en medio no cuenta: sus pendientes son suyos.
  process.env.FALSO_RESPUESTA = conBloque({ guiaNueva: RUTA_LARGA });
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-4', texto: 'créame una ruta larga' }));
  process.env.FALSO_RESPUESTA = 'respuesta falsa';
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-5', pj: PJ_RUTA_DOS, texto: 'hola' }));
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-6', texto: 'sigue' }));
  assert.equal(x.llamadas.length, 7, 'el «sigue» del primero se contesta sin la IA');
  assert.equal(registroRuta('b7c2-6').guiaIA.clave, 'IA\\Ruta de TITULO_SECRETO_DOS (Horda, 2 de 2)');
});

// ---------- revisión final: la rutaZona pedida no quita por nivel ni por mazmorra ----------

test('revisión final: con la ruta pedida, la rutaZona de un personaje de nivel 1 lleva las de nivel alto y de mazmorra', async () => {
  process.env.FALSO_RESPUESTA = 'Te preparo la ruta.\n```snet\n{"rutaZona":{"zona":1411}}\n```';
  const x = nucleo();
  const qsDe = (reg) => new Set(elementosDe(reg.guiaIA).map((e) => e.q).filter(Number.isInteger));
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-1', nivel: 1, texto: 'hazme la ruta de esta zona', ctx: { registro: [] } }));
  const pedida = qsDe(registroRuta('b7c2-1'));
  assert.ok(pedida.has(791), 'la de mazmorra (nivel 12) entra');
  assert.ok(pedida.has(792), 'la que pide nivel 4 entra');
  // Sin pedirla, como siempre.
  await x.nucleo.recibirTrama(tramaRuta({ id: 'b7c2-2', nivel: 1, texto: '¿qué misiones hay en Durotar?', ctx: { registro: [] } }));
  const normal = qsDe(registroRuta('b7c2-2'));
  assert.ok(!normal.has(791) && !normal.has(792), JSON.stringify([...normal]));
});

// ---------- revisión final: los puntos de internet van marcados ----------

test('revisión final: textoGuiaNueva cuenta en el resumen los puntos de internet (y nada si no hay)', () => {
  const sin = textoGuiaNueva('resumen', { titulo: 'X', pasos: 3, misiones: 1, tramo: 1, tramos: 1 }, 'es');
  assert.ok(!sin.includes('internet'), sin);
  assert.equal(textoGuiaNueva('resumen', { titulo: 'X', pasos: 3, misiones: 1, tramo: 1, tramos: 1, web: 0 }, 'es'), sin);
  assert.ok(textoGuiaNueva('resumen', { titulo: 'X', pasos: 3, misiones: 1, tramo: 1, tramos: 1, web: 1 }, 'es').includes('1 punto es de internet'));
  assert.ok(textoGuiaNueva('resumen', { titulo: 'X', pasos: 3, misiones: 1, tramo: 1, tramos: 2, web: 2 }, 'es').includes('2 puntos son de internet'));
  assert.ok(textoGuiaNueva('resumen', { titulo: 'X', pasos: 3, misiones: 1, tramo: 1, tramos: 1, web: 2 }, 'en').includes('2 points are from the web'));
  assert.equal(TEXTOS_GUIA_NUEVA.es.deInternet('guias.ejemplo.com'), '(de internet: guias.ejemplo.com)');
  assert.equal(TEXTOS_GUIA_NUEVA.en.deInternet('guias.ejemplo.com'), '(from the web: guias.ejemplo.com)');
});

test('revisión final: el paso con punto de internet lleva «(de internet: <sitio>)» y el resumen dice cuántos son', async () => {
  preparaStream([`${URL_A}?seccion=2`], [pasoWeb(`${URL_A}?seccion=2`, 45.2, 67.8), { texto: 'Habla con Gornek', punto: 'B:q4641:r' }]);
  const obtener = async () => paginaHtml('El PNJ está en 45.2, 67.8.');
  const x = nucleo({ herramientas: true, carpetaBase, obtener });
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'créame una ruta' }));
  const reg = registroRuta('b7c2-1');
  const notas = elementosDe(reg.guiaIA).filter((e) => e.t === 'nota').map((e) => e.texto.es);
  assert.equal(notas.filter((t) => t.endsWith('(de internet: guias.ejemplo.com)')).length, 1, JSON.stringify(notas));
  assert.ok(notas.every((t) => !t.includes('ruta-a') && !t.includes('seccion')), 'solo el host');
  const resumen = textoGuiaNueva('resumen', { titulo: 'Web', pasos: lista(reg.guiaIA.pasos).length, misiones: 0, tramo: 1, tramos: 1, web: 1 }, 'es');
  assert.ok(reg.texto.includes(resumen), reg.texto);
});

// ---------- revisión final: ida y vuelta de las marcas, del servidor de herramientas a la app ----------

// La base del fixture con una misión inventada de dos objetivos en sitios distintos (para B:q9301:o2).
const carpetaBaseIda = join(RAIZ, 'base-ida');
mkdirSync(carpetaBaseIda);
writeFileSync(join(carpetaBaseIda, 'misiones-app.lua'), readFileSync(join(AQUI, 'fixtures', 'misiones-app.lua'), 'utf8')
  + '\nQ[9301]={name="Two Camps",startedBy={{10176}},finishedBy={{3143}},requiredLevel=1,questLevel=2,requiredRaces=0,'
  + 'requiredClasses=0,objectivesText={"Kill boars and scorpids."},objectives={[1]={{3},{9401}}},sourceItemId=0,zoneOrSort=363,'
  + 'nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0,uiMap=1411}\n'
  + 'N[9401]={name="Camp Scorpid",spawns={[1411]={{62.5,24.5}}},minLevel=2,maxLevel=3}\n'
  + 'E[9301]={name="Dos campamentos",objectivesText={"Mata jabalíes y escórpidos."}}\n');
writeFileSync(join(carpetaBaseIda, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', ''].join('\n'));
const BASE_IDA = cargarBase(carpetaBaseIda);

test('revisión final: las marcas que dan leer_guia y mision llegan a guiaIA y a la propuesta con las coordenadas de la guía y de la base', async () => {
  // La biblioteca de fixtures con la guía partida (cabecera guias_3 y partes guias_2 y guias_10), indexada en los datos
  // de la prueba, y el turno de las herramientas escrito como lo escribe la app.
  const guias = join(h.datos, CARPETA_GUIAS);
  mkdirSync(guias, { recursive: true });
  nodeFs.cpSync(FIXTURES_BIBLIOTECA, guias, { recursive: true });
  writeFileSync(join(guias, 'addon', 'guias_10.lua'), 'local T = SNF_RUTAS.guias["Pruebas (H)\\\\10-12 Ruta partida"].pasos\n'
    + 'T[1]={id="c3",n=3,elementos={{t="goto",mapa=1411,x=33.3,y=44.4},{t="nota",texto={es="Fin de la ruta partida",en="End"}}}}\n');
  await crearIndice({ datos: h.datos, fs: nodeFs, base: async () => BASE_IDA }).actualizar();
  const cabecera = JSON.parse(readFileSync(join(h.datos, RUTA_INDICE), 'utf8')).guias.find((g) => g.archivo === 'addon/guias_3.lua' && g.k === 0).id;
  await escribirTurno(h.datos, turnoDe(mensaje({ pj: PJ_RUTA }), { carpetaBase: carpetaBaseIda }), { fs: nodeFs });

  // El catálogo de verdad (el del servidor) da las marcas.
  const catalogo = Object.fromEntries(crearCatalogo(crearFuentes({ datos: h.datos, fs: nodeFs, cargar: () => BASE_IDA })).map((x) => [x.nombre, x.ejecutar]));
  const leida = await catalogo.leer_guia({ guia: cabecera });
  const g1 = leida.pasos.find((p) => p.n === 1).punto.marca;
  const g3 = leida.pasos.find((p) => p.n === 3).punto.marca;
  assert.deepEqual([g1, g3], [`G:${cabecera}:1`, `G:${cabecera}:3`]);
  const ficha = await catalogo.mision({ mision: 9301 });
  const marca = (papel, i = 0) => ficha.puntos.filter((p) => p.papel === papel)[i].marca;
  const [br, bo2] = [marca('recoger'), marca('objetivo', 1)];
  assert.deepEqual([br, bo2], ['B:q9301:r', 'B:q9301:o2']);

  // La IA las manda tal cual en guiaNueva y en pines; la app las convierte en coordenadas.
  process.env.FALSO_RESPUESTA = conBloque({
    guiaNueva: { titulo: 'Ida y vuelta', pasos: [
      { texto: 'El primer paso de la guía', punto: g1 },
      { texto: 'El de la otra parte', punto: g3 },
      { texto: 'Recoge Dos campamentos', misiones: [{ q: 9301, accion: 'aceptar' }], punto: br },
      { texto: 'El segundo campamento', misiones: [{ q: 9301, accion: 'completar', objetivo: 2 }], punto: bo2 },
    ] },
    pines: [bo2, g3],
  }, 'Haz «Dos campamentos».');
  const x = nucleo({ base: Promise.resolve(BASE_IDA) });
  await x.nucleo.recibirTrama(tramaRuta({ texto: 'créame la ruta de mi guía' }));
  const reg = registroRuta('b7c2-1');
  assert.equal(reg.t, 'respuesta', JSON.stringify(reg));
  const gotos = elementosDe(reg.guiaIA).filter((e) => e.t === 'goto').map((e) => [e.mapa, e.x, e.y]);
  // Las de la guía, del archivo (guias_3.lua: 1413, 20, 30; guias_10.lua: 1411, 33.3, 44.4); las de la base, de sus
  // PNJ (Gornek en 42.1, 68.3; el segundo objetivo en 62.5, 24.5).
  assert.deepEqual(gotos, [[1413, 20, 30], [1411, 33.3, 44.4], [1411, 42.1, 68.3], [1411, 62.5, 24.5]]);
  assert.deepEqual(lista(reg.propuesta.puntos).map((p) => [p.mapa, p.x, p.y]), [[1411, 62.5, 24.5], [1411, 33.3, 44.4]]);
  assert.ok(!reg.texto.includes('Se ha quitado') && !reg.texto.includes('Se han quitado'), reg.texto);
});
