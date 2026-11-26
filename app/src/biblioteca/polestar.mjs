// Biblioteca de guías: las guías de Polestar (github.com/fitzforge/polestar, GPLv3: sus .guide, que el jugador guarda
// como .txt). Es texto: la cabecera (guide, title, faction, levels, zone, class, race) y un paso por cada «step <título>»
// con sus líneas sangradas:
//   accept / turnin / complete <id de misión>     -> misiones
//   goto <x>,<y> [map <uiMap>] ["etiqueta"]       -> el punto (sin «map», en la zona del paso o de la cabecera)
//   zone <nombre>                                 -> la zona del paso
//   talk / kill <id de PNJ>                       -> PNJ
//   tip / note <texto>                            -> el texto del paso (tras su título)
//   only <Clase|Raza,…>  (o «!Clase»)             -> `clases` / `razas` del paso
// Lo demás (when, collect, level, …) no se usa. Nada se inventa: lo que no se reconoce no da misiones ni puntos.
//
//   esPolestar(texto) -> boolean ; guiaDePolestar(texto, {base}) -> GuiaLeida
import { resolverZona } from '../rutaZona.mjs';
const CLASES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID'];
const RAZAS = new Map([['human', 'Human'], ['dwarf', 'Dwarf'], ['nightelf', 'NightElf'], ['gnome', 'Gnome'], ['orc', 'Orc'],
    ['undead', 'Scourge'], ['scourge', 'Scourge'], ['tauren', 'Tauren'], ['troll', 'Troll'], ['skyborne', 'Skyborne']]);
const FACCIONES = { horde: 'Horde', alliance: 'Alliance' };
const ACCIONES = { accept: 'aceptar', turnin: 'entregar', complete: 'completar' };
const MAX_NOMBRE = 120;
const sinComentario = (l) => l.replace(/\s--.*$/, '');
const sinComillas = (s) => s.trim().replace(/^"(.*)"$/, '$1').trim();
/** ¿Es una guía de Polestar? La primera línea con algo (sin los comentarios «#») es «guide …» y hay algún «step». */
export function esPolestar(texto) {
    const primera = /^(?:[ \t]*(?:#.*)?\r?\n)*[ \t]*(\S.*)$/m.exec(texto)?.[1] ?? '';
    return /^guide\s+\S/.test(primera) && /^step\b/m.test(texto);
}
// «Warrior, Rogue» -> los de la lista que son clases; con «!», todas menos esas.
function clasesDe(lista) {
    const t = lista.split(/[\s,]+/).filter(Boolean);
    const si = t.filter((x) => !x.startsWith('!')).map((x) => x.toUpperCase()).filter((x) => CLASES.includes(x));
    const no = t.filter((x) => x.startsWith('!')).map((x) => x.slice(1).toUpperCase()).filter((x) => CLASES.includes(x));
    if (si.length)
        return si;
    return no.length ? CLASES.filter((c) => !no.includes(c)) : [];
}
function razasDe(lista) {
    const t = lista.split(/[\s,]+/).filter(Boolean);
    const si = t.filter((x) => !x.startsWith('!')).map((x) => RAZAS.get(x.toLowerCase())).filter(Boolean);
    const no = t.filter((x) => x.startsWith('!')).map((x) => RAZAS.get(x.slice(1).toLowerCase())).filter(Boolean);
    if (si.length)
        return [...new Set(si)];
    return no.length ? [...new Set(RAZAS.values())].filter((r) => !no.includes(r)) : [];
}
export function guiaDePolestar(texto, { base } = {}) {
    const cab = {};
    const pasos = [];
    const zonas = [];
    const sumarZona = (u) => { if (Number.isInteger(u) && !zonas.includes(u))
        zonas.push(u); };
    const mapaDe = (nombre) => (nombre && base ? resolverZona(base, nombre)?.uiMap : undefined);
    let actual = null;
    const cerrar = () => {
        if (!actual)
            return;
        const a = actual;
        actual = null;
        const zona = a.zona ?? cab.zona;
        let punto;
        if (a.goto) {
            const { x, y, mapa } = a.goto;
            const m = mapa ?? mapaDe(zona);
            punto = Number.isInteger(m) ? { mapa: m, x, y } : zona ? { zona, x, y } : { x, y };
        }
        if (punto?.mapa)
            sumarZona(punto.mapa);
        const paso = {
            n: pasos.length + 1, texto: [a.titulo, ...a.textos].filter(Boolean).map((t) => t.replace(/[.:;,\s]+$/, '')).join('. ') + (a.textos.length ? '.' : ''),
            misiones: a.misiones, ...(punto ? { punto } : {}), ...(a.pnjs.length ? { pnjs: a.pnjs } : {}),
            ...(a.clases?.length ? { clases: a.clases } : {}), ...(a.razas?.length ? { razas: a.razas } : {}),
        };
        if (paso.texto === '' && paso.misiones.length === 0 && !punto)
            return;
        pasos.push(paso);
    };
    for (const cruda of String(texto).split(/\r?\n/)) {
        if (/^\s*#/.test(cruda) || cruda.trim() === '')
            continue;
        const sangrada = /^\s/.test(cruda);
        const linea = sinComentario(cruda).trim();
        const [orden, ...resto] = linea.split(/\s+/);
        const valor = linea.slice(orden.length).trim();
        if (!sangrada) {
            if (orden === 'step') {
                cerrar();
                actual = { titulo: valor, textos: [], misiones: [], pnjs: [] };
                continue;
            }
            cerrar();
            if (orden === 'title')
                cab.titulo ??= valor;
            else if (orden === 'faction')
                cab.faccion ??= FACCIONES[valor.toLowerCase()];
            else if (orden === 'levels') {
                const m = /^(\d{1,2})\s*-\s*(\d{1,2})\b/.exec(valor);
                if (m && !cab.niveles && Number(m[1]) >= 1 && Number(m[1]) <= Number(m[2]) && Number(m[2]) <= 80)
                    cab.niveles = [Number(m[1]), Number(m[2])];
            }
            else if (orden === 'zone') {
                cab.zona ??= valor;
                sumarZona(mapaDe(valor));
            }
            else if (orden === 'class')
                cab.clases ??= clasesDe(valor);
            else if (orden === 'race')
                cab.razas ??= razasDe(valor);
            continue;
        }
        if (!actual)
            continue;
        if (Object.hasOwn(ACCIONES, orden)) {
            const q = Number(resto[0]);
            if (Number.isInteger(q) && q >= 1 && !actual.misiones.some((m) => m.q === q && m.accion === ACCIONES[orden])) {
                actual.misiones.push({ q, accion: ACCIONES[orden] });
            }
        }
        else if (orden === 'goto' && !actual.goto) {
            const m = /^(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)(?:\s+map\s+(\d+))?/.exec(valor);
            const x = Number(m?.[1]), y = Number(m?.[2]);
            if (m && x >= 0 && x <= 100 && y >= 0 && y <= 100)
                actual.goto = { x, y, ...(m[3] ? { mapa: Number(m[3]) } : {}) };
        }
        else if (orden === 'zone') {
            actual.zona = valor;
            sumarZona(mapaDe(valor));
        }
        else if (orden === 'talk' || orden === 'kill') {
            const id = Number(resto[0]);
            if (Number.isInteger(id) && id >= 1 && !actual.pnjs.includes(id))
                actual.pnjs.push(id);
        }
        else if (orden === 'tip' || orden === 'note') {
            const t = sinComillas(valor.replace(/"\s+only\s+.*$/, '"'));
            if (t)
                actual.textos.push(t);
        }
        else if (orden === 'only') {
            actual.clases = clasesDe(valor);
            actual.razas = razasDe(valor);
        }
    }
    cerrar();
    const nombre = (cab.titulo ?? 'Polestar').slice(0, MAX_NOMBRE);
    return {
        k: 0, nombre, pasos,
        ...(cab.faccion ? { faccion: cab.faccion } : {}), ...(cab.niveles ? { niveles: cab.niveles } : {}),
        ...(zonas.length ? { zonas } : {}),
        ...(cab.clases?.length ? { clases: cab.clases } : {}), ...(cab.razas?.length ? { razas: cab.razas } : {}),
    };
}
