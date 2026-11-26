// Servidor de herramientas: buscar_guias y leer_guia sobre la biblioteca de fixtures indexada (tarea 4), el turno y el
// servidor arrancado de verdad. Las guías y la base son inventadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { leerArchivoGuia } from '../src/biblioteca/leer.mjs';
import { ejecutarDatos } from '../src/base/leer-lua.mjs';
import { crearBase } from '../src/base/base.mjs';
import { crearIndice, CARPETA_GUIAS, RUTA_INDICE } from '../src/biblioteca/indice.mjs';
import { NOMBRE_SERVIDOR, HERRAMIENTAS, rutaTurno, turnoDe, escribirTurno } from '../src/herramientas/config.mjs';
import { crearFuentes } from '../src/herramientas/fuentes.mjs';
import { crearCatalogo, casa, sinCoordenadas, textoDeReserva } from '../src/herramientas/catalogo.mjs';
import { puntoDeMarca } from '../src/herramientas/marcas.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(APP, 'test', 'fixtures', 'biblioteca');
const NOMBRE_PJ = 'Personajeinventado';

function baseDePrueba() {
  const raiz = {};
  const cabecera = 'SNF_MISIONES = {version="t",esquema=1,quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}},'
    + 'zonas={area={},nombre={[1413]={en="The Barrens",es="Los Baldíos"},[1411]={en="Durotar",es="Durotar"}}},'
    + 'mazmorra={},porFaccion={}}\n'
    + 'local Q = SNF_MISIONES.quest\nlocal N = SNF_MISIONES.npc\n';
  const resto = 'requiredLevel=1,questLevel=1,requiredRaces=0,requiredClasses=0,objectivesText={},sourceItemId=0,zoneOrSort=0,'
    + 'nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0';
  const cuerpo = `Q[9101] = {name="Lomo de jabalí",startedBy={{9201}},finishedBy={{9202}},${resto}}\n`
    + `Q[9102] = {name="Colmillos del norte",startedBy={{9201}},finishedBy={{9202}},${resto}}\n`
    + 'N[9201] = {name="Da",spawns={[1413]={{50,50}}}}\n'
    + 'N[9202] = {name="Recibe",spawns={[1413]={{60,60}}}}\n';
  ejecutarDatos(cabecera + cuerpo, raiz, 'base.lua');
  return crearBase(raiz.SNF_MISIONES);
}
const base = baseDePrueba();

const mensaje = {
  pj: NOMBRE_PJ, idioma: 'es', texto: '¿qué guías tengo?',
  ctx: {
    pj: { faccion: 'Horde', raza: 'Orc', clase: 'warrior', nivel: 28 },
    lugar: { mapa: 1413, x: 50, y: 50, zona: 'Los Baldíos', subzona: 'El Cruce', instancia: false },
    registro: [{ q: 9101, t: 'Lomo de jabalí', c: 0 }],
    vuelos: ['El Cruce'],
  },
};

// Una guía larga del formato addon (70 pasos): el primero solo «aceptar 9101», el segundo con un texto largo y un
// carácter de control, el resto con punto.
function guiaLarga() {
  const pasos = ['{id="l1",n=1,elementos={{t="accept",q=9101}}}',
    `{id="l2",n=2,elementos={{t="nota",texto="Texto\\7 largo ${'x'.repeat(400)}"}}}`];
  for (let n = 3; n <= 70; n++) pasos.push(`{id="l${n}",n=${n},elementos={{t="goto",mapa=1413,x=${n},y=50},{t="nota",texto="Paso ${n}"}}}`);
  return 'local T = SNF_RUTAS.guias\n'
    + `T["Larga\\\\prueba"]={clave="Larga\\\\prueba",nombre="larga",titulo="Larga de prueba",faccion="Horde",niveles={20,30},pasos={${pasos.join(',')}}}\n`;
}

// Carpeta de datos dentro de SNF_DATOS (aislar.mjs) con los fixtures, una segunda parte de la guía partida (guias_10, que
// va detrás de guias_2: orden natural) y la guía larga; indexada y con el turno escrito.
async function preparar() {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const datos = mkdtempSync(join(process.env.SNF_DATOS, 'herr-'));
  const guias = join(datos, CARPETA_GUIAS);
  mkdirSync(guias, { recursive: true });
  cpSync(FIXTURES, guias, { recursive: true });
  writeFileSync(join(guias, 'addon', 'guias_10.lua'), 'local T = SNF_RUTAS.guias["Pruebas (H)\\\\10-12 Ruta partida"].pasos\n'
    + 'T[1]={id="c3",n=3,elementos={{t="nota",texto={es="Fin de la ruta partida",en="End of the split route"}}}}\n');
  mkdirSync(join(guias, 'larga'));
  writeFileSync(join(guias, 'larga', 'guias_9.lua'), guiaLarga());
  writeFileSync(join(guias, 'sin-faccion.txt'), 'Ruta de los dos bandos por Los Baldíos\n'
    + '1. /way 45.2 67.8 Habla con el guarda\n2. Acepta "Colmillos del norte"\n');
  writeFileSync(join(guias, 'coordenadas.txt'), 'Pasos sueltos\n.goto Orgrimmar,52,50 Habla con el guarda\n'
    + '(30.5, 40.5) Junto al árbol\n.goto The Barrens,52.1,43.6\n');
  await crearIndice({ datos, fs, base: async () => base }).actualizar();
  await escribirTurno(datos, turnoDe(mensaje, { carpetaBase: join(datos, 'no-existe') }), { fs });
  return datos;
}

const herramientas = (fuentes, opciones) => Object.fromEntries(crearCatalogo(fuentes, opciones).map((h) => [h.nombre, h.ejecutar]));
const conBase = (datos, extra = {}) => crearFuentes({ datos, fs, cargar: () => base, ...extra });
const idDe = (datos, archivo, k = 0) => JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8')).guias.find((g) => g.archivo === archivo && g.k === k).id;

let compartida;
const datosCompartidos = async () => (compartida ??= await preparar());

test('constantes', () => {
  assert.equal(NOMBRE_SERVIDOR, 'snetforever');
  assert.deepEqual(HERRAMIENTAS, ['buscar_guias', 'leer_guia', 'misiones_zona', 'mision', 'pnj', 'como_llegar', 'guardar_guia']);
  assert.equal(rutaTurno(join('C:', 'datos')), join('C:', 'datos', 'herramientas', 'turno.json'));
});

test('turnoDe: sale de mensaje.ctx y el nombre del personaje no llega a turno.json', async () => {
  const datos = await datosCompartidos();
  const texto = readFileSync(rutaTurno(datos), 'utf8');
  assert.ok(!texto.includes(NOMBRE_PJ));
  const t = JSON.parse(texto);
  assert.equal(t.version, 1);
  assert.equal(t.idioma, 'es');
  assert.deepEqual(t.pj, { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 28 });
  assert.deepEqual(t.lugar, { mapa: 1413, x: 50, y: 50, zona: 'Los Baldíos', subzona: 'El Cruce', instancia: false });
  assert.deepEqual(t.registro, [9101]);
  assert.deepEqual(t.vuelos, ['El Cruce']);
  assert.equal(t.vuelosIds, null);
  // Revisión final: el servidor no usa la carpeta AddOns: no va en turno.json aunque se pase.
  assert.ok(!Object.hasOwn(t, 'addonsDir'));
  const conIds = turnoDe({ ...mensaje, ctx: { ...mensaje.ctx, vuelosIds: [23, 'x', 23, 45] } }, { carpetaBase: 'b', addonsDir: 'a' });
  assert.deepEqual(conIds.vuelosIds, [23, 45]);
  assert.equal(conIds.carpetaBase, 'b');
  assert.ok(!Object.hasOwn(conIds, 'addonsDir'));
  assert.ok(!JSON.stringify(turnoDe({ pj: NOMBRE_PJ })).includes(NOMBRE_PJ));
});

test('buscar_guias por zona: la de baldios.txt primero, sin la otra facción, y el nivel solo ordena', async () => {
  const datos = await datosCompartidos();
  const { buscar_guias } = herramientas(conBase(datos));
  const r = await buscar_guias({ zona: 'Los Baldíos' });
  assert.ok(r.total >= r.guias.length && r.guias.length > 0 && r.guias.length <= 10);
  assert.equal(r.guias[0].guia, idDe(datos, 'baldios.txt'));
  assert.equal(r.guias[0].archivo, 'baldios.txt');
  assert.equal(r.guias[0].formato, 'texto');
  assert.deepEqual(r.guias[0].niveles, [1, 12]);
  assert.equal(r.guias[0].faccion, 'Horde');
  assert.deepEqual(r.guias[0].zonas, ['Los Baldíos']);
  assert.ok(r.guias[0].pasos > 0);
  assert.equal(r.guias[0].misiones, 1);
  assert.equal(r.aviso, undefined);
  // la de la facción del turno (Horda): sin las de Alianza
  assert.ok(r.guias.every((g) => g.faccion !== 'Alliance'), JSON.stringify(r.guias.map((g) => g.nombre)));
  // con Alianza, ninguna solo de Horda; la página guardada de Alianza sale con su dirección y sin archivo
  const a = await buscar_guias({ zona: 'Los Baldíos', faccion: 'Alianza' });
  assert.ok(a.guias.length > 0);
  assert.ok(a.guias.every((g) => g.faccion !== 'Horde'), JSON.stringify(a.guias.map((g) => g.nombre)));
  const pagina = a.guias.find((g) => g.url);
  assert.equal(pagina.url, 'https://guias.ejemplo.test/baldios');
  assert.equal(pagina.archivo, undefined);
  // nivel 1: la de 10-12 sigue saliendo (solo cambia el orden)
  const partida = idDe(datos, 'addon/guias_3.lua');
  const n1 = await buscar_guias({ zona: 'Los Baldíos', nivel: 1 });
  assert.ok(n1.guias.some((g) => g.guia === partida));
  assert.equal(n1.total, r.total);
  // una guía sin facción pasa el filtro de facción, con la del turno y con la otra
  const sinFaccion = idDe(datos, 'sin-faccion.txt');
  assert.ok(r.guias.some((g) => g.guia === sinFaccion && g.faccion === null));
  assert.ok(a.guias.some((g) => g.guia === sinFaccion));
  // una facción que no existe: se queda la del turno y lo dice
  const rara = await buscar_guias({ zona: 'Los Baldíos', faccion: 'Neutral' });
  assert.equal(rara.aviso, 'faccion_desconocida');
  assert.equal(rara.total, r.total);
  // la zona también por su número y por «aquí» (la del turno)
  assert.equal((await buscar_guias({ zona: 1413 })).total, r.total);
  assert.equal((await buscar_guias({ zona: 'aquí' })).total, r.total);
  assert.equal((await buscar_guias({ zona: 'Durotar' })).total, 0);
});

test('guía partida (R8/R9): una sola en la búsqueda, con la cabecera primero y las partes en orden natural', async () => {
  const datos = await datosCompartidos();
  const fuentes = conBase(datos);
  const { buscar_guias, leer_guia } = herramientas(fuentes);
  const cabecera = idDe(datos, 'addon/guias_3.lua');
  const parte = idDe(datos, 'addon/guias_2.lua');
  const r = await buscar_guias({ zona: 'Los Baldíos' });
  const partidas = r.guias.filter((g) => g.guia === cabecera || g.guia === parte);
  assert.equal(partidas.length, 1);
  assert.equal(partidas[0].guia, cabecera);
  assert.equal(partidas[0].nombre, '10-12 Ruta de prueba partida');
  assert.equal(partidas[0].pasos, 3);
  assert.deepEqual(partidas[0].niveles, [10, 12]);
  for (const id of [cabecera, parte]) {
    const g = await leer_guia({ guia: id });
    assert.equal(g.guia, cabecera);
    assert.equal(g.total, 3);
    assert.deepEqual(g.pasos.map((p) => p.n), [1, 2, 3]);
    assert.equal(g.pasos[0].punto.marca, `G:${cabecera}:1`);
    assert.equal(g.pasos[0].texto, 'Aceptar Colmillos del norte.'); // sin el «Ir a 20, 30» que escribe el lector
    assert.equal(g.pasos[2].texto, 'Fin de la ruta partida');
  }
  assert.deepEqual(fuentes.lector.pasoDeGuia(cabecera, 1).punto, { mapa: 1413, x: 20, y: 30 });
  assert.equal(fuentes.lector.guia(parte).pasos.length, 3);
  const punto = puntoDeMarca(`G:${cabecera}:1`, { pasoDeGuia: fuentes.lector.pasoDeGuia });
  assert.deepEqual([punto.mapa, punto.x, punto.y], [1413, 20, 30]);
  assert.ok(fuentes.lector.misionesBiblioteca().has(9102));
});

test('leer_guia: marcas G: donde hay punto y B: donde solo hay misión; paginación; id desconocido', async () => {
  const datos = await datosCompartidos();
  const { leer_guia } = herramientas(conBase(datos));
  const id = idDe(datos, 'baldios.txt');
  const g = await leer_guia({ guia: id });
  assert.equal(g.guia, id);
  assert.equal(g.archivo, 'baldios.txt');
  assert.equal(g.total, g.pasos.length);
  assert.equal(g.siguiente, undefined);
  const conPunto = g.pasos.find((p) => p.punto);
  assert.deepEqual(conPunto.punto, { marca: `G:${id}:${conPunto.n}`, zona: 'Los Baldíos' });
  assert.deepEqual(conPunto.misiones, [{ q: 9101, accion: 'aceptar', nombre: 'Lomo de jabalí' }]);
  assert.equal(conPunto.marcas, undefined);
  assert.equal(conPunto.texto, 'Habla con la herrera del puesto y acepta "Lomo de jabalí"'); // sin «(50.2, 60.4)»
  const way = (await leer_guia({ guia: idDe(datos, 'sin-faccion.txt') })).pasos.find((p) => p.punto);
  assert.equal(way.texto, 'Habla con el guarda');
  assert.equal(way.punto.zona, 'Los Baldíos');
  for (const p of g.pasos.filter((x) => x.punto)) assert.doesNotMatch(p.texto, /\d+[.,]\d+/);
  // sin mapa (zona sin resolver o solo x, y) no hay marca, y el texto se queda con sus coordenadas; un paso que solo era
  // la coordenada lleva un texto de reserva con la zona
  const sueltos = (await leer_guia({ guia: idDe(datos, 'coordenadas.txt') })).pasos;
  assert.deepEqual(sueltos.slice(1).map((p) => [p.texto, p.punto?.marca ?? null]), [
    ['.goto Orgrimmar,52,50 Habla con el guarda', null],
    ['(30.5, 40.5) Junto al árbol', null],
    ['Ir a Los Baldíos', `G:${idDe(datos, 'coordenadas.txt')}:4`],
  ]);
  const entrega = g.pasos.find((p) => p.misiones.some((m) => m.accion === 'entregar'));
  assert.deepEqual(entrega.marcas, [{ q: 9101, accion: 'entregar', marca: 'B:q9101:e' }]);

  const larga = idDe(datos, 'larga/guias_9.lua');
  const l = await leer_guia({ guia: larga });
  assert.equal(l.total, 70);
  assert.equal(l.pasos.length, 60);
  assert.equal(l.siguiente, 61);
  assert.deepEqual(l.pasos[0].marcas, [{ q: 9101, accion: 'aceptar', marca: 'B:q9101:r' }]);
  assert.equal(l.pasos[0].punto, undefined);
  assert.ok(l.pasos[1].texto.length <= 300);
  for (const p of l.pasos) assert.doesNotMatch(p.texto, /[\x00-\x1f\x7f]/);
  assert.equal(l.pasos[2].punto.marca, `G:${larga}:3`);
  const l2 = await leer_guia({ guia: larga, desde: 61 });
  assert.deepEqual(l2.pasos.map((p) => p.n), Array.from({ length: 10 }, (_, i) => 61 + i));
  assert.equal(l2.siguiente, undefined);
  const l3 = await leer_guia({ guia: larga, desde: 5, hasta: 7 });
  assert.deepEqual(l3.pasos.map((p) => p.n), [5, 6, 7]);
  assert.equal(l3.siguiente, 8);
  const l4 = await leer_guia({ guia: larga, desde: 1, hasta: 500 });
  assert.equal(l4.pasos.length, 60);

  assert.deepEqual(await leer_guia({ guia: 'abcdef12' }), { error: 'guia_desconocida' });
  assert.deepEqual(await leer_guia({ guia: '../indice' }), { error: 'guia_desconocida' });
  assert.deepEqual(await leer_guia({}), { error: 'guia_desconocida' });
});

test('buscar_guias con texto: en los campos del índice y dentro de los pasos (R10), sin tildes ni mayúsculas', async () => {
  const datos = await datosCompartidos();
  const lecturas = [];
  const contador = { ...fs, readFileSync: (ruta, ...resto) => { lecturas.push(String(ruta)); return fs.readFileSync(ruta, ...resto); } };
  const { buscar_guias } = herramientas(conBase(datos, { fs: contador }));
  const porNombre = await buscar_guias({ texto: 'ruta de prueba PARTIDA' });
  assert.deepEqual(porNombre.guias.map((g) => g.guia), [idDe(datos, 'addon/guias_3.lua')]);
  const enPasos = await buscar_guias({ texto: 'JABALIES hasta tener' });
  assert.deepEqual(enPasos.guias.map((g) => g.guia), [idDe(datos, 'baldios.txt')]);
  assert.equal(enPasos.aviso, undefined);
  const deGuias = () => lecturas.filter((r) => r.includes(join(datos, CARPETA_GUIAS))).length;
  const antes = deGuias();
  assert.ok(antes > 0);
  await buscar_guias({ texto: 'JABALIES hasta tener' });
  assert.equal(deGuias(), antes, 'la segunda búsqueda no vuelve a leer las guías');
  assert.equal((await buscar_guias({ texto: 'nada de esto sale' })).total, 0);
});

// R17 (rutas de subida de varias zonas): con nivel y hasta, primero las guías cuyo tramo de niveles toca [nivel, hasta],
// por su nivel mínimo de menor a mayor (para encadenarlas); las demás detrás. No se quita ninguna.
test('buscar_guias con nivel y hasta: primero las que tocan el tramo, por su nivel mínimo; nada se quita', async () => {
  const datos = await datosCompartidos();
  const { buscar_guias } = herramientas(conBase(datos));
  const toca = (g, a, b) => Array.isArray(g.niveles) && g.niveles[0] <= b && g.niveles[1] >= a;
  const todas = await buscar_guias({ nivel: 11 });
  const r = await buscar_guias({ nivel: 11, hasta: 25 });
  assert.equal(r.total, todas.total, 'el tramo solo ordena');
  const k = r.guias.findIndex((g) => !toca(g, 11, 25));
  const primeras = k === -1 ? r.guias : r.guias.slice(0, k);
  assert.ok(primeras.length >= 3, JSON.stringify(r.guias.map((g) => [g.nombre, g.niveles])));
  assert.ok(r.guias.slice(primeras.length).every((g) => !toca(g, 11, 25)), 'las que tocan el tramo, todas delante');
  const minimos = primeras.map((g) => g.niveles[0]);
  assert.deepEqual(minimos, [...minimos].sort((x, y) => x - y), 'por su nivel mínimo');
  const larga = idDe(datos, 'larga/guias_9.lua');
  const partida = idDe(datos, 'addon/guias_3.lua');
  const pos = (id) => r.guias.findIndex((g) => g.guia === id);
  assert.ok(pos(partida) >= 0 && pos(larga) > pos(partida), 'la de 10-12 antes que la de 20-30');
  // Solo con nivel la de 20-30 va detrás de las de 1-12 (lejos del nivel 11); con el tramo 20-30, la primera.
  assert.equal((await buscar_guias({ nivel: 20, hasta: 30 })).guias[0].guia, larga);
  // Un hasta por debajo del nivel no cambia nada.
  assert.deepEqual((await buscar_guias({ nivel: 11, hasta: 5 })).guias.map((g) => g.guia), todas.guias.map((g) => g.guia));
});

test('buscar_guias: el esquema tiene hasta (entero) y la descripción lo explica', () => {
  const h = crearCatalogo({ turno: () => null, base: () => null, lector: null }).find((x) => x.nombre === 'buscar_guias');
  assert.deepEqual(h.esquema.properties.hasta, { type: 'integer', minimum: 1, maximum: 80, description: h.esquema.properties.hasta.description });
  assert.ok(/hasta/.test(h.esquema.properties.hasta.description));
  assert.ok(/hasta/.test(h.descripcion));
});

test('buscar_guias con texto: sin tiempo, lo encontrado y aviso busqueda_parcial', async () => {
  const datos = await datosCompartidos();
  const { buscar_guias } = herramientas(conBase(datos), { presupuestoMs: 0 });
  const r = await buscar_guias({ texto: 'piezas' });
  assert.equal(r.aviso, 'busqueda_parcial');
  const porNombre = await buscar_guias({ texto: 'Larga de prueba' });
  assert.equal(porNombre.guias[0].guia, idDe(datos, 'larga/guias_9.lua'));
});

test('buscar_guias sin criterios trae los no leídos; sin índice o indexando, su aviso', async () => {
  const datos = await datosCompartidos();
  const { buscar_guias } = herramientas(conBase(datos));
  const r = await buscar_guias({});
  assert.ok(r.guias.length > 0 && r.guias.length <= 10);
  assert.ok(r.noLeidos.some((n) => n.archivo === 'guia.pdf' && n.motivo === 'pdf'));
  assert.equal((await buscar_guias({ zona: 'Los Baldíos' })).noLeidos, undefined);

  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const vacia = mkdtempSync(join(process.env.SNF_DATOS, 'herr-vacia-'));
  const sinIndice = herramientas(conBase(vacia));
  assert.deepEqual(await sinIndice.buscar_guias({}), { guias: [], total: 0, aviso: 'sin_indice' });
  mkdirSync(join(vacia, 'biblioteca'));
  writeFileSync(join(vacia, RUTA_INDICE), JSON.stringify({ version: 1, base: null, lector: 2, indexando: true, guias: [], noLeidos: [], firmas: {} }));
  assert.deepEqual(await sinIndice.buscar_guias({ zona: 'Los Baldíos' }), { guias: [], total: 0, indexando: true, aviso: 'indexando' });
});

test('casa: palabras enteras; trozos de palabra solo con 4 letras o más', () => {
  assert.equal(casa('mata jabalies', 'jabal'), true);
  assert.equal(casa('dedo grande', 'de'), false);
  assert.equal(casa('el dedo de oro', 'de'), true);
  assert.equal(casa('ruta de prueba', 'prueba ruta'), true);
  assert.equal(casa('ruta de prueba', 'prueba otra'), false);
});

test('sinCoordenadas: las formas que reconoce el lector y el «Ir a» del punto', () => {
  assert.equal(sinCoordenadas('Acepta "Lomo" (50.2, 60.4)', {}), 'Acepta "Lomo"');
  assert.equal(sinCoordenadas('Aceptar Colmillos. Ir a 20, 30', { x: 20, y: 30 }), 'Aceptar Colmillos.');
  assert.equal(sinCoordenadas('Turn in X. Go to 20, 30', { x: 20, y: 30 }), 'Turn in X.');
  assert.equal(sinCoordenadas('Ir a 2, 3 sitios', { x: 20, y: 30 }), 'Ir a 2, 3 sitios');
  assert.equal(sinCoordenadas('/way 45.2 67.8 Habla con el guarda', {}), 'Habla con el guarda');
  assert.equal(sinCoordenadas('.goto The Barrens,52.1,43.6', {}), '');
  assert.equal(sinCoordenadas('Ve a 45,2 67,8 y mata', {}), 'Ve a y mata');
  assert.equal(sinCoordenadas('Mata 20/30 lobos [12 34]', {}), 'Mata 20/30 lobos');
  assert.equal(sinCoordenadas('Nivel 10-20, misión 1234', {}), 'Nivel 10-20, misión 1234');
});

test('textoDeReserva: con el nombre de la zona, o «al punto» sin él', () => {
  assert.equal(textoDeReserva('Los Baldíos', 'es'), 'Ir a Los Baldíos');
  assert.equal(textoDeReserva('The Barrens', 'en'), 'Go to The Barrens');
  assert.equal(textoDeReserva('#1413', 'es'), 'Ir al punto');
  assert.equal(textoDeReserva('', 'en'), 'Go to the point');
});

test('índice con indexando: true y con guías: salen las guías y indexando', async () => {
  const datos = await preparar();
  const ruta = join(datos, RUTA_INDICE);
  writeFileSync(ruta, JSON.stringify({ ...JSON.parse(readFileSync(ruta, 'utf8')), indexando: true }));
  const { buscar_guias } = herramientas(conBase(datos));
  const r = await buscar_guias({ zona: 'Los Baldíos' });
  assert.equal(r.indexando, true);
  assert.equal(r.aviso, undefined);
  assert.equal(r.guias[0].archivo, 'baldios.txt');
});

// Una pregunta al servidor de verdad, de forma síncrona (sirve dentro de un `leer` espía, que es síncrono).
function preguntarSincrono(datos, llamada) {
  const lineas = ['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: llamada })].join('\n') + '\n';
  const r = spawnSync(process.execPath, [join('src', 'herramientas', 'servidor.mjs'), '--datos', datos],
    { cwd: APP, input: lineas, encoding: 'utf8', timeout: 30000 });
  const respuesta = r.stdout.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l)).find((l) => l.id === 2);
  return JSON.parse(respuesta.result.content[0].text);
}

test('Review Focus 1: durante la primera indexación el servidor (otro proceso) dice indexando, no sin_indice', async () => {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const datos = mkdtempSync(join(process.env.SNF_DATOS, 'herr-primera-'));
  cpSync(FIXTURES, join(datos, CARPETA_GUIAS), { recursive: true });
  let visto = null;
  const leer = (...a) => {
    visto ??= preguntarSincrono(datos, { name: 'buscar_guias', arguments: { zona: 'Los Baldíos' } });
    return leerArchivoGuia(...a);
  };
  await crearIndice({ datos, fs, base: async () => base, leer }).actualizar();
  assert.deepEqual(visto, { guias: [], total: 0, indexando: true, aviso: 'indexando' });
  const despues = preguntarSincrono(datos, { name: 'buscar_guias', arguments: { zona: 'Los Baldíos' } });
  assert.equal(despues.indexando, undefined);
  assert.ok(despues.guias.length > 0);
});

// Lista de archivos (relativos) y tamaños de una carpeta, para ver que el servidor no escribe nada.
function foto(dir, prefijo = '') {
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefijo ? `${prefijo}/${e.name}` : e.name;
    if (e.isDirectory()) salida.push(`${rel}/`, ...foto(join(dir, e.name), rel));
    else salida.push(`${rel} ${statSync(join(dir, e.name)).size}`);
  }
  return salida;
}

test('el servidor de verdad: initialize, tools/list, tools/call de buscar_guias; la carpeta de datos queda igual', async () => {
  const datos = await datosCompartidos();
  const antes = foto(datos);
  const registro = foto(process.env.SNF_DATOS).filter((l) => l.startsWith('registro'));
  const hijo = spawn(process.execPath, [join('src', 'herramientas', 'servidor.mjs'), '--datos', datos], { cwd: APP, stdio: ['pipe', 'pipe', 'pipe'] });
  let salida = '';
  let errores = '';
  hijo.stdout.on('data', (d) => { salida += d; });
  hijo.stderr.on('data', (d) => { errores += d; });
  const fin = new Promise((resolver) => hijo.on('close', resolver));
  hijo.stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\r\n');
  hijo.stdin.write('\n');
  hijo.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  hijo.stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
  hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'buscar_guias', arguments: { texto: 'Baldíos' } } }) + '\n');
  hijo.stdin.end();
  const codigo = await fin;
  assert.equal(codigo, 0, errores);
  const lineas = salida.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  assert.deepEqual(lineas.map((l) => l.id), [1, 2, 3]);
  assert.equal(lineas[0].result.serverInfo.name, 'snetforever');
  assert.deepEqual(lineas[1].result.tools.map((t) => t.name), ['buscar_guias', 'leer_guia', 'misiones_zona', 'mision', 'pnj', 'como_llegar', 'guardar_guia']);
  assert.equal(lineas[2].result.isError, false);
  const r = JSON.parse(lineas[2].result.content[0].text);
  assert.ok(r.guias.some((g) => g.archivo === 'baldios.txt'), lineas[2].result.content[0].text);
  assert.ok(!salida.includes(datos) && !salida.includes(datos.replaceAll('\\', '\\\\')), 'sin rutas locales en la salida');
  assert.deepEqual(foto(datos), antes);
  assert.deepEqual(foto(process.env.SNF_DATOS).filter((l) => l.startsWith('registro')), registro);
});
