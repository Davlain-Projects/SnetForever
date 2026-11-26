import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';

test('the notice folds into the bearing; the chart closes back to the same step', () => {
  const m = nuevaMaquina();
  const view = 'SnetForever.GuideViews';
  assert.equal(m.lua(view + '.mode()'), 'notice');
  const step = m.lua('SnetForever.Motor.estado().actual');
  m.lua(view + '.frames.notice.next:Click()');
  assert.equal(m.lua(view + '.frames.bearing:IsVisible()'), true);
  m.lua(view + '.frames.bearing.arrow:Click()');
  assert.equal(m.lua(view + '.frames.chart:IsVisible()'), true);
  m.lua(view + '.frames.chart.next:Click()');
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), step);
  m.lua('SnetForever.Ajustes.set("guide.favorite", "bearing")');
  m.disparar('QUEST_ACCEPTED', 1, 4641);
  assert.equal(m.lua(view + '.mode()'), 'bearing');
  m.lua('SnetForever.Ajustes.set("guide.favorite", "auto")');
  m.disparar('QUEST_ACCEPTED', 1, 4641);
  assert.equal(m.lua(view + '.mode()'), 'notice');
  sinErrores(m);
});

test('the chart draws a known path and removes old lines when only the destination remains', () => {
  const m = nuevaMaquina();
  m.lua(`local s = SnetForever
    s.Coord.jugador = function() return {wx=20,wy=10,inst=1} end
    s.Navegacion.destino = function() return {punto={wx=200,wy=200,inst=1}} end
    s.RutaPie.actual = function() return {{wx=90,wy=30,inst=1},{wx=200,wy=200,inst=1}}, 1 end
    s.GuideViews.frames.notice.next:Click()
    s.GuideViews.frames.bearing.arrow:Click()`);
  const chart = 'SnetForever.GuideViews.frames.chart';
  assert.equal(m.lua(chart + '.player:IsShown() and ' + chart + '.target:IsShown()'), true);
  assert.equal(m.lua('#' + chart + '.lines'), 2);
  m.lua('SnetForever.RutaPie.actual = function() return nil end; SnetForever.GuideViews.refresh()');
  assert.equal(m.lua(chart + '.lines[1]:IsShown() or ' + chart + '.lines[2]:IsShown()'), false);
  assert.equal(m.lua(chart + '.target:IsShown()'), true);
  m.lua('SnetForever.Navegacion.destino = function() return nil end; SnetForever.GuideViews.refresh()');
  assert.equal(m.lua(chart + '.target:IsShown()'), false);
  sinErrores(m);
});

test('all views read the inventory count from the same active step and the favorite survives reload', () => {
  let m = nuevaMaquina();
  const g = guiaDePrueba([{ elementos: [{ t: 'collect', i: 159, n: 5 }] }]);
  m.ponerGuia(g);
  m.lua('SnetForever.Guias.cargar(' + JSON.stringify(g.clave) + ')');
  m.objeto(159, 3);
  m.disparar('BAG_UPDATE_DELAYED');
  m.avanzar(0.3);
  const f = 'SnetForever.GuideViews.frames';
  assert.match(m.lua(f + '.notice.body:GetText()'), /3\/5/);
  m.lua(f + '.notice.next:Click()');
  m.objeto(159, 4);
  m.disparar('BAG_UPDATE_DELAYED');
  m.avanzar(0.3);
  assert.match(m.lua(f + '.bearing.progress:GetText()'), /4\/5/);
  m.lua(f + '.bearing.arrow:Click()');
  assert.match(m.lua(f + '.chart.progress:GetText()'), /4\/5/);
  m.lua('SnetForever.Ajustes.set("guide.favorite", "chart")');
  m = m.recargar();
  assert.equal(m.lua('SnetForever.GuideViews.mode()'), 'chart');
  m.lua('SnetForever.Ventana.mostrar(false)');
  assert.equal(m.lua(f + '.chart:IsVisible()'), false);
  sinErrores(m);
});

test('the forge gear opens window options and choosing a favorite switches the current view', () => {
  const m = nuevaMaquina();
  const f = 'SnetForever.GuideViews.frames';
  assert.match(m.lua(f + '.notice.plate:GetTexture()'), /forge-plate$/);
  assert.match(m.lua(f + '.notice.options.icon:GetTexture()'), /forge-controls$/);
  assert.match(m.lua('(' + f + '.notice.heading:GetFont())'), /AlegreyaSC-Bold\.ttf$/);
  assert.match(m.lua('(' + f + '.notice.body:GetFont())'), /BarlowSemiCondensed-Medium\.ttf$/);
  assert.match(m.lua('(' + f + '.bearing.distance:GetFont())'), /BarlowSemiCondensed-SemiBold\.ttf$/);
  assert.equal(m.lua(f + '.notice.pin'), undefined);
  m.lua(`local gear = ${f}.notice.options; gear:GetScript("OnEnter")(gear)`);
  assert.equal(m.lua('GameTooltip:GetOwner() == ' + f + '.notice.options'), true);
  m.lua(f + '.notice.options:Click()');
  assert.equal(m.lua('SnetForeverPanel:IsVisible()'), true);
  assert.equal(m.lua('SnetForever.Panel.marcos.elegido'), 'ventana');
  const favorite = 'SnetForever.Panel.controles["guide.favorite"]';
  m.lua(favorite + ':Click()');
  m.lua(favorite + '.filas[4]:Click()');
  assert.equal(m.lua('SnetForever.Ajustes.get("guide.favorite")'), 'chart');
  assert.equal(m.lua(f + '.chart:IsVisible()'), true);
  m.lua(f + '.chart.details:Click()');
  assert.equal(m.lua('SnetForeverVentana:IsVisible()'), true);
  assert.match(m.lua('(SnetForever.Ventana.marcos.titulo:GetFont())'), /AlegreyaSC-Bold\.ttf$/);
  m.lua('SnetForever.Ajustes.set("guide.favorite", "bearing")');
  assert.equal(m.lua(f + '.bearing:IsVisible()'), true);
  assert.equal(m.lua('SnetForeverVentana:IsVisible()'), false);
  sinErrores(m);
});

test('title opens the notice, unrelated quests keep the bearing, and combat follows the window setting', () => {
  const m = nuevaMaquina();
  const f = 'SnetForever.GuideViews.frames';
  m.lua(f + '.notice.next:Click()');
  m.disparar('QUEST_ACCEPTED', 1, 12345);
  assert.equal(m.lua(f + '.bearing:IsVisible()'), true);
  m.lua('SnetForever.Ajustes.set("ventana.ocultarEnCombate", true)');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua(f + '.bearing:IsVisible()'), false);
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua(f + '.bearing:IsVisible()'), true);
  m.lua(f + '.bearing.nameButton:Click()');
  assert.equal(m.lua(f + '.notice:IsVisible()'), true);
  m.lua(f + '.notice.details:Click()');
  assert.equal(m.lua('SnetForeverVentana:IsVisible()'), true);
  sinErrores(m);
});

test('Forge views share the saved guide position and release the Details menu on a view switch', () => {
  const m = nuevaMaquina();
  m.lua(`local f = SnetForever.GuideViews.frames.notice
    f:GetScript("OnDragStart")(f)
    f:ClearAllPoints()
    f:SetPoint("CENTER", UIParent, "CENTER", 45, -60)
    f:GetScript("OnDragStop")(f)
    f.next:Click()`);
  assert.deepEqual(m.lua('{select(4, SnetForever.GuideViews.frames.bearing:GetPoint())}'), [45, -60]);
  m.lua('SnetForever.GuideViews.frames.bearing.details:Click(); SnetForever.Ventana.abrirMenu()');
  assert.equal(m.lua('SnetForever.Ventana.marcos.menu:IsVisible()'), true);
  m.lua('SnetForever.Ajustes.set("guide.favorite", "chart")');
  assert.equal(m.lua('SnetForever.Ventana.marcos.menu:IsVisible()'), false);
  m.lua('SnetForever.Panel.restablecerPosiciones()');
  assert.deepEqual(m.lua('{select(4, SnetForever.GuideViews.frames.chart:GetPoint())}'), [36, 140]);
  sinErrores(m);
});
