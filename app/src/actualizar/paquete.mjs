// Paquetes `.snfpaq` (formato F2 del plan de la fase 5; tarea 4; vigilancia 2).
//
// Un paquete es el gzip (nivel 9) de:
//
//   SNFPAQ1\n
//   {"componente":"addon","version":"0.5.0","esquemaDatos":1,"archivos":[{"ruta":"SnetForever/SnetForever.toc","tamano":612,"sha256":"…"},…]}\n
//   <bytes del archivo 1><bytes del archivo 2>…
//
// - `archivos` va ordenado por `ruta` (por unidades de código, como `<` entre cadenas) y las rutas usan «/».
// - El primer segmento de cada ruta es la carpeta del componente (F3, `CARPETAS`), con esas mismas mayúsculas.
// - Cada segmento cumple `^[A-Za-z0-9 _.()+-]+$`, no es «.» ni «..», no acaba en punto ni en espacio y no es un nombre
//   reservado de Windows (CON, PRN, AUX, NUL, COM1-9, LPT1-9, con o sin extensión y sin distinguir mayúsculas).
// - Una ruta mide 200 caracteres como mucho y no hay dos iguales sin distinguir mayúsculas (ni un archivo que sea también
//   la carpeta de otro).
// - La suma de los `tamano` es exactamente lo que queda tras la cabecera, y cada archivo tiene su SHA-256.
// - Como mucho 5.000 archivos y 300 MiB descomprimidos (`maxOutputLength` de zlib: no se descomprime más que eso).
// - **Esquema de datos (F5-2):** el addon lleva en `esquemaDatos` el esquema de datos que pide, y los dos addons de datos
//   el que tienen (hoy, 1). La app y el addon de comercio (0.7.0, sin datos convertidos) no lo llevan. Así nunca se instala un addon sin sus datos compatibles (lo comparan las
//   tareas 5 y 9).
//
// Es determinista: no guarda fechas ni permisos, y gzip no lleva fecha (con la misma versión de Node, el mismo árbol da
// los mismos bytes). Basura tras el gzip da `'formato'`; otro gzip pegado detrás se descomprime a continuación (y sus
// bytes de más dan `'tamano'`). La integridad del archivo entero la da el SHA-256 del manifiesto (tareas 5 y 9); aquí
// se comprueba todo lo que hay dentro.
//
// Aquí no se borra nada: se escribe solo en carpetas nuevas y con `wx` (nunca se pisa un archivo).
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { constants as constantesBuffer } from 'node:buffer';
import { gunzipSync, gzipSync } from 'node:zlib';
/** Componentes y la carpeta de cada uno dentro del paquete (F3). La carpeta de destino la fija la app, nunca el paquete. */
export const CARPETAS = Object.freeze({
    addon: 'SnetForever', rutas: 'SnetForever_Rutas', misiones: 'SnetForever_Misiones', comercio: 'SnetForever_Comercio', app: 'app',
});
// Los que no llevan esquema de datos: la app y, desde la 0.7.0, el addon de comercio (no trae datos convertidos).
const SIN_ESQUEMA = new Set(['app', 'comercio']);
export const MAGIA = 'SNFPAQ1\n';
export const MAX_ARCHIVOS = 5000;
export const MAX_DESCOMPRIMIDO = 300 * 2 ** 20;
export const MAX_RUTA = 200;
/**
 * Error de un paquete. `code`:
 * - `'formato'`: no es un gzip, falta `SNFPAQ1`, la cabecera no es JSON o no tiene la forma de F2 (versión, tamaños,
 *   hashes, claves de más, archivos sin ordenar, esquema de datos que falta o sobra);
 * - `'componente'`: el componente no se conoce, no es el que se espera o una ruta no empieza por su carpeta;
 * - `'ruta'`: una ruta no cumple las reglas de F2 (o, al empaquetar, hay algo que no es archivo ni carpeta);
 * - `'duplicado'`: dos rutas iguales sin distinguir mayúsculas, o un archivo que es también la carpeta de otro;
 * - `'tamano'`: la suma de los tamaños no es lo que queda tras la cabecera;
 * - `'hash'`: el SHA-256 de un archivo no cuadra;
 * - `'demasiado'`: más de 5.000 archivos o más de `maxDescomprimido` bytes descomprimidos;
 * - `'destino'`: la carpeta donde se iba a extraer ya existe.
 */
export class ErrorPaquete extends Error {
    constructor(code, mensaje, opciones) {
        super(mensaje, opciones);
        this.name = 'ErrorPaquete';
        this.code = code;
    }
}
const SEGMENTO = /^[A-Za-z0-9 _.()+-]+$/;
// Windows también toma como dispositivo «CON .txt» (quita los espacios antes de la extensión).
const RESERVADO = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]) *(?:\..*)?$/i;
const VERSION = /^\d+(\.\d+){1,3}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CLAVES_CABECERA = new Set(['componente', 'version', 'esquemaDatos', 'archivos']);
const CLAVES_ARCHIVO = ['ruta', 'tamano', 'sha256'];
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const esComponente = (c) => typeof c === 'string' && Object.hasOwn(CARPETAS, c);
const orden = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (datos) => createHash('sha256').update(datos).digest('hex');
const formato = (texto, opciones) => new ErrorPaquete('formato', `Paquete no válido: ${texto}`, opciones);
const citar = (x) => JSON.stringify(x);
function existe(ruta) {
    try {
        lstatSync(ruta);
        return true;
    }
    catch {
        return false;
    }
}
function comprobarComponente(componente, texto = 'componente desconocido') {
    if (!esComponente(componente))
        throw new ErrorPaquete('componente', `${texto}: ${citar(componente)}`);
}
function comprobarVersion(version) {
    if (typeof version !== 'string' || !VERSION.test(version))
        throw formato(`versión no válida: ${citar(version)}`);
}
// F5-2: el addon y los datos llevan un entero ≥ 1; la app y el comercio, nada.
function comprobarEsquema(componente, esquemaDatos) {
    if (SIN_ESQUEMA.has(componente)) {
        if (esquemaDatos !== undefined)
            throw formato(`«${componente}» no lleva esquema de datos`);
    }
    else if (!Number.isSafeInteger(esquemaDatos) || esquemaDatos < 1) {
        throw formato(`el componente «${componente}» necesita un esquema de datos (entero de 1 en adelante), no ${citar(esquemaDatos)}`);
    }
}
/** Los segmentos de una ruta de F2, o ErrorPaquete `'ruta'`. */
function segmentosDe(ruta) {
    const mala = (porque) => new ErrorPaquete('ruta', `Ruta no válida en el paquete (${porque}): ${citar(ruta)}`);
    if (typeof ruta !== 'string' || ruta.length === 0)
        throw mala('vacía');
    if (ruta.length > MAX_RUTA)
        throw mala(`más de ${MAX_RUTA} caracteres`);
    const segmentos = ruta.split('/');
    if (segmentos.length < 2)
        throw mala('falta la carpeta del componente');
    for (const s of segmentos) {
        if (!SEGMENTO.test(s))
            throw mala(`segmento ${citar(s)} con caracteres no permitidos o vacío`);
        if (s === '.' || s === '..')
            throw mala(`segmento ${citar(s)}`);
        if (s.endsWith('.') || s.endsWith(' '))
            throw mala(`segmento ${citar(s)} acabado en punto o espacio`);
        if (RESERVADO.test(s))
            throw mala(`nombre reservado de Windows ${citar(s)}`);
    }
    return segmentos;
}
/**
 * Comprueba las rutas de un componente: cada una con las reglas de F2, que empiecen por su carpeta y que no haya dos
 * iguales sin distinguir mayúsculas (ni un archivo que sea también carpeta de otro). Devuelve los segmentos de cada una.
 */
function comprobarRutas(componente, rutas) {
    const carpeta = CARPETAS[componente];
    const lista = rutas.map((ruta) => {
        const segmentos = segmentosDe(ruta);
        if (segmentos[0] !== carpeta) {
            throw new ErrorPaquete('componente', `La ruta ${citar(ruta)} no está en la carpeta «${carpeta}» del componente «${componente}»`);
        }
        return segmentos;
    });
    const vistas = new Set();
    for (const ruta of rutas) {
        const clave = ruta.toLowerCase();
        if (vistas.has(clave))
            throw new ErrorPaquete('duplicado', `Ruta repetida en el paquete (sin distinguir mayúsculas): ${citar(ruta)}`);
        vistas.add(clave);
    }
    for (const segmentos of lista) {
        for (let i = 2; i < segmentos.length; i++) {
            const carpetaIntermedia = segmentos.slice(0, i).join('/');
            if (vistas.has(carpetaIntermedia.toLowerCase())) {
                throw new ErrorPaquete('duplicado', `${citar(carpetaIntermedia)} es a la vez un archivo y una carpeta en el paquete`);
            }
        }
    }
    return lista;
}
/**
 * Empaqueta `<raiz>\<CARPETAS[componente]>` entera (formato F2, determinista).
 * @param {object} p
 * @param {'addon'|'rutas'|'misiones'|'comercio'|'app'} p.componente
 * @param {string} p.version `^\d+(\.\d+){1,3}$`
 * @param {string} p.raiz carpeta que contiene la del componente (p. ej. `addons` del repositorio, o el repositorio para `app`)
 * @param {string[]} [p.excluir] prefijos de ruta (con «/», sin distinguir mayúsculas) que se dejan fuera, p. ej.
 *   `['app/test/', 'app/node_modules/']`; una carpeta cuya ruta con «/» al final empieza por uno no se llega a leer
 * @param {number} [p.esquemaDatos] (F5-2) obligatorio salvo en la app y el comercio, que no lo llevan: el esquema de datos que pide el addon, o el que
 *   tienen los datos
 * @returns {Buffer}
 */
export function empaquetar({ componente, version, raiz, excluir = [], esquemaDatos } = {}) {
    comprobarComponente(componente);
    comprobarVersion(version);
    comprobarEsquema(componente, esquemaDatos);
    const fuera = excluir.map((p) => String(p).replace(/\\/g, '/').toLowerCase());
    const excluida = (ruta) => fuera.some((p) => ruta.toLowerCase().startsWith(p));
    const enDisco = (ruta) => join(raiz, ...ruta.split('/'));
    const carpeta = CARPETAS[componente];
    const encontradas = [];
    const recorrer = (rel) => {
        for (const nombre of readdirSync(enDisco(rel))) {
            const ruta = `${rel}/${nombre}`;
            const info = lstatSync(enDisco(ruta));
            if (info.isDirectory()) {
                if (!excluida(`${ruta}/`))
                    recorrer(ruta);
            }
            else if (info.isFile()) {
                if (!excluida(ruta))
                    encontradas.push(ruta);
            }
            else {
                throw new ErrorPaquete('ruta', `${citar(ruta)} no es un archivo ni una carpeta (¿un enlace o una unión?): no se empaqueta`);
            }
        }
    };
    const info = lstatSync(enDisco(carpeta)); // ENOENT, con la ruta en el mensaje, si no existe
    if (!info.isDirectory())
        throw new ErrorPaquete('ruta', `«${enDisco(carpeta)}» no es una carpeta normal: no se empaqueta`);
    recorrer(carpeta);
    encontradas.sort(orden);
    if (encontradas.length > MAX_ARCHIVOS)
        throw new ErrorPaquete('demasiado', `Más de ${MAX_ARCHIVOS} archivos en «${carpeta}»`);
    comprobarRutas(componente, encontradas);
    const datos = encontradas.map((ruta) => readFileSync(enDisco(ruta)));
    const cabecera = {
        componente,
        version,
        ...(SIN_ESQUEMA.has(componente) ? {} : { esquemaDatos }),
        archivos: encontradas.map((ruta, i) => ({ ruta, tamano: datos[i].length, sha256: sha256(datos[i]) })),
    };
    const linea = Buffer.from(`${MAGIA}${JSON.stringify(cabecera)}\n`, 'utf8');
    const total = datos.reduce((s, d) => s + d.length, linea.length);
    if (total > MAX_DESCOMPRIMIDO)
        throw new ErrorPaquete('demasiado', `«${carpeta}» ocupa más de ${MAX_DESCOMPRIMIDO} bytes`);
    return gzipSync(Buffer.concat([linea, ...datos], total), { level: 9 });
}
function comprobarCabecera(cab) {
    if (!esObjeto(cab))
        throw formato('la cabecera no es un objeto');
    for (const k of Object.keys(cab))
        if (!CLAVES_CABECERA.has(k))
            throw formato(`clave desconocida en la cabecera: ${citar(k)}`);
    if (typeof cab.componente !== 'string')
        throw formato('falta el componente');
    comprobarVersion(cab.version);
    if (!Array.isArray(cab.archivos))
        throw formato('falta la lista de archivos');
    if (cab.archivos.length > MAX_ARCHIVOS)
        throw new ErrorPaquete('demasiado', `Más de ${MAX_ARCHIVOS} archivos en el paquete`);
    for (const a of cab.archivos) {
        const claves = esObjeto(a) ? Object.keys(a) : [];
        if (claves.length !== CLAVES_ARCHIVO.length || !CLAVES_ARCHIVO.every((k) => Object.hasOwn(a, k))) {
            throw formato(`entrada de archivo no válida: ${citar(a)}`);
        }
        if (typeof a.ruta !== 'string')
            throw formato(`ruta que no es texto: ${citar(a.ruta)}`);
        if (!Number.isSafeInteger(a.tamano) || a.tamano < 0)
            throw formato(`tamaño no válido en ${citar(a.ruta)}: ${citar(a.tamano)}`);
        if (typeof a.sha256 !== 'string' || !SHA256.test(a.sha256))
            throw formato(`sha256 no válido en ${citar(a.ruta)}`);
    }
}
// Abre y comprueba un paquete. `esperado` es el componente que se espera, o null para aceptar el de la cabecera (solo
// `desempaquetar`, para mirar dentro de un paquete sin saber de qué es).
function abrir(paquete, esperado, maxDescomprimido) {
    if (!Number.isSafeInteger(maxDescomprimido) || maxDescomprimido < 1 || maxDescomprimido > constantesBuffer.MAX_LENGTH) {
        throw new RangeError(`maxDescomprimido no válido: ${citar(maxDescomprimido)}`);
    }
    if (!(paquete instanceof Uint8Array))
        throw formato('no es un Buffer');
    let plano;
    try {
        plano = gunzipSync(paquete, { maxOutputLength: maxDescomprimido });
    }
    catch (e) {
        if (e?.code === 'ERR_BUFFER_TOO_LARGE') {
            throw new ErrorPaquete('demasiado', `El paquete pasa de ${maxDescomprimido} bytes descomprimido`, { cause: e });
        }
        throw formato('no es un gzip válido', { cause: e });
    }
    if (plano.length < MAGIA.length || plano.toString('latin1', 0, MAGIA.length) !== MAGIA)
        throw formato('no empieza por SNFPAQ1');
    const fin = plano.indexOf(0x0a, MAGIA.length);
    if (fin < 0)
        throw formato('la cabecera no acaba en un salto de línea');
    let cab;
    try {
        cab = JSON.parse(plano.toString('utf8', MAGIA.length, fin));
    }
    catch (e) {
        throw formato('la cabecera no es JSON', { cause: e });
    }
    comprobarCabecera(cab);
    comprobarComponente(cab.componente, 'Componente desconocido en la cabecera');
    if (esperado !== null && cab.componente !== esperado) {
        throw new ErrorPaquete('componente', `El paquete es del componente «${cab.componente}» y se esperaba «${esperado}»`);
    }
    comprobarEsquema(cab.componente, cab.esquemaDatos);
    const rutas = cab.archivos.map((a) => a.ruta);
    comprobarRutas(cab.componente, rutas);
    for (let i = 1; i < rutas.length; i++) {
        if (orden(rutas[i - 1], rutas[i]) >= 0)
            throw formato(`los archivos no van ordenados por ruta (${citar(rutas[i])})`);
    }
    const datos = plano.subarray(fin + 1);
    const suma = cab.archivos.reduce((s, a) => s + a.tamano, 0);
    if (suma !== datos.length) {
        throw new ErrorPaquete('tamano', `La cabecera anuncia ${suma} bytes y tras ella hay ${datos.length}`);
    }
    let pos = 0;
    const archivos = cab.archivos.map(({ ruta, tamano, sha256: esperadoSha }) => {
        const trozo = datos.subarray(pos, pos + tamano);
        pos += tamano;
        if (sha256(trozo) !== esperadoSha)
            throw new ErrorPaquete('hash', `El SHA-256 de ${citar(ruta)} no cuadra`);
        return { ruta, datos: trozo };
    });
    return {
        componente: cab.componente,
        version: cab.version,
        ...(cab.esquemaDatos === undefined ? {} : { esquemaDatos: cab.esquemaDatos }),
        archivos,
    };
}
/**
 * Abre un paquete y lo comprueba entero (vigilancia 2) antes de devolver nada.
 * @param {Buffer} paquete
 * @param {{componente: string, maxDescomprimido?: number}} opciones `componente` es el que se espera (obligatorio)
 * @returns {{componente: string, version: string, esquemaDatos?: number, archivos: {ruta: string, datos: Buffer}[]}}
 *   `esquemaDatos` solo en el addon y en los datos (F5-2); `datos` son trozos del paquete descomprimido
 * @throws {ErrorPaquete}
 */
export function abrirPaquete(paquete, { componente, maxDescomprimido = MAX_DESCOMPRIMIDO } = {}) {
    comprobarComponente(componente, 'Componente que se espera no válido');
    return abrir(paquete, componente, maxDescomprimido);
}
/**
 * Escribe los archivos de un paquete abierto en `destino`, que no puede existir (si existe, `'destino'` y no se toca
 * nada). Crea sus carpetas (y las de encima que falten) y escribe cada archivo con `wx`. Antes vuelve a comprobar las
 * rutas, por si `abierto` no salió de `abrirPaquete`.
 *
 * Si falla a mitad (disco lleno, permisos…), lo escrito se queda en `destino` (nunca se borra): `destino` es siempre una
 * carpeta nueva de preparación, y quien llama la aparta a la cuarentena.
 * @param {{componente: string, archivos: {ruta: string, datos: Buffer}[]}} abierto
 * @param {string} destino
 * @param {{quitarPrimero?: boolean}} [opciones] con `quitarPrimero`, sin el primer segmento de cada ruta (la app va a
 *   `{app}\app\<versión>\src\…`, sin el `app\` del paquete)
 * @returns {{archivos: string[]}} las rutas escritas, en el orden del paquete
 * @throws {ErrorPaquete}
 */
export function extraerPaquete(abierto, destino, { quitarPrimero = false } = {}) {
    if (!esObjeto(abierto) || !Array.isArray(abierto.archivos))
        throw formato('no es un paquete abierto');
    for (const a of abierto.archivos) {
        if (!esObjeto(a) || typeof a.ruta !== 'string' || !(a.datos instanceof Uint8Array))
            throw formato(`archivo no válido: ${citar(a?.ruta)}`);
    }
    comprobarComponente(abierto.componente);
    const lista = comprobarRutas(abierto.componente, abierto.archivos.map((a) => a.ruta));
    const yaExiste = (causa) => new ErrorPaquete('destino', `Ya existe «${destino}»: no se extrae nada encima`, causa ? { cause: causa } : undefined);
    if (existe(destino))
        throw yaExiste();
    mkdirSync(dirname(destino), { recursive: true });
    try {
        mkdirSync(destino); // sin recursive: falla con EEXIST si alguien la creó entre medias
    }
    catch (e) {
        if (e?.code === 'EEXIST')
            throw yaExiste(e);
        throw e;
    }
    const archivos = abierto.archivos.map((a, i) => {
        const final = join(destino, ...(quitarPrimero ? lista[i].slice(1) : lista[i]));
        mkdirSync(dirname(final), { recursive: true });
        writeFileSync(final, a.datos, { flag: 'wx' });
        return final;
    });
    return { archivos };
}
const MAX_INTENTOS = 1000;
/**
 * F5-4: mirar dentro de un paquete. Lo lee de `paquete` (ruta de un `.snfpaq`), lo comprueba entero con el componente
 * que diga su cabecera y lo extrae con sus rutas enteras en una carpeta nueva dentro de `carpeta`
 * (`<carpeta>\<nombre del paquete sin .snfpaq>`, o `…-2`, `…-3` si ya existe). No pisa nada: carpeta nueva y `wx`.
 * Si el paquete no vale, lanza su ErrorPaquete sin escribir nada.
 *
 * Es lo que hace `cli desempaquetar <paquete> <carpeta>` (el CLI es de la tarea 12, `src/instalador/cli.mjs`).
 * @param {string} paquete
 * @param {string} carpeta
 * @returns {{carpeta: string, componente: string, version: string, esquemaDatos?: number, archivos: string[]}}
 */
export function desempaquetar(paquete, carpeta) {
    const abierto = abrir(readFileSync(paquete), null, MAX_DESCOMPRIMIDO);
    const nombre = basename(paquete).replace(/\.snfpaq$/i, '') || 'paquete';
    for (let n = 1;; n++) {
        if (n > MAX_INTENTOS)
            throw new ErrorPaquete('destino', `No se encontró una carpeta libre para «${nombre}» en «${carpeta}»`);
        const destino = join(carpeta, n === 1 ? nombre : `${nombre}-${n}`);
        if (existe(destino))
            continue;
        try {
            const { archivos } = extraerPaquete(abierto, destino);
            const { archivos: _, ...datos } = abierto;
            return { carpeta: destino, ...datos, archivos };
        }
        catch (e) {
            if (e?.code !== 'destino' || n >= MAX_INTENTOS)
                throw e; // otro la creó entre medias: la siguiente
        }
    }
}
