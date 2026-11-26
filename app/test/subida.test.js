// 13-nov: plan de subida 1-60 documentado (subida/plan.json) y lo que llega a la IA de él (datos.planSubida).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cargarPlan, planPara } from '../src/subida.mjs';

const T = (desde, hasta, zona, extra = {}) => ({ desde, hasta, zona, misiones: [`${zona} 1`, `${zona} 2`], fuentes: [`https://g/${zona}`], ...extra });
const PLAN = {
  facciones: {
    Horde: {
      tramos: [
        T(1, 6, 'Durotar', { razas: ['Orc', 'Troll'] }),
        T(1, 6, 'Mulgore', { razas: ['Tauren'] }),
        T(6, 12, 'Durotar', { razas: ['Orc', 'Troll'] }),
        T(10, 20, 'The Barrens'),
        T(18, 24, 'Stonetalon Mountains'),
        T(20, 30, 'Ashenvale', { saltar: ['Warsong Supplies'], siguiente: 'Thousand Needles a 28-30' }),
        T(20, 30, 'Hillsbrad Foothills'),
        T(29, 34, 'Thousand Needles'),
        T(55, 60, 'Winterspring'),
      ],
      consejos: ['Mata de camino'],
      clases: { DRUID: 'Forma de viaje a 30' },
      forever: ['Skyborne empieza en …'],
      fuentes: ['https://g/general'],
    },
  },
};

test('13-nov: zona de inicio por raza a nivel bajo', () => {
  assert.equal(planPara(PLAN, { faccion: 'Horde', raza: 'Tauren', nivel: 3 }).actual.zona, 'Mulgore');
  assert.equal(planPara(PLAN, { faccion: 'Horde', raza: 'Orc', nivel: 3 }).actual.zona, 'Durotar');
});

test('13-nov: por nivel; entre dos del mismo nivel, la de la zona donde está (por uiMap) y si no, la primera', () => {
  const base = { datos: { zonas: { nombre: { 1440: { en: 'Ashenvale', es: 'Vallefresno' }, 1424: { en: 'Hillsbrad Foothills' } } }, npc: {}, object: {} }, zona: (ui) => ({ 1440: 'Ashenvale', 1424: 'Hillsbrad Foothills' })[ui] ?? null };
  const pj = { faccion: 'Horde', raza: 'Tauren', clase: 'druid', nivel: 26 };
  const enHillsbrad = planPara(PLAN, pj, { mapa: 1424 }, base);
  assert.equal(enHillsbrad.actual.zona, 'Hillsbrad Foothills');
  const enVallefresno = planPara(PLAN, pj, { mapa: 1440 }, base);
  assert.equal(enVallefresno.actual.zona, 'Ashenvale');
  assert.deepEqual(enVallefresno.actual.misiones, ['Ashenvale 1', 'Ashenvale 2']);
  assert.deepEqual(enVallefresno.actual.saltar, ['Warsong Supplies']);
  assert.equal(planPara(PLAN, pj, {}).actual.zona, 'Ashenvale', 'sin saber dónde está, la primera');
});

test('13-nov: los siguientes van en orden hasta el 60, sin misiones, sin las de inicio de otras razas; con consejos, clase y fuentes', () => {
  const p = planPara(PLAN, { faccion: 'Horde', raza: 'Tauren', clase: 'DRUID', nivel: 26 }, {});
  assert.deepEqual(p.siguientes.map((s) => s.zona), ['Hillsbrad Foothills', 'Thousand Needles', 'Winterspring']);
  assert.ok(p.siguientes.every((s) => !('misiones' in s)));
  assert.deepEqual(p.consejos, ['Mata de camino']);
  assert.equal(p.clase, 'Forma de viaje a 30');
  assert.deepEqual(p.fuentes, ['https://g/Ashenvale', 'https://g/general']);
  assert.equal(p.actual.niveles, '20-30');
});

test('13-nov: sin facción o de una facción sin plan, null', () => {
  assert.equal(planPara(PLAN, { nivel: 10 }), null);
  assert.equal(planPara(PLAN, { faccion: 'Alliance', nivel: 10 }), null);
  assert.equal(planPara(null, { faccion: 'Horde', nivel: 10 }), null);
});

test('13-nov: cargarPlan lee un plan válido y da null con uno ilegible', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snf-subida-'));
  writeFileSync(join(dir, 'bueno.json'), JSON.stringify(PLAN));
  writeFileSync(join(dir, 'malo.json'), '{ no es json');
  assert.ok(cargarPlan(pathToFileURL(join(dir, 'bueno.json'))).facciones.Horde);
  assert.equal(cargarPlan(pathToFileURL(join(dir, 'malo.json'))), null);
});

test('13-nov: el plan de verdad (subida/plan.json) tiene las dos facciones, cubre del 1 al 60 y cada tramo trae fuentes', { skip: !existsSync(new URL('../src/subida/plan.json', import.meta.url)) && 'aún no hay plan.json' }, () => {
  const plan = cargarPlan();
  for (const faccion of ['Horde', 'Alliance']) {
    const tramos = plan.facciones[faccion].tramos;
    assert.ok(tramos.length >= 8, `${faccion}: ${tramos.length} tramos`);
    for (let nivel = 1; nivel <= 60; nivel++) assert.ok(tramos.some((t) => t.desde <= nivel && nivel <= t.hasta), `${faccion}: sin tramo para el nivel ${nivel}`);
    for (const t of tramos) assert.ok(Array.isArray(t.fuentes) && t.fuentes.length > 0, `${faccion} ${t.zona}: sin fuentes`);
  }
});

test('13-nov: planProfesiones: tramo actual, siguientes y el rango que aprender cerca del tope', async () => {
  const { planProfesiones } = await import('../src/subida.mjs');
  const G = { profesiones: { 171: { nombre: 'Alchemy', es: 'Alquimia', fuentes: ['https://g'],
    rangos: [{ nombre: 'Apprentice', hasta: 75 }, { nombre: 'Journeyman', hasta: 150, nivelPersonaje: 10, aprender: 'instructor' }],
    tramos: [{ desde: 1, hasta: 60, fabricar: 'A', veces: 60, materiales: [{ objeto: 'P', cantidad: 60 }] }, { desde: 60, hasta: 90, fabricar: 'B' }, { desde: 90, hasta: 120, fabricar: 'C' }, { desde: 120, hasta: 300, fabricar: 'D' }] } } };
  const [p] = planProfesiones(G, [{ id: 171, r: 55, m: 75 }]);
  assert.equal(p.actual.fabricar, 'A');
  assert.deepEqual(p.actual.materiales, [{ objeto: 'P', cantidad: 60 }]);
  assert.deepEqual(p.siguientes.map((s) => s.fabricar), ['B', 'C']);
  assert.equal(p.aprender.nombre, 'Journeyman', 'a 20 del tope');
  const [lejos] = planProfesiones(G, [{ id: 171, r: 10, m: 75 }]);
  assert.equal(lejos.aprender, undefined);
  assert.deepEqual(planProfesiones(G, [{ id: 1, r: 1, m: 75 }]), []);
});

test('13-nov: las guías de profesiones de verdad cubren del 1 al 300 las nueve profesiones, con fuentes', async () => {
  const { cargarProfesiones } = await import('../src/subida.mjs');
  const g = cargarProfesiones();
  for (const id of [171, 164, 333, 202, 165, 197, 185, 129, 356]) {
    const p = g.profesiones[id];
    assert.ok(p, `falta ${id}`);
    for (let n = 1; n <= 300; n += 1) assert.ok(p.tramos.some((t) => t.desde <= n && n <= t.hasta), `${p.nombre}: sin tramo para ${n}`);
    assert.ok(p.fuentes.length > 0);
  }
});
