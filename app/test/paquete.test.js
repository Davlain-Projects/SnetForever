// Pruebas de app/src/actualizar/paquete.mjs (fase 5, tarea 4; vigilancia 2): paquetes .snfpaq (formato F2) con rutas,
// tamaños y hashes comprobados, el esquema de datos (F5-2), la extracción sin pisar y `desempaquetar` (F5-4).
// Los paquetes manipulados se hacen a mano en la prueba (cabecera y gzip), uno por caso. Todo en carpetas temporales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync, createGzip } from 'node:zlib';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import {
  CARPETAS, ErrorPaquete, empaquetar, abrirPaquete, extraerPaquete, desempaquetar,
} from '../src/actualizar/paquete.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAGIA = 'SNFPAQ1\n';
const MiB = 2 ** 20;

function temporal() {
  return mkdtempSync(join(tmpdir(), 'snf-paquete-'));
}

// Escribe `archivos` ({ruta con /: contenido}) bajo `raiz`.
function arbol(raiz, archivos) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const final = join(raiz, ...ruta.split('/'));
    mkdirSync(dirname(final), { recursive: true });
    writeFileSync(final, contenido);
  }
  return raiz;
}

// Todos los archivos de una carpeta: {ruta relativa con /: Buffer}.
function contenido(dir) {
  const salida = {};
  const recorrer = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = join(d, e.name);
      if (e.isDirectory()) recorrer(r);
      else salida[relative(dir, r).replace(/\\/g, '/')] = readFileSync(r);
    }
  };
  recorrer(dir);
  return salida;
}

const sha = (b) => createHash('sha256').update(b).digest('hex');
const entrada = (ruta, bytes) => ({ ruta, tamano: bytes.length, sha256: sha(bytes) });

// La cabecera de un componente con sus archivos ({ruta, bytes}), con el esquema de datos si no es la app.
function cabecera(componente, archivos, extra = {}) {
  return {
    componente,
    version: componente === 'app' ? '0.5.0' : componente === 'addon' ? '0.5.0' : '2026.11.10.1',
    ...(componente === 'app' ? {} : { esquemaDatos: 1 }),
    archivos: archivos.map(({ ruta, bytes }) => entrada(ruta, bytes)),
    ...extra,
  };
}

// Un paquete hecho a mano: gzip de la magia, la cabecera (objeto o texto), un salto de línea y los datos.
function aMano({ cab, datos, magia = MAGIA }) {
  const texto = typeof cab === 'string' ? cab : JSON.stringify(cab);
  return gzipSync(Buffer.concat([Buffer.from(`${magia}${texto}\n`, 'utf8'), datos]));
}

// Un paquete hecho a mano con estos archivos, coherente en todo (tamaños y hashes) salvo lo que se cambie.
function paqueteDe(componente, archivos, { extra, datos } = {}) {
  return aMano({ cab: cabecera(componente, archivos, extra), datos: datos ?? Buffer.concat(archivos.map((a) => a.bytes)) });
}

function fallaCon(codigo, fn) {
  assert.throws(fn, (e) => {
    assert.ok(e instanceof ErrorPaquete, `se esperaba ErrorPaquete y llegó ${e?.name}: ${e?.message}`);
    assert.equal(e.code, codigo, e.message);
    return true;
  });
}

// El árbol de prueba del brief: SnetForever/SnetForever.toc, ui/ventana.lua y senales/vivo_a.wav de 0 bytes.
const TOC = Buffer.from('## Interface: 16001\n## Title: SnetForever\n## Version: 0.5.0\n', 'utf8');
const VENTANA = Buffer.from([0x2d, 0x2d, 0x20, 0xc3, 0xb1, 0, 0xff, 10, 13]);
const VACIO = Buffer.alloc(0);
function arbolAddon() {
  return arbol(temporal(), {
    'SnetForever/SnetForever.toc': TOC,
    'SnetForever/ui/ventana.lua': VENTANA,
    'SnetForever/senales/vivo_a.wav': VACIO,
  });
}

test('CARPETAS es la tabla F3 y no se puede cambiar', () => {
  assert.deepEqual({ ...CARPETAS }, {
    addon: 'SnetForever', rutas: 'SnetForever_Rutas', misiones: 'SnetForever_Misiones', comercio: 'SnetForever_Comercio', app: 'app',
  });
  assert.ok(Object.isFrozen(CARPETAS));
});

test('comercio (Task 8): el paquete de SnetForever_Comercio va sin esquema de datos, como la app, y se abre con su carpeta', () => {
  const raiz = arbol(temporal(), {
    'SnetForever_Comercio/SnetForever_Comercio.toc': '## Title: SnetForever Comercio\n## Version: 0.7.0\n',
    'SnetForever_Comercio/ui/comercio.lua': '-- ventana\n',
    'SnetForever_Comercio/recursos/letras/Roboto-OFL.txt': 'SIL OPEN FONT LICENSE Version 1.1\n',
  });
  const paquete = empaquetar({ componente: 'comercio', version: '0.7.0', raiz });
  const abierto = abrirPaquete(paquete, { componente: 'comercio' });
  assert.equal(abierto.componente, 'comercio');
  assert.equal(abierto.version, '0.7.0');
  assert.equal(abierto.esquemaDatos, undefined, 'sin esquema de datos');
  assert.ok(abierto.archivos.every((a) => a.ruta.startsWith('SnetForever_Comercio/')));
  assert.equal(abierto.archivos.length, 3);
  // con esquema de datos no vale al empaquetar
  assert.throws(() => empaquetar({ componente: 'comercio', version: '0.7.0', raiz, esquemaDatos: 1 }), (e) => e.code === 'formato');
  // y el paquete de comercio no pasa por el de otro componente
  assert.throws(() => abrirPaquete(paquete, { componente: 'addon' }), (e) => e.code === 'componente');
});

test('ErrorPaquete es un Error con code', () => {
  const e = new ErrorPaquete('ruta', 'mal');
  assert.ok(e instanceof Error);
  assert.equal(e.code, 'ruta');
  assert.equal(e.name, 'ErrorPaquete');
  assert.equal(e.message, 'mal');
});

test('empaquetar y abrir: las mismas rutas, ordenadas, y los mismos bytes', () => {
  const raiz = arbolAddon();
  const paquete = empaquetar({ componente: 'addon', version: '0.5.0', raiz, esquemaDatos: 1 });
  assert.ok(Buffer.isBuffer(paquete));
  const abierto = abrirPaquete(paquete, { componente: 'addon' });
  assert.equal(abierto.componente, 'addon');
  assert.equal(abierto.version, '0.5.0');
  assert.equal(abierto.esquemaDatos, 1);
  assert.deepEqual(abierto.archivos.map((a) => a.ruta), [
    'SnetForever/SnetForever.toc', 'SnetForever/senales/vivo_a.wav', 'SnetForever/ui/ventana.lua',
  ]);
  assert.ok(abierto.archivos[0].datos.equals(TOC));
  assert.ok(abierto.archivos[1].datos.equals(VACIO));
  assert.ok(abierto.archivos[2].datos.equals(VENTANA));
});

test('empaquetar sigue el formato F2: gzip de SNFPAQ1, la cabecera en una línea y los bytes seguidos', () => {
  const paquete = empaquetar({ componente: 'addon', version: '0.5.0', raiz: arbolAddon(), esquemaDatos: 1 });
  assert.deepEqual([paquete[0], paquete[1]], [0x1f, 0x8b], 'es gzip');
  const plano = gunzipSync(paquete);
  assert.equal(plano.subarray(0, 8).toString('latin1'), MAGIA);
  const fin = plano.indexOf(0x0a, 8);
  const cab = JSON.parse(plano.subarray(8, fin).toString('utf8'));
  assert.deepEqual(cab, {
    componente: 'addon',
    version: '0.5.0',
    esquemaDatos: 1,
    archivos: [
      entrada('SnetForever/SnetForever.toc', TOC), entrada('SnetForever/senales/vivo_a.wav', VACIO), entrada('SnetForever/ui/ventana.lua', VENTANA),
    ],
  });
  assert.ok(plano.subarray(fin + 1).equals(Buffer.concat([TOC, VACIO, VENTANA])));
});

test('empaquetar es determinista: dos empaquetados dan Buffer.equals aunque cambien las fechas', () => {
  const raiz = arbolAddon();
  const a = empaquetar({ componente: 'addon', version: '0.5.0', raiz, esquemaDatos: 1 });
  utimesSync(join(raiz, 'SnetForever', 'SnetForever.toc'), new Date(2001, 0, 1), new Date(2001, 0, 1));
  const b = empaquetar({ componente: 'addon', version: '0.5.0', raiz, esquemaDatos: 1 });
  assert.ok(a.equals(b));
  assert.equal(a.readUInt32LE(4), 0, 'la cabecera gzip no lleva fecha');
});

test('excluir deja fuera app/test/ y app/node_modules/ (y la carpeta de la app va sin esquema de datos)', () => {
  const raiz = arbol(temporal(), {
    'app/package.json': '{}',
    'app/src/x.mjs': 'export {}',
    'app/test/x.test.js': 'prueba',
    'app/node_modules/m/i.js': 'dependencia',
    'app/testigo.txt': 'no empieza por app/test/',
  });
  const paquete = empaquetar({ componente: 'app', version: '0.5.0', raiz, excluir: ['app/test/', 'app/node_modules/'] });
  const abierto = abrirPaquete(paquete, { componente: 'app' });
  assert.deepEqual(abierto.archivos.map((a) => a.ruta), ['app/package.json', 'app/src/x.mjs', 'app/testigo.txt']);
  assert.equal(abierto.esquemaDatos, undefined);
});

test('excluir no distingue mayúsculas (en Windows app/Test/ es app/test/)', () => {
  const raiz = arbol(temporal(), { 'app/Test/y.test.js': 'prueba', 'app/a.mjs': 'x' });
  const abierto = abrirPaquete(empaquetar({ componente: 'app', version: '0.5.0', raiz, excluir: ['app/test/'] }), { componente: 'app' });
  assert.deepEqual(abierto.archivos.map((a) => a.ruta), ['app/a.mjs']);
});

test('lote B: el paquete de datos lleva la carpeta entera, también los archivos de la app (## X-SNF-App) que el .toc no carga', () => {
  const raiz = arbol(temporal(), {
    'SnetForever_Misiones/SnetForever_Misiones.toc': '## Interface: 16001\n## X-SNF-App: object_1.lua\n\nnucleo.lua\n',
    'SnetForever_Misiones/nucleo.lua': 'SNF_MISIONES = {version="2026.11.10.1",esquema=1}',
    'SnetForever_Misiones/object_1.lua': '-- solo para la app',
  });
  const abierto = abrirPaquete(
    empaquetar({ componente: 'misiones', version: '2026.11.10.1', raiz, esquemaDatos: 1 }), { componente: 'misiones' },
  );
  assert.deepEqual(abierto.archivos.map((a) => a.ruta), [
    'SnetForever_Misiones/SnetForever_Misiones.toc', 'SnetForever_Misiones/nucleo.lua', 'SnetForever_Misiones/object_1.lua',
  ]);
  assert.equal(abierto.esquemaDatos, 1);
});

test('lote B con los datos reales: SnetForever_Misiones se empaqueta entera, con cada archivo de ## X-SNF-App', () => {
  const raiz = join(REPO, 'addons');
  const toc = readFileSync(join(raiz, 'SnetForever_Misiones', 'SnetForever_Misiones.toc'), 'utf8');
  const deLaApp = toc.match(/^## X-SNF-App:(.*)$/m)[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.ok(deLaApp.length > 0);
  const abierto = abrirPaquete(
    empaquetar({ componente: 'misiones', version: '2026.11.10.1', raiz, esquemaDatos: 1 }), { componente: 'misiones' },
  );
  const rutas = new Set(abierto.archivos.map((a) => a.ruta));
  for (const nombre of deLaApp) assert.ok(rutas.has(`SnetForever_Misiones/${nombre}`), nombre);
  assert.equal(rutas.size, readdirSync(join(raiz, 'SnetForever_Misiones')).length);
});

test('F5-2: el esquema de datos es obligatorio en el addon y en los datos, y la app no lo lleva', () => {
  const raiz = arbolAddon();
  for (const esquemaDatos of [undefined, 0, -1, 1.5, '1']) {
    fallaCon('formato', () => empaquetar({ componente: 'addon', version: '0.5.0', raiz, esquemaDatos }));
  }
  const app = arbol(temporal(), { 'app/a.mjs': 'x' });
  fallaCon('formato', () => empaquetar({ componente: 'app', version: '0.5.0', raiz: app, esquemaDatos: 1 }));
  const bytes = Buffer.from('x');
  // al abrir: un addon sin esquema, con uno que no vale, y una app con esquema
  const sinEsquema = cabecera('addon', [{ ruta: 'SnetForever/a.lua', bytes }]);
  delete sinEsquema.esquemaDatos;
  fallaCon('formato', () => abrirPaquete(aMano({ cab: sinEsquema, datos: bytes }), { componente: 'addon' }));
  fallaCon('formato', () => abrirPaquete(paqueteDe('rutas', [{ ruta: 'SnetForever_Rutas/a.lua', bytes }], { extra: { esquemaDatos: 0 } }),
    { componente: 'rutas' }));
  fallaCon('formato', () => abrirPaquete(paqueteDe('app', [{ ruta: 'app/a.mjs', bytes }], { extra: { esquemaDatos: 1 } }),
    { componente: 'app' }));
  assert.equal(abrirPaquete(paqueteDe('rutas', [{ ruta: 'SnetForever_Rutas/a.lua', bytes }], { extra: { esquemaDatos: 2 } }),
    { componente: 'rutas' }).esquemaDatos, 2);
});

test('empaquetar comprueba lo que empaqueta: versión, componente, nombres y que la carpeta exista', () => {
  const raiz = arbolAddon();
  // la versión tiene de 2 a 4 partes (`^\d+(\.\d+){1,3}$`)
  fallaCon('formato', () => empaquetar({ componente: 'addon', version: '0', raiz, esquemaDatos: 1 }));
  fallaCon('formato', () => empaquetar({ componente: 'addon', version: '1.2.3.4.5', raiz, esquemaDatos: 1 }));
  for (const version of ['0.5', '2026.11.10.1']) {
    assert.ok(Buffer.isBuffer(empaquetar({ componente: 'addon', version, raiz, esquemaDatos: 1 })), version);
  }
  fallaCon('formato', () => empaquetar({ componente: 'addon', version: 'v0.5.0', raiz, esquemaDatos: 1 }));
  fallaCon('componente', () => empaquetar({ componente: 'otro', version: '0.5.0', raiz, esquemaDatos: 1 }));
  fallaCon('componente', () => empaquetar({ componente: 'toString', version: '0.5.0', raiz, esquemaDatos: 1 }));
  const conAcento = arbol(temporal(), { 'SnetForever/ñ.lua': 'x' });
  fallaCon('ruta', () => empaquetar({ componente: 'addon', version: '0.5.0', raiz: conAcento, esquemaDatos: 1 }));
  const reservado = arbol(temporal(), { 'SnetForever/aux.lua': 'x' });
  fallaCon('ruta', () => empaquetar({ componente: 'addon', version: '0.5.0', raiz: reservado, esquemaDatos: 1 }));
  assert.throws(() => empaquetar({ componente: 'rutas', version: '0.5.0', raiz, esquemaDatos: 1 }), /SnetForever_Rutas/);
});

// ── Vigilancia 2: paquetes manipulados, hechos a mano ──

test('vigilancia 2: rutas con .., C:, /, \\, nombres reservados, punto o espacio al final → ruta', () => {
  const bytes = Buffer.from('x');
  const malas = [
    'SnetForever/../x.lua', 'SnetForever/C:/x', '/SnetForever/x', 'SnetForever\\x', 'SnetForever/aux.lua', 'SnetForever/CON',
    'SnetForever/x.', 'SnetForever/ x/',
    // más: un solo segmento, vacía, «.», espacio al final, acentos, COM1 y LPT9 con extensión, demasiado larga, segmento vacío
    'SnetForever', '', 'SnetForever/./x.lua', 'SnetForever/x ', 'SnetForever/ñ.lua', 'SnetForever/com1.txt', 'SnetForever/Lpt9.tar.gz',
    'SnetForever/nul', 'SnetForever/PRN.lua', `SnetForever/${'a'.repeat(189)}`, 'SnetForever//x.lua', 'SnetForever/x:y', 'SnetForever/x*',
  ];
  assert.equal(`SnetForever/${'a'.repeat(189)}`.length, 201);
  for (const ruta of malas) {
    fallaCon('ruta', () => abrirPaquete(paqueteDe('addon', [{ ruta, bytes }]), { componente: 'addon' }));
  }
  // y estas valen: 200 caracteres justos, COM0, CONSOLA, paréntesis, más y espacios dentro
  for (const ruta of [`SnetForever/${'a'.repeat(188)}`, 'SnetForever/COM0.lua', 'SnetForever/CONSOLA.lua', 'SnetForever/a (b)+c-d_e.f g.lua']) {
    assert.equal(abrirPaquete(paqueteDe('addon', [{ ruta, bytes }]), { componente: 'addon' }).archivos[0].ruta, ruta);
  }
});

test('vigilancia 2: dos rutas que solo cambian en mayúsculas (o un archivo que también es carpeta) → duplicado', () => {
  const a = Buffer.from('a');
  const b = Buffer.from('b');
  fallaCon('duplicado', () => abrirPaquete(paqueteDe('addon', [{ ruta: 'SnetForever/A.lua', bytes: a }, { ruta: 'SnetForever/a.lua', bytes: b }]),
    { componente: 'addon' }));
  fallaCon('duplicado', () => abrirPaquete(paqueteDe('addon', [{ ruta: 'SnetForever/a.lua', bytes: a }, { ruta: 'SnetForever/a.lua', bytes: a }]),
    { componente: 'addon' }));
  fallaCon('duplicado', () => abrirPaquete(paqueteDe('addon', [{ ruta: 'SnetForever/X/y.lua', bytes: a }, { ruta: 'SnetForever/x', bytes: b }]),
    { componente: 'addon' }));
});

test('vigilancia 2: la primera carpeta SnetForever_Rutas con componente addon → componente', () => {
  const bytes = Buffer.from('x');
  fallaCon('componente', () => abrirPaquete(paqueteDe('addon', [{ ruta: 'SnetForever_Rutas/x.lua', bytes }]), { componente: 'addon' }));
  // el componente de la cabecera no es el que se espera, no se conoce o no se pide uno válido
  fallaCon('componente', () => abrirPaquete(paqueteDe('rutas', [{ ruta: 'SnetForever_Rutas/x.lua', bytes }]), { componente: 'addon' }));
  fallaCon('componente', () => abrirPaquete(paqueteDe('addon', [{ ruta: 'SnetForever/x.lua', bytes }], { extra: { componente: 'otro' } }),
    { componente: 'addon' }));
  fallaCon('componente', () => abrirPaquete(paqueteDe('addon', [{ ruta: 'SnetForever/x.lua', bytes }]), { componente: 'otro' }));
  fallaCon('componente', () => abrirPaquete(paqueteDe('addon', [{ ruta: 'SnetForever/x.lua', bytes }]), {}));
  // el primer segmento distingue mayúsculas: es el nombre de la carpeta del addon
  fallaCon('componente', () => abrirPaquete(paqueteDe('addon', [{ ruta: 'snetforever/x.lua', bytes }]), { componente: 'addon' }));
});

test('vigilancia 2: un byte cambiado en los datos → hash', () => {
  const archivos = [{ ruta: 'SnetForever/a.lua', bytes: Buffer.from('hola') }, { ruta: 'SnetForever/b.lua', bytes: Buffer.from('adiós') }];
  const datos = Buffer.concat(archivos.map((a) => a.bytes));
  datos[5] ^= 0x01;
  fallaCon('hash', () => abrirPaquete(paqueteDe('addon', archivos, { datos }), { componente: 'addon' }));
});

test('vigilancia 2: un byte de más o de menos tras la cabecera → tamano', () => {
  const archivos = [{ ruta: 'SnetForever/a.lua', bytes: Buffer.from('hola') }];
  fallaCon('tamano', () => abrirPaquete(paqueteDe('addon', archivos, { datos: Buffer.from('holaX') }), { componente: 'addon' }));
  fallaCon('tamano', () => abrirPaquete(paqueteDe('addon', archivos, { datos: Buffer.from('hol') }), { componente: 'addon' }));
});

test('vigilancia 2: sin SNFPAQ1 → formato (y lo mismo con un gzip roto, otra cosa o una cabecera que no vale)', () => {
  const bytes = Buffer.from('x');
  const cab = cabecera('addon', [{ ruta: 'SnetForever/x.lua', bytes }]);
  fallaCon('formato', () => abrirPaquete(aMano({ cab, datos: bytes, magia: '' }), { componente: 'addon' }));
  fallaCon('formato', () => abrirPaquete(aMano({ cab, datos: bytes, magia: 'SNFPAQ2\n' }), { componente: 'addon' }));
  fallaCon('formato', () => abrirPaquete(aMano({ cab, datos: bytes, magia: 'snfpaq1\n' }), { componente: 'addon' }));
  // no es gzip, gzip con un byte cambiado (falla el CRC), cortado, vacío o no es un Buffer
  const bueno = paqueteDe('addon', [{ ruta: 'SnetForever/x.lua', bytes }]);
  fallaCon('formato', () => abrirPaquete(Buffer.from('SNFPAQ1\n{}\n'), { componente: 'addon' }));
  const roto = Buffer.from(bueno);
  roto[roto.length - 6] ^= 0xff;
  fallaCon('formato', () => abrirPaquete(roto, { componente: 'addon' }));
  fallaCon('formato', () => abrirPaquete(bueno.subarray(0, bueno.length - 10), { componente: 'addon' }));
  fallaCon('formato', () => abrirPaquete(Buffer.alloc(0), { componente: 'addon' }));
  fallaCon('formato', () => abrirPaquete('no es un buffer', { componente: 'addon' }));
  // cabeceras que no valen
  const conCab = (c) => aMano({ cab: c, datos: bytes });
  const malas = [
    '{"componente":"addon"', 'null', '[]', '"addon"',
    { ...cab, version: '1.2.3.4.5' }, { ...cab, version: '0.5.x' }, { ...cab, version: 5 }, { ...cab, archivos: {} }, { ...cab, otra: 1 },
    { ...cab, archivos: [{ ...cab.archivos[0], tamano: -1 }] }, { ...cab, archivos: [{ ...cab.archivos[0], tamano: 0.5 }] },
    { ...cab, archivos: [{ ...cab.archivos[0], tamano: '1' }] }, { ...cab, archivos: [{ ...cab.archivos[0], sha256: cab.archivos[0].sha256.toUpperCase() }] },
    { ...cab, archivos: [{ ...cab.archivos[0], sha256: 'abc' }] }, { ...cab, archivos: [{ ...cab.archivos[0], ruta: 5 }] },
    { ...cab, archivos: [{ ...cab.archivos[0], otra: 1 }] }, { ...cab, archivos: [null] },
    { componente: 'addon', esquemaDatos: 1, archivos: cab.archivos },
  ];
  for (const c of malas) fallaCon('formato', () => abrirPaquete(conCab(c), { componente: 'addon' }));
  // sin el salto de línea que cierra la cabecera
  fallaCon('formato', () => abrirPaquete(gzipSync(Buffer.from(`${MAGIA}${JSON.stringify(cab)}`)), { componente: 'addon' }));
  // archivos sin ordenar por ruta
  const desordenados = [{ ruta: 'SnetForever/b.lua', bytes }, { ruta: 'SnetForever/a.lua', bytes }];
  fallaCon('formato', () => abrirPaquete(paqueteDe('addon', desordenados), { componente: 'addon' }));
});

// gzip por trozos, sin tener nunca entero en memoria lo que se comprime.
async function gzipPorTrozos(trozos) {
  const gz = createGzip({ level: 1 });
  const salida = [];
  gz.on('data', (b) => salida.push(b));
  const fin = once(gz, 'end');
  for (const t of trozos) if (!gz.write(t)) await once(gz, 'drain');
  gz.end();
  await fin;
  return Buffer.concat(salida);
}

test('vigilancia 2: 300 MiB + 1 descomprimidos (un archivo de ceros) → demasiado, sin agotar la memoria', { timeout: 120_000 }, async () => {
  const TOTAL = 300 * MiB + 1;
  const ruta = 'SnetForever/ceros.bin';
  // el tamaño del archivo para que magia + cabecera + datos sean 300 MiB + 1 justos
  let tamano = TOTAL;
  let linea;
  for (let i = 0; i < 3; i++) {
    linea = Buffer.from(`${MAGIA}${JSON.stringify({ componente: 'addon', version: '0.5.0', esquemaDatos: 1, archivos: [{ ruta, tamano, sha256: '0'.repeat(64) }] })}\n`);
    tamano = TOTAL - linea.length;
  }
  const trozo = Buffer.alloc(MiB);
  const h = createHash('sha256');
  for (let quedan = tamano; quedan > 0; quedan -= MiB) h.update(quedan >= MiB ? trozo : trozo.subarray(0, quedan));
  linea = Buffer.from(`${MAGIA}${JSON.stringify({ componente: 'addon', version: '0.5.0', esquemaDatos: 1, archivos: [{ ruta, tamano, sha256: h.digest('hex') }] })}\n`);
  assert.equal(linea.length + tamano, TOTAL);
  function* trozos() {
    yield linea;
    for (let quedan = tamano; quedan > 0; quedan -= MiB) yield quedan >= MiB ? trozo : trozo.subarray(0, quedan);
  }
  const paquete = await gzipPorTrozos(trozos());
  assert.ok(paquete.length < 2 * MiB, 'los ceros se comprimen mucho');
  fallaCon('demasiado', () => abrirPaquete(paquete, { componente: 'addon' }));
});

test('demasiado: el tope maxDescomprimido es justo (n bytes valen, n + 1 no) y como mucho 5.000 archivos', () => {
  const archivos = [{ ruta: 'SnetForever/a.bin', bytes: Buffer.alloc(1000, 7) }];
  const paquete = paqueteDe('addon', archivos);
  const n = gunzipSync(paquete).length;
  assert.equal(abrirPaquete(paquete, { componente: 'addon', maxDescomprimido: n }).archivos.length, 1);
  fallaCon('demasiado', () => abrirPaquete(paquete, { componente: 'addon', maxDescomprimido: n - 1 }));
  const vacio = Buffer.alloc(0);
  const muchos = (k) => Array.from({ length: k }, (_, i) => ({ ruta: `SnetForever/a${String(i).padStart(5, '0')}`, bytes: vacio }));
  assert.equal(abrirPaquete(paqueteDe('addon', muchos(5000)), { componente: 'addon' }).archivos.length, 5000);
  fallaCon('demasiado', () => abrirPaquete(paqueteDe('addon', muchos(5001)), { componente: 'addon' }));
});

// ── Extraer ──

test('extraerPaquete escribe cada archivo con su ruta entera (y el de 0 bytes)', () => {
  const abierto = abrirPaquete(empaquetar({ componente: 'addon', version: '0.5.0', raiz: arbolAddon(), esquemaDatos: 1 }), { componente: 'addon' });
  const destino = join(temporal(), 'José Ñandú', 'preparando', 'nuevo');
  const { archivos } = extraerPaquete(abierto, destino);
  assert.deepEqual(archivos, [
    join(destino, 'SnetForever', 'SnetForever.toc'), join(destino, 'SnetForever', 'senales', 'vivo_a.wav'), join(destino, 'SnetForever', 'ui', 'ventana.lua'),
  ]);
  const hay = contenido(destino);
  assert.deepEqual(Object.keys(hay).sort(), ['SnetForever/SnetForever.toc', 'SnetForever/senales/vivo_a.wav', 'SnetForever/ui/ventana.lua']);
  assert.ok(hay['SnetForever/SnetForever.toc'].equals(TOC));
  assert.ok(hay['SnetForever/ui/ventana.lua'].equals(VENTANA));
  assert.equal(statSync(join(destino, 'SnetForever', 'senales', 'vivo_a.wav')).size, 0);
});

test('extraerPaquete en un destino que existe → destino, y no se toca nada', () => {
  const abierto = abrirPaquete(empaquetar({ componente: 'addon', version: '0.5.0', raiz: arbolAddon(), esquemaDatos: 1 }), { componente: 'addon' });
  const destino = arbol(temporal(), { 'mio.txt': 'no se toca' });
  fallaCon('destino', () => extraerPaquete(abierto, destino));
  assert.deepEqual(Object.keys(contenido(destino)), ['mio.txt']);
  assert.equal(readFileSync(join(destino, 'mio.txt'), 'utf8'), 'no se toca');
  // un archivo con ese nombre tampoco se pisa
  const archivo = join(destino, 'mio.txt');
  fallaCon('destino', () => extraerPaquete(abierto, archivo));
  assert.equal(readFileSync(archivo, 'utf8'), 'no se toca');
});

test('extraerPaquete con quitarPrimero → destino/src/x.mjs, sin el app/ delante', () => {
  const raiz = arbol(temporal(), { 'app/src/x.mjs': 'export const x = 1;\n', 'app/package.json': '{}' });
  const abierto = abrirPaquete(empaquetar({ componente: 'app', version: '0.5.0', raiz }), { componente: 'app' });
  const destino = join(temporal(), 'app', '0.5.0');
  const { archivos } = extraerPaquete(abierto, destino, { quitarPrimero: true });
  assert.deepEqual(archivos, [join(destino, 'package.json'), join(destino, 'src', 'x.mjs')]);
  assert.equal(readFileSync(join(destino, 'src', 'x.mjs'), 'utf8'), 'export const x = 1;\n');
  assert.ok(!existsSync(join(destino, 'app')));
});

test('extraerPaquete vuelve a comprobar las rutas de lo que recibe (un abierto hecho a mano no se escapa)', () => {
  const datos = Buffer.from('x');
  for (const ruta of ['SnetForever/../../fuera.lua', 'SnetForever/C:/x', 'SnetForever/aux.lua']) {
    const destino = join(temporal(), 'nuevo');
    fallaCon('ruta', () => extraerPaquete({ componente: 'addon', version: '0.5.0', archivos: [{ ruta, datos }] }, destino));
    assert.ok(!existsSync(destino), 'no se crea nada');
  }
  const destino = join(temporal(), 'nuevo');
  fallaCon('componente', () => extraerPaquete({ componente: 'addon', archivos: [{ ruta: 'app/x.mjs', datos }] }, destino));
  fallaCon('duplicado', () => extraerPaquete({ componente: 'addon', archivos: [{ ruta: 'SnetForever/a', datos }, { ruta: 'SnetForever/A', datos }] }, destino));
  fallaCon('formato', () => extraerPaquete({ componente: 'addon', archivos: [{ ruta: 'SnetForever/a', datos: 'texto' }] }, destino));
  assert.ok(!existsSync(destino));
});

// ── desempaquetar (F5-4): mirar dentro de un paquete sin pisar nada ──

test('F5-4: desempaquetar extrae en una carpeta nueva dentro de la que se pide, sin pisar nada', () => {
  const dir = temporal();
  const paquete = join(dir, 'SnetForever-addon-0.5.0.snfpaq');
  writeFileSync(paquete, empaquetar({ componente: 'addon', version: '0.5.0', raiz: arbolAddon(), esquemaDatos: 1 }));
  const carpeta = arbol(join(dir, 'mirar aquí'), { 'mio.txt': 'no se toca' });
  const r = desempaquetar(paquete, carpeta);
  assert.equal(r.carpeta, join(carpeta, 'SnetForever-addon-0.5.0'));
  assert.equal(r.componente, 'addon');
  assert.equal(r.version, '0.5.0');
  assert.equal(r.esquemaDatos, 1);
  assert.equal(r.archivos.length, 3);
  assert.ok(readFileSync(join(r.carpeta, 'SnetForever', 'ui', 'ventana.lua')).equals(VENTANA));
  assert.equal(readFileSync(join(carpeta, 'mio.txt'), 'utf8'), 'no se toca');
  // otra vez en la misma carpeta: va a otra ruta y la primera no se toca
  writeFileSync(join(r.carpeta, 'SnetForever', 'SnetForever.toc'), 'cambiado a mano');
  const r2 = desempaquetar(paquete, carpeta);
  assert.notEqual(r2.carpeta, r.carpeta);
  assert.ok(r2.carpeta.startsWith(join(carpeta, 'SnetForever-addon-0.5.0-')));
  assert.equal(readFileSync(join(r.carpeta, 'SnetForever', 'SnetForever.toc'), 'utf8'), 'cambiado a mano');
  assert.ok(readFileSync(join(r2.carpeta, 'SnetForever', 'SnetForever.toc')).equals(TOC));
  // la carpeta puede no existir aún
  const nueva = join(dir, 'no existe', 'todavía');
  assert.equal(desempaquetar(paquete, nueva).carpeta, join(nueva, 'SnetForever-addon-0.5.0'));
});

test('F5-4: desempaquetar comprueba el paquete entero y, si está manipulado, no escribe nada', () => {
  const dir = temporal();
  const paquete = join(dir, 'malo.snfpaq');
  writeFileSync(paquete, paqueteDe('addon', [{ ruta: 'SnetForever/../fuera.lua', bytes: Buffer.from('x') }]));
  const carpeta = join(dir, 'mirar');
  fallaCon('ruta', () => desempaquetar(paquete, carpeta));
  assert.ok(!existsSync(carpeta));
  const otro = join(dir, 'otro.snfpaq');
  writeFileSync(otro, paqueteDe('addon', [{ ruta: 'SnetForever/x.lua', bytes: Buffer.from('x') }], { extra: { componente: 'nada' } }));
  fallaCon('componente', () => desempaquetar(otro, carpeta));
  assert.ok(!existsSync(carpeta));
});
