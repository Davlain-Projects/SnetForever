// Lote H, ronda 2 (rerrevisión, punto 1 y menor 4): sobre los datos escritos (addons/SnetForever_Misiones, en git; solo
// cambian al regenerar), qué misiones de la lista negra de Questie hay y cuáles no.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerEventos, leerListaNegra } from '../src/questie/lista-negra.js';
import { leerToc } from '../src/questie/toc.js';
import { valorCbor } from '../src/questie/cbor.js';
import { ORIGEN, rutaQuestieToc } from '../src/config.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR = join(AQUI, '..', '..', '..', 'addons', 'SnetForever_Misiones');
const dirQuestie = join(ORIGEN, 'Questie');
const opciones = {
  skip: !(existsSync(join(DIR, 'quest_1.lua')) && existsSync(dirQuestie) && existsSync(rutaQuestieToc()))
    && 'faltan los datos, Questie o la base',
};

// Las misiones escritas: las claves `T[id]=` de los quest_*.lua.
function escritas() {
  const ids = new Set();
  for (const f of readdirSync(DIR).filter((x) => /^quest_\d+\.lua$/.test(x))) {
    for (const m of readFileSync(join(DIR, f), 'utf8').matchAll(/^T\[(\d+)\]=/gm)) ids.add(Number(m[1]));
  }
  return ids;
}

test('la 60860 (promoción de Asia) no está; la 615 (sale en RXP) y la 8619 (Festival Lunar) sí', opciones, () => {
  const q = escritas();
  assert.equal(q.has(60860), false);
  assert.ok(q.has(615), 'la 615 se queda: sale en RXPGuides');
  assert.ok(q.has(8619), 'la 8619 se queda: la destapa el Festival Lunar');
  assert.ok(q.size > 5000, `${q.size}`);
});

// Las de evento están en los datos, pero ninguna guía lateral (cadenas, mejoras, mazmorras) ni ningún aviso de nivel
// (SNF_RUTAS.avisos, que lee motor/avisos.lua) las usa: una misión de temporada no se propone ni se avisa por nivel.
test('ninguna guía lateral ni ningún aviso de nivel usa una misión que destapa un evento', opciones, () => {
  const eventos = leerEventos(dirQuestie);
  const laterales = readFileSync(join(DIR, 'guias_1.lua'), 'utf8');
  const enGuias = [...laterales.matchAll(/\bq=(\d+)/g)].map((m) => Number(m[1])).filter((q) => eventos.has(q));
  assert.deepEqual([...new Set(enGuias)], []);
  const nucleo = readFileSync(join(DIR, '..', 'SnetForever_Rutas', 'nucleo.lua'), 'utf8');
  const avisos = nucleo.slice(nucleo.indexOf('avisos={'));
  assert.ok(avisos.length > 100, 'no encuentro los avisos en SnetForever_Rutas/nucleo.lua');
  const numeros = [...avisos.matchAll(/\b(\d{3,6})\b/g)].map((m) => Number(m[1])).filter((q) => eventos.has(q));
  assert.deepEqual([...new Set(numeros)], [], 'ningún número de los avisos es una misión de evento');
});

test('de la lista negra solo quedan la 615 (RXP) y las que destapa un evento; la Feria de la Luna Negra, no', opciones, () => {
  const q = escritas();
  const enBase = new Set(valorCbor(leerToc(rutaQuestieToc()), 'X-Quest-IDS', { zlib: true }));
  const eventos = leerEventos(dirQuestie);
  const negra = [...leerListaNegra(dirQuestie).keys()].filter((id) => enBase.has(id));
  const quedan = negra.filter((id) => q.has(id)).sort((a, b) => a - b);
  const esperadas = negra.filter((id) => id === 615 || eventos.has(id)).sort((a, b) => a - b);
  assert.deepEqual(quedan, esperadas);
  assert.ok(esperadas.length > 100, `${esperadas.length}`);
  assert.equal(quedan.some((id) => eventos.get(id) === 'Darkmoon Faire'), false);
});
