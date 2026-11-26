// CLI del instalador (fase 5, tarea 12; F6, R2, R15, R16, F5-4 y F5-5). Inno solo pone la pantalla: toda la lógica está
// aquí, en Node. Se usa como `node app\<v>\src\instalador\cli.mjs <orden> …` o, instalada, `arranque.mjs --cli <orden> …`.
//
// Órdenes:
//   detectar                                       dónde está el juego y la raíz de la cuarentena (no crea nada)
//   juego-abierto                                  0 si el juego de \_forever_\ está cerrado; 10 si está abierto o no se sabe
//   instalar --addons <dir> --paquetes <dir>       el addon, los datos y las ranuras, y config.json
//   comprobar-ia                                   el estado de Claude Code y de Codex, y la guía (F7) si ninguno está listo
//   cerrar-app                                     pide a la app que salga (datos\salir.peticion) y espera a que suelte el cerrojo
//   desinstalar [--grupo <dir>] [--escritorio <lnk>] [--inicio <lnk>]
//                                                  mueve a la cuarentena los addons, las ranuras y los accesos (nunca borra)
//   desempaquetar <paquete> <carpeta>              F5-4: extrae un .snfpaq en una carpeta nueva, para mirar dentro
//   preparar [--addons <dir>]                      crea las ranuras que falten (lo que antes era `principal.mjs --preparar`,
//                                                  que arranque.mjs no puede pasar: tarea 10)
// Opciones comunes: `--idioma es|en` (por defecto, el de Windows) y `--salida <ruta>`.
//
// Siempre escribe una línea JSON en stdout, con `{ok, codigo, mensaje, …}`. Con `--salida <ruta>`, además `<ruta>.json` y
// `<ruta>.txt` (UTF-8 con BOM, para Inno, que no lee JSON), este con tres líneas: el mensaje, la carpeta elegida (en
// detectar) y la cuarentena (en detectar y desinstalar); las que no tocan, vacías. Los códigos de salida son los de F6
// (CODIGOS_SALIDA).
//
// Aquí nunca se borra nada ni se mata ningún proceso: lo sustituido o retirado se mueve a la cuarentena (mover.mjs), la app
// se cierra pidiéndoselo y, para saber si sigue viva, se usa `process.kill(pid, 0)`, que solo pregunta. Revisión final, I3:
// antes, como tomarCerrojo, se mira que el pid del cerrojo sea de verdad la app (infoProceso: node.exe y la misma hora de
// inicio); un pid que reutiliza otro programa tras un apagón cuenta como cerrojo viejo. El juego se mira (juego.mjs)
// antes de tocar AddOns, y si no se sabe si está abierto, cuenta como abierto.
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAVE_PUBLICA } from '../actualizar/clave-publica.mjs';
import { ErrorManifiesto } from '../actualizar/manifiesto.mjs';
import { CARPETAS, ErrorPaquete, desempaquetar } from '../actualizar/paquete.mjs';
import { comprobar as comprobarClaude, resolverClaude } from '../claude.mjs';
import { comprobar as comprobarCodex, resolverCodex } from '../codex.mjs';
import { CODIGOS_OCUPADO, ESPERAS_REINTENTO } from '../fsseguro.mjs';
import { prepararAddOns } from '../instalacion.mjs';
import { candidatasJuego, consultar, juegoAbierto, validarCarpetaJuego } from '../juego.mjs';
import { moverDentro, moverSinPisar } from '../mover.mjs';
import { cerrojoVivo, idiomaDeLaApp } from '../principal.mjs';
import { infoProceso } from '../proceso.mjs';
import { carpetaDatos, cuarentenaComponentes, cuarentenaNueva, leerConfig, raizCuarentena } from '../rutas.mjs';
import { GUIA_IA, TEXTOS_CLI } from '../textos.mjs';
import { ErrorInstalar, MARCA_ROTO, PREPARANDO, instalarComponentes } from './componentes.mjs';
import { COMPONENTES_ADDONS, leerPaquetes } from './paquetes.mjs';
/** F6: el código de salida de cada `codigo`. */
export const CODIGOS_SALIDA = Object.freeze({ ok: 0, juego_abierto: 10, carpeta: 11, sin_permiso: 12, paquete: 13, ocupado: 14, fallo: 1 });
/** Lo más que `cerrar-app` espera a que la app suelte el cerrojo. */
export const ESPERA_CIERRE = 15_000;
const INTERVALO_CIERRE = 100;
// Los componentes que van en AddOns, en este orden (la app la pone Inno: tarea 16).
const COMPONENTES = COMPONENTES_ADDONS;
// Las ranuras de respuesta, sean cuantas sean (fase 4, lote G: de 100 pasan a 20 y quedan las viejas de antes).
const RANURA = /^SnetForever_(?:R\d{3}|P\d{2})$/i; // respuestas (R) y precios del comercio (P)
// Los códigos de ErrorInstalar que tienen su propio código de F6; los demás son 'fallo' (con el detalle en el mensaje).
const DE_INSTALAR = Object.freeze({
    juego_abierto: 'juego_abierto', carpeta: 'carpeta', paquete: 'paquete', compatibilidad: 'paquete', sin_permiso: 'sin_permiso', ocupado: 'ocupado',
});
const NOMBRE_MOTOR = { claude: 'Claude Code', codex: 'ChatGPT (Codex)' };
/** Un error de una orden con su `codigo` de F6. `mensaje` null = el de `TEXTOS_CLI.codigos`; `extra` va en el JSON. */
class ErrorCli extends Error {
    constructor(codigo, mensaje = null, extra = {}) {
        super(mensaje ?? codigo);
        this.codigo = codigo;
        this.mensajeFinal = mensaje;
        this.extra = extra;
    }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// Cambia cada %s de `plantilla` por el valor que le toca, en orden.
const formatear = (plantilla, ...valores) => valores.reduce((t, v) => t.replace('%s', String(v)), plantilla);
const unaLinea = (x) => String(x ?? '').replace(/[\r\n]+/g, ' ');
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const texto = (x) => (typeof x === 'string' && x.length > 0 ? x : null);
function existe(ruta) {
    try {
        lstatSync(ruta);
        return true;
    }
    catch {
        return false;
    }
}
// ¿Sigue vivo `pid`? La señal 0 no hace nada al proceso: solo pregunta (ESRCH: no existe; EPERM: existe y no es nuestro).
function viveDeVerdad(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        return e?.code === 'EPERM';
    }
}
/** `<orden> [sueltos…] [--opcion valor…]`: una opción sin valor (al final o seguida de otra) vale `true`. */
function leerArgumentos(argv) {
    const [orden, ...resto] = Array.isArray(argv) ? argv.map(String) : [];
    const opciones = {};
    const sueltos = [];
    for (let i = 0; i < resto.length; i++) {
        const a = resto[i];
        if (a.startsWith('--')) {
            const valor = resto[i + 1];
            if (valor === undefined || valor.startsWith('--'))
                opciones[a.slice(2)] = true;
            else {
                opciones[a.slice(2)] = valor;
                i++;
            }
        }
        else
            sueltos.push(a);
    }
    return { orden, opciones, sueltos };
}
// El código de F6 de un error cualquiera.
function codigoDe(e) {
    if (e instanceof ErrorCli)
        return e.codigo;
    if (e instanceof ErrorInstalar)
        return DE_INSTALAR[e.code] ?? 'fallo';
    if (e instanceof ErrorManifiesto || e instanceof ErrorPaquete)
        return 'paquete';
    if (e?.code === 'EBUSY')
        return 'ocupado';
    if (e?.code === 'EPERM' || e?.code === 'EACCES')
        return 'sin_permiso';
    return 'fallo';
}
// ¿Está abierto el juego de \_forever_\? Si consultar falla, cuenta como abierto.
async function estaAbierto(juego) {
    try {
        return juegoAbierto({ procesos: await juego.consultar('procesos') });
    }
    catch {
        return true;
    }
}
// Lo que diga consultar, o undefined si falla (candidatasJuego lo toma como una lista vacía).
async function preguntar(juego, que) {
    try {
        return await juego.consultar(que);
    }
    catch {
        return undefined;
    }
}
// Mueve con los reintentos de Windows (25, 50 y 75 ms) ante un bloqueo. Un mover a medias (con `copia` o `reserva`, ver
// mover.mjs) no se reintenta: lo que quedó se queda donde está.
async function moverConEsperas(origen, carpeta) {
    for (let intento = 0;; intento++) {
        try {
            return moverDentro(origen, carpeta);
        }
        catch (e) {
            const reintentable = CODIGOS_OCUPADO.includes(e?.code) && !e?.copia && !e?.reserva;
            if (!reintentable || intento >= ESPERAS_REINTENTO.length)
                throw e;
            await dormir(ESPERAS_REINTENTO[intento]);
        }
    }
}
// ---------- la cuarentena de la instalación (ronda 1, I1) ----------
// La raíz de la unidad de una ruta (`C:\`, `\\servidor\recurso\`), en minúsculas.
const raizDe = (ruta) => win32.parse(win32.resolve(ruta)).root.toLowerCase();
/**
 * Dónde va `{app}` al retirarlo (la `-A` de retirar.ps1): tiene que estar en la **misma unidad** que `instalacion`, para
 * que retirar.ps1 solo haga renombres (entre unidades, Move-Item copiaría y quitaría sin comprobar nada, y por eso se
 * niega). Si `q` (la cuarentena de los addons, o su raíz) está en esa unidad, es `q`; si no, la de la carpeta de datos
 * (`%LOCALAPPDATA%\SnetForever\cuarentena`, la misma de los PC sin `E:\_CUARENTENA`), con el mismo sello si `conSello`.
 */
function cuarentenaInstalacionDe(env, instalacion, q, conSello) {
    if (raizDe(q) === raizDe(instalacion))
        return q;
    const base = join(carpetaDatos(env), 'cuarentena');
    return conSello ? join(base, basename(q)) : base;
}
// ---------- detectar y juego-abierto ----------
async function detectar({ env, juego, opciones, T }) {
    const config = leerConfig(env);
    const [procesos, registro, unidades] = await Promise.all(['procesos', 'registro', 'unidades'].map((q) => preguntar(juego, q)));
    const candidatas = candidatasJuego({ env, config, procesos, registro, unidades });
    const elegida = candidatas[0]?.raiz ?? null;
    const cuarentena = raizCuarentena({ env, config });
    const instalacion = texto(opciones.instalacion);
    return {
        mensaje: elegida ? formatear(T.detectar, elegida) : T.detectarNada,
        candidatas,
        elegida,
        cuarentena,
        // con --instalacion "{app}": la raíz a la que va la instalación vieja al reinstalar (la -A de retirar.ps1)
        ...(instalacion ? { cuarentenaInstalacion: cuarentenaInstalacionDe(env, resolve(instalacion), cuarentena, false) } : {}),
    };
}
async function ordenJuegoAbierto({ juego, T }) {
    if (await estaAbierto(juego))
        return { codigo: 'juego_abierto', abierto: true };
    return { mensaje: T.juegoCerrado, abierto: false };
}
// ---------- instalar ----------
// Los cuatro paquetes de AddOns (con el comercio, 0.7.0) de `{app}\paquetes`, comprobados (firma con clave, y siempre tamaño, SHA-256, versión y
// esquema): la función común de paquetes.mjs, con los errores de la CLI ('paquete' y su detalle).
const leerPaquetesCli = (dir, clavePublica) => leerPaquetes(dir, {
    clavePublica, error: (detalle) => new ErrorCli('paquete', null, { detalle }),
});
// Escribe datos\config.json: primero un temporal nuevo; el de antes va a la cuarentena de datos; después el renombre.
function guardarConfig(env, config) {
    const datos = carpetaDatos(env);
    mkdirSync(datos, { recursive: true });
    const ruta = join(datos, 'config.json');
    const temporal = `${ruta}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(temporal, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    if (existe(ruta))
        moverDentro(ruta, cuarentenaNueva(env));
    renameSync(temporal, ruta);
}
async function instalar({ env, clavePublica, juego, opciones, T }) {
    const v = validarCarpetaJuego(texto(opciones.addons));
    if (!v.ok)
        throw new ErrorCli('carpeta', null, { detalle: v.motivo });
    if (!texto(opciones.paquetes))
        throw new ErrorCli('paquete', null, { detalle: 'sin_paquetes' });
    const paquetes = leerPaquetesCli(opciones.paquetes, clavePublica);
    // Vigilancia 1: con el juego abierto (o sin saberlo) no se toca nada, tampoco la carpeta AddOns ni config.json.
    if (await estaAbierto(juego))
        throw new ErrorCli('juego_abierto');
    const config = leerConfig(env);
    mkdirSync(v.addons, { recursive: true }); // un juego recién instalado puede no tener todavía Interface\AddOns
    const r = await instalarComponentes(v.addons, paquetes, {
        cuarentena: () => cuarentenaComponentes({ env, config }),
        juegoAbierto: () => estaAbierto(juego),
        marcaRoto: join(carpetaDatos(env), MARCA_ROTO),
    });
    const resumen = prepararAddOns(v.addons);
    guardarConfig(env, {
        ...config,
        addons: v.addons,
        cuarentena: raizCuarentena({ env, config }),
        instalada: true,
        // ronda 1 (duda 6): un auto puesto por el jugador (también false) no se pisa; solo se pone true si no estaba
        actualizaciones: { auto: true, ...(esObjeto(config.actualizaciones) ? config.actualizaciones : {}) },
    });
    const avisos = [...(r.avisos ?? []), ...(resumen.avisos ?? [])];
    return {
        mensaje: T.instalado,
        instalados: r.instalados,
        ranurasCreadas: resumen.ranurasCreadas,
        cuarentena: r.cuarentena,
        ...(avisos.length > 0 ? { avisos } : {}),
    };
}
// ---------- comprobar-ia ----------
// comprobar() de claude.mjs o codex.mjs, que no debería lanzar; si lanza, 'desconocido'. Solo {estado, version?}.
async function estadoDe(comprobar) {
    try {
        const r = await comprobar();
        return r?.version ? { estado: r.estado, version: r.version } : { estado: r?.estado ?? 'desconocido' };
    }
    catch {
        return { estado: 'desconocido' };
    }
}
async function comprobarIa({ env, idioma, T }) {
    const [claude, codex] = await Promise.all([
        estadoDe(() => comprobarClaude(resolverClaude({ env }))),
        estadoDe(() => comprobarCodex(resolverCodex({ env }))),
    ]);
    const motor = claude.estado === 'ok' ? 'claude' : codex.estado === 'ok' ? 'codex' : null;
    const guia = motor ? null : [...GUIA_IA[idioma]];
    // Inno enseña la línea 1 del .txt: «Listo: usarás …» o la guía entera en una línea.
    return { mensaje: motor ? formatear(T.iaLista, NOMBRE_MOTOR[motor]) : guia.join(' '), claude, codex, guia };
}
// ---------- cerrar-app ----------
// El cerrojo ({pid, inicio}) si su pid es un entero mayor que 0; null si no hay cerrojo, está soltado (pid 0) o no se
// entiende.
function leerCerrojo(cerrojo) {
    try {
        const j = JSON.parse(readFileSync(cerrojo, 'utf8'));
        return esObjeto(j) && Number.isInteger(j.pid) && j.pid > 0 ? j : null;
    }
    catch {
        return null;
    }
}
// La hora de inicio de este proceso (la CLI), como la guarda la app en su cerrojo.
const inicioPropio = () => Math.round(Date.now() - process.uptime() * 1000);
// ¿Sigue el cerrojo cogido por `pid`? Un cerrojo que no se entiende a mitad de la espera (quizá se está escribiendo)
// cuenta como cogido; uno que ya no está, como suelto.
function sigueCogido(cerrojo, pid, vive) {
    let actual;
    try {
        actual = JSON.parse(readFileSync(cerrojo, 'utf8'))?.pid;
    }
    catch (e) {
        return e?.code !== 'ENOENT';
    }
    return actual === pid && vive(pid);
}
async function cerrarApp({ env, esperaCierre, vive, info, T }) {
    const datos = carpetaDatos(env);
    const cerrojo = join(datos, 'app.lock');
    const viejo = leerCerrojo(cerrojo);
    const pid = viejo?.pid ?? null;
    // revisión final, I3: vivo y, además, la app (lo que no se puede saber cuenta como la app: se espera, lo seguro). Se
    // mira una vez: durante la espera basta con que siga vivo y el cerrojo siga siendo suyo.
    if (pid === null || !vive(pid) || !cerrojoVivo(viejo, { info, pid: process.pid, inicio: inicioPropio() })) {
        return { mensaje: T.cerrada, cerrada: true, estaba: false };
    }
    try {
        writeFileSync(join(datos, 'salir.peticion'), '', { flag: 'wx' });
    }
    catch (e) {
        if (e?.code !== 'EEXIST')
            throw e; // ya estaba pedido
    }
    const fin = Date.now() + esperaCierre;
    while (sigueCogido(cerrojo, pid, vive)) {
        if (Date.now() >= fin)
            throw new ErrorCli('fallo', T.noCerrada, { cerrada: false, estaba: true });
        await dormir(Math.min(INTERVALO_CIERRE, Math.max(1, fin - Date.now())));
    }
    return { mensaje: T.cerrada, cerrada: true, estaba: true };
}
// ---------- desinstalar ----------
// ¿Hay algo de SnetForever en esta AddOns? (Alguno de los cuatro addons, `.snetforever-preparando` o una ranura.)
function tieneSnetForever(addons) {
    if ([...COMPONENTES.map((c) => CARPETAS[c]), PREPARANDO].some((n) => existe(join(addons, n))))
        return true;
    try {
        return readdirSync(addons).some((x) => RANURA.test(x));
    }
    catch {
        return false;
    }
}
/**
 * La carpeta AddOns de la instalación, si es la del juego y existe: SNF_ADDONS o `config.addons`. Ronda 1 (M7): sin
 * ninguno de los dos, la primera de `candidatasJuego` (registro y carpetas habituales; el juego ya está cerrado) que
 * tenga algo de SnetForever. Si no, null.
 */
async function addonsInstalados(env, config, juego) {
    const v = validarCarpetaJuego(texto(env.SNF_ADDONS) ?? texto(config.addons));
    if (v.ok)
        return existe(v.addons) ? v.addons : null;
    const [registro, unidades] = await Promise.all(['registro', 'unidades'].map((q) => preguntar(juego, q)));
    const candidata = candidatasJuego({ env, config: {}, registro, unidades }).find((c) => existe(c.addons) && tieneSnetForever(c.addons));
    return candidata?.addons ?? null;
}
// ¿Tiene `carpeta` solo accesos (.lnk o .url) y nada más (ni carpetas)?
function soloAccesos(carpeta) {
    try {
        return readdirSync(carpeta, { withFileTypes: true }).every((e) => e.isFile() && /\.(?:lnk|url)$/i.test(e.name));
    }
    catch {
        return false;
    }
}
/**
 * ¿Es `ruta` un acceso de SnetForever que se puede retirar? Si no existe, null (no hay nada que retirar); si existe y no
 * es de esta forma, un aviso y no se toca:
 * - `grupo` (ronda 1, M2): la carpeta del menú Inicio de Inno (DefaultGroupName), es decir, una carpeta llamada
 *   `SnetForever` dentro de `…\Start Menu\Programs` (en el disco se llaman así en cualquier idioma de Windows) y con solo
 *   accesos dentro;
 * - `escritorio` e `inicio`: un archivo .lnk.
 */
function accesoValido(tipo, ruta) {
    if (!existe(ruta))
        return null;
    let info;
    try {
        info = lstatSync(ruta);
    }
    catch {
        return null;
    }
    const nombre = (r) => win32.basename(r).toLowerCase();
    const bien = tipo === 'grupo'
        ? info.isDirectory() && nombre(ruta) === 'snetforever' && nombre(win32.dirname(ruta)) === 'programs'
            && nombre(win32.dirname(win32.dirname(ruta))) === 'start menu' && soloAccesos(ruta)
        : info.isFile() && /\.lnk$/i.test(ruta);
    return bien ? true : { origen: ruta, code: 'ACCESO', mensaje: `«${ruta}» no parece un acceso de SnetForever (${tipo}): no se toca` };
}
async function desinstalar({ env, juego, opciones, T }) {
    // Con el juego abierto (o sin saberlo) no se mueve nada.
    if (await estaAbierto(juego))
        throw new ErrorCli('juego_abierto', null, { movidos: [] });
    const config = leerConfig(env);
    const avisos = [];
    const deAddOns = []; // los dos bloques de movimientos: [origen, subcarpeta de la cuarentena]
    const deAccesos = [];
    const addons = await addonsInstalados(env, config, juego);
    if (addons === null) {
        avisos.push({ origen: null, code: 'ADDONS', mensaje: 'No se sabe dónde está la carpeta AddOns: no se retira nada de ella' });
    }
    else {
        for (const c of COMPONENTES)
            deAddOns.push([join(addons, CARPETAS[c]), 'AddOns']);
        const ranuras = readdirSync(addons).filter((x) => RANURA.test(x)).sort();
        for (const r of ranuras)
            deAddOns.push([join(addons, r), 'AddOns']);
        deAddOns.push([join(addons, PREPARANDO), 'AddOns']);
    }
    for (const tipo of ['grupo', 'escritorio', 'inicio']) {
        const ruta = texto(opciones[tipo]);
        if (!ruta)
            continue;
        const valido = accesoValido(tipo, resolve(ruta));
        if (valido === true)
            deAccesos.push([resolve(ruta), join('accesos', tipo)]);
        else if (valido)
            avisos.push(valido);
    }
    const q = cuarentenaComponentes({ env, config });
    // I1: la -A de retirar.ps1, en la misma unidad que {app} (si es otra carpeta, se crea ya, con el mismo sello).
    const instalacion = texto(opciones.instalacion) ? resolve(opciones.instalacion) : null;
    const qInstalacion = instalacion ? cuarentenaInstalacionDe(env, instalacion, q, true) : null;
    if (qInstalacion && qInstalacion !== q) {
        mkdirSync(qInstalacion, { recursive: true });
        if (raizDe(qInstalacion) !== raizDe(instalacion)) {
            avisos.push({ origen: instalacion, code: 'UNIDAD', mensaje: 'La carpeta de datos está en otra unidad que la instalación: retirar.ps1 se negará' });
        }
    }
    const movidos = [];
    const fallidos = [];
    const extra = () => ({
        cuarentena: q, ...(qInstalacion ? { cuarentenaInstalacion: qInstalacion } : {}), movidos, ...(avisos.length > 0 ? { avisos } : {}),
    });
    // M3: si algo ya se movió, la línea 1 dice dónde está.
    const conParcial = (texto) => (movidos.length > 0 ? `${texto} ${formatear(T.parcial, q)}` : texto);
    const moverBloque = async (bloque) => {
        for (const [origen, sub] of bloque) {
            if (!existe(origen))
                continue;
            try {
                await moverConEsperas(origen, join(q, sub));
                movidos.push(origen);
            }
            catch (e) {
                fallidos.push({ origen, code: e?.code ?? null, mensaje: e?.message ?? String(e), error: e });
            }
        }
    };
    await moverBloque(deAddOns);
    // M1: el juego se vuelve a mirar antes de cada bloque (no en cada archivo).
    if (deAccesos.length > 0) {
        if (await estaAbierto(juego))
            throw new ErrorCli('juego_abierto', conParcial(T.codigos.juego_abierto), extra());
        await moverBloque(deAccesos);
    }
    if (fallidos.length > 0) {
        const codigo = codigoDe(fallidos[0].error);
        const detalle = fallidos.map(({ error, ...f }) => f);
        const base = codigo === 'fallo' ? formatear(T.codigos.fallo, detalle[0].mensaje) : T.codigos[codigo];
        throw new ErrorCli(codigo, conParcial(base), { ...extra(), fallidos: detalle });
    }
    const mensaje = qInstalacion && qInstalacion !== q ? formatear(T.desinstaladoDos, q, qInstalacion) : formatear(T.desinstalado, q);
    return { mensaje, ...extra() };
}
// ---------- desempaquetar (F5-4) y preparar ----------
async function ordenDesempaquetar({ sueltos, T }) {
    const [paquete, carpeta] = sueltos;
    if (!texto(paquete) || !texto(carpeta))
        throw new ErrorCli('fallo', formatear(T.codigos.fallo, 'desempaquetar <paquete> <carpeta>'));
    let r;
    try {
        r = desempaquetar(paquete, carpeta);
    }
    catch (e) {
        if (e?.code === 'ENOENT' && !existe(paquete))
            throw new ErrorCli('paquete', null, { detalle: 'falta_paquete' });
        throw e;
    }
    return {
        mensaje: formatear(T.desempaquetado, r.carpeta),
        carpeta: r.carpeta,
        componente: r.componente,
        version: r.version,
        ...(r.esquemaDatos !== undefined ? { esquemaDatos: r.esquemaDatos } : {}),
        archivos: r.archivos.length,
    };
}
async function preparar({ env, juego, opciones, T }) {
    const config = leerConfig(env);
    const v = validarCarpetaJuego(texto(opciones.addons) ?? texto(env.SNF_ADDONS) ?? texto(config.addons));
    if (!v.ok)
        throw new ErrorCli('carpeta', null, { detalle: v.motivo });
    if (await estaAbierto(juego))
        throw new ErrorCli('juego_abierto');
    return { mensaje: T.preparado, ...prepararAddOns(v.addons) };
}
const ORDENES = {
    detectar,
    'juego-abierto': ordenJuegoAbierto,
    instalar,
    'comprobar-ia': comprobarIa,
    'cerrar-app': cerrarApp,
    desinstalar,
    desempaquetar: ordenDesempaquetar,
    preparar,
};
/**
 * Ejecuta una orden de la CLI (ver el principio del archivo). Nunca lanza: cualquier fallo es un `codigo` de F6.
 * @param {string[]} argv `[<orden>, …]`
 * @param {object} [o]
 * @param {object} [o.env] el entorno (SNF_DATOS, SNF_ADDONS, SNF_CUARENTENA, SNF_CLAUDE, SNF_CODEX…)
 * @param {string|null} [o.clavePublica] la clave del manifiesto; con null, solo se comprueban los SHA-256
 * @param {{consultar: (que: string) => Promise<any>}} [o.juego] la de juego.mjs (las pruebas pasan una falsa)
 * @param {number} [o.esperaCierre] lo que espera cerrar-app (15 s)
 * @param {(pid: number) => boolean} [o.vive] si un proceso sigue vivo (solo pregunta)
 * @param {(pid: number) => {vive: boolean, nombre?: string, inicio?: number}} [o.info] qué proceso es (infoProceso de
 *   proceso.mjs, que solo pregunta): cerrar-app solo espera a un pid que sea de verdad la app (revisión final, I3)
 * @returns {Promise<{codigoSalida: number, resultado: {ok: boolean, codigo: string, mensaje: string}}>}
 */
export async function ejecutarOrden(argv, { env = process.env, clavePublica = CLAVE_PUBLICA, juego = { consultar }, esperaCierre = ESPERA_CIERRE, vive = viveDeVerdad, info = infoProceso, } = {}) {
    const { orden, opciones, sueltos } = leerArgumentos(argv);
    let idioma = opciones.idioma === 'es' || opciones.idioma === 'en' ? opciones.idioma : null;
    try {
        idioma ??= idiomaDeLaApp({ env, config: leerConfig(env) });
    }
    catch {
        idioma = 'en';
    }
    const T = TEXTOS_CLI[idioma];
    const respuesta = (codigo, mensaje, datos) => ({
        codigoSalida: CODIGOS_SALIDA[codigo],
        resultado: { ok: codigo === 'ok', codigo, mensaje: unaLinea(mensaje ?? T.codigos[codigo]), ...datos },
    });
    try {
        const ejecutar = Object.hasOwn(ORDENES, orden ?? '') ? ORDENES[orden] : null;
        if (!ejecutar)
            throw new ErrorCli('fallo', formatear(T.ordenDesconocida, orden ?? ''));
        const { codigo = 'ok', mensaje = null, ...datos } = await ejecutar({ env, clavePublica, juego, esperaCierre, vive, info, opciones, sueltos, idioma, T });
        return respuesta(codigo, mensaje, datos);
    }
    catch (e) {
        const codigo = codigoDe(e);
        if (e instanceof ErrorCli)
            return respuesta(codigo, e.mensajeFinal, e.extra);
        const detalle = e instanceof ErrorInstalar || e instanceof ErrorManifiesto || e instanceof ErrorPaquete ? { detalle: e.code } : {};
        const mensaje = codigo === 'fallo' ? formatear(T.codigos.fallo, e?.message ?? String(e)) : null;
        return respuesta(codigo, mensaje, detalle);
    }
}
// Escribe `ruta` sin pisar nada: si ya existe, lo de antes se aparta a su lado con la fecha (rutaLibre de mover.mjs).
function escribirSinPisar(ruta, contenido) {
    if (existe(ruta))
        moverSinPisar(ruta, ruta);
    writeFileSync(ruta, contenido, { encoding: 'utf8', flag: 'wx' });
}
/**
 * F6, `--salida <ruta>`: `<ruta>.json` (el mismo JSON de stdout) y `<ruta>.txt` (UTF-8 con BOM y tres líneas: el mensaje,
 * la elegida en detectar y la cuarentena en detectar y desinstalar; las demás, vacías). Crea la carpeta si falta.
 */
export function escribirSalida(ruta, orden, resultado) {
    mkdirSync(dirname(resolve(ruta)), { recursive: true });
    const lineas = [
        resultado.mensaje,
        orden === 'detectar' ? resultado.elegida : '',
        // la -A de retirar.ps1: la cuarentena de la instalación si se pidió (--instalacion), o la de siempre
        orden === 'detectar' || orden === 'desinstalar' ? (resultado.cuarentenaInstalacion ?? resultado.cuarentena) : '',
    ].map(unaLinea);
    escribirSinPisar(`${ruta}.json`, `${JSON.stringify(resultado)}\n`);
    escribirSinPisar(`${ruta}.txt`, `\uFEFF${lineas.join('\r\n')}\r\n`);
}
// ---------- como programa ----------
async function main() {
    const argv = process.argv.slice(2);
    const { codigoSalida, resultado } = await ejecutarOrden(argv);
    process.stdout.write(`${JSON.stringify(resultado)}\n`);
    const { orden, opciones } = leerArgumentos(argv);
    let codigo = codigoSalida;
    if (texto(opciones.salida)) {
        try {
            escribirSalida(opciones.salida, orden, resultado);
        }
        catch (e) {
            process.stderr.write(`SnetForever: no se pudo escribir la salida (${e?.code || e?.message})\n`);
            if (codigo === 0)
                codigo = CODIGOS_SALIDA.fallo;
        }
    }
    process.exitCode = codigo;
}
const esPrincipal = () => {
    try {
        return process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase();
    }
    catch {
        return false;
    }
};
if (esPrincipal())
    main();
