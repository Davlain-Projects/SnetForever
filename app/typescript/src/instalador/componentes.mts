// Instalar el addon y los datos con el juego cerrado (fase 5, tarea 8; vigilancia 1).
//
// Los componentes de AddOns (`addon`, `rutas`, `misiones` y `comercio`) se cambian así, sin dejar nunca nada a medias:
//   1. la carpeta tiene que ser un `…\Interface\AddOns` que exista;
//   2. con el juego abierto (o si no se sabe), no se toca nada;
//   3. se abren y comprueban todos los paquetes en memoria (tarea 4), las rutas largas y el esquema de datos (F5-2);
//   4. lo que quedó de una instalación cortada en `<AddOns>\.snetforever-preparando\` va a la cuarentena;
//   5. cada paquete se extrae en `<AddOns>\.snetforever-preparando\<sello>\<carpeta>`;
//   6. se vuelve a mirar el juego;
//   7. por componente, dos renombres en el mismo volumen: `<AddOns>\<carpeta>` → `…\<sello>\viejo-<carpeta>` y la
//      preparada → `<AddOns>\<carpeta>`. Con EBUSY/EPERM/EACCES se reintenta a los 25, 50 y 75 ms; si sigue fallando,
//      se deshacen **todos** los componentes ya cambiados;
//   8. `…\<sello>` (con lo viejo) va a la cuarentena.
//
// Nunca se borra nada: lo sustituido, lo preparado que no llegó a ponerse y los restos van a la cuarentena con
// `moverDentro` (mover.mjs). Solo se tocan las carpetas de los componentes y `.snetforever-preparando`: nunca las demás de
// AddOns (`RXPGuides`, `OpenMap`, `SnetForever_R###`…) ni `WTF`. Fuera de AddOns solo se escribe la marca de estado roto
// (`estado-roto.json`, en la carpeta de datos) si un deshacer se queda a medias.
import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { abrirPaquete, CARPETAS, ErrorPaquete, extraerPaquete } from '../actualizar/paquete.mjs';
import { moverDentro, rutaLibre } from '../mover.mjs';
import { CODIGOS_OCUPADO, ESPERAS_REINTENTO } from '../fsseguro.mjs';
import { carpetaDatos, sello } from '../rutas.mjs';

/** Carpeta de preparación dentro de AddOns. */
export const PREPARANDO = '.snetforever-preparando';
/** Lo más largo que puede ser la ruta de un archivo en Windows sin `\\?\` (MAX_PATH = 260 con el carácter nulo). */
export const MAX_RUTA_WINDOWS = 259;
/** Nombre de la marca de estado roto (ver instalarComponentes), en la carpeta de datos. */
export const MARCA_ROTO = 'estado-roto.json';

// Los componentes que van en AddOns, en el orden de estadoInstalado. La app la instala la tarea 10. El comercio (0.7.0) es
// el addon SnetForever_Comercio: sin esquema de datos (no trae datos convertidos), así que `esquemasInstalados` no lo mira.
const COMPONENTES = ['addon', 'rutas', 'misiones', 'comercio'];
// La tabla global de cada addon de datos; su nucleo.lua empieza por `<TABLA> = {version="…",esquema=N,…`.
const TABLA_DATOS = Object.freeze({ rutas: 'SNF_RUTAS', misiones: 'SNF_MISIONES' });
// Lo que se lee del principio de un nucleo.lua para buscar el esquema (la línea está en los primeros KB).
const PRINCIPIO_NUCLEO = 256 * 1024;
// Lo más que se lee de un .toc.
const MAX_TOC = 64 * 1024;
// Sufijos -1 … -999 del sello si ya existe (y su sitio al medir las rutas largas).
const MAX_SUFIJO = 999;
const LARGO_SELLO = sello().length + `-${MAX_SUFIJO}`.length;

/**
 * Error al instalar componentes. `code`:
 * - `'carpeta'`: `addonsDir` no existe, no es una carpeta o no acaba en `\Interface\AddOns`;
 * - `'juego_abierto'`: el juego está abierto (o no se sabe), antes de preparar o antes de cambiar; `detalle.cuarentena`
 *   dice dónde quedó lo preparado, si se llegó a preparar;
 * - `'paquete'`: un paquete no vale; `detalle` es el `code` de ErrorPaquete (`'hash'`, `'formato'`…) o `'componente'`
 *   (no es de addon, rutas, misiones o comercio, o no es del componente que dice) o `'duplicado'` (dos del mismo componente);
 * - `'ruta_larga'`: un archivo pasaría de 259 caracteres al prepararlo; `detalle = {ruta, longitud}`;
 * - `'compatibilidad'` (F5-2): el addon y los datos que quedarían instalados no son del mismo esquema, o llegan datos
 *   solos y no se sabe qué esquema pide el addon instalado (`pide: null`); `detalle = {componente, esquema, pide}`;
 * - `'cuarentena'`: no se pudo obtener la carpeta de cuarentena (antes de tocar nada);
 * - `'ocupado'` (EBUSY), `'sin_permiso'` (EPERM, EACCES) o `'fs'` (cualquier otro error del sistema de archivos) al
 *   preparar o al cambiar. `detalle` dice en qué estado quedó AddOns:
 *   `{etapa: 'preparar'|'cambiar', componente?, code, deshecho, pendientes, cuarentena[, marca][, avisos]}`.
 *   - `deshecho: true`: AddOns está como antes de empezar; lo preparado está en `cuarentena` (o, si es null, sigue en
 *     `.snetforever-preparando`).
 *   - `deshecho: false` (**estado roto**): Windows no dejó devolver a su sitio los componentes de `pendientes`. Lo nuevo
 *     o lo viejo de cada uno sigue en `.snetforever-preparando\<sello>` y la marca `marca` (estado-roto.json) dice dónde
 *     está cada cosa. Una instalación posterior **no** lo devuelve a AddOns: aparta ese sello entero a la cuarentena. Lo
 *     que repara el estado es volver a instalar la tanda entera (la tarea 9 tiene que avisar y reintentarla cuanto
 *     antes); al terminar bien, la marca va a la cuarentena.
 */
export class ErrorInstalar extends Error {
  declare code: any;
  declare detalle: any;
  constructor(code, mensaje, { detalle = null, cause }: { detalle?: any; cause?: any; } = {}) {
    super(mensaje, cause ? { cause } : undefined);
    this.name = 'ErrorInstalar';
    this.code = code;
    this.detalle = detalle;
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

/** Los primeros `max` bytes de un archivo como texto UTF-8 (sin BOM), o null si no se puede leer. */
function leerPrincipio(ruta, max) {
  let fd;
  try {
    fd = openSync(ruta, 'r');
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(max);
    let leidos = 0;
    for (let n; leidos < max && (n = readSync(fd, buffer, leidos, max - leidos, leidos)) > 0;) leidos += n;
    return buffer.toString('utf8', 0, leidos).replace(/^\uFEFF/, '');
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

// El valor de la línea `## <campo>:` de un .toc, sin espacios alrededor, o null.
function campoToc(ruta, campo) {
  const texto = leerPrincipio(ruta, MAX_TOC);
  if (texto === null) return null;
  const m = new RegExp(`^##[ \\t]*${campo}[ \\t]*:[ \\t]*(.*?)[ \\t]*\\r?$`, 'm').exec(texto);
  return m && m[1] ? m[1] : null;
}

const tocDe = (addonsDir, componente) => join(addonsDir, CARPETAS[componente], `${CARPETAS[componente]}.toc`);
const esquemaValido = (texto) => {
  const n = /^\d+$/.test(texto ?? '') ? Number(texto) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
};

/**
 * Las versiones instaladas en `addonsDir`: el `## Version:` del `.toc` de cada componente, o null si falta la carpeta,
 * el `.toc` o la línea. Solo lee.
 * @param {string} addonsDir
 * @returns {{addon: string|null, rutas: string|null, misiones: string|null, comercio: string|null}}
 */
export function estadoInstalado(addonsDir: string) {
  const salida: Record<string, string | null> = {};
  for (const c of COMPONENTES) salida[c] = campoToc(tocDe(addonsDir, c), 'Version');
  return salida;
}

/**
 * F5-2: los esquemas de datos instalados. Solo lee; null si falta o no se entiende.
 * - `addon`: el que **pide** el addon, de la línea `## X-SNF-EsquemaDatos: N` de su `.toc` (la misma que `Datos.ESQUEMA`
 *   de `nucleo/datos.lua`; una prueba del banco vigila que coincidan). Un addon anterior a la 0.5.0 no la tiene.
 * - `rutas` y `misiones`: el que **tienen** los datos, de la línea `<TABLA> = {version="…",esquema=N,…` que el conversor
 *   escribe en su `nucleo.lua` (el mismo valor que comprueba el addon en el juego: `SNF_RUTAS.esquema`).
 * Lo usan esta tarea (antes de instalar) y la tarea 9 (qué actualizaciones se ofrecen).
 * @param {string} addonsDir
 * @returns {{addon: number|null, rutas: number|null, misiones: number|null}}
 */
export function esquemasInstalados(addonsDir: string) {
  const salida = { addon: esquemaValido(campoToc(tocDe(addonsDir, 'addon'), 'X-SNF-EsquemaDatos')) };
  for (const [c, tabla] of Object.entries(TABLA_DATOS)) {
    const texto = leerPrincipio(join(addonsDir, CARPETAS[c], 'nucleo.lua'), PRINCIPIO_NUCLEO);
    const m = texto === null ? null
      : new RegExp(`^${tabla}[ \\t]*=[ \\t]*\\{[ \\t]*version[ \\t]*=[ \\t]*"[^"\\r\\n]*"[ \\t]*,[ \\t]*esquema[ \\t]*=[ \\t]*(\\d+)[ \\t]*[,}]`, 'm')
        .exec(texto);
    salida[c] = esquemaValido(m?.[1]);
  }
  return salida;
}

// ¿Acaba en \Interface\AddOns (sin distinguir mayúsculas, con / o \ y con o sin barra al final) y es una carpeta?
function comprobarCarpeta(addonsDir) {
  const mala = (porque) => new ErrorInstalar('carpeta', `La carpeta de AddOns no vale (${porque}): ${JSON.stringify(addonsDir)}`);
  if (typeof addonsDir !== 'string' || addonsDir.length === 0) throw mala('vacía');
  const normal = addonsDir.replace(/\//g, '\\').replace(/\\+$/, '');
  if (!/(?:^|\\)Interface\\AddOns$/i.test(normal)) throw mala('no acaba en \\Interface\\AddOns');
  let info;
  try {
    info = statSync(addonsDir);
  } catch {
    throw mala('no existe');
  }
  if (!info.isDirectory()) throw mala('no es una carpeta');
  return resolve(addonsDir);
}

// ¿Está abierto el juego? Lo que no sea un `false` claro (un error, un valor raro) cuenta como abierto.
async function estaAbierto(juegoAbierto) {
  try {
    return (await juegoAbierto()) !== false;
  } catch {
    return true;
  }
}

// Abre y comprueba todos los paquetes (en memoria, sin escribir nada).
function abrirTodos(paquetes) {
  if (!Array.isArray(paquetes)) throw new ErrorInstalar('paquete', 'Los paquetes no son una lista', { detalle: 'formato' });
  const vistos = new Set();
  return paquetes.map((p) => {
    const componente = p?.componente;
    if (!COMPONENTES.includes(componente)) {
      throw new ErrorInstalar('paquete', `Aquí no se instala el componente ${JSON.stringify(componente)}`, { detalle: 'componente' });
    }
    if (vistos.has(componente)) {
      throw new ErrorInstalar('paquete', `Dos paquetes del componente «${componente}»`, { detalle: 'duplicado' });
    }
    vistos.add(componente);
    try {
      return abrirPaquete(p.buffer, { componente });
    } catch (e) {
      if (e instanceof ErrorPaquete) {
        throw new ErrorInstalar('paquete', `El paquete de «${componente}» no vale: ${e.message}`, { detalle: e.code, cause: e });
      }
      throw e;
    }
  });
}

// F5-2: los datos que quedarían instalados (lo nuevo y, si no viene, lo que ya hay) tienen que ser del esquema que pide
// el addon que quedaría instalado:
// - si el addon viene en la tanda, el `esquemaDatos` de su paquete;
// - si no, el de la línea X-SNF-EsquemaDatos del addon instalado;
// - si no la tiene (un addon de antes de la 0.5.0), el de los datos instalados antes del cambio: coincide con el del
//   addon, porque toda instalación pasa por esta comprobación;
// - si tampoco hay, no se sabe (`pide: null`) y no se instalan datos solos.
function comprobarEsquemas(addons, abiertos) {
  const nuevo = Object.fromEntries(abiertos.map((a) => [a.componente, a.esquemaDatos]));
  const instalados = esquemasInstalados(addons);
  let pide;
  if (Object.hasOwn(nuevo, 'addon')) pide = nuevo.addon;
  else if (instalados.addon !== null) pide = instalados.addon;
  else pide = Object.keys(TABLA_DATOS).map((c) => instalados[c]).find((e) => e !== null) ?? null;
  for (const componente of Object.keys(TABLA_DATOS)) {
    const esquema = Object.hasOwn(nuevo, componente) ? nuevo[componente] : instalados[componente];
    if (esquema !== null && esquema !== pide) {
      const texto = pide === null
        ? `No se sabe qué esquema de datos pide el addon instalado: no se instalan solos los datos «${componente}»`
        : `Los datos «${componente}» quedarían con el esquema ${esquema} y el addon pide el ${pide}`;
      throw new ErrorInstalar('compatibilidad', texto, { detalle: { componente, esquema, pide } });
    }
  }
}

// Ningún archivo puede pasar de MAX_RUTA_WINDOWS al prepararlo (la ruta más larga: la de preparación, con el sello).
function comprobarLongitudes(addons, abiertos) {
  const base = join(addons, PREPARANDO, 'x'.repeat(LARGO_SELLO));
  for (const a of abiertos) {
    for (const { ruta } of a.archivos) {
      const preparada = join(base, ...ruta.split('/'));
      if (preparada.length > MAX_RUTA_WINDOWS) {
        throw new ErrorInstalar('ruta_larga', `Un archivo del paquete de «${a.componente}» pasaría de ${MAX_RUTA_WINDOWS} caracteres al `
          + `prepararlo (${preparada.length}); hay que poner el juego en una carpeta más corta: ${ruta}`, {
          detalle: { ruta: join(addons, ...ruta.split('/')), longitud: preparada.length },
        });
      }
    }
  }
}

// Ejecuta `operacion` (síncrona o asíncrona) y, ante un bloqueo de Windows, la reintenta a los 25, 50 y 75 ms. Un mover
// a medias (con `copia` o `reserva`, ver mover.mjs) no se reintenta: lo que quedó se queda donde está.
async function conEsperas(operacion, dormir) {
  for (let intento = 0; ; intento++) {
    try {
      return await operacion();
    } catch (e) {
      const reintentable = CODIGOS_OCUPADO.includes(e?.code) && !e?.copia && !e?.reserva;
      if (!reintentable || intento >= ESPERAS_REINTENTO.length) throw e;
      await dormir(ESPERAS_REINTENTO[intento]);
    }
  }
}

/**
 * Lo común de una instalación: la cuarentena, cómo mover y la lista de avisos. `apartar(origen)` mueve `origen` dentro de
 * la cuarentena; si no se puede (COPIA, CAMBIADO, EBUSY tras los reintentos…), se queda donde está (nada se pierde: en
 * .snetforever-preparando, la próxima instalación lo vuelve a intentar), se apunta en `avisos` el motivo
 * (`{origen, code, mensaje}`) y da null.
 */
function crearApartador(q, mover, dormir) {
  const avisos = [];
  const apartar = async (origen) => {
    try {
      return await conEsperas(() => mover(origen, q), dormir);
    } catch (e) {
      avisos.push({ origen, code: e?.code ?? null, mensaje: `No se pudo pasar a la cuarentena: ${e?.message ?? String(e)}` });
      return null;
    }
  };
  return { apartar, avisos };
}

// Deja `prep` como carpeta normal y aparta a la cuarentena todo lo que tenga de antes. Lo que no se pueda apartar se
// queda (el sello nuevo es otra carpeta).
async function apartarRestos(prep, apartar) {
  let info = null;
  try {
    info = lstatSync(prep);
  } catch {
    // no existe
  }
  if (info && (info.isSymbolicLink() || !info.isDirectory())) {
    // un archivo, un enlace o una unión con ese nombre: se aparta entero, sin entrar
    if ((await apartar(prep)) === null) {
      throw new ErrorInstalar('carpeta', `«${prep}» no es una carpeta normal y no se pudo apartar a la cuarentena`);
    }
    info = null;
  }
  if (!info) {
    mkdirSync(prep);
    return;
  }
  for (const nombre of readdirSync(prep)) await apartar(join(prep, nombre));
}

// Crea `<prep>\<sello>` (o `<sello>-1`… si ya existe).
function crearSello(prep) {
  const s = sello();
  for (let i = 0; i <= MAX_SUFIJO; i++) {
    const ruta = join(prep, i === 0 ? s : `${s}-${i}`);
    try {
      mkdirSync(ruta);
      return ruta;
    } catch (e) {
      if (e?.code !== 'EEXIST') throw e;
    }
  }
  throw Object.assign(new Error(`No se encontró una carpeta libre en «${prep}»`), { code: 'EEXIST' });
}

// El código de ErrorInstalar para un error del sistema de archivos.
const codigoFs = (e) => (e?.code === 'EBUSY' ? 'ocupado' : e?.code === 'EPERM' || e?.code === 'EACCES' ? 'sin_permiso' : 'fs');

// Un error del sistema de archivos como ErrorInstalar ('ocupado', 'sin_permiso' o 'fs'), con el estado en `detalle`.
function deFs(e, mensaje, detalle) {
  const code = codigoFs(e);
  const porque = code === 'ocupado' ? 'el archivo está en uso (¿el juego?)'
    : code === 'sin_permiso' ? `Windows no lo permite (${e.code})` : (e?.code ?? e?.message ?? String(e));
  return new ErrorInstalar(code, `${mensaje}: ${porque}`, { detalle: { ...detalle, code: e?.code ?? null }, cause: e });
}

// Vuelve a poner cada componente como estaba, del último al primero. Da lo que no se pudo devolver, con dónde quedó:
// `nuevo_puesto` (lo nuevo sigue en AddOns y lo viejo en `viejo`) o `sin_carpeta` (lo nuevo volvió a `preparada` pero lo
// viejo sigue en `viejo`: AddOns se ha quedado sin esa carpeta).
async function deshacer(pasos, renombrar, dormir) {
  const pendientes = [];
  const pendiente = (paso, estado) => pendientes.push({
    componente: paso.componente, estado, enAddons: paso.enAddons, preparada: paso.preparada, viejo: paso.viejo,
  });
  for (const paso of [...pasos].reverse()) {
    if (paso.nuevoPuesto) {
      try {
        await conEsperas(() => renombrar(paso.enAddons, paso.preparada), dormir);
      } catch {
        pendiente(paso, 'nuevo_puesto');
        continue;
      }
    }
    if (paso.viejoApartado) {
      try {
        await conEsperas(() => renombrar(paso.viejo, paso.enAddons), dormir);
      } catch {
        pendiente(paso, 'sin_carpeta');
      }
    }
  }
  return pendientes;
}

/**
 * Escribe la marca de estado roto (sin pisar: una marca anterior va antes a la cuarentena; si no se puede apartar, la
 * nueva va con sufijo de fecha). Da su ruta, o null si no se pudo escribir (y lo apunta en `avisos`).
 */
async function escribirMarca(marcaRoto, contenido, apartar, avisos) {
  try {
    mkdirSync(dirname(marcaRoto), { recursive: true });
    if (existe(marcaRoto)) await apartar(marcaRoto);
    const ruta = rutaLibre(marcaRoto);
    writeFileSync(ruta, `${JSON.stringify(contenido, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return ruta;
  } catch (e) {
    avisos.push({ origen: marcaRoto, code: e?.code ?? null, mensaje: `No se pudo escribir la marca de estado roto: ${e?.message ?? String(e)}` });
    return null;
  }
}

// Tras instalar bien: si hay una marca de estado roto y esta tanda cubre todo lo que tenía pendiente, va a la cuarentena.
async function archivarMarca(marcaRoto, instalados, apartar) {
  if (!existe(marcaRoto)) return;
  let marca;
  try {
    marca = JSON.parse(readFileSync(marcaRoto, 'utf8'));
  } catch {
    return; // ilegible: se deja para quien la mire
  }
  const pendientes = Array.isArray(marca?.pendientes) ? marca.pendientes : [];
  if (pendientes.every((p) => instalados.includes(p?.componente))) await apartar(marcaRoto);
}

/**
 * Instala los paquetes de `addon`, `rutas`, `misiones` y `comercio` en `addonsDir` con el juego cerrado (ver el principio del
 * archivo). Si algo falla, AddOns queda como estaba y lo preparado va a la cuarentena, salvo el estado roto de
 * ErrorInstalar (un deshacer que Windows no deja terminar), que deja la marca `marcaRoto`.
 * @param {string} addonsDir la carpeta `…\_forever_\Interface\AddOns`
 * @param {{componente: 'addon'|'rutas'|'misiones'|'comercio', buffer: Buffer}[]} paquetes se cambian en este orden
 * @param {object} opciones
 * @param {() => string} opciones.cuarentena da una carpeta de cuarentena nueva (cuarentenaComponentes); se llama una vez,
 *   cuando ya se sabe que todo vale y antes de tocar nada
 * @param {() => Promise<boolean>} opciones.juegoAbierto si el juego está abierto (si falla, cuenta como abierto)
 * @param {string} [opciones.marcaRoto] la marca de estado roto (`<datos>\estado-roto.json`)
 * @param {Function} [opciones.renombrar] renameSync; `extraer` (extraerPaquete) y `mover` (moverDentro): solo se cambian
 *   en las pruebas
 * @param {(ms: number) => Promise<void>} [opciones.dormir] la espera entre reintentos
 * @returns {Promise<{instalados: string[], cuarentena: string|null, avisos?: {origen, code, mensaje}[]}>} `cuarentena` es
 *   la carpeta a la que fue lo sustituido, o null si no había paquetes o no se pudo apartar (entonces queda en
 *   `.snetforever-preparando`, se aparta en la próxima instalación y el motivo va en `avisos`)
 * @throws {ErrorInstalar}
 */
export async function instalarComponentes(addonsDir: string, paquetes, {
  cuarentena, juegoAbierto, marcaRoto = join(carpetaDatos(), MARCA_ROTO), renombrar = renameSync, extraer = extraerPaquete,
  mover = moverDentro, dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
}: {
  cuarentena?: any;
  juegoAbierto?: any;
  marcaRoto?: string;
  renombrar?: typeof renameSync;
  extraer?: typeof extraerPaquete;
  mover?: typeof moverDentro;
  dormir?: any;
} = {}) {
  const addons = comprobarCarpeta(addonsDir);
  if (Array.isArray(paquetes) && paquetes.length === 0) return { instalados: [], cuarentena: null };
  if (await estaAbierto(juegoAbierto)) {
    throw new ErrorInstalar('juego_abierto', 'Cierra el juego para terminar: está abierto y no se ha tocado nada', {
      detalle: { cuarentena: null },
    });
  }
  const abiertos = abrirTodos(paquetes);
  comprobarEsquemas(addons, abiertos);
  comprobarLongitudes(addons, abiertos);

  let q;
  try {
    q = cuarentena();
    if (typeof q !== 'string' || q.length === 0) throw new Error('la carpeta de cuarentena no es una ruta');
  } catch (e) {
    throw new ErrorInstalar('cuarentena', `No se pudo preparar la cuarentena (${e?.code || e?.message}): no se ha tocado nada`, { cause: e });
  }
  const { apartar, avisos } = crearApartador(q, mover, dormir);
  const conAvisos = (detalle) => (avisos.length > 0 ? { ...detalle, avisos } : detalle);
  const intacto = (donde) => ({ deshecho: true, pendientes: [], cuarentena: donde === null ? null : q });

  const prep = join(addons, PREPARANDO);
  let dirSello;
  try {
    await apartarRestos(prep, apartar);
    dirSello = crearSello(prep);
  } catch (e) {
    if (e instanceof ErrorInstalar) throw e;
    throw deFs(e, `No se pudo preparar «${prep}»`, conAvisos({ etapa: 'preparar', ...intacto(null) }));
  }

  // Preparar: cada paquete en su carpeta del sello. Si falla a mitad, lo escrito va a la cuarentena.
  try {
    for (const a of abiertos) extraer(a, join(dirSello, CARPETAS[a.componente]), { quitarPrimero: true });
  } catch (e) {
    const donde = await apartar(dirSello);
    if (e instanceof ErrorPaquete) {
      throw new ErrorInstalar('paquete', `No se pudo preparar un paquete: ${e.message}`, { detalle: e.code, cause: e });
    }
    throw deFs(e, 'No se pudo preparar la instalación', conAvisos({ etapa: 'preparar', ...intacto(donde) }));
  }

  // Restricciones, vigilancia 1: «el juego se comprueba antes de preparar y antes de cada intercambio». Aquí un
  // intercambio es la fase de cambio entera de una instalación o una actualización (todos sus renombres), no cada
  // componente: se mira una vez justo antes de empezar a renombrar. Mirarlo entre componentes (PowerShell, de medio
  // segundo a un segundo cada vez) alargaría el rato con el addon y los datos descuadrados; si el juego se abre a mitad
  // y bloquea algo, el EBUSY o el EPERM del renombre ya llevan a deshacerlo todo.
  if (await estaAbierto(juegoAbierto)) {
    const donde = await apartar(dirSello);
    throw new ErrorInstalar('juego_abierto', 'Cierra el juego para terminar: se abrió mientras se preparaba y no se ha cambiado nada', {
      detalle: conAvisos({ cuarentena: donde === null ? null : q }),
    });
  }

  // Cambiar: dos renombres por componente; si uno no sale, se deshace todo.
  const pasos = [];
  try {
    for (const a of abiertos) {
      const carpeta = CARPETAS[a.componente];
      const paso = {
        componente: a.componente,
        enAddons: join(addons, carpeta),
        preparada: join(dirSello, carpeta),
        viejo: join(dirSello, `viejo-${carpeta}`),
        viejoApartado: false,
        nuevoPuesto: false,
      };
      pasos.push(paso);
      if (existe(paso.enAddons)) {
        await conEsperas(() => renombrar(paso.enAddons, paso.viejo), dormir);
        paso.viejoApartado = true;
      }
      await conEsperas(() => renombrar(paso.preparada, paso.enAddons), dormir);
      paso.nuevoPuesto = true;
    }
  } catch (e) {
    const componente = pasos.at(-1)?.componente ?? null;
    const pendientes = await deshacer(pasos, renombrar, dormir);
    const mensaje = `No se pudo cambiar «${componente}»`;
    if (pendientes.length === 0) {
      // todo volvió a su sitio: lo preparado va a la cuarentena
      const donde = await apartar(dirSello);
      throw deFs(e, mensaje, conAvisos({ etapa: 'cambiar', componente, ...intacto(donde) }));
    }
    // Estado roto: el sello se queda con lo que falta por devolver (nada se pierde) y la marca dice dónde está.
    const marca = await escribirMarca(marcaRoto, {
      fecha: new Date().toISOString(), codigo: codigoFs(e), code: e?.code ?? null, addons, sello: dirSello, componente,
      instalando: abiertos.map((a) => a.componente), pendientes,
    }, apartar, avisos);
    throw deFs(e, `${mensaje} y no se pudo deshacer del todo`, conAvisos({
      etapa: 'cambiar', componente, deshecho: false, pendientes: pendientes.map((p) => p.componente), cuarentena: null, marca,
    }));
  }

  const instalados = abiertos.map((a) => a.componente);
  const donde = await apartar(dirSello);
  await archivarMarca(marcaRoto, instalados, apartar);
  return { instalados, cuarentena: donde === null ? null : q, ...(avisos.length > 0 ? { avisos } : {}) };
}
