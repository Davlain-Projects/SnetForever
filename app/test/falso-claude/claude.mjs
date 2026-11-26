// Claude Code falso para las pruebas: NUNCA se llama al de verdad.
// FALSO_MODO: ok | ruta | sin_sesion | limite | lento | basura | error_json | auth_ok | auth_console | auth_no
// FALSO_REGISTRO: archivo donde se apunta {argv, cwd, env, stdin, pid}.  FALSO_AYUDA: otra ayuda para --help.
// Modos extra: enorme (salida de más de 1 MB) y auth_json_<metodo> (JSON real de `auth status`, con authMethod = <metodo>;
// FALSO_AUTH_EXTRA = JSON que se mezcla; FALSO_RUIDO = texto que se escribe en stderr).
// FALSO_RESPUESTA: texto de la respuesta (por defecto «respuesta falsa»).
// Modo stream (tarea 13): imprime las líneas de FALSO_STREAM (JSON: lista de cadenas u objetos) o el archivo
// FALSO_STREAM_ARCHIVO, como el stream-json de `--output-format stream-json --verbose`.
// Modo herramientas (tarea 14): lee --mcp-config, arranca el servidor que dice (de verdad), le hace `initialize` y los
// `tools/call` de FALSO_LLAMADAS (JSON: [{nombre, argumentos}]) y escribe un stream-json (init con el estado del
// servidor, cada tool_use con su tool_result) cuyo `result` es el texto de la primera respuesta de herramienta. Al
// servidor se le da FALSO_TIEMPO_SERVIDOR ms como mucho (30 s por defecto); después se le mata.
// Modo ruta (tarea 21): contesta según la entrada con ../ayuda/respuesta-ruta.mjs (bloque snet con P2 y P1, marcas o
// rutaZona).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { respuestaRuta } from '../ayuda/respuesta-ruta.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const modo = process.env.FALSO_MODO || 'ok';

if (argv[0] === '--version' || argv[0] === '-v') {
  console.log('2.1.0 (Claude Code)');
  process.exit(0);
}
if (argv[0] === '--help' || argv[0] === '-h') {
  process.stdout.write(readFileSync(process.env.FALSO_AYUDA || join(aqui, 'ayuda.txt'), 'utf8'));
  process.exit(0);
}
if (argv[0] === 'auth') {
  if (argv.includes('--help')) {
    const json = process.env.FALSO_AUTH_JSON ? '  --json  Output as JSON (default)\n' : '';
    console.log(`Usage: claude auth status [options]\n\nOptions:\n  --text  Output as text\n${json}  -h, --help  Display help`);
    process.exit(0);
  }
  if (process.env.FALSO_REGISTRO_AUTH) writeFileSync(process.env.FALSO_REGISTRO_AUTH, JSON.stringify(argv));
  if (process.env.FALSO_RUIDO) process.stderr.write(process.env.FALSO_RUIDO + '\n');
  if (modo.startsWith('auth_json_')) {
    const estado = JSON.parse(readFileSync(join(aqui, 'auth-status.json'), 'utf8'));
    estado.authMethod = modo.slice('auth_json_'.length);
    if (estado.authMethod === 'none') estado.loggedIn = false;
    Object.assign(estado, JSON.parse(process.env.FALSO_AUTH_EXTRA || '{}'));
    console.log(JSON.stringify(estado, null, 2));
    process.exit(estado.loggedIn ? 0 : 1);
  }
  if (modo === 'auth_ok') {
    console.log('Logged in as alguien@example.com\nLogin method: Claude Max Account');
    process.exit(0);
  }
  if (modo === 'auth_console') {
    console.log('Logged in as alguien@example.com\nLogin method: Console API usage billing');
    process.exit(0);
  }
  console.log('Not logged in');
  process.exit(1);
}

function apuntar(stdin) {
  if (!process.env.FALSO_REGISTRO) return;
  const i = argv.indexOf('--system-prompt-file');
  let sistemaContenido = null;
  try { if (i >= 0) sistemaContenido = readFileSync(argv[i + 1], 'utf8'); } catch { /* sin archivo */ }
  const dato = { argv, cwd: process.cwd(), lista: readdirSync(process.cwd()), env: process.env, stdin, pid: process.pid, sistemaContenido };
  writeFileSync(process.env.FALSO_REGISTRO, JSON.stringify(dato));
}

apuntar(null); // el pid cuenta desde el principio
let entrada = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (t) => { entrada += t; });
process.stdin.on('end', () => {
  apuntar(entrada);
  if (modo === 'stream') {
    // Tarea 13: imprime las líneas de un stream-json (FALSO_STREAM, JSON con una lista de líneas: cadenas tal cual u
    // objetos), o el archivo FALSO_STREAM_ARCHIVO tal cual (para salidas grandes, que no caben en una variable).
    const salida = process.env.FALSO_STREAM_ARCHIVO
      ? readFileSync(process.env.FALSO_STREAM_ARCHIVO, 'utf8')
      : JSON.parse(process.env.FALSO_STREAM || '[]').map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n';
    process.stdout.write(salida, () => process.exit(0));
    return;
  }
  if (modo === 'herramientas') {
    conHerramientas().then((salida) => process.stdout.write(salida, () => process.exit(0)), (e) => {
      process.stderr.write(`falso herramientas: ${e?.message || e}\n`);
      process.exit(1);
    });
    return;
  }
  if (modo === 'sin_sesion') {
    process.stderr.write('Invalid API key · Please run /login\n');
    process.exit(1);
  }
  if (modo === 'limite') {
    process.stderr.write('Claude AI usage limit reached\n');
    process.exit(1);
  }
  if (modo === 'lento') {
    setTimeout(() => process.exit(0), 60_000);
    return;
  }
  if (modo === 'enorme') {
    process.stdout.write('x'.repeat(1_300_000));
    process.exit(0);
  }
  if (modo === 'basura') {
    process.stdout.write('esto no es JSON');
    process.exit(0);
  }
  if (modo === 'error_json') {
    process.stdout.write(JSON.stringify({ type: 'result', is_error: true, result: 'Fallo interno desconocido' }));
    process.exit(0);
  }
  const result = modo === 'ruta' ? respuestaRuta(entrada) : process.env.FALSO_RESPUESTA || 'respuesta falsa';
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result }));
  process.exit(0);
});

// Tarea 14: hace de Claude Code con el servidor de --mcp-config (ver la cabecera). Da el stream-json entero.
async function conHerramientas() {
  const i = argv.indexOf('--mcp-config');
  if (i < 0) throw new Error('sin --mcp-config');
  const config = JSON.parse(readFileSync(argv[i + 1], 'utf8'));
  const [nombre, servidor] = Object.entries(config.mcpServers || {})[0] || [];
  if (!servidor) throw new Error('mcp.json sin servidor');
  const llamadas = JSON.parse(process.env.FALSO_LLAMADAS || '[]');
  const hijo = spawn(servidor.command, servidor.args || [], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(servidor.env || {}) } });
  let salida = '';
  hijo.stdout.setEncoding('utf8');
  hijo.stdout.on('data', (t) => { salida += t; });
  hijo.stderr.resume();
  // Revisión 1: un servidor que no arranca o no acaba no deja errores sin escuchar ni al falso colgado.
  hijo.stdin.on('error', () => {});
  const fin = new Promise((resolver) => {
    hijo.on('close', resolver);
    hijo.on('error', () => resolver(-1));
  });
  const reloj = setTimeout(() => hijo.kill(), Number(process.env.FALSO_TIEMPO_SERVIDOR) || 30_000);
  const mandar = (o) => hijo.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...o })}\n`);
  mandar({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'falso', version: '0' } } });
  mandar({ method: 'notifications/initialized' });
  llamadas.forEach((l, k) => mandar({ id: k + 2, method: 'tools/call', params: { name: l.nombre, arguments: l.argumentos || {} } }));
  hijo.stdin.end();
  const codigo = await fin;
  clearTimeout(reloj);
  const respuestas = new Map();
  for (const linea of salida.split('\n')) {
    try {
      const o = JSON.parse(linea);
      if (o && o.id !== undefined) respuestas.set(o.id, o);
    } catch { /* no es JSON */ }
  }
  const conectado = codigo === 0 && Boolean(respuestas.get(1)?.result);
  const lineas = [{ type: 'system', subtype: 'init', mcp_servers: [{ name: nombre, status: conectado ? 'connected' : 'failed' }] }];
  const textos = [];
  llamadas.forEach((l, k) => {
    const id = `toolu_${k + 1}`;
    const r = respuestas.get(k + 2);
    const contenido = Array.isArray(r?.result?.content) ? r.result.content : [{ type: 'text', text: JSON.stringify(r?.error ?? null) }];
    textos.push(contenido.filter((p) => p?.type === 'text').map((p) => p.text).join('\n'));
    lineas.push({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__${nombre}__${l.nombre}`, input: l.argumentos || {} }] } });
    lineas.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: contenido, is_error: r?.result?.isError === true }] } });
  });
  lineas.push({ type: 'result', subtype: 'success', is_error: false, result: textos[0] ?? process.env.FALSO_RESPUESTA ?? 'respuesta falsa' });
  return lineas.map((l) => JSON.stringify(l)).join('\n') + '\n';
}
