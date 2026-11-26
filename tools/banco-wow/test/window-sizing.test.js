import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio } from './ayuda.js';

test('Window settings enlarge open and newly opened panels and restore an independent drag', () => {
  let m = nuevaMaquina();
  m.lua('SnetForever.Panel.abrir("ventana"); SnetForever.Chat.abrir()');
  const toggle = 'SnetForever.Panel.controles["auction.largeText"]';
  const before = m.lua('{SnetForeverPanel:GetScale(), SnetForeverChat:GetScale()}');
  m.lua(toggle + ':Click()');
  const after = m.lua('{SnetForeverPanel:GetScale(), SnetForeverChat:GetScale()}');
  assert.ok(after.every((n, i) => n > before[i]));
  m.lua('SnetForever.Fallo.abrir()');
  assert.ok(m.lua('SnetForeverFallo:GetScale()') > 1);
  m.lua(`local g = SnetForeverChat.sizingGrip
    BANCO.cursor = {x=300,y=300}
    g:GetScript("OnMouseDown")(g,"LeftButton")
    BANCO.cursor = {x=395,y=220}
    g:GetScript("OnMouseUp")(g,"LeftButton")`);
  assert.ok(m.lua('SnetForeverChat:GetScale()') > after[1]);
  assert.equal(m.lua('SnetForeverPanel:GetScale()'), after[0]);
  m = m.recargar();
  m.lua('SnetForever.Chat.abrir()');
  assert.ok(m.lua('SnetForeverChat:GetScale()') > after[1]);
  sinErrores(m);
});

testConComercio('the main commerce tabs resize separately from the auction tabs', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.Principal.abrir("grupos")');
  const tab = 'SnetForever.Principal.marcos.pestanas.grupos';
  const before = m.lua('{'+tab+'.layoutWidth,'+tab+'.layoutHeight}');
  m.lua(`local grip = ${tab}.resizeGrip
    BANCO.cursor = {x=200,y=300}
    grip:GetScript("OnMouseDown")(grip,"LeftButton")
    BANCO.cursor = {x=250,y=285}
    grip:GetScript("OnMouseUp")(grip,"LeftButton")`);
  sinErrores(m);
  const saved = m.lua('SnetForeverCuenta.comercio.principalTabSizes.grupos');
  assert.ok(saved.width > before[0] && saved.height > before[1]);
  assert.equal(m.lua('SnetForeverCuenta.comercio.auctionTabSizes'), undefined);
  sinErrores(m);
});

test('protected target controls adopt the text preference after combat', () => {
  const m = nuevaMaquina({ sinComercio: true });
  m.lua('SnetForever.Objetivos.crear()');
  const scale = () => m.lua('SnetForeverObjetivos:GetScale()');
  const before = scale();
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  m.lua('SnetForever.Ajustes.set("auction.largeText", true)');
  assert.equal(scale(), before);
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.ok(scale() > before);
  sinErrores(m);
});
