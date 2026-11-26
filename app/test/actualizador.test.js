// Pruebas de app/src/actualizar/actualizador.mjs (fase 5, tarea 9; vigilancias 1, 2 y 4): comprobar, bajar y aplicar las
// actualizaciones del addon, de los datos y de la app. Sin red de verdad (una `red` falsa: un Map de URL a Buffer que
// apunta cada llamada), sin el juego (un AddOns de prueba en una carpeta temporal con espacios y acentos, y
// `juegoAbierto` inyectado) y con claves temporales (generateKeyPairSync). Nunca se usa la carpeta real del juego ni la
// de datos de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, renameSync, chmodSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { empaquetar } from '../src/actualizar/paquete.mjs';
import { ErrorRed } from '../src/actualizar/red.mjs';
import { crearOrigen } from '../src/actualizar/origen.mjs';
import { ErrorInstalar, instalarComponentes } from '../src/instalador/componentes.mjs';
import { crearActualizador, leerManifiestoFirmado, tiempoDescarga } from '../src/actualizar/actualizador.mjs';
import { ejecutarOrden } from '../src/instalador/cli.mjs';

function temporal() {
  return mkdtempSync(join(tmpdir(), 'snf-actualizador-'));
}

// registro.log va a la carpeta de datos de process.env: en estas pruebas, nunca la de verdad.
process.env.SNF_DATOS = temporal();
const REGISTRO = join(process.env.SNF_DATOS, 'registro.log');
const registro = () => (existsSync(REGISTRO) ? readFileSync(REGISTRO, 'utf8') : '');

// Claves de prueba: la buena y otra cualquiera.
function claves() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publica: publicKey.export({ type: 'spki', format: 'pem' }), privada: privateKey };
}
const BUENA = claves();
const OTRA = claves();

const sha = (b) => createHash('sha256').update(b).digest('hex');
const firmar = (bytes, privada) => Buffer.from(`${sign(null, bytes, privada).toString('base64')}\n`, 'latin1');
const ORIGEN = crearOrigen({});

function arbol(raiz, archivos) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const final = join(raiz, ...ruta.split('/'));
    mkdirSync(dirname(final), { recursive: true });
    writeFileSync(final, contenido);
  }
  return raiz;
}

const CARPETA = { addon: 'SnetForever', rutas: 'SnetForever_Rutas', misiones: 'SnetForever_Misiones', comercio: 'SnetForever_Comercio', app: 'app' };
// El comercio (0.7.0) y la app no llevan esquema de datos.
const SIN_ESQUEMA = ['app', 'comercio'];
const toc = (titulo, version, esquema = null) => `## Interface: 16001\n## Title: ${titulo}\n## Version: ${version}\n`
  + `${esquema === null ? '' : `## X-SNF-EsquemaDatos: ${esquema}\n`}\nnucleo.lua\n`;
const nucleoRutas = (version, esquema = 1) => `-- datos\nSNF_RUTAS = {version="${version}",esquema=${esquema},guias={},grupos={}}\n`;
const nucleoMisiones = (version, esquema = 1) => `-- datos\nSNF_MISIONES = {version="${version}",esquema=${esquema},quest={}}\n`;

// Los archivos de un componente (rutas relativas a la raíz del paquete).
function archivosDe(componente, version, esquema = 1) {
  const c = CARPETA[componente];
  if (componente === 'app') return { 'app/src/principal.mjs': `// app ${version}\n`, 'app/package.json': `{"version":"${version}"}\n` };
  if (componente === 'comercio') {
    return {
      [`${c}/${c}.toc`]: `## Interface: 16001\n## Title: SnetForever Comercio\n## Version: ${version}\n## Dependencies: SnetForever\n\nui/comercio.lua\n`,
      [`${c}/ui/comercio.lua`]: `-- comercio ${version}\n`,
    };
  }
  if (componente === 'addon') {
    return { [`${c}/${c}.toc`]: toc(c, version, esquema), [`${c}/nucleo.lua`]: `SnetForever = {VERSION = "${version}"}\n` };
  }
  return {
    [`${c}/${c}.toc`]: toc(c, version),
    [`${c}/nucleo.lua`]: componente === 'rutas' ? nucleoRutas(version, esquema) : nucleoMisiones(version, esquema),
  };
}

// Todo lo que hay en una carpeta: {ruta relativa con /: contenido en base64, o 'carpeta'}.
function foto(dir) {
  const salida = {};
  if (!existsSync(dir)) return salida;
  const recorrer = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = join(d, e.name);
      const rel = relative(dir, r).replace(/\\/g, '/');
      if (e.isDirectory()) {
        salida[`${rel}/`] = 'carpeta';
        recorrer(r);
      } else salida[rel] = readFileSync(r).toString('base64');
    }
  };
  recorrer(dir);
  return salida;
}
// Las rutas de `dir` (con /) que acaban en `cola`.
const buscar = (dir, cola) => Object.keys(foto(dir)).filter((r) => r === cola || r.endsWith(`/${cola}`));

// Un PC de prueba: datos, cuarentena y un AddOns con el addon 0.5.0 y los datos 2026.11.10.1 (esquema 1), y RXPGuides.
function montar({ esquemaAddon = 1, esquemaDatos = 1, addon = '0.5.0' } = {}) {
  const t = temporal();
  const datos = join(t, 'Datos de José Ñandú');
  const cuarentena = join(t, 'Cuarentena Ñ');
  const addons = join(t, 'Juegos Ñ', 'World of Warcraft', '_forever_', 'Interface', 'AddOns');
  arbol(addons, {
    'SnetForever/SnetForever.toc': toc('SnetForever', addon, esquemaAddon),
    'SnetForever/nucleo.lua': `SnetForever = {VERSION = "${addon}"}\n`,
    'SnetForever_Rutas/SnetForever_Rutas.toc': toc('SnetForever_Rutas', '2026.11.10.1'),
    'SnetForever_Rutas/nucleo.lua': nucleoRutas('2026.11.10.1', esquemaDatos),
    'SnetForever_Misiones/SnetForever_Misiones.toc': toc('SnetForever_Misiones', '2026.11.10.1'),
    'SnetForever_Misiones/nucleo.lua': nucleoMisiones('2026.11.10.1', esquemaDatos),
    'RXPGuides/x.lua': '-- de otro\n',
  });
  // SNF_INSTALACION: la carpeta de instalación de prueba (de ahí se lee fallida.txt, ronda 1 de la tarea 10, I2)
  const instalacion = join(t, 'Programs', 'Snet Ñ');
  return { t, datos, cuarentena, addons, instalacion, env: { SNF_DATOS: datos, SNF_CUARENTENA: cuarentena, SNF_INSTALACION: instalacion } };
}

/**
 * Una publicación firmada: devuelve el Map de URL a Buffer (manifiesto, firma y paquetes) y los paquetes.
 * `componentes`: {componente: {version, esquema?, nodeMinimo?, appMinima?}}; `manifiesto` cambia claves de arriba.
 */
function publicar(t, {
  publicacion = 'v0.5.1-2026.11.11.1', fecha = '2026-11-11T12:00:00.000Z', componentes = { addon: { version: '0.5.1' } },
  privada = BUENA.privada, entradas: cambiar = {},
} = {}) {
  const mapa = new Map();
  const entradas = {};
  const paquetes = {};
  for (const [c, { version, esquema = 1, nodeMinimo, appMinima }] of Object.entries(componentes)) {
    const raiz = arbol(mkdtempSync(join(t, 'fuente-')), archivosDe(c, version, esquema));
    const buffer = empaquetar({ componente: c, version, raiz, ...(SIN_ESQUEMA.includes(c) ? {} : { esquemaDatos: esquema }) });
    const entrada = { version, archivo: `SnetForever-${c}-${version}.snfpaq`, tamano: buffer.length, sha256: sha(buffer) };
    if (!SIN_ESQUEMA.includes(c)) entrada.esquemaDatos = esquema;
    if (nodeMinimo) entrada.nodeMinimo = nodeMinimo;
    if (appMinima) entrada.appMinima = appMinima;
    entradas[c] = { ...entrada, ...(cambiar[c] ?? {}) };
    paquetes[c] = buffer;
    mapa.set(ORIGEN.paquete(publicacion, entrada.archivo), buffer);
  }
  const manifiesto = { esquema: 1, producto: 'SnetForever', publicacion, fecha, componentes: entradas, notas: { es: 'Novedades', en: 'News' } };
  const bytes = Buffer.from(`${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
  mapa.set(ORIGEN.manifiesto, bytes);
  mapa.set(ORIGEN.firma, firmar(bytes, privada));
  return { mapa, paquetes, manifiesto, publicacion };
}

// La red falsa: sirve `mapa` (lo que no está da un 404, y lo que pasa de maxBytes un 'tamano', como red.mjs) y apunta
// cada llamada. `red.fallo` (un error) hace que todas las llamadas lo lancen.
function redFalsa(mapa = new Map()) {
  const red = async (url, opciones) => {
    red.llamadas.push({ url, opciones });
    if (red.fallo) throw red.fallo;
    if (!red.mapa.has(url)) throw new ErrorRed('estado', `HTTP 404 en ${url}`, { estado: 404 });
    const b = red.mapa.get(url);
    if (b.length > opciones.maxBytes) throw new ErrorRed('tamano', `${url} pasa de ${opciones.maxBytes} bytes`);
    return Buffer.from(b);
  };
  red.mapa = mapa;
  red.llamadas = [];
  red.fallo = null;
  return red;
}

// Un reloj falso que avanza un segundo en cada llamada.
function reloj(desde = '2026-11-11T13:00:00.000Z') {
  let t = Date.parse(desde);
  return () => new Date((t += 1000));
}

// Un actualizador sobre el PC de prueba `m`. `juego.abierto` decide si el juego está abierto.
function actualizador(m, red, opciones = {}) {
  const juego = { abierto: false };
  const aplicadosEn = [];
  const a = crearActualizador({
    env: m.env, config: {}, addonsDir: m.addons, red, clavePublica: BUENA.publica, juegoAbierto: async () => juego.abierto,
    versionApp: '0.5.0', versionNode: '24.14.0', alAplicar: (lista) => aplicadosEn.push(lista), ahora: reloj(), ...opciones,
  });
  return { a, juego, aplicadosEn };
}

const versionToc = (m, c = 'addon') => /## Version: (\S+)/.exec(readFileSync(join(m.addons, CARPETA[c], `${CARPETA[c]}.toc`), 'utf8'))[1];
const sinHoras = ({ ultimaComprobacion, ultimoError, ...resto }) => resto;

// --- revisión final, I2: el tiempo de las descargas crece con el paquete ---

test('revisión final, I2: tiempoDescarga da 30 s más 1 s por cada 50 KB, hasta 10 min', () => {
  assert.equal(tiempoDescarga(1), 31_000);
  assert.equal(tiempoDescarga(50 * 1024), 31_000);
  assert.equal(tiempoDescarga(50 * 1024 + 1), 32_000);
  // los paquetes de datos de verdad (misiones 2.799.069 bytes, rutas 2.390.424): 85 s y 77 s (unos 32 KB/s como mínimo)
  assert.equal(tiempoDescarga(2_799_069), 85_000);
  assert.equal(tiempoDescarga(2_390_424), 77_000);
  assert.equal(tiempoDescarga(300 * 2 ** 20), 600_000);
  // y nunca menos de lo que se deja al manifiesto (los 30 s de red.mjs)
  assert.equal(tiempoDescarga(0), 30_000);
});

test('revisión final, I2: el paquete se pide con tiempoMax según su tamaño; el manifiesto y la firma, con los 30 s de siempre', async () => {
  const m = montar();
  const pub = publicar(m.t, { componentes: { misiones: { version: '2026.11.12.1' } } });
  const red = redFalsa(pub.mapa);
  const { a } = actualizador(m, red);
  await a.comprobar();
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  const [manifiesto, firma, paquete] = red.llamadas;
  assert.equal(manifiesto.opciones.tiempoMax, undefined);
  assert.equal(firma.opciones.tiempoMax, undefined);
  const { tamano } = pub.manifiesto.componentes.misiones;
  assert.equal(paquete.opciones.tiempoMax, tiempoDescarga(tamano));
  assert.ok(paquete.opciones.tiempoMax > 30_000);
});

// --- sin clave ---

test('con clavePublica null: «sin_clave», sin ninguna llamada a la red y sin tocar el estado', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t).mapa);
  const { a } = actualizador(m, red, { clavePublica: null });
  assert.deepEqual(await a.comprobar(), { estado: 'sin_clave' });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.equal(red.llamadas.length, 0);
  assert.deepEqual(a.estado(), {});
  assert.ok(!existsSync(join(m.datos, 'actualizacion.json')));
});

// --- el camino bueno ---

test('un manifiesto con el addon 0.5.1 → «hay» con la lista, y se apuntan ultimaComprobacion y ultimaFecha', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t).mapa);
  const { a } = actualizador(m, red);
  const r = await a.comprobar();
  assert.deepEqual(r, { estado: 'hay', lista: [{ componente: 'addon', de: '0.5.0', a: '0.5.1' }] });
  assert.deepEqual(red.llamadas.map((l) => [l.url, l.opciones.maxBytes]), [
    [ORIGEN.manifiesto, 65536], [ORIGEN.firma, 1024],
  ]);
  const e = a.estado();
  assert.equal(e.ultimaFecha, '2026-11-11T12:00:00.000Z');
  assert.match(e.ultimaComprobacion, /^2026-11-11T13:00:0\d\.000Z$/);
  assert.equal(e.pendiente, undefined);
  // el estado se guarda en <datos>\actualizacion.json (F4)
  assert.deepEqual(JSON.parse(readFileSync(join(m.datos, 'actualizacion.json'), 'utf8')), e);
});

test('descargar → «listo»: el paquete pedido con su tamaño, guardado en <datos>\\actualizaciones\\<publicacion> y apuntado en pendiente', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const red = redFalsa(pub.mapa);
  const { a } = actualizador(m, red);
  await a.comprobar();
  const antes = foto(m.addons);
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  const entrada = pub.manifiesto.componentes.addon;
  assert.deepEqual(red.llamadas.at(-1), {
    url: ORIGEN.paquete(pub.publicacion, entrada.archivo), opciones: { maxBytes: entrada.tamano, tiempoMax: tiempoDescarga(entrada.tamano) },
  });
  const carpeta = join(m.datos, 'actualizaciones', pub.publicacion);
  assert.deepEqual(readFileSync(join(carpeta, entrada.archivo)), pub.paquetes.addon);
  assert.deepEqual(readdirSync(carpeta), [entrada.archivo], 'sin temporales');
  assert.deepEqual(a.estado().pendiente, {
    publicacion: pub.publicacion,
    componentes: { addon: { version: '0.5.1', archivo: entrada.archivo, sha256: entrada.sha256, tamano: entrada.tamano } },
    carpeta,
  });
  assert.deepEqual(foto(m.addons), antes, 'bajar no toca AddOns');
  // otra vez, con lo mismo ya bajado: no se vuelve a pedir
  const n = red.llamadas.length;
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.equal(red.llamadas.length, n);
});

test('aplicarSiSePuede: con el juego abierto espera; cerrado aplica, aparta el 0.5.0 y llama a alAplicar con [addon]', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const { a, juego, aplicadosEn } = actualizador(m, redFalsa(pub.mapa));
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada' }, 'sin pendiente no hay nada que hacer');
  await a.comprobar();
  await a.descargar();
  const antes = foto(m.addons);

  juego.abierto = true;
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'esperando_juego' });
  assert.deepEqual(foto(m.addons), antes);
  assert.ok(a.estado().pendiente, 'la actualización sigue pendiente');
  assert.deepEqual(aplicadosEn, []);

  juego.abierto = false;
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon'] });
  assert.equal(versionToc(m), '0.5.1');
  assert.deepEqual(aplicadosEn, [['addon']]);
  const viejo = buscar(m.cuarentena, 'viejo-SnetForever/SnetForever.toc');
  assert.equal(viejo.length, 1);
  assert.match(readFileSync(join(m.cuarentena, viejo[0]), 'utf8'), /## Version: 0\.5\.0/);
  // pendiente es un campo del estado: se quita; la carpeta bajada va a la cuarentena (no se borra)
  assert.equal(a.estado().pendiente, undefined);
  assert.ok(!existsSync(join(m.datos, 'actualizaciones', pub.publicacion)));
  assert.equal(buscar(m.cuarentena, `${pub.publicacion}/SnetForever-addon-0.5.1.snfpaq`).length, 1);
  assert.equal(foto(m.addons)['RXPGuides/x.lua'], antes['RXPGuides/x.lua']);
  // y ya está al día
  assert.deepEqual(await a.comprobar(), { estado: 'sin_novedades' });
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada' });
});

test('si no se sabe si el juego está abierto (juegoAbierto falla), cuenta como abierto', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa), {
    juegoAbierto: async () => {
      throw new Error('PowerShell no contesta');
    },
  });
  await a.comprobar();
  await a.descargar();
  const antes = foto(m.addons);
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'esperando_juego' });
  assert.deepEqual(foto(m.addons), antes);
});

test('la app: se baja y se aplica con aplicarApp(buffer) después de AddOns; alAplicar recibe [addon, app]', async () => {
  const m = montar();
  const pub = publicar(m.t, { componentes: { addon: { version: '0.5.1' }, app: { version: '0.5.1', nodeMinimo: '24.0.0' } } });
  const recibidos = [];
  const { a, aplicadosEn } = actualizador(m, redFalsa(pub.mapa), {
    aplicarApp: async (buffer) => {
      recibidos.push({ buffer, toc: versionToc(m) });
      return { version: '0.5.1' };
    },
  });
  assert.deepEqual((await a.comprobar()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.5.1' }, { componente: 'app', de: '0.5.0', a: '0.5.1' },
  ]);
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon', 'app'] });
  assert.equal(recibidos.length, 1);
  assert.deepEqual(recibidos[0].buffer, pub.paquetes.app);
  assert.equal(recibidos[0].toc, '0.5.1', 'la app va después de AddOns');
  assert.deepEqual(aplicadosEn, [['addon', 'app']]);
  assert.equal(a.estado().pendiente, undefined);
});

test('sin aplicarApp, la app no se baja (solo lo de AddOns)', async () => {
  const m = montar();
  const pub = publicar(m.t, { componentes: { addon: { version: '0.5.1' }, app: { version: '0.5.1' } } });
  const red = redFalsa(pub.mapa);
  const { a } = actualizador(m, red);
  await a.comprobar();
  await a.descargar();
  assert.deepEqual(Object.keys(a.estado().pendiente.componentes), ['addon']);
  assert.ok(!red.llamadas.some((l) => l.url.endsWith('SnetForever-app-0.5.1.snfpaq')));
});

// Revisión final, m1: el juego cerrado solo hace falta para tocar AddOns.
test('revisión final, m1: una tanda que trae solo la app se aplica con el juego abierto (no toca AddOns)', async () => {
  const m = montar();
  const pub = publicar(m.t, { componentes: { app: { version: '0.5.1' } } });
  const recibidos = [];
  const { a, juego, aplicadosEn } = actualizador(m, redFalsa(pub.mapa), { aplicarApp: async (b) => recibidos.push(b) });
  await a.comprobar();
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  const antes = foto(m.addons);
  juego.abierto = true;
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['app'] });
  assert.equal(recibidos.length, 1);
  assert.deepEqual(aplicadosEn, [['app']]);
  assert.deepEqual(foto(m.addons), antes, 'AddOns no se toca');
  assert.equal(a.estado().pendiente, undefined);
});

test('revisión final, m1: una tanda que ya está instalada (la puso el instalador) se descarta con el juego abierto', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const { a, juego } = actualizador(m, redFalsa(pub.mapa));
  await a.comprobar();
  await a.descargar();
  // el instalador pone el addon 0.5.1 mientras tanto
  writeFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), toc('SnetForever', '0.5.1', 1));
  juego.abierto = true;
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada' });
  assert.equal(a.estado().pendiente, undefined);
  assert.equal(buscar(m.cuarentena, `${pub.publicacion}/SnetForever-addon-0.5.1.snfpaq`).length, 1, 'lo bajado va a la cuarentena');
});

test('revisión final, m1: con el addon y la app, el juego abierto sigue haciendo esperar a los dos', async () => {
  const m = montar();
  const pub = publicar(m.t, { componentes: { addon: { version: '0.5.1' }, app: { version: '0.5.1' } } });
  const recibidos = [];
  const { a, juego } = actualizador(m, redFalsa(pub.mapa), { aplicarApp: async (b) => recibidos.push(b) });
  await a.comprobar();
  await a.descargar();
  juego.abierto = true;
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'esperando_juego' });
  assert.equal(recibidos.length, 0);
  assert.deepEqual(Object.keys(a.estado().pendiente.componentes).sort(), ['addon', 'app']);
});

test('tarea 10, ronda 1 (I2): tras una vuelta atrás (fallida.txt = 0.5.1), la 0.5.1 no se vuelve a bajar ni a aplicar; una 0.5.2 sí', async () => {
  const m = montar();
  mkdirSync(m.instalacion, { recursive: true });
  writeFileSync(join(m.instalacion, 'fallida.txt'), '0.5.1');
  const aplicadas = [];
  const aplicarApp = async (buffer) => aplicadas.push(buffer);
  const pub = publicar(m.t, { componentes: { app: { version: '0.5.1' } } });
  const red = redFalsa(pub.mapa);
  const { a } = actualizador(m, red, { aplicarApp });
  assert.deepEqual(await a.comprobar(), { estado: 'hay', lista: [{ componente: 'app', de: '0.5.0', a: '0.5.1', saltado: 'fallida' }] });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.ok(!red.llamadas.some((l) => l.url.endsWith('SnetForever-app-0.5.1.snfpaq')), 'no se baja');
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada' });
  assert.equal(aplicadas.length, 0);

  // una publicación más nueva que la fallida sí se ofrece y se aplica
  const nueva = publicar(m.t, { publicacion: 'v0.5.2-2026.11.12.1', fecha: '2026-11-12T12:00:00.000Z', componentes: { app: { version: '0.5.2' } } });
  const { a: b } = actualizador(m, redFalsa(nueva.mapa), { aplicarApp });
  assert.deepEqual(await b.comprobar(), { estado: 'hay', lista: [{ componente: 'app', de: '0.5.0', a: '0.5.2' }] });
  assert.deepEqual(await b.descargar(), { estado: 'listo' });
  assert.deepEqual(await b.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['app'] });
  assert.deepEqual(aplicadas, [nueva.paquetes.app]);
});

test('tarea 10, ronda 1 (I2): una app pendiente que entretanto quedó en fallida.txt no se aplica y se descarta', async () => {
  const m = montar();
  const aplicadas = [];
  const pub = publicar(m.t, { componentes: { app: { version: '0.5.1' } } });
  const { a } = actualizador(m, redFalsa(pub.mapa), { aplicarApp: async (b) => aplicadas.push(b) });
  await a.comprobar();
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  mkdirSync(m.instalacion, { recursive: true });
  writeFileSync(join(m.instalacion, 'fallida.txt'), '0.5.1');
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada' });
  assert.equal(aplicadas.length, 0);
  assert.equal(a.estado().pendiente, undefined);
});

test('versiones iguales → «sin_novedades», y descargar no pide nada', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { componentes: { addon: { version: '0.5.0' } } }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual(await a.comprobar(), { estado: 'sin_novedades' });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.equal(red.llamadas.length, 2);
  assert.equal(a.estado().ultimaFecha, '2026-11-11T12:00:00.000Z');
});

test('la app con un nodeMinimo alto → sale con requiereInstalador y no se baja', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { componentes: { app: { version: '0.6.0', nodeMinimo: '99.0.0' } } }).mapa);
  const { a } = actualizador(m, red, { aplicarApp: async () => ({ version: '0.6.0' }) });
  assert.deepEqual(await a.comprobar(), {
    estado: 'hay', lista: [{ componente: 'app', de: '0.5.0', a: '0.6.0', requiereInstalador: true }],
  });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.equal(red.llamadas.length, 2, 'solo el manifiesto y la firma');
  assert.equal(a.estado().pendiente, undefined);
});

test('un addon con appMinima más alta que la app sale saltado y no se baja', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { componentes: { addon: { version: '0.5.1', appMinima: '0.6.0' } } }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual(await a.comprobar(), {
    estado: 'hay', lista: [{ componente: 'addon', de: '0.5.0', a: '0.5.1', saltado: 'app_minima' }],
  });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.equal(red.llamadas.length, 2);
});

// --- F5-2 frente a lo instalado ---

test('F5-2: un addon de otro esquema sin sus datos, o datos de otro esquema solos, no se ofrecen', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { componentes: { addon: { version: '0.6.0', esquema: 2 } } }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual(await a.comprobar(), {
    estado: 'hay', lista: [{ componente: 'addon', de: '0.5.0', a: '0.6.0', saltado: 'compatibilidad' }],
  });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });

  red.mapa = publicar(m.t, { fecha: '2026-11-12T12:00:00.000Z', componentes: { rutas: { version: '2026.11.12.1', esquema: 2 } } }).mapa;
  assert.deepEqual(await a.comprobar(), {
    estado: 'hay', lista: [{ componente: 'rutas', de: '2026.11.10.1', a: '2026.11.12.1', saltado: 'compatibilidad' }],
  });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.equal(red.llamadas.filter((l) => l.url.endsWith('.snfpaq')).length, 0);
});

test('F5-2: un addon de otro esquema con solo una parte de sus datos no se ofrece; con todos, sí', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, {
    componentes: { addon: { version: '0.6.0', esquema: 2 }, rutas: { version: '2026.11.12.1', esquema: 2 } },
  }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual((await a.comprobar()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.6.0', saltado: 'compatibilidad' },
    { componente: 'rutas', de: '2026.11.10.1', a: '2026.11.12.1', saltado: 'compatibilidad' },
  ]);
  red.mapa = publicar(m.t, {
    fecha: '2026-11-12T12:00:00.000Z',
    componentes: {
      addon: { version: '0.6.0', esquema: 2 }, rutas: { version: '2026.11.12.1', esquema: 2 }, misiones: { version: '2026.11.12.1', esquema: 2 },
    },
  }).mapa;
  assert.deepEqual((await a.comprobar()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.6.0' },
    { componente: 'rutas', de: '2026.11.10.1', a: '2026.11.12.1' },
    { componente: 'misiones', de: '2026.11.10.1', a: '2026.11.12.1' },
  ]);
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon', 'rutas', 'misiones'] });
  assert.equal(versionToc(m), '0.6.0');
});

test('F5-2: datos solos del mismo esquema que pide el addon instalado sí se ofrecen', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { componentes: { misiones: { version: '2026.11.12.1' } } }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual((await a.comprobar()).lista, [{ componente: 'misiones', de: '2026.11.10.1', a: '2026.11.12.1' }]);
});

test('un manifiesto cuyo addon y datos piden esquemas distintos → «error», codigo «compatibilidad»', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, {
    componentes: { addon: { version: '0.5.1', esquema: 1 }, rutas: { version: '2026.11.12.1', esquema: 2 } },
  }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'compatibilidad' });
  assert.equal(a.estado().ultimaFecha, undefined, 'un manifiesto que no vale no se acepta');
});

// --- vigilancia 2: manifiesto o paquete manipulados ---

test('vigilancia 2: firma de otra clave → «error», codigo «firma», sin pendiente y con la misma ultimaFecha', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { componentes: { addon: { version: '0.5.0' } } }).mapa);
  const { a } = actualizador(m, red);
  await a.comprobar();
  const fecha = a.estado().ultimaFecha;
  red.mapa = publicar(m.t, { fecha: '2026-11-20T12:00:00.000Z', privada: OTRA.privada }).mapa;
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'firma' });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.equal(a.estado().pendiente, undefined);
  assert.equal(a.estado().ultimaFecha, fecha);
  assert.equal(a.estado().ultimoError.codigo, 'firma');
  assert.ok(!red.llamadas.some((l) => l.url.endsWith('.snfpaq')), 'nunca se baja un paquete sin firma buena');
});

test('vigilancia 2: un byte cambiado en un manifiesto bien firmado → «firma»', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const bytes = Buffer.from(pub.mapa.get(ORIGEN.manifiesto));
  bytes[bytes.indexOf('0.5.1')] = '9'.charCodeAt(0);
  pub.mapa.set(ORIGEN.manifiesto, bytes);
  const { a } = actualizador(m, redFalsa(pub.mapa));
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'firma' });
});

test('vigilancia 2: un manifiesto bien firmado con fecha anterior a la última aceptada → «antiguo»', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { fecha: '2026-11-11T12:00:00.000Z', componentes: { addon: { version: '0.5.0' } } }).mapa);
  const { a } = actualizador(m, red);
  assert.equal((await a.comprobar()).estado, 'sin_novedades');
  red.mapa = publicar(m.t, { fecha: '2026-11-01T12:00:00.000Z', componentes: { addon: { version: '0.5.1' } } }).mapa;
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'antiguo' });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.equal(a.estado().ultimaFecha, '2026-11-11T12:00:00.000Z');
});

test('vigilancia 2: la ultimaFecha guardada vale también en un actualizador nuevo (al reiniciar la app)', async () => {
  const m = montar();
  await actualizador(m, redFalsa(publicar(m.t, { fecha: '2026-11-11T12:00:00.000Z', componentes: { addon: { version: '0.5.0' } } }).mapa))
    .a.comprobar();
  const { a } = actualizador(m, redFalsa(publicar(m.t, { fecha: '2026-11-01T12:00:00.000Z' }).mapa));
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'antiguo' });
});

test('vigilancia 2: un paquete con otro SHA-256 → descargar da «error», codigo «hash», y AddOns no cambia', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const url = ORIGEN.paquete(pub.publicacion, pub.manifiesto.componentes.addon.archivo);
  const cambiado = Buffer.from(pub.mapa.get(url));
  cambiado[cambiado.length - 10] ^= 0xff; // mismo tamaño, otro hash
  pub.mapa.set(url, cambiado);
  const { a } = actualizador(m, redFalsa(pub.mapa));
  await a.comprobar();
  const antes = foto(m.addons);
  assert.deepEqual(await a.descargar(), { estado: 'error', codigo: 'hash' });
  assert.equal(a.estado().pendiente, undefined);
  assert.ok(!existsSync(join(m.datos, 'actualizaciones', pub.publicacion)), 'no se guarda nada que no cuadre');
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada' });
  assert.deepEqual(foto(m.addons), antes);
  assert.match(registro(), /hash/);
});

test('vigilancia 2: un paquete de otro tamaño → «tamano»; uno cuya cabecera dice otra versión → «version»', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const url = ORIGEN.paquete(pub.publicacion, pub.manifiesto.componentes.addon.archivo);
  pub.mapa.set(url, pub.mapa.get(url).subarray(0, 100));
  const { a } = actualizador(m, redFalsa(pub.mapa));
  await a.comprobar();
  assert.deepEqual(await a.descargar(), { estado: 'error', codigo: 'tamano' });

  // bien firmado y con su tamaño y su hash, pero el paquete de dentro es el 0.5.2
  const m2 = montar();
  const otro = publicar(m2.t, { componentes: { addon: { version: '0.5.2' } } }).paquetes.addon;
  const pub2 = publicar(m2.t, { entradas: { addon: { tamano: otro.length, sha256: sha(otro) } } });
  pub2.mapa.set(ORIGEN.paquete(pub2.publicacion, 'SnetForever-addon-0.5.1.snfpaq'), otro);
  const { a: a2 } = actualizador(m2, redFalsa(pub2.mapa));
  await a2.comprobar();
  assert.deepEqual(await a2.descargar(), { estado: 'error', codigo: 'version' });
  assert.equal(a2.estado().pendiente, undefined);
});

test('vigilancia 2: el paquete guardado, cambiado en el disco antes de aplicar → «hash» y no se aplica nada', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const { a, aplicadosEn } = actualizador(m, redFalsa(pub.mapa));
  await a.comprobar();
  await a.descargar();
  const guardado = join(a.estado().pendiente.carpeta, pub.manifiesto.componentes.addon.archivo);
  const b = readFileSync(guardado);
  b[b.length - 10] ^= 0xff;
  writeFileSync(guardado, b);
  const antes = foto(m.addons);
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'error', codigo: 'hash' });
  assert.deepEqual(foto(m.addons), antes);
  assert.deepEqual(aplicadosEn, []);
  // lo que no cuadra deja de estar pendiente (para bajarlo otra vez) y va a la cuarentena, no se borra
  assert.equal(a.estado().pendiente, undefined);
  assert.equal(a.estado().ultimoError.codigo, 'hash');
  assert.equal(buscar(m.cuarentena, `${pub.publicacion}/SnetForever-addon-0.5.1.snfpaq`).length, 1);
  // y se puede volver a bajar y aplicar
  await a.comprobar();
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon'] });
});

test('si lo pendiente ya está instalado (p. ej. con el instalador), no se vuelve a aplicar', async () => {
  const m = montar();
  const { a, aplicadosEn } = actualizador(m, redFalsa(publicar(m.t).mapa));
  await a.comprobar();
  await a.descargar();
  writeFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), toc('SnetForever', '0.5.1', 1));
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada' });
  assert.equal(a.estado().pendiente, undefined);
  assert.deepEqual(aplicadosEn, []);
});

// --- vigilancia 4: sin red o con GitHub raro ---

for (const [nombre, fallo, codigo] of [
  ['sin conexión', new ErrorRed('conexion', 'sin conexión con github.com'), 'conexion'],
  ['un 404', new ErrorRed('estado', 'HTTP 404', { estado: 404 }), 'estado'],
  ['una redirección a otro sitio', new ErrorRed('redireccion', 'redirección no permitida'), 'redireccion'],
  ['una respuesta enorme', new ErrorRed('tamano', 'pasa de 65536 bytes'), 'tamano'],
]) {
  test(`vigilancia 4: ${nombre} → «error», codigo «${codigo}»; el estado solo cambia en ultimaComprobacion y ultimoError`, async () => {
    const m = montar();
    const pub = publicar(m.t);
    const red = redFalsa(pub.mapa);
    const { a } = actualizador(m, red);
    await a.comprobar();
    await a.descargar();
    const antes = a.estado();
    red.fallo = fallo;
    const r = await a.comprobar();
    assert.deepEqual(r, { estado: 'error', codigo, ...(fallo.estado !== undefined ? { http: fallo.estado } : {}) }); // el 404 lleva su número
    const despues = a.estado();
    assert.deepEqual(sinHoras(despues), sinHoras(antes));
    assert.notEqual(despues.ultimaComprobacion, antes.ultimaComprobacion);
    assert.equal(despues.ultimoError.codigo, codigo);
    assert.match(registro(), new RegExp(codigo));
  });
}

test('vigilancia 4: dos fallos seguidos dejan un único ultimoError (el último), y una comprobación buena lo quita', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t).mapa);
  const { a } = actualizador(m, red);
  red.fallo = new ErrorRed('conexion', 'sin conexión');
  assert.equal((await a.comprobar()).codigo, 'conexion');
  const primero = a.estado().ultimoError;
  red.fallo = new ErrorRed('estado', 'HTTP 403', { estado: 403 });
  assert.equal((await a.comprobar()).codigo, 'estado');
  const e = a.estado();
  assert.equal(typeof e.ultimoError, 'object');
  assert.ok(!Array.isArray(e.ultimoError));
  assert.deepEqual(Object.keys(e.ultimoError).sort(), ['codigo', 'cuando']);
  assert.equal(e.ultimoError.codigo, 'estado');
  assert.ok(e.ultimoError.cuando > primero.cuando);
  red.fallo = null;
  assert.equal((await a.comprobar()).estado, 'hay');
  assert.equal(a.estado().ultimoError, undefined);
});

test('vigilancia 4: un fallo de red al bajar un paquete → «error» con su código, sin pendiente ni nada guardado', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const red = redFalsa(pub.mapa);
  const { a } = actualizador(m, red);
  await a.comprobar();
  red.fallo = new ErrorRed('tiempo', 'sin respuesta completa en 30000 ms');
  assert.deepEqual(await a.descargar(), { estado: 'error', codigo: 'tiempo' });
  assert.equal(a.estado().pendiente, undefined);
  assert.ok(!existsSync(join(m.datos, 'actualizaciones')));
  red.fallo = null;
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
});

test('nunca lanza: una red que lanza otra cosa, una que no da un Buffer y un alAplicar que falla', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const red = redFalsa(pub.mapa);
  const { a } = actualizador(m, red, {
    alAplicar: () => {
      throw new Error('la bandeja se cayó');
    },
  });
  red.fallo = new TypeError('algo raro');
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'fallo' });
  red.fallo = null;
  const { a: a2 } = actualizador(m, async () => 'no soy un Buffer');
  assert.equal((await a2.comprobar()).estado, 'error');
  await a.comprobar();
  await a.descargar();
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon'] });
});

test('las llamadas a la vez van en fila: comprobar, descargar y aplicar seguidos sin esperar', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa));
  const [c, d, ap] = await Promise.all([a.comprobar(), a.descargar(), a.aplicarSiSePuede()]);
  assert.equal(c.estado, 'hay');
  assert.deepEqual(d, { estado: 'listo' });
  assert.deepEqual(ap, { estado: 'aplicado', aplicados: ['addon'] });
});

// --- estado roto (tarea 8) ---

test('estado roto: si instalarComponentes no puede deshacer, se avisa (roto) y se reintenta la tanda entera', async () => {
  const m = montar();
  const llamadas = [];
  let romper = true;
  const { a, aplicadosEn } = actualizador(m, redFalsa(publicar(m.t).mapa), {
    instalar: async (addonsDir, paquetes, opciones) => {
      llamadas.push({ componentes: paquetes.map((p) => p.componente), marcaRoto: opciones.marcaRoto });
      if (romper) {
        throw new ErrorInstalar('ocupado', 'No se pudo cambiar «addon» y no se pudo deshacer del todo', {
          detalle: { etapa: 'cambiar', componente: 'addon', deshecho: false, pendientes: ['addon'], cuarentena: null, marca: null },
        });
      }
      return instalarComponentes(addonsDir, paquetes, opciones);
    },
  });
  await a.comprobar();
  await a.descargar();
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'error', codigo: 'ocupado', roto: true });
  assert.ok(a.estado().pendiente, 'la tanda sigue pendiente');
  assert.equal(a.estado().ultimoError.roto, true);
  assert.equal(llamadas[0].marcaRoto, join(m.datos, 'estado-roto.json'));
  romper = false;
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon'] });
  assert.deepEqual(llamadas.map((l) => l.componentes), [['addon'], ['addon']]);
  assert.deepEqual(aplicadosEn, [['addon']]);
});

test('estado roto: con estado-roto.json, la tanda se reinstala entera aunque AddOns ya diga la versión nueva', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa));
  await a.comprobar();
  await a.descargar();
  // como un deshacer a medias: lo nuevo quedó puesto y la marca dice que falta devolver el addon
  writeFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), toc('SnetForever', '0.5.1', 1));
  mkdirSync(m.datos, { recursive: true });
  writeFileSync(join(m.datos, 'estado-roto.json'), JSON.stringify({ pendientes: [{ componente: 'addon', estado: 'nuevo_puesto' }] }));
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon'] });
  assert.ok(!existsSync(join(m.datos, 'estado-roto.json')), 'la marca va a la cuarentena al reparar');
  assert.equal(buscar(m.cuarentena, 'estado-roto.json').length, 1);
});

test('un error de instalación que puede pasarse (EBUSY deshecho) deja la actualización pendiente', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa), {
    instalar: async () => {
      throw new ErrorInstalar('ocupado', 'el archivo está en uso', { detalle: { etapa: 'cambiar', deshecho: true, pendientes: [], cuarentena: null } });
    },
  });
  await a.comprobar();
  await a.descargar();
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'error', codigo: 'ocupado' });
  assert.ok(a.estado().pendiente);
});

test('el juego que se abre a mitad (juego_abierto de instalarComponentes) → «esperando_juego» y sigue pendiente', async () => {
  const m = montar();
  let veces = 0;
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa), { juegoAbierto: async () => (veces++ >= 1) });
  await a.comprobar();
  await a.descargar();
  const antes = foto(m.addons);
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'esperando_juego' });
  assert.deepEqual(foto(m.addons), antes);
  assert.ok(a.estado().pendiente);
});

// --- el estado F4 ---

test('ronda 1 (I1): un actualizacion.json ilegible va a la cuarentena con un error claro, y ultimaFecha no se pierde', async () => {
  const m = montar();
  mkdirSync(m.datos, { recursive: true });
  writeFileSync(join(m.datos, 'actualizacion.json'), '{"ultimaFecha":"2026-11-11T12:00:00.000Z","pendiente":{roto');
  const red = redFalsa(publicar(m.t, { fecha: '2026-11-01T12:00:00.000Z' }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'estado_ilegible' });
  assert.equal(red.llamadas.length, 0, 'con el estado ilegible no se comprueba nada');
  assert.equal(buscar(join(m.datos, 'cuarentena'), 'actualizacion.json').length, 1, 'el ilegible va a la cuarentena, no se pisa');
  assert.equal(a.estado().ultimaFecha, '2026-11-11T12:00:00.000Z');
  assert.equal(a.estado().ultimoError.codigo, 'estado_ilegible');
  // la defensa contra la vuelta atrás sigue en pie
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'antiguo' });
});

test('ronda 1 (I1): un ilegible sin ultimaFecha también va a la cuarentena; estado() lo dice sin lanzar', async () => {
  const m = montar();
  mkdirSync(m.datos, { recursive: true });
  writeFileSync(join(m.datos, 'actualizacion.json'), '{esto no es JSON');
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa));
  assert.deepEqual(a.estado(), { error: 'estado_ilegible' });
  assert.equal(buscar(join(m.datos, 'cuarentena'), 'actualizacion.json').length, 1);
  assert.deepEqual(a.estado(), {});
  assert.equal((await a.comprobar()).estado, 'hay');
});

test('ronda 1 (I1): si actualizacion.json no se puede leer (no es ENOENT), no se escribe nada encima', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { componentes: { addon: { version: '0.5.0' } } }).mapa);
  const { a } = actualizador(m, red);
  await a.comprobar();
  const ruta = join(m.datos, 'actualizacion.json');
  const bueno = `${ruta}.aparte`;
  renameSync(ruta, bueno);
  mkdirSync(ruta); // una carpeta con su nombre: readFileSync da EISDIR
  const antes = foto(m.datos);
  const n = red.llamadas.length;
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'fs' });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'error', codigo: 'fs' });
  assert.equal(a.estado().error, 'fs');
  assert.equal(red.llamadas.length, n, 'sin estado no se comprueba');
  assert.deepEqual(foto(m.datos), antes, 'nada escrito en datos');
  // el estado bueno vuelve a su sitio y conserva ultimaFecha: un manifiesto viejo sigue siendo antiguo
  renameSync(ruta, `${ruta}.carpeta`);
  renameSync(bueno, ruta);
  red.mapa = publicar(m.t, { fecha: '2026-11-01T12:00:00.000Z' }).mapa;
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'antiguo' });
});

test('ronda 1 (M6): si no se puede guardar tras una comprobación buena, no queda una lista vieja para descargar', { skip: process.platform !== 'win32' }, async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t).mapa);
  const { a } = actualizador(m, red);
  assert.equal((await a.comprobar()).estado, 'hay');
  const ruta = join(m.datos, 'actualizacion.json');
  chmodSync(ruta, 0o444); // en Windows, un renombre encima de un archivo de solo lectura da EPERM
  try {
    assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'fs' });
    const n = red.llamadas.length;
    assert.deepEqual(await a.descargar(), { estado: 'nada' });
    assert.equal(red.llamadas.length, n);
  } finally {
    chmodSync(ruta, 0o666);
  }
});

test('ronda 1 (M8): un código que no es del sistema de archivos (ERR_…) es «fallo»; EBUSY es «fs»', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t).mapa);
  const { a } = actualizador(m, red);
  red.fallo = Object.assign(new TypeError('argumento raro'), { code: 'ERR_INVALID_ARG_TYPE' });
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'fallo' });
  red.fallo = Object.assign(new Error('ocupado'), { code: 'EBUSY' });
  assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'fs' });
});

// --- ronda 1: estado roto ---

// La marca de estado roto, como la deja instalarComponentes.
function marcarRoto(m, pendientes = ['addon']) {
  mkdirSync(m.datos, { recursive: true });
  writeFileSync(join(m.datos, 'estado-roto.json'), JSON.stringify({ pendientes: pendientes.map((componente) => ({ componente, estado: 'sin_carpeta' })) }));
}

test('ronda 1 (M1): con la marca y sin tanda, el aviso propone reinstalar; dura aunque una comprobación salga bien', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa));
  marcarRoto(m);
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada', roto: true, reinstalar: true });
  assert.equal((await a.comprobar()).estado, 'hay');
  assert.equal(a.estado().roto, true);
  assert.equal(a.estado().reinstalar, true);
  assert.match(registro(), /instalador/);
});

test('ronda 1 (M1): con la marca y la tanda, el juego abierto también avisa (roto) y la tanda sigue', async () => {
  const m = montar();
  const { a, juego } = actualizador(m, redFalsa(publicar(m.t).mapa));
  await a.comprobar();
  await a.descargar();
  marcarRoto(m);
  juego.abierto = true;
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'esperando_juego', roto: true });
  assert.equal(a.estado().roto, true);
  assert.equal(a.estado().reinstalar, undefined);
  juego.abierto = false;
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon'] });
  assert.equal(a.estado().roto, undefined, 'reparado: la marca se archivó');
});

test('ronda 1 (M2): descargar no sustituye la tanda que espera reparación; primero se repara y después se baja lo nuevo', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t).mapa);
  const { a } = actualizador(m, red);
  await a.comprobar();
  await a.descargar();
  marcarRoto(m);
  red.mapa = publicar(m.t, { publicacion: 'v0.5.2-2026.11.12.1', fecha: '2026-11-12T12:00:00.000Z', componentes: { addon: { version: '0.5.2' } } }).mapa;
  assert.equal((await a.comprobar()).estado, 'hay');
  assert.deepEqual(await a.descargar(), { estado: 'listo', roto: true });
  assert.equal(a.estado().pendiente.publicacion, 'v0.5.1-2026.11.11.1');
  assert.ok(!red.llamadas.some((l) => l.url.endsWith('SnetForever-addon-0.5.2.snfpaq')));
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon'] });
  assert.equal(versionToc(m), '0.5.1');
  assert.ok(!existsSync(join(m.datos, 'estado-roto.json')));
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.equal(a.estado().pendiente.publicacion, 'v0.5.2-2026.11.12.1');
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon'] });
  assert.equal(versionToc(m), '0.5.2');
});

test('ronda 1 (M3): F5-2 se vuelve a comprobar al aplicar, contra lo instalado en ese momento', async () => {
  const m = montar();
  const { a, aplicadosEn } = actualizador(m, redFalsa(publicar(m.t).mapa));
  await a.comprobar();
  await a.descargar();
  // entre la bajada y la aplicación, los datos instalados pasan al esquema 2
  writeFileSync(join(m.addons, 'SnetForever_Rutas', 'nucleo.lua'), nucleoRutas('2026.11.10.1', 2));
  const antes = foto(m.addons);
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'error', codigo: 'compatibilidad' });
  assert.deepEqual(foto(m.addons), antes);
  assert.deepEqual(aplicadosEn, []);
  assert.equal(a.estado().pendiente, undefined, 'no se arregla reintentando: se descarta');
});

test('ronda 1 (M3): un addon que llega solo, con datos instalados que no se leen, no se instala', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa));
  await a.comprobar();
  await a.descargar();
  writeFileSync(join(m.addons, 'SnetForever_Misiones', 'nucleo.lua'), '-- sin la línea de la tabla\n');
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'error', codigo: 'compatibilidad' });
  assert.equal(versionToc(m), '0.5.0');
});

for (const [nombre, error, reintenta] of [
  ['paquete', new ErrorInstalar('paquete', 'no vale', { detalle: 'hash' }), false],
  ['compatibilidad', new ErrorInstalar('compatibilidad', 'no cuadra', { detalle: { componente: 'rutas', esquema: 2, pide: 1 } }), false],
  ['sin_permiso con EACCES', new ErrorInstalar('sin_permiso', 'no', { detalle: { etapa: 'cambiar', code: 'EACCES', deshecho: true } }), false],
  ['sin_permiso con EPERM', new ErrorInstalar('sin_permiso', 'no', { detalle: { etapa: 'cambiar', code: 'EPERM', deshecho: true } }), true],
  ['ocupado', new ErrorInstalar('ocupado', 'en uso', { detalle: { etapa: 'cambiar', code: 'EBUSY', deshecho: true } }), true],
  // tarea 13 (aparcado de la tarea 9): EIO, ENOSPC y EMFILE pueden pasar solos y también se reintentan
  ['fs con EIO', new ErrorInstalar('fs', 'no', { detalle: { etapa: 'cambiar', code: 'EIO', deshecho: true } }), true],
  ['fs con ENOSPC', new ErrorInstalar('fs', 'no', { detalle: { etapa: 'cambiar', code: 'ENOSPC', deshecho: true } }), true],
  ['fs con EMFILE', new ErrorInstalar('fs', 'no', { detalle: { etapa: 'cambiar', code: 'EMFILE', deshecho: true } }), true],
  ['fs con ENOTDIR', new ErrorInstalar('fs', 'no', { detalle: { etapa: 'cambiar', code: 'ENOTDIR', deshecho: true } }), false],
]) {
  test(`ronda 1 (M4): en estado roto, «${nombre}» ${reintenta ? 'se reintenta' : 'para los reintentos y propone reinstalar'}`, async () => {
    const m = montar();
    const { a } = actualizador(m, redFalsa(publicar(m.t).mapa), {
      instalar: async () => {
        throw error;
      },
    });
    await a.comprobar();
    await a.descargar();
    marcarRoto(m);
    const r = await a.aplicarSiSePuede();
    assert.deepEqual(r, { estado: 'error', codigo: error.code, roto: true, ...(reintenta ? {} : { reinstalar: true }) });
    assert.equal(Boolean(a.estado().pendiente), reintenta);
    if (!reintenta) {
      assert.equal(a.estado().reinstalar, true);
      assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada', roto: true, reinstalar: true });
    }
  });
}

test('ronda 1 (M5): al reparar no se baja de versión: con algo más nuevo instalado, la tanda se descarta y la marca se archiva', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const { a, aplicadosEn } = actualizador(m, redFalsa(pub.mapa));
  await a.comprobar();
  await a.descargar();
  marcarRoto(m);
  writeFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), toc('SnetForever', '0.5.2', 1)); // lo puso el instalador
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada' });
  assert.equal(versionToc(m), '0.5.2');
  assert.deepEqual(aplicadosEn, []);
  assert.equal(a.estado().pendiente, undefined);
  assert.equal(a.estado().roto, undefined);
  assert.equal(buscar(m.cuarentena, 'estado-roto.json').length, 1);
  assert.equal(buscar(m.cuarentena, `${pub.publicacion}/SnetForever-addon-0.5.1.snfpaq`).length, 1);
});

// Tarea 13 (aparcados de la tarea 9): la rama M5 mira primero lo que tenía pendiente la marca (la misma regla que
// componentes.mjs) y, si la archiva, quita también el ultimoError de antes (bienHecho).
test('tarea 13 (M5): con la marca archivada, el ultimoError «roto» de antes también se quita', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa));
  await a.comprobar();
  await a.descargar();
  marcarRoto(m);
  const ruta = join(m.datos, 'actualizacion.json');
  const e = JSON.parse(readFileSync(ruta, 'utf8'));
  writeFileSync(ruta, JSON.stringify({ ...e, ultimoError: { codigo: 'ocupado', cuando: '2026-11-11T13:00:00.000Z', roto: true } }));
  writeFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), toc('SnetForever', '0.5.2', 1));
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada' });
  assert.equal(a.estado().ultimoError, undefined);
  assert.equal(buscar(m.cuarentena, 'estado-roto.json').length, 1);
});

test('tarea 13 (M5): si la marca tenía pendiente otro componente que la tanda no cubre, no se archiva y se propone reinstalar', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa));
  await a.comprobar();
  await a.descargar();
  marcarRoto(m, ['addon', 'rutas']);
  writeFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), toc('SnetForever', '0.5.2', 1));
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada', roto: true, reinstalar: true });
  assert.ok(existsSync(join(m.datos, 'estado-roto.json')), 'la marca se queda: rutas sigue a medias');
  assert.equal(a.estado().pendiente, undefined, 'la tanda (más vieja que lo instalado) se descarta igual');
  assert.equal(a.estado().reinstalar, true);
});

test('tarea 13 (M5): una marca que no se entiende no se archiva', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t).mapa));
  await a.comprobar();
  await a.descargar();
  mkdirSync(m.datos, { recursive: true });
  writeFileSync(join(m.datos, 'estado-roto.json'), '{esto no es json');
  writeFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), toc('SnetForever', '0.5.2', 1));
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'nada', roto: true, reinstalar: true });
  assert.ok(existsSync(join(m.datos, 'estado-roto.json')));
});

// --- ronda 1: pruebas que faltaban (M7) ---

test('ronda 1 (M7): datos solos con un esquema pedido que no se sabe (addon sin X-SNF-EsquemaDatos ni datos legibles) no se ofrecen', async () => {
  const m = montar({ esquemaAddon: null });
  for (const c of ['SnetForever_Rutas', 'SnetForever_Misiones']) writeFileSync(join(m.addons, c, 'nucleo.lua'), '-- sin tabla\n');
  const red = redFalsa(publicar(m.t, { componentes: { rutas: { version: '2026.11.12.1' } } }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual(await a.comprobar(), {
    estado: 'hay', lista: [{ componente: 'rutas', de: '2026.11.10.1', a: '2026.11.12.1', saltado: 'compatibilidad' }],
  });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
});

test('ronda 1 (M7): el paquete guardado desapareció antes de aplicar → «fs», no se aplica nada y se volverá a bajar', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const { a, aplicadosEn } = actualizador(m, redFalsa(pub.mapa));
  await a.comprobar();
  await a.descargar();
  const carpeta = a.estado().pendiente.carpeta;
  renameSync(carpeta, `${carpeta}.aparte`);
  const antes = foto(m.addons);
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'error', codigo: 'fs' });
  assert.deepEqual(foto(m.addons), antes);
  assert.deepEqual(aplicadosEn, []);
  assert.equal(a.estado().pendiente, undefined);
  await a.comprobar();
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
});

test('ronda 1 (M7): el registro solo lleva pasos y códigos, nunca rutas', async () => {
  const m = montar();
  const pub = publicar(m.t);
  const red = redFalsa(pub.mapa);
  const { a } = actualizador(m, red);
  red.fallo = new ErrorRed('conexion', `sin conexión (${m.datos})`);
  await a.comprobar();
  red.fallo = null;
  await a.comprobar();
  await a.descargar();
  renameSync(a.estado().pendiente.carpeta, `${a.estado().pendiente.carpeta}.aparte`);
  await a.aplicarSiSePuede();
  const texto = registro();
  assert.ok(texto.length > 0);
  assert.ok(!texto.includes(tmpdir()), 'sin la carpeta temporal');
  assert.ok(!/Ñandú|Juegos Ñ|\\/.test(texto), 'sin rutas ni nombres de carpeta');
});

test('una publicación nueva sustituye a la pendiente: la carpeta vieja va a la cuarentena', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t).mapa);
  const { a } = actualizador(m, red);
  await a.comprobar();
  await a.descargar();
  red.mapa = publicar(m.t, { publicacion: 'v0.5.2-2026.11.12.1', fecha: '2026-11-12T12:00:00.000Z', componentes: { addon: { version: '0.5.2' } } }).mapa;
  await a.comprobar();
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.equal(a.estado().pendiente.publicacion, 'v0.5.2-2026.11.12.1');
  assert.deepEqual(readdirSync(join(m.datos, 'actualizaciones')), ['v0.5.2-2026.11.12.1']);
  assert.equal(buscar(m.cuarentena, 'v0.5.1-2026.11.11.1/SnetForever-addon-0.5.1.snfpaq').length, 1);
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon'] });
  assert.equal(versionToc(m), '0.5.2');
});

test('leerManifiestoFirmado verifica la firma antes de leer y da el manifiesto', () => {
  const m = montar();
  const pub = publicar(m.t);
  const bytes = pub.mapa.get(ORIGEN.manifiesto);
  assert.equal(leerManifiestoFirmado(bytes, pub.mapa.get(ORIGEN.firma), BUENA.publica).publicacion, pub.publicacion);
  assert.throws(() => leerManifiestoFirmado(bytes, pub.mapa.get(ORIGEN.firma), OTRA.publica), (e) => e.code === 'firma');
  assert.throws(() => leerManifiestoFirmado(Buffer.from('{"a":1}'), firmar(Buffer.from('{"a":1}'), BUENA.privada), BUENA.publica),
    (e) => e.code === 'esquema');
});

// --- Task 8: el addon de comercio (SnetForever_Comercio) se instala y se actualiza como los demás ---

const tocDeComercio = (addons) => join(addons, 'SnetForever_Comercio', 'SnetForever_Comercio.toc');
const COMERCIO_0_7 = { addon: { version: '0.7.0' }, comercio: { version: '0.7.0' } };

test('el instalador y la actualización ponen la carpeta SnetForever_Comercio', async () => {
  // 1. el instalador (la orden `instalar` de la CLI) con los cuatro paquetes de AddOns de {app}\paquetes
  const t = temporal();
  const raiz = join(t, 'Nuevo Ñ', 'World of Warcraft', '_forever_');
  mkdirSync(raiz, { recursive: true });
  writeFileSync(join(raiz, 'Wow.exe'), '');
  const datos = join(t, 'Datos Ñ');
  const env = { SNF_DATOS: datos, SNF_CUARENTENA: join(t, 'Cuarentena Ñ'), SNF_IDIOMA: 'es' };
  const pub = publicar(t, {
    publicacion: 'v0.7.0-2026.11.10.1',
    componentes: { addon: { version: '0.7.0' }, rutas: { version: '2026.11.10.1' }, misiones: { version: '2026.11.10.1' }, comercio: { version: '0.7.0' } },
  });
  const paquetes = join(t, 'paquetes');
  mkdirSync(paquetes);
  writeFileSync(join(paquetes, 'snetforever-manifiesto.json'), pub.mapa.get(ORIGEN.manifiesto));
  writeFileSync(join(paquetes, 'snetforever-manifiesto.json.sig'), pub.mapa.get(ORIGEN.firma));
  for (const [c, buffer] of Object.entries(pub.paquetes)) writeFileSync(join(paquetes, pub.manifiesto.componentes[c].archivo), buffer);
  const juego = { consultar: async (que) => (que === 'procesos' || que === 'unidades' ? [] : []) };
  const instalado = await ejecutarOrden(['instalar', '--addons', raiz, '--paquetes', paquetes], { env, clavePublica: BUENA.publica, juego });
  assert.equal(instalado.codigoSalida, 0, JSON.stringify(instalado.resultado));
  assert.deepEqual(instalado.resultado.instalados, ['addon', 'rutas', 'misiones', 'comercio']);
  const addons = join(raiz, 'Interface', 'AddOns');
  assert.match(readFileSync(tocDeComercio(addons), 'utf8'), /## Version: 0\.7\.0/);
  assert.ok(existsSync(join(addons, 'SnetForever_Comercio', 'ui', 'comercio.lua')));
  // las ranuras de respuestas y de precios siguen donde estaban (la app las crea; el comercio no las mueve)
  assert.ok(existsSync(join(addons, 'SnetForever_R001', 'SnetForever_R001.toc')));
  assert.ok(existsSync(join(addons, 'SnetForever_P01', 'SnetForever_P01.toc')));

  // 2. la actualización: un PC con el núcleo y los datos de la 0.5.0 y sin comercio recibe addon 0.7.0 y comercio 0.7.0
  const m = montar();
  assert.equal(existsSync(join(m.addons, 'SnetForever_Comercio')), false);
  const nueva = publicar(m.t, { componentes: COMERCIO_0_7 });
  const { a, aplicadosEn } = actualizador(m, redFalsa(nueva.mapa));
  assert.deepEqual((await a.comprobar()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.7.0' },
    { componente: 'comercio', de: null, a: '0.7.0' },
  ]);
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.deepEqual(Object.keys(a.estado().pendiente.componentes), ['addon', 'comercio']);
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon', 'comercio'] });
  assert.deepEqual(aplicadosEn, [['addon', 'comercio']]);
  assert.match(readFileSync(tocDeComercio(m.addons), 'utf8'), /## Version: 0\.7\.0/);
  assert.equal(versionToc(m), '0.7.0');
  assert.ok(existsSync(join(m.addons, 'RXPGuides', 'x.lua')), 'lo de otros no se toca');
  // al día: la misma publicación no vuelve a ofrecer nada
  assert.deepEqual(await a.comprobar(), { estado: 'sin_novedades' });
});

test('Task 8: una publicación nueva del comercio (0.7.1) se aplica sola, con el núcleo igual; lo viejo va a la cuarentena', async () => {
  const m = montar();
  const primera = actualizador(m, redFalsa(publicar(m.t, { componentes: COMERCIO_0_7 }).mapa));
  await primera.a.comprobar();
  await primera.a.descargar();
  await primera.a.aplicarSiSePuede();
  const red = redFalsa(publicar(m.t, {
    publicacion: 'v0.7.0-2026.11.12.1', fecha: '2026-11-12T12:00:00.000Z', componentes: { comercio: { version: '0.7.1' } },
  }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual((await a.comprobar()).lista, [{ componente: 'comercio', de: '0.7.0', a: '0.7.1' }]);
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['comercio'] });
  assert.match(readFileSync(tocDeComercio(m.addons), 'utf8'), /## Version: 0\.7\.1/);
  const viejo = buscar(m.cuarentena, 'viejo-SnetForever_Comercio/SnetForever_Comercio.toc');
  assert.equal(viejo.length, 1, 'el comercio de antes está en la cuarentena, no borrado');
  assert.match(readFileSync(join(m.cuarentena, viejo[0]), 'utf8'), /## Version: 0\.7\.0/);
  assert.equal(versionToc(m), '0.7.0', 'el núcleo no se toca');
});

test('Task 8: el comercio no cuenta para el esquema de datos: solo, entra aunque nada pida su esquema', async () => {
  const m = montar();
  const { a } = actualizador(m, redFalsa(publicar(m.t, { componentes: { comercio: { version: '0.7.0' } } }).mapa));
  assert.deepEqual((await a.comprobar()).lista, [{ componente: 'comercio', de: null, a: '0.7.0' }]);
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['comercio'] });
  assert.ok(existsSync(tocDeComercio(m.addons)));
});

test('Task 8: si el addon sale saltado por el esquema de datos, el comercio se salta con él (y no se baja nada)', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { componentes: { addon: { version: '0.7.0', esquema: 2 }, comercio: { version: '0.7.0' } } }).mapa);
  const { a } = actualizador(m, red);
  assert.deepEqual(await a.comprobar(), {
    estado: 'hay', lista: [
      { componente: 'addon', de: '0.5.0', a: '0.7.0', saltado: 'compatibilidad' },
      { componente: 'comercio', de: null, a: '0.7.0', saltado: 'compatibilidad' },
    ],
  });
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.equal(red.llamadas.filter((l) => l.url.endsWith('.snfpaq')).length, 0);
  assert.equal(existsSync(join(m.addons, 'SnetForever_Comercio')), false);
});

// --- Task 8, ronda 3: el resultado de un error HTTP dice el código HTTP (para saber si es pasajero) ---

test('Task 8, ronda 3: un HTTP 503 y un 404 salen con codigo «estado» y su número en `http`', async () => {
  for (const http of [503, 404]) {
    const m = montar();
    const red = redFalsa(publicar(m.t).mapa);
    red.fallo = new ErrorRed('estado', `HTTP ${http} en x`, { estado: http });
    const { a } = actualizador(m, red);
    assert.deepEqual(await a.comprobar(), { estado: 'error', codigo: 'estado', http });
  }
  const m = montar();
  const red = redFalsa(publicar(m.t).mapa);
  red.fallo = new ErrorRed('conexion', 'sin red');
  assert.deepEqual(await actualizador(m, red).a.comprobar(), { estado: 'error', codigo: 'conexion' });
});

// --- Task 8, ronda 1: el núcleo 0.7.0 y el comercio solo entran juntos, con una app que conoce el comercio ---

const CONOCE = { appMinima: '0.7.0' };
const NUCLEO_Y_COMERCIO = { addon: { version: '0.7.0', ...CONOCE }, comercio: { version: '0.7.0', ...CONOCE } };

test('Task 8, ronda 1: la app 0.7.0 pone el núcleo y el comercio juntos, en una sola tanda (primero el núcleo)', async () => {
  const m = montar();
  const { a, aplicadosEn } = actualizador(m, redFalsa(publicar(m.t, { componentes: NUCLEO_Y_COMERCIO }).mapa), { versionApp: '0.7.0' });
  assert.deepEqual((await a.comprobar()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.7.0' },
    { componente: 'comercio', de: null, a: '0.7.0' },
  ]);
  assert.deepEqual(await a.descargar(), { estado: 'listo' });
  assert.deepEqual(await a.aplicarSiSePuede(), { estado: 'aplicado', aplicados: ['addon', 'comercio'] });
  assert.deepEqual(aplicadosEn, [['addon', 'comercio']]);
  assert.equal(versionToc(m), '0.7.0');
  assert.match(readFileSync(tocDeComercio(m.addons), 'utf8'), /## Version: 0\.7\.0/);
});

test('Task 8, ronda 1: con una app anterior a la 0.7.0 y sin la app nueva en la tanda, ni el núcleo ni el comercio se bajan ni se tocan', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const red = redFalsa(publicar(m.t, { componentes: NUCLEO_Y_COMERCIO }).mapa);
  const { a } = actualizador(m, red, { versionApp: '0.6.1' });
  assert.deepEqual((await a.comprobar()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.7.0', saltado: 'app_minima' },
    { componente: 'comercio', de: null, a: '0.7.0', saltado: 'app_minima' },
  ]);
  assert.deepEqual(await a.descargar(), { estado: 'nada' });
  assert.equal(red.llamadas.filter((l) => l.url.endsWith('.snfpaq')).length, 0);
  assert.deepEqual(foto(m.addons), antes, 'el núcleo de antes (con su comercio dentro) queda entero');
});

test('Task 8, ronda 1: una app 0.6.1 con la tanda que trae la app 0.7.0 la recibe (lo único que cambia es la app que corre)', async () => {
  const m = montar();
  const red = redFalsa(publicar(m.t, { componentes: { ...NUCLEO_Y_COMERCIO, app: { version: '0.7.0' } } }).mapa);
  const { a } = actualizador(m, red, { versionApp: '0.6.1', aplicarApp: async () => {} });
  const lista = (await a.comprobar()).lista;
  assert.equal(lista.find((i) => i.componente === 'app').a, '0.7.0');
  assert.equal(lista.find((i) => i.componente === 'app').saltado, undefined);
});
