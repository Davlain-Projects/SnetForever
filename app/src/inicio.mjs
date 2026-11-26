// «Arrancar con Windows» (comercio, Task 8): el acceso directo `SnetForever.lnk` de la carpeta Inicio del usuario, el mismo
// que crea el instalador (wscript.exe "<carpeta>\SnetForever.vbs"). Lo hace el ayudante ayudantes/inicio.ps1:
//   - estado: ¿existe el acceso directo?
//   - crear: lo crea si no existe (si ya existe, el del instalador, se deja como está);
//   - quitar: lo mueve a la cuarentena (nunca se borra).
// Siempre devuelve {activo} según lo que hay en la carpeta Inicio después de hacerlo.
import { execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POWERSHELL } from './captura.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SCRIPT_INICIO = join(APP, 'ayudantes', 'inicio.ps1');
export const TIEMPO_MAX_PS = 20_000;
const SALIDA_MAX = 64 * 1024;
function ejecutarPsDeVerdad(args) {
    return new Promise((resolver, rechazar) => {
        execFile(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_INICIO, ...args], {
            encoding: 'utf8', windowsHide: true, timeout: TIEMPO_MAX_PS, maxBuffer: SALIDA_MAX,
        }, (error, salida) => (error ? rechazar(error) : resolver(salida)));
    });
}
function leer(salida) {
    const j = JSON.parse(String(salida));
    if (!j || typeof j.activo !== 'boolean')
        throw new Error('inicio.ps1 no dijo si está activo');
    return { activo: j.activo };
}
/**
 * El lanzador y el icono de la app: los de la instalación (`<instalación>\SnetForever.vbs` y `snetforever.ico`) si está
 * instalada; si no (desde el repositorio), `app\SnetForever.vbs` y `app\recursos\snetforever.ico`.
 */
export function rutasLanzador({ instalada = false, instalacion } = {}) {
    if (instalada && instalacion)
        return { vbs: join(instalacion, 'SnetForever.vbs'), icono: join(instalacion, 'snetforever.ico') };
    return { vbs: join(APP, 'SnetForever.vbs'), icono: join(APP, 'recursos', 'snetforever.ico') };
}
/** ¿Está el acceso directo en la carpeta Inicio? → {activo}. Si PowerShell falla, se rechaza. */
export async function arranqueConWindows({ ejecutarPs = ejecutarPsDeVerdad } = {}) {
    return leer(await ejecutarPs(['-Accion', 'estado']));
}
/**
 * Pone (`activo` true) o quita el acceso directo. Para ponerlo hace falta `vbs` (y, si existe, `icono`); para quitarlo,
 * `cuarentena()`, que da la carpeta (ya creada) a la que se mueve. → {activo}.
 */
export async function ponerArranqueConWindows(activo, { vbs, icono, cuarentena, ejecutarPs = ejecutarPsDeVerdad } = {}) {
    if (activo) {
        const args = ['-Accion', 'crear', '-Vbs', String(vbs ?? '')];
        if (icono)
            args.push('-Icono', String(icono)); // si no existe, inicio.ps1 deja el icono del lanzador
        return leer(await ejecutarPs(args));
    }
    const actual = await arranqueConWindows({ ejecutarPs });
    if (!actual.activo)
        return actual;
    return leer(await ejecutarPs(['-Accion', 'quitar', '-Cuarentena', String(cuarentena())]));
}
