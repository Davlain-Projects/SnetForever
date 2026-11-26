// Timbres de la app (protocolo P3): .wav vacíos en `SnetForever\senales\` que la app «toca» renombrando `x.wav` a
// `x.wav.fuera` durante el pulso y devolviéndolo después. El addon pregunta con PlaySoundFile si el archivo está.
//
//   timbre_a / timbre_b          pulso de 3 s, alternos: hay buzón nuevo, cargar la siguiente ranura
//   recibido_par / recibido_impar pulso de 3 s: mensaje completo (la paridad es la del n del id)
//   vivo_a / vivo_b               pulso de 2,5 s, alternos, cada 10 s mientras la app funciona
//
// Los dos timbres de una pareja nunca faltan a la vez: los pulsos de una pareja van uno detrás de otro. Nada se borra.
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { carpetaSegura, conReintentos, cuarentenaDelVolumen, existe, fallo } from './fsseguro.mjs';

export const PAREJAS = {
  timbre: ['timbre_a', 'timbre_b'],
  recibido: ['recibido_par', 'recibido_impar'],
  vivo: ['vivo_a', 'vivo_b'],
};
// Los 7 .wav de la carpeta de señales: los 6 timbres y `presente`, que siempre está y no se toca.
export const TIMBRES_ARCHIVOS = ['presente', ...Object.values(PAREJAS).flat()];
export const PULSO_MS = { timbre: 3000, recibido: 3000, vivo: 2500 };
export const VIDA_CADA_MS = 10_000;

// Espera que se puede cancelar (para que parar() no deje un temporizador vivo).
function dormirCancelable(ms) {
  let temporizador;
  const promesa: Promise<void> & { cancelar?: () => void } = new Promise<void>((resolver) => {
    temporizador = setTimeout(resolver, ms);
  });
  promesa.cancelar = () => clearTimeout(temporizador);
  return promesa;
}

const relojReal = {
  cada(f, ms) {
    const t = setInterval(f, ms);
    t.unref?.();
    return () => clearInterval(t);
  },
};

const renombrar = (fs, de, a, dormir) => conReintentos(() => fs.renameSync(de, a), dormir);

export const ESPERA_PAREJA_MS = 250; // cuánto se aplaza un pulso si el compañero de la pareja no está
export const INTENTOS_PAREJA = 4;

/**
 * Los timbres de la carpeta de AddOns `addonsDir`. Opciones: `pulsoMs` ({timbre, recibido, vivo}), `dormir(ms)` (para las
 * pruebas), `reloj.cada(f, ms) -> cancelar`, `fs` y `raizVolumen` (raíz del volumen donde va la _CUARENTENA; por defecto la
 * del volumen de addonsDir).
 *
 * Al crearlos devuelve a su nombre cualquier `*.wav.fuera` que haya quedado; si el .wav ya está, el .fuera viejo va a la
 * cuarentena del volumen. `avisos` y `fueraAhora()` dicen lo que no se pudo arreglar. Antes de cada pulso se reintenta
 * devolver los de su pareja que sigan fuera, y nunca se saca un timbre si su compañero no está (el pulso se aplaza unos
 * intentos y, si no vuelve, falla con `PAREJA` sin tocar nada).
 *
 *   tocar('timbre' | 'recibido_par' | 'recibido_impar') -> Promise<true>   (false si ya se paró)
 *   empezarVida()                      toca vivo_a/vivo_b alternos ya y cada 10 s
 *   parar() -> Promise                 detiene la vida, termina cada pulso a medias devolviendo su timbre
 */
export function crearTimbres(addonsDir, { pulsoMs = {}, dormir = dormirCancelable, reloj = relojReal, fs = fsReal, raizVolumen }: {
  pulsoMs?: any;
  dormir?: typeof dormirCancelable;
  reloj?: typeof relojReal;
  fs?: typeof fsReal;
  raizVolumen?: any;
} = {}) {
  const senales = join(addonsDir, 'SnetForever', 'senales');
  const pulsos = { ...PULSO_MS, ...pulsoMs };
  const dormirReintento = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
  const mover = cuarentenaDelVolumen({ fs, addonsDir, raiz: raizVolumen });
  const avisos = []; // lo que no se pudo arreglar al arrancar: {codigo, archivo}
  const fuera = new Set(); // timbres que no se pudieron devolver a su nombre: cada pulso de su pareja lo reintenta

  // Lo que quedó fuera de una ejecución anterior vuelve a su nombre. Si el sitio ya está ocupado por otro .wav, el .fuera
  // viejo sobra: va a la cuarentena del volumen.
  carpetaSegura(fs, addonsDir, senales);
  for (const nombre of fs.readdirSync(senales)) {
    if (!nombre.endsWith('.wav.fuera')) continue;
    const archivo = nombre.slice(0, -'.wav.fuera'.length);
    const normal = join(senales, `${archivo}.wav`);
    try {
      if (existe(fs, normal)) {
        mover(join(senales, nombre), nombre);
        avisos.push({ codigo: 'FUERA_VIEJO', archivo: nombre });
      } else {
        fs.renameSync(join(senales, nombre), normal);
      }
    } catch (e) {
      if (!existe(fs, normal)) fuera.add(archivo);
      avisos.push({ codigo: e.code || 'ERROR', archivo: nombre });
    }
  }

  const cadenas = { timbre: Promise.resolve(), recibido: Promise.resolve(), vivo: Promise.resolve() };
  const turnos = { timbre: 0, recibido: 0, vivo: 0 };
  let parado = false;
  let cancelarVida = null;
  let avisarParada;
  const paradaSenal = new Promise((resolver) => {
    avisarParada = resolver;
  });

  async function esperar(ms) {
    const espera = dormir(ms);
    try {
      await Promise.race([espera, paradaSenal]);
    } finally {
      espera?.cancelar?.();
    }
  }

  async function devolver(archivo) {
    const normal = join(senales, `${archivo}.wav`);
    try {
      await renombrar(fs, `${normal}.fuera`, normal, dormirReintento);
      fuera.delete(archivo);
    } catch (e) {
      fuera.add(archivo);
      throw e;
    }
  }

  // Reintenta devolver los timbres de la pareja que se quedaron fuera.
  async function devolverDe(pareja) {
    for (const archivo of PAREJAS[pareja]) {
      if (!fuera.has(archivo)) continue;
      try {
        await devolver(archivo);
      } catch {
        // sigue fuera
      }
    }
  }

  async function pulso(pareja, archivoFijo) {
    if (parado) return false;
    const [primero, segundo] = PAREJAS[pareja];
    const archivo = archivoFijo || PAREJAS[pareja][turnos[pareja] % 2];
    const companero = archivo === primero ? segundo : primero;
    // Nunca se saca un timbre si su compañero no está: el pulso se aplaza unos intentos y, si no vuelve, falla sin tocar nada.
    for (let intento = 0; ; intento++) {
      await devolverDe(pareja);
      if (existe(fs, join(senales, `${companero}.wav`))) break;
      if (intento + 1 >= INTENTOS_PAREJA) throw fallo('PAREJA', `${companero} no está: no se toca ${archivo}`);
      await esperar(ESPERA_PAREJA_MS);
      if (parado) return false;
    }
    const normal = join(senales, `${archivo}.wav`);
    await renombrar(fs, normal, `${normal}.fuera`, dormirReintento);
    if (!archivoFijo) turnos[pareja]++;
    try {
      await esperar(pulsos[pareja]);
    } finally {
      await devolver(archivo);
    }
    return true;
  }

  function encolar(pareja, archivoFijo?: any) {
    const hecho = cadenas[pareja].then(() => pulso(pareja, archivoFijo));
    cadenas[pareja] = hecho.catch(() => {}); // un fallo no rompe la cola de la pareja
    return hecho;
  }

  async function tocar(nombre) {
    if (parado) return false;
    if (nombre === 'timbre') return encolar('timbre');
    if (nombre === 'vivo') return encolar('vivo');
    if (nombre === 'recibido_par' || nombre === 'recibido_impar') return encolar('recibido', nombre);
    throw new Error(`timbre desconocido: ${nombre}`);
  }

  function empezarVida() {
    if (parado || cancelarVida) return;
    const toca = () => {
      tocar('vivo').catch(() => {});
    };
    toca();
    cancelarVida = reloj.cada(toca, VIDA_CADA_MS);
  }

  async function parar() {
    parado = true;
    if (cancelarVida) cancelarVida();
    cancelarVida = null;
    avisarParada();
    await Promise.allSettled(Object.values(cadenas));
    for (const archivo of [...fuera]) {
      try {
        await devolver(archivo);
      } catch {
        // sigue fuera: se verá en el registro de quien llame
      }
    }
  }

  return { tocar, empezarVida, parar, avisos, fueraAhora: () => [...fuera] };
}
