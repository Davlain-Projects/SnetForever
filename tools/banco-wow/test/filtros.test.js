// Filtros y máscaras del addon (nucleo/filtros.lua): evaluador de filtros normalizados y máscaras de raza/clase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FILTROS_JS = join(RAIZ, 'tools', 'conversor', 'src', 'rxp', 'filtros.js');

// Literal de Lua para un valor de JS (cadenas, números, booleanos, arrays y objetos simples).
function aLua(v) {
  if (v === undefined || v === null) return 'nil';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `{${v.map(aLua).join(',')}}`;
  return `{${Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}]=${aLua(x)}`).join(',')}}`;
}

const PJ_BASE = { clase: 'WARRIOR', raza: 'Troll', faccion: 'Horde', nivel: 20 };

function evaluar(m, filtro, pj = {}) {
  return m.lua(`SnetForever.Filtros.evaluar(${aLua(filtro)}, ${aLua({ ...PJ_BASE, ...pj })})`);
}

test('evaluar: grupos O de términos Y, con negación', () => {
  const m = nuevaMaquina();
  const f = [['c:WARRIOR', '!r:Orc']];
  assert.equal(evaluar(m, f, { raza: 'Troll' }), true);
  assert.equal(evaluar(m, f, { raza: 'Orc' }), false);
  assert.equal(evaluar(m, f, { raza: 'Troll', clase: 'MAGE' }), false);
  assert.equal(evaluar(m, [['r:Orc'], ['r:Troll']], { raza: 'Tauren' }), false);
  assert.equal(evaluar(m, [['r:Orc'], ['r:Troll']], { raza: 'Troll' }), true);
  sinErrores(m);
});

test('evaluar: nivel mínimo y su negación', () => {
  const m = nuevaMaquina();
  assert.equal(evaluar(m, [['n:10']], { nivel: 9 }), false);
  assert.equal(evaluar(m, [['n:10']], { nivel: 10 }), true);
  assert.equal(evaluar(m, [['!n:10']], { nivel: 9 }), true);
  assert.equal(evaluar(m, [['!n:10']], { nivel: 10 }), false);
  sinErrores(m);
});

test('evaluar: la facción Neutral cumple las dos', () => {
  const m = nuevaMaquina();
  assert.equal(evaluar(m, [['f:Horde']], { faccion: 'Neutral' }), true);
  assert.equal(evaluar(m, [['f:Alliance']], { faccion: 'Neutral' }), true);
  assert.equal(evaluar(m, [['f:Alliance']], { faccion: 'Horde' }), false);
  assert.equal(evaluar(m, [['f:Horde']], { faccion: 'Horde' }), true);
  sinErrores(m);
});

test('evaluar: constantes, grupo vacío y términos de sexo, idioma y desconocidos', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Filtros.evaluar(nil, {})'), true);
  assert.equal(evaluar(m, true), true);
  assert.equal(evaluar(m, false), false);
  assert.equal(evaluar(m, []), false);
  assert.equal(evaluar(m, [[]]), true);
  assert.equal(evaluar(m, [['s:female']], { sexo: 'female' }), true);
  assert.equal(evaluar(m, [['s:female']], { sexo: 'male' }), false);
  assert.equal(evaluar(m, [['s:female']]), false);
  assert.equal(evaluar(m, [['!s:female']]), true);
  assert.equal(evaluar(m, [['l:esMX']], { idioma: 'esMX' }), true);
  assert.equal(evaluar(m, [['l:esMX']], { idioma: 'esES' }), false);
  assert.equal(evaluar(m, [['l:esMX']]), false);
  assert.equal(evaluar(m, [['x:raro']]), false);
  assert.equal(evaluar(m, [['!x:raro']]), true);
  sinErrores(m);
});

test('tieneBit: bits hasta 2^33 con aritmética', () => {
  const m = nuevaMaquina();
  const tb = (mascara, bit) => m.lua(`SnetForever.Filtros.tieneBit(${mascara}, ${bit})`);
  assert.equal(tb(8589934770, 2), true);
  assert.equal(tb(8589934770, 8589934592), true);
  assert.equal(tb(8589934770, 4294967296), false);
  assert.equal(tb(8589934770, 1), false);
  sinErrores(m);
});

test('constantes de máscaras', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('SnetForever.Filtros.MASCARA_RAZA'), {
    Human: 1, Orc: 2, Dwarf: 4, NightElf: 8, Scourge: 16, Tauren: 32, Gnome: 64, Troll: 128, Goblin: 256,
  });
  assert.deepEqual(m.lua('SnetForever.Filtros.SKYBORNE'), { Alliance: 4294967296, Horde: 8589934592 });
  assert.deepEqual(m.lua('SnetForever.Filtros.MASCARA_CLASE'), {
    WARRIOR: 1, PALADIN: 2, HUNTER: 4, ROGUE: 8, PRIEST: 16, SHAMAN: 64, MAGE: 128, WARLOCK: 256, DRUID: 1024,
  });
  sinErrores(m);
});

test('razaCumple: bits de raza y de Skyborne por facción', () => {
  const m = nuevaMaquina();
  const rc = (mascara, pj) => m.lua(`SnetForever.Filtros.razaCumple(${mascara}, ${aLua(pj)})`);
  const M = 8589934770; // Orc, Scourge, Tauren, Troll y Skyborne Horde
  assert.equal(rc(M, { raza: 'Orc', faccion: 'Horde' }), true);
  assert.equal(rc(M, { raza: 'Skyborne', faccion: 'Horde' }), true);
  assert.equal(rc(M, { raza: 'Skyborne', faccion: 'Alliance' }), false);
  assert.equal(rc(M, { raza: 'Skyborne', faccion: 'Neutral' }), true);
  assert.equal(rc(M, { raza: 'Human', faccion: 'Alliance' }), false);
  // Sin máscara o con 0 cumple cualquiera; una raza sin bit conocido también.
  assert.equal(rc(0, { raza: 'Human', faccion: 'Alliance' }), true);
  assert.equal(m.lua('SnetForever.Filtros.razaCumple(nil, {raza = "Human", faccion = "Alliance"})'), true);
  assert.equal(rc(2, { raza: 'Raza rara', faccion: 'Horde' }), true);
  sinErrores(m);
});

test('claseCumple: bits de clase', () => {
  const m = nuevaMaquina();
  const cc = (mascara, clase) => m.lua(`SnetForever.Filtros.claseCumple(${mascara}, {clase = "${clase}"})`);
  assert.equal(cc(1024, 'DRUID'), true);
  assert.equal(cc(1024, 'MAGE'), false);
  assert.equal(cc(0, 'MAGE'), true);
  assert.equal(cc(1 + 128, 'MAGE'), true);
  assert.equal(m.lua('SnetForever.Filtros.claseCumple(nil, {clase = "MAGE"})'), true);
  sinErrores(m);
});

const RAZAS = ['Human', 'Orc', 'Dwarf', 'NightElf', 'Scourge', 'Tauren', 'Gnome', 'Troll', 'Skyborne'];
const CLASES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID'];
const TEXTOS = [
  'Warrior !Orc', 'Orc/Troll Horde', 'Priest/Mage/Warlock !Gnome', '!Alliance 10', 'Horde (Tauren/Orc) 9',
  '!(Warrior/Rogue) Alliance', '10 Human/Dwarf', 'male Alliance', '!female esES', 'Skyborne Horde/Skyborne Alliance',
  'Druid/Shaman !10', 'Forever', 'Classic', 'Undead (Mage/Warlock)/Warrior 60', 'esMX male 9',
];

test('contraste con la fase 1: el mismo resultado que evaluarFiltro', { skip: !existsSync(FILTROS_JS) }, async () => {
  const { analizarFiltro, evaluarFiltro } = await import(pathToFileURL(FILTROS_JS).href);
  const m = nuevaMaquina();
  const filtros = TEXTOS.map((t) => analizarFiltro(t).filtro);
  // Algunos filtros fijos más para cubrir las constantes y los grupos vacíos.
  filtros.push(true, false, [[]]);
  assert.ok(filtros.length >= 12);
  const personajes = [];
  for (const raza of RAZAS) {
    for (const clase of CLASES) {
      for (const faccion of ['Horde', 'Alliance']) {
        for (const nivel of [1, 9, 10, 60]) {
          const sexo = (personajes.length % 3 === 0) ? undefined : (personajes.length % 3 === 1 ? 'male' : 'female');
          const idioma = (personajes.length % 4 === 0) ? undefined : (personajes.length % 4 === 1 ? 'esES' : (personajes.length % 4 === 2 ? 'esMX' : 'enUS'));
          personajes.push({ raza, clase, faccion, nivel, sexo, idioma });
        }
      }
    }
  }
  m.lua(`PERSONAJES = ${aLua(personajes.map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))))}`);
  let comparados = 0;
  for (const f of filtros) {
    const resultado = m.lua(`(function()
      local r = {}
      for i, pj in ipairs(PERSONAJES) do r[i] = SnetForever.Filtros.evaluar(${aLua(f)}, pj) and 1 or 0 end
      return table.concat(r)
    end)()`);
    assert.equal(resultado.length, personajes.length);
    personajes.forEach((p, i) => {
      const esperado = evaluarFiltro(f, p) ? '1' : '0';
      assert.equal(resultado[i], esperado, `${JSON.stringify(f)} con ${JSON.stringify(p)}`);
      comparados++;
    });
  }
  assert.ok(comparados >= 12 * 9 * 9 * 2 * 4);
  sinErrores(m);
});
