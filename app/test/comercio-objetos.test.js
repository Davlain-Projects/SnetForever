import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { crearCatalogo, RITMO_RAPIDO } from '../src/comercio/objetos.mjs';

const DIA = 24 * 3600 * 1000;
const ficha = (id, clase = 'Objetos comerciables', subclase = 'Tela') => ({
  id, nombre: `Objeto ${id}`, calidad: 'COMMON', clase, subclase, precioVendedor: 10,
});

function montar({ existentes = [], reloj = { t: 1_700_000_000_000 } } = {}) {
  const carpeta = join(fs.mkdtempSync(join(os.tmpdir(), 'snf-obj-')), 'comercio');
  const pedidos = [];
  const esperas = [];
  const cliente = {
    async objeto(id) {
      pedidos.push(id);
      return existentes.includes(id) ? ficha(id) : null;
    },
  };
  const dormir = async (ms) => { esperas.push(ms); };
  const crear = () => crearCatalogo({ cliente, fs, carpeta, dormir, ahora: () => reloj.t });
  return { carpeta, pedidos, esperas, reloj, crear, cat: crear() };
}

test('completar no pide dos veces el mismo id ni repite un 404 reciente', async () => {
  const { cat, pedidos } = montar({ existentes: [1, 2] });
  await cat.completar([1, 2, 3, 1]);
  assert.deepEqual(pedidos, [1, 2, 3]);
  await cat.completar([1, 2, 3]);
  assert.deepEqual(pedidos, [1, 2, 3]);
  assert.equal(cat.ficha(1).nombre, 'Objeto 1');
  assert.equal(cat.ficha(3), null);
});

test('un 404 se vuelve a probar pasados 7 días, y todo sobrevive a reiniciar', async () => {
  const m = montar({ existentes: [1] });
  await m.cat.completar([1, 9]);
  const otro = m.crear(); // lee del disco
  await otro.completar([1, 9]);
  assert.deepEqual(m.pedidos, [1, 9]);
  m.reloj.t += 7 * DIA + 1;
  await otro.completar([9]);
  assert.deepEqual(m.pedidos, [1, 9, 9]);
});

test('respeta 5 por segundo: espera 200 ms entre peticiones', async () => {
  const { cat, esperas, pedidos } = montar({ existentes: [1, 2, 3, 4] });
  await cat.completar([1, 2, 3, 4]);
  assert.equal(pedidos.length, 4);
  assert.deepEqual(esperas, [200, 200, 200]);
});

test('maxPorRonda limita las peticiones y dice cuántas quedan', async () => {
  const { cat, pedidos } = montar({ existentes: [1, 2, 3, 4, 5] });
  const r = await cat.completar([1, 2, 3, 4, 5], { maxPorRonda: 2 });
  assert.deepEqual(pedidos, [1, 2]);
  assert.equal(r.pendientes, 3);
  await cat.completar([1, 2, 3, 4, 5], { maxPorRonda: 2 });
  assert.deepEqual(pedidos, [1, 2, 3, 4]);
});

test('si la API falla a mitad, lo ya recibido se guarda', async () => {
  const { carpeta, crear } = montar();
  let n = 0;
  const cliente = { async objeto(id) { if (++n === 3) throw new Error('caída'); return ficha(id); } };
  const cat = crearCatalogo({ cliente, fs, carpeta, dormir: async () => {}, ahora: () => 1 });
  await assert.rejects(cat.completar([1, 2, 3, 4]), /caída/);
  assert.equal(crear().ficha(2).id, 2);
});

test('archivo roto: se aparta y se empieza de cero', async () => {
  const { carpeta, crear } = montar();
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(join(carpeta, 'objetos.json'), '{no es json');
  assert.equal(crear().ficha(1), null);
  assert.ok(fs.readdirSync(carpeta).some((f) => f.startsWith('objetos.json.roto-')));
});

const res = (o) => ({ precio: 100, normal: 100, poco: false, ritmo: null, vendidosDia: null, tendencia: null, ...o });

test('grupos automáticos por clase › subclase', async () => {
  const { cat } = montar({ existentes: [1, 2] });
  await cat.completar([1, 2]);
  const g = cat.grupos(new Map()).find((x) => x.nombre.es === 'Objetos comerciables › Tela');
  assert.deepEqual(g.objetos, [1, 2]);
  assert.equal(g.tipo, 'auto');
  assert.equal(g.nombre.en, 'Objetos comerciables › Tela'); // solo hay es_MX
  assert.ok(g.clave);
});

test('rápido (T1b: «Suelen salir sin caducar»): ritmo >= 0,25 por vendidosDia; excluye 0,24', () => {
  const { cat } = montar();
  assert.equal(RITMO_RAPIDO, 0.25);
  const g = cat.grupos(new Map([
    [1, res({ ritmo: 0.24, vendidosDia: 99 })],
    [2, res({ ritmo: 0.25, vendidosDia: 5 })],
    [3, res({ ritmo: 0.9, vendidosDia: 50 })],
    [4, res({ ritmo: null, vendidosDia: null })],
  ])).find((x) => x.clave === 'rapido');
  assert.deepEqual(g.objetos, [3, 2]);
  assert.equal(g.tipo, 'calculado');
  // No se puede saber si lo que sale se vendió o lo retiró su dueño: el nombre no dice «vende».
  assert.deepEqual(g.nombre, { es: 'Suelen salir sin caducar', en: 'Usually leave before expiring' });
});

test('vendidos: los 100 con más vendidosDia', () => {
  const { cat } = montar();
  const m = new Map();
  for (let i = 1; i <= 130; i++) m.set(i, res({ vendidosDia: i }));
  m.set(999, res({ vendidosDia: null }));
  const g = cat.grupos(m).find((x) => x.clave === 'vendidos');
  assert.equal(g.objetos.length, 100);
  assert.deepEqual(g.nombre, { es: 'Los que más salen sin caducar', en: 'Most leaving before expiring' });
  assert.equal(g.objetos[0], 130);
  assert.ok(!g.objetos.includes(30) && !g.objetos.includes(999));
});

test('F5: con el historial de verdad, una mercancía que solo se cancela y se vuelve a publicar no entra en los que más salen; un objeto suelto que sale, sí', async () => {
  const { crearHistorial, MIN_PARES } = await import('../src/comercio/historial.mjs');
  const h = crearHistorial({ fs, carpeta: join(fs.mkdtempSync(join(os.tmpdir(), 'snf-obj-h-')), 'comercio') });
  const s = (id, item, cantidad, precio) => ({ id, item, cantidad, precio, tiempo: 'LONG' });
  const t0 = 1_700_000_000;
  // 5 (mercancía): la 2 se cancela y vuelve como la 3, más barata; la 1 sigue intacta. 6 (suelto): la 11 sale.
  h.anadirFoto(110, t0, [s(10, 6, 1, 500), s(11, 6, 1, 700)], [s(1, 5, 20, 100), s(2, 5, 50, 150)]);
  for (let k = 1; k <= MIN_PARES; k++) h.anadirFoto(110, t0 + k * 3600, [s(10, 6, 1, 500)], [s(1, 5, 20, 100), s(3, 5, 50, 99)]);
  const { cat } = montar();
  const g = cat.grupos(h.todos(110));
  assert.deepEqual(g.find((x) => x.clave === 'vendidos').objetos, [6]);
  assert.deepEqual(g.find((x) => x.clave === 'rapido').objetos, [6]);
});

// F9p: el número de una mercancía puede estar inflado por cancelaciones; las unidades a la venta, no.
test('los grupos Suelen salir y Los que más salen no ordenan las mercancías por vendidosDia', () => {
  const { cat } = montar();
  const merc = (vendidosDia, cantidad) => res({ ritmo: 0.5, vendidosDia, cantidad, mercancia: true });
  const g = cat.grupos(new Map([
    [10, merc(9000, 5)], // la de más «ventas», con pocas unidades
    [11, merc(10, 700)],
    [12, merc(500, 700)], // empate en unidades: manda el id
    [20, res({ ritmo: 0.5, vendidosDia: 300 })],
    [21, res({ ritmo: 0.5, vendidosDia: 800 })],
  ]));
  for (const clave of ['rapido', 'vendidos']) {
    assert.deepEqual(g.find((x) => x.clave === clave).objetos, [21, 20, 11, 12, 10], clave);
  }
});

test('Los que más salen: quién entra en el top no cambia al ordenar las mercancías por unidades', () => {
  const { cat } = montar();
  const m = new Map();
  for (let i = 1; i <= 130; i++) m.set(i, res({ vendidosDia: i, cantidad: 1000 - i, mercancia: i % 2 === 0 }));
  const g = cat.grupos(m).find((x) => x.clave === 'vendidos');
  assert.deepEqual([...g.objetos].sort((a, b) => a - b), Array.from({ length: 100 }, (_, k) => k + 31));
});

test('los objetos sueltos siguen igual en Suelen salir y Los que más salen', () => {
  const { cat } = montar();
  const g = cat.grupos(new Map([
    [1, res({ ritmo: 0.5, vendidosDia: 5, cantidad: 900 })],
    [2, res({ ritmo: 0.5, vendidosDia: 50, cantidad: 1 })],
    [3, res({ ritmo: 0.5, vendidosDia: 50, cantidad: 2 })],
  ]));
  for (const clave of ['rapido', 'vendidos']) assert.deepEqual(g.find((x) => x.clave === clave).objetos, [2, 3, 1], clave);
});

test('barato: precio <= 80 % de lo normal y sin «poco»', () => {
  const { cat } = montar();
  const g = cat.grupos(new Map([
    [1, res({ precio: 80, normal: 100 })],
    [2, res({ precio: 81, normal: 100 })],
    [3, res({ precio: 10, normal: 100, poco: true })],
    [4, res({ precio: 10, normal: 100, enVenta: false })], // T1b: ya no está a la venta: ese precio no existe
  ])).find((x) => x.clave === 'barato');
  assert.deepEqual(g.objetos, [1]);
});

test('si cliente.objeto lanza (fallo temporal), el id NO se apunta como 404 y se vuelve a pedir', async () => {
  const { carpeta, crear } = montar();
  let falla = true;
  const pedidos = [];
  const cliente = {
    async objeto(id) {
      pedidos.push(id);
      if (id === 2 && falla) throw Object.assign(new Error('temporal'), { code: 'TEMPORAL' });
      return ficha(id);
    },
  };
  const cat = crearCatalogo({ cliente, fs, carpeta, dormir: async () => {}, ahora: () => 1 });
  await assert.rejects(cat.completar([1, 2, 3]), { code: 'TEMPORAL' });
  assert.equal(crear().ficha(1).id, 1, 'lo anterior se guardó');
  falla = false;
  const otra = crearCatalogo({ cliente, fs, carpeta, dormir: async () => {}, ahora: () => 2 });
  await otra.completar([1, 2, 3]);
  assert.deepEqual(pedidos, [1, 2, 2, 3], 'el 2 se vuelve a pedir enseguida; no estaba en la memoria de 404');
});
