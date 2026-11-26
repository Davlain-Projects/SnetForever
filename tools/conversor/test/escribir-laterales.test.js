// Pruebas de lo que la fase 3 añade a los addons de datos: guías laterales, índice de mazmorras,
// instancias, avisos y la licencia de OpenMap. Se escribe en carpetas temporales y se carga con fengari
// en el orden del .toc.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escribirMisiones } from '../src/escribir/misiones.js';
import { escribirRutas } from '../src/escribir/rutas.js';
import { rutaQuestieToc } from '../src/config.js';
import { cargarLua } from './ayuda/cargar-lua.js';

const dirRxp = join(fileURLToPath(new URL('./fixtures/', import.meta.url)), 'rxp-mini');
const VERSION = '2026.11.09.1';
const LICENCIA_OPENMAP = 'MIT License\n\nCopyright (c) OpenMap (texto de prueba)\n';

const paso = (n, elementos) => ({ id: `p${n}`, n, etiquetas: {}, requisitos: [], elementos, linea: 0 });
const guiaCadena = {
  clave: 'Cadenas de clase (H)\\mago-agua', grupo: 'Cadenas de clase (H)', nombre: 'mago-agua',
  titulo: { en: 'Water elemental', es: 'Elemental de agua' }, tipo: 'cadena', faccion: 'Horde',
  filtro: [['c:MAGE']], niveles: { min: 10, max: 20 }, siguientes: [], mazmorras: [], fuente: { archivo: 'QuestieDB', linea: 0 },
  sinVerificar: true, cadena: { id: 'mago-agua' },
  pasos: [
    paso(1, [{ t: 'accept', q: 4641 }, { t: 'goto', mapa: 1411, x: 43.29, y: 68.53, modo: 'flecha' }]),
    paso(2, [{ t: 'turnin', q: 4641 }]),
  ],
};
const guiaMazmorra = {
  clave: 'Mazmorras SnetForever (H)\\13-18 Ragefire Chasm', grupo: 'Mazmorras SnetForever (H)', nombre: '13-18 Ragefire Chasm',
  titulo: { en: 'Ragefire Chasm' }, tipo: 'mazmorra', faccion: 'Horde', niveles: { min: 13, max: 18 },
  siguientes: [], mazmorras: [], fuente: { archivo: 'QuestieDB', linea: 0 }, sinVerificar: true, area: 2437, instancia: 389,
  pasos: [paso(1, [{ t: 'accept', q: 4641 }])],
};
const guiaProfesion = {
  clave: 'Profesiones\\01-300 Herbalism (H)', grupo: 'Profesiones', nombre: '01-300 Herbalism (H)',
  titulo: { en: 'Herbalism 1-300' }, tipo: 'profesion', faccion: 'Horde', niveles: { min: 1, max: 60 },
  siguientes: [], mazmorras: [], fuente: { archivo: 'Herbalism.lua', linea: 0 }, sinVerificar: true,
  habilidad: { p: 'Herbalism', desde: 1, hasta: 300 },
  pasos: [paso(1, [{ t: 'manual', texto: { en: 'Recoge hierbas' }, linea: 0 }])],
};
// Lote B (B1): una guía de rutas que cita ítems (collect, use, requisito) y un objeto del mundo (accept en un objeto).
const guiaRuta = {
  clave: 'Prueba\\1-10', grupo: 'Prueba', nombre: '1-10', titulo: { en: 'Test' }, siguientes: [], mazmorras: [],
  fuente: { archivo: 'prueba.lua', linea: 0 },
  pasos: [{
    id: 'r1', n: 1, etiquetas: {}, linea: 0, requisitos: [{ t: 'objeto', i: 37, n: 1 }],
    elementos: [{ t: 'collect', i: 25, n: 1 }, { t: 'use', is: [36] }, { t: 'accept', q: 4641, objeto: 32 }],
  }],
};
const porMazmorra = {
  2437: {
    nombre: 'Ragefire Chasm', area: 2437, instancia: 389, sigla: 'RFC', niveles: { min: 13, max: 18 },
    fuenteNiveles: 'OpenMap', banda: false, misiones: [{ q: 4641, nivel: 8, nivelMision: 10, motivo: 'zona' }],
  },
};
const avisos = [
  { id: 'cadena-mago', tipo: 'cadena', clase: 'MAGE', faccion: 'Horde', nivel: 10, texto: { en: 'Water elemental', es: 'Elemental de agua' }, guia: guiaCadena.clave, hechas: [4641] },
  { id: 'rfc-8', tipo: 'mazmorra', nivel: 13, hasta: 18, texto: { en: 'Ragefire Chasm' }, area: 2437 },
];

const tocLua = (dir, nombre) => readFileSync(join(dir, `${nombre}.toc`), 'utf8')
  .split(/\r?\n/).filter((l) => l && !l.startsWith('##')).map((l) => join(dir, l.trim()));

describe('SnetForever_Rutas con avisos y OpenMap', () => {
  let carpeta;
  let dir;
  let datos;
  before(async () => {
    carpeta = mkdtempSync(join(tmpdir(), 'snf-rutas-lat-'));
    dir = join(carpeta, 'SnetForever_Rutas');
    escribirRutas(new Map([[guiaProfesion.clave, guiaProfesion]]), dir, {
      version: VERSION, dirRxp, avisos, licenciaOpenMap: LICENCIA_OPENMAP,
    });
    datos = (await cargarLua(tocLua(dir, 'SnetForever_Rutas'))).SNF_RUTAS;
  });
  after(() => rmSync(carpeta, { recursive: true, force: true }));

  test('nucleo.lua lleva los avisos', () => {
    assert.equal(datos.avisos[0].id, 'cadena-mago');
    assert.equal(datos.avisos[1].tipo, 'mazmorra');
    assert.deepEqual(datos.avisos[0].hechas, [4641]);
  });
  test('la guía de profesión se escribe con sus campos nuevos', () => {
    const g = datos.guias[guiaProfesion.clave];
    assert.equal(g.tipo, 'profesion');
    assert.equal(g.sinVerificar, true);
    assert.deepEqual(g.habilidad, { p: 'Herbalism', desde: 1, hasta: 300 });
  });
  test('copia LICENSE-OpenMap.txt y lo dice en CREDITOS.md junto a las profesiones', () => {
    assert.equal(readFileSync(join(dir, 'LICENSE-OpenMap.txt'), 'utf8'), LICENCIA_OPENMAP);
    const creditos = readFileSync(join(dir, 'CREDITOS.md'), 'utf8');
    assert.match(creditos, /OpenMap/);
    assert.match(creditos, /MIT/);
    assert.match(creditos, /Profesiones de RestedXP \(WotLK\) recortadas al 1-300/);
  });
});

describe('SnetForever_Rutas sin avisos ni OpenMap', () => {
  test('avisos queda vacío, no se copia la licencia de OpenMap ni se habla de profesiones', async () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'snf-rutas-sin-'));
    try {
      const dir = join(carpeta, 'SnetForever_Rutas');
      escribirRutas(new Map(), dir, { version: VERSION, dirRxp });
      const { SNF_RUTAS } = await cargarLua(tocLua(dir, 'SnetForever_Rutas'));
      assert.deepEqual(SNF_RUTAS.avisos, []);
      assert.ok(!existsSync(join(dir, 'LICENSE-OpenMap.txt')));
      assert.ok(!/OpenMap|recortadas al 1-300/.test(readFileSync(join(dir, 'CREDITOS.md'), 'utf8')));
    } finally { rmSync(carpeta, { recursive: true, force: true }); }
  });
});

describe('SnetForever_Misiones con guías laterales', { skip: !existsSync(rutaQuestieToc()) }, () => {
  let carpeta;
  let dir;
  let resultado;
  let datos;
  let toc;

  before(async () => {
    carpeta = mkdtempSync(join(tmpdir(), 'snf-misiones-lat-'));
    dir = join(carpeta, 'SnetForever_Misiones');
    resultado = escribirMisiones(dir, {
      version: VERSION,
      guias: new Map([[guiaCadena.clave, guiaCadena], [guiaMazmorra.clave, guiaMazmorra]]),
      guiasRutas: new Map([[guiaRuta.clave, guiaRuta]]),
      porMazmorra,
      instancias: { 389: 2437 },
      licenciaOpenMap: LICENCIA_OPENMAP,
    });
    toc = readFileSync(join(dir, 'SnetForever_Misiones.toc'), 'utf8');
    datos = (await cargarLua(tocLua(dir, 'SnetForever_Misiones'))).SNF_MISIONES;
  });
  after(() => { if (carpeta) rmSync(carpeta, { recursive: true, force: true }); });

  test('la guía lateral tiene un accept en su primer paso', () => {
    const g = datos.guias[guiaCadena.clave];
    assert.ok(g.pasos[0].elementos.some((e) => e.t === 'accept' && e.q === 4641));
    assert.equal(g.sinVerificar, true);
    assert.equal(datos.guias[guiaMazmorra.clave].area, 2437);
  });
  test('B1: los ítems y el objeto que citan las guías de rutas están en el juego, con su nombre', () => {
    for (const id of [25, 36, 37]) {
      assert.ok(datos.item[id]?.name, `falta el ítem ${id}`);
      assert.deepEqual(Object.keys(datos.item[id]), ['name']);
      assert.ok(datos.es.item[id]?.name, `falta el español del ítem ${id}`);
    }
    assert.equal(datos.object[32].name, 'Sunken Chest');
    assert.ok(datos.es.object[32]?.name, 'falta el español del objeto 32');
    assert.equal(datos.item[35], undefined, '35 no lo cita nadie');
  });
  test('porMazmorra e instancias', () => {
    assert.equal(datos.porMazmorra[2437].nombre, 'Ragefire Chasm');
    assert.equal(datos.porMazmorra[2437].misiones[0].q, 4641);
    assert.equal(datos.instancias[389], 2437);
  });
  test('el nucleo declara guias, porMazmorra e instancias', () => {
    const nucleo = readFileSync(join(dir, 'nucleo.lua'), 'utf8');
    assert.match(nucleo, /guias\s*=\s*\{\}/);
    assert.match(nucleo, /porMazmorra\s*=\s*\{\}/);
    assert.match(nucleo, /instancias\s*=\s*\{/);
  });
  test('los archivos nuevos van en el .toc después de los que ya había', () => {
    const lua = tocLua(dir, 'SnetForever_Misiones').map((f) => f.slice(dir.length + 1));
    const iGuias = lua.findIndex((f) => /^guias_\d+\.lua$/.test(f));
    const iMaz = lua.findIndex((f) => /^mazmorras_\d+\.lua$/.test(f));
    const ultimoViejo = Math.max(...lua.map((f, i) => (/^juego_es_item_\d+\.lua$/.test(f) ? i : -1)));
    assert.ok(ultimoViejo >= 0, 'falta juego_es_item_<n>.lua en el .toc');
    assert.ok(iGuias > ultimoViejo, 'guias_<n>.lua después de juego_es_item_<n>.lua');
    assert.ok(iMaz > iGuias, 'mazmorras_<n>.lua después de guias_<n>.lua');
    for (const f of resultado.archivos) assert.ok(existsSync(join(dir, f)), f);
  });
  test('LICENSE-OpenMap.txt y CREDITOS.md', () => {
    assert.equal(readFileSync(join(dir, 'LICENSE-OpenMap.txt'), 'utf8'), LICENCIA_OPENMAP);
    const creditos = readFileSync(join(dir, 'CREDITOS.md'), 'utf8');
    assert.match(creditos, /Guías generadas a partir de esta base/);
    assert.match(creditos, /OpenMap/);
  });
  test('ningún archivo pasa de 500.000 bytes y el título no dice Questie', () => {
    for (const f of readdirSync(dir)) assert.ok(statSync(join(dir, f)).size <= 500000, f);
    const titulo = toc.split(/\r?\n/).find((l) => l.startsWith('## Title'));
    assert.ok(!/questie/i.test(titulo));
  });
});

describe('SnetForever_Misiones sin guías laterales', { skip: !existsSync(rutaQuestieToc()) }, () => {
  test('sigue igual: tablas vacías y sin archivos nuevos ni licencia de OpenMap', async () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'snf-misiones-sin-'));
    try {
      const dir = join(carpeta, 'SnetForever_Misiones');
      escribirMisiones(dir, { version: VERSION });
      const lua = tocLua(dir, 'SnetForever_Misiones').map((f) => f.slice(dir.length + 1));
      assert.ok(!lua.some((f) => /^(guias|mazmorras)_/.test(f)));
      assert.ok(!existsSync(join(dir, 'LICENSE-OpenMap.txt')));
      const { SNF_MISIONES } = await cargarLua(tocLua(dir, 'SnetForever_Misiones'));
      assert.deepEqual(SNF_MISIONES.guias, []);
      assert.deepEqual(SNF_MISIONES.instancias, []);
    } finally { rmSync(carpeta, { recursive: true, force: true }); }
  });
});
