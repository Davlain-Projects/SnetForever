// Biblioteca de guías: el lector de 4Ever Leveling (Data.lua con «_G.FourEverLevelingContent.Register(…)»).
// 4Ever Leveling es «All Rights Reserved»: aquí NO va nada suyo. Los datos son INVENTADOS (nombres, ids, textos y
// coordenadas) con la misma forma que sus archivos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerArchivoGuia } from '../src/biblioteca/leer.mjs';
import { registro, t, paso, tarea, PAQUETE } from './ayuda/cuatroever.mjs';

const temporal = (texto, nombre = 'Data.lua') => {
  const dir = join(mkdtempSync(join(tmpdir(), 'snf-4ever-')), 'inventado_Horde1020');
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, nombre);
  writeFileSync(ruta, texto);
  return ruta;
};
const leer = (ruta, extra = {}) => leerArchivoGuia(ruta, { fs, ...extra });

test('paquete de niveles: un capítulo por cada grupo de clases con los mismos pasos, con facción, niveles y clases', () => {
  const r = leer(temporal(registro('horde-10-20', PAQUETE)));
  assert.equal(r.formato, '4ever');
  const resumen = r.guias.map((g) => [g.nombre, g.clases, g.razas ?? null, g.pasos.length]);
  assert.deepEqual(resumen, [
    ['10-12 Llanos Inventados', ['MAGE', 'PRIEST'], null, 3],
    ['10-12 Llanos Inventados', ['WARRIOR'], null, 3],
    ['10-12 Llanos Inventados', ['MAGE'], ['Orc'], 1],
    ['12-15 Colinas de Prueba', ['MAGE', 'PRIEST', 'WARRIOR'], null, 1],
  ]);
  assert.deepEqual(r.guias.map((g) => g.k), [0, 1, 2, 3]);
  for (const g of r.guias) assert.equal(g.faccion, 'Horde');
  assert.deepEqual(r.guias[0].niveles, [10, 12]);
  assert.deepEqual(r.guias[3].niveles, [12, 15]);
  assert.deepEqual(r.guias[0].zonas, [1413]);
  assert.equal(r.guias[0].capitulo, 'horde-10-20-chapter-1');
  assert.deepEqual(r.sinLeer ?? [], []);
});

test('pasos: texto en el idioma (y su inglés), misiones con nombre, punto en % del mapa y PNJ', () => {
  const ruta = temporal(registro('horde-10-20', PAQUETE));
  const [g] = leer(ruta).guias;
  const [p1, p2, p3] = g.pasos;
  assert.deepEqual(p1.misiones, [
    { q: 90001, accion: 'aceptar', nombre: 'Colmillos inventados' },
    { q: 90002, accion: 'aceptar', nombre: 'La carta perdida' },
  ]);
  assert.equal(p1.texto, 'Haz p1');
  assert.equal(p1.textoEn, 'Do p1');
  assert.deepEqual(p1.punto, { mapa: 1413, x: 51.23, y: 25 });
  assert.deepEqual(p1.pnjs, [70001]);
  assert.deepEqual(p2.misiones, [{ q: 90001, accion: 'completar', nombre: 'Colmillos inventados' }]);
  assert.deepEqual(p3.misiones, [{ q: 90001, accion: 'entregar', nombre: 'Colmillos inventados' }]);
  assert.deepEqual(g.pasos.map((p) => p.n), [1, 2, 3]);
  // en inglés, el texto y los nombres en inglés
  const [en] = leer(ruta, { idioma: 'en' }).guias;
  assert.equal(en.nombre, '10-12 Made-up Plains');
  assert.equal(en.pasos[0].texto, 'Do p1');
  assert.equal(en.pasos[0].misiones[0].nombre, 'Made-up Fangs');
});

test('un paso sin mapa no lleva punto; las condiciones de clase y raza del paso van en el paso', () => {
  const r = leer(temporal(registro('horde-10-20', PAQUETE)));
  const guerrero = r.guias[1];
  assert.equal(guerrero.pasos[1].punto, undefined);
  assert.deepEqual(guerrero.pasos[1].clases, ['WARRIOR']);
  const orco = r.guias[2];
  assert.deepEqual(orco.pasos[0].clases, ['MAGE']);
  assert.deepEqual(orco.pasos[0].razas, ['Orc']);
});

test('nunca se ejecuta: un os.execute en el texto es texto', () => {
  const r = leer(temporal(registro('horde-10-20', PAQUETE) + 'os.execute("del /q *")\n'));
  assert.equal(r.formato, '4ever');
  assert.match(r.guias[0].pasos[2].texto, /os\.execute\('del'\)/);
});

test('paquete de inicio: perfiles con sus capítulos, clases, razas y facción', () => {
  const inicio = {
    id: 'start-inventado',
    locations: PAQUETE.locations,
    profiles: {
      'forever-orc-mage': {
        chapters: [
          { id: 'c1', level: 1, title: t('1-6 Valle de Prueba'), untilLevel: 6 },
          { id: 'c2', level: 6, title: t('6-10 Llanos'), untilLevel: 10 },
        ],
        classes: ['MAGE'], faction: 'Horde', id: 'forever-orc-mage', maxLevel: 10, minLevel: 1, races: ['Orc'],
        experimentalBuilds: ['1', '2'],
        steps: [
          paso('s1', 'c1', [tarea('accept', 90001)], 'loc-1'),
          paso('s2', 'c1', [tarea('turn_in', 90001)], 'loc-2'),
          paso('s3', 'c2', [tarea('accept', 90004)], 'loc-2'),
        ],
      },
    },
    quests: PAQUETE.quests,
  };
  const r = leer(temporal(registro('start-inventado', inicio)));
  assert.equal(r.formato, '4ever');
  assert.deepEqual(r.guias.map((g) => [g.nombre, g.faccion, g.niveles, g.clases, g.razas, g.pasos.length]), [
    ['1-6 Valle de Prueba', 'Horde', [1, 6], ['MAGE'], ['Orc'], 2],
    ['6-10 Llanos', 'Horde', [6, 10], ['MAGE'], ['Orc'], 1],
  ]);
  assert.deepEqual(r.guias[0].pasos[1].misiones, [{ q: 90001, accion: 'entregar', nombre: 'Colmillos inventados' }]);
});

test('un capítulo roto sale «sin leer» con su motivo y el resto se lee', () => {
  const roto = structuredClone(PAQUETE);
  roto.segments['horde-10-20-chapter-1-bbb'].orders = { WARRIOR: 'no es una lista' };
  roto.segments['horde-10-20-chapter-2-ccc'].orders.MAGE = ['no-existe'];
  roto.segments['horde-10-20-chapter-2-ccc'].orders.PRIEST = ['no-existe'];
  roto.segments['horde-10-20-chapter-2-ccc'].orders.WARRIOR = ['no-existe'];
  const r = leer(temporal(registro('horde-10-20', roto)));
  assert.equal(r.formato, '4ever');
  assert.deepEqual(r.guias.map((g) => g.clases), [['MAGE', 'PRIEST'], ['MAGE']]);
  assert.deepEqual(r.sinLeer, [
    { parte: '10-12 Llanos Inventados (WARRIOR)', motivo: 'roto' },
    { parte: '12-15 Colinas de Prueba (MAGE, PRIEST, WARRIOR)', motivo: 'sin_pasos' },
  ]);
});

test('un archivo roto (sin cerrar, o con algo que no es un dato) sale «sin leer» con motivo', () => {
  const texto = registro('horde-10-20', PAQUETE);
  assert.deepEqual(leer(temporal(texto.slice(0, texto.length / 2))), { noLeido: 'ilegible' });
  assert.deepEqual(leer(temporal(texto.replace('"r1"', 'os.getenv("X")'))), { noLeido: 'ilegible' });
  // un Register sin tabla, o sin capítulos que leer
  assert.deepEqual(leer(temporal('_G.FourEverLevelingContent.Register("x","1")')), { noLeido: 'formato' });
  assert.deepEqual(leer(temporal(registro('horde-10-20', { id: 'x', steps: {} }))), { noLeido: 'formato' });
});

test('otros .lua del mismo addon (código o datos de otra cosa) siguen sin leerse por formato', () => {
  assert.deepEqual(leer(temporal('_G.FourEverLevelingAtlasData={["auctions"]={}}', 'Data.lua')), { noLeido: 'formato' });
  assert.deepEqual(leer(temporal('local f = CreateFrame("Frame")\nfunction f:Hola() end', 'Atlas.lua')), { noLeido: 'formato' });
});
