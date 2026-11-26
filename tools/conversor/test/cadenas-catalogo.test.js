// Pruebas del catálogo de cadenas de clase (solo nombres ingleses, sin IDs), de VERIFICADAS y de la
// herramienta de consulta (`npm run cadenas`). La de integración exige que todo el catálogo resuelva en la
// base real: lo que no resuelve sin adivinar tiene que estar en PENDIENTES, con su motivo (R8).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { vistaDePrueba } from './ayuda/vista.js';
import { CATALOGO, PENDIENTES } from '../src/cadenas/catalogo.js';
import { VERIFICADAS } from '../src/cadenas/verificadas.js';
import { listarCadenas } from '../src/cadenas/listar.js';
import { combinacionesDe, resolverCadena, cargarFuentes } from '../src/cadenas/fuentes.js';
import { grafoDeClase } from '../src/cadenas/resolver.js';
import { crearVista } from '../src/questie/vista.js';
import { CLASES, RAZAS } from '../src/rxp/filtros.js';
import { rutaQuestieToc } from '../src/config.js';

// Todos los valores numéricos del objeto con su ruta (clave por clave).
function numeros(valor, ruta = []) {
  if (typeof valor === 'number') return [{ ruta, valor }];
  if (valor === null || typeof valor !== 'object') return [];
  return Object.entries(valor).flatMap(([k, v]) => numeros(v, [...ruta, k]));
}
function textos(valor) {
  if (typeof valor === 'string') return [valor];
  if (valor === null || typeof valor !== 'object') return [];
  return Object.values(valor).flatMap(textos);
}

describe('catálogo bien formado', () => {
  test('ids únicos, clase conocida y título en los dos idiomas', () => {
    const ids = CATALOGO.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `ids repetidos: ${ids}`);
    for (const c of CATALOGO) {
      assert.ok(CLASES.includes(c.clase), `${c.id}: clase desconocida ${c.clase}`);
      assert.equal(typeof c.nivel, 'number', `${c.id}: sin nivel`);
      assert.ok(c.titulo?.es && c.titulo?.en, `${c.id}: título vacío`);
      if (c.habilidad) assert.ok(c.habilidad.es && c.habilidad.en, `${c.id}: habilidad a medias`);
      assert.ok(Array.isArray(c.variantes) && c.variantes.length > 0, `${c.id}: sin variantes`);
    }
  });

  test('cada variante: razas conocidas e (inicio y fin) o pasos, nunca las dos cosas', () => {
    for (const c of CATALOGO) {
      c.variantes.forEach((v, i) => {
        const donde = `${c.id} variante ${i + 1}`;
        assert.ok(Array.isArray(v.razas) && v.razas.length > 0, `${donde}: sin razas`);
        for (const r of v.razas) assert.ok(RAZAS.includes(r), `${donde}: raza desconocida ${r}`);
        if (v.faccion !== undefined) assert.ok(['Horde', 'Alliance'].includes(v.faccion), `${donde}: facción ${v.faccion}`);
        if (v.desempate !== undefined) assert.ok(['forever', 'classic'].includes(v.desempate), `${donde}: desempate`);
        if (v.habilidad) assert.ok(v.habilidad.es && v.habilidad.en, `${donde}: habilidad a medias`);
        if (v.dador !== undefined) assert.ok(typeof v.dador === 'string' && v.dador && v.pasos, `${donde}: dador (solo con pasos)`);
        const porEnlaces = v.inicio !== undefined || v.fin !== undefined;
        const porNombres = v.pasos !== undefined;
        assert.ok(porEnlaces !== porNombres, `${donde}: lleva (inicio y fin) o pasos, y no las dos cosas`);
        if (porEnlaces) assert.ok(v.inicio && v.fin, `${donde}: el modo A necesita inicio y fin`);
        if (porNombres) assert.ok(v.pasos.length > 0 && v.pasos.every((p) => typeof p === 'string' && p), `${donde}: pasos`);
        // Cada raza tiene al menos una facción en la que se resuelve.
        for (const r of v.razas) {
          assert.ok(combinacionesDe(v).some((x) => x.raza === r), `${donde}: la raza ${r} no existe en la facción ${v.faccion}`);
        }
      });
    }
  });

  test('ningún número ≥ 2 salvo CATALOGO[i].nivel (1-60) ni de 2 cifras en los textos: ninguna ID entra a mano', () => {
    for (const { ruta, valor } of numeros({ CATALOGO, PENDIENTES })) {
      const esNivel = ruta.length === 3 && ruta[0] === 'CATALOGO' && ruta[2] === 'nivel';
      if (esNivel) {
        assert.ok(Number.isInteger(valor) && valor >= 1 && valor <= 60, `nivel ${valor} en ${ruta.join('.')}`);
        continue;
      }
      assert.ok(valor < 2, `número ${valor} en ${ruta.join('.')}`);
    }
    for (const c of CATALOGO) assert.equal(typeof c.nivel, 'number', `${c.id}: sin nivel`);
    // Los ids (y `cadena`) son palabras con guiones; un trozo numérico solo puede ser un nivel (≤ 2 cifras,
    // como «sacerdote-10»). En el resto de textos solo se admite «nivel N» / «level N» (títulos del sacerdote).
    const ids = [...CATALOGO.map((c) => c.id), ...PENDIENTES.flatMap((p) => [p.id, p.cadena ?? p.id])];
    for (const id of ids) assert.match(id, /^[a-z]+(-([a-z]+|\d{1,2}))*$/, `id raro: «${id}»`);
    const sinIds = (v) => (Array.isArray(v) ? v.map(sinIds) : v !== null && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'id' && k !== 'cadena').map(([k, x]) => [k, sinIds(x)]))
      : v);
    for (const t of textos(sinIds({ CATALOGO, PENDIENTES }))) {
      assert.doesNotMatch(t, /(?<!nivel |level |\d)\d{2,}/, `número de 2 cifras o más en «${t}»`);
    }
  });

  test('PENDIENTES: id, clase y motivo; ninguno está en el catálogo; `cadena` apunta a una del catálogo', () => {
    const porId = new Map(CATALOGO.map((c) => [c.id, c]));
    for (const p of PENDIENTES) {
      assert.ok(p.id && CLASES.includes(p.clase) && p.motivo, `pendiente mal formado: ${JSON.stringify(p)}`);
      assert.ok(!porId.has(p.id), `${p.id} está en CATALOGO y en PENDIENTES`);
      if (p.cadena !== undefined) {
        assert.ok(porId.has(p.cadena), `${p.id}: la cadena «${p.cadena}» no está en el catálogo`);
        assert.equal(porId.get(p.cadena).clase, p.clase, `${p.id}: clase distinta de la de «${p.cadena}»`);
      }
    }
  });

  // Lote «Cadenas de mejoras», ronda 1: el jugador verificó la cadena del saco en el juego el 9-nov-2026 (sin apuntar el
  // personaje ni la facción). Es la única entrada; cada una lleva fecha, quién y cómo, como pide verificadas.js.
  test('VERIFICADAS: solo la cadena del saco, con fecha, quién y cómo', () => {
    assert.deepEqual(VERIFICADAS, {
      'mejora-saco-dormir': { fecha: '2026-11-09', quien: 'el jugador', como: 'juego', nota: 'personaje y facción sin apuntar' },
    });
    for (const [id, v] of Object.entries(VERIFICADAS)) {
      assert.match(v.fecha, /^\d{4}-\d{2}-\d{2}$/, id);
      assert.ok(v.quien && ['juego', 'dos fuentes'].includes(v.como), id);
    }
  });
});

describe('combinacionesDe', () => {
  test('cada raza en las facciones donde existe; con faccion, solo en esa', () => {
    assert.deepEqual(combinacionesDe({ razas: ['Tauren', 'NightElf', 'Skyborne'] }), [
      { faccion: 'Horde', raza: 'Tauren' }, { faccion: 'Horde', raza: 'Skyborne' },
      { faccion: 'Alliance', raza: 'NightElf' }, { faccion: 'Alliance', raza: 'Skyborne' },
    ]);
    assert.deepEqual(combinacionesDe({ razas: ['Skyborne', 'Orc'], faccion: 'Alliance' }), [
      { faccion: 'Alliance', raza: 'Skyborne' },
    ]);
  });
});

// Misión de druida tauren por defecto (por zoneOrSort).
const m = (name, extra = {}) => ({
  name, zoneOrSort: -263, requiredLevel: 10, requiredClasses: 0, requiredRaces: 32,
  startedBy: [[1]], finishedBy: [[1]], ...extra,
});
const listar = (misiones, opciones = {}) => listarCadenas(
  vistaDePrueba({ misiones, faccion: 'Horde', clase: 'DRUID' }),
  { clase: 'DRUID', raza: 'Tauren', ...opciones },
);

describe('listarCadenas', () => {
  test('1→2→3 da una línea', () => {
    assert.deepEqual(listar({
      1: m('A', { nextQuestInChain: 2 }),
      2: m('B', { preQuestSingle: [1] }),
      3: m('C', { preQuestSingle: [2] }),
    }), ['L10 3p: A -> C [1..3]']);
  });

  test('una bifurcación corta la línea con {RAMA} y cada rama sale en su propia línea', () => {
    assert.deepEqual(listar({
      1: m('A'),
      2: m('B', { preQuestSingle: [1] }),
      3: m('C', { preQuestSingle: [1], requiredLevel: 12 }),
    }), ['L10 1p: A -> A [1] {RAMA 2/3}', 'L10 1p: B -> B [2]', 'L12 1p: C -> C [3]']);
  });

  test('filtra por raza y por nivel de la primera misión; sin migas', () => {
    assert.deepEqual(listar({
      1: m('A'),
      2: m('Elfo', { requiredRaces: 8 }),
      3: m('Alta', { requiredLevel: 50 }),
      4: m('Miga', { breadcrumbForQuestId: 1, nextQuestInChain: 1 }),
    }), ['L10 1p: A -> A [1]']);
    assert.deepEqual(listar({ 1: m('A'), 3: m('Alta', { requiredLevel: 50 }) }, { nivelMin: 41, nivelMax: 60 }),
      ['L50 1p: Alta -> Alta [3]']);
  });

  test('un bucle corta la línea con {BUCLE}', () => {
    assert.deepEqual(listar({
      1: m('A'),
      2: m('B', { preQuestSingle: [1], nextQuestInChain: 3 }),
      3: m('C', { nextQuestInChain: 2 }),
    }), ['L10 3p: A -> C [1..3] {BUCLE 2}']);
  });
});

describe('CLI de npm run cadenas', () => {
  const cli = fileURLToPath(new URL('../src/cadenas/listar.js', import.meta.url));
  for (const resto of [[], ['10'], ['a', 'b'], ['10', 'x']]) {
    test(`--niveles ${resto.join(' ') || '(sin números)'} da un error claro`, () => {
      const r = spawnSync(process.execPath, [cli, '--listar', 'DRUID', 'Tauren', 'Horde', '--niveles', ...resto], { encoding: 'utf8' });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /--niveles necesita dos números/);
    });
  }
});

const hay = existsSync(rutaQuestieToc());

// Una cadena «resuelta» que se corta antes de tiempo engañaría al jugador: tras la última misión no puede
// quedar en la base, para esa raza, otra que se llame igual y la siga (pasa con las misiones laterales tipo
// «Fire Sapta», que hacen parar el modo A en cuanto ha visto el fin).
function cortada(fuentes, cadena, { faccion, raza, r }) {
  const g = grafoDeClase(crearVista(fuentes, { faccion, clase: cadena.clase }), cadena.clase, raza);
  const ids = new Set(r.misiones.map((x) => x.q));
  const ultima = r.misiones[r.misiones.length - 1].q;
  const nombre = g.U.get(ultima).name;
  return [...g.succ.get(ultima)].filter((s) => !ids.has(s) && g.U.get(s).name === nombre);
}

describe('el catálogo resuelve en la base real', { skip: !hay }, () => {
  let fuentes;
  before(() => { fuentes = cargarFuentes(); });

  for (const cadena of CATALOGO) {
    test(cadena.id, () => {
      const resultados = resolverCadena(fuentes, cadena);
      const donde = (x) => `${cadena.id} variante ${x.variante} (${x.faccion}) ${x.raza}`;
      const fallos = resultados.filter((x) => !x.r.ok).map((x) => `${donde(x)}: ${x.r.motivo}`);
      assert.deepEqual(fallos, []);
      const cortes = resultados.map((x) => ({ x, siguen: cortada(fuentes, cadena, x) }))
        .filter(({ siguen }) => siguen.length > 0)
        .map(({ x, siguen }) => `${donde(x)}: se corta antes de ${siguen.join(', ')}`);
      assert.deepEqual(cortes, []);
    });
  }
});
