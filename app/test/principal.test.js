// Tarea 20: bandeja y arranque. Con `--sin-bandeja --sin-captura` (o con una bandeja y una captura falsas), carpetas de
// prueba, el claude falso y SIN codex (SNF_CODEX apunta a algo que no existe). La opción --probar-ia nunca se lanza de
// verdad aquí: solo `probarIA` con motores de pega.
import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync, rmSync, cpSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as nodeFs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { arrancar, tomarCerrojo, MAX_LOCK_VIEJOS, idiomaDeWindows, idiomaDeLaApp, probarIA, guardarMotor } from '../src/principal.mjs';
import { lanzarBandeja, SCRIPT_BANDEJA, recortar, abrirRuta } from '../src/bandeja.mjs';
import { leerPortapapeles } from '../src/navegador.mjs';
import { ErrorRed } from '../src/actualizar/red.mjs';
import { POWERSHELL } from '../src/captura.mjs';
import { infoProceso } from '../src/proceso.mjs';
import { prepararAddOns } from '../src/instalacion.mjs';
import { olvidarOpciones } from '../src/claude.mjs';
import { TEXTOS_APP, textoBandejaMotor, textoMotorCorto, ERRORES, ERRORES_TATI } from '../src/textos.mjs';
import { pedir } from '../src/tati/correo.mjs';
import { empaquetar } from '../src/actualizar/paquete.mjs';
import { VERSION } from '../src/version.mjs';
import { crearHistorial as crearHistorialComercio } from '../src/comercio/historial.mjs';
import { crearCatalogo } from '../src/comercio/objetos.mjs';
import { crearEstadoComercio } from '../src/comercio/estado.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO = join(AQUI, 'falso-claude', 'claude.mjs');
const COPIA = { ...process.env };
const RAIZ = mkdtempSync(join(tmpdir(), 'snf-principal-'));
const OK = { estado: 'ok', version: '2.1.311' };
const NO = { estado: 'sin_instalar' };

// La base del fixture, donde el arranque la espera (SNF_BASE).
const carpetaBase = join(RAIZ, 'base');
mkdirSync(carpetaBase);
copyFileSync(join(AQUI, 'fixtures', 'misiones-app.lua'), join(carpetaBase, 'misiones-app.lua'));
writeFileSync(join(carpetaBase, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', ''].join('\n'));

after(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, COPIA);
});

let n = 0;
let h;
let apps = [];

// Carpeta de prueba: datos, AddOns con SnetForever (sin ranuras todavía) y la «raíz del volumen».
function preparar(i) {
  const base = join(RAIZ, `t${i}`);
  const addons = join(base, 'AddOns');
  mkdirSync(join(addons, 'SnetForever'), { recursive: true });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Interface: 16001\n## Title: SnetForever\n\nnucleo.lua\n');
  const raiz = join(base, 'volumen');
  mkdirSync(raiz);
  return { base, addons, raiz, datos: join(base, 'datos') };
}

beforeEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in COPIA)) delete process.env[k];
  Object.assign(process.env, COPIA);
  n += 1;
  h = preparar(n);
  process.env.SNF_DATOS = h.datos;
  process.env.SNF_ADDONS = h.addons;
  process.env.SNF_CLAUDE = FALSO;
  process.env.SNF_CODEX = join(h.base, 'no-hay-codex.mjs');
  process.env.SNF_BASE = carpetaBase;
  process.env.SNF_IDIOMA = 'es';
  process.env.SNF_INSTALACION = join(h.base, 'instalacion'); // nunca la de verdad (R17, fallida.txt, limpiarVersiones)
  process.env.SNF_CUARENTENA = join(h.base, 'cuarentena-componentes');
  process.env.FALSO_MODO = 'auth_ok';
  olvidarOpciones();
  apps = [];
});

afterEach(async () => {
  for (const a of apps) await a.parar();
});

const ARGS = ['--sin-bandeja', '--sin-captura'];
// Casi todas las pruebas comprueban con unos motores de pega (rápidos); la primera y la segunda usan el claude falso de verdad.
const RAPIDOS = { claude: async () => OK, codex: async () => NO };
// Tarea 13: el juego (procesos, registro) y el actualizador son siempre falsos: nada de PowerShell ni de red de verdad.
const deps = (mas = {}) => ({
  raizVolumen: h.raiz, salida: () => {}, errores: () => {}, comprobar: RAPIDOS, juego: juegoFalso(), actualizador: actualizadorFalso().crear,
  // Task 8: ni PowerShell para «Arrancar con Windows» ni la API de Blizzard de verdad
  inicio: inicioFalso(), clienteBlizzard: clienteBlizzardFalso,
  // Biblioteca de guías: ni el disco del índice, ni la copia del juego, ni la red, ni el portapapeles de verdad
  crearIndice: indiceFalso().crear, copiarDelJuego: async () => ({ copiados: [], apartados: 0 }),
  obtenerPagina: async () => { throw new Error('sin red en las pruebas'); }, leerPortapapeles: async () => null,
  ...mas,
});

// Task 8: «Arrancar con Windows» de pega (el acceso directo es solo una variable).
function inicioFalso(activo = false) {
  const f = { activo, puestos: [], falla: false };
  f.consultar = async () => ({ activo: f.activo });
  f.poner = async (v) => {
    if (f.falla) throw new Error('PowerShell no contestó');
    f.puestos.push(v);
    f.activo = v;
    return { activo: f.activo };
  };
  return f;
}
// Task 8: un cliente de Blizzard de pega: todo «igual» (304), sin red.
const clienteBlizzardFalso = () => ({ subastas: async () => ({ estado: 'igual' }), mercancias: async () => ({ estado: 'igual' }), objeto: async () => null });

async function abrir(args = ARGS, mas = {}, entorno = process.env) {
  const app = await arrancar(args, entorno, deps(mas.comprobar === 'real' ? { ...mas, comprobar: undefined } : mas));
  apps.push(app);
  return app;
}

const buzon = (i) => readFileSync(join(h.addons, `SnetForever_R${String(i).padStart(3, '0')}`, 'buzon.lua'), 'utf8');

// Una bandeja falsa: apunta lo que se le manda y deja a la prueba tocar el menú.
function bandejaFalsa() {
  const f = { estados: [], globos: [], motores: [], entradas: [], inicios: [], cerebros: [], paradas: 0, alMenu: null };
  f.lanzar = (opciones) => {
    f.alMenu = opciones.alMenu;
    return {
      estado: (texto, icono, extra) => f.estados.push({ texto, icono, ...extra }),
      globo: (titulo, texto) => f.globos.push({ titulo, texto }),
      entradas: (e) => f.entradas.push(e),
      motor: (v) => f.motores.push(v),
      inicio: (v) => f.inicios.push(v),
      cerebro: (v) => f.cerebros.push(v), // S8: solo con el puente con TATI

      parar: async () => { f.paradas++; },
    };
  };
  return f;
}

// Un hijo de pega para lanzarBandeja: lo que se le escribe se apunta; al cerrar su entrada, sale (como el .ps1).
function hijoFalso({ saleSolo = true } = {}) {
  const hijo = new EventEmitter();
  hijo.stdin = new PassThrough();
  hijo.stdout = new PassThrough();
  hijo.stderr = new PassThrough();
  hijo.pid = 4242;
  hijo.escrito = [];
  hijo.matado = false;
  hijo.stdin.on('data', (d) => hijo.escrito.push(...d.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))));
  if (saleSolo) hijo.stdin.on('end', () => setImmediate(() => hijo.emit('close', 0)));
  hijo.kill = () => {
    hijo.matado = true;
    setImmediate(() => hijo.emit('close', null));
    return true;
  };
  return hijo;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const hasta = async (cond, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('la condición no se cumplió a tiempo');
    await esperar(10);
  }
};

// ---------- arranque ----------

test('arrancar escribe el buzón con estado.claude = ok en las 20 ranuras y crea el cerrojo', async () => {
  const app = await abrir(ARGS, { comprobar: 'real' });
  await app.listo;
  assert.ok(existsSync(join(h.datos, 'app.lock')), 'falta datos/app.lock');
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'app.lock'), 'utf8')).pid, process.pid);
  assert.equal(existsSync(join(h.addons, 'SnetForever_R021')), false, 'no hay ranura 21');
  for (let i = 1; i <= 20; i++) {
    assert.match(buzon(i), /claude\s*=\s*"ok"/, `ranura ${i}`);
    assert.match(buzon(i), /codex\s*=\s*"sin_instalar"/, `ranura ${i}`);
    assert.match(buzon(i), /motorNombre\s*=\s*"claude"/, `ranura ${i}`);
    assert.match(buzon(i), /[^a-zA-Z]motor\s*=\s*"ok"/, `ranura ${i}`);
  }
  assert.equal(readdirSync(join(h.addons, 'SnetForever', 'senales')).length, 7);
});

test('una segunda instancia sale con 3 y dice que ya está abierto; al parar la primera, otra puede abrir', async () => {
  const dicho = [];
  const a = await abrir();
  await a.listo;
  const b = await arrancar(ARGS, process.env, deps({ errores: (t) => dicho.push(t) }));
  assert.equal(b.codigo, 3);
  assert.deepEqual(dicho, ['SnetForever ya está abierto']);
  await a.parar();
  const c = await abrir();
  assert.equal(c.codigo, undefined, 'tras soltar el cerrojo, abre');
  await c.listo;
  // El cerrojo no se borra: se vacía (pid 0) y se reescribe de forma atómica.
  await c.parar();
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'app.lock'), 'utf8')).pid, 0);
  assert.deepEqual(readdirSync(h.datos).filter((x) => x.includes('.tmp-')), []);
});

test('la segunda instancia, en inglés, lo dice en inglés', async () => {
  const dicho = [];
  const a = await abrir();
  const b = await arrancar(ARGS, { ...process.env, SNF_IDIOMA: 'en' }, deps({ errores: (t) => dicho.push(t) }));
  assert.equal(b.codigo, 3);
  assert.deepEqual(dicho, ['SnetForever is already running']);
  await a.parar();
});

test('parar() no deja ningún .fuera y se puede llamar dos veces', async () => {
  const app = await abrir();
  await app.listo;
  await Promise.all([app.parar(), app.parar()]);
  await app.terminado;
  const fuera = readdirSync(join(h.addons, 'SnetForever', 'senales')).filter((x) => x.endsWith('.fuera'));
  assert.deepEqual(fuera, []);
});

test('--preparar da el resumen en JSON con ranurasCreadas: 20 y sale con 0, sin cerrojo', async () => {
  const salidas = [];
  const app = await arrancar(['--preparar'], process.env, deps({ salida: (t) => salidas.push(t) }));
  assert.equal(app.codigo, 0);
  const r = JSON.parse(salidas.join(''));
  assert.equal(r.ranurasCreadas, 20);
  assert.equal(r.timbresCreados, 7);
  assert.ok(!existsSync(join(h.datos, 'app.lock')));
  // Otra vez: ya no hay nada que crear.
  const otra = [];
  await arrancar(['--preparar'], process.env, deps({ salida: (t) => otra.push(t) }));
  assert.equal(JSON.parse(otra.join('')).ranurasCreadas, 0);
});

test('--preparar sin la carpeta de AddOns da un error en JSON y sale con 2', async () => {
  const salidas = [];
  const app = await arrancar(['--preparar'], { ...process.env, SNF_ADDONS: join(h.base, 'no-existe') }, deps({ salida: (t) => salidas.push(t) }));
  assert.equal(app.codigo, 2);
  assert.equal(JSON.parse(salidas.join('')).error, 'ADDONS');
});

test('un salir.peticion de antes del arranque se aparta y no cierra la app nueva', async () => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'salir.peticion'), 'vieja');
  const app = await abrir(ARGS, { intervalos: { peticion: 20 } });
  await app.listo;
  await esperar(120);
  assert.equal(existsSync(join(h.datos, 'salir.peticion')), false);
  // tarea 13, ronda 1 (Menor 8): la vieja también va a la cuarentena de datos, como la de la app en marcha
  const q = join(h.datos, 'cuarentena');
  assert.ok(readdirSync(q).some((d) => readdirSync(join(q, d)).includes('salir.peticion')), 'la vieja está en la cuarentena de datos');
  assert.equal(app.cerrada, false);
});

test('salir.peticion cierra la app (sin dejar ningún .fuera) y va a la cuarentena de datos', async () => {
  const app = await abrir(ARGS, { intervalos: { peticion: 20 } });
  await app.listo;
  writeFileSync(join(h.datos, 'salir.peticion'), 'cierra');
  await Promise.race([app.terminado, esperar(3000).then(() => { throw new Error('no se cerró'); })]);
  assert.equal(app.cerrada, true);
  assert.equal(existsSync(join(h.datos, 'salir.peticion')), false);
  const q = join(h.datos, 'cuarentena');
  assert.ok(readdirSync(q).some((d) => readdirSync(join(q, d)).includes('salir.peticion')), 'la petición está en la cuarentena de datos');
  assert.deepEqual(readdirSync(join(h.addons, 'SnetForever', 'senales')).filter((x) => x.endsWith('.fuera')), []);
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'app.lock'), 'utf8')).pid, 0, 'el cerrojo se soltó');
});

test('cada tanto comprueba los DOS motores; solo se publica (con timbre) si algo cambia', async () => {
  const llamadas = [];
  let claude = OK;
  const comprobar = {
    claude: async () => { llamadas.push('claude'); return claude; },
    codex: async () => { llamadas.push('codex'); return NO; },
  };
  const app = await abrir(ARGS, { comprobar, intervalos: { motores: 40 } });
  await app.listo;
  assert.ok(llamadas.includes('claude') && llamadas.includes('codex'));
  const antes = app.nucleo.estado().publicaciones;
  await hasta(() => llamadas.length >= 6); // varias vueltas sin cambios
  await app.nucleo.inactivo();
  assert.equal(app.nucleo.estado().publicaciones, antes, 'sin cambios no se vuelve a publicar');
  claude = { estado: 'sin_sesion' };
  await hasta(() => /claude\s*=\s*"sin_sesion"/.test(buzon(1)));
  assert.ok(app.nucleo.estado().publicaciones > antes);
});

// ---------- bandeja: menú y motor ----------

test('la acción salir del menú llama a parar: para la bandeja, suelta el cerrojo y termina', async () => {
  const f = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar });
  await app.listo;
  assert.ok(f.alMenu, 'se lanzó la bandeja');
  f.alMenu('salir');
  await app.terminado;
  assert.equal(f.paradas, 1);
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'app.lock'), 'utf8')).pid, 0);
});

test('la bandeja enseña el motor en uso y el juego; «Comprobar» pregunta a los dos motores', async () => {
  const f = bandejaFalsa();
  const llamadas = [];
  const comprobar = {
    claude: async () => { llamadas.push('claude'); return OK; },
    codex: async () => { llamadas.push('codex'); return NO; },
  };
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, comprobar });
  await app.listo;
  const ultimo = f.estados.at(-1);
  assert.equal(ultimo.texto, 'Motor: Claude Code listo (2.1.311)');
  assert.equal(ultimo.icono, 'ok');
  assert.equal(f.motores.at(-1), 'auto');
  const antes = llamadas.length;
  f.alMenu('comprobar');
  await hasta(() => llamadas.length >= antes + 2);
  assert.deepEqual(llamadas.slice(antes).sort(), ['claude', 'codex']);
});

test('elegir un motor en el menú guarda config.motor de forma atómica, marca la opción y vuelve a comprobar', async () => {
  const f = bandejaFalsa();
  const llamadas = [];
  const comprobar = {
    claude: async () => { llamadas.push('claude'); return OK; },
    codex: async () => { llamadas.push('codex'); return { estado: 'ok' }; },
  };
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'config.json'), JSON.stringify({ addons: h.addons, otra: 1 }));
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, comprobar });
  await app.listo;
  const antes = llamadas.length;
  f.alMenu('motor', 'codex');
  await hasta(() => f.motores.at(-1) === 'codex');
  await hasta(() => llamadas.length >= antes + 2);
  const cfg = JSON.parse(readFileSync(join(h.datos, 'config.json'), 'utf8'));
  assert.equal(cfg.motor, 'codex');
  assert.equal(cfg.otra, 1, 'lo demás de la config se conserva');
  assert.deepEqual(readdirSync(h.datos).filter((x) => x.includes('.tmp-')), []);
  await app.nucleo.inactivo();
  await hasta(() => /motorNombre\s*=\s*"codex"/.test(buzon(1)));
  assert.equal(f.estados.at(-1).texto, 'Motor: ChatGPT (Codex) listo');
  f.alMenu('motor', 'rarisimo'); // un valor que no es de la lista no cambia nada
  await esperar(50);
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'config.json'), 'utf8')).motor, 'codex');
});

test('guardarMotor: una config rota va a la cuarentena en vez de perderse', async () => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'config.json'), '{esto no es json');
  await guardarMotor(h.datos, 'claude', { entorno: process.env });
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'config.json'), 'utf8')).motor, 'claude');
  const q = join(h.datos, 'cuarentena');
  const dentro = readdirSync(q).flatMap((d) => readdirSync(join(q, d)));
  assert.ok(dentro.includes('config.json'));
  await assert.rejects(() => guardarMotor(h.datos, 'raro', { entorno: process.env }));
});

test('sin ningún motor listo, la bandeja lo dice y el icono es de error', async () => {
  const f = bandejaFalsa();
  const comprobar = { claude: async () => ({ estado: 'sin_sesion' }), codex: async () => NO };
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, comprobar });
  await app.listo;
  const e = f.estados.at(-1);
  assert.equal(e.texto, 'Ningún motor listo: Claude Code (sin sesión), ChatGPT/Codex (no instalado)');
  assert.equal(e.icono, 'error');
  assert.match(buzon(1), /claude\s*=\s*"sin_sesion"/);
});

test('si se crean carpetas de respuesta, sale el globo de reiniciar el juego', async () => {
  const f = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar });
  await app.listo;
  assert.deepEqual(f.globos, [{ titulo: 'SnetForever', texto: 'Se han creado las carpetas de respuesta: reinicia el juego para usarlas' }]);
  const g = bandejaFalsa();
  const otra = await abrir(['--sin-captura'], { lanzarBandeja: g.lanzar }, { ...process.env, SNF_DATOS: join(h.base, 'datos2') });
  await otra.listo;
  assert.deepEqual(g.globos, [], 'ya existían: sin globo');
  // Solo un .toc de ranura distinto (p. ej. otra interfaz): se reescribe y el globo dice «puesto al día», no «creado».
  // Con el juego cerrado según la captura (lote G, ronda 1: sin saberlo, se aplaza).
  writeFileSync(join(h.addons, 'SnetForever_R001', 'SnetForever_R001.toc'), '## Interface: 11200\n');
  const k = bandejaFalsa();
  const tercera = await abrir([], { lanzarBandeja: k.lanzar, lanzarCaptura: () => ({ parar() {}, estadoCaptura: () => ({ juego: false, minimizado: false, primerPlano: false, ultimaFranjaMs: null, error: null }) }) }, { ...process.env, SNF_DATOS: join(h.base, 'datos3') });
  await tercera.listo;
  assert.deepEqual(k.globos, [{ titulo: 'SnetForever', texto: 'Se han puesto al día las carpetas de respuesta: reinicia el juego para usarlas' }]);
});

// Lote G: AddOns como la dejó la 0.4.8, con las 100 ranuras (cada una en su grupo).
function cienRanurasViejas() {
  prepararAddOns(h.addons, { raizVolumen: h.raiz });
  for (let i = 1; i <= 100; i++) {
    const nombre = `SnetForever_R${String(i).padStart(3, '0')}`;
    mkdirSync(join(h.addons, nombre), { recursive: true });
    writeFileSync(join(h.addons, nombre, `${nombre}.toc`), `## Interface: 16001\n## Group: ${nombre}\n\nbuzon.lua\n`);
    writeFileSync(join(h.addons, nombre, 'buzon.lua'), 'SNF_BUZON = nil\n');
  }
}
const ranurasDeAddOns = () => readdirSync(h.addons).filter((x) => /^SnetForever_R\d{3}$/.test(x)).length;
const capturaCon = (juego) => () => ({ parar() {}, estadoCaptura: () => ({ juego, minimizado: false, primerPlano: false, ultimaFranjaMs: null, error: null }) });

test('lote G: con las 100 ranuras de antes y el juego cerrado, se quedan 20 y el globo dice «puestas al día»', async () => {
  cienRanurasViejas();
  const f = bandejaFalsa();
  const app = await abrir([], { lanzarBandeja: f.lanzar, lanzarCaptura: capturaCon(false) });
  await app.listo;
  assert.equal(ranurasDeAddOns(), 20);
  const tanda = readdirSync(join(h.raiz, '_CUARENTENA', 'SnetForever'));
  assert.equal(readdirSync(join(h.raiz, '_CUARENTENA', 'SnetForever', tanda[0])).filter((x) => /^SnetForever_R\d{3}$/.test(x)).length, 80);
  assert.match(readFileSync(join(h.addons, 'SnetForever_R001', 'SnetForever_R001.toc'), 'utf8'), /^## Group: SnetForever$/m);
  assert.deepEqual(f.globos, [{ titulo: 'SnetForever', texto: 'Se han puesto al día las carpetas de respuesta: reinicia el juego para usarlas' }]);
  for (let i = 1; i <= 20; i++) assert.match(buzon(i), /claude\s*=\s*"ok"/, `ranura ${i}`);
});

test('lote G: con el juego abierto (según la captura) no se aparta ninguna ranura ni hay globo', async () => {
  cienRanurasViejas();
  const f = bandejaFalsa();
  const app = await abrir([], { lanzarBandeja: f.lanzar, lanzarCaptura: capturaCon(true) });
  await app.listo;
  assert.equal(ranurasDeAddOns(), 100);
  assert.equal(existsSync(join(h.raiz, '_CUARENTENA')), false);
  assert.match(readFileSync(join(h.addons, 'SnetForever_R001', 'SnetForever_R001.toc'), 'utf8'), /^## Group: SnetForever_R001$/m);
  assert.deepEqual(f.globos, []);
});

// Lote G, ronda 1: una captura falsa que la prueba mueve. `poner('si' | 'no' | null)` cambia lo que da estadoCaptura y,
// con 'si' o 'no', lo avisa por alEstado (como el ayudante de verdad: primero el estado y después el aviso).
function capturaViva(juego) {
  const c = { juego, alEstado: null };
  c.lanzar = (o) => {
    c.alEstado = o.alEstado;
    return { parar() {}, estadoCaptura: () => ({ juego: c.juego, minimizado: false, primerPlano: c.juego === true, ultimaFranjaMs: null, error: null }) };
  };
  c.poner = (j) => {
    c.juego = j === 'si' ? true : j === 'no' ? false : null;
    if (j === 'si') c.alEstado({ t: 'estado', juego: 'si', exe: join(h.base, 'Wow.exe'), minimizado: false, primerPlano: true });
    else if (j === 'no') c.alEstado({ t: 'estado', juego: 'no' });
  };
  return c;
}
const tandas = () => (existsSync(join(h.raiz, '_CUARENTENA', 'SnetForever')) ? readdirSync(join(h.raiz, '_CUARENTENA', 'SnetForever')).length : 0);
const CREADAS = { titulo: 'SnetForever', texto: 'Se han creado las carpetas de respuesta: reinicia el juego para usarlas' };
const AL_DIA = { titulo: 'SnetForever', texto: 'Se han puesto al día las carpetas de respuesta: reinicia el juego para usarlas' };

test('lote G, ronda 1: al arrancar sin saber aún si el juego está abierto (juego: null) se aplaza; al decir «no», se hace una sola vez', async () => {
  cienRanurasViejas();
  rmSync(join(h.addons, 'SnetForever_R005'), { recursive: true });
  const c = capturaViva(null);
  const f = bandejaFalsa();
  const app = await abrir([], { lanzarBandeja: f.lanzar, lanzarCaptura: c.lanzar });
  await app.listo;
  // Sin saberlo, solo se crea lo que falta (inocuo): ni se aparta nada ni se reescribe ningún .toc.
  assert.equal(ranurasDeAddOns(), 100);
  assert.equal(tandas(), 0);
  assert.match(readFileSync(join(h.addons, 'SnetForever_R001', 'SnetForever_R001.toc'), 'utf8'), /^## Group: SnetForever_R001$/m);
  assert.match(readFileSync(join(h.addons, 'SnetForever_R005', 'SnetForever_R005.toc'), 'utf8'), /^## Group: SnetForever$/m);
  assert.deepEqual(f.globos, [CREADAS]);
  // La captura dice que el juego está cerrado: se hace lo aplazado.
  c.poner('no');
  assert.equal(ranurasDeAddOns(), 20);
  assert.equal(tandas(), 1);
  assert.match(readFileSync(join(h.addons, 'SnetForever_R001', 'SnetForever_R001.toc'), 'utf8'), /^## Group: SnetForever$/m);
  assert.deepEqual(f.globos, [CREADAS, AL_DIA]);
  // Más «no», o abrir y cerrar el juego otra vez: ya no queda nada aplazado.
  c.poner('no');
  c.poner('si');
  c.poner('no');
  assert.equal(tandas(), 1);
  assert.deepEqual(f.globos, [CREADAS, AL_DIA]);
});

test('lote G, ronda 1: con el juego abierto al arrancar se aplaza; si el ayudante muere (null) tampoco; al cerrarse el juego, sí', async () => {
  cienRanurasViejas();
  const c = capturaViva(true);
  const f = bandejaFalsa();
  const app = await abrir([], { lanzarBandeja: f.lanzar, lanzarCaptura: c.lanzar });
  await app.listo;
  assert.equal(ranurasDeAddOns(), 100);
  c.poner('si');
  c.poner(null); // el ayudante murió: no se sabe nada y no llega ningún aviso
  assert.equal(ranurasDeAddOns(), 100);
  assert.deepEqual(f.globos, []);
  c.poner('si');
  c.poner('no');
  assert.equal(ranurasDeAddOns(), 20);
  assert.deepEqual(f.globos, [AL_DIA]);
});

test('lote G, ronda 1: sin captura (--sin-captura) no se sabe si el juego está abierto: solo se crea lo que falta', async () => {
  cienRanurasViejas();
  const f = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar });
  await app.listo;
  assert.equal(ranurasDeAddOns(), 100);
  assert.equal(tandas(), 0);
  assert.deepEqual(f.globos, []);
});

test('la bandeja enseña el estado de la captura y su error en el tooltip', async () => {
  const f = bandejaFalsa();
  let alEstado;
  const estadoCaptura = { juego: false, minimizado: false, primerPlano: false, ultimaFranjaMs: null, error: null };
  const lanzarCaptura = (o) => {
    alEstado = o.alEstado;
    return { parar() {}, estadoCaptura: () => ({ ...estadoCaptura }) };
  };
  const app = await abrir([], { lanzarBandeja: f.lanzar, lanzarCaptura });
  await app.listo;
  assert.ok(f.estados.at(-1).lineas.includes('Juego: no encontrado'));
  const pone = (cambios, m) => {
    Object.assign(estadoCaptura, cambios);
    alEstado(m);
  };
  pone({ juego: true, minimizado: true }, { t: 'estado', juego: 'si', exe: 'x', minimizado: true, primerPlano: false });
  assert.ok(f.estados.at(-1).lineas.includes('Juego: minimizado'));
  pone({ minimizado: false, primerPlano: false }, { t: 'estado', juego: 'si', exe: 'x', minimizado: false, primerPlano: false });
  assert.ok(f.estados.at(-1).lineas.includes('Juego: en segundo plano'));
  pone({ primerPlano: true }, { t: 'estado', juego: 'si', exe: 'x', minimizado: false, primerPlano: true });
  assert.ok(f.estados.at(-1).lineas.includes('Juego: listo'));
  pone({ error: 'PowerShell no pudo arrancar' }, { t: 'estado', juego: 'si', exe: 'x', minimizado: false, primerPlano: true });
  assert.match(f.estados.at(-1).tooltip, /PowerShell no pudo arrancar/);
  assert.equal(f.estados.at(-1).icono, 'aviso');
});

test('si no se sabe la carpeta de AddOns, espera a que la captura dé el exe', async () => {
  const f = bandejaFalsa();
  let alEstado;
  const lanzarCaptura = (o) => {
    alEstado = o.alEstado;
    return { parar() {}, estadoCaptura: () => ({ juego: null, minimizado: false, primerPlano: false, ultimaFranjaMs: null, error: null }) };
  };
  const sinAddons = { ...process.env };
  delete sinAddons.SNF_ADDONS;
  const juego = join(h.base, 'juego');
  const addonsJuego = join(juego, 'Interface', 'AddOns');
  mkdirSync(join(addonsJuego, 'SnetForever'), { recursive: true });
  writeFileSync(join(addonsJuego, 'SnetForever', 'SnetForever.toc'), ['## Interface: 16001', '## Title: SnetForever', '', 'nucleo.lua', ''].join('\n'));
  const app = await abrir([], { lanzarBandeja: f.lanzar, lanzarCaptura, existe: () => false }, sinAddons);
  await esperar(100);
  assert.ok(f.estados.at(-1).texto.startsWith('AddOns: esperando') || f.estados.some((e) => e.texto.startsWith('AddOns: esperando')));
  alEstado({ t: 'estado', juego: 'si', exe: join(juego, 'Wow.exe'), minimizado: false, primerPlano: true });
  await app.listo;
  assert.match(readFileSync(join(addonsJuego, 'SnetForever_R001', 'buzon.lua'), 'utf8'), /claude\s*=\s*"ok"/);
});

// ---------- cerrojo ----------

test('cerrojo: un pid que no vive es un cerrojo viejo; uno vivo con otra hora de inicio, también', async () => {
  mkdirSync(h.datos, { recursive: true });
  const ruta = join(h.datos, 'app.lock');
  const inicio = 1_700_000_000_000;
  const caso = async (cerrojo, info) => {
    writeFileSync(ruta, JSON.stringify(cerrojo));
    return tomarCerrojo(h.datos, { pid: 5555, inicio, info });
  };
  assert.equal((await caso({ pid: 0, inicio: 0 }, () => { throw new Error('no se consulta'); })).ok, true, 'soltado');
  assert.equal((await caso({ pid: 777, inicio }, () => ({ vive: false }))).ok, true, 'pid muerto');
  assert.equal((await caso({ pid: 777, inicio }, () => ({ vive: true, nombre: 'chrome', inicio }))).ok, true, 'otro programa');
  assert.equal((await caso({ pid: 777, inicio }, () => ({ vive: true, nombre: 'node', inicio: inicio + 600_000 }))).ok, true, 'otra hora de inicio');
  const vivo = await caso({ pid: 777, inicio }, () => ({ vive: true, nombre: 'node', inicio: inicio + 800 }));
  assert.equal(vivo.ok, false);
  assert.equal(vivo.pid, 777);
  assert.equal((await caso({ pid: 777, inicio }, () => ({ vive: true }))).ok, false, 'no se puede saber: se trata como vivo');
  assert.equal((await caso({ pid: 777, inicio }, () => ({ vive: true, nombre: 'node.exe' }))).ok, false, 'node.exe vale');
  writeFileSync(ruta, 'basura');
  assert.equal((await tomarCerrojo(h.datos, { pid: 5555, inicio, info: () => ({ vive: true }) })).ok, true, 'ilegible: viejo');
});

test('cerrojo: el pid propio con su hora de inicio cuenta como vivo sin preguntar a nadie', async () => {
  const a = await tomarCerrojo(h.datos, { info: () => { throw new Error('no se consulta'); } });
  assert.equal(a.ok, true);
  const b = await tomarCerrojo(h.datos, { info: () => { throw new Error('no se consulta'); } });
  assert.equal(b.ok, false);
  await a.soltar();
  assert.equal((await tomarCerrojo(h.datos, { info: () => { throw new Error('no'); } })).ok, true);
});

test('infoProceso: el propio proceso es node y vive; un pid muerto, no', { skip: process.platform !== 'win32' }, () => {
  const yo = infoProceso(process.pid);
  assert.equal(yo.vive, true);
  assert.match(yo.nombre, /^node(\.exe)?$/i);
  assert.ok(Math.abs(yo.inicio - (Date.now() - process.uptime() * 1000)) < 10_000, `inicio ${yo.inicio}`);
  const hijo = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  assert.equal(infoProceso(Number(hijo.stdout)).vive, false);
});

// ---------- idioma, textos y probar-ia ----------

test('el idioma de la bandeja sale de Windows (Intl) o de SNF_IDIOMA', () => {
  assert.equal(idiomaDeWindows({ SNF_IDIOMA: 'en' }), 'en');
  assert.equal(idiomaDeWindows({ SNF_IDIOMA: 'es' }), 'es');
  const real = Intl.DateTimeFormat().resolvedOptions().locale;
  assert.equal(idiomaDeWindows({}), /^es\b/i.test(real) ? 'es' : 'en');
});

test('el idioma de la app sigue al del juego (textLocale de WTF\\Config.wtf) antes que al de Windows', () => {
  const config = { addons: 'E:\\wow\\World of Warcraft\\_forever_\\Interface\\AddOns' };
  const leidos = [];
  const leer = (texto) => (ruta) => {
    leidos.push(ruta);
    return texto;
  };
  assert.equal(idiomaDeLaApp({ env: {}, config, leer: leer('SET gxApi "D3D12"\nSET textLocale "esMX"\n') }), 'es');
  assert.equal(leidos[0], 'E:\\wow\\World of Warcraft\\_forever_\\WTF\\Config.wtf');
  assert.equal(idiomaDeLaApp({ env: {}, config, leer: leer('SET textLocale "esES"\r\n') }), 'es');
  assert.equal(idiomaDeLaApp({ env: {}, config, leer: leer('SET textLocale "enUS"\n') }), 'en');
  assert.equal(idiomaDeLaApp({ env: {}, config, leer: leer('SET textLocale "deDE"\n') }), 'en');
  // SNF_IDIOMA manda sobre el juego
  assert.equal(idiomaDeLaApp({ env: { SNF_IDIOMA: 'en' }, config, leer: leer('SET textLocale "esMX"\n') }), 'en');
  // sin Config.wtf, sin textLocale o sin carpeta del juego: el de Windows
  const windows = idiomaDeWindows({});
  const falla = () => {
    throw Object.assign(new Error('no está'), { code: 'ENOENT' });
  };
  assert.equal(idiomaDeLaApp({ env: {}, config, leer: falla }), windows);
  assert.equal(idiomaDeLaApp({ env: {}, config, leer: leer('SET gxApi "D3D12"\n') }), windows);
  assert.equal(idiomaDeLaApp({ env: {}, config: {}, leer: leer('SET textLocale "esMX"\n') }), windows);
  assert.equal(idiomaDeLaApp({ env: {}, config: null, leer: leer('SET textLocale "esMX"\n') }), windows);
});

test('los textos de la bandeja están en es y en con las mismas claves', () => {
  const claves = (o) => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v).map((x) => `${k}.${x}`) : [k]));
  assert.deepEqual(claves(TEXTOS_APP.es).sort(), claves(TEXTOS_APP.en).sort());
  assert.equal(TEXTOS_APP.es.menu.comprobar, 'Comprobar Claude Code / Codex');
  assert.equal(TEXTOS_APP.es.menu.automatico, 'Automático');
  assert.equal(TEXTOS_APP.es.menu.codex, 'ChatGPT (Codex)');
});

test('textoBandejaMotor: listo con versión, Codex, motor forzado sin sesión y ninguno listo', () => {
  const est = { claude: OK, codex: { estado: 'ok' } };
  assert.equal(textoBandejaMotor({ motor: 'claude' }, est), 'Motor: Claude Code listo (2.1.311)');
  assert.equal(textoBandejaMotor({ motor: 'codex' }, est), 'Motor: ChatGPT (Codex) listo');
  assert.equal(textoBandejaMotor({ motor: 'claude' }, est, 'en'), 'Engine: Claude Code ready (2.1.311)');
  assert.equal(textoBandejaMotor({ error: 'sin_sesion', motor: 'codex' }, { codex: { estado: 'sin_sesion' } }), 'Motor: ChatGPT (Codex): sin sesión');
  assert.equal(
    textoBandejaMotor({ error: 'sin_motor' }, { claude: { estado: 'pago_por_uso' }, codex: NO }),
    'Ningún motor listo: Claude Code (pago por uso), ChatGPT/Codex (no instalado)',
  );
});

test('probarIA: comprueba los dos y hace UNA pregunta mínima con el modelo rápido', async () => {
  const preguntas = [];
  const motor = {
    elegirMotor: (cfg, est, modelo) => ({ motor: 'claude', modelo }),
    preguntar: async (o) => { preguntas.push(o); return { ok: true, texto: 'OK', ms: 812, motor: 'claude' }; },
  };
  const comprobadas = [];
  const comprobar = {
    claude: async () => { comprobadas.push('claude'); return OK; },
    codex: async () => { comprobadas.push('codex'); return NO; },
  };
  const r = await probarIA({ config: {}, comprobar, motor });
  assert.deepEqual(r, { motor: 'claude', estado: 'ok', texto: 'OK', ms: 812 });
  assert.deepEqual(comprobadas.sort(), ['claude', 'codex']);
  assert.equal(preguntas.length, 1);
  assert.equal(preguntas[0].iaModelo, 'haiku');
  assert.equal(preguntas[0].entrada, 'Responde solo: OK');
});

test('probarIA: sin motor listo no pregunta; si la pregunta falla, lo cuenta', async () => {
  let preguntado = 0;
  const motorSin = {
    elegirMotor: () => ({ error: 'sin_motor' }),
    preguntar: async () => { preguntado++; return { ok: true, texto: 'x', ms: 1 }; },
  };
  const comprobar = { claude: async () => ({ estado: 'sin_sesion' }), codex: async () => NO };
  const r = await probarIA({ config: {}, comprobar, motor: motorSin });
  assert.equal(r.estado, 'sin_motor');
  assert.equal(r.motor, null);
  assert.equal(preguntado, 0);
  const motorFalla = {
    elegirMotor: () => ({ motor: 'codex', modelo: 'rapido' }),
    preguntar: async () => ({ ok: false, tipo: 'limite', detalle: 'límite', motor: 'codex' }),
  };
  const f = await probarIA({ config: {}, comprobar, motor: motorFalla });
  assert.equal(f.motor, 'codex');
  assert.equal(f.estado, 'limite');
  assert.equal(f.texto, 'límite');
});

// ---------- lanzarBandeja ----------

test('lanzarBandeja: lanza PowerShell con el script, estado() escribe la línea y el menú llama a alMenu', async () => {
  const hijo = hijoFalso();
  const lanzados = [];
  const menus = [];
  const b = lanzarBandeja({
    script: 'C:\\x\\bandeja.ps1',
    powershell: 'ps.exe',
    textos: { salir: 'Salir' },
    alMenu: (a, v) => menus.push([a, v]),
    lanzar: (cmd, args, op) => { lanzados.push({ cmd, args, op }); return hijo; },
  });
  assert.equal(lanzados.length, 1);
  assert.equal(lanzados[0].cmd, 'ps.exe');
  const a = lanzados[0].args;
  assert.ok(a.includes('-File') && a.includes('C:\\x\\bandeja.ps1'));
  assert.equal(a[a.indexOf('-PadrePid') + 1], String(process.pid));
  assert.deepEqual(JSON.parse(Buffer.from(a[a.indexOf('-Textos') + 1], 'base64').toString('utf8')), { salir: 'Salir' });
  assert.equal(lanzados[0].op.windowsHide, true);

  b.estado('Motor: Claude Code listo (2.1.311)', 'ok', { lineas: ['Juego: listo'] });
  b.globo('SnetForever', 'Hola');
  b.motor('codex');
  await esperar(20);
  assert.deepEqual(hijo.escrito[0], { t: 'estado', texto: 'Motor: Claude Code listo (2.1.311)', icono: 'ok', lineas: ['Juego: listo'], tooltip: 'Motor: Claude Code listo (2.1.311)' });
  assert.deepEqual(hijo.escrito[1], { t: 'globo', titulo: 'SnetForever', texto: 'Hola' });
  assert.deepEqual(hijo.escrito[2], { t: 'motor', valor: 'codex' });

  hijo.stdout.write('{"t":"listo"}\n{"t":"menu","accion":"comprobar"}\nno es json\n{"t":"menu","accion":"motor","valor":"claude"}\n{"t":"menu","accion":"salir"}\n');
  await esperar(20);
  assert.deepEqual(menus, [['comprobar', undefined], ['motor', 'claude'], ['salir', undefined]]);
  await b.parar();
});

test('lanzarBandeja: el tooltip no pasa de 63 caracteres', async () => {
  const hijo = hijoFalso();
  const b = lanzarBandeja({ lanzar: () => hijo });
  b.estado('x'.repeat(200), 'aviso', { tooltip: 'y'.repeat(200) });
  await esperar(20);
  assert.ok(hijo.escrito[0].tooltip.length <= 63);
  assert.equal(recortar('abc', 63), 'abc');
  assert.equal(recortar('a'.repeat(100), 63).length, 63);
  await b.parar();
});

test('lanzarBandeja: parar() manda salir, espera al ayudante y no lo vuelve a lanzar; si no sale, lo mata por su PID', async () => {
  let lanzados = 0;
  const hijo = hijoFalso();
  const b = lanzarBandeja({ lanzar: () => { lanzados++; return hijo; }, esperas: [5] });
  await b.parar();
  assert.deepEqual(hijo.escrito.at(-1), { t: 'salir' });
  assert.equal(hijo.matado, false);
  await esperar(40);
  assert.equal(lanzados, 1, 'tras parar no se relanza');

  const terco = hijoFalso({ saleSolo: false });
  const c = lanzarBandeja({ lanzar: () => terco, esperaSalida: 20 });
  await c.parar();
  assert.equal(terco.matado, true);
});

test('lanzarBandeja: si el ayudante muere solo, se vuelve a lanzar y se le repite el último estado', async () => {
  const hijos = [];
  const b = lanzarBandeja({ lanzar: () => { const x = hijoFalso(); hijos.push(x); return x; }, esperas: [5, 5, 5] });
  b.estado('uno', 'ok');
  b.motor('claude');
  await esperar(20);
  hijos[0].emit('close', 1);
  await hasta(() => hijos.length === 2);
  await esperar(20);
  assert.equal(hijos[1].escrito[0].texto, 'uno');
  assert.deepEqual(hijos[1].escrito[1], { t: 'motor', valor: 'claude' });
  await b.parar();
});

// ---------- el ayudante de verdad y el .vbs ----------

test('bandeja.ps1 -Prueba escribe «listo» y «entradas_listas» (n ≥ 10) y sale con 0 en menos de 15 s', { skip: process.platform !== 'win32' }, () => {
  const t0 = Date.now();
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', SCRIPT_BANDEJA, '-PadrePid', String(process.pid), '-Prueba'], {
    encoding: 'utf8', windowsHide: true, timeout: 15_000,
  });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.ok(Date.now() - t0 < 15_000);
  const lineas = r.stdout.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  assert.deepEqual(lineas[0], { t: 'listo' });
  assert.equal(lineas.length, 2);
  assert.equal(lineas[1].t, 'entradas_listas');
  assert.ok(Number.isInteger(lineas[1].n) && lineas[1].n >= 10, JSON.stringify(lineas[1]));
  // S8: sin el puente con TATI, el «Cerebro» y el complemento están ocultos y no cuentan: las mismas 23 de antes
  assert.equal(lineas[1].n, 23, JSON.stringify(lineas[1]));
});

// S8: con -PruebaMensajes (líneas JSON en base64), el -Prueba las aplica antes de contar.
function pruebaBandeja(mensajes, textos) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', SCRIPT_BANDEJA, '-Prueba'];
  if (textos) args.push('-Textos', Buffer.from(JSON.stringify(textos), 'utf8').toString('base64'));
  if (mensajes) args.push('-PruebaMensajes', Buffer.from(mensajes.map((m) => JSON.stringify(m)).join('\n'), 'utf8').toString('base64'));
  const r = spawnSync(POWERSHELL, args, { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.equal(r.stderr.trim(), '');
  return r.stdout.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

test('S8: bandeja.ps1: «cerebro» con visible enseña el submenú «Cerebro» (2 opciones) y el complemento; con false, vuelven a ocultarse', { skip: process.platform !== 'win32' }, () => {
  const visible = pruebaBandeja([{ t: 'cerebro', visible: true, valor: 'tati' }], TEXTOS_APP.es.menu);
  assert.deepEqual(visible.at(-1), { t: 'entradas_listas', n: 27 });
  const oculto = pruebaBandeja([{ t: 'cerebro', visible: true, valor: 'tati' }, { t: 'cerebro', visible: false, valor: 'snetforever' }]);
  assert.deepEqual(oculto.at(-1), { t: 'entradas_listas', n: 23 });
  assert.deepEqual(pruebaBandeja([{ t: 'motor', valor: 'claude' }], TEXTOS_APP.en.menu).at(-1), { t: 'entradas_listas', n: 23 });
});

test('S8: bandeja.ps1 es solo ASCII y el puente con TATI no se ve hasta el mensaje «cerebro»', () => {
  const ps1 = readFileSync(SCRIPT_BANDEJA);
  assert.ok(ps1.every((b) => b < 0x80), 'solo ASCII');
  const texto = ps1.toString('latin1');
  assert.match(texto, /\$itemCerebro\.Visible = \$false/);
  assert.match(texto, /\$itemComplemento\.Visible = \$false/);
  assert.match(texto, /accion = 'complemento_tati'/);
  assert.match(texto, /accion = 'cerebro'; valor = /);
});

test('bandeja.ps1 -Prueba con textos: el menú los usa (sin errores)', { skip: process.platform !== 'win32' }, () => {
  const textos = Buffer.from(JSON.stringify(TEXTOS_APP.es.menu), 'utf8').toString('base64');
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', SCRIPT_BANDEJA, '-Prueba', '-Textos', textos], {
    encoding: 'utf8', windowsHide: true, timeout: 15_000,
  });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.equal(r.stderr.trim(), '');
});

test('SnetForever.vbs arranca node sin ventana: primero el portátil de la app y si no, el del PATH', () => {
  const vbs = readFileSync(join(AQUI, '..', 'SnetForever.vbs'), 'latin1');
  assert.match(vbs, /node\\node\.exe/);
  assert.match(vbs, /src\\principal\.mjs/);
  assert.match(vbs, /, 0, False/);
  assert.match(vbs, /FileExists/);
});

// ---------- ronda 1 (Ruling F4-36) ----------

test('cerrojo: un pid reutilizado por un proceso protegido (svchost, sin hora de inicio) es un cerrojo viejo', async () => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'app.lock'), JSON.stringify({ pid: 777, inicio: 1_700_000_000_000 }));
  const r = await tomarCerrojo(h.datos, { pid: 5555, inicio: 1_700_000_000_000, info: () => ({ vive: true, nombre: 'svchost' }) });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'app.lock'), 'utf8')).pid, 5555);
  assert.ok(readdirSync(h.datos).some((x) => x.startsWith('app.lock.viejo-')), 'el viejo se aparta, no se borra');
});

test('infoProceso: el nombre se lee aunque el inicio no (proceso protegido) y un pid protegido real da su nombre', () => {
  assert.deepEqual(infoProceso(process.pid, { consultar: () => 'svchost|' }), { vive: true, nombre: 'svchost' });
  const con = infoProceso(process.pid, { consultar: () => 'node|2026-11-10T12:00:00.1234567Z' });
  assert.equal(con.nombre, 'node');
  assert.equal(con.inicio, Date.parse('2026-11-10T12:00:00.123Z'));
  if (process.platform === 'win32') assert.equal(infoProceso(4).nombre, 'System');
});

test('cerrojo: tomarCerrojo a la vez sobre uno soltado: exactamente uno gana', async () => {
  mkdirSync(h.datos, { recursive: true });
  const info = (p) => ({ vive: [1001, 1002, 1003].includes(p), nombre: 'node', inicio: 1_700_000_000_000 });
  const intento = (pid) => tomarCerrojo(h.datos, { pid, inicio: 1_700_000_000_000, info });
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    writeFileSync(join(h.datos, 'app.lock'), JSON.stringify({ pid: 0, inicio: 0 }));
    const rs = await Promise.all([intento(1001), intento(1002), intento(1003)]);
    assert.equal(rs.filter((r) => r.ok).length, 1, `vuelta ${vuelta}`);
  }
});

test('cerrojo: quien aparta un cerrojo que otro acaba de cambiar por uno vivo lo devuelve y pierde', async () => {
  mkdirSync(h.datos, { recursive: true });
  const ruta = join(h.datos, 'app.lock');
  writeFileSync(ruta, JSON.stringify({ pid: 0, inicio: 0 }));
  // Se lee el soltado, pero justo antes del renombrado otro lo cambia por uno vivo.
  const fs = {
    ...nodeFs,
    renameSync(de, a) {
      if (de === ruta) writeFileSync(ruta, JSON.stringify({ pid: 4242, inicio: 1 }));
      return nodeFs.renameSync(de, a);
    },
  };
  const r = await tomarCerrojo(h.datos, { fs, pid: 5555, inicio: 2, info: () => ({ vive: true, nombre: 'node', inicio: 1 }) });
  assert.equal(r.ok, false);
  assert.equal(JSON.parse(readFileSync(ruta, 'utf8')).pid, 4242, 'el cerrojo vivo vuelve a su sitio');
});

test('cerrojo: pasados 20 app.lock.viejo-*, los más antiguos van a la cuarentena de datos', async () => {
  mkdirSync(h.datos, { recursive: true });
  for (let i = 0; i < MAX_LOCK_VIEJOS + 5; i++) writeFileSync(join(h.datos, `app.lock.viejo-2026-01-${String(i).padStart(2, '0')}`), '{}');
  writeFileSync(join(h.datos, 'app.lock'), JSON.stringify({ pid: 0, inicio: 0 }));
  const r = await tomarCerrojo(h.datos, { pid: 5555, inicio: 1, info: () => ({ vive: false }), entorno: { ...process.env, SNF_DATOS: h.datos } });
  assert.equal(r.ok, true);
  const quedan = readdirSync(h.datos).filter((x) => x.startsWith('app.lock.viejo-'));
  assert.equal(quedan.length, MAX_LOCK_VIEJOS);
  const q = join(h.datos, 'cuarentena');
  const movidos = readdirSync(q).flatMap((d) => readdirSync(join(q, d)));
  assert.equal(movidos.length, 6);
  assert.ok(movidos.includes('app.lock.viejo-2026-01-00'));
});

test('lanzarBandeja: tras 5 fallos seguidos no se rinde: pasa a la espera larga', async () => {
  const hijos = [];
  const b = lanzarBandeja({ lanzar: () => { const x = hijoFalso(); hijos.push(x); return x; }, esperas: [1], esperaLarga: 80 });
  for (let i = 1; i <= 6; i++) {
    await hasta(() => hijos.length === i);
    hijos[i - 1].emit('close', 1);
  }
  await esperar(30);
  assert.equal(hijos.length, 6, 'tras 5 relanzamientos fallidos, el siguiente espera la espera larga');
  await hasta(() => hijos.length === 7, 1000);
  await b.parar();
});

test('abrirRuta: carpeta con /root,"<ruta>" y archivo con /select, con comillas explícitas y una coma en la ruta', () => {
  const llamadas = [];
  const lanzar = (cmd, args, op) => {
    llamadas.push({ cmd, args, op });
    return { on() {}, unref() {} };
  };
  abrirRuta('C:\\Datos, con coma\\SnetForever', { lanzar, esArchivo: () => false });
  abrirRuta('C:\\Datos, con coma\\registro.log', { lanzar, esArchivo: () => true });
  abrirRuta('C:\\mal"nombre', { lanzar });
  assert.equal(llamadas.length, 2, 'una ruta con comillas no se abre');
  assert.match(llamadas[0].cmd, /explorer\.exe$/i);
  assert.deepEqual(llamadas[0].args, ['/root,"C:\\Datos, con coma\\SnetForever"']);
  assert.equal(llamadas[0].op.windowsVerbatimArguments, true);
  assert.deepEqual(llamadas[1].args, ['/select,"C:\\Datos, con coma\\registro.log"']);
});

test('los textos P6 mandan a «Comprobar Claude Code / Codex», como el menú', () => {
  for (const idioma of ['es', 'en']) {
    const etiqueta = TEXTOS_APP[idioma].menu.comprobar;
    for (const tabla of [ERRORES[idioma]]) { // las de Codex no nombran a Claude (otra prueba)
      for (const [k, texto] of Object.entries(tabla)) {
        if (/Comprobar|Check /.test(texto)) assert.ok(texto.includes(etiqueta), `${idioma}.${k}: ${texto}`);
      }
    }
  }
  assert.ok(ERRORES.es.sin_sesion.includes('«Comprobar Claude Code / Codex»'));
  assert.ok(ERRORES.en.sin_sesion.includes('"Check Claude Code / Codex"'));
});

test('el tooltip con ningún motor listo empieza por los dos motores en forma corta y cabe en 63', async () => {
  const f = bandejaFalsa();
  const comprobar = { claude: async () => ({ estado: 'sin_sesion' }), codex: async () => NO };
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, comprobar });
  await app.listo;
  const tip = f.estados.at(-1).tooltip;
  assert.equal(tip, 'Claude: sin sesión · Codex: no instalado');
  assert.ok(tip.length <= 63);
  const peor = textoMotorCorto({ error: 'sin_motor' }, { claude: { estado: 'desconocido' }, codex: { estado: 'desconocido' } });
  assert.ok(peor.length <= 63, peor);
  assert.equal(textoMotorCorto({ motor: 'claude' }, { claude: OK }), 'Motor: Claude Code listo');
});

test('auto con claude sin instalar y codex listo: la bandeja dice «Motor: ChatGPT (Codex) listo»', async () => {
  const f = bandejaFalsa();
  const comprobar = { claude: async () => NO, codex: async () => ({ estado: 'ok' }) };
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, comprobar });
  await app.listo;
  assert.equal(f.estados.at(-1).texto, 'Motor: ChatGPT (Codex) listo');
  assert.equal(f.estados.at(-1).icono, 'ok');
  assert.match(buzon(1), /motorNombre\s*=\s*"codex"/);
  assert.match(buzon(20), /claude\s*=\s*"sin_instalar"/);
});

test('al arrancar se comprueba cada motor UNA vez y se publica esa comprobación', async () => {
  const llamadas = [];
  const comprobar = {
    claude: async () => { llamadas.push('claude'); return OK; },
    codex: async () => { llamadas.push('codex'); return NO; },
  };
  const app = await abrir(ARGS, { comprobar });
  await app.listo;
  assert.deepEqual(llamadas.sort(), ['claude', 'codex']);
  assert.equal(app.nucleo.estado().publicaciones, 1);
});

test('parar() devuelve su timbre aunque el pulso de vida esté a medias', async () => {
  const app = await abrir();
  await app.listo;
  const senales = join(h.addons, 'SnetForever', 'senales');
  await hasta(() => readdirSync(senales).some((x) => x.endsWith('.fuera')), 2000);
  await app.parar();
  assert.deepEqual(readdirSync(senales).filter((x) => x.endsWith('.fuera')), []);
  assert.equal(readdirSync(senales).filter((x) => x.endsWith('.wav')).length, 7);
});

test('si los AddOns del exe de la captura no valen, vuelve a intentarlo cuando la captura da otro exe', async () => {
  const f = bandejaFalsa();
  let alEstado;
  const lanzarCaptura = (o) => {
    alEstado = o.alEstado;
    return { parar() {}, estadoCaptura: () => ({ juego: true, minimizado: false, primerPlano: true, ultimaFranjaMs: null, error: null }) };
  };
  const sinAddons = { ...process.env };
  delete sinAddons.SNF_ADDONS;
  const malo = join(h.base, 'malo');
  const bueno = join(h.base, 'bueno');
  mkdirSync(join(malo, 'Interface', 'AddOns'), { recursive: true }); // sin SnetForever dentro
  mkdirSync(join(bueno, 'Interface', 'AddOns', 'SnetForever'), { recursive: true });
  writeFileSync(join(bueno, 'Interface', 'AddOns', 'SnetForever', 'SnetForever.toc'), ['## Interface: 16001', '', 'nucleo.lua', ''].join('\n'));
  const app = await abrir([], { lanzarBandeja: f.lanzar, lanzarCaptura, existe: () => false }, sinAddons);
  alEstado({ t: 'estado', juego: 'si', exe: join(malo, 'Wow.exe'), minimizado: false, primerPlano: true });
  await hasta(() => f.estados.some((e) => e.texto.startsWith('AddOns: carpeta no válida')));
  alEstado({ t: 'estado', juego: 'si', exe: join(bueno, 'Wow.exe'), minimizado: false, primerPlano: true });
  await app.listo;
  assert.match(readFileSync(join(bueno, 'Interface', 'AddOns', 'SnetForever_R001', 'buzon.lua'), 'utf8'), /claude\s*=\s*"ok"/);
  assert.equal(f.estados.at(-1).icono, 'ok');
});

test('si los AddOns no valen y la captura no da otro exe, se vuelve a intentar pasado un rato', async () => {
  const f = bandejaFalsa();
  const hueco = join(h.base, 'hueco');
  mkdirSync(hueco, { recursive: true });
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, intervalos: { reintentoAddons: 40 } }, { ...process.env, SNF_ADDONS: hueco });
  await hasta(() => f.estados.some((e) => e.texto.startsWith('AddOns: carpeta no válida')));
  mkdirSync(join(hueco, 'SnetForever'), { recursive: true });
  writeFileSync(join(hueco, 'SnetForever', 'SnetForever.toc'), ['## Interface: 16001', '', 'nucleo.lua', ''].join('\n'));
  await app.listo;
  assert.match(readFileSync(join(hueco, 'SnetForever_R001', 'buzon.lua'), 'utf8'), /claude\s*=\s*"ok"/);
});

// Revisión final, Minor 1: un fallo de iniciar() después de la bandeja no puede dejarla «verde» sin hacer nada.
test('si iniciar() falla después de la bandeja, la bandeja lo enseña con el icono de error y el registro lo apunta', async () => {
  const f = bandejaFalsa();
  const lanzarCaptura = () => { throw Object.assign(new Error('sin powershell'), { code: 'ENOENT' }); };
  const app = await abrir([], { lanzarBandeja: f.lanzar, lanzarCaptura });
  await app.listo;
  const e = f.estados.at(-1);
  assert.equal(e.texto, TEXTOS_APP.es.arranqueFallo('ENOENT'));
  assert.equal(e.icono, 'error');
  assert.match(e.texto, /ENOENT/);
  assert.doesNotMatch(e.texto, /sin powershell/, 'el mensaje del error no llega a la bandeja, solo su código');
  const registro = readFileSync(join(h.datos, 'registro.log'), 'utf8');
  assert.match(registro, /\[error\] arranque: ENOENT/);
  assert.equal(TEXTOS_APP.en.arranqueFallo('X'), 'SnetForever could not start (X): see the log');
});

test('ronda 1 del lote B: si faltan archivos de la app en los datos, lo apunta en el registro y lo dice la bandeja', async () => {
  const incompleta = join(h.base, 'base-incompleta');
  mkdirSync(incompleta);
  copyFileSync(join(AQUI, 'fixtures', 'misiones-app.lua'), join(incompleta, 'misiones-app.lua'));
  writeFileSync(join(incompleta, 'app.toc'), ['## Interface: 16001', '## X-SNF-App: item_1.lua', '', 'misiones-app.lua', ''].join('\n'));
  const f = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar }, { ...process.env, SNF_BASE: incompleta });
  await app.listo;
  const hayGlobo = () => f.globos.some((g) => g.texto === TEXTOS_APP.es.baseIncompleta);
  for (let i = 0; i < 100 && !hayGlobo(); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(hayGlobo(), JSON.stringify(f.globos));
  const ultimo = f.estados.at(-1);
  assert.ok([ultimo.texto, ...(ultimo.lineas ?? [])].includes(TEXTOS_APP.es.baseIncompleta), JSON.stringify(ultimo));
  assert.notEqual(ultimo.icono, 'ok');
  const registro = readFileSync(join(h.datos, 'registro.log'), 'utf8');
  assert.match(registro, /\[aviso\] base: faltan archivos de la app \(item_1\.lua\)/);
});

// ---------- fase 5, tarea 13: actualizaciones, avisos de fallo y primer arranque ----------
// Todo con falsos: el juego (sin PowerShell), el actualizador (sin red), la propia app (sin wscript), el navegador, el
// Explorador y el portapapeles; y un reloj falso para los 120 s, las 24 h, el minuto y los 10 min.

// Un juego falso (como el de cli.test.js): `abierto` = la ruta de un Wow.exe abierto (o null); `falla`: consultar lanza;
// `registro`: los InstallPath que da consultar('registro'). Se puede cambiar a mitad de prueba.
function juegoFalso({ abierto = null, falla = false, registro = [] } = {}) {
  const j = { abierto, falla, registro, llamadas: [] };
  j.consultar = async (que) => {
    j.llamadas.push(que);
    if (j.falla) throw new Error('PowerShell no contestó');
    if (que === 'procesos') return j.abierto ? [{ pid: 4242, ruta: j.abierto }] : [];
    return que === 'registro' ? j.registro : [];
  };
  return j;
}

// Un actualizador falso: `crear(opciones)` hace de crearActualizador (y guarda las opciones); cada paso apunta su llamada
// y da lo que diga el guion. Un «aplicado» llama a alAplicar, como el de verdad.
function actualizadorFalso(guion = {}) {
  const f = { llamadas: [], opciones: null };
  f.guion = { comprobar: () => ({ estado: 'sin_novedades' }), descargar: () => ({ estado: 'nada' }), aplicar: () => ({ estado: 'nada' }), estado: () => ({}), ...guion };
  f.crear = (opciones) => {
    f.opciones = opciones;
    return {
      comprobar: async () => { f.llamadas.push('comprobar'); return f.guion.comprobar(); },
      descargar: async () => { f.llamadas.push('descargar'); return f.guion.descargar(); },
      aplicarSiSePuede: async () => {
        f.llamadas.push('aplicar');
        const r = await f.guion.aplicar();
        if (r.estado === 'aplicado') await opciones.alAplicar?.(r.aplicados);
        return r;
      },
      estado: () => f.guion.estado(),
    };
  };
  f.veces = (que) => f.llamadas.filter((x) => x === que).length;
  return f;
}

// Un reloj falso para los temporizadores de la tarea 13: nada pasa hasta `avanzar(ms)`, que dispara en orden lo que toque.
function relojFalso() {
  const r = { ms: 0, tareas: [], n: 0 };
  const poner = (fn, ms, cada) => {
    const t = { id: ++r.n, en: r.ms + Math.max(0, ms), fn, cada };
    r.tareas.push(t);
    return t.id;
  };
  const quitar = (id) => { r.tareas = r.tareas.filter((t) => t.id !== id); };
  r.setTimeout = (fn, ms) => poner(fn, ms, null);
  r.setInterval = (fn, ms) => poner(fn, ms, ms);
  r.clearTimeout = quitar;
  r.clearInterval = quitar;
  r.avanzar = async (ms) => {
    const fin = r.ms + ms;
    for (;;) {
      const t = r.tareas.filter((x) => x.en <= fin).sort((a, b) => a.en - b.en || a.id - b.id)[0];
      if (!t) break;
      r.ms = t.en;
      if (t.cada) t.en += t.cada;
      else quitar(t.id);
      t.fn();
      await new Promise((ok) => setImmediate(ok));
    }
    r.ms = fin;
    await new Promise((ok) => setImmediate(ok));
  };
  return r;
}

const DIA = 24 * 3600_000;
const ACT = TEXTOS_APP.es.actualizacion;

// Un juego de prueba con su Wow.exe: `<base>\World of Warcraft\_forever_\Interface\AddOns\SnetForever`.
function juegoDePrueba() {
  const raiz = join(h.base, 'World of Warcraft', '_forever_');
  const addons = join(raiz, 'Interface', 'AddOns');
  mkdirSync(join(addons, 'SnetForever'), { recursive: true });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Interface: 16001\n## Title: SnetForever\n\nnucleo.lua\n');
  writeFileSync(join(raiz, 'Wow.exe'), '');
  return { raiz, addons };
}

test('tarea 13: comprueba a los 120 s una vez y después cada 24 h; aplicarSiSePuede cada 60 s', async () => {
  const reloj = relojFalso();
  const f = actualizadorFalso();
  const app = await abrir(ARGS, { reloj, actualizador: f.crear });
  await app.listo;
  assert.equal(f.opciones.addonsDir, h.addons);
  assert.equal(typeof f.opciones.juegoAbierto, 'function');
  assert.equal(f.opciones.aplicarApp, undefined, 'sin instalación (esInstalada falso) no se pasa aplicarApp');
  assert.equal(f.veces('comprobar'), 0);
  await reloj.avanzar(119_999);
  assert.equal(f.veces('comprobar'), 0);
  await reloj.avanzar(1);
  assert.equal(f.veces('comprobar'), 1);
  await reloj.avanzar(DIA - 1);
  assert.equal(f.veces('comprobar'), 1);
  await reloj.avanzar(1);
  assert.equal(f.veces('comprobar'), 2);
  assert.ok(f.veces('aplicar') >= 1440, `aplicar: ${f.veces('aplicar')}`);
});

test('Task 8, ronda 1: la primera vez que arranca tras actualizarse a sí misma comprueba a los 10 s; la siguiente, a los 120 s', async () => {
  // previa.txt = la versión que corría antes de actualizarse (la pone aplicarApp): menor que la de ahora
  mkdirSync(join(h.base, 'instalacion'), { recursive: true });
  writeFileSync(join(h.base, 'instalacion', 'previa.txt'), '0.6.1');
  const reloj = relojFalso();
  const f = actualizadorFalso();
  const app = await abrir(ARGS, { reloj, actualizador: f.crear });
  await app.listo;
  await reloj.avanzar(9_999);
  assert.equal(f.veces('comprobar'), 0);
  await reloj.avanzar(1);
  assert.equal(f.veces('comprobar'), 1, 'recién actualizada: a los 10 s, no a los 120 s');
  await app.parar();
  // otro arranque con la misma versión: ya no es «recién actualizada»
  const reloj2 = relojFalso();
  const f2 = actualizadorFalso();
  const app2 = await abrir(ARGS, { reloj: reloj2, actualizador: f2.crear });
  await app2.listo;
  await reloj2.avanzar(119_999);
  assert.equal(f2.veces('comprobar'), 0);
  await reloj2.avanzar(1);
  assert.equal(f2.veces('comprobar'), 1);
});

test('Task 8, ronda 1: sin previa.txt, o con una previa que no es anterior, la primera comprobación sigue a los 120 s', async () => {
  mkdirSync(join(h.base, 'instalacion'), { recursive: true });
  writeFileSync(join(h.base, 'instalacion', 'previa.txt'), VERSION);
  const reloj = relojFalso();
  const f = actualizadorFalso();
  const app = await abrir(ARGS, { reloj, actualizador: f.crear });
  await app.listo;
  await reloj.avanzar(119_999);
  assert.equal(f.veces('comprobar'), 0);
  await reloj.avanzar(1);
  assert.equal(f.veces('comprobar'), 1);
});

// Task 8, ronda 2: con el núcleo 0.7.0 y sin SnetForever_Comercio, un fallo al comprobar se reintenta a los 5 min, no a las 24 h.
function nucleoInstalado(version, { comercio = false } = {}) {
  writeFileSync(join(h.addons, 'SnetForever', 'SnetForever.toc'), `## Interface: 16001\n## Title: SnetForever\n## Version: ${version}\n\nnucleo.lua\n`);
  if (comercio) {
    mkdirSync(join(h.addons, 'SnetForever_Comercio'), { recursive: true });
    writeFileSync(join(h.addons, 'SnetForever_Comercio', 'SnetForever_Comercio.toc'), `## Title: Comercio\n## Version: ${version}\n`);
  }
}

test('Task 8, ronda 2: sin red y sin SnetForever_Comercio (con el núcleo 0.7.0), la siguiente comprobación queda a 5 min', async () => {
  nucleoInstalado('0.7.0');
  const reloj = relojFalso();
  const f = actualizadorFalso({ comprobar: () => ({ estado: 'error', codigo: 'conexion' }) });
  const app = await abrir(ARGS, { reloj, actualizador: f.crear });
  await app.listo;
  await reloj.avanzar(120_000);
  assert.equal(f.veces('comprobar'), 1);
  await reloj.avanzar(5 * 60_000 - 1);
  assert.equal(f.veces('comprobar'), 1);
  await reloj.avanzar(1);
  assert.equal(f.veces('comprobar'), 2, 'reintento a los 5 min');
  await reloj.avanzar(10 * 60_000);
  assert.equal(f.veces('comprobar'), 3, 'y sigue, cada vez más espaciado (10 min), mientras falle y falte el comercio');
});

test('Task 8, ronda 2: con el comercio puesto (o con un núcleo anterior a la 0.7.0), un fallo espera a las 24 h', async () => {
  for (const [version, comercio] of [['0.7.0', true], ['0.6.4', false]]) {
    nucleoInstalado(version, { comercio });
    const reloj = relojFalso();
    const f = actualizadorFalso({ comprobar: () => ({ estado: 'error', codigo: 'conexion' }) });
    const app = await abrir(ARGS, { reloj, actualizador: f.crear });
    await app.listo;
    await reloj.avanzar(120_000);
    assert.equal(f.veces('comprobar'), 1);
    await reloj.avanzar(10 * 60_000);
    assert.equal(f.veces('comprobar'), 1, `${version}: sin reintento pronto`);
    await reloj.avanzar(DIA);
    assert.equal(f.veces('comprobar'), 2, `${version}: a las 24 h`);
    await app.parar();
  }
});

test('Task 8, ronda 2: cuando el comercio llega, vuelve el ritmo normal (el reintento pronto se acaba)', async () => {
  nucleoInstalado('0.7.0');
  const reloj = relojFalso();
  let falla = true;
  const f = actualizadorFalso({ comprobar: () => (falla ? { estado: 'error', codigo: 'conexion' } : { estado: 'sin_novedades' }) });
  const app = await abrir(ARGS, { reloj, actualizador: f.crear });
  await app.listo;
  await reloj.avanzar(120_000);
  nucleoInstalado('0.7.0', { comercio: true }); // llegó por otro lado
  await reloj.avanzar(5 * 60_000);
  assert.equal(f.veces('comprobar'), 2);
  await reloj.avanzar(30 * 60_000);
  assert.equal(f.veces('comprobar'), 2, 'con el comercio ya puesto no se insiste');
});

// Ronda 3: el reintento pronto solo es para fallos pasajeros y se espacia cada vez más.
const HAY = { estado: 'hay', lista: [{ componente: 'comercio', de: null, a: '0.7.0' }] };
// Una app con el núcleo 0.7.0 sin comercio, cuyo actualizador devuelve `comprobar()` y `descargar()` del guion; avanza `min` minutos
// y dice cuántas comprobaciones hubo.
async function conFallo(guion) {
  nucleoInstalado('0.7.0');
  const reloj = relojFalso();
  const f = actualizadorFalso(guion);
  const app = await abrir(ARGS, { reloj, actualizador: f.crear });
  await app.listo;
  await reloj.avanzar(120_000);
  return { reloj, f, app };
}
const MIN = 60_000;

test('Task 8, ronda 3: un fallo de descargar con «conexion» (o «tiempo», o un HTTP 5xx) reintenta a los 5 min', async () => {
  for (const fallo of [{ codigo: 'conexion' }, { codigo: 'tiempo' }, { codigo: 'estado', http: 503 }]) {
    const { reloj, f, app } = await conFallo({ comprobar: () => HAY, descargar: () => ({ estado: 'error', ...fallo }) });
    assert.equal(f.veces('comprobar'), 1);
    await reloj.avanzar(5 * MIN - 1);
    assert.equal(f.veces('comprobar'), 1, JSON.stringify(fallo));
    await reloj.avanzar(1);
    assert.equal(f.veces('comprobar'), 2, `${JSON.stringify(fallo)}: reintento a los 5 min`);
    await app.parar();
  }
});

test('Task 8, ronda 3: un 404, un SHA o tamaño malos en descargar no reintentan pronto (ritmo de 24 h)', async () => {
  for (const fallo of [{ codigo: 'estado', http: 404 }, { codigo: 'estado' }, { codigo: 'hash' }, { codigo: 'tamano' }, { codigo: 'version' }]) {
    const { reloj, f, app } = await conFallo({ comprobar: () => HAY, descargar: () => ({ estado: 'error', ...fallo }) });
    await reloj.avanzar(60 * MIN);
    assert.equal(f.veces('comprobar'), 1, `${JSON.stringify(fallo)}: sin reintento pronto`);
    await reloj.avanzar(DIA);
    assert.equal(f.veces('comprobar'), 2, `${JSON.stringify(fallo)}: a las 24 h`);
    await app.parar();
  }
});

test('Task 8, ronda 3: un fallo de firma, «antiguo» o de manifiesto en comprobar no reintenta pronto', async () => {
  for (const codigo of ['firma', 'antiguo', 'esquema', 'json', 'compatibilidad']) {
    const { reloj, f, app } = await conFallo({ comprobar: () => ({ estado: 'error', codigo }) });
    await reloj.avanzar(60 * MIN);
    assert.equal(f.veces('comprobar'), 1, `${codigo}: sin reintento pronto`);
    await app.parar();
  }
});

test('Task 8, ronda 3: fallos pasajeros seguidos se reintentan a los 5, 10 y 20 min, y una comprobación buena lo vuelve a poner a 5', async () => {
  let falla = true;
  const { reloj, f } = await conFallo({ comprobar: () => (falla ? { estado: 'error', codigo: 'conexion' } : { estado: 'sin_novedades' }) });
  for (const espera of [5, 10, 20]) {
    const antes = f.veces('comprobar');
    await reloj.avanzar(espera * MIN - 1);
    assert.equal(f.veces('comprobar'), antes, `a ${espera} min menos 1 ms todavía no`);
    await reloj.avanzar(1);
    assert.equal(f.veces('comprobar'), antes + 1, `reintento a los ${espera} min`);
  }
  // el cuarto toca a los 40 min
  const n = f.veces('comprobar');
  await reloj.avanzar(40 * MIN - 1);
  assert.equal(f.veces('comprobar'), n);
  falla = false;
  await reloj.avanzar(1);
  assert.equal(f.veces('comprobar'), n + 1);
  // fue bien: se acaba el reintento pronto (el comercio sigue ausente pero ya no hay fallo que reintentar)
  await reloj.avanzar(10 * 60 * MIN - 1);
  assert.equal(f.veces('comprobar'), n + 1);
  // un fallo nuevo (en la siguiente comprobación de las 24 h) vuelve a empezar por 5 min, no por 80
  falla = true;
  const siguiente = 120_000 + DIA * Math.ceil((reloj.ms - 120_000) / DIA);
  await reloj.avanzar(siguiente - reloj.ms);
  const m = f.veces('comprobar');
  await reloj.avanzar(5 * MIN - 1);
  assert.equal(f.veces('comprobar'), m);
  await reloj.avanzar(1);
  assert.equal(f.veces('comprobar'), m + 1, 'otra vez a los 5 min');
});

test('tarea 13: con actualizaciones.auto = false no comprueba sola; solo con «Buscar actualizaciones»', async () => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'config.json'), JSON.stringify({ actualizaciones: { auto: false } }));
  const reloj = relojFalso();
  const f = actualizadorFalso();
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { reloj, actualizador: f.crear, lanzarBandeja: b.lanzar });
  await app.listo;
  await reloj.avanzar(2 * DIA);
  assert.equal(f.veces('comprobar'), 0);
  b.alMenu('actualizar');
  await hasta(() => f.veces('comprobar') === 1);
  await hasta(() => b.entradas.at(-1)?.actualizacion === ACT.al_dia);
});

test('tarea 13: un «hay» → descargar, el globo «Hay una versión nueva…» (una vez por versión) y la entrada «lista»', async () => {
  const f = actualizadorFalso({
    comprobar: () => ({ estado: 'hay', lista: [{ componente: 'addon', de: '0.5.0', a: '0.5.1' }] }),
    descargar: () => ({ estado: 'listo' }),
  });
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { actualizador: f.crear, lanzarBandeja: b.lanzar });
  await app.listo;
  b.alMenu('actualizar');
  await hasta(() => b.entradas.at(-1)?.actualizacion === 'Actualización: lista: se instalará al cerrar el juego');
  assert.ok(b.entradas.some((e) => e.actualizacion === 'Actualización: buscando…'));
  assert.equal(f.veces('descargar'), 1);
  const hay = () => b.globos.filter((g) => g.texto.startsWith('Hay una versión nueva'));
  assert.deepEqual(hay(), [{ titulo: 'SnetForever', texto: 'Hay una versión nueva de SnetForever (addon 0.5.1). Se instalará cuando cierres el juego.' }]);
  b.alMenu('actualizar');
  await hasta(() => f.veces('descargar') === 2);
  await esperar(20);
  assert.equal(hay().length, 1, 'la misma versión no vuelve a sacar el globo');
  assert.equal(b.entradas.at(-1).version, VERSION);
});

test('tarea 13: un «hay» que solo puede llegar con el instalador nuevo lo dice en la entrada', async () => {
  const f = actualizadorFalso({
    comprobar: () => ({ estado: 'hay', lista: [{ componente: 'app', de: '0.5.0', a: '0.6.0', requiereInstalador: true }] }),
    descargar: () => ({ estado: 'nada' }),
  });
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { actualizador: f.crear, lanzarBandeja: b.lanzar });
  await app.listo;
  b.alMenu('actualizar');
  await hasta(() => b.entradas.at(-1)?.actualizacion === 'Actualización: hace falta el instalador nuevo');
  assert.equal(b.globos.filter((g) => g.texto.startsWith('Hay una versión nueva')).length, 0);
});

test('tarea 13: un «aplicado» con [addon] → prepararAddOns otra vez y el globo «se ha actualizado»', async () => {
  const reloj = relojFalso();
  let aplicar = () => ({ estado: 'nada' });
  const f = actualizadorFalso({ aplicar: () => aplicar() });
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { reloj, actualizador: f.crear, lanzarBandeja: b.lanzar });
  await app.listo;
  // una ranura que ya no está (apartada a mano): prepararAddOns la vuelve a crear
  nodeFs.renameSync(join(h.addons, 'SnetForever_R003'), join(h.base, 'R003-aparte'));
  aplicar = () => ({ estado: 'aplicado', aplicados: ['addon'] });
  await reloj.avanzar(60_000);
  await hasta(() => b.globos.some((g) => g.texto === 'SnetForever se ha actualizado (addon). Ya puedes abrir el juego.'));
  assert.ok(existsSync(join(h.addons, 'SnetForever_R003', 'buzon.lua')), 'prepararAddOns volvió a crear la ranura');
  assert.equal(app.cerrada, false);
  assert.equal(b.entradas.at(-1).actualizacion, ACT.al_dia);
});

test('tarea 13: un «aplicado» con [app] → reiniciar (con el soltar del cerrojo) y parar; instalada: limpiarVersiones y aplicarApp', async () => {
  const reloj = relojFalso();
  const llamadas = [];
  const propia = {
    esInstalada: () => true,
    limpiarVersiones: (o) => { llamadas.push(['limpiar', o.instalacion, typeof o.cuarentena]); return []; },
    aplicarApp: (b, o) => { llamadas.push(['aplicarApp', o.instalacion, typeof o.cuarentena]); return { version: '0.5.1' }; },
    reiniciar: async (o) => {
      llamadas.push(['reiniciar', o.instalacion]);
      await o.soltar();
      llamadas.push(['soltado', JSON.parse(readFileSync(join(h.datos, 'app.lock'), 'utf8')).pid]);
    },
  };
  let aplicar = () => ({ estado: 'nada' });
  const f = actualizadorFalso({ aplicar: () => aplicar() });
  const app = await abrir(ARGS, { reloj, actualizador: f.crear, propia });
  await app.listo;
  const instalacion = join(h.base, 'instalacion');
  assert.deepEqual(llamadas[0], ['limpiar', instalacion, 'function']);
  assert.equal(typeof f.opciones.aplicarApp, 'function');
  f.opciones.aplicarApp(Buffer.from('paquete'));
  assert.deepEqual(llamadas[1], ['aplicarApp', instalacion, 'function']);
  aplicar = () => ({ estado: 'aplicado', aplicados: ['addon', 'app'] });
  await reloj.avanzar(60_000);
  await Promise.race([app.terminado, esperar(3000).then(() => { throw new Error('no se cerró'); })]);
  assert.deepEqual(llamadas.slice(2), [['reiniciar', instalacion], ['soltado', 0]]);
  assert.equal(app.cerrada, true);
});

test('tarea 13 (vigilancia 4): cinco comprobaciones con error de conexión → como mucho un globo y «no se pudo comprobar»', async () => {
  const f = actualizadorFalso({ comprobar: () => ({ estado: 'error', codigo: 'conexion' }) });
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { actualizador: f.crear, lanzarBandeja: b.lanzar });
  await app.listo;
  const antes = b.globos.length;
  for (let i = 1; i <= 5; i++) {
    b.alMenu('actualizar');
    await hasta(() => f.veces('comprobar') === i && b.entradas.at(-1)?.actualizacion === 'Actualización: no se pudo comprobar');
  }
  assert.ok(b.globos.length - antes <= 1, JSON.stringify(b.globos.slice(antes)));
  assert.equal(f.veces('descargar'), 0);
});

test('tarea 13: sin clave pública, la entrada dice «desactivadas (sin clave)» desde el principio', async () => {
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { lanzarBandeja: b.lanzar, clavePublica: null });
  await app.listo;
  assert.equal(b.entradas.at(-1).actualizacion, 'Actualización: desactivadas (sin clave)');
});

test('tarea 13: el aviso «reinstalar» del actualizador sale en la bandeja (entrada, icono de aviso y un solo globo)', async () => {
  const reloj = relojFalso();
  const f = actualizadorFalso({ estado: () => ({ roto: true, reinstalar: true }), aplicar: () => ({ estado: 'nada', roto: true, reinstalar: true }) });
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { reloj, actualizador: f.crear, lanzarBandeja: b.lanzar });
  await app.listo;
  assert.equal(b.entradas.at(-1).actualizacion, ACT.reinstalar);
  assert.equal(b.estados.at(-1).icono, 'aviso');
  await reloj.avanzar(5 * 60_000);
  assert.equal(b.globos.filter((g) => g.texto === TEXTOS_APP.es.globoReinstalar).length, 1);
});

test('tarea 13: con una tanda a medias (roto) la entrada lo dice; al repararse vuelve a «al día»', async () => {
  const reloj = relojFalso();
  let aplicar = () => ({ estado: 'esperando_juego', roto: true });
  const f = actualizadorFalso({ aplicar: () => aplicar() });
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { reloj, actualizador: f.crear, lanzarBandeja: b.lanzar });
  await app.listo;
  await reloj.avanzar(60_000);
  await hasta(() => b.entradas.at(-1)?.actualizacion === ACT.roto);
  aplicar = () => ({ estado: 'aplicado', aplicados: ['addon'] });
  await reloj.avanzar(60_000);
  await hasta(() => b.entradas.at(-1)?.actualizacion === ACT.al_dia);
});

test('tarea 13: fallida.txt con una versión más nueva que la que corre sale en la bandeja; una más vieja, no', async () => {
  mkdirSync(join(h.base, 'instalacion'), { recursive: true });
  writeFileSync(join(h.base, 'instalacion', 'fallida.txt'), '9.9.9\n');
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { lanzarBandeja: b.lanzar });
  await app.listo;
  assert.equal(b.entradas.at(-1).actualizacion, ACT.fallida('9.9.9'));
  assert.equal(b.globos.filter((g) => g.texto === TEXTOS_APP.es.globoFallida('9.9.9')).length, 1);
  await app.parar();
  writeFileSync(join(h.base, 'instalacion', 'fallida.txt'), '0.0.1\n');
  const c = bandejaFalsa();
  const otra = await abrir(['--sin-captura'], { lanzarBandeja: c.lanzar });
  await otra.listo;
  assert.notEqual(c.entradas.at(-1).actualizacion, ACT.fallida('0.0.1'));
});

// ---------- R17: primer arranque ----------

const tocR17 = (titulo, version, esquema = null) => `## Interface: 16001\n## Title: ${titulo}\n## Version: ${version}\n`
  + `${esquema === null ? '' : `## X-SNF-EsquemaDatos: ${esquema}\n`}\nnucleo.lua\n`;
const ARCHIVOS_R17 = {
  addon: (v) => ({ 'SnetForever/SnetForever.toc': tocR17('SnetForever', v, 1), 'SnetForever/nucleo.lua': `SnetForever = {VERSION = "${v}"}\n` }),
  rutas: (v) => ({
    'SnetForever_Rutas/SnetForever_Rutas.toc': tocR17('SnetForever_Rutas', v),
    'SnetForever_Rutas/nucleo.lua': `SNF_RUTAS = {version="${v}",esquema=1,guias={},grupos={}}\n`,
  }),
  misiones: (v) => ({
    'SnetForever_Misiones/SnetForever_Misiones.toc': tocR17('SnetForever_Misiones', v),
    'SnetForever_Misiones/nucleo.lua': `SNF_MISIONES = {version="${v}",esquema=1,quest={}}\n`,
  }),
};
const VERSIONES_R17 = { addon: '0.5.0', rutas: '2026.11.10.1', misiones: '2026.11.10.1' };

function escribirArbol(raiz, archivos) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const final = join(raiz, ...ruta.split('/'));
    mkdirSync(dirname(final), { recursive: true });
    writeFileSync(final, contenido);
  }
  return raiz;
}

// Lo que Inno deja en {app}\paquetes: el manifiesto y los tres paquetes (sin firma: con la clave null bastan los SHA-256).
function paquetesDeInstalacion(dir) {
  mkdirSync(dir, { recursive: true });
  const componentes = {};
  for (const [c, version] of Object.entries(VERSIONES_R17)) {
    const raiz = escribirArbol(mkdtempSync(join(h.base, 'fuente-')), ARCHIVOS_R17[c](version));
    const buffer = empaquetar({ componente: c, version, raiz, esquemaDatos: 1 });
    const archivo = `SnetForever-${c}-${version}.snfpaq`;
    componentes[c] = { version, archivo, tamano: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), esquemaDatos: 1 };
    if (c === 'addon') componentes[c].appMinima = '0.5.0';
    writeFileSync(join(dir, archivo), buffer);
  }
  const manifiesto = {
    esquema: 1, producto: 'SnetForever', publicacion: 'v0.5.0-2026.11.10.1', fecha: '2026-11-10T12:00:00.000Z', componentes,
    notas: { es: 'Primera', en: 'First' },
  };
  writeFileSync(join(dir, 'snetforever-manifiesto.json'), `${JSON.stringify(manifiesto, null, 2)}\n`);
}

test('tarea 13 (R17): con config.instalada y sin SnetForever_Misiones, se instala desde {app}\\paquetes en cuanto el juego está cerrado', async () => {
  const { raiz, addons } = juegoDePrueba();
  escribirArbol(addons, { ...ARCHIVOS_R17.addon('0.5.0'), ...ARCHIVOS_R17.rutas('2026.11.10.1') });
  writeFileSync(join(addons, 'SnetForever', 'nucleo.lua'), '-- el de antes\n');
  paquetesDeInstalacion(join(h.base, 'instalacion', 'paquetes'));
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'config.json'), JSON.stringify({ addons, instalada: true }));
  const juego = juegoFalso({ falla: true }); // consultar('procesos') falla: cuenta como abierto
  const reloj = relojFalso();
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { juego, reloj, clavePublica: null, lanzarBandeja: b.lanzar }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  const misiones = join(addons, 'SnetForever_Misiones');
  assert.equal(existsSync(misiones), false, 'sin saber si el juego está cerrado no se toca nada');
  juego.falla = false;
  juego.abierto = join(raiz, 'Wow.exe');
  await reloj.avanzar(60_000);
  await esperar(30);
  assert.equal(existsSync(misiones), false, 'con el juego abierto no se toca nada');
  juego.abierto = null;
  await reloj.avanzar(60_000);
  await hasta(() => existsSync(join(misiones, 'SnetForever_Misiones.toc')));
  assert.match(readFileSync(join(misiones, 'SnetForever_Misiones.toc'), 'utf8'), /## Version: 2026\.11\.10\.1/);
  assert.equal(readFileSync(join(addons, 'SnetForever', 'nucleo.lua'), 'utf8'), '-- el de antes\n', 'lo que ya estaba no se reinstala');
  await hasta(() => b.globos.some((g) => g.texto === TEXTOS_APP.es.primerArranque('datos de misiones')));
  // ya no falta nada: no se vuelve a mirar el juego por R17
  const procesos = () => juego.llamadas.filter((q) => q === 'procesos').length;
  const antes = procesos();
  await reloj.avanzar(5 * 60_000);
  await esperar(30);
  assert.equal(procesos(), antes);
});

test('tarea 13 (R17): sin config.instalada no se instala nada aunque falte un componente', async () => {
  const { addons } = juegoDePrueba();
  paquetesDeInstalacion(join(h.base, 'instalacion', 'paquetes'));
  const reloj = relojFalso();
  const app = await abrir(['--sin-captura'], { reloj, clavePublica: null }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  await reloj.avanzar(2 * 60_000);
  await esperar(30);
  assert.equal(existsSync(join(addons, 'SnetForever_Misiones')), false);
  assert.equal(existsSync(join(addons, 'SnetForever_Rutas')), false);
});

// ---------- T7: el juego por el registro y por los procesos ----------

test('tarea 13 (T7): sin SNF_ADDONS ni captura, el juego cerrado se encuentra por el InstallPath del registro', async () => {
  const { addons } = juegoDePrueba();
  const sin = { ...process.env };
  delete sin.SNF_ADDONS;
  const juego = juegoFalso({ registro: [join(h.base, 'World of Warcraft')] });
  const app = await abrir(ARGS, { juego }, sin);
  await app.listo;
  assert.ok(juego.llamadas.includes('registro'));
  assert.match(readFileSync(join(addons, 'SnetForever_R001', 'buzon.lua'), 'utf8'), /claude\s*=\s*"ok"/);
});

test('tarea 13 (T7): sin SNF_ADDONS ni registro, vale la ruta del Wow.exe abierto (candidatasJuego)', async () => {
  const { raiz, addons } = juegoDePrueba();
  const sin = { ...process.env };
  delete sin.SNF_ADDONS;
  const juego = juegoFalso({ abierto: join(raiz, 'Wow.exe') });
  const app = await abrir(ARGS, { juego }, sin);
  await app.listo;
  assert.match(readFileSync(join(addons, 'SnetForever_R001', 'buzon.lua'), 'utf8'), /claude\s*=\s*"ok"/);
});

// ---------- avisos de fallo ----------

test('tarea 13: la línea «entradas» dice avisos: 3 con el fixture de WTF; «avisos» abre la URL y después dice 0', async () => {
  const { raiz, addons } = juegoDePrueba();
  cpSync(join(AQUI, 'fixtures', 'wtf'), join(raiz, 'WTF'), { recursive: true });
  const urls = [];
  const b = bandejaFalsa();
  const abrirUrl = (url, o) => { urls.push({ url, repo: o?.repo }); return true; };
  const app = await abrir(['--sin-captura'], { lanzarBandeja: b.lanzar, abrirUrl }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  assert.equal(b.entradas.at(-1).avisos, 3);
  b.alMenu('avisos');
  await hasta(() => b.entradas.at(-1).avisos === 0);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].url.startsWith('https://github.com/alvarezalain262-create/SnetForever/issues/new?title='), urls[0].url);
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'avisos-enviados.json'), 'utf8')).enviados.length, 3);
  b.alMenu('avisos'); // sin pendientes no se abre nada
  await esperar(30);
  assert.equal(urls.length, 1);
});

test('tarea 13: «Guardar en un archivo» lo deja en datos\\avisos y abre esa carpeta; «Copiar» usa el portapapeles', async () => {
  const { raiz, addons } = juegoDePrueba();
  cpSync(join(AQUI, 'fixtures', 'wtf'), join(raiz, 'WTF'), { recursive: true });
  const carpetas = [];
  const copiados = [];
  const reloj = relojFalso();
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], {
    reloj, lanzarBandeja: b.lanzar, abrirCarpeta: (r) => { carpetas.push(r); return true; },
    copiar: async (t) => { copiados.push(t); return true; },
  }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  b.alMenu('avisos_archivo');
  await hasta(() => b.entradas.at(-1).avisos === 0);
  assert.deepEqual(carpetas, [join(h.datos, 'avisos')]);
  const archivos = readdirSync(join(h.datos, 'avisos'));
  assert.equal(archivos.length, 1);
  assert.match(readFileSync(join(h.datos, 'avisos', archivos[0]), 'utf8'), /^# Avisos de fallo \(3\)/);
  // la lista de enviados se aparta (como si fuera otro PC) y a los 10 min, con el juego cerrado, vuelven a contar
  nodeFs.renameSync(join(h.datos, 'avisos-enviados.json'), join(h.base, 'enviados-aparte.json'));
  await reloj.avanzar(10 * 60_000);
  await hasta(() => b.entradas.at(-1).avisos === 3);
  b.alMenu('avisos_copiar');
  await hasta(() => b.entradas.at(-1).avisos === 0);
  assert.equal(copiados.length, 1);
  assert.match(copiados[0], /^# Avisos de fallo \(3\)/);
  assert.ok(b.globos.some((g) => g.texto === TEXTOS_APP.es.avisosCopiados));
});

test('tarea 13: los avisos se vuelven a leer cada 10 min solo con el juego cerrado', async () => {
  const { raiz, addons } = juegoDePrueba();
  const juego = juegoFalso({ abierto: join(raiz, 'Wow.exe') });
  const reloj = relojFalso();
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { juego, reloj, lanzarBandeja: b.lanzar }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  assert.equal(b.entradas.at(-1).avisos, 0);
  cpSync(join(AQUI, 'fixtures', 'wtf'), join(raiz, 'WTF'), { recursive: true });
  await reloj.avanzar(10 * 60_000);
  await esperar(30);
  assert.equal(b.entradas.at(-1).avisos, 0, 'con el juego abierto no se leen');
  juego.abierto = null;
  await reloj.avanzar(10 * 60_000);
  await hasta(() => b.entradas.at(-1).avisos === 3);
});

// ---------- bandeja y textos ----------

test('lanzarBandeja: entradas() manda la línea F5 (y se repite al relanzar); las acciones nuevas llegan a alMenu', async () => {
  const hijos = [];
  const menus = [];
  const b = lanzarBandeja({ lanzar: () => { const x = hijoFalso(); hijos.push(x); return x; }, esperas: [5], alMenu: (a) => menus.push(a) });
  const linea = { t: 'entradas', actualizacion: 'Actualización: al día', avisos: 2, version: '0.5.0' };
  b.entradas({ actualizacion: 'Actualización: al día', avisos: 2, version: '0.5.0' });
  await esperar(20);
  assert.deepEqual(hijos[0].escrito[0], linea);
  hijos[0].stdout.write('{"t":"menu","accion":"actualizar"}\n{"t":"menu","accion":"avisos"}\n{"t":"menu","accion":"avisos_archivo"}\n'
    + '{"t":"menu","accion":"avisos_copiar"}\n{"t":"entradas_listas","n":19}\n{"t":"menu","accion":"rara"}\n');
  await esperar(20);
  assert.deepEqual(menus, ['actualizar', 'avisos', 'avisos_archivo', 'avisos_copiar']);
  hijos[0].emit('close', 1);
  await hasta(() => hijos.length === 2);
  await esperar(20);
  assert.deepEqual(hijos[1].escrito[0], linea);
  await b.parar();
});

test('S8: lanzarBandeja: cerebro() manda la línea «cerebro» (y se repite al relanzar); «cerebro» y «complemento_tati» llegan a alMenu', async () => {
  const hijos = [];
  const menus = [];
  const b = lanzarBandeja({ lanzar: () => { const x = hijoFalso(); hijos.push(x); return x; }, esperas: [5], alMenu: (a, v) => menus.push([a, v]) });
  b.cerebro({ visible: true, valor: 'tati' });
  await esperar(20);
  assert.deepEqual(hijos[0].escrito[0], { t: 'cerebro', visible: true, valor: 'tati' });
  b.cerebro({ visible: 'si', valor: 'otro' });
  await esperar(20);
  assert.deepEqual(hijos[0].escrito[1], { t: 'cerebro', visible: false, valor: 'snetforever' }, 'solo true enseña; otro valor = snetforever');
  b.cerebro({ visible: true, valor: 'snetforever' });
  hijos[0].stdout.write('{"t":"menu","accion":"cerebro","valor":"tati"}\n{"t":"menu","accion":"complemento_tati"}\n');
  await esperar(20);
  assert.deepEqual(menus, [['cerebro', 'tati'], ['complemento_tati', undefined]]);
  hijos[0].emit('close', 1);
  await hasta(() => hijos.length === 2);
  await esperar(20);
  assert.deepEqual(hijos[1].escrito.at(-1), { t: 'cerebro', visible: true, valor: 'snetforever' });
  await b.parar();
});

test('tarea 13: los textos de actualización y avisos están en es y en, con los del brief', () => {
  assert.equal(ACT.al_dia, 'Actualización: al día');
  assert.equal(ACT.buscando, 'Actualización: buscando…');
  assert.equal(ACT.lista, 'Actualización: lista: se instalará al cerrar el juego');
  assert.equal(ACT.instalador, 'Actualización: hace falta el instalador nuevo');
  assert.equal(ACT.error, 'Actualización: no se pudo comprobar');
  assert.equal(ACT.sin_clave, 'Actualización: desactivadas (sin clave)');
  assert.equal(TEXTOS_APP.es.globoListo('addon 0.5.1'), 'Hay una versión nueva de SnetForever (addon 0.5.1). Se instalará cuando cierres el juego.');
  assert.equal(TEXTOS_APP.es.globoAplicado('addon'), 'SnetForever se ha actualizado (addon). Ya puedes abrir el juego.');
  const m = TEXTOS_APP.es.menu;
  assert.deepEqual([m.avisosArchivo, m.avisosCopiar, m.avisosIssue], ['Guardar en un archivo', 'Copiar al portapapeles', 'Abrir una incidencia en GitHub…']);
  for (const idioma of ['es', 'en']) assert.match(TEXTOS_APP[idioma].actualizacion.reinstalar, /instal/i);
});

// ---------- tarea 13, ronda 1 ----------

test('ronda 1 (duda 5): al aplicar datos de misiones de otra versión, la base se vuelve a cargar (una vez por versión)', async () => {
  const toc = (v) => `## Interface: 16001\n## Title: SnetForever_Misiones\n## Version: ${v}\n\nnucleo.lua\n`;
  mkdirSync(join(h.addons, 'SnetForever_Misiones'), { recursive: true });
  writeFileSync(join(h.addons, 'SnetForever_Misiones', 'SnetForever_Misiones.toc'), toc('2026.11.10.1'));
  const reloj = relojFalso();
  let aplicar = () => ({ estado: 'nada' });
  const f = actualizadorFalso({ aplicar: () => aplicar() });
  const app = await abrir(ARGS, { reloj, actualizador: f.crear });
  await app.listo;
  await app.nucleo.baseActual();
  const recargas = () => (readFileSync(join(h.datos, 'registro.log'), 'utf8').match(/la base se ha vuelto a cargar/g) || []).length;
  aplicar = () => ({ estado: 'aplicado', aplicados: ['addon'] });
  await reloj.avanzar(60_000);
  await esperar(50);
  assert.equal(recargas(), 0, 'sin misiones no se recarga');
  writeFileSync(join(h.addons, 'SnetForever_Misiones', 'SnetForever_Misiones.toc'), toc('2026.11.12.1'));
  aplicar = () => ({ estado: 'aplicado', aplicados: ['misiones'] });
  await reloj.avanzar(60_000);
  await hasta(() => recargas() === 1);
  await reloj.avanzar(60_000);
  await esperar(50);
  assert.equal(recargas(), 1, 'la misma versión no se vuelve a cargar');
});

test('ronda 1 (Menor 2): si reiniciar falla después de soltar, la app vuelve a tomar el cerrojo, sigue viva y lo dice', async () => {
  const reloj = relojFalso();
  const propia = {
    esInstalada: () => true,
    limpiarVersiones: () => [],
    reiniciar: async (o) => {
      await o.soltar();
      throw Object.assign(new Error('wscript no está'), { code: 'ENOENT' });
    },
  };
  let aplicar = () => ({ estado: 'nada' });
  const f = actualizadorFalso({ aplicar: () => aplicar() });
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { reloj, actualizador: f.crear, propia, lanzarBandeja: b.lanzar });
  await app.listo;
  aplicar = () => ({ estado: 'aplicado', aplicados: ['app'] });
  await reloj.avanzar(60_000);
  await hasta(() => b.globos.some((g) => g.texto === TEXTOS_APP.es.reiniciarFallo));
  assert.equal(app.cerrada, false);
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'app.lock'), 'utf8')).pid, process.pid, 'el cerrojo vuelve a ser suyo');
  const otra = await arrancar(ARGS, process.env, deps());
  assert.equal(otra.codigo, 3, 'una segunda instancia sigue sin poder abrir');
});

test('revisión final, m7: si reiniciar falla sin haber soltado el cerrojo (sigue siendo suyo), la app sigue viva y lo dice', async () => {
  const reloj = relojFalso();
  const propia = {
    esInstalada: () => true,
    limpiarVersiones: () => [],
    // falla antes de soltar (o soltar() falló): el cerrojo sigue con el pid de esta app
    reiniciar: async () => {
      throw Object.assign(new Error('wscript no está'), { code: 'ENOENT' });
    },
  };
  let aplicar = () => ({ estado: 'nada' });
  const f = actualizadorFalso({ aplicar: () => aplicar() });
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { reloj, actualizador: f.crear, propia, lanzarBandeja: b.lanzar });
  await app.listo;
  aplicar = () => ({ estado: 'aplicado', aplicados: ['app'] });
  await reloj.avanzar(60_000);
  await hasta(() => b.globos.some((g) => g.texto === TEXTOS_APP.es.reiniciarFallo));
  await esperar(50);
  assert.equal(app.cerrada, false);
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'app.lock'), 'utf8')).pid, process.pid);
  const otra = await arrancar(ARGS, process.env, deps());
  assert.equal(otra.codigo, 3, 'una segunda instancia sigue sin poder abrir');
});

test('revisión final, m8: si la base nueva no carga, se vuelve a intentar la próxima vez que entren esos datos', async () => {
  // una base propia de esta prueba, que se puede estropear y arreglar
  const base = join(h.base, 'base m8');
  mkdirSync(base);
  copyFileSync(join(AQUI, 'fixtures', 'misiones-app.lua'), join(base, 'misiones-app.lua'));
  writeFileSync(join(base, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', ''].join('\n'));
  const toc = (v) => `## Interface: 16001\n## Title: SnetForever_Misiones\n## Version: ${v}\n\nnucleo.lua\n`;
  mkdirSync(join(h.addons, 'SnetForever_Misiones'), { recursive: true });
  writeFileSync(join(h.addons, 'SnetForever_Misiones', 'SnetForever_Misiones.toc'), toc('2026.11.10.1'));
  const reloj = relojFalso();
  let aplicar = () => ({ estado: 'nada' });
  const f = actualizadorFalso({ aplicar: () => aplicar() });
  const app = await abrir(ARGS, { reloj, actualizador: f.crear }, { ...process.env, SNF_BASE: base });
  await app.listo;
  await app.nucleo.baseActual();
  const registro = () => readFileSync(join(h.datos, 'registro.log'), 'utf8');
  const cuenta = (re) => (registro().match(re) || []).length;
  // entran misiones nuevas, pero la base nueva no carga (su archivo no está)
  writeFileSync(join(h.addons, 'SnetForever_Misiones', 'SnetForever_Misiones.toc'), toc('2026.11.12.1'));
  renameSync(join(base, 'misiones-app.lua'), join(base, 'apartado.lua'));
  aplicar = () => ({ estado: 'aplicado', aplicados: ['misiones'] });
  await reloj.avanzar(60_000);
  await hasta(() => cuenta(/la base nueva no cargó/g) === 1);
  assert.equal(cuenta(/la base se ha vuelto a cargar/g), 0);
  // se arregla y vuelven a entrar los mismos datos: ahora sí se carga (antes se daba por cargada)
  renameSync(join(base, 'apartado.lua'), join(base, 'misiones-app.lua'));
  await reloj.avanzar(60_000);
  await hasta(() => cuenta(/la base se ha vuelto a cargar/g) === 1);
});

test('ronda 1 (Menor 3): «Buscar actualizaciones» antes de saber dónde está el juego lo dice y busca en cuanto se puede', async () => {
  const { raiz } = juegoDePrueba();
  const sin = { ...process.env };
  delete sin.SNF_ADDONS;
  let alEstado;
  const lanzarCaptura = (o) => {
    alEstado = o.alEstado;
    return { parar() {}, estadoCaptura: () => ({ juego: null, minimizado: false, primerPlano: false, ultimaFranjaMs: null, error: null }) };
  };
  const f = actualizadorFalso();
  const b = bandejaFalsa();
  const app = await abrir([], { lanzarBandeja: b.lanzar, lanzarCaptura, existe: () => false, actualizador: f.crear }, sin);
  await esperar(50);
  b.alMenu('actualizar');
  await hasta(() => b.entradas.at(-1)?.actualizacion === ACT.todavia);
  assert.equal(ACT.todavia, 'Actualización: todavía no se puede comprobar');
  alEstado({ t: 'estado', juego: 'si', exe: join(raiz, 'Wow.exe'), minimizado: false, primerPlano: true });
  await app.listo;
  await hasta(() => f.veces('comprobar') === 1);
});

test('ronda 1 (Menor 5): un «hay» mixto dice qué hace falta del instalador nuevo', async () => {
  const f = actualizadorFalso({
    comprobar: () => ({ estado: 'hay', lista: [{ componente: 'addon', de: '0.5.0', a: '0.5.1' }, { componente: 'app', de: '0.5.0', a: '0.6.0', requiereInstalador: true }] }),
    descargar: () => ({ estado: 'listo' }),
  });
  const b = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { actualizador: f.crear, lanzarBandeja: b.lanzar });
  await app.listo;
  b.alMenu('actualizar');
  await hasta(() => b.entradas.at(-1)?.actualizacion === ACT.listaInstalador('app 0.6.0'));
  assert.equal(ACT.listaInstalador('app 0.6.0'), 'Actualización: lista; para app 0.6.0 hace falta el instalador nuevo');
  assert.ok(b.globos.some((g) => g.texto === TEXTOS_APP.es.globoListo('addon 0.5.1')));
});

test('ronda 1 (Menor 7): --preparar también encuentra el juego por el registro de Windows', async () => {
  const { addons } = juegoDePrueba();
  const sin = { ...process.env };
  delete sin.SNF_ADDONS;
  const salidas = [];
  const juego = juegoFalso({ registro: [join(h.base, 'World of Warcraft')] });
  const r = await arrancar(['--preparar'], sin, deps({ juego, salida: (t) => salidas.push(t) }));
  assert.equal(r.codigo, 0, salidas.join(''));
  assert.equal(JSON.parse(salidas.join('')).ranurasCreadas, 20);
  assert.ok(existsSync(join(addons, 'SnetForever_R001', 'buzon.lua')));
});

// ---------- comercio, Task 8: «Arrancar con Windows» y el programador ----------

test('Task 8: lanzarBandeja: inicio() manda la marca de «Arrancar con Windows» (y se repite al relanzar); la acción inicio llega a alMenu', async () => {
  const hijos = [];
  const menus = [];
  const b = lanzarBandeja({ lanzar: () => { const x = hijoFalso(); hijos.push(x); return x; }, esperas: [5], alMenu: (a) => menus.push(a) });
  b.inicio(true);
  await esperar(20);
  assert.deepEqual(hijos[0].escrito[0], { t: 'inicio', valor: true });
  hijos[0].stdout.write('{"t":"menu","accion":"inicio"}\n');
  await esperar(20);
  assert.deepEqual(menus, ['inicio']);
  hijos[0].emit('close', 1);
  await hasta(() => hijos.length === 2);
  await esperar(20);
  assert.deepEqual(hijos[1].escrito[0], { t: 'inicio', valor: true });
  await b.parar();
});

test('Task 8: los textos de «Arrancar con Windows» están en es y en', () => {
  assert.equal(TEXTOS_APP.es.menu.inicio, 'Arrancar con Windows');
  assert.equal(TEXTOS_APP.en.menu.inicio, 'Start with Windows');
  for (const idioma of ['es', 'en']) assert.ok(TEXTOS_APP[idioma].inicioFallo.length > 0);
});

test('Task 8: la bandeja enseña si arranca con Windows y el menú lo cambia (con fallo, un globo y la marca no cambia)', async () => {
  const b = bandejaFalsa();
  const inicio = inicioFalso(false);
  const app = await abrir(['--sin-captura'], { lanzarBandeja: b.lanzar, inicio });
  await app.listo;
  await hasta(() => b.inicios.length === 1);
  assert.deepEqual(b.inicios, [false]);
  b.alMenu('inicio');
  await hasta(() => b.inicios.length === 2);
  assert.deepEqual(b.inicios, [false, true]);
  assert.deepEqual(inicio.puestos, [true]);
  b.alMenu('inicio');
  await hasta(() => b.inicios.length === 3);
  assert.deepEqual(inicio.puestos, [true, false]);
  inicio.falla = true;
  b.alMenu('inicio');
  await hasta(() => b.globos.some((g) => g.texto === TEXTOS_APP.es.inicioFallo));
  assert.equal(b.inicios.at(-1), false);
});

// F7: ya no hay casa supuesta: las casas de «Normal» se dan por descubiertas (114 Horda, 111 Alianza, 117 neutral) en el
// estado.json de la app, como si un escaneo de cada subasta las hubiera descubierto.
async function casasDeNormal() {
  const carpeta = join(h.datos, 'comercio');
  mkdirSync(carpeta, { recursive: true });
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  e.aprender('Normal', 'Horde', 114);
  e.aprender('Normal', 'Alliance', 111);
  e.aprender('Normal', 'Neutral', 117);
  await e.guardar();
}

test('Task 8: con el juego cerrado lee la identidad de SnetForeverCuenta.comercio y la guarda en <datos>\comercio\estado.json', async () => {
  const { raiz, addons } = juegoDePrueba();
  const sv = join(raiz, 'WTF', 'Account', 'CUENTA', 'SavedVariables');
  mkdirSync(sv, { recursive: true });
  writeFileSync(join(sv, 'SnetForever.lua'),
    'SnetForeverCuenta = {\n["comercio"] = {\n["identidad"] = {["region"] = "US", ["reino"] = "Normal", ["faccion"] = "Horde"},\n},\n}\n');
  const pedidas = [];
  const clienteBlizzard = ({ region }) => ({
    subastas: async (casa) => { pedidas.push([region, casa]); return { estado: 'igual' }; },
    mercancias: async (casa) => { pedidas.push([region, casa]); return { estado: 'igual' }; },
    objeto: async () => null,
  });
  await casasDeNormal();
  const app = await abrir(ARGS, { clienteBlizzard }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  const ruta = join(h.datos, 'comercio', 'estado.json');
  await hasta(() => existsSync(ruta));
  const estado = JSON.parse(readFileSync(ruta, 'utf8'));
  assert.deepEqual(estado.identidad, { region: 'us', reino: 'Normal', faccion: 'Horde' });
  assert.deepEqual(estado.casas, [114, 117], 'F7: la Horda y la neutral; la Alianza no tiene personajes');
  assert.ok(pedidas.every(([region]) => region === 'us'));
});

test('Task 8 (revisión): con la región sabida arrancan las misiones de la API (con el cliente de esa región) y una identidad nueva hace una ronda ya', async () => {
  const { raiz, addons } = juegoDePrueba();
  const sv = join(raiz, 'WTF', 'Account', 'CUENTA', 'SavedVariables');
  mkdirSync(sv, { recursive: true });
  writeFileSync(join(sv, 'SnetForever.lua'),
    'SnetForeverCuenta = {\n["comercio"] = {\n["identidad"] = {["region"] = "EU", ["reino"] = "Normal", ["faccion"] = "Alliance"},\n},\n}\n');
  const llamadas = [];
  const clienteBlizzard = ({ region, locale }) => ({
    subastas: async (casa) => { llamadas.push(['subastas', region, casa]); return { estado: 'igual' }; },
    mercancias: async (casa) => { llamadas.push(['mercancias', region, casa]); return { estado: 'igual' }; },
    objeto: async () => null,
    indiceZonasMision: async () => { llamadas.push(['indice', region, locale]); return { areas: [{ id: 1, name: 'Bosque' }] }; },
    misionesDeZona: async () => ({ area: 'Bosque', quests: [{ id: 7, name: 'Una misión de prueba' }] }),
    mision: async () => null,
  });
  await casasDeNormal();
  const app = await abrir(ARGS, { clienteBlizzard }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  await hasta(() => llamadas.some((l) => l[0] === 'indice'));
  assert.deepEqual(llamadas.find((l) => l[0] === 'indice'), ['indice', 'eu', 'es_MX']);
  // la ronda de ahora(): las casas de la Alianza primero, sea la hora que sea
  await hasta(() => llamadas.some((l) => l[0] === 'subastas'));
  assert.deepEqual(llamadas.find((l) => l[0] === 'subastas'), ['subastas', 'eu', 111]);
  await hasta(() => existsSync(join(h.datos, 'comercio', 'misiones-api.json')));
  assert.equal(JSON.parse(readFileSync(join(h.datos, 'comercio', 'misiones-api.json'), 'utf8')).misiones[0].id, 7);
});

// ---------- Task 17a: la IA ve los precios de comercio sin abrir la subasta ----------

// Lo del comercio en <datos>\comercio, escrito con los módulos de verdad: la identidad (si se da), una foto de precios
// de la 114 (la casa descubierta de Normal|Horde) y otra de la 111, y el nombre de un objeto en el catálogo.
async function comercioDePrueba({ identidad = { region: 'US', reino: 'Normal', faccion: 'Horde' } } = {}) {
  const carpeta = join(h.datos, 'comercio');
  mkdirSync(carpeta, { recursive: true });
  if (identidad) {
    const estado = crearEstadoComercio({ fs: nodeFs, carpeta });
    estado.aprender('Normal', 'Horde', 114); // F7: descubiertas (no hay casa supuesta)
    estado.aprender('Normal', 'Alliance', 111);
    estado.ponerIdentidad(identidad);
    await estado.guardar();
  }
  const historial = crearHistorialComercio({ fs: nodeFs, carpeta });
  historial.anadirFoto(114, 1790000000, [{ id: 1, item: 2589, cantidad: 20, precio: 150, tiempo: 'LONG' }], []);
  historial.anadirFoto(111, 1790000000, [{ id: 2, item: 2589, cantidad: 5, precio: 90, tiempo: 'LONG' }], []);
  await historial.guardar(114);
  await historial.guardar(111);
  const catalogo = crearCatalogo({
    cliente: { objeto: async (id) => ({ id, nombre: 'Paño de lino', calidad: 1, clase: 'Comerciable', subclase: 'Tela', precioVendedor: 13 }) },
    fs: nodeFs, carpeta, dormir: async () => {},
  });
  await catalogo.completar([2589]);
}

// Un motor de pega que apunta lo que le llega a la IA (los datos del turno) y contesta «Vale.».
function motorQueApunta() {
  const turnos = [];
  const herramientas = [];
  return {
    turnos,
    herramientas,
    elegirMotor: () => ({ motor: 'claude', modelo: 'haiku' }),
    preguntar: async (o) => {
      turnos.push(JSON.parse(o.entrada.split('\n')[1]));
      herramientas.push(o.herramientas);
      return { ok: true, motor: 'claude', texto: 'Vale.' };
    },
    estadoMotor: () => ({ motor: 'claude', estado: 'ok', texto: '' }),
  };
}

// Manda un mensaje del chat al núcleo de la app (ranura 7) con 2589 en las bolsas, como lo manda el addon.
async function mandarMensaje(app, { faccion = 'Horde', texto = '¿a cuánto vendo mi tela?', pj } = {}) {
  const PJ = pj ?? 'Tal Cual-Reino Prueba';
  const m = {
    v: 1, id: 'c0-1', pj: PJ, idioma: 'es', modelo: 'haiku', texto,
    ctx: {
      pj: { nivel: 20, clase: 'WARRIOR', raza: 'Orc', faccion, sexo: 2 },
      lugar: { mapa: 1411, zona: 'Durotar', instancia: false },
      registro: [],
      inv: { libres: 4, huecos: 16, bolsas: [{ id: 2589, n: 15, b: [[0, 1]] }] },
    },
  };
  const cabeza = Buffer.from(['SNF1', PJ, 'c0-1', '1', '1', '0', '7', '0', ''].join('\x1f'), 'utf8');
  await app.nucleo.recibirTrama(Buffer.concat([cabeza, Buffer.from(JSON.stringify(m), 'utf8')]));
  await app.nucleo.inactivo();
}

test('tarea 14: la app crea el núcleo con herramientas: el turno escribe turno.json con la carpeta de la base y pregunta con mcp.json', async () => {
  const motor = motorQueApunta();
  const app = await abrir(ARGS, { motor });
  await app.listo;
  await mandarMensaje(app, { texto: 'qué guía sigo', pj: 'Ejemplo-Reino' }); // un personaje inventado para esta prueba
  assert.equal(motor.herramientas.length, 1);
  assert.deepEqual(motor.herramientas[0]?.mcpConfig, join(h.datos, 'herramientas', 'mcp.json'));
  const turno = JSON.parse(readFileSync(join(h.datos, 'herramientas', 'turno.json'), 'utf8'));
  assert.equal(turno.carpetaBase, carpetaBase);
  assert.ok(!Object.hasOwn(turno, 'addonsDir'), 'el servidor no usa la carpeta AddOns (revisión final)');
  assert.equal(turno.pj.nivel, 20);
});

test('Task 17a: con identidad y una foto de precios en el historial, el turno de la IA recibe datos.comercio con objetos y casa', async () => {
  await comercioDePrueba();
  const motor = motorQueApunta();
  const app = await abrir(ARGS, { motor });
  await app.listo;
  await mandarMensaje(app);
  assert.equal(motor.turnos.length, 1);
  const c = motor.turnos[0].comercio;
  assert.ok(c, 'la IA ve datos.comercio sin la subasta abierta');
  assert.equal(c.casa, 114);
  assert.equal(c.generado, 1790000000);
  assert.equal(c.enVivo, undefined);
  const lino = c.objetos.find((o) => o.id === 2589);
  assert.ok(lino, 'el objeto de las bolsas va con su precio');
  assert.equal(lino.nombre, 'Paño de lino');
  assert.equal(lino.precio, 150);
  assert.deepEqual(lino.otrasCasas, { 111: 90 });
  assert.ok(!readFileSync(join(h.datos, 'registro.log'), 'utf8').includes('sin datos de comercio'));
});

test('Task 17a: con un personaje de otro bando en el mensaje, la casa es la de ese bando', async () => {
  await comercioDePrueba();
  const motor = motorQueApunta();
  const app = await abrir(ARGS, { motor });
  await app.listo;
  await mandarMensaje(app, { faccion: 'Alliance' });
  const c = motor.turnos[0].comercio;
  assert.equal(c.casa, 111);
  assert.equal(c.objetos.find((o) => o.id === 2589).precio, 90);
  assert.deepEqual(c.objetos.find((o) => o.id === 2589).otrasCasas, { 114: 150 });
});

test('Task 17a: sin identidad, el turno de la IA va sin datos.comercio y sin errores', async () => {
  await comercioDePrueba({ identidad: null });
  const motor = motorQueApunta();
  const app = await abrir(ARGS, { motor });
  await app.listo;
  await mandarMensaje(app);
  assert.equal(motor.turnos.length, 1, 'el turno sigue');
  assert.equal(motor.turnos[0].comercio, undefined);
  assert.ok(!readFileSync(join(h.datos, 'registro.log'), 'utf8').includes('sin datos de comercio'));
});

// ---------- arreglo final: historial de comercio compacto ----------

test('arreglo final: el historial viejo de comercio (JSON) se convierte y, con la primera foto guardada, va a la cuarentena de datos', async () => {
  // la identidad, nueva, en SavedVariables (así el programador hace una ronda ya)
  const { raiz, addons } = juegoDePrueba();
  const sv = join(raiz, 'WTF', 'Account', 'CUENTA', 'SavedVariables');
  mkdirSync(sv, { recursive: true });
  writeFileSync(join(sv, 'SnetForever.lua'),
    'SnetForeverCuenta = {\n["comercio"] = {\n["identidad"] = {["region"] = "US", ["reino"] = "Normal", ["faccion"] = "Horde"},\n},\n}\n');
  const carpeta = join(h.datos, 'comercio');
  mkdirSync(carpeta, { recursive: true });
  const antes = Math.floor(Date.now() / 1000) - 3600;
  writeFileSync(join(carpeta, 'historial-114.json'), JSON.stringify({
    version: 1, horas: { 2589: [[antes, 150, 20, 1]] }, ventas: {}, pares: [], ultima: { 1: [2589, 'LONG', 20] }, horaUltima: antes,
  }));
  const hora = new Date().toUTCString();
  const nueva = async () => ({ estado: 'nueva', hora, subastas: [{ id: 1, item: 2589, cantidad: 20, precio: 160, tiempo: 'LONG' }] });
  const mercancias = async () => ({ estado: 'nueva', hora, subastas: [{ id: 2, item: 2592, cantidad: 5, precio: 40, tiempo: 'LONG' }] });
  const clienteBlizzard = () => ({ subastas: nueva, mercancias, objeto: async () => null });
  await casasDeNormal();
  const app = await abrir(ARGS, { clienteBlizzard }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  await hasta(() => existsSync(join(carpeta, 'historial-114.bin')));
  await hasta(() => !existsSync(join(carpeta, 'historial-114.json')));
  const q = join(h.datos, 'cuarentena');
  assert.ok(readdirSync(q).some((d) => readdirSync(join(q, d)).includes('historial-114.json')), 'el viejo está en la cuarentena de datos');
  const historial = crearHistorialComercio({ fs: nodeFs, carpeta });
  assert.equal(historial.resumen(114, 2589).normal, 160); // 2 fotos: poco, normal = la última
});

test('arreglo final: un historial de comercio de una versión más nueva se deja como está y el registro lo apunta', async () => {
  const { raiz, addons } = juegoDePrueba();
  const sv = join(raiz, 'WTF', 'Account', 'CUENTA', 'SavedVariables');
  mkdirSync(sv, { recursive: true });
  writeFileSync(join(sv, 'SnetForever.lua'),
    'SnetForeverCuenta = {\n["comercio"] = {\n["identidad"] = {["region"] = "US", ["reino"] = "Normal", ["faccion"] = "Horde"},\n},\n}\n');
  const carpeta = join(h.datos, 'comercio');
  mkdirSync(carpeta, { recursive: true });
  // un .bin de verdad con la versión cambiada a 9 (mismo largo de cabecera)
  const previo = crearHistorialComercio({ fs: nodeFs, carpeta });
  previo.anadirFoto(114, Math.floor(Date.now() / 1000) - 3600, [{ id: 1, item: 2589, cantidad: 20, precio: 150, tiempo: 'LONG' }], []);
  await previo.guardar(114);
  const bin = join(carpeta, 'historial-114.bin');
  const crudo = gunzipSync(readFileSync(bin));
  const largo = crudo.readUInt32LE(4);
  crudo.write(crudo.toString('utf8', 8, 8 + largo).replace('"version":2', '"version":9'), 8, 'utf8');
  writeFileSync(bin, gzipSync(crudo));
  const bytes = readFileSync(bin);
  const hora = new Date().toUTCString();
  const lista = (id, item) => async () => ({ estado: 'nueva', hora, subastas: [{ id, item, cantidad: 5, precio: 40, tiempo: 'LONG' }] });
  const clienteBlizzard = () => ({ subastas: lista(1, 2589), mercancias: lista(2, 2592), objeto: async () => null });
  await casasDeNormal();
  const app = await abrir(ARGS, { clienteBlizzard, espacioComercio: 0 }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  await hasta(() => /historial de la casa 114 es de una versión más nueva/.test(readFileSync(join(h.datos, 'registro.log'), 'utf8')));
  await hasta(() => existsSync(join(carpeta, 'historial-117.bin'))); // la ronda ha guardado la otra casa (la neutral)
  assert.deepEqual(readFileSync(bin), bytes);
  assert.ok(!readdirSync(carpeta).some((n) => n.includes('.roto-')));
});


// ---------- biblioteca de guías (parte 2, tarea 7) ----------

// Un índice de pega: apunta lo que se le pide; con `colgar`, el primer actualizar() no acaba hasta que se suelte.
function indiceFalso({ colgar = false } = {}) {
  const f = { creados: [], orden: [], actualizaciones: 0, paradas: 0, vigiladas: [], suelta: null, ultimo: null };
  f.crear = (opciones) => {
    f.creados.push(opciones);
    f.ultimo = opciones;
    return {
      carpeta: join(opciones.datos, 'guias'),
      actualizar: () => {
        f.orden.push('actualizar');
        f.actualizaciones++;
        if (colgar && f.actualizaciones === 1) return new Promise((r) => { f.suelta = () => r({ guias: 0, noLeidos: 0, leidos: 0 }); });
        return Promise.resolve({ guias: 0, noLeidos: 0, leidos: 0 });
      },
      indice: () => ({ guias: [] }),
      vigilar: (o) => { f.orden.push('vigilar'); f.vigiladas.push(o); return () => { f.paradas++; }; },
    };
  };
  return f;
}
// Una página de pega para `obtenerPagina`: apunta las direcciones pedidas y, si `falla` tiene algo, lo lanza.
const obtenerFalso = (texto = '1. Acepta «Colmillos» en (40.5, 30.5)') => {
  const f = async (url) => {
    f.llamadas.push(url);
    if (f.falla) throw f.falla;
    return { url, tipo: 'text/plain; charset=utf-8', cuerpo: Buffer.from(texto) };
  };
  f.llamadas = [];
  f.falla = null;
  return f;
};
const registroLog = () => readFileSync(join(h.datos, 'registro.log'), 'utf8');

test('biblioteca: tras saberse AddOns se copia del juego, se indexa en segundo plano (el buzón sale antes) y se vigila; al salir se para', async () => {
  const indice = indiceFalso({ colgar: true });
  const copias = [];
  const copiarDelJuego = async (op) => { indice.orden.push('copia'); copias.push(op); return { copiados: [], apartados: 0 }; };
  const app = await abrir(ARGS, { crearIndice: indice.crear, copiarDelJuego });
  await app.listo; // el estado ya está publicado...
  assert.match(buzon(1), /claude\s*=\s*"ok"/);
  await hasta(() => indice.actualizaciones === 1);
  assert.ok(indice.suelta, '...y el primer actualizar() sigue sin acabar');
  assert.equal(copias.length, 1);
  assert.equal(copias[0].datos, h.datos);
  assert.equal(copias[0].addonsDir, h.addons);
  assert.ok(indice.orden.indexOf('copia') < indice.orden.indexOf('actualizar'), 'la copia va antes del primer índice');
  assert.equal(indice.creados.length, 1);
  assert.equal(indice.creados[0].datos, h.datos);
  assert.equal(indice.vigiladas.length, 1);
  assert.equal(app.biblioteca?.carpeta, join(h.datos, 'guias'));
  assert.equal(indice.paradas, 0);
  indice.suelta();
  await app.parar();
  assert.equal(indice.paradas, 1, 'al salir se para la vigilancia');
});

test('biblioteca: un fallo de la copia o del índice no tumba el arranque y el registro solo lleva códigos', async () => {
  const indice = indiceFalso();
  const crear = (op) => ({
    ...indice.crear(op),
    actualizar: async () => { const e = new Error('C:\\guias\\secreta.txt'); e.code = 'EPERM'; throw e; },
  });
  const copiarDelJuego = async () => { const e = new Error('C:\\AddOns\\secreta.lua'); e.code = 'EACCES'; throw e; };
  const app = await abrir(ARGS, { crearIndice: crear, copiarDelJuego });
  await app.listo;
  await hasta(() => /biblioteca: la copia del juego falló \(EACCES\)/.test(registroLog()));
  await hasta(() => /biblioteca: el índice falló \(EPERM\)/.test(registroLog()));
  assert.doesNotMatch(registroLog(), /secreta/);
  assert.match(buzon(1), /claude\s*=\s*"ok"/);
});

test('biblioteca: con el índice de verdad, el arranque deja biblioteca\\indice.json (usa la base del núcleo)', async () => {
  mkdirSync(join(h.datos, 'guias'), { recursive: true });
  writeFileSync(join(h.datos, 'guias', 'mia.txt'), 'Guía mía\n1. Habla con alguien.\n');
  const app = await abrir(ARGS, { crearIndice: undefined, copiarDelJuego: undefined });
  await app.listo;
  await hasta(() => existsSync(join(h.datos, 'biblioteca', 'indice.json')), 5000);
  const x = JSON.parse(readFileSync(join(h.datos, 'biblioteca', 'indice.json'), 'utf8'));
  assert.equal(x.version, 1);
  assert.ok(typeof x.base === 'string' && x.base !== '', 'se indexó con la base cargada');
  assert.ok(app.biblioteca.indice().firmas['mia.txt']);
});

test('biblioteca: el menú «guias» abre <datos>\\guias (y la crea si falta)', async () => {
  const f = bandejaFalsa();
  const abiertas = [];
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, abrir: (r) => abiertas.push(r) });
  await app.listo;
  f.alMenu('guias');
  assert.deepEqual(abiertas, [join(h.datos, 'guias')]);
  assert.ok(existsSync(join(h.datos, 'guias')));
});

// Los globos que salen después de `await app.listo` (los de arrancar, como «carpetas creadas», quedan fuera).
function globosNuevos(f) {
  const base = f.globos.length;
  return {
    textos: () => f.globos.slice(base).map((g) => g.texto),
    espera: (n) => hasta(() => f.globos.length >= base + n),
  };
}

test('biblioteca: el menú «enlace» con una dirección en el portapapeles la baja y sale el globo con el sitio', async () => {
  const f = bandejaFalsa();
  const obtener = obtenerFalso();
  const app = await abrir(['--sin-captura'], {
    lanzarBandeja: f.lanzar, obtenerPagina: obtener, leerPortapapeles: async () => '  Mira esto: https://games.gg/baldios\r\n',
  });
  await app.listo;
  const g = globosNuevos(f);
  f.alMenu('enlace');
  await g.espera(1);
  assert.deepEqual(obtener.llamadas, ['https://games.gg/baldios']);
  assert.deepEqual(g.textos(), ['Enlace añadido: games.gg']);
  assert.equal(readdirSync(join(h.datos, 'guias', 'enlaces')).length, 1);
  assert.doesNotMatch(registroLog(), /games\.gg/);
});

test('biblioteca: «enlace» que falla da el globo con el motivo (sin la dirección)', async () => {
  const f = bandejaFalsa();
  const obtener = obtenerFalso();
  let portapapeles = 'https://games.gg/uno';
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, obtenerPagina: obtener, leerPortapapeles: async () => portapapeles });
  await app.listo;
  const g = globosNuevos(f);
  obtener.falla = new ErrorRed('tiempo', 'tardó demasiado');
  f.alMenu('enlace');
  await g.espera(1);
  portapapeles = 'http://localhost/x';
  f.alMenu('enlace');
  await g.espera(2);
  assert.deepEqual(g.textos(), [TEXTOS_APP.es.enlaceFallo.tiempo, TEXTOS_APP.es.enlaceFallo.red_local]);
  assert.doesNotMatch(g.textos().join(' '), /games\.gg|localhost/);
  assert.doesNotMatch(registroLog(), /games\.gg|localhost/);
});

test('biblioteca: «enlace» sin dirección en el portapapeles (o sin poder leerlo) lo dice y no baja nada', async () => {
  const f = bandejaFalsa();
  const obtener = obtenerFalso();
  let portapapeles = null;
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, obtenerPagina: obtener, leerPortapapeles: async () => portapapeles });
  await app.listo;
  const g = globosNuevos(f);
  let esperados = 0;
  for (const caso of ['hola, no hay nada', '', '   ', null]) {
    portapapeles = caso;
    f.alMenu('enlace');
    esperados++;
    await g.espera(esperados);
  }
  assert.equal(obtener.llamadas.length, 0);
  assert.deepEqual(g.textos(), Array(4).fill(TEXTOS_APP.es.enlaceSinDireccion));
});

test('biblioteca: el menú «enlaces» baja las pendientes y vuelve a bajar las copias viejas', async () => {
  const f = bandejaFalsa();
  const obtener = obtenerFalso('1. Habla con alguien.');
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, obtenerPagina: obtener, leerPortapapeles: async () => 'https://games.gg/dos' });
  await app.listo;
  const g = globosNuevos(f);
  f.alMenu('enlace'); // una copia vieja: la de /dos
  await g.espera(1);
  writeFileSync(join(h.datos, 'guias', 'enlaces.txt'), '# mis enlaces\nhttps://games.gg/uno\n');
  obtener.llamadas.length = 0;
  f.alMenu('enlaces');
  await g.espera(2);
  assert.deepEqual([...obtener.llamadas].sort(), ['https://games.gg/dos', 'https://games.gg/uno']);
  assert.equal(g.textos()[1], TEXTOS_APP.es.enlacesActualizados(2, 0));
  assert.equal(readdirSync(join(h.datos, 'guias', 'enlaces')).length, 2);
  // otra vez: las copias se vuelven a bajar siempre
  f.alMenu('enlaces');
  await g.espera(3);
  assert.equal(g.textos()[2], TEXTOS_APP.es.enlacesActualizados(2, 0));
  // con una que falla, el globo dice cuántas
  obtener.falla = new ErrorRed('conexion', 'sin red');
  f.alMenu('enlaces');
  await g.espera(4);
  assert.equal(g.textos()[3], TEXTOS_APP.es.enlacesActualizados(0, 2));
});

test('biblioteca: «enlaces» sin ninguna copia ni pendiente dice que no hay enlaces', async () => {
  const f = bandejaFalsa();
  const obtener = obtenerFalso();
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, obtenerPagina: obtener });
  await app.listo;
  const g = globosNuevos(f);
  f.alMenu('enlaces');
  await g.espera(1);
  assert.deepEqual(g.textos(), [TEXTOS_APP.es.enlacesNinguno]);
  assert.equal(obtener.llamadas.length, 0);
});

// Revisión de la tarea A (Minor 4): con todas las copias rechazadas, el globo decía «No hay enlaces que actualizar».
test('biblioteca: «enlaces» dice cuántas se rechazaron (solas o junto a las bajadas)', async () => {
  const f = bandejaFalsa();
  const obtener = obtenerFalso('1. Habla con alguien.');
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, obtenerPagina: obtener });
  await app.listo;
  const g = globosNuevos(f);
  mkdirSync(join(h.datos, 'guias', 'enlaces'), { recursive: true });
  writeFileSync(join(h.datos, 'guias', 'enlaces', 'casa.txt'), '# Dirección: https://192.168.1.1/guia\n\nx\n');
  f.alMenu('enlaces');
  await g.espera(1);
  assert.deepEqual(g.textos(), [TEXTOS_APP.es.enlacesRechazados(1)]);
  writeFileSync(join(h.datos, 'guias', 'enlaces.txt'), 'https://games.gg/uno\nno es una dirección\n');
  f.alMenu('enlaces');
  await g.espera(2);
  assert.equal(g.textos()[1], `${TEXTOS_APP.es.enlacesActualizados(1, 0)} ${TEXTOS_APP.es.enlacesRechazados(2)}`);
  assert.deepEqual(obtener.llamadas, ['https://games.gg/uno']);
  assert.doesNotMatch(registroLog(), /192\.168|games\.gg/);
});

test('biblioteca: lo pendiente que ve el índice se baja una vez por sesión (un fallo no se repite)', async () => {
  const indice = indiceFalso();
  const obtener = obtenerFalso('1. Habla con alguien.');
  const app = await abrir(ARGS, { crearIndice: indice.crear, obtenerPagina: obtener });
  await app.listo;
  assert.equal(typeof indice.ultimo?.alTerminar, 'function');
  mkdirSync(join(h.datos, 'guias'), { recursive: true });
  writeFileSync(join(h.datos, 'guias', 'rota.url'), '[InternetShortcut]\r\nURL=https://games.gg/rota\r\n');
  obtener.falla = new ErrorRed('conexion', 'sin red');
  indice.ultimo.alTerminar({ guias: 0, noLeidos: 0, leidos: 0 });
  await hasta(() => obtener.llamadas.length === 1);
  await esperar(40);
  obtener.falla = null; // vuelve la red: la rota no se reintenta sola...
  indice.ultimo.alTerminar({});
  indice.ultimo.alTerminar({});
  await esperar(60);
  assert.deepEqual(obtener.llamadas, ['https://games.gg/rota']);
  // ...pero una dirección nueva sí
  writeFileSync(join(h.datos, 'guias', 'enlaces.txt'), 'https://games.gg/buena\n');
  indice.ultimo.alTerminar({});
  await hasta(() => obtener.llamadas.length === 2);
  assert.equal(obtener.llamadas[1], 'https://games.gg/buena');
  await hasta(() => existsSync(join(h.datos, 'guias', 'enlaces')) && readdirSync(join(h.datos, 'guias', 'enlaces')).length === 1);
  indice.ultimo.alTerminar({}); // la copia ya existe: ya no es pendiente
  await esperar(50);
  assert.equal(obtener.llamadas.length, 2);
  assert.doesNotMatch(registroLog(), /games\.gg/);
});

// Punto de prueba A: enlaces.txt con una dirección de la red de casa daba «bajados 1, fallidos 0» y nada más.
test('biblioteca: las pendientes rechazadas (red local, mal escritas) se cuentan aparte y salen en un globo por tanda', async () => {
  const f = bandejaFalsa();
  const indice = indiceFalso();
  const obtener = obtenerFalso('1. Habla con alguien.');
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, crearIndice: indice.crear, obtenerPagina: obtener });
  await app.listo;
  const g = globosNuevos(f);
  mkdirSync(join(h.datos, 'guias'), { recursive: true });
  writeFileSync(join(h.datos, 'guias', 'enlaces.txt'), 'https://games.gg/buena\nhttps://192.168.1.1/\nesto no es una dirección\n');
  indice.ultimo.alTerminar({});
  await hasta(() => /enlaces pendientes bajados 1, fallidos 0, rechazados 2/.test(registroLog()));
  await g.espera(1);
  assert.deepEqual(g.textos(), [TEXTOS_APP.es.enlacesRechazados(2)]);
  assert.deepEqual(obtener.llamadas, ['https://games.gg/buena'], 'la de la red local no se pide');
  // la pasada siguiente no repite el globo por las mismas rechazadas
  indice.ultimo.alTerminar({});
  indice.ultimo.alTerminar({});
  await esperar(60);
  assert.equal(g.textos().length, 1);
  // una rechazada nueva, sí (un globo por tanda)
  writeFileSync(join(h.datos, 'guias', 'casa.url'), '[InternetShortcut]\r\nURL=http://localhost/guia\r\n');
  indice.ultimo.alTerminar({});
  await g.espera(2);
  assert.deepEqual(g.textos(), [TEXTOS_APP.es.enlacesRechazados(2), TEXTOS_APP.es.enlacesRechazados(1)]);
  assert.doesNotMatch(registroLog(), /192\.168|localhost|games\.gg/);
  for (const idioma of ['es', 'en']) assert.match(TEXTOS_APP[idioma].enlacesRechazados(3), /3/);
});

test('lanzarBandeja: las acciones guias, enlace y enlaces llegan a alMenu', async () => {
  const hijos = [];
  const menus = [];
  const b = lanzarBandeja({ lanzar: () => { const x = hijoFalso(); hijos.push(x); return x; }, esperas: [5], alMenu: (a) => menus.push(a) });
  hijos[0].stdout.write('{"t":"menu","accion":"guias"}\n{"t":"menu","accion":"enlace"}\n{"t":"menu","accion":"enlaces"}\n{"t":"menu","accion":"rara"}\n');
  await esperar(20);
  assert.deepEqual(menus, ['guias', 'enlace', 'enlaces']);
  await b.parar();
});

test('bandeja.ps1: las tres entradas nuevas van detrás de «Abrir la carpeta de datos» y mandan sus acciones', () => {
  const ps1 = readFileSync(SCRIPT_BANDEJA, 'utf8');
  const textos = ["accion = 'carpeta'", "accion = 'guias'", "accion = 'enlace'", "accion = 'enlaces'", "accion = 'inicio'"];
  const posiciones = textos.map((t) => ps1.indexOf(t));
  assert.ok(posiciones.every((x) => x > 0), String(posiciones));
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, 'en ese orden');
  assert.match(ps1, /guias = 'guias'; enlace = 'enlace'; enlaces = 'enlaces'/);
});

test('biblioteca: los textos de menú y globos están en es y en', () => {
  for (const idioma of ['es', 'en']) {
    const t = TEXTOS_APP[idioma];
    for (const k of ['guias', 'enlace', 'enlaces']) assert.ok(typeof t.menu[k] === 'string' && t.menu[k] !== '', `${idioma}.menu.${k}`);
    for (const k of ['enlaceSinDireccion', 'enlacesNinguno']) assert.ok(typeof t[k] === 'string' && t[k] !== '', `${idioma}.${k}`);
    assert.match(t.enlaceAnadido('games.gg'), /games\.gg/);
    assert.match(t.enlacesActualizados(3, 1), /3.*1|1.*3/);
    for (const m of ['url', 'red_local', 'tamano', 'estado', 'tiempo', 'conexion', 'vacio']) {
      assert.ok(typeof t.enlaceFallo[m] === 'string' && t.enlaceFallo[m] !== '', `${idioma}.enlaceFallo.${m}`);
    }
  }
  assert.equal(TEXTOS_APP.es.menu.guias, 'Abrir la carpeta de guías');
  assert.equal(TEXTOS_APP.es.menu.enlace, 'Añadir enlace (del portapapeles)');
  assert.equal(TEXTOS_APP.es.menu.enlaces, 'Actualizar los enlaces');
  assert.equal(TEXTOS_APP.es.enlaceAnadido('games.gg'), 'Enlace añadido: games.gg');
});

// leerPortapapeles: PowerShell con Get-Clipboard -Raw, sin ventana
function powershellFalso({ salida = '', codigo = 0, colgar = false } = {}) {
  const f = { llamadas: [], matado: 0 };
  f.lanzar = (exe, args, opciones) => {
    const hijo = new EventEmitter();
    hijo.stdout = new PassThrough();
    hijo.kill = () => { f.matado++; };
    f.llamadas.push({ exe, args, opciones });
    if (!colgar) {
      setImmediate(() => {
        hijo.stdout.write(Buffer.from(salida, 'utf8'));
        hijo.stdout.end();
        hijo.emit('close', codigo);
      });
    }
    return hijo;
  };
  return f;
}

test('leerPortapapeles: PowerShell (ruta completa) con Get-Clipboard -Raw, sin ventana ni shell, y quita el salto final', async () => {
  const f = powershellFalso({ salida: 'https://games.gg/guía\r\n' });
  assert.equal(await leerPortapapeles({ lanzar: f.lanzar, env: { SystemRoot: 'C:\\Windows' } }), 'https://games.gg/guía');
  assert.equal(f.llamadas.length, 1);
  assert.equal(f.llamadas[0].exe, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.ok(f.llamadas[0].args.includes('-NoProfile'));
  assert.match(f.llamadas[0].args.join(' '), /Get-Clipboard -Raw/);
  assert.equal(f.llamadas[0].opciones.windowsHide, true);
  assert.ok(!f.llamadas[0].opciones.shell);
});

test('leerPortapapeles: null si PowerShell falla, no arranca o tarda demasiado (y entonces se cierra ese proceso)', async () => {
  const env = { SystemRoot: 'C:\\Windows' };
  assert.equal(await leerPortapapeles({ lanzar: powershellFalso({ salida: 'x', codigo: 1 }).lanzar, env }), null);
  assert.equal(await leerPortapapeles({ lanzar: () => { throw new Error('ENOENT'); }, env }), null);
  const conError = () => {
    const hijo = new EventEmitter();
    hijo.stdout = new PassThrough();
    setImmediate(() => hijo.emit('error', new Error('ENOENT')));
    return hijo;
  };
  assert.equal(await leerPortapapeles({ lanzar: conError, env }), null);
  const colgado = powershellFalso({ colgar: true });
  assert.equal(await leerPortapapeles({ lanzar: colgado.lanzar, env, tiempoMax: 20 }), null);
  assert.equal(colgado.matado, 1);
});

test('leerPortapapeles: un portapapeles enorme se recorta (no llena la memoria)', async () => {
  const f = powershellFalso({ salida: 'a'.repeat(300_000) });
  const t = await leerPortapapeles({ lanzar: f.lanzar, env: { SystemRoot: 'C:\\Windows' } });
  assert.ok(typeof t === 'string' && t.length <= 65_536);
});

// ---------- biblioteca: arreglos de la revisión (ronda 1) ----------

test('biblioteca: en la primera instalación (sin <datos>\guias) la vigilancia funciona: un archivo soltado después sale sin esperar al repaso', async () => {
  assert.equal(existsSync(join(h.datos, 'guias')), false);
  const app = await abrir(ARGS, { crearIndice: undefined, copiarDelJuego: undefined, vigilarBiblioteca: { espera: 50, intervalo: 600_000 } });
  await app.listo;
  await hasta(() => existsSync(join(h.datos, 'biblioteca', 'indice.json')), 5000);
  await app.biblioteca.actualizar(); // sin pasada en marcha
  writeFileSync(join(h.datos, 'guias', 'suelta.txt'), 'Guía suelta\n1. Habla con alguien.\n');
  await hasta(() => app.biblioteca.indice().firmas['suelta.txt'], 5000);
});

test('biblioteca: «enlace» quita la puntuación del final de la dirección', async () => {
  const f = bandejaFalsa();
  const obtener = obtenerFalso();
  let portapapeles = '(mira https://games.gg/guia).';
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, obtenerPagina: obtener, leerPortapapeles: async () => portapapeles });
  await app.listo;
  const g = globosNuevos(f);
  f.alMenu('enlace');
  await g.espera(1);
  portapapeles = 'https://games.gg/otra,';
  f.alMenu('enlace');
  await g.espera(2);
  portapapeles = 'https://games.gg/x?a=1&b=2;';
  f.alMenu('enlace');
  await g.espera(3);
  assert.deepEqual(obtener.llamadas, ['https://games.gg/guia', 'https://games.gg/otra', 'https://games.gg/x?a=1&b=2']);
});

test('biblioteca: «Actualizar los enlaces» sin red cuenta la copia como fallida y el texto de fallo existe en es y en', async () => {
  const f = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar });
  await app.listo;
  const g = globosNuevos(f);
  mkdirSync(join(h.datos, 'guias', 'enlaces'), { recursive: true });
  writeFileSync(join(h.datos, 'guias', 'enlaces', 'a.txt'), '# Dirección: https://games.gg/a\n\nx\n');
  f.alMenu('enlaces');
  await g.espera(1);
  assert.equal(g.textos()[0], TEXTOS_APP.es.enlacesActualizados(0, 1));
  for (const idioma of ['es', 'en']) assert.ok(TEXTOS_APP[idioma].enlacesFallo);
});

test('biblioteca: tras recargarBase() bien hecho, el índice se rehace con la base nueva', async () => {
  const toc = (v) => `## Interface: 16001\n## Title: SnetForever_Misiones\n## Version: ${v}\n\nnucleo.lua\n`;
  mkdirSync(join(h.addons, 'SnetForever_Misiones'), { recursive: true });
  writeFileSync(join(h.addons, 'SnetForever_Misiones', 'SnetForever_Misiones.toc'), toc('2026.11.10.1'));
  const reloj = relojFalso();
  let aplicar = () => ({ estado: 'nada' });
  const act = actualizadorFalso({ aplicar: () => aplicar() });
  const indice = indiceFalso();
  const app = await abrir(ARGS, { reloj, actualizador: act.crear, crearIndice: indice.crear });
  await app.listo;
  await app.nucleo.baseActual();
  await hasta(() => indice.actualizaciones === 1);
  writeFileSync(join(h.addons, 'SnetForever_Misiones', 'SnetForever_Misiones.toc'), toc('2026.11.12.1'));
  aplicar = () => ({ estado: 'aplicado', aplicados: ['misiones'] });
  await reloj.avanzar(60_000);
  await hasta(() => indice.actualizaciones === 2);
});

// ---------- S8: el puente con TATI (solo con puenteTati.activo: true) ----------

// Un cerebro de pega (lo que da crearCerebro): comprobar() da `f.siguiente` y lo recuerda como último.
function cerebroFalso(siguiente = 'desconocido') {
  const f = { siguiente, estado: 'desconocido', comprobaciones: 0, opciones: null };
  f.crear = (opciones) => {
    f.opciones = opciones;
    return {
      turno: async () => ({ ok: false, tipo: 'tati_cerrada', detalle: '', motor: 'tati' }),
      comprobar: async () => { f.comprobaciones++; f.estado = f.siguiente; return f.estado; },
      ultimo: () => f.estado,
    };
  };
  return f;
}
const conPuente = (extra = {}) => {
  mkdirSync(h.datos, { recursive: true });
  writeFileSync(join(h.datos, 'config.json'), JSON.stringify({ puenteTati: { activo: true, ...extra } }));
};
const configLeida = () => JSON.parse(readFileSync(join(h.datos, 'config.json'), 'utf8'));
const PEDIR_RAPIDO = { acuseMs: 3000, tiempoMs: 5000 };

test('S8: sin puenteTati (o sin activo: true exacto) nada nuevo: ni «Cerebro», ni puente-tati, ni latido; sus acciones no hacen nada', async () => {
  for (const config of [null, { puenteTati: { activo: 'true', cerebro: 'tati' } }, { puenteTati: { cerebro: 'tati' } }]) {
    mkdirSync(h.datos, { recursive: true });
    if (config) writeFileSync(join(h.datos, 'config.json'), JSON.stringify(config));
    const f = bandejaFalsa();
    const cerebro = cerebroFalso('ok');
    const abiertas = [];
    const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, crearCerebro: cerebro.crear, abrir: (r) => abiertas.push(r) });
    await app.listo;
    assert.deepEqual(f.cerebros, [], 'sin el puente, a la bandeja no se le manda «cerebro»');
    assert.equal(cerebro.opciones, null, 'no se crea el cerebro');
    assert.doesNotMatch(buzon(1), /latido/);
    assert.match(buzon(1), /motorNombre\s*=\s*"claude"/);
    assert.equal(f.estados.at(-1).texto, 'Motor: Claude Code listo (2.1.311)');
    f.alMenu('cerebro', 'tati');
    f.alMenu('complemento_tati');
    f.alMenu('comprobar');
    await esperar(150);
    assert.equal(existsSync(join(h.datos, 'puente-tati')), false, JSON.stringify(config));
    assert.equal(existsSync(join(h.datos, 'tati')), false);
    assert.deepEqual(abiertas, []);
    assert.equal(cerebro.comprobaciones, 0);
    if (config) assert.deepEqual(configLeida(), config, 'config.json no cambia');
    else assert.equal(existsSync(join(h.datos, 'config.json')), false);
    await app.parar();
  }
});

test('S8: con el puente, la bandeja enseña «Cerebro» (IA de SnetForever), el buzón lleva latido y elegir TATI lo guarda y se publica con motorNombre tati', async () => {
  conPuente();
  const f = bandejaFalsa();
  const cerebro = cerebroFalso('desconocido');
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, crearCerebro: cerebro.crear });
  await app.listo;
  assert.deepEqual(f.cerebros.at(-1), { visible: true, valor: 'snetforever' });
  assert.equal(cerebro.opciones.carpeta, join(h.datos, 'puente-tati'));
  assert.match(buzon(1), /latido\s*=\s*true/);
  assert.match(buzon(1), /motorNombre\s*=\s*"claude"/);
  assert.equal(f.estados.at(-1).texto, 'Motor: Claude Code listo (2.1.311)', 'con la IA de SnetForever, la línea de siempre');
  assert.equal(cerebro.comprobaciones, 0, 'con la IA de SnetForever no se pregunta a TATI');

  f.alMenu('cerebro', 'tati');
  await hasta(() => /motorNombre\s*=\s*"tati"/.test(buzon(1)));
  assert.deepEqual(configLeida().puenteTati, { activo: true, cerebro: 'tati' });
  assert.deepEqual(f.cerebros.at(-1), { visible: true, valor: 'tati' });
  await hasta(() => f.estados.at(-1).texto === 'Cerebro: TATI (no responde)');
  assert.ok(cerebro.comprobaciones >= 1);
  assert.match(buzon(1), /[^a-zA-Z]motor\s*=\s*"desconocido"/);
  assert.equal(f.estados.at(-1).icono, 'aviso');

  // «Comprobar» también pregunta a TATI: conectada, la línea lo dice y el buzón se vuelve a publicar con motor ok
  cerebro.siguiente = 'ok';
  f.alMenu('comprobar');
  await hasta(() => f.estados.at(-1).texto === 'Cerebro: TATI (conectada)');
  await hasta(() => /[^a-zA-Z]motor\s*=\s*"ok"/.test(buzon(1)));
  assert.equal(f.estados.at(-1).icono, 'ok');
  assert.equal(f.estados.at(-1).tooltip, 'Cerebro: TATI (conectada)');

  // un valor que no es de los dos no hace nada; volver a la IA de SnetForever
  f.alMenu('cerebro', 'rara');
  f.alMenu('cerebro', 'snetforever');
  await hasta(() => /motorNombre\s*=\s*"claude"/.test(buzon(1)));
  assert.deepEqual(configLeida().puenteTati, { activo: true, cerebro: 'snetforever' });
  await hasta(() => f.estados.at(-1).texto === 'Motor: Claude Code listo (2.1.311)');
});

test('S8: con el cerebro TATI, se pregunta a TATI al arrancar y cada rato (cada 30 min, con los motores)', async () => {
  conPuente({ cerebro: 'tati' });
  const f = bandejaFalsa();
  const cerebro = cerebroFalso('ok');
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, crearCerebro: cerebro.crear, intervalos: { motores: 40 } });
  await app.listo;
  await hasta(() => cerebro.comprobaciones >= 1);
  assert.deepEqual(f.cerebros.at(-1), { visible: true, valor: 'tati' });
  await hasta(() => f.estados.at(-1).texto === 'Cerebro: TATI (conectada)');
  await hasta(() => /motorNombre\s*=\s*"tati"/.test(buzon(1)) && /[^a-zA-Z]motor\s*=\s*"ok"/.test(buzon(1)));
  const antes = cerebro.comprobaciones;
  await hasta(() => cerebro.comprobaciones >= antes + 2);
});

test('S8: en inglés la línea es «Brain: TATI (…)» y los textos del menú son los de los errores de TATI', async () => {
  for (const idioma of ['es', 'en']) {
    const m = TEXTOS_APP[idioma].menu;
    for (const k of ['cerebro', 'cerebroSnetforever', 'cerebroTati', 'complementoTati']) assert.ok(typeof m[k] === 'string' && m[k] !== '', `${idioma}.menu.${k}`);
    for (const k of ['ok', 'desconocido']) assert.ok(TEXTOS_APP[idioma].cerebroTati[k], `${idioma}.cerebroTati.${k}`);
    for (const k of ['complementoListo', 'complementoFallo', 'cerebroNoGuardado']) assert.ok(TEXTOS_APP[idioma][k], `${idioma}.${k}`);
  }
  assert.deepEqual([TEXTOS_APP.es.menu.cerebro, TEXTOS_APP.es.menu.cerebroSnetforever, TEXTOS_APP.es.menu.cerebroTati, TEXTOS_APP.es.menu.complementoTati],
    ['Cerebro', 'IA de SnetForever', 'TATI', 'Preparar el complemento para TATI']);
  assert.deepEqual(TEXTOS_APP.es.cerebroTati, { ok: 'Cerebro: TATI (conectada)', desconocido: 'Cerebro: TATI (no responde)' });
  assert.equal(TEXTOS_APP.en.menu.cerebroSnetforever, 'SnetForever AI');
  assert.ok(ERRORES_TATI.en.tati_cerrada.includes(`"${TEXTOS_APP.en.menu.cerebroSnetforever}"`));
  assert.ok(ERRORES_TATI.es.tati_cerrada.includes(`«${TEXTOS_APP.es.menu.cerebroSnetforever}»`));
  assert.match(ERRORES_TATI.en.tati_cerrada, new RegExp(TEXTOS_APP.en.menu.cerebro, 'i'));
  assert.deepEqual(TEXTOS_APP.en.cerebroTati, { ok: 'Brain: TATI (connected)', desconocido: 'Brain: TATI (not responding)' });

  conPuente({ cerebro: 'tati' });
  const f = bandejaFalsa();
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, crearCerebro: cerebroFalso('desconocido').crear }, { ...process.env, SNF_IDIOMA: 'en' });
  await app.listo;
  await hasta(() => f.estados.at(-1).texto === 'Brain: TATI (not responding)');
});

test('S8: «Preparar el complemento para TATI» genera la carpeta (con node y el SnetForever.vbs) y la abre; la de antes va a la cuarentena', async () => {
  conPuente();
  const f = bandejaFalsa();
  const abiertas = [];
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, crearCerebro: cerebroFalso().crear, abrir: (r) => abiertas.push(r) });
  await app.listo;
  const g = globosNuevos(f);
  f.alMenu('complemento_tati');
  const carpeta = join(h.datos, 'tati', 'complemento-snetforever');
  await hasta(() => abiertas.length === 1);
  assert.deepEqual(abiertas, [carpeta]);
  const mcp = JSON.parse(readFileSync(join(carpeta, '.mcp.json'), 'utf8')).mcpServers.snetforever;
  assert.equal(mcp.env.SNF_DATOS, h.datos);
  assert.match(mcp.env.SNF_LANZADOR, /\\SnetForever\.vbs$/);
  assert.equal(mcp.command, process.execPath);
  assert.equal(JSON.parse(readFileSync(join(carpeta, 'herramientas.json'), 'utf8')).length, 14, 'las once de antes, instrucciones, guardar_guia y abrir_guia');
  await g.espera(1);
  assert.equal(g.textos()[0], TEXTOS_APP.es.complementoListo);
  f.alMenu('complemento_tati');
  await hasta(() => abiertas.length === 2);
  const q = join(h.datos, 'cuarentena');
  assert.ok(readdirSync(q).some((d) => readdirSync(join(q, d)).includes('complemento-snetforever')), 'la de antes está en la cuarentena');
});

test('S8: si no se puede generar el complemento, un globo y nada abierto; el registro solo lleva el código', async () => {
  conPuente();
  const f = bandejaFalsa();
  const abiertas = [];
  const generarComplemento = () => { throw Object.assign(new Error('C:\\secreta\\ruta'), { code: 'EACCES' }); };
  const app = await abrir(['--sin-captura'], { lanzarBandeja: f.lanzar, crearCerebro: cerebroFalso().crear, abrir: (r) => abiertas.push(r), generarComplemento });
  await app.listo;
  const g = globosNuevos(f);
  f.alMenu('complemento_tati');
  await g.espera(1);
  assert.equal(g.textos()[0], TEXTOS_APP.es.complementoFallo);
  assert.deepEqual(abiertas, []);
  assert.match(registroLog(), /complemento para TATI: no se pudo preparar \(EACCES\)/);
  assert.doesNotMatch(registroLog(), /secreta/);
});

test('S8: al arrancar, los relevo-<pid>.* de relevos que ya no viven van a la cuarentena (los vivos y lo demás se quedan)', async () => {
  conPuente();
  const puente = join(h.datos, 'puente-tati');
  mkdirSync(puente, { recursive: true });
  const nombres = ['relevo-111.pedido.json', 'relevo-111.respuesta.json', 'relevo-222.pedido.json', 'relevo-222.respuesta.json',
    'relevo-222.respuesta.json.tmp', 'tati.pedido.json', 'relevo-x.pedido.json'];
  for (const nombre of nombres) writeFileSync(join(puente, nombre), '{}');
  const preguntados = [];
  const pidVivo = (pid) => { preguntados.push(pid); return pid === 111; };
  const app = await abrir(ARGS, { crearCerebro: cerebroFalso().crear, pidVivo });
  await app.listo;
  assert.deepEqual(readdirSync(puente).sort(), ['relevo-111.pedido.json', 'relevo-111.respuesta.json', 'relevo-x.pedido.json', 'tati.pedido.json']);
  const q = join(h.datos, 'cuarentena');
  const apartados = readdirSync(q).flatMap((d) => readdirSync(join(q, d)));
  assert.deepEqual(apartados.filter((n) => n.startsWith('relevo-')).sort(), ['relevo-222.pedido.json', 'relevo-222.respuesta.json', 'relevo-222.respuesta.json.tmp']);
  assert.deepEqual([...new Set(preguntados)].sort(), [111, 222]);
});

// Revisión final (M2): los relevos que se cierran con la app abierta también se apartan, cada 30 minutos (el temporizador
// de los motores), salvo el canal que tiene un pedido en curso (la vuelta de atender aún escribirá su respuesta).
test('M2 (revisión final): cada 30 minutos también se apartan los relevos muertos, salvo el que tiene un pedido en curso', async () => {
  conPuente();
  const puente = join(h.datos, 'puente-tati');
  mkdirSync(puente, { recursive: true });
  let manejar = null;
  const atender = (carpeta, patron, fn) => { manejar = fn; return { parar: async () => {} }; };
  let soltar = null;
  const crearAcciones = () => ({ definiciones: () => [], ejecutar: () => new Promise((r) => { soltar = r; }) });
  const app = await abrir(ARGS, { crearCerebro: cerebroFalso().crear, crearAcciones, atender, pidVivo: () => false, intervalos: { motores: 40 } });
  await app.listo;
  const enCurso = manejar('relevo-333', { tipo: 'herramienta', nombre: 'escribir_chat', argumentos: { texto: 'hola' } });
  await hasta(() => soltar !== null);
  for (const n of ['relevo-333.pedido.json', 'relevo-333.respuesta.json', 'relevo-444.pedido.json', 'relevo-444.respuesta.json']) {
    writeFileSync(join(puente, n), '{}');
  }
  await hasta(() => !readdirSync(puente).includes('relevo-444.pedido.json'));
  await esperar(150); // unas cuantas vueltas más del temporizador
  assert.deepEqual(readdirSync(puente).filter((n) => n.startsWith('relevo-')).sort(), ['relevo-333.pedido.json', 'relevo-333.respuesta.json']);
  soltar({ ok: true });
  assert.deepEqual(await enCurso, { estado: 'hecho', resultado: { ok: true } });
  await hasta(() => !readdirSync(puente).some((n) => n.startsWith('relevo-')));
  const q = join(h.datos, 'cuarentena');
  const apartados = readdirSync(q).flatMap((d) => readdirSync(join(q, d))).filter((n) => n.startsWith('relevo-')).sort();
  assert.deepEqual(apartados, ['relevo-333.pedido.json', 'relevo-333.respuesta.json', 'relevo-444.pedido.json', 'relevo-444.respuesta.json']);
});

test('S8: la app atiende los relevo-<pid> con acciones.ejecutar (el juego, de la captura) y deja de atenderlos al salir', async () => {
  conPuente();
  const app = await abrir(['--sin-bandeja'], { crearCerebro: cerebroFalso().crear, lanzarCaptura: capturaCon(false) });
  await app.listo;
  const puente = join(h.datos, 'puente-tati');
  const r = await pedir(puente, 'relevo-4321', { tipo: 'herramienta', nombre: 'estado_juego', argumentos: {} }, PEDIR_RAPIDO);
  assert.equal(r.estado, 'hecho', JSON.stringify(r));
  assert.equal(r.resultado.conocido, false);
  assert.equal(r.resultado.juego, 'cerrado', 'el juego cerrado sale de la captura');
  const pines = await pedir(puente, 'relevo-4321', { tipo: 'herramienta', nombre: 'poner_pines', argumentos: { marcas: ['B:1'] } }, PEDIR_RAPIDO);
  assert.deepEqual(pines.resultado, { error: 'juego_cerrado' });
  const otra = await pedir(puente, 'relevo-4321', { tipo: 'herramienta', nombre: 'no_existe', argumentos: {} }, PEDIR_RAPIDO);
  assert.deepEqual(otra.resultado, { error: 'herramienta_desconocida' });
  const mala = await pedir(puente, 'relevo-4321', { tipo: 'otra' }, PEDIR_RAPIDO);
  assert.deepEqual([mala.estado, mala.tipo], ['error', 'fallo']);
  // el canal de TATI (tati) no es de un relevo: la app no lo atiende
  const ajeno = await pedir(puente, 'tati', { tipo: 'estado' }, { acuseMs: 700, tiempoMs: 1000 });
  assert.equal(ajeno.tipo, 'sin_acuse');
  await app.parar();
  const tarde = await pedir(puente, 'relevo-4321', { tipo: 'herramienta', nombre: 'estado_juego', argumentos: {} }, { acuseMs: 800, tiempoMs: 1000 });
  assert.equal(tarde.tipo, 'sin_acuse', 'tras salir ya no se atiende');
});

test('S8: un fallo de acciones.ejecutar se contesta «fallo» y el canal sigue atendiendo', async () => {
  conPuente();
  let lanzar = true;
  let opciones = null;
  const crearAcciones = (op) => {
    opciones = op;
    return {
      definiciones: () => [],
      ejecutar: async (nombre) => {
        if (lanzar) throw new Error('C:\\secreta');
        return { nombre };
      },
    };
  };
  const app = await abrir(ARGS, { crearCerebro: cerebroFalso().crear, crearAcciones });
  await app.listo;
  assert.equal(typeof opciones.juegoAbierto, 'function');
  assert.equal(opciones.datos, h.datos);
  assert.equal(opciones.nucleo, app.nucleo);
  // guardar_guia reindexa con el índice de la app (el mismo que vigila la carpeta de guías)
  assert.equal(typeof opciones.biblioteca, 'function');
  assert.equal(opciones.biblioteca(), app.biblioteca);
  const puente = join(h.datos, 'puente-tati');
  const r = await pedir(puente, 'relevo-77', { tipo: 'herramienta', nombre: 'estado_juego', argumentos: {} }, PEDIR_RAPIDO);
  assert.deepEqual([r.estado, r.tipo], ['error', 'fallo']);
  assert.equal(JSON.stringify(r).includes('secreta'), false);
  lanzar = false;
  const bien = await pedir(puente, 'relevo-77', { tipo: 'herramienta', nombre: 'estado_juego', argumentos: {} }, PEDIR_RAPIDO);
  assert.deepEqual(bien.resultado, { nombre: 'estado_juego' });
});

// ---------- S8, ronda 1: el canal de los relevos desde el arranque ----------

test('S8 (ronda 1): sin núcleo todavía (AddOns sin saber), los relevos reciben acuse y app_preparandose', async () => {
  conPuente();
  const app = await abrir(ARGS, { crearCerebro: cerebroFalso().crear }, { ...process.env, SNF_ADDONS: join(h.base, 'no-existe') });
  const puente = join(h.datos, 'puente-tati');
  const r = await pedir(puente, 'relevo-4321', { tipo: 'herramienta', nombre: 'estado_juego', argumentos: {} }, PEDIR_RAPIDO);
  assert.equal(r.estado, 'hecho', JSON.stringify(r));
  assert.deepEqual(r.resultado, { error: 'app_preparandose' });
  assert.equal(app.nucleo, null, 'el núcleo sigue sin crearse');
});

test('S8 (ronda 1): cerrándose, un pedido de un relevo da app_cerrandose sin llamar a ejecutar', async () => {
  conPuente();
  let manejar = null;
  let paradas = 0;
  const atender = (carpeta, patron, fn) => { manejar = fn; return { parar: async () => { paradas++; } }; };
  const ejecutadas = [];
  const crearAcciones = () => ({ definiciones: () => [], ejecutar: async (nombre) => { ejecutadas.push(nombre); return { ok: true }; } });
  const app = await abrir(ARGS, { crearCerebro: cerebroFalso().crear, crearAcciones, atender });
  await app.listo;
  const pedido = { tipo: 'herramienta', nombre: 'escribir_chat', argumentos: { texto: 'hola' } };
  assert.deepEqual(await manejar('relevo-9', pedido), { estado: 'hecho', resultado: { ok: true } });
  await app.parar();
  assert.equal(paradas, 1, 'al salir se para el canal');
  assert.deepEqual(await manejar('relevo-9', pedido), { estado: 'hecho', resultado: { error: 'app_cerrandose' } });
  assert.deepEqual(ejecutadas, ['escribir_chat'], 'cerrándose no se ejecuta');
});

// ---------- F10: la app ve el escaneo de la subasta tras un /reload, sin cerrar el juego ----------

const REINO_F10 = 'Reino De Prueba 5';
const T_F10 = Date.UTC(2026, 10, 21, 12, 0); // lejos de las hh:20, para que el programador no haga rondas por su cuenta
const CASA_HORDA_F10 = 114;
const CASA_NEUTRAL_F10 = 121;
const MUESTRAS_F10 = [[100, 5], [110, 3], [120, 7], [130, 1]];

// Un escaneo con la forma real de SnetForeverCuenta.comercio.escaneos[facción de la subasta].
const escaneoLua = ({ faccion = 'Neutral', jugador = 'Horde', hora = T_F10 / 1000 - 600, reino = REINO_F10 } = {}) => `["${faccion}"] = {
["hora"] = ${hora},
["jugador"] = "${jugador}",
["identidad"] = {["region"] = "US", ["reino"] = "${reino}", ["faccion"] = "${faccion}"},
["muestras"] = {[2589] = {${MUESTRAS_F10.map(([p, c]) => `[${p}] = ${c}`).join(', ')}}},
},`;
const cuentaLua = ({ escaneos = [], faccion = 'Horde' } = {}) => `SnetForeverCuenta = {
["comercio"] = {
["identidad"] = {["region"] = "US", ["reino"] = "${REINO_F10}", ["faccion"] = "${faccion}"},
["escaneos"] = {
${escaneos.map(escaneoLua).join('\n')}
},
},
}
`;

// Escribe el SnetForever.lua de la cuenta con la fecha dada, como lo deja el juego al hacer /reload.
function guardarCuentaF10(raiz, contenido, mtimeMs) {
  const sv = join(raiz, 'WTF', 'Account', 'CUENTA', 'SavedVariables');
  mkdirSync(sv, { recursive: true });
  const archivo = join(sv, 'SnetForever.lua');
  writeFileSync(archivo, contenido);
  nodeFs.utimesSync(archivo, mtimeMs / 1000, mtimeMs / 1000);
  return archivo;
}

// Blizzard de pega: la casa de la Horda no cambia (cada ronda la pregunta una vez: sirve para contar rondas) y, entre las
// candidatas neutrales, solo la 121 se parece al escaneo.
function blizzardF10() {
  const b = { pedidas: [] };
  const casaIgual = (tipo) => async (casa) => {
    b.pedidas.push([tipo, casa]);
    if (tipo !== 'mercancias' || casa === CASA_HORDA_F10) return { estado: 'igual' };
    const filas = casa === CASA_NEUTRAL_F10 ? MUESTRAS_F10 : [[100, 9]];
    return {
      estado: 'nueva',
      hora: new Date(T_F10).toUTCString(),
      subastas: filas.map(([precio, cantidad], k) => ({ id: k + 1, item: 2589, cantidad, precio, tiempo: 'LONG' })),
    };
  };
  b.crear = () => ({ subastas: casaIgual('subastas'), mercancias: casaIgual('mercancias'), objeto: async () => null });
  b.rondas = () => b.pedidas.filter(([tipo, casa]) => tipo === 'subastas' && casa === CASA_HORDA_F10).length;
  b.candidatas = (lista) => b.pedidas.filter(([tipo, casa]) => tipo === 'mercancias' && lista.includes(casa)).length;
  return b;
}

// La app con el personaje de la Horda ya sabido y su casa descubierta; `abierto` dice si el juego está abierto.
async function appF10({ abierto = true, antes } = {}) {
  const { raiz, addons } = juegoDePrueba();
  const carpeta = join(h.datos, 'comercio');
  mkdirSync(carpeta, { recursive: true });
  const e = crearEstadoComercio({ fs: nodeFs, carpeta });
  e.ponerIdentidad({ region: 'US', reino: REINO_F10, faccion: 'Horde' });
  e.aprender(REINO_F10, 'Horde', CASA_HORDA_F10);
  antes?.(e);
  await e.guardar();
  const juego = juegoFalso({ abierto: abierto ? join(raiz, 'Wow.exe') : null });
  const reloj = relojFalso();
  reloj.ms = T_F10;
  reloj.ahora = () => reloj.ms;
  const b = blizzardF10();
  const app = await abrir(ARGS, { juego, reloj, clienteBlizzard: b.crear, intervalos: { avisos: 60_000 } }, { ...process.env, SNF_ADDONS: addons });
  await app.listo;
  await esperar(30);
  return { raiz, juego, reloj, b, app };
}
const estadoF10 = () => JSON.parse(readFileSync(join(h.datos, 'comercio', 'estado.json'), 'utf8'));
const registroF10 = () => readFileSync(join(h.datos, 'registro.log'), 'utf8');
const unMinuto = async (reloj) => {
  await reloj.avanzar(60_000);
  await esperar(40);
};

test('con el juego abierto, tras un /reload, la app lee el escaneo neutral y la ronda lo prueba', async () => {
  const { raiz, reloj, b } = await appF10();
  guardarCuentaF10(raiz, cuentaLua({ escaneos: [{}] }), T_F10 - 60_000);
  await unMinuto(reloj);
  await hasta(() => estadoF10().conocidas[`${REINO_F10}|Neutral`] === CASA_NEUTRAL_F10);
  assert.equal(b.candidatas([116, 117, 118, 121, 125]) >= 5, true, 'prueba las 5 candidatas neutrales');
  assert.match(registroF10(), /comercio: escaneo nuevo de la subasta Neutral, se intentará en las próximas rondas/);
});

test('con el juego abierto no cambia la identidad ni el personaje en uso', async () => {
  const { raiz, reloj } = await appF10();
  // El archivo dice que ahora juega la Alianza, y el escaneo neutral lo hizo ella.
  guardarCuentaF10(raiz, cuentaLua({ faccion: 'Alliance', escaneos: [{ jugador: 'Alliance' }] }), T_F10 - 60_000);
  await unMinuto(reloj);
  await hasta(() => estadoF10().conocidas[`${REINO_F10}|Neutral`] === CASA_NEUTRAL_F10);
  const e = estadoF10();
  assert.deepEqual(e.identidad, { region: 'us', reino: REINO_F10, faccion: 'Horde' });
  assert.deepEqual(e.jugadas[`us|${REINO_F10}`], ['Horde']);
  assert.equal(e.vistas[`us|${REINO_F10}`], 'Horde');
});

test('un archivo que acaba de cambiar (menos de 30 s) no se lee todavía; a la siguiente sí', async () => {
  const { raiz, reloj, b } = await appF10();
  guardarCuentaF10(raiz, cuentaLua({ escaneos: [{}] }), T_F10 + 50_000); // a los 60 s lleva 10 s sin cambiar
  await unMinuto(reloj);
  assert.equal(b.rondas(), 0, 'todavía no');
  await unMinuto(reloj);
  await hasta(() => estadoF10().conocidas[`${REINO_F10}|Neutral`] === CASA_NEUTRAL_F10);
});

test('un archivo que no ha cambiado no se vuelve a leer', async () => {
  const { raiz, reloj, b } = await appF10();
  const fecha = T_F10 - 60_000;
  const conEscaneo = cuentaLua({ escaneos: [{}] });
  const sinEscaneo = cuentaLua();
  guardarCuentaF10(raiz, sinEscaneo.padEnd(Buffer.byteLength(conEscaneo), '\n'), fecha);
  await unMinuto(reloj);
  assert.equal(b.rondas(), 0);
  // Mismo tamaño y misma fecha: para la app es el mismo archivo, aunque por dentro traiga un escaneo.
  const archivo = guardarCuentaF10(raiz, conEscaneo, fecha);
  await unMinuto(reloj);
  assert.equal(b.rondas(), 0, 'no lo ha vuelto a leer');
  // Con otra fecha sí: así se sabe que lo de arriba no pasaba por otra cosa.
  nodeFs.utimesSync(archivo, (fecha + 1000) / 1000, (fecha + 1000) / 1000);
  await unMinuto(reloj);
  await hasta(() => b.rondas() === 1);
});

test('un archivo a medias no rompe nada y se reintenta', async () => {
  const { raiz, reloj } = await appF10();
  const entero = cuentaLua({ escaneos: [{}] });
  guardarCuentaF10(raiz, entero.slice(0, Math.floor(entero.length / 2)), T_F10 - 60_000);
  await unMinuto(reloj);
  await unMinuto(reloj);
  const avisos = registroF10().split('\n').filter((l) => l.includes('se salta un SnetForever.lua'));
  assert.equal(avisos.length, 1, 'un aviso como mucho, aunque se reintente');
  assert.equal(estadoF10().conocidas[`${REINO_F10}|Neutral`], undefined);
  guardarCuentaF10(raiz, entero, T_F10 - 30_000);
  await unMinuto(reloj);
  await hasta(() => estadoF10().conocidas[`${REINO_F10}|Neutral`] === CASA_NEUTRAL_F10);
});

test('un escaneo nuevo adelanta una sola ronda; uno ya probado no', async () => {
  const { raiz, reloj, b } = await appF10();
  const archivo = guardarCuentaF10(raiz, cuentaLua({ escaneos: [{}] }), T_F10 - 60_000);
  await unMinuto(reloj);
  await hasta(() => estadoF10().conocidas[`${REINO_F10}|Neutral`] === CASA_NEUTRAL_F10);
  assert.equal(b.rondas(), 1);
  await unMinuto(reloj);
  assert.equal(b.rondas(), 1, 'sin cambios, ninguna más');
  // El mismo escaneo en un archivo vuelto a guardar (otro /reload): ya está probado.
  nodeFs.utimesSync(archivo, (T_F10 + 10_000) / 1000, (T_F10 + 10_000) / 1000);
  await unMinuto(reloj);
  await unMinuto(reloj);
  assert.equal(b.rondas(), 1, 'uno ya probado no adelanta nada');
});

test('un escaneo de una casa que lleva menos de 24 h sin salir no adelanta la ronda', async () => {
  const { raiz, reloj, b } = await appF10({ antes: (e) => e.ponerSinCasa(`${REINO_F10}|Neutral`, T_F10 - 3600_000) });
  guardarCuentaF10(raiz, cuentaLua({ escaneos: [{}] }), T_F10 - 60_000);
  await unMinuto(reloj);
  await unMinuto(reloj);
  assert.equal(b.rondas(), 0);
  assert.doesNotMatch(registroF10(), /escaneo nuevo/);
  assert.equal(estadoF10().conocidas[`${REINO_F10}|Neutral`], undefined);
  // Control: pasadas las 24 h, un escaneo más nuevo ya adelanta la ronda (lo de arriba era por el límite, no por no leer).
  await reloj.avanzar(24 * 3600_000);
  guardarCuentaF10(raiz, cuentaLua({ escaneos: [{ hora: reloj.ms / 1000 - 120 }] }), reloj.ms - 60_000);
  await unMinuto(reloj);
  await hasta(() => b.rondas() === 1);
});

test('con el juego abierto, un escaneo no hace que se empiece a bajar la casa de la Alianza', async () => {
  const { raiz, juego, reloj, b } = await appF10();
  const ALIANZA_F10 = [110, 111, 112, 119, 123];
  guardarCuentaF10(raiz, cuentaLua({ faccion: 'Alliance', escaneos: [{ faccion: 'Alliance', jugador: 'Alliance' }] }), T_F10 - 60_000);
  await unMinuto(reloj);
  await unMinuto(reloj);
  assert.equal(b.candidatas(ALIANZA_F10), 0, 'ninguna candidata de la Alianza');
  assert.equal(b.rondas(), 0);
  assert.deepEqual(estadoF10().jugadas[`us|${REINO_F10}`], ['Horde']);
  // Al cerrar el juego sí: entró con un personaje de la Alianza y abrió su subasta.
  juego.abierto = null;
  await unMinuto(reloj);
  await hasta(() => b.candidatas(ALIANZA_F10) > 0);
  assert.ok(estadoF10().jugadas[`us|${REINO_F10}`].includes('Alliance'));
});

test('con el juego cerrado, un escaneo pendiente nuevo adelanta una sola ronda', async () => {
  const { raiz, reloj, b } = await appF10({ abierto: false });
  guardarCuentaF10(raiz, cuentaLua({ escaneos: [{}] }), T_F10 - 60_000);
  await unMinuto(reloj);
  await hasta(() => estadoF10().conocidas[`${REINO_F10}|Neutral`] === CASA_NEUTRAL_F10);
  assert.equal(b.rondas(), 1);
  assert.match(registroF10(), /comercio: escaneo nuevo de la subasta Neutral, se intentará en las próximas rondas/);
  await unMinuto(reloj);
  assert.equal(b.rondas(), 1);
});

test('con el juego abierto, un escaneo neutral de un tipo de reino sin personajes no baja ninguna candidata', async () => {
  const { raiz, juego, reloj, b } = await appF10();
  const NEUTRALES = [116, 117, 118, 121, 125];
  const OTRO = 'Otro Reino 7';
  guardarCuentaF10(raiz, cuentaLua({ escaneos: [{ reino: OTRO }] }), T_F10 - 60_000);
  await unMinuto(reloj);
  await unMinuto(reloj);
  assert.equal(b.candidatas(NEUTRALES), 0, 'ninguna de las 5 candidatas (~25 MB)');
  assert.equal(b.rondas(), 0);
  assert.doesNotMatch(registroF10(), /escaneo nuevo/);
  assert.equal(estadoF10().jugadas[`us|${OTRO}`], undefined);
  // Al cerrar el juego sí: ese escaneo dice que hay un personaje en ese tipo de reino.
  juego.abierto = null;
  await unMinuto(reloj);
  await hasta(() => b.candidatas(NEUTRALES) > 0);
});

test('un archivo que cambia mientras se lee no se usa y se lee entero a la siguiente', async () => {
  const { raiz, reloj, b } = await appF10();
  const horaVieja = T_F10 / 1000 - 600;
  const horaNueva = T_F10 / 1000 - 300;
  const archivo = guardarCuentaF10(raiz, cuentaLua({ escaneos: [{ hora: horaVieja }] }), T_F10 - 60_000);
  // El juego guarda justo después de que la app haya leído el contenido: lo leído ya es de antes.
  const deVerdad = nodeFs.default.readFileSync;
  let cambiado = false;
  nodeFs.default.readFileSync = function leerYCambiar(ruta, ...resto) {
    const leido = deVerdad.call(this, ruta, ...resto);
    if (!cambiado && String(ruta) === archivo) {
      cambiado = true;
      guardarCuentaF10(raiz, cuentaLua({ escaneos: [{ hora: horaNueva }] }), T_F10 + 10_000);
    }
    return leido;
  };
  syncBuiltinESMExports();
  try {
    await unMinuto(reloj);
    assert.equal(cambiado, true, 'la app ha llegado a leer el archivo');
    assert.equal(b.rondas(), 0, 'lo leído mientras cambiaba no se usa');
    assert.doesNotMatch(registroF10(), /escaneo nuevo/);
  } finally {
    nodeFs.default.readFileSync = deVerdad;
    syncBuiltinESMExports();
  }
  await unMinuto(reloj);
  await hasta(() => estadoF10().probados[`${REINO_F10}|Neutral`] === horaNueva);
  assert.equal(b.rondas(), 1);
});

test('la línea del registro no promete que el escaneo se pruebe en esta ronda', async () => {
  const { raiz, reloj } = await appF10();
  guardarCuentaF10(raiz, cuentaLua({ escaneos: [{}] }), T_F10 - 60_000);
  await unMinuto(reloj);
  await hasta(() => registroF10().includes('escaneo nuevo'));
  assert.match(registroF10(), /comercio: escaneo nuevo de la subasta Neutral, se intentará en las próximas rondas/);
  assert.doesNotMatch(registroF10(), /se prueba en esta ronda/);
});
