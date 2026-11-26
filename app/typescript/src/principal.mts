// Arranque de la app SnetForever (tarea 20). `node src/principal.mjs [--preparar] [--probar-ia] [--sin-bandeja] [--sin-captura]`
//
// Arranque completo, en este orden:
//   1. instancia única con `datos/app.lock` ({pid, inicio}); si ya hay otra, sale con 3 («SnetForever ya está abierto»);
//   2. registro y config (`datos/config.json`); la bandeja, para que se vea enseguida;
//   3. la carpeta de AddOns (SNF_ADDONS, config.addons, junto al Wow.exe que dé la captura, o la de siempre); si no se sabe,
//      se espera a que la captura dé el exe (la captura se lanza antes, para eso);
//   4. `prepararAddOns` (si crea, aparta o reescribe algo, el globo de reiniciar el juego) y `cargarBase` en segundo plano.
//      Si la captura no dice que el juego está cerrado (abierto, o aún no se sabe), solo crea lo que falta; apartar
//      ranuras y reescribir .toc se aplaza hasta el primer «juego: no» de la captura (una vez por cierre);
//   5. el núcleo (con los timbres de vida), la comprobación de LOS DOS motores (al empezar, cada 30 minutos y desde el menú)
//      y el buzón de estado en las 20 ranuras; el estado solo se vuelve a publicar (con timbre) si cambia;
//   6. la captura y el lector de la franja, y la bandeja con el estado.
// Fase 5, tarea 13 (actualizaciones, avisos de fallo y primer arranque):
//   - la carpeta del juego también sale del registro de Windows y de los procesos (juego.mjs), con el juego cerrado;
//   - R17: con `config.instalada`, lo que falte en AddOns (estadoInstalado con algún null) se instala desde
//     `<instalación>\paquetes` en cuanto el juego esté cerrado (se reintenta cada minuto; primerArranque.mjs);
//   - instalada (`esInstalada()`): `limpiarVersiones` al arrancar y `aplicarApp` para el actualizador (si no, no se le pasa);
//   - el actualizador (tarea 9): `comprobar()` a los 120 s y después cada 24 h (si `config.actualizaciones.auto !== false`) y
//     con «Buscar actualizaciones»; con «hay», `descargar()`; `aplicarSiSePuede()` cada 60 s. Al aplicar: prepararAddOns,
//     el globo, la base nueva si cambiaron los datos de misiones (nucleo.recargarBase) y, si entró la app, `reiniciar`
//     (con el `soltar` del cerrojo) y `parar()`; si `reiniciar` falla, se vuelve a tomar el cerrojo y la app sigue viva;
//   - los avisos de fallo (tarea 11): al arrancar y cada 10 min con el juego cerrado se cuentan los que quedan por mandar;
//     el menú los guarda en un archivo, los copia o abre la issue de GitHub (F5-3), y marca como enviados solo esos
//     (menuAvisos.mjs);
//   - la bandeja recibe la línea `entradas` (F5): el texto de «Actualización: …», los avisos y la versión.
// Comercio, Task 8 (la app se queda encendida todo el día para no perder fotos horarias):
//   - en cuanto se sabe la carpeta de AddOns arranca el programador horario (comercio/programador.mjs), que baja las fotos
//     de las casas en uso, las guarda en el historial y escribe las ranuras de precios SnetForever_P01…P08;
//   - con el juego cerrado (al arrancar y cada 10 min, con los avisos) lee de SavedVariables la identidad del personaje
//     y su último escaneo (SnetForeverCuenta.comercio) y los pasa al estado del comercio (`<datos>\comercio\estado.json`);
//   - F10: con el juego abierto, cada 10 min mira si SnetForever.lua ha cambiado (un /reload) y, si lleva 30 s quieto, lee solo
//     los escaneos, sin tocar la identidad ni las facciones; un escaneo nuevo por descubrir adelanta una ronda, una sola vez;
//   - «Arrancar con Windows» en el menú de la bandeja, con una marca: crea o quita (a la cuarentena) el acceso directo de
//     la carpeta Inicio, el mismo que el del instalador (inicio.mjs). Lo activa el jugador; la app nunca lo hace sola.
//   - las misiones de la API (Task 16, misiones-api.mjs) arrancan en cuanto se sabe la región y van al núcleo;
//   - la IA ve los precios del historial en cada turno, aunque la subasta esté cerrada (Task 17a, comercioDatos del
//     núcleo): mismo historial y catálogo que el programador, la casa del personaje en uso y las otras de su reino;
//   - F7: sigue cada casa que el jugador usa (la de cada facción con personajes y la neutral), con un respiro entre casa y
//     casa (ESPACIO_CASAS_MS de programador.mjs);
//   deps de las pruebas: inicio ({consultar, poner}), clienteBlizzard (una función como crearClienteBlizzard) y
//   espacioComercio (F7: el respiro entre casas, en ms; 0 en las pruebas).
// S8, el puente con TATI (la app de escritorio del jugador como cerebro), SOLO con `puenteTati.activo: true` en config.json
// (se mira al arrancar; sin eso, la versión pública, nada de lo que sigue existe: ni carpeta puente-tati, ni canal, ni
// entradas en el menú, ni latido en el buzón):
//   - crea el estado del juego (tati/estado.mjs), el cerebro (tati/cerebro.mjs) y, con el núcleo, las acciones
//     (tati/acciones.mjs), y se los pasa al núcleo;
//   - los `relevo-<pid>.*` de relevos que ya no viven (process.kill(pid, 0), como el relevo) van a la cuarentena de datos,
//     al arrancar y cada 30 minutos (salvo el canal que tiene un pedido en curso);
//   - atiende los canales `relevo-<pid>` (tati/correo.mjs) desde el arranque con acciones.ejecutar ({estado: 'hecho',
//     resultado}); lo para al salir. Mientras no hay núcleo (p. ej. aún no se sabe la carpeta de AddOns) contesta
//     `{error: 'app_preparandose'}` y, cerrándose, `{error: 'app_cerrandose'}`, sin ejecutar nada. El juego abierto o
//     cerrado para las acciones es el de la captura;
//   - la bandeja enseña el submenú «Cerebro» (IA de SnetForever / TATI) y «Preparar el complemento para TATI». Con el
//     cerebro TATI, la línea del motor es «Cerebro: TATI (conectada | no responde)» con cerebro.comprobar() (al
//     arrancar, cada 30 minutos y desde «Comprobar»); la app nunca abre TATI;
//   - «Cerebro» guarda `puenteTati.cerebro` (guardarCerebro) y vuelve a publicar el estado; el complemento se genera
//     (tati/complemento.mjs, con el SnetForever.vbs de rutasLanzador) y se abre su carpeta.
//   deps de las pruebas: crearCerebro, crearAcciones, generarComplemento, pidVivo y atender.
// Al salir (menú «Salir», `datos/salir.peticion` o una señal): captura, timbres (`timbres.parar()`, sin dejar ningún `.fuera`),
// bandeja (por su PID) y se suelta el cerrojo. Nada se borra: el cerrojo se vacía (pid 0) y las peticiones van a la
// cuarentena de datos.
//
// arrancar(argv, entorno, deps) -> Promise<{codigo?, parar(), terminado, listo, nucleo, cerrada}>
//   - con `codigo` definido, la app ya acabó (3 = ya abierta, 2 = AddOns mal, 0 = --preparar y --probar-ia);
//   - sin `codigo`, sigue viva: `listo` acaba cuando el buzón de estado está escrito; `terminado`, cuando se cerró del todo.
//   deps (solo cambian en las pruebas): raizVolumen, salida, errores, idioma, comprobar {claude, codex}, motor, lanzarBandeja,
//   lanzarCaptura, abrir, existe (de carpetaAddOns y candidatasJuego), infoProceso, reloj (una función `ahora`, o un objeto
//   con `ahora` y/o setTimeout, setInterval, clearTimeout y clearInterval para los temporizadores de la tarea 13),
//   intervalos {motores, refresco, peticion, reintentoAddons, primeraActualizacion, actualizacion, aplicar, avisos} y, desde
//   la tarea 13: juego ({consultar}, de juego.mjs), actualizador (una función como crearActualizador), propia ({esInstalada,
//   aplicarApp, limpiarVersiones, reiniciar}, de propia.mjs), clavePublica, abrirUrl, abrirCarpeta y copiar (el
//   portapapeles). `juego` y `actualizador` también se aceptan en `entorno`.
// El entorno de las pruebas: SNF_DATOS, SNF_ADDONS, SNF_CLAUDE, SNF_CODEX, SNF_IDIOMA (es|en), SNF_BASE (carpeta de la base;
// por defecto `<AddOns>\SnetForever_Misiones`), SNF_INSTALACION y SNF_CUARENTENA.
import * as fsReal from 'node:fs';
import { join, resolve, win32 } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { VERSION } from './version.mjs';
import { carpetaDatos, leerConfig, carpetaAddOns, cuarentenaNueva, sello, carpetaInstalacion, cuarentenaComponentes } from './rutas.mjs';
import { crearActualizador } from './actualizar/actualizador.mjs';
import * as propiaReal from './actualizar/propia.mjs';
import { CLAVE_PUBLICA } from './actualizar/clave-publica.mjs';
import { compararVersiones } from './actualizar/manifiesto.mjs';
import { estadoInstalado } from './instalador/componentes.mjs';
import { candidatasJuego, consultar, juegoAbierto } from './juego.mjs';
import { crearPrimerArranque } from './primerArranque.mjs';
import { crearMenuAvisos } from './menuAvisos.mjs';
import { log } from './registro.mjs';
import { escribirAtomico } from './buzon.mjs';
import { infoProceso } from './proceso.mjs';
import { prepararAddOns } from './instalacion.mjs';
import { cargarBase } from './base/base.mjs';
import { crearTimbres } from './timbres.mjs';
import { crearHistorial } from './historial.mjs';
import { crearNucleo } from './nucleo.mjs';
import { lanzarCaptura as lanzarCapturaReal, crearLector } from './captura.mjs';
import { lanzarBandeja as lanzarBandejaReal, abrirRuta } from './bandeja.mjs';
import * as motorReal from './motor.mjs';
import { comprobar as comprobarClaude, resolverClaude } from './claude.mjs';
import { comprobar as comprobarCodex, resolverCodex } from './codex.mjs';
import { TEXTOS_APP, textoBandejaMotor, textoMotorCorto, textoSinMotor } from './textos.mjs';
import { raizDelJuego } from './menuAvisos.mjs';
import { enviar } from './actualizar/red.mjs';
import { crearIndice, CARPETA_GUIAS } from './biblioteca/indice.mjs';
import { copiarDelJuego } from './biblioteca/copia.mjs';
import { anadirEnlace, revisarEnlaces, esRechazo, actualizarEnlaces } from './biblioteca/enlaces.mjs';
import { leerPortapapeles } from './navegador.mjs';
import { crearClienteBlizzard } from './comercio/blizzard.mjs';
import { leerCredenciales } from './comercio/credenciales.mjs';
import { crearHistorial as crearHistorialComercio } from './comercio/historial.mjs';
import { crearMedidorSalen, casasHordaDe } from './comercio/medir-salen.mjs';
import { crearCatalogo } from './comercio/objetos.mjs';
import { crearRegional } from './comercio/regional.mjs';
import { escribirPrecios } from './comercio/precios-lua.mjs';
import { crearEstadoComercio, firmaCuentas, leerCuentas } from './comercio/estado.mjs';
import { crearProgramadorComercio, ESPERA_SIN_CASA_MS } from './comercio/programador.mjs';
import { crearMisionesApi } from './comercio/misiones-api.mjs';
import { fuenteDeComercio } from './comercio/ia.mjs';
import { arranqueConWindows, ponerArranqueConWindows, rutasLanzador } from './inicio.mjs';
import { puenteDe, carpetaPuente, guardarCerebro } from './tati/config.mjs';
import { crearEstadoJuego } from './tati/estado.mjs';
import { crearCerebro } from './tati/cerebro.mjs';
import { crearAcciones } from './tati/acciones.mjs';
import { generarComplemento } from './tati/complemento.mjs';
import { atender } from './tati/correo.mjs';

export const TOLERANCIA_INICIO_MS = 10_000; // lo que puede diferir la hora de inicio guardada de la que da Windows
// Task 8, ronda 2: desde el núcleo 0.7.0 el comercio es un addon aparte (SnetForever_Comercio) que trae el actualizador.
const NUCLEO_CON_COMERCIO_APARTE = '0.7.0';

/**
 * Ronda 3: ¿es pasajero el fallo de `comprobar()` o `descargar()`? Solo la red caída (`conexion`), el tiempo agotado (`tiempo`) y los
 * HTTP 5xx (`estado` con el número del error HTTP ≥ 500). Un 404, un SHA o tamaño malos, la firma, `antiguo` o un manifiesto que no vale no se arreglan
 * reintentando: siguen el ritmo normal de 24 h.
 */
export function esPasajero(resultado) {
  const codigo = resultado?.codigo;
  if (codigo === 'conexion' || codigo === 'tiempo') return true;
  return codigo === 'estado' && Number.isSafeInteger(resultado?.http) && resultado.http >= 500 && resultado.http <= 599;
}

export const PERIODOS = {
  motores: 30 * 60_000, refresco: 30_000, peticion: 2000, reintentoAddons: 60_000,
  // fase 5, tarea 13 (R5: a los 2 min y cada 24 h; aplicar cada minuto; avisos cada 10 min)
  primeraActualizacion: 120_000, primeraTrasActualizar: 10_000, reintentoComercio: 5 * 60_000, actualizacion: 24 * 3600_000, aplicar: 60_000, avisos: 10 * 60_000,
};
const MOTORES = ['claude', 'codex'];
const VALORES_MOTOR = ['auto', 'claude', 'codex'];
const SISTEMA_PRUEBA = 'Eres una comprobación de conexión. Contesta exactamente lo que se te pide, sin añadir nada.';
const PREGUNTA_PRUEBA = 'Responde solo: OK';
const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
// F10: con el juego abierto, SnetForever.lua no se lee hasta que lleva esto sin cambiar (el juego podría estar escribiéndolo).
const ESPERA_ARCHIVO_MS = 30_000;
// Las esperas del comercio (hasta una hora): no mantienen vivo el proceso por sí solas.
const dormirSuelto = (ms) => new Promise((resolver) => {
  const t = setTimeout(resolver, ms);
  t.unref?.();
});

/** `es` si Windows está en español (Intl), `en` si no. SNF_IDIOMA (es|en) lo fuerza, para las pruebas. */
export function idiomaDeWindows(env = process.env) {
  if (env.SNF_IDIOMA === 'es' || env.SNF_IDIOMA === 'en') return env.SNF_IDIOMA;
  let locale = '';
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {
    // sin Intl: inglés
  }
  return /^es\b/i.test(locale) ? 'es' : 'en';
}

/**
 * El idioma de la app (bandeja, globos, avisos): SNF_IDIOMA; si no, el del juego, que es el que el jugador ve (el
 * `textLocale` de `WTF\Config.wtf`, dos carpetas por encima de la de AddOns: `es??` → `es`, cualquier otro → `en`); si
 * no se sabe la carpeta o no se puede leer, el de Windows. Pedido del autor (11-nov): con Windows en inglés y el juego
 * en español, la bandeja salía en inglés.
 */
export function idiomaDeLaApp({ env = process.env, config = null, leer = (ruta) => fsReal.readFileSync(ruta, 'utf8') } = {}) {
  if (env.SNF_IDIOMA === 'es' || env.SNF_IDIOMA === 'en') return env.SNF_IDIOMA;
  let addons = null;
  try {
    addons = carpetaAddOns({ config: config || {}, env });
  } catch {
    addons = null;
  }
  if (typeof addons === 'string' && addons !== '') {
    try {
      const texto = String(leer(win32.join(addons, '..', '..', 'WTF', 'Config.wtf')));
      const m = /^\s*SET\s+textLocale\s+"([a-z]{2})[a-z]{2}"/im.exec(texto);
      if (m) return m[1].toLowerCase() === 'es' ? 'es' : 'en';
    } catch {
      // sin Config.wtf: el de Windows
    }
  }
  return idiomaDeWindows(env);
}

// ---------- cerrojo de instancia única ----------

const inicioPropio = () => Math.round(Date.now() - process.uptime() * 1000);

function leerCerrojo(fs, ruta) {
  try {
    const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * ¿Sigue vivo de verdad el dueño del cerrojo `viejo` ({pid, inicio})? Un pid soltado (0), uno que ya no vive, uno que es
 * otro programa (no `node.exe`) o uno cuya hora de inicio no cuadra (pid reutilizado) cuentan como cerrojo viejo. Lo que
 * no se puede saber cuenta como vivo (lo seguro). `pid` e `inicio` son los del proceso que pregunta; `info`, infoProceso.
 * Lo usan tomarCerrojo y, desde la revisión final (I3), `cerrar-app` de la CLI del instalador.
 */
export function cerrojoVivo(viejo, { info, pid, inicio }) {
  if (!Number.isInteger(viejo.pid) || viejo.pid <= 0) return false; // soltado
  const guardado = Number.isFinite(viejo.inicio) ? viejo.inicio : null;
  if (viejo.pid === pid) return guardado === null || Math.abs(guardado - inicio) <= TOLERANCIA_INICIO_MS;
  let i;
  try {
    i = info(viejo.pid);
  } catch {
    return true;
  }
  if (!i || i.vive === false) return false;
  if (typeof i.nombre === 'string' && !/^node(\.exe)?$/i.test(i.nombre)) return false; // otro programa con ese pid
  if (guardado !== null && Number.isFinite(i.inicio) && Math.abs(i.inicio - guardado) > TOLERANCIA_INICIO_MS) return false; // pid reutilizado
  return true;
}

/**
 * S8: ¿vive el proceso `pid`? Como el relevo de TATI (tati/relevo.mjs): `process.kill(pid, 0)` no mata nada, solo
 * pregunta; EPERM es que existe (de otro usuario). Un pid que no es un entero positivo no vive.
 */
export function pidVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
}

export const MAX_LOCK_VIEJOS = 20; // los app.lock.viejo-* que se dejan en datos antes de moverlos a la cuarentena

// Si hay más de MAX_LOCK_VIEJOS cerrojos apartados, los más viejos van a la cuarentena de datos (se renombran, no se borran).
function rotarViejos(fs, datos, entorno) {
  try {
    const viejos = fs.readdirSync(datos).filter((n) => n.startsWith('app.lock.viejo-')).sort();
    if (viejos.length <= MAX_LOCK_VIEJOS) return;
    const destino = cuarentenaNueva({ ...entorno, SNF_DATOS: datos });
    for (const n of viejos.slice(0, viejos.length - MAX_LOCK_VIEJOS)) fs.renameSync(join(datos, n), join(destino, n));
  } catch (e) {
    log('aviso', `cerrojos viejos: no se pudieron rotar (${e?.code || 'ERROR'})`);
  }
}

/**
 * Toma `datos/app.lock`. Si no existe, lo crea con `wx`. Si existe y su dueño no vive (o está soltado), lo aparta con un
 * renombrado a `app.lock.viejo-<sello>` (atómico: si dos lo intentan, solo uno consigue renombrarlo) y después lo crea con
 * `wx`. Quien pierde cualquiera de los pasos recibe {ok: false}. Los apartados no se borran: pasados 20, van a la cuarentena.
 * → `{ok: true, soltar()}` | `{ok: false, pid?}`. `soltar()` vacía el cerrojo (pid 0), no lo borra.
 */
export async function tomarCerrojo(datos, { fs = fsReal, info = infoProceso, pid = process.pid, inicio = inicioPropio(), entorno = process.env } = {}) {
  fs.mkdirSync(datos, { recursive: true });
  const ruta = join(datos, 'app.lock');
  const contenido = JSON.stringify({ pid, inicio });
  const soltar = async () => {
    const actual = leerCerrojo(fs, ruta);
    if (actual && actual.pid === pid) await escribirAtomico(fs, ruta, JSON.stringify({ pid: 0, inicio: 0 }));
  };
  const crear = () => {
    try {
      fs.writeFileSync(ruta, contenido, { flag: 'wx' });
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') return false;
      throw e;
    }
  };
  if (crear()) return { ok: true, soltar };

  let viejo = leerCerrojo(fs, ruta);
  if (viejo === null) {
    await dormir(100); // quizá otra instancia lo está escribiendo en este instante
    viejo = leerCerrojo(fs, ruta);
  }
  if (viejo && cerrojoVivo(viejo, { info, pid, inicio })) return { ok: false, pid: viejo.pid };

  // Apartarlo: el renombrado es atómico, solo uno de los que lleguen a la vez lo consigue.
  const apartado = join(datos, `app.lock.viejo-${sello()}-${randomBytes(3).toString('hex')}`);
  try {
    fs.renameSync(ruta, apartado);
  } catch {
    return { ok: false };
  }
  // ¿Lo que se apartó era de verdad el cerrojo viejo? Si otro lo había cambiado por uno nuevo y vivo, se devuelve.
  const quitado = leerCerrojo(fs, apartado);
  if (viejo && quitado && (quitado.pid !== viejo.pid || quitado.inicio !== viejo.inicio)) {
    try {
      fs.renameSync(apartado, ruta);
    } catch {
      // otro ya tomó el sitio
    }
    return { ok: false, pid: quitado.pid };
  }
  if (!crear()) return { ok: false };
  rotarViejos(fs, datos, entorno);
  return { ok: true, soltar };
}

// ---------- config.motor ----------

/**
 * Guarda `config.motor` (auto | claude | codex) en `datos/config.json`, de forma atómica y conservando lo demás. Una config
 * que no se puede leer va a `datos/cuarentena/` en vez de perderse. Lanza un error si el valor no es válido.
 */
export async function guardarMotor(datos, valor, { fs = fsReal, entorno = process.env } = {}) {
  if (!VALORES_MOTOR.includes(valor)) throw new Error('motor no válido');
  const ruta = join(datos, 'config.json');
  let config = {};
  if (fs.existsSync(ruta)) {
    let valida = false;
    try {
      const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        config = j;
        valida = true;
      }
    } catch {
      // se aparta abajo
    }
    if (!valida) fs.renameSync(ruta, join(cuarentenaNueva({ ...entorno, SNF_DATOS: datos }), 'config.json'));
  }
  fs.mkdirSync(datos, { recursive: true });
  const mover = (origen, nombre) => fs.renameSync(origen, join(cuarentenaNueva({ ...entorno, SNF_DATOS: datos }), nombre));
  await escribirAtomico(fs, ruta, JSON.stringify({ ...config, motor: valor }, null, 2), { mover });
}

// ---------- comprobar los motores ----------

async function comprobarAmbos(comprobar) {
  const pedir = async (m) => {
    try {
      const e = await comprobar[m]();
      return e && typeof e === 'object' ? e : { estado: 'desconocido' };
    } catch {
      return { estado: 'desconocido', motivo: 'no se pudo comprobar la cuenta' };
    }
  };
  const [claude, codex] = await Promise.all(MOTORES.map(pedir));
  return { claude, codex };
}

/**
 * Lo que hace `--probar-ia` (solo la lanza el controlador, nunca las pruebas automáticas): comprueba los dos motores y, si
 * hay uno listo, hace UNA pregunta mínima con el modelo rápido. → {motor, estado, texto, ms}. Sin motor listo no pregunta:
 * estado = «sin_motor» (o el del motor forzado) y el texto dice cómo está cada uno.
 */
export async function probarIA({ config = {}, comprobar, motor = motorReal, tiempoMax }: {
  config?: any;
  comprobar?: any;
  motor?: typeof motorReal;
  tiempoMax?: any;
} = {}) {
  const estados = await comprobarAmbos(comprobar);
  const e = motor.elegirMotor(config, estados, 'haiku');
  if (e.error) {
    const texto = e.error === 'sin_motor' ? textoSinMotor(estados) : String(estados[e.motor]?.motivo || e.error);
    return { motor: e.motor || null, estado: e.error, texto, ms: 0 };
  }
  const t0 = Date.now();
  const r = await motor.preguntar({ config, estados, iaModelo: 'haiku', sistema: SISTEMA_PRUEBA, entrada: PREGUNTA_PRUEBA, tiempoMax });
  const ms = Number.isFinite(r.ms) ? r.ms : Date.now() - t0;
  if (!r.ok) return { motor: r.motor || e.motor, estado: r.tipo || 'fallo', texto: String(r.detalle || ''), ms };
  return { motor: r.motor || e.motor, estado: 'ok', texto: String(r.texto ?? ''), ms };
}

// ---------- el arranque ----------

type LegacyOptions = { juego?: { consultar: typeof consultar }; actualizador?: typeof crearActualizador };

export async function arrancar(argv = process.argv.slice(2), entorno = process.env, deps: {
  idioma?: any;
  salida?: any;
  errores?: any;
  motor?: any;
  comprobar?: any;
  reloj?: any;
  intervalos?: any;
  juego?: { consultar: typeof consultar };
  actualizador?: any;
  propia?: any;
  clavePublica?: any;
  existe?: any;
  raizVolumen?: any;
  infoProceso?: any;
  inicio?: any;
  crearCerebro?: any;
  abrir?: any;
  abrirUrl?: any;
  abrirCarpeta?: any;
  copiar?: any;
  clienteBlizzard?: any;
  espacioComercio?: any;
  crearAcciones?: any;
  obtenerPagina?: any;
  generarComplemento?: any;
  pidVivo?: any;
  atender?: any;
  crearIndice?: any;
  vigilarBiblioteca?: any;
  copiarDelJuego?: any;
  leerPortapapeles?: any;
  lanzarBandeja?: any;
  lanzarCaptura?: any;
} = {}) {
  const banderas = new Set(argv);
  const idioma = deps.idioma || idiomaDeLaApp({ env: entorno, config: (() => { try { return leerConfig(entorno); } catch { return null; } })() });
  const T = TEXTOS_APP[idioma];
  const fs = fsReal;
  const salida = deps.salida || ((texto) => process.stdout.write(`${texto}\n`));
  const errores = deps.errores || ((texto) => process.stderr.write(`${texto}\n`));
  const datos = carpetaDatos(entorno);
  const motor = deps.motor || motorReal;
  const comprobadores = deps.comprobar || {
    claude: () => comprobarClaude(resolverClaude({ env: entorno })),
    codex: () => comprobarCodex(resolverCodex({ env: entorno })),
  };
  const ahora = typeof deps.reloj === 'function' ? deps.reloj : deps.reloj?.ahora ? () => deps.reloj.ahora() : Date.now;
  const periodos = { ...PERIODOS, ...(deps.intervalos || {}) };
  // Tarea 13: el juego, el actualizador, la propia app, la clave y lo que se abre fuera (navegador, Explorador, portapapeles).
  const juego = deps.juego || (typeof (entorno as LegacyOptions).juego?.consultar === 'function' ? (entorno as LegacyOptions).juego : null) || { consultar };
  const crearAct = deps.actualizador || (typeof (entorno as LegacyOptions).actualizador === 'function' ? (entorno as LegacyOptions).actualizador : null) || crearActualizador;
  const propia = { ...propiaReal, ...(deps.propia || {}) };
  const clavePublica = deps.clavePublica !== undefined ? deps.clavePublica : CLAVE_PUBLICA;
  // Los temporizadores de la tarea 13 (los de antes siguen con los de Node): los del reloj falso en las pruebas.
  const reloj = deps.reloj && typeof deps.reloj === 'object' ? deps.reloj : {};
  const temporizar = {
    despues: (fn, ms) => (reloj.setTimeout ? reloj.setTimeout(fn, ms) : setTimeout(fn, ms)),
    cada: (fn, ms) => (reloj.setInterval ? reloj.setInterval(fn, ms) : setInterval(fn, ms)),
    quitarDespues: (id) => (reloj.clearTimeout ? reloj.clearTimeout(id) : clearTimeout(id)),
    quitarCada: (id) => (reloj.clearInterval ? reloj.clearInterval(id) : clearInterval(id)),
  };
  const sinParar = async () => {};
  const acabar = (codigo, extra = {}) => ({ codigo, parar: sinParar, terminado: Promise.resolve(), listo: Promise.resolve(), ...extra });

  // --preparar y --probar-ia: hacen lo suyo y salen, sin cerrojo ni bandeja.
  if (banderas.has('--preparar')) {
    // ronda 1 (Menor 7): también por el registro de Windows y los procesos, como el arranque normal
    const config = leerConfig(entorno);
    const addons = carpetaAddOns({ config, env: entorno, existe: deps.existe }) || (await buscarJuego(config));
    if (!addons) {
      salida(JSON.stringify({ error: 'ADDONS', mensaje: T.esperandoAddons }));
      return acabar(2);
    }
    try {
      const resumen = prepararAddOns(addons, { raizVolumen: deps.raizVolumen });
      salida(JSON.stringify(resumen));
      return acabar(0, { resultado: resumen });
    } catch (e) {
      salida(JSON.stringify({ error: e?.code || 'ERROR', mensaje: String(e?.message || e) }));
      return acabar(2);
    }
  }
  if (banderas.has('--probar-ia')) {
    const resultado = await probarIA({ config: leerConfig(entorno), comprobar: comprobadores, motor });
    salida(JSON.stringify(resultado));
    return acabar(0, { resultado });
  }

  // 1. instancia única
  let cerrojo = await tomarCerrojo(datos, { fs, info: deps.infoProceso, entorno });
  if (!cerrojo.ok) {
    errores(T.yaAbierto);
    return acabar(3);
  }

  // Una petición de salir de antes de este arranque ya no vale: va a la cuarentena de datos (ronda 1, Menor 8), como la
  // de la app en marcha.
  const peticion = join(datos, 'salir.peticion');
  try {
    if (fs.existsSync(peticion)) fs.renameSync(peticion, join(cuarentenaNueva(entorno), 'salir.peticion'));
  } catch (e) {
    log('aviso', `salir.peticion vieja: no se pudo apartar (${e?.code || 'ERROR'})`);
  }
  log('info', `SnetForever ${VERSION} arranca`);

  // Tarea 13 (T10): instalada, las carpetas de versión que sobran van a la cuarentena; y si el arranque volvió atrás desde
  // una versión más nueva que esta (fallida.txt), la bandeja lo dice.
  const instalacion = carpetaInstalacion(entorno);
  const cuarentenaDeComponentes = () => cuarentenaComponentes({ env: entorno, config: leerConfig(entorno) });
  let instalada = false;
  try {
    instalada = propia.esInstalada({ env: entorno }) === true;
  } catch {
    instalada = false;
  }
  if (instalada) {
    try {
      const movidas = propia.limpiarVersiones({ instalacion, cuarentena: cuarentenaDeComponentes });
      if (Array.isArray(movidas) && movidas.length > 0) log('info', `versiones viejas de la app a la cuarentena: ${movidas.join(', ')}`);
    } catch (e) {
      log('aviso', `limpiarVersiones: ${e?.code || 'ERROR'}`);
    }
  }
  let fallida = null;
  try {
    const v = propia.leerVersion(join(instalacion, propia.FALLIDA));
    if (v !== null && compararVersiones(v, VERSION) > 0) fallida = v;
  } catch {
    fallida = null;
  }
  if (fallida) log('aviso', `la versión ${fallida} no arrancó: sigue la ${VERSION}`);

  let parado = false;
  let finParar = null;
  let resolverTerminado;
  const terminado = new Promise((resolver) => {
    resolverTerminado = resolver;
  });
  const app: {
    bandeja: any;
    captura: any;
    nucleo: any;
    timbres: any;
    lector: any;
    actualizador: any;
    comercio: any;
    biblioteca?: any;
    vigilancia?: any;
  } = { bandeja: null, captura: null, nucleo: null, timbres: null, lector: null, actualizador: null, comercio: null };
  const temporizadores = [];
  const programados = []; // los de la tarea 13: {id, quitar}
  const estado: {
    estados: any;
    huella: any;
    extra: any;
    avisoBase: any;
    ultimaPregunta: any;
    exe: any;
    esperaExe: any;
    aplazado: boolean;
    addonsPreparados: any;
    addonsDir: any;
    act: any;
    roto: boolean;
    reinstalar: boolean;
    fallida: typeof fallida;
    buscando: boolean;
    aplicando: boolean;
    buscarAlCrear: boolean;
    versiones: any;
    globos: any;
    avisos: any[];
    entradas: any;
    instalador: any[];
    versionBase: any;
    inicio: any;
    cambiandoInicio: boolean;
    publicado?: boolean;
    avisarExe?: any;
    seqVisto?: any;
  } = {
    estados: null, huella: null, extra: null, avisoBase: null, ultimaPregunta: null, exe: null, esperaExe: null, aplazado: false,
    addonsPreparados: null,
    // tarea 13
    addonsDir: null, act: clavePublica === null ? 'sin_clave' : 'nunca', roto: false, reinstalar: false, fallida,
    buscando: false, aplicando: false, buscarAlCrear: false, versiones: {}, globos: new Set(), avisos: [], entradas: null,
    instalador: [], versionBase: null,
    // comercio, Task 8: si el acceso directo de la carpeta Inicio existe (null: aún no se sabe)
    inicio: null, cambiandoInicio: false,
  };
  const inicio = deps.inicio || {
    consultar: () => arranqueConWindows(),
    poner: (activo) => ponerArranqueConWindows(activo, { ...rutasLanzador({ instalada, instalacion }), cuarentena: () => cuarentenaNueva({ ...entorno, SNF_DATOS: datos }) }),
  };

  // ---------- S8: el puente con TATI (solo con puenteTati.activo: true; si no, `tati` es null y nada de esto existe) ----------

  const tati = (() => {
    let activo = false;
    try {
      activo = puenteDe(leerConfig(entorno)).activo;
    } catch {
      activo = false;
    }
    if (!activo) return null;
    const carpeta = carpetaPuente(datos);
    try {
      return {
        carpeta,
        estadoJuego: crearEstadoJuego({ datos, fs }),
        cerebro: (deps.crearCerebro || crearCerebro)({ carpeta, fs }),
        acciones: null, // con el núcleo (hace falta la carpeta de la base)
        correo: null,
      };
    } catch (e) {
      log('error', `puente con TATI: no arrancó (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
      return null;
    }
  })();
  if (tati) log('info', 'puente con TATI: activo');
  // El cerebro elegido ahora (puede cambiar desde el menú); sin el puente, siempre el de siempre.
  const cerebroElegido = () => {
    if (!tati) return 'snetforever';
    try {
      return puenteDe(leerConfig(entorno)).cerebro;
    } catch {
      return 'snetforever';
    }
  };
  const ultimoTati = () => {
    try {
      return tati.cerebro.ultimo() === 'ok' ? 'ok' : 'desconocido';
    } catch {
      return 'desconocido';
    }
  };

  // ---------- la bandeja: lo que enseña ----------

  const lineaPregunta = () => {
    if (estado.ultimaPregunta === null) return T.preguntaNinguna;
    const min = Math.floor((ahora() - estado.ultimaPregunta) / 60_000);
    return min < 1 ? T.preguntaReciente : T.preguntaMinutos(min);
  };

  const lineaJuego = () => {
    if (!app.captura) return null;
    const c = app.captura.estadoCaptura();
    if (c.juego !== true) return T.juego.no;
    if (c.minimizado) return T.juego.minimizado;
    return c.primerPlano ? T.juego.listo : T.juego.segundoPlano;
  };

  function refrescar() {
    if (parado || !app.bandeja) return;
    try {
      const config = leerConfig(entorno);
      // S8: con el cerebro TATI, la línea del motor dice si TATI contesta (los motores no se usan)
      const conTati = tati !== null && puenteDe(config).cerebro === 'tati';
      const eleccion = estado.estados ? motor.elegirMotor(config, estado.estados) : null;
      let lineaMotor = estado.estados ? textoBandejaMotor(eleccion, estado.estados, idioma) : T.comprobando;
      if (conTati) lineaMotor = T.cerebroTati[ultimoTati()];
      const captura = app.captura ? app.captura.estadoCaptura() : null;
      const textoJuego = lineaJuego();
      const items = [estado.extra, estado.avisoBase, lineaMotor, textoJuego, lineaPregunta()].filter(Boolean);
      let icono = 'ok';
      if (estado.extra || (!conTati && eleccion && eleccion.error)) icono = 'error';
      else if ((captura && captura.error) || estado.avisoBase || estado.roto || estado.reinstalar) icono = 'aviso';
      else if (conTati && ultimoTati() !== 'ok') icono = 'aviso';
      let motorCorto = estado.estados ? textoMotorCorto(eleccion, estado.estados, idioma) : T.comprobando;
      if (conTati) motorCorto = lineaMotor;
      const tooltip = captura && captura.error ? T.capturaError(captura.error) : [motorCorto, textoJuego].filter(Boolean).join(' · ');
      app.bandeja.estado(items[0], icono, { lineas: items.slice(1), tooltip });
      app.bandeja.motor(VALORES_MOTOR.includes(config.motor) ? config.motor : 'auto');
      // S8: solo con el puente se manda (y se repite como `motor`); sin él, la bandeja deja ocultas sus entradas
      if (tati) app.bandeja.cerebro?.({ visible: true, valor: conTati ? 'tati' : 'snetforever' });
      enviarEntradas();
    } catch (e) {
      log('aviso', `bandeja: no se pudo poner al día (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
    }
  }

  // ---------- tarea 13: la línea `entradas` (F5) ----------

  // El texto de «Actualización: …». Lo que pide hacer algo va primero; la versión que no arrancó (fallida.txt), solo
  // cuando no hay nada más que decir.
  function textoActualizacion() {
    const A = T.actualizacion;
    if (estado.reinstalar) return A.reinstalar;
    if (estado.roto) return A.roto;
    if (estado.fallida && ['al_dia', 'error', 'sin_clave', 'nunca'].includes(estado.act)) return A.fallida(estado.fallida);
    if (estado.act === 'listaInstalador') return A.listaInstalador(listaTexto(estado.instalador));
    return typeof A[estado.act] === 'string' ? A[estado.act] : A.nunca;
  }

  // Manda la línea `entradas` solo si cambió.
  function enviarEntradas() {
    if (typeof app.bandeja?.entradas !== 'function') return;
    const e = { actualizacion: textoActualizacion(), avisos: estado.avisos.length, version: VERSION };
    const huella = JSON.stringify(e);
    if (huella === estado.entradas) return;
    estado.entradas = huella;
    app.bandeja.entradas(e);
  }

  // Un globo que, con la misma clave, sale una sola vez en esta sesión.
  function globoUnaVez(clave, texto) {
    if (estado.globos.has(clave)) return;
    estado.globos.add(clave);
    app.bandeja?.globo(T.titulo, texto);
  }

  // «addon 0.5.1, datos de misiones 2026.11.12.1»: de los elementos de una lista de comprobar() o de los nombres de los
  // componentes (con la versión de la última lista si se sabe).
  const nombreDe = (c) => T.componentes[c] || String(c);
  function listaTexto(items, { conVersion = true } = {}) {
    return items.map((i) => {
      if (i && typeof i === 'object') return `${nombreDe(i.componente)} ${i.a}`;
      return conVersion && estado.versiones[i] ? `${nombreDe(i)} ${estado.versiones[i]}` : nombreDe(i);
    }).join(', ');
  }

  // ---------- comprobar los dos motores ----------

  let cadenaComprobar = Promise.resolve();
  async function comprobarUnaVez() {
    if (parado) return;
    const estados = await comprobarAmbos(comprobadores);
    if (parado) return;
    estado.estados = estados;
    const eleccion = motor.elegirMotor(leerConfig(entorno), estados);
    const huella = `${estados.claude.estado}|${estados.codex.estado}|${eleccion.motor || ''}`;
    const cambio = huella !== estado.huella;
    estado.huella = huella;
    log('info', `motores: claude ${estados.claude.estado}, codex ${estados.codex.estado}`);
    refrescar();
    // El buzón solo se vuelve a escribir (y a tocar su timbre) si algo cambió, y la primera vez siempre.
    if (app.nucleo && (cambio || !estado.publicado)) {
      estado.publicado = true;
      await app.nucleo.publicarEstado(estados);
    }
  }
  async function publicarPrimera() {
    if (estado.publicado || !app.nucleo || !estado.estados) return;
    estado.publicado = true;
    await app.nucleo.publicarEstado(estado.estados);
  }
  function comprobarMotores() {
    const hecho = cadenaComprobar.then(comprobarUnaVez, comprobarUnaVez);
    cadenaComprobar = hecho.catch(() => {});
    return hecho;
  }

  // ---------- el menú de la bandeja ----------

  function alMenu(accion, valor) {
    if (accion === 'comprobar') {
      comprobarMotores().catch(() => {});
      comprobarTati().catch(() => {});
    } else if (accion === 'cerebro') {
      elegirCerebro(valor).catch(() => {});
    } else if (accion === 'complemento_tati') {
      prepararComplemento();
    } else if (accion === 'registro') {
      const registro = join(datos, 'registro.log');
      (deps.abrir || abrirRuta)(fs.existsSync(registro) ? registro : datos);
    } else if (accion === 'carpeta') {
      (deps.abrir || abrirRuta)(datos);
    } else if (accion === 'guias') {
      abrirGuias();
    } else if (accion === 'enlace') {
      anadirDelPortapapeles().catch((e) => log('aviso', `biblioteca: «Añadir enlace» falló (${e?.code || 'ERROR'})`));
    } else if (accion === 'enlaces') {
      actualizarTodosLosEnlaces().catch((e) => log('aviso', `biblioteca: «Actualizar los enlaces» falló (${e?.code || 'ERROR'})`));
    } else if (accion === 'motor') {
      elegirDesdeElMenu(valor).catch(() => {});
    } else if (accion === 'actualizar') {
      if (app.actualizador) {
        buscarActualizaciones().catch(() => {});
      } else {
        // ronda 1 (Menor 3): aún no se sabe dónde está el juego; se busca en cuanto se cree el actualizador
        estado.buscarAlCrear = true;
        estado.act = 'todavia';
        refrescar();
      }
    } else if (accion === 'avisos' || accion === 'avisos_archivo' || accion === 'avisos_copiar') {
      mandarAvisos(accion).catch(() => {});
    } else if (accion === 'inicio') {
      cambiarInicio().catch(() => {});
    } else if (accion === 'salir') {
      parar().catch(() => {});
    }
  }

  // ---------- tarea 13: el juego (procesos y registro) ----------

  // ¿Está abierto el juego de \_forever_\? De la lista de procesos; si no se puede saber, cuenta como abierto.
  async function juegoAbiertoAhora() {
    try {
      return juegoAbierto({ procesos: await juego.consultar('procesos') });
    } catch {
      return true;
    }
  }

  // La carpeta de AddOns cuando ni SNF_ADDONS, ni config.addons, ni la captura la dan: por los InstallPath del registro
  // (carpetaAddOns) y, si no, por la ruta de un Wow.exe abierto (candidatasJuego). Lo que no se puede preguntar no cuenta.
  async function buscarJuego(config) {
    const pedir = async (que) => {
      try {
        return await juego.consultar(que);
      } catch {
        return undefined;
      }
    };
    const registro = await pedir('registro');
    const porRegistro = carpetaAddOns({ config, env: entorno, existe: deps.existe, registro: Array.isArray(registro) ? registro : [] });
    if (porRegistro) return porRegistro;
    const procesos = await pedir('procesos');
    const candidatas = candidatasJuego({ env: entorno, config, procesos, registro, ...(deps.existe ? { existe: deps.existe } : {}) });
    return candidatas[0]?.addons ?? null;
  }

  // ---------- tarea 13: preparar AddOns (lote G) ----------

  // Lote G, ronda 1: si el juego está abierto, de una sola fuente (la captura): true, false o null. null es «no se sabe»:
  // aún no ha llegado el primer estado del ayudante, el ayudante murió o no hay captura. Solo con false (cerrado de
  // verdad) se apartan ranuras o se reescriben .toc; si no, se aplaza y se hace cuando la captura diga «juego: no».
  function juegoSegunCaptura() {
    return app.captura ? app.captura.estadoCaptura().juego : null;
  }
  function preparar(dir) {
    return prepararAddOns(dir, { raizVolumen: deps.raizVolumen, juegoAbierto: juegoSegunCaptura() !== false });
  }
  // Apunta los avisos, recuerda si quedó algo aplazado y saca el globo de reiniciar el juego si hace falta.
  function avisarPreparacion(r) {
    for (const a of r.avisos || []) log('aviso', `prepararAddOns: ${a.codigo}`);
    estado.aplazado = r.aplazado === true;
    if (estado.aplazado) log('aviso', 'prepararAddOns: sin saber que el juego está cerrado; las ranuras de más y los .toc esperan a que se cierre');
    if (r.juegoDebeReiniciar) {
      // Carpetas nuevas, o solo algún .toc reescrito o ranuras de más apartadas: todo pide reiniciar el juego, con un
      // texto distinto («creadas» o «puestas al día»).
      const nuevas = (r.ranurasCreadas || 0) + (r.timbresCreados || 0) > 0;
      app.bandeja?.globo(T.titulo, nuevas ? T.carpetasCreadas : T.carpetasPuestasAlDia);
    }
  }
  // Lo aplazado, una sola vez por cierre del juego: el primer «juego: no» que llega mientras queda algo aplazado.
  function reintentarAplazado() {
    if (parado || !estado.aplazado || !estado.addonsPreparados) return;
    estado.aplazado = false;
    let r;
    try {
      r = preparar(estado.addonsPreparados);
    } catch (e) {
      log('error', `prepararAddOns: ${e?.code || 'ERROR'}`);
      return;
    }
    avisarPreparacion(r);
  }
  // Otra vez, tras una actualización o tras R17 (el addon nuevo puede pedir otras ranuras).
  function prepararOtraVez() {
    if (!estado.addonsPreparados) return;
    try {
      avisarPreparacion(preparar(estado.addonsPreparados));
    } catch (e) {
      log('error', `prepararAddOns: ${e?.code || 'ERROR'}`);
    }
  }

  // ---------- tarea 13: R17 (primerArranque.mjs) y recargar la base ----------

  const primerArranque = crearPrimerArranque({ env: entorno, instalacion, clavePublica, juegoAbierto: juegoAbiertoAhora });
  async function instalarLoQueFalta() {
    if (parado) return;
    const r = await primerArranque.intentar(estado.addonsDir);
    if (!r || parado) return;
    app.bandeja?.globo(T.titulo, T.primerArranque(listaTexto(r.instalados, { conVersion: false })));
    prepararOtraVez();
    recargarBaseSiCambio(r.instalados);
  }

  // La versión de los datos de misiones instalados (la del .toc), o null.
  function versionMisiones() {
    try {
      return estado.addonsPreparados ? estadoInstalado(estado.addonsPreparados).misiones : null;
    } catch {
      return null;
    }
  }
  // Ronda 1 (duda 5): si entraron datos de misiones de otra versión que la cargada, el núcleo carga la base nueva en
  // segundo plano (la de antes sigue en uso hasta que la nueva cargue). Una versión solo se carga una vez.
  function recargarBaseSiCambio(componentes) {
    if (!componentes.includes('misiones') || !app.nucleo) return;
    const v = versionMisiones();
    if (v === estado.versionBase) return;
    const antes = estado.versionBase;
    estado.versionBase = v;
    // revisión final, m8: si la base nueva no carga, la versión de antes vuelve a ser la cargada, para que la próxima vez
    // que entren esos datos se intente otra vez (si mientras tanto no se ha pedido otra)
    const otraVez = () => {
      if (estado.versionBase === v) estado.versionBase = antes;
    };
    app.nucleo.recargarBase().then((ok) => {
      if (ok !== true) otraVez();
      else app.biblioteca?.actualizar().catch(() => {}); // las misiones por nombre se rehacen con la base nueva
    }, otraVez);
  }

  // ---------- tarea 13: las actualizaciones ----------

  // `roto` y `reinstalar` de estado() y de aplicarSiSePuede() (los dos los dan siempre que hay marca de estado roto).
  function avisosDelActualizador(r) {
    if (!r || typeof r !== 'object') return;
    estado.roto = r.roto === true;
    estado.reinstalar = r.reinstalar === true;
    if (estado.reinstalar) globoUnaVez('reinstalar', T.globoReinstalar);
  }

  // El estado al crear el actualizador (F4): lo pendiente, el último error y la última comprobación de antes.
  function estadoInicialActualizador() {
    let e;
    try {
      e = app.actualizador.estado();
    } catch {
      return;
    }
    if (!e || typeof e !== 'object') return;
    avisosDelActualizador(e);
    if (clavePublica === null) estado.act = 'sin_clave';
    else if (e.pendiente) estado.act = 'lista';
    else if (e.ultimoError) estado.act = 'error';
    else if (e.ultimaComprobacion) estado.act = 'al_dia';
  }

  // comprobar() y, con «hay», descargar(). Una sola a la vez; los errores no sacan globo (vigilancia 4: sin red, o con el
  // repositorio aún sin publicar, la entrada dice «no se pudo comprobar» y se vuelve a intentar a las 24 h).
  async function buscarActualizaciones() {
    const a = app.actualizador;
    if (!a || estado.buscando || parado) return;
    estado.buscando = true;
    estado.act = 'buscando';
    refrescar();
    let fallo = null; // el resultado (o el error) de la comprobación o de la descarga que falló
    try {
      const r = await a.comprobar();
      if (parado) return;
      if (r?.estado === 'error') fallo = r;
      if (r?.estado === 'sin_clave') estado.act = 'sin_clave';
      else if (r?.estado === 'sin_novedades') estado.act = 'al_dia';
      else if (r?.estado === 'hay') {
        const lista = Array.isArray(r.lista) ? r.lista.filter((i) => i && typeof i.componente === 'string' && typeof i.a === 'string') : [];
        for (const i of lista) estado.versiones[i.componente] = i.a;
        const d = await a.descargar();
        if (parado) return;
        if (d?.roto === true) estado.roto = true;
        if (d?.estado === 'listo') {
          // ronda 1 (Menor 5): si además algo pide el instalador nuevo, la entrada lo dice
          estado.instalador = lista.filter((i) => i.requiereInstalador);
          estado.act = estado.instalador.length > 0 ? 'listaInstalador' : 'lista';
          const bajadas = lista.filter((i) => !i.requiereInstalador && !i.saltado);
          if (d.roto !== true && bajadas.length > 0) {
            globoUnaVez(`listo:${bajadas.map((i) => `${i.componente}@${i.a}`).join(',')}`, T.globoListo(listaTexto(bajadas)));
          }
        } else if (d?.estado === 'nada') {
          estado.instalador = lista.filter((i) => i.requiereInstalador);
          estado.act = estado.instalador.length > 0 ? 'instalador' : 'al_dia';
        } else {
          estado.act = 'error';
          fallo = d;
        }
      } else {
        estado.act = 'error';
      }
    } catch (e) {
      log('aviso', `actualizaciones: ${e?.code || 'ERROR'}`);
      estado.act = 'error';
      fallo = { estado: 'error', codigo: typeof e?.code === 'string' ? e.code : 'fallo' };
    } finally {
      estado.buscando = false;
      reintentarPronto(fallo);
      refrescar();
    }
  }

  // Task 8, ronda 2: ¿tiene el jugador el núcleo 0.7.0 (o más nuevo) y le falta la carpeta SnetForever_Comercio? Sin ella no
  // hay comercio, así que un fallo al comprobar (sin red…) no puede esperar a las 24 h.
  function faltaElComercio() {
    try {
      if (!estado.addonsDir) return false;
      const instalado = estadoInstalado(estado.addonsDir);
      return instalado.addon !== null && compararVersiones(instalado.addon, NUCLEO_CON_COMERCIO_APARTE) >= 0 && instalado.comercio === null;
    } catch {
      return false;
    }
  }

  // Tras un fallo PASAJERO (esPasajero) de la comprobación o la descarga, con el comercio ausente: otra a los 5 min y, si vuelve a
  // fallar igual, a los 10, 20, 40… (se doblan, con tope de 24 h). Se pone a cero cuando el comercio llega, cuando una comprobación
  // va bien o cuando el fallo ya no es pasajero. Una sola pendiente a la vez; con auto = false no se hace nada (buscarSola lo mira).
  let reintentoComercio = false;
  let reintentosSeguidos = 0;
  function reintentarPronto(fallo) {
    if (reintentoComercio || parado) return;
    if (estado.act !== 'error' || !esPasajero(fallo) || !faltaElComercio()) {
      if (estado.act !== 'buscando') reintentosSeguidos = 0;
      return;
    }
    const espera = Math.min(periodos.reintentoComercio * 2 ** reintentosSeguidos, periodos.actualizacion);
    reintentosSeguidos += 1;
    reintentoComercio = true;
    programar(temporizar.despues(() => {
      reintentoComercio = false;
      buscarSola();
    }, espera), temporizar.quitarDespues);
  }

  // A los 120 s y cada 24 h, salvo con `config.actualizaciones.auto === false` (entonces, solo desde el menú).
  function buscarSola() {
    if (parado || leerConfig(entorno).actualizaciones?.auto === false) return;
    if (!app.actualizador) {
      estado.buscarAlCrear = true; // aún no se sabe dónde está el juego: se busca en cuanto se cree el actualizador
      return;
    }
    buscarActualizaciones().catch(() => {});
  }

  // Cada 60 s: R17 y aplicarSiSePuede().
  async function cadaMinuto() {
    if (parado) return;
    await instalarLoQueFalta();
    const a = app.actualizador;
    if (!a || estado.aplicando || parado) return;
    estado.aplicando = true;
    try {
      const r = await a.aplicarSiSePuede();
      if (parado) return;
      avisosDelActualizador(r);
      // lo que pide el instalador nuevo sigue haciendo falta aunque lo demás ya esté puesto
      const sinLoBajado = estado.instalador.length > 0 ? 'instalador' : 'al_dia';
      const conLoBajado = ['lista', 'listaInstalador'].includes(estado.act);
      if (r?.estado === 'aplicado') estado.act = sinLoBajado;
      else if (r?.estado === 'esperando_juego' && estado.act !== 'buscando' && !conLoBajado) estado.act = 'lista';
      else if (r?.estado === 'nada' && conLoBajado) estado.act = sinLoBajado; // lo pendiente ya estaba o se descartó
    } catch (e) {
      log('aviso', `actualizaciones: ${e?.code || 'ERROR'}`);
    } finally {
      estado.aplicando = false;
      refrescar();
    }
  }

  // alAplicar del actualizador: prepararAddOns y el globo; si entró la app, se reinicia (reiniciar suelta el cerrojo y
  // lanza la nueva, que espera a que esta salga) y esta se cierra enseguida, para que no haya dos bandejas.
  async function alAplicar(aplicados) {
    const lista = Array.isArray(aplicados) ? aplicados.filter((c) => typeof c === 'string') : [];
    prepararOtraVez();
    recargarBaseSiCambio(lista);
    app.bandeja?.globo(T.titulo, T.globoAplicado(listaTexto(lista)));
    if (!lista.includes('app') || parado) return;
    try {
      await propia.reiniciar({ instalacion, soltar: cerrojo.soltar });
    } catch (e) {
      log('error', `reiniciar: ${e?.code || 'ERROR'}; la versión nueva se usará la próxima vez que se abra`);
      await retomarCerrojo();
      return;
    }
    log('info', 'la app se reinicia con la versión nueva');
    parar().catch(() => {});
  }

  // Ronda 1 (Menor 2): `reiniciar` falló después de soltar el cerrojo. Se vuelve a tomar y la app sigue viva, avisando.
  // Si otra instancia ya lo tomó (la nueva arrancó de todos modos), esta se cierra para que no haya dos bandejas.
  async function retomarCerrojo() {
    let otra;
    try {
      otra = await tomarCerrojo(datos, { fs, info: deps.infoProceso, entorno });
    } catch (e) {
      otra = { ok: false, error: e?.code || 'ERROR' };
    }
    if (otra.ok) {
      cerrojo = otra;
      app.bandeja?.globo(T.titulo, T.reiniciarFallo);
      return;
    }
    // revisión final, m7: el cerrojo sigue siendo de esta app (reiniciar falló antes de soltarlo, o soltar() falló): se
    // queda con el que tenía y sigue viva
    if (otra.pid === process.pid) {
      app.bandeja?.globo(T.titulo, T.reiniciarFallo);
      return;
    }
    log('aviso', 'reiniciar: el cerrojo ya es de otra instancia; esta se cierra');
    parar().catch(() => {});
  }

  // Crea el actualizador cuando ya se sabe dónde está AddOns. Sin instalación (desde el repositorio) no se le pasa aplicarApp.
  function crearElActualizador(addonsDir) {
    try {
      app.actualizador = crearAct({
        env: entorno,
        config: leerConfig(entorno),
        addonsDir,
        clavePublica,
        juegoAbierto: juegoAbiertoAhora,
        aplicarApp: instalada ? (buffer) => propia.aplicarApp(buffer, { instalacion, cuarentena: cuarentenaDeComponentes }) : undefined,
        alAplicar,
      });
    } catch (e) {
      log('error', `actualizaciones: no se pudo crear el actualizador (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
      app.actualizador = null;
      return;
    }
    estadoInicialActualizador();
    refrescar();
    if (estado.buscarAlCrear) {
      estado.buscarAlCrear = false;
      buscarActualizaciones().catch(() => {});
    }
  }

  // ---------- tarea 13: los avisos de fallo (menuAvisos.mjs) ----------

  const menuAvisos = crearMenuAvisos({ env: entorno, idioma, abrirUrl: deps.abrirUrl, abrirCarpeta: deps.abrirCarpeta, copiar: deps.copiar });
  function contarAvisos() {
    estado.avisos = menuAvisos.pendientes(estado.addonsPreparados);
    refrescar();
  }
  // Cada 10 min. Los avisos y la identidad, solo con el juego cerrado (WoW escribe SavedVariables al salir). F10: con el
  // juego abierto, un /reload también escribe el archivo: de ahí se leen solo los escaneos de la subasta.
  async function avisosCadaRato() {
    if (parado) return;
    const abierto = await juegoAbiertoAhora();
    if (parado) return;
    if (abierto) {
      leerEscaneosConJuegoAbierto();
      return;
    }
    contarAvisos();
    await leerComercio();
  }

  // ---------- comercio, Task 8: SavedVariables, el programador y «Arrancar con Windows» ----------

  const carpetaComercio = join(datos, 'comercio');
  const estadoComercio = crearEstadoComercio({ fs, carpeta: carpetaComercio });

  // El cliente de Blizzard de cada región (uno por región; la región es la del personaje en uso). Lo comparten el
  // programador, el catálogo de objetos y las misiones de la API.
  const clientesBlizzard = new Map();
  const clienteDe = (region) => {
    if (!clientesBlizzard.has(region)) {
      clientesBlizzard.set(region, (deps.clienteBlizzard || crearClienteBlizzard)({
        region, locale: idioma === 'es' ? 'es_MX' : 'en_US', enviar,
        credenciales: () => leerCredenciales(datos, { registrar: (texto) => log('aviso', texto) }),
      }));
    }
    return clientesBlizzard.get(region);
  };
  // El cliente de la región en uso; sin identidad aún no se sabe la región (SIN_REGION).
  const clienteEnUso = () => {
    const uso = estadoComercio.enUso();
    if (!uso) throw Object.assign(new Error('aún no se sabe la región'), { code: 'SIN_REGION' });
    return clienteDe(uso.region);
  };

  // Misiones que no están en la base, confirmadas con la API (Task 16): el núcleo las consulta en cada turno; la descarga
  // empieza (iniciar) en cuanto se sabe la región.
  const misionesApi = crearMisionesApi({
    cliente: {
      indiceZonasMision: () => clienteEnUso().indiceZonasMision(),
      misionesDeZona: (zona) => clienteEnUso().misionesDeZona(zona),
      mision: (id) => clienteEnUso().mision(id),
    },
    fs, carpeta: carpetaComercio, dormir: dormirSuelto, ahora,
  });
  function iniciarMisionesApi() {
    if (parado || !estadoComercio.enUso()) return;
    try {
      misionesApi.iniciar();
    } catch (e) {
      log('aviso', `misiones de la API: no arrancó (${e?.code || 'ERROR'})`);
    }
  }

  // F10: la firma (fechas y tamaños) de los SnetForever.lua ya leídos enteros, y la del último aviso de uno que no se pudo
  // leer: un archivo sin cambios no se relee y uno a medias avisa una sola vez. Solo en memoria.
  let firmaLeida = null;
  let firmaAvisada = null;

  // F10: de los escaneos nuevos, los que se pueden probar ya (los de una casa en sus 24 h de sinCasa no adelantan nada), y
  // la línea del registro. Sin nombres de personajes.
  function escaneosParaProbar(nuevos) {
    const t = ahora();
    const salen = nuevos.filter((e) => t - (estadoComercio.sinCasa(e.clave) ?? -Infinity) >= ESPERA_SIN_CASA_MS);
    // «Próximas rondas»: cada ronda prueba solo el más viejo de los pendientes, y sin credenciales no prueba ninguno.
    if (salen.length === 1) log('info', `comercio: escaneo nuevo de la subasta ${salen[0].faccion}, se intentará en las próximas rondas`);
    else if (salen.length > 1) log('info', `comercio: escaneos nuevos de las subastas ${salen.map((e) => e.faccion).join(', ')}, se intentarán en las próximas rondas`);
    return salen;
  }

  // F10: con el juego abierto, solo lectura y solo los escaneos. Si el archivo cambió, lleva ESPERA_ARCHIVO_MS quieto (para
  // no leerlo mientras el juego lo escribe) y trae un escaneo nuevo, adelanta una ronda. Lo que no se pudo leer se reintenta
  // en la vuelta siguiente. Espera a que exista el programador para no gastar un escaneo nuevo sin ronda.
  function leerEscaneosConJuegoAbierto() {
    const raiz = raizDelJuego(estado.addonsPreparados);
    if (!raiz || parado || !app.comercio) return;
    const f = firmaCuentas(raiz, { fs });
    if (!f || f.firma === firmaLeida || ahora() - f.ultimo < ESPERA_ARCHIVO_MS) return;
    const avisar = (nivel, texto) => {
      if (firmaAvisada === f.firma) return;
      firmaAvisada = f.firma;
      log(nivel, texto);
    };
    try {
      let saltado = false;
      const leido = leerCuentas(raiz, { fs, registrar: (nivel, texto) => { saltado = true; avisar(nivel, texto); } });
      if (firmaCuentas(raiz, { fs })?.firma !== f.firma) return; // ha cambiado mientras se leía: a la siguiente
      if (!saltado) firmaLeida = f.firma;
      if (!leido) return;
      if (escaneosParaProbar(estadoComercio.alLeerEscaneos(leido).escaneosNuevos).length > 0) app.comercio.ahora().catch(() => {});
    } catch (e) {
      avisar('aviso', `comercio: no se pudieron leer los escaneos de SavedVariables (${e?.code || 'ERROR'})`);
    }
  }

  // La identidad y el último escaneo de SnetForeverCuenta.comercio. Solo se llama con el juego cerrado. Con una identidad
  // nueva, el programador hace una ronda ya (las casas pueden haber cambiado) y arrancan las misiones de la API. F10: un
  // escaneo nuevo por descubrir también adelanta la ronda, una sola vez. → true si toca una ronda ya.
  async function leerComercio() {
    const raiz = raizDelJuego(estado.addonsPreparados);
    if (!raiz || parado) return false;
    try {
      const firma = firmaCuentas(raiz, { fs });
      let saltado = false;
      const leido = leerCuentas(raiz, { fs, registrar: (nivel, texto) => { saltado = true; log(nivel, texto); } });
      if (firma && !saltado) firmaLeida = firma.firma;
      if (!leido) return false;
      // F7: también cuando aparece una facción con personajes nueva (un escaneo de su subasta): cambian las casas.
      const { identidadCambiada, casasCambiadas, escaneosNuevos } = estadoComercio.alLeerCuenta(leido);
      const porProbar = escaneosParaProbar(escaneosNuevos);
      if (casasCambiadas && !identidadCambiada) {
        await estadoComercio.guardar();
        app.comercio?.ahora().catch(() => {});
        return true;
      }
      if (!identidadCambiada) {
        if (porProbar.length === 0) return false;
        app.comercio?.ahora().catch(() => {});
        return true;
      }
      const i = estadoComercio.identidad();
      log('info', `comercio: personaje en uso ${i.region}|${i.reino}|${i.faccion}`);
      await estadoComercio.guardar();
      iniciarMisionesApi();
      app.comercio?.ahora().catch(() => {});
      return true;
    } catch (e) {
      log('aviso', `comercio: no se pudo leer lo del comercio de SavedVariables (${e?.code || 'ERROR'})`);
    }
    return false;
  }

  // El historial y el catálogo del comercio: unos solos para el programador y para la IA (Task 17a), así el disco se lee
  // una vez y la IA ve las fotos nuevas en cuanto entran. Crearlos no lee nada (cada uno carga al primer uso).
  // El historial viejo (JSON, app 0.6.0), una vez convertido y guardado en el formato nuevo, va a la cuarentena de datos.
  // F9m (temporal): el contador de «Salen al día» mira los pares de la casa de la Horda 48 horas y se apaga solo.
  const medidorSalen = crearMedidorSalen({
    fs, carpeta: carpetaComercio,
    casasHorda: () => casasHordaDe(estadoComercio.identidad(), estadoComercio.conocidas()),
    registrar: (nivel, texto) => log(nivel, texto),
  });
  const historialComercio = crearHistorialComercio({
    fs, carpeta: carpetaComercio, cuarentena: () => cuarentenaNueva({ ...entorno, SNF_DATOS: datos }),
    registrar: (nivel, texto) => log(nivel, texto),
    alPar: medidorSalen.alPar,
  });
  const regionalComercio = crearRegional({ fs, carpeta: carpetaComercio, registrar: (nivel, texto) => log(nivel, texto) });
  const catalogoComercio = crearCatalogo({
    cliente: { objeto: (id) => clienteEnUso().objeto(id) },
    fs, carpeta: carpetaComercio, dormir: dormirSuelto, ahora,
  });

  // Task 17a: los precios de comercio para cada turno de la IA (también con la subasta cerrada): la casa del personaje en
  // uso y las otras casas de su reino. Sin identidad o sin precios, null; nunca lanza ni usa la red.
  async function comercioParaIA(mensaje) {
    try {
      return fuenteDeComercio({ estado: estadoComercio, historial: historialComercio, catalogo: catalogoComercio, mensaje });
    } catch (e) {
      log('aviso', `comercio: la IA va sin precios (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
      return null;
    }
  }

  // El programador horario.
  function arrancarComercio(addonsDir) {
    app.comercio = crearProgramadorComercio({
      cliente: clienteDe,
      historial: historialComercio,
      catalogo: catalogoComercio,
      casas: estadoComercio,
      escribir: (textos, { generado }) => escribirPrecios(addonsDir, textos, { generado, raizVolumen: deps.raizVolumen }),
      reloj: ahora,
      dormir: dormirSuelto,
      registrar: (nivel, texto) => log(nivel, texto),
      ...(Number.isFinite(deps.espacioComercio) ? { espacio: deps.espacioComercio } : {}),
      regional: regionalComercio,
    });
    app.comercio.arrancar();
  }

  // Primero lo de SavedVariables (si el juego está cerrado) y después el programador, para que la primera ronda ya sepa
  // qué casas bajar; con la región ya sabida (de antes o de ahora), también las misiones de la API.
  async function iniciarComercio(addonsDir) {
    const rondaYa = !(await juegoAbiertoAhora()) && (await leerComercio());
    if (parado) return;
    arrancarComercio(addonsDir);
    // En el primer arranque el programador aún no existía cuando se leyó lo guardado: la ronda de «ya» se hace ahora.
    if (rondaYa) app.comercio.ahora().catch(() => {});
    iniciarMisionesApi();
  }

  // La marca de «Arrancar con Windows» en la bandeja, según lo que hay en la carpeta Inicio.
  async function mirarInicio() {
    try {
      const r = await inicio.consultar();
      if (parado) return;
      estado.inicio = r?.activo === true;
      app.bandeja?.inicio?.(estado.inicio);
    } catch (e) {
      log('aviso', `arrancar con Windows: no se pudo saber si está puesto (${e?.code || 'ERROR'})`);
    }
  }

  // Desde el menú: lo pone si no está y lo quita (a la cuarentena) si está. Si falla, un globo y la marca no cambia.
  async function cambiarInicio() {
    if (estado.cambiandoInicio || parado) return;
    estado.cambiandoInicio = true;
    try {
      const actual = estado.inicio ?? ((await inicio.consultar())?.activo === true);
      const r = await inicio.poner(!actual);
      estado.inicio = r?.activo === true;
      log('info', `arrancar con Windows: ${estado.inicio ? 'puesto' : 'quitado'}`);
    } catch (e) {
      log('aviso', `arrancar con Windows: no se pudo cambiar (${e?.code || 'ERROR'})`);
      app.bandeja?.globo(T.titulo, T.inicioFallo);
    } finally {
      estado.cambiandoInicio = false;
      if (!parado && estado.inicio !== null) app.bandeja?.inicio?.(estado.inicio);
    }
  }
  // F5-3: archivo y portapapeles primero (marcan todos); la issue de GitHub, en segundo lugar (solo los incluidos).
  async function mandarAvisos(como) {
    const r = await menuAvisos.mandar(como, estado.addonsPreparados);
    if (!r.ok) app.bandeja?.globo(T.titulo, T.avisosFallo);
    else if (como === 'avisos_copiar' && r.marcados > 0) app.bandeja?.globo(T.titulo, T.avisosCopiados);
    contarAvisos();
  }

  async function elegirDesdeElMenu(valor) {
    if (!VALORES_MOTOR.includes(valor)) return;
    try {
      await guardarMotor(datos, valor, { fs, entorno });
    } catch (e) {
      log('aviso', `no se pudo guardar el motor elegido (${e?.code || 'ERROR'})`);
      app.bandeja?.globo(T.titulo, T.configNoGuardada);
      return;
    }
    app.bandeja?.motor(valor);
    await comprobarMotores();
  }

  // ---------- S8: el puente con TATI (todo esto no hace nada sin `tati`) ----------

  // Pregunta a TATI si contesta (cerebro.comprobar recuerda 60 s), solo con el cerebro TATI: la línea del motor lo dice
  // y, si cambió, el buzón se vuelve a publicar (la cabecera lleva el estado de TATI). Una sola a la vez.
  let comprobandoTati = null;
  function comprobarTati() {
    if (!tati || parado || cerebroElegido() !== 'tati') return Promise.resolve();
    if (comprobandoTati) return comprobandoTati;
    comprobandoTati = (async () => {
      const antes = ultimoTati();
      try {
        await tati.cerebro.comprobar();
      } catch {
        // se queda con lo último que se supo
      }
      if (parado) return;
      const ahoraTati = ultimoTati();
      if (ahoraTati !== antes) log('info', `tati: ${ahoraTati === 'ok' ? 'conectada' : 'no responde'}`);
      refrescar();
      if (ahoraTati !== antes && app.nucleo && estado.publicado) await app.nucleo.publicarEstado(estado.estados || undefined);
    })().catch(() => {}).finally(() => {
      comprobandoTati = null;
    });
    return comprobandoTati;
  }

  // Desde el menú «Cerebro»: guarda `puenteTati.cerebro` y vuelve a publicar el estado (la cabecera cambia con el
  // cerebro). De una en una, en orden.
  let cadenaCerebro = Promise.resolve();
  function elegirCerebro(valor) {
    const trabajo = async () => {
      if (!tati || parado || (valor !== 'snetforever' && valor !== 'tati')) return;
      try {
        await guardarCerebro(datos, valor, { fs, entorno });
      } catch (e) {
        log('aviso', `no se pudo guardar el cerebro elegido (${e?.code || 'ERROR'})`);
        app.bandeja?.globo(T.titulo, T.cerebroNoGuardado);
        refrescar();
        return;
      }
      log('info', `cerebro: ${valor === 'tati' ? 'TATI' : 'IA de SnetForever'}`);
      refrescar();
      if (app.nucleo && estado.publicado) await app.nucleo.publicarEstado(estado.estados || undefined);
      await comprobarTati();
    };
    const hecho = cadenaCerebro.then(trabajo, trabajo);
    cadenaCerebro = hecho.catch(() => {});
    return hecho;
  }

  // Las acciones para TATI. Las definiciones no usan el núcleo: antes de tenerlo (para el complemento) vale sin él.
  // guardar_guia reindexa con el índice de la app (app.biblioteca, que puede no haber arrancado aún: entonces null).
  const crearLasAcciones = (carpetaBase = null) => (deps.crearAcciones || crearAcciones)({
    nucleo: app.nucleo, estadoJuego: tati.estadoJuego, datos, carpetaBase, fs, juegoAbierto: () => juegoSegunCaptura(),
    biblioteca: () => app.biblioteca ?? null, ...(deps.obtenerPagina ? { obtener: deps.obtenerPagina } : {}),
  });

  // Desde el menú: genera la carpeta del complemento (la de antes va a la cuarentena) y la abre en el Explorador.
  function prepararComplemento() {
    if (!tati || parado) return;
    let carpeta;
    try {
      carpeta = (deps.generarComplemento || generarComplemento)({
        datos, lanzador: rutasLanzador({ instalada, instalacion }).vbs, fs,
        definiciones: () => (tati.acciones || crearLasAcciones()).definiciones(),
      });
    } catch (e) {
      log('aviso', `complemento para TATI: no se pudo preparar (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
      app.bandeja?.globo(T.titulo, T.complementoFallo);
      return;
    }
    log('info', 'complemento para TATI preparado');
    app.bandeja?.globo(T.titulo, T.complementoListo);
    (deps.abrir || abrirRuta)(carpeta);
  }

  // Los canales de relevo con un pedido en curso (atenderRelevo aún no ha contestado): sus archivos no se apartan.
  const relevosEnCurso = new Map(); // canal -> pedidos en curso

  // Al arrancar y cada 30 minutos (revisión final, M2: un relevo que se cierra con la app abierta): los archivos de canal
  // de relevos cuyo proceso ya no vive van a la cuarentena de datos (nunca se borran). Un canal con un pedido en curso se
  // salta: la vuelta de atender aún escribirá su respuesta (ya irá en la siguiente).
  function apartarRelevosMuertos() {
    let nombres;
    try {
      nombres = fs.readdirSync(tati.carpeta);
    } catch {
      return; // aún no hay carpeta del puente
    }
    const vivo = deps.pidVivo || pidVivo;
    const vivos = new Map();
    const muertos = nombres.filter((n) => {
      const m = /^relevo-(\d+)\./.exec(n);
      if (!m || relevosEnCurso.has(`relevo-${m[1]}`)) return false;
      const pid = Number(m[1]);
      if (!vivos.has(pid)) {
        let v = true; // lo que no se puede saber cuenta como vivo (se queda)
        try {
          v = vivo(pid) !== false;
        } catch {
          v = true;
        }
        vivos.set(pid, v);
      }
      return !vivos.get(pid);
    });
    if (muertos.length === 0) return;
    let movidos = 0;
    try {
      const destino = cuarentenaNueva({ ...entorno, SNF_DATOS: datos });
      for (const n of muertos) {
        try {
          fs.renameSync(join(tati.carpeta, n), join(destino, n));
          movidos++;
        } catch (e) {
          log('aviso', `tati: un archivo de relevo no se pudo apartar (${e?.code || 'ERROR'})`);
        }
      }
    } catch (e) {
      log('aviso', `tati: los relevos cerrados no se pudieron apartar (${e?.code || 'ERROR'})`);
    }
    if (movidos > 0) log('info', `tati: ${movidos} archivos de relevos cerrados a la cuarentena`);
  }

  // Un pedido de un relevo: {tipo: 'herramienta', nombre, argumentos} -> {estado: 'hecho', resultado}. Nunca lanza. Sin
  // núcleo todavía, `app_preparandose` (el relevo no se queda sin acuse con la app abierta); cerrándose, `app_cerrandose`.
  async function atenderRelevo(canal, pedido) {
    try {
      if (!pedido || pedido.tipo !== 'herramienta' || typeof pedido.nombre !== 'string') {
        return { estado: 'error', tipo: 'fallo' };
      }
      if (parado) return { estado: 'hecho', resultado: { error: 'app_cerrandose' } };
      if (!tati.acciones) return { estado: 'hecho', resultado: { error: 'app_preparandose' } };
      const a = pedido.argumentos;
      const argumentos = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
      relevosEnCurso.set(canal, (relevosEnCurso.get(canal) ?? 0) + 1);
      try {
        return { estado: 'hecho', resultado: await tati.acciones.ejecutar(pedido.nombre, argumentos) };
      } finally {
        const quedan = relevosEnCurso.get(canal) - 1;
        if (quedan > 0) relevosEnCurso.set(canal, quedan);
        else relevosEnCurso.delete(canal);
      }
    } catch (e) {
      log('aviso', `tati: una herramienta falló (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
      return { estado: 'error', tipo: 'fallo' };
    }
  }

  // Al arrancar: el canal de los relevos (las acciones llegan después, con el núcleo).
  function atenderRelevos() {
    try {
      tati.correo = (deps.atender || atender)(tati.carpeta, /^relevo-\d+$/, atenderRelevo, { fs });
    } catch (e) {
      log('error', `puente con TATI: el canal de los relevos no arrancó (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
    }
  }

  // Con el núcleo ya creado: las acciones (hasta entonces el canal contesta app_preparandose).
  function crearAccionesTati(carpetaBase) {
    try {
      tati.acciones = crearLasAcciones(carpetaBase);
    } catch (e) {
      log('error', `puente con TATI: las acciones no arrancaron (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
    }
  }

  // ---------- biblioteca de guías (<datos>\guias\) ----------

  // Lo de los enlaces va de uno en uno (el menú y las pendientes que ve el índice no se pisan). Las direcciones pendientes
  // se intentan una sola vez por sesión: una que falla no se repite sola (el menú «Actualizar los enlaces» sí la reintenta).
  const intentadas = new Set();
  let cadenaEnlaces = Promise.resolve();
  function enCola(trabajo) {
    const hecho = cadenaEnlaces.then(trabajo, trabajo);
    cadenaEnlaces = hecho.catch(() => {});
    return hecho;
  }
  const opcionesEnlace = () => ({ datos, fs, obtener: deps.obtenerPagina, ahora });

  // Lo llama el índice al acabar cada pasada: baja los .url y las líneas de enlaces.txt que aún no tienen copia. La copia
  // nueva la recoge la pasada siguiente. El registro solo lleva contadores.
  function bajarPendientes() {
    return enCola(async () => {
      if (parado) return;
      let nuevas;
      let rechazadas;
      try {
        const revision = revisarEnlaces({ datos, fs });
        nuevas = revision.pendientes.filter((d) => !intentadas.has(d));
        rechazadas = revision.rechazadas.filter((d) => !intentadas.has(d));
      } catch (e) {
        log('aviso', `biblioteca: no se pudieron mirar los enlaces pendientes (${e?.code || 'ERROR'})`);
        return;
      }
      if (nuevas.length === 0 && rechazadas.length === 0) return;
      for (const d of rechazadas) intentadas.add(d); // una rechazada se cuenta (y se avisa) una sola vez por sesión
      let bien = 0;
      let mal = 0;
      let rechazados = rechazadas.length;
      for (const direccion of nuevas) {
        if (parado) break;
        intentadas.add(direccion);
        try {
          const r = await anadirEnlace(direccion, opcionesEnlace());
          if (r.ok) bien++; else if (esRechazo(r)) rechazados++; else mal++;
        } catch (e) {
          mal++;
          log('aviso', `biblioteca: un enlace pendiente falló (${e?.code || 'ERROR'})`);
        }
      }
      log('info', `biblioteca: enlaces pendientes bajados ${bien}, fallidos ${mal}, rechazados ${rechazados}`);
      // un globo por tanda, sin la dirección
      if (rechazados > 0 && !parado) app.bandeja?.globo(T.titulo, T.enlacesRechazados(rechazados));
    });
  }

  // Primera copia desde el juego (solo copia), índice en segundo plano y vigilancia de la carpeta. Nada de esto hace esperar
  // al buzón de estado, y un fallo solo deja el código en el registro (nunca nombres de archivo ni direcciones).
  function iniciarBiblioteca(addonsDir) {
    try {
      app.biblioteca = (deps.crearIndice || crearIndice)({
        datos, fs, base: () => app.nucleo.baseActual(), alTerminar: () => { bajarPendientes().catch(() => {}); },
      });
      // La carpeta tiene que existir antes de vigilarla (fs.watch da ENOENT y, en la primera instalación, solo quedaría el repaso)
      fs.mkdirSync(join(datos, CARPETA_GUIAS), { recursive: true });
      app.vigilancia = app.biblioteca.vigilar(deps.vigilarBiblioteca || {});
    } catch (e) {
      log('error', `biblioteca: no arrancó (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
      return;
    }
    (async () => {
      try {
        await (deps.copiarDelJuego || copiarDelJuego)({ datos, addonsDir, fs });
      } catch (e) {
        log('aviso', `biblioteca: la copia del juego falló (${e?.code || 'ERROR'})`);
      }
      if (parado) return;
      try {
        await app.biblioteca.actualizar();
      } catch (e) {
        log('aviso', `biblioteca: el índice falló (${e?.code || 'ERROR'})`);
      }
    })();
  }

  // Desde el menú: abre <datos>\guias (la crea si falta, para que el Explorador no se quede sin carpeta).
  function abrirGuias() {
    const carpeta = join(datos, CARPETA_GUIAS);
    try {
      fs.mkdirSync(carpeta, { recursive: true });
    } catch (e) {
      log('aviso', `biblioteca: no se pudo crear la carpeta de guías (${e?.code || 'ERROR'})`);
    }
    (deps.abrir || abrirRuta)(carpeta);
  }

  // Desde el menú: la primera dirección de internet del portapapeles se baja y se guarda como copia en la biblioteca.
  function anadirDelPortapapeles() {
    return enCola(async () => {
      let texto = null;
      try {
        texto = await (deps.leerPortapapeles || leerPortapapeles)();
      } catch {
        texto = null;
      }
      // la primera dirección, sin la puntuación que se pega al final («…/guia).», «…/guia,»)
      const direccion = typeof texto === 'string' ? /https?:\/\/[^\s<>"']+/i.exec(texto)?.[0]?.replace(/[.,;:!?)\]}>"']+$/, '') : undefined;
      if (!direccion) {
        app.bandeja?.globo(T.titulo, T.enlaceSinDireccion);
        return;
      }
      const r = await anadirEnlace(direccion, opcionesEnlace());
      if (r.ok) {
        log('info', 'biblioteca: enlace añadido desde el portapapeles');
        app.bandeja?.globo(T.titulo, T.enlaceAnadido(r.host));
      } else {
        log('aviso', `biblioteca: enlace del portapapeles no añadido (${r.motivo})`);
        app.bandeja?.globo(T.titulo, T.enlaceFallo[r.motivo] || T.enlaceFallo.conexion);
      }
    });
  }

  // Desde el menú: vuelve a bajar las copias que ya hay y baja las pendientes (también las que ya fallaron antes).
  function actualizarTodosLosEnlaces() {
    return enCola(async () => {
      let bajados = 0;
      let fallidos = 0;
      let rechazados = 0; // las copias y las líneas de la lista que no se bajan (red de casa o mal escritas)
      try {
        const viejas = await actualizarEnlaces(opcionesEnlace());
        bajados += viejas.bajados;
        fallidos += viejas.fallidos;
        rechazados += viejas.rechazados ?? 0;
      } catch (e) {
        log('aviso', `biblioteca: «Actualizar los enlaces» falló (${e?.code || 'ERROR'})`);
        app.bandeja?.globo(T.titulo, T.enlacesFallo);
        return;
      }
      let pendientes = [];
      try {
        const revision = revisarEnlaces({ datos, fs });
        pendientes = revision.pendientes;
        rechazados += revision.rechazadas.length;
      } catch (e) {
        log('aviso', `biblioteca: no se pudieron mirar los enlaces pendientes (${e?.code || 'ERROR'})`);
      }
      for (const direccion of pendientes) {
        if (parado) return;
        intentadas.add(direccion);
        const r = await anadirEnlace(direccion, opcionesEnlace());
        if (r.ok) bajados++; else if (esRechazo(r)) rechazados++; else fallidos++;
      }
      const hechos = bajados + fallidos === 0 ? '' : T.enlacesActualizados(bajados, fallidos);
      const avisoRechazados = rechazados > 0 ? T.enlacesRechazados(rechazados) : '';
      app.bandeja?.globo(T.titulo, [hechos, avisoRechazados].filter(Boolean).join(' ') || T.enlacesNinguno);
    });
  }

  // ---------- salir ----------

  function parar() {
    if (finParar) return finParar;
    parado = true;
    finParar = (async () => {
      for (const t of temporizadores) clearInterval(t);
      // S8: el canal de los relevos deja de atender (se espera la vuelta en curso, como mucho 2 s)
      if (tati?.correo) {
        try {
          await Promise.race([tati.correo.parar(), dormirSuelto(2000)]);
        } catch {
          // ya estaba parado
        }
      }
      try {
        app.comercio?.parar();
      } catch {
        // ya estaba parado
      }
      try {
        app.vigilancia?.();
      } catch {
        // ya estaba parada
      }
      for (const p of programados) {
        try {
          p.quitar(p.id);
        } catch {
          // ya no estaba
        }
      }
      try {
        app.captura?.parar();
      } catch {
        // ya no estaba
      }
      try {
        await app.timbres?.parar();
      } catch (e) {
        log('aviso', `timbres: no se pudieron parar del todo (${e?.code || 'ERROR'})`);
      }
      try {
        await app.bandeja?.parar();
      } catch {
        // el ayudante ya no estaba
      }
      try {
        await cerrojo.soltar();
      } catch (e) {
        log('aviso', `cerrojo: no se pudo soltar (${e?.code || 'ERROR'})`);
      }
      log('info', 'SnetForever se cierra');
      resolverTerminado();
    })();
    return finParar;
  }

  // ---------- puesta en marcha ----------

  // Espera a que la captura dé otro exe, a que pase `ms` o a que la app se cierre.
  function esperarCambio(ms) {
    return new Promise<void>((resolver) => {
      const t = setTimeout(fin, ms);
      function fin() {
        clearTimeout(t);
        estado.avisarExe = null;
        resolver();
      }
      estado.avisarExe = fin;
      terminado.then(fin);
    });
  }

  async function iniciar() {
    // La bandeja, para que se vea enseguida.
    if (!banderas.has('--sin-bandeja')) {
      app.bandeja = (deps.lanzarBandeja || lanzarBandejaReal)({ alMenu, textos: T.menu });
      refrescar();
      if (estado.fallida) globoUnaVez('fallida', T.globoFallida(estado.fallida));
      mirarInicio().catch(() => {});
    }

    // S8: lo que dejaron los relevos que ya no viven, el canal de los relevos (antes de saber dónde está el juego) y la
    // primera pregunta a TATI (solo con su cerebro elegido).
    if (tati) {
      apartarRelevosMuertos();
      atenderRelevos();
      comprobarTati().catch(() => {});
    }

    // Los motores, desde ya (la bandeja los enseña aunque aún no se sepa dónde está el juego). Su resultado es el que se
    // publica en el buzón: no se vuelve a comprobar.
    const primera = comprobarMotores();

    // La captura: antes de buscar los AddOns, porque puede dar el exe del juego.
    if (!banderas.has('--sin-captura')) {
      app.captura = (deps.lanzarCaptura || lanzarCapturaReal)({
        alImagen: (img) => app.lector?.alImagen(img),
        alEstado: (m) => {
          if (m && m.juego === 'si' && typeof m.exe === 'string' && m.exe) {
            const nuevo = m.exe !== estado.exe;
            estado.exe = m.exe;
            if (nuevo) estado.avisarExe?.();
          }
          if (m && m.juego === 'no') reintentarAplazado();
          refrescar();
        },
      });
      refrescar();
    }

    // La carpeta de AddOns y su preparación. Si no se sabe dónde está, o la que da el exe de la captura no vale, se vuelve a
    // intentar cuando la captura dé otro exe o cada 60 s. Tarea 13: también por el registro y los procesos (con el juego
    // cerrado), y antes de preparar, R17 (lo que falte, desde <instalación>\paquetes).
    let addonsDir = null;
    let config: { base?: any; } = {};
    let resumen;
    for (;;) {
      const exeAntes = estado.exe;
      config = leerConfig(entorno);
      addonsDir = carpetaAddOns({ config, exeJuego: estado.exe, env: entorno, existe: deps.existe });
      if (!addonsDir) addonsDir = await buscarJuego(config);
      if (parado) return;
      if (addonsDir) {
        estado.addonsDir = addonsDir;
        await instalarLoQueFalta();
        if (parado) return;
        try {
          resumen = preparar(addonsDir);
          break;
        } catch (e) {
          estado.extra = T.addonsInvalidos;
          log('error', `prepararAddOns: ${e?.code || 'ERROR'}`);
        }
      } else {
        estado.extra = T.esperandoAddons;
        log('aviso', 'no se sabe la carpeta de AddOns');
      }
      refrescar();
      // Si la captura dio otro exe mientras se preguntaba al registro o se instalaba (R17), se prueba ya con él.
      if (estado.exe !== exeAntes) continue;
      await esperarCambio(periodos.reintentoAddons);
      if (parado) return;
    }
    estado.extra = null;
    estado.addonsPreparados = addonsDir;
    avisarPreparacion(resumen); // lo aplazado se hace en reintentarAplazado, con el siguiente «juego: no» de la captura
    refrescar();
    if (parado) return;

    // Tarea 13: el actualizador y los avisos de fallo que quedan por mandar.
    crearElActualizador(addonsDir);
    contarAvisos();
    if (parado) return;

    // Comercio (Task 8): en segundo plano, sin hacer esperar al buzón de estado.
    iniciarComercio(addonsDir).catch((e) => log('error', `comercio: no arrancó (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`));

    // Ronda 1 del lote B: datos a medias (faltan archivos de X-SNF-App, o datos nuevos sin esa línea). La base se usa
    // igual, pero lo apunta el registro (solo nombres de archivo, sin rutas) y lo dicen la bandeja y un globo.
    const avisarBase = (avisos) => {
      if (!Array.isArray(avisos) || avisos.length === 0) return;
      for (const a of avisos) {
        if (a.codigo === 'FALTAN_ARCHIVOS_APP') log('aviso', `base: faltan archivos de la app (${a.archivos.join(', ')})`);
        else log('aviso', `base: ${a.codigo} (datos ${a.version ?? '?'})`);
      }
      if (estado.avisoBase) return;
      estado.avisoBase = T.baseIncompleta;
      app.bandeja?.globo(T.titulo, T.baseIncompleta);
      refrescar();
    };

    // La base, en segundo plano y con memoria: el núcleo la pide al crearse y la vuelve a pedir si falla.
    const carpetaBase = entorno.SNF_BASE || config.base || join(addonsDir, 'SnetForever_Misiones');
    const base = () => new Promise((resolver, rechazar) => {
      setImmediate(() => {
        try {
          const version = versionMisiones(); // la de los datos que se cargan (para no recargar dos veces la misma)
          const cargada = cargarBase(carpetaBase);
          if (estado.versionBase === null) estado.versionBase = version;
          avisarBase(cargada.avisos);
          resolver(cargada);
        } catch (e) {
          log('error', `la base no se pudo cargar (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
          rechazar(e);
        }
      });
    });

    // El núcleo (arranca los timbres de vida) y el estado en las 20 ranuras.
    app.timbres = crearTimbres(addonsDir, { raizVolumen: deps.raizVolumen });
    for (const a of app.timbres.avisos) log('aviso', `timbres: ${a.codigo} ${a.archivo}`);
    app.nucleo = crearNucleo({
      base, addonsDir, timbres: app.timbres, historial: crearHistorial(datos), datos, reloj: ahora, motor,
      comprobar: comprobadores, raizVolumen: deps.raizVolumen, misionesApi, comercioDatos: comercioParaIA,
      carpetaBase, herramientas: true, // tarea 14: con Claude, la IA pregunta con el servidor de guías
      // S8: el puente solo si se activó al arrancar (y mientras la config lo siga diciendo)
      puente: () => (tati ? puenteDe(leerConfig(entorno)) : { activo: false }),
      ...(tati ? { estadoJuego: tati.estadoJuego, cerebro: tati.cerebro } : {}),
    });
    if (tati) crearAccionesTati(carpetaBase);
    app.nucleo.alCambiar((e) => {
      if (e.seq !== estado.seqVisto) {
        if (estado.seqVisto !== undefined) estado.ultimaPregunta = ahora();
        estado.seqVisto = e.seq;
        refrescar();
      }
    });
    estado.seqVisto = app.nucleo.estado().seq;
    app.lector = crearLector({ nucleo: app.nucleo });

    // La biblioteca de guías: en segundo plano, sin hacer esperar al buzón de estado.
    iniciarBiblioteca(addonsDir);

    // La primera comprobación se publica una sola vez (aunque terminase antes o después de crear el núcleo).
    await primera;
    if (parado) return;
    await publicarPrimera();
  }

  // Si el arranque falla (también después de la bandeja), la bandeja lo dice en rojo: nunca se queda «lista» sin hacer
  // nada. Solo el código del error, como en el registro (ni mensajes ni rutas).
  const listo = iniciar().catch((e) => {
    const codigo = (e as NodeJS.ErrnoException)?.code || e?.name || 'Error';
    log('error', `arranque: ${codigo}`);
    estado.extra = T.arranqueFallo(codigo);
    refrescar();
  });

  temporizadores.push(setInterval(() => {
    comprobarMotores().catch(() => {});
    comprobarTati().catch(() => {}); // S8: con el cerebro TATI, también cada 30 minutos
    if (tati && !parado) apartarRelevosMuertos(); // revisión final (M2): los relevos que se cerraron entretanto
  }, periodos.motores));
  temporizadores.push(setInterval(refrescar, periodos.refresco));
  // Cada 2 s: `datos\salir.peticion` (la deja el instalador, `cerrar-app`) va a la cuarentena de datos y la app se cierra.
  temporizadores.push(setInterval(() => {
    if (parado || !fs.existsSync(peticion)) return;
    try {
      fs.renameSync(peticion, join(cuarentenaNueva(entorno), 'salir.peticion'));
    } catch (e) {
      log('aviso', `salir.peticion: no se pudo mover a la cuarentena (${e?.code || 'ERROR'})`);
    }
    parar().catch(() => {});
  }, periodos.peticion));

  // Task 8, ronda 1: la primera vez que arranca la app tras actualizarse a sí misma (previa.txt, que pone aplicarApp, es una
  // versión anterior a la que corre y todavía no se ha comprobado con esta), comprueba a los 10 s en vez de a los 120 s: lo que
  // la app anterior no sabía poner (el addon de comercio) llega cuanto antes. La marca va en la carpeta de datos.
  function esperaDeLaPrimeraComprobacion() {
    try {
      const previa = propia.leerVersion(join(instalacion, propia.PREVIA));
      if (previa === null || compararVersiones(previa, VERSION) >= 0) return periodos.primeraActualizacion;
      const marca = join(datos, 'actualizada-comprobada.txt');
      let vista = null;
      try {
        vista = fs.readFileSync(marca, 'utf8').trim();
      } catch {
        // sin marca: es la primera vez
      }
      if (vista === VERSION) return periodos.primeraActualizacion;
      // pisar la marca es seguro: solo guarda un número de versión, nada del jugador (y si se pierde, solo se comprueba pronto otra vez)
      fs.mkdirSync(datos, { recursive: true });
      fs.writeFileSync(marca, `${VERSION}
`, 'utf8');
      return periodos.primeraTrasActualizar;
    } catch {
      return periodos.primeraActualizacion;
    }
  }

  // Tarea 13: actualizaciones (a los 120 s y cada 24 h), aplicar y R17 (cada minuto) y avisos de fallo (cada 10 min).
  const programar = (id, quitar) => programados.push({ id, quitar });
  programar(temporizar.despues(() => {
    if (parado) return;
    buscarSola();
    programar(temporizar.cada(buscarSola, periodos.actualizacion), temporizar.quitarCada);
  }, esperaDeLaPrimeraComprobacion()), temporizar.quitarDespues);
  programar(temporizar.cada(() => cadaMinuto().catch(() => {}), periodos.aplicar), temporizar.quitarCada);
  programar(temporizar.cada(() => avisosCadaRato().catch(() => {}), periodos.avisos), temporizar.quitarCada);

  return {
    parar,
    terminado,
    listo,
    get nucleo() {
      return app.nucleo;
    },
    get biblioteca() {
      return app.biblioteca;
    },
    get cerrada() {
      return parado;
    },
  };
}

// ---------- como programa ----------

async function main() {
  const app: Awaited<ReturnType<typeof arrancar>> & { codigo?: number } = await arrancar(process.argv.slice(2), process.env);
  if (app.codigo !== undefined) {
    process.exitCode = app.codigo;
    return;
  }
  const cerrar = () => {
    app.parar().finally(() => process.exit(0));
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
  process.on('SIGHUP', cerrar);
  process.on('SIGBREAK', cerrar); // Ctrl+Pausa y cierre de la consola en Windows
  process.on('uncaughtException', (e) => {
    log('error', `fallo no previsto (${(e as NodeJS.ErrnoException)?.code || e?.name || 'Error'})`);
    app.parar().finally(() => process.exit(1));
  });
  await app.terminado;
  process.exit(0);
}

const esPrincipal = () => {
  try {
    return process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
};
if (esPrincipal()) main();
