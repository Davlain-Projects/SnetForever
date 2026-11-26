import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extraerGuias, analizarGuia } from '../src/rxp/leer.js';
import { analizarLinea, trocearArgs, separarFiltro } from '../src/rxp/lineas.js';

const fixture = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

function guiaDe(nombre) {
  const [g] = extraerGuias(fixture(nombre));
  return analizarGuia(g.texto, { archivo: nombre, lineaInicial: g.lineaInicial });
}

test('extraerGuias ignora el código Lua previo y devuelve texto y línea inicial', () => {
  const gs = extraerGuias(fixture('durotar-en.lua'));
  assert.equal(gs.length, 1);
  assert.equal(gs[0].lineaInicial, 7);
  assert.ok(gs[0].texto.startsWith('#forever'));
  assert.ok(!gs[0].texto.includes(']])'));
});

test('extraerGuias admite [=[ ]=] y varias guías por archivo', () => {
  const gs = extraerGuias(fixture('raro.lua'));
  assert.equal(gs.length, 2);
  assert.equal(gs[0].lineaInicial, 4);
  assert.ok(gs[0].texto.includes('foo bar'));
  assert.ok(gs[1].texto.startsWith('#name Segunda'));
  assert.equal(gs[1].lineaInicial, 22);
});

test('una RegisterGuide([[ sin cerrar no desaparece en silencio: error claro con archivo y línea', () => {
  const texto = 'x\nRXPGuides.RegisterGuide([[\n#name A\nstep\n]])\n\nRXPGuides.RegisterGuide([[\n#name B\nstep\n';
  assert.throws(() => extraerGuias(texto, { archivo: 'roto.lua' }),
    (e) => /roto\.lua/.test(e.message) && /línea 7/.test(e.message) && /sin cerrar/.test(e.message));
  assert.throws(() => extraerGuias('RXPGuides.RegisterGuide([=[\n#name C\n]]'), /sin cerrar.*\]=\]/);
});

test('extraerGuias admite CRLF y salto inicial', () => {
  const gs = extraerGuias('x\r\nRXPGuides.RegisterGuide([[\r\n#name A\r\nstep\r\n]])');
  assert.equal(gs[0].lineaInicial, 3);
  const g = analizarGuia(gs[0].texto, { archivo: 'a', lineaInicial: gs[0].lineaInicial });
  assert.equal(g.cabecera[0].linea, 3);
  assert.equal(g.pasos[0].linea, 4);
});

for (const [f, aceptar] of [['durotar-en.lua', 'Accept Your Place In The World'], ['durotar-es.lua', null]]) {
  test(`cabecera de ${f}`, () => {
    const g = guiaDe(f);
    const v = (t) => g.cabecera.find((c) => c.tag === t)?.valor;
    assert.equal(v('name'), '1-6 Durotar');
    assert.equal(v('next'), '6-10 Durotar');
    assert.equal(v('defaultfor'), 'Troll/Orc');
    assert.equal(g.filtroGuia, 'Horde');
    assert.ok(g.cabecera.some((c) => c.tag === 'forever' && c.valor === ''));
    assert.equal(g.cabecera.find((c) => c.tag === 'name').linea, 10);
    if (aceptar) {
      const p = g.pasos[1];
      const acc = p.lineas.find((l) => l.nombre === 'accept');
      assert.equal(acc.texto, aceptar);
    }
  });
}

test('2.º paso de Durotar: goto, accept, target', () => {
  const g = guiaDe('durotar-en.lua');
  const p = g.pasos[1];
  const goto_ = p.lineas.find((l) => l.tipo === 'cmd' && l.nombre === 'goto');
  assert.deepEqual(goto_.args, ['1411/1', '-4251.46', '-607.35']);
  const acc = p.lineas.find((l) => l.nombre === 'accept');
  assert.deepEqual(acc.args, ['4641']);
  assert.equal(acc.texto, 'Accept Your Place In The World');
  const tgt = p.lineas.find((l) => l.nombre === 'target');
  assert.deepEqual(tgt.args, ['Kaltunk']);
  assert.equal(g.pasos[0].linea, 18);
});

test('el paso con +|cRXP_WARN_… << Warlock da una línea manual con filtro', () => {
  const g = guiaDe('durotar-en.lua');
  const p = g.pasos[2];
  assert.equal(p.filtro, 'Warrior/Shaman/Warlock/Mage/Priest');
  const m = p.lineas.filter((l) => l.tipo === 'manual');
  assert.equal(m.length, 4);
  assert.equal(m[0].filtro, 'Warlock');
  assert.ok(m[0].texto.startsWith('|cRXP_WARN_Kill'));
  assert.ok(!m[0].texto.includes('<<'));
});

test('goto con comentario --c: da 3 args', () => {
  const l = analizarLinea('.goto 1439/1,-769.17,7744.53--c:1439,56.654,13.484', 5, {});
  assert.equal(l.tipo, 'cmd');
  assert.deepEqual(l.args, ['1439/1', '-769.17', '7744.53']);
  assert.equal(l.linea, 5);
});

test('foo bar da aviso con número de línea y las demás líneas raras se leen', () => {
  const g = guiaDe('raro.lua');
  assert.equal(g.avisos.length, 1);
  assert.deepEqual(g.avisos[0], { archivo: 'raro.lua', linea: 8, mensaje: g.avisos[0].mensaje });
  assert.match(g.avisos[0].mensaje, /foo bar/);
  const ls = g.pasos[0].lineas;
  assert.deepEqual(ls.find((l) => l.nombre === 'target').args, ['A', 'B', 'C']);
  assert.deepEqual(ls.find((l) => l.nombre === 'link').args, ['https://x.y/z, w']);
  assert.deepEqual(ls.find((l) => l.nombre === 'vendor').args, []);
  assert.deepEqual(ls.find((l) => l.tipo === 'nota'), { tipo: 'nota', texto: 'Una nota', linea: 12 });
  assert.deepEqual(ls.find((l) => l.tipo === 'texto'), { tipo: 'texto', texto: 'solo texto', linea: 13 });
  assert.deepEqual(ls.find((l) => l.tipo === 'manual'), { tipo: 'manual', texto: 'hacer a mano', filtro: 'Mage', linea: 14 });
  assert.deepEqual(ls.find((l) => l.nombre === 'accept').args, ['1', '2']);
  assert.deepEqual(ls.find((l) => l.tipo === 'tag'), { tipo: 'tag', nombre: 'label', texto: 'uno', linea: 16 });
  const ult = ls[ls.length - 1];
  assert.deepEqual(ult.args, ['1', '2', '3']);
  assert.equal(ult.linea, 19);
});

test('helpers: trocearArgs y separarFiltro', () => {
  assert.deepEqual(trocearArgs('goto', ' 1, ,2 ,'), ['1', '2']);
  assert.deepEqual(trocearArgs('mob', 'A;B, C;'), ['A', 'B, C']);
  assert.deepEqual(trocearArgs('clicknext', 'a, b'), ['a, b']);
  assert.deepEqual(trocearArgs('link', ''), []);
  assert.deepEqual(separarFiltro('x << A << B'), { resto: 'x', filtro: 'A << B' });
  assert.deepEqual(separarFiltro('x'), { resto: 'x' });
});

test('cabecera: la etiqueta con filtro lo guarda y una línea suelta no # avisa', () => {
  const g = analizarGuia('#forever\n#displayname Uno << Horde\nrara\nstep\n.goto 1,2', { archivo: 'a', lineaInicial: 10 });
  assert.equal(g.cabecera[1].filtro, 'Horde');
  assert.equal(g.cabecera[1].valor, 'Uno');
  assert.equal(g.avisos.length, 1);
  assert.equal(g.avisos[0].linea, 12);
  assert.equal(g.pasos.length, 1);
});
