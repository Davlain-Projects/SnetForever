// Firma y manifiesto de las actualizaciones (formato F1 y R7 del plan de la fase 5; tarea 5; vigilancia 2).
//
// El manifiesto es `snetforever-manifiesto.json` (64 KiB como mucho):
//
//   {"esquema":1,"producto":"SnetForever","publicacion":"v0.5.0-2026.11.10.1","fecha":"2026-11-10T12:00:00.000Z",
//    "componentes":{
//     "addon":   {"version":"0.5.0","archivo":"SnetForever-addon-0.5.0.snfpaq","tamano":812345,"sha256":"…","appMinima":"0.5.0","esquemaDatos":1},
//     "rutas":   {"version":"2026.11.10.1","archivo":"SnetForever-rutas-2026.11.10.1.snfpaq","tamano":3123456,"sha256":"…","esquemaDatos":1},
//     "misiones":{"version":"2026.11.10.1","archivo":"SnetForever-misiones-2026.11.10.1.snfpaq","tamano":3456789,"sha256":"…","esquemaDatos":1},
//     "comercio":{"version":"0.7.0","archivo":"SnetForever-comercio-0.7.0.snfpaq","tamano":345678,"sha256":"…","appMinima":"0.7.0"},
//     "app":     {"version":"0.5.0","archivo":"SnetForever-app-0.5.0.snfpaq","tamano":234567,"sha256":"…","nodeMinimo":"24.0.0"}},
//    "notas":{"es":"…","en":"…"}}
//
// - La firma es Ed25519 (`crypto.sign(null, …)`) sobre los bytes exactos del manifiesto, en
//   `snetforever-manifiesto.json.sig`: el base64 de sus 64 bytes y un salto de línea. Se verifica antes de leer nada.
// - Faltan componentes: vale (se publica solo lo que cambia). Los que no se conocen se ignoran, y de cada componente solo
//   pasan las claves de F1: la carpeta de destino la fija la app (F3), nunca el manifiesto.
// - **Comercio (0.7.0, Task 8):** `comercio` es el addon SnetForever_Comercio. No lleva esquema de datos (no trae datos
//   convertidos) y sí puede llevar `appMinima`. Una app 0.6.x lo ignora (es un componente que no conoce), así que se puede
//   publicar en el mismo manifiesto sin romper a las apps ya instaladas.
// - **Esquema de datos (F5-2):** el addon declara en `esquemaDatos` el esquema de datos que pide y los dos addons de datos
//   el que tienen; es el mismo campo que la cabecera de su paquete (tarea 4). El addon y los datos publicados en un mismo
//   manifiesto tienen que pedir el mismo, y cada paquete tiene que decir en su cabecera lo mismo que su entrada
//   (`comprobarPaquete`). La app no lleva esquema de datos. Lo instalado lo compara la tarea 9.
//
// Aquí no hay red ni disco: solo bytes que llegan y objetos que salen.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { CARPETAS, abrirPaquete } from './paquete.mjs';
/**
 * La primera versión de la app que sabe instalar el addon de comercio (SnetForever_Comercio, 0.7.0). El núcleo y el comercio
 * se publican con `appMinima` de al menos esta versión y `publicar` se niega a publicar el comercio con una app anterior:
 * un núcleo 0.7.0 ya no lleva el comercio dentro, así que solo puede instalarse junto al comercio, con una app que lo conozca.
 */
export const APP_CONOCE_COMERCIO = '0.7.0';
export const MAX_MANIFIESTO = 65536;
export const MAX_FIRMA = 1024;
/**
 * Error de un manifiesto (o de un paquete frente a su entrada del manifiesto). `code`:
 * - `'json'`: no es un Buffer, pasa de `MAX_MANIFIESTO`, no es UTF-8, no es JSON o no es un objeto;
 * - `'esquema'`: `esquema` no es 1;
 * - `'producto'`: `producto` no es `SnetForever`;
 * - `'publicacion'`: no cumple `^v\d+\.\d+\.\d+(-[0-9.]+)?$`;
 * - `'fecha'`: no es ISO 8601 en UTC (`AAAA-MM-DDThh:mm:ss[.mmm]Z`) o no es una fecha que exista;
 * - `'componente'`: `componentes` o una entrada no son objetos, un esquema de datos que falta o no es válido (o está en
 *   la app), o el componente que se pide no está en el manifiesto;
 * - `'version'`: una `version`, `appMinima` o `nodeMinimo` no cumple `^\d+(\.\d+){1,3}$`, o la cabecera del paquete dice
 *   otra versión;
 * - `'archivo'`: `archivo` no es exactamente `SnetForever-<componente>-<version>.snfpaq`;
 * - `'tamano'`: `tamano` no es un entero entre 1 y 150 MiB, o el paquete no mide eso;
 * - `'hash'`: `sha256` no son 64 cifras hexadecimales en minúscula, o el del paquete no cuadra;
 * - `'compatibilidad'` (F5-2): el addon y los datos del manifiesto piden esquemas de datos distintos, o la cabecera del
 *   paquete dice otro esquema de datos que su entrada.
 */
export class ErrorManifiesto extends Error {
    constructor(code, mensaje, opciones) {
        super(mensaje, opciones);
        this.name = 'ErrorManifiesto';
        this.code = code;
    }
}
const COMPONENTES = Object.keys(CARPETAS); // addon, rutas, misiones, comercio, app (F3)
const CON_ESQUEMA = ['addon', 'rutas', 'misiones'];
// Los de AddOns, en el orden en que se ofrecen: el comercio va después del addon, del que depende (## Dependencies).
const EN_ADDONS = ['addon', 'rutas', 'misiones', 'comercio'];
const VERSION = /^\d+(\.\d+){1,3}$/;
const PUBLICACION = /^v\d+\.\d+\.\d+(-[0-9.]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FECHA = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?Z$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PEM_PUBLICA = /^-----BEGIN PUBLIC KEY-----\r?\n/;
const MAX_TAMANO = 150 * 2 ** 20;
const BYTES_FIRMA = 64;
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const citar = (x) => JSON.stringify(x);
const error = (code, texto, opciones) => new ErrorManifiesto(code, `Manifiesto no válido: ${texto}`, opciones);
function congelar(objeto) {
    for (const v of Object.values(objeto))
        if (esObjeto(v))
            congelar(v);
    return Object.freeze(objeto);
}
// Las partes de una versión, sin ceros a la izquierda (para compararlas como texto, sin perder precisión).
function partes(version) {
    if (typeof version !== 'string' || !VERSION.test(version))
        throw new ErrorManifiesto('version', `Versión no válida: ${citar(version)}`);
    return version.split('.').map((p) => p.replace(/^0+(?=\d)/, ''));
}
function compararParte(a, b) {
    if (a.length !== b.length)
        return a.length < b.length ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
}
/**
 * Compara dos versiones `^\d+(\.\d+){1,3}$` numéricamente por partes, con ceros a la derecha (`'0.5.0'` = `'0.5'` y
 * `'0.5.0.1'` > `'0.5.0'`). Una versión que no es válida lanza ErrorManifiesto `'version'`.
 * @returns {-1|0|1}
 */
export function compararVersiones(a, b) {
    const pa = partes(a);
    const pb = partes(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const r = compararParte(pa[i] ?? '0', pb[i] ?? '0');
        if (r !== 0)
            return r;
    }
    return 0;
}
/**
 * Verifica la firma Ed25519 de `bytes` (los del manifiesto, tal cual llegan). `firmaTexto` es el contenido del `.sig`
 * (texto o Buffer): el base64 canónico de 64 bytes, con un salto de línea al final o sin él. Da `false` si la clave es
 * `null` o no es una pública Ed25519 en PEM, si la firma pasa de `MAX_FIRMA`, no es base64 o no mide 64 bytes, o si
 * `crypto.verify` falla. Nunca lanza.
 * @param {Buffer} bytes
 * @param {string|Buffer} firmaTexto
 * @param {string|null} clavePublicaPem PEM SPKI (`CLAVE_PUBLICA`)
 * @returns {boolean}
 */
export function verificarFirma(bytes, firmaTexto, clavePublicaPem) {
    try {
        if (!(bytes instanceof Uint8Array))
            return false;
        // una privada en PEM también daría su pública: se exige una pública, para que nunca acabe una privada en la app
        if (typeof clavePublicaPem !== 'string' || !PEM_PUBLICA.test(clavePublicaPem.trimStart()))
            return false;
        if (firmaTexto instanceof Uint8Array) {
            if (firmaTexto.length > MAX_FIRMA)
                return false;
            firmaTexto = Buffer.from(firmaTexto).toString('latin1');
        }
        if (typeof firmaTexto !== 'string' || firmaTexto.length > MAX_FIRMA)
            return false;
        const texto = firmaTexto.replace(/\r?\n$/, '');
        if (!BASE64.test(texto))
            return false;
        const firma = Buffer.from(texto, 'base64');
        if (firma.length !== BYTES_FIRMA || firma.toString('base64') !== texto)
            return false;
        const clave = createPublicKey(clavePublicaPem);
        if (clave.type !== 'public' || clave.asymmetricKeyType !== 'ed25519')
            return false;
        return verify(null, bytes, clave, firma) === true;
    }
    catch {
        return false;
    }
}
// ¿Es una fecha ISO 8601 en UTC que existe? (`2026-02-30T…` no existe: Date la pasaría al 2 de marzo.)
function fechaValida(fecha) {
    if (typeof fecha !== 'string')
        return false;
    const m = FECHA.exec(fecha);
    if (!m)
        return false;
    const t = Date.parse(fecha);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 19) === m[1];
}
function comprobarVersionDe(componente, campo, valor) {
    if (typeof valor !== 'string' || !VERSION.test(valor)) {
        throw error('version', `«${campo}» no válida en «${componente}»: ${citar(valor)}`);
    }
}
// Una entrada de F1, comprobada y sin claves de más.
function entradaDe(componente, e) {
    if (!esObjeto(e))
        throw error('componente', `la entrada de «${componente}» no es un objeto`);
    comprobarVersionDe(componente, 'version', e.version);
    if (e.archivo !== `SnetForever-${componente}-${e.version}.snfpaq`) {
        throw error('archivo', `«${componente}» ${e.version} no puede ir en el archivo ${citar(e.archivo)}`);
    }
    if (!Number.isSafeInteger(e.tamano) || e.tamano < 1 || e.tamano > MAX_TAMANO) {
        throw error('tamano', `tamaño no válido en «${componente}»: ${citar(e.tamano)}`);
    }
    if (typeof e.sha256 !== 'string' || !SHA256.test(e.sha256))
        throw error('hash', `sha256 no válido en «${componente}»`);
    const salida = { version: e.version, archivo: e.archivo, tamano: e.tamano, sha256: e.sha256 };
    if ((componente === 'addon' || componente === 'comercio') && e.appMinima !== undefined) {
        comprobarVersionDe(componente, 'appMinima', e.appMinima);
        salida.appMinima = e.appMinima;
    }
    if (componente === 'app' && e.nodeMinimo !== undefined) {
        comprobarVersionDe(componente, 'nodeMinimo', e.nodeMinimo);
        salida.nodeMinimo = e.nodeMinimo;
    }
    if (CON_ESQUEMA.includes(componente)) {
        if (!Number.isSafeInteger(e.esquemaDatos) || e.esquemaDatos < 1) {
            throw error('componente', `«${componente}» necesita un esquema de datos (entero de 1 en adelante), no ${citar(e.esquemaDatos)}`);
        }
        salida.esquemaDatos = e.esquemaDatos;
    }
    else if (e.esquemaDatos !== undefined) {
        throw error('componente', `«${componente}» no lleva esquema de datos`);
    }
    return salida;
}
/**
 * Comprueba un manifiesto ya leído como objeto (F1 y F5-2) y devuelve una copia congelada con solo lo que conoce. Es lo
 * que hace `leerManifiesto` tras leer el JSON; las herramientas (tarea 15) lo usan antes de escribir el suyo.
 * @returns {Manifiesto}
 * @throws {ErrorManifiesto}
 */
export function validarManifiesto(m) {
    if (!esObjeto(m))
        throw error('json', 'no es un objeto');
    if (m.esquema !== 1)
        throw error('esquema', `esquema ${citar(m.esquema)} (esta app solo entiende el 1)`);
    if (m.producto !== 'SnetForever')
        throw error('producto', `producto ${citar(m.producto)}`);
    if (typeof m.publicacion !== 'string' || !PUBLICACION.test(m.publicacion))
        throw error('publicacion', `publicación ${citar(m.publicacion)}`);
    if (!fechaValida(m.fecha))
        throw error('fecha', `fecha ${citar(m.fecha)} (tiene que ser ISO 8601 en UTC)`);
    if (!esObjeto(m.componentes))
        throw error('componente', 'falta el objeto «componentes»');
    const componentes = {};
    for (const c of COMPONENTES)
        if (Object.hasOwn(m.componentes, c))
            componentes[c] = entradaDe(c, m.componentes[c]);
    const esquemas = CON_ESQUEMA.filter((c) => componentes[c]).map((c) => [c, componentes[c].esquemaDatos]);
    for (const [c, esquema] of esquemas.slice(1)) {
        if (esquema !== esquemas[0][1]) {
            throw error('compatibilidad', `«${esquemas[0][0]}» pide el esquema de datos ${esquemas[0][1]} y «${c}» trae el ${esquema}`);
        }
    }
    const notas = esObjeto(m.notas) ? m.notas : {};
    return congelar({
        esquema: 1,
        producto: m.producto,
        publicacion: m.publicacion,
        fecha: m.fecha,
        componentes,
        notas: { es: typeof notas.es === 'string' ? notas.es : '', en: typeof notas.en === 'string' ? notas.en : '' },
    });
}
/**
 * Lee y comprueba un manifiesto F1. Hay que verificar antes su firma (`verificarFirma`) sobre estos mismos bytes.
 * @typedef {{version: string, archivo: string, tamano: number, sha256: string, appMinima?: string, nodeMinimo?: string,
 *   esquemaDatos?: number}} Entrada
 * @typedef {{esquema: 1, producto: 'SnetForever', publicacion: string, fecha: string,
 *   componentes: {addon?: Entrada, rutas?: Entrada, misiones?: Entrada, comercio?: Entrada, app?: Entrada}, notas: {es: string, en: string}}} Manifiesto
 * @param {Buffer} bytes
 * @returns {Manifiesto} congelado
 * @throws {ErrorManifiesto}
 */
export function leerManifiesto(bytes) {
    if (!(bytes instanceof Uint8Array))
        throw error('json', 'no es un Buffer');
    if (bytes.length > MAX_MANIFIESTO)
        throw error('json', `mide ${bytes.length} bytes y el máximo es ${MAX_MANIFIESTO}`);
    let objeto;
    try {
        objeto = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    catch (e) {
        throw error('json', 'no es JSON en UTF-8', { cause: e });
    }
    return validarManifiesto(objeto);
}
/**
 * F5-2 y vigilancia 2: comprueba que `buffer` es el paquete que anuncia el manifiesto para `componente` (tamaño y
 * SHA-256, antes de abrirlo), lo abre entero con `abrirPaquete` y comprueba que su cabecera dice la misma versión y el
 * mismo esquema de datos que su entrada. Devuelve el paquete abierto.
 * @param {Manifiesto} manifiesto el de `leerManifiesto`
 * @param {'addon'|'rutas'|'misiones'|'comercio'|'app'} componente
 * @param {Buffer} buffer
 * @param {{maxDescomprimido?: number}} [opciones] se pasan a `abrirPaquete`
 * @throws {ErrorManifiesto} `'componente'`, `'tamano'`, `'hash'`, `'version'` o `'compatibilidad'`; o el ErrorPaquete
 *   de `abrirPaquete` si el paquete no vale por dentro
 */
export function comprobarPaquete(manifiesto, componente, buffer, opciones = {}) {
    const lista = manifiesto?.componentes;
    if (!COMPONENTES.includes(componente) || !esObjeto(lista) || !Object.hasOwn(lista, componente)) {
        throw new ErrorManifiesto('componente', `El manifiesto no trae el componente ${citar(componente)}`);
    }
    const entrada = lista[componente];
    if (!(buffer instanceof Uint8Array) || buffer.length !== entrada.tamano) {
        throw new ErrorManifiesto('tamano', `El paquete de «${componente}» no mide ${entrada.tamano} bytes`);
    }
    if (createHash('sha256').update(buffer).digest('hex') !== entrada.sha256) {
        throw new ErrorManifiesto('hash', `El SHA-256 del paquete de «${componente}» no es el del manifiesto`);
    }
    const abierto = abrirPaquete(buffer, { ...opciones, componente });
    if (abierto.version !== entrada.version) {
        throw new ErrorManifiesto('version', `El paquete de «${componente}» es la versión ${abierto.version} y el manifiesto dice ${entrada.version}`);
    }
    if (abierto.esquemaDatos !== entrada.esquemaDatos) {
        throw new ErrorManifiesto('compatibilidad', `El paquete de «${componente}» dice el esquema de datos ${citar(abierto.esquemaDatos)} y el manifiesto ${citar(entrada.esquemaDatos)}`);
    }
    return abierto;
}
/**
 * Qué trae el manifiesto que no esté instalado ya.
 * - `antiguo` si su `fecha` es anterior a `ultimaFecha` (la del último manifiesto aceptado): entonces la lista va vacía,
 *   porque un manifiesto viejo bien firmado no puede ofrecer nada (vuelta atrás).
 * - Entra un componente con una versión mayor que la instalada (`null` = no instalado, y entra). Nunca una igual o menor.
 * - `app` con un `nodeMinimo` mayor que `versionNode` → `requiereInstalador` (las actualizaciones nunca cambian Node).
 * - `addon` (y `comercio`, que también puede llevarla) con un `appMinima` mayor que la app que quedará (la nueva si la app
 *   entra sin `requiereInstalador`; si no, la de ahora) → `saltado: 'app_minima'`. F5-2: los datos y el comercio que entran
 *   con ese addon se saltan también (con el mismo motivo), para no dejar datos ni comercio nuevos con el addon viejo.
 * - El orden de la lista es el de instalación: addon, rutas, misiones, comercio y, la última, la app.
 * @param {Manifiesto} manifiesto
 * @param {{instalado: {addon: string|null, rutas: string|null, misiones: string|null, comercio?: string|null}, versionApp: string,
 *   versionNode: string, ultimaFecha?: string|null}} contexto
 * @returns {{antiguo: boolean, lista: {componente: string, de: string|null, a: string, requiereInstalador?: true,
 *   saltado?: 'app_minima'}[]}}
 * @throws {TypeError} si `ultimaFecha` no es null y no es una fecha ISO 8601 en UTC; {ErrorManifiesto} `'version'` si una
 *   versión de `contexto` no es válida
 */
export function novedades(manifiesto, { instalado = {}, versionApp, versionNode, ultimaFecha = null } = {}) {
    if (ultimaFecha !== null && ultimaFecha !== undefined) {
        if (!fechaValida(ultimaFecha))
            throw new TypeError(`ultimaFecha no válida: ${citar(ultimaFecha)}`);
        if (Date.parse(manifiesto.fecha) < Date.parse(ultimaFecha))
            return { antiguo: true, lista: [] };
    }
    const { componentes } = manifiesto;
    const nueva = (c, de) => Object.hasOwn(componentes, c) && (de === null || compararVersiones(componentes[c].version, de) > 0);
    let app = null;
    if (nueva('app', versionApp)) {
        app = { componente: 'app', de: versionApp, a: componentes.app.version };
        const { nodeMinimo } = componentes.app;
        if (nodeMinimo !== undefined && compararVersiones(nodeMinimo, versionNode) > 0)
            app.requiereInstalador = true;
    }
    const appQueQueda = app && !app.requiereInstalador ? app.a : versionApp;
    const lista = [];
    let addonSaltado = false;
    for (const c of EN_ADDONS) {
        const de = instalado?.[c] ?? null;
        if (!nueva(c, de))
            continue;
        const item = { componente: c, de, a: componentes[c].version };
        if (c === 'addon' || c === 'comercio') {
            const { appMinima } = componentes[c];
            if (appMinima !== undefined && compararVersiones(appMinima, appQueQueda) > 0) {
                item.saltado = 'app_minima';
                if (c === 'addon')
                    addonSaltado = true;
            }
        }
        // los datos y el comercio no se quedan con el addon viejo: si el nuevo se salta, se saltan con él
        if (c !== 'addon' && addonSaltado)
            item.saltado = 'app_minima';
        lista.push(item);
    }
    if (app)
        lista.push(app);
    return { antiguo: false, lista };
}
