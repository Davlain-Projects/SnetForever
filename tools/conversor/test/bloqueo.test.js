// Lote A (revisión 52, I2): un paso con texto visible y sin ningún elemento que pueda quedar pendiente no se salta solo.
// El conversor le pone una casilla (`manual`) con su propio texto; validar.js comprueba que no quede ninguno.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { puedeBloquear, sinBloqueo, asegurarCasilla } from '../src/rxp/bloqueo.js';

const T = (es) => ({ en: es, es });
const nota = (es, extra = {}) => ({ t: 'nota', texto: T(es), linea: 1, ...extra });
const flecha = { t: 'goto', mapa: 1411, x: 50, y: 50, modo: 'flecha', linea: 1 };
const paso = (elementos, extra = {}) => ({ n: 1, filtro: true, etiquetas: {}, elementos, requisitos: [], ...extra });

describe('puedeBloquear', () => {
  test('las misiones, el manual, collect y un goto objetivo bloquean; notas, flechas y condiciones no', () => {
    for (const el of [
      { t: 'accept', q: 1 }, { t: 'turnin', q: 1 }, { t: 'complete', q: 1, objetivo: 1 }, { t: 'manual', texto: T('x') },
      { t: 'collect', i: 1, n: 1 }, { t: 'goto', modo: 'objetivo' }, { t: 'xp', nivel: 5, efecto: 'objetivo' },
      { t: 'bankdeposit', is: [1] }, { t: 'fp' }, { t: 'zone', mapa: 1 }, { t: 'destroy', i: 1 },
    ]) assert.equal(puedeBloquear(el), true, JSON.stringify(el));
    for (const el of [
      nota('x'), flecha, { t: 'goto', modo: 'paso' }, { t: 'target', npcs: [] }, { t: 'use', is: [1], texto: T('x') },
      { t: 'isOnQuest', qs: [1] }, { t: 'itemcount', is: [1], op: '>=', n: 1, efecto: 'saltar_si_no_alcanzado' },
      { t: 'xp', nivel: 5, efecto: 'saltar_si_alcanzado' }, { t: 'complete', q: 1, objetivo: 1, info: true },
      { t: 'xpto60', texto: T('x') }, { t: 'accept', q: 1, sinCasilla: true }, { t: 'aura', spell: 1, efecto: 'saltar_si_alcanzado' },
    ]) assert.equal(puedeBloquear(el), false, JSON.stringify(el));
  });

  test('bankwithdraw: con texto bloquea (el addon mira las bolsas); sin texto, solo informa', () => {
    assert.equal(puedeBloquear({ t: 'bankwithdraw', is: [1], texto: T('Retira:') }), true);
    assert.equal(puedeBloquear({ t: 'bankwithdraw', is: [1] }), false);
  });
});

describe('sinBloqueo', () => {
  test('false si hay un elemento que bloquea, si no hay texto propio o si el paso es pegajoso', () => {
    assert.equal(sinBloqueo(paso([flecha, nota('Habla con X'), { t: 'accept', q: 1 }])), false);
    assert.equal(sinBloqueo(paso([flecha])), false, 'el recorrido no es texto propio: RestedXP tampoco pide casilla');
    assert.equal(sinBloqueo(paso([{ ...flecha, texto: T('Corre al puente') }])), false, 'tampoco el texto de un goto');
    assert.equal(sinBloqueo(paso([nota('x')], { etiquetas: { sticky: true } })), false);
    assert.equal(sinBloqueo(paso([nota('x')], { etiquetas: { completewith: 'next' } })), false);
    assert.equal(sinBloqueo(paso([nota('x')], { filtro: false })), false);
  });

  test('da para quién se completaría solo: todos, o los que no ven el elemento que bloquea', () => {
    assert.equal(sinBloqueo(paso([flecha, nota('Habla con X')])), true);
    const parcial = paso([nota('Habla con Newton'), { t: 'bankwithdraw', is: [1], texto: T('Retira:'), filtro: [['r:Gnome']] }]);
    assert.deepEqual(sinBloqueo(parcial), [['!r:Gnome']]);
    // Los dos lados de un filtro cubren a todos.
    const completo = paso([nota('x'), { t: 'accept', q: 1, filtro: [['c:WARLOCK']] }, { t: 'accept', q: 2, filtro: [['!c:WARLOCK']] }]);
    assert.equal(sinBloqueo(completo), false);
    // El filtro del paso cuenta: si solo es para brujos, basta el elemento de los brujos.
    assert.equal(sinBloqueo(paso([nota('x'), { t: 'accept', q: 1, filtro: [['c:WARLOCK']] }], { filtro: [['c:WARLOCK']] })), false);
    // Pegajoso solo para unos: el resto sí lo necesita.
    const porFiltro = paso([nota('x')], { etiquetasPorFiltro: [{ nombre: 'sticky', valor: true, filtro: [['c:MAGE']] }] });
    assert.deepEqual(sinBloqueo(porFiltro), [['!c:MAGE']]);
    // Un personaje tiene una sola raza: «r:Human y r:Gnome» no existe.
    assert.equal(sinBloqueo(paso([nota('x', { filtro: [['r:Human']] }), { t: 'accept', q: 1, filtro: [['r:Human']] }])), false);
  });
});

describe('asegurarCasilla', () => {
  test('sin nada que bloquee, la nota con texto pasa a manual con el mismo texto (sin elementos nuevos)', () => {
    const p = paso([flecha, nota('Habla con Dazalar'), { t: 'target', npcs: [{ nombre: 'Dazalar' }], linea: 3 }]);
    assert.equal(asegurarCasilla(p), 1);
    assert.deepEqual(p.elementos.map((e) => e.t), ['goto', 'manual', 'target']);
    assert.deepEqual(p.elementos[1], { t: 'manual', texto: T('Habla con Dazalar'), linea: 1 });
    assert.equal(sinBloqueo(p), false);
    assert.equal(asegurarCasilla(p), 0, 'ya no hace falta');
  });

  test('con un bloqueo parcial, la nota se queda para los cubiertos y la casilla es para los demás', () => {
    const banco = { t: 'bankwithdraw', is: [730], texto: T('Retira:'), filtro: [['r:Gnome']], linea: 2 };
    const p = paso([flecha, nota('Habla con Newton'), banco]);
    assert.equal(asegurarCasilla(p), 1);
    assert.deepEqual(p.elementos.map((e) => e.t), ['goto', 'nota', 'manual', 'bankwithdraw']);
    assert.deepEqual(p.elementos[1].filtro, [['r:Gnome']]);
    assert.deepEqual(p.elementos[2], { t: 'manual', texto: T('Habla con Newton'), linea: 1, filtro: [['!r:Gnome']] });
    assert.equal(sinBloqueo(p), false);
  });

  test('una nota con filtro conserva su filtro en la casilla; otra nota cubre al resto', () => {
    const p = paso([nota('Para magos', { filtro: [['c:MAGE']] }), nota('Para todos')]);
    assert.equal(asegurarCasilla(p), 2);
    assert.deepEqual(p.elementos.map((e) => [e.t, e.filtro]), [
      ['manual', [['c:MAGE']]],
      ['nota', [['c:MAGE']]],
      ['manual', [['!c:MAGE']]],
    ]);
    assert.equal(sinBloqueo(p), false);
  });

  test('si el texto es de otro elemento (xpto60), la casilla va detrás con ese texto y él se queda sin texto', () => {
    const p = paso([flecha, { t: 'xpto60', texto: T('Farmea hasta el 60'), linea: 2 }]);
    assert.equal(asegurarCasilla(p), 1);
    assert.deepEqual(p.elementos.map((e) => e.t), ['goto', 'xpto60', 'manual']);
    assert.equal(p.elementos[1].texto, undefined);
    assert.deepEqual(p.elementos[2], { t: 'manual', texto: T('Farmea hasta el 60'), linea: 2 });
  });

  // Con los datos reales salían filtros imposibles o redundantes: un personaje tiene una clase y una raza.
  test('entregas para las nueve clases cubren a todos: sin casilla', () => {
    const CLASES = ['WARRIOR', 'SHAMAN', 'PALADIN', 'DRUID', 'PRIEST', 'ROGUE', 'HUNTER', 'MAGE', 'WARLOCK'];
    const p = paso([flecha, nota('Habla con X'), ...CLASES.map((c, i) => ({ t: 'turnin', q: i + 1, filtro: [[`c:${c}`]] }))]);
    assert.equal(sinBloqueo(p), false);
    assert.equal(asegurarCasilla(p), 0);
  });

  test('los filtros nuevos quitan lo que ya pide el paso y lo que implica la clase', () => {
    // Paso de pícaros con entregas para orcos y trols pícaros: la casilla es para los pícaros de otra raza.
    const p = paso([flecha, nota('Entrega'), { t: 'turnin', q: 1, filtro: [['r:Troll', 'c:ROGUE']] },
      { t: 'turnin', q: 2, filtro: [['r:Orc', 'c:ROGUE']] }], { filtro: [['c:ROGUE']] });
    assert.equal(asegurarCasilla(p), 1);
    assert.deepEqual(p.elementos[1].filtro, [['r:Troll'], ['r:Orc']]);
    assert.deepEqual(p.elementos[2].filtro, [['!r:Troll', '!r:Orc']]);
    // Un vendedor para todos menos los cazadores: la casilla es solo de los cazadores.
    const q = paso([flecha, nota('Compra'), { t: 'vendor', filtro: [['!c:HUNTER']] },
      { t: 'collect', i: 1, n: 1, filtro: [['c:SHAMAN'], ['c:DRUID']] }]);
    assert.equal(asegurarCasilla(q), 1);
    assert.deepEqual(q.elementos[2].filtro, [['c:HUNTER']]);
  });

  test('no toca los pasos que ya bloquean, los pegajosos ni los de solo recorrido', () => {
    for (const p of [
      paso([nota('x'), { t: 'accept', q: 1 }]),
      paso([nota('x')], { etiquetas: { sticky: true } }),
      paso([flecha, { ...flecha, modo: 'paso', radio: 20 }]),
    ]) {
      const antes = JSON.stringify(p);
      assert.equal(asegurarCasilla(p), 0);
      assert.equal(JSON.stringify(p), antes);
    }
  });
});
