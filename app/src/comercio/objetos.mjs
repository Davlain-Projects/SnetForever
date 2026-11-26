// Catálogo de objetos (fichas de la API de Blizzard) y grupos de objetos para las listas.
//
// Se guarda en `<carpeta>/objetos.json`: las fichas que ya conocemos y los ids que la API dijo que no existen (404),
// para no volver a preguntar por ellos hasta pasados 7 días.
// Los grupos por profesión no están aquí: llegan en la fase 3, junto al crafteo.
import { join } from 'node:path';
import { escribirAtomico } from '../buzon.mjs';
const VERSION = 1;
const DIA_MS = 24 * 3600 * 1000;
const OLVIDO_404_MS = 7 * DIA_MS;
const ESPERA_MS = 200; // 5 peticiones por segundo como mucho
// «Suelen salir sin caducar»: la parte de las subastas que sale sin caducar (ritmo) llega a esto. Hasta T1b era 0,40,
// pensado para la tasa vieja, que contaba como vendidas la mitad de las caducadas. Ver RITMO_BARATOS en ia.mjs. F5: en
// las mercancías, ritmo y vendidosDia ya no cuentan las cancelaciones de encima del más barato intacto (historial.mjs):
// estos dos grupos se filtran con esos números, los mismos que enseña el tooltip. F9p: las mercancías ya no se ordenan por
// ellos (pueden estar inflados por cancelaciones), sino por unidades a la venta (ver grupos).
export const RITMO_RAPIDO = 0.25;
const TOP_VENDIDOS = 100;
const FRACCION_BARATO = 0.8;
const vacio = () => ({ version: VERSION, objetos: {}, no: {} });
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/**
 * `cliente.objeto(id)` devuelve la ficha ({id, nombre, calidad, clase, subclase, icono?, precioVendedor}) o null si
 * la API dice 404. `fs`, `carpeta` (la carpeta `comercio`), `dormir(ms)` y `ahora()` (milisegundos) se inyectan.
 * `opciones` (reintentador, mover, dormir) se pasan a la escritura atómica.
 */
export function crearCatalogo({ cliente, fs, carpeta, dormir, ahora = Date.now, opciones = {} }) {
    const ruta = join(carpeta, 'objetos.json');
    let est = null;
    function cargar() {
        est = vacio();
        try {
            const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
            if (j && j.version === VERSION && j.objetos && j.no)
                est = { ...vacio(), ...j };
        }
        catch (e) {
            if (e.code !== 'ENOENT') {
                // Archivo roto: se aparta (nunca se borra) y se empieza de cero.
                try {
                    fs.renameSync(ruta, `${ruta}.roto-${Date.now()}`);
                }
                catch {
                    // si ni así se puede, se sobrescribirá al guardar
                }
            }
        }
        return est;
    }
    const estado = () => est || cargar();
    async function guardar() {
        fs.mkdirSync(carpeta, { recursive: true });
        await escribirAtomico(fs, ruta, JSON.stringify(estado()), { dormir, ...opciones });
    }
    const ficha = (id) => estado().objetos[String(id)] || null;
    /**
     * Pide a la API las fichas que faltan (sin repetir ids ni 404 de menos de 7 días), con 200 ms entre peticiones.
     * Hace como mucho `maxPorRonda` peticiones; devuelve cuántas hizo y cuántas quedan para otra ronda.
     * Si la API falla, lo recibido hasta entonces se guarda y el error se relanza.
     */
    async function completar(ids, { maxPorRonda = 200 } = {}) {
        const e = estado();
        const ahoraMs = ahora();
        const faltan = [];
        const vistos = new Set();
        for (const id of ids) {
            const k = String(id);
            if (vistos.has(k))
                continue;
            vistos.add(k);
            if (e.objetos[k])
                continue;
            if (e.no[k] !== undefined && ahoraMs - e.no[k] < OLVIDO_404_MS)
                continue;
            faltan.push(id);
        }
        const ronda = faltan.slice(0, Math.max(0, maxPorRonda));
        let pedidos = 0;
        let cambios = false;
        try {
            for (const id of ronda) {
                if (pedidos > 0)
                    await dormir(ESPERA_MS);
                pedidos++;
                const f = await cliente.objeto(id);
                if (f) {
                    e.objetos[String(id)] = f;
                    delete e.no[String(id)];
                }
                else {
                    e.no[String(id)] = ahora();
                }
                cambios = true;
            }
        }
        finally {
            if (cambios)
                await guardar();
        }
        return { pedidos, pendientes: faltan.length - ronda.length };
    }
    /**
     * Grupos de objetos. `resumenes` es el Map de `historial.todos(casa)`.
     * Con una sola lengua disponible (es_MX) el nombre `en` repite el de `es`.
     */
    function grupos(resumenes) {
        const salida = [];
        const porClase = new Map();
        for (const f of Object.values(estado().objetos)) {
            if (!f.clase)
                continue;
            const nombre = f.subclase ? `${f.clase} › ${f.subclase}` : f.clase;
            if (!porClase.has(nombre))
                porClase.set(nombre, []);
            porClase.get(nombre).push(Number(f.id));
        }
        for (const nombre of [...porClase.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
            salida.push({
                clave: `auto:${nombre}`,
                nombre: { es: nombre, en: nombre },
                objetos: porClase.get(nombre).sort((a, b) => a - b),
                tipo: 'auto',
            });
        }
        const filas = [...resumenes].filter(([, r]) => r);
        const porVentas = (a, b) => num(b[1].vendidosDia) - num(a[1].vendidosDia) || a[0] - b[0];
        // F9p: el número de una mercancía puede estar inflado por cancelaciones, así que no decide su orden. Quién entra no
        // cambia. Primero los objetos sueltos, en su orden de siempre; detrás las mercancías, por unidades a la venta (un dato
        // que sí es de verdad) y con el id como desempate.
        const enOrden = (lista) => [
            ...lista.filter(([, r]) => r.mercancia !== true),
            ...lista.filter(([, r]) => r.mercancia === true).sort((a, b) => num(b[1].cantidad) - num(a[1].cantidad) || a[0] - b[0]),
        ].map(([id]) => id);
        salida.push({
            clave: 'rapido',
            // T1b: no se sabe si lo que sale de la subasta se vendió o lo retiró su dueño; solo que no caducó. Los nombres
            // dicen eso (antes «Se vende rápido» y «Los más vendidos»). Las claves no cambian: el addon las guarda.
            nombre: { es: 'Suelen salir sin caducar', en: 'Usually leave before expiring' },
            objetos: enOrden(filas.filter(([, r]) => r.ritmo != null && r.ritmo >= RITMO_RAPIDO).sort(porVentas)),
            tipo: 'calculado',
        });
        salida.push({
            clave: 'vendidos',
            nombre: { es: 'Los que más salen sin caducar', en: 'Most leaving before expiring' },
            objetos: enOrden(filas.filter(([, r]) => num(r.vendidosDia) > 0).sort(porVentas).slice(0, TOP_VENDIDOS)),
            tipo: 'calculado',
        });
        salida.push({
            clave: 'barato',
            nombre: { es: 'Más barato de lo normal', en: 'Cheaper than usual' },
            objetos: filas
                .filter(([, r]) => !r.poco && r.enVenta !== false && r.normal > 0 && r.precio > 0 && r.precio <= r.normal * FRACCION_BARATO)
                .map(([id]) => id),
            tipo: 'calculado',
        });
        return salida;
    }
    return { completar, ficha, grupos, guardar };
}
