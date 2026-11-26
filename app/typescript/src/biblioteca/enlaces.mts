// Biblioteca de guías: los enlaces. El jugador pega una dirección (portapapeles), deja un acceso directo .url o la apunta en
// enlaces.txt; la app baja la página UNA vez y guarda una copia limpia del texto dentro de la biblioteca, para que se indexe
// como cualquier otra guía y funcione sin conexión.
//
//   anadirEnlace(texto, {datos, fs, obtener = obtenerPagina, ahora = Date.now})
//     -> Promise<{ok: true, archivo, host} | {ok: false, motivo: 'url'|'red_local'|'tamano'|'estado'|'tiempo'|'conexion'|'vacio'}>
//   enlacesPendientes({datos, fs}) -> string[]   direcciones de los .url y de enlaces.txt que aún no tienen copia
//   revisarEnlaces({datos, fs}) -> {pendientes: string[], rechazadas: string[]}   y, aparte, las de la red de casa o mal escritas
//   actualizarEnlaces({datos, fs, obtener, ahora}) -> Promise<{bajados, fallidos, rechazados}>   vuelve a bajar todas las copias
//
// La copia es guias\enlaces\<host>-<8 hex del sha1 de la url>.txt:
//   # Dirección: <url>
//   # Bajada: <ISO>
//   (línea en blanco)
//   <texto>
// que es justo lo que lee leer.mjs como página guardada. La copia vieja (si la hay) va a la cuarentena antes de escribir la
// nueva; si la bajada falla, la vieja se queda. La red solo pasa por obtenerPagina (actualizar/red.mjs). El registro solo
// lleva contadores y códigos: nunca la dirección ni el sitio.
import * as fsReal from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { CARPETA_GUIAS } from './indice.mjs';
import { decodificar, htmlATexto } from './texto.mjs';
import { obtenerPagina, urlDePagina, ipPrivada, ErrorRed } from '../actualizar/red.mjs';
import { escribirAtomico } from '../buzon.mjs';
import { cuarentenaNueva } from '../rutas.mjs';
import { log } from '../registro.mjs';

export const CARPETA_ENLACES = 'enlaces';
const MOTIVOS = new Set(['url', 'red_local', 'tamano', 'estado', 'tiempo', 'conexion']);
const PARECE_HTML = /<\/?(?:html|body|head|p|div|h[1-6]|li|br|title)\b/i;
const CABECERA = /^#\s*Direcci[oó]n\s*:\s*(.+)$/i;
const MAX_PROFUNDIDAD = 6;

// Por qué `urlDePagina` dio null: una dirección de la red de casa ('red_local') o una mal escrita ('url'). También la usa
// guardar.mjs (la herramienta guardar_guia).
export function motivoDeUrl(texto) {
  let u;
  try {
    u = new URL(String(texto).trim());
  } catch {
    return 'url';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'url';
  if (u.username !== '' || u.password !== '' || u.port !== '') return 'url';
  const host = u.hostname.replace(/\.$/, '');
  if (host === '') return 'url';
  if (host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return ipPrivada(host) ? 'red_local' : 'url';
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
    || !host.includes('.')) return 'red_local';
  return 'url';
}

const hostDe = (url) => new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
const nombreCopia = (url) => `${hostDe(url)}-${createHash('sha1').update(url).digest('hex').slice(0, 8)}.txt`;
const carpetaEnlaces = (datos) => join(datos, CARPETA_GUIAS, CARPETA_ENLACES);

const existe = (fs, ruta) => {
  try {
    fs.statSync(ruta);
    return true;
  } catch {
    return false;
  }
};

// El texto limpio de la página: el HTML pasa por htmlATexto; lo demás (text/plain) se guarda como texto. También lo usa el
// núcleo (tarea 20) con las páginas que baja para comprobar los puntos de internet de una guía de la IA.
export function textoDePagina({ cuerpo, tipo }) {
  const crudo = decodificar(cuerpo, tipo);
  const esPlano = /^\s*text\/plain/i.test(String(tipo ?? ''));
  const esHtml = !esPlano && (/html/i.test(String(tipo ?? '')) || PARECE_HTML.test(crudo));
  return (esHtml ? htmlATexto(crudo) : crudo).replace(/\r\n?/g, '\n').trim();
}

// Escribe la copia; la que hubiera antes va a la cuarentena (y vuelve si la escritura falla).
async function guardar(fs, datos, url, texto, ahora) {
  const nombre = nombreCopia(url);
  const destino = join(carpetaEnlaces(datos), nombre);
  fs.mkdirSync(dirname(destino), { recursive: true });
  const contenido = `# Dirección: ${url}\n# Bajada: ${new Date(ahora()).toISOString()}\n\n${texto}\n`;
  let apartada = null;
  if (existe(fs, destino)) {
    apartada = join(cuarentenaNueva({ ...process.env, SNF_DATOS: datos }), nombre);
    fs.renameSync(destino, apartada);
  }
  try {
    await escribirAtomico(fs, destino, contenido);
  } catch (e) {
    if (apartada !== null) {
      try {
        fs.renameSync(apartada, destino);
      } catch {
        // la vieja se queda en la cuarentena
      }
    }
    throw e;
  }
  return `${CARPETA_ENLACES}/${nombre}`;
}

export async function anadirEnlace(texto, { datos, fs = fsReal, obtener = obtenerPagina, ahora = Date.now }: {
  datos?: any;
  fs?: typeof fsReal;
  obtener?: typeof obtenerPagina;
  ahora?: typeof Date.now;
} = {}) {
  const escrito = String(texto ?? '').trim();
  const url = urlDePagina(escrito);
  if (url === null) return { ok: false, motivo: motivoDeUrl(escrito) };
  let pagina;
  try {
    pagina = await obtener(url);
  } catch (e) {
    const codigo = e instanceof ErrorRed ? e.code : 'conexion';
    log('aviso', `biblioteca: no se pudo bajar un enlace (${codigo})`);
    // una redirección sin salida cuenta como fallo de conexión
    return { ok: false, motivo: MOTIVOS.has(codigo) ? codigo : 'conexion' };
  }
  const contenido = textoDePagina(pagina);
  if (contenido === '') return { ok: false, motivo: 'vacio' };
  try {
    const archivo = await guardar(fs, datos, url, contenido, ahora);
    return { ok: true, archivo, host: new URL(url).hostname };
  } catch (e) {
    log('aviso', `biblioteca: no se pudo guardar la copia de un enlace (${e?.code ?? 'error'})`);
    return { ok: false, motivo: 'conexion' };
  }
}

// Archivos .url y enlaces.txt de la biblioteca (sin enlaces simbólicos ni nombres que empiezan por «.»).
function archivosDeEnlaces(fs, raiz) {
  const lista = [];
  const visitar = (dir, nivel) => {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entradas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entradas) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const ruta = join(dir, e.name);
      if (e.isDirectory()) {
        if (nivel < MAX_PROFUNDIDAD) visitar(ruta, nivel + 1);
      } else if (extname(e.name).toLowerCase() === '.url' || e.name.toLowerCase() === 'enlaces.txt') {
        lista.push(ruta);
      }
    }
  };
  visitar(raiz, 0);
  return lista;
}

function direccionesDe(fs, ruta) {
  let texto;
  try {
    texto = decodificar(fs.readFileSync(ruta));
  } catch {
    return [];
  }
  if (extname(ruta).toLowerCase() === '.url') {
    const m = /^\s*URL\s*=\s*(\S+)\s*$/im.exec(texto);
    return m ? [m[1]] : [];
  }
  return texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
}

// Las direcciones de los .url y de enlaces.txt: las que aún no tienen copia (`pendientes`) y, aparte, las que nunca se
// bajarán porque son de la red de casa o están mal escritas (`rechazadas`, sin repetir). Estas solo se cuentan: la app
// las apunta en el registro como un número y avisa con un globo, nunca con la dirección.
export function revisarEnlaces({ datos, fs = fsReal }: { datos?: any; fs?: typeof fsReal; } = {}) {
  const pendientes = [];
  const rechazadas = [];
  const vistas = new Set();
  for (const archivo of archivosDeEnlaces(fs, join(datos, CARPETA_GUIAS))) {
    for (const direccion of direccionesDe(fs, archivo)) {
      const url = urlDePagina(direccion);
      if (url === null) {
        if (!rechazadas.includes(direccion)) rechazadas.push(direccion);
        continue;
      }
      if (vistas.has(url)) continue;
      vistas.add(url);
      if (!existe(fs, join(carpetaEnlaces(datos), nombreCopia(url)))) pendientes.push(direccion);
    }
  }
  return { pendientes, rechazadas };
}

export function enlacesPendientes({ datos, fs = fsReal }: { datos?: any; fs?: typeof fsReal; } = {}) {
  return revisarEnlaces({ datos, fs }).pendientes;
}

// Un «no» de anadirEnlace por la dirección misma (no por la red): cuenta como rechazada, no como fallida.
export const esRechazo = (r) => r?.ok === false && (r.motivo === 'url' || r.motivo === 'red_local');

// Las direcciones de las copias ya hechas (su cabecera «# Dirección:»).
function direccionesDeCopias(fs, datos) {
  let nombres;
  try {
    nombres = fs.readdirSync(carpetaEnlaces(datos)).filter((n) => n.toLowerCase().endsWith('.txt')).sort();
  } catch {
    return [];
  }
  const urls = [];
  for (const nombre of nombres) {
    try {
      const primera = fs.readFileSync(join(carpetaEnlaces(datos), nombre), 'utf8').split(/\r?\n/, 1)[0];
      const m = CABECERA.exec(primera.trim());
      if (m) urls.push(m[1].trim());
    } catch {
      // ilegible: se salta
    }
  }
  return urls;
}

export async function actualizarEnlaces({ datos, fs = fsReal, obtener = obtenerPagina, ahora = Date.now }: {
  datos?: any;
  fs?: typeof fsReal;
  obtener?: typeof obtenerPagina;
  ahora?: typeof Date.now;
} = {}) {
  let bajados = 0;
  let fallidos = 0;
  let rechazados = 0;
  for (const url of direccionesDeCopias(fs, datos)) {
    const r = await anadirEnlace(url, { datos, fs, obtener, ahora });
    if (r.ok) bajados++; else if (esRechazo(r)) rechazados++; else fallidos++;
  }
  log('info', `biblioteca: enlaces actualizados ${bajados}, fallidos ${fallidos}, rechazados ${rechazados}`);
  return { bajados, fallidos, rechazados };
}
