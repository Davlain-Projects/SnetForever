// 16-nov (un jugador: «si ya estoy en otro destino y me está recomendando arriba del todo seguir con otro contenido,
// debería dejarme cerrarlo si no quiero retomarlo»): el cuadro «Cómo llegar» de la ventana de la guía lleva una X.
// Cerrado, no vuelve para la misma guía, el mismo paso y el mismo destino (tampoco tras un /reload); vuelve al avanzar o
// cambiar de paso, al volver a elegir la guía o con un destino nuevo. Solo esconde el cuadro: la flecha y la guía siguen.
// Mapa de prueba: 1413 Los Baldíos, de 4000 x 5000 yardas, como en viaje.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const BALDIOS = `BANCO.mapas[1413] = {nombre = "Los Baldíos", inst = 1, padre = 1414, tipo = 3, izquierda = -4000,
  arriba = -2000, ancho = 4000, alto = 5000}`;
const PNJ = (id, nombre, x, y) => `SNF_MISIONES.npc[${id}] = {name = ${aLua(nombre)}, friendlyToFaction = "H",
  npcFlags = 8, spawns = {[1413] = {{${x}, ${y}}}}}`;
const CLAVE = 'Prueba\\01-60 Guía de prueba';
const ES = { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } } };
const M = 'SnetForever.Ventana.marcos';
const V = `${M}.viaje`;

// Dos pasos con su destino lejos (x = 90 % y x = 10 %, y = 90 %): con el jugador en (10, 10) siempre hay viaje.
// Ronda 1 de T1: goto objetivo (un paso de solo goto flecha ya está hecho y se pasa al cargar).
const GUIA = guiaDePrueba([
  { elementos: [{ t: 'goto', mapa: 1413, wx: -7600, wy: -6500, inst: 1, modo: 'objetivo', texto: { en: 'Camp', es: 'Campamento' } }] },
  { elementos: [{ t: 'goto', mapa: 1413, wx: -4400, wy: -6500, inst: 1, modo: 'objetivo', texto: { en: 'Well', es: 'Pozo' } }] },
]);

function mapas(m) {
  m.lua(BALDIOS);
  m.lua(PNJ(96001, 'Maestro del norte', 12, 12));
  m.lua(PNJ(96002, 'Maestro del sur', 88, 88));
}

function mundo() {
  const m = nuevaMaquina({ guardado: ES, jugador: { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 23, mapa: 1411, x: 50, y: 50 } });
  mapas(m);
  m.jugador({ mapa: 1413, x: 10, y: 10 });
  m.ponerGuia(GUIA);
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua('SnetForever.Flecha.crear()');
  pintar(m);
  return m;
}

const pintar = (m) => m.lua('SnetForever.Flecha.actualizar(0); SnetForever.Ventana.pintar()');
const visible = (m) => m.lua(`${V}:IsShown()`);
const cerrar = (m) => m.lua(`${V}.cerrar:Click()`);
const viajeOtraVez = (m) => m.lua('SnetForever.emitir("SNF_VIAJE")');

test('con viaje, el cuadro sale con su X (arriba a la derecha y con ayuda); al pulsarla se esconde', () => {
  const m = mundo();
  assert.equal(visible(m), true);
  assert.equal(m.lua(`${V}.cerrar:IsShown()`), true);
  assert.equal(m.lua(`${V}.cerrar.texto:GetText()`), 'X');
  assert.equal(m.lua(`(function() local a, rel, b = ${V}.cerrar:GetPoint(1) return a == "TOPRIGHT" and rel == ${V} and b == "TOPRIGHT" end)()`), true);
  m.lua(`${V}.cerrar:GetScript("OnEnter")(${V}.cerrar)`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.match(JSON.stringify(m.lua("BANCO.lineasTooltip()")), /Cerrar/);
  m.lua(`${V}.cerrar:GetScript("OnLeave")(${V}.cerrar)`);
  cerrar(m);
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('cerrado no vuelve con el mismo paso y destino aunque llegue otro SNF_VIAJE o cambie el plan del viaje', () => {
  const m = mundo();
  cerrar(m);
  viajeOtraVez(m);
  assert.equal(visible(m), false);
  // Se mueve un poco: el plan (consejo, distancia) puede cambiar, pero el destino es el mismo.
  m.jugador({ mapa: 1413, x: 14, y: 11 });
  pintar(m);
  viajeOtraVez(m);
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('cerrar el cuadro solo lo esconde: la flecha y el paso de la guía siguen igual', () => {
  const m = mundo();
  const texto = m.lua('SnetForever.Flecha.marcos.texto:GetText()');
  cerrar(m);
  pintar(m);
  assert.equal(m.lua('SnetForever.Flecha.marcos.raiz:IsShown()'), true);
  assert.equal(m.lua('SnetForever.Flecha.marcos.texto:GetText()'), texto);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1);
  assert.equal(m.lua(`${M}.pasos[1].marco:IsShown()`), true);
  sinErrores(m);
});

test('la ventana se recoloca sin el cuadro: lo de encima baja lo que ocupaba (como cuando no hay viaje)', () => {
  const m = mundo();
  // «Volver a …» (tarjeta de estado) va encima de «Cómo llegar», como en la captura del jugador.
  m.lua(`SnetForeverPJ.volverA = ${aLua(CLAVE)}`);
  pintar(m);
  const y = () => m.lua(`select(5, ${M}.estado:GetPoint(1))`);
  const antes = y();
  const altoViaje = m.lua(`${V}:GetHeight()`);
  cerrar(m);
  assert.equal(Math.abs(antes) - Math.abs(y()), altoViaje + 5);
  sinErrores(m);
});

test('vuelve a salir al avanzar de paso', () => {
  const m = mundo();
  cerrar(m);
  m.lua('SnetForever.Motor.irA(2)');
  pintar(m);
  assert.equal(visible(m), true);
  sinErrores(m);
});

test('vuelve a salir al volver a elegir la guía (aunque sea el mismo paso y el mismo destino)', () => {
  const m = mundo();
  cerrar(m);
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  pintar(m);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1);
  assert.equal(visible(m), true);
  sinErrores(m);
});

test('vuelve a salir con un destino nuevo (la IA marca otro punto)', () => {
  const m = mundo();
  cerrar(m);
  m.lua('SnetForever.Capa.poner("jugador", {{mapa = 1413, x = 50, y = 95, etiqueta = "Otro sitio", orden = 1, seguir = true}})');
  pintar(m);
  assert.match(m.lua(`${V}.texto:GetText()`), /Otro sitio/);
  assert.equal(visible(m), true);
  sinErrores(m);
});

test('tras un /reload, con la misma guía, paso y destino, sigue cerrado (se guarda por personaje)', () => {
  const m = mundo();
  cerrar(m);
  sinErrores(m);
  const r = m.recargar();
  mapas(r);
  r.lua('SnetForever.Flecha.crear()');
  pintar(r);
  assert.equal(r.lua('SnetForever.Motor.estado().clave'), CLAVE);
  assert.equal(r.lua('SnetForever.Flecha.viaje() ~= nil'), true, 'hay viaje que contar');
  assert.equal(visible(r), false);
  // Y con otro paso, vuelve.
  r.lua('SnetForever.Motor.irA(2)');
  pintar(r);
  assert.equal(visible(r), true);
  sinErrores(r);
});

test('sin animaciones al cerrar ni al volver: ni AnimationGroup ni OnUpdate, y el alfa no cambia', () => {
  const m = mundo();
  const alfa = m.lua(`${V}:GetAlpha()`);
  assert.equal(m.lua(`${V}:GetScript("OnUpdate") == nil and ${V}.cerrar:GetScript("OnUpdate") == nil`), true);
  cerrar(m);
  m.lua('SnetForever.Motor.irA(2)');
  pintar(m);
  assert.equal(visible(m), true);
  assert.equal(m.lua(`${V}:GetAlpha()`), alfa);
  assert.equal(m.lua(`${V}:GetScript("OnUpdate") == nil`), true);
  // En el código del cuadro no hay animaciones ni cambios de alfa.
  const fuente = readFileSync(fileURLToPath(new URL('../../../addons/SnetForever/ui/ventana.lua', import.meta.url)), 'utf8');
  const cuadro = [fuente.match(/local function crearViaje\(\)[\s\S]*?\nend\r?\n/)[0],
    fuente.match(/local function pintarViaje\([\s\S]*?\nend\r?\n/)[0]].join('\n');
  assert.doesNotMatch(cuadro, /AnimationGroup|SetAlpha|OnUpdate|UIFrameFlash|UIFrameFade/);
  sinErrores(m);
});
