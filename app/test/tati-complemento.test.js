// El complemento de SnetForever para TATI (tarea S7): la carpeta que genera la app (plugin.json, .mcp.json, el relevo MCP
// con sus dos módulos copiados, herramientas.json y la habilidad) y el relevo de verdad, arrancado con node por stdio
// como lo arranca TATI, contra una app de prueba que atiende el canal `relevo-<pid>` con `atender` (S2). Todo en
// carpetas temporales. Ninguna prueba lanza programas del sistema: el relevo siempre arranca con un lanzador falso
// (SNF_PRUEBA_LANZADOR, un script de node que solo apunta sus argumentos en un archivo marca) en vez de wscript.exe.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generarComplemento, carpetaComplemento, CARPETA_COMPLEMENTO, INSTRUCCIONES_TATI } from '../src/tati/complemento.mjs';
import { crearAcciones } from '../src/tati/acciones.mjs';
import { atender } from '../src/tati/correo.mjs';
import { carpetaPuente } from '../src/tati/config.mjs';
import { VERSION } from '../src/version.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HABILIDAD = join(AQUI, '..', 'src', 'tati', 'habilidad.md');
const ARCHIVOS = [
  '.codex-plugin/plugin.json', '.mcp.json', 'relevo.mjs', 'correo.mjs', 'protocolo.mjs', 'herramientas.json',
  'instrucciones.txt', 'skills/snetforever/SKILL.md',
];

const leerJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function datosNuevos() {
  const d = join(mkdtempSync(join(tmpdir(), 'snf-tati-complemento-')), 'datos');
  mkdirSync(d, { recursive: true });
  return d;
}

// Las catorce definiciones de verdad (las ocho del catálogo y las seis de acción), sin núcleo: definiciones() no lo usa.
function definiciones(datos) {
  return crearAcciones({ nucleo: {}, estadoJuego: null, datos }).definiciones();
}

// El lanzador falso de las pruebas (SNF_PRUEBA_LANZADOR del relevo): un script de node que no abre nada; cada vez que el
// relevo lo lanza, apunta en `marca.txt` de su propia carpeta una línea con sus argumentos ([el script, el lanzador]).
// `vbs` es la ruta (con un espacio) que se da como SNF_LANZADOR: pasa la validación del relevo, pero nadie la ejecuta.
function lanzadorFalso() {
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-tati-lanzador-'));
  const script = join(carpeta, 'lanzador-falso.mjs');
  writeFileSync(script, [
    "import { appendFileSync } from 'node:fs';",
    "import { dirname, join } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "appendFileSync(join(dirname(fileURLToPath(import.meta.url)), 'marca.txt'), JSON.stringify(process.argv.slice(1)) + '\\n');",
    '',
  ].join('\n'));
  return { script, vbs: join(carpeta, 'Lanzador Prueba.vbs'), marca: join(carpeta, 'marca.txt') };
}

const marcas = (marca) => (existsSync(marca) ? readFileSync(marca, 'utf8').split(/\r?\n/).filter((l) => l !== '').map((l) => JSON.parse(l)) : []);
const lineasMarca = (marca) => marcas(marca).length;

// Un pid que ya no vive: el de un node que ya acabó.
function pidMuerto() {
  const r = spawnSync(process.execPath, ['-e', '0'], { windowsHide: true });
  return r.pid;
}

// El relevo de verdad, como lo arranca TATI: `node <carpeta>\relevo.mjs` con el entorno de .mcp.json. Manda líneas
// JSON-RPC (con \r\n, como algunos clientes) y empareja las respuestas por id. Nunca sin el lanzador falso: sin él, el
// relevo lanzaría el wscript.exe de verdad.
function arrancarRelevo(carpeta, env) {
  const falso = env && env.SNF_PRUEBA_LANZADOR;
  if (typeof falso !== 'string' || falso === '' || !existsSync(falso)) {
    throw new Error('arrancarRelevo: falta el lanzador falso (SNF_PRUEBA_LANZADOR)');
  }
  const hijo = spawn(process.execPath, ['./relevo.mjs'], { cwd: carpeta, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const esperando = new Map();
  let resto = '';
  let errores = '';
  hijo.stdout.setEncoding('utf8');
  hijo.stderr.setEncoding('utf8');
  hijo.stderr.on('data', (d) => { errores += d; });
  hijo.stdout.on('data', (d) => {
    resto += d;
    for (let i = resto.indexOf('\n'); i >= 0; i = resto.indexOf('\n')) {
      const linea = resto.slice(0, i);
      resto = resto.slice(i + 1);
      if (linea.trim() === '') continue;
      const m = JSON.parse(linea);
      const listo = esperando.get(m.id);
      esperando.delete(m.id);
      if (listo) listo(m);
    }
  });
  let n = 0;
  const llamar = (method, params) => new Promise((res) => {
    const id = ++n;
    esperando.set(id, res);
    hijo.stdin.write(`\r\n${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\r\n`);
  });
  const herramienta = async (name, args = {}) => {
    const r = await llamar('tools/call', { name, arguments: args });
    return JSON.parse(r.result.content[0].text);
  };
  const salida = new Promise((r) => hijo.once('exit', (codigo) => r(codigo)));
  const cerrar = async () => {
    hijo.stdin.end();
    return salida;
  };
  return { hijo, llamar, herramienta, cerrar, salida, errores: () => errores };
}

// El entorno del relevo: siempre con un lanzador falso (uno nuevo si `extra` no trae el suyo) y sin plazo de apertura
// acortado salvo que lo pida la prueba (SNF_PRUEBA_ESPERA_MS).
function entornoRelevo(extra) {
  const env = { ...process.env };
  for (const k of ['SNF_DATOS', 'SNF_LANZADOR', 'SNF_PRUEBA_LANZADOR', 'SNF_PRUEBA_ESPERA_MS']) delete env[k];
  return { ...env, SNF_PRUEBA_LANZADOR: lanzadorFalso().script, ...extra };
}

// La app de prueba está abierta: su cerrojo con un pid vivo (el de esta prueba, que la hace). Si un acuse se retrasa
// (el PC cargado), el relevo contesta app_no_responde a los 5 s en vez de intentar abrirla y esperar.
function cerrojoVivo(datos) {
  writeFileSync(join(datos, 'app.lock'), JSON.stringify({ pid: process.pid, inicio: Date.now() }));
}

// ---------- la carpeta del complemento ----------

test('generarComplemento deja los ocho archivos en <datos>\\tati\\complemento-snetforever', () => {
  const datos = datosNuevos();
  const { vbs } = lanzadorFalso();
  const ruta = generarComplemento({ datos, lanzador: vbs, definiciones: definiciones(datos) });
  assert.equal(ruta, join(datos, 'tati', CARPETA_COMPLEMENTO));
  assert.equal(carpetaComplemento(datos), ruta);
  for (const a of ARCHIVOS) assert.ok(existsSync(join(ruta, a)), a);

  const plugin = leerJson(join(ruta, '.codex-plugin', 'plugin.json'));
  assert.equal(plugin.name, 'snetforever');
  assert.equal(plugin.version, VERSION);
  assert.equal(typeof plugin.description, 'string');
  assert.ok(plugin.description.length > 0);
  assert.equal(plugin.interface.displayName, 'SnetForever (WoW)');
  assert.equal(plugin.interface.developerName, 'SnetForever');
  assert.equal(plugin.interface.category, 'Juegos');
  assert.equal(typeof plugin.interface.shortDescription, 'string');

  // las rutas de Windows van con las barras dobladas del JSON y vuelven enteras
  const textoMcp = readFileSync(join(ruta, '.mcp.json'), 'utf8');
  assert.ok(textoMcp.includes(JSON.stringify(datos)), 'la ruta de datos escrita con JSON.stringify');
  const mcp = JSON.parse(textoMcp);
  assert.deepEqual(mcp, {
    mcpServers: {
      snetforever: { type: 'stdio', command: process.execPath, args: ['./relevo.mjs'], env: { SNF_DATOS: datos, SNF_LANZADOR: vbs } },
    },
  });

  const herramientas = leerJson(join(ruta, 'herramientas.json'));
  assert.equal(herramientas.length, 14);
  for (const h of herramientas) {
    assert.deepEqual(Object.keys(h).sort(), ['descripcion', 'esquema', 'nombre']);
    assert.equal(typeof h.nombre, 'string');
    assert.ok(Array.from(h.descripcion).length <= 400, `${h.nombre}: la centralita de TATI corta a 400`);
  }
  assert.deepEqual(herramientas, definiciones(datos), 'las de acciones.definiciones(), con sus reglas');
  // S9: las reglas que viajan con el servidor (la respuesta a initialize del relevo), con saltos de línea \n
  assert.equal(readFileSync(join(ruta, 'instrucciones.txt'), 'utf8'), INSTRUCCIONES_TATI);
  assert.ok(herramientas.some((h) => h.nombre === 'estado_juego'));
  assert.ok(herramientas.some((h) => h.nombre === 'crear_ruta'));
  assert.ok(herramientas.some((h) => h.nombre === 'abrir_guia'));
  assert.ok(herramientas.some((h) => h.nombre === 'instrucciones'), 'la de los temas aparte de las instrucciones de TATI');
  assert.ok(herramientas.some((h) => h.nombre === 'guardar_guia'), 'la de guardar guías de internet en la biblioteca');

  // las copias son los archivos de la app, tal cual; la habilidad, con saltos de línea \n
  const fuente = (r) => readFileSync(join(AQUI, '..', 'src', ...r.split('/')), 'utf8');
  assert.equal(readFileSync(join(ruta, 'relevo.mjs'), 'utf8'), fuente('tati/relevo.mjs'));
  assert.equal(readFileSync(join(ruta, 'correo.mjs'), 'utf8'), fuente('tati/correo.mjs'));
  assert.equal(readFileSync(join(ruta, 'protocolo.mjs'), 'utf8'), fuente('herramientas/protocolo.mjs'));
  assert.equal(readFileSync(join(ruta, 'skills', 'snetforever', 'SKILL.md'), 'utf8'), fuente('tati/habilidad.md').replace(/\r\n/g, '\n'));
});

test('generarComplemento con otro node y definiciones como función', () => {
  const datos = datosNuevos();
  const node = 'C:\\Programas de Prueba\\SnetForever\\node\\node.exe';
  const ruta = generarComplemento({ datos, node, lanzador: 'C:\\Programas de Prueba\\SnetForever\\SnetForever.vbs', definiciones: () => definiciones(datos) });
  const mcp = leerJson(join(ruta, '.mcp.json'));
  assert.equal(mcp.mcpServers.snetforever.command, node);
  assert.equal(mcp.mcpServers.snetforever.env.SNF_LANZADOR, 'C:\\Programas de Prueba\\SnetForever\\SnetForever.vbs');
  assert.equal(leerJson(join(ruta, 'herramientas.json')).length, 14);
});

test('generarlo dos veces deja el primero en la cuarentena (no se borra nada)', () => {
  const datos = datosNuevos();
  const { vbs } = lanzadorFalso();
  const ruta = generarComplemento({ datos, lanzador: vbs, definiciones: definiciones(datos) });
  writeFileSync(join(ruta, 'nota-del-primero.txt'), 'primero');
  const otra = generarComplemento({ datos, lanzador: vbs, definiciones: definiciones(datos) });
  assert.equal(otra, ruta);
  assert.ok(!existsSync(join(ruta, 'nota-del-primero.txt')), 'la carpeta nueva no trae lo del primero');
  for (const a of ARCHIVOS) assert.ok(existsSync(join(ruta, a)), a);
  const cuarentena = join(datos, 'cuarentena');
  const sellos = readdirSync(cuarentena);
  assert.equal(sellos.length, 1);
  const apartada = join(cuarentena, sellos[0], CARPETA_COMPLEMENTO);
  assert.equal(readFileSync(join(apartada, 'nota-del-primero.txt'), 'utf8'), 'primero');
  for (const a of ARCHIVOS) assert.ok(existsSync(join(apartada, a)), a);
});

test('generarComplemento sin datos, sin lanzador o sin definiciones lanza ARGUMENTOS y no escribe nada', () => {
  const datos = datosNuevos();
  const defs = definiciones(datos);
  for (const malo of [
    { lanzador: 'C:\\x.vbs', definiciones: defs },
    { datos, definiciones: defs },
    { datos, lanzador: 'C:\\x.vbs' },
    { datos, lanzador: 'C:\\x.vbs', definiciones: 'diez' },
  ]) {
    assert.throws(() => generarComplemento(malo), (e) => e.code === 'ARGUMENTOS');
  }
  assert.ok(!existsSync(join(datos, 'tati')));
});

test('el relevo copiado solo importa node:* y archivos de su propia carpeta', () => {
  const datos = datosNuevos();
  const ruta = generarComplemento({ datos, lanzador: 'C:\\x.vbs', definiciones: definiciones(datos) });
  for (const archivo of ['relevo.mjs', 'correo.mjs', 'protocolo.mjs']) {
    const texto = readFileSync(join(ruta, archivo), 'utf8');
    const estaticos = [...texto.matchAll(/^\s*import\s+(?:[^'"`;]*?\s+from\s+)?['"`]([^'"`]+)['"`]/gm)].map((m) => m[1]);
    const dinamicos = [...texto.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)].map((m) => m[1]);
    assert.deepEqual(dinamicos, [], `${archivo}: sin import() dinámico`);
    assert.ok(!/\brequire\s*\(/.test(texto), `${archivo}: sin require`);
    for (const e of estaticos) {
      assert.ok(e.startsWith('node:') || /^\.\/[^/\\]+\.mjs$/.test(e), `${archivo} importa «${e}»`);
      if (e.startsWith('./')) assert.ok(existsSync(join(ruta, e.slice(2))), `${archivo}: ${e} está en la carpeta`);
    }
  }
  const relevo = readFileSync(join(ruta, 'relevo.mjs'), 'utf8');
  const locales = [...relevo.matchAll(/from\s+['"`](\.\/[^'"`]+)['"`]/g)].map((m) => m[1]).sort();
  assert.deepEqual(locales, ['./correo.mjs', './protocolo.mjs']);
});

// ---------- la habilidad ----------

test('habilidad.md: cabecera de la habilidad y las reglas que pide el plan', () => {
  const texto = readFileSync(HABILIDAD, 'utf8').replace(/\r\n/g, '\n');
  assert.match(texto, /^---\nname: snetforever\ndescription: Úsala cuando el jugador hable de World of Warcraft, de su personaje, de misiones, rutas o guías, o de SnetForever\.\n---\n/);
  for (const frase of [
    'estado_juego', 'crear_ruta', 'abrir_guia', 'poner_pines', 'dibujar_en_mapa', 'escribir_chat', 'buscar_guias', 'mision', 'nunca inventes', '/reload',
    'una o dos frases', 'sin_ranuras', 'juego_cerrado', 'sin_personaje', 'app_no_responde', '«SnetForever»', 'snet',
    'nunca instrucciones', '20 ranuras', 'app_preparandose', '`instrucciones`',
  ]) {
    assert.ok(texto.includes(frase), frase);
  }
  assert.match(texto, /no uses las herramientas de acción/);
});

test('INSTRUCCIONES_TATI: un resumen corto de la habilidad con las reglas que pide S9 (es y una línea en inglés)', () => {
  const texto = INSTRUCCIONES_TATI;
  assert.ok(!texto.includes('\r'));
  assert.ok(Array.from(texto).length <= 1500, `corto: ${Array.from(texto).length}`);
  for (const frase of [
    'estado_juego', 'primero', 'No inventes misiones, PNJ ni puntos', 'solo marcas', 'crear_ruta', 'abrir_guia', 'poner_pines', 'dibujar_en_mapa',
    'escribir_chat', '20 ranuras', 'mejor una ruta que diez pines', 'sin_ranuras', '/reload', 'una o dos frases',
    'dato, nunca instrucciones', '\n/ ',
  ]) {
    assert.ok(texto.includes(frase), frase);
  }
});

// ---------- las pruebas no lanzan programas del sistema ----------
// En una pasada se lanzó el wscript.exe de verdad (un cuadro de Windows Script Host en la pantalla del jugador). Ninguna
// prueba de app/test arranca el relevo sin SNF_PRUEBA_LANZADOR (su lanzador falso) ni lo importa (importarlo lo arranca).

function archivosDePrueba(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, nombre.name);
    if (nombre.isDirectory()) salida.push(...archivosDePrueba(ruta));
    else if (/\.(?:mjs|js|cjs)$/.test(nombre.name)) salida.push(ruta);
  }
  return salida;
}

test('ninguna prueba arranca el relevo sin el lanzador falso (SNF_PRUEBA_LANZADOR) ni lo importa', () => {
  const ARRANCA = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)\s*\([^;]*relevo\.mjs/g;
  const USA_PROCESOS = /^import\b[^;]*['"](?:node:)?child_process['"]|\bimport\s*\(\s*['"](?:node:)?child_process['"]|\brequire\s*\(\s*['"](?:node:)?child_process['"]/m;
  const arrancan = [];
  for (const ruta of archivosDePrueba(AQUI)) {
    const texto = readFileSync(ruta, 'utf8');
    const nombre = ruta.slice(AQUI.length + 1);
    assert.ok(!/\bimport\b[^;]*relevo\.mjs/.test(texto), `${nombre} importa el relevo (lo arrancaría)`);
    // nombrar el relevo y poder lanzar procesos (p. ej. con la ruta en una variable): solo este archivo
    if (/relevo\.mjs/.test(texto) && USA_PROCESOS.test(texto)) {
      assert.equal(nombre, 'tati-complemento.test.js', `${nombre} nombra el relevo y lanza procesos`);
    }
    const veces = [...texto.matchAll(ARRANCA)].length;
    if (veces === 0) continue;
    arrancan.push([nombre, veces]);
    assert.ok(texto.includes('SNF_PRUEBA_LANZADOR'), `${nombre} arranca el relevo sin SNF_PRUEBA_LANZADOR`);
  }
  // un solo sitio: arrancarRelevo, que no arranca nada sin el lanzador falso (lo mira la prueba siguiente). Quien añada
  // otro tiene que pasar por aquí.
  assert.deepEqual(arrancan, [['tati-complemento.test.js', 1]], 'el relevo solo se arranca desde arrancarRelevo');
});

test('arrancarRelevo no arranca el relevo sin un lanzador falso que exista', () => {
  const datos = datosNuevos();
  const ruta = generarComplemento({ datos, lanzador: 'C:\\x.vbs', definiciones: definiciones(datos) });
  const env = entornoRelevo({ SNF_DATOS: datos, SNF_LANZADOR: 'C:\\x.vbs' });
  assert.ok(existsSync(env.SNF_PRUEBA_LANZADOR), 'entornoRelevo pone siempre uno');
  const sinFalso = { ...env };
  delete sinFalso.SNF_PRUEBA_LANZADOR;
  assert.throws(() => arrancarRelevo(ruta, sinFalso), /lanzador falso/);
  assert.throws(() => arrancarRelevo(ruta, { ...env, SNF_PRUEBA_LANZADOR: '' }), /lanzador falso/);
  assert.throws(() => arrancarRelevo(ruta, { ...env, SNF_PRUEBA_LANZADOR: join(datos, 'no-esta.mjs') }), /lanzador falso/);
});

// ---------- el relevo de verdad ----------
// Las pruebas del relevo esperan plazos reales (acuse de 5 s y, si no se acorta, apertura de 60 s): corren a la vez.
describe('el relevo de verdad', { concurrency: true }, () => {

  test('el relevo de verdad: initialize, tools/list con las catorce y una llamada que contesta la app', async (t) => {
    const datos = datosNuevos();
    const ruta = generarComplemento({ datos, lanzador: 'C:\\x.vbs', definiciones: definiciones(datos) });
    cerrojoVivo(datos);
    const vistos = [];
    const app = atender(carpetaPuente(datos), /^relevo-\d+$/, async (canal, p) => {
      vistos.push({ canal, tipo: p.tipo, nombre: p.nombre, argumentos: p.argumentos });
      return { estado: 'hecho', resultado: { juego: 'abierto', conocido: true, ranurasQuedan: 7, eco: p.argumentos } };
    }, { cada: 20 });
    const r = arrancarRelevo(ruta, entornoRelevo({ SNF_DATOS: datos, SNF_LANZADOR: 'C:\\x.vbs' }));
    t.after(async () => {
      r.hijo.kill();
      await app.parar();
    });

    const ini = await r.llamar('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    assert.equal(ini.result.protocolVersion, '2025-06-18');
    assert.equal(ini.result.serverInfo.name, 'snetforever');
    assert.equal(ini.result.serverInfo.version, VERSION);
    assert.ok(ini.result.capabilities.tools);
    assert.equal(ini.result.instructions, INSTRUCCIONES_TATI, 'las reglas, en la respuesta a initialize');

    const lista = await r.llamar('tools/list', {});
    assert.equal(lista.result.tools.length, 14);
    const nombres = lista.result.tools.map((h) => h.name);
    assert.ok(nombres.includes('instrucciones'), 'la herramienta de los temas llega por el relevo');
    assert.ok(nombres.includes('guardar_guia'), 'y la de guardar guías');
    assert.deepEqual(nombres, definiciones(datos).map((d) => d.nombre));
    assert.deepEqual(lista.result.tools.map((h) => h.description), definiciones(datos).map((d) => d.descripcion));
    for (const h of lista.result.tools) {
      assert.equal(typeof h.description, 'string');
      assert.equal(h.inputSchema.type, 'object');
    }

    const resultado = await r.herramienta('estado_juego', { detalle: true });
    assert.deepEqual(resultado, { juego: 'abierto', conocido: true, ranurasQuedan: 7, eco: { detalle: true } });
    assert.equal(vistos.length, 1);
    assert.deepEqual(vistos[0], { canal: `relevo-${r.hijo.pid}`, tipo: 'herramienta', nombre: 'estado_juego', argumentos: { detalle: true } });

    // sin argumentos: un objeto vacío
    const sinArgs = await r.herramienta('estado_juego');
    assert.deepEqual(sinArgs.eco, {});

    const desconocida = await r.llamar('tools/call', { name: 'borrar_todo', arguments: {} });
    assert.equal(desconocida.result.isError, true);
    assert.equal(vistos.length, 2, 'una herramienta que no está en herramientas.json no llega a la app');

    // instrucciones va a la app como las demás de lectura (la app da el tema de sistema.md)
    await r.herramienta('instrucciones', { tema: 'comercio' });
    assert.deepEqual(vistos[2], { canal: `relevo-${r.hijo.pid}`, tipo: 'herramienta', nombre: 'instrucciones', argumentos: { tema: 'comercio' } });

    assert.equal(await r.cerrar(), 0);
    assert.equal(r.errores(), '');
    // el relevo no escribe nada fuera de su canal
    assert.deepEqual(readdirSync(carpetaPuente(datos)).sort(), [`relevo-${r.hijo.pid}.pedido.json`, `relevo-${r.hijo.pid}.respuesta.json`]);
    assert.deepEqual(readdirSync(datos).sort(), ['app.lock', 'puente-tati', 'tati']);
  });

  test('sin instrucciones.txt (una carpeta de antes), el relevo arranca igual y su initialize no lleva instructions', async (t) => {
    const datos = datosNuevos();
    const ruta = generarComplemento({ datos, lanzador: 'C:\\x.vbs', definiciones: definiciones(datos) });
    renameSync(join(ruta, 'instrucciones.txt'), join(dirname(ruta), 'instrucciones-apartadas.txt'));
    const r = arrancarRelevo(ruta, entornoRelevo({ SNF_DATOS: datos, SNF_LANZADOR: 'C:\\x.vbs' }));
    t.after(() => r.hijo.kill());
    const ini = await r.llamar('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
    assert.equal(ini.result.serverInfo.name, 'snetforever');
    assert.ok(!('instructions' in ini.result));
    assert.equal((await r.llamar('tools/list', {})).result.tools.length, 14);
    assert.equal(await r.cerrar(), 0);
    assert.equal(r.errores(), '');
  });

  // En una pasada con el PC cargado esta prueba tardó 66 s: sin cerrojo, un acuse de más de 5 s llevó al relevo a «abrir
  // la app» (el wscript.exe de verdad con C:\x.vbs) y a esperar 60 s un cerrojo que nunca llegaba. Con la app abierta
  // (su cerrojo vivo), un acuse tardío da app_no_responde a los 5 s sin abrir nada.
  test('el relevo pasa tal cual el resultado de error de la app y traduce los suyos', async (t) => {
    const datos = datosNuevos();
    const ruta = generarComplemento({ datos, lanzador: 'C:\\x.vbs', definiciones: definiciones(datos) });
    cerrojoVivo(datos);
    const app = atender(carpetaPuente(datos), /^relevo-\d+$/, async (canal, p) => {
      if (p.nombre === 'crear_ruta') return { estado: 'hecho', resultado: { error: 'sin_ranuras', consejo: '/reload' } };
      if (p.nombre === 'poner_pines') throw new Error('C:\\ruta\\secreta');
      return { estado: 'hecho', resultado: { ok: true } };
    }, { cada: 20 });
    const r = arrancarRelevo(ruta, entornoRelevo({ SNF_DATOS: datos, SNF_LANZADOR: 'C:\\x.vbs' }));
    t.after(async () => {
      r.hijo.kill();
      await app.parar();
    });
    assert.deepEqual(await r.herramienta('crear_ruta', { guia: {} }), { error: 'sin_ranuras', consejo: '/reload' });
    const fallo = await r.herramienta('poner_pines', { marcas: ['B:1'] });
    assert.deepEqual(fallo, { error: 'app_fallo' });
    assert.deepEqual(await r.herramienta('escribir_chat', { texto: 'hola' }), { ok: true });
    assert.equal(await r.cerrar(), 0);
  });

  // Una app de prueba que «arranca»: toma el cerrojo con un pid vivo (el de esta prueba) y, `tarda` ms después, empieza a
  // atender el canal del relevo.
  function appQueArranca(datos, tarda) {
    writeFileSync(join(datos, 'app.lock'), JSON.stringify({ pid: process.pid, inicio: Date.now() }));
    let app = null;
    let parada = false;
    const vistos = [];
    const reloj = setTimeout(() => {
      if (parada) return;
      app = atender(carpetaPuente(datos), /^relevo-\d+$/, async (canal, p) => {
        vistos.push(p.nombre);
        return { estado: 'hecho', resultado: { juego: 'abierto', conocido: true } };
      }, { cada: 20 });
    }, tarda);
    return {
      vistos,
      parar: async () => {
        parada = true;
        clearTimeout(reloj);
        if (app) await app.parar();
      },
    };
  }

  async function esperarMarca(marca) {
    const limite = Date.now() + 30_000;
    while (lineasMarca(marca) === 0 && Date.now() < limite) await dormir(100);
    assert.equal(lineasMarca(marca), 1, 'el lanzador se ejecutó');
  }

  // Sin SNF_PRUEBA_ESPERA_MS: el plazo de apertura de verdad (60 s), del que esta prueba solo gasta unos 7 s.
  test('sin app y con el cerrojo de un pid muerto, el relevo abre la app una vez y espera a que atienda (7 s tras el cerrojo)', async (t) => {
    const datos = datosNuevos();
    const { script, vbs, marca } = lanzadorFalso();
    const ruta = generarComplemento({ datos, lanzador: vbs, definiciones: definiciones(datos) });
    const cerrojo = join(datos, 'app.lock');
    writeFileSync(cerrojo, JSON.stringify({ pid: pidMuerto(), inicio: 1 }));
    const r = arrancarRelevo(ruta, entornoRelevo({ SNF_DATOS: datos, SNF_LANZADOR: vbs, SNF_PRUEBA_LANZADOR: script }));
    let app = null;
    t.after(async () => {
      r.hijo.kill();
      if (app) await app.parar();
    });

    const primera = r.herramienta('estado_juego');
    // el relevo espera el acuse (5 s), ve el pid muerto y lanza el lanzador falso con la ruta del .vbs (con su espacio)
    await esperarMarca(marca);
    assert.deepEqual(marcas(marca), [[script, vbs]], 'node <script> <SNF_LANZADOR>, la ruta entera en un argumento');
    // «la app» toma el cerrojo y tarda 7 s en atender: más que un intento de acuse, y el relevo sigue intentándolo
    app = appQueArranca(datos, 7000);
    assert.deepEqual(await primera, { juego: 'abierto', conocido: true });
    assert.deepEqual(app.vistos, ['estado_juego'], 'la app la atendió una vez');
    await app.parar();

    // con el cerrojo otra vez muerto, no lo vuelve a lanzar (una vez por relevo) y contesta tras el acuse
    writeFileSync(cerrojo, JSON.stringify({ pid: 0, inicio: 0 }));
    const antes = Date.now();
    assert.deepEqual(await r.herramienta('estado_juego'), { error: 'app_no_responde' });
    assert.ok(Date.now() - antes < 20_000, 'no espera los 60 s de la apertura');
    await dormir(1000);
    assert.equal(lineasMarca(marca), 1, 'solo una vez');
    assert.equal(await r.cerrar(), 0);
    assert.equal(r.errores(), '');
  });

  // Con SNF_PRUEBA_ESPERA_MS = 8000, el plazo de apertura es de 8 s en vez de 60: la misma regla sin esperar un minuto.
  test('la app abierta toma el cerrojo pero nunca atiende: app_no_responde al acabar el plazo de apertura (8 s en la prueba), no antes', async (t) => {
    const ESPERA = 8000;
    const datos = datosNuevos();
    const { script, vbs, marca } = lanzadorFalso();
    const ruta = generarComplemento({ datos, lanzador: vbs, definiciones: definiciones(datos) });
    writeFileSync(join(datos, 'app.lock'), JSON.stringify({ pid: pidMuerto(), inicio: 1 }));
    const r = arrancarRelevo(ruta, entornoRelevo({
      SNF_DATOS: datos, SNF_LANZADOR: vbs, SNF_PRUEBA_LANZADOR: script, SNF_PRUEBA_ESPERA_MS: String(ESPERA),
    }));
    t.after(() => r.hijo.kill());
    const enviada = Date.now();
    const llamada = r.herramienta('estado_juego');
    await esperarMarca(marca);
    writeFileSync(join(datos, 'app.lock'), JSON.stringify({ pid: process.pid, inicio: Date.now() }));
    assert.deepEqual(await llamada, { error: 'app_no_responde' });
    // desde que se manda: 5 s del primer acuse y el plazo de apertura desde que se lanzó la app
    const pasado = Date.now() - enviada;
    assert.ok(pasado >= 5000 + ESPERA - 1000, `siguió intentándolo hasta el final del plazo de apertura (${pasado} ms)`);
    assert.ok(pasado < 5000 + ESPERA + 35_000, `y no mucho más (${pasado} ms)`);
    assert.deepEqual(marcas(marca), [[script, vbs]]);
    assert.equal(await r.cerrar(), 0);
  });

  test('con un lanzador que no es una ruta con unidad a un .vbs (relativo, sin .vbs, UNC, sin unidad o con comillas), el relevo no lanza nada: app_no_responde', async (t) => {
    const datos = datosNuevos();
    const { script, vbs, marca } = lanzadorFalso();
    const ruta = generarComplemento({ datos, lanzador: 'Lanzador Prueba.vbs', definiciones: definiciones(datos) });
    writeFileSync(join(datos, 'app.lock'), JSON.stringify({ pid: 0, inicio: 0 }));
    assert.match(vbs, /^[A-Za-z]:\\/);
    // con el lanzador falso puesto, la validación de SNF_LANZADOR es la misma que con wscript.exe
    const malos = [
      'Lanzador Prueba.vbs', // relativo
      vbs.replace(/\.vbs$/, '.cmd'), // con unidad pero sin .vbs
      `\\\\localhost\\${vbs[0]}$${vbs.slice(2)}`, // UNC al mismo .vbs
      vbs.slice(2), // sin unidad (\Users\…\Lanzador Prueba.vbs)
      vbs.replace('Lanzador Prueba', 'Lanzador" Prueba'), // con comillas
    ];
    await Promise.all(malos.map(async (lanzador) => {
      const r = arrancarRelevo(ruta, entornoRelevo({ SNF_DATOS: datos, SNF_LANZADOR: lanzador, SNF_PRUEBA_LANZADOR: script }));
      t.after(() => r.hijo.kill());
      const antes = Date.now();
      assert.deepEqual(await r.herramienta('estado_juego'), { error: 'app_no_responde' }, lanzador);
      assert.ok(Date.now() - antes < 20_000, lanzador);
      assert.equal(await r.cerrar(), 0);
    }));
    await dormir(1000);
    assert.equal(lineasMarca(marca), 0);
  });

  test('si no puede escribir el pedido, app_no_responde enseguida y sin abrir la app', async (t) => {
    const datos = datosNuevos();
    const { script, vbs, marca } = lanzadorFalso();
    const ruta = generarComplemento({ datos, lanzador: vbs, definiciones: definiciones(datos) });
    writeFileSync(carpetaPuente(datos), 'un archivo donde iría la carpeta del puente');
    const r = arrancarRelevo(ruta, entornoRelevo({ SNF_DATOS: datos, SNF_LANZADOR: vbs, SNF_PRUEBA_LANZADOR: script }));
    t.after(() => r.hijo.kill());
    const antes = Date.now();
    assert.deepEqual(await r.herramienta('estado_juego'), { error: 'app_no_responde' });
    assert.ok(Date.now() - antes < 4000, 'sin esperar el acuse');
    assert.equal(await r.cerrar(), 0);
    await dormir(500);
    assert.equal(lineasMarca(marca), 0);
  });

  test('el relevo sin SNF_DATOS sale con 2 y una sola línea en stderr, sin rutas', async () => {
    const datos = datosNuevos();
    const ruta = generarComplemento({ datos, lanzador: 'C:\\x.vbs', definiciones: definiciones(datos) });
    const r = arrancarRelevo(ruta, entornoRelevo({}));
    assert.equal(await r.salida, 2);
    const err = r.errores();
    assert.equal(err.split('\n').filter((l) => l.trim() !== '').length, 1);
    assert.ok(!/[A-Za-z]:\\|\//.test(err.replace(/\r?\n$/, '')), `sin rutas: ${err}`);
    assert.ok(!existsSync(carpetaPuente(datos)));
  });
});

test('T2 (A3): habilidad.md pide en crear_ruta los objetivos entre aceptar y entregar', () => {
  const texto = readFileSync(HABILIDAD, 'utf8').replace(/\s+/g, ' ');
  assert.ok(texto.includes('En `crear_ruta`, con misiones sin completar, pon sus objetivos (`completar`) entre aceptar y entregar'));
});
