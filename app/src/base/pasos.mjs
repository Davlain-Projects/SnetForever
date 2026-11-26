// Pasos de una misión para las guías que construye la app (rutas de zona de la IA, tarea 16b): recoger, completar y
// entregar, generados solo con lo que dice la base.
//
// Origen: copia adaptada de la lógica de pasos de la fase 3 (tools/conversor/src/generar/pasos.js,
// `pasosDeMision` y `ensamblarGuia`), código propio del mismo repositorio. La app se reparte sola a los amigos y no puede
// importar nada de tools/, por eso está copiada. Diferencias con el conversor:
//   - los puntos salen de base/puntos.mjs (punto representativo y mapa preferido del Ruling F4-15), no de la vista del
//     conversor: un `goto` es siempre un punto de la base, nunca uno inventado;
//   - no hay filtro de clase ni de raza en los pasos: la ruta se construye para un personaje concreto y, si el juego
//     dice que una misión es suya (registro), manda el juego aunque la máscara de raza diga otra cosa;
//   - no hay migas (`turnin siFalta`) ni pasos «dentro» de mazmorra: las rutas de zona no los usan;
//   - la que empieza con un ítem va a la fuente del ítem (puntos.mjs, fuenteDeItem); el conversor solo la acepta;
//   - el crédito de muerte (objectives[5]) no da punto (puntos.mjs no lo trae), solo su `complete`.
// Lo que no tiene punto en la base va sin `goto` y con `sinVerificar = "punto"`, como en el conversor.
// R19 (en el juego, «Elixir de agonía» de Laderas de Trabalomas: el paso de los ojos no avanzaba nunca porque llevaba
// también el `complete` de una poción que allí no se consigue): un objetivo de objeto sin sitio en la base va en su
// propio paso (parte «conseguir», ver objetivosSinSitio), no en el del sitio.
import { createHash } from 'node:crypto';
import { elemento, entradas } from './leer-lua.mjs';
import { puntosDeMision, fuenteDeItem, puntoRepresentativo } from './puntos.mjs';
// Puntos distintos como mucho en un paso de completar (uno por objetivo con punto; las repeticiones no cuentan).
export const MAX_GOTO_COMPLETAR = 6;
// Los valores de una tabla de la base (array u objeto con claves 1…n), en orden.
export const lista = (v) => entradas(v).map(([, x]) => x);
const hay = (v) => entradas(v).length > 0;
const goto = ({ mapa, x, y }) => ({ t: 'goto', mapa, x, y, modo: 'flecha' });
// Clave de un punto o goto ({mapa, x, y}); '-' sin punto.
export const claveGoto = (g) => (g ? `${g.mapa}|${g.x}|${g.y}` : '-');
// Identificador estable de un paso: los 8 primeros caracteres hexadecimales del sha1 de la clave de la guía, el filtro
// del paso y su contenido (la fórmula de tools/conversor/src/salida/id.js).
export const idDePaso = (clave, filtro, contenido) => createHash('sha1')
    .update(`${clave}\n${JSON.stringify(filtro)}\n${contenido}`, 'utf8').digest('hex').slice(0, 8);
// Número de objetivos del registro: las entradas de los grupos de `objectives`. La reputación (grupo 4) es un solo
// objetivo: en QuestieDB es un par [facción, valor], no una lista de entradas.
export function contarObjetivos(m) {
    let n = 0;
    for (const g of [1, 2, 3, 4, 5, 6]) {
        const grupo = elemento(m.objectives, g);
        if (g === 4)
            n += hay(grupo) ? 1 : 0;
        else
            n += entradas(grupo).length;
    }
    return n;
}
// Hay objetivos que podrían tener punto: PNJ, objetos, ítems, crédito de muerte o exploración.
const tieneFuentes = (m) => [1, 2, 3, 5].some((g) => hay(elemento(m.objectives, g))) || hay(m.triggerEnd);
// Ids de PNJ y objetos de startedBy/finishedBy, como firma de «quién» (para agrupar pasos del mismo PNJ).
export function quienDe(relacion) {
    const pnj = lista(elemento(relacion, 1)).filter((id) => typeof id === 'number').sort((a, b) => a - b);
    const obj = lista(elemento(relacion, 2)).filter((id) => typeof id === 'number').sort((a, b) => a - b);
    return `${pnj.join(',')}|${obj.join(',')}`;
}
// R19: textos del paso de un objeto sin sitio. La base no sabe qué se fabrica con un oficio: sin vendedor, «subasta»,
// salvo los objetos de misión (class 12), que no se pueden subastar: esos, sin fuente.
const TEXTOS_CONSEGUIR = {
    es: { conseguir: 'Consigue', vendedor: 'vendedor', subasta: 'subasta' },
    en: { conseguir: 'Get', vendedor: 'vendor', subasta: 'auction house' },
};
const CLASE_MISION = 12; // class de los objetos de misión (QuestieDB)
// Un nombre de la base para un texto del juego: sin controles y con `|` duplicado (la barra es el escape del chat).
const textoDeJuego = (t) => String(t).replace(/[\x00-\x1f\x7f]/g, '').replace(/\|/g, '||');
// «Consigue <objeto> (<fuente>)» en el idioma; sin fuente, sin paréntesis.
function notaConseguir(base, id, idioma, fuente) {
    const t = TEXTOS_CONSEGUIR[idioma];
    return `${t.conseguir} ${textoDeJuego(base.nombre('item', id, idioma))}${fuente ? ` (${t[fuente]})` : ''}`;
}
// El punto de un vendedor del ítem que no sea solo de la otra facción, con spawns en la base: el primero en `mapa` y, si
// no hay, el primero en otro mapa. {mapa, x, y} o null. El segundo valor dice si hay algún vendedor de su facción.
function vendedorDe(base, item, pj, mapa) {
    const otra = pj?.faccion === 'Horde' ? 'A' : pj?.faccion === 'Alliance' ? 'H' : null;
    let primero = null;
    let hayVendedor = false;
    for (const id of lista(item.vendors)) {
        const npc = typeof id === 'number' ? base.npc(id, pj) : undefined;
        if (!npc || (otra !== null && npc.friendlyToFaction === otra))
            continue;
        hayVendedor = true;
        const p = puntoRepresentativo(npc.spawns, mapa);
        if (!p)
            continue;
        const punto = { mapa: p.mapa, x: p.x, y: p.y };
        if (p.mapa === mapa)
            return { punto, hayVendedor };
        primero ??= punto;
    }
    return { punto: primero, hayVendedor };
}
/**
 * R19: los objetivos de objeto (grupo 3 de `objectives`) de la misión q que no tienen sitio en la base: ningún PNJ que
 * lo suelte con spawns (o con la entrada de su mazmorra) ni ningún objeto del mundo que lo dé; es decir, los que
 * puntosDeMision no puede situar (solo vendedor, oficio o nada). Un ítem que no está en la base no cuenta (no se sabe
 * nada de él y se queda como estaba). Ese objetivo no va en el paso del sitio, que no avanzaría nunca: va en su propio
 * paso, con su `complete` (avanza solo al conseguirlo) y una `nota` «Consigue <objeto> (vendedor | subasta)» (un
 * objeto de misión sin vendedor va sin paréntesis: no se puede subastar); con un vendedor de su facción con spawns,
 * también un `goto` a él. La base no trae cuántos pide, así que la nota no lo dice.
 * Lo usan pasosDeMision (rutas de zona) y guiasDeRuta de rutaIA.mjs (la ruta de la IA).
 * @param {{mapa?: number, puntos?: Array}} [opciones] mapa: el uiMap preferido; puntos: los de
 *   puntosDeMision(…, {conObjetivo: true}) si ya se tienen
 * @returns {Array<{objetivo: number, item: number, punto: {mapa, x, y} | null, elementos: Array}>} en el orden del registro
 */
export function objetivosSinSitio(base, q, pj, { mapa, puntos } = {}) {
    const m = base.mision(q, pj);
    if (!m)
        return [];
    const items = entradas(elemento(m.objectives, 3));
    if (items.length === 0)
        return [];
    const conSitio = new Set((puntos ?? puntosDeMision(base, q, pj, 'en', mapa, { conObjetivo: true }))
        .filter((p) => p.papel === 'objetivo' && p.objetivo !== undefined).map((p) => p.objetivo));
    // Índice del primer objetivo de ítem en el registro: detrás de los de PNJ (grupo 1) y los de objeto (grupo 2).
    const inicio = entradas(elemento(m.objectives, 1)).length + entradas(elemento(m.objectives, 2)).length + 1;
    const salida = [];
    for (const [i, e] of items) {
        const id = elemento(e, 1);
        const k = inicio + i - 1;
        const item = typeof id === 'number' ? base.item(id, pj) : undefined;
        if (!item || conSitio.has(k))
            continue;
        const { punto, hayVendedor } = vendedorDe(base, item, pj, mapa);
        const fuente = hayVendedor ? 'vendedor' : item.class === CLASE_MISION ? null : 'subasta';
        const texto = { es: notaConseguir(base, id, 'es', fuente), en: notaConseguir(base, id, 'en', fuente) };
        salida.push({
            objetivo: k,
            item: id,
            punto,
            elementos: [
                ...(punto ? [{ ...goto(punto), objetivo: k }] : []),
                { t: 'complete', q, objetivo: k },
                { t: 'nota', texto },
            ],
        });
    }
    return salida;
}
/**
 * Partes de la misión `q`: recoger, completar (si hay objetivos o triggerEnd que se hacen en algún sitio), una
 * «conseguir» por cada objetivo de objeto sin sitio (R19, objetivosSinSitio; lleva `objetivo` = k) y entregar.
 * @param {object} base Base de base.mjs
 * @param {number} q id de la misión
 * @param {object} pj {faccion, clase} para las correcciones por facción
 * @param {{previas?: {una?: number[], todas?: number[]}, mapa?: number}} [opciones]
 *   previas: `isQuestTurnedIn` delante de cada parte (una = basta una de la lista; todas = una condición por misión);
 *   mapa: el uiMap preferido para los puntos (el de la ruta).
 * @returns {Array<{parte, elementos, etiquetas, requisitos, sinVerificar?, punto?, puntos?, quien?, condiciones}>}
 *   `punto` (recoger, entregar) y `puntos` (completar) son los puntos de la base del paso; `quien` es la firma del PNJ u
 *   objeto; `condiciones` es la firma de las previas. Esos campos no son del contrato: ensamblarGuia no los copia.
 */
export function pasosDeMision(base, q, pj, { previas = {}, mapa } = {}) {
    const m = base.mision(q, pj);
    if (!m)
        throw new Error(`la misión ${q} no está en la base`);
    const condiciones = [
        ...(previas.una?.length ? [{ t: 'isQuestTurnedIn', qs: [...previas.una] }] : []),
        ...(previas.todas ?? []).map((p) => ({ t: 'isQuestTurnedIn', qs: [p] })),
    ];
    const firmaCondiciones = JSON.stringify(condiciones);
    const conCondiciones = (elementos) => [...condiciones.map((c) => ({ ...c, qs: [...c.qs] })), ...elementos];
    const puntos = puntosDeMision(base, q, pj, 'en', mapa, { conObjetivo: true });
    const deRecoger = puntos.find((p) => p.papel === 'recoger');
    const deEntregar = puntos.find((p) => p.papel === 'entregar');
    const deObjetivos = puntos.filter((p) => p.papel === 'objetivo');
    // Recoger: si la da un ítem, se va a donde se consigue (los PNJ que lo sueltan o los objetos que lo dan, Ruling
    // F4-29); sin ninguna fuente con puntos, solo el accept y `sinFuente` (la ruta de zona la deja fuera). Si no, se va a
    // quien la da.
    let recoger;
    if (hay(elemento(m.startedBy, 3))) {
        const fuente = lista(elemento(m.startedBy, 3)).map((item) => fuenteDeItem(base, item, pj, mapa)).find(Boolean);
        recoger = fuente
            ? { parte: 'recoger', elementos: [goto(fuente), { t: 'accept', q }], punto: fuente, deItem: true }
            : { parte: 'recoger', elementos: [{ t: 'accept', q }], deItem: true, sinFuente: true };
    }
    else if (deRecoger) {
        recoger = { parte: 'recoger', elementos: [goto(deRecoger), { t: 'accept', q }], punto: deRecoger };
    }
    else {
        recoger = { parte: 'recoger', elementos: [{ t: 'accept', q }], sinVerificar: 'punto' };
    }
    recoger.quien = quienDe(m.startedBy);
    const partes = [recoger];
    // R19: los objetivos de objeto sin sitio van aparte, cada uno en su parte «conseguir» (detrás de completar).
    const sinSitio = objetivosSinSitio(base, q, pj, { mapa, puntos });
    const aparte = new Set(sinSitio.map((s) => s.objetivo));
    if (contarObjetivos(m) > 0 || hay(m.triggerEnd)) {
        // Cada goto lleva el objetivo al que pertenece; el tope cuenta puntos distintos.
        const elementos = [];
        const distintos = new Set();
        const vistos = new Set();
        const usados = [];
        for (const p of deObjetivos) {
            const g = goto(p);
            const clave = `${claveGoto(g)}|${p.objetivo}`;
            if (vistos.has(clave) || (!distintos.has(claveGoto(g)) && distintos.size >= MAX_GOTO_COMPLETAR))
                continue;
            vistos.add(clave);
            distintos.add(claveGoto(g));
            usados.push(p);
            elementos.push(p.objetivo === undefined ? g : { ...g, objetivo: p.objetivo });
        }
        // Solo exploración: el objetivo 1 del registro de misiones.
        const n = Math.max(contarObjetivos(m), hay(m.triggerEnd) ? 1 : 0);
        for (let k = 1; k <= n; k++)
            if (!aparte.has(k))
                elementos.push({ t: 'complete', q, objetivo: k });
        if (elementos.length > 0) {
            const completar = { parte: 'completar', elementos, puntos: usados };
            if (tieneFuentes(m) && distintos.size === 0)
                completar.sinVerificar = 'punto';
            partes.push(completar);
        }
    }
    for (const s of sinSitio) {
        partes.push({ parte: 'conseguir', elementos: s.elementos, objetivo: s.objetivo, ...(s.punto ? { punto: s.punto } : {}) });
    }
    const entregar = deEntregar
        ? { parte: 'entregar', elementos: [goto(deEntregar), { t: 'turnin', q }], punto: deEntregar }
        : { parte: 'entregar', elementos: [{ t: 'turnin', q }], sinVerificar: 'punto' };
    entregar.quien = quienDe(m.finishedBy);
    partes.push(entregar);
    return partes.map((p) => ({
        ...p,
        etiquetas: {},
        requisitos: [],
        elementos: conCondiciones(p.elementos),
        condiciones: firmaCondiciones,
    }));
}
/**
 * Pone n (1…), id estable (con -2, -3… si se repite), linea = 0 y deja solo los campos del contrato.
 * @param {{clave: string}} campos campos de la guía (todo lo que no son los pasos)
 * @param {Array} pasos partes de pasosDeMision (o pasos unidos con la misma forma)
 */
export function ensamblarGuia(campos, pasos) {
    const vistos = new Map();
    const pasosSal = pasos.map((p, i) => {
        const base = idDePaso(campos.clave, true, JSON.stringify([p.parte, p.elementos]));
        const veces = (vistos.get(base) ?? 0) + 1;
        vistos.set(base, veces);
        return {
            id: veces === 1 ? base : `${base}-${veces}`,
            n: i + 1,
            etiquetas: p.etiquetas ?? {},
            elementos: p.elementos,
            requisitos: p.requisitos ?? [],
            linea: 0,
            ...(p.sinVerificar ? { sinVerificar: p.sinVerificar } : {}),
        };
    });
    return { ...campos, pasos: pasosSal };
}
