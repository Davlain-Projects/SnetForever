// Pruebas del español de QuestieDB (esES con esMX de respaldo).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { leerToc } from '../src/questie/toc.js';
import { valorCbor } from '../src/questie/cbor.js';
import { leerEspanol, alineacionEsESMX } from '../src/questie/idioma.js';
import { leerEntidades } from '../src/questie/entidades.js';
import { rutaQuestieToc } from '../src/config.js';

const ruta = rutaQuestieToc();
const hay = existsSync(ruta);

describe('versión de idioma', () => {
  test('una versión distinta de "1" da error claro', () => {
    const falso = new Map([['X-l10n-Version', '2']]);
    assert.throws(() => leerEspanol(falso), /X-l10n-Version/);
  });
  test('sin versión da error claro', () => {
    assert.throws(() => leerEspanol(new Map()), /X-l10n-Version/);
  });
});

describe('español real', { skip: !hay }, () => {
  let toc;
  let es;
  before(() => {
    toc = leerToc(ruta);
    es = leerEspanol(toc);
  });

  test('misión 4641: nombre en español', () => {
    assert.equal(es.quest.get(4641).name, 'Tu lugar en el mundo');
  });

  test('misión 92460: esES gana a esMX', () => {
    assert.equal(es.quest.get(92460).name, 'Edad adulta');
  });

  test('un objeto solo en esMX coge el nombre de esMX', () => {
    const ids = valorCbor(toc, 'X-Object-IDS', { zlib: true });
    const dec = new TextDecoder();
    const col = (loc) => valorCbor(toc, `X-l10n-${loc}-Object`, { zlib: true })?.[0] ?? [];
    const mx = col('esMX');
    const ee = col('esES');
    // Ronda 1 del lote B: una columna con huecos llega como mapa con las claves de Lua (desde 1); sin huecos, como array.
    const enCol = (columna, i) => (Array.isArray(columna) ? columna[i] : columna?.[i + 1]);
    let k = -1;
    for (let i = 0; i < mx.length; i++) {
      if (enCol(mx, i) != null && enCol(ee, i) == null) { k = i; break; }
    }
    assert.ok(k >= 0, 'debe existir un objeto solo en esMX');
    const id = ids[k];
    assert.equal(es.object.get(id).name, dec.decode(enCol(mx, k)));
  });

  test('objectivesText es una lista de líneas de texto', () => {
    let visto = 0;
    for (const [, q] of es.quest) {
      if (q.objectivesText === undefined) continue;
      assert.ok(Array.isArray(q.objectivesText));
      for (const l of q.objectivesText) assert.equal(typeof l, 'string');
      visto++;
    }
    assert.ok(visto > 0);
  });

  test('solo hay IDs con algún campo traducido y sin valores vacíos', () => {
    for (const tipo of ['quest', 'npc', 'object', 'item']) {
      assert.ok(es[tipo].size > 0, tipo);
      for (const [, campos] of es[tipo]) {
        const claves = Object.keys(campos);
        assert.ok(claves.length > 0);
        for (const c of claves) {
          assert.notEqual(campos[c], null);
          assert.notEqual(campos[c], '');
        }
      }
    }
  });

  test('los PNJ traen subName cuando lo hay', () => {
    let conSub = 0;
    for (const [, n] of es.npc) if (typeof n.subName === 'string') conSub++;
    assert.ok(conSub > 0);
  });

  // ---- Ronda 1 del lote B (Minor 1): el español iba corrido un id en las columnas con huecos ----
  test('objetos: cada id lleva su nombre (32 «Sunken Chest», 33 «Locked Chest», 415106 «Burned-Out Remains»)', () => {
    assert.equal(es.object.get(31).name, 'Estatua de león antigua');
    assert.equal(es.object.get(32).name, 'Cofre sumergido');
    assert.equal(es.object.get(33).name, 'Cofre cerrado');
    assert.equal(es.object.get(415106).name, 'Restos quemados');
  });

  test('PNJ: el subName va con su PNJ (54 «Weaponsmith», 66 «Trade Supplies»; 55 y 68 no tienen)', () => {
    const sinDuros = (t) => t?.replace(/\u00a0/g, ' '); // QuestieDB escribe estos con espacios duros (U+00A0)
    assert.equal(sinDuros(es.npc.get(54).subName), 'Forjador de armas');
    assert.equal(es.npc.get(55)?.subName, undefined);
    assert.equal(sinDuros(es.npc.get(66).subName), 'Suministros comerciales');
    assert.equal(es.npc.get(68)?.subName, undefined);
  });

  test('validación general: en cada columna, esES y esMX dicen lo mismo en casi todos los id que traen los dos', () => {
    const r = alineacionEsESMX(toc);
    // Los dos dialectos no coinciden siempre (las misiones, un 79 %; los objetivos, un 49 %), pero una columna corrida un
    // id se queda en lo que da comparar con el id siguiente (del 0 al 22 %): se pide al menos 30 puntos más que eso.
    const pct = (x) => `${(100 * x).toFixed(1)} %`;
    for (const fila of r) {
      console.log(`  ${fila.tipo}.${fila.campo}: ${fila.iguales} de ${fila.comunes} iguales (${pct(fila.proporcion)}; corrida: ${pct(fila.corrida)})`);
      assert.ok(fila.comunes > 0, `${fila.tipo}.${fila.campo}: ningún id con los dos idiomas`);
      assert.ok(fila.proporcion >= 0.3 && fila.proporcion - fila.corrida >= 0.3,
        `${fila.tipo}.${fila.campo}: ${pct(fila.proporcion)} iguales frente a ${pct(fila.corrida)} con el id siguiente (¿columna corrida?)`);
    }
  });

  test('validación general: ningún nombre español se repite en dos id seguidos con el inglés distinto (más de lo normal)', () => {
    const en = leerEntidades(ruta);
    for (const tipo of ['object', 'npc', 'item', 'quest']) {
      const ids = [...en[tipo].keys()].sort((a, b) => a - b);
      let repetidos = 0;
      for (let i = 1; i < ids.length; i++) {
        const a = es[tipo].get(ids[i - 1])?.name;
        const b = es[tipo].get(ids[i])?.name;
        if (a && a === b && en[tipo].get(ids[i - 1])?.name !== en[tipo].get(ids[i])?.name) repetidos++;
      }
      console.log(`  ${tipo}: ${repetidos} nombres españoles repetidos en ids seguidos con el inglés distinto`);
      assert.ok(repetidos <= 0.01 * ids.length, `${tipo}: ${repetidos} de ${ids.length}`);
    }
  });
});
