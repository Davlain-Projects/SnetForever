// Comercio, tarea 15e: nuestra ventana de la subasta se arrastra por la cabecera y guarda su posición
// (SnetForeverCuenta.comercio.ventanaSubasta); el clic derecho en la cabecera la devuelve a su sitio.
// Bloque B, Task B2: la ventana mide en píxeles reales (su escala ya no es la de UIParent) y guarda {x, y, ancho, alto} en
// píxeles. Las medidas de estas pruebas se pasan a unidades de UIParent (bordes) para seguir comparando con la subasta.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const V = 'SnetForever.UIComercio.marco()';
const CAB = `${V}.cabecera`;
const AH = 'AuctionHouseFrame';
// AuctionHouseFrame de prueba: 800 × 500, arriba a la izquierda, a 10 y 100 de la esquina.
const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}; AuctionHouseFrame:EnableMouse(true); ';
const ANCHO_PANTALLA = (1920 * 768) / 1080; // unidades de UIParent a lo ancho (alto 768)

function maquina() {
  const dir = mkdtempSync(join(tmpdir(), 'snf-arrastre-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' }, previo: SUBASTA });
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  return m;
}
const abrir = (m) => { m.disparar('AUCTION_HOUSE_SHOW'); m.avanzar(0.05); };
// Los bordes de un marco en unidades de UIParent (izquierda, derecha, arriba, abajo), sea cual sea su escala.
const bordes = (m, f) => m.lua(`(function() local k = ${f}:GetEffectiveScale() / UIParent:GetEffectiveScale()
  return {${f}:GetLeft() * k, ${f}:GetRight() * k, ${f}:GetTop() * k, ${f}:GetBottom() * k} end)()`);
// Lo que mide en unidades de UIParent una unidad de la ventana (BANCO.arrastre mueve en unidades de la ventana).
const k = (m) => m.lua(`${V}:GetEffectiveScale() / UIParent:GetEffectiveScale()`);
const ancho = (m) => { const b = bordes(m, V); return b[1] - b[0]; };
const guardada = (m) => m.lua('SnetForeverCuenta.comercio.ventanaSubasta');
// Un arrastre como el del cliente: sin ratón, el banco mueve lo que diga BANCO.arrastre al soltar.
function arrastrar(m, x, y, marco = CAB) {
  m.lua(`BANCO.arrastre = {x = ${x}, y = ${y}}`);
  m.lua(`${marco}:GetScript("OnDragStart")(${marco})`);
  m.lua(`${marco}:GetScript("OnDragStop")(${marco})`);
}
const clicDerecho = (m) => m.lua(`${CAB}:GetScript("OnMouseUp")(${CAB}, "RightButton")`);

test('arrastrar la cabecera mueve la ventana y al soltar guarda {x, y, ancho, alto} redondeados', () => {
  const m = maquina();
  abrir(m);
  assert.equal(m.lua(`${V}:IsMovable()`), true);
  assert.equal(m.lua(`${V}:IsClampedToScreen()`), true);
  assert.equal(guardada(m), undefined, 'sin arrastrar no se guarda nada');
  const antes = bordes(m, V);
  arrastrar(m, 30, -20.4);
  const despues = bordes(m, V);
  assert.ok(Math.abs(despues[0] - (antes[0] + 30 * k(m))) < 0.01, 'se movió a la derecha');
  assert.ok(Math.abs(despues[2] - (antes[2] - 20.4 * k(m))) < 0.01, 'se movió abajo');
  // En píxeles: la esquina de arriba a la izquierda desde la de la pantalla (y hacia abajo) y el tamaño.
  const px = 1080 / 768;
  assert.deepEqual(guardada(m), { x: Math.round(despues[0] * px), y: Math.round((768 - despues[2]) * px), ancho: Math.round(800 * px), alto: Math.round(500 * px) });
  assert.deepEqual(guardada(m), m.lua('SnetForever.SubastaVentana.sitioActual()'));
  sinErrores(m);
});

test('la cabecera arrastra con el botón izquierdo y los botones de la cabecera no', () => {
  const m = maquina();
  abrir(m);
  assert.equal(m.lua(`type(${CAB}:GetScript("OnDragStart"))`), 'function');
  for (const b of [`${CAB}.cerrar`, `${V}.verBlizzard`]) {
    assert.equal(m.lua(`${b}:GetScript("OnDragStart")`), undefined, `${b} no arrastra`);
    assert.equal(m.lua(`${b}:GetScript("OnMouseDown")`), undefined);
    assert.equal(m.lua(`${b}:GetScript("OnMouseUp")`), undefined);
  }
  // El clic izquierdo suelto en la cabecera no borra ni guarda nada.
  m.lua(`${CAB}:GetScript("OnMouseUp")(${CAB}, "LeftButton")`);
  assert.equal(guardada(m), undefined);
  sinErrores(m);
});

test('al cerrar y volver a abrir la subasta, la ventana sale donde se dejó (y tras recargar la interfaz)', () => {
  const m = maquina();
  abrir(m);
  arrastrar(m, 100, -60);
  const donde = bordes(m, V);
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrir(m);
  const otra = bordes(m, V);
  assert.ok(Math.abs(otra[0] - donde[0]) < 1 && Math.abs(otra[2] - donde[2]) < 1, `en ${otra} y no en ${donde}`);
  assert.ok(Math.abs(ancho(m) - 800) < 0.01, 'con el tamaño de la subasta (guardado al soltar): no encoge');
  assert.ok(Math.abs(otra[2] - otra[3] - 500) < 1, "el alto, redondeado a píxeles enteros al guardarlo");
  assert.equal(m.lua(`${V}:IsShown()`), true);
  sinErrores(m);
  const antesDeRecargar = guardada(m);
  const r = m.recargar();
  assert.deepEqual(guardada(r), antesDeRecargar, 'la posición sobrevive a recargar');
  r.lua(SUBASTA);
  abrir(r);
  const tras = bordes(r, V);
  assert.ok(Math.abs(tras[0] - donde[0]) < 1 && Math.abs(tras[2] - donde[2]) < 1, `tras recargar en ${tras}`);
  sinErrores(r);
});

test('una posición guardada fuera de la pantalla se mete dentro (también la de antes del bloque B, {x, y} en unidades de UIParent)', () => {
  const casos = [{ x: 5000, y: -300 }, { x: -900, y: 4000 }, { x: 600, y: -5000 }, { x: 1300, y: 200 }];
  for (const c of casos) {
    const m = maquina();
    m.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = ${c.x}, y = ${c.y}}`);
    abrir(m);
    const [izq, der, arriba, abajo] = bordes(m, V);
    const dentro = izq >= -0.01 && abajo >= -0.01 && der <= ANCHO_PANTALLA + 0.01 && arriba <= 768.01;
    assert.ok(dentro, `${JSON.stringify(c)} salió en ${izq} ${der} ${arriba} ${abajo}`);
    assert.ok(Math.abs(ancho(m) - 800) < 0.01, 'sin tamaño guardado, el de la subasta');
    assert.ok(abajo >= 24 - 0.01, `deja sitio a la pestaña de abajo: ${abajo}`);
    sinErrores(m);
  }
});

test('una posición guardada rota (sin números) se ignora y sale en el sitio de siempre', () => {
  const m = maquina();
  const a = bordes(m, AH);
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = "a"}');
  abrir(m);
  const b = bordes(m, V);
  assert.ok(Math.abs(b[0] - a[0]) < 0.01 && Math.abs(b[2] - a[2]) < 0.01);
  sinErrores(m);
});

test('clic derecho en la cabecera borra la posición y vuelve al rectángulo de la subasta', () => {
  const m = maquina();
  const sitio = bordes(m, AH);
  abrir(m);
  arrastrar(m, 120, -80);
  assert.ok(guardada(m));
  clicDerecho(m);
  assert.equal(guardada(m), undefined);
  const b = bordes(m, V);
  assert.ok(Math.abs(b[0] - sitio[0]) < 0.01 && Math.abs(b[2] - sitio[2]) < 0.01, `vuelve a ${sitio}, está en ${b}`);
  assert.ok(Math.abs(ancho(m) - 800) < 0.01);
  assert.equal(m.lua(`${V}:IsShown()`), true);
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrir(m);
  const c = bordes(m, V);
  assert.ok(Math.abs(c[0] - sitio[0]) < 1, 'y se queda así al volver a abrir');
  sinErrores(m);
});

test('sin posición guardada la ventana sale como siempre: el rectángulo de la subasta', () => {
  const m = maquina();
  const sitio = bordes(m, AH);
  abrir(m);
  const b = bordes(m, V);
  assert.deepEqual(b.map(Math.round), sitio.map(Math.round));
  assert.equal(guardada(m), undefined);
  sinErrores(m);
});

test('con la vista de Blizzard, arrastrar o reponer no enseña nuestra ventana ni toca la subasta', () => {
  const m = maquina();
  abrir(m);
  arrastrar(m, 40, -40);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.equal(m.lua(`${V}:IsShown()`), false);
  const subasta = () => m.lua(`{${AH}:GetAlpha(), ${AH}:GetScale(), ${AH}:GetNumPoints(), select(4, ${AH}:GetPoint(1)), select(5, ${AH}:GetPoint(1))}`);
  const antes = subasta();
  const guardadaAntes = guardada(m);
  arrastrar(m, 70, 70); // eventos sueltos de arrastre con la ventana escondida
  clicDerecho(m);
  assert.equal(m.lua(`${V}:IsShown()`), false, 'sigue sin verse');
  assert.deepEqual(subasta(), antes, 'la subasta de Blizzard no se toca');
  assert.deepEqual(guardada(m), guardadaAntes, 'y no se guarda ni se borra nada con la ventana escondida');
  // Cerrar y abrir con la vista de Blizzard y posición guardada: tampoco se enseña.
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrir(m);
  assert.equal(m.lua(`${V}:IsShown()`), false);
  assert.equal(m.lua(`${AH}:GetAlpha()`), 1);
  assert.deepEqual(subasta(), antes);
  sinErrores(m);
});

test('en combate también se arrastra y se guarda (nuestro marco no está protegido)', () => {
  const m = maquina();
  abrir(m);
  m.lua('BANCO.jugador.enCombate = true');
  arrastrar(m, 25, -15);
  assert.ok(guardada(m), 'se guardó en combate');
  clicDerecho(m);
  assert.equal(guardada(m), undefined);
  sinErrores(m);
});

test('si la ventana se esconde en pleno arrastre, el arrastre acaba y se guarda', () => {
  const m = maquina();
  abrir(m);
  m.lua('BANCO.arrastre = {x = 10, y = -10}');
  m.lua(`${CAB}:GetScript("OnDragStart")(${CAB})`);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.ok(guardada(m));
  assert.equal(m.lua(`${V}:IsShown()`), false);
  sinErrores(m);
});

test('mover la ventana no cambia alfa ni estrato ni la esconde (sin destellos)', () => {
  const m = maquina();
  abrir(m);
  const estado = () => m.lua(`{${V}:GetAlpha(), ${V}:IsShown(), ${CAB}:GetAlpha(), ${V}:GetFrameStrata(), ${V}:GetFrameLevel()}`);
  const antes = estado();
  arrastrar(m, 10, 10);
  clicDerecho(m);
  assert.deepEqual(estado(), antes);
  sinErrores(m);
});

test('el tooltip de la cabecera explica el arrastre, en español y en inglés', () => {
  const m = maquina();
  abrir(m);
  m.lua(`${CAB}:GetScript("OnEnter")(${CAB})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Arrastra para mover. Clic derecho: volver a su sitio.']);
  m.lua(`${CAB}:GetScript("OnLeave")(${CAB})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  m.lua(`${CAB}:GetScript("OnEnter")(${CAB})`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Drag to move. Right-click: back to its place.']);
  sinErrores(m);
});

test('abrir la subasta en combate con posición guardada: tapa el rectángulo, no se arrastra y al salir pasa a la posición guardada', () => {
  const m = maquina();
  const sitio = bordes(m, AH);
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 300, y = 700}');
  m.lua('BANCO.jugador.enCombate = true');
  abrir(m);
  assert.equal(m.lua(`${AH}:GetAlpha()`), 1, 'la subasta de Blizzard sigue a la vista en combate');
  const b = bordes(m, V);
  assert.ok(Math.abs(b[0] - sitio[0]) < 0.01 && Math.abs(b[2] - sitio[2]) < 0.01, `tapa la subasta: ${b} frente a ${sitio}`);
  assert.ok(Math.abs(ancho(m) - 800) < 0.01);
  // No se arrastra mientras la subasta no está escondida por nosotros.
  const guardadaAntes = guardada(m);
  arrastrar(m, 60, -60);
  assert.equal(m.llamadas('StartMoving').length, 0, 'no empieza a moverse');
  assert.deepEqual(bordes(m, V), b);
  assert.deepEqual(guardada(m), guardadaAntes);
  // Al salir de combate: se esconde la de Blizzard y nuestra ventana pasa a su sitio en el mismo paso.
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua(`${AH}:GetAlpha()`), 0, 'la de Blizzard, escondida');
  const c = bordes(m, V);
  assert.ok(Math.abs(c[0] - 300) < 0.01 && Math.abs(c[2] - 700) < 0.01, `en la posición guardada: ${c}`);
  assert.equal(m.lua(`${V}:IsShown()`), true);
  // Y ya escondida se arrastra.
  arrastrar(m, 10, -10);
  assert.equal(m.llamadas('StartMoving').length, 1);
  sinErrores(m);
});

test('nuestra pestaña de abajo no se sale de la pantalla al arrastrar hasta abajo', () => {
  const m = maquina();
  m.lua('BANCO.sujetarAPantalla = true');
  abrir(m);
  const insets = m.lua(`{${V}:GetClampRectInsets()}`);
  assert.deepEqual(insets.slice(0, 3), [0, 0, 0]);
  assert.ok(Math.abs(insets[3] * k(m) + 24) < 1e-6, `el marco de sujeción incluye la pestaña (24 de UIParent): ${insets}`);
  arrastrar(m, 0, -5000);
  const b = bordes(m, V);
  assert.ok(b[3] >= 24 - 0.01, `la ventana deja 24 de sitio abajo: ${b[3]}`);
  const t = bordes(m, `${V}.pestanaSnet`);
  assert.ok(t[3] >= -0.01, `la pestaña dentro de la pantalla: ${t[3]}`);
  sinErrores(m);
});

test('al empezar a arrastrar se esconde el tooltip de ayuda', () => {
  const m = maquina();
  abrir(m);
  m.lua(`${CAB}:GetScript("OnEnter")(${CAB})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  m.lua(`${CAB}:GetScript("OnDragStart")(${CAB})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  m.lua(`${CAB}:GetScript("OnDragStop")(${CAB})`);
  sinErrores(m);
});
