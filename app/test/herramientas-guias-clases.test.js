// Servidor de herramientas: buscar_guias y leer_guia con guías por clase y raza (4Ever Leveling, datos INVENTADOS de
// ayuda/cuatroever.mjs). Sin base: los nombres de las misiones salen de la guía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearIndice, CARPETA_GUIAS, RUTA_INDICE } from '../src/biblioteca/indice.mjs';
import { turnoDe, escribirTurno } from '../src/herramientas/config.mjs';
import { crearFuentes } from '../src/herramientas/fuentes.mjs';
import { crearCatalogo } from '../src/herramientas/catalogo.mjs';
import { registro, PAQUETE } from './ayuda/cuatroever.mjs';

async function preparar(pj) {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const datos = mkdtempSync(join(process.env.SNF_DATOS, 'clases-'));
  const carpeta = join(datos, CARPETA_GUIAS, 'inventado_Horde1020');
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'Data.lua'), registro('horde-10-20', PAQUETE));
  await crearIndice({ datos, fs, base: async () => null }).actualizar();
  const mensaje = { idioma: 'es', ctx: { pj: { faccion: 'Horde', nivel: 11, ...pj }, lugar: { mapa: 1413, x: 1, y: 1 } } };
  await escribirTurno(datos, turnoDe(mensaje, { carpetaBase: join(datos, 'no-existe') }), { fs });
  const h = Object.fromEntries(crearCatalogo(crearFuentes({ datos, fs, cargar: () => null })).map((x) => [x.nombre, x.ejecutar]));
  const ids = JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8')).guias.map((g) => g.id);
  return { h, ids };
}

test('buscar_guias: solo las guías de la clase del personaje, y la de su raza primero', async () => {
  const { h, ids } = await preparar({ clase: 'mage', raza: 'Orc' });
  const r = await h.buscar_guias({ zona: 1413 });
  assert.deepEqual(r.guias.map((g) => g.guia), [ids[2], ids[0], ids[3]]);
  assert.deepEqual(r.guias[0].clases, ['MAGE']);
  assert.deepEqual(r.guias[0].razas, ['Orc']);
  assert.deepEqual(r.guias[1].clases, ['MAGE', 'PRIEST']);
  assert.equal(r.guias[1].razas, undefined);
  assert.equal(r.guias[1].formato, '4ever');
});

test('buscar_guias: otra raza no ve la variante de raza; con otra clase pedida (en español o inglés), las de esa clase', async () => {
  const { h, ids } = await preparar({ clase: 'MAGE', raza: 'Troll' });
  assert.deepEqual((await h.buscar_guias({ zona: 1413 })).guias.map((g) => g.guia), [ids[0], ids[3]]);
  assert.deepEqual((await h.buscar_guias({ zona: 1413, clase: 'Guerrero' })).guias.map((g) => g.guia), [ids[1], ids[3]]);
  assert.deepEqual((await h.buscar_guias({ zona: 1413, clase: 'warrior' })).guias.map((g) => g.guia), [ids[1], ids[3]]);
  // una clase que no se conoce no cuenta: vale la del personaje
  assert.equal((await h.buscar_guias({ zona: 1413, clase: 'bardo' })).guias.length, 2);
});

test('sin clase en el turno no se quita ninguna por clase', async () => {
  const { h } = await preparar({ raza: 'Troll' });
  assert.equal((await h.buscar_guias({ zona: 1413 })).guias.length, 3);
});

test('leer_guia: los pasos marcados para otra clase o raza no salen (los números no cambian) y se dice cuántos', async () => {
  const guerrero = await preparar({ clase: 'WARRIOR', raza: 'Orc' });
  const g = await guerrero.h.leer_guia({ guia: guerrero.ids[1] });
  assert.deepEqual(g.pasos.map((p) => p.n), [1, 2, 3]);
  assert.deepEqual(g.clases, ['WARRIOR']);
  assert.deepEqual(g.pasos[1].misiones, [{ q: 90003, accion: 'aceptar', nombre: 'Pruebas de guerrero' }]);
  assert.equal(g.deOtraClase, undefined);
  // un mago que lee la guía del guerrero: su paso de guerrero no sale
  const mago = await preparar({ clase: 'MAGE', raza: 'Troll' });
  const m = await mago.h.leer_guia({ guia: mago.ids[1] });
  assert.deepEqual(m.pasos.map((p) => p.n), [1, 3]);
  assert.equal(m.total, 3);
  assert.equal(m.deOtraClase, 1);
  // la variante de los orcos, leída por un trol: su paso es de otra raza
  const v = await mago.h.leer_guia({ guia: mago.ids[2] });
  assert.deepEqual(v.pasos, []);
  assert.equal(v.deOtraClase, 1);
  assert.deepEqual(v.razas, ['Orc']);
});

test('buscar_guias sin criterios: los capítulos sin leer salen con su parte', async () => {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const datos = mkdtempSync(join(process.env.SNF_DATOS, 'clases-'));
  const carpeta = join(datos, CARPETA_GUIAS, 'inventado_Horde1020');
  mkdirSync(carpeta, { recursive: true });
  const roto = structuredClone(PAQUETE);
  roto.segments['horde-10-20-chapter-1-bbb'].orders = { WARRIOR: 'no es una lista' };
  writeFileSync(join(carpeta, 'Data.lua'), registro('horde-10-20', roto));
  await crearIndice({ datos, fs, base: async () => null }).actualizar();
  const h = Object.fromEntries(crearCatalogo(crearFuentes({ datos, fs, cargar: () => null })).map((x) => [x.nombre, x.ejecutar]));
  const r = await h.buscar_guias({});
  assert.deepEqual(r.noLeidos, [{ archivo: 'inventado_Horde1020/Data.lua', parte: '10-12 Llanos Inventados (WARRIOR)', motivo: 'roto' }]);
});

// Ronda 2 (M3): los pasos de un mis-guias.lua de la biblioteca con faccion se miran por la facción del turno (un Skyborne
// de la Alianza no ve los de la Horda; sin raza conocida, tampoco), no por las razas de esa facción.
const MIS_GUIAS = `SnetForeverMisGuias = {
  {nombre = "Ruta inventada", pasos = {
    {texto = "Para todos"},
    {texto = "Solo la Horda", faccion = "Horda"},
    {texto = "Solo magos", clase = "Mago"},
  }},
}`;
async function conMisGuias(pj) {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const datos = mkdtempSync(join(process.env.SNF_DATOS, 'misguias-'));
  const carpeta = join(datos, CARPETA_GUIAS, 'Mis guías');
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'mis-guias.lua'), MIS_GUIAS);
  await crearIndice({ datos, fs, base: async () => null }).actualizar();
  const mensaje = { idioma: 'es', ctx: { pj: { nivel: 11, ...pj }, lugar: { mapa: 1413, x: 1, y: 1 } } };
  await escribirTurno(datos, turnoDe(mensaje, { carpetaBase: join(datos, 'no-existe') }), { fs });
  const h = Object.fromEntries(crearCatalogo(crearFuentes({ datos, fs, cargar: () => null })).map((x) => [x.nombre, x.ejecutar]));
  const [id] = JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8')).guias.map((g) => g.id);
  return h.leer_guia({ guia: id });
}

test('leer_guia: los pasos de Mis guías con facción se miran por la facción del turno', async () => {
  const skyborne = await conMisGuias({ faccion: 'Alliance', raza: 'Skyborne', clase: 'MAGE' });
  assert.deepEqual(skyborne.pasos.map((p) => p.n), [1, 3]);
  assert.equal(skyborne.deOtraClase, 1);
  const sinRaza = await conMisGuias({ faccion: 'Alliance' });
  assert.deepEqual(sinRaza.pasos.map((p) => p.n), [1, 3]);
  const guerrero = await conMisGuias({ faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR' });
  assert.deepEqual(guerrero.pasos.map((p) => p.n), [1, 2]);
});
