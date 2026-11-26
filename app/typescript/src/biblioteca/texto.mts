// Biblioteca de guías: del texto (o HTML) de una guía a pasos con misiones, PNJ y coordenadas. Módulo puro: sin disco ni
// red. Lo que no se reconoce queda como paso de solo texto; nada se inventa (misiones solo si casan con la base).
import { resolverZona } from '../rutaZona.mjs';
import { entradas } from '../base/leer-lua.mjs';

// ------------------------------------------------------------------------------------------------------------------
// Decodificar
// ------------------------------------------------------------------------------------------------------------------

const CHARSET = /charset\s*=\s*["']?\s*([\w:.-]+)/i;

/** Texto de un cuerpo: el charset del content-type o de <meta> (primeros 2 KB); si no, UTF-8 sin BOM. */
export function decodificar(cuerpo, tipo?: any) {
  const buf = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo ?? []);
  const etiqueta = CHARSET.exec(String(tipo ?? ''))?.[1] ?? CHARSET.exec(buf.subarray(0, 2048).toString('latin1'))?.[1] ?? 'utf-8';
  let decodificador;
  try { decodificador = new TextDecoder(etiqueta); } catch { decodificador = new TextDecoder('utf-8'); }
  return decodificador.decode(buf);
}

// ------------------------------------------------------------------------------------------------------------------
// HTML a texto
// ------------------------------------------------------------------------------------------------------------------

const FUERA = new Set(['script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'noscript', 'template']);
const BLOQUE = new Set(['p', 'div', 'li', 'tr', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'section', 'article', 'pre', 'blockquote']);
const VACIAS = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'area', 'base', 'col', 'source', 'wbr']);
const ETIQUETA = /^<(\/?)([a-zA-Z][\w:-]*)([\s\S]*)>$/;
const MAX_ETIQUETA = 2000; // una etiqueta más larga es texto: así el HTML mal formado no es cuadrático

// Etiquetas y comentarios de un HTML, en orden y en una sola pasada: {index, 0: texto, 1: '/'|'', 2: nombre, 3: atributos}.
function* etiquetas(html) {
  let desde = 0, gt = -2, sinGt = false, sinCierre = false;
  for (;;) {
    const lt = html.indexOf('<', desde);
    if (lt < 0) return;
    desde = lt + 1;
    if (html.startsWith('<!--', lt)) {
      const fin = sinCierre ? -1 : html.indexOf('-->', lt + 4);
      if (fin < 0) { sinCierre = true; continue; }
      desde = fin + 3;
      yield { index: lt, 0: html.slice(lt, desde) };
      continue;
    }
    if (sinGt) return;
    if (gt < lt) { gt = html.indexOf('>', lt); if (gt < 0) { sinGt = true; return; } }
    if (gt - lt >= MAX_ETIQUETA) continue;
    const m = ETIQUETA.exec(html.slice(lt, gt + 1));
    if (!m) continue;
    desde = gt + 1;
    yield { index: lt, 0: m[0], 1: m[1], 2: m[2], 3: m[3] };
  }
}
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function atributo(attrs, nombre) {
  const m = new RegExp(`(?:^|\\s)${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}

function entidades(s) {
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(\w+));/g, (todo, dec, hex, nombre) => {
    if (nombre) return Object.hasOwn(ENTIDADES, nombre) ? ENTIDADES[nombre] : todo;
    const n = dec !== undefined ? Number(dec) : parseInt(hex, 16);
    return Number.isInteger(n) && n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : todo;
  });
}

// Revisión final: los bloques de comentarios se saltan por su id o su clase, palabra a palabra (con `-` y `_` como
// separadores: «comments», «comment-list», «user_comments», «comentarios»; no «commentary-free»), y nunca en html, body,
// main ni article (una página con <body class="comments-page"> no se queda vacía).
const COMENTARIOS = /(?:^|[\s_-])(?:comments?|coments?|comentarios?)(?=$|[\s_-])/;
const CON_COMENTARIOS = new Set(['html', 'body', 'main', 'article']);

/** Texto visible de una página: sin script, navegación ni comentarios; bloques con salto de línea. */
export function htmlATexto(html) {
  const fuente = String(html ?? '');
  let salida = '';
  let pos = 0;
  let saltando = null; // nombre de la etiqueta que se está saltando
  let hondo = 0;
  for (const m of etiquetas(fuente)) {
    if (saltando === null) salida += fuente.slice(pos, m.index);
    pos = m.index + m[0].length;
    if (m[2] === undefined) continue; // comentario HTML
    const cierra = m[1] === '/';
    const nombre = m[2].toLowerCase();
    const attrs = m[3];
    if (saltando !== null) {
      if (nombre === saltando && !VACIAS.has(nombre)) {
        if (cierra) { if (--hondo === 0) saltando = null; } else if (!attrs.endsWith('/')) hondo++;
      }
      continue;
    }
    if (!cierra && !VACIAS.has(nombre) && !attrs.endsWith('/')) {
      const marca = `${atributo(attrs, 'id')} ${atributo(attrs, 'class')}`.toLowerCase();
      const deComentarios = !CON_COMENTARIOS.has(nombre) && COMENTARIOS.test(marca);
      if (FUERA.has(nombre) || deComentarios) { saltando = nombre; hondo = 1; continue; }
    }
    if (BLOQUE.has(nombre)) salida += '\n';
    else if (nombre === 'a' && !cierra) { // los enlaces a misiones y PNJ de Wowhead conservan la dirección
      const href = atributo(attrs, 'href');
      if (/(?:quest|npc)=\d+/.test(href)) salida += ` ${entidades(href)} `;
    }
  }
  if (saltando === null) salida += fuente.slice(pos);
  return entidades(salida).replace(/ /g, ' ').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n')
    .replace(/\n{2,}/g, '\n').trim();
}

// ------------------------------------------------------------------------------------------------------------------
// Texto a pasos
// ------------------------------------------------------------------------------------------------------------------

const NUM = String.raw`\d{1,3}(?:[.,]\d+)?`;
const FIN = String.raw`(?!\d|[.,]\d)`;
const PAR = new RegExp(String.raw`(?<![\d.,])(${NUM})(\s*[,;]\s*|\s+)(${NUM})${FIN}`, 'g');
const ENVUELTO = new RegExp(String.raw`[(\[{]\s*(${NUM})(\s*[,;]\s*|\s+)(${NUM})\s*[)\]}]`);
const DE_ORDEN = new RegExp(String.raw`^(?:(.*?)[\s,]+)?(?<!\d)(${NUM})(\s*[,;]\s*|\s+)(${NUM})${FIN}`);
const ORDEN_PUNTO = /^\s*[./](?:goto|way|waypoint|tway)\b\s*(.*)$/i;

const valor = (s) => Number(s.replace(',', '.'));
const enRango = (n) => Number.isFinite(n) && n >= 0 && n <= 100;
const redondeo = (n) => Math.round(n * 1000) / 1000;

function puntoDePar(a, b) {
  const x = valor(a), y = valor(b);
  return enRango(x) && enRango(y) ? { x: redondeo(x), y: redondeo(y) } : null;
}

// «Zona, x, y» o «Zona x y» tras .goto o /way; la zona va delante de los dos números. Una zona nunca es solo cifras
// (revisión de la tarea 10): «/way 45,2 67,8» es el par 45.2, 67.8, no la zona «45» con 2, 67.8. Por eso primero se
// mira si lo que sigue a la orden ya es un par.
const PAR_AL_PRINCIPIO = new RegExp(String.raw`^(${NUM})(\s*[,;]\s*|\s+)(${NUM})${FIN}`);
const SOLO_CIFRAS = /^[\d\s.,;]+$/;

function puntoDeOrden(resto, base) {
  const texto = resto.trim();
  const par = PAR_AL_PRINCIPIO.exec(texto);
  const solo = par ? puntoDePar(par[1], par[3]) : null;
  if (solo) return solo;
  const m = DE_ORDEN.exec(texto);
  if (!m) return null;
  const p = puntoDePar(m[2], m[4]);
  if (!p) return null;
  const zona = m[1]?.trim();
  if (zona && SOLO_CIFRAS.test(zona)) return null;
  const z = zona && base ? resolverZona(base, zona) : null;
  if (!zona) return p;
  return z ? { mapa: z.uiMap, ...p } : { zona, ...p }; // zona nombrada y sin resolver: no hereda el mapa anterior
}

// Un punto en texto corrido: entre () [] {} vale cualquier par; sin ellos, uno de los dos debe llevar decimales.
function puntoDeTexto(linea) {
  const env = ENVUELTO.exec(linea);
  if (env) { const p = puntoDePar(env[1], env[3]); if (p) return p; }
  for (const m of linea.matchAll(PAR)) {
    if (!/[.,]\d/.test(m[1]) || !/[.,]\d/.test(m[3])) continue; // suelto: los dos con decimales
    const p = puntoDePar(m[1], m[3]);
    if (p) return p;
  }
  return null;
}

// Todos los pares de coordenadas escritos en un texto (con punto o coma decimal), también los que se pisan
// («10 52.1 43.6» da 10/52.1 y 52.1/43.6). Quien lo usa compara con una coordenada que ya conoce. Revisión final: dos
// enteros seguidos solo con espacios no son un par («mata 10 20 jabalíes»); un par vale si alguno de los dos lleva
// decimales, si van separados por coma o punto y coma, o si van entre paréntesis, corchetes o llaves.
export function paresDeTexto(texto) {
  const pares = [];
  const entero = String(texto ?? '');
  const re = new RegExp(PAR.source, 'g');
  for (let m = re.exec(entero); m; m = re.exec(entero)) {
    const conDecimal = /[.,]\d/.test(m[1]) || /[.,]\d/.test(m[3]);
    // «43,6» pegado y sin decimales en los lados es un solo número con coma decimal, no un par.
    const decimal = m[2] === ',' && !conDecimal;
    const separado = /[,;]/.test(m[2]);
    const envuelto = /[(\[{]\s*$/.test(entero.slice(0, m.index)) && /^\s*[)\]}]/.test(entero.slice(m.index + m[0].length));
    const p = !decimal && (conDecimal || separado || envuelto) ? puntoDePar(m[1], m[3]) : null;
    if (p) pares.push(p);
    re.lastIndex = m.index + m[1].length + m[2].length; // sigue desde el segundo número: puede ser el primero del par siguiente
  }
  return pares;
}

const VERBOS: Array<[string, RegExp]> = [
  ['aceptar', /\b(?:acepta(?:r)?|accept|pick up|coge|recoge)\s+/i],
  ['entregar', /\b(?:entrega(?:r)?|turn in|turn-in|hand in|deliver)\s+/i],
  ['completar', /\b(?:completa(?:r)?|complete)\s+/i],
];

function accionDe(linea) {
  for (const [accion, re] of VERBOS) {
    const m = re.exec(linea);
    if (m) return { accion, resto: linea.slice(m.index + m[0].length) };
  }
  return null;
}

// El nombre citado que sigue al verbo (tras «la misión», «quest»…): lo que va entre comillas, o null.
function citadoDe(resto) {
  const limpio = resto.replace(/\[\s*|\s*\]/g, '').trim().replace(RELLENO_CITA, '');
  return /^["«“'‘]\s*([^"»”'’]+?)\s*["»”'’]/.exec(limpio)?.[1] ?? null;
}
const RELLENO_CITA = /^(?:(?:la|the)\s+)?(?:misi[oó]n|quest)\b\s*:?\s*/i;

// Nombres de misión de la base (es y en, con `normal`; también sin su artículo del principio si quedan dos palabras o
// más, como el índice de base.mjs) -> ids de menor a mayor. Se hace una vez por base: el índice lee cientos de archivos.
const LETRAS_MISION = 4; // como LETRAS_MINIMAS de base.mjs
const ARTICULOS = new Set(['el', 'la', 'los', 'las', 'the']);
const memoriaMisiones = new WeakMap();
function misionesPorNombre(base) {
  let ind = memoriaMisiones.get(base);
  if (ind) return ind;
  const porNombre = new Map();
  let palabras = 0;
  const sumar = (q, texto) => {
    if (typeof texto !== 'string' || !Number.isInteger(q)) return;
    const n = normal(texto);
    if (n.replace(/ /g, '').length < LETRAS_MISION) return;
    const t = n.split(' ');
    const claves = [n];
    if (ARTICULOS.has(t[0]) && t.length >= 3) claves.push(t.slice(1).join(' '));
    for (const c of claves) {
      const lista = porNombre.get(c);
      if (!lista) porNombre.set(c, [q]); else if (!lista.includes(q)) lista.push(q);
    }
    palabras = Math.max(palabras, t.length);
  };
  for (const [q, m] of entradas(base?.datos?.quest)) sumar(q, m?.name);
  for (const [q, m] of entradas(base?.datos?.es?.quest)) sumar(q, m?.name);
  for (const lista of porNombre.values()) lista.sort((a, b) => a - b);
  ind = { porNombre, palabras };
  memoriaMisiones.set(base, ind);
  return ind;
}

// Relleno entre el verbo y el nombre: «la misión», «misión», «quest», «the quest» (en minúsculas, sin tildes ni comillas).
const RELLENO = [['la', 'mision'], ['the', 'quest'], ['mision'], ['quest']];
function cuantoRelleno(t) {
  let desde = 0;
  for (let quitado = true; quitado;) {
    quitado = false;
    for (const r of RELLENO) {
      if (t.length - desde > r.length && r.every((w, i) => t[desde + i] === w)) { desde += r.length; quitado = true; break; }
    }
  }
  return desde;
}

// Las palabras de un texto como las corta `normal` (sin tildes; letras y cifras), pero con sus mayúsculas.
const palabrasCrudas = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);

// Ids de una clave (ya con `normal`), con y sin el artículo del principio.
function idsDeNombre(porNombre, t) {
  const pruebas = [t.join(' ')];
  if (t.length >= 2 && ARTICULOS.has(t[0])) pruebas.push(t.slice(1).join(' '));
  return pruebas.flatMap((p) => porNombre.get(p) ?? []);
}

// Un nombre de núcleo corto (sin el artículo, una o dos palabras: «Almejas», «La arcanita», «More Work?») casa con
// demasiadas frases normales («recoge almejas por la orilla»). Solo vale entre comillas, si es todo lo que sigue al verbo o
// si la primera palabra del nombre, tal como está escrita, va con mayúscula (el nombre nunca es la primera palabra de la
// línea: va tras el verbo).
const NUCLEO_LARGO = 3;

// La misión cuyo nombre es el principio MÁS LARGO del texto tras el verbo (con y sin artículo); a igualdad, la de id menor.
// Las palabras son enteras: el prefijo acaba siempre en un límite de palabra.
function misionDelPrincipio(resto, base) {
  const { porNombre, palabras } = misionesPorNombre(base);
  const citado = citadoDe(resto);
  if (citado) {
    const qs = idsDeNombre(porNombre, normal(citado).split(' ').filter(Boolean));
    if (qs.length) return Math.min(...qs);
  }
  const todas = palabrasCrudas(resto);
  const crudas = todas.slice(cuantoRelleno(todas.map((w) => w.toLowerCase())));
  const t = crudas.map((w) => w.toLowerCase());
  for (let n = Math.min(t.length, palabras + 1); n >= 1; n--) {
    const qs = [];
    for (const inicio of n >= 2 && ARTICULOS.has(t[0]) ? [0, 1] : [0]) {
      const trozo = t.slice(inicio, n);
      const ids = porNombre.get(trozo.join(' '));
      if (!ids) continue;
      const nucleo = trozo.length - (trozo.length >= 2 && ARTICULOS.has(trozo[0]) ? 1 : 0);
      if (nucleo >= NUCLEO_LARGO || n === t.length || /^[A-Z0-9]/.test(crudas[inicio])) qs.push(...ids);
    }
    if (qs.length) return Math.min(...qs);
  }
  return null;
}

function misionesDeLinea(linea, base) {
  const orden = /^\s*\.(accept|turnin|complete)\s+(\d+)(?:\s*,\s*(\d+))?/i.exec(linea);
  if (orden) {
    const accion = { accept: 'aceptar', turnin: 'entregar', complete: 'completar' }[orden[1].toLowerCase()];
    return [{ q: Number(orden[2]), accion, ...(orden[3] ? { objetivo: Number(orden[3]) } : {}) }];
  }
  const misiones = [];
  const verbo = accionDe(linea);
  for (const m of linea.matchAll(/quest=(\d+)/g)) misiones.push({ q: Number(m[1]), accion: verbo?.accion ?? 'completar' });
  if (misiones.length > 0 || !verbo) return misiones;
  const q = base ? misionDelPrincipio(verbo.resto, base) : null;
  if (q !== null) return [{ q, accion: verbo.accion }];
  const citado = citadoDe(verbo.resto);
  return citado ? [{ nombre: citado, accion: verbo.accion }] : [];
}

function pnjsDeLinea(linea) {
  const ids = [...linea.matchAll(/npc=(\d+)/g)].map((m) => Number(m[1]));
  const objetivo = /^\s*\.target\s+(\d+)\b/i.exec(linea);
  if (objetivo) ids.push(Number(objetivo[1]));
  return [...new Set(ids)];
}

const SIN_VINETA = /^\s*(?:#{1,6}\s+|[-*+•>]\s+|\d{1,3}[.)]\s+)+/;
const URL = /https?:\/\/\S+/gi;
const CABECERA = /gu[ií]a|guide|nivel|level|lvl|leveling|ruta|route/i;

export const normal = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ARTICULO_ZONA = /^(?:el|la|los|las|the)\s+/;

// Nombres de zona de la base (es y en, con `normal`, con y sin artículo, de 3 letras o más) -> uiMaps. Una vez por base.
const LETRAS_ZONA = 3;
const memoriaZonas = new WeakMap();
function zonasPorNombre(base) {
  let ind = memoriaZonas.get(base);
  if (ind) return ind;
  const porNombre = new Map();
  const primeras = new Set(); // la primera palabra de cada nombre: casi todas las posiciones de una línea se saltan
  let palabras = 0;
  for (const [uiMap, n] of entradas(base?.datos?.zonas?.nombre)) {
    if (!Number.isInteger(uiMap)) continue;
    const nombres = [n?.es, n?.en].filter((x) => typeof x === 'string').map(normal).filter(Boolean);
    for (const x of new Set([...nombres, ...nombres.map((y) => y.replace(ARTICULO_ZONA, ''))])) {
      if (x.replace(/ /g, '').length < LETRAS_ZONA) continue;
      const lista = porNombre.get(x);
      if (!lista) porNombre.set(x, [uiMap]); else if (!lista.includes(uiMap)) lista.push(uiMap);
      primeras.add(x.split(' ')[0]);
      palabras = Math.max(palabras, x.split(' ').length);
    }
  }
  ind = { porNombre, primeras, palabras };
  memoriaZonas.set(base, ind);
  return ind;
}

// Los uiMaps de los nombres de zona enteros (con límites de palabra) que salen en las palabras `t` (ya con `normal`), en
// el orden en que salen. `vale(i, n)` decide si el trozo t[i..i+n) cuenta.
function zonasEnPalabras(base, t, vale: (index: number, length: number) => boolean = () => true) {
  const { porNombre, primeras, palabras } = zonasPorNombre(base);
  const salida = [];
  for (let i = 0; i < t.length; i++) {
    if (!primeras.has(t[i])) continue;
    for (let n = Math.min(palabras, t.length - i); n >= 1; n--) {
      const uiMaps = porNombre.get(t.slice(i, i + n).join(' '));
      if (!uiMaps || !vale(i, n)) continue;
      for (const u of uiMaps) if (!salida.includes(u)) salida.push(u);
    }
  }
  return salida;
}

// Los mapas cuyo nombre (es o en, con o sin artículo) aparece entero en un texto: «Guía 1-12 Los Baldíos».
export function zonasDelTitulo(base, titulo) {
  const t = normal(titulo).split(' ').filter(Boolean);
  return t.length ? zonasEnPalabras(base, t).sort((a, b) => a - b) : [];
}

// Las zonas nombradas en una línea cualquiera de la guía. Como en el título, salvo que un nombre cuyo núcleo (sin el
// artículo) es una sola palabra solo cuenta si esa palabra va con mayúscula: «Ve a Baldíos» sí, «haz las mazmorras» (Las
// Mazmorras) o «8 entrañas de jabalí» (Entrañas) no.
function zonasDeLinea(base, linea) {
  const crudas = palabrasCrudas(linea);
  const t = crudas.map((w) => w.toLowerCase());
  return zonasEnPalabras(base, t, (i, n) => {
    const articulo = n >= 2 && ARTICULOS.has(t[i]) ? 1 : 0;
    return n - articulo >= 2 || /^[A-Z0-9]/.test(crudas[i + articulo]);
  });
}

/**
 * Pasos de un texto: cada línea no vacía es un paso. Con `base`, las zonas y las misiones por nombre se resuelven con ella.
 * `zonas`: los uiMaps que la guía nombra en cualquier línea (cabecera, línea de zona o en medio de un paso), en orden;
 * son para el índice: nombrar una zona en medio de un paso no da mapa a los puntos.
 * @returns {{nombre?: string, faccion?: 'Horde'|'Alliance', niveles?: [number, number], zonas?: number[], pasos: object[]}}
 */
export function pasosDeTexto(texto, { base, idioma = 'es' }: { base?: any; idioma?: string; } = {}) {
  void idioma; // las zonas y las misiones se buscan siempre por sus nombres en los dos idiomas
  const salida: {
    pasos: any[];
    faccion?: any;
    niveles?: number[];
    nombre?: string;
    zonas?: any;
  } = { pasos: [] };
  const zonas = []; // las zonas que nombra la guía (para el índice): no mueven los puntos
  const sumarZona = (u) => { if (Number.isInteger(u) && !zonas.includes(u)) zonas.push(u); };
  let mapa;
  let primera = true;
  for (const cruda of String(texto ?? '').split(/\r?\n/)) {
    const linea = cruda.replace(SIN_VINETA, '').trim();
    if (linea === '') continue;
    if (!primera && base) for (const u of zonasDeLinea(base, linea.replace(URL, ' '))) sumarZona(u);
    if (primera) {
      primera = false;
      const horda = /\bhorda\b|\bhorde\b/i.test(linea), alianza = /\balianza\b|\balliance\b/i.test(linea);
      if (horda !== alianza) salida.faccion = horda ? 'Horde' : 'Alliance';
      const n = /(?<!\d)(\d{1,2})\s*[-–]\s*(\d{1,2})(?!\d)/.exec(linea);
      if (n && CABECERA.test(linea) && Number(n[1]) >= 1 && Number(n[1]) <= Number(n[2]) && Number(n[2]) <= 80) {
        salida.niveles = [Number(n[1]), Number(n[2])];
      }
      if ((salida.niveles || salida.faccion) && linea.length <= 80) salida.nombre = linea;
      // Una cabecera que nombra exactamente UNA zona que se resuelve hace de línea de zona para los puntos siguientes.
      if (base) {
        const zs = zonasDelTitulo(base, linea);
        if (zs.length === 1) mapa = zs[0];
        for (const u of zs) sumarZona(u);
      }
    }
    const paso: {
      n: number;
      texto: typeof linea;
      misiones: any;
      punto?: any;
      pnjs?: number[];
    } = { n: salida.pasos.length + 1, texto: linea, misiones: misionesDeLinea(linea, base) };
    const orden = ORDEN_PUNTO.exec(linea);
    const punto: { x: number; y: number; mapa?: number; zona?: string } | null = orden ? puntoDeOrden(orden[1], base) : /^\s*\.\w+/.test(linea) ? null : puntoDeTexto(linea.replace(URL, ' '));
    if (punto) paso.punto = punto.mapa === undefined && punto.zona === undefined && mapa !== undefined ? { mapa, ...punto } : punto;
    if (punto?.mapa !== undefined) mapa = punto.mapa;
    const pnjs = pnjsDeLinea(linea);
    if (pnjs.length) paso.pnjs = pnjs;
    // Una línea que solo es el nombre de una zona fija el mapa de los puntos siguientes.
    if (base && !punto && paso.misiones.length === 0 && linea.length <= 40 && !/\d/.test(linea)) {
      const z = resolverZona(base, linea.replace(/[\s:.\-–]+$/, ''));
      if (z) { mapa = z.uiMap; sumarZona(z.uiMap); }
    }
    salida.pasos.push(paso);
  }
  if (zonas.length) salida.zonas = zonas;
  return salida;
}
