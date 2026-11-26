// Las condiciones «<<» de RestedXP pasadas a clase / raza / faccion / sin_clase / sin_raza (src/condiciones.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar, universo, conjuntoDe, camposDeConjunto, camposEnEspanol, cumpleCampos, claveDe } from '../src/condiciones.js';

const HORDA = universo('Horde');
const TODOS = universo();
const campos = (texto, u = TODOS) => camposDeConjunto(conjuntoDe(analizar(texto), u), u);

test('analizar: alternativas con «/», términos Y con espacios, «!» niega; lo que no es del personaje se marca', () => {
  const a = analizar('Orc Rogue/!Human');
  assert.equal(a.otros, false);
  assert.equal(a.dePersonaje, true);
  assert.deepEqual(a.grupos.map((g) => g.terminos), [
    [{ tipo: 'r', valor: 'Orc', negado: false }, { tipo: 'c', valor: 'ROGUE', negado: false }],
    [{ tipo: 'r', valor: 'Human', negado: true }],
  ]);
  assert.deepEqual(analizar('Undead').grupos[0].terminos, [{ tipo: 'r', valor: 'Scourge', negado: false }]);
  assert.deepEqual(analizar('Blood Elf !Warrior').grupos[0].terminos[0], { tipo: 'r', valor: null, negado: false });
  const v = analizar('Warrior tbc/Mage');
  assert.equal(v.otros, true);
  assert.deepEqual(v.grupos.map((g) => [g.terminos.map((x) => x.valor), g.otras]), [[['WARRIOR'], ['tbc']], [['MAGE'], []]]);
  for (const t of ['tbc', 'skip', 'sod', '!sod', '!classic', 'era', 'fRogue', '(Warrior)', '']) {
    assert.equal(analizar(t).otros, true, t);
  }
});

// Ronda 2 (decisión 2): las negaciones de expansiones posteriores (!tbc, !wotlk…) se cumplen siempre en Forever.
test('analizar: !tbc y !wotlk valen siempre (se quitan); tbc, sod, !sod, skip y era siguen siendo de otra cosa', () => {
  const a = analizar('!tbc !wotlk');
  assert.equal(a.otros, false);
  assert.equal(a.dePersonaje, false);
  assert.equal(conjuntoDe(a, HORDA).size, HORDA.length, 'en la cabecera: el paso entra para todos');
  assert.deepEqual(campos('Rogue !wotlk'), [{ clase: ['ROGUE'] }]);
  assert.deepEqual(campos('Mage/!tbc', HORDA), [{}]);
  assert.deepEqual(analizar('Rogue tbc').grupos[0].otras, ['tbc']);
});

// Ronda 2 (I1): en una línea, una palabra que no es del personaje se salta y la clase o la raza se quedan.
const camposLinea = (texto, u = HORDA) => {
  const c = conjuntoDe(analizar(texto), u, 'linea');
  return c === null ? null : camposDeConjunto(c, u);
};
test('conjuntoDe en una línea: «Warrior sod» y «Warrior/tbc» son de guerreros; «sod» solo, de nadie en concreto', () => {
  assert.deepEqual(camposLinea('Warrior sod'), [{ clase: ['WARRIOR'] }]);
  assert.deepEqual(camposLinea('Warrior/tbc'), [{ clase: ['WARRIOR'] }]);
  assert.equal(camposLinea('sod'), null, 'sin nada del personaje: la línea va con lo común, como antes');
  assert.equal(camposLinea('skip/tbc'), null);
  assert.deepEqual(camposLinea('Mage/!tbc'), [{}]);
});

// Ronda 2 (M4): RestedXP enumera las razas clásicas de una facción; en Forever esa facción tiene además Goblin y Skyborne.
test('conjuntoDe: todas las razas clásicas de una facción son la facción entera (con Goblin y Skyborne)', () => {
  assert.deepEqual(campos('Orc/Troll/Undead/Tauren', HORDA), [{}]);
  assert.deepEqual(campos('Orc/Troll/Undead/Tauren'), [{ faccion: ['Horde'] }]);
  assert.deepEqual(campos('Human Warrior/Dwarf Warrior/NightElf Warrior/Gnome Warrior'), [{ clase: ['WARRIOR'], faccion: ['Alliance'] }]);
  assert.deepEqual(campos('Orc/Troll', HORDA), [{ raza: ['Orc', 'Troll'] }]);
  assert.deepEqual(campos('!Orc', HORDA), [{ sin_raza: ['Orc'] }]);
  // Ronda 3 (m4): si la condición nombra Goblin o Skyborne, no se amplía (los quitó o los puso a propósito).
  assert.deepEqual(campos('!Goblin', HORDA), [{ sin_raza: ['Goblin'] }]);
  assert.deepEqual(campos('!Skyborne', HORDA), [{ sin_raza: ['Skyborne'] }]);
  assert.deepEqual(campos('Orc/Troll/Undead/Tauren/Skyborne', HORDA), [{ sin_raza: ['Goblin'] }]);
});

test('camposDeConjunto: un término, una lista O, Y entre clase y raza y las negaciones', () => {
  assert.deepEqual(campos('Warrior'), [{ clase: ['WARRIOR'] }]);
  assert.deepEqual(campos('Mage/Warlock'), [{ clase: ['MAGE', 'WARLOCK'] }]);
  assert.deepEqual(campos('Human Warrior'), [{ clase: ['WARRIOR'], raza: ['Human'] }]);
  assert.deepEqual(campos('Orc Rogue/Troll Rogue'), [{ clase: ['ROGUE'], raza: ['Orc', 'Troll'] }]);
  assert.deepEqual(campos('!Human'), [{ sin_raza: ['Human'] }]);
  assert.deepEqual(campos('!Warrior !Rogue'), [{ sin_clase: ['WARRIOR', 'ROGUE'] }]);
  assert.deepEqual(campos('Horde'), [{ faccion: ['Horde'] }]);
  assert.deepEqual(campos('!Alliance'), [{ faccion: ['Horde'] }]);
  assert.deepEqual(campos('Alliance Warrior'), [{ clase: ['WARRIOR'], faccion: ['Alliance'] }]);
  assert.deepEqual(campos('Orc'), [{ raza: ['Orc'] }], 'la raza ya dice la facción');
  assert.deepEqual(campos('Skyborne Horde'), [{ raza: ['Skyborne'], faccion: ['Horde'] }]);
});

test('camposDeConjunto: dentro de una guía de la Horda, lo de la Alianza no sale y la Horda vale para todos', () => {
  assert.deepEqual(campos('Alliance', HORDA), []);
  assert.deepEqual(campos('Human Warrior', HORDA), []);
  assert.deepEqual(campos('BloodElf', HORDA), []);
  assert.deepEqual(campos('Horde', HORDA), [{}]);
  assert.deepEqual(campos('!BloodElf', HORDA), [{}]);
  assert.deepEqual(campos('!Troll', HORDA), [{ sin_raza: ['Troll'] }]);
});

test('camposDeConjunto: lo que no cabe en un paso sale en varios que no se pisan', () => {
  assert.deepEqual(campos('Tauren/Hunter', HORDA), [{ clase: ['HUNTER'] }, { sin_clase: ['HUNTER'], raza: ['Tauren'] }]);
});

// Prueba de fuerza bruta: para muchas condiciones al azar, cada personaje cumple como mucho uno de los pasos, y uno justo
// cuando cumple la condición.
test('camposDeConjunto: los trozos no se pisan y juntos dan justo la condición (al azar)', () => {
  const palabras = ['Warrior', 'Mage', 'Rogue', 'Hunter', 'Druid', 'Human', 'Orc', 'Troll', 'NightElf', 'Undead', 'Tauren', 'Gnome',
    'Skyborne', 'Goblin', 'Horde', 'Alliance', 'Shaman', 'Paladin'];
  let semilla = 7;
  const azar = (n) => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla % n;
  };
  for (let k = 0; k < 400; k++) {
    const alternativas = Array.from({ length: 1 + azar(3) }, () => Array.from({ length: 1 + azar(3) },
      () => (azar(3) === 0 ? '!' : '') + palabras[azar(palabras.length)]).join(' '));
    const texto = alternativas.join('/');
    for (const u of [TODOS, HORDA, universo('Alliance')]) {
      const conjunto = conjuntoDe(analizar(texto), u);
      const pasos = camposDeConjunto(conjunto, u);
      for (const pj of u) {
        const cumplen = pasos.filter((c) => cumpleCampos(c, pj)).length;
        assert.equal(cumplen, conjunto.has(claveDe(pj)) ? 1 : 0, `${texto} / ${claveDe(pj)}`);
      }
    }
  }
});

test('camposEnEspanol: los nombres que escribe el conversor', () => {
  assert.deepEqual(camposEnEspanol({ clase: ['ROGUE', 'SHAMAN'], raza: ['Scourge', 'NightElf'], faccion: ['Horde'], sin_clase: ['PALADIN'], sin_raza: ['Troll'] }), {
    clase: ['Pícaro', 'Chamán'], raza: ['No-muerto', 'Elfo de la noche'], faccion: ['Horda'], sin_clase: ['Paladín'], sin_raza: ['Trol'],
  });
});
