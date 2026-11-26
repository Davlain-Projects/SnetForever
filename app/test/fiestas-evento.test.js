// Lote eventos: desde los datos 2026.11.11.4 cada misión de fiesta lleva `evento` con el nombre exacto de Questie. La
// app lo mira antes que el QuestSort (zoneOrSort): -22 junta varias fiestas y -284, el de Children's Week, lo usan
// también misiones normales. Con datos de antes (sin `evento`) sigue valiendo el QuestSort.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase } from '../src/base/base.mjs';
import { prepararTurno } from '../src/contexto.mjs';
import { eventoDeMision, misionesDeZona, construirRutaZona } from '../src/rutaZona.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const carpeta = mkdtempSync(join(tmpdir(), 'snf-fiestas-'));
for (const n of ['misiones-app.lua', 'ruta-zona.lua']) copyFileSync(join(FIXTURES, n), join(carpeta, n));
// Cuatro misiones de Los Baldíos (la Cazadora 9203 de ruta-zona.lua las da y las recoge):
//   9126 de Children's Week (QuestSort SPECIAL, -284, con su `evento`), 9127 normal con el mismo -284 (sin `evento`),
//   9128 de Winter Veil (SEASONAL, -22, con su `evento`) y 9129 de -22 sin `evento` (datos de antes del lote).
const fila = (q, nombre, resto) => `Q[${q}]={name="${nombre}",startedBy={{9203}},finishedBy={{9203}},requiredLevel=1,questLevel=3,`
  + `requiredRaces=0,requiredClasses=0,objectivesText={},objectives={},sourceItemId=0,${resto},nextQuestInChain=0,questFlags=8,`
  + 'specialFlags=0,parentQuest=0}\n';
writeFileSync(join(carpeta, 'fiestas.lua'), 'local Q = SNF_MISIONES.quest\n'
  + fila(9126, 'Semana de los niños', 'zoneOrSort=-284,evento="Children\'s Week"')
  + fila(9127, 'Normal especial', 'zoneOrSort=-284')
  + fila(9128, 'Fiesta de invierno', 'zoneOrSort=-22,evento="Winter Veil"')
  + fila(9129, 'De temporada sin nombre', 'zoneOrSort=-22'));
writeFileSync(join(carpeta, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', 'ruta-zona.lua', 'fiestas.lua', ''].join('\n'));
const base = cargarBase(carpeta);

const ORCO = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 3 };
const turnoRuta = () => ({ datos: { personaje: ORCO, lugar: { mapa: 1413, x: 21, y: 21, zona: 'The Barrens' }, registro: [] } });
const mensaje = (refs) => ({
  v: 1, id: 'f1-1', pj: 'Prueba-Reino', idioma: 'es', modelo: 'haiku', texto: 'hola',
  ctx: {
    pj: { nivel: 3, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, xp: 100, xpMax: 900, dinero: 0 },
    lugar: { mapa: 1413, zona: 'The Barrens', instancia: false },
    registro: [], prof: [], guias: [], cadenas: [], mazmorras: [],
  },
  refs: { q: refs },
});

test('eventos: eventoDeMision mira `evento` antes que el QuestSort y, sin él, sigue con el QuestSort', () => {
  assert.equal(eventoDeMision({ zoneOrSort: -284, evento: "Children's Week" }), "Children's Week");
  assert.equal(eventoDeMision({ zoneOrSort: -22, evento: 'Winter Veil' }), 'Winter Veil');
  assert.equal(eventoDeMision({ zoneOrSort: 17, evento: 'Midsummer' }), 'Midsummer', 'manda el campo, aunque sea de una zona');
  // Sin el campo (o con uno que no vale), como hasta ahora.
  assert.equal(eventoDeMision({ zoneOrSort: -22 }), 'Seasonal');
  assert.equal(eventoDeMision({ zoneOrSort: -366, evento: '' }), 'Lunar Festival');
  assert.equal(eventoDeMision({ zoneOrSort: -366, evento: 7 }), 'Lunar Festival');
  for (const m of [{ zoneOrSort: -284 }, { zoneOrSort: -284, evento: '' }, { zoneOrSort: 17 }, {}, null, undefined]) {
    assert.equal(eventoDeMision(m), null, JSON.stringify(m));
  }
});

test('eventos: la de Children\'s Week y la de Winter Veil no salen en la ruta de su zona; la normal de -284 sí', () => {
  const qs = misionesDeZona(base, 1413, ORCO, {}).map((m) => m.q);
  assert.ok(!qs.includes(9126), 'Children\'s Week (-284 con evento) fuera de la ruta');
  assert.ok(!qs.includes(9128), 'Winter Veil (-22 con evento) fuera');
  assert.ok(!qs.includes(9129), '-22 sin evento, fuera como siempre');
  assert.ok(qs.includes(9127), 'la normal de -284 sigue en la ruta');
  const r = construirRutaZona(base, { zona: 1413 }, turnoRuta(), 'es');
  const enGuia = new Set(r.guia.pasos.flatMap((p) => p.elementos).map((e) => e.q));
  assert.ok(!enGuia.has(9126) && !enGuia.has(9128));
  assert.ok(enGuia.has(9127));
});

test('eventos: en el contexto de la IA la de Children\'s Week lleva su nombre, la de Winter Veil el suyo y la normal nada', () => {
  const d = prepararTurno(base, mensaje([9126, 9128, 9127, 9129])).datos;
  assert.deepEqual(d.mencionadas.map((m) => [m.q, m.evento]),
    [[9126, "Children's Week"], [9128, 'Winter Veil'], [9127, undefined], [9129, 'Seasonal']]);
  assert.ok(!('evento' in d.mencionadas[2]), 'la normal de -284 no lleva el campo');
});
