// Pruebas de la vista de la base de misiones por facción y clase.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vistaDePrueba } from './ayuda/vista.js';
import {
  crearVista, RAZAS_DE, BIT_RAZA, BIT_CLASE, ORDEN_CLASE,
} from '../src/questie/vista.js';
import { leerEntidades } from '../src/questie/entidades.js';
import { leerCorrecciones, BORRAR } from '../src/questie/correcciones.js';
import { cargarZonas } from '../src/questie/zonas.js';
import { rutaQuestieToc } from '../src/config.js';

describe('constantes de la vista', () => {
  test('razas por facción, bits y orden de clase', () => {
    assert.deepEqual(RAZAS_DE.Horde, ['Orc', 'Scourge', 'Tauren', 'Troll', 'Skyborne']);
    assert.deepEqual(RAZAS_DE.Alliance, ['Human', 'Dwarf', 'NightElf', 'Gnome', 'Skyborne']);
    assert.equal(BIT_RAZA.Skyborne.Alliance, 2 ** 32);
    assert.equal(BIT_RAZA.Skyborne.Horde, 2 ** 33);
    assert.equal(BIT_RAZA.Tauren, 32);
    assert.equal(BIT_CLASE.DRUID, 1024);
    assert.deepEqual(ORDEN_CLASE, {
      WARRIOR: -81, PALADIN: -141, HUNTER: -261, ROGUE: -162, PRIEST: -262, SHAMAN: -82, MAGE: -161, WARLOCK: -61, DRUID: -263,
    });
  });
});

describe('correcciones por facción y clase', () => {
  const misiones = { 7: { name: 'Una', nextQuestInChain: 5, requiredLevel: 3, questLevel: 4 } };
  const correcciones = {
    Horde: { quest: { 7: { nextQuestInChain: { porClase: { DRUID: 9 } }, questLevel: BORRAR } } },
  };

  test('porClase toma la clase de la vista y, si no hay, el valor base', () => {
    const druida = vistaDePrueba({ misiones, correcciones, faccion: 'Horde', clase: 'DRUID' });
    const guerrero = vistaDePrueba({ misiones, correcciones, faccion: 'Horde', clase: 'WARRIOR' });
    assert.equal(druida.mision(7).nextQuestInChain, 9);
    assert.equal(guerrero.mision(7).nextQuestInChain, 5);
  });

  test('porClase con valor null (o sin clase en la vista) deja el valor base', () => {
    const c = { Horde: { quest: { 7: { nextQuestInChain: { porClase: { DRUID: null } } } } } };
    assert.equal(vistaDePrueba({ misiones, correcciones: c, faccion: 'Horde', clase: 'DRUID' }).mision(7).nextQuestInChain, 5);
    assert.equal(vistaDePrueba({ misiones, correcciones, faccion: 'Horde' }).mision(7).nextQuestInChain, 5);
  });

  test('"__borrar" quita el campo', () => {
    const v = vistaDePrueba({ misiones, correcciones, faccion: 'Horde', clase: 'DRUID' });
    assert.ok(!('questLevel' in v.mision(7)));
    assert.equal(v.mision(7).requiredLevel, 3);
  });

  test('la corrección de una facción no se aplica a la otra', () => {
    const v = vistaDePrueba({ misiones, correcciones, faccion: 'Alliance', clase: 'DRUID' });
    assert.equal(v.mision(7).nextQuestInChain, 5);
    assert.equal(v.mision(7).questLevel, 4);
  });

  test('la entidad original no cambia', () => {
    const v = vistaDePrueba({ misiones, correcciones, faccion: 'Horde', clase: 'DRUID' });
    v.mision(7);
    assert.equal(misiones[7].nextQuestInChain, 5);
    assert.equal(misiones[7].questLevel, 4);
    assert.ok('questLevel' in misiones[7]);
  });

  test('memoriza por id y devuelve undefined si no existe', () => {
    const v = vistaDePrueba({ misiones, correcciones, faccion: 'Horde', clase: 'DRUID' });
    assert.equal(v.mision(7), v.mision(7));
    assert.equal(v.mision(999), undefined);
    assert.equal(v.pnj(999), undefined);
  });

  test('las correcciones de PNJ, objeto e ítem también se aplican', () => {
    const v = vistaDePrueba({
      pnjs: { 1: { name: 'A', subName: 'x' } },
      objetos: { 2: { name: 'O' } },
      items: { 3: { name: 'I', startQuest: 0 } },
      correcciones: { Alliance: { npc: { 1: { name: 'B' } }, object: { 2: { name: 'P' } }, item: { 3: { startQuest: 9 } } } },
      faccion: 'Alliance',
    });
    assert.equal(v.pnj(1).name, 'B');
    assert.equal(v.objeto(2).name, 'P');
    assert.equal(v.item(3).startQuest, 9);
  });
});

describe('misiones() sin basura', () => {
  test('omite las misiones basura, también tras la corrección', () => {
    const v = vistaDePrueba({
      misiones: { 1: { name: 'Buena' }, 2: { name: 'REUSE ME 2' }, 3: { name: 'Otra' } },
      correcciones: { Horde: { quest: { 3: { name: 'NYI: algo' } } } },
      faccion: 'Horde',
    });
    assert.deepEqual([...v.misiones()].map(([id]) => id), [1]);
  });
});

describe('máscaras de raza', () => {
  const misiones = {
    1: { name: 'Libre', requiredRaces: 0 },
    2: { name: 'Tauren', requiredRaces: 32 },
    3: { name: 'Orco y trol', requiredRaces: 2 + 128 },
    4: { name: 'Alianza', requiredRaces: 1 + 4 + 8 + 64 },
    5: { name: 'Mixta', requiredRaces: 1 + 2 },
    6: { name: 'Skyborne horda', requiredRaces: 2 ** 33 },
    7: { name: 'Skyborne alianza', requiredRaces: 2 ** 32 + 4 },
  };

  test('aplicaARaza con aritmética', () => {
    const h = vistaDePrueba({ misiones, faccion: 'Horde' });
    assert.equal(h.aplicaARaza(h.mision(2), 'Tauren'), true);
    assert.equal(h.aplicaARaza(h.mision(2), 'Orc'), false);
    assert.equal(h.aplicaARaza(h.mision(1), 'Orc'), true);
    assert.equal(h.aplicaARaza(h.mision(6), 'Skyborne'), true);
    const a = vistaDePrueba({ misiones, faccion: 'Alliance' });
    assert.equal(a.aplicaARaza(a.mision(6), 'Skyborne'), false);
    assert.equal(a.aplicaARaza(a.mision(7), 'Skyborne'), true);
    assert.equal(a.aplicaARaza(a.mision(7), 'Dwarf'), true);
  });

  test('faccionDe', () => {
    const v = vistaDePrueba({ misiones, faccion: 'Horde' });
    assert.equal(v.faccionDe(v.mision(1)), undefined);
    assert.equal(v.faccionDe(v.mision(2)), 'Horde');
    assert.equal(v.faccionDe(v.mision(3)), 'Horde');
    assert.equal(v.faccionDe(v.mision(4)), 'Alliance');
    assert.equal(v.faccionDe(v.mision(5)), undefined);
    assert.equal(v.faccionDe(v.mision(6)), 'Horde');
    assert.equal(v.faccionDe(v.mision(7)), 'Alliance');
  });
});

describe('puntoDe', () => {
  const v = vistaDePrueba({
    pnjs: {
      1: { name: 'Dos mapas', spawns: { 10: [[1, 1]], 20: [[2, 2], [3, 3]] } },
      2: { name: 'Empate', spawns: { 30: [[5, 5]], 25: [[6, 6]] } },
      3: { name: 'Mazmorra', spawns: { 40: [[-1, -1]] } },
      4: { name: 'Sin spawns' },
      5: { name: 'Mazmorra y mapa', spawns: { 40: [[-1, -1]], 50: [[7, 7]] } },
    },
    objetos: { 9: { name: 'Objeto', spawns: { 10: [[4.256, 8.1]] } } },
    faccion: 'Horde',
  });

  test('elige el mapa con más puntos y su primer punto', () => {
    assert.deepEqual(v.puntoDe({ tipo: 'npc', id: 1 }), { mapa: 20, x: 2, y: 2 });
  });
  test('en un empate, el menor uiMap', () => {
    assert.deepEqual(v.puntoDe({ tipo: 'npc', id: 2 }), { mapa: 25, x: 6, y: 6 });
  });
  test('sin puntos y con centinela, la mazmorra', () => {
    assert.deepEqual(v.puntoDe({ tipo: 'npc', id: 3 }), { mazmorra: 40 });
  });
  test('con puntos en un mapa y centinela, gana el punto', () => {
    assert.deepEqual(v.puntoDe({ tipo: 'npc', id: 5 }), { mapa: 50, x: 7, y: 7 });
  });
  test('sin nada, null; también para ids que no existen', () => {
    assert.equal(v.puntoDe({ tipo: 'npc', id: 4 }), null);
    assert.equal(v.puntoDe({ tipo: 'npc', id: 999 }), null);
  });
  test('objetos y redondeo a dos decimales', () => {
    assert.deepEqual(v.puntoDe({ tipo: 'object', id: 9 }), { mapa: 10, x: 4.26, y: 8.1 });
  });
  test('los spawns de la corrección pasan por convertirPuntos', () => {
    const c = vistaDePrueba({
      pnjs: { 1: { name: 'Sin puntos' } },
      correcciones: { Horde: { npc: { 1: { spawns: { 12: [[10, 20]] } } } } },
      faccion: 'Horde',
    });
    assert.deepEqual(c.puntoDe({ tipo: 'npc', id: 1 }), { mapa: 12, x: 10, y: 20 });
    const a = vistaDePrueba({
      pnjs: { 1: { name: 'Sin puntos' } },
      correcciones: { Horde: { npc: { 1: { spawns: { 12: [[10, 20]] } } } } },
      faccion: 'Alliance',
    });
    assert.equal(a.puntoDe({ tipo: 'npc', id: 1 }), null);
  });
});

describe('SALIDA relativa al repositorio', () => {
  test('sin variable de entorno termina en <repo>/addons', () => {
    const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const env = { ...process.env };
    delete env.SALIDA;
    const r = spawnSync(process.execPath, [
      '--input-type=module', '-e',
      "import('./src/config.js').then((m) => process.stdout.write(m.SALIDA))",
    ], { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'), env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(resolve(r.stdout), join(raiz, 'addons'));
  });
});

const rutaToc = rutaQuestieToc();
const hay = existsSync(rutaToc);

describe('vista real de QuestieDB', { skip: !hay }, () => {
  let entidades; let correcciones; let zonas; let horda; let alianza;
  before(() => {
    const dir = dirname(rutaToc);
    entidades = leerEntidades(rutaToc);
    correcciones = leerCorrecciones(dir);
    zonas = cargarZonas(dir);
    horda = crearVista({ entidades, correcciones, zonas }, { faccion: 'Horde' });
    alianza = crearVista({ entidades, correcciones, zonas }, { faccion: 'Alliance' });
  });

  test('el PNJ 12144 tiene punto en la Horda (lo pone la corrección)', () => {
    assert.notEqual(horda.puntoDe({ tipo: 'npc', id: 12144 }), null);
  });
  test('el PNJ 3033 está en Mulgore', () => {
    assert.deepEqual(horda.puntoDe({ tipo: 'npc', id: 3033 }), { mapa: zonas.uiMap(1638), x: 76.48, y: 27.22 });
  });
  test('el PNJ 639 es de la mazmorra 1581', () => {
    assert.deepEqual(horda.puntoDe({ tipo: 'npc', id: 639 }), { mazmorra: 1581 });
  });
  test('aplicaARaza: la 5922 es de tauren y no de orco', () => {
    assert.equal(horda.aplicaARaza(horda.mision(5922), 'Tauren'), true);
    assert.equal(horda.aplicaARaza(horda.mision(5922), 'Orc'), false);
  });
  test('la 98340 aplica a Skyborne en la Horda y no en la Alianza', () => {
    assert.equal(horda.aplicaARaza(horda.mision(98340), 'Skyborne'), true);
    assert.equal(alianza.aplicaARaza(alianza.mision(98340), 'Skyborne'), false);
  });
  test('faccionDe: 166 Alianza, 5722 Horda y requiredRaces 0 indefinida', () => {
    assert.equal(horda.faccionDe(horda.mision(166)), 'Alliance');
    assert.equal(horda.faccionDe(horda.mision(5722)), 'Horde');
    const libre = [...horda.misiones()].find(([, q]) => q.requiredRaces === 0);
    assert.ok(libre, 'hay una misión sin requisito de raza');
    assert.equal(horda.faccionDe(libre[1]), undefined);
  });
  test('misiones() no incluye basura y las correcciones no tocan las entidades', () => {
    const n = [...horda.misiones()].length;
    assert.ok(n > 0 && n < entidades.quest.size);
    assert.ok(horda.mision(5922) !== entidades.quest.get(5922));
  });
});
