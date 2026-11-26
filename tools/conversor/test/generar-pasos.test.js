// Pruebas de los pasos de una misión (R11) y del identificador estable de paso: el conversor genera
// recoger, completar y entregar solo con lo que dice la base; nunca inventa un punto.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { vistaDePrueba } from './ayuda/vista.js';
import { pasosDeMision, ensamblarGuia } from '../src/generar/pasos.js';
import { idDePaso } from '../src/salida/id.js';

// Mundo mínimo: el uiMap de un área es el propio AreaID.
const PNJS = {
  1: { name: 'Da', spawns: { 10: [[40, 50]] } },
  2: { name: 'Recibe', spawns: { 11: [[10.5, 20.25]] } },
  3: { name: 'Bicho A', spawns: { 12: [[1, 2]] } },
  4: { name: 'Bicho B', spawns: { 13: [[3, 4]] } },
  5: { name: 'Bicho C', spawns: { 14: [[5, 6]] } },
  6: { name: 'Bicho D', spawns: { 15: [[7, 8]] } },
  7: { name: 'Solo en la mazmorra', spawns: { 700: [[-1, -1]] } },
  8: { name: 'Sin puntos' },
  9: { name: 'Otro dador', spawns: { 700: [[-1, -1]] } },
  10: { name: 'Kill credit', spawns: { 16: [[9, 9]] } },
};
const OBJETOS = { 20: { name: 'Cofre', spawns: { 17: [[60, 70]] } } };
const ITEMS = { 30: { name: 'Pieza', npcDrops: [3, 4], objectDrops: [20] } };
const MAZMORRAS = {
  700: { nombre: 'Mazmorra de prueba', entradas: [{ zona: 18, x: 22, y: 33, mapa: 18 }] },
};

const mision = (extra = {}) => ({
  name: 'M', requiredLevel: 10, questLevel: 10, requiredRaces: 0, requiredClasses: 0,
  startedBy: [[1]], finishedBy: [[2]], objectives: [[[3, 'Bicho A']]], ...extra,
});
const vista = (misiones, extra = {}) => vistaDePrueba({
  misiones, pnjs: PNJS, objetos: OBJETOS, items: ITEMS, mazmorras: MAZMORRAS, faccion: 'Horde', clase: 'DRUID', ...extra,
});
const una = (q = mision(), opciones) => pasosDeMision(vista({ 100: q }), 100, opciones);
const gotos = (paso) => paso.elementos.filter((e) => e.t === 'goto');

describe('pasosDeMision', () => {
  test('una misión con PNJ y objetivos da recoger, completar y entregar, en ese orden', () => {
    const pasos = una();
    assert.deepEqual(pasos.map((p) => p.parte), ['recoger', 'completar', 'entregar']);
    for (const p of pasos) {
      assert.deepEqual(p.etiquetas, {});
      assert.deepEqual(p.requisitos, []);
      assert.equal(p.sinVerificar, undefined);
    }
  });

  test('recoger empieza con goto a flecha y acaba con accept', () => {
    const [recoger] = una();
    assert.deepEqual(recoger.elementos, [
      { t: 'goto', mapa: 10, x: 40, y: 50, modo: 'flecha' },
      { t: 'accept', q: 100 },
    ]);
  });

  test('entregar lleva goto a quien la recibe y turnin', () => {
    const [, , entregar] = una();
    assert.deepEqual(entregar.elementos, [
      { t: 'goto', mapa: 11, x: 10.5, y: 20.25, modo: 'flecha' },
      { t: 'turnin', q: 100 },
    ]);
  });

  test('con dos migas, el primer paso tiene dos turnin siFalta antes del accept', () => {
    const [recoger] = una(mision(), { migas: [50, 51] });
    assert.deepEqual(recoger.elementos.map((e) => e.t), ['goto', 'turnin', 'turnin', 'accept']);
    assert.deepEqual(recoger.elementos[1], { t: 'turnin', q: 50, siFalta: true });
    assert.deepEqual(recoger.elementos[2], { t: 'turnin', q: 51, siFalta: true });
  });

  test('previas.una añade un isQuestTurnedIn a los tres pasos y todas uno por misión', () => {
    for (const p of una(mision(), { previas: { una: [500] } })) {
      assert.deepEqual(p.elementos.filter((e) => e.t === 'isQuestTurnedIn'), [{ t: 'isQuestTurnedIn', qs: [500] }]);
    }
    for (const p of una(mision(), { previas: { todas: [501, 502] } })) {
      assert.deepEqual(p.elementos.filter((e) => e.t === 'isQuestTurnedIn'), [
        { t: 'isQuestTurnedIn', qs: [501] }, { t: 'isQuestTurnedIn', qs: [502] },
      ]);
    }
  });

  test('sin objetivos ni triggerEnd no hay paso de completar', () => {
    const pasos = una(mision({ objectives: [] }));
    assert.deepEqual(pasos.map((p) => p.parte), ['recoger', 'entregar']);
  });

  test('solo con triggerEnd hay un complete (objetivo 1) y un goto a sus puntos', () => {
    const pasos = una(mision({ objectives: [], triggerEnd: ['Llega', { 19: [[33, 44]] }] }));
    assert.deepEqual(pasos[1].elementos, [
      { t: 'goto', mapa: 19, x: 33, y: 44, modo: 'flecha', objetivo: 1 },
      { t: 'complete', q: 100, objetivo: 1 },
    ]);
  });

  test('con 4 objetivos hay 4 complete (objetivo 1-4) y un goto por objetivo con punto', () => {
    const pasos = una(mision({ objectives: [[[3, 'a'], [4, 'b'], [5, 'c'], [6, 'd']]] }));
    const completar = pasos[1];
    assert.deepEqual(completar.elementos.filter((e) => e.t === 'complete').map((e) => e.objetivo), [1, 2, 3, 4]);
    assert.equal(gotos(completar).length, 4);
    assert.deepEqual(gotos(completar).map((g) => g.mapa), [12, 13, 14, 15]);
    assert.equal(completar.elementos.at(-1).objetivo, 4);
  });

  test('los seis grupos cuentan para N: objetos, ítems, killcredit y el resto', () => {
    const pasos = una(mision({
      objectives: [[[3, 'a']], [[20, 'cofre']], [[30, 'pieza']], [[1000, 5]], [[[10, 4], 4, 'cred']], [[2000, 'hechizo']]],
    }));
    const completar = pasos[1];
    assert.deepEqual(completar.elementos.filter((e) => e.t === 'complete').map((e) => e.objetivo), [1, 2, 3, 4, 5, 6]);
    // PNJ del grupo 1, luego el killcredit (grupo 5), el objeto (grupo 2) y el ítem (grupo 3, cae del PNJ 3: el
    // mismo punto que el objetivo 1, repetido para su objetivo).
    assert.deepEqual(gotos(completar).map((g) => g.mapa), [12, 16, 17, 12]);
  });

  test('el ítem de un objetivo manda a la fuente que tiene punto y los goto no se repiten dentro de un objetivo', () => {
    // La pieza cae de los PNJ 3 y 4 y del objeto 20: un solo goto (el del PNJ 3) para el objetivo del ítem.
    const pasos = una(mision({ objectives: [[], [], [[30, 'pieza']]] }));
    assert.deepEqual(gotos(pasos[1]).map((g) => g.mapa), [12]);
  });

  test('un ítem sin fuente conocida no da goto', () => {
    const pasos = una(mision({ objectives: [[], [], [[31, 'sin fuente']]] }), {});
    assert.deepEqual(gotos(pasos[1]), []);
  });

  test('Vigilancia 4: si el que la da solo está en la mazmorra, el goto va a la entrada', () => {
    const [recoger] = una(mision({ startedBy: [[7]] }));
    assert.deepEqual(recoger.elementos[0], { t: 'goto', mapa: 18, x: 22, y: 33, modo: 'flecha' });
    assert.equal(recoger.sinVerificar, undefined);
  });

  test('Vigilancia 4: sin puntos no hay goto y el paso lleva sinVerificar = "punto"', () => {
    const [recoger, , entregar] = una(mision({ startedBy: [[8]], finishedBy: [[8]] }));
    assert.deepEqual(recoger.elementos, [{ t: 'accept', q: 100 }]);
    assert.equal(recoger.sinVerificar, 'punto');
    assert.deepEqual(entregar.elementos, [{ t: 'turnin', q: 100 }]);
    assert.equal(entregar.sinVerificar, 'punto');
  });

  test('Vigilancia 4: una mazmorra sin entrada con mapa tampoco inventa el punto', () => {
    const v = vista({ 100: mision({ startedBy: [[7]] }) }, { mazmorras: { 700: { nombre: 'x', entradas: [{ zona: 0, x: 1, y: 1, mapa: 0 }] } } });
    const [recoger] = pasosDeMision(v, 100, {});
    assert.deepEqual(recoger.elementos, [{ t: 'accept', q: 100 }]);
    assert.equal(recoger.sinVerificar, 'punto');
  });

  test('se prefiere un punto de mapa al de la mazmorra, en el orden de startedBy', () => {
    const [recoger] = una(mision({ startedBy: [[7, 1]] }));
    assert.deepEqual(recoger.elementos[0], { t: 'goto', mapa: 10, x: 40, y: 50, modo: 'flecha' });
  });

  test('un objeto da la misión con su punto', () => {
    const [recoger] = una(mision({ startedBy: [[], [20]] }));
    assert.deepEqual(recoger.elementos[0], { t: 'goto', mapa: 17, x: 60, y: 70, modo: 'flecha' });
  });

  // Lote C (revisión 52, Minor 9): una misión que empieza con un ítem dice dónde sale (el punto de su fuente en la base,
  // npcDrops u objectDrops) y pide el ítem con un collect (con la misión: hecho en cuanto está en el registro).
  test('si la empieza un ítem, goto a su fuente, collect del ítem y accept', () => {
    const [recoger] = una(mision({ startedBy: [[], [], [30]] }), { migas: [50] });
    // La pieza cae de los PNJ 3 (mapa 12) y 4 (mapa 13) y del objeto 20 (mapa 17): el primero con punto, el PNJ 3.
    assert.deepEqual(recoger.elementos, [
      { t: 'goto', mapa: 12, x: 1, y: 2, modo: 'flecha' },
      { t: 'collect', i: 30, n: 1, q: 100 },
      { t: 'accept', q: 100 },
    ]);
    assert.equal(recoger.sinVerificar, undefined);
  });

  // Lote C, ronda 1 (duda 7): el id del paso de recoger se calcula con lo que llevaba antes del goto y el collect nuevos
  // (solo el accept, con sus condiciones), así las marcas guardadas de ese paso siguen casando.
  test('ronda 1: el id del paso de recoger de una misión que empieza con un ítem es el de antes (solo el accept)', () => {
    const previas = { una: [7] };
    const pasos = pasosDeMision(vista({ 100: mision({ startedBy: [[], [], [30]] }) }), 100, { previas });
    const guia = ensamblarGuia({ clave: 'X\\guía' }, pasos);
    const antes = JSON.stringify(['recoger', [{ t: 'isQuestTurnedIn', qs: [7] }, { t: 'accept', q: 100 }]]);
    assert.equal(guia.pasos[0].id, idDePaso('X\\guía', true, antes));
    assert.ok(guia.pasos[0].elementos.some((e) => e.t === 'collect'), 'los elementos sí llevan el collect');
    assert.equal('elementosId' in guia.pasos[0], false, 'el contenido del id no sale en los datos');
    assert.equal('elementosId' in pasos[0], true);
  });

  test('si la empieza un ítem de una criatura con muchos puntos, el más cercano al paso anterior', () => {
    const pnjs = { ...PNJS, 60: { name: 'Muchos', spawns: { 12: [[10, 10], [50, 50], [90, 90]], 13: [[1, 1], [2, 2], [3, 3], [4, 4]] } } };
    const items = { ...ITEMS, 33: { name: 'Carta', npcDrops: [60] } };
    const recogerDe = (opciones) => pasosDeMision(vista({ 100: mision({ startedBy: [[], [], [33]] }) }, { pnjs, items }), 100, opciones)[0];
    assert.deepEqual(gotos(recogerDe({ anterior: { mapa: 12, x: 80, y: 85 } })), [{ t: 'goto', mapa: 12, x: 90, y: 90, modo: 'flecha' }]);
    assert.deepEqual(gotos(recogerDe({ anterior: { mapa: 12, x: 45, y: 40 } })), [{ t: 'goto', mapa: 12, x: 50, y: 50, modo: 'flecha' }]);
    // Sin paso anterior, o con el anterior en un mapa sin puntos de la fuente, la regla de siempre (el mapa con más
    // puntos y su primer punto).
    assert.deepEqual(gotos(recogerDe({})), [{ t: 'goto', mapa: 13, x: 1, y: 1, modo: 'flecha' }]);
    assert.deepEqual(gotos(recogerDe({ anterior: { mapa: 99, x: 1, y: 1 } })), [{ t: 'goto', mapa: 13, x: 1, y: 1, modo: 'flecha' }]);
  });

  // Lote H: QuestieDB 1.0.14 dejó «Stepping Stones» (saco de dormir) sin ningún objeto en común con la misión anterior:
  // la dan dos tablones, uno junto a cada sitio de entrega de la anterior. En una guía de mejora, sin objeto común, la
  // flecha va al dador más cercano al paso anterior (donde se entregó la anterior); con objeto común, a ese, como antes.
  describe('guía de mejora: el dador de una misión que dan varios objetos', () => {
    const objetos = {
      ...OBJETOS,
      21: { name: 'Tablón de aquí', spawns: { 40: [[37, 50]] } },
      22: { name: 'Tablón de allí', spawns: { 41: [[46, 73]] } },
    };
    const recogerDe = (opciones) => pasosDeMision(vista({ 100: mision({ startedBy: [[], [22, 21]] }) }, { objetos }), 100,
      { objetos: true, ...opciones })[0];
    test('sin objeto común, el más cercano al paso anterior', () => {
      const r = recogerDe({ anterior: { mapa: 40, x: 37.5, y: 50.5 } });
      assert.deepEqual(gotos(r), [{ t: 'goto', mapa: 40, x: 37, y: 50, modo: 'flecha' }]);
      assert.deepEqual(r.elementos.at(-1), { t: 'accept', q: 100, objeto: 21 });
    });
    test('con objeto común manda ese, aunque el anterior esté en otro mapa', () => {
      const r = recogerDe({ dadores: [22], anterior: { mapa: 40, x: 37.5, y: 50.5 } });
      assert.deepEqual(gotos(r), [{ t: 'goto', mapa: 41, x: 46, y: 73, modo: 'flecha' }]);
    });
    test('sin paso anterior (o fuera de las guías de mejora), el primero de la base, como antes', () => {
      assert.deepEqual(gotos(recogerDe({})), [{ t: 'goto', mapa: 41, x: 46, y: 73, modo: 'flecha' }]);
      const deClase = pasosDeMision(vista({ 100: mision({ startedBy: [[], [22, 21]] }) }, { objetos }), 100,
        { anterior: { mapa: 40, x: 37.5, y: 50.5 } })[0];
      assert.deepEqual(gotos(deClase), [{ t: 'goto', mapa: 41, x: 46, y: 73, modo: 'flecha' }]);
    });
  });

  test('no se inventa: un ítem cuya fuente no tiene puntos va sin goto y con sinVerificar «punto»; sin fuente, sin marca', () => {
    const items = { ...ITEMS, 34: { name: 'Sin sitio', npcDrops: [8] }, 35: { name: 'Sin fuente' } };
    const recogerDe = (item) => pasosDeMision(vista({ 100: mision({ startedBy: [[], [], [item]] }) }, { items }), 100, {})[0];
    const sinSitio = recogerDe(34);
    assert.deepEqual(sinSitio.elementos, [{ t: 'collect', i: 34, n: 1, q: 100 }, { t: 'accept', q: 100 }]);
    assert.equal(sinSitio.sinVerificar, 'punto');
    const sinFuente = recogerDe(35);
    assert.deepEqual(sinFuente.elementos, [{ t: 'collect', i: 35, n: 1, q: 100 }, { t: 'accept', q: 100 }]);
    assert.equal(sinFuente.sinVerificar, undefined);
  });

  test('si el ítem cae dentro de la mazmorra donde se está, sin goto ni marca', () => {
    const pnjs = { ...PNJS, 61: { name: 'Dentro', spawns: { 700: [[-1, -1]] } } };
    const items = { ...ITEMS, 36: { name: 'De dentro', npcDrops: [61] } };
    const [recoger] = pasosDeMision(vista({ 100: mision({ startedBy: [[], [], [36]] }) }, { pnjs, items }), 100, { dentro: 700 });
    assert.deepEqual(recoger.elementos, [{ t: 'collect', i: 36, n: 1, q: 100 }, { t: 'accept', q: 100 }]);
    assert.equal(recoger.sinVerificar, undefined);
  });

  test('con dentro, los que la dan desde dentro van sin goto y sin marca; los de fuera con entrada', () => {
    const [dentro] = una(mision({ startedBy: [[9]] }), { dentro: 700 });
    assert.deepEqual(dentro.elementos, [{ t: 'accept', q: 100 }]);
    assert.equal(dentro.sinVerificar, undefined);
    const [fuera] = una(mision({ startedBy: [[9]] }), {});
    assert.equal(fuera.elementos[0].mapa, 18);
    // y entregar dentro igual
    const [, , entregar] = una(mision({ finishedBy: [[9]] }), { dentro: 700 });
    assert.deepEqual(entregar.elementos, [{ t: 'turnin', q: 100 }]);
    assert.equal(entregar.sinVerificar, undefined);
  });

  test('un spawn fuera de 0-100 no es un punto: sin goto y sinVerificar = "punto"', () => {
    const pnjs = { ...PNJS, 41: { name: 'Fuera', spawns: { 10: [[150, 50]] } }, 42: { name: 'Negativo', spawns: { 10: [[-1, 5]] } } };
    for (const id of [41, 42]) {
      const [recoger] = pasosDeMision(vista({ 100: mision({ startedBy: [[id]] }) }, { pnjs }), 100, {});
      assert.deepEqual(recoger.elementos, [{ t: 'accept', q: 100 }]);
      assert.equal(recoger.sinVerificar, 'punto');
    }
  });

  test('con un spawn fuera de rango y otro dentro, se usa el de dentro', () => {
    const pnjs = { ...PNJS, 43: { name: 'Mixto', spawns: { 10: [[150, 50], [30, 40]] } } };
    const [recoger] = pasosDeMision(vista({ 100: mision({ startedBy: [[43]] }) }, { pnjs }), 100, {});
    assert.deepEqual(recoger.elementos[0], { t: 'goto', mapa: 10, x: 30, y: 40, modo: 'flecha' });
    assert.equal(recoger.sinVerificar, undefined);
  });

  test('una entrada de mazmorra fuera de rango tampoco es punto', () => {
    const v = vista({ 100: mision({ startedBy: [[7]] }) }, { mazmorras: { 700: { nombre: 'x', entradas: [{ zona: 18, x: 120, y: 3, mapa: 18 }] } } });
    const [recoger] = pasosDeMision(v, 100, {});
    assert.equal(recoger.sinVerificar, 'punto');
  });

  test('con dentro, una entidad con spawns en mapa y en la mazmorra va sin goto', () => {
    const pnjs = { ...PNJS, 44: { name: 'Doble', spawns: { 10: [[40, 50]], 700: [[-1, -1]] } } };
    const q = vista({ 100: mision({ startedBy: [[44]], finishedBy: [[44]] }) }, { pnjs });
    const [recoger, , entregar] = pasosDeMision(q, 100, { dentro: 700 });
    for (const p of [recoger, entregar]) {
      assert.equal(gotos(p).length, 0);
      assert.equal(p.sinVerificar, undefined);
    }
    // fuera de la mazmorra sigue yendo al punto del mapa
    assert.equal(gotos(pasosDeMision(q, 100, {})[0])[0].mapa, 10);
  });

  test('completar sin punto en ninguna fuente se marca; sin fuentes no se marca', () => {
    const marcado = una(mision({ objectives: [[[8, 'sin puntos']]] }))[1];
    assert.equal(marcado.sinVerificar, 'punto');
    assert.deepEqual(gotos(marcado), []);
    const sinFuente = una(mision({ objectives: [[], [], [], [[1000, 5]]] }))[1];
    assert.equal(sinFuente.sinVerificar, undefined);
    assert.equal(sinFuente.elementos.filter((e) => e.t === 'complete').length, 1);
  });

  test('todo x e y está entre 0 y 100', () => {
    const pasos = una(mision({ objectives: [[[3, 'a'], [4, 'b']], [[20, 'c']], [[30, 'd']]], triggerEnd: ['t', { 19: [[33, 44]] }] }));
    const puntos = pasos.flatMap(gotos);
    assert.ok(puntos.length >= 4);
    for (const g of puntos) {
      assert.ok(g.x >= 0 && g.x <= 100 && g.y >= 0 && g.y <= 100, JSON.stringify(g));
    }
  });
});

// Fallo de la 6128 (el jugador): la Raíz de tierra tiene más puntos en Teldrassil que en Los Baldíos, donde se
// recoge la misión, y la flecha mandaba a 10.000 yardas. El mapa de cada fuente de completar se elige por
// cercanía a la misión: recogida, entrega, zona de la misión y, solo si no, el de más puntos.
describe('mapa de las fuentes de completar', () => {
  // PNJ 50: 4 puntos en el mapa lejano 90, 1 en el 10 (recogida), 1 en el 11 (entrega) y 1 en el 95 (zona).
  const pnjs = {
    ...PNJS,
    50: { name: 'Lejos y cerca', spawns: { 90: [[1, 1], [2, 2], [3, 3], [4, 4]], 10: [[44, 55]], 11: [[66, 77]], 95: [[12, 13]] } },
    51: { name: 'Lejos, entrega y zona', spawns: { 90: [[1, 1], [2, 2], [3, 3]], 11: [[66, 77]], 95: [[12, 13]] } },
    52: { name: 'Lejos y zona', spawns: { 90: [[1, 1], [2, 2], [3, 3]], 95: [[12, 13]] } },
    53: { name: 'Solo lejos', spawns: { 90: [[5, 6], [2, 2]], 91: [[7, 7]] } },
    54: { name: 'Solo en Teldrassil', spawns: { 90: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] } },
  };
  const objetos = { ...OBJETOS, 21: { name: 'Raíz', spawns: { 90: [[9, 9], [8, 8]], 10: [[30, 31]] } } };
  const items = { ...ITEMS, 32: { name: 'Raíz de tierra', npcDrops: [54], objectDrops: [21] } };
  const completarDe = (q, opciones = {}) => pasosDeMision(vista({ 100: q }, { pnjs, objetos, items }), 100, opciones)
    .find((p) => gotos(p).length > 0 && p.elementos.some((e) => e.t === 'complete'));
  const primero = (q) => gotos(completarDe(q))[0];

  test('(a) gana el mapa donde se recoge aunque otro tenga más puntos', () => {
    assert.deepEqual(primero(mision({ objectives: [[[50, 'x']]], zoneOrSort: 95 })),
      { t: 'goto', mapa: 10, x: 44, y: 55, modo: 'flecha', objetivo: 1 });
  });

  test('(a) sin punto de recogida (la da un ítem), el de la entrega', () => {
    assert.equal(primero(mision({ startedBy: [[], [], [30]], objectives: [[[50, 'x']]], zoneOrSort: 95 })).mapa, 11);
  });

  test('(b) sin puntos en el de la recogida, el de la entrega', () => {
    assert.equal(primero(mision({ objectives: [[[51, 'x']]], zoneOrSort: 95 })).mapa, 11);
  });

  test('(c) sin puntos en recogida ni entrega, el mapa de la zona de la misión', () => {
    assert.deepEqual(primero(mision({ objectives: [[[52, 'x']]], zoneOrSort: 95 })),
      { t: 'goto', mapa: 95, x: 12, y: 13, modo: 'flecha', objetivo: 1 });
  });

  test('(d) sin nada de lo anterior, el de más puntos y su primer punto, como antes', () => {
    assert.deepEqual(primero(mision({ objectives: [[[53, 'x']]], zoneOrSort: 95 })),
      { t: 'goto', mapa: 90, x: 5, y: 6, modo: 'flecha', objetivo: 1 });
    // Una zona negativa (QuestSort de clase) no es un mapa.
    assert.equal(primero(mision({ objectives: [[[53, 'x']]], zoneOrSort: -263 })).mapa, 90);
  });

  test('entre los candidatos de un ítem gana el que está en el mapa de la misión, aunque vaya después', () => {
    // Cae del PNJ 54 (solo en el lejano, con más puntos) y del objeto 21 (también en el de la recogida).
    assert.deepEqual(primero(mision({ objectives: [[], [], [[32, 'raíz']]] })),
      { t: 'goto', mapa: 10, x: 30, y: 31, modo: 'flecha', objetivo: 1 });
  });

  test('no se inventa: una fuente sin puntos sigue sin goto', () => {
    const paso = pasosDeMision(vista({ 100: mision({ objectives: [[[8, 'sin puntos']]] }) }, { pnjs }), 100, {})[1];
    assert.deepEqual(gotos(paso), []);
    assert.equal(paso.sinVerificar, 'punto');
  });

  test('recoger y entregar no cambian (su PNJ, por el criterio de siempre)', () => {
    const [recoger, , entregar] = pasosDeMision(vista({ 100: mision({ startedBy: [[53]], finishedBy: [[53]], objectives: [[[50, 'x']]] }) }, { pnjs }), 100, {});
    assert.equal(gotos(recoger)[0].mapa, 90);
    assert.equal(gotos(entregar)[0].mapa, 90);
    assert.equal(gotos(recoger)[0].objetivo, undefined);
  });
});

describe('objetivo de cada goto de completar', () => {
  test('cada goto lleva el índice de su objetivo en el orden del diario (PNJ, objetos, ítems, crédito, hechizo)', () => {
    const pasos = una(mision({ objectives: [[[3, 'a']], [[20, 'cofre']], [[30, 'pieza']], [], [[[10, 4], 4, 'cred']]] }));
    // Orden de las fuentes: PNJ (obj. 1), crédito (obj. 4), objeto (obj. 2) e ítem (obj. 3, el punto del PNJ 3).
    assert.deepEqual(gotos(pasos[1]).map((g) => [g.mapa, g.objetivo]), [[12, 1], [16, 4], [17, 2], [12, 3]]);
  });

  test('dos ítems: el segundo goto es del objetivo 2', () => {
    const pasos = una(mision({ objectives: [[], [], [[30, 'pieza'], [31, 'sin fuente']]] }));
    assert.deepEqual(gotos(pasos[1]).map((g) => g.objetivo), [1]);
    const dos = una(mision({ objectives: [[[4, 'b']], [], [[30, 'pieza']]] }));
    assert.deepEqual(gotos(dos[1]).map((g) => [g.mapa, g.objetivo]), [[13, 1], [12, 2]]);
  });

  test('el mismo punto para dos objetivos va una vez por objetivo (si uno se cumple, el otro sigue)', () => {
    const pasos = una(mision({ objectives: [[[3, 'a']], [], [[30, 'pieza']]] }));
    assert.deepEqual(gotos(pasos[1]).map((g) => [g.mapa, g.objetivo]), [[12, 1], [12, 2]]);
  });

  test('el tope es de 6 puntos distintos; las repeticiones de otro objetivo no cuentan', () => {
    // Seis PNJ en seis mapas (12, 13, 14, 15, 10, 11) y un ítem que cae del PNJ 3 (repite el punto del objetivo 1).
    const seis = [[3, 'a'], [4, 'b'], [5, 'c'], [6, 'd'], [1, 'e'], [2, 'f']];
    const pasos = una(mision({ objectives: [seis, [], [[30, 'pieza']]] }));
    const g = gotos(pasos[1]);
    assert.deepEqual(g.map((x) => [x.mapa, x.objetivo]), [[12, 1], [13, 2], [14, 3], [15, 4], [10, 5], [11, 6], [12, 7]]);
    // Un 7.º punto distinto ya no cabe.
    const pnjs = { ...PNJS, 60: { name: 'Séptimo', spawns: { 61: [[1, 1]] } } };
    const siete = pasosDeMision(vista({ 100: mision({ objectives: [[...seis, [60, 'g']]] }) }, { pnjs }), 100, {})[1];
    assert.equal(new Set(gotos(siete).map((x) => x.mapa)).size, 6);
    assert.deepEqual(gotos(siete).map((x) => x.objetivo), [1, 2, 3, 4, 5, 6]);
  });

  test('triggerEnd en una misión con reputación: su goto va sin objetivo (la reputación descuadra el índice)', () => {
    const pasos = una(mision({ objectives: [[], [], [], [1000, 5]], triggerEnd: ['Llega', { 19: [[33, 44]] }] }));
    assert.deepEqual(gotos(pasos[1]), [{ t: 'goto', mapa: 19, x: 33, y: 44, modo: 'flecha' }]);
  });

  test('la reputación (un par [facción, valor] en QuestieDB) es un solo objetivo: sin complete fantasma', () => {
    const solo = una(mision({ objectives: [[], [], [], [1000, 5]] }));
    assert.deepEqual(solo[1].elementos.filter((e) => e.t === 'complete').map((e) => e.objetivo), [1]);
    const conItem = una(mision({ objectives: [[], [], [[30, 'pieza']], [1000, 5]], triggerEnd: ['Llega', { 19: [[33, 44]] }] }));
    assert.deepEqual(conItem[1].elementos.filter((e) => e.t === 'complete').map((e) => e.objetivo), [1, 2]);
  });

  test('triggerEnd: objetivo 1 si no hay otros; si los hay, el siguiente a los del registro', () => {
    const solo = una(mision({ objectives: [], triggerEnd: ['Llega', { 19: [[33, 44]] }] }));
    assert.deepEqual(gotos(solo[1]), [{ t: 'goto', mapa: 19, x: 33, y: 44, modo: 'flecha', objetivo: 1 }]);
    const con = una(mision({ objectives: [[[3, 'a']]], triggerEnd: ['Llega', { 19: [[33, 44]] }] }));
    assert.deepEqual(gotos(con[1]).map((g) => [g.mapa, g.objetivo]), [[12, 1], [19, 2]]);
  });
});

describe('filtro de los pasos', () => {
  const filtros = (q, opciones) => una(q, opciones).map((p) => p.filtro);

  test('sin filtro del que llama ni restricción de clase o raza, no hay filtro', () => {
    for (const f of filtros(mision())) assert.equal(f, undefined);
  });

  test('el filtro de quien llama pasa tal cual', () => {
    for (const f of filtros(mision(), { filtro: [['c:DRUID']] })) assert.deepEqual(f, [['c:DRUID']]);
  });

  test('requiredClasses distinta de todas añade c: y requiredRaces de la facción añade r:', () => {
    // 1024 = druida; 32 + 128 = tauren y trol
    const [f] = filtros(mision({ requiredClasses: 1024, requiredRaces: 32 + 128 }));
    assert.deepEqual(f, [['c:DRUID', 'r:Tauren'], ['c:DRUID', 'r:Troll']]);
  });

  test('se combina con el filtro de quien llama (Y)', () => {
    const [f] = filtros(mision({ requiredRaces: 32 }), { filtro: [['c:DRUID']] });
    assert.deepEqual(f, [['c:DRUID', 'r:Tauren']]);
  });

  test('una misión para todas las razas de su facción no lleva r:', () => {
    // todas las de la Horda: orco, no muerto, tauren, trol (Skyborne tiene su bit propio)
    const todas = 2 + 16 + 32 + 128 + 2 ** 33;
    for (const f of filtros(mision({ requiredRaces: todas }))) assert.equal(f, undefined);
  });
});

describe('idDePaso y ensamblarGuia', () => {
  test('idDePaso son los 8 primeros hexadecimales del sha1 de clave, filtro y contenido', () => {
    // Constante de regresión de la fórmula de la fase 1: si cambia, cambian los id de paso ya guardados.
    assert.equal(idDePaso('a', true, 'x'), 'd2724326');
    assert.equal(idDePaso('a', true, 'x'), idDePaso('a', true, 'x'));
    assert.notEqual(idDePaso('a', true, 'x'), idDePaso('b', true, 'x'));
    assert.notEqual(idDePaso('a', [['c:DRUID']], 'x'), idDePaso('a', true, 'x'));
  });

  test('ensamblarGuia da n seguidos, id únicos y estables, linea 0 y sin parte', () => {
    const hacer = () => ensamblarGuia({ clave: 'Cadenas de clase (H)\\x', tipo: 'cadena' },
      [...una(), ...una(), ...una(mision(), { filtro: [['c:DRUID']] })]);
    const g = hacer();
    assert.equal(g.clave, 'Cadenas de clase (H)\\x');
    assert.equal(g.pasos.length, 9);
    g.pasos.forEach((p, i) => {
      assert.equal(p.n, i + 1);
      assert.equal(p.linea, 0);
      assert.equal(p.parte, undefined);
      assert.match(p.id, /^[0-9a-f]{8}(-\d+)?$/);
    });
    assert.equal(new Set(g.pasos.map((p) => p.id)).size, 9);
    assert.equal(g.pasos[3].id, `${g.pasos[0].id}-2`, 'paso repetido');
    assert.deepEqual(hacer().pasos.map((p) => p.id), g.pasos.map((p) => p.id));
    // el filtro distingue copias del mismo paso
    assert.ok(!/-\d+$/.test(g.pasos[6].id));
  });

  test('ensamblarGuia respeta sinVerificar y no toca los campos de la guía', () => {
    const g = ensamblarGuia({ clave: 'k', sinVerificar: true }, una(mision({ startedBy: [[8]] })));
    assert.equal(g.sinVerificar, true);
    assert.equal(g.pasos[0].sinVerificar, 'punto');
    assert.deepEqual(Object.keys(g.pasos[1]), ['id', 'n', 'etiquetas', 'elementos', 'requisitos', 'linea']);
  });
});
