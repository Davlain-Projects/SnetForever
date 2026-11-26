// Mover archivos y carpetas sin pisar nunca nada, también entre unidades (fase 5, tarea 3; vigilancia 3).
// Es el único archivo de la app que puede quitar algo (la prueba de cumplimiento lo vigila), y solo en dos casos:
// - el nombre viejo de un archivo después de enlazarlo (enlace duro) con el nombre nuevo, que es mover sin pisar;
// - el original, después de copiarlo a otra unidad (EXDEV, p. ej. la cuarentena de E: con el juego en C:) y comprobar la
//   copia byte a byte.
// Basado en `moverSinPisar` de tools/conversor/src/instalar.js, ampliado a carpetas.
import {
  closeSync, constants, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, renameSync, rmdirSync,
  statSync, unlinkSync,
} from 'node:fs';
import { basename, dirname, join, parse } from 'node:path';

const dos = (n) => String(n).padStart(2, '0');

/** Sufijo con fecha y hora local: `-AAAAMMDD-HHMMSS`. */
function sufijoFecha(d) {
  return `-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`;
}

/** Una ruta libre a partir de `destino`: si ya existe, le añade el sufijo con fecha y hora (y después `-2`, `-3`…). */
export function rutaLibre(destino, ahora = new Date()) {
  if (!existeAlgo(destino)) return destino;
  const { dir, name, ext } = parse(destino);
  const base = join(dir, `${name}${sufijoFecha(ahora)}`);
  let ruta = `${base}${ext}`;
  for (let n = 2; existeAlgo(ruta); n += 1) ruta = `${base}-${n}${ext}`;
  return ruta;
}

// existsSync sigue los enlaces: un enlace roto también ocupa el nombre.
function existeAlgo(ruta) {
  if (existsSync(ruta)) return true;
  try {
    lstatSync(ruta);
    return true;
  } catch {
    return false;
  }
}

function errorCopia(texto, { causa, copia }: { causa?: any; copia?: any; } = {}) {
  const e: Error & { code: string; copia?: string } = Object.assign(new Error(texto, causa ? { cause: causa } : undefined), { code: 'COPIA' });
  if (copia) e.copia = copia;
  return e;
}

// Códigos con los que linkSync dice que el sistema de archivos no admite enlaces duros (FAT, exFAT…). En Windows,
// ERROR_INVALID_FUNCTION llega como EISDIR.
const SIN_ENLACES_DUROS = new Set(['EPERM', 'ENOSYS', 'EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'EISDIR']);
// Tope de reintentos si cada ruta libre aparece ocupada al ir a usarla (no debería pasar más de una o dos veces).
const MAX_INTENTOS = 1000;
// Tamaño de los trozos al comparar.
const TROZO = 1024 * 1024;

/**
 * Lo que hay en `origen`: sus carpetas (en orden de recorrido, la raíz primero, como rutas relativas; '' es la raíz) y sus
 * archivos con su tamaño y su fecha. Un enlace simbólico o una unión (en la raíz o dentro) no se sigue: lanza COPIA antes
 * de copiar nada, para que quitar el original nunca alcance archivos de fuera.
 */
function inventario(origen) {
  const raiz = lstatSync(origen);
  if (raiz.isSymbolicLink()) throw errorCopia(`«${origen}» es un enlace o una unión: no se mueve a otra unidad`);
  const ficha = (rel, info) => ({ rel, size: info.size, mtimeMs: info.mtimeMs });
  if (raiz.isFile()) return { esCarpeta: false, carpetas: [], archivos: [ficha('', raiz)] };
  if (!raiz.isDirectory()) throw errorCopia(`«${origen}» no es un archivo ni una carpeta`);
  const carpetas = [''];
  const archivos = [];
  const recorrer = (rel) => {
    for (const nombre of readdirSync(join(origen, rel))) {
      const r = rel ? join(rel, nombre) : nombre;
      const info = lstatSync(join(origen, r));
      if (info.isSymbolicLink()) throw errorCopia(`«${join(origen, r)}» es un enlace o una unión: no se mueve «${origen}» a otra unidad`);
      if (info.isDirectory()) {
        carpetas.push(r);
        recorrer(r);
      } else if (info.isFile()) archivos.push(ficha(r, info));
      else throw errorCopia(`«${join(origen, r)}» no es un archivo ni una carpeta`);
    }
  };
  recorrer('');
  return { esCarpeta: true, carpetas, archivos };
}

const en = (base, rel) => (rel ? join(base, rel) : base);

/** ¿Tienen `a` y `b` los mismos bytes? Se leen por trozos de 1 MB, sin cargar los archivos enteros. */
function mismosBytes(a, b) {
  const fa = openSync(a, 'r');
  try {
    const fb = openSync(b, 'r');
    try {
      const ba = Buffer.allocUnsafe(TROZO);
      const bb = Buffer.allocUnsafe(TROZO);
      for (let pos = 0; ;) {
        const na = readSync(fa, ba, 0, TROZO, pos);
        const nb = readSync(fb, bb, 0, TROZO, pos);
        if (na !== nb) return false;
        if (na === 0) return true;
        if (!ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
        pos += na;
      }
    } finally {
      closeSync(fb);
    }
  } finally {
    closeSync(fa);
  }
}

// ¿Sigue el archivo como en el inventario (mismo tamaño y misma fecha de modificación)?
function sinCambios(ruta, { size, mtimeMs }) {
  try {
    const info = lstatSync(ruta);
    return info.isFile() && info.size === size && info.mtimeMs === mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Mueve `origen` (archivo o carpeta) a `destino` sin pisar nunca: si `destino` ya existe, usa una ruta con sufijo
 * `-AAAAMMDD-HHMMSS` (y un contador).
 *
 * - **Archivos:** enlace duro con el nombre nuevo (`linkSync`, que falla con EEXIST si el nombre ya está cogido, así que
 *   un archivo ajeno que aparezca entre medias nunca se pisa: se elige otra ruta) y después se quita el nombre viejo. Si
 *   el sistema de archivos no admite enlaces duros (FAT/exFAT: EPERM, ENOTSUP…), plan B: se reserva el nombre con
 *   `openSync(final, 'wx')` y se renombra sobre esa reserva propia. Si el renombre falla, la reserva vacía se queda (va en
 *   `e.reserva`).
 * - **Carpetas:** `renameSync`. En Windows no reemplaza una carpeta que ya existe (da EPERM), pero sí un *archivo* que
 *   aparezca con ese nombre justo entre `rutaLibre` y el renombre: Node no tiene un renombre que no reemplace, y esa
 *   ventana (de microsegundos, en una ruta con sello) queda abierta.
 * - **Otra unidad (EXDEV):**
 *   1. se copia todo a la ruta final sin sobrescribir (`mkdirSync` sin `recursive` y `COPYFILE_EXCL`);
 *   2. se compara cada archivo byte a byte con su original, por trozos;
 *   3. se vuelve a mirar el tamaño y la fecha de cada original (si cambió desde el inventario, COPIA);
 *   4. solo entonces se quita el original: `unlinkSync` de cada archivo (mirando otra vez su tamaño y su fecha justo antes)
 *      y `rmdirSync` de las carpetas, de abajo arriba (`rmdirSync` solo quita carpetas vacías).
 *
 * Errores:
 * - `code = 'COPIA'`: la copia falló, no cuadra o el original cambió. El original queda entero. Si algo llegó a copiarse,
 *   `e.copia` es la ruta de esa copia a medias (nunca se borra); `cause` lleva el error de fondo si lo hubo.
 * - Con `e.copia` y otro código (EBUSY, EPERM, ENOTEMPTY…): **mover terminado a medias**. La copia completa y comprobada
 *   (o el enlace duro) ya está en `e.copia`, pero el original no se pudo quitar del todo: en una carpeta, unos archivos ya
 *   no están y otros sí (en AddOns, un addon roto). Quien llama (tareas 8 y 9) debe tratarlo como tal: no dar por hecho el
 *   movimiento ni volver a mover el original sin más, sino apuntarlo y decidir (p. ej. pedir que se cierre el juego y
 *   reintentar el quitado, o restaurar desde `e.copia`).
 * - Cualquier otro error (ENOENT si el origen no existe, EBUSY o EPERM del renombre…) se lanza tal cual, sin tocar nada.
 * @param {string} origen
 * @param {string} destino
 * @param {{renombrar?: Function, enlazar?: Function, copiar?: Function, quitar?: Function, ahora?: Date}} [opciones]
 *   `renombrar` (renameSync), `enlazar` (linkSync), `copiar` (copyFileSync) y `quitar` (unlinkSync) solo se cambian en
 *   pruebas; `ahora` da la fecha del sufijo
 * @returns {string} la ruta final
 */
export function moverSinPisar(origen: string, destino: string, {
  renombrar = renameSync, enlazar = linkSync, copiar = copyFileSync, quitar = unlinkSync, ahora = new Date(),
} = {}) {
  const info = lstatSync(origen); // ENOENT si no existe, antes de crear nada
  const esEnlace = info.isSymbolicLink();
  let esCarpeta = info.isDirectory();
  if (esEnlace) {
    try {
      esCarpeta = statSync(origen).isDirectory(); // una unión o un enlace a carpeta se renombra como una carpeta
    } catch {
      esCarpeta = false; // enlace roto
    }
  }
  mkdirSync(dirname(destino), { recursive: true });
  const op = { renombrar, enlazar, copiar, quitar, ahora };
  if (esCarpeta) {
    const final = rutaLibre(destino, ahora);
    try {
      renombrar(origen, final);
      return final;
    } catch (e) {
      if (e?.code !== 'EXDEV') throw e;
    }
    return copiarYQuitar(origen, final, op, false);
  }
  const r = moverArchivo(origen, destino, op, esEnlace);
  return r.hecho ? r.final : copiarYQuitar(origen, r.final, op, r.reservado);
}

/**
 * Un archivo en la misma unidad: enlace duro + quitar el nombre viejo, o el plan B (reserva `wx` + renombre). Devuelve
 * `{hecho: true, final}` o, con EXDEV, `{hecho: false, final, reservado}` para seguir por la copia (`reservado`: `final`
 * es una reserva vacía nuestra, sobre la que se copia).
 */
function moverArchivo(origen, destino, { renombrar, enlazar, quitar, ahora }, esEnlace) {
  // Un enlace simbólico a archivo va directo al plan B: no se hace un enlace duro de un enlace.
  let sinEnlacesDuros = esEnlace;
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const final = rutaLibre(destino, ahora);
    if (!sinEnlacesDuros) {
      try {
        enlazar(origen, final);
      } catch (e) {
        if (e?.code === 'EEXIST') continue; // otro lo creó entre medias: otra ruta
        if (e?.code === 'EXDEV') return { hecho: false, final, reservado: false };
        if (!SIN_ENLACES_DUROS.has(e?.code)) throw e;
        sinEnlacesDuros = true;
      }
      if (!sinEnlacesDuros) {
        try {
          quitar(origen);
        } catch (e) {
          throw Object.assign(e, { copia: final });
        }
        return { hecho: true, final };
      }
    }
    // plan B: reservar el nombre (falla con EEXIST si ya está cogido) y renombrar sobre la reserva propia
    let fd;
    try {
      fd = openSync(final, 'wx');
    } catch (e) {
      if (e?.code === 'EEXIST') continue;
      throw e;
    }
    closeSync(fd);
    try {
      renombrar(origen, final);
      return { hecho: true, final };
    } catch (e) {
      if (e?.code === 'EXDEV') return { hecho: false, final, reservado: true };
      throw Object.assign(e, { reserva: final });
    }
  }
  throw Object.assign(new Error(`No se encontró una ruta libre para «${destino}»`), { code: 'EEXIST' });
}

/** Otra unidad: copia, comprueba, vuelve a mirar el original y solo entonces lo quita (ver moverSinPisar). */
function copiarYQuitar(origen, final, { copiar, quitar }, reservado) {
  let ficha;
  try {
    ficha = inventario(origen);
  } catch (e) {
    throw reservado ? Object.assign(e, { reserva: final }) : e; // la reserva vacía del plan B se queda
  }
  const { esCarpeta, carpetas, archivos } = ficha;
  // la ruta final en cuanto haya algo nuestro en ella (con EEXIST de mkdirSync o de COPYFILE_EXCL, otro cogió la ruta
  // entre medias y en ella no hay nada nuestro)
  let copia = reservado ? final : undefined;
  try {
    if (esCarpeta) {
      mkdirSync(final);
      copia = final;
      for (const c of carpetas.slice(1)) mkdirSync(en(final, c));
      for (const { rel } of archivos) copiar(en(origen, rel), en(final, rel), constants.COPYFILE_EXCL);
    } else if (reservado) {
      copiar(origen, final); // sobre la reserva vacía, que es nuestra
    } else {
      try {
        copiar(origen, final, constants.COPYFILE_EXCL);
        copia = final;
      } catch (e) {
        if (e?.code !== 'EEXIST' && existeAlgo(final)) copia = final;
        throw e;
      }
    }
  } catch (e) {
    throw errorCopia(`No se pudo copiar «${origen}» en «${final}»: no se quita el original`, { causa: e, copia });
  }
  for (const { rel } of archivos) {
    let igual = false;
    try {
      igual = mismosBytes(en(final, rel), en(origen, rel));
    } catch (e) {
      throw errorCopia(`No se pudo comprobar la copia de «${en(origen, rel)}»: no se quita «${origen}»`, { causa: e, copia });
    }
    if (!igual) throw errorCopia(`La copia de «${en(origen, rel)}» en «${en(final, rel)}» no es idéntica: no se quita «${origen}»`, { copia });
  }
  const cambiado = (ficha) => errorCopia(
    `«${en(origen, ficha.rel)}» ha cambiado (tamaño o fecha) mientras se copiaba: no se quita «${origen}»`, { copia },
  );
  for (const ficha of archivos) if (!sinCambios(en(origen, ficha.rel), ficha)) throw cambiado(ficha);
  try {
    for (const [i, ficha] of archivos.entries()) {
      if (!sinCambios(en(origen, ficha.rel), ficha)) {
        if (i === 0) throw cambiado(ficha);
        // ya se quitó algo: no es COPIA (el original ya no está entero), es un mover a medias
        throw Object.assign(new Error(`«${en(origen, ficha.rel)}» ha cambiado a mitad de quitar «${origen}»`), { code: 'CAMBIADO' });
      }
      quitar(en(origen, ficha.rel));
    }
    if (esCarpeta) for (const c of [...carpetas].reverse()) rmdirSync(en(origen, c));
  } catch (e) {
    throw Object.assign(e, { copia: final });
  }
  return final;
}

/** `moverSinPisar(origen, join(carpetaDestino, basename(origen)), opciones)`. */
export function moverDentro(origen, carpetaDestino, opciones?: any) {
  return moverSinPisar(origen, join(carpetaDestino, basename(origen)), opciones);
}
