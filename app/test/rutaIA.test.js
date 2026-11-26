// Tarea 18: la app comprueba cada misión y cada punto de la ruta de la IA antes de mandarla al juego.
// Tarea 19: la ruta comprobada pasa a guías del addon «IA\…», partida en tramos si no cabe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutarDatos } from '../src/base/leer-lua.mjs';
import { crearBase, cargarBase } from '../src/base/base.mjs';
import { puntoDeMarca } from '../src/herramientas/marcas.mjs';
import { paresDeTexto } from '../src/biblioteca/texto.mjs';
import { aLuaSeguro } from '../src/buzon.mjs';
import { MAX_BYTES_GUIA, MAX_ELEMENTOS_PASO } from '../src/rutaZona.mjs';
import { comprobarGuiaNueva, guiasDeRuta } from '../src/rutaIA.mjs';
import { textoGuiaNueva } from '../src/textos.mjs';

function baseDePrueba() {
  const raiz = {};
  const cabecera = 'SNF_MISIONES = {version="t",esquema=1,quest={},npc={},object={},item={},es={quest={},npc={},object={},'
    + 'item={[9702]={name="Poción rara"}}},'
    + 'zonas={area={},nombre={[1413]={en="The Barrens",es="Los Baldíos"}}},mazmorra={},porFaccion={}}\n'
    + 'local Q = SNF_MISIONES.quest\nlocal N = SNF_MISIONES.npc\nlocal I = SNF_MISIONES.item\n';
  const quest = (q, nivel, zona, objetivos = '{}') => `Q[${q}] = {name="Misión ${q}",startedBy={{9201}},finishedBy={{9202}},requiredLevel=${nivel},questLevel=${nivel},`
    + `requiredRaces=0,requiredClasses=0,objectivesText={},sourceItemId=0,zoneOrSort=${zona},nextQuestInChain=0,questFlags=0,`
    + `specialFlags=0,parentQuest=0,objectives=${objetivos}}\n`;
  // Tarea 19: 9110 tiene tres objetivos (un PNJ, un ojo que suelta y una poción sin sitio en la base) y 9111, cuatro.
  const cuerpo = quest(9101, 1, 17) + quest(9105, 3, 1581) + quest(9106, 20, 17)
    + quest(9110, 12, 17, '{[1]={{9203}},[3]={{9701},{9702}}}') + quest(9111, 14, 17, '{[1]={{9203},{9203},{9203},{9203}}}')
    + 'N[9201] = {name="Da",spawns={[1413]={{50,50}}}}\nN[9202] = {name="Recibe",spawns={[1413]={{60,60}}}}\n'
    + 'N[9203] = {name="Bicho",spawns={[1413]={{30,30}}}}\n'
    + 'I[9701] = {name="Eye",npcDrops={9203}}\nI[9702] = {name="Rare potion"}\n';
  ejecutarDatos(cabecera + cuerpo, raiz, 'texto.lua');
  return crearBase(raiz.SNF_MISIONES);
}
const base = baseDePrueba();
const pj = { faccion: 'Horde', nivel: 1 };
const pasoDeGuia = { n: 2, texto: 'Ve allí', misiones: [], punto: { mapa: 1413, x: 12.5, y: 80 } };
const URL_LEIDA = 'https://ejemplo.test/guia';

function opciones(extra = {}) {
  return {
    base,
    pj,
    puntos: new Map([['P1', { mapa: 1413, x: 40, y: 41, texto: 'Sitio uno' }]]),
    puntoDeMarca: (marca) => puntoDeMarca(marca, { base, pj, mapaJugador: 1413, pasoDeGuia: (id, n) => (id === 'abcd1234' && n === 2 ? pasoDeGuia : null) }),
    paginas: [{ url: URL_LEIDA, texto: 'Ve a (52.1, 43.6) y sigue.' }],
    misionesBiblioteca: new Set([777001]),
    resolverZona: (zona) => (zona === 'Los Baldíos' || zona === 1413 ? { uiMap: 1413 } : null),
    ...extra,
  };
}
const tramo = (...pasos) => ({ titulo: 'Ruta', tramos: [{ titulo: 'Uno', pasos }], quitados: { pasos: 0, tramos: 0, textos: 0 } });
const pasosDe = (r) => r.tramos.flatMap((t) => t.pasos);
const web = (extra = {}) => ({ zona: 'Los Baldíos', x: 52.1, y: 43.6, url: URL_LEIDA, ...extra });

test('paresDeTexto: punto o coma decimal, entre paréntesis y pares que se pisan', () => {
  assert.deepEqual(paresDeTexto('mira 52,1 43,6 y (10.5, 20)'), [{ x: 52.1, y: 43.6 }, { x: 10.5, y: 20 }]);
  assert.deepEqual(paresDeTexto('10 52.1 43.6'), [{ x: 10, y: 52.1 }, { x: 52.1, y: 43.6 }]);
  assert.deepEqual(paresDeTexto('sin números'), []);
});

test('revisión final: paresDeTexto no toma dos enteros seguidos sin separador explícito como par', () => {
  assert.deepEqual(paresDeTexto('mata 10 20 jabalíes'), []);
  assert.deepEqual(paresDeTexto('en 45 67'), []);
  assert.deepEqual(paresDeTexto('en 45, 67'), [{ x: 45, y: 67 }]);
  assert.deepEqual(paresDeTexto('en 45;67'), [{ x: 45, y: 67 }]);
  assert.deepEqual(paresDeTexto('en (45 67) y en [12 34]'), [{ x: 45, y: 67 }, { x: 12, y: 34 }]);
  assert.deepEqual(paresDeTexto('en ( 45 67 )'), [{ x: 45, y: 67 }]);
  assert.deepEqual(paresDeTexto('en 45 67.5'), [{ x: 45, y: 67.5 }], 'con un decimal basta');
  assert.deepEqual(paresDeTexto('43,6'), [], 'un número con coma decimal');
  assert.deepEqual(paresDeTexto('(45 67'), [], 'sin cerrar el paréntesis');
});

test('misiones: la que no está en la base ni en la biblioteca se quita y cuenta; la de la biblioteca se queda', () => {
  const r = comprobarGuiaNueva(tramo({ misiones: [{ q: 9101, accion: 'aceptar' }, { q: 999999, accion: 'entregar' }, { q: 777001, accion: 'completar', objetivo: 2 }] }), opciones());
  assert.deepEqual(pasosDe(r)[0].misiones, [{ q: 9101, accion: 'aceptar' }, { q: 777001, accion: 'completar', objetivo: 2 }]);
  assert.equal(r.quitados.misiones, 1);
});

test('un paso que se queda sin misiones, sin punto y sin texto se quita y cuenta', () => {
  const r = comprobarGuiaNueva(tramo({ misiones: [{ q: 999999, accion: 'aceptar' }] }, { texto: 'Hola' }), opciones());
  assert.equal(pasosDe(r).length, 1);
  assert.equal(pasosDe(r)[0].texto, 'Hola');
  assert.equal(r.quitados.pasos, 1);
});

test('un tramo sin pasos se quita y cuenta sus pasos; el otro sigue', () => {
  const guia = { titulo: 'R', tramos: [{ titulo: 'A', pasos: [{ misiones: [{ q: 999999, accion: 'aceptar' }] }] }, { titulo: 'B', pasos: [{ texto: 'x' }] }], quitados: {} };
  const r = comprobarGuiaNueva(guia, opciones());
  assert.deepEqual(r.tramos.map((t) => t.titulo), ['B']);
  assert.equal(r.quitados.pasos, 1);
});

test('una guía con pasos sueltos sale como un solo tramo', () => {
  const r = comprobarGuiaNueva({ titulo: 'R', pasos: [{ texto: 'x' }] }, opciones());
  assert.deepEqual(r.tramos, [{ titulo: 'R', pasos: [{ texto: 'x' }] }]);
});

test('puntos: B:q9101:r, G:<id>:2 y P1 dan su punto y su origen; una marca que no sale se quita', () => {
  const r = comprobarGuiaNueva(tramo({ punto: 'B:q9101:r' }, { punto: 'G:abcd1234:2' }, { punto: 'P1' }, { punto: 'B:q999999:r', texto: 'sigue' }, { punto: 'P9' }), opciones());
  const pasos = pasosDe(r);
  assert.equal(pasos.length, 4);
  assert.deepEqual([pasos[0].punto.mapa, pasos[0].punto.x, pasos[0].punto.y, pasos[0].punto.origen], [1413, 50, 50, { tipo: 'base' }]);
  assert.deepEqual([pasos[1].punto.x, pasos[1].punto.y, pasos[1].punto.origen.tipo], [12.5, 80, 'guia']);
  assert.deepEqual(pasos[2].punto, { mapa: 1413, x: 40, y: 41, origen: { tipo: 'turno' } });
  assert.equal(pasos[3].punto, undefined);
  assert.equal(pasos[3].texto, 'sigue');
  assert.equal(r.quitados.puntos, 2);
});

test('web: vale con la página leída y sus coordenadas en el texto (punto o coma, redondeadas a una cifra)', () => {
  const r = comprobarGuiaNueva(tramo({ web: web() }), opciones());
  assert.deepEqual(pasosDe(r)[0].punto, { mapa: 1413, x: 52.1, y: 43.6, origen: { tipo: 'web', url: URL_LEIDA } });
  assert.equal(r.quitados.web, 0);
  const coma = comprobarGuiaNueva(tramo({ web: web({ x: 52.12, y: 43.58 }) }), opciones({ paginas: [{ url: URL_LEIDA, texto: 'en 52,1 43,6' }] }));
  assert.equal(pasosDe(coma).length, 1);
});

test('web: no vale con otras coordenadas, url no leída, zona sin resolver o sin páginas', () => {
  const casos = [
    [web(), opciones({ paginas: [{ url: URL_LEIDA, texto: 'Ve a (52.4, 43.6)' }] })],
    [web({ url: 'https://otra.test/x' }), opciones()],
    [web({ zona: 'Atlántida' }), opciones()],
    [web(), opciones({ paginas: null })],
  ];
  for (const [w, o] of casos) {
    const r = comprobarGuiaNueva(tramo({ web: w }), o);
    assert.equal(pasosDe(r).length, 0);
    assert.equal(r.quitados.web, 1);
    assert.equal(r.quitados.pasos, 1);
  }
});

test('web: la url se compara sin #fragmento, sin barra final y con http como https', () => {
  const o = opciones({ paginas: [{ url: 'https://ejemplo.test/guia/', texto: '52.1, 43.6' }] });
  for (const url of ['http://ejemplo.test/guia#paso3', 'https://ejemplo.test/guia/#x', 'https://ejemplo.test/guia']) {
    assert.equal(pasosDe(comprobarGuiaNueva(tramo({ web: web({ url }) }), o)).length, 1, url);
  }
});

test('web fallida con texto: el paso se queda sin punto', () => {
  const r = comprobarGuiaNueva(tramo({ texto: 'Ve', web: web() }), opciones({ paginas: null }));
  assert.deepEqual(pasosDe(r), [{ texto: 'Ve' }]);
  assert.equal(r.quitados.web, 1);
});

test('no se quita nada por nivel ni por mazmorra: 9105 y 9106 con un personaje de nivel 1 se quedan', () => {
  const r = comprobarGuiaNueva(tramo({ misiones: [{ q: 9105, accion: 'aceptar' }, { q: 9106, accion: 'aceptar' }] }), opciones());
  assert.equal(pasosDe(r)[0].misiones.length, 2);
  assert.deepEqual(r.quitados, { misiones: 0, puntos: 0, web: 0, pasos: 0 });
});

test('la guía de entrada no se modifica', () => {
  const guia = tramo({ misiones: [{ q: 999999, accion: 'aceptar' }], texto: 'a' });
  const copia = JSON.stringify(guia);
  comprobarGuiaNueva(guia, opciones());
  assert.equal(JSON.stringify(guia), copia);
});

// ------------------------------------------------------------------------------------------------------------------
// Tarea 19: guiasDeRuta
// ------------------------------------------------------------------------------------------------------------------

const PJ_RUTA = { faccion: 'Horde', nivel: 10 };
const P = { mapa: 1413, x: 40, y: 41, origen: { tipo: 'turno' } };
const de = (titulo, pasos) => [{ titulo, pasos }];
const guias = (tramos, extra = {}) => guiasDeRuta(tramos, { titulo: 'Ruta', pj: PJ_RUTA, idioma: 'es', base, ...extra });
const bytesLua = (g) => Buffer.byteLength(aLuaSeguro(g), 'utf8');
const bytes = (t) => Buffer.byteLength(t, 'utf8');
const misionesDe = (g) => new Set(g.pasos.flatMap((p) => p.elementos.filter((e) => e.q !== undefined).map((e) => e.q)));

test('guiasDeRuta: cada regla de elementos del paso', () => {
  const [g] = guias(de('Uno', [
    { misiones: [{ q: 9101, accion: 'aceptar' }], punto: P },
    { misiones: [{ q: 9101, accion: 'entregar' }] },
    { misiones: [{ q: 9101, accion: 'completar', objetivo: 2 }] },
    { misiones: [{ q: 9101, accion: 'completar' }] },
    { misiones: [{ q: 9111, accion: 'completar' }] },
    { misiones: [{ q: 777001, accion: 'completar' }] },
    { punto: P },
    { texto: 'Ve allí', punto: P },
    { texto: 'Habla con él', misiones: [{ q: 9105, accion: 'aceptar' }] },
    { texto: 'Solo texto' },
  ]));
  const el = g.pasos.map((p) => p.elementos);
  assert.deepEqual(el[0], [{ t: 'goto', mapa: 1413, x: 40, y: 41, modo: 'flecha' }, { t: 'accept', q: 9101 }]);
  assert.deepEqual(el[1], [{ t: 'turnin', q: 9101 }]);
  assert.deepEqual(el[2], [{ t: 'complete', q: 9101, objetivo: 2 }]);
  assert.deepEqual(el[3], [{ t: 'complete', q: 9101, objetivo: 1 }], 'sin objetivos en la base: al menos uno');
  assert.deepEqual(el[4], [1, 2, 3, 4].map((k) => ({ t: 'complete', q: 9111, objetivo: k })), 'uno por objetivo de la base');
  assert.deepEqual(el[5], [{ t: 'complete', q: 777001, objetivo: 1 }], 'de la biblioteca, sin la base: uno');
  assert.deepEqual(el[6], [{ t: 'goto', mapa: 1413, x: 40, y: 41, modo: 'objetivo', radio: 10 }]);
  assert.deepEqual(el[7], [{ t: 'goto', mapa: 1413, x: 40, y: 41, modo: 'objetivo', radio: 10 }, { t: 'nota', texto: { es: 'Ve allí', en: 'Ve allí' } }]);
  assert.deepEqual(el[8], [{ t: 'accept', q: 9105 }, { t: 'nota', texto: { es: 'Habla con él', en: 'Habla con él' } }]);
  assert.deepEqual(el[9], [{ t: 'manual', texto: { es: 'Solo texto', en: 'Solo texto' } }]);
  // Campos de la guía, como construirGuia de rutaZona.mjs.
  assert.equal(g.clave, 'IA\\Ruta de Uno (Horda)');
  assert.equal(g.clave.indexOf('\\'), 2, 'una sola barra, la del prefijo');
  assert.equal(g.clave.lastIndexOf('\\'), 2);
  assert.equal(g.nombre, 'Ruta de Uno (Horda)');
  assert.deepEqual(g.titulo, { es: 'Ruta de Uno (Horda)', en: 'Ruta de Uno (Horda)' });
  assert.equal(g.tipo, 'ia');
  assert.equal(g.grupo, 'IA');
  assert.equal(g.sinVerificar, true);
  assert.equal(g.faccion, 'Horde');
  assert.deepEqual(g.niveles, { min: 1, max: 14 });
  assert.deepEqual(g.resumen, { misiones: 4, pasos: 10, elites: 0, grupo: 0 });
  assert.deepEqual(g.pasos.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(g.pasos.every((p) => /^[0-9a-f]{8}(-\d+)?$/.test(p.id) && p.linea === 0));
});

test('revisión final: un paso con punto de internet lleva en su nota «(de internet: <sitio>)», solo con el host', () => {
  const W = { mapa: 1413, x: 52.1, y: 43.6, origen: { tipo: 'web', url: 'https://www.wowhead.com/classic/npc=123?x=1#mapa' } };
  const [g] = guias(de('Uno', [
    { texto: 'Ve hacia él', punto: W },
    { punto: W },
    { misiones: [{ q: 9101, accion: 'aceptar' }], punto: W },
    { texto: 'Ve a la base', punto: P },
  ]));
  const notas = g.pasos.map((p) => p.elementos.find((e) => e.t === 'nota')?.texto ?? null);
  assert.deepEqual(notas[0], { es: 'Ve hacia él (de internet: www.wowhead.com)', en: 'Ve hacia él (from the web: www.wowhead.com)' });
  assert.deepEqual(notas[1], { es: '(de internet: www.wowhead.com)', en: '(from the web: www.wowhead.com)' });
  assert.deepEqual(notas[2], { es: '(de internet: www.wowhead.com)', en: '(from the web: www.wowhead.com)' });
  assert.deepEqual(notas[3], { es: 'Ve a la base', en: 'Ve a la base' }, 'un punto que no es de internet no se marca');
  for (const n of notas) assert.ok(!JSON.stringify(n).includes('npc=123') && !JSON.stringify(n).includes('classic'), 'ni ruta ni consulta');
  assert.deepEqual(g.pasos[1].elementos[0], { t: 'goto', mapa: 1413, x: 52.1, y: 43.6, modo: 'objetivo', radio: 10 });
  // Con un texto largo, la marca sigue entera dentro de los 300 bytes de una nota (y sin un `|` suelto).
  const [largo] = guias(de('Uno', [{ texto: 'ñ'.repeat(140), punto: W }, { texto: `${'a'.repeat(266)}||x`, punto: W }]));
  for (const [i, p] of largo.pasos.entries()) {
    const nota = p.elementos.find((e) => e.t === 'nota' || e.t === 'manual').texto;
    for (const t of [nota.es, nota.en]) {
      assert.ok(Buffer.byteLength(t, 'utf8') <= 300, `${i}: ${Buffer.byteLength(t, 'utf8')}`);
      assert.match(t, /\((de internet|from the web): www\.wowhead\.com\)$/);
      assert.ok(!/(^|[^|])\|(\|\|)* /.test(t), `sin un | suelto: ${t.slice(-50)}`);
    }
  }
});

test('guiasDeRuta (R19): «completar» sin objetivo deja fuera del paso el objeto sin sitio y lo pone en su paso', () => {
  const [g] = guias(de('Uno', [{ misiones: [{ q: 9110, accion: 'completar' }], punto: P }]));
  assert.deepEqual(g.pasos.map((p) => p.elementos), [
    [{ t: 'goto', mapa: 1413, x: 40, y: 41, modo: 'flecha' }, { t: 'complete', q: 9110, objetivo: 1 }, { t: 'complete', q: 9110, objetivo: 2, pnj: [9203] }],
    [{ t: 'complete', q: 9110, objetivo: 3 }, { t: 'nota', texto: { es: 'Consigue Poción rara (subasta)', en: 'Get Rare potion (auction house)' } }],
  ]);
  // Con la entrega más adelante en el tramo, el paso del objeto va justo antes de la entrega.
  const [h] = guias(de('Uno', [
    { misiones: [{ q: 9110, accion: 'completar' }], punto: P },
    { texto: 'Por el camino' },
    { misiones: [{ q: 9110, accion: 'entregar' }] },
  ]));
  assert.deepEqual(h.pasos.map((p) => p.elementos[0].t), ['goto', 'manual', 'complete', 'turnin']);
  // Con la entrega en el mismo paso, delante de él; repetir el «completar» no repite el paso del objeto.
  const [m] = guias(de('Uno', [
    { misiones: [{ q: 9110, accion: 'completar' }] },
    { misiones: [{ q: 9110, accion: 'completar' }, { q: 9110, accion: 'entregar' }], punto: P },
  ]));
  assert.deepEqual(m.pasos.map((p) => p.elementos.map((e) => e.t)), [
    ['complete', 'complete'], ['complete', 'nota'], ['goto', 'complete', 'complete', 'turnin'],
  ]);
  // Con un objetivo pedido (aunque sea el de la poción), se queda como lo puso la IA.
  const [k] = guias(de('Uno', [{ misiones: [{ q: 9110, accion: 'completar', objetivo: 3 }], punto: P }]));
  assert.equal(k.pasos.length, 1);
});

test('guiasDeRuta: un paso con más de 30 elementos se parte en pasos seguidos, cada uno con su goto', () => {
  const misiones = Array.from({ length: 10 }, () => ({ q: 9111, accion: 'completar' }));
  const [g] = guias(de('Uno', [{ misiones, punto: P, texto: 'Muchos' }]));
  assert.ok(g.pasos.length >= 2);
  for (const p of g.pasos) {
    assert.ok(p.elementos.length <= MAX_ELEMENTOS_PASO);
    assert.deepEqual(p.elementos[0], { t: 'goto', mapa: 1413, x: 40, y: 41, modo: 'flecha' });
  }
  assert.equal(g.pasos.flatMap((p) => p.elementos).filter((e) => e.t === 'complete').length, 40);
  assert.equal(g.pasos.flatMap((p) => p.elementos).filter((e) => e.t === 'nota').length, 1);
});

test('guiasDeRuta: 450 pasos son 2 tramos, «(Horda, 1 de 2)» y «(Horda, 2 de 2)»', () => {
  const pasos = Array.from({ length: 450 }, (_, i) => ({ texto: `Paso ${i + 1}` }));
  const r = guias(de('Larga', pasos));
  assert.deepEqual(r.map((g) => g.clave), ['IA\\Ruta de Larga (Horda, 1 de 2)', 'IA\\Ruta de Larga (Horda, 2 de 2)']);
  // Un paso pesa al menos ~107 bytes serializado: 400 no caben en 40 KB y el corte lo da el peso antes que el tope de
  // pasos (que sigue ahí). Cada tramo, dentro de los dos topes, y sin perder ni desordenar ningún paso.
  for (const g of r) assert.ok(g.pasos.length <= 400 && bytesLua(g) <= MAX_BYTES_GUIA);
  assert.equal(r[0].pasos.length + r[1].pasos.length, 450);
  assert.deepEqual(r[1].titulo, { es: 'Ruta de Larga (Horda, 2 de 2)', en: 'Ruta de Larga (Horda, 2 de 2)' });
  assert.equal(r[1].pasos[0].elementos[0].texto.es, `Paso ${r[0].pasos.length + 1}`);
  assert.deepEqual(r.map((g) => g.resumen.pasos), r.map((g) => g.pasos.length));
  assert.deepEqual(r[1].pasos.map((p) => p.n).slice(0, 2), [1, 2]);
});

test('guiasDeRuta: 70 misiones distintas se cortan en la 60', () => {
  const pasos = Array.from({ length: 70 }, (_, i) => ({ misiones: [{ q: 800001 + i, accion: 'aceptar' }] }));
  const r = guias(de('Muchas', pasos));
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((g) => misionesDe(g).size), [60, 10]);
  assert.equal(r[0].resumen.misiones, 60);
  assert.ok(misionesDe(r[1]).has(800061));
  // Repetir una misión ya contada no cuenta otra vez.
  const repetidas = guias(de('Repes', [...pasos.slice(0, 60), { misiones: [{ q: 800001, accion: 'entregar' }] }]));
  assert.equal(repetidas.length, 1);
});

test('guiasDeRuta: notas largas cortan por bytes y cada tramo pesa ≤ 40 KB con aLuaSeguro', () => {
  const pasos = Array.from({ length: 300 }, (_, i) => ({ texto: `${i} ${'ñ'.repeat(190)}`, punto: P }));
  const r = guias(de('Pesada', pasos));
  assert.ok(r.length >= 2, `${r.length} tramos`);
  for (const g of r) assert.ok(bytesLua(g) <= MAX_BYTES_GUIA, `${g.clave}: ${bytesLua(g)}`);
  assert.equal(r.reduce((s, g) => s + g.pasos.length, 0), 300, 'no se pierde ningún paso');
  // Lleno de verdad: el primer tramo no cabría con un paso más.
  assert.ok(bytesLua(r[0]) > MAX_BYTES_GUIA - 1500, "lleno: no cabría un paso más (las notas se cortan a 300 bytes)");
  // Un título todo comillas (aLuaSeguro las escapa con dos bytes) tampoco lo pasa.
  for (const g of guias(de('"'.repeat(60), pasos))) assert.ok(bytesLua(g) <= MAX_BYTES_GUIA, `${bytesLua(g)}`);
});


test('guiasDeRuta: un título «Mi\\guía|rara» no lleva «\\» ni «|» tras IA\\', () => {
  // Así llega de respuesta.mjs (escaparTitulo duplica la barra vertical).
  for (const titulo of ['Mi\\guía||rara', 'Mi\\guía|rara\tcon\u0001control']) {
    for (const g of [...guias(de(titulo, [{ texto: 'x' }])), ...guias([{ texto: 'x' }], { titulo })]) {
      const resto = g.clave.slice(3);
      assert.ok(g.clave.startsWith('IA\\'));
      assert.ok(!/[\\|\x00-\x1f\x7f]/.test(resto), g.clave);
      assert.match(resto, /^Ruta de Mi guía rara/);
    }
  }
});

test('guiasDeRuta: un título de 200 caracteres deja la clave en ≤ 160 bytes (y el título en ≤ 80)', () => {
  const largo = 'á'.repeat(200);
  for (const pasos of [[{ texto: 'x' }], Array.from({ length: 450 }, () => ({ texto: 'y' }))]) {
    for (const g of guias(de(largo, pasos))) {
      assert.ok(bytes(g.clave) <= 160, `${bytes(g.clave)}`);
      assert.ok(bytes(g.titulo.es) <= 80, `${bytes(g.titulo.es)}`);
      assert.match(g.clave, /\(Horda(, \d de 2)?\)$/, 'el sufijo no se corta');
      assert.ok(!g.clave.includes('�'));
    }
  }
});

test('guiasDeRuta: una sola guía si cabe; una lista de pasos suelta es un tramo con el título de la ruta', () => {
  const r = guias(de('Corta', [{ texto: 'a' }, { texto: 'b' }]));
  assert.equal(r.length, 1);
  assert.equal(r[0].clave, 'IA\\Ruta de Corta (Horda)');
  const suelta = guias([{ texto: 'a' }], { titulo: 'Suelta' });
  assert.deepEqual(suelta.map((g) => g.clave), ['IA\\Ruta de Suelta (Horda)']);
  const alianza = guias(de('Corta', [{ texto: 'a' }]), { pj: { faccion: 'Alliance' } });
  assert.equal(alianza[0].clave, 'IA\\Ruta de Corta (Alianza)');
  assert.equal(alianza[0].faccion, 'Alliance');
  // La salida de comprobarGuiaNueva entra tal cual.
  const comprobada = comprobarGuiaNueva({ titulo: 'R', tramos: [{ titulo: 'Durotar', pasos: [{ texto: 'x' }] }] }, opciones());
  assert.equal(guias(comprobada.tramos)[0].clave, 'IA\\Ruta de Durotar (Horda)');
});

test('guiasDeRuta (T3, B1): los tramos que no caben en una guía siguen en la siguiente; i de n cuenta todas las guías', () => {
  const r = guias([
    { titulo: 'Durotar', pasos: [{ texto: 'a' }] },
    { titulo: 'Los Baldíos', pasos: Array.from({ length: 450 }, () => ({ texto: 'b' })) },
    { titulo: 'Vallefresno', pasos: [{ texto: 'c' }] },
  ]);
  // Sin título de la ruta («Ruta»), una guía con varios tramos lleva el de su primer tramo.
  assert.deepEqual(r.map((g) => g.clave), ['IA\\Ruta de Durotar (Horda, 1 de 2)', 'IA\\Ruta de Los Baldíos (Horda, 2 de 2)']);
  assert.equal(r[0].pasos.length + r[1].pasos.length, 452, 'sin perder ningún paso');
  for (const g of r) assert.ok(g.pasos.length <= 400 && bytesLua(g) <= MAX_BYTES_GUIA);
  // El título de cada tramo va de nota en su primer paso.
  const notas = r.flatMap((g) => g.pasos).map((p) => p.elementos.filter((e) => e.t === 'nota').map((e) => e.texto.es));
  assert.deepEqual(notas[0], ['Durotar']);
  assert.deepEqual(notas[1], ['Los Baldíos']);
  assert.deepEqual(notas.at(-1), ['Vallefresno']);
  assert.equal(notas.filter((n) => n.length > 0).length, 3);
  assert.equal(r[1].pasos.at(-1).elementos.find((e) => e.t === 'manual').texto.es, 'c');
  assert.deepEqual(guias([]), []);
});

test('guiasDeRuta (T3, B1): los tramos que caben van juntos en UNA guía, con el título de la ruta y el de cada tramo de nota', () => {
  const tramos = [
    { titulo: 'Zona inventada A', pasos: Array.from({ length: 34 }, (_, i) => ({ misiones: [{ q: 810001 + i, accion: 'aceptar' }], punto: P })) },
    { titulo: 'Zona inventada B', pasos: Array.from({ length: 25 }, (_, i) => ({ texto: `Paso ${i + 1}`, misiones: [{ q: 820001 + i, accion: 'aceptar' }] })) },
  ];
  const r = guias(tramos, { titulo: 'Subida de prueba' });
  assert.equal(r.length, 1, 'sin «sigue»: cabe entera');
  assert.equal(r[0].clave, 'IA\\Ruta de Subida de prueba (Horda)');
  assert.equal(r[0].pasos.length, 59);
  assert.equal(r[0].resumen.misiones, 59);
  assert.deepEqual(r[0].pasos[0].elementos.at(-1), { t: 'nota', texto: { es: 'Zona inventada A', en: 'Zona inventada A' } });
  assert.deepEqual(r[0].pasos[34].elementos.filter((e) => e.t === 'nota').map((e) => e.texto.es), ['Zona inventada B', 'Paso 1']);
  // Con un solo tramo no hay nota de tramo.
  const [uno] = guias([tramos[0]], { titulo: 'Subida de prueba' });
  assert.equal(uno.clave, 'IA\\Ruta de Zona inventada A (Horda)');
  assert.ok(!uno.pasos[0].elementos.some((e) => e.t === 'nota'));
});

const REALES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'addons', 'SnetForever_Misiones');
const conReales = { skip: !existsSync(join(REALES, 'nucleo.lua')) && 'faltan los datos reales', timeout: 300000 };

test('guiasDeRuta (R19) datos reales: en «Elixir de agonía» (515) el ojo va en el paso del sitio y la poción en el suyo', conReales, () => {
  const real = cargarBase(REALES);
  const punto = { mapa: 1424, x: 20, y: 60, origen: { tipo: 'base' } };
  const [g] = guiasDeRuta(de('Laderas de Trabalomas', [{ misiones: [{ q: 515, accion: 'completar' }], punto }]),
    { titulo: 'Ruta', pj: { faccion: 'Horde', nivel: 30 }, idioma: 'es', base: real });
  const completes = (p) => p.elementos.filter((e) => e.t === 'complete').map((e) => e.objetivo);
  // 1 = Poción de sangre trol fuerte (sin fuente en la base), 3 = Ojo de aleta rasgado (3510).
  assert.equal(real.nombre('item', 3510, 'es'), 'Ojo de aleta rasgado');
  assert.deepEqual(completes(g.pasos[0]), [2, 3]);
  assert.deepEqual(completes(g.pasos[1]), [1]);
  assert.equal(g.pasos[1].elementos.find((e) => e.t === 'nota').texto.es, `Consigue ${real.nombre('item', 3388, 'es')} (subasta)`);
});

test('el inglés de la nota sale de la guía de la biblioteca si trae el paso en inglés; si no, igual que el español', () => {
  const guias = {
    conIngles: { n: 3, texto: 'Habla con X', textoEn: 'Talk to X', misiones: [], punto: { mapa: 1413, x: 20, y: 30 } },
    sinIngles: { n: 4, texto: 'Habla con Y', misiones: [], punto: { mapa: 1413, x: 21, y: 31 } },
  };
  const lector = (id, n) => (id === 'abcd1234' && n === 3 ? guias.conIngles : id === 'abcd1234' && n === 4 ? guias.sinIngles : null);
  const op = opciones({ puntoDeMarca: (marca) => puntoDeMarca(marca, { base, pj, mapaJugador: 1413, pasoDeGuia: lector }) });
  const r = comprobarGuiaNueva(tramo(
    { punto: 'G:abcd1234:3', texto: 'Habla con Moonhorn' },
    { punto: 'G:abcd1234:4', texto: 'Habla con Moonhorn' },
    { punto: 'B:q9101:r', texto: 'Habla con Moonhorn' },
    { punto: 'P1', texto: 'Habla con Moonhorn' },
    { punto: 'G:abcd1234:3' },
  ), op);
  const [g] = guiasDeRuta(r.tramos, { titulo: 'R', pj, base });
  // 16-nov: «Habla con…» sin misión detrás va con su flecha y una casilla (manual): el texto es el mismo.
  const notas = g.pasos.map((p) => p.elementos.find((e) => e.t === 'nota' || e.t === 'manual')?.texto ?? null);
  assert.deepEqual(notas[0], { es: 'Habla con Moonhorn', en: 'Talk to X' }, 'el es sigue siendo el de la IA');
  assert.deepEqual(notas[1], { es: 'Habla con Moonhorn', en: 'Habla con Moonhorn' }, 'guía sin inglés');
  assert.deepEqual(notas[2], { es: 'Habla con Moonhorn', en: 'Habla con Moonhorn' }, 'marca que no es de guía');
  assert.deepEqual(notas[3], { es: 'Habla con Moonhorn', en: 'Habla con Moonhorn' }, 'punto de la tabla del turno');
  assert.equal(notas[4], null, 'sin texto de la IA no se añade nota');
});

test('el textoEn de una guía largo y con «|» sale en ≤ 300 bytes, sin «|» impar al final y sin controles', () => {
  const largo = '||ab' + 'é|'.repeat(200);
  const lector = () => ({ n: 1, texto: 'Habla con X', textoEn: largo, misiones: [], punto: { mapa: 1413, x: 20, y: 30 } });
  const op = opciones({ puntoDeMarca: (marca) => puntoDeMarca(marca, { base, pj, mapaJugador: 1413, pasoDeGuia: lector }) });
  const r = comprobarGuiaNueva(tramo({ punto: 'G:abcd1234:1', texto: 'Habla con Moonhorn' }), op);
  const [g] = guiasDeRuta(r.tramos, { titulo: 'R', pj, base });
  const t = g.pasos[0].elementos.find((e) => e.t === 'nota' || e.t === 'manual').texto;
  assert.ok(Buffer.byteLength(t.en) <= 300);
  assert.ok(!/(^|[^|])(\|\|)*\|$/.test(t.en), 'sin «|» impar al final');
  assert.ok(!/[\x00-\x1f]/.test(t.en));
  assert.equal(t.es, 'Habla con Moonhorn');
});

test('guía partida: el inglés sigue al paso tras unir las partes (índice y lector)', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const fsReal = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { crearIndice, CARPETA_GUIAS } = await import('../src/biblioteca/indice.mjs');
  const { crearLectorGuias } = await import('../src/herramientas/fuentes.mjs');
  const datos = mkdtempSync(join(tmpdir(), 'snf-parte-'));
  mkdirSync(join(datos, CARPETA_GUIAS), { recursive: true });
  const clave = 'Pruebas-parte';
  const paso = (n, es, en) => `{id="p${n}",n=${n},elementos={{t="goto",mapa=1413,x=${20 + n},y=30},{t="nota",texto={es="${es}",en="${en}"}}}}`;
  writeFileSync(join(datos, CARPETA_GUIAS, 'a.lua'), `local T = SNF_RUTAS.guias\nT["${clave}"]={clave="${clave}",nombre="parte",titulo={es="Parte",en="Part"},niveles={1,5},pasos={${paso(1, 'Habla con X', 'Talk to X')}}}\n`);
  writeFileSync(join(datos, CARPETA_GUIAS, 'b.lua'), `local T = SNF_RUTAS.guias["${clave}"].pasos\nT[2]=${paso(2, 'Habla con Y', 'Talk to Y')}\nT[3]=${paso(3, 'Habla con Z', 'Talk to Z')}\n`);
  const ind = crearIndice({ datos, fs: fsReal, base: async () => base });
  await ind.actualizar();
  const lector = crearLectorGuias({ datos, fs: fsReal, base: () => base, idioma: () => 'es' });
  assert.ok(ind.indice().guias.some((g) => g.parte === true), 'una de las dos es parte');
  const id = lector.grupos().flatMap((g) => g.guias ?? [g]).map((g) => g.id).find((x) => lector.guia(x)?.pasos.length === 3);
  assert.ok(id, 'la guía unida tiene los 3 pasos');
  assert.deepEqual(lector.guia(id).pasos.map((p) => p.textoEn), ['Talk to X', 'Talk to Y', 'Talk to Z']);
  assert.deepEqual(lector.guia(id).pasos.map((p) => p.n), [1, 2, 3]);
  const op = opciones({ puntoDeMarca: (marca) => puntoDeMarca(marca, { base, pj, mapaJugador: 1413, pasoDeGuia: lector.pasoDeGuia }) });
  const r = comprobarGuiaNueva(tramo({ punto: `G:${id}:3`, texto: 'Habla con Moonhorn' }), op);
  const [g] = guiasDeRuta(r.tramos, { titulo: 'R', pj, base });
  assert.equal(g.pasos[0].elementos.find((e) => e.t === 'nota' || e.t === 'manual').texto.en, 'Talk to Z');
});

// ------------------------------------------------------------------------------------------------------------------
// 16-nov (en el juego, una ruta de la IA de Las Mil Agujas): los pasos sin misión ya no se dan por hechos al llegar, las
// previas que faltan entran delante y las que no se pueden hacer se quitan con su línea.
// ------------------------------------------------------------------------------------------------------------------

const PA = { mapa: 1413, x: 10, y: 11, origen: { tipo: 'turno' } };
const PB = { mapa: 1413, x: 40, y: 41, origen: { tipo: 'turno' } };

test('16-nov: un paso sin misión de acción («Abre…») se une al siguiente con misión: su sitio va de punto de paso y su texto, de primera nota', () => {
  const [g] = guias(de('Uno', [
    { texto: 'Abre la Comida de Arpía del suelo para invocar a Grenka', punto: PA },
    { texto: 'Mata a Grenka', misiones: [{ q: 9101, accion: 'completar', objetivo: 1 }], punto: PB },
  ]));
  assert.equal(g.pasos.length, 1, 'no hay un paso que se cierre solo por llegar');
  assert.deepEqual(g.pasos[0].elementos, [
    { t: 'goto', mapa: 1413, x: 10, y: 11, modo: 'flecha', radio: 10 },
    { t: 'goto', mapa: 1413, x: 40, y: 41, modo: 'flecha' },
    { t: 'complete', q: 9101, objetivo: 1 },
    { t: 'nota', texto: { es: 'Abre la Comida de Arpía del suelo para invocar a Grenka', en: 'Abre la Comida de Arpía del suelo para invocar a Grenka' } },
    { t: 'nota', texto: { es: 'Mata a Grenka', en: 'Mata a Grenka' } },
  ]);
  assert.ok(!g.pasos.flatMap((p) => p.elementos).some((e) => e.modo === 'objetivo'));
});

test('16-nov: «Usa…», «Mata… y saquea…» y «Habla con…» sin misión también se unen; varios seguidos van todos al mismo paso', () => {
  const [g] = guias(de('Uno', [
    { texto: 'Usa la Unidad de Control Robotron', punto: PA },
    { texto: 'Mata Pedruscos tronantes y saquea su Tierra purificadora', punto: { ...PA, x: 12 } },
    { texto: 'Habla con Nyse', punto: { ...PA, x: 14 } },
    { misiones: [{ q: 9101, accion: 'entregar' }], punto: PB },
  ]));
  assert.equal(g.pasos.length, 1);
  const el = g.pasos[0].elementos;
  assert.deepEqual(el.filter((e) => e.t === 'goto').map((e) => [e.x, e.radio]), [[10, 10], [12, 10], [14, 10], [40, undefined]]);
  assert.deepEqual(el.filter((e) => e.t === 'nota').map((e) => e.texto.es),
    ['Usa la Unidad de Control Robotron', 'Mata Pedruscos tronantes y saquea su Tierra purificadora', 'Habla con Nyse']);
});

test('16-nov: un «Ve hacia…» de viaje (sin nada que hacer allí) sigue siendo un «ir» que se da por hecho al llegar', () => {
  for (const texto of ['Ve hacia Dorn', 'Entra en la cueva y ve hacia el Brasero Antiguo', 'Sube por el ascensor', 'Head to the camp', undefined]) {
    const [g] = guias(de('Uno', [
      { ...(texto ? { texto } : {}), punto: PA },
      { misiones: [{ q: 9101, accion: 'aceptar' }], punto: PB },
    ]));
    assert.equal(g.pasos.length, 2, String(texto));
    assert.deepEqual(g.pasos[0].elementos[0], { t: 'goto', mapa: 1413, x: 10, y: 11, modo: 'objetivo', radio: 10 }, String(texto));
  }
  // Con una acción dentro ya no es solo viajar.
  const [h] = guias(de('Uno', [{ texto: 'Ve a la cueva y abre el cofre', punto: PA }, { misiones: [{ q: 9101, accion: 'aceptar' }], punto: PB }]));
  assert.equal(h.pasos.length, 1);
});

test('16-nov: un paso de acción sin misión detrás va con su flecha y una casilla (manual), nunca como «ir» de llegada', () => {
  const [g] = guias(de('Uno', [
    { misiones: [{ q: 9101, accion: 'aceptar' }], punto: PB },
    { texto: 'Abre el cofre', punto: PA },
  ]));
  assert.deepEqual(g.pasos[1].elementos, [
    { t: 'goto', mapa: 1413, x: 10, y: 11, modo: 'flecha' },
    { t: 'manual', texto: { es: 'Abre el cofre', en: 'Abre el cofre' } },
  ]);
});

test('16-nov: el «completar» de un objeto que suelta un PNJ lleva quién lo suelta (pnj, de npcDrops de la base)', () => {
  const [g] = guias(de('Uno', [{ misiones: [{ q: 9110, accion: 'completar', objetivo: 2 }], punto: P }]));
  assert.deepEqual(g.pasos[0].elementos[1], { t: 'complete', q: 9110, objetivo: 2, pnj: [9203] });
  // El objetivo de PNJ no lo lleva (el addon ya lo saca de la base), ni el objeto que no suelta nadie.
  const [h] = guias(de('Uno', [{ misiones: [{ q: 9110, accion: 'completar', objetivo: 1 }, { q: 9110, accion: 'completar', objetivo: 3 }], punto: P }]));
  assert.deepEqual(h.pasos[0].elementos.slice(1), [{ t: 'complete', q: 9110, objetivo: 1 }, { t: 'complete', q: 9110, objetivo: 3 }]);
});

// Una base con cadenas: 9401 → 9402 → 9403 (de la Horda, en Los Baldíos); 9410 es de la Alianza (la necesita 9411);
// 9420 es de los Reinos del Este (la necesita 9421); 9431 necesita una que no está en la base; 9441 necesita la 9401 y la
// 9410 (preQuestGroup); 9451 necesita la 9411.
function basePrevias() {
  const raiz = {};
  const cabecera = 'SNF_MISIONES = {version="t",esquema=1,quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}},'
    + 'zonas={area={},nombre={[1413]={en="The Barrens",es="Los Baldíos"}}},mazmorra={},porFaccion={}}\n'
    + 'local Q = SNF_MISIONES.quest\nlocal N = SNF_MISIONES.npc\n';
  const q = (id, pnj, previas = '') => `Q[${id}] = {name="Previa ${id}",startedBy={{${pnj}}},finishedBy={{${pnj}}},requiredLevel=1,questLevel=5,`
    + `requiredRaces=0,requiredClasses=0,objectivesText={},zoneOrSort=17,${previas}objectives={}}\n`;
  const cuerpo = q(9401, 9301) + q(9402, 9301, 'preQuestSingle={9401},') + q(9403, 9301, 'preQuestSingle={9402},')
    + q(9410, 9302) + q(9411, 9301, 'preQuestSingle={9410},') + q(9420, 9303) + q(9421, 9301, 'preQuestSingle={9420},')
    + q(9431, 9301, 'preQuestSingle={999998},') + q(9441, 9301, 'preQuestGroup={9401,9410},') + q(9451, 9301, 'preQuestSingle={9411},')
    + 'N[9301] = {name="Horda",friendlyToFaction="H",spawns={[1413]={{20,20}}}}\n'
    + 'N[9302] = {name="Alianza",friendlyToFaction="A",spawns={[1413]={{30,30}}}}\n'
    + 'N[9303] = {name="Lejos",friendlyToFaction="AH",spawns={[1431]={{50,50}}}}\n';
  ejecutarDatos(cabecera + cuerpo, raiz, 'previas.lua');
  return crearBase(raiz.SNF_MISIONES);
}
const BP = basePrevias();
// El jugador está en Los Baldíos (Kalimdor): con él se mira el continente de los pasos sin sitio.
const opcionesPrevias = (extra = {}) => ({ base: BP, pj: PJ_RUTA, mapaJugador: 1413, ...extra });
const accionesDe = (g) => g.pasos.flatMap((p) => p.elementos.filter((e) => e.q !== undefined).map((e) => `${e.t} ${e.q}`));

test('16-nov: una previa que falta y se puede coger entra delante, en su orden, con toda la cadena (cadena de 2)', () => {
  const r = comprobarGuiaNueva(tramo(
    { texto: 'Coge la 9403', misiones: [{ q: 9403, accion: 'aceptar' }], punto: PA },
    { misiones: [{ q: 9403, accion: 'entregar' }] },
  ), opcionesPrevias());
  assert.deepEqual(r.sinPrevia, []);
  assert.equal(r.previas, 2);
  const [g] = guiasDeRuta(r.tramos, { titulo: 'R', pj: PJ_RUTA, base: BP });
  assert.deepEqual(accionesDe(g), ['accept 9401', 'turnin 9401', 'accept 9402', 'turnin 9402', 'accept 9403', 'turnin 9403']);
  // Con los sitios de la base (quien la da y quien la recoge).
  assert.deepEqual(g.pasos[0].elementos[0], { t: 'goto', mapa: 1413, x: 20, y: 20, modo: 'flecha' });
});

test('16-nov: no entra nada si la previa está en el registro o si la ruta ya la acepta antes', () => {
  const ruta = (...antes) => tramo(...antes, { misiones: [{ q: 9402, accion: 'aceptar' }], punto: PA });
  const enRegistro = comprobarGuiaNueva(ruta(), opcionesPrevias({ registro: [9401] }));
  assert.equal(enRegistro.previas, 0);
  assert.equal(pasosDe(enRegistro).length, 1);
  const antes = comprobarGuiaNueva(ruta({ misiones: [{ q: 9401, accion: 'aceptar' }], punto: PB }), opcionesPrevias());
  assert.equal(antes.previas, 0);
  assert.equal(pasosDe(antes).length, 2);
  // La misión que ya está en el registro no necesita previas.
  const ella = comprobarGuiaNueva(ruta(), opcionesPrevias({ registro: [9402] }));
  assert.equal(ella.previas, 0);
});

test('16-nov: con una previa que no se puede hacer se quita la que depende de ella (y la que depende de esa), con su motivo', () => {
  const r = comprobarGuiaNueva(tramo(
    { texto: 'Coge la 9411', misiones: [{ q: 9411, accion: 'aceptar' }], punto: PA },
    { misiones: [{ q: 9411, accion: 'entregar' }, { q: 9401, accion: 'aceptar' }] },
    { misiones: [{ q: 9421, accion: 'aceptar' }] },
    { misiones: [{ q: 9431, accion: 'aceptar' }] },
    { misiones: [{ q: 9441, accion: 'aceptar' }] },
    { misiones: [{ q: 9451, accion: 'aceptar' }] },
  ), opcionesPrevias());
  assert.deepEqual(r.sinPrevia, [
    { q: 9411, previa: 9410, motivo: 'personaje' },
    { q: 9421, previa: 9420, motivo: 'continente' },
    { q: 9431, previa: 999998, motivo: 'base' },
    { q: 9441, previa: 9410, motivo: 'personaje' },
    { q: 9451, previa: 9411, motivo: 'cadena' },
  ]);
  // Solo queda el paso que tenía otra misión, sin la quitada.
  assert.deepEqual(pasosDe(r).map((p) => p.misiones), [[{ q: 9401, accion: 'aceptar' }]]);
  assert.equal(r.previas, 0);
});

test('16-nov: lo quitado por previas sale en UNA línea al final (es y en), con los nombres de la base', () => {
  const una = textoGuiaNueva('previas', { sinPrevia: [{ mision: 'Previa 9411', previa: 'Previa 9410', motivo: 'personaje' }] }, 'es');
  assert.equal(una, 'Quité «Previa 9411» porque necesita «Previa 9410», que no es para tu facción, raza o clase.');
  const varias = textoGuiaNueva('previas', { previas: 2, sinPrevia: [
    { mision: 'Previa 9421', previa: 'Previa 9420', motivo: 'continente' },
    { mision: 'Previa 9431', previa: '#999998', motivo: 'base' },
  ] }, 'es');
  assert.ok(!varias.includes('\n'), 'una sola línea');
  assert.equal(varias, 'Añadí delante 2 misiones previas que faltaban. Quité «Previa 9421» porque necesita «Previa 9420», que es de '
    + 'otro continente, y «Previa 9431» porque necesita «#999998», que no está en la base.');
  assert.match(textoGuiaNueva('previas', { sinPrevia: [{ mision: 'A', previa: 'B', motivo: 'cadena' }] }, 'en'), /^Removed "A" because it needs "B", /);
  assert.equal(textoGuiaNueva('previas', {}, 'es'), '');
});

// ------------------------------------------------------------------------------------------------------------------
// 17-nov (T2-app, A1: en el juego la ruta mandaba a entregar misiones sin pasos para hacerlas): toda ruta o guía de la IA
// lleva delante de cada entrega los objetivos de la base que faltan. Misiones y datos inventados.
// ------------------------------------------------------------------------------------------------------------------

// 9501: matar a un bicho con sitio; 9502: un objeto de misión sin sitio en la base (con su texto en es y en); 9503: sin
// objetivos; 9504: texto larguísimo con «|»; 9601…9670: setenta misiones de matar, para los topes.
function baseObjetivos() {
  const raiz = {};
  const largo = `${'ñ'.repeat(170)}|${'a'.repeat(40)}`;
  const cabecera = 'SNF_MISIONES = {version="t",esquema=1,quest={},npc={},object={},item={},es={quest={'
    + '[9502]={name="Tónicos",objectivesText={"Recoge una caja de tónicos inventados en el laboratorio."}},'
    + `[9504]={name="Larga",objectivesText={"${largo}","y más texto"}}`
    + '},npc={},object={},item={}},'
    + 'zonas={area={},nombre={[1413]={en="The Barrens",es="Los Baldíos"}}},mazmorra={},porFaccion={}}\n'
    + 'local Q = SNF_MISIONES.quest\nlocal N = SNF_MISIONES.npc\nlocal I = SNF_MISIONES.item\n';
  const quest = (q, objetivos, texto = '') => `Q[${q}] = {name="Objetivo ${q}",startedBy={{9801}},finishedBy={{9802}},requiredLevel=5,questLevel=5,`
    + `requiredRaces=0,requiredClasses=0,objectivesText={${texto}},zoneOrSort=17,objectives=${objetivos}}\n`;
  let cuerpo = quest(9501, '{[1]={{9803}}}', '"Kill a made-up beast."')
    + quest(9502, '{[3]={{9902}}}', '"Collect a box of made-up tonics."')
    + quest(9503, '{}') + quest(9504, '{[3]={{9902}}}', '"Long english text"');
  for (let i = 0; i < 70; i++) cuerpo += quest(9601 + i, '{[1]={{9803}}}');
  cuerpo += 'N[9801] = {name="Da",spawns={[1413]={{50,50}}}}\nN[9802] = {name="Recibe",spawns={[1413]={{60,60}}}}\n'
    + 'N[9803] = {name="Bestia",spawns={[1413]={{30,30}}}}\n'
    + 'I[9902] = {name="Made-up tonics",class=12}\n';
  ejecutarDatos(cabecera + cuerpo, raiz, 'objetivos.lua');
  return crearBase(raiz.SNF_MISIONES);
}
const BO = baseObjetivos();
const opcionesObj = (extra = {}) => ({ base: BO, pj: PJ_RUTA, mapaJugador: 1413, puntos: new Map([['P1', { mapa: 1413, x: 50, y: 50 }], ['P2', { mapa: 1413, x: 60, y: 60 }]]), ...extra });
const recogerYEntregar = (...qs) => tramo(
  ...qs.map((q) => ({ misiones: [{ q, accion: 'aceptar' }], punto: 'P1' })),
  ...qs.map((q) => ({ misiones: [{ q, accion: 'entregar' }], punto: 'P2' })),
);
const guiaObj = (r) => guiasDeRuta(r.tramos, { titulo: 'R', pj: PJ_RUTA, base: BO });

test('T2 (A1): una misión que se recoge y se entrega sin completar lleva delante de la entrega su objetivo de la base, con su sitio', () => {
  const r = comprobarGuiaNueva(recogerYEntregar(9501), opcionesObj());
  assert.equal(r.objetivos, 1);
  const [g] = guiaObj(r);
  assert.deepEqual(g.pasos.map((p) => p.elementos), [
    [{ t: 'goto', mapa: 1413, x: 50, y: 50, modo: 'flecha' }, { t: 'accept', q: 9501 }],
    [{ t: 'goto', mapa: 1413, x: 30, y: 30, modo: 'flecha', objetivo: 1 }, { t: 'complete', q: 9501, objetivo: 1 }],
    [{ t: 'goto', mapa: 1413, x: 60, y: 60, modo: 'flecha' }, { t: 'turnin', q: 9501 }],
  ]);
});

test('T2 (A1): un objetivo sin sitio va sin goto (nunca inventado) y con el texto de la base de nota, en es y en', () => {
  const r = comprobarGuiaNueva(recogerYEntregar(9502), opcionesObj());
  const [g] = guiaObj(r);
  assert.deepEqual(g.pasos[1].elementos, [
    { t: 'complete', q: 9502, objetivo: 1 },
    // Ronda 1 (M2): el texto de la base va detrás de la nota «Consigue …» (no la sustituye).
    { t: 'nota', texto: { es: 'Consigue Made-up tonics. Recoge una caja de tónicos inventados en el laboratorio.', en: 'Get Made-up tonics. Collect a box of made-up tonics.' } },
  ]);
  assert.ok(!g.pasos.flatMap((p) => p.elementos).some((e) => e.t === 'goto' && e.x !== 50 && e.x !== 60), 'ningún sitio inventado');
});

test('T2 (A1): la nota de la base cabe en 300 bytes y no acaba en un «|» impar', () => {
  const [g] = guiaObj(comprobarGuiaNueva(recogerYEntregar(9504), opcionesObj()));
  const nota = g.pasos[1].elementos.find((e) => e.t === 'nota').texto;
  for (const t of [nota.es, nota.en]) {
    assert.ok(bytes(t) <= 300, `${bytes(t)}`);
    assert.ok(!/(^|[^|])(\|\|)*\|$/.test(t), 'sin «|» impar al final');
    assert.ok(!/[\x00-\x1f]/.test(t));
  }
  assert.ok(nota.es.startsWith('Consigue Made-up tonics. ñ'), 'el texto de la base en español, detrás de «Consigue»');
  assert.equal(nota.en, 'Get Made-up tonics. Long english text');
});

test('T2 (A1): no se mete nada si ya está lista para entregar, si la ruta ya la completa, sin objetivos o si no está en la base', () => {
  const lista = comprobarGuiaNueva(recogerYEntregar(9501), opcionesObj({ listas: new Set([9501]) }));
  assert.equal(lista.objetivos, 0);
  assert.equal(pasosDe(lista).length, 2);
  const conCompletar = comprobarGuiaNueva(tramo(
    { misiones: [{ q: 9501, accion: 'aceptar' }], punto: 'P1' },
    { misiones: [{ q: 9501, accion: 'completar', objetivo: 1 }] },
    { misiones: [{ q: 9501, accion: 'entregar' }], punto: 'P2' },
  ), opcionesObj());
  assert.equal(conCompletar.objetivos, 0);
  assert.equal(pasosDe(conCompletar).length, 3);
  // El completar en el mismo paso que la entrega también cuenta.
  const juntos = comprobarGuiaNueva(tramo({ misiones: [{ q: 9501, accion: 'completar' }, { q: 9501, accion: 'entregar' }], punto: 'P2' }), opcionesObj());
  assert.equal(juntos.objetivos, 0);
  assert.equal(comprobarGuiaNueva(recogerYEntregar(9503), opcionesObj()).objetivos, 0, 'sin objetivos en la base');
  const hechas = comprobarGuiaNueva(recogerYEntregar(9501), opcionesObj({ hechas: [9501] }));
  assert.equal(hechas.objetivos, 0, 'hecha en la guía de la biblioteca antes de desde');
  // Una de la biblioteca (no está en la base): tal cual.
  const bib = comprobarGuiaNueva(recogerYEntregar(777001), opcionesObj({ misionesBiblioteca: new Set([777001]) }));
  assert.equal(bib.objetivos, 0);
});

test('T2 (A1): el objetivo va delante de la entrega en otro tramo y delante de los pasos sin misión que la preceden', () => {
  const r = comprobarGuiaNueva({ titulo: 'R', tramos: [
    { titulo: 'A', pasos: [{ misiones: [{ q: 9501, accion: 'aceptar' }], punto: 'P1' }] },
    { titulo: 'B', pasos: [{ texto: 'Ve al campamento', punto: 'P2' }, { misiones: [{ q: 9501, accion: 'entregar' }], punto: 'P2' }] },
  ] }, opcionesObj());
  assert.equal(r.tramos[0].pasos.length, 1);
  assert.deepEqual(r.tramos[1].pasos.map((p) => (p.elementos ? 'objetivo' : p.texto ?? p.misiones[0].accion)), ['objetivo', 'Ve al campamento', 'entregar']);
});

test('T2 (A1): con 70 misiones completadas, cada guía respeta los topes (30 elementos, 400 pasos, 60 misiones, 40 KB, notas de 300 bytes)', () => {
  const qs = Array.from({ length: 70 }, (_, i) => 9601 + i);
  const r = comprobarGuiaNueva(recogerYEntregar(...qs, 9504), opcionesObj());
  assert.equal(r.objetivos, 71);
  const gs = guiaObj(r);
  assert.ok(gs.length >= 2);
  for (const g of gs) {
    assert.ok(g.pasos.length <= 400 && misionesDe(g).size <= 60 && bytesLua(g) <= MAX_BYTES_GUIA, g.clave);
    for (const p of g.pasos) {
      assert.ok(p.elementos.length <= MAX_ELEMENTOS_PASO);
      for (const e of p.elementos) if (e.t === 'nota') assert.ok(bytes(e.texto.es) <= 300 && bytes(e.texto.en) <= 300);
    }
  }
  assert.equal(gs.flatMap((g) => g.pasos).filter((p) => p.elementos.some((e) => e.t === 'complete')).length, 71);
});

// Ronda 1 (M5): los tramos de una guía de la biblioteca llevan todos el mismo título: entonces no hay nota de tramo.
test('ronda 1 (M5): sin nota de tramo si todos los tramos se llaman igual', () => {
  const r = guias([{ titulo: 'Misma guía', pasos: [{ texto: 'Ve hacia a', punto: P }] }, { titulo: 'Misma guía', pasos: [{ texto: 'Ve hacia b', punto: P }] }]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].pasos.map((p) => p.elementos.filter((e) => e.t === 'nota').map((e) => e.texto.es)), [['Ve hacia a'], ['Ve hacia b']]);
});

// Ronda 1 (M1): un paso sin misión cuyo punto es un P# de objetivo de esa misión cuenta como su «completar».
test('ronda 1 (M1): un paso con un P# de objetivo (sin misión) no hace repetir el objetivo antes de la entrega', () => {
  const puntos = new Map([['P1', { mapa: 1413, x: 50, y: 50 }], ['P2', { mapa: 1413, x: 60, y: 60 }],
    ['P3', { mapa: 1413, x: 30, y: 30, papel: 'objetivo', q: 9501 }]]);
  const r = comprobarGuiaNueva(tramo(
    { misiones: [{ q: 9501, accion: 'aceptar' }], punto: 'P1' },
    { texto: 'Mata 10 bestias aquí', punto: 'P3' },
    { misiones: [{ q: 9501, accion: 'entregar' }], punto: 'P2' },
  ), opcionesObj({ puntos }));
  assert.equal(r.objetivos, 0);
  assert.equal(pasosDe(r).length, 3);
  // Un P# de objetivo de otra misión no cuenta.
  const otra = comprobarGuiaNueva(tramo(
    { misiones: [{ q: 9501, accion: 'aceptar' }], punto: 'P1' },
    { texto: 'Mata algo', punto: 'P3' },
    { misiones: [{ q: 9501, accion: 'entregar' }], punto: 'P2' },
  ), opcionesObj({ puntos: new Map([...puntos, ['P3', { mapa: 1413, x: 30, y: 30, papel: 'objetivo', q: 9601 }]]) }));
  assert.equal(otra.objetivos, 1);
});
