// Tarea 15b: motor Codex (cuenta de ChatGPT), sin claves ni herramientas. SIEMPRE con el codex falso de
// test/falso-codex: nunca se ejecuta el de verdad.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, realpathSync, existsSync, mkdirSync, utimesSync, symlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  resolverCodex, detectarOpciones, argumentos, entorno, comprobar, preguntar, olvidarOpciones, clasificarLogin, nombreModelo, herramientasDe,
  MODELOS, TIEMPO_RAPIDO, TIEMPO_LISTO, MAX_CUARENTENA, LINEA_MAX,
} from '../src/codex.mjs';
import { carpetaTrabajo, MARCA_TRABAJO } from '../src/rutas.mjs';
import { textoError } from '../src/textos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO = join(AQUI, 'falso-codex');
const FALSO_JS = join(FALSO, 'codex.mjs');
const FALSO_CMD = join(FALSO, 'codex.cmd');
const WIN = process.platform === 'win32';

const falso = { ruta: FALSO_JS, tipo: 'node' };
const falsoCmd = { ruta: FALSO_CMD, tipo: 'cmd' };
const COPIA = { ...process.env };
const CARPETA = mkdtempSync(join(tmpdir(), 'snf-codex-'));
let n = 0;
let datos;
let registro;

beforeEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in COPIA)) delete process.env[k];
  Object.assign(process.env, COPIA);
  n += 1;
  datos = join(CARPETA, `d${n}`);
  registro = join(CARPETA, `reg${n}.json`);
  process.env.SNF_DATOS = datos;
  process.env.FALSO_REGISTRO = registro;
  for (const k of ['FALSO_MODO', 'FALSO_AYUDA_EXEC', 'FALSO_AYUDA_LOGIN', 'FALSO_LOGIN_JSON', 'FALSO_LOGIN_STDOUT', 'FALSO_FEATURES', 'FALSO_RUIDO', 'FALSO_LINEA_EXTRA', 'FALSO_REGISTRO_LOGIN', 'FALSO_RESPUESTA', 'FALSO_LINEA_ERROR']) {
    delete process.env[k];
  }
  olvidarOpciones();
});
after(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, COPIA);
});

const lo_apuntado = () => JSON.parse(readFileSync(registro, 'utf8'));
const mismaRuta = (a, b) => realpathSync.native(a).toLowerCase() === realpathSync.native(b).toLowerCase();
const PREGUNTA = { modelo: 'rapido', sistema: 'SISTEMA DE PRUEBA', entrada: 'ENTRADA ñandú «prueba»', config: {} };

function vive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---------- resolverCodex ----------

test('resolverCodex: SNF_CODEX, primer .exe de where.exe, luego el .cmd, o null', () => {
  assert.deepEqual(resolverCodex({ env: { SNF_CODEX: 'C:\\x\\codex.cmd' } }), { ruta: 'C:\\x\\codex.cmd', tipo: 'cmd' });
  assert.deepEqual(resolverCodex({ env: {}, donde: () => ['C:\\n\\codex', 'C:\\n\\codex.cmd', 'C:\\n\\codex.ps1'] }), { ruta: 'C:\\n\\codex.cmd', tipo: 'cmd' });
  assert.deepEqual(resolverCodex({ env: {}, donde: () => ['C:\\n\\codex.cmd', 'C:\\m\\codex.exe'] }), { ruta: 'C:\\m\\codex.exe', tipo: 'exe' });
  assert.equal(resolverCodex({ env: {}, donde: () => [] }), null);
});

// ---------- argumentos ----------

const S = 'C:\\datos\\salida.txt';
// Funciones de herramienta de la copia real de `codex features list` (0.164.0) que se desactivan, estén a true o a false
// (Ruling F4-24: `features list` no lleva --ignore-user-config y puede reflejar el [features] del usuario), en su orden.
const HERRAMIENTAS_REALES = ['agent_message_board', 'app_server_websocket_compression', 'apply_patch_freeform', 'apply_patch_preserve_line_endings',
  'apply_patch_streaming_events', 'apps', 'apps_mcp_path_override', 'artifact', 'browser_annotation_api', 'browser_use', 'browser_use_external',
  'browser_use_full_cdp_access', 'code_mode', 'code_mode_buffered_exec', 'code_mode_host_grpc', 'code_mode_interrupt', 'code_mode_only',
  'code_mode_only_strict_3p_tools', 'code_mode_prewarm', 'code_mode_tool_description_first', 'code_mode_tool_search', 'codex_apps_mcp_2026_07_28',
  'compaction_image_budget', 'computer_use', 'daemon_auto_start', 'deferred_executor', 'deferred_tool_world_state', 'enable_mcp_apps',
  'exec_permission_approvals', 'executed_tool_call_metadata', 'executor_capability_discovery', 'executor_capability_discovery_v2',
  'external_agent_memory_import', 'goals', 'guardian_approval', 'guardian_conversation_history_tools', 'guardian_enhanced_node_repl_transcripts',
  'guardian_ext', 'guardian_node_repl_transcript_images', 'guardian_reuse_parent_compaction', 'guardian_root_handoff_context',
  'guardian_trust_orchestrator_connectors', 'guardianv2', 'guardianv2.thread_context', 'guardianv2_decisions_comparison', 'hooks', 'image_detail_original',
  'image_generation', 'image_resize_notice', 'in_app_browser', 'in_app_chat', 'in_app_dictation', 'in_app_local_automation', 'in_app_updates',
  'in_app_voice', 'js_repl', 'js_repl_tools_only', 'login_shell_package_path', 'mcp_2026_07_28', 'mcp_oauth_refresh_coordination', 'mcp_tool_list_changed',
  'memories', 'mentions_v2', 'multi_agent', 'multi_agent_mode', 'multi_agent_v2', 'multi_agent_v2_dynamic_tools', 'multi_env_copy_file', 'network_proxy',
  'non_prefixed_mcp_tool_names', 'output_token_replay', 'plugin_hooks', 'plugin_sharing', 'plugins', 'powershell_shell_version', 'prevent_idle_sleep',
  'realtime_conversation', 'recommended_plugins', 'remote_compaction_v2', 'remote_control', 'remote_models', 'remote_plugin', 'request_permissions_tool',
  'resize_all_images', 'responses_websockets', 'responses_websockets_v2', 'retain_client_tool_outputs', 'runtime_agent_instances', 'search_tool',
  'shell_snapshot', 'shell_snapshot_v2', 'shell_tool', 'shell_zsh_fork', 'skill_env_var_dependency_prompt', 'skill_mcp_dependency_install', 'skill_search',
  'skip_host_skill_discovery', 'sleep_tool', 'stable_environment_tools', 'standalone_web_search', 'steer', 'subagent_default_context_limits',
  'subagent_thread_environments', 'tool_call_mcp_elicitation', 'tool_search', 'tool_search_always_defer_mcp_tools', 'tool_suggest',
  'unavailable_dummy_tools', 'undo', 'unified_exec', 'unified_exec_tty', 'unified_exec_zsh_fork', 'unified_image_budget', 'use_agent_identity',
  'view_image', 'wake_on_agent_messages', 'workspace_dependencies', 'workspace_owner_usage_nudge',
  'worktrees', 'write_stdin_approval'];
const DESACTIVAR = HERRAMIENTAS_REALES.flatMap((h) => ['--disable', h]);
const ESPERADO_RAPIDO = ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules',
  '--color', 'never', '-c', 'mcp_servers={}', '-c', 'web_search=live', '-c', 'approval_policy=never', ...DESACTIVAR, '-o', S,
  '-c', 'model_reasoning_effort=low', '-'];
const HASTA_O = ESPERADO_RAPIDO.indexOf(S) + 1;

test('herramientasDe con la copia REAL de «codex features list»: las 120 de herramienta, a true o a false, sin las de formato ni las de la búsqueda web ni code_mode_host (12-nov)', () => {
  const texto = readFileSync(join(FALSO, 'features-real.txt'), 'utf8');
  const h = herramientasDe(texto);
  assert.equal(h.length, 120);
  assert.deepEqual(h, HERRAMIENTAS_REALES);
  for (const deja of ['content_item_kinds', 'item_ids', 'enable_request_compression', 'incremental_tools', 'secret_auth_storage', 'auth_elicitation', 'fast_mode', 'web_search_request', 'web_search_cached', 'code_mode_host']) {
    assert.ok(!h.includes(deja), deja);
  }
  // también las que la tabla da a false (el [features] del usuario no cuenta en exec, que lleva --ignore-user-config)
  for (const x of ['code_mode', 'multi_agent_v2', 'js_repl', 'undo', 'network_proxy', 'shell_tool', 'steer']) assert.ok(h.includes(x), x);
  assert.deepEqual(herramientasDe('shell_tool   stable   false\nweb_search_request   deprecated   true\nfast_mode  stable  true\nincremental_tools  stable  false\n'),
    ['shell_tool']);
});

test('herramientasDe: una tabla que no se puede leer da null', () => {
  for (const malo of ['', 'esto no es la tabla de funciones', 'shell_tool stable true\nlínea rara', 'shell&tool  stable  true', 'shell_tool  stable  quizás']) {
    assert.equal(herramientasDe(malo), null, JSON.stringify(malo));
  }
  assert.deepEqual(herramientasDe('fast_mode  stable  true\n\n'), []);
});

test('detectarOpciones con la ayuda REAL de codex exec 0.164.0 y argumentos: el array exacto', async () => {
  const o = await detectarOpciones(falso);
  for (const x of ['--sandbox', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--color', '--config',
    '--output-last-message', '--model', '--disable', 'login']) {
    assert.ok(o.has(x), x);
  }
  const p = { salidaArchivo: S, herramientas: HERRAMIENTAS_REALES };
  assert.deepEqual(argumentos(o, { ...p, modelo: 'rapido', config: {} }), ESPERADO_RAPIDO);
  const listo = argumentos(o, { ...p, modelo: 'listo', config: { codex: { listo: 'gpt-5.5-codex' } } });
  assert.deepEqual(listo, [...ESPERADO_RAPIDO.slice(0, HASTA_O), '-m', 'gpt-5.5-codex', '-c', 'model_reasoning_effort=medium', '-']);
  // nunca las opciones peligrosas, aunque la ayuda las liste
  for (const a of [listo, ESPERADO_RAPIDO]) {
    assert.ok(!a.some((x) => /dangerously|approve-for-me|full-access|workspace-write|--oss|--add-dir|--image/.test(x)));
  }
});

test('argumentos: todos pasan el filtro de cmd.exe (sin comillas ni metacaracteres)', async () => {
  const o = await detectarOpciones(falso);
  const { argumentoValidoCmd } = await import('../src/proceso.mjs');
  for (const modelo of MODELOS) {
    for (const a of argumentos(o, { modelo, salidaArchivo: S, herramientas: HERRAMIENTAS_REALES, config: { codex: { rapido: 'gpt-a', listo: 'gpt-b' } } })) {
      assert.ok(argumentoValidoCmd(a), a);
    }
  }
});

test('la línea de cmd.exe con las 120 --disable queda lejos del límite de 8191 caracteres', async () => {
  const o = await detectarOpciones(falso);
  // ruta y salida largas, como las de un PC real
  const ruta = 'C:\\Users\\un-nombre-de-usuario-largo\\AppData\\Roaming\\npm\\codex.cmd';
  const salida = 'C:\\Users\\un-nombre-de-usuario-largo\\AppData\\Local\\SnetForever\\salidas\\codex-0123456789ab.txt';
  const a = argumentos(o, { modelo: 'listo', salidaArchivo: salida, herramientas: HERRAMIENTAS_REALES, config: { codex: { listo: 'x'.repeat(64) } } });
  // lo que lanza proceso.mjs: cmd.exe /d /s /c ""<ruta>" "<arg>" …"
  const linea = `${join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')} /d /s /c "${[ruta, ...a].map((x) => `"${x}"`).join(' ')}"`;
  assert.ok(linea.length < 6000, `la línea mide ${linea.length}`);
  assert.equal(LINEA_MAX < 8191, true);
});

test('argumentos: cada opción que falta se quita; sin --sandbox, -o, --config, --ignore-user-config o --ignore-rules, «Codex demasiado antiguo»', () => {
  const todas = new Set(['--sandbox', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--color', '--config',
    '--output-last-message', '--model', '--disable']);
  const sin = (...q) => new Set([...todas].filter((x) => !q.includes(x)));
  const p = { modelo: 'rapido', salidaArchivo: S, config: {}, herramientas: [] };
  assert.deepEqual(argumentos(sin('--ephemeral', '--color', '--skip-git-repo-check'), p),
    ['exec', '--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules', '-c', 'mcp_servers={}', '-c', 'web_search=live',
      '-c', 'approval_policy=never', '-o', S, '-c', 'model_reasoning_effort=low', '-']);
  assert.deepEqual(argumentos(sin('--model'), { ...p, config: { codex: { rapido: 'gpt-a' } }, herramientas: ['shell_tool'] }),
    ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--color', 'never',
      '-c', 'mcp_servers={}', '-c', 'web_search=live', '-c', 'approval_policy=never', '--disable', 'shell_tool', '-o', S,
      '-c', 'model_reasoning_effort=low', '-']);
  for (const falta of ['--sandbox', '--output-last-message', '--config', '--ignore-user-config', '--ignore-rules']) {
    assert.throws(() => argumentos(sin(falta), p), /Codex demasiado antiguo/, falta);
  }
  // sin --disable solo vale si no hay nada que desactivar
  assert.deepEqual(argumentos(sin('--disable'), p).filter((x) => x === '--disable'), []);
  assert.throws(() => argumentos(sin('--disable'), { ...p, herramientas: ['shell_tool'] }), /Codex demasiado antiguo/);
  // sin la lista de herramientas (features list no leído) no hay argumentos
  for (const herramientas of [undefined, null, 'shell_tool', [1], ['a&b']]) {
    assert.throws(() => argumentos(todas, { ...p, herramientas }), /no se pudo comprobar qué herramientas tiene Codex/, JSON.stringify(herramientas));
  }
  assert.throws(() => argumentos(todas, { ...p, modelo: 'haiku' }), /modelo no válido/);
});

test('preguntar: ayuda sin --config, sin --ignore-user-config o sin --ignore-rules -> «Codex demasiado antiguo», sin lanzar', async () => {
  for (const quitar of ['--config', '--ignore-user-config', '--ignore-rules']) {
    const ayuda = join(CARPETA, `ayuda-exec${n}${quitar}.txt`);
    const real = readFileSync(join(FALSO, 'ayuda-exec-real.txt'), 'utf8');
    writeFileSync(ayuda, real.split('\n').filter((l) => !l.includes(quitar)).join('\n'));
    process.env.FALSO_AYUDA_EXEC = ayuda;
    olvidarOpciones();
    assert.deepEqual(await preguntar(falso, PREGUNTA), { ok: false, tipo: 'fallo', detalle: 'Codex demasiado antiguo' }, quitar);
  }
  assert.ok(!existsSync(registro), 'no se lanzó codex exec');
});

test('nombreModelo: config.codex.rapido/listo; vacío -> sin -m; con caracteres raros o empezando por «-» -> no válido', () => {
  assert.deepEqual(nombreModelo({}, 'rapido'), { valido: true, nombre: null });
  assert.deepEqual(nombreModelo({ codex: { rapido: '' } }, 'rapido'), { valido: true, nombre: null });
  assert.deepEqual(nombreModelo({ codex: { rapido: 'gpt-5.4-mini' } }, 'rapido'), { valido: true, nombre: 'gpt-5.4-mini' });
  assert.deepEqual(nombreModelo({ codex: { rapido: 'a', listo: 'o3_x.1' } }, 'listo'), { valido: true, nombre: 'o3_x.1' });
  assert.deepEqual(nombreModelo({ codex: { rapido: 'x'.repeat(64) } }, 'rapido').valido, true);
  for (const malo of ['gpt" & echo x', 'a b', '%PATH%', 'a^b', 'a!b', 'a\nb', 'x'.repeat(65), 12, {}, '--dangerously-bypass-approvals-and-sandbox',
    '-m', '-', '.oculto', '_x']) {
    assert.equal(nombreModelo({ codex: { rapido: malo } }, 'rapido').valido, false, JSON.stringify(malo));
  }
  // y argumentos lo ignora (nunca lo pasa)
  const o = new Set(['--sandbox', '--output-last-message', '--model', '--config', '--ignore-user-config', '--ignore-rules']);
  for (const malo of ['a"&b', '--dangerously-bypass-approvals-and-sandbox']) {
    const a = argumentos(o, { modelo: 'rapido', salidaArchivo: S, herramientas: [], config: { codex: { rapido: malo } } });
    assert.ok(!a.includes('-m') && !a.includes(malo), malo);
  }
});

test('preguntar con config.codex.rapido = --dangerously-bypass-approvals-and-sandbox: fallo, sin lanzar nada', async () => {
  const r = await preguntar(falso, { ...PREGUNTA, config: { codex: { rapido: '--dangerously-bypass-approvals-and-sandbox' } } });
  assert.deepEqual(r, { ok: false, tipo: 'fallo', detalle: 'nombre de modelo no válido en config.codex' });
  assert.ok(!existsSync(registro));
});

// ---------- entorno ----------

test('entorno: sin las 11 variables (OpenAI, Codex y Anthropic), sin mirar mayúsculas, y CODEX_HOME intacto', () => {
  const once = {
    OPENAI_API_KEY: 'sk-a', CODEX_API_KEY: 'b', OPENAI_BASE_URL: 'c', OPENAI_ORG_ID: 'd', OPENAI_PROJECT: 'e',
    ANTHROPIC_API_KEY: 'f', ANTHROPIC_AUTH_TOKEN: 'g', ANTHROPIC_BASE_URL: 'h', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1', CLAUDE_CODE_USE_FOUNDRY: '1',
  };
  const otras = {
    Openai_Organization: 'x', openai_api_base: 'y', AZURE_OPENAI_API_KEY: 'z', azure_openai_endpoint: 'w', Codex_Api_Key_Extra: 'v', CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR: '3',
  };
  const origen = { ...once, ...otras, PATH: 'p', CODEX_HOME: 'C:\\h', SystemRoot: 'C:\\Windows' };
  assert.deepEqual(entorno(origen), { PATH: 'p', CODEX_HOME: 'C:\\h', SystemRoot: 'C:\\Windows' });
  assert.equal(origen.OPENAI_API_KEY, 'sk-a', 'no se toca el entorno de entrada');
});

test('entorno: todo CODEX_* salvo CODEX_HOME, OPENAI_*, AZURE_OPENAI_* y AWS_BEARER_TOKEN_* fuera (Ruling F4-24)', () => {
  const r = entorno({
    CODEX_ACCESS_TOKEN: 'a', OPENAI_IDENTITY_TOKEN_FILE: 'b', AWS_BEARER_TOKEN_BEDROCK: 'c', CODEX_EXEC_SERVER_URL: 'd', CODEX_CHATGPT_BASE_URL: 'e',
    CODEX_RESPONSES_BASE_URL: 'f', CODEX_APP_SERVER_URL: 'g', Codex_App_Server_Token: 'h', codex_sandbox: 'i', aws_bearer_token_otro: 'j',
    CODEX_HOME: 'C:\\h', CODEX_HOME_EXTRA: 'k', AWS_REGION: 'us', PATH: 'p',
  });
  assert.deepEqual(r, { CODEX_HOME: 'C:\\h', AWS_REGION: 'us', PATH: 'p' });
  assert.deepEqual(entorno({ codex_home: 'C:\\h2' }), { codex_home: 'C:\\h2' }, 'CODEX_HOME sin mirar mayúsculas, como Windows');
});

// ---------- preguntar ----------

test('preguntar con la ayuda real: array exacto, entorno limpio, cwd de trabajo, stdin con sistema + entrada', async () => {
  process.env.OPENAI_API_KEY = 'sk-falsa';
  process.env.CODEX_API_KEY = 'falsa';
  process.env.ANTHROPIC_API_KEY = 'sk-falsa';
  process.env.CODEX_HOME = join(CARPETA, 'casa-codex');
  const r = await preguntar(falso, PREGUNTA);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.texto, 'respuesta falsa de codex');
  assert.equal(typeof r.ms, 'number');
  const a = lo_apuntado();
  const salida = a.argv[a.argv.indexOf('-o') + 1];
  assert.deepEqual(a.argv, ESPERADO_RAPIDO.map((x) => (x === S ? salida : x)));
  assert.match(basename(salida), /^codex-[0-9a-f]+\.txt$/);
  assert.ok(mismaRuta(dirname(salida), join(datos, 'salidas')), 'el -o va fuera de la carpeta de trabajo');
  assert.equal(a.salidaPrevia, false, 'el archivo -o no existía antes de lanzar');
  assert.ok(mismaRuta(a.cwd, carpetaTrabajo()));
  assert.deepEqual(a.lista, [MARCA_TRABAJO], 'se lanza en una carpeta vacía');
  assert.equal(a.stdin, 'SISTEMA DE PRUEBA\n\nENTRADA ñandú «prueba»');
  assert.ok(!a.argv.join(' ').includes('SISTEMA') && !a.argv.join(' ').includes('ENTRADA'), 'nada largo en la línea de órdenes');
  for (const k of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY']) assert.ok(!(k in a.env), k);
  assert.equal(a.env.CODEX_HOME, join(CARPETA, 'casa-codex'));
  // el -o se leyó y se llevó a la cuarentena (renombrado, no borrado)
  assert.ok(!existsSync(salida));
  const guardado = join(datos, 'cuarentena', 'codex', basename(salida));
  assert.equal(readFileSync(guardado, 'utf8'), 'respuesta falsa de codex');
});

test('preguntar con modelo listo y config.codex.listo: -m y esfuerzo medium', async () => {
  const r = await preguntar(falso, { ...PREGUNTA, modelo: 'listo', config: { codex: { listo: 'gpt-listo' } } });
  assert.equal(r.ok, true);
  const a = lo_apuntado().argv;
  assert.deepEqual(a.slice(-5), ['-m', 'gpt-listo', '-c', 'model_reasoning_effort=medium', '-']);
});

test('preguntar lee config.json de la carpeta de datos si no se pasa config', async () => {
  mkdirSync(datos, { recursive: true });
  writeFileSync(join(datos, 'config.json'), JSON.stringify({ codex: { rapido: 'gpt-de-config' } }));
  const { config, ...sinConfig } = PREGUNTA;
  assert.equal((await preguntar(falso, sinConfig)).ok, true);
  assert.equal(lo_apuntado().argv[lo_apuntado().argv.indexOf('-m') + 1], 'gpt-de-config');
});

test('preguntar: ayuda sin --sandbox -> «Codex demasiado antiguo» y no se lanza nada', async () => {
  process.env.FALSO_MODO = 'sin_sandbox';
  const r = await preguntar(falso, PREGUNTA);
  assert.deepEqual(r, { ok: false, tipo: 'fallo', detalle: 'Codex demasiado antiguo' });
  assert.ok(!existsSync(registro), 'no se lanzó codex exec');
});

test('preguntar: si «features list» falla o no se puede leer, no se lanza', async () => {
  for (const f of ['falla', 'basura']) {
    process.env.FALSO_FEATURES = f;
    olvidarOpciones();
    const r = await preguntar(falso, PREGUNTA);
    assert.deepEqual(r, { ok: false, tipo: 'fallo', detalle: 'no se pudo comprobar qué herramientas tiene Codex' }, f);
  }
  assert.ok(!existsSync(registro), 'no se lanzó codex exec');
  // comprobar la cuenta sí funciona igual
  process.env.FALSO_MODO = 'login_chatgpt';
  assert.equal((await comprobar(falso)).estado, 'ok');
});

test('preguntar desactiva exactamente las funciones de herramienta de «features list», a true o a false', async () => {
  const tabla = join(CARPETA, `features${n}.txt`);
  writeFileSync(tabla, 'shell_tool   stable   true\nweb_search_request   deprecated   true\nincremental_tools   stable   true\n' +
    'content_item_kinds   stable   true\nview_image   stable   false\nfast_mode   stable   true\n');
  process.env.FALSO_FEATURES = tabla;
  assert.equal((await preguntar(falso, PREGUNTA)).ok, true);
  const a = lo_apuntado().argv;
  const desactivadas = a.flatMap((x, i) => (x === '--disable' ? [a[i + 1]] : []));
  assert.deepEqual(desactivadas, ['shell_tool', 'view_image']);
});

test('datos/salidas y cuarentena/codex no crecen sin límite: se rota renombrando, nunca se borra', async () => {
  // restos viejos de salidas (de una llamada que no terminó) se llevan a la cuarentena; los recientes se dejan
  const salidas = join(datos, 'salidas');
  mkdirSync(salidas, { recursive: true });
  writeFileSync(join(salidas, 'codex-viejo.txt'), 'viejo');
  const hace = (Date.now() - 60 * 60_000) / 1000;
  utimesSync(join(salidas, 'codex-viejo.txt'), hace, hace);
  writeFileSync(join(salidas, 'codex-reciente.txt'), 'en curso');
  // la cuarentena llena se renombra entera
  const cuarentena = join(datos, 'cuarentena', 'codex');
  mkdirSync(cuarentena, { recursive: true });
  for (let i = 0; i < MAX_CUARENTENA; i++) writeFileSync(join(cuarentena, `codex-${i}.txt`), String(i));
  assert.equal((await preguntar(falso, PREGUNTA)).ok, true);
  assert.deepEqual(readdirSync(salidas), ['codex-reciente.txt']);
  const carpetas = readdirSync(join(datos, 'cuarentena'));
  const rotada = carpetas.find((c) => /^codex-.+/.test(c));
  assert.ok(rotada, carpetas.join(','));
  assert.equal(readdirSync(join(datos, 'cuarentena', rotada)).length, MAX_CUARENTENA, 'no se borró nada');
  const nuevos = readdirSync(cuarentena);
  assert.equal(nuevos.length, 2, nuevos.join(',')); // la respuesta de ahora y el resto viejo
  assert.ok(nuevos.includes('codex-viejo.txt'));
  assert.equal(readFileSync(join(cuarentena, 'codex-viejo.txt'), 'utf8'), 'viejo');
});

test('preguntar: clasificación de errores sin_sesion, limite, fallo (basura, salida distinta de 0)', async () => {
  for (const [modo, tipo] of [['sin_sesion', 'sin_sesion'], ['limite', 'limite'], ['basura', 'fallo'], ['fallo', 'fallo']]) {
    process.env.FALSO_MODO = modo;
    const r = await preguntar(falso, PREGUNTA);
    assert.equal(r.ok, false, modo);
    assert.equal(r.tipo, tipo, modo);
    assert.equal(typeof r.detalle, 'string', modo);
    assert.ok(!r.detalle.includes('SISTEMA') && !r.detalle.includes('ENTRADA'), `${modo}: el detalle no lleva la pregunta`);
  }
});

test('preguntar: pasado el tiempo da «tiempo» y el proceso ya no vive', async () => {
  await detectarOpciones(falso); // la detección cuenta dentro del tiempo: se deja ya en memoria
  process.env.FALSO_MODO = 'lento';
  const t0 = Date.now();
  const r = await preguntar(falso, { ...PREGUNTA, tiempoMax: 500 });
  assert.deepEqual(r, { ok: false, tipo: 'tiempo', detalle: 'tiempo agotado' });
  assert.ok(Date.now() - t0 < 20_000);
  const { pid } = lo_apuntado();
  for (let i = 0; i < 40 && vive(pid); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(vive(pid), false);
});

test('tiempos por defecto: 120 s el rápido y 180 s el listo; la detección cuenta dentro', async () => {
  assert.equal(TIEMPO_RAPIDO, 120_000);
  assert.equal(TIEMPO_LISTO, 180_000);
  process.env.FALSO_MODO = 'lento';
  assert.equal((await preguntar(falso, { ...PREGUNTA, tiempoMax: 1 })).tipo, 'tiempo');
});

test('salida de más de 1 MB (stdout o archivo -o): fallo «respuesta demasiado grande»', async () => {
  for (const modo of ['enorme', 'enorme_archivo']) {
    process.env.FALSO_MODO = modo;
    assert.deepEqual(await preguntar(falso, PREGUNTA), { ok: false, tipo: 'fallo', detalle: 'respuesta demasiado grande' }, modo);
  }
  // el archivo grande tampoco se borra: va a la cuarentena
  assert.ok(readdirSync(join(datos, 'cuarentena', 'codex')).length >= 1);
  assert.deepEqual(readdirSync(join(datos, 'salidas')), []);
});

test('dos preguntas a la vez no se pisan el archivo -o', async () => {
  process.env.FALSO_RESPUESTA = 'ECO';
  const [a, b] = await Promise.all([preguntar(falso, { ...PREGUNTA, entrada: 'UNO' }), preguntar(falso, { ...PREGUNTA, entrada: 'DOS' })]);
  assert.deepEqual([a.texto, b.texto], ['eco:UNO', 'eco:DOS']);
  assert.equal(readdirSync(join(datos, 'cuarentena', 'codex')).length, 2);
});

test('preguntar sin ejecutable: sin_instalar', async () => {
  assert.equal((await preguntar(null, PREGUNTA)).tipo, 'sin_instalar');
  assert.equal((await preguntar({ ruta: join(CARPETA, 'no-existe.exe'), tipo: 'exe' }, PREGUNTA)).tipo, 'sin_instalar');
});

test('inyección: modelo y config.codex.rapido con " & %PATH% ^ ! y saltos de línea -> fallo, sin lanzar nada', async () => {
  for (const modelo of ['opus', 'haiku', 'sonnet', '', undefined, 'rapido" & echo INYECTADO>pwned.txt & "', 'RAPIDO', 'rapido ']) {
    assert.deepEqual(await preguntar(falso, { ...PREGUNTA, modelo }), { ok: false, tipo: 'fallo', detalle: 'modelo no válido' }, String(modelo));
  }
  for (const malo of ['gpt" & echo INYECTADO>pwned.txt & "', '%PATH%', 'a^b', 'a!b', 'a\r\nb', 'gpt\n-c\nx=y']) {
    const r = await preguntar(falso, { ...PREGUNTA, config: { codex: { rapido: malo } } });
    assert.deepEqual(r, { ok: false, tipo: 'fallo', detalle: 'nombre de modelo no válido en config.codex' }, JSON.stringify(malo));
  }
  assert.ok(!existsSync(registro), 'no se lanzó nada');
});

// ---------- comprobar (codex login status) ----------

test('clasificarLogin: lista blanca en texto (stdout + stderr juntos, exactamente una línea)', () => {
  assert.equal(clasificarLogin(0, 'Logged in using ChatGPT\n'), 'ok');
  assert.equal(clasificarLogin(0, '\n  logged in using chatgpt  \n\n'), 'ok');
  assert.equal(clasificarLogin(0, 'Logged in using ChatGPT\nA new version of Codex is available'), 'desconocido', 'cualquier línea de más, aunque sea un aviso');
  assert.equal(clasificarLogin(0, 'WARNING: deprecated config\nLogged in using ChatGPT'), 'desconocido');
  assert.equal(clasificarLogin(0, 'Logged in using ChatGPT\nLogged in using ChatGPT'), 'desconocido');
  assert.equal(clasificarLogin(0, 'Logged in using ChatGPT\nOPENAI_API_KEY is set'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, 'Logged in using ChatGPT\nBase URL: http://localhost'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, 'Logged in using ChatGPT (via proxy)'), 'pago_por_uso', 'el positivo es estricto: la línea entera');
  assert.equal(clasificarLogin(1, 'Logged in using ChatGPT'), 'desconocido', 'con salida distinta de 0 no es ok');
  assert.equal(clasificarLogin(0, 'API key configured - sk-proj-***ABCD'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, 'Logged in using an API key - sk-***'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, 'Logged in using Amazon Bedrock API key'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, 'Logged in using Amazon Bedrock AWS access keys'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, 'Using Azure OpenAI'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, 'Organization key configured'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, 'api-key configured'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, 'Using an API-Key'), 'pago_por_uso');
  assert.equal(clasificarLogin(1, 'Not logged in'), 'sin_sesion');
  assert.equal(clasificarLogin(1, 'Not logged in. Set OPENAI_API_KEY'), 'sin_sesion', '«not logged in» manda');
  assert.equal(clasificarLogin(1, 'Error checking login status: x'), 'sin_sesion', 'salida distinta de 0 sin positivo');
  assert.equal(clasificarLogin(0, 'Logged in using workload identity'), 'desconocido');
  assert.equal(clasificarLogin(0, 'Logged in using access token'), 'desconocido');
  assert.equal(clasificarLogin(0, ''), 'desconocido');
});

test('clasificarLogin: lista blanca en JSON (el texto entero tiene que ser un solo objeto)', () => {
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":"chatgpt"}'), 'ok');
  assert.equal(clasificarLogin(0, '\n{"loggedIn":true,"authMode":"ChatGPT"}\n'), 'ok');
  assert.equal(clasificarLogin(0, 'aviso\n{"loggedIn":true,"authMode":"ChatGPT"}\notro aviso'), 'desconocido', 'con avisos alrededor no es ok');
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":"apikey"}'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":"api_key"}'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":"chatgpt","api_key":"sk-x"}'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":"chatgpt","base_url":"http://x"}'), 'pago_por_uso');
  assert.equal(clasificarLogin(1, '{"logged_in":false}'), 'sin_sesion');
  assert.equal(clasificarLogin(1, '{"logged_in":true,"auth_mode":"chatgpt"}'), 'desconocido');
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":"workload_identity"}'), 'desconocido');
  assert.equal(clasificarLogin(0, '{"logged_in":true}'), 'desconocido');
  // todas las claves de modo tienen que ser «chatgpt» y logged_in true o ausente
  assert.equal(clasificarLogin(0, '{"auth_mode":"chatgpt"}'), 'ok', 'sin logged_in');
  assert.equal(clasificarLogin(0, '{"auth_mode":"chatgpt","mode":"apikey"}'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, '{"auth_mode":"chatgpt","method":"otro"}'), 'desconocido');
  assert.equal(clasificarLogin(0, '{"auth_mode":"chatgpt","authMode":"ChatGPT"}'), 'ok');
  assert.equal(clasificarLogin(0, '{"logged_in":"yes","auth_mode":"chatgpt"}'), 'desconocido');
  assert.equal(clasificarLogin(0, '{"logged_in":true,"loggedIn":false,"auth_mode":"chatgpt"}'), 'sin_sesion');
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":"chatgpt","nota":"api-key"}'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":1}'), 'desconocido');
  // varios objetos: no es un JSON único; se mira como texto (menciona apikey -> pago_por_uso; si no, desconocido)
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":"chatgpt"}\n{"logged_in":true,"auth_mode":"apikey"}'), 'pago_por_uso');
  assert.equal(clasificarLogin(0, '{"logged_in":true,"auth_mode":"chatgpt"}\n{"logged_in":true,"auth_mode":"chatgpt"}'), 'desconocido');
});

test('comprobar: cada estado de login status escrito por stderr (el caso real) y por stdout', async () => {
  assert.deepEqual(await comprobar(null), { estado: 'sin_instalar' });
  assert.equal((await comprobar({ ruta: join(CARPETA, 'no-existe.exe'), tipo: 'exe' })).estado, 'sin_instalar');
  const casos = [['login_chatgpt', 'ok'], ['login_apikey', 'pago_por_uso'], ['login_no', 'sin_sesion'], ['login_raro', 'desconocido']];
  for (const porStdout of [false, true]) {
    if (porStdout) process.env.FALSO_LOGIN_STDOUT = '1';
    for (const [modo, estado] of casos) {
      process.env.FALSO_MODO = modo;
      const r = await comprobar(falso);
      assert.equal(r.estado, estado, `${modo} ${porStdout ? 'stdout' : 'stderr'}`);
      assert.equal(r.version, '0.164.0', modo);
      if (estado === 'desconocido') assert.equal(r.motivo, 'no se pudo comprobar la cuenta');
    }
  }
});

test('comprobar: con una línea de más (en stdout o en stderr) ya no es ok', async () => {
  const conExtra = [['login_chatgpt', 'desconocido'], ['login_apikey', 'pago_por_uso'], ['login_no', 'sin_sesion'], ['login_raro', 'desconocido']];
  for (const variable of ['FALSO_LINEA_EXTRA', 'FALSO_RUIDO']) {
    process.env[variable] = 'A new version of Codex is available';
    for (const [modo, estado] of conExtra) {
      process.env.FALSO_MODO = modo;
      assert.equal((await comprobar(falso)).estado, estado, `${modo} con ${variable}`);
    }
    delete process.env[variable];
  }
  process.env.FALSO_MODO = 'login_chatgpt';
  process.env.FALSO_RUIDO = 'Logged in using ChatGPT'; // repetido: dos líneas
  assert.equal((await comprobar(falso)).estado, 'desconocido');
  process.env.FALSO_RUIDO = 'Using OPENAI_API_KEY from the environment';
  assert.equal((await comprobar(falso)).estado, 'pago_por_uso');
});

test('comprobar: con la clave de API en el entorno, el hijo no la recibe', async () => {
  process.env.OPENAI_API_KEY = 'sk-falsa';
  process.env.FALSO_MODO = 'login_chatgpt';
  const login = join(CARPETA, `login${n}.json`);
  process.env.FALSO_REGISTRO_LOGIN = login;
  assert.equal((await comprobar(falso)).estado, 'ok');
  const apuntado = JSON.parse(readFileSync(login, 'utf8'));
  assert.deepEqual(apuntado.argv, ['login', 'status']);
  assert.ok(!('OPENAI_API_KEY' in apuntado.env));
  assert.ok(mismaRuta(apuntado.env.SNF_DATOS, datos), 'el resto del entorno sí llega');
});

test('comprobar pasa --json si la ayuda de «login status» lo trae, y aplica la lista blanca al JSON', async () => {
  const login = join(CARPETA, `login${n}.json`);
  process.env.FALSO_REGISTRO_LOGIN = login;
  process.env.FALSO_LOGIN_JSON = '1';
  for (const [modo, estado] of [['login_chatgpt', 'ok'], ['login_apikey', 'pago_por_uso'], ['login_no', 'sin_sesion'], ['login_raro', 'desconocido']]) {
    process.env.FALSO_MODO = modo;
    assert.equal((await comprobar(falso)).estado, estado, modo);
    assert.deepEqual(JSON.parse(readFileSync(login, 'utf8')).argv, ['login', 'status', '--json']);
  }
});

test('comprobar: sin el comando «login» en la ayuda -> desconocido', async () => {
  const ayuda = join(CARPETA, `login-viejo${n}.txt`);
  writeFileSync(ayuda, 'Manage login\n\nUsage: codex login [OPTIONS]\n\nOptions:\n  -h, --help\n');
  process.env.FALSO_AYUDA_LOGIN = ayuda;
  process.env.FALSO_MODO = 'login_chatgpt';
  const r = await comprobar(falso);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'no se pudo comprobar la cuenta');
});

// ---------- el .cmd de Windows ----------

test('codex.cmd (solo Windows): argv llega entero, entorno limpio y respuesta por -o', { skip: !WIN }, async () => {
  process.env.OPENAI_API_KEY = 'sk-falsa';
  const r = await preguntar(falsoCmd, PREGUNTA);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.texto, 'respuesta falsa de codex');
  const a = lo_apuntado();
  const salida = a.argv[a.argv.indexOf('-o') + 1];
  assert.deepEqual(a.argv, ESPERADO_RAPIDO.map((x) => (x === S ? salida : x)));
  assert.equal(a.stdin, 'SISTEMA DE PRUEBA\n\nENTRADA ñandú «prueba»');
  assert.ok(!('OPENAI_API_KEY' in a.env));
  process.env.FALSO_MODO = 'login_chatgpt';
  assert.equal((await comprobar(falsoCmd)).estado, 'ok');
});

test('codex.cmd (solo Windows): al pasar el tiempo se mata también al hijo de cmd.exe', { skip: !WIN }, async () => {
  process.env.FALSO_MODO = 'lento';
  const r = await preguntar(falsoCmd, { ...PREGUNTA, tiempoMax: 3000 });
  assert.equal(r.tipo, 'tiempo');
  const { pid } = lo_apuntado();
  for (let i = 0; i < 40 && vive(pid); i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(vive(pid), false);
});

test('codex.cmd (solo Windows): inyección por modelo, config y SNF_DATOS -> fallo, sin lanzar ni crear archivos', { skip: !WIN }, async () => {
  const cwd = process.cwd();
  const sitios = () => [cwd, FALSO, CARPETA];
  const r1 = await preguntar(falsoCmd, { ...PREGUNTA, modelo: 'rapido" & echo INYECTADO>pwned.txt & "' });
  assert.equal(r1.tipo, 'fallo');
  const r2 = await preguntar(falsoCmd, { ...PREGUNTA, config: { codex: { rapido: 'gpt" & echo INYECTADO>pwned.txt & "' } } });
  assert.equal(r2.tipo, 'fallo');
  for (const mal of ['a"b', 'a&b', 'a%PATH%b', 'a^b', 'a!b', 'a|b', 'a<b', 'a>b', 'a\rb', 'a\nb']) {
    process.env.SNF_DATOS = join(CARPETA, `mal${n}${mal}`);
    const r = await preguntar(falsoCmd, PREGUNTA);
    assert.equal(r.ok, false, JSON.stringify(mal));
    assert.equal(r.tipo, 'fallo', JSON.stringify(mal));
  }
  assert.ok(!existsSync(registro), 'no se lanzó nada');
  for (const d of sitios()) assert.ok(!existsSync(join(d, 'pwned.txt')), d);
});

// ---------- textos ----------

test('textos: variantes «ChatGPT/Codex» de los errores, en español e inglés, sin hablar de Claude', () => {
  for (const idioma of ['es', 'en']) {
    for (const t of ['sin_instalar', 'sin_sesion', 'pago_por_uso', 'limite', 'tiempo', 'fallo', 'ocupado', 'desconocido']) {
      const texto = textoError(t, 'x', idioma, 'codex');
      assert.ok(texto.length > 10, `${idioma} ${t}`);
      assert.ok(!/Claude/.test(texto), `${idioma} ${t}: ${texto}`);
    }
    for (const t of ['sin_instalar', 'sin_sesion', 'pago_por_uso', 'limite', 'desconocido']) {
      assert.match(textoError(t, 'x', idioma, 'codex'), /ChatGPT\/Codex/, `${idioma} ${t}`);
    }
  }
  assert.match(textoError('sin_sesion', '', 'es', 'codex'), /codex login/);
  assert.match(textoError('desconocido', 'no se pudo comprobar la cuenta', 'es', 'codex'), /no se pudo comprobar la cuenta/);
  // los de Claude siguen igual
  assert.match(textoError('sin_sesion', '', 'es'), /^Claude Code no tiene la sesión iniciada/);
  assert.equal(textoError('sin_sesion', '', 'es', 'claude'), textoError('sin_sesion', '', 'es'));
});

// ---------- el registro nunca apunta preguntas ni respuestas ----------

test('errores de exec: solo cuentan las líneas «ERROR:» y el código; el eco de la pregunta por stderr no (Ruling F4-24 ronda 2)', async () => {
  process.env.FALSO_MODO = 'eco_fallo';
  const casos = [
    // [entrada, línea ERROR: real o null, tipo, detalle]
    ['¿Cómo hago login en la web?', null, 'fallo', 'código 2'],
    ['me sale usage limit reached y rate limit 429', null, 'fallo', 'código 2'],
    ['Error: not logged in, unauthorized 401\nsegunda línea', 'ERROR: stream disconnected', 'fallo', 'ERROR: stream disconnected'],
    ['error: login 401', null, 'fallo', 'código 2'],
    ['pregunta normal', "ERROR: You've hit your usage limit", 'limite', "ERROR: You've hit your usage limit"],
    ['pregunta normal', 'ERROR: unexpected status 401 Unauthorized', 'sin_sesion', 'ERROR: unexpected status 401 Unauthorized'],
  ];
  for (const [entrada, error, tipo, detalle] of casos) {
    if (error) process.env.FALSO_LINEA_ERROR = error;
    else delete process.env.FALSO_LINEA_ERROR;
    const r = await preguntar(falso, { ...PREGUNTA, entrada });
    assert.deepEqual(r, { ok: false, tipo, detalle }, entrada);
    assert.ok(lo_apuntado().stdin.includes(entrada.split('\n')[0]));
  }
  delete process.env.FALSO_LINEA_ERROR;
  // una línea «ERROR:» en stdout también cuenta
  process.env.FALSO_MODO = 'error_stdout';
  assert.equal((await preguntar(falso, PREGUNTA)).tipo, 'limite');
});

test('cuarentena/codex como unión (solo Windows): el -o no se mueve fuera de los datos', { skip: !WIN }, async () => {
  const fuera = join(CARPETA, `fuera-cuarentena${n}`);
  mkdirSync(fuera);
  mkdirSync(join(datos, 'cuarentena'), { recursive: true });
  symlinkSync(fuera, join(datos, 'cuarentena', 'codex'), 'junction');
  const r = await preguntar(falso, PREGUNTA);
  assert.equal(r.ok, true);
  assert.deepEqual(readdirSync(fuera), [], 'nada sale de la carpeta de datos');
  assert.equal(readdirSync(join(datos, 'salidas')).length, 1, 'el -o se queda en salidas');
});

test('el registro no contiene nunca la pregunta, el sistema, la respuesta ni los mensajes de error de la IA', async () => {
  const unico = { modelo: 'rapido', sistema: 'SISTEMA_SECRETO_4417', entrada: 'PREGUNTA_SECRETA_2290', config: {} };
  process.env.FALSO_RESPUESTA = 'RESPUESTA_SECRETA_8803';
  for (const modo of ['ok', 'sin_sesion', 'limite', 'basura', 'fallo', 'enorme', 'enorme_archivo']) {
    process.env.FALSO_MODO = modo;
    await preguntar(falso, unico);
  }
  process.env.FALSO_MODO = 'lento';
  await preguntar(falso, { ...unico, tiempoMax: 400 });
  for (const modo of ['login_chatgpt', 'login_apikey', 'login_no']) {
    process.env.FALSO_MODO = modo;
    await comprobar(falso);
  }
  assert.ok(existsSync(join(datos, 'registro.log')), 'se esperaba algún apunte técnico');
  const texto = readdirSync(datos).filter((f) => /^registro.*\.log$/.test(f)).map((f) => readFileSync(join(datos, f), 'utf8')).join('\n');
  for (const prohibido of ['SISTEMA_SECRETO_4417', 'PREGUNTA_SECRETA_2290', 'RESPUESTA_SECRETA_8803', '401 Unauthorized', 'usage limit',
    'Fallo interno', 'esto no es una respuesta', 'sk-proj', 'Logged in using']) {
    assert.ok(!texto.includes(prohibido), `el registro contiene «${prohibido}»`);
  }
});

test('ningún código de codex.mjs ni proceso.mjs llama a log() con la entrada, el sistema ni la respuesta', () => {
  for (const f of ['codex.mjs', 'proceso.mjs']) {
    const fuente = readFileSync(join(AQUI, '..', 'src', f), 'utf8');
    for (const linea of fuente.split('\n')) {
      if (/\blog\s*\(/.test(linea) && !/^\s*(\/\/|\*)/.test(linea)) {
        assert.ok(!/\b(entrada|sistema|texto|stdout|stderr|salida|detalle|mensaje|respuesta)\b/.test(linea), `${f}: ${linea.trim()}`);
      }
    }
  }
});

test('si la línea de órdenes pasara de LINEA_MAX (tabla enorme), no se lanza', async () => {
  const tabla = join(CARPETA, `features-enorme${n}.txt`);
  writeFileSync(tabla, Array.from({ length: 300 }, (_, i) => `tool_con_un_nombre_bastante_largo_${i}   stable   true`).join('\n'));
  process.env.FALSO_FEATURES = tabla;
  assert.deepEqual(await preguntar(falso, PREGUNTA), { ok: false, tipo: 'fallo', detalle: 'línea de órdenes demasiado larga' });
  assert.ok(!existsSync(registro), 'no se lanzó codex exec');
});
