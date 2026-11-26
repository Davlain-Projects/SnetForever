// Credenciales de la API de Blizzard (id y secreto del cliente), guardadas cifradas con DPAPI de Windows.
//
// - En disco solo hay `<datos>\comercio\blizzard.dat`: el JSON {id, secreto} cifrado con DPAPI (usuario actual,
//   entropía 'SnetForever-blizzard-1', en ayudantes/secreto.ps1). Otro usuario de Windows, u otro PC, no puede leerlo.
// - El id y el secreto nunca se escriben en registros, avisos ni errores: los avisos solo llevan un código y qué falló.
// - Si existe el archivo antiguo en claro `<datos>\blizzard-api.json`, se importa (se cifra y se guarda) y el archivo en
//   claro se mueve a la cuarentena. Nunca se borra nada.
// - Todo lo de fuera (PowerShell, archivos, cuarentena, registro) entra por parámetros, para poder probarlo sin tocar el
//   disco real ni Windows.
import { spawn } from 'node:child_process';
import * as fsReal from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POWERSHELL } from '../captura.mjs';
import { cuarentenaNueva } from '../rutas.mjs';
export const SCRIPT_SECRETO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ayudantes', 'secreto.ps1');
export const ARCHIVO_CIFRADO = 'blizzard.dat';
export const ARCHIVO_ANTIGUO = 'blizzard-api.json';
const CARPETA = 'comercio';
const TIEMPO_MAX_PS = 30_000;
const SALIDA_MAX = 1024 * 1024;
// El id de cliente de Blizzard son 32 cifras hexadecimales.
const FORMA_ID = /^[0-9a-f]{32}$/i;
/** Lanza secreto.ps1 con `accion` ('proteger' o 'desproteger'), le da `entradaBase64` por stdin y devuelve su stdout (base64). */
export function ejecutarSecreto(accion, entradaBase64) {
    return new Promise((resolver, rechazar) => {
        const hijo = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_SECRETO, '-Accion', accion], {
            windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        });
        let salida = '';
        let error = '';
        let acabado = false;
        const fin = (f, valor) => {
            if (acabado)
                return;
            acabado = true;
            clearTimeout(reloj);
            f(valor);
        };
        const reloj = setTimeout(() => {
            hijo.kill();
            fin(rechazar, new Error('secreto.ps1 tardó demasiado'));
        }, TIEMPO_MAX_PS);
        hijo.stdout.on('data', (t) => {
            salida += t;
            if (salida.length > SALIDA_MAX) {
                hijo.kill();
                fin(rechazar, new Error('secreto.ps1 dio demasiada salida'));
            }
        });
        hijo.stderr.on('data', (t) => { if (error.length < 500)
            error += t; });
        hijo.on('error', (e) => fin(rechazar, new Error(`no se pudo lanzar PowerShell: ${e.message}`)));
        hijo.on('close', (codigo) => {
            // el mensaje lleva solo el stderr del ayudante, nunca su stdout (que puede ser el secreto)
            if (codigo !== 0)
                fin(rechazar, new Error(error.trim() || `secreto.ps1 salió con ${codigo}`));
            else
                fin(resolver, salida.trim());
        });
        hijo.stdin.on('error', () => { });
        hijo.stdin.end(entradaBase64);
    });
}
// ¿Son unas credenciales como las que da Blizzard? Devuelve {id, secreto} limpio o null.
function validar(c) {
    if (c === null || typeof c !== 'object')
        return null;
    const { id, secreto } = c;
    if (typeof id !== 'string' || !FORMA_ID.test(id))
        return null;
    if (typeof secreto !== 'string' || secreto.trim() === '')
        return null;
    return { id, secreto };
}
function rutas(datos) {
    const carpeta = join(datos, CARPETA);
    return { carpeta, cifrado: join(carpeta, ARCHIVO_CIFRADO), antiguo: join(datos, ARCHIVO_ANTIGUO) };
}
// Cifra {id, secreto} y lo deja en blizzard.dat (se escribe a un archivo temporal y se renombra: nunca queda a medias).
// Si ya había un blizzard.dat, antes se mueve a la cuarentena (nunca se pisa ni se borra); si eso falla, no se escribe nada.
async function escribirCifrado(datos, credenciales, { ejecutar, fs, cuarentena }) {
    const { carpeta, cifrado } = rutas(datos);
    const claro = Buffer.from(JSON.stringify({ id: credenciales.id, secreto: credenciales.secreto }), 'utf8');
    const salida = await ejecutar('proteger', claro.toString('base64'));
    const bytes = Buffer.from(String(salida).trim(), 'base64');
    claro.fill(0);
    if (bytes.length === 0)
        throw new Error('DPAPI no devolvió nada al proteger');
    fs.mkdirSync(carpeta, { recursive: true });
    const temporal = `${cifrado}.tmp`;
    fs.writeFileSync(temporal, bytes);
    if (fs.existsSync(cifrado))
        fs.renameSync(cifrado, join(cuarentena(), ARCHIVO_CIFRADO));
    fs.renameSync(temporal, cifrado);
}
/**
 * Cifra y guarda las credenciales en `<datos>\comercio\blizzard.dat`. Si no son válidas (id de 32 cifras hexadecimales y
 * secreto no vacío) lanza TypeError, sin repetir los valores.
 * @param {string} datos carpeta de datos de la app
 * @param {{id: string, secreto: string}} credenciales
 * @param {{ejecutar?: (accion: string, entradaBase64: string) => Promise<string>, fs?: object, cuarentena?: () => string}} [opciones]
 *   Si ya había un blizzard.dat, se mueve a la carpeta que da `cuarentena()`.
 */
export async function guardarCredenciales(datos, credenciales, { ejecutar = ejecutarSecreto, fs = fsReal, cuarentena = () => cuarentenaNueva({ ...process.env, SNF_DATOS: datos }), } = {}) {
    const limpias = validar(credenciales);
    if (limpias === null)
        throw new TypeError('las credenciales de Blizzard no son válidas (id de 32 cifras hexadecimales y secreto no vacío)');
    try {
        await escribirCifrado(datos, limpias, { ejecutar, fs, cuarentena: unaVez(cuarentena) });
    }
    catch {
        // sin el error original: podría traer algo de lo que se estaba cifrando
        throw new Error(`no se pudieron guardar las credenciales cifradas en ${ARCHIVO_CIFRADO}`);
    }
}
/**
 * Lee las credenciales de Blizzard: `{id, secreto}`, o `null` si no hay, están mal o no se pueden descifrar (y entonces
 * avisa con `registrar`, con un código y sin los valores: 'CREDENCIALES_MALAS' o 'CREDENCIALES_ILEGIBLES').
 * Si hay un `blizzard-api.json` en claro y válido, manda siempre: lo importa (cifra y guarda, aunque ya hubiera un
 * blizzard.dat, que sirve para recuperarse de un .dat ilegible o de un secreto cambiado), mueve el .dat viejo y el json a
 * la cuarentena y devuelve las nuevas. Un json que no vale se ignora (con aviso) y se lee el .dat.
 * @param {string} datos carpeta de datos de la app
 * @param {{ejecutar?: Function, fs?: object, cuarentena?: () => string, registrar?: (aviso: string) => void}} [opciones]
 *   `cuarentena()` da la carpeta (ya creada) a la que va lo que sobra.
 * @returns {Promise<{id: string, secreto: string}|null>}
 */
export async function leerCredenciales(datos, { ejecutar = ejecutarSecreto, fs = fsReal, registrar = (() => { }), cuarentena = () => cuarentenaNueva({ ...process.env, SNF_DATOS: datos }), } = {}) {
    const { cifrado, antiguo } = rutas(datos);
    const aparte = unaVez(cuarentena);
    if (fs.existsSync(antiguo)) {
        const importadas = await importarAntiguo(datos, antiguo, { ejecutar, fs, registrar, cuarentena: aparte });
        if (importadas !== null)
            return importadas;
    }
    if (fs.existsSync(cifrado))
        return descifrar(cifrado, { ejecutar, fs, registrar });
    return null;
}
// La cuarentena se crea la primera vez que hace falta y todo lo apartado en una lectura va a la misma carpeta.
function unaVez(cuarentena) {
    let carpeta = null;
    return () => {
        if (carpeta === null)
            carpeta = cuarentena();
        return carpeta;
    };
}
async function descifrar(ruta, { ejecutar, fs, registrar }) {
    let claro = null;
    try {
        const bytes = fs.readFileSync(ruta);
        const salida = await ejecutar('desproteger', Buffer.from(bytes).toString('base64'));
        claro = Buffer.from(String(salida).trim(), 'base64');
        const lista = validar(JSON.parse(claro.toString('utf8')));
        if (lista === null) {
            registrar(`CREDENCIALES_MALAS: ${ARCHIVO_CIFRADO} no trae un id de 32 cifras hexadecimales y un secreto`);
            return null;
        }
        return lista;
    }
    catch {
        // no se repite el mensaje del error: podría traer algo de lo que se descifró
        registrar(`CREDENCIALES_ILEGIBLES: no se pudo leer ${ARCHIVO_CIFRADO} (¿otro usuario de Windows o archivo cambiado?)`);
        return null;
    }
    finally {
        claro?.fill(0);
    }
}
async function importarAntiguo(datos, antiguo, { ejecutar, fs, registrar, cuarentena }) {
    let lista = null;
    try {
        lista = validar(JSON.parse(fs.readFileSync(antiguo, 'utf8')));
    }
    catch {
        lista = null;
    }
    if (lista === null) {
        registrar(`CREDENCIALES_MALAS: ${ARCHIVO_ANTIGUO} no trae un id de 32 cifras hexadecimales y un secreto`);
        return null;
    }
    try {
        await escribirCifrado(datos, lista, { ejecutar, fs, cuarentena });
    }
    catch {
        // sin poder cifrar, el archivo en claro se queda donde está
        registrar(`CREDENCIALES_ILEGIBLES: no se pudo cifrar ${ARCHIVO_ANTIGUO}`);
        return null;
    }
    apartar(fs, antiguo, cuarentena, registrar);
    return lista;
}
// Mueve un archivo a la cuarentena (renombrar, nunca borrar).
function apartar(fs, ruta, cuarentena, registrar) {
    try {
        fs.renameSync(ruta, join(cuarentena(), ARCHIVO_ANTIGUO));
    }
    catch {
        // las credenciales ya están cifradas; el archivo en claro se queda y se avisa para que se aparte a mano
        registrar(`CREDENCIALES_EN_CLARO: no se pudo mover ${ARCHIVO_ANTIGUO} a la cuarentena`);
    }
}
