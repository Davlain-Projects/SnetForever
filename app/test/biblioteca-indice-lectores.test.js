// Biblioteca de guías: los formatos de terceros en el índice (4Ever Leveling con datos INVENTADOS de ayuda/cuatroever.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { leerArchivoGuia } from '../src/biblioteca/leer.mjs';
import { crearIndice, CARPETA_GUIAS, RUTA_INDICE, LECTOR } from '../src/biblioteca/indice.mjs';
import { registro, PAQUETE } from './ayuda/cuatroever.mjs';

const datosNuevos = () => {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const datos = mkdtempSync(join(process.env.SNF_DATOS, 'lectores-'));
  mkdirSync(join(datos, CARPETA_GUIAS, '4Ever', 'inventado_Horde1020'), { recursive: true });
  mkdirSync(join(datos, CARPETA_GUIAS, '4Ever', 'inventado_Horde2030'), { recursive: true });
  return datos;
};
const espia = () => {
  const llamadas = [];
  const leer = (...a) => { llamadas.push(a[0]); return leerArchivoGuia(...a); };
  leer.llamadas = llamadas;
  return leer;
};
const roto = () => {
  const r = structuredClone(PAQUETE);
  r.segments['horde-10-20-chapter-1-bbb'].orders = { WARRIOR: 'no es una lista' };
  r.segments['horde-10-20-chapter-2-ccc'].orders = { MAGE: ['no-existe'] };
  return r;
};
const sinNada = async () => null;

test('LECTOR sube con los lectores nuevos (un índice de antes se rehace)', () => {
  assert.ok(LECTOR >= 5);
});

test('4Ever en el índice: un capítulo por entrada, con clases, razas, misiones, PNJ y zonas', async () => {
  const datos = datosNuevos();
  writeFileSync(join(datos, CARPETA_GUIAS, '4Ever', 'inventado_Horde1020', 'Data.lua'), registro('horde-10-20', PAQUETE));
  const ind = crearIndice({ datos, fs, base: sinNada });
  await ind.actualizar();
  const x = ind.indice();
  const e = x.guias.filter((g) => g.formato === '4ever');
  assert.equal(e.length, 4);
  assert.deepEqual(e.map((g) => g.clases), [['MAGE', 'PRIEST'], ['WARRIOR'], ['MAGE'], ['MAGE', 'PRIEST', 'WARRIOR']]);
  assert.deepEqual(e[2].razas, ['Orc']);
  assert.equal(e[0].razas, undefined);
  assert.deepEqual(e[0].misiones, [90001, 90002]);
  assert.deepEqual(e[0].pnjs, [70001]);
  assert.deepEqual(e[0].zonas, [1413]);
  assert.deepEqual(e[0].niveles, [10, 12]);
  assert.equal(e[0].faccion, 'Horde');
  assert.equal(e[0].pasos, 3);
  // el índice no guarda los pasos (leer_guia vuelve a leer el archivo)
  assert.equal(JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8')).guias[0].texto, undefined);
});

test('los capítulos rotos van a «sin leer» con el archivo, la parte y el motivo; el resto entra', async () => {
  const datos = datosNuevos();
  writeFileSync(join(datos, CARPETA_GUIAS, '4Ever', 'inventado_Horde1020', 'Data.lua'), registro('horde-10-20', roto()));
  const ind = crearIndice({ datos, fs, base: sinNada });
  await ind.actualizar();
  const x = ind.indice();
  assert.equal(x.guias.length, 2);
  assert.deepEqual(x.noLeidos, [
    { archivo: '4Ever/inventado_Horde1020/Data.lua', parte: '10-12 Llanos Inventados (WARRIOR)', motivo: 'roto' },
    { archivo: '4Ever/inventado_Horde1020/Data.lua', parte: '12-15 Colinas de Prueba (MAGE)', motivo: 'sin_pasos' },
  ]);
});

test('incremental: sin cambios no relee nada (y guarda los «sin leer» de cada parte); un cambio relee solo ese archivo', async () => {
  const datos = datosNuevos();
  const a = join(datos, CARPETA_GUIAS, '4Ever', 'inventado_Horde1020', 'Data.lua');
  const b = join(datos, CARPETA_GUIAS, '4Ever', 'inventado_Horde2030', 'Data.lua');
  writeFileSync(a, registro('horde-10-20', roto()));
  writeFileSync(b, registro('horde-20-30', PAQUETE));
  const leer = espia();
  const ind = crearIndice({ datos, fs, base: sinNada, leer });
  await ind.actualizar();
  assert.equal(leer.llamadas.length, 2);
  const antes = ind.indice();
  leer.llamadas.length = 0;
  await ind.actualizar();
  assert.equal(leer.llamadas.length, 0);
  assert.deepEqual(ind.indice().noLeidos, antes.noLeidos);
  assert.deepEqual(ind.indice().guias, antes.guias);
  // al reiniciar (otro crearIndice con el índice guardado), tampoco
  const otro = crearIndice({ datos, fs, base: sinNada, leer });
  await otro.actualizar();
  assert.equal(leer.llamadas.length, 0);
  writeFileSync(b, registro('horde-20-30', roto()));
  const t = new Date(Date.now() + 5000);
  utimesSync(b, t, t);
  await otro.actualizar();
  assert.deepEqual(leer.llamadas, [b]);
  assert.equal(otro.indice().noLeidos.length, 4);
});
