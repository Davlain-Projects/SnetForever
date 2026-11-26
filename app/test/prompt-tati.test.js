// Instrucciones por partes para los turnos de TATI: un núcleo fijo (las secciones de todos los turnos, una chuleta del
// bloque snet y un índice de temas) y la herramienta `instrucciones({tema})`, que da cada tema entero. Todo sale de
// sistema.md partido por sus `## `: aquí se parte otra vez, por separado, para comprobar que no se copia nada a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SISTEMA, SISTEMA_TATI, TEMAS, textoDeTema } from '../src/prompt.mjs';
import { crearCatalogo } from '../src/herramientas/catalogo.mjs';

const ARCHIVO = readFileSync(new URL('../src/prompt/sistema.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Las secciones `## ` de sistema.md, por su título en español (lo de antes del paréntesis).
const SECCIONES = new Map(ARCHIVO.split(/^(?=## )/m).slice(1).map((s) => [s.split('\n')[0].replace(/^## /, '').replace(/ \(.*$/, ''), s.trimEnd()]));
// abrirGuia (la guía de la biblioteca tal cual) subió el núcleo de 22 977 a 23 230 caracteres: el tope, lo medido y un
// margen pequeño.
const TOPE = 23_300;

// El cuerpo de una sección: sus líneas largas (más de 120 caracteres), que no pueden estar en el núcleo.
const lineasLargas = (seccion) => seccion.split('\n').filter((l) => l.length > 120);

test('cada tema del índice es una sección de sistema.md (si alguien la renombra, falla)', () => {
  assert.ok(TEMAS.length >= 5);
  assert.equal(new Set(TEMAS.map((t) => t.tema)).size, TEMAS.length, 'sin temas repetidos');
  for (const t of TEMAS) {
    assert.match(t.tema, /^[a-z_]{3,20}$/, t.tema);
    assert.ok(SECCIONES.has(t.titulo), `«${t.titulo}» no es una sección de sistema.md`);
    assert.equal(typeof t.cuando, 'string');
    assert.ok(t.cuando.length > 20 && t.cuando.length < 300, `${t.tema}: ${t.cuando.length}`);
  }
  for (const titulo of ['Pines y rutas', 'Comercio', 'Talentos, profesiones y subasta', 'Inventario']) {
    assert.ok(TEMAS.some((t) => t.titulo === titulo), `«${titulo}» va como tema`);
  }
  // Los datos vienen en cada turno: sus campos van en el núcleo, no como tema.
  assert.ok(!TEMAS.some((t) => t.titulo === 'Campos de los datos' || t.tema === 'campos'), 'Campos de los datos no es un tema');
});

test('textoDeTema da exactamente la sección de sistema.md; uno que no existe, null', () => {
  for (const t of TEMAS) assert.equal(textoDeTema(t.tema), SECCIONES.get(t.titulo), t.tema);
  // También por su título, sin mirar mayúsculas ni espacios de más.
  assert.equal(textoDeTema('  PINES Y RUTAS '), SECCIONES.get('Pines y rutas'));
  for (const malo of ['no_existe', '', null, undefined, 7, {}, 'Reglas finales', 'campos']) assert.equal(textoDeTema(malo), null, String(malo));
});

test('SISTEMA_TATI: el núcleo, la chuleta del bloque snet y el índice; sin el cuerpo de los temas', () => {
  const nucleo = ['Cómo contestas', 'Cómo viene el mensaje', 'Qué datos puedes usar', 'Herramientas de SnetForever', 'Internet',
    'Campos de los datos', 'Reglas finales'];
  for (const titulo of nucleo) {
    assert.ok(SECCIONES.has(titulo), titulo);
    assert.ok(SISTEMA_TATI.includes(SECCIONES.get(titulo)), `falta la sección «${titulo}» entera`);
  }
  // El principio de sistema.md (quién eres), tal cual.
  assert.ok(SISTEMA_TATI.startsWith(ARCHIVO.split(/^(?=## )/m)[0].trimEnd()));
  // Ninguna línea larga de los temas (las de la chuleta son de «Pines y rutas» y están contadas aparte).
  const chuleta = new Set(SISTEMA_TATI.split('\n'));
  for (const t of TEMAS) {
    const fuera = lineasLargas(SECCIONES.get(t.titulo)).filter((l) => chuleta.has(l) && t.titulo !== 'Pines y rutas');
    assert.deepEqual(fuera, [], `${t.tema}: el cuerpo no va en el núcleo`);
  }
  const pines = lineasLargas(SECCIONES.get('Pines y rutas'));
  const dentro = pines.filter((l) => chuleta.has(l));
  assert.ok(dentro.length <= 4, `de «Pines y rutas» solo la chuleta: ${dentro.length} líneas largas`);
  for (const frase of ['## Pines y rutas', '**Guías enteras con `guiaNueva`', '**Speed run', '**Cuándo es `ruta` y cuándo `pines`.**',
    '## Comercio', '`datos.comercio` trae', '**Talentos.**']) {
    assert.ok(!SISTEMA_TATI.includes(frase), `no lleva «${frase}»`);
  }
  assert.ok(!SISTEMA_TATI.includes('\r'));
});

test('SISTEMA_TATI: la chuleta sale del texto de «Pines y rutas» (P#, bloque snet, claves y un ejemplo de una línea)', () => {
  const pines = SECCIONES.get('Pines y rutas').split('\n');
  const de = (prefijo) => {
    const l = pines.filter((x) => x.startsWith(prefijo));
    assert.equal(l.length, 1, prefijo);
    return l[0];
  };
  for (const prefijo of ['- **Los sitios de la base van con `P#`.**', '- Como mucho un bloque `snet` por respuesta', '  - `ruta`:', '  - `pines`:',
    '  - `marcas`:', '  - `guia`:', '  - `comercio`:', '- Los `P#` y los objetos que no estén en los datos del turno se descartan']) {
    assert.ok(SISTEMA_TATI.includes(`\n${de(prefijo)}\n`), `falta «${prefijo}»`);
  }
  // El primer ejemplo del bloque, con su valla: una línea de JSON válido.
  const ejemplo = pines.find((l) => l.startsWith('{"ruta":'));
  assert.ok(ejemplo);
  JSON.parse(ejemplo);
  assert.ok(SISTEMA_TATI.includes(`\`\`\`snet\n${ejemplo}\n\`\`\``));
  // Los ejemplos de guiaNueva, no (están en el tema).
  assert.ok(!SISTEMA_TATI.includes('{"guiaNueva":'));
});

test('SISTEMA_TATI: el índice nombra la herramienta y cada tema con su cuándo, una línea por tema', () => {
  assert.ok(SISTEMA_TATI.includes('`instrucciones`'));
  for (const t of TEMAS) {
    const linea = SISTEMA_TATI.split('\n').filter((l) => l.startsWith(`- \`${t.tema}\``));
    assert.equal(linea.length, 1, t.tema);
    assert.ok(linea[0].includes(`«${t.titulo}»`), linea[0]);
    assert.ok(linea[0].includes(t.cuando), linea[0]);
  }
  for (const frase of ['pines', 'rutas', '`guiaNueva`', 'inventario', 'talentos', 'comercio']) assert.ok(SISTEMA_TATI.includes(frase), frase);
});

test('SISTEMA_TATI: cabe en el tope y es mucho más corto que sistema.md; siempre el mismo texto', async () => {
  assert.ok(SISTEMA_TATI.length <= TOPE, `${SISTEMA_TATI.length} caracteres`);
  assert.ok(SISTEMA_TATI.length < ARCHIVO.length / 2);
  // Nada que dependa del turno: el mismo al cargarlo otra vez.
  const otra = await import(`../src/prompt.mjs?otra=${Date.now()}`);
  assert.equal(otra.SISTEMA_TATI, SISTEMA_TATI);
  assert.ok(!/\d{4}-\d{2}-\d{2}|<datos_juego id="[0-9a-f]/.test(SISTEMA_TATI));
  // El chat propio de la app sigue con sistema.md entero.
  assert.equal(SISTEMA.replace(/\r\n/g, '\n'), ARCHIVO);
});

// ---------- la herramienta instrucciones ----------

const catalogo = () => crearCatalogo({ turno: () => null, base: () => null, lector: {} });

test('instrucciones({tema}): da la sección entera de sistema.md, sin base ni turno', async () => {
  const h = catalogo().find((x) => x.nombre === 'instrucciones');
  assert.ok(h, 'está en el catálogo');
  for (const t of TEMAS) {
    assert.deepEqual(await h.ejecutar({ tema: t.tema }), { tema: t.tema, texto: SECCIONES.get(t.titulo) }, t.tema);
  }
  assert.deepEqual(await h.ejecutar({ tema: 'Comercio' }), { tema: 'comercio', texto: SECCIONES.get('Comercio') });
});

test('instrucciones con un tema que no existe (o sin tema): error con la lista de temas válidos', async () => {
  const h = catalogo().find((x) => x.nombre === 'instrucciones');
  const temas = TEMAS.map((t) => t.tema);
  for (const args of [{ tema: 'no_existe' }, {}, { tema: 3 }, { tema: 'Reglas finales' }]) {
    assert.deepEqual(await h.ejecutar(args), { error: 'tema', temas }, JSON.stringify(args));
  }
});

test('instrucciones: esquema con los temas y descripción corta que nombra los temas', () => {
  const h = catalogo().find((x) => x.nombre === 'instrucciones');
  assert.deepEqual(h.esquema.required, ['tema']);
  assert.deepEqual(h.esquema.properties.tema.enum, TEMAS.map((t) => t.tema));
  assert.equal(h.esquema.additionalProperties, false);
  assert.ok(Array.from(h.descripcion).length <= 400, `${Array.from(h.descripcion).length}`);
  for (const t of TEMAS) assert.ok(h.descripcion.includes(t.tema), t.tema);
  assert.match(h.descripcion, /no gasta ranuras/);
});


// ---------- T2 (A3) y T3 (S1, B5): las reglas de objetivos, de no sustituir la guía a medias y de cómo va la guía ----------

test('T2/T3: el núcleo de TATI (chuleta y campos) lleva los objetivos entre recoger y entregar, la guía a medias y fin/tramo', () => {
  for (const frase of [
    'pon sus objetivos (`P#` de papel `objetivo`) entre recoger y entregar', 'lo que dicen sus `textos`',
    'nada de `ruta`', '`{"tipo":"linea","ruta":true}`', 'explícale su paso actual',
    '`fin: true`', 'no le digas que va por su último paso', '`tramo`', 'sin `pendientes`, no le digas que escriba «sigue»',
  ]) {
    assert.ok(SISTEMA_TATI.includes(frase), `falta «${frase}»`);
  }
  assert.ok(SISTEMA_TATI.length <= TOPE, `${SISTEMA_TATI.length} caracteres`);
});

test('T2/T3: «Pines y rutas» pide los objetivos en guiaNueva, en mazmorras y en entregas, y no sustituir la guía a medias', () => {
  const pines = SECCIONES.get('Pines y rutas');
  assert.ok(!/sitios de recoger y entregar/.test(pines), 'ya no dice solo «recoger y entregar»');
  assert.ok(pines.includes('sus sitios de recoger, de sus objetivos y de entregar'));
  assert.ok(pines.includes('Si alguna aún no está lista para entregar, pon antes sus objetivos'));
  assert.ok(pines.includes('pon sus pasos de `completar` entre aceptar y entregar'));
  // Ronda 1 (M8): la excepción de la guía a medias vale para los tres casos, también en inglés y con el «sigue».
  assert.ok(pines.includes('Con su guía (`datos.ruta`) a medias o con tramos pendientes, en ninguno de los tres salvo que él pida la ruta o llegar a un sitio'));
  assert.ok(pines.includes('With their guide (`datos.ruta`) half done or with parts left, none of the three unless they ask for the route or to get somewhere'));
  assert.ok(pines.includes('if it is done and parts are left, tell them to type «sigue»'));
  assert.ok(!pines.includes('salvo que su guía (`datos.ruta`) esté a medias o le queden tramos'));
  assert.ok(!pines.includes('«escribe «sigue» para el siguiente tramo»'), 'el speed run ya no promete «sigue»');
});
