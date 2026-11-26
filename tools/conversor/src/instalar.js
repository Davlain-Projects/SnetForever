// Escritura segura de las carpetas de los addons: limpieza de `addons/` (a la cuarentena) y copia a la carpeta AddOns
// del juego moviendo a la cuarentena (sin pisar nada) lo que la nueva versión ya no trae.
import {
  copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync,
} from 'node:fs';
import { dirname, join, parse, relative, win32 } from 'node:path';

/** Rutas relativas (con `/`) de todos los archivos de una carpeta. */
export function listarArchivos(dir, base = dir) {
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...listarArchivos(ruta, base));
    else salida.push(relative(base, ruta).replace(/\\/g, '/'));
  }
  return salida;
}

/**
 * Aparta de `dir` (una carpeta de `addons/` o de otra salida) los archivos que la nueva versión no ha escrito.
 * Lote C (revisión 52, Minor 7): nunca se borra nada, tampoco dentro de `addons/` del repositorio (allí git guarda otra
 * copia, pero la regla es una sola): cada sobrante se mueve, sin pisar nada, a `<cuarentena>/<sello>/<nombre>/<ruta>`.
 * @param {string} dir carpeta del addon
 * @param {string[]} generados archivos escritos por la nueva versión (relativos a `dir`)
 * @param {{cuarentena: string, nombre?: string, sello?: string, renombrar?: Function}} opciones `cuarentena` es
 *   obligatoria (sin ella no se toca nada); `nombre` (por defecto, el de la carpeta) y `sello` (por defecto, el de ahora)
 * @returns {string[]} los archivos apartados (relativos)
 */
export function limpiarSobrantes(dir, generados, { cuarentena, nombre, sello, renombrar } = {}) {
  if (!existsSync(dir)) return [];
  const quedan = new Set(generados.map((f) => f.replace(/\\/g, '/')));
  const sobrantes = listarArchivos(dir).filter((f) => !quedan.has(f));
  if (sobrantes.length === 0) return [];
  if (!cuarentena) throw new Error(`limpiarSobrantes: falta la carpeta de cuarentena; no se toca nada de «${dir}»`);
  const raiz = join(cuarentena, sello ?? selloDeAhora(), nombre ?? parse(dir).base);
  for (const f of sobrantes) moverSinPisar(join(dir, ...f.split('/')), join(raiz, ...f.split('/')), { renombrar });
  return sobrantes;
}

/** `<raíz del volumen de ruta>\_CUARENTENA\SnetForever`: la cuarentena del disco de la salida (como la app). */
export function cuarentenaDelVolumen(ruta) {
  const { root } = win32.parse(win32.resolve(ruta));
  return win32.join(root, '_CUARENTENA', 'SnetForever');
}

/** Sello de la carpeta de cuarentena, `AAAA-MM-DD_HHMMSS`, como `banco-wow/src/instalar.js`. */
export function selloDeAhora(d = new Date()) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`;
}

const dos = (n) => String(n).padStart(2, '0');
/** Sufijo con fecha y hora: `-AAAAMMDD-HHMMSS`. */
function sufijoFecha(d = new Date()) {
  return `-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`;
}

/** Una ruta libre a partir de `destino`: si ya existe, le añade el sufijo con fecha y hora (y un contador). */
export function rutaLibre(destino, ahora = new Date()) {
  if (!existsSync(destino)) return destino;
  const { dir, name, ext } = parse(destino);
  const base = join(dir, `${name}${sufijoFecha(ahora)}`);
  let ruta = `${base}${ext}`;
  for (let n = 2; existsSync(ruta); n += 1) ruta = `${base}-${n}${ext}`;
  return ruta;
}

/**
 * Mueve `origen` a `destino` sin sobrescribir nunca: si `destino` ya existe, usa una ruta con sufijo
 * de fecha y hora. Si están en unidades distintas (EXDEV), copia, comprueba que la copia es idéntica
 * y solo entonces quita el original; si la copia no cuadra, deja el original y lanza un error.
 * @param {{renombrar?: Function, ahora?: Date}} [opciones] `renombrar` (renameSync) solo se cambia en pruebas
 * @returns {string} la ruta final
 */
export function moverSinPisar(origen, destino, { renombrar = renameSync, ahora = new Date() } = {}) {
  mkdirSync(dirname(destino), { recursive: true });
  const final = rutaLibre(destino, ahora);
  try {
    renombrar(origen, final);
  } catch (e) {
    if (e?.code !== 'EXDEV') throw e;
    copyFileSync(origen, final);
    const igual = statSync(final).size === statSync(origen).size
      && readFileSync(final).equals(readFileSync(origen));
    if (!igual) throw new Error(`La copia de «${origen}» en «${final}» no es idéntica: no se quita el original`);
    unlinkSync(origen);
  }
  return final;
}

/**
 * Copia (sobrescribe) la carpeta del addon al destino. Los `.lua` que ya estaban en el destino y
 * la nueva versión no trae no se borran: se mueven a `cuarentena/<version>/<nombre>/`, sin pisar nada.
 * @param {string} origenDir carpeta generada (en `addons/`)
 * @param {string} destinoDir carpeta del addon en AddOns
 * @param {{version: string, nombre: string, cuarentena: string, renombrar?: Function}} opciones
 * @returns {{copiados: number, aCuarentena: string[], destino: string}} `aCuarentena`: rutas finales
 */
export function instalarAddon(origenDir, destinoDir, { version, nombre, cuarentena, renombrar }) {
  const nuevos = new Set(listarArchivos(origenDir));
  const aCuarentena = [];
  if (existsSync(destinoDir)) {
    for (const f of listarArchivos(destinoDir)) {
      if (!f.toLowerCase().endsWith('.lua') || nuevos.has(f)) continue;
      const aqui = join(cuarentena, version, nombre, ...f.split('/'));
      aCuarentena.push(moverSinPisar(join(destinoDir, ...f.split('/')), aqui, { renombrar }));
    }
  }
  mkdirSync(destinoDir, { recursive: true });
  cpSync(origenDir, destinoDir, { recursive: true, force: true });
  return { copiados: nuevos.size, aCuarentena, destino: destinoDir };
}
