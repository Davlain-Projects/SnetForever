// 12-nov (en el juego: «misión completada y no se actualizó»): el jugador mató a Shadumbra y tenía la Cabeza de Shadumbra,
// pero la misión «La cabeza de Shadumbra» se acepta con clic derecho en ella y el paso solo decía «Acepta …»; la flecha
// seguía mandándolo a 407 yd. Ahora el texto dice cómo aceptarla y, si solo falta eso y lleva el objeto, la flecha no
// manda a ningún sitio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const Q = 90024;
const CABEZA = 91630;
const IR = { t: 'goto', mapa: 1411, x: 30, y: 30, modo: 'flecha' };
const RECOGER = { t: 'collect', i: CABEZA, n: 1, q: Q };
const ACEPTAR = { t: 'accept', q: Q };

function conPaso(opciones = {}) {
  const m = nuevaMaquina();
  m.lua(`SNF_MISIONES.quest[${Q}] = {name = "Shadumbra's Head", startedBy = {[3] = {${CABEZA}}}}
  SNF_MISIONES.item[${CABEZA}] = {name = "Head of Shadumbra"}`);
  if (opciones.cabeza) m.objeto(CABEZA, 1);
  m.estadoMision(6441, { enDiario: true });
  m.ponerGuia(guiaDePrueba([{ elementos: [IR, RECOGER, ACEPTAR] }, { elementos: [{ t: 'manual', texto: { en: 'x', es: 'x' } }] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  for (let i = 0; i < 3; i++) m.lua('SnetForever.Motor.actualizar()');
  return m;
}

const destino = (m) => m.lua('(function() local d = SnetForever.Navegacion.destino({}) return d ~= nil end)()');

test('12-nov: el «acepta» de una misión que inicia un objeto dice que se hace con clic derecho en él', () => {
  const m = conPaso();
  const texto = m.lua(`SnetForever.Texto.deElemento(${aLua(ACEPTAR)}, {})`);
  assert.match(texto, /clic derecho en .*Head of Shadumbra.* para aceptar/);
  sinErrores(m);
});

test('12-nov: sin el objeto, la flecha va al sitio del paso; con el objeto y solo faltando aceptar, no manda a ningún sitio', () => {
  const sin = conPaso();
  assert.equal(destino(sin), true, 'sin la cabeza: a buscarla');
  const con = conPaso({ cabeza: true });
  assert.equal(con.lua('SnetForever.Motor.estado().actual'), 1, 'el paso sigue: falta aceptar');
  assert.equal(destino(con), false, 'con la cabeza: nada de flecha');
  sinErrores(sin);
  sinErrores(con);
});
