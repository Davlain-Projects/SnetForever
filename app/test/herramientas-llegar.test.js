// Herramienta como_llegar: la marca del destino y, si el jugador no está en ese mapa, el maestro de vuelo del mapa del
// destino que conoce (o el más cercano, o «a pie»). Base pequeña hecha a mano con crearBase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase } from '../src/base/base.mjs';
import { crearCatalogo } from '../src/herramientas/catalogo.mjs';
import { puntoDeMarca } from '../src/herramientas/marcas.mjs';

const BANDERA_VUELO = 8;
const datos = {
  version: '1',
  quest: {}, object: {}, item: {}, porMazmorra: {},
  es: { quest: {}, npc: {}, object: {}, item: {} },
  npc: {
    9203: { name: 'Cazadora', spawns: { 1413: [[20, 20]] }, friendlyToFaction: 'AH' },
    7001: { name: 'Maestro cercano', npcFlags: BANDERA_VUELO, spawns: { 1413: [[22, 22]] }, friendlyToFaction: 'H' },
    7002: { name: 'Maestro lejano', npcFlags: BANDERA_VUELO + 2, spawns: { 1413: [[80, 80]] }, friendlyToFaction: 'H' },
    7003: { name: 'Maestro aliado', npcFlags: BANDERA_VUELO, spawns: { 1413: [[20.5, 20.5]] }, friendlyToFaction: 'A' },
    7004: { name: 'Posadero', npcFlags: 2 + 4, spawns: { 1413: [[20.2, 20.2]] }, friendlyToFaction: 'H' },
    7005: { name: 'Maestro de otro mapa', npcFlags: BANDERA_VUELO, spawns: { 1411: [[30, 30]] }, friendlyToFaction: 'H' },
    7007: { name: 'Maestro en dos mapas', npcFlags: BANDERA_VUELO, spawns: { 1413: [[21, 21]], 1411: [[60, 60]] }, friendlyToFaction: 'H' },
    7006: { name: 'Maestro de los dos', npcFlags: BANDERA_VUELO, spawns: { 1412: [[50, 50]] } },
  },
  mazmorra: { 1581: { nombre: 'The Deadmines', zonaPadre: 40, entradas: [{ zona: 40, mapa: 1413, x: 30, y: 30 }] } },
  zonas: {
    area: {},
    nombre: {
      1411: { en: 'Durotar', es: 'Durotar' },
      1412: { en: 'Mulgore', es: 'Mulgore' },
      1413: { en: 'The Barrens', es: 'Los Baldíos' },
      1414: { en: 'Lonely Land', es: 'Tierra sola' },
    },
  },
};
const base = crearBase(datos);

const turno = (extra = {}) => ({
  version: 1, carpetaBase: null, idioma: 'es',
  pj: { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 10 },
  lugar: { mapa: 1411, x: 50, y: 50, zona: 'Durotar', subzona: null, instancia: false },
  registro: [], vuelos: [], vuelosIds: null,
  ...extra,
});
function llegar(t, lector = {}) {
  const cat = crearCatalogo({ turno: () => t, base: async () => base, lector });
  return Object.fromEntries(cat.map((h) => [h.nombre, h.ejecutar])).como_llegar;
}
const enMapa = (mapa) => ({ lugar: { mapa, x: 10, y: 10, zona: 'X', subzona: null, instancia: false } });

test('con vuelos aprendidos: el aprendido del mapa del destino aunque el otro esté más cerca', async () => {
  const r = await llegar(turno({ vuelosIds: [7002] }))({ destino: 'Cazadora' });
  assert.equal(r.consejo, 'vuelo');
  assert.deepEqual(r.destino, { texto: 'Cazadora', marca: 'B:n9203', mapa: 1413, zona: 'Los Baldíos' });
  assert.deepEqual(r.vuelo, { pnj: 'Maestro lejano', marca: 'B:n7002', zona: 'Los Baldíos', aprendido: true });
  assert.ok(!('entrada' in r));
  const pj = { faccion: 'Horde' };
  assert.ok(puntoDeMarca(r.vuelo.marca, { base, pj, mapaJugador: 1413 }), 'la marca se resuelve');
  assert.ok(!JSON.stringify(r).includes('"x"'), 'ninguna coordenada');
});

test('el destino se encuentra por nombre, por marca y por número de PNJ', async () => {
  const f = llegar(turno({ vuelosIds: [7002] }));
  for (const destino of ['Cazadora', 'cazadora', 'B:n9203', '9203']) {
    const r = await f({ destino });
    assert.equal(r.destino.marca, 'B:n9203', destino);
    assert.equal(r.vuelo.marca, 'B:n7002', destino);
  }
});

test('el jugador ya está en el mapa del destino: aquí, sin vuelo', async () => {
  const r = await llegar(turno(enMapa(1413)))({ destino: 'Cazadora' });
  assert.equal(r.consejo, 'aqui');
  assert.ok(!('vuelo' in r));
  assert.equal(r.destino.mapa, 1413);
});

test('sin vuelosIds (el addon aún no los manda): el más cercano, sin saber si lo tiene', async () => {
  const r = await llegar(turno())({ destino: 'Cazadora' });
  assert.equal(r.consejo, 'vuelo_si_lo_tienes');
  assert.deepEqual(r.vuelo, { pnj: 'Maestro cercano', marca: 'B:n7001', zona: 'Los Baldíos', aprendido: null });
});

test('ningún maestro de ese mapa aprendido: a pie', async () => {
  for (const vuelosIds of [[], [4000], [7005]]) {
    const r = await llegar(turno({ vuelosIds }))({ destino: 'Cazadora' });
    assert.equal(r.consejo, 'a_pie', JSON.stringify(vuelosIds));
    assert.ok(!('vuelo' in r));
  }
});

test('de dos maestros aprendidos del mapa, el más cercano al destino', async () => {
  const r = await llegar(turno({ vuelosIds: [7002, 7001] }))({ destino: 'Cazadora' });
  assert.equal(r.vuelo.marca, 'B:n7001');
  assert.equal(r.vuelo.aprendido, true);
});

test('un maestro solo de la Alianza no sale nunca (aunque sea el más cercano), y sí uno de los dos bandos', async () => {
  const horda = await llegar(turno({ vuelosIds: [7003, 7001] }))({ destino: 'Cazadora' });
  assert.equal(horda.vuelo.marca, 'B:n7001');
  const sin = await llegar(turno({ vuelosIds: [7003] }))({ destino: 'Cazadora' });
  assert.equal(sin.consejo, 'a_pie');
  const alianza = await llegar(turno({ pj: { faccion: 'Alliance', clase: 'WARRIOR', nivel: 10 } }))({ destino: 'Cazadora' });
  assert.equal(alianza.vuelo.marca, 'B:n7003');
  const ambos = await llegar(turno({ vuelosIds: [7006] }))({ destino: 'Mulgore' });
  assert.equal(ambos.vuelo.marca, 'B:n7006', 'sin friendlyToFaction vale para los dos');
});

test('una mazmorra: su entrada como destino y el vuelo del mapa de la entrada', async () => {
  const r = await llegar(turno({ vuelosIds: [7002] }))({ destino: 'The Deadmines' });
  assert.equal(r.entrada.marca, 'B:e1581');
  assert.equal(r.entrada.zona, 'Los Baldíos');
  assert.equal(r.destino.marca, 'B:e1581');
  assert.equal(r.destino.mapa, 1413);
  assert.equal(r.consejo, 'vuelo');
  assert.equal(r.vuelo.marca, 'B:n7002');
  const sinArticulo = await llegar(turno(enMapa(1413)))({ destino: 'deadmines' });
  assert.equal(sinArticulo.entrada.marca, 'B:e1581');
  assert.equal(sinArticulo.consejo, 'aqui');
});

test('una zona sin punto propio: su maestro de vuelo hace de destino', async () => {
  const r = await llegar(turno({ vuelosIds: [7002, 7001] }))({ destino: 'Los Baldíos' });
  assert.equal(r.destino.mapa, 1413);
  assert.equal(r.destino.zona, 'Los Baldíos');
  assert.match(r.destino.marca, /^B:n700[12]$/);
  assert.equal(r.consejo, 'vuelo');
  assert.equal(r.vuelo.marca, r.destino.marca);
  const aqui = await llegar(turno(enMapa(1413)))({ destino: 'Los Baldíos' });
  assert.equal(aqui.consejo, 'aqui');
  assert.ok(!('vuelo' in aqui));
  const durotar = await llegar(turno(enMapa(1412)))({ destino: 'Durotar' });
  assert.equal(durotar.destino.marca, 'B:n7005');
});

test('una marca de guía G: se usa como destino', async () => {
  const lector = { guia: (id) => (id === 'abcdef01' ? { pasos: [{ n: 1, texto: 'Ir al puente', punto: { mapa: 1413, x: 25, y: 25 } }] } : null) };
  const r = await llegar(turno({ vuelosIds: [7002] }), lector)({ destino: 'G:abcdef01:1' });
  assert.equal(r.destino.marca, 'G:abcdef01:1');
  assert.equal(r.destino.mapa, 1413);
  assert.equal(r.vuelo.marca, 'B:n7002');
  assert.deepEqual(await llegar(turno(), lector)({ destino: 'G:abcdef01:2' }), { error: 'destino_desconocido' });
});

test('errores: destino desconocido, vacío o mal escrito; sin base; ningún mensaje lleva rutas', async () => {
  for (const destino of ['Narnia', '', '   ', 'B:n99999', 'B:e1', undefined, 5, {}]) {
    assert.deepEqual(await llegar(turno())({ destino }), { error: 'destino_desconocido' }, String(destino));
  }
  assert.deepEqual(await llegar(turno())(undefined), { error: 'destino_desconocido' });
  const cat = crearCatalogo({ turno: () => turno(), base: async () => null, lector: {} });
  const sinBase = cat.find((h) => h.nombre === 'como_llegar');
  assert.deepEqual(await sinBase.ejecutar({ destino: 'Cazadora' }), { error: 'sin_base' });
});

test('el esquema pide el destino', () => {
  const h = crearCatalogo({ turno: () => turno(), base: async () => base, lector: {} }).find((x) => x.nombre === 'como_llegar');
  assert.deepEqual(h.esquema.required, ['destino']);
  assert.equal(h.esquema.additionalProperties, false);
});

test('un maestro con puntos en dos mapas no vale si la app apuntaría al otro mapa (el del jugador)', async () => {
  const sin = await llegar(turno())({ destino: 'Cazadora' });
  assert.equal(sin.vuelo.marca, 'B:n7001', '7007 es el más cercano, pero con el jugador en 1411 su marca cae en 1411');
  const solo = await llegar(turno({ vuelosIds: [7007] }))({ destino: 'Cazadora' });
  assert.equal(solo.consejo, 'a_pie');
  const desdeOtro = await llegar(turno(enMapa(1412)))({ destino: 'Cazadora' });
  assert.notEqual(desdeOtro.vuelo?.marca, 'B:n7007');
});

test('una zona sin maestro de vuelo: destino sin marca; aquí si el jugador está dentro y, si no, a pie', async () => {
  const dentro = await llegar(turno(enMapa(1414)))({ destino: 'Tierra sola' });
  assert.deepEqual(dentro, { destino: { texto: 'Tierra sola', marca: null, mapa: 1414, zona: 'Tierra sola' }, consejo: 'aqui' });
  const fuera = await llegar(turno({ vuelosIds: [7002] }))({ destino: 'Lonely Land' });
  assert.deepEqual(fuera, { destino: { texto: 'Tierra sola', marca: null, mapa: 1414, zona: 'Tierra sola' }, consejo: 'a_pie' });
  const alianza = await llegar(turno({ ...enMapa(1413), pj: { faccion: 'Alliance', clase: 'WARRIOR', nivel: 10 } }))({ destino: 'Durotar' });
  assert.equal(alianza.destino.marca, null, 'Durotar solo tiene maestro de la Horda');
  assert.equal(alianza.consejo, 'a_pie');
});
