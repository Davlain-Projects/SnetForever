// `npm run instalador` (fase 5, tarea 16): el instalador de Windows con Inno Setup y un Node portátil. **No instala nada.**
//
// 1. `prepararRaiz` deja en una carpeta (por defecto tools\empaquetar\dist\instalador\raiz, fuera de git) lo que
//    Inno copia a `{app}` (F3, sin `unins000.*`, que los pone Inno):
//    - `node\node.exe` (la copia exacta del Node del disco, v24.*), `node\LICENSE` (terceros/node/LICENSE, que tiene que
//      decir «Node.js is licensed for use as follows») y `node\AVISO.txt` (los componentes de terceros de Node);
//    - `app\<versión>\` (el paquete de la app de la publicación, extraído sin su primer segmento) y `actual.txt`;
//    - `arranque.mjs` (app/arranque, tarea 10), `retirar.ps1` (app/ayudantes, tarea 12), `SnetForever.vbs`, `LICENSE` y
//      `LICENCIAS.txt` (plantillas);
//    - `paquetes\`: el manifiesto, su `.sig` (sin ella, R17 acaba en `falta_firma`) y los tres paquetes de AddOns.
//    Antes de escribir nada comprueba que hay clave pública (revisión final, I1: sin ella solo con --prueba), la
//    publicación (firma con la clave pública, tamaño y SHA-256 de cada paquete), que el clave-publica.mjs del paquete de
//    la app lleva esa misma clave (resto de I1; con --prueba no se mira) y la licencia de Node. Si la raíz ya
//    existe, primero va entera a lo apartado (dist\apartado, apartado.mjs: revisión final, m3; nunca se borra nada).
// 2. `compilar` ejecuta `ISCC.exe` con inno\SnetForever.iss y deja `SnetForever-Instalador-<versión>.exe` (el nombre no
//    cambia: SmartScreen aprende por nombre). Un .exe anterior con el mismo nombre va antes a lo apartado.
//
// No se descarga nada: el Node portátil se copia del disco e Inno Setup tiene que estar ya instalado. Aquí no se borra
// nada ni se instala nada: el .exe que sale no se ejecuta.
import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { CLAVE_PUBLICA } from '../../../app/src/actualizar/clave-publica.mjs';
import { comprobarPaquete, leerManifiesto } from '../../../app/src/actualizar/manifiesto.mjs';
import { abrirPaquete, extraerPaquete } from '../../../app/src/actualizar/paquete.mjs';
import { COMPONENTES_ADDONS, MANIFIESTO, leerPaquetes } from '../../../app/src/instalador/paquetes.mjs';
import { moverDentro } from '../../../app/src/mover.mjs';
import { carpetaApartado } from './apartado.mjs';
import { derClavePublica } from './firma/clave.mjs';

const ESTE_ARCHIVO = fileURLToPath(import.meta.url);
const EMPAQUETAR = join(dirname(ESTE_ARCHIVO), '..');
const RAIZ_REPO = join(EMPAQUETAR, '..', '..');

/** Donde se prepara la raíz si no se dice otra cosa (tools/empaquetar/dist/ está en .gitignore). */
export const RAIZ_POR_DEFECTO = join(EMPAQUETAR, 'dist', 'instalador', 'raiz');
/** Donde se deja el .exe si no se dice otra cosa. */
export const SALIDA_POR_DEFECTO = join(EMPAQUETAR, 'dist', 'instalador');
/** El aviso MIT de Node.js que va en `node\LICENSE` (el Node instalado no trae su LICENSE: R4). */
export const LICENCIA_NODE = join(EMPAQUETAR, 'terceros', 'node', 'LICENSE');
/** El Node del disco que se copia si no hay SNF_NODE. */
export const NODE_POR_DEFECTO = 'C:\\Program Files\\nodejs\\node.exe';
/** El guion de Inno Setup. */
export const ISS = join(EMPAQUETAR, 'inno', 'SnetForever.iss');
/** La frase que tiene que traer la licencia de Node (R4). */
export const FRASE_LICENCIA_NODE = 'Node.js is licensed for use as follows';
/**
 * Ronda 1, I3: lo que tiene que traer además el LICENSE **completo** de Node para poder publicar: la lista de bibliotecas
 * externas y las secciones de V8 (BSD-3), OpenSSL (Apache 2.0) e ICU, que piden llevar su licencia con el binario.
 */
export const SECCIONES_LICENCIA_NODE = Object.freeze([
  ['la lista de bibliotecas externas', /^The externally maintained libraries used by Node\.js are:/m],
  ['V8', /^- V8, located at /m],
  ['OpenSSL', /^- OpenSSL, located at /m],
  ['ICU', /^- ICU, located at /m],
]);

/** Lo que le falta a una licencia de Node para ser la completa (vacío si está entera). */
export function faltasLicenciaNode(texto) {
  return SECCIONES_LICENCIA_NODE.filter(([, expresion]) => !expresion.test(texto)).map(([nombre]) => nombre);
}
/** El nombre del instalador: fijo, porque SmartScreen aprende por nombre. */
export const NOMBRE_EXE = (version) => `SnetForever-Instalador-${version}.exe`;

const AVISO_NODE = join(EMPAQUETAR, 'terceros', 'node', 'AVISO.txt');
const PLANTILLAS = join(EMPAQUETAR, 'plantillas');
// Lo que va en la raíz, además del Node, la app y los paquetes: [nombre en la raíz, de dónde sale].
const FIJOS = [
  ['arranque.mjs', join(RAIZ_REPO, 'app', 'arranque', 'arranque.mjs')],
  ['retirar.ps1', join(RAIZ_REPO, 'app', 'ayudantes', 'retirar.ps1')],
  ['SnetForever.vbs', join(PLANTILLAS, 'SnetForever.vbs')],
  ['LICENSE', join(RAIZ_REPO, 'app', 'LICENSE')],
  ['LICENCIAS.txt', join(PLANTILLAS, 'LICENCIAS.txt')],
  // el icono de SnetForever (tools/iconos): accesos directos, «Aplicaciones» y el propio instalador
  ['snetforever.ico', join(RAIZ_REPO, 'app', 'recursos', 'snetforever.ico')],
];
// La versión de la app, como la acepta arranque.mjs (VERSION_APP).
const VERSION_APP = /^\d+\.\d+\.\d+(\.\d+)?$/;
const ISCC_RELATIVO = ['Programs', 'Inno Setup 6', 'ISCC.exe'];
const ISCC_X86 = 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe';

/**
 * Error del instalador. `code`:
 * - `'clave'` (revisión final, I1): la clave pública es null (la de la app, CLAVE_PUBLICA, todavía no se ha puesto) y no
 *   es una prueba (`--prueba`): ese instalador nunca recibiría actualizaciones ni comprobaría la firma al instalar; y,
 *   desde el resto de I1, también si el clave-publica.mjs del paquete de la app falta, no se entiende, es null o no es
 *   la clave que firma el manifiesto;
 * - `'licencia_node'`: falta la licencia de Node o no dice «Node.js is licensed for use as follows»;
 * - `'node'`: el node.exe no está o, con `comprobarNode`, su `--version` no es `v24.*`;
 * - `'publicacion'`: a la publicación le falta algo, su firma no es de la clave pública o un paquete no cuadra con el
 *   manifiesto (el detalle va en el mensaje: falta_firma, firma, hash, tamano…);
 * - `'version'`: la versión de la app no vale;
 * - `'archivo'`: falta un archivo del repositorio (arranque.mjs, retirar.ps1, una plantilla…);
 * - `'iscc'`: no está ISCC.exe (Inno Setup 6);
 * - `'compilar'`: ISCC.exe falló o no dejó el .exe (el mensaje lleva su salida).
 */
export class ErrorInstalador extends Error {
  constructor(code, mensaje, opciones) {
    super(mensaje, opciones);
    this.name = 'ErrorInstalador';
    this.code = code;
  }
}

function esArchivo(ruta) {
  try {
    return lstatSync(ruta).isFile();
  } catch {
    return false;
  }
}

function existe(ruta) {
  try {
    lstatSync(ruta);
    return true;
  } catch {
    return false;
  }
}

function leer(ruta, code, que) {
  try {
    return readFileSync(ruta);
  } catch (e) {
    throw new ErrorInstalador(code, `No se pudo leer ${que} («${ruta}»): ${e.message}`, { cause: e });
  }
}

// Resto de I1 (Minor 1 de la re-revisión): dónde va la clave dentro del paquete de la app, y su declaración. Solo se
// acepta un literal sencillo (null, '…', "…" o `…` sin ${}): lo demás no se adivina ni se ejecuta.
const RUTA_CLAVE_APP = 'app/src/actualizar/clave-publica.mjs';
const DECLARACION_CLAVE = /^export const CLAVE_PUBLICA\s*=\s*(null|'(?:[^'\\\r\n]|\\.)*'|"(?:[^"\\\r\n]|\\.)*"|`[^`\\$]*`)\s*;/gm;
const ESCAPES = { n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"' };

/**
 * Resto de I1: el valor de `CLAVE_PUBLICA` en el texto de un `clave-publica.mjs`, sin ejecutarlo. Entiende una sola
 * declaración `export const CLAVE_PUBLICA = <literal>;` con `null`, una cadena entre comillas simples o dobles (con los
 * escapes \n, \r, \t, \\, \' y \") o una plantilla entre `` sin ${} ni barras (sus CRLF valen \n, como en JS).
 * @param {string} texto
 * @returns {string|null}
 * @throws {ErrorInstalador} `clave` si no lo entiende
 */
export function leerClaveApp(texto) {
  const noSeEntiende = () => new ErrorInstalador('clave',
    `El ${RUTA_CLAVE_APP} de la app de la publicación no se entiende (tiene que ser «export const CLAVE_PUBLICA = null;» o la clave entre comillas): no se prepara nada`);
  const declaraciones = [...String(texto).matchAll(DECLARACION_CLAVE)];
  if (declaraciones.length !== 1) throw noSeEntiende();
  const literal = declaraciones[0][1];
  if (literal === 'null') return null;
  const dentro = literal.slice(1, -1);
  if (literal[0] === '`') return dentro.replace(/\r\n?/g, '\n');
  return dentro.replace(/\\(.)/g, (_, c) => {
    if (!Object.hasOwn(ESCAPES, c)) throw noSeEntiende();
    return ESCAPES[c];
  });
}

// Resto de I1: el clave-publica.mjs que va dentro del paquete de la app (el que acaba instalado) tiene que llevar la
// clave que firma el manifiesto. Si es null, otra o no se entiende, se niega (`clave`) antes de escribir nada.
function comprobarClaveDelPaquete(app, clavePublica) {
  const archivo = app.archivos.find((a) => a.ruta === RUTA_CLAVE_APP);
  if (!archivo) {
    throw new ErrorInstalador('clave', `El paquete de la app de la publicación no lleva ${RUTA_CLAVE_APP}: no se prepara nada`);
  }
  const claveApp = leerClaveApp(archivo.datos.toString('utf8'));
  if (claveApp === null) {
    throw new ErrorInstalador('clave',
      `La app de la publicación lleva CLAVE_PUBLICA = null (se publicó antes de poner la clave): ese instalador nunca recibiría actualizaciones. Vuelve a publicar con la clave puesta (npm run publicar) y prepara el instalador con esa publicación.`);
  }
  const deLaApp = derClavePublica(claveApp);
  const queFirma = derClavePublica(clavePublica);
  if (deLaApp === null || queFirma === null || !deLaApp.equals(queFirma)) {
    throw new ErrorInstalador('clave',
      `La clave pública que lleva la app de la publicación (${RUTA_CLAVE_APP}) no es la que firma el manifiesto: la app instalada rechazaría todas las actualizaciones. No se prepara nada.`);
  }
}

// Escribe un archivo nuevo (wx: nunca pisa nada).
const escribirNuevo = (ruta, bytes) => writeFileSync(ruta, bytes, { flag: 'wx' });

// Los cuatro paquetes de la publicación comprobados (leerPaquetes, la función común de la app: con `clavePublica`, la
// firma antes de leer el manifiesto; siempre tamaño, SHA-256, versión y esquema), y los bytes del manifiesto y de su
// firma, comprobados otra vez frente a esos mismos paquetes (son los que se copian).
// Task 8b, ronda 1 (M3): ¿es la carpeta de una publicación puente (`npm run publicar -- --solo-app`, un manifiesto que solo
// trae la app)? Solo se mira cuando a la publicación le falta un paquete de AddOns, para decirlo claro.
function esPuente(dir) {
  try {
    const componentes = JSON.parse(readFileSync(join(dir, MANIFIESTO), 'utf8'))?.componentes;
    return componentes !== null && typeof componentes === 'object' && Object.keys(componentes).join() === 'app';
  } catch {
    return false;
  }
}

function leerPublicacion(dir, clavePublica) {
  const fallo = (detalle, causa) => new ErrorInstalador('publicacion',
    `La publicación de «${dir}» no vale (${detalle}): no se prepara nada`, causa ? { cause: causa } : undefined);
  const falta = (detalle) => (detalle.startsWith('sin_') && esPuente(dir)
    ? new ErrorInstalador('publicacion', `La carpeta «${dir}» es una publicación puente (solo la app): el instalador no se prepara con `
      + 'ella, sino con la carpeta de la publicación normal (la de los addons, v<app>-<rutas>). No se prepara nada')
    : fallo(detalle));
  let paquetes;
  try {
    paquetes = leerPaquetes(dir, { clavePublica, componentes: [...COMPONENTES_ADDONS, 'app'], error: (d) => falta(String(d)) });
  } catch (e) {
    if (e instanceof ErrorInstalador) throw e;
    throw fallo(e?.code ?? e?.message, e);
  }
  // la .sig va siempre, también sin clave pública: con la clave de verdad, sin ella R17 acabaría en falta_firma
  if (!esArchivo(join(dir, `${MANIFIESTO}.sig`))) throw fallo('falta_firma');
  const bytesManifiesto = leer(join(dir, MANIFIESTO), 'publicacion', 'el manifiesto');
  const firma = leer(join(dir, `${MANIFIESTO}.sig`), 'publicacion', 'la firma del manifiesto');
  let manifiesto;
  try {
    manifiesto = leerManifiesto(bytesManifiesto);
    for (const { componente, buffer } of paquetes) comprobarPaquete(manifiesto, componente, buffer);
  } catch (e) {
    throw fallo(e?.code ?? e?.message, e);
  }
  return { manifiesto, bytesManifiesto, firma, paquetes };
}

/**
 * Prepara la raíz del instalador (lo que Inno copia a `{app}`; ver el principio del archivo).
 * @param {object} p
 * @param {string} p.publicacionDir la carpeta de una publicación de `npm run publicar` (tarea 15)
 * @param {object} [p.env] SNF_NODE (otro node.exe) y SNF_CUARENTENA (donde va una raíz anterior; por defecto dist/apartado: apartado.mjs)
 * @param {string} [p.nodeExe] por defecto SNF_NODE o C:\Program Files\nodejs\node.exe
 * @param {string} [p.nodeLicencia] por defecto terceros/node/LICENSE
 * @param {string} [p.salida] la raíz; por defecto dist/instalador/raiz
 * @param {boolean} [p.comprobarNode] por defecto true: `node --version` de la copia tiene que ser v24.*
 * @param {string|null} [p.clavePublica] la del manifiesto (por defecto la de la app, CLAVE_PUBLICA; con null, solo los
 *   SHA-256). Así un instalador nunca lleva una publicación que la app rechazaría al instalar.
 * @param {boolean} [p.exigirClave] por defecto true (revisión final, I1): con `clavePublica` null se niega (`clave`) antes
 *   de mirar nada más; y la clave del clave-publica.mjs del paquete de la app tiene que ser `clavePublica` (resto de
 *   I1). Con false (`--prueba`, nunca para publicar) sigue, con un aviso por `avisar` si la clave es null, y no mira la
 *   del paquete.
 * @param {boolean} [p.exigirLicenciaCompleta] por defecto true (ronda 1, I3): la licencia de Node tiene que ser el
 *   LICENSE completo (SECCIONES_LICENCIA_NODE); si no, `licencia_node`. Con false (solo para probar, nunca para
 *   publicar) vale el resumen, con un aviso por `avisar`. La frase de R4 se exige siempre.
 * @param {(texto: string) => void} [p.avisar] recibe los avisos
 * @returns {string} la raíz
 * @throws {ErrorInstalador}
 */
export function prepararRaiz({
  env = process.env, publicacionDir, nodeExe = env.SNF_NODE || NODE_POR_DEFECTO, nodeLicencia = LICENCIA_NODE,
  salida = RAIZ_POR_DEFECTO, comprobarNode = true, clavePublica = CLAVE_PUBLICA, exigirLicenciaCompleta = true,
  exigirClave = true, avisar = () => {},
} = {}) {
  // revisión final, I1: sin clave pública, la app instalada nunca se actualizaría (comprobar() da sin_clave para siempre)
  // y R17 instalaría los paquetes sin verificar la firma. Es lo primero que se mira.
  if (clavePublica === null) {
    const que = 'La app no lleva clave pública (CLAVE_PUBLICA = null en app/src/actualizar/clave-publica.mjs)';
    if (exigirClave) {
      throw new ErrorInstalador('clave',
        `${que}: ese instalador nunca recibiría actualizaciones ni comprobaría la firma al instalar. Pon antes la clave (npm run firma:crear, tarea 18). Para una prueba que no se publica: --prueba.`);
    }
    avisar(`AVISO: ${que}. Este instalador vale solo para probar: NO SE PUEDE PUBLICAR.`);
  }
  if (typeof publicacionDir !== 'string' || publicacionDir === '') throw new ErrorInstalador('publicacion', 'Falta la carpeta de la publicación');
  const pub = resolve(publicacionDir);
  const raiz = resolve(salida);

  // todo lo que se comprueba, antes de escribir nada
  let licencia;
  try {
    licencia = readFileSync(nodeLicencia);
  } catch (e) {
    throw new ErrorInstalador('licencia_node', `No se pudo leer la licencia de Node («${nodeLicencia}»): ${e.message}`, { cause: e });
  }
  if (!licencia.toString('utf8').includes(FRASE_LICENCIA_NODE)) {
    throw new ErrorInstalador('licencia_node', `La licencia de Node («${nodeLicencia}») no dice «${FRASE_LICENCIA_NODE}»`);
  }
  const faltan = faltasLicenciaNode(licencia.toString('utf8'));
  if (faltan.length > 0) {
    const que = `La licencia de Node («${nodeLicencia}») no es el LICENSE completo de Node v24.14.0: le falta ${faltan.join(', ')}`;
    if (exigirLicenciaCompleta) {
      throw new ErrorInstalador('licencia_node',
        `${que}. Pon en terceros/node/LICENSE el archivo completo (lo trae el jugador; aquí no se descarga nada). Para una prueba que no se publica: --prueba.`);
    }
    avisar(`AVISO: ${que}. Este instalador vale solo para probar: NO SE PUEDE PUBLICAR.`);
  }
  if (!esArchivo(nodeExe)) throw new ErrorInstalador('node', `No está el node.exe que se copia: «${nodeExe}»`);
  const { manifiesto, bytesManifiesto, firma, paquetes } = leerPublicacion(pub, clavePublica);
  const version = manifiesto.componentes.app.version;
  if (!VERSION_APP.test(version)) throw new ErrorInstalador('version', `La versión de la app no vale: ${JSON.stringify(version)}`);
  let app;
  try {
    app = abrirPaquete(paquetes.find((p) => p.componente === 'app').buffer, { componente: 'app' });
  } catch (e) {
    throw new ErrorInstalador('publicacion', `El paquete de la app no vale (${e?.code ?? e?.message})`, { cause: e });
  }
  // resto de I1: la app que se instala es la del paquete, no la copia de trabajo (con --prueba no se mira)
  if (exigirClave) comprobarClaveDelPaquete(app, clavePublica);
  const aviso = leer(AVISO_NODE, 'archivo', 'el aviso de terceros de Node');
  const fijos = FIJOS.map(([nombre, origen]) => [nombre, leer(origen, 'archivo', nombre)]);

  // escribir: una raíz anterior va antes entera a lo apartado (apartado.mjs: nunca se pisa ni se borra)
  if (existe(raiz)) moverDentro(raiz, carpetaApartado(env));
  mkdirSync(dirname(raiz), { recursive: true });
  mkdirSync(raiz); // sin recursive: si alguien la creó entre medias, EEXIST y no se pisa nada
  const nodeDir = join(raiz, 'node');
  mkdirSync(nodeDir);
  const copia = join(nodeDir, 'node.exe');
  copyFileSync(nodeExe, copia, constants.COPYFILE_EXCL);
  escribirNuevo(join(nodeDir, 'LICENSE'), licencia);
  escribirNuevo(join(nodeDir, 'AVISO.txt'), aviso);
  if (comprobarNode) comprobarVersionNode(copia);

  extraerPaquete(app, join(raiz, 'app', version), { quitarPrimero: true });
  escribirNuevo(join(raiz, 'actual.txt'), Buffer.from(version, 'ascii')); // ASCII y sin BOM (tarea 10)
  for (const [nombre, bytes] of fijos) escribirNuevo(join(raiz, nombre), bytes);

  const dirPaquetes = join(raiz, 'paquetes');
  mkdirSync(dirPaquetes);
  escribirNuevo(join(dirPaquetes, MANIFIESTO), bytesManifiesto);
  escribirNuevo(join(dirPaquetes, `${MANIFIESTO}.sig`), firma);
  for (const { componente, buffer } of paquetes) {
    if (componente === 'app') continue; // la app ya va extraída en app\<versión>
    escribirNuevo(join(dirPaquetes, manifiesto.componentes[componente].archivo), buffer);
  }
  return raiz;
}

// `node --version` de la copia tiene que ser v24.* (la app pide Node 24).
function comprobarVersionNode(exe) {
  let version;
  try {
    version = execFileSync(exe, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw new ErrorInstalador('node', `No se pudo ejecutar «${exe} --version»: ${e.code ?? e.message}`, { cause: e });
  }
  if (!/^v24\./.test(version)) throw new ErrorInstalador('node', `El node.exe es ${JSON.stringify(version)} y tiene que ser v24.*`);
}

/**
 * Dónde está ISCC.exe (Inno Setup 6), en este orden: SNF_ISCC, `%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe` y
 * `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`. null si no está en ninguno. No descarga ni instala nada.
 * @param {object} [env]
 * @param {(ruta: string) => boolean} [hay] si existe un archivo (las pruebas pasan uno falso)
 * @returns {string|null}
 */
export function buscarIscc(env = process.env, hay = esArchivo) {
  const candidatos = [
    env.SNF_ISCC,
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, ...ISCC_RELATIVO) : null,
    ISCC_X86,
  ];
  return candidatos.find((r) => typeof r === 'string' && r !== '' && hay(r)) ?? null;
}

/**
 * Compila el instalador: `ISCC.exe /DVersion=<v> "/DRaiz=<raiz>" "/O<salida>" /FSnetForever-Instalador-<v> inno\SnetForever.iss`.
 * Si ya hay un .exe con ese nombre en `salida`, primero va a lo apartado (apartado.mjs; ISCC lo pisaría).
 * @param {object} p
 * @param {string} p.raiz la de prepararRaiz
 * @param {string} p.version la de la app (`actual.txt` de la raíz)
 * @param {string|null} p.iscc la de buscarIscc
 * @param {string} [p.salida] por defecto dist/instalador
 * @param {(texto: string) => void} [p.registro] recibe la salida de ISCC
 * @param {object} [p.env] SNF_CUARENTENA (donde va un .exe anterior; por defecto dist/apartado: apartado.mjs)
 * @returns {string} la ruta del .exe
 * @throws {ErrorInstalador}
 */
export function compilar({ raiz, version, iscc, salida = SALIDA_POR_DEFECTO, registro = () => {}, env = process.env } = {}) {
  if (typeof iscc !== 'string' || !esArchivo(iscc)) {
    throw new ErrorInstalador('iscc', `No está ISCC.exe (Inno Setup 6)${iscc ? `: «${iscc}»` : ''}. Instálalo o pon su ruta en SNF_ISCC.`);
  }
  if (typeof version !== 'string' || !VERSION_APP.test(version)) {
    throw new ErrorInstalador('version', `La versión del instalador no vale: ${JSON.stringify(version)}`);
  }
  const carpeta = resolve(salida);
  const exe = join(carpeta, NOMBRE_EXE(version));
  if (existe(exe)) moverDentro(exe, carpetaApartado(env));
  mkdirSync(carpeta, { recursive: true });
  const argumentos = [`/DVersion=${version}`, `/DRaiz=${resolve(raiz)}`, `/O${carpeta}`, `/F${NOMBRE_EXE(version).replace(/\.exe$/, '')}`, ISS];
  let texto;
  try {
    texto = execFileSync(iscc, argumentos, {
      cwd: EMPAQUETAR, encoding: 'utf8', windowsHide: true, timeout: 600_000, maxBuffer: 64 * 2 ** 20, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const salidaIscc = `${e?.stdout ?? ''}${e?.stderr ?? ''}`;
    registro(salidaIscc);
    const cola = salidaIscc.trim().split(/\r?\n/).slice(-15).join('\n');
    throw new ErrorInstalador('compilar', `ISCC.exe no pudo compilar el instalador (${e?.status ?? e?.code}):\n${cola}`, { cause: e });
  }
  registro(texto);
  if (!esArchivo(exe)) throw new ErrorInstalador('compilar', `ISCC.exe terminó sin dejar «${exe}»`);
  return exe;
}

const USO = 'Uso: npm run instalador -- --publicacion dist/publicacion/<publicación> [--salida <carpeta del .exe>] [--prueba]';

/**
 * La orden `npm run instalador`. Sale con 0 si deja el instalador compilado, con 1 si se niega (sin Inno Setup, una
 * publicación que no vale, la licencia de Node…) y con 2 si las opciones no valen o pasa algo inesperado.
 * Además de las del plan, admite `--salida` (la carpeta del .exe), `--raiz` (la carpeta de la raíz) y `--prueba` (ronda 1,
 * I3: acepta el resumen de la licencia de Node con un aviso; y, desde la revisión final, I1, también la clave pública en
 * null; ese .exe es solo para probar y no se puede publicar).
 */
export function principal(argv = process.argv.slice(2), {
  env = process.env, salida = process.stdout, errores = process.stderr, existe: hay = esArchivo,
} = {}) {
  let valores;
  try {
    ({ values: valores } = parseArgs({
      args: argv, strict: true, allowPositionals: false,
      options: { publicacion: { type: 'string' }, salida: { type: 'string' }, raiz: { type: 'string' }, prueba: { type: 'boolean' } },
    }));
    if (!valores.publicacion) throw new Error('Falta --publicacion');
  } catch (e) {
    errores.write(`${e.message}\n${USO}\n`);
    return 2;
  }
  try {
    const iscc = buscarIscc(env, hay);
    if (iscc === null) {
      throw new ErrorInstalador('iscc', 'No está Inno Setup 6 (ISCC.exe): instálalo o pon la ruta de ISCC.exe en SNF_ISCC. No se ha preparado nada.');
    }
    const raiz = prepararRaiz({
      env, publicacionDir: valores.publicacion, ...(valores.raiz ? { salida: valores.raiz } : {}),
      exigirLicenciaCompleta: !valores.prueba, exigirClave: !valores.prueba, avisar: (t) => errores.write(`${t}\n`),
    });
    const version = readFileSync(join(raiz, 'actual.txt'), 'ascii');
    // con --prueba, el .exe va aparte (dist/instalador/prueba) para no confundirlo con uno que se pueda publicar
    const carpetaExe = valores.salida ?? (valores.prueba ? join(SALIDA_POR_DEFECTO, 'prueba') : SALIDA_POR_DEFECTO);
    const exe = compilar({ raiz, version, iscc, env, salida: carpetaExe, registro: (t) => salida.write(t) });
    salida.write(`\nInstalador listo: ${exe}\nRaíz: ${raiz}\nNo se ha instalado nada: el instalador se prueba a mano (tarea 18).\n`);
    if (valores.prueba) salida.write('SOLO PARA PROBAR (--prueba): NO SE PUEDE PUBLICAR.\n');
    return 0;
  } catch (e) {
    const conocido = ['ErrorInstalador', 'ErrorPaquete', 'ErrorManifiesto'].includes(e?.name);
    errores.write(`No se ha hecho el instalador. ${e?.message ?? e}\n`);
    return conocido ? 1 : 2;
  }
}

const invocado = process.argv[1] ? resolve(process.argv[1]) : '';
const mismo = process.platform === 'win32' ? invocado.toLowerCase() === ESTE_ARCHIVO.toLowerCase() : invocado === ESTE_ARCHIVO;
if (mismo) process.exitCode = principal();
