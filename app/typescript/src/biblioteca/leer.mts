// Biblioteca de guías: leer un archivo de la carpeta de la biblioteca (.txt, .md, .lua, .html, .htm y las páginas
// guardadas) y sacar de él guías con pasos. Nunca lanza: lo que no se puede leer vuelve como {noLeido: motivo}.
//
//   leerArchivoGuia(ruta, {fs, base?, idioma}) -> {formato, guias: GuiaLeida[]} | {noLeido}
//   formato: 'texto' | 'html' | 'pagina' | 'misguias' | 'addon' | 'restedxp' | '4ever' | 'factoruide' | 'polestar'
//   (de 4Ever Leveling, Factoruide y Polestar: ver cuatroever.mjs, factoruide.mjs y polestar.mjs; sus guías traen `clases` / `razas` y, las de
//   4Ever, también `sinLeer`: [{parte, motivo}] con los capítulos que no se entienden)
//   noLeido: 'formato' | 'pdf' | 'imagen' | 'grande' | 'ilegible' | 'vacio'
//   GuiaLeida = {k, nombre, faccion?, niveles?, pasos: Paso[], url?, bajada?, clave?, parte?, zonas?}   (k: el orden dentro del archivo, desde 0)
//   zonas: los uiMaps que nombra el texto (texto, HTML, páginas y RestedXP; ver pasosDeTexto), solo para el índice.
//   clave: la de la guía en SNF_MISIONES.guias / SNF_RUTAS.guias (solo el formato addon); parte: true si el archivo solo
//   trae pasos de una guía cuya cabecera está en otro (las guías partidas de SnetForever_Rutas; Ruling R8).
//
// Nada se inventa: una misión o una coordenada solo sale si el archivo la trae (o, en texto libre, si casa con la base).
// Las zonas con nombre se pasan a `mapa` con resolverZona si hay base; si no se resuelven, el punto se queda sin `mapa`.
import { extname, basename } from 'node:path';
import { decodificar, htmlATexto, pasosDeTexto } from './texto.mjs';
import { ejecutarDatos, leerVariablesGuardadas, entradas } from '../base/leer-lua.mjs';
import { resolverZona } from '../rutaZona.mjs';
import { es4Ever, guiasDe4Ever } from './cuatroever.mjs';
import { guiaDeFactoruide } from './factoruide.mjs';
import { esPolestar, guiaDePolestar } from './polestar.mjs';
import { clasesYRazasDePaso } from '../misguias.mjs';

export const MAX_ARCHIVO = 50 * 1024 * 1024;
export const FORMATOS = ['.txt', '.md', '.lua', '.html', '.htm'];
export const FORMATOS_FACTORUIDE = ['.fgguide', '.bqroute']; // un JSON (factoruide.mjs)

const IMAGENES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg', '.ico']);
const MAX_NOMBRE = 120;

// ------------------------------------------------------------------------------------------------------------------
// Piezas comunes
// ------------------------------------------------------------------------------------------------------------------

const FACCIONES = { horda: 'Horde', horde: 'Horde', alianza: 'Alliance', alliance: 'Alliance' };
const faccionDe = (v) => (typeof v === 'string' ? FACCIONES[v.trim().toLowerCase()] : undefined);

function nivelesDe(v) {
  const [a, b] = Array.isArray(v) ? v : v && typeof v === 'object' ? [v.min ?? v[1], v.max ?? v[2]] : [];
  return Number.isInteger(a) && Number.isInteger(b) && a >= 1 && a <= b && b <= 80 ? [a, b] : undefined;
}

const ARTE = /\|c(?:RXP_[A-Za-z]+_|[0-9a-fA-F]{8})|\|r|\|T[^|]*\|t/g; // códigos de color y de icono del juego
const limpio = (s) => String(s).replace(ARTE, '').replace(/\s+/g, ' ').trim();

// Un texto que puede venir suelto o como {es, en}: el del idioma, y si no el otro.
function textoDe(v, idioma) {
  if (typeof v === 'string') return limpio(v);
  if (v && typeof v === 'object') {
    const t = v[idioma] ?? v.es ?? v.en;
    return typeof t === 'string' ? limpio(t) : '';
  }
  return '';
}

// El mismo texto en inglés, si la fuente lo trae ({es, en} con `en` escrito); si no, null. Nunca se traduce.
function textoEnDe(v) {
  const t = v && typeof v === 'object' ? v.en : undefined;
  return typeof t === 'string' && limpio(t) !== '' ? limpio(t) : null;
}

const recorta = (s) => (s.length > MAX_NOMBRE ? s.slice(0, MAX_NOMBRE) : s);

// El punto {mapa?, zona?, x, y} de un mapa (número o nombre), x e y; null si x o y no valen.
function puntoDe(mapa, x, y, base) {
  if (typeof x !== 'number' || typeof y !== 'number' || !(x >= 0 && x <= 100) || !(y >= 0 && y <= 100)) return null;
  if (typeof mapa === 'number' && Number.isInteger(mapa) && mapa >= 1) return { mapa, x, y };
  if (typeof mapa === 'string' && mapa.trim() !== '') {
    const z = base ? resolverZona(base, mapa) : null;
    return z ? { mapa: z.uiMap, x, y } : { zona: mapa.trim(), x, y };
  }
  return { x, y };
}

const ACCIONES_ES = { aceptar: 'Aceptar', completar: 'Completar', entregar: 'Entregar' };
const ACCIONES_EN = { aceptar: 'Accept', completar: 'Complete', entregar: 'Turn in' };

// Texto de un paso que solo trae misiones y/o un punto: «Aceptar Nombre», «Ir a 50, 60».
function textoGenerado(misiones, punto, base, idioma) {
  const verbos = idioma === 'en' ? ACCIONES_EN : ACCIONES_ES;
  const partes = misiones.map((m) => {
    let nombre = m.nombre;
    if (!nombre && base) { try { nombre = base.nombre('quest', m.q, idioma); } catch { nombre = undefined; } }
    return `${verbos[m.accion]} ${nombre || m.q}`;
  });
  if (punto) partes.push(`${idioma === 'en' ? 'Go to' : 'Ir a'} ${punto.x}, ${punto.y}`);
  return partes.join('. ');
}

// `enes`: el inglés de cada texto de `textos` (null si la fuente no lo trae). Solo si TODOS los textos con contenido lo
// traen, el paso lleva `textoEn` (el texto junto, en inglés); si falta alguno, no (ni se mezclan ni se traduce).
function pasoDe(n, textos, misiones, punto, base, idioma, enes = []): { n: number; texto: string; misiones: any[]; punto?: any; textoEn?: string; pnjs?: number[] } | null {
  const texto = textos.filter(Boolean).join(' ') || textoGenerado(misiones, punto, base, idioma);
  if (texto === '' && misiones.length === 0 && !punto) return null;
  const conTexto = textos.map((t, i) => [t, enes[i] ?? null]).filter(([t]) => t);
  const textoEn = conTexto.length > 0 && conTexto.every(([, e]) => e) ? conTexto.map(([, e]) => e).join(' ') : null;
  return { n, texto, misiones, ...(punto ? { punto } : {}), ...(textoEn ? { textoEn } : {}) };
}

const numeros = (v) => (Array.isArray(v) ? v : typeof v === 'number' ? [v] : v && typeof v === 'object' ? entradas(v).map(([, q]) => q) : []);
const esEntero = (v) => Number.isInteger(v) && v >= 1;

// ------------------------------------------------------------------------------------------------------------------
// «Mis guías» (la global SnetForeverMisGuias del addon SnetForever_MisGuias)
// ------------------------------------------------------------------------------------------------------------------

function guiasDeMisGuias(lista, base, idioma) {
  const guias = [];
  for (const [, datos] of entradas(lista)) {
    if (!datos || typeof datos !== 'object') continue;
    // Ronda 2: la clase o la raza de la guía entera (su facción va aparte, como siempre); con un nombre raro, fuera.
    const deGuia = clasesYRazasDePaso(datos, { sinFaccion: true });
    if (deGuia === false || deGuia.clases?.length === 0 || deGuia.razas?.length === 0) continue;
    const pasos = [];
    for (const [, p] of entradas(datos.pasos)) {
      if (!p || typeof p !== 'object') continue;
      // 17-nov: clase, raza y facción del paso, como `clases` / `razas` (leer_guia no lo enseña a otra clase o raza); con
      // un nombre que no se entiende o que no vale para nadie, fuera (el addon tampoco lo usa).
      const para = clasesYRazasDePaso(p);
      if (para === false || para.clases?.length === 0 || para.razas?.length === 0 || para.facciones?.length === 0) continue;
      const misiones = [];
      for (const accion of ['aceptar', 'completar', 'entregar']) {
        for (const q of numeros(p[accion]).filter(esEntero)) {
          misiones.push({ q, accion, ...(accion === 'completar' && esEntero(p.objetivo) ? { objetivo: p.objetivo } : {}) });
        }
      }
      const [mapa, x, y] = Array.isArray(p.ir) ? p.ir : [];
      const paso = pasoDe(pasos.length + 1, [textoDe(p.texto, idioma)], misiones, puntoDe(mapa, x, y, base), base, idioma, [textoEnDe(p.texto)]);
      if (paso) pasos.push({ ...paso, ...para });
    }
    const nombre = textoDe(datos.nombre, idioma);
    guias.push({
      k: guias.length, nombre: recorta(nombre || `Guía ${guias.length + 1}`), pasos,
      ...(faccionDe(datos.faccion) ? { faccion: faccionDe(datos.faccion) } : {}),
      ...(nivelesDe(datos.niveles) ? { niveles: nivelesDe(datos.niveles) } : {}),
      ...deGuia,
    });
  }
  return guias;
}

// ------------------------------------------------------------------------------------------------------------------
// Guías de los addons SnetForever_Misiones y SnetForever_Rutas (local T = SNF_MISIONES.guias / SNF_RUTAS.guias)
// ------------------------------------------------------------------------------------------------------------------

const ELEMENTOS = { accept: 'aceptar', complete: 'completar', turnin: 'entregar' };

// Las guías partidas (Ruling R8): un archivo que solo trae los pasos de una guía cuya cabecera está en otro empieza con
// `local T = SNF_RUTAS.guias["<clave>"].pasos`. Esas claves se siembran como {pasos: {}} antes de ejecutar el archivo.
const RAIZ_PARTIDA = /\blocal\s+[A-Za-z_]\w*\s*=\s*(SNF_MISIONES|SNF_RUTAS)\s*\.\s*guias\s*\[\s*"((?:[^"\\\r\n]|\\.)*)"\s*\]/g;

// La clave tal cual la lee el intérprete (mismos escapes: \\ \" \ddd…): se le pasa una tabla con esa sola clave.
function claveLua(cruda) {
  const t = ejecutarDatos(`SNF_MISIONES = {["${cruda}"] = {}}`, {}, 'clave.lua').SNF_MISIONES;
  return Object.keys(t)[0];
}

// Pone sin tocar el prototipo (una clave «__proto__» es una clave más).
const poner = (objeto, clave, valor) => Object.defineProperty(objeto, clave, { value: valor, writable: true, enumerable: true, configurable: true });

// Lo que se sabe de una guía partida por su clave: «Grupo (A)\01-09 Nombre» -> nombre, facción y niveles.
function datosDeClave(clave) {
  const nombre = clave.slice(clave.lastIndexOf('\\') + 1).trim();
  const f = /\((A|H)\)/.exec(clave)?.[1];
  const n = /^(\d{1,2})\s*-\s*(\d{1,2})(?!\d)/.exec(nombre);
  const niveles = n ? nivelesDe([Number(n[1]), Number(n[2])]) : undefined;
  return { nombre, ...(f ? { faccion: f === 'A' ? 'Alliance' : 'Horde' } : {}), ...(niveles ? { niveles } : {}) };
}

function guiasDeAddon(texto, base, idioma) {
  const inicio = { SNF_MISIONES: { guias: {} }, SNF_RUTAS: { guias: {}, alias: {} } };
  const semillas = new Set();
  for (const m of texto.matchAll(RAIZ_PARTIDA)) {
    const clave = claveLua(m[2]);
    if (typeof clave !== 'string' || Object.hasOwn(inicio[m[1]].guias, clave)) continue;
    const semilla = { pasos: {} };
    poner(inicio[m[1]].guias, clave, semilla);
    semillas.add(semilla);
  }
  const raiz = ejecutarDatos(texto, inicio, 'guias.lua');
  const guias = [];
  for (const origen of ['SNF_MISIONES', 'SNF_RUTAS']) {
    for (const [k, datos] of entradas(raiz[origen]?.guias)) {
      if (!datos || typeof datos !== 'object') continue;
      const clave = typeof k === 'string' ? k : typeof datos.clave === 'string' && datos.clave !== '' ? datos.clave : String(k);
      const parte = semillas.has(datos); // la cabecera no estaba en este archivo
      const pasos = [];
      for (const [, p] of entradas(datos.pasos)) {
        if (!p || typeof p !== 'object') continue;
        const misiones = [], textos = [], enes = [];
        let punto = null;
        for (const [, e] of entradas(p.elementos)) {
          if (!e || typeof e !== 'object') continue;
          if (Object.hasOwn(ELEMENTOS, e.t)) {
            if (esEntero(e.q)) misiones.push({ q: e.q, accion: ELEMENTOS[e.t], ...(e.t === 'complete' && esEntero(e.objetivo) ? { objetivo: e.objetivo } : {}) });
          } else if (e.t === 'goto') punto ??= puntoDe(e.mapa, e.x, e.y, base);
          else if (e.t === 'nota' || e.t === 'manual') { textos.push(textoDe(e.texto, idioma)); enes.push(textoEnDe(e.texto)); }
        }
        const paso = pasoDe(pasos.length + 1, textos, misiones, punto, base, idioma, enes);
        if (paso) pasos.push(paso);
      }
      if (parte) {
        const d = datosDeClave(clave);
        guias.push({ k: guias.length, clave, parte: true, nombre: recorta(limpio(d.nombre) || `Guía ${guias.length + 1}`), pasos,
          ...(d.faccion ? { faccion: d.faccion } : {}), ...(d.niveles ? { niveles: d.niveles } : {}) });
        continue;
      }
      const nombre = textoDe(datos.titulo, idioma) || textoDe(datos.nombre, idioma) || textoDe(datos.clave, idioma);
      guias.push({
        k: guias.length, clave, nombre: recorta(nombre || `Guía ${guias.length + 1}`), pasos,
        ...(faccionDe(datos.faccion) ? { faccion: faccionDe(datos.faccion) } : {}),
        ...(nivelesDe(datos.niveles) ? { niveles: nivelesDe(datos.niveles) } : {}),
      });
    }
  }
  return guias;
}

// ------------------------------------------------------------------------------------------------------------------
// RestedXP (RXPGuides.RegisterGuide([[ ... ]])): un paso por cada «step»
// ------------------------------------------------------------------------------------------------------------------

const REGISTRO = /RegisterGuide\s*\(\s*(?:"[^"]*"\s*,\s*|'[^']*'\s*,\s*)?\[(=*)\[([\s\S]*?)\]\1\]/g;
const MARCA = '\u0001paso';

// Lo que se lee de una línea de RestedXP: tras «>>», o la línea sin su orden «.xxx» si no hay texto.
function textoDeLineaRXP(linea) {
  const t = linea.trim();
  if (t.startsWith('>>')) return t.slice(2).trim();
  const i = t.indexOf('>>');
  if (i >= 0) return t.slice(i + 2).trim();
  return /^\./.test(t) ? '' : t;
}

function guiaDeRestedXP(cuerpo, k, base, idioma) {
  let nombre, faccion;
  const lineas = [];
  for (const cruda of cuerpo.split(/\r?\n/)) {
    const l = cruda.trim();
    const cab = /^#\s*name\s+(.+)$/i.exec(l);
    if (cab) { nombre = limpio(cab[1]); continue; }
    if (l.startsWith('#')) continue;
    const f = /^<<\s*(.+)$/.exec(l);
    if (f) { faccion ??= faccionDe(f[1].split(/[\s/,]+/).find((w) => faccionDe(w))); continue; }
    lineas.push(/^step\b/i.test(l) ? MARCA : l);
  }
  const { pasos: sueltos, zonas } = pasosDeTexto(lineas.join('\n'), { base, idioma });
  const pasos = [];
  let actual = null;
  const cerrar = () => {
    if (!actual) return;
    const paso = pasoDe(pasos.length + 1, actual.textos, actual.misiones, actual.punto, base, idioma);
    if (paso) { if (actual.pnjs.size) paso.pnjs = [...actual.pnjs]; pasos.push(paso); }
    actual = null;
  };
  const nuevo = () => ({ textos: [], misiones: [], punto: null, pnjs: new Set() });
  for (const s of sueltos) {
    if (s.texto === MARCA) { cerrar(); actual = nuevo(); continue; }
    actual ??= nuevo();
    const linea = s.texto;
    actual.textos.push(limpio(textoDeLineaRXP(linea)));
    actual.misiones.push(...s.misiones);
    actual.punto ??= s.punto ?? null;
    for (const id of s.pnjs ?? []) actual.pnjs.add(id);
  }
  cerrar();
  return { k, nombre: recorta(nombre || `Guía ${k + 1}`), pasos, ...(faccion ? { faccion } : {}), ...(zonas ? { zonas } : {}) };
}

// ------------------------------------------------------------------------------------------------------------------
// Texto, HTML y páginas guardadas
// ------------------------------------------------------------------------------------------------------------------

const CABECERA_PAGINA = /^#\s*(Direcci[oó]n|Address|URL|Bajada|Downloaded)\s*:\s*(.*)$/i;
const PARECE_HTML = /<\/?(?:html|body|p|div|h[1-6]|li|br)\b/i;

// Una página guardada empieza con líneas «# Dirección: …» y «# Bajada: …»; el resto es su texto (o HTML).
function cabeceraDePagina(texto) {
  const lineas = texto.split(/\r?\n/);
  let i = 0;
  const datos: { url?: string; bajada?: string; } = {};
  while (i < lineas.length) {
    const m = CABECERA_PAGINA.exec(lineas[i].trim());
    if (!m) break;
    if (/^(direcci|address|url)/i.test(m[1])) datos.url = m[2].trim(); else datos.bajada = m[2].trim();
    i++;
  }
  return datos.url === undefined ? null : { ...datos, cuerpo: lineas.slice(i).join('\n') };
}

function guiaDeTexto(texto, ruta, base, idioma, extra: { titulo?: any; } = {}) {
  const r = pasosDeTexto(texto, { base, idioma });
  const titulo = extra.titulo ? limpio(extra.titulo) : '';
  const nombre = r.nombre ?? (titulo || basename(ruta, extname(ruta)));
  const { titulo: _t, ...resto } = extra;
  return {
    k: 0, nombre: recorta(nombre), pasos: r.pasos,
    ...(r.faccion ? { faccion: r.faccion } : {}), ...(r.niveles ? { niveles: r.niveles } : {}),
    ...(r.zonas ? { zonas: r.zonas } : {}), ...resto,
  };
}

// ------------------------------------------------------------------------------------------------------------------
// Entrada
// ------------------------------------------------------------------------------------------------------------------

/**
 * Lee un archivo de guía. `fs` es el módulo (o un doble) con statSync y readFileSync; `base` es opcional.
 * @returns {{formato: string, guias: object[]} | {noLeido: string}}
 */
export function leerArchivoGuia(ruta, { fs, base, idioma = 'es' }: { fs?: any; base?: any; idioma?: string; } = {}) {
  try {
    const ext = extname(String(ruta)).toLowerCase();
    if (ext === '.pdf') return { noLeido: 'pdf' };
    if (IMAGENES.has(ext)) return { noLeido: 'imagen' };
    const deFactoruide = FORMATOS_FACTORUIDE.includes(ext);
    if (!FORMATOS.includes(ext) && !deFactoruide) return { noLeido: 'formato' };
    const est = fs.statSync(ruta);
    if (est.size > MAX_ARCHIVO) return { noLeido: 'grande' };
    const cuerpo = fs.readFileSync(ruta);
    if (cuerpo.length === 0) return { noLeido: 'vacio' };
    const texto = decodificar(cuerpo);
    if (texto.trim() === '') return { noLeido: 'vacio' };
    if (deFactoruide) return conTextoGenerado(guiaDeFactoruide(texto), base, idioma);
    return ext === '.lua' ? leerLua(texto, ruta, base, idioma) : leerPlano(texto, ext, ruta, base, idioma);
  } catch {
    return { noLeido: 'ilegible' };
  }
}

// Los pasos sin texto (solo misiones) llevan el de textoGenerado: «Aceptar Nombre».
function conTextoGenerado(r, base, idioma) {
  for (const g of r.guias ?? []) {
    for (const p of g.pasos) if (p.texto === '') p.texto = textoGenerado(p.misiones, p.punto, base, idioma);
  }
  return r;
}

function leerLua(texto, ruta, base, idioma) {
  if (es4Ever(texto)) return guiasDe4Ever(texto, { idioma, nombreArchivo: basename(ruta) });
  if (/RegisterGuide\s*\(/.test(texto)) {
    const guias = [...texto.matchAll(REGISTRO)].map((m, k) => guiaDeRestedXP(m[2], k, base, idioma));
    return guias.length > 0 ? { formato: 'restedxp', guias } : { noLeido: 'ilegible' };
  }
  if (/SnetForeverMisGuias/.test(texto)) {
    const lista = leerVariablesGuardadas(texto, 'SnetForeverMisGuias', basename(ruta));
    return lista === undefined ? { noLeido: 'formato' } : { formato: 'misguias', guias: guiasDeMisGuias(lista, base, idioma) };
  }
  if (/SNF_(?:MISIONES|RUTAS)\.guias/.test(texto)) {
    const guias = guiasDeAddon(texto, base, idioma);
    return guias.length > 0 ? { formato: 'addon', guias } : { noLeido: 'formato' };
  }
  return { noLeido: 'formato' };
}

// Del HTML, solo lo de dentro de <body> (sin el <head>: su <title> no es un paso) o, sin body, sin cabecera ni doctype.
function cuerpoDeHtml(html) {
  const body = /<body\b[^>]*>/i.exec(html);
  if (body) return html.slice(body.index + body[0].length);
  return html.replace(/<!doctype[^>]*>/i, '').replace(/<head\b[\s\S]*?<\/head\s*>/i, '');
}

function leerPlano(texto, ext, ruta, base, idioma) {
  if (ext === '.txt' && esPolestar(texto)) {
    const g = guiaDePolestar(texto, { base });
    if (g.pasos.length > 0) return { formato: 'polestar', guias: [g] };
  }
  const pagina = ext === '.txt' || ext === '.md' ? cabeceraDePagina(texto) : null;
  const fuente = pagina ? pagina.cuerpo : texto;
  const esHtml = ext === '.html' || ext === '.htm' || (pagina && PARECE_HTML.test(fuente));
  const limpioTexto = esHtml ? htmlATexto(cuerpoDeHtml(fuente)) : fuente;
  if (limpioTexto.trim() === '') return { noLeido: 'vacio' };
  const titulo = esHtml ? htmlATexto(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(fuente)?.[1] ?? '') : '';
  const extra = { ...(titulo ? { titulo } : {}), ...(pagina ? { url: pagina.url, ...(pagina.bajada ? { bajada: pagina.bajada } : {}) } : {}) };
  return { formato: pagina ? 'pagina' : esHtml ? 'html' : 'texto', guias: [guiaDeTexto(limpioTexto, ruta, base, idioma, extra)] };
}
