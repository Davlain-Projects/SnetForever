// Pruebas del validador y del informe, con guías de prueba hechas a mano.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validar } from '../src/validar.js';
import { escribirInforme } from '../src/informe.js';
import { COMBINACIONES } from '../src/config.js';

const ORCO = [{ raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde', classic: true }];
const A = 'G\\01-10 Inicio';
const B = 'G\\10-60 Final';

const guia = (clave, niveles, siguientes = [], extra = {}) => ({
  clave, nombre: clave, niveles, tipo: 'normal', siguientes, pasos: [], fuente: 'prueba.lua', ...extra,
});
const mapa = (...gs) => new Map(gs.map((g) => [g.clave, g]));
const misiones = (ids = [], descartadas = []) => ({
  quest: new Map(ids.map((i) => [i, {}])), descartadas: new Set(descartadas),
});
const paso = (...elementos) => ({ id: 'x', n: 1, etiquetas: {}, elementos, requisitos: [], linea: 1 });
const correr = (guias, m = misiones(), combinaciones = ORCO) => validar({ guias, misiones: m, combinaciones });

describe('validar', () => {
  test('COMBINACIONES: Classic con su facción y Skyborne con las 9 clases en las dos facciones', () => {
    const classic = COMBINACIONES.filter((c) => c.classic);
    const sky = COMBINACIONES.filter((c) => !c.classic);
    assert.equal(classic.length, 40);
    assert.equal(sky.length, 18);
    assert.ok(sky.every((c) => c.raza === 'Skyborne'));
    assert.ok(COMBINACIONES.some((c) => c.raza === 'Human' && c.clase === 'PALADIN' && c.faccion === 'Alliance'));
    assert.ok(!COMBINACIONES.some((c) => c.raza === 'Orc' && c.clase === 'MAGE'));
  });

  test('un #next a una guía inexistente da un error con las dos claves', () => {
    const g = mapa(guia(A, [1, 10], [{ clave: 'G\\No Existe' }]));
    const { errores } = correr(g);
    assert.ok(errores.some((e) => e.includes(A) && e.includes('G\\No Existe')), errores.join('\n'));
  });

  test('una cadena 1-10 → 10-60 llega a 60', () => {
    const g = mapa(guia(A, [1, 10], [{ clave: B }]), guia(B, [10, 60]));
    const r = correr(g);
    assert.deepEqual(r.errores, []);
    assert.equal(r.cobertura.length, 1);
    assert.equal(r.cobertura[0].llega60, true);
    assert.deepEqual(r.cobertura[0].cadena, [A, B]);
    assert.deepEqual(r.avisos, []);
  });

  test('un bucle A → B → A da error sin colgarse', () => {
    const g = mapa(guia(A, [1, 10], [{ clave: B }]), guia(B, [10, 20], [{ clave: A }]));
    const r = correr(g);
    assert.equal(r.cobertura[0].llega60, false);
    assert.ok(r.errores.some((e) => /bucle/i.test(e) && e.includes('Orc')), r.errores.join('\n'));
  });

  test('una misión desconocida da aviso, y las conocidas o descartadas no', () => {
    const g = mapa(guia(A, [1, 60], [], {
      pasos: [paso({ t: 'accept', q: 111 }, { t: 'complete', q: 222 }, { t: 'isOnQuest', qs: [333, 444] })],
    }));
    const r = correr(g, misiones([111], [222, 333]));
    const av = r.avisos.filter((a) => a.includes('misi'));
    assert.equal(av.length, 1);
    assert.ok(av[0].includes('444'));
    assert.ok(!av[0].includes('111') && !av[0].includes('222') && !av[0].includes('333'));
  });

  test('una coordenada x = 140 da aviso (también en puntos de línea)', () => {
    const g = mapa(guia(A, [1, 60], [], {
      pasos: [paso({ t: 'pin', mapa: 1, x: 140, y: 50, linea: 7 }, { t: 'line', puntos: [{ mapa: 1, x: 50, y: 101 }] })],
    }));
    const av = correr(g).avisos.filter((a) => a.includes('coordenada'));
    assert.ok(av.length >= 1);
    assert.ok(av.join('\n').includes('140'));
    assert.ok(av.join('\n').includes('101'));
  });

  test('una combinación Classic sin guía de inicio da error; Skyborne solo aviso', () => {
    const g = mapa(guia(A, [1, 60], [], { faccion: 'Alliance' }));
    const comb = [...ORCO, { raza: 'Skyborne', clase: 'MAGE', faccion: 'Horde', classic: false }];
    const r = correr(g, misiones(), comb);
    assert.ok(r.errores.some((e) => e.includes('Orc') && e.includes('WARRIOR')));
    assert.ok(r.errores.some((e) => /Skyborne/.test(e)), 'si ninguna clase llega, es error');
    const comb2 = [{ raza: 'Skyborne', clase: 'MAGE', faccion: 'Alliance', classic: false },
      { raza: 'Skyborne', clase: 'DRUID', faccion: 'Horde', classic: false }];
    const r2 = correr(g, misiones(), comb2);
    // Alianza llega (sin errores). Horda no tiene guía de inicio y es su única clase Skyborne:
    // como ninguna llega en esa facción, es error (no aviso).
    assert.deepEqual(r2.errores.filter((e) => e.includes('Alliance')), []);
    assert.ok(r2.errores.some((e) => e.includes('Skyborne (Horde)') && /ninguna clase/.test(e)));
  });

  test('Skyborne con alguna clase que no llega es aviso si otras sí llegan', () => {
    const g = mapa(guia(A, [1, 60], [], { porDefecto: [['c:MAGE']] }));
    const comb = [{ raza: 'Skyborne', clase: 'MAGE', faccion: 'Horde', classic: false },
      { raza: 'Skyborne', clase: 'DRUID', faccion: 'Horde', classic: false }];
    const r = correr(g, misiones(), comb);
    assert.deepEqual(r.errores, []);
    assert.ok(r.avisos.some((a) => a.includes('DRUID')));
  });

  test('la guía de inicio es la de menor nivel inicial cuyo porDefecto aplica', () => {
    const g = mapa(
      guia('G\\01-10 Mago', [1, 10], [{ clave: B }], { porDefecto: [['c:MAGE']] }),
      guia(A, [1, 10], [{ clave: B }]),
      guia('G\\05-10 Tarde', [5, 10], [{ clave: B }]),
      guia(B, [10, 60]),
    );
    const r = correr(g);
    assert.equal(r.cobertura[0].cadena[0], A);
  });

  test('toma la primera entrada de siguientes cuyo filtro aplica (nivel de la guía destino)', () => {
    const g = mapa(
      guia(A, [1, 10], [
        { clave: 'G\\10-60 Mago', filtro: [['c:MAGE']] },
        { clave: 'G\\10-60 Otra', filtro: [['n:11']] },
        { clave: B },
      ]),
      guia('G\\10-60 Mago', [10, 60]),
      guia('G\\10-60 Otra', [10, 60]),
      guia(B, [10, 60]),
    );
    assert.deepEqual(correr(g).cobertura[0].cadena, [A, B]);
  });

  test('A;B: si la guía A no aplica al personaje (su filtro o sus variantes), sigue por B', () => {
    const g = mapa(
      guia(A, [1, 10], [{ clave: 'G\\10-60 Cazador' }, { clave: 'G\\10-60 Variante' }, { clave: B }]),
      guia('G\\10-60 Cazador', [10, 60], [], { filtro: [['c:HUNTER']] }),
      guia('G\\10-60 Variante', [10, 60], [], {
        variantes: [{ clave: 'G\\10-60 Variante', grupo: 'G', titulo: { en: 'x' }, filtro: [['r:Tauren']] }],
      }),
      guia(B, [10, 60]),
    );
    assert.deepEqual(correr(g).cobertura[0].cadena, [A, B]);
    const cazador = [{ raza: 'Orc', clase: 'HUNTER', faccion: 'Horde', classic: true }];
    assert.deepEqual(correr(g, misiones(), cazador).cobertura[0].cadena, [A, 'G\\10-60 Cazador']);
  });

  test('la guía de inicio también tiene que aplicar por su filtro', () => {
    const g = mapa(
      guia('G\\01-10 Cazador', [1, 10], [{ clave: B }], { filtro: [['c:HUNTER']] }),
      guia('G\\02-10 Resto', [2, 10], [{ clave: B }]),
      guia(B, [10, 60]),
    );
    assert.equal(correr(g).cobertura[0].cadena[0], 'G\\02-10 Resto');
  });

  test('la versión con mazmorras se comprueba aparte y solo da avisos', () => {
    const M = 'GM\\01-10 Inicio';
    const g = mapa(
      guia(A, [1, 10], [{ clave: B }]),
      guia(B, [10, 60]),
      guia(M, [1, 10], [{ clave: 'GM\\No Existe' }], { tipo: 'mazmorras' }),
    );
    const r = correr(g);
    assert.equal(r.cobertura[0].llega60, true, 'la normal no usa la de mazmorras');
    assert.equal(r.coberturaMazmorras.length, 1);
    assert.equal(r.coberturaMazmorras[0].llega60, false);
    assert.deepEqual(r.coberturaMazmorras[0].cadena, [M]);
    assert.ok(!r.errores.some((e) => /mazmorras/i.test(e) && !e.includes('No Existe')), r.errores.join('\n'));
    assert.ok(r.avisosDetalle.some((a) => a.tipo === 'mazmorras-sin-60' && a.mensaje.includes('Orc')));
  });

  test('un sinResolver solo es error si la guía no tiene otra salida y no acaba en 60', () => {
    const malo = mapa(guia(A, [1, 10], [{ sinResolver: 'X' }]));
    assert.ok(correr(malo).errores.some((e) => e.includes(A) && e.includes('X')));
    const bien = mapa(guia(A, [1, 10], [{ sinResolver: 'X' }, { clave: B }]), guia(B, [10, 60]));
    assert.deepEqual(correr(bien).errores, []);
    const fin = mapa(guia(A, [1, 60], [{ sinResolver: 'X' }]));
    assert.deepEqual(correr(fin).errores, []);
  });

  test('aviso por salto de más de 1 nivel entre guías encadenadas', () => {
    const g = mapa(guia(A, [1, 10], [{ clave: B }]), guia(B, [13, 60]));
    const r = correr(g);
    assert.ok(r.avisos.some((a) => a.includes('salto') && a.includes(A) && a.includes(B)));
  });

  // Lote A (52-I2): un paso con texto que nada detiene se completaría solo, sin que el jugador lo lea.
  test('error si un paso con texto no tiene ningún elemento que bloquee (salvo pegajosos y recorridos)', () => {
    const nota = { t: 'nota', texto: { en: 'Talk to Newton', es: 'Habla con Newton' }, linea: 3 };
    const flecha = { t: 'goto', mapa: 1453, x: 57, y: 73, modo: 'flecha', linea: 2 };
    const g = mapa(guia(A, [1, 60], [], {
      pasos: [
        { ...paso(flecha, nota), n: 4 },
        { ...paso(flecha, nota, { t: 'accept', q: 1, linea: 4 }), n: 5 },
        { ...paso(nota), n: 6, etiquetas: { sticky: true } },
        { ...paso(flecha), n: 7 },
        { ...paso(nota, { t: 'manual', texto: { en: 'x' }, linea: 5 }), n: 8 },
      ],
    }));
    const { errores } = correr(g, misiones([1]));
    const delPaso = errores.filter((e) => /se completaría solo/.test(e));
    assert.equal(delPaso.length, 1, errores.join('\n'));
    assert.ok(delPaso[0].includes(A) && delPaso[0].includes('paso 4'), delPaso[0]);
  });

  test('una guía con variantes aplica si aplica alguna; la cadena usa la clave de la variante', () => {
    const v = guia(A, [1, 10], [{ clave: B }], {
      variantes: [
        { clave: 'H\\01-10 Mago', grupo: 'H', titulo: { en: 'x' }, filtro: [['c:MAGE']] },
        { clave: 'H\\01-10 Resto', grupo: 'H', titulo: { en: 'x' }, filtro: [['!c:MAGE']] },
      ],
    });
    const r = correr(mapa(v, guia(B, [10, 60])));
    assert.deepEqual(r.errores, []);
    assert.equal(r.cobertura[0].cadena[0], 'H\\01-10 Resto');
  });
});

describe('escribirInforme', () => {
  test('escribe markdown en español con todas las secciones, incluso vacías', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'snf-informe-'));
    try {
      const ruta = join(carpeta, 'sub', 'informe.md');
      const g = mapa(guia(A, [1, 10], [{ clave: B }]), guia(B, [10, 60]));
      const r = correr(g);
      escribirInforme(r, ruta);
      const md = readFileSync(ruta, 'utf8');
      for (const s of ['# Informe', '## Resumen', '## Errores', '## Cobertura', '## Avisos',
        '## Comandos descartados', '## Misiones descartadas']) assert.ok(md.includes(s), s);
      assert.ok(md.includes('Ninguno'));
      assert.ok(/Orc/.test(md) && /WARRIOR/.test(md));
      assert.ok(md.includes('## Cobertura de la versión con mazmorras'));
    } finally { rmSync(carpeta, { recursive: true, force: true }); }
  });

  test('la cobertura de la versión con mazmorras sale en el resumen y en su tabla', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'snf-informe-'));
    try {
      const ruta = join(carpeta, 'informe.md');
      const g = mapa(guia(A, [1, 10], [{ clave: B }]), guia(B, [10, 60]),
        guia('GM\\01-10 Inicio', [1, 10], [], { tipo: 'mazmorras' }));
      escribirInforme(correr(g), ruta);
      const md = readFileSync(ruta, 'utf8');
      assert.match(md, /Versión con mazmorras: 0 de 1 llegan al 60/);
      const seccion = md.slice(md.indexOf('## Cobertura de la versión con mazmorras'));
      assert.match(seccion, /\| Orc \| CORTA/);
    } finally { rmSync(carpeta, { recursive: true, force: true }); }
  });

  test('con extras añade avisos de construcción, descartados por comando y misiones descartadas', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'snf-informe-'));
    try {
      const ruta = join(carpeta, 'informe.md');
      const g = mapa(guia(A, [1, 10], [{ clave: 'G\\Nada' }]));
      const r = correr(g);
      escribirInforme(r, ruta, {
        estadisticas: { guias: 170, pasos: 14851 },
        avisosConstruccion: [{ tipo: 'descuadre', archivo: 'a.lua', mensaje: 'no cuadra' }],
        descartados: { '#som': 262, link: 164 },
        misionesDescartadas: [{ id: 5691, motivo: 'REUSE ME' }],
      });
      const md = readFileSync(ruta, 'utf8');
      assert.ok(md.includes('G\\Nada'));
      assert.ok(md.includes('#som') && md.includes('262'));
      assert.ok(md.includes('5691') && md.includes('REUSE ME'));
      assert.ok(md.includes('descuadre') && md.includes('a.lua'));
      assert.ok(md.includes('14851') || md.includes('14.851'));
    } finally { rmSync(carpeta, { recursive: true, force: true }); }
  });
});
