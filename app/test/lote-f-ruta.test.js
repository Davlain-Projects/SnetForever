// Lote F (10-nov, lo que vio el jugador con la 0.4.6): las paradas de una ruta de la IA nombran la misión como el registro del
// jugador (si no, el «es» de la base y, si no, el «en»), y cada parada lleva lo que el addon necesita para hacer con
// ella un paso de guía: el índice del objetivo en el registro del juego (`objetivo`) y los PNJ del sitio (`npcs`).
// contexto.mjs (puntosDeMision con el nombre del turno) y respuesta.mjs (la propuesta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase } from '../src/base/base.mjs';
import { prepararTurno } from '../src/contexto.mjs';
import { procesarRespuesta } from '../src/respuesta.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const carpeta = mkdtempSync(join(tmpdir(), 'snf-lote-f-'));
copyFileSync(join(FIXTURES, 'misiones-app.lua'), join(carpeta, 'misiones-app.lua'));
// 95981 «Watching the Roads», propia de Forever y sin «es» en la base (en el juego del jugador, «Caminos vigilados»): la da y
// la recoge el Sacerdote de las Sombras Allister (2121) y pide matar Vigilantes (1888) y Zahoríes Dalaran (1889).
writeFileSync(join(carpeta, 'extra.lua'), [
  'local Q = SNF_MISIONES.quest',
  'local N = SNF_MISIONES.npc',
  'local ES = SNF_MISIONES.es.npc',
  'Q[95981]={name="Watching the Roads",startedBy={{2121}},finishedBy={{2121}},requiredLevel=10,questLevel=20,requiredRaces=0,',
  '  objectivesText={"Slay 8 Dalaran Wizards and 8 Dalaran Watchers."},objectives={{{[1]=1888,[3]=0},{[1]=1889,[3]=0}}},zoneOrSort=130,uiMap=1421}',
  // Ronda 1 (M4): 95982 pide matar Vigilantes, una reputación y un crédito de muerte (estos dos nunca tienen sitio).
  'Q[95982]={name="Made-up Watch",startedBy={{2121}},finishedBy={{2121}},requiredLevel=10,questLevel=20,requiredRaces=0,',
  '  objectivesText={"Made-up objectives."},objectives={[1]={{1888}},[4]={72,3000},[5]={{{1889},1889,"Credit"}}},zoneOrSort=130,uiMap=1421}',
  'N[2121]={name="Shadow Priest Allister",spawns={[1421]={{44,40}}}}',
  'N[1888]={name="Dalaran Watcher",spawns={[1421]={{60,70},{61,71}}}}',
  'N[1889]={name="Dalaran Wizard",spawns={[1421]={{30,20}}}}',
  'ES[2121]={name="Sacerdote de las Sombras Allister"}',
  'ES[1888]={name="Vigilante Dalaran"}',
  'ES[1889]={name="Zahorí Dalaran"}',
  '',
].join('\n'));
writeFileSync(join(carpeta, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', 'extra.lua', ''].join('\n'));
const base = cargarBase(carpeta);

function mensaje(registro) {
  return {
    v: 1, id: 'f1', pj: 'Tal Cual-Reino Prueba', idioma: 'es', modelo: 'haiku', texto: '¿Qué hago ahora?',
    ctx: {
      pj: { nivel: 22, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde' },
      lugar: { mapa: 1421, zona: 'Bosque de Argénteos', instancia: false },
      registro,
    },
  };
}

// La IA propone una ruta con todos los puntos de 95981 (los de la tabla, en orden).
function ruta(turno) {
  const ids = turno.datos.puntos.filter((p) => p.q === 95981).map((p) => p.id);
  const bloque = JSON.stringify({ ruta: { titulo: 'Ruta de Bosque de Argénteos', puntos: ids } });
  return procesarRespuesta(`Aquí tienes.\n\`\`\`snet\n${bloque}\n\`\`\``, turno, 'es').propuesta;
}

test('lote F: con 95981 en el registro como «Caminos vigilados», las paradas dicen «Caminos vigilados»', () => {
  const t = prepararTurno(base, mensaje([{ q: 95981, c: 0, o: [[0, 8], [0, 8]], t: 'Caminos vigilados' }]));
  const propuesta = ruta(t);
  assert.ok(propuesta, 'hay propuesta');
  const etiquetas = propuesta.puntos.map((p) => p.etiqueta);
  assert.deepEqual(etiquetas, [
    'Recoger «Caminos vigilados» (Sacerdote de las Sombras Allister)',
    'Caminos vigilados: Vigilante Dalaran',
    'Caminos vigilados: Zahorí Dalaran',
    'Entregar «Caminos vigilados» (Sacerdote de las Sombras Allister)',
  ]);
  assert.ok(!JSON.stringify(t.datos.puntos).includes('Watching the Roads'), 'la tabla de puntos tampoco lo lleva en inglés');
});

test('lote F: sin la misión en el registro, el nombre de la base como hasta ahora', () => {
  const t = prepararTurno(base, { ...mensaje([]), refs: { q: [95981] } });
  const etiquetas = ruta(t).puntos.map((p) => p.etiqueta);
  assert.equal(etiquetas[0], 'Recoger «Watching the Roads» (Sacerdote de las Sombras Allister)');
  assert.equal(etiquetas[1], 'Watching the Roads: Vigilante Dalaran');
});

test('lote F: cada parada lleva el índice de su objetivo en el registro y los PNJ del sitio, y la IA no los ve', () => {
  const t = prepararTurno(base, mensaje([{ q: 95981, c: 0, o: [[0, 8], [0, 8]], t: 'Caminos vigilados' }]));
  const puntos = ruta(t).puntos;
  assert.deepEqual(puntos.map((p) => [p.tipo, p.objetivo, p.npcs]), [
    ['recoger', undefined, [2121]],
    ['objetivo', 1, [1888]],
    ['objetivo', 2, [1889]],
    ['entregar', undefined, [2121]],
  ]);
  // Lo que ve la IA no cambia: ni índices ni ids de PNJ en la tabla de puntos.
  for (const p of t.datos.puntos) {
    assert.equal(p.objetivo, undefined);
    assert.equal(p.npcs, undefined);
  }
});

// T2 (A2, 17-nov: la flecha mandaba a entregar una misión sin hacer): una ruta con recoger y entregar y sin parada de
// objetivo lleva delante de la entrega los objetivos con sitio de la base; con la misión lista para entregar, no.
function rutaSoloRecogerYEntregar(turno) {
  const ids = turno.datos.puntos.filter((p) => p.q === 95981 && p.papel !== 'objetivo').map((p) => p.id);
  const bloque = JSON.stringify({ ruta: { titulo: 'Ruta', puntos: ids } });
  return procesarRespuesta(`Te marco «Caminos vigilados».\n\`\`\`snet\n${bloque}\n\`\`\``, turno, 'es');
}

test('T2 (A2): la ruta sin parada de objetivo lleva los objetivos de la base antes de la entrega', () => {
  const t = prepararTurno(base, mensaje([{ q: 95981, c: 0, o: [[0, 8], [0, 8]], t: 'Caminos vigilados' }]));
  const r = rutaSoloRecogerYEntregar(t);
  assert.deepEqual(r.propuesta.puntos.map((p) => [p.tipo, p.objetivo, p.seguir]), [
    ['recoger', undefined, true], ['objetivo', 1, true], ['objetivo', 2, true], ['entregar', undefined, true],
  ]);
  assert.equal(r.propuesta.puntos[1].etiqueta, 'Caminos vigilados: Vigilante Dalaran');
  assert.deepEqual(r.propuesta.puntos[1].npcs, [1888]);
  assert.ok(r.propuesta.puntos.every((p) => typeof p.mapa === 'number' && typeof p.x === 'number'));
  // Lista para entregar: tal cual.
  const lista = rutaSoloRecogerYEntregar(prepararTurno(base, mensaje([{ q: 95981, c: 1, o: [[8, 8], [8, 8]], t: 'Caminos vigilados' }])));
  assert.deepEqual(lista.propuesta.puntos.map((p) => p.tipo).sort(), ['entregar', 'recoger']);
});

test('ronda 1 (M4): la reputación y el crédito de muerte no cuentan como objetivos sin sitio (sin línea en el texto)', () => {
  const t = prepararTurno(base, mensaje([{ q: 95982, c: 0, o: [[0, 8], [0, 1], [0, 1]] }]));
  assert.equal(t.objetivosDe(95982).faltan, 0);
  assert.equal(t.objetivosDe(95982).puntos.length, 1);
  const ids = t.datos.puntos.filter((p) => p.q === 95982 && p.papel !== 'objetivo').map((p) => p.id);
  const valla = '`'.repeat(3);
  const r = procesarRespuesta(`Te marco «Made-up Watch».\n${valla}snet\n${JSON.stringify({ ruta: { titulo: 'R', puntos: ids } })}\n${valla}`, t, 'es');
  assert.ok(r.propuesta.puntos.some((p) => p.tipo === 'objetivo'));
  assert.ok(!r.texto.includes('Antes de entregar'), r.texto);
});
