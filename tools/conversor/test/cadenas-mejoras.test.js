// Pruebas del lote «Cadenas de mejoras»: el resolvedor con enlaces por objeto y el universo de las mejoras, las previas
// deducidas por objeto compartido de la vista, los pasos sobre objetos, las guías de mejora con sus avisos y el
// detector de candidatas. Mundo de prueba: la cadena del saco de dormir en miniatura (dos inicios espejo que se llaman
// igual y forman un ciclo, separados por la máscara de raza) y, aparte, los datos reales de QuestieDB.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fuentesDePrueba, vistaDePrueba } from './ayuda/vista.js';
import { resolverVariante, universoDeMejora } from '../src/cadenas/resolver.js';
import { pasosDeMision } from '../src/generar/pasos.js';
import { guiasDeMejoras, combateDe, nivelDeAviso } from '../src/cadenas/guias-mejoras.js';
import { MEJORAS } from '../src/cadenas/mejoras.js';
import { VERIFICADAS } from '../src/cadenas/verificadas.js';
import { evaluarFiltro } from '../src/rxp/filtros.js';
import { detectarMejoras, informeDeMejoras, tipoDeMejora } from '../src/cadenas/detector.js';
import { cargarFuentes, vistaDe } from '../src/cadenas/fuentes.js';
import { RAZAS_DE } from '../src/questie/vista.js';
import { validarLaterales } from '../src/validar.js';
import { rutaQuestieToc } from '../src/config.js';

const BASE = { base: 'QuestieDB', version: 'prueba', commit: 'abc' };
const RAIZ_CONVERSOR = join(dirname(fileURLToPath(import.meta.url)), '..');
// Máscaras: Horda (orco, no-muerto, tauren, trol y Skyborne de la Horda) y Alianza (humano, enano, elfo de la noche,
// gnomo y Skyborne de la Alianza), como las de 79007 y 79008.
const HORDA = 2 ** 33 + 2 + 16 + 32 + 128;
const ALIANZA = 2 ** 32 + 1 + 4 + 8 + 64;

const q = (name, extra = {}) => ({
  name, requiredLevel: 14, questLevel: 22, requiredRaces: 0, requiredClasses: 0, zoneOrSort: 0, ...extra,
});
const obj = (name, area, x, y) => ({ name, spawns: { [area]: [[x, y]] } });

// El saco en miniatura: 10 (Horda) y 11 (Alianza) se llaman igual y cada una se entrega donde empieza la otra.
const MUNDO = {
  misiones: {
    10: q('... and that note you found', { requiredRaces: HORDA, startedBy: [null, [101]], finishedBy: [null, [102, 103]] }),
    11: q('... and that note you found', { requiredRaces: ALIANZA, startedBy: [null, [102]], finishedBy: [null, [101, 104]] }),
    12: q('Stepping Stones', { startedBy: [null, [101, 102, 104, 103]], finishedBy: [null, [105]] }),
    13: q('Scramble', { startedBy: [null, [105]], finishedBy: [null, [106]] }),
    14: q('This Must Be The Place', { startedBy: [null, [106]], finishedBy: [null, [107]] }),
    // Una de clase con el mismo nombre que un paso: no es del universo de las mejoras.
    15: q('Scramble', { requiredClasses: 1, startedBy: [null, [105]], finishedBy: [null, [106]] }),
  },
  objetos: {
    101: obj('Burned-Out Remains', 1413, 46.35, 73.89),
    102: obj('Burned-Out Remains', 1436, 37.41, 50.7),
    103: obj('Nailed Plank', 1436, 37.43, 50.86),
    104: obj('Nailed Plank', 1413, 46.37, 73.79),
    105: obj('Pocket Litter', 1442, 40.77, 52.57),
    106: obj('Mound of Dirt', 1442, 39.62, 49.86),
    107: obj('Hastily Rolled-Up Satchel', 1417, 22.47, 24.2),
  },
  items: {
    // Como el 211527 de la base: trae un vendedor, aunque en el Forever no lo vende nadie (el jugador, 10-nov).
    900: { name: 'Cozy Sleeping Bag', class: 15, subClass: 0, flags: 0, questRewards: [14], vendors: [5] },
    901: { name: 'Old Toolbox', class: 1, subClass: 0, flags: 0, questRewards: [12] },
  },
};
const PASOS = ['... and that note you found', 'Stepping Stones', 'Scramble', 'This Must Be The Place'];
const ids = (r) => r.misiones.map((x) => x.q);
const origenes = (r) => r.misiones.map((x) => x.origen);

describe('resolver: universo de las mejoras y enlaces por objeto', () => {
  test('universoDeMejora deja fuera las misiones de clase (por requiredClasses o por su QuestSort)', () => {
    const v = vistaDePrueba({ ...MUNDO, misiones: { ...MUNDO.misiones, 16: q('Druida', { zoneOrSort: -263 }) }, faccion: 'Horde' });
    assert.deepEqual([...universoDeMejora(v).keys()].sort((a, b) => a - b), [10, 11, 12, 13, 14]);
  });

  test('la Horda empieza por la suya (la máscara desempata los dos inicios) y une por objeto', () => {
    const v = vistaDePrueba({ ...MUNDO, faccion: 'Horde' });
    for (const raza of ['Orc', 'Skyborne']) {
      const r = resolverVariante(v, { universo: 'mejora', raza, pasos: PASOS });
      assert.equal(r.ok, true, r.motivo);
      assert.deepEqual(ids(r), [10, 12, 13, 14]);
      assert.deepEqual(origenes(r), ['inicio', 'objeto', 'objeto', 'objeto']);
    }
  });

  test('la Alianza, con su espejo', () => {
    const v = vistaDePrueba({ ...MUNDO, faccion: 'Alliance' });
    for (const raza of ['Human', 'Skyborne']) {
      const r = resolverVariante(v, { universo: 'mejora', raza, pasos: PASOS });
      assert.equal(r.ok, true, r.motivo);
      assert.deepEqual(ids(r), [11, 12, 13, 14]);
    }
  });

  test('sin universo, la clase sigue siendo obligatoria; un universo desconocido lanza', () => {
    const v = vistaDePrueba({ ...MUNDO, faccion: 'Horde' });
    assert.throws(() => resolverVariante(v, { raza: 'Orc', pasos: PASOS }), /clase/);
    assert.throws(() => resolverVariante(v, { universo: 'otro', raza: 'Orc', pasos: PASOS }), /universo/);
  });

  test('el objeto no une con una misión que ya tiene previas por enlace (manda el enlace)', () => {
    const v = vistaDePrueba({
      ...MUNDO,
      // La previa tiene que ser de la Horda (una de la Alianza no está en su grafo).
      misiones: { ...MUNDO.misiones, 16: q('Otra'), 13: { ...MUNDO.misiones[13], preQuestSingle: [16] } },
      faccion: 'Horde',
    });
    const r = resolverVariante(v, { universo: 'mejora', raza: 'Orc', pasos: PASOS });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /se corta en "Scramble"/);
  });
});

describe('vista: previas deducidas por objeto compartido', () => {
  test('ronda 1 (M1): un objeto «buzón» (más de 3 misiones de la raza se entregan o empiezan en él) no deduce nada', () => {
    // Como el «Dead Drop»: cuatro misiones pasan por el objeto 7 (1 y 3 se entregan; 2 y 4 empiezan y se entregan).
    const v = vistaDePrueba({
      misiones: {
        1: q('Uno', { startedBy: [[50]], finishedBy: [null, [7]] }),
        2: q('Dos', { startedBy: [null, [7]], finishedBy: [null, [7]] }),
        3: q('Tres', { startedBy: [[51]], finishedBy: [null, [7]] }),
        4: q('Cuatro', { startedBy: [null, [7]], finishedBy: [null, [7]] }),
      },
      faccion: 'Horde',
    });
    assert.deepEqual(v.previasPorObjeto(2, 'Orc'), []);
    // Con 3 (como «Shards of Myzrael»: la que llega, la que sale y la vuelta de la cadena), sí.
    const w = vistaDePrueba({
      misiones: {
        1: q('Uno', { startedBy: [[50]], finishedBy: [null, [7]] }),
        2: q('Dos', { startedBy: [null, [7]], finishedBy: [[51]], nextQuestInChain: 3 }),
        3: q('Tres', { startedBy: [[51]], finishedBy: [null, [7]], preQuestSingle: [2] }),
      },
      faccion: 'Horde',
    });
    assert.deepEqual(w.previasPorObjeto(2, 'Orc'), [1]);
  });

  test('ronda 1 (M1): no se deduce una previa que nadie da (sin startedBy)', () => {
    const v = vistaDePrueba({
      misiones: {
        1: q('Sin dador', { finishedBy: [null, [7]] }),
        2: q('Dos', { startedBy: [null, [7]] }),
        3: q('Con ítem', { startedBy: [null, null, [900]], finishedBy: [null, [8]] }),
        4: q('Cuatro', { startedBy: [null, [8]] }),
      },
      faccion: 'Horde',
    });
    assert.deepEqual(v.previasPorObjeto(2, 'Orc'), []);
    assert.deepEqual(v.previasPorObjeto(4, 'Orc'), [3], 'la que empieza con un ítem sí tiene quien la dé');
  });

  test('con la máscara de cada misión: la Horda ve 10 antes de 12 y la Alianza, 11', () => {
    const h = vistaDePrueba({ ...MUNDO, faccion: 'Horde' });
    const a = vistaDePrueba({ ...MUNDO, faccion: 'Alliance' });
    assert.deepEqual(h.previasPorObjeto(12, 'Orc'), [10]);
    assert.deepEqual(a.previasPorObjeto(12, 'Human'), [11]);
    assert.deepEqual(h.previasPorObjeto(13, 'Orc'), [12]);
    // 10 empieza donde se entrega 11, pero 11 no es de la Horda: no hay previa (ni ciclo).
    assert.deepEqual(h.previasPorObjeto(10, 'Orc'), []);
  });

  test('un ciclo de dos para la misma raza no deduce nada, y una misión con previas declaradas tampoco', () => {
    const v = vistaDePrueba({
      misiones: {
        1: q('X', { startedBy: [null, [5]], finishedBy: [null, [6]] }),
        2: q('Y', { startedBy: [null, [6]], finishedBy: [null, [5]] }),
        3: q('Z', { startedBy: [null, [6]], preQuestSingle: [1] }),
        4: q('W', { nextQuestInChain: 7, finishedBy: [null, [8]] }),
        7: q('V', { startedBy: [null, [8]] }),
      },
      faccion: 'Horde',
    });
    assert.deepEqual(v.previasPorObjeto(1, 'Orc'), []);
    assert.deepEqual(v.previasPorObjeto(2, 'Orc'), []);
    assert.deepEqual(v.previasPorObjeto(3, 'Orc'), []);
    // 7 ya tiene anterior por nextQuestInChain: manda el enlace.
    assert.deepEqual(v.previasPorObjeto(7, 'Orc'), []);
  });

  test('un ciclo largo con enlaces de la base no deduce nada: la que se entrega en la tumba depende de la que empieza en ella', () => {
    // Como «The Weathered Grave» (225) y «A Daughter's Love» (231) en Duskwood: 231 se entrega en la tumba que da 225,
    // pero 231 va después de 225 por los enlaces de la base (225 → 227 → 231). Deducir 231 → 225 cerraría un ciclo.
    const v = vistaDePrueba({
      misiones: {
        225: q('The Weathered Grave', { startedBy: [null, [61]], finishedBy: [[268]], nextQuestInChain: 227 }),
        227: q('Morgan Ladimore', { startedBy: [[268]], finishedBy: [[264]], preQuestSingle: [225], nextQuestInChain: 231 }),
        231: q("A Daughter's Love", { startedBy: [[576]], finishedBy: [null, [61]] }),
      },
      faccion: 'Alliance',
    });
    assert.deepEqual(v.previasPorObjeto(225, 'Human'), []);
  });
});

describe('pasos sobre objetos', () => {
  test('con objetos: el accept y el turnin llevan el objeto, y el dador preferido manda sobre el orden', () => {
    const v = vistaDePrueba({ ...MUNDO, faccion: 'Horde' });
    // 12 empieza en 101 (Los Baldíos), 102, 104 y 103; tras entregar 10 en 102/103 se recoge en Páramos de Poniente.
    const pasos = pasosDeMision(v, 12, { objetos: true, dadores: [102, 103] });
    const recoger = pasos[0].elementos;
    assert.deepEqual(recoger, [
      { t: 'goto', mapa: 1436, x: 37.41, y: 50.7, modo: 'flecha' },
      { t: 'accept', q: 12, objeto: 102 },
    ]);
    const entregar = pasos[pasos.length - 1].elementos;
    assert.deepEqual(entregar, [
      { t: 'goto', mapa: 1442, x: 40.77, y: 52.57, modo: 'flecha' },
      { t: 'turnin', q: 12, objeto: 105 },
    ]);
  });

  test('sin la opción, los pasos no cambian (las guías de clase y de mazmorra siguen igual)', () => {
    const v = vistaDePrueba({ ...MUNDO, faccion: 'Horde' });
    const pasos = pasosDeMision(v, 12);
    assert.deepEqual(pasos[0].elementos, [
      { t: 'goto', mapa: 1413, x: 46.35, y: 73.89, modo: 'flecha' },
      { t: 'accept', q: 12 },
    ]);
  });
});

// Catálogo de prueba con la forma del real (solo nombres).
const CATALOGO_PRUEBA = [{
  id: 'mejora-saco-dormir',
  nivel: 14,
  titulo: { es: 'Mejora: Saco de dormir acogedor', en: 'Upgrade: Cozy Sleeping Bag' },
  recompensa: 'Cozy Sleeping Bag',
  beneficio: { es: 'Te acuestas.', en: 'You lie down.', fuente: 'jugador' },
  soloConLaCadena: true,
  variantes: [
    { faccion: 'Horde', razas: ['Orc', 'Scourge', 'Tauren', 'Troll', 'Skyborne'], pasos: PASOS },
    { faccion: 'Alliance', razas: ['Human', 'Dwarf', 'NightElf', 'Gnome', 'Skyborne'], pasos: PASOS },
  ],
}];

describe('ronda 2: nivel del aviso según haya combate', () => {
  const m = (extra) => ({ requiredLevel: 10, questLevel: 20, objectives: [], ...extra });
  const vista = vistaDePrueba({
    pnjs: { 1: { name: 'Lobo', rank: 0 }, 2: { name: 'Jefe', rank: 1 } },
    items: { 7: { name: 'Pata', npcDrops: [1] }, 8: { name: 'Caja', objectDrops: [3] }, 9: { name: 'Raro' } },
    faccion: 'Horde',
  });
  test('sin combate: el requiredLevel más alto', () => {
    assert.deepEqual(combateDe([m({}), m({ objectives: [null, [[3]]] }), m({ objectives: [null, null, [[8]]] })], vista),
      { combate: false, dudosas: [] });
    assert.equal(nivelDeAviso([m({}), m({ requiredLevel: 12 })], false), 12);
  });
  test('con combate (matar, crédito de muerte u objetos que suelta una criatura): questLevel más alto − 2', () => {
    for (const o of [[[[1]]], [null, null, null, null, [[[1]]]], [null, null, [[7]]]]) {
      assert.equal(combateDe([m({ objectives: o })], vista).combate, true, JSON.stringify(o));
    }
    assert.equal(combateDe([m({ objectives: [[[2]]] })], vista).combate, true);
    assert.equal(nivelDeAviso([m({}), m({ requiredLevel: 12 })], true), 18);
  });
  test('un objeto que no se sabe de dónde sale: el lado prudente (con combate) y se apunta la misión', () => {
    const r = combateDe([{ ...m({ objectives: [null, null, [[9]]] }), id: 44 }], vista);
    assert.deepEqual(r, { combate: true, dudosas: [44] });
  });
});

describe('ronda 1 (M3): el término «x:» de los filtros', () => {
  test('evaluarFiltro entiende «x:mejora» igual que el addon; un «x:» desconocido no se cumple', () => {
    const pj = { clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', nivel: 14 };
    assert.equal(evaluarFiltro([['r:Orc', 'x:mejora']], pj), true);
    assert.equal(evaluarFiltro([['r:Orc', 'x:otra']], pj), false);
    assert.equal(evaluarFiltro([['!x:mejora']], pj), false);
  });
});

describe('catálogo de mejoras', () => {
  const numeros = (valor, ruta = []) => {
    if (typeof valor === 'number') return [{ ruta, valor }];
    if (valor === null || typeof valor !== 'object') return [];
    return Object.entries(valor).flatMap(([k, v]) => numeros(v, [...ruta, k]));
  };
  const textos = (valor) => {
    if (typeof valor === 'string') return [valor];
    if (valor === null || typeof valor !== 'object') return [];
    return Object.values(valor).flatMap(textos);
  };

  test('ninguna ID a mano: ningún número ≥ 2 salvo el nivel, ni de 2 cifras en los textos propios', () => {
    for (const { ruta, valor } of numeros(MEJORAS)) {
      if (ruta.length === 2 && ruta[1] === 'nivel') {
        assert.ok(Number.isInteger(valor) && valor >= 1 && valor <= 60, `nivel ${valor}`);
        continue;
      }
      assert.ok(valor < 2, `número ${valor} en ${ruta.join('.')}`);
    }
    // Los nombres de la base (pasos y recompensa, como «Buzzbox 827») los comprueba el resolvedor contra la base; los
    // textos propios (id, título y beneficio) no llevan números de 2 cifras.
    for (const m of MEJORAS) {
      for (const t of [m.id, ...textos(m.titulo ?? {}), ...textos(m.beneficio ?? {})]) {
        assert.doesNotMatch(t, /\d{2,}/, `número de 2 cifras o más en «${t}»`);
      }
    }
  });

  test('cada mejora: id, recompensa, título y beneficio (si van) en los dos idiomas y variantes por facción', () => {
    const vistos = new Set();
    for (const m of MEJORAS) {
      assert.match(m.id, /^mejora(-[a-z]+)+$/);
      assert.ok(!vistos.has(m.id));
      vistos.add(m.id);
      for (const campo of ['titulo', 'beneficio']) if (m[campo]) assert.ok(m[campo].es && m[campo].en, `${m.id}.${campo}`);
      if (m.beneficio) assert.equal(m.beneficio.fuente, 'jugador');
      assert.equal(typeof m.recompensa, 'string');
      for (const v of m.variantes) assert.ok(['Horde', 'Alliance'].includes(v.faccion), `${m.id}: variante sin facción`);
    }
    const saco = MEJORAS.find((m) => m.id === 'mejora-saco-dormir');
    assert.deepEqual(saco.titulo, { es: 'Mejora: Saco de dormir acogedor', en: 'Upgrade: Cozy Sleeping Bag' });
    assert.equal(saco.nivel, 14);
  });
});

describe('guiasDeMejoras', () => {
  const fuentes = fuentesDePrueba(MUNDO);
  const r = guiasDeMejoras(CATALOGO_PRUEBA, { ...fuentes, base: BASE });

  test('una guía por facción, del tipo mejora, con el beneficio marcado como dato del jugador', () => {
    assert.deepEqual([...r.guias.keys()], ['Mejoras (H)\\mejora-saco-dormir', 'Mejoras (A)\\mejora-saco-dormir']);
    const g = r.guias.get('Mejoras (H)\\mejora-saco-dormir');
    assert.equal(g.tipo, 'mejora');
    assert.equal(g.grupo, 'Mejoras (H)');
    assert.equal(g.faccion, 'Horde');
    assert.deepEqual(g.titulo, { es: 'Mejora: Saco de dormir acogedor', en: 'Upgrade: Cozy Sleeping Bag' });
    assert.deepEqual(g.niveles, { min: 14, max: 14 });
    assert.equal(g.sinVerificar, true);
    // Ronda 1 (M3): cada grupo lleva «x:mejora». Un addon que no conoce las guías de mejora evalúa ese término como falso
    // y no las enseña como guías normales del selector.
    assert.deepEqual(g.filtro, [['r:Orc', 'x:mejora'], ['r:Scourge', 'x:mejora'], ['r:Tauren', 'x:mejora'],
      ['r:Troll', 'x:mejora'], ['r:Skyborne', 'x:mejora']]);
    assert.deepEqual(g.mejora, {
      id: 'mejora-saco-dormir',
      beneficio: { es: 'Te acuestas.', en: 'You lie down.' },
      beneficioDe: 'jugador',
      recompensa: { item: 900, nombre: { en: 'Cozy Sleeping Bag' } },
      // Ronda 1: lo que dan por el camino las misiones de antes (sale de la base, no es dato del jugador).
      porElCamino: { es: 'Por el camino, "Stepping Stones" te da también una bolsa (Old Toolbox).',
        en: 'Along the way, "Stepping Stones" also gives you a bag (Old Toolbox).' },
    });
  });

  // Lote C (mejoras-rereview, Minor 1): la frase en español usa los nombres en español de la base (los mismos que los
  // pasos); la inglesa, los ingleses. Un nombre sin español se queda en inglés.
  test('lote C: «por el camino» en español con los nombres en español de la base, y en inglés con los ingleses', () => {
    const espanol = { quest: new Map([[12, { name: 'Tesoros rocosos' }]]), item: new Map([[901, { name: 'Caja de herramientas vieja' }]]) };
    const conEs = guiasDeMejoras(CATALOGO_PRUEBA, { ...fuentes, base: BASE, espanol });
    assert.deepEqual(conEs.guias.get('Mejoras (H)\\mejora-saco-dormir').mejora.porElCamino, {
      es: 'Por el camino, "Tesoros rocosos" te da también una bolsa (Caja de herramientas vieja).',
      en: 'Along the way, "Stepping Stones" also gives you a bag (Old Toolbox).',
    });
    const soloMision = guiasDeMejoras(CATALOGO_PRUEBA, { ...fuentes, base: BASE,
      espanol: { quest: new Map([[12, { name: 'Tesoros rocosos' }]]), item: new Map() } });
    assert.equal(soloMision.guias.get('Mejoras (H)\\mejora-saco-dormir').mejora.porElCamino.es,
      'Por el camino, "Tesoros rocosos" te da también una bolsa (Old Toolbox).');
  });

  test('ronda 1: la mejora que solo sale de la cadena y cuyo objeto trae vendedor en la base lo apunta en la fila', () => {
    assert.equal(r.filas[0].vendedorDeLaBase, true);
    const sinMarca = guiasDeMejoras([{ ...CATALOGO_PRUEBA[0], soloConLaCadena: undefined }], { ...fuentes, base: BASE });
    assert.equal(sinMarca.filas[0].vendedorDeLaBase, undefined);
  });

  test('los pasos siguen la cadena, aceptan y entregan sobre objetos, con los puntos de la base', () => {
    const g = r.guias.get('Mejoras (H)\\mejora-saco-dormir');
    const acciones = g.pasos.flatMap((p) => p.elementos.filter((e) => e.t === 'accept' || e.t === 'turnin')
      .map((e) => `${e.t} ${e.q}@${e.objeto}`));
    assert.deepEqual(acciones, [
      'accept 10@101', 'turnin 10@102', 'accept 12@102', 'turnin 12@105',
      'accept 13@105', 'turnin 13@106', 'accept 14@106', 'turnin 14@107',
    ]);
    const primerGoto = g.pasos[0].elementos.find((e) => e.t === 'goto');
    assert.deepEqual(primerGoto, { t: 'goto', mapa: 1413, x: 46.35, y: 73.89, modo: 'flecha' });
    for (const p of g.pasos) {
      for (const e of p.elementos.filter((x) => x.t === 'goto')) {
        assert.ok(e.x >= 0 && e.x <= 100 && e.y >= 0 && e.y <= 100, `${p.n}: ${e.x}, ${e.y}`);
      }
      assert.equal(p.sinVerificar, undefined, `paso ${p.n}: el objeto no es un orden deducido`);
    }
    const alianza = r.guias.get('Mejoras (A)\\mejora-saco-dormir');
    assert.equal(alianza.pasos[0].elementos.find((e) => e.t === 'accept').q, 11);
  });

  test('un aviso por facción, de tipo mejora y sin clase, que se apaga con la última misión', () => {
    assert.deepEqual(r.avisos.map((a) => a.id), ['mejora-saco-dormir-H', 'mejora-saco-dormir-A']);
    const a = r.avisos[0];
    assert.equal(a.tipo, 'mejora');
    assert.equal(a.clase, undefined);
    assert.equal(a.faccion, 'Horde');
    // Ronda 2: el saco en miniatura no tiene combate (ninguna misión pide matar ni recoger lo que suelta una criatura): el
    // aviso va al requiredLevel más alto, 14, y no al questLevel 22 − 2 = 20 de la ronda 1.
    assert.equal(a.nivel, 14);
    // Dónde empieza: el primer punto de la guía (el addon dice la zona y no avisa desde otro continente).
    assert.deepEqual(a.inicio, { mapa: 1413, x: 46.35, y: 73.89 });
    assert.equal(a.guia, 'Mejoras (H)\\mejora-saco-dormir');
    assert.deepEqual(a.hechas, [14]);
    assert.deepEqual(a.texto, { en: 'You can get: Cozy Sleeping Bag', es: 'Puedes conseguir: Cozy Sleeping Bag' });
    assert.deepEqual(r.sinResolver, []);
    assert.deepEqual(r.discrepancias, []);
  });

  test('las misiones sin nombre español salen en la fila del informe', () => {
    assert.deepEqual(r.filas[0].sinEspanol, [10, 12, 13, 14]);
  });

  test('las guías y los avisos pasan validarLaterales', () => {
    const quest = new Map(Object.entries(MUNDO.misiones).map(([k, v]) => [Number(k), v]));
    const v = validarLaterales({ guiasRutas: new Map(), guiasMisiones: r.guias, avisos: r.avisos, misiones: { quest } });
    assert.deepEqual(v.errores, []);
  });

  test('validarLaterales comprueba que las misiones de una guía de mejora están en la base', () => {
    const quest = new Map([[10, MUNDO.misiones[10]]]);
    const v = validarLaterales({ guiasRutas: new Map(), guiasMisiones: r.guias, avisos: [], misiones: { quest } });
    assert.ok(v.errores.some((e) => /Mejoras \(H\)\\mejora-saco-dormir.*no están en la base: 12, 13, 14/.test(e)), v.errores.join('\n'));
  });

  test('sin título ni beneficio en el catálogo, los dos salen de la base (nombre y tipo de la recompensa)', () => {
    const { titulo, beneficio, ...resto } = CATALOGO_PRUEBA[0];
    const x = guiasDeMejoras([{ ...resto, id: 'mejora-caja', recompensa: 'Old Toolbox', variantes: [
      { faccion: 'Horde', razas: ['Orc'], pasos: PASOS.slice(0, 2) },
    ] }], { ...fuentes, base: BASE, espanol: { quest: new Map(), item: new Map([[901, { name: 'Caja de herramientas vieja' }]]) } });
    const g = x.guias.get('Mejoras (H)\\mejora-caja');
    assert.ok(g, JSON.stringify(x.sinResolver));
    assert.deepEqual(g.titulo, { es: 'Mejora: Caja de herramientas vieja', en: 'Upgrade: Old Toolbox' });
    assert.deepEqual(g.mejora.beneficio, { es: 'Recompensa: Caja de herramientas vieja (bolsa)', en: 'Reward: Old Toolbox (bag)' });
    assert.equal(g.mejora.beneficioDe, 'base');
    assert.deepEqual(x.avisos[0].texto, { en: 'You can get: Old Toolbox', es: 'Puedes conseguir: Caja de herramientas vieja' });
  });

  test('si la última misión no da la recompensa del catálogo, la variante no se resuelve', () => {
    const otro = [{ ...CATALOGO_PRUEBA[0], recompensa: 'Otra cosa' }];
    const x = guiasDeMejoras(otro, { ...fuentes, base: BASE });
    assert.equal(x.guias.size, 0);
    assert.equal(x.sinResolver.length, 10);
    assert.match(x.sinResolver[0].motivo, /no da «Otra cosa»/);
  });
});

describe('detector de candidatas', () => {
  test('tipoDeMejora: bolsa, vario (no de misión), montura, mascota y hechizo', () => {
    assert.equal(tipoDeMejora({ class: 1, subClass: 0 }), 'bolsa');
    assert.equal(tipoDeMejora({ class: 15, subClass: 0 }), 'vario');
    assert.equal(tipoDeMejora({ class: 15, subClass: 5 }), 'montura');
    assert.equal(tipoDeMejora({ class: 15, subClass: 2 }), 'mascota');
    assert.equal(tipoDeMejora({ class: 0, subClass: 0, teachesSpell: 33 }), 'hechizo');
    assert.equal(tipoDeMejora({ class: 15, subClass: 0, startQuest: 7 }), null);
    assert.equal(tipoDeMejora({ class: 12, subClass: 0 }), null);
    assert.equal(tipoDeMejora({ class: 4, subClass: 1 }), null);
  });

  test('dos cadenas espejo en ciclo: encuentra las dos y no entra en un bucle', () => {
    const fuentes = fuentesDePrueba({
      ...MUNDO,
      misiones: {
        ...MUNDO.misiones,
        // Ciclo por previas declaradas (para la misma raza) y su premio: el recorrido acaba.
        20: q('Uno', { preQuestSingle: [21] }),
        21: q('Dos', { preQuestSingle: [20] }),
      },
      items: { ...MUNDO.items, 902: { name: 'Bolsa del ciclo', class: 1, subClass: 0, questRewards: [21] } },
    });
    const c = detectarMejoras(fuentes);
    const saco = c.filter((x) => x.recompensas.some((p) => p.nombre === 'Cozy Sleeping Bag'));
    assert.deepEqual(saco.map((x) => [x.faccion, x.cadena]), [['Horde', [10, 12, 13, 14]], ['Alliance', [11, 12, 13, 14]]]);
    assert.equal(saco[0].conObjeto, true);
    assert.equal(saco[0].misiones, 4);
    assert.equal(saco[0].nivel, 14);
    assert.deepEqual(saco[0].razas, ['Orc', 'Scourge', 'Tauren', 'Troll', 'Skyborne']);
    const ciclo = c.find((x) => x.recompensas.some((p) => p.nombre === 'Bolsa del ciclo'));
    assert.equal(ciclo.faccion, 'ambas');
    assert.equal(ciclo.misiones, 2);
  });

  test('el informe lista nombre, facción, nivel, misiones, recompensa y enlaces por objeto', () => {
    const c = detectarMejoras(fuentesDePrueba(MUNDO));
    const texto = informeDeMejoras(c, { version: '2026.11.10.9', base: BASE });
    assert.match(texto, /^# Candidatas a cadenas de mejoras \(2026\.11\.10\.9\)/);
    assert.match(texto, /\| \d+ \| This Must Be The Place \| H \| 14 \| 4 \| Cozy Sleeping Bag \(vario\) \| sí \|/);
    // La bolsa de «Stepping Stones» (bolsa 40 + objeto 15) va antes que el saco (vario 30 + objeto 15).
    assert.ok(texto.indexOf('| Stepping Stones |') < texto.indexOf('| This Must Be The Place |'));
  });
});

const hay = existsSync(rutaQuestieToc());

describe('datos reales: la cadena del saco de dormir', { skip: !hay }, () => {
  let fuentes;
  let guias;
  before(() => {
    fuentes = cargarFuentes();
    guias = guiasDeMejoras(MEJORAS, { ...fuentes, verificadas: VERIFICADAS, base: BASE });
  });
  const SACO_H = [79007, 79192, 79980, 79974, 79975, 79976];
  const SACO_A = [79008, 79192, 79980, 79974, 79975, 79976];
  const variante = MEJORAS.find((m) => m.id === 'mejora-saco-dormir').variantes;
  const pasosDe = (faccion) => variante.find((v) => v.faccion === faccion).pasos;

  test('orco, humano y los Skyborne de cada facción: entera y en el orden de la tabla', () => {
    for (const [faccion, raza, esperada] of [['Horde', 'Orc', SACO_H], ['Alliance', 'Human', SACO_A],
      ['Horde', 'Skyborne', SACO_H], ['Alliance', 'Skyborne', SACO_A]]) {
      const r = resolverVariante(vistaDe(fuentes, faccion), { universo: 'mejora', raza, pasos: pasosDe(faccion) });
      assert.equal(r.ok, true, r.motivo);
      assert.deepEqual(ids(r), esperada, `${faccion} ${raza}`);
    }
  });

  test('la guía de la Horda: flecha al primer objeto (Los Baldíos), puntos de la base dentro de 0-100', () => {
    assert.deepEqual(guias.sinResolver, []);
    const g = guias.guias.get('Mejoras (H)\\mejora-saco-dormir');
    assert.ok(g, [...guias.guias.keys()].join(', '));
    assert.equal(g.mejora.recompensa.item, 211527);
    assert.deepEqual(g.niveles, { min: 14, max: 14 });
    const primero = g.pasos[0].elementos;
    // Lote H: QuestieDB 1.0.14 redondea el punto del objeto de otra forma (46.35, 73.89 -> 46.36, 73.9): ±0.05.
    const { x, y, ...resto } = primero[0];
    assert.deepEqual(resto, { t: 'goto', mapa: 1413, modo: 'flecha' });
    assert.ok(Math.abs(x - 46.35) <= 0.05 && Math.abs(y - 73.89) <= 0.05, `${x}, ${y}`);
    assert.deepEqual(primero[1], { t: 'accept', q: 79007, objeto: 415106 });
    const aceptadas = g.pasos.flatMap((p) => p.elementos.filter((e) => e.t === 'accept').map((e) => e.q));
    assert.deepEqual(aceptadas, SACO_H);
    // «Stepping Stones» se recoge en Páramos de Poniente, donde se entregó la primera.
    const recogerPiedras = g.pasos.find((p) => p.elementos.some((e) => e.t === 'accept' && e.q === 79192));
    assert.equal(recogerPiedras.elementos.find((e) => e.t === 'goto').mapa, 1436);
    for (const p of g.pasos) {
      for (const e of p.elementos.filter((x) => x.t === 'goto')) assert.ok(e.x >= 0 && e.x <= 100 && e.y >= 0 && e.y <= 100);
    }
  });

  // Lote H: con QuestieDB 1.0.14, «Stepping Stones» pide como previa (una cualquiera) la «... and that note you found»
  // de la Horda o la de la Alianza; la guía de la Horda pedía entregar la de la Alianza y se quedaba parada en el paso 3.
  test('ningún isQuestTurnedIn de las guías de mejora pide solo misiones que su facción no puede hacer', () => {
    for (const g of guias.guias.values()) {
      const v = vistaDe(fuentes, g.faccion);
      const posible = (q) => { const m = v.mision(q); return m && RAZAS_DE[g.faccion].some((r) => v.aplicaARaza(m, r)); };
      for (const p of g.pasos) {
        for (const e of p.elementos.filter((x) => x.t === 'isQuestTurnedIn')) {
          assert.ok(e.qs.some(posible), `${g.clave} paso ${p.n}: isQuestTurnedIn ${e.qs.join(', ')}`);
        }
      }
    }
  });

  test('la guía de la Alianza empieza en Páramos de Poniente y recoge «Stepping Stones» en Los Baldíos', () => {
    const g = guias.guias.get('Mejoras (A)\\mejora-saco-dormir');
    assert.deepEqual(g.pasos[0].elementos[0], { t: 'goto', mapa: 1436, x: 37.41, y: 50.7, modo: 'flecha' });
    const recogerPiedras = g.pasos.find((p) => p.elementos.some((e) => e.t === 'accept' && e.q === 79192));
    assert.equal(recogerPiedras.elementos.find((e) => e.t === 'goto').mapa, 1413);
  });

  test('npm run cadenas -- --mejoras escribe el informe de candidatas en la ruta pedida', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snf-mejoras-'));
    try {
      const salida = join(dir, 'mejoras.md');
      const r = spawnSync(process.execPath, [join(RAIZ_CONVERSOR, 'src', 'cadenas', 'listar.js'), '--mejoras',
        '--version', '2099.01.01.1', '--salida', salida], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const texto = readFileSync(salida, 'utf8');
      assert.match(texto, /^# Candidatas a cadenas de mejoras \(2099\.01\.01\.1\)/);
      // Lote H: «Enlaces por objeto» era «sí» hasta QuestieDB 1.0.11; la 1.0.14 declara los enlaces de la cadena. Ronda 1
      // (M2): la columna dice lo mismo que el detector (`conObjeto`) para esa fila.
      const saco = detectarMejoras(fuentes).find((x) => x.final === 79976 && x.faccion === 'Horde');
      const columna = saco.conObjeto ? 'sí' : 'no';
      assert.ok(texto.includes(`| This Must Be The Place | H | 14 | 6 | Cozy Sleeping Bag (vario) | ${columna} |`), columna);
      assert.match(r.stdout, /candidatas/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('todo el catálogo se resuelve: el saco en las dos facciones y las cuatro bolsas de la Alianza, con su descripción de la base', () => {
    assert.deepEqual(guias.sinResolver, []);
    assert.deepEqual(guias.discrepancias, []);
    assert.deepEqual([...guias.guias.keys()].sort(), [
      'Mejoras (A)\\mejora-bolsa-astillero', 'Mejoras (A)\\mejora-bolsa-buzzbox', 'Mejoras (A)\\mejora-bolsa-cazador',
      'Mejoras (A)\\mejora-bolsa-guardia-nocturna', 'Mejoras (A)\\mejora-saco-dormir', 'Mejoras (H)\\mejora-saco-dormir',
    ]);
    for (const g of guias.guias.values()) {
      if (g.nombre === 'mejora-saco-dormir') {
        assert.equal(g.mejora.beneficioDe, 'jugador');
        // Ronda 1: verificada (VERIFICADAS, la cadena entera) y con la bolsa del camino, sacada de la base.
        assert.equal(g.sinVerificar, false, g.clave);
        assert.deepEqual(g.mejora.porElCamino, {
          es: 'Por el camino, "Stepping Stones" te da también una bolsa (Old Toolbox).',
          en: 'Along the way, "Stepping Stones" also gives you a bag (Old Toolbox).',
        });
        continue;
      }
      assert.equal(g.sinVerificar, true, g.clave);
      assert.equal(g.mejora.porElCamino, undefined, g.clave);
      assert.equal(g.mejora.beneficioDe, 'base', g.clave);
      assert.match(g.mejora.beneficio.en, /^Reward: .+ \(bag\)$/, g.clave);
      assert.match(g.titulo.en, /^Upgrade: /);
    }
  });

  test('rondas 1 y 2 (M4): niveles de los avisos con los datos reales (con combate, questLevel más alto − 2; sin él, requiredLevel)', () => {
    const nivel = Object.fromEntries(guias.avisos.map((a) => [a.id, a.nivel]));
    assert.deepEqual(nivel, {
      // Ronda 2: sin combate, el requiredLevel más alto (saco 14, astillero 13); con combate, la regla de la ronda 1
      // (Buzzbox: objetos que sueltan criaturas; cazador: «Ol' Sooty», élite; Guardia Nocturna: matar).
      'mejora-saco-dormir-H': 14, 'mejora-saco-dormir-A': 14, 'mejora-bolsa-buzzbox-A': 14,
      'mejora-bolsa-cazador-A': 18, 'mejora-bolsa-astillero-A': 13, 'mejora-bolsa-guardia-nocturna-A': 28,
    });
    assert.deepEqual(guias.filas.map((f) => [f.id, f.faccion, f.combate]), [
      ['mejora-saco-dormir', 'Horde', 'no'], ['mejora-saco-dormir', 'Alliance', 'no'], ['mejora-bolsa-buzzbox', 'Alliance', 'sí'],
      ['mejora-bolsa-cazador', 'Alliance', 'sí'], ['mejora-bolsa-astillero', 'Alliance', 'no'],
      ['mejora-bolsa-guardia-nocturna', 'Alliance', 'sí'],
    ]);
    const inicioH = guias.avisos.find((a) => a.id === 'mejora-saco-dormir-H').inicio;
    assert.equal(inicioH.mapa, 1413);
    assert.ok(Math.abs(inicioH.x - 46.35) <= 0.05 && Math.abs(inicioH.y - 73.89) <= 0.05, JSON.stringify(inicioH));
    assert.equal(guias.avisos.find((a) => a.id === 'mejora-saco-dormir-A').inicio.mapa, 1436);
    // El nivel del catálogo es el mínimo de la guía (requiredLevel): no hay discrepancias.
    assert.deepEqual(guias.discrepancias, []);
  });

  // Lote H: QuestieDB 1.0.14 declara por enlace (preQuestSingle o nextQuestInChain) las parejas del saco y de Beren's
  // Peril, y entonces manda el enlace: ya no salen como previas por objeto. No se fija la lista de la fuente: cada pareja
  // de la ronda 1 sigue unida, por objeto o por un enlace de la base, y ninguna pareja por objeto choca con un enlace.
  const PAREJAS_RONDA_1 = [
    '4451->4449', '635->642', '79007->79192', '79008->79192', '79192->79980', '79974->79975', '79975->79976',
    '79980->79974', '91860->91861', '94502->94503', '949->98042', '95884->95883', '95884->95885', '96783->96784',
  ];
  // ¿Se llega de `a` a `b` siguiendo los enlaces de la base (nextQuestInChain y previas)? La 1.0.14 pone, por ejemplo,
  // 95884 → 95883 → 95885 donde la ronda 1 veía 95884 → 95883 y 95884 → 95885 por el mismo objeto.
  const sucesores = new Map();
  const unidasPorEnlace = (v, a, b) => {
    const lista = (x) => (Array.isArray(x) ? x : []);
    if (!sucesores.has(v)) {
      const s = new Map();
      const unir = (x, y) => { if (!s.has(x)) s.set(x, new Set()); s.get(x).add(y); };
      for (const [id, m] of v.misiones()) {
        if (m.nextQuestInChain) unir(id, m.nextQuestInChain);
        for (const p of [...lista(m.preQuestSingle), ...lista(m.preQuestGroup)]) unir(p, id);
      }
      sucesores.set(v, s);
    }
    const s = sucesores.get(v);
    const vistos = new Set([a]);
    const pendientes = [a];
    while (pendientes.length > 0) {
      for (const y of s.get(pendientes.pop()) ?? []) {
        if (y === b) return true;
        if (!vistos.has(y)) { vistos.add(y); pendientes.push(y); }
      }
    }
    return false;
  };

  test('ronda 1 (M1): las previas por objeto de toda la base (buzones y previas sin dador, fuera)', () => {
    const pares = new Set();
    const vistas = {};
    for (const faccion of ['Horde', 'Alliance']) {
      const v = vistaDe(fuentes, faccion);
      vistas[faccion] = v;
      for (const raza of RAZAS_DE[faccion]) {
        for (const [b, m] of v.misiones()) {
          if (!v.aplicaARaza(m, raza)) continue;
          for (const a of v.previasPorObjeto(b, raza)) pares.add(`${a}->${b}`);
        }
      }
    }
    const enlazadas = (par) => {
      const [a, b] = par.split('->').map(Number);
      return ['Horde', 'Alliance'].some((f) => unidasPorEnlace(vistas[f], a, b));
    };
    for (const par of PAREJAS_RONDA_1) assert.ok(pares.has(par) || enlazadas(par), `${par}: ni por objeto ni por enlace`);
    // Ronda 1 (M1): una pareja nueva por objeto hace fallar la prueba, para mirarla a mano (como los buzones de la ronda 1);
    // si es buena, se añade a la lista.
    assert.deepEqual([...pares].filter((par) => !PAREJAS_RONDA_1.includes(par)).sort(), []);
  });

  test('el detector encuentra la cadena del saco con los datos reales', () => {
    const c = detectarMejoras(fuentes);
    const saco = c.filter((x) => x.final === 79976);
    assert.deepEqual(saco.map((x) => x.faccion).sort(), ['Alliance', 'Horde']);
    // Lote H: «conObjeto» dependía de que la base no declarara los enlaces (la 1.0.14 ya los trae, de 79007/79008 a 79976).
    assert.ok(saco.every((x) => x.misiones === 6), JSON.stringify(saco));
    const v = vistaDe(fuentes, 'Horde');
    const enlazada = [[79007, 79192], [79192, 79980], [79980, 79974], [79974, 79975], [79975, 79976]]
      .every(([a, b]) => unidasPorEnlace(v, a, b));
    assert.ok(saco.every((x) => x.conObjeto || enlazada), 'la cadena del saco no va unida ni por objeto ni por enlace');
  });
});
