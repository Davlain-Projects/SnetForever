// Pruebas de las correcciones dinámicas de QuestieDB (por facción y clase), calculadas con fengari.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { leerCorrecciones, CLASES, BORRAR } from '../src/questie/correcciones.js';
import { rutaQuestieToc } from '../src/config.js';

const dirQuestieDB = dirname(rutaQuestieToc());
const dirCorrecciones = join(dirQuestieDB, 'src', 'corrections');
const hay = existsSync(join(dirCorrecciones, 'Forever', 'foreverQuestFixes.lua'));

// Copia canónica para comparar valores sin depender del orden de las claves.
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

describe('correcciones reales', { skip: !hay }, () => {
  let c;
  before(() => { c = leerCorrecciones(dirQuestieDB); });

  test('tiene las dos facciones y los cuatro tipos', () => {
    for (const faccion of ['Horde', 'Alliance']) {
      for (const tipo of ['quest', 'npc', 'object', 'item']) {
        assert.equal(typeof c[faccion][tipo], 'object', `${faccion}.${tipo}`);
      }
    }
  });

  test('Horda: el Espíritu de Garraluna (12144) tiene spawns', () => {
    const spawns = c.Horde.npc[12144]?.spawns;
    assert.ok(spawns, 'falta Horde.npc[12144].spawns');
    assert.ok(Object.keys(spawns).length > 0, 'spawns vacío');
    // Los Baldíos (zona 17) en la Horda.
    assert.deepEqual(spawns, { 17: [[41.96, 60.79]] });
  });

  test('Alianza: el Espíritu de Garraluna (12144) tiene spawns', () => {
    const spawns = c.Alliance.npc[12144]?.spawns;
    assert.ok(spawns, 'falta Alliance.npc[12144].spawns');
    // Costa Oscura (zona 148) en la Alianza.
    assert.deepEqual(spawns, { 148: [[43.33, 45.85]] });
  });

  test('al menos 80 misiones distintas entre Horda y Alianza (libros de biblioteca)', () => {
    const ids = new Set([...Object.keys(c.Horde.quest), ...Object.keys(c.Alliance.quest)]);
    let distintas = 0;
    for (const id of ids) {
      if (canonico(c.Horde.quest[id]) !== canonico(c.Alliance.quest[id])) distintas++;
    }
    assert.ok(distintas >= 80, `solo ${distintas} misiones distintas`);
  });

  test('la misión 8315 tiene nextQuestInChain por clase', () => {
    for (const faccion of ['Horde', 'Alliance']) {
      const v = c[faccion].quest[8315]?.nextQuestInChain;
      assert.ok(v && v.porClase, `${faccion}: falta porClase`);
      assert.deepEqual(Object.keys(v.porClase).sort(), [...CLASES].sort());
      assert.equal(v.porClase.WARRIOR, 8316);
      assert.equal(v.porClase.DRUID, 8382);
    }
  });

  test('una clase sin valor queda como null dentro de porClase (8978, sin PALADIN en la Horda)', () => {
    const v = c.Horde.quest[8978]?.nextQuestInChain;
    assert.ok(v && v.porClase);
    assert.equal(v.porClase.PALADIN, null);
    assert.equal(v.porClase.DRUID, 8927);
  });

  test('{} se guarda como "__borrar"', () => {
    assert.equal(BORRAR, '__borrar');
    assert.equal(c.Horde.quest[3741].reputationReward, BORRAR);
    assert.equal(c.Horde.item[3713].objectDrops, BORRAR);
  });

  test('un valor igual en todas las clases no lleva porClase', () => {
    assert.equal(c.Horde.quest[113].nextQuestInChain, 32);
    assert.equal(c.Alliance.item[3713].name, 'Soothing Spices');
  });

  test('las correcciones del Forever van después del legado (libro en Entrañas para la Horda)', () => {
    assert.equal(c.Horde.quest[78124].zoneOrSort, 1497);
    assert.deepEqual(c.Horde.quest[78124].finishedBy, [[211022]]);
  });
});

// Crea una carpeta QuestieDB falsa con los enums reales y archivos de corrección mínimos.
function questieFalso(sustituir) {
  const raiz = mkdtempSync(join(tmpdir(), 'snf-correcciones-'));
  const corr = join(raiz, 'src', 'corrections');
  mkdirSync(join(corr, 'Forever', 'legacy'), { recursive: true });
  cpSync(join(dirCorrecciones, 'enum'), join(corr, 'enum'), { recursive: true });
  const vacio = (modulo, funcion) => `local M = QuestieLoader:CreateModule("${modulo}")\n`
    + `function M:${funcion}() return {} end\n`;
  const archivos = {
    'Forever/legacy/classicQuestFixes.lua': vacio('QuestieQuestFixes', 'LoadFactionFixes'),
    'Forever/legacy/classicNPCFixes.lua': vacio('QuestieNPCFixes', 'LoadFactionFixes'),
    'Forever/legacy/classicItemFixes.lua': vacio('QuestieItemFixes', 'LoadFactionFixes'),
    'Forever/legacy/classicObjectFixes.lua': vacio('QuestieObjectFixes', 'LoadFactionFixes'),
    'Forever/foreverQuestFixes.lua': vacio('ForeverQuestFixes', 'LoadDynamic'),
    'Forever/foreverNPCFixes.lua': vacio('ForeverNpcFixes', 'LoadDynamic'),
    'Forever/foreverItemFixes.lua': vacio('ForeverItemFixes', 'LoadDynamic'),
    'Forever/foreverObjectFixes.lua': vacio('ForeverObjectFixes', 'LoadDynamic'),
    ...sustituir,
  };
  for (const [ruta, texto] of Object.entries(archivos)) writeFileSync(join(corr, ruta), texto);
  return raiz;
}

describe('errores', { skip: !hay }, () => {
  test('un archivo que no compila falla con su nombre y el error de Lua', () => {
    const dir = questieFalso({ 'Forever/legacy/classicNPCFixes.lua': 'esto no es Lua (' });
    assert.throws(() => leerCorrecciones(dir), /classicNPCFixes\.lua.*/s);
  });

  test('no hay io ni os en el estado', () => {
    const dir = questieFalso({
      'Forever/foreverItemFixes.lua': 'local M = QuestieLoader:CreateModule("ForeverItemFixes")\n'
        + 'function M:LoadDynamic() return { [1] = { [1] = os.time() } } end\n',
    });
    assert.throws(() => leerCorrecciones(dir), /foreverItemFixes\.lua.*os/s);
  });

  test('una clave de operación (≥ 1000 o ≤ 0) da error con su nombre', () => {
    const dir = questieFalso({
      'Forever/foreverQuestFixes.lua': 'local M = QuestieLoader:CreateModule("ForeverQuestFixes")\n'
        + 'local QuestieDB = QuestieLoader:ImportModule("QuestieDB")\n'
        + 'function M:LoadDynamic() return { [5] = { [QuestieDB.questKeys.startedBy_add] = {{1}} } } end\n',
    });
    assert.throws(() => leerCorrecciones(dir), /operaci.*1002/s);
  });

  test('la facción y la clase llegan a los archivos', () => {
    const dir = questieFalso({
      'Forever/foreverNPCFixes.lua': 'local M = QuestieLoader:CreateModule("ForeverNpcFixes")\n'
        + 'function M:LoadDynamic() return { [7] = { [1] = UnitFactionGroup("Player") .. "-" .. UnitClassBase("player") } } end\n',
    });
    const c = leerCorrecciones(dir);
    assert.equal(c.Horde.npc[7].name.porClase.MAGE, 'Horde-MAGE');
    assert.equal(c.Alliance.npc[7].name.porClase.DRUID, 'Alliance-DRUID');
  });
});
