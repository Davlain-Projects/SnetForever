// Pruebas de las correcciones propias comprobadas (Ruling F3-29): sumar una raza a la máscara, aplicarla en la
// vista (después de las correcciones de QuestieDB) y en las correcciones que se escriben al addon.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { vistaDePrueba, fuentesDePrueba } from './ayuda/vista.js';
import {
  PROPIAS, sumarRaza, aplicarPropiasACorrecciones, filasDePropias,
} from '../src/questie/propias.js';
import { crearVista } from '../src/questie/vista.js';
import { cargarFuentes } from '../src/cadenas/fuentes.js';
import { rutaQuestieToc } from '../src/config.js';

const TAUREN = 32;
const SKY_H = 2 ** 33;
const SKY_A = 2 ** 32;

describe('sumarRaza', () => {
  test('suma el bit de Skyborne de cada facción, sin duplicarlo y sin tocar una máscara vacía', () => {
    assert.equal(sumarRaza(TAUREN, 'Skyborne', 'Horde'), TAUREN + SKY_H);
    assert.equal(sumarRaza(8, 'Skyborne', 'Alliance'), 8 + SKY_A);
    assert.equal(sumarRaza(TAUREN + SKY_H, 'Skyborne', 'Horde'), TAUREN + SKY_H);
    assert.equal(sumarRaza(0, 'Skyborne', 'Horde'), 0);
    assert.equal(sumarRaza(undefined, 'Skyborne', 'Horde'), undefined);
    assert.throws(() => sumarRaza(TAUREN, 'Orc', 'Horde'));
  });
});

const PROPIA_30 = [{
  tipo: 'quest', id: 30, campo: 'requiredRaces', anadirRazas: ['Skyborne'], faccion: 'Horde', fuente: 'juego', nota: 'x', fecha: '2026-11-09',
}];

describe('la vista aplica las propias después de las correcciones de QuestieDB', () => {
  const base = { 30: { name: 'Prueba', requiredRaces: TAUREN }, 31: { name: 'Otra', requiredRaces: TAUREN } };
  // vistaDePrueba no pasa `propias`; se construye la vista con las mismas fuentes de prueba.
  const construir = (faccion, correcciones, misiones = base) => crearVista(
    { ...fuentesDePrueba({ misiones, correcciones }), propias: PROPIA_30 }, { faccion },
  );

  test('Skyborne entra en la 30 de la Horda, el orco no y la 31 no cambia', () => {
    const v = construir('Horde');
    assert.equal(v.aplicaARaza(v.mision(30), 'Skyborne'), true);
    assert.equal(v.aplicaARaza(v.mision(30), 'Tauren'), true);
    assert.equal(v.aplicaARaza(v.mision(30), 'Orc'), false);
    assert.equal(v.aplicaARaza(v.mision(31), 'Skyborne'), false);
  });

  test('en la facción contraria no se aplica', () => {
    assert.equal(construir('Alliance').mision(30).requiredRaces, TAUREN);
  });

  test('se suma sobre la máscara ya corregida por QuestieDB', () => {
    const v = construir('Horde', { Horde: { quest: { 30: { requiredRaces: 2 } } } });
    assert.equal(v.mision(30).requiredRaces, 2 + SKY_H);
  });

  test('una misión sin máscara (para todas las razas) no se toca', () => {
    const v = construir('Horde', undefined, { 30: { name: 'Libre' } });
    assert.equal(v.mision(30).requiredRaces, undefined);
  });

  test('por defecto la vista aplica PROPIAS (vistaDePrueba)', () => {
    const v = vistaDePrueba({ misiones: { 27: { name: 'Real', requiredRaces: TAUREN } }, faccion: 'Horde' });
    assert.equal(v.mision(27).requiredRaces, TAUREN + SKY_H);
  });
});

describe('aplicarPropiasACorrecciones (lo que se escribe al addon)', () => {
  const vacias = () => ({
    Horde: { quest: {}, npc: {}, object: {}, item: {} }, Alliance: { quest: {}, npc: {}, object: {}, item: {} },
  });
  const entidades = { quest: new Map([[30, { requiredRaces: TAUREN }]]) };

  test('crea la corrección con la máscara de la base más Skyborne, solo en la facción de la entrada', () => {
    const entrada = vacias();
    const { correcciones } = aplicarPropiasACorrecciones(entrada, entidades, PROPIA_30);
    assert.deepEqual(correcciones.Horde.quest[30], { requiredRaces: TAUREN + SKY_H });
    assert.deepEqual(correcciones.Alliance.quest, {});
    assert.deepEqual(entrada.Horde.quest, {}, 'no toca la entrada');
  });

  test('parte de la corrección de QuestieDB si la hay y conserva sus otros campos', () => {
    const entrada = vacias();
    entrada.Horde.quest[30] = { requiredRaces: 2, questLevel: 5 };
    const { correcciones } = aplicarPropiasACorrecciones(entrada, entidades, PROPIA_30);
    assert.deepEqual(correcciones.Horde.quest[30], { requiredRaces: 2 + SKY_H, questLevel: 5 });
  });

  test('una máscara que depende de la clase se deja y se avisa', () => {
    const entrada = vacias();
    entrada.Horde.quest[30] = { requiredRaces: { porClase: { DRUID: 2 } } };
    const r = aplicarPropiasACorrecciones(entrada, entidades, PROPIA_30);
    assert.deepEqual(r.correcciones.Horde.quest[30], { requiredRaces: { porClase: { DRUID: 2 } } });
    assert.equal(r.avisos.length, 1);
  });
});

describe('PROPIAS', () => {
  const de = (faccion) => PROPIAS.filter((p) => p.faccion === faccion).map((p) => p.id).sort((a, b) => a - b);
  // Lote H: QuestieDB 1.0.14 quitó al Skyborne de la Horda de la 94006 (oso) y de la 98404 (felina), pero el druida de prueba
  // las tiene entregadas (lista `complete` de Questie y RXPCTrackingData de RXP, leídas el 11-nov-2026): «juego».
  test('la lista pedida: «juego» solo en lo visto (27, 28, 30, 6126, 6127, 94006, 98404); el resto, «deducido»', () => {
    assert.deepEqual(de('Horde'), [27, 28, 30, 31, 6126, 6127, 6128, 6129, 6130, 94006, 98404]);
    assert.deepEqual(de('Alliance'), [26, 29, 5061, 6121, 6122, 6123, 6124, 6125]);
    for (const p of PROPIAS) {
      assert.deepEqual(p.anadirRazas, ['Skyborne']);
      assert.equal(p.campo, 'requiredRaces');
      const vista = p.faccion === 'Horde' && [27, 28, 30, 6126, 6127, 94006, 98404].includes(p.id);
      assert.equal(p.fuente, vista ? 'juego' : 'deducido', `fuente de ${p.id}`);
      assert.ok(p.nota && p.fecha, `falta nota o fecha en ${p.id}`);
    }
  });
});

describe('sobre la base real', { skip: !existsSync(rutaQuestieToc()) }, () => {
  let fuentes;
  before(() => { fuentes = cargarFuentes(); });

  test('el druida Skyborne de la Horda ve la 30; el orco no', () => {
    const v = crearVista(fuentes, { faccion: 'Horde', clase: 'DRUID' });
    assert.equal(v.aplicaARaza(v.mision(30), 'Skyborne'), true);
    assert.equal(v.aplicaARaza(v.mision(30), 'Tauren'), true);
    assert.equal(v.aplicaARaza(v.mision(30), 'Orc'), false);
  });

  test('lote H: el druida Skyborne de la Horda ve la 94006 (oso) y la 98404 (felina); el de la Alianza también', () => {
    for (const faccion of ['Horde', 'Alliance']) {
      const v = crearVista(fuentes, { faccion, clase: 'DRUID' });
      for (const q of [94006, 98404]) assert.equal(v.aplicaARaza(v.mision(q), 'Skyborne'), true, `${faccion} ${q}`);
    }
  });

  test('sin propias la 30 es solo de tauren (la corrección es nuestra)', () => {
    const v = crearVista({ ...fuentes, propias: [] }, { faccion: 'Horde', clase: 'DRUID' });
    assert.equal(v.aplicaARaza(v.mision(30), 'Skyborne'), false);
  });

  test('las filas del informe dicen qué cambia cada entrada', () => {
    const filas = filasDePropias((faccion) => crearVista({ ...fuentes, propias: [] }, { faccion }));
    assert.equal(filas.length, PROPIAS.length);
    const f30 = filas.find((f) => f.id === 30 && f.faccion === 'Horde');
    assert.equal(f30.estado, 'aplicada');
    assert.equal(f30.despues, f30.antes + SKY_H);
  });
});
