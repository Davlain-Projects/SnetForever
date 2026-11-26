// Servidor de herramientas: de dónde salen los datos. Todo es perezoso: al arrancar no se lee nada; el turno, la base y
// el índice de la biblioteca se leen la primera vez que una herramienta los pide. Nada de aquí escribe en disco.
//
//   crearLectorGuias({datos, fs, base: () => Base | Promise<Base>, idioma = () => 'es'})
//     -> {indice(), grupos(), grupo(id), guia(id), textoBuscable(id), pasoDeGuia(id, n), misionesBiblioteca(), lecturas()}
//   crearFuentes({datos, fs, cargar = cargarBase}) -> {turno(), base(), lector}
//
// El lector lo comparten el servidor y la app (tarea 20). Relee el índice (<datos>\biblioteca\indice.json) cuando cambian
// su fecha o su tamaño. Las guías partidas del formato addon (Rulings R8/R9): las entradas con la misma `clave` en la
// misma carpeta son UNA guía; primero la cabecera (la entrada sin `parte`) y después las partes por orden natural de
// archivo (guias_2 antes que guias_10), con los pasos numerados de 1 a N. Su id es el de la cabecera (sin cabecera, el
// de la primera parte); el id de cualquier parte vale también y contesta como la guía entera.
// Los archivos leídos se guardan en memoria por archivo + firma (mtime:size) + idioma + versión de la base.
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { leerArchivoGuia } from '../biblioteca/leer.mjs';
import { normal } from '../biblioteca/texto.mjs';
import { CARPETA_GUIAS, RUTA_INDICE } from '../biblioteca/indice.mjs';
import { cargarBase } from '../base/base.mjs';
import { rutaTurno } from './config.mjs';
const MAX_EN_MEMORIA = 200; // archivos leídos que se guardan
const firmaDe = (st) => `${st.mtimeMs}:${st.size}:${st.ino}`; // el renombre de escribirAtomico cambia el ino
const esPromesa = (v) => v && typeof v.then === 'function';
// Orden natural de dos rutas: los trozos de cifras se comparan como números.
const TROZOS = /(\d+)|(\D+)/g;
export function ordenNatural(a, b) {
    const x = String(a).match(TROZOS) ?? [];
    const y = String(b).match(TROZOS) ?? [];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        if (x[i] === y[i])
            continue;
        const nx = /^\d/.test(x[i]), ny = /^\d/.test(y[i]);
        if (nx && ny && Number(x[i]) !== Number(y[i]))
            return Number(x[i]) - Number(y[i]);
        return x[i] < y[i] ? -1 : 1;
    }
    return x.length - y.length;
}
const carpetaDe = (archivo) => (archivo.includes('/') ? archivo.slice(0, archivo.lastIndexOf('/')) : '');
// Las guías del índice ya juntadas: [{id, cabecera, miembros, pasos, zonas, misiones}] en el orden del índice; y el
// mapa de cada id (de grupo o de miembro) a su grupo.
function agrupar(entradas) {
    const grupos = [];
    const porClave = new Map();
    for (const e of entradas) {
        if (!e || typeof e.id !== 'string' || typeof e.archivo !== 'string')
            continue;
        if (typeof e.clave !== 'string') {
            grupos.push({ miembros: [e] });
            continue;
        }
        const clave = `${carpetaDe(e.archivo)}\n${e.clave}`;
        let g = porClave.get(clave);
        if (!g) {
            g = { miembros: [] };
            porClave.set(clave, g);
            grupos.push(g);
        }
        g.miembros.push(e);
    }
    const porId = new Map();
    for (const g of grupos) {
        const cabecera = g.miembros.find((e) => !e.parte);
        const partes = g.miembros.filter((e) => e.parte).sort((a, b) => ordenNatural(a.archivo, b.archivo) || a.k - b.k);
        // Una segunda cabecera con la misma clave en la misma carpeta (no debería pasar) no se junta: va sola.
        const otras = g.miembros.filter((e) => !e.parte && e !== cabecera);
        g.miembros = [...(cabecera ? [cabecera] : []), ...partes];
        for (const o of otras)
            grupos.push({ miembros: [o] });
    }
    for (const g of grupos) {
        g.cabecera = g.miembros[0];
        g.id = g.cabecera.id;
        g.pasos = g.miembros.reduce((s, e) => s + (Number.isInteger(e.pasos) ? e.pasos : 0), 0);
        g.zonas = [...new Set(g.miembros.flatMap((e) => (Array.isArray(e.zonas) ? e.zonas : [])))];
        g.misiones = [...new Set(g.miembros.flatMap((e) => (Array.isArray(e.misiones) ? e.misiones : [])))];
        for (const e of g.miembros)
            if (!porId.has(e.id))
                porId.set(e.id, g);
    }
    return { grupos, porId };
}
export function crearLectorGuias({ datos, fs = fsReal, base = () => null, idioma = () => 'es' }) {
    const carpeta = join(datos, CARPETA_GUIAS);
    const rutaIndice = join(datos, RUTA_INDICE);
    let firmaIndice = null;
    let actual = null; // {indice, grupos, porId, misiones}
    let ultimaBase = null; // con una `base` asíncrona, la última que llegó
    let pendiente = null;
    const memoria = new Map(); // archivo -> {clave, resultado}
    let lecturas = 0;
    // La base de ahora (se pide cada vez: la de la app puede cambiar). Si `base()` da una promesa, mientras llega se lee
    // con la última que llegó (o sin base); la clave de la memoria lleva la versión, así que luego se vuelve a leer.
    function baseAhora() {
        let b;
        try {
            b = base?.();
        }
        catch {
            b = null;
        }
        if (esPromesa(b)) {
            pendiente ??= b.then((v) => { ultimaBase = v ?? null; }, () => { }).finally(() => { pendiente = null; });
            return ultimaBase;
        }
        return b ?? null;
    }
    function indice() {
        let st;
        try {
            st = fs.statSync(rutaIndice);
        }
        catch {
            firmaIndice = null;
            actual = null;
            return null;
        }
        const firma = firmaDe(st);
        if (firma === firmaIndice && actual)
            return actual.indice;
        try {
            const j = JSON.parse(fs.readFileSync(rutaIndice, 'utf8'));
            if (!j || j.version !== 1 || !Array.isArray(j.guias))
                throw new Error('índice no válido');
            const { grupos, porId } = agrupar(j.guias);
            actual = { indice: { ...j, noLeidos: Array.isArray(j.noLeidos) ? j.noLeidos : [] }, grupos, porId, misiones: null };
            firmaIndice = firma;
        }
        catch {
            actual = null;
            firmaIndice = null;
            return null;
        }
        return actual.indice;
    }
    // El archivo de guía leído (de memoria si no cambió), o null.
    function leerArchivo(archivo) {
        if (typeof archivo !== 'string' || archivo === '' || archivo.split('/').some((p) => p === '..' || p === ''))
            return null;
        const ruta = join(carpeta, ...archivo.split('/'));
        let st;
        try {
            st = fs.statSync(ruta);
            if (!st.isFile())
                return null;
        }
        catch {
            return null;
        }
        const b = baseAhora();
        const lengua = idioma?.() === 'en' ? 'en' : 'es';
        const clave = `${firmaDe(st)}|${lengua}|${b?.version ?? ''}`;
        const ya = memoria.get(archivo);
        if (ya && ya.clave === clave) {
            memoria.delete(archivo); // al final: es el más reciente
            memoria.set(archivo, ya);
            return ya.resultado;
        }
        lecturas++;
        const resultado = leerArchivoGuia(ruta, { fs, base: b ?? undefined, idioma: lengua });
        memoria.set(archivo, { clave, resultado });
        if (memoria.size > MAX_EN_MEMORIA)
            memoria.delete(memoria.keys().next().value);
        return resultado;
    }
    function grupoDe(id) {
        if (typeof id !== 'string' || !indice())
            return null;
        return actual.porId.get(id) ?? null;
    }
    // La guía juntada y la clave de lo leído (las claves de memoria de sus archivos), o null.
    function juntar(id) {
        const g = grupoDe(id);
        if (!g)
            return null;
        const pasos = [];
        const claves = [];
        let primera = null;
        for (const e of g.miembros) {
            const r = leerArchivo(e.archivo);
            claves.push(`${e.archivo}|${memoria.get(e.archivo)?.clave ?? ''}`);
            const leida = r?.guias?.find((x) => x.k === e.k);
            if (!leida)
                continue;
            primera ??= leida;
            for (const p of leida.pasos ?? [])
                pasos.push({ ...p, n: pasos.length + 1 });
        }
        if (!primera)
            return null;
        const cab = g.cabecera;
        const guia = {
            ...primera,
            nombre: cab.nombre ?? primera.nombre,
            faccion: cab.faccion ?? primera.faccion,
            niveles: cab.niveles ?? primera.niveles,
            pasos,
            id: g.id,
            archivo: cab.archivo,
        };
        return { guia, clave: claves.join('\n') };
    }
    /** La guía entera (las partidas, ya juntadas) con su `id` y su `archivo` (el de la cabecera), o null. */
    const guia = (id) => juntar(id)?.guia ?? null;
    /** El texto de los pasos de una guía (con los nombres de sus misiones) ya pasado por `normal`, para buscar en él; se
     *  guarda por guía y por lo leído, así una búsqueda repetida no lo rehace. '' si no se puede leer. */
    const textos = new Map(); // id -> {clave, texto}
    function textoBuscable(id) {
        const j = juntar(id);
        if (!j)
            return '';
        const ya = textos.get(j.guia.id);
        if (ya && ya.clave === j.clave)
            return ya.texto;
        const texto = normal(j.guia.pasos.flatMap((p) => [p.texto, ...(p.misiones ?? []).map((m) => m?.nombre)]).filter(Boolean).join(' '));
        textos.delete(j.guia.id);
        textos.set(j.guia.id, { clave: j.clave, texto });
        if (textos.size > MAX_EN_MEMORIA)
            textos.delete(textos.keys().next().value);
        return texto;
    }
    const pasoDeGuia = (id, n) => (Number.isInteger(n) && n >= 1 ? guia(id)?.pasos[n - 1] ?? null : null);
    function misionesBiblioteca() {
        if (!indice())
            return new Set();
        actual.misiones ??= new Set(actual.grupos.flatMap((g) => g.misiones).filter(Number.isInteger));
        return actual.misiones;
    }
    return {
        indice,
        grupos: () => (indice() ? actual.grupos : []),
        grupo: grupoDe,
        guia,
        textoBuscable,
        pasoDeGuia,
        misionesBiblioteca,
        lecturas: () => lecturas,
    };
}
export function crearFuentes({ datos, fs = fsReal, cargar = cargarBase }) {
    let firmaTurno = null;
    let turnoActual = null;
    let baseCargada; // undefined: aún no se pidió
    function turno() {
        const ruta = rutaTurno(datos);
        let st;
        try {
            st = fs.statSync(ruta);
        }
        catch {
            return null;
        }
        const firma = firmaDe(st);
        if (firma === firmaTurno)
            return turnoActual;
        try {
            const t = JSON.parse(fs.readFileSync(ruta, 'utf8'));
            turnoActual = t && t.version === 1 && typeof t === 'object' ? t : null;
        }
        catch {
            turnoActual = null;
        }
        firmaTurno = firma;
        return turnoActual;
    }
    // La base de la carpeta del turno, una vez por proceso; sin carpeta o si no carga, null.
    function base() {
        if (baseCargada !== undefined)
            return baseCargada;
        const carpeta = turno()?.carpetaBase;
        if (typeof carpeta !== 'string' || carpeta === '')
            return null; // quizá aún no hay turno: se vuelve a mirar
        try {
            baseCargada = cargar(carpeta) ?? null;
        }
        catch {
            baseCargada = null;
        }
        return baseCargada;
    }
    const lector = crearLectorGuias({ datos, fs, base, idioma: () => turno()?.idioma ?? 'es' });
    return { turno, base, lector };
}
