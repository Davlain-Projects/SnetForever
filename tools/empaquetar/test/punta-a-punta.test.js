// Prueba de punta a punta sin el juego (fase 5, tarea 17): publicar, instalar, actualizar, reparar y desinstalar con las
// piezas de verdad de las tareas 3 a 16, todo en carpetas temporales.
//
// - Las publicaciones salen de test/fixtures/repo-mini con `publicar` (tarea 15) y una clave temporal (crearClave con
//   SNF_FIRMA_DIR=<tmp>\fírma, DPAPI): nunca se toca la clave de verdad. Por eso todo esto solo corre en Windows.
// - La instalación es `prepararRaiz` (tarea 16) copiada a `<tmp>\Programs\SnetForever`, con un unins000.exe vacío (el de
//   Inno). El node.exe es falso (10 bytes): nada lo ejecuta.
// - El juego es falso: `<tmp>\Juegos Ñ\World of Warcraft\_forever_` con un Wow.exe vacío, SnetForever 0.4.0 y RXPGuides;
//   si está abierto o no lo dice una función de la prueba (nunca se mira el juego de verdad).
// - Las actualizaciones las sirve src/simular-actualizacion.mjs, la única pieza con un servidor (en 127.0.0.1 y solo
//   mientras dura cada simulación). Aquí no hay ningún servidor ni ningún módulo de red: la regla de cumplimiento lo vigila.
// - SNF_DATOS, SNF_CUARENTENA y SNF_INSTALACION van siempre a carpetas temporales: nunca la carpeta de datos de verdad ni
//   E:\_CUARENTENA.
// Las pruebas van en fila y cada una sigue donde lo dejó la anterior.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publicar } from '../src/publicar.mjs';
import { prepararRaiz } from '../src/instalador.mjs';
import { crearClave, clavePublica } from '../src/firma/clave.mjs';
import { entornoDelPrograma, principal, simularActualizacion } from '../src/simular-actualizacion.mjs';
import { VERSION } from '../../../app/src/version.mjs';
import { ejecutarOrden } from '../../../app/src/instalador/cli.mjs';
import { MARCA_ROTO, instalarComponentes } from '../../../app/src/instalador/componentes.mjs';
import { aplicarApp } from '../../../app/src/actualizar/propia.mjs';
import { RANURAS } from '../../../app/src/buzon.mjs';
import { POWERSHELL } from '../../../app/src/captura.mjs';
import { cuarentenaComponentes } from '../../../app/src/rutas.mjs';

const EMPAQUETAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_MINI = join(EMPAQUETAR, 'test', 'fixtures', 'repo-mini');
const SIMULADOR = join(EMPAQUETAR, 'src', 'simular-actualizacion.mjs');
const SOLO_WINDOWS = { skip: process.platform !== 'win32' };
const RANURA = /^SnetForever_R\d{3}$/;
const ESPERA = 10; // ms entre vueltas del simulador (de verdad son 5 s)

// Las cuatro publicaciones del recorrido, cada una más nueva que la anterior.
const P1 = { publicacion: 'v0.5.0-2026.11.11.1', ahora: new Date('2026-11-10T10:00:00.000Z') };
const P2 = { publicacion: 'v0.5.0-2026.11.11.2', ahora: new Date('2026-11-10T11:00:00.000Z'), version: { addon: '0.5.0.1' } };
const P3 = { publicacion: 'v0.5.0-2026.11.11.3', ahora: new Date('2026-11-10T12:00:00.000Z'), version: { addon: '0.5.0.2' } };
const P4 = { publicacion: 'v0.5.1-2026.11.11.4', ahora: new Date('2026-11-10T13:00:00.000Z'), version: { addon: '0.5.0.2' } };

const COPIA_ENV = { ...process.env };
let pc = null; // todo lo del recorrido (ver before)
const cuentas = []; // [paso, archivos] de la instalación, AddOns y las cuarentenas: nunca baja
const simulaciones = []; // el resultado de cada simulación (peticiones y URL), para la última prueba

// ---------- ayudas ----------

// Copia una carpeta entera. No se usa cpSync: en Node 24.14 estropea en Windows los destinos con tildes.
function copiar(origen, destino) {
  mkdirSync(destino, { recursive: true });
  for (const nombre of readdirSync(origen)) {
    const de = join(origen, nombre);
    if (statSync(de).isDirectory()) copiar(de, join(destino, nombre));
    else writeFileSync(join(destino, nombre), readFileSync(de));
  }
}

function arbolDe(raiz, archivos) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const final = join(raiz, ...ruta.split('/'));
    mkdirSync(dirname(final), { recursive: true });
    writeFileSync(final, contenido);
  }
}

const sha = (b) => createHash('sha256').update(b).digest('hex');

// {ruta relativa: sha256} de todos los archivos bajo `dir` (sin seguir enlaces); {} si no existe.
function huella(dir, base = dir, salida = {}) {
  if (!existsSync(dir)) return salida;
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    const info = lstatSync(ruta);
    if (info.isDirectory()) huella(ruta, base, salida);
    else salida[relative(base, ruta)] = sha(readFileSync(ruta));
  }
  return salida;
}

// Todas las rutas de archivos bajo `dir` que se llaman `nombre` (sin distinguir mayúsculas).
function buscar(dir, nombre, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) buscar(ruta, nombre, salida);
    else if (e.name.toLowerCase() === nombre.toLowerCase()) salida.push(ruta);
  }
  return salida;
}

// Los archivos de la instalación, de AddOns y de las cuarentenas (la de los componentes y la de datos):
// {ruta absoluta: sha256}.
function archivosVigilados() {
  const raices = [pc.instalacion, pc.addons, pc.cuarentena, join(pc.datos, 'cuarentena')];
  return Object.assign({}, ...raices.map((r) => Object.fromEntries(Object.entries(huella(r)).map(([rel, h]) => [join(r, rel), h]))));
}

// Cada contenido (sha256) que se ha visto alguna vez, con la primera ruta en la que se vio.
const vistos = new Map();

// Apunta cuántos archivos hay ahora y comprueba que no son menos que la vez anterior y que cada contenido visto antes
// sigue en algún sitio (en su lugar o en la cuarentena): un archivo borrado y otro creado a la vez no pasan.
function apuntarCuenta(paso) {
  const ahora = archivosVigilados();
  const n = Object.keys(ahora).length;
  const anterior = cuentas.at(-1);
  cuentas.push([paso, n]);
  if (anterior) assert.ok(n >= anterior[1], `tras «${paso}» hay ${n} archivos y antes («${anterior[0]}») había ${anterior[1]}`);
  const hay = new Set(Object.values(ahora));
  const perdidos = [...vistos].filter(([h]) => !hay.has(h)).map(([, ruta]) => ruta);
  assert.deepEqual(perdidos, [], `tras «${paso}» falta el contenido de archivos que ya estaban`);
  for (const [ruta, h] of Object.entries(ahora)) if (!vistos.has(h)) vistos.set(h, ruta);
}

const versionToc = (carpeta) => {
  const toc = join(pc.addons, carpeta, `${carpeta}.toc`);
  return existsSync(toc) ? /^## Version: (.+?)\r?$/m.exec(readFileSync(toc, 'utf8'))?.[1] ?? null : null;
};
const ranuras = () => readdirSync(pc.addons).filter((x) => RANURA.test(x));
const leerTxt = (nombre) => readFileSync(join(pc.instalacion, nombre), 'utf8').trim();

// Publica `p` desde `repo` con la clave temporal. La copia temporal del addon (con version.addon) se quita al acabar.
function publicarP(p, repo = pc.repo) {
  const r = publicar({
    raiz: repo, salida: pc.publicaciones, comprobarGit: false, env: pc.envFirma, publicacion: p.publicacion, ahora: p.ahora,
    claveApp: pc.publica, appConoceComercio: '0.5.0', sinPuente: true, // repo-mini lleva la app 0.5.0; el orden de firma no se prueba aquí
    ...(p.version ? { version: p.version } : {}),
  });
  if (r.copiaTemporal) pc.temporales.push(r.copiaTemporal);
  return r.carpeta;
}

// El juego falso para la CLI del instalador: siempre cerrado (procesos: []), sin registro ni unidades.
const JUEGO_CERRADO = { consultar: async () => [] };

// Una simulación con lo de este PC; `opciones` cambia o añade lo que haga falta. Guarda el resultado para la última prueba.
async function simular(publicacion, opciones = {}) {
  const r = await simularActualizacion({
    publicacion, addons: pc.addons, env: pc.env, clavePublica: pc.publica, juegoAbierto: async () => false,
    intervalo: ESPERA, maxVueltas: 5, ...opciones,
  });
  simulaciones.push(r);
  return r;
}

const paso = (r, vuelta, nombre) => r.pasos.find((p) => p.vuelta === vuelta && p.paso === nombre);

// ---------- el PC de prueba ----------

before(() => {
  if (process.platform !== 'win32') return;
  const base = mkdtempSync(join(tmpdir(), 'snf-punta-'));
  const firma = join(base, 'fírma');
  crearClave({ env: { SNF_FIRMA_DIR: firma } });
  const cuarentena = join(base, 'Cuarentena Ñ');
  const datos = join(base, 'Datos Ñ');
  const instalacion = join(base, 'Programs', 'SnetForever');
  const repo = join(base, 'Repo Ñandú');
  copiar(REPO_MINI, repo);
  // el registro de la app (registro.mjs) usa process.env: nunca la carpeta de datos de verdad
  process.env.SNF_DATOS = datos;
  pc = {
    base, repo, datos, cuarentena, instalacion, temporales: [],
    publicaciones: join(base, 'publicaciones'),
    envFirma: { SNF_FIRMA_DIR: firma, SNF_CUARENTENA: join(base, 'cuarentena de publicar') },
    publica: clavePublica({ env: { SNF_FIRMA_DIR: firma } }),
    env: { SNF_DATOS: datos, SNF_CUARENTENA: cuarentena, SNF_INSTALACION: instalacion, SNF_IDIOMA: 'es' },
  };
  // resto de I1: la app que se publica lleva la clave temporal, como la llevará la de verdad (prepararRaiz lo exige)
  const claveApp = join(repo, 'app', 'src', 'actualizar', 'clave-publica.mjs');
  mkdirSync(dirname(claveApp), { recursive: true });
  writeFileSync(claveApp, `export const CLAVE_PUBLICA = \`${pc.publica}\`;\n`);

  // la instalación (tarea 16) con la publicación v0.5.0, y el unins000.exe que pondría Inno
  pc.p1 = publicarP(P1);
  const nodeFalso = join(base, 'node.exe');
  writeFileSync(nodeFalso, 'no es node');
  prepararRaiz({
    env: pc.envFirma, publicacionDir: pc.p1, nodeExe: nodeFalso, salida: instalacion, comprobarNode: false,
    clavePublica: pc.publica, exigirLicenciaCompleta: false,
  });
  writeFileSync(join(instalacion, 'unins000.exe'), '');

  // el juego falso, con el SnetForever de antes y un addon ajeno
  pc.juego = join(base, 'Juegos Ñ', 'World of Warcraft', '_forever_');
  pc.addons = join(pc.juego, 'Interface', 'AddOns');
  arbolDe(pc.juego, { 'Wow.exe': '' });
  arbolDe(pc.addons, {
    'SnetForever/SnetForever.toc': '## Interface: 16001\n## Title: SnetForever\n## Version: 0.4.0\n\nnucleo.lua\n',
    'SnetForever/nucleo.lua': 'SnetForever = {VERSION = "0.4.0"}\n',
    'RXPGuides/RXPGuides.toc': '## Title: RXP\n',
    'RXPGuides/x.lua': '-- de otro\n',
  });
  pc.rxp = huella(join(pc.addons, 'RXPGuides'));
});

after(() => {
  for (const k of Object.keys(process.env)) if (!(k in COPIA_ENV)) delete process.env[k];
  Object.assign(process.env, COPIA_ENV);
  if (!pc) return;
  for (const t of pc.temporales) rmSync(t, { recursive: true, force: true });
  rmSync(pc.base, { recursive: true, force: true });
});

// ---------- el recorrido ----------

test('1. instalar (CLI del instalador) con la v0.5.0: el addon, los datos y las ranuras; RXPGuides igual y la 0.4.0 en la cuarentena', SOLO_WINDOWS, async () => {
  apuntarCuenta('antes de instalar');
  const { codigoSalida, resultado } = await ejecutarOrden(
    ['instalar', '--addons', pc.addons, '--paquetes', join(pc.instalacion, 'paquetes'), '--idioma', 'es'],
    { env: pc.env, clavePublica: pc.publica, juego: JUEGO_CERRADO },
  );
  assert.equal(codigoSalida, 0, JSON.stringify(resultado));
  assert.deepEqual(resultado.instalados, ['addon', 'rutas', 'misiones', 'comercio']);
  assert.equal(versionToc('SnetForever'), '0.5.0');
  assert.equal(versionToc('SnetForever_Rutas'), '2026.11.11.1');
  assert.equal(versionToc('SnetForever_Misiones'), '2026.11.11.1');
  assert.equal(versionToc('SnetForever_Comercio'), '0.5.3', 'Task 8: el instalador pone también SnetForever_Comercio, con la versión de su .toc');
  assert.equal(ranuras().length, RANURAS);
  assert.deepEqual(huella(join(pc.addons, 'RXPGuides')), pc.rxp);
  const viejos = buscar(pc.cuarentena, 'SnetForever.toc').filter((r) => /## Version: 0\.4\.0/.test(readFileSync(r, 'utf8')));
  assert.equal(viejos.length, 1, 'el SnetForever 0.4.0 tiene que estar en la cuarentena');
  assert.ok(existsSync(join(dirname(viejos[0]), 'nucleo.lua')));
  apuntarCuenta('instalar');
});

test('2. la 0.5.0.1 servida por el simulador: con el juego abierto espera; al cerrarlo se aplica y el .toc dice 0.5.0.1', SOLO_WINDOWS, async () => {
  const p2 = publicarP(P2);
  const antes = huella(pc.addons);
  let abierto = true; // el juego está abierto en la primera vuelta y se cierra después
  let duranteLaEspera = null;
  const r = await simular(p2, {
    juegoAbierto: async () => abierto,
    escribir: (linea) => {
      const p = JSON.parse(linea);
      if (p.vuelta === 1 && p.paso === 'aplicar') {
        duranteLaEspera = huella(pc.addons);
        apuntarCuenta('0.5.0.1 con el juego abierto');
        abierto = false;
      }
    },
  });
  assert.equal(paso(r, 1, 'comprobar').estado, 'hay');
  assert.deepEqual(paso(r, 1, 'comprobar').lista.map((i) => [i.componente, i.de, i.a]), [['addon', '0.5.0', '0.5.0.1']]);
  assert.equal(paso(r, 1, 'descargar').estado, 'listo');
  assert.equal(paso(r, 1, 'aplicar').estado, 'esperando_juego');
  assert.deepEqual(duranteLaEspera, antes, 'con el juego abierto no cambia nada en AddOns');
  assert.equal(paso(r, 2, 'aplicar').estado, 'aplicado');
  assert.deepEqual(paso(r, 2, 'aplicar').aplicados, ['addon']);
  assert.equal(r.resultado, 'aplicado');
  assert.equal(r.pasos.length, 6, 'se para en cuanto se aplica');
  assert.equal(versionToc('SnetForever'), '0.5.0.1');
  assert.equal(versionToc('SnetForever_Rutas'), '2026.11.11.1');
  assert.equal(ranuras().length, RANURAS);
  assert.deepEqual(huella(join(pc.addons, 'RXPGuides')), pc.rxp);
  apuntarCuenta('0.5.0.1 aplicada');
});

test('3. el mismo simulador sirviendo un paquete con un byte cambiado: «hash», nada pendiente y AddOns no cambia', SOLO_WINDOWS, async () => {
  const p3 = publicarP(P3);
  pc.p3 = p3;
  const cambiada = join(pc.base, 'cambiada', P3.publicacion);
  copiar(p3, cambiada);
  const paquete = join(cambiada, 'SnetForever-addon-0.5.0.2.snfpaq');
  const bytes = readFileSync(paquete);
  bytes[Math.floor(bytes.length / 2)] ^= 0x01;
  writeFileSync(paquete, bytes);
  const antes = huella(pc.addons);

  const r = await simular(cambiada);
  assert.equal(paso(r, 1, 'comprobar').estado, 'hay');
  assert.deepEqual(paso(r, 1, 'descargar'), { vuelta: 1, paso: 'descargar', estado: 'error', codigo: 'hash' });
  assert.equal(paso(r, 1, 'aplicar').estado, 'nada');
  assert.equal(r.resultado, 'error');
  assert.equal(r.pasos.length, 3, 'un paquete que no cuadra no se reintenta en bucle');
  assert.deepEqual(huella(pc.addons), antes);
  const estado = JSON.parse(readFileSync(join(pc.datos, 'actualizacion.json'), 'utf8'));
  assert.equal(estado.pendiente, undefined);
  assert.equal(estado.ultimoError.codigo, 'hash');
  assert.equal(existsSync(join(pc.datos, 'actualizaciones', P3.publicacion)), false, 'no se guarda nada de lo que no cuadra');
  apuntarCuenta('paquete cambiado');
});

test('4. estado roto (Windows no deja deshacer un renombre) y reparación: la tanda se reinstala entera y la marca va a la cuarentena', SOLO_WINDOWS, async () => {
  // Las piezas de verdad, con un renombre que Windows «bloquea» (EBUSY) como haría un antivirus: el addon viejo sale de
  // AddOns, el nuevo no puede entrar y el viejo tampoco puede volver (estado roto, tarea 8). Mientras dura el primer
  // intento, Windows no deja poner nada en `AddOns\SnetForever` (sea cual sea el número de renombres o de reintentos);
  // en cuanto ese intento acaba, se desbloquea.
  const bloqueada = join(pc.addons, 'SnetForever').toLowerCase();
  let bloqueo = true;
  let bloqueados = 0;
  const renombrar = (de, a) => {
    if (bloqueo && a.toLowerCase() === bloqueada) {
      bloqueados += 1;
      throw Object.assign(new Error('EBUSY simulado'), { code: 'EBUSY' });
    }
    return renameSync(de, a);
  };
  const instalar = (dir, paquetes, opciones) => instalarComponentes(dir, paquetes, { ...opciones, renombrar, dormir: async () => {} });
  let enRoto = null;
  const r = await simular(pc.p3, {
    instalar,
    escribir: (linea) => {
      const p = JSON.parse(linea);
      if (p.vuelta === 1 && p.paso === 'aplicar') {
        enRoto = {
          marca: existsSync(join(pc.datos, MARCA_ROTO)),
          addon: existsSync(join(pc.addons, 'SnetForever')),
          rutas: versionToc('SnetForever_Rutas'),
        };
        apuntarCuenta('estado roto');
        bloqueo = false;
      }
    },
  });
  assert.deepEqual(paso(r, 1, 'aplicar'), { vuelta: 1, paso: 'aplicar', estado: 'error', codigo: 'ocupado', roto: true });
  assert.deepEqual(enRoto, { marca: true, addon: false, rutas: '2026.11.11.1' }, 'el estado roto deja AddOns sin el addon y la marca puesta');
  assert.ok(bloqueados >= 2, 'se bloquearon el renombre del nuevo y el de deshacer');
  // la vuelta siguiente repara: la tanda que esperaba se reinstala entera
  assert.deepEqual(paso(r, 2, 'descargar'), { vuelta: 2, paso: 'descargar', estado: 'listo', roto: true });
  assert.equal(paso(r, 2, 'aplicar').estado, 'aplicado');
  assert.deepEqual(paso(r, 2, 'aplicar').aplicados, ['addon']);
  assert.equal(r.resultado, 'aplicado');
  assert.equal(versionToc('SnetForever'), '0.5.0.2');
  assert.equal(existsSync(join(pc.datos, MARCA_ROTO)), false, 'la marca ya no está en la carpeta de datos');
  assert.ok(buscar(pc.cuarentena, MARCA_ROTO).length >= 1, 'la marca se archiva en la cuarentena (no se borra)');
  // lo del intento roto (el 0.5.0.1 viejo y el 0.5.0.2 que no entró) tampoco se borra
  const tocs = buscar(pc.cuarentena, 'SnetForever.toc').map((t) => /## Version: (.+?)\r?$/m.exec(readFileSync(t, 'utf8'))?.[1]);
  assert.ok(tocs.includes('0.5.0.1') && tocs.includes('0.5.0.2'), `en la cuarentena: ${tocs.join(', ')}`);
  assert.equal(ranuras().length, RANURAS);
  assert.deepEqual(huella(join(pc.addons, 'RXPGuides')), pc.rxp);
  apuntarCuenta('reparado');
});

test('5. la app nueva (0.5.1) se aplica, no arranca y el arranque vuelve a la 0.5.0; después ya no se ofrece', SOLO_WINDOWS, async () => {
  // una copia del repositorio con la app 0.5.1, que sale con 1 al arrancar
  const repo = join(pc.base, 'Repo 0.5.1');
  copiar(pc.repo, repo);
  writeFileSync(join(repo, 'app', 'src', 'version.mjs'), 'export const VERSION = "0.5.1";\n');
  const pkg = JSON.parse(readFileSync(join(repo, 'app', 'package.json'), 'utf8'));
  writeFileSync(join(repo, 'app', 'package.json'), `${JSON.stringify({ ...pkg, version: '0.5.1' }, null, 2)}\n`);
  writeFileSync(join(repo, 'app', 'src', 'principal.mjs'), '// la 0.5.1 de prueba no arranca\nprocess.exit(1);\n');
  const p4 = publicarP(P4, repo);

  // la app que corre es la 0.5.0 de la instalación (aplicarApp lo comprueba con `aqui`)
  const conApp = {
    versionApp: '0.5.0',
    aplicarApp: async (buffer) => aplicarApp(buffer, {
      instalacion: pc.instalacion, cuarentena: () => cuarentenaComponentes({ env: pc.env }),
      aqui: join(pc.instalacion, 'app', '0.5.0', 'src', 'actualizar', 'propia.mjs'),
    }),
  };
  const r = await simular(p4, conApp);
  assert.deepEqual(paso(r, 1, 'comprobar').lista.map((i) => [i.componente, i.de, i.a]), [['app', '0.5.0', '0.5.1']]);
  assert.equal(paso(r, 1, 'aplicar').estado, 'aplicado');
  assert.deepEqual(paso(r, 1, 'aplicar').aplicados, ['app']);
  assert.equal(leerTxt('actual.txt'), '0.5.1');
  assert.equal(leerTxt('previa.txt'), '0.5.0');
  assert.ok(existsSync(join(pc.instalacion, 'app', '0.5.1', 'src', 'principal.mjs')));
  assert.ok(existsSync(join(pc.instalacion, 'app', '0.5.0', 'src', 'principal.mjs')), 'la 0.5.0 sigue en su carpeta');
  apuntarCuenta('app 0.5.1 aplicada');

  // el arranque de verdad ({app}\arranque.mjs, con el Node de las pruebas): la 0.5.1 sale con 1 y vuelve a la 0.5.0
  const arranque = spawnSync(process.execPath, [join(pc.instalacion, 'arranque.mjs')], {
    env: { ...process.env, ...pc.env, SNF_ARRANQUE_ESPERA: '20000' }, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  });
  assert.equal(arranque.status, 0, arranque.stderr);
  assert.equal(leerTxt('actual.txt'), '0.5.0');
  assert.equal(leerTxt('fallida.txt'), '0.5.1');
  assert.match(readFileSync(join(pc.datos, 'registro-arranque.log'), 'utf8'), /la 0\.5\.1 terminó con el código 1 .*se vuelve a la 0\.5\.0/);
  apuntarCuenta('vuelta atrás');

  // la misma publicación ya no vuelve a aplicar la 0.5.1 (fallida.txt)
  const otra = await simular(p4, conApp);
  assert.deepEqual(paso(otra, 1, 'comprobar').lista.map((i) => [i.componente, i.saltado]), [['app', 'fallida']]);
  assert.equal(paso(otra, 1, 'descargar').estado, 'nada');
  assert.equal(paso(otra, 1, 'aplicar').estado, 'nada');
  assert.equal(otra.resultado, 'nada');
  assert.equal(leerTxt('actual.txt'), '0.5.0');
  pc.p4 = p4;
  apuntarCuenta('la 0.5.1 no se repite');
});

test('6. el simulador como programa: escribe cada paso en una línea, solo pide a 127.0.0.1 y se cierra solo', SOLO_WINDOWS, () => {
  const pem = join(pc.base, 'clave-publica.pem');
  writeFileSync(pem, pc.publica);
  const r = spawnSync(process.execPath, [SIMULADOR, '--publicacion', pc.p4, '--addons', pc.addons, '--datos', pc.datos, '--clave', pem], {
    env: { ...process.env, ...pc.env }, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  });
  assert.equal(r.status, 0, r.stderr);
  const lineas = r.stdout.trim().split(/\r?\n/).map((l) => JSON.parse(l));
  // como programa, la app que corre es la de verdad (VERSION): la 0.5.1 de P4 solo es «hay» si es más nueva que ella
  // (con la app en 0.5.2, T18, ya no lo es); en los dos casos no se descarga ni se aplica nada
  const nueva = VERSION.split('.').map(Number).reduce((d, n, i) => d || (n - [0, 5, 1][i]), 0) < 0;
  assert.deepEqual(lineas.slice(0, 3).map((l) => [l.vuelta, l.paso, l.estado]),
    [[1, 'comprobar', nueva ? 'hay' : 'sin_novedades'], [1, 'descargar', 'nada'], [1, 'aplicar', 'nada']]);
  const fin = lineas.at(-1);
  assert.equal(fin.resultado, 'nada');
  assert.equal(fin.peticiones, 2, 'el manifiesto y su firma');
  assert.equal(fin.locales, true);
  assert.equal(lineas.length, 4);
  // sin --publicacion o --addons, sale con 2 sin levantar nada
  const mal = spawnSync(process.execPath, [SIMULADOR, '--addons', pc.addons], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
  assert.equal(mal.status, 2);
  assert.equal(mal.stdout, '');
  // ronda 1: sin --datos tampoco (nunca la carpeta de datos de verdad)
  const sinDatos = spawnSync(process.execPath, [SIMULADOR, '--publicacion', pc.p4, '--addons', pc.addons, '--clave', pem], {
    env: { ...process.env, ...pc.env }, encoding: 'utf8', timeout: 30_000, windowsHide: true,
  });
  assert.equal(sinDatos.status, 2, sinDatos.stdout);
  assert.equal(sinDatos.stdout, '');
  assert.match(sinDatos.stderr, /--datos/);
  apuntarCuenta('simulador como programa');
});

test('6b. el programa sin SNF_CUARENTENA: lo sustituido va a <datos>\\cuarentena, nunca a E:\\_CUARENTENA ni a %LOCALAPPDATA%', SOLO_WINDOWS, async () => {
  // otro juego falso, copia del de ahora (0.5.0.2), y una carpeta de datos nueva, sin config.json
  const addons = join(pc.base, 'Juego 2', '_forever_', 'Interface', 'AddOns');
  copiar(pc.addons, addons);
  const datos = join(pc.base, 'Datos 2 Ñ');
  const pem = join(pc.base, 'clave-publica.pem');
  const p5 = publicarP({ publicacion: 'v0.5.0-2026.11.11.5', ahora: new Date('2026-11-10T14:00:00.000Z'), version: { addon: '0.5.0.3' } });
  const COMUN = 'E:\\_CUARENTENA\\SnetForever';
  const comunAntes = existsSync(COMUN) ? readdirSync(COMUN).sort() : null; // solo se mira, nunca se escribe
  const datosAntes = process.env.SNF_DATOS;
  assert.equal(process.env.SNF_CUARENTENA, undefined, 'esta prueba necesita que SNF_CUARENTENA no esté puesta');
  // antes de lanzar nada: el entorno del programa ya aísla la cuarentena (si no, no se lanza: caería en E:\_CUARENTENA)
  const entorno = entornoDelPrograma(process.env, datos);
  assert.equal(entorno.SNF_DATOS, datos);
  assert.equal(entorno.SNF_CUARENTENA, join(datos, 'cuarentena'));
  assert.equal(entornoDelPrograma({ SNF_CUARENTENA: 'X:\\Mía' }, datos).SNF_CUARENTENA, 'X:\\Mía', 'una SNF_CUARENTENA puesta se respeta');

  const lineas = [];
  const codigo = await principal(['--publicacion', p5, '--addons', addons, '--datos', datos, '--clave', pem], {
    salida: { write: (t) => lineas.push(...t.trim().split(/\r?\n/)) }, errores: { write: () => {} },
    juegoAbierto: async () => false,
  });
  assert.equal(codigo, 0, lineas.join('\n'));
  assert.equal(JSON.parse(lineas.at(-1)).resultado, 'aplicado');
  assert.match(readFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), 'utf8'), /## Version: 0\.5\.0\.3/);
  const viejos = buscar(join(datos, 'cuarentena'), 'SnetForever.toc').filter((r) => /## Version: 0\.5\.0\.2/.test(readFileSync(r, 'utf8')));
  assert.equal(viejos.length, 1, 'el 0.5.0.2 sustituido está en <datos>\\cuarentena');
  assert.deepEqual(existsSync(COMUN) ? readdirSync(COMUN).sort() : null, comunAntes, 'E:\\_CUARENTENA no se toca');
  assert.ok(existsSync(join(datos, 'actualizacion.json')), 'el estado va a --datos');
  // principal deja process.env como estaba
  assert.equal(process.env.SNF_DATOS, datosAntes);
  assert.equal(process.env.SNF_CUARENTENA, undefined);
});

test('7. desinstalar (CLI) y retirar.ps1: nada de SnetForever en AddOns, en Programs\\SnetForever solo unins000.exe y nada borrado', SOLO_WINDOWS, async (t) => {
  const { codigoSalida, resultado } = await ejecutarOrden(['desinstalar', '--instalacion', pc.instalacion, '--idioma', 'es'], {
    env: pc.env, juego: JUEGO_CERRADO,
  });
  assert.equal(codigoSalida, 0, JSON.stringify(resultado));
  assert.deepEqual(readdirSync(pc.addons).filter((x) => /snetforever/i.test(x)), []);
  assert.ok(existsSync(join(resultado.cuarentena, 'AddOns', 'SnetForever_Comercio', 'SnetForever_Comercio.toc')), 'Task 8: el comercio también va a la cuarentena');
  assert.deepEqual(huella(join(pc.addons, 'RXPGuides')), pc.rxp);
  assert.ok(resultado.cuarentenaInstalacion.startsWith(pc.cuarentena), resultado.cuarentenaInstalacion);
  apuntarCuenta('desinstalar');

  const retirar = spawnSync(POWERSHELL, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(pc.instalacion, 'retirar.ps1'),
    '-Desde', pc.instalacion, '-A', resultado.cuarentenaInstalacion,
  ], { encoding: 'utf8', timeout: 60_000, windowsHide: true });
  assert.equal(retirar.status, 0, retirar.stderr);
  assert.deepEqual(readdirSync(pc.instalacion), ['unins000.exe']);
  // como Inno: de la línea «destino: …» solo vale el último nombre (la consola de PowerShell no trae bien las tildes), que
  // va dentro de la cuarentena que le pasó
  const ultimo = /^destino: .*\\([^\\\r\n]+)\r?$/m.exec(retirar.stdout)?.[1];
  assert.equal(ultimo, 'instalacion', retirar.stdout);
  const destino = join(resultado.cuarentenaInstalacion, ultimo);
  for (const x of ['actual.txt', 'previa.txt', 'fallida.txt', 'unins000.exe']) {
    assert.equal(existsSync(join(destino, x)), x !== 'unins000.exe', x);
  }
  assert.deepEqual(readdirSync(join(destino, 'app')).sort(), ['0.5.0', '0.5.1']);
  apuntarCuenta('retirar.ps1');

  // el número de archivos (instalación, AddOns y cuarentenas) no ha bajado en ningún paso
  t.diagnostic(`archivos en cada paso: ${cuentas.map(([p, n]) => `${p}=${n}`).join(', ')}`);
  const numeros = cuentas.map(([, n]) => n);
  assert.deepEqual(numeros, [...numeros].sort((a, b) => a - b), JSON.stringify(cuentas));
  assert.ok(cuentas.length >= 12, JSON.stringify(cuentas));
});

test('8. ninguna petición sale de 127.0.0.1: el servidor apunta todas, son GET locales y son todas las que hizo la app', SOLO_WINDOWS, () => {
  assert.equal(simulaciones.length, 5); // la del programa (prueba 6) lo comprueba con su última línea
  for (const s of simulaciones) {
    const local = `http://127.0.0.1:${s.puerto}/`;
    assert.ok(s.urls.length > 0);
    for (const u of s.urls) assert.ok(u.startsWith(local), u);
    assert.equal(s.peticiones.length, s.urls.length, 'cada URL de la app llegó al servidor, y nada más');
    for (const p of s.peticiones) {
      assert.equal(p.metodo, 'GET');
      assert.equal(p.direccion, '127.0.0.1');
      assert.equal(p.userAgent, `SnetForever/${VERSION}`);
      assert.equal(p.accept, '*/*');
    }
  }
  const rutas = simulaciones.flatMap((s) => s.peticiones.map((p) => p.ruta));
  assert.ok(rutas.includes('/releases/latest/download/snetforever-manifiesto.json'));
  assert.ok(rutas.includes('/releases/latest/download/snetforever-manifiesto.json.sig'));
  assert.ok(rutas.includes(`/releases/download/${P2.publicacion}/SnetForever-addon-0.5.0.1.snfpaq`));
  assert.ok(rutas.includes(`/releases/download/${P4.publicacion}/SnetForever-app-0.5.1.snfpaq`));
});
