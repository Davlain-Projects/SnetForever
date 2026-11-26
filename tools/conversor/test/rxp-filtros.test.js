import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarFiltro, evaluarFiltro, filtroATexto, RAZAS, CLASES } from '../src/rxp/filtros.js';

const ctx = { archivo: 'x.lua', linea: 7 };
const f = (t) => analizarFiltro(t, ctx).filtro;
const pjBase = { clase: 'MAGE', raza: 'Orc', faccion: 'Horde', nivel: 10 };
const ev = (t, pj = {}) => evaluarFiltro(f(t), { ...pjBase, ...pj });

test('RAZAS y CLASES contienen los tokens válidos', () => {
  assert.deepEqual([...RAZAS].sort(), ['Dwarf', 'Gnome', 'Human', 'NightElf', 'Orc', 'Scourge', 'Skyborne', 'Tauren', 'Troll']);
  assert.equal(CLASES.length, 9);
  assert.ok(CLASES.includes('WARLOCK'));
});

test('"!Orc !Troll": falso con Orc, verdadero con Tauren', () => {
  assert.equal(ev('!Orc !Troll', { raza: 'Orc' }), false);
  assert.equal(ev('!Orc !Troll', { raza: 'Tauren' }), true);
});

test('"Warrior/Shaman" con SHAMAN es verdadero', () => {
  assert.equal(ev('Warrior/Shaman', { clase: 'SHAMAN' }), true);
  assert.equal(ev('Warrior/Shaman', { clase: 'MAGE' }), false);
});

test('"Horde Hunter/Horde Shaman" con Alianza y cazador es falso', () => {
  assert.equal(ev('Horde Hunter/Horde Shaman', { faccion: 'Alliance', clase: 'HUNTER' }), false);
  assert.equal(ev('Horde Hunter/Horde Shaman', { faccion: 'Horde', clase: 'HUNTER' }), true);
});

test('"Undead Mage" se analiza como [["r:Scourge","c:MAGE"]]', () => {
  assert.deepEqual(f('Undead Mage'), [['r:Scourge', 'c:MAGE']]);
});

test('"Maget" da false con aviso que nombra el término', () => {
  const r = analizarFiltro('Maget', ctx);
  assert.equal(r.filtro, false);
  assert.equal(r.avisos.length, 1);
  assert.equal(r.avisos[0].archivo, 'x.lua');
  assert.equal(r.avisos[0].linea, 7);
  assert.match(r.avisos[0].mensaje, /Maget/);
});

test('"skip" da false sin aviso', () => {
  const r = analizarFiltro('skip', ctx);
  assert.equal(r.filtro, false);
  assert.deepEqual(r.avisos, []);
  assert.equal(f('!skip'), true);
});

test('"Classic" es false, "!Classic" es true, FOREVER es true', () => {
  assert.equal(f('Classic'), false);
  assert.equal(f('!Classic'), true);
  assert.equal(f('CLASSIC'), false);
  assert.equal(f('DF'), false);
  assert.equal(f('SOD'), false);
  assert.equal(f('DK'), false);
  assert.equal(f('DeathKnight'), false);
  assert.equal(analizarFiltro('Classic', ctx).avisos.length, 0);
  assert.equal(f('FOREVER'), true);
  assert.equal(f('forever'), true);
  assert.equal(f('!FOREVER'), false);
});

test('"10" es verdadero a nivel 10 y falso a nivel 9; "!10" al revés', () => {
  assert.deepEqual(f('10'), [['n:10']]);
  assert.equal(ev('10', { nivel: 10 }), true);
  assert.equal(ev('10', { nivel: 9 }), false);
  assert.equal(ev('!10', { nivel: 9 }), true);
  assert.equal(ev('!10', { nivel: 10 }), false);
});

test('las clases se comparan sin distinguir mayúsculas y las razas no', () => {
  assert.deepEqual(f('mage'), [['c:MAGE']]);
  assert.deepEqual(f('MAGE'), [['c:MAGE']]);
  const r = analizarFiltro('orc', ctx);
  assert.equal(r.filtro, false);
  assert.equal(r.avisos.length, 1);
});

test('sexo e idioma', () => {
  assert.deepEqual(f('Male'), [['s:male']]);
  assert.deepEqual(f('FEMALE'), [['s:female']]);
  assert.deepEqual(f('esES'), [['l:esES']]);
  assert.equal(ev('male', { sexo: 'male' }), true);
  assert.equal(ev('male', { sexo: 'female' }), false);
  assert.equal(ev('male'), false);
  assert.equal(ev('!male'), true);
  assert.equal(ev('esES', { idioma: 'esES' }), true);
  assert.equal(ev('esES', { idioma: 'enUS' }), false);
  assert.equal(ev('esES'), false);
});

test('simplificación de grupos siempre verdaderos o falsos', () => {
  assert.deepEqual(f('Horde Classic/Mage'), [['c:MAGE']]);
  assert.equal(f('Horde Classic/FOREVER'), true);
  assert.deepEqual(f('Mage !Classic'), [['c:MAGE']]);
  assert.equal(f('Mage !Mage'), false);
  assert.deepEqual(f('Mage/Mage'), [['c:MAGE']]);
  assert.equal(f('Mage Mage')[0].length, 1);
});

test('vacío, solo espacios o solo "/"', () => {
  assert.equal(f(''), false);
  assert.equal(f('   '), true);
  assert.equal(f('/'), false);
  assert.deepEqual(f('Mage/'), [['c:MAGE']]);
});

test('paréntesis: se evalúan antes, hasta el primer ")"', () => {
  // (Mage/Priest) Horde  =>  Horde Mage / Horde Priest
  assert.deepEqual(f('Horde (Mage/Priest)'), [['f:Horde', 'c:MAGE'], ['f:Horde', 'c:PRIEST']]);
  assert.equal(ev('Horde (Mage/Priest)', { clase: 'PRIEST' }), true);
  assert.equal(ev('Horde (Mage/Priest)', { clase: 'HUNTER' }), false);
  // negado
  assert.equal(ev('Horde !(Mage/Priest)', { clase: 'HUNTER' }), true);
  assert.equal(ev('Horde !(Mage/Priest)', { clase: 'MAGE' }), false);
  assert.equal(ev('Horde !(Mage/Priest)', { clase: 'HUNTER', faccion: 'Alliance' }), false);
  // paréntesis con O fuera
  assert.equal(ev('(Orc Mage)/Tauren', { raza: 'Tauren', clase: 'HUNTER' }), true);
  assert.equal(ev('(Orc Mage)/Tauren', { raza: 'Troll', clase: 'MAGE' }), false);
  // "()" vacío es falso (parse("") no tiene grupos), "!()" verdadero
  assert.equal(f('Mage ()'), false);
  assert.deepEqual(f('Mage !()'), [['c:MAGE']]);
  // constantes dentro de paréntesis
  assert.equal(f('(Classic)'), false);
  assert.equal(f('!(Classic)'), true);
  // dos paréntesis seguidos: el primero acaba en el primer ")"
  assert.deepEqual(f('(Orc)(Mage)'), [['r:Orc', 'c:MAGE']]);
});

test('paréntesis sin cerrar o con anidado se tratan como el original', () => {
  // m = "Orc (Mage" -> el "(" suelto se ignora; queda " Priest)" con ")" ignorado
  assert.deepEqual(f('(Orc (Mage) Priest)'), [['r:Orc', 'c:MAGE', 'c:PRIEST']]);
  assert.deepEqual(f('(Mage'), [['c:MAGE']]);
});

test('el aviso de término desconocido sale una vez por aparición', () => {
  const r = analizarFiltro('Maget Foo/Foo', ctx);
  assert.equal(r.filtro, false);
  assert.equal(r.avisos.length, 3);
  assert.ok(r.avisos.every((a) => a.linea === 7));
});

test('un término desconocido negado es verdadero', () => {
  assert.equal(f('!Maget'), true);
  assert.equal(analizarFiltro('!Maget', ctx).avisos.length, 1);
});

test('filtroATexto escribe notación legible y se puede volver a analizar', () => {
  assert.equal(filtroATexto(true), 'true');
  assert.equal(filtroATexto(false), 'false');
  assert.equal(filtroATexto([['f:Horde', 'c:HUNTER'], ['f:Horde', '!c:SHAMAN', 'n:10']]), 'Horde Hunter/Horde !Shaman 10');
  for (const t of ['!Orc !Troll', 'Warrior/Shaman', 'Horde Hunter/Horde Shaman', 'Undead Mage', 'male esES 12', 'Horde (Mage/Priest)']) {
    const a = f(t);
    assert.deepEqual(f(filtroATexto(a)), a, t);
  }
});

test('evaluarFiltro acepta true y false directos', () => {
  assert.equal(evaluarFiltro(true, pjBase), true);
  assert.equal(evaluarFiltro(false, pjBase), false);
});
