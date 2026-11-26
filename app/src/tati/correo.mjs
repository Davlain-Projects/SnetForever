// Canal de archivos entre la app y TATI, sin red: cada canal es una pareja de archivos fijos en la carpeta del puente
// (`<canal>.pedido.json` y `<canal>.respuesta.json`), reescritos con un temporal de nombre fijo (`<archivo>.tmp`) y un
// renombre encima. Nada se acumula y nada se borra. Sobre: `{v: 1, id, cuando, ...}`. Quien atiende contesta primero un
// acuse (`estado: 'recibido'`) y después el resultado (`estado: 'hecho'` o `'error'` con `tipo`).
//
// - La cola de `pedir` es solo de memoria: vale para un único cliente por canal (dos procesos que pidan por el mismo
//   canal se pisarían el pedido). Por eso cada relevo usa su propio canal (`relevo-<pid>`).
// - Un resultado tardío de un id viejo (un `manejar` que acabó después de que su `pedir` se rindiera) puede pisar la
//   respuesta del canal; el `pedir` nuevo lo ignora porque no es su id, y su propio acuse y resultado lo vuelven a pisar.
// - Como el pedido no se borra nunca, al arrancar `atender` (p. ej. al reiniciar la app) no repite lo ya contestado: la
//   primera vez que ve un canal, si `<canal>.respuesta.json` lleva el id del pedido (con cualquier estado, también el
//   acuse), lo da por contestado sin ejecutarlo.
// - Un pedido sin respuesta cuyo `cuando` tiene más de 10 minutos según el reloj de quien atiende (o no es un número) no
//   se ejecuta: se contesta `{estado: 'error', tipo: 'caducado'}`.
// - `pedir` pone en el pedido `hasta = cuando + acuseMs`: pasado ese momento, quien pidió ya se rindió (`sin_acuse`) y
//   puede haber repetido la petición con otro pedido. Si `atender` llega a acusarlo con su reloj más allá de `hasta`
//   (o `hasta` no es un número), contesta `caducado` sin ejecutarlo: así una acción no llega tarde. Un pedido sin `hasta`
//   (de antes) sigue solo con la regla de los 10 minutos. Las dos partes miran el reloj del mismo PC.
//
// Solo importa node:fs, node:path y node:crypto: el complemento de TATI copia este archivo tal cual.
import * as fsReal from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
const PEDIDO = '.pedido.json';
const RESPUESTA = '.respuesta.json';
const SENAL = '.senal.json';
const TEMPORAL = '.tmp';
// Windows no deja renombrar encima de un archivo que otro proceso tiene abierto (un lector a medias).
const OCUPADO = new Set(['EPERM', 'EBUSY', 'EACCES']);
const REINTENTOS = 5;
const ESPERA_REINTENTO = 50;
const FINALES = new Set(['hecho', 'error']);
/** Edad (ms, según el reloj de quien atiende) a partir de la cual un pedido sin respuesta ya no se ejecuta. */
export const CADUCA_MS = 10 * 60_000;
/** Lo que se espera un resultado después de pedir parar (una TATI vieja no hace caso al archivo de parar). */
export const DETENER_ESPERA_MS = 15_000;
const dormirReal = (ms) => new Promise((r) => setTimeout(r, ms));
const RELOJ = {
    ahora: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h),
};
/** Un id nuevo para un pedido: 16 cifras hexadecimales. */
export function nuevoId() {
    return randomBytes(8).toString('hex');
}
/**
 * Escribe `objeto` en `ruta`: primero `<ruta>.tmp` (nombre fijo, se pisa la próxima vez) y después lo renombra encima.
 * Si el renombre choca con un lector (EPERM, EBUSY o EACCES) lo repite hasta 5 veces, con 50 ms entre medias; si sigue
 * sin poder, o falla por otra cosa, lanza el error (el archivo de antes queda entero).
 */
export async function escribirSobre(ruta, objeto, { fs = fsReal, dormir = dormirReal } = {}) {
    const temporal = `${ruta}${TEMPORAL}`;
    fs.writeFileSync(temporal, JSON.stringify(objeto));
    for (let intento = 0;; intento++) {
        try {
            fs.renameSync(temporal, ruta);
            return;
        }
        catch (e) {
            if (intento >= REINTENTOS || !OCUPADO.has(e && e.code))
                throw e;
            await dormir(ESPERA_REINTENTO);
        }
    }
}
/** Lee un sobre: null si falta, si está a medias (se está reemplazando) o si no es `{v: 1, id: string}`. */
export function leerSobre(ruta, { fs = fsReal } = {}) {
    try {
        const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
        if (!j || typeof j !== 'object' || Array.isArray(j) || j.v !== 1 || typeof j.id !== 'string')
            return null;
        return j;
    }
    catch {
        return null;
    }
}
// Cola en memoria por carpeta y canal: una sola petición en vuelo. La entrada se quita al vaciarse.
const colas = new Map();
/**
 * Pide algo por `canal`: escribe `<canal>.pedido.json` con `{v: 1, id, cuando, hasta, ...cuerpo}` (`hasta` = `cuando` +
 * `acuseMs`, el plazo del acuse; crea la carpeta si falta) y
 * mira `<canal>.respuesta.json` cada `cada` ms. Solo cuenta una respuesta con el mismo `id`. Devuelve el sobre del
 * resultado tal cual (`{v, id, cuando, estado: 'hecho' | 'error', ...}`), o:
 * - `{estado: 'error', tipo: 'sin_acuse'}` si en `acuseMs` no llegó ni el acuse ni el resultado;
 * - `{estado: 'error', tipo: 'tiempo'}` si en `tiempoMs` no llegó el resultado.
 * Los dos plazos cuentan desde que se escribe el pedido. Otro `pedir` sobre el mismo canal espera a que acabe este.
 * Un fallo al escribir el pedido rechaza la promesa (con el error de fs).
 *
 * Opciones para un turno largo (sin ellas, todo como arriba):
 * - `senalMs`: lee también `<canal>.senal.json`. Cuenta como señal cada `cuando` distinto con el id de este pedido, medido
 *   con el reloj de quien pide. Tras la primera ya no vale `tiempoMs`: da `{estado: 'error', tipo: 'sin_senal'}` tras
 *   `senalMs` sin un `cuando` nuevo. Una señal vale también como acuse. Sin ninguna señal, `tiempoMs` como siempre.
 * - `alId(id)`: se llama con el id del pedido, ya escrito y antes de esperar.
 * - `alEsperar()`: se llama en cada vuelta de la espera.
 * - `detener()`: el momento en que se pidió parar, o null. Desde ahí solo cuenta este plazo: pasados `DETENER_ESPERA_MS`
 *   sin resultado da `{estado: 'error', tipo: 'detenido', detalle: 'Se detuvo el turno en TATI.'}`.
 */
export function pedir(carpeta, canal, cuerpo, opciones = {}) {
    const clave = `${resolve(carpeta)}\u0000${canal}`;
    const previa = colas.get(clave) || Promise.resolve();
    const esta = previa.then(() => pedirUno(carpeta, canal, cuerpo, opciones));
    const cola = esta.then(() => { }, () => { });
    colas.set(clave, cola);
    cola.then(() => {
        if (colas.get(clave) === cola)
            colas.delete(clave);
    });
    return esta;
}
async function pedirUno(carpeta, canal, cuerpo, { fs = fsReal, ahora = Date.now, dormir = dormirReal, cada = 250, acuseMs = 5000, tiempoMs = 60_000, senalMs, alId, alEsperar, detener } = {}) {
    const id = nuevoId();
    const inicio = ahora();
    fs.mkdirSync(carpeta, { recursive: true });
    await escribirSobre(join(carpeta, `${canal}${PEDIDO}`), { ...cuerpo, v: 1, id, cuando: inicio, hasta: inicio + acuseMs }, { fs, dormir });
    const rutaRespuesta = join(carpeta, `${canal}${RESPUESTA}`);
    const rutaSenal = senalMs === undefined ? null : join(carpeta, `${canal}${SENAL}`);
    let acuse = false;
    let cuandoSenal = null; // el último `cuando` visto (el reloj de quien la escribe: solo se compara)
    let vistaSenal = null; // cuándo se vio, con el reloj de quien pide
    if (alId)
        alId(id);
    for (;;) {
        await dormir(cada);
        if (alEsperar)
            alEsperar();
        const r = leerSobre(rutaRespuesta, { fs });
        if (r && r.id === id) {
            if (FINALES.has(r.estado))
                return r;
            if (r.estado === 'recibido')
                acuse = true;
        }
        const t = ahora();
        if (rutaSenal) {
            const s = leerSobre(rutaSenal, { fs });
            if (s && s.id === id && Number.isFinite(s.cuando)) {
                acuse = true;
                if (s.cuando !== cuandoSenal) {
                    cuandoSenal = s.cuando;
                    vistaSenal = t;
                }
            }
        }
        const parada = detener ? detener() : null;
        if (Number.isFinite(parada)) {
            if (t - parada >= DETENER_ESPERA_MS)
                return { estado: 'error', tipo: 'detenido', detalle: 'Se detuvo el turno en TATI.' };
            continue;
        }
        const pasado = t - inicio;
        if (!acuse && pasado >= acuseMs)
            return { estado: 'error', tipo: 'sin_acuse' };
        if (vistaSenal !== null) {
            if (t - vistaSenal >= senalMs)
                return { estado: 'error', tipo: 'sin_senal' };
            continue;
        }
        if (pasado >= tiempoMs)
            return { estado: 'error', tipo: 'tiempo' };
    }
}
// El resultado que se escribe: lo que devuelve `manejar` si es un objeto con estado final; si no, un fallo sin más.
function resultadoDe(valor) {
    if (valor && typeof valor === 'object' && !Array.isArray(valor) && FINALES.has(valor.estado))
        return valor;
    return { estado: 'error', tipo: 'fallo' };
}
/**
 * Atiende los canales de `carpeta` cuyo nombre casa con `patron` (RegExp): cada `cada` ms lista la carpeta y, por cada
 * `<canal>.pedido.json` con un `id` que aún no contestó, escribe el acuse y después el resultado de
 * `await manejar(canal, pedido)`. Si `manejar` lanza (o no devuelve `{estado: 'hecho' | 'error', ...}`) contesta
 * `{estado: 'error', tipo: 'fallo'}`, sin el mensaje (puede llevar rutas). De uno en uno. Recuerda solo el último id
 * contestado de cada canal. Un id con el acuse escrito no se vuelve a atender aunque falle la escritura del resultado
 * (`manejar` puede gastar una ranura: no se repite); si falla el acuse, se intenta en la siguiente vuelta. Al arrancar
 * no repite un pedido cuya respuesta ya lleva su id. Un pedido de hace más de `CADUCA_MS`, o que lleva `hasta` y ya pasó
 * (o no es un número), se contesta `caducado` sin llamar a `manejar`.
 * `parar()` quita el reloj, no escribe nada más y devuelve una promesa que se cumple al acabar la vuelta en curso.
 */
export function atender(carpeta, patron, manejar, { fs = fsReal, cada = 250, reloj = RELOJ } = {}) {
    // una copia sin g ni y: con ellas, test() arrastra lastIndex de una llamada a la siguiente
    const casa = new RegExp(patron.source, patron.flags.replace(/[gy]/g, ''));
    const contestados = new Map();
    let parado = false;
    let temporizador = null;
    let vuelta = Promise.resolve();
    async function repasar() {
        let nombres;
        try {
            nombres = fs.readdirSync(carpeta);
        }
        catch {
            return; // la carpeta aún no existe
        }
        for (const nombre of [...nombres].sort()) {
            if (parado)
                return;
            if (!nombre.endsWith(PEDIDO))
                continue;
            const canal = nombre.slice(0, -PEDIDO.length);
            if (!casa.test(canal))
                continue;
            const pedido = leerSobre(join(carpeta, nombre), { fs });
            if (!pedido || contestados.get(canal) === pedido.id)
                continue;
            const rutaRespuesta = join(carpeta, `${canal}${RESPUESTA}`);
            // la primera vez que se ve el canal (al arrancar): lo contestado antes de reiniciar no se repite
            if (!contestados.has(canal)) {
                const previa = leerSobre(rutaRespuesta, { fs });
                if (previa && previa.id === pedido.id) {
                    contestados.set(canal, pedido.id);
                    continue;
                }
            }
            const sobre = (cuerpo) => ({ ...cuerpo, v: 1, id: pedido.id, cuando: reloj.ahora() });
            const ahora = reloj.ahora();
            const viejo = !Number.isFinite(pedido.cuando) || ahora - pedido.cuando > CADUCA_MS;
            const tarde = 'hasta' in pedido && !(Number.isFinite(pedido.hasta) && ahora <= pedido.hasta);
            if (viejo || tarde) {
                try {
                    await escribirSobre(rutaRespuesta, sobre({ estado: 'error', tipo: 'caducado' }), { fs });
                    contestados.set(canal, pedido.id);
                }
                catch {
                    // se intenta en la siguiente vuelta
                }
                continue;
            }
            try {
                await escribirSobre(rutaRespuesta, sobre({ estado: 'recibido' }), { fs });
            }
            catch {
                continue; // se intenta en la siguiente vuelta
            }
            contestados.set(canal, pedido.id);
            let resultado;
            try {
                resultado = resultadoDe(await manejar(canal, pedido));
            }
            catch {
                resultado = resultadoDe(null);
            }
            if (parado)
                return;
            try {
                await escribirSobre(rutaRespuesta, sobre(resultado), { fs });
            }
            catch {
                // quien pidió acabará con `tiempo`
            }
        }
    }
    function programar() {
        if (parado)
            return;
        temporizador = reloj.setTimeout(() => {
            temporizador = null;
            vuelta = repasar().catch(() => { }).then(programar);
        }, cada);
    }
    programar();
    return {
        parar() {
            parado = true;
            if (temporizador !== null)
                reloj.clearTimeout(temporizador);
            temporizador = null;
            return vuelta;
        },
    };
}
