// Guías laterales (tarea 12 de la fase 3): Datos.guia y Datos.claves con los dos addons de datos, Guias.esLateral,
// laterales, abrirLateral, titulo, tramo y API.habilidadPorId con la línea vacía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const RUTAS = join(FIXTURES, 'rutas-mini.lua');
const MISIONES = join(FIXTURES, 'misiones-mini.lua');
const LATERALES = join(FIXTURES, 'laterales-mini.lua');

const OSO = 'Cadenas de clase (H)\\druida-oso';
const MINAS = 'Mazmorras SnetForever (H)\\16-21 The Deadmines';
const HERBORISTERIA = 'Profesiones\\01-300 Herbalism (H)';
const INICIO = 'Prueba (H)\\01-02 Inicio';
const INICIO_MAZMORRAS = 'Prueba (H) Mazmorras\\01-02 Inicio';
const SIGUE ='Prueba (H)\\02-03 Sigue';

const DRUIDA = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 10 };

const conLaterales = (jugador = DRUIDA, extra = {}) =>
  nuevaMaquina({ datos: [RUTAS, MISIONES, LATERALES], jugador, ...extra });

const cargar = (m, clave, opciones) =>
  m.lua(`SnetForever.Guias.cargar(${aLua(clave)}${opciones ? `, ${aLua(opciones)}` : ''})`);
const abrir = (m, clave) => m.lua(`SnetForever.Guias.abrirLateral(${aLua(clave)})`);
const estado = (m) => m.lua('SnetForever.Motor.estado()');
const pj = (m) => m.lua('SnetForeverPJ');
const laterales = (m, tipo, personaje) =>
  m.lua(`SnetForever.Guias.laterales(${aLua(tipo)}${personaje ? `, ${aLua(personaje)}` : ''})`);

// ---------------------------------------------------------------------------------------------------
// Datos.guia y Datos.claves
// ---------------------------------------------------------------------------------------------------

test('Datos.guia encuentra la cadena en SNF_MISIONES.guias y la profesión en SNF_RUTAS.guias', () => {
  const m = conLaterales();
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(OSO)}).tipo`), 'cadena');
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(MINAS)}).area`), 1581);
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(HERBORISTERIA)}).tipo`), 'profesion');
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(INICIO)}).clave`), INICIO);
  assert.equal(m.lua('SnetForever.Datos.guia("No existe")'), undefined);
  sinErrores(m);
});

test('Datos.guia sigue resolviendo los alias de SNF_RUTAS antes de mirar SNF_MISIONES', () => {
  const m = conLaterales();
  assert.equal(m.lua('SnetForever.Datos.guia("Prueba (H)\\\\01-09 Cielonato").clave'), 'Prueba (A)\\01-09 Cielonato');
  sinErrores(m);
});

test('Datos.claves es la unión ordenada y sin repetidos de las guías de los dos addons', () => {
  const m = conLaterales();
  const claves = m.lua('SnetForever.Datos.claves()');
  assert.equal(claves.filter((c) => c === OSO).length, 1);
  assert.ok(claves.includes(MINAS) && claves.includes(HERBORISTERIA) && claves.includes(INICIO));
  assert.deepEqual(claves, [...claves].sort(), 'ordenadas');
  assert.equal(new Set(claves).size, claves.length, 'sin repetidos');
  sinErrores(m);
});

test('Datos.claves no repite una clave que está en los dos addons', () => {
  const m = conLaterales();
  m.lua(`SNF_MISIONES.guias[${aLua(INICIO)}] = SNF_RUTAS.guias[${aLua(INICIO)}]`);
  const claves = m.lua('SnetForever.Datos.claves()');
  assert.equal(claves.filter((c) => c === INICIO).length, 1);
  sinErrores(m);
});

test('sin SNF_MISIONES.guias no hay error: Datos.guia y Datos.claves solo ven las de SNF_RUTAS', () => {
  const m = nuevaMaquina({ jugador: DRUIDA });
  assert.equal(m.lua('SNF_MISIONES.guias'), undefined);
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(OSO)})`), undefined);
  assert.ok(m.lua('SnetForever.Datos.claves()').includes(INICIO));
  assert.deepEqual(laterales(m, 'cadena'), []);
  m.lua('SNF_MISIONES.guias = "roto"');
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(OSO)})`), undefined);
  assert.ok(m.lua('SnetForever.Datos.claves()').includes(INICIO));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Guía por defecto, esLateral y laterales
// ---------------------------------------------------------------------------------------------------

test('porDefecto: devuelve valores concretos y ninguna lateral, aunque una cubra el nivel', () => {
  // La cadena (niveles 10-10) contiene el nivel del druida; aun así no es la de por defecto.
  const m = conLaterales();
  // Lote A (52-I1): sin guía principal que contenga el 10, la anterior más cercana de la Horda (Sigue, 2-3), nunca la
  // cadena; con «mazmorras» también, porque la de mazmorras (1-2, orcos y trols) no es para un tauren.
  assert.equal(m.lua(`SnetForever.Guias.porDefecto(${aLua(DRUIDA)}, "normal")`), SIGUE);
  assert.equal(m.lua(`SnetForever.Guias.porDefecto(${aLua(DRUIDA)}, "mazmorras")`), SIGUE);
  assert.equal(m.lua(`SnetForever.Guias.esLateral(${aLua(SIGUE)})`), false);
  const orco = { raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde', nivel: 1 };
  assert.equal(m.lua(`SnetForever.Guias.porDefecto(${aLua(orco)}, "normal")`), INICIO);
  assert.equal(m.lua(`SnetForever.Guias.porDefecto(${aLua(orco)}, "mazmorras")`), INICIO_MAZMORRAS);
  sinErrores(m);
});

test('esLateral: cadena, mazmorra y profesión sí; una guía normal o una clave que no existe, no (y «mejora» es un tipo lateral)', () => {
  const m = conLaterales();
  const es = (clave) => m.lua(`SnetForever.Guias.esLateral(${aLua(clave)})`);
  assert.equal(es(OSO), true);
  assert.equal(es(MINAS), true);
  assert.equal(es(HERBORISTERIA), true);
  assert.equal(es(INICIO), false);
  assert.equal(es('No existe'), false);
  // Lote «Cadenas de mejoras»: las guías de mejora también son laterales con sección propia en el menú.
  assert.deepEqual(m.lua('SnetForever.Guias.LATERALES'), { cadena: true, mejora: true, profesion: true, mazmorra: true });
  sinErrores(m);
});

test('laterales("cadena"): el druida de la Horda ve druida-oso; el guerrero y el druida de la Alianza no ven nada', () => {
  const m = conLaterales();
  assert.deepEqual(laterales(m, 'cadena'), [OSO]);
  assert.deepEqual(laterales(m, 'cadena', { ...DRUIDA, clase: 'WARRIOR' }), []);
  assert.deepEqual(laterales(m, 'cadena', { ...DRUIDA, raza: 'NightElf', faccion: 'Alliance' }), []);
  sinErrores(m);
});

test('laterales por tipo: mazmorra y profesión salen para la Horda, no para la Alianza, y un tipo que no es lateral da lista vacía', () => {
  const m = conLaterales();
  assert.deepEqual(laterales(m, 'mazmorra'), [MINAS]);
  assert.deepEqual(laterales(m, 'profesion'), [HERBORISTERIA]);
  const alianza = { ...DRUIDA, raza: 'Human', faccion: 'Alliance' };
  assert.deepEqual(laterales(m, 'mazmorra', alianza), []);
  assert.deepEqual(laterales(m, 'profesion', alianza), []);
  assert.deepEqual(laterales(m, 'normal'), []);
  sinErrores(m);
});

test('laterales se ordena por el nivel mínimo y luego por el título (con niveles {min, max} o {1, 60})', () => {
  const m = conLaterales();
  const clon = (clave, niveles, titulo) =>
    m.lua(`(function()
      local g = SnetForever.U.copiar(SNF_MISIONES.guias[${aLua(OSO)}])
      g.clave = ${aLua(clave)}; g.niveles = ${aLua(niveles)}; g.titulo = {en = ${aLua(titulo)}}
      SNF_MISIONES.guias[${aLua(clave)}] = g
    end)()`);
  clon('Cadenas de clase (H)\\b', { min: 12, max: 12 }, 'Beta');
  clon('Cadenas de clase (H)\\a', [12, 12], 'Alfa');
  clon('Cadenas de clase (H)\\c', { min: 5, max: 5 }, 'Zeta');
  assert.deepEqual(laterales(m, 'cadena'), ['Cadenas de clase (H)\\c', OSO, 'Cadenas de clase (H)\\a', 'Cadenas de clase (H)\\b']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// abrirLateral
// ---------------------------------------------------------------------------------------------------

test('abrirLateral desde la principal deja volverA = principal y lateral = la clave', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  assert.equal(abrir(m, OSO), true);
  assert.equal(estado(m).clave, OSO);
  assert.equal(pj(m).guia, OSO);
  assert.equal(pj(m).volverA, INICIO);
  assert.equal(pj(m).lateral, OSO);
  assert.equal(m.lua('SnetForever.Avisos.volverA()'), INICIO);
  sinErrores(m);
});

test('abrirLateral desde otra lateral a medias vuelve a esa lateral (T3)', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  abrir(m, OSO);
  assert.equal(estado(m).fin, false);
  assert.equal(abrir(m, HERBORISTERIA), true);
  assert.equal(estado(m).clave, HERBORISTERIA);
  assert.equal(pj(m).volverA, OSO);
  assert.equal(pj(m).lateral, HERBORISTERIA);
  sinErrores(m);
});

test('abrirLateral: volver deja la principal en el mismo paso n y cierra la vuelta', () => {
  const m = conLaterales();
  cargar(m, INICIO, { n: 3 });
  assert.equal(estado(m).actual, 3);
  abrir(m, OSO);
  assert.equal(m.lua('SnetForever.Avisos.volver()'), true);
  assert.equal(estado(m).clave, INICIO);
  assert.equal(estado(m).actual, 3);
  assert.equal(pj(m).volverA, undefined);
  assert.equal(pj(m).lateral, undefined);
  sinErrores(m);
});

test('abrirLateral de una clave que no existe devuelve false y no cambia nada', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  assert.equal(abrir(m, 'Cadenas de clase (H)\\borrada'), false);
  assert.equal(estado(m).clave, INICIO);
  assert.equal(pj(m).volverA, undefined);
  sinErrores(m);
});

test('Guias.cargar a mano borra volverA y lateral', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  abrir(m, OSO);
  assert.equal(pj(m).volverA, INICIO);
  assert.equal(cargar(m, SIGUE), true);
  assert.equal(pj(m).volverA, undefined);
  assert.equal(pj(m).lateral, undefined);
  sinErrores(m);
});

// Vigilancia 5 y F3-17: la lateral guardada y la vuelta tras un /reload.
const ORCO = { raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde', nivel: 1 };

test('F3-17: tras /reload con la lateral existente se conserva la vuelta y «Volver» lleva a la principal en su mismo paso', () => {
  const m = conLaterales(ORCO);
  assert.equal(m.lua('SnetForever.Guias.porDefecto()'), INICIO, 'la de por defecto del orco no es la principal de la prueba');
  cargar(m, SIGUE, { n: 2 });
  abrir(m, HERBORISTERIA);
  sinErrores(m);
  const r = m.recargar();
  assert.equal(estado(r).clave, HERBORISTERIA);
  assert.equal(pj(r).guia, HERBORISTERIA);
  assert.equal(pj(r).volverA, SIGUE);
  assert.equal(pj(r).lateral, HERBORISTERIA);
  assert.equal(r.lua('SnetForever.Avisos.volver()'), true);
  assert.equal(estado(r).clave, SIGUE);
  assert.equal(estado(r).actual, 2);
  assert.equal(pj(r).volverA, undefined);
  sinErrores(r);
});

test('vigilancia 5 / F3-17: con la lateral borrada y volverA existente se carga la principal, no la de por defecto', () => {
  const m = conLaterales(ORCO);
  cargar(m, SIGUE, { n: 2 });
  abrir(m, OSO);
  m.lua('SnetForeverPJ.guia = "Cadenas de clase (H)\borrada"; SnetForeverPJ.lateral = "Cadenas de clase (H)\borrada"');
  const r = m.recargar();
  assert.equal(estado(r).clave, SIGUE);
  assert.equal(estado(r).actual, 2);
  assert.equal(pj(r).guia, SIGUE);
  assert.equal(pj(r).volverA, undefined);
  sinErrores(r);
});

test('vigilancia 5: con la lateral y volverA borradas se carga la guía de por defecto (definida)', () => {
  const m = conLaterales(ORCO);
  cargar(m, SIGUE);
  abrir(m, OSO);
  m.lua('SnetForeverPJ.guia = "Cadenas de clase (H)\borrada"; SnetForeverPJ.lateral = SnetForeverPJ.guia; SnetForeverPJ.volverA = "Prueba (H)\borrada"');
  const r = m.recargar();
  assert.equal(estado(r).clave, INICIO);
  assert.equal(pj(r).guia, INICIO);
  sinErrores(r);
});

test('vigilancia 5: si volverA apunta a una guía que no existe, Avisos.volverA() da nil y volver() no hace nada', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  abrir(m, OSO);
  m.lua('SnetForeverPJ.volverA = "Prueba (H)\\\\borrada"');
  assert.equal(m.lua('SnetForever.Avisos.volverA()'), undefined);
  assert.equal(m.lua('SnetForever.Avisos.volver()'), false);
  assert.equal(estado(m).clave, OSO);
  assert.equal(m.lua('SnetForever.Avisos.ofrecerVuelta()'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// titulo y tramo
// ---------------------------------------------------------------------------------------------------

test('titulo de una mazmorra con area usa C_Map.GetAreaInfo (el juego) y, sin él, el nombre de los datos', () => {
  const m = conLaterales();
  m.nombreJuego('zona', 1581, 'Las Minas de la Muerte');
  assert.equal(m.lua(`SnetForever.Guias.titulo(${aLua(MINAS)})`), 'Mazmorra: Las Minas de la Muerte');
  assert.deepEqual(m.llamadas('C_Map.GetAreaInfo').pop(), [1581]);
  const sin = conLaterales();
  assert.equal(sin.lua(`SnetForever.Guias.titulo(${aLua(MINAS)})`), 'Mazmorra: The Deadmines');
  sinErrores(m);
  sinErrores(sin);
});

test('titulo de una mazmorra en inglés, y el de las otras guías no cambia', () => {
  const m = conLaterales({ ...DRUIDA, idioma: 'enUS' });
  m.nombreJuego('zona', 1581, 'The Deadmines');
  assert.equal(m.lua(`SnetForever.Guias.titulo(${aLua(MINAS)})`), 'Dungeon: The Deadmines');
  assert.equal(m.lua(`SnetForever.Guias.titulo(${aLua(OSO)})`), 'Druid: Bear Form');
  assert.equal(m.lua(`SnetForever.Guias.titulo(${aLua(INICIO)})`), '1-2 Start');
  assert.equal(m.lua('SnetForever.Guias.titulo("No existe")'), undefined);
  sinErrores(m);
});

test('tramo de la profesión es «Habilidad 1-300» y, con el idioma en inglés, «Skill 1-300»', () => {
  const es = conLaterales();
  assert.equal(es.lua(`SnetForever.Guias.tramo(${aLua(HERBORISTERIA)})`), 'Habilidad 1-300');
  const en = conLaterales();
  en.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(en.lua(`SnetForever.Guias.tramo(${aLua(HERBORISTERIA)})`), 'Skill 1-300');
  sinErrores(es);
  sinErrores(en);
});

test('tramo sin campo tramo es «Nivel min-max» (también con niveles {min, max})', () => {
  const m = conLaterales();
  assert.equal(m.lua(`SnetForever.Guias.tramo(${aLua(OSO)})`), 'Nivel 10-10');
  assert.equal(m.lua(`SnetForever.Guias.tramo(${aLua(MINAS)})`), 'Nivel 16-21');
  assert.equal(m.lua(`SnetForever.Guias.tramo(${aLua(INICIO)})`), 'Nivel 1-2');
  assert.equal(m.lua('SnetForever.Guias.tramo("No existe")'), undefined);
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(m.lua(`SnetForever.Guias.tramo(${aLua(MINAS)})`), 'Level 16-21');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Las guías laterales viven en el motor y en la lista de guías
// ---------------------------------------------------------------------------------------------------

test('F3-16: disponibles (el selector principal) no incluye ninguna lateral, con niveles {min, max} sin error', () => {
  const m = conLaterales();
  const todas = m.lua('SnetForever.Guias.disponibles()').flatMap((g) => g.claves);
  assert.ok(todas.includes(INICIO), 'las guías normales siguen');
  for (const lateral of [OSO, MINAS, HERBORISTERIA]) assert.ok(!todas.includes(lateral), lateral);
  const grupos = m.lua('SnetForever.Guias.disponibles()').map((g) => g.grupo);
  assert.ok(!grupos.includes('Profesiones') && !grupos.includes('Cadenas de clase (H)'));
  sinErrores(m);
});

test('titulo de una mazmorra sin nombre de zona (ni del juego ni de los datos) usa el título de la guía', () => {
  const m = conLaterales();
  m.lua('SNF_MISIONES.mazmorra[1581] = nil');
  assert.equal(m.lua(`SnetForever.Guias.titulo(${aLua(MINAS)})`), 'The Deadmines');
  m.lua(`SNF_MISIONES.guias[${aLua(MINAS)}].titulo = nil`);
  assert.equal(m.lua(`SnetForever.Guias.titulo(${aLua(MINAS)})`), '16-21 The Deadmines');
  sinErrores(m);
});

test('cambiarVersion en una lateral devuelve false y no cambia de guía ni el ajuste', () => {
  const m = conLaterales(ORCO);
  cargar(m, INICIO);
  abrir(m, OSO);
  assert.equal(m.lua('SnetForever.Guias.cambiarVersion()'), false);
  assert.equal(estado(m).clave, OSO);
  assert.equal(pj(m).volverA, INICIO);
  assert.equal(m.lua('SnetForever.Ajustes.get("version")'), 'normal');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ruling F3-31: una lateral sale si tiene algún paso para el personaje o si el juego dice que ya tiene alguna de sus
// misiones (en el registro o entregada): manda el juego.
// ---------------------------------------------------------------------------------------------------

const CLARO = 'Cadenas de clase (H)\\druida-claro';
const SKYBORNE = { clase: 'DRUID', raza: 'Skyborne', faccion: 'Horde', nivel: 10 };

// Una cadena con todos sus pasos de una sola raza (como druida-claro en los datos reales, solo Skyborne) y el filtro de
// guía que se le pase (el viejo, solo la clase, o el nuevo, con las razas resueltas).
const ponerCadenaDeRaza = (m, clave, raza, filtro, misiones = [94100, 94101]) =>
  m.lua(`(function()
    local g = SnetForever.U.copiar(SNF_MISIONES.guias[${aLua(OSO)}])
    g.clave = ${aLua(clave)}; g.nombre = "druida-claro"; g.titulo = {en = "Druid: Zz clear", es = "Druida: Zz claro"}
    g.filtro = ${aLua(filtro)}
    g.pasos = {
      {id = "z1", n = 1, etiquetas = {}, requisitos = {}, linea = 0, filtro = {{"r:${raza}"}}, elementos = {
        {t = "accept", q = ${misiones[0]}}}},
      {id = "z2", n = 2, etiquetas = {}, requisitos = {}, linea = 0, filtro = {{"r:${raza}"}}, elementos = {
        {t = "turnin", q = ${misiones[0]}}, {t = "accept", q = ${misiones[1]}}}},
    }
    SNF_MISIONES.guias[${aLua(clave)}] = g
  end)()`);

test('F3-31: con el filtro viejo (solo la clase), el druida tauren no ve una cadena sin pasos para él; el Skyborne sí', () => {
  const m = conLaterales();
  ponerCadenaDeRaza(m, CLARO, 'Skyborne', [['c:DRUID']]);
  assert.deepEqual(laterales(m, 'cadena', DRUIDA), [OSO]);
  assert.deepEqual(laterales(m, 'cadena', SKYBORNE), [OSO, CLARO]);
  sinErrores(m);
});

test('F3-31: con el filtro nuevo (las razas resueltas), el druida tauren no ve la cadena del Skyborne y el Skyborne sí', () => {
  const m = conLaterales();
  ponerCadenaDeRaza(m, CLARO, 'Skyborne', [['c:DRUID', 'r:Skyborne']]);
  assert.deepEqual(laterales(m, 'cadena', DRUIDA), [OSO]);
  assert.deepEqual(laterales(m, 'cadena', SKYBORNE), [OSO, CLARO]);
  sinErrores(m);
});

test('F3-31: manda el juego: un Skyborne que la base no incluye ve la cadena si tiene una de sus misiones en el registro', () => {
  const m = conLaterales(SKYBORNE);
  ponerCadenaDeRaza(m, CLARO, 'Tauren', [['c:DRUID', 'r:Tauren']]);
  assert.deepEqual(laterales(m, 'cadena'), [OSO], 'sin la misión, no la ve');
  // La misión entra en el registro: QUEST_LOG_UPDATE invalida lo memorizado.
  m.estadoMision(94101, { enDiario: true });
  m.disparar('QUEST_LOG_UPDATE');
  assert.deepEqual(laterales(m, 'cadena'), [OSO, CLARO]);
  // Al quitarla del registro deja de verla.
  m.estadoMision(94101, { enDiario: false });
  m.disparar('QUEST_REMOVED', 94101);
  assert.deepEqual(laterales(m, 'cadena'), [OSO]);
  sinErrores(m);
});

test('F3-31: manda el juego también con una misión de la cadena ya entregada', () => {
  const m = conLaterales(SKYBORNE);
  ponerCadenaDeRaza(m, CLARO, 'Tauren', [['c:DRUID', 'r:Tauren']]);
  m.estadoMision(94100, { entregada: true });
  assert.deepEqual(laterales(m, 'cadena'), [OSO, CLARO]);
  sinErrores(m);
});

test('F3-31: la misión en el registro no salta la clase ni la facción de la guía', () => {
  const m = conLaterales(SKYBORNE);
  ponerCadenaDeRaza(m, CLARO, 'Tauren', [['c:DRUID', 'r:Tauren']]);
  m.estadoMision(94101, { enDiario: true });
  assert.deepEqual(laterales(m, 'cadena', { ...SKYBORNE, clase: 'WARRIOR' }), []);
  assert.deepEqual(laterales(m, 'cadena', { ...SKYBORNE, faccion: 'Alliance' }), []);
  sinErrores(m);
});

test('F3-31: lo memorizado es por personaje: cambiar de personaje da su propia lista al momento', () => {
  const m = conLaterales();
  ponerCadenaDeRaza(m, CLARO, 'Skyborne', [['c:DRUID']]);
  assert.deepEqual(laterales(m, 'cadena', SKYBORNE), [OSO, CLARO]);
  assert.deepEqual(laterales(m, 'cadena', DRUIDA), [OSO]);
  assert.deepEqual(laterales(m, 'cadena', SKYBORNE), [OSO, CLARO]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// API.habilidadPorId
// ---------------------------------------------------------------------------------------------------

test('habilidadPorId: rank 0 y maxRank 0 es «no aprendida» (nil); rank 15 de 75 da 15 y 75', () => {
  const m = nuevaMaquina({ forever: true });
  m.lua('BANCO.ponerHabilidad("Herboristería", 0, 0, false, 182)');
  assert.equal(m.lua('SnetForever.API.habilidadPorId(182)'), undefined);
  m.lua('BANCO.ponerHabilidad("Minería", 15, 75, false, 186)');
  assert.deepEqual(m.lua('{SnetForever.API.habilidadPorId(186)}'), [15, 75]);
  // Una línea que el jugador no tiene sigue dando nil; con rango 0 pero máximo, es una línea aprendida.
  assert.equal(m.lua('SnetForever.API.habilidadPorId(999)'), undefined);
  m.lua('BANCO.ponerHabilidad("Desuello", 0, 75, false, 393)');
  assert.deepEqual(m.lua('{SnetForever.API.habilidadPorId(393)}'), [0, 75]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T3-addon: la misma guía de la IA otra vez conserva el progreso si su paso sigue igual; la sexta no echa a la cargada
// ni a la de volver
// ---------------------------------------------------------------------------------------------------

const RUTA_IA = 'IA\\Ruta de prueba (Horda)';
const pasoIA = (texto, extra = []) => ({ etiquetas: {}, requisitos: [], linea: 0,
  elementos: [{ t: 'manual', texto: { es: texto, en: texto } }, ...extra] });
const guiaIA = (clave = RUTA_IA, pasos = [pasoIA('Uno'), pasoIA('Dos'), pasoIA('Tres')]) => ({
  clave, tipo: 'ia', sinVerificar: true, grupo: 'IA', nombre: clave.slice(3),
  titulo: { es: clave.slice(3), en: clave.slice(3) }, faccion: 'Horde', niveles: { min: 1, max: 60 }, siguientes: [],
  mazmorras: {}, fuente: { archivo: 'ia', linea: 0 }, pasos: pasos.map((p, i) => ({ id: `x${i + 1}`, n: i + 1, ...p })),
});
function aceptarIA(m, guia) {
  assert.equal(m.lua(`SnetForever.Ruta.proponerGuia(${aLua(guia)})`), true);
  assert.equal(m.lua('SnetForever.Ruta.aceptarGuia()'), true);
}
const idActual = (m) => m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).id');

test('T3: volver a aceptar la misma clave con pasos iguales conserva el paso; con pasos distintos empieza de cero', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  aceptarIA(m, guiaIA());
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(idActual(m), 'i2');
  // Otra vez la misma, con los mismos pasos (y otro título): sigue en el 2, también tras volver a la principal.
  aceptarIA(m, { ...guiaIA(), titulo: { es: 'Otro título', en: 'Other title' } });
  assert.equal(estado(m).clave, RUTA_IA);
  assert.equal(idActual(m), 'i2');
  assert.equal(pj(m).volverA, INICIO);
  m.lua('SnetForever.Avisos.volver()');
  assert.equal(estado(m).clave, INICIO);
  aceptarIA(m, guiaIA());
  assert.equal(idActual(m), 'i2');
  // El paso guardado cambia de elementos: de cero.
  aceptarIA(m, guiaIA(RUTA_IA, [pasoIA('Uno'), pasoIA('Dos', [{ t: 'accept', q: 4641 }]), pasoIA('Tres')]));
  assert.equal(idActual(m), 'i1');
  // Y si el paso guardado ya no existe, también.
  m.lua('SnetForever.Motor.irA(3)');
  aceptarIA(m, guiaIA(RUTA_IA, [pasoIA('Uno'), pasoIA('Dos')]));
  assert.equal(idActual(m), 'i1');
  sinErrores(m);
});

// Ronda 1 (I1): la clave es la de la zona; una ruta rehecha de la misma zona no es la misma guía aunque sus pasos se
// parezcan. Solo se conserva si la guía entera coincide.
const conSitio = (texto, x) => pasoIA(texto, [{ t: 'goto', mapa: 1411, x, y: 40, modo: 'flecha' }]);
const deRuta = (m) => m.lua(`(function() local n = 0
  for _, s in ipairs(SnetForeverPJ.saltados) do if s.clave == ${aLua(RUTA_IA)} then n = n + 1 end end return n end)()`);
// Las marcas a mano de la ruta: las casillas (forzados) y los manuales.
const forzados = (m) => m.lua(`(function() local p = SnetForeverPJ.progreso[${aLua(RUTA_IA)}]
  local n = 0
  for _, campo in ipairs({"forzados", "manuales"}) do
    if p and type(p[campo]) == "table" then for _ in pairs(p[campo]) do n = n + 1 end end
  end
  return n end)()`);

test('ronda 1 (I1): la misma clave con los pasos en otro orden empieza de cero, sin saltados ni marcas', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  aceptarIA(m, guiaIA());
  m.lua('SnetForever.Motor.saltar(1)');
  assert.equal(idActual(m), 'i2');
  assert.equal(deRuta(m), 1);
  // Una marca a mano en el paso 3 (su manual), sin pasar por él.
  m.lua('SnetForever.Motor.marcarHecho(3, 1, true)');
  assert.equal(forzados(m), 1);
  aceptarIA(m, guiaIA(RUTA_IA, [pasoIA('Tres'), pasoIA('Uno'), pasoIA('Dos')]));
  assert.equal(idActual(m), 'i1');
  assert.equal(m.lua('SnetForever.Motor.paso(1).elementos[1].datos.texto.es'), 'Tres');
  assert.equal(deRuta(m), 0);
  assert.equal(forzados(m), 0);
  sinErrores(m);
});

test('ronda 1 (I1): la misma clave sin el primer paso empieza de cero, sin saltados ni marcas', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  const pasos = [10, 20, 30, 40, 50].map((x, k) => conSitio(`Sitio ${k + 1}`, x));
  aceptarIA(m, guiaIA(RUTA_IA, pasos));
  m.lua('SnetForever.Motor.saltar(1)');
  m.lua('SnetForever.Motor.irA(4)');
  assert.equal(idActual(m), 'i4');
  m.lua('SnetForever.Motor.marcarHecho(4, 2, true)');
  assert.equal(forzados(m), 1);
  aceptarIA(m, guiaIA(RUTA_IA, pasos.slice(1)));
  assert.equal(idActual(m), 'i1');
  assert.equal(m.lua('SnetForever.Motor.paso(1).elementos[1].datos.texto.es'), 'Sitio 2');
  assert.equal(deRuta(m), 0);
  assert.equal(forzados(m), 0);
  // La misma guía entera, sí: sigue donde iba.
  m.lua('SnetForever.Motor.irA(3)');
  aceptarIA(m, guiaIA(RUTA_IA, pasos.slice(1)));
  assert.equal(idActual(m), 'i3');
  // Solo cambian las coordenadas de un paso (o el texto de su nota): de cero.
  aceptarIA(m, guiaIA(RUTA_IA, [conSitio('Sitio 2', 21), ...pasos.slice(2)]));
  assert.equal(idActual(m), 'i1');
  m.lua('SnetForever.Motor.irA(3)');
  aceptarIA(m, guiaIA(RUTA_IA, [conSitio('Otro sitio', 21), ...pasos.slice(2)]));
  assert.equal(idActual(m), 'i1');
  sinErrores(m);
});

test('T3: la sexta guía de la IA echa a la más antigua que no es la cargada ni la de volver', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  const clave = (k) => `IA\\Ruta ${k} (Horda)`;
  // La 1 (la más antigua) queda como guía a la que volver: la 2 se abre encima de ella, a medias.
  aceptarIA(m, guiaIA(clave(1)));
  aceptarIA(m, guiaIA(clave(2)));
  assert.equal(pj(m).volverA, clave(1));
  // Se abren encima la 3, la 4 y la 5 (cada una a medias pasa a ser la de volver).
  for (const k of [3, 4, 5]) aceptarIA(m, guiaIA(clave(k)));
  assert.equal(estado(m).clave, clave(5));
  assert.equal(pj(m).volverA, clave(4));
  // Con la sexta se va la más antigua, la 1: ni es la cargada ni la de volver.
  aceptarIA(m, guiaIA(clave(6)));
  let guardadas = m.lua('SnetForever.Ruta.guiasIA()');
  assert.equal(guardadas.length, 5);
  assert.ok(!guardadas.includes(clave(1)), guardadas.join(' | '));
  // La de volver no se va: con la 2 (ahora la más antigua) cargada a mano y la 7 abierta encima, la 2 es la de volver
  // y se va la 3.
  cargar(m, clave(2));
  aceptarIA(m, guiaIA(clave(7)));
  assert.equal(pj(m).volverA, clave(2));
  guardadas = m.lua('SnetForever.Ruta.guiasIA()');
  assert.equal(guardadas.length, 5);
  assert.ok(guardadas.includes(clave(2)), guardadas.join(' | '));
  assert.ok(!guardadas.includes(clave(3)), guardadas.join(' | '));
  // La cargada tampoco: con la 2 cargada a mano (sin vuelta), la octava echa a la 4.
  cargar(m, clave(2));
  assert.equal(pj(m).volverA, undefined);
  aceptarIA(m, guiaIA(clave(8)));
  guardadas = m.lua('SnetForever.Ruta.guiasIA()');
  assert.equal(guardadas.length, 5);
  assert.ok(guardadas.includes(clave(2)), guardadas.join(' | '));
  assert.ok(!guardadas.includes(clave(4)), guardadas.join(' | '));
  sinErrores(m);
});

// Ronda 1 (Menor 3): sin el paso del id guardado, el número de «(paso N)» sale del mismo sitio en que se abriría.
test('ronda 1: numeroGuardado busca el paso como Motor.cargar (un n que ya no existe va al último)', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  m.lua(`SnetForeverPJ.progreso[${aLua(SIGUE)}] = {id = "ya-no-existe", n = 99}`);
  const n = m.lua(`(SnetForever.Motor.numeroGuardado(${aLua(SIGUE)}))`);
  cargar(m, SIGUE);
  assert.equal(n, m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).numero'));
  assert.ok(n > 1, String(n));
  sinErrores(m);
});

// Ronda 1 (Menor 4): el número de «(paso N)» se memoriza hasta el siguiente cambio (los mismos eventos que algoQueHacer).
test('ronda 1: Avisos.pasoVolver memoriza el número hasta el siguiente cambio de estado', () => {
  const m = conLaterales();
  cargar(m, INICIO, { n: 3 });
  abrir(m, OSO);
  m.lua(`CUENTA_NUMERO = 0
  local original = SnetForever.Motor.numeroGuardado
  SnetForever.Motor.numeroGuardado = function(...) CUENTA_NUMERO = CUENTA_NUMERO + 1 return original(...) end`);
  assert.equal(m.lua('SnetForever.Avisos.pasoVolver()'), 3);
  assert.equal(m.lua('SnetForever.Avisos.pasoVolver()'), 3);
  assert.equal(m.lua('CUENTA_NUMERO'), 1);
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(m.lua('SnetForever.Avisos.pasoVolver()'), 3);
  assert.equal(m.lua('CUENTA_NUMERO'), 2);
  // Si cambia su progreso guardado, se vuelve a mirar aunque no haya evento.
  m.lua(`SnetForeverPJ.progreso[${aLua(INICIO)}] = nil`);
  assert.equal(m.lua('SnetForever.Avisos.pasoVolver()'), 1);
  assert.equal(m.lua('CUENTA_NUMERO'), 3);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T3, ronda 2: la vuelta es una pila corta (3 como mucho) por personaje: volverA es la cima y vueltas, las de debajo
// ---------------------------------------------------------------------------------------------------

test('ronda 2: cada guía a medias se apila al abrir una lateral encima; como mucho 3 (se va la más antigua)', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  for (const c of [OSO, HERBORISTERIA, SIGUE]) {
    abrir(m, c);
    assert.equal(estado(m).fin, false, c);
  }
  abrir(m, INICIO_MAZMORRAS);
  assert.equal(pj(m).volverA, SIGUE);
  assert.deepEqual(pj(m).vueltas, [OSO, HERBORISTERIA], 'la principal, la más antigua, se fue');
  // Volver de una en una.
  for (const [cargada, siguiente] of [[SIGUE, HERBORISTERIA], [HERBORISTERIA, OSO], [OSO, undefined]]) {
    assert.equal(m.lua('SnetForever.Avisos.volver()'), true);
    assert.equal(estado(m).clave, cargada);
    assert.equal(pj(m).volverA, siguiente);
  }
  assert.equal(pj(m).vueltas, undefined);
  sinErrores(m);
});

test('ronda 2: una guía no se repite en la pila; abrir la de la cima la desapila', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  abrir(m, OSO);
  abrir(m, HERBORISTERIA);
  assert.equal(pj(m).volverA, OSO);
  assert.deepEqual(pj(m).vueltas, [INICIO]);
  // La principal desde el menú de laterales: sale de la pila y la herboristería (a medias) se apila.
  abrir(m, INICIO);
  assert.equal(pj(m).volverA, HERBORISTERIA);
  assert.deepEqual(pj(m).vueltas, [OSO]);
  // El oso otra vez: sale de debajo y no se repite.
  abrir(m, OSO);
  assert.equal(pj(m).volverA, INICIO);
  assert.deepEqual(pj(m).vueltas, [HERBORISTERIA]);
  sinErrores(m);
});

test('ronda 2: el botón salta las de la cima acabadas o sin nada que hacer y las quita; si ninguna vale, no quita nada', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  abrir(m, OSO);
  abrir(m, HERBORISTERIA);
  assert.equal(pj(m).volverA, OSO);
  // La cima (el oso) queda guardada acabada: el botón da la principal y el oso sale de la pila.
  const acabar = (c) => m.lua(`(function() local g = SnetForever.Datos.guia(${aLua(c)})
    SnetForeverPJ.progreso[${aLua(c)}] = {id = SnetForever.Motor.idPaso(g.pasos[#g.pasos], #g.pasos), pasado = true} end)()`);
  acabar(OSO);
  // El registro cargado (hay una misión en el diario): algoQueHacer mira de verdad.
  m.estadoMision(9103, { enDiario: true });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(m.lua('SnetForever.Misiones.registroListo()'), true);
  assert.equal(m.lua(`SnetForever.Guias.algoQueHacer(${aLua(OSO)})`), false);
  assert.equal(m.lua(`SnetForever.Guias.algoQueHacer(${aLua(INICIO)})`), true);
  assert.equal(m.lua('SnetForever.Avisos.botonVolver()'), INICIO);
  assert.equal(pj(m).volverA, INICIO);
  assert.equal(pj(m).vueltas, undefined);
  // Una sola acabada: no sale (la lateral no ha acabado) y se queda para cuando acabe.
  acabar(INICIO);
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(m.lua('SnetForever.Avisos.botonVolver()'), undefined);
  assert.equal(pj(m).volverA, INICIO);
  sinErrores(m);
});

test('ronda 2: la X de «Volver a» quita solo la cima; un volverA de antes (texto, sin pila) vale como pila de uno', () => {
  const m = conLaterales();
  cargar(m, INICIO);
  abrir(m, OSO);
  abrir(m, HERBORISTERIA);
  m.lua('SnetForever.Guias.olvidarVuelta()');
  assert.equal(pj(m).volverA, INICIO);
  assert.equal(pj(m).vueltas, undefined);
  assert.equal(pj(m).lateral, HERBORISTERIA);
  m.lua('SnetForever.Guias.olvidarVuelta()');
  assert.equal(pj(m).volverA, undefined);
  assert.equal(pj(m).lateral, undefined);
  // Lo guardado por la versión de antes: solo volverA y lateral.
  m.lua(`SnetForeverPJ.volverA = ${aLua(SIGUE)}; SnetForeverPJ.lateral = ${aLua(HERBORISTERIA)}; SnetForeverPJ.vueltas = nil`);
  const m2 = m.recargar();
  assert.equal(m2.lua('SnetForever.Motor.estado().clave'), HERBORISTERIA);
  assert.equal(m2.lua('SnetForever.Avisos.volverA()'), SIGUE);
  assert.equal(m2.lua('SnetForever.Avisos.volver()'), true);
  assert.equal(m2.lua('SnetForever.Motor.estado().clave'), SIGUE);
  assert.equal(m2.lua('SnetForeverPJ.volverA'), undefined);
  sinErrores(m2);
});
