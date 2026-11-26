// Llamadas a Claude Code (`claude -p`) con la suscripción de quien usa la app: sin claves de API, sin pago por uso,
// sin MCP y sin más herramientas que buscar y leer en internet (WebSearch y WebFetch, 12-nov: «si no sabe dónde está
// algo, que lo busque en internet»; nada que toque el PC). La app no usa el SDK ni habla con Anthropic: solo lanza el
// programa `claude` del PC. Tarea 13: si se pide, la pregunta lleva además nuestro servidor de herramientas de solo
// lectura (herramientas/servidor.mjs) y ningún otro MCP (`--strict-mcp-config --mcp-config`).
//
// FORMA DE RESULTADO de `preguntar` (la reutiliza el motor Codex, tareas 15b y 15c; mantenerla estable):
//   { ok: true,  texto: string, ms: number }
//     (con herramientas, tarea 13: además `paginas`, `usadas` y `mcp` si hubo stream-json, o `sinHerramientas: true`)
//   { ok: false, tipo: 'sin_instalar' | 'sin_sesion' | 'pago_por_uso' | 'limite' | 'tiempo' | 'fallo', detalle: string }
// `detalle` es un texto técnico corto (nunca la pregunta ni la respuesta del jugador). `comprobar` devuelve
// { estado: 'ok' | 'sin_instalar' | 'sin_sesion' | 'pago_por_uso' | 'desconocido', version?: string, motivo?: string }.
// El núcleo (tareas 15c y 18) NO debe llamar a `preguntar` si `comprobar()` no dio 'ok'; con 'desconocido' (la cuenta no se
// pudo comprobar) explica el `motivo` en vez de preguntar.
//
// Las opciones se detectan en `claude --help` (con memoria por `--version`): cada opción de seguridad que no existe
// en esa versión se quita, y sin `--tools` se prohíben las demás herramientas con `--disallowedTools`. Sin
// `--system-prompt-file` las instrucciones del sistema van delante de la entrada, por stdin (nunca como texto largo
// en la línea de órdenes).
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, basename } from 'node:path';
import { carpetaDatos, cuarentenaNueva } from './rutas.mjs';
import { log } from './registro.mjs';
import { MAX_SALIDA, TIEMPO_AYUDA, resolverPrograma, dondeWindows, argumentoValidoCmd, ejecutar as ejecutarPrograma, crearMemoria, objetosJson, PREFIJOS_ANTHROPIC } from './proceso.mjs';
import { NOMBRE_SERVIDOR, HERRAMIENTAS } from './herramientas/config.mjs';

export { MAX_SALIDA, argumentoValidoCmd };
export const TIEMPO_HAIKU = 120_000;
export const TIEMPO_SONNET = 180_000;
export const TIEMPO_OPUS = 300_000;

// Variables que harían pagar por uso o desviar la llamada a otro servicio. Se quitan del entorno del hijo.
// Se quita TODA variable con estos prefijos (sin mirar mayúsculas): ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL,
// CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY/ANTHROPIC_AWS…, CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR… Se conserva CLAUDE_CODE_OAUTH_TOKEN
// (el token de suscripción de `claude setup-token`). La lista está en proceso.mjs (codex.mjs también los quita).
export { PREFIJOS_ANTHROPIC };
// Los tres que se pueden elegir en el chat: «Rápido», «Más listo» y «El más capaz». Son alias de Claude Code: el CLI los
// resuelve al modelo más nuevo de esa familia que tenga la cuenta.
export const MODELOS = ['haiku', 'sonnet', 'opus'];
const TIEMPOS = { haiku: TIEMPO_HAIKU, sonnet: TIEMPO_SONNET, opus: TIEMPO_OPUS };

/** Tiempo máximo por defecto de una pregunta con ese modelo: 120 s haiku, 180 s sonnet, 300 s opus; lo raro, el de haiku. */
export function tiempoDe(modelo) {
  return MODELOS.includes(modelo) ? TIEMPOS[modelo] : TIEMPO_HAIKU;
}
// 12-nov: la IA busca en internet lo que no está en la base. Solo esas dos; todo lo que toca el PC sigue prohibido.
export const HERRAMIENTAS_WEB = 'WebSearch,WebFetch';
const HERRAMIENTAS_PROHIBIDAS = 'Bash,Edit,Write,Read,Glob,Grep,Task,NotebookEdit,TodoWrite,PowerShell,Agent,MultiEdit,Skill';
// Turnos de una pregunta: cada búsqueda o página leída gasta uno (con 1 no podría buscar).
export const MAX_TURNOS = 10;

// Tarea 13: preguntas con el servidor de herramientas de solo lectura (herramientas/servidor.mjs). Más tiempo, más turnos
// y más salida (el stream-json lleva el texto de cada herramienta y de cada página leída).
export const TIEMPO_HERRAMIENTAS = 300_000;
export const MAX_TURNOS_HERRAMIENTAS = 40;
export const MAX_SALIDA_HERRAMIENTAS = 16 * 1024 * 1024;
export const MAX_TEXTO_PAGINA = 200_000; // caracteres de cada página leída que se guardan para validar sus puntos
const PREFIJO_MCP = `mcp__${NOMBRE_SERVIDOR}__`;
const NOMBRE_HERRAMIENTA = /^[a-z0-9_]{1,64}$/;

/** Tiempo máximo de una pregunta con herramientas: el mayor de TIEMPO_HERRAMIENTAS y el del modelo (R3: opus no baja). */
export function tiempoConHerramientas(modelo) {
  return Math.max(TIEMPO_HERRAMIENTAS, tiempoDe(modelo));
}

/**
 * Encuentra el programa `claude`: SNF_CLAUDE, o el primer `.exe` de `where.exe claude` (y si no hay, el `.cmd`).
 * Devuelve {ruta, tipo: 'exe' | 'cmd' | 'node'} o null. El tipo 'node' (un .mjs/.js) solo sirve para las pruebas.
 */
export function resolverClaude({ env = process.env, donde = dondeWindows } = {}) {
  return resolverPrograma('claude', 'SNF_CLAUDE', { env, donde });
}

/** Ejecuta `claude <args>` (ver proceso.mjs). Por defecto con el entorno limpio de Claude. */
function ejecutar(c, args, opciones = {}) {
  return ejecutarPrograma(c, args, { env: entorno(process.env, new Set()), ...opciones });
}

// ---------- opciones ----------

/**
 * Versión y opciones del programa (`--version` y `--help`), con memoria (ver crearMemoria en proceso.mjs). Si falla
 * devuelve {error: 'ENOENT' | 'TIEMPO' | 'ARG_NO_VALIDO' | 'TRABAJO' | …, opciones: Set vacío}.
 */
const memoria = crearMemoria(async (c, quedan) => {
  const v = await ejecutar(c, ['--version'], { tiempoMax: quedan() });
  if (v.error) return { error: v.error };
  if (v.tiempo || quedan() <= 0) return { error: 'TIEMPO' };
  const version = (v.stdout.match(/(\d+\.\d+\.\d+[^\s]*)/) || [])[1] || v.stdout.trim().slice(0, 40);
  const h = await ejecutar(c, ['--help'], { tiempoMax: quedan() });
  if (h.error) return { error: h.error };
  if (h.tiempo) return { error: 'TIEMPO' };
  const texto = h.stdout + '\n' + h.stderr;
  const opciones = new Set(texto.match(/--[a-z][a-z-]+/g) || []);
  if (/^\s+auth\b/m.test(texto)) opciones.add('auth');
  return { version, opciones };
});

/** Olvida las opciones recordadas (solo para pruebas). */
export function olvidarOpciones() {
  memoria.olvidar();
}

function informacion(c, limite = TIEMPO_AYUDA) {
  return memoria.obtener(c, limite);
}

/** Opciones que lista `claude --help` (`--xxx`) y el comando `auth`, con memoria. */
export async function detectarOpciones(c) {
  return (await informacion(c)).opciones;
}

/**
 * Argumentos de `claude -p`. Cada opción que falta en `opciones` se quita. Herramientas: solo WebSearch y WebFetch
 * (`--tools`, y `--allowed-tools` para que no pidan permiso en -p); sin `--tools` se prohíben las demás con
 * `--disallowedTools`. `--mcp-config` solo va con `--strict-mcp-config`; `--safe-mode` (CLAUDE.md, hooks, plugins,
 * MCP y skills desactivados, sesión intacta) va si existe; `--bare` no se usa nunca (pide clave de API). La entrada va
 * siempre por stdin. `modelo` solo puede ser 'haiku', 'sonnet' u 'opus'; si no, lanza un error.
 *
 * Tarea 13: con `herramientas = {mcpConfig, nombres}` y `--strict-mcp-config` y `--mcp-config` en la ayuda, Claude Code
 * carga SOLO nuestro servidor (`--mcp-config <mcpConfig>`), `--allowed-tools` lleva además `mcp__snetforever__<nombre>`
 * de cada herramienta, la salida es `stream-json --verbose` si existen las dos (si no, `json`), `--max-turns` 40, y en
 * vez de `--safe-mode` (que apaga los servidores MCP) va `--restricted` si existe, y `--effort medium` (R14). Sin esas dos opciones, los argumentos
 * de siempre. Sin `herramientas`, exactamente los de siempre. Un nombre de herramienta raro lanza un error.
 */
export function argumentos(opciones, { modelo, sistemaArchivo, mcpVacio, herramientas = null }) {
  if (!MODELOS.includes(modelo)) throw new Error('modelo no válido');
  const a = ['-p'];
  const tiene = (o) => opciones.has(o);
  const con = Boolean(herramientas) && puedeHerramientas(opciones);
  const nombres = con ? (herramientas.nombres ?? HERRAMIENTAS) : [];
  if (con && !nombres.every((h) => typeof h === 'string' && NOMBRE_HERRAMIENTA.test(h))) throw new Error('herramienta no válida');
  if (tiene('--model')) a.push('--model', modelo);
  if (tiene('--output-format')) {
    if (con && tiene('--verbose')) a.push('--output-format', 'stream-json', '--verbose');
    else a.push('--output-format', 'json');
  }
  if (tiene('--tools')) a.push('--tools', HERRAMIENTAS_WEB);
  else a.push('--disallowedTools', HERRAMIENTAS_PROHIBIDAS);
  if (tiene('--allowed-tools')) a.push('--allowed-tools', [HERRAMIENTAS_WEB, ...nombres.map((h) => PREFIJO_MCP + h)].join(','));
  if (tiene('--strict-mcp-config')) {
    a.push('--strict-mcp-config');
    if (tiene('--mcp-config')) a.push('--mcp-config', con ? herramientas.mcpConfig : mcpVacio);
  }
  if (tiene('--setting-sources')) a.push('--setting-sources', 'project');
  if (tiene('--no-session-persistence')) a.push('--no-session-persistence');
  if (tiene('--max-turns')) a.push('--max-turns', String(con ? MAX_TURNOS_HERRAMIENTAS : MAX_TURNOS));
  if (tiene('--effort')) a.push('--effort', con ? 'medium' : 'low'); // R14: con herramientas, más calidad aunque tarde
  if (tiene('--disable-slash-commands')) a.push('--disable-slash-commands');
  if (con) {
    if (tiene('--restricted')) a.push('--restricted');
  } else if (tiene('--safe-mode')) a.push('--safe-mode');
  if (tiene('--system-prompt-file')) a.push('--system-prompt-file', sistemaArchivo);
  return a;
}

// Solo con las dos se puede cargar nuestro servidor sin cargar también los MCP del usuario.
function puedeHerramientas(opciones) {
  return opciones.has('--strict-mcp-config') && opciones.has('--mcp-config');
}

// Texto de un tool_result: una cadena, o las partes {type: 'text', text} unidas con saltos de línea.
function textoDeResultado(contenido) {
  if (typeof contenido === 'string') return contenido;
  if (!Array.isArray(contenido)) return '';
  return contenido.filter((p) => p && p.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n');
}

const partes = (o) => (Array.isArray(o?.message?.content) ? o.message.content : []);

/**
 * Lee la salida `stream-json` de Claude Code (un objeto JSON por línea; las que no lo son se saltan):
 * {resultado: {result, is_error} | null, paginas: [{url, texto}], usadas: {[herramienta]: n}, mcp: {[servidor]: estado}}.
 * `paginas`: cada WebFetch con su `input.url` y el texto de su tool_result (sin los que dieron error), cortado a
 * MAX_TEXTO_PAGINA caracteres. `usadas` cuenta cada tool_use; las nuestras sin el prefijo `mcp__snetforever__`. `mcp`
 * sale del `system/init`.
 */
export function leerStreamJson(texto) {
  let resultado = null;
  const paginas = [];
  const usadas = new Map();
  const mcp = new Map();
  const pendientes = new Map(); // id del tool_use de WebFetch -> url
  for (const cruda of String(texto).split('\n')) {
    const linea = cruda.trim();
    if (linea === '') continue;
    let o;
    try {
      o = JSON.parse(linea);
    } catch {
      continue;
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    if (o.type === 'system' && o.subtype === 'init' && Array.isArray(o.mcp_servers)) {
      for (const s of o.mcp_servers) if (typeof s?.name === 'string' && typeof s.status === 'string') mcp.set(s.name, s.status);
    } else if (o.type === 'assistant') {
      for (const p of partes(o)) {
        if (p?.type !== 'tool_use' || typeof p.name !== 'string') continue;
        const nombre = p.name.startsWith(PREFIJO_MCP) ? p.name.slice(PREFIJO_MCP.length) : p.name;
        usadas.set(nombre, (usadas.get(nombre) || 0) + 1);
        if (p.name === 'WebFetch' && typeof p.id === 'string' && typeof p.input?.url === 'string') pendientes.set(p.id, p.input.url);
      }
    } else if (o.type === 'user') {
      for (const p of partes(o)) {
        if (p?.type !== 'tool_result' || !pendientes.has(p.tool_use_id)) continue;
        const url = pendientes.get(p.tool_use_id);
        pendientes.delete(p.tool_use_id);
        if (p.is_error === true) continue;
        paginas.push({ url, texto: textoDeResultado(p.content).slice(0, MAX_TEXTO_PAGINA) });
      }
    } else if (o.type === 'result') {
      resultado = { result: typeof o.result === 'string' ? o.result : null, is_error: o.is_error === true };
    }
  }
  // Object.fromEntries: un nombre como «__proto__» queda como clave propia, sin tocar el prototipo.
  return { resultado, paginas, usadas: Object.fromEntries(usadas), mcp: Object.fromEntries(mcp) };
}

const CONOCIDAS = new Set(['WebSearch', 'WebFetch', ...HERRAMIENTAS]);
const ESTADO_MCP = /^[a-z_-]{1,20}$/;

// Línea del registro: solo contadores y el estado del servidor (nunca urls, búsquedas ni respuestas). Los nombres que no
// son nuestros ni de internet se cuentan juntos como «otras»; un estado raro, como «desconocido».
function resumenHerramientas({ usadas, mcp }: { usadas: Record<string, number>; mcp: Record<string, string> }) {
  const cuentas = [];
  let otras = 0;
  for (const [nombre, veces] of Object.entries(usadas)) {
    if (CONOCIDAS.has(nombre)) cuentas.push(`${nombre} ${veces}`);
    else otras += veces;
  }
  if (otras > 0) cuentas.push(`otras ${otras}`);
  const estado = Object.hasOwn(mcp, NOMBRE_SERVIDOR) ? mcp[NOMBRE_SERVIDOR] : 'sin dato';
  const estadoLimpio = estado === 'sin dato' || ESTADO_MCP.test(estado) ? estado : 'desconocido';
  return `${cuentas.length > 0 ? cuentas.join(', ') : 'ninguna'} (mcp ${estadoLimpio})`;
}

/**
 * Entorno del hijo: sin ninguna variable de pago por uso ni de otro proveedor (prefijos ANTHROPIC_, CLAUDE_CODE_USE_ y
 * CLAUDE_CODE_API_KEY_, sin mirar mayúsculas, como Windows), con CLAUDE_CODE_OAUTH_TOKEN intacto, sin tráfico accesorio
 * y, si esta versión no tiene `--effort`, sin tokens de razonamiento. No modifica el entorno que recibe.
 */
export function entorno(env, opciones) {
  const salida: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC?: string; MAX_THINKING_TOKENS?: string; } = {};
  for (const [k, v] of Object.entries(env)) {
    const mayus = k.toUpperCase();
    if (!PREFIJOS_ANTHROPIC.some((p) => mayus.startsWith(p))) salida[k] = v;
  }
  salida.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  if (!opciones.has('--effort')) salida.MAX_THINKING_TOKENS = '0';
  return salida;
}

// ---------- comprobar la cuenta ----------

const MOTIVO_DESCONOCIDO = 'no se pudo comprobar la cuenta';

// Todos los objetos JSON del texto que traen `loggedIn` (los de dentro de otro objeto no cuentan aparte).
function objetosConLoggedIn(texto) {
  return objetosJson(texto).filter((o) => 'loggedIn' in o);
}

const POSITIVO_TEXTO = /Login method:\s*Claude (?:Pro|Max|Team|Enterprise)\b/i;
const OTROS_PROVEEDORES = /api|console|bedrock|vertex|foundry|gateway|third|key|base url|proxy|auth token|anthropic_/i;

/**
 * Clasifica la salida estándar de `claude auth status` (SOLO stdout, nunca stderr).
 * 1. Si hay JSON (todo el texto, o los objetos `{…}` emparejados que traen `loggedIn`, aunque haya líneas de aviso antes o
 *    después) se usa una lista blanca. Si hay varios objetos y no coinciden en `loggedIn`, `authMethod` y `apiProvider`,
 *    'desconocido'. Con uno:
 *    - `loggedIn !== true` -> 'sin_sesion';
 *    - authMethod que empieza por `api` o es `third_party`, `apiProvider` distinto de `firstParty`, o `apiKeySource`
 *      presente -> 'pago_por_uso';
 *    - authMethod `claude.ai` u `oauth_token` con salida 0 -> 'ok';
 *    - cualquier otra cosa (`none`, valores nuevos) -> 'desconocido'.
 * 2. Sin JSON (texto de Ink): «not logged in» manda ('sin_sesion'); si no, solo es 'ok' con un positivo estricto («Login
 *    method: Claude Pro|Max|Team|Enterprise», salida 0) y sin mencionar api, console, bedrock, vertex, foundry, gateway,
 *    third, key, base url, proxy, auth token ni anthropic_ en el resto del texto (correos incluidos; solo se quita la
 *    línea del positivo). Con alguno de esos términos y sin positivo, 'pago_por_uso'; el resto, 'desconocido'.
 */
export function clasificarAuth(codigo, stdout) {
  const texto = String(stdout).trim();
  let j = null;
  try {
    const entero = JSON.parse(texto);
    if (entero && typeof entero === 'object' && !Array.isArray(entero)) j = entero;
  } catch {
    // no es JSON puro: se buscan objetos dentro
  }
  if (!j) {
    const objetos = objetosConLoggedIn(texto);
    if (objetos.length > 0) {
      const firma = (o) => JSON.stringify([o.loggedIn, o.authMethod ?? null, o.apiProvider ?? null, o.apiKeySource ?? null]);
      if (objetos.some((o) => firma(o) !== firma(objetos[0]))) return 'desconocido';
      j = objetos[0];
    }
  }
  if (j) {
    if (j.loggedIn !== true) return 'sin_sesion';
    const metodo = typeof j.authMethod === 'string' ? j.authMethod : '';
    const proveedor = j.apiProvider;
    if (metodo.startsWith('api') || metodo === 'third_party' || (proveedor != null && proveedor !== 'firstParty') || j.apiKeySource != null) return 'pago_por_uso';
    if ((metodo === 'claude.ai' || metodo === 'oauth_token') && codigo === 0) return 'ok';
    return 'desconocido';
  }
  if (/not logged in/i.test(texto)) return 'sin_sesion';
  // Solo se quita lo que casa con el positivo, no la línea entera («Login method: Claude Pro via API key» no es ok).
  const resto = texto.replace(new RegExp(POSITIVO_TEXTO.source, 'gi'), '');
  const otros = OTROS_PROVEEDORES.test(resto);
  if (POSITIVO_TEXTO.test(texto)) return codigo === 0 && !otros ? 'ok' : 'desconocido';
  if (otros) return 'pago_por_uso';
  return 'desconocido';
}

/**
 * Estado de Claude Code en este PC: {estado, version?, motivo?}.
 * IMPORTANTE para el núcleo (tareas 15c y 18): NO debe llamar a `preguntar` si `comprobar()` no dio 'ok'. Con
 * 'desconocido' hay que explicar `motivo` («no se pudo comprobar la cuenta», o la causa concreta) con el texto
 * `desconocido` de textos.mjs; con 'sin_sesion', 'pago_por_uso' o 'sin_instalar', su texto de error.
 */
export async function comprobar(c) {
  if (!c || !existsSync(c.ruta)) return { estado: 'sin_instalar' };
  const info = await informacion(c);
  if (info.error === 'ENOENT') return { estado: 'sin_instalar' };
  if (info.error) return { estado: 'desconocido', motivo: (ERRORES_ARRANQUE[info.error] || [])[1] || MOTIVO_DESCONOCIDO };
  if (!info.opciones.has('auth')) return { estado: 'desconocido', version: info.version, motivo: MOTIVO_DESCONOCIDO };
  if (info.authJson === undefined) {
    // ¿`auth status` sabe dar JSON? Se mira una sola vez en su ayuda.
    const ayuda = await ejecutar(c, ['auth', 'status', '--help']);
    info.authJson = !ayuda.error && !ayuda.tiempo && /--json\b/.test(ayuda.stdout + ayuda.stderr);
  }
  const r = await ejecutar(c, info.authJson ? ['auth', 'status', '--json'] : ['auth', 'status'], { env: entorno(process.env, info.opciones) });
  if (r.error === 'ENOENT') return { estado: 'sin_instalar' };
  if (r.error) return { estado: 'desconocido', version: info.version, motivo: (ERRORES_ARRANQUE[r.error] || [])[1] || MOTIVO_DESCONOCIDO };
  if (r.tiempo) return { estado: 'desconocido', version: info.version, motivo: MOTIVO_DESCONOCIDO };
  const estado = clasificarAuth(r.codigo, r.stdout);
  log('info', `claude comprobar: ${estado} (versión ${info.version})`);
  return estado === 'desconocido' ? { estado, version: info.version, motivo: MOTIVO_DESCONOCIDO } : { estado, version: info.version };
}

// ---------- preguntar ----------

const ERROR_SESION = /not logged in|please run \/login|invalid api key|authentication|unauthorized/i;
const ERROR_LIMITE = /usage limit|rate limit|limit reached|overloaded|429/i;

function clasificarError(texto) {
  if (ERROR_SESION.test(texto)) return 'sin_sesion';
  if (ERROR_LIMITE.test(texto)) return 'limite';
  return 'fallo';
}

const corto = (t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 120);

function fallar(tipo, detalle, t0) {
  log('aviso', `claude fallo ${tipo} en ${Date.now() - t0} ms`);
  return { ok: false, tipo, detalle };
}

const CONTENIDO_MCP = '{"mcpServers":{}}';
// datos/mcp-vacio.json: fijo. En cada llamada se comprueba que su contenido sea exactamente el esperado; si no, el archivo
// cambiado va a la cuarentena y se escribe otro.
function asegurarMcpVacio(datos) {
  const ruta = join(datos, 'mcp-vacio.json');
  if (existsSync(ruta) && readFileSync(ruta, 'utf8') !== CONTENIDO_MCP) renameSync(ruta, join(cuarentenaNueva(), 'mcp-vacio.json'));
  if (!existsSync(ruta)) writeFileSync(ruta, CONTENIDO_MCP, 'utf8');
  return ruta;
}

// Lote C (revisión 52, Minor 6): datos/sistema.txt, fijo, como mcp-vacio.json. Antes cada pregunta dejaba un
// sistema-*.txt nuevo en cuarentena/sistema (los que ya hay allí no se tocan). Se reescribe solo si su contenido no es el
// de esta llamada, y el de antes va a la cuarentena (nunca se borra). Mientras una llamada lo usa no se cambia: otra
// llamada a la vez con otro sistema lleva su propio sistema-<azar>.txt, que al terminar va a cuarentena/sistema.
// tomarSistema(datos, sistema) -> {ruta, soltar()}
const enUso = new Map(); // ruta de sistema.txt -> {contenido, llamadas}
function tomarSistema(datos, sistema) {
  const fijo = join(datos, 'sistema.txt');
  const uso = enUso.get(fijo);
  if (uso && uso.contenido !== sistema) {
    const propio = join(datos, `sistema-${randomBytes(6).toString('hex')}.txt`);
    writeFileSync(propio, sistema, 'utf8');
    return { ruta: propio, soltar: () => apartarSistema(datos, propio) };
  }
  if (!uso) {
    if (existsSync(fijo) && readFileSync(fijo, 'utf8') !== sistema) renameSync(fijo, join(cuarentenaNueva(), 'sistema.txt'));
    if (!existsSync(fijo)) writeFileSync(fijo, sistema, 'utf8');
    enUso.set(fijo, { contenido: sistema, llamadas: 0 });
  }
  const actual = enUso.get(fijo);
  actual.llamadas += 1;
  let suelto = false;
  return {
    ruta: fijo,
    soltar: () => {
      if (suelto) return;
      suelto = true;
      actual.llamadas -= 1;
      if (actual.llamadas === 0 && enUso.get(fijo) === actual) enUso.delete(fijo);
    },
  };
}

// El sistema propio de una llamada no se borra: va a la cuarentena (una sola carpeta para todos); si no se puede, se queda.
function apartarSistema(datos, ruta) {
  try {
    const carpeta = join(datos, 'cuarentena', 'sistema');
    mkdirSync(carpeta, { recursive: true });
    renameSync(ruta, join(carpeta, basename(ruta)));
  } catch {
    // si no se puede mover se queda donde está
  }
}

const ERRORES_ARRANQUE = {
  ENOENT: ['sin_instalar', 'claude no está en este PC'],
  TIEMPO: ['tiempo', 'tiempo agotado'],
  ARG_NO_VALIDO: ['fallo', 'la ruta de Claude Code o de los datos tiene caracteres no admitidos (& ! % ^ …); instala Claude Code con el instalador oficial (.exe) o mueve la carpeta de datos'],
  TRABAJO: ['fallo', 'la carpeta de trabajo no es de SnetForever'],
  DATOS: ['fallo', 'carpeta de datos no válida'],
};

/**
 * Hace una pregunta a Claude Code, sin estado. `modelo` solo puede ser 'haiku', 'sonnet' u 'opus' (otro valor da
 * {ok: false, tipo: 'fallo', detalle: 'modelo no válido'} sin lanzar nada). El tiempo máximo por defecto es de 120 s con
 * haiku, 180 s con sonnet y 300 s con opus, y cuenta también la detección de opciones. Ver la forma del resultado en la cabecera.
 *
 * Tarea 13: con `herramientas = {mcpConfig, nombres = HERRAMIENTAS}` (mcpConfig: la ruta que da
 * asegurarMcpHerramientas) Claude Code arranca solo nuestro servidor (ver `argumentos`); el tiempo por defecto es
 * tiempoConHerramientas(modelo) y la salida puede llegar a MAX_SALIDA_HERRAMIENTAS. El hijo lleva ENABLE_TOOL_SEARCH=false
 * (R16: si no, algunas versiones esconden las herramientas MCP tras ToolSearch, que `--tools` deja fuera). Con stream-json el éxito trae además
 * `paginas`, `usadas` y `mcp` (ver leerStreamJson); con `json` (versión sin `--verbose`) no trae `paginas` (no se sabe
 * qué leyó). Si esta versión no tiene `--strict-mcp-config` y `--mcp-config`, la pregunta va como siempre y el éxito
 * trae `sinHerramientas: true`.
 */
export async function preguntar(c, { modelo, sistema, entrada, tiempoMax, herramientas = null }) {
  const t0 = Date.now();
  if (!MODELOS.includes(modelo)) return fallar('fallo', 'modelo no válido', t0);
  if (herramientas && !herramientasValidas(herramientas)) return fallar('fallo', 'herramientas no válidas', t0);
  if (!c || !existsSync(c.ruta)) return fallar('sin_instalar', 'claude no está en este PC', t0);
  const limite = tiempoMax ?? (herramientas ? tiempoConHerramientas(modelo) : tiempoDe(modelo));
  const info = await informacion(c, limite);
  if (info.error) {
    const [tipo, detalle] = ERRORES_ARRANQUE[info.error] || ['fallo', `no se pudo arrancar (${info.error})`];
    return fallar(tipo, detalle, t0);
  }
  const quedan = limite - (Date.now() - t0);
  if (quedan <= 0) return fallar('tiempo', 'tiempo agotado', t0);
  const conHerramientas = Boolean(herramientas) && puedeHerramientas(info.opciones);
  const stream = conHerramientas && info.opciones.has('--output-format') && info.opciones.has('--verbose');

  const conArchivo = info.opciones.has('--system-prompt-file');
  let mcpVacio;
  let sistemaArchivo = null;
  const datos = carpetaDatos();
  try {
    mkdirSync(datos, { recursive: true });
  } catch {
    return fallar('fallo', 'carpeta de datos no válida', t0);
  }
  let usoSistema = null;
  try {
    mcpVacio = asegurarMcpVacio(datos);
    if (conArchivo) {
      usoSistema = tomarSistema(datos, sistema);
      sistemaArchivo = usoSistema.ruta;
    }
  } catch {
    usoSistema?.soltar();
    return fallar('fallo', 'no se pudieron preparar los archivos', t0);
  }

  let r;
  try {
    const args = argumentos(info.opciones, { modelo, sistemaArchivo, mcpVacio, herramientas: conHerramientas ? herramientas : null });
    r = await ejecutar(c, args, {
      entrada: conArchivo ? entrada : `${sistema}\n\n${entrada}`,
      tiempoMax: quedan,
      env: conHerramientas ? { ...entorno(process.env, info.opciones), ENABLE_TOOL_SEARCH: 'false' } : entorno(process.env, info.opciones),
      ...(conHerramientas ? { maxBytes: MAX_SALIDA_HERRAMIENTAS } : {}),
    });
  } finally {
    usoSistema?.soltar();
  }

  if (r.error) {
    const [tipo, detalle] = ERRORES_ARRANQUE[r.error] || ['fallo', `no se pudo arrancar (${r.error})`];
    return fallar(tipo, detalle, t0);
  }
  if (r.tiempo) return fallar('tiempo', 'tiempo agotado', t0);
  if (r.truncado) return fallar('fallo', 'respuesta demasiado grande', t0);

  let json = null;
  let lectura = null;
  if (stream) {
    lectura = leerStreamJson(r.stdout);
    json = lectura.resultado;
    log('info', `claude herramientas: ${resumenHerramientas(lectura)}`);
  } else {
    try {
      json = JSON.parse(r.stdout);
    } catch {
      // salida ilegible
    }
  }
  const resultado = json && typeof json.result === 'string' ? json.result : '';
  if (r.codigo !== 0 || (json && json.is_error)) {
    const mensaje = `${r.stderr}\n${resultado}`;
    const tipo = clasificarError(mensaje);
    return fallar(tipo, corto(mensaje) || `código ${r.codigo}`, t0);
  }
  if (!json || typeof json.result !== 'string') return fallar('fallo', 'respuesta ilegible', t0);
  const ms = Date.now() - t0;
  log('info', `claude ${modelo} respondió en ${ms} ms`);
  const exito: {
    ok: boolean;
    texto: typeof json.result;
    ms: typeof ms;
    sinHerramientas?: boolean;
  } = { ok: true, texto: json.result, ms };
  if (lectura) Object.assign(exito, { paginas: lectura.paginas, usadas: lectura.usadas, mcp: lectura.mcp });
  if (herramientas && !conHerramientas) exito.sinHerramientas = true;
  return exito;
}

// {mcpConfig: ruta no vacía, nombres?: [nombre de herramienta]}
function herramientasValidas(h) {
  if (typeof h !== 'object' || typeof h.mcpConfig !== 'string' || h.mcpConfig === '') return false;
  if (h.nombres === undefined) return true;
  return Array.isArray(h.nombres) && h.nombres.every((n) => typeof n === 'string' && NOMBRE_HERRAMIENTA.test(n));
}
