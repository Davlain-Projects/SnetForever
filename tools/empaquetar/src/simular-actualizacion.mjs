// Simulador de actualizaciones (fase 5, tarea 17): herramienta de desarrollo para probar el actualizador de la app de
// punta a punta sin GitHub.
//
//   node src/simular-actualizacion.mjs --publicacion <dir> --addons <dir> --datos <dir> [--clave <clave-publica.pem>]
//
// - Levanta un servidor node:http **solo en 127.0.0.1** y en un puerto libre, que sirve los archivos de `<dir>` (una
//   carpeta de `npm run publicar`) como los serviría GitHub: `/releases/latest/download/<archivo>` y
//   `/releases/download/<publicacion>/<archivo>`. Cualquier otra ruta, o un método que no sea GET, da 404. Los archivos
//   se leen en cada petición: lo que haya en la carpeta en ese momento.
// - Crea el actualizador de la app (app/src/actualizar/actualizador.mjs) con ese origen y la red de la app (red.mjs) con
//   sus dos atajos de prueba: `permitirLocal` (deja pasar http://127.0.0.1:<puerto>) y el `get` de node:http.
// - Ejecuta comprobar, descargar y aplicarSiSePuede, una vuelta cada 5 s, hasta que se aplica (o hasta que no queda nada
//   que esperar: sin novedades, o un fallo que no se arregla esperando). Mientras el juego está abierto, espera.
// - Escribe el resultado de cada paso en una línea JSON y, al final, `{resultado, peticiones, locales}`; después apaga el
//   servidor y sale (0 si se aplicó o no había nada que hacer; 1 si acabó con un fallo; 2 si las opciones no valen).
//
// La clave del manifiesto es la de la app (CLAVE_PUBLICA) o la de `--clave`. `--datos` es obligatorio (ronda 1): es la
// carpeta de datos de la simulación (SNF_DATOS) y, si no se puso SNF_CUARENTENA, su `cuarentena` es la cuarentena. Así una
// simulación nunca toca la carpeta de datos de verdad ni E:\_CUARENTENA. El programa nunca aplica la app. Si el juego
// está abierto lo dice juego.mjs (la lista de procesos de Windows; si no se sabe, cuenta como abierto).
//
// La regla de cumplimiento (test/cumplimiento.test.js) solo deja usar node:http a este archivo, y solo con el puerto 0 en
// 127.0.0.1. Aquí no se borra nada.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as dormir } from 'node:timers/promises';

import { crearActualizador } from '../../../app/src/actualizar/actualizador.mjs';
import { obtener } from '../../../app/src/actualizar/red.mjs';
import { CLAVE_PUBLICA } from '../../../app/src/actualizar/clave-publica.mjs';
import { consultar, juegoAbierto as abiertoSegun } from '../../../app/src/juego.mjs';
import { leerConfig } from '../../../app/src/rutas.mjs';

/** Lo que se espera entre una vuelta y la siguiente. */
export const INTERVALO = 5000;
const MANIFIESTO = 'snetforever-manifiesto.json';
const LOCAL = '127.0.0.1';
// Un nombre de archivo de la publicación: sin carpetas, sin «..» y sin nada raro.
const ARCHIVO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Los fallos al aplicar que se arreglan esperando: un archivo ocupado o sin permiso (el juego, un antivirus).
const ESPERABLES = new Set(['ocupado', 'sin_permiso']);

// El juego de verdad: abierto si juego.mjs ve un Wow.exe de \_forever_\ (si la consulta falla, el actualizador lo toma
// como abierto).
const juegoDeVerdad = async () => abiertoSegun({ procesos: await consultar('procesos') });

// El archivo que pide `url`, o null: `/releases/latest/download/<f>` o `/releases/download/<publicacion>/<f>`.
function archivoPedido(url, publicacion) {
  let ruta;
  try {
    ruta = new URL(url, `http://${LOCAL}`).pathname;
  } catch {
    return null;
  }
  const ultima = /^\/releases\/latest\/download\/([^/]+)$/.exec(ruta);
  const fija = /^\/releases\/download\/([^/]+)\/([^/]+)$/.exec(ruta);
  let nombre = null;
  try {
    if (ultima) nombre = decodeURIComponent(ultima[1]);
    else if (fija && publicacion !== null && decodeURIComponent(fija[1]) === publicacion) nombre = decodeURIComponent(fija[2]);
  } catch {
    return null;
  }
  return nombre !== null && ARCHIVO.test(nombre) && !nombre.includes('..') ? nombre : null;
}

// La publicación que dice el manifiesto de `dir` (solo para las rutas de los paquetes; lo comprueba el actualizador).
function publicacionDe(dir) {
  try {
    const p = JSON.parse(readFileSync(join(dir, MANIFIESTO), 'utf8'))?.publicacion;
    return typeof p === 'string' ? p : null;
  } catch {
    return null;
  }
}

/**
 * Levanta el servidor de `dir` en 127.0.0.1 (puerto libre). Apunta cada petición en `peticiones`.
 * @returns {Promise<{servidor: http.Server, puerto: number, peticiones: object[]}>}
 */
function servir(dir) {
  const publicacion = publicacionDe(dir);
  const peticiones = [];
  const servidor = http.createServer((req, res) => {
    peticiones.push({
      metodo: req.method, ruta: req.url, direccion: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] ?? null, accept: req.headers.accept ?? null,
    });
    const nombre = req.method === 'GET' ? archivoPedido(req.url, publicacion) : null;
    let bytes = null;
    if (nombre !== null) {
      try {
        bytes = readFileSync(join(dir, nombre));
      } catch {
        bytes = null;
      }
    }
    if (bytes === null) {
      res.writeHead(404, { 'Content-Length': 0 });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length });
    res.end(bytes);
  });
  return new Promise((listo, fallo) => {
    servidor.once('error', fallo);
    servidor.listen(0, '127.0.0.1', () => listo({ servidor, puerto: servidor.address().port, peticiones }));
  });
}

function apagar(servidor) {
  return new Promise((listo) => {
    servidor.close(() => listo());
    servidor.closeAllConnections();
  });
}

// ¿Se sigue esperando tras este aplicar? Con el juego abierto, en un estado roto que se puede reintentar o con un archivo
// ocupado. Lo demás (aplicado, nada pendiente o un fallo que no se arregla esperando) acaba.
function seguir(aplicar) {
  if (aplicar.estado === 'esperando_juego') return true;
  if (aplicar.estado !== 'error') return false;
  return (aplicar.roto === true && aplicar.reinstalar !== true) || ESPERABLES.has(aplicar.codigo);
}

/**
 * Sirve la publicación de `publicacion` en 127.0.0.1 y pasa el actualizador de la app por ella hasta que se aplica.
 * @param {object} p
 * @param {string} p.publicacion la carpeta de la publicación (la de `npm run publicar`)
 * @param {string} p.addons la carpeta `…\_forever_\Interface\AddOns`
 * @param {string} [p.datos] la carpeta de datos de la app (SNF_DATOS); por defecto la de `env`
 * @param {object} [p.env] el entorno de la app (SNF_DATOS, SNF_CUARENTENA, SNF_INSTALACION…); por defecto process.env
 * @param {string|null} [p.clavePublica] la del manifiesto; por defecto CLAVE_PUBLICA
 * @param {() => Promise<boolean>} [p.juegoAbierto] por defecto, la lista de procesos de Windows (juego.mjs)
 * @param {number} [p.intervalo] ms entre vueltas (5 s)
 * @param {number} [p.maxVueltas] cuántas vueltas como mucho; por defecto, sin límite
 * @param {(linea: string) => void} [p.escribir] recibe el resultado de cada paso, en JSON
 * @param {string} [p.versionApp] la versión de la app que corre (va tal cual al actualizador; por defecto, la de la app)
 * @param {(buffer: Buffer) => Promise<unknown>} [p.aplicarApp] aplica el paquete de la app (propia.mjs); sin ella, la app
 *   no se baja ni se aplica
 * @param {() => string|null} [p.appFallida] la versión de la app que ya no arrancó; por defecto, la del fallida.txt de la
 *   instalación de `env`
 * @param {Function} [p.instalar] `instalarComponentes`; solo lo cambian las pruebas (el estado roto)
 * @returns {Promise<{resultado: 'aplicado'|'nada'|'error'|'esperando', pasos: object[], peticiones: object[],
 *   urls: string[], puerto: number}>} `urls`, todas las que pidió la app; `peticiones`, todas las que llegaron al servidor
 */
export async function simularActualizacion({
  publicacion, addons, datos, env = process.env, clavePublica = CLAVE_PUBLICA, juegoAbierto = juegoDeVerdad,
  intervalo = INTERVALO, maxVueltas = Infinity, escribir = () => {}, versionApp, aplicarApp, appFallida, instalar,
} = {}) {
  if (typeof publicacion !== 'string' || publicacion === '') throw new TypeError('Falta la carpeta de la publicación');
  if (typeof addons !== 'string' || addons === '') throw new TypeError('Falta la carpeta AddOns');
  const entorno = datos ? { ...env, SNF_DATOS: resolve(datos) } : env;
  const { servidor, puerto, peticiones } = await servir(resolve(publicacion));
  const base = `http://${LOCAL}:${puerto}/releases`;
  const urls = [];
  const red = (url, opciones) => {
    urls.push(url);
    return obtener(url, { ...opciones, permitirLocal: true, transporte: http.get });
  };
  const origen = {
    manifiesto: `${base}/latest/download/${MANIFIESTO}`,
    firma: `${base}/latest/download/${MANIFIESTO}.sig`,
    paquete: (pub, archivo) => `${base}/download/${encodeURIComponent(pub)}/${encodeURIComponent(archivo)}`,
  };
  const pasos = [];
  let resultado = 'esperando';
  try {
    const actualizador = crearActualizador({
      env: entorno, config: leerConfig(entorno), addonsDir: addons, red, origen, clavePublica, juegoAbierto,
      versionApp, aplicarApp, appFallida, instalar,
    });
    for (let vuelta = 1; vuelta <= maxVueltas; vuelta++) {
      if (vuelta > 1) await dormir(intervalo);
      const vista = [];
      for (const [paso, hacer] of [['comprobar', actualizador.comprobar], ['descargar', actualizador.descargar],
        ['aplicar', actualizador.aplicarSiSePuede]]) {
        const r = { vuelta, paso, ...(await hacer()) };
        pasos.push(r);
        vista.push(r);
        escribir(JSON.stringify(r));
      }
      const aplicar = vista[2];
      if (aplicar.estado === 'aplicado') {
        resultado = 'aplicado';
        break;
      }
      if (!seguir(aplicar)) {
        resultado = vista.some((r) => r.estado === 'error') ? 'error' : 'nada';
        break;
      }
    }
  } finally {
    await apagar(servidor);
  }
  return { resultado, pasos, peticiones, urls, puerto };
}

const USO = 'Uso: node src/simular-actualizacion.mjs --publicacion <dir> --addons <dir> --datos <dir> [--clave <clave-publica.pem>]';

/**
 * El entorno del programa (tarea 17, ronda 1): la carpeta de datos es siempre `datos` y, si quien lo lanza no puso
 * SNF_CUARENTENA, la cuarentena es `<datos>\cuarentena`. Así una simulación nunca escribe en la carpeta de datos de verdad
 * ni en `E:\_CUARENTENA` (que es lo que daría la app con un config.json vacío).
 * @param {object} env el entorno de quien lo lanza
 * @param {string} datos `--datos`
 * @returns {object} una copia de `env` con SNF_DATOS y SNF_CUARENTENA
 */
export function entornoDelPrograma(env, datos) {
  const carpeta = resolve(datos);
  return { ...env, SNF_DATOS: carpeta, SNF_CUARENTENA: env.SNF_CUARENTENA || join(carpeta, 'cuarentena') };
}

/**
 * La orden. Sale con 0 si se aplicó o no había nada que hacer, con 1 si acabó con un fallo y con 2 si las opciones no
 * valen (también sin `--datos`). `juegoAbierto` solo lo cambian las pruebas (por defecto, juego.mjs).
 */
export async function principal(argv = process.argv.slice(2), {
  salida = process.stdout, errores = process.stderr, juegoAbierto = juegoDeVerdad,
} = {}) {
  let valores;
  try {
    ({ values: valores } = parseArgs({
      args: argv, strict: true, allowPositionals: false,
      options: { publicacion: { type: 'string' }, addons: { type: 'string' }, datos: { type: 'string' }, clave: { type: 'string' } },
    }));
  } catch (e) {
    errores.write(`${e.message}\n${USO}\n`);
    return 2;
  }
  if (!valores.publicacion || !valores.addons || !valores.datos) {
    errores.write(`Faltan --publicacion, --addons o --datos (la carpeta de datos de la simulación es obligatoria).\n${USO}\n`);
    return 2;
  }
  let clavePublica = CLAVE_PUBLICA;
  if (valores.clave) {
    try {
      clavePublica = readFileSync(valores.clave, 'utf8');
    } catch (e) {
      errores.write(`No se pudo leer la clave «${valores.clave}»: ${e.message}\n`);
      return 2;
    }
  }
  const env = entornoDelPrograma(process.env, valores.datos);
  // el registro de la app (registro.mjs) usa process.env: mientras dura, a --datos; después se deja como estaba
  const tenia = Object.hasOwn(process.env, 'SNF_DATOS');
  const antes = process.env.SNF_DATOS;
  process.env.SNF_DATOS = env.SNF_DATOS;
  let r;
  try {
    r = await simularActualizacion({
      publicacion: valores.publicacion, addons: valores.addons, env, clavePublica, juegoAbierto,
      // el programa nunca aplica la app: no hace falta mirar el fallida.txt de ninguna instalación
      appFallida: () => null,
      escribir: (linea) => salida.write(`${linea}\n`),
    });
  } finally {
    if (tenia) process.env.SNF_DATOS = antes;
    else delete process.env.SNF_DATOS;
  }
  const locales = r.urls.every((u) => u.startsWith(`http://${LOCAL}:${r.puerto}/`))
    && r.peticiones.every((p) => p.direccion === LOCAL && p.metodo === 'GET');
  salida.write(`${JSON.stringify({ resultado: r.resultado, peticiones: r.peticiones.length, locales })}\n`);
  return r.resultado === 'aplicado' || r.resultado === 'nada' ? 0 : 1;
}

const esPrincipal = () => {
  try {
    return process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
};
if (esPrincipal()) process.exitCode = await principal();
