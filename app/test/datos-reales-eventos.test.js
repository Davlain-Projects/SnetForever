// Lote eventos, con los datos reales (addons/SnetForever_Misiones, 2026.11.11.4 en adelante): cada misión de fiesta
// lleva `evento` y la app la deja fuera de las rutas de zona y la marca en el contexto de la IA. Con los 2026.11.11.3, las
// 14 de Children's Week (QuestSort -284, el de misiones normales) entraban en las rutas de Orgrimmar y Ventormenta de un
// personaje de nivel 60, y las de -22 salían como «Seasonal».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase, entradas, elemento } from '../src/base/base.mjs';
import { prepararTurno } from '../src/contexto.mjs';
import { misionesDeZona } from '../src/rutaZona.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const REALES = join(AQUI, '..', '..', 'addons', 'SnetForever_Misiones');
const opciones = { skip: !existsSync(join(REALES, 'nucleo.lua')) && 'faltan los datos reales', timeout: 300000 };

// Los de nivel 60 de las dos facciones: las de Children's Week son de questLevel 60 (no entran antes del 55).
const PJS = [
  { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 60 },
  { faccion: 'Alliance', raza: 'Human', clase: 'WARRIOR', nivel: 60 },
  { faccion: 'Horde', raza: 'Troll', clase: 'SHAMAN', nivel: 35 },
  { faccion: 'Alliance', raza: 'NightElf', clase: 'DRUID', nivel: 48 },
];

let base;
const real = () => (base ??= cargarBase(REALES));
const ids = (v) => entradas(v).map(([, x]) => x).filter((x) => typeof x === 'number');
// Los uiMap donde se recoge: los de los PNJ y objetos que la dan (las de QuestSort negativo son de la zona por ellos).
function mapasDeQuienLaDa(b, m) {
  const mapas = new Set();
  for (const [k, tipo] of [[1, 'npc'], [2, 'objeto']]) {
    for (const id of ids(elemento(m.startedBy, k))) {
      for (const [ui] of entradas(b[tipo](id)?.spawns)) mapas.add(Number(ui));
    }
  }
  return [...mapas];
}
// ¿Entra la misión q en la ruta de alguno de los mapas donde se recoge, con alguno de los personajes?
function entraEnAlgunaRuta(b, q) {
  const m = b.mision(q);
  return mapasDeQuienLaDa(b, m).some((ui) => PJS.some((pj) => misionesDeZona(b, ui, pj, {}).some((x) => x.q === q)));
}
const conEvento = (b, nombre) => entradas(b.datos.quest).filter(([, m]) => m.evento === nombre).map(([q]) => q);

test('datos reales: las 14 de Children\'s Week llevan su evento y no salen en ninguna ruta de su zona', opciones, () => {
  const b = real();
  const cw = conEvento(b, "Children's Week");
  assert.equal(cw.length, 14);
  for (const q of cw) {
    assert.equal(b.mision(q).zoneOrSort, -284, `${q}`);
    assert.ok(mapasDeQuienLaDa(b, b.mision(q)).length > 0, `${q} sin sitio donde se recoge`);
    assert.equal(entraEnAlgunaRuta(b, q), false, `${q} sale en una ruta de zona`);
  }
});

test('datos reales: las normales de -284 no llevan evento y siguen en las rutas de zona', opciones, () => {
  const b = real();
  const normales = entradas(b.datos.quest).filter(([, m]) => m.zoneOrSort === -284 && m.evento === undefined).map(([q]) => q);
  // 43 hasta los datos 2026.11.11.5: 39 eran de otras temporadas (60000-89999) y salen desde la 2026.11.11.6
  assert.equal(normales.length, 4);
  // 12-nov: las repetibles (CLUCK! y WRIGGLE., las de la mascota) ya no entran en las rutas de zona, a propósito.
  const repetibles = normales.filter((q) => (b.mision(q)?.specialFlags ?? 0) % 2 === 1);
  assert.deepEqual(repetibles.sort((a, c) => a - c), [3861, 97583]);
  assert.deepEqual(normales.filter((q) => !repetibles.includes(q) && !entraEnAlgunaRuta(b, q)), []);
});

test('datos reales: en el contexto de la IA, la de Children\'s Week y la de Winter Veil llevan el nombre de su fiesta', opciones, () => {
  const b = real();
  const [cw] = conEvento(b, "Children's Week");
  const [invierno] = conEvento(b, 'Winter Veil');
  assert.equal(b.mision(invierno).zoneOrSort, -22, 'la de Winter Veil es de SEASONAL');
  const d = prepararTurno(b, {
    v: 1, id: 'e1-1', pj: 'Prueba-Reino', idioma: 'es', modelo: 'haiku', texto: 'hola',
    ctx: {
      pj: { nivel: 60, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, xp: 0, xpMax: 0, dinero: 0 },
      lugar: { mapa: 1454, zona: 'Orgrimmar', instancia: false },
      registro: [], prof: [], guias: [], cadenas: [], mazmorras: [],
    },
    refs: { q: [cw, invierno] },
  }).datos;
  assert.deepEqual(d.mencionadas.map((m) => [m.q, m.evento]), [[cw, "Children's Week"], [invierno, 'Winter Veil']]);
  // Ninguna de las 74 de -22 sale ya como «Seasonal»: todas tienen su fiesta en los datos.
  const seasonal = entradas(b.datos.quest).filter(([, m]) => m.zoneOrSort === -22);
  assert.equal(seasonal.length, 74);
  assert.deepEqual(seasonal.filter(([, m]) => typeof m.evento !== 'string').map(([q]) => q), []);
});
