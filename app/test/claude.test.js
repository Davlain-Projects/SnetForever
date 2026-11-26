// Tarea 15: llamadas a Claude Code con la suscripción, sin claves. SIEMPRE con el claude falso de test/falso-claude:
// nunca se ejecuta el de verdad.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, realpathSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import * as fsReal from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolverClaude, detectarOpciones, argumentos, entorno, comprobar, preguntar, olvidarOpciones, clasificarAuth, argumentoValidoCmd, MODELOS, tiempoDe, TIEMPO_HAIKU, TIEMPO_SONNET, TIEMPO_OPUS } from '../src/claude.mjs';
import { leerStreamJson, tiempoConHerramientas, TIEMPO_HERRAMIENTAS, MAX_TURNOS_HERRAMIENTAS, MAX_SALIDA_HERRAMIENTAS, MAX_TEXTO_PAGINA } from '../src/claude.mjs';
import { asegurarMcpHerramientas, SERVIDOR, HERRAMIENTAS, NOMBRE_SERVIDOR } from '../src/herramientas/config.mjs';
import { carpetaDatos, carpetaTrabajo, leerConfig, carpetaAddOns, despejarTrabajo, MARCA_TRABAJO } from '../src/rutas.mjs';
import { log, MAX_BYTES } from '../src/registro.mjs';
import { textoError, TEXTOS_APP } from '../src/textos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO = join(AQUI, 'falso-claude');
const FALSO_JS = join(FALSO, 'claude.mjs');
const FALSO_CMD = join(FALSO, 'claude.cmd');
const AYUDA_REAL = join(FALSO, 'ayuda-real.txt');
const AYUDA_SIN_AUTH = join(FALSO, 'ayuda-sin-auth.txt');
const WIN = process.platform === 'win32';

const falso = { ruta: FALSO_JS, tipo: 'node' };
const COPIA = { ...process.env };
const CARPETA = mkdtempSync(join(tmpdir(), 'snf-claude-'));
let n = 0;
let datos;
let registro;

beforeEach(() => {
  // Entorno limpio de cada prueba: carpeta de datos propia y sin restos de las anteriores.
  for (const k of Object.keys(process.env)) if (!(k in COPIA)) delete process.env[k];
  Object.assign(process.env, COPIA);
  n += 1;
  datos = join(CARPETA, `d${n}`);
  registro = join(CARPETA, `reg${n}.json`);
  process.env.SNF_DATOS = datos;
  process.env.FALSO_REGISTRO = registro;
  delete process.env.FALSO_MODO;
  delete process.env.FALSO_AYUDA;
  delete process.env.FALSO_RESPUESTA;
  delete process.env.FALSO_AUTH_EXTRA;
  delete process.env.FALSO_RUIDO;
  delete process.env.FALSO_AUTH_JSON;
  delete process.env.FALSO_REGISTRO_AUTH;
  delete process.env.FALSO_STREAM;
  delete process.env.FALSO_STREAM_ARCHIVO;
  olvidarOpciones();
});
after(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, COPIA);
});

const lo_apuntado = () => JSON.parse(readFileSync(registro, 'utf8'));
const mismaRuta = (a, b) => realpathSync.native(a).toLowerCase() === realpathSync.native(b).toLowerCase();

// ---------- rutas ----------

test('rutas: carpeta de datos, de trabajo y configuración', () => {
  assert.equal(carpetaDatos(), datos);
  assert.equal(carpetaDatos({ LOCALAPPDATA: 'C:\\L' }), join('C:\\L', 'SnetForever'));
  const t = carpetaTrabajo();
  assert.equal(t, join(datos, 'trabajo'));
  assert.deepEqual(readdirSync(t), [MARCA_TRABAJO]);
  assert.deepEqual(leerConfig(), {});
  writeFileSync(join(datos, 'config.json'), JSON.stringify({ motor: 'claude' }));
  assert.deepEqual(leerConfig(), { motor: 'claude' });
  writeFileSync(join(datos, 'config.json'), '{roto');
  assert.deepEqual(leerConfig(), {});
});

test('rutas: carpetaAddOns respeta el orden SNF_ADDONS, config, exe, ruta por defecto y null', () => {
  const si = () => true;
  const no = () => false;
  assert.equal(carpetaAddOns({ config: { addons: 'C:\\c' }, exeJuego: 'D:\\j\\Wow.exe', env: { SNF_ADDONS: 'C:\\e' }, existe: si }), 'C:\\e');
  assert.equal(carpetaAddOns({ config: { addons: 'C:\\c' }, exeJuego: 'D:\\j\\Wow.exe', env: {}, existe: si }), 'C:\\c');
  assert.equal(carpetaAddOns({ config: {}, exeJuego: 'D:\\j\\Wow.exe', env: {}, existe: si }), join('D:\\j', 'Interface', 'AddOns'));
  // Lote C (revisión 52, Minor 11): ya no hay ruta fija del jugador como último recurso.
  assert.equal(carpetaAddOns({ config: {}, env: {}, existe: si }), null);
  assert.equal(carpetaAddOns({ config: {}, env: {}, existe: no }), null);
});

// Lote C (52-M11): preparado para la fase 5, que lee el InstallPath de Blizzard del registro de Windows. De cada uno
// vale la carpeta padre más _forever_, y solo si su Interface\AddOns existe. El exe del juego manda sobre el registro.
test('lote C (52-M11): carpetaAddOns usa el InstallPath del registro (padre + _forever_) si existe, después del exe', () => {
  const instalado = 'D:\\Juegos\\World of Warcraft\\_retail_\\';
  const esperada = join(String.raw`D:\Juegos\World of Warcraft`, '_forever_', 'Interface', 'AddOns');
  const soloEsa = (ruta) => ruta.toLowerCase() === esperada.toLowerCase();
  assert.equal(carpetaAddOns({ config: {}, env: {}, registro: [instalado], existe: soloEsa }), esperada);
  assert.equal(carpetaAddOns({ config: {}, env: {}, registro: [instalado], existe: () => false }), null, 'sin AddOns, no vale');
  assert.equal(carpetaAddOns({ config: {}, exeJuego: String.raw`E:\j\Wow.exe`, env: {}, registro: [instalado], existe: soloEsa }),
    join(String.raw`E:\j`, 'Interface', 'AddOns'), 'el exe del juego va antes');
  assert.equal(carpetaAddOns({ config: {}, env: {}, registro: ['', null, 7, String.raw`relativa\x`], existe: () => true }), null,
    'solo rutas absolutas');
  // Ronda 1 (Menor 4): un InstallPath que ya es la carpeta World of Warcraft (sin _retail_): InstallPath\_forever_.
  const raiz = 'D:\\Juegos\\World of Warcraft\\';
  const dentro = join('D:\\Juegos\\World of Warcraft', '_forever_', 'Interface', 'AddOns');
  const una = (...rutas) => (r) => rutas.map((x) => x.toLowerCase()).includes(r.toLowerCase());
  assert.equal(carpetaAddOns({ config: {}, env: {}, registro: [raiz], existe: una(dentro) }), dentro);
  // Si existen las dos, va primero InstallPath\_forever_ (la carpeta que da el registro).
  const delPadre = join('D:\\Juegos', '_forever_', 'Interface', 'AddOns');
  assert.equal(carpetaAddOns({ config: {}, env: {}, registro: [raiz], existe: una(dentro, delPadre) }), dentro);
});

test('lote C (52-M11): sin carpeta de AddOns, la bandeja pide ponerla en config.json', () => {
  for (const idioma of ['es', 'en']) {
    assert.match(TEXTOS_APP[idioma].esperandoAddons, /config\.json/);
    assert.match(TEXTOS_APP[idioma].esperandoAddons, /addons/);
  }
  assert.ok(TEXTOS_APP.es.esperandoAddons.startsWith('AddOns: esperando a encontrar el juego'));
});

// ---------- registro ----------

test('registro: apunta líneas y al pasar de 1 MB renombra a registro-<sello>.log', () => {
  log('info', 'primera\nlínea');
  const ruta = join(datos, 'registro.log');
  assert.match(readFileSync(ruta, 'utf8'), /\[info\] primera línea\n$/);
  writeFileSync(ruta, 'x'.repeat(MAX_BYTES + 10));
  log('info', 'tras la rotación');
  const nombres = readdirSync(datos);
  assert.ok(nombres.some((f) => /^registro-.+\.log$/.test(f)), nombres.join(','));
  assert.match(readFileSync(ruta, 'utf8'), /tras la rotación/);
  assert.ok(readFileSync(ruta, 'utf8').length < 1000);
});

// ---------- textos ----------

test('textos: errores en español e inglés, con el detalle del fallo', () => {
  assert.match(textoError('sin_sesion', '', 'es'), /^Claude Code no tiene la sesión iniciada/);
  assert.match(textoError('sin_sesion', '', 'en'), /not signed in/);
  assert.equal(textoError('fallo', 'salida 3', 'es'), 'La IA no ha podido contestar (salida 3).');
  assert.equal(textoError('tiempo'), 'La IA ha tardado demasiado. Vuelve a preguntar.');
  for (const t of ['sin_instalar', 'sin_sesion', 'pago_por_uso', 'limite', 'tiempo', 'fallo', 'ocupado']) {
    assert.ok(textoError(t, 'x', 'en').length > 10, t);
  }
});

// ---------- resolverClaude ----------

test('resolverClaude: SNF_CLAUDE, primer .exe de where.exe, luego el .cmd, o null', () => {
  assert.deepEqual(resolverClaude({ env: { SNF_CLAUDE: 'C:\\x\\claude.exe' }, donde: () => ['C:\\otro\\claude.exe'] }), { ruta: 'C:\\x\\claude.exe', tipo: 'exe' });
  assert.deepEqual(resolverClaude({ env: { SNF_CLAUDE: 'C:\\x\\claude.cmd' } }), { ruta: 'C:\\x\\claude.cmd', tipo: 'cmd' });
  assert.deepEqual(resolverClaude({ env: {}, donde: () => ['C:\\n\\claude.cmd', 'C:\\n\\claude.exe', 'C:\\m\\claude.exe'] }), { ruta: 'C:\\n\\claude.exe', tipo: 'exe' });
  assert.deepEqual(resolverClaude({ env: {}, donde: () => ['C:\\n\\claude', 'C:\\n\\claude.cmd'] }), { ruta: 'C:\\n\\claude.cmd', tipo: 'cmd' });
  assert.equal(resolverClaude({ env: {}, donde: () => [] }), null);
});

// ---------- argumentos ----------

const TODAS = new Set(['--model', '--output-format', '--tools', '--strict-mcp-config', '--mcp-config', '--setting-sources',
  '--no-session-persistence', '--max-turns', '--effort', '--disable-slash-commands', '--system-prompt-file', 'auth']);
const PARAMS = { modelo: 'haiku', sistemaArchivo: 'S.txt', mcpVacio: 'M.json' };

test('argumentos: con todas las opciones da exactamente el array del brief', () => {
  assert.deepEqual(argumentos(TODAS, PARAMS), ['-p', '--model', 'haiku', '--output-format', 'json', '--tools', 'WebSearch,WebFetch', '--strict-mcp-config',
    '--mcp-config', 'M.json', '--setting-sources', 'project', '--no-session-persistence', '--max-turns', '10', '--effort', 'low',
    '--disable-slash-commands', '--system-prompt-file', 'S.txt']);
});

test('argumentos: sin --tools se prohíben las herramientas con --disallowedTools; sin --effort se quita', () => {
  const sinTools = new Set(TODAS);
  sinTools.delete('--tools');
  const a = argumentos(sinTools, PARAMS);
  const i = a.indexOf('--disallowedTools');
  assert.ok(i > 0);
  assert.equal(a[i + 1], 'Bash,Edit,Write,Read,Glob,Grep,Task,NotebookEdit,TodoWrite,PowerShell,Agent,MultiEdit,Skill');
  assert.ok(!a.includes('--tools'));
  const sinEsfuerzo = new Set(TODAS);
  sinEsfuerzo.delete('--effort');
  const b = argumentos(sinEsfuerzo, PARAMS);
  assert.ok(!b.includes('--effort') && !b.includes('low'));
  assert.deepEqual(argumentos(new Set(), PARAMS), ['-p', '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,Task,NotebookEdit,TodoWrite,PowerShell,Agent,MultiEdit,Skill']);
});

// 12-nov: solo buscar y leer en internet (WebSearch y WebFetch), sin pedir permiso (--allowed-tools).
const ESPERADO_REAL_SIN_SAFE = ['-p', '--model', 'haiku', '--output-format', 'json', '--tools', 'WebSearch,WebFetch', '--allowed-tools', 'WebSearch,WebFetch', '--strict-mcp-config', '--mcp-config', 'M.json',
  '--setting-sources', 'project', '--no-session-persistence', '--effort', 'low', '--disable-slash-commands'];
const ESPERADO_REAL = [...ESPERADO_REAL_SIN_SAFE, '--safe-mode'];

test('detectarOpciones y argumentos con una copia de la ayuda REAL (2.1.311): sin --system-prompt-file ni --max-turns', async () => {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  const o = await detectarOpciones(falso);
  for (const x of ['--model', '--output-format', '--tools', '--strict-mcp-config', '--mcp-config', '--setting-sources',
    '--no-session-persistence', '--effort', '--disable-slash-commands', '--system-prompt', '--append-system-prompt', '--safe-mode', 'auth']) {
    assert.ok(o.has(x), x);
  }
  assert.ok(!o.has('--system-prompt-file'));
  assert.ok(!o.has('--max-turns'));
  assert.deepEqual(argumentos(o, PARAMS), ESPERADO_REAL);
});

test('detectarOpciones con la ayuda de muestra del brief', async () => {
  const o = await detectarOpciones(falso);
  assert.deepEqual([...o].sort(), [...TODAS, '--help', '--print'].sort());
});

test('detectarOpciones recuerda el resultado mientras no cambie --version', async () => {
  process.env.FALSO_AYUDA = AYUDA_SIN_AUTH;
  const a = await detectarOpciones(falso);
  process.env.FALSO_AYUDA = AYUDA_REAL; // cambia la ayuda pero no la versión: se usa la memoria
  const b = await detectarOpciones(falso);
  assert.equal(a, b);
  olvidarOpciones();
  assert.ok((await detectarOpciones(falso)).has('--effort'));
});

// ---------- entorno ----------

test('entorno: quita las 6 variables de pago por uso y deja solo PATH y las añadidas', () => {
  const seis = { ANTHROPIC_API_KEY: 'a', ANTHROPIC_AUTH_TOKEN: 'b', ANTHROPIC_BASE_URL: 'c', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1', CLAUDE_CODE_USE_FOUNDRY: '1' };
  assert.deepEqual(entorno({ ...seis, PATH: 'p' }, new Set(['--effort'])), { PATH: 'p', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
  assert.deepEqual(entorno({ ...seis, PATH: 'p' }, new Set()), { PATH: 'p', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', MAX_THINKING_TOKENS: '0' });
});

test('entorno: en Windows las variables se quitan sin mirar mayúsculas y no se toca el entorno de entrada', () => {
  const origen = { Anthropic_Api_Key: 'a', Path: 'p' };
  const r = entorno(origen, new Set(['--effort']));
  assert.ok(!('Anthropic_Api_Key' in r));
  assert.equal(r.Path, 'p');
  assert.equal(origen.Anthropic_Api_Key, 'a');
});

// ---------- preguntar ----------

const PREGUNTA = { modelo: 'haiku', sistema: 'SISTEMA DE PRUEBA', entrada: 'ENTRADA ñandú «prueba»' };

test('preguntar ok: sin clave, solo las herramientas de internet, cwd de trabajo y entrada por stdin (con la ayuda de muestra)', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-falsa';
  process.env.FALSO_MODO = 'ok';
  const r = await preguntar(falso, PREGUNTA);
  assert.equal(r.ok, true);
  assert.equal(r.texto, 'respuesta falsa');
  assert.equal(typeof r.ms, 'number');
  const a = lo_apuntado();
  assert.ok(a.argv.includes('haiku'));
  const i = a.argv.indexOf('--tools');
  assert.ok(i >= 0);
  assert.equal(a.argv[i + 1], 'WebSearch,WebFetch');
  assert.equal(a.argv[a.argv.indexOf('--max-turns') + 1], '10');
  assert.equal(a.argv[a.argv.indexOf('--mcp-config') + 1], join(datos, 'mcp-vacio.json'));
  assert.deepEqual(JSON.parse(readFileSync(join(datos, 'mcp-vacio.json'), 'utf8')), { mcpServers: {} });
  assert.ok(!('ANTHROPIC_API_KEY' in a.env));
  assert.equal(a.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1');
  assert.ok(mismaRuta(a.cwd, carpetaTrabajo()));
  // Con --system-prompt-file el sistema va en el archivo y la entrada sola por stdin.
  const archivo = a.argv[a.argv.indexOf('--system-prompt-file') + 1];
  // Lote C (revisión 52, Minor 6): un solo datos\sistema.txt fijo, que se queda (como mcp-vacio.json).
  assert.equal(archivo, join(datos, 'sistema.txt'));
  assert.equal(a.sistemaContenido, 'SISTEMA DE PRUEBA');
  assert.equal(readFileSync(archivo, 'utf8'), 'SISTEMA DE PRUEBA', 'el archivo fijo se queda al terminar');
  assert.equal(a.stdin, PREGUNTA.entrada);
});

test('preguntar con la ayuda REAL: el array exacto y el stdin lleva el sistema y la entrada', async () => {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  const r = await preguntar(falso, PREGUNTA);
  assert.equal(r.ok, true);
  const a = lo_apuntado();
  assert.deepEqual(a.argv, ESPERADO_REAL.map((x) => (x === 'M.json' ? join(datos, 'mcp-vacio.json') : x)));
  assert.equal(a.stdin, 'SISTEMA DE PRUEBA\n\nENTRADA ñandú «prueba»');
  assert.ok(!a.argv.join(' ').includes('SISTEMA'), 'el texto del sistema no va en la línea de órdenes');
  assert.ok(!a.argv.join(' ').includes('ENTRADA'), 'la entrada no va en la línea de órdenes');
});

test('preguntar: sin_sesion, limite, basura y error_json', async () => {
  for (const [modo, tipo] of [['sin_sesion', 'sin_sesion'], ['limite', 'limite'], ['basura', 'fallo'], ['error_json', 'fallo']]) {
    process.env.FALSO_MODO = modo;
    const r = await preguntar(falso, PREGUNTA);
    assert.equal(r.ok, false, modo);
    assert.equal(r.tipo, tipo, modo);
    assert.equal(typeof r.detalle, 'string', modo);
  }
});

test('preguntar: pasado el tiempo da «tiempo» y el proceso ya no vive', async () => {
  await detectarOpciones(falso); // la detección cuenta dentro del tiempo: se deja ya en memoria
  process.env.FALSO_MODO = 'lento';
  const t0 = Date.now();
  const r = await preguntar(falso, { ...PREGUNTA, tiempoMax: 500 });
  assert.equal(r.ok, false);
  assert.equal(r.tipo, 'tiempo');
  assert.ok(Date.now() - t0 < 20_000);
  const { pid } = lo_apuntado();
  for (let i = 0; i < 40 && vive(pid); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(vive(pid), false);
});

function vive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('preguntar sin ejecutable: sin_instalar', async () => {
  const r = await preguntar({ ruta: join(CARPETA, 'no-existe.exe'), tipo: 'exe' }, PREGUNTA);
  assert.equal(r.ok, false);
  assert.equal(r.tipo, 'sin_instalar');
  assert.equal((await preguntar(null, PREGUNTA)).tipo, 'sin_instalar');
});

// ---------- comprobar ----------

test('comprobar: sin ejecutable, auth_ok, auth_console, auth_no y ayuda sin auth', async () => {
  assert.deepEqual(await comprobar(null), { estado: 'sin_instalar' });
  assert.equal((await comprobar({ ruta: join(CARPETA, 'no-existe.exe'), tipo: 'exe' })).estado, 'sin_instalar');
  for (const [modo, estado] of [['auth_ok', 'ok'], ['auth_console', 'pago_por_uso'], ['auth_no', 'sin_sesion']]) {
    process.env.FALSO_MODO = modo;
    const r = await comprobar(falso);
    assert.equal(r.estado, estado, modo);
    assert.equal(r.version, '2.1.0', modo);
  }
  process.env.FALSO_MODO = 'auth_ok';
  process.env.FALSO_AYUDA = AYUDA_SIN_AUTH;
  olvidarOpciones();
  assert.equal((await comprobar(falso)).estado, 'desconocido');
});

test('clasificarAuth: lista blanca con cada authMethod real (solo stdout, JSON)', () => {
  const j = (o) => JSON.stringify({ loggedIn: true, apiProvider: 'firstParty', ...o }, null, 2);
  assert.equal(clasificarAuth(0, j({ authMethod: 'claude.ai' })), 'ok');
  assert.equal(clasificarAuth(0, j({ authMethod: 'oauth_token' })), 'ok');
  assert.equal(clasificarAuth(0, JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' })), 'ok'); // apiProvider ausente
  assert.equal(clasificarAuth(0, j({ authMethod: 'api_key' })), 'pago_por_uso');
  assert.equal(clasificarAuth(0, j({ authMethod: 'api_key_helper' })), 'pago_por_uso');
  assert.equal(clasificarAuth(0, j({ authMethod: 'third_party' })), 'pago_por_uso');
  assert.equal(clasificarAuth(0, j({ authMethod: 'claude.ai', apiProvider: 'bedrock' })), 'pago_por_uso');
  assert.equal(clasificarAuth(0, j({ authMethod: 'claude.ai', apiKeySource: 'ANTHROPIC_API_KEY' })), 'pago_por_uso');
  assert.equal(clasificarAuth(0, j({ authMethod: 'none' })), 'desconocido');
  assert.equal(clasificarAuth(0, j({ authMethod: 'algo_nuevo' })), 'desconocido');
  assert.equal(clasificarAuth(1, j({ authMethod: 'claude.ai' })), 'desconocido', 'con salida distinta de 0 no es ok');
  assert.equal(clasificarAuth(1, JSON.stringify({ loggedIn: false, authMethod: 'none' })), 'sin_sesion');
  assert.equal(clasificarAuth(0, JSON.stringify({ authMethod: 'claude.ai' })), 'sin_sesion', 'sin loggedIn: true no hay sesión');
  // Sin JSON valen las regex del brief.
  assert.equal(clasificarAuth(1, 'Not logged in'), 'sin_sesion');
  assert.equal(clasificarAuth(0, 'Logged in using an API key'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Logged in as x\nLogin method: Claude Max Account'), 'ok');
});

test('comprobar con el JSON real de «auth status»: cada authMethod, con ruido en stderr y con apiProvider bedrock', async () => {
  const casos = [['claude.ai', 'ok'], ['oauth_token', 'ok'], ['api_key', 'pago_por_uso'], ['api_key_helper', 'pago_por_uso'],
    ['third_party', 'pago_por_uso'], ['none', 'sin_sesion']];
  for (const [metodo, estado] of casos) {
    process.env.FALSO_MODO = `auth_json_${metodo}`;
    process.env.FALSO_RUIDO = 'Logged in with Claude Max subscription'; // el ruido de stderr no cuenta
    assert.equal((await comprobar(falso)).estado, estado, metodo);
  }
  process.env.FALSO_MODO = 'auth_json_claude.ai';
  process.env.FALSO_AUTH_EXTRA = '{"apiProvider":"bedrock"}';
  assert.equal((await comprobar(falso)).estado, 'pago_por_uso');
  process.env.FALSO_AUTH_EXTRA = '{"authMethod":"futuro_raro"}';
  const r = await comprobar(falso);
  assert.equal(r.estado, 'desconocido');
  assert.match(textoError('desconocido'), /no se pudo comprobar la cuenta/i);
  assert.match(textoError('desconocido', '', 'en'), /could not check/i);
});

// ---------- el .cmd de Windows ----------

test('claude.cmd (solo Windows): argv llega entero y el entorno va limpio', { skip: !WIN }, async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-falsa';
  const cmd = { ruta: FALSO_CMD, tipo: 'cmd' };
  const r = await preguntar(cmd, PREGUNTA);
  assert.equal(r.ok, true, JSON.stringify(r));
  const a = lo_apuntado();
  const i = a.argv.indexOf('--tools');
  assert.ok(i >= 0);
  assert.equal(a.argv[i + 1], 'WebSearch,WebFetch');
  assert.equal(a.argv[a.argv.indexOf('--effort') + 1], 'low');
  assert.equal(/sistema[.]txt$/.test(a.argv[a.argv.indexOf('--system-prompt-file') + 1]), true);
  assert.equal(a.stdin, PREGUNTA.entrada);
  assert.ok(!('ANTHROPIC_API_KEY' in a.env));
  assert.equal((await comprobar({ ruta: FALSO_CMD, tipo: 'cmd' })).estado, 'sin_sesion'); // modo por defecto: sin auth_ok
});

test('claude.cmd (solo Windows): al pasar el tiempo se mata también al hijo de cmd.exe', { skip: !WIN }, async () => {
  process.env.FALSO_MODO = 'lento';
  // 10 s (antes 3): con la suite en paralelo, cmd.exe + node a veces no llegaban a arrancar el falso en 3 s. El falso
  // «lento» dura 60 s, así que la prueba sigue mirando lo mismo: que al pasar el tiempo se mata también al hijo.
  const r = await preguntar({ ruta: FALSO_CMD, tipo: 'cmd' }, { ...PREGUNTA, tiempoMax: 10_000 });
  assert.equal(r.tipo, 'tiempo');
  const { pid } = lo_apuntado();
  for (let i = 0; i < 40 && vive(pid); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(vive(pid), false);
});

// ---------- el registro nunca apunta preguntas ni respuestas ----------

test('el registro no contiene nunca la pregunta, el sistema, la respuesta ni los mensajes de error de la IA', async () => {
  const unico = { modelo: 'haiku', sistema: 'SISTEMA_SECRETO_7731', entrada: 'PREGUNTA_SECRETA_9182' };
  process.env.FALSO_RESPUESTA = 'RESPUESTA_SECRETA_5540';
  for (const modo of ['ok', 'sin_sesion', 'limite', 'basura', 'error_json']) {
    process.env.FALSO_MODO = modo;
    await preguntar(falso, unico);
  }
  process.env.FALSO_MODO = 'lento';
  await preguntar(falso, { ...unico, tiempoMax: 400 });
  process.env.FALSO_MODO = 'auth_ok';
  await comprobar(falso);
  const ruta = join(datos, 'registro.log');
  assert.ok(existsSync(ruta), 'se esperaba algún apunte técnico');
  const texto = readdirSync(datos).filter((f) => /^registro.*\.log$/.test(f)).map((f) => readFileSync(join(datos, f), 'utf8')).join('\n');
  for (const prohibido of ['SISTEMA_SECRETO_7731', 'PREGUNTA_SECRETA_9182', 'RESPUESTA_SECRETA_5540', 'Invalid API key', 'usage limit reached', 'Fallo interno', 'esto no es JSON']) {
    assert.ok(!texto.includes(prohibido), `el registro contiene «${prohibido}»`);
  }
});

test('ningún código de src llama a log() con la entrada, el sistema ni la respuesta', () => {
  for (const f of ['claude.mjs', 'rutas.mjs', 'textos.mjs']) {
    const fuente = readFileSync(join(AQUI, '..', 'src', f), 'utf8');
    for (const linea of fuente.split('\n')) {
      if (/\blog\s*\(/.test(linea) && !/^\s*(\/\/|\*)/.test(linea)) {
        assert.ok(!/\b(entrada|sistema|texto|stdout|stderr|salida|detalle)\b/.test(linea), `${f}: ${linea.trim()}`);
      }
    }
  }
});

test('opus: «El más capaz» pasa a Claude Code como --model opus (el CLI lo resuelve al Opus más nuevo de la cuenta)', async () => {
  assert.deepEqual(argumentos(TODAS, { ...PARAMS, modelo: 'opus' }).slice(0, 3), ['-p', '--model', 'opus']);
  process.env.FALSO_MODO = 'ok';
  const r = await preguntar(falso, { ...PREGUNTA, modelo: 'opus' });
  assert.equal(r.ok, true);
  const a = lo_apuntado();
  assert.equal(a.argv[a.argv.indexOf('--model') + 1], 'opus');
});

test('tiempo máximo por modelo: 120 s haiku, 180 s sonnet, 300 s opus; lo raro, el de haiku', () => {
  assert.equal(TIEMPO_HAIKU, 120_000);
  assert.equal(TIEMPO_SONNET, 180_000);
  assert.equal(TIEMPO_OPUS, 300_000);
  assert.equal(tiempoDe('haiku'), TIEMPO_HAIKU);
  assert.equal(tiempoDe('sonnet'), TIEMPO_SONNET);
  assert.equal(tiempoDe('opus'), TIEMPO_OPUS);
  for (const raro of ['fable', '', undefined, null, 'OPUS']) assert.equal(tiempoDe(raro), TIEMPO_HAIKU, String(raro));
});

// ---------- ronda 1: seguridad ----------

test('modelo: solo haiku, sonnet y opus; cualquier otro valor da fallo sin lanzar nada', async () => {
  assert.deepEqual(MODELOS, ['haiku', 'sonnet', 'opus']);
  assert.throws(() => argumentos(TODAS, { ...PARAMS, modelo: 'fable' }), /modelo no válido/);
  assert.throws(() => argumentos(TODAS, { ...PARAMS, modelo: undefined }), /modelo no válido/);
  for (const modelo of ['fable', 'OPUS', 'opus ', '', undefined, 'haiku" & echo INYECTADO>pwned.txt & "', 'HAIKU', 'haiku ']) {
    const r = await preguntar(falso, { ...PREGUNTA, modelo });
    assert.deepEqual(r, { ok: false, tipo: 'fallo', detalle: 'modelo no válido' }, String(modelo));
  }
  assert.ok(!existsSync(registro), 'no se lanzó nada');
});

test('inyección por modelo con claude.cmd (solo Windows): no se crea ningún archivo y el resultado es fallo', { skip: !WIN }, async () => {
  const cwd = process.cwd();
  const r = await preguntar({ ruta: FALSO_CMD, tipo: 'cmd' }, { ...PREGUNTA, modelo: 'haiku" & echo INYECTADO>pwned.txt & "' });
  assert.equal(r.ok, false);
  assert.equal(r.tipo, 'fallo');
  for (const dir of [cwd, carpetaTrabajo(), datos, FALSO]) assert.ok(!existsSync(join(dir, 'pwned.txt')), dir);
  assert.ok(!existsSync(registro));
});

test('claude.cmd (solo Windows): se rechaza, sin lanzar, cualquier argumento con " % ^ & | < > ! CR o LF (también en las rutas)', { skip: !WIN }, async () => {
  for (const mal of ['a"b', 'a%b', 'a^b', 'a&b', 'a|b', 'a<b', 'a>b', 'a!b', 'a\rb', 'a\nb']) {
    // la carpeta de datos va en --mcp-config y en --system-prompt-file
    process.env.SNF_DATOS = join(CARPETA, `mal${n}${mal}`);
    const r = await preguntar({ ruta: FALSO_CMD, tipo: 'cmd' }, PREGUNTA);
    assert.equal(r.ok, false, JSON.stringify(mal));
    assert.equal(r.tipo, 'fallo', JSON.stringify(mal));
    assert.ok(!existsSync(registro), JSON.stringify(mal));
  }
  const rutaMala = join(CARPETA, 'a&b.cmd');
  writeFileSync(rutaMala, '@echo INYECTADO>pwned2.txt\r\n');
  process.env.SNF_DATOS = datos;
  const r = await preguntar({ ruta: rutaMala, tipo: 'cmd' }, PREGUNTA);
  assert.equal(r.tipo, 'fallo');
  assert.ok(!existsSync(join(carpetaTrabajo(), 'pwned2.txt')) && !existsSync(join(process.cwd(), 'pwned2.txt')));
});

test('entorno: quita todo ANTHROPIC_*, CLAUDE_CODE_USE_* y CLAUDE_CODE_API_KEY_* (sin mirar mayúsculas) y conserva CLAUDE_CODE_OAUTH_TOKEN', () => {
  const r = entorno({
    CLAUDE_CODE_USE_ANTHROPIC_AWS: '1', ANTHROPIC_BEDROCK_BASE_URL: 'u', CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR: '3',
    anthropic_model: 'x', Claude_Code_Use_Mantle: '1', CLAUDE_CODE_OAUTH_TOKEN: 'token', CLAUDE_CODE_SIMPLE: '0', PATH: 'p',
  }, new Set(['--effort']));
  assert.deepEqual(r, { CLAUDE_CODE_OAUTH_TOKEN: 'token', CLAUDE_CODE_SIMPLE: '0', PATH: 'p', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
});

test('carpeta de trabajo: lo que haya (.claude, CLAUDE.md) se renombra a datos/cuarentena/<sello>/ antes de lanzar', async () => {
  const t = carpetaTrabajo();
  mkdirSync(join(t, '.claude'));
  writeFileSync(join(t, '.claude', 'settings.json'), '{"hooks":{}}');
  writeFileSync(join(t, 'CLAUDE.md'), 'haz otra cosa');
  const r = await preguntar(falso, PREGUNTA);
  assert.equal(r.ok, true);
  assert.deepEqual(lo_apuntado().lista, [MARCA_TRABAJO], 'la IA se lanza en una carpeta vacía (solo la marca de la app)');
  assert.deepEqual(readdirSync(t), [MARCA_TRABAJO]);
  const cuarentena = join(datos, 'cuarentena');
  const sellos = readdirSync(cuarentena);
  const movido = sellos.map((s) => join(cuarentena, s)).find((d) => existsSync(join(d, 'CLAUDE.md')));
  assert.ok(movido, sellos.join(','));
  assert.equal(readFileSync(join(movido, 'CLAUDE.md'), 'utf8'), 'haz otra cosa');
  assert.ok(existsSync(join(movido, '.claude', 'settings.json')));
  assert.deepEqual(despejarTrabajo(), []);
  writeFileSync(join(t, 'salida.txt'), 'propio');
  assert.deepEqual(despejarTrabajo({ conservar: ['salida.txt'] }), []);
  assert.deepEqual(readdirSync(t).sort(), [MARCA_TRABAJO, 'salida.txt'].sort());
});

test('--safe-mode se añade si la ayuda lo lista y nunca se usa --bare', () => {
  const con = argumentos(new Set([...TODAS, '--safe-mode', '--bare']), PARAMS);
  assert.ok(con.includes('--safe-mode'));
  assert.ok(!con.includes('--bare'));
  assert.ok(!argumentos(TODAS, PARAMS).includes('--safe-mode'));
});

test('--mcp-config solo se pasa si también existe --strict-mcp-config', () => {
  const sin = new Set(TODAS);
  sin.delete('--strict-mcp-config');
  const a = argumentos(sin, PARAMS);
  assert.ok(!a.includes('--mcp-config') && !a.includes('M.json') && !a.includes('--strict-mcp-config'));
});

test('salida de más de 1 MB: se mata al hijo y da fallo «respuesta demasiado grande»', async () => {
  process.env.FALSO_MODO = 'enorme';
  const r = await preguntar(falso, PREGUNTA);
  assert.deepEqual(r, { ok: false, tipo: 'fallo', detalle: 'respuesta demasiado grande' });
});

test('dos llamadas a la vez con sistemas distintos no se pisan: la segunda lleva su propio archivo, que va a la cuarentena', async () => {
  const [a, b] = await Promise.all([preguntar(falso, { ...PREGUNTA, sistema: 'UNO' }), preguntar(falso, { ...PREGUNTA, sistema: 'DOS' })]);
  assert.equal(a.ok && b.ok, true);
  assert.deepEqual(readdirSync(datos).filter((f) => /^sistema/.test(f)), ['sistema.txt'], readdirSync(datos).join(','));
  const fijo = readFileSync(join(datos, 'sistema.txt'), 'utf8');
  const guardados = readdirSync(join(datos, 'cuarentena', 'sistema')).map((f) => readFileSync(join(datos, 'cuarentena', 'sistema', f), 'utf8'));
  assert.deepEqual([fijo, ...guardados].sort(), ['DOS', 'UNO']);
  assert.deepEqual(JSON.parse(readFileSync(join(datos, 'mcp-vacio.json'), 'utf8')), { mcpServers: {} });
});

test('lote C (52-M6): con el mismo sistema, cada pregunta usa el mismo sistema.txt y no deja archivos nuevos', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await preguntar(falso, PREGUNTA)).ok, true);
  assert.deepEqual(readdirSync(datos).filter((f) => /^sistema/.test(f)), ['sistema.txt']);
  assert.equal(readFileSync(join(datos, 'sistema.txt'), 'utf8'), 'SISTEMA DE PRUEBA');
  assert.ok(!existsSync(join(datos, 'cuarentena')), 'nada en la cuarentena');
});

test('lote C (52-M6): los sistema-*.txt que ya había en cuarentena\\sistema no se tocan', async () => {
  const viejos = join(datos, 'cuarentena', 'sistema');
  mkdirSync(viejos, { recursive: true });
  writeFileSync(join(viejos, 'sistema-0123456789ab.txt'), 'VIEJO');
  assert.equal((await preguntar(falso, PREGUNTA)).ok, true);
  assert.deepEqual(readdirSync(viejos), ['sistema-0123456789ab.txt']);
  assert.equal(readFileSync(join(viejos, 'sistema-0123456789ab.txt'), 'utf8'), 'VIEJO');
});

test('la detección de opciones cuenta dentro del tiempo máximo', async () => {
  process.env.FALSO_MODO = 'lento';
  const r = await preguntar(falso, { ...PREGUNTA, tiempoMax: 1 });
  assert.equal(r.tipo, 'tiempo');
});

test('registro: si el nombre de destino de la rotación existe, se añade un sufijo', () => {
  const ruta = join(datos, 'registro.log');
  const falsoSello = '2000-01-01T00-00-00-000Z';
  mkdirSync(datos, { recursive: true });
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    toISOString() { return '2000-01-01T00:00:00.000Z'; }
  };
  try {
    for (let i = 0; i < 3; i++) {
      writeFileSync(ruta, `viejo${i}`.padEnd(MAX_BYTES + 1, 'x'));
      log('info', 'otra');
    }
  } finally {
    globalThis.Date = RealDate;
  }
  const nombres = readdirSync(datos).filter((f) => f.startsWith('registro-')).sort();
  assert.deepEqual(nombres, [`registro-${falsoSello}-1.log`, `registro-${falsoSello}-2.log`, `registro-${falsoSello}.log`]);
  assert.equal(readFileSync(join(datos, `registro-${falsoSello}.log`), 'utf8').slice(0, 6), 'viejo0');
});

// ---------- ronda 2 ----------

const REALES = ['claude.ai', 'oauth_token', 'api_key', 'api_key_helper', 'third_party', 'none'];
const ESPERADO_POR_METODO = { 'claude.ai': 'ok', oauth_token: 'ok', api_key: 'pago_por_uso', api_key_helper: 'pago_por_uso', third_party: 'pago_por_uso', none: 'sin_sesion' };

test('clasificarAuth: JSON con una línea de aviso antes y otra después, para cada authMethod real', () => {
  for (const metodo of REALES) {
    const json = JSON.stringify({ loggedIn: metodo !== 'none', authMethod: metodo, apiProvider: 'firstParty', projectsDirectory: 'C:\\p' }, null, 2);
    const salida = `Aviso: hay una versión nueva\n${json}\nOtro aviso { con llave }`;
    assert.equal(clasificarAuth(metodo === 'none' ? 1 : 0, salida), ESPERADO_POR_METODO[metodo], metodo);
  }
  const bedrock = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'bedrock' });
  assert.equal(clasificarAuth(0, `x\n${bedrock}\ny`), 'pago_por_uso');
  // las llaves dentro de cadenas no rompen el emparejado
  assert.equal(clasificarAuth(0, `aviso\n${JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', nota: 'a } b { c' })}\nfin`), 'ok');
});

test('clasificarAuth: texto, solo ok con «Login method: Claude Pro|Max|Team|Enterprise» y sin términos de otros proveedores', () => {
  assert.equal(clasificarAuth(0, 'Logged in as alguien@example.com\nLogin method: Claude Max Account'), 'ok');
  assert.equal(clasificarAuth(0, 'Login method: Claude Team Account\nOrganization: Equipo'), 'ok');
  assert.equal(clasificarAuth(0, 'Logged in via Amazon Bedrock'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Logged in (Vertex AI)'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Using Foundry project'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Logged in using a gateway'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Login method: Claude Max Account\nAPI key: sk-…'), 'desconocido', 'positivo y término de pago a la vez');
  assert.equal(clasificarAuth(0, 'Logged in as apikeys@example.com\nLogin method: Claude Pro Account'), 'desconocido', 'el correo también se mira: en la duda no se pregunta');
  assert.equal(clasificarAuth(0, 'apiProvider: firstParty\nprojectsDirectory: C:\\p\nLogged in'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Logged in as alguien'), 'desconocido');
  assert.equal(clasificarAuth(1, 'Login method: Claude Max Account'), 'desconocido', 'con salida distinta de 0 no es ok');
  assert.equal(clasificarAuth(1, 'Not logged in'), 'sin_sesion');
  assert.equal(clasificarAuth(0, ''), 'desconocido');
});

test('comprobar pasa --json si la ayuda de «auth status» lo trae', async () => {
  const auth = join(CARPETA, `auth${n}.json`);
  process.env.FALSO_REGISTRO_AUTH = auth;
  process.env.FALSO_MODO = 'auth_json_claude.ai';
  process.env.FALSO_AUTH_JSON = '1';
  assert.equal((await comprobar(falso)).estado, 'ok');
  assert.deepEqual(JSON.parse(readFileSync(auth, 'utf8')), ['auth', 'status', '--json']);
  delete process.env.FALSO_AUTH_JSON;
  olvidarOpciones();
  assert.equal((await comprobar(falso)).estado, 'ok');
  assert.deepEqual(JSON.parse(readFileSync(auth, 'utf8')), ['auth', 'status']);
  delete process.env.FALSO_REGISTRO_AUTH;
});

test('comprobar con la salida en texto del falso (Login method) da ok y con Console da pago_por_uso', async () => {
  process.env.FALSO_MODO = 'auth_ok';
  assert.equal((await comprobar(falso)).estado, 'ok');
  process.env.FALSO_MODO = 'auth_console';
  assert.equal((await comprobar(falso)).estado, 'pago_por_uso');
});

test('carpeta de trabajo ajena: SNF_DATOS con un «trabajo» sin marca no se vacía ni se usa', async () => {
  const t = join(datos, 'trabajo');
  mkdirSync(t, { recursive: true });
  writeFileSync(join(t, 'documento.txt'), 'importante');
  mkdirSync(join(t, 'sub'));
  writeFileSync(join(t, 'sub', 'otro.txt'), 'más');
  const r = await preguntar(falso, PREGUNTA);
  assert.equal(r.ok, false);
  assert.equal(r.tipo, 'fallo');
  assert.match(r.detalle, /no es de SnetForever/);
  assert.deepEqual(readdirSync(t).sort(), ['documento.txt', 'sub']);
  assert.equal(readFileSync(join(t, 'documento.txt'), 'utf8'), 'importante');
  assert.ok(!existsSync(registro), 'no se lanzó nada');
  assert.ok(!existsSync(join(datos, 'cuarentena')));
  assert.throws(() => despejarTrabajo(), /no es de SnetForever/);
  assert.equal((await comprobar(falso)).estado, 'desconocido');
});

test('un «trabajo» vacío y sin marca solo se adopta en la carpeta de datos por defecto; con SNF_DATOS se rechaza', async () => {
  // Con SNF_DATOS (esta prueba) y vacío: rechazado, sin escribir la marca ni mover nada.
  const t = join(datos, 'trabajo');
  mkdirSync(t, { recursive: true });
  const r = await preguntar(falso, PREGUNTA);
  assert.equal(r.ok, false);
  assert.match(r.detalle, /no es de SnetForever/);
  assert.deepEqual(readdirSync(t), []);
  assert.ok(!existsSync(registro) && !existsSync(join(datos, 'cuarentena')));
  assert.throws(() => carpetaTrabajo(), /no es de SnetForever/);
  assert.throws(() => despejarTrabajo(), /no es de SnetForever/);
  assert.deepEqual(readdirSync(t), [], 'sigue sin marca');
  // Con la carpeta por defecto (%LOCALAPPDATA%\SnetForever, sin SNF_DATOS) sí se adopta.
  const local = join(CARPETA, `local${n}`);
  const porDefecto = join(local, 'SnetForever', 'trabajo');
  mkdirSync(porDefecto, { recursive: true });
  const env = { LOCALAPPDATA: local };
  assert.equal(carpetaTrabajo(env), porDefecto);
  assert.deepEqual(readdirSync(porDefecto), [MARCA_TRABAJO]);
  // y una por defecto con cosas dentro y sin marca tampoco
  const local2 = join(CARPETA, `local2_${n}`);
  mkdirSync(join(local2, 'SnetForever', 'trabajo'), { recursive: true });
  writeFileSync(join(local2, 'SnetForever', 'trabajo', 'a.txt'), 'x');
  assert.throws(() => carpetaTrabajo({ LOCALAPPDATA: local2 }), /no es de SnetForever/);
});

test('la app crea «trabajo» con su marca solo si no existe', () => {
  assert.equal(existsSync(join(datos, 'trabajo')), false);
  assert.equal(carpetaTrabajo(), join(datos, 'trabajo'));
  assert.deepEqual(readdirSync(join(datos, 'trabajo')), [MARCA_TRABAJO]);
});

test('«trabajo» como unión o enlace (solo Windows) se rechaza y no se toca lo de fuera', { skip: !WIN }, async () => {
  const fuera = join(CARPETA, `fuera${n}`);
  mkdirSync(fuera);
  writeFileSync(join(fuera, 'ajeno.txt'), 'no me toques');
  writeFileSync(join(fuera, MARCA_TRABAJO), 'id'); // aunque tenga marca
  mkdirSync(datos, { recursive: true });
  symlinkSync(fuera, join(datos, 'trabajo'), 'junction');
  const r = await preguntar(falso, PREGUNTA);
  assert.equal(r.ok, false);
  assert.match(r.detalle, /no es de SnetForever/);
  assert.deepEqual(readdirSync(fuera).sort(), [MARCA_TRABAJO, 'ajeno.txt']);
  assert.ok(!existsSync(registro));
});

test('mcp-vacio.json se comprueba en cada llamada y se reescribe si cambia (el cambiado va a la cuarentena)', async () => {
  assert.equal((await preguntar(falso, PREGUNTA)).ok, true);
  const ruta = join(datos, 'mcp-vacio.json');
  writeFileSync(ruta, '{"mcpServers":{"malo":{"command":"x"}}}');
  assert.equal((await preguntar(falso, PREGUNTA)).ok, true);
  assert.equal(readFileSync(ruta, 'utf8'), '{"mcpServers":{}}');
  const guardado = readdirSync(join(datos, 'cuarentena')).map((s) => join(datos, 'cuarentena', s, 'mcp-vacio.json')).find((f) => existsSync(f));
  assert.match(readFileSync(guardado, 'utf8'), /malo/);
});

test('lote C (52-M6): sistema.txt solo se reescribe si cambia su contenido, y el de antes va a la cuarentena', async () => {
  for (let i = 0; i < 3; i++) await preguntar(falso, { ...PREGUNTA, sistema: `S${i}` });
  assert.equal(readFileSync(join(datos, 'sistema.txt'), 'utf8'), 'S2');
  assert.equal(lo_apuntado().sistemaContenido, 'S2');
  const apartados = readdirSync(join(datos, 'cuarentena')).map((s) => join(datos, 'cuarentena', s, 'sistema.txt'))
    .filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8'));
  assert.deepEqual(apartados.sort(), ['S0', 'S1'], 'nada se borra');
});

test('mensajes claros: carpeta de datos no válida y rutas con caracteres no admitidos', async () => {
  const archivo = join(CARPETA, `archivo${n}.txt`);
  writeFileSync(archivo, 'soy un archivo');
  process.env.SNF_DATOS = archivo;
  const r = await preguntar(falso, PREGUNTA);
  assert.deepEqual([r.ok, r.tipo, r.detalle], [false, 'fallo', 'carpeta de datos no válida']);
  assert.ok(!/actualiza/i.test(textoError('fallo', r.detalle)));
  if (WIN) {
    process.env.SNF_DATOS = join(CARPETA, `a&b${n}`);
    const w = await preguntar({ ruta: FALSO_CMD, tipo: 'cmd' }, PREGUNTA);
    assert.equal(w.tipo, 'fallo');
    assert.match(w.detalle, /caracteres no admitidos/);
    assert.match(w.detalle, /instalador oficial \(\.exe\)/);
    const c = await comprobar({ ruta: join(CARPETA, 'a&b.cmd'), tipo: 'cmd' });
    assert.ok(!/actualiza/i.test(textoError('desconocido', c.motivo)), c.motivo);
  }
});

// ---------- ronda 3 ----------

test('clasificarAuth: varios objetos con loggedIn que no coinciden dan desconocido', () => {
  const bueno = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' });
  const real = JSON.stringify({ loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty' }, null, 2);
  assert.equal(clasificarAuth(0, `Aviso de ejemplo: ${bueno}\n${real}`), 'desconocido');
  assert.equal(clasificarAuth(0, `${real}\nAviso: ${bueno}`), 'desconocido');
  assert.equal(clasificarAuth(0, `${bueno}\n${JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'bedrock' })}`), 'desconocido');
  // si coinciden, vale uno solo; y un objeto sin loggedIn no cuenta
  assert.equal(clasificarAuth(0, `${bueno}\n${bueno}`), 'ok');
  assert.equal(clasificarAuth(0, `{"otra":1}\n${bueno}`), 'ok');
});

test('clasificarAuth en texto: «not logged in» manda, más términos de otros proveedores y los correos cuentan', () => {
  assert.equal(clasificarAuth(1, 'Not logged in. Set an API key to continue'), 'sin_sesion');
  assert.equal(clasificarAuth(0, 'Not logged in · ANTHROPIC_API_KEY'), 'sin_sesion');
  assert.equal(clasificarAuth(0, 'Logged in\nBase URL: http://localhost:8080'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Logged in through a proxy'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Logged in with an auth token'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Logged in\nANTHROPIC_BASE_URL set'), 'pago_por_uso');
  assert.equal(clasificarAuth(0, 'Login method: Claude Max Account\nBase URL: http://x'), 'desconocido', 'positivo y término a la vez');
  assert.equal(clasificarAuth(0, 'Login method: Claude Pro Account\nProxy: http://x'), 'desconocido');
  assert.equal(clasificarAuth(0, 'Logged in as gateway@example.com\nLogin method: Claude Max Account'), 'desconocido', 'el correo también se mira');
  assert.equal(clasificarAuth(0, 'Logged in as alguien@example.com\nLogin method: Claude Max Account'), 'ok');
});

test('clasificarAuth: un señuelo «bueno» antes del JSON real con apiKeySource no da ok (firma con apiKeySource)', () => {
  const bueno = '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}';
  const malo = '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","apiKeySource":"ANTHROPIC_API_KEY"}';
  assert.equal(clasificarAuth(0, `aviso ${bueno}\n${malo}`), 'desconocido');
  assert.equal(clasificarAuth(0, `${malo}\n${bueno}`), 'desconocido');
});

test('clasificarAuth: en texto solo se quita la coincidencia del positivo, no la línea entera', () => {
  assert.equal(clasificarAuth(0, 'Login method: Claude Pro via API key'), 'desconocido');
  assert.equal(clasificarAuth(0, 'Login method: Claude Max Account'), 'ok');
});

// ---------- tarea 13: Claude Code con el servidor de herramientas (--mcp-config) ----------

const MCP_H = 'H.json';
const CON_HERRAMIENTAS = { ...PARAMS, herramientas: { mcpConfig: MCP_H, nombres: HERRAMIENTAS } };
const PERMITIDAS = ['WebSearch', 'WebFetch', ...HERRAMIENTAS.map((h) => `mcp__snetforever__${h}`)].join(',');
const ESPERADO_REAL_HERRAMIENTAS = ['-p', '--model', 'haiku', '--output-format', 'stream-json', '--verbose', '--tools', 'WebSearch,WebFetch',
  '--allowed-tools', PERMITIDAS, '--strict-mcp-config', '--mcp-config', MCP_H, '--setting-sources', 'project', '--no-session-persistence',
  '--effort', 'medium', '--disable-slash-commands', '--restricted'];

// Líneas de muestra de un stream-json de Claude Code (con --verbose).
const URL_PAGINA = 'https://ejemplo.test/guia/URL_SECRETA_4471';
const STREAM = [
  { type: 'system', subtype: 'init', mcp_servers: [{ name: 'snetforever', status: 'connected' }], tools: ['WebFetch'] },
  'esto no es JSON',
  { type: 'assistant', message: { content: [{ type: 'text', text: 'voy a mirar' },
    { type: 'tool_use', id: 'toolu_1', name: 'mcp__snetforever__leer_guia', input: { guia: 'GUIA_SECRETA_1' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'texto de la guía' }] }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_2', name: 'WebFetch', input: { url: URL_PAGINA, prompt: 'coordenadas' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: [{ type: 'text', text: 'PAGINA_SECRETA_8812 en 45.2, 61.8' }, { type: 'text', text: 'segunda parte' }] }] } },
  '{roto',
  { type: 'result', subtype: 'success', is_error: false, result: 'RESPUESTA_SECRETA_3390' },
];
const lineas = (lista) => lista.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n');

test('tarea 13: constantes de las preguntas con herramientas', () => {
  assert.equal(TIEMPO_HERRAMIENTAS, 300_000);
  assert.equal(MAX_TURNOS_HERRAMIENTAS, 40);
  assert.equal(MAX_SALIDA_HERRAMIENTAS, 16 * 1024 * 1024);
  assert.equal(MAX_TEXTO_PAGINA, 200_000);
  // R3: con herramientas el tiempo es el mayor de los dos (no se baja el de opus).
  for (const m of MODELOS) assert.equal(tiempoConHerramientas(m), Math.max(TIEMPO_HERRAMIENTAS, tiempoDe(m)), m);
});

test('tarea 13: argumentos con herramientas y la ayuda REAL: stream-json, solo nuestro servidor, sin --safe-mode y con --restricted', async () => {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  const o = await detectarOpciones(falso);
  assert.ok(o.has('--verbose') && o.has('--restricted') && o.has('--safe-mode'));
  const a = argumentos(o, CON_HERRAMIENTAS);
  assert.deepEqual(a, ESPERADO_REAL_HERRAMIENTAS);
  assert.ok(!a.includes('--safe-mode'), 'su ayuda dice que apaga los servidores MCP');
  // Sin herramientas, exactamente los de hoy (con --safe-mode y sin --restricted).
  assert.deepEqual(argumentos(o, PARAMS), ESPERADO_REAL);
  assert.deepEqual(argumentos(o, { ...PARAMS, herramientas: null }), ESPERADO_REAL);
});

test('tarea 13: argumentos con herramientas y la ayuda de muestra: sin --verbose va json, y --max-turns 40', () => {
  const a = argumentos(TODAS, CON_HERRAMIENTAS);
  assert.equal(a[a.indexOf('--output-format') + 1], 'json');
  assert.ok(!a.includes('stream-json') && !a.includes('--verbose'));
  assert.equal(a[a.indexOf('--max-turns') + 1], '40');
  assert.equal(a[a.indexOf('--mcp-config') + 1], MCP_H);
  assert.ok(!a.includes('M.json'));
  const hoy = argumentos(TODAS, PARAMS);
  assert.equal(hoy[hoy.indexOf('--max-turns') + 1], '10');
  // Sin --strict-mcp-config nunca se carga el servidor: los argumentos de hoy.
  const sin = new Set(TODAS);
  sin.delete('--strict-mcp-config');
  assert.deepEqual(argumentos(sin, CON_HERRAMIENTAS), argumentos(sin, PARAMS));
  // Un nombre de herramienta raro no llega nunca a la línea de órdenes.
  assert.throws(() => argumentos(TODAS, { ...PARAMS, herramientas: { mcpConfig: MCP_H, nombres: ['a&b'] } }), /herramienta no válida/);
});

test('tarea 13: leerStreamJson da el result, las páginas leídas, las herramientas usadas y el estado del servidor', () => {
  const l = leerStreamJson(lineas(STREAM));
  assert.deepEqual(l.resultado, { result: 'RESPUESTA_SECRETA_3390', is_error: false });
  assert.deepEqual(l.paginas, [{ url: URL_PAGINA, texto: 'PAGINA_SECRETA_8812 en 45.2, 61.8\nsegunda parte' }]);
  assert.deepEqual(l.usadas, { leer_guia: 1, WebFetch: 1 });
  assert.deepEqual(l.mcp, { snetforever: 'connected' });
  // tool_result con el texto en una cadena; una página de más de MAX_TEXTO_PAGINA se corta; con \r\n también vale.
  const largo = 'x'.repeat(MAX_TEXTO_PAGINA + 50);
  const otro = leerStreamJson(lineas([
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'WebFetch', input: { url: 'https://a.test/' } },
      { type: 'tool_use', id: 'b', name: 'WebFetch', input: { url: 'https://b.test/' } },
      { type: 'tool_use', id: 'c', name: 'mcp__snetforever__buscar_guias', input: {} },
      { type: 'tool_use', id: 'd', name: 'mcp__snetforever__buscar_guias', input: {} }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: 'texto suelto' },
      { type: 'tool_result', tool_use_id: 'b', content: largo }] } },
  ]).replace(/\n/g, '\r\n'));
  assert.equal(otro.resultado, null);
  assert.deepEqual(otro.paginas.map((p) => p.url), ['https://a.test/', 'https://b.test/']);
  assert.equal(otro.paginas[0].texto, 'texto suelto');
  assert.equal(otro.paginas[1].texto.length, MAX_TEXTO_PAGINA);
  assert.deepEqual(otro.usadas, { WebFetch: 2, buscar_guias: 2 });
  assert.deepEqual(otro.mcp, {});
  assert.deepEqual(leerStreamJson(''), { resultado: null, paginas: [], usadas: {}, mcp: {} });
  assert.deepEqual(leerStreamJson('basura\n[1,2]\nnull\n"x"'), { resultado: null, paginas: [], usadas: {}, mcp: {} });
});

test('tarea 13: asegurarMcpHerramientas escribe exactamente el mcp.json y reescribe uno cambiado (el cambiado va a la cuarentena)', () => {
  mkdirSync(datos, { recursive: true });
  const node = 'C:\\Programas\\node\\node.exe';
  const servidor = 'C:\\App SnetForever\\src\\herramientas\\servidor.mjs';
  const esperado = { mcpServers: { snetforever: { type: 'stdio', command: node, args: [servidor, '--datos', datos], env: {} } } };
  const ruta = asegurarMcpHerramientas(datos, { node, servidor });
  assert.equal(ruta, join(datos, 'herramientas', 'mcp.json'));
  assert.equal(readFileSync(ruta, 'utf8'), JSON.stringify(esperado));
  assert.deepEqual(JSON.parse(readFileSync(ruta, 'utf8')), esperado, 'las barras de Windows bien escapadas');
  assert.equal(asegurarMcpHerramientas(datos, { node, servidor }), ruta);
  assert.ok(!existsSync(join(datos, 'cuarentena')), 'si no cambia no se toca');
  writeFileSync(ruta, '{"mcpServers":{"malo":{"command":"cmd.exe"}}}');
  asegurarMcpHerramientas(datos, { node, servidor });
  assert.equal(readFileSync(ruta, 'utf8'), JSON.stringify(esperado));
  const guardado = readdirSync(join(datos, 'cuarentena')).map((s) => join(datos, 'cuarentena', s, 'mcp.json')).find((f) => existsSync(f));
  assert.match(readFileSync(guardado, 'utf8'), /malo/);
  // Por defecto, el node de la app y el servidor.mjs de verdad.
  assert.equal(NOMBRE_SERVIDOR, 'snetforever');
  assert.ok(existsSync(SERVIDOR) && /servidor\.mjs$/.test(SERVIDOR));
  const porDefecto = JSON.parse(readFileSync(asegurarMcpHerramientas(datos), 'utf8'));
  assert.deepEqual(porDefecto.mcpServers.snetforever, { type: 'stdio', command: process.execPath, args: [SERVIDOR, '--datos', datos], env: {} });
});

test('tarea 13: preguntar con herramientas (ayuda REAL, stream): result, páginas, usadas y mcp, y el registro sin urls', async () => {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  process.env.FALSO_MODO = 'stream';
  process.env.FALSO_STREAM = JSON.stringify(STREAM);
  mkdirSync(datos, { recursive: true });
  const mcpConfig = asegurarMcpHerramientas(datos);
  const r = await preguntar(falso, { ...PREGUNTA, herramientas: { mcpConfig, nombres: HERRAMIENTAS } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.texto, 'RESPUESTA_SECRETA_3390');
  assert.equal(typeof r.ms, 'number');
  assert.deepEqual(r.paginas, [{ url: URL_PAGINA, texto: 'PAGINA_SECRETA_8812 en 45.2, 61.8\nsegunda parte' }]);
  assert.deepEqual(r.usadas, { leer_guia: 1, WebFetch: 1 });
  assert.deepEqual(r.mcp, { snetforever: 'connected' });
  assert.ok(!('sinHerramientas' in r));
  const a = lo_apuntado();
  assert.deepEqual(a.argv, ESPERADO_REAL_HERRAMIENTAS.map((x) => (x === MCP_H ? mcpConfig : x)));
  // R16: con herramientas, sin ToolSearch (que escondería las seis detrás de una herramienta que --tools deja fuera).
  assert.equal(a.env.ENABLE_TOOL_SEARCH, 'false');
  const log = readFileSync(join(datos, 'registro.log'), 'utf8');
  assert.match(log, /claude herramientas: leer_guia 1, WebFetch 1 \(mcp connected\)/);
  for (const prohibido of ['URL_SECRETA', 'ejemplo.test', 'PAGINA_SECRETA', 'RESPUESTA_SECRETA', 'GUIA_SECRETA', 'coordenadas', 'SISTEMA DE PRUEBA', 'ENTRADA']) {
    assert.ok(!log.includes(prohibido), `el registro contiene «${prohibido}»`);
  }
});

test('tarea 13: preguntar con herramientas y sin --verbose (ayuda de muestra): json, sin páginas', async () => {
  process.env.FALSO_MODO = 'ok';
  const r = await preguntar(falso, { ...PREGUNTA, herramientas: { mcpConfig: join(datos, 'h.json'), nombres: HERRAMIENTAS } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.texto, 'respuesta falsa');
  assert.equal(r.paginas, undefined, 'sin stream no se sabe qué páginas leyó: todo punto de internet se quitará');
  const a = lo_apuntado();
  assert.equal(a.argv[a.argv.indexOf('--output-format') + 1], 'json');
  assert.equal(a.argv[a.argv.indexOf('--mcp-config') + 1], join(datos, 'h.json'));
  assert.equal(a.argv[a.argv.indexOf('--max-turns') + 1], '40');
  assert.equal(a.argv[a.argv.indexOf('--effort') + 1], 'medium');
  assert.equal(a.env.ENABLE_TOOL_SEARCH, 'false');
});

test('tarea 13 (R16, R14): sin herramientas el entorno no lleva ENABLE_TOOL_SEARCH y el esfuerzo sigue en low', async () => {
  for (const ayuda of [undefined, AYUDA_REAL]) {
    if (ayuda) process.env.FALSO_AYUDA = ayuda;
    else delete process.env.FALSO_AYUDA;
    olvidarOpciones();
    assert.equal((await preguntar(falso, PREGUNTA)).ok, true);
    const a = lo_apuntado();
    assert.ok(!('ENABLE_TOOL_SEARCH' in a.env), String(ayuda));
    assert.equal(a.argv[a.argv.indexOf('--effort') + 1], 'low', String(ayuda));
  }
  assert.equal(argumentos(TODAS, PARAMS)[argumentos(TODAS, PARAMS).indexOf('--effort') + 1], 'low');
  const h = argumentos(TODAS, CON_HERRAMIENTAS);
  assert.equal(h[h.indexOf('--effort') + 1], 'medium');
});

test('tarea 13 (ronda 1): asegurarMcpHerramientas escribe con temporal y renombre; si no puede, lanza y el temporal va a la cuarentena', () => {
  mkdirSync(datos, { recursive: true });
  const llamadas = [];
  const espia = { ...fsReal, writeFileSync: (r, ...x) => { llamadas.push(['escribir', r]); return fsReal.writeFileSync(r, ...x); },
    renameSync: (a, b) => { llamadas.push(['renombrar', a, b]); return fsReal.renameSync(a, b); } };
  const ruta = asegurarMcpHerramientas(datos, { node: 'N', servidor: 'S', fs: espia });
  assert.equal(llamadas.length, 2, JSON.stringify(llamadas));
  const [[, temporal], [, origen, destino]] = llamadas;
  assert.notEqual(temporal, ruta);
  assert.equal(dirname(temporal), dirname(ruta), 'el temporal, en la misma carpeta');
  assert.deepEqual([origen, destino], [temporal, ruta]);
  assert.equal(JSON.parse(readFileSync(ruta, 'utf8')).mcpServers.snetforever.command, 'N');
  assert.deepEqual(readdirSync(dirname(ruta)), ['mcp.json'], 'no queda ningún temporal');
  // Si el renombre falla, lanza (la tarea 14 cae a «sin herramientas») y el temporal no se queda en la carpeta.
  const roto = { ...fsReal, renameSync: (a, b) => {
    if (b.endsWith('mcp.json') && !b.includes('cuarentena')) throw Object.assign(new Error('ocupado'), { code: 'EBUSY' });
    return fsReal.renameSync(a, b);
  } };
  assert.throws(() => asegurarMcpHerramientas(datos, { node: 'OTRO', servidor: 'S', fs: roto }), /ocupado/);
  assert.deepEqual(readdirSync(dirname(ruta)), [], 'ni el viejo (en la cuarentena) ni el temporal');
  const apartados = readdirSync(join(datos, 'cuarentena')).flatMap((d) => readdirSync(join(datos, 'cuarentena', d)));
  assert.ok(apartados.includes('mcp.json'), apartados.join(','));
  assert.ok(apartados.some((f) => /^mcp\.json\.tmp-/.test(f)), apartados.join(','));
});

test('tarea 13: sin --strict-mcp-config la pregunta va como hoy y da sinHerramientas', async () => {
  const ayuda = join(CARPETA, `ayuda-sin-strict${n}.txt`);
  writeFileSync(ayuda, readFileSync(join(FALSO, 'ayuda.txt'), 'utf8').replace(/^.*--strict-mcp-config.*$/m, ''));
  process.env.FALSO_AYUDA = ayuda;
  process.env.FALSO_MODO = 'ok';
  const r = await preguntar(falso, { ...PREGUNTA, herramientas: { mcpConfig: join(datos, 'h.json'), nombres: HERRAMIENTAS } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.sinHerramientas, true);
  assert.equal(r.texto, 'respuesta falsa');
  const a = lo_apuntado();
  assert.ok(!a.argv.includes('--mcp-config') && !a.argv.includes('--strict-mcp-config'));
  assert.ok(!a.argv.join(' ').includes('mcp__'));
  assert.equal(a.argv[a.argv.indexOf('--max-turns') + 1], '10');
  assert.equal(a.argv[a.argv.indexOf('--effort') + 1], 'low');
  assert.ok(!('ENABLE_TOOL_SEARCH' in a.env), 'la pregunta va como hoy: sin tocar el entorno');
  // Sin herramientas pedidas no hay sinHerramientas.
  assert.ok(!('sinHerramientas' in (await preguntar(falso, PREGUNTA))));
});

test('tarea 13: con herramientas, más de 1 MB de stream vale; más de 16 MB da «respuesta demasiado grande»', async () => {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  process.env.FALSO_MODO = 'stream';
  const h = { mcpConfig: join(datos, 'h.json'), nombres: HERRAMIENTAS };
  const archivo = join(CARPETA, `grande${n}.jsonl`);
  process.env.FALSO_STREAM_ARCHIVO = archivo;
  writeFileSync(archivo, lineas([
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'WebFetch', input: { url: 'https://g.test/' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'y'.repeat(1_500_000) }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'bien' },
  ]) + '\n');
  const r = await preguntar(falso, { ...PREGUNTA, herramientas: h });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  assert.equal(r.texto, 'bien');
  assert.equal(r.paginas[0].texto.length, MAX_TEXTO_PAGINA);
  writeFileSync(archivo, 'z'.repeat(MAX_SALIDA_HERRAMIENTAS + 1024));
  assert.deepEqual(await preguntar(falso, { ...PREGUNTA, herramientas: h }), { ok: false, tipo: 'fallo', detalle: 'respuesta demasiado grande' });
});

test('tarea 13: con herramientas, un result con is_error, un stream sin result o unas herramientas mal dadas dan fallo', async () => {
  process.env.FALSO_AYUDA = AYUDA_REAL;
  process.env.FALSO_MODO = 'stream';
  const h = { mcpConfig: join(datos, 'h.json'), nombres: HERRAMIENTAS };
  process.env.FALSO_STREAM = JSON.stringify([{ type: 'result', subtype: 'error', is_error: true, result: 'Claude AI usage limit reached' }]);
  assert.equal((await preguntar(falso, { ...PREGUNTA, herramientas: h })).tipo, 'limite');
  process.env.FALSO_STREAM = JSON.stringify([STREAM[0]]);
  assert.deepEqual(await preguntar(falso, { ...PREGUNTA, herramientas: h }), { ok: false, tipo: 'fallo', detalle: 'respuesta ilegible' });
  assert.deepEqual(await preguntar(falso, { ...PREGUNTA, herramientas: { mcpConfig: '' } }), { ok: false, tipo: 'fallo', detalle: 'herramientas no válidas' });
});
