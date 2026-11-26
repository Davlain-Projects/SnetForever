// Pruebas del lector de nombres de zona de Questie (lookupZones, sus correcciones y la traducción al español).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerNombresZonas } from '../src/questie/nombres-zonas.js';
import { ORIGEN } from '../src/config.js';

describe('leerNombresZonas con una carpeta pequeña', () => {
  let raiz;
  let dir;
  before(() => {
    raiz = mkdtempSync(join(tmpdir(), 'snf-nombres-'));
    dir = join(raiz, 'Localization');
    mkdirSync(join(dir, 'lookups'), { recursive: true });
    mkdirSync(join(dir, 'Translations', 'Zones'), { recursive: true });
    writeFileSync(join(dir, 'lookups', 'lookupZones.lua'), [
      'l10n.zoneLookup = {',
      '    [0]={',
      '        [0]="Eastern Kingdoms",',
      '        [1]="Dun Morogh",',
      '        --[19]="Zul\'Gurub",',
      '        [33]="Stranglethorn Vale",',
      '        [44]="Tal \\"Rara\\"",',
      '    },',
      '    [1]={',
      '        [14]="Durotar",',
      '    },',
      '}',
    ].join('\n'));
    writeFileSync(join(dir, 'lookups', 'lookupZonesCorrections.lua'), [
      'local easternKingdom = l10n.zoneLookup[0]',
      'easternKingdom[33] = "Northern Stranglethorn"',
      'easternKingdom[193] = "Andorhal"',
      '--easternKingdom[1977] = "Zul\'Gurub"',
      'if Expansions.Current >= Expansions.MoP then',
      '    local pandaria = l10n.zoneLookup[870]',
      '    pandaria[5000] = "Zona de Pandaria"',
      '    l10n.zoneLookup[369][6618] = "Bizmo\'s Brawlpub"',
      'end',
    ].join('\n'));
    writeFileSync(join(dir, 'Translations', 'Zones', 'Uno.lua'), [
      'local locales = {',
      '    ["Dun Morogh"] = {',
      '        ["enUS"] = true,',
      '        ["deDE"] = "Dun Morogh",',
      '        ["esES"] = "Dun Morogh",',
      '    },',
      '    ["Durotar"] = {',
      '        ["enUS"] = true,',
      '        ["esES"] = "Durotar (es)",',
      '        ["esMX"] = "Durotar (mx)",',
      '    },',
      '    ["Elwynn Forest"] = {',
      '        ["enUS"] = true,',
      '        ["esES"] = true,',
      '    },',
      '    ["Andorhal"] = {',
      '        ["enUS"] = true,',
      '        ["frFR"] = "Andorhal fr",',
      '    },',
      '}',
    ].join('\n'));
  });
  after(() => { if (raiz) rmSync(raiz, { recursive: true, force: true }); });

  const tocForever = () => {
    const ruta = join(raiz, 'Forever.toc');
    writeFileSync(ruta, ['## Interface: 16001', 'Localization/l10n.lua', 'Localization/lookups/lookupZones.lua', ''].join(String.fromCharCode(10)));
    return ruta;
  };
  const tocMists = () => {
    const ruta = join(raiz, 'Mists.toc');
    writeFileSync(ruta, ['## Interface: 50500', 'Localization/lookups/lookupZones.lua', 'Localization/lookups/lookupZonesCorrections.lua', ''].join(String.fromCharCode(10)));
    return ruta;
  };

  test('nombres en inglés: solo lookupZones, sin comentarios, y sin las correcciones de otras expansiones', () => {
    for (const { en } of [leerNombresZonas(dir), leerNombresZonas(dir, tocForever())]) {
      assert.equal(en.get(1), 'Dun Morogh');
      assert.equal(en.get(14), 'Durotar');
      assert.equal(en.get(33), 'Stranglethorn Vale');
      assert.equal(en.has(193), false);
      assert.equal(en.get(44), 'Tal "Rara"');
      assert.equal(en.has(19), false);
      assert.equal(en.has(5000), false);
    }
  });

  test('las correcciones solo se aplican si el .toc las carga (sueltas, sin comentarios ni bloques con `if`)', () => {
    const { en } = leerNombresZonas(dir, tocMists());
    assert.equal(en.get(33), 'Northern Stranglethorn');
    assert.equal(en.get(193), 'Andorhal');
    assert.equal(en.has(1977), false);
    assert.equal(en.has(5000), false);
    assert.equal(en.has(6618), false);
  });

  test('traducción al español por el nombre en inglés, solo la esES', () => {
    const { es } = leerNombresZonas(dir);
    assert.equal(es.get('Durotar'), 'Durotar (es)');
    assert.equal(es.get('Dun Morogh'), 'Dun Morogh');
    assert.equal(es.has('Andorhal'), false);
    // `esES = true` quiere decir «igual que en inglés».
    assert.equal(es.get('Elwynn Forest'), 'Elwynn Forest');
  });

  test('sin la carpeta no falla: tablas vacías', () => {
    const { en, es } = leerNombresZonas(join(raiz, 'no-existe'));
    assert.equal(en.size, 0);
    assert.equal(es.size, 0);
  });
});

const REALES = join(ORIGEN, 'Questie', 'Localization');
const TOC_FOREVER = join(ORIGEN, 'Questie', 'Questie_Forever.toc');
describe('leerNombresZonas con los datos reales', { skip: !existsSync(REALES) }, () => {
  test('Dun Morogh, Durotar y la traducción de Tierras del Interior', () => {
    const { en, es } = leerNombresZonas(REALES, TOC_FOREVER);
    assert.equal(en.get(1), 'Dun Morogh');
    assert.equal(en.get(14), 'Durotar');
    assert.equal(es.get('The Hinterlands'), 'Tierras del Interior');
    assert.ok(en.size > 1000);
  });

  test('el Forever es Classic: el área 17 es «The Barrens» (Los Baldíos) y el 33 «Stranglethorn Vale»', () => {
    const { en, es } = leerNombresZonas(REALES, TOC_FOREVER);
    assert.equal(en.get(17), 'The Barrens');
    assert.equal(es.get(en.get(17)), 'Los Baldíos');
    assert.equal(en.get(33), 'Stranglethorn Vale');
    assert.equal(es.get(en.get(33)), 'Vega de Tuercespina');
  });
});
