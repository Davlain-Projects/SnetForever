// Misiones que no están en la base del proyecto: se confirman con la API de Blizzard para que la IA conteste con datos
// reales en vez de inventar. La API da, por cada misión, título, zona, historia y recompensas; NO da coordenadas, quién
// la da ni objetivos (inventario-tsm.md, §4b).
//
// La primera vez se baja el índice de zonas y la lista de misiones de cada zona, en segundo plano y a 2 peticiones por
// segundo (tarda minutos), y se guarda en `<carpeta>/misiones-api.json` (caduca a los 30 días; si alguna zona falló, a
// 1 día). `consultar` NUNCA espera a la descarga: la arranca si hace falta y devuelve null mientras no esté lista (o si
// no hay credenciales), y el turno sigue sin la API. Conviene llamar a `iniciar()` al arrancar la app, para que los
// datos estén listos antes de la primera pregunta. Nada se borra: un archivo roto se aparta.
import { join } from 'node:path';
import { escribirAtomico } from '../buzon.mjs';
const VERSION = 1;
const DIA_MS = 24 * 3600 * 1000;
const CADUCA_MS = 30 * DIA_MS;
const REINTENTO_MS = 3600 * 1000; // tras un fallo, no se vuelve a intentar hasta pasada una hora
const ESPERA_MS = 500; // 2 peticiones por segundo
const MAX_DETALLES = 3;
const MIN_TITULO = 5; // títulos más cortos darían coincidencias falsas
const MIN_CARACTERES_SOLO = 8; // sin decir «misión», un título de una palabra corta no cuenta
const REINTENTOS_ZONA = 2; // veces que se repite una zona que falla antes de saltársela
const CADUCA_INCOMPLETA_MS = DIA_MS; // si alguna zona falló, se vuelve a bajar al día siguiente
const PISTA_MISION = /\b(mision|misiones|quest|quests)\b/;
const MAX_DESCRIPCION = 600;
const MAX_REPUTACIONES = 5;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
// Sin tildes, sin mayúsculas y con la puntuación y los espacios sueltos reducidos a un espacio.
export function normalizar(s) {
    return String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const dormirReal = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * `cliente` es el de blizzard.mjs (`indiceZonasMision`, `misionesDeZona`, `mision`). `fs`, `carpeta` (la carpeta
 * `comercio`), `dormir(ms)` y `ahora()` se inyectan. `opciones` va a la escritura atómica.
 */
export function crearMisionesApi({ cliente, fs, carpeta, dormir = dormirReal, ahora = Date.now, opciones = {} }) {
    const ruta = join(carpeta, 'misiones-api.json');
    let cache = null; // {misiones: [{id, titulo, zona, norm}]} cuando está lista
    let leido = false;
    let bajada = null; // promesa de la descarga en curso
    let falloCuando = -Infinity;
    let falloCodigo = null;
    const conNorm = (misiones) => misiones.map((m) => ({ ...m, norm: normalizar(m.titulo) }));
    function leerDeDisco() {
        leido = true;
        let texto;
        try {
            texto = fs.readFileSync(ruta, 'utf8');
        }
        catch {
            return; // no hay archivo (o no se puede leer): se bajará de nuevo
        }
        try {
            const j = JSON.parse(texto);
            if (!j || j.version !== VERSION || !Array.isArray(j.misiones) || !num(j.fecha))
                throw new Error('formato');
            if (ahora() - j.fecha >= (j.incompleta === true ? CADUCA_INCOMPLETA_MS : CADUCA_MS))
                return; // caducada: se baja otra vez
            if (j.misiones.length === 0)
                return; // una lista vacía no sirve de caché
            cache = { misiones: conNorm(j.misiones.filter((m) => m && Number.isFinite(m.id) && typeof m.titulo === 'string')) };
        }
        catch {
            // Archivo roto: se aparta (nunca se borra) y se empieza de cero.
            try {
                fs.renameSync(ruta, `${ruta}.roto-${ahora()}`);
            }
            catch {
                // si ni así se puede, se sobrescribirá al guardar
            }
        }
    }
    async function descargar() {
        const indice = await cliente.indiceZonasMision();
        const zonas = Array.isArray(indice?.areas) ? indice.areas.filter((a) => a && Number.isFinite(a.id)) : [];
        const misiones = [];
        let incompleta = false;
        for (let i = 0; i < zonas.length; i++) {
            if (i > 0)
                await dormir(ESPERA_MS);
            const z = zonas[i];
            let lista = null; // null = zona sin misiones (404)
            for (let intento = 0;; intento++) {
                try {
                    lista = await cliente.misionesDeZona(z.id);
                    break;
                }
                catch (e) {
                    if (e?.code === 'SIN_CREDENCIALES')
                        throw e;
                    if (intento >= REINTENTOS_ZONA) {
                        incompleta = true; // se salta esta zona y se sigue con las demás
                        break;
                    }
                    await dormir(ESPERA_MS);
                }
            }
            for (const q of Array.isArray(lista?.quests) ? lista.quests : []) {
                if (q && Number.isFinite(q.id) && typeof q.name === 'string' && q.name !== '') {
                    misiones.push({ id: q.id, titulo: q.name, zona: typeof lista.area === 'string' ? lista.area : z.name });
                }
            }
        }
        // Una lista vacía no se guarda (sería una caché inútil durante 30 días): se reintenta pasada una hora.
        if (misiones.length === 0)
            throw Object.assign(new Error('sin misiones'), { code: 'VACIO' });
        fs.mkdirSync(carpeta, { recursive: true });
        const contenido = JSON.stringify({ version: VERSION, fecha: ahora(), ...(incompleta ? { incompleta: true } : {}), misiones });
        await escribirAtomico(fs, ruta, contenido, { dormir, ...opciones });
        cache = { misiones: conNorm(misiones) };
    }
    // Arranca la descarga en segundo plano si hace falta; no espera.
    function iniciar() {
        if (!leido)
            leerDeDisco();
        if (cache || bajada || ahora() - falloCuando < REINTENTO_MS)
            return;
        falloCodigo = null;
        bajada = descargar()
            .catch((e) => {
            falloCuando = ahora();
            falloCodigo = e?.code || 'ERROR';
        })
            .finally(() => { bajada = null; });
    }
    // Espera a la descarga en curso y dice si ya hay datos. Solo para pruebas y para arrancar: `consultar` no la usa.
    async function listo() {
        iniciar();
        if (bajada)
            await bajada;
        return cache !== null;
    }
    function coincidencias(texto) {
        const n = normalizar(texto);
        const t = ` ${n} `;
        const pista = PISTA_MISION.test(n);
        // Sin decir «misión», un título de una sola palabra corta daría demasiadas coincidencias falsas.
        const sirve = (m) => m.norm.length >= MIN_TITULO && (pista || m.norm.includes(' ') || m.norm.length >= MIN_CARACTERES_SOLO);
        const vistos = new Set();
        const halladas = cache.misiones
            .filter((m) => sirve(m) && t.includes(` ${m.norm} `) && !vistos.has(m.id) && vistos.add(m.id))
            .sort((a, b) => b.norm.length - a.norm.length);
        // Un título que está dentro de otro título hallado más largo es el mismo trozo del mensaje: se queda el largo.
        return halladas.filter((m) => !halladas.some((o) => o.norm.length > m.norm.length && o.norm.includes(m.norm))).slice(0, MAX_DETALLES);
    }
    async function detalle(m) {
        const d = await cliente.mision(m.id);
        if (!d || typeof d !== 'object')
            return null; // 404: no se sabe nada de esta misión
        const r = d.rewards && typeof d.rewards === 'object' ? d.rewards : null;
        const u = r?.money?.units ?? {};
        const reputacion = (x) => ({ nombre: x?.faction?.name ?? x?.name ?? null, valor: num(x?.value ?? x?.amount) });
        return {
            id: m.id,
            titulo: typeof d?.title === 'string' && d.title !== '' ? d.title : m.titulo,
            zona: typeof d?.area?.name === 'string' && d.area.name !== '' ? d.area.name : m.zona,
            // null = la API no trajo recompensas: no se sabe, que no se tome por «no da nada».
            recompensas: r === null ? null : {
                experiencia: num(r.experience),
                dinero: { oro: num(u.gold), plata: num(u.silver), cobre: num(u.copper) },
                reputaciones: (Array.isArray(r.reputations) ? r.reputations : []).slice(0, MAX_REPUTACIONES).map(reputacion),
            },
            descripcion: typeof d?.description === 'string' ? d.description.slice(0, MAX_DESCRIPCION) : '',
        };
    }
    /**
     * `{fuente: 'api_blizzard', resultados}` con las misiones de la API cuyo título aparece en `texto` (máximo 3, con su
     * detalle), o null si la API no está disponible (sin credenciales, sin red o descarga todavía en marcha). No espera.
     */
    async function consultar(texto) {
        iniciar(); // no espera: si aún no hay datos, esta vez no hay API
        if (!cache)
            return null;
        const halladas = coincidencias(texto);
        const resultados = [];
        for (let i = 0; i < halladas.length; i++) {
            if (i > 0)
                await dormir(ESPERA_MS);
            try {
                const d = await detalle(halladas[i]);
                if (d)
                    resultados.push(d);
            }
            catch {
                // un detalle que falla no tira el resto
            }
        }
        return { fuente: 'api_blizzard', resultados };
    }
    /** Solo la lista de resultados (vacía si no hay nada o la API no está disponible). */
    async function buscar(texto) {
        const r = await consultar(texto);
        return r ? r.resultados : [];
    }
    return { buscar, consultar, iniciar, listo, fallo: () => falloCodigo };
}
/**
 * Para el turno de la IA: si el mensaje NO menciona ninguna misión de la base (ni por `refs.q` ni por nombre), pregunta
 * a la API; si la API no está disponible o falla, devuelve null y el turno sigue sin ella. Se llama antes de
 * `prepararTurno` (que es síncrono) y su resultado se le pasa como `{misionApi}`.
 */
export async function misionApiParaMensaje(api, base, mensaje) {
    try {
        const texto = typeof mensaje?.texto === 'string' ? mensaje.texto : '';
        if (!api || texto === '')
            return null;
        const refs = Array.isArray(mensaje.refs?.q) ? mensaje.refs.q : Object.values(mensaje.refs?.q ?? {});
        if (refs.length > 0)
            return null;
        if (base.buscarMisiones(texto, mensaje.idioma === 'en' ? 'en' : 'es').length > 0)
            return null;
        return await api.consultar(texto);
    }
    catch {
        return null;
    }
}
