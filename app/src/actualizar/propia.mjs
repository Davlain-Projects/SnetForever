// Actualización de la propia app por carpetas de versión (fase 5, tarea 10; R12 y F3).
//
// Lo instalado vive en `<instalación>\app\<versión>\` (`%LOCALAPPDATA%\Programs\SnetForever`, o SNF_INSTALACION), con
// `actual.txt` (la versión que lanza `arranque.mjs`), `previa.txt` (a la que vuelve si la actual no arranca) y, tras una
// vuelta atrás, `fallida.txt` (la que no arrancó):
// - `aplicarApp` extrae el paquete de la app en `app\<v>.preparando`, aparta a la cuarentena un `app\<v>` que ya
//   existiera, renombra la preparada a `app\<v>` y solo entonces apunta `previa.txt` (la versión que corre) y
//   `actual.txt` (temporal y renombre). La versión que está en marcha no se toca: sigue en su carpeta hasta que la app se
//   reinicie. Una versión igual o anterior a la de `fallida.txt` no se aplica.
// - `limpiarVersiones` aparta a la cuarentena las carpetas de `app\` que no son ni la que corre, ni la actual, ni la previa.
// - `reiniciar` suelta el cerrojo de esta app y lanza `SnetForever.vbs` (que lanza `arranque.mjs`) separado de esta, con
//   SNF_REINICIO_DE = el pid de esta: el arranque espera a que esta salga antes de lanzar la nueva.
// Nunca se borra nada: lo sustituido va a la cuarentena con `moverDentro` (mover.mjs).
import { spawn } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirPaquete, extraerPaquete } from './paquete.mjs';
import { compararVersiones } from './manifiesto.mjs';
import { moverDentro, moverSinPisar } from '../mover.mjs';
import { carpetaInstalacion } from '../rutas.mjs';
/**
 * Una versión de la app tal como la acepta `arranque.mjs` en `actual.txt` (3 o 4 partes). `arranque.mjs` no puede
 * importarla (no importa nada de `src/`) y lleva una copia: propia.test.js vigila que las dos sean iguales.
 */
export const VERSION_APP = /^\d+\.\d+\.\d+(\.\d+)?$/;
export const ACTUAL = 'actual.txt';
export const PREVIA = 'previa.txt';
/** La versión que el arranque vio fallar y de la que volvió atrás (la escribe `arranque.mjs`). */
export const FALLIDA = 'fallida.txt';
/** Variable de entorno con el pid de la app que se reinicia: el arranque espera a que ese proceso salga. */
export const REINICIO_DE = 'SNF_REINICIO_DE';
/** Sufijo de la carpeta donde se extrae una versión antes de ponerla en su sitio. */
export const PREPARANDO = '.preparando';
/**
 * Error de este archivo. `code`: 'desarrollo' (la app no corre desde una instalación: no se aplica nada), 'paquete'
 * (la versión del paquete no la aceptaría el arranque) o 'fallida' (la versión no es más nueva que la de `fallida.txt`).
 * Los del paquete (ErrorPaquete) y los del disco salen tal cual.
 */
export class ErrorPropia extends Error {
    constructor(code, mensaje) {
        super(mensaje);
        this.name = 'ErrorPropia';
        this.code = code;
    }
}
// La ruta de un archivo a partir de import.meta.url (file:…) o de una ruta; null si no se entiende.
function rutaDe(aqui) {
    if (aqui instanceof URL)
        aqui = aqui.href;
    if (typeof aqui !== 'string' || aqui.length === 0)
        return null;
    try {
        return /^file:/i.test(aqui) ? fileURLToPath(aqui) : resolve(aqui);
    }
    catch {
        return null;
    }
}
// La versión de la carpeta `<instalacion>\app\<versión>\` en la que está `aqui`, o null si no está en ninguna. (En
// Windows, `relative` no distingue mayúsculas.)
function versionQueCorre(aqui, instalacion) {
    const archivo = rutaDe(aqui);
    if (archivo === null || typeof instalacion !== 'string' || instalacion.length === 0)
        return null;
    const rel = relative(resolve(instalacion, 'app'), archivo);
    if (rel === '' || isAbsolute(rel))
        return null;
    const partes = rel.split(sep);
    return partes.length >= 2 && partes[0] !== '..' && VERSION_APP.test(partes[0]) ? partes[0] : null;
}
/**
 * ¿Corre esta app desde una instalación? Verdadero si `aqui` (por defecto, este archivo) está dentro de
 * `carpetaInstalacion(env)\app\<versión>\`. Desde el repositorio es falso, y entonces `aplicarApp` no hace nada.
 * @param {{env?: object, aqui?: string|URL}} [p]
 * @returns {boolean}
 */
export function esInstalada({ env = process.env, aqui = import.meta.url } = {}) {
    return versionQueCorre(aqui, carpetaInstalacion(env)) !== null;
}
/** La versión que dice `ruta` (actual.txt, previa.txt o fallida.txt), o null si falta o no cumple VERSION_APP. */
export function leerVersion(ruta) {
    try {
        const v = readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '').trim();
        return VERSION_APP.test(v) ? v : null;
    }
    catch {
        return null;
    }
}
// Escribe `texto` en `ruta` con un temporal nuevo (wx) y un renombre. Si el renombre falla, el temporal se queda.
function escribirConRenombre(ruta, texto, renombrar) {
    const temporal = `${ruta}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(temporal, texto, { encoding: 'utf8', flag: 'wx' });
    renombrar(temporal, ruta);
}
function existe(ruta) {
    try {
        lstatSync(ruta);
        return true;
    }
    catch {
        return false;
    }
}
function esCarpeta(ruta) {
    try {
        return statSync(ruta).isDirectory();
    }
    catch {
        return false;
    }
}
// Pide la carpeta de cuarentena una sola vez, y solo cuando hace falta.
function cuarentenaPerezosa(cuarentena) {
    let carpeta = null;
    return () => {
        if (carpeta === null) {
            const q = cuarentena();
            if (typeof q !== 'string' || q.length === 0)
                throw new Error('la carpeta de cuarentena no es una ruta');
            carpeta = q;
        }
        return carpeta;
    };
}
function comprobarInstalacion(instalacion) {
    if (typeof instalacion !== 'string' || instalacion.length === 0)
        throw new Error('falta la carpeta de instalación');
}
// Tras un renombre fallido, devuelve lo apartado (`apartada`) a `final` y apunta en `e` cómo quedó: `restaurada` y, si
// no se pudo, `apartada` (dónde se quedó), `errorAlRestaurar` y una frase más en el mensaje.
function restaurar(e, apartada, final) {
    let fallo = null;
    if (existe(final)) {
        fallo = Object.assign(new Error(`«${final}» ya existe`), { code: 'EEXIST' });
    }
    else {
        try {
            moverSinPisar(apartada, final);
        }
        catch (err) {
            fallo = err;
        }
    }
    e.restaurada = fallo === null;
    if (fallo === null)
        return;
    e.apartada = apartada;
    e.errorAlRestaurar = fallo;
    e.message = `${e.message} (y no se pudo devolver «${apartada}» a «${final}»: ${fallo?.code || fallo?.message}; se queda `
        + 'en la cuarentena y actual.txt sigue con la versión de antes)';
}
/**
 * Aplica el paquete de una versión nueva de la app (lo llama el actualizador, tarea 9, con el paquete ya verificado):
 * 1. si esta app no corre desde `<instalacion>\app\<versión>\`, lanza 'desarrollo' sin tocar nada;
 * 2. abre el paquete (`componente: 'app'`); una `v` igual o anterior a la de `fallida.txt` lanza 'fallida' sin tocar
 *    nada (no se vuelve a aplicar la que ya no arrancó: se ofrece otra vez solo una más nueva);
 * 3. lo extrae sin el `app\` del principio en `app\<v>.preparando` (uno de antes va primero a la cuarentena);
 * 4. si `app\<v>` ya existe, lo aparta a la cuarentena;
 * 5. renombra la preparada a `app\<v>`. Si falla, lo apartado vuelve a su sitio y la preparada se queda; el error lleva
 *    `restaurada` y, si no volvió, `apartada`, `errorAlRestaurar` y una frase en el mensaje que lo dice;
 * 6. escribe `previa.txt` y `actual.txt` = `v`, los dos con temporal y renombre. La previa es la versión que corre (si
 *    tiene su carpeta y no es `v`): con dos actualizaciones sin reiniciar, sigue siendo la única que se sabe que arranca.
 *    Si la que corre no tiene carpeta, es el `actual` de antes (si lo había y no era `v`).
 * La nueva versión se usa al reiniciar (`reiniciar`); si no arranca, `arranque.mjs` vuelve a la previa.
 * @param {Buffer} buffer el `.snfpaq` de la app
 * @param {object} p
 * @param {string} p.instalacion la carpeta de instalación (carpetaInstalacion)
 * @param {() => string} p.cuarentena da una carpeta de cuarentena nueva (cuarentenaComponentes); se llama una vez como
 *   mucho, solo si hay algo que apartar
 * @param {string|URL} [p.aqui] dónde está este archivo (import.meta.url); solo se cambia en las pruebas
 * @param {Function} [p.renombrar] renameSync; solo se cambia en las pruebas
 * @returns {{version: string}}
 */
export function aplicarApp(buffer, { instalacion, cuarentena, aqui = import.meta.url, renombrar = renameSync } = {}) {
    comprobarInstalacion(instalacion);
    const corre = versionQueCorre(aqui, instalacion);
    if (corre === null) {
        throw new ErrorPropia('desarrollo', 'La app no corre desde una instalación (app\\<versión>\\): no se actualiza a sí misma');
    }
    if (typeof cuarentena !== 'function')
        throw new Error('falta la cuarentena');
    const apartar = cuarentenaPerezosa(cuarentena);
    const abierto = abrirPaquete(buffer, { componente: 'app' });
    const v = abierto.version;
    if (!VERSION_APP.test(v))
        throw new ErrorPropia('paquete', `La versión «${v}» de la app no tiene 3 o 4 partes`);
    const fallida = leerVersion(join(instalacion, FALLIDA));
    if (fallida !== null && compararVersiones(v, fallida) <= 0) {
        throw new ErrorPropia('fallida', `La ${v} no es más nueva que la ${fallida}, que ya no arrancó: no se aplica`);
    }
    const carpetaApp = join(instalacion, 'app');
    mkdirSync(carpetaApp, { recursive: true });
    const preparada = join(carpetaApp, `${v}${PREPARANDO}`);
    const final = join(carpetaApp, v);
    if (existe(preparada))
        moverDentro(preparada, apartar()); // de un intento de antes que se quedó a medias
    try {
        extraerPaquete(abierto, preparada, { quitarPrimero: true });
    }
    catch (e) {
        if (existe(preparada)) {
            try {
                moverDentro(preparada, apartar());
            }
            catch {
                // se queda como .preparando; el próximo intento la aparta
            }
        }
        throw e;
    }
    const apartada = existe(final) ? moverDentro(final, apartar()) : null;
    try {
        renombrar(preparada, final);
    }
    catch (e) {
        if (apartada !== null)
            restaurar(e, apartada, final);
        throw e;
    }
    const previa = corre !== v && esCarpeta(join(carpetaApp, corre)) ? corre : leerVersion(join(instalacion, ACTUAL));
    if (previa !== null && previa !== v)
        escribirConRenombre(join(instalacion, PREVIA), previa, renombrar);
    escribirConRenombre(join(instalacion, ACTUAL), v, renombrar);
    return { version: v };
}
/**
 * Aparta a la cuarentena las carpetas de `<instalacion>\app\` que no son ni la que corre (la de `aqui`), ni la actual,
 * ni la previa (también un `.preparando` que se quedara). Sin un `actual.txt` válido con su carpeta no mueve nada.
 * @param {{instalacion: string, cuarentena: () => string, aqui?: string|URL}} p `cuarentena` se llama una vez como
 *   mucho; `aqui` (import.meta.url) solo se cambia en las pruebas
 * @returns {string[]} los nombres de las carpetas movidas
 */
export function limpiarVersiones({ instalacion, cuarentena, aqui = import.meta.url } = {}) {
    comprobarInstalacion(instalacion);
    const carpetaApp = join(instalacion, 'app');
    const actual = leerVersion(join(instalacion, ACTUAL));
    if (actual === null || !esCarpeta(join(carpetaApp, actual)))
        return [];
    const previa = leerVersion(join(instalacion, PREVIA));
    const corre = versionQueCorre(aqui, instalacion);
    const conservar = new Set([corre, actual, previa].filter((v) => v !== null).map((v) => v.toLowerCase()));
    if (typeof cuarentena !== 'function')
        throw new Error('falta la cuarentena');
    const apartar = cuarentenaPerezosa(cuarentena);
    const movidas = [];
    for (const entrada of readdirSync(carpetaApp, { withFileTypes: true })) {
        if (!entrada.isDirectory() || conservar.has(entrada.name.toLowerCase()))
            continue;
        moverDentro(join(carpetaApp, entrada.name), apartar());
        movidas.push(entrada.name);
    }
    return movidas;
}
/**
 * Reinicia la app. El orden es obligatorio (quien llama, T13, lo respeta):
 * 1. `await soltar()`: suelta el cerrojo de esta app (`cerrojo.soltar` de principal.mjs). Si falla, se sigue: el
 *    arranque espera igual a que esta salga, y el cerrojo de un proceso que ya no vive no cuenta;
 * 2. lanza `<SystemRoot>\System32\wscript.exe "<instalacion>\SnetForever.vbs"` (con ruta completa: nunca se busca en la
 *    carpeta de trabajo ni en el PATH), separado y sin consola, con SNF_REINICIO_DE = `pid` en el entorno, espera a que
 *    arranque (si no puede, se rechaza con su error) y lo suelta;
 * 3. quien llama cierra esta app enseguida.
 * El arranque espera a que el proceso `pid` salga (SNF_REINICIO_ESPERA, 20 s por defecto) antes de lanzar la nueva, que
 * así toma el cerrojo y pasa por la vuelta atrás si falla. Si aun así la nueva sale con 3 (el cerrojo sigue ocupado), el
 * arranque no lo da por bueno: sale con 3 y lo apunta.
 * @param {{instalacion: string, soltar: () => unknown, lanzar?: Function, env?: object, pid?: number}} p
 *   `lanzar` (spawn), `env` (process.env) y `pid` (process.pid) solo se cambian en las pruebas
 * @returns {Promise<object>} el proceso lanzado
 */
export async function reiniciar({ instalacion, soltar, lanzar = spawn, env = process.env, pid = process.pid } = {}) {
    comprobarInstalacion(instalacion);
    if (typeof soltar !== 'function')
        throw new Error('reiniciar necesita soltar (el cerrojo de la app) antes de lanzar la nueva');
    try {
        await soltar();
    }
    catch {
        // se sigue: el arranque espera a que esta app salga
    }
    const wscript = join(env.SystemRoot || env.SYSTEMROOT || env.windir || 'C:\\Windows', 'System32', 'wscript.exe');
    const hijo = lanzar(wscript, [join(instalacion, 'SnetForever.vbs')], {
        detached: true, stdio: 'ignore', env: { ...env, [REINICIO_DE]: String(pid) },
    });
    // Tarea 13, ronda 1: con escucha de 'error'. Si Windows no lo puede lanzar, se rechaza (quien llama vuelve a tomar el
    // cerrojo y sigue viva); se espera a 'spawn' para saberlo. Un 'error' de después solo se ignora (nunca tumba la app).
    if (typeof hijo?.once === 'function') {
        await new Promise((resolver, rechazar) => {
            hijo.once('spawn', resolver);
            hijo.once('error', rechazar);
        });
        hijo.on('error', () => { });
    }
    hijo?.unref?.();
    return hijo;
}
