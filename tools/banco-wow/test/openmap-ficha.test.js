// Ficha de mazmorra de OpenMap, fase 5 tarea 1 (mapa/openmap.lua): qué mazmorras son (por nombre), qué líneas salen para el
// personaje y el color de cada nivel. Con el fixture openmap-mini (ver su cabecera) y un orco guerrero de nivel 20.
// Plano: docs/planes/2026-11-10-fase-5-instalador.md, tarea 1 y R13. No hay OpenMap en el banco: aquí solo se prueba la
// parte pura (areasDeInfo, lineas y colorNivel); el registro con OpenMapAPI es de la tarea 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { comprobarLua51 } from '../src/comprobar-lua51.js';
import { aLua } from '../src/lua-js.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const ADDON = join(RAIZ, 'addons', 'SnetForever');
const FIXTURES = join(AQUI, '..', 'fixtures');
const DATOS = [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(FIXTURES, 'openmap-mini.lua')];

const OF = 'SnetForever.OpenMapFicha';
const ZONAS_ES = '{[33]="Castillo de Colmillo Oscuro",[189]="Monasterio Escarlata",[229]="Cumbre de Roca Negra",[230]="Profundidades de Roca Negra"}';
const NOMBRES = {
  9001: 'Misión entregable', 9003: 'Misión de la Alianza', 9004: 'Misión de nivel alto', 9005: 'Misión con previa',
  9006: 'Misión ya entregada', 9007: 'Misión de dentro', 9008: 'Misión normal', 9009: 'Misión sin sitio', 9500: 'La previa',
};

function maquina(opciones = {}) {
  const m = nuevaMaquina({ datos: DATOS, jugador: { nivel: 20, raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde' }, ...opciones });
  m.lua(`BANCO.zonasReales = ${ZONAS_ES}`);
  for (const [q, nombre] of Object.entries(NOMBRES)) m.nombreJuego('mision', Number(q), nombre);
  return m;
}

const areas = (m, info) => m.lua(`${OF}.areasDeInfo(${aLua(info)})`) ?? [];
const lineas = (m, lista) => m.lua(`(function()
  local titulo, l = ${OF}.lineas(${aLua(lista)})
  if not titulo then return false end
  return {titulo, l}
end)()`);

// ---------------------------------------------------------------------------------------------------
// Qué mazmorra es (por nombre)
// ---------------------------------------------------------------------------------------------------

test('areasDeInfo: el nombre de la instancia da su área, también con códigos de color', () => {
  const m = maquina();
  assert.deepEqual(areas(m, { instances: [{ name: 'Castillo de Colmillo Oscuro' }] }), [209]);
  assert.deepEqual(areas(m, { instances: [{ name: '|cffffd100Castillo de Colmillo Oscuro|r' }] }), [209]);
  assert.deepEqual(areas(m, { instances: [{ name: '  castillo de colmillo oscuro ' }] }), [209]);
  sinErrores(m);
});

test('areasDeInfo (vigilancia 5): ala entre paréntesis, ala tras un guion y cliente en inglés', () => {
  const m = maquina();
  assert.deepEqual(areas(m, { instances: [{ name: 'Monasterio Escarlata (Scarlet Monastery - Library)' }] }), [796]);
  const en = maquina();
  en.lua('BANCO.zonasReales = {[189]="Scarlet Monastery"}');
  assert.deepEqual(areas(en, { instances: [{ name: 'Scarlet Monastery - Library' }] }), [796]);
  sinErrores(m);
  sinErrores(en);
});

test('areasDeInfo: un mapa con varias mazmorras da todas, en orden y sin repetir', () => {
  const m = maquina();
  assert.deepEqual(areas(m, { instances: [{ name: 'Cumbre de Roca Negra' }, { name: 'Profundidades de Roca Negra' }] }), [1583, 1584]);
  assert.deepEqual(areas(m, { instances: [{ name: 'Profundidades de Roca Negra' }, { name: 'Cumbre de Roca Negra' }, { name: 'Profundidades de Roca Negra' }] }), [1584, 1583]);
  sinErrores(m);
});

test('areasDeInfo: sin coincidencia, sin tabla o con el mapa como último recurso', () => {
  const m = maquina();
  assert.deepEqual(areas(m, { instances: [{ name: 'Nada' }] }), []);
  assert.deepEqual(m.lua(`${OF}.areasDeInfo(nil)`), []);
  assert.deepEqual(m.lua(`${OF}.areasDeInfo("texto")`), []);
  assert.deepEqual(m.lua(`${OF}.areasDeInfo({})`), []);
  m.lua('BANCO.mapas[999] = {nombre = "Castillo de Colmillo Oscuro", inst = 0, tipo = 3}');
  assert.deepEqual(areas(m, { mapID: 999, instances: [] }), [209]);
  // El mapa solo cuenta si no salió ninguna por nombre.
  assert.deepEqual(areas(m, { mapID: 999, instances: [{ name: 'Cumbre de Roca Negra' }] }), [1583]);
  assert.deepEqual(areas(m, { mapID: 12345, instances: [] }), []);
  sinErrores(m);
});

test('areasDeInfo: el índice de nombres también sirve con el nombre de los datos (sin nombre de zona del cliente)', () => {
  const m = maquina();
  m.lua('BANCO.zonasReales = {}');
  assert.deepEqual(areas(m, { instances: [{ name: 'Shadowfang Keep' }] }), [209]);
  sinErrores(m);
});

test('areasDeInfo: se rehace el índice si cambia la tabla SNF_MISIONES', () => {
  const m = maquina();
  assert.deepEqual(areas(m, { instances: [{ name: 'Castillo de Colmillo Oscuro' }] }), [209]);
  m.lua('SNF_MISIONES = {quest = {}, npc = {}, es = {quest = {}, npc = {}}, instancias = {[33] = 7777}, porMazmorra = {[7777] = {nombre = "Otra", misiones = {}}}}');
  assert.deepEqual(areas(m, { instances: [{ name: 'Castillo de Colmillo Oscuro' }] }), [7777]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Líneas
// ---------------------------------------------------------------------------------------------------

test('lineas: sin áreas da nil', () => {
  const m = maquina();
  assert.equal(lineas(m, []), false);
  sinErrores(m);
});

test('lineas: título, resumen y una línea por misión con el estado que manda el juego', () => {
  const m = maquina();
  m.estadoMision(9001, { enDiario: true, completa: true });
  m.estadoMision(9003, { enDiario: true });
  m.estadoMision(9006, { entregada: true });
  const [titulo, l] = lineas(m, [209]);
  assert.equal(titulo, 'SnetForever: tus misiones aquí');
  // Cuentan 9001, 9003 (registro), 9004, 9005, 9007, 9008 y 9009; 9002 es de la Alianza y 9006 está entregada.
  assert.equal(l[0], 'A tu nivel: 7 de 7  ·  Ya hechas: 1');
  const texto = l.slice(1).join('\n');
  assert.match(l[1], /Misión entregable/);
  assert.match(l[1], /lista para entregar/);
  assert.ok(!texto.includes('9002'));
  assert.match(texto, /Misión de la Alianza — en tu registro/);
  assert.match(texto, /Misión de nivel alto — a nivel 24/);
  assert.match(texto, /Misión con previa — antes: La previa/);
  assert.match(texto, /Misión de dentro — se coge dentro/);
  assert.ok(!texto.includes('Misión ya entregada'));
  assert.equal(l.length, 8);
  sinErrores(m);
});

test('lineas: orden completas, registro, coger, previa y nivel; y el dónde de «puedes cogerla»', () => {
  const m = maquina();
  m.estadoMision(9001, { enDiario: true, completa: true });
  m.estadoMision(9003, { enDiario: true });
  m.estadoMision(9006, { entregada: true });
  const [, l] = lineas(m, [209]);
  const orden = l.slice(1).map((x) => /\|r (.+?) — /.exec(x)[1]);
  assert.deepEqual(orden, [
    'Misión entregable', 'Misión de la Alianza', // completa y registro
    'Misión normal', 'Misión de dentro', 'Misión sin sitio', // coger, por nivel de misión (19, 22, 23)
    'Misión con previa', // previa
    'Misión de nivel alto', // nivel
  ]);
  const normal = l.find((x) => x.includes('Misión normal'));
  assert.match(normal, /puedes cogerla: Durotar$/); // el nombre del mapa de recoge.mapa
  const sinSitio = l.find((x) => x.includes('Misión sin sitio'));
  assert.match(sinSitio, /puedes cogerla: Gornek$/); // sin mapa, el PNJ
  sinErrores(m);
});

test('lineas: la línea lleva el nivel de la misión con su color', () => {
  const m = maquina();
  const [, l] = lineas(m, [209]);
  const normal = l.find((x) => x.includes('Misión normal'));
  assert.equal(normal, '|cffffff00[19]|r Misión normal — puedes cogerla: Durotar'); // 19 con nivel 20: amarillo
  const alta = l.find((x) => x.includes('Misión de nivel alto'));
  assert.ok(alta.startsWith('|cffff8040[24]|r '), alta); // 24 con nivel 20: naranja (4 por encima)
  sinErrores(m);
});

test('lineas: una entrega de una previa entregada deja de pedirla', () => {
  const m = maquina();
  m.estadoMision(9500, { entregada: true });
  const [, l] = lineas(m, [209]);
  const previa = l.find((x) => x.includes('Misión con previa'));
  assert.match(previa, /puedes cogerla: Durotar$/);
  sinErrores(m);
});

test('lineas: «todas» pide cada previa y nombra la primera que falta', () => {
  const m = maquina();
  m.lua(`SNF_MISIONES.porMazmorra[209].misiones[#SNF_MISIONES.porMazmorra[209].misiones + 1] =
    {q = 9010, nivel = 18, nivelMision = 20, todas = {9501, 9502}, recoge = {tipo = "npc", id = 3143}}`);
  m.nombreJuego('mision', 9010, 'Misión con todas');
  m.nombreJuego('mision', 9502, 'Segunda previa');
  m.estadoMision(9501, { entregada: true });
  const [, l] = lineas(m, [209]);
  assert.match(l.find((x) => x.includes('Misión con todas')), /antes: Segunda previa$/);
  m.estadoMision(9502, { entregada: true });
  assert.match(lineas(m, [209])[1].find((x) => x.includes('Misión con todas')), /puedes cogerla: Gornek$/);
  sinErrores(m);
});

test('lineas: con pj se puede dar otro personaje distinto del actual', () => {
  const m = maquina();
  const conPj = m.lua(`(function()
    local _, l = ${OF}.lineas({209}, {nivel = 60, raza = "Human", clase = "MAGE", faccion = "Alliance"})
    return l
  end)()`);
  // Un mago humano de la Alianza de nivel 60: le sirven las nueve misiones (ninguna excluye a la Alianza) y ninguna a su nivel.
  assert.equal(conPj[0], 'A tu nivel: 0 de 9');
  sinErrores(m);
});

test('lineas: un área sin nada para el personaje da «Ninguna misión de la base para tu personaje.»', () => {
  const m = maquina();
  const [titulo, l] = lineas(m, [796]);
  assert.equal(titulo, 'SnetForever: tus misiones aquí');
  assert.deepEqual(l, ['Ninguna misión de la base para tu personaje.']);
  sinErrores(m);
});

test('lineas: varias áreas llevan cada una su cabecera con el nombre de la zona', () => {
  const m = maquina();
  const [, l] = lineas(m, [1583, 1584]);
  assert.equal(l[0], 'A tu nivel: 2 de 2');
  assert.equal(l[1], '|cffd2d2dcBlackrock Spire|r');
  assert.match(l[2], /^\|cff/);
  assert.equal(l[3], '|cffd2d2dcBlackrock Depths|r');
  assert.equal(l.length, 5);
  sinErrores(m);
});

test('lineas: un nombre con «|» sale con «||»', () => {
  const m = maquina();
  m.nombreJuego('mision', 9008, 'A|B');
  const [, l] = lineas(m, [209]);
  assert.ok(l.some((x) => x.includes('|r A||B — ')), l.join('\n'));
  sinErrores(m);
});

// El área 1583 ya trae una misión (9201); se le añaden n más.
function conMuchas(n) {
  const m = maquina();
  m.lua(`(function()
    local lista = SNF_MISIONES.porMazmorra[1583].misiones
    for i = 1, ${n} do
      lista[#lista + 1] = {q = 9400 + i, nivel = 18, nivelMision = 20, recoge = {tipo = "npc", id = 3143, mapa = 1411}}
    end
  end)()`);
  return m;
}

test('lineas: nunca pasa de 24 líneas; la última dice cuántas no caben', () => {
  assert.equal(maquina().lua(`${OF}.MAX_LINEAS`), 24);
  // Con 31 misiones en total: resumen + 22 misiones + «…y 9 más»; con 30 en total, «…y 8 más»; con 29, «…y 7 más».
  for (const [extra, quedan] of [[30, 9], [29, 8], [28, 7]]) {
    const m = conMuchas(extra);
    const [, l] = lineas(m, [1583]);
    assert.equal(l.length, 24, `con ${extra + 1} misiones`);
    assert.equal(l[0], `A tu nivel: ${extra + 1} de ${extra + 1}`);
    assert.equal(l[23], `…y ${quedan} más (ábrelas con /snet)`);
    sinErrores(m);
  }
});

test('lineas: con 30 misiones que se pueden coger sale resumen + 22 misiones + la línea de las que no caben', () => {
  // El brief habla de «30 entradas»: 30 en total en el área, no 30 añadidas a la que ya tiene una.
  const m = maquina();
  m.lua(`(function()
    local lista = {}
    for i = 1, 30 do
      lista[i] = {q = 9400 + i, nivel = 18, nivelMision = 20, recoge = {tipo = "npc", id = 3143, mapa = 1411}}
    end
    SNF_MISIONES.porMazmorra[1583].misiones = lista
  end)()`);
  const [, l] = lineas(m, [1583]);
  assert.equal(l.length, 24);
  assert.equal(l[0], 'A tu nivel: 30 de 30');
  assert.equal(l[23], '…y 8 más (ábrelas con /snet)');
  assert.ok(l.slice(1, 23).every((x) => x.startsWith('|cff')));
  sinErrores(m);
});

test('lineas: con justo 23 misiones caben todas (resumen + 23 = 24)', () => {
  const m = maquina();
  m.lua(`(function()
    local lista = {}
    for i = 1, 23 do
      lista[i] = {q = 9400 + i, nivel = 18, nivelMision = 20, recoge = {tipo = "npc", id = 3143, mapa = 1411}}
    end
    SNF_MISIONES.porMazmorra[1583].misiones = lista
  end)()`);
  const [, l] = lineas(m, [1583]);
  assert.equal(l.length, 24);
  assert.ok(l.every((x) => !x.includes('…y ')));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Color por nivel
// ---------------------------------------------------------------------------------------------------

const color = (m, mision, nivel) => m.lua(`${OF}.colorNivel(${mision}, ${nivel})`);

test('colorNivel: sin el color del juego, por diferencia de nivel', () => {
  const m = maquina();
  assert.equal(color(m, 26, 20), 'ff1919');
  assert.equal(color(m, 25, 20), 'ff1919');
  assert.equal(color(m, 24, 20), 'ff8040');
  assert.equal(color(m, 23, 20), 'ff8040');
  assert.equal(color(m, 22, 20), 'ffff00');
  assert.equal(color(m, 20, 20), 'ffff00');
  assert.equal(color(m, 18, 20), 'ffff00');
  assert.equal(color(m, 17, 20), '40bf40'); // por encima de 20 − 8
  assert.equal(color(m, 13, 20), '40bf40');
  assert.equal(color(m, 12, 20), '808080');
  assert.equal(color(m, 5, 20), '808080');
  // Gris: 6 por debajo del nivel 20, 8 por debajo del 40 y 10 desde el 40.
  assert.equal(color(m, 15, 19), '40bf40');
  assert.equal(color(m, 13, 19), '808080');
  assert.equal(color(m, 32, 39), '40bf40');
  assert.equal(color(m, 31, 39), '808080');
  assert.equal(color(m, 51, 60), '40bf40');
  assert.equal(color(m, 50, 60), '808080');
  sinErrores(m);
});

test('colorNivel: con GetQuestDifficultyColor, el del juego', () => {
  const m = maquina();
  m.lua('BANCO.colorDificultad = {r = 0, g = 1, b = 0}');
  assert.equal(color(m, 20, 20), '00ff00');
  m.lua('BANCO.colorDificultad = {r = 1, g = 0.5, b = 0.25}');
  assert.equal(color(m, 20, 20), 'ff8040');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Andamiaje 0.5.14
// ---------------------------------------------------------------------------------------------------

test('versión 0.7.0, dependencias opcionales, orden de OpenMap y ajuste openmap.ficha', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.VERSION'), '0.7.0');
  assert.equal(m.lua('type(SnetForever.OpenMapFicha)'), 'table');
  assert.equal(m.lua('SnetForever.Ajustes.get("openmap.ficha")'), true);
  const toc = readFileSync(join(ADDON, 'SnetForever.toc'), 'utf8');
  assert.match(toc, /^## Version: 0.7.0\r?$/m);
  const lineas = toc.split(/\r?\n/).map((x) => x.trim());
  const dependencias = lineas.findIndex((x) => x.startsWith('## Dependencies:'));
  assert.equal(lineas[dependencias + 1], '## OptionalDeps: OpenMap, SnetForever_MisGuias, SnetForever_RutasRXP');
  const cercanos = lineas.indexOf('mapa\\cercanos.lua');
  assert.ok(cercanos > 0);
  assert.equal(lineas[cercanos + 1], 'mapa\\openmap.lua');
  sinErrores(m);
});

test('Contexto.entradaCumple es pública y sigue la regla de facción, clase y raza', () => {
  const m = maquina();
  const cumple = (e, pj) => m.lua(`SnetForever.Contexto.entradaCumple(${aLua(e)}, ${aLua(pj)})`);
  const orco = { faccion: 'Horde', clase: 'WARRIOR', raza: 'Orc' };
  assert.equal(cumple({}, orco), true);
  assert.equal(cumple({ faccion: 'Alliance' }, orco), false);
  assert.equal(cumple({ clases: ['MAGE'] }, orco), false);
  assert.equal(cumple({ razas: ['Orc'] }, orco), true);
  sinErrores(m);
});

test('openmap.lua pasa el comprobador de Lua 5.1 y el addon carga sin errores', () => {
  const resultado = comprobarLua51(readFileSync(join(ADDON, 'mapa', 'openmap.lua'), 'utf8'), 'mapa/openmap.lua');
  assert.deepEqual(resultado, []);
  const m = maquina();
  sinErrores(m);
});
