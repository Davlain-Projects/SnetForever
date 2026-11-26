// 21-nov (en el juego, Durotar): la ruta de la IA pedía usar un orbe antes de matar a quien lo suelta y hacía dos viajes
// a la misma zona. La app ordena la ruta sin romper ninguna dependencia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejecutarDatos } from '../src/base/leer-lua.mjs';
import { crearBase } from '../src/base/base.mjs';
import { ordenarPasosIA } from '../src/ordenRutaIA.mjs';

function baseDePrueba() {
  const raiz = {};
  const q = (id, { da = '{{3293}}', recibe = '{{3293}}', nivel = 5, objetivos = '{}', extra = '' } = {}) => `Q[${id}] = {name="M${id}",startedBy=${da},`
    + `finishedBy=${recibe},requiredLevel=${nivel},questLevel=${nivel},requiredRaces=0,requiredClasses=0,objectivesText={},sourceItemId=0,`
    + `zoneOrSort=14,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0,objectives=${objetivos}${extra}}\n`;
  const texto = 'SNF_MISIONES = {version="t",esquema=1,quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}},'
    + 'zonas={area={},nombre={}},mazmorra={},porFaccion={}}\n'
    + 'local Q = SNF_MISIONES.quest\nlocal I = SNF_MISIONES.item\nlocal N = SNF_MISIONES.npc\n'
    + q(835, { objetivos: '{[1]={{3117},{3118}}}' })
    + q(806, { da: '{{3142}}', recibe: '{{3142}}', objetivos: '{[1]={{3203}}}' })
    + q(828, { da: '{{3142}}', recibe: '{{3208}}', extra: ',preQuestSingle={806}' })
    + q(827, { da: '{{3208}}', recibe: '{{3208}}', objetivos: '{[1]={{3195}}}', extra: ',preQuestSingle={828}' })
    + q(97281, { da: '{[3]={277661}}' })
    + q(97282, { objetivos: '{[1]={{3130}}}', extra: ',preQuestSingle={97281}' })
    + q(900, { nivel: 30 })
    + 'I[277661] = {name="Orbe",npcDrops={3118}}\n'
    + 'N[3118] = {name="Bruja",spawns={[1411]={{53,24}}}}\n';
  ejecutarDatos(texto, raiz, 'texto.lua');
  return crearBase(raiz.SNF_MISIONES);
}
const base = baseDePrueba();
const pj = { faccion: 'Horde', nivel: 10 };
const punto = (x, y) => ({ mapa: 1411, x, y, origen: { tipo: 'turno' } });
const paso = (p, ...acciones) => ({ ...(p ? { punto: p } : {}), misiones: acciones.map(([accion, q]) => ({ accion, q })) });
const REZLAK = punto(46.4, 22.9);
const durotar = () => [
  paso(REZLAK, ['aceptar', 835]),
  paso(punto(42.1, 26.7), ['completar', 806]),
  paso(punto(52.2, 43.2), ['entregar', 806], ['aceptar', 828]),
  paso(punto(56.4, 20), ['entregar', 828], ['aceptar', 827]),
  paso(null, ['aceptar', 97281]),
  paso(punto(53.2, 23.9), ['completar', 835]),
  paso(REZLAK, ['entregar', 835], ['entregar', 97281], ['aceptar', 97282]),
  paso(punto(40.6, 26.8), ['completar', 97282]),
  paso(REZLAK, ['entregar', 97282]),
  paso(punto(52.9, 9.3), ['completar', 827]),
  paso(punto(56.4, 20), ['entregar', 827]),
];
const posicion = (pasos, accion, q) => pasos.findIndex((p) => p.misiones?.some((m) => m.accion === accion && m.q === q));
const ordenar = (pasos, extra = {}) => ordenarPasosIA([{ titulo: 'T', pasos }], { base, pj, ...extra }).tramos[0].pasos;
const largo = (pasos) => {
  const puntos = pasos.map((p) => p.punto).filter(Boolean);
  return puntos.slice(1).reduce((s, b, i) => s + Math.hypot((b.x - puntos[i].x) * 1.5, b.y - puntos[i].y), 0);
};

test('una misión que empieza con un objeto va detrás del paso que mata a quien lo suelta', () => {
  const r = ordenar(durotar());
  assert.ok(posicion(r, 'aceptar', 97281) > posicion(r, 'completar', 835));
  assert.ok(posicion(r, 'aceptar', 97281) <= posicion(r, 'entregar', 97281));
});

test('también con un paso ya armado que solo es el «aceptar» del objeto', () => {
  const orbe = { elementos: [{ t: 'accept', q: 97281 }] };
  const matar = { elementos: [{ t: 'goto', mapa: 1411, x: 53.2, y: 23.9 }, { t: 'complete', q: 835 }] };
  const r = ordenar([{ elementos: [{ t: 'goto', mapa: 1411, x: 46.4, y: 22.9 }, { t: 'accept', q: 835 }] }, orbe, matar]);
  assert.ok(r.indexOf(orbe) > r.indexOf(matar));
});

test('Durotar: Fizzle y los truenagartos quedan seguidos y la ruta se acorta', () => {
  const entrada = durotar();
  const r = ordenar(entrada);
  assert.equal(Math.abs(posicion(r, 'completar', 806) - posicion(r, 'completar', 97282)), 1);
  assert.ok(largo(r) < largo(entrada) * 0.95);
  assert.equal(r.length, entrada.length);
});

test('nunca rompe el orden de una misión ni sus previas', () => {
  const r = ordenar(durotar());
  for (const q of [835, 806, 828, 827, 97282]) {
    assert.ok(posicion(r, 'aceptar', q) < 0 || posicion(r, 'completar', q) < 0 || posicion(r, 'aceptar', q) < posicion(r, 'completar', q), `aceptar antes de completar ${q}`);
  }
  assert.ok(posicion(r, 'entregar', 806) <= posicion(r, 'aceptar', 828));
  assert.ok(posicion(r, 'entregar', 828) <= posicion(r, 'aceptar', 827));
  assert.ok(posicion(r, 'entregar', 97281) <= posicion(r, 'aceptar', 97282));
  assert.ok(posicion(r, 'aceptar', 97282) < posicion(r, 'completar', 97282));
  assert.ok(posicion(r, 'completar', 97282) < posicion(r, 'entregar', 97282));
});

test('una misión de nivel más alto que el personaje no se adelanta', () => {
  const entrada = [paso(punto(10, 10), ['aceptar', 835]), paso(punto(80, 80), ['completar', 835]), paso(punto(10, 11), ['aceptar', 900]), paso(punto(80, 81), ['entregar', 835])];
  const r = ordenar(entrada);
  assert.ok(posicion(r, 'aceptar', 900) > posicion(r, 'completar', 835));
});

test('un paso sin misión (un viaje) se queda en su sitio y corta la reordenación', () => {
  const viaje = { punto: punto(70, 70), texto: 'Coge el zepelín' };
  const entrada = [...durotar().slice(0, 4), viaje, ...durotar().slice(4)];
  const r = ordenar(entrada);
  assert.equal(r.indexOf(viaje), 4);
});

test('sin ahorro claro deja la ruta como estaba y no modifica la entrada', () => {
  const entrada = [paso(punto(10, 10), ['aceptar', 835]), paso(punto(11, 10), ['aceptar', 806]), paso(punto(12, 10), ['completar', 835]), paso(punto(13, 10), ['entregar', 835])];
  const copia = structuredClone(entrada);
  assert.deepEqual(ordenar(entrada), copia);
  assert.deepEqual(entrada, copia);
});
