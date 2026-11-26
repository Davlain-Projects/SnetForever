// Banco de pruebas, tarea D4, ronda 1 de arreglos: más bloqueo en combate, type() de los secretos, ponerNpc,
// reciclado de placas y BANCO.guidCriatura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const MARCOS = `CONT = CreateFrame("Frame", "SnetForeverCont", UIParent); CONT:SetSize(100, 50); CONT:SetPoint("LEFT", 20, -120)
  CONT:SetMovable(true)
  BOT = CreateFrame("Button", "SnetForeverBot", CONT, "SecureActionButtonTemplate"); BOT:SetSize(26, 26)
  BOT:SetMovable(true)`;

// Cada método nuevo del bloqueo, con la forma de llamarlo y lo que tiene que seguir igual.
const METODOS = [
  ['SetParent', 'SetParent(UIParent)', (m, marco) => m.lua(`${marco}:GetParent() == ${marco === 'BOT' ? 'CONT' : 'UIParent'}`) === true],
  ['StartMoving', 'StartMoving()', (m) => m.llamadas('StartMoving').length === 0],
  ['StopMovingOrSizing', 'StopMovingOrSizing()', () => true],
  ['EnableMouse', 'EnableMouse(true)', (m, marco) => m.lua(`${marco}:IsMouseEnabled()`) === false],
  ['SetScale', 'SetScale(2)', (m, marco) => m.lua(`${marco}:GetScale()`) === 1],
];

for (const [metodo, llamada, sigueIgual] of METODOS) {
  test(`combate: ${metodo} del botón seguro y de su padre se bloquea; fuera de combate funciona`, () => {
    const m = nuevaMaquina();
    m.lua(MARCOS);
    m.jugador({ enCombate: true });
    for (const marco of ['BOT', 'CONT']) {
      m.lua(`${marco}:${llamada}`);
      assert.ok(sigueIgual(m, marco), `${marco}:${llamada} no tenía que cambiar nada`);
    }
    assert.deepEqual(m.bloqueos().map((b) => b.funcion), [`Button:${metodo}()`, `Frame:${metodo}()`]);
    // Un marco normal no se bloquea.
    m.lua('LIBRE = CreateFrame("Frame", nil, UIParent); LIBRE:SetMovable(true)');
    m.lua(`LIBRE:${llamada}`);
    assert.equal(m.bloqueos().length, 2);
    // Fuera de combate no hay bloqueo.
    m.jugador({ enCombate: false });
    m.lua(`BOT:${llamada}`);
    assert.equal(m.bloqueos().length, 2);
    sinErrores(m);
  });
}

test('type() de un secreto es el tipo subyacente («string» por defecto), y tostring falla', () => {
  const m = nuevaMaquina();
  m.placa('nameplate1', { guid: m.lua('BANCO.guidCriatura(3)'), nombre: 'Flesh Eater', nombreSecreto: true, guidSecreto: true });
  assert.equal(m.lua('type(UnitName("nameplate1"))'), 'string');
  assert.equal(m.lua('type(UnitGUID("nameplate1"))'), 'string');
  assert.equal(m.lua('issecretvalue(UnitName("nameplate1"))'), true);
  assert.equal(m.lua('type(BANCO.secreto("number"))'), 'number');
  // Lo demás se queda como estaba.
  assert.equal(m.lua('type(nil)'), 'nil');
  assert.equal(m.lua('type({})'), 'table');
  assert.equal(m.lua('type("x")'), 'string');
  assert.equal(m.lua('type(print)'), 'function');
  assert.equal(m.lua('(pcall(type))'), false);
  // tostring (y todo lo que lo use) falla; también string.format y print.
  for (const uso of ['tostring(UnitName("nameplate1"))', 'string.format("%s", UnitName("nameplate1"))', 'print(UnitName("nameplate1"))']) {
    assert.equal(m.lua(`(pcall(function() return ${uso} end))`), false, uso);
  }
  assert.match(m.lua('select(2, pcall(tostring, UnitName("nameplate1")))'), /secret value/);
  sinErrores(m);
});

test('ponerNpc(guid) crea también la unidad npc, con nombre opcional, y ponerNpc(nil) la quita', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('UnitExists("npc")'), false);
  const guid = m.lua('BANCO.guidCriatura(3143)');
  m.lua(`BANCO.ponerNpc("${guid}", "Gornek")`);
  assert.equal(m.lua('UnitExists("npc")'), true);
  assert.equal(m.lua('UnitGUID("npc")'), guid);
  assert.equal(m.lua('UnitName("npc")'), 'Gornek');
  assert.equal(m.lua('UnitIsPlayer("npc")'), false);
  m.lua('BANCO.ponerNpc("Player-1-00000009")');
  assert.equal(m.lua('UnitIsPlayer("npc")'), true);
  assert.equal(m.lua('UnitName("npc")'), undefined);
  m.lua('BANCO.ponerNpc(nil)');
  assert.equal(m.lua('UnitExists("npc")'), false);
  assert.equal(m.lua('UnitGUID("npc")'), undefined);
  sinErrores(m);
});

test('guidCriatura(id): GUID de criatura con el id de PNJ en el 6.º campo y uid distinto cada vez', () => {
  const m = nuevaMaquina();
  const a = m.lua('BANCO.guidCriatura(3)');
  const b = m.lua('BANCO.guidCriatura(3)');
  assert.notEqual(a, b);
  for (const guid of [a, b]) {
    assert.equal(m.lua(`string.match("${guid}", "^%a+%-%d+%-%d+%-%d+%-%d+%-(%d+)%-")`), '3');
  }
  assert.equal(m.lua('BANCO.guidCriatura(10176, 255)'), 'Creature-0-1-0-0-10176-00000000FF');
  sinErrores(m);
});

test('reciclarPlacas: la base de una placa quitada se reutiliza (con sus hijos) y sin la opción cada placa es nueva', () => {
  const m = nuevaMaquina();
  m.placa('nameplate1', { nombre: 'A' });
  m.lua('BASE1 = C_NamePlate.GetNamePlateForUnit("nameplate1")');
  m.quitarPlaca('nameplate1');
  m.placa('nameplate2', { nombre: 'B' });
  assert.equal(m.lua('C_NamePlate.GetNamePlateForUnit("nameplate2") == BASE1'), false);
  m.quitarPlaca('nameplate2');

  m.lua('BANCO.reciclarPlacas = true');
  m.placa('nameplate3', { nombre: 'C' });
  m.lua('BASE3 = C_NamePlate.GetNamePlateForUnit("nameplate3"); MARCA = CreateFrame("Frame", nil, BASE3)');
  m.quitarPlaca('nameplate3');
  assert.equal(m.lua('BASE3:IsShown()'), false);
  m.placa('nameplate4', { nombre: 'D', prohibida: true });
  assert.equal(m.lua('C_NamePlate.GetNamePlateForUnit("nameplate4") == BASE3'), true);
  assert.equal(m.lua('BASE3.namePlateUnitToken'), 'nameplate4');
  assert.equal(m.lua('BASE3:IsShown()'), true);
  assert.equal(m.lua('BASE3:IsForbidden()'), true);
  assert.equal(m.lua('MARCA:GetParent() == BASE3'), true);
  assert.equal(m.lua('#C_NamePlate.GetNamePlates()'), 1);
  // Con dos placas a la vez no se comparte la base.
  m.placa('nameplate5', { nombre: 'E' });
  assert.equal(m.lua('C_NamePlate.GetNamePlateForUnit("nameplate5") == BASE3'), false);
  sinErrores(m);
});
