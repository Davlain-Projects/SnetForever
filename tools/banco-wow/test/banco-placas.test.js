// Banco de pruebas, tarea D4 (B5): unidades, placas de nombre, valores secretos, CVars, marcos seguros y bloqueo en
// combate. Lo usan «Objetivos cercanos» (D5, detección, y D6, marco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const GUID_LOBO = 'Creature-0-1-0-0-3-0000ABCDEF';
const GUID_GORNEK = 'Creature-0-1-0-0-3143-0000000001';

test('unidades: target y mouseover dan nombre, GUID, muerto y si es jugador; player sigue igual', () => {
  const m = nuevaMaquina();
  m.unidad('target', { guid: GUID_LOBO, nombre: 'Flesh Eater' });
  m.unidad('mouseover', { guid: 'Player-1-00000002', nombre: 'Otro', jugador: true, muerto: true });
  assert.equal(m.lua('UnitName("target")'), 'Flesh Eater');
  assert.equal(m.lua('UnitGUID("target")'), GUID_LOBO);
  assert.equal(m.lua('UnitIsDead("target")'), false);
  assert.equal(m.lua('UnitIsPlayer("target")'), false);
  assert.equal(m.lua('UnitExists("target")'), true);
  assert.equal(m.lua('UnitName("mouseover")'), 'Otro');
  assert.equal(m.lua('UnitIsDead("mouseover")'), true);
  assert.equal(m.lua('UnitIsPlayer("mouseover")'), true);
  assert.equal(m.lua('UnitName("player")'), 'Prueba');
  assert.equal(m.lua('UnitGUID("player")'), 'Player-1-00000001');
  assert.equal(m.lua('UnitIsPlayer("player")'), true);
  assert.equal(m.lua('UnitIsDead("player")'), false);
  sinErrores(m);
});

test('unidades: una unidad que no existe da nil/false, y una que el banco no imita da «no imitado»', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('{UnitName("target")}'), []);
  assert.deepEqual(m.lua('{UnitGUID("mouseover")}'), []);
  assert.deepEqual(m.lua('{UnitName("nameplate3")}'), []);
  assert.equal(m.lua('UnitExists("target")'), false);
  assert.equal(m.lua('UnitIsDead("target")'), false);
  assert.equal(m.lua('UnitIsPlayer("target")'), false);
  assert.throws(() => m.lua('UnitName("focus")'), /no imitado: UnitName solo admite/);
  assert.throws(() => m.unidad('focus', { nombre: 'x' }), /unidad: no se imita/);
  assert.throws(() => m.unidad('target', { color: 'rojo' }), /unidad: campo desconocido/);
  m.unidad('target', { nombre: 'x' });
  m.unidad('target', undefined);
  assert.equal(m.lua('UnitExists("target")'), false);
  sinErrores(m);
});

test('unidades: la unidad «npc» con el GUID de ponerNpc o con ponerUnidad, y UnitIsUnit compara por GUID', () => {
  const m = nuevaMaquina();
  m.lua(`BANCO.ponerNpc("${GUID_LOBO}")`);
  assert.equal(m.lua('UnitGUID("npc")'), GUID_LOBO);
  m.unidad('npc', { guid: GUID_GORNEK, nombre: 'Gornek' });
  assert.equal(m.lua('UnitGUID("npc")'), GUID_GORNEK);
  assert.equal(m.lua('UnitName("npc")'), 'Gornek');
  m.unidad('target', { guid: GUID_LOBO, nombre: 'Flesh Eater' });
  m.unidad('mouseover', { guid: GUID_LOBO, nombre: 'Flesh Eater' });
  m.unidad('pet', { guid: 'Pet-0-1-0-0-1-0000000002', nombre: 'Mascota' });
  assert.equal(m.lua('UnitIsUnit("target", "mouseover")'), true);
  assert.equal(m.lua('UnitIsUnit("target", "pet")'), false);
  assert.equal(m.lua('UnitIsUnit("target", "player")'), false);
  assert.equal(m.lua('UnitIsUnit("player", "player")'), true);
  assert.equal(m.lua('UnitIsUnit("target", "nameplate9")'), false);
  sinErrores(m);
});

test('placas: ponerPlaca lanza NAME_PLATE_UNIT_ADDED; GetNamePlates y GetNamePlateForUnit dan el marco base', () => {
  const m = nuevaMaquina();
  m.lua(`VISTO = {}
    local f = CreateFrame("Frame")
    f:RegisterEvent("NAME_PLATE_UNIT_ADDED"); f:RegisterEvent("NAME_PLATE_UNIT_REMOVED")
    f:SetScript("OnEvent", function(_, ev, unidad) VISTO[#VISTO + 1] = ev .. ":" .. unidad end)`);
  m.placa('nameplate1', { guid: GUID_LOBO, nombre: 'Flesh Eater' });
  m.placa('nameplate2', { guid: GUID_GORNEK, nombre: 'Gornek' });
  assert.deepEqual(m.lua('VISTO'), ['NAME_PLATE_UNIT_ADDED:nameplate1', 'NAME_PLATE_UNIT_ADDED:nameplate2']);
  assert.equal(m.lua('#C_NamePlate.GetNamePlates()'), 2);
  assert.equal(m.lua('C_NamePlate.GetNamePlates()[1].namePlateUnitToken'), 'nameplate1');
  assert.equal(m.lua('C_NamePlate.GetNamePlates()[2].namePlateUnitToken'), 'nameplate2');
  assert.equal(m.lua('C_NamePlate.GetNamePlateForUnit("nameplate2") == C_NamePlate.GetNamePlates()[2]'), true);
  assert.equal(m.lua('C_NamePlate.GetNamePlateForUnit("nameplate7")'), undefined);
  assert.equal(m.lua('UnitName("nameplate1")'), 'Flesh Eater');
  assert.equal(m.lua('UnitGUID("nameplate2")'), GUID_GORNEK);
  assert.equal(m.lua('UnitIsDead("nameplate1")'), false);
  sinErrores(m);
});

test('placas: la placa cuelga de UIParent, se le puede colgar un marco y IsForbidden se configura', () => {
  const m = nuevaMaquina();
  const globalesAntes = m.globalesNuevas();
  m.placa('nameplate1', { nombre: 'A' });
  m.placa('nameplate2', { nombre: 'B', prohibida: true });
  assert.equal(m.lua('C_NamePlate.GetNamePlateForUnit("nameplate1"):GetParent() == UIParent'), true);
  assert.equal(m.lua('C_NamePlate.GetNamePlateForUnit("nameplate1"):IsForbidden()'), false);
  assert.equal(m.lua('C_NamePlate.GetNamePlateForUnit("nameplate2"):IsForbidden()'), true);
  m.lua(`local base = C_NamePlate.GetNamePlateForUnit("nameplate1")
    local marca = CreateFrame("Frame", nil, base); marca:SetSize(16, 16); marca:SetPoint("BOTTOM", base, "TOP", 0, 2)`);
  assert.equal(m.lua('select("#", C_NamePlate.GetNamePlateForUnit("nameplate1"):GetChildren())'), 1);
  assert.deepEqual(m.globalesNuevas(), globalesAntes);
  sinErrores(m);
});

test('placas: quitarPlaca lanza NAME_PLATE_UNIT_REMOVED con la unidad aún válida (o sin GUID) y luego la borra', () => {
  const m = nuevaMaquina();
  m.lua(`DATOS = {}
    local f = CreateFrame("Frame")
    f:RegisterEvent("NAME_PLATE_UNIT_REMOVED")
    f:SetScript("OnEvent", function(_, _, unidad)
      DATOS[#DATOS + 1] = {unidad, UnitName(unidad), tostring(UnitGUID(unidad)), C_NamePlate.GetNamePlateForUnit(unidad) ~= nil}
    end)`);
  m.placa('nameplate1', { guid: GUID_LOBO, nombre: 'Flesh Eater' });
  m.placa('nameplate2', { guid: GUID_LOBO, nombre: 'Flesh Eater' });
  m.quitarPlaca('nameplate1');
  m.quitarPlaca('nameplate2', { sinGuid: true });
  assert.deepEqual(m.lua('DATOS[1]'), ['nameplate1', 'Flesh Eater', GUID_LOBO, true]);
  assert.deepEqual(m.lua('DATOS[2]'), ['nameplate2', 'Flesh Eater', 'nil', true]);
  assert.equal(m.lua('#C_NamePlate.GetNamePlates()'), 0);
  assert.equal(m.lua('C_NamePlate.GetNamePlateForUnit("nameplate1")'), undefined);
  assert.equal(m.lua('UnitExists("nameplate1")'), false);
  assert.throws(() => m.quitarPlaca('nameplate1'), /placa: no hay/);
  assert.throws(() => m.placa('target', {}), /placa: la unidad tiene que ser nameplateN/);
  m.placa('nameplate5', {});
  assert.throws(() => m.placa('nameplate5', {}), /placa: ya existe/);
  sinErrores(m);
});

test('valores secretos: issecretvalue, y comparar o tratar como texto un secreto da error de Lua', () => {
  const m = nuevaMaquina();
  m.lua('SECRETO = BANCO.secreto()');
  assert.equal(m.lua('issecretvalue(SECRETO)'), true);
  assert.equal(m.lua('issecretvalue("Flesh Eater")'), false);
  assert.equal(m.lua('issecretvalue(nil)'), false);
  assert.equal(m.lua('issecretvalue(5)'), false);
  assert.equal(m.lua('issecretvalue({})'), false);
  for (const operacion of ['SECRETO < "a"', 'SECRETO <= "a"', 'SECRETO .. "x"', '#SECRETO', 'string.lower(SECRETO)',
    'SECRETO == BANCO.secreto()', 'SECRETO.x', 'SECRETO + 1']) {
    assert.equal(m.lua(`(pcall(function() return ${operacion} end))`), false, operacion);
  }
  assert.match(m.lua('select(2, pcall(function() return SECRETO < "a" end))'), /attempt to compare a secret value$/);
  sinErrores(m);
});

test('valores secretos: UnitName y UnitGUID dan un secreto si la unidad lo pide, y la identidad real no se pierde', () => {
  const m = nuevaMaquina();
  m.placa('nameplate1', { guid: GUID_LOBO, nombre: 'Flesh Eater', nombreSecreto: true });
  m.placa('nameplate2', { guid: GUID_LOBO, nombre: 'Flesh Eater', guidSecreto: true });
  assert.equal(m.lua('issecretvalue(UnitName("nameplate1"))'), true);
  assert.equal(m.lua('issecretvalue(UnitGUID("nameplate1"))'), false);
  assert.equal(m.lua('UnitGUID("nameplate1")'), GUID_LOBO);
  assert.equal(m.lua('issecretvalue(UnitGUID("nameplate2"))'), true);
  assert.equal(m.lua('UnitName("nameplate2")'), 'Flesh Eater');
  assert.equal(m.lua('UnitIsUnit("nameplate1", "nameplate2")'), true);
  sinErrores(m);
});

test('issecretvalue se puede quitar con sinApi (cliente sin valores secretos)', () => {
  const m = nuevaMaquina({ sinApi: ['issecretvalue'] });
  assert.equal(m.lua('type(issecretvalue)'), 'nil');
  sinErrores(m);
});

test('SetPortraitTexture: admite player y las unidades puestas (placa, target, mouseover) y guarda la unidad', () => {
  const m = nuevaMaquina();
  m.lua('T = UIParent:CreateTexture(nil, "ARTWORK"); T:SetTexture("x")');
  m.placa('nameplate1', { nombre: 'A' });
  m.unidad('target', { nombre: 'B' });
  m.unidad('mouseover', { nombre: 'C' });
  for (const unidad of ['nameplate1', 'target', 'mouseover', 'player']) {
    m.lua(`SetPortraitTexture(T, "${unidad}")`);
    assert.equal(m.lua('BANCO.retrato(T)'), unidad);
  }
  assert.equal(m.lua('T:GetTexture()'), undefined);
  assert.throws(() => m.lua('SetPortraitTexture(T, "nameplate4")'), /solo admite 'player'/);
  assert.throws(() => m.lua('SetPortraitTexture(T, "focus")'), /solo admite 'player'/);
  assert.deepEqual(m.llamadas('SetPortraitTexture').map((l) => l[0]).filter((u) => u !== 'player').slice(0, 3), ['nameplate1', 'target', 'mouseover']);
  sinErrores(m);
});

test('GetCVar: nameplateShowEnemies por defecto «1», se cambia con ponerCVar, y no hay SetCVar', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('GetCVar("nameplateShowEnemies")'), '1');
  m.cvar('nameplateShowEnemies', '0');
  assert.equal(m.lua('GetCVar("nameplateShowEnemies")'), '0');
  assert.equal(m.lua('GetCVar("rotateMinimap")'), '0');
  assert.throws(() => m.lua('GetCVar("otroCVar")'), /no imitado: CVar otroCVar/);
  assert.throws(() => m.lua('SetCVar("nameplateShowEnemies", "1")'), /no imitado/);
  sinErrores(m);
});

test('CreateFrame con SecureActionButtonTemplate guarda la plantilla; SetAttribute y GetAttribute funcionan', () => {
  const m = nuevaMaquina();
  m.lua(`B = CreateFrame("Button", "SnetForeverBoton", UIParent, "SecureActionButtonTemplate")
    B:SetAttribute("type", "macro"); B:SetAttribute("macrotext", "/targetexact Gornek")`);
  assert.equal(m.lua('SnetForeverBoton:GetAttribute("type")'), 'macro');
  assert.equal(m.lua('SnetForeverBoton:GetAttribute("macrotext")'), '/targetexact Gornek');
  assert.equal(m.lua('SnetForeverBoton:GetAttribute("otro")'), undefined);
  m.lua('SnetForeverBoton:SetAttribute("type", nil)');
  assert.equal(m.lua('SnetForeverBoton:GetAttribute("type")'), undefined);
  const estado = m.marco('SnetForeverBoton');
  assert.equal(estado.plantilla, 'SecureActionButtonTemplate');
  assert.deepEqual(estado.atributos, { macrotext: '/targetexact Gornek' });
  assert.equal(m.marco('UIParent').plantilla, undefined);
  assert.throws(() => m.lua('CreateFrame("Button", nil, UIParent, "OtraPlantilla")'), /no imitado: plantilla OtraPlantilla/);
  assert.throws(() => m.lua('CreateFrame("Frame", nil, UIParent, "SecureActionButtonTemplate")'), /es de un Button/);
  assert.throws(() => m.lua('SnetForeverBoton:SetAttribute(3, 1)'), /el nombre tiene que ser texto/);
  sinErrores(m);
});

test('CreateFrame con plantilla segura puede fallar (creacionSeguraFalla) y el plan B del addon lo atrapa con pcall', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.creacionSeguraFalla = true');
  assert.equal(m.lua('(pcall(CreateFrame, "Button", nil, UIParent, "SecureActionButtonTemplate"))'), false);
  assert.equal(m.lua('(pcall(CreateFrame, "Button", nil, UIParent))'), true);
  sinErrores(m);
});

// Un contenedor con un botón seguro dentro, un marco normal y el icono (región) del botón.
const MARCOS_SEGUROS = `CONT = CreateFrame("Frame", "SnetForeverCont", UIParent); CONT:SetSize(100, 50); CONT:SetPoint("LEFT", 20, -120)
  BOT = CreateFrame("Button", "SnetForeverBot", CONT, "SecureActionButtonTemplate"); BOT:SetSize(26, 26)
  BOT:SetPoint("TOPLEFT", 6, -15); BOT:SetAttribute("macrotext", "/targetexact A")
  ICONO = BOT:CreateTexture(nil, "ARTWORK"); ICONO:SetAllPoints(); ICONO:SetTexture("Interface/Icons/INV_Sword_04")
  LIBRE = CreateFrame("Frame", "SnetForeverLibre", UIParent); LIBRE:SetSize(10, 10)`;

test('combate: Show, Hide, SetPoint, SetSize y SetAttribute del botón seguro y de su padre se bloquean sin lanzar', () => {
  const m = nuevaMaquina();
  m.lua(MARCOS_SEGUROS);
  m.jugador({ enCombate: true });
  m.lua(`ALERTAS = ""
    local f = CreateFrame("Frame")
    f:RegisterEvent("ADDON_ACTION_BLOCKED")
    f:SetScript("OnEvent", function(_, _, addon, funcion) ALERTAS = ALERTAS .. addon .. "|" .. funcion .. ";" end)`);
  const acciones = [
    'SnetForeverBot:Hide()', 'SnetForeverBot:Show()', 'SnetForeverBot:SetShown(false)',
    'SnetForeverBot:SetPoint("CENTER", 0, 0)', 'SnetForeverBot:SetSize(30, 30)',
    'SnetForeverBot:SetAttribute("macrotext", "/targetexact B")', 'SnetForeverBot:SetWidth(1)',
    'SnetForeverBot:SetHeight(1)', 'SnetForeverBot:ClearAllPoints()',
    'SnetForeverCont:Hide()', 'SnetForeverCont:SetPoint("TOP", 0, 0)', 'SnetForeverCont:SetSize(1, 1)',
  ];
  for (const accion of acciones) m.lua(accion);
  assert.equal(m.bloqueos().length, acciones.length);
  assert.deepEqual(m.bloqueos()[0], { funcion: 'Button:Hide()', marco: 'SnetForeverBot' });
  assert.deepEqual(m.bloqueos()[9], { funcion: 'Frame:Hide()', marco: 'SnetForeverCont' });
  assert.equal(m.llamadas('ADDON_ACTION_BLOCKED').length, acciones.length);
  assert.ok(m.lua('ALERTAS').startsWith('SnetForever|Button:Hide();SnetForever|Button:Show();'));
  // Nada ha cambiado.
  assert.equal(m.lua('SnetForeverBot:IsShown()'), true);
  assert.equal(m.lua('SnetForeverBot:GetWidth()'), 26);
  assert.equal(m.lua('SnetForeverCont:IsShown()'), true);
  assert.equal(m.lua('SnetForeverCont:GetWidth()'), 100);
  assert.equal(m.lua('SnetForeverBot:GetAttribute("macrotext")'), '/targetexact A');
  assert.equal(m.lua('SnetForeverBot:GetPoint()'), 'TOPLEFT');
  assert.equal(m.lua('SnetForeverCont:GetNumPoints()'), 1);
  assert.equal(m.lua('SnetForeverCont:GetPoint()'), 'LEFT');
  sinErrores(m);
});

test('combate: lo que no es protegido sigue funcionando (marco normal, regiones del botón, UIParent)', () => {
  const m = nuevaMaquina();
  m.lua(MARCOS_SEGUROS);
  m.jugador({ enCombate: true });
  m.lua('LIBRE:Hide(); LIBRE:SetSize(5, 5); LIBRE:SetPoint("CENTER"); LIBRE:SetAttribute("x", 1); LIBRE:Show()');
  assert.equal(m.lua('LIBRE:GetWidth()'), 5);
  assert.equal(m.lua('LIBRE:GetAttribute("x")'), 1);
  m.lua('ICONO:SetTexture("Interface/Icons/Otro"); ICONO:SetAlpha(0.45); ICONO:SetVertexColor(1, 0, 0); ICONO:Hide(); ICONO:Show()');
  assert.equal(m.lua('ICONO:GetAlpha()'), 0.45);
  assert.equal(m.lua('ICONO:GetTexture()'), 'Interface/Icons/Otro');
  m.lua('SetPortraitTexture(ICONO, "player")');
  assert.equal(m.lua('BANCO.retrato(ICONO)'), 'player');
  m.lua('UIParent:SetSize(1920, 1080)');
  assert.equal(m.bloqueos().length, 0);
  sinErrores(m);
});

test('combate: fuera de combate todo se puede, y al salir del combate lo aplazado se puede aplicar', () => {
  const m = nuevaMaquina();
  m.lua(MARCOS_SEGUROS);
  m.lua('BOT:Hide(); BOT:SetSize(30, 30); BOT:SetAttribute("macrotext", "/targetexact C")');
  assert.equal(m.lua('BOT:IsShown()'), false);
  assert.equal(m.lua('BOT:GetWidth()'), 30);
  m.jugador({ enCombate: true });
  m.lua('BOT:Show()');
  assert.equal(m.lua('BOT:IsShown()'), false);
  assert.equal(m.bloqueos().length, 1);
  m.jugador({ enCombate: false });
  m.lua('BOT:Show(); CONT:SetSize(7, 7)');
  assert.equal(m.lua('BOT:IsShown()'), true);
  assert.equal(m.lua('CONT:GetWidth()'), 7);
  assert.equal(m.bloqueos().length, 1);
  sinErrores(m);
});

test('combate: crear un marco seguro en combate apunta el bloqueo (uno normal, no)', () => {
  const m = nuevaMaquina();
  m.jugador({ enCombate: true });
  m.lua('CreateFrame("Frame", nil, UIParent); CreateFrame("Button", nil, UIParent)');
  assert.equal(m.bloqueos().length, 0);
  m.lua('CreateFrame("Button", nil, UIParent, "SecureActionButtonTemplate")');
  assert.equal(m.bloqueos().length, 1);
  assert.equal(m.bloqueos()[0].funcion, 'Button:CreateFrame()');
  sinErrores(m);
});
