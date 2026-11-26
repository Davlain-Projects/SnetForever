// Pruebas del índice de misiones por mazmorra (tarea 7, R6): qué misiones entran, niveles, alas, facción,
// puntos y orden. La de integración carga la base real y se salta si no está el origen.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fuentesDePrueba } from './ayuda/vista.js';
import { indexarMazmorras } from '../src/mazmorras/indice.js';
import { MAZMORRAS } from '../src/rxp/comandos.js';
import { cargarFuentes } from '../src/cadenas/fuentes.js';
import { leerInstancias } from '../src/questie/instancias.js';
import { leerOpenMap } from '../src/openmap.js';
import { rutaQuestieToc } from '../src/config.js';

const HORDA = 8589934770; // máscara con razas de la Horda
const ALIANZA = 4294967373; // máscara con razas de la Alianza

const mision = (extra) => ({
  name: 'Misión', startedBy: [[1]], finishedBy: [[1]], requiredLevel: 10, questLevel: 12, zoneOrSort: 0, ...extra,
});
const dentro = (area) => ({ name: 'Dentro', spawns: { [area]: [[-1, -1]] } });
const fuera = { name: 'Fuera', spawns: { 14: [[50, 50]] } };
const MAZ = { 100: { nombre: 'Cueva', alternativas: [], zonaPadre: 14, entradas: [{ zona: 14, x: 40, y: 60, mapa: 14 }] } };
const OPENMAP = {
  niveles: new Map(), sinEntrada: [], licencia: '',
  instancias: [{ instancia: 7, nombre: 'Cueva', banda: false, min: 12, max: 17 }],
};

function indexar(datos, extra = {}) {
  const fuentes = fuentesDePrueba({ mazmorras: MAZ, ...datos });
  return indexarMazmorras({
    ...fuentes, openmap: OPENMAP, instancias: new Map([[7, 100]]), ...extra,
  });
}

describe('qué misiones entran', () => {
  test('por la zona de la misión', () => {
    const r = indexar({ misiones: { 1: mision({ zoneOrSort: 100 }), 2: mision({ zoneOrSort: 14 }) }, pnjs: { 1: fuera } });
    assert.deepEqual(r.porMazmorra[100].misiones.map((m) => [m.q, m.motivo]), [[1, 'zona']]);
  });

  test('por un PNJ objetivo que solo aparece dentro; si también sale fuera, no', () => {
    const q = (id) => mision({ objectives: [[[id, null]]] });
    const r = indexar({ misiones: { 1: q(10), 2: q(11) }, pnjs: { 1: fuera, 10: dentro(100), 11: { name: 'Mixto', spawns: { 100: [[-1, -1]], 14: [[1, 1]] } } } });
    assert.deepEqual(r.porMazmorra[100].misiones.map((m) => [m.q, m.motivo]), [[1, 'pnj']]);
  });

  test('por un objeto objetivo que solo aparece dentro', () => {
    const r = indexar({
      misiones: { 1: mision({ objectives: [null, [[20, null]]] }) },
      pnjs: { 1: fuera }, objetos: { 20: dentro(100) },
    });
    assert.deepEqual(r.porMazmorra[100].misiones.map((m) => [m.q, m.motivo]), [[1, 'objeto']]);
  });

  test('un ítem que sueltan un PNJ de dentro y otro de fuera no entra', () => {
    const r = indexar({
      misiones: { 1: mision({ objectives: [null, null, [[30, null, 0]]] }) },
      pnjs: { 1: fuera, 10: dentro(100), 11: fuera },
      items: { 30: { name: 'Piel', npcDrops: [10, 11] } },
    });
    assert.deepEqual(r.porMazmorra[100].misiones, []);
  });

  test('un ítem que solo suelta un PNJ de dentro entra con motivo item', () => {
    const r = indexar({
      misiones: { 1: mision({ objectives: [null, null, [[30, null, 0]]] }) },
      pnjs: { 1: fuera, 10: dentro(100) },
      items: { 30: { name: 'Piel', npcDrops: [10] } },
    });
    assert.deepEqual(r.porMazmorra[100].misiones.map((m) => [m.q, m.motivo]), [[1, 'item']]);
  });

  test('un ítem con una fuente sin spawns en la base no entra', () => {
    const r = indexar({
      misiones: { 1: mision({ objectives: [null, null, [[30, null, 0]]] }) },
      pnjs: { 1: fuera, 10: dentro(100), 13: { name: 'Sin spawns' } },
      items: { 30: { name: 'Piel', npcDrops: [10, 13] } },
    });
    assert.deepEqual(r.porMazmorra[100].misiones, []);
  });

  test('un ítem que también se vende o está en un contenedor no entra', () => {
    const base = { misiones: { 1: mision({ objectives: [null, null, [[30, null, 0]]] }) }, pnjs: { 1: fuera, 10: dentro(100), 12: fuera } };
    assert.deepEqual(indexar({ ...base, items: { 30: { name: 'a', npcDrops: [10], vendors: [12] } } }).porMazmorra[100].misiones, []);
    assert.deepEqual(indexar({ ...base, items: { 30: { name: 'a', npcDrops: [10], itemDrops: [99] } } }).porMazmorra[100].misiones, []);
  });

  test('el orden del criterio es zona, PNJ, objeto, ítem', () => {
    const r = indexar({
      misiones: { 1: mision({ zoneOrSort: 100, objectives: [[[10, null]]] }) },
      pnjs: { 1: fuera, 10: dentro(100) },
    });
    assert.equal(r.porMazmorra[100].misiones[0].motivo, 'zona');
  });

  test('una misión basura no entra', () => {
    const r = indexar({ misiones: { 1: mision({ name: 'REUSE ME', zoneOrSort: 100 }) }, pnjs: { 1: fuera } });
    assert.deepEqual(r.porMazmorra[100].misiones, []);
  });
});

describe('una entrada', () => {
  const datos = {
    misiones: {
      1: mision({ zoneOrSort: 100, requiredLevel: 12, questLevel: 15, requiredRaces: HORDA, nextQuestInChain: 2 }),
      2: mision({ zoneOrSort: 100, requiredLevel: 12, questLevel: 14, preQuestSingle: [1], requiredClasses: 4 }),
      3: mision({ zoneOrSort: 100, requiredLevel: 10, questLevel: 20, preQuestGroup: [50, 51], requiredRaces: ALIANZA }),
      4: mision({ zoneOrSort: 100, requiredLevel: 12, questLevel: 13, preQuestSingle: [60] }),
    },
    pnjs: { 1: { name: 'Fuera', spawns: { 14: [[50.5, 60.5]] } }, 2: dentro(100) },
  };

  test('ordenadas por nivel y luego por q, con nivel y nivelMision', () => {
    const m = indexar({ ...datos, misiones: { ...datos.misiones, 1: { ...datos.misiones[1], startedBy: [[2]], finishedBy: [[1]] } } })
      .porMazmorra[100].misiones;
    assert.deepEqual(m.map((x) => x.q), [3, 1, 2, 4]);
    assert.deepEqual(m.map((x) => [x.nivel, x.nivelMision]), [[10, 20], [12, 15], [12, 14], [12, 13]]);
  });

  test('facción, clases, razas, previas, continuación y puntos', () => {
    const e = Object.fromEntries(indexar({
      ...datos, misiones: { ...datos.misiones, 1: { ...datos.misiones[1], startedBy: [[2]], finishedBy: [[1]] } },
    }).porMazmorra[100].misiones.map((x) => [x.q, x]));
    assert.equal(e[1].faccion, 'Horde');
    assert.deepEqual(e[1].razas, ['Orc', 'Scourge', 'Tauren', 'Troll', 'Skyborne']);
    assert.equal(e[3].faccion, 'Alliance');
    assert.equal(e[2].faccion, undefined);
    assert.deepEqual(e[2].clases, ['HUNTER']);
    assert.deepEqual(e[2].previas, [1]);
    assert.equal(e[2].continuacion, true); // su previa 1 está en la misma mazmorra
    assert.equal(e[1].continuacion, undefined);
    assert.deepEqual(e[3].todas, [50, 51]);
    assert.equal(e[3].continuacion, undefined); // sus previas no están dentro
    assert.equal(e[4].continuacion, undefined);
    assert.deepEqual(e[1].recoge, { tipo: 'npc', id: 2, enMazmorra: 100 });
    assert.deepEqual(e[1].entrega, { tipo: 'npc', id: 1, mapa: 14, x: 50.5, y: 60.5 });
  });
});

describe('el punto de recogida y entrega', () => {
  test('prueba los ids en orden hasta el primero con punto', () => {
    const r = indexar({
      misiones: { 1: mision({ zoneOrSort: 100, startedBy: [[5, 6]], finishedBy: [[5, 7]] }) },
      pnjs: { 5: { name: 'Sin spawns' }, 6: { name: 'Con punto', spawns: { 14: [[10, 20]] } }, 7: dentro(100) },
    });
    const e = r.porMazmorra[100].misiones[0];
    assert.deepEqual(e.recoge, { tipo: 'npc', id: 6, mapa: 14, x: 10, y: 20 });
    assert.deepEqual(e.entrega, { tipo: 'npc', id: 7, enMazmorra: 100 });
  });

  test('sin punto en ningún id queda el primero, sin coordenadas', () => {
    const r = indexar({
      misiones: { 1: mision({ zoneOrSort: 100, startedBy: [[5, 6]] }) },
      pnjs: { 1: fuera, 5: { name: 'a' }, 6: { name: 'b' } },
    });
    assert.deepEqual(r.porMazmorra[100].misiones[0].recoge, { tipo: 'npc', id: 5 });
  });

  test('enMazmorra de un ala es el área canónica del grupo', () => {
    const mazmorras = { ...MAZ, 101: { nombre: 'Cueva', alternativas: [], zonaPadre: 14, entradas: [] } };
    const r = indexar({
      mazmorras, misiones: { 1: mision({ zoneOrSort: 100, startedBy: [[10]] }) }, pnjs: { 10: dentro(101) },
    });
    assert.equal(r.porMazmorra[100].misiones[0].recoge.enMazmorra, 100);
  });
});

describe('mazmorras, niveles y alas', () => {
  test('sin OpenMap solo entran las áreas con sigla, con aviso', () => {
    const sigla = Object.values(MAZMORRAS)[0];
    const r = indexar({
      mazmorras: { ...MAZ, [sigla]: { nombre: 'Con sigla', alternativas: [], zonaPadre: 14, entradas: [] } }, misiones: {},
    }, { openmap: null });
    assert.deepEqual(Object.keys(r.porMazmorra), [String(sigla)]);
    assert.ok(r.avisos.some((a) => a.includes('sin OpenMap')));
    assert.equal(r.porMazmorra[sigla].banda, false);
  });

  test('el respaldo de niveles ignora los niveles 0', () => {
    const openmap = { ...OPENMAP, instancias: [{ instancia: 7, nombre: 'Cueva', banda: false }] };
    const r = indexar({
      misiones: { 1: mision({ zoneOrSort: 100, requiredLevel: 0, questLevel: 14 }), 2: mision({ zoneOrSort: 100, requiredLevel: 13, questLevel: 19 }) },
      pnjs: { 1: fuera },
    }, { openmap });
    assert.deepEqual(r.porMazmorra[100].niveles, { min: 13, max: 19 });
  });

  test('niveles y banda de OpenMap, instancia e instancias al revés', () => {
    const r = indexar({ misiones: {}, pnjs: {} });
    const m = r.porMazmorra[100];
    assert.equal(m.nombre, 'Cueva');
    assert.equal(m.instancia, 7);
    assert.deepEqual(m.niveles, { min: 12, max: 17 });
    assert.equal(m.fuenteNiveles, 'OpenMap');
    assert.equal(m.banda, false);
    assert.deepEqual(r.instancias, { 7: 100 });
  });

  test('sin niveles en OpenMap salen del mínimo requiredLevel y el máximo questLevel', () => {
    const openmap = { ...OPENMAP, instancias: [{ instancia: 7, nombre: 'Cueva', banda: true }] };
    const r = indexar({
      misiones: { 1: mision({ zoneOrSort: 100, requiredLevel: 11, questLevel: 14 }), 2: mision({ zoneOrSort: 100, requiredLevel: 13, questLevel: 19 }) },
      pnjs: { 1: fuera },
    }, { openmap });
    assert.deepEqual(r.porMazmorra[100].niveles, { min: 11, max: 19 });
    assert.equal(r.porMazmorra[100].fuenteNiveles, 'misiones');
    assert.equal(r.porMazmorra[100].banda, true);
  });

  test('un área sin instancia en OpenMap ni sigla queda fuera, con aviso; la sigla basta', () => {
    const mazmorras = { ...MAZ, 200: { nombre: 'Campo', alternativas: [], zonaPadre: 14, entradas: [] },
      300: { nombre: 'Sótano', alternativas: [], zonaPadre: 14, entradas: [] } };
    const r = indexar({ mazmorras, misiones: {} }, { instancias: new Map([[7, 100], [8, 200]]) });
    assert.equal(r.porMazmorra[200], undefined);
    assert.ok(r.avisos.some((a) => a.includes('Campo') && a.includes('200')));
    // 200 tiene instancia, pero OpenMap no la conoce: sin sigla, fuera
    const sigla = Object.values(MAZMORRAS)[0];
    const r2 = indexar({ mazmorras: { ...MAZ, [sigla]: { nombre: 'Con sigla', alternativas: [], zonaPadre: 14, entradas: [] } }, misiones: {} });
    assert.ok(r2.porMazmorra[sigla]);
    assert.ok(r2.porMazmorra[sigla].sigla);
  });

  test('las áreas con el mismo nombre que una con instancia se juntan con ella', () => {
    const mazmorras = { ...MAZ,
      101: { nombre: 'Cueva', alternativas: [], zonaPadre: 14, entradas: [] },
      102: { nombre: 'Cueva', alternativas: [], zonaPadre: 14, entradas: [] } };
    const r = indexar({
      mazmorras,
      misiones: { 1: mision({ zoneOrSort: 101 }), 2: mision({ objectives: [[[10, null]]] }) },
      pnjs: { 1: fuera, 10: dentro(102) },
    });
    assert.deepEqual(Object.keys(r.porMazmorra), ['100']);
    assert.deepEqual(r.porMazmorra[100].misiones.map((m) => [m.q, m.motivo]), [[1, 'zona'], [2, 'pnj']]);
  });

  test('las áreas alternativas de la mazmorra cuentan como ella', () => {
    const mazmorras = { 100: { ...MAZ[100], alternativas: [150] } };
    const r = indexar({ mazmorras, misiones: { 1: mision({ zoneOrSort: 150 }) }, pnjs: { 1: fuera } });
    assert.deepEqual(r.porMazmorra[100].misiones.map((m) => m.q), [1]);
  });

  test('filas resume cada mazmorra', () => {
    const r = indexar({ misiones: { 1: mision({ zoneOrSort: 100 }) }, pnjs: { 1: fuera } });
    assert.deepEqual(r.filas, [{ area: 100, nombre: 'Cueva', instancia: 7, sigla: undefined, banda: false, niveles: { min: 12, max: 17 }, misiones: 1 }]);
  });
});

const hay = existsSync(rutaQuestieToc());

describe('el índice en la base real', { skip: !hay }, () => {
  let r;
  before(() => {
    const fuentes = cargarFuentes();
    const dir = dirname(rutaQuestieToc());
    r = indexarMazmorras({
      ...fuentes, openmap: leerOpenMap(dir.replace(/QuestieDB$/, 'OpenMap')), instancias: leerInstancias(dir),
    });
    r.fuentes = fuentes;
  });
  const qs = (area) => r.porMazmorra[area].misiones.map((m) => m.q);

  test('Ragefire Chasm (2437)', () => {
    for (const q of [5722, 5723, 5724, 5725, 5728, 5761]) assert.ok(qs(2437).includes(q), `falta ${q}`);
    assert.equal(r.porMazmorra[2437].misiones.find((m) => m.q === 5722).faccion, 'Horde');
  });

  test('Las Minas de la Muerte (1581)', () => {
    for (const q of [166, 214, 2040]) assert.ok(qs(1581).includes(q), `falta ${q}`);
    assert.equal(r.porMazmorra[1581].misiones.find((m) => m.q === 166).faccion, 'Alliance');
  });

  test('Shadowfang Keep (209): instancia, niveles y misiones', () => {
    const m = r.porMazmorra[209];
    assert.equal(m.instancia, 33);
    assert.deepEqual(m.niveles, { min: 18, max: 23 });
    assert.equal(m.fuenteNiveles, 'OpenMap');
    for (const q of [1013, 1014, 1098]) assert.ok(qs(209).includes(q), `falta ${q}`);
  });

  test('el Valle de Alterac no está, las alas de Dire Maul se juntan y las instancias van al revés', () => {
    assert.equal(r.porMazmorra[2597], undefined);
    assert.equal(r.instancias[33], 209);
    assert.equal(r.instancias[389], 2437);
    assert.equal(r.porMazmorra[3277], undefined, 'Warsong');
    assert.equal(r.porMazmorra[3358], undefined, 'Arathi');
    for (let a = 10022; a <= 10027; a++) assert.equal(r.porMazmorra[a], undefined, `sobra el ala ${a}`);
    assert.ok(r.porMazmorra[2557]);
    assert.equal(r.porMazmorra[2557].instancia, 429);
  });

  test('toda entrada es una misión de la base y sus puntos están en 0-100', () => {
    const enRango = (n) => n >= 0 && n <= 100;
    for (const m of Object.values(r.porMazmorra)) {
      for (const e of m.misiones) {
        assert.ok(r.fuentes.entidades.quest.has(e.q), `${e.q} no está en la base`);
        for (const p of [e.recoge, e.entrega]) {
          if (p?.x !== undefined) assert.ok(enRango(p.x) && enRango(p.y), `${e.q}: punto fuera de rango`);
        }
      }
    }
  });
});
