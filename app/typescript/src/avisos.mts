// Avisos de fallo (fase 5, tarea 11; R11 y F5-3). El addon guarda cada «Avisar de un fallo» en SnetForeverCuenta.fallos
// (ui/fallo.lua, 200 como mucho) y WoW lo escribe en <juego>\WTF\Account\<cuenta>\SavedVariables\SnetForever.lua. La app
// lo lee en solo lectura (nunca escribe en WTF, R14) y se lo da al jugador para que lo mande él:
//   1. primero, en un archivo de texto (archivoAvisos, `datos\avisos\avisos-<sello>.txt`) o en el portapapeles
//      (textoAvisos + copiarAlPortapapeles de navegador.mjs), que se pueden mandar por donde sea;
//   2. en segundo lugar, porque exige cuenta de GitHub, como una issue nueva ya rellenada (urlIssue + abrirUrl).
// La app no envía nada. Lo ya guardado o abierto se apunta en `datos\avisos-enviados.json`, que solo crece.
//
// Privacidad: un aviso nunca lleva el personaje, la carpeta de la cuenta, el correo, el nombre de usuario de Windows, el
// nombre del PC ni rutas con el nombre del usuario (`C:\Users\<nombre>` → `%USERPROFILE%`). Del archivo solo se copian
// los campos del aviso (lista cerrada): nada del chat ni de otras variables guardadas.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { carpetaDatos, cuarentenaNueva, sello } from './rutas.mjs';
import { leerVariablesGuardadas, entradas } from './base/leer-lua.mjs';
import { repoDe } from './actualizar/origen.mjs';
import { TEXTOS_AVISOS } from './textos.mjs';
import { log } from './registro.mjs';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_URL = 7500;
export const ARCHIVO_ENVIADOS = 'avisos-enviados.json';
const GLOBAL = 'SnetForeverCuenta';
const ARCHIVO = 'SnetForever.lua';
const MAX_CAMPO = 200; // los campos cortos (fecha, guía, raza…); el texto ya lo corta el addon a 500
const ID = /^[0-9a-f]{12}$/;

// ---------- lectura ----------

// La entrada de `dir` que se llama `nombre` sin mirar mayúsculas (Windows no las distingue; así vale en todas partes).
function hijo(dir, nombre) {
  try {
    const encontrado = readdirSync(dir).find((n) => n.toLowerCase() === nombre.toLowerCase());
    return encontrado === undefined ? null : join(dir, encontrado);
  } catch {
    return null;
  }
}

// Las carpetas de cuenta de WTF\Account (solo carpetas de verdad), ordenadas.
function cuentas(raizJuego) {
  const wtf = typeof raizJuego === 'string' ? hijo(raizJuego, 'WTF') : null;
  const account = wtf && hijo(wtf, 'Account');
  if (!account) return [];
  try {
    return readdirSync(account, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ nombre: d.name, dir: join(account, d.name) }))
      .sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
  } catch {
    return [];
  }
}

const escaparRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `palabra` suelta (sin letras ni cifras pegadas), sin mirar mayúsculas.
const suelta = (palabra) => new RegExp(`(?<![\\p{L}\\p{N}_])${escaparRe(palabra)}(?![\\p{L}\\p{N}_])`, 'giu');

/**
 * Quita los códigos de formato de WoW: color (`|cAARRGGBB` y `|r`), enlaces (`|H…|h` y el `|h` que los cierra), texturas
 * (`|T…|t`), atlas (`|A…|a`) y nombres protegidos de Battle.net (`|K…|k`). `||` es una barra suelta y `|n`, un salto.
 */
export function sinCodigos(texto) {
  return String(texto)
    .replace(/\|\|/g, '\u0000')
    .replace(/\|c[0-9a-fA-F]{8}/g, '')
    .replace(/\|r/g, '')
    .replace(/\|H[^|]*\|h/g, '')
    .replace(/\|h/g, '')
    .replace(/\|T[^|]*\|t/g, '')
    .replace(/\|A[^|]*\|a/g, '')
    .replace(/\|K[^|]*\|k/g, '')
    .replace(/\|n/g, '\n')
    .replace(/\u0000/g, '|');
}

// Una ruta de la carpeta de un usuario: `C:\Users\<nombre>`, `\Usuarios\<nombre>`, `c:/users/<nombre>`… El nombre puede
// llevar espacios si detrás sigue la ruta (`…\José Ñandú\Desktop`); si no, llega hasta el primer espacio.
const RUTA_USUARIO = /(?:[A-Za-z]:)?[\\/]{1,2}(?:Users|Usuarios|Documents and Settings)[\\/]{1,2}(?:[^\\/\r\n"'<>|*?:]+(?=[\\/])|[^\\/\s"'<>|*?:]+)/gi;
const CORREO = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

/**
 * Lo que dice quién es el jugador, fuera: el correo → `[correo]`; `%USERPROFILE%` y cualquier `C:\Users\<nombre>` →
 * `%USERPROFILE%`; el usuario de Windows → `%USERNAME%`; el nombre del PC → `%COMPUTERNAME%`; el personaje →
 * `[personaje]`; y las carpetas de cuenta de WTF → `[cuenta]`.
 * @param {string} texto
 * @param {{env?: object, personaje?: unknown, cuentas?: string[]}} p
 */
export function sinDatosPersonales(texto: string, { env = process.env, personaje, cuentas: nombres = [] }: { env?: typeof process.env; personaje?: any; cuentas?: any[]; } = {}) {
  let t = String(texto).replace(CORREO, '[correo]');
  const perfil = typeof env.USERPROFILE === 'string' && env.USERPROFILE.length >= 4 ? env.USERPROFILE.replace(/[\\/]+$/, '') : '';
  if (perfil) {
    const partes = perfil.split(/[\\/]+/).map(escaparRe).join('[\\\\/]+');
    t = t.replace(new RegExp(partes, 'giu'), '%USERPROFILE%');
  }
  t = t.replace(RUTA_USUARIO, '%USERPROFILE%');
  const literales = [];
  if (typeof personaje === 'string' && personaje.trim()) {
    literales.push([personaje.trim(), '[personaje]']);
    const nombre = personaje.trim().split(/\s+/)[0];
    if (nombre.length >= 3) literales.push([nombre, '[personaje]']);
  }
  for (const cuenta of nombres) {
    literales.push([cuenta, '[cuenta]']);
    const sinNumero = cuenta.replace(/#\d+$/, '');
    if (sinNumero !== cuenta && sinNumero.length >= 3) literales.push([sinNumero, '[cuenta]']);
  }
  for (const [variable, nombreVar] of [['USERNAME', '%USERNAME%'], ['COMPUTERNAME', '%COMPUTERNAME%']]) {
    const v = env[variable];
    if (typeof v === 'string' && v.trim().length >= 2) literales.push([v.trim(), nombreVar]);
  }
  // los más largos primero («Ana María» antes que «Ana»)
  literales.sort((a, b) => b[0].length - a[0].length);
  for (const [literal, cambio] of literales) t = t.replace(suelta(literal), cambio);
  return t;
}

const primeros = (texto, n) => {
  const letras = Array.from(texto);
  return letras.length <= n ? texto : letras.slice(0, n).join('');
};

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// El aviso tal como sale de la app: solo los campos del brief, limpios. `crudo` es la tabla leída del archivo.
function aviso(crudo, limpiar) {
  const cadena = (v, max = MAX_CAMPO) => (typeof v === 'string' ? primeros(limpiar(sinCodigos(v)), max) : null);
  const paso = typeof crudo.paso === 'string' ? cadena(crudo.paso) : numero(crudo.paso);
  const d = crudo.datos && typeof crudo.datos === 'object' && !Array.isArray(crudo.datos) ? crudo.datos : null;
  const version = (v) => (typeof v === 'string' ? cadena(v) : numero(v) === null ? null : String(v));
  const p = crudo.pos && typeof crudo.pos === 'object' && !Array.isArray(crudo.pos) ? crudo.pos : null;
  const pos = p && numero(p.mapa) !== null && numero(p.x) !== null && numero(p.y) !== null ? { mapa: p.mapa, x: p.x, y: p.y } : null;
  const de = (v) => (v === undefined || v === null ? '' : String(v));
  return {
    // el id sale de los valores tal como están en el archivo, para que no cambie aunque cambie la limpieza
    id: createHash('sha256').update(`${de(crudo.fecha)}|${de(crudo.guia)}|${de(crudo.paso)}|${de(crudo.texto)}`, 'utf8').digest('hex').slice(0, 12),
    fecha: cadena(crudo.fecha),
    nivel: numero(crudo.nivel),
    raza: cadena(crudo.raza),
    clase: cadena(crudo.clase),
    faccion: cadena(crudo.faccion),
    guia: cadena(crudo.guia),
    paso,
    n: numero(crudo.n),
    addon: version(crudo.addon),
    datos: d ? { rutas: version(d.rutas), misiones: version(d.misiones) } : null,
    texto: typeof crudo.texto === 'string' ? limpiar(sinCodigos(crudo.texto)) : '',
    pos,
  };
}

// Solo «SnetForever.lua:<línea>» o el código del error: nunca la ruta (lleva la carpeta de la cuenta) ni el texto.
function motivo(e) {
  const m = /^SnetForever\.lua:\d+/.exec(String(e?.message ?? ''));
  return m ? m[0] : String(e?.code ?? 'error');
}

/**
 * Los avisos de fallo de todas las cuentas del juego: cada `<raizJuego>\WTF\Account\*\SavedVariables\SnetForever.lua`
 * (de 5 MB como mucho), en solo lectura. Un archivo que no se puede leer o que es demasiado grande se salta y se apunta
 * (sin la cuenta). Salen en orden de fecha y sin repetidos (mismo id).
 * Aviso = {id, fecha, nivel, raza, clase, faccion, guia, paso, n, addon, datos, texto, pos}: sin el personaje ni la
 * cuenta, y sin los datos personales de sinDatosPersonales. Lo que falta es null (el texto, '').
 * @param {string} raizJuego la carpeta `_forever_`
 * @param {{env?: object, registrar?: (nivel: string, texto: string) => void}} [p]
 */
export function leerFallos(raizJuego: string, { env = process.env, registrar = (nivel, texto) => log(nivel, texto) } = {}) {
  const lista = cuentas(raizJuego);
  const nombres = lista.map((c) => c.nombre);
  const salida = [];
  const vistos = new Set();
  for (const { dir } of lista) {
    const ruta = hijo(dir, 'SavedVariables') && hijo(hijo(dir, 'SavedVariables'), ARCHIVO);
    if (!ruta) continue;
    let cuenta;
    try {
      const st = statSync(ruta);
      if (!st.isFile()) continue;
      if (st.size > MAX_BYTES) {
        registrar('aviso', `avisos: se salta un ${ARCHIVO} de más de 5 MB (${st.size} bytes)`);
        continue;
      }
      cuenta = leerVariablesGuardadas(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''), GLOBAL, ARCHIVO);
    } catch (e) {
      registrar('aviso', `avisos: se salta un ${ARCHIVO} que no se puede leer (${motivo(e)})`);
      continue;
    }
    if (!cuenta || typeof cuenta !== 'object') continue;
    for (const [, crudo] of entradas(cuenta.fallos)) {
      if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) continue;
      const limpiar = (t) => sinDatosPersonales(t, { env, personaje: crudo.personaje, cuentas: nombres });
      const a = aviso(crudo, limpiar);
      if (vistos.has(a.id)) continue;
      vistos.add(a.id);
      salida.push(a);
    }
  }
  // Array.prototype.sort es estable: los de la misma fecha quedan como estaban
  return salida.sort((a, b) => ((a.fecha ?? '') < (b.fecha ?? '') ? -1 : (a.fecha ?? '') > (b.fecha ?? '') ? 1 : 0));
}

// ---------- enviados ----------

// Los ids apuntados, o null si el archivo existe y no se entiende (o no se puede leer).
function leerEnviados(env) {
  let texto;
  try {
    texto = readFileSync(join(carpetaDatos(env), ARCHIVO_ENVIADOS), 'utf8');
  } catch (e) {
    return e?.code === 'ENOENT' ? [] : null;
  }
  try {
    const j = JSON.parse(texto.replace(/^\uFEFF/, ''));
    return Array.isArray(j?.enviados) ? j.enviados.filter((id) => typeof id === 'string' && ID.test(id)) : null;
  } catch {
    return null;
  }
}

/** Los avisos que aún no se han guardado ni abierto (los que no están en `datos\avisos-enviados.json`). */
export function pendientes(avisos, { env = process.env } = {}) {
  const enviados = new Set(leerEnviados(env) ?? []);
  return (Array.isArray(avisos) ? avisos : []).filter((a) => !enviados.has(a?.id));
}

/**
 * Apunta `ids` en `datos\avisos-enviados.json` (`{"enviados": [...]}`). La lista solo crece: se escribe en un temporal y
 * se renombra encima. Si la lista que había no se entiende, va a la cuarentena de datos (no se pierde) y se empieza otra;
 * si no se puede leer (bloqueada, sin permiso), se lanza el error y no se escribe nada. Solo entran ids de 12
 * hexadecimales. Devuelve la lista entera.
 */
export function marcarEnviados(ids, { env = process.env } = {}) {
  const datos = carpetaDatos(env);
  mkdirSync(datos, { recursive: true });
  const ruta = join(datos, ARCHIVO_ENVIADOS);
  let previos = leerEnviados(env);
  if (previos === null) {
    readFileSync(ruta); // si no se puede ni leer, lanza aquí y no se toca nada
    renameSync(ruta, join(cuarentenaNueva(env), ARCHIVO_ENVIADOS));
    previos = [];
  }
  const todos = [...new Set([...previos, ...(Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && ID.test(id))])];
  const temporal = `${ruta}.${randomUUID()}.tmp`;
  writeFileSync(temporal, `${JSON.stringify({ enviados: todos }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporal, ruta);
  return todos;
}

// ---------- texto de los avisos ----------

const t = (idioma) => TEXTOS_AVISOS[idioma] || TEXTOS_AVISOS.es;
const o = (v) => (v === null || v === undefined || v === '' ? '?' : String(v));
// GitHub avisaría a quien se nombre con @: un espacio de ancho cero detrás de la @ lo evita sin que se note.
const sinMenciones = (texto) => String(texto).replace(/@(?=[\p{L}\p{N}_-])/gu, '@\u200b');

function titulo(avisos, idioma) {
  const x = t(idioma);
  if (avisos.length === 1) return x.tituloUno.replace('%g', () => o(avisos[0].guia)).replace('%n', () => o(avisos[0].n));
  return x.tituloVarios.replace('%c', () => String(avisos.length));
}

// El trozo de un aviso: sus datos en una lista y el texto citado con «> ». `texto` sustituye al del aviso (recortado).
function seccion(a, k, idioma, texto = a.texto) {
  const x = t(idioma);
  const d = a.datos && typeof a.datos === 'object' ? a.datos : {};
  const pos = a.pos && typeof a.pos === 'object' ? `${x.mapa} ${o(a.pos.mapa)} · ${o(a.pos.x)}, ${o(a.pos.y)}` : x.sinPos;
  const lineas = [
    `### ${x.aviso} ${k} (${o(a.id)})`,
    '',
    `- ${x.fecha}: ${o(a.fecha)}`,
    `- ${x.addon}: ${o(a.addon)} · ${x.datos}: rutas ${o(d.rutas)}, misiones ${o(d.misiones)}`,
    `- ${x.personaje}: ${x.nivel} ${o(a.nivel)} · ${o(a.raza)} · ${o(a.clase)} · ${o(a.faccion)}`,
    `- ${x.guia}: ${o(a.guia)} · ${x.paso} ${o(a.paso)} · ${x.n} ${o(a.n)}`,
    `- ${x.pos}: ${pos}`,
    '',
    ...sinCodigos(texto ?? '').split(/\r?\n/).map((l) => `> ${l}`),
  ];
  return sinMenciones(lineas.join('\n'));
}

// encodeURIComponent deja ! ' ( ) * sin codificar; aquí también se codifican, para que la URL no lleve comillas (abrirUrl).
const enc = (texto) => encodeURIComponent(texto).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const cuerpo = (avisos, idioma, recorte?: any) => `${avisos.map((a, i) => seccion(a, i + 1, idioma, i === 0 && recorte !== undefined ? recorte : a.texto)).join('\n\n')}\n`;

/** El texto entero de los avisos, en Markdown (título y cuerpo): el del archivo y el del portapapeles. */
export function textoAvisos(avisos, idioma = 'es') {
  const lista = Array.isArray(avisos) ? avisos : [];
  return `# ${sinMenciones(titulo(lista, idioma))}\n\n${cuerpo(lista, idioma)}`;
}

/**
 * La URL de una issue nueva de GitHub con los avisos (la vía en segundo lugar: exige cuenta de GitHub):
 * `https://github.com/<repo>/issues/new?title=<enc>&body=<enc>`, de MAX_URL (7.500) caracteres como mucho. Entran los
 * primeros avisos que caben y al menos uno: si el primero no cabe solo, su texto se recorta y acaba en «…».
 * `repo` pasa por repoDe (uno que no vale es el de por defecto). Sin avisos, o si el primero no cabe ni con el texto
 * vacío, `{url: null, incluidos: []}`.
 * @returns {{url: string|null, incluidos: string[]}}
 */
export function urlIssue(repo, avisos, idioma = 'es') {
  const lista = Array.isArray(avisos) ? avisos : [];
  if (lista.length === 0) return { url: null, incluidos: [] };
  const base = `https://github.com/${repoDe({ actualizaciones: { repo } })}/issues/new?title=`;
  const montar = (parte, recorte?: any) => `${base}${enc(sinMenciones(titulo(parte, idioma)))}&body=${enc(cuerpo(parte, idioma, recorte))}`;
  let url = montar(lista.slice(0, 1));
  if (url.length > MAX_URL) {
    // el primero solo no cabe: el texto más largo que quepa, con «…» (búsqueda binaria sobre los caracteres)
    const letras = Array.from(String(lista[0].texto ?? ''));
    let bajo = 0;
    let alto = letras.length;
    while (bajo < alto) {
      const medio = Math.ceil((bajo + alto) / 2);
      if (montar(lista.slice(0, 1), `${letras.slice(0, medio).join('')}…`).length <= MAX_URL) bajo = medio;
      else alto = medio - 1;
    }
    const recortada = montar(lista.slice(0, 1), `${letras.slice(0, bajo).join('')}…`);
    // revisión final, m6: si ni con el texto vacío cabe (los campos cortos ya pasan: un SnetForever.lua manipulado), no
    // hay URL; el menú dice «no se pudo» y quedan el archivo y el portapapeles
    if (recortada.length > MAX_URL) return { url: null, incluidos: [] };
    return { url: recortada, incluidos: [lista[0].id] };
  }
  let k = 1;
  while (k < lista.length) {
    const siguiente = montar(lista.slice(0, k + 1));
    if (siguiente.length > MAX_URL) break;
    url = siguiente;
    k++;
  }
  return { url, incluidos: lista.slice(0, k).map((a) => a.id) };
}

/**
 * Guarda textoAvisos(avisos) en un archivo nuevo, `datos\avisos\avisos-<sello>.txt` (con -1, -2… si ya existe: nunca se
 * pisa uno), en UTF-8. Devuelve su ruta, o null sin avisos. Es la vía que sale primero (F5-3).
 */
export function archivoAvisos(avisos, { env = process.env, idioma = 'es' } = {}) {
  if (!Array.isArray(avisos) || avisos.length === 0) return null;
  const dir = join(carpetaDatos(env), 'avisos');
  mkdirSync(dir, { recursive: true });
  const texto = textoAvisos(avisos, idioma);
  const s = sello();
  for (let i = 0; ; i++) {
    const ruta = join(dir, i === 0 ? `avisos-${s}.txt` : `avisos-${s}-${i}.txt`);
    try {
      writeFileSync(ruta, texto, { encoding: 'utf8', flag: 'wx' });
      return ruta;
    } catch (e) {
      if (e?.code !== 'EEXIST') throw e;
    }
  }
}
