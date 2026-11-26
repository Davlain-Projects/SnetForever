// Biblioteca de guías: las guías de Polestar (sus .guide, guardados como .txt): cabecera y pasos «step» con misiones.
// La guía es INVENTADA (ids, nombres y coordenadas), con la forma de las suyas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearBase } from '../src/base/base.mjs';
import { leerArchivoGuia } from '../src/biblioteca/leer.mjs';

const base = crearBase({
  version: 't', esquema: 1, quest: {}, npc: {}, object: {}, item: {},
  es: { quest: {}, npc: {}, object: {}, item: {} },
  zonas: { area: {}, nombre: { 1413: { en: 'The Barrens', es: 'Los Baldíos' }, 1411: { en: 'Durotar', es: 'Durotar' } } },
  mazmorra: {}, porFaccion: {},
});
const temporal = (texto) => {
  const ruta = join(mkdtempSync(join(tmpdir(), 'snf-polestar-')), '02-inventada.txt');
  writeFileSync(ruta, texto);
  return ruta;
};

const GUIA = `# Generada a mano para las pruebas: nada de esto es de verdad.
guide forever/horde/02-inventada
title Llanos de prueba
faction Horde
levels 10-14
zone The Barrens
class Warrior, Rogue
next forever/horde/03-otra

# Comentario largo de la cabecera.

step El cruce
  zone The Barrens
  tip Habla con el guarda del cruce.
  accept 93001                                -- Guarda inventado
  turnin 93002
  goto 52.1,30.4 "El cruce"

step Un sitio de Durotar
  only Warrior
  goto 40.5,60.25 map 1411
  complete 93001 @41.7,81.5                   -- mata cosas
  talk 74001 quest 93001.1
  kill 74002 quest 93001.2

step Solo para no druidas
  only !Druid
  note "Una nota entre comillas."
  turnin 93001
`;

test('Polestar: cabecera (título, facción, niveles, zona, clases) y un paso por «step»', () => {
  const r = leerArchivoGuia(temporal(GUIA), { fs, base });
  assert.equal(r.formato, 'polestar');
  assert.equal(r.guias.length, 1);
  const g = r.guias[0];
  assert.equal(g.nombre, 'Llanos de prueba');
  assert.equal(g.faccion, 'Horde');
  assert.deepEqual(g.niveles, [10, 14]);
  assert.deepEqual(g.clases, ['WARRIOR', 'ROGUE']);
  assert.deepEqual(g.zonas, [1413, 1411]);
  assert.equal(g.pasos.length, 3);
  const [a, b, c] = g.pasos;
  assert.equal(a.texto, 'El cruce. Habla con el guarda del cruce.');
  assert.deepEqual(a.misiones, [{ q: 93001, accion: 'aceptar' }, { q: 93002, accion: 'entregar' }]);
  assert.deepEqual(a.punto, { mapa: 1413, x: 52.1, y: 30.4 });
  assert.deepEqual(b.punto, { mapa: 1411, x: 40.5, y: 60.25 });
  assert.deepEqual(b.misiones, [{ q: 93001, accion: 'completar' }]);
  assert.deepEqual(b.pnjs, [74001, 74002]);
  assert.deepEqual(b.clases, ['WARRIOR']);
  assert.equal(c.texto, 'Solo para no druidas. Una nota entre comillas.');
  assert.ok(c.clases.includes('WARRIOR') && !c.clases.includes('DRUID'));
  assert.equal(c.punto, undefined);
});

test('Polestar sin base: la zona con nombre queda sin mapa; el «map N» vale igual', () => {
  const g = leerArchivoGuia(temporal(GUIA), { fs }).guias[0];
  assert.deepEqual(g.pasos[0].punto, { zona: 'The Barrens', x: 52.1, y: 30.4 });
  assert.deepEqual(g.pasos[1].punto, { mapa: 1411, x: 40.5, y: 60.25 });
});

test('un .txt que solo empieza por «guide» sin pasos «step» se sigue leyendo como texto', () => {
  const r = leerArchivoGuia(temporal('guide de cocina\nPaso uno\nPaso dos\n'), { fs, base });
  assert.equal(r.formato, 'texto');
  assert.equal(r.guias[0].pasos.length, 3);
});
