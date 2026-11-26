import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guiaDePrueba, nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

function cargar(m, elementos) {
  const guia = guiaDePrueba([{ elementos }]);
  m.ponerGuia(guia);
  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(guia.clave)})`), true);
}

test('los objetos del paso se pueden usar por botón y se renuevan al salir de combate', () => {
  const m = nuevaMaquina();
  const boton = 'SnetForeverObjetoActivo1';
  m.objeto(159, 1);
  cargar(m, [{ t: 'use', is: [159] }, { t: 'manual', texto: { en: 'Test' } }]);
  assert.equal(m.lua(`${boton}:IsVisible()`), true);
  assert.equal(m.lua(`${boton}:GetAttribute("type")`), 'item');
  assert.equal(m.lua(`${boton}:GetAttribute("item")`), 'item:159');
  m.jugador({ enCombate: true });
  m.objeto(159, 0);
  m.disparar('BAG_UPDATE_DELAYED');
  assert.equal(m.lua(`${boton}:IsVisible()`), true);
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua(`${boton}:IsVisible()`), false);
  assert.match(m.lua('_G["BINDING_NAME_CLICK SnetForeverObjetivo1:LeftButton"]'), /1$/);
  m.lua(`C_Spell.GetSpellInfo = function(id) return {name = "Hechizo " .. id, iconID = 123} end
    IsPlayerSpell = function(id) return id == 556 end`);
  cargar(m, [{ t: 'usespell', spells: [557, 556] }, { t: 'manual', texto: { en: 'Test' } }]);
  assert.equal(m.lua(`${boton}:GetAttribute("type")`), 'spell');
  assert.equal(m.lua(`${boton}:GetAttribute("spell")`), 'Hechizo 556');
  sinErrores(m);
});

test('los diálogos automáticos actúan sobre el paso activo y dejan la recompensa ambigua al jugador', () => {
  const m = nuevaMaquina();
  m.estadoMision(4641, { enDiario: true, completa: true });
  cargar(m, [{ t: 'accept', q: 788 }, { t: 'turnin', q: 4641 }]);
  m.lua(`
    ACCIONES = {}
    IDS = 788
    OPCIONES = 2
    PAUSA = false
    GetQuestID = function() return IDS end
    IsControlKeyDown = function() return PAUSA end
    IsQuestCompletable = function() return true end
    GetNumQuestChoices = function() return OPCIONES end
    AcceptQuest = function() table.insert(ACCIONES, "aceptar") end
    CompleteQuest = function() table.insert(ACCIONES, "completar") end
    GetQuestReward = function(n) table.insert(ACCIONES, n) end
  `);
  m.disparar('QUEST_DETAIL');
  assert.deepEqual(m.lua('ACCIONES'), []);
  m.lua('SnetForever.Ajustes.set("guias.automatizar", true); IDS = 789');
  m.disparar('QUEST_DETAIL');
  m.lua('IDS = 788; PAUSA = true');
  m.disparar('QUEST_DETAIL');
  assert.deepEqual(m.lua('ACCIONES'), []);
  m.lua('PAUSA = false');
  m.disparar('QUEST_DETAIL');
  m.lua('IDS = 4641');
  m.disparar('QUEST_PROGRESS');
  m.disparar('QUEST_COMPLETE');
  assert.deepEqual(m.lua('ACCIONES'), ['aceptar', 'completar']);
  m.lua('OPCIONES = 1');
  m.disparar('QUEST_COMPLETE');
  assert.deepEqual(m.lua('ACCIONES'), ['aceptar', 'completar', 1]);
  m.lua(`
    C_GossipInfo.GetActiveQuests = function() return {{questID = 4641, isComplete = false}} end
    C_GossipInfo.GetAvailableQuests = function() return {{questID = 789}, {questID = 788}} end
    C_GossipInfo.SelectActiveQuest = function(q) table.insert(ACCIONES, "entrega:" .. q) end
    C_GossipInfo.SelectAvailableQuest = function(q) table.insert(ACCIONES, "oferta:" .. q) end
  `);
  m.disparar('GOSSIP_SHOW');
  assert.deepEqual(m.lua('ACCIONES'), ['aceptar', 'completar', 1, 'oferta:788']);
  sinErrores(m);
});
