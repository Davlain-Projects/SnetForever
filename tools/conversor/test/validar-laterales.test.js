// Pruebas de validarLaterales: una por cada error de la lista y ninguno con datos correctos.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validarLaterales } from '../src/validar.js';

const paso = (elementos) => ({ id: 'p', n: 1, etiquetas: {}, requisitos: [], elementos, linea: 0 });
const cadena = (extra = {}) => ({
  clave: 'Cadenas de clase (H)\\c1', grupo: 'Cadenas de clase (H)', nombre: 'c1', titulo: { en: 'c1' }, tipo: 'cadena',
  niveles: { min: 10, max: 20 }, siguientes: [], mazmorras: [], fuente: { archivo: 'QuestieDB', linea: 0 },
  sinVerificar: true,
  pasos: [paso([{ t: 'accept', q: 100 }, { t: 'goto', mapa: 1411, x: 43.2, y: 68.5, modo: 'flecha' }])],
  ...extra,
});
const mazmorra = (extra = {}) => ({
  clave: 'Mazmorras SnetForever (H)\\13-18 RFC', grupo: 'Mazmorras SnetForever (H)', nombre: '13-18 RFC', titulo: { en: 'RFC' },
  tipo: 'mazmorra', niveles: { min: 13, max: 18 }, siguientes: [], mazmorras: [], fuente: { archivo: 'QuestieDB', linea: 0 },
  sinVerificar: true, area: 2437, pasos: [paso([{ t: 'turnin', q: 100 }])], ...extra,
});
const profesion = (extra = {}) => ({
  clave: 'Profesiones\\01-300 Herbalism (H)', grupo: 'Profesiones', nombre: 'H', titulo: { en: 'H' }, tipo: 'profesion',
  niveles: { min: 1, max: 60 }, siguientes: [], mazmorras: [], fuente: { archivo: 'Herbalism.lua', linea: 0 },
  sinVerificar: true, pasos: [paso([{ t: 'manual', texto: { en: 'x' }, linea: 0 }])], ...extra,
});
const aviso = (extra = {}) => ({ id: 'a1', tipo: 'cadena', clase: 'MAGE', nivel: 10, texto: { en: 'Texto' }, guia: cadena().clave, ...extra });
const misiones = { quest: new Map([[100, {}], [101, {}]]), descartadas: new Set() };
const mapa = (...gs) => new Map(gs.map((g) => [g.clave, g]));
const correcto = () => ({
  guiasRutas: mapa(profesion()),
  guiasMisiones: mapa(cadena(), mazmorra()),
  avisos: [aviso(), { id: 'a2', tipo: 'mazmorra', nivel: 13, hasta: 18, texto: { en: 'RFC' }, area: 2437 }],
  misiones,
});

describe('validarLaterales', () => {
  test('lote A: error si un paso con texto de una lateral no tiene nada que lo detenga', () => {
    const datos = correcto();
    datos.guiasRutas = mapa(profesion({
      pasos: [{ ...paso([{ t: 'nota', texto: { en: 'Go through the Dark Portal' }, linea: 1 }]), n: 19 }],
    }));
    const { errores } = validarLaterales(datos);
    assert.ok(errores.some((e) => /se completaría solo/.test(e) && e.includes('paso 19')), errores.join('\n'));
  });

  test('con datos correctos no da errores', () => {
    const r = validarLaterales(correcto());
    assert.deepEqual(r.errores, []);
    assert.ok(Array.isArray(r.avisos));
  });
  test('un aviso sin tipo cuenta como de cadena y puede apuntar a una guía de Rutas', () => {
    const e = correcto();
    e.avisos = [aviso({ tipo: undefined, guia: profesion().clave })];
    assert.deepEqual(validarLaterales(e).errores, []);
  });
  test('error si una clave está en los dos addons', () => {
    const e = correcto();
    e.guiasRutas = mapa(profesion(), cadena());
    const { errores } = validarLaterales(e);
    assert.equal(errores.length, 1);
    assert.match(errores[0], /Cadenas de clase \(H\)\\c1.*dos addons|dos addons.*Cadenas de clase \(H\)\\c1/);
  });
  test('error si aviso.guia no existe', () => {
    const e = correcto();
    e.avisos = [aviso({ guia: 'Cadenas de clase (H)\\no-existe' })];
    const { errores } = validarLaterales(e);
    assert.equal(errores.length, 1);
    assert.match(errores[0], /no-existe/);
  });
  test('error si un aviso no tiene nivel numérico', () => {
    const e = correcto();
    e.avisos = [aviso({ nivel: '10' })];
    const { errores } = validarLaterales(e);
    assert.equal(errores.length, 1);
    assert.match(errores[0], /nivel/);
  });
  test('error si un aviso no tiene texto.en', () => {
    for (const texto of [undefined, {}, { es: 'solo es' }, { en: '' }]) {
      const e = correcto();
      e.avisos = [aviso({ texto })];
      const { errores } = validarLaterales(e);
      assert.equal(errores.length, 1, JSON.stringify(texto));
      assert.match(errores[0], /texto\.en/);
    }
  });
  test('error si un aviso de cadena no tiene clase (con tipo y sin tipo)', () => {
    for (const tipo of ['cadena', undefined]) {
      const e = correcto();
      e.avisos = [aviso({ tipo, clase: undefined })];
      const { errores } = validarLaterales(e);
      assert.equal(errores.length, 1);
      assert.match(errores[0], /clase/);
    }
  });
  test('un aviso de mazmorra no necesita clase', () => {
    const e = correcto();
    e.avisos = [{ id: 'm', tipo: 'mazmorra', nivel: 13, texto: { en: 'RFC' } }];
    assert.deepEqual(validarLaterales(e).errores, []);
  });
  test('error si una guía de cadena tiene una q que no está en la base', () => {
    const e = correcto();
    e.guiasMisiones = mapa(cadena({ pasos: [paso([{ t: 'accept', q: 999999 }])] }), mazmorra());
    const { errores } = validarLaterales(e);
    assert.equal(errores.length, 1);
    assert.match(errores[0], /999999/);
  });
  test('error si una guía de mazmorra tiene una q que no está en la base (también en qs)', () => {
    const e = correcto();
    e.guiasMisiones = mapa(cadena(), mazmorra({ pasos: [paso([{ t: 'isQuestTurnedIn', qs: [100, 888888] }])] }));
    const { errores } = validarLaterales(e);
    assert.equal(errores.length, 1);
    assert.match(errores[0], /888888/);
  });
  test('error si un paso no tiene elementos', () => {
    for (const elementos of [[], undefined]) {
      const e = correcto();
      e.guiasRutas = mapa(profesion({ pasos: [{ id: 'p', n: 1, elementos }] }));
      const { errores } = validarLaterales(e);
      assert.equal(errores.length, 1);
      assert.match(errores[0], /sin elementos/);
    }
  });
  test('error si una coordenada está fuera de 0-100', () => {
    const e = correcto();
    e.guiasMisiones = mapa(cadena({ pasos: [paso([{ t: 'accept', q: 100 }, { t: 'goto', mapa: 1, x: 101, y: 50, modo: 'flecha' }])] }), mazmorra());
    let r = validarLaterales(e);
    assert.equal(r.errores.length, 1);
    assert.match(r.errores[0], /x=101/);
    e.guiasMisiones = mapa(cadena({ pasos: [paso([{ t: 'goto', mapa: 1, x: 5, y: -0.5, modo: 'flecha' }])] }), mazmorra());
    r = validarLaterales(e);
    assert.equal(r.errores.length, 1);
    assert.match(r.errores[0], /y=-0\.5/);
  });
  test('las coordenadas 0 y 100 valen', () => {
    const e = correcto();
    e.guiasMisiones = mapa(cadena({ pasos: [paso([{ t: 'goto', mapa: 1, x: 0, y: 100, modo: 'flecha' }])] }), mazmorra());
    assert.deepEqual(validarLaterales(e).errores, []);
  });
  test('una profesión no se comprueba contra la base de misiones', () => {
    const e = correcto();
    e.guiasRutas = mapa(profesion({ pasos: [paso([{ t: 'accept', q: 424242 }])] }));
    assert.deepEqual(validarLaterales(e).errores, []);
  });
  test('avisa de las misiones que un aviso da por hechas y no están en la base', () => {
    const e = correcto();
    e.avisos = [aviso({ hechas: [100, 777777] })];
    const r = validarLaterales(e);
    assert.deepEqual(r.errores, []);
    assert.equal(r.avisos.length, 1);
    assert.match(r.avisos[0], /777777/);
  });
  test('error (no excepción) si hechas no es una lista', () => {
    for (const hechas of [100, '100', { 1: 100 }]) {
      const e = correcto();
      e.avisos = [aviso({ hechas })];
      let r;
      assert.doesNotThrow(() => { r = validarLaterales(e); }, JSON.stringify(hechas));
      assert.equal(r.errores.length, 1, JSON.stringify(hechas));
      assert.match(r.errores[0], /hechas/);
    }
  });
  test('error si una coordenada no es un número (NaN, texto o infinito)', () => {
    for (const x of [NaN, '5', Infinity]) {
      const e = correcto();
      e.guiasMisiones = mapa(cadena({ pasos: [paso([{ t: 'goto', mapa: 1, x, y: 50, modo: 'flecha' }])] }), mazmorra());
      const { errores } = validarLaterales(e);
      assert.equal(errores.length, 1, String(x));
      assert.match(errores[0], /coordenada x/);
    }
  });
  test('error si una coordenada de un punto de recorrido es NaN', () => {
    const e = correcto();
    e.guiasRutas = mapa(profesion({ pasos: [paso([{ t: 'loop', puntos: [{ mapa: 1, x: 5, y: NaN }] }])] }));
    const { errores } = validarLaterales(e);
    assert.equal(errores.length, 1);
    assert.match(errores[0], /coordenada y/);
  });
});
