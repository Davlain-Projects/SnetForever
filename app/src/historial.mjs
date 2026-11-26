// Historial de la conversación de cada personaje (R5: llamadas sin estado a la IA con un historial propio).
//
// Cada personaje tiene su archivo `historial/<pj sin signos>.jsonl` dentro de la carpeta de datos. Una línea por turno:
//   {"cuando": <ms>, "pj": "<clave del personaje>", "t": "jugador" | "ia" | "nueva", "texto": "…"}
// El archivo solo crece. Al pasar de 1 MB se renombra (con reintentos ante los bloqueos de Windows) a
// `<pj sin signos>-<sello>.jsonl` (con -1, -2… si ese nombre ya existe) y se empieza otro: nunca se borra nada. Como el
// nombre del archivo quita los signos, dos personajes podrían compartirlo; por eso cada línea lleva el `pj` entero y
// `recientes` solo cuenta las suyas.
//
// Aquí van las preguntas y las respuestas (es su sitio). Nunca se copian a registro.log.
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { sello } from './rutas.mjs';
import { conReintentos } from './fsseguro.mjs';
export const MAX_BYTES_HISTORIAL = 1024 * 1024;
export const TURNOS = 12; // líneas de jugador e IA: 6 intercambios
export const COLA_BYTES = 64 * 1024; // recientes solo lee el final de cada archivo
const TIPOS = new Set(['jugador', 'ia', 'nueva']);
const RESERVADOS = /^(?:con|prn|aux|nul|com[\d¹²³]|lpt[\d¹²³])$/i;
const MAX_NOMBRE = 80;
const dormirReal = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
/** Nombre de archivo para la clave de un personaje: solo letras y cifras; lo demás pasa a «_». */
export function nombreArchivo(pj) {
    let n = Array.from(String(pj ?? '').normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '_')).slice(0, MAX_NOMBRE).join('');
    if (n === '' || /^_+$/.test(n))
        n = '_';
    if (RESERVADOS.test(n))
        n = `_${n}`;
    return `${n}.jsonl`;
}
/**
 * crearHistorial(carpeta, {fs, ahora, dormir, sello}) -> {anadir, recientes}
 *   anadir(pj, {t: 'jugador' | 'ia' | 'nueva', texto}) -> Promise   añade una línea (se rechaza si `t` no vale). Las del
 *                                                 mismo pj van en cola; un destino de rotación que ya existe nunca se
 *                                                 sobrescribe (se le pone -1, -2…)
 *   recientes(pj, n = 12) -> [{rol, t, texto}]   las n últimas líneas de jugador e IA después de la última `nueva`, en
 *                                                 orden (rol = t: lo que espera construirEntrada). Lee los últimos 64 KB
 *                                                 del archivo y, si ahí hay menos de n desde la última `nueva` (y no hay
 *                                                 ninguna `nueva`), también los del archivo rotado más reciente.
 */
export function crearHistorial(carpeta, { fs = fsReal, ahora = Date.now, dormir = dormirReal, sello: selloDe = sello } = {}) {
    const dir = join(carpeta, 'historial');
    const ruta = (pj) => join(dir, nombreArchivo(pj));
    const raiz = (pj) => nombreArchivo(pj).slice(0, -'.jsonl'.length);
    const colas = new Map(); // archivo -> última promesa de anadir: las del mismo archivo van de una en una
    async function rotarSiHaceFalta(archivo) {
        let tamano;
        try {
            tamano = fs.statSync(archivo).size;
        }
        catch {
            return; // aún no existe
        }
        if (tamano < MAX_BYTES_HISTORIAL)
            return;
        const base = archivo.slice(0, -'.jsonl'.length);
        const marca = selloDe();
        for (let i = 0;; i++) {
            const destino = `${base}-${marca}${i === 0 ? '' : `-${i}`}.jsonl`;
            // El destino se mira justo antes de renombrar: en Windows renameSync sobrescribiría uno que ya existe.
            const renombrar = () => {
                if (fs.existsSync(destino))
                    throw Object.assign(new Error('el destino ya existe'), { code: 'EEXIST' });
                fs.renameSync(archivo, destino);
            };
            try {
                await conReintentos(renombrar, dormir);
                return;
            }
            catch (e) {
                if (e.code !== 'EEXIST' || i >= 1000)
                    throw e;
            }
        }
    }
    async function escribir(pj, t, texto) {
        fs.mkdirSync(dir, { recursive: true });
        const archivo = ruta(pj);
        await rotarSiHaceFalta(archivo);
        const linea = JSON.stringify({ cuando: ahora(), pj, t, texto: typeof texto === 'string' ? texto : '' });
        fs.appendFileSync(archivo, `${linea}\n`, 'utf8');
    }
    async function anadir(pj, { t, texto } = {}) {
        if (!TIPOS.has(t))
            throw new Error(`tipo de línea no válido: ${String(t)}`);
        if (typeof pj !== 'string' || pj === '')
            throw new Error('falta el personaje');
        // Una cola por archivo (por pj): dos llamadas a la vez no rotan a la vez ni eligen el mismo destino.
        const archivo = ruta(pj);
        const anterior = colas.get(archivo) || Promise.resolve();
        const hecho = anterior.then(() => escribir(pj, t, texto));
        const cola = hecho.catch(() => { });
        colas.set(archivo, cola);
        cola.then(() => {
            if (colas.get(archivo) === cola)
                colas.delete(archivo);
        });
        return hecho;
    }
    // Las líneas enteras de los últimos COLA_BYTES de un archivo ([] si no existe).
    function cola(archivo) {
        let fd;
        try {
            fd = fs.openSync(archivo, 'r');
        }
        catch {
            return [];
        }
        try {
            const tamano = fs.fstatSync(fd).size;
            const desde = Math.max(0, tamano - COLA_BYTES);
            const buf = Buffer.alloc(tamano - desde);
            let leido = 0;
            while (leido < buf.length) {
                const n = fs.readSync(fd, buf, leido, buf.length - leido, desde + leido);
                if (n <= 0)
                    break;
                leido += n;
            }
            const lineas = buf.subarray(0, leido).toString('utf8').split('\n');
            if (desde > 0)
                lineas.shift(); // la primera puede estar a medias
            return lineas;
        }
        finally {
            fs.closeSync(fd);
        }
    }
    // El archivo rotado más reciente de este personaje (por fecha de cambio), o null.
    function rotadoReciente(pj) {
        const prefijo = `${raiz(pj)}-`;
        let mejor = null;
        let nombres = [];
        try {
            nombres = fs.readdirSync(dir);
        }
        catch {
            return null;
        }
        for (const nombre of nombres) {
            if (!nombre.startsWith(prefijo) || !nombre.endsWith('.jsonl'))
                continue;
            try {
                const cuando = fs.statSync(join(dir, nombre)).mtimeMs;
                if (!mejor || cuando > mejor.cuando)
                    mejor = { nombre, cuando };
            }
            catch {
                // desapareció
            }
        }
        return mejor ? join(dir, mejor.nombre) : null;
    }
    // Lee las líneas de un personaje: {turnos desde la última «nueva», hayNueva}.
    function turnosDe(lineas, pj, previos = []) {
        let turnos = [...previos];
        let hayNueva = false;
        for (const linea of lineas) {
            if (linea.trim() === '')
                continue;
            let l;
            try {
                l = JSON.parse(linea);
            }
            catch {
                continue; // una línea rota no rompe el resto
            }
            if (!l || l.pj !== pj || !TIPOS.has(l.t))
                continue;
            if (l.t === 'nueva') {
                turnos = [];
                hayNueva = true;
            }
            else if (typeof l.texto === 'string') {
                turnos.push({ rol: l.t, t: l.t, texto: l.texto });
            }
        }
        return { turnos, hayNueva };
    }
    function recientes(pj, n = TURNOS) {
        const cuantos = Number.isInteger(n) && n > 0 ? n : 0;
        if (cuantos === 0)
            return [];
        let { turnos, hayNueva } = turnosDe(cola(ruta(pj)), pj);
        if (!hayNueva && turnos.length < cuantos) {
            const rotado = rotadoReciente(pj);
            if (rotado) {
                const previos = turnosDe(cola(rotado), pj).turnos;
                turnos = turnosDe(cola(ruta(pj)), pj, previos).turnos;
            }
        }
        return turnos.slice(-cuantos);
    }
    return { anadir, recientes };
}
