// Lote C, ronda 1 (duda 7): los datos nuevos no mueven ningún id de paso de las guías laterales sin avisar. Los ids de
// la 2026.11.10.8 (fixtures/ids-laterales-2026.11.10.8.json) tienen que salir iguales, por guía y en orden, en los
// datos de addons/SnetForever_Misiones/guias_1.lua. El lote C añadió el goto y el collect a 37 pasos de recoger sin
// cambiar su id (pasos.js, `elementosId`), así las marcas guardadas de esos pasos siguen casando.
// Si un cambio de verdad de una guía mueve ids, hay que rehacer el fixture a sabiendas y decirlo en el informe.
// Lote H: rehecho con los datos 2026.11.11.1 (QuestieDB 1.0.14). Cambian ids en 24 de las 71 guías, por la base (puntos,
// misiones nuevas en las mazmorras, la cadena del saco) y por dejar de pedir previas «una» que ya están en la cadena;
// el detalle está en lote-h-report.md. El de la 2026.11.10.8 se queda en fixtures/, como referencia.
// Ronda 1: rehecho con los datos 2026.11.11.2 (lista negra de Questie, otras temporadas sin dador con punto y el chamán
// Skyborne de la Horda): cambian 16 guías (lote-h-report.md, «Ronda 1»). El de la 2026.11.11.1 también se queda.
// 11-nov: rehecho con los datos 2026.11.11.6 (fuera las otras temporadas sin prueba del juego): solo cambia la guía de
// Blackrock Depths de la Alianza, que pierde los 3 pasos de la 81790; los demás ids, iguales y en el mismo orden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const GUIAS = join(AQUI, '..', '..', '..', 'addons', 'SnetForever_Misiones', 'guias_1.lua');
const TOC = join(dirname(GUIAS), 'SnetForever_Misiones.toc');
// Pin the IDs already checked in for the current data version. Keep older fixtures for historical comparisons.
const VERSION = '2026.11.13.1';
const EXPECTED = JSON.parse(readFileSync(join(AQUI, 'fixtures', `ids-laterales-${VERSION}.json`), 'utf8'));
const opciones = { skip: !existsSync(GUIAS) && 'faltan los datos generados' };

function idsDe(texto) {
  const salida = {};
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^T\["(.+?)"\]=/.exec(linea);
    if (m) salida[m[1].replace(/\\\\/g, '\\')] = [...linea.matchAll(/\{id="([0-9a-f-]+)",n=\d+/g)].map((x) => x[1]);
  }
  return salida;
}

test('all side-guide step IDs match the fixture for the checked-in data version', opciones, () => {
  const manifestVersion = /^## Version: (\S+)$/m.exec(readFileSync(TOC, 'utf8'))?.[1];
  const actual = idsDe(readFileSync(GUIAS, 'utf8'));
  assert.equal(manifestVersion, VERSION);
  assert.equal(EXPECTED.version, VERSION);
  assert.equal(Object.keys(EXPECTED.guias).length, 71);
  assert.equal(Object.values(EXPECTED.guias).reduce((count, ids) => count + ids.length, 0), 1800);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(EXPECTED.guias).sort());
  const changed = Object.keys(EXPECTED.guias).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(EXPECTED.guias[key]));
  assert.deepEqual(changed, []);
});
