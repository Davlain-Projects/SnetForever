// La guía de la biblioteca que se abre TAL CUAL en el juego: la herramienta `abrir_guia` de TATI (tati/acciones.mjs) y el
// campo `abrirGuia` del bloque `snet` del chat del juego (respuesta.mjs) piden lo mismo, {guia, desde?, hasta?}, y el
// núcleo (nucleo.mjs, armar) lo expande aquí, con UNA sola conversión para las dos entradas. La IA solo elige la guía y
// desde dónde: los pasos, sus textos, sus misiones y sus puntos salen de la guía, nunca de lo que escriba la IA.
//
//   pedidoValido(v) -> {guia, desde?, hasta?} | null
//     guia: el id del índice (8 hexadecimales en minúscula, el de buscar_guias / leer_guia); desde y hasta: números de paso
//     (enteros ≥ 1) con la MISMA numeración que leer_guia. Nada más: otro campo, o uno que no vale, da null.
//
//   expandirGuia(pedido, {lector, base, pj, idioma, mapaJugador, existe?, cuantasGuias, ceder?}) -> Promise de
//        {error: 'guia_desconocida'}
//      | {guiaNueva: {titulo, tramos, quitados} | null, cuenta: {total, hasta, siguiente?, deOtraClase, sinMision},
//         continuar: {guia, desde, hasta?} | null, pedidoSiguiente: {guia, desde, hasta?}, hechas: [q]}
//   lector        el de crearLectorGuias (herramientas/fuentes.mjs), el mismo de leer_guia (guías partidas ya juntadas)
//   base, pj      la base de misiones y el personaje del turno ({faccion, raza, clase, nivel})
//   existe        (q) -> ¿vale la misión? El núcleo: en la base o en alguna guía de la biblioteca, la misma regla que la
//                 guiaNueva de la IA (comprobarGuiaNueva). Sin ella, solo la base.
//   cuantasGuias  (guía con la forma de guiaNuevaValida, {hechas}) -> cuántas guías del addon salen de ella (el núcleo: la
//                 misma comprobación y guiasDeRuta que la guiaNueva de la IA, con `hechas` como registro)
//   ceder         () -> Promise: entre medida y medida se cede el turno (por omisión, setImmediate)
// Reglas:
//   - los pasos, los de leer_guia (pasosDeGuiaLeida de herramientas/catalogo.mjs): las mismas marcas, las mismas limpiezas
//     (sin coordenadas en el texto) y sin los pasos de otra clase o raza que la del personaje (deOtraClase los cuenta).
//     Si todo lo leído (MAX_PASOS_LEIDOS) es de otra clase, se sigue leyendo hasta dar con sus pasos o con el final;
//   - cada paso pasa a la forma de un paso de guiaNueva: su texto, sus misiones que valen ({q, accion, objetivo?}) y su
//     punto: la marca G:… del paso o, si no trae sitio, la B:… de recoger o entregar que da leer_guia;
//   - decisión del coordinador (ronda 2): valen las mismas misiones que en crear_ruta (la base o alguna guía de la
//     biblioteca). Una que no está en ninguna de las dos (inventada) se quita, pero el paso se queda con su texto y su
//     punto (sinMision cuenta esos pasos);
//   - `hechas`: las misiones de los pasos de esta guía de ANTES de `desde`. El núcleo las da por hechas o en curso al
//     comprobar (ni se meten delante como previas ni hacen quitar una misión cuya previa es de un tramo de antes);
//   - tramos: cada uno es UNA guía del addon (400 pasos, 60 misiones, 40 KB: lo mide cuantasGuias); un trozo que no se
//     puede medir no cabe (un paso solo siempre va). Van como mucho 8, y juntos tampoco pasan de 8 guías del addon (si
//     no, se quitan tramos del final). Lo que no cabe no va en esta vez: `hasta` dice hasta qué paso llega (numeración
//     de leer_guia), `siguiente` el `desde` con el que seguir y `continuar` el pedido que lo trae (el núcleo lo guarda
//     con los tramos pendientes: el «sigue» del jugador tras el último tramo lo abre sin preguntar a la IA).
//   - sin ningún paso: guiaNueva null (el núcleo dice «sin_pasos» y no publica nada).
import { pasosDeGuiaLeida } from './herramientas/catalogo.mjs';
import { guiaNuevaValida } from './respuesta.mjs';
import { MAX_PASOS } from './rutaZona.mjs';
import { cortar } from './texto.mjs';
export const MAX_TRAMOS = 8; // como guiaNueva y crear_ruta
export const MAX_TITULO = 60; // el de guiaNueva
// Más pasos de la guía que estos no caben nunca en una vez (8 guías de 400): se leen de tantos en tantos.
export const MAX_PASOS_LEIDOS = MAX_TRAMOS * MAX_PASOS;
const MAX_OBJETIVO = 20;
const ID_GUIA = /^[0-9a-f]{8}$/;
const ACCIONES = new Set(['aceptar', 'completar', 'entregar']);
const CAMPOS = new Set(['guia', 'desde', 'hasta']);
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const numeroDePaso = (v) => Number.isInteger(v) && v >= 1;
export function pedidoValido(v) {
    if (!esObjeto(v) || !Object.keys(v).every((k) => CAMPOS.has(k)))
        return null;
    if (typeof v.guia !== 'string' || !ID_GUIA.test(v.guia))
        return null;
    if ((v.desde !== undefined && !numeroDePaso(v.desde)) || (v.hasta !== undefined && !numeroDePaso(v.hasta)))
        return null;
    return { guia: v.guia, ...(v.desde !== undefined ? { desde: v.desde } : {}), ...(v.hasta !== undefined ? { hasta: v.hasta } : {}) };
}
// Un paso de leer_guia con la forma de un paso de guiaNueva. -> {paso, sinMision}
function pasoDeGuiaNueva(p, vale) {
    const misiones = [];
    let fuera = false;
    for (const m of Array.isArray(p.misiones) ? p.misiones : []) {
        if (!Number.isInteger(m?.q) || m.q < 1 || !ACCIONES.has(m.accion))
            continue;
        if (!vale(m.q)) {
            fuera = true;
            continue;
        }
        const objetivo = Number.isInteger(m.objetivo) && m.objetivo >= 1 && m.objetivo <= MAX_OBJETIVO ? m.objetivo : undefined;
        misiones.push(objetivo === undefined ? { q: m.q, accion: m.accion } : { q: m.q, accion: m.accion, objetivo });
    }
    const punto = p.punto?.marca ?? p.marcas?.[0]?.marca;
    const paso = {
        ...(typeof p.texto === 'string' && p.texto !== '' ? { texto: p.texto } : {}),
        ...(misiones.length > 0 ? { misiones } : {}),
        ...(typeof punto === 'string' ? { punto } : {}),
    };
    return { paso, sinMision: fuera && (paso.punto !== undefined || paso.texto !== undefined) };
}
// Cede el turno al resto de la app entre medida y medida (M4: una guía larga no la bloquea de un tirón).
const cederTurno = () => new Promise((listo) => setImmediate(listo));
// Los tramos: cada uno, el trozo más largo de lo que queda que da UNA guía del addon (un paso solo siempre entra), y como
// mucho MAX_TRAMOS. M4: el corte se busca desde el largo del tramo anterior (galope hacia arriba o hacia abajo y, en el
// último hueco, búsqueda binaria), que suele estar cerca. -> {tramos: [[item]], usados} (usados: cuántos de items van)
async function partir(items, cabe, ceder) {
    const tramos = [];
    let i = 0;
    let previo = MAX_PASOS;
    const mide = async (largo) => {
        await ceder();
        return cabe(items.slice(i, i + largo));
    };
    while (i < items.length && tramos.length < MAX_TRAMOS) {
        const queda = Math.min(MAX_PASOS, items.length - i);
        const prueba = Math.min(previo, queda);
        let bajo; // el más largo que se sabe que cabe
        let alto; // el más largo que aún puede caber
        if (prueba <= 1 || (await mide(prueba))) {
            bajo = Math.max(1, prueba);
            alto = queda;
            for (let salto = 1; bajo < alto; salto *= 2) {
                const t = Math.min(alto, bajo + salto);
                if (await mide(t))
                    bajo = t;
                else {
                    alto = t - 1;
                    break;
                }
            }
        }
        else {
            bajo = 1;
            alto = prueba - 1;
            for (let salto = 1; alto > 1; salto *= 2) {
                const t = Math.max(1, alto - salto + 1);
                if (t === 1 || (await mide(t))) {
                    bajo = t;
                    break;
                }
                alto = t - 1;
            }
        }
        while (bajo < alto) {
            const medio = Math.ceil((bajo + alto) / 2);
            if (await mide(medio))
                bajo = medio;
            else
                alto = medio - 1;
        }
        tramos.push(items.slice(i, i + bajo));
        i += bajo;
        previo = bajo;
    }
    return { tramos, usados: i };
}
export async function expandirGuia(pedido, { lector, base = null, pj = {}, idioma = 'es', mapaJugador, existe = null, cuantasGuias, ceder = cederTurno, } = {}) {
    const p = pedidoValido(pedido);
    let g = null;
    try {
        g = p ? lector?.guia(p.guia) ?? null : null;
    }
    catch {
        g = null;
    }
    if (!g || !Array.isArray(g.pasos))
        return { error: 'guia_desconocida' };
    const total = g.pasos.length;
    const desde = p.desde ?? 1;
    // Como leer_guia: un `hasta` antes de `desde` no cuenta.
    const hastaPedido = p.hasta !== undefined && p.hasta >= desde ? p.hasta : total;
    const hastaFinal = Math.min(total, hastaPedido);
    // M5: de MAX_PASOS_LEIDOS en MAX_PASOS_LEIDOS, hasta que salga algún paso del personaje (o se acabe).
    let pasos = [];
    const deOtraClase = [];
    let hastaLeido = desde - 1;
    while (pasos.length === 0 && hastaLeido < hastaFinal) {
        const fin = Math.min(hastaFinal, hastaLeido + MAX_PASOS_LEIDOS);
        const r = pasosDeGuiaLeida(g, { desde: hastaLeido + 1, hasta: fin, base, idioma, pj, mapaJugador });
        pasos = r.pasos;
        deOtraClase.push(...r.deOtraClase);
        hastaLeido = fin;
    }
    // I3: las misiones de los pasos de esta guía de antes de `desde`: hechas o en curso.
    const hechas = [...new Set(g.pasos.slice(0, desde - 1).flatMap((x) => (Array.isArray(x?.misiones) ? x.misiones : []))
            .map((m) => m?.q).filter((q) => Number.isInteger(q) && q >= 1))];
    const vale = (q) => {
        try {
            return typeof existe === 'function' ? Boolean(existe(q)) : Boolean(base?.mision(q, pj));
        }
        catch {
            return false;
        }
    };
    const items = pasos.map((x) => ({ n: x.n, ...pasoDeGuiaNueva(x, vale) }));
    const titulo = cortar(String(g.nombre ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim(), MAX_TITULO).trim() || 'Guía';
    const conTramos = (lista) => ({ titulo, tramos: lista.map((t) => ({ titulo, pasos: t.map((x) => x.paso) })) });
    // Cuántas guías del addon salen de esos tramos, o null si no se pudo medir. Sin ningún paso válido, ninguna.
    const medir = (lista) => {
        const v = guiaNuevaValida(conTramos(lista), titulo);
        if (!v)
            return 0;
        try {
            const n = cuantasGuias(v, { hechas });
            return Number.isInteger(n) && n >= 0 ? n : null;
        }
        catch {
            return null;
        }
    };
    // M3: un trozo que no se pudo medir no cabe.
    const cabe = (trozo) => {
        const n = medir([trozo]);
        return n !== null && n <= 1;
    };
    const partido = await partir(items, cabe, ceder);
    const { tramos } = partido;
    let { usados } = partido;
    // M3: juntos (las previas y los objetos sin sitio pueden pasar de un tramo a otro) tampoco más de MAX_TRAMOS guías: se
    // quitan tramos del final hasta que caben. Si no se puede medir, valen los tramos medidos uno a uno.
    for (let n = medir(tramos); tramos.length > 1 && n !== null && n > MAX_TRAMOS; n = medir(tramos)) {
        usados -= tramos.pop().length;
        await ceder();
    }
    // Hasta dónde llega esta vez (numeración de leer_guia) y desde dónde seguir.
    let siguiente = null;
    if (usados < items.length)
        siguiente = items[usados].n;
    else if (hastaLeido < hastaFinal)
        siguiente = hastaLeido + 1;
    const hasta = siguiente !== null ? siguiente - 1 : hastaFinal;
    const cuenta = {
        total,
        hasta,
        ...(siguiente !== null ? { siguiente } : {}),
        deOtraClase: deOtraClase.filter((n) => n <= hasta).length,
        sinMision: items.slice(0, usados).filter((x) => x.sinMision).length,
    };
    const conHasta = p.hasta !== undefined && p.hasta >= desde ? { hasta: p.hasta } : {};
    const continuar = siguiente !== null ? { guia: g.id, desde: siguiente, ...conHasta } : null;
    // El pedido con el que se sigue (el de continuar o, si cabe entera, el del paso de después de hasta): el núcleo lo
    // guarda con los tramos pendientes para reconocerlo (I1).
    const pedidoSiguiente = { guia: g.id, desde: siguiente ?? hasta + 1, ...conHasta };
    const guiaNueva = tramos.length > 0 ? guiaNuevaValida(conTramos(tramos), titulo) : null;
    return { guiaNueva, cuenta, continuar, pedidoSiguiente, hechas };
}
