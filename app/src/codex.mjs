// Llamadas a Codex CLI (`codex exec`) con la sesión de la suscripción de ChatGPT de quien usa la app: sin claves de API,
// sin pago por uso, sin más MCP que el nuestro y con el sandbox de solo lectura. La app no usa ningún SDK ni habla con
// OpenAI: solo lanza el programa `codex` del PC (a través de proceso.mjs, igual que claude.mjs).
//
// 22-nov, HERRAMIENTAS DE GUÍAS: con `mcp` ({command, args, nombres}, de mcpCodex) la pregunta lleva nuestro servidor con
// --solo-lectura y nada más: sin `guardar_guia`, la única herramienta que escribe. Sus valores van como textos literales
// de TOML (comilla simple: sin comillas dobles que cmd.exe no deja pasar). Con `approval_policy=never` Codex rechaza toda
// llamada MCP que no venga aprobada, así que se aprueba solo este servidor. Si la ruta no se puede escribir así o la línea
// no cabe, la pregunta sigue sin herramientas (`sinHerramientas: true`). Con `--json` se sabe si las pudo usar.
//
// FORMA DE RESULTADO de `preguntar` (la misma que claude.mjs; mantenerla estable):
//   { ok: true,  texto: string, ms: number }
//   { ok: false, tipo: 'sin_instalar' | 'sin_sesion' | 'pago_por_uso' | 'limite' | 'tiempo' | 'fallo', detalle: string }
// `comprobar` devuelve { estado: 'ok' | 'sin_instalar' | 'sin_sesion' | 'pago_por_uso' | 'desconocido', version?, motivo? }.
// El núcleo (tareas 15c y 18) NO debe llamar a `preguntar` si `comprobar()` no dio 'ok'; con 'desconocido' (la cuenta no se
// pudo comprobar) explica el `motivo` en vez de preguntar.
//
// `modelo` solo puede ser 'rapido' o 'listo' (motor.mjs lo traduce desde haiku/sonnet/opus; opus usa el listo). El nombre real del modelo sale de
// config.codex.rapido / config.codex.listo; vacío = el modelo por defecto de la cuenta (sin -m). No se escriben nombres
// de modelos de OpenAI en el código.
//
// Las opciones se detectan en `codex exec --help` (con memoria): cada opción que falta se quita; sin `--sandbox`, `-o`, `--ignore-rules`,
// `--config` o `--ignore-user-config` no se lanza nada («Codex demasiado antiguo»). Nunca se usa
// `--dangerously-bypass-approvals-and-sandbox` ni `--approve-for-me`. Codex no tiene `--system-prompt-file`: las
// instrucciones del sistema van delante de la entrada, por
// stdin (`-` como prompt). Los valores de `-c` van sin comillas (pasan el filtro de cmd.exe; Codex toma el texto literal
// cuando no es TOML válido). La respuesta se lee del archivo `-o` (como mucho 1 MB), que está en datos/salidas (fuera de
// la carpeta de trabajo, que se despeja en cada lanzamiento) y después se renombra a datos/cuarentena/codex (no se borra).
// Para que no crezcan sin límite: los restos de datos/salidas de más de 10 minutos se llevan a esa cuarentena y, cuando
// cuarentena/codex llega a MAX_CUARENTENA archivos, la carpeta entera se renombra a cuarentena/codex-<sello>.
//
// HERRAMIENTAS (Rulings F4-23 y F4-24). `--sandbox read-only` no las quita, así que la app lee una vez `codex features
// list` (dentro del tiempo máximo y con la misma memoria que la ayuda) y pasa `--disable <nombre>` por TODA función de la
// tabla cuyo nombre case con estos patrones, esté a true o a false (`features list` no admite --ignore-user-config y
// refleja el [features] del usuario; `exec` lo ignora y vuelve a los valores por defecto):
//   shell|exec|browser|computer|apps?$|plugin|hook|memor|image|agent|skill|tool|sleep|goals|worktree|workspace|stdin|
//   automation|daemon|mcp|mention|realtime|voice|dictation|chat|updates|web|search|code_mode|repl|patch|remote|artifact|
//   undo|copy_file|network|guardian|steer
// (los del controlador, más `web|search` por la búsqueda web y `code_mode`, que ejecuta código). Nunca se desactivan las de
// formato que hacen falta para que `exec` conteste con texto: content_item_kinds, item_ids, enable_request_compression e
// incremental_tools. Con la copia real de 0.164.0 (test/falso-codex/features-real.txt) salen 123 `--disable` (la lista
// exacta está en HERRAMIENTAS_REALES de test/codex.test.js) y la línea de cmd.exe mide unos 4 600 caracteres; si pasa de
// LINEA_MAX (7 000, el tope de cmd.exe es 8 191) no se lanza. Si `features list` falla o no se puede leer, no se lanza
// nada («no se pudo comprobar qué herramientas tiene Codex»). Siempre va `-c approval_policy=never` (sin comillas) y, sin
// `--config` o sin `--ignore-user-config` en la ayuda, no se lanza («Codex demasiado antiguo»).
//
// BÚSQUEDA WEB. La clave real en 0.164.0 es `web_search` en la raíz de la configuración, con los valores "live", "indexed",
// "cached" o "disabled" (texto del propio codex.exe: «web search is enabled by default… Set `web_search` to "live",
// "indexed", "cached", or "disabled"»). 12-nov («si no sabe dónde está algo, que lo busque en internet»): se pasa
// `-c web_search=live` (sin comillas: Codex lo toma como texto) y las funciones de la búsqueda web (web_search_request y
// web_search_cached, en NO_DESACTIVAR) no se desactivan, ni code_mode_host (estable y encendida de serie: sin ella la
// búsqueda no llega al modelo, probado el 12-nov con 0.164.0; code_mode, la que ejecuta código, sigue desactivada). Todo lo demás (shell, código, MCP…) sigue desactivado.
//
// CUENTA (Ruling F4-23). `codex login status` escribe por STDERR: se leen stdout y stderr juntos y solo es 'ok' si el
// texto entero, recortado, es exactamente una línea «Logged in using ChatGPT» y la salida es 0.
import { existsSync, mkdirSync, renameSync, lstatSync, openSync, readSync, closeSync, readdirSync, realpathSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, basename, sep } from 'node:path';
import { carpetaDatos, leerConfig, sello } from './rutas.mjs';
import { log } from './registro.mjs';
import { MAX_SALIDA, TIEMPO_AYUDA, resolverPrograma, dondeWindows, ejecutar as ejecutarPrograma, crearMemoria, PREFIJOS_ANTHROPIC, argumentoValidoCmd } from './proceso.mjs';
import { NOMBRE_SERVIDOR } from './herramientas/config.mjs';
export const TIEMPO_RAPIDO = 120_000;
export const TIEMPO_LISTO = 180_000;
export const TIEMPO_HERRAMIENTAS = 300_000;
const MAX_SALIDA_HERRAMIENTAS = 16 * 1024 * 1024; // con --json, stdout lleva el resultado de cada herramienta
export const MODELOS = ['rapido', 'listo'];
const ESFUERZO = { rapido: 'low', listo: 'medium' };
const NOMBRE_MODELO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/; // nunca empieza por «-»: no puede pasar por una opción
export const MAX_CUARENTENA = 200; // archivos en cuarentena/codex antes de renombrar la carpeta
const VIEJO_SALIDA = 10 * 60_000; // un resto de datos/salidas con más de 10 min no es de ninguna llamada en curso
const HERRAMIENTA = /shell|exec|browser|computer|apps?$|plugin|hook|memor|image|agent|skill|tool|sleep|goals|worktree|workspace|stdin|automation|daemon|mcp|mention|realtime|voice|dictation|chat|updates|web|search|code_mode|repl|patch|remote|artifact|undo|copy_file|network|guardian|steer/;
const NO_DESACTIVAR = new Set(['content_item_kinds', 'item_ids', 'enable_request_compression', 'incremental_tools',
    'web_search_request', 'web_search_cached', 'code_mode_host']);
const NOMBRE_FUNCION = /^[a-z0-9_.]{1,80}$/;
const ERROR_HERRAMIENTAS = 'no se pudo comprobar qué herramientas tiene Codex';
export const LINEA_MAX = 7000; // la línea de cmd.exe no puede pasar de 8191 caracteres: se deja margen
// Variables que harían pagar por uso o desviar la llamada a otro servicio (Ruling F4-24). Se quita TODA variable con estos
// prefijos, sin mirar mayúsculas: todo CODEX_* (CODEX_API_KEY, CODEX_ACCESS_TOKEN, CODEX_EXEC_SERVER_URL, CODEX_*_BASE_URL,
// CODEX_APP_SERVER_*…) salvo CODEX_HOME exacto (ahí está la sesión de ChatGPT), todo OPENAI_* (OPENAI_API_KEY,
// OPENAI_BASE_URL, OPENAI_IDENTITY_TOKEN_FILE…), AZURE_OPENAI_*, AWS_BEARER_TOKEN_* (AWS_BEARER_TOKEN_BEDROCK) y las de
// Anthropic que quita claude.mjs.
const PREFIJOS_PROHIBIDOS = ['CODEX_', 'OPENAI_', 'AZURE_OPENAI_', 'AWS_BEARER_TOKEN_', ...PREFIJOS_ANTHROPIC];
const SE_CONSERVA = new Set(['CODEX_HOME']);
/**
 * Encuentra el programa `codex`: SNF_CODEX, o el primer `.exe` de `where.exe codex` (y si no hay, el `.cmd`, que es lo
 * que deja `npm install -g @openai/codex`). Devuelve {ruta, tipo: 'exe' | 'cmd' | 'node'} o null.
 */
export function resolverCodex({ env = process.env, donde = dondeWindows } = {}) {
    return resolverPrograma('codex', 'SNF_CODEX', { env, donde });
}
/** Entorno del hijo: sin ninguna variable de pago por uso ni de otro proveedor. No modifica el entorno que recibe. */
export function entorno(env) {
    const salida = {};
    for (const [k, v] of Object.entries(env)) {
        const mayus = k.toUpperCase();
        if (SE_CONSERVA.has(mayus) || !PREFIJOS_PROHIBIDOS.some((p) => mayus.startsWith(p)))
            salida[k] = v;
    }
    return salida;
}
/** Ejecuta `codex <args>` (ver proceso.mjs). Siempre con el entorno limpio de Codex, salvo que se pase otro. */
function ejecutar(c, args, opciones = {}) {
    return ejecutarPrograma(c, args, { env: entorno(process.env), ...opciones });
}
// ---------- opciones ----------
/**
 * Funciones de herramienta de la salida de `codex features list` (una tabla «nombre  fase  true|false» por línea), en su
 * orden, estén a true o a false (Ruling F4-24: `features list` no admite --ignore-user-config y refleja el [features] del
 * usuario, pero `exec` lo ignora y usa los valores por defecto), sin las de formato. Si alguna línea no se entiende, un
 * nombre trae caracteres raros o no hay ninguna línea, devuelve null (no se puede saber qué herramientas tiene: no se lanza).
 */
export function herramientasDe(texto) {
    const lineas = String(texto).split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lineas.length === 0)
        return null;
    const activas = [];
    for (const l of lineas) {
        const m = l.match(/^\s*(\S+)\s+\S.*?\s+(true|false)\s*$/);
        if (!m || !NOMBRE_FUNCION.test(m[1]))
            return null;
        if (HERRAMIENTA.test(m[1]) && !NO_DESACTIVAR.has(m[1]))
            activas.push(m[1]);
    }
    return activas;
}
// Versión (`--version`), opciones de `codex exec --help`, si `codex login --help` tiene el comando `status` y las
// funciones de herramienta activadas (`codex features list`; `herramientas: null` si no se pudo leer).
const memoria = crearMemoria(async (c, quedan) => {
    const v = await ejecutar(c, ['--version'], { tiempoMax: quedan() });
    if (v.error)
        return { error: v.error };
    if (v.tiempo || quedan() <= 0)
        return { error: 'TIEMPO' };
    const version = (v.stdout.match(/(\d+\.\d+\.\d+[^\s]*)/) || [])[1] || v.stdout.trim().slice(0, 40);
    const h = await ejecutar(c, ['exec', '--help'], { tiempoMax: quedan() });
    if (h.error)
        return { error: h.error };
    if (h.tiempo || quedan() <= 0)
        return { error: 'TIEMPO' };
    const opciones = new Set(h.codigo === 0 ? (h.stdout + '\n' + h.stderr).match(/--[a-z][a-z-]+/g) || [] : []);
    const l = await ejecutar(c, ['login', '--help'], { tiempoMax: quedan() });
    if (l.error)
        return { error: l.error };
    if (l.tiempo || quedan() <= 0)
        return { error: 'TIEMPO' };
    if (l.codigo === 0 && /^\s+status\b/m.test(l.stdout + '\n' + l.stderr))
        opciones.add('login');
    const f = await ejecutar(c, ['features', 'list'], { tiempoMax: quedan() });
    if (f.error)
        return { error: f.error };
    if (f.tiempo)
        return { error: 'TIEMPO' };
    const herramientas = f.codigo === 0 && !f.truncado ? herramientasDe(f.stdout) : null;
    return { version, opciones, herramientas };
});
/** Olvida las opciones recordadas (solo para pruebas). */
export function olvidarOpciones() {
    memoria.olvidar();
}
function informacion(c, limite = TIEMPO_AYUDA) {
    return memoria.obtener(c, limite);
}
/** Opciones que lista `codex exec --help` (`--xxx`) y, si existe `codex login status`, 'login'. Con memoria. */
export async function detectarOpciones(c) {
    return (await informacion(c)).opciones;
}
/**
 * Nombre del modelo de config.codex[modelo]: {valido, nombre}. Vacío o ausente -> {valido: true, nombre: null} (sin -m).
 * Solo vale un texto que case con ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ (nunca empieza por «-»); cualquier otra cosa -> {valido: false, nombre: null}.
 */
export function nombreModelo(config, modelo) {
    const codex = config && typeof config === 'object' && config.codex && typeof config.codex === 'object' ? config.codex : {};
    const v = Object.hasOwn(codex, modelo) ? codex[modelo] : undefined;
    if (v === undefined || v === null || v === '')
        return { valido: true, nombre: null };
    if (typeof v === 'string' && NOMBRE_MODELO.test(v))
        return { valido: true, nombre: v };
    return { valido: false, nombre: null };
}
/**
 * Argumentos de `codex exec`. Con todas las opciones, exactamente:
 *   exec --sandbox read-only --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --color never
 *   -c mcp_servers={} -c web_search=disabled -c approval_policy=never [--disable <herramienta>]… -o <salida> [-m <nombre>]
 *   -c model_reasoning_effort=low|medium -
 * Cada opción que falta en `opciones` se quita; sin `--sandbox`, `--output-last-message`, `--config`, `--ignore-rules` o
 * `--ignore-user-config`, o sin `--disable` habiendo herramientas que desactivar, lanza un error con code 'ANTIGUO'
 * («Codex demasiado antiguo»). `herramientas` es la lista de herramientasDe(); si no es una lista de nombres
 * válidos, lanza un error con code 'HERRAMIENTAS' (herramientasDe() da la lista). `modelo` solo puede ser 'rapido' o 'listo'; si no, lanza un error.
 * Un nombre de config.codex que no es válido se ignora (nunca se pasa).
 */
export function argumentos(opciones, { modelo, salidaArchivo, config, herramientas, mcp = null }) {
    if (!MODELOS.includes(modelo))
        throw new Error('modelo no válido');
    if (!Array.isArray(herramientas) || !herramientas.every((h) => typeof h === 'string' && NOMBRE_FUNCION.test(h))) {
        throw Object.assign(new Error(ERROR_HERRAMIENTAS), { code: 'HERRAMIENTAS' });
    }
    const tiene = (o) => opciones.has(o);
    const antiguo = () => Object.assign(new Error('Codex demasiado antiguo'), { code: 'ANTIGUO' });
    if (!['--sandbox', '--output-last-message', '--config', '--ignore-user-config', '--ignore-rules'].every(tiene))
        throw antiguo();
    if (herramientas.length > 0 && !tiene('--disable'))
        throw antiguo();
    const a = ['exec', '--sandbox', 'read-only'];
    if (tiene('--skip-git-repo-check'))
        a.push('--skip-git-repo-check');
    if (tiene('--ephemeral'))
        a.push('--ephemeral');
    a.push('--ignore-user-config', '--ignore-rules');
    if (tiene('--color'))
        a.push('--color', 'never');
    if (mcp && tiene('--json'))
        a.push('--json');
    a.push('-c', 'mcp_servers={}');
    if (mcp) {
        const clave = `mcp_servers.${NOMBRE_SERVIDOR}`;
        const listaToml = (v) => `[${v.map((x) => `'${x}'`).join(',')}]`;
        a.push('-c', `${clave}.command='${mcp.command}'`, '-c', `${clave}.args=${listaToml(mcp.args)}`, '-c', `${clave}.enabled_tools=${listaToml(mcp.nombres)}`, '-c', `${clave}.default_tools_approval_mode=approve`);
    }
    a.push('-c', 'web_search=live', '-c', 'approval_policy=never');
    for (const h of herramientas)
        a.push('--disable', h);
    a.push('-o', salidaArchivo);
    const { nombre } = nombreModelo(config, modelo);
    if (nombre && tiene('--model'))
        a.push('-m', nombre);
    a.push('-c', `model_reasoning_effort=${mcp ? 'medium' : ESFUERZO[modelo]}`);
    a.push('-');
    return a;
}
/** ¿Se puede pasar este servidor en la línea? Sin comilla simple ni saltos y, con codex.cmd, sin lo que cmd.exe no deja. */
export function mcpUsable(c, mcp) {
    const valores = [mcp.command, ...mcp.args];
    return valores.every((v) => typeof v === 'string' && !/['\r\n]/.test(v) && (c?.tipo !== 'cmd' || argumentoValidoCmd(v)));
}
/** De la salida `--json`: cuántas llamadas a nuestro servidor acabaron bien y si no pudo usarlo (falló y ninguna fue bien). */
export function resumenEventos(texto) {
    let usadas = 0;
    let fallo = false;
    for (const linea of String(texto).split(/\r?\n/)) {
        if (!linea.startsWith('{'))
            continue;
        let item;
        try {
            const o = JSON.parse(linea);
            if (o?.type !== 'item.completed')
                continue;
            item = o.item;
        }
        catch {
            continue;
        }
        if (item?.type === 'mcp_tool_call' && item.server === NOMBRE_SERVIDOR) {
            if (item.status === 'completed')
                usadas++;
            else
                fallo = true;
        }
        else if (item?.type === 'error' && String(item.message ?? item.error?.message ?? '').includes(NOMBRE_SERVIDOR)) {
            fallo = true;
        }
    }
    return { usadas, mcpFallo: usadas === 0 && fallo };
}
// ---------- comprobar la cuenta (codex login status) ----------
const MOTIVO_DESCONOCIDO = 'no se pudo comprobar la cuenta';
const POSITIVO = /^\s*Logged in using ChatGPT\s*$/i;
const PAGO = /api[-_ ]?key|OPENAI_API_KEY|azure|base url|base_url|proxy|organization key|bedrock/i;
const CLAVES_SESION = ['logged_in', 'loggedIn'];
const CLAVES_MODO = ['auth_mode', 'authMode', 'auth_method', 'authMethod', 'mode', 'method'];
// JSON: solo si el texto entero (recortado) es un único objeto con logged_in/auth_mode…; si no, null.
function clasificarJson(codigo, texto) {
    let j;
    try {
        j = JSON.parse(texto);
    }
    catch {
        return null;
    }
    if (!j || typeof j !== 'object' || Array.isArray(j) || ![...CLAVES_SESION, ...CLAVES_MODO].some((k) => k in j))
        return null;
    // Ruling F4-24: TODAS las claves de modo presentes tienen que ser «chatgpt» y logged_in true (o ausente).
    const sesiones = CLAVES_SESION.filter((k) => k in j).map((k) => j[k]);
    const modos = CLAVES_MODO.filter((k) => k in j).map((k) => j[k]);
    if (sesiones.some((v) => v === false))
        return 'sin_sesion';
    const pago = PAGO.test(JSON.stringify(j)) || modos.some((m) => typeof m === 'string' && /api/i.test(m));
    const todoChatgpt = modos.length > 0 && modos.every((m) => typeof m === 'string' && m.toLowerCase() === 'chatgpt');
    if (todoChatgpt && sesiones.every((v) => v === true) && codigo === 0 && !pago)
        return 'ok';
    if (pago)
        return 'pago_por_uso';
    return 'desconocido';
}
/**
 * Clasifica la salida de `codex login status`: stdout y stderr JUNTOS (el real escribe por stderr; Ruling F4-23), con
 * lista blanca:
 * - 'ok' solo si el texto entero, recortado, es exactamente UNA línea «Logged in using ChatGPT» (sin mirar mayúsculas) y
 *   la salida es 0. Cualquier línea de más, aunque sea un aviso, ya no es 'ok'.
 * - «not logged in» -> 'sin_sesion'; si menciona api key, apikey, api_key, OPENAI_API_KEY, azure, base url, proxy,
 *   organization key o bedrock -> 'pago_por_uso'; el positivo con algo más o con salida distinta de 0 -> 'desconocido';
 *   salida distinta de 0 sin positivo -> 'sin_sesion'; el resto (workload identity, access token…) -> 'desconocido'.
 * - Con `--json`, si el texto entero es un único objeto: `logged_in: false` -> 'sin_sesion'; modo ChatGPT con salida 0 y
 *   sin términos de pago -> 'ok'; modo con «api» o términos de pago -> 'pago_por_uso'; lo demás -> 'desconocido'.
 */
export function clasificarLogin(codigo, salida) {
    const texto = String(salida).trim();
    const porJson = clasificarJson(codigo, texto);
    if (porJson)
        return porJson;
    const lineas = texto.split(/\r?\n/);
    const positivo = lineas.some((l) => POSITIVO.test(l));
    const pago = PAGO.test(lineas.filter((l) => !POSITIVO.test(l)).join('\n'));
    if (lineas.length === 1 && positivo && codigo === 0)
        return 'ok';
    if (/not logged in/i.test(texto))
        return 'sin_sesion';
    if (pago)
        return 'pago_por_uso';
    if (positivo)
        return 'desconocido';
    if (codigo !== 0)
        return 'sin_sesion';
    return 'desconocido';
}
const ERRORES_ARRANQUE = {
    ENOENT: ['sin_instalar', 'codex no está en este PC'],
    TIEMPO: ['tiempo', 'tiempo agotado'],
    ARG_NO_VALIDO: ['fallo', 'la ruta de Codex o de los datos tiene caracteres no admitidos (& ! % ^ …); instala Codex o mueve la carpeta de datos a una ruta sin esos caracteres'],
    TRABAJO: ['fallo', 'la carpeta de trabajo no es de SnetForever'],
    DATOS: ['fallo', 'carpeta de datos no válida'],
};
/**
 * Estado de Codex en este PC: {estado, version?, motivo?}.
 * IMPORTANTE para el núcleo (tareas 15c y 18): NO debe llamar a `preguntar` si `comprobar()` no dio 'ok'. Con
 * 'desconocido' hay que explicar `motivo` con el texto `desconocido` de textos.mjs (motor 'codex').
 */
export async function comprobar(c) {
    if (!c || !existsSync(c.ruta))
        return { estado: 'sin_instalar' };
    const info = await informacion(c);
    if (info.error === 'ENOENT')
        return { estado: 'sin_instalar' };
    if (info.error)
        return { estado: 'desconocido', motivo: (ERRORES_ARRANQUE[info.error] || [])[1] || MOTIVO_DESCONOCIDO };
    if (!info.opciones.has('login'))
        return { estado: 'desconocido', version: info.version, motivo: MOTIVO_DESCONOCIDO };
    if (info.loginJson === undefined) {
        // ¿`login status` sabe dar JSON? Se mira una sola vez en su ayuda.
        const ayuda = await ejecutar(c, ['login', 'status', '--help']);
        info.loginJson = !ayuda.error && !ayuda.tiempo && ayuda.codigo === 0 && /--json\b/.test(ayuda.stdout + ayuda.stderr);
    }
    const r = await ejecutar(c, info.loginJson ? ['login', 'status', '--json'] : ['login', 'status']);
    if (r.error === 'ENOENT')
        return { estado: 'sin_instalar' };
    if (r.error)
        return { estado: 'desconocido', version: info.version, motivo: (ERRORES_ARRANQUE[r.error] || [])[1] || MOTIVO_DESCONOCIDO };
    if (r.tiempo || r.truncado)
        return { estado: 'desconocido', version: info.version, motivo: MOTIVO_DESCONOCIDO };
    const estado = clasificarLogin(r.codigo, `${r.stdout}\n${r.stderr}`); // el real escribe por stderr
    log('info', `codex comprobar: ${estado} (versión ${info.version})`);
    return estado === 'desconocido' ? { estado, version: info.version, motivo: MOTIVO_DESCONOCIDO } : { estado, version: info.version };
}
// ---------- preguntar ----------
const ERROR_SESION = /not logged in|login|unauthorized|401/i;
const ERROR_LIMITE = /usage limit|rate limit|quota|429|too many requests/i;
const corto = (t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 120);
// Tipo y detalle de un `codex exec` que salió con código distinto de 0 (Ruling F4-24, ronda 2). Codex repite la pregunta
// por stderr, así que SOLO cuentan las líneas que empiezan exactamente por «ERROR:» (en mayúsculas, como las escribe
// Codex), en stdout o en stderr. Sin ninguna, es 'fallo' con el detalle «código N» (nada del texto de la pregunta).
function errorDeCodex(r) {
    const errores = `${r.stderr}\n${r.stdout}`.split(/\r?\n/).filter((l) => l.startsWith('ERROR:'));
    if (errores.length === 0)
        return { tipo: 'fallo', detalle: `código ${r.codigo}` };
    const mirar = errores.join('\n');
    const tipo = ERROR_SESION.test(mirar) ? 'sin_sesion' : ERROR_LIMITE.test(mirar) ? 'limite' : 'fallo';
    return { tipo, detalle: corto(errores[errores.length - 1]) };
}
const largoLinea = (c, args) => [c.ruta, ...args].reduce((n, a) => n + String(a).length + 3, 0);
function fallar(tipo, detalle, t0) {
    log('aviso', `codex fallo ${tipo} en ${Date.now() - t0} ms`);
    return { ok: false, tipo, detalle };
}
// Carpeta propia dentro de los datos: se crea si falta y tiene que ser una carpeta de verdad (no un enlace ni una unión)
// cuya ruta real quede dentro de la ruta real de la carpeta de datos. Si no, lanza un error.
function carpetaPropia(datos, dir) {
    mkdirSync(dir, { recursive: true });
    const st = lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink())
        throw new Error('no es una carpeta propia');
    const real = realpathSync.native(dir).toLowerCase();
    const base = realpathSync.native(datos).toLowerCase();
    if (!real.startsWith(base.endsWith(sep) ? base : base + sep))
        throw new Error('fuera de la carpeta de datos');
    return dir;
}
// datos/salidas: carpeta propia para los archivos -o.
function carpetaSalidas(datos) {
    return carpetaPropia(datos, join(datos, 'salidas'));
}
// Lee el archivo -o: como mucho 1 MB (si hay más, 'respuesta demasiado grande'). {texto} o {error}.
function leerSalida(ruta) {
    let st;
    try {
        st = lstatSync(ruta);
    }
    catch {
        return { error: 'respuesta ilegible' };
    }
    if (!st.isFile())
        return { error: 'respuesta ilegible' };
    const b = Buffer.alloc(MAX_SALIDA + 1);
    let leidos = 0;
    const fd = openSync(ruta, 'r');
    try {
        for (let n = 1; n > 0 && leidos < b.length; leidos += n)
            n = readSync(fd, b, leidos, b.length - leidos, null);
    }
    finally {
        closeSync(fd);
    }
    if (leidos > MAX_SALIDA)
        return { error: 'respuesta demasiado grande' };
    const texto = b.subarray(0, leidos).toString('utf8').replace(/\s+$/, '');
    if (!texto.trim())
        return { error: 'respuesta vacía' };
    return { texto };
}
// El archivo -o no se borra: se renombra a datos/cuarentena/codex (una sola carpeta para todos).
function aCuarentena(datos, ruta) {
    try {
        lstatSync(ruta);
    }
    catch {
        return; // no llegó a escribirse
    }
    try {
        // cuarentena y cuarentena/codex tienen que ser carpetas propias dentro de los datos (ni enlaces ni uniones)
        carpetaPropia(datos, join(datos, 'cuarentena'));
        const carpeta = carpetaPropia(datos, join(datos, 'cuarentena', 'codex'));
        renameSync(ruta, join(carpeta, basename(ruta)));
    }
    catch {
        // si no se puede mover se queda donde está
    }
}
// Para que nada crezca sin límite (sin borrar nunca): si cuarentena/codex ya tiene MAX_CUARENTENA archivos, la carpeta
// entera se renombra a cuarentena/codex-<sello> (con -1, -2… si ya existe); después, los restos de datos/salidas con más
// de 10 minutos (de llamadas que no terminaron) se llevan a cuarentena/codex. Los recientes pueden ser de otra llamada en
// curso y se dejan.
function ordenarSalidas(datos, salidas) {
    const base = join(datos, 'cuarentena');
    const cuarentena = join(base, 'codex');
    try {
        if (existsSync(cuarentena) && readdirSync(cuarentena).length >= MAX_CUARENTENA) {
            const s = sello();
            let destino = join(base, `codex-${s}`);
            for (let i = 1; existsSync(destino); i++)
                destino = join(base, `codex-${s}-${i}`);
            renameSync(cuarentena, destino);
        }
    }
    catch {
        // si no se puede renombrar, se sigue con la que hay
    }
    const ahora = Date.now();
    for (const nombre of readdirSync(salidas)) {
        const ruta = join(salidas, nombre);
        try {
            if (ahora - lstatSync(ruta).mtimeMs > VIEJO_SALIDA)
                aCuarentena(datos, ruta);
        }
        catch {
            // ya no está
        }
    }
}
/**
 * Hace una pregunta a Codex, sin estado. `modelo`: 'rapido' o 'listo' (otro valor da {ok: false, tipo: 'fallo',
 * detalle: 'modelo no válido'} sin lanzar nada). `config` (por defecto datos/config.json) da el nombre del modelo en
 * config.codex.rapido / config.codex.listo; si no es válido, fallo sin lanzar nada. El tiempo máximo por defecto es de
 * 120 s con el rápido y 180 s con el listo, y cuenta también la detección de opciones.
 */
export async function preguntar(c, { modelo, sistema, entrada, tiempoMax, config, mcp: mcpPedido = null } = {}) {
    const t0 = Date.now();
    if (!MODELOS.includes(modelo))
        return fallar('fallo', 'modelo no válido', t0);
    const ajustes = config === undefined ? leerConfig() : config;
    if (!nombreModelo(ajustes, modelo).valido)
        return fallar('fallo', 'nombre de modelo no válido en config.codex', t0);
    if (!c || !existsSync(c.ruta))
        return fallar('sin_instalar', 'codex no está en este PC', t0);
    let mcp = mcpPedido && mcpUsable(c, mcpPedido) ? mcpPedido : null;
    const limite = tiempoMax ?? (mcp ? TIEMPO_HERRAMIENTAS : modelo === 'listo' ? TIEMPO_LISTO : TIEMPO_RAPIDO);
    const info = await informacion(c, limite);
    if (info.error) {
        const [tipo, detalle] = ERRORES_ARRANQUE[info.error] || ['fallo', `no se pudo arrancar (${info.error})`];
        return fallar(tipo, detalle, t0);
    }
    const datos = carpetaDatos();
    const salidaArchivo = join(datos, 'salidas', `codex-${randomBytes(6).toString('hex')}.txt`); // uno por llamada
    let args;
    try {
        args = argumentos(info.opciones, { modelo, salidaArchivo, config: ajustes, herramientas: info.herramientas, mcp });
        // Sin sitio en la línea para el servidor, la pregunta sigue sin herramientas.
        if (mcp && largoLinea(c, args) > LINEA_MAX) {
            mcp = null;
            args = argumentos(info.opciones, { modelo, salidaArchivo, config: ajustes, herramientas: info.herramientas });
        }
    }
    catch (e) {
        const detalle = { ANTIGUO: 'Codex demasiado antiguo', HERRAMIENTAS: ERROR_HERRAMIENTAS }[e.code] || 'modelo no válido';
        return fallar('fallo', detalle, t0);
    }
    // La línea de cmd.exe tiene un tope de 8191 caracteres: con margen, no se lanza si se pasa de LINEA_MAX.
    if (largoLinea(c, args) > LINEA_MAX)
        return fallar('fallo', 'línea de órdenes demasiado larga', t0);
    try {
        mkdirSync(datos, { recursive: true });
        ordenarSalidas(datos, carpetaSalidas(datos));
        if (existsSync(salidaArchivo))
            throw new Error('el archivo de salida ya existe');
    }
    catch {
        return fallar('fallo', 'carpeta de datos no válida', t0);
    }
    const quedan = limite - (Date.now() - t0);
    if (quedan <= 0)
        return fallar('tiempo', 'tiempo agotado', t0);
    let r;
    let leido = null;
    try {
        r = await ejecutar(c, args, { entrada: `${sistema}\n\n${entrada}`, tiempoMax: quedan, ...(mcp ? { maxBytes: MAX_SALIDA_HERRAMIENTAS } : {}) });
        if (!r.error && !r.tiempo && !r.truncado && r.codigo === 0)
            leido = leerSalida(salidaArchivo);
    }
    catch {
        leido = { error: 'respuesta ilegible' };
    }
    finally {
        aCuarentena(datos, salidaArchivo);
    }
    if (r && r.error) {
        const [tipo, detalle] = ERRORES_ARRANQUE[r.error] || ['fallo', `no se pudo arrancar (${r.error})`];
        return fallar(tipo, detalle, t0);
    }
    if (r && r.tiempo)
        return fallar('tiempo', 'tiempo agotado', t0);
    if (r && r.truncado)
        return fallar('fallo', 'respuesta demasiado grande', t0);
    if (r && r.codigo !== 0) {
        const { tipo, detalle } = errorDeCodex(r);
        return fallar(tipo, detalle, t0);
    }
    if (!leido || leido.error)
        return fallar('fallo', (leido && leido.error) || 'respuesta ilegible', t0);
    const ms = Date.now() - t0;
    if (!mcp) {
        log('info', `codex ${modelo} respondió en ${ms} ms`);
        return { ok: true, texto: leido.texto, ms, ...(mcpPedido ? { sinHerramientas: true } : {}) };
    }
    const resumen = resumenEventos(r.stdout);
    log('info', `codex ${modelo} respondió en ${ms} ms (herramientas: ${resumen.usadas}${resumen.mcpFallo ? ', no se pudieron usar' : ''})`);
    return { ok: true, texto: leido.texto, ms, ...resumen };
}
