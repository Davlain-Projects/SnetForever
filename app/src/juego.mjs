// El juego (fase 5, tarea 7): saber si el cliente de \_forever_\ está abierto y dónde está instalado.
// - consultar: pregunta a Windows con el ayudante ayudantes/juego.ps1, que solo lee (procesos Wow.exe y su ruta, los
//   InstallPath de Blizzard del registro y las unidades con espacio libre).
// - juegoAbierto: con la lista de procesos, ¿hay un Wow.exe de \_forever_\? Lo que no se sabe cuenta como abierto.
// - validarCarpetaJuego y candidatasJuego: dónde está el juego, también con el juego cerrado y aunque el registro no lo
//   tenga (el PC de pruebas: E:\wow\World of Warcraft\_forever_, que sale de HABITUALES en la unidad E).
// Aquí nunca se para, se cierra ni se lanza el juego: solo se lee.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POWERSHELL } from './captura.mjs';
import { foreverDeInstallPath } from './rutas.mjs';
export const SCRIPT_JUEGO = join(dirname(fileURLToPath(import.meta.url)), '..', 'ayudantes', 'juego.ps1');
// Lo más que se espera al ayudante; si tarda más, se para ese PowerShell (el que lanzamos, por su PID) y se rechaza.
export const TIEMPO_MAX_PS = 15_000;
const SALIDA_MAX = 1024 * 1024;
const QUES = new Set(['procesos', 'registro', 'unidades']);
// Carpetas habituales del juego, relativas a la raíz de cada unidad (C:\, E:\…).
export const HABITUALES = [
    'World of Warcraft\\_forever_', 'wow\\World of Warcraft\\_forever_', 'Program Files (x86)\\World of Warcraft\\_forever_',
    'Program Files\\World of Warcraft\\_forever_', 'Games\\World of Warcraft\\_forever_', 'Juegos\\World of Warcraft\\_forever_',
    'Battle.net\\World of Warcraft\\_forever_',
];
const FOREVER = '_forever_';
/** Lanza `powershell.exe -NoProfile -ExecutionPolicy Bypass -File juego.ps1 -Que <que>` y da su salida (UTF-8). */
function ejecutarPsDeVerdad(que) {
    return new Promise((resolver, rechazar) => {
        execFile(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_JUEGO, '-Que', que], {
            encoding: 'utf8', windowsHide: true, timeout: TIEMPO_MAX_PS, maxBuffer: SALIDA_MAX,
        }, (error, salida) => (error ? rechazar(error) : resolver(salida)));
    });
}
/**
 * Pregunta a Windows `que` ('procesos', 'registro' o 'unidades') y da el JSON que escribe juego.ps1:
 * - procesos: `[{pid, ruta}]` (ruta null si Windows no la da);
 * - registro: `["<InstallPath>", …]`;
 * - unidades: `["C", "E", …]`.
 * `ejecutarPs(que)` da la salida en texto (se inyecta en las pruebas). Un `que` desconocido se rechaza sin lanzar nada; si
 * PowerShell falla, tarda más de 15 s o escribe algo que no es JSON, también se rechaza: quien llama decide (para saber si
 * el juego está abierto, no saberlo cuenta como abierto).
 */
export async function consultar(que, { ejecutarPs = ejecutarPsDeVerdad } = {}) {
    if (!QUES.has(que))
        throw new Error(`qué desconocido para juego.ps1: ${String(que)}`);
    return JSON.parse(String(await ejecutarPs(que)));
}
/**
 * ¿Está abierto el juego de \_forever_\? Verdadero si algún proceso tiene `\_forever_\` en la ruta (sin distinguir
 * mayúsculas) o una ruta que no se sabe (null, sin ruta o que no es texto), y también si `procesos` no es una lista: lo
 * que no se sabe cuenta como abierto. Con `[]`, falso.
 */
export function juegoAbierto({ procesos } = {}) {
    if (!Array.isArray(procesos))
        return true;
    return procesos.some((p) => {
        const ruta = p?.ruta;
        if (typeof ruta !== 'string')
            return true;
        return ruta.replace(/\//g, '\\').toLowerCase().includes(`\\${FOREVER}\\`);
    });
}
const nombre = (ruta) => win32.basename(ruta).toLowerCase();
/**
 * ¿Es `ruta` el juego de _forever_? Acepta la carpeta `_forever_`, su `Interface\AddOns`, la ruta de su `Wow.exe` o la
 * carpeta `World of Warcraft` (o cualquier otra que no sea de esas tres formas: se le añade `_forever_`).
 * - `{ok: false, motivo: 'no_existe'}` si `ruta` no existe o no es una ruta absoluta de Windows;
 * - `{ok: false, motivo: 'no_es_forever'}` si la raíz no se llama `_forever_` o no tiene `Wow.exe`;
 * - si no, `{ok: true, raiz, addons}`, con `addons = <raiz>\Interface\AddOns` (que no hace falta que exista todavía).
 */
export function validarCarpetaJuego(ruta, { existe = existsSync } = {}) {
    if (typeof ruta !== 'string' || !/^[A-Za-z]:[\\/]|^[\\/]{2}[^\\/]/.test(ruta))
        return { ok: false, motivo: 'no_existe' };
    const r = win32.resolve(ruta);
    if (!existe(r))
        return { ok: false, motivo: 'no_existe' };
    let raiz;
    if (nombre(r) === 'wow.exe')
        raiz = win32.dirname(r);
    else if (nombre(r) === 'addons' && nombre(win32.dirname(r)) === 'interface')
        raiz = win32.dirname(win32.dirname(r));
    else if (nombre(r) === FOREVER)
        raiz = r;
    else
        raiz = win32.join(r, FOREVER);
    if (nombre(raiz) !== FOREVER || !existe(win32.join(raiz, 'Wow.exe')))
        return { ok: false, motivo: 'no_es_forever' };
    return { ok: true, raiz, addons: win32.join(raiz, 'Interface', 'AddOns') };
}
const lista = (x) => (Array.isArray(x) ? x : []);
/**
 * Carpetas donde puede estar el juego, en este orden y solo las que da por buenas validarCarpetaJuego, sin repetir la
 * misma raíz (sin distinguir mayúsculas): `[{addons, raiz, origen}]`.
 * - 'env': SNF_ADDONS; 'config': `config.addons` (en las dos vale cualquiera de las formas de validarCarpetaJuego);
 * - 'proceso': la ruta de cada Wow.exe abierto (`procesos`, de consultar('procesos'));
 * - 'registro': de cada InstallPath, `InstallPath\_forever_` y la carpeta padre más `_forever_` (foreverDeInstallPath, la
 *   misma búsqueda que carpetaAddOns);
 * - 'habitual': `<unidad>:\<habitual>` para cada unidad (`unidades`, letras sueltas) y cada una de HABITUALES.
 */
export function candidatasJuego({ env = process.env, config, procesos, registro, unidades, existe = existsSync } = {}) {
    const posibles = [];
    if (env?.SNF_ADDONS)
        posibles.push([env.SNF_ADDONS, 'env']);
    if (config?.addons)
        posibles.push([config.addons, 'config']);
    for (const p of lista(procesos))
        posibles.push([p?.ruta, 'proceso']);
    for (const instalado of lista(registro))
        for (const forever of foreverDeInstallPath(instalado))
            posibles.push([forever, 'registro']);
    for (const u of lista(unidades)) {
        if (typeof u !== 'string' || !/^[A-Za-z]$/.test(u))
            continue;
        for (const h of HABITUALES)
            posibles.push([`${u.toUpperCase()}:\\${h}`, 'habitual']);
    }
    const vistas = new Set();
    const salida = [];
    for (const [ruta, origen] of posibles) {
        const v = validarCarpetaJuego(ruta, { existe });
        if (!v.ok || vistas.has(v.raiz.toLowerCase()))
            continue;
        vistas.add(v.raiz.toLowerCase());
        salida.push({ addons: v.addons, raiz: v.raiz, origen });
    }
    return salida;
}
