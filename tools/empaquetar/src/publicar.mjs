// `npm run publicar` (fase 5, tarea 15): prepara una publicación firmada en una carpeta local. **No sube nada.**
//
// Deja en `<salida>\<publicacion>\` (por defecto tools\empaquetar\dist\publicacion, fuera de git):
// - los cinco paquetes `.snfpaq` (addon, rutas, misiones, comercio y app; formato F2, tarea 4);
// - `snetforever-manifiesto.json` (F1, JSON con 2 espacios y salto de línea final) y su firma `.sig` (tarea 14);
// - `LEEME-PUBLICAR.txt`, con lo que tiene que hacer el jugador para publicarlos. Publicar en GitHub lo hace solo él.
//
// Publicación puente (Task 8b, `soloApp` / `--solo-app`): solo la app, su manifiesto y su firma (3 archivos). Es el primer
// paso de la 0.7.0 (docs/comercio/2026-11-15-publicar-0.7.0.md): las apps 0.6.x pasan a la app 0.7.0 y siguen con su núcleo
// 0.6.x entero, con el comercio dentro. La app 0.6.x acepta un manifiesto al que le faltan componentes (solo ofrece lo que
// trae) y baja cada paquete de la misma versión de GitHub que el manifiesto, así que la puente no necesita los paquetes de
// los addons. No lee addons/ (ni versiones, ni esquemas, ni el comercio) y, si no se elige otra, se llama `v<app>`, para
// no chocar con la etiqueta de la publicación de los addons que viene después (`v<app>-<rutas>`).
//
// Antes de escribir nada lo comprueba todo, y si algo falla no deja nada en la salida:
// - versiones: el addon (`## Version` de SnetForever.toc, igual que `VERSION` de nucleo/espacio.lua), los datos (el
//   `## Version` de sus .toc), el comercio (el `## Version` de SnetForever_Comercio.toc: sin esquema de datos, Task 8) y la
//   app (app/src/version.mjs, igual que app/package.json);
// - F5-2: el `## X-SNF-EsquemaDatos` del addon tiene que ser el `esquema` de SNF_RUTAS y de SNF_MISIONES (nucleo.lua);
// - los archivos de `## X-SNF-App` de los datos (los lee la app, no el juego) tienen que estar, y van en el paquete;
// - con `comprobarGit`, que `git status --porcelain -- addons app` esté vacío (lo único que se lanza: solo lee);
// - el manifiesto pasa `validarManifiesto`, `leerManifiesto` y `comprobarPaquete` de la app, nunca lleva una fecha del
//   futuro (bloquearía las actualizaciones siguientes) y su firma se comprueba con la clave pública;
// - revisión final, I1: la clave pública de la carpeta de la clave tiene que ser la que lleva la app (CLAVE_PUBLICA); si
//   la app todavía no lleva ninguna (null), se publica, pero la salida avisa de que ningún PC podrá comprobarla.
//
// Las 20 ranuras de buzón (SnetForever_R001…) no van en ningún paquete: las crea la app en el PC del jugador.
// Si la carpeta de la publicación ya existe, primero se mueve entera a lo apartado (dist/apartado,
// apartado.mjs: revisión final, m3; nunca se borra nada).
import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { empaquetar, CARPETAS } from '../../../app/src/actualizar/paquete.mjs';
import {
  APP_CONOCE_COMERCIO, compararVersiones, comprobarPaquete, leerManifiesto, validarManifiesto, verificarFirma,
} from '../../../app/src/actualizar/manifiesto.mjs';
import { REPO_POR_DEFECTO } from '../../../app/src/actualizar/origen.mjs';
import { CLAVE_PUBLICA } from '../../../app/src/actualizar/clave-publica.mjs';
import { moverDentro } from '../../../app/src/mover.mjs';
import { carpetaApartado } from './apartado.mjs';
import { cargarClavePrivada, clavePublica, derClavePublica } from './firma/clave.mjs';
import { firmarBytes } from './firma/firmar.mjs';

const ESTE_ARCHIVO = fileURLToPath(import.meta.url);
const EMPAQUETAR = join(dirname(ESTE_ARCHIVO), '..');
/** La raíz del repositorio (la que tiene addons\ y app\). */
export const RAIZ_REPO = join(EMPAQUETAR, '..', '..');
/** Donde se deja la publicación si no se dice otra cosa (tools/empaquetar/dist/ está en .gitignore). */
export const SALIDA_POR_DEFECTO = join(EMPAQUETAR, 'dist', 'publicacion');
const PLANTILLA_LEEME = join(EMPAQUETAR, 'plantillas', 'LEEME-PUBLICAR.txt');

export const MANIFIESTO = 'snetforever-manifiesto.json';
export const FIRMA = `${MANIFIESTO}.sig`;
export const LEEME = 'LEEME-PUBLICAR.txt';
const COMPONENTES = ['addon', 'rutas', 'misiones', 'comercio', 'app'];
// tarea 16, ronda 1 (M8): el SnetForever.vbs de la fase 4 no viaja en el paquete; el que se usa es el de la raíz del
// instalador (plantillas/SnetForever.vbs), que lanza arranque.mjs
const EXCLUIR_APP = ['app/test/', 'app/typescript/', 'app/node_modules/', 'app/SnetForever.vbs'];
const VERSION = /^\d+(\.\d+){1,3}$/;

/**
 * Error de la publicación. `code`:
 * - `'version'`: una versión que falta, que no vale o que no cuadra (addon: .toc frente a espacio.lua; app: version.mjs
 *   frente a package.json), o un `version.addon` que no vale; o la app es anterior a `APP_CONOCE_COMERCIO` (0.7.0) y la
 *   publicación lleva el comercio (Task 8, ronda 1);
 * - `'compatibilidad'` (F5-2): falta el esquema de datos del addon o de los datos, o no son el mismo;
 * - `'archivo'`: falta un archivo que se necesita (un .toc, un nucleo.lua, uno de `## X-SNF-App`…);
 * - `'sucio'`: hay cambios sin guardar en addons/ o app/ (`git status --porcelain`);
 * - `'git'`: no se pudo preguntar a git (no está, o la raíz no es un repositorio);
 * - `'fecha'`: `ahora` no es una fecha o es del futuro;
 * - `'publicacion'`, `'notas'`, `'json'`…: lo que diga `validarManifiesto` (el mismo código que su ErrorManifiesto);
 * - `'firma'`: la firma no se verifica con la clave pública de la carpeta de la clave;
 * - `'clave'` (revisión final, I1): la clave pública de la carpeta de la clave no es la que lleva la app (CLAVE_PUBLICA),
 *   o la de la app no se entiende: todos los PC rechazarían el manifiesto con `firma`;
 * - `'orden'` (Task 8b, ronda 1): el orden de firma de la puente y la normal no vale (ver `comprobarOrden`);
 * - `'opciones'`: `sinPuente` junto con `soloApp`.
 */
export class ErrorPublicar extends Error {
  constructor(code, mensaje, opciones) {
    super(mensaje, opciones);
    this.name = 'ErrorPublicar';
    this.code = code;
  }
}

const sha256 = (datos) => createHash('sha256').update(datos).digest('hex');
const citar = (x) => JSON.stringify(x);

function existe(ruta) {
  try {
    lstatSync(ruta);
    return true;
  } catch {
    return false;
  }
}

function leerTexto(ruta) {
  try {
    return readFileSync(ruta, 'utf8');
  } catch (e) {
    throw new ErrorPublicar('archivo', `No se pudo leer «${ruta}»: ${e.message}`, { cause: e });
  }
}

/** El valor de `## <nombre>: <valor>` de un .toc, o null si no está. */
function campoToc(texto, nombre) {
  const m = new RegExp(`^##[ \\t]*${nombre}[ \\t]*:[ \\t]*(.*?)[ \\t]*\\r?$`, 'm').exec(texto);
  return m ? m[1] : null;
}

function versionValida(version, que) {
  if (typeof version !== 'string' || !VERSION.test(version)) throw new ErrorPublicar('version', `${que}: versión no válida ${citar(version)}`);
  return version;
}

// El addon: `## Version` de SnetForever.toc, que tiene que ser el `VERSION` de nucleo/espacio.lua.
function leerAddon(addons) {
  const carpeta = join(addons, CARPETAS.addon);
  const toc = leerTexto(join(carpeta, 'SnetForever.toc'));
  const version = versionValida(campoToc(toc, 'Version'), 'SnetForever.toc');
  const espacio = leerTexto(join(carpeta, 'nucleo', 'espacio.lua'));
  const m = /^[ \t]*(?:[A-Za-z_]\w*\.)?VERSION[ \t]*=[ \t]*"([^"\r\n]*)"/m.exec(espacio);
  if (!m) throw new ErrorPublicar('version', 'nucleo/espacio.lua no dice VERSION = "…"');
  if (m[1] !== version) {
    throw new ErrorPublicar('version', `SnetForever.toc dice ${version} y nucleo/espacio.lua dice VERSION = ${citar(m[1])}: tienen que ser iguales`);
  }
  const esquema = campoToc(toc, 'X-SNF-EsquemaDatos');
  if (esquema === null || !/^[1-9]\d{0,8}$/.test(esquema)) {
    throw new ErrorPublicar('compatibilidad', `SnetForever.toc no dice «## X-SNF-EsquemaDatos: N» (F5-2): ${citar(esquema)}`);
  }
  return { version, esquemaDatos: Number(esquema) };
}

// Unos datos (rutas o misiones): `## Version` de su .toc, el `esquema` de su nucleo.lua y los archivos de X-SNF-App.
function leerDatos(addons, componente, variable) {
  const nombre = CARPETAS[componente];
  const carpeta = join(addons, nombre);
  const toc = leerTexto(join(carpeta, `${nombre}.toc`));
  const version = versionValida(campoToc(toc, 'Version'), `${nombre}.toc`);
  const nucleo = leerTexto(join(carpeta, 'nucleo.lua'));
  const m = new RegExp(`^${variable}[ \\t]*=[ \\t]*\\{[^\\r\\n]*?\\besquema[ \\t]*=[ \\t]*(\\d+)`, 'm').exec(nucleo);
  if (!m) throw new ErrorPublicar('compatibilidad', `${nombre}/nucleo.lua no dice ${variable} = {…, esquema = N} (F5-2)`);
  const app = campoToc(toc, 'X-SNF-App');
  for (const archivo of (app ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (/[\\/]/.test(archivo) || archivo === '.' || archivo === '..') {
      throw new ErrorPublicar('archivo', `${nombre}.toc: X-SNF-App con un nombre que no vale: ${citar(archivo)}`);
    }
    let info = null;
    try {
      info = lstatSync(join(carpeta, archivo));
    } catch { /* falta: se dice abajo */ }
    if (!info?.isFile()) throw new ErrorPublicar('archivo', `${nombre}.toc pide «${archivo}» en X-SNF-App y no está en ${carpeta}`);
  }
  return { version, esquemaDatos: Number(m[1]) };
}

// El comercio (0.7.0, Task 8): `## Version` de SnetForever_Comercio.toc. No lleva esquema de datos ni archivos de X-SNF-App.
function leerComercio(addons) {
  const nombre = CARPETAS.comercio;
  const toc = leerTexto(join(addons, nombre, `${nombre}.toc`));
  return { version: versionValida(campoToc(toc, 'Version'), `${nombre}.toc`) };
}

// Todo lo de addons/ que lleva la publicación normal (versiones y esquemas), comprobado; la puente no lo lee.
function leerAddons(carpeta) {
  const addon = leerAddon(carpeta);
  const rutas = leerDatos(carpeta, 'rutas', 'SNF_RUTAS');
  const misiones = leerDatos(carpeta, 'misiones', 'SNF_MISIONES');
  const comercio = leerComercio(carpeta);
  if (rutas.esquemaDatos !== addon.esquemaDatos || misiones.esquemaDatos !== addon.esquemaDatos) {
    throw new ErrorPublicar('compatibilidad',
      `El addon pide el esquema de datos ${addon.esquemaDatos} (X-SNF-EsquemaDatos) y los datos tienen el ${rutas.esquemaDatos} (rutas) y el ${misiones.esquemaDatos} (misiones): no se publica nada`);
  }
  return { carpeta, addon, rutas, misiones, comercio };
}

// La app: app/src/version.mjs, igual que app/package.json. `nodeMinimo` sale de `engines.node` (">=24" → "24.0.0").
function leerApp(raiz) {
  const fuente = leerTexto(join(raiz, 'app', 'src', 'version.mjs'));
  const m = /export\s+const\s+VERSION\s*=\s*["']([^"'\r\n]*)["']/.exec(fuente);
  if (!m) throw new ErrorPublicar('version', 'app/src/version.mjs no dice export const VERSION = "…"');
  const version = versionValida(m[1], 'app/src/version.mjs');
  let paquete;
  try {
    paquete = JSON.parse(leerTexto(join(raiz, 'app', 'package.json')));
  } catch (e) {
    if (e instanceof ErrorPublicar) throw e;
    throw new ErrorPublicar('version', `app/package.json no es JSON: ${e.message}`, { cause: e });
  }
  if (paquete?.version !== version) {
    throw new ErrorPublicar('version', `app/src/version.mjs dice ${version} y app/package.json dice ${citar(paquete?.version)}: tienen que ser iguales`);
  }
  const n = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(paquete?.engines?.node ?? '').trim());
  if (!n) throw new ErrorPublicar('version', `app/package.json: engines.node tiene que ser «>=N», no ${citar(paquete?.engines?.node)}`);
  return { version, nodeMinimo: `${n[1]}.${n[2] ?? 0}.${n[3] ?? 0}` };
}

// Lo único que se lanza: git status, que solo lee.
function comprobarLimpio(raiz) {
  let salida;
  try {
    salida = execFileSync('git', ['status', '--porcelain', '--', 'addons', 'app'], {
      cwd: raiz, encoding: 'utf8', windowsHide: true, timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const detalle = String(e?.stderr ?? '').trim() || e.message;
    throw new ErrorPublicar('git', `No se pudo mirar con git si hay cambios en «${raiz}»: ${detalle}`, { cause: e });
  }
  const lineas = salida.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length > 0) {
    const muestra = lineas.slice(0, 10).join('\n');
    throw new ErrorPublicar('sucio',
      `Hay cambios sin guardar en addons/ o app/ (git status): guárdalos en un commit antes de publicar.\n${muestra}${lineas.length > 10 ? '\n…' : ''}`);
  }
}

// Copia `origen` (una carpeta) a `destino`, que no puede existir, sin pisar nada (`COPYFILE_EXCL`). No se usa cpSync: en
// Node 24.14 estropea en Windows las rutas con tildes (C:\Users\José Ñandú\…, vigilancia 3). Un enlace o una unión no
// se copia: ErrorPublicar 'archivo' (empaquetar tampoco los admite).
function copiarCarpeta(origen, destino) {
  mkdirSync(destino);
  for (const nombre of readdirSync(origen)) {
    const de = join(origen, nombre);
    const a = join(destino, nombre);
    const info = lstatSync(de);
    if (info.isDirectory()) copiarCarpeta(de, a);
    else if (info.isFile()) copyFileSync(de, a, constants.COPYFILE_EXCL);
    else throw new ErrorPublicar('archivo', `«${de}» no es un archivo ni una carpeta (¿un enlace o una unión?): no se copia`);
  }
}

// `version.addon`: copia la carpeta del addon a una carpeta temporal nueva y cambia solo el `## Version` de su .toc. El
// repositorio no se toca. La copia se queda en %TEMP% (aquí no se borra nada).
function copiaConVersion(addons, version) {
  const temporal = mkdtempSync(join(tmpdir(), 'snf-publicar-addon-'));
  const carpeta = join(temporal, CARPETAS.addon);
  copiarCarpeta(join(addons, CARPETAS.addon), carpeta);
  const toc = join(carpeta, 'SnetForever.toc');
  const texto = readFileSync(toc, 'utf8');
  const nuevo = texto.replace(/^(##[ \t]*Version[ \t]*:[ \t]*)[^\r\n]*/m, `$1${version}`);
  writeFileSync(toc, nuevo);
  return temporal;
}

function fechaDe(ahora) {
  const fecha = ahora instanceof Date ? ahora : new Date(ahora);
  if (!Number.isFinite(fecha.getTime())) throw new ErrorPublicar('fecha', `La fecha de la publicación no vale: ${citar(String(ahora))}`);
  if (fecha.getTime() > Date.now()) {
    throw new ErrorPublicar('fecha',
      `No se firma un manifiesto con fecha del futuro (${fecha.toISOString()}): bloquearía todas las actualizaciones siguientes`);
  }
  return fecha.toISOString();
}

// Revisión final, I1: la pública de la carpeta de la clave tiene que ser la de la app. Con la de la app en null no hay con
// qué comparar: devuelve true (se avisa en la salida).
function comprobarClaveApp(publica, claveApp) {
  if (claveApp === null) return true;
  const app = derClavePublica(claveApp);
  if (app === null) {
    throw new ErrorPublicar('clave', 'La clave pública de la app (CLAVE_PUBLICA en app/src/actualizar/clave-publica.mjs) no se entiende: no se publica nada');
  }
  const deLaCarpeta = derClavePublica(publica);
  if (deLaCarpeta === null || !deLaCarpeta.equals(app)) {
    throw new ErrorPublicar('clave',
      'La clave de firma (la de la carpeta de la clave) no es la que lleva la app (CLAVE_PUBLICA): todos los PC rechazarían el manifiesto. No se publica nada.');
  }
  return false;
}

function validar(objeto) {
  try {
    return validarManifiesto(objeto);
  } catch (e) {
    throw new ErrorPublicar(e?.code ?? 'json', e.message, { cause: e });
  }
}

// Task 8b, ronda 1: el orden de firma. La app (la 0.6.x y la 0.7.0) apunta la fecha de cada manifiesto bueno y rechaza como
// «antiguo» uno con una fecha anterior. Si la normal de una app se firmara antes que su puente, las apps que vieran la puente
// rechazarían después la normal y se quedarían en el núcleo viejo: en la bandeja solo sale «Actualización: no se pudo
// comprobar» (textos.mjs, sin decir por qué) y en el registro queda `antiguo`. Por eso, mirando las publicaciones que ya hay en
// la carpeta de salida (cada subcarpeta con un manifiesto que se entiende):
// - la puente se niega si ya hay una normal de la misma app (estaría firmada antes que la puente que se quiere sacar);
// - ronda 2: la normal solo pide la puente en el cruce al comercio, o sea, si es la primera normal con comercio de la salida
//   (no hay otra normal con `comercio`, sin contar la carpeta con su mismo nombre, que se va a apartar). Entonces se niega si
//   no hay una puente de la misma app firmada antes que ella, salvo con `sinPuente` (el cruce ya se hizo en otro sitio). Con
//   la carpeta vacía (otro PC, una copia limpia) no se sabe si el cruce ya se hizo: se pide, que es lo seguro.
function publicacionesEn(base) {
  let nombres;
  try {
    nombres = readdirSync(base);
  } catch {
    return [];
  }
  const salida = [];
  for (const nombre of nombres) {
    let m;
    try {
      m = JSON.parse(readFileSync(join(base, nombre, MANIFIESTO), 'utf8'));
    } catch {
      continue; // no es una publicación (o no se entiende): no cuenta
    }
    const c = m?.componentes;
    if (c === null || typeof c !== 'object' || typeof c.app?.version !== 'string' || !Number.isFinite(Date.parse(m?.fecha))) continue;
    salida.push({
      nombre, fecha: m.fecha, app: c.app.version, puente: Object.keys(c).length === 1, normal: Object.hasOwn(c, 'addon'),
      comercio: Object.hasOwn(c, 'comercio'),
    });
  }
  return salida;
}

function comprobarOrden({ base, nombre, soloApp, sinPuente, llevaComercio, versionApp, fecha }) {
  const todas = publicacionesEn(base);
  const deEstaApp = todas.filter((p) => p.app === versionApp);
  if (soloApp) {
    const normales = deEstaApp.filter((p) => p.normal).map((p) => p.nombre);
    if (normales.length === 0) return;
    throw new ErrorPublicar('orden',
      `En «${base}» ya está la publicación normal ${normales.join(', ')} de la app ${versionApp}, firmada antes. Una puente firmada ahora `
      + 'sería más nueva, y las apps que la vieran rechazarían después esa normal como antigua (se quedarían en el núcleo viejo; en la bandeja de la app saldría «Actualización: no se pudo comprobar», que no dice por qué, '
      + 'y en el registro quedaría «antiguo»). '
      + 'Si se rehace la puente, se rehace también la normal después: aparta esa carpeta (o usa otra salida), saca la puente y luego '
      + 'otra vez la normal. No se publica nada');
  }
  if (sinPuente || !llevaComercio) return;
  // ronda 2: el cruce ya está hecho si hay otra normal con comercio (la de su mismo nombre se va a apartar: no cuenta)
  if (todas.some((p) => p.normal && p.comercio && p.nombre !== nombre)) return;
  const puentes = deEstaApp.filter((p) => p.puente);
  if (puentes.some((p) => Date.parse(p.fecha) < Date.parse(fecha))) return;
  if (puentes.length > 0) {
    throw new ErrorPublicar('orden',
      `La publicación puente ${puentes.map((p) => p.nombre).join(', ')} de la app ${versionApp} está firmada después (o a la vez) que esta `
      + `normal (${fecha}): las apps que vieran la puente rechazarían la normal como antigua. Saca la normal después de la puente. No se publica nada`);
  }
  throw new ErrorPublicar('orden',
    `En «${base}» no hay ninguna normal con comercio, así que esta sería la primera publicación normal con comercio (el cruce), y no hay `
    + `una publicación puente de la app ${versionApp} firmada antes. En el cruce la normal va siempre después de la puente: primero `
    + '«npm run publicar -- --solo-app» y luego esta. Si el cruce ya se publicó (desde otro PC o con otra carpeta de salida), '
    + 'añade --sin-puente. No se publica nada');
}

// El párrafo del LEEME de la publicación puente (con la normal, nada).
function parrafoPuente(versionApp) {
  return `Esta es una publicación puente: solo lleva la app ${versionApp}, sin el núcleo, sin los datos y sin el comercio. `
    + 'Las apps ya instaladas se actualizan a esta app y siguen con los addons que tienen, tal como están. '
    + 'Cuando lleve un tiempo publicada, después viene la publicación de los addons: se prepara con «npm run publicar» '
    + '(sin --solo-app), lleva otra etiqueta y también se marca como "Latest". Esta versión no se borra de GitHub. '
    + 'El instalador (.exe) no se prepara con esta carpeta, sino con la de la publicación de los addons. '
    // ronda 1: el orden de firma, en dos frases
    + 'Orden: la de los addons se firma siempre después de esta (si se rehace esta, se rehace también aquella, después), y en GitHub '
    + 'cada una se marca "Latest" a mano, la de los addons nunca antes que esta. Si no, las apps rechazan como antigua una de los '
    + 'addons firmada antes que esta y se quedan en el núcleo viejo (en la bandeja de la app sale «Actualización: no se pudo comprobar», '
    + 'que no dice por qué, y en el registro queda «antiguo»), o, con la de los addons en "Latest" antes de tiempo, '
    + 'vuelve la sesión sin comercio.';
}

function textoLeeme({ publicacion, nombres, puente }) {
  const lineas = nombres.map(({ nombre, bytes }) => `- ${nombre} (${bytes.length} bytes, SHA-256 ${sha256(bytes)})`);
  const plantilla = readFileSync(PLANTILLA_LEEME, 'utf8');
  const salto = plantilla.includes('\r\n') ? '\r\n' : '\n';
  // {{puente}} va al principio de un párrafo: con la normal desaparece sin dejar una línea en blanco de más
  return plantilla
    .replaceAll('{{puente}}', puente ? `${puente}${salto}${salto}` : '')
    .replaceAll('{{cuantos}}', String(nombres.length))
    .replaceAll('{{publicacion}}', publicacion)
    .replaceAll('{{repo}}', REPO_POR_DEFECTO)
    .replaceAll('{{archivos}}', lineas.join('\n'));
}

/**
 * Prepara una publicación firmada en `<salida>\<publicacion>\`. No sube nada.
 * @param {object} [p]
 * @param {string} [p.raiz] la raíz del repositorio (con addons\ y app\); por defecto, la de este archivo
 * @param {string} [p.salida] la carpeta de las publicaciones (relativa a la carpeta actual); por defecto
 *   tools\empaquetar\dist\publicacion
 * @param {{es?: string, en?: string}} [p.notas]
 * @param {boolean} [p.soloApp] la publicación puente (Task 8b): solo la app, sin leer addons/; no se puede con `version.addon`
 *   ni con una etiqueta `v<app>-…` (la forma de la normal)
 * @param {boolean} [p.sinPuente] la normal sin exigir una puente de su app firmada antes en la salida (`comprobarOrden`): solo
 *   hace falta en la primera normal con comercio de la salida (el cruce), cuando el cruce ya se publicó desde otra salida u
 *   otro PC; no va con `soloApp`
 * @param {string} [p.publicacion] por defecto `v<app>-<rutas>` (con `soloApp`, `v<app>`); tiene que cumplir `^v\d+\.\d+\.\d+(-[0-9.]+)?$`
 * @param {{addon?: string}} [p.version] `addon` (solo para la tarea 18): otra versión del addon, en una copia temporal
 * @param {boolean} [p.comprobarGit] por defecto true: se niega si hay cambios sin guardar en addons/ o app/
 * @param {object} [p.env] SNF_FIRMA_DIR (la clave) y SNF_CUARENTENA (donde va una publicación anterior con el mismo nombre; por defecto
 *   dist/apartado: apartado.mjs)
 * @param {string} [p.appConoceComercio] la app más vieja con la que se publica el comercio (por defecto
 *   `APP_CONOCE_COMERCIO`); solo lo cambian las pruebas, cuyo repositorio de mentira lleva una app vieja
 * @param {Date|string|number} [p.ahora] la fecha del manifiesto; nunca del futuro
 * @param {string|null} [p.claveApp] la clave pública que lleva la app (por defecto CLAVE_PUBLICA): la de la carpeta de la
 *   clave tiene que ser la misma (si no, 'clave'); con null se publica y `sinClaveApp` es true
 * @returns {{carpeta: string, manifiesto: object, archivos: string[], leeme: string, apartada: string|null,
 *   copiaTemporal: string|null, sinClaveApp: boolean, soloApp: boolean}} `archivos` son los que hay que subir (7; con
 *   `soloApp`, 3); `apartada`, donde quedó en
 *   lo apartado (apartado.mjs) la publicación anterior con el mismo nombre; `copiaTemporal`, la copia del addon con
 *   `version.addon`; `sinClaveApp`, si la app todavía no lleva clave pública (ningún PC podrá comprobar esta publicación)
 * @throws {ErrorPublicar} y los ErrorFirma (tarea 14) y ErrorPaquete (tarea 4) que lleguen
 */
export function publicar({
  raiz = RAIZ_REPO, salida = SALIDA_POR_DEFECTO, notas = { es: '', en: '' }, publicacion, version = {}, comprobarGit = true,
  env = process.env, ahora = new Date(), claveApp = CLAVE_PUBLICA, appConoceComercio = APP_CONOCE_COMERCIO, soloApp = false,
  sinPuente = false,
} = {}) {
  const fecha = fechaDe(ahora);
  if (soloApp && sinPuente) {
    throw new ErrorPublicar('opciones', '--sin-puente es para la publicación normal; con --solo-app no vale. No se publica nada');
  }
  if (soloApp && version?.addon !== undefined) {
    throw new ErrorPublicar('version', 'La publicación puente (solo la app) no lleva el addon: no se puede elegir su versión. No se publica nada');
  }
  // la puente no lee addons/: no los lleva, así que su estado no importa
  const addons = soloApp ? null : leerAddons(join(raiz, 'addons'));
  const app = leerApp(raiz);
  const versionAddon = soloApp ? null : version?.addon === undefined ? addons.addon.version : versionValida(version.addon, 'version.addon');
  if (typeof notas?.es !== 'string' || typeof notas?.en !== 'string') throw new ErrorPublicar('notas', 'Las notas tienen que ser dos textos (es y en)');
  const nombrePublicacion = publicacion ?? (soloApp ? `v${app.version}` : `v${app.version}-${addons.rutas.version}`);
  // ronda 1, M4: la puente no se llama como una normal de su app (v<app>-…): se confundirían en GitHub y al mirar el orden
  if (soloApp && nombrePublicacion.startsWith(`v${app.version}-`)) {
    throw new ErrorPublicar('publicacion',
      `La publicación puente no puede llamarse ${nombrePublicacion}: es la forma de la normal de la app ${app.version}. Déjala en v${app.version}. No se publica nada`);
  }
  // ronda 2, m2: y la normal no se llama v<app> a secas, que es el nombre de la puente
  if (!soloApp && nombrePublicacion === `v${app.version}`) {
    throw new ErrorPublicar('publicacion',
      `La publicación normal no puede llamarse ${nombrePublicacion}: es el nombre de la publicación puente de la app ${app.version}. `
      + `Usa v${app.version}-<algo> (por defecto, v${app.version}-<versión de las rutas>). No se publica nada`);
  }
  // la publicación (que es también el nombre de la carpeta) y la fecha, con las reglas de la app, antes de crear nada
  validar({ esquema: 1, producto: 'SnetForever', publicacion: nombrePublicacion, fecha, componentes: {} });
  if (comprobarGit) comprobarLimpio(raiz);

  // la clave antes de empaquetar: sin ella no se hace nada
  const privada = cargarClavePrivada({ env });
  const publica = clavePublica({ env });
  const sinClaveApp = comprobarClaveApp(publica, claveApp);

  // Task 8, ronda 1 (antes de empaquetar nada): el núcleo 0.7.0 no lleva el comercio dentro. Con una app anterior, las apps viejas instalarían el núcleo
  // y nunca recibirían el comercio (la publicación normal siempre lo lleva): no se publica nada. La puente no lleva el comercio.
  if (!soloApp && compararVersiones(app.version, appConoceComercio) < 0) {
    throw new ErrorPublicar('version',
      `La app es la ${app.version} y la publicación lleva el addon de comercio: hace falta la app ${appConoceComercio} o más nueva, `
      + 'que es la que sabe instalarlo (si no, las apps viejas instalarían el núcleo y se quedarían sin comercio). No se publica nada');
  }
  // ronda 1: el orden de firma frente a lo que ya hay en la salida, antes de empaquetar nada
  // la puente solo lleva la app (Task 8b); la normal, los cinco
  const lleva = soloApp ? ['app'] : COMPONENTES;
  comprobarOrden({
    base: resolve(salida), nombre: nombrePublicacion, soloApp, sinPuente, llevaComercio: lleva.includes('comercio'), versionApp: app.version, fecha,
  });
  const copiaTemporal = soloApp || versionAddon === addons.addon.version ? null : copiaConVersion(addons.carpeta, versionAddon);
  const paquetes = { app: empaquetar({ componente: 'app', version: app.version, raiz, excluir: EXCLUIR_APP }) };
  const versiones = { app: app.version };
  if (!soloApp) {
    const { carpeta, addon, rutas, misiones, comercio } = addons;
    Object.assign(paquetes, {
      addon: empaquetar({ componente: 'addon', version: versionAddon, raiz: copiaTemporal ?? carpeta, esquemaDatos: addon.esquemaDatos }),
      rutas: empaquetar({ componente: 'rutas', version: rutas.version, raiz: carpeta, esquemaDatos: rutas.esquemaDatos }),
      misiones: empaquetar({ componente: 'misiones', version: misiones.version, raiz: carpeta, esquemaDatos: misiones.esquemaDatos }),
      comercio: empaquetar({ componente: 'comercio', version: comercio.version, raiz: carpeta }),
    });
    Object.assign(versiones, { addon: versionAddon, rutas: rutas.version, misiones: misiones.version, comercio: comercio.version });
  }
  const componentes = {};
  for (const c of lleva) {
    const bytes = paquetes[c];
    componentes[c] = { version: versiones[c], archivo: `SnetForever-${c}-${versiones[c]}.snfpaq`, tamano: bytes.length, sha256: sha256(bytes) };
  }
  if (!soloApp) {
    // appMinima = la app de esta publicación, que ya es de APP_CONOCE_COMERCIO o más (se comprobó arriba)
    Object.assign(componentes.addon, { appMinima: app.version, esquemaDatos: addons.addon.esquemaDatos });
    componentes.rutas.esquemaDatos = addons.rutas.esquemaDatos;
    componentes.misiones.esquemaDatos = addons.misiones.esquemaDatos;
    componentes.comercio.appMinima = app.version; // sin esquemaDatos: el comercio no lleva datos convertidos
  }
  componentes.app.nodeMinimo = app.nodeMinimo;

  const manifiesto = validar({
    esquema: 1, producto: 'SnetForever', publicacion: nombrePublicacion, fecha, componentes, notas: { es: notas.es, en: notas.en },
  });
  const bytesManifiesto = Buffer.from(`${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
  // lo que leerá la app: el mismo manifiesto, y cada paquete frente a su entrada
  let leido;
  try {
    leido = leerManifiesto(bytesManifiesto);
    for (const c of lleva) comprobarPaquete(leido, c, paquetes[c]);
  } catch (e) {
    throw new ErrorPublicar(e?.code ?? 'json', e.message, { cause: e });
  }
  const firma = firmarBytes(bytesManifiesto, privada);
  if (!verificarFirma(bytesManifiesto, firma, publica)) {
    throw new ErrorPublicar('firma', 'La firma no se verifica con clave-publica.pem: la pública de la carpeta de la clave no es la de la privada');
  }

  const nombres = [
    ...lleva.map((c) => ({ nombre: componentes[c].archivo, bytes: paquetes[c] })),
    { nombre: MANIFIESTO, bytes: bytesManifiesto },
    { nombre: FIRMA, bytes: Buffer.from(firma, 'utf8') },
  ];
  const leeme = textoLeeme({ publicacion: nombrePublicacion, nombres, puente: soloApp ? parrafoPuente(app.version) : '' });

  // escribir: la publicación anterior con el mismo nombre va antes a lo apartado (apartado.mjs: nunca se pisa ni se borra)
  const base = resolve(salida);
  const carpeta = join(base, nombrePublicacion);
  const apartada = existe(carpeta) ? moverDentro(carpeta, carpetaApartado(env)) : null;
  mkdirSync(base, { recursive: true });
  mkdirSync(carpeta); // sin recursive: si alguien la creó entre medias, EEXIST y no se pisa nada
  const archivos = nombres.map(({ nombre, bytes }) => {
    const ruta = join(carpeta, nombre);
    writeFileSync(ruta, bytes, { flag: 'wx' });
    return ruta;
  });
  const rutaLeeme = join(carpeta, LEEME);
  writeFileSync(rutaLeeme, leeme, { encoding: 'utf8', flag: 'wx' });
  return { carpeta, manifiesto: leido, archivos, leeme: rutaLeeme, apartada, copiaTemporal, sinClaveApp, soloApp };
}

const USO = 'Uso: npm run publicar -- [--solo-app | --sin-puente] [--notas-es "…"] [--notas-en "…"] [--publicacion v0.5.0-…] [--version-addon 0.5.0.1]';

/**
 * La orden `npm run publicar`. Sale con 0 si deja la publicación lista, con 1 si se niega (cambios sin guardar, versiones
 * que no cuadran, sin clave…) y con 2 si las opciones no valen o pasa algo inesperado.
 * Además de las del plan, admite `--raiz` y `--salida` (las usan las pruebas), `--solo-app` (la publicación puente, Task 8b) y `--sin-puente` (la primera normal con comercio sin
 * puente previa en la salida, cuando el cruce ya se publicó en otro sitio; ronda 2).
 */
export function principal(argv = process.argv.slice(2), { env = process.env, salida = process.stdout, errores = process.stderr } = {}) {
  let valores;
  try {
    ({ values: valores } = parseArgs({
      args: argv, strict: true, allowPositionals: false,
      options: {
        'notas-es': { type: 'string' }, 'notas-en': { type: 'string' }, publicacion: { type: 'string' },
        'version-addon': { type: 'string' }, raiz: { type: 'string' }, salida: { type: 'string' }, 'solo-app': { type: 'boolean' },
        'sin-puente': { type: 'boolean' },
      },
    }));
  } catch (e) {
    errores.write(`${e.message}\n${USO}\n`);
    return 2;
  }
  try {
    const r = publicar({
      ...(valores.raiz ? { raiz: resolve(valores.raiz) } : {}),
      ...(valores.salida ? { salida: valores.salida } : {}),
      notas: { es: valores['notas-es'] ?? '', en: valores['notas-en'] ?? '' },
      ...(valores.publicacion !== undefined ? { publicacion: valores.publicacion } : {}),
      ...(valores['version-addon'] !== undefined ? { version: { addon: valores['version-addon'] } } : {}),
      ...(valores['solo-app'] ? { soloApp: true } : {}),
      ...(valores['sin-puente'] ? { sinPuente: true } : {}),
      env,
    });
    const lineas = [`Publicación ${r.manifiesto.publicacion} lista en: ${r.carpeta}`];
    for (const ruta of r.archivos) lineas.push(`  ${ruta.slice(r.carpeta.length + 1)}`);
    if (r.apartada) lineas.push(`La publicación anterior con ese nombre está ahora apartada (dist/apartado): ${r.apartada}`);
    if (r.soloApp) {
      lineas.push('Es la publicación puente (solo la app): después viene la de los addons, con «npm run publicar» sin --solo-app.');
    }
    if (r.copiaTemporal) lineas.push(`Copia temporal del addon (se puede quitar): ${r.copiaTemporal}`);
    lineas.push(`Estos archivos NO se han subido a ningún sitio: lee ${LEEME} en esa carpeta.`);
    if (r.sinClaveApp) {
      lineas.push('AVISO: la app todavía no lleva clave pública (CLAVE_PUBLICA = null en app/src/actualizar/clave-publica.mjs): '
        + 'ningún PC podrá comprobar esta publicación hasta que la app lleve la clave de esta firma (tarea 18).');
    }
    salida.write(`${lineas.join('\n')}\n`);
    return 0;
  } catch (e) {
    const conocido = ['ErrorPublicar', 'ErrorFirma', 'ErrorPaquete', 'ErrorManifiesto'].includes(e?.name);
    errores.write(`No se publica nada. ${e?.message ?? e}\n`);
    return conocido ? 1 : 2;
  }
}

const invocado = process.argv[1] ? resolve(process.argv[1]) : '';
const mismo = process.platform === 'win32' ? invocado.toLowerCase() === ESTE_ARCHIVO.toLowerCase() : invocado === ESTE_ARCHIVO;
if (mismo) process.exitCode = principal();
