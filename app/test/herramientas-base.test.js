// Herramientas misiones_zona, mision y pnj sobre la base de misiones-app.lua + ruta-zona.lua (la de fiestas-evento.test.js).
// Nada se quita por el nivel del personaje y cada punto sale como marca de origen, nunca como coordenadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase } from '../src/base/base.mjs';
import { crearCatalogo } from '../src/herramientas/catalogo.mjs';
import { puntoDeMarca } from '../src/herramientas/marcas.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const carpeta = mkdtempSync(join(tmpdir(), 'snf-herr-base-'));
for (const n of ['misiones-app.lua', 'ruta-zona.lua']) copyFileSync(join(FIXTURES, n), join(carpeta, n));
writeFileSync(join(carpeta, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', 'ruta-zona.lua', ''].join('\n'));
const base = cargarBase(carpeta);

const turnoBase = () => ({
  version: 1, carpetaBase: null, idioma: 'es',
  pj: { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 1 },
  lugar: { mapa: 1413, x: 21, y: 21, zona: 'Los Baldíos', subzona: null, instancia: false },
  registro: [], vuelos: [], vuelosIds: null,
});
function herramientas(turno = turnoBase()) {
  const cat = crearCatalogo({ turno: () => turno, base: async () => base, lector: {} });
  return Object.fromEntries(cat.map((h) => [h.nombre, h.ejecutar]));
}
const qs = (r) => r.misiones.map((m) => m.q);
const PJ = turnoBase().pj;

test('misiones_zona: Los Baldíos trae las de nivel alto aunque el personaje sea de nivel 1, con su marca', async () => {
  const r = await herramientas().misiones_zona({ zona: 'Los Baldíos' });
  assert.deepEqual(r.zona, { mapa: 1413, nombre: 'Los Baldíos' });
  for (const q of [9101, 9102, 9106]) assert.ok(qs(r).includes(q), `falta ${q}`);
  assert.ok(!qs(r).includes(9104), 'la de la Alianza no sale');
  assert.equal(r.misiones.find((m) => m.q === 9105).mazmorra, 'The Deadmines');
  const m9106 = r.misiones.find((m) => m.q === 9106);
  assert.equal(m9106.nivel, 25);
  assert.equal(m9106.nivelMinimo, 20);
  const m9101 = r.misiones.find((m) => m.q === 9101);
  assert.equal(m9101.nombre, 'Cadena uno (es)');
  assert.equal(m9101.da.pnj, 'Jefe del puesto');
  assert.equal(m9101.da.marca, 'B:q9101:r');
  assert.ok(puntoDeMarca(m9101.da.marca, { base, pj: PJ, mapaJugador: 1413 }), 'la marca se resuelve');
  assert.equal(m9101.entrega.marca, 'B:q9101:e');
  assert.deepEqual(r.misiones.find((m) => m.q === 9102).previas, [9101]);
  assert.equal(r.total, r.misiones.length);
  assert.ok(!('siguiente' in r));
  assert.ok(!JSON.stringify(r).includes('"x"'), 'ninguna coordenada');
  const orden = r.misiones.map((m) => [m.nivel, m.q]);
  assert.deepEqual(orden, [...orden].sort((a, b) => a[0] - b[0] || a[1] - b[1]), 'por nivel y luego por q');
});

test('misiones_zona: la facción pedida cambia las que salen y la desconocida se ignora', async () => {
  const h = herramientas();
  const a = await h.misiones_zona({ zona: 1413, faccion: 'Alianza' });
  assert.ok(qs(a).includes(9104));
  assert.ok(!qs(a).includes(9101), '9101 la da un PNJ de la Horda');
  const x = await h.misiones_zona({ zona: 1413, faccion: 'Marte' });
  assert.ok(!qs(x).includes(9104));
});

test('misiones_zona: mazmorra por nombre, con o sin artículo, y por la de la instancia', async () => {
  for (const zona of ['The Deadmines', 'deadmines', 'Deadmines', 'THE DEADMINES']) {
    const r = await herramientas().misiones_zona({ zona });
    assert.ok(qs(r).includes(9117), zona);
    assert.equal(r.mazmorra, 'The Deadmines');
    assert.ok(qs(r).includes(9105), 'la de zoneOrSort de la mazmorra también');
  }
  const turno = turnoBase();
  turno.lugar = { mapa: 1436, x: 5, y: 5, zona: 'The Deadmines', subzona: null, instancia: true };
  for (const zona of [undefined, '', 'aquí', 'aqui']) {
    const r = await herramientas(turno).misiones_zona(zona === undefined ? {} : { zona });
    assert.ok(qs(r).includes(9117), `aquí en la mazmorra (${zona})`);
    assert.equal(r.mazmorra, 'The Deadmines');
  }
});

test('misiones_zona: sin zona vale el mapa del turno y una zona que no existe da error', async () => {
  const r = await herramientas().misiones_zona({});
  assert.equal(r.zona.mapa, 1413);
  assert.ok(qs(r).includes(9101));
  assert.deepEqual(await herramientas().misiones_zona({ zona: 'Narnia' }), { error: 'zona_desconocida' });
  const sin = turnoBase();
  sin.lugar = { mapa: null, x: null, y: null, zona: null, subzona: null, instancia: false };
  assert.deepEqual(await herramientas(sin).misiones_zona({}), { error: 'zona_desconocida' });
});

test('misiones_zona: las del registro salen marcadas y `desde` pagina', async () => {
  const turno = turnoBase();
  turno.registro = [9101];
  const r = await herramientas(turno).misiones_zona({ zona: 1413 });
  assert.equal(r.misiones.find((m) => m.q === 9101).registro, true);
  assert.ok(!('registro' in r.misiones.find((m) => m.q === 9102)));
  const vacio = await herramientas().misiones_zona({ zona: 1413, desde: 1000 });
  assert.deepEqual(qs(vacio), []);
  assert.equal(vacio.total, r.total);
});

test('mision: por número y por nombre da la misma ficha, con marcas y sin coordenadas', async () => {
  const h = herramientas();
  const a = await h.mision({ mision: 9101 });
  assert.deepEqual(await h.mision({ mision: 'Cadena uno' }), a);
  assert.deepEqual(await h.mision({ mision: 'cadena uno (es)' }), a);
  assert.equal(a.q, 9101);
  assert.deepEqual(a.nombre, { es: 'Cadena uno (es)', en: 'Cadena uno' });
  assert.equal(a.nivel, 3);
  assert.equal(a.nivelMinimo, 1);
  assert.equal(a.zona, 'Los Baldíos');
  assert.deepEqual(a.da, [{ id: 9201, pnj: 'Jefe del puesto', marca: 'B:n9201' }]);
  assert.deepEqual(a.entrega, [{ id: 9201, pnj: 'Jefe del puesto', marca: 'B:n9201' }]);
  assert.deepEqual(a.previas, []);
  assert.deepEqual(a.siguiente, { q: 9102, nombre: 'Cadena dos' });
  assert.deepEqual(a.puntos.map((p) => p.papel), ['recoger', 'objetivo', 'entregar']);
  for (const p of a.puntos) {
    assert.ok(puntoDeMarca(p.marca, { base, pj: PJ, mapaJugador: 1413 }), p.marca);
    assert.equal(p.zona, 'Los Baldíos');
  }
  assert.ok(!JSON.stringify(a).includes('"x"'), 'ninguna coordenada');
  const b = await h.mision({ mision: 9102 });
  assert.deepEqual(b.previas, [{ q: 9101, nombre: 'Cadena uno (es)' }]);
  assert.equal((await h.mision({ mision: 9105 })).mazmorra, 'The Deadmines');
  assert.equal((await h.mision({ mision: '9101' })).q, 9101);
});

test('mision: lo que no está da error', async () => {
  const h = herramientas();
  assert.deepEqual(await h.mision({ mision: 99999 }), { error: 'no_esta_en_la_base' });
  assert.deepEqual(await h.mision({ mision: 'Misión que no existe jamás' }), { error: 'no_esta_en_la_base' });
  assert.deepEqual(await h.mision({}), { error: 'no_esta_en_la_base' });
});

test('pnj: por número y por nombre, con su sitio como marca y sus misiones', async () => {
  const h = herramientas();
  const a = await h.pnj({ pnj: 9203 });
  assert.equal(a.id, 9203);
  assert.equal(a.nombre, 'Cazadora');
  assert.deepEqual(a.zonas, [{ mapa: 1413, zona: 'Los Baldíos', marca: 'B:n9203' }]);
  assert.ok(puntoDeMarca('B:n9203', { base, pj: PJ, mapaJugador: 1413 }));
  assert.ok(a.da.some((m) => m.q === 9103 && m.nombre === 'Suelta'));
  assert.ok(a.entrega.some((m) => m.q === 9103));
  assert.deepEqual(await h.pnj({ pnj: 'Cazadora' }), a);
  assert.deepEqual(await h.pnj({ pnj: 'cazadora' }), a);
  assert.ok(a.da.length <= 20 && a.entrega.length <= 20);
  assert.ok(!('vuelo' in a));
});

test('pnj: empieza por, varias candidatas, error y vuelo', async () => {
  const turno = turnoBase();
  turno.vuelosIds = [9203];
  const h = herramientas(turno);
  const e = await h.pnj({ pnj: 'Caza' });
  assert.equal(e.id, 9203);
  assert.equal(e.vuelo, true);
  assert.equal((await h.pnj({ pnj: 'Gornek' })).id, 10176, 'el exacto gana al que empieza por');
  const muchos = await h.pnj({ pnj: 'Gorn' });
  assert.deepEqual(muchos.candidatas.map((c) => c.id).sort((x, y) => x - y), [3143, 10176]);
  assert.ok(muchos.candidatas.length <= 10);
  assert.deepEqual(await h.pnj({ pnj: 'Ga' }), { error: 'no_esta_en_la_base' }, 'menos de 3 letras');
  assert.deepEqual(await h.pnj({ pnj: 424242 }), { error: 'no_esta_en_la_base' });
});

test('las tres herramientas están en el catálogo con su esquema', () => {
  const cat = crearCatalogo({ turno: () => turnoBase(), base: async () => base, lector: {} });
  for (const n of ['misiones_zona', 'mision', 'pnj']) {
    const h = cat.find((x) => x.nombre === n);
    assert.ok(h, n);
    assert.equal(h.esquema.type, 'object');
    assert.equal(h.esquema.additionalProperties, false);
    assert.equal(typeof h.ejecutar, 'function');
  }
});

test('sin base: error claro y sin rutas locales', async () => {
  const cat = crearCatalogo({ turno: () => turnoBase(), base: async () => { throw new Error('C:\\Users\\x\\datos'); }, lector: {} });
  const h = Object.fromEntries(cat.map((x) => [x.nombre, x.ejecutar]));
  for (const r of [await h.misiones_zona({ zona: 1 }), await h.mision({ mision: 1 }), await h.pnj({ pnj: 1 })]) {
    assert.deepEqual(r, { error: 'sin_base' });
  }
});
