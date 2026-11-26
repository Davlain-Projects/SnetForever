// Diario de objetos, tarea 1: las imitaciones del banco que necesita (botín, recompensas de misión, vendedor, correo,
// los textos «Recibes…» del chat y GetItemInfoInstant), comprobadas contra lo que dice wowpedia de cada función.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const ES = { jugador: { idioma: 'esES' } };
const EN = { jugador: { idioma: 'enUS' } };

test('banco diario: las globales LOOT_ITEM_* salen en el idioma del jugador', () => {
  const es = nuevaMaquina(ES);
  assert.equal(es.lua('LOOT_ITEM_PUSHED_SELF'), 'Recibes objeto: %s.');
  assert.equal(es.lua('LOOT_ITEM_SELF_MULTIPLE'), 'Recibes botín: %sx%d.');
  assert.equal(es.lua('LOOT_ITEM_CREATED_SELF'), 'Creas: %s.');
  const en = nuevaMaquina(EN);
  assert.equal(en.lua('LOOT_ITEM_SELF'), 'You receive loot: %s.');
  assert.equal(en.lua('LOOT_ITEM_PUSHED_SELF_MULTIPLE'), 'You receive item: %sx%d.');
  assert.equal(en.lua('LOOT_ITEM_CREATED_SELF_MULTIPLE'), 'You create: %sx%d.');
  // Cambiar el idioma del jugador también los cambia.
  en.jugador({ idioma: 'esMX' });
  assert.equal(en.lua('LOOT_ITEM_SELF'), 'Recibes botín: %s.');
  sinErrores(es);
  sinErrores(en);
});

test('banco diario: ponerBotin da GetNumLootItems, GetLootSlotLink y GetLootSourceInfo', () => {
  const m = nuevaMaquina();
  m.lua(`BANCO.ponerBotin({
    {"|cff1eff00|Hitem:5404::::::::|h[Sobrehombros]|h|r", "Creature-0-1-1-1-3098-0"},
    {"|cffffffff|Hitem:6414::::::::|h[Sello]|h|r", "GameObject-0-1-1-1-2843-0"},
  })`);
  assert.equal(m.lua('GetNumLootItems()'), 2);
  assert.match(m.lua('GetLootSlotLink(1)'), /item:5404/);
  assert.deepEqual(m.lua('{GetLootSourceInfo(1)}'), ['Creature-0-1-1-1-3098-0', 1]);
  assert.deepEqual(m.lua('{GetLootSourceInfo(2)}'), ['GameObject-0-1-1-1-2843-0', 1]);
  assert.equal(m.lua('GetLootSlotLink(3)'), undefined);
  sinErrores(m);
});

test('banco diario: ponerRecompensas da GetQuestID, GetNumQuestRewards/Choices y GetQuestItemLink', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.ponerRecompensas({q = 788, recompensas = {5404}, elegir = {6318, 6324}})');
  assert.equal(m.lua('GetQuestID()'), 788);
  assert.equal(m.lua('GetNumQuestRewards()'), 1);
  assert.equal(m.lua('GetNumQuestChoices()'), 2);
  assert.match(m.lua('GetQuestItemLink("reward", 1)'), /item:5404:/);
  assert.match(m.lua('GetQuestItemLink("choice", 2)'), /item:6324:/);
  assert.equal(m.lua('GetQuestItemLink("choice", 3)'), undefined);
  m.lua('GetQuestReward(1)');
  assert.deepEqual(m.llamadas('GetQuestReward').at(-1), [1]);
  sinErrores(m);
});

test('banco diario: ponerVendedor y ponerCorreo', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.ponerVendedor({npc = 3164, {5107, 125}, {2589, 13}})');
  assert.equal(m.lua('UnitGUID("npc")'), 'Creature-0-1-1-1-3164-0');
  assert.match(m.lua('GetMerchantItemLink(1)'), /item:5107:/);
  assert.equal(m.lua('select(3, GetMerchantItemInfo(1))'), 125);
  m.lua('BuyMerchantItem(1, 1)');
  assert.deepEqual(m.llamadas('BuyMerchantItem').at(-1), [1, 1]);
  m.lua(`BANCO.ponerCorreo({
    {indice = 1, adjunto = 1, id = 6324},
    {indice = 2, adjunto = 1, id = 6414, factura = {tipo = "buyer", jugador = "Alguien", puja = 14000}},
  })`);
  assert.match(m.lua('GetInboxItemLink(1, 1)'), /item:6324:/);
  assert.equal(m.lua('GetInboxInvoiceInfo(1)'), undefined);
  assert.deepEqual(m.lua('{GetInboxInvoiceInfo(2)}').slice(0, 4), ['buyer', 'Objeto 6414', 'Alguien', 14000]);
  m.lua('TakeInboxItem(2, 1)');
  assert.deepEqual(m.llamadas('TakeInboxItem').at(-1), [2, 1]);
  sinErrores(m);
});

test('banco diario: GetItemInfoInstant da equipLoc sin que el objeto esté en caché', () => {
  const m = nuevaMaquina();
  m.itemInfo(6318, { nombre: 'Bastón', equipa: 'INVTYPE_2HWEAPON', clase: 2, subclase: 10 });
  assert.deepEqual(m.lua('{GetItemInfoInstant(6318)}').slice(0, 4).concat(m.lua('select(6, GetItemInfoInstant(6318))')),
    [6318, '', '', 'INVTYPE_2HWEAPON', 2]);
  assert.equal(m.lua('select(4, GetItemInfoInstant("|cffffffff|Hitem:6318::::::::|h[Bastón]|h|r"))'), 'INVTYPE_2HWEAPON');
  // Un objeto que el banco no conoce: equipLoc vacío (no es equipo), nunca nil para un id válido.
  assert.equal(m.lua('select(4, GetItemInfoInstant(2589))'), '');
  assert.equal(m.lua('C_Item.GetItemInfoInstant(6318) == 6318'), true);
  sinErrores(m);
});

test('banco diario: disparar CHAT_MSG_LOOT, LOOT_OPENED y LOOT_CLOSED no da «no imitado»', () => {
  const m = nuevaMaquina();
  m.lua('BANCO_VISTOS = {} local f = CreateFrame("Frame") for _, e in ipairs({"CHAT_MSG_LOOT", "LOOT_OPENED", "LOOT_CLOSED"}) do f:RegisterEvent(e) end f:SetScript("OnEvent", function(_, e) BANCO_VISTOS[#BANCO_VISTOS + 1] = e end)');
  m.disparar('LOOT_OPENED', false, false);
  m.disparar('CHAT_MSG_LOOT', 'Recibes botín: x.', 'Prueba');
  m.disparar('LOOT_CLOSED');
  assert.deepEqual(m.lua('BANCO_VISTOS'), ['LOOT_OPENED', 'CHAT_MSG_LOOT', 'LOOT_CLOSED']);
  sinErrores(m);
});
