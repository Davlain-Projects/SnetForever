// El último estado de cada personaje para TATI: se guarda en puente-tati/estados.json, sin textos, inventario ni nombres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearEstadoJuego, resumenEstado } from '../src/tati/estado.mjs';

const carpeta = () => {
  const datos = join(mkdtempSync(join(tmpdir(), 'snf-tati-est-')), 'datos');
  mkdirSync(datos, { recursive: true });
  return datos;
};
const msg = (extra = {}) => ({
  pj: 'Tal Cual-Reino Prueba', idioma: 'es', texto: 'una pregunta privada', refs: [1, 2],
  ctx: {
    pj: { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 12 },
    lugar: { zona: 'Durotar', subzona: 'Valle', mapa: 1411, x: 0.5, y: 0.4, instancia: false },
    registro: [{ q: 790, t: 'Un título', c: 1, o: [] }, { q: 791, t: 'Otro', c: 0 }],
    guia: { clave: 'archivo-guia', titulo: 'Guía de Durotar', n: 3 },
    inv: { oro: 5, bolsas: [1, 2, 3] },
  },
  ...extra,
});
const mk = (datos, t = 1000) => { let ms = t; const e = crearEstadoJuego({ datos, fs, ahora: () => ms }); e.avanza = (n) => { ms += n; }; return e; };

test('apuntar dos personajes: ultimo es el segundo y de() da el primero', async () => {
  const e = mk(carpeta());
  await e.apuntar('Uno-Reino Prueba', msg(), 1);
  await e.apuntar('Dos-Reino Prueba', msg(), 2);
  assert.equal(e.ultimo().pj, 'Dos-Reino Prueba');
  assert.equal(e.de('Uno-Reino Prueba').r, 1);
  assert.equal(e.de('Nadie-Reino'), null);
});

test('un undécimo personaje echa al más viejo', async () => {
  const datos = carpeta();
  const e = mk(datos);
  for (let i = 0; i < 11; i++) { e.avanza(10); await e.apuntar(`P${i}-Reino Prueba`, msg(), 1); }
  assert.equal(e.de('P0-Reino Prueba'), null);
  assert.ok(e.de('P1-Reino Prueba'));
  assert.equal(Object.keys(JSON.parse(readFileSync(join(datos, 'puente-tati', 'estados.json'), 'utf8')).personajes).length, 10);
});

test('recargar desde disco da lo mismo y no guarda texto, refs ni inventario', async () => {
  const datos = carpeta();
  const e = mk(datos);
  await e.apuntar('Uno-Reino Prueba', msg(), 4);
  const otro = mk(datos);
  assert.deepEqual(otro.ultimo(), e.ultimo());
  const crudo = readFileSync(join(datos, 'puente-tati', 'estados.json'), 'utf8');
  assert.ok(!crudo.includes('pregunta privada'));
  assert.ok(!crudo.includes('refs'));
  assert.ok(!crudo.includes('bolsas'));
  assert.equal(JSON.parse(crudo).version, 1);
});

test('resumenEstado no lleva el nombre y trae lo del contexto', async () => {
  const e = mk(carpeta(), 1000);
  await e.apuntar('Tal Cual-Reino Prueba', msg(), 1);
  const s = resumenEstado(e.ultimo(), 6000);
  assert.ok(!JSON.stringify(s).includes('Tal Cual'));
  assert.equal(s.conocido, true);
  assert.equal(s.haceSegundos, 5);
  assert.deepEqual(s.personaje, { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 12 });
  assert.equal(s.lugar.zona, 'Durotar');
  assert.deepEqual(s.misiones, [{ q: 790, titulo: 'Un título', completa: true }, { q: 791, titulo: 'Otro', completa: false }]);
  assert.equal(s.guia, 'Guía de Durotar');
  assert.equal(resumenEstado(null, 1).conocido, false);
});

test('ranuras: 21 - r - gastadas, mínimo 0, apuntar las pone a 0', async () => {
  const e = mk(carpeta());
  assert.equal(e.ranurasQuedan(), null);
  await e.apuntar('Uno-Reino Prueba', msg(), 18);
  assert.equal(e.ranurasQuedan(), 3);
  e.gastar(); e.gastar(); e.gastar(); e.gastar();
  assert.equal(e.ranurasQuedan(), 0);
  await e.apuntar('Uno-Reino Prueba', msg(), 1);
  assert.equal(e.ranurasQuedan(), 20);
});

test('un estados.json roto va a la cuarentena y se empieza de cero', async () => {
  const datos = carpeta();
  mkdirSync(join(datos, 'puente-tati'));
  writeFileSync(join(datos, 'puente-tati', 'estados.json'), '{roto');
  const e = mk(datos);
  assert.equal(e.ultimo(), null);
  assert.ok(existsSync(join(datos, 'cuarentena')));
  assert.equal(readdirSync(join(datos, 'cuarentena')).length, 1);
  await e.apuntar('Uno-Reino Prueba', msg(), 1);
  assert.ok(e.ultimo());
});

test('gastar se guarda en disco: otro crearEstadoJuego da las mismas ranuras', async () => {
  const datos = carpeta();
  const e = mk(datos);
  await e.apuntar('Uno-Reino Prueba', msg(), 10);
  e.gastar(); e.gastar();
  await e.gastar();
  assert.equal(e.ranurasQuedan(), 8);
  assert.equal(mk(datos).ranurasQuedan(), 8);
});

test('dos apuntar seguidos sin esperar: el último queda en disco', async () => {
  const datos = carpeta();
  const e = mk(datos);
  const a = e.apuntar('Uno-Reino Prueba', msg(), 1);
  const b = e.apuntar('Dos-Reino Prueba', msg(), 2);
  await Promise.all([a, b]);
  assert.equal(mk(datos).ultimo().pj, 'Dos-Reino Prueba');
  assert.equal(readdirSync(join(datos, 'puente-tati')).length, 1);
});

test('ctx se guarda entero menos el inventario', async () => {
  const datos = carpeta();
  const e = mk(datos);
  const m = msg();
  m.ctx.prof = [{ id: 164, n: 50 }];
  await e.apuntar('Uno-Reino Prueba', m, 1);
  const c = e.ultimo().mensaje.ctx;
  assert.equal('inv' in c, false);
  assert.deepEqual(c.prof, [{ id: 164, n: 50 }]);
  assert.equal(c.guia.clave, 'archivo-guia');
  assert.equal('inv' in mk(datos).ultimo().mensaje.ctx, false);
});
