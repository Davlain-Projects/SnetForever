// Pruebas de las entidades (misiones, PNJ, objetos, ítems) y las zonas de QuestieDB.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { ESQUEMA } from '../src/questie/esquema.js';
import { leerToc } from '../src/questie/toc.js';
import { valorCbor } from '../src/questie/cbor.js';
import { leerEntidades } from '../src/questie/entidades.js';
import { cargarZonas, convertirPuntos } from '../src/questie/zonas.js';
import { rutaQuestieToc } from '../src/config.js';

const ruta = rutaQuestieToc();
const hay = existsSync(ruta);
const dirQuestieDB = dirname(ruta);

describe('ESQUEMA', () => {
  test('tiene el número de campos del plano 4', () => {
    assert.equal(ESQUEMA.quest.length, 36);
    assert.equal(ESQUEMA.npc.length, 15);
    assert.equal(ESQUEMA.object.length, 7);
    assert.equal(ESQUEMA.item.length, 16);
    assert.equal(ESQUEMA.quest[0], 'name');
    assert.equal(ESQUEMA.quest[35], 'disabledByQuest');
    assert.equal(ESQUEMA.npc[6], 'spawns');
    assert.equal(ESQUEMA.object[3], 'spawns');
    assert.equal(ESQUEMA.item[15], 'teachesSpell');
  });
});

describe('contrato', () => {
  test('un contrato distinto de 4 da error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snf-contrato-'));
    const falso = join(dir, 'falso.toc');
    writeFileSync(falso, '## X-Contract-Version: 5\n## X-Flavor: Forever\n');
    assert.throws(() => leerEntidades(falso), /contrato/i);
  });
});

describe('entidades reales', { skip: !hay }, () => {
  let datos;
  let zonas;
  before(() => {
    datos = leerEntidades(ruta);
    zonas = cargarZonas(dirQuestieDB);
  });

  // Lote H: la versión y el commit son los del .toc que haya (1.0.11 y 8086696 hasta el 10-nov; 1.0.14 y e19dfdf
  // desde el 11-nov), no unos fijos.
  test('cabecera', () => {
    assert.equal(datos.meta.contrato, 4);
    assert.match(datos.meta.commit, /^[0-9a-f]{40}$/);
    assert.match(datos.meta.version, /^\d+\.\d+\.\d+$/);
    // Ronda 1 (M4): los del .toc que se lee, no solo su forma.
    const toc = leerToc(ruta);
    assert.equal(datos.meta.commit, toc.get('X-BUILD-COMMIT'));
    assert.equal(datos.meta.version, toc.get('Version'));
  });

  // Lote H: mínimos, los recuentos de QuestieDB 1.0.11 (la 1.0.14 trae 5682, 15559, 7258 y 23858). Cada versión de
  // Questie añade registros; si alguno baja de aquí, algo se ha perdido al leer la base. Las misiones son las de X-Quest-IDS.
  test('recuentos', () => {
    const minimos = { quest: 5233, npc: 13411, object: 7039, item: 21421 };
    for (const [tipo, n] of Object.entries(minimos)) assert.ok(datos[tipo].size >= n, `${tipo}: ${datos[tipo].size} < ${n}`);
    assert.equal(datos.quest.size, valorCbor(leerToc(ruta), 'X-Quest-IDS', { zlib: true }).length);
  });

  test('misión 4641', () => {
    const q = datos.quest.get(4641);
    assert.equal(q.name, 'Your Place In The World');
    assert.deepEqual(q.startedBy, [[10176]]);
    assert.deepEqual(q.finishedBy, [[3143]]);
    assert.equal(q.requiredRaces, 8589934770);
    assert.equal(typeof q.requiredRaces, 'number');
    assert.equal(q.nextQuestInChain, 788);
    assert.equal(q.requiredLevel, 1);
    assert.equal(q.requiredClasses, 0); // número ausente = 0
    assert.equal(q.requiredSkill, undefined); // {0,0} = ausente
  });

  test('filas -S en array (PNJ 2833) y nombres siempre texto', () => {
    const n = datos.npc.get(2833);
    assert.equal(typeof n.name, 'string');
    assert.match(n.name, /DEBUG/);
    assert.equal(n.minLevelHealth, 0);
    assert.equal(n.maxLevelHealth, 1);
    for (const [, npc] of datos.npc) assert.equal(typeof npc.name, 'string');
  });

  test('misión sin tablas obligatorias lleva {}', () => {
    for (const [, q] of datos.quest) {
      assert.ok(Array.isArray(q.startedBy));
      assert.ok(Array.isArray(q.finishedBy));
      assert.ok(Array.isArray(q.objectives));
    }
  });

  test('objetivos con huecos: mapa y array dan la misma forma', () => {
    // 92466 llega como mapa {3: [...]} y 92470 como array [[..], null, [..]]
    const a = datos.quest.get(92466).objectives;
    assert.ok(Array.isArray(a));
    assert.equal(a[0] ?? null, null);
    assert.ok(a[2]);
    const b = datos.quest.get(92470).objectives;
    assert.ok(Array.isArray(b));
    assert.ok(b[0]);
    assert.equal(b[1] ?? null, null);
    assert.ok(b[2]);
  });

  test('npc 10176: sus puntos dan 1411', () => {
    const p = convertirPuntos(datos.npc.get(10176).spawns, zonas);
    assert.deepEqual(p.mapas[1411][0], [43.29, 68.53]);
    assert.deepEqual(p.mazmorras, []);
    assert.deepEqual(p.sinMapa, []);
  });

  test('npc 3143 contiene [42.06, 68.33] en 1411', () => {
    const p = convertirPuntos(datos.npc.get(3143).spawns, zonas);
    assert.ok(p.mapas[1411].some(([x, y]) => x === 42.06 && y === 68.33));
  });

  // Lote H: QuestieDB 1.0.14 redondea algunos puntos de otra forma (23.38 -> 23.39): se admite ±0.05 del mapa.
  test('92460 lo da 251362, en 2521 (cerca de 42.82, 23.38)', () => {
    assert.deepEqual(datos.quest.get(92460).startedBy, [[251362]]);
    const p = convertirPuntos(datos.npc.get(251362).spawns, zonas);
    assert.ok(p.mapas[2521].some(([x, y]) => Math.abs(x - 42.82) <= 0.05 && Math.abs(y - 23.38) <= 0.05),
      JSON.stringify(p.mapas[2521]));
  });

  test('Bolvar (1748) en Ventormenta 1453 (80.21, 38.35)', () => {
    assert.equal(zonas.uiMap(1519), 1453);
    const p = convertirPuntos(datos.npc.get(1748).spawns, zonas);
    assert.ok(p.mapas[1453].some(([x, y]) => x === 80.21 && y === 38.35));
  });

  test('VanCleef (639): mazmorra 1581 con entradas', () => {
    const p = convertirPuntos(datos.npc.get(639).spawns, zonas);
    assert.ok(p.mazmorras.includes(1581));
    assert.deepEqual(p.mapas, {});
    const d = zonas.mazmorras.get(1581);
    assert.ok(d.entradas.length > 0);
    assert.equal(d.nombre, 'The Deadmines');
    assert.equal(d.entradas[0].zona, 40);
  });
});

describe('zonas', { skip: !hay }, () => {
  let zonas;
  before(() => { zonas = cargarZonas(dirQuestieDB); });

  test('orden: override, tabla, subzona, continentes', () => {
    assert.equal(zonas.uiMap(2257), 0); // override a 0 = sin mapa
    assert.equal(zonas.uiMap(10073), 1414);
    assert.equal(zonas.uiMap(10074), 1415);
    assert.equal(zonas.uiMap(10089), 947);
    assert.equal(zonas.uiMap(14), 1411);
    assert.equal(zonas.uiMap(999999), null);
  });

  test('subzona sin entrada propia se resuelve por su zona padre', () => {
    // 16622 es subzona de Zephras (plano 4 §3.2)
    assert.equal(zonas.uiMap(16622), 2521);
  });

  test('mazmorras nuevas del Forever', () => {
    assert.equal(zonas.mazmorras.get(16919).nombre, 'The Hall of Thanes');
    assert.ok(zonas.mazmorras.size >= 120);
  });
});

describe('convertirPuntos (sintético)', () => {
  const zonas = {
    uiMap: (a) => ({ 14: 1411, 2257: 0, 12: 1429 }[a] ?? null),
    mazmorras: new Map(),
  };

  test('redondea a 2 decimales, centinela a mazmorras, sin mapa aparte', () => {
    const r = convertirPuntos({
      14: [[43.2949, 68.5251], [1.005, 2]],
      1581: [[-1, -1]],
      2257: [[10, 10]],
      777: [[5, 5]],
    }, { uiMap: (a) => (a === 1581 ? null : zonas.uiMap(a)), mazmorras: new Map() });
    assert.deepEqual(r.mapas[1411][0], [43.29, 68.53]);
    assert.deepEqual(r.mazmorras, [1581]);
    assert.deepEqual(r.sinMapa.sort(), [2257, 777]);
  });

  test('acepta spawns vacíos', () => {
    assert.deepEqual(convertirPuntos(undefined, zonas), { mapas: {}, mazmorras: [], sinMapa: [] });
  });

  test('descarta la fase (3.er elemento)', () => {
    const r = convertirPuntos({ 12: [[1, 2, 3]] }, zonas);
    assert.deepEqual(r.mapas[1429], [[1, 2]]);
  });
});
