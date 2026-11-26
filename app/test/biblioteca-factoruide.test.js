// Biblioteca de guías: el lector de los .fgguide de Factoruide (el botón «Share» de su programa: un JSON
// {format: 'factoruide-guide', version, meta, request, outcome}). Los datos son INVENTADOS con la misma forma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerArchivoGuia } from '../src/biblioteca/leer.mjs';

const temporal = (contenido, nombre = 'mi-guia-v1.fgguide') => {
  const ruta = join(mkdtempSync(join(tmpdir(), 'snf-fg-')), nombre);
  writeFileSync(ruta, typeof contenido === 'string' ? contenido : JSON.stringify(contenido));
  return ruta;
};
const leer = (ruta, extra = {}) => leerArchivoGuia(ruta, { fs, ...extra });

const paso = (extra) => ({ gear: 0, level: 1, power: 1, route_xp: 0, say: [], time: 10, world: [0, 1, 2], zone: 'Llanos', zone_id: 9, ...extra });
const GUIA = {
  format: 'factoruide-guide',
  version: 2,
  meta: { class: 'warrior', name: 'Ruta inventada 1-12', race: 'orc', from_level: 1, to_level: 12 },
  request: { class: 'warrior', race: 'orc', from_level: 1, to_level: 12, name: 'Ruta inventada 1-12', locale: 'enUS' },
  outcome: {
    explicit: true,
    notes: ['nota inventada'],
    plan: [{ kind: 'accept', quest: 91001 }],
    route: {
      name: 'Ruta inventada 1-12', class: 'Warrior', class_id: 1, faction: 'Horde', race_id: 2, from_level: 1, to_level: 12,
      locale: 'enUS', format: 2,
      steps: [
        paso({ kind: 'accept', map: { ui_map: 1411, x: 43.5, y: 68.25 }, quest: 91001, quest_name: 'Made-up Boars',
          target: { id: 71001, kind: 'npc', name: 'Made-up Grunt' }, text: 'Accept Made-up Boars from Made-up Grunt' }),
        paso({ kind: 'objective', map: { ui_map: 1411, x: 50, y: 60 }, quest: 91001, quest_name: 'Made-up Boars', objective: 0,
          slot: 1, mob_ids: [72001], target: { id: 72001, kind: 'npc', name: 'Made-up Boar' }, text: 'Kill Made-up Boar x8' }),
        paso({ kind: 'hearth', map: { ui_map: 1411, x: 40, y: 70 }, text: 'Hearthstone to the camp' }),
        paso({ kind: 'turnin', map: { ui_map: 1411, x: 43.5, y: 68.25 }, quest: 91001, quest_name: 'Made-up Boars',
          target: { id: 71001, kind: 'npc', name: 'Made-up Grunt' }, text: 'Turn in Made-up Boars to Made-up Grunt' }),
        paso({ kind: 'fly', map: { ui_map: 1413, x: 51.5, y: 30.1 }, target: { id: 8, kind: 'taxi', name: 'Made-up Post' }, text: 'Fly to Made-up Post' }),
      ],
    },
    walks: '4:no-se-lee',
  },
};

test('un .fgguide: nombre, facción, niveles, clase, raza, zonas y pasos con misiones, puntos y PNJ', () => {
  const r = leer(temporal(GUIA));
  assert.equal(r.formato, 'factoruide');
  assert.equal(r.guias.length, 1);
  const g = r.guias[0];
  assert.equal(g.k, 0);
  assert.equal(g.nombre, 'Ruta inventada 1-12');
  assert.equal(g.faccion, 'Horde');
  assert.deepEqual(g.niveles, [1, 12]);
  assert.deepEqual(g.clases, ['WARRIOR']);
  assert.deepEqual(g.razas, ['Orc']);
  assert.deepEqual(g.zonas, [1411, 1413]);
  assert.equal(g.pasos.length, 5);
  const [a, o, h, e] = g.pasos;
  assert.deepEqual(a, { n: 1, texto: 'Accept Made-up Boars from Made-up Grunt', textoEn: 'Accept Made-up Boars from Made-up Grunt',
    misiones: [{ q: 91001, accion: 'aceptar', nombre: 'Made-up Boars' }], punto: { mapa: 1411, x: 43.5, y: 68.25 }, pnjs: [71001] });
  assert.deepEqual(o.misiones, [{ q: 91001, accion: 'completar', nombre: 'Made-up Boars' }]);
  assert.deepEqual(o.pnjs, [72001]);
  assert.deepEqual(h.misiones, []);
  assert.equal(h.texto, 'Hearthstone to the camp');
  assert.deepEqual(e.misiones, [{ q: 91001, accion: 'entregar', nombre: 'Made-up Boars' }]);
  assert.equal(g.pasos[4].pnjs, undefined, 'un maestro de vuelo (taxi) no es un PNJ con id de criatura');
});

test('un .fgguide sin la ruta calculada: los pasos del plan (solo misiones)', () => {
  const soloPlan = structuredClone(GUIA);
  delete soloPlan.outcome.route;
  soloPlan.outcome.plan = [{ kind: 'accept', quest: 91001 }, { kind: 'objective', quest: 91001, objective: 0, spot: 0 },
    { kind: 'hearth' }, { kind: 'turn_in', quest: 91001 }];
  const r = leer(temporal(soloPlan));
  assert.equal(r.formato, 'factoruide');
  const g = r.guias[0];
  assert.equal(g.nombre, 'Ruta inventada 1-12');
  assert.deepEqual(g.clases, ['WARRIOR']);
  assert.deepEqual(g.pasos.map((p) => p.misiones), [
    [{ q: 91001, accion: 'aceptar' }], [{ q: 91001, accion: 'completar' }], [{ q: 91001, accion: 'entregar' }]]);
});

test('el formato de antes (brouzquest-result, .bqroute) también vale', () => {
  const r = leer(temporal({ ...GUIA, format: 'brouzquest-result' }, 'vieja.bqroute'));
  assert.equal(r.formato, 'factoruide');
});

test('uno roto o que no es de Factoruide sale «sin leer» con motivo', () => {
  assert.deepEqual(leer(temporal('{"format":"factoruide-guide", "outcome": {')), { noLeido: 'ilegible' });
  assert.deepEqual(leer(temporal({ format: 'otra-cosa', outcome: GUIA.outcome })), { noLeido: 'formato' });
  assert.deepEqual(leer(temporal({ ...GUIA, outcome: { route: { steps: [] }, plan: [] } })), { noLeido: 'vacio' });
  assert.deepEqual(leer(temporal('')), { noLeido: 'vacio' });
});
