// Pruebas de las guías por mazmorra (ruta con mazmorras 20-60) y de sus avisos (tarea 8): qué mazmorras y
// misiones entran, el orden de las partes, el paso de entrada y el aviso. La de integración carga la base
// real y se salta si no está el origen.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fuentesDePrueba } from './ayuda/vista.js';
import { guiasDeMazmorras } from '../src/mazmorras/guias.js';
import { indexarMazmorras } from '../src/mazmorras/indice.js';
import { cargarFuentes } from '../src/cadenas/fuentes.js';
import { leerInstancias } from '../src/questie/instancias.js';
import { leerOpenMap } from '../src/openmap.js';
import { rutaQuestieToc } from '../src/config.js';

const HORDA = 8589934770;
const ALIANZA = 4294967373;
const AREA = 100;
const mision = (extra) => ({
  name: 'Misión', startedBy: [[1]], finishedBy: [[1]], requiredLevel: 20, questLevel: 22, zoneOrSort: 0, ...extra,
});
const dentro = { name: 'Dentro', spawns: { [AREA]: [[-1, -1]] } };
const pnjEn = (mapa, x, y) => ({ name: `PNJ ${mapa}`, spawns: { [mapa]: [[x, y]] } });
const MAZ = { [AREA]: { nombre: 'Cueva', alternativas: [], zonaPadre: 14, entradas: [{ zona: 14, x: 40, y: 60, mapa: 14 }] } };

const datos = {
  mazmorras: MAZ,
  pnjs: { 1: pnjEn(14, 10, 10), 2: pnjEn(15, 20, 20), 3: dentro, 4: pnjEn(14, 30, 30) },
  misiones: {
    // Horda: la da el PNJ 2 (mapa 15, nivel 21), la 3 el PNJ 1 (mapa 14, nivel 22); la 4 se da dentro (nivel 23)
    10: mision({ zoneOrSort: AREA, requiredLevel: 21, requiredRaces: HORDA, startedBy: [[2]], finishedBy: [[3]] }),
    11: mision({ zoneOrSort: AREA, requiredLevel: 22, requiredRaces: HORDA, startedBy: [[1]], finishedBy: [[1]] }),
    12: mision({ zoneOrSort: AREA, requiredLevel: 23, requiredRaces: HORDA, startedBy: [[3]], finishedBy: [[2]] }),
    // sin facción
    13: mision({ zoneOrSort: AREA, requiredLevel: 24, startedBy: [[4]], finishedBy: [[4]] }),
    // continuación y nivel por encima del máximo: no entran
    14: mision({ zoneOrSort: AREA, requiredLevel: 25, preQuestSingle: [13], startedBy: [[4]], finishedBy: [[4]] }),
    15: mision({ zoneOrSort: AREA, requiredLevel: 31, startedBy: [[4]], finishedBy: [[4]] }),
    // solo Alianza
    16: mision({ zoneOrSort: AREA, requiredLevel: 22, requiredRaces: ALIANZA, startedBy: [[1]], finishedBy: [[1]] }),
  },
};
const OPENMAP = {
  niveles: new Map(), sinEntrada: [], licencia: '',
  instancias: [{ instancia: 7, nombre: 'Cueva', banda: false, min: 20, max: 30 }],
};

function guiar(extra = {}, opciones = {}, indiceOpenMap = OPENMAP) {
  const fuentes = fuentesDePrueba({ ...datos, ...extra });
  const indice = indexarMazmorras({ ...fuentes, openmap: indiceOpenMap, instancias: new Map([[7, AREA]]) });
  return { indice, ...guiasDeMazmorras(indice, { ...fuentes, ...opciones }) };
}
const claveH = 'Mazmorras SnetForever (H)\\20-30 Cueva';
const claveA = 'Mazmorras SnetForever (A)\\20-30 Cueva';
const elementos = (g) => g.pasos.flatMap((p) => p.elementos);

describe('guías de una mazmorra', () => {
  test('una guía por facción con la clave, el tipo y los campos del contrato', () => {
    const r = guiar();
    assert.deepEqual([...r.guias.keys()].sort(), [claveA, claveH]);
    const g = r.guias.get(claveH);
    assert.equal(g.clave, claveH);
    assert.equal(g.grupo, 'Mazmorras SnetForever (H)');
    assert.equal(g.nombre, '20-30 Cueva');
    assert.equal(g.tipo, 'mazmorra');
    assert.equal(g.area, AREA);
    assert.equal(g.instancia, 7);
    assert.equal(g.faccion, 'Horde');
    assert.deepEqual(g.niveles, { min: 20, max: 30 });
    assert.deepEqual(g.titulo, { en: 'Cueva' });
    assert.deepEqual(g.siguientes, []);
    assert.deepEqual(g.mazmorras, []);
    assert.equal(g.sinVerificar, true);
  });

  test('entran las misiones de la facción o sin facción, sin continuación y dentro del nivel', () => {
    const r = guiar();
    const aceptadas = (c) => elementos(r.guias.get(c)).filter((e) => e.t === 'accept').map((e) => e.q);
    assert.deepEqual(aceptadas(claveH).sort((a, b) => a - b), [10, 11, 12, 13]);
    assert.deepEqual(aceptadas(claveA).sort((a, b) => a - b), [13, 16]);
  });

  test('las partes van en orden: recoger fuera por mapa, entrada, recoger dentro, completar, entregar', () => {
    const q = (id, n) => ({ ...datos.misiones[id], objectives: [[[n, null]]] });
    const r = guiar({
      misiones: { ...datos.misiones, 10: q(10, 3), 11: q(11, 3), 12: q(12, 3), 13: q(13, 3) },
    });
    const g = r.guias.get(claveH);
    const marca = g.pasos.map((p) => p.elementos.map((e) => (e.t === 'goto' ? `goto${e.mapa}`
      : e.t === 'subzone' ? 'entrada' : `${e.t}${e.q}`)));
    // 10 (mapa 15, nivel 21) va antes que 11 y 13 (mapa 14): el mapa 15 es el de la primera misión por nivel
    assert.deepEqual(marca[0], ['goto15', 'accept10']);
    assert.deepEqual(marca[1], ['goto14', 'accept11']);
    assert.deepEqual(marca[2], ['goto14', 'accept13']);
    assert.deepEqual(marca[3], ['goto14', 'entrada']);
    assert.deepEqual(marca[4], ['accept12']); // se da dentro: sin goto
    const completar = marca.slice(5, 9).map((m) => m.filter((x) => x.startsWith('complete')));
    assert.deepEqual(completar.map((c) => c[0]), ['complete10', 'complete11', 'complete12', 'complete13']);
    assert.ok(marca.slice(9).every((m) => m.some((x) => x.startsWith('turnin'))));
    assert.equal(marca.length, 5 + 4 + 4);
  });

  test('el paso de entrada lleva el goto a la entrada y la subzona solo de instancia', () => {
    const g = guiar().guias.get(claveH);
    const paso = g.pasos.find((p) => p.elementos.some((e) => e.t === 'subzone'));
    assert.deepEqual(paso.elementos, [
      { t: 'goto', mapa: 14, x: 40, y: 60, modo: 'flecha' },
      { t: 'subzone', area: AREA, soloInstancia: true },
    ]);
    assert.equal(paso.sinVerificar, undefined);
  });

  test('las entregas van agrupadas por mapa, con las de dentro primero', () => {
    const g = guiar().guias.get(claveH);
    const entregas = g.pasos.filter((p) => p.elementos.some((e) => e.t === 'turnin'));
    // la 10 se entrega dentro (PNJ 3), la 11 y la 13 en el mapa 14 (el de la primera por nivel) y la 12 en el 15
    assert.deepEqual(entregas.map((p) => p.elementos.find((e) => e.t === 'turnin').q), [10, 11, 13, 12]);
    assert.equal(entregas[0].elementos.some((e) => e.t === 'goto'), false);
    assert.equal(entregas[3].elementos.find((e) => e.t === 'goto').mapa, 15);
  });

  test('cada paso lleva n, id, linea 0 y los pasos de la misma guía no repiten id', () => {
    const g = guiar().guias.get(claveH);
    assert.deepEqual(g.pasos.map((p) => p.n), g.pasos.map((_, i) => i + 1));
    assert.equal(new Set(g.pasos.map((p) => p.id)).size, g.pasos.length);
    assert.ok(g.pasos.every((p) => p.linea === 0));
  });

  test('una facción sin misiones no tiene guía y la fila lo dice', () => {
    const r = guiar({ misiones: { 10: datos.misiones[10] } });
    assert.deepEqual([...r.guias.keys()], [claveH]);
    const fila = r.filas.find((f) => f.area === AREA && f.faccion === 'Alliance');
    assert.equal(fila.misiones, 0);
    assert.equal(fila.guia, undefined);
    assert.match(fila.motivo, /sin misiones/);
    assert.equal(r.avisos.some((a) => a.faccion === 'Alliance'), false);
  });

  test('una clave verificada quita sinVerificar', () => {
    const r = guiar({}, { verificadas: { [claveH]: { fecha: '2026-11-09', quien: 'el jugador', como: 'juego' } } });
    assert.equal(r.guias.get(claveH).sinVerificar, false);
    assert.equal(r.guias.get(claveA).sinVerificar, true);
  });

  test('base opcional: pone origen', () => {
    const base = { base: 'QuestieDB', version: 'x', commit: 'y' };
    const r = guiar({}, { base });
    assert.deepEqual(r.guias.get(claveH).origen, base);
  });
});

describe('previas externas', () => {
  const q = (extra) => ({ ...datos.misiones[13], objectives: [[[3, null]]], ...extra });
  const condiciones = (g, id) => g.pasos.filter((p) => p.elementos.some((e) => [e.q].includes(id) && e.t !== 'isQuestTurnedIn'))
    .map((p) => p.elementos.filter((e) => e.t === 'isQuestTurnedIn'));

  test('una previa externa pone isQuestTurnedIn en los tres pasos de la misión', () => {
    const r = guiar({ misiones: { 13: q({ preQuestSingle: [900], preQuestGroup: [901] }) } });
    const g = r.guias.get(claveH);
    const c = condiciones(g, 13);
    assert.equal(c.length, 3);
    for (const x of c) assert.deepEqual(x, [{ t: 'isQuestTurnedIn', qs: [900] }, { t: 'isQuestTurnedIn', qs: [901] }]);
  });

  test('una misión cuya previa está en la mazmorra es continuación y no pone condiciones', () => {
    const r = guiar({ misiones: { 13: q({ requiredLevel: 24 }), 17: q({ requiredLevel: 26, preQuestSingle: [13] }) } });
    const g = r.guias.get(claveH);
    // 17 es continuación de 13: no entra; 13 no tiene previas
    assert.equal(elementos(g).some((e) => e.t === 'isQuestTurnedIn'), false);
    // una previa que sí está en la guía (otra misión sin continuación por ser de grupo) tampoco
    const r2 = guiar({ misiones: { 13: q({ requiredLevel: 24 }), 18: q({ requiredLevel: 26, preQuestSingle: [13, 902] }) } });
    const e18 = r2.indice.porMazmorra[AREA].misiones.find((m) => m.q === 18);
    assert.equal(e18.continuacion, true); // 13 está dentro: es continuación y queda fuera
  });

  test('con la previa en la guía y otra externa, solo sale la externa', () => {
    // 19 tiene dos previas de grupo: 13 (en la guía, pero 19 no sería continuación si 13 no estuviera)
    const fuentes = fuentesDePrueba({ ...datos, misiones: { 13: q({ requiredLevel: 24 }), 19: q({ requiredLevel: 26 }) } });
    const indice = indexarMazmorras({ ...fuentes, openmap: OPENMAP, instancias: new Map([[7, AREA]]) });
    const m = indice.porMazmorra[AREA].misiones.find((x) => x.q === 19);
    m.todas = [13, 903]; // sintético: el índice marcaría continuación; la quitamos para forzar su entrada
    delete m.continuacion;
    const g = guiasDeMazmorras(indice, fuentes).guias.get(claveH);
    const c = g.pasos.filter((p) => p.elementos.some((e) => e.q === 19)).map((p) => p.elementos.filter((e) => e.t === 'isQuestTurnedIn'));
    assert.equal(c.length, 3);
    for (const x of c) assert.deepEqual(x, [{ t: 'isQuestTurnedIn', qs: [903] }]);
  });

  test('si una de las alternativas de «basta una» está en la guía, no queda condición', () => {
    const fuentes = fuentesDePrueba({ ...datos, misiones: { 13: q({ requiredLevel: 24 }), 19: q({ requiredLevel: 26 }) } });
    const indice = indexarMazmorras({ ...fuentes, openmap: OPENMAP, instancias: new Map([[7, AREA]]) });
    const m = indice.porMazmorra[AREA].misiones.find((x) => x.q === 19);
    m.previas = [13, 904]; // sintético: 13 está en la guía y basta con ella
    delete m.continuacion;
    const g = guiasDeMazmorras(indice, fuentes).guias.get(claveH);
    const c = g.pasos.filter((p) => p.elementos.some((e) => e.q === 19)).map((p) => p.elementos.filter((e) => e.t === 'isQuestTurnedIn'));
    assert.equal(c.length, 3);
    for (const x of c) assert.deepEqual(x, []);
  });
});

describe('recoge dentro y entrega fuera sin punto', () => {
  test('va al último grupo de entregas, sin goto y con sinVerificar punto', () => {
    const r = guiar({
      pnjs: { ...datos.pnjs, 5: { name: 'Sin spawns' } },
      misiones: {
        10: { ...datos.misiones[10], startedBy: [[3]], finishedBy: [[1]] },
        11: { ...datos.misiones[11], startedBy: [[3]], finishedBy: [[5]], requiredLevel: 21 },
        12: { ...datos.misiones[12], startedBy: [[3]], finishedBy: [[2]], requiredLevel: 22 },
      },
    });
    const entregas = r.guias.get(claveH).pasos.filter((p) => p.elementos.some((e) => e.t === 'turnin'));
    assert.deepEqual(entregas.map((p) => p.elementos.find((e) => e.t === 'turnin').q), [10, 12, 11]);
    const ultima = entregas[2];
    assert.equal(ultima.elementos.some((e) => e.t === 'goto'), false);
    assert.equal(ultima.sinVerificar, 'punto');
  });
});

describe('qué mazmorras entran', () => {
  const con = (instancias, extra = {}) => ({ ...OPENMAP, instancias: [{ instancia: 7, nombre: 'Cueva', banda: false, ...instancias }], ...extra });
  test('las bandas, las de nivel mínimo menor de 18 y las excluidas no tienen guía', () => {
    assert.equal(guiar({}, {}, con({ min: 20, max: 30, banda: true })).guias.size, 0);
    assert.equal(guiar({}, {}, con({ min: 17, max: 25 })).guias.size, 0);
    assert.equal(guiar({}, {}, con({ min: 18, max: 30 })).guias.size, 2);
    // `excluir` por sigla: depende de que el índice dé la sigla SFK al área 209 (MAZMORRAS de rxp/comandos.js)
    const fuentes = fuentesDePrueba({ ...datos, mazmorras: { 209: { ...MAZ[AREA] } }, misiones: {
      10: { ...datos.misiones[10], zoneOrSort: 209 } } });
    const indice = indexarMazmorras({ ...fuentes, openmap: OPENMAP, instancias: new Map([[7, 209]]) });
    assert.equal(guiasDeMazmorras(indice, { ...fuentes }).guias.size, 1);
    assert.equal(guiasDeMazmorras(indice, { ...fuentes, excluir: ['SFK'] }).guias.size, 0);
    const fila = guiasDeMazmorras(indice, { ...fuentes, excluir: ['SFK'] }).filas.find((f) => f.area === 209);
    assert.match(fila.motivo, /excluida/);
  });

  test('sin niveles no hay guía', () => {
    const fuentes = fuentesDePrueba({ ...datos, misiones: {} });
    const indice = indexarMazmorras({ ...fuentes, openmap: OPENMAP, instancias: new Map([[7, AREA]]) });
    delete indice.porMazmorra[AREA].niveles;
    assert.equal(guiasDeMazmorras(indice, { ...fuentes }).guias.size, 0);
  });
});

describe('avisos', () => {
  test('uno por guía: nivel, hasta, texto, guía, hechas y modoHechas todas', () => {
    const r = guiar();
    const a = r.avisos.find((x) => x.faccion === 'Horde');
    assert.deepEqual(a, {
      id: `mazmorra-${AREA}-H`,
      tipo: 'mazmorra',
      faccion: 'Horde',
      area: AREA,
      nivel: 20,
      hasta: 30,
      texto: { en: 'Dungeon: Cueva', es: 'Mazmorra: Cueva' },
      guia: claveH,
      hechas: [10, 11, 12, 13],
      modoHechas: 'todas',
    });
    assert.equal(r.avisos.length, 2);
    assert.equal(r.avisos.find((x) => x.faccion === 'Alliance').id, `mazmorra-${AREA}-A`);
  });
});

const hay = existsSync(rutaQuestieToc());

describe('guías de mazmorra en la base real', { skip: !hay }, () => {
  let r;
  const aceptadas = (clave) => r.guias.get(clave).pasos.flatMap((p) => p.elementos).filter((e) => e.t === 'accept').map((e) => e.q);
  before(() => {
    const fuentes = cargarFuentes();
    const dir = dirname(rutaQuestieToc());
    const indice = indexarMazmorras({
      ...fuentes, openmap: leerOpenMap(dir.replace(/QuestieDB$/, 'OpenMap')), instancias: leerInstancias(dir),
    });
    r = guiasDeMazmorras(indice, { ...fuentes, verificadas: {} });
  });

  test('Shadowfang Keep para la Horda acepta 1013, 1014 y 1098', () => {
    const clave = 'Mazmorras SnetForever (H)\\18-23 Shadowfang Keep';
    assert.ok(r.guias.has(clave), 'falta la guía');
    for (const q of [1013, 1014, 1098]) assert.ok(aceptadas(clave).includes(q), `falta ${q}`);
    assert.equal(r.guias.get(clave).sinVerificar, true);
  });

  test('The Stockade para la Alianza acepta 386 y no hay guía para la Horda', () => {
    assert.ok(aceptadas('Mazmorras SnetForever (A)\\23-28 The Stockade').includes(386));
    assert.equal(r.guias.has('Mazmorras SnetForever (H)\\23-28 The Stockade'), false);
  });

  test('Ragefire Chasm está excluida: no hay guía de la 2437', () => {
    assert.equal([...r.guias.values()].some((g) => g.area === 2437), false);
    assert.equal(r.avisos.some((a) => a.area === 2437), false);
  });
});
