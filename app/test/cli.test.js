// Pruebas de app/src/instalador/cli.mjs y app/ayudantes/retirar.ps1 (fase 5, tarea 12; vigilancias 1, 2 y 3): las
// órdenes que usa el instalador de Inno (F6): detectar, juego-abierto, instalar, comprobar-ia, cerrar-app, desinstalar,
// desempaquetar (F5-4) y preparar. Nunca se borra nada (F5-5).
//
// Las pruebas NUNCA tocan el juego de verdad, la carpeta de datos de verdad ni ningún proceso ajeno:
// - un juego falso en `<tmp>\José Ñandú\World of Warcraft\_forever_` (Wow.exe vacío) y un `consultar` inyectado con la
//   lista de procesos que toque;
// - una publicación hecha aquí mismo (empaquetar + una clave temporal de generateKeyPairSync);
// - el `claude` y el `codex` falsos de la fase 4;
// - para cerrar-app, un `node -e` lanzado aquí (solo se para ese PID, el nuestro, y solo si se queda colgado).
// La única prueba que pregunta a Windows de verdad (juego.ps1, que solo lee) es la de la vigilancia 3, con el cli.mjs
// real como proceso y SNF_DATOS, SNF_CUARENTENA y SNF_ADDONS en carpetas temporales.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { empaquetar } from '../src/actualizar/paquete.mjs';
import { RANURAS, nombreRanura } from '../src/buzon.mjs';
import { RANURAS_PRECIOS } from '../src/comercio/precios-lua.mjs';
import { POWERSHELL } from '../src/captura.mjs';
import { GUIA_IA, TEXTOS_CLI } from '../src/textos.mjs';
import { CODIGOS_SALIDA, ejecutarOrden, escribirSalida } from '../src/instalador/cli.mjs';

const WIN = process.platform === 'win32';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(APP, 'src', 'instalador', 'cli.mjs');
const RETIRAR = join(APP, 'ayudantes', 'retirar.ps1');
const FALSO_CLAUDE = join(APP, 'test', 'falso-claude', 'claude.mjs');
const FALSO_CODEX = join(APP, 'test', 'falso-codex', 'codex.mjs');

const TMP = mkdtempSync(join(tmpdir(), 'snf-cli-'));
// Una ruta en otra unidad que la de las carpetas temporales. Nunca se escribe en ella: solo se compara su raíz.
const OTRA_UNIDAD = `${/^q/i.test(TMP) ? 'R' : 'Q'}:\\Programs\\SnetForever`;
let n = 0;
const nueva = (nombre = 'c') => {
  n += 1;
  const d = join(TMP, `${nombre}${n}`);
  mkdirSync(d, { recursive: true });
  return d;
};

// El registro (registro.mjs) y el claude/codex falsos usan process.env: nunca la carpeta de datos de verdad.
const COPIA = { ...process.env };
process.env.SNF_DATOS = nueva('datos-proceso');
after(() => {
  for (const k of Object.keys(process.env)) if (!(k in COPIA)) delete process.env[k];
  Object.assign(process.env, COPIA);
});

// ---------- la publicación de prueba ----------

function claves() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publica: publicKey.export({ type: 'spki', format: 'pem' }), privada: privateKey };
}
const BUENA = claves();
const OTRA = claves();
const sha = (b) => createHash('sha256').update(b).digest('hex');

function arbol(raiz, archivos) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const final = join(raiz, ...ruta.split('/'));
    mkdirSync(dirname(final), { recursive: true });
    writeFileSync(final, contenido);
  }
  return raiz;
}

const toc = (titulo, version, esquema = null) => `## Interface: 16001\n## Title: ${titulo}\n## Version: ${version}\n`
  + `${esquema === null ? '' : `## X-SNF-EsquemaDatos: ${esquema}\n`}\nnucleo.lua\n`;
const ARCHIVOS = {
  addon: (v) => ({ 'SnetForever/SnetForever.toc': toc('SnetForever', v, 1), 'SnetForever/nucleo.lua': `SnetForever = {VERSION = "${v}"}\n` }),
  rutas: (v) => ({
    'SnetForever_Rutas/SnetForever_Rutas.toc': toc('SnetForever_Rutas', v),
    'SnetForever_Rutas/nucleo.lua': `SNF_RUTAS = {version="${v}",esquema=1,guias={},grupos={}}\n`,
  }),
  misiones: (v) => ({
    'SnetForever_Misiones/SnetForever_Misiones.toc': toc('SnetForever_Misiones', v),
    'SnetForever_Misiones/nucleo.lua': `SNF_MISIONES = {version="${v}",esquema=1,quest={}}\n`,
  }),
  // el comercio (0.7.0, Task 8): sin esquema de datos
  comercio: (v) => ({
    'SnetForever_Comercio/SnetForever_Comercio.toc': `${toc('SnetForever_Comercio', v)}`,
    'SnetForever_Comercio/ui/comercio.lua': `-- comercio ${v}\n`,
  }),
};
const VERSIONES = { addon: '0.5.0', rutas: '2026.11.10.1', misiones: '2026.11.10.1', comercio: '0.5.0' };

/**
 * Deja en una carpeta nueva lo que Inno pone en `{app}\paquetes`: el manifiesto, su firma y los tres paquetes.
 * `omitir`: un componente cuyo paquete no se escribe. `privada`: la clave con la que se firma.
 */
function publicacion({ omitir = null, privada = BUENA.privada, versiones = VERSIONES } = {}) {
  const dir = nueva('paquetes');
  const componentes = {};
  for (const [c, version] of Object.entries(versiones)) {
    const raiz = arbol(nueva('fuente'), ARCHIVOS[c](version));
    const datos = c === 'comercio' ? {} : { esquemaDatos: 1 };
    const buffer = empaquetar({ componente: c, version, raiz, ...datos });
    const archivo = `SnetForever-${c}-${version}.snfpaq`;
    componentes[c] = { version, archivo, tamano: buffer.length, sha256: sha(buffer), ...datos };
    if (c === 'addon') componentes[c].appMinima = '0.5.0';
    if (c !== omitir) writeFileSync(join(dir, archivo), buffer);
  }
  const manifiesto = {
    esquema: 1, producto: 'SnetForever', publicacion: 'v0.5.0-2026.11.10.1', fecha: '2026-11-10T12:00:00.000Z', componentes,
    notas: { es: 'Primera', en: 'First' },
  };
  const bytes = Buffer.from(`${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
  writeFileSync(join(dir, 'snetforever-manifiesto.json'), bytes);
  writeFileSync(join(dir, 'snetforever-manifiesto.json.sig'), `${sign(null, bytes, privada).toString('base64')}\n`);
  return { dir, componentes };
}

// ---------- el PC de prueba ----------

/** Un PC de prueba: el juego falso (con acentos y espacios), RXPGuides, la carpeta de datos y la cuarentena. */
function pc() {
  const t = nueva('pc');
  const raiz = join(t, 'José Ñandú', 'World of Warcraft', '_forever_');
  const addons = join(raiz, 'Interface', 'AddOns');
  arbol(addons, { 'RXPGuides/RXPGuides.toc': '## Title: RXP\n', 'RXPGuides/x.lua': '-- de otro\n' });
  writeFileSync(join(raiz, 'Wow.exe'), '');
  const datos = join(t, 'Datos Ñ');
  const cuarentena = join(t, 'Cuarentena Ñ');
  return { t, raiz, addons, datos, cuarentena, env: { SNF_DATOS: datos, SNF_CUARENTENA: cuarentena, SNF_IDIOMA: 'es' } };
}

/**
 * Un `juego` falso: `abierto` = la ruta de un Wow.exe abierto (o null); `falla`: consultar('procesos') lanza;
 * `abreTras`: el juego se abre (`abierto`) a partir de esa consulta de procesos (1 = la primera); `registro`: los
 * InstallPath que da consultar('registro').
 */
function juegoFalso({ abierto = null, falla = false, abreTras = 1, registro = [] } = {}) {
  const llamadas = [];
  let procesos = 0;
  return {
    llamadas,
    consultar: async (que) => {
      llamadas.push(que);
      if (que === 'procesos') {
        procesos += 1;
        if (falla) throw new Error('PowerShell no contestó');
        return abierto && procesos >= abreTras ? [{ pid: 4242, ruta: abierto }] : [];
      }
      return que === 'registro' ? registro : [];
    },
  };
}

// Todos los archivos de `dir` (rutas relativas con /) con su contenido en base64.
function foto(dir) {
  const salida = {};
  if (!existsSync(dir)) return salida;
  const recorrer = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = join(d, e.name);
      if (e.isDirectory()) recorrer(r);
      else salida[relative(dir, r).replace(/\\/g, '/')] = readFileSync(r).toString('base64');
    }
  };
  recorrer(dir);
  return salida;
}
const cuantos = (dir) => Object.keys(foto(dir)).length;
const leerJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

const instalar = (m, paquetes, opciones = {}) => ejecutarOrden(
  ['instalar', '--addons', m.addons, '--paquetes', paquetes], { env: m.env, clavePublica: BUENA.publica, juego: juegoFalso(), ...opciones },
);

// ---------- textos (F6 y F7) ----------

test('F7: GUIA_IA tiene las 4 líneas en es y en, sin pedir contraseñas', () => {
  for (const idioma of ['es', 'en']) {
    assert.equal(GUIA_IA[idioma].length, 4, idioma);
    for (const linea of GUIA_IA[idioma]) assert.ok(typeof linea === 'string' && linea.length > 0 && !/\n/.test(linea), idioma);
  }
  assert.match(GUIA_IA.es[0], /nunca te pedirá contraseñas/);
  assert.match(GUIA_IA.es[1], /claude\.com\/claude-code/);
  assert.match(GUIA_IA.es[2], /npm install -g @openai\/codex/);
  assert.match(GUIA_IA.es[3], /«Volver a comprobar»/);
  assert.match(GUIA_IA.en[0], /never ask you for passwords/);
  assert.match(GUIA_IA.en[2], /npm install -g @openai\/codex/);
});

test('F6: los mensajes de la CLI están en es y en con las mismas claves, y un código de salida por código', () => {
  const claves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v, `${p}${k}.`) : [`${p}${k}`]));
  assert.deepEqual(claves(TEXTOS_CLI.es).sort(), claves(TEXTOS_CLI.en).sort());
  assert.deepEqual(CODIGOS_SALIDA, { ok: 0, juego_abierto: 10, carpeta: 11, sin_permiso: 12, paquete: 13, ocupado: 14, fallo: 1 });
  for (const codigo of Object.keys(CODIGOS_SALIDA)) {
    if (codigo !== 'ok') assert.ok(TEXTOS_CLI.es.codigos[codigo] && TEXTOS_CLI.en.codigos[codigo], codigo);
  }
  assert.match(TEXTOS_CLI.es.codigos.juego_abierto, /Cierra el juego para terminar/);
});

// ---------- detectar y juego-abierto ----------

test('detectar: las candidatas (SNF_ADDONS primero), la elegida y la raíz de la cuarentena, sin crear nada', async () => {
  const m = pc();
  const juego = juegoFalso();
  const { codigoSalida, resultado } = await ejecutarOrden(['detectar'], { env: { ...m.env, SNF_ADDONS: m.addons }, juego });
  assert.equal(codigoSalida, 0);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.codigo, 'ok');
  assert.equal(resultado.elegida, m.raiz);
  assert.deepEqual(resultado.candidatas, [{ addons: m.addons, raiz: m.raiz, origen: 'env' }]);
  assert.equal(resultado.cuarentena, m.cuarentena);
  assert.match(resultado.mensaje, /José Ñandú/);
  assert.ok(!existsSync(m.cuarentena), 'detectar no crea la cuarentena');
  assert.deepEqual([...juego.llamadas].sort(), ['procesos', 'registro', 'unidades']);
});

test('detectar: sin juego, elegida null; y si consultar falla, sigue con lo demás', async () => {
  const m = pc();
  const juego = { consultar: async () => { throw new Error('sin PowerShell'); } };
  const { codigoSalida, resultado } = await ejecutarOrden(['detectar'], { env: m.env, juego });
  assert.equal(codigoSalida, 0);
  assert.equal(resultado.elegida, null);
  assert.deepEqual(resultado.candidatas, []);
  assert.equal(resultado.mensaje, TEXTOS_CLI.es.detectarNada);
});

test('ronda 1, I1: detectar --instalacion da la cuarentena de la instalación, en la misma unidad que {app}', async () => {
  const m = pc();
  const mismaUnidad = join(m.t, 'Programs', 'SnetForever');
  const r = await ejecutarOrden(['detectar', '--instalacion', mismaUnidad], { env: m.env, juego: juegoFalso() });
  assert.equal(r.resultado.cuarentenaInstalacion, m.cuarentena, 'misma unidad: la misma raíz');
  const otra = await ejecutarOrden(['detectar', '--instalacion', OTRA_UNIDAD], { env: m.env, juego: juegoFalso() });
  assert.equal(otra.resultado.cuarentena, m.cuarentena);
  assert.equal(otra.resultado.cuarentenaInstalacion, join(m.datos, 'cuarentena'), 'otra unidad: la de la carpeta de datos');
  assert.ok(!existsSync(join(m.datos, 'cuarentena')), 'detectar no crea nada');
  // la línea 3 del .txt es la que Inno pasa a retirar.ps1 (-A): la de la instalación
  const salida = join(m.t, 'salida', 'snf-detectar');
  escribirSalida(salida, 'detectar', otra.resultado);
  const lineas = readFileSync(`${salida}.txt`).subarray(3).toString('utf8').replace(/\r\n$/, '').split('\r\n');
  assert.equal(lineas[2], join(m.datos, 'cuarentena'));
});

test('juego-abierto: 0 cerrado, 10 con el Wow.exe de _forever_ abierto y 10 si no se sabe', async () => {
  const m = pc();
  const cerrado = await ejecutarOrden(['juego-abierto'], { env: m.env, juego: juegoFalso() });
  assert.deepEqual([cerrado.codigoSalida, cerrado.resultado.abierto, cerrado.resultado.codigo], [0, false, 'ok']);
  const abierto = await ejecutarOrden(['juego-abierto'], { env: m.env, juego: juegoFalso({ abierto: join(m.raiz, 'Wow.exe') }) });
  assert.deepEqual([abierto.codigoSalida, abierto.resultado.abierto, abierto.resultado.codigo, abierto.resultado.ok], [10, true, 'juego_abierto', false]);
  assert.match(abierto.resultado.mensaje, /Cierra el juego para terminar/);
  const nose = await ejecutarOrden(['juego-abierto'], { env: m.env, juego: juegoFalso({ falla: true }) });
  assert.deepEqual([nose.codigoSalida, nose.resultado.abierto], [10, true]);
});

// ---------- instalar ----------

test('instalar: los cuatro componentes de AddOns, las ranuras y config.json con addons, cuarentena, instalada y actualizaciones', async () => {
  const m = pc();
  mkdirSync(m.datos, { recursive: true });
  writeFileSync(join(m.datos, 'config.json'), JSON.stringify({ motor: 'codex', actualizaciones: { auto: false, otra: 1 } }));
  const { dir } = publicacion();
  const { codigoSalida, resultado } = await instalar(m, dir);
  assert.equal(codigoSalida, 0, JSON.stringify(resultado));
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.instalados, ['addon', 'rutas', 'misiones', 'comercio']);
  assert.equal(resultado.ranurasCreadas, RANURAS);
  assert.ok(typeof resultado.cuarentena === 'string' && resultado.cuarentena.startsWith(m.cuarentena), resultado.cuarentena);
  for (const c of ['SnetForever', 'SnetForever_Rutas', 'SnetForever_Misiones', 'SnetForever_Comercio']) assert.ok(existsSync(join(m.addons, c, `${c}.toc`)), c);
  for (let i = 1; i <= RANURAS; i++) assert.ok(existsSync(join(m.addons, nombreRanura(i), `${nombreRanura(i)}.toc`)), nombreRanura(i));
  assert.ok(existsSync(join(m.addons, 'RXPGuides', 'x.lua')));
  const config = leerJson(join(m.datos, 'config.json'));
  assert.equal(config.addons, m.addons);
  assert.equal(config.cuarentena, m.cuarentena);
  assert.equal(config.instalada, true);
  assert.deepEqual(config.actualizaciones, { auto: false, otra: 1 }, 'ronda 1, duda 6: el false del jugador no se pisa');
  assert.equal(config.motor, 'codex', 'no se pierden las demás claves');
  // el config.json de antes está en la cuarentena de datos
  const viejos = Object.entries(foto(join(m.datos, 'cuarentena'))).filter(([r]) => r.endsWith('/config.json'));
  assert.equal(viejos.length, 1);
  assert.equal(JSON.parse(Buffer.from(viejos[0][1], 'base64').toString('utf8')).motor, 'codex');
});

test('instalar: --addons puede ser la carpeta _forever_ (config.addons queda en su Interface\\AddOns, que se crea si falta)', async () => {
  const m = pc();
  const sinAddons = join(m.t, 'Otro Ñ', 'World of Warcraft', '_forever_');
  mkdirSync(sinAddons, { recursive: true });
  writeFileSync(join(sinAddons, 'Wow.exe'), '');
  const { dir } = publicacion();
  const { codigoSalida, resultado } = await ejecutarOrden(['instalar', '--addons', sinAddons, '--paquetes', dir], {
    env: m.env, clavePublica: BUENA.publica, juego: juegoFalso(),
  });
  assert.equal(codigoSalida, 0, JSON.stringify(resultado));
  const addons = join(sinAddons, 'Interface', 'AddOns');
  assert.equal(leerJson(join(m.datos, 'config.json')).addons, addons);
  assert.deepEqual(leerJson(join(m.datos, 'config.json')).actualizaciones, { auto: true }, 'sin config de antes, auto: true');
  assert.ok(existsSync(join(addons, 'SnetForever', 'SnetForever.toc')));
});

test('instalar dos veces: el addon de antes va a la cuarentena y el número de archivos nunca baja', async () => {
  const m = pc();
  const primera = publicacion();
  assert.equal((await instalar(m, primera.dir)).codigoSalida, 0);
  const antes = cuantos(m.t);
  const segunda = publicacion({ versiones: { addon: '0.5.1', rutas: '2026.11.11.1', misiones: '2026.11.11.1', comercio: '0.5.1' } });
  const { codigoSalida, resultado } = await instalar(m, segunda.dir);
  assert.equal(codigoSalida, 0, JSON.stringify(resultado));
  assert.equal(resultado.ranurasCreadas, 0);
  assert.ok(cuantos(m.t) >= antes, `${cuantos(m.t)} < ${antes}`);
  assert.match(readFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), 'utf8'), /## Version: 0\.5\.1/);
  const viejo = Object.entries(foto(m.cuarentena)).find(([r]) => r.endsWith('viejo-SnetForever/SnetForever.toc'));
  assert.ok(viejo, 'el addon de antes está en la cuarentena');
  assert.match(Buffer.from(viejo[1], 'base64').toString('utf8'), /## Version: 0\.5\.0/);
  // lo mismo con el comercio: el de antes a la cuarentena, nunca borrado
  assert.match(readFileSync(join(m.addons, 'SnetForever_Comercio', 'SnetForever_Comercio.toc'), 'utf8'), /## Version: 0\.5\.1/);
  const viejoComercio = Object.entries(foto(m.cuarentena)).find(([r]) => r.endsWith('viejo-SnetForever_Comercio/SnetForever_Comercio.toc'));
  assert.ok(viejoComercio, 'el comercio de antes está en la cuarentena');
  assert.match(Buffer.from(viejoComercio[1], 'base64').toString('utf8'), /## Version: 0\.5\.0/);
});

test('vigilancia 1: con el juego abierto (o sin saberlo), instalar da 10 y no cambia nada', async () => {
  const casos = [
    ['abierto', (m) => juegoFalso({ abierto: join(m.raiz, 'Wow.exe') })],
    ['no se sabe', () => juegoFalso({ falla: true })],
  ];
  for (const [nombre, hacerJuego] of casos) {
    const m = pc();
    mkdirSync(m.datos, { recursive: true });
    writeFileSync(join(m.datos, 'config.json'), '{"motor":"claude"}');
    const { dir } = publicacion();
    const antes = foto(m.t);
    const { codigoSalida, resultado } = await instalar(m, dir, { juego: hacerJuego(m) });
    assert.equal(codigoSalida, 10, nombre);
    assert.equal(resultado.codigo, 'juego_abierto', nombre);
    assert.match(resultado.mensaje, /Cierra el juego para terminar/, nombre);
    assert.deepEqual(foto(m.t), antes, `${nombre}: no cambia nada`);
    assert.ok(!existsSync(m.cuarentena), nombre);
  }
});

test('instalar: una carpeta que no es la del juego da 11, y sin --addons también', async () => {
  const m = pc();
  const otra = nueva('otra');
  const { dir } = publicacion();
  const r = await ejecutarOrden(['instalar', '--addons', otra, '--paquetes', dir], { env: m.env, clavePublica: BUENA.publica, juego: juegoFalso() });
  assert.deepEqual([r.codigoSalida, r.resultado.codigo, r.resultado.ok], [11, 'carpeta', false]);
  assert.equal(r.resultado.mensaje, TEXTOS_CLI.es.codigos.carpeta);
  const sin = await ejecutarOrden(['instalar', '--paquetes', dir], { env: m.env, clavePublica: BUENA.publica, juego: juegoFalso() });
  assert.equal(sin.codigoSalida, 11);
  assert.ok(!existsSync(join(m.addons, 'SnetForever')));
});

test('vigilancia 2: un paquete que falta, la firma de otra clave, sin firma o un hash que no cuadra dan 13 y no instalan nada', async () => {
  const m = pc();
  const casos = [
    ['falta un paquete', publicacion({ omitir: 'misiones' }).dir, BUENA.publica],
    ['firma de otra clave', publicacion({ privada: OTRA.privada }).dir, BUENA.publica],
    ['sin --paquetes', null, BUENA.publica],
  ];
  const sinFirma = publicacion();
  renameSync(join(sinFirma.dir, 'snetforever-manifiesto.json.sig'), join(nueva('aparte'), 'firma.sig'));
  casos.push(['sin la firma', sinFirma.dir, BUENA.publica]);
  const cambiado = publicacion();
  const archivo = join(cambiado.dir, cambiado.componentes.rutas.archivo);
  const bytes = readFileSync(archivo);
  bytes[bytes.length - 1] ^= 0xff;
  writeFileSync(archivo, bytes); // un archivo que acaba de crear esta prueba
  casos.push(['un byte cambiado, aunque no haya clave', cambiado.dir, null]);
  for (const [nombre, dir, clavePublica] of casos) {
    const argv = dir === null ? ['instalar', '--addons', m.addons] : ['instalar', '--addons', m.addons, '--paquetes', dir];
    const r = await ejecutarOrden(argv, { env: m.env, clavePublica, juego: juegoFalso() });
    assert.equal(r.codigoSalida, 13, `${nombre}: ${JSON.stringify(r.resultado)}`);
    assert.equal(r.resultado.codigo, 'paquete', nombre);
    assert.equal(r.resultado.mensaje, TEXTOS_CLI.es.codigos.paquete, nombre);
  }
  assert.deepEqual(readdirSync(m.addons), ['RXPGuides']);
  assert.ok(!existsSync(join(m.datos, 'config.json')));
});

test('instalar sin clave pública (CLAVE_PUBLICA = null): basta con el tamaño y el SHA-256 del manifiesto', async () => {
  const m = pc();
  const sinFirma = publicacion();
  renameSync(join(sinFirma.dir, 'snetforever-manifiesto.json.sig'), join(nueva('aparte'), 'firma.sig'));
  const r = await ejecutarOrden(['instalar', '--addons', m.addons, '--paquetes', sinFirma.dir], { env: m.env, clavePublica: null, juego: juegoFalso() });
  assert.equal(r.codigoSalida, 0, JSON.stringify(r.resultado));
});

// ---------- vigilancia 3: el cli.mjs real como proceso, con --salida ----------

test('vigilancia 3: node cli.mjs detectar --salida "<tmp>\\Sal ida\\r" escribe r.json y r.txt (BOM y tres líneas)', () => {
  const m = pc();
  const salida = join(m.t, 'Sal ida', 'r');
  const r = spawnSync(process.execPath, [CLI, 'detectar', '--idioma', 'es', '--salida', salida], {
    env: { ...process.env, ...m.env, SNF_ADDONS: m.addons }, encoding: 'utf8', timeout: 90_000, windowsHide: true,
  });
  assert.equal(r.status, 0, r.stderr);
  const linea = JSON.parse(r.stdout.trim());
  assert.equal(linea.elegida, m.raiz);
  assert.ok(existsSync(`${salida}.json`));
  assert.deepEqual(leerJson(`${salida}.json`), linea);
  const txt = readFileSync(`${salida}.txt`);
  assert.deepEqual([...txt.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 con BOM');
  const lineas = txt.subarray(3).toString('utf8').replace(/\r\n$/, '').split('\r\n');
  assert.equal(lineas.length, 3, JSON.stringify(lineas));
  assert.equal(lineas[0], linea.mensaje);
  assert.equal(lineas[1], m.raiz);
  assert.ok(lineas[1].includes('José Ñandú'));
  assert.equal(lineas[2], m.cuarentena);
});

test('--salida: si los archivos ya existen, los de antes se apartan al lado (no se pisan) y el .txt tiene líneas vacías', async () => {
  const m = pc();
  const salida = join(m.t, 'snf-juego-abierto');
  writeFileSync(`${salida}.txt`, 'viejo');
  const r = spawnSync(process.execPath, [CLI, 'orden-que-no-existe', '--idioma', 'en', '--salida', salida], {
    env: { ...process.env, ...m.env }, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  });
  assert.equal(r.status, 1, r.stderr);
  const lineas = readFileSync(`${salida}.txt`).subarray(3).toString('utf8').replace(/\r\n$/, '').split('\r\n');
  assert.deepEqual(lineas.slice(1), ['', '']);
  assert.match(lineas[0], /unknown command/i);
  const viejos = readdirSync(m.t).filter((x) => x.startsWith('snf-juego-abierto-') && x.endsWith('.txt'));
  assert.equal(viejos.length, 1);
  assert.equal(readFileSync(join(m.t, viejos[0]), 'utf8'), 'viejo');
});

// ---------- comprobar-ia ----------

test('comprobar-ia: con Claude Code en auth_ok, claude.estado = ok y guia: null', async () => {
  const m = pc();
  process.env.FALSO_MODO = 'auth_ok';
  try {
    const { codigoSalida, resultado } = await ejecutarOrden(['comprobar-ia'], {
      env: { ...m.env, SNF_CLAUDE: FALSO_CLAUDE, SNF_CODEX: FALSO_CODEX },
    });
    assert.equal(codigoSalida, 0);
    assert.equal(resultado.claude.estado, 'ok');
    assert.equal(resultado.claude.version, '2.1.0');
    assert.notEqual(resultado.codex.estado, 'ok');
    assert.equal(resultado.guia, null);
    assert.match(resultado.mensaje, /Claude Code/);
  } finally {
    delete process.env.FALSO_MODO;
  }
});

test('comprobar-ia: sin sesión en ninguno, la guía (4 líneas) en el idioma pedido', async () => {
  const m = pc();
  process.env.FALSO_MODO = 'auth_no';
  try {
    const env = { ...m.env, SNF_CLAUDE: FALSO_CLAUDE, SNF_CODEX: FALSO_CODEX };
    const { codigoSalida, resultado } = await ejecutarOrden(['comprobar-ia'], { env });
    assert.equal(codigoSalida, 0);
    assert.equal(resultado.claude.estado, 'sin_sesion');
    assert.equal(resultado.codex.estado, 'sin_sesion');
    assert.equal(resultado.guia.length, 4);
    assert.match(resultado.guia[0], /nunca te pedirá contraseñas/);
    assert.deepEqual(resultado.guia, GUIA_IA.es);
    assert.equal(resultado.mensaje, GUIA_IA.es.join(' '));
    const en = await ejecutarOrden(['comprobar-ia', '--idioma', 'en'], { env });
    assert.deepEqual(en.resultado.guia, GUIA_IA.en);
  } finally {
    delete process.env.FALSO_MODO;
  }
});

// ---------- cerrar-app ----------

test('cerrar-app: con el cerrojo de un pid vivo, pide salir (salir.peticion) y espera a que se suelte, sin matar nada', async () => {
  const m = pc();
  mkdirSync(m.datos, { recursive: true });
  const peticion = join(m.datos, 'salir.peticion');
  // la «app»: un node que termina en cuanto ve salir.peticion
  const hijo = spawn(process.execPath, ['-e', `const fs=require('fs');setInterval(()=>{if(fs.existsSync(process.argv[1]))process.exit(0)},50)`, peticion], {
    stdio: 'ignore', windowsHide: true,
  });
  const fuera = new Promise((r) => hijo.once('exit', r));
  try {
    await new Promise((r) => hijo.once('spawn', r));
    writeFileSync(join(m.datos, 'app.lock'), JSON.stringify({ pid: hijo.pid, inicio: Date.now() }));
    const inicio = Date.now();
    const { codigoSalida, resultado } = await ejecutarOrden(['cerrar-app'], { env: m.env, juego: juegoFalso() });
    assert.equal(codigoSalida, 0, JSON.stringify(resultado));
    assert.equal(resultado.cerrada, true);
    assert.equal(resultado.estaba, true);
    assert.ok(Date.now() - inicio < 15_000);
    assert.ok(existsSync(peticion));
    assert.ok(existsSync(join(m.datos, 'app.lock')), 'el cerrojo no se borra');
  } finally {
    if (hijo.exitCode === null && hijo.signalCode === null) hijo.kill(); // solo el que lanzó esta prueba
    await fuera;
  }
});

test('cerrar-app: sin cerrojo o con el cerrojo soltado no hay nada que cerrar (y no crea salir.peticion)', async () => {
  const m = pc();
  const sin = await ejecutarOrden(['cerrar-app'], { env: m.env });
  assert.deepEqual([sin.codigoSalida, sin.resultado.cerrada, sin.resultado.estaba], [0, true, false]);
  mkdirSync(m.datos, { recursive: true });
  writeFileSync(join(m.datos, 'app.lock'), JSON.stringify({ pid: 0, inicio: 0 }));
  const soltado = await ejecutarOrden(['cerrar-app'], { env: m.env });
  assert.deepEqual([soltado.codigoSalida, soltado.resultado.cerrada, soltado.resultado.estaba], [0, true, false]);
  assert.ok(!existsSync(join(m.datos, 'salir.peticion')));
});

test('cerrar-app: si la app no se cierra a tiempo, cerrada: false y salida 1 (sin matar nada)', async () => {
  const m = pc();
  mkdirSync(m.datos, { recursive: true });
  // el pid de esta misma prueba: está vivo y no mira salir.peticion (con su hora de inicio de verdad: revisión final, I3)
  writeFileSync(join(m.datos, 'app.lock'), JSON.stringify({ pid: process.pid, inicio: Math.round(Date.now() - process.uptime() * 1000) }));
  const { codigoSalida, resultado } = await ejecutarOrden(['cerrar-app'], { env: m.env, esperaCierre: 300 });
  assert.equal(codigoSalida, 1);
  assert.equal(resultado.cerrada, false);
  assert.equal(resultado.codigo, 'fallo');
  assert.ok(existsSync(join(m.datos, 'salir.peticion')));
});

// Revisión final, I3: el pid del cerrojo tiene que ser de verdad la app (node.exe con la misma hora de inicio), como en
// tomarCerrojo; un pid que reutiliza otro programa tras un apagón cuenta como cerrojo viejo (nada que cerrar).
test('revisión final, I3: cerrar-app con un pid vivo que es otro programa, o otro node con otra hora de inicio → nada que cerrar', async () => {
  const inicio = 1_700_000_000_000;
  for (const [caso, info] of [
    ['otro programa', () => ({ vive: true, nombre: 'chrome', inicio })],
    ['otro node, otra hora de inicio', () => ({ vive: true, nombre: 'node', inicio: inicio + 600_000 })],
    ['ya no vive', () => ({ vive: false })],
  ]) {
    const m = pc();
    mkdirSync(m.datos, { recursive: true });
    writeFileSync(join(m.datos, 'app.lock'), JSON.stringify({ pid: 777_777, inicio }));
    const antes = Date.now();
    const { codigoSalida, resultado } = await ejecutarOrden(['cerrar-app'], { env: m.env, esperaCierre: 5000, vive: () => true, info });
    assert.equal(codigoSalida, 0, `${caso}: ${JSON.stringify(resultado)}`);
    assert.deepEqual([resultado.cerrada, resultado.estaba], [true, false], caso);
    assert.ok(Date.now() - antes < 2000, `${caso}: no espera`);
    assert.ok(!existsSync(join(m.datos, 'salir.peticion')), `${caso}: no pide salir`);
    assert.ok(existsSync(join(m.datos, 'app.lock')), `${caso}: el cerrojo no se toca`);
  }
});

test('revisión final, I3: cerrar-app con el pid de la app (node.exe y la misma hora), o sin poder saberlo, sigue esperando', async () => {
  const inicio = 1_700_000_000_000;
  for (const [caso, info] of [
    ['la app', () => ({ vive: true, nombre: 'node.exe', inicio: inicio + 800 })],
    ['no se sabe el nombre', () => ({ vive: true })],
    ['info falla', () => { throw new Error('PowerShell no contesta'); }],
  ]) {
    const m = pc();
    mkdirSync(m.datos, { recursive: true });
    writeFileSync(join(m.datos, 'app.lock'), JSON.stringify({ pid: 777_777, inicio }));
    const { codigoSalida, resultado } = await ejecutarOrden(['cerrar-app'], { env: m.env, esperaCierre: 300, vive: () => true, info });
    assert.equal(codigoSalida, 1, `${caso}: ${JSON.stringify(resultado)}`);
    assert.deepEqual([resultado.cerrada, resultado.estaba], [false, true], caso);
    assert.ok(existsSync(join(m.datos, 'salir.peticion')), `${caso}: pide salir`);
  }
});

// ---------- desinstalar ----------

/** Un PC con SnetForever instalado (instalar de verdad), ranuras viejas de antes, restos y los accesos falsos. */
async function instalado() {
  const m = pc();
  const { dir } = publicacion();
  assert.equal((await instalar(m, dir)).codigoSalida, 0);
  // ranuras viejas de una instalación anterior con más ranuras (fase 4, lote G): también se retiran
  for (const i of [RANURAS + 1, 150]) arbol(m.addons, { [`${nombreRanura(i)}/${nombreRanura(i)}.toc`]: '## vieja\n' });
  mkdirSync(join(m.addons, '.snetforever-preparando', 'resto'), { recursive: true });
  const escritorio = join(m.t, 'Escritorio Ñ', 'SnetForever.lnk');
  const inicio = join(m.t, 'Inicio', 'SnetForever.lnk');
  const grupo = join(m.t, 'Start Menu', 'Programs', 'SnetForever');
  arbol(m.t, {
    [relative(m.t, escritorio).replace(/\\/g, '/')]: 'lnk falso',
    [`${relative(m.t, grupo).replace(/\\/g, '/')}/SnetForever.lnk`]: 'lnk falso',
  });
  return { ...m, escritorio, inicio, grupo };
}

test('desinstalar: mueve a la cuarentena los cuatro addons, todas las ranuras, los restos y los accesos; RXPGuides y datos se quedan', async () => {
  const m = await instalado();
  const configAntes = readFileSync(join(m.datos, 'config.json'));
  const antes = cuantos(m.t);
  const { codigoSalida, resultado } = await ejecutarOrden([
    'desinstalar', '--grupo', m.grupo, '--escritorio', m.escritorio, '--inicio', m.inicio,
  ], { env: m.env, juego: juegoFalso() });
  assert.equal(codigoSalida, 0, JSON.stringify(resultado));
  const q = resultado.cuarentena;
  assert.ok(q.startsWith(m.cuarentena) && statSync(q).isDirectory(), q);
  assert.deepEqual(readdirSync(m.addons), ['RXPGuides']);
  for (const c of ['SnetForever', 'SnetForever_Rutas', 'SnetForever_Misiones', 'SnetForever_Comercio', '.snetforever-preparando', nombreRanura(1),
    nombreRanura(RANURAS), nombreRanura(RANURAS + 1), nombreRanura(150)]) {
    assert.ok(existsSync(join(q, 'AddOns', c)), c);
  }
  assert.equal(readFileSync(join(q, 'accesos', 'escritorio', 'SnetForever.lnk'), 'utf8'), 'lnk falso');
  assert.ok(existsSync(join(q, 'accesos', 'grupo', 'SnetForever', 'SnetForever.lnk')), 'el grupo del menú también');
  assert.ok(!existsSync(join(q, 'accesos', 'inicio')), 'el de inicio no existía');
  assert.ok(!existsSync(m.escritorio) && !existsSync(m.grupo));
  assert.equal(resultado.movidos.length, 4 + RANURAS + RANURAS_PRECIOS + 2 + 1 + 2); // + las ranuras de precios P01…P08
  assert.ok(readFileSync(join(m.datos, 'config.json')).equals(configAntes), 'datos\\config.json intacto');
  assert.equal(cuantos(m.t), antes, 'no se pierde ningún archivo');
  assert.match(resultado.mensaje, /cuarentena/);
  assert.ok(resultado.mensaje.includes(q), 'F5-5: dice dónde está');
});

test('desinstalar con el juego abierto (o sin saberlo): 10 y no se mueve nada', async () => {
  const m = await instalado();
  for (const juego of [juegoFalso({ abierto: join(m.raiz, 'Wow.exe') }), juegoFalso({ falla: true })]) {
    const antes = foto(m.t);
    const r = await ejecutarOrden(['desinstalar', '--escritorio', m.escritorio], { env: m.env, juego });
    assert.equal(r.codigoSalida, 10);
    assert.equal(r.resultado.codigo, 'juego_abierto');
    assert.deepEqual(foto(m.t), antes);
  }
});

test('desinstalar: unos accesos que no son de SnetForever (sin .lnk, otra carpeta) no se tocan', async () => {
  const m = await instalado();
  const ajena = join(m.t, 'Mis documentos');
  arbol(ajena, { 'importante.txt': 'mío' });
  const r = await ejecutarOrden(['desinstalar', '--grupo', ajena, '--escritorio', join(ajena, 'importante.txt')], {
    env: m.env, juego: juegoFalso(),
  });
  assert.equal(r.codigoSalida, 0, JSON.stringify(r.resultado));
  assert.ok(existsSync(join(ajena, 'importante.txt')));
  assert.equal(r.resultado.avisos.length, 2);
});

test('ronda 1, M2: --grupo solo vale para la carpeta SnetForever de Start Menu\\Programs y solo con accesos dentro', async () => {
  const m = await instalado();
  // una carpeta SnetForever cualquiera (un proyecto del usuario) y un grupo del menú con algo que no es un acceso
  const proyecto = join(m.t, 'Proyectos', 'SnetForever');
  arbol(proyecto, { 'notas.txt': 'mío' });
  const r = await ejecutarOrden(['desinstalar', '--grupo', proyecto], { env: m.env, juego: juegoFalso() });
  assert.equal(r.codigoSalida, 0, JSON.stringify(r.resultado));
  assert.ok(existsSync(join(proyecto, 'notas.txt')));
  assert.equal(r.resultado.avisos.length, 1);
  const m2 = await instalado();
  arbol(m2.grupo, { 'leeme.txt': 'del usuario' });
  const r2 = await ejecutarOrden(['desinstalar', '--grupo', m2.grupo], { env: m2.env, juego: juegoFalso() });
  assert.ok(existsSync(join(m2.grupo, 'leeme.txt')) && existsSync(join(m2.grupo, 'SnetForever.lnk')));
  assert.equal(r2.resultado.avisos.length, 1);
});

test('ronda 1, I1: desinstalar --instalacion da la cuarentena de la instalación (misma unidad: la misma; otra: la de datos con el mismo sello)', async () => {
  const m = await instalado();
  const mismaUnidad = join(m.t, 'Programs', 'SnetForever');
  const r = await ejecutarOrden(['desinstalar', '--instalacion', mismaUnidad, '--escritorio', m.escritorio], { env: m.env, juego: juegoFalso() });
  assert.equal(r.codigoSalida, 0, JSON.stringify(r.resultado));
  assert.equal(r.resultado.cuarentenaInstalacion, r.resultado.cuarentena);
  assert.equal((r.resultado.mensaje.match(/cuarentena/g) || []).length, 1);
  // la línea 3 del .txt es la -A de retirar.ps1
  const salida = join(m.t, 'snf-desinstalar');
  escribirSalida(salida, 'desinstalar', r.resultado);
  assert.equal(readFileSync(`${salida}.txt`).subarray(3).toString('utf8').split('\r\n')[2], r.resultado.cuarentena);

  const m2 = await instalado();
  const otra = await ejecutarOrden(['desinstalar', '--instalacion', OTRA_UNIDAD], { env: m2.env, juego: juegoFalso() });
  assert.equal(otra.codigoSalida, 0, JSON.stringify(otra.resultado));
  const { cuarentena, cuarentenaInstalacion } = otra.resultado;
  assert.equal(cuarentenaInstalacion, join(m2.datos, 'cuarentena', basename(cuarentena)), 'mismo sello, en la carpeta de datos');
  assert.ok(statSync(cuarentenaInstalacion).isDirectory());
  assert.ok(otra.resultado.mensaje.includes(cuarentena) && otra.resultado.mensaje.includes(cuarentenaInstalacion), 'F5-5: nombra las dos');
  const salida2 = join(m2.t, 'snf-desinstalar');
  escribirSalida(salida2, 'desinstalar', otra.resultado);
  assert.equal(readFileSync(`${salida2}.txt`).subarray(3).toString('utf8').split('\r\n')[2], cuarentenaInstalacion);
});

test('ronda 1, M1 y M3: el juego se vuelve a mirar antes de los accesos; si se abre a mitad, 10 y la línea 1 dice dónde está lo movido', async () => {
  const m = await instalado();
  const juego = juegoFalso({ abierto: join(m.raiz, 'Wow.exe'), abreTras: 2 });
  const r = await ejecutarOrden(['desinstalar', '--escritorio', m.escritorio], { env: m.env, juego });
  assert.equal(r.codigoSalida, 10, JSON.stringify(r.resultado));
  assert.equal(juego.llamadas.filter((q) => q === 'procesos').length, 2);
  assert.deepEqual(readdirSync(m.addons), ['RXPGuides'], 'AddOns ya estaba hecho');
  assert.ok(existsSync(m.escritorio), 'los accesos no se tocan');
  assert.match(r.resultado.mensaje, /Cierra el juego para terminar/);
  assert.ok(r.resultado.mensaje.includes(r.resultado.cuarentena), 'M3: dice qué parte ya está en la cuarentena');
  assert.equal(r.resultado.movidos.length, 4 + RANURAS + RANURAS_PRECIOS + 2 + 1);
});

test('ronda 1, M7: sin config.addons, desinstalar busca el juego con candidatasJuego (y solo uno con SnetForever)', async () => {
  const m = await instalado();
  const datosVacios = join(m.t, 'Datos sin config');
  const env = { ...m.env, SNF_DATOS: datosVacios };
  const wow = dirname(m.raiz); // el InstallPath de Blizzard: …\World of Warcraft
  const r = await ejecutarOrden(['desinstalar'], { env, juego: juegoFalso({ registro: [wow] }) });
  assert.equal(r.codigoSalida, 0, JSON.stringify(r.resultado));
  assert.deepEqual(readdirSync(m.addons), ['RXPGuides']);
  // un juego sin nada de SnetForever no se toma por el instalado
  const otro = pc();
  const r2 = await ejecutarOrden(['desinstalar'], {
    env: { ...otro.env, SNF_DATOS: join(otro.t, 'vacio') }, juego: juegoFalso({ registro: [dirname(otro.raiz)] }),
  });
  assert.equal(r2.codigoSalida, 0);
  assert.equal(r2.resultado.avisos[0].code, 'ADDONS');
  assert.ok(existsSync(join(otro.addons, 'RXPGuides', 'x.lua')));
});

// ---------- desempaquetar (F5-4) y preparar ----------

test('desempaquetar <paquete> <carpeta>: extrae en una carpeta nueva; un paquete que no vale da 13', async () => {
  const { dir, componentes } = publicacion();
  const carpeta = nueva('mirar');
  const r = await ejecutarOrden(['desempaquetar', join(dir, componentes.addon.archivo), carpeta], { env: pc().env });
  assert.equal(r.codigoSalida, 0, JSON.stringify(r.resultado));
  assert.equal(r.resultado.componente, 'addon');
  assert.ok(existsSync(join(r.resultado.carpeta, 'SnetForever', 'SnetForever.toc')));
  const malo = join(nueva('malo'), 'malo.snfpaq');
  writeFileSync(malo, 'no es un paquete');
  const mal = await ejecutarOrden(['desempaquetar', malo, carpeta], { env: pc().env });
  assert.equal(mal.codigoSalida, 13);
});

test('preparar: crea las ranuras que falten en el AddOns de config.json (con el juego cerrado) y da 10 con él abierto', async () => {
  const m = pc();
  assert.equal((await instalar(m, publicacion().dir)).codigoSalida, 0);
  renameSync(join(m.addons, nombreRanura(7)), join(nueva('aparte'), nombreRanura(7)));
  const abierto = await ejecutarOrden(['preparar'], { env: m.env, juego: juegoFalso({ abierto: join(m.raiz, 'Wow.exe') }) });
  assert.equal(abierto.codigoSalida, 10);
  assert.ok(!existsSync(join(m.addons, nombreRanura(7))));
  const r = await ejecutarOrden(['preparar'], { env: m.env, juego: juegoFalso() });
  assert.equal(r.codigoSalida, 0, JSON.stringify(r.resultado));
  assert.equal(r.resultado.ranurasCreadas, 1);
});

// ---------- retirar.ps1 (solo en Windows) ----------

const DE_LA_INSTALACION = ['node', 'app', 'paquetes', 'actual.txt', 'previa.txt', 'fallida.txt', 'arranque.mjs', 'SnetForever.vbs', 'LICENSE', 'LICENCIAS.txt'];

/** Una carpeta de instalación falsa (F3) con el retirar.ps1 real dentro. */
function instalacionFalsa({ unins = true } = {}) {
  const t = nueva('inst');
  const desde = join(t, 'Programs Ñ', 'Snet Forever');
  arbol(desde, {
    'node/node.exe': 'node falso', 'node/LICENSE': 'MIT', 'app/0.5.0/src/version.mjs': 'export const VERSION = "0.5.0";\n',
    'paquetes/snetforever-manifiesto.json': '{}', 'actual.txt': '0.5.0', 'previa.txt': '0.4.9', 'fallida.txt': '0.4.8',
    'arranque.mjs': '// arranque\n', 'SnetForever.vbs': "' vbs\n", LICENSE: 'MIT', 'LICENCIAS.txt': 'licencias',
    'otro.txt': 'no es de la lista',
    ...(unins ? { 'unins000.exe': 'inno', 'unins000.dat': 'inno' } : {}),
  });
  copyFileSync(RETIRAR, join(desde, 'retirar.ps1'));
  return { t, desde, a: join(t, 'Cuarentena Ñ', 'sello') };
}

function retirar(desde, a, extra = []) {
  return spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(desde, 'retirar.ps1'), '-Desde', desde, '-A', a, ...extra], {
    encoding: 'utf8', timeout: 60_000, windowsHide: true,
  });
}

test('retirar.ps1: sin unins000.exe (o sin actual.txt) se niega con 2 y no mueve nada', { skip: !WIN }, () => {
  const sin = instalacionFalsa({ unins: false });
  const antes = foto(sin.t);
  const r = retirar(sin.desde, sin.a);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.deepEqual(foto(sin.t), antes);
  const sinActual = instalacionFalsa();
  renameSync(join(sinActual.desde, 'actual.txt'), join(sinActual.t, 'actual-aparte.txt'));
  const antes2 = foto(sinActual.t);
  assert.equal(retirar(sinActual.desde, sinActual.a).status, 2);
  assert.deepEqual(foto(sinActual.t), antes2);
});

// Tarea 16, ronda 1 (M3): una retirada que quedó a medias (ya no está actual.txt, pero quedan cosas de la lista). El
// instalador nuevo la termina con su propia copia de retirar.ps1 y -AMedias.
function aMedias() {
  const i = instalacionFalsa();
  for (const x of ['actual.txt', 'arranque.mjs', 'retirar.ps1']) renameSync(join(i.desde, x), join(i.t, `ya-movido-${x}`));
  const script = join(i.t, 'Temp Ñ', 'snf-retirar.ps1');
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(RETIRAR, script);
  const correr = (a, extra = ['-AMedias']) => spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...extra, '-Desde', i.desde, '-A', a], {
    encoding: 'utf8', timeout: 60_000, windowsHide: true,
  });
  return { ...i, script, correr };
}

test('tarea 16, M3: retirar.ps1 -AMedias termina una retirada a medias (sin actual.txt) y no toca unins000.*', { skip: !WIN }, () => {
  const i = aMedias();
  const antes = cuantos(i.t);
  const r = i.correr(i.a);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dest = join(i.a, 'instalacion');
  assert.match(r.stdout, /^destino: .*instalacion\r?$/m);
  for (const x of ['node', 'app', 'paquetes', 'previa.txt', 'fallida.txt', 'SnetForever.vbs', 'LICENSE', 'LICENCIAS.txt']) {
    assert.ok(existsSync(join(dest, x)), x);
    assert.ok(!existsSync(join(i.desde, x)), x);
  }
  assert.ok(existsSync(join(i.desde, 'unins000.exe')) && existsSync(join(i.desde, 'unins000.dat')));
  assert.ok(existsSync(join(i.desde, 'otro.txt')));
  assert.ok(existsSync(i.script), 'la copia de fuera no se mueve');
  assert.equal(cuantos(i.t), antes);
});

test('tarea 16, M3: retirar.ps1 -AMedias se niega con 2 si hay actual.txt, si no hay unins000.exe o si no queda nada de la lista', { skip: !WIN }, () => {
  // con actual.txt no es una retirada a medias: va sin -AMedias
  const conActual = aMedias();
  writeFileSync(join(conActual.desde, 'actual.txt'), '0.5.0');
  const antes1 = foto(conActual.t);
  assert.equal(conActual.correr(conActual.a).status, 2);
  assert.deepEqual(foto(conActual.t), antes1);
  // sin unins000.exe no es una instalación de Inno
  const sinUnins = aMedias();
  renameSync(join(sinUnins.desde, 'unins000.exe'), join(sinUnins.t, 'unins-aparte.exe'));
  const antes2 = foto(sinUnins.t);
  assert.equal(sinUnins.correr(sinUnins.a).status, 2);
  assert.deepEqual(foto(sinUnins.t), antes2);
  // sin nada de la lista no hay nada que terminar
  const vacia = nueva('vacia');
  const desde = join(vacia, 'Snet Forever');
  arbol(desde, { 'unins000.exe': 'inno', 'otro.txt': 'x' });
  const antes3 = foto(vacia);
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RETIRAR, '-AMedias', '-Desde', desde, '-A', join(vacia, 'q')], {
    encoding: 'utf8', timeout: 60_000, windowsHide: true,
  });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.deepEqual(foto(vacia), antes3);
});

test('retirar.ps1: mueve la instalación a <A>\\instalacion\\ (y al final a sí mismo), sin tocar unins000.*', { skip: !WIN }, () => {
  const i = instalacionFalsa();
  const antes = cuantos(i.t);
  const r = retirar(i.desde, i.a);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dest = join(i.a, 'instalacion');
  for (const x of [...DE_LA_INSTALACION, 'retirar.ps1']) {
    assert.ok(existsSync(join(dest, x)), x);
    assert.ok(!existsSync(join(i.desde, x)), x);
  }
  assert.equal(readFileSync(join(dest, 'node', 'node.exe'), 'utf8'), 'node falso');
  assert.equal(readFileSync(join(dest, 'app', '0.5.0', 'src', 'version.mjs'), 'utf8'), 'export const VERSION = "0.5.0";\n');
  assert.ok(existsSync(join(i.desde, 'unins000.exe')) && existsSync(join(i.desde, 'unins000.dat')));
  assert.ok(existsSync(join(i.desde, 'otro.txt')), 'lo que no es de la lista se queda');
  assert.equal(cuantos(i.t), antes, 'no se pierde ningún archivo');
});

test('retirar.ps1: si <A>\\instalacion ya existe, usa instalacion-2 (nunca mezcla ni pisa)', { skip: !WIN }, () => {
  const i = instalacionFalsa();
  arbol(join(i.a, 'instalacion'), { 'actual.txt': 'de otra vez' });
  const r = retirar(i.desde, i.a);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(join(i.a, 'instalacion', 'actual.txt'), 'utf8'), 'de otra vez');
  assert.equal(readFileSync(join(i.a, 'instalacion-2', 'actual.txt'), 'utf8'), '0.5.0');
});

test('ronda 1, I1: retirar.ps1 con -A en otra unidad se niega con 2 y no mueve nada (ni crea -A)', { skip: !WIN }, () => {
  const i = instalacionFalsa();
  const antes = foto(i.t);
  const r = retirar(i.desde, `${OTRA_UNIDAD}\\cuarentena\\sello`);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /otra unidad/);
  assert.deepEqual(foto(i.t), antes);
});

test('ronda 1, I1: en la misma unidad, cada cosa va con un solo renombre (las mismas carpetas y archivos, no copias)', { skip: !WIN }, () => {
  const i = instalacionFalsa();
  const id = (ruta) => statSync(ruta, { bigint: true }).ino;
  const antes = { node: id(join(i.desde, 'node')), exe: id(join(i.desde, 'node', 'node.exe')), app: id(join(i.desde, 'app')) };
  const r = retirar(i.desde, i.a);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dest = join(i.a, 'instalacion');
  assert.equal(id(join(dest, 'node')), antes.node, 'la carpeta node es la misma');
  assert.equal(id(join(dest, 'node', 'node.exe')), antes.exe);
  assert.equal(id(join(dest, 'app')), antes.app);
  assert.match(r.stdout, /destino: .*instalacion/);
});

test('ronda 1, M5 y M6: retirar.ps1 se niega con 2 si -A cae dentro de -Desde o si las rutas son relativas', { skip: !WIN }, () => {
  const i = instalacionFalsa();
  const antes = foto(i.t);
  assert.equal(retirar(i.desde, join(i.desde, 'cuarentena')).status, 2);
  assert.equal(retirar(i.desde, i.desde).status, 2);
  for (const [desde, a] of [['Snet Forever', i.a], [i.desde, 'Cuarentena Ñ\\sello'], [i.desde, 'C:cuarentena']]) {
    const r = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(i.desde, 'retirar.ps1'), '-Desde', desde, '-A', a], {
      encoding: 'utf8', timeout: 60_000, windowsHide: true, cwd: dirname(i.desde),
    });
    assert.equal(r.status, 2, `${desde} / ${a}: ${r.stdout}${r.stderr}`);
  }
  assert.deepEqual(foto(i.t), antes);
});

test('ronda 1, M5: retirar.ps1 sale con 1 si algo no se puede mover (un archivo bloqueado), mueve lo demás y no pierde nada', { skip: !WIN }, async () => {
  const i = instalacionFalsa();
  const antes = cuantos(i.t);
  const licencia = join(i.desde, 'LICENSE');
  const listo = join(i.t, 'bloqueado.listo');
  const fin = join(i.t, 'bloqueado.fin');
  const comillas = (s) => `'${s.replace(/'/g, "''")}'`;
  // Un PowerShell lanzado aquí abre LICENSE sin compartir (FileShare None) hasta que exista «fin» (30 s como mucho).
  const orden = `$h = [IO.File]::Open(${comillas(licencia)}, 'Open', 'Read', 'None'); [IO.File]::WriteAllText(${comillas(listo)}, 'x'); `
    + `$n = 0; while (-not (Test-Path -LiteralPath ${comillas(fin)}) -and $n -lt 300) { Start-Sleep -Milliseconds 100; $n++ }; $h.Close()`;
  const bloqueo = spawn(POWERSHELL, ['-NoProfile', '-Command', orden], { stdio: 'ignore', windowsHide: true });
  const fuera = new Promise((r) => bloqueo.once('exit', r));
  try {
    for (let n = 0; n < 200 && !existsSync(listo); n++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(existsSync(listo), 'el bloqueo no llegó a abrir el archivo');
    const r = retirar(i.desde, i.a);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /LICENSE/);
    assert.ok(existsSync(licencia), 'lo bloqueado se queda');
    assert.ok(existsSync(join(i.a, 'instalacion', 'node', 'node.exe')) && existsSync(join(i.a, 'instalacion', 'LICENCIAS.txt')), 'lo demás se mueve');
  } finally {
    writeFileSync(fin, 'x');
    const reloj = setTimeout(() => { if (bloqueo.exitCode === null) bloqueo.kill(); }, 10_000); // solo el que lanzó esta prueba
    await fuera;
    clearTimeout(reloj);
  }
  assert.equal(cuantos(i.t), antes + 2, 'no se pierde nada (más las dos marcas de la prueba)');
});
