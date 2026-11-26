// Adaptado de NeverQuestAlone (MIT; © 2026 chelinho139 y los autores de NeverQuestAlone), bridge/transport/fsretry.mjs, commit 3a9b93c.
//
// Ayudas comunes para escribir en la carpeta AddOns del juego (buzón, timbres e instalación):
//   · reintentos ante los bloqueos de Windows (EPERM, EACCES, EBUSY) a los 25, 50 y 75 ms;
//   · comprobar que una carpeta es de verdad una carpeta de AddOns (ni enlace ni unión hacia fuera);
//   · la cuarentena del volumen del juego (`<raíz del volumen>\_CUARENTENA\SnetForever\<sello>\`), donde va todo lo que se
//     sustituye o se aparta de AddOns. Siempre se renombra dentro del mismo volumen: nunca se borra nada.
import { join, sep } from 'node:path';
import { sello } from './rutas.mjs';

export const CODIGOS_OCUPADO = Object.freeze(['EPERM', 'EACCES', 'EBUSY']);
export const ESPERAS_REINTENTO = Object.freeze([25, 50, 75]);

export function fallo(codigo, texto) {
  return Object.assign(new Error(texto), { code: codigo });
}

/** ¿Existe `ruta`? Mira con lstat, así que un enlace roto también cuenta (existsSync diría que no). */
export function existe(fs, ruta) {
  try {
    fs.lstatSync(ruta);
    return true;
  } catch {
    return false;
  }
}

/**
 * Un reintentador por tanda de escrituras (como el de fsretry): `ejecutar(operacion)` devuelve lo que devuelva la operación
 * o lanza su último error; ante un bloqueo reintenta tras 25, 50 y 75 ms. Cuando una operación agota sus reintentos, las
 * siguientes de la misma tanda se intentan una sola vez (una carpeta que sigue bloqueada cuesta una espera, no una por archivo).
 */
export function crearReintentador({ dormir }) {
  let rendido = false;
  return {
    get rendido() {
      return rendido;
    },
    async ejecutar(operacion) {
      for (let intento = 0; ; intento++) {
        try {
          return operacion();
        } catch (e) {
          const ocupado = CODIGOS_OCUPADO.includes(e?.code);
          if (!ocupado || rendido || intento >= ESPERAS_REINTENTO.length) {
            if (ocupado) rendido = true;
            throw e;
          }
          await dormir(ESPERAS_REINTENTO[intento]);
        }
      }
    },
  };
}

/** Una sola operación con sus reintentos. */
export function conReintentos(operacion, dormir) {
  return crearReintentador({ dormir }).ejecutar(operacion);
}

const realpath = (fs, ruta) => (fs.realpathSync.native || fs.realpathSync)(ruta);
const minusculas = (t) => t.toLowerCase();
const conSeparador = (t) => (t.endsWith(sep) ? t : t + sep);

/**
 * Comprueba que `dir` es una carpeta de verdad (ni enlace simbólico ni unión) y que su ruta real queda dentro de `base`.
 * Errores con `code`: 'FALTA' (no existe) o 'ENLACE' (es un enlace, no es carpeta o lleva fuera de `base`).
 */
export function carpetaSegura(fs, base, dir) {
  let st;
  try {
    st = fs.lstatSync(dir);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') throw fallo('FALTA', 'no existe');
    throw e;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) throw fallo('ENLACE', 'no es una carpeta normal');
  const real = minusculas(realpath(fs, dir));
  if (!real.startsWith(minusculas(conSeparador(realpath(fs, base))))) throw fallo('ENLACE', 'lleva fuera de la carpeta esperada');
  return real;
}

/**
 * Raíz del volumen de una ruta real de Windows, siempre absoluta y terminada en «\»: `E:\`, `\\servidor\recurso\`,
 * `\\?\E:\` o `\\?\UNC\servidor\recurso\`. Pura (no mira el disco). Una ruta que no sea absoluta (relativa, `\wow` sin
 * unidad, `E:wow`, una UNC sin recurso…) da un error `CUARENTENA`: la cuarentena nunca se crea en un sitio relativo.
 */
export function raizDelVolumen(real) {
  const r = typeof real === 'string' ? real : '';
  let m = /^\\\\[?.]\\UNC\\([^\\]+)\\([^\\]+)(?:\\|$)/i.exec(r);
  if (m) return `${r.slice(0, 4)}UNC\\${m[1]}\\${m[2]}\\`;
  m = /^\\\\[?.]\\([A-Za-z]):(?:\\|$)/.exec(r);
  if (m) return `${r.slice(0, 4)}${m[1]}:\\`;
  m = /^\\\\([^\\?.][^\\]*)\\([^\\]+)(?:\\|$)/.exec(r);
  if (m) return `\\\\${m[1]}\\${m[2]}\\`;
  m = /^([A-Za-z]):(?:\\|$)/.exec(r);
  if (m) return `${m[1]}:\\`;
  throw fallo('CUARENTENA', 'la raíz del volumen no es una ruta absoluta');
}

// Una carpeta de la cuarentena: si existe tiene que ser una carpeta normal dentro de la raíz; si no, se crea.
function asegurarCarpeta(fs, raiz, ruta) {
  if (existe(fs, ruta)) {
    carpetaSegura(fs, raiz, ruta);
  } else {
    fs.mkdirSync(ruta);
  }
}

/**
 * Función `mover(origen, nombre)` que aparta un archivo a `<raíz del volumen de addonsDir>\_CUARENTENA\SnetForever\<sello>\`
 * (el sello da una carpeta nueva por tanda). La carpeta se crea solo al mover algo, comprobando con lstat y realpath que
 * no hay enlaces. Si no se puede crear, lanza un error `CUARENTENA` y el archivo se queda en su sitio. Devuelve la ruta
 * nueva. `raiz` fuerza otra raíz (las pruebas); por defecto es la del volumen del realpath de `addonsDir`.
 */
export function cuarentenaDelVolumen({ fs, addonsDir, raiz }) {
  let carpeta = null;
  const preparar = () => {
    const base = raiz || raizDelVolumen(realpath(fs, addonsDir));
    const nivel1 = join(base, '_CUARENTENA');
    const nivel2 = join(nivel1, 'SnetForever');
    asegurarCarpeta(fs, base, nivel1);
    asegurarCarpeta(fs, base, nivel2);
    for (let i = 0; ; i++) {
      const ruta = join(nivel2, i === 0 ? sello() : `${sello()}-${i}`);
      try {
        fs.mkdirSync(ruta);
        return ruta;
      } catch (e) {
        if (e.code !== 'EEXIST' || i > 50) throw e;
      }
    }
  };
  return (origen, nombre) => {
    try {
      carpeta ??= preparar();
      const destino = join(carpeta, nombre);
      fs.renameSync(origen, destino);
      return destino;
    } catch (e) {
      throw Object.assign(fallo('CUARENTENA', `no se pudo apartar a la cuarentena (${e.code || e.message})`), { causa: e });
    }
  };
}
