// Revisión: el lector de las guías de SnetForever_Rutas (guiasAddon.mjs). Con los datos del repositorio (si están) y con
// carpetas inventadas: una guía partida en varios archivos, y un fallo que se guarda para no releer en cada turno.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeFs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerGuiaRutas, CARPETA_RUTAS } from '../src/guiasAddon.mjs';

const ADDONS_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'addons');
const conReales = { skip: !existsSync(join(ADDONS_REPO, CARPETA_RUTAS, 'guias_31.lua')) && 'faltan los datos reales', timeout: 300000 };

test('datos reales: lee SnetForever_Rutas entero, también las guías partidas en varios archivos (guias_31.lua y siguientes)', conReales, () => {
  const zephras = leerGuiaRutas(ADDONS_REPO, 'RestedXP Forever Dungeon Guide (A)\\01-09 Zephras Isle');
  assert.ok(zephras, 'la guía partida existe');
  assert.ok(Object.values(zephras.pasos).length > 100, `pasos: ${Object.values(zephras.pasos).length}`);
  assert.ok(leerGuiaRutas(ADDONS_REPO, 'RestedXP Forever Guide (A)\\01-06 Shadowglen'), 'y una normal');
  assert.equal(leerGuiaRutas(ADDONS_REPO, 'no existe'), null);
});

function carpeta(archivos) {
  const addons = mkdtempSync(join(tmpdir(), 'snf-rutas-'));
  mkdirSync(join(addons, CARPETA_RUTAS));
  writeFileSync(join(addons, CARPETA_RUTAS, 'SnetForever_Rutas.toc'), `## Interface: 16001\n\n${Object.keys(archivos).join('\n')}\n`);
  for (const [nombre, texto] of Object.entries(archivos)) writeFileSync(join(addons, CARPETA_RUTAS, nombre), texto);
  return addons;
}

test('leerGuiaRutas: un archivo roto da null y no se vuelve a leer mientras no cambie', () => {
  const addons = carpeta({ 'nucleo.lua': 'SNF_RUTAS = {guias = {}, alias = {}}\n', 'guias_1.lua': 'esto no es lua de datos\n' });
  let lecturas = 0;
  const fs = { ...nodeFs, readFileSync: (...a) => { if (String(a[0]).endsWith('.lua')) lecturas++; return nodeFs.readFileSync(...a); } };
  assert.equal(leerGuiaRutas(addons, 'x', { fs }), null);
  const primera = lecturas;
  assert.ok(primera > 0);
  assert.equal(leerGuiaRutas(addons, 'x', { fs }), null);
  assert.equal(lecturas, primera, 'el fallo se guarda con su firma');
});
