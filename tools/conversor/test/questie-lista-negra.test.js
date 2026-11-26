// Lote H, ronda 1 (I1 y M7): la lista negra de misiones de Questie, tal como Questie la aplica en el Forever, y las
// misiones completadas de los personajes de la cuenta (WTF), que son prueba del juego.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerListaNegra, leerCompletadas, leerEventos, dirWtfDe } from '../src/questie/lista-negra.js';
import { ORIGEN } from '../src/config.js';

// Una lista de juguete con la forma de la de Questie (Database/Corrections/QuestieQuestBlacklist.lua).
const LISTA = `---@class QuestieQuestBlacklist
local QuestieQuestBlacklist = QuestieLoader:CreateModule("QuestieQuestBlacklist")
local ContentPhases = QuestieLoader:ImportModule("ContentPhases")
local Expansions = QuestieLoader:ImportModule("Expansions")
local HIDE_ON_MAP = "HIDE_ON_MAP"
QuestieQuestBlacklist.HIDE_ON_MAP = HIDE_ON_MAP
function QuestieQuestBlacklist:Load()
    local questsToBlacklist = {
        [7462] = true, -- Duplicate of 7877
        [2358] = Expansions.Current == Expansions.Era or Expansions.Current >= Expansions.Wotlk, -- en Era sí
        [236] = Expansions.Current >= Expansions.Wotlk,
        [100] = Expansions.Current >= Expansions.Tbc or (Expansions.Current == Expansions.Tbc and ContentPhases.activePhases.TBC < 2),
        --[302] = true, -- comentada: no cuenta
        [31289] = not Questie.IsChinaRegion, -- MoP chino
        [13134] = false, -- Automatic Override
        [78124] = HIDE_ON_MAP, -- un libro: se ve en el diario, no en el mapa

        --- Forever quests
        [60860] = true, -- This is a promotion quest that is only available in Asia
    }
    if Questie.IsSoD then
        questsToBlacklist = ContentPhases.BlacklistSoDQuestsByPhase(questsToBlacklist, ContentPhases.activePhases.SoD)
    end
    return questsToBlacklist
end
function QuestieQuestBlacklist.LoadAutoBlacklistWotlk()
    return { [555] = true }
end
`;
const EXPANSIONES = `local Expansions = QuestieLoader:CreateModule("Expansions")
local expansionOrderLookup = { [2] = 1, [5] = 2, [11] = 3, [14] = 4, [19] = 5 }
Expansions.Era = expansionOrderLookup[WOW_PROJECT_CLASSIC or 2]
Expansions.Tbc = expansionOrderLookup[WOW_PROJECT_BURNING_CRUSADE_CLASSIC or 5]
Expansions.Wotlk = expansionOrderLookup[WOW_PROJECT_WRATH_CLASSIC or 11]
Expansions.Cata = expansionOrderLookup[WOW_PROJECT_CATACLYSM_CLASSIC or 14]
Expansions.MoP = expansionOrderLookup[WOW_PROJECT_MISTS_CLASSIC or 19]
Expansions.Current = expansionOrderLookup[WOW_PROJECT_ID or 2]
if Questie and Questie.IsForever then
    Expansions.Current = Expansions.Era
end
`;

function questieDeJuguete(raiz) {
  const dir = join(raiz, 'Questie');
  mkdirSync(join(dir, 'Database', 'Corrections'), { recursive: true });
  mkdirSync(join(dir, 'Modules'), { recursive: true });
  writeFileSync(join(dir, 'Database', 'Corrections', 'QuestieQuestBlacklist.lua'), LISTA);
  writeFileSync(join(dir, 'Modules', 'Expansions.lua'), EXPANSIONES);
  return dir;
}

describe('leerListaNegra', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'snf-lista-negra-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  test('solo lo que Questie oculta en el Forever (Era, sin temporada): `true`, ni `false` ni HIDE_ON_MAP', () => {
    const r = leerListaNegra(questieDeJuguete(tmp));
    assert.deepEqual([...r.keys()].sort((a, b) => a - b), [2358, 7462, 31289, 60860]);
  });

  test('cada una con su línea de la lista y su comentario', () => {
    const r = leerListaNegra(questieDeJuguete(tmp));
    assert.deepEqual(r.get(60860), { linea: 19, nota: 'This is a promotion quest that is only available in Asia' });
    assert.deepEqual(r.get(7462), { linea: 9, nota: 'Duplicate of 7877' });
    assert.equal(r.get(2358).linea, 10);
  });

  test('sin la carpeta de Questie, null', () => {
    assert.equal(leerListaNegra(join(tmp, 'NoExiste')), null);
  });

  test('una carpeta de Questie sin la lista es un error, no un null', () => {
    mkdirSync(join(tmp, 'Questie'));
    assert.throws(() => leerListaNegra(join(tmp, 'Questie')), /QuestieQuestBlacklist\.lua/);
  });
});

// Lote H, ronda 2: las misiones de fiesta que Questie esconde con la lista negra y vuelve a enseñar con su evento
// (QuestieEvent.lua:212-245). Un QuestieEvent de juguete con la forma del de verdad.
const EVENTO = `local QuestieEvent = QuestieLoader:CreateModule("QuestieEvent")
QuestieEvent.eventQuests = {}
QuestieEvent.eventDates = {
    ["Winter Veil"] = { startDate = "15/12", endDate = "2/1" },
    ["Brewfest"] = { startDate = "20/9", endDate = "6/10" },
}
QuestieEvent.eventDateCorrections = { ["CLASSIC"] = { ["Brewfest"] = false }, ["TBC"] = {} }
QuestieEvent.lunarFestival = { DEFAULT = { ["26"] = { startDate = "16/2", endDate = "9/3" } }, TITAN = {} }
`;
const FIESTAS = {
  'LunarFestival.lua': 'local QuestieEvent = QuestieLoader:ImportModule("QuestieEvent")\nlocal eventQuests = QuestieEvent.eventQuests\n'
    + 'tinsert(eventQuests, {"Lunar Festival", 8619}) -- Morndeep the Elder\n'
    + 'tinsert(eventQuests, {"Lunar Festival", 8620, nil, nil, nil, nil, true}) -- escondida siempre\n',
  'WinterVeil.lua': 'local QuestieEvent = QuestieLoader:ImportModule("QuestieEvent")\nlocal eventQuests = QuestieEvent.eventQuests\n'
    + 'tinsert(eventQuests, {"Winter Veil", 7022})\n',
  'DarkmoonFaire.lua': 'local QuestieEvent = QuestieLoader:ImportModule("QuestieEvent")\nlocal eventQuests = QuestieEvent.eventQuests\n'
    + 'tinsert(eventQuests, {"Darkmoon Faire", 7902})\n',
  'Brewfest.lua': 'local QuestieEvent = QuestieLoader:ImportModule("QuestieEvent")\nlocal eventQuests = QuestieEvent.eventQuests\n'
    + 'tinsert(eventQuests, {"Brewfest", 11117})\n',
};
function eventosDeJuguete(dir, enToc = ['LunarFestival.lua', 'WinterVeil.lua', 'DarkmoonFaire.lua', 'Brewfest.lua']) {
  const h = join(dir, 'Database', 'Corrections', 'Holidays');
  mkdirSync(join(h, 'quests'), { recursive: true });
  writeFileSync(join(h, 'QuestieEvent.lua'), EVENTO);
  for (const [f, t] of Object.entries(FIESTAS)) writeFileSync(join(h, 'quests', f), t);
  writeFileSync(join(dir, 'Questie_Forever.toc'), ['## Interface: 16001', 'Database\\Corrections\\Holidays\\QuestieEvent.lua',
    ...enToc.map((f) => `Database\\Corrections\\Holidays\\quests\\${f}`)].join('\r\n'));
}

describe('leerEventos', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'snf-eventos-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  test('las que Questie destapa en el Forever: evento con fecha y no desactivado en Classic, sin la marca de esconder', () => {
    const dir = questieDeJuguete(tmp);
    eventosDeJuguete(dir);
    const r = leerEventos(dir);
    assert.deepEqual([...r.entries()].sort((a, b) => a[0] - b[0]), [[7022, 'Winter Veil'], [8619, 'Lunar Festival']]);
  });

  test('la Feria de la Luna Negra no: en el Forever no tiene fecha ni se carga (_LoadDarkmoonFaire, no IsForever)', () => {
    const dir = questieDeJuguete(tmp);
    eventosDeJuguete(dir);
    assert.equal(leerEventos(dir).has(7902), false);
  });

  test('solo las fiestas que carga el .toc del Forever', () => {
    const dir = questieDeJuguete(tmp);
    eventosDeJuguete(dir, ['WinterVeil.lua']);
    assert.deepEqual([...leerEventos(dir).keys()], [7022]);
  });

  test('sin la carpeta de Questie, un mapa vacío', () => {
    assert.equal(leerEventos(join(tmp, 'NoExiste')).size, 0);
  });
});

describe('leerCompletadas', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'snf-wtf-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  test('las misiones de la lista `complete` de cada personaje (Questie, SavedVariables de la cuenta)', () => {
    const sv = join(tmp, 'Account', '123#1', 'SavedVariables');
    mkdirSync(sv, { recursive: true });
    writeFileSync(join(sv, 'Questie.lua'), `
QuestieConfig = {
["char"] = {
["Uno"] = {
["complete"] = {
[79007] = true,
[94006] = true,
},
},
["Dos"] = {
["complete"] = {
[79007] = true,
[60860] = false,
},
},
},
}
`);
    const r = leerCompletadas(tmp);
    assert.deepEqual([...r.keys()].sort((a, b) => a - b), [79007, 94006]);
    assert.deepEqual([...r.get(79007)].sort(), ['Dos', 'Uno']);
  });

  test('sin WTF, un mapa vacío', () => {
    assert.equal(leerCompletadas(join(tmp, 'NoExiste')).size, 0);
  });
});

// Integración (solo se lee): la lista de verdad y el WTF de verdad.
const dirQuestie = join(ORIGEN, 'Questie');
describe('con el Questie y el WTF reales', { skip: !existsSync(dirQuestie) && 'falta Questie' }, () => {
  test('la 60860 (promoción de Asia) y la 93928 están en la lista; la 9378 también; los libros HIDE_ON_MAP no', () => {
    const r = leerListaNegra(dirQuestie);
    assert.match(r.get(60860).nota, /promotion quest/);
    assert.ok(r.has(93928));
    assert.ok(r.has(9378));
    assert.equal(r.has(78124), false);
    assert.ok(r.size >= 300, `${r.size}`);
  });

  test('ronda 2: las de fiesta que destapa QuestieEvent (un anciano del Festival Lunar); la Feria no', () => {
    const ev = leerEventos(dirQuestie);
    assert.equal(ev.get(8619), 'Lunar Festival');
    assert.ok(leerListaNegra(dirQuestie).has(8619), 'la 8619 está en la lista negra');
    assert.equal([...ev.values()].includes('Darkmoon Faire'), false);
  });

  test('el WTF sale de la carpeta del juego y algún personaje tiene hechas la 94006 y la cadena del saco', () => {
    const r = leerCompletadas(dirWtfDe(ORIGEN));
    for (const q of [94006, 79007, 79192, 79976]) assert.ok(r.get(q)?.size > 0, `${q}`);
  });
});
