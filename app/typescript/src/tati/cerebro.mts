// TATI como cerebro de SnetForever (S5): con `puenteTati.cerebro: 'tati'` cada mensaje del chat del juego va a TATI (la
// app de escritorio del jugador) por el canal de archivos `tati` de correo.mjs, en lugar de a Claude o Codex. La app nunca
// abre TATI (Ruling P3): si no acusa el pedido en 5 s, el turno da `tati_cerrada`.
//
// crearCerebro({carpeta, fs?, ahora?, dormir?}) -> {turno, parar, comprobar, ultimo}
//   carpeta     la carpeta del puente (carpetaPuente(datos) de tati/config.mjs)
//   fs, ahora, dormir   se pasan tal cual a pedir (las pruebas usan un reloj de prueba)
//   turno({instrucciones, datos, texto, idioma, nueva, alSeguir?})
//               -> Promise<{ok: true, texto, ms, motor: 'tati'} | {ok: false, tipo, detalle, motor: 'tati'}>
//               pide `{tipo: 'turno', senales: 1, instrucciones, datos, texto, idioma, nueva}` (acuse 5 s). `senales: 1`
//               le dice a TATI que esta app entiende sus señales: sin él, TATI sigue cortando a los 400 s. Con señales
//               (`tati.senal.json`) no hay tope de tiempo: SIN_SENAL_MS de silencio dan 'tati_cerrada'. Sin ninguna
//               (una TATI vieja), el resultado se espera TIEMPO_TATI_MS. `alSeguir()` se llama como mucho cada
//               SIGUE_CADA_MS mientras se espera.
//               Errores: sin acuse o sin señal -> 'tati_cerrada'; `ocupada` de TATI -> 'tati_ocupada'; `sin_suscripcion`
//               de TATI (ni Claude Code ni Codex de suscripción, S9) -> 'tati_sin_suscripcion'; parado -> 'detenido';
//               sin resultado -> 'tiempo';
//               cualquier otro (también un pedido que no se pudo escribir o un `hecho` sin texto) -> 'fallo'. El
//               `detalle` de TATI solo pasa si es uno de DETALLES_TATI; si no, ''.
//   parar() -> Promise<boolean>   escribe `tati.parar.json` con el id del pedido en curso y deja de esperar como mucho a
//               los DETENER_ESPERA_MS (enseguida si el archivo no se pudo escribir). true si había un turno en curso.
//   comprobar() -> Promise<'ok' | 'desconocido'>   pide `{tipo: 'estado'}` (acuse 3 s, resultado 5 s) y recuerda el
//               resultado 60 s. Con un turno en curso no pide nada (el canal es de un pedido a la vez): da ultimo().
//   ultimo() -> 'ok' | 'desconocido'   lo último que se supo de TATI (por comprobar o por un turno), para la cabecera.
import { join } from 'node:path';
import { pedir, escribirSobre, DETENER_ESPERA_MS } from './correo.mjs';

export const CANAL_TATI = 'tati';
/** Lo que se espera el resultado de un turno de una TATI sin señales (el addon, sin pulsos, espera 420 s). */
export const TIEMPO_TATI_MS = 400_000;
/** Silencio de una TATI que ya ha dado señales a partir del cual se la da por cerrada. */
export const SIN_SENAL_MS = 120_000;
/** Cada cuánto, como mucho, se avisa de que el turno sigue en marcha. */
export const SIGUE_CADA_MS = 30_000;
export const ACUSE_TURNO_MS = 5000;
export const ACUSE_ESTADO_MS = 3000;
export const TIEMPO_ESTADO_MS = 5000;
export const MEMORIA_ESTADO_MS = 60_000;

// El error de TATI (o del canal) -> el tipo del turno.
const TIPOS = {
  sin_acuse: 'tati_cerrada', sin_senal: 'tati_cerrada', ocupada: 'tati_ocupada', sin_suscripcion: 'tati_sin_suscripcion',
  tiempo: 'tiempo', detenido: 'detenido',
};

/**
 * Revisión final (I4): los únicos `detalle` de TATI que pasan (sus textos fijos; textos.mjs los reconoce y los dice en el
 * idioma del mensaje). Cualquier otro (un error de su motor, que puede llevar rutas de su PC) se queda en '': al chat del
 * juego nunca llega lo que no es uno de estos.
 */
export const DETALLES_TATI = Object.freeze([
  'El turno no dio respuesta.', 'Se detuvo el turno en TATI.', 'TATI se cerró con el turno a medias.',
]);
const detalleDe = (d) => (typeof d === 'string' && DETALLES_TATI.includes(d) ? d : '');

export function crearCerebro({ carpeta, fs, ahora = Date.now, dormir }: {
  carpeta?: any;
  fs?: any;
  ahora?: typeof Date.now;
  dormir?: any;
} = {}) {
  const opciones = (acuseMs, tiempoMs, extra = {}) => ({
    ...(fs ? { fs } : {}), ahora, ...(dormir ? { dormir } : {}), acuseMs, tiempoMs, ...extra,
  });
  let estado = 'desconocido';
  let cuando = -Infinity;
  let turnos = 0; // turnos en curso
  let enCurso = null; // {id, parada} del turno que se está esperando (id: null hasta escribir el pedido)
  const apuntar = (e) => {
    estado = e;
    cuando = ahora();
  };

  // Escribe `tati.parar.json`. Si no se puede, TATI no se va a enterar: el turno deja de esperar ya.
  async function escribirParar(este) {
    try {
      await escribirSobre(join(carpeta, `${CANAL_TATI}.parar.json`), { v: 1, id: este.id, cuando: ahora() }, { fs, dormir });
    } catch {
      este.parada = ahora() - DETENER_ESPERA_MS;
    }
  }

  async function parar() {
    const este = enCurso;
    if (!este) return false;
    if (este.parada === null) {
      este.parada = ahora();
      if (este.id !== null) await escribirParar(este); // sin id aún: lo escribe alId
    }
    return true;
  }

  async function turno({ instrucciones, datos, texto, idioma, nueva, alSeguir }: {
    instrucciones?: any;
    datos?: any;
    texto?: any;
    idioma?: any;
    nueva?: any;
    alSeguir?: any;
  } = {}) {
    const t0 = ahora();
    const cuerpo = {
      tipo: 'turno',
      senales: 1,
      instrucciones: String(instrucciones ?? ''),
      datos: String(datos ?? ''),
      texto: String(texto ?? ''),
      idioma: idioma === 'en' ? 'en' : 'es',
      nueva: nueva === true,
    };
    const este = { id: null, parada: null };
    let ultimoSigue = t0;
    const alEsperar = () => {
      if (typeof alSeguir !== 'function' || ahora() - ultimoSigue < SIGUE_CADA_MS) return;
      ultimoSigue = ahora();
      try {
        alSeguir();
      } catch {
        // un aviso que falla no para el turno
      }
    };
    const alId = (id) => {
      este.id = id;
      if (este.parada !== null) escribirParar(este); // se pidió parar antes de tener id
    };
    turnos++;
    enCurso = este;
    let r;
    try {
      r = await pedir(carpeta, CANAL_TATI, cuerpo, opciones(ACUSE_TURNO_MS, TIEMPO_TATI_MS, {
        senalMs: SIN_SENAL_MS, alId, alEsperar, detener: () => este.parada,
      }));
    } catch {
      return { ok: false, tipo: 'fallo', detalle: 'interno', motor: 'tati' };
    } finally {
      turnos--;
      if (enCurso === este) enCurso = null;
    }
    if (r && r.estado === 'hecho' && typeof r.texto === 'string') {
      apuntar('ok');
      return { ok: true, texto: r.texto, ms: ahora() - t0, motor: 'tati' };
    }
    const deTati = r && typeof r.tipo === 'string' ? r.tipo : '';
    const tipo = Object.hasOwn(TIPOS, deTati) ? TIPOS[deTati] : 'fallo';
    // Sin acuse o sin señal, TATI no está; con cualquier otra respuesta, sí (ha acusado). Un «detenido» no dice nada: puede
    // ser de la propia app, tras esperar a una TATI que no contestó.
    if (tipo !== 'detenido') apuntar(tipo === 'tati_cerrada' ? 'desconocido' : 'ok');
    return { ok: false, tipo, detalle: detalleDe(r?.detalle), motor: 'tati' };
  }

  async function comprobar() {
    if (turnos > 0 || ahora() - cuando < MEMORIA_ESTADO_MS) return estado;
    let r;
    try {
      r = await pedir(carpeta, CANAL_TATI, { tipo: 'estado' }, opciones(ACUSE_ESTADO_MS, TIEMPO_ESTADO_MS));
    } catch {
      r = null;
    }
    apuntar(r && r.estado === 'hecho' ? 'ok' : 'desconocido');
    return estado;
  }

  return { turno, parar, comprobar, ultimo: () => estado };
}
