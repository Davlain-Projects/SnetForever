// Pruebas de las guías de cadena de clase y de sus avisos (tarea 6): fusión de las secuencias de cada raza,
// una guía por cadena y facción, un aviso por variante resuelta y qué se hace con las variantes que fallan.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fuentesDePrueba } from './ayuda/vista.js';
import { fusionar, guiasDeCadenas } from '../src/cadenas/guias.js';
import { CATALOGO } from '../src/cadenas/catalogo.js';
import { cargarFuentes, vistaDe } from '../src/cadenas/fuentes.js';
import { rutaQuestieToc } from '../src/config.js';

const BASE = { base: 'QuestieDB', version: 'prueba', commit: 'abc' };

describe('fusionar', () => {
  test('una misión ya colocada suma su raza y una nueva va antes de la siguiente compartida', () => {
    assert.deepEqual(fusionar([
      { raza: 'Tauren', misiones: [1, 2, 3] },
      { raza: 'NightElf', misiones: [1, 4, 3] },
    ]), [
      { q: 1, razas: ['Tauren', 'NightElf'] },
      { q: 2, razas: ['Tauren'] },
      { q: 4, razas: ['NightElf'] },
      { q: 3, razas: ['Tauren', 'NightElf'] },
    ]);
  });

  test('sin nada en común, cada secuencia entera va detrás de la anterior', () => {
    assert.deepEqual(fusionar([
      { raza: 'Tauren', misiones: [1, 2] },
      { raza: 'Skyborne', misiones: [7, 8] },
    ]), [
      { q: 1, razas: ['Tauren'] }, { q: 2, razas: ['Tauren'] },
      { q: 7, razas: ['Skyborne'] }, { q: 8, razas: ['Skyborne'] },
    ]);
  });

  test('orden cruzado: si las posteriores ya colocadas quedan antes de la última, la nueva va al final', () => {
    // Tauren 1,2 y elfo 2,5,1: al llegar a 5 solo queda por colocar «1», que está antes de «2» (posición ≤ ultima).
    assert.deepEqual(fusionar([
      { raza: 'Tauren', misiones: [1, 2] },
      { raza: 'NightElf', misiones: [2, 5, 1] },
    ]), [
      { q: 1, razas: ['Tauren', 'NightElf'] },
      { q: 2, razas: ['Tauren', 'NightElf'] },
      { q: 5, razas: ['NightElf'] },
    ]);
  });

  test('sin secuencias, nada', () => {
    assert.deepEqual(fusionar([]), []);
  });
});

// Mundo mínimo de druidas. Alpha es del tauren y el elfo de la noche; «Sky Alpha», del Skyborne; Beta y
// Gamma, de todos (requiredRaces = 0).
const SKY = 2 ** 33 + 2 ** 32;
const m = (name, extra = {}) => ({
  name, zoneOrSort: -263, requiredLevel: 10, requiredClasses: 0, requiredRaces: 0,
  startedBy: [[1]], finishedBy: [[1]], ...extra,
});
const MISIONES = {
  1: m('Alpha', { requiredRaces: 32 + 8, nextQuestInChain: 2 }),
  21: m('Sky Alpha', { requiredRaces: SKY, nextQuestInChain: 2 }),
  2: m('Beta', { requiredLevel: 12, preQuestSingle: [1], nextQuestInChain: 3 }),
  3: m('Gamma', { requiredLevel: 14, preQuestSingle: [2] }),
};
// Beta tiene dos previas; las del Skyborne la llegan por 21, la del resto por 1.
MISIONES[2].preQuestSingle = [1, 21];
const PNJS = { 1: { name: 'Maestro', spawns: { 10: [[40, 50]] } } };
const fuentes = (extra = {}) => fuentesDePrueba({ misiones: MISIONES, pnjs: PNJS, ...extra });
const CAD = (extra = {}) => ({
  id: 'prueba', clase: 'DRUID', nivel: 10, titulo: { es: 'Prueba', en: 'Test' },
  habilidad: { es: 'Habilidad', en: 'Skill' }, ...extra,
});
const generar = (catalogo, extra = {}, f = fuentes()) => guiasDeCadenas(catalogo, { ...f, verificadas: {}, base: BASE, ...extra });
const razasDe = (paso) => (paso.filtro ?? []).flat().filter((x) => x.startsWith('r:'));
const aceptadas = (guia) => guia.pasos.flatMap((p) => p.elementos.filter((e) => e.t === 'accept').map((e) => e.q));

describe('guiasDeCadenas (mundo sintético)', () => {
  const catalogo = [CAD({
    variantes: [
      { razas: ['Tauren'], faccion: 'Horde', inicio: 'Alpha', fin: 'Gamma' },
      { razas: ['Skyborne'], faccion: 'Horde', inicio: 'Sky Alpha', fin: 'Gamma' },
    ],
  })];

  test('una guía por cadena y facción, con los campos del contrato', () => {
    const { guias, sinResolver } = generar(catalogo);
    assert.deepEqual(sinResolver, []);
    assert.deepEqual([...guias.keys()], ['Cadenas de clase (H)\\prueba']);
    const g = guias.get('Cadenas de clase (H)\\prueba');
    assert.equal(g.grupo, 'Cadenas de clase (H)');
    assert.equal(g.tipo, 'cadena');
    assert.equal(g.faccion, 'Horde');
    // Ruling F3-31: el filtro de la guía es la clase con cada raza resuelta de la facción (como en los avisos).
    assert.deepEqual(g.filtro, [['c:DRUID', 'r:Tauren'], ['c:DRUID', 'r:Skyborne']]);
    assert.deepEqual(g.niveles, { min: 10, max: 14 });
    assert.deepEqual(g.titulo, { es: 'Prueba', en: 'Test' });
    assert.deepEqual(g.cadena, { id: 'prueba', habilidad: { es: 'Habilidad', en: 'Skill' } });
    assert.equal(g.sinVerificar, true);
    assert.deepEqual(g.origen, BASE);
    assert.deepEqual(g.siguientes, []);
    assert.deepEqual(g.mazmorras, []);
    assert.equal(g.fuente.linea, 0);
    assert.ok(g.pasos.length > 0);
    g.pasos.forEach((p, i) => {
      assert.equal(p.n, i + 1);
      assert.ok(p.id);
      assert.ok(p.elementos.length > 0);
    });
  });

  test('los pasos propios de una raza llevan su r: y los compartidos no llevan ninguno', () => {
    const g = generar(catalogo).guias.get('Cadenas de clase (H)\\prueba');
    const de = (q) => g.pasos.filter((p) => p.elementos.some((e) => e.q === q));
    assert.deepEqual(de(1).map(razasDe), [['r:Tauren'], ['r:Tauren']]);
    assert.deepEqual(de(21).map(razasDe), [['r:Skyborne'], ['r:Skyborne']]);
    for (const q of [2, 3]) {
      assert.ok(de(q).length > 0);
      assert.deepEqual(de(q).map((p) => p.filtro), de(q).map(() => undefined));
    }
    assert.deepEqual(aceptadas(g), [1, 21, 2, 3]);
  });

  test('hay un aviso por variante resuelta, con su nivel, sus razas y la última misión de cada una', () => {
    const { avisos } = generar(catalogo);
    assert.deepEqual(avisos, [
      {
        id: 'prueba-H-1', tipo: 'cadena', clase: 'DRUID', faccion: 'Horde', filtro: [['r:Tauren']], nivel: 10,
        texto: { en: 'Skill', es: 'Habilidad' }, guia: 'Cadenas de clase (H)\\prueba', hechas: [3],
      },
      {
        id: 'prueba-H-2', tipo: 'cadena', clase: 'DRUID', faccion: 'Horde', filtro: [['r:Skyborne']], nivel: 10,
        texto: { en: 'Skill', es: 'Habilidad' }, guia: 'Cadenas de clase (H)\\prueba', hechas: [3],
      },
    ]);
  });

  test('el texto del aviso es la habilidad de la variante, o la de la cadena, o el título', () => {
    const v = { razas: ['Tauren'], faccion: 'Horde', inicio: 'Alpha', fin: 'Gamma' };
    const texto = (cad) => generar([cad]).avisos[0].texto;
    assert.deepEqual(texto(CAD({ variantes: [{ ...v, habilidad: { es: 'De variante', en: 'Variant' } }] })),
      { en: 'Variant', es: 'De variante' });
    assert.deepEqual(texto(CAD({ variantes: [v] })), { en: 'Skill', es: 'Habilidad' });
    assert.deepEqual(texto(CAD({ habilidad: undefined, variantes: [v] })), { en: 'Test', es: 'Prueba' });
  });

  test('el aviso toma el nivel de la base y avisa si no coincide con el del catálogo', () => {
    const r = generar([CAD({ nivel: 20, variantes: catalogo[0].variantes.slice(0, 1) })]);
    assert.equal(r.avisos[0].nivel, 10);
    assert.deepEqual(r.discrepancias, [{ id: 'prueba-H-1', nivel: 10, catalogo: 20 }]);
    assert.deepEqual(generar(catalogo).discrepancias, []);
  });

  test('una fila por guía con sus razas, el número de misiones, las deducidas y el estado', () => {
    assert.deepEqual(generar(catalogo).filas, [{
      id: 'prueba', faccion: 'Horde', razas: ['Tauren', 'Skyborne'], misiones: 4, deducidas: 0, estado: 'sin verificar',
    }]);
  });

  test('sin faccion en la variante sale una guía por cada facción donde existe la raza', () => {
    const r = generar([CAD({ variantes: [{ razas: ['Skyborne'], inicio: 'Sky Alpha', fin: 'Gamma' }] })]);
    assert.deepEqual([...r.guias.keys()], ['Cadenas de clase (H)\\prueba', 'Cadenas de clase (A)\\prueba']);
    assert.deepEqual(r.avisos.map((a) => [a.id, a.faccion]), [['prueba-H-1', 'Horde'], ['prueba-A-1', 'Alliance']]);
    assert.equal(r.guias.get('Cadenas de clase (A)\\prueba').faccion, 'Alliance');
  });
});

describe('guiasDeCadenas: variantes que fallan', () => {
  // La segunda variante lleva el tauren (que resuelve) y el Skyborne (que no ve «Alpha»): cae entera.
  const catalogo = [CAD({
    variantes: [
      { razas: ['Tauren'], faccion: 'Horde', inicio: 'Alpha', fin: 'Gamma' },
      { razas: ['Tauren', 'Skyborne'], faccion: 'Horde', inicio: 'Alpha', fin: 'Gamma' },
      { razas: ['Skyborne'], faccion: 'Horde', inicio: 'Sky Alpha', fin: 'Gamma' },
    ],
  })];

  test('la variante con una raza que falla no se emite y va a sinResolver; las demás siguen', () => {
    const r = generar(catalogo);
    assert.deepEqual(r.avisos.map((a) => a.id), ['prueba-H-1', 'prueba-H-3']);
    assert.equal(r.sinResolver.length, 1);
    const [s] = r.sinResolver;
    assert.equal(s.id, 'prueba');
    assert.equal(s.faccion, 'Horde');
    assert.equal(s.raza, 'Skyborne');
    assert.match(s.motivo, /\S/);
    const g = r.guias.get('Cadenas de clase (H)\\prueba');
    assert.deepEqual(aceptadas(g), [1, 21, 2, 3]);
  });

  test('si cae la variante de una raza, los pasos de la otra siguen llevando su r: (también los compartidos)', () => {
    const r = generar([CAD({
      variantes: [
        { razas: ['Tauren'], faccion: 'Horde', inicio: 'Alpha', fin: 'Gamma' },
        { razas: ['Skyborne'], faccion: 'Horde', inicio: 'Alpha', fin: 'Gamma' }, // el Skyborne no ve «Alpha»
      ],
    })]);
    assert.deepEqual(r.sinResolver.map((s) => s.raza), ['Skyborne']);
    const g = r.guias.get('Cadenas de clase (H)\\prueba');
    assert.deepEqual(aceptadas(g), [1, 2, 3]);
    for (const p of g.pasos) assert.deepEqual(razasDe(p), ['r:Tauren']);
  });

  test('si no queda ninguna variante resuelta no hay guía ni aviso ni fila', () => {
    const r = generar([CAD({ variantes: [{ razas: ['Skyborne'], faccion: 'Horde', inicio: 'Alpha', fin: 'Gamma' }] })]);
    assert.equal(r.guias.size, 0);
    assert.deepEqual(r.avisos, []);
    assert.deepEqual(r.filas, []);
    assert.equal(r.sinResolver.length, 1);
  });
});

describe('guiasDeCadenas: orden por PNJ y verificadas', () => {
  // Modo B: «Delta» y «Epsilon» no están unidas por enlace, solo por el PNJ que entrega y da.
  const f = fuentesDePrueba({
    misiones: {
      31: m('Delta', { requiredRaces: 32, finishedBy: [[2]] }),
      32: m('Epsilon', { requiredRaces: 32, startedBy: [[2]], finishedBy: [[2]] }),
    },
    pnjs: { 1: PNJS[1], 2: { name: 'Otro', spawns: { 11: [[10, 20]] } } },
  });
  const catalogo = [CAD({ id: 'pnj', variantes: [{ razas: ['Tauren'], pasos: ['Delta', 'Epsilon'] }] })];

  test('una misión unida por PNJ lleva sinVerificar = "orden" en todos sus pasos', () => {
    const g = generar(catalogo, {}, f).guias.get('Cadenas de clase (H)\\pnj');
    const de = (q) => g.pasos.filter((p) => p.elementos.some((e) => e.q === q));
    assert.equal(de(31).length, 2);
    assert.ok(de(31).every((p) => p.sinVerificar === undefined));
    assert.equal(de(32).length, 2);
    assert.ok(de(32).every((p) => p.sinVerificar === 'orden'));
  });

  test('un paso de una misión por PNJ sin coordenadas conserva «punto» y los demás llevan «orden»', () => {
    const sinPunto = fuentesDePrueba({
      misiones: {
        31: m('Delta', { requiredRaces: 32, finishedBy: [[3]] }),
        32: m('Epsilon', { requiredRaces: 32, startedBy: [[3]], finishedBy: [[2]] }),
      },
      pnjs: { 2: { name: 'Otro', spawns: { 11: [[10, 20]] } }, 3: { name: 'Sin puntos' } },
    });
    const g = generar(catalogo, {}, sinPunto).guias.get('Cadenas de clase (H)\\pnj');
    const de = (q) => g.pasos.filter((p) => p.elementos.some((e) => e.q === q));
    const [recoger, entregar] = de(32);
    assert.equal(recoger.sinVerificar, 'punto');
    assert.equal(entregar.sinVerificar, 'orden');
  });

  test('la fila cuenta las misiones deducidas por PNJ', () => {
    const [fila] = generar(catalogo, {}, f).filas;
    assert.equal(fila.misiones, 2);
    assert.equal(fila.deducidas, 1);
  });

  test('con la cadena en VERIFICADAS la guía sale con sinVerificar = false, y por la clave también', () => {
    const registro = { fecha: '2026-11-09', quien: 'el jugador', como: 'juego' };
    const g = (verificadas) => generar(catalogo, { verificadas }, f).guias.get('Cadenas de clase (H)\\pnj');
    assert.equal(g({ pnj: registro }).sinVerificar, false);
    assert.equal(g({ 'Cadenas de clase (H)\\pnj': registro }).sinVerificar, false);
    assert.equal(g({ otra: registro }).sinVerificar, true);
    assert.equal(generar(catalogo, { verificadas: { pnj: registro } }, f).filas[0].estado, 'verificada');
  });
});

// Integración con la base real.
const hay = existsSync(rutaQuestieToc());
describe('las cadenas del catálogo sobre la base real', { skip: !hay }, () => {
  let r;
  let fuentesReales;
  before(() => {
    fuentesReales = cargarFuentes();
    r = guiasDeCadenas(CATALOGO, { ...fuentesReales, verificadas: {}, base: BASE });
  });
  const de = (g, ...razas) => g.pasos.filter((p) => razas.every((x) => (p.filtro ?? []).flat().includes(`r:${x}`)));
  const quienes = (paso, t) => paso.elementos.filter((e) => e.t === t);

  test('existe la guía del oso de la Horda', () => {
    const g = r.guias.get('Cadenas de clase (H)\\druida-oso');
    assert.ok(g, 'falta la guía');
    assert.equal(g.faccion, 'Horde');
    assert.equal(g.tipo, 'cadena');
    assert.deepEqual(g.filtro.map((c) => c[0]), g.filtro.map(() => 'c:DRUID'));
    const razas = g.filtro.map((c) => c[1]);
    assert.ok(razas.includes('r:Tauren') && razas.includes('r:Skyborne'), JSON.stringify(g.filtro));
  });

  test('F3-31: el filtro de cada guía lleva solo las razas resueltas de su facción (las de su fila del informe)', () => {
    for (const fila of r.filas) {
      const g = r.guias.get(`Cadenas de clase (${fila.faccion === 'Horde' ? 'H' : 'A'})\\${fila.id}`);
      const clase = g.filtro[0][0];
      assert.match(clase, /^c:[A-Z]+$/);
      assert.deepEqual(g.filtro.map((c) => c.length), g.filtro.map(() => 2), `${g.clave}: ${JSON.stringify(g.filtro)}`);
      assert.deepEqual(g.filtro.map((c) => c[0]), g.filtro.map(() => clase), g.clave);
      assert.deepEqual(g.filtro.map((c) => c[1].slice(2)).sort(), [...fila.razas].sort(), g.clave);
    }
    // Casos de la revisión final: druida-claro no es para tauren ni elfos de la noche; sacerdote-10 (A) no es para
    // humanos ni enanos; guerrero-defensiva, cazador-domesticar (A) y brujo-abisario (H) no son para Skyborne.
    const razasDe = (f, id) => r.guias.get(`Cadenas de clase (${f})\\${id}`).filtro.map((c) => c[1]);
    assert.ok(!razasDe('H', 'druida-claro').includes('r:Tauren'));
    assert.ok(!razasDe('A', 'druida-claro').includes('r:NightElf'));
    assert.ok(!razasDe('A', 'sacerdote-10').includes('r:Human') && !razasDe('A', 'sacerdote-10').includes('r:Dwarf'));
    assert.ok(!razasDe('H', 'guerrero-defensiva').includes('r:Skyborne'));
    assert.ok(!razasDe('A', 'guerrero-defensiva').includes('r:Skyborne'));
    assert.ok(!razasDe('A', 'cazador-domesticar').includes('r:Skyborne'));
    assert.ok(!razasDe('H', 'brujo-abisario').includes('r:Skyborne'));
  });

  test('el primer paso del tauren recoge 5922 y entrega antes las migas 5926, 5927 y 5928', () => {
    const g = r.guias.get('Cadenas de clase (H)\\druida-oso');
    const [primero] = de(g, 'Tauren');
    assert.deepEqual(quienes(primero, 'turnin').filter((e) => e.siFalta).map((e) => e.q), [5926, 5927, 5928]);
    assert.deepEqual(quienes(primero, 'accept').map((e) => e.q), [5922]);
  });

  test('el Skyborne acepta 94006 y no acepta 5922 (vigilancia 2)', () => {
    const g = r.guias.get('Cadenas de clase (H)\\druida-oso');
    const sky = de(g, 'Skyborne');
    assert.ok(sky.some((p) => quienes(p, 'accept').some((e) => e.q === 94006)));
    assert.ok(!sky.some((p) => quienes(p, 'accept').some((e) => e.q === 5922)));
  });

  test('vigilancia 2: lo visible para el Skyborne de la Horda no toca la variante del tauren, y al revés', () => {
    const g = r.guias.get('Cadenas de clase (H)\\druida-oso');
    // Visible para X: sin ningún r: en el filtro, o con una cláusula cuyos r: son todos r:X.
    const visible = (p, x) => p.filtro === undefined || p.filtro.some((c) => c.filter((t) => t.startsWith('r:')).every((t) => t === `r:${x}`));
    const qs = (p) => p.elementos.filter((e) => e.t === 'accept' || e.t === 'turnin').map((e) => e.q);
    const paraSky = g.pasos.filter((p) => visible(p, 'Skyborne'));
    const paraTauren = g.pasos.filter((p) => visible(p, 'Tauren'));
    const delSky = new Set(paraSky.flatMap(qs));
    const delTauren = new Set(paraTauren.flatMap(qs));
    assert.ok(delSky.has(94006) && delTauren.has(5922));
    assert.ok(!delSky.has(5922), 'el Skyborne ve 5922');
    assert.ok(!delTauren.has(94006), 'el tauren ve 94006');
    const soloTauren = [...delTauren].filter((q) => !delSky.has(q));
    const soloSky = [...delSky].filter((q) => !delTauren.has(q));
    assert.ok(soloTauren.length > 0 && soloSky.length > 0);
    for (const q of soloTauren) assert.ok(!paraSky.some((p) => qs(p).includes(q)), `el Skyborne ve ${q}`);
    for (const q of soloSky) assert.ok(!paraTauren.some((p) => qs(p).includes(q)), `el tauren ve ${q}`);
  });

  test('avisos del oso: nivel 10 y la última misión de cada variante', () => {
    const a = (id) => r.avisos.find((x) => x.id === id);
    assert.equal(a('druida-oso-H-1').nivel, 10);
    assert.deepEqual(a('druida-oso-H-1').hechas, [6002]);
    assert.deepEqual(a('druida-oso-H-2').hechas, [94638]);
  });

  test('el aviso de la felina Skyborne de la Horda es de nivel 20 y acaba en 98362', () => {
    const skyborne = r.avisos.filter((x) => x.id.startsWith('druida-felina-H-')
      && x.filtro.flat().includes('r:Skyborne'));
    assert.equal(skyborne.length, 1);
    assert.equal(skyborne[0].nivel, 20);
    assert.deepEqual(skyborne[0].hechas, [98362]);
  });

  test('toda q existe en la base, todo punto está en 0-100 y no hay pasos vacíos', () => {
    for (const g of r.guias.values()) {
      const vista = vistaDe(fuentesReales, g.faccion, g.filtro[0][0].slice(2));
      for (const p of g.pasos) {
        assert.ok(p.elementos.length > 0, `${g.clave}: paso vacío ${p.id}`);
        for (const e of p.elementos) {
          if (e.q !== undefined) assert.ok(vista.mision(e.q), `${g.clave}: la misión ${e.q} no está en la base`);
          for (const q of e.qs ?? []) assert.ok(vista.mision(q), `${g.clave}: la misión ${q} no está en la base`);
          if (e.t === 'goto') {
            assert.ok(e.x >= 0 && e.x <= 100 && e.y >= 0 && e.y <= 100, `${g.clave}: punto fuera de 0-100`);
          }
        }
      }
    }
    for (const a of r.avisos) assert.ok(r.guias.has(a.guia), `${a.id}: guía inexistente`);
  });

  test('ninguna variante sin resolver es del catálogo sin motivo y todas las guías salen sin verificar', () => {
    for (const s of r.sinResolver) assert.ok(s.motivo, `${s.id}: sin motivo`);
    for (const g of r.guias.values()) assert.equal(g.sinVerificar, true);
  });
});

describe('cadenas de druida con correcciones propias (acuática y veneno) sobre la base real', { skip: !hay }, () => {
  let r;
  before(() => {
    r = guiasDeCadenas(CATALOGO, { ...cargarFuentes(), verificadas: {}, base: BASE });
  });
  const aceptadasDe = (pasos) => pasos.flatMap((p) => p.elementos.filter((e) => e.t === 'accept').map((e) => e.q));
  // El Skyborne ve un paso si no lleva filtro o alguna cláusula suya no pide otra raza.
  const loVe = (p) => p.filtro === undefined
    || p.filtro.some((c) => c.filter((t) => t.startsWith('r:')).every((t) => t === 'r:Skyborne'));

  for (const [id, esperadas] of [
    ['druida-acuatica', { H: [27, 28, 30, 31], A: [26, 29, 272, 5061] }],
    ['druida-veneno', { H: [6126, 6127, 6128, 6129, 6130], A: [6121, 6122, 6123, 6124, 6125] }],
  ]) {
    for (const f of ['H', 'A']) {
      test(`${id} (${f}): hay guía con pasos para un druida Skyborne y ninguno lo excluye`, () => {
        const g = r.guias.get(`Cadenas de clase (${f})\\${id}`);
        assert.ok(g, 'falta la guía');
        const paraSky = g.pasos.filter(loVe);
        assert.deepEqual(aceptadasDe(paraSky), esperadas[f]);
        assert.equal(paraSky.length, g.pasos.length, 'hay pasos con filtro que excluye a Skyborne');
      });
    }
  }

  test('druida-veneno (H), 6128: el paso de completar no manda a Teldrassil y empieza en Kalimdor de la Horda', () => {
    // Fallo visto por el jugador: la Raíz de tierra tiene más puntos en Teldrassil (1438) que en Los Baldíos (1413).
    const KALIMDOR_HORDA = [1411, 1412, 1413, 1454, 1456];
    const g = r.guias.get('Cadenas de clase (H)\\druida-veneno');
    const paso = g.pasos.find((p) => p.elementos.some((e) => e.t === 'complete' && e.q === 6128));
    assert.ok(paso, 'falta el paso de completar de la 6128');
    const gotos = paso.elementos.filter((e) => e.t === 'goto');
    assert.ok(gotos.length > 0, 'sin goto');
    assert.deepEqual(gotos.filter((e) => e.mapa === 1438), [], JSON.stringify(gotos));
    assert.ok(KALIMDOR_HORDA.includes(gotos[0].mapa), JSON.stringify(gotos[0]));
    for (const e of gotos) assert.ok(Number.isInteger(e.objetivo) && e.objetivo >= 1, JSON.stringify(e));
  });
});

// Lote C (revisión 52, Minor 9): pasosDeSecuencia pasa a cada misión el último punto de los pasos anteriores, para que
// una misión que empieza con un ítem de una criatura con muchos puntos vaya al más cercano.
describe('pasosDeSecuencia: el punto anterior', () => {
  test('la segunda misión, que empieza con un ítem, va al punto de la criatura más cercano a la entrega de la primera', async () => {
    const { pasosDeSecuencia } = await import('../src/cadenas/guias.js');
    const { vistaDePrueba } = await import('./ayuda/vista.js');
    const misiones = {
      901: m('Primera', { startedBy: [[1]], finishedBy: [[2]] }),
      902: m('Segunda', { startedBy: [[], [], [40]], finishedBy: [[1]] }),
    };
    const pnjs = {
      1: { name: 'Maestro', spawns: { 10: [[40, 50]] } },
      2: { name: 'Recibe', spawns: { 11: [[10.5, 20.25]] } },
      3: { name: 'Bichos', spawns: { 11: [[90, 90], [12, 22], [50, 50]], 12: [[1, 1], [2, 2], [3, 3], [4, 4]] } },
    };
    const vista = vistaDePrueba({ misiones, pnjs, items: { 40: { name: 'Carta', npcDrops: [3] } }, faccion: 'Horde', clase: 'DRUID' });
    const resultado = { raza: 'Orc', misiones: [{ q: 901 }, { q: 902 }], migas: [], previas: new Map() };
    const { pasos } = pasosDeSecuencia(vista, [{ q: 901, razas: ['Orc'] }, { q: 902, razas: ['Orc'] }], [resultado], ['Orc']);
    const recogerSegunda = pasos.find((p) => p.elementos.some((e) => e.t === 'accept' && e.q === 902));
    assert.deepEqual(recogerSegunda.elementos.filter((e) => e.t === 'goto'), [{ t: 'goto', mapa: 11, x: 12, y: 22, modo: 'flecha' }]);
    assert.ok(recogerSegunda.elementos.some((e) => e.t === 'collect' && e.i === 40 && e.q === 902));
  });
});
