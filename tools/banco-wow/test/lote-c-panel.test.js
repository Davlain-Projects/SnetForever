// Lote C (revisión 52, Minor 5 y Minor 16): «Restablecer posición» del panel y «/snet reiniciar» usan la misma función,
// Panel.restablecerPosiciones(), que devuelve a su sitio la ventana, la flecha, «Objetivos cercanos» y el chat. /snet
// entiende también las órdenes en inglés (window, ai, bug, reset, test [end], help).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const ES = { jugador: { idioma: 'esES' } };
const VIGILADO = { vigilarSecretos: ['ui/panel.lua', 'ui/chat.lua'] };
const INICIO = 'Prueba (H)\\01-02 Inicio';
const POSICIONES = ['ventana.pos', 'flecha.pos', 'objetivos.pos', 'chat.pos'];

const slash = (m, texto = '') => m.lua(`SlashCmdList.SNET(${aLua(texto)})`);
const ajuste = (m, clave) => m.lua(`SnetForever.Ajustes.get(${aLua(clave)})`);
const poner = (m, clave, valor) => m.lua(`SnetForever.Ajustes.set(${aLua(clave)}, ${aLua(valor)})`);
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));
const fuera = { punto: 'TOP', relPunto: 'TOP', x: 7, y: -9 };

function maquina(opciones = {}) {
  const m = nuevaMaquina({ ...ES, ...VIGILADO, ...opciones });
  m.lua(`SnetForever.Motor.cargar(${aLua(INICIO)})`);
  slash(m, 'chat'); // el chat abierto: así se ve que se recoloca
  for (const clave of POSICIONES) poner(m, clave, fuera);
  return m;
}

function comprobarEnSuSitio(m) {
  for (const clave of POSICIONES) assert.equal(ajuste(m, clave), undefined, clave);
  assert.deepEqual(m.marco('SnetForeverVentana').puntos, [{ punto: 'LEFT', relativo: 'UIParent', relPunto: 'LEFT', x: 160, y: 60 }]);
  const chat = m.marco('SnetForeverChat').puntos;
  assert.equal(chat.length, 1);
  assert.equal(chat[0].punto, 'CENTER', 'el chat vuelve a su sitio por defecto');
}

test('lote C (52-M5): Panel.restablecerPosiciones devuelve la ventana, la flecha, los objetivos y el chat', () => {
  const m = maquina();
  assert.equal(m.marco('SnetForeverChat').puntos[0].punto, 'TOP', 'el chat se movió con chat.pos');
  m.lua('SnetForever.Panel.restablecerPosiciones()');
  comprobarEnSuSitio(m);
  sinErrores(m);
});

test('lote C (52-M5): el botón del panel y /snet reiniciar hacen lo mismo (las cuatro posiciones)', () => {
  const boton = maquina();
  slash(boton);
  boton.lua('SnetForever.Panel.marcos.restablecerPosicion:Click()');
  comprobarEnSuSitio(boton);
  sinErrores(boton);
  const orden = maquina();
  slash(orden, 'reiniciar');
  comprobarEnSuSitio(orden);
  sinErrores(orden);
});

test('lote C (52-M16): /snet reset, window, ai, bug y test [end] hacen lo mismo que reiniciar, ventana, ia, fallo y prueba', () => {
  const m = maquina();
  slash(m, 'reset');
  comprobarEnSuSitio(m);
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  slash(m, 'window');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), false);
  slash(m, 'WINDOW');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true, 'sin distinguir mayúsculas');
  assert.equal(m.lua('SnetForeverChat:IsVisible()'), true);
  slash(m, 'ai');
  assert.equal(m.lua('SnetForeverChat:IsVisible()'), false);
  slash(m, 'bug');
  assert.equal(m.marco('SnetForeverFallo').visible, true);
  const L = (clave) => m.lua(`SnetForever.L.t(${aLua(clave)})`);
  const ultimo = () => impresos(m).at(-1);
  slash(m, 'test');
  assert.ok([L('PRUEBA_PUESTA'), L('PRUEBA_SIN_POSICION')].includes(ultimo()), ultimo());
  slash(m, 'test end');
  assert.equal(ultimo(), L('PRUEBA_QUITADA'));
  sinErrores(m);
});

test('lote C (52-M16): la ayuda en inglés da las órdenes en inglés (y la española entre paréntesis); help la escribe', () => {
  const en = nuevaMaquina({ jugador: { idioma: 'enUS' } });
  slash(en, 'help');
  const lineas = impresos(en);
  assert.equal(lineas.length, 12); // 0.5.15: «/snet here»; 0.6.1: «/snet log»; 0.7.0: «/snet trade» y «/snet help», y la letra corta delante; «/snet import»
  for (const orden of ['/snet window', '/snet ai', '/snet bug', '/snet reset', '/snet test', '/snet here, /snet aqui', '/snet log, /snet diario', '/snet trade', '/snet help', '/snet import (or /snet importar)']) {
    assert.equal(lineas.filter((l) => l.includes(orden)).length, 1, orden);
  }
  assert.ok(lineas.some((l) => l.includes('/snet reset') && l.includes('chat')), 'reset dice que también mueve el chat');
  const es = nuevaMaquina(ES);
  slash(es, 'ayuda');
  assert.ok(impresos(es).some((l) => l.includes('/snet reiniciar') && l.includes('chat')));
  sinErrores(en);
  sinErrores(es);
});
