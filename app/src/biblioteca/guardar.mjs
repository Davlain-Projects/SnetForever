// Biblioteca de guías: meter en la biblioteca una guía de internet (la herramienta `guardar_guia` de la IA de la app y de
// TATI), sin dar a la IA herramientas de archivos. Según lo que trae la dirección:
//   - una página web          -> se baja UNA vez y se guarda como enlace, igual que «Añadir enlace» (enlaces.mjs)
//   - un .lua, .txt o .md      -> tal cual, en guias\<nombre>\<archivo>
//   - un .zip                  -> se descomprime (zip.mjs) en guias\<nombre>\ y solo se quedan los de FORMATOS (leer.mjs:
//                                 .txt, .md, .lua, .html, .htm); lo demás (.exe, .js, imágenes…) ni se escribe
// GitHub, por sus enlaces oficiales de bajar (lo mismo que su botón; no se salta nada):
//   github.com/<dueño>/<repo>/blob/<ref>/<ruta>       -> https://raw.githubusercontent.com/<dueño>/<repo>/<ref>/<ruta>
//   github.com/<dueño>/<repo> (o .git)                -> https://github.com/<dueño>/<repo>/archive/HEAD.zip
//   github.com/<dueño>/<repo>/tree/<ref>[/<carpeta>]  -> https://github.com/<dueño>/<repo>/archive/<ref>.zip, y con carpeta
//                                                        solo se queda esa carpeta del zip (lo que cuelga de ella)
// Lo demás de GitHub (issues, wikis…) sigue siendo una página. Todo pasa las mismas comprobaciones de siempre.
// Después se reindexa la biblioteca (`reindexar`, que da el índice) POR DETRÁS: la respuesta no lo espera más de
// `esperaIndice` (ESPERA_INDICE_MS). Si acaba antes, guiasNuevas (sus guías que están en lo guardado) y MENSAJES.leida; si
// no (o no hay índice), guiasNuevas: null y MENSAJES.pendiente («Guardada; el índice la leerá en unos segundos.»), y la
// pasada sigue. Así un índice grande no hace que el relevo de TATI se rinda (app_tiempo) con la guía ya guardada.
//
//   guardarGuia({url, nombre?}, {datos, fs, obtener = obtenerPagina, reindexar?, idioma = 'es', topes = TOPES, ahora,
//                esperaIndice = ESPERA_INDICE_MS})
//     -> {ok: true, guardado: {tipo: 'pagina', enlace, archivos} | {tipo: 'archivo' | 'zip', carpeta, archivos, masArchivos?},
//         guiasNuevas: número | null, mensaje}
//      | {error: código de ERRORES, detalle: su texto en el idioma del turno}
//   archivos: rutas relativas a guias\ con «/» (30 como mucho; masArchivos, las que no caben). Nunca una ruta del PC.
//
// Seguridad:
//   - Lo bajado es solo DATO: se escribe en disco y lo lee el índice como texto; nunca se ejecuta ni se carga como código.
//   - Solo http(s) a nombres públicos (urlDePagina; motivoDeUrl dice si era de la red de casa), y la red solo por
//     `obtener` = obtenerPagina (actualizar/red.mjs), que comprueba cada redirección y la IP a la que resuelve el nombre.
//     El zip es binario, pero obtenerPagina ya da el cuerpo en bytes con su tope (maxBytes): no hace falta otra puerta.
//   - Topes (TOPES): la descarga, cada archivo, todo lo descomprimido y el número de entradas del zip. Pasarse es un
//     error y no se escribe nada.
//   - Zip slip: zip.mjs rechaza el zip entero si una entrada trae ruta absoluta, unidad, «..», enlaces o nombres raros
//     de Windows; aquí, además, cada ruta se resuelve y se comprueba que cae dentro de la carpeta nueva.
//   - Nada a medias: se escribe en una carpeta temporal NUEVA dentro de guias\ (empieza por «.», que el índice no lee) y
//     al final se mueve a su nombre con moverSinPisar (mover.mjs); si algo falla, la temporal va a la cuarentena de datos
//     (moverDentro), nunca se borra.
//   - Una carpeta que ya existe no se pisa: nombre-2, nombre-3… (y enlaces, «Mis guías» y «Del addon», que son de la
//     propia biblioteca, siempre cuentan como ocupadas).
//   - Si la web no deja bajar (401, 403, 429, 451 o 503, o una página HTML donde tenía que venir un archivo, como la
//     espera de CurseForge): {error: 'bloqueada'} y el detalle le dice al jugador que la baje él y la suelte en la carpeta
//     de guías. Nada de saltarse protecciones: las mismas dos cabeceras de siempre, sin esperas ni otras webs.
// El registro solo lleva el tipo, cuántos archivos y los códigos de error (nunca la dirección ni los nombres).
import * as fsReal from 'node:fs';
import { join, resolve, relative, isAbsolute, extname, basename, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CARPETA_GUIAS } from './indice.mjs';
import { CARPETA_ENLACES, anadirEnlace, motivoDeUrl } from './enlaces.mjs';
import { FORMATOS } from './leer.mjs';
import { leerZip, ErrorZip, RESERVADOS } from './zip.mjs';
import { obtenerPagina, urlDePagina, ErrorRed, MAX_PAGINA } from '../actualizar/red.mjs';
import { moverSinPisar, moverDentro } from '../mover.mjs';
import { cuarentenaNueva } from '../rutas.mjs';
import { log } from '../registro.mjs';
export const TOPES = Object.freeze({
    descarga: 50 * 1024 * 1024, // lo que se baja
    porArchivo: 20 * 1024 * 1024, // cada archivo guardado (descomprimido)
    total: 100 * 1024 * 1024, // todo lo descomprimido de un zip
    archivos: 2000, // entradas de un zip
});
export const MAX_URL = 2048;
export const MAX_NOMBRE = 60;
export const MAX_LISTA = 30;
const TIEMPO_MS = 40_000; // el relevo de TATI espera 60 s el resultado (bajar y guardar; el índice va por detrás)
/** Lo que la respuesta espera a la reindexación antes de contestar sin la cuenta (ms). */
export const ESPERA_INDICE_MS = 5000;
const GITHUB = new Set(['github.com', 'www.github.com']);
// Primeros trozos de github.com que no son un dueño de repositorio.
const NO_DUENOS = new Set(['orgs', 'settings', 'marketplace', 'topics', 'search', 'features', 'sponsors', 'login', 'about',
    'pricing', 'explore', 'notifications', 'apps', 'collections', 'enterprise', 'users', 'organizations', 'trending', 'new']);
const SUELTOS = new Set(['.lua', '.txt', '.md']);
const BLOQUEOS = new Set([401, 403, 429, 451, 503]);
const DE_LA_BIBLIOTECA = new Set([CARPETA_ENLACES, 'mis guías', 'del addon']); // enlaces.mjs y copia.mjs
const GENERICOS = /^(?:main|master|trunk|head|latest|download|downloads|file|files|archive|archives|refs|heads|tags|releases|raw|blob|tree|zip|zipball|tarball|index|v?\d[\d.]*)$/i;
const PARECE_HTML = /^\s*<(?:!doctype\s+html|html|head|body)\b/i;
/** Los textos de cada error (sin rutas del PC), en español y en inglés. */
export const ERRORES = Object.freeze({
    es: Object.freeze({
        argumentos: 'Falta la dirección de la guía: una página de internet o un .lua, .txt, .md o .zip.',
        url: 'Esa dirección no vale: tiene que ser de internet (http o https), sin usuario ni puerto.',
        red_local: 'Esa dirección es de este PC o de la red de casa: solo se guardan guías de internet.',
        bloqueada: 'La web no deja que la app baje la guía. Bájala tú desde el navegador y suéltala en la carpeta de guías '
            + '(menú de SnetForever, «Abrir la carpeta de guías»): la app la lee sola.',
        estado: 'La web contestó con un error: esa página no existe o no está disponible ahora.',
        tiempo: 'La web tardó demasiado en contestar; prueba más tarde.',
        conexion: 'No se pudo conectar con la web.',
        tamano: 'Es demasiado grande: la descarga pasa de 50 MB o lo descomprimido pasa del tope.',
        demasiados_archivos: 'El zip trae demasiados archivos (más de 2000).',
        zip: 'El zip no se puede abrir: está dañado o usa algo que la app no lee (cifrado, zip64…).',
        zip_peligroso: 'El zip trae rutas peligrosas (fuera de su carpeta, con unidad o enlaces): no se ha guardado nada.',
        sin_guias: 'El zip no trae ninguna guía (.lua, .txt, .md o .html).',
        formato: 'Lo bajado no es una guía que la app sepa guardar (una página, un .lua, .txt o .md, o un .zip).',
        vacio: 'La página no trae texto que guardar.',
        escritura: 'No se pudo guardar en la carpeta de guías; no ha quedado nada a medias.',
    }),
    en: Object.freeze({
        argumentos: 'The guide\'s address is missing: a web page or a .lua, .txt, .md or .zip file.',
        url: 'That address is not valid: it must be on the internet (http or https), with no user or port.',
        red_local: 'That address is on this PC or the home network: only guides from the internet are saved.',
        bloqueada: 'The website does not let the app download the guide. Download it yourself in the browser and drop it in '
            + 'the guides folder (SnetForever menu, "Open the guides folder"): the app reads it by itself.',
        estado: 'The website answered with an error: that page does not exist or is not available now.',
        tiempo: 'The website took too long to answer; try again later.',
        conexion: 'Could not connect to the website.',
        tamano: 'It is too big: the download is over 50 MB or the unpacked files are over the limit.',
        demasiados_archivos: 'The zip has too many files (more than 2000).',
        zip: 'The zip cannot be opened: it is damaged or uses something the app does not read (encryption, zip64…).',
        zip_peligroso: 'The zip has dangerous paths (outside its folder, with a drive or links): nothing was saved.',
        sin_guias: 'The zip has no guides (.lua, .txt, .md or .html).',
        formato: 'The download is not a guide the app can save (a page, a .lua, .txt or .md file, or a .zip).',
        vacio: 'The page has no text to save.',
        escritura: 'Could not save to the guides folder; nothing was left half-done.',
    }),
});
/** Lo que dice una respuesta buena: si el índice ya leyó la guía o la leerá en unos segundos. */
export const MENSAJES = Object.freeze({
    es: Object.freeze({ pendiente: 'Guardada; el índice la leerá en unos segundos.', leida: 'Guardada; el índice ya la ha leído.' }),
    en: Object.freeze({ pendiente: 'Saved; the index will read it in a few seconds.', leida: 'Saved; the index has already read it.' }),
});
const fallo = (codigo, idioma) => ({ error: codigo, detalle: (ERRORES[idioma] ?? ERRORES.es)[codigo] });
/** Un nombre de carpeta seguro: sin barras ni caracteres raros, sin «..», sin nombres reservados de Windows y corto. */
export function nombreSeguro(texto) {
    let t = String(texto ?? '').normalize('NFC')
        .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, ' ')
        .replace(/\.{2,}/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s.]+|[\s.]+$/g, '');
    t = Array.from(t).slice(0, MAX_NOMBRE).join('').replace(/[\s.]+$/, '');
    if (t === '')
        return 'guia';
    return RESERVADOS.test(t) ? `guia-${t}` : t;
}
const trozosDe = (url) => new URL(url).pathname.split('/').filter((t) => t !== '').map((t) => {
    try {
        return decodeURIComponent(t);
    }
    catch {
        return t;
    }
});
const extensionDe = (url) => extname(trozosDe(url).at(-1) ?? '').toLowerCase();
// El nombre que sale de la url: el último trozo con sentido (sin «main», «download», números…), sin su extensión.
function nombreDeUrl(url) {
    for (const t of trozosDe(url).reverse()) {
        const sin = t.slice(0, t.length - extname(t).length) || t;
        if (!GENERICOS.test(sin) && nombreSeguro(sin) !== 'guia')
            return sin;
    }
    return new URL(url).hostname.replace(/^www\./, '');
}
// ¿Qué se espera de la url? 'zip', 'archivo' (un .lua/.txt/.md), 'descarga' (un enlace de bajar sin extensión) o 'pagina'.
function esperado(url) {
    const ext = extensionDe(url);
    if (ext === '.zip')
        return 'zip';
    if (SUELTOS.has(ext))
        return 'archivo';
    return trozosDe(url).some((t) => /^downloads?$/i.test(t)) ? 'descarga' : 'pagina';
}
const esZip = (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && ((b[2] === 3 && b[3] === 4) || (b[2] === 5 && b[3] === 6));
const esHtml = (b, tipo) => /html/i.test(String(tipo ?? '')) || PARECE_HTML.test(b.subarray(0, 1024).toString('latin1').replace(/^\xEF\xBB\xBF/, ''));
// Por qué no vale una dirección: la de la red de casa (también con puerto, como http://localhost:8080) o mal escrita.
function motivoDe(texto) {
    try {
        const u = new URL(texto);
        if ((u.protocol === 'http:' || u.protocol === 'https:') && u.port !== '') {
            u.port = '';
            return motivoDeUrl(u.href);
        }
    }
    catch {
        // mal escrita: lo dice motivoDeUrl
    }
    return motivoDeUrl(texto);
}
function codigoDeRed(e) {
    const c = e instanceof ErrorRed ? e.code : 'conexion';
    if (c === 'estado')
        return BLOQUEOS.has(e.estado) ? 'bloqueada' : 'estado';
    return ['url', 'red_local', 'tamano', 'tiempo'].includes(c) ? c : 'conexion';
}
const CODIGOS_ZIP = { zip: 'zip', peligroso: 'zip_peligroso', demasiados: 'demasiados_archivos', tamano: 'tamano' };
function existeAlgo(fs, ruta) {
    try {
        fs.lstatSync(ruta);
        return true;
    }
    catch {
        return false;
    }
}
// El primer nombre libre en guias\: nombre, nombre-2, nombre-3…
function carpetaLibre(fs, raiz, nombre) {
    for (let i = 1; i <= 999; i++) {
        const n = i === 1 ? nombre : `${nombre}-${i}`;
        if (!DE_LA_BIBLIOTECA.has(n.toLocaleLowerCase('es')) && !existeAlgo(fs, join(raiz, n)))
            return n;
    }
    return null;
}
// Escribe `archivos` ([{ruta, datos}]) en una carpeta temporal nueva de guias\ y la mueve a guias\<nombre libre>.
// Devuelve el nombre final; si algo falla, la temporal va a la cuarentena y lanza.
function escribirCarpeta(fs, datos, nombre, archivos) {
    const raiz = join(datos, CARPETA_GUIAS);
    fs.mkdirSync(raiz, { recursive: true });
    const libre = carpetaLibre(fs, raiz, nombre);
    if (libre === null)
        throw Object.assign(new Error('sin nombre libre'), { code: 'EEXIST' });
    const temporal = join(raiz, `.guardando-${process.pid}-${randomBytes(4).toString('hex')}`);
    fs.mkdirSync(temporal); // nueva y vacía: si ya existe, falla
    try {
        for (const { ruta, datos: contenido } of archivos) {
            const destino = resolve(temporal, ...ruta.split('/'));
            const r = relative(temporal, destino);
            if (r === '' || r === '..' || r.startsWith(`..${'\\'}`) || r.startsWith('../') || isAbsolute(r)) {
                throw new ErrorZip('peligroso', 'ruta fuera de la carpeta');
            }
            fs.mkdirSync(dirname(destino), { recursive: true });
            fs.writeFileSync(destino, contenido, { flag: 'wx' });
        }
        return basename(moverSinPisar(temporal, join(raiz, libre)));
    }
    catch (e) {
        try {
            moverDentro(temporal, cuarentenaNueva({ ...process.env, SNF_DATOS: datos }));
        }
        catch {
            // sin cuarentena: la temporal empieza por «.» y el índice no la lee
        }
        throw e;
    }
}
const decodificar = (t) => {
    try {
        return decodeURIComponent(t);
    }
    catch {
        return t;
    }
};
// Una dirección de GitHub por su enlace oficial de bajar: {url, nombre?, subcarpeta?: [trozos]} o null (se pide tal cual).
function deGithub(url) {
    const u = new URL(url);
    if (!GITHUB.has(u.hostname))
        return null;
    const t = u.pathname.split('/').filter((x) => x !== '');
    if (t.length < 2 || NO_DUENOS.has(t[0].toLowerCase()))
        return null;
    const [dueno] = t;
    const repo = t[1].replace(/\.git$/i, '');
    if (repo === '')
        return null;
    const base = `https://github.com/${dueno}/${repo}`;
    if (t.length === 2)
        return { url: `${base}/archive/HEAD.zip`, nombre: decodificar(repo) };
    if (t[2] === 'blob' && t.length >= 5)
        return { url: `https://raw.githubusercontent.com/${dueno}/${repo}/${t.slice(3).join('/')}` };
    if (t[2] === 'tree' && t.length >= 4) {
        const subcarpeta = t.slice(4).map(decodificar);
        return { url: `${base}/archive/${t[3]}.zip`, nombre: subcarpeta.at(-1) ?? decodificar(repo), subcarpeta };
    }
    return null;
}
async function contarGuias(reindexar, dentro) {
    if (typeof reindexar !== 'function')
        return null;
    try {
        const ind = await reindexar();
        if (!ind || !Array.isArray(ind.guias))
            return null;
        return ind.guias.filter((g) => typeof g?.archivo === 'string' && dentro(g.archivo)).length;
    }
    catch {
        return null;
    }
}
const PLAZO = Symbol('plazo');
// La cuenta de guías si la reindexación acaba dentro de `espera` ms; si no, null (y la pasada sigue por detrás).
async function contarSinEsperar(reindexar, dentro, espera) {
    const cuenta = contarGuias(reindexar, dentro); // nunca se rechaza
    let reloj;
    const plazo = new Promise((r) => { reloj = setTimeout(() => r(PLAZO), espera); });
    const n = await Promise.race([cuenta, plazo]);
    clearTimeout(reloj);
    return n === PLAZO ? null : n;
}
export async function guardarGuia(args, { datos, fs = fsReal, obtener = obtenerPagina, reindexar = null, idioma = 'es', topes = TOPES, ahora = Date.now, esperaIndice = ESPERA_INDICE_MS, } = {}) {
    const lengua = idioma === 'en' ? 'en' : 'es';
    const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const texto = typeof a.url === 'string' ? a.url.trim() : '';
    if (texto === '' || texto.length > MAX_URL)
        return fallo('argumentos', lengua);
    if (a.nombre !== undefined && a.nombre !== null && (typeof a.nombre !== 'string' || a.nombre.length > 200))
        return fallo('argumentos', lengua);
    const pedida = urlDePagina(texto);
    if (pedida === null)
        return fallo(motivoDe(texto), lengua);
    const github = deGithub(pedida);
    const url = github ? urlDePagina(github.url) : pedida;
    if (url === null)
        return fallo('url', lengua);
    const bien = (guardado, guiasNuevas) => ({ ok: true, guardado, guiasNuevas, mensaje: MENSAJES[lengua][guiasNuevas === null ? 'pendiente' : 'leida'] });
    const terminar = (r) => {
        log(r.error ? 'aviso' : 'info', r.error ? `biblioteca: guardar_guia ${r.error}`
            : `biblioteca: guardar_guia ${r.guardado.tipo} (${r.guardado.archivos.length + (r.guardado.masArchivos ?? 0)} archivos, ${r.guiasNuevas ?? '?'} guías)`);
        return r;
    };
    let pagina;
    try {
        pagina = await obtener(url, { maxBytes: topes.descarga, tiempoMax: TIEMPO_MS });
    }
    catch (e) {
        return terminar(fallo(codigoDeRed(e), lengua));
    }
    const cuerpo = Buffer.isBuffer(pagina?.cuerpo) ? pagina.cuerpo : Buffer.from(pagina?.cuerpo ?? '');
    const final = typeof pagina?.url === 'string' ? pagina.url : url;
    const espera = esperado(url);
    let tipo;
    if (esZip(cuerpo))
        tipo = 'zip';
    else if (espera !== 'pagina' && esHtml(cuerpo, pagina?.tipo))
        return terminar(fallo('bloqueada', lengua));
    else if (espera === 'zip')
        return terminar(fallo('zip', lengua));
    else if (espera === 'archivo' || (espera === 'descarga' && SUELTOS.has(extensionDe(final))))
        tipo = 'archivo';
    else if (espera === 'descarga')
        return terminar(fallo('formato', lengua));
    else
        tipo = 'pagina';
    if (tipo === 'pagina') {
        if (cuerpo.length > MAX_PAGINA)
            return terminar(fallo('tamano', lengua));
        const r = await anadirEnlace(url, { datos, fs, obtener: async () => ({ ...pagina, cuerpo }), ahora });
        if (!r.ok)
            return terminar(fallo(r.motivo === 'vacio' ? 'vacio' : r.motivo === 'conexion' ? 'escritura' : r.motivo, lengua));
        const guiasNuevas = await contarSinEsperar(reindexar, (archivo) => archivo === r.archivo, esperaIndice);
        return terminar(bien({ tipo, enlace: r.archivo, archivos: [r.archivo] }, guiasNuevas));
    }
    let archivos;
    if (tipo === 'archivo') {
        if (cuerpo.length > topes.porArchivo)
            return terminar(fallo('tamano', lengua));
        const de = SUELTOS.has(extensionDe(url)) ? url : final;
        const ext = extensionDe(de);
        const original = trozosDe(de).at(-1) ?? `guia${ext}`;
        archivos = [{ ruta: `${nombreSeguro(original.slice(0, original.length - ext.length))}${ext}`, datos: cuerpo }];
    }
    else {
        // Con subcarpeta (un «tree» de GitHub): solo lo que cuelga de <raíz del zip>/<subcarpeta>/, sin ese principio.
        const sub = github?.subcarpeta ?? [];
        const deSub = (ruta) => {
            const t = ruta.split('/');
            return t.length > sub.length + 1 && sub.every((x, i) => t[i + 1] === x);
        };
        const quedarse = (ruta) => FORMATOS.includes(extname(ruta).toLowerCase()) && (sub.length === 0 || deSub(ruta));
        try {
            archivos = leerZip(cuerpo, { topes, quedarse }).archivos;
            if (sub.length > 0)
                archivos = archivos.map((x) => ({ ...x, ruta: x.ruta.split('/').slice(sub.length + 1).join('/') }));
        }
        catch (e) {
            return terminar(fallo(e instanceof ErrorZip ? CODIGOS_ZIP[e.code] ?? 'zip' : 'zip', lengua));
        }
        if (archivos.length === 0)
            return terminar(fallo('sin_guias', lengua));
    }
    let carpeta;
    try {
        const propio = typeof a.nombre === 'string' && a.nombre.trim() !== '' ? a.nombre : null;
        carpeta = escribirCarpeta(fs, datos, nombreSeguro(propio ?? github?.nombre ?? nombreDeUrl(url)), archivos);
    }
    catch (e) {
        return terminar(fallo(e instanceof ErrorZip ? 'zip_peligroso' : 'escritura', lengua));
    }
    const rutas = archivos.map((x) => `${carpeta}/${x.ruta}`);
    const guiasNuevas = await contarSinEsperar(reindexar, (archivo) => archivo.startsWith(`${carpeta}/`), esperaIndice);
    const guardado = { tipo, carpeta, archivos: rutas.slice(0, MAX_LISTA) };
    if (rutas.length > MAX_LISTA)
        guardado.masArchivos = rutas.length - MAX_LISTA;
    return terminar(bien(guardado, guiasNuevas));
}
