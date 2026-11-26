// Mecánica común para lanzar los programas de IA del PC (Claude Code y Codex): buscar el programa, lanzarlo sin
// inyección por cmd.exe, matarlo por su PID (nunca por nombre), limitar la salida a 1 MB y recordar las opciones
// detectadas. La usan claude.mjs y codex.mjs; aquí no hay nada propio de ningún proveedor.
import { spawn, spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { carpetaTrabajo, despejarTrabajo } from './rutas.mjs';
export const MAX_SALIDA = 1024 * 1024; // como mucho 1 MB de salida de la IA
export const TIEMPO_AYUDA = 30_000;
// Prefijos de las variables de Anthropic que harían pagar por uso o desviar la llamada (se quitan, sin mirar mayúsculas,
// en el entorno de los dos motores; claude.mjs conserva CLAUDE_CODE_OAUTH_TOKEN, que no casa con ninguno).
export const PREFIJOS_ANTHROPIC = ['ANTHROPIC_', 'CLAUDE_CODE_USE_', 'CLAUDE_CODE_API_KEY_'];
const VIDA_OPCIONES = 10 * 60_000; // las opciones detectadas se recuerdan 10 minutos (mientras no cambie el programa)
// Programas de Windows con ruta absoluta (nunca se busca cmd.exe, taskkill ni where.exe en el PATH).
export function sistema32(nombre) {
    return join(process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows', 'System32', nombre);
}
export function tipoDe(ruta) {
    const e = extname(ruta).toLowerCase();
    if (e === '.cmd' || e === '.bat')
        return 'cmd';
    if (e === '.mjs' || e === '.js')
        return 'node';
    return 'exe';
}
export function dondeWindows(nombre) {
    try {
        const r = spawnSync(sistema32('where.exe'), [nombre], { encoding: 'utf8', windowsHide: true });
        if (r.status !== 0 || !r.stdout)
            return [];
        return r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    }
    catch {
        return [];
    }
}
/**
 * Encuentra un programa: la variable `variable` del entorno (p. ej. SNF_CLAUDE), o el primer `.exe` de `where.exe
 * <nombre>` (y si no hay, el `.cmd`). Devuelve {ruta, tipo: 'exe' | 'cmd' | 'node'} o null. El tipo 'node' (un .mjs/.js)
 * solo sirve para las pruebas.
 */
export function resolverPrograma(nombre, variable, { env = process.env, donde = dondeWindows } = {}) {
    if (env[variable])
        return { ruta: env[variable], tipo: tipoDe(env[variable]) };
    const lista = (donde(nombre) || []).filter(Boolean);
    const termina = (x) => lista.find((r) => r.toLowerCase().endsWith(x));
    const exe = termina('.exe');
    if (exe)
        return { ruta: exe, tipo: 'exe' };
    const cmd = termina('.cmd');
    if (cmd)
        return { ruta: cmd, tipo: 'cmd' };
    return null;
}
// ---------- lanzar el proceso ----------
const PELIGROSOS_CMD = /["%^&|<>!\r\n]/;
/** Un argumento puede ir en la línea de cmd.exe solo si no tiene `"`, `%`, `^`, `&`, `|`, `<`, `>`, `!`, CR ni LF. */
export function argumentoValidoCmd(a) {
    return !PELIGROSOS_CMD.test(String(a));
}
const comillas = (a) => `"${a}"`;
function lanzar(c, args, env) {
    const base = { cwd: carpetaTrabajo(), env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] };
    if (c.tipo === 'cmd') {
        // En cmd.exe no hay forma fiable de escapar: lo que no sea seguro no se lanza.
        if (![c.ruta, ...args].every(argumentoValidoCmd))
            throw Object.assign(new Error('argumento no válido para cmd.exe'), { code: 'ARG_NO_VALIDO' });
        // cmd.exe /d /s /c "<ruta> <args entre comillas>": las comillas dobles conservan también la cadena vacía.
        const linea = [comillas(c.ruta), ...args.map(comillas)].join(' ');
        return spawn(sistema32('cmd.exe'), ['/d', '/s', '/c', `"${linea}"`], { ...base, windowsVerbatimArguments: true });
    }
    if (c.tipo === 'node')
        return spawn(process.execPath, [c.ruta, ...args], base);
    return spawn(c.ruta, args, base);
}
/** Mata al hijo por su PID (en Windows, con su árbol: hay cmd.exe de por medio). Nunca por nombre. */
export function matar(hijo) {
    try {
        if (process.platform === 'win32' && hijo.pid) {
            // Con cmd.exe de por medio hay que cerrar todo el árbol de procesos.
            spawnSync(sistema32('taskkill.exe'), ['/pid', String(hijo.pid), '/t', '/f'], { windowsHide: true });
        }
        else {
            hijo.kill('SIGKILL');
        }
    }
    catch {
        // ya no existe
    }
    try {
        hijo.kill();
    }
    catch {
        // ya no existe
    }
}
/**
 * Ejecuta `<programa> <args>` en la carpeta de trabajo (antes se despeja) con el entorno `env`, que es obligatorio
 * (cada motor pasa el suyo, ya limpio). Resuelve siempre: {codigo, stdout, stderr, tiempo, truncado, error}.
 */
export function ejecutar(c, args, { entrada, tiempoMax = TIEMPO_AYUDA, env, maxBytes = MAX_SALIDA } = {}) {
    return new Promise((resolver) => {
        let hijo;
        try {
            if (!env)
                throw Object.assign(new Error('falta el entorno'), { code: 'SIN_ENTORNO' });
            try {
                despejarTrabajo(); // la IA siempre se lanza en una carpeta vacía
            }
            catch (e) {
                throw Object.assign(new Error('carpeta de trabajo'), { code: e.code === 'DATOS' ? 'DATOS' : 'TRABAJO' });
            }
            hijo = lanzar(c, args, env);
        }
        catch (e) {
            resolver({ codigo: null, stdout: '', stderr: '', tiempo: false, truncado: false, error: e.code || 'SPAWN' });
            return;
        }
        const trozos = { stdout: [], stderr: [] };
        const bytes = { stdout: 0, stderr: 0 };
        let truncado = false;
        let tiempo = false;
        let error = null;
        let terminado = false;
        const recoger = (que) => (b) => {
            if (bytes[que] >= maxBytes) {
                if (!truncado) {
                    truncado = true;
                    matar(hijo);
                }
                return;
            }
            const resto = maxBytes - bytes[que];
            const parte = b.length > resto ? b.subarray(0, resto) : b;
            trozos[que].push(parte);
            bytes[que] += parte.length;
            if (b.length > resto) {
                truncado = true;
                matar(hijo);
            }
        };
        hijo.stdout.on('data', recoger('stdout'));
        hijo.stderr.on('data', recoger('stderr'));
        const fin = (codigo) => {
            if (terminado)
                return;
            terminado = true;
            clearTimeout(reloj);
            clearTimeout(rematar);
            resolver({
                codigo,
                stdout: Buffer.concat(trozos.stdout).toString('utf8'),
                stderr: Buffer.concat(trozos.stderr).toString('utf8'),
                tiempo,
                truncado,
                error,
            });
        };
        let rematar = null;
        const reloj = setTimeout(() => {
            tiempo = true;
            matar(hijo);
            rematar = setTimeout(() => fin(null), 3000); // si el cierre no llega, se da por muerto igualmente
        }, tiempoMax);
        hijo.on('error', (e) => {
            error = e.code || 'ERROR';
            fin(null);
        });
        hijo.on('close', (codigo) => fin(codigo));
        hijo.stdin.on('error', () => { }); // el hijo puede cerrar antes de leer todo
        hijo.stdin.end(entrada === undefined ? undefined : Buffer.from(entrada, 'utf8'));
    });
}
// ---------- JSON dentro de un texto ----------
// Objeto JSON que empieza en `inicio`: hasta su `}` emparejado (sin contar llaves dentro de cadenas). {valor, fin} o null.
function objetoJsonDesde(texto, inicio) {
    let profundidad = 0;
    let enCadena = false;
    let escape = false;
    for (let i = inicio; i < texto.length; i++) {
        const ch = texto[i];
        if (enCadena) {
            if (escape)
                escape = false;
            else if (ch === '\\')
                escape = true;
            else if (ch === '"')
                enCadena = false;
        }
        else if (ch === '"')
            enCadena = true;
        else if (ch === '{')
            profundidad++;
        else if (ch === '}' && --profundidad === 0) {
            try {
                return { valor: JSON.parse(texto.slice(inicio, i + 1)), fin: i + 1 };
            }
            catch {
                return null;
            }
        }
    }
    return null;
}
/**
 * Todos los objetos JSON `{…}` del texto, aunque haya líneas de aviso antes, entre ellos o después (los de dentro de
 * otro objeto no cuentan aparte). Sirve para leer la salida de `auth status` / `login status`.
 */
export function objetosJson(texto) {
    const lista = [];
    let desde = 0;
    for (;;) {
        const inicio = texto.indexOf('{', desde);
        if (inicio < 0)
            return lista;
        const o = objetoJsonDesde(texto, inicio);
        if (!o) {
            desde = inicio + 1;
            continue;
        }
        if (o.valor && typeof o.valor === 'object' && !Array.isArray(o.valor))
            lista.push(o.valor);
        desde = o.fin;
    }
}
// ---------- memoria de opciones ----------
/**
 * Memoria de la información de un programa (versión, opciones…). `detectar(c, quedan)` la obtiene ejecutando el
 * programa (`quedan()` da el tiempo que le queda, ya recortado a 30 s) y devuelve un objeto o {error}. Se recuerda por
 * ruta mientras el programa no cambie (misma fecha de modificación) y no pasen 10 minutos. `limite` es el tiempo máximo
 * que se le deja a la detección (cuenta dentro del tiempo de la pregunta). Si falla, {error, opciones: Set vacío}.
 */
export function crearMemoria(detectar) {
    const mapa = new Map(); // ruta -> {mtime, t, ...información}
    return {
        olvidar() {
            mapa.clear();
        },
        async obtener(c, limite = TIEMPO_AYUDA) {
            const inicio = Date.now();
            let mtime = 0;
            try {
                mtime = statSync(c.ruta).mtimeMs;
            }
            catch {
                // sin fecha: no se recuerda
            }
            const previo = mapa.get(c.ruta);
            if (previo && previo.mtime === mtime && Date.now() - previo.t < VIDA_OPCIONES)
                return previo;
            const fallo = (error) => ({ error, opciones: new Set() });
            const quedan = () => Math.min(TIEMPO_AYUDA, limite - (Date.now() - inicio));
            if (quedan() <= 0)
                return fallo('TIEMPO');
            const r = await detectar(c, quedan);
            if (r.error)
                return fallo(r.error);
            const nuevo = { ...r, mtime, t: Date.now() };
            mapa.set(c.ruta, nuevo);
            return nuevo;
        },
    };
}
/**
 * Qué se sabe de un proceso por su pid (para el cerrojo de la app): `{vive: false}` si no existe, o
 * `{vive: true, nombre?, inicio?}` (nombre sin `.exe`; inicio en ms desde 1970). Lo que no se pueda saber no se inventa: queda
 * sin poner y quien llama lo trata como «vivo», que es lo seguro. Fuera de Windows solo dice si vive.
 * `consultar(pid)` existe para las pruebas y devuelve el texto «nombre|inicio ISO».
 */
export function infoProceso(pid, { consultar = consultarWindows } = {}) {
    if (!Number.isInteger(pid) || pid <= 0)
        return { vive: false };
    try {
        process.kill(pid, 0);
    }
    catch (e) {
        if (e.code === 'ESRCH')
            return { vive: false };
        // EPERM: existe pero no es nuestro
    }
    const info = { vive: true };
    try {
        const texto = consultar(pid);
        // «nombre|inicio»: el nombre siempre se puede leer; el inicio puede faltar (un proceso protegido niega StartTime).
        const m = /^([^|]+)\|(\S*)\s*$/.exec(String(texto ?? '').trim());
        if (m) {
            info.nombre = m[1];
            const inicio = m[2] ? Date.parse(m[2]) : NaN;
            if (Number.isFinite(inicio))
                info.inicio = inicio;
        }
    }
    catch {
        // no se pudo saber
    }
    return info;
}
function consultarWindows(pid) {
    if (process.platform !== 'win32')
        return '';
    // El nombre y el inicio se piden por separado: con un proceso protegido (svchost, System) StartTime da «acceso denegado».
    const orden = `$p = Get-Process -Id ${Number(pid)} -ErrorAction Stop; $i = ''; try { $i = $p.StartTime.ToUniversalTime().ToString('o') } catch { }; [Console]::Out.Write($p.ProcessName + '|' + $i)`;
    const r = spawnSync(sistema32(join('WindowsPowerShell', 'v1.0', 'powershell.exe')), ['-NoProfile', '-NonInteractive', '-Command', orden], {
        encoding: 'utf8', windowsHide: true, timeout: 15_000,
    });
    return r.status === 0 ? r.stdout : '';
}
