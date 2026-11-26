// Marcas de origen de los puntos que dan las herramientas: formar, leer y volver a convertir en coordenadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejecutarDatos } from '../src/base/leer-lua.mjs';
import { crearBase } from '../src/base/base.mjs';
import { puntosDeMision } from '../src/base/puntos.mjs';
import { marcaMision, marcaPnj, marcaEntrada, marcaGuia, leerMarca, puntoDeMarca } from '../src/herramientas/marcas.mjs';

function baseDePrueba() {
  const raiz = {};
  const cabecera = 'SNF_MISIONES = {version="t",esquema=1,quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}},'
    + 'zonas={area={[40]=1436},nombre={}},'
    + 'mazmorra={[1581]={nombre="The Deadmines",zonaPadre=40,entradas={{zona=40,mapa=1436,x=42.6,y=71.8}}},'
    + '[1582]={nombre="Dos",entradas={{zona=40,mapa=1436,x=10,y=10},{zona=40,mapa=1437,x=20,y=20}}}},porFaccion={}}\n'
    + 'local Q = SNF_MISIONES.quest\nlocal N = SNF_MISIONES.npc\nlocal O = SNF_MISIONES.object\nlocal I = SNF_MISIONES.item\n';
  const cuerpo = 'Q[9101] = {name="Prueba",startedBy={{9201}},finishedBy={{9202}},requiredLevel=1,questLevel=1,requiredRaces=0,'
    + 'requiredClasses=0,objectivesText={},sourceItemId=0,zoneOrSort=0,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0,'
    + 'objectives={{{9203,5}}}}\n'
    + 'N[9201] = {name="Da",spawns={[1413]={{50,50}}}}\n'
    + 'N[9202] = {name="Recibe",spawns={[1413]={{60,60}}}}\n'
    + 'N[9203] = {name="Bicho",spawns={[1413]={{30,40},{31,41}}}}\n'
    + 'N[9204] = {name="Fuera",spawns={[1413]={{120,50}}}}\n';
  ejecutarDatos(cabecera + cuerpo, raiz, 'texto.lua');
  return crearBase(raiz.SNF_MISIONES);
}
const base = baseDePrueba();
const pj = { faccion: 'Horde' };
const paso = { n: 3, texto: 'Ve allí', misiones: [], punto: { mapa: 1413, x: 12.5, y: 80 } };
const ctx = { base, pj, mapaJugador: 1413, pasoDeGuia: (id, n) => (id === 'abcd1234' && n === 3 ? paso : null) };

test('formar y leer: ida y vuelta de cada marca', () => {
  assert.equal(marcaMision(9101, 'recoger'), 'B:q9101:r');
  assert.equal(marcaMision(9101, 'entregar'), 'B:q9101:e');
  assert.equal(marcaMision(9101, 'objetivo', 2), 'B:q9101:o2');
  assert.equal(marcaPnj(9203), 'B:n9203');
  assert.equal(marcaEntrada(1581), 'B:e1581');
  assert.equal(marcaGuia('abcd1234', 3), 'G:abcd1234:3');
  assert.deepEqual(leerMarca('B:q9101:r'), { tipo: 'mision', q: 9101, papel: 'recoger' });
  assert.deepEqual(leerMarca('B:q9101:e'), { tipo: 'mision', q: 9101, papel: 'entregar' });
  assert.deepEqual(leerMarca('B:q9101:o2'), { tipo: 'mision', q: 9101, papel: 'objetivo', k: 2 });
  assert.deepEqual(leerMarca('B:n9203'), { tipo: 'pnj', id: 9203 });
  assert.deepEqual(leerMarca('B:e1581'), { tipo: 'entrada', area: 1581 });
  assert.deepEqual(leerMarca('G:abcd1234:3'), { tipo: 'guia', id: 'abcd1234', n: 3 });
});

test('leerMarca es estricta', () => {
  for (const mala of ['P3', '45.2, 67.8', '', 'B:q0:r', 'B:q09:r', 'B:q-1:r', 'B:q9101:x', 'B:q9101:o0', 'B:q9101:r ', ' B:n1',
    'B:n1.5', 'B:n', 'B:e0', 'G:ABCD1234:3', 'G:abcd123:3', 'G:abcd1234:0', 'G:abcd1234:3x', 'b:n1', null, undefined, 5, {}]) {
    assert.equal(leerMarca(mala), null, String(mala));
  }
});

test('puntoDeMarca: misión = el punto del papel en puntosDeMision', () => {
  const puntos = puntosDeMision(base, 9101, pj, 'es', 1413, { conObjetivo: true });
  const recoger = puntos.find((p) => p.papel === 'recoger');
  const r = puntoDeMarca('B:q9101:r', ctx);
  assert.deepEqual([r.mapa, r.x, r.y, r.texto], [recoger.mapa, recoger.x, recoger.y, recoger.texto]);
  assert.deepEqual(r.origen, { tipo: 'base' });
  const entregar = puntos.find((p) => p.papel === 'entregar');
  assert.deepEqual([puntoDeMarca('B:q9101:e', ctx).x, puntoDeMarca('B:q9101:e', ctx).y], [entregar.x, entregar.y]);
  const objetivo = puntos.filter((p) => p.papel === 'objetivo')[0];
  const o = puntoDeMarca('B:q9101:o1', ctx);
  assert.deepEqual([o.mapa, o.x, o.y], [objetivo.mapa, objetivo.x, objetivo.y]);
  assert.equal(puntoDeMarca('B:q9101:o2', ctx), null);
});

test('puntoDeMarca: PNJ, entrada y guía', () => {
  const n = puntoDeMarca('B:n9203', ctx);
  assert.equal(n.mapa, 1413);
  assert.equal(n.texto, 'Bicho');
  assert.deepEqual(n.origen, { tipo: 'base' });
  const e = puntoDeMarca('B:e1581', ctx);
  assert.deepEqual([e.mapa, e.x, e.y], [1436, 42.6, 71.8]);
  assert.match(e.texto, /The Deadmines/);
  assert.equal(puntoDeMarca('B:e1582', { ...ctx, mapaJugador: 1437 }).x, 20);
  assert.equal(puntoDeMarca('B:e1582', ctx).x, 10);
  const g = puntoDeMarca('G:abcd1234:3', ctx);
  assert.deepEqual([g.mapa, g.x, g.y, g.texto], [1413, 12.5, 80, 'Ve allí']);
  assert.deepEqual(g.origen, { tipo: 'guia', archivo: 'abcd1234', paso: 3 });
});

test('puntoDeMarca: lo que no existe o no vale da null', () => {
  for (const m of ['B:q999999:r', 'B:n999', 'B:e999', 'G:abcd1234:99', 'G:abcd1234:3x', 'P3', '45.2, 67.8', 'B:n9204']) {
    assert.equal(puntoDeMarca(m, ctx), null, m);
  }
  assert.equal(puntoDeMarca('G:abcd1234:3', { base, pj }), null); // sin pasoDeGuia
  const fuera = { ...ctx, pasoDeGuia: () => ({ n: 1, texto: 't', punto: { mapa: 1413, x: 120, y: 5 } }) };
  assert.equal(puntoDeMarca('G:abcd1234:1', fuera), null);
});

// Dibujos de la IA: un objetivo con varios sitios en la base (la zona de matar) trae los sitios del bloque elegido, en
// su mapa, para que la app calcule el círculo; un solo sitio, o lo que no es un objetivo, no los trae.
test('dibujos: B:q<q>:o<k> con varios sitios trae `sitios` (los del bloque, en su mapa); uno solo o recoger, sin sitios', () => {
  const o = puntoDeMarca('B:q9101:o1', ctx);
  assert.deepEqual(o.sitios, [[30, 40], [31, 41]]);
  assert.equal(o.mapa, 1413);
  assert.equal(puntoDeMarca('B:q9101:r', ctx).sitios, undefined);
  assert.equal(puntoDeMarca('B:n9203', ctx).sitios, undefined);
  // puntosDeMision sin la opción, como siempre; con conSitios, el objetivo los lleva.
  const sin = puntosDeMision(base, 9101, pj, 'es', 1413, { conObjetivo: true }).find((p) => p.papel === 'objetivo');
  assert.equal(sin.sitios, undefined);
  const con = puntosDeMision(base, 9101, pj, 'es', 1413, { conObjetivo: true, conSitios: true });
  assert.deepEqual(con.find((p) => p.papel === 'objetivo').sitios, [[30, 40], [31, 41]]);
  assert.equal(con.find((p) => p.papel === 'recoger').sitios, undefined);
});
