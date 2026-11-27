// Tope prudente: en modo operaciones, Sniper y Compras no pagan más que el menor entre el precio de mercado de tu casa
// (snfmercado, Precios.de(item).normal) y el regional (snfregional(), Precios.regional). La fórmula de «Precio máximo» de
// la operación sigue mandando cuando es más baja; sin ninguno de los dos precios manda ella sola. Se apaga con el ajuste
// comercioTopePrudente.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;

// La ranura de precios de la hora: la casa 114 con 2589 (lino) y 2592 (lana) a `normal` de mercado, y, si se pide, el
// precio regional del lino.
function ponerRanura(dir, { normal = 100000, regional } = {}) {
  const i = (H % 8) + 1;
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n`);
  const filas = [2589, 2592].map((item) => `[${item}] = {98000, 400, ${normal}, 0, 0.6, 85, 0}`).join(', ');
  const reg = regional === undefined ? ''
    : `, regional = {[2589] = ${regional}}, regionalInfo = {casas = 3, desde = ${H * 3600 - 7200}, hora = ${H * 3600}}`;
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true${reg}}
`);
}

function maquina(precios) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-tope-prudente-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  if (precios) ponerRanura(dir, precios);
  const m = crearMaquina({ addonsDir: dir, jugador: { nombre: 'Comprador', reino: 'Normal', faccion: 'Horde' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  // Sniper y Compras van con la subasta abierta: Precios.de lee entonces la casa de esa subasta.
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.5);
  m.lua('SnetForever.Escaneo.parar()');
  return m;
}

function operacion(m, formula) {
  m.lua(`local S = SnetForever
    if not S.Operaciones.existe("sniper", "Telas") then assert(S.Operaciones.crear("sniper", "Telas")) end
    assert(S.Operaciones.poner("sniper", "Telas", "precioMaximo", "${formula}"))`);
}

const tope = (m, item = 2589) => m.lua(`return {SnetForever.Operaciones.topeCompra("sniper", "Telas", ${item})}`) || [];

test('fórmula por encima del mercado: recorta al precio de tu casa', () => {
  const m = maquina({ normal: 100000 });
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [100000, 'mercado']);
  sinErrores(m);
});

test('regional más bajo que la casa: recorta al regional', () => {
  const m = maquina({ normal: 100000, regional: 80000 });
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [80000, 'regional']);
  sinErrores(m);
});

test('fórmula por debajo de los dos precios: no cambia', () => {
  const m = maquina({ normal: 100000, regional: 80000 });
  operacion(m, '65000c');
  assert.deepEqual(tope(m), [65000]);
  sinErrores(m);
});

test('solo mercado (sin regional en la ranura): recorta al precio de tu casa', () => {
  const m = maquina({ normal: 90000 });
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [90000, 'mercado']);
  sinErrores(m);
});

test('sin datos de precio: manda la fórmula', () => {
  const m = maquina();
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [200000]);
  sinErrores(m);
});

test('un precio de mercado de 0 no deja el tope en 0', () => {
  const m = maquina({ normal: 0 });
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [200000]);
  sinErrores(m);
});

test('apagado: el tope es la fórmula, como antes', () => {
  const m = maquina({ normal: 100000, regional: 80000 });
  m.lua('SnetForever.Ajustes.set("comercioTopePrudente", false)');
  operacion(m, '200000c');
  assert.deepEqual(tope(m), [200000]);
  sinErrores(m);
});

// La ranura no trae precio regional: la fórmula no da valor y no hay tope, aunque haya precio de mercado.
test('fórmula sin valor: sin tope', () => {
  const m = maquina({ normal: 100000 });
  operacion(m, 'snfregional()');
  assert.deepEqual(tope(m), []);
  sinErrores(m);
});

test('el tope prudente viene encendido', () => {
  const m = maquina();
  assert.equal(m.lua('return SnetForever.Ajustes.get("comercioTopePrudente")'), true);
  sinErrores(m);
});
