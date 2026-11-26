// Profesiones de RestedXP recortadas al tramo 1-300 (tarea 9 de la fase 3, regla R4).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cargarMapas } from '../src/rxp/coordenadas.js';
import { construirGuias } from '../src/rxp/guias.js';
import { leerOpenMap } from '../src/openmap.js';
import { ORIGEN, FUENTES_PROFESIONES } from '../src/config.js';
import { NO_CLASICO, recortarProfesion } from '../src/rxp/profesiones.js';
import { VERIFICADAS } from '../src/cadenas/verificadas.js';
import { construirConFixtures } from './ayuda/construir.js';

// Mapas de los nombres del fixture (los ids son los de la interfaz de WoW).
const mapas = new Map([
  ['Undercity', 1458], ['Tirisfal Glades', 1420], ['Swamp of Sorrows', 1435], ['Hellfire Peninsula', 1944],
]);
const niveles = new Map([[1458, [1, 1]], [1420, [1, 10]], [1435, [35, 45]], [1944, [58, 63]]]);
const fuentesFixture = [{ en: 'profesion-en.lua', es: 'profesion-es.lua', tipo: 'profesion', profesion: 'herbalism', hasta: 300 }];
const guiaFixture = () => construirConFixtures(fuentesFixture, { mapas }).guias.values().next().value;
const recortar = (opciones = {}) => recortarProfesion(guiaFixture(), { profesion: 'herbalism', hasta: 300, niveles, ...opciones });

describe('configuración de las profesiones', () => {
  test('FUENTES_PROFESIONES son las tres guías con su pareja en español', () => {
    assert.deepEqual(FUENTES_PROFESIONES, [
      { en: 'RXPGuides/Guides/Herbalism.lua', es: 'RXPGuides/lang/Guides-esES/Herbalism.lua', tipo: 'profesion', profesion: 'herbalism', hasta: 300 },
      { en: 'RXPGuides/Guides/Mining.lua', es: 'RXPGuides/lang/Guides-esES/Mining.lua', tipo: 'profesion', profesion: 'mining', hasta: 300 },
      { en: 'RXPGuides/Guides/Skinning.lua', es: 'RXPGuides/lang/Guides-esES/Skinning.lua', tipo: 'profesion', profesion: 'skinning', hasta: 300 },
    ]);
  });
  test('NO_CLASICO lista las zonas que no son del mundo clásico', () => {
    assert.deepEqual(NO_CLASICO, ['Dalaran', 'Shattrath', 'Northrend', 'Outland', 'Hellfire', 'Terokkar', 'Nagrand',
      'Zangarmarsh', "Blade's Edge", 'Netherstorm', 'Shadowmoon', 'Borean', 'Howling Fjord', 'Dragonblight',
      'Grizzly Hills', "Zul'Drak", 'Sholazar', 'Storm Peaks', 'Icecrown', 'Wintergrasp', 'Crystalsong']);
  });
});

describe('recortarProfesion sobre el fixture', () => {
  test('quedan los pasos 1, 2, 4 y 5 del original', () => {
    const { guia } = recortar();
    assert.equal(guia.pasos.length, 4);
    assert.deepEqual(guia.pasos.map((p) => p.n), [1, 2, 3, 4]);
    assert.deepEqual(guia.pasos.map((p) => p.linea), [11, 14, 21, 24], 'las líneas siguen siendo las del original');
    assert.ok(guia.pasos[0].elementos.some((e) => e.t === 'train'));
    assert.ok(guia.pasos[1].elementos.some((e) => e.t === 'loop'));
    assert.ok(guia.pasos[3].elementos.some((e) => e.t === 'skill' && e.n === 300));
  });
  test('cuenta pasos, recortados y descartados por motivo', () => {
    const { cuenta } = recortar();
    assert.deepEqual(cuenta, { pasos: 6, recortados: 1, descartados: { hs: 1 } });
  });
  test('el paso de Swamp of Sorrows lleva el nivel de OpenMap y los demás no', () => {
    const { guia } = recortar();
    assert.deepEqual(guia.pasos[2].requisitos.filter((r) => r.t === 'nivel'), [{ t: 'nivel', n: 35 }]);
    for (const i of [0, 1, 3]) assert.deepEqual(guia.pasos[i].requisitos.filter((r) => r.t === 'nivel'), [], `paso ${i + 1}`);
  });
  test('un loop cuenta igual que un goto para el nivel', () => {
    const { guia } = recortar({ niveles: new Map([[1420, [12, 20]]]) });
    assert.deepEqual(guia.pasos[1].requisitos.filter((r) => r.t === 'nivel'), [{ t: 'nivel', n: 12 }]);
    assert.deepEqual(guia.pasos[3].requisitos.filter((r) => r.t === 'nivel'), [{ t: 'nivel', n: 12 }]);
  });
  test('clave, nombre y títulos pasan de 450 a 300 y el español sale del fixture', () => {
    const { guia } = recortar();
    assert.equal(guia.clave, 'Profesiones\\01-300 Herbalism (H)');
    assert.equal(guia.nombre, '01-300 Herbalism (H)');
    assert.deepEqual(guia.titulo, { en: '1-300 Herbalism', es: '1-300 Herboristería' });
  });
  test('campos de la guía lateral', () => {
    const { guia } = recortar();
    assert.equal(guia.grupo, 'Profesiones');
    assert.equal(guia.tipo, 'profesion');
    assert.deepEqual(guia.niveles, { min: 1, max: 60 });
    assert.deepEqual(guia.tramo, { es: 'Habilidad 1-300', en: 'Skill 1-300' });
    assert.deepEqual(guia.habilidad, { p: 'herbalism', desde: 1, hasta: 300 });
    assert.equal(guia.sinVerificar, true);
    assert.equal(guia.faccion, 'Horde');
    assert.deepEqual(guia.siguientes, []);
    assert.deepEqual(guia.mazmorras, []);
    assert.deepEqual(guia.fuente, { archivo: 'profesion-en.lua', linea: 0 });
    assert.equal(guia.variantes, undefined);
    assert.equal(guia.contenido, undefined);
  });
  test('los pasos conservan sus id y no llevan campos de trabajo', () => {
    const original = guiaFixture();
    const { guia } = recortar();
    assert.deepEqual(guia.pasos.map((p) => p.id), [0, 1, 3, 4].map((i) => original.pasos[i].id));
    for (const p of guia.pasos) assert.ok(!('contenido' in p) && !('es' in p), 'sin campos internos');
  });
  test('no modifica la guía de entrada', () => {
    const entrada = guiaFixture();
    const copia = JSON.stringify(entrada);
    recortarProfesion(entrada, { profesion: 'herbalism', hasta: 300, niveles });
    assert.equal(JSON.stringify(entrada), copia);
  });
  test('un paso con una palabra de NO_CLASICO en su texto inglés se descarta con su motivo', () => {
    const entrada = guiaFixture();
    // El paso 4 pasa a hablar de Dalaran: se descarta por zona, no por hs.
    entrada.pasos[3].elementos.find((e) => e.t === 'skill').texto = { en: 'Level up in Dalaran', es: 'Sube en Dalaran' };
    const { guia, cuenta } = recortarProfesion(entrada, { profesion: 'herbalism', hasta: 300, niveles });
    assert.equal(guia.pasos.length, 3);
    assert.deepEqual(cuenta.descartados, { hs: 1, 'no-clasico': 1 });
  });
  test('un paso con skill de riding se descarta', () => {
    const entrada = guiaFixture();
    entrada.pasos[0].elementos.push({ t: 'skill', p: 'riding', n: 75, efecto: 'saltar_si_alcanzado', linea: 12 });
    const { guia, cuenta } = recortarProfesion(entrada, { profesion: 'herbalism', hasta: 300, niveles });
    assert.equal(guia.pasos.length, 3);
    assert.deepEqual(cuenta.descartados, { hs: 1, riding: 1 });
  });
  test('si la clave está en VERIFICADAS la guía no sale sin verificar', () => {
    const { guia } = recortar({ verificadas: { 'Profesiones\\01-300 Herbalism (H)': { fecha: '2026-11-09', quien: 'el jugador', como: 'juego' } } });
    assert.equal(guia.sinVerificar, false);
  });
  test('sin skill pasado de hasta no se recorta nada', () => {
    const entrada = guiaFixture();
    entrada.pasos.pop();
    const { guia, cuenta } = recortarProfesion(entrada, { profesion: 'herbalism', hasta: 300, niveles });
    assert.equal(guia.pasos.length, 4);
    assert.equal(cuenta.recortados, 0);
  });
  test('una guía sin pasos útiles da guia null', () => {
    const entrada = guiaFixture();
    entrada.pasos = [entrada.pasos[2]];
    const r = recortarProfesion(entrada, { profesion: 'herbalism', hasta: 300, niveles });
    assert.equal(r.guia, null);
    assert.ok(r.avisos.length > 0);
  });
  test('ninguna profesión está en VERIFICADAS (solo la cadena del saco, ronda 1 del lote de mejoras)', () => {
    assert.ok(Object.keys(VERIFICADAS).every((k) => !k.startsWith('Profesiones')), Object.keys(VERIFICADAS).join(', '));
  });
});

const hayOrigen = existsSync(join(ORIGEN, 'RXPGuides', 'Guides', 'Herbalism.lua'))
  && existsSync(join(ORIGEN, 'RXPGuides', 'DB', 'forever', 'db.lua'))
  // Lote H: la carpeta, no Data\Levels.lua (OpenMap 0.8.3 lo movió a Data\Forever\ y esto se saltaba en silencio).
  && existsSync(join(ORIGEN, 'OpenMap'));

describe('las tres profesiones reales', { skip: !hayOrigen && 'no está el origen' }, () => {
  const openmap = hayOrigen ? leerOpenMap(join(ORIGEN, 'OpenMap')) : null;
  const construccion = hayOrigen
    ? construirGuias(FUENTES_PROFESIONES, { mapas: cargarMapas(join(ORIGEN, 'RXPGuides', 'DB', 'forever', 'db.lua')), siguientesExtra: {} })
    : null;
  const resultados = hayOrigen ? [...construccion.guias.values()].map((g) => {
    const f = FUENTES_PROFESIONES.find((x) => x.en === g.fuente.archivo);
    return recortarProfesion(g, { profesion: f.profesion, hasta: f.hasta, niveles: openmap.niveles });
  }) : [];
  const guias = resultados.map((r) => r.guia);

  test('salen 6 guías, H y A de cada profesión', () => {
    assert.equal(guias.length, 6);
    assert.ok(guias.every(Boolean));
    assert.deepEqual(guias.map((g) => g.clave).sort(), [
      'Profesiones\\01-300 Herbalism (A)', 'Profesiones\\01-300 Herbalism (H)',
      'Profesiones\\01-300 Mining (A)', 'Profesiones\\01-300 Mining (H)',
      'Profesiones\\01-300 Skinning (A)', 'Profesiones\\01-300 Skinning (H)',
    ]);
  });
  test('todas son de tipo profesion, sin verificar y del grupo Profesiones', () => {
    for (const g of guias) {
      assert.equal(g.tipo, 'profesion');
      assert.equal(g.grupo, 'Profesiones');
      assert.equal(g.sinVerificar, true);
      assert.ok(g.pasos.length > 10, g.clave);
    }
  });
  test('ningún texto de elemento contiene una zona que no sea clásica', () => {
    for (const g of guias) {
      for (const p of g.pasos) {
        for (const e of p.elementos) {
          for (const c of ['texto', 'rotulo', 'tooltip']) {
            for (const idioma of ['en', 'es']) {
              const t = e[c]?.[idioma];
              if (typeof t !== 'string') continue;
              for (const palabra of NO_CLASICO) assert.ok(!t.includes(palabra), `${g.clave} paso ${p.n}: «${t}» contiene ${palabra}`);
            }
          }
        }
      }
    }
  });
  test('ningún skill pide más de 300 ni es de riding, y no hay hs', () => {
    for (const g of guias) {
      for (const p of g.pasos) {
        for (const e of p.elementos) {
          assert.notEqual(e.t, 'hs', g.clave);
          if (e.t === 'skill') {
            assert.ok(e.n <= 300, `${g.clave} paso ${p.n}: skill ${e.p} ${e.n}`);
            assert.notEqual(e.p, 'riding');
          }
        }
      }
    }
  });
  test('los pasos están numerados seguidos y los id no se repiten', () => {
    for (const g of guias) {
      assert.deepEqual(g.pasos.map((p) => p.n), g.pasos.map((_, i) => i + 1));
      assert.equal(new Set(g.pasos.map((p) => p.id)).size, g.pasos.length, g.clave);
    }
  });
  test('la cuenta cuadra: pasos = recortados + descartados + quedan', () => {
    for (const r of resultados) {
      const descartados = Object.values(r.cuenta.descartados).reduce((a, b) => a + b, 0);
      assert.equal(r.cuenta.pasos, r.cuenta.recortados + descartados + r.guia.pasos.length);
    }
  });
});
