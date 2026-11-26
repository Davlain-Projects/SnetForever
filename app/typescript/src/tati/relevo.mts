// Relevo MCP de SnetForever para TATI (S7). TATI lo arranca desde la carpeta del complemento (complemento.mjs), por stdio:
//
//   node ./relevo.mjs        con SNF_DATOS (la carpeta de datos de la app) y SNF_LANZADOR (el SnetForever.vbs) en el entorno
//
// Solo corre desde esa carpeta: importa `./correo.mjs` y `./protocolo.mjs`, que allí están al lado (en la app son
// tati/correo.mjs y herramientas/protocolo.mjs, copiados tal cual), y lee `herramientas.json` (las catorce definiciones),
// `.codex-plugin/plugin.json` (la versión) e `instrucciones.txt` (S9: las reglas que da en su respuesta a `initialize`;
// sin él, sin ellas). Las herramientas viven en la app: cada `tools/call` se pasa tal cual por el
// canal de archivos `<SNF_DATOS>\puente-tati\relevo-<pid>` con `pedir` ({tipo: 'herramienta', nombre, argumentos}; acuse
// en 5 s, resultado en 60 s) y lo que contesta la app vuelve a TATI como resultado:
//   - `{estado: 'hecho', resultado}` -> `resultado` tal cual (también los `{error: …}` de acciones.mjs); sin `resultado`,
//     el sobre sin `v`, `id`, `cuando` ni `estado`;
//   - sin acuse, o si no se puede escribir el pedido -> `{error: 'app_no_responde'}` (sin acuse, antes intenta abrir la
//     app, ver abajo); acuse sin resultado ->
//     `{error: 'app_tiempo'}`; cualquier otro error de la app o del canal -> `{error: 'app_fallo'}`.
// Sin acuse y con el pid de `<SNF_DATOS>\app.lock` muerto (o sin cerrojo), lanza una sola vez por relevo
// `%SystemRoot%\System32\wscript.exe "<SNF_LANZADOR>"` (separado y sin ventana; solo si SNF_LANZADOR es una ruta con
// unidad a un .vbs, sin comillas). Desde ese momento y durante 60 s como mucho: espera a que el cerrojo tenga un pid
// vivo y repite la llamada (intentos de 5 s de acuse) hasta que la app la acuse; si no llega, `app_no_responde`.
//
// Solo para las pruebas (test/tati-complemento.test.js); en producción no existen (complemento.mjs no las pone en
// .mcp.json) y todo es como arriba:
//   SNF_PRUEBA_LANZADOR   la ruta de un script de node (el lanzador falso): en vez de wscript.exe, el relevo lanza
//                         `process.execPath` con [<script>, <SNF_LANZADOR>], igual (sin shell, sin ventana, separado) y
//                         solo si SNF_LANZADOR pasa la misma validación. Así ninguna prueba abre programas del sistema.
//   SNF_PRUEBA_ESPERA_MS  un entero de 1 a 60000: el plazo de la apertura en vez de 60 s (solo puede acortarlo), para
//                         no esperar un minuto de verdad. Cualquier otro valor, 60 s.
//
// Cada intento es un `pedir` nuevo (otro `id`) con su propio `hasta` (el plazo del acuse, correo.mjs): un pedido del que
// el relevo ya se rindió la app no lo ejecuta (lo contesta `caducado`), así que una acción no llega tarde ni se repite
// por los reintentos. Queda una ventana de milisegundos: si la app lo acusa justo en `hasta` y el relevo lo da por
// perdido en ese mismo instante, la llamada se puede ejecutar dos veces (caso raro, aceptado).
//
// Lee un mensaje JSON-RPC por línea (salta las líneas en blanco y quita el \r) y contesta en orden, como
// herramientas/servidor.mjs, sin límite de llamadas. No escribe nada en disco salvo los dos archivos de su canal (por
// `pedir`) ni registro alguno; en stderr, solo una línea fija si no puede arrancar (sale con 2).
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { crearServidorMcp } from './protocolo.mjs';
import { pedir } from './correo.mjs';

const CARPETA_PUENTE = 'puente-tati'; // la de tati/config.mjs (CARPETA_PUENTE)
const ACUSE_MS = 5000;
const TIEMPO_MS = 60_000;
const ESPERA_APP_MS = 60_000;
const CADA_CERROJO_MS = 250;
const SOBRE = new Set(['v', 'id', 'cuando', 'estado']);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function leerJson(nombre) {
  return JSON.parse(readFileSync(new URL(nombre, import.meta.url), 'utf8'));
}

function definiciones() {
  const lista = leerJson('./herramientas.json');
  if (!Array.isArray(lista)) throw new Error('herramientas.json no es una lista');
  return lista.filter((h) => h && typeof h.nombre === 'string' && h.nombre !== '');
}

// S9: las reglas para la respuesta a `initialize` (`instructions`), tal cual las dejó complemento.mjs en
// `instrucciones.txt`. Sin el archivo (o vacío o ilegible), sin instrucciones: el relevo no pone texto suyo.
function instrucciones() {
  try {
    const t = readFileSync(new URL('./instrucciones.txt', import.meta.url), 'utf8');
    return t !== '' ? t : undefined;
  } catch {
    return undefined;
  }
}

function version() {
  try {
    const v = leerJson('./.codex-plugin/plugin.json').version;
    return typeof v === 'string' ? v : '0';
  } catch {
    return '0';
  }
}

// ¿Vive el pid del cerrojo de la app? `process.kill(pid, 0)` no mata nada: solo pregunta. EPERM = existe (de otro usuario).
function pidVivo(datos) {
  let pid;
  try {
    pid = JSON.parse(readFileSync(join(datos, 'app.lock'), 'utf8'))?.pid;
  } catch {
    return false; // sin cerrojo (o a medias): la app no está
  }
  if (!Number.isInteger(pid) || pid <= 0) return false; // soltado
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
}

// Solo una ruta con unidad (C:\...\algo.vbs): ni rutas de red (\\servidor\...), ni relativas, ni comillas.
const LANZADOR = /^[A-Za-z]:\\[^"]+\.vbs$/i;

function lanzadorValido(lanzador) {
  return typeof lanzador === 'string' && LANZADOR.test(lanzador);
}

// El programa y sus argumentos para abrir la app: wscript.exe de System32 con la ruta del .vbs como único argumento o,
// en las pruebas (SNF_PRUEBA_LANZADOR), node con el lanzador falso y esa misma ruta.
function orden(lanzador): [string, string[]] {
  const falso = process.env.SNF_PRUEBA_LANZADOR;
  if (typeof falso === 'string' && falso !== '') return [process.execPath, [falso, lanzador]];
  const raiz = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
  return [join(raiz, 'System32', 'wscript.exe'), [lanzador]];
}

// El plazo de la apertura: 60 s, o SNF_PRUEBA_ESPERA_MS en las pruebas si es un entero de 1 a 60000.
function esperaApp() {
  const texto = process.env.SNF_PRUEBA_ESPERA_MS;
  if (typeof texto !== 'string' || !/^\d+$/.test(texto)) return ESPERA_APP_MS;
  const ms = Number(texto);
  return ms >= 1 && ms <= ESPERA_APP_MS ? ms : ESPERA_APP_MS;
}

// Abre la app con su lanzador (orden()), sin shell, sin ventana y separado (el relevo no la espera). → true si se pudo
// lanzar.
function lanzarApp(lanzador) {
  if (!lanzadorValido(lanzador)) return false;
  try {
    const [programa, argumentos] = orden(lanzador);
    const hijo = spawn(programa, argumentos, {
      shell: false, windowsHide: true, detached: true, stdio: 'ignore',
    });
    hijo.on('error', () => {});
    hijo.unref();
    return true;
  } catch {
    return false;
  }
}

function traducir(r) {
  if (r && r.estado === 'hecho') {
    if ('resultado' in r) return r.resultado;
    return Object.fromEntries(Object.entries(r).filter(([k]) => !SOBRE.has(k)));
  }
  if (r && r.tipo === 'sin_acuse') return { error: 'app_no_responde' };
  if (r && r.tipo === 'tiempo') return { error: 'app_tiempo' };
  return { error: 'app_fallo' };
}

function crearRelevo({ datos, lanzador }) {
  const carpeta = join(datos, CARPETA_PUENTE);
  const canal = `relevo-${process.pid}`;
  let lanzada = false;

  async function pedirApp(nombre, argumentos, acuseMs = ACUSE_MS) {
    try {
      return await pedir(carpeta, canal, { tipo: 'herramienta', nombre, argumentos }, { acuseMs, tiempoMs: TIEMPO_MS });
    } catch {
      return { estado: 'error', tipo: 'sin_canal' }; // no se pudo escribir el pedido: abrir la app no lo arreglaría
    }
  }

  const final = (r) => (r.tipo === 'sin_canal' ? { error: 'app_no_responde' } : traducir(r));

  async function llamar(nombre, argumentos) {
    const r = await pedirApp(nombre, argumentos);
    if (r.tipo !== 'sin_acuse') return final(r);
    if (lanzada || pidVivo(datos)) return final(r);
    lanzada = true; // una vez por relevo, se pueda o no
    if (!lanzarApp(lanzador)) return final(r);
    // La app recién abierta puede tardar en atender el canal después de tomar el cerrojo: con el pid vivo se repite la
    // llamada (intentos de 5 s de acuse) hasta que llegue un acuse, todo dentro de los 60 s desde que se lanzó.
    const limite = Date.now() + esperaApp();
    for (;;) {
      const queda = limite - Date.now();
      if (queda <= 0) return { error: 'app_no_responde' };
      if (!pidVivo(datos)) {
        await dormir(Math.min(CADA_CERROJO_MS, queda));
        continue;
      }
      const otra = await pedirApp(nombre, argumentos, Math.min(ACUSE_MS, queda));
      if (otra.tipo !== 'sin_acuse') return final(otra);
    }
  }

  return { llamar };
}

function arrancar() {
  const datos = process.env.SNF_DATOS;
  if (typeof datos !== 'string' || datos === '') {
    process.stderr.write('Falta SNF_DATOS: el relevo de SnetForever no puede arrancar.\n');
    process.exitCode = 2;
    return;
  }
  let lista;
  try {
    lista = definiciones();
  } catch {
    process.stderr.write('No se pudo leer herramientas.json: el relevo de SnetForever no puede arrancar.\n');
    process.exitCode = 2;
    return;
  }
  const relevo = crearRelevo({ datos, lanzador: process.env.SNF_LANZADOR });
  const herramientas = lista.map(({ nombre, descripcion, esquema }) => ({
    nombre,
    descripcion,
    esquema,
    ejecutar: (args) => relevo.llamar(nombre, args),
  }));
  const servidor = crearServidorMcp({
    nombre: 'snetforever', version: version(), herramientas, instrucciones: instrucciones(), maxLlamadas: Infinity,
  });
  process.stdout.on('error', () => process.exit(0)); // TATI cerró la tubería: no hay a quién contestar
  const lineas = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let cola = Promise.resolve();
  lineas.on('line', (cruda) => {
    const linea = cruda.endsWith('\r') ? cruda.slice(0, -1) : cruda;
    if (linea.trim() === '') return;
    cola = cola.then(async () => {
      let respuesta;
      try {
        respuesta = await servidor.manejar(linea);
      } catch {
        respuesta = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Error interno.' } });
      }
      if (respuesta !== null) process.stdout.write(respuesta + '\n');
    });
  });
}

arrancar();
