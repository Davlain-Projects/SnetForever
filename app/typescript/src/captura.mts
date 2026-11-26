// Captura de la mini franja (tarea 19, Ruling F4-27).
// - lanzarCaptura: lanza el ayudante de PowerShell (ayudantes/captura.ps1), que busca la franja en el área de cliente de
//   la ventana del juego y envía solo un recorte de ≈440 × 60 px a su alrededor (nunca la pantalla entera ni nada de fuera
//   de la ventana), y convierte sus líneas en imágenes y estados. Si el ayudante muere, lo vuelve a lanzar.
// - crearLector: decodifica cada recorte (con la última geometría como pista) y pasa al núcleo solo las tramas nuevas.
// Aquí no se escribe ningún archivo ni se guarda ninguna imagen.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buscarYDecodificar } from './franja/codec.mjs';
import { sistema32 } from './proceso.mjs';

export const SCRIPT_CAPTURA = join(dirname(fileURLToPath(import.meta.url)), '..', 'ayudantes', 'captura.ps1');
// PowerShell 5.1 con ruta absoluta (como cmd.exe y where.exe en proceso.mjs: nunca se busca en el PATH).
export const POWERSHELL = sistema32(join('WindowsPowerShell', 'v1.0', 'powershell.exe'));
// Esperas antes de volver a lanzar el ayudante: 2, 5 y 10 s, luego cada 10 s y, tras 5 fallos seguidos, cada 60 s. Si
// vivió al menos VIDA_ESTABLE, la cuenta vuelve a empezar (un ayudante que falla al arrancar no se relanza sin parar).
export const ESPERAS_RELANZAR = [2000, 5000, 10000];
export const VIDA_ESTABLE = 60_000;
// Tras FALLOS_SEGUIDOS_MAX relanzamientos fallidos seguidos, se espera ESPERA_LARGA (Ruling F4-30).
export const FALLOS_SEGUIDOS_MAX = 5;
export const ESPERA_LARGA = 60_000;
const ERROR_MAX = 500; // la última línea de stderr se guarda recortada
// Una línea del ayudante lleva como mucho un recorte de 440 × 60 en base64 (≈141 KB); lo que pase de esto se descarta.
export const LINEA_MAX = 4 * 1024 * 1024;
const PIXELES_MAX = 1 << 20;
// Una trama ya pasada al núcleo no se vuelve a pasar mientras se siga viendo; a los 30 s sin verla, vuelve a valer.
export const OLVIDO_TRAMAS = 30_000;
const TRAMAS_RECORDADAS = 256;

const RELOJ = {
  ahora: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

const enteroEntre = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/**
 * Línea `{"t":"imagen","ancho","alto","x0","y0","b64"}` del ayudante → Imagen del códec
 * `{ancho, alto, x0, y0, canales: 4, bgr: true, datos}` (BGRA de arriba abajo; x0/y0 = origen del recorte dentro del
 * cliente), o null si no cuadra.
 */
export function aImagen(m) {
  if (!m || typeof m.b64 !== 'string') return null;
  const { ancho, alto } = m;
  const x0 = m.x0 ?? 0;
  const y0 = m.y0 ?? 0;
  if (!enteroEntre(ancho, 1, 16384) || !enteroEntre(alto, 1, 16384) || ancho * alto > PIXELES_MAX) return null;
  if (!enteroEntre(x0, 0, 65535) || !enteroEntre(y0, 0, 65535)) return null;
  const bytes = Buffer.from(m.b64, 'base64');
  if (bytes.length !== ancho * alto * 4) return null;
  return { ancho, alto, x0, y0, canales: 4, bgr: true, datos: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length) };
}

/**
 * Lanza el ayudante de captura y lo mantiene vivo.
 * - alImagen(Imagen): cada recorte con la franja que manda el ayudante.
 * - alEstado(m): cada cambio de estado del juego, tal cual (`{t: 'estado', juego: 'no'}` o
 *   `{t: 'estado', juego: 'si', exe, minimizado, primerPlano, ancho, alto}`). El ayudante solo lee píxeles con el juego
 *   en primer plano (Ruling F4-28).
 * - lanzar(comando, args, opciones) y reloj ({ahora, setTimeout, clearTimeout}) solo cambian en las pruebas.
 * → {parar(), estadoCaptura() → {juego: true | false | null, minimizado, primerPlano, ultimaFranjaMs: number | null,
 *   error: última línea de stderr del ayudante | null}}. `juego` es null mientras no se sabe: hasta el primer estado del
 *   ayudante y cada vez que el ayudante muere (hasta que el siguiente mande el suyo). Ya está al día al llamar a alEstado.
 */
export function lanzarCaptura({ script = SCRIPT_CAPTURA, alImagen = (() => {}) as (image: object) => void, alEstado = (() => {}) as (state: object) => void, powershell = POWERSHELL, lanzar = spawn, reloj = RELOJ } = {}) {
  let hijo = null;
  let parado = false;
  let temporizador = null;
  let fallos = 0;
  const estado = { juego: null, minimizado: false, primerPlano: false, ultimaFranjaMs: null, error: null };

  function programar() {
    if (parado) return;
    const ms = fallos >= FALLOS_SEGUIDOS_MAX ? ESPERA_LARGA : ESPERAS_RELANZAR[Math.min(fallos, ESPERAS_RELANZAR.length - 1)];
    fallos++;
    temporizador = reloj.setTimeout(arrancar, ms);
  }

  function linea(texto) {
    let m;
    try {
      m = JSON.parse(texto);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    try {
      if (m.t === 'estado') {
        estado.juego = m.juego === 'si';
        estado.minimizado = m.juego === 'si' && m.minimizado === true;
        estado.primerPlano = m.juego === 'si' && m.primerPlano === true;
        alEstado(m);
      } else if (m.t === 'imagen') {
        const img = aImagen(m);
        if (!img) return;
        estado.ultimaFranjaMs = reloj.ahora();
        alImagen(img);
      }
    } catch {
      // Un fallo de quien escucha no corta la lectura del ayudante.
    }
  }

  function arrancar() {
    temporizador = null;
    if (parado) return;
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-PadrePid', String(process.pid)];
    const desde = reloj.ahora();
    let h;
    try {
      h = lanzar(powershell, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      programar();
      return;
    }
    hijo = h;
    let resto = '';
    let descartando = false;
    // stderr: solo se guarda su última línea no vacía (para la bandeja).
    let restoError = '';
    h.stderr.setEncoding('utf8');
    h.stderr.on('data', (trozo) => {
      const lineas = (restoError + trozo).split(/\r?\n/);
      restoError = lineas.pop().slice(-ERROR_MAX);
      const ultima = lineas.map((l) => l.trim()).filter(Boolean).pop();
      if (ultima) estado.error = ultima.slice(0, ERROR_MAX);
    });
    h.stdout.setEncoding('utf8');
    h.stdout.on('data', (trozo) => {
      let texto = resto + trozo;
      let i;
      while ((i = texto.indexOf('\n')) >= 0) {
        const l = texto.slice(0, i).replace(/\r$/, '');
        texto = texto.slice(i + 1);
        if (descartando) descartando = false;
        else if (l) linea(l);
      }
      if (texto.length > LINEA_MAX) {
        texto = '';
        descartando = true;
      }
      resto = texto;
    });
    let terminado = false;
    const alTerminar = () => {
      if (terminado) return;
      terminado = true;
      if (hijo === h) hijo = null;
      // Sin ayudante no se sabe si el juego está abierto (lote G, ronda 1): vuelve a null hasta el próximo estado.
      estado.juego = null;
      estado.minimizado = false;
      estado.primerPlano = false;
      if (reloj.ahora() - desde >= VIDA_ESTABLE) fallos = 0;
      programar();
    };
    h.on('close', alTerminar);
    h.on('error', alTerminar);
  }

  arrancar();

  return {
    parar() {
      parado = true;
      if (temporizador) reloj.clearTimeout(temporizador);
      temporizador = null;
      // Por su PID (ChildProcess.kill), nunca por nombre: hay más PowerShell en el PC.
      if (hijo) {
        try {
          hijo.kill();
        } catch {
          // ya no estaba
        }
      }
    },
    estadoCaptura() {
      return { ...estado };
    },
  };
}

/**
 * Lector de recortes: los decodifica con `buscarYDecodificar`, con la última geometría buena como pista (guardada en
 * coordenadas del cliente, así sirve aunque el recorte empiece en otro sitio), y llama a `nucleo.recibirTrama(bytes)`
 * solo con una trama nueva (número y contenido no vistos en los últimos 30 s): el bucle de partes de la franja enseña
 * cada una muchas veces.
 * → {alImagen(img) → {tipo, nueva?}, geometria()}
 */
export function crearLector({ nucleo, ahora = Date.now }: { nucleo?: any; ahora?: typeof Date.now; } = {}) {
  let geometria = null;
  const vistas = new Map(); // «id:bytes» → cuándo se vio por última vez

  return {
    alImagen(img) {
      const ox = img.x0 ?? 0;
      const oy = img.y0 ?? 0;
      const pista = geometria && { x0: geometria.x0 - ox, y0: geometria.y0 - oy, paso: geometria.paso };
      const r = buscarYDecodificar(img, pista);
      if (r.tipo !== 'decodificada') return { tipo: r.tipo };
      geometria = { x0: r.geometria.x0 + ox, y0: r.geometria.y0 + oy, paso: r.geometria.paso };
      const t = ahora();
      for (const [k, cuando] of vistas) if (t - cuando > OLVIDO_TRAMAS) vistas.delete(k);
      const clave = `${r.id}:${r.bytes.toString('base64')}`;
      const nueva = !vistas.has(clave);
      vistas.delete(clave);
      vistas.set(clave, t);
      while (vistas.size > TRAMAS_RECORDADAS) vistas.delete(vistas.keys().next().value);
      if (nueva) {
        try {
          const p = nucleo.recibirTrama(r.bytes);
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {
          // El núcleo da cuenta de sus propios fallos; el lector sigue.
        }
      }
      return { tipo: r.tipo, nueva };
    },
    geometria() {
      return geometria && { ...geometria };
    },
  };
}
