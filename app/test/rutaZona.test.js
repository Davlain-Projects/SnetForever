// Ruta de una zona entera (tarea 16b): la app la construye de forma determinista desde la base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase, crearBase, entradas as entradasDe } from '../src/base/base.mjs';
import { puntosDeMision, fuenteDeItem } from '../src/base/puntos.mjs';
import { pasosDeMision, ensamblarGuia, contarObjetivos, quienDe, lista, claveGoto, objetivosSinSitio } from '../src/base/pasos.mjs';
import { ejecutarDatos } from '../src/base/leer-lua.mjs';
import { aLuaSeguro } from '../src/buzon.mjs';
import {
  resolverZona, misionesDeZona, ordenarRuta, guiaDeRuta, construirRutaZona, dependencias, resolverMisiones, MAX_MISIONES, MAX_PASOS, MAX_BYTES_GUIA,
} from '../src/rutaZona.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(AQUI, 'fixtures');
const REALES = join(AQUI, '..', '..', 'addons', 'SnetForever_Misiones');

function baseDeArchivos(nombres) {
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-rutazona-'));
  for (const n of nombres) copyFileSync(join(FIXTURES, n), join(carpeta, n));
  writeFileSync(join(carpeta, 'app.toc'), ['## Interface: 16001', '', ...nombres, ''].join('\n'));
  return cargarBase(carpeta);
}
const base = baseDeArchivos(['misiones-app.lua', 'ruta-zona.lua']);

const ORCO = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 3 };
const qsDe = (lista) => lista.map((m) => m.q);
const elementosDe = (guia) => guia.pasos.flatMap((p) => p.elementos);
// Índice del primer paso que tiene un elemento de tipo `t` para la misión q.
const pasoDe = (guia, t, q) => guia.pasos.findIndex((p) => p.elementos.some((e) => e.t === t && e.q === q));
// Posición del primer elemento de tipo `t` de la misión q en la guía entera (para ordenar dentro de un mismo paso).
const posDe = (guia, t, q) => elementosDe(guia).findIndex((e) => e.t === t && e.q === q);

function construir(pj = ORCO, opciones = {}, posicion = null, uiMap = 1413) {
  const misiones = misionesDeZona(base, uiMap, pj, opciones);
  const ordenadas = ordenarRuta(base, misiones, pj, posicion, uiMap);
  const guia = guiaDeRuta(base, uiMap, ordenadas, pj, 'es', { registro: opciones.registro });
  return { misiones, ordenadas, guia };
}

// ------------------------------------------------------------------------------------------------------------------
// resolverZona
// ------------------------------------------------------------------------------------------------------------------

test('resolverZona: nombre en es, en en, sin tildes ni mayúsculas, por uiMapID y una zona que no existe', () => {
  const baldios = { uiMap: 1413, nombre: { es: 'Los Baldíos', en: 'The Barrens' } };
  assert.deepEqual(resolverZona(base, 'Los Baldíos', 'es'), baldios);
  assert.deepEqual(resolverZona(base, 'The Barrens', 'en'), baldios);
  assert.deepEqual(resolverZona(base, 'los baldios', 'es'), baldios);
  assert.deepEqual(resolverZona(base, 'LOS BALDÍOS', 'es'), baldios);
  assert.deepEqual(resolverZona(base, 1413, 'es'), baldios);
  assert.deepEqual(resolverZona(base, 1412, 'es'), { uiMap: 1412, nombre: { en: 'Mulgore' } });
  assert.equal(resolverZona(base, 'Atlántida', 'es'), null);
  assert.equal(resolverZona(base, 99999, 'es'), null);
  assert.equal(resolverZona(base, '', 'es'), null);
});

test('resolverZona: «empieza por» después del igual exacto (también sin el artículo) y un uiMap con puntos sin nombre', () => {
  assert.equal(resolverZona(base, 'Duro', 'es').uiMap, 1411);
  assert.equal(resolverZona(base, 'baldios', 'es').uiMap, 1413, 'sin «Los»');
  assert.equal(resolverZona(base, 'barrens', 'en').uiMap, 1413, 'sin «The»');
  assert.equal(resolverZona(base, 'Du', 'es'), null, 'con menos de 3 letras no vale «empieza por»');
  assert.deepEqual(resolverZona(base, 1450, 'es'), { uiMap: 1450, nombre: { en: '#1450' } }, 'tiene puntos en la base');
  assert.equal(resolverZona(base, '1413', 'es').uiMap, 1413, 'un número escrito como texto');
});

test('resolverZona: después de «empieza por», «contiene palabra»', () => {
  assert.equal(resolverZona(base, 'Barrens', 'en').uiMap, 1413);
  assert.equal(resolverZona(base, 'baldíos', 'es').uiMap, 1413);
  assert.equal(resolverZona(base, 'arrens', 'en'), null, 'una palabra entera, no un trozo');
});

// ------------------------------------------------------------------------------------------------------------------
// misionesDeZona
// ------------------------------------------------------------------------------------------------------------------

test('misionesDeZona: entran las de la zona que valen para el personaje y su nivel', () => {
  const misiones = misionesDeZona(base, 1413, ORCO, {});
  assert.deepEqual(qsDe(misiones).sort((a, b) => a - b), [844, 9101, 9102, 9103, 9108, 9109, 9110, 9111, 9116, 9120, 9121, 9122, 9124]);
  assert.equal(misiones.recortadas, 0);
  assert.equal(misiones.objetoSinSitio, 1, '9123 empieza con un ítem sin fuente');
});

test('misionesDeZona: ninguna de otra facción, ni de nivel alto, de mazmorra, PvP, fiesta, basura o profesión que no tiene', () => {
  const qs = qsDe(misionesDeZona(base, 1413, ORCO, {}));
  for (const q of [9104, 9113, 9114]) assert.ok(!qs.includes(q), `otra facción: ${q}`);
  for (const q of [9106, 9105, 9117, 9112, 9115, 9118, 9119, 9107, 9123, 9125]) assert.ok(!qs.includes(q), `fuera: ${q}`);
  const druida = qsDe(misionesDeZona(base, 1413, { ...ORCO, clase: 'DRUID' }, {}));
  assert.ok(!druida.includes(9111), 'la de guerrero no es de druida');
  const alianza = qsDe(misionesDeZona(base, 1413, { faccion: 'Alliance', raza: 'Human', clase: 'WARRIOR', nivel: 3 }, {}));
  assert.ok(alianza.includes(9104) && alianza.includes(9113), 'las de la Alianza, para la Alianza');
  for (const q of [9101, 9102, 9108]) assert.ok(!alianza.includes(q), `de la Horda (PNJ «H»): ${q}`);
});

test('misionesDeZona: con mazmorras entran las de mazmorra (no las de PvP) y con la profesión, la de herborista', () => {
  const qs = qsDe(misionesDeZona(base, 1413, ORCO, { mazmorras: true }));
  assert.ok(qs.includes(9105) && qs.includes(9117));
  assert.ok(!qs.includes(9112) && !qs.includes(9125));
  assert.ok(qsDe(misionesDeZona(base, 1413, ORCO, { profesiones: [{ id: 182, rango: 5 }] })).includes(9120));
});

test('misionesDeZona: profesiones solo se filtran si se conocen', () => {
  assert.ok(qsDe(misionesDeZona(base, 1413, ORCO, {})).includes(9120), 'sin datos.profesiones no se filtra');
  assert.ok(!qsDe(misionesDeZona(base, 1413, ORCO, { profesiones: [] })).includes(9120), 'sin herboristería');
  assert.ok(!qsDe(misionesDeZona(base, 1413, ORCO, { profesiones: [{ id: 182, rango: 0 }] })).includes(9120), 'rango 0 < 1');
});

test('misionesDeZona: excluyentes en un solo sentido (sale la migaja 854, nunca 844)', () => {
  const qs = qsDe(misionesDeZona(base, 1413, ORCO, {}));
  assert.ok(qs.includes(844));
  assert.ok(!qs.includes(854));
  assert.ok(qsDe(misionesDeZona(base, 1413, ORCO, { registro: [854] })).includes(854), 'la migaja del registro sí');
});

test('misionesDeZona: manda el juego, una del registro entra aunque la máscara diga otra raza', () => {
  const misiones = misionesDeZona(base, 1413, ORCO, { registro: [{ q: 9107 }] });
  const m = misiones.find((x) => x.q === 9107);
  assert.ok(m, 'la de tauren entra para el orco que la tiene en el registro');
  assert.equal(m.registro, true);
  assert.ok(qsDe(misionesDeZona(base, 1413, ORCO, { registro: [9107] })).includes(9107), 'también con ids sueltos');
  assert.ok(!qsDe(misionesDeZona(base, 1413, ORCO, { registro: [{ q: 4641 }] })).includes(4641), 'una del registro de otra zona no entra');
});

// ------------------------------------------------------------------------------------------------------------------
// ordenarRuta y guiaDeRuta
// ------------------------------------------------------------------------------------------------------------------

test('ordenarRuta: previas antes que continuaciones y entregas antes de recoger lo que piden', () => {
  const { ordenadas, guia } = construir();
  assert.ok(ordenadas.indexOf(9101) < ordenadas.indexOf(9102));
  assert.ok(ordenadas.indexOf(9103) < ordenadas.indexOf(9110));
  assert.ok(ordenadas.indexOf(9109) < ordenadas.indexOf(9110));
  assert.ok(posDe(guia, 'turnin', 9101) < posDe(guia, 'accept', 9102));
  assert.ok(posDe(guia, 'turnin', 9103) < posDe(guia, 'accept', 9110));
  assert.ok(posDe(guia, 'turnin', 9109) < posDe(guia, 'accept', 9110));
  for (const q of ordenadas) assert.ok(posDe(guia, 'accept', q) < posDe(guia, 'turnin', q), `recoger antes de entregar ${q}`);
});

test('ordenarRuta: vecino más próximo desde la posición del jugador; sin posición, la de menor nivel primero', () => {
  assert.equal(construir(ORCO, {}, { mapa: 1413, x: 49, y: 49 }).ordenadas[0], 844, 'el jefe del puesto (50,50): 844 y 9101, por id');
  assert.equal(construir(ORCO, {}, { mapa: 1413, x: 21, y: 21 }).ordenadas[0], 9103);
  assert.equal(construir(ORCO, {}, null).ordenadas[0], 9103, 'nivel 2, con punto en el mapa');
  // 9116 se recoge en Durotar: se va allí cuando no queda nada a nivel 3 en Los Baldíos, y solo una vez.
  const { ordenadas, guia } = construir(ORCO, {}, { mapa: 1413, x: 21, y: 21 });
  assert.deepEqual(ordenadas.slice(-2), [9116, 9124]);
  const mapas = guia.pasos.flatMap((p) => p.elementos.filter((e) => e.t === 'goto').map((e) => e.mapa));
  assert.equal(mapas.filter((m, i) => i > 0 && m !== mapas[i - 1]).length, 2, 'ir a Durotar y volver');
});

test('ordenarRuta: la siguiente acción es la más cercana disponible (recoger, objetivo o entregar)', () => {
  const { guia } = construir(ORCO, {}, { mapa: 1413, x: 21, y: 21 });
  // Junto a la cazadora (20,20): 9103, 9120 y 9121 (las dos últimas se entregan allí mismo; entregar va antes que recoger), y la nota de 9122 que suelta la hiena
  // (25,25), a menos del 8 %.
  assert.deepEqual(guia.pasos[0].elementos, [
    { t: 'goto', mapa: 1413, x: 20, y: 20, modo: 'flecha' }, { t: 'accept', q: 9103 }, { t: 'accept', q: 9120 },
    { t: 'turnin', q: 9120 }, { t: 'accept', q: 9121 }, { t: 'turnin', q: 9121 },
    { t: 'goto', mapa: 1413, x: 25, y: 25, modo: 'flecha' }, { t: 'accept', q: 9122 },
  ]);
  // Después, el objetivo de 9103 en la hiena, en un paso de objetivo.
  assert.deepEqual(guia.pasos[1].elementos, [{ t: 'goto', mapa: 1413, x: 25, y: 25, modo: 'flecha', objetivo: 1 }, { t: 'complete', q: 9103, objetivo: 1 }]);
});

test('ordenarRuta: las de nivel requerido mayor van al final, con la etiqueta «A partir del nivel N»', () => {
  const { guia } = construir(ORCO, {}, { mapa: 1413, x: 21, y: 21 });
  const i = pasoDe(guia, 'accept', 9124);
  for (const e of elementosDe({ pasos: guia.pasos.slice(0, i) })) assert.notEqual(e.q, 9124);
  for (const q of [9101, 9102, 9103, 9110, 9116]) assert.ok(pasoDe(guia, 'turnin', q) < i, `${q} antes`);
  assert.deepEqual(guia.pasos[i].etiquetas, { level: 5, texto: { es: 'A partir del nivel 5', en: 'From level 5' } });
  assert.equal(guia.pasos.filter((p) => p.etiquetas.level !== undefined).length, 1);
  // Con nivel 5 ya no hay bloque final.
  const alto = construir({ ...ORCO, nivel: 5 }, {}, { mapa: 1413, x: 21, y: 21 }).guia;
  assert.ok(alto.pasos.every((p) => p.etiquetas.level === undefined));
});

test('ordenarRuta: una misión que empieza con un ítem se recoge al pasar por su fuente; nunca un accept sin punto de ítem', () => {
  const { guia } = construir();
  const paso = guia.pasos[pasoDe(guia, 'accept', 9122)];
  assert.ok(paso.elementos.some((e) => e.t === 'goto' && e.x === 25 && e.y === 25), 'la hiena que suelta la nota');
  assert.ok(!elementosDe(guia).some((e) => e.q === 9123));
});

test('guiaDeRuta: el orden es determinista', () => {
  const a = construir(ORCO, {}, { mapa: 1413, x: 30, y: 30 });
  const b = construir(ORCO, {}, { mapa: 1413, x: 30, y: 30 });
  assert.deepEqual(a.ordenadas, b.ordenadas);
  assert.deepEqual(a.ordenadas.plan, b.ordenadas.plan);
  assert.deepEqual(a.guia, b.guia);
});

test('guiaDeRuta: forma de la guía lateral de la IA (F4-21)', () => {
  const { guia } = construir();
  assert.equal(guia.clave, 'IA\\Ruta de Los Baldíos (Horda)');
  assert.equal(guia.tipo, 'ia');
  assert.equal(guia.sinVerificar, true);
  assert.equal(guia.grupo, 'IA');
  assert.equal(guia.nombre, 'Ruta de Los Baldíos (Horda)');
  assert.deepEqual(guia.titulo, { es: 'Ruta de Los Baldíos (Horda)', en: 'The Barrens route (Horde)' });
  assert.equal(guia.faccion, 'Horde');
  assert.deepEqual(guia.niveles, { min: 2, max: 6 });
  assert.deepEqual(guia.resumen, { misiones: 13, pasos: guia.pasos.length, elites: 1, grupo: 1 });
  guia.pasos.forEach((p, i) => {
    assert.equal(p.n, i + 1);
    assert.match(p.id, /^[0-9a-f]{8}(-\d+)?$/);
    assert.equal(p.linea, 0);
    assert.ok(p.elementos.length >= 1 && p.elementos.length <= 30);
  });
  assert.equal(new Set(guia.pasos.map((p) => p.id)).size, guia.pasos.length, 'ids sin repetir');
  const en = guiaDeRuta(base, 1413, construir().ordenadas, ORCO, 'en', {});
  assert.equal(en.clave, 'IA\\Ruta de The Barrens (Horde)');
  // Sin facción conocida, la clave no lleva «(?)».
  const sin = guiaDeRuta(base, 1413, [9103], { ...ORCO, faccion: undefined }, 'es', {});
  assert.equal(sin.clave, 'IA\\Ruta de Los Baldíos');
  // niveles.min nunca baja de 1.
  assert.ok(guiaDeRuta(base, 1413, [9103], ORCO, 'es', {}).niveles.min >= 1);
});

test('guiaDeRuta: elementos de la fase 3 (accept, turnin, complete con objetivo, goto con flecha) e isQuestTurnedIn externo', () => {
  const { guia } = construir();
  const elementos = elementosDe(guia);
  const tipos = new Set(elementos.map((e) => e.t));
  for (const t of tipos) assert.ok(['accept', 'turnin', 'complete', 'goto', 'isQuestTurnedIn'].includes(t), t);
  for (const e of elementos.filter((x) => x.t === 'goto')) assert.equal(e.modo, 'flecha');
  for (const e of elementos.filter((x) => x.t === 'complete')) assert.ok(Number.isInteger(e.objetivo) && e.objetivo >= 1);
  // 9101: matar al jabalí; el goto de completar lleva el objetivo 1.
  const completar = guia.pasos.find((p) => p.elementos.some((e) => e.t === 'complete' && e.q === 9101));
  assert.deepEqual(completar.elementos.find((e) => e.t === 'goto'), { t: 'goto', mapa: 1413, x: 60.5, y: 60.5, modo: 'flecha', objetivo: 1 });
  // 9108 depende de 4641, que no está en la ruta: todos sus pasos llevan la condición.
  const de9108 = guia.pasos.filter((p) => p.elementos.some((e) => e.q === 9108));
  assert.ok(de9108.length >= 1);
  assert.ok(posDe(guia, 'accept', 9108) >= 0 && posDe(guia, 'turnin', 9108) >= 0);
  for (const p of de9108) assert.deepEqual(p.elementos[0], { t: 'isQuestTurnedIn', qs: [4641] });
  // Las previas de dentro de la ruta no llevan condición (las ordena la ruta).
  assert.ok(!elementos.some((e) => e.t === 'isQuestTurnedIn' && e.qs.includes(9101)));
  // 9111 la da un objeto con punto: se va al cartel.
  const recoge9111 = guia.pasos[pasoDe(guia, 'accept', 9111)];
  assert.deepEqual(recoge9111.elementos[0], { t: 'goto', mapa: 1413, x: 80, y: 20, modo: 'flecha' });
});

test('guiaDeRuta: lo que está a menos del 8 % se junta en un paso; los pasos de PNJ y los de objetivo no se mezclan', () => {
  const { guia } = construir(ORCO, {}, { mapa: 1413, x: 21, y: 21 });
  assert.ok(guia.pasos.some((p) => p.elementos.filter((e) => e.t === 'accept').length > 1), 'hay al menos un paso con dos accept');
  for (const p of guia.pasos) {
    const gotos = p.elementos.filter((e) => e.t === 'goto');
    for (let i = 1; i < gotos.length; i++) {
      assert.equal(gotos[i].mapa, gotos[i - 1].mapa);
      assert.ok(Math.hypot(gotos[i].x - gotos[i - 1].x, gotos[i].y - gotos[i - 1].y) < 8, JSON.stringify(p.elementos));
    }
    const dePnj = p.elementos.some((e) => e.t === 'accept' || e.t === 'turnin');
    const deObjetivo = p.elementos.some((e) => e.t === 'complete');
    assert.ok(!(dePnj && deObjetivo), JSON.stringify(p.elementos));
    // Un goto con objetivo k corresponde a un solo complete k del paso.
    const ks = p.elementos.filter((e) => e.t === 'complete').map((e) => e.objetivo);
    assert.equal(new Set(ks).size, ks.length, 'sin dos complete con el mismo objetivo en un paso');
  }
});

test('guiaDeRuta: ningún punto fuera de la base ni fuera de 0-100; ids ≥ 1', () => {
  const { guia, ordenadas } = construir();
  const deLaBase = new Set();
  for (const q of ordenadas) {
    for (const p of puntosDeMision(base, q, ORCO, 'es', 1413)) deLaBase.add(`${p.mapa}|${p.x}|${p.y}`);
    for (const item of lista(lista(base.mision(q, ORCO).startedBy)[2])) {
      const f = fuenteDeItem(base, item, ORCO, 1413);
      if (f) deLaBase.add(`${f.mapa}|${f.x}|${f.y}`);
    }
  }
  for (const e of elementosDe(guia)) {
    if (e.t === 'goto') {
      assert.ok(e.x >= 0 && e.x <= 100 && e.y >= 0 && e.y <= 100, JSON.stringify(e));
      assert.ok(Number.isInteger(e.mapa) && e.mapa >= 1);
      assert.ok(deLaBase.has(`${e.mapa}|${e.x}|${e.y}`), `punto que no sale de la base: ${JSON.stringify(e)}`);
    }
    if (e.q !== undefined) assert.ok(Number.isInteger(e.q) && e.q >= 1);
    for (const q of e.qs ?? []) assert.ok(Number.isInteger(q) && q >= 1);
  }
});

test('guiaDeRuta: una misión del registro de otra raza no lleva condiciones ni filtro', () => {
  const opciones = { registro: [{ q: 9107 }] };
  const { guia } = construir(ORCO, opciones);
  const de9107 = guia.pasos.filter((p) => p.elementos.some((e) => e.q === 9107));
  assert.ok(de9107.length >= 1);
  assert.equal(posDe(guia, 'accept', 9107), -1, 'ya está recogida: no se va a recogerla');
  assert.ok(posDe(guia, 'turnin', 9107) >= 0);
  for (const p of de9107) assert.ok(!('filtro' in p) && !p.elementos.some((e) => e.t === 'isQuestTurnedIn'));
});

// ------------------------------------------------------------------------------------------------------------------
// pasos.mjs (copia adaptada del conversor)
// ------------------------------------------------------------------------------------------------------------------

test('pasosDeMision: recoger, completar y entregar con los puntos de puntos.mjs', () => {
  const partes = pasosDeMision(base, 9101, ORCO, { mapa: 1413 });
  assert.deepEqual(partes.map((p) => p.parte), ['recoger', 'completar', 'entregar']);
  assert.deepEqual(partes[0].elementos, [{ t: 'goto', mapa: 1413, x: 50, y: 50, modo: 'flecha' }, { t: 'accept', q: 9101 }]);
  assert.deepEqual(partes[1].elementos, [{ t: 'goto', mapa: 1413, x: 60.5, y: 60.5, modo: 'flecha', objetivo: 1 }, { t: 'complete', q: 9101, objetivo: 1 }]);
  assert.deepEqual(partes[2].elementos, [{ t: 'goto', mapa: 1413, x: 50, y: 50, modo: 'flecha' }, { t: 'turnin', q: 9101 }]);
  // Sin objetivos: sin paso de completar. Con previas: la condición delante de cada parte.
  const con = pasosDeMision(base, 9108, ORCO, { mapa: 1413, previas: { una: [4641] } });
  assert.deepEqual(con.map((p) => p.parte), ['recoger', 'entregar']);
  for (const p of con) assert.deepEqual(p.elementos[0], { t: 'isQuestTurnedIn', qs: [4641] });
  // El ítem de 9103 cae de la hiena: objetivo 1 (los ítems van detrás de PNJ y objetos, que no tiene).
  assert.equal(contarObjetivos(base.mision(9103)), 1);
  assert.deepEqual(pasosDeMision(base, 9103, ORCO, { mapa: 1413 })[1].elementos[0], { t: 'goto', mapa: 1413, x: 25, y: 25, modo: 'flecha', objetivo: 1 });
});

test('pasosDeMision: sin punto en la base, sin goto y con sinVerificar = "punto"; ensamblarGuia pone n, id y linea', () => {
  // 790 (fixture base): la da el PNJ 5000, que no existe; la entrega Gornek's Assistant.
  const partes = pasosDeMision(base, 790, ORCO, { mapa: 1411 });
  assert.deepEqual(partes[0].elementos, [{ t: 'accept', q: 790 }]);
  assert.equal(partes[0].sinVerificar, 'punto');
  const guia = ensamblarGuia({ clave: 'IA\\x' }, partes);
  assert.deepEqual(guia.pasos.map((p) => p.n), [1, 2]);
  assert.deepEqual(Object.keys(guia.pasos[0]), ['id', 'n', 'etiquetas', 'elementos', 'requisitos', 'linea', 'sinVerificar']);
  assert.equal(ensamblarGuia({ clave: 'IA\\x' }, partes).pasos[0].id, guia.pasos[0].id, 'id estable');
});

test('pasos.mjs exporta quienDe, lista y claveGoto (no se duplican en rutaZona.mjs)', () => {
  assert.equal(quienDe([[3, 1], [7]]), '1,3|7');
  assert.deepEqual(lista({ 1: 'a', 2: 'b' }), ['a', 'b']);
  assert.equal(claveGoto({ mapa: 1, x: 2, y: 3 }), '1|2|3');
  assert.equal(claveGoto(null), '-');
});

test('pasosDeMision: la que empieza con un ítem va a su fuente; sin fuente, solo el accept y sinFuente', () => {
  assert.deepEqual(pasosDeMision(base, 9122, ORCO, { mapa: 1413 })[0].elementos, [{ t: 'goto', mapa: 1413, x: 25, y: 25, modo: 'flecha' }, { t: 'accept', q: 9122 }]);
  const sin = pasosDeMision(base, 9123, ORCO, { mapa: 1413 })[0];
  assert.deepEqual(sin.elementos, [{ t: 'accept', q: 9123 }]);
  assert.equal(sin.sinFuente, true);
});

test('puntosDeMision con conObjetivo: el índice del objetivo en el registro; sin la opción, la salida no cambia', () => {
  const sin = puntosDeMision(base, 9101, ORCO, 'es', 1413);
  assert.ok(sin.every((p) => !('objetivo' in p)));
  const con = puntosDeMision(base, 9101, ORCO, 'es', 1413, { conObjetivo: true });
  assert.equal(con.find((p) => p.papel === 'objetivo').objetivo, 1);
});

// ------------------------------------------------------------------------------------------------------------------
// construirRutaZona
// ------------------------------------------------------------------------------------------------------------------

const turno = (personaje = ORCO, lugar = { mapa: 1413, x: 21, y: 21, zona: 'The Barrens' }, registro = []) => ({ datos: { personaje, lugar, registro } });

test('construirRutaZona: guía y texto del resumen en el idioma del jugador', () => {
  const r = construirRutaZona(base, { zona: 'Los Baldíos' }, turno(), 'es');
  assert.equal(r.guia.clave, 'IA\\Ruta de Los Baldíos (Horda)');
  assert.equal(r.texto, `13 misiones y ${r.guia.pasos.length} pasos; 1 de élite; 1 pide grupo (1 misión que empieza con un objeto sin sitio conocido)`);
  assert.equal(r.guia.resumen.objetoSinSitio, 1);
  const en = construirRutaZona(base, { zona: 'The Barrens' }, turno(), 'en');
  assert.equal(en.texto, `13 quests and ${en.guia.pasos.length} steps; 1 elite; 1 needs a group (1 quest that starts from an item with no known location)`);
});

test('construirRutaZona: la zona del jugador (mapa o nombre del juego), zona que no está y sin misiones a su nivel', () => {
  assert.equal(construirRutaZona(base, { zona: 1413 }, turno(), 'es').guia.clave, 'IA\\Ruta de Los Baldíos (Horda)');
  assert.equal(construirRutaZona(base, { zona: 'the barrens' }, turno(), 'es').guia.clave, 'IA\\Ruta de Los Baldíos (Horda)');
  assert.deepEqual(construirRutaZona(base, { zona: 'Atlántida' }, turno(), 'es'), { error: 'sin_zona', texto: 'Esa zona no está en la base de SnetForever.' });
  assert.deepEqual(construirRutaZona(base, { zona: 'Atlantis' }, turno(), 'en'), { error: 'sin_zona', texto: "That zone isn't in the SnetForever database." });
  // 15-nov (en el juego, al final de la respuesta: «No hay misiones de esa zona para tu nivel», que parecía cortado): una
  // frase entera, con la zona si tiene nombre (1450 no lo tiene).
  assert.deepEqual(construirRutaZona(base, { zona: 1450 }, turno(), 'es'),
    { error: 'sin_misiones', texto: 'No te he marcado la ruta: no hay misiones de esa zona para tu nivel.' });
  assert.equal(construirRutaZona(base, { zona: 1450 }, turno(), 'en').texto,
    "I haven't marked the route: there are no quests in that zone for your level.");
  assert.equal(construirRutaZona(base, { zona: 1413, solo: 'registro' }, turno(), 'es').texto,
    'No te he marcado la ruta de Los Baldíos: no hay misiones de esa zona para tu nivel.');
  // «Manda el juego» desde el turno: la del registro entra.
  const conRegistro = construirRutaZona(base, { zona: 1413 }, turno(ORCO, undefined, [{ q: 9107, nombre: 'x' }]), 'es');
  assert.ok(elementosDe(conRegistro.guia).some((e) => e.t === 'turnin' && e.q === 9107));
});

test('revisión final: una rutaZona pedida (sinNivel y mazmorras) no quita por nivel ni por mazmorra a un personaje de nivel 1', () => {
  const nivel1 = { ...ORCO, nivel: 1 };
  const enDurotar = { mapa: 1411, x: 42, y: 68, zona: 'Durotar' };
  const qs = (r) => [...new Set(elementosDe(r.guia).map((e) => e.q).filter(Number.isInteger))].sort((a, b) => a - b);
  // Sin pedirla, como siempre: fuera 791 (mazmorra, nivel 12) y 792 (pide nivel 4).
  const normal = construirRutaZona(base, { zona: 1411 }, turno(nivel1, enDurotar), 'es');
  assert.ok(!qs(normal).includes(791) && !qs(normal).includes(792), JSON.stringify(qs(normal)));
  const pedida = construirRutaZona(base, { zona: 1411, sinNivel: true, mazmorras: true }, turno(nivel1, enDurotar), 'es');
  assert.ok(qs(pedida).includes(791), 'la de mazmorra entra');
  assert.ok(qs(pedida).includes(792), 'la de nivel 4 entra');
  for (const q of qs(normal)) assert.ok(qs(pedida).includes(q), `${q} sigue`);
});

// ------------------------------------------------------------------------------------------------------------------
// Topes
// ------------------------------------------------------------------------------------------------------------------

// Base con `n` misiones en Mulgore (1412), cada una con su PNJ y `objetivos` PNJ a matar en sitios distintos.
function baseGrande(n, objetivos) {
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-rutazona-topes-'));
  const lineas = [
    'SNF_MISIONES = {version="t",esquema=1,fuente={nombre="QuestieDB",version="t",commit="0"},quest={},npc={},object={},item={},'
      + 'es={quest={},npc={},object={},item={}},porMazmorra={},zonas={area={[215]=1412},nombre={[1412]={en="Mulgore",es="Mulgore"}}},mazmorra={},porFaccion={}}',
    'local Q = SNF_MISIONES.quest', 'local N = SNF_MISIONES.npc',
  ];
  let npc = 50000;
  for (let i = 0; i < n; i++) {
    const q = 70000 + i;
    const dador = npc++;
    const x = 5 + (i % 9) * 10;
    const y = 5 + Math.floor(i / 9) * 10;
    lineas.push(`N[${dador}]={name="Dador ${i}",spawns={[1412]={{${x},${y}}}},rank=0,friendlyToFaction="AH"}`);
    const objs = [];
    for (let k = 0; k < objetivos; k++) {
      const id = npc++;
      lineas.push(`N[${id}]={name="Bicho ${i}-${k}",spawns={[1412]={{${(x + k * 7) % 100},${(y + k * 11) % 100}}}},rank=0}`);
      objs.push(`{${id}}`);
    }
    lineas.push(`Q[${q}]={name="Mision ${i}",startedBy={{${dador}}},finishedBy={{${dador}}},requiredLevel=1,questLevel=${1 + (i % 10)},`
      + `requiredRaces=0,requiredClasses=0,objectivesText={},objectives={{${objs.join(',')}}},sourceItemId=0,zoneOrSort=215,`
      + 'nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}');
  }
  writeFileSync(join(carpeta, 'datos.lua'), `${lineas.join('\n')}\n`);
  writeFileSync(join(carpeta, 'app.toc'), '## Interface: 16001\n\ndatos.lua\n');
  return cargarBase(carpeta);
}
const PJ_ALTO = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 20 };

test('topes: 61 misiones -> 60, las más cercanas al nivel, con recortadas = 1', () => {
  const b = baseGrande(61, 1);
  const misiones = misionesDeZona(b, 1412, PJ_ALTO, {});
  assert.equal(misiones.length, MAX_MISIONES);
  assert.equal(MAX_MISIONES, 60);
  assert.equal(misiones.recortadas, 1);
  // Niveles 1..10 en ciclo y personaje de nivel 20: se eligen por cercanía a 20, así que sale una de nivel 1 (la de
  // id más alto, 70060) y no una de nivel 10.
  assert.ok(!qsDe(misiones).includes(70060));
  assert.ok(qsDe(misiones).includes(70059));
  const r = construirRutaZona(b, { zona: 'Mulgore' }, turno(PJ_ALTO, { mapa: 1412, x: 5, y: 5 }), 'es');
  assert.match(r.texto, /\(se han dejado fuera 1 por el tope de 60\)$/);
  assert.equal(r.guia.recortadas, 1);
  assert.equal(r.guia.resumen.misiones, 60);
});

test('topes: la guía serializada pesa ≤ 40 KB y tiene ≤ 400 pasos; si no cabe se quitan misiones del final', () => {
  const b = baseGrande(60, 6);
  const r = construirRutaZona(b, { zona: 1412 }, turno(PJ_ALTO, { mapa: 1412, x: 5, y: 5 }), 'es');
  const bytes = Buffer.byteLength(aLuaSeguro(r.guia), 'utf8');
  assert.ok(bytes <= MAX_BYTES_GUIA, `${bytes} bytes`);
  assert.equal(MAX_BYTES_GUIA, 40 * 1024);
  assert.ok(r.guia.pasos.length <= MAX_PASOS && MAX_PASOS === 400);
  assert.ok(r.guia.recortadas > 0, 'con 60 misiones de 6 objetivos no cabe');
  assert.equal(r.guia.resumen.misiones + r.guia.recortadas, 60);
  assert.match(r.texto, /\(se han dejado fuera \d+ más para que la ruta quepa\)$/);
  // Lo que queda sigue siendo el principio del orden.
  const enGuia = new Set(elementosDe(r.guia).filter((e) => e.t === 'accept').map((e) => e.q));
  const orden = ordenarRuta(b, misionesDeZona(b, 1412, PJ_ALTO, {}), PJ_ALTO, { mapa: 1412, x: 5, y: 5 }, 1412);
  assert.deepEqual(orden.slice(0, enGuia.size).sort(), [...enGuia].sort());
});


// Cadenas A → B → C en Mulgore (A ql 5, B ql 10, C ql 15; B y C piden la anterior), `n` cadenas.
function baseCadenas(n, niveles = [5, 10, 15]) {
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-rutazona-cadenas-'));
  const lineas = [
    'SNF_MISIONES = {version="t",esquema=1,fuente={nombre="QuestieDB",version="t",commit="0"},quest={},npc={},object={},item={},'
      + 'es={quest={},npc={},object={},item={}},porMazmorra={},zonas={area={[215]=1412},nombre={[1412]={en="Mulgore",es="Mulgore"}}},mazmorra={},porFaccion={}}',
    'local Q = SNF_MISIONES.quest', 'local N = SNF_MISIONES.npc',
  ];
  for (let c = 0; c < n; c++) {
    const npc = 60000 + c;
    lineas.push(`N[${npc}]={name="Dador ${c}",spawns={[1412]={{${5 + (c % 9) * 10},${5 + Math.floor(c / 9) * 10}}}},rank=0}`);
    niveles.forEach((nivel, k) => {
      const q = 80000 + c * 10 + k;
      const previa = k > 0 ? `preQuestSingle={${q - 1}},` : '';
      const sig = k < niveles.length - 1 ? q + 1 : 0;
      lineas.push(`Q[${q}]={name="Cadena ${c}-${k}",startedBy={{${npc}}},finishedBy={{${npc}}},requiredLevel=1,questLevel=${nivel},`
        + `requiredRaces=0,requiredClasses=0,objectivesText={},objectives={},sourceItemId=0,${previa}zoneOrSort=215,`
        + `nextQuestInChain=${sig},questFlags=8,specialFlags=0,parentQuest=0}`);
    });
  }
  writeFileSync(join(carpeta, 'datos.lua'), `${lineas.join('\n')}\n`);
  writeFileSync(join(carpeta, 'app.toc'), '## Interface: 16001\n\ndatos.lua\n');
  return cargarBase(carpeta);
}

test('topes: el tope no rompe cadenas (si entra una continuación entran sus previas; si se corta una previa, todo lo que pide)', () => {
  const b = baseCadenas(21);
  const pj = { ...PJ_ALTO, nivel: 15 };
  const misiones = misionesDeZona(b, 1412, pj, {});
  assert.equal(misiones.length, 60);
  assert.equal(misiones.recortadas, 3);
  const qs = new Set(qsDe(misiones));
  for (let c = 0; c < 21; c++) {
    const dentro = [0, 1, 2].map((k) => qs.has(80000 + c * 10 + k));
    assert.ok(dentro.every(Boolean) || dentro.every((x) => !x), `la cadena ${c} entera o nada: ${dentro}`);
  }
  // En un empate de cercanía, la previa va antes: con sitio para una sola, entra la primera de la cadena.
  const iguales = baseCadenas(1, [15, 15]);
  assert.deepEqual(qsDe(misionesDeZona(iguales, 1412, pj, { maximo: 1 })), [80000]);
});

test('topes: primero las de nivel en [nivel − 3, nivel + 5], las más cercanas al nivel', () => {
  const b = baseGrande(61, 1); // questLevel 1..10
  const misiones = misionesDeZona(b, 1412, { ...PJ_ALTO, nivel: 4 }, { maximo: 10 });
  for (const m of misiones) assert.ok(m.nivel >= 1 && m.nivel <= 9, `${m.q}: ${m.nivel}`);
  assert.equal(misiones[0].nivel, 4);
});

// ------------------------------------------------------------------------------------------------------------------
// Datos reales
// ------------------------------------------------------------------------------------------------------------------

const hayReales = existsSync(join(REALES, 'SnetForever_Misiones.toc'));
const real = hayReales ? cargarBase(REALES) : null;
const sinReales = !hayReales && 'faltan los datos reales';

// Las previas que están en la ruta se entregan antes de recoger la misión.
function comprobarPrevias(b, guia, pj) {
  const enRuta = new Set(elementosDe(guia).filter((e) => e.t === 'accept').map((e) => e.q));
  for (const q of enRuta) {
    const m = b.mision(q, pj);
    const previas = [...lista(m.preQuestSingle), ...lista(m.preQuestGroup)].filter((p) => enRuta.has(p));
    for (const p of previas) assert.ok(posDe(guia, 'turnin', p) < posDe(guia, 'accept', q), `${p} antes que ${q}`);
  }
  for (const p of enRuta) {
    const sig = b.mision(p, pj).nextQuestInChain;
    if (enRuta.has(sig)) assert.ok(posDe(guia, 'turnin', p) < posDe(guia, 'accept', sig), `${p} antes que ${sig}`);
  }
}

// Ninguna continuación sin su previa: de las previas que podían entrar (candidatas sin tope), las de preQuestGroup
// están todas y, de las de preQuestSingle (y la anterior por nextQuestInChain), alguna.
function comprobarCadenas(b, uiMap, pj, guia) {
  const candidatas = new Set(qsDe(misionesDeZona(b, uiMap, pj, { maximo: Infinity })));
  const enRuta = new Set(elementosDe(guia).filter((e) => e.t === 'accept' || e.t === 'turnin').map((e) => e.q));
  const anteriores = new Map();
  for (const p of candidatas) {
    const sig = b.mision(p, pj).nextQuestInChain;
    // La anterior por cadena solo cuenta si la misión no tiene preQuestSingle ni preQuestGroup (Ruling F4-32).
    const sinPrevias = candidatas.has(sig) && lista(b.mision(sig, pj).preQuestSingle).length === 0 && lista(b.mision(sig, pj).preQuestGroup).length === 0;
    if (sinPrevias) (anteriores.get(sig) ?? anteriores.set(sig, []).get(sig)).push(p);
  }
  for (const q of enRuta) {
    const m = b.mision(q, pj);
    for (const p of lista(m.preQuestGroup)) if (candidatas.has(p)) assert.ok(enRuta.has(p), `${q} sin su previa ${p}`);
    const alguna = [...lista(m.preQuestSingle), ...(anteriores.get(q) ?? [])].filter((p) => candidatas.has(p));
    if (alguna.length > 0) assert.ok(alguna.some((p) => enRuta.has(p)), `${q} sin ninguna de sus previas ${alguna}`);
  }
}

// Cambios de mapa y saltos de más del 40 % entre los goto seguidos de la guía (desde la posición del jugador).
function metricas(guia, lugar) {
  let mapas = 0;
  let saltos = 0;
  let prev = lugar;
  for (const g of elementosDe(guia).filter((e) => e.t === 'goto')) {
    if (g.mapa !== prev.mapa) mapas++;
    else if (Math.hypot(g.x - prev.x, g.y - prev.y) > 40) saltos++;
    prev = g;
  }
  return { mapas, saltos };
}

function comprobarReal(uiMap, pj, clave, lugar) {
  const t0 = performance.now();
  const r = construirRutaZona(real, { zona: uiMap }, turno(pj, lugar), 'es');
  const ms = performance.now() - t0;
  assert.ok(r.guia, r.texto);
  assert.equal(r.guia.clave, clave);
  assert.ok(r.guia.resumen.misiones > 0);
  assert.ok(ms < 2000, `${Math.round(ms)} ms`);
  comprobarPrevias(real, r.guia, pj);
  comprobarCadenas(real, uiMap, pj, r.guia);
  for (const e of elementosDe(r.guia)) {
    if (e.t === 'goto') assert.ok(e.x >= 0 && e.x <= 100 && e.y >= 0 && e.y <= 100 && Number.isInteger(e.mapa) && e.mapa >= 1, JSON.stringify(e));
  }
  assert.ok(r.guia.pasos.length <= MAX_PASOS);
  assert.ok(Buffer.byteLength(aLuaSeguro(r.guia), 'utf8') <= MAX_BYTES_GUIA);
  for (const p of r.guia.pasos) {
    assert.ok(p.elementos.length <= 30);
    const accepts = p.elementos.filter((e) => e.t === 'accept');
    if (accepts.length > 1) assert.ok(p.elementos.some((e) => e.t === 'goto'), 'nunca varios accept sin punto');
  }
  // Ninguna de la otra facción: la máscara de raza, si la hay, admite alguna raza de la suya.
  const BITS = pj.faccion === 'Horde' ? [2, 16, 32, 128, 256, 2 ** 33] : [1, 4, 8, 64, 2 ** 32];
  const enRuta = new Set(elementosDe(r.guia).filter((e) => e.t === 'accept').map((e) => e.q));
  for (const q of enRuta) {
    const mascara = real.mision(q, pj).requiredRaces;
    if (mascara) assert.ok(BITS.some((bit) => Math.floor(mascara / bit) % 2 === 1), `${q} no es de su facción`);
  }
  return { r, enRuta, ...metricas(r.guia, lugar) };
}

test('datos reales: Durotar (1411) para un orco guerrero de nivel 8', { skip: sinReales }, () => {
  const pj = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 8 };
  const { mapas, saltos } = comprobarReal(1411, pj, 'IA\\Ruta de Durotar (Horda)', { mapa: 1411, x: 52, y: 68 });
  // Antes de la ronda 1 eran 15. Quedan 5 que no se pueden quitar con estas reglas: la cadena 812/813 va y viene entre
  // Durotar y Orgrimmar (dos viajes), la vuelta al bloque final de nivel 9-10 y la entrega de 840 en Los Baldíos.
  assert.ok(mapas <= 5, `${mapas} cambios de mapa`);
  assert.ok(saltos <= 3, `${saltos} saltos de más del 40 %`);
});

test('datos reales: Los Baldíos (1413) para un tauren druida de nivel 15', { skip: sinReales }, () => {
  const pj = { faccion: 'Horde', raza: 'Tauren', clase: 'DRUID', nivel: 15 };
  const { enRuta, mapas } = comprobarReal(1413, pj, 'IA\\Ruta de Los Baldíos (Horda)', { mapa: 1413, x: 52, y: 30 });
  for (const q of [844, 845]) assert.ok(enRuta.has(q), `${q} tiene que estar`);
  assert.ok(!enRuta.has(854), 'la migaja 854 sale porque 844 está');
  if (enRuta.has(907)) assert.ok(enRuta.has(882));
  if (enRuta.has(1063)) assert.ok(enRuta.has(1062));
  assert.ok(mapas <= 10, `${mapas} cambios de mapa (antes, 22)`);
});

test('datos reales: Elwynn (1429) para un humano de nivel 6: 37 nunca sin 35', { skip: sinReales }, () => {
  const pj = { faccion: 'Alliance', raza: 'Human', clase: 'WARRIOR', nivel: 6 };
  const { enRuta, mapas } = comprobarReal(1429, pj, 'IA\\Ruta de Bosque de Elwynn (Alianza)', { mapa: 1429, x: 42, y: 65 });
  if (enRuta.has(37)) assert.ok(enRuta.has(35));
  assert.ok(mapas <= 4, `${mapas} cambios de mapa`);
});

test('datos reales: las áreas de campo de batalla de la lista son las de la base; el tranvía no es mazmorra', { skip: sinReales }, () => {
  assert.deepEqual([2597, 3277, 3358].map((a) => real.mazmorra(a)?.nombre), ['Alterac Valley', 'Warsong Gulch', 'Arathi Basin']);
  assert.equal(real.mazmorra(2257)?.nombre, 'Deeprun Tram');
  const ui = real.uiDeArea(2257);
  if (ui) {
    const qs = qsDe(misionesDeZona(real, ui, { faccion: 'Alliance', raza: 'Human', clase: 'WARRIOR', nivel: 12 }, { maximo: Infinity }));
    assert.ok(qs.includes(6661), 'Deeprun Rat Roundup entra');
  }
});

// ------------------------------------------------------------------------------------------------------------------
// Ronda 2 (Ruling F4-32): condiciones transitivas y la anterior por cadena solo sin previas
// ------------------------------------------------------------------------------------------------------------------

// Base pequeña en Mulgore (1412) a partir de texto Lua; cada misión: [q, extra] con dador 60100 en (50, 50).
function baseDeMisiones(misiones) {
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-rutazona-r2-'));
  const lineas = [
    'SNF_MISIONES = {version="t",esquema=1,fuente={nombre="QuestieDB",version="t",commit="0"},quest={},npc={},object={},item={},'
      + 'es={quest={},npc={},object={},item={}},porMazmorra={},zonas={area={[215]=1412,[14]=1411},nombre={[1412]={en="Mulgore",es="Mulgore"},[1411]={en="Durotar"}}},mazmorra={},porFaccion={}}',
    'local Q = SNF_MISIONES.quest', 'local N = SNF_MISIONES.npc',
    'N[60100]={name="Dador",spawns={[1412]={{50,50}}},rank=0}',
    'N[60101]={name="Lejos",spawns={[1411]={{50,50}}},rank=0}',
  ];
  for (const [q, extra, zona = 215, dador = 60100] of misiones) {
    lineas.push(`Q[${q}]={name="M${q}",startedBy={{${dador}}},finishedBy={{${dador}}},requiredLevel=1,questLevel=5,requiredRaces=0,requiredClasses=0,`
      + `objectivesText={},objectives={},sourceItemId=0,zoneOrSort=${zona},questFlags=8,specialFlags=0,parentQuest=0${extra ? `,${extra}` : ''}}`);
  }
  writeFileSync(join(carpeta, 'datos.lua'), `${lineas.join('\n')}\n`);
  writeFileSync(join(carpeta, 'app.toc'), '## Interface: 16001\n\ndatos.lua\n');
  return cargarBase(carpeta);
}

// Recorre la guía como el motor, suponiendo hecho solo lo que la propia guía entrega: un paso con un isQuestTurnedIn sin
// ninguna de sus misiones entregadas se salta; en los demás, cada accept tiene que estar disponible en el juego
// (preQuestGroup todas entregadas, preQuestSingle alguna, ninguna excluyente en el registro o entregada), cada complete
// de una misión recogida y cada turnin de una recogida. Devuelve el primer atasco o null.
function recorrer(b, guia, pj) {
  const entregadas = new Set();
  const aceptadas = new Set();
  for (const [i, p] of guia.pasos.entries()) {
    const condiciones = p.elementos.filter((e) => e.t === 'isQuestTurnedIn');
    if (condiciones.some((c) => !c.qs.some((q) => entregadas.has(q)))) continue;
    for (const e of p.elementos) {
      const atasco = `paso ${i + 1}: ${e.t} ${e.q}`;
      if (e.t === 'accept') {
        if (aceptadas.has(e.q) || entregadas.has(e.q)) continue;
        const m = b.mision(e.q, pj);
        const una = lista(m.preQuestSingle);
        const disponible = lista(m.preQuestGroup).every((q) => entregadas.has(q)) && (una.length === 0 || una.some((q) => entregadas.has(q)))
          && !lista(m.exclusiveTo).some((q) => entregadas.has(q) || aceptadas.has(q));
        if (!disponible) return atasco;
        aceptadas.add(e.q);
      } else if (e.t === 'complete') {
        if (!aceptadas.has(e.q) && !entregadas.has(e.q)) return atasco;
      } else if (e.t === 'turnin') {
        if (entregadas.has(e.q)) continue;
        if (!aceptadas.has(e.q)) return atasco;
        aceptadas.delete(e.q);
        entregadas.add(e.q);
      }
    }
  }
  return null;
}

const condicionesDe = (guia, q) => guia.pasos.filter((p) => p.elementos.some((e) => e.q === q))
  .map((p) => p.elementos.filter((e) => e.t === 'isQuestTurnedIn').map((e) => e.qs));

test('ronda 2: la condición de una previa externa pasa a todas las que dependen de ella dentro de la ruta', () => {
  // 100 está fuera (Durotar). 101 pide 100; 102 pide 101; 103 pide 102. 104 pide 101 o 105 (sin condición): nada.
  // 106 pide 101 o 107, y 107 pide 108 (fuera): 106 lleva «100 o 108». 109 pide 101 y 103 (preQuestGroup).
  const b = baseDeMisiones([
    [100, '', 14, 60101], [101, 'preQuestSingle={100}'], [102, 'preQuestSingle={101}'], [103, 'preQuestSingle={102}'],
    [104, 'preQuestSingle={101,105}'], [105, ''], [106, 'preQuestSingle={101,107}'], [107, 'preQuestSingle={108}'], [108, '', 14, 60101],
    [109, 'preQuestGroup={101,103}'],
  ]);
  const pj = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 5 };
  const r = construirRutaZona(b, { zona: 1412 }, turno(pj, { mapa: 1412, x: 50, y: 50 }), 'es');
  for (const q of [101, 102, 103, 109]) {
    const conds = condicionesDe(r.guia, q);
    assert.ok(conds.length > 0, `${q} tiene pasos`);
    for (const c of conds) assert.deepEqual(c, [[100]], `${q}: ${JSON.stringify(c)}`);
  }
  for (const c of condicionesDe(r.guia, 104)) assert.deepEqual(c, [], '104 puede ir por 105');
  for (const c of condicionesDe(r.guia, 105)) assert.deepEqual(c, []);
  for (const c of condicionesDe(r.guia, 106)) assert.deepEqual(c, [[100, 108]], 'por 101 (pide 100) o por 107 (pide 108)');
  for (const c of condicionesDe(r.guia, 107)) assert.deepEqual(c, [[108]]);
  // Sin ninguna previa externa hecha, la ruta no se atasca: se salta todo lo que cuelga de 100 y de 108.
  assert.equal(recorrer(b, r.guia, pj), null);
  // Las del registro no llevan condiciones, ni las heredan de sus previas.
  const conRegistro = construirRutaZona(b, { zona: 1412 }, turno(pj, { mapa: 1412, x: 50, y: 50 }, [{ q: 102 }]), 'es');
  for (const c of condicionesDe(conRegistro.guia, 102)) assert.deepEqual(c, []);
  for (const c of condicionesDe(conRegistro.guia, 103)) assert.deepEqual(c, [], '103 pide 102, que ya está en el registro');
});

test('ronda 2: la anterior por nextQuestInChain solo cuenta como previa si la misión no tiene preQuestSingle ni preQuestGroup', () => {
  // 201 → 203 por cadena, pero 203 pide 202. 204 → 205 por cadena y 205 no pide nada.
  const b = baseDeMisiones([[201, 'nextQuestInChain=203'], [202, ''], [203, 'preQuestSingle={202}'], [204, 'nextQuestInChain=205'], [205, '']]);
  const pj = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 5 };
  const deps = dependencias(b, pj, [201, 202, 203, 204, 205]);
  assert.deepEqual(deps.get(203), { todas: [], alguna: [202] });
  assert.deepEqual(deps.get(205), { todas: [], alguna: [204] });
});

test('ronda 2, datos reales: 1705 pide 1782 (no 1700) y 1838 pide 1824 (no 1825)', { skip: sinReales }, () => {
  const pj = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 20 };
  assert.deepEqual(dependencias(real, pj, [1700, 1705, 1782]).get(1705).alguna, [1782]);
  assert.deepEqual(dependencias(real, pj, [1824, 1825, 1838]).get(1838).alguna, [1824]);
});

test('ronda 2, datos reales: Los Baldíos (tauren druida 15) sin 6127 entregada no se atasca y 6129 se salta', { skip: sinReales }, () => {
  const pj = { faccion: 'Horde', raza: 'Tauren', clase: 'DRUID', nivel: 15 };
  const r = construirRutaZona(real, { zona: 1413 }, turno(pj, { mapa: 1413, x: 52, y: 30 }), 'es');
  const conds = condicionesDe(r.guia, 6129);
  assert.ok(conds.length > 0, '6129 está en la ruta');
  for (const c of conds) assert.ok(c.some((qs) => qs.includes(6127)), JSON.stringify(c));
  assert.equal(recorrer(real, r.guia, pj), null);
});

// Prueba lenta: todas las zonas con nombre, tres personajes y cinco niveles, sin ninguna previa externa hecha.
test('ronda 2, datos reales (lenta): ninguna ruta se atasca sin las previas externas hechas', { skip: sinReales, timeout: 60000 }, () => {
  const t0 = performance.now();
  const personajes = [
    { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR' },
    { faccion: 'Horde', raza: 'Tauren', clase: 'DRUID' },
    { faccion: 'Alliance', raza: 'Human', clase: 'MAGE' },
  ];
  const zonas = entradasDe(real.datos.zonas.nombre).map(([ui]) => ui).filter((ui) => typeof ui === 'number');
  const atascos = [];
  let rutas = 0;
  for (const ui of zonas) {
    for (const p of personajes) {
      for (const nivel of [8, 15, 25, 40, 55]) {
        const pj = { ...p, nivel };
        const r = construirRutaZona(real, { zona: ui }, turno(pj, { mapa: ui, x: 50, y: 50 }), 'es');
        if (!r.guia) continue;
        rutas++;
        const atasco = recorrer(real, r.guia, pj);
        if (atasco) atascos.push(`${ui} ${p.raza}/${p.clase} ${nivel}: ${atasco}`);
      }
    }
  }
  const ms = performance.now() - t0;
  assert.ok(rutas > 300, `${rutas} rutas`);
  assert.deepEqual(atascos, []);
  assert.ok(ms < 60000, `${Math.round(ms)} ms`);
});

// 11-nov (en el juego): la ruta de Vallefresno mandaba a recoger «Novedades de corredor Grito de Guerra» (6545), una
// submisión de «Los informes Grito de Guerra» (parentQuest 6543) que no se puede recoger suelta.
test('11-nov: las submisiones (parentQuest) y las repetibles no entran en la ruta de zona, salvo que estén en el registro', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-rutazona-sub-'));
  const lineas = [
    'SNF_MISIONES = {version="t",esquema=1,fuente={nombre="QuestieDB",version="t",commit="0"},quest={},npc={},object={},item={},'
      + 'es={quest={},npc={},object={},item={}},porMazmorra={},zonas={area={[215]=1412},nombre={[1412]={en="Mulgore",es="Mulgore"}}},mazmorra={},porFaccion={}}',
    'local Q = SNF_MISIONES.quest', 'local N = SNF_MISIONES.npc',
    'N[50001]={name="Dador",spawns={[1412]={{40,40}}},rank=0,friendlyToFaction="AH"}',
    'N[50002]={name="Corredor",spawns={[1412]={{60,60}}},rank=0,friendlyToFaction="AH"}',
    'Q[71000]={name="Los informes",startedBy={{50001}},finishedBy={{50001}},requiredLevel=1,questLevel=3,zoneOrSort=215}',
    'Q[71001]={name="Novedades del corredor",startedBy={{50002}},finishedBy={{50002}},requiredLevel=1,questLevel=3,zoneOrSort=215,specialFlags=1,parentQuest=71000}',
    'Q[71002]={name="Tela para la causa",startedBy={{50002}},finishedBy={{50002}},requiredLevel=1,questLevel=3,zoneOrSort=215,specialFlags=1}',
  ];
  writeFileSync(join(carpeta, 'datos.lua'), `${lineas.join('\n')}\n`);
  writeFileSync(join(carpeta, 'app.toc'), '## Interface: 16001\n\ndatos.lua\n');
  const b = cargarBase(carpeta);
  assert.deepEqual(qsDe(misionesDeZona(b, 1412, ORCO, {})), [71000]);
  assert.deepEqual(qsDe(misionesDeZona(b, 1412, ORCO, { registro: [71001] })).sort(), [71000, 71001], 'en el registro, entra');
});

test('12-nov: con solo="registro" solo entran las del registro; con sin, la trabada no entra ni lo que depende de ella', () => {
  const b = baseCadenas(2);
  const pj = { ...PJ_ALTO, nivel: 15 };
  const todas = qsDe(misionesDeZona(b, 1412, pj, {}));
  assert.equal(todas.length, 6);
  assert.deepEqual(qsDe(misionesDeZona(b, 1412, pj, { registro: [80001], soloRegistro: true })), [80001]);
  const sin = qsDe(misionesDeZona(b, 1412, pj, { sin: [80000] }));
  assert.deepEqual(sin.sort(), [80010, 80011, 80012], 'sin la primera de la cadena 0, fuera toda la cadena 0');
  const sinPeroEnRegistro = qsDe(misionesDeZona(b, 1412, pj, { sin: [80000], registro: [80001] }));
  assert.ok(sinPeroEnRegistro.includes(80001), 'la del registro se queda aunque su previa esté en sin');
  assert.ok(!sinPeroEnRegistro.includes(80000));
});

test('12-nov: construirRutaZona pasa solo y sin de la petición de la IA', () => {
  const b = baseCadenas(2);
  const t = { datos: { personaje: { ...PJ_ALTO, nivel: 15 }, lugar: { mapa: 1412, x: 5, y: 5, zona: 'Mulgore' }, registro: [{ q: 80011 }, { q: 80001 }] } };
  const r = construirRutaZona(b, { zona: 1412, solo: 'registro', sin: [80001] }, t, 'es');
  const qs = new Set(r.guia.pasos.flatMap((p) => p.elementos).filter((e) => e.q).map((e) => e.q));
  assert.deepEqual([...qs], [80011]);
});

// En el juego: «yo no le dije que quiero hacer las missiones ahora le pedi la ruta asi tenga level 1 debe de crearla».
// Las misiones que pide la IA por su nombre o su id entran enteras: sin filtro de nivel y aunque sean de mazmorra.
// Revisión: con misiones pedidas, el aviso de «empieza con un objeto sin sitio» solo cuenta las pedidas y sus previas.
test('con misiones pedidas, objetoSinSitio solo cuenta entre las pedidas y sus previas', () => {
  const otra = construirRutaZona(base, { zona: 1413, misiones: [9101] }, turno(), 'es');
  assert.ok(otra.guia, otra.texto);
  assert.equal(otra.guia.resumen.objetoSinSitio, undefined);
  assert.ok(!/objeto sin sitio/.test(otra.texto), otra.texto);
  const pedida = construirRutaZona(base, { zona: 1413, misiones: [9101, 9123] }, turno(), 'es');
  assert.equal(pedida.guia.resumen.objetoSinSitio, 1, 'si se pide la que empieza con un objeto sin sitio, sí se cuenta');
});

test('las misiones pedidas entran aunque sean de mazmorra o de un nivel muy alto para el personaje', () => {
  const qsDeRuta = (r) => new Set(r.guia.pasos.flatMap((p) => p.elementos).filter((e) => e.t === 'accept' || e.t === 'turnin').map((e) => e.q));
  const mazmorra = construirRutaZona(base, { zona: 1413, misiones: [9117, 'De mazmorra'] }, turno(), 'es');
  assert.ok(mazmorra.guia, mazmorra.texto);
  assert.ok(qsDeRuta(mazmorra).has(9117) && qsDeRuta(mazmorra).has(9105));
  const alta = construirRutaZona(base, { zona: 1413, misiones: [9106] }, turno(), 'es');
  assert.ok(alta.guia, alta.texto);
  assert.ok(qsDeRuta(alta).has(9106), 'la de nivel alto, pedida, entra');
  // Sin pedirlas, la ruta de la zona sigue sin ellas.
  const zona = construirRutaZona(base, { zona: 1413 }, turno(), 'es');
  for (const q of [9105, 9106, 9117]) assert.ok(!qsDeRuta(zona).has(q), String(q));
});

test('12-nov: resolverMisiones encuentra por id o por nombre entero (sin tildes ni mayúsculas) y dice las que no encuentra', () => {
  const b = baseCadenas(2);
  const r = resolverMisiones(b, ['cadena 1-2', 80000, 'Cadena', 99999, '']);
  assert.deepEqual([...r.qs].sort(), [80000, 80012]);
  assert.deepEqual(r.sinEncontrar, ['Cadena', '99999'], '«Cadena» no es el nombre entero de ninguna');
});

test('12-nov: con misiones, la ruta lleva solo esas y sus previas de la zona; las que no encuentra se dicen en el texto', () => {
  const b = baseCadenas(3);
  const t = { datos: { personaje: { ...PJ_ALTO, nivel: 15 }, lugar: { mapa: 1412, x: 5, y: 5, zona: 'Mulgore' }, registro: [] } };
  const r = construirRutaZona(b, { zona: 1412, misiones: ['Cadena 1-2', 'No existe'] }, t, 'es');
  const qs = new Set(r.guia.pasos.flatMap((p) => p.elementos).filter((e) => e.t === 'accept').map((e) => e.q));
  assert.deepEqual([...qs].sort(), [80010, 80011, 80012], 'la pedida y sus previas');
  assert.match(r.texto, /No he encontrado en la base de SnetForever: «No existe»/);
  const nada = construirRutaZona(b, { zona: 1412, misiones: ['No existe'] }, t, 'es');
  assert.equal(nada.error, 'sin_misiones');
  // Revisión: si no encuentra ninguna, una sola frase.
  assert.equal(nada.texto, 'No te he marcado la ruta de Mulgore: no he encontrado esas misiones.');
  assert.equal(construirRutaZona(b, { zona: 1412, misiones: ['No existe'] }, t, 'en').texto,
    "I haven't marked the route for Mulgore: I couldn't find those quests.");
});

test('13-nov: lo que el plan de subida manda saltar no entra en la ruta, salvo que la IA lo pida por su nombre', () => {
  const b = baseCadenas(2);
  const t = { datos: { personaje: { ...PJ_ALTO, nivel: 15 }, lugar: { mapa: 1412, x: 5, y: 5, zona: 'Mulgore' }, registro: [{ q: 80000 }, { q: 80010 }],
    planSubida: { actual: { zona: 'Mulgore', saltar: ['Cadena 0-0', 'Cadena 1-2 en solitario'] } } } };
  const qsDeRuta = (r) => new Set(r.guia.pasos.flatMap((p) => p.elementos).filter((e) => e.t === 'accept' || e.t === 'turnin').map((e) => e.q));
  const r = construirRutaZona(b, { zona: 1412, solo: 'registro' }, t, 'es');
  assert.deepEqual([...qsDeRuta(r)], [80010], 'la del registro que la guía manda saltar, fuera; «en solitario» no es un nombre entero');
  const pedida = construirRutaZona(b, { zona: 1412, misiones: ['Cadena 0-0'] }, t, 'es');
  assert.ok(qsDeRuta(pedida).has(80000), 'pedida por su nombre, entra');
});

// ------------------------------------------------------------------------------------------------------------------
// R19 (en el juego, «Elixir de agonía» de Laderas de Trabalomas): un objetivo de objeto sin sitio en la base (sin PNJ
// que lo suelte con spawns ni objeto del mundo: solo vendedor, oficio o nada) va en su propio paso, no en el del sitio
// ------------------------------------------------------------------------------------------------------------------

function baseR19() {
  const raiz = {};
  const texto = 'SNF_MISIONES = {version="t",esquema=1,quest={},npc={},object={},item={},es={quest={},npc={},object={},'
    + 'item={[9702]={name="Objeto dos"},[9703]={name="Objeto tres"}}},zonas={area={},nombre={}},mazmorra={},porFaccion={}}\n'
    + 'local Q = SNF_MISIONES.quest\nlocal N = SNF_MISIONES.npc\nlocal I = SNF_MISIONES.item\n'
    + 'Q[9601]={name="Mezcla",startedBy={{9801}},finishedBy={{9801}},requiredLevel=1,questLevel=2,zoneOrSort=17,'
    + 'objectives={[3]={{9701},{9702},{9703},{9704},{9705},{9706}}}}\n'
    + 'Q[9602]={name="Solo comprar",startedBy={{9801}},finishedBy={{9801}},requiredLevel=1,questLevel=2,zoneOrSort=17,'
    + 'objectives={[3]={{9703}}}}\n'
    + 'N[9801]={name="Boticario",spawns={[1413]={{50,50}}},friendlyToFaction="H"}\n'
    + 'N[9802]={name="Bicho",spawns={[1413]={{20,20}}}}\n'
    + 'N[9803]={name="Tendero",spawns={[1413]={{70,30}}},friendlyToFaction="H"}\n'
    + 'N[9804]={name="Sin sitio"}\n'
    + 'N[9805]={name="Tendero de la Alianza",spawns={[1413]={{10,90}}},friendlyToFaction="A"}\n'
    + 'I[9701]={name="Ojo",npcDrops={9802}}\n'
    + 'I[9702]={name="Item two",vendors={9805,9803}}\n'
    + 'I[9703]={name="Item three"}\n'
    + 'I[9704]={name="Item four",npcDrops={9804}}\n'
    + 'I[9705]={name="Item five",vendors={9805}}\n'
    + 'I[9706]={name="Quest thing",class=12}\n';
  ejecutarDatos(texto, raiz, 'r19.lua');
  return crearBase(raiz.SNF_MISIONES);
}
const r19 = baseR19();
const deComplete = (elementos) => elementos.filter((e) => e.t === 'complete').map((e) => e.objetivo);

test('R19 objetivosSinSitio: los objetivos de objeto sin PNJ con spawns ni objeto del mundo, con sus fuentes', () => {
  const sin = objetivosSinSitio(r19, 9601, ORCO, { mapa: 1413 });
  assert.deepEqual(sin.map((s) => s.objetivo), [2, 3, 4, 5, 6]);
  // 9702: lo vende el tendero de la Horda (con spawns): goto al tendero y «vendedor». El de la Alianza no cuenta.
  assert.deepEqual(sin[0].elementos, [
    { t: 'goto', mapa: 1413, x: 70, y: 30, modo: 'flecha', objetivo: 2 },
    { t: 'complete', q: 9601, objetivo: 2 },
    { t: 'nota', texto: { es: 'Consigue Objeto dos (vendedor)', en: 'Get Item two (vendor)' } },
  ]);
  assert.deepEqual(sin[0].punto, { mapa: 1413, x: 70, y: 30 });
  // 9703: nada en la base; 9704: lo suelta un PNJ sin spawns; 9705: solo un vendedor de la otra facción.
  assert.deepEqual(sin[1].elementos, [
    { t: 'complete', q: 9601, objetivo: 3 },
    { t: 'nota', texto: { es: 'Consigue Objeto tres (subasta)', en: 'Get Item three (auction house)' } },
  ]);
  assert.equal(sin[1].punto, null);
  assert.deepEqual(sin[2].elementos.map((e) => e.t), ['complete', 'nota']);
  assert.deepEqual(sin[3].elementos[1].texto, { es: 'Consigue Item five (subasta)', en: 'Get Item five (auction house)' });
  // 9706: objeto de misión (class 12) sin vendedor: no se puede subastar, la nota no dice fuente.
  assert.deepEqual(sin[4].elementos[1].texto, { es: 'Consigue Quest thing', en: 'Get Quest thing' });
  assert.deepEqual(objetivosSinSitio(r19, 424242, ORCO), [], 'misión que no está en la base');
});

test('R19 pasosDeMision: el paso del sitio solo lleva los complete de lo que se hace allí; cada objeto sin sitio, su paso', () => {
  const partes = pasosDeMision(r19, 9601, ORCO, { mapa: 1413 });
  assert.deepEqual(partes.map((p) => p.parte), ['recoger', 'completar', 'conseguir', 'conseguir', 'conseguir', 'conseguir', 'conseguir', 'entregar']);
  assert.deepEqual(partes[1].elementos, [{ t: 'goto', mapa: 1413, x: 20, y: 20, modo: 'flecha', objetivo: 1 }, { t: 'complete', q: 9601, objetivo: 1 }]);
  assert.deepEqual(partes.slice(2, 7).map((p) => deComplete(p.elementos)), [[2], [3], [4], [5], [6]]);
  assert.equal(partes[3].sinVerificar, undefined, 'sin sitio a propósito: no es un punto que falte');
  // Solo un objeto sin sitio: no hay paso de completar vacío.
  assert.deepEqual(pasosDeMision(r19, 9602, ORCO, { mapa: 1413 }).map((p) => p.parte), ['recoger', 'conseguir', 'entregar']);
});

test('R19 guiaDeRuta: los complete sin sitio no se juntan con el paso del objetivo con punto', () => {
  for (const ordenadas of [ordenarRuta(r19, [9601], ORCO, null, 1413), [9601]]) {
    const guia = guiaDeRuta(r19, 1413, ordenadas, ORCO, 'es', { nombre: { es: 'Prueba', en: 'Test' } });
    const deObjetivo = guia.pasos.filter((p) => p.elementos.some((e) => e.t === 'complete'));
    assert.deepEqual(deObjetivo.map((p) => deComplete(p.elementos)).sort(), [[1], [2], [3], [4], [5], [6]]);
    const delSitio = deObjetivo.find((p) => deComplete(p.elementos)[0] === 1);
    assert.ok(!delSitio.elementos.some((e) => e.t === 'nota'));
    const sinNada = deObjetivo.find((p) => deComplete(p.elementos)[0] === 3);
    assert.ok(!sinNada.elementos.some((e) => e.t === 'goto') && sinNada.elementos.some((e) => e.t === 'nota'));
    // Los objetivos se hacen antes de entregar.
    const entrega = guia.pasos.findIndex((p) => p.elementos.some((e) => e.t === 'turnin'));
    assert.ok(guia.pasos.indexOf(sinNada) < entrega);
  }
});

test('R19 datos reales: en «Elixir de agonía» (515) el ojo va en el paso del sitio y la poción en el suyo', { skip: sinReales }, () => {
  const pj = { faccion: 'Horde', raza: 'Undead', clase: 'WARRIOR', nivel: 30 };
  // Objetivos de 515: 1 = Poción de sangre trol fuerte (3388, sin fuente en la base), 2 = Escama Dagaespinazo, 3 = Ojo
  // de aleta rasgado (3510, lo sueltan los Aleta Rasgada de Trabalomas).
  assert.equal(real.nombre('item', 3510, 'es'), 'Ojo de aleta rasgado');
  const partes = pasosDeMision(real, 515, pj, { mapa: 1424 });
  const completar = partes.find((p) => p.parte === 'completar');
  assert.ok(deComplete(completar.elementos).includes(3), 'el ojo, en el paso del sitio');
  assert.ok(!deComplete(completar.elementos).includes(1), 'la poción, fuera del paso del sitio');
  const conseguir = partes.filter((p) => p.parte === 'conseguir');
  assert.deepEqual(conseguir.map((p) => deComplete(p.elementos)), [[1]]);
  assert.deepEqual(conseguir[0].elementos.find((e) => e.t === 'nota').texto,
    { es: `Consigue ${real.nombre('item', 3388, 'es')} (subasta)`, en: "Get Strong Troll's Blood Potion (auction house)" });
  const guia = guiaDeRuta(real, 1424, ordenarRuta(real, [515], pj, null, 1424), pj, 'es');
  const delOjo = guia.pasos.find((p) => p.elementos.some((e) => e.t === 'complete' && e.objetivo === 3));
  assert.ok(!delOjo.elementos.some((e) => e.t === 'complete' && e.objetivo === 1));
});
