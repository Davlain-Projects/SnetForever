// Lo que la app abre fuera de sí misma para los avisos de fallo (fase 5, tarea 11): el navegador con la URL de una issue
// nueva de GitHub, el Explorador en una carpeta de datos y el portapapeles de Windows. Siempre con la ruta completa del
// programa de Windows (nunca se busca en el PATH ni en la carpeta de trabajo), sin shell y solo con lo que se espera:
//   · abrirUrl: solo `https://github.com/<repo>/issues/new?…`, con `<SystemRoot>\explorer.exe`;
//   · abrirCarpeta: solo carpetas dentro de la carpeta de datos, con `<SystemRoot>\explorer.exe`;
//   · copiarAlPortapapeles: `<SystemRoot>\System32\clip.exe`, con el texto en UTF-16LE y BOM por la entrada estándar;
//   · leerPortapapeles: `<SystemRoot>\System32\WindowsPowerShell\v1.0\powershell.exe` con `Get-Clipboard -Raw`, sin ventana.
// `lanzar` (spawn) y `env` (process.env) solo se cambian en las pruebas.
import { spawn } from 'node:child_process';
import { statSync, realpathSync } from 'node:fs';
import { resolve, sep, win32 } from 'node:path';
import { carpetaDatos } from './rutas.mjs';
import { repoDe } from './actualizar/origen.mjs';
import { MAX_URL } from './avisos.mjs';

const windows = (env) => env.SystemRoot || env.SYSTEMROOT || env.windir || 'C:\\Windows';
const explorer = (env) => win32.join(windows(env), 'explorer.exe');

// Separado, sin consola propia y sin esperar: un error al lanzar (p. ej. ENOENT) se escucha para que no tumbe la app.
function abrirCon(lanzar, exe, args) {
  try {
    const hijo = lanzar(exe, args, { detached: true, stdio: 'ignore', shell: false });
    hijo?.on?.('error', () => {});
    hijo?.unref?.();
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre `url` en el navegador del jugador (explorer.exe la pasa al navegador por defecto) solo si es una issue nueva del
 * repositorio: empieza por `https://github.com/<repoDe(repo)>/issues/new?`, mide MAX_URL como mucho y solo lleva
 * caracteres de URL (sin espacios, comillas ni controles). Si no, o si no se puede lanzar, da false y no lanza nada.
 * @param {string} url
 * @param {{repo?: string, lanzar?: Function, env?: object}} [p]
 */
export function abrirUrl(url: string, { repo, lanzar = spawn, env = process.env }: { repo?: any; lanzar?: typeof spawn; env?: typeof process.env; } = {}) {
  if (typeof url !== 'string' || url.length > MAX_URL) return false;
  if (!/^[\x21-\x7e]+$/.test(url) || /["'<>\\^`{|}]/.test(url)) return false;
  const prefijo = `https://github.com/${repoDe({ actualizaciones: { repo } })}/issues/new?`;
  if (!url.startsWith(prefijo)) return false;
  return abrirCon(lanzar, explorer(env), [url]);
}

const dentroDe = (base, ruta) => {
  const b = base.toLowerCase();
  const r = ruta.toLowerCase();
  return r === b || r.startsWith(b.endsWith(sep) ? b : b + sep);
};

/**
 * Abre el Explorador en `ruta` solo si es una carpeta que existe dentro de la carpeta de datos (también por su ruta real:
 * un enlace que lleva fuera no vale). Un archivo no se abre nunca (se abriría con su programa). Da true si se lanzó.
 * @param {string} ruta
 * @param {{env?: object, lanzar?: Function}} [p]
 */
export function abrirCarpeta(ruta: string, { env = process.env, lanzar = spawn } = {}) {
  if (typeof ruta !== 'string' || ruta.length === 0) return false;
  const datos = resolve(carpetaDatos(env));
  const destino = resolve(ruta);
  if (!dentroDe(datos, destino)) return false;
  try {
    if (!statSync(destino).isDirectory()) return false;
    if (!dentroDe(realpathSync.native(datos), realpathSync.native(destino))) return false;
  } catch {
    return false;
  }
  return abrirCon(lanzar, explorer(env), [destino]);
}

const BOM_UTF16LE = Buffer.from([0xff, 0xfe]);

/**
 * Copia `texto` al portapapeles de Windows con `<SystemRoot>\System32\clip.exe` (va con Windows; sin dependencias). El
 * texto va en UTF-16LE con BOM, para que clip.exe no estropee las tildes ni la ñ. Da una promesa: true si clip.exe salió
 * con 0, false si no arrancó, falló o tardó más de `tiempoMax` ms (entonces se cierra ese mismo proceso).
 * @param {string} texto
 * @param {{lanzar?: Function, env?: object, tiempoMax?: number}} [p]
 * @returns {Promise<boolean>}
 */
export function copiarAlPortapapeles(texto: string, { lanzar = spawn, env = process.env, tiempoMax = 10_000 } = {}) {
  if (typeof texto !== 'string') return Promise.resolve(false);
  return new Promise((resolver) => {
    let reloj = null;
    let hecho = false;
    const fin = (bien) => {
      if (hecho) return;
      hecho = true;
      if (reloj) clearTimeout(reloj);
      resolver(bien);
    };
    let hijo;
    try {
      hijo = lanzar(win32.join(windows(env), 'System32', 'clip.exe'), [], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true, shell: false });
    } catch {
      fin(false);
      return;
    }
    reloj = setTimeout(() => {
      try {
        hijo.kill();
      } catch {
        // ya había salido
      }
      fin(false);
    }, tiempoMax);
    reloj.unref?.();
    hijo.on('error', () => fin(false));
    hijo.on('close', (codigo) => fin(codigo === 0));
    hijo.stdin?.on?.('error', () => fin(false));
    hijo.stdin?.end(Buffer.concat([BOM_UTF16LE, Buffer.from(texto, 'utf16le')]));
  });
}

export const MAX_PORTAPAPELES = 64 * 1024; // lo que se lee del portapapeles como mucho (caracteres)
const ORDEN_LEER = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw';

/**
 * Lee el texto del portapapeles de Windows con PowerShell (`Get-Clipboard -Raw`, ruta completa, sin ventana ni shell). Da
 * una promesa: el texto (sin el salto de línea que añade PowerShell al final y de MAX_PORTAPAPELES caracteres como mucho;
 * '' si no hay texto) o null si PowerShell no arrancó, falló o tardó más de `tiempoMax` ms (entonces se cierra ese mismo
 * proceso). Aquí no se apunta nada: el texto es del jugador.
 * @param {{lanzar?: Function, env?: object, tiempoMax?: number}} [p]
 * @returns {Promise<string | null>}
 */
export function leerPortapapeles({ lanzar = spawn, env = process.env, tiempoMax = 10_000 } = {}) {
  return new Promise((resolver) => {
    let reloj = null;
    let hecho = false;
    const trozos = [];
    let bytes = 0;
    const fin = (valor) => {
      if (hecho) return;
      hecho = true;
      if (reloj) clearTimeout(reloj);
      resolver(valor);
    };
    let hijo;
    try {
      hijo = lanzar(
        win32.join(windows(env), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-Command', ORDEN_LEER],
        { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, shell: false },
      );
    } catch {
      fin(null);
      return;
    }
    reloj = setTimeout(() => {
      try {
        hijo.kill();
      } catch {
        // ya había salido
      }
      fin(null);
    }, tiempoMax);
    reloj.unref?.();
    hijo.on('error', () => fin(null));
    hijo.stdout?.on?.('data', (trozo) => {
      if (bytes < MAX_PORTAPAPELES * 4) {
        trozos.push(trozo);
        bytes += trozo.length;
      }
    });
    hijo.stdout?.on?.('error', () => {});
    hijo.on('close', (codigo) => {
      if (codigo !== 0) return fin(null);
      const texto = Buffer.concat(trozos).toString('utf8').replace(/\r?\n$/, '');
      return fin(texto.slice(0, MAX_PORTAPAPELES));
    });
  });
}
