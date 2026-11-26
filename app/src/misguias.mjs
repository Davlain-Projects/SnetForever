// 15-nov (en el juego: «revisa mis guías y créame una guía acorde a mi level» y la IA contestó que no podía verlas): las
// guías propias del jugador, para la IA.
//
// El jugador escribe sus guías en el addon aparte SnetForever_MisGuias (mis-guias.lua, la global SnetForeverMisGuias, con
// el formato de su LEEME.txt y de la cabecera de addons/SnetForever/motor/misguias.lua). El addon solo manda a la app los
// nombres de las de su nivel (ctx.guias), así que la app lee el archivo del disco (solo lo lee: nunca escribe en AddOns) y,
// cuando el mensaje habla de guías, contexto.mjs añade `datos.misGuias` con las que tocan su nivel y su facción:
// (y, desde el 15-nov, también la elegida en el addon y las que nombra el mensaje, delante y con `por`):
//   {guias: [{nombre, niveles: [min, max], por?: 'elegida'|'nombrada'|'zona', faccion?, clave?, zonas: [{mapa, zona}], misiones: [{q, nombre, nivel?,
//    estado?, mazmorra?, evento?}], misionesTotal?, pasos: ["n. entregar q; aceptar q · zona · texto"], pasosTotal?,
//    deOtraClase?}], otras?: [{nombre, niveles}], truncado?: true}
// Las mismas reglas que el addon: una misión que no está en la base no se manda, los niveles que faltan (o están mal)
// salen de las misiones de la guía y una guía sin facción vale para las dos. Las coordenadas de los «ir» no salen nunca:
// solo el mapa y el nombre de su zona (con ellos la IA arma la ruta de esa zona con rutaZona).
// 17-nov: un paso con clase, raza o facción (o sin_clase / sin_raza) que no son las del personaje no se manda, y
// deOtraClase cuenta cuántos (como leer_guia); uno con un nombre que no se entiende no se manda nunca (el addon tampoco lo
// enseña).
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { leerVariablesGuardadas, elemento } from './base/leer-lua.mjs';
import { cortar } from './texto.mjs';
export const ARCHIVO_MIS_GUIAS = join('SnetForever_MisGuias', 'mis-guias.lua');
export const MAX_MIS_GUIAS = 14000; // caracteres del JSON del bloque
const GLOBAL = 'SnetForeverMisGuias';
const GRUPO = 'Mis guías'; // MisGuias.GRUPO del addon (la primera parte de las claves)
const MAX_BYTES_ARCHIVO = 16 * 1024 * 1024;
const MAX_GUIAS_CON_PASOS = 6;
const MAX_OTRAS = 20;
const MAX_PASOS_GUIA = 60;
const MAX_MISIONES_GUIA = 40;
const MAX_NOMBRE = 80; // MAX_NOMBRE del addon
const MAX_TEXTO_PASO = 80;
const MARGEN_ABAJO = 2; // una guía entra si su tramo toca [nivel − 2, nivel + 3]
const MARGEN_ARRIBA = 3;
const MARGEN_ZONA = 10; // una guía nombrada solo por una de sus zonas entra si su tramo toca [nivel − 10, nivel + 10]
const FACCIONES = { Horda: 'Horde', Horde: 'Horde', Alianza: 'Alliance', Alliance: 'Alliance' };
// Lo leído de cada archivo, con su fecha y su tamaño: sin cambios, no se vuelve a leer.
const memoria = new Map();
/**
 * La lista de guías de `<addonsDir>\SnetForever_MisGuias\mis-guias.lua` tal cual (sin validar: eso es bloqueMisGuias), o
 * null si no hay carpeta, no hay archivo, no se puede leer o no trae la global como lista. Nunca lanza.
 */
export function leerMisGuias(addonsDir, { fs = fsReal } = {}) {
    if (typeof addonsDir !== 'string' || addonsDir === '')
        return null;
    const archivo = join(addonsDir, ARCHIVO_MIS_GUIAS);
    try {
        const st = fs.statSync(archivo);
        if (!st.isFile() || st.size > MAX_BYTES_ARCHIVO)
            return null;
        const ya = memoria.get(archivo);
        if (ya && ya.mtimeMs === st.mtimeMs && ya.size === st.size)
            return ya.valor;
        let valor = null;
        try {
            const lista = leerVariablesGuardadas(fs.readFileSync(archivo, 'utf8'), GLOBAL, 'mis-guias.lua');
            if (Array.isArray(lista) || (lista && typeof lista === 'object'))
                valor = Object.values(lista);
        }
        catch {
            valor = null; // un error de escritura: el juego ya se lo dice al jugador
        }
        memoria.set(archivo, { mtimeMs: st.mtimeMs, size: st.size, valor });
        return valor;
    }
    catch {
        return null;
    }
}
// Sin tildes ni mayúsculas.
const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// 15-nov (en el juego: «como llego a dalaran para hacer la masmorra» no llevó ninguna guía): además de «guía», cuentan las
// rutas, las mazmorras (también «masmorra»), las misiones en plural (también «missiones»; «misión» o «quest» sueltas salen en
// casi cualquier pregunta, revisión con datos reales), el leveleo y «subir de nivel».
const PALABRAS_GUIAS = new RegExp('(?:^|[^a-z0-9])(?:guias?|guides?|rutas?|routes?|ma[sz]morras?|dungeons?|mis+iones|quests'
    + '|level(?:eo|ear|ing)|subir (?:de )?nivel)(?![a-z0-9])');
/**
 * ¿Habla el texto de guías? «guía», «ruta», «mazmorra», «misiones», «leveleo», «subir de nivel» (y en inglés), sin mirar
 * tildes ni mayúsculas. Con `opciones` = {lista, base, pj}, también si nombra una guía propia de su facción o una zona
 * propia de una de ellas (guiasNombradas).
 */
export function hablaDeGuias(texto, opciones) {
    if (typeof texto !== 'string')
        return false;
    if (PALABRAS_GUIAS.test(normalizar(texto)))
        return true;
    return opciones != null && guiasNombradas(opciones.lista, texto, opciones).size > 0;
}
// Las palabras que no distinguen una guía de otra (partes corrientes de los nombres de zonas y de guías): no cuentan para
// decir que el mensaje la nombra. Revisión con datos reales: «que hace la horda aqui», «soy cazador», «la llave», «necesito
// botas», «tengo la peste», «burning» o «thousand gold» metían guías que no tenían nada que ver.
const PALABRAS_CORRIENTES = new Set([
    // geografía
    'ciudad', 'city', 'tierras', 'lands', 'montanas', 'mountains', 'bosque', 'forest', 'valle', 'valley', 'laderas', 'foothills',
    'sierra', 'costa', 'coast', 'claros', 'glades', 'altas', 'highlands', 'norte', 'north', 'south', 'oeste', 'west', 'este',
    'east', 'islas', 'isla', 'island', 'cueva', 'cavern', 'profundidades', 'depths', 'fortaleza', 'templo', 'temple', 'oscuro',
    'oscura', 'negro', 'negra', 'interior', 'invierno', 'peste', 'pantano', 'thunder', 'eastern', 'western', 'occidental',
    'oriental', 'burning', 'thousand', 'lugar', 'site', 'upper', 'lower', 'superior', 'inferior',
    // guías y misiones
    'parte', 'part', 'ejemplo', 'guias', 'guide', 'guides', 'mazmorra', 'dungeon', 'mision', 'misiones', 'quest', 'quests', 'ruta',
    'route', 'subida', 'clase', 'class', 'llave', 'key', 'sintonizacion', 'attunement', 'independiente', 'standalone',
    // facciones y clases
    'horda', 'horde', 'alianza', 'alliance', 'guerrero', 'warrior', 'paladin', 'cazador', 'hunter', 'picaro', 'rogue',
    'sacerdote', 'priest', 'chaman', 'shaman', 'mago', 'mage', 'brujo', 'warlock', 'druida', 'druid',
    // piezas de equipo
    'yelmo', 'casco', 'helm', 'pecho', 'chest', 'botas', 'boots', 'guantes', 'gloves', 'brazales', 'bracers', 'hombreras',
    'shoulders', 'cinturon', 'belt', 'pantalones', 'pants', 'piernas', 'legs', 'capa', 'cloak', 'arma', 'weapon', 'anillo',
    'ring', 'collar', 'necklace', 'armadura', 'armor', 'conjunto', 'set',
]);
// Última revisión: solo se exigen las palabras de 5 letras o más («vale», «keep» o «pass» no hacen falta), y una de 7 o
// más basta sola («stranglethorn», «revolcafango», «blackfathom», «estepas»).
const MIN_PALABRA = 5;
const MIN_LARGA = 7;
// Lugares corrientes (también de 7 letras o más): no bastan solos.
for (const p of ['campamento', 'camp', 'aldea', 'village', 'puerto', 'harbor', 'fuerte', 'outpost', 'avanzada', 'granja', 'farm',
    'torre', 'tower', 'castillo', 'castle', 'ruinas', 'ruins', 'cumbre', 'peak', 'desierto', 'desert', 'playa', 'beach', 'paramos',
    'paramo', 'guarida', 'lair', 'camino', 'excavacion', 'excavation'])
    PALABRAS_CORRIENTES.add(p);
// Las palabras de un texto ya normalizado, sin el plural («trabaloma» y «trabalomas» son la misma).
const sinPlural = (p) => (p.length > 5 && p.endsWith('s') ? p.slice(0, -1) : p);
const palabras = (t) => (t.match(/[a-z0-9]+/g) ?? []).map(sinPlural);
const corriente = (p) => PALABRAS_CORRIENTES.has(p) || PALABRAS_CORRIENTES.has(`${p}s`);
// Para las frases: la coletilla de punto cardinal y la cabeza geográfica que se pueden quitar («Tierras de la Peste del
// Oeste» se nombra también «tierras de la peste» o «la peste del oeste»).
const COLETILLAS = new Set(['occidental', 'oriental', 'western', 'eastern', 'northern', 'southern']);
const PUNTOS = new Set(['norte', 'sur', 'este', 'oeste']);
const CABEZAS = new Set(['tierras', 'tierra', 'lands', 'montanas', 'mountains', 'bosque', 'forest', 'valle', 'laderas', 'paramos',
    'claros', 'costa', 'sierra', 'islas', 'isla', 'cumbre']);
const ARTICULOS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'of', 'the']);
function sinColetilla(w) {
    let v = [...w];
    if (COLETILLAS.has(v[0]))
        v = v.slice(1);
    if (COLETILLAS.has(v.at(-1)))
        v = v.slice(0, -1);
    else if (v.length >= 3 && v.at(-2) === 'del' && PUNTOS.has(v.at(-1)))
        v = v.slice(0, -2);
    return v;
}
function sinCabeza(w) {
    let v = [...w];
    while (ARTICULOS.has(v[0]))
        v = v.slice(1);
    if (!CABEZAS.has(v[0]))
        return w;
    v = v.slice(1);
    while (ARTICULOS.has(v[0]))
        v = v.slice(1);
    return v;
}
// Las partes de un nombre (de guía o de zona) por las que se le puede nombrar: sin las marcas («[H-A]», «(2)», «SoD», «JJ»),
// sin los números y cortado por «/» y «:». Cada parte: {palabras: las que la distinguen (de 5 letras o más; todas tienen que
// estar en el texto), largas: las que la distinguen de 7 letras o más (una basta), frases: la parte entera y sin coletilla ni
// cabeza, cada una de al menos dos palabras}.
function partesDe(nombre) {
    if (typeof nombre !== 'string')
        return [];
    const sinMarcas = normalizar(nombre).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\b(?:sod|jj|i{1,3}|iv)\b/g, ' ');
    return sinMarcas.split(/[/:]/).map((parte) => {
        const crudas = (parte.match(/[a-z0-9]+/g) ?? []).filter((p) => !/^\d/.test(p));
        const todas = crudas.map(sinPlural);
        const distinguen = crudas.filter((p) => !corriente(sinPlural(p)));
        const frases = [...new Set([todas, sinColetilla(todas), sinCabeza(todas), sinCabeza(sinColetilla(todas))]
                .filter((w) => w.length >= 2).map((w) => ` ${w.join(' ')} `))];
        return {
            palabras: distinguen.map(sinPlural).filter((p) => p.length >= MIN_PALABRA),
            largas: distinguen.filter((p) => p.length >= MIN_LARGA).map(sinPlural),
            frases,
        };
    }).filter((p) => p.palabras.length > 0 || p.frases.length > 0);
}
// ¿Nombra el texto (sus palabras y su frase, ya preparadas) alguna parte de `nombre`?
function nombraA(nombre, delTexto, fraseTexto) {
    return partesDe(nombre).some((p) => (p.palabras.length > 0 && p.palabras.every((w) => delTexto.has(w)))
        || p.largas.some((w) => delTexto.has(w)) || p.frases.some((f) => fraseTexto.includes(f)));
}
/**
 * El tramo de niveles de una guía, el mismo para buscarla y para el bloque: sus `niveles` si están bien escritos; si no, los
 * de sus misiones; si tampoco, 1-60 y `generica` (solo notas).
 */
function tramoDe(g, base) {
    // Las guías propias traen {min, max} como lista; las del addon, también como {min = …, max = …}.
    const [minimo, maximo] = Array.isArray(g.niveles) ? g.niveles : g.niveles && typeof g.niveles === 'object' ? [g.niveles.min, g.niveles.max] : [];
    if (esEnteroPositivo(minimo) && esEnteroPositivo(maximo) && minimo <= maximo && maximo <= 60)
        return { minimo, maximo, generica: false };
    let min;
    let max;
    for (const q of misionesDe(g)) {
        const n = base?.mision(q)?.questLevel;
        if (esEnteroPositivo(n)) {
            min = Math.min(min ?? n, n);
            max = Math.max(max ?? n, n);
        }
    }
    return min !== undefined ? { minimo: min, maximo: max, generica: false } : { minimo: 1, maximo: 60, generica: true };
}
const distanciaA = (nivel, { minimo, maximo }) => (nivel < minimo ? minimo - nivel : nivel > maximo ? nivel - maximo : 0);
// Los pasos que el addon usa (los que tienen un nombre de clase, raza o facción que no entiende, no).
const pasosLegibles = (g) => listaDe(g.pasos).filter((p) => p && typeof p === 'object' && filtroDePasoPropio(p) !== false);
const misionesDe = (g) => pasosLegibles(g).flatMap((p) => ['aceptar', 'completar', 'entregar'].flatMap((c) => listaDe(p[c]))
    .filter(esEnteroPositivo));
// 17-nov: clase, raza y facción de un paso de Mis guías, con los mismos nombres que el addon (motor/misguias.lua:
// CLASES_PASO, RAZAS_PASO, FACCIONES_PASO), en español o en inglés y sin tildes, mayúsculas, espacios ni guiones.
const CLASES_PASO = new Map(Object.entries({
    guerrero: 'WARRIOR', guerrera: 'WARRIOR', warrior: 'WARRIOR', paladin: 'PALADIN', cazador: 'HUNTER', cazadora: 'HUNTER',
    hunter: 'HUNTER', picaro: 'ROGUE', picara: 'ROGUE', rogue: 'ROGUE', sacerdote: 'PRIEST', sacerdotisa: 'PRIEST', priest: 'PRIEST',
    chaman: 'SHAMAN', chamana: 'SHAMAN', shaman: 'SHAMAN', mago: 'MAGE', maga: 'MAGE', mage: 'MAGE', brujo: 'WARLOCK', bruja: 'WARLOCK',
    warlock: 'WARLOCK', druida: 'DRUID', druid: 'DRUID',
}));
const RAZAS_PASO = new Map(Object.entries({
    humano: 'Human', humana: 'Human', human: 'Human', orco: 'Orc', orca: 'Orc', orc: 'Orc', enano: 'Dwarf', enana: 'Dwarf',
    dwarf: 'Dwarf', elfodelanoche: 'NightElf', elfadelanoche: 'NightElf', nightelf: 'NightElf', nomuerto: 'Scourge',
    nomuerta: 'Scourge', renegado: 'Scourge', renegada: 'Scourge', undead: 'Scourge', scourge: 'Scourge', tauren: 'Tauren',
    gnomo: 'Gnome', gnoma: 'Gnome', gnome: 'Gnome', trol: 'Troll', troll: 'Troll', goblin: 'Goblin', skyborne: 'Skyborne',
}));
const FACCIONES_PASO = new Map(Object.entries({ horda: 'Horde', horde: 'Horde', alianza: 'Alliance', alliance: 'Alliance' }));
// [campo, nombres, letra del término de filtros.lua, negado]
const FILTROS_PASO = [['clase', CLASES_PASO, 'c', false], ['raza', RAZAS_PASO, 'r', false], ['faccion', FACCIONES_PASO, 'f', false],
    ['sin_clase', CLASES_PASO, 'c', true], ['sin_raza', RAZAS_PASO, 'r', true]];
// Ronda 2 (M1): como el addon (normalNombre de motor/misguias.lua): primero las tildes conocidas (agudas, graves, diéresis
// y eñe, también en mayúscula), luego fuera todo lo que no es letra o cifra ASCII y al final las mayúsculas.
const SIN_TILDE = new Map(Object.entries({
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u',
    Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N', À: 'A', È: 'E', Ì: 'I', Ò: 'O', Ù: 'U',
}));
const normalNombre = (v) => v.replace(/[áéíóúüñàèìòùÁÉÍÓÚÜÑÀÈÌÒÙ]/g, (c) => SIN_TILDE.get(c)).replace(/[^A-Za-z0-9]/g, '').toLowerCase();
// Ronda 2 (M2): de una tabla, solo su parte de lista (1, 2, 3… hasta el primer hueco), como ipairs en el addon.
function parteDeLista(v) {
    if (Array.isArray(v))
        return v;
    const salida = [];
    for (let k = 1; elemento(v, k) !== undefined && elemento(v, k) !== null; k++)
        salida.push(elemento(v, k));
    return salida;
}
/**
 * El filtro de un paso de Mis guías en la forma de nucleo/filtros.lua (grupos O de términos Y), como lo arma el addon:
 * una lista es O, los campos juntos son Y y sin_clase / sin_raza van negados en todos los grupos. null si el paso no
 * lleva ninguno de esos campos; false si alguno de sus nombres no se entiende (el paso no sale). Con sinFaccion (la guía
 * entera, ronda 2), sin su facción: la de la guía va aparte, como siempre.
 */
export function filtroDePasoPropio(p, { sinFaccion = false } = {}) {
    let grupos = [[]];
    let alguno = false;
    for (const [campo, nombres, letra, negado] of FILTROS_PASO) {
        const valor = p?.[campo];
        if (valor === undefined || valor === null || (sinFaccion && campo === 'faccion'))
            continue;
        alguno = true;
        const lista = valor && typeof valor === 'object' ? parteDeLista(valor) : [valor];
        const terminos = [];
        for (const nombre of lista) {
            const v = typeof nombre === 'string' ? nombres.get(normalNombre(nombre)) : undefined;
            if (v === undefined)
                return false;
            const t = `${negado ? '!' : ''}${letra}:${v}`;
            if (!terminos.includes(t))
                terminos.push(t);
        }
        if (terminos.length === 0)
            return false;
        grupos = negado ? grupos.map((g) => [...g, ...terminos]) : grupos.flatMap((g) => terminos.map((t) => [...g, t]));
    }
    return alguno ? grupos : null;
}
const TODAS_CLASES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID'];
const TODAS_RAZAS = ['Human', 'Orc', 'Dwarf', 'NightElf', 'Scourge', 'Tauren', 'Gnome', 'Troll', 'Goblin', 'Skyborne'];
/**
 * El paso (o, con sinFaccion, la guía entera) de Mis guías en `clases` / `razas` / `facciones` (como los pasos de 4Ever
 * en la biblioteca, para leer_guia): {} si vale para todos, false si un nombre no se entiende. Ronda 2 (M3): la facción va
 * como facción, no como sus razas (un Skyborne de la Alianza no debe ver lo de la Horda).
 */
export function clasesYRazasDePaso(p, opciones) {
    const filtro = filtroDePasoPropio(p, opciones);
    if (filtro === false)
        return false;
    if (filtro === null)
        return {};
    const clases = new Set();
    const razas = new Set();
    const facciones = new Set();
    for (const g of filtro) {
        const de = (letra) => g.filter((t) => t[0] === letra).map((t) => t.slice(2));
        const no = (letra) => new Set(g.filter((t) => t.startsWith(`!${letra}:`)).map((t) => t.slice(3)));
        const sinClase = no('c');
        const sinRaza = no('r');
        const [clase] = de('c');
        const [raza] = de('r');
        const [faccion] = de('f');
        for (const c of clase ? [clase] : TODAS_CLASES)
            if (!sinClase.has(c))
                clases.add(c);
        for (const r of raza ? [raza] : TODAS_RAZAS)
            if (!sinRaza.has(r))
                razas.add(r);
        for (const f of faccion ? [faccion] : ['Horde', 'Alliance'])
            facciones.add(f);
    }
    const salida = {};
    if (clases.size < TODAS_CLASES.length)
        salida.clases = TODAS_CLASES.filter((c) => clases.has(c));
    if (razas.size < TODAS_RAZAS.length)
        salida.razas = TODAS_RAZAS.filter((r) => razas.has(r));
    if (facciones.size < 2)
        salida.facciones = [...facciones];
    return salida;
}
// Ronda 2 (decisión 1): ¿le vale la guía entera (clase, raza, sin_clase, sin_raza; como guia.filtro en el addon)? Con un
// nombre que no se entiende, a nadie.
function guiaVale(g, pj) {
    const filtro = filtroDePasoPropio(g, { sinFaccion: true });
    return filtro !== false && valePasoPropio(filtro, pj);
}
// ¿Le vale el paso al personaje? Lo que no se sabe de él (su clase, su raza o su facción) no quita el paso, como en
// leer_guia (valeParaPj).
function valePasoPropio(filtro, pj = {}) {
    if (filtro === null)
        return true;
    const sabe = { c: pj?.clase, r: pj?.raza, f: pj?.faccion };
    const conocidos = filtro.map((g) => g.filter((t) => {
        const v = sabe[t.replace(/^!/, '')[0]];
        return typeof v === 'string' && v !== '';
    }));
    return cumpleFiltro(conocidos, pj ?? {});
}
// Las capitales y los continentes: casi todas las guías pasan por ellos, así que no son zona propia de ninguna.
const NO_PROPIAS = new Set([1453, 1454, 1455, 1456, 1457, 1458, 1414, 1415, 947]);
const PARTE_PROPIA = 0.25;
/**
 * Las zonas propias de una guía: las de sus misiones y las de sus «ir», sin capitales, que suman al menos una cuarta parte
 * de todas (como mucho 3).
 */
function zonasPropias(g, base) {
    const cuenta = new Map();
    const sumar = (m) => { if (esEnteroPositivo(m) && !NO_PROPIAS.has(m))
        cuenta.set(m, (cuenta.get(m) ?? 0) + 1); };
    for (const p of pasosLegibles(g)) {
        if (Array.isArray(p.ir))
            sumar(p.ir[0]);
        for (const q of ['aceptar', 'completar', 'entregar'].flatMap((c) => listaDe(p[c])).filter(esEnteroPositivo)) {
            const m = base.mision(q);
            const zona = m?.zoneOrSort > 0 && typeof base.uiDeArea === 'function' ? base.uiDeArea(m.zoneOrSort) : null;
            sumar(esEnteroPositivo(m?.uiMap) ? m.uiMap : zona);
        }
    }
    const total = [...cuenta.values()].reduce((a, b) => a + b, 0);
    return [...cuenta].filter(([, n]) => n >= total * PARTE_PROPIA).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);
}
const MAX_NOMBRADAS = 4; // por su nombre, las más cercanas a su nivel
const MAX_POR_ZONA = 2; // por cada zona que nombra el texto
const MAX_ZONA_TOTAL = 3;
/**
 * Las guías propias (de su facción o de las dos) que nombra el texto: por su nombre (`nombre` o `nombre_en`: todas las
 * palabras que distinguen una de sus partes, o la parte entera; como mucho 4, las más cercanas a su nivel) o por una de sus
 * zonas propias (el nombre de la zona en los dos idiomas, igual; solo a menos de 10 niveles, 2 por zona y 3 en total). Sin
 * tildes, mayúsculas ni plural. Map nombre -> 'nombre' | 'zona'.
 * @param o {base, pj: {nivel, faccion}}
 */
export function guiasNombradas(lista, texto, { base, pj = {} } = {}) {
    const salida = new Map();
    if (!Array.isArray(lista) || typeof texto !== 'string')
        return salida;
    const normal = normalizar(texto);
    const delTexto = new Set(palabras(normal));
    if (delTexto.size === 0)
        return salida;
    const fraseTexto = ` ${palabras(normal).join(' ')} `;
    const faccionPj = FACCIONES[pj?.faccion];
    const nivel = esEnteroPositivo(pj?.nivel) ? pj.nivel : null;
    const zonaNombrada = new Map(); // uiMap -> ¿lo nombra el texto?
    const nombraZona = (m) => {
        if (!zonaNombrada.has(m))
            zonaNombrada.set(m, ['es', 'en'].some((i) => nombraA(base.zona(m, i), delTexto, fraseTexto)));
        return zonaNombrada.get(m);
    };
    const porNombre = [];
    const porZona = [];
    const vistos = new Set();
    for (const g of lista) {
        if (!g || typeof g !== 'object')
            continue;
        const nombre = limpio(g.nombre, MAX_NOMBRE);
        if (!nombre || vistos.has(nombre))
            continue;
        vistos.add(nombre);
        const faccion = typeof g.faccion === 'string' ? FACCIONES[g.faccion] : undefined;
        if (faccion && faccionPj && faccion !== faccionPj)
            continue;
        if (!guiaVale(g, pj))
            continue;
        const distancia = nivel === null ? 0 : distanciaA(nivel, tramoDe(g, base));
        if (nombraA(nombre, delTexto, fraseTexto) || nombraA(g.nombre_en, delTexto, fraseTexto))
            porNombre.push({ nombre, distancia });
        else if (base && distancia <= MARGEN_ZONA) {
            const zonas = zonasPropias(g, base).filter(nombraZona);
            if (zonas.length > 0)
                porZona.push({ nombre, distancia, zonas });
        }
    }
    const cercanas = (a, b) => a.distancia - b.distancia;
    for (const { nombre } of porNombre.sort(cercanas).slice(0, MAX_NOMBRADAS))
        salida.set(nombre, 'nombre');
    const enZona = new Map(); // uiMap -> cuántas van
    let deZona = 0;
    for (const { nombre, zonas } of porZona.sort(cercanas)) {
        if (deZona >= MAX_ZONA_TOTAL)
            break;
        const zona = zonas.find((m) => (enZona.get(m) ?? 0) < MAX_POR_ZONA);
        if (zona === undefined)
            continue;
        enZona.set(zona, (enZona.get(zona) ?? 0) + 1);
        salida.set(nombre, 'zona');
        deZona++;
    }
    return salida;
}
const esEnteroPositivo = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1;
const enCien = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const listaDe = (v) => (typeof v === 'number' ? [v] : Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
// Un texto del jugador: sin caracteres de control ni espacios a los lados, cortado; null si queda vacío.
function limpio(v, max) {
    if (typeof v !== 'string')
        return null;
    const t = v.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
    return t === '' ? null : cortar(t, max);
}
// La clave con que el addon conoce la guía (MisGuias: «Mis guías\<nombre>», con «\» cambiada por «/» y «|» doblado).
const claveDe = (nombre) => `${GRUPO}\\${nombre.replace(/\\/g, '/').replace(/\|/g, '||')}`;
/** La clave con que el addon conoce una guía propia (la que manda en ctx.guia cuando el jugador la tiene elegida). */
export const claveMisGuias = (nombre) => claveDe(nombre);
// En el juego: «ok y despues de ver a magus que sigue creame la guia completa…» no nombraba Dalaran y la guía se perdió.
// Un mensaje que sigue al anterior («y después», «sigue», «luego», «continúa»…) vuelve a traer las guías recientes.
const CONTINUACION = /(?:^|[^a-z])(?:despues|sigue|siguiente|luego|continua|continuar|then|next|after that)(?![a-z])/;
/** ¿Sigue el mensaje con lo anterior? («y después», «que sigue», «luego», «continúa», «then», «next»…). */
export function esContinuacion(texto) {
    return typeof texto === 'string' && CONTINUACION.test(normalizar(texto));
}
const MAX_PUNTOS_GUIAS = 30; // P# que dan los sitios de las guías con `por` elegida, reciente o nombrada
const PAPEL_ADDON = { accept: 'recoger', turnin: 'entregar', complete: 'objetivo' };
const VERBO = { accept: 'aceptar', turnin: 'entregar', complete: 'completar' };
const ETIQUETA = { recoger: 'Recoger', entregar: 'Entregar', objetivo: 'Objetivo de', lugar: 'Ir a' };
/**
 * El bloque `datos.misGuias` para el personaje, o null si no hay ninguna guía que le toque.
 * @param lista la de leerMisGuias
 * 15-nov (en el juego: la guía de Dalaran, de 33-34, no le llegaba a un nivel 27): van primero, con `por`, la guía que
 * el jugador tiene elegida en el addon (`elegida`, la clave de ctx.guia: entra siempre; si es una guía del propio addon,
 * `guiaAddon` trae la guía), las recientes (`recientes`: claves de las que entraron con pasos en los últimos turnos;
 * `recientesAddon`: las del addon entre ellas) y las que nombra el mensaje (`texto`, guiasNombradas: entran aunque no
 * sean de su nivel); después, las de su nivel. Con `punto` ({q?, papel, mapa, x, y, texto} -> id P# o null), los sitios
 * de los pasos de la elegida, las recientes y las nombradas van a la tabla de puntos y el paso lleva su P#.
 * @param o {base, pj: {nivel, faccion}, pjBase?, idioma?, claves?: Map|Set (las claves de ctx.guias),
 *          mision?: (q) => {q, nombre, ...} (el nombre y las marcas de la misión, como en el resto de los datos),
 *          texto?, elegida?, guiaAddon?, recientes?: [clave], recientesAddon?: [guía], punto?}
 */
export function bloqueMisGuias(lista, { base, pj = {}, pjBase, idioma = 'es', claves, mision, texto, elegida, guiaAddon, recientes = [], recientesAddon = [], punto } = {}) {
    if (!Array.isArray(lista) || !base)
        return null;
    const nivel = esEnteroPositivo(pj.nivel) ? pj.nivel : 1;
    const faccionPj = FACCIONES[pj.faccion];
    const enBase = (q) => esEnteroPositivo(q) && base.mision(q, pjBase) != null;
    const datosMision = (q) => (typeof mision === 'function' ? mision(q) : { q, nombre: base.nombre('quest', q, idioma) });
    const nombradas = guiasNombradas(lista, texto, { base, pj });
    const deRecientes = new Set(Array.isArray(recientes) ? recientes : []);
    let puntosDados = 0;
    const conPunto = typeof punto === 'function' ? (p) => {
        if (puntosDados >= MAX_PUNTOS_GUIAS || !esEnteroPositivo(p.mapa) || !enCien(p.x) || !enCien(p.y))
            return null;
        const id = punto(p);
        if (id)
            puntosDados++;
        return id ?? null;
    } : null;
    const nombreMision = (q) => datosMision(q)?.nombre ?? base.nombre('quest', q, idioma);
    const opcionesResumen = (prioridad) => ({ base, idioma, enBase, nombreMision, punto: prioridad <= 2 ? conPunto : null, pj });
    const candidatas = [];
    // 0: la elegida; 1: reciente; 2: nombrada por su nombre; 3: por una de sus zonas; 4: por su nivel.
    const POR = ['elegida', 'reciente', 'nombrada', 'zona'];
    const sumarCandidata = ({ g, nombre, clave, prioridad, faccion, guia, extra = {} }) => {
        const tramo = tramoDe(g, base);
        const { minimo, maximo, generica } = tramo;
        const salida = { nombre, niveles: [minimo, maximo] };
        if (prioridad < 4)
            salida.por = POR[prioridad];
        Object.assign(salida, extra);
        if (faccion)
            salida.faccion = faccion;
        if (clave)
            salida.clave = clave;
        salida.zonas = guia.zonas;
        salida.misiones = guia.misiones.slice(0, MAX_MISIONES_GUIA).map((q) => {
            const m = { ...datosMision(q) };
            const nivelMision = base.mision(q, pjBase)?.questLevel;
            if (esEnteroPositivo(nivelMision))
                m.nivel = nivelMision;
            return m;
        });
        if (guia.misiones.length > MAX_MISIONES_GUIA)
            salida.misionesTotal = guia.misiones.length;
        salida.pasos = guia.pasos.slice(0, MAX_PASOS_GUIA);
        if (guia.pasos.length > MAX_PASOS_GUIA)
            salida.pasosTotal = guia.pasos.length;
        if (guia.deOtraClase > 0)
            salida.deOtraClase = guia.deOtraClase;
        // La misma guía en otro idioma (las mismas misiones en el mismo orden y los mismos pasos) no se repite entera.
        const firma = guia.misiones.length > 0 ? `${guia.misiones.join(',')}|${guia.pasos.length}` : null;
        candidatas.push({ salida, prioridad, distancia: distanciaA(nivel, tramo), generica, ancho: maximo - minimo, minimo, firma });
    };
    // Las del propio addon (Misiones o Rutas): la elegida y las recientes.
    const delAddon = [];
    if (guiaAddon && typeof guiaAddon === 'object')
        delAddon.push([guiaAddon, 0]);
    for (const g of Array.isArray(recientesAddon) ? recientesAddon : [])
        if (g && typeof g === 'object')
            delAddon.push([g, 1]);
    const vistasAddon = new Set();
    for (const [g, prioridad] of delAddon) {
        const clave = typeof g.clave === 'string' ? g.clave : null;
        if (!clave || vistasAddon.has(clave))
            continue;
        vistasAddon.add(clave);
        const guia = resumirGuiaAddon(g, opcionesResumen(prioridad));
        if (!guia)
            continue;
        const titulo = g.titulo && typeof g.titulo === 'object' ? (idioma === 'en' ? g.titulo.en : g.titulo.es ?? g.titulo.en) : null;
        const nombre = limpio(titulo, MAX_NOMBRE) ?? limpio(g.nombre, MAX_NOMBRE) ?? clave;
        const extra = typeof g.grupo === 'string' ? { grupo: cortar(g.grupo, MAX_NOMBRE) } : {};
        sumarCandidata({ g, nombre, clave, prioridad, faccion: FACCIONES[g.faccion], guia, extra });
    }
    const vistos = new Set();
    for (const g of lista) {
        if (!g || typeof g !== 'object')
            continue;
        const nombre = limpio(g.nombre, MAX_NOMBRE);
        if (!nombre || vistos.has(nombre))
            continue; // el addon tampoco usa la segunda con el mismo nombre
        vistos.add(nombre);
        const clave = claveDe(nombre);
        const esElegida = typeof elegida === 'string' && clave === elegida;
        const prioridad = esElegida ? 0 : deRecientes.has(clave) ? 1 : nombradas.get(nombre) === 'nombre' ? 2 : nombradas.has(nombre) ? 3 : 4;
        const faccion = typeof g.faccion === 'string' ? FACCIONES[g.faccion] : undefined;
        if (prioridad > 1 && faccion && faccionPj && faccion !== faccionPj)
            continue;
        // Ronda 2: la de otra clase o raza (o con un nombre que no se entiende) no entra, ni elegida (el addon no la deja elegir).
        if (!guiaVale(g, pj))
            continue;
        // Sin niveles y sin misiones con nivel (solo notas): 1-60, como en el addon, pero detrás de las demás (tramoDe).
        const { minimo, maximo } = tramoDe(g, base);
        if (prioridad === 4 && (maximo < nivel - MARGEN_ABAJO || minimo > nivel + MARGEN_ARRIBA))
            continue;
        const guia = resumirGuia(g, opcionesResumen(prioridad));
        if (!guia)
            continue;
        const conClave = claves && typeof claves.has === 'function' && claves.has(clave) ? clave : null;
        sumarCandidata({ g, nombre, clave: conClave, prioridad, faccion, guia });
    }
    if (candidatas.length === 0)
        return null;
    // Primero la elegida, las recientes y las nombradas; después las que incluyen su nivel y las más cercanas; en un empate,
    // la de tramo más estrecho y la más baja. Las genéricas (sin niveles ni misiones), al final de cada grupo.
    candidatas.sort((a, b) => a.prioridad - b.prioridad || a.generica - b.generica || a.distancia - b.distancia || a.ancho - b.ancho
        || a.minimo - b.minimo);
    const primeras = new Map(); // firma -> nombre de la primera guía con esa firma
    const iguales = [];
    const distintas = [];
    for (const c of candidatas) {
        const igual = c.firma !== null ? primeras.get(c.firma) : undefined;
        if (igual !== undefined)
            iguales.push({ nombre: c.salida.nombre, niveles: c.salida.niveles, igualQue: igual });
        else {
            if (c.firma !== null)
                primeras.set(c.firma, c.salida.nombre);
            distintas.push(c.salida);
        }
    }
    const bloque = { guias: distintas.slice(0, MAX_GUIAS_CON_PASOS) };
    const sobran = distintas.slice(MAX_GUIAS_CON_PASOS).map((g) => ({ nombre: g.nombre, niveles: g.niveles }));
    const otras = [...sobran, ...iguales];
    if (otras.length > 0)
        bloque.otras = otras.slice(0, MAX_OTRAS);
    if (sobran.length > 0 || otras.length > MAX_OTRAS || bloque.guias.some((g) => 'pasosTotal' in g || 'misionesTotal' in g))
        bloque.truncado = true;
    while (JSON.stringify(bloque).length > MAX_MIS_GUIAS && recortarMisGuias(bloque)) { /* otra vuelta */ }
    return bloque;
}
// El sitio de un paso para la tabla de puntos: el P# (o null) y su papel según las misiones del paso.
function sitioDePaso(punto, { mapa, x, y }, q, papel, nombreMision, zona, textoPaso) {
    if (!punto)
        return null;
    const etiqueta = q !== undefined ? `${ETIQUETA[papel]} «${nombreMision(q)}»` : textoPaso || `${ETIQUETA.lugar} ${zona}`;
    return punto({ q, papel, mapa, x, y, texto: cortar(etiqueta, MAX_TEXTO_PASO) });
}
// Los pasos de una guía propia en texto corto, sus misiones (en orden, sin repetir) y las zonas de sus «ir»; null si no
// le queda ningún paso (el addon tampoco la usa). Sus niveles salen de tramoDe. Con `punto`, cada «ir» da un P#.
function resumirGuia(g, { base, idioma, enBase, nombreMision, punto, pj }) {
    if (!Array.isArray(g.pasos) && !(g.pasos && typeof g.pasos === 'object'))
        return null;
    const pasos = [];
    const misiones = [];
    const zonas = [];
    let zonaAnterior = null;
    let deOtraClase = 0;
    const sumar = (q) => { if (!misiones.includes(q))
        misiones.push(q); };
    listaDe(g.pasos).forEach((p, i) => {
        if (!p || typeof p !== 'object')
            return;
        // 17-nov: los de otra clase, raza o facción no van (se cuentan); los que tienen un nombre ilegible, nunca.
        const filtro = filtroDePasoPropio(p);
        if (filtro === false)
            return;
        if (!valePasoPropio(filtro, pj)) {
            deOtraClase++;
            return;
        }
        const de = (campo) => listaDe(p[campo]).filter(enBase);
        const aceptar = de('aceptar');
        const completar = de('completar');
        const entregar = de('entregar');
        const partes = [];
        const misionesPaso = [];
        // En el orden en que se hacen en el juego: primero se entrega y después se acepta la siguiente.
        if (entregar.length > 0)
            misionesPaso.push(`entregar ${entregar.join(', ')}`);
        if (aceptar.length > 0)
            misionesPaso.push(`aceptar ${aceptar.join(', ')}`);
        if (completar.length > 0) {
            misionesPaso.push(`completar ${completar.join(', ')}${esEnteroPositivo(p.objetivo) ? ` (objetivo ${p.objetivo})` : ''}`);
        }
        for (const q of [...aceptar, ...completar, ...entregar])
            sumar(q);
        if (misionesPaso.length > 0)
            partes.push(misionesPaso.join('; '));
        const texto = limpio(idioma === 'en' && typeof p.texto_en === 'string' ? p.texto_en : p.texto, MAX_TEXTO_PASO);
        const ir = Array.isArray(p.ir) ? p.ir : null;
        if (ir && esEnteroPositivo(ir[0]) && enCien(ir[1]) && enCien(ir[2])) {
            const mapa = ir[0];
            const zona = base.zona(mapa, idioma) ?? `#${mapa}`;
            if (!zonas.some((z) => z.mapa === mapa))
                zonas.push({ mapa, zona });
            const [q, papel] = entregar.length > 0 ? [entregar[0], 'entregar'] : aceptar.length > 0 ? [aceptar[0], 'recoger']
                : completar.length > 0 ? [completar[0], 'objetivo'] : [undefined, 'lugar'];
            const id = sitioDePaso(punto, { mapa, x: ir[1], y: ir[2] }, q, papel, nombreMision, zona, texto);
            const conId = (t) => (id ? `${t} ${id}`.trim() : t);
            if (misionesPaso.length === 0)
                partes.push(conId(`ir a ${zona}`));
            else if (zona !== zonaAnterior)
                partes.push(conId(zona));
            else if (id)
                partes.push(id);
            zonaAnterior = zona;
        }
        if (texto)
            partes.push(texto);
        if (partes.length > 0)
            pasos.push(`${i + 1}. ${partes.join(' · ')}`);
    });
    if (pasos.length === 0)
        return null;
    return { pasos, misiones, zonas, deOtraClase };
}
// Lo mismo con una guía del propio addon (SnetForever_Misiones o SnetForever_Rutas: pasos con `elementos`): accept, turnin
// y complete con su misión, goto con su zona (y su P#), la entrada a una mazmorra (subzone) y los textos de los elementos.
// Revisión: los pasos y los elementos de las guías del addon con `filtro` solo valen para quien lo cumple (pasos de la Horda
// en una guía de la Alianza, de una clase…).
function resumirGuiaAddon(g, { base, idioma, enBase, nombreMision, punto, pj }) {
    if (!Array.isArray(g.pasos) && !(g.pasos && typeof g.pasos === 'object'))
        return null;
    const pasos = [];
    const misiones = [];
    const zonas = [];
    let zonaAnterior = null;
    for (const p of listaDe(g.pasos)) {
        if (!p || typeof p !== 'object' || !cumpleFiltro(p.filtro, pj))
            continue;
        const elementos = listaDe(p.elementos).filter((e) => e && typeof e === 'object' && cumpleFiltro(e.filtro, pj));
        const deMision = elementos.filter((e) => VERBO[e.t] && enBase(e.q));
        const partes = [];
        if (deMision.length > 0) {
            partes.push(deMision.map((e) => `${VERBO[e.t]} ${e.q}${e.t === 'complete' && esEnteroPositivo(e.objetivo) ? ` (objetivo ${e.objetivo})` : ''}`).join('; '));
            for (const e of deMision)
                if (!misiones.includes(e.q))
                    misiones.push(e.q);
        }
        const entrada = elementos.some((e) => e.t === 'subzone');
        const textos = elementos.map((e) => (e.texto && typeof e.texto === 'object' ? (idioma === 'en' ? e.texto.en : e.texto.es ?? e.texto.en) : null))
            // Revisión: un texto de solo cifras o signos (RestedXP marca pasos con {t="manual", texto={es="1"}}) no es una nota.
            .map((t) => limpio(sinCodigos(t), MAX_TEXTO_PASO)).filter((t) => t && /\p{L}/u.test(t));
        const goto = elementos.find((e) => e.t === 'goto' && esEnteroPositivo(e.mapa) && enCien(e.x) && enCien(e.y));
        if (goto) {
            const zona = base.zona(goto.mapa, idioma) ?? `#${goto.mapa}`;
            if (!zonas.some((z) => z.mapa === goto.mapa))
                zonas.push({ mapa: goto.mapa, zona });
            const primera = deMision[0];
            const papel = primera ? PAPEL_ADDON[primera.t] : 'lugar';
            const etiqueta = entrada ? (idioma === 'en' ? 'Dungeon entrance' : 'Entrada de la mazmorra') : textos[0];
            const id = sitioDePaso(punto, goto, primera?.q, papel, nombreMision, zona, etiqueta);
            const texto = deMision.length === 0 ? `ir a ${zona}` : zona !== zonaAnterior ? zona : '';
            if (texto || id)
                partes.push(`${texto}${texto && id ? ' ' : ''}${id ?? ''}`);
            zonaAnterior = zona;
        }
        if (entrada)
            partes.push(idioma === 'en' ? 'dungeon entrance' : 'entrada de la mazmorra');
        partes.push(...textos.slice(0, 1));
        if (partes.length > 0)
            pasos.push(`${pasos.length + 1}. ${partes.join(' · ')}`);
    }
    if (pasos.length === 0)
        return null;
    return { pasos, misiones, zonas };
}
/**
 * Revisión: quita de los pasos del bloque los P# de `faltan` (los que el recorte general sacó de datos.puntos), como
 * palabras enteras, y las partes del paso que se quedan vacías.
 */
export function quitarPuntosDeGuias(bloque, faltan) {
    if (!bloque || !Array.isArray(bloque.guias) || !(faltan instanceof Set) || faltan.size === 0)
        return;
    const limpiar = (parte) => parte.split(' ').filter((w) => !faltan.has(w)).join(' ').trim();
    for (const g of bloque.guias) {
        if (!Array.isArray(g?.pasos))
            continue;
        g.pasos = g.pasos.map((p) => (typeof p === 'string' ? p.split(' · ').map(limpiar).filter((x) => x !== '').join(' · ') : p));
    }
}
// Revisión: las notas de RestedXP traen iconos (|T…|t), colores (|cFFxxxxxx o |cRXP_…_, cerrados con |r) y el id del
// PNJ detrás del nombre («Ailee Farheart::251362»): fuera, antes de usarlas como paso o como etiqueta.
function sinCodigos(t) {
    if (typeof t !== 'string')
        return t;
    return t.replace(/\|T[^|]*\|t/g, '').replace(/\|c(?:[0-9A-Fa-f]{8}|RXP_[A-Z]+_)/g, '').replace(/\|r/g, '').replace(/::\d+/g, '')
        .replace(/\s+/g, ' ').trim();
}
// El evaluador de filtros del addon (nucleo/filtros.lua): nil/true siempre, false nunca, o una lista de grupos O de
// términos Y («c:WARRIOR», «r:Orc», «f:Horde», «n:10», «s:male», «l:esES», «x:mejora», con «!» para negar). Un término
// desconocido no se cumple.
const SEXO = { 2: 'male', 3: 'female' };
const CAPACIDADES = new Set(['mejora']);
function cumpleTermino(termino, pj) {
    if (typeof termino !== 'string')
        return false;
    const negado = termino.startsWith('!');
    const t = negado ? termino.slice(1) : termino;
    const tipo = t[0];
    const valor = t.slice(2);
    let ok = false;
    if (tipo === 'c')
        ok = String(pj.clase ?? '').toUpperCase() === valor;
    else if (tipo === 'r')
        ok = pj.raza === valor;
    else if (tipo === 'f')
        ok = pj.faccion === valor || pj.faccion === 'Neutral';
    else if (tipo === 'n')
        ok = (esEnteroPositivo(pj.nivel) ? pj.nivel : 1) >= (Number(valor) || 0);
    else if (tipo === 's')
        ok = (SEXO[pj.sexo] ?? (typeof pj.sexo === 'string' ? pj.sexo.toLowerCase() : null)) === valor;
    else if (tipo === 'l')
        ok = pj.idioma != null && pj.idioma === valor;
    else if (tipo === 'x')
        ok = CAPACIDADES.has(valor);
    return ok !== negado;
}
export function cumpleFiltro(filtro, pj = {}) {
    if (filtro == null || filtro === true)
        return true;
    if (filtro === false)
        return false;
    return listaDe(filtro).some((grupo) => listaDe(grupo).every((termino) => cumpleTermino(termino, pj ?? {})));
}
/**
 * Un recorte del bloque (para su tope y para el recorte general de contexto.mjs). Por orden: menos pasos en cada guía
 * de su nivel (hasta 20), pasar la última de su nivel a `otras` (solo nombre y niveles), lo mismo con la elegida y las
 * nombradas, menos pasos y misiones en la que queda (hasta `piso` pasos) y menos `otras`. Marca `truncado`. false si ya
 * no queda nada que recortar. Con `conservar`, la elegida y las nombradas por su nombre no se tocan (contexto.mjs las
 * recorta después de los objetos de las bolsas); las nombradas por una zona («zona») sí, después de las de su nivel.
 */
export function recortarMisGuias(bloque, piso = 0, { conservar = false } = {}) {
    if (!bloque || !Array.isArray(bloque.guias))
        return false;
    const marcar = () => { bloque.truncado = true; return true; };
    const cortarPasos = (g, hasta) => {
        if (!('pasosTotal' in g))
            g.pasosTotal = g.pasos.length;
        g.pasos.length = hasta;
    };
    // 15-nov: la elegida y las nombradas (con `por`, delante) se recortan después de las de su nivel.
    const pasarAOtras = () => {
        const g = bloque.guias.pop();
        bloque.otras = [{ nombre: g.nombre, niveles: g.niveles }, ...(bloque.otras ?? [])].slice(0, MAX_OTRAS);
        return marcar();
    };
    // Revisión con datos reales: con `conservar`, solo la elegida y las nombradas por su nombre quedan protegidas.
    const protegida = (g) => conservar && (g.por === 'elegida' || g.por === 'reciente' || g.por === 'nombrada');
    // Por grupos, del último al primero (el bloque va en ese orden): las de su nivel, las de zona y, sin `conservar`, todas.
    const grupos = [(g) => g.por === undefined, (g) => g.por === undefined || g.por === 'zona', (g) => !protegida(g)];
    for (const enGrupo of grupos) {
        const largas = bloque.guias.filter((g) => enGrupo(g) && g.pasos.length > 20);
        if (largas.length > 0) {
            for (const g of largas)
                cortarPasos(g, Math.max(20, Math.ceil(g.pasos.length / 2)));
            return marcar();
        }
        if (bloque.guias.length > 1 && enGrupo(bloque.guias.at(-1)))
            return pasarAOtras();
    }
    const g = bloque.guias[0];
    if (g && g.pasos.length > piso && !protegida(g)) {
        cortarPasos(g, Math.max(piso, Math.floor(g.pasos.length / 2)));
        if (g.misiones.length > 10) {
            if (!('misionesTotal' in g))
                g.misionesTotal = g.misiones.length;
            g.misiones.length = Math.max(10, Math.floor(g.misiones.length / 2));
        }
        return marcar();
    }
    if (bloque.otras?.length > 0) {
        bloque.otras.length = Math.floor(bloque.otras.length / 2);
        if (bloque.otras.length === 0)
            delete bloque.otras;
        return marcar();
    }
    return false;
}
