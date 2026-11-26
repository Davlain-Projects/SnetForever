// Requisitos visibles (motor/requisitos.lua), tarea 11 (O11): lo que la ventana enseña de cada paso («necesitas
// grupo», «élite», «nivel 10», «misión previa X»...) y si se cumple. Solo informan: no deciden el avance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const ACEPTAR = (q) => ({ t: 'accept', q });

// Máquina con una guía de un solo paso cargada. `pasoDatos` son los campos del paso (elementos, requisitos...).
function conPaso(pasoDatos, opciones = {}, campos = {}) {
  const m = nuevaMaquina(opciones);
  m.ponerGuia(guiaDePrueba([pasoDatos], campos));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  return m;
}

// Requisitos del paso i de la guía cargada.
// Lote D (D2): cada accept trae además la línea del nivel de la misión («Misión de nivel N (… para ti)»), que tiene sus
// pruebas en lote-d-grises.test.js; aquí se miran los demás requisitos sin ella.
const reqs = (m, i = 1) => (m.lua(`SnetForever.Requisitos.delPaso(SnetForever.Motor.paso(${i}))`) || [])
  .filter((r) => r.clave !== 'nivelMision');
const porClave = (lista, clave) => lista.find((r) => r.clave === clave);
const ALIANZA = { jugador: { faccion: 'Alliance', raza: 'Human' } };
const EN = { guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } } };

test('grupo: solo → aviso con el número; en un grupo de 3 → ok', () => {
  const m = conPaso({ requisitos: [{ t: 'grupo', n: 3 }], elementos: [] });
  let r = reqs(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].t, 'grupo');
  assert.equal(r[0].estado, 'aviso');
  assert.match(r[0].texto, /3/);
  m.jugador({ grupo: 3 });
  r = reqs(m);
  assert.equal(r[0].estado, 'ok');
  m.jugador({ grupo: 2 });
  assert.equal(reqs(m)[0].estado, 'aviso');
  sinErrores(m);
});

test('grupo sin número: aviso', () => {
  const m = conPaso({ requisitos: [{ t: 'grupo' }], elementos: [] });
  const r = reqs(m);
  assert.equal(r[0].estado, 'aviso');
  assert.equal(typeof r[0].texto, 'string');
  sinErrores(m);
});

test('elite y mazmorra de requisitos: avisos', () => {
  // Un paso con {mazmorra VC} solo se ve en las guías de mazmorras.
  const m = conPaso({ requisitos: [{ t: 'elite' }, { t: 'mazmorra', d: 'VC' }], elementos: [] }, {}, { tipo: 'mazmorras' });
  const r = reqs(m);
  assert.equal(porClave(r, 'elite').estado, 'aviso');
  assert.equal(porClave(r, 'mazmorra:VC').estado, 'aviso');
  assert.match(porClave(r, 'mazmorra:VC').texto, /VC/);
  assert.equal(r.length, 2);
  // La mazmorra negada («solo en las otras guías») no es un requisito que enseñar.
  const n = conPaso({ requisitos: [{ t: 'elite' }, { t: 'mazmorra', d: '!SFK' }], elementos: [] });
  assert.deepEqual(reqs(n).map((x) => x.clave), ['elite']);
  sinErrores(m);
  sinErrores(n);
});

test('nivel 12 a nivel 10: falta, con 12 y 10; al subir, ok', () => {
  const m = conPaso({ requisitos: [{ t: 'nivel', n: 12 }], elementos: [] }, { jugador: { nivel: 10 } });
  let r = reqs(m);
  assert.equal(r[0].t, 'nivel');
  assert.equal(r[0].clave, 'nivel');
  assert.equal(r[0].estado, 'falta');
  assert.match(r[0].texto, /12/);
  assert.match(r[0].texto, /10/);
  m.jugador({ nivel: 12 });
  r = reqs(m);
  assert.equal(r[0].estado, 'ok');
  sinErrores(m);
});

test('accept 789: requiredLevel 3 falta a nivel 2 y está ok a nivel 3', () => {
  const m = conPaso({ elementos: [ACEPTAR(789)] }, { jugador: { nivel: 2 } });
  let r = reqs(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].clave, 'nivel');
  assert.equal(r[0].estado, 'falta');
  assert.match(r[0].texto, /3/);
  m.jugador({ nivel: 3 });
  r = reqs(m);
  assert.equal(r[0].estado, 'ok');
  sinErrores(m);
});

test('accept 788: sin la 4641 entregada falta, con su nombre en español; entregada, ok', () => {
  const m = conPaso({ elementos: [ACEPTAR(788)] });
  let r = reqs(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].t, 'mision');
  assert.equal(r[0].clave, 'mision:4641');
  assert.equal(r[0].estado, 'falta');
  assert.match(r[0].texto, /Tu lugar en el mundo/);
  m.estadoMision(4641, { entregada: true });
  r = reqs(m);
  assert.equal(r[0].estado, 'ok');
  sinErrores(m);
});

test('accept 788 con idioma en: nombre y textos en inglés', () => {
  const m = conPaso({ elementos: [ACEPTAR(788)] }, EN);
  const r = reqs(m);
  assert.match(r[0].texto, /Your Place In The World/);
  assert.doesNotMatch(r[0].texto, /Misión/);
  const n = conPaso({ requisitos: [{ t: 'nivel', n: 12 }], elementos: [] }, { ...EN, jugador: { nivel: 10 } });
  assert.match(reqs(n)[0].texto, /Level/);
  sinErrores(m);
  sinErrores(n);
});

test('accept 792: herboristería 50 falta con 40, ok con 50; nunca la tiene → falta', () => {
  const m = conPaso({ elementos: [ACEPTAR(792)] });
  m.lua('BANCO.ponerHechizo(9134, "Herboristería", true)');
  m.lua('BANCO.ponerHabilidad("Herboristería", 40, 75)');
  let r = reqs(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].clave, 'profesion:herbalism');
  assert.equal(r[0].estado, 'falta');
  assert.match(r[0].texto, /Herboristería/);
  assert.match(r[0].texto, /50/);
  assert.match(r[0].texto, /40/);
  const n = conPaso({ elementos: [ACEPTAR(792)] });
  n.lua('BANCO.ponerHechizo(9134, "Herboristería", true)');
  assert.equal(reqs(n)[0].estado, 'falta');
  // Con la habilidad a 50 se cumple.
  const k = conPaso({ elementos: [ACEPTAR(792)] });
  k.lua('BANCO.ponerHechizo(9134, "Herboristería", true)');
  k.lua('BANCO.ponerHabilidad("Herboristería", 50, 75)');
  assert.equal(reqs(k)[0].estado, 'ok');
  sinErrores(m);
  sinErrores(n);
  sinErrores(k);
});

test('accept 790 → aviso Banda; accept 791 → aviso con el nombre de la mazmorra; accept 793 → aviso Élite', () => {
  // La Horda no tiene la bandera de banda en la 790 (porFaccion); la Alianza sí.
  const m = conPaso({ elementos: [ACEPTAR(790)] }, ALIANZA);
  let r = reqs(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].estado, 'aviso');
  assert.match(r[0].texto, /Banda/);
  const d = conPaso({ elementos: [ACEPTAR(791)] });
  r = reqs(d);
  assert.equal(r.length, 1);
  assert.equal(r[0].estado, 'aviso');
  assert.match(r[0].texto, /The Deadmines/);
  const e = conPaso({ elementos: [ACEPTAR(793)] });
  r = reqs(e);
  assert.equal(r.length, 1);
  assert.equal(r[0].estado, 'aviso');
  assert.match(r[0].texto, /Élite/);
  const en = conPaso({ elementos: [ACEPTAR(790)] }, { ...EN, ...ALIANZA });
  assert.match(reqs(en)[0].texto, /Raid/);
  for (const x of [m, d, e, en]) sinErrores(x);
});

test('nivel 3 en requisitos y requiredLevel 3 de la 789: un solo requisito', () => {
  const m = conPaso({ requisitos: [{ t: 'nivel', n: 3 }], elementos: [ACEPTAR(789)] }, { jugador: { nivel: 2 } });
  const r = reqs(m);
  assert.equal(r.filter((x) => x.clave === 'nivel').length, 1);
  assert.equal(r.length, 1);
  sinErrores(m);
});

test('con dos niveles distintos manda el mayor', () => {
  const m = conPaso({ requisitos: [{ t: 'nivel', n: 2 }], elementos: [ACEPTAR(789)] }, { jugador: { nivel: 2 } });
  const r = reqs(m);
  assert.equal(r.length, 1);
  assert.match(r[0].texto, /3/);
  assert.equal(r[0].estado, 'falta');
  sinErrores(m);
});

test('Alliance con accept 788: falta de nivel 5 (porFaccion) y, además, la misión previa', () => {
  const m = conPaso({ elementos: [ACEPTAR(788)] }, { jugador: { faccion: 'Alliance', raza: 'Human' } });
  const r = reqs(m);
  const nivel = porClave(r, 'nivel');
  assert.ok(nivel);
  assert.equal(nivel.estado, 'falta');
  assert.match(nivel.texto, /5/);
  assert.ok(porClave(r, 'mision:4641'));
  sinErrores(m);
});

test('requisito mision con estado entregada: ok o falta, con el nombre', () => {
  const m = conPaso({ requisitos: [{ t: 'mision', q: 788, estado: 'entregada' }], elementos: [] });
  assert.equal(reqs(m)[0].estado, 'falta');
  assert.match(reqs(m)[0].texto, /Afilando los dientes/);
  m.estadoMision(788, { entregada: true });
  assert.equal(reqs(m)[0].estado, 'ok');
  sinErrores(m);
});

test('requisito paso: ok cuando el paso con esa etiqueta está hecho o saltado', () => {
  const m = nuevaMaquina();
  m.ponerGuia(guiaDePrueba([
    { etiquetas: { label: 'ANTES' }, elementos: [{ t: 'manual', texto: { en: 'Do', es: 'Haz' } }] },
    { requisitos: [{ t: 'paso', etiqueta: 'ANTES' }], elementos: [{ t: 'manual', texto: { en: 'Do', es: 'Haz' } }] },
    { requisitos: [{ t: 'paso', etiqueta: 'NOEXISTE' }], elementos: [] },
  ]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  let r = reqs(m, 2);
  assert.equal(r[0].t, 'paso');
  assert.equal(r[0].clave, 'paso:ANTES');
  assert.equal(r[0].estado, 'falta');
  m.lua('SnetForever.Motor.saltar(1)');
  r = reqs(m, 2);
  assert.equal(r[0].estado, 'ok');
  // Una etiqueta que no existe tras filtrar no hace esperar (como en el motor): ok, sin error.
  assert.equal(reqs(m, 3)[0].estado, 'ok');
  sinErrores(m);
});

test('profesion de requisitos: ok o falta según el nivel', () => {
  const m = conPaso({ requisitos: [{ t: 'profesion', p: 'cooking', n: 20 }], elementos: [] });
  m.lua('BANCO.ponerHechizo(2550, "Cocina", true)');
  m.lua('BANCO.ponerHabilidad("Cocina", 25, 75)');
  assert.equal(reqs(m)[0].estado, 'ok');
  const n = conPaso({ requisitos: [{ t: 'profesion', p: 'cooking', n: 20 }], elementos: [] });
  n.lua('BANCO.ponerHechizo(2550, "Cocina", true)');
  n.lua('BANCO.ponerHabilidad("Cocina", 5, 75)');
  assert.equal(reqs(n)[0].estado, 'falta');
  sinErrores(m);
  sinErrores(n);
});

test('reputacion de requisitos: ok con el rango pedido o mayor, falta con menos', () => {
  const m = conPaso({ requisitos: [{ t: 'reputacion', faccion: 72, rango: 5 }], elementos: [] });
  m.lua('BANCO.ponerFaccion(72, 4, 100, 3000)');
  let r = reqs(m);
  assert.equal(r[0].clave, 'reputacion:72');
  assert.equal(r[0].estado, 'falta');
  assert.match(r[0].texto, /Neutral|Amistoso/);
  m.lua('BANCO.ponerFaccion(72, 5, 100, 6000)');
  assert.equal(reqs(m)[0].estado, 'ok');
  m.lua('BANCO.ponerFaccion(72, 6, 0, 12000)');
  assert.equal(reqs(m)[0].estado, 'ok');
  sinErrores(m);
});

test('objeto de requisitos: ok con las unidades pedidas, falta con menos', () => {
  const m = conPaso({ requisitos: [{ t: 'objeto', i: 159, n: 3 }], elementos: [] });
  m.objeto(159, 1);
  let r = reqs(m);
  assert.equal(r[0].clave, 'objeto:159');
  assert.equal(r[0].estado, 'falta');
  assert.match(r[0].texto, /Agua de manantial refrescante/);
  m.objeto(159, 3);
  assert.equal(reqs(m)[0].estado, 'ok');
  sinErrores(m);
});

test('requisitos con filtro: solo cuentan para los personajes a los que aplica', () => {
  const m = conPaso({ requisitos: [{ t: 'elite', filtro: [['c:MAGE']] }, { t: 'grupo', n: 2, filtro: [['c:WARRIOR']] }], elementos: [] });
  const r = reqs(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].t, 'grupo');
  sinErrores(m);
});

test('requisitos repetidos con la misma clave: uno solo', () => {
  const m = conPaso({ requisitos: [{ t: 'elite' }, { t: 'elite' }, { t: 'mision', q: 788 }, { t: 'mision', q: 788 }], elementos: [ACEPTAR(790), ACEPTAR(790)] }, ALIANZA);
  const r = reqs(m);
  assert.deepEqual(r.map((x) => x.clave).sort(), ['banda', 'elite', 'mision:788']);
  sinErrores(m);
});

test('un t desconocido: aviso «Requisito: raro», sin error', () => {
  const m = conPaso({ requisitos: [{ t: 'raro' }], elementos: [] });
  const r = reqs(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].estado, 'aviso');
  assert.equal(r[0].texto, 'Requisito: raro');
  const en = conPaso({ requisitos: [{ t: 'raro' }], elementos: [] }, EN);
  assert.equal(reqs(en)[0].texto, 'Requirement: raro');
  sinErrores(m);
  sinErrores(en);
});

test('paso sin requisitos ni misiones, o nil: lista vacía', () => {
  const m = conPaso({ elementos: [{ t: 'nota', texto: { en: 'x', es: 'x' } }] });
  assert.deepEqual(reqs(m), []);
  assert.deepEqual(m.lua('SnetForever.Requisitos.delPaso(nil)'), []);
  sinErrores(m);
});

test('misión sin datos o con datos sueltos: no da error', () => {
  const m = conPaso({ elementos: [ACEPTAR(999999)] });
  assert.deepEqual(reqs(m), []);
  const n = nuevaMaquina();
  n.datoMision(5000, {
    name: 'Rara', requiredLevel: 1, preQuestGroup: [788, 789], requiredMinRep: [72, 3000],
    requiredSourceItems: [159], requiredSkill: [633, 10], questFlags: 0, zoneOrSort: -141,
  });
  n.ponerGuia(guiaDePrueba([{ elementos: [ACEPTAR(5000)] }]));
  n.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  const r = reqs(n);
  const claves = r.map((x) => x.clave).sort();
  assert.deepEqual(claves, ['mision:788', 'mision:789', 'objeto:159', 'profesion:lockpicking', 'reputacion:72']);
  sinErrores(m);
  sinErrores(n);
});

test('preQuestSingle: basta una de varias; si ya hay una entregada, la lista cumple', () => {
  const m = nuevaMaquina();
  m.datoMision(5001, { name: 'Una u otra', requiredLevel: 1, preQuestSingle: [788, 789], zoneOrSort: 363 });
  m.ponerGuia(guiaDePrueba([{ elementos: [ACEPTAR(5001)] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  let r = reqs(m);
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => x.estado === 'falta'));
  m.estadoMision(789, { entregada: true });
  r = reqs(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].clave, 'mision:789');
  assert.equal(r[0].estado, 'ok');
  sinErrores(m);
});

test('GetNumGroupMembers del banco: 0 solo y el tamaño del grupo', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('GetNumGroupMembers()'), 0);
  m.jugador({ grupo: 5 });
  assert.equal(m.lua('GetNumGroupMembers()'), 5);
});
