// Arranque fijo de SnetForever (fase 5, tarea 10; R12). Vive en `{app}\arranque.mjs` y solo cambia con el instalador,
// así que no importa nada de `src/` (lo de `src/` cambia con cada versión): solo módulos de Node.
//
// La versión que se lanza es la de `actual.txt` (`^\d+\.\d+\.\d+(\.\d+)?$` y con su carpeta en `app\`). Si no vale o le
// falta su carpeta, se usa `previa.txt` con la misma validación: `actual.txt` se reescribe con ella y se apunta. Si
// tampoco vale, sale con 2 sin lanzar nada (y lo apunta).
//
// - `node arranque.mjs`: lanza `node app\<v>\src\principal.mjs`, separado y sin consola, en la carpeta de instalación
//   (así la carpeta de la versión no queda en uso y se puede apartar a la cuarentena).
//   - Si el hijo termina antes de SNF_ARRANQUE_ESPERA ms (30.000 por defecto) con un código que no es 0 ni 3 (3 = ya
//     estaba abierta) y hay una `previa.txt` válida, con su carpeta y distinta de la que falló, vuelve a ella:
//     `actual.txt` = la previa y `fallida.txt` = la que falló (con temporal y renombre), una línea en
//     `<datos>\registro-arranque.log` y se lanza la previa **una vez**. Si no, suelta al hijo (`unref`) y sale con 0.
//   - Reinicio (SNF_REINICIO_DE = el pid de la app que se reinicia, lo pone `reiniciar` de propia.mjs): antes de lanzar
//     se espera a que ese proceso salga (SNF_REINICIO_ESPERA ms, 20.000 por defecto), para que la nueva tome el cerrojo.
//     Si aun así la nueva sale con 3 (el cerrojo sigue ocupado), no se da por buena ni se vuelve atrás: se apunta y sale
//     con 3.
// - `node arranque.mjs --cli <orden> …`: ejecuta `app\<v>\src\instalador\cli.mjs <orden> …` de forma síncrona, con la
//   salida heredada, y sale con su código (2 si no hay versión que valga). La CLI nunca vuelve atrás por un fallo.
//
// La carpeta de instalación es SNF_INSTALACION o la de este archivo; la de datos, SNF_DATOS o
// `%LOCALAPPDATA%\SnetForever`. Aquí no se borra nada ni se cierra ningún proceso: para saber si la app vieja sigue viva
// se usa `process.kill(pid, 0)`, que solo pregunta (la señal 0 no hace nada al proceso).
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as dormir } from 'node:timers/promises';
// Copia de VERSION_APP de src/actualizar/propia.mjs (propia.test.js vigila que sean iguales).
const VERSION_APP = /^\d+\.\d+\.\d+(\.\d+)?$/;
const ESPERA_POR_DEFECTO = 30000;
const ESPERA_REINICIO_POR_DEFECTO = 20000;
const YA_ABIERTA = 3;
const SALIDA_MAL_INSTALADA = 2;
const REINICIO_DE = 'SNF_REINICIO_DE';
const env = process.env;
const instalacion = env.SNF_INSTALACION || dirname(fileURLToPath(import.meta.url));
const datos = env.SNF_DATOS || join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'SnetForever');
const rutaActual = join(instalacion, 'actual.txt');
const rutaPrevia = join(instalacion, 'previa.txt');
const rutaFallida = join(instalacion, 'fallida.txt');
// La versión de `ruta` si es válida y tiene su carpeta en `app\`; si no, null.
function versionCon(ruta) {
    let v;
    try {
        v = readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '').trim();
    }
    catch {
        return null;
    }
    if (!VERSION_APP.test(v))
        return null;
    try {
        return statSync(join(instalacion, 'app', v)).isDirectory() ? v : null;
    }
    catch {
        return null;
    }
}
// Una línea en `<datos>\registro-arranque.log`. Si no se puede, no pasa nada (el arranque sigue).
function apuntar(texto) {
    try {
        mkdirSync(datos, { recursive: true });
        appendFileSync(join(datos, 'registro-arranque.log'), `${new Date().toISOString()} ${texto}\n`, 'utf8');
    }
    catch {
        // sin registro
    }
}
// Escribe con un temporal nuevo (wx) y un renombre.
function escribirConRenombre(ruta, texto) {
    const temporal = `${ruta}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(temporal, texto, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporal, ruta);
}
// Milisegundos de una variable de entorno (un número ≥ 0), o `porDefecto`.
function milisegundos(nombre, porDefecto) {
    const texto = env[nombre];
    const n = Number(texto);
    return texto !== undefined && texto !== '' && Number.isFinite(n) && n >= 0 ? n : porDefecto;
}
/**
 * La versión que se lanza: la de `actual.txt` o, si no vale o le falta su carpeta, la de `previa.txt` (con la misma
 * validación; `actual.txt` se reescribe con ella y se apunta). null si ninguna vale.
 */
function versionALanzar() {
    const v = versionCon(rutaActual);
    if (v !== null)
        return v;
    const previa = versionCon(rutaPrevia);
    if (previa === null) {
        apuntar(`arranque: ni «${rutaActual}» ni «${rutaPrevia}» tienen una versión instalada válida; no se lanza nada`);
        return null;
    }
    let nota = '';
    try {
        escribirConRenombre(rutaActual, previa);
    }
    catch (e) {
        nota = ` (no se pudo reescribir actual.txt: ${e?.code || e?.message})`;
    }
    apuntar(`arranque: «${rutaActual}» no tiene una versión instalada válida; se usa la previa, ${previa}${nota}`);
    return previa;
}
// El pid de la app que se reinicia (SNF_REINICIO_DE), o null.
function pidDelReinicio() {
    const texto = env[REINICIO_DE];
    if (typeof texto !== 'string' || !/^\d+$/.test(texto))
        return null;
    const pid = Number(texto);
    return Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid ? pid : null;
}
// ¿Sigue vivo el proceso `pid`? La señal 0 solo pregunta (ESRCH: no existe; EPERM: existe, pero no es nuestro).
function vive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        return e?.code === 'EPERM';
    }
}
// Espera hasta `ms` a que salga el proceso `pid`. Devuelve si salió.
async function esperarSalida(pid, ms) {
    const fin = Date.now() + ms;
    while (vive(pid)) {
        if (Date.now() >= fin)
            return false;
        await dormir(100);
    }
    return true;
}
function lanzar(v) {
    const entorno = { ...env };
    delete entorno[REINICIO_DE]; // es solo para este arranque: la app nueva no lo hereda
    return spawn(process.execPath, [join(instalacion, 'app', v, 'src', 'principal.mjs')], {
        cwd: instalacion, detached: true, stdio: 'ignore', windowsHide: true, env: entorno,
    });
}
// Espera a que `hijo` termine o pasen `ms`: {termino: true, codigo, error?} o {termino: false}.
function vigilar(hijo, ms) {
    return new Promise((resolver) => {
        let hecho = false;
        const fin = (r) => {
            if (hecho)
                return;
            hecho = true;
            clearTimeout(reloj);
            resolver(r);
        };
        const reloj = setTimeout(() => fin({ termino: false }), ms);
        hijo.on('exit', (codigo) => fin({ termino: true, codigo }));
        hijo.on('error', (error) => fin({ termino: true, codigo: null, error }));
    });
}
function cli(argumentos) {
    const v = versionALanzar();
    if (v === null) {
        process.stderr.write(`SnetForever: ni «${rutaActual}» ni «${rutaPrevia}» tienen una versión instalada válida\n`);
        return SALIDA_MAL_INSTALADA;
    }
    const r = spawnSync(process.execPath, [join(instalacion, 'app', v, 'src', 'instalador', 'cli.mjs'), ...argumentos], {
        stdio: 'inherit', windowsHide: true,
    });
    if (r.error) {
        process.stderr.write(`SnetForever: no se pudo ejecutar la CLI (${r.error.code || r.error.message})\n`);
        return 1;
    }
    return typeof r.status === 'number' ? r.status : 1;
}
async function arrancar() {
    const v = versionALanzar();
    if (v === null)
        return SALIDA_MAL_INSTALADA;
    const vieja = pidDelReinicio();
    if (vieja !== null) {
        const ms = milisegundos('SNF_REINICIO_ESPERA', ESPERA_REINICIO_POR_DEFECTO);
        if (!(await esperarSalida(vieja, ms)))
            apuntar(`arranque: reinicio: la app de antes (pid ${vieja}) sigue abierta tras ${ms} ms`);
    }
    const ms = milisegundos('SNF_ARRANQUE_ESPERA', ESPERA_POR_DEFECTO);
    const hijo = lanzar(v);
    const r = await vigilar(hijo, ms);
    if (!r.termino || r.codigo === 0) {
        hijo.unref();
        return 0;
    }
    if (r.codigo === YA_ABIERTA) {
        if (vieja === null)
            return 0; // ya estaba abierta: no es un fallo de esta versión
        // Tras un reinicio, un 3 dice que la nueva no llegó a arrancar (el cerrojo sigue ocupado): ni es buena ni ha fallado.
        apuntar(`arranque: reinicio: la ${v} salió con 3 (el cerrojo de la app sigue ocupado); no se ha podido comprobar`);
        return YA_ABIERTA;
    }
    const como = r.error ? `no se pudo lanzar (${r.error.code || r.error.message})` : `terminó con el código ${r.codigo}`;
    const previa = versionCon(rutaPrevia);
    if (previa === null || previa === v) {
        apuntar(`arranque: la ${v} ${como} antes de ${ms} ms y no hay una versión previa a la que volver`);
        return 0;
    }
    try {
        escribirConRenombre(rutaActual, previa);
    }
    catch (e) {
        apuntar(`arranque: la ${v} ${como} antes de ${ms} ms y no se pudo volver a la ${previa} (${e?.code || e?.message})`);
        return 0;
    }
    let sinFallida = '';
    try {
        escribirConRenombre(rutaFallida, v);
    }
    catch (e) {
        sinFallida = ` (no se pudo escribir fallida.txt: ${e?.code || e?.message})`;
    }
    apuntar(`arranque: la ${v} ${como} antes de ${ms} ms; se vuelve a la ${previa}${sinFallida}`);
    const otro = lanzar(previa);
    otro.on('error', () => { }); // una sola vez: si tampoco arranca, no se insiste
    otro.unref();
    return 0;
}
const argumentos = process.argv.slice(2);
if (argumentos[0] === '--cli') {
    process.exit(cli(argumentos.slice(1)));
}
else {
    process.exit(await arrancar());
}
