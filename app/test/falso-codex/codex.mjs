// Codex CLI falso para las pruebas: NUNCA se llama al de verdad.
// FALSO_MODO: ok | ruta | sin_sesion | limite | lento | basura | enorme | enorme_archivo | sin_sandbox
//             | login_chatgpt | login_apikey | login_no | login_raro
// FALSO_REGISTRO: archivo donde se apunta {argv, cwd, lista, env, stdin, pid, salidaPrevia}.
// FALSO_AYUDA_EXEC / FALSO_AYUDA_LOGIN: otra ayuda para `exec --help` / `login --help` (por defecto, las copias reales).
// FALSO_LOGIN_JSON: si existe, `login status --help` lista `--json` y `login status --json` escribe JSON.
// `login status` escribe por STDERR, como el real (Ruling F4-23); con FALSO_LOGIN_STDOUT, por stdout.
// FALSO_RUIDO: texto de más en stderr en `login status`.  FALSO_LINEA_EXTRA: línea de más en stdout.
// FALSO_FEATURES: `features list` lee ese archivo (por defecto la copia real features-real.txt); 'falla' sale con 1;
// 'basura' escribe algo que no es la tabla.
// FALSO_REGISTRO_LOGIN: archivo donde se apunta {argv, env} de `login status`.
// FALSO_RESPUESTA: texto de la respuesta (por defecto «respuesta falsa de codex»).
// Modo ruta (tarea 21): contesta según la entrada con ../ayuda/respuesta-ruta.mjs, como el claude falso.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { respuestaRuta } from '../ayuda/respuesta-ruta.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const modo = process.env.FALSO_MODO || 'ok';

if (argv[0] === '--version' || argv[0] === '-V') {
  console.log('codex-cli 0.164.0');
  process.exit(0);
}

if (argv[0] === 'exec' && argv.includes('--help')) {
  let ayuda = readFileSync(process.env.FALSO_AYUDA_EXEC || join(aqui, 'ayuda-exec-real.txt'), 'utf8');
  if (modo === 'sin_sandbox') ayuda = ayuda.split('\n').filter((l) => !/--sandbox/.test(l)).join('\n');
  process.stdout.write(ayuda);
  process.exit(0);
}

if (argv[0] === 'features' && argv[1] === 'list') {
  const f = process.env.FALSO_FEATURES;
  if (f === 'falla') {
    process.stderr.write('Error: no se pudo leer la configuración\n');
    process.exit(1);
  }
  if (f === 'basura') {
    process.stdout.write('esto no es la tabla de funciones\n');
    process.exit(0);
  }
  process.stdout.write(readFileSync(f || join(aqui, 'features-real.txt'), 'utf8'));
  process.exit(0);
}

if (argv[0] === 'login') {
  if (argv[1] !== 'status') {
    process.stdout.write(readFileSync(process.env.FALSO_AYUDA_LOGIN || join(aqui, 'ayuda-login-real.txt'), 'utf8'));
    process.exit(0);
  }
  if (argv.includes('--help')) {
    const json = process.env.FALSO_LOGIN_JSON ? '      --json\n          Print the login status as JSON\n\n' : '';
    console.log(`Show login status\n\nUsage: codex login status [OPTIONS]\n\nOptions:\n${json}  -h, --help\n          Print help`);
    process.exit(0);
  }
  if (process.env.FALSO_REGISTRO_LOGIN) writeFileSync(process.env.FALSO_REGISTRO_LOGIN, JSON.stringify({ argv, env: process.env }));
  if (process.env.FALSO_RUIDO) process.stderr.write(process.env.FALSO_RUIDO + '\n');
  // El real escribe el estado por stderr (eprintln!); con FALSO_LOGIN_STDOUT, por stdout.
  const escribir = (t) => (process.env.FALSO_LOGIN_STDOUT ? process.stdout : process.stderr).write(t + '\n');
  const extra = () => {
    if (process.env.FALSO_LINEA_EXTRA) process.stdout.write(process.env.FALSO_LINEA_EXTRA + '\n');
  };
  if (argv.includes('--json')) {
    const porModo = {
      login_chatgpt: [{ logged_in: true, auth_mode: 'chatgpt' }, 0],
      login_apikey: [{ logged_in: true, auth_mode: 'apikey' }, 0],
      login_no: [{ logged_in: false }, 1],
      login_raro: [{ logged_in: true, auth_mode: 'workload_identity' }, 0],
    };
    const [j, codigo] = porModo[modo] || porModo.login_no;
    escribir(JSON.stringify(j));
    extra();
    process.exit(codigo);
  }
  // Las cadenas son las del codex.exe 0.164.0 instalado (leídas con grep -a, sin ejecutarlo).
  const porModo = {
    login_chatgpt: ['Logged in using ChatGPT', 0],
    login_apikey: ['API key configured - sk-proj-***ABCD', 0],
    login_raro: ['Logged in using workload identity', 0],
  };
  const [texto, codigo] = porModo[modo] || ['Not logged in', 1];
  escribir(texto);
  extra();
  process.exit(codigo);
}

// ---------- codex exec ----------

const iSalida = argv.indexOf('-o');
const salida = iSalida >= 0 ? argv[iSalida + 1] : null;

function apuntar(stdin) {
  if (!process.env.FALSO_REGISTRO) return;
  const dato = { argv, cwd: process.cwd(), lista: readdirSync(process.cwd()), env: process.env, stdin, pid: process.pid, salidaPrevia: salida ? existsSync(salida) : null };
  writeFileSync(process.env.FALSO_REGISTRO, JSON.stringify(dato));
}

apuntar(null); // el pid cuenta desde el principio
let entrada = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (t) => { entrada += t; });
process.stdin.on('end', () => {
  apuntar(entrada);
  process.stderr.write('OpenAI Codex v0.164.0 (research preview)\n--------\nworkdir: ' + process.cwd() + '\n');
  if (modo === 'sin_sesion') {
    process.stderr.write('ERROR: unexpected status 401 Unauthorized: Missing bearer or basic authentication in header\n');
    process.exit(1);
  }
  if (modo === 'limite') {
    process.stderr.write("ERROR: You've hit your usage limit. Upgrade to Pro or try again later.\n");
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
  if (modo === 'enorme_archivo') {
    writeFileSync(salida, 'y'.repeat(1_300_000));
    process.exit(0);
  }
  if (modo === 'basura') {
    process.stdout.write('esto no es una respuesta');
    process.stderr.write('Fallo interno de codex falso\n');
    process.exit(0); // sale con 0 pero no escribe el archivo -o
  }
  if (modo === 'eco_fallo') {
    // Como el real: repite la pregunta por stderr; FALSO_LINEA_ERROR es la línea «ERROR: …» de Codex (si la hay).
    process.stderr.write(`user\n${entrada}\n`);
    if (process.env.FALSO_LINEA_ERROR) process.stderr.write(process.env.FALSO_LINEA_ERROR + '\n');
    process.exit(2);
  }
  if (modo === 'error_stdout') {
    process.stdout.write("ERROR: You've hit your usage limit\n");
    process.exit(1);
  }
  if (modo === 'fallo') {
    process.stderr.write('ERROR: Fallo interno de codex falso\n');
    process.exit(2);
  }
  // FALSO_RESPUESTA=ECO: responde «eco:» y la última línea del stdin (para las llamadas a la vez).
  const eco = entrada.trim().split('\n').pop();
  const texto = modo === 'ruta' ? respuestaRuta(entrada)
    : process.env.FALSO_RESPUESTA === 'ECO' ? `eco:${eco}` : process.env.FALSO_RESPUESTA || 'respuesta falsa de codex';
  if (salida) writeFileSync(salida, texto, 'utf8');
  process.stdout.write(texto + '\n');
  process.exit(0);
});
