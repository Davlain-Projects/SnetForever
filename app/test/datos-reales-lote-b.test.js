// Lote B, ronda 1 (Minor 3): la app con los datos reales (addons/SnetForever_Misiones) a través de cargarBase, que lee
// también los archivos de «## X-SNF-App». Lo que saca de los ítems (class, subClass, startQuest y sus fuentes) y las rutas
// de zona tienen que salir iguales que con los datos 2026.11.10.6, de antes del lote B (fixtures/huellas-datos-…json,
// medido con la misma cuenta). Las rutas van en inglés: el español de los objetos cambió a propósito en la ronda 1.
// Lote H: los datos 2026.11.11.1 (QuestieDB 1.0.14) cambian la base, y con ella 79 de las 376 rutas y la cuenta de los
// ítems; la huella se rehizo con la misma cuenta en huellas-datos-2026.11.11.1.json (los mismos 94 mapas y 4 personajes;
// por qué cambia cada ruta, en lote-h-report.md). La de la 2026.11.10.6 se queda en fixtures/, como referencia.
// Ronda 1: rehecha con los datos 2026.11.11.2 (lista negra de Questie y otras temporadas sin dador con punto): cambian 27
// rutas más (lote-h-report.md, «Ronda 1»). La de la 2026.11.11.1 también se queda.
// 11-nov: rehecha con los datos 2026.11.11.6 (fuera las misiones de otras temporadas sin prueba del juego): cambian 62
// rutas, todas porque sale alguna de 60000-89999 y el tope de 60 deja entrar a otras (la nota del fixture lo explica).
// 12-nov: rehecha (huellas-datos-2026.11.12.1.json) al dejar fuera las submisiones y las repetibles: cambian 52 rutas, y
// sin esos dos campos salen idénticas a las de la 2026.11.11.6.
// 13-nov: rehecha (huellas-datos-2026.11.13.1.json) con los datos 2026.11.13.1 (QuestieDB 1.1.0): cambian 90 rutas, por
// puntos nuevos o por misiones nuevas de la base (el porqué, en la nota del fixture). La 2026.11.12.1 se queda.
// 16-nov (R19): las rutas de esa misma huella, rehechas con los mismos datos: un objetivo de objeto sin sitio en la base
// va en su propio paso; cambian 59 rutas, todas por eso (la nota del fixture lo cuenta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase, entradas } from '../src/base/base.mjs';
import { construirRutaZona } from '../src/rutaZona.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const REALES = join(AQUI, '..', '..', 'addons', 'SnetForever_Misiones');
const ANTES = JSON.parse(readFileSync(join(AQUI, 'fixtures', 'huellas-datos-2026.11.13.1.json'), 'utf8'));
const opciones = { skip: !existsSync(join(REALES, 'nucleo.lua')) && 'faltan los datos reales', timeout: 300000 };

const PJS = [
  { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 10 },
  { faccion: 'Alliance', raza: 'Human', clase: 'MAGE', nivel: 22 },
  { faccion: 'Horde', raza: 'Troll', clase: 'SHAMAN', nivel: 35 },
  { faccion: 'Alliance', raza: 'NightElf', clase: 'DRUID', nivel: 48 },
];
const huella = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16);

let base;
const real = () => (base ??= cargarBase(REALES));

test('datos reales: cargarBase lee X-SNF-App y no avisa de nada', opciones, () => {
  const b = real();
  assert.deepEqual(b.avisos, []);
  assert.equal(b.item(25).class, 2);
  assert.equal(b.item(25).subClass, 7);
  assert.ok(b.objeto(32)?.name, 'el objeto 32 (solo en los archivos de la app) está');
});

test('datos reales: ítems con class, subClass, startQuest y fuentes, como en la huella (sin valor = 0)', opciones, () => {
  const items = { total: 0, conClase: 0, porClase: {}, startQuest: 0, npcDrops: 0, objectDrops: 0, vendors: 0, itemDrops: 0 };
  for (const [, it] of entradas(real().datos.item)) {
    items.total++;
    const c = it.class ?? 0;
    items.porClase[c] = (items.porClase[c] ?? 0) + 1;
    if (c !== 0) items.conClase++;
    if ((it.startQuest ?? 0) > 0) items.startQuest++;
    for (const k of ['npcDrops', 'objectDrops', 'vendors', 'itemDrops']) if (entradas(it[k]).length > 0) items[k]++;
  }
  assert.deepEqual(items, ANTES.items);
});

// Lote C (lote-b-rereview, Minor 2): 271 de las 376 huellas eran la misma, la de «no hay misiones en esa zona para tu
// nivel» ({error: 'sin_misiones'}). Se comparan aparte: las rutas de verdad (105) y las vacías, que tienen que seguir
// vacías. Y la comparación tiene que fallar si cambia una ruta de verdad.
const HUELLA_SIN_MISIONES = huella({ error: 'sin_misiones', texto: 'There are no quests in that zone for your level' });
const rutaDe = (b, ui, p) => construirRutaZona(b, { zona: Number(ui) }, { datos: { personaje: p, lugar: {} } }, 'en');

// [uiMap, índice del personaje] de las huellas de ANTES que no son la de «sin misiones» (o que sí lo son, con vacias).
function casos(vacias = false) {
  const salida = [];
  for (const [ui, antes] of Object.entries(ANTES.rutas)) {
    antes.forEach((h, k) => { if ((h === HUELLA_SIN_MISIONES) === vacias) salida.push([ui, k]); });
  }
  return salida;
}
// 15-nov: el aviso de «sin misiones» lleva ahora el nombre de la zona; una ruta vacía cuenta como la huella de siempre si
// sigue siendo {error: 'sin_misiones'} con su texto (frase entera).
const huellaDe = (r) => (r?.error === 'sin_misiones' && /^I haven't marked the route\b.*\.$/.test(r.texto) ? HUELLA_SIN_MISIONES : huella(r));
const distintasDe = (b, lista) => lista.filter(([ui, k]) => huellaDe(rutaDe(b, ui, PJS[k])) !== ANTES.rutas[ui][k]).map(([ui, k]) => `${ui}/${k}`);

test('datos reales: las rutas de zona (94 mapas, 4 personajes) salen iguales que en la huella (2026.11.13.1)', opciones, () => {
  const b = real();
  assert.equal(ANTES.version, '2026.11.13.1');
  assert.equal(Object.keys(ANTES.rutas).length, 94);
  const conRuta = casos(false);
  const vacias = casos(true);
  assert.equal(conRuta.length, 110, 'rutas de verdad (13-nov: entran las misiones nuevas de la QuestieDB 1.1.0)');
  assert.equal(vacias.length, 266, 'zonas sin misiones para ese personaje');
  // Ninguna ruta de verdad comparte huella con otra de otro mapa: cada una protege algo.
  assert.ok(new Set(conRuta.map(([ui, k]) => ANTES.rutas[ui][k])).size >= 94);
  assert.deepEqual(distintasDe(b, conRuta), []);
  assert.deepEqual(distintasDe(b, vacias), []);
});

test('datos reales: la comparación de rutas falla si cambia una ruta de verdad (sin la primera misión de Durotar)', opciones, () => {
  const b = real();
  const orco = PJS.findIndex((p) => p.raza === 'Orc');
  const ruta = rutaDe(b, 1411, PJS[orco]);
  const q = ruta.guia.pasos[0].elementos.find((e) => e.t === 'accept').q;
  const mision = b.mision;
  b.mision = function (id, ...resto) { return id === q ? undefined : mision.call(this, id, ...resto); };
  try {
    assert.deepEqual(distintasDe(b, [['1411', orco]]), [`1411/${orco}`]);
  } finally {
    b.mision = mision;
  }
  assert.deepEqual(distintasDe(b, [['1411', orco]]), [], 'y vuelve a cuadrar sin el cambio');
});
