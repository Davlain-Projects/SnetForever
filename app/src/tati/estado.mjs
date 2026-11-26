// El último estado de cada personaje para TATI: el addon manda un latido con el contexto y aquí se guarda lo último de
// cada personaje (10 como mucho) en `puente-tati/estados.json`, para que TATI sepa dónde está el jugador aunque solo
// hable por voz. No se guarda el texto del mensaje, ni las referencias, ni el inventario.
import { join } from 'node:path';
import * as fsReal from 'node:fs';
import { escribirAtomico } from '../buzon.mjs';
import { cuarentenaNueva } from '../rutas.mjs';
import { carpetaPuente } from './config.mjs';
const MAX_PERSONAJES = 10;
const RANURAS = 21;
const lista = (v) => (Array.isArray(v) ? v : []);
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
function soloCampos(origen, campos) {
    const o = objeto(origen);
    const salida = {};
    for (const c of campos)
        if (o[c] !== undefined && (typeof o[c] !== 'object' || o[c] === null))
            salida[c] = o[c];
    return salida;
}
// Lo que se guarda de `ctx`: el contexto entero del mensaje menos el inventario (`inv`), para que `estado_juego` y las
// herramientas vean lo mismo que en el chat (`prepararTurno` necesita prof, talentos, mazmorras...).
function ctxGuardado(ctx) {
    const { inv, ...resto } = objeto(ctx);
    return resto;
}
/** Resumen para TATI de una entrada guardada. Nunca lleva la clave del personaje ni nombres. */
export function resumenEstado(entrada, ahora = Date.now()) {
    if (!entrada || typeof entrada !== 'object')
        return { conocido: false };
    const ctx = objeto(entrada.mensaje?.ctx);
    const misiones = lista(ctx.registro)
        .filter((r) => r && esNumero(r.q))
        .map((r) => ({ q: r.q, titulo: typeof r.t === 'string' ? r.t : '', completa: r.c === 1 }));
    const g = objeto(ctx.guia);
    return {
        conocido: true,
        haceSegundos: Math.max(0, Math.floor((ahora - (entrada.cuando ?? ahora)) / 1000)),
        personaje: soloCampos(ctx.pj, ['faccion', 'raza', 'clase', 'nivel']),
        lugar: soloCampos(ctx.lugar, ['zona', 'subzona', 'mapa', 'x', 'y', 'instancia']),
        misiones,
        guia: typeof g.titulo === 'string' && g.titulo !== '' ? g.titulo : null,
    };
}
export function crearEstadoJuego({ datos, fs = fsReal, ahora = Date.now }) {
    const carpeta = carpetaPuente(datos);
    const ruta = join(carpeta, 'estados.json');
    let ultimoPj = null;
    const personajes = new Map(); // pj -> {pj, mensaje, r, cuando, gastadas}, del más viejo al más nuevo
    if (fs.existsSync(ruta)) {
        let valido = false;
        try {
            const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
            if (j && j.version === 1 && j.personajes && typeof j.personajes === 'object') {
                for (const [pj, e] of Object.entries(j.personajes)) {
                    if (e && typeof e === 'object' && esNumero(e.cuando)) {
                        personajes.set(pj, { pj, mensaje: objeto(e.mensaje), r: esNumero(e.r) ? e.r : 0, cuando: e.cuando, gastadas: esNumero(e.gastadas) ? e.gastadas : 0 });
                    }
                }
                ultimoPj = typeof j.ultimo === 'string' && personajes.has(j.ultimo) ? j.ultimo : null;
                valido = true;
            }
        }
        catch {
            // se aparta abajo
        }
        if (!valido) {
            personajes.clear();
            ultimoPj = null;
            fs.renameSync(ruta, join(cuarentenaNueva({ ...process.env, SNF_DATOS: datos }), 'estados.json'));
        }
    }
    const copia = (e) => (e ? { pj: e.pj, mensaje: e.mensaje, r: e.r, cuando: e.cuando } : null);
    // Todas las escrituras van en fila: dos seguidas no acaban en disco en desorden. Cada una guarda lo que hay al
    // ejecutarse, así la última siempre deja el estado más nuevo.
    let previa = Promise.resolve();
    const guardar = () => {
        const esta = previa.then(async () => {
            fs.mkdirSync(carpeta, { recursive: true });
            const contenido = JSON.stringify({
                version: 1,
                ultimo: ultimoPj,
                personajes: Object.fromEntries([...personajes].map(([k, e]) => [k, { mensaje: e.mensaje, r: e.r, cuando: e.cuando, gastadas: e.gastadas }])),
            });
            const mover = (origen, nombre) => fs.renameSync(origen, join(cuarentenaNueva({ ...process.env, SNF_DATOS: datos }), nombre));
            await escribirAtomico(fs, ruta, contenido, { mover });
        });
        previa = esta.catch(() => { }); // un fallo no frena las siguientes
        return esta;
    };
    return {
        apuntar(pj, mensaje, r) {
            const m = objeto(mensaje);
            personajes.delete(pj);
            personajes.set(pj, { pj, mensaje: { pj, idioma: m.idioma === 'en' ? 'en' : 'es', ctx: ctxGuardado(m.ctx) }, r: esNumero(r) ? r : 0, cuando: ahora(), gastadas: 0 });
            ultimoPj = pj;
            while (personajes.size > MAX_PERSONAJES)
                personajes.delete(personajes.keys().next().value);
            return guardar();
        },
        ultimo: () => copia(personajes.get(ultimoPj)),
        de: (pj) => copia(personajes.get(pj)),
        /** Suma una ranura gastada al último y la guarda en disco (devuelve la promesa de la escritura). */
        gastar() {
            const e = personajes.get(ultimoPj);
            if (!e)
                return Promise.resolve();
            e.gastadas += 1;
            return guardar();
        },
        ranurasQuedan() {
            const e = personajes.get(ultimoPj);
            return e ? Math.max(0, RANURAS - e.r - e.gastadas) : null;
        },
    };
}
