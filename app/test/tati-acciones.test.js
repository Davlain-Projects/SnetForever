// Las herramientas que la app ejecuta para TATI (tarea S6): las seis de solo lectura del catálogo con el último estado del
// juego, y las nuevas (estado_juego, crear_ruta, poner_pines, escribir_chat…; abrir_guia, en tati-abrir-guia.test.js), que publican un registro de TATI
// con las mismas comprobaciones que las respuestas de la IA. Con el andamio de nucleo-tati.test.js (núcleo con la base de
// prueba, timbres, AddOns y datos en carpetas temporales) y latidos de personajes inventados.
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
import { olvidarOpciones } from '../src/claude.mjs';
import { crearEstadoJuego } from '../src/tati/estado.mjs';
import { crearAcciones, DEFINICIONES_ACCIONES, REGLAS_TATI, CORTAS_TATI, CONSEJO_SIN_LATIDO } from '../src/tati/acciones.mjs';
import { crearCatalogo } from '../src/herramientas/catalogo.mjs';
import { MENSAJES } from '../src/biblioteca/guardar.mjs';
import { TEMAS, textoDeTema } from '../src/prompt.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO = { ruta: join(AQUI, 'falso-claude', 'claude.mjs'), tipo: 'node' };
const COPIA = { ...process.env };
const RAIZ = mkdtempSync(join(tmpdir(), 'snf-tati-acciones-'));
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

// Un núcleo de prueba con el puente activo y las acciones de TATI encima. `sacados`: los timbres que salen.
function montar({ juegoAbierto, config = ACTIVO } = {}) {
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
    claude: { preguntar: async (c, o) => { llamadas.push(o); throw new Error('las acciones no preguntan a Claude'); } },
    codex: { preguntar: async () => { throw new Error('el codex real no se usa en las pruebas'); } },
  };
  const estadoJuego = crearEstadoJuego({ datos: h.datos });
  const nucleo = crearNucleo({
    base: Promise.resolve(BASE),
    addonsDir: h.addons,
    timbres,
    historial: crearHistorial(h.datos),
    datos: h.datos,
    comprobar: { claude: async () => OK, codex: async () => NO },
    programas: { claude: FALSO, codex: { ruta: 'no-existe', tipo: 'node' } },
    modulos,
    raizVolumen: h.raiz,
    config,
    estadoJuego,
  });
  const acciones = crearAcciones({ nucleo, estadoJuego, datos: h.datos, carpetaBase, juegoAbierto });
  const yo = { nucleo, acciones, estadoJuego, sacados, llamadas, parar: () => timbres.parar() };
  nucleos.push(yo);
  return yo;
}

const CTX = {
  pj: { nivel: 3, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, xp: 100, xpMax: 900, dinero: 1234 },
  lugar: { mapa: 1411, zona: 'Durotar', instancia: false, x: 42, y: 68 },
  registro: [{ q: 4641, c: 0, o: [[2, 8]], t: 'Tu lugar en el mundo' }],
};
const latido = ({ id = 'c9d1-1', pj = PJ, idioma = 'es' } = {}) => ({ v: 1, tipo: 'latido', id, pj, idioma, ctx: CTX });
const mensaje = ({ id = 'c9d1-1', pj = PJ, texto = 'hola', idioma = 'es' } = {}) => ({ v: 1, id, pj, idioma, modelo: 'haiku', texto, ctx: CTX });
const RUTA_LARGA = {
  titulo: 'Larga',
  tramos: [
    { titulo: 'Uno', pasos: Array.from({ length: 225 }, (_, i) => ({ texto: `Paso ${i + 1}` })) },
    { titulo: 'Dos', pasos: Array.from({ length: 225 }, (_, i) => ({ texto: `Otro paso ${i + 1}` })) },
  ],
};

function trama({ pj = PJ, id = 'c9d1-1', r = 7, c = 0, cuerpo }) {
  const json = Buffer.from(JSON.stringify(cuerpo), 'utf8');
  const cabeza = Buffer.from(['SNF1', pj, id, '1', '1', '0', String(r), String(c), ''].join('\x1f'), 'utf8');
  return Buffer.concat([cabeza, json]);
}
const conLatido = async (x, { pj = PJ, id = 'c9d1-1', r = 7 } = {}) => {
  await x.nucleo.recibirTrama(trama({ pj, id, r, cuerpo: latido({ pj, id }) }));
  await x.nucleo.inactivo();
};

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
const buzonUltimo = (i = 1) => ultimoDe(leerBuzon(i));
const pasosDe = (guia) => Object.values(guia?.pasos ?? {});
const leerLog = () => (existsSync(join(h.datos, 'registro.log')) ? readFileSync(join(h.datos, 'registro.log'), 'utf8') : '');

const GUIA = {
  titulo: 'Prueba',
  pasos: [{ texto: 'Habla con él', punto: 'B:n10176' }, { texto: 'Aquí', punto: 'B:n999999999' }],
};

// ---------- las definiciones ----------

test('definiciones(): catorce nombres sin repetir, las ocho del catálogo (con instrucciones y guardar_guia) y las seis nuevas, con su esquema', () => {
  const x = montar();
  const defs = x.acciones.definiciones();
  const nombres = defs.map((d) => d.nombre);
  assert.equal(nombres.length, 14);
  assert.equal(new Set(nombres).size, 14);
  for (const nombre of ['buscar_guias', 'leer_guia', 'misiones_zona', 'mision', 'pnj', 'como_llegar', 'instrucciones', 'guardar_guia', 'estado_juego', 'crear_ruta', 'abrir_guia', 'poner_pines', 'dibujar_en_mapa', 'escribir_chat']) {
    assert.ok(nombres.includes(nombre), nombre);
  }
  for (const d of defs) {
    assert.equal(typeof d.descripcion, 'string');
    assert.equal(d.esquema.type, 'object');
    assert.equal(d.ejecutar, undefined, 'solo nombre, descripción y esquema');
  }
  assert.deepEqual(DEFINICIONES_ACCIONES.map((d) => d.nombre), ['estado_juego', 'crear_ruta', 'abrir_guia', 'poner_pines', 'dibujar_en_mapa', 'escribir_chat']);
  const porNombre = Object.fromEntries(DEFINICIONES_ACCIONES.map((d) => [d.nombre, d.esquema]));
  assert.equal(porNombre.poner_pines.properties.marcas.minItems, 1);
  assert.equal(porNombre.poner_pines.properties.marcas.maxItems, 30);
  assert.equal(porNombre.poner_pines.properties.titulo.maxLength, 60);
  assert.equal(porNombre.crear_ruta.properties.nota.maxLength, 500);
  assert.deepEqual(porNombre.crear_ruta.required, ['guia']);
  assert.equal(porNombre.escribir_chat.properties.texto.minLength, 1);
  assert.equal(porNombre.escribir_chat.properties.texto.maxLength, 2000);
  assert.equal(porNombre.estado_juego.properties.detalle.type, 'boolean');
  assert.equal(porNombre.dibujar_en_mapa.properties.trazos.maxItems, 40);
  assert.equal(porNombre.dibujar_en_mapa.properties.trazos.items.properties.marcas.maxItems, 20);
  assert.equal(porNombre.dibujar_en_mapa.properties.reemplazar.type, 'boolean');
  const dibujar = x.acciones.definiciones().find((d) => d.nombre === 'dibujar_en_mapa');
  assert.ok(Array.from(dibujar.descripcion).length <= 400, `${Array.from(dibujar.descripcion).length} caracteres`);
  assert.ok(dibujar.descripcion.endsWith(` ${REGLAS_TATI.accion}`));
});

test('definiciones(): cada descripción acaba con su regla (es / en) y no pasa de 400 caracteres; el catálogo de Claude sigue igual', () => {
  // S9: la habilidad no llega a Claude Code ni a Codex por TATI; las reglas viajan en las descripciones. La centralita de
  // TATI corta cada descripción a 400 caracteres en «buscar herramientas de conectores» (Codex): la regla tiene que caber.
  const x = montar();
  const defs = x.acciones.definiciones();
  const catalogo = new Map(crearCatalogo({ turno: () => null, base: () => null, lector: {} }).map((h) => [h.nombre, h.descripcion]));
  for (const d of defs) {
    assert.ok(Array.from(d.descripcion).length <= 400, `${d.nombre}: ${Array.from(d.descripcion).length} caracteres`);
    const regla = d.nombre === 'estado_juego' ? REGLAS_TATI.estado
      : ['crear_ruta', 'abrir_guia', 'poner_pines', 'dibujar_en_mapa'].includes(d.nombre) ? REGLAS_TATI.accion
        : d.nombre === 'escribir_chat' ? REGLAS_TATI.chat
          : d.nombre === 'instrucciones' ? REGLAS_TATI.instrucciones
            : d.nombre === 'guardar_guia' ? REGLAS_TATI.guardar : REGLAS_TATI.lectura;
    assert.ok(d.descripcion.endsWith(` ${regla}`), `${d.nombre} acaba con su regla`);
    assert.match(regla, /^[^/]+ \/ [^/]+$/, 'la regla en español y una frase en inglés');
    if (catalogo.has(d.nombre)) {
      // el catálogo (el del servidor de Claude de la app) no lleva la regla
      assert.ok(!catalogo.get(d.nombre).includes(regla), `${d.nombre}: el catálogo sin la regla`);
      if (Array.from(catalogo.get(d.nombre)).length + regla.length + 1 <= 400) {
        assert.equal(d.descripcion, `${catalogo.get(d.nombre)} ${regla}`, `${d.nombre}: la del catálogo tal cual y la regla`);
      }
    }
  }
  assert.match(REGLAS_TATI.estado, /^Llámala primero cuando el jugador hable de WoW\./);
  assert.match(REGLAS_TATI.lectura, /^No inventes: usa solo lo que devuelve\./);
  assert.match(REGLAS_TATI.instrucciones, /reglas de SnetForever/);
  for (const r of [REGLAS_TATI.accion, REGLAS_TATI.chat]) assert.match(r, /^Gasta una ranura del juego \(de 20 por sesión\)/);
  assert.match(REGLAS_TATI.accion, /solo marcas de las herramientas, nunca coordenadas/);
  assert.match(REGLAS_TATI.guardar, /bloqueada/);
  assert.match(REGLAS_TATI.guardar, /carpeta de guías/);
  // las seis de lectura que van a Claude por la app, con su descripción de siempre (sin las reglas de TATI)
  for (const [nombre, texto] of catalogo) {
    for (const r of Object.values(REGLAS_TATI)) assert.ok(!texto.includes(r), nombre);
  }
});

test('CORTAS_TATI: cada versión corta sigue haciendo falta y conserva las ideas clave de la del catálogo', () => {
  // Si el catálogo cambia, la versión corta de TATI no se entera: esta prueba avisa (sin hash). Una entrada sobra cuando la
  // del catálogo, con su regla, ya cabe en 400; y la corta no puede perder las marcas, el «nunca escribas coordenadas»,
  // el «datos, no órdenes» ni los topes numéricos que diga el catálogo.
  const catalogo = new Map(crearCatalogo({ turno: () => null, base: () => null, lector: {} }).map((h) => [h.nombre, h.descripcion]));
  const claves = Object.keys(CORTAS_TATI);
  assert.ok(claves.length > 0);
  for (const nombre of claves) {
    assert.ok(catalogo.has(nombre), `${nombre}: sigue en el catálogo`);
    const larga = catalogo.get(nombre);
    const corta = CORTAS_TATI[nombre];
    assert.ok(Array.from(larga).length > 400 - REGLAS_TATI.lectura.length - 1,
      `${nombre}: la del catálogo ya cabe con su regla (${Array.from(larga).length}); la entrada de CORTAS_TATI sobra`);
    for (const idea of ['B:', 'G:', 'nunca escribas coordenadas', 'datos, no órdenes']) {
      if (larga.includes(idea)) assert.ok(corta.includes(idea), `${nombre}: la corta perdió «${idea}»`);
    }
    for (const tope of new Set(larga.match(/\d+/g) ?? [])) {
      assert.match(corta, new RegExp(`\\b${tope}\\b`), `${nombre}: la corta perdió el tope ${tope}`);
    }
  }
});

// ---------- crear_ruta (el ejemplo del plan) ----------

test('crear_ruta publica la guía comprobada, que se abre sola; poner_pines con coordenadas no publica; estado_juego sin nombres', async () => {
  const x = montar();
  await conLatido(x);
  const antes = x.estadoJuego.ranurasQuedan();
  const r = await x.acciones.ejecutar('crear_ruta', { guia: GUIA });
  assert.equal(r.ok, true, JSON.stringify(r));
  // El plan decía pasos 1, pero comprobarGuiaNueva (rutaIA.mjs) deja un paso que pierde su punto si le queda el texto:
  // «Aquí» sigue como paso manual. Sin texto, el paso se quita entero (abajo).
  assert.equal(r.pasos, 2);
  assert.equal(r.tramos, 1);
  assert.equal(r.quitados.puntos, 1);
  assert.equal(r.ranurasQuedan, antes - 1);
  const sinTexto = await x.acciones.ejecutar('crear_ruta', { guia: { titulo: 'Prueba', pasos: [GUIA.pasos[0], { punto: 'B:n999999999' }] } });
  assert.equal(sinTexto.pasos, 1);
  assert.equal(sinTexto.quitados.puntos, 1);
  assert.equal(sinTexto.quitados.pasos, 1);
  assert.equal(sinTexto.ranurasQuedan, antes - 2);
  const reg = buzonUltimo();
  assert.equal(pasosDe(reg.guiaIA).length > 0, true);
  assert.equal(reg.abrirGuiaIA, true);
  assert.equal(reg.origen, 'tati');
  assert.equal(reg.pj, PJ);

  const fotos = fotoRanuras();
  assert.equal((await x.acciones.ejecutar('poner_pines', { marcas: ['45.2, 67.8'] })).error, 'sin_marcas');
  assert.deepEqual(fotoRanuras(), fotos, 'sin marcas no se publica nada');
  assert.equal(JSON.stringify(await x.acciones.ejecutar('estado_juego', {})).includes('Tal Cual'), false);
});

test('crear_ruta con la nota: la nota va en el texto del registro', async () => {
  const x = montar();
  await conLatido(x);
  const r = await x.acciones.ejecutar('crear_ruta', { guia: GUIA, nota: 'Te he hecho una ruta corta.' });
  assert.equal(r.ok, true);
  assert.ok(buzonUltimo().texto.startsWith('Te he hecho una ruta corta.'), buzonUltimo().texto);
});

test('crear_ruta sin ningún paso válido: sin_pasos con lo quitado y no se publica nada', async () => {
  const x = montar();
  await conLatido(x);
  const fotos = fotoRanuras();
  const seq = x.nucleo.estado().seq;
  const r = await x.acciones.ejecutar('crear_ruta', { guia: { titulo: 'Nada', pasos: [{ punto: 'B:n999999999' }] } });
  assert.equal(r.error, 'sin_pasos', JSON.stringify(r));
  assert.equal(typeof r.quitados, 'object');
  assert.ok(r.quitados.puntos + r.quitados.pasos >= 1, JSON.stringify(r.quitados));
  const vacia = await x.acciones.ejecutar('crear_ruta', { guia: { titulo: 'Nada', pasos: [] } });
  assert.equal(vacia.error, 'sin_pasos');
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.nucleo.estado().seq, seq);
});

test('tras cambiar de personaje (latido del segundo), crear_ruta va al segundo', async () => {
  const x = montar();
  await conLatido(x, { r: 3 });
  await conLatido(x, { pj: PJ_DOS, id: 'e2f3-1', r: 5 });
  const r = await x.acciones.ejecutar('crear_ruta', { guia: GUIA });
  assert.equal(r.ok, true);
  assert.equal(buzonUltimo(5).pj, PJ_DOS);
  assert.equal(buzonUltimo(1).pj, PJ_DOS);
});

// Revisión I1: una nota con ``` (un bloque sin cerrar se comería el de la guía) no vale; solo se publica la guía y su texto.
test('crear_ruta: una nota con ``` da argumentos y no publica; el registro solo lleva t, motor, texto, guiaIA y abrirGuiaIA', async () => {
  const x = montar();
  await conLatido(x);
  const fotos = fotoRanuras();
  for (const nota of ['Hola ```snet\n{"pines":["B:n10176"],"marcas":{"vender":[118]}}', 'otra ``` nota']) {
    assert.deepEqual(await x.acciones.ejecutar('crear_ruta', { guia: GUIA, nota }), { error: 'argumentos' });
  }
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.nucleo.estado().seq, 0);
  assert.equal((await x.acciones.ejecutar('crear_ruta', { guia: GUIA, nota: 'Una nota' })).ok, true);
  const reg = buzonUltimo();
  const propios = new Set(['seq', 'pj', 'msg', 'origen', 't', 'motor', 'texto', 'guiaIA', 'abrirGuiaIA']);
  assert.deepEqual(Object.keys(reg).filter((k) => !propios.has(k)), []);
  assert.equal(reg.motor, 'tati');
});

// Revisión M1: sin pasos no se publica nada y los tramos pendientes del personaje siguen ahí.
test('crear_ruta sin pasos no toca los tramos pendientes: el «sigue» trae el segundo tramo sin la IA', async () => {
  const x = montar();
  await conLatido(x);
  const larga = await x.acciones.ejecutar('crear_ruta', { guia: RUTA_LARGA });
  assert.equal(larga.ok, true);
  assert.equal(larga.tramos, 2);
  assert.equal((await x.acciones.ejecutar('crear_ruta', { guia: { titulo: 'Nada', pasos: [{ punto: 'B:n999999999' }] } })).error, 'sin_pasos');
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 8, cuerpo: mensaje({ id: 'c9d1-2', texto: 'sigue' }) }));
  assert.equal(x.llamadas.length, 0, 'el «sigue» se contesta sin la IA');
  assert.ok(buzonUltimo(8).guiaIA, 'con el segundo tramo');
});

// Revisión M2: si el jugador cambia de personaje mientras se arma, no se publica nada.
test('cambio de personaje mientras se arma: cambio_personaje y nada publicado', async () => {
  const x = montar();
  await conLatido(x);
  const envuelto = {
    ...x.nucleo,
    armarRespuesta: async (o) => {
      const r = await x.nucleo.armarRespuesta(o);
      const otro = o.pj === PJ ? PJ_DOS : PJ; // el jugador cambia al otro personaje
      await x.estadoJuego.apuntar(otro, latido({ pj: otro, id: 'e2f3-1' }), 5);
      return r;
    },
  };
  const acciones = crearAcciones({ nucleo: envuelto, estadoJuego: x.estadoJuego, datos: h.datos, carpetaBase });
  const fotos = fotoRanuras();
  assert.deepEqual(await acciones.ejecutar('crear_ruta', { guia: GUIA }), { error: 'cambio_personaje' });
  assert.deepEqual(await acciones.ejecutar('poner_pines', { marcas: ['B:n10176'] }), { error: 'cambio_personaje' });
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.nucleo.estado().seq, 0);
  assert.match(leerLog(), /tati: crear_ruta cambio_personaje/);
});

// Revisión M3: topes baratos antes de armar.
test('topes: una guía de más de 200 000 caracteres en JSON o una marca de más de 64 dan argumentos', async () => {
  const x = montar();
  await conLatido(x);
  const enorme = { titulo: 'Grande', pasos: Array.from({ length: 400 }, () => ({ texto: 'x'.repeat(600) })) };
  assert.ok(JSON.stringify(enorme).length > 200_000);
  assert.deepEqual(await x.acciones.ejecutar('crear_ruta', { guia: enorme }), { error: 'argumentos' });
  assert.deepEqual(await x.acciones.ejecutar('poner_pines', { marcas: [`B:n10176${' '.repeat(60)}`] }), { error: 'argumentos' });
  assert.equal(x.nucleo.estado().seq, 0);
});

// ---------- las comprobaciones de las de acción ----------

test('con el juego cerrado no se escribe ninguna ranura (juego_cerrado antes que nada)', async () => {
  const x = montar({ juegoAbierto: () => false });
  await conLatido(x);
  const fotos = fotoRanuras();
  const timbres = x.sacados.length;
  for (const [nombre, args] of [
    ['crear_ruta', { guia: GUIA }],
    ['poner_pines', { marcas: ['B:n10176'] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'] }] }],
    ['escribir_chat', { texto: 'hola' }],
  ]) {
    assert.deepEqual(await x.acciones.ejecutar(nombre, args), { error: 'juego_cerrado' }, nombre);
  }
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.sacados.length, timbres);
  assert.equal(x.nucleo.estado().seq, 0);
  // Sin estado tampoco: juego_cerrado va primero.
  const y = montar({ juegoAbierto: () => false });
  assert.deepEqual(await y.acciones.ejecutar('escribir_chat', { texto: 'hola' }), { error: 'juego_cerrado' });
});

test('sin estado del juego: sin_personaje; sin ranuras: sin_ranuras con el consejo /reload', async () => {
  const x = montar({ juegoAbierto: () => true });
  const fotos = fotoRanuras();
  for (const [nombre, args] of [['crear_ruta', { guia: GUIA }], ['poner_pines', { marcas: ['B:n10176'] }], ['dibujar_en_mapa', { ruta: true }], ['escribir_chat', { texto: 'hola' }]]) {
    assert.deepEqual(await x.acciones.ejecutar(nombre, args), { error: 'sin_personaje' }, nombre);
  }
  assert.deepEqual(fotoRanuras(), fotos);

  await conLatido(x, { r: 20 });
  assert.equal(x.estadoJuego.ranurasQuedan(), 1);
  assert.deepEqual(await x.acciones.ejecutar('escribir_chat', { texto: 'una' }), { ok: true, ranurasQuedan: 0 });
  assert.equal(x.estadoJuego.ranurasQuedan(), 0);
  const despues = fotoRanuras();
  for (const [nombre, args] of [['crear_ruta', { guia: GUIA }], ['poner_pines', { marcas: ['B:n10176'] }], ['dibujar_en_mapa', { ruta: true }], ['escribir_chat', { texto: 'dos' }]]) {
    assert.deepEqual(await x.acciones.ejecutar(nombre, args), { error: 'sin_ranuras', consejo: '/reload' }, nombre);
  }
  assert.deepEqual(fotoRanuras(), despues);
});

test('argumentos que no valen: error sin publicar nada', async () => {
  const x = montar();
  await conLatido(x);
  const fotos = fotoRanuras();
  for (const [nombre, args] of [
    ['crear_ruta', {}],
    ['crear_ruta', { guia: 'no' }],
    ['crear_ruta', { guia: GUIA, nota: 'x'.repeat(501) }],
    ['poner_pines', { marcas: [] }],
    ['poner_pines', { marcas: 'B:n10176' }],
    ['poner_pines', { marcas: Array.from({ length: 31 }, () => 'B:n10176') }],
    ['poner_pines', { marcas: ['B:n10176'], titulo: 'x'.repeat(61) }],
    ['dibujar_en_mapa', {}],
    ['dibujar_en_mapa', { trazos: [] }],
    ['dibujar_en_mapa', { trazos: 'B:n10176' }],
    ['dibujar_en_mapa', { trazos: Array.from({ length: 41 }, () => ({ tipo: 'marca', marcas: ['B:n10176'] })) }],
    ['dibujar_en_mapa', { trazos: ['B:n10176'] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: 'B:n10176' }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: [] }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'linea', marcas: Array.from({ length: 21 }, () => 'B:n10176') }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: [`B:n10176${' '.repeat(60)}`] }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: [5] }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'rayo', marcas: ['B:n10176'] }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'], tinta: 7 }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'], grosor: 1.5 }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'], icono: 9 }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'], texto: 'x'.repeat(81) }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'], texto: 'a' + '`'.repeat(3) + 'b' }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'], radio: 5 }] }],
    ['dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'] }], reemplazar: 'si' }],
    ['dibujar_en_mapa', { ruta: 'si' }],
    ['dibujar_en_mapa', { ruta: false }],
    ['escribir_chat', { texto: '' }],
    ['escribir_chat', { texto: 'x'.repeat(2001) }],
    ['escribir_chat', {}],
  ]) {
    assert.deepEqual(await x.acciones.ejecutar(nombre, args), { error: 'argumentos' }, `${nombre} ${JSON.stringify(args).slice(0, 40)}`);
  }
  assert.deepEqual(fotoRanuras(), fotos);
});

// ---------- poner_pines ----------

test('poner_pines: las marcas que se resuelven van de pines; las coordenadas y las que no se resuelven se quitan', async () => {
  const x = montar();
  await conLatido(x);
  const r = await x.acciones.ejecutar('poner_pines', { marcas: ['B:n10176', 'B:n999999999', '45.2, 67.8'] });
  assert.deepEqual(r, { ok: true, pines: 1, quitadas: 2, ranurasQuedan: 13 });
  const reg = buzonUltimo();
  assert.equal(reg.origen, 'tati');
  assert.equal(reg.propuesta.tipo, 'pines');
  const puntos = Object.values(reg.propuesta.puntos);
  assert.equal(puntos.length, 1);
  assert.equal(puntos[0].mapa, 1411);
  assert.equal(puntos[0].x, 42.1);
  assert.equal(reg.abrirGuiaIA, undefined);
});

// Revisión I3 (Ruling P11): «márcame dónde se recoge X» de una misión que no está en el registro.
test('poner_pines con la marca de una misión que no está en el registro: el texto la nombra y el pin se queda', async () => {
  const x = montar();
  await conLatido(x);
  const r = await x.acciones.ejecutar('poner_pines', { marcas: ['B:q788:r'] });
  assert.deepEqual(r, { ok: true, pines: 1, quitadas: 0, ranurasQuedan: 13 });
  const reg = buzonUltimo();
  assert.ok(reg.texto.includes('Dientes afilados'), reg.texto);
  const puntos = Object.values(reg.propuesta.puntos);
  assert.equal(puntos.length, 1);
  assert.equal(puntos[0].q, 788);
  assert.deepEqual([puntos[0].x, puntos[0].y], [51, 41]);
});

test('poner_pines con seguir: una ruta con su título', async () => {
  const x = montar();
  await conLatido(x);
  const r = await x.acciones.ejecutar('poner_pines', { marcas: ['B:n10176', 'B:n3143'], seguir: true, titulo: 'Los dos' });
  assert.deepEqual(r, { ok: true, pines: 2, quitadas: 0, ranurasQuedan: 13 });
  const reg = buzonUltimo();
  assert.equal(reg.propuesta.tipo, 'ruta');
  assert.equal(reg.propuesta.titulo, 'Los dos');
  assert.equal(Object.values(reg.propuesta.puntos).length, 2);
});

test('poner_pines con marcas que no se resuelven: sin_marcas y nada publicado', async () => {
  const x = montar();
  await conLatido(x);
  const fotos = fotoRanuras();
  assert.deepEqual(await x.acciones.ejecutar('poner_pines', { marcas: ['B:n999999999', 'P1'] }), { error: 'sin_marcas' });
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.nucleo.estado().seq, 0);
});

// ---------- dibujar_en_mapa ----------

test('dibujar_en_mapa: gasta una ranura y publica los trazos con el formato del addon y las coordenadas de la base', async () => {
  const x = montar();
  await conLatido(x);
  const antes = x.estadoJuego.ranurasQuedan();
  const r = await x.acciones.ejecutar('dibujar_en_mapa', { trazos: [
    { tipo: 'flecha', marcas: ['B:n10176', 'B:n3143'], tinta: 2, texto: 'Por aquí' },
    { tipo: 'circulo', marcas: ['B:q4641:o1'], grosor: 1 },
    { tipo: 'marca', marcas: ['45.2, 67.8', 'P1'] },
  ] });
  assert.deepEqual(r, { ok: true, trazos: 2, descartados: 1, ranurasQuedan: antes - 1 });
  const reg = buzonUltimo();
  assert.equal(reg.origen, 'tati');
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.propuesta, undefined);
  assert.equal(reg.dibujosReemplazar, undefined);
  const trazos = Object.values(reg.dibujos).map((d) => ({ ...d, puntos: Object.values(d.puntos) }));
  assert.deepEqual(trazos, [
    { mapa: 1411, tipo: 'flecha', tinta: 2, grosor: 2, puntos: [42.1, 68.3, 51, 41], texto: 'Por aquí' },
    // La zona de los jabalíes de la base (tres sitios juntos): centro y radio de esos sitios.
    { mapa: 1411, tipo: 'circulo', tinta: 2, grosor: 1, puntos: [45, 70], radio: 2.5 },
  ]);
});

test('dibujar_en_mapa: reemplazar quita antes los de la IA; ruta: true pide la línea de la guía activa', async () => {
  const x = montar();
  await conLatido(x);
  assert.deepEqual(await x.acciones.ejecutar('dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'], icono: 8 }], reemplazar: true }),
    { ok: true, trazos: 1, descartados: 0, ranurasQuedan: 13 });
  const reg = buzonUltimo();
  assert.equal(reg.dibujosReemplazar, true);
  assert.equal(Object.values(reg.dibujos)[0].marca, 8);
  const r = await x.acciones.ejecutar('dibujar_en_mapa', { ruta: true });
  assert.equal(r.ok, true);
  assert.equal(r.trazos, 1);
  // Revisión: la línea de la ruta la resuelve el addon con la guía activa: TATI lo sabe por el resultado.
  assert.match(r.aviso, /guía activa/);
  assert.match(r.aviso, /\/ .*active guide/);
  const otro = buzonUltimo();
  assert.deepEqual(Object.values(otro.dibujos), [{ ruta: true, tipo: 'linea', tinta: 2, grosor: 2 }]);
  assert.equal(otro.dibujosReemplazar, undefined);
});

test('dibujar_en_mapa sin marcas válidas (coordenadas, P# o marcas que no se resuelven): sin_marcas y nada publicado', async () => {
  const x = montar();
  await conLatido(x);
  const fotos = fotoRanuras();
  assert.deepEqual(await x.acciones.ejecutar('dibujar_en_mapa', { trazos: [{ tipo: 'linea', marcas: ['P1', '45.2, 67.8'] }] }), { error: 'sin_marcas' });
  assert.deepEqual(await x.acciones.ejecutar('dibujar_en_mapa', { trazos: [{ tipo: 'linea', marcas: ['B:n999999999', 'B:n999999998'] }] }), { error: 'sin_marcas' });
  // Una línea con una sola marca buena no tiene los dos puntos que necesita.
  assert.deepEqual(await x.acciones.ejecutar('dibujar_en_mapa', { trazos: [{ tipo: 'linea', marcas: ['B:n10176', 'P2'] }] }), { error: 'sin_marcas' });
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.nucleo.estado().seq, 0);
});

// ---------- escribir_chat ----------

test('escribir_chat publica un registro con el texto pasado por renderizar (un | sale doble)', async () => {
  const x = montar();
  await conLatido(x);
  assert.deepEqual(await x.acciones.ejecutar('escribir_chat', { texto: 'a|b' }), { ok: true, ranurasQuedan: 13 });
  const reg = buzonUltimo();
  assert.equal(reg.texto, 'a||b');
  assert.equal(reg.origen, 'tati');
  assert.equal(reg.t, 'respuesta');
  assert.equal(reg.motor, 'tati');
  assert.equal(reg.propuesta, undefined);
  assert.equal(reg.guiaIA, undefined);
  assert.equal(x.llamadas.length, 0, 'no se pregunta a ninguna IA');
});

// Revisión I2: el texto tal cual, sin bloque; con ``` no pasa nada de nada (ni tramos pendientes ni páginas).
test('escribir_chat con un bloque (una guiaNueva de dos tramos) da argumentos, no publica y un «sigue» va a la IA', async () => {
  const x = montar();
  await conLatido(x);
  const fotos = fotoRanuras();
  const dosTramos = `Mira\n\`\`\`snet\n${JSON.stringify({ guiaNueva: RUTA_LARGA })}\n\`\`\``;
  assert.deepEqual(await x.acciones.ejecutar('escribir_chat', { texto: dosTramos }), { error: 'argumentos' });
  assert.deepEqual(await x.acciones.ejecutar('escribir_chat', { texto: 'solo ``` sin cerrar' }), { error: 'argumentos' });
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.nucleo.estado().seq, 0);
  await x.nucleo.recibirTrama(trama({ id: 'c9d1-2', r: 8, cuerpo: mensaje({ id: 'c9d1-2', texto: 'sigue' }) }));
  assert.equal(x.llamadas.length, 1, 'sin tramos pendientes: el «sigue» va a la IA');
});

// ---------- estado_juego ----------

test('estado_juego: el resumen, el juego y las ranuras; con detalle, los datos del turno; nunca el personaje', async () => {
  let abierto = null;
  const x = montar({ juegoAbierto: () => abierto });
  const sin = await x.acciones.ejecutar('estado_juego', {});
  assert.equal(sin.conocido, false);
  assert.equal(sin.juego, 'desconocido');
  assert.equal(sin.ranurasQuedan, null);

  await conLatido(x, { r: 4 });
  abierto = true;
  const e = await x.acciones.ejecutar('estado_juego', {});
  assert.equal(e.conocido, true);
  assert.equal(e.juego, 'abierto');
  assert.equal(e.ranurasQuedan, 17);
  assert.equal(e.lugar.zona, 'Durotar');
  assert.equal(e.personaje.nivel, 3);
  assert.equal(e.datos, undefined);
  abierto = false;
  assert.equal((await x.acciones.ejecutar('estado_juego', {})).juego, 'cerrado');

  const d = await x.acciones.ejecutar('estado_juego', { detalle: true });
  assert.equal(typeof d.datos, 'object');
  assert.ok(d.datos !== null);
  const todo = JSON.stringify(d);
  assert.equal(todo.includes('Tal Cual'), false);
  assert.equal(todo.includes('Reino Prueba'), false);
  assert.equal(d.pj, undefined);

  const y = montar(); // sin juegoAbierto
  assert.equal((await y.acciones.ejecutar('estado_juego', {})).juego, 'desconocido');
});

// ---------- las seis de solo lectura ----------

test('misiones_zona sin argumentos usa la zona del último latido', async () => {
  const x = montar();
  const sin = await x.acciones.ejecutar('misiones_zona', {});
  assert.equal(sin.error, 'zona_desconocida', 'sin estado, el turno es null');
  await conLatido(x);
  const r = await x.acciones.ejecutar('misiones_zona', {});
  assert.equal(r.zona.mapa, 1411, JSON.stringify(r).slice(0, 200));
  assert.ok(r.misiones.some((m) => m.q === 4641));
  const p = await x.acciones.ejecutar('pnj', { pnj: 10176 });
  assert.ok(JSON.stringify(p).includes('B:n10176'), JSON.stringify(p).slice(0, 200));
});

test('instrucciones: da el tema de sistema.md sin latido ni base, no gasta ranuras y un tema que no existe da tema', async () => {
  const x = montar();
  const sin = await x.acciones.ejecutar('instrucciones', { tema: 'comercio' });
  assert.equal(sin.tema, 'comercio', 'sin estado del juego también');
  assert.equal(sin.texto, textoDeTema('comercio'));
  await conLatido(x);
  const antes = x.estadoJuego.ranurasQuedan();
  const r = await x.acciones.ejecutar('instrucciones', { tema: 'pines_rutas' });
  assert.equal(r.texto, textoDeTema('pines_rutas'));
  assert.equal(x.estadoJuego.ranurasQuedan(), antes, 'no gasta ranuras');
  assert.deepEqual(await x.acciones.ejecutar('instrucciones', { tema: 'otro' }), { error: 'tema', temas: TEMAS.map((t) => t.tema) });
  assert.match(leerLog(), /tati: instrucciones ok/);
  assert.match(leerLog(), /tati: instrucciones tema/);
});

// ---------- revisión final del puente ----------

// I1: con la app recién reiniciada (el estado del juego sigue en estados.json, pero en esta ejecución aún no ha llegado
// ningún latido) no se sabe la ranura del addon: las de acción dicen sin_latido con su consejo y no escriben nada.
test('I1: sin ningún latido en esta ejecución, las de acción dan sin_latido con el consejo y no publican', async () => {
  const x = montar();
  await x.estadoJuego.apuntar(PJ, latido(), 7); // de una ejecución anterior
  const fotos = fotoRanuras();
  for (const [nombre, args] of [['crear_ruta', { guia: GUIA }], ['poner_pines', { marcas: ['B:n10176'] }], ['dibujar_en_mapa', { ruta: true }], ['escribir_chat', { texto: 'hola' }]]) {
    assert.deepEqual(await x.acciones.ejecutar(nombre, args), { error: 'sin_latido', consejo: CONSEJO_SIN_LATIDO }, nombre);
  }
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.nucleo.estado().seq, 0);
  // Sin latidos con el chat del juego cerrado: cambiar de zona o escribir ya no sirve; abrir el chat, sí.
  assert.match(CONSEJO_SIN_LATIDO, /abre un momento el chat de SnetForever en el juego/);
  assert.doesNotMatch(CONSEJO_SIN_LATIDO, /zona|escribe/);
  assert.match(leerLog(), /tati: escribir_chat sin_latido/);
  await conLatido(x);
  assert.equal((await x.acciones.ejecutar('escribir_chat', { texto: 'hola' })).ok, true, 'con un latido, ya');
});

// Tras reiniciar la app con el chat del juego cerrado (sin latidos), lo guardado del último latido vale: pines y
// estado_juego funcionan sin esperar uno.
test('tras reiniciar la app, poner_pines y estado_juego funcionan con lo guardado, sin esperar un latido', async () => {
  const x = montar();
  await conLatido(x);
  await x.parar();
  const y = montar();
  const r = await y.acciones.ejecutar('poner_pines', { marcas: ['B:n10176'] });
  assert.deepEqual(r, { ok: true, pines: 1, quitadas: 0, ranurasQuedan: 13 });
  const reg = ultimoDe(leerBuzon(7));
  assert.equal(reg.origen, 'tati');
  assert.equal(reg.propuesta.tipo, 'pines');
  const e = await y.acciones.ejecutar('estado_juego', {});
  assert.equal(e.conocido, true);
  assert.equal(e.lugar.zona, 'Durotar');
});

// M3: escribir_chat pasa por las mismas limpiezas de prosa que la respuesta de la IA.
test('M3: escribir_chat quita enlaces, nombres internos e ids de misión detrás de su nombre', async () => {
  const x = montar();
  await conLatido(x);
  const texto = 'Mira [Wowhead: Tu lugar](https://www.wowhead.com/quest=4641) y <https://ejemplo.com/x>.\n'
    + 'Haz «Tu lugar en el mundo» (4641) primero (falta `datos.comercio`).';
  assert.equal((await x.acciones.ejecutar('escribir_chat', { texto })).ok, true);
  const reg = buzonUltimo();
  assert.ok(!reg.texto.includes('http'), reg.texto);
  assert.ok(!reg.texto.includes('datos.'), reg.texto);
  assert.ok(!reg.texto.includes('(4641)'), reg.texto);
  assert.ok(reg.texto.includes('Wowhead: Tu lugar'), reg.texto);
  assert.ok(reg.texto.includes('«Tu lugar en el mundo»'), reg.texto);
  // Lo que se queda vacío tras limpiar no se publica.
  const fotos = fotoRanuras();
  assert.deepEqual(await x.acciones.ejecutar('escribir_chat', { texto: 'https://ejemplo.com/solo' }), { error: 'sin_texto' });
  assert.deepEqual(fotoRanuras(), fotos);
});

// M4: una guía con ``` en cualquier texto (cerraría el bloque en el que viaja) no vale.
test('M4: crear_ruta con ``` dentro de la guía da argumentos y no publica', async () => {
  const x = montar();
  await conLatido(x);
  const fotos = fotoRanuras();
  for (const guia of [
    { titulo: 'Prueba', pasos: [{ texto: 'Habla ``` con él', punto: 'B:n10176' }] },
    { titulo: 'a```b', pasos: GUIA.pasos },
  ]) {
    assert.deepEqual(await x.acciones.ejecutar('crear_ruta', { guia }), { error: 'argumentos' });
  }
  assert.deepEqual(fotoRanuras(), fotos);
  assert.equal(x.nucleo.estado().seq, 0);
});

// ---------- errores y registro.log ----------

test('una herramienta desconocida o que falla da un código, sin rutas ni pilas', async () => {
  const roto = {
    baseActual: () => Promise.reject(Object.assign(new Error(`no carga ${join(RAIZ, 'secreto')}`), { code: 'ENOENT' })),
    armarRespuesta: async () => { throw new Error(`fallo en ${join(RAIZ, 'secreto')}`); },
    empujar: async () => ({ error: 'sin_puente' }),
  };
  const estadoJuego = crearEstadoJuego({ datos: h.datos });
  await estadoJuego.apuntar(PJ, latido(), 7);
  const acciones = crearAcciones({ nucleo: roto, estadoJuego, datos: h.datos, carpetaBase });
  const desconocida = await acciones.ejecutar('borrar_todo', {});
  assert.deepEqual(desconocida, { error: 'herramienta_desconocida' });
  const fallo = await acciones.ejecutar('crear_ruta', { guia: GUIA });
  assert.deepEqual(fallo, { error: 'interno' });
  const sinBase = await acciones.ejecutar('misiones_zona', {});
  assert.equal(sinBase.error, 'sin_base');
  for (const r of [desconocida, fallo, sinBase]) {
    const s = JSON.stringify(r);
    assert.ok(!s.includes('secreto') && !s.includes(RAIZ.replace(/\\/g, '\\\\')) && !s.includes(' at '), s);
  }
});

test('registro.log: solo «tati: <herramienta> ok|<error>» y contadores, sin nombres, títulos ni textos', async () => {
  const x = montar();
  await conLatido(x);
  await x.acciones.ejecutar('crear_ruta', { guia: GUIA, nota: 'Una nota privada' });
  await x.acciones.ejecutar('poner_pines', { marcas: ['45.2, 67.8'] });
  await x.acciones.ejecutar('escribir_chat', { texto: 'texto privado' });
  await x.acciones.ejecutar('dibujar_en_mapa', { trazos: [{ tipo: 'marca', marcas: ['B:n10176'], texto: 'Otro privado' }, { tipo: 'linea', marcas: ['P1'] }] });
  await x.acciones.ejecutar('estado_juego', {});
  await x.acciones.ejecutar('misiones_zona', {});
  await x.acciones.ejecutar('borrar_todo', {});
  const log = leerLog();
  assert.match(log, /tati: crear_ruta ok/);
  assert.match(log, /tati: poner_pines sin_marcas/);
  assert.match(log, /tati: escribir_chat ok/);
  assert.match(log, /tati: dibujar_en_mapa ok \(trazos 1, descartados 1\)/);
  assert.match(log, /tati: estado_juego ok/);
  assert.match(log, /tati: misiones_zona ok/);
  assert.match(log, /tati: \? herramienta_desconocida/);
  for (const prohibido of ['Tal Cual', 'Reino Prueba', 'Prueba', 'privad', 'borrar_todo', 'Habla con', '45.2']) {
    assert.ok(!log.includes(prohibido), prohibido);
  }
});

test('guardar_guia por TATI: guarda en la biblioteca de la app, reindexa con su índice, no gasta ranuras ni pide el juego', async () => {
  const x = montar({ juegoAbierto: () => false });
  const reindexados = [];
  const biblioteca = { actualizar: async () => { reindexados.push(1); }, indice: () => ({ guias: [{ archivo: 'Baldios/Baldios.txt' }] }) };
  const obtener = async (url) => ({ url, tipo: 'text/plain', cuerpo: Buffer.from('1. Acepta «Colmillos»\n') });
  const acciones = crearAcciones({ nucleo: x.nucleo, estadoJuego: x.estadoJuego, datos: h.datos, carpetaBase, juegoAbierto: () => false, obtener, biblioteca: () => biblioteca });
  const ranuras = fotoRanuras();
  const r = await acciones.ejecutar('guardar_guia', { url: 'https://ejemplo.com/Baldios.txt' });
  assert.deepEqual(r, { ok: true, guardado: { tipo: 'archivo', carpeta: 'Baldios', archivos: ['Baldios/Baldios.txt'] }, guiasNuevas: 1, mensaje: MENSAJES.es.leida });
  assert.ok(existsSync(join(h.datos, 'guias', 'Baldios', 'Baldios.txt')));
  assert.equal(reindexados.length, 1);
  assert.deepEqual(fotoRanuras(), ranuras, 'nada publicado en el juego');
  // con la biblioteca de la app sin arrancar, se guarda igual (sin cuenta de guías)
  const sinIndice = crearAcciones({ nucleo: x.nucleo, estadoJuego: x.estadoJuego, datos: h.datos, carpetaBase, obtener, biblioteca: () => null });
  const r2 = await sinIndice.ejecutar('guardar_guia', { url: 'https://ejemplo.com/Baldios.txt' });
  assert.equal(r2.guardado.carpeta, 'Baldios-2');
  assert.equal(r2.guiasNuevas, null);
  assert.equal((await acciones.ejecutar('guardar_guia', { url: 'ftp://ejemplo.com/x.zip' })).error, 'url');
  assert.match(leerLog(), /tati: guardar_guia ok/);
  assert.ok(!leerLog().includes('ejemplo.com'), 'sin la dirección en el registro');
});

test('T2 (A1): crear_ruta con una misión que se recoge y se entrega sin completar lleva sus objetivos de la base entre medias', async () => {
  const x = montar();
  await conLatido(x);
  const guia = { titulo: 'Objetivos', pasos: [
    { texto: 'Recoge', misiones: [{ q: 4641, accion: 'aceptar' }], punto: 'B:q4641:r' },
    { texto: 'Entrega', misiones: [{ q: 4641, accion: 'entregar' }], punto: 'B:q4641:e' },
  ] };
  const r = await x.acciones.ejecutar('crear_ruta', { guia });
  assert.equal(r.ok, true, JSON.stringify(r));
  const acciones = pasosDe(buzonUltimo().guiaIA).flatMap((p) => Object.values(p.elementos)).filter((e) => e.q !== undefined).map((e) => `${e.t} ${e.q}`);
  assert.deepEqual(acciones, ['accept 4641', 'complete 4641', 'turnin 4641']);
});

// Ronda 1 (I2): la red S2 de la app no toca las acciones de TATI (la app no ve lo que pidió el jugador; manda la regla S1):
// poner_pines con seguir y una guía cargada a medias publica una ruta.
test('ronda 1 (I2): poner_pines con seguir y una guía a medias sigue siendo una ruta (S2 no se aplica a TATI)', async () => {
  const x = montar();
  const cuerpo = { ...latido(), ctx: { ...CTX, guia: { clave: 'Horde\\1-12', titulo: 'Durotar 1-12', n: 3, paso: 'Habla con Gornek', misiones: [] } } };
  await x.nucleo.recibirTrama(trama({ cuerpo }));
  await x.nucleo.inactivo();
  const r = await x.acciones.ejecutar('poner_pines', { marcas: ['B:q4641:r', 'B:q4641:e'], seguir: true, titulo: 'Entregas' });
  assert.ok(!r.error, JSON.stringify(r));
  const reg = buzonUltimo();
  assert.equal(reg.propuesta.tipo, 'ruta');
  assert.ok(Object.values(reg.propuesta.puntos).every((p) => p.seguir === true));
});
