// Fase 2 del plan de paridad con TSM: el histórico propio (resumen diario por casa y objeto) separado del valor de
// mercado reciente (`normal`), con cobertura y razón cuando no se da. Qué mide cada número: la cabecera de historial.mjs.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import {
  crearHistorial, DIAS_HISTORICO, MIN_DIAS_HISTORICO, MIN_MUESTRAS_DIA, MAX_DIAS_SIN_DATO,
} from '../src/comercio/historial.mjs';
import { textosPrecios } from '../src/comercio/precios-lua.mjs';

const H = 3600;
const D = 24 * H;
// Medianoche UTC (19675 días): así cada «día» de las pruebas es un día UTC entero.
const T0 = 19675 * D;
const CASA = 110;
const sub = (id, item, cantidad, precio) => ({ id, item, cantidad, precio, tiempo: 'LONG' });
const nuevo = () => {
  const carpeta = fs.mkdtempSync(join(os.tmpdir(), 'snf-historico-'));
  return { carpeta, h: crearHistorial({ fs, carpeta: join(carpeta, 'comercio') }) };
};

// Una foto por hora durante `dias` días desde `desde`, con el objeto 5 al precio que dé `precio(hora)` (null: no está; en
// su lugar va el objeto 9, para que la casa siga teniendo fotos).
let siguienteId = 1;
function fotos(h, casa, desde, dias, precio, porDia = 24) {
  for (let d = 0; d < dias; d++) {
    for (let k = 0; k < porDia; k++) {
      const hora = desde + d * D + k * H;
      const p = precio(hora);
      const lista = p == null ? [sub(siguienteId++, 9, 1, 50)] : [sub(siguienteId++, 5, 1, p)];
      h.anadirFoto(casa, hora, lista, []);
    }
  }
}

const maquinas = [];
afterEach(() => maquinas.splice(0).forEach((m) => m.cerrar()));

test('histórico separado de lo normal: 6 días a 100 y 3 a 200 dan normal 200 e histórico 100', () => {
  const { h } = nuevo();
  fotos(h, CASA, T0, 9, (hora) => (hora < T0 + 6 * D ? 100 : 200));
  const r = h.resumen(CASA, 5);
  assert.equal(r.normal, 200, 'el valor de mercado sigue siendo el de las 72 últimas fotos');
  assert.deepEqual(r.historico, {
    valor: 100, razon: null, dias: 9, muestras: 9 * 24, desde: T0, hasta: T0 + 8 * D,
  });
});

test('histórico: con menos de MIN_DIAS_HISTORICO días no se da y dice por qué', () => {
  const { h } = nuevo();
  fotos(h, CASA, T0, MIN_DIAS_HISTORICO - 1, () => 100);
  const r = h.resumen(CASA, 5);
  assert.equal(r.normal, 100);
  assert.equal(r.historico.valor, null);
  assert.equal(r.historico.razon, 'pocos-dias');
  assert.equal(r.historico.dias, MIN_DIAS_HISTORICO - 1);
});

test('histórico: un día con menos de MIN_MUESTRAS_DIA fotos no cuenta', () => {
  const { h } = nuevo();
  fotos(h, CASA, T0, MIN_DIAS_HISTORICO - 1, () => 100);
  // un quinto día con solo 2 fotos del objeto (el resto de horas la casa sigue con otro objeto)
  fotos(h, CASA, T0 + (MIN_DIAS_HISTORICO - 1) * D, 1, (hora) => (hora < T0 + (MIN_DIAS_HISTORICO - 1) * D + (MIN_MUESTRAS_DIA - 1) * H ? 100 : null));
  assert.equal(h.resumen(CASA, 5).historico.razon, 'pocos-dias');
  assert.equal(h.resumen(CASA, 5).historico.dias, MIN_DIAS_HISTORICO - 1);
});

test('histórico vencido: el objeto falta más de MAX_DIAS_SIN_DATO días mientras la casa sigue con fotos', () => {
  const { h } = nuevo();
  fotos(h, CASA, T0, 6, () => 100);
  fotos(h, CASA, T0 + 6 * D, MAX_DIAS_SIN_DATO, () => null);
  assert.equal(h.resumen(CASA, 5).historico.valor, 100, `con ${MAX_DIAS_SIN_DATO} días sin dato aún vale`);
  fotos(h, CASA, T0 + (6 + MAX_DIAS_SIN_DATO) * D, 1, () => null);
  const r = h.resumen(CASA, 5);
  assert.ok(r, 'sus filas siguen dentro de las 168 h');
  assert.equal(r.historico.valor, null);
  assert.equal(r.historico.razon, 'vencido');
  assert.equal(r.historico.hasta, T0 + 5 * D);
});

test('histórico por casa: cada casa solo usa sus fotos', () => {
  const { h } = nuevo();
  fotos(h, 110, T0, 6, () => 100);
  fotos(h, 114, T0, 6, () => 900);
  assert.equal(h.resumen(110, 5).historico.valor, 100);
  assert.equal(h.resumen(114, 5).historico.valor, 900);
  assert.equal(h.resumen(116, 5), null, 'una casa sin fotos no tiene nada');
});

test('histórico acotado: como mucho DIAS_HISTORICO días por objeto y los viejos salen de la ventana', async () => {
  const { carpeta, h } = nuevo();
  fotos(h, CASA, T0, DIAS_HISTORICO + 10, (hora) => (hora < T0 + 10 * D ? 1000 : 100), 4);
  const r = h.resumen(CASA, 5);
  assert.equal(r.historico.dias, DIAS_HISTORICO);
  assert.equal(r.historico.desde, T0 + 10 * D);
  assert.equal(r.historico.valor, 100, 'los 10 primeros días (a 1000) ya no están');
  await h.guardar(CASA);
  const otro = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
  assert.deepEqual(otro.resumen(CASA, 5), r, 'se guarda y se lee igual');
});

test('histórico: un objeto que deja de venderse conserva sus días y, si vuelve, sigue su histórico', async () => {
  const { carpeta, h } = nuevo();
  fotos(h, CASA, T0, 6, () => 100, 4);
  fotos(h, CASA, T0 + 6 * D, 8, () => null, 4); // 8 días sin el objeto: sus filas (168 h) se van
  assert.equal(h.resumen(CASA, 5), null, 'sin filas no tiene resumen');
  await h.guardar(CASA);
  const otro = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
  fotos(otro, CASA, T0 + 14 * D, 1, () => 300, 4);
  const r = otro.resumen(CASA, 5);
  assert.equal(r.normal, 300);
  assert.equal(r.historico.dias, 7);
  assert.equal(r.historico.valor, 100, 'la mediana de 6 días a 100 y uno a 300');
});

// Quita el resumen diario de un historial guardado: así es un archivo de una app de antes de la fase 2.
function sinDiario(ruta) {
  const buf = gunzipSync(fs.readFileSync(ruta));
  const largo = buf.readUInt32LE(4);
  const meta = JSON.parse(buf.toString('utf8', 8, 8 + largo));
  const alinear = (n) => Math.ceil(n / 8) * 8;
  const ancho = { f64: 8, u32: 4, u8: 1 };
  let pos = alinear(8 + largo);
  const columnas = meta.columnas.map(([nombre, tipo, n]) => {
    const datos = buf.subarray(pos, pos + n * ancho[tipo]);
    pos += alinear(n * ancho[tipo]);
    return { nombre, tipo, n, datos };
  }).filter((c) => !c.nombre.startsWith('dia'));
  delete meta.diario;
  meta.columnas = columnas.map((c) => [c.nombre, c.tipo, c.n]);
  const cabecera = Buffer.from(JSON.stringify(meta));
  const trozos = [Buffer.alloc(alinear(8 + cabecera.length))];
  trozos[0].write('SNFH', 0, 'latin1');
  trozos[0].writeUInt32LE(cabecera.length, 4);
  cabecera.copy(trozos[0], 8);
  for (const c of columnas) {
    const t = Buffer.alloc(alinear(c.datos.length));
    c.datos.copy(t);
    trozos.push(t);
  }
  fs.writeFileSync(ruta, gzipSync(Buffer.concat(trozos)));
}

test('formato anterior (sin resumen diario): se lee, lo normal no cambia y los días se rehacen con sus filas', async () => {
  const { carpeta, h } = nuevo();
  fotos(h, CASA, T0, 9, (hora) => (hora < T0 + 6 * D ? 100 : 200));
  await h.guardar(CASA);
  const ruta = join(carpeta, 'comercio', `historial-${CASA}.bin`);
  sinDiario(ruta);
  const viejo = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
  const r = viejo.resumen(CASA, 5);
  const antes = h.resumen(CASA, 5);
  assert.deepEqual({ ...r, historico: null }, { ...antes, historico: null }, 'todo lo de antes sale igual');
  // Las 72 filas son los 3 últimos días: solo esos se pueden rehacer, y no bastan.
  assert.deepEqual(r.historico, { valor: null, razon: 'pocos-dias', dias: 3, muestras: 72, desde: T0 + 6 * D, hasta: T0 + 8 * D });
  fotos(viejo, CASA, T0 + 9 * D, 2, () => 200);
  assert.equal(viejo.resumen(CASA, 5).historico.valor, 200);
  await viejo.guardar(CASA);
  const json = JSON.parse(gunzipSync(fs.readFileSync(ruta)).toString('utf8', 8, 8 + gunzipSync(fs.readFileSync(ruta)).readUInt32LE(4)));
  assert.equal(json.diario, 1, 'al guardar ya va con el resumen diario');
});

test('resumen diario a medias en disco: el archivo se aparta como roto', async () => {
  const { carpeta, h } = nuevo();
  fotos(h, CASA, T0, 1, () => 100);
  await h.guardar(CASA);
  const ruta = join(carpeta, 'comercio', `historial-${CASA}.bin`);
  const buf = gunzipSync(fs.readFileSync(ruta));
  const largo = buf.readUInt32LE(4);
  const meta = JSON.parse(buf.toString('utf8', 8, 8 + largo));
  meta.columnas = meta.columnas.map((c) => (c[0] === 'diaMuestras' ? ['diaOtra', c[1], c[2]] : c));
  const cabecera = Buffer.from(JSON.stringify(meta));
  const nuevoLargo = Buffer.alloc(4);
  nuevoLargo.writeUInt32LE(cabecera.length);
  // misma longitud de nombre ('diaOtra' tiene 7 letras, 'diaMuestras' 11): se rehace la cabecera con su relleno
  const alinear = (n) => Math.ceil(n / 8) * 8;
  const datos = buf.subarray(alinear(8 + largo));
  const inicio = Buffer.alloc(alinear(8 + cabecera.length));
  inicio.write('SNFH', 0, 'latin1');
  inicio.writeUInt32LE(cabecera.length, 4);
  cabecera.copy(inicio, 8);
  fs.writeFileSync(ruta, gzipSync(Buffer.concat([inicio, datos])));
  const otro = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
  assert.equal(otro.resumen(CASA, 5), null);
  assert.ok(fs.readdirSync(join(carpeta, 'comercio')).some((n) => n.includes('.roto-')));
});

test('puente: el histórico va como campo h de la fila; las posiciones de siempre no cambian', () => {
  const casas = { 114: { 2001: [6589, 35, 6692, 1.2, 0.46, 12.5, 0, 35, 1, 1], 2002: [100, 4, 120, 0, -1, -1, 1, 4, 0] } };
  const historico = {
    114: {
      2001: { valor: 6500, razon: null, dias: 12, muestras: 240, desde: T0, hasta: T0 + 11 * D },
      2002: { valor: null, razon: 'pocos-dias', dias: 2, muestras: 30, desde: T0, hasta: T0 + D },
    },
  };
  const umbralesHistorico = { ventana: 30, minDias: 5, minMuestras: 3, maxDiasSinDato: 3 };
  const textos = textosPrecios({ seq: 5, generado: T0 + 11 * D, region: 'eu', casas, historico, umbralesHistorico });
  const m = crearMaquina({ arrancar: false });
  maquinas.push(m);
  m._banco('permitirNil', 'SNF_PRECIOS');
  for (const t of textos) m.lua(t);
  assert.equal(m.lua('return #SNF_PRECIOS.casas[114][2001]'), 10, 'un addon de antes ve la fila de siempre');
  assert.equal(m.lua('return SNF_PRECIOS.casas[114][2001][3]'), 6692);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[114][2001].h'), [6500, 12, 240, 19675, 19686, 0]);
  assert.deepEqual(m.lua('return SNF_PRECIOS.casas[114][2002].h'), [-1, 2, 30, 19675, 19676, 1]);
  assert.deepEqual(m.lua('return SNF_PRECIOS.historico'), { v: 1, ventana: 30, minDias: 5, minMuestras: 3, maxDiasSinDato: 3 });
  // sin histórico (una app de antes, o quien no lo pase) nada cambia
  const m2 = crearMaquina({ arrancar: false });
  maquinas.push(m2);
  m2._banco('permitirNil', 'SNF_PRECIOS');
  for (const t of textosPrecios({ seq: 5, generado: T0, region: 'eu', casas })) m2.lua(t);
  assert.equal(m2.lua('return SNF_PRECIOS.historico'), undefined);
  assert.equal(m2.lua('return SNF_PRECIOS.casas[114][2001].h'), undefined);
  assert.throws(() => textosPrecios({ seq: 5, generado: T0, region: 'eu', casas, historico: { 114: { 2001: { razon: 'rara', dias: 0, muestras: 0 } } }, umbralesHistorico }), { code: 'LUA_TIPO' });
});

test('puente: si el histórico no cabe se quita antes que una casa y p1 lo dice', () => {
  const casas = {};
  const historico = {};
  for (const c of [110, 114, 116]) {
    casas[c] = {};
    historico[c] = {};
    for (let i = 1; i <= 15000; i++) {
      casas[c][100000 + i] = [c * 100000 + i * 7, i, i * 3, i % 9, i % 2 ? i : -1, i % 3 ? i : -1, i % 5 ? 0 : 1, i % 40, 1];
      historico[c][100000 + i] = { valor: 1000000 + i * 13, razon: null, dias: 30, muestras: 700, desde: T0, hasta: T0 + 29 * D };
    }
  }
  const umbralesHistorico = { ventana: 30, minDias: 5, minMuestras: 3, maxDiasSinDato: 3 };
  const textos = textosPrecios({ seq: 5, generado: T0, region: 'eu', casas, historico, umbralesHistorico });
  const m = crearMaquina({ arrancar: false });
  maquinas.push(m);
  m._banco('permitirNil', 'SNF_PRECIOS');
  for (const t of textos) m.lua(t);
  assert.deepEqual(m.lua('return SNF_PRECIOS.historico'), { omitido: true });
  assert.equal(m.lua('return SNF_PRECIOS.casas[116][115000][1]'), 116 * 100000 + 15000 * 7, 'las tres casas siguen');
  assert.equal(m.lua('return SNF_PRECIOS.casas[116][115000].h'), undefined);
});

test('puente: 3 casas de 7000 objetos con histórico caben en la ranura', () => {
  const casas = {};
  const historico = {};
  for (const c of [110, 114, 116]) {
    casas[c] = {};
    historico[c] = {};
    for (let i = 1; i <= 7000; i++) {
      casas[c][1000 + i] = [c * 100000 + i * 7, i, i * 3, i % 9, i % 2 ? 0.5 : -1, i % 3 ? i : -1, i % 5 ? 0 : 1, i % 40, 1];
      historico[c][1000 + i] = { valor: 100000 + i * 11, razon: null, dias: 30, muestras: 600 + (i % 100), desde: T0, hasta: T0 + 29 * D };
    }
  }
  const nombres = {};
  for (let i = 1; i <= 7000; i++) nombres[1000 + i] = `Objeto de prueba ${i}`;
  const textos = textosPrecios({ seq: 5, generado: T0, region: 'eu', casas, historico, nombres, umbralesHistorico: { ventana: 30, minDias: 5, minMuestras: 3, maxDiasSinDato: 3 } });
  const m = crearMaquina({ arrancar: false });
  maquinas.push(m);
  m._banco('permitirNil', 'SNF_PRECIOS');
  for (const t of textos) m.lua(t);
  assert.equal(m.lua('return SNF_PRECIOS.historico.v'), 1, 'el histórico va');
  assert.equal(m.lua('return SNF_PRECIOS.casas[116][8000].h[1]'), 100000 + 7000 * 11);
  assert.equal(m.lua('return SNF_PRECIOS.nombres[8000]'), 'Objeto de prueba 7000', 'y los nombres también');
});
