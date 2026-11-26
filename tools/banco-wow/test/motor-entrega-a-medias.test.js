// T2-addon: una entrega a medias enseña los objetivos y no manda al PNJ. El caso del jugador: una ruta de la IA con
// recoger y entregar de una misión que ya está en el diario sin completar. Recoger está hecho (está en el diario), así que
// el paso actual es la entrega, con «faltan»: la flecha va a los objetivos que faltan (si los datos traen su sitio), el
// texto los enseña con su progreso y, al completarse la misión, la flecha vuelve al PNJ de entrega.
// Datos inventados: la misión 97901 la da y la recoge el «Dador inventado» (97915, en (80, 40) del mapa 1411) y pide matar
// al «Lobo de prueba» (97911, en (60, 30) y (20, 70)). Mapa 1411: wx = -2000 - 50·x, wy = 1800 - 35·y, inst 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const Q = 97901;
const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;
const R = 'SnetForever.Ruta';
const mundo1411 = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });

const PARADAS = [
  { mapa: 1411, x: 80, y: 40, etiqueta: 'Recoger «Misión inventada»', tipo: 'recoger', q: Q, npcs: [97915], seguir: true },
  { mapa: 1411, x: 80, y: 40, etiqueta: 'Entregar «Misión inventada»', tipo: 'entregar', q: Q, npcs: [97915], seguir: true },
];
const LOBO = (hecho, terminado = false) => ({ texto: `Lobo de prueba: ${hecho}/3`, hecho, pedido: 3, terminado, tipo: 'monster' });

function conRutaAMedias({ objetivos = [LOBO(1)], conSitio = true } = {}) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.lua(`SNF_MISIONES.npc[97915] = {name = "Dador inventado", friendlyToFaction = "H", spawns = {[1411] = {{80, 40}}}}
  SNF_MISIONES.npc[97911] = {name = "Lobo de prueba"${conSitio ? ', spawns = {[1411] = {{60, 30}, {20, 70}}}' : ''}}`);
  m.datoMision(Q, { name: 'Misión inventada', startedBy: [[97915]], finishedBy: [[97915]], requiredLevel: 1, questLevel: 5,
    objectives: [[[97911]]], zoneOrSort: 363 });
  m.estadoMision(Q, { enDiario: true, completa: false, objetivos });
  m.lua(`${V}.crear(); ${R}.proponer(${aLua({ titulo: 'Ruta inventada', puntos: PARADAS })})`);
  assert.equal(m.lua(`${R}.aceptar()`), true);
  m.avanzar(0.5);
  return m;
}

const estado = (m) => m.lua('SnetForever.Motor.estado()');
const entrega = (m) => m.lua('SnetForever.Motor.paso(2).elementos[1]');
const destino = (m) => m.lua('SnetForever.Navegacion.destino()');
const ponerEn = (m, x, y) => {
  const w = mundo1411(x, y);
  m.jugador({ mundo: { wx: w.wx, wy: w.wy, inst: 1 } });
};
const lineasBloque = (m) => m.lua(`(function() local t = {}
  for i, l in ipairs(${M}.pasos[1].lineas) do t[i] = l:GetText() end
  return t end)()`) || [];

test('T2 motor: en la ruta de la IA, el actual es la entrega con «faltan»; la flecha va al objetivo, no al PNJ', () => {
  const m = conRutaAMedias();
  assert.equal(estado(m).actual, 2, 'recoger está hecho: la misión está en el diario');
  assert.equal(entrega(m).datos.t, 'turnin');
  assert.equal(entrega(m).resultado, 'pendiente');
  assert.equal(entrega(m).extra, 'faltan:1');
  assert.equal(m.lua('SnetForever.Elementos.entregaAMedias(SnetForever.Motor.paso(2).elementos[1])'), true);
  const d = destino(m);
  assert.deepEqual([d.punto.x, d.punto.y], [60, 30], 'el lobo más cercano, no el dador de (80, 40)');
  // La ventana enseña los objetivos con su progreso, y nada que parpadee.
  m.lua(`${V}.pintar()`);
  assert.deepEqual(lineasBloque(m), ['Completa «Misión inventada» antes de entregarla:\n- Lobo de prueba: 1/3']);
  // Los lobos salen como enemigos en «Objetivos cercanos».
  const cercanos = m.lua('(function() local t = {} for i, e in ipairs(SnetForever.Cercanos.lista()) do t[i] = e.tipo .. ":" .. e.clave end return t end)()');
  assert.ok(cercanos.includes('mob:lobo de prueba'), JSON.stringify(cercanos));
  sinErrores(m);
});

test('T2 motor: al completarse (QUEST_LOG_UPDATE), el texto y la flecha vuelven a la entrega en el PNJ', () => {
  const m = conRutaAMedias();
  ponerEn(m, 22, 68);
  assert.deepEqual([destino(m).punto.x, destino(m).punto.y], [20, 70]);
  // Avanza un objetivo: sigue a medias, el texto lo cuenta.
  m.estadoMision(Q, { objetivos: [LOBO(2)] });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.5);
  m.lua(`${V}.pintar()`);
  assert.match(lineasBloque(m)[0], /Lobo de prueba: 2\/3/);
  // Completa.
  m.estadoMision(Q, { completa: true, objetivos: [LOBO(3, true)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(entrega(m).extra, undefined, 'el motor lo ve con el mismo evento');
  const d = destino(m);
  assert.deepEqual([d.punto.x, d.punto.y], [80, 40], 'de vuelta al dador');
  m.avanzar(0.5);
  m.lua(`${V}.pintar()`);
  assert.deepEqual(lineasBloque(m), ['Entrega Misión inventada']);
  assert.equal(estado(m).actual, 2, 'la entrega sigue pendiente: el addon no entrega por el jugador');
  sinErrores(m);
});

test('T2 motor: sin sitio en los datos para el objetivo, no hay flecha (ni al PNJ) y el paso no se salta', () => {
  const m = conRutaAMedias({ conSitio: false });
  assert.equal(estado(m).actual, 2);
  assert.equal(entrega(m).extra, 'faltan:1');
  assert.equal(destino(m), undefined);
  m.avanzar(2);
  assert.equal(estado(m).actual, 2, 'sigue en la entrega');
  assert.deepEqual(m.lua('SnetForeverPJ.saltados') || [], []);
  sinErrores(m);
});

test('T2 motor: la lista de pasos enseña que a la entrega le faltan objetivos (texto corto)', () => {
  const m = conRutaAMedias();
  m.lua(`${V}.pintar()`);
  const textos = m.lua(`(function() local t = {}
    for i, b in ipairs(${M}.tarjetasLista) do if b:IsShown() then t[#t + 1] = b.texto:GetText() end end
    return t end)()`) || [];
  assert.ok(textos.some((s) => /Completa «Misión inventada» antes de entregarla$/.test(s)), JSON.stringify(textos));
  sinErrores(m);
});
