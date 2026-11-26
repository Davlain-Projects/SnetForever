// Actualizador del addon, de los datos y de la app (fase 5, tarea 9; vigilancias 1, 2 y 4).
//
// Tres pasos, que quien llama (la bandeja, tarea 13) lanza cuando toca:
//   1. `comprobar()`: baja el manifiesto y su firma (R6), verifica la firma Ed25519 sobre los bytes exactos que llegaron
//      y solo entonces lee el manifiesto (R7), rechaza uno más viejo que el último aceptado (vuelta atrás) y calcula qué
//      trae de nuevo frente a lo instalado (`novedades`, con F5-2 frente a los esquemas instalados);
//   2. `descargar()`: baja los paquetes de esa lista, comprueba su tamaño y su SHA-256 antes de abrirlos, los abre enteros
//      (versión y esquema de datos de su cabecera) y solo si todos valen los guarda en
//      `<datos>\actualizaciones\<publicacion>\<archivo>` (temporal y renombre) y apunta `pendiente`;
//   3. `aplicarSiSePuede()`: vuelve a comprobar el SHA-256 de lo guardado, instala el addon, los datos y el comercio con el juego
//      cerrado (`instalarComponentes`, tarea 8) y después la app (`aplicarApp`, tarea 10), y avisa con `alAplicar`. Una
//      tanda que solo trae la app, o que ya está instalada, no espera al juego (revisión final, m1).
//
// El estado (F4) está en `<datos>\actualizacion.json`, que se reescribe con temporal y renombre:
//   {ultimaComprobacion, ultimaFecha, pendiente: {publicacion, componentes: {<c>: {version, archivo, sha256, tamano}},
//    carpeta}, ultimoError: {codigo, cuando[, roto][, reinstalar]}}
// - `ultimaComprobacion` se apunta en cada comprobación (también si falla); `ultimaFecha` solo con una firma buena y un
//   manifiesto que vale y no es antiguo; `ultimoError` es uno solo (el último) y se quita al salir algo bien.
// - Sin el archivo, el estado está vacío. Si no se puede leer por otra cosa (EBUSY, EPERM, una carpeta…), la operación da
//   error 'fs' y no se escribe nada encima. Uno ilegible va a la cuarentena de datos con el error 'estado_ilegible', y su
//   `ultimaFecha` se rescata en un estado nuevo (ronda 1, I1).
// - Mientras exista `<datos>\estado-roto.json` (tarea 8), `estado()` y `aplicarSiSePuede()` dicen `roto: true`, y
//   `reinstalar: true` si no queda una tanda que reintentar (hay que reinstalar con el instalador).
//
// Nunca lanza: cada fallo sale como `{estado: 'error', codigo}` y va al registro (solo el paso y el código, nunca rutas
// ni nada del jugador; el mismo fallo seguido se apunta una vez). Los códigos son los de red.mjs ('conexion', 'estado',
// 'tiempo'…), los de manifiesto.mjs y paquete.mjs ('hash', 'tamano', 'version', 'compatibilidad'…), los de
// componentes.mjs ('ocupado', 'sin_permiso', 'carpeta'…), los de aquí ('firma', 'antiguo'), 'fs' para un error del
// sistema de archivos y 'fallo' para lo demás.
//
// Nunca se borra nada: lo sustituido, las descargas ya aplicadas o que no cuadran y los temporales van a la cuarentena.
// Aquí no hay red propia: todo pasa por `red` (red.mjs) con las URL de `origen` (origen.mjs).
import fs, { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { obtener } from './red.mjs';
import { crearOrigen } from './origen.mjs';
import { CLAVE_PUBLICA } from './clave-publica.mjs';
import { MAX_FIRMA, MAX_MANIFIESTO, comprobarPaquete, compararVersiones, leerManifiesto, novedades, verificarFirma, } from './manifiesto.mjs';
import { abrirPaquete } from './paquete.mjs';
import { MARCA_ROTO, esquemasInstalados, estadoInstalado, instalarComponentes } from '../instalador/componentes.mjs';
import { escribirAtomico } from '../buzon.mjs';
import { moverDentro } from '../mover.mjs';
import { carpetaDatos, carpetaInstalacion, cuarentenaComponentes, cuarentenaNueva } from '../rutas.mjs';
import { FALLIDA, leerVersion } from './propia.mjs';
import { log } from '../registro.mjs';
import { VERSION } from '../version.mjs';
/** El estado de las actualizaciones (F4), en la carpeta de datos. */
export const ARCHIVO_ESTADO = 'actualizacion.json';
/** Donde se guardan los paquetes bajados, en la carpeta de datos: `<CARPETA_DESCARGAS>\<publicacion>\<archivo>`. */
export const CARPETA_DESCARGAS = 'actualizaciones';
const EN_ADDONS = ['addon', 'rutas', 'misiones', 'comercio'];
const DATOS = ['rutas', 'misiones'];
// Los que cuentan para el esquema de datos (F5-2): el comercio (0.7.0) no lleva datos convertidos, no tiene esquema.
const CON_ESQUEMA = ['addon', ...DATOS];
const ORDEN = [...EN_ADDONS, 'app'];
const PUBLICACION = /^v\d+\.\d+\.\d+(-[0-9.]+)?$/;
const FORMA_VERSION = /^\d+(\.\d+){1,3}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FECHA = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?Z$/;
// Errores al aplicar que no se arreglan reintentando con los mismos paquetes: lo pendiente se descarta (a la cuarentena)
// y la próxima comprobación lo vuelve a ofrecer y a bajar ('hash': lo guardado cambió en el disco; también un paquete
// guardado que ya no está, ENOENT). Los demás ('ocupado', 'sin_permiso', 'fs'…) se reintentan.
// 'fallida' (tarea 10, ronda 1, I2): la versión de la app ya no arrancó; solo se ofrece otra vez una más nueva.
const SIN_ARREGLO = new Set(['hash', 'paquete', 'compatibilidad', 'ruta_larga', 'desarrollo', 'fallida']);
const BASE_DESCARGA = 30_000;
const BLOQUE_DESCARGA = 50 * 1024;
const TOPE_DESCARGA = 600_000;
/**
 * Revisión final, I2: lo más que puede tardar la descarga de un paquete de `tamano` bytes (el reloj de red.mjs cuenta la
 * petición entera, redirecciones incluidas): 30 s y 1 s más por cada 50 KB (unos 32 KB/s como mínimo con los datos de
 * verdad, de 2,4 y 2,8 MB), hasta 10 min. El manifiesto y la firma siguen con los 30 s de red.mjs.
 * @param {number} tamano el `tamano` del manifiesto
 * @returns {number} ms
 */
export function tiempoDescarga(tamano) {
    const bloques = Number.isSafeInteger(tamano) && tamano > 0 ? Math.ceil(tamano / BLOQUE_DESCARGA) : 0;
    return Math.min(TOPE_DESCARGA, BASE_DESCARGA + bloques * 1000);
}
/**
 * Error de este archivo. `code`: 'firma' (la firma del manifiesto no es buena), 'antiguo' (vuelta atrás), 'tamano',
 * 'hash', 'compatibilidad' (F5-2 al aplicar) o 'estado_ilegible' (actualizacion.json no se entendía).
 */
export class ErrorActualizar extends Error {
    constructor(code, mensaje) {
        super(mensaje);
        this.name = 'ErrorActualizar';
        this.code = code;
    }
}
/**
 * Verifica la firma de `bytes` con `clavePublicaPem` y, solo si es buena, lee el manifiesto de esos mismos bytes (en ese
 * orden: nada se lee de un manifiesto sin firma buena).
 * @param {Buffer} bytes los del manifiesto, tal cual llegan
 * @param {string|Buffer} firma el contenido del `.sig`
 * @param {string|null} clavePublicaPem `CLAVE_PUBLICA` (las pruebas pasan una temporal)
 * @returns {import('./manifiesto.mjs').Manifiesto}
 * @throws {ErrorActualizar} 'firma'; {ErrorManifiesto} si el manifiesto no vale
 */
export function leerManifiestoFirmado(bytes, firma, clavePublicaPem) {
    if (!verificarFirma(bytes, firma, clavePublicaPem))
        throw new ErrorActualizar('firma', 'La firma del manifiesto no es buena');
    return leerManifiesto(bytes);
}
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
function existe(ruta) {
    try {
        lstatSync(ruta);
        return true;
    }
    catch {
        return false;
    }
}
// ¿Es una fecha ISO 8601 en UTC que existe? (La misma regla que manifiesto.mjs.)
function fechaValida(fecha) {
    if (typeof fecha !== 'string')
        return false;
    const m = FECHA.exec(fecha);
    const t = m ? Date.parse(fecha) : NaN;
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 19) === m[1];
}
// ¿Es `nueva` mayor que `de`? (`de` null o que no se entiende: no hay nada que valga, y sí.)
function esMayor(nueva, de) {
    if (de === null || de === undefined)
        return true;
    try {
        return compararVersiones(nueva, de) > 0;
    }
    catch {
        return true;
    }
}
// ¿Es `instalada` (lo que hay en AddOns) más nueva que `tanda`? (Si alguna no se entiende, no.)
function masNueva(instalada, tanda) {
    if (typeof instalada !== 'string' || typeof tanda !== 'string')
        return false;
    try {
        return compararVersiones(instalada, tanda) > 0;
    }
    catch {
        return false;
    }
}
// Los códigos del sistema de archivos que se conocen (los de Node y los de mover.mjs); el resto en mayúsculas
// (ERR_INVALID_ARG_TYPE…) es un fallo de programación, no del disco.
const CODIGOS_FS = new Set([
    'ENOENT', 'EBUSY', 'EPERM', 'EACCES', 'EXDEV', 'EEXIST', 'ENOSPC', 'EIO', 'EISDIR', 'ENOTDIR', 'ENOTEMPTY', 'EMFILE',
    'ENFILE', 'EROFS', 'ENAMETOOLONG', 'ELOOP', 'EDQUOT', 'COPIA', 'CAMBIADO',
]);
// El código de un error, para el estado y el registro.
function codigoDe(e) {
    const c = e?.code;
    if (typeof c === 'string' && /^[a-z][a-z_]*$/.test(c))
        return c; // los de la app (red, manifiesto, paquete, instalar…)
    if (CODIGOS_FS.has(c))
        return 'fs';
    return 'fallo';
}
/**
 * F5-2: ¿quedarían el addon y los datos con el mismo esquema? `nuevo` son los esquemas de lo que entra
 * ({componente: esquemaDatos}) e `instalado` los de `esquemasInstalados`.
 * - Si entra el addon, los dos addons de datos tienen que quedar con su esquema (los que llegan con él o los instalados):
 *   nunca un addon sin datos de su esquema.
 * - Si solo entran datos, tienen que ser del esquema que pide el addon instalado (su X-SNF-EsquemaDatos o, en un addon
 *   de antes de la 0.5.0, el de los datos instalados, como en componentes.mjs); si no se sabe, no valen.
 */
function esquemasValen(nuevo, instalado) {
    const queda = (c) => (Object.hasOwn(nuevo, c) ? nuevo[c] : instalado[c]);
    if (Object.hasOwn(nuevo, 'addon'))
        return DATOS.every((d) => queda(d) === nuevo.addon);
    const pide = instalado.addon ?? DATOS.map((d) => instalado[d]).find((x) => x !== null) ?? null;
    return pide !== null && DATOS.every((d) => queda(d) === null || queda(d) === pide);
}
// En estado roto solo se reintenta lo que pasa solo: un archivo ocupado o EPERM (y el juego abierto, que se mira antes) y,
// desde la tarea 13, los fallos del disco que pueden ser pasajeros (EIO, ENOSPC y EMFILE).
const PASAJEROS_ROTO = new Set(['EBUSY', 'EPERM', 'EIO', 'ENOSPC', 'EMFILE']);
function reintentableRoto(err) {
    return err?.code === 'ocupado' || PASAJEROS_ROTO.has(err?.code) || PASAJEROS_ROTO.has(err?.detalle?.code);
}
/**
 * Crea el actualizador.
 * @param {object} p
 * @param {object} [p.env] el entorno (carpeta de datos y cuarentena); por defecto process.env
 * @param {object} [p.config] config.json (`actualizaciones.repo`, `cuarentena`)
 * @param {string|null} p.addonsDir la carpeta `…\_forever_\Interface\AddOns`; sin ella solo se ofrece la app
 * @param {Function} [p.red] `obtener` (red.mjs); las pruebas pasan una falsa
 * @param {{manifiesto: string, firma: string, paquete: Function}} [p.origen] `crearOrigen(config)`
 * @param {string|null} [p.clavePublica] `CLAVE_PUBLICA`; con null no se abre ninguna conexión ('sin_clave')
 * @param {() => Promise<boolean>} p.juegoAbierto si el juego está abierto (si falla, cuenta como abierto)
 * @param {string} [p.versionApp] la versión de la app que corre
 * @param {string} [p.versionNode] la versión de Node que la corre
 * @param {(buffer: Buffer) => Promise<unknown>} [p.aplicarApp] aplica el paquete de la app (tarea 10); sin ella, la app
 *   no se baja ni se aplica
 * @param {() => string|null} [p.appFallida] la versión de la app que el arranque vio fallar (tarea 10, ronda 1, I2):
 *   por defecto, la de `<carpetaInstalacion(env)>\fallida.txt`. Una app igual o anterior sale con `saltado: 'fallida'`
 *   (no se baja) y, si ya estaba bajada, no se aplica y se descarta
 * @param {(aplicados: string[]) => unknown} [p.alAplicar] se llama al terminar de aplicar (puede reiniciar la app)
 * @param {() => Date} [p.ahora]
 * @param {Function} [p.instalar] `instalarComponentes`; solo se cambia en las pruebas
 * @returns {{comprobar: () => Promise<{estado: 'sin_clave'|'sin_novedades'|'hay'|'error', lista?: object[], codigo?: string}>,
 *   descargar: () => Promise<{estado: 'listo'|'nada'|'error', codigo?: string, roto?: true}>,
 *   aplicarSiSePuede: () => Promise<{estado: 'nada'|'esperando_juego'|'aplicado'|'error', aplicados?: string[],
 *     codigo?: string, roto?: true, reinstalar?: true}>,
 *   estado: () => object}}
 *   Las tres primeras van en fila (una no empieza hasta que acaba la anterior) y nunca se rechazan.
 */
export function crearActualizador({ env = process.env, config, addonsDir, red = obtener, origen = crearOrigen(config), clavePublica = CLAVE_PUBLICA, juegoAbierto, versionApp = VERSION, versionNode = process.versions.node, aplicarApp, alAplicar, ahora = () => new Date(), instalar = instalarComponentes, appFallida = () => leerVersion(join(carpetaInstalacion(env), FALLIDA)), } = {}) {
    const datos = carpetaDatos(env);
    const rutaEstado = join(datos, ARCHIVO_ESTADO);
    const descargas = join(datos, CARPETA_DESCARGAS);
    const marcaRoto = join(datos, MARCA_ROTO);
    const hayAddons = typeof addonsDir === 'string' && addonsDir.length > 0;
    const puedeApp = typeof aplicarApp === 'function';
    let ultimo = null; // {manifiesto, lista} de la última comprobación buena; lo que baja descargar()
    let ultimoApuntado = null; // el último fallo apuntado en el registro (`paso:codigo`), para no repetirlo
    let cola = Promise.resolve();
    const registrar = (nivel, texto) => log(nivel, `actualizaciones: ${texto}`);
    function cuando() {
        try {
            return ahora().toISOString();
        }
        catch {
            return new Date().toISOString();
        }
    }
    // Aparta un archivo a la cuarentena de datos (los temporales que fallan y un estado roto).
    const apartarDatos = (origen_) => moverDentro(origen_, cuarentenaNueva(env));
    // ---------- el estado (F4) ----------
    function pendienteValido(p) {
        if (!esObjeto(p) || typeof p.publicacion !== 'string' || !PUBLICACION.test(p.publicacion) || !esObjeto(p.componentes))
            return null;
        const componentes = {};
        for (const c of ORDEN) {
            if (!Object.hasOwn(p.componentes, c))
                continue;
            const d = p.componentes[c];
            const vale = esObjeto(d) && typeof d.version === 'string' && FORMA_VERSION.test(d.version)
                && d.archivo === `SnetForever-${c}-${d.version}.snfpaq` && typeof d.sha256 === 'string' && SHA256.test(d.sha256)
                && Number.isSafeInteger(d.tamano) && d.tamano >= 1;
            if (!vale)
                return null;
            componentes[c] = { version: d.version, archivo: d.archivo, sha256: d.sha256, tamano: d.tamano };
        }
        if (Object.keys(componentes).length === 0)
            return null;
        // la carpeta sale siempre de la publicación (un único segmento), nunca de lo que diga el archivo
        return { publicacion: p.publicacion, componentes, carpeta: join(descargas, p.publicacion) };
    }
    // Ronda 1 (I1): un actualizacion.json ilegible va a la cuarentena de datos y se lanza 'estado_ilegible'. Su
    // `ultimaFecha` (la defensa contra la vuelta atrás) se rescata del texto si se encuentra y se escribe en un estado
    // nuevo; el destino ya no existe, así que el renombre no pisa nada.
    function apartarIlegible(texto) {
        try {
            apartarDatos(rutaEstado);
        }
        catch (e) {
            registrar('error', `${ARCHIVO_ESTADO} ilegible y no se pudo apartar (${codigoDe(e)}): no se escribe nada encima`);
            throw new ErrorActualizar('estado_ilegible', `${ARCHIVO_ESTADO} no se entiende y no se pudo apartar`);
        }
        const fecha = /"ultimaFecha"\s*:\s*"([^"\\]{1,40})"/.exec(texto)?.[1];
        const rescatada = fechaValida(fecha) ? fecha : null;
        if (rescatada !== null) {
            const temporal = `${rutaEstado}.rescate-${process.pid}`;
            try {
                writeFileSync(temporal, `${JSON.stringify({ ultimaFecha: rescatada }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
                renameSync(temporal, rutaEstado);
            }
            catch (e) {
                registrar('error', `no se pudo guardar la ultimaFecha rescatada (${codigoDe(e)})`);
                try {
                    if (existe(temporal))
                        apartarDatos(temporal);
                }
                catch {
                    // se queda donde está: no se borra
                }
            }
        }
        registrar('aviso', `${ARCHIVO_ESTADO} ilegible: apartado a la cuarentena; ${rescatada === null
            ? 'no tenía una ultimaFecha que rescatar' : 'se conserva su ultimaFecha'}`);
        throw new ErrorActualizar('estado_ilegible', `${ARCHIVO_ESTADO} no se entendía: apartado a la cuarentena`);
    }
    // El estado. Sin archivo, {}. Ronda 1 (I1): con cualquier otro fallo al leerlo lanza (y nada se guarda encima).
    function leerEstado() {
        let texto;
        try {
            texto = readFileSync(rutaEstado, 'utf8');
        }
        catch (e) {
            if (e?.code === 'ENOENT')
                return {};
            throw e;
        }
        let j;
        try {
            j = JSON.parse(texto);
            if (!esObjeto(j))
                throw new Error('no es un objeto');
        }
        catch {
            apartarIlegible(texto);
        }
        const e = {};
        if (fechaValida(j.ultimaComprobacion))
            e.ultimaComprobacion = j.ultimaComprobacion;
        if (fechaValida(j.ultimaFecha))
            e.ultimaFecha = j.ultimaFecha;
        const p = pendienteValido(j.pendiente);
        if (p)
            e.pendiente = p;
        else if (j.pendiente !== undefined)
            registrar('aviso', 'la actualización pendiente no se entiende: se olvida');
        if (esObjeto(j.ultimoError) && typeof j.ultimoError.codigo === 'string') {
            e.ultimoError = { codigo: j.ultimoError.codigo, cuando: String(j.ultimoError.cuando ?? '') };
            if (j.ultimoError.roto === true)
                e.ultimoError.roto = true;
            if (j.ultimoError.reinstalar === true)
                e.ultimoError.reinstalar = true;
        }
        return e;
    }
    async function guardar(e) {
        mkdirSync(datos, { recursive: true });
        await escribirAtomico(fs, rutaEstado, `${JSON.stringify(e, null, 2)}\n`, { mover: apartarDatos });
    }
    async function guardarSinFallar(e) {
        try {
            await guardar(e);
        }
        catch (g) {
            registrar('error', `no se pudo guardar ${ARCHIVO_ESTADO} (${codigoDe(g)})`);
        }
    }
    // Apunta el fallo (en el estado y, si no es el mismo de la vez anterior, en el registro) y da el resultado de error.
    async function fallar(e, paso, err, extra = {}) {
        const codigo = codigoDe(err);
        e.ultimoError = { codigo, cuando: cuando(), ...extra };
        if (`${paso}:${codigo}` !== ultimoApuntado) {
            const mas = [err?.estado !== undefined ? `HTTP ${err.estado}` : null, typeof err?.detalle === 'string' ? err.detalle : null,
                extra.roto ? 'estado roto: se reintentará la tanda entera' : null].filter(Boolean);
            registrar(extra.roto ? 'error' : 'aviso', `${paso}: ${codigo}${mas.length > 0 ? ` (${mas.join(', ')})` : ''}`);
            ultimoApuntado = `${paso}:${codigo}`;
        }
        await guardarSinFallar(e);
        // el campo http (sin comillas): el número de un error HTTP (codigo «estado»), para que quien llama sepa si es un 5xx pasajero o un 404
        return { estado: 'error', codigo, ...(Number.isSafeInteger(err?.estado) ? { http: err.estado } : {}), ...extra };
    }
    const bienHecho = (e) => {
        delete e.ultimoError;
        ultimoApuntado = null;
    };
    // En fila y sin rechazar nunca. Si el estado no se puede leer, el error sale sin escribir nada (ronda 1, I1).
    function enCola(paso, fn) {
        const r = cola.then(fn).catch(async (err) => {
            try {
                return await fallar(leerEstado(), paso, err);
            }
            catch {
                if (`${paso}:${codigoDe(err)}` !== ultimoApuntado) {
                    registrar('error', `${paso}: ${codigoDe(err)} (el estado no se puede leer; no se escribe nada)`);
                    ultimoApuntado = `${paso}:${codigoDe(err)}`;
                }
                return { estado: 'error', codigo: codigoDe(err) };
            }
        });
        cola = r;
        return r;
    }
    // Ronda 1 (M1): el aviso de estado roto dura mientras exista la marca. Sin tanda que reintentar, se propone
    // reinstalar con el instalador.
    function avisoRoto(p) {
        if (!existe(marcaRoto))
            return {};
        if (p)
            return { roto: true };
        if (ultimoApuntado !== 'roto:reinstalar') {
            registrar('error', 'estado roto sin una tanda que reintentar: hay que reinstalar SnetForever con el instalador');
            ultimoApuntado = 'roto:reinstalar';
        }
        return { roto: true, reinstalar: true };
    }
    // Ronda 1 (M5): aparta la marca de estado roto a la cuarentena (si no se puede, se queda y se apunta). Tarea 13: con la
    // regla de componentes.mjs (archivarMarca), solo si cada componente que la marca tenía pendiente está cubierto
    // (`cubierto(componente)`); una marca que no se entiende se queda para quien la mire. → true si se archivó.
    function archivarMarcaRoto(cuarentena, cubierto) {
        let marca;
        try {
            marca = JSON.parse(readFileSync(marcaRoto, 'utf8'));
        }
        catch {
            return false;
        }
        const pendientes = Array.isArray(marca?.pendientes) ? marca.pendientes : [];
        if (!pendientes.every((p) => cubierto(p?.componente)))
            return false;
        try {
            moverDentro(marcaRoto, cuarentena());
            return true;
        }
        catch (err) {
            registrar('aviso', `no se pudo pasar a la cuarentena la marca de estado roto (${codigoDe(err)})`);
            return false;
        }
    }
    async function estaAbierto() {
        try {
            return (await juegoAbierto()) !== false;
        }
        catch {
            return true;
        }
    }
    // Las versiones instaladas de AddOns (una que no se entiende cuenta como no instalada).
    function instaladoAhora() {
        const salida = { addon: null, rutas: null, misiones: null, comercio: null };
        if (!hayAddons)
            return salida;
        for (const [c, v] of Object.entries(estadoInstalado(addonsDir)))
            salida[c] = typeof v === 'string' && FORMA_VERSION.test(v) ? v : null;
        return salida;
    }
    // ¿Es `version` de la app igual o anterior a la que el arranque vio fallar (fallida.txt)? (tarea 10, ronda 1, I2)
    function yaFallo(version) {
        let fallida;
        try {
            fallida = appFallida?.() ?? null;
        }
        catch {
            fallida = null;
        }
        if (typeof fallida !== 'string')
            return false;
        try {
            return compararVersiones(version, fallida) <= 0;
        }
        catch {
            return false;
        }
    }
    // La app que ya no arrancó (o una anterior) sale con `saltado: 'fallida'` y no se baja.
    function marcarFallida(lista) {
        return lista.map((i) => {
            if (i.componente !== 'app' || i.saltado || i.requiereInstalador || !yaFallo(i.a))
                return i;
            registrar('aviso', `comprobar: la app ${i.a} no se ofrece (ya no arrancó; se espera una más nueva)`);
            return { ...i, saltado: 'fallida' };
        });
    }
    // F5-2 frente a lo instalado (`esquemasValen`): si no cuadra, lo de AddOns sale con `saltado: 'compatibilidad'` (y no
    // se baja). Al aplicar se vuelve a mirar (ronda 1, M3).
    function marcarEsquemas(lista, manifiesto) {
        const entran = lista.filter((i) => CON_ESQUEMA.includes(i.componente) && !i.saltado);
        if (entran.length === 0)
            return lista;
        const nuevo = Object.fromEntries(entran.map((i) => [i.componente, manifiesto.componentes[i.componente].esquemaDatos]));
        if (esquemasValen(nuevo, esquemasInstalados(addonsDir)))
            return lista;
        // el comercio no tiene esquema, pero no se queda con un addon que se salta: va con él (como los datos)
        const caen = entran.some((i) => i.componente === 'addon') ? lista.filter((i) => i.componente === 'comercio' && !i.saltado) : [];
        registrar('aviso', `comprobar: ${[...entran, ...caen].map((i) => i.componente).join(', ')} no se ofrecen (compatibilidad de esquemas de datos)`);
        return lista.map((i) => (entran.includes(i) || caen.includes(i) ? { ...i, saltado: 'compatibilidad' } : i));
    }
    // Quita lo pendiente: su carpeta va a la cuarentena (si no se puede, se queda y se apunta). El estado lo guarda quien llama.
    function descartar(e, cuarentena) {
        const p = e.pendiente;
        delete e.pendiente;
        if (!p || !existe(p.carpeta))
            return;
        try {
            moverDentro(p.carpeta, cuarentena());
        }
        catch (err) {
            registrar('aviso', `no se pudo pasar a la cuarentena la descarga de ${p.publicacion} (${codigoDe(err)})`);
        }
    }
    const nuevaCuarentena = () => {
        let q = null;
        return () => (q ??= cuarentenaComponentes({ env, config }));
    };
    // ¿Lo de `bajar` ya está bajado y entero en lo pendiente (la misma publicación)?
    function yaBajado(p, manifiesto, bajar) {
        if (!p || p.publicacion !== manifiesto.publicacion)
            return false;
        return bajar.every((i) => {
            const d = p.componentes[i.componente];
            const entrada = manifiesto.componentes[i.componente];
            if (!d || d.sha256 !== entrada.sha256 || d.tamano !== entrada.tamano)
                return false;
            try {
                const b = readFileSync(join(p.carpeta, d.archivo));
                return b.length === d.tamano && sha256(b) === d.sha256;
            }
            catch {
                return false;
            }
        });
    }
    async function avisar(aplicados) {
        try {
            await alAplicar?.(aplicados);
        }
        catch (err) {
            registrar('error', `alAplicar falló (${codigoDe(err)})`);
        }
    }
    // ---------- 1. comprobar ----------
    const comprobar = () => enCola('comprobar', async () => {
        if (clavePublica === null)
            return { estado: 'sin_clave' }; // sin clave no se abre ninguna conexión
        ultimo = null; // ronda 1 (M6): solo queda una lista para descargar si esta comprobación acaba bien, guardado incluido
        const e = leerEstado();
        e.ultimaComprobacion = cuando();
        let manifiesto;
        let lista;
        try {
            const bytes = await red(origen.manifiesto, { maxBytes: MAX_MANIFIESTO });
            const firma = await red(origen.firma, { maxBytes: MAX_FIRMA });
            manifiesto = leerManifiestoFirmado(bytes, firma, clavePublica);
            const r = novedades(manifiesto, { instalado: instaladoAhora(), versionApp, versionNode, ultimaFecha: e.ultimaFecha ?? null });
            if (r.antiguo)
                throw new ErrorActualizar('antiguo', `El manifiesto es del ${manifiesto.fecha}, anterior al último aceptado`);
            lista = marcarFallida(marcarEsquemas(hayAddons ? r.lista : r.lista.filter((i) => i.componente === 'app'), manifiesto));
        }
        catch (err) {
            return fallar(e, 'comprobar', err);
        }
        e.ultimaFecha = manifiesto.fecha;
        bienHecho(e);
        await guardar(e);
        ultimo = { manifiesto, lista };
        registrar('info', `comprobar: ${manifiesto.publicacion}, ${lista.length === 0 ? 'al día'
            : lista.map((i) => `${i.componente} ${i.a}${i.requiereInstalador ? ' (instalador)' : i.saltado ? ` (${i.saltado})` : ''}`).join(', ')}`);
        return lista.length === 0 ? { estado: 'sin_novedades' } : { estado: 'hay', lista };
    });
    // ---------- 2. descargar ----------
    const descargar = () => enCola('descargar', async () => {
        if (!ultimo)
            return { estado: 'nada' };
        const { manifiesto, lista } = ultimo;
        const bajar = lista.filter((i) => !i.requiereInstalador && !i.saltado && (i.componente !== 'app' || puedeApp));
        if (bajar.length === 0)
            return { estado: 'nada' };
        const e = leerEstado();
        // ronda 1 (M2): una tanda que espera reparación (estado roto) no se sustituye: primero se repara y después se baja lo
        // nuevo
        if (e.pendiente && existe(marcaRoto))
            return { estado: 'listo', roto: true };
        if (yaBajado(e.pendiente, manifiesto, bajar))
            return { estado: 'listo' };
        const carpeta = join(descargas, manifiesto.publicacion);
        try {
            // todo se baja y se comprueba en memoria antes de escribir nada
            const paquetes = [];
            for (const { componente } of bajar) {
                const entrada = manifiesto.componentes[componente];
                const buffer = await red(origen.paquete(manifiesto.publicacion, entrada.archivo), {
                    maxBytes: entrada.tamano, tiempoMax: tiempoDescarga(entrada.tamano),
                });
                if (!(buffer instanceof Uint8Array) || buffer.length !== entrada.tamano) {
                    throw new ErrorActualizar('tamano', `El paquete de «${componente}» no mide ${entrada.tamano} bytes`);
                }
                comprobarPaquete(manifiesto, componente, buffer); // SHA-256 antes de abrirlo; después versión y esquema
                paquetes.push({ componente, entrada, buffer });
            }
            // lo bajado antes (otra publicación, o restos de esta) va a la cuarentena: nunca se pisa
            const cuarentena = nuevaCuarentena();
            if (e.pendiente && e.pendiente.carpeta !== carpeta)
                descartar(e, cuarentena);
            delete e.pendiente;
            if (existe(carpeta))
                moverDentro(carpeta, cuarentena());
            mkdirSync(carpeta, { recursive: true });
            for (const { entrada, buffer } of paquetes) {
                await escribirAtomico(fs, join(carpeta, entrada.archivo), buffer, { mover: apartarDatos });
            }
            e.pendiente = {
                publicacion: manifiesto.publicacion,
                componentes: Object.fromEntries(paquetes.map(({ componente, entrada }) => [componente, {
                        version: entrada.version, archivo: entrada.archivo, sha256: entrada.sha256, tamano: entrada.tamano,
                    }])),
                carpeta,
            };
            bienHecho(e);
            await guardar(e);
        }
        catch (err) {
            return fallar(e, 'descargar', err);
        }
        registrar('info', `descargar: ${manifiesto.publicacion} lista (${Object.keys(e.pendiente.componentes).join(', ')})`);
        return { estado: 'listo' };
    });
    // ---------- 3. aplicar ----------
    // Un fallo al aplicar lo de AddOns (o al volver a comprobar lo guardado). En estado roto (un deshacer a medias, o la
    // marca puesta) solo se reintenta lo que pasa solo (ronda 1, M4): lo demás descarta la tanda y propone reinstalar con el
    // instalador. Fuera del estado roto, lo que no se arregla reintentando se descarta y se volverá a bajar.
    function falloAlAplicar(e, err, cuarentena) {
        if (err?.detalle?.deshecho === false || existe(marcaRoto)) {
            if (reintentableRoto(err))
                return fallar(e, 'aplicar', err, { roto: true });
            descartar(e, cuarentena);
            return fallar(e, 'aplicar', err, { roto: true, reinstalar: true });
        }
        if (SIN_ARREGLO.has(codigoDe(err)) || err?.code === 'ENOENT')
            descartar(e, cuarentena);
        return fallar(e, 'aplicar', err);
    }
    const aplicarSiSePuede = () => enCola('aplicar', async () => {
        const e = leerEstado();
        const p = e.pendiente;
        if (!p)
            return { estado: 'nada', ...avisoRoto(null) };
        // revisión final, m1: el juego cerrado solo se pide más abajo, si queda algo que poner en AddOns (descartar lo que ya
        // está instalado o aplicar solo la app no toca AddOns)
        const cuarentena = nuevaCuarentena();
        // Estado roto (tarea 8): un deshacer que Windows no dejó terminar. Se reinstala la tanda entera aunque AddOns ya diga
        // la versión de la tanda (lo nuevo pudo quedar puesto); al terminar bien, instalarComponentes aparta la marca.
        // Ronda 1 (M5): nunca se baja de versión. Si lo instalado es más nuevo que la tanda (lo puso el instalador), la tanda
        // se descarta y la marca se archiva.
        const roto = existe(marcaRoto);
        const instalado = instaladoAhora();
        if (roto && EN_ADDONS.some((c) => Object.hasOwn(p.componentes, c) && masNueva(instalado[c], p.componentes[c].version))) {
            // Tarea 13: la marca solo se archiva si lo que tenía pendiente está instalado con una versión igual o más nueva
            // que la de la tanda; si no, se queda (y se propone reinstalar).
            const cubierto = (c) => EN_ADDONS.includes(c) && Object.hasOwn(p.componentes, c)
                && (instalado[c] === p.componentes[c].version || masNueva(instalado[c], p.componentes[c].version));
            descartar(e, cuarentena);
            const archivada = archivarMarcaRoto(cuarentena, cubierto);
            if (archivada)
                bienHecho(e);
            await guardar(e);
            registrar('aviso', `aplicar: ${p.publicacion} no se reinstala (lo instalado es más nuevo); ${archivada
                ? 'la marca de estado roto se archiva' : 'la marca de estado roto se queda (tenía pendiente algo que la tanda no cubre)'}`);
            return { estado: 'nada', ...avisoRoto(null) };
        }
        const falta = ORDEN.filter((c) => Object.hasOwn(p.componentes, c)).filter((c) => (c === 'app'
            ? puedeApp && esMayor(p.componentes.app.version, versionApp) && !yaFallo(p.componentes.app.version)
            : roto || esMayor(p.componentes[c].version, instalado[c])));
        if (falta.length === 0) {
            // ya está todo (p. ej. con el instalador): nunca se instala una versión igual o menor
            descartar(e, cuarentena);
            await guardar(e);
            return { estado: 'nada', ...avisoRoto(null) };
        }
        // Lo guardado se vuelve a comprobar: pudo cambiar en el disco desde que se bajó. Y F5-2 otra vez (ronda 1, M3), con el
        // esquema de la cabecera de cada paquete frente a lo instalado ahora.
        const buffers = {};
        const enAddons = falta.filter((c) => c !== 'app');
        if (enAddons.length > 0 && await estaAbierto())
            return { estado: 'esperando_juego', ...avisoRoto(p) };
        try {
            for (const c of falta) {
                const d = p.componentes[c];
                const buffer = readFileSync(join(p.carpeta, d.archivo));
                if (buffer.length !== d.tamano || sha256(buffer) !== d.sha256) {
                    throw new ErrorActualizar('hash', `El paquete guardado de «${c}» ha cambiado desde que se bajó`);
                }
                buffers[c] = buffer;
            }
            const conEsquema = enAddons.filter((c) => CON_ESQUEMA.includes(c));
            if (conEsquema.length > 0) {
                const nuevo = Object.fromEntries(conEsquema.map((c) => [c, abrirPaquete(buffers[c], { componente: c }).esquemaDatos]));
                if (!esquemasValen(nuevo, esquemasInstalados(addonsDir))) {
                    throw new ErrorActualizar('compatibilidad', 'Lo instalado ya no es compatible con la tanda pendiente');
                }
            }
        }
        catch (err) {
            return falloAlAplicar(e, err, cuarentena);
        }
        const aplicados = [];
        if (enAddons.length > 0) {
            try {
                const r = await instalar(addonsDir, enAddons.map((c) => ({ componente: c, buffer: buffers[c] })), {
                    cuarentena, juegoAbierto: estaAbierto, marcaRoto,
                });
                for (const aviso of r?.avisos ?? [])
                    registrar('aviso', `aplicar: algo no pasó a la cuarentena (${aviso?.code ?? 'aviso'})`);
                aplicados.push(...(r?.instalados ?? enAddons));
            }
            catch (err) {
                // se abrió a mitad: sigue pendiente
                if (err?.code === 'juego_abierto')
                    return { estado: 'esperando_juego', ...avisoRoto(p) };
                return falloAlAplicar(e, err, cuarentena);
            }
            for (const c of aplicados)
                delete p.componentes[c];
            await guardarSinFallar(e);
        }
        if (falta.includes('app')) {
            try {
                await aplicarApp(buffers.app);
                aplicados.push('app');
            }
            catch (err) {
                if (SIN_ARREGLO.has(codigoDe(err)))
                    descartar(e, cuarentena);
                const r = await fallar(e, 'aplicar', err);
                if (aplicados.length === 0)
                    return r;
                await avisar(aplicados); // lo de AddOns sí entró
                return { ...r, aplicados };
            }
        }
        descartar(e, cuarentena); // la carpeta bajada va a la cuarentena; `pendiente` se quita del estado
        bienHecho(e);
        await guardarSinFallar(e);
        // ronda 1 (M2): si lo aplicado era una reparación, la última comprobación (otra publicación) se puede bajar ahora
        if (ultimo?.manifiesto.publicacion === p.publicacion)
            ultimo = null;
        registrar('info', `aplicar: ${p.publicacion} aplicada (${aplicados.join(', ')})`);
        await avisar(aplicados);
        return { estado: 'aplicado', aplicados };
    });
    // El estado F4 y, mientras exista la marca de estado roto, `roto: true` (y `reinstalar: true` si no hay tanda que
    // reintentar). Nunca lanza: si no se puede leer, `{error: codigo}`.
    function estado() {
        try {
            const e = leerEstado();
            return { ...e, ...avisoRoto(e.pendiente ?? null) };
        }
        catch (err) {
            return { error: codigoDe(err), ...avisoRoto(null) };
        }
    }
    return { comprobar, descargar, aplicarSiSePuede, estado };
}
