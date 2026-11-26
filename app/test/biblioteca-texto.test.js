// Biblioteca de guías: reconocer pasos, misiones, PNJ y coordenadas en el texto de una guía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearBase, cargarBase } from '../src/base/base.mjs';
import { decodificar, htmlATexto, pasosDeTexto, normal, zonasDelTitulo } from '../src/biblioteca/texto.mjs';

// Base pequeña a mano: la zona 1413 y dos misiones inventadas (9101 y 9102, esta con el mismo nombre que otra de id mayor).
const mision = (name) => ({ name, startedBy: [10], finishedBy: [20], requiredLevel: 1, questLevel: 1 });
const base = crearBase({
  version: 't', esquema: 1,
  quest: { 9101: mision('Lomo de jabalí'), 9102: mision('Colmillos del norte'), 9103: mision('Colmillos del norte') },
  npc: {}, object: {}, item: {},
  es: { quest: {}, npc: {}, object: {}, item: {} },
  zonas: { area: {}, nombre: { 1413: { en: 'The Barrens', es: 'Los Baldíos' } } },
  mazmorra: {}, porFaccion: {},
});
const paso0 = (linea, extra) => pasosDeTexto(linea, { base, ...extra }).pasos[0];

test('coordenadas: los formatos que valen', () => {
  const casos = [
    ['(45.2, 67.8)', { x: 45.2, y: 67.8 }], ['45,2 67,8', { x: 45.2, y: 67.8 }], ['/way 45 67', { x: 45, y: 67 }],
    ['[45.2 67.8]', { x: 45.2, y: 67.8 }], ['.goto The Barrens,52.1,43.6', { mapa: 1413, x: 52.1, y: 43.6 }],
    ['/way Los Baldíos 52.1 43.6', { mapa: 1413, x: 52.1, y: 43.6 }],
    ['Ve a (45.2,67.8) ya', { x: 45.2, y: 67.8 }], ['45.2, 67.8', { x: 45.2, y: 67.8 }],
  ];
  for (const [linea, punto] of casos) assert.deepEqual(paso0(linea).punto, punto, linea);
});

test('coordenadas: lo que parece cifras pero no es un punto', () => {
  for (const linea of ['Nivel 10-20', 'Mata 20/30 lobos', 'Misión 1234', '/way 145 67', 'Tienes 3 de 12 pieles'])
    assert.equal(paso0(linea)?.punto, undefined, linea);
});

// Revisión de la tarea 10 (Review Focus 2): con coma decimal tras /way, «45» no es una zona: una zona de /way o .goto
// no puede ser solo cifras.
test('coordenadas: /way y .goto con coma decimal; la zona nunca es solo cifras', () => {
  const casos = [
    ['/way 45,2 67,8', { x: 45.2, y: 67.8 }], ['/way 45.2 67.8', { x: 45.2, y: 67.8 }],
    ['.goto 45,2, 67,8', { x: 45.2, y: 67.8 }], ['/way 45,2 67,8 Habla con el guarda', { x: 45.2, y: 67.8 }],
    ['/way Los Baldíos 52,1 43,6', { mapa: 1413, x: 52.1, y: 43.6 }], ['/way The Barrens 52.1 43.6', { mapa: 1413, x: 52.1, y: 43.6 }],
    ['.goto The Barrens,52.1,43.6', { mapa: 1413, x: 52.1, y: 43.6 }],
  ];
  for (const [linea, punto] of casos) assert.deepEqual(paso0(linea).punto, punto, linea);
  // con una línea de zona antes, el par sin zona hereda su mapa (como «/way 45 67»)
  assert.deepEqual(pasosDeTexto('Los Baldíos\n/way 45,2 67,8', { base }).pasos[1].punto, { mapa: 1413, x: 45.2, y: 67.8 });
  assert.deepEqual(pasosDeTexto('/way 45,2 67,8').pasos[0].punto, { x: 45.2, y: 67.8 });
  for (const linea of ['/way 12 145 67', '/way 1,5 145 67']) assert.equal(paso0(linea)?.punto, undefined, linea);
});

test('coordenadas: un par suelto solo vale si los dos números llevan decimales', () => {
  for (const linea of ['Gana 2.5 5 de oro', 'Reputación 1,5 2']) assert.equal(paso0(linea).punto, undefined, linea);
});

test('coordenadas: una zona nombrada que no se reconoce no hereda el mapa anterior', () => {
  const r = pasosDeTexto('Los Baldíos\n(50, 60)\n.goto Orgrimmar,52,50\n/way Zona Rara 10 20', { base });
  assert.deepEqual(r.pasos[1].punto, { mapa: 1413, x: 50, y: 60 });
  assert.deepEqual(r.pasos[2].punto, { zona: 'Orgrimmar', x: 52, y: 50 });
  assert.deepEqual(r.pasos[3].punto, { zona: 'Zona Rara', x: 10, y: 20 });
  assert.deepEqual(pasosDeTexto('.goto The Barrens,52.1,43.6').pasos[0].punto, { zona: 'The Barrens', x: 52.1, y: 43.6 });
});

test('htmlATexto: enlaces de Wowhead llegan a pasosDeTexto; quest= sin verbo es completar', () => {
  const t = htmlATexto('<p>Ve con <a href="https://www.wowhead.com/classic/npc=9203/x">Gruñón</a></p>'
    + '<p><a href="https://www.wowhead.com/classic/quest=9101/y">Lomo de jabalí</a></p>');
  const { pasos } = pasosDeTexto(t, { base });
  assert.deepEqual(pasos[0].pnjs, [9203]);
  assert.deepEqual(pasos[1].misiones, [{ q: 9101, accion: 'completar' }]);
});

test('htmlATexto: HTML mal formado no es cuadrático', () => {
  const t0 = performance.now();
  htmlATexto('<a b="'.repeat(35000));
  htmlATexto('<a b=\'x '.repeat(25000));
  assert.ok(performance.now() - t0 < 500, `tardó ${Math.round(performance.now() - t0)} ms`);
});

test('misiones: comandos .accept, .turnin y .complete', () => {
  assert.deepEqual(paso0('.accept 9101').misiones, [{ q: 9101, accion: 'aceptar' }]);
  assert.deepEqual(paso0('.turnin 9101').misiones, [{ q: 9101, accion: 'entregar' }]);
  assert.deepEqual(paso0('.complete 9101,2').misiones, [{ q: 9101, accion: 'completar', objetivo: 2 }]);
});

test('misiones y PNJ: enlaces de Wowhead', () => {
  assert.equal(paso0('https://www.wowhead.com/classic/quest=9101/x').misiones[0].q, 9101);
  assert.deepEqual(paso0('https://www.wowhead.com/classic/npc=9203').pnjs, [9203]);
  assert.deepEqual(paso0('.target 9203').pnjs, [9203]);
});

test('misiones: por nombre exacto, sin tildes ni mayúsculas', () => {
  const casos = [['Acepta «Lomo de jabalí»', 'aceptar'], ['Pick up lomo de jabali', 'aceptar'],
    ['Entrega Lomo de jabalí', 'entregar'], ['Turn in "LOMO DE JABALI"', 'entregar']];
  for (const [linea, accion] of casos) assert.deepEqual(paso0(linea).misiones, [{ q: 9101, accion }], linea);
});

test('misiones: si el nombre casa con varias, la de id menor; un nombre suelto que no existe no inventa nada', () => {
  assert.equal(paso0('Acepta Colmillos del norte').misiones[0].q, 9102);
  assert.deepEqual(paso0('Acepta la misión y sigue').misiones, []);
});

test('zona de una línea anterior y cabecera con niveles y facción', () => {
  const r = pasosDeTexto('Guía 10-20 (Horda)\nLos Baldíos\n(50, 60)\n- Otro sitio\n1. Mata lobos', { base });
  assert.deepEqual(r.niveles, [10, 20]);
  assert.equal(r.faccion, 'Horde');
  assert.deepEqual(r.pasos.at(2).punto, { mapa: 1413, x: 50, y: 60 });
  assert.deepEqual(r.pasos.slice(3).map((p) => p.texto), ['Otro sitio', 'Mata lobos']);
});

test('una línea sin nada reconocible es un paso de solo texto', () => {
  assert.deepEqual(pasosDeTexto('Habla con el herrero', { base }).pasos, [{ n: 1, texto: 'Habla con el herrero', misiones: [] }]);
});

test('htmlATexto: fuera script, comentarios y bloques de navegación; entidades y saltos de línea', () => {
  const html = '<nav>Menú</nav><p>Uno &amp; dos&nbsp;&#39;x&#39; &#x41;&#66;</p><script>var a=1;</script>'
    + '<div class="comments"><p>Fulano: hola</p><div>otro</div></div><ul><li>a</li><li>b</li></ul>fin';
  const t = htmlATexto(html);
  assert.ok(!t.includes('Menú') && !t.includes('var a') && !t.includes('Fulano') && !t.includes('otro'));
  assert.deepEqual(t.split('\n'), ["Uno & dos 'x' AB", 'a', 'b', 'fin']);
});

test('revisión final: «comment» solo por palabra y nunca en html, body, main ni article', () => {
  // Una página cuyo cuerpo se llama «comments-page» no se queda vacía.
  const pagina = htmlATexto('<html class="comments"><body class="comments-page"><main id="comentarios-main"><article class="comment">'
    + '<p>Acepta la misión en (40.5, 30.5)</p><div class="comment-list"><p>basura uno</p></div>'
    + '<div id="comentarios"><p>basura dos</p></div><div class="user_comments"><p>basura tres</p></div>'
    + '<div class="commentary-free"><p>se queda</p></div><div class="coment"><p>basura cuatro</p></div></article></main></body></html>');
  assert.ok(pagina.includes('Acepta la misión en (40.5, 30.5)'), pagina);
  assert.ok(pagina.includes('se queda'), 'commentary-free no es «comment» por palabra');
  for (const basura of ['basura uno', 'basura dos', 'basura tres', 'basura cuatro']) assert.ok(!pagina.includes(basura), basura);
});

test('decodificar: charset del content-type, de la etiqueta meta, y UTF-8 con BOM por defecto', () => {
  const ñ = Buffer.from([0xD1, 0x61, 0x6E, 0x64, 0xFA]);
  assert.equal(decodificar(ñ, 'text/html; charset=windows-1252'), 'Ñandú');
  assert.equal(decodificar(Buffer.concat([Buffer.from('<meta charset="windows-1252">'), ñ])), '<meta charset="windows-1252">Ñandú');
  assert.equal(decodificar(Buffer.from('﻿hola ñ', 'utf8')), 'hola ñ');
});

const baseZonas = () => crearBase({
  version: 't', esquema: 1, quest: {}, npc: {}, object: {}, item: {},
  es: { quest: {}, npc: {}, object: {}, item: {} },
  zonas: { area: {}, nombre: { 1413: { en: 'The Barrens', es: 'Los Baldíos' } } },
  mazmorra: {}, porFaccion: {},
});

test('normal quita tildes y zonasDelTitulo las encuentra con y sin tilde ni artículo', () => {
  assert.equal(normal('Los Baldíos'), 'los baldios');
  assert.equal(normal('Guía ÁÉÍÓÚ ñ'), 'guia aeiou n');
  const b = baseZonas();
  assert.deepEqual(zonasDelTitulo(b, 'Guía Horda 1-12 Los Baldíos'), [1413]);
  assert.deepEqual(zonasDelTitulo(b, 'Guía Horda 1-12 Baldios'), [1413]); // sin tilde ni artículo
  assert.deepEqual(zonasDelTitulo(b, 'Leveling 1-12 Barrens'), [1413]);
  assert.deepEqual(zonasDelTitulo(b, 'Guía Horda 1-12 Durotar'), []);
});

test('la cabecera sin tilde o sin artículo también da mapa a los puntos', () => {
  const b = baseZonas();
  for (const cab of ['Guía Horda 1-12 Baldios', 'Guía Horda 1-12 Baldíos', 'Guía Horda 1-12 The Barrens']) {
    const r = pasosDeTexto(`${cab}\n1. Habla con la herrera (50.2, 60.4)\n`, { base: b });
    assert.deepEqual(r.pasos[1].punto, { mapa: 1413, x: 50.2, y: 60.4 }, cab);
  }
});

// En el juego: «Acepta la mision La llave de la ciudad» quedaba sin misión y sin zona (punto de prueba A).
const baseLlave = () => crearBase({
  version: 't', esquema: 1,
  quest: { 9201: mision('Key to the City'), 9202: mision('The Key'), 9203: mision('Lomo de jabalí') },
  npc: {}, object: {}, item: {},
  es: { quest: { 9201: { name: 'La llave de la ciudad' }, 9202: { name: 'La llave' } }, npc: {}, object: {}, item: {} },
  zonas: { area: {}, nombre: {
    225: { en: 'The Stockade', es: 'Las Mazmorras' }, 1411: { en: 'Durotar', es: 'Durotar' },
    1413: { en: 'The Barrens', es: 'Los Baldíos' }, 1422: { en: 'Western Plaguelands', es: 'Tierras de la Peste del Oeste' },
    1458: { en: 'Undercity', es: 'Entrañas' },
  } },
  mazmorra: {}, porFaccion: {},
});

test('misiones: tras el verbo se salta «la misión» y casa el nombre más largo del principio', () => {
  const b = baseLlave();
  const casos = [
    ['Acepta la mision La llave de la ciudad en el puesto', 9201, 'aceptar'],
    ['Acepta la misión «La llave de la ciudad» del guardia', 9201, 'aceptar'],
    ['Recoge misión: "La llave de la ciudad"', 9201, 'aceptar'],
    ['Coge llave de la ciudad y vuelve', 9201, 'aceptar'], // sin artículo en el texto
    ['Pick up the quest Key to the City from the guard', 9201, 'aceptar'],
    ['Accept quest key to the city.', 9201, 'aceptar'],
    ['Entrega la mision La llave de la ciudad.', 9201, 'entregar'],
    ['Completa La llave de la ciudad (mata 5 lobos)', 9201, 'completar'],
    ['Acepta La llave del sótano', 9202, 'aceptar'], // el prefijo más largo que casa es «La llave»
    ['Acepta la misión Lomo de jabalí, y luego vuelve', 9203, 'aceptar'],
  ];
  for (const [linea, q, accion] of casos) {
    assert.deepEqual(pasosDeTexto(linea, { base: b }).pasos[0].misiones, [{ q, accion }], linea);
  }
  assert.deepEqual(pasosDeTexto('Acepta la misión y sigue', { base: b }).pasos[0].misiones, []);
  assert.deepEqual(pasosDeTexto('Acepta lo que te den', { base: b }).pasos[0].misiones, []);
  assert.deepEqual(pasosDeTexto('Acepta la llave del sótano', { base: b }).pasos[0].misiones, [], '«La llave» en minúscula y seguida de más texto no');
});

test('zonas: un nombre de zona entero en cualquier línea cuenta para la guía, sin mover los puntos', () => {
  const b = baseLlave();
  const r = pasosDeTexto('Mi ruta de prueba\nViaja a Los Baldíos (50.2, 60.4)\nLuego ve a Durotar\n(30.5, 40.5)\nSigue hacia tierras de la peste del oeste', { base: b });
  assert.deepEqual(r.zonas, [1413, 1411, 1422]);
  assert.deepEqual(r.pasos[1].punto, { x: 50.2, y: 60.4 }, 'mencionar una zona no da mapa al punto');
  assert.deepEqual(r.pasos[3].punto, { x: 30.5, y: 40.5 }, 'ni a los siguientes');
});

test('zonas: con y sin artículo y sin tildes; un nombre de una sola palabra solo con mayúscula', () => {
  const b = baseLlave();
  const zonas = (linea) => pasosDeTexto(`Notas\n${linea}`, { base: b }).zonas ?? [];
  assert.deepEqual(zonas('Ve a Baldios'), [1413]);
  assert.deepEqual(zonas('Go to The Barrens'), [1413]);
  assert.deepEqual(zonas('go to the barrens'), [], 'una sola palabra (sin el artículo) en minúscula no es la zona');
  assert.deepEqual(zonas('Entra en Las Mazmorras'), [225]);
  assert.deepEqual(zonas('Haz las mazmorras de tu nivel'), []);
  assert.deepEqual(zonas('Recoge 8 entrañas de jabalí'), []);
  assert.deepEqual(zonas('Vuelve a Entrañas'), [1458]);
  assert.deepEqual(zonas('Ve a Durotarx'), [], 'con límites de palabra');
});

test('zonas: la cabecera también cuenta (como zonasDelTitulo)', () => {
  const r = pasosDeTexto('Guía Horda 1-12 baldios\n1. Habla con la herrera (50.2, 60.4)\n', { base: baseLlave() });
  assert.deepEqual(r.zonas, [1413]);
  assert.deepEqual(r.pasos[1].punto, { mapa: 1413, x: 50.2, y: 60.4 });
});

const MISIONES_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'addons', 'SnetForever_Misiones');
test('datos reales: «Acepta la mision La llave de la ciudad en el puesto» da 93680', {
  skip: !existsSync(join(MISIONES_REPO, 'nucleo.lua')) && 'faltan los datos reales', timeout: 300000,
}, () => {
  const b = cargarBase(MISIONES_REPO);
  const r = pasosDeTexto('Acepta la mision La llave de la ciudad en el puesto\nEntrega Key to the City', { base: b });
  assert.deepEqual(r.pasos[0].misiones, [{ q: 93680, accion: 'aceptar' }]);
  assert.deepEqual(r.pasos[1].misiones, [{ q: 93680, accion: 'entregar' }]);
  for (const linea of FALSAS) assert.deepEqual(pasosDeTexto(linea, { base: b }).pasos[0].misiones, [], linea);
  for (const [linea, accion] of [['Coge llave de la ciudad', 'aceptar'], ['Accept quest key to the city.', 'aceptar']]) {
    assert.deepEqual(pasosDeTexto(linea, { base: b }).pasos[0].misiones, [{ q: 93680, accion }], linea);
  }
});

// Revisión de la tarea A (Important 1): frases normales que empezaban por el nombre corto de una misión de la base real.
const FALSAS = [
  'Mata los múrlocs y recoge almejas por la orilla', // 6142 «Almejas»
  'Recoge engranajes del suelo', // 3922 «Engranajes»
  'Recoge la arcanita del cofre', // 7630 «La arcanita»
  'Pick up the rescue kit', // 498 «The Rescue» / «El rescate»
  'Completa el despertar de los druidas', // 5321 «El despertar»
  'Recoge rumores en la taberna', // 1115 «Rumores»
  'Accept more work from him', // 90750 «More Work?»
];
const baseCortas = () => crearBase({
  version: 't', esquema: 1,
  quest: {
    6142: mision('Clam Bait'), 3922: mision('Nugget Slugs'), 7630: mision('Arcanite'), 498: mision('The Rescue'),
    5321: mision('The Sleeper Has Awakened'), 1115: mision('The Rumormonger'), 90750: mision('More Work?'),
    9201: mision('Key to the City'),
  },
  npc: {}, object: {}, item: {},
  es: { quest: {
    6142: { name: 'Almejas' }, 3922: { name: 'Engranajes' }, 7630: { name: 'La arcanita' }, 498: { name: 'El rescate' },
    5321: { name: 'El despertar' }, 1115: { name: 'Rumores' }, 9201: { name: 'La llave de la ciudad' },
  }, npc: {}, object: {}, item: {} },
  zonas: { area: {}, nombre: {} }, mazmorra: {}, porFaccion: {},
});

test('misiones: un nombre corto (núcleo de una o dos palabras) solo vale entre comillas, como resto entero o con mayúscula', () => {
  const b = baseCortas();
  const misiones = (linea) => pasosDeTexto(linea, { base: b }).pasos[0].misiones;
  for (const linea of FALSAS) assert.deepEqual(misiones(linea), [], linea);
  const buenas = [
    ['Acepta la mision La llave de la ciudad en el puesto', 9201], ['Pick up Key to the City', 9201],
    ['Coge llave de la ciudad y vuelve', 9201], ['Accept quest key to the city.', 9201],
    ['Recoge «almejas» del muelle', 6142], ['Recoge almejas', 6142], ['Recoge almejas.', 6142],
    ['Recoge Almejas por la orilla', 6142], ['Recoge La arcanita del cofre', 7630], ['Pick up The Rescue at the camp', 498],
    ['Accept "More Work?" from him', 90750], ['Accept More Work? from him', 90750], ['Completa El despertar', 5321],
  ];
  for (const [linea, q] of buenas) assert.equal(misiones(linea)[0]?.q, q, linea);
});
