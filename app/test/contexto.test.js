// Datos del turno: mezcla del mensaje del addon con la base; la IA solo ve ids P#, nunca coordenadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase } from '../src/base/base.mjs';
import { prepararTurno, tiposDelMensaje, hablaDeTalentos, MAX_DATOS } from '../src/contexto.mjs';
import { eventoDeMision } from '../src/rutaZona.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const carpeta = mkdtempSync(join(tmpdir(), 'snf-contexto-'));
copyFileSync(join(FIXTURES, 'misiones-app.lua'), join(carpeta, 'misiones-app.lua'));
// Extra: una misión (793) que se recoge dentro de una mazmorra (el PNJ 644 no tiene spawns y es de enMazmorra).
writeFileSync(join(carpeta, 'extra.lua'), 'local Q = SNF_MISIONES.quest\nQ[793]={name="Deadmines Entry",startedBy={{644}},finishedBy={{10176}},requiredLevel=10,questLevel=12,'
  + 'requiredRaces=0,requiredClasses=0,objectivesText={},objectives={},sourceItemId=0,zoneOrSort=1581,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0}\n'
  // Dos de fiesta (QuestSort de Questie): 8862 del Festival Lunar (-366) y 7043 de una fiesta de temporada (-22).
  + 'Q[8862]={name="Elune\'s Candle",startedBy={{10176}},finishedBy={{10176}},requiredLevel=1,questLevel=1,zoneOrSort=-366}\n'
  + 'Q[7043]={name="You\'re a Mean One...",startedBy={{10176}},finishedBy={{10176}},requiredLevel=1,questLevel=1,zoneOrSort=-22}\n'
  // 14-nov: objetos de comercio (class 7) de hierbas (subClass 9) y de metal (7), y un arma (class 2) para ver que no se cuela.
  + 'local I = SNF_MISIONES.item\nI[2447]={name="Peacebloom",class=7,subClass=9}\nI[765]={name="Silverleaf",class=7,subClass=9}\n'
  + 'I[2770]={name="Copper Ore",class=7,subClass=7}\nI[25]={name="Worn Shortsword",class=2,subClass=7}\n'
  + 'local EI = SNF_MISIONES.es.item\nEI[2447]={name="Flor de paz"}\n');
writeFileSync(join(carpeta, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', 'extra.lua', ''].join('\n'));
const base = cargarBase(carpeta);

const PJ = 'Tal Cual-Reino Prueba';

function mensaje({ texto = 'hola', ctx = {}, extra = {} } = {}) {
  return {
    v: 1, id: 'a3f1-7', pj: PJ, idioma: 'es', modelo: 'haiku', texto,
    ctx: {
      pj: { nivel: 3, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, xp: 100, xpMax: 900, dinero: 1234 },
      lugar: { mapa: 1411, zona: 'Durotar', instancia: false },
      registro: [{ q: 4641, c: 0, o: [[2, 8]] }, { q: 792, c: 0, o: [[0, 5]] }],
      prof: [{ id: 197, r: 10, m: 75 }],
      guias: [{ clave: 'Horde\\1-12', titulo: 'Durotar 1-12' }],
      cadenas: [],
      mazmorras: [{ area: 1581, nombre: 'The Deadmines', misiones: [791] }],
      ...ctx,
    },
    ...extra,
  };
}

const INV = {
  libres: 10, huecos: 20, dinero: 1234,
  bolsas: [
    { id: 2589, n: 12, ca: 1, pv: 13, l: 0, b: [[0, 1]] },
    { id: 118, n: 2, ca: 1, l: 0, b: [[0, 2]] },
    { id: 9999, n: 1, ca: 0, pv: 1, l: 0, b: [[0, 3]] },
    { id: 5000, n: 1, ca: 1, l: 0, b: [[0, 4]] },
  ],
  equipo: [{ s: 16, id: 2589, nv: 1, ca: 1, st: { ITEM_MOD_STAMINA_SHORT: 2 }, tt: ['Algo'] }],
  banco: { fecha: 1, objetos: [{ id: 118, n: 5, l: 0, b: [[-1, 1]] }] },
};

const sinCoordenadas = (puntos) => puntos.every((p) => !('x' in p) && !('y' in p) && !('mapa' in p));

test('personaje y lugar sin el nombre; el registro lleva nombre, objetivos y lista para entregar', () => {
  const t = prepararTurno(base, mensaje({ ctx: { registro: [{ q: 4641, c: 0, o: [[2, 8]] }, { q: 792, c: 1, o: [] }] } }));
  assert.equal(t.datos.registro[0].nombre, 'Tu lugar en el mundo');
  assert.equal(t.datos.registro[0].q, 4641);
  assert.deepEqual(t.datos.registro[0].objetivos, [{ hecho: 2, pedido: 8 }]);
  assert.equal(t.datos.registro[0].listaParaEntregar, false);
  assert.equal(t.datos.registro[1].listaParaEntregar, true);
  assert.equal(t.datos.personaje.nivel, 3);
  assert.equal(t.datos.personaje.clase, 'WARRIOR');
  assert.equal(t.datos.lugar.zona, 'Durotar');
  assert.ok(!JSON.stringify(t.datos).includes(PJ));
  assert.ok(!JSON.stringify(t.datos).includes('Tal Cual'));
});

test('misión del registro que la base no tiene o que la máscara de raza descarta: cuenta igual (manda el juego)', () => {
  // 4641 tiene requiredRaces de otra raza en el fixture; un personaje humano la lleva en el registro y aparece.
  const t = prepararTurno(base, mensaje({
    ctx: { pj: { nivel: 3, clase: 'MAGE', raza: 'Human', faccion: 'Alliance' }, registro: [{ q: 4641, c: 0, o: [] }, { q: 99999, c: 0, o: [] }] },
  }));
  assert.deepEqual(t.datos.registro.map((r) => r.q), [4641, 99999]);
  assert.equal(t.datos.registro[0].nombre, 'Tu lugar en el mundo');
  assert.equal(t.datos.registro[1].nombre, '#99999');
});

test('registroIncompleto pasa tal cual y solo si es verdadero', () => {
  assert.equal(prepararTurno(base, mensaje({ ctx: { registroIncompleto: true } })).datos.registroIncompleto, true);
  assert.ok(!('registroIncompleto' in prepararTurno(base, mensaje()).datos));
});

test('inventario: usos por misión, material, consumible, gris y empieza', () => {
  const t = prepararTurno(base, mensaje({ ctx: { inv: INV } }));
  const por = (id) => t.datos.inventario.objetos.find((o) => o.id === id);
  assert.ok(por(2589).usos.includes('mision:792'));
  assert.ok(por(2589).usos.includes('material:Sastrería'));
  assert.equal(por(2589).nombre, 'Linen Cloth');
  assert.ok(por(118).usos.includes('consumible:pocion'));
  assert.ok(por(9999).usos.includes('gris'));
  assert.equal(por(9999).nombre, '#9999');
  assert.ok(por(5000).usos.includes('empieza:790'));
  assert.ok(!('b' in por(2589)));
  assert.deepEqual(t.datos.inventario.equipo[0].nombre, 'Linen Cloth');
  assert.deepEqual([...t.inventarioIds].sort((a, b) => a - b), [118, 2589, 5000, 9999]);
  assert.equal(t.datos.inventario.libres, 10);
});

test('inventario: la forma {libres, huecos, objetos} dentro de bolsas también vale', () => {
  const inv = { dinero: 5, equipo: [], bolsas: { libres: 3, huecos: 4, objetos: [{ id: 118, n: 1, l: 0, b: [] }] } };
  const t = prepararTurno(base, mensaje({ ctx: { inv } }));
  assert.deepEqual([...t.inventarioIds], [118]);
  assert.equal(t.datos.inventario.libres, 3);
  assert.equal(t.datos.inventario.objetos[0].nombre, 'Minor Healing Potion');
});

// F2b (detalles que llegaron con la F4): los huecos de la bolsa de componentes solo admiten componentes. El addon los
// manda aparte (huecosComponentes y libresComponentes) y no en huecos ni en libres: la IA recibe las dos parejas.
test('inventario: los huecos y libres de la bolsa de componentes llegan aparte a la IA', () => {
  const inv = { ...INV, libres: 14, huecos: 16, huecosComponentes: 12, libresComponentes: 11 };
  const t = prepararTurno(base, mensaje({ ctx: { inv } }));
  const i = t.datos.inventario;
  assert.deepEqual([i.huecos, i.libres, i.huecosComponentes, i.libresComponentes], [16, 14, 12, 11]);
  // Sin bolsa de componentes (o con un valor que no es un número) no salen.
  const sin = prepararTurno(base, mensaje({ ctx: { inv: { ...INV, huecosComponentes: 'x' } } })).datos.inventario;
  assert.ok(!('huecosComponentes' in sin) && !('libresComponentes' in sin), JSON.stringify(Object.keys(sin)));
});

test('usos mision: también las misiones de la ruta (ctx.guia)', () => {
  const t = prepararTurno(base, mensaje({
    ctx: { registro: [], guia: { clave: 'Horde\\1-12', titulo: 'Durotar 1-12', n: 3, paso: 'Habla', misiones: [792] }, inv: INV },
  }));
  assert.ok(t.datos.inventario.objetos.find((o) => o.id === 2589).usos.includes('mision:792'));
});

test('sin inv: no_permitido y sin ids', () => {
  const t = prepararTurno(base, mensaje());
  assert.equal(t.datos.inventario, 'no_permitido');
  assert.equal(t.inventarioIds.size, 0);
});

test('ruta: las misiones de la guía con nombre y dónde se recoge y se entrega', () => {
  const t = prepararTurno(base, mensaje({ ctx: { guia: { clave: 'Horde\\1-12', titulo: 'Durotar 1-12', n: 3, paso: 'Habla', misiones: [4641, 788] } } }));
  assert.equal(t.datos.ruta.clave, 'Horde\\1-12');
  assert.equal(t.datos.ruta.titulo, 'Durotar 1-12');
  assert.equal(t.datos.ruta.misiones[0].nombre, 'Tu lugar en el mundo');
  assert.equal(t.datos.ruta.misiones[0].recoger.donde, 'Durotar');
  assert.equal(t.datos.ruta.misiones[0].entregar.donde, 'Durotar');
  assert.ok(!JSON.stringify(t.datos.ruta).includes('"x"'));
  assert.equal(prepararTurno(base, mensaje()).datos.ruta, null);
});

test('mazmorras, cadenas y profesiones con nombres', () => {
  const t = prepararTurno(base, mensaje({
    ctx: { cadenas: [{ id: 'c1', texto: 'Cadena', guia: 'Horde\\1-12', misiones: [788] }] },
  }));
  assert.deepEqual(t.datos.mazmorras, [{ area: 1581, nombre: 'The Deadmines', misiones: [{ q: 791, nombre: 'Defias in the Deadmines' }] }]);
  assert.deepEqual(t.datos.cadenas, [{ id: 'c1', texto: 'Cadena', guia: 'Horde\\1-12', misiones: [{ q: 788, nombre: 'Dientes afilados' }] }]);
  assert.deepEqual(t.datos.profesiones, [{ id: 197, nombre: 'Sastrería', rango: 10, maximo: 75 }]);
});

test('guias: las de ctx.guias, en datos y en el Map', () => {
  const t = prepararTurno(base, mensaje());
  assert.deepEqual(t.datos.guias, [{ clave: 'Horde\\1-12', titulo: 'Durotar 1-12' }]);
  assert.equal(t.guias.get('Horde\\1-12'), 'Durotar 1-12');
});

test('mención de una misión: detalle y puntos P# con coordenadas solo en el Map', () => {
  const t = prepararTurno(base, mensaje({ texto: '¿Dónde entrego Tu lugar en el mundo?' }));
  assert.deepEqual(t.datos.mencionadas.map((m) => m.q), [4641]);
  assert.equal(t.datos.mencionadas[0].nombre, 'Tu lugar en el mundo');
  assert.ok(t.datos.mencionadas[0].puntos.includes('P1'));
  assert.ok(t.puntos.has('P1'));
  const p1 = t.puntos.get('P1');
  assert.equal(typeof p1.mapa, 'number');
  assert.equal(typeof p1.x, 'number');
  assert.equal(typeof p1.y, 'number');
  assert.ok(t.datos.puntos.length >= 2);
  assert.ok(sinCoordenadas(t.datos.puntos));
  assert.equal(t.datos.puntos[0].id, 'P1');
  assert.equal(t.datos.puntos[0].q, 4641);
  assert.equal(t.datos.puntos[0].mision, 'Tu lugar en el mundo');
  assert.ok(['recoger', 'objetivo', 'entregar', 'lugar'].includes(t.datos.puntos[0].papel));
  assert.equal(t.datos.puntos.length, t.puntos.size);
  assert.ok(t.datos.puntos.some((p) => p.papel === 'entregar'));
});

test('refs.q y el texto se juntan sin repetir', () => {
  const t = prepararTurno(base, mensaje({ texto: 'dime de [Dientes afilados] y Tu lugar en el mundo', extra: { refs: { q: [788, 4641] } } }));
  assert.deepEqual(t.datos.mencionadas.map((m) => m.q), [788, 4641]);
});

test('el punto de una mazmorra conserva su papel real y lleva mazmorra: true (en datos y en el Map)', () => {
  const t = prepararTurno(base, mensaje({ texto: 'Deadmines Entry' }));
  const p = t.datos.puntos.find((q) => q.q === 793);
  assert.ok(p, 'hay punto para 793');
  assert.equal(p.papel, 'recoger');
  assert.equal(p.mazmorra, true);
  assert.match(p.donde, /^Dentro de /);
  assert.equal(t.puntos.get(p.id).papel, 'recoger');
  assert.equal(t.puntos.get(p.id).mazmorra, true);
  const fuera = t.datos.puntos.find((q) => q.q === 793 && q.papel === 'entregar');
  assert.ok(fuera && !('mazmorra' in fuera));
});

test('«ponme una ruta» sin menciones: puntos del registro en el mapa del jugador (≤ 40)', () => {
  const t = prepararTurno(base, mensaje({ texto: 'ponme una ruta' }));
  assert.deepEqual(t.datos.mencionadas, []);
  assert.ok(t.datos.puntos.length > 0 && t.datos.puntos.length <= 40);
  assert.ok(t.datos.puntos.every((p) => [4641, 792].includes(p.q)));
  assert.ok([...t.puntos.values()].every((p) => p.mapa === 1411));
  assert.ok(sinCoordenadas(t.datos.puntos));
});

// Lote C (revisión 52, Minor 10): sin menciones, los puntos de las misiones del registro en el mapa del jugador van
// siempre (con el tope de 40), use la pregunta la palabra que use; con menciones, también si la pregunta habla de ir a
// algún sitio («cómo llego», «llévame», «guíame», «camino», «flecha», «how do I get», «take me»…).
test('lote C (52-M10): sin menciones, los puntos del registro en el mapa del jugador van siempre, aunque no se pida ruta', () => {
  for (const texto of ['hola, ¿qué tal?', '¿Cómo llego?', 'llévame', 'guíame', '¿qué camino sigo?', 'pon la flecha',
    'How do I get there?', 'take me there']) {
    const t = prepararTurno(base, mensaje({ texto }));
    assert.deepEqual(t.datos.mencionadas, [], texto);
    assert.ok(t.datos.puntos.length > 0 && t.datos.puntos.length <= 40, texto);
    assert.ok(t.datos.puntos.every((p) => [4641, 792].includes(p.q)), texto);
    assert.ok([...t.puntos.values()].every((p) => p.mapa === 1411), texto);
  }
});

// Ronda 1 (duda 5): «siempre» también con menciones. Los puntos de lo mencionado van primero y el tope de 40 protege.
test('lote C (52-M10), ronda 1: con una mención, los puntos del registro también van, detrás de los de la mención', () => {
  const mencion = (texto) => prepararTurno(base, mensaje({ texto, ctx: { registro: [{ q: 792, c: 0, o: [[0, 5]] }] } }));
  for (const texto of ['Háblame de Tu lugar en el mundo', '¿Cómo llego a Tu lugar en el mundo?', 'Llévame a Tu lugar en el mundo',
    'Take me to Tu lugar en el mundo']) {
    const t = mencion(texto);
    assert.ok(t.datos.puntos.some((p) => p.q === 4641), texto);
    assert.ok(t.datos.puntos.some((p) => p.q === 792), texto);
    assert.equal(t.datos.puntos[0].q, 4641, 'lo mencionado va primero');
    assert.ok(t.datos.puntos.length <= 40, texto);
  }
});

test('las misiones del registro en otro mapa no entran en los puntos de la ruta', () => {
  const t = prepararTurno(base, mensaje({ texto: 'pin', ctx: { lugar: { mapa: 1412, instancia: false } } }));
  assert.deepEqual(t.datos.puntos, []);
});

test('recorte del addon se copia a datos', () => {
  assert.deepEqual(prepararTurno(base, mensaje({ ctx: { recorte: ['inv.banco'] } })).datos.recorte, ['inv.banco']);
  assert.deepEqual(prepararTurno(base, mensaje()).datos.recorte, []);
});

test('inventario enorme: datos ≤ 30.000 caracteres y los ids enviados son los que quedan', () => {
  const bolsas = [];
  for (let i = 0; i < 300; i++) bolsas.push({ id: 100000 + i, n: 1, ca: 1, pv: 5, nv: 10, h: 'INVTYPE_CHEST', l: 0, b: [[0, 1]] });
  const banco = { fecha: 1, objetos: Array.from({ length: 300 }, (_, i) => ({ id: 200000 + i, n: 1, l: 0, b: [] })) };
  const equipo = Array.from({ length: 19 }, (_, i) => ({ s: i + 1, id: 300000 + i, st: { ITEM_MOD_STAMINA_SHORT: 5 }, tt: ['x'.repeat(60)] }));
  const t = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 300, dinero: 1, bolsas, equipo, banco } } }), null);
  assert.ok(JSON.stringify(t.datos).length <= 30000);
  assert.ok(!('banco' in t.datos.inventario));
  assert.deepEqual(new Set(t.datos.inventario.objetos.map((o) => o.id)), t.inventarioIds);
});

test('recortes en orden: primero banco, luego detalle del equipo, mazmorras y objetivos', () => {
  const grande = (n) => Array.from({ length: n }, (_, i) => ({ id: 300000 + i, n: 1, l: 0, b: [] }));
  const t = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 1, dinero: 1, bolsas: [], equipo: [], banco: { fecha: 1, objetos: grande(1500) } } } }), null);
  assert.ok(!('banco' in t.datos.inventario));
  assert.ok(t.datos.mazmorras.length > 0, 'las mazmorras siguen: bastaba con quitar el banco');
  assert.ok(t.datos.registro[0].objetivos.length > 0);
});

test('si ni así cabe, se quitan objetos del final de las bolsas y se apunta en recorteApp', () => {
  const bolsas = Array.from({ length: 1200 }, (_, i) => ({ id: 400000 + i, n: 1, ca: 1, l: 0, b: [] }));
  const t = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 1200, dinero: 1, bolsas, equipo: [] } } }));
  assert.ok(JSON.stringify(t.datos).length <= 30000);
  assert.ok(t.datos.recorteApp.includes('inventario.objetos'));
  assert.ok(t.inventarioIds.size > 0 && t.inventarioIds.size < 1200);
  assert.equal(t.inventarioIds.size, t.datos.inventario.objetos.length);
});

test('lista blanca: un campo extra (nombre) en ctx.pj, ctx.lugar y recorte no pasa a datos', () => {
  const t = prepararTurno(base, mensaje({
    ctx: {
      pj: { nivel: 3, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', sexo: 2, nombre: 'Secreto', guild: { n: 1 } },
      lugar: { mapa: 1411, zona: 'Durotar', instancia: false, nombre: 'Secreto', otro: [1] },
      recorte: ['inv.banco', { nombre: 'Secreto' }, 'x'.repeat(200)],
    },
  }));
  assert.ok(!JSON.stringify(t.datos).includes('Secreto'));
  assert.deepEqual(Object.keys(t.datos.personaje).sort(), ['clase', 'faccion', 'nivel', 'raza', 'sexo']);
  assert.deepEqual(Object.keys(t.datos.lugar).sort(), ['instancia', 'mapa', 'zona']);
  assert.deepEqual(t.datos.recorte, ['inv.banco']);
});

test('manda el juego: 4641 con una raza que la base no permite sigue dando textos y puntos', () => {
  const t = prepararTurno(base, mensaje({
    texto: '¿Dónde entrego Tu lugar en el mundo?',
    ctx: { pj: { nivel: 3, clase: 'MAGE', raza: 'Human', faccion: 'Alliance' }, registro: [{ q: 4641, c: 1, o: [] }] },
  }));
  assert.equal(t.datos.registro[0].nombre, 'Tu lugar en el mundo');
  assert.deepEqual(t.datos.registro[0].textos, ['Habla con Gornek.']);
  assert.deepEqual(t.datos.mencionadas[0].textos, ['Habla con Gornek.']);
  assert.ok(t.datos.puntos.some((p) => p.q === 4641 && p.papel === 'recoger'));
  assert.ok(t.datos.puntos.some((p) => p.q === 4641 && p.papel === 'entregar'));
});

test('al quitar objetos de las bolsas se empieza por los grises y los que no tienen usos', () => {
  const bolsas = [
    { id: 2589, n: 1, ca: 1, l: 0, b: [] }, // con usos (material)
    ...Array.from({ length: 700 }, (_, i) => ({ id: 500000 + i, n: 1, ca: i % 2 === 0 ? 0 : 1, l: 0, b: [] })),
  ];
  const t = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 701, dinero: 1, bolsas, equipo: [] } } }));
  assert.ok(t.datos.recorteApp.includes('inventario.objetos'));
  assert.ok(t.inventarioIds.has(2589), 'el objeto con usos se conserva');
});

test('último paso: registro y menciones enormes siguen cabiendo en 30.000', () => {
  const registro = Array.from({ length: 3000 }, (_, i) => ({ q: 4641 + (i % 2), c: 0, o: [[1, 2]] }));
  const refs = { q: Array.from({ length: 3000 }, () => 4641) };
  const gr = Array.from({ length: 3000 }, (_, i) => ({ clave: 'g' + i, titulo: 'T'.repeat(50) }));
  const t = prepararTurno(base, mensaje({
    texto: 'ruta Tu lugar en el mundo',
    ctx: { registro, guias: gr, cadenas: Array.from({ length: 500 }, (_, i) => ({ id: 'c' + i, texto: 'x'.repeat(200), misiones: [788] })) },
    extra: { refs },
  }));
  assert.ok(JSON.stringify(t.datos).length <= 30000);
  assert.ok(t.datos.recorteApp.length > 0);
  for (const id of t.puntos.keys()) assert.ok(t.datos.puntos.some((p) => p.id === id), 'el Map solo tiene lo que vio la IA');
});

const SURROGATE_SUELTO = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

test('los cortes a 200 y a 100 caracteres no parten un par surrogate', () => {
  const emoji = '😀';
  const t = prepararTurno(base, mensaje({
    ctx: {
      guia: { clave: 'a'.repeat(199) + emoji + 'zzz', titulo: 'b'.repeat(199) + emoji + 'zzz', paso: 'c'.repeat(199) + emoji + 'zzz', misiones: [] },
      lugar: { mapa: 1411, zona: 'd'.repeat(99) + emoji + 'zzz', instancia: false },
    },
  }));
  for (const v of [t.datos.ruta.clave, t.datos.ruta.titulo, t.datos.ruta.paso, t.datos.lugar.zona]) {
    assert.ok(!SURROGATE_SUELTO.test(v), 'sin surrogate suelto');
    assert.ok(v.endsWith(emoji), 'el emoji entero se conserva');
  }
  assert.ok(!SURROGATE_SUELTO.test(JSON.stringify(t.datos)));
});

test('ruta.n solo se copia si es un número finito', () => {
  const con = (n) => prepararTurno(base, mensaje({ ctx: { guia: { clave: 'g', titulo: 't', n, misiones: [] } } })).datos.ruta;
  assert.equal(con(3).n, 3);
  assert.ok(!('n' in con('3')));
  assert.ok(!('n' in con(Infinity)));
  assert.ok(!('n' in con({ x: 1 })));
  assert.ok(!('n' in con(null)));
});

test('recorte de objetos: uno con usos al final de la lista se conserva frente a los grises y los sin usos', () => {
  const bolsas = [
    ...Array.from({ length: 700 }, (_, i) => ({ id: 600000 + i, n: 1, ca: i % 2 === 0 ? 0 : 1, l: 0, b: [] })),
    { id: 2589, n: 1, ca: 1, l: 0, b: [] }, // material, al final de la lista
  ];
  const t = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 701, dinero: 1, bolsas, equipo: [] } } }));
  assert.ok(t.datos.recorteApp.includes('inventario.objetos'));
  assert.ok(t.inventarioIds.has(2589), 'el objeto con usos del final se conserva');
  const quedan = t.datos.inventario.objetos;
  assert.ok(quedan.length < 701);
  // Mientras queden prescindibles, no se toca ningún objeto con usos.
  assert.ok(quedan.some((o) => o.usos.length === 0 || o.usos.includes('gris')));
});

// T3: la guía que el jugador dejó a medias y a la que puede volver («Volver a» del addon).
test('ruta.volverA pasa con su titulo (cadena) y su n (número finito); sin él, o sin titulo, no va', () => {
  const con = (volverA) => prepararTurno(base, mensaje({ ctx: { guia: { clave: 'g', titulo: 't', misiones: [], volverA } } })).datos.ruta;
  assert.deepEqual(con({ titulo: 'Guía de antes', n: 4 }).volverA, { titulo: 'Guía de antes', n: 4 });
  assert.deepEqual(con({ titulo: 'Acabada' }).volverA, { titulo: 'Acabada' });
  assert.deepEqual(con({ titulo: 'Rara', n: '4' }).volverA, { titulo: 'Rara' });
  assert.ok(!('volverA' in con(undefined)));
  assert.ok(!('volverA' in con({ n: 4 })));
  assert.ok(!('volverA' in con('Guía')));
  assert.ok(con({ titulo: 'x'.repeat(500), n: 1 }).volverA.titulo.length <= 200);
});

test('ruta.clave, ruta.titulo y ruta.paso solo pasan si son cadenas', () => {
  const t = prepararTurno(base, mensaje({ ctx: { guia: { clave: 5, titulo: { x: 1 }, paso: ['a'], misiones: [] } } }));
  assert.ok(!('clave' in t.datos.ruta) && !('titulo' in t.datos.ruta) && !('paso' in t.datos.ruta));
  const u = prepararTurno(base, mensaje({ ctx: { guia: { clave: 'g', titulo: 't', paso: 'p', misiones: [] } } }));
  assert.deepEqual([u.datos.ruta.clave, u.datos.ruta.titulo, u.datos.ruta.paso], ['g', 't', 'p']);
});

test('lote B (B2): un ítem sin class (los datos ya no escriben los 0) es de clase 0, consumible', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snf-contexto-b2-'));
  copyFileSync(join(FIXTURES, 'misiones-app.lua'), join(dir, 'misiones-app.lua'));
  writeFileSync(join(dir, 'sin-ceros.lua'), 'local O = SNF_MISIONES.item\nO[118]={name="Minor Healing Potion",subClass=1}\n');
  writeFileSync(join(dir, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', 'sin-ceros.lua', ''].join('\n'));
  const sinCeros = cargarBase(dir);
  assert.equal(sinCeros.item(118).class, undefined);
  const t = prepararTurno(sinCeros, mensaje({ ctx: { inv: INV } }));
  const pocion = t.datos.inventario.objetos.find((o) => o.id === 118);
  assert.ok(pocion.usos.includes('consumible:pocion'), JSON.stringify(pocion.usos));
});

test('lote B (B2): una misión mencionada sin questLevel ni requiredLevel (eran 0) da nivel 0 y nivelMinimo 0, como antes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snf-contexto-b2-'));
  copyFileSync(join(FIXTURES, 'misiones-app.lua'), join(dir, 'misiones-app.lua'));
  writeFileSync(join(dir, 'sin-ceros.lua'), 'local Q = SNF_MISIONES.quest\nQ[794]={name="Sin niveles",startedBy={{3143}},finishedBy={{3143}}}\n');
  writeFileSync(join(dir, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', 'sin-ceros.lua', ''].join('\n'));
  const t = prepararTurno(cargarBase(dir), mensaje({ extra: { refs: { q: [794] } } }));
  const m = t.datos.misiones?.find((x) => x.q === 794) ?? t.datos.mencionadas?.find((x) => x.q === 794);
  assert.ok(m, JSON.stringify(Object.keys(t.datos)));
  assert.equal(m.nivel, 0);
  assert.equal(m.nivelMinimo, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// Misiones de fiesta (QuestSort de Questie): la IA las ve marcadas con su evento
// ---------------------------------------------------------------------------------------------------------------

test('fiestas: eventoDeMision da la fiesta por su QuestSort (la regla de las rutas de zona) y null si no es de fiesta', () => {
  assert.equal(eventoDeMision({ zoneOrSort: -366 }), 'Lunar Festival');
  assert.equal(eventoDeMision({ zoneOrSort: -376 }), 'Love is in the Air');
  assert.equal(eventoDeMision({ zoneOrSort: -369 }), 'Midsummer');
  assert.equal(eventoDeMision({ zoneOrSort: -21 }), "Hallow's End");
  assert.equal(eventoDeMision({ zoneOrSort: -378 }), "Children's Week");
  assert.equal(eventoDeMision({ zoneOrSort: -22 }), 'Seasonal');
  for (const m of [{ zoneOrSort: 14 }, { zoneOrSort: -25 }, { zoneOrSort: -284 }, {}, null, undefined]) {
    assert.equal(eventoDeMision(m), null, JSON.stringify(m));
  }
});

test('fiestas: cada misión de evento lleva `evento` en el registro, la ruta, las cadenas, las mazmorras y las mencionadas', () => {
  const t = prepararTurno(base, mensaje({
    ctx: {
      registro: [{ q: 8862, c: 0, o: [] }, { q: 4641, c: 0, o: [] }],
      guia: { clave: 'Horde\\1-12', titulo: 'Durotar 1-12', misiones: [8862, 4641] },
      cadenas: [{ id: 'c1', texto: 'Cadena', misiones: [8862, 788] }],
      mazmorras: [{ area: 1581, nombre: 'The Deadmines', misiones: [7043, 791] }],
    },
    extra: { refs: { q: [8862, 7043, 788] } },
  }));
  const d = t.datos;
  assert.deepEqual(d.registro.map((r) => [r.q, r.evento]), [[8862, 'Lunar Festival'], [4641, undefined]]);
  assert.deepEqual(d.ruta.misiones.map((m) => [m.q, m.evento]), [[8862, 'Lunar Festival'], [4641, undefined]]);
  assert.deepEqual(d.cadenas[0].misiones,
    [{ q: 8862, nombre: "Elune's Candle", evento: 'Lunar Festival' }, { q: 788, nombre: 'Dientes afilados' }]);
  assert.deepEqual(d.mazmorras[0].misiones.map((m) => [m.q, m.evento]), [[7043, 'Seasonal'], [791, undefined]]);
  assert.deepEqual(d.mencionadas.map((m) => [m.q, m.evento]), [[8862, 'Lunar Festival'], [7043, 'Seasonal'], [788, undefined]]);
  // las que no son de fiesta no llevan el campo (ni a null)
  assert.ok(!('evento' in d.mencionadas[2]));
  assert.ok(!('evento' in d.registro[1]));
  assert.ok(!('evento' in d.ruta.misiones[1]));
});

// ---------------------------------------------------------------------------------------------------------------
// 11-nov: misiones de mazmorra marcadas y zonas de su nivel (la IA no sabía que «Reptilia» es de Cuevas de los Lamentos
// y no tenía de dónde sacar la zona de una ruta para subir de nivel)
// ---------------------------------------------------------------------------------------------------------------
test('11-nov: una misión del registro de mazmorra lleva `mazmorra` con su nombre; las normales, no', () => {
  const { datos } = prepararTurno(base, mensaje({ ctx: { registro: [{ q: 4641, c: 0 }, { q: 793, c: 0 }] } }));
  const porQ = Object.fromEntries(datos.registro.map((r) => [r.q, r]));
  assert.equal(typeof porQ[793].mazmorra, 'string');
  assert.ok(porQ[793].mazmorra.length > 0);
  assert.equal('mazmorra' in porQ[4641], false);
});

test('11-nov: zonasNivel sale de ctx.zonas con el nombre de la zona; lo que no tiene forma se descarta y como mucho 6', () => {
  const zonas = [{ mapa: 1411, n: 12 }, { mapa: 0, n: 3 }, { mapa: 1413, n: 'x' }, { n: 4 }];
  for (let i = 0; i < 8; i++) zonas.push({ mapa: 2000 + i, n: 2 });
  const { datos } = prepararTurno(base, mensaje({ ctx: { zonas } }));
  assert.equal(datos.zonasNivel.length, 6);
  assert.deepEqual(datos.zonasNivel[0], { mapa: 1411, zona: base.zona(1411, 'es') ?? '#1411', misiones: 12 });
  assert.deepEqual(datos.zonasNivel[1], { mapa: 2000, zona: '#2000', misiones: 2 });
  const sin = prepararTurno(base, mensaje()).datos;
  assert.deepEqual(sin.zonasNivel, []);
});

test('11-nov: datos.vuelos sale de ctx.vuelos (textos, sin controles, como mucho 40); sin ellos no va el campo', () => {
  const vuelos = ['Cima del Trueno, Mulgore', '', 7, 'El Cruce,\u0001 Los Baldíos'];
  for (let i = 0; i < 50; i++) vuelos.push(`Nodo ${i}`);
  const { datos } = prepararTurno(base, mensaje({ ctx: { vuelos } }));
  assert.equal(datos.vuelos.length, 40);
  assert.equal(datos.vuelos[0], 'Cima del Trueno, Mulgore');
  assert.equal(datos.vuelos[1], 'El Cruce, Los Baldíos');
  assert.equal('vuelos' in prepararTurno(base, mensaje()).datos, false);
});

test('12-nov: el sitio de entrega de una misión lista para entregar va aunque esté en otro mapa; si no está lista, no', () => {
  const lugar = { mapa: 1413, zona: 'The Barrens', instancia: false };
  const lista_ = prepararTurno(base, mensaje({ ctx: { lugar, registro: [{ q: 4641, c: 1, o: [[8, 8]] }] } }));
  const p = lista_.datos.puntos.find((x) => x.q === 4641 && x.papel === 'entregar');
  assert.ok(p, JSON.stringify(lista_.datos.puntos));
  assert.ok(lista_.puntos.get(p.id).mapa !== 1413, 'la entrega está en otro mapa');
  const enCurso = prepararTurno(base, mensaje({ ctx: { lugar, registro: [{ q: 4641, c: 0, o: [[2, 8]] }] } }));
  assert.ok(!enCurso.datos.puntos.some((x) => x.q === 4641 && x.papel === 'entregar'));
});

test('13-nov: datos.planSubida lleva el tramo del personaje del plan de subida; sin plan, no va', () => {
  const plan = { facciones: { Horde: { tramos: [{ desde: 1, hasta: 6, zona: 'Durotar', razas: ['Orc'], misiones: ['Your Place in the World'], fuentes: ['https://g'] }] } } };
  const t = prepararTurno(base, mensaje(), plan);
  assert.equal(t.datos.planSubida.actual.zona, 'Durotar');
  assert.deepEqual(t.datos.planSubida.actual.misiones, ['Your Place in the World']);
  assert.equal(prepararTurno(base, mensaje(), null).datos.planSubida, undefined);
});

test('13-nov: cada misión del registro lleva nombreEn (el de la base en inglés) cuando su nombre es otro', () => {
  const t = prepararTurno(base, mensaje({ ctx: { registro: [{ q: 4641, c: 0, o: [], t: 'Tu lugar en el mundo' }] } }));
  const r = t.datos.registro.find((x) => x.q === 4641);
  assert.equal(r.nombre, 'Tu lugar en el mundo');
  assert.equal(r.nombreEn, 'Your Place In The World');
});

test('13-nov: con el plan de subida de verdad, el turno sigue sin pasar de 30.000 caracteres aunque el inventario sea enorme', () => {
  const grande = (n) => Array.from({ length: n }, (_, i) => ({ id: 20000 + i, n: 1, ca: 1, l: 0, b: [[0, i]], tt: ['x'.repeat(200)] }));
  const t = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 300, dinero: 1, bolsas: grande(400), equipo: [], banco: { fecha: 1, objetos: grande(800) } } } }));
  assert.ok(JSON.stringify(t.datos).length <= 30000);
});

test('13-nov: talentos, subasta y precios de subasta de cada objeto pasan a la IA', () => {
  const t = prepararTurno(base, mensaje({ ctx: {
    talentos: { arboles: [{ a: 'Armas', p: 5, t: [{ n: 'Golpe mejorado', f: 1, c: 2, r: 3, m: 5 }, { n: 'x', r: 'no' }] }], libres: 2 },
    subasta: { fuente: 'SnetForever', vista: 120 },
    inv: { libres: 10, huecos: 20, dinero: 1, bolsas: [{ id: 2589, n: 12, ca: 1, pv: 13, l: 0, b: [[0, 1]], pa: 120, pd: 2 }], equipo: [] },
  } }));
  assert.deepEqual(t.datos.talentos, { arboles: [{ arbol: 'Armas', puntos: 5, talentos: [{ rango: 3, nombre: 'Golpe mejorado', max: 5, fila: 1, columna: 2 }] }], sinGastar: 2 });
  assert.deepEqual(t.datos.subasta, { fuente: 'SnetForever', vistaHaceSegundos: 120 });
  const lino = t.datos.inventario.objetos.find((o) => o.id === 2589);
  assert.equal(lino.pa, 120);
  assert.equal(lino.pd, 2);
  const sin = prepararTurno(base, mensaje());
  assert.equal(sin.datos.talentos, undefined);
  assert.equal(sin.datos.subasta, undefined);
});

// 17-nov (TATI decía «no puedo ver tus talentos»): con una pregunta de talentos, el recorte de la app no los quita; y si
// el addon no los pudo leer (ctx.talentosFalta), la IA lo sabe.
const TALENTOS_ADDON = { arboles: [{ a: 'Armas', p: 5, t: [{ n: 'Golpe mejorado', f: 1, c: 2, r: 3, m: 5 }] }], libres: 2 };
const GORDA = { fuente: 'api_blizzard', resultados: [{ id: 1, descripcion: 'x'.repeat(MAX_DATOS) }] };

test('17-nov: hablaDeTalentos: talentos, puntos de talento, build y árbol, en los dos idiomas; «hola» no', () => {
  for (const texto of ['necesito saber si los puntos de talentos que llevo son los correctos', '¿Están bien mis TALENTOS?',
    'qué build me pongo', 'en qué árbol pongo el siguiente punto', 'are my talents right?', 'which talent tree']) {
    assert.equal(hablaDeTalentos(texto), true, texto);
  }
  for (const texto of ['hola', 'dónde está la misión', 'cuántos puntos de experiencia me faltan', 'talentoso', undefined]) {
    assert.equal(hablaDeTalentos(texto), false, String(texto));
  }
});

test('17-nov: con una pregunta de talentos, el recorte de la app no quita los talentos', () => {
  const pregunta = 'necesito saber si los puntos de talentos que llevo son los correctos';
  const t = prepararTurno(base, mensaje({ texto: pregunta, ctx: { talentos: TALENTOS_ADDON } }), undefined, { misionApi: GORDA });
  assert.ok(t.datos.recorteApp.includes('misionApi'), 'los datos no cabían');
  assert.ok(!t.datos.recorteApp.includes('talentos'), JSON.stringify(t.datos.recorteApp));
  assert.equal(t.datos.talentos.arboles[0].arbol, 'Armas');
  assert.ok(JSON.stringify(t.datos).length <= MAX_DATOS);
  // Sin hablar de talentos, se siguen recortando como antes.
  const otra = prepararTurno(base, mensaje({ texto: 'hola', ctx: { talentos: TALENTOS_ADDON } }), undefined, { misionApi: GORDA });
  assert.equal(otra.datos.talentos, undefined);
  assert.ok(otra.datos.recorteApp.includes('talentos'));
});

test('17-nov: con ctx.talentosFalta, datos.talentosFalta (la IA sabe que el addon no pudo leerlos) y el turno lo dice', () => {
  const t = prepararTurno(base, mensaje({ texto: '¿están bien mis talentos?', ctx: { talentosFalta: true } }));
  assert.equal(t.datos.talentosFalta, true);
  assert.equal(t.datos.talentos, undefined);
  assert.equal(t.talentosFalta, true);
  // Con los talentos, no; ni con un valor raro.
  const con = prepararTurno(base, mensaje({ ctx: { talentos: TALENTOS_ADDON, talentosFalta: true } }));
  assert.equal(con.datos.talentosFalta, undefined);
  assert.equal(con.talentosFalta, false);
  assert.equal(prepararTurno(base, mensaje({ ctx: { talentosFalta: 'si' } })).datos.talentosFalta, undefined);
  assert.equal(prepararTurno(base, mensaje()).talentosFalta, false);
});

test('13-nov: planProfesiones con las profesiones que tiene (primeros auxilios 129 de las guías)', () => {
  const t = prepararTurno(base, mensaje({ ctx: { prof: [{ id: 129, r: 40, m: 75 }, { id: 99999, r: 1, m: 75 }] } }));
  assert.equal(t.datos.planProfesiones.length, 1);
  assert.equal(t.datos.planProfesiones[0].nombre, 'First Aid');
  assert.ok(t.datos.planProfesiones[0].actual.fabricar);
});

test('misionApi: solo está si se le pasa con la fuente de la API, y se recorta entera si los datos no caben', () => {
  const api = { fuente: 'api_blizzard', resultados: [{ id: 1105, titulo: 'Caparazones endurecidos', zona: 'Las Mil Agujas' }] };
  assert.equal(prepararTurno(base, mensaje()).datos.misionApi, undefined);
  assert.deepEqual(prepararTurno(base, mensaje(), undefined, { misionApi: api }).datos.misionApi, api);
  assert.equal(prepararTurno(base, mensaje(), undefined, { misionApi: { fuente: 'otra', resultados: [] } }).datos.misionApi, undefined);
  const gorda = { fuente: 'api_blizzard', resultados: [{ id: 1, descripcion: 'x'.repeat(MAX_DATOS) }] };
  const t = prepararTurno(base, mensaje(), undefined, { misionApi: gorda });
  assert.equal(t.datos.misionApi, undefined);
  assert.ok(t.datos.recorteApp.includes('misionApi'));
});

test('sistema.md no nombra Auctionator ni otros addons de subasta', () => {
  const texto = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'prompt', 'sistema.md'), 'utf8');
  assert.doesNotMatch(texto, /auctionator|tsm|tradeskillmaster/i);
});

test('«hazme un grupo de hierbas que se vendan rápido» trae objetosDeTipo con Flor de paz (2447) y sin armas', () => {
  const t = prepararTurno(base, mensaje({ texto: 'hazme un grupo de hierbas que se vendan rápido' }));
  assert.equal(t.datos.objetosDeTipo.length, 1);
  assert.equal(t.datos.objetosDeTipo[0].tipo, 'hierbas');
  const objetos = t.datos.objetosDeTipo[0].objetos;
  assert.deepEqual(objetos.find((o) => o.id === 2447), { id: 2447, nombre: 'Flor de paz' });
  assert.deepEqual(objetos.map((o) => o.id).sort((a, b) => a - b), [765, 2447]);
  assert.ok(!objetos.some((o) => o.id === 25 || o.id === 2770), 'ni armas ni metales');
  // existeObjeto acepta los ids de la base aunque no haya catálogo ni precios; y rechaza los que no existen
  assert.equal(t.existeObjeto(2447), true);
  assert.equal(t.existeObjeto(2770), true);
  assert.equal(t.existeObjeto(404040), false);
});

test('sin tipo en el mensaje no hay objetosDeTipo', () => {
  const t = prepararTurno(base, mensaje({ texto: 'hola, ¿qué tal?' }));
  assert.equal(t.datos.objetosDeTipo, undefined);
});

test('tiposDelMensaje: los tipos en español y en inglés, con la subclase de la clase 7', () => {
  const sub = (texto, idioma) => tiposDelMensaje(texto, idioma).map((x) => `${x.tipo}:${x.subclase}`);
  assert.deepEqual(sub('un grupo de hierbas', 'es'), ['hierbas:9']);
  assert.deepEqual(sub('minerales y telas', 'es'), ['metal:7', 'telas:5']);
  assert.deepEqual(sub('pieles, carne y elementales', 'es'), ['cuero:6', 'elementales:10', 'carne:8']);
  assert.deepEqual(sub('cosas de encantamiento', 'es'), ['encantamiento:12']);
  assert.deepEqual(sub('a herb group', 'en'), ['hierbas:9']);
  assert.deepEqual(sub('ore, metal and cloth', 'en'), ['metal:7', 'telas:5']);
  assert.deepEqual(sub('leather, elemental, meat, cooking, enchanting', 'en'), ['cuero:6', 'elementales:10', 'carne:8', 'encantamiento:12']);
  assert.deepEqual(sub('hola', 'es'), []);
});

// Dibujos de la IA: el P# de un objetivo con varios sitios lleva `sitios` en el Map (para el círculo); la IA no los ve.
test('dibujos: el P# del objetivo de Tu lugar en el mundo lleva los sitios del bloque solo en el Map', () => {
  const t = prepararTurno(base, mensaje({ texto: '¿Dónde entrego Tu lugar en el mundo?' }));
  const fila = t.datos.puntos.find((p) => p.q === 4641 && p.papel === 'objetivo');
  assert.ok(fila, JSON.stringify(t.datos.puntos));
  assert.equal(fila.sitios, undefined, 'la IA no ve sitios');
  assert.deepEqual(t.puntos.get(fila.id).sitios, [[45, 70], [46, 71], [44, 69]]);
  const recoger = t.datos.puntos.find((p) => p.q === 4641 && p.papel === 'recoger');
  assert.equal(t.puntos.get(recoger.id).sitios, undefined);
});

// T3 (B5, 17-nov: la IA veía como «paso actual» el último de una guía acabada y prometía «sigue» sin tramos): con la guía
// acabada el addon manda `fin = true` (sin paso ni n) y la app pasa `fin` y `tramo: {i, n, pendientes}` a datos.ruta.
test('T3 (B5): datos.ruta lleva fin (sin paso ni n) y tramo con i, n y pendientes; un tramo que no vale no va', () => {
  const guia = { clave: 'IA\Ruta de Prueba (Horda, 1 de 2)', titulo: 'Ruta de Prueba', fin: true, misiones: [] };
  const t = prepararTurno(base, mensaje({ ctx: { guia } }), undefined, { tramo: { i: 1, n: 2, pendientes: 1 } });
  assert.equal(t.datos.ruta.fin, true);
  assert.equal('paso' in t.datos.ruta, false);
  assert.equal('n' in t.datos.ruta, false);
  assert.deepEqual(t.datos.ruta.tramo, { i: 1, n: 2, pendientes: 1 });
  // Sin fin (o con otro valor) no va; un tramo raro tampoco.
  const sinFin = prepararTurno(base, mensaje({ ctx: { guia: { ...guia, fin: 'si', n: 3, paso: 'Habla' } } }), undefined, { tramo: { i: 'x', n: 2, pendientes: 0 } });
  assert.equal('fin' in sinFin.datos.ruta, false);
  assert.equal('tramo' in sinFin.datos.ruta, false);
  assert.equal(sinFin.datos.ruta.paso, 'Habla');
  for (const malo of [{ i: 3, n: 2, pendientes: 0 }, { i: 1, n: 2, pendientes: -1 }, { i: 0, n: 1, pendientes: 0 }, null]) {
    assert.equal('tramo' in prepararTurno(base, mensaje({ ctx: { guia } }), undefined, { tramo: malo }).datos.ruta, false, JSON.stringify(malo));
  }
  // Sin guía no hay ruta, aunque venga el tramo.
  assert.equal(prepararTurno(base, mensaje(), undefined, { tramo: { i: 1, n: 1, pendientes: 0 } }).datos.ruta, null);
});

// T2 (C, 17-nov: con la ruta a medias, la IA no veía lo hecho y lo pedido de sus misiones): registro.objetivos no se quita
// antes que los objetos de las bolsas, y nunca si el mensaje habla de guías, rutas o misiones.
test('T2 (C): registro.objetivos se recorta después de los objetos de las bolsas y nunca si se habla de rutas o misiones', () => {
  const bolsas = Array.from({ length: 1200 }, (_, i) => ({ id: 400000 + i, n: 1, ca: 1, l: 0, b: [] }));
  const t = prepararTurno(base, mensaje({ ctx: { inv: { libres: 0, huecos: 1200, dinero: 1, bolsas, equipo: [] } } }));
  assert.ok(t.datos.recorteApp.includes('inventario.objetos'));
  assert.ok(!t.datos.recorteApp.includes('registro.objetivos'), JSON.stringify(t.datos.recorteApp));
  assert.ok(t.datos.registro[0].objetivos.length > 0);
  // Un registro enorme de objetivos: sin hablar de rutas se quitan; hablando de rutas o de una misión, no.
  const registro = Array.from({ length: 60 }, (_, i) => ({ q: 900000 + i, c: 0, o: Array.from({ length: 30 }, () => [0, 10]) }));
  const sinHablar = prepararTurno(base, mensaje({ texto: 'hola', ctx: { registro } }));
  assert.ok(sinHablar.datos.recorteApp.includes('registro.objetivos'));
  for (const texto of ['créame una ruta', '¿qué me falta de esta misión?', 'what quests do I have']) {
    const t2 = prepararTurno(base, mensaje({ texto, ctx: { registro } }));
    assert.ok(JSON.stringify(t2.datos).length <= MAX_DATOS);
    assert.ok(!(t2.datos.recorteApp ?? []).includes('registro.objetivos'), texto);
    assert.ok(t2.datos.registro.length > 0 && t2.datos.registro.every((r) => r.objetivos.length === 30), texto);
  }
});

// F1 (ronda 1): el precio de subasta de cada objeto dice de qué foto sale (pf) y su edad (pe); lo que no vale no pasa.
test('F1: pa, pf y pe pasan a la IA; una fuente que no se conoce o una edad negativa no', () => {
  const bolsas = [
    { id: 2589, n: 12, ca: 1, pv: 13, l: 0, b: [[0, 1]], pa: 180, pd: 0, pf: 'lista', pe: 30 },
    { id: 2592, n: 3, ca: 1, pv: 33, l: 0, b: [[0, 2]], pa: 150, pf: 'escaneo', pe: 300 },
    { id: 4306, n: 1, ca: 1, pv: 99, l: 0, b: [[0, 3]], pa: 900, pd: 1, pf: 'otra', pe: -5 },
  ];
  const t = prepararTurno(base, mensaje({ ctx: { subasta: { fuente: 'SnetForever', vista: 60 }, inv: { libres: 10, huecos: 20, dinero: 1, bolsas, equipo: [] } } }));
  const por = (id) => t.datos.inventario.objetos.find((o) => o.id === id);
  assert.deepEqual([por(2589).pa, por(2589).pd, por(2589).pf, por(2589).pe], [180, 0, 'lista', 30]);
  assert.deepEqual([por(2592).pa, por(2592).pd, por(2592).pf, por(2592).pe], [150, undefined, 'escaneo', 300]);
  assert.deepEqual([por(4306).pa, por(4306).pd, por(4306).pf, por(4306).pe], [900, 1, undefined, undefined]);
});

test('F1: sistema.md explica pf y pe: la lista se leyó en Navegar hace pe segundos (no es de ahora sin más) y el escaneo nunca es actual', () => {
  const sistema = readFileSync(new URL('../src/prompt/sistema.md', import.meta.url), 'utf8');
  for (const t of ['`pf`', '`pe`', '`lista`', '`escaneo`', 'Un precio con `pf: lista` se leyó en Navegar hace `pe` segundos',
    'uno de `escaneo` nunca lo des por actual', 'leída en Navegar hace `edad` segundos', 'Solo `lista` puede ser de ahora, y solo si su `edad` es pequeña']) {
    assert.ok(sistema.includes(t), t);
  }
  assert.ok(!sistema.includes('Solo un precio con `pf: lista` es de ahora'), 'la lista ya no es «de ahora» tenga la edad que tenga');
  // Ronda 3: la definición de pf tampoco dice «leída ahora», y el precio de datos.comercio es el de la foto de la app.
  assert.ok(!sistema.includes('leída ahora en Navegar'), 'pf: lista se leyó en Navegar, con su edad');
  assert.ok(sistema.includes('`lista` es la lista de la subasta leída en Navegar (su edad es `pe`)'));
  assert.ok(!sistema.includes('lo más barato de ahora'), 'el precio de datos.comercio no es de ahora');
  assert.ok(sistema.includes('lo más barato en la foto de la app de la hora `generado`'));
});
