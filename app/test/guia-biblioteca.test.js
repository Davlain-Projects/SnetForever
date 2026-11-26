// La guía de la biblioteca que se abre tal cual (guiaBiblioteca.mjs): la conversión que comparten abrir_guia de TATI y
// abrirGuia del chat del juego. Guías INVENTADAS con la forma de 4Ever Leveling (paquete de niveles con pasos de una
// clase y de una raza) y de Polestar (cabecera y pasos con ids de misión): nada de esto es de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearIndice, CARPETA_GUIAS, RUTA_INDICE } from '../src/biblioteca/indice.mjs';
import { crearLectorGuias } from '../src/herramientas/fuentes.mjs';
import { crearBase } from '../src/base/base.mjs';
import { expandirGuia, pedidoValido, MAX_TRAMOS, MAX_PASOS_LEIDOS } from '../src/guiaBiblioteca.mjs';
import { registro, paso, tarea, t } from './ayuda/cuatroever.mjs';

const base = crearBase({
  version: 't', esquema: 1,
  quest: { 90001: { name: 'Raíces de prueba' }, 90003: { name: 'El pozo inventado' }, 93002: { name: 'Carta de prueba' } },
  npc: {}, object: {}, item: {},
  es: { quest: {}, npc: {}, object: {}, item: {} },
  zonas: { area: {}, nombre: { 1413: { en: 'The Barrens', es: 'Los Baldíos' }, 1411: { en: 'Durotar', es: 'Durotar' } } },
  mazmorra: {}, porFaccion: {},
});

// Un paquete de niveles inventado: un capítulo para dos clases, con un paso solo de guerreros y otro solo de trols.
export const CUATRO = {
  classSegments: { MAGE: ['horde-30-40-chapter-1-aaa'], WARRIOR: ['horde-30-40-chapter-1-aaa'] },
  id: 'horde-30-40',
  locations: [
    { id: 'loc-1', mapID: 1413, title: t('El cruce inventado'), x: 0.5, y: 0.25 },
    { id: 'loc-2', mapID: 1411, title: t('Otro sitio'), x: 0.1, y: 0.9 },
    { coordinateStatus: 'unmapped', id: 'loc-3', title: t('Sin mapa'), waypoint: false },
  ],
  quests: [
    { id: 90001, minLevel: 30, title: t('Raíces de prueba') },
    { id: 90002, minLevel: 30, title: t('Pruebas del guerrero') },
    { id: 90003, minLevel: 31, title: t('El pozo inventado') },
  ],
  segments: {
    'horde-30-40-chapter-1-aaa': {
      chapters: [{ id: 'horde-30-40-chapter-1', level: 30, title: t('30-32 Llanos de prueba'), untilLevel: 32 }],
      id: 'horde-30-40-chapter-1-aaa',
      orders: { MAGE: ['s1', 's2', 's3', 's4', 's5'], WARRIOR: ['s1', 's2', 's3', 's4', 's5'] },
    },
  },
  steps: {
    s1: paso('s1', 'horde-30-40-chapter-1', [tarea('accept', 90001)], 'loc-1'),
    s2: paso('s2', 'horde-30-40-chapter-1', [tarea('accept', 90002)], 'loc-2', { conditions: { classes: ['WARRIOR'] } }),
    s3: paso('s3', 'horde-30-40-chapter-1', [tarea('objective', 90001)], 'loc-1', { conditions: { races: ['Troll'] } }),
    s4: paso('s4', 'horde-30-40-chapter-1', [tarea('turn_in', 90001)], 'loc-1', { detail: t('Entrega al jefe en 41.5, 22.3', 'Turn in to the chief') }),
    s5: paso('s5', 'horde-30-40-chapter-1', [tarea('accept', 90003)], 'loc-3'),
  },
};

// Una guía de Polestar inventada: la 93001 no está en la base; la 93002, sí.
export const POLESTAR = `guide forever/horde/09-inventada
title Polestar de prueba
faction Horde
levels 12-14

step El cruce
  tip Habla con el guarda.
  accept 93001
  goto 40.5,60.25 map 1411

step La carta
  turnin 93002

step Solo druidas
  only Druid
  note "Una nota."
  goto 52.1,30.4 map 1411
`;

async function biblioteca(archivos) {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const datos = mkdtempSync(join(process.env.SNF_DATOS, 'abrir-'));
  for (const [ruta, texto] of Object.entries(archivos)) {
    const destino = join(datos, CARPETA_GUIAS, ...ruta.split('/'));
    mkdirSync(join(destino, '..'), { recursive: true });
    writeFileSync(destino, texto);
  }
  await crearIndice({ datos, fs, base: async () => base }).actualizar();
  const indice = JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8'));
  return { lector: crearLectorGuias({ datos, fs, base: () => base }), ids: indice.guias.map((g) => g.id) };
}

const MAGO = { faccion: 'Horde', raza: 'Orc', clase: 'MAGE', nivel: 30 };
const unaGuia = () => 1;

test('pedidoValido: el id del índice y números de paso; nada más', () => {
  assert.deepEqual(pedidoValido({ guia: '0123abcd' }), { guia: '0123abcd' });
  assert.deepEqual(pedidoValido({ guia: '0123abcd', desde: 3, hasta: 9 }), { guia: '0123abcd', desde: 3, hasta: 9 });
  for (const malo of [null, 'x', { guia: 'ABCDEF01' }, { guia: '0123abc' }, { guia: '0123abcd', desde: 0 }, { guia: '0123abcd', hasta: 1.5 },
    { guia: '0123abcd', desde: '3' }, { guia: '0123abcd', pasos: [] }, { guia: '0123abcd', nivel: 30 }]) {
    assert.equal(pedidoValido(malo), null, JSON.stringify(malo));
  }
});

test('4Ever inventada: los pasos de su clase y su raza, en el orden de la guía, con su texto, sus misiones y su G:', async () => {
  const { lector, ids } = await biblioteca({ 'inventado/Data.lua': registro('horde-30-40', CUATRO) });
  const id = ids[0];
  const r = await expandirGuia({ guia: id }, { lector, base, pj: MAGO, idioma: 'es', cuantasGuias: unaGuia });
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.guiaNueva.tramos.length, 1);
  assert.deepEqual(r.guiaNueva.tramos[0].pasos, [
    { texto: 'Haz s1', misiones: [{ q: 90001, accion: 'aceptar' }], punto: `G:${id}:1` },
    { texto: 'Entrega al jefe en', misiones: [{ q: 90001, accion: 'entregar' }], punto: `G:${id}:4` },
    { texto: 'Haz s5', misiones: [{ q: 90003, accion: 'aceptar' }] },
  ]);
  assert.deepEqual(r.cuenta, { total: 5, hasta: 5, deOtraClase: 2, sinMision: 0 });
  assert.equal(r.continuar, null);
  // un guerrero trol los ve todos; la 90002 no está en la base: su paso va con su punto, sin la misión
  const otro = await expandirGuia({ guia: id }, { lector, base, pj: { ...MAGO, clase: 'WARRIOR', raza: 'Troll' }, cuantasGuias: unaGuia });
  assert.equal(otro.guiaNueva.tramos[0].pasos.length, 5);
  assert.deepEqual(otro.guiaNueva.tramos[0].pasos[1], { texto: 'Haz s2', punto: `G:${id}:2` });
  assert.deepEqual(otro.cuenta, { total: 5, hasta: 5, deOtraClase: 0, sinMision: 1 });
});

test('Polestar inventada: la misión que no está en la base se quita, el paso se queda con su texto y su punto', async () => {
  const { lector, ids } = await biblioteca({ 'Polestar/09-inventada.txt': POLESTAR });
  const r = await expandirGuia({ guia: ids[0] }, { lector, base, pj: MAGO, cuantasGuias: unaGuia });
  assert.equal(r.guiaNueva.titulo, 'Polestar de prueba');
  assert.deepEqual(r.guiaNueva.tramos[0].pasos, [
    { texto: 'El cruce. Habla con el guarda.', punto: `G:${ids[0]}:1` },
    { texto: 'La carta', misiones: [{ q: 93002, accion: 'entregar' }] },
  ]);
  assert.deepEqual(r.cuenta, { total: 3, hasta: 3, deOtraClase: 1, sinMision: 1 });
});

test('desde y hasta: el tramo pedido, con la numeración de leer_guia', async () => {
  const { lector, ids } = await biblioteca({ 'inventado/Data.lua': registro('horde-30-40', CUATRO) });
  const r = await expandirGuia({ guia: ids[0], desde: 2, hasta: 4 }, { lector, base, pj: MAGO, cuantasGuias: unaGuia });
  assert.deepEqual(r.guiaNueva.tramos[0].pasos.map((p) => p.punto), [`G:${ids[0]}:4`]);
  assert.deepEqual(r.cuenta, { total: 5, hasta: 4, deOtraClase: 2, sinMision: 0 });
  // un hasta antes del desde no cuenta (como en leer_guia)
  const s = await expandirGuia({ guia: ids[0], desde: 4, hasta: 1 }, { lector, base, pj: MAGO, cuantasGuias: unaGuia });
  assert.equal(s.guiaNueva.tramos[0].pasos.length, 2);
  // desde pasado el final: nada que abrir
  const nada = await expandirGuia({ guia: ids[0], desde: 9 }, { lector, base, pj: MAGO, cuantasGuias: unaGuia });
  assert.equal(nada.guiaNueva, null);
  // solo pasos de otra clase: nada que abrir, y los cuenta
  const otra = await expandirGuia({ guia: ids[0], desde: 2, hasta: 3 }, { lector, base, pj: MAGO, cuantasGuias: unaGuia });
  assert.equal(otra.guiaNueva, null);
  assert.equal(otra.cuenta.deOtraClase, 2);
});

test('una guía que no cabe en 8 guías del addon: 8 tramos y `siguiente` dice desde dónde seguir', async () => {
  // 30 pasos (los pares, de guerreros); con dos pasos por guía del addon caben 16 pasos del mago en 8 tramos.
  const pasos = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`m${i + 1}`,
    paso(`m${i + 1}`, 'horde-30-40-chapter-1', [], 'loc-1', i % 2 === 1 ? { conditions: { classes: ['WARRIOR'] } } : {})]));
  const larga = { ...CUATRO, steps: pasos, segments: { 'horde-30-40-chapter-1-aaa': { ...CUATRO.segments['horde-30-40-chapter-1-aaa'], orders: { MAGE: Object.keys(pasos), WARRIOR: Object.keys(pasos) } } } };
  const { lector, ids } = await biblioteca({ 'inventado/Data.lua': registro('horde-30-40', larga) });
  // dos pasos por guía: los 15 del mago (1, 3, … 29) caben en 8 tramos (el último, de uno) y va todo
  const dosPorGuia = (v) => Math.ceil(v.tramos[0].pasos.length / 2);
  const r = await expandirGuia({ guia: ids[0] }, { lector, base, pj: MAGO, cuantasGuias: dosPorGuia });
  assert.equal(r.guiaNueva.tramos.length, MAX_TRAMOS);
  assert.deepEqual(r.guiaNueva.tramos.map((x) => x.pasos.length), [2, 2, 2, 2, 2, 2, 2, 1]);
  assert.ok(r.guiaNueva.tramos.every((x) => x.titulo === r.guiaNueva.titulo));
  assert.deepEqual(r.cuenta, { total: 30, hasta: 30, deOtraClase: 15, sinMision: 0 });
  assert.equal(r.continuar, null);
  // con uno por guía: 8 pasos del mago (1…15) y se sigue desde el 17 (el 16 es de guerreros: cuenta como fuera)
  const uno = await expandirGuia({ guia: ids[0] }, { lector, base, pj: MAGO, cuantasGuias: (v) => v.tramos[0].pasos.length });
  assert.equal(uno.guiaNueva.tramos.length, 8);
  assert.deepEqual(uno.cuenta, { total: 30, hasta: 16, siguiente: 17, deOtraClase: 8, sinMision: 0 });
  assert.deepEqual(uno.continuar, { guia: ids[0], desde: 17 });
  // y con un hasta pedido, el que sigue lo conserva
  const conHasta = await expandirGuia({ guia: ids[0], desde: 3, hasta: 29 }, { lector, base, pj: MAGO, cuantasGuias: (v) => v.tramos[0].pasos.length });
  assert.deepEqual(conHasta.continuar, { guia: ids[0], desde: 19, hasta: 29 });
});

test('guia desconocida: guia_desconocida', async () => {
  const { lector } = await biblioteca({ 'Polestar/09-inventada.txt': POLESTAR });
  for (const pedido of [{ guia: 'ffffffff' }, { guia: 'nada' }, {}, null]) {
    assert.deepEqual(await expandirGuia(pedido, { lector, base, pj: MAGO, cuantasGuias: unaGuia }), { error: 'guia_desconocida' });
  }
});

// ---------- ronda 2 ----------

test('M3: si medir falla, el trozo no cabe (un paso por tramo) y nunca salen más de 8 guías del addon', async () => {
  const { lector, ids } = await biblioteca({ 'inventado/Data.lua': registro('horde-30-40', CUATRO) });
  const falla = (v) => { if (v.tramos[0].pasos.length > 1) throw new Error('no se pudo medir'); return 1; };
  const r = await expandirGuia({ guia: ids[0] }, { lector, base, pj: { ...MAGO, clase: 'WARRIOR', raza: 'Troll' }, cuantasGuias: falla });
  assert.deepEqual(r.guiaNueva.tramos.map((t) => t.pasos.length), [1, 1, 1, 1, 1]);
  // Cada trozo da una guía, pero juntos dan dos más (las previas de un tramo pasan a otro, p. ej.): se quitan tramos del
  // final hasta que el total cabe en 8, y se sigue desde el primer paso que no fue.
  const pasos = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`m${i + 1}`, paso(`m${i + 1}`, 'horde-30-40-chapter-1', [], 'loc-1')]));
  const larga = { ...CUATRO, steps: pasos, segments: { 'horde-30-40-chapter-1-aaa': { ...CUATRO.segments['horde-30-40-chapter-1-aaa'], orders: { MAGE: Object.keys(pasos), WARRIOR: Object.keys(pasos) } } } };
  const otra = await biblioteca({ 'inventado/Data.lua': registro('horde-30-40', larga) });
  const juntos = (v) => (v.tramos.length === 1 ? v.tramos[0].pasos.length : v.tramos.length + 2);
  const c = await expandirGuia({ guia: otra.ids[0] }, { lector: otra.lector, base, pj: MAGO, cuantasGuias: juntos });
  assert.equal(c.guiaNueva.tramos.length, 6);
  assert.deepEqual(c.cuenta, { total: 12, hasta: 6, siguiente: 7, deOtraClase: 0, sinMision: 0 });
});

test('M5: si todo lo leído es de otra clase, se sigue leyendo hasta encontrar sus pasos (o el final)', async () => {
  const lineas = ['guide forever/horde/10-rogue', 'title Para pícaros', 'faction Horde', ''];
  for (let i = 1; i <= MAX_PASOS_LEIDOS + 50; i++) lineas.push(`step Solo pícaros ${i}`, '  only Rogue', '  goto 10.5,20.5 map 1411', '');
  for (let i = 1; i <= 3; i++) lineas.push(`step Ve al sitio ${i}`, '  goto 30.5,40.5 map 1411', '');
  const { lector, ids } = await biblioteca({ 'Polestar/10-rogue.txt': lineas.join(String.fromCharCode(10)) });
  const r = await expandirGuia({ guia: ids[0] }, { lector, base, pj: MAGO, cuantasGuias: unaGuia });
  assert.ok(r.guiaNueva, 'no se queda en sin_pasos');
  assert.equal(r.guiaNueva.tramos[0].pasos.length, 3);
  assert.deepEqual(r.cuenta, { total: MAX_PASOS_LEIDOS + 53, hasta: MAX_PASOS_LEIDOS + 53, deOtraClase: MAX_PASOS_LEIDOS + 50, sinMision: 0 });
});

test('I3: las misiones de los pasos anteriores a desde cuentan como hechas o en curso (hechas), también para medir', async () => {
  const { lector, ids } = await biblioteca({ 'inventado/Data.lua': registro('horde-30-40', CUATRO) });
  const vistas = [];
  const mide = (v, extra) => { vistas.push(extra?.hechas); return 1; };
  const r = await expandirGuia({ guia: ids[0], desde: 4 }, { lector, base, pj: MAGO, cuantasGuias: mide });
  assert.deepEqual([...r.hechas].sort(), [90001, 90002]);
  assert.ok(vistas.length > 0 && vistas.every((h) => h === r.hechas), 'cuantasGuias las recibe');
  assert.deepEqual((await expandirGuia({ guia: ids[0] }, { lector, base, pj: MAGO, cuantasGuias: mide })).hechas, []);
});

test('M4: los cortes de los tramos se buscan desde el largo del anterior: muchas menos medidas que una búsqueda entera', async () => {
  const pasos = Object.fromEntries(Array.from({ length: 330 }, (_, i) => [`m${i + 1}`, paso(`m${i + 1}`, 'horde-30-40-chapter-1', [], 'loc-1')]));
  const larga = { ...CUATRO, steps: pasos, segments: { 'horde-30-40-chapter-1-aaa': { ...CUATRO.segments['horde-30-40-chapter-1-aaa'], orders: { MAGE: Object.keys(pasos), WARRIOR: Object.keys(pasos) } } } };
  const { lector, ids } = await biblioteca({ 'inventado/Data.lua': registro('horde-30-40', larga) });
  let medidas = 0;
  const de37 = (v) => { medidas++; return Math.ceil(v.tramos.reduce((s, t) => s + t.pasos.length, 0) / 37); };
  const r = await expandirGuia({ guia: ids[0] }, { lector, base, pj: MAGO, cuantasGuias: de37 });
  assert.deepEqual(r.guiaNueva.tramos.map((t) => t.pasos.length), [37, 37, 37, 37, 37, 37, 37, 37]);
  assert.equal(r.cuenta.siguiente, 297);
  assert.ok(medidas <= 35, `${medidas} medidas`);
  if (process.env.SNF_VER_MEDIDAS) console.log(`medidas: ${medidas}`);
});
