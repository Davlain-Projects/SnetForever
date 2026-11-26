// Biblioteca de guías: leer un archivo de guía de cualquier formato (fixtures inventados en fixtures/biblioteca).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearBase } from '../src/base/base.mjs';
import { leerArchivoGuia, MAX_ARCHIVO, FORMATOS } from '../src/biblioteca/leer.mjs';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'biblioteca');
const mision = (name) => ({ name, startedBy: [9201], finishedBy: [9201], requiredLevel: 1, questLevel: 1 });
const base = crearBase({
  version: 't', esquema: 1,
  quest: { 9101: mision('Lomo de jabalí'), 9102: mision('Colmillos del norte') },
  npc: {}, object: {}, item: {},
  es: { quest: {}, npc: {}, object: {}, item: {} },
  zonas: { area: {}, nombre: { 1413: { en: 'The Barrens', es: 'Los Baldíos' } } },
  mazmorra: {}, porFaccion: {},
});
const leer = (nombre, extra = {}) => leerArchivoGuia(join(CARPETA, nombre), { fs, base, ...extra });
const temporal = (nombre, contenido) => {
  const ruta = join(mkdtempSync(join(tmpdir(), 'snf-leer-')), nombre);
  writeFileSync(ruta, contenido);
  return ruta;
};

test('constantes', () => {
  assert.equal(MAX_ARCHIVO, 50 * 1024 * 1024);
  assert.deepEqual(FORMATOS, ['.txt', '.md', '.lua', '.html', '.htm']);
});

test('Mis guías: misiones, punto y texto', () => {
  const r = leer('mis-guias.lua');
  assert.equal(r.formato, 'misguias');
  assert.equal(r.guias.length, 1);
  const g = r.guias[0];
  assert.equal(g.k, 0);
  assert.equal(g.nombre, 'Mi ruta por Los Baldíos');
  assert.equal(g.faccion, 'Horde');
  assert.deepEqual(g.niveles, [1, 10]);
  assert.equal(g.pasos.length, 3);
  assert.deepEqual(g.pasos[0].misiones, [{ q: 9101, accion: 'aceptar' }]);
  assert.deepEqual(g.pasos[0].punto, { mapa: 1413, x: 50, y: 60 });
  assert.equal(g.pasos[0].texto, 'Habla con la PNJ del puesto');
  assert.deepEqual(g.pasos[1].misiones, [{ q: 9101, accion: 'completar', objetivo: 1 }]);
  assert.deepEqual(g.pasos[2].misiones, [{ q: 9101, accion: 'entregar' }]);
  assert.deepEqual(g.pasos.map((p) => p.n), [1, 2, 3]);
});

// 17-nov: los pasos de Mis guías con clase, raza o facción (motor/misguias.lua) llevan `clases` / `razas` como los de 4Ever,
// así leer_guia no se los enseña a otra clase o raza; uno con un nombre que no se entiende no sale (el addon tampoco lo usa).
test('Mis guías: los pasos con clase, raza o facción llevan clases / razas y uno ilegible no sale', () => {
  const r = leerArchivoGuia(temporal('mis-guias.lua', `SnetForeverMisGuias = {
  {nombre = "Por clase", pasos = {
    {aceptar = 9101},
    {aceptar = 9102, clase = {"Mago", "warrior"}},
    {completar = 9101, raza = "No-muerto", clase = "Brujo"},
    {entregar = 9101, sin_clase = {"Guerrero", "Mago", "Pícaro", "Sacerdote", "Chamán", "Brujo", "Druida", "Cazador"}},
    {texto = "Solo la Horda", faccion = "Horda"},
    {texto = "Ni trols ni orcos de la Horda", faccion = "Horde", sin_raza = {"Trol", "Orc"}},
    {texto = "Ilegible", clase = "Magoo"},
    {entregar = 9102},
  }},
}`), { fs, base });
  const p = r.guias[0].pasos;
  assert.deepEqual(p.map((x) => x.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(!('clases' in p[0]) && !('razas' in p[0]));
  assert.deepEqual(p[1].clases, ['WARRIOR', 'MAGE']);
  assert.ok(!('razas' in p[1]));
  assert.deepEqual([p[2].clases, p[2].razas], [['WARLOCK'], ['Scourge']]);
  assert.deepEqual(p[3].clases, ['PALADIN']);
  // Ronda 2 (M3): la facción va como facción (un Skyborne de la Alianza no ve lo de la Horda), no como sus razas.
  assert.deepEqual([p[4].facciones, p[4].razas], [['Horde'], undefined]);
  assert.deepEqual(p[5].facciones, ['Horde']);
  assert.deepEqual(p[5].razas, ['Human', 'Dwarf', 'NightElf', 'Scourge', 'Tauren', 'Gnome', 'Goblin', 'Skyborne']);
  assert.ok(!p.some((x) => x.texto === 'Ilegible'));
  assert.deepEqual(p[6].misiones, [{ q: 9102, accion: 'entregar' }]);
});

// Ronda 2 (decisión 1): la clase o la raza de la guía entera, como la de una guía de 4Ever; una guía con un nombre que no se
// entiende no se lee (el addon tampoco la usa).
test('Mis guías: la clase o la raza de la guía entera va en la guía; con un nombre raro, la guía no sale', () => {
  const r = leerArchivoGuia(temporal('mis-guias.lua', `SnetForeverMisGuias = {
  {nombre = "Solo cazadores", faccion = "Alianza", clase = "Cazador", pasos = {{aceptar = 9101}}},
  {nombre = "Clase rara", clase = "Magoo", pasos = {{aceptar = 9101}}},
  {nombre = "Sin no-muertos", sin_raza = "No-muerto", pasos = {{aceptar = 9102}}},
}`), { fs, base });
  assert.deepEqual(r.guias.map((g) => [g.nombre, g.faccion ?? null, g.clases ?? null, g.razas ?? null]), [
    ['Solo cazadores', 'Alliance', ['HUNTER'], null],
    ['Sin no-muertos', null, null, ['Human', 'Orc', 'Dwarf', 'NightElf', 'Tauren', 'Gnome', 'Troll', 'Goblin', 'Skyborne']],
  ]);
  assert.deepEqual(r.guias.map((g) => g.k), [0, 1]);
});

test('addon: dos globales, elementos y texto en el idioma', () => {
  const r = leer('addon/guias_1.lua');
  assert.equal(r.formato, 'addon');
  assert.equal(r.guias.length, 2);
  const [a, b] = r.guias;
  assert.deepEqual(r.guias.map((g) => g.k), [0, 1]);
  assert.equal(a.nombre, 'Misiones de prueba');
  assert.equal(a.faccion, 'Horde');
  assert.deepEqual(a.niveles, [1, 8]);
  assert.deepEqual(a.pasos[0].misiones, [{ q: 9101, accion: 'aceptar' }]);
  assert.deepEqual(a.pasos[0].punto, { mapa: 1413, x: 50.5, y: 60.5 });
  assert.equal(a.pasos[0].texto, 'Habla con ella');
  assert.deepEqual(a.pasos[1].misiones, [{ q: 9101, accion: 'completar', objetivo: 1 }]);
  assert.equal(a.pasos[1].texto, 'Mata a los jabalíes');
  assert.deepEqual(a.pasos[2].misiones, [{ q: 9101, accion: 'entregar' }]);
  assert.equal(b.nombre, 'Ruta de prueba');
  assert.equal(b.faccion, 'Alliance');
  assert.deepEqual(b.niveles, [5, 9]);
  const en = leer('addon/guias_1.lua', { idioma: 'en' });
  assert.equal(en.guias[0].nombre, 'Test quests');
  assert.equal(en.guias[0].pasos[0].texto, 'Talk to her');
});

test('addon: cada guía lleva su clave; las de cabecera no son «parte»', () => {
  const r = leer('addon/guias_1.lua');
  assert.deepEqual(r.guias.map((g) => g.clave), ['Pruebas\\misiones', 'Pruebas\\ruta']);
  assert.ok(r.guias.every((g) => g.parte === undefined));
});

test('addon: una guía partida (los pasos de una guía cuya cabecera está en otro archivo)', () => {
  const r = leer('addon/guias_2.lua');
  assert.equal(r.formato, 'addon');
  assert.equal(r.guias.length, 1);
  const g = r.guias[0];
  assert.equal(g.k, 0);
  assert.equal(g.clave, 'Pruebas (H)\\10-12 Ruta partida');
  assert.equal(g.parte, true);
  assert.equal(g.nombre, '10-12 Ruta partida');
  assert.equal(g.faccion, 'Horde');
  assert.deepEqual(g.niveles, [10, 12]);
  assert.equal(g.pasos.length, 2);
  assert.deepEqual(g.pasos[0].misiones, [{ q: 9102, accion: 'aceptar' }]);
  assert.deepEqual(g.pasos[0].punto, { mapa: 1413, x: 20, y: 30 });
  assert.deepEqual(g.pasos[1].misiones, [{ q: 9102, accion: 'entregar' }]);
  assert.equal(g.pasos[1].texto, 'Vuelve al puesto');
});

test('addon: una guía partida de Alianza y con SNF_MISIONES', () => {
  const ruta = temporal('guias_9.lua', 'local T = SNF_MISIONES.guias["Otra (A)\\\\Sin niveles"].pasos\nT[1]={id="d1",n=1,elementos={{t="accept",q=9101}}}\n');
  const r = leerArchivoGuia(ruta, { fs, base });
  assert.equal(r.formato, 'addon');
  assert.equal(r.guias.length, 1);
  assert.equal(r.guias[0].clave, 'Otra (A)\\Sin niveles');
  assert.equal(r.guias[0].nombre, 'Sin niveles');
  assert.equal(r.guias[0].faccion, 'Alliance');
  assert.equal(r.guias[0].niveles, undefined);
});

const RUTAS_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'addons', 'SnetForever_Rutas', 'guias_31.lua');
test('datos reales: guias_31.lua de SnetForever_Rutas (una guía partida) se lee', { skip: !fs.existsSync(RUTAS_REPO) && 'faltan los datos reales' }, () => {
  const r = leerArchivoGuia(RUTAS_REPO, { fs, base });
  assert.equal(r.noLeido, undefined);
  assert.equal(r.formato, 'addon');
  assert.equal(r.guias.length, 1);
  const g = r.guias[0];
  assert.equal(g.clave, 'RestedXP Forever Dungeon Guide (A)\\01-09 Zephras Isle');
  assert.equal(g.parte, true);
  assert.equal(g.nombre, '01-09 Zephras Isle');
  assert.equal(g.faccion, 'Alliance');
  assert.deepEqual(g.niveles, [1, 9]);
  assert.ok(g.pasos.length > 100, `pasos: ${g.pasos.length}`);
});

test('RestedXP: un paso por «step», con misiones y puntos', () => {
  const r = leer('restedxp.lua');
  assert.equal(r.formato, 'restedxp');
  assert.equal(r.guias.length, 1);
  const g = r.guias[0];
  assert.equal(g.nombre, '01-12 Baldios de prueba');
  assert.equal(g.faccion, 'Horde');
  assert.equal(g.pasos.length, 3);
  assert.deepEqual(g.pasos[0].punto, { mapa: 1413, x: 52.1, y: 43.6 });
  assert.deepEqual(g.pasos[0].misiones, [{ q: 9101, accion: 'aceptar' }]);
  assert.deepEqual(g.pasos[1].misiones, [{ q: 9101, accion: 'completar', objetivo: 1 }]);
  assert.deepEqual(g.pasos[2].misiones, [{ q: 9101, accion: 'entregar' }]);
  assert.deepEqual(g.pasos.map((p) => p.n), [1, 2, 3]);
});

test('texto plano', () => {
  const r = leer('baldios.txt');
  assert.equal(r.formato, 'texto');
  const g = r.guias[0];
  assert.equal(g.k, 0);
  assert.equal(g.faccion, 'Horde');
  assert.deepEqual(g.niveles, [1, 12]);
  assert.equal(g.pasos.length, 4);
  assert.deepEqual(g.pasos[1].misiones, [{ q: 9101, accion: 'aceptar' }]);
  assert.deepEqual(g.pasos[1].punto, { mapa: 1413, x: 50.2, y: 60.4 }); // la cabecera nombra una sola zona
});

test('texto: las zonas nombradas en cualquier línea van en la guía (zonas), sin mover los puntos', () => {
  const ruta = temporal('notas.txt', 'Mis notas\nViaja a Los Baldíos (50.2, 60.4)\nAcepta Lomo de jabalí\n');
  const g = leerArchivoGuia(ruta, { fs, base }).guias[0];
  assert.deepEqual(g.zonas, [1413]);
  assert.deepEqual(g.pasos[1].punto, { x: 50.2, y: 60.4 });
  assert.equal(leerArchivoGuia(temporal('nada.txt', 'Mis notas\nHabla con ella\n'), { fs, base }).guias[0].zonas, undefined);
});

test('un título con dos zonas no pone mapa a los puntos', () => {
  const b = crearBase({ version: 't', esquema: 1, quest: {}, npc: {}, object: {}, item: {}, es: { quest: {}, npc: {}, object: {}, item: {} },
    zonas: { area: {}, nombre: { 1413: { en: 'The Barrens', es: 'Los Baldíos' }, 1411: { en: 'Durotar', es: 'Durotar' } } }, mazmorra: {}, porFaccion: {} });
  const ruta = temporal('dos.txt', 'Guía Horda 1-12 Los Baldíos y Durotar\n1. Habla con la herrera (50.2, 60.4)\n');
  const r = leerArchivoGuia(ruta, { fs, base: b });
  assert.deepEqual(r.guias[0].pasos[1].punto, { x: 50.2, y: 60.4 });
});

test('HTML en windows-1252: tildes bien y sin los comentarios', () => {
  const r = leer('pagina.html');
  assert.equal(r.formato, 'html');
  const texto = r.guias[0].pasos.map((p) => p.texto).join('\n');
  assert.match(texto, /Baldíos/);
  assert.match(texto, /jabalí/);
  assert.doesNotMatch(texto, /Mariposa77|muy buena/);
  assert.deepEqual(r.guias[0].pasos[1].misiones, [{ q: 9101, accion: 'aceptar' }]);
});

test('página guardada: dirección y bajada de su cabecera', () => {
  const r = leer('enlaces/ejemplo.txt');
  assert.equal(r.formato, 'pagina');
  const g = r.guias[0];
  assert.equal(g.url, 'https://guias.ejemplo.test/baldios');
  assert.equal(g.bajada, '2026-11-15');
  assert.equal(g.faccion, 'Alliance');
  assert.equal(g.pasos.length, 3);
  assert.doesNotMatch(g.pasos.map((p) => p.texto).join('\n'), /Dirección|Bajada/);
  assert.deepEqual(g.pasos[1].misiones, [{ q: 9102, accion: 'aceptar' }]);
});

test('sin base también lee (las zonas con nombre quedan sin mapa)', () => {
  const r = leerArchivoGuia(join(CARPETA, 'restedxp.lua'), { fs });
  assert.equal(r.formato, 'restedxp');
  assert.equal(r.guias[0].pasos[0].punto.mapa, undefined);
  assert.equal(r.guias[0].pasos[0].punto.zona, 'The Barrens');
  assert.deepEqual(r.guias[0].pasos[0].misiones, [{ q: 9101, accion: 'aceptar' }]);
});

test('lo que no se lee', () => {
  assert.deepEqual(leer('guia.pdf'), { noLeido: 'pdf' });
  assert.deepEqual(leer('foto.png'), { noLeido: 'imagen' });
  assert.deepEqual(leerArchivoGuia(temporal('otro.docx', 'x'), { fs, base }), { noLeido: 'formato' });
  assert.deepEqual(leerArchivoGuia(temporal('cualquiera.lua', 'print("hola")\n'), { fs, base }), { noLeido: 'formato' });
  assert.deepEqual(leerArchivoGuia(temporal('roto.lua', 'SnetForeverMisGuias = {\n {nombre = "x"'), { fs, base }), { noLeido: 'ilegible' });
  assert.deepEqual(leerArchivoGuia(temporal('roto2.lua', 'local T = SNF_RUTAS.guias\nT["a"]={'), { fs, base }), { noLeido: 'ilegible' });
  assert.deepEqual(leerArchivoGuia(temporal('vacio.txt', '  \n\n'), { fs, base }), { noLeido: 'vacio' });
  assert.deepEqual(leerArchivoGuia(join(CARPETA, 'no-existe.txt'), { fs, base }), { noLeido: 'ilegible' });
});

test('un archivo de 60 MB es «grande» y no se lee', () => {
  let leidos = 0;
  const falso = {
    statSync: () => ({ size: 60 * 1024 * 1024, isFile: () => true }),
    readFileSync: () => { leidos++; throw new Error('no se debe leer'); },
  };
  assert.deepEqual(leerArchivoGuia('E:/biblioteca/enorme.txt', { fs: falso, base }), { noLeido: 'grande' });
  assert.equal(leidos, 0);
});

test('addon: con idioma «es» el paso trae `textoEn` si todos sus textos tienen inglés; si falta alguno o no hay, no', () => {
  const lua = 'local T = SNF_RUTAS.guias\nT["Pruebas-ingles"]={clave="Pruebas-ingles",nombre="ingles",titulo={es="Con inglés",en="With English"},niveles={1,5},pasos={'
    + '{id="c1",n=1,elementos={{t="goto",mapa=1413,x=50,y=60},{t="nota",texto={es="Habla con X",en="Talk to X"}}}},'
    + '{id="c2",n=2,elementos={{t="goto",mapa=1413,x=51,y=61},{t="nota",texto={es="Habla con Y",en="Talk to Y"}},{t="manual",texto="Solo en español"}}},'
    + '{id="c3",n=3,elementos={{t="goto",mapa=1413,x=52,y=62},{t="nota",texto={es="Solo español"}}}},'
    + '{id="c4",n=4,elementos={{t="goto",mapa=1413,x=53,y=63}}}}}\n';
  const rr = leerArchivoGuia(temporal("ingles.lua", lua), { fs, base, idioma: "es" });
  const g = rr.guias[0];
  assert.equal(g.pasos[0].texto, 'Habla con X');
  assert.equal(g.pasos[0].textoEn, 'Talk to X');
  assert.equal(g.pasos[1].textoEn, undefined, 'si a un texto le falta el inglés, no se mezcla');
  assert.equal(g.pasos[2].textoEn, undefined);
  assert.equal(g.pasos[3].textoEn, undefined, 'un paso sin texto no inventa nada');
});
