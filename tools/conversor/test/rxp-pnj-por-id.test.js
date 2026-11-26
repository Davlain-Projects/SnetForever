// Lote B (B3, revisión 5.1 I3): los PNJ de `.target` y `.mob` llevan su id cuando la base deja decidirlo sin adivinar.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { crearIndicePnj, indicePnjDeBase, resolverPnjs } from '../src/rxp/pnj-por-id.js';
import { rutaQuestieToc } from '../src/config.js';
import { leerEntidades } from '../src/questie/entidades.js';
import { cargarZonas } from '../src/questie/zonas.js';

// Base de prueba: spawns ya por uiMapID (el índice recibe los mapas de cada PNJ).
const indicePrueba = () => crearIndicePnj([
  [1, { name: 'Único', mapas: [1411] }],
  [2, { name: 'Repetido', mapas: [1411] }],
  [3, { name: 'Repetido', mapas: [1429] }],
  [4, { name: 'Repetido', mapas: [] }],
  [5, { name: 'Doble', mapas: [1411] }],
  [6, { name: 'Doble', mapas: [1411, 1412] }],
]);
const paso = (n, elementos) => ({ id: `p${n}`, n, etiquetas: {}, requisitos: [], elementos, linea: n });
const guia = (pasos) => ({ clave: 'Prueba\\1-10', pasos });
const IR = (mapa) => ({ t: 'goto', mapa, wx: 1, wy: 1 });
const MOB = (...nombres) => ({ t: 'mob', npcs: nombres.map((nombre) => ({ nombre })), linea: 7 });

describe('resolverPnjs', () => {
  test('un nombre único en la base lleva su id, aunque el paso no tenga goto', () => {
    const g = guia([paso(1, [MOB('Único')])]);
    const r = resolverPnjs([g], indicePrueba());
    assert.deepEqual(g.pasos[0].elementos[0].npcs, [{ nombre: 'Único', id: 1 }]);
    assert.equal(r.resueltos, 1);
    assert.deepEqual(r.sinId, []);
  });

  test('varios con ese nombre: el que tiene puntos en el mapa del goto más cercano del paso', () => {
    const g = guia([paso(1, [IR(1411), { t: 'nota' }, MOB('Repetido'), IR(1429)]), paso(2, [IR(1429), MOB('repetido')])]);
    resolverPnjs([g], indicePrueba());
    // En el paso 1 el goto más cercano (a una posición) es el de 1429; en el 2, el del mismo paso (sin distinguir mayúsculas).
    assert.equal(g.pasos[0].elementos[2].npcs[0].id, 3);
    assert.equal(g.pasos[1].elementos[1].npcs[0].id, 3);
  });

  test('sin goto en el paso, el del paso más cercano de la guía (a igual distancia, el de antes)', () => {
    const g = guia([paso(1, [IR(1429)]), paso(2, [MOB('Repetido')]), paso(3, [IR(1411)])]);
    resolverPnjs([g], indicePrueba());
    assert.equal(g.pasos[1].elementos[0].npcs[0].id, 3);
    const g2 = guia([paso(1, [IR(1429)]), paso(2, [{ t: 'nota' }]), paso(3, [MOB('Repetido')]), paso(4, [IR(1411)])]);
    resolverPnjs([g2], indicePrueba());
    assert.equal(g2.pasos[2].elementos[0].npcs[0].id, 2);
  });

  test('si no se puede decidir sin adivinar, solo el nombre, y se apunta con el motivo', () => {
    const g = guia([
      paso(1, [IR(1411), MOB('Doble')]), // 5 y 6 tienen puntos en 1411
      paso(2, [IR(1413), MOB('Repetido')]), // ninguno en 1413
      paso(3, [MOB('Desconocido')]), // no está en la base
    ]);
    const sinGoto = guia([paso(1, [MOB('Repetido')])]);
    const r = resolverPnjs([g, sinGoto], indicePrueba());
    assert.deepEqual(g.pasos[0].elementos[1].npcs, [{ nombre: 'Doble' }]);
    assert.deepEqual(g.pasos[1].elementos[1].npcs, [{ nombre: 'Repetido' }]);
    assert.deepEqual(g.pasos[2].elementos[0].npcs, [{ nombre: 'Desconocido' }]);
    assert.deepEqual(sinGoto.pasos[0].elementos[0].npcs, [{ nombre: 'Repetido' }]);
    assert.deepEqual(r.sinId.map((s) => [s.nombre, s.motivo, s.candidatos]), [
      ['Doble', 'varios-en-el-mapa', [5, 6]],
      ['Repetido', 'ninguno-en-el-mapa', [2, 3, 4]],
      ['Desconocido', 'no-esta-en-la-base', []],
      ['Repetido', 'sin-goto', [2, 3, 4]],
    ]);
    assert.equal(r.sinId[0].guia, 'Prueba\\1-10');
    assert.equal(r.sinId[0].linea, 7);
    assert.equal(r.sinId[0].mapa, 1411);
  });

  test('los que ya traen id no se tocan, ni los de otros comandos; el «*» de delante no cuenta para buscar', () => {
    const g = guia([paso(1, [IR(1429),
      { t: 'target', npcs: [{ nombre: 'Repetido', id: 4 }, { id: 9 }, { nombre: '*Único' }] },
      { t: 'vendor', npc: 2 },
    ])]);
    resolverPnjs([g], indicePrueba());
    assert.deepEqual(g.pasos[0].elementos[1].npcs, [{ nombre: 'Repetido', id: 4 }, { id: 9 }, { nombre: '*Único', id: 1 }]);
    assert.deepEqual(g.pasos[0].elementos[2], { t: 'vendor', npc: 2 });
  });
});

describe('resolverPnjs con la base real', { skip: !existsSync(rutaQuestieToc()) && 'falta QuestieDB' }, () => {
  test('«Kobold Vermin» (6 en Elwynn y otro id sin puntos) da 6 con un goto de Elwynn (1429)', () => {
    const toc = rutaQuestieToc();
    const indice = indicePnjDeBase(leerEntidades(toc), cargarZonas(dirname(toc)));
    const g = guia([paso(1, [IR(1429), MOB('Kobold Vermin')]), paso(2, [IR(1411), MOB('Kobold Vermin')])]);
    const r = resolverPnjs([g], indice);
    assert.equal(g.pasos[0].elementos[1].npcs[0].id, 6);
    assert.ok(indice.candidatos('kobold vermin').length >= 2, 'el nombre está repetido en la base');
    // En Durotar no hay ningún «Kobold Vermin»: sin id y apuntado.
    assert.equal(g.pasos[1].elementos[1].npcs[0].id, undefined);
    assert.deepEqual(r.sinId.map((s) => s.motivo), ['ninguno-en-el-mapa']);
  });
});
