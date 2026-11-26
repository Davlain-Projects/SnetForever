// Lote H, ronda 1 (I1, M7 y el criterio de las misiones de otras temporadas): qué misiones de la base no entran en los
// datos, por qué, y cuáles se quedan porque hay prueba del juego (manda el juego) o porque están en una cadena.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { misionesExcluidas } from '../src/questie/excluidas.js';

const zonas = { uiMap: (area) => area, mazmorras: new Map() };
const aMapa = (o) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
const entidades = {
  quest: aMapa({
    100: { name: 'Normal', startedBy: [[1]] },
    60860: { name: 'Your Reward has Arrived!', startedBy: [[1]] },
    615: { name: "The Captain's Cutlass", startedBy: [[1]] },
    70001: { name: 'Con PNJ con punto', startedBy: [[1]] },
    70002: { name: 'Sin dador', startedBy: [] },
    70003: { name: 'PNJ sin puntos', startedBy: [[2]] },
    70004: { name: 'Objeto con punto', startedBy: [[], [10]] },
    70005: { name: 'Ítem que suelta un PNJ con punto', startedBy: [[], [], [30]] },
    70006: { name: 'Ítem sin fuente', startedBy: [[], [], [31]] },
    70007: { name: 'PNJ en una mazmorra', startedBy: [[3]] },
    70008: { name: 'Sin dador pero hecha', startedBy: [] },
    70009: { name: 'Sin dador pero en RXP', startedBy: [] },
    70010: { name: 'Sin dador pero en una cadena', startedBy: [] },
    90001: { name: 'Del Forever sin dador', startedBy: [] },
    5000: { name: 'Clásica sin dador', startedBy: [] },
    5691: { name: 'NYI basura' },
    8619: { name: 'Morndeep the Elder', startedBy: [[1]] },
  }),
  npc: aMapa({ 1: { spawns: { 12: [[10, 20]] } }, 2: { spawns: {} }, 3: { spawns: { 700: [[-1, -1]] } } }),
  object: aMapa({ 10: { spawns: { 12: [[1, 2]] } } }),
  item: aMapa({ 30: { npcDrops: [1] }, 31: {} }),
};
const listaNegra = new Map([
  [60860, { linea: 7050, nota: 'This is a promotion quest that is only available in Asia' }],
  [615, { linea: 25, nota: 'Duplicate of 8553. See #2215' }],
  [8619, { linea: 900, nota: '' }],
]);
const base = {
  entidades, zonas, listaNegra, enGuiasRxp: new Set([615, 70009]), completadas: new Map([[70008, new Set(['el druida de prueba'])]]),
  enCadenas: new Map([[70010, 'mejora-x']]),
  eventos: new Map([[8619, 'Lunar Festival'], [60860, undefined]].filter(([, e]) => e)),
};

const MOTIVO_TEMPORADA = 'otra temporada (id 60000-89999) sin prueba de que exista en el Forever (ni en RXPGuides, ni hecha, ni en una cadena, ni de evento)';

describe('misionesExcluidas', () => {
  const r = misionesExcluidas(base);

  // Pedido del jugador (11-nov): las de otras temporadas que no se usan, fuera, aunque tengan dador con punto en la base
  test('fuera: la lista negra de Questie y todas las de 60000-89999 sin prueba del juego; las demás se quedan', () => {
    assert.deepEqual([...r.excluidas.keys()].sort((a, b) => a - b), [60860, 70001, 70002, 70003, 70004, 70005, 70006, 70007]);
  });

  test('el motivo cita la línea de la lista negra y su comentario, o la regla de las otras temporadas', () => {
    assert.equal(r.excluidas.get(60860),
      'lista negra de Questie (QuestieQuestBlacklist.lua:7050: This is a promotion quest that is only available in Asia)');
    assert.equal(r.excluidas.get(70002), MOTIVO_TEMPORADA);
    assert.equal(r.excluidas.get(70001), MOTIVO_TEMPORADA, 'con dador con punto, también');
  });

  test('manda el juego: en RXPGuides, hecha por un personaje o en una cadena, se queda, y se apunta por qué', () => {
    assert.deepEqual(r.conservadas.map((c) => [c.id, c.regla, c.porque]), [
      [615, 'lista-negra', 'sale en las guías de RXPGuides'],
      [8619, 'lista-negra', 'se queda por evento (Lunar Festival)'],
      [70008, 'otra-temporada', 'la tiene hecha el druida de prueba (Questie, WTF)'],
      [70009, 'otra-temporada', 'sale en las guías de RXPGuides'],
      [70010, 'otra-temporada', 'está en la cadena mejora-x'],
    ]);
    assert.equal(r.conservadas[0].linea, 25);
  });

  test('cuenta las de la lista negra de la base: las que salen y las que se quedan', () => {
    assert.deepEqual(r.cuenta, { listaNegra: 3, listaNegraFuera: 1, otraTemporadaFuera: 7, conservadas: 5, porEvento: 1 });
    assert.deepEqual([...r.porEvento], [[8619, 'Lunar Festival']]);
  });

  test('las basura (esMisionBasura) no cuentan: ya se descartan aparte', () => {
    assert.equal(r.excluidas.has(5691), false);
  });

  test('sin lista negra (falta Questie), solo la regla de las otras temporadas', () => {
    const s = misionesExcluidas({ ...base, listaNegra: null });
    assert.equal(s.excluidas.get(60860), MOTIVO_TEMPORADA, 'sin la lista, la 60860 sale como otra temporada');
    assert.ok(s.excluidas.has(70002));
  });
});
