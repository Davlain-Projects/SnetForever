import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comprobarLua51 } from '../src/comprobar-lua51.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ADDON = join(RAIZ, 'addons', 'SnetForever');
// 0.7.0: el comercio es un addon aparte; el comprobador recorre también su carpeta.
const COMERCIO = join(RAIZ, 'addons', 'SnetForever_Comercio');

// Cada texto va en la línea 3, detrás de dos líneas limpias.
const enLinea3 = (texto) => `-- cabecera\nlocal a = 1\n${texto}\nlocal z = 2\n`;

const RECHAZADOS = [
  'a = b // c',
  'goto fin',
  '::fin::',
  'x = a & b',
  'x = a | b',
  'x = ~a',
  'x = a << 1',
  'table.unpack(t)',
  'bit.band(a, 1)',
  'local r = atan2(y, x)',
  'AcceptQuest()',
  'TargetUnit("x")',
  'CreateFrame("Button", nil, p, "SecureActionButtonTemplate")',
  'WorldMapFrame:AddDataProvider(p)',
  // Más casos de las listas de la tarea 1.
  'x = a >> 1',
  'table.move(a, 1, 2, 1, b)',
  'local k = math.type(x)',
  'local k = math.tointeger(x)',
  'local s = string.pack("i", 1)',
  'local n = utf8.len(s)',
  // Fallo en el juego (19-nov, Task 25): el cliente de WoW Forever no tiene la librería os.
  'local t = os.time()',
  'local d = os.date("%Y")',
  'local s = sin(30)',
  'C_GossipInfo.SelectOption(1)',
  'C_Container.UseContainerItem(0, 1)',
  'StaticPopup_Show("X")',
  'local p = WorldMapFrame.pinPools',
  'local t = "UIDropDownMenuTemplate"',
  'SetCVar("x", 1)',
  'SendChatMessage("hola", "SAY")',
  'local L = LibStub("AceLocale-3.0")',
  // Ronda 1: escapes de cadena que Lua 5.1 no tiene.
  's = "\\x41"',
  's = "\\u{41}"',
  's = "a\\z  b"',
  "s = 'b\\x42'",
  // Ronda 1: §4 con nombres prefijados, a través de _G y dentro de cadenas.
  'C_CVar.SetCVar("x", 1)',
  'C_QuestLog.AbandonQuest()',
  'C_QuestLog.SetAbandonQuest()',
  'C_Container.PickupContainerItem(0, 1)',
  'C_GossipInfo.SelectAvailableQuest(1)',
  'C_GossipInfo.SelectActiveQuest(1)',
  'C_ChatInfo.SendChatMessage("hola", "PARTY")',
  'local enviar = ChatFrame.SendChatMessage',
  '_G.AcceptQuest()',
  '_G["TargetUnit"]("x")',
  "_G[ 'SetCVar' ](\"a\", 1)",
  '_G.SendChatMessage("hola")',
  'local s = "StaticPopup"',
  'StaticPopupDialogs["SNF"] = {}',
  // Fase 4: nada que venda, use, equipe, coja o borre objetos.
  'UseInventoryItem(16)',
  'PickupInventoryItem(16)',
  'EquipItemByName("Espada")',
  'AutoEquipCursorItem()',
  'DeleteCursorItem()',
  'SplitContainerItem(0, 1, 2)',
  'SellCursorItem()',
  'C_Container.SplitContainerItem(0, 1, 2)',
  'C_Item.EquipItemByName("Espada")',
  '_G.UseInventoryItem(16)',
];

const ACEPTADOS = [
  'x = a ~= b',
  's = "|cff00ff00 // ~ & << |r"',
  '--[[ goto // ]]',
  's = [==[ a | b ]==]',
  'r = math.atan2(y, x)',
  't.AcceptQuest = 1',
  // Más casos: comentarios, cadenas con escapes, métodos y campos con nombres prohibidos.
  "s = 'goto \\' // '",
  's = "a\\"b | c"',
  '-- AcceptQuest() // goto',
  '--[==[ a\n | b ]] sigue ]==]',
  'local c = math.cos(r)',
  'self:CastSpellByName()',
  // Ronda 1: escapes de 5.1 y cadenas largas (sin escapes).
  's = "\\\\x41 \\\\z"',
  's = "\\65\\n\\t\\\\"',
  's = [[\\x41 \\z \\u{41}]]',
  'local v = _G.SnetForever',
  'local w = _G["SnetForeverX"]',
  // Fase 4: lecturas de contenedores que sí se pueden usar.
  'local n = C_Container.GetContainerNumSlots(0)',
  'local i = C_Container.GetContainerItemInfo(0, 1)',
  'self:UseInventoryItem()',
];

for (const texto of RECHAZADOS) {
  test(`rechaza: ${texto}`, () => {
    const r = comprobarLua51(enLinea3(texto), 'prueba.lua');
    assert.equal(r.length, 1, JSON.stringify(r));
    assert.equal(r[0].archivo, 'prueba.lua');
    assert.equal(r[0].linea, 3);
    assert.equal(typeof r[0].motivo, 'string');
    assert.ok(r[0].motivo.length > 0);
  });
}

for (const texto of ACEPTADOS) {
  test(`acepta: ${texto}`, () => {
    assert.deepEqual(comprobarLua51(enLinea3(texto), 'prueba.lua'), []);
  });
}

test('las cadenas y comentarios largos de varias líneas no descuentan líneas', () => {
  const texto = 's = [[\nuno\ndos]]\n--[[\n\n]]\nx = a // b\n';
  assert.deepEqual(comprobarLua51(texto, 'p.lua'), [{ archivo: 'p.lua', linea: 7, motivo: comprobarLua51('x = a // b', 'p.lua')[0].motivo }]);
});

function luaDe(dir) {
  const salida = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...luaDe(ruta));
    else if (entrada.name.endsWith('.lua')) salida.push(ruta);
  }
  return salida;
}

// Esta prueba se queda para siempre: cubre los archivos de cada tarea nueva.
test('todos los .lua de addons/SnetForever y addons/SnetForever_Comercio pasan el comprobador', () => {
  const archivos = [...luaDe(ADDON), ...luaDe(COMERCIO)];
  assert.ok(luaDe(ADDON).length > 0);
  assert.ok(luaDe(COMERCIO).length >= 17, 'los archivos del comercio');
  for (const ruta of archivos) {
    const nombre = relative(RAIZ, ruta).replace(/\\/g, '/');
    assert.deepEqual(comprobarLua51(readFileSync(ruta, 'utf8'), nombre), [], nombre);
  }
});

// Excepción aprobada (F3-10, tarea D6): SOLO ui/objetivos.lua puede usar SecureActionButtonTemplate (el botón que el
// jugador pulsa y fija el objetivo con /targetexact). Ninguna otra plantilla segura, ni en otro archivo.
const SEGURO = 'local b = CreateFrame("Button", nil, p, "SecureActionButtonTemplate")';
const OBJETIVOS = 'addons/SnetForever/ui/objetivos.lua';

test('F3-10: SecureActionButtonTemplate se acepta en ui/objetivos.lua (ruta del repositorio, relativa al addon o con barras invertidas)', () => {
  assert.deepEqual(comprobarLua51(enLinea3(SEGURO), OBJETIVOS), []);
  assert.deepEqual(comprobarLua51(enLinea3(SEGURO), 'ui/objetivos.lua'), []);
  assert.deepEqual(comprobarLua51(enLinea3(SEGURO), OBJETIVOS.replace(/\//g, '\\')), []);
});

test('F3-10: la misma línea en cualquier otro archivo sigue dando error', () => {
  for (const archivo of ['prueba.lua', 'addons/SnetForever/ui/ventana.lua', 'addons/SnetForever/ui/panel.lua',
    'addons/SnetForever/ui/objetivos2.lua', 'addons/SnetForever/ui/otro-objetivos.lua', 'addons/SnetForever/mapa/objetivos.lua']) {
    const r = comprobarLua51(enLinea3(SEGURO), archivo);
    assert.equal(r.length, 1, `${archivo}: ${JSON.stringify(r)}`);
    assert.equal(r[0].linea, 3);
    assert.match(r[0].motivo, /SecureActionButtonTemplate/);
  }
});

test('F3-10: en ui/objetivos.lua cualquier otra plantilla segura sigue dando error', () => {
  for (const plantilla of ['SecureHandlerStateTemplate', 'SecureHandlerBaseTemplate', 'SecureUnitButtonTemplate',
    'SecureActionButtonTemplateX', 'SecureActionButtonTemplate2']) {
    const r = comprobarLua51(enLinea3(`local b = CreateFrame("Button", nil, p, "${plantilla}")`), OBJETIVOS);
    assert.equal(r.length, 1, `${plantilla}: ${JSON.stringify(r)}`);
    assert.equal(r[0].linea, 3);
    assert.ok(r[0].motivo.includes(plantilla), `${plantilla}: ${r[0].motivo}`);
  }
});

test('F3-10: la excepción no tapa una segunda plantilla en la misma línea ni en una cadena larga', () => {
  const dos = 'x = {"SecureActionButtonTemplate", "SecureHandlerStateTemplate"}';
  const r = comprobarLua51(enLinea3(dos), OBJETIVOS);
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.match(r[0].motivo, /SecureHandlerStateTemplate/);
  const larga = 'x = [[\nSecureActionButtonTemplate\nSecureHandlerStateTemplate]]';
  const l = comprobarLua51(enLinea3(larga), OBJETIVOS);
  assert.deepEqual(l.map((e) => e.linea), [5]);
});

test('F3-10: las demás reglas siguen vigentes en ui/objetivos.lua (TargetUnit, SetRaidTarget, SetCVar, CreateMacro, //)', () => {
  for (const texto of ['TargetUnit("x")', 'SetRaidTarget("target", 8)', 'SetCVar("a", 1)', 'CreateMacro("a", 1, "b")', 'a = b // c']) {
    assert.equal(comprobarLua51(enLinea3(texto), OBJETIVOS).length, 1, texto);
  }
});

test('F3-10 ronda 1: la excepción pide límite de palabra a la izquierda (XSecureActionButtonTemplate sigue dando error)', () => {
  for (const nombre of ['XSecureActionButtonTemplate', '_SecureActionButtonTemplate', '9SecureActionButtonTemplate']) {
    const r = comprobarLua51(enLinea3(`local b = CreateFrame("Button", nil, p, "${nombre}")`), OBJETIVOS);
    assert.equal(r.length, 1, nombre);
    assert.equal(r[0].linea, 3);
  }
  assert.deepEqual(comprobarLua51(enLinea3('x = "a SecureActionButtonTemplate"'), OBJETIVOS), []);
});
