// Pruebas de la lectura de OpenMap (niveles, mazmorras) y de la tabla instanceID -> AreaID de QuestieDB.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerOpenMap } from '../src/openmap.js';
import { leerInstancias } from '../src/questie/instancias.js';
import { ORIGEN } from '../src/config.js';

const dirOpenMap = join(ORIGEN, 'OpenMap');
const dirQuestie = join(ORIGEN, 'QuestieDB');
// Lote H: basta con que esté la carpeta. Si OpenMap mueve sus datos otra vez (la 0.8.3 los pasó de Data\ a
// Data\Forever\), la prueba falla en vez de saltarse en silencio.
const hayOpenMap = existsSync(dirOpenMap);
const hayQuestie = existsSync(join(dirQuestie, 'support', 'Forever', 'Zones', 'instanceIdToAreaId.lua'));

// Un OpenMap de juguete con Levels.lua y Places.lua en `sub` (la forma de los de verdad: `local _, ns = ...`).
const NIVELES = 'local _, ns = ...\nns.MapLevels = { [1413] = { 10, 25 } }\n';
const LUGARES = 'local _, ns = ...\nns.MapPlaces = { instances = { { 0, 1, 2, { { 33, "Shadowfang Keep", false, 18, 23 } } } },'
  + ' unplaced = { { 0, "Sin entrada", true, 60, 60 } } }\n';
function openMapDeJuguete(raiz, sub, { niveles = NIVELES, lugares = LUGARES } = {}) {
  const dir = join(raiz, 'OpenMap');
  mkdirSync(join(dir, ...sub), { recursive: true });
  writeFileSync(join(dir, ...sub, 'Levels.lua'), niveles);
  writeFileSync(join(dir, ...sub, 'Places.lua'), lugares);
  writeFileSync(join(dir, 'LICENSE.txt'), 'MIT License\n');
  return dir;
}

describe('leerOpenMap', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'snf-openmap-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  test('una carpeta que no existe da null sin error', () => {
    assert.equal(leerOpenMap(join(ORIGEN, 'NoExiste_OpenMap')), null);
  });

  // Lote H: hasta la 0.8.x, Data\Levels.lua y Data\Places.lua; desde la 0.8.3, en Data\Forever\ (el .toc del
  // Forever carga Data\Forever\Client.lua y sus datos de esa carpeta).
  for (const [nombre, sub] of [['la de antes (Data\\)', ['Data']], ['la de la 0.8.3 (Data\\Forever\\)', ['Data', 'Forever']]]) {
    test(`lee los datos con la disposición ${nombre}`, () => {
      const r = leerOpenMap(openMapDeJuguete(tmp, sub));
      assert.deepEqual(r.niveles.get(1413), [10, 25]);
      assert.deepEqual(r.instancias, [{ instancia: 33, nombre: 'Shadowfang Keep', banda: false, min: 18, max: 23 }]);
      assert.deepEqual(r.sinEntrada, [{ nombre: 'Sin entrada', banda: true, min: 60, max: 60 }]);
      assert.equal(r.licencia, 'MIT License\n');
    });
  }

  test('con las dos disposiciones, manda la del Forever (Data\\Forever\\)', () => {
    openMapDeJuguete(tmp, ['Data'], { niveles: 'local _, ns = ...\nns.MapLevels = { [1413] = { 1, 2 } }\n' });
    const r = leerOpenMap(openMapDeJuguete(tmp, ['Data', 'Forever']));
    assert.deepEqual(r.niveles.get(1413), [10, 25]);
  });

  test('una carpeta de OpenMap sin sus datos en ningún sitio conocido es un error, no un null', () => {
    const dir = join(tmp, 'OpenMap');
    mkdirSync(join(dir, 'Data', 'Otro'), { recursive: true });
    assert.throws(() => leerOpenMap(dir), /OpenMap.*Levels\.lua.*Places\.lua/s);
  });

  test('integración: niveles, instancias, sin entrada y licencia', { skip: !hayOpenMap && 'falta OpenMap' }, () => {
    const r = leerOpenMap(dirOpenMap);
    assert.deepEqual(r.niveles.get(1440), [18, 30]);
    assert.deepEqual(r.niveles.get(2521), [1, 12]);
    assert.ok(r.instancias.some((i) => i.instancia === 33 && i.nombre === 'Shadowfang Keep'
      && i.banda === false && i.min === 18 && i.max === 23));
    assert.equal(r.instancias.find((i) => i.instancia === 409).banda, true);
    const dalaran = r.instancias.find((i) => i.instancia === 2959);
    assert.equal(dalaran.nombre, 'City of Dalaran');
    assert.equal(dalaran.min, 28);
    assert.equal(dalaran.max, 33);
    assert.equal(dalaran.mapa, 1416);
    assert.equal(r.instancias.find((i) => i.instancia === 531).min, undefined);
    assert.ok(r.sinEntrada.some((s) => s.nombre === "Krol'dok Stronghold" && s.min === 40 && s.max === 45));
    assert.ok(r.licencia.startsWith('MIT License'));
  });
});

describe('leerInstancias', () => {
  test('integración: instanceID -> AreaID', { skip: !hayQuestie && 'falta QuestieDB' }, () => {
    const avisos = [];
    const m = leerInstancias(dirQuestie, avisos);
    assert.equal(m.get(33), 209);
    assert.equal(m.get(36), 1581);
    assert.equal(m.get(389), 2437);
    assert.equal(m.get(2959), 16544);
    assert.equal(m.get(3065), 16919);
  });
});
