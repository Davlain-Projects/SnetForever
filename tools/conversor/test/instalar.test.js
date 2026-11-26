// Pruebas de la escritura segura de las carpetas de los addons, con carpetas temporales propias.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  cuarentenaDelVolumen, instalarAddon, limpiarSobrantes, listarArchivos, moverSinPisar, selloDeAhora,
} from '../src/instalar.js';

let tmp;
const escribir = (ruta, texto) => { mkdirSync(dirname(ruta), { recursive: true }); writeFileSync(ruta, texto); };
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'snf-instalar-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('limpiarSobrantes', () => {
  // Lote C (revisión 52, Minor 7): nunca se borra nada. Lo que la nueva versión ya no trae va a la cuarentena,
  // <cuarentena>\<sello>\<nombre>\, también dentro de addons/ del repositorio (una sola regla).
  test('mueve a la cuarentena los archivos que la nueva versión ya no trae y deja los demás: ninguno desaparece', () => {
    const dir = join(tmp, 'SnetForever_Rutas');
    for (const f of ['nucleo.lua', 'guias_1.lua', 'guias_9.lua', 'viejo.md', 'sub/otro.lua']) escribir(join(dir, f), `texto de ${f}`);
    const cuarentena = join(tmp, 'cuarentena');
    const quitados = limpiarSobrantes(dir, ['nucleo.lua', 'guias_1.lua'], { cuarentena, nombre: 'SnetForever_Rutas', sello: '2026-11-10_120000' });
    assert.deepEqual(quitados.sort(), ['guias_9.lua', 'sub/otro.lua', 'viejo.md']);
    assert.deepEqual(listarArchivos(dir).sort(), ['guias_1.lua', 'nucleo.lua']);
    const aparte = join(cuarentena, '2026-11-10_120000', 'SnetForever_Rutas');
    assert.deepEqual(listarArchivos(aparte).sort(), ['guias_9.lua', 'sub/otro.lua', 'viejo.md']);
    for (const f of ['guias_9.lua', 'viejo.md', 'sub/otro.lua']) assert.equal(readFileSync(join(aparte, ...f.split('/')), 'utf8'), `texto de ${f}`);
  });
  test('no pisa lo que ya hay en la cuarentena con el mismo sello', () => {
    const dir = join(tmp, 'SnetForever_Rutas');
    const cuarentena = join(tmp, 'cuarentena');
    const opciones = { cuarentena, nombre: 'SnetForever_Rutas', sello: 'S' };
    escribir(join(dir, 'guias_9.lua'), 'primero');
    limpiarSobrantes(dir, [], opciones);
    escribir(join(dir, 'guias_9.lua'), 'segundo');
    limpiarSobrantes(dir, [], opciones);
    const aparte = join(cuarentena, 'S', 'SnetForever_Rutas');
    const textos = listarArchivos(aparte).map((f) => readFileSync(join(aparte, f), 'utf8')).sort();
    assert.deepEqual(textos, ['primero', 'segundo']);
  });
  test('sin carpeta de cuarentena no toca nada (da error)', () => {
    const dir = join(tmp, 'SnetForever_Rutas');
    escribir(join(dir, 'guias_9.lua'), 'x');
    assert.throws(() => limpiarSobrantes(dir, []), /cuarentena/);
    assert.deepEqual(listarArchivos(dir), ['guias_9.lua']);
  });
  test('una carpeta que no existe no da error', () => {
    assert.deepEqual(limpiarSobrantes(join(tmp, 'no-hay'), [], { cuarentena: join(tmp, 'c'), nombre: 'X', sello: 'S' }), []);
  });
  test('cuarentenaDelVolumen: <raíz del volumen>\\_CUARENTENA\\SnetForever de la carpeta de salida', () => {
    assert.equal(cuarentenaDelVolumen(String.raw`E:\PROY\addons`), String.raw`E:\_CUARENTENA\SnetForever`);
    assert.equal(cuarentenaDelVolumen(String.raw`D:\otra\salida`), String.raw`D:\_CUARENTENA\SnetForever`);
  });
  test('selloDeAhora: AAAA-MM-DD_HHMMSS, como banco-wow/src/instalar.js', () => {
    assert.equal(selloDeAhora(new Date(2026, 10, 10, 9, 5, 7)), '2026-11-10_090507');
  });
});

describe('moverSinPisar', () => {
  test('si el destino ya existe en la cuarentena, no lo sobrescribe: usa un sufijo con fecha y hora', () => {
    const destino = join(tmp, 'cuarentena', 'v', 'guias_9.lua');
    escribir(destino, 'el de antes');
    const origen = join(tmp, 'AddOns', 'guias_9.lua');
    escribir(origen, 'el nuevo');
    const ahora = new Date(2026, 10, 9, 13, 5, 7);
    const final = moverSinPisar(origen, destino, { ahora });
    assert.equal(final, join(tmp, 'cuarentena', 'v', 'guias_9-20261109-130507.lua'));
    assert.equal(readFileSync(destino, 'utf8'), 'el de antes', 'el que ya estaba sigue igual');
    assert.equal(readFileSync(final, 'utf8'), 'el nuevo');
    assert.equal(existsSync(origen), false);
    // Una segunda vez en el mismo segundo añade un contador.
    escribir(origen, 'otro más');
    const otra = moverSinPisar(origen, destino, { ahora });
    assert.equal(otra, join(tmp, 'cuarentena', 'v', 'guias_9-20261109-130507-2.lua'));
    assert.equal(readFileSync(otra, 'utf8'), 'otro más');
  });
  test('entre unidades distintas (EXDEV) copia, comprueba la copia y luego quita el original', () => {
    const origen = join(tmp, 'AddOns', 'a.lua');
    escribir(origen, 'contenido');
    const exdev = () => { const e = new Error('cross-device link not permitted'); e.code = 'EXDEV'; throw e; };
    const final = moverSinPisar(origen, join(tmp, 'Q', 'a.lua'), { renombrar: exdev });
    assert.equal(readFileSync(final, 'utf8'), 'contenido');
    assert.equal(existsSync(origen), false);
  });
  test('otro error al renombrar se propaga y no toca el original', () => {
    const origen = join(tmp, 'AddOns', 'b.lua');
    escribir(origen, 'x');
    const falla = () => { const e = new Error('ocupado'); e.code = 'EBUSY'; throw e; };
    assert.throws(() => moverSinPisar(origen, join(tmp, 'Q', 'b.lua'), { renombrar: falla }), /ocupado/);
    assert.equal(readFileSync(origen, 'utf8'), 'x');
  });
});

describe('instalarAddon', () => {
  test('sobrescribe, y los .lua viejos van a la cuarentena sin pisar lo que ya había', () => {
    const generado = join(tmp, 'addons', 'SnetForever_Rutas');
    escribir(join(generado, 'nucleo.lua'), 'nuevo nucleo');
    escribir(join(generado, 'SnetForever_Rutas.toc'), 'toc');
    const destino = join(tmp, 'juego', 'AddOns', 'SnetForever_Rutas');
    escribir(join(destino, 'nucleo.lua'), 'viejo nucleo');
    escribir(join(destino, 'guias_9.lua'), 'guía vieja');
    escribir(join(destino, 'notas.txt'), 'no es lua: se queda');
    const cuarentena = join(tmp, 'cuarentena');
    escribir(join(cuarentena, '1.0', 'SnetForever_Rutas', 'guias_9.lua'), 'de una instalación anterior');

    const r = instalarAddon(generado, destino, { version: '1.0', nombre: 'SnetForever_Rutas', cuarentena });
    assert.equal(r.copiados, 2);
    assert.equal(readFileSync(join(destino, 'nucleo.lua'), 'utf8'), 'nuevo nucleo');
    assert.equal(existsSync(join(destino, 'guias_9.lua')), false);
    assert.equal(readFileSync(join(destino, 'notas.txt'), 'utf8'), 'no es lua: se queda');
    assert.equal(r.aCuarentena.length, 1);
    assert.equal(readFileSync(r.aCuarentena[0], 'utf8'), 'guía vieja');
    assert.equal(readFileSync(join(cuarentena, '1.0', 'SnetForever_Rutas', 'guias_9.lua'), 'utf8'), 'de una instalación anterior');
  });
});
