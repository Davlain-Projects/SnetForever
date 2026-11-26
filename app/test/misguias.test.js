// 15-nov (en el juego: «revisa mis guías y créame una guía acorde a mi level» y la IA contestó que no las veía): la app
// lee las guías propias del jugador (SnetForever_MisGuias\mis-guias.lua) y, cuando el mensaje habla de guías, le pasa a
// la IA las que tocan su nivel y su facción, con sus pasos resumidos (datos.misGuias). Muestra pequeña e inventada: nunca
// las guías reales del jugador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase } from '../src/base/base.mjs';
import { prepararTurno, MAX_DATOS } from '../src/contexto.mjs';
import { leerMisGuias, hablaDeGuias, bloqueMisGuias, guiasNombradas, esContinuacion, quitarPuntosDeGuias, MAX_MIS_GUIAS, ARCHIVO_MIS_GUIAS, filtroDePasoPropio } from '../src/misguias.mjs';
import { SISTEMA } from '../src/prompt.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const RAIZ = mkdtempSync(join(tmpdir(), 'snf-misguias-'));
const carpetaBase = join(RAIZ, 'base');
mkdirSync(carpetaBase);
copyFileSync(join(FIXTURES, 'misiones-app.lua'), join(carpetaBase, 'misiones-app.lua'));
writeFileSync(join(carpetaBase, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', ''].join('\n'));
const base = cargarBase(carpetaBase);

// Muestra inventada con el formato del LEEME.txt (misiones y mapas del fixture; 99999 no está en la base).
const MUESTRA = `-- Mis guías de prueba
SnetForeverMisGuias = {
  {
    nombre = "Valle de prueba",
    niveles = {1, 4},
    faccion = "Horda",
    pasos = {
      {aceptar = 4641, ir = {1411, 43.3, 68.5}, texto = "Habla con Gornek"},
      {entregar = 4641, aceptar = 788, ir = {1411, 42.1, 68.3}},
      {completar = 788, texto = "Mata jabalíes", texto_en = "Kill boars"},
      {entregar = 788, aceptar = {790, 99999}},
      {texto = "Vende lo gris"},
    },
  },
  {
    nombre = "Guía de la Alianza",
    niveles = {1, 5},
    faccion = "Alianza",
    pasos = {{aceptar = 792}},
  },
  {
    nombre = "Para todos",
    pasos = {{aceptar = 792, ir = {1413, 50.5, 50.5}}, {entregar = 792}},
  },
  {
    nombre = "Muy alta",
    niveles = {40, 45},
    faccion = "Horde",
    pasos = {{texto = "Nada a tu nivel"}},
  },
}
`;

function carpetaAddons(texto = MUESTRA) {
  const addons = mkdtempSync(join(RAIZ, 'addons-'));
  if (texto !== null) {
    mkdirSync(join(addons, 'SnetForever_MisGuias'));
    writeFileSync(join(addons, ARCHIVO_MIS_GUIAS), texto);
  }
  return addons;
}

function mensaje({ texto = 'revisa mis guías y créame una guía acorde a mi nivel', pj = {}, ctx = {}, idioma = 'es' } = {}) {
  return {
    v: 1, id: 'g-1', pj: 'Alguien-Reino', idioma, modelo: 'haiku', texto,
    ctx: {
      pj: { nivel: 3, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', ...pj },
      lugar: { mapa: 1411, zona: 'Durotar' },
      registro: [{ q: 788, c: 0, o: [] }],
      guias: [{ clave: 'Mis guías\\Valle de prueba', titulo: 'Valle de prueba' }],
      ...ctx,
    },
  };
}

const guiasDe = (addons) => () => leerMisGuias(addons);

test('leerMisGuias: lee la lista de SnetForeverMisGuias; sin archivo o con un error de escritura da null', () => {
  const lista = leerMisGuias(carpetaAddons());
  assert.equal(lista.length, 4);
  assert.equal(lista[0].nombre, 'Valle de prueba');
  assert.equal(leerMisGuias(carpetaAddons(null)), null);
  assert.equal(leerMisGuias(carpetaAddons('SnetForeverMisGuias = {\n  {nombre = "rota",\n')), null);
  assert.equal(leerMisGuias(carpetaAddons('Otra = {}\n')), null);
  assert.equal(leerMisGuias(null), null);
  assert.equal(leerMisGuias(undefined), null);
});

test('leerMisGuias: con el archivo sin cambiar no lo vuelve a leer; al cambiar, sí', () => {
  const addons = carpetaAddons();
  const primera = leerMisGuias(addons);
  assert.equal(leerMisGuias(addons), primera, 'la misma lista (de la memoria)');
  const archivo = join(addons, ARCHIVO_MIS_GUIAS);
  writeFileSync(archivo, 'SnetForeverMisGuias = {\n  {nombre = "Nueva", pasos = {{texto = "x"}}},\n}\n');
  const futuro = new Date(Date.now() + 60000);
  utimesSync(archivo, futuro, futuro);
  const segunda = leerMisGuias(addons);
  assert.deepEqual(segunda.map((g) => g.nombre), ['Nueva']);
});

test('hablaDeGuias: guía, guías, guide y guides, con o sin tilde y en mayúsculas; otras palabras no', () => {
  for (const t of ['revisa mis guías', 'MIS GUIAS', 'una guía', 'check my guides', 'which guide?', 'Guia de nivel']) assert.ok(hablaDeGuias(t), t);
  for (const t of ['hola', '¿qué vendo?', 'guiado', 'seguía', '', null, undefined]) assert.ok(!hablaDeGuias(t), String(t));
});

test('hablaDeGuias: también rutas, mazmorras (y «masmorra»), misiones, leveleo y subir de nivel', () => {
  for (const t of ['creame una ruta', 'como llego a la masmorra', '¿Qué mazmorra hago?', 'que misiones me faltan', 'las missiones que tengo',
    'guia de leveleo', 'quiero levelear', 'quiero subir de nivel', 'best dungeon?', 'which quests now', 'leveling route', 'Rutas cerca']) {
    assert.ok(hablaDeGuias(t), t);
  }
  for (const t of ['hola', '¿qué vendo?', 'rutina', 'dimisiones', 'subir la piel']) assert.ok(!hablaDeGuias(t), t);
});

// Guías con nombres y zonas para buscarlas por lo que dice el mensaje (las zonas son las del fixture: 1413 = Los Baldíos,
// The Barrens).
const CON_NOMBRES = [
  { nombre: '[H] 33-34 Ciudad de Dalaran', nombre_en: '[H] 33-34 City of Dalaran', niveles: [33, 34], faccion: 'Horda',
    pasos: [{ aceptar: 790, texto: 'Habla con el mago' }, { entregar: 790, texto: 'Entra en la mazmorra' }] },
  { nombre: '[A] Ciudad de Dalaran', niveles: [33, 34], faccion: 'Alianza', pasos: [{ aceptar: 792 }] },
  { nombre: '[H] 20-22 Lejana', niveles: [20, 22], faccion: 'Horda', pasos: [{ aceptar: 792, ir: [1413, 50, 50] }] },
  { nombre: 'Valle de prueba', niveles: [1, 4], faccion: 'Horda', pasos: [{ aceptar: 788 }, { entregar: 788 }] },
  { nombre: 'Muy alta', niveles: [40, 45], faccion: 'Horde', pasos: [{ texto: 'Nada a tu nivel' }] },
];
const HORDA_3 = { nivel: 3, faccion: 'Horde' };

test('hablaDeGuias: el nombre de una guía propia o de una de sus zonas (sin tildes ni mayúsculas, en los dos idiomas)', () => {
  const o = { lista: CON_NOMBRES, base, pj: { nivel: 15, faccion: 'Horde' } };
  for (const t of ['como llego a dalaran', 'Cómo llego a DALARÁN', 'city of dalaran?', 'estoy en los baldios', 'I am in the Barrens', 'estoy en baldío']) {
    assert.ok(hablaDeGuias(t, o), t);
  }
  assert.ok(!hablaDeGuias('como llego a dalaran'), 'sin la lista, el nombre solo no cuenta');
  assert.ok(!hablaDeGuias('como llego a orgrimmar', o), 'ninguna guía nombra esa zona');
  assert.ok(!hablaDeGuias('estoy en los baldios', { ...o, pj: HORDA_3 }), 'por la zona, solo guías a menos de 10 niveles');
  assert.ok(!hablaDeGuias('como llego a la ciudad', o), 'una palabra corriente del nombre no cuenta');
  assert.ok(!hablaDeGuias('como llego a dalaran', { lista: [CON_NOMBRES[1]], base, pj: HORDA_3 }), 'la de la otra facción no cuenta');
});

// Revisión con datos reales (puntos 1 y 6): una palabra suelta del nombre no basta; hacen falta todas las que distinguen
// una parte del nombre (las partes van separadas por «/» o «:») o la parte entera. Facciones, clases, «misión», «clase»,
// «llave», «parte», «sintonización», piezas de equipo y palabras como «peste», «eastern» o «thousand» no distinguen nada.
const guia = (nombre, nombre_en, niveles, faccion) => ({ nombre, nombre_en, niveles, faccion, pasos: [{ texto: 'x' }] });
const NOMBRES_REVISOR = [
  guia('[H] 35-37 Desolace Horda', '[H] 35-37 Desolace Horde', [35, 37], 'Horda'),
  guia('[H-A] 11-12 Misión de Voidwalker', '[H-A] 11-12 Voidwalker Quest', [11, 12]),
  guia('[H-A] 6-11 Dun Morogh (Cazador)', '[H-A] 6-11 Dun Morogh (Hunter)', [6, 11]),
  guia('[H] Llave de Scholomance (H)', '[H] Scholomance Key (H)', [58, 60], 'Horda'),
  guia('[H-A] Parte 3: Pantalones, hombreras y botas', '[H-A] Part 3: Pants, Shoulders & Boots', [60, 60]),
  guia('[H-A] 23-24 Misiones de clase de Hillsbrad', '[H-A] 23-24 Hillsbrad Class Quests', [23, 24]),
  guia('[H] 22-25 Trabalomas / Baldíos del Sur', '[H] 22-25 Hillsbrad / South Barrens', [22, 25], 'Horda'),
  guia('[H] 33-34 Ciudad de Dalaran', '[H] 33-34 City of Dalaran', [33, 34], 'Horda'),
  guia('[A] 58-60 Tierras de la Peste Occidental/Oriental SoD', '[A] 58-60 Western/Eastern Plaguelands SoD', [58, 60], 'Alianza'),
  guia('[H] 28-30 Mil Agujas JJ', '[H] 28-30 Thousand Needles JJ', [28, 30], 'Horda'),
  guia('[A] 57-58 Estepas Ardientes SoD', '[A] 57-58 Burning Steppes SoD', [57, 58], 'Alianza'),
];
const PJS_REVISOR = [{ nivel: 12, faccion: 'Horde' }, { nivel: 30, faccion: 'Alliance' }];

test('guiasNombradas: los casos del revisor no nombran ninguna guía', () => {
  for (const texto of ['que hace la horda aqui', 'tengo la mision', 'soy cazador', 'la llave', 'necesito botas', 'de clase',
    'the eastern side', 'tengo la peste', 'burning', 'thousand gold', 'quiero la parte 3', 'mision de clase']) {
    for (const pj of PJS_REVISOR) {
      assert.deepEqual([...guiasNombradas(NOMBRES_REVISOR, texto, { base, pj })], [], `${texto} (${pj.faccion})`);
      assert.ok(!hablaDeGuias(texto, { lista: NOMBRES_REVISOR, base, pj }), `hablaDeGuias: ${texto} (${pj.faccion})`);
    }
  }
});

test('guiasNombradas: con todas las palabras que distinguen una parte del nombre, sí (en los dos idiomas)', () => {
  const nombradas = (texto, pj = PJS_REVISOR[0]) => [...guiasNombradas(NOMBRES_REVISOR, texto, { base, pj }).keys()];
  assert.deepEqual(nombradas('voy a desolace'), ['[H] 35-37 Desolace Horda']);
  assert.deepEqual(nombradas('estoy en trabaloma'), ['[H] 22-25 Trabalomas / Baldíos del Sur']);
  assert.deepEqual(nombradas('como llego a dalaran'), ['[H] 33-34 Ciudad de Dalaran']);
  assert.deepEqual(nombradas('ruta de thousand needles'), ['[H] 28-30 Mil Agujas JJ']);
  assert.deepEqual(nombradas('la llave de scholomance'), ['[H] Llave de Scholomance (H)']);
  assert.deepEqual(nombradas('voy a eastern plaguelands', PJS_REVISOR[1]), ['[A] 58-60 Tierras de la Peste Occidental/Oriental SoD']);
  assert.deepEqual(nombradas('estepas ardientes', PJS_REVISOR[1]), ['[A] 57-58 Estepas Ardientes SoD']);
});

// Última revisión (A): nombres reales escritos con una sola palabra daban 0 guías («vale», «keep», «deeps» y «marjal» se
// habían vuelto obligatorias). Una parte cuenta también con una de sus palabras que distinguen de 7 letras o más, solo se
// exigen las de 5 o más, y la frase vale sin su coletilla de punto cardinal ni su cabeza geográfica («Tierras de la …»).
test('guiasNombradas: una palabra larga del nombre basta y solo cuentan las de 5 letras o más', () => {
  const lista = [
    guia('[A] 36-38 Stranglethorn Vale I SoD', undefined, [36, 38], 'Alianza'),
    guia('[H-A] 43-44 Tanaris/Marjal Revolcafango SoD', '[H-A] 43-44 Tanaris/Dustwallow SoD', [43, 44]),
    guia('[H] Blackfathom Deeps', undefined, [24, 30], 'Horda'),
    guia('[H] 30-31 Razorfen Kraul', undefined, [30, 31], 'Horda'),
    guia('[H] Shadowfang Keep', undefined, [22, 30], 'Horda'),
    guia('[A] 57-58 Estepas Ardientes SoD', '[A] 57-58 Burning Steppes SoD', [57, 58], 'Alianza'),
    guia('[A] 58-60 Tierras de la Peste Occidental/Oriental SoD', '[A] 58-60 Western/Eastern Plaguelands SoD', [58, 60], 'Alianza'),
  ];
  const nombradas = (texto, nivel, faccion) => [...guiasNombradas(lista, texto, { base, pj: { nivel, faccion } }).keys()];
  assert.deepEqual(nombradas('stranglethorn', 32, 'Alliance'), ['[A] 36-38 Stranglethorn Vale I SoD']);
  assert.deepEqual(nombradas('revolcafango', 43, 'Horde'), ['[H-A] 43-44 Tanaris/Marjal Revolcafango SoD']);
  assert.deepEqual(nombradas('blackfathom', 24, 'Horde'), ['[H] Blackfathom Deeps']);
  assert.deepEqual(nombradas('razorfen', 30, 'Horde'), ['[H] 30-31 Razorfen Kraul']);
  assert.deepEqual(nombradas('shadowfang', 24, 'Horde'), ['[H] Shadowfang Keep']);
  assert.deepEqual(nombradas('estepas', 52, 'Alliance'), ['[A] 57-58 Estepas Ardientes SoD']);
  assert.deepEqual(nombradas('tierras de la peste', 58, 'Alliance'), ['[A] 58-60 Tierras de la Peste Occidental/Oriental SoD'],
    'la frase sin su coletilla de punto cardinal');
  // Palabras cortas o corrientes solas, no.
  for (const t of ['vale gracias', 'keep going', 'deep', 'kraul', 'la peste', 'tierras']) assert.deepEqual(nombradas(t, 30, 'Horde'), [], t);
});

test('guiasNombradas: la zona por una palabra larga y por su frase sin coletilla ni cabeza («la peste del oeste»)', () => {
  const zonas = { ...ZONAS, 1422: { es: 'Tierras de la Peste del Oeste', en: 'Western Plaguelands' }, 1436: { es: 'Páramos de Poniente', en: 'Westfall' } };
  const b = { ...baseZonas, zona: (m, i) => zonas[m]?.[i] ?? zonas[m]?.en ?? null };
  const lista = [{ nombre: 'Peste', niveles: [58, 58], pasos: [ir(1422)] }, { nombre: 'Oeste', niveles: [58, 58], pasos: [ir(1436)] }];
  const nombradas = (texto) => [...guiasNombradas(lista, texto, { base: b, pj: { nivel: 58, faccion: 'Horde' } }).keys()];
  assert.deepEqual(nombradas('voy a poniente'), ['Oeste']);
  assert.deepEqual(nombradas('la peste del oeste'), ['Peste']);
  assert.deepEqual(nombradas('tierras de la peste'), ['Peste']);
  for (const t of ['tengo la peste', 'unos paramos', 'del oeste']) assert.deepEqual(nombradas(t), [], t);
});

test('guiasNombradas: por su nombre, como mucho 4 (las más cercanas a su nivel)', () => {
  const lista = [10, 30, 13, 50, 11, 12].map((n) => guia(`[H] ${n}-${n} Los Baldíos ${n}`, undefined, [n, n], 'Horda'));
  assert.deepEqual([...guiasNombradas(lista, 'los baldios', { base, pj: { nivel: 12, faccion: 'Horde' } }).keys()].sort(),
    ['[H] 10-10 Los Baldíos 10', '[H] 11-11 Los Baldíos 11', '[H] 12-12 Los Baldíos 12', '[H] 13-13 Los Baldíos 13']);
});

test('hablaDeGuias: «misión» o «quest» en singular no cuentan; en plural, sí', () => {
  for (const t of ['tengo la mision', 'which quest is this', 'esta misión']) assert.ok(!hablaDeGuias(t), t);
  for (const t of ['que misiones hago', 'which quests', 'mis missiones']) assert.ok(hablaDeGuias(t), t);
});

// Revisión con datos reales (punto 3): por zona, solo las zonas propias de la guía (las de sus misiones o las de muchos de
// sus pasos, nunca una capital), con el nombre de la zona entero o todas sus palabras que distinguen, y como mucho 2 por
// zona. Base de mentira con nombres de zonas.
const ZONAS = { 1413: { es: 'Los Baldíos', en: 'The Barrens' }, 1411: { es: 'Durotar', en: 'Durotar' }, 1454: { es: 'Orgrimmar', en: 'Orgrimmar' },
  1425: { es: 'Tierras del Interior', en: 'The Hinterlands' }, 1423: { es: 'Tierras de la Peste del Este', en: 'Eastern Plaguelands' } };
const baseZonas = {
  zona: (m, i) => ZONAS[m]?.[i] ?? ZONAS[m]?.en ?? null,
  mision: (q) => ({ 1: { questLevel: 12, zoneOrSort: 17 }, 2: { questLevel: 12, zoneOrSort: 14 } })[q],
  uiDeArea: (a) => ({ 17: 1413, 14: 1411 })[a] ?? null,
};
const ir = (mapa) => ({ ir: [mapa, 50, 50] });
test('guiasNombradas: por zona, solo sus zonas propias (nunca una capital), la zona entera o todas sus palabras, 2 por zona', () => {
  const pj = { nivel: 12, faccion: 'Horde' };
  const lista = [
    { nombre: 'Pasa por la capital', niveles: [12, 12], pasos: [ir(1454), ir(1454), ir(1454), ir(1411), ir(1411)] },
    { nombre: 'Casi toda en un sitio', niveles: [12, 12], pasos: [ir(1411), ir(1411), ir(1411), ir(1411), ir(1411), ir(1411), ir(1413)] },
    { nombre: 'Por sus misiones', niveles: [11, 12], pasos: [{ aceptar: 1 }, { entregar: 1 }, ir(1454)] },
    { nombre: 'Ruta cerca', niveles: [12, 13], pasos: [ir(1413), ir(1413)] },
    { nombre: 'Ruta lejos', niveles: [16, 18], pasos: [ir(1413), ir(1413)] },
    { nombre: 'Interior', niveles: [12, 12], pasos: [ir(1425)] },
    { nombre: 'Peste', niveles: [12, 12], pasos: [ir(1423)] },
  ];
  const nombradas = (texto) => [...guiasNombradas(lista, texto, { base: baseZonas, pj })].sort();
  assert.deepEqual(nombradas('voy a orgrimmar'), [], 'una capital no es zona propia');
  assert.deepEqual(nombradas('estoy en los baldios'), [['Por sus misiones', 'zona'], ['Ruta cerca', 'zona']],
    'la de sus misiones y la más cercana; «Casi toda en un sitio» solo pasa por allí y la tercera ya no cabe');
  assert.deepEqual(nombradas('voy a durotar'), [['Casi toda en un sitio', 'zona'], ['Pasa por la capital', 'zona']]);
  assert.deepEqual(nombradas('en el interior'), [], '«interior» sola no distingue');
  assert.deepEqual(nombradas('tierras del interior'), [['Interior', 'zona']]);
  assert.deepEqual(nombradas('the eastern side'), []);
  assert.deepEqual(nombradas('eastern plaguelands'), [['Peste', 'zona']]);
});

test('bloqueMisGuias: la guía que nombra el mensaje entra con sus pasos aunque esté fuera de su nivel, y por delante', () => {
  const b = bloqueMisGuias(CON_NOMBRES, { base, pj: HORDA_3, texto: 'como llego a dalaran para hacer la masmorra' });
  assert.deepEqual(b.guias.map((g) => g.nombre), ['[H] 33-34 Ciudad de Dalaran', 'Valle de prueba']);
  assert.equal(b.guias[0].por, 'nombrada');
  assert.equal(b.guias[0].pasos.length, 2);
  assert.match(b.guias[0].pasos[0], /Habla con el mago/);
  assert.ok(!('por' in b.guias[1]), 'la de su nivel no lleva «por»');
  assert.ok(!JSON.stringify(b).includes('[A] Ciudad de Dalaran'), 'la de la Alianza no entra');
  // Por una zona de sus pasos (en inglés), a menos de 10 niveles.
  const z = bloqueMisGuias(CON_NOMBRES, { base, pj: { nivel: 12, faccion: 'Horde' }, texto: 'ruta por The Barrens' });
  assert.equal(z.guias[0].nombre, '[H] 20-22 Lejana');
  assert.equal(z.guias[0].por, 'zona');
  // Solo por una zona y muy lejos de su nivel (más de 10 niveles), no: con los datos reales, «trabaloma» traía una guía de
  // nivel 60 que pasa por esa zona.
  const lejos = bloqueMisGuias([{ nombre: 'Alta por Los Baldíos', niveles: [60, 60], pasos: [{ aceptar: 792, ir: [1413, 5, 5] }] }, CON_NOMBRES[3]],
    { base, pj: HORDA_3, texto: 'ruta por The Barrens' });
  assert.deepEqual(lejos.guias.map((g) => g.nombre), ['Valle de prueba']);
});

test('bloqueMisGuias: la guía elegida en el addon entra siempre con sus pasos, la primera de todas', () => {
  const b = bloqueMisGuias(CON_NOMBRES, { base, pj: HORDA_3, texto: 'creame una ruta para dalaran', elegida: 'Mis guías\\Muy alta' });
  assert.deepEqual(b.guias.map((g) => [g.nombre, g.por ?? '']), [
    ['Muy alta', 'elegida'], ['[H] 33-34 Ciudad de Dalaran', 'nombrada'], ['Valle de prueba', ''],
  ]);
  assert.match(b.guias[0].pasos[0], /Nada a tu nivel/);
  // Una clave que no es de ninguna guía propia no cambia nada.
  const otra = bloqueMisGuias(CON_NOMBRES, { base, pj: HORDA_3, texto: 'mis guías', elegida: 'Leveling\\Durotar' });
  assert.deepEqual(otra.guias.map((g) => g.nombre), ['Valle de prueba']);
});

test('bloqueMisGuias: al recortar por tamaño, la elegida y las nombradas conservan sus pasos y se van antes las de su nivel', () => {
  const largas = [];
  for (let g = 1; g <= 10; g++) {
    largas.push({ nombre: `Larga ${g}`, niveles: [1, 6], faccion: 'Horda',
      pasos: Array.from({ length: 100 + g }, (_, i) => ({ aceptar: [4641, 788, 790, 792][i % 4], texto: `Paso ${i} de la guía ${g}: un texto largo de verdad para que ocupe` })) });
  }
  const nombrada = { nombre: '[H] 33-34 Ciudad de Dalaran', niveles: [33, 34], faccion: 'Horda',
    pasos: Array.from({ length: 50 }, (_, i) => ({ completar: 790, texto: `Paso ${i} dentro de la mazmorra con un texto largo de verdad` })) };
  const b = bloqueMisGuias([...largas, nombrada], { base, pj: HORDA_3, texto: 'ruta a dalaran' });
  assert.ok(JSON.stringify(b).length <= MAX_MIS_GUIAS);
  assert.equal(b.guias[0].nombre, '[H] 33-34 Ciudad de Dalaran');
  assert.equal(b.guias[0].pasos.length, 50, 'la nombrada, entera');
  for (const g of b.guias.slice(1)) assert.ok(g.pasos.length <= 20, `${g.nombre}: ${g.pasos.length} pasos`);
  assert.equal(b.truncado, true);
});

test('prepararTurno: la guía elegida en el addon (ctx.guia) entra con «ruta» aunque el mensaje no diga «guía»', () => {
  const lista = guiasDe(carpetaAddons());
  const t = prepararTurno(base, mensaje({ texto: 'creame la ruta', pj: { nivel: 3 }, ctx: { guia: { clave: 'Mis guías\\Muy alta', titulo: 'Muy alta', misiones: [] } } }),
    undefined, { misGuias: lista });
  assert.equal(t.datos.misGuias.guias[0].nombre, 'Muy alta');
  assert.equal(t.datos.misGuias.guias[0].por, 'elegida');
  const sin = prepararTurno(base, mensaje({ texto: '¿qué vendo?', ctx: { guia: { clave: 'Mis guías\\Muy alta', titulo: 'Muy alta', misiones: [] } } }),
    undefined, { misGuias: lista });
  assert.ok(!('misGuias' in sin.datos), 'sin hablar de guías ni de rutas, no hay bloque');
});

test('prepararTurno: el nombre de una zona de una guía propia basta para que entre (sin decir «guía»)', () => {
  const t = prepararTurno(base, mensaje({ texto: 'como llego a los baldios', pj: { nivel: 12 } }), undefined, { misGuias: guiasDe(carpetaAddons()) });
  assert.deepEqual(t.datos.misGuias.guias.map((g) => [g.nombre, g.por]), [['Para todos', 'zona']]);
});

test('prepararTurno: en el recorte general queda la guía elegida', () => {
  const registro = Array.from({ length: 40 }, (_, i) => ({ q: 788, c: 0, o: [], t: `Misión con un título larguísimo número ${i}` }));
  const inv = { libres: 1, huecos: 2, bolsas: Array.from({ length: 400 }, (_, i) => ({ id: 2589 + i, n: 1, ca: 1, l: 0 })), equipo: [] };
  const guia = { clave: 'Mis guías\\Larga 7', titulo: 'Larga 7', misiones: [] };
  const t = prepararTurno(base, mensaje({ ctx: { registro, inv, guia } }), undefined, { misGuias: guiasDe(carpetaAddons(muchasGuias(10, 100))) });
  assert.ok(JSON.stringify(t.datos).length <= MAX_DATOS);
  assert.ok(t.datos.recorteApp.includes('misGuias'));
  assert.equal(t.datos.misGuias.guias[0].nombre, 'Larga 7');
  assert.equal(t.datos.misGuias.guias[0].por, 'elegida');
  // La elegida conserva sus pasos (hasta el tope de 60 por guía) y se quitan antes objetos de las bolsas.
  assert.equal(t.datos.misGuias.guias[0].pasos.length, 60);
  assert.ok(t.datos.recorteApp.includes('inventario.objetos'));
});

test('prepararTurno: las nombradas solo por una zona no se protegen: se recortan antes que los objetos de las bolsas', () => {
  const guias = [];
  for (let g = 1; g <= 3; g++) {
    const p = Array.from({ length: 60 + g }, (_, i) => `{aceptar = ${[788, 790, 792][g - 1]}, ir = {1413, 40.${i % 10}, 60.${i % 7}}, texto = "Paso ${i} de la ruta ${g}: un texto largo de verdad para que ocupe sitio"}`);
    guias.push(`{nombre = "Ruta ${g}", niveles = {11, 13}, faccion = "Horda", pasos = {${p.join(', ')}}}`);
  }
  const archivo = `SnetForeverMisGuias = {${guias.join(',\n')}}\n`;
  const registro = Array.from({ length: 40 }, (_, i) => ({ q: 788, c: 0, o: [], t: `Misión con un título larguísimo número ${i}` }));
  const inv = { libres: 1, huecos: 2, bolsas: Array.from({ length: 200 }, (_, i) => ({ id: 2589 + i, n: 1, ca: 1, l: 0 })), equipo: [] };
  const t = prepararTurno(base, mensaje({ texto: '¿qué vendo? voy a los baldios', pj: { nivel: 12 }, ctx: { registro, inv } }), undefined,
    { misGuias: guiasDe(carpetaAddons(archivo)) });
  assert.ok(JSON.stringify(t.datos).length <= MAX_DATOS);
  assert.equal(t.datos.misGuias.guias[0].por, 'zona');
  assert.ok('pasosTotal' in t.datos.misGuias.guias[0], 'la de zona se ha recortado');
  assert.ok(t.datos.recorteApp.includes('misGuias'));
  assert.ok(!t.datos.recorteApp.includes('inventario.objetos'), 'los objetos de las bolsas se quedan');
  assert.equal(t.datos.inventario.objetos.length, 200);
});

// En el juego: el jugador tenía elegida en el addon la guía de mazmorra del propio SnetForever («Mazmorras SnetForever
// (H)\28-33 City of Dalaran») y la app solo mandaba como elegida las de «Mis guías». Ahora una guía del addon elegida
// también entra con sus pasos, y sus sitios (los goto) van a la tabla de puntos con un P#. Guía inventada con misiones y
// mapas del fixture.
const CLAVE_ADDON = 'Mazmorras SnetForever (H)\\28-33 Mazmorra de prueba';
const GUIA_ADDON = {
  clave: CLAVE_ADDON, grupo: 'Mazmorras SnetForever (H)', nombre: '28-33 Mazmorra de prueba', titulo: { en: 'Test Dungeon' },
  tipo: 'mazmorra', faccion: 'Horde', niveles: { min: 28, max: 33 },
  pasos: [
    { n: 1, elementos: [{ t: 'isQuestTurnedIn', qs: [792] }, { t: 'goto', mapa: 1411, x: 43.3, y: 68.5, modo: 'flecha' }, { t: 'accept', q: 4641 }] },
    { n: 2, elementos: [{ t: 'goto', mapa: 1411, x: 8.46, y: 59.21, modo: 'flecha' }, { t: 'subzone', area: 1581, soloInstancia: true }] },
    { n: 3, elementos: [{ t: 'complete', q: 788, objetivo: 1 }] },
    { n: 4, elementos: [{ t: 'goto', mapa: 1413, x: 50.5, y: 49.5, modo: 'flecha' }, { t: 'turnin', q: 4641 }] },
  ],
};

test('bloqueMisGuias: la guía del addon elegida entra con sus pasos, sus misiones, sus niveles y un P# por sitio', () => {
  const llamadas = [];
  const punto = (p) => { llamadas.push(p); return `P${llamadas.length}`; };
  const b = bloqueMisGuias([], { base, pj: { nivel: 28, faccion: 'Horde' }, texto: 'creame la ruta', elegida: CLAVE_ADDON, guiaAddon: GUIA_ADDON, punto });
  const g = b.guias[0];
  assert.equal(g.nombre, 'Test Dungeon');
  assert.equal(g.por, 'elegida');
  assert.equal(g.clave, CLAVE_ADDON);
  assert.equal(g.grupo, 'Mazmorras SnetForever (H)');
  assert.deepEqual(g.niveles, [28, 33]);
  assert.deepEqual(g.misiones.map((m) => m.q), [4641, 788]);
  assert.equal(g.pasos.length, 4);
  assert.match(g.pasos[0], /aceptar 4641/);
  assert.match(g.pasos[0], /Durotar P1/);
  assert.match(g.pasos[1], /entrada de la mazmorra/);
  assert.match(g.pasos[1], /P2/);
  assert.match(g.pasos[2], /completar 788 \(objetivo 1\)/);
  assert.match(g.pasos[3], /entregar 4641/);
  assert.match(g.pasos[3], /Los Baldíos P3/);
  assert.deepEqual(llamadas.map((p) => [p.q, p.papel, p.mapa, p.x, p.y]),
    [[4641, 'recoger', 1411, 43.3, 68.5], [undefined, 'lugar', 1411, 8.46, 59.21], [4641, 'entregar', 1413, 50.5, 49.5]]);
  for (const c of ['43.3', '68.5', '59.21']) assert.ok(!JSON.stringify(b).includes(c), `sin la coordenada ${c}`);
});

// Revisión: los pasos de las guías del addon llevan `filtro` (facción, raza, clase…, como en el addon, nucleo/filtros.lua):
// «(A) 01-09 Zephras Isle» empieza con pasos de la Horda. Solo entran los que le tocan al personaje.
test('bloqueMisGuias: de una guía del addon solo entran los pasos cuyo filtro cumple el personaje', () => {
  const g = { ...GUIA_ADDON, pasos: [
    { n: 1, filtro: [['f:Alliance']], elementos: [{ t: 'accept', q: 790 }] },
    { n: 2, filtro: [['c:WARLOCK']], elementos: [{ t: 'accept', q: 792 }] },
    { n: 3, filtro: [['!r:NightElf']], elementos: [{ t: 'accept', q: 4641 }] },
    { n: 4, filtro: [['f:Horde', 'c:WARRIOR'], ['c:MAGE']], elementos: [{ t: 'complete', q: 788 }] },
    { n: 5, filtro: [['n:30']], elementos: [{ t: 'turnin', q: 4641 }] },
    { n: 6, filtro: false, elementos: [{ t: 'turnin', q: 788 }] },
  ] };
  const pj = { nivel: 28, faccion: 'Horde', clase: 'WARRIOR', raza: 'Orc' };
  const b = bloqueMisGuias([], { base, pj, texto: 'mi guia', elegida: CLAVE_ADDON, guiaAddon: g });
  assert.deepEqual(b.guias[0].pasos, ['1. aceptar 4641', '2. completar 788'], 'fuera la de la Alianza, la de brujo, la de nivel 30 y la de nunca');
  assert.deepEqual(b.guias[0].misiones.map((m) => m.q), [4641, 788]);
  const brujo = bloqueMisGuias([], { base, pj: { ...pj, clase: 'WARLOCK', nivel: 30 }, texto: 'mi guia', elegida: CLAVE_ADDON, guiaAddon: g });
  assert.deepEqual(brujo.guias[0].pasos, ['1. aceptar 792', '2. aceptar 4641', '3. entregar 4641']);
});

// Revisión: las notas de RestedXP traen códigos del juego (iconos |T…|t, colores |c…|r y «::id» del PNJ).
test('bloqueMisGuias: las notas de las guías del addon van sin códigos de iconos ni de colores', () => {
  const nota = '|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con |cRXP_FRIENDLY_Ailee Farheart::251362|r y |cFF00FF00mira|r.';
  const g = { ...GUIA_ADDON, pasos: [{ n: 1, elementos: [{ t: 'goto', mapa: 1411, x: 40, y: 40 }, { t: 'nota', texto: { en: nota, es: nota } }] }] };
  const llamadas = [];
  const b = bloqueMisGuias([], { base, pj: { nivel: 28, faccion: 'Horde' }, texto: 'mi guia', elegida: CLAVE_ADDON, guiaAddon: g,
    punto: (p) => { llamadas.push(p); return 'P1'; } });
  assert.equal(b.guias[0].pasos[0], '1. ir a Durotar P1 · Habla con Ailee Farheart y mira.');
  assert.equal(llamadas[0].texto, 'Habla con Ailee Farheart y mira.');
});

// Revisión: si el recorte general quita puntos de datos.puntos, sus P# no pueden quedarse en los pasos de las guías.
test('quitarPuntosDeGuias: quita de los pasos los P# que ya no están en la tabla, y solo esos', () => {
  const bloque = { guias: [{ pasos: ['1. aceptar 4641 · Durotar P5', '2. ir a Durotar P12 · entrada de la mazmorra', '3. entregar 4641 · P13', '4. Habla con P1ero'] }] };
  quitarPuntosDeGuias(bloque, new Set(['P12', 'P13', 'P1']));
  assert.deepEqual(bloque.guias[0].pasos, ['1. aceptar 4641 · Durotar P5', '2. ir a Durotar · entrada de la mazmorra', '3. entregar 4641', '4. Habla con P1ero']);
  assert.doesNotThrow(() => quitarPuntosDeGuias(undefined, new Set(['P1'])));
});

// Revisión: RestedXP marca algunos pasos con {t="manual", texto={es="1"}}; un texto que solo tiene cifras o signos no es
// una nota: se descarta y la etiqueta del sitio es «Ir a <zona>» (en Zephras, P4, P20 y P23 salían como «1»).
test('bloqueMisGuias: los textos de solo cifras o signos no van al paso ni a la etiqueta', () => {
  const g = { ...GUIA_ADDON, pasos: [{ n: 1, elementos: [{ t: 'goto', mapa: 1411, x: 40, y: 40 }, { t: 'manual', texto: { en: '1', es: '1' } }] },
    { n: 2, elementos: [{ t: 'goto', mapa: 1411, x: 41, y: 41 }, { t: 'nota', texto: { es: '|T x.blp:20|t -> 2.' } }] }] };
  const llamadas = [];
  const b = bloqueMisGuias([], { base, pj: { nivel: 28, faccion: 'Horde' }, texto: 'mi guia', elegida: CLAVE_ADDON, guiaAddon: g,
    punto: (p) => { llamadas.push(p); return `P${llamadas.length}`; } });
  assert.deepEqual(b.guias[0].pasos, ['1. ir a Durotar P1', '2. ir a Durotar P2']);
  assert.deepEqual(llamadas.map((p) => p.texto), ['Ir a Durotar', 'Ir a Durotar']);
});

test('bloqueMisGuias: las guías propias elegidas o nombradas también dan un P# por cada «ir»', () => {
  const llamadas = [];
  const punto = (p) => { llamadas.push(p); return `P${llamadas.length}`; };
  const b = bloqueMisGuias(CON_NOMBRES, { base, pj: HORDA_3, texto: 'mis guias', elegida: 'Mis guías\\[H] 20-22 Lejana', punto });
  assert.equal(b.guias[0].nombre, '[H] 20-22 Lejana');
  assert.match(b.guias[0].pasos[0], /aceptar 792 · Los Baldíos P1/);
  assert.deepEqual(llamadas.map((p) => [p.q, p.papel, p.mapa]), [[792, 'recoger', 1413]]);
  assert.ok(!/P\d/.test(b.guias[1].pasos.join(' ')), 'las de su nivel, sin P#');
});

test('prepararTurno: la guía del addon elegida (ctx.guia) entra aunque no haya guías propias, con sus P# en datos.puntos', () => {
  const ctx = { guia: { clave: CLAVE_ADDON, titulo: 'Test Dungeon', misiones: [] } };
  const t = prepararTurno(base, mensaje({ texto: 'creame la ruta hasta la entrada', pj: { nivel: 28 }, ctx }), undefined,
    { misGuias: null, guiaAddon: (c) => (c === CLAVE_ADDON ? GUIA_ADDON : null) });
  const g = t.datos.misGuias.guias[0];
  assert.equal(g.por, 'elegida');
  const recoger = t.datos.puntos.find((p) => p.q === 4641 && p.papel === 'recoger' && g.pasos[0].includes(`${p.id}`));
  assert.ok(recoger, JSON.stringify(t.datos.puntos));
  assert.equal(t.puntos.get(recoger.id).x, 43.3, 'las coordenadas solo en el Map de la app');
  assert.ok(t.datos.puntos.every((p) => p.x === undefined));
});

test('prepararTurno: si el mensaje no habla de guías, ni siquiera se busca la guía del addon (leer Rutas cuesta)', () => {
  let pedidas = 0;
  const ctx = { guia: { clave: CLAVE_ADDON, titulo: 'Test Dungeon', misiones: [] } };
  const guiaAddon = (c) => { pedidas++; return c === CLAVE_ADDON ? GUIA_ADDON : null; };
  const t = prepararTurno(base, mensaje({ texto: '¿qué vendo?', ctx }), undefined, { misGuias: null, guiaAddon, recientes: [CLAVE_ADDON] });
  assert.ok(!('misGuias' in t.datos));
  assert.equal(pedidas, 0);
});

test('prepararTurno: con una guía del addon elegida que la app no encuentra, el turno sigue sin ella', () => {
  const ctx = { guia: { clave: 'Leveling\\no existe', titulo: 'x', misiones: [] } };
  const t = prepararTurno(base, mensaje({ texto: 'creame la ruta', pj: { nivel: 3 }, ctx }), undefined,
    { misGuias: guiasDe(carpetaAddons()), guiaAddon: () => null });
  assert.ok(!t.datos.misGuias.guias.some((g) => g.por === 'elegida'));
});

// En el juego: «ok y despues de ver a magus que sigue creame la guia completa…» no nombraba Dalaran y la IA dijo que no le
// había llegado la guía. Las guías que entraron con pasos en los últimos turnos (extra.recientes) vuelven, justo detrás de
// la elegida, si el mensaje habla de guías o sigue con lo anterior.
test('prepararTurno: las guías recientes vuelven con «y después… que sigue» y van detrás de la elegida', () => {
  const lista = guiasDe(carpetaAddons());
  const t = prepararTurno(base, mensaje({ texto: 'ok y despues de ver al mago que sigue', pj: { nivel: 3 } }), undefined,
    { misGuias: lista, recientes: ['Mis guías\\Muy alta', CLAVE_ADDON], guiaAddon: (c) => (c === CLAVE_ADDON ? GUIA_ADDON : null) });
  assert.deepEqual(t.datos.misGuias.guias.slice(0, 2).map((g) => [g.nombre, g.por]), [['Test Dungeon', 'reciente'], ['Muy alta', 'reciente']]);
  assert.deepEqual(t.guiasConPasos, [], 'las que vuelven como «reciente» no se apuntan otra vez, ni las de su nivel');
  // Con la elegida, la elegida va primero.
  const conElegida = prepararTurno(base, mensaje({ texto: 'y luego?', pj: { nivel: 3 }, ctx: { guia: { clave: 'Mis guías\\Valle de prueba', misiones: [] } } }),
    undefined, { misGuias: lista, recientes: ['Mis guías\\Muy alta'] });
  assert.deepEqual(conElegida.datos.misGuias.guias.slice(0, 2).map((g) => g.por), ['elegida', 'reciente']);
  // Sin recientes, «y luego?» no trae guías; con recientes pero un mensaje de otra cosa, tampoco.
  assert.ok(!('misGuias' in prepararTurno(base, mensaje({ texto: 'y luego?' }), undefined, { misGuias: lista }).datos));
  assert.ok(!('misGuias' in prepararTurno(base, mensaje({ texto: '¿qué vendo?' }), undefined, { misGuias: lista, recientes: ['Mis guías\\Muy alta'] }).datos));
});

test('esContinuacion: «y después», «que sigue», «luego», «continúa», «then», «next»; otras frases no', () => {
  for (const t of ['y despues?', 'que sigue', 'luego que hago', 'continúa', 'then what', 'next step', 'el siguiente paso']) assert.ok(esContinuacion(t), t);
  for (const t of ['hola', '¿qué vendo?', 'siguiendo', '']) assert.ok(!esContinuacion(t), t);
});

test('prepararTurno: con un mensaje de guías entra datos.misGuias con las de su nivel y su facción', () => {
  const t = prepararTurno(base, mensaje(), undefined, { misGuias: guiasDe(carpetaAddons()) });
  const bloque = t.datos.misGuias;
  assert.ok(bloque, 'entra el bloque');
  assert.deepEqual(t.idsRegistro, [788], 'el registro entero, para validar las paradas (respuesta.mjs)');
  assert.deepEqual(bloque.guias.map((g) => g.nombre), ['Valle de prueba', 'Para todos'],
    'fuera la de la Alianza (es Horda) y la de nivel 40-45; la de su tramo justo va primero');
  const valle = bloque.guias[0];
  assert.deepEqual(valle.niveles, [1, 4]);
  assert.equal(valle.faccion, 'Horde');
  // Las misiones de la guía (solo las de la base), con el nombre del registro o de la base y el estado del registro.
  assert.deepEqual(valle.misiones.map((m) => m.q), [4641, 788, 790]);
  assert.equal(valle.misiones[0].nombre, 'Tu lugar en el mundo');
  assert.equal(valle.misiones[1].estado, 'en_curso');
  assert.ok(!JSON.stringify(bloque).includes('99999'), 'una misión que no está en la base no se manda');
  // Las zonas de sus «ir», con el mapa y el nombre, y los pasos resumidos sin coordenadas.
  assert.deepEqual(valle.zonas, [{ mapa: 1411, zona: 'Durotar' }]);
  assert.equal(valle.pasos.length, 5);
  assert.match(valle.pasos[0], /aceptar 4641/);
  assert.match(valle.pasos[0], /Durotar/);
  assert.match(valle.pasos[0], /Habla con Gornek/);
  assert.match(valle.pasos[1], /entregar 4641/);
  assert.match(valle.pasos[1], /aceptar 788/);
  assert.match(valle.pasos[2], /completar 788/);
  assert.match(valle.pasos[3], /aceptar 790/);
  assert.match(valle.pasos[4], /Vende lo gris/);
  for (const c of ['43.3', '68.5', '42.1', '68.3', '50.5']) assert.ok(!JSON.stringify(bloque).includes(c), `sin la coordenada ${c}`);
  // La clave va solo cuando el addon la mandó en datos.guias (así la IA puede proponer abrirla).
  assert.equal(valle.clave, 'Mis guías\\Valle de prueba');
  assert.ok(!('clave' in bloque.guias[1]));
  assert.ok(t.guias.has('Mis guías\\Valle de prueba'));
  // «Para todos» no lleva niveles: salen de sus misiones (792 es de nivel 5) y vale para las dos facciones.
  assert.deepEqual(bloque.guias[1].niveles, [5, 5]);
  assert.ok(!('faccion' in bloque.guias[1]));
  assert.deepEqual(bloque.guias[1].zonas, [{ mapa: 1413, zona: 'Los Baldíos' }]);
  assert.ok(!('truncado' in bloque));
});

test('prepararTurno: un personaje de la Alianza de nivel 3 ve la suya y la de todos, no la de la Horda', () => {
  const t = prepararTurno(base, mensaje({ pj: { faccion: 'Alliance', raza: 'Human', clase: 'MAGE' } }), undefined,
    { misGuias: guiasDe(carpetaAddons()) });
  assert.deepEqual(t.datos.misGuias.guias.map((g) => g.nombre).sort(), ['Guía de la Alianza', 'Para todos']);
});

test('prepararTurno: a nivel 42 solo entra la de 40-45 (las de nivel bajo quedan lejos)', () => {
  const t = prepararTurno(base, mensaje({ pj: { nivel: 42 } }), undefined, { misGuias: guiasDe(carpetaAddons()) });
  assert.deepEqual(t.datos.misGuias.guias.map((g) => g.nombre), ['Muy alta']);
});

test('prepararTurno: en inglés, el texto del paso es el texto_en si lo hay', () => {
  const t = prepararTurno(base, mensaje({ idioma: 'en', texto: 'check my guides' }), undefined, { misGuias: guiasDe(carpetaAddons()) });
  const valle = t.datos.misGuias.guias.find((g) => g.nombre === 'Valle de prueba');
  assert.match(valle.pasos[2], /Kill boars/);
  assert.equal(valle.misiones[0].nombre, 'Your Place In The World');
});

// 17-nov: los pasos de Mis guías pueden llevar clase, raza y facción (y sin_clase / sin_raza), como en el addon
// (motor/misguias.lua): los de otra clase, raza o facción no le llegan a la IA (deOtraClase los cuenta, como leer_guia) y
// uno con un nombre que no se entiende no le llega a nadie.
const POR_CLASE = [{ nombre: 'Valle por clase', niveles: [1, 4], pasos: [
  { aceptar: 4641, texto: 'Para todos' },
  { aceptar: 788, clase: 'Mago', texto: 'Solo magos' },
  { completar: 788, clase: ['Guerrero', 'mage'] },
  { entregar: 788, clase: 'WARRIOR', raza: 'Orco' },
  { texto: 'Solo trols', raza: 'Trol' },
  { texto: 'Solo la Alianza', faccion: 'Alianza' },
  { texto: 'Menos los guerreros', sin_clase: 'guerrero' },
  { aceptar: 790, texto: 'Ni orcos ni humanos', sin_raza: ['Orc', 'Humano'] },
  { aceptar: 792, clase: 'Magoo', texto: 'Clase ilegible' },
] }];
const numeros = (g) => g.pasos.map((p) => p.split('.')[0]);

test('bloqueMisGuias: de una guía propia solo entran los pasos de la clase, la raza y la facción del personaje', () => {
  const orco = bloqueMisGuias(POR_CLASE, { base, pj: { nivel: 3, faccion: 'Horde', clase: 'WARRIOR', raza: 'Orc' }, texto: 'mis guias' }).guias[0];
  assert.deepEqual(numeros(orco), ['1', '3', '4'], 'los pasos guardan su número de la guía');
  assert.equal(orco.deOtraClase, 5);
  assert.deepEqual(orco.misiones.map((m) => m.q), [4641, 788]);
  const trol = bloqueMisGuias(POR_CLASE, { base, pj: { nivel: 3, faccion: 'Horde', clase: 'MAGE', raza: 'Troll' }, texto: 'mis guias' }).guias[0];
  assert.deepEqual(numeros(trol), ['1', '2', '3', '5', '7', '8']);
  assert.equal(trol.deOtraClase, 2);
  assert.deepEqual(trol.misiones.map((m) => m.q), [4641, 788, 790]);
  // Sin saber su clase ni su raza, esos pasos entran (como leer_guia); la facción sí se sabe.
  const sinClase = bloqueMisGuias(POR_CLASE, { base, pj: { nivel: 3, faccion: 'Horde' }, texto: 'mis guias' }).guias[0];
  assert.deepEqual(numeros(sinClase), ['1', '2', '3', '4', '5', '7', '8']);
  assert.equal(sinClase.deOtraClase, 1);
  for (const b of [orco, trol, sinClase]) {
    assert.ok(!JSON.stringify(b).includes('Clase ilegible'), 'el paso con una clase que no se entiende no llega a nadie');
    assert.ok(!b.misiones.some((m) => m.q === 792));
  }
  // Una guía sin pasos con clase no lleva deOtraClase.
  assert.ok(!('deOtraClase' in bloqueMisGuias(CON_NOMBRES, { base, pj: HORDA_3, texto: 'mis guias' }).guias[0]));
});

// Ronda 2 (M1, M2): los nombres se normalizan como en el addon (tildes agudas y graves, también en mayúscula, antes de las
// mayúsculas; otra tilde no se entiende) y de una lista solo cuenta su parte de lista (1, 2, 3… hasta el primer hueco).
test('filtroDePasoPropio: tildes y listas con huecos, igual que el addon', () => {
  const lista = leerMisGuias(carpetaAddons(`SnetForeverMisGuias = {
  {nombre = "Nombres raros", pasos = {
    {aceptar = 4641, clase = "Màgo"},
    {aceptar = 4641, clase = "GUÉRRERO"},
    {aceptar = 4641, clase = "Mâgo"},
    {aceptar = 4641, clase = {"Mago", nil, "Brujo"}},
    {aceptar = 4641, raza = {[2] = "Orco"}},
    {aceptar = 4641, raza = {x = "Orco"}},
    {aceptar = 4641, raza = "ÉLFO DE LA NÒCHE"},
  }},
}`));
  assert.deepEqual(Object.values(lista[0].pasos).map(filtroDePasoPropio), [
    [['c:MAGE']], [['c:WARRIOR']], false, [['c:MAGE']], false, false, [['r:NightElf']],
  ]);
});

// Ronda 2 (decisión 1): la guía entera de una clase o raza (clase, raza, sin_clase, sin_raza), como en el addon (guia.filtro):
// no le llega a la IA de quien no la cumple, ni nombrada ni elegida; con un nombre que no se entiende, a nadie.
const GUIAS_DE_CLASE = [
  { nombre: 'Solo cazadores', niveles: [1, 5], faccion: 'Alianza', clase: 'Cazador', pasos: [{ aceptar: 792 }] },
  { nombre: 'Sin guerreros', niveles: [1, 5], sin_clase: ['Guerrero'], pasos: [{ aceptar: 4641 }] },
  { nombre: 'Clase rara', niveles: [1, 5], clase: 'Magoo', pasos: [{ aceptar: 4641 }] },
  { nombre: 'Para todos', niveles: [1, 5], pasos: [{ aceptar: 790 }] },
];
const nombresDe = (b) => (b?.guias ?? []).map((g) => g.nombre).sort();

test('bloqueMisGuias: una guía de una clase o raza solo le llega a quien la cumple; con un nombre raro, a nadie', () => {
  const orco = { nivel: 3, faccion: 'Horde', clase: 'WARRIOR', raza: 'Orc' };
  assert.deepEqual(nombresDe(bloqueMisGuias(GUIAS_DE_CLASE, { base, pj: orco, texto: 'mis guias' })), ['Para todos']);
  assert.deepEqual(nombresDe(bloqueMisGuias(GUIAS_DE_CLASE, { base, pj: orco, texto: 'la guia sin guerreros' })), ['Para todos']);
  assert.deepEqual(nombresDe(bloqueMisGuias(GUIAS_DE_CLASE, { base, pj: orco, texto: 'mis guias', elegida: 'Mis guías\\Clase rara' })),
    ['Para todos']);
  const cazador = { nivel: 3, faccion: 'Alliance', clase: 'HUNTER', raza: 'Human' };
  assert.deepEqual(nombresDe(bloqueMisGuias(GUIAS_DE_CLASE, { base, pj: cazador, texto: 'mis guias' })),
    ['Para todos', 'Sin guerreros', 'Solo cazadores']);
  // Sin saber su clase, las de clase entran (como los pasos); la rara, nunca.
  assert.deepEqual(nombresDe(bloqueMisGuias(GUIAS_DE_CLASE, { base, pj: { nivel: 3, faccion: 'Alliance' }, texto: 'mis guias' })),
    ['Para todos', 'Sin guerreros', 'Solo cazadores']);
  assert.equal(guiasNombradas(GUIAS_DE_CLASE, 'la guia sin guerreros', { base, pj: orco }).size, 0);
});

test('prepararTurno: los pasos de Mis guías de otra clase o raza que la del personaje no le llegan a la IA', () => {
  const archivo = `SnetForeverMisGuias = {
  {nombre = "Valle por clase", niveles = {1, 4}, faccion = "Horda", pasos = {
    {aceptar = 4641, texto = "Para todos"},
    {aceptar = 788, clase = "Guerrero", texto = "Solo guerreros"},
    {aceptar = 790, clase = {"Mago", "Brujo"}, raza = "Trol", texto = "Trols magos o brujos"},
  }},
}`;
  const addons = carpetaAddons(archivo);
  const guerrero = prepararTurno(base, mensaje(), undefined, { misGuias: guiasDe(addons) }).datos.misGuias.guias[0];
  assert.deepEqual(numeros(guerrero), ['1', '2']);
  assert.equal(guerrero.deOtraClase, 1);
  const mago = prepararTurno(base, mensaje({ pj: { clase: 'MAGE', raza: 'Troll' } }), undefined, { misGuias: guiasDe(addons) })
    .datos.misGuias.guias[0];
  assert.deepEqual(numeros(mago), ['1', '3']);
  assert.match(mago.pasos[1], /Trols magos o brujos/);
});

test('prepararTurno: si el mensaje no habla de guías ni nombra ninguna, no hay bloque (el archivo se lee una vez, para buscar nombres)', () => {
  let leidas = 0;
  const addons = carpetaAddons();
  const t = prepararTurno(base, mensaje({ texto: '¿qué vendo?' }), undefined, { misGuias: () => { leidas += 1; return leerMisGuias(addons); } });
  assert.ok(!('misGuias' in t.datos));
  assert.ok(leidas <= 1);
});

test('prepararTurno: sin archivo, con un archivo roto o con una fuente que falla, no hay bloque y el turno sigue', () => {
  for (const misGuias of [guiasDe(carpetaAddons(null)), guiasDe(carpetaAddons('SnetForeverMisGuias = {')), () => { throw new Error('x'); }, undefined, null, 'basura']) {
    const t = prepararTurno(base, mensaje(), undefined, { misGuias });
    assert.ok(!('misGuias' in t.datos));
    assert.equal(t.datos.personaje.nivel, 3);
  }
});

test('prepararTurno: ninguna guía a su nivel ni de su facción, sin bloque', () => {
  const t = prepararTurno(base, mensaje({ pj: { nivel: 25 } }), undefined, { misGuias: guiasDe(carpetaAddons()) });
  assert.ok(!('misGuias' in t.datos));
});

// Muchas guías largas: el bloque se recorta (menos pasos y menos guías) y lo dice; el resto de los datos cabe en el tope.
function muchasGuias(n, pasos) {
  const guias = [];
  for (let g = 1; g <= n; g++) {
    const p = [];
    for (let i = 0; i < pasos + g - 1; i++) { // un paso más en cada una: no son la misma guía
      p.push(`{aceptar = ${[4641, 788, 790, 792][i % 4]}, ir = {1411, 40.${i % 10}, 60.${i % 7}}, texto = "Paso ${i} de la guía ${g}: un texto largo de verdad para que ocupe sitio en los datos"}`);
    }
    guias.push(`{nombre = "Larga ${g}", niveles = {1, 6}, faccion = "Horda", pasos = {${p.join(', ')}}}`);
  }
  return `SnetForeverMisGuias = {${guias.join(',\n')}}\n`;
}

test('prepararTurno: con muchas guías largas el bloque respeta su tope, dice truncado y los datos caben en MAX_DATOS', () => {
  const t = prepararTurno(base, mensaje(), undefined, { misGuias: guiasDe(carpetaAddons(muchasGuias(30, 200))) });
  const bloque = t.datos.misGuias;
  assert.ok(bloque);
  assert.equal(bloque.truncado, true);
  assert.ok(JSON.stringify(bloque).length <= MAX_MIS_GUIAS, `bloque de ${JSON.stringify(bloque).length}`);
  assert.ok(JSON.stringify(t.datos).length <= MAX_DATOS);
  assert.ok(bloque.guias.length >= 1);
  // Las que no caben con pasos van solo con su nombre y sus niveles.
  assert.ok(bloque.otras.length >= 1);
  assert.deepEqual(Object.keys(bloque.otras[0]).sort(), ['niveles', 'nombre']);
  // Una guía recortada dice cuántos pasos tiene en total.
  assert.equal(bloque.guias[0].pasosTotal, 200);
  assert.ok(bloque.guias[0].pasos.length < 200);
});

test('prepararTurno: si el resto de los datos llena el tope, el bloque se recorta en el recorte general', () => {
  const registro = Array.from({ length: 40 }, (_, i) => ({ q: 788, c: 0, o: [], t: `Misión con un título larguísimo número ${i}` }));
  const inv = { libres: 1, huecos: 2, bolsas: Array.from({ length: 400 }, (_, i) => ({ id: 2589 + i, n: 1, ca: 1, l: 0 })), equipo: [] };
  const t = prepararTurno(base, mensaje({ ctx: { registro, inv } }), undefined, { misGuias: guiasDe(carpetaAddons(muchasGuias(10, 100))) });
  assert.ok(JSON.stringify(t.datos).length <= MAX_DATOS);
  assert.ok(t.datos.recorteApp.includes('misGuias'), 'el recorte general recorta el bloque (antes que los objetos de las bolsas)');
  assert.equal(t.datos.misGuias.truncado, true);
  assert.ok(t.datos.misGuias.guias.length >= 1, 'queda al menos una guía con sus pasos');
});

test('bloqueMisGuias: una lista que no es una lista o guías mal escritas no rompen nada', () => {
  const pj = { nivel: 3, faccion: 'Horde' };
  assert.equal(bloqueMisGuias(null, { base, pj }), null);
  assert.equal(bloqueMisGuias('x', { base, pj }), null);
  assert.equal(bloqueMisGuias([null, 3, { nombre: '' }, { nombre: 'Sin pasos' }, { nombre: 'Pasos raros', pasos: 'x' }], { base, pj }), null);
  const b = bloqueMisGuias([{ nombre: 'Rara', niveles: [9, 2], pasos: [{ aceptar: 'x', ir: [1411, 500, 3], texto: 7 }, { entregar: 4641 }] }], { base, pj });
  assert.equal(b.guias[0].nombre, 'Rara');
  assert.deepEqual(b.guias[0].niveles, [1, 1], 'niveles mal escritos: los de sus misiones (4641 es de nivel 1)');
  assert.deepEqual(b.guias[0].zonas, [], 'un «ir» fuera de 0-100 no da zona');
});

test('bloqueMisGuias: las guías sin niveles ni misiones van detrás de las de su tramo y de las cercanas', () => {
  const lista = [
    { nombre: 'Solo notas', pasos: [{ texto: 'Compra bolsas' }] },
    { nombre: 'Cercana', niveles: [6, 8], pasos: [{ aceptar: 792 }] },
    { nombre: 'Justa', niveles: [2, 4], pasos: [{ aceptar: 788 }] },
  ];
  const b = bloqueMisGuias(lista, { base, pj: { nivel: 3, faccion: 'Horde' } });
  assert.deepEqual(b.guias.map((g) => g.nombre), ['Justa', 'Cercana', 'Solo notas']);
  assert.deepEqual(b.guias[2].niveles, [1, 60]);
});

test('bloqueMisGuias: una guía con las mismas misiones y pasos que otra (la misma en otro idioma) va en otras con igualQue', () => {
  const pasos = [{ aceptar: 788, texto: 'Habla con Gornek' }, { entregar: 788 }];
  const lista = [
    { nombre: 'Valle', niveles: [1, 4], pasos },
    { nombre: 'Valley', niveles: [1, 4], pasos: [{ aceptar: 788, texto: 'Talk to Gornek' }, { entregar: 788 }] },
  ];
  const b = bloqueMisGuias(lista, { base, pj: { nivel: 3, faccion: 'Horde' } });
  assert.deepEqual(b.guias.map((g) => g.nombre), ['Valle']);
  assert.deepEqual(b.otras, [{ nombre: 'Valley', niveles: [1, 4], igualQue: 'Valle' }]);
  assert.ok(!('truncado' in b), 'no es un recorte');
});

test('el prompt explica las guías propias del jugador (datos.misGuias) y cómo armar la ruta con ellas', () => {
  assert.match(SISTEMA, /datos\.misGuias/);
  assert.match(SISTEMA, /guías propias/i);
  assert.match(SISTEMA, /rutaZona/);
});

// 2.ª ronda (en el juego): rutas recortadas por nivel o por ser de mazmorra, «te faltan niveles», pin de internet para un PNJ
// que estaba en los datos y respuestas largas con opciones y fuentes. Las reglas nuevas del prompt.
test('2.ª ronda: el prompt pide rutas enteras sea cual sea el nivel, P# antes que pinesWeb y respuestas directas', () => {
  for (const frase of ['créala entera y en orden, sea cual sea su nivel', 'no le digas «te faltan niveles»', 'una línea al final con el nivel recomendado',
    'no las quites por ser de mazmorra ni porque pidan grupo', '«hasta que me toque entrar»', 'Nunca `pinesWeb` con lo que está en los datos',
    'Directo y corto, sin rodeos', 'no le hables de su nivel', 'no le des varias opciones', '«vuela a A y desde ahí ve por …»', '«a pie por …»',
    '`"reciente"`', 'una del propio SnetForever', 'zona P#']) {
    assert.ok(SISTEMA.includes(frase), `falta «${frase}»`);
  }
  assert.ok(!SISTEMA.includes('sin las de `mazmorra` o `evento` salvo que las pida'), 'la ruta de una guía ya no quita las de mazmorra');
});

test('15-nov: el prompt explica «por» (elegida y nombrada), que sus guías van antes que internet y que no diga que no está sin buscarla', () => {
  for (const frase of ['`por`', '"elegida"', '"nombrada"', 'antes que en internet', 'no inventes PNJ ni nombres de misiones',
    'sin haberla buscado en `datos.misGuias`', 'nombra en el texto cada misión', 'no llevan misiones de mazmorra',
    '`"zona"`', 'sin paradas ni `pinesWeb`']) {
    assert.ok(SISTEMA.includes(frase), `falta «${frase}»`);
  }
});

// Ronda 3: una guía con nombre_antes (el addon pasa el progreso del nombre de antes) se lee igual, con su nombre nuevo.
test('bloqueMisGuias y la biblioteca: nombre_antes no cambia nada (la guía sale con su nombre nuevo)', async () => {
  const lista = leerMisGuias(carpetaAddons(`SnetForeverMisGuias = {
  {nombre = "[A] Solo cazadores", nombre_antes = "[H-A] Solo cazadores", niveles = {1, 5}, faccion = "Alianza", clase = "Cazador",
    pasos = {{aceptar = 792, texto = "Habla con el instructor"}}},
}`));
  const b = bloqueMisGuias(lista, { base, pj: { nivel: 3, faccion: 'Alliance', clase: 'HUNTER', raza: 'Human' }, texto: 'mis guias' });
  assert.deepEqual(b.guias.map((g) => g.nombre), ['[A] Solo cazadores']);
  const { leerArchivoGuia } = await import('../src/biblioteca/leer.mjs');
  const fs = await import('node:fs');
  const dir = carpetaAddons(`SnetForeverMisGuias = {
  {nombre = "[A] Solo cazadores", nombre_antes = "[H-A] Solo cazadores", faccion = "Alianza", clase = "Cazador", pasos = {{aceptar = 792}}},
}`);
  const r = leerArchivoGuia(join(dir, ARCHIVO_MIS_GUIAS), { fs, base });
  assert.deepEqual(r.guias.map((g) => [g.nombre, g.clases]), [['[A] Solo cazadores', ['HUNTER']]]);
});
