// Rutas de la app: carpeta de datos, carpeta de trabajo de la IA, configuración, carpeta de AddOns del juego y, desde la
// fase 5, carpeta de instalación y cuarentena por PC. Solo se crean carpetas; nunca se borra nada.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync, lstatSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname, sep, resolve, win32 } from 'node:path';
import { homedir } from 'node:os';
// Carpeta de datos: SNF_DATOS o %LOCALAPPDATA%\SnetForever.
export function carpetaDatos(env = process.env) {
    if (env.SNF_DATOS)
        return env.SNF_DATOS;
    const base = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return join(base, 'SnetForever');
}
export const MARCA_TRABAJO = '.snetforever-trabajo';
function errorTrabajo(codigo, texto) {
    return Object.assign(new Error(texto), { code: codigo });
}
/**
 * Carpeta donde se lanza a la IA: datos/trabajo. Solo se usa (y solo se despeja) una carpeta que la app haya creado,
 * con el archivo de marca `.snetforever-trabajo`. Si `trabajo` ya existe sin marca, o es un enlace o una unión, o su ruta
 * real queda fuera de la carpeta de datos, se lanza un error con `code = 'TRABAJO'` («la carpeta de trabajo no es de
 * SnetForever») y no se toca nada. Una carpeta vacía y sin marca solo se adopta en la carpeta de datos por defecto. Si la carpeta de
 * datos no se puede crear, el error lleva `code = 'DATOS'`.
 */
export function carpetaTrabajo(env = process.env) {
    const datos = carpetaDatos(env);
    try {
        mkdirSync(datos, { recursive: true });
    }
    catch {
        throw errorTrabajo('DATOS', 'carpeta de datos no válida');
    }
    const ruta = join(datos, 'trabajo');
    const ajena = () => errorTrabajo('TRABAJO', 'la carpeta de trabajo no es de SnetForever');
    if (!existsSync(ruta) && !enlace(ruta)) {
        try {
            mkdirSync(ruta);
            writeFileSync(join(ruta, MARCA_TRABAJO), randomUUID(), 'utf8');
        }
        catch {
            throw errorTrabajo('DATOS', 'carpeta de datos no válida');
        }
        return ruta;
    }
    if (enlace(ruta))
        throw ajena();
    let dentro = false;
    try {
        const real = realpathSync.native(ruta).toLowerCase();
        const base = realpathSync.native(datos).toLowerCase();
        dentro = real.startsWith(base.endsWith(sep) ? base : base + sep);
    }
    catch {
        dentro = false;
    }
    if (!dentro)
        throw ajena();
    if (!existsSync(join(ruta, MARCA_TRABAJO))) {
        // Solo se adopta una carpeta vacía en la carpeta de datos por defecto; con SNF_DATOS u otra, una `trabajo` sin marca es ajena.
        if (!esCarpetaPorDefecto(env) || readdirSync(ruta).length > 0)
            throw ajena();
        writeFileSync(join(ruta, MARCA_TRABAJO), randomUUID(), 'utf8');
    }
    return ruta;
}
// ¿Es la carpeta de datos la de por defecto (%LOCALAPPDATA%\SnetForever, sin SNF_DATOS)?
function esCarpetaPorDefecto(env) {
    const normal = (p) => resolve(p).toLowerCase();
    return normal(carpetaDatos(env)) === normal(carpetaDatos({ ...env, SNF_DATOS: undefined }));
}
// ¿Es un enlace simbólico o una unión (mklink /J)? Node los da como enlace simbólico.
function enlace(ruta) {
    try {
        return lstatSync(ruta).isSymbolicLink();
    }
    catch {
        return false;
    }
}
// Configuración de la app (datos/config.json). Si falta o está rota, {}.
export function leerConfig(env = process.env) {
    try {
        const c = JSON.parse(readFileSync(join(carpetaDatos(env), 'config.json'), 'utf8'));
        return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
    }
    catch {
        return {};
    }
}
/**
 * Carpeta de AddOns del cliente _forever_, en este orden: SNF_ADDONS, config.addons, junto al Wow.exe del juego abierto
 * (`<carpeta del exe>\Interface\AddOns`, el que da la captura), las de `registro` que existan, o null.
 * Lote C (revisión 52, Minor 11): ya no hay ruta fija del autor como último recurso (en el PC de otro apuntaría mal). Sin
 * nada de lo anterior, la bandeja pide poner la carpeta en `addons` de config.json (T.esperandoAddons) y se reintenta.
 * `registro`: los InstallPath de Blizzard del registro de Windows (la fase 5 los lee en solo lectura con juego.ps1); de
 * cada uno vale `<InstallPath>\_forever_` o, si no, la carpeta padre más `_forever_` (`…\World of Warcraft\_retail_\` →
 * `…\World of Warcraft\_forever_`), si su Interface\AddOns existe.
 */
export function carpetaAddOns({ config, exeJuego, env = process.env, existe = existsSync, registro = [] } = {}) {
    if (env.SNF_ADDONS)
        return env.SNF_ADDONS;
    if (config && config.addons)
        return config.addons;
    if (exeJuego)
        return join(dirname(exeJuego), 'Interface', 'AddOns');
    for (const instalado of Array.isArray(registro) ? registro : []) {
        for (const forever of foreverDeInstallPath(instalado)) {
            const addons = win32.join(forever, 'Interface', 'AddOns');
            if (existe(addons))
                return addons;
        }
    }
    return null;
}
/**
 * Carpetas `_forever_` posibles para un `InstallPath` de Blizzard del registro de Windows, en orden. La usan
 * carpetaAddOns y candidatasJuego (juego.mjs), para que la búsqueda del registro esté en un único sitio.
 * Ronda 1 (Menor 4): primero `InstallPath\_forever_` (un InstallPath que ya es la carpeta World of Warcraft) y después la
 * carpeta padre más `_forever_` (un InstallPath que es `…\World of Warcraft\_retail_\`). Lo que no es una ruta absoluta
 * de Windows da `[]`.
 */
export function foreverDeInstallPath(instalado) {
    if (typeof instalado !== 'string' || !win32.isAbsolute(instalado))
        return [];
    const carpeta = win32.resolve(instalado);
    return [carpeta, win32.dirname(carpeta)].map((raiz) => win32.join(raiz, '_forever_'));
}
// ---------- cuarentena (se renombra, nunca se borra) ----------
/** Sello de fecha para nombres de carpeta y de archivo: 2026-11-10T12-00-00-000Z. */
export function sello() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}
/**
 * Carpeta de instalación de la app (fase 5): SNF_INSTALACION o `%LOCALAPPDATA%\Programs\SnetForever`.
 */
export function carpetaInstalacion(env = process.env) {
    if (env.SNF_INSTALACION)
        return env.SNF_INSTALACION;
    const base = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return join(base, 'Programs', 'SnetForever');
}
// En el PC de pruebas hay una cuarentena común en E:; en los demás no existe y se usa la de la carpeta de datos.
const CUARENTENA_COMUN = 'E:\\_CUARENTENA';
/**
 * Raíz de la cuarentena de los componentes (addons, ranuras, accesos), por PC, en este orden: SNF_CUARENTENA,
 * `config.cuarentena` (texto no vacío), `E:\_CUARENTENA\SnetForever` si existe `E:\_CUARENTENA`, o `<datos>\cuarentena`.
 * Sin `config`, se lee config.json de la carpeta de datos. Solo calcula la ruta: no crea nada.
 */
export function raizCuarentena({ env = process.env, config, existe = existsSync } = {}) {
    if (env.SNF_CUARENTENA)
        return env.SNF_CUARENTENA;
    const c = config === undefined ? leerConfig(env) : config;
    if (c && typeof c.cuarentena === 'string' && c.cuarentena.length > 0)
        return c.cuarentena;
    if (existe(CUARENTENA_COMUN))
        return win32.join(CUARENTENA_COMUN, 'SnetForever');
    return join(carpetaDatos(env), 'cuarentena');
}
/**
 * Crea y devuelve `<raizCuarentena>\<sello>` (con sufijo -1, -2… si ya existe): la carpeta a la que van los componentes
 * sustituidos o desinstalados. Dos llamadas en el mismo milisegundo dan dos carpetas distintas.
 */
export function cuarentenaComponentes({ env = process.env, config, existe = existsSync } = {}) {
    const base = raizCuarentena({ env, config, existe });
    mkdirSync(base, { recursive: true });
    return carpetaNuevaCon(base);
}
// Crea `<base>\<sello>` o, si ya existe, `<sello>-1`, `<sello>-2`… (mkdirSync sin recursive falla con EEXIST: nunca se
// reutiliza una carpeta que ya estaba).
function carpetaNuevaCon(base) {
    const s = sello();
    for (let i = 0;; i++) {
        const ruta = join(base, i === 0 ? s : `${s}-${i}`);
        try {
            mkdirSync(ruta);
            return ruta;
        }
        catch (e) {
            if (e?.code !== 'EEXIST')
                throw e;
        }
    }
}
/**
 * Crea y devuelve `datos/cuarentena/<sello>` (con sufijo -1, -2… si ya existe). No cambia en la fase 5: la usa
 * `despejarTrabajo`, siempre en la misma unidad que la carpeta de trabajo (un renombre sin EXDEV).
 */
export function cuarentenaNueva(env = process.env) {
    const base = join(carpetaDatos(env), 'cuarentena');
    mkdirSync(base, { recursive: true });
    for (let i = 0;; i++) {
        const ruta = join(base, i === 0 ? sello() : `${sello()}-${i}`);
        if (!existsSync(ruta)) {
            mkdirSync(ruta);
            return ruta;
        }
    }
}
/**
 * Deja vacía la carpeta de trabajo (sobre todo de `.claude\` y `CLAUDE.md`, que cambiarían a la IA): todo lo que no sea
 * de `conservar` se renombra a `datos/cuarentena/<sello>/`. Devuelve los nombres movidos.
 */
export function despejarTrabajo({ env = process.env, conservar = [] } = {}) {
    const trabajo = carpetaTrabajo(env);
    const sobran = readdirSync(trabajo).filter((n) => n !== MARCA_TRABAJO && !conservar.includes(n));
    if (sobran.length === 0)
        return [];
    const destino = cuarentenaNueva(env);
    for (const nombre of sobran)
        renameSync(join(trabajo, nombre), join(destino, nombre));
    return sobran;
}
