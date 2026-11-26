// Pruebas del addon de datos SnetForever_Rutas: se genera sobre una carpeta temporal y se carga con
// fengari en el orden del .toc.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarMapas } from '../src/rxp/coordenadas.js';
import { construirGuias } from '../src/rxp/guias.js';
import { escribirRutas } from '../src/escribir/rutas.js';
import { constantesDe } from '../src/salida/trocear.js';
import { FUENTES, ORIGEN } from '../src/config.js';
import { cargarLua } from './ayuda/cargar-lua.js';
import { construirConFixtures } from './ayuda/construir.js';

const dirFixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const dirRxp = join(dirFixtures, 'rxp-mini');
const mapas = cargarMapas(join(dirFixtures, 'db-forever-mini.lua'));
const VERSION = '2026.11.09.1';

const construir = (fuentes) => construirConFixtures(fuentes, { mapas });
const tocArchivos = (dir) => readFileSync(join(dir, 'SnetForever_Rutas.toc'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('##'));

describe('addon SnetForever_Rutas con fixtures', () => {
  let carpetaTmp;
  let dirSalida;
  let resultado;
  let datos;
  const DUROTAR = 'RestedXP Forever Guide (H)\\01-06 Durotar';

  before(async () => {
    carpetaTmp = mkdtempSync(join(tmpdir(), 'snf-rutas-'));
    dirSalida = join(carpetaTmp, 'SnetForever_Rutas');
    const { guias } = construir([
      { en: 'durotar-en.lua', es: 'durotar-es.lua', tipo: 'normal' },
      { en: 'guias/skyrim-horda-en.lua', tipo: 'normal' },
    ]);
    resultado = escribirRutas(guias, dirSalida, { version: VERSION, dirRxp });
    datos = (await cargarLua(tocArchivos(dirSalida).map((f) => join(dirSalida, f)))).SNF_RUTAS;
  });
  after(() => rmSync(carpetaTmp, { recursive: true, force: true }));

  test('el 2.º paso de Durotar acepta la misión 4641 con su texto en español', () => {
    const paso = datos.guias[DUROTAR].pasos[1];
    const accept = paso.elementos.find((e) => e.t === 'accept');
    assert.equal(accept.q, 4641);
    assert.equal(accept.texto.es, 'Acepta la misión Tu lugar en el mundo');
    assert.equal(accept.texto.en, 'Accept Your Place In The World');
  });
  test('cabecera: versión, esquema y grupos con la guía', () => {
    assert.equal(datos.version, VERSION);
    assert.equal(datos.esquema, 1);
    assert.ok(datos.grupos['RestedXP Forever Guide (H)'].includes(DUROTAR));
  });
  test('grupos lista solo claves reales (también en el grupo de cada variante) y alias lleva las de variante', () => {
    const skyborne = Object.values(datos.guias).find((g) => Array.isArray(g.variantes) && g.variantes.length > 1);
    assert.ok(skyborne, 'el fixture de Skyrim trae una guía con variantes');
    for (const v of skyborne.variantes) {
      assert.ok(datos.grupos[v.grupo].includes(skyborne.clave), `grupos[${v.grupo}] debe traer ${skyborne.clave}`);
      if (v.clave !== skyborne.clave) assert.ok(!datos.grupos[v.grupo].includes(v.clave), `grupos[${v.grupo}] no debe traer ${v.clave}`);
      if (v.clave === skyborne.clave) assert.equal(datos.alias[v.clave], undefined);
      else assert.equal(datos.alias[v.clave], skyborne.clave);
    }
    assert.ok(skyborne.variantes.some((v) => v.clave !== skyborne.clave), 'hay una variante con otra clave');
  });
  test('el .toc lleva Interface 16001, título, versión y los archivos en orden', () => {
    const toc = readFileSync(join(dirSalida, 'SnetForever_Rutas.toc'), 'utf8');
    assert.match(toc, /^## Interface: 16001$/m);
    assert.match(toc, /^## Title: SnetForever - Rutas$/m);
    assert.match(toc, /^## IconTexture: Interface\\AddOns\\SnetForever\\recursos\\icono$/m); // la estrella de SnetForever en la lista de addons
    assert.match(toc, new RegExp(`^## Version: ${VERSION.replaceAll('.', '\\.')}$`, 'm'));
    const lua = tocArchivos(dirSalida);
    assert.equal(lua[0], 'nucleo.lua');
    assert.ok(lua.slice(1).every((f) => /^guias_\d+\.lua$/.test(f)));
    assert.deepEqual([...resultado.archivos].sort(), [...lua, 'SnetForever_Rutas.toc', 'LICENSE', 'CREDITOS.md'].sort());
  });
  test('LICENSE es la de RestedXP y CREDITOS.md nombra a RestedXP, a Skyrim, la licencia y la conversión', () => {
    assert.equal(readFileSync(join(dirSalida, 'LICENSE'), 'utf8'), readFileSync(join(dirRxp, 'LICENSE'), 'utf8'));
    const creditos = readFileSync(join(dirSalida, 'CREDITOS.md'), 'utf8');
    assert.match(creditos, /RestedXP/);
    assert.match(creditos, /v4\.11\.33/);
    assert.match(creditos, /Skyrim/);
    assert.match(creditos, /4\.5\.19/);
    assert.match(creditos, /CC BY-NC-SA 4\.0/);
    assert.match(creditos, /formato propio de SnetForever/);
  });
  test('devuelve archivos, bytes y avisos', () => {
    assert.ok(resultado.bytes > 0);
    const suma = resultado.archivos.reduce((s, f) => s + statSync(join(dirSalida, f)).size, 0);
    assert.equal(resultado.bytes, suma);
    assert.ok(Array.isArray(resultado.avisos));
  });
  test('nucleo.lua lleva el comentario de cabecera con la forma de los datos', () => {
    const nucleo = readFileSync(join(dirSalida, 'nucleo.lua'), 'utf8');
    assert.match(nucleo, /^-- SnetForever_Rutas/);
    assert.match(nucleo, /"c:WARRIOR"/);
    assert.match(nucleo, /"!r:Orc"/);
    assert.match(nucleo, /"n:10"/);
    assert.match(nucleo, /\{mapa, x, y\}/);
    assert.match(nucleo, /\{mapa, inst, wx, wy\}/);
    // Contrato con la fase 2 (decisión R22).
    assert.match(nucleo, /faccion nil = la guía vale para las dos facciones/);
    assert.match(nucleo, /grupos\[grupo\] lista SOLO claves que existen en SNF_RUTAS\.guias/);
    assert.match(nucleo, /etiquetasPorFiltro\? = \{\{nombre, valor, filtro\}\}/);
    assert.match(nucleo, /requisitos = \{\{t, \.\.\., filtro\?\}\}/);
    assert.match(nucleo, /variantes: una por cada combinación/);
    assert.match(nucleo, /itemStat = \{hueco, stat, op/);
  });
  test('exige versión con la forma AAAA.MM.DD.n', () => {
    const { guias } = construir([{ en: 'durotar-en.lua', es: 'durotar-es.lua', tipo: 'normal' }]);
    assert.throws(() => escribirRutas(guias, join(carpetaTmp, 'x'), { dirRxp }), /versión/);
    assert.throws(() => escribirRutas(guias, join(carpetaTmp, 'x'), { version: '1.0', dirRxp }), /AAAA\.MM\.DD\.n/);
  });
});

describe('guía que no cabe en un archivo', () => {
  let carpetaTmp;
  before(() => { carpetaTmp = mkdtempSync(join(tmpdir(), 'snf-rutas-grande-')); });
  after(() => rmSync(carpetaTmp, { recursive: true, force: true }));

  test('sus pasos se reparten en varios archivos, en orden, sin perder ninguno', async () => {
    const pasos = Array.from({ length: 60 }, (_, i) => ({
      id: `id${i}`, n: i + 1, etiquetas: {}, requisitos: [], linea: i,
      elementos: [{ t: 'manual', texto: { en: `Paso número ${i + 1} ${'x'.repeat(200)}` }, linea: i }],
    }));
    const grande = { clave: 'G\\grande', grupo: 'G', nombre: 'grande', titulo: { en: 'grande' }, niveles: [1, 2], pasos };
    const pequena = { clave: 'G\\pequena', grupo: 'G', nombre: 'pequena', titulo: { en: 'pequena' }, niveles: [1, 2], pasos: [pasos[0]] };
    const guias = new Map([[pequena.clave, pequena], [grande.clave, grande]]);
    const dirSalida = join(carpetaTmp, 'SnetForever_Rutas');
    const r = escribirRutas(guias, dirSalida, { version: VERSION, dirRxp, limiteBytes: 6000 });
    const lua = tocArchivos(dirSalida);
    assert.ok(lua.length > 3, `se esperaban varios archivos y hay ${lua.join(', ')}`);
    for (const f of lua) assert.ok(statSync(join(dirSalida, f)).size <= 6000, `${f} pasa el límite`);
    assert.ok(r.avisos.some((a) => a.includes('G\\grande') && /no cabe/.test(a)));

    const { SNF_RUTAS } = await cargarLua(lua.map((f) => join(dirSalida, f)));
    assert.deepEqual(SNF_RUTAS.guias['G\\grande'].pasos.map((p) => p.id), pasos.map((p) => p.id));
    assert.equal(SNF_RUTAS.guias['G\\grande'].pasos[59].elementos[0].texto.en, pasos[59].elementos[0].texto.en);
    assert.equal(SNF_RUTAS.guias['G\\pequena'].pasos.length, 1);
    assert.deepEqual(SNF_RUTAS.grupos.G, ['G\\pequena', 'G\\grande']);
  });
});

const hay = existsSync(join(ORIGEN, 'RXPGuides', 'LICENSE')) && existsSync(join(ORIGEN, 'RXPGuides', 'DB', 'forever', 'db.lua'));

describe('addon SnetForever_Rutas con las fuentes reales', { skip: !hay }, () => {
  let carpetaTmp;
  let dirSalida;
  let guias;
  let resultado;
  let datos;

  before(async () => {
    carpetaTmp = mkdtempSync(join(tmpdir(), 'snf-rutas-real-'));
    dirSalida = join(carpetaTmp, 'SnetForever_Rutas');
    const mapasReales = cargarMapas(join(ORIGEN, 'RXPGuides', 'DB', 'forever', 'db.lua'));
    ({ guias } = construirGuias(FUENTES, { mapas: mapasReales, descartados: {}, avisos: [] }));
    resultado = escribirRutas(guias, dirSalida, { version: VERSION });
    datos = (await cargarLua(tocArchivos(dirSalida).map((f) => join(dirSalida, f)))).SNF_RUTAS;
  });
  after(() => rmSync(carpetaTmp, { recursive: true, force: true }));

  test('todas las guías están y sus pasos son los mismos', () => {
    assert.equal(Object.keys(datos.guias).length, guias.size);
    for (const [clave, guia] of guias) assert.equal(datos.guias[clave].pasos.length, guia.pasos.length, clave);
  });
  test('cada archivo Lua cumple el límite de bytes', () => {
    for (const f of tocArchivos(dirSalida)) {
      const bytes = statSync(join(dirSalida, f)).size;
      assert.ok(bytes <= 500000, `${f}: ${bytes} bytes`);
    }
    assert.ok(resultado.bytes > 0);
  });
  test('LICENSE es el texto de RestedXP', () => {
    assert.equal(readFileSync(join(dirSalida, 'LICENSE'), 'utf8'), readFileSync(join(ORIGEN, 'RXPGuides', 'LICENSE'), 'utf8'));
  });
  test('los índices tienen todas las claves y grupos solo claves que existen en guias', () => {
    const enGrupos = new Set(Object.values(datos.grupos).flat());
    for (const [clave, guia] of guias) {
      assert.ok(enGrupos.has(clave), clave);
      for (const v of guia.variantes ?? []) assert.ok(v.clave === clave ? enGrupos.has(v.clave) : datos.alias[v.clave] === clave, v.clave);
    }
    for (const c of enGrupos) assert.ok(datos.guias[c], `grupos trae «${c}», que no está en guias`);
    assert.ok(constantesDe(datos.grupos).size < 50000);
  });
});
