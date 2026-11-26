// T1b: que los números del comercio sean fiables. Todo lo de aquí es inventado: objetos, precios y subastas.
//   · el valor de mercado no es la subasta más barata, deja fuera los raros y no baila de un día a otro;
//   · lo caducado no cuenta como salido antes de tiempo (antes se contaba como «vendido»);
//   · la parte que sale sin caducar, con su definición;
//   · las subastas y la compra mínima llegan al resumen, y un historial de antes se lee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { crearHistorial, MIN_PARES } from '../src/comercio/historial.mjs';

const H = 3600;
const MIN = 60;
const T0 = 1_700_000_000 - (1_700_000_000 % H); // una hora en punto
const CASA = 114;
const sub = (id, item, cantidad, precio, tiempo = 'LONG') => ({ id, item, cantidad, precio, tiempo });
const nuevo = () => {
  const carpeta = fs.mkdtempSync(join(os.tmpdir(), 'snf-num-'));
  return { carpeta, h: crearHistorial({ fs, carpeta: join(carpeta, 'comercio') }) };
};

// El tiempo que la API diría de una subasta a la que le quedan `s` segundos.
const tiempoDe = (s) => (s < 30 * MIN ? 'SHORT' : s < 2 * H ? 'MEDIUM' : s < 12 * H ? 'LONG' : 'VERY_LONG');

// Un mercado inventado: `subastas` = [{id, item, cantidad, precio, desde, hasta, dura}] («desde» y «hasta» en segundos
// desde T0: cuándo se pone y cuándo deja de estar; «dura» es la duración con la que se puso). Hace una foto cada hora
// durante `horas` y las añade al historial.
function simular(h, subastas, horas, mercancias = []) {
  for (let k = 0; k <= horas; k++) {
    const t = k * H;
    const vivas = (lista) => lista
      .filter((s) => s.desde <= t && t < s.hasta)
      .map((s) => sub(s.id, s.item, typeof s.cantidad === 'function' ? s.cantidad(t) : s.cantidad, s.precio, tiempoDe(s.desde + s.dura - t)));
    h.anadirFoto(CASA, T0 + t, vivas(subastas), vivas(mercancias));
  }
}

// ---------- valor de mercado ----------

test('valor de mercado con poca oferta: no es la compra mínima', () => {
  const { h } = nuevo();
  // una bolsa rara: cuatro subastas de una unidad
  for (let k = 0; k < 30; k++) {
    h.anadirFoto(CASA, T0 + k * H, [sub(1, 7700, 1, 24999), sub(2, 7700, 1, 40000), sub(3, 7700, 1, 42000), sub(4, 7700, 1, 200000)], []);
  }
  const r = h.resumen(CASA, 7700);
  assert.equal(r.precio, 24999, 'la compra mínima es la subasta más barata');
  assert.equal(r.normal, Math.round((24999 + 40000 + 42000) / 3), 'la media de las tres más baratas');
  assert.ok(r.normal > r.precio);
  assert.equal(r.subastas, 4);
  assert.equal(r.cantidad, 4);
});

test('valor de mercado: los raros se quedan fuera (una ganga suelta y una carísima)', () => {
  const { h } = nuevo();
  // una ganga de 1 de cobre delante de tres subastas normales
  h.anadirFoto(CASA, T0, [sub(1, 5, 1, 100), sub(2, 5, 1, 40000), sub(3, 5, 1, 42000), sub(4, 5, 1, 43000)], []);
  assert.equal(h.resumen(CASA, 5).valor, 41000, 'la ganga no entra en la media');
  assert.equal(h.resumen(CASA, 5).precio, 100, 'pero sí es la compra mínima');
  // tres subastas y la tercera carísima
  h.anadirFoto(CASA, T0, [sub(11, 6, 1, 1000), sub(12, 6, 1, 1100), sub(13, 6, 1, 9000)], []);
  const o = nuevo().h;
  o.anadirFoto(CASA, T0, [sub(11, 6, 1, 1000), sub(12, 6, 1, 1100), sub(13, 6, 1, 9000)], []);
  assert.equal(o.resumen(CASA, 6).valor, 1050);
});

test('valor de mercado de una mercancía con mucha oferta: la media del 30 % más barato', () => {
  const { h } = nuevo();
  // 10 u a 20 y 90 u a 30: el tramo son 30 unidades -> (10*20 + 20*30) / 30 = 26,67
  h.anadirFoto(CASA, T0, [], [sub(1, 5, 10, 20), sub(2, 5, 90, 30)]);
  const r = h.resumen(CASA, 5);
  assert.equal(r.valor, 27);
  assert.equal(r.precio, 20);
  assert.equal(r.cantidad, 100);
  assert.equal(r.subastas, 2);
});

test('con una sola subasta el valor es su precio; con dos muy distintas, la barata', () => {
  const { h } = nuevo();
  h.anadirFoto(CASA, T0, [sub(1, 5, 1, 777), sub(2, 6, 1, 100), sub(3, 6, 1, 1000)], []);
  assert.equal(h.resumen(CASA, 5).valor, 777);
  assert.equal(h.resumen(CASA, 6).valor, 100);
});

test('valor de mercado estable entre días: una hora rara no lo mueve y de un día a otro apenas cambia', () => {
  const { h } = nuevo();
  const normales = (k) => [sub(1, 9, 1, 5000 + (k % 5)), sub(2, 9, 1, 5200), sub(3, 9, 1, 5400), sub(4, 9, 1, 6000), sub(5, 9, 1, 6500)];
  const valores = [];
  for (let k = 0; k < 72; k++) {
    let lista = normales(k);
    if (k === 30 || k === 31) lista = [sub(90 + k, 9, 1, 2600), sub(190 + k, 9, 1, 2700), sub(290 + k, 9, 1, 2800), ...lista]; // tres gangas dos horas
    if (k === 50) lista = lista.slice(3); // alguien se lleva lo barato una hora
    h.anadirFoto(CASA, T0 + k * H, lista, []);
    if (k === 23 || k === 47 || k === 71) valores.push(h.resumen(CASA, 9).normal);
  }
  const [dia1, dia2, dia3] = valores;
  assert.ok(Math.abs(dia1 - 5200) <= 5, `día 1: ${dia1}`);
  assert.ok(Math.abs(dia2 - dia1) / dia1 < 0.01, `del día 1 al 2: ${dia1} -> ${dia2}`);
  assert.ok(Math.abs(dia3 - dia2) / dia2 < 0.01, `del día 2 al 3: ${dia2} -> ${dia3}`);
  assert.ok(dia3 > h.resumen(CASA, 9).precio, 'y no es la compra mínima');
});

// ---------- lo que sale de la subasta ----------

test('las caducadas no cuentan como salidas antes de tiempo: subastas de 12 h que nadie compra', () => {
  const { h } = nuevo();
  // una subasta nueva cada 20 minutos durante 3 días; ninguna se vende: todas llegan al final de sus 12 h
  const lista = [];
  for (let n = 0; n < 3 * 24 * 3; n++) lista.push({ id: 1000 + n, item: 2000, cantidad: 1, precio: 6500, desde: n * 20 * MIN + 7 * MIN, hasta: n * 20 * MIN + 7 * MIN + 12 * H, dura: 12 * H });
  simular(h, lista, 72);
  const r = h.resumen(CASA, 2000);
  assert.equal(r.vendidosDia, 0, 'nada salió antes de tiempo');
  assert.equal(r.ritmo, 0, 'todas caducaron');
});

test('la parte que sale sin caducar: antes de tiempo / (antes de tiempo + caducadas)', () => {
  const { h } = nuevo();
  const lista = [];
  // cada hora se ponen cuatro subastas de 12 h: una se va a las 3 h (alguien la compra o la retira) y tres caducan
  for (let n = 0; n < 60; n++) {
    const desde = n * H + 10 * MIN;
    lista.push({ id: 5000 + n, item: 2000, cantidad: 2, precio: 6500, desde, hasta: desde + 3 * H, dura: 12 * H });
    for (let j = 0; j < 3; j++) lista.push({ id: 9000 + n * 3 + j, item: 2000, cantidad: 1, precio: 6600, desde, hasta: desde + 12 * H, dura: 12 * H });
  }
  simular(h, lista, 72);
  const r = h.resumen(CASA, 2000);
  assert.ok(Math.abs(r.ritmo - 0.25) < 0.005, `una de cada cuatro: ${r.ritmo}`);
  // 60 subastas de 2 unidades en 72 horas observadas = 40 unidades al día
  assert.ok(Math.abs(r.vendidosDia - 40) < 0.01, `unidades al día: ${r.vendidosDia}`);
});

test('una subasta retirada por su dueño no se puede distinguir de una vendida: cuenta como salida antes de tiempo', () => {
  const { h } = nuevo();
  const fija = { id: 1, item: 7, cantidad: 1, precio: 10, desde: 0, hasta: 99 * H, dura: 200 * H };
  const retirada = { id: 2, item: 7, cantidad: 5, precio: 10, desde: 0, hasta: 5 * H + 30 * MIN, dura: 48 * H };
  simular(h, [fija, retirada], MIN_PARES);
  const r = h.resumen(CASA, 7);
  assert.equal(r.ritmo, 1);
  assert.equal(r.vendidosDia, 5);
});

test('una subasta en «medio» que se ve por primera vez y desaparece es dudosa: no cuenta en nada', () => {
  const { h } = nuevo();
  const fija = { id: 1, item: 7, cantidad: 1, precio: 10, desde: 0, hasta: 99 * H, dura: 200 * H };
  // puesta con 2 h (o vista tarde): la primera foto ya la ve en medio, y a la siguiente no está
  const dudosa = { id: 2, item: 7, cantidad: 4, precio: 10, desde: 3 * H + 10 * MIN, hasta: 4 * H + 30 * MIN, dura: 100 * MIN };
  simular(h, [fija, dudosa], MIN_PARES);
  const r = h.resumen(CASA, 7);
  assert.equal(r.vendidosDia, 0);
  assert.equal(r.ritmo, null, 'ni salida ni caducada: no hay nada que dividir');
});

test('una subasta que acaba de bajar de largo a medio y desaparece salió antes de tiempo; si repite en medio, caducó', () => {
  const { h } = nuevo();
  const fija = { id: 1, item: 7, cantidad: 1, precio: 10, desde: 0, hasta: 99 * H, dura: 200 * H };
  // le quedan 1 h 40 min en la foto de las 4 h (medio, recién bajada) y a las 5 h ya no está: no pudo caducar
  const antes = { id: 2, item: 7, cantidad: 3, precio: 10, desde: 0, hasta: 4 * H + 30 * MIN, dura: 5 * H + 40 * MIN };
  // esta llega al final: medio a las 7 h (1 h 40), medio a las 8 h (40 min) y a las 9 h no está
  const caduca = { id: 3, item: 7, cantidad: 9, precio: 10, desde: 0, hasta: 8 * H + 40 * MIN, dura: 8 * H + 40 * MIN };
  simular(h, [fija, antes, caduca], MIN_PARES);
  const r = h.resumen(CASA, 7);
  assert.equal(r.ritmo, 0.5, 'una salió antes de tiempo y una caducó');
  assert.equal(r.vendidosDia, 3);
});

test('compra parcial de una mercancía: las unidades que bajan salieron seguro', () => {
  const { h } = nuevo();
  const monton = { id: 1, item: 8, cantidad: (t) => 500 - 10 * Math.floor(t / H), precio: 3, desde: 0, hasta: 99 * H, dura: 200 * H };
  simular(h, [], MIN_PARES, [monton]);
  const r = h.resumen(CASA, 8);
  assert.equal(r.vendidosDia, 240, '10 unidades cada hora');
  assert.equal(r.ritmo, null, 'no ha salido ninguna subasta entera');
});

test('con menos de un día de fotos seguidas no se da lo que sale ni la parte que sale sin caducar', () => {
  const { h } = nuevo();
  const fija = { id: 1, item: 7, cantidad: 1, precio: 10, desde: 0, hasta: 99 * H, dura: 200 * H };
  const sale = { id: 2, item: 7, cantidad: 5, precio: 10, desde: 0, hasta: 2 * H + 30 * MIN, dura: 48 * H };
  simular(h, [fija, sale], MIN_PARES - 1);
  assert.equal(h.resumen(CASA, 7).vendidosDia, null);
  assert.equal(h.resumen(CASA, 7).ritmo, null);
  h.anadirFoto(CASA, T0 + MIN_PARES * H, [sub(1, 7, 1, 10)], []);
  assert.equal(h.resumen(CASA, 7).vendidosDia, 5);
  assert.equal(h.resumen(CASA, 7).ritmo, 1);
});

// ---------- en disco ----------

// Desmonta y vuelve a montar un historial guardado, para dejarlo como lo escribía la app de antes de T1b.
function reescribir(ruta, cambiar) {
  const buf = gunzipSync(fs.readFileSync(ruta));
  const largo = buf.readUInt32LE(4);
  const meta = JSON.parse(buf.toString('utf8', 8, 8 + largo));
  const alinear = (n) => Math.ceil(n / 8) * 8;
  const ancho = { f64: 8, u32: 4, u8: 1 };
  let pos = alinear(8 + largo);
  let columnas = meta.columnas.map(([nombre, tipo, n]) => {
    const datos = buf.subarray(pos, pos + n * ancho[tipo]);
    pos += alinear(n * ancho[tipo]);
    return { nombre, tipo, n, datos };
  });
  columnas = cambiar(meta, columnas) || columnas;
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

test('guardar y cargar conserva la compra mínima, las subastas y lo que sale', async () => {
  const { carpeta, h } = nuevo();
  const fija = { id: 1, item: 7, cantidad: 1, precio: 10, desde: 0, hasta: 99 * H, dura: 200 * H };
  const cara = { id: 3, item: 7, cantidad: 1, precio: 14, desde: 0, hasta: 99 * H, dura: 200 * H };
  const sale = { id: 2, item: 7, cantidad: 5, precio: 12, desde: 0, hasta: 5 * H + 30 * MIN, dura: 48 * H };
  simular(h, [fija, cara, sale], MIN_PARES);
  await h.guardar(CASA);
  const otro = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
  assert.deepEqual(otro.resumen(CASA, 7), h.resumen(CASA, 7));
  assert.equal(otro.resumen(CASA, 7).precio, 10);
  assert.equal(otro.resumen(CASA, 7).subastas, 2);
  assert.equal(otro.resumen(CASA, 7).vendidosDia, 5);
});

// Deja un historial guardado como lo escribía la app de antes de T1b: sin `tiempos`, sin la columna de la compra mínima y
// con los precios de la fórmula vieja (`valorViejo`: casi siempre la subasta más barata).
function envejecer(ruta, valorViejo) {
  reescribir(ruta, (meta, columnas) => {
    delete meta.tiempos;
    delete meta.hueco;
    const precios = columnas.find((c) => c.nombre === 'precios');
    const datos = Buffer.alloc(precios.datos.length);
    for (let i = 0; i < precios.n; i++) datos.writeDoubleLE(valorViejo, i * 8);
    precios.datos = datos;
    return columnas.filter((c) => c.nombre !== 'minimo');
  });
}

test('un historial de antes de T1b: sus precios (fórmula vieja) y lo que contó como «vendido» no se usan; empieza de nuevo', async () => {
  const { carpeta, h } = nuevo();
  const fija = { id: 1, item: 7, cantidad: 1, precio: 10, desde: 0, hasta: 99 * H, dura: 200 * H };
  const sale = { id: 2, item: 7, cantidad: 5, precio: 12, desde: 0, hasta: 5 * H + 30 * MIN, dura: 48 * H };
  simular(h, [fija, sale], MIN_PARES);
  await h.guardar(CASA);
  const ruta = join(carpeta, 'comercio', `historial-${CASA}.bin`);
  envejecer(ruta, 10);
  const viejo = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
  assert.equal(viejo.resumen(CASA, 7), null, 'los precios viejos no valen: hasta la foto siguiente no hay datos');
  assert.equal(viejo.tieneDatos(CASA), false);
  // La primera foto tras leerlo no se compara con la última vieja (no se sabe cuánto llevaba cada subasta en medio).
  viejo.anadirFoto(CASA, T0 + (MIN_PARES + 1) * H, [sub(50, 7, 1, 10)], []);
  assert.equal(viejo.resumen(CASA, 7).precio, 10);
  assert.equal(viejo.resumen(CASA, 7).vendidosDia, null, 'lo que contó la app vieja ya no vale');
  for (let k = 2; k <= MIN_PARES + 1; k++) viejo.anadirFoto(CASA, T0 + (MIN_PARES + k) * H, [sub(50, 7, 1, 10)], []);
  assert.equal(viejo.resumen(CASA, 7).vendidosDia, 0, 'la subasta 1, que ya no estaba, no cuenta como salida');
  await viejo.guardar(CASA);
  const nuevoOtraVez = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
  assert.equal(nuevoOtraVez.resumen(CASA, 7).vendidosDia, 0, 'ya guardado con la forma nueva, lo contado se conserva');
});

test('tras actualizar, con el mercado quieto no sale una tendencia falsa y el valor de mercado no es la compra mínima', async () => {
  const { carpeta, h } = nuevo();
  const mercado = [sub(1, 7700, 1, 24999), sub(2, 7700, 1, 40000), sub(3, 7700, 1, 42000), sub(4, 7700, 1, 200000)];
  for (let k = 0; k < 48; k++) h.anadirFoto(CASA, T0 + k * H, mercado, []);
  await h.guardar(CASA);
  envejecer(join(carpeta, 'comercio', `historial-${CASA}.bin`), 24999); // 48 horas con la fórmula vieja: la más barata
  const app = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
  for (let k = 48; k < 72; k++) {
    app.anadirFoto(CASA, T0 + k * H, mercado, []);
    const r = app.resumen(CASA, 7700);
    assert.equal(r.tendencia, null, `hora ${k}: con 24 fotos nuevas o menos no hay tendencia`);
    assert.equal(r.normal, 35666, `hora ${k}: el valor de mercado es el de la fórmula nueva`);
    assert.ok(r.normal > r.precio);
  }
  app.anadirFoto(CASA, T0 + 72 * H, mercado, []);
  assert.equal(app.resumen(CASA, 7700).tendencia, 0, 'con más de 24 fotos nuevas: el mercado no ha cambiado, 0 %');
});

test('un objeto que ya no está en la última foto no está a la venta: 0 unidades, 0 subastas y enVenta false', () => {
  const { h } = nuevo();
  h.anadirFoto(CASA, T0, [sub(1, 7, 3, 250), sub(2, 8, 1, 90)], []);
  assert.equal(h.resumen(CASA, 7).enVenta, true);
  assert.equal(h.resumen(CASA, 7).cantidad, 3);
  h.anadirFoto(CASA, T0 + H, [sub(2, 8, 1, 90)], []);
  const r = h.resumen(CASA, 7);
  assert.equal(r.enVenta, false);
  assert.equal(r.cantidad, 0);
  assert.equal(r.subastas, 0);
  assert.equal(r.precio, 250, 'la última compra mínima que se vio (ya no hay ninguna a la venta)');
  assert.equal(h.resumen(CASA, 8).enVenta, true);
  h.anadirFoto(CASA, T0 + 2 * H, [sub(2, 8, 1, 90), sub(3, 7, 2, 300)], []);
  assert.equal(h.resumen(CASA, 7).enVenta, true);
  assert.equal(h.resumen(CASA, 7).precio, 300);
});

// Los identificadores de subasta (auctionID). La regla (decisión del coordinador, ronda 1 de T1b): en el addon, nunca; en
// la app, solo los de la última foto, sin nombres, y nunca salen del PC. Esta prueba vigila lo que se guarda y lo que sale.
test('auctionID en la app: en disco solo los de la última foto, sin vendedor ni nombre, y el resumen no los trae', async () => {
  const { carpeta, h } = nuevo();
  h.anadirFoto(CASA, T0, [{ ...sub(900001, 7, 1, 10), vendedor: 'Alguien', nombre: 'Alguien' }, sub(900002, 7, 1, 12)], []);
  h.anadirFoto(CASA, T0 + H, [sub(900002, 7, 1, 12), sub(900003, 8, 2, 30)], [sub(900004, 9, 50, 3)]);
  await h.guardar(CASA);
  let columnas;
  let cabecera;
  reescribir(join(carpeta, 'comercio', `historial-${CASA}.bin`), (meta, cols) => {
    cabecera = JSON.stringify(meta);
    columnas = cols;
  });
  const numeros = (c) => Array.from({ length: c.n }, (_, i) => (c.tipo === 'f64' ? c.datos.readDoubleLE(i * 8) : c.tipo === 'u32' ? c.datos.readUInt32LE(i * 4) : c.datos[i]));
  assert.deepEqual(columnas.map((c) => c.nombre), ['items', 'filas', 'cantidad', 'subastas', 'horas', 'precios', 'conVentas', 'ventas',
    'ultimaIds', 'ultimaItems', 'ultimaCant', 'ultimaCorta', 'minimo', 'ultimaPrecio', 'mercancia'], 'ninguna columna de vendedores ni de nombres');
  // F5: el precio de la última foto, solo de la mercancía (la 900004, a 3); las subastas de objetos sueltos van a 0.
  assert.deepEqual(numeros(columnas.find((c) => c.nombre === 'ultimaPrecio')), [0, 0, 3]);
  assert.deepEqual(numeros(columnas.find((c) => c.nombre === 'ultimaIds')), [900002, 900003, 900004], 'solo la última foto');
  for (const c of columnas) {
    if (c.nombre !== 'ultimaIds') assert.ok(!numeros(c).includes(900001), `el id de una foto anterior no queda en ${c.nombre}`);
  }
  assert.ok(!cabecera.includes('900001') && !cabecera.includes('Alguien'));
  // Lo que sale del historial hacia la IA, TATI y los precios del addon son los resúmenes: sin identificadores.
  const fuera = JSON.stringify([...h.todos(CASA)]);
  for (const id of ['900001', '900002', '900003', '900004', 'Alguien']) assert.ok(!fuera.includes(id), id);
});

// Ronda 3: la regla «largo → medio → desaparece» tiene 10 minutos de margen. Las fotos son cada hora pero no al segundo:
// con el límite en 2 h justas, unos segundos de retraso dejaban fuera casi todas estas salidas.
function largoMedioDesaparece(minutosEntreFotos) {
  const { h } = nuevo();
  const g = minutosEntreFotos * MIN;
  const fija = sub(1, 7, 1, 10, 'VERY_LONG');
  h.anadirFoto(CASA, T0, [fija, sub(2, 7, 4, 10, 'LONG')], []);
  h.anadirFoto(CASA, T0 + g, [fija, sub(2, 7, 4, 10, 'MEDIUM')], []);
  h.anadirFoto(CASA, T0 + 2 * g, [fija], []);
  for (let k = 1; k <= MIN_PARES; k++) h.anadirFoto(CASA, T0 + 2 * g + k * H, [fija], []);
  return h.resumen(CASA, 7);
}

test('largo, medio y desaparece: si las tres fotos caben en menos de 2 h 10 min cuenta como salida antes de tiempo', () => {
  const r = largoMedioDesaparece(64.5); // 2 h 09 min entre la primera y la tercera
  assert.equal(r.ritmo, 1, 'una salida y ninguna caducada');
  assert.ok(r.vendidosDia > 0, `sus 4 unidades cuentan: ${r.vendidosDia}`);
  const justo = largoMedioDesaparece(60); // 2 h justas, como antes
  assert.equal(justo.ritmo, 1);
});

test('largo, medio y desaparece: con 2 h 11 min entre las tres fotos queda dudosa y no cuenta en ninguna de las dos partes', () => {
  const r = largoMedioDesaparece(65.5); // 2 h 11 min
  assert.equal(r.vendidosDia, 0, 'no cuenta como salida');
  assert.equal(r.ritmo, null, 'ni como caducada: no hay nada que dividir');
});
