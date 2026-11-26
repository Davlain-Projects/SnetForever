// Datos del turno: mezcla el mensaje del addon (P2) con la base de misiones y saca lo que se le pasa a la IA (P5).
//
// La IA nunca escribe coordenadas: los puntos salen de la base con un id P# y la tabla de `datos.puntos` no lleva
// x, y ni mapa; esas coordenadas solo viven en el `Map` que devuelve `prepararTurno`, para traducir después el bloque
// `snet` de la respuesta.
//
// Manda el juego sobre la base (QuestieDB Forever tiene máscaras de raza incompletas): lo que el addon manda en el
// registro cuenta siempre, aunque la base diga que la misión es de otra raza o facción. Aquí no se filtra nada por
// máscara. Los nombres de los personajes no salen nunca en `datos` (`mensaje.pj` no se copia).
import { elemento, entradas } from './base/leer-lua.mjs';
import { puntosDeMision } from './base/puntos.mjs';
import { eventoDeMision, mazmorraDeMision } from './rutaZona.mjs';
import { cortar } from './texto.mjs';
import { cargarPlan, planPara, cargarProfesiones, planProfesiones } from './subida.mjs';
import { construirComercio, enVivoDe } from './comercio/ia.mjs';
import { hablaDeGuias, bloqueMisGuias, recortarMisGuias, esContinuacion, claveMisGuias, quitarPuntosDeGuias } from './misguias.mjs';
export const MAX_DATOS = 30000; // caracteres del JSON de `datos`
const MAX_OBJETOS_TIPO = 200;
// F1 (ronda 1): de dónde puede salir el precio de subasta de un objeto (pf).
const FUENTES_PRECIO = new Set(['lista', 'app', 'escaneo']);
// 14-nov: los tipos de objeto de comercio (clase 7 de Classic) que el jugador puede nombrar para pedir un grupo.
// Cada uno lleva su subclase y las palabras (sin tildes, en minúsculas) con que se nombra en cada idioma.
const TIPOS_OBJETO = [
    { tipo: 'hierbas', subclase: 9, es: /\b(?:hierbas?|herboristeria)\b/, en: /\b(?:herbs?|herbalism)\b/ },
    { tipo: 'metal', subclase: 7, es: /\b(?:minerales?|metal(?:es)?|menas?)\b/, en: /\b(?:ores?|metals?)\b/ },
    { tipo: 'telas', subclase: 5, es: /\b(?:telas?|panos?)\b/, en: /\b(?:cloths?)\b/ },
    { tipo: 'cuero', subclase: 6, es: /\b(?:cueros?|pieles|piel)\b/, en: /\b(?:leathers?|hides?)\b/ },
    { tipo: 'elementales', subclase: 10, es: /\b(?:elementales?)\b/, en: /\b(?:elementals?)\b/ },
    { tipo: 'carne', subclase: 8, es: /\b(?:carnes?|cocina)\b/, en: /\b(?:meats?|cooking)\b/ },
    { tipo: 'encantamiento', subclase: 12, es: /\b(?:encantamientos?|encantar)\b/, en: /\b(?:enchanting)\b/ },
];
// Los tipos de objeto de comercio que nombra el texto del jugador: [{tipo, subclase}], en el orden de TIPOS_OBJETO.
export function tiposDelMensaje(texto, idioma = 'es') {
    if (typeof texto !== 'string')
        return [];
    const limpio = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const clave = idioma === 'en' ? 'en' : 'es';
    return TIPOS_OBJETO.filter((t) => t[clave].test(limpio)).map(({ tipo, subclase }) => ({ tipo, subclase }));
}
const MAX_PUNTOS_REGISTRO = 40;
const MAX_MENCIONADAS = 10;
const MAX_ZONAS_NIVEL = 6;
const MAX_VUELOS = 40;
const ES_MAZMORRA = /^(?:Dentro de|Inside) /;
// skillLine de las profesiones que manda el addon (Contexto.PROFESIONES).
const PROFESIONES = {
    es: { 171: 'Alquimia', 164: 'Herrería', 185: 'Cocina', 333: 'Encantamiento', 202: 'Ingeniería', 129: 'Primeros auxilios', 356: 'Pesca', 182: 'Herboristería', 165: 'Peletería', 186: 'Minería', 393: 'Desuello', 197: 'Sastrería' },
    en: { 171: 'Alchemy', 164: 'Blacksmithing', 185: 'Cooking', 333: 'Enchanting', 202: 'Engineering', 129: 'First Aid', 356: 'Fishing', 182: 'Herbalism', 165: 'Leatherworking', 186: 'Mining', 393: 'Skinning', 197: 'Tailoring' },
};
// Objetos de clase 7 (Comerciar): subClass -> profesión (la clave de `usos` va siempre en español).
const MATERIAL = { 5: 'Sastrería', 6: 'Peletería', 7: 'Herrería/Ingeniería', 9: 'Alquimia', 8: 'Cocina', 10: 'Encantamiento', 12: 'Encantamiento' };
// Objetos de clase 0 (Consumible): subClass -> tipo. El frasco (3) cuenta como elixir.
const CONSUMIBLE = { 1: 'pocion', 2: 'elixir', 3: 'elixir', 4: 'pergamino', 5: 'comida', 7: 'venda' };
const CLASE_COMERCIAR = 7;
const CLASE_CONSUMIBLE = 0;
// Lista blanca (nombres exactos de ia/contexto.lua): lo que no esté aquí no pasa, sea del tipo que sea.
const CAMPOS_PERSONAJE = ['nivel', 'clase', 'raza', 'faccion', 'sexo', 'xp', 'xpMax', 'dinero'];
const CAMPOS_LUGAR = ['mapa', 'zona', 'subzona', 'x', 'y', 'instancia'];
const MAX_TEXTO_RECORTE = 40;
const MAX_RECORTES = 20;
const MAX_TEXTO_CAMPO = 100;
const MAX_TITULO_REGISTRO = 100; // caracteres del título de una misión que manda el addon (lote E2)
function soloPermitidos(origen, permitidos) {
    const salida = {};
    if (!origen || typeof origen !== 'object')
        return salida;
    for (const campo of permitidos) {
        const v = origen[campo];
        if (typeof v === 'string')
            salida[campo] = cortar(v, MAX_TEXTO_CAMPO);
        else if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))
            salida[campo] = v;
    }
    return salida;
}
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const lista = (v) => entradas(v).map(([, x]) => x);
// Los textos (cadenas) de una tabla de la base, sin huecos.
const textos = (t) => lista(t).filter((x) => typeof x === 'string' && x !== '');
// 13-nov: los talentos que manda el addon, con topes (4 árboles de 30 talentos) y solo los campos conocidos.
function talentosDe(t) {
    if (!t || typeof t !== 'object' || !Array.isArray(t.arboles))
        return null;
    const arboles = t.arboles.slice(0, 4).filter((a) => a && typeof a === 'object').map((a) => ({
        arbol: cortar(String(a.a ?? ''), 40),
        puntos: esNumero(a.p) ? Math.floor(a.p) : 0,
        talentos: lista(a.t).slice(0, 30).filter((x) => x && esNumero(x.r)).map((x) => {
            const s = { rango: Math.floor(x.r) };
            if (typeof x.n === 'string')
                s.nombre = cortar(x.n, 40);
            if (esNumero(x.m))
                s.max = Math.floor(x.m);
            if (esNumero(x.f))
                s.fila = Math.floor(x.f);
            if (esNumero(x.c))
                s.columna = Math.floor(x.c);
            return s;
        }),
    }));
    if (arboles.length === 0)
        return null;
    const salida = { arboles };
    if (esNumero(t.libres))
        salida.sinGastar = Math.floor(t.libres);
    return salida;
}
// 17-nov (TATI decía «no puedo ver tus talentos»): ¿habla el texto de talentos? «talento», «build», «árbol», «spec» (y en
// inglés). Con una pregunta así, el recorte de la app no quita los talentos (ocupan poco: unos 450 bytes con 23 puntos).
const PALABRAS_TALENTOS = /(?:^|[^a-z0-9])(?:talent(?:o|os|s)?|builds?|arbol(?:es)?|trees?|specs?)(?![a-z0-9])/;
export function hablaDeTalentos(texto) {
    if (typeof texto !== 'string')
        return false;
    return PALABRAS_TALENTOS.test(texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
}
// `extra.misionApi`: lo que la API de Blizzard sabe de una misión que no está en la base (la busca nucleo.mjs antes,
// porque la búsqueda es asíncrona y esta función no).
// `extra.comercio` (tarea 15): la fuente de los datos de comercio de la app, {historial, catalogo, casa, otrasCasas}
// (historial.todos(casa) y catalogo.ficha(id), comercio/historial.mjs y comercio/objetos.mjs); la da nucleo.mjs. Con ella
// (o con la subasta abierta, ctx.comercio) va `datos.comercio` (comercio/ia.mjs).
// `extra.misGuias` (15-nov): las guías propias del jugador (la lista de leerMisGuias, misguias.mjs) o una función que la
// da (se pide en cada turno para buscar en ella los nombres que dice el mensaje; leerMisGuias la guarda en memoria). Si el
// mensaje habla de guías o nombra alguna, con alguna elegida, nombrada o de su nivel y de su facción va `datos.misGuias`.
export function prepararTurno(base, mensaje, plan = cargarPlan(), extra = {}) {
    const ctx = mensaje.ctx ?? {};
    const idioma = mensaje.idioma === 'en' ? 'en' : 'es';
    const texto = typeof mensaje.texto === 'string' ? mensaje.texto : '';
    const pjCtx = ctx.pj ?? {};
    // El personaje para las correcciones por facción y clase de la base (la clase va en mayúsculas, como en las claves).
    const pjBase = { faccion: pjCtx.faccion, clase: typeof pjCtx.clase === 'string' ? pjCtx.clase.toUpperCase() : undefined };
    const mapaJugador = esNumero(ctx.lugar?.mapa) ? ctx.lugar.mapa : undefined;
    // Lote E2: el nombre de una misión es el título que da el cliente en el registro del jugador (ya viene en su idioma; en
    // Forever hay misiones propias sin nombre «es» en la base); si no lo trae, el «es» de la base y, si no, el «en».
    const titulosRegistro = new Map();
    for (const r of lista(ctx.registro)) {
        if (!r || !esNumero(r.q) || typeof r.t !== 'string')
            continue;
        const t = r.t.replace(/[\x00-\x1f\x7f]/g, '').trim();
        if (t !== '' && t.length <= MAX_TITULO_REGISTRO)
            titulosRegistro.set(r.q, t);
    }
    const nombreMision = (q) => titulosRegistro.get(q) ?? base.nombre('quest', q, idioma);
    // Los nombres por los que se puede conocer la misión q (el del registro y los de la base en los dos idiomas), o null si
    // q no está en el registro ni en la base: respuesta.mjs los usa para quitar los ids que la IA escriba detrás.
    const nombresMision = (q) => {
        if (!esNumero(q))
            return null;
        const enBase = elemento(base.datos.quest, q);
        if (!titulosRegistro.has(q) && !enBase)
            return null;
        const nombres = [titulosRegistro.get(q), elemento(base.datos.es?.quest, q)?.name, enBase?.name]
            .filter((n) => typeof n === 'string' && n.trim() !== '');
        return { registro: titulosRegistro.get(q), nombres: [...new Set(nombres)] };
    };
    // Las de fiesta o evento de temporada llevan `evento` con el nombre del evento (la misma regla que las deja fuera de
    // las rutas de zona, rutaZona.mjs: el `evento` de los datos y, si no lo traen, el QuestSort): la IA no las propone
    // fuera de temporada (sistema.md). Las demás no llevan el campo.
    // 11-nov: y las de mazmorra o banda llevan `mazmorra` con su nombre (el mismo criterio que las deja fuera de las rutas
    // de zona): si el jugador pide una ruta sin mazmorras, la IA no las propone (sistema.md).
    const conEvento = (salida, q) => {
        const m = base.mision(q, pjBase);
        const evento = eventoDeMision(m);
        if (evento !== null)
            salida.evento = evento;
        const mazmorra = mazmorraDeMision(base, q, m);
        if (mazmorra !== null)
            salida.mazmorra = mazmorra;
        return salida;
    };
    const misionConNombre = (q) => conEvento({ q, nombre: nombreMision(q) }, q);
    // ---------------------------------------------------------------------------------------------------------------
    // Puntos P#: un id por (misión, papel, objetivo, sitio), en el orden en que se piden.
    // ---------------------------------------------------------------------------------------------------------------
    const puntos = new Map(); // id -> punto completo (con mapa, x, y)
    const idsPorClave = new Map();
    const tabla = []; // lo que ve la IA
    function registrarPunto(p) {
        const clave = `${p.q}|${p.papel}|${p.obj ?? ''}|${p.mapa}|${p.x}|${p.y}`;
        const ya = idsPorClave.get(clave);
        if (ya)
            return ya;
        const id = `P${puntos.size + 1}`;
        idsPorClave.set(clave, id);
        // El papel es el real (R7 lo necesita); un punto dentro de una mazmorra («Dentro de …») lleva además mazmorra: true.
        const completo = { id, papel: p.papel, mision: p.q !== undefined ? nombreMision(p.q) : null, q: p.q, donde: p.donde ?? null };
        if (ES_MAZMORRA.test(p.donde ?? ''))
            completo.mazmorra = true;
        if (p.obj !== undefined)
            completo.obj = p.obj;
        completo.texto = p.texto;
        // Lote F: el índice del objetivo en el registro y los PNJ del sitio van solo al Map (la propuesta para el addon); la IA
        // no los ve.
        const paraAddon = { ...completo, mapa: p.mapa, x: p.x, y: p.y };
        if (p.objetivo !== undefined)
            paraAddon.objetivo = p.objetivo;
        if (p.npcs !== undefined)
            paraAddon.npcs = p.npcs;
        // Dibujos de la IA: los sitios de un objetivo (la zona de matar), solo en el Map, para el círculo.
        if (p.sitios !== undefined)
            paraAddon.sitios = p.sitios;
        puntos.set(id, paraAddon);
        tabla.push(completo);
        return id;
    }
    // Lote F: los textos de los puntos (las etiquetas de las paradas) llevan el nombre de la misión del turno.
    const puntosDe = (q) => puntosDeMision(base, q, pjBase, idioma, mapaJugador, { conObjetivo: true, conPnj: true, conSitios: true, nombreMision: nombreMision(q) });
    // ---------------------------------------------------------------------------------------------------------------
    // Registro, ruta, mazmorras, cadenas, profesiones y guías
    // ---------------------------------------------------------------------------------------------------------------
    const estadoDe = new Map(); // q -> 'lista_para_entregar' | 'en_curso'
    const registro = lista(ctx.registro).filter((r) => r && esNumero(r.q)).map((r) => {
        const lista_ = r.c === 1;
        estadoDe.set(r.q, lista_ ? 'lista_para_entregar' : 'en_curso');
        const salida = conEvento({ q: r.q, nombre: nombreMision(r.q), listaParaEntregar: lista_ }, r.q);
        // 13-nov (en el juego: la IA decía que los nombres de la guía de internet no coincidían con el registro): las guías
        // están en inglés; el nombre en inglés de la base va al lado si es otro.
        const enIngles = elemento(base.datos.quest, r.q)?.name;
        if (typeof enIngles === 'string' && enIngles.trim() !== '' && enIngles !== salida.nombre)
            salida.nombreEn = enIngles;
        salida.objetivos = lista(r.o).map((o) => ({ hecho: elemento(o, 1) ?? o?.hecho ?? 0, pedido: elemento(o, 2) ?? o?.pedido ?? 0 }));
        const descripcion = textos(idioma === 'es' ? elemento(base.datos.es?.quest, r.q)?.objectivesText : undefined);
        const propias = descripcion.length > 0 ? descripcion : textos(base.mision(r.q, pjBase)?.objectivesText);
        if (propias.length > 0)
            salida.textos = propias;
        return salida;
    });
    const idsRegistro = registro.map((r) => r.q);
    // 17-nov: las listas para entregar (rutaIA.mjs no les mete los pasos de objetivo: ya están hechos).
    const idsListas = registro.filter((r) => r.listaParaEntregar).map((r) => r.q);
    let ruta = null;
    const idsRuta = [];
    if (ctx.guia && typeof ctx.guia === 'object') {
        const g = ctx.guia;
        ruta = {};
        for (const campo of ['clave', 'titulo'])
            if (typeof g[campo] === 'string')
                ruta[campo] = cortar(g[campo], 200);
        if (esNumero(g.n))
            ruta.n = g.n;
        if (typeof g.paso === 'string')
            ruta.paso = cortar(g.paso, 200);
        // T3 (B5): la guía acabada (el addon manda `fin = true`, sin paso ni n) y, de una guía de la IA, en qué parte va y
        // cuántas puede traer aún «sigue» (`extra.tramo`, lo calcula nucleo.mjs con los tramos pendientes).
        if (g.fin === true)
            ruta.fin = true;
        const tr = extra?.tramo;
        if (tr && Number.isInteger(tr.i) && Number.isInteger(tr.n) && Number.isInteger(tr.pendientes)
            && tr.i >= 1 && tr.i <= tr.n && tr.pendientes >= 0)
            ruta.tramo = { i: tr.i, n: tr.n, pendientes: tr.pendientes };
        // T3: la guía que dejó a medias y a la que puede volver con «Volver a» del addon ({titulo, n?}).
        const v = g.volverA;
        if (v && typeof v === 'object' && typeof v.titulo === 'string')
            ruta.volverA = { titulo: cortar(v.titulo, 200), ...(esNumero(v.n) ? { n: v.n } : {}) };
        ruta.misiones = lista(g.misiones).filter(esNumero).map((q) => {
            idsRuta.push(q);
            const sitios = puntosDe(q);
            const sitio = (papel) => {
                const p = sitios.find((s) => s.papel === papel);
                return p ? { donde: p.donde ?? null, texto: p.texto } : null;
            };
            return conEvento({ q, nombre: nombreMision(q), recoger: sitio('recoger'), entregar: sitio('entregar') }, q);
        });
    }
    const mazmorras = lista(ctx.mazmorras).filter((z) => z && typeof z === 'object').map((z) => ({
        area: z.area,
        nombre: z.nombre || base.mazmorra(z.area)?.nombre || `#${z.area}`,
        // Ya van agrupadas por mazmorra: sin el campo `mazmorra` de cada una (sería repetir el nombre).
        misiones: lista(z.misiones).filter(esNumero).map((q) => {
            const salida = misionConNombre(q);
            delete salida.mazmorra;
            return salida;
        }),
    }));
    const cadenas = lista(ctx.cadenas).filter((c) => c && typeof c === 'object').map((c) => {
        const salida = { id: c.id, texto: c.texto };
        if (c.guia)
            salida.guia = c.guia;
        salida.misiones = lista(c.misiones).filter(esNumero).map(misionConNombre);
        return salida;
    });
    const profesiones = lista(ctx.prof).filter((p) => p && esNumero(p.id)).map((p) => ({
        id: p.id, nombre: PROFESIONES[idioma][p.id] ?? `#${p.id}`, rango: p.r, maximo: p.m,
    }));
    // 11-nov: las zonas de su continente con más misiones de su nivel (el recuento del addon, motor/continente.lua: sin
    // mazmorras, ni entregadas ni en el registro). La IA elige de aquí la zona de `rutaZona` cuando el jugador pide una ruta
    // para subir de nivel sin decir zona (sistema.md).
    const zonasNivel = lista(ctx.zonas).filter((z) => z && Number.isInteger(z.mapa) && z.mapa > 0 && Number.isInteger(z.n) && z.n > 0)
        .slice(0, MAX_ZONAS_NIVEL)
        .map((z) => ({ mapa: z.mapa, zona: base.zona(z.mapa, idioma) ?? `#${z.mapa}`, misiones: z.n }));
    // 11-nov: los vuelos que tiene aprendidos (nombres de los nodos, apuntados por el addon al abrir un mapa de vuelos).
    // Sin ellos no va el campo: la IA no sabe qué vuelos tiene (sistema.md).
    const vuelos = lista(ctx.vuelos).filter((v) => typeof v === 'string' && v.trim() !== '')
        .slice(0, MAX_VUELOS).map((v) => cortar(v.replace(/[\x00-\x1f\x7f]/g, '').trim(), MAX_TEXTO_CAMPO));
    const guiasLista = lista(ctx.guias).filter((g) => g && typeof g.clave === 'string').map((g) => ({ clave: g.clave, titulo: g.titulo }));
    const guias = new Map(guiasLista.map((g) => [g.clave, g.titulo]));
    // ---------------------------------------------------------------------------------------------------------------
    // Inventario con los usos de cada objeto
    // ---------------------------------------------------------------------------------------------------------------
    const pedidasPorMision = new Set([...idsRegistro, ...idsRuta]);
    function usosDe(o) {
        const usos = [];
        for (const q of base.misionesQuePiden(o.id))
            if (pedidasPorMision.has(q))
                usos.push(`mision:${q}`);
        const item = base.item(o.id, pjBase);
        // Lote B (B2): los datos no escriben los campos que valen 0; un ítem de la base sin class es de clase 0.
        const clase = item ? (item.class ?? 0) : undefined;
        const subclase = item ? (item.subClass ?? 0) : undefined;
        if (clase === CLASE_COMERCIAR && MATERIAL[subclase])
            usos.push(`material:${MATERIAL[subclase]}`);
        if (clase === CLASE_CONSUMIBLE && CONSUMIBLE[subclase])
            usos.push(`consumible:${CONSUMIBLE[subclase]}`);
        if (esNumero(item?.startQuest) && item.startQuest > 0)
            usos.push(`empieza:${item.startQuest}`);
        if (o.ca === 0)
            usos.push('gris');
        return usos;
    }
    // Un objeto de bolsa o banco sin sus huecos (`b`: la IA marca por id, no por hueco).
    function objeto(o) {
        const salida = { id: o.id, nombre: base.nombre('item', o.id, idioma), n: o.n };
        // 13-nov: las guías de profesiones nombran los materiales en inglés: el nombre en inglés va al lado si es otro.
        const enIngles = base.nombre('item', o.id, 'en');
        if (typeof enIngles === 'string' && enIngles !== '' && enIngles !== salida.nombre)
            salida.nombreEn = enIngles;
        for (const campo of ['ca', 'pv', 'nv', 'h', 'l'])
            if (o[campo] !== undefined)
                salida[campo] = o[campo];
        // 13-nov: precio de subasta (de SnetForever, cobre) y días desde que se vio. F1 (ronda 1): de qué foto sale (pf: «lista»,
        // la lista de la subasta de ahora; «app», la foto de la app; «escaneo», una foto del servidor de cuándo no se sabe;
        // nada si viene de otro sitio) y su edad en segundos (pe; con el escaneo, desde que se leyó). El escaneo no lleva pd.
        if (esNumero(o.pa) && o.pa > 0)
            salida.pa = Math.floor(o.pa);
        if (esNumero(o.pd) && o.pd >= 0)
            salida.pd = Math.floor(o.pd);
        if (FUENTES_PRECIO.has(o.pf))
            salida.pf = o.pf;
        if (esNumero(o.pe) && o.pe >= 0)
            salida.pe = Math.floor(o.pe);
        salida.usos = usosDe(o);
        return salida;
    }
    const objetos = (v) => lista(v).filter((o) => o && esNumero(o.id)).map(objeto);
    let inventario = 'no_permitido';
    if (ctx.inv && typeof ctx.inv === 'object') {
        const inv = ctx.inv;
        // El addon manda `bolsas` como lista de objetos con libres/huecos al lado; también se acepta {libres, huecos, objetos}.
        const bolsas = Array.isArray(inv.bolsas) || inv.bolsas?.objetos === undefined ? inv.bolsas : inv.bolsas.objetos;
        inventario = {
            libres: inv.libres ?? inv.bolsas?.libres,
            huecos: inv.huecos ?? inv.bolsas?.huecos,
            // F2b: los huecos de la bolsa de componentes (solo admiten componentes), aparte; solo si el addon los manda.
            ...(esNumero(inv.huecosComponentes) ? { huecosComponentes: inv.huecosComponentes } : {}),
            ...(esNumero(inv.libresComponentes) ? { libresComponentes: inv.libresComponentes } : {}),
            dinero: inv.dinero,
            objetos: objetos(bolsas),
            equipo: lista(inv.equipo).filter((e) => e && esNumero(e.id)).map((e) => {
                const salida = { s: e.s, id: e.id, nombre: base.nombre('item', e.id, idioma) };
                for (const campo of ['nv', 'ca', 'st', 'tt'])
                    if (e[campo] !== undefined)
                        salida[campo] = e[campo];
                return salida;
            }),
        };
        if (inv.banco && typeof inv.banco === 'object')
            inventario.banco = { fecha: inv.banco.fecha, objetos: objetos(inv.banco.objetos) };
    }
    // ---------------------------------------------------------------------------------------------------------------
    // Misiones mencionadas y puntos
    // ---------------------------------------------------------------------------------------------------------------
    const qMencionadas = [];
    for (const q of [...lista(mensaje.refs?.q), ...base.buscarMisiones(texto, idioma).map((m) => m.q)]) {
        if (esNumero(q) && !qMencionadas.includes(q) && qMencionadas.length < MAX_MENCIONADAS)
            qMencionadas.push(q);
    }
    const mencionadas = qMencionadas.map((q) => {
        const m = base.mision(q, pjBase);
        const salida = conEvento({ q, nombre: nombreMision(q) }, q);
        if (estadoDe.has(q))
            salida.estado = estadoDe.get(q);
        if (m) {
            // Lote B (B2): un nivel que no está en los datos valía 0 (ya no se escribe).
            if (esNumero(m.questLevel ?? 0))
                salida.nivel = m.questLevel ?? 0;
            if (esNumero(m.requiredLevel ?? 0))
                salida.nivelMinimo = m.requiredLevel ?? 0;
            const descripcion = textos(idioma === 'es' ? elemento(base.datos.es?.quest, q)?.objectivesText : undefined);
            const propias = descripcion.length > 0 ? descripcion : textos(m.objectivesText);
            if (propias.length > 0)
                salida.textos = propias;
            const previas = lista(m.preQuestSingle).filter(esNumero);
            if (previas.length > 0)
                salida.previas = previas.map(misionConNombre);
            if (esNumero(m.nextQuestInChain) && m.nextQuestInChain > 0)
                salida.siguiente = misionConNombre(m.nextQuestInChain);
        }
        salida.puntos = puntosDe(q).map(registrarPunto);
        return salida;
    });
    // Lote C (revisión 52, Minor 10, y ronda 1): los puntos de las misiones del registro en el mapa del jugador van
    // siempre, use la pregunta las palabras que use y haya menciones o no. Los de lo mencionado ya van primero y el tope
    // de 40 protege la tabla.
    // 12-nov (en el juego: «creame una ruta de lo que tengo que entregar» y la IA no tenía los puntos de entrega de otras
    // zonas): el sitio de entrega de cada misión del registro lista para entregar va siempre, esté en el mapa que esté.
    for (const r of registro) {
        if (tabla.length >= MAX_PUNTOS_REGISTRO)
            break;
        if (r?.listaParaEntregar !== true || !esNumero(r.q))
            continue;
        const entrega = puntosDe(r.q).find((p) => p.papel === 'entregar');
        if (entrega)
            registrarPunto(entrega);
    }
    if (mapaJugador !== undefined) {
        externo: for (const q of idsRegistro) {
            for (const p of puntosDe(q)) {
                if (tabla.length >= MAX_PUNTOS_REGISTRO)
                    break externo;
                if (p.mapa === mapaJugador)
                    registrarPunto(p);
            }
        }
    }
    // ---------------------------------------------------------------------------------------------------------------
    // Datos y recortes
    // ---------------------------------------------------------------------------------------------------------------
    const datos = {
        personaje: soloPermitidos(pjCtx, CAMPOS_PERSONAJE),
        lugar: soloPermitidos(ctx.lugar, CAMPOS_LUGAR),
        registro,
        ruta,
        mazmorras,
        cadenas,
        profesiones,
        guias: guiasLista,
        zonasNivel,
        inventario,
        mencionadas,
        puntos: tabla,
        recorte: lista(ctx.recorte).filter((r) => typeof r === 'string' && r.length <= MAX_TEXTO_RECORTE).slice(0, MAX_RECORTES),
    };
    if (ctx.registroIncompleto === true)
        datos.registroIncompleto = true;
    if (vuelos.length > 0)
        datos.vuelos = vuelos;
    // 13-nov: el plan de subida documentado (subida.mjs) para su facción, raza, clase y nivel: su tramo y los que vienen.
    const planSubida = planPara(plan, pjCtx, ctx.lugar, base);
    if (planSubida)
        datos.planSubida = planSubida;
    // 13-nov: las guías de las profesiones que tiene (qué fabricar ahora, con qué y dónde aprender el rango siguiente).
    const planProf = planProfesiones(cargarProfesiones(), lista(ctx.prof));
    if (planProf.length > 0)
        datos.planProfesiones = planProf;
    // 13-nov: sus talentos (árboles con los puntos y los talentos con algún punto) y los puntos sin gastar.
    const talentos = talentosDe(ctx.talentos);
    if (talentos)
        datos.talentos = talentos;
    // 17-nov: el addon no pudo leer sus talentos (ninguna de las dos API de su cliente): la IA lo sabe (sistema.md) y
    // nucleo.mjs lo apunta en registro.log.
    const talentosFalta = !talentos && ctx.talentosFalta === true;
    if (talentosFalta)
        datos.talentosFalta = true;
    const pideTalentos = hablaDeTalentos(texto);
    // T2 (C): con un mensaje de guías, rutas o misiones (también «misión» o «quest» sueltas), registro.objetivos se queda.
    const pideObjetivos = hablaDeGuias(texto) || /(?:^|[^a-z0-9])(?:mision|quest)(?![a-z0-9])/.test(texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    // 13-nov: con precios de subasta, los objetos llevan precio de subasta (pa, en cobre; pd, días) y aquí, cuánto hace que
    // abrió la casa de subastas (segundos).
    if (ctx.subasta && typeof ctx.subasta === 'object' && typeof ctx.subasta.fuente === 'string') {
        datos.subasta = { fuente: cortar(ctx.subasta.fuente, 30) };
        if (esNumero(ctx.subasta.vista))
            datos.subasta.vistaHaceSegundos = Math.floor(ctx.subasta.vista);
    }
    // 13-nov: una misión que no está en la base, confirmada con la API de Blizzard (existe, zona y recompensas; sin sitio ni objetivos).
    const api = extra?.misionApi;
    if (api && api.fuente === 'api_blizzard' && Array.isArray(api.resultados))
        datos.misionApi = api;
    // 15-nov (en el juego: «revisa mis guías y créame una guía acorde a mi level» y la IA no las veía): las guías propias
    // del jugador que tocan su nivel y su facción, con sus pasos resumidos (misguias.mjs). Solo si el mensaje habla de
    // guías; si el archivo no está o no se puede leer, no hay bloque.
    // 15-nov (en el juego: «como llego a dalaran para hacer la masmorra» no llevó ninguna guía): también si habla de rutas,
    // mazmorras, misiones o leveleo, o si nombra una guía propia o una zona de sus pasos (hablaDeGuias con la lista). La guía
    // elegida en el addon (ctx.guia, si es una de «Mis guías») y las nombradas van primero, con sus pasos.
    // En el juego (2.ª ronda): la guía elegida era la del propio addon («Mazmorras SnetForever (H)\28-33 City of Dalaran») y
    // las preguntas siguientes («y después de ver a magus que sigue…») perdían la guía. Ahora:
    //   * `extra.guiaAddon(clave)` da la guía del addon (Misiones o Rutas) que el jugador tiene elegida, y entra con sus pasos;
    //   * `extra.recientes`: las claves de las guías que entraron con pasos en los últimos turnos de este personaje
    //     (nucleo.mjs); vuelven si el mensaje habla de guías o sigue con lo anterior (esContinuacion);
    //   * los sitios de los pasos de esas guías (y de las nombradas) van a la tabla de puntos con su P#.
    const recientes = Array.isArray(extra?.recientes) ? extra.recientes.filter((c) => typeof c === 'string') : [];
    const delAddon = (clave) => {
        if (typeof clave !== 'string' || clave.startsWith('Mis guías\\'))
            return null;
        try {
            const g = elemento(base.datos.guias, clave) ?? (typeof extra?.guiaAddon === 'function' ? extra.guiaAddon(clave) : null);
            return g && typeof g === 'object' ? g : null;
        }
        catch {
            return null;
        }
    };
    if (extra?.misGuias != null || extra?.guiaAddon != null || ruta?.clave || recientes.length > 0) {
        try {
            const fuente = extra?.misGuias;
            const listaGuias = (typeof fuente === 'function' ? fuente() : fuente) ?? [];
            const pide = hablaDeGuias(texto, { lista: Array.isArray(listaGuias) ? listaGuias : [], base, pj: pjCtx })
                || (recientes.length > 0 && esContinuacion(texto));
            // Revisión: la guía del addon (leer Rutas cuesta) solo se busca si el mensaje habla de guías.
            const guiaAddon = pide ? delAddon(ruta?.clave) : null;
            const bloque = pide ? bloqueMisGuias(Array.isArray(listaGuias) ? listaGuias : [], {
                base, pj: pjCtx, pjBase, idioma, claves: guias, texto, elegida: ruta?.clave, guiaAddon,
                recientes, recientesAddon: recientes.map(delAddon).filter(Boolean),
                mision: (q) => {
                    const salida = misionConNombre(q);
                    if (estadoDe.has(q))
                        salida.estado = estadoDe.get(q);
                    return salida;
                },
                punto: (p) => registrarPunto({ q: p.q, papel: p.papel, mapa: p.mapa, x: p.x, y: p.y, donde: base.zona(p.mapa, idioma) ?? null, texto: p.texto }),
            }) : null;
            if (bloque)
                datos.misGuias = bloque;
        }
        catch {
            // las guías no se pudieron leer: el turno sigue sin ellas
        }
    }
    // Tarea 15: el comercio. Los ids del inventario se toman antes de los recortes (todo lo que lleva en las bolsas).
    // existeObjeto (con el que se validan los ids de un grupo que propone la IA) acepta los del catálogo de la app Y los
    // que el juego manda en este turno (bolsas, banco, oportunidades de la subasta y los de datos.comercio): son ids de
    // objetos reales aunque el catálogo aún no los tenga (decisión del coordinador en la revisión de la tarea 15).
    const enVivo = enVivoDe(ctx.comercio);
    const fuenteComercio = extra?.comercio && typeof extra.comercio === 'object' ? extra.comercio : null;
    const idsDelJuego = new Set();
    const idsInventario = typeof inventario === 'object' ? inventario.objetos.map((o) => o.id) : [];
    for (const id of idsInventario)
        idsDelJuego.add(id);
    if (typeof inventario === 'object')
        for (const o of inventario.banco?.objetos ?? [])
            idsDelJuego.add(o.id);
    if (fuenteComercio || enVivo) {
        try {
            const comercio = construirComercio({
                historial: fuenteComercio?.historial,
                catalogo: fuenteComercio?.catalogo,
                casa: fuenteComercio?.casa ?? enVivo?.casa ?? null,
                bando: fuenteComercio?.bando ?? null, // F7: de qué subasta son los precios
                otrasCasas: fuenteComercio?.otrasCasas ?? [],
                bandos: fuenteComercio?.bandos ?? {},
                inventarioIds: idsInventario,
                mencionadas: lista(mensaje.refs?.i).filter(esNumero),
                enVivo,
                texto,
            });
            if (comercio)
                datos.comercio = comercio;
        }
        catch {
            // la fuente de comercio no se pudo leer: el turno sigue sin datos de comercio
        }
    }
    for (const o of datos.comercio?.objetos ?? [])
        idsDelJuego.add(o.id);
    for (const o of enVivo?.oportunidades ?? [])
        idsDelJuego.add(o.id);
    // 14-nov: un grupo por tipo de objeto aunque no haya precios: los objetos de la base de ese tipo (clase 7 y su subclase),
    // con el nombre en el idioma del jugador (hasta MAX_OBJETOS_TIPO por tipo).
    const tipos = tiposDelMensaje(texto, idioma);
    if (tipos.length > 0) {
        const porTipo = tipos.map(({ tipo, subclase }) => ({ tipo, subclase, objetos: [] }));
        for (const [id, o] of entradas(base.datos.item)) {
            if (!esNumero(id) || o?.class !== 7)
                continue;
            const destino = porTipo.find((t) => t.subclase === o.subClass);
            if (destino && destino.objetos.length < MAX_OBJETOS_TIPO)
                destino.objetos.push({ id, nombre: base.nombre('item', id, idioma) });
        }
        datos.objetosDeTipo = porTipo.map(({ tipo, objetos }) => ({ tipo, objetos: objetos.sort((x, y) => x.id - y.id) }));
    }
    const catalogo = fuenteComercio?.catalogo;
    const existeObjeto = (id) => {
        if (idsDelJuego.has(id))
            return true;
        if (esNumero(id) && base.item(id) != null)
            return true; // cualquier objeto de la base, tenga o no precios
        try {
            return typeof catalogo?.ficha === 'function' && catalogo.ficha(id) != null;
        }
        catch {
            return false;
        }
    };
    const grupoAbierto = enVivo?.grupo ?? null;
    const recorteApp = [];
    // Con lo que ocupará `recorteApp` al final (antes se medía sin él y los datos podían pasarse del tope por unas letras).
    const tamano = () => JSON.stringify(datos).length + (recorteApp.length > 0 ? JSON.stringify(recorteApp).length + ',"recorteApp":'.length : 0);
    // Cada recorte dice si quitó algo.
    const pasos = [
        ['inventario.banco', () => {
                if (typeof inventario !== 'object' || !('banco' in inventario))
                    return false;
                delete inventario.banco;
                return true;
            }],
        ['inventario.equipo.detalle', () => {
                if (typeof inventario !== 'object')
                    return false;
                let quitado = false;
                for (const e of inventario.equipo) {
                    if ('st' in e || 'tt' in e) {
                        delete e.st;
                        delete e.tt;
                        quitado = true;
                    }
                }
                return quitado;
            }],
        ['mazmorras', () => {
                if (!('mazmorras' in datos))
                    return false;
                delete datos.mazmorras;
                return true;
            }],
        // Los objetos por tipo (14-nov), detrás de mazmorras: la mitad de cada lista mientras queden más de 20, y después entero.
        ['objetosDeTipo', () => {
                if (!datos.objetosDeTipo)
                    return false;
                if (datos.objetosDeTipo.some((t) => t.objetos.length > 20)) {
                    for (const t of datos.objetosDeTipo)
                        t.objetos.length = Math.floor(t.objetos.length / 2);
                    return 'repetir';
                }
                delete datos.objetosDeTipo;
                return true;
            }],
        // Tarea 15: el comercio, detrás de mazmorras: primero la mitad de sus objetos (se van los del final: los baratos)
        // mientras queden más de 10, y después entero.
        ['comercio', () => {
                if (!datos.comercio)
                    return false;
                if (datos.comercio.objetos.length > 10) {
                    datos.comercio.objetos.length = Math.floor(datos.comercio.objetos.length / 2);
                    return 'repetir';
                }
                delete datos.comercio;
                return true;
            }],
        ['planSubida.siguientes', () => {
                if (!datos.planSubida || datos.planSubida.siguientes.length === 0)
                    return false;
                datos.planSubida.siguientes = [];
                return true;
            }],
        // 15-nov: las guías propias (solo vienen si el jugador pregunta por guías): menos pasos y menos guías hasta que quepa,
        // sin bajar de una guía con 10 pasos (entera, al final de todo, en «misGuias.todo»). Antes que los objetos de las bolsas.
        // 15-nov: la elegida y las nombradas (`por`) no se tocan aquí: se recortan después de los objetos de las bolsas.
        ['misGuias', () => (datos.misGuias && recortarMisGuias(datos.misGuias, 10, { conservar: true }) ? 'repetir' : false)],
        // Objetos de las bolsas: primero los grises y los que no tienen usos, del final al principio; después los demás.
        ['inventario.objetos', () => {
                if (typeof inventario !== 'object' || inventario.objetos.length === 0)
                    return false;
                const prescindible = (o) => o.usos.length === 0 || o.usos.includes('gris');
                const orden = [
                    ...inventario.objetos.filter(prescindible).reverse(),
                    ...inventario.objetos.filter((o) => !prescindible(o)).reverse(),
                ];
                const quitar = new Set(orden.slice(0, Math.max(1, Math.floor(orden.length / 10))));
                inventario.objetos = inventario.objetos.filter((o) => !quitar.has(o));
                return 'repetir';
            }],
        // T2 (C, 17-nov): lo hecho y lo pedido de cada misión, detrás de los objetos de las bolsas (antes iba delante) y nunca
        // si el mensaje habla de guías, rutas o misiones (los pasos que siguen bastan para que quepa).
        ['registro.objetivos', () => {
                if (pideObjetivos)
                    return false;
                let quitado = false;
                for (const r of datos.registro)
                    if ('objetivos' in r) {
                        delete r.objetivos;
                        quitado = true;
                    }
                return quitado;
            }],
        ['misGuias', () => (datos.misGuias && recortarMisGuias(datos.misGuias, 10) ? 'repetir' : false)],
        // Garantía final: topes y, si hace falta, mitades de cada lista hasta que quepa (lo que queda es de tamaño acotado).
        ['planSubida', () => {
                if (!datos.planSubida)
                    return false;
                delete datos.planSubida;
                return true;
            }],
        ['planProfesiones', () => {
                if (!datos.planProfesiones)
                    return false;
                delete datos.planProfesiones;
                return true;
            }],
        // 17-nov: con una pregunta de talentos, se quedan (los pasos que siguen bastan para que quepa).
        ['talentos', () => {
                if (!datos.talentos || pideTalentos)
                    return false;
                delete datos.talentos;
                return true;
            }],
        ['misionApi', () => {
                if (!datos.misionApi)
                    return false;
                delete datos.misionApi;
                return true;
            }],
        ['misGuias.todo', () => {
                if (!datos.misGuias)
                    return false;
                delete datos.misGuias;
                return true;
            }],
        ['topes', () => {
                let quitado = false;
                const tope = (lista_, max) => { if (lista_.length > max) {
                    lista_.length = max;
                    quitado = true;
                } };
                tope(datos.registro, 40);
                for (const r of datos.registro) {
                    if ('textos' in r) {
                        delete r.textos;
                        quitado = true;
                    }
                }
                tope(datos.mencionadas, 5);
                for (const m of datos.mencionadas) {
                    for (const c of ['textos', 'previas', 'siguiente'])
                        if (c in m) {
                            delete m[c];
                            quitado = true;
                        }
                    tope(m.puntos, 10);
                }
                tope(datos.cadenas, 8);
                tope(datos.puntos, MAX_PUNTOS_REGISTRO);
                tope(datos.guias, 8);
                return quitado;
            }],
        ['mitades', () => {
                const listas = [datos.puntos, datos.mencionadas, datos.cadenas, datos.registro, datos.guias, datos.profesiones, datos.ruta?.misiones,
                    typeof inventario === 'object' ? inventario.equipo : undefined, typeof inventario === 'object' ? inventario.objetos : undefined]
                    .filter((l_) => Array.isArray(l_) && l_.length > 0);
                if (listas.length === 0)
                    return false;
                for (const l_ of listas)
                    l_.length = Math.floor(l_.length / 2);
                return 'repetir';
            }],
    ];
    for (const [nombre, paso] of pasos) {
        if (tamano() <= MAX_DATOS)
            break;
        let r;
        do {
            r = paso();
            if (r && !recorteApp.includes(nombre))
                recorteApp.push(nombre);
        } while (r === 'repetir' && tamano() > MAX_DATOS);
    }
    if (recorteApp.length > 0)
        datos.recorteApp = recorteApp;
    // Lo que la IA no ha visto no se puede usar: el Map y las listas de ids de `mencionadas` quedan igual que `datos.puntos`.
    const vistos = new Set(datos.puntos.map((p) => p.id));
    // Revisión: y los P# que salen en los pasos de las guías.
    quitarPuntosDeGuias(datos.misGuias, new Set([...puntos.keys()].filter((id) => !vistos.has(id))));
    for (const id of [...puntos.keys()])
        if (!vistos.has(id))
            puntos.delete(id);
    for (const m of datos.mencionadas)
        m.puntos = m.puntos.filter((id) => vistos.has(id));
    // Los objetos que la IA ha visto en las bolsas: con los que se valida `marcas` de su respuesta.
    const inventarioIds = new Set(typeof inventario === 'object' ? inventario.objetos.map((o) => o.id) : []);
    // existeObjeto y grupoAbierto: con ellos respuesta.mjs valida el campo `comercio` de la respuesta.
    // idsRegistro: las misiones del registro entero, antes de los recortes (respuesta.mjs las usa para validar las paradas).
    // guiasConPasos: las claves de las guías que la IA ha visto con sus pasos (nucleo.mjs las recuerda para los turnos
    // siguientes de este personaje).
    // Solo las que llevan «por» (elegida, reciente, nombrada o de zona): las de su nivel vuelven solas si toca.
    // Revisión: las que llegaron como «reciente» no se vuelven a apuntar (si no, no caducarían nunca).
    const guiasConPasos = (datos.misGuias?.guias ?? []).filter((g) => g.por !== undefined && g.por !== 'reciente').map((g) => g.clave ?? claveMisGuias(g.nombre));
    // talentosFalta: el addon dijo que no pudo leer los talentos (nucleo.mjs lo apunta en registro.log).
    // T2 (A2): los objetivos con sitio de la misión q en la base (los puntos de papel objetivo, con su objetivo k, sus PNJ y
    // sus sitios, como el Map), cuántos objetivos no tienen sitio y su texto de la base -> {nombre, puntos, faltan, textos} o
    // null si la base no la trae. respuesta.mjs los mete delante de una entrega de la `ruta` que no los lleva.
    const objetivosDe = (q) => {
        const m = esNumero(q) ? base.mision(q, pjBase) : undefined;
        if (!m)
            return null;
        const suyos = puntosDe(q).filter((p) => p.papel === 'objetivo');
        const conSitio = new Set(suyos.map((p) => p.objetivo).filter(Number.isInteger));
        // Ronda 1 (M4): solo cuentan los objetivos que podrían tener sitio (PNJ, objetos e ítems: los grupos 1 a 3 de
        // `objectives`, que van primero en el registro); la reputación y el crédito de muerte no lo tienen nunca.
        const conPosibleSitio = [1, 2, 3].reduce((s, g) => s + entradas(elemento(m.objectives, g)).length, 0);
        let faltan = 0;
        for (let k = 1; k <= conPosibleSitio; k++)
            if (!conSitio.has(k))
                faltan++;
        const descripcion = textos(idioma === 'es' ? elemento(base.datos.es?.quest, q)?.objectivesText : undefined);
        return {
            nombre: nombreMision(q),
            puntos: suyos.map((p) => ({ mapa: p.mapa, x: p.x, y: p.y, texto: p.texto, papel: 'objetivo', q, ...(p.obj !== undefined ? { obj: p.obj } : {}),
                ...(p.objetivo !== undefined ? { objetivo: p.objetivo } : {}), ...(p.npcs !== undefined ? { npcs: p.npcs } : {}),
                ...(p.sitios !== undefined ? { sitios: p.sitios } : {}) })),
            faltan,
            textos: descripcion.length > 0 ? descripcion : textos(m.objectivesText),
        };
    };
    // idsListas (17-nov): las del registro listas para entregar, antes de los recortes. objetivosDe (T2, A2): ver arriba.
    return { datos, puntos, inventarioIds, guias, nombresMision, existeObjeto, grupoAbierto, idsRegistro, idsListas, objetivosDe, guiasConPasos, talentosFalta };
}
