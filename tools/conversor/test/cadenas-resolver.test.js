// Pruebas del resolvedor de cadenas de clase (decisión R1): modo A por enlaces de la base y modo B por
// nombres más PNJ. El resolvedor nunca adivina: si la base no basta, falla con un motivo.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { vistaDePrueba } from './ayuda/vista.js';
import { universoDeClase, resolverVariante } from '../src/cadenas/resolver.js';
import { crearVista } from '../src/questie/vista.js';
import { leerEntidades } from '../src/questie/entidades.js';
import { leerCorrecciones } from '../src/questie/correcciones.js';
import { cargarZonas } from '../src/questie/zonas.js';
import { rutaQuestieToc } from '../src/config.js';

// Misión de druida tauren por defecto (por zoneOrSort), que da y recoge el PNJ 1.
const m = (name, extra = {}) => ({
  name, zoneOrSort: -263, requiredLevel: 10, requiredClasses: 0, requiredRaces: 32,
  startedBy: [[1]], finishedBy: [[1]], ...extra,
});
const vista = (misiones) => vistaDePrueba({ misiones, faccion: 'Horde', clase: 'DRUID' });
const ids = (r) => r.misiones.map((x) => x.q);
const origenes = (r) => r.misiones.map((x) => x.origen);
const tauren = (v, opciones) => resolverVariante(v, { clase: 'DRUID', raza: 'Tauren', ...opciones });

describe('universoDeClase', () => {
  test('por zoneOrSort o por requiredClasses exacto, y requiredLevel ≤ 59', () => {
    const v = vista({
      1: m('Por orden'),
      2: m('Por clase', { zoneOrSort: 12, requiredClasses: 1024 }),
      3: m('Otra clase', { zoneOrSort: 12, requiredClasses: 1024 + 4 }),
      4: m('Nivel 60', { requiredLevel: 60 }),
      5: m('Nivel 59', { requiredLevel: 59 }),
      6: m('Ajena', { zoneOrSort: -261 }),
      7: m('REUSE ME'),
    });
    assert.deepEqual([...universoDeClase(v, 'DRUID').keys()].sort((a, b) => a - b), [1, 2, 5]);
    assert.equal(universoDeClase(v, 'DRUID').get(1).name, 'Por orden');
  });
});

describe('modo A: por enlaces de la base', () => {
  test('lineal 1→2→3', () => {
    const r = tauren(vista({
      1: m('A', { nextQuestInChain: 2 }),
      2: m('B', { preQuestSingle: [1] }),
      3: m('C', { preQuestSingle: [2] }),
    }), { inicio: 'A', fin: 'C' });
    assert.equal(r.ok, true, r.motivo);
    assert.equal(r.raza, 'Tauren');
    assert.deepEqual(ids(r), [1, 2, 3]);
    assert.deepEqual(origenes(r), ['inicio', 'base', 'base']);
    assert.deepEqual(r.migas, []);
  });

  test('las migas que llevan al inicio salen en migas y no en misiones', () => {
    const r = tauren(vista({
      10: m('Miga', { breadcrumbForQuestId: 1, nextQuestInChain: 1 }),
      11: m('Miga', { breadcrumbForQuestId: 1, nextQuestInChain: 1 }),
      1: m('A', { nextQuestInChain: 2, breadcrumbs: [10, 11] }),
      2: m('B', { preQuestSingle: [1] }),
      3: m('C', { preQuestSingle: [2] }),
    }), { inicio: 'A', fin: 'C' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [1, 2, 3]);
    assert.deepEqual(r.migas, [10, 11]);
  });

  test('con «A, A, A» y fin igual a inicio, corta tras la última', () => {
    const r = tauren(vista({
      1: m('A'),
      2: m('A', { preQuestSingle: [1] }),
      3: m('A', { preQuestSingle: [2] }),
      4: m('Otra', { preQuestSingle: [3] }),
    }), { inicio: 'A', fin: 'A' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [1, 2, 3]);
  });

  test('una bifurcación sin haber visto el fin falla con «bifurca» y las dos IDs', () => {
    const r = tauren(vista({
      1: m('A'),
      2: m('B', { preQuestSingle: [1] }),
      3: m('C', { preQuestSingle: [1] }),
    }), { inicio: 'A', fin: 'Z' });
    assert.equal(r.ok, false);
    assert.equal(r.raza, 'Tauren');
    assert.match(r.motivo, /bifurca/);
    assert.match(r.motivo, /\b2\b/);
    assert.match(r.motivo, /\b3\b/);
    assert.match(r.motivo, /Tauren/);
  });

  test('una bifurcación tras haber visto el fin para el recorrido', () => {
    const r = tauren(vista({
      1: m('A'),
      2: m('B', { preQuestSingle: [1] }),
      3: m('C', { preQuestSingle: [2] }),
      4: m('D', { preQuestSingle: [2] }),
    }), { inicio: 'A', fin: 'B' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [1, 2]);
  });

  test('2 y 3 que se unen en 4 (preQuestGroup [2, 3]) dan [1, 2, 3, 4]', () => {
    const r = tauren(vista({
      1: m('A'),
      3: m('C', { preQuestSingle: [1] }),
      2: m('B', { preQuestSingle: [1] }),
      4: m('D', { preQuestGroup: [2, 3] }),
    }), { inicio: 'A', fin: 'D' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [1, 2, 3, 4]);
    assert.deepEqual(origenes(r), ['inicio', 'base', 'base', 'base']);
  });

  test('si el sucesor común no pide a todos en preQuestGroup, es una bifurcación', () => {
    const r = tauren(vista({
      1: m('A'),
      2: m('B', { preQuestSingle: [1] }),
      3: m('C', { preQuestSingle: [1] }),
      4: m('D', { preQuestSingle: [2, 3] }),
    }), { inicio: 'A', fin: 'D' });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /bifurca/);
  });

  test('dos inicios dan «inicio ambiguo»; desempate elige', () => {
    const misiones = {
      1: m('A', { nextQuestInChain: 2 }),
      2: m('Z', { preQuestSingle: [1] }),
      90001: m('A', { nextQuestInChain: 90002 }),
      90002: m('Z', { preQuestSingle: [90001] }),
    };
    const sin = tauren(vista(misiones), { inicio: 'A', fin: 'Z' });
    assert.equal(sin.ok, false);
    assert.match(sin.motivo, /inicio ambiguo/);
    assert.match(sin.motivo, /\b1\b/);
    assert.match(sin.motivo, /90001/);
    const forever = tauren(vista(misiones), { inicio: 'A', fin: 'Z', desempate: 'forever' });
    assert.equal(forever.ok, true, forever.motivo);
    assert.deepEqual(ids(forever), [90001, 90002]);
    const classic = tauren(vista(misiones), { inicio: 'A', fin: 'Z', desempate: 'classic' });
    assert.equal(classic.ok, true, classic.motivo);
    assert.deepEqual(ids(classic), [1, 2]);
  });

  test('de dos inicios con el mismo nombre, gana el único que llega al fin (y el otro no es miga)', () => {
    const r = tauren(vista({
      1: m('A'),
      2: m('A', { nextQuestInChain: 3 }),
      3: m('Z', { preQuestSingle: [2] }),
    }), { inicio: 'A', fin: 'Z' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [2, 3]);
    assert.deepEqual(r.migas, []);
  });

  test('si los dos inicios llegan al fin, sigue «inicio ambiguo» sin desempate', () => {
    const r = tauren(vista({
      1: m('A', { nextQuestInChain: 3 }),
      3: m('Z', { preQuestSingle: [1] }),
      2: m('A', { nextQuestInChain: 4 }),
      4: m('Z', { preQuestSingle: [2] }),
    }), { inicio: 'A', fin: 'Z' });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /inicio ambiguo/);
    assert.match(r.motivo, /\b1\b/);
    assert.match(r.motivo, /\b2\b/);
  });

  test('si ningún inicio llega al fin, sale el motivo de siempre', () => {
    const v = vista({ 1: m('A'), 2: m('A'), 3: m('B', { preQuestSingle: [1] }) });
    assert.match(tauren(v, { inicio: 'A', fin: 'Z' }).motivo, /inicio ambiguo/);
    assert.match(tauren(v, { inicio: 'A', fin: 'Z', desempate: 'classic' }).motivo, /inicio ambiguo/);
    const uno = tauren(vista({ 1: m('A'), 3: m('B', { preQuestSingle: [1] }) }), { inicio: 'A', fin: 'Z' });
    assert.match(uno.motivo, /no llega a "Z"/);
  });

  test('un inicio que bifurca antes del fin no se descarta: con otro que llega, «inicio ambiguo»', () => {
    const r = tauren(vista({
      1: m('A'),
      2: m('B', { preQuestSingle: [1] }),
      3: m('C', { preQuestSingle: [1] }),
      4: m('A', { nextQuestInChain: 5 }),
      5: m('Z', { preQuestSingle: [4] }),
    }), { inicio: 'A', fin: 'Z' });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /inicio ambiguo/);
    assert.match(r.motivo, /\(1\)/);
    assert.match(r.motivo, /\(4\)/);
  });

  test('un inicio con bucle tampoco se descarta', () => {
    const r = tauren(vista({
      1: m('A', { nextQuestInChain: 2 }),
      2: m('B', { nextQuestInChain: 1 }),
      4: m('A', { nextQuestInChain: 5 }),
      5: m('Z', { preQuestSingle: [4] }),
    }), { inicio: 'A', fin: 'Z' });
    assert.match(r.motivo, /inicio ambiguo/);
  });

  test('el desempate se aplica tras el descarte: de dos que llegan, gana el del desempate', () => {
    const r = tauren(vista({
      1: m('A'),
      2: m('A', { nextQuestInChain: 3 }),
      3: m('Z', { preQuestSingle: [2] }),
      90001: m('A', { nextQuestInChain: 90002 }),
      90002: m('Z', { preQuestSingle: [90001] }),
    }), { inicio: 'A', fin: 'Z', desempate: 'forever' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [90001, 90002]);
  });

  test('si el desempate deja 0 inicios, «inicio ambiguo» y lo dice', () => {
    const r = tauren(vista({
      1: m('A', { nextQuestInChain: 3 }),
      3: m('Z', { preQuestSingle: [1] }),
      2: m('A', { nextQuestInChain: 4 }),
      4: m('Z', { preQuestSingle: [2] }),
    }), { inicio: 'A', fin: 'Z', desempate: 'forever' });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /inicio ambiguo/);
    assert.match(r.motivo, /desempate "forever" quedan 0/);
  });

  test('un desempate desconocido lanza siempre, también con un solo candidato', () => {
    const v = vista({ 1: m('A', { nextQuestInChain: 2 }), 2: m('Z', { preQuestSingle: [1] }) });
    assert.throws(() => tauren(v, { inicio: 'A', fin: 'Z', desempate: 'nuevo' }), /desempate desconocido/);
    assert.throws(() => tauren(v, { pasos: ['A', 'Z'], desempate: 'nuevo' }), /desempate desconocido/);
  });

  test('si la raza no aplica, «no encuentro»', () => {
    const r = resolverVariante(vista({ 1: m('A'), 2: m('B', { preQuestSingle: [1] }) }), {
      clase: 'DRUID', raza: 'Orc', inicio: 'A', fin: 'B',
    });
    assert.equal(r.ok, false);
    assert.equal(r.raza, 'Orc');
    assert.match(r.motivo, /no encuentro/);
    assert.match(r.motivo, /Orc/);
    assert.match(r.motivo, /"A"/);
  });

  test('sin el fin en el recorrido, «no llega a»', () => {
    const r = tauren(vista({ 1: m('A'), 2: m('B', { preQuestSingle: [1] }) }), { inicio: 'A', fin: 'Z' });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /no llega a "Z"/);
  });

  test('un ciclo da «bucle»', () => {
    const r = tauren(vista({
      1: m('A', { nextQuestInChain: 2 }),
      2: m('B', { nextQuestInChain: 1 }),
    }), { inicio: 'A', fin: 'Z' });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /bucle/);
  });

  test('una previa externa 500 sale en previas (una) y las de grupo en todas', () => {
    const r = tauren(vista({
      1: m('A', { preQuestSingle: [500] }),
      2: m('B', { preQuestSingle: [1], preQuestGroup: [600, 601] }),
    }), { inicio: 'A', fin: 'B' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(r.previas.get(1), { una: [500], todas: [] });
    assert.deepEqual(r.previas.get(2), { una: [], todas: [600, 601] });
  });

  // Lote H: preQuestSingle vale con una cualquiera. QuestieDB 1.0.14 pone a «Stepping Stones» (saco) las dos «... and
  // that note you found» (la de la Horda y la de la Alianza): la de la cadena ya basta, y pedir la otra (la de la otra
  // facción) dejaba la guía parada (el addon salta el paso si no se ha entregado ninguna de las del isQuestTurnedIn).
  test('una previa «una» que ya está en la cadena basta: las demás de esa lista no se piden', () => {
    const r = tauren(vista({
      1: m('A', { nextQuestInChain: 2 }),
      2: m('B', { preQuestSingle: [1, 700] }),
    }), { inicio: 'A', fin: 'B' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(r.previas.get(2), { una: [], todas: [] });
  });
});

// Ruling F3-3: una cadena que se para antes de otra misión con el nombre de `fin` que la sigue está cortada.
describe('modo A: cadena cortada (F3-3)', () => {
  test('una lateral tras el fin para el recorrido, pero si sigue otra con el nombre del fin, «cortada»', () => {
    const r = tauren(vista({
      1: m('A', { nextQuestInChain: 2 }),
      2: m('A', { preQuestSingle: [1], nextQuestInChain: 3 }),
      3: m('A', { preQuestSingle: [2] }),
      4: m('Lateral', { preQuestSingle: [2] }),
    }), { inicio: 'A', fin: 'A' });
    assert.equal(r.ok, false);
    assert.equal(r.raza, 'Tauren');
    assert.match(r.motivo, /cortada/);
    assert.match(r.motivo, /Tauren/);
    assert.match(r.motivo, /"A" \(2\)/);
    assert.match(r.motivo, /"A" \(3\)/);
  });

  test('«cortada» también si el otro fin no es la sucesora directa: fin → Y → {lateral, Z → fin}', () => {
    const r = tauren(vista({
      1: m('S'),
      2: m('F', { preQuestSingle: [1] }),
      3: m('Y', { preQuestSingle: [2] }),
      4: m('Lateral', { preQuestSingle: [3] }),
      5: m('Z', { preQuestSingle: [3] }),
      6: m('F', { preQuestSingle: [5] }),
    }), { inicio: 'S', fin: 'F' });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /cortada/);
    assert.match(r.motivo, /"F" \(2\)/);
    assert.match(r.motivo, /"F" \(6\)/);
  });

  test('si lo que sigue tras el fin se llama distinto, no está cortada', () => {
    const r = tauren(vista({
      1: m('A'),
      2: m('B', { preQuestSingle: [1] }),
      3: m('C', { preQuestSingle: [2] }),
      4: m('D', { preQuestSingle: [2] }),
    }), { inicio: 'A', fin: 'B' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [1, 2]);
  });
});

describe('modo B: por nombres y PNJ', () => {
  // La felina tauren con sus IDs y PNJ reales: 3033 → 11802 → 11957 → 11957 → 11802 → 3033, sin enlaces.
  const felina = {
    98340: m('The Great Cat Spirit', { requiredLevel: 20, startedBy: [[3033]], finishedBy: [[11802]] }),
    98405: m('The Great Cat Spirit', { requiredLevel: 20, startedBy: [[11802]], finishedBy: [[11957]] }),
    98342: m('The Great Cat Spirit', { requiredLevel: 20, startedBy: [[11957]], finishedBy: [[11957]] }),
    98739: m('Blessings of the Great Cat Spirit', { requiredLevel: 20, startedBy: [[11957]], finishedBy: [[11802]] }),
    98362: m('To Thunder Bluff', { requiredLevel: 20, startedBy: [[11802]], finishedBy: [[3033]] }),
  };
  const pasosFelina = ['The Great Cat Spirit', 'The Great Cat Spirit', 'The Great Cat Spirit',
    'Blessings of the Great Cat Spirit', 'To Thunder Bluff'];

  // Lote H, ronda 1: `dador` (nombre del PNJ que da el primer paso, tomado de RestedXP) separa dos caminos que la base
  // deja igual de buenos: una miga sin marcar (la da otro PNJ) delante de la cadena.
  test('con `dador`, el primer paso tiene que darlo un PNJ con ese nombre', () => {
    const misiones = {
      10: m('Llamada', { startedBy: [[7]], finishedBy: [[1]] }),
      11: m('Llamada', { startedBy: [[1]], finishedBy: [[1]], nextQuestInChain: 12 }),
      12: m('Llamada', { startedBy: [[1]], finishedBy: [[1]] }),
    };
    const pnjs = { 1: { name: 'Sessaria' }, 7: { name: 'Swart' } };
    const v = vistaDePrueba({ misiones, pnjs, faccion: 'Horde', clase: 'DRUID' });
    const sin = tauren(v, { pasos: ['Llamada', 'Llamada'] });
    assert.equal(sin.ok, false);
    assert.match(sin.motivo, /ambigua/);
    const con = tauren(v, { pasos: ['Llamada', 'Llamada'], dador: 'Sessaria' });
    assert.equal(con.ok, true, con.motivo);
    assert.deepEqual(ids(con), [11, 12]);
    const nadie = tauren(v, { pasos: ['Llamada', 'Llamada'], dador: 'Nadie' });
    assert.equal(nadie.ok, false);
    assert.match(nadie.motivo, /Nadie/);
  });

  test('la felina tauren se une por PNJ', () => {
    const r = tauren(vista(felina), { pasos: pasosFelina });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [98340, 98405, 98342, 98739, 98362]);
    assert.deepEqual(origenes(r), ['inicio', 'pnj', 'pnj', 'pnj', 'pnj']);
  });

  test('un enlace de la base gana al PNJ y los objetos también unen (con su propio origen, «objeto»)', () => {
    // Lote «Cadenas de mejoras»: lo que une un objeto (donde se entrega una y empieza la siguiente) ya no sale como
    // «pnj», sino como «objeto».
    const r = tauren(vista({
      1: m('A', { finishedBy: [[7]] }),
      2: m('B', { startedBy: [[7]], preQuestSingle: [1], finishedBy: [[], [40]] }),
      3: m('C', { startedBy: [[], [40]] }),
    }), { pasos: ['A', 'B', 'C'] });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [1, 2, 3]);
    assert.deepEqual(origenes(r), ['inicio', 'base', 'objeto']);
  });

  test('dos caminos dan «ambigua»', () => {
    const r = tauren(vista({
      1: m('A', { finishedBy: [[200]] }),
      2: m('B', { startedBy: [[200]] }),
      3: m('B', { startedBy: [[200]] }),
    }), { pasos: ['A', 'B'] });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /ambigua/);
  });

  test('desempate vale para el primer paso', () => {
    const misiones = {
      1: m('A', { finishedBy: [[200]] }),
      90001: m('A', { finishedBy: [[200]] }),
      2: m('B', { startedBy: [[200]] }),
    };
    assert.match(tauren(vista(misiones), { pasos: ['A', 'B'] }).motivo, /ambigua/);
    const r = tauren(vista(misiones), { pasos: ['A', 'B'], desempate: 'forever' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [90001, 2]);
  });

  // Datos 2026.11.13: la QuestieDB nueva une la primera «Call of Fire» del Skyborne de la Horda (97243) con dos
  // segundas, la del Classic (1525) y la del Forever (97244). RestedXP sigue la del Forever.
  test('desempate también elige en los pasos siguientes, entre las que siguen a la anterior', () => {
    const misiones = {
      90001: m('A', { finishedBy: [[200]] }),
      2: m('B', { startedBy: [[200]] }),
      90002: m('B', { startedBy: [[200]] }),
    };
    assert.match(tauren(vista(misiones), { pasos: ['A', 'B'] }).motivo, /ambigua/);
    const r = tauren(vista(misiones), { pasos: ['A', 'B'], desempate: 'forever' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [90001, 90002]);
  });

  test('con desempate, la sucesora por enlace que descarta no cuenta como bifurcación', () => {
    const misiones = {
      90001: m('A', { nextQuestInChain: 90002 }),
      2: m('B', { preQuestSingle: [90001] }),
      90002: m('B', { preQuestSingle: [90001] }),
    };
    assert.match(tauren(vista(misiones), { pasos: ['A', 'B'] }).motivo, /ambigua|bifurca/);
    const r = tauren(vista(misiones), { pasos: ['A', 'B'], desempate: 'forever' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [90001, 90002]);
  });

  test('en los pasos siguientes, el desempate no corta si solo sigue una del otro lado', () => {
    const r = tauren(vista({
      90001: m('A', { finishedBy: [[200]] }),
      2: m('B', { startedBy: [[200]] }),
      90002: m('B', { startedBy: [[300]] }),
    }), { pasos: ['A', 'B'], desempate: 'forever' });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [90001, 2]);
  });

  test('si el desempate deja vacío el primer paso, lo dice y cita las descartadas', () => {
    const r = tauren(vista({
      1: m('A', { finishedBy: [[200]] }),
      3: m('A', { finishedBy: [[200]] }),
      2: m('B', { startedBy: [[200]] }),
    }), { pasos: ['A', 'B'], desempate: 'forever' });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /descartadas? por (el )?desempate "forever"/);
    assert.match(r.motivo, /\(1\)/);
    assert.match(r.motivo, /\(3\)/);
    assert.doesNotMatch(r.motivo, /no encuentro/);
  });

  test('con un hueco, «se corta en»', () => {
    const r = tauren(vista({
      1: m('A', { finishedBy: [[200]] }),
      2: m('B', { startedBy: [[300]] }),
    }), { pasos: ['A', 'B'] });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /se corta en "B"/);
    assert.match(r.motivo, /Tauren/);
    assert.match(r.motivo, /ninguna de "B" \(2\) sigue a "A" \(1\)/);
  });

  test('si ninguna misión se llama como el paso, la redacción lo dice sin «ninguna de ninguna»', () => {
    const r = tauren(vista({ 1: m('A', { finishedBy: [[200]] }) }), { pasos: ['A', 'B'] });
    assert.match(r.motivo, /se corta en "B"/);
    assert.match(r.motivo, /no hay ninguna misión llamada "B"/);
    assert.doesNotMatch(r.motivo, /ninguna de ninguna/);
  });

  test('previas externas y migas del primer paso', () => {
    const r = tauren(vista({
      9: m('Miga', { breadcrumbForQuestId: 1, finishedBy: [[200]] }),
      1: m('A', { finishedBy: [[200]], preQuestSingle: [500] }),
      2: m('B', { startedBy: [[200]] }),
    }), { pasos: ['A', 'B'] });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(r.migas, [9]);
    assert.deepEqual(r.previas.get(1), { una: [500], todas: [] });
  });

  // Ruling F3-2. Cadena 1→2→3 por enlaces, todas «A»; la última la recoge el PNJ 7, que da la primera.
  const rotable = {
    1: m('A', { startedBy: [[7]], finishedBy: [[8]] }),
    2: m('A', { startedBy: [[8]], finishedBy: [[9]], preQuestSingle: [1] }),
    3: m('A', { startedBy: [[9]], finishedBy: [[7]], preQuestSingle: [2] }),
  };

  test('F3-2 (1): la cadena rotada ya no sale; el primer paso no tiene previa por enlace con su nombre', () => {
    const r = tauren(vista(rotable), { pasos: ['A', 'A', 'A'] });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(ids(r), [1, 2, 3]);
    assert.deepEqual(origenes(r), ['inicio', 'base', 'base']);
  });

  test('F3-2 (1): si todas las del primer paso tienen previa con su nombre, «no encuentro» el inicio', () => {
    const r = tauren(vista({
      1: m('A', { preQuestSingle: [2], finishedBy: [[7]] }),
      2: m('A', { preQuestSingle: [1], startedBy: [[7]] }),
    }), { pasos: ['A', 'A'] });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /primer paso/);
    assert.match(r.motivo, /"A" \(1\)/);
  });

  test('F3-2 (2): una arista por PNJ no vale si la misión destino tiene previas por enlace', () => {
    // 1 → 3 por PNJ (el 7), pero 3 pide por enlace la 2: manda el enlace y la cadena no sale.
    const r = tauren(vista({
      1: m('A', { finishedBy: [[7]] }),
      2: m('X', { finishedBy: [[9]] }),
      3: m('B', { startedBy: [[7]], preQuestSingle: [2] }),
    }), { pasos: ['A', 'B'] });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /se corta en "B"/);
  });

  test('«bifurca» si una misión del camino tiene otra sucesora por enlace con el nombre del paso siguiente', () => {
    // 2 sigue a 1 por enlace y 3 también, las dos «B»; por nombres sale un único camino (1 → 2 → C) porque
    // 3 no lleva a ninguna «C», pero elegir 2 sería adivinar.
    const r = tauren(vista({
      1: m('A'),
      2: m('B', { preQuestSingle: [1] }),
      3: m('B', { preQuestSingle: [1] }),
      4: m('C', { preQuestSingle: [2] }),
    }), { pasos: ['A', 'B', 'C'] });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /bifurca/);
    assert.match(r.motivo, /"A" \(1\)/);
    assert.match(r.motivo, /"B" \(3\)/);
  });
});

const rutaToc = rutaQuestieToc();
const hay = existsSync(rutaToc);

describe('cadenas reales de QuestieDB', { skip: !hay }, () => {
  let hordaDruida; let alianzaDruida; let hordaCazador; let hordaChaman;
  before(() => {
    const dir = dirname(rutaToc);
    const fuentes = { entidades: leerEntidades(rutaToc), correcciones: leerCorrecciones(dir), zonas: cargarZonas(dir) };
    hordaDruida = crearVista(fuentes, { faccion: 'Horde', clase: 'DRUID' });
    alianzaDruida = crearVista(fuentes, { faccion: 'Alliance', clase: 'DRUID' });
    hordaCazador = crearVista(fuentes, { faccion: 'Horde', clase: 'HUNTER' });
    hordaChaman = crearVista(fuentes, { faccion: 'Horde', clase: 'SHAMAN' });
  });
  const resuelve = (v, variante) => {
    const r = resolverVariante(v, variante);
    assert.equal(r.ok, true, r.motivo);
    return r;
  };

  test('oso tauren', () => {
    const r = resuelve(hordaDruida, { clase: 'DRUID', raza: 'Tauren', inicio: 'Moonglade', fin: 'Body and Heart' });
    assert.deepEqual(ids(r), [5922, 5930, 5932, 6002]);
    assert.deepEqual(r.migas, [5926, 5927, 5928]);
  });
  test('oso elfo de la noche (Alianza)', () => {
    const r = resuelve(alianzaDruida, { clase: 'DRUID', raza: 'NightElf', inicio: 'Moonglade', fin: 'Body and Heart' });
    assert.deepEqual(ids(r), [5921, 5929, 5931, 6001]);
    assert.deepEqual(r.migas, [5923, 5924, 5925]);
  });
  test('oso Skyborne (Horda)', () => {
    const r = resuelve(hordaDruida, {
      clase: 'DRUID', raza: 'Skyborne', inicio: 'The Great Ursera Spirit', fin: 'Strength and Mercy',
    });
    assert.deepEqual(ids(r), [94006, 94638]);
  });
  // Lote H, ronda 1: RestedXP-Skyborne.lua:4051-4310 hace 97243 → 97244 → 97245 → 97257 desde Sessaria Skystride; la
  // 98517 (de Swart, «vuelve a Zephras») es una miga que la base no marca.
  test('fuego Skyborne (Horda), modo B desde Sessaria Skystride', () => {
    const r = resuelve(hordaChaman, {
      clase: 'SHAMAN', raza: 'Skyborne', pasos: ['Call of Fire', 'Call of Fire', 'Call of Fire', 'Call of Fire'],
      dador: 'Sessaria Skystride', desempate: 'forever',
    });
    assert.deepEqual(ids(r), [97243, 97244, 97245, 97257]);
  });
  test('acuática tauren', () => {
    const r = resuelve(hordaDruida, { clase: 'DRUID', raza: 'Tauren', inicio: 'A Lesson to Learn', fin: 'Aquatic Form' });
    assert.deepEqual(ids(r), [27, 28, 30, 31]);
  });
  test('veneno tauren', () => {
    const r = resuelve(hordaDruida, { clase: 'DRUID', raza: 'Tauren', inicio: 'Lessons Anew', fin: 'Power over Poison' });
    assert.deepEqual(ids(r), [6126, 6127, 6128, 6129, 6130]);
  });
  test('felina Skyborne (Horda), modo B', () => {
    const r = resuelve(hordaDruida, {
      clase: 'DRUID',
      raza: 'Skyborne',
      pasos: ['The Great Cat Spirit', 'The Great Windborne Cat Spirit', 'The Great Windborne Cat Spirit',
        'Blessings of the Great Windborne Cat Spirit', 'To Thunder Bluff'],
    });
    assert.deepEqual(ids(r), [98340, 98341, 98404, 98738, 98362]);
  });
  test('cazador tauren', () => {
    const r = resuelve(hordaCazador, { clase: 'HUNTER', raza: 'Tauren', inicio: 'Taming the Beast', fin: 'Training the Beast' });
    assert.deepEqual(ids(r), [6061, 6087, 6088, 6089]);
  });
  // La base tiene otra «Taming the Beast» sin enlaces (94007) que no llega a «Training the Beast»: queda
  // fuera por el Ruling F3-1 y no es una miga.
  test('cazador Skyborne', () => {
    const r = resuelve(hordaCazador, { clase: 'HUNTER', raza: 'Skyborne', inicio: 'Taming the Beast', fin: 'Training the Beast' });
    assert.ok(!r.migas.includes(94007));
    assert.deepEqual(ids(r), [94978, 94979, 94013, 94050]);
  });
});
