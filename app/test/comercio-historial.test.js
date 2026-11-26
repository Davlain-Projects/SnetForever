import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { crearHistorial, MIN_PARES } from '../src/comercio/historial.mjs';
import { construirComercio, enVivoDe } from '../src/comercio/ia.mjs';

const H = 3600;
const T0 = 1_700_000_000;
const sub = (id, item, cantidad, precio, tiempo = 'LONG') => ({ id, item, cantidad, precio, tiempo });
const nuevo = () => {
  const carpeta = fs.mkdtempSync(join(os.tmpdir(), 'snf-hist-'));
  return { carpeta, h: crearHistorial({ fs, carpeta: join(carpeta, 'comercio') }) };
};

// T1b: `precio` es la compra mínima y `valor` el valor de la hora (la media del 30 % de unidades más baratas, sin raros).
// Las pruebas a fondo de los números están en comercio-numeros.test.js.
test('valor de la hora: media del 30 % de unidades más baratas; precio: la más barata', () => {
  const { h } = nuevo();
  // 15 u a 20 y 85 u a 30: el 30 % son 30 unidades -> (15*20 + 15*30) / 30 = 25
  h.anadirFoto(110, T0, [sub(1, 5, 15, 20), sub(2, 5, 85, 30)], []);
  assert.equal(h.resumen(110, 5).valor, 25);
  assert.equal(h.resumen(110, 5).precio, 20);
  assert.equal(h.resumen(110, 5).cantidad, 100);
});

// T1b: lo que sale de la subasta solo se da con un día de fotos seguidas (MIN_PARES). Añade fotos iguales, una por hora,
// hasta tener `pares` pares desde T0.
function hastaUnDia(h, casa, hechas, subastas, mercancias = [], inicio = T0) {
  for (let k = hechas + 1; k <= MIN_PARES; k++) h.anadirFoto(casa, inicio + k * H, subastas, mercancias);
}

test('junta subastas y mercancías', () => {
  const { h } = nuevo();
  h.anadirFoto(110, T0, [sub(1, 5, 1, 100)], [sub(2, 5, 10, 50)]);
  assert.equal(h.resumen(110, 5).subastas, 2);
  assert.equal(h.resumen(110, 5).cantidad, 11);
});

test('lo normal es la mediana de las últimas 72 fotos', () => {
  const { h } = nuevo();
  for (let i = 0; i < 80; i++) h.anadirFoto(110, T0 + i * H, [sub(1, 5, 1, i < 8 ? 1000 : 100 + (i % 3))], []);
  const r = h.resumen(110, 5);
  assert.equal(r.poco, false);
  assert.equal(r.normal, 101); // las 72 últimas: 100, 101 y 102 repetidos
});

test('con menos de 3 fotos: normal = precio y poco', () => {
  const { h } = nuevo();
  h.anadirFoto(110, T0, [sub(1, 5, 1, 100)], []);
  h.anadirFoto(110, T0 + H, [sub(1, 5, 1, 140)], []);
  const r = h.resumen(110, 5);
  assert.equal(r.poco, true);
  assert.equal(r.normal, 140);
});

test('tendencia +25 %', () => {
  const { h } = nuevo();
  for (let i = 0; i < 72; i++) h.anadirFoto(110, T0 + i * H, [sub(1, 5, 1, i < 48 ? 100 : 125)], []);
  assert.ok(Math.abs(h.resumen(110, 5).tendencia - 25) < 1e-9);
});

test('tendencia null si no hay fotos anteriores', () => {
  const { h } = nuevo();
  h.anadirFoto(110, T0, [sub(1, 5, 1, 100)], []);
  assert.equal(h.resumen(110, 5).tendencia, null);
});

test('ritmo: LONG que desaparece salió antes de tiempo, SHORT caducada', () => {
  const { h } = nuevo();
  h.anadirFoto(110, T0, [sub(1, 5, 3, 10, 'LONG'), sub(2, 5, 1, 10, 'SHORT'), sub(3, 5, 1, 10, 'LONG')], []);
  h.anadirFoto(110, T0 + H, [sub(3, 5, 1, 10, 'LONG')], []);
  assert.equal(h.resumen(110, 5).ritmo, null); // con una hora observada aún no se da
  hastaUnDia(h, 110, 1, [sub(3, 5, 1, 10, 'LONG')]);
  const r = h.resumen(110, 5);
  assert.equal(r.ritmo, 0.5);
  assert.ok(Math.abs(r.vendidosDia - 3) < 1e-9); // 3 unidades en un día observado
});

test('un hueco de 2 h no cuenta', () => {
  const { h } = nuevo();
  h.anadirFoto(110, T0, [sub(1, 5, 1, 10, 'LONG'), sub(9, 5, 1, 10)], []);
  h.anadirFoto(110, T0 + 2 * H, [sub(9, 5, 1, 10)], []);
  assert.equal(h.resumen(110, 5).ritmo, null);
});

test('una foto repetida o anterior se ignora', () => {
  const { h } = nuevo();
  assert.equal(h.anadirFoto(110, T0, [sub(1, 5, 1, 10)], []), true);
  assert.equal(h.anadirFoto(110, T0 + 600, [sub(1, 5, 1, 10)], []), false);
  assert.equal(h.anadirFoto(110, T0 - H, [sub(1, 5, 1, 10)], []), false);
});

test('lo que no aparece en 168 horas se olvida; lo normal sigue siendo la mediana de las últimas 72 fotos', () => {
  const { h } = nuevo();
  h.anadirFoto(110, T0, [sub(1, 5, 1, 10), sub(2, 6, 1, 50)], []);
  for (let i = 1; i < 168; i++) h.anadirFoto(110, T0 + i * H, [sub(2, 6, 1, 50 + i)], []);
  assert.equal(h.resumen(110, 5).hora, T0); // a 167 h todavía está
  h.anadirFoto(110, T0 + 168 * H, [sub(2, 6, 1, 50)], []);
  assert.equal(h.resumen(110, 5), null);
  assert.deepEqual([...h.todos(110).keys()], [6]);
  // las 72 últimas del objeto 6: precios 50+96 … 50+167 y 50 -> mediana de 72 valores
  const ultimas = [];
  for (let i = 97; i < 168; i++) ultimas.push(50 + i);
  ultimas.push(50);
  ultimas.sort((a, b) => a - b);
  assert.equal(h.resumen(110, 6).normal, Math.round((ultimas[35] + ultimas[36]) / 2));
});

test('objeto o casa desconocidos dan null; todos devuelve un Map', () => {
  const { h } = nuevo();
  h.anadirFoto(110, T0, [sub(1, 5, 1, 10)], []);
  assert.equal(h.resumen(110, 99), null);
  assert.equal(h.resumen(111, 5), null);
  assert.deepEqual([...h.todos(110).keys()], [5]);
});

test('guardar y cargar devuelve lo mismo, sin fotos crudas', async () => {
  const { carpeta, h } = nuevo();
  for (let i = 0; i < 30; i++) {
    h.anadirFoto(110, T0 + i * H, [sub(1, 5, 2, 10 + i), sub(2 + i, 6, 1, 50, i % 2 ? 'SHORT' : 'LONG')], []);
  }
  await h.guardar(110);
  const otro = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
  otro.cargar(110);
  assert.deepEqual(otro.resumen(110, 5), h.resumen(110, 5));
  assert.deepEqual([...otro.todos(110)], [...h.todos(110)]);
  assert.ok(fs.statSync(join(carpeta, 'comercio', 'historial-110.bin')).size < 10_000);
  assert.equal(fs.existsSync(join(carpeta, 'comercio', 'historial-110.json')), false);
  assert.equal(otro.anadirFoto(110, T0 + 30 * H, [sub(1, 5, 2, 99)], []), true);
});

test('un archivo roto se aparta y se empieza de cero', () => {
  const { carpeta, h } = nuevo();
  fs.mkdirSync(join(carpeta, 'comercio'));
  fs.writeFileSync(join(carpeta, 'comercio', 'historial-110.json'), '{no es json');
  h.cargar(110);
  assert.equal(h.resumen(110, 5), null);
  assert.ok(fs.readdirSync(join(carpeta, 'comercio')).some((n) => n.includes('.roto-')));
});

test('un archivo nuevo roto también se aparta', () => {
  const { carpeta, h } = nuevo();
  fs.mkdirSync(join(carpeta, 'comercio'));
  fs.writeFileSync(join(carpeta, 'comercio', 'historial-110.bin'), 'basura');
  h.cargar(110);
  assert.equal(h.resumen(110, 5), null);
  assert.equal(h.tieneDatos(110), false);
  assert.ok(fs.readdirSync(join(carpeta, 'comercio')).some((n) => n.startsWith('historial-110.bin.roto-')));
});

test('compra parcial de una mercancía: las unidades que faltan cuentan como vendidas', () => {
  const { h } = nuevo();
  h.anadirFoto(110, T0, [], [sub(1, 5, 100, 10), sub(2, 5, 1, 10, 'SHORT')]);
  h.anadirFoto(110, T0 + H, [], [sub(1, 5, 60, 10)]);
  hastaUnDia(h, 110, 1, [], [sub(1, 5, 60, 10)]);
  const r = h.resumen(110, 5);
  assert.equal(r.ritmo, 0); // ninguna subasta entera vendida; una caducada
  assert.ok(Math.abs(r.vendidosDia - 40) < 1e-9); // 40 unidades en un día observado
});

test('el ritmo solo cuenta los últimos 7 días', () => {
  const { h } = nuevo();
  // una venta al principio
  h.anadirFoto(110, T0, [sub(1, 5, 4, 10), sub(9, 5, 1, 10)], []);
  h.anadirFoto(110, T0 + H, [sub(9, 5, 1, 10)], []);
  hastaUnDia(h, 110, 1, [sub(9, 5, 1, 10)]);
  assert.ok(Math.abs(h.resumen(110, 5).vendidosDia - 4) < 1e-9);
  // ocho días después, un día sin ventas: la de antes ya no cuenta
  h.anadirFoto(110, T0 + 193 * H, [sub(9, 5, 1, 10)], []);
  hastaUnDia(h, 110, 0, [sub(9, 5, 1, 10)], [], T0 + 193 * H);
  const r = h.resumen(110, 5);
  assert.equal(r.vendidosDia, 0);
  assert.equal(r.ritmo, null);
});

// El historial de la versión 1 (JSON con una fila por objeto y hora), como lo dejaba la app 0.6.0.
function historialV1() {
  const horas = { 5: [], 7: [[T0 - 100 * H, 500, 1, 1]] };
  for (let i = 0; i < 100; i++) horas[5].push([T0 + i * H, 100 + (i % 7), 3 + i, 2]);
  return {
    version: 1,
    horas,
    ventas: { 5: [[T0 + 98 * H, 2, 1, 6], [T0 + 99 * H, 1, 0, 3]] },
    pares: [T0 + 98 * H, T0 + 99 * H],
    ultima: { 11: [5, 'LONG', 3], 12: [5, 'SHORT', 1] },
    horaUltima: T0 + 99 * H,
  };
}

test('migración: lee el historial viejo sin darlo por roto, empieza de nuevo y lo deja en la cuarentena al guardar', async () => {
  const { carpeta } = nuevo();
  const dir = join(carpeta, 'comercio');
  fs.mkdirSync(dir);
  fs.writeFileSync(join(dir, 'historial-110.json'), JSON.stringify(historialV1()));
  const cuarentena = join(carpeta, 'cuarentena');
  const h = crearHistorial({ fs, carpeta: dir, cuarentena: () => (fs.mkdirSync(cuarentena, { recursive: true }), cuarentena) });
  // T1b: los precios por hora de la app vieja son de otra fórmula y lo que contó como vendido incluía caducadas: nada
  // de eso se arrastra. Hasta la foto siguiente la casa no tiene datos.
  assert.equal(h.resumen(110, 5), null);
  assert.deepEqual([...h.todos(110).keys()], []);
  assert.equal(h.anadirFoto(110, T0 + 99 * H, [sub(11, 5, 3, 100)], []), false, 'la hora de la última foto vieja se respeta');
  // la foto siguiente no se compara con la última vieja (no se sabe cuánto llevaba cada subasta en «medio»)
  assert.equal(h.anadirFoto(110, T0 + 100 * H, [sub(11, 5, 3, 100)], []), true);
  await h.guardar(110);
  assert.equal(fs.existsSync(join(dir, 'historial-110.json')), false);
  assert.ok(fs.existsSync(join(cuarentena, 'historial-110.json')));
  assert.ok(fs.existsSync(join(dir, 'historial-110.bin')));
  const otro = crearHistorial({ fs, carpeta: dir });
  assert.deepEqual(otro.resumen(110, 5), h.resumen(110, 5));
  assert.equal(otro.resumen(110, 5).precio, 100);
});

// Un generador de números fijo, para que la prueba de tamaño sea siempre igual.
function azar(semilla) {
  let s = semilla >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('una semana de muchos objetos ocupa poco en memoria y en disco (caso pesimista a escala)', async () => {
  const v8 = await import('node:v8');
  const vm = await import('node:vm');
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc');
  const N = 1500; // objetos, todos en todas las fotos, con ventas cada hora
  const r = azar(7);
  const { carpeta, h } = nuevo();
  // memoria = montón de JS + lo de los ArrayBuffer (los Float64Array/Uint32Array viven fuera del montón)
  const usado = () => {
    const u = process.memoryUsage();
    return u.heapUsed + u.arrayBuffers;
  };
  gc();
  gc();
  const antes = usado();
  let id = 10_000_000;
  for (let t = 0; t < 168; t++) {
    const lista = [];
    for (let it = 0; it < N; it++) {
      const base = 1000 + it * 37;
      lista.push(sub(it + 1, 100_000 + it, 200 - t, Math.round(base * (0.8 + 0.4 * r()))));
      lista.push(sub(id++, 100_000 + it, 1 + (t % 5), Math.round(base * (0.9 + 0.4 * r()))));
    }
    h.anadirFoto(110, T0 + t * H, lista, []);
  }
  gc();
  gc();
  const memoria = usado() - antes;
  await h.guardar(110);
  const nombre = fs.readdirSync(join(carpeta, 'comercio')).find((n) => n.startsWith('historial-110.'));
  const disco = fs.statSync(join(carpeta, 'comercio', nombre)).size;
  // Meta: < 50 MB de memoria y < 20 MB de archivo con 13.500 objetos -> unos 3.700 y 1.480 bytes por objeto. La memoria
  // del proceso se mueve con la máquina cargada (lo que el recolector aún no ha soltado): margen amplio, que el formato
  // viejo (unos 31.000 bytes por objeto) sigue sin pasar; el nuevo da unos 2.100.
  assert.ok(memoria / N < 8000, `memoria por objeto: ${Math.round(memoria / N)} bytes`);
  assert.ok(disco / N < 1200, `disco por objeto: ${Math.round(disco / N)} bytes`);
  assert.equal(h.todos(110).size, N);
});

// ---------- robustez: archivos ocupados, de otra versión o mal formados; guardados en cola ----------

// Un fs de verdad con algunas funciones cambiadas.
const fsCon = (cambios) => ({ ...fs, ...cambios });
const ocupado = (codigo = 'EBUSY') => Object.assign(new Error(`${codigo}: ocupado`), { code: codigo });

// Un historial con algo guardado en <carpeta>/comercio/historial-110.bin (3 objetos con 5 filas; 3 subastas en la última).
async function guardado() {
  const { carpeta, h } = nuevo();
  const dir = join(carpeta, 'comercio');
  for (let i = 0; i < 5; i++) h.anadirFoto(110, T0 + i * H, [sub(1, 5, 2, 10 + i), sub(2, 6, 1, 50), sub(3, 7, 1, 70)], []);
  await h.guardar(110);
  return { carpeta, dir, h, bin: join(dir, 'historial-110.bin') };
}

// Cambia texto de la cabecera del .bin (mismo largo, para no mover las columnas).
async function tocarCabecera(bin, de, a) {
  const zlib = await import('node:zlib');
  assert.equal(de.length, a.length);
  const crudo = zlib.gunzipSync(fs.readFileSync(bin));
  const largo = crudo.readUInt32LE(4);
  const cabecera = crudo.toString('utf8', 8, 8 + largo);
  assert.ok(cabecera.includes(de), `la cabecera no tiene ${de}: ${cabecera}`);
  crudo.write(cabecera.replace(de, a), 8, 'utf8');
  fs.writeFileSync(bin, zlib.gzipSync(crudo));
}

test('un .bin ocupado (EBUSY/EPERM) no se aparta ni se sobrescribe: se vuelve a leer más tarde', async () => {
  const { dir, bin, h: original } = await guardado();
  const bytes = fs.readFileSync(bin);
  let bloqueado = true;
  const avisos = [];
  const leerConBloqueo = (r, ...x) => {
    if (bloqueado && String(r).endsWith('.bin')) throw ocupado('EPERM');
    return fs.readFileSync(r, ...x);
  };
  const h = crearHistorial({ fs: fsCon({ readFileSync: leerConBloqueo }), carpeta: dir, registrar: (nivel, texto) => avisos.push([nivel, texto]) });
  assert.equal(h.tieneDatos(110), false);
  assert.equal(h.resumen(110, 5), null);
  assert.throws(() => h.anadirFoto(110, T0 + 5 * H, [sub(1, 5, 2, 99)], []), (e) => e.code === 'EPERM');
  await assert.rejects(h.guardar(110), (e) => e.code === 'EPERM');
  assert.deepEqual(fs.readFileSync(bin), bytes); // ni sobrescrito
  assert.ok(!fs.readdirSync(dir).some((n) => n.includes('.roto-'))); // ni apartado
  assert.ok(avisos.some(([n, t]) => n === 'aviso' && t.includes('EPERM')), JSON.stringify(avisos));
  bloqueado = false;
  assert.deepEqual(h.resumen(110, 5), original.resumen(110, 5));
  assert.equal(h.anadirFoto(110, T0 + 5 * H, [sub(1, 5, 2, 99)], []), true);
});

test('un .bin de una versión futura se deja en su sitio, no se sobrescribe y se avisa', async () => {
  const { dir, bin } = await guardado();
  await tocarCabecera(bin, '"version":2', '"version":9');
  const bytes = fs.readFileSync(bin);
  const avisos = [];
  const h = crearHistorial({ fs, carpeta: dir, registrar: (nivel, texto) => avisos.push([nivel, texto]) });
  assert.equal(h.resumen(110, 5), null);
  assert.ok(!fs.readdirSync(dir).some((n) => n.includes('.roto-')));
  assert.ok(avisos.some(([n, t]) => n === 'aviso' && t.includes('versión')), JSON.stringify(avisos));
  // la app sigue con lo nuevo en memoria, pero no pisa el archivo
  assert.equal(h.anadirFoto(110, T0 + 9 * H, [sub(1, 5, 2, 99)], []), true);
  assert.equal(h.resumen(110, 5).precio, 99);
  await h.guardar(110);
  assert.deepEqual(fs.readFileSync(bin), bytes);
});

test('un .bin con columnas que no cuadran (filas contra horas) se trata como roto', async () => {
  const { dir, bin } = await guardado();
  await tocarCabecera(bin, '["horas","f64",15]', '["horas","f64",14]');
  const h = crearHistorial({ fs, carpeta: dir });
  assert.equal(h.resumen(110, 5), null);
  assert.ok(fs.readdirSync(dir).some((n) => n.startsWith('historial-110.bin.roto-')));
});

test('un .bin con la última foto descuadrada (ultimaCorta más corta) se trata como roto', async () => {
  const { dir, bin } = await guardado();
  await tocarCabecera(bin, '["ultimaCorta","u8",3]', '["ultimaCorta","u8",2]');
  const h = crearHistorial({ fs, carpeta: dir });
  assert.equal(h.tieneDatos(110), false);
  assert.ok(fs.readdirSync(dir).some((n) => n.startsWith('historial-110.bin.roto-')));
});

test('si el JSON viejo no se puede mover, se queda en su sitio y no quedan carpetas vacías en la cuarentena', async () => {
  const { carpeta } = nuevo();
  const dir = join(carpeta, 'comercio');
  fs.mkdirSync(dir);
  fs.writeFileSync(join(dir, 'historial-110.json'), JSON.stringify(historialV1()));
  const cuarentena = join(carpeta, 'cuarentena');
  let n = 0;
  const moverConFallo = (a, b) => {
    if (String(a).endsWith('.json')) throw ocupado();
    return fs.renameSync(a, b);
  };
  const nuevaCuarentena = () => {
    const d = join(cuarentena, `sello-${n++}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  const h = crearHistorial({ fs: fsCon({ renameSync: moverConFallo }), carpeta: dir, cuarentena: nuevaCuarentena });
  h.anadirFoto(110, T0 + 100 * H, [sub(11, 5, 3, 100)], []);
  await h.guardar(110);
  assert.ok(fs.existsSync(join(dir, 'historial-110.json')));
  assert.ok(fs.existsSync(join(dir, 'historial-110.bin')));
  assert.equal(n, 0); // ni se ha pedido la carpeta
  assert.equal(fs.existsSync(cuarentena), false);
});

test('si falla el último paso hacia la cuarentena, el JSON vuelve a su sitio y el intento siguiente usa la misma carpeta', async () => {
  const { carpeta } = nuevo();
  const dir = join(carpeta, 'comercio');
  fs.mkdirSync(dir);
  fs.writeFileSync(join(dir, 'historial-110.json'), JSON.stringify(historialV1()));
  const cuarentena = join(carpeta, 'cuarentena');
  let n = 0;
  let falla = true;
  const moverConFallo = (a, b) => {
    if (falla && String(b).startsWith(cuarentena)) throw ocupado('EPERM');
    return fs.renameSync(a, b);
  };
  const nuevaCuarentena = () => {
    const d = join(cuarentena, `sello-${n++}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  const h = crearHistorial({ fs: fsCon({ renameSync: moverConFallo }), carpeta: dir, cuarentena: nuevaCuarentena });
  h.anadirFoto(110, T0 + 100 * H, [sub(11, 5, 3, 100)], []);
  await h.guardar(110);
  assert.ok(fs.existsSync(join(dir, 'historial-110.json')));
  falla = false;
  h.anadirFoto(110, T0 + 101 * H, [sub(11, 5, 3, 100)], []);
  await h.guardar(110);
  assert.equal(n, 1);
  assert.deepEqual(fs.readdirSync(cuarentena), ['sello-0']);
  assert.deepEqual(fs.readdirSync(join(cuarentena, 'sello-0')), ['historial-110.json']);
  assert.equal(fs.existsSync(join(dir, 'historial-110.json')), false);
});

test('si el guardado falla, el JSON viejo se queda en su sitio', async () => {
  const { carpeta } = nuevo();
  const dir = join(carpeta, 'comercio');
  fs.mkdirSync(dir);
  fs.writeFileSync(join(dir, 'historial-110.json'), JSON.stringify(historialV1()));
  const escribirConFallo = (r, ...x) => {
    if (String(r).includes('.bin.tmp-')) throw ocupado('ENOSPC');
    return fs.writeFileSync(r, ...x);
  };
  const h = crearHistorial({ fs: fsCon({ writeFileSync: escribirConFallo }), carpeta: dir, cuarentena: () => assert.fail('no debe mover nada') });
  h.anadirFoto(110, T0 + 100 * H, [sub(11, 5, 3, 100)], []);
  await assert.rejects(h.guardar(110), (e) => e.code === 'ENOSPC');
  assert.ok(fs.existsSync(join(dir, 'historial-110.json')));
  assert.equal(fs.existsSync(join(dir, 'historial-110.bin')), false);
});

test('dos guardados seguidos van en cola: el archivo acaba con lo último', async () => {
  const { carpeta } = nuevo();
  const dir = join(carpeta, 'comercio');
  // el primer renombrado tarda; sin cola, el segundo (más nuevo) llegaría antes y el primero lo pisaría
  let llamadas = 0;
  const reintentador = {
    ejecutar: async (f) => {
      if (llamadas++ === 0) await new Promise((r) => setTimeout(r, 80));
      return f();
    },
  };
  const h = crearHistorial({ fs, carpeta: dir, opciones: { reintentador } });
  h.anadirFoto(110, T0, [sub(1, 5, 1, 10)], []);
  const a = h.guardar(110);
  h.anadirFoto(110, T0 + H, [sub(1, 5, 1, 20)], []);
  const b = h.guardar(110);
  await Promise.all([a, b]);
  const otro = crearHistorial({ fs, carpeta: dir });
  assert.equal(otro.resumen(110, 5).precio, 20);
  assert.equal(otro.resumen(110, 5).hora, T0 + H);
});

// ---------- tercera ronda: solo EBUSY/EPERM/EACCES es «ocupado»; restos .viejo ----------

test('ocupada(casa) dice el código mientras el .bin está ocupado y null cuando ya se puede leer', async () => {
  const { dir } = await guardado();
  let bloqueado = true;
  const leerConBloqueo = (r, ...x) => {
    if (bloqueado && String(r).endsWith('historial-110.bin')) throw ocupado('EBUSY');
    return fs.readFileSync(r, ...x);
  };
  const h = crearHistorial({ fs: fsCon({ readFileSync: leerConBloqueo }), carpeta: dir });
  assert.equal(h.ocupada(110), 'EBUSY');
  assert.equal(h.ocupada(111), null); // sin archivo: libre
  bloqueado = false;
  assert.equal(h.ocupada(110), null);
  assert.equal(h.tieneDatos(110), true);
});

test('otro error al leer (EISDIR, EIO…) no deja la casa ocupada para siempre: va en memoria, no pisa nada y avisa', async () => {
  const { dir, bin } = await guardado();
  const bytes = fs.readFileSync(bin);
  const avisos = [];
  const leerConFallo = (r, ...x) => {
    if (String(r).endsWith('.bin')) throw ocupado('EIO');
    return fs.readFileSync(r, ...x);
  };
  const h = crearHistorial({ fs: fsCon({ readFileSync: leerConFallo }), carpeta: dir, registrar: (nivel, texto) => avisos.push([nivel, texto]) });
  assert.equal(h.ocupada(110), null);
  assert.equal(h.anadirFoto(110, T0 + 9 * H, [sub(1, 5, 2, 99)], []), true);
  assert.equal(h.resumen(110, 5).precio, 99);
  await h.guardar(110);
  assert.deepEqual(fs.readFileSync(bin), bytes);
  assert.ok(!fs.readdirSync(dir).some((n) => n.includes('.roto-')));
  assert.equal(avisos.filter(([n, t]) => n === 'aviso' && t.includes('EIO')).length, 1, JSON.stringify(avisos));
});

test('un historial-<casa>.json.viejo-<ms> que se quedó en comercio va a la cuarentena con el siguiente guardado bueno', async () => {
  const { carpeta, dir, h: previo } = await guardado();
  fs.writeFileSync(join(dir, 'historial-110.json.viejo-123'), JSON.stringify(historialV1()));
  fs.writeFileSync(join(dir, 'historial-111.json.viejo-456'), '{}'); // de otra casa: con el guardado de esa casa
  const cuarentena = join(carpeta, 'cuarentena');
  let n = 0;
  const nuevaCuarentena = () => {
    const d = join(cuarentena, `sello-${n++}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  const h = crearHistorial({ fs, carpeta: dir, cuarentena: nuevaCuarentena });
  assert.deepEqual(h.resumen(110, 5), previo.resumen(110, 5)); // el .bin manda: el resto no se lee
  await h.guardar(110);
  assert.equal(fs.existsSync(join(dir, 'historial-110.json.viejo-123')), false);
  assert.deepEqual(fs.readdirSync(join(cuarentena, 'sello-0')), ['historial-110.json.viejo-123']);
  assert.ok(fs.existsSync(join(dir, 'historial-111.json.viejo-456')));
});

// ---------- F5: «nadie compra por encima de lo más barato que sigue intacto» (solo mercancías) ----------
//
// Una compra de una mercancía se lleva siempre lo más barato primero. Si entre dos fotos una subasta del mismo objeto sigue
// con el mismo id y la misma cantidad a un precio P*, nadie compró nada por encima de P*: lo que desaparece antes de tiempo
// a más de P* es una cancelación (quien usa TSM cancela y vuelve a publicar más barato) y no cuenta.

test('una mercancía que se cancela y se vuelve a publicar más barata no cuenta como salida: por encima del más barato que sigue intacto, no es venta', () => {
  const { h } = nuevo();
  // 1 (20 u a 100) sigue intacta toda la hora; 2 (50 u a 150) desaparece y vuelve como 3, el mismo lote a 99.
  h.anadirFoto(110, T0, [], [sub(1, 5, 20, 100), sub(2, 5, 50, 150)]);
  const despues = [sub(1, 5, 20, 100), sub(3, 5, 50, 99)];
  h.anadirFoto(110, T0 + H, [], despues);
  hastaUnDia(h, 110, 1, [], despues);
  const r = h.resumen(110, 5);
  assert.equal(r.vendidosDia, 0);
  assert.equal(r.ritmo, null); // ni salidas ni caducadas: no se sabe
  assert.equal(r.mercancia, true);
});

test('lo vendido de la más barata hacia arriba (enteras y a medias) sí cuenta', () => {
  const { h } = nuevo();
  // Se compran 65 u: la 1 y la 2 enteras y 15 de la 3. La 4 (a 200) sigue intacta: P* = 200. La 5 (a 300) desaparece
  // con tiempo de sobra: cancelada. La 6 caduca (le quedaba corto): caducada, como siempre.
  h.anadirFoto(110, T0, [], [
    sub(1, 5, 20, 100), sub(2, 5, 30, 110), sub(3, 5, 40, 120), sub(4, 5, 10, 200), sub(5, 5, 10, 300),
    sub(6, 5, 5, 250, 'SHORT'),
  ]);
  const despues = [sub(3, 5, 25, 120), sub(4, 5, 10, 200)];
  h.anadirFoto(110, T0 + H, [], despues);
  hastaUnDia(h, 110, 1, [], despues);
  const r = h.resumen(110, 5);
  assert.ok(Math.abs(r.vendidosDia - 65) < 1e-9, String(r.vendidosDia)); // 20 + 30 + 15; la 5 no
  assert.ok(Math.abs(r.ritmo - 2 / 3) < 1e-9, String(r.ritmo)); // la 1 y la 2 salen, la 6 caduca; la 5 no cuenta
});

test('lo que desaparece justo al precio del más barato intacto cuenta', () => {
  const { h } = nuevo();
  h.anadirFoto(110, T0, [], [sub(1, 5, 20, 100), sub(2, 5, 30, 100)]);
  h.anadirFoto(110, T0 + H, [], [sub(1, 5, 20, 100)]);
  hastaUnDia(h, 110, 1, [], [sub(1, 5, 20, 100)]);
  assert.ok(Math.abs(h.resumen(110, 5).vendidosDia - 30) < 1e-9);
});

test('sin ninguna subasta intacta en el par, se cuenta como hasta ahora', () => {
  const { h } = nuevo();
  // La 1 baja de 20 a 10 (compra a medias: no está intacta) y la 2 desaparece: sin P*, la 2 cuenta entera.
  h.anadirFoto(110, T0, [], [sub(1, 5, 20, 100), sub(2, 5, 30, 500)]);
  h.anadirFoto(110, T0 + H, [], [sub(1, 5, 10, 100)]);
  hastaUnDia(h, 110, 1, [], [sub(1, 5, 10, 100)]);
  const r = h.resumen(110, 5);
  assert.ok(Math.abs(r.vendidosDia - 40) < 1e-9, String(r.vendidosDia)); // 10 + 30
  assert.equal(r.ritmo, 1);
});

test('la intacta de otro objeto no cuenta: P* es de cada objeto', () => {
  const { h } = nuevo();
  // El objeto 6 sigue intacto a 50, pero eso no dice nada del 5: su subasta a 150 cuenta como antes.
  h.anadirFoto(110, T0, [], [sub(1, 6, 20, 50), sub(2, 5, 30, 150)]);
  h.anadirFoto(110, T0 + H, [], [sub(1, 6, 20, 50)]);
  hastaUnDia(h, 110, 1, [], [sub(1, 6, 20, 50)]);
  assert.ok(Math.abs(h.resumen(110, 5).vendidosDia - 30) < 1e-9);
});

test('un historial sin la columna del precio se lee y su primer par cuenta como antes', async () => {
  const antes = [sub(1, 5, 20, 100), sub(2, 5, 50, 150), sub(4, 5, 40, 160)];
  const despues = [sub(1, 5, 20, 100), sub(3, 5, 50, 99), sub(4, 5, 40, 160)]; // la 2 cancelada y vuelta a publicar
  const luego = [sub(1, 5, 20, 100), sub(3, 5, 50, 99), sub(5, 5, 40, 98)]; // la 4 cancelada y vuelta a publicar
  // Con la columna: guardar y cargar la conserva, y el primer par tras cargar ya no cuenta la cancelación.
  {
    const { carpeta, h } = nuevo();
    h.anadirFoto(110, T0, [], antes);
    await h.guardar(110);
    const otro = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
    otro.cargar(110);
    assert.equal(otro.resumen(110, 5).mercancia, true);
    otro.anadirFoto(110, T0 + H, [], despues);
    hastaUnDia(otro, 110, 1, [], despues);
    assert.equal(otro.resumen(110, 5).vendidosDia, 0);
  }
  // Sin ella (un historial de antes de F5): se lee, el primer par cuenta la 2 entera (como antes) y el siguiente ya no.
  {
    const { carpeta, h } = nuevo();
    h.anadirFoto(110, T0, [], antes);
    await h.guardar(110);
    const bin = join(carpeta, 'comercio', 'historial-110.bin');
    await tocarCabecera(bin, '"ultimaPrecio"', '"ultimaPreciX"');
    await tocarCabecera(bin, '"mercancia"', '"mercanciX"');
    const otro = crearHistorial({ fs, carpeta: join(carpeta, 'comercio') });
    otro.cargar(110);
    assert.ok(otro.resumen(110, 5), 'se lee: no se da por roto');
    assert.ok(!fs.readdirSync(join(carpeta, 'comercio')).some((n) => n.includes('.roto-')));
    otro.anadirFoto(110, T0 + H, [], despues);
    otro.anadirFoto(110, T0 + 2 * H, [], luego);
    hastaUnDia(otro, 110, 2, [], luego);
    const r = otro.resumen(110, 5);
    assert.ok(Math.abs(r.vendidosDia - 50) < 1e-9, String(r.vendidosDia)); // la 2 sí (primer par), la 4 no
    assert.equal(r.mercancia, true); // la foto nueva lo vuelve a saber
  }
});

test('a un objeto suelto no se le aplica', () => {
  const { h } = nuevo();
  // Lo mismo que la mercancía cancelada, pero en subastas de objetos: el comprador elige la subasta, así que la 2 cuenta.
  h.anadirFoto(110, T0, [sub(1, 5, 1, 100), sub(2, 5, 1, 150)], []);
  const despues = [sub(1, 5, 1, 100), sub(3, 5, 1, 99)];
  h.anadirFoto(110, T0 + H, despues, []);
  hastaUnDia(h, 110, 1, despues);
  const r = h.resumen(110, 5);
  assert.ok(Math.abs(r.vendidosDia - 1) < 1e-9, String(r.vendidosDia));
  assert.equal(r.ritmo, 1);
  assert.equal(r.mercancia, false);
});

// La estimación de la investigación (fallos-numeros-2, apartado 2) como prueba de números, con un mercado inventado: unas
// 10500 unidades en lotes de 20 a 200, de 48 h, con ventas de verdad compradas de la más barata hacia arriba. Los que usan
// TSM cancelan si les han rebajado y vuelven a publicar el mismo lote a 1-2 c por debajo del mínimo.
function simularMercado({ ventasDia, pCancelar, parteTSM, horas = 168, semilla = 7 }) {
  let s = semilla >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const tiempoDe = (h) => (h <= 0.5 ? 'SHORT' : h <= 2 ? 'MEDIUM' : h <= 12 ? 'LONG' : 'VERY_LONG');
  let id = 1;
  const subastas = [];
  const lote = () => [20, 40, 60, 100, 200][Math.floor(r() * 5)];
  const nueva = (precio, quedan = 48) => ({ id: id++, qty: lote(), precio, quedan, tsm: r() < parteTSM });
  const total = () => subastas.reduce((n, x) => n + x.qty, 0);
  while (total() < 10500) subastas.push(nueva(179 + Math.floor(r() * 80), 1 + r() * 47));
  const fotos = [];
  let vendidas = 0;
  for (let h = 0; h <= horas; h++) {
    fotos.push(subastas.map((x) => ({ id: x.id, item: 2592, cantidad: x.qty, precio: x.precio, tiempo: tiempoDe(x.quedan) })));
    let quiere = Math.round(ventasDia / 24);
    subastas.sort((a, b) => a.precio - b.precio || a.id - b.id);
    for (const x of subastas) {
      if (quiere <= 0) break;
      const n = Math.min(quiere, x.qty);
      x.qty -= n;
      quiere -= n;
      vendidas += n;
    }
    for (let i = subastas.length - 1; i >= 0; i--) if (subastas[i].qty === 0) subastas.splice(i, 1);
    const minimo = Math.min(...subastas.map((x) => x.precio));
    for (let i = subastas.length - 1; i >= 0; i--) {
      const x = subastas[i];
      if (x.tsm && x.precio > minimo && r() < pCancelar) {
        subastas.splice(i, 1);
        subastas.push({ id: id++, qty: x.qty, precio: Math.max(1, minimo - 1 - Math.floor(r() * 2)), quedan: 48, tsm: true });
      }
    }
    for (let i = subastas.length - 1; i >= 0; i--) {
      subastas[i].quedan -= 1;
      if (subastas[i].quedan <= 0) subastas.splice(i, 1);
    }
    const min2 = Math.min(...subastas.map((x) => x.precio));
    while (total() < 10500) subastas.push(nueva(min2 + Math.floor(r() * 40)));
  }
  return { fotos, vendidasDia: vendidas / (horas / 24) };
}

test('la estimación: con cancelaciones de TSM, las salidas al día de una mercancía quedan cerca de las ventas reales, no 9 veces más', () => {
  const casos = [
    { nombre: 'nadie cancela', ventasDia: 2000, pCancelar: 0, parteTSM: 0 },
    { nombre: '30 % con TSM, cancelan la mitad de las horas', ventasDia: 2000, pCancelar: 0.5, parteTSM: 0.3 },
    { nombre: '50 % con TSM, cancelan cada hora', ventasDia: 2000, pCancelar: 1, parteTSM: 0.5 },
    { nombre: 'ídem con 5000 ventas reales al día', ventasDia: 5000, pCancelar: 1, parteTSM: 0.5 },
  ];
  const ritmos = [];
  for (const c of casos) {
    const { fotos, vendidasDia } = simularMercado(c);
    const { h } = nuevo();
    const t0 = 1_790_000_000 - (1_790_000_000 % H);
    fotos.forEach((f, k) => h.anadirFoto(114, t0 + k * H, [], f));
    const r = h.resumen(114, 2592);
    // un máximo aproximado: cerca de las ventas de verdad (antes eran las ventas más las cancelaciones, de 9 a 26 veces más)
    assert.ok(Math.abs(r.vendidosDia - vendidasDia) / vendidasDia < 0.2, `${c.nombre}: ${r.vendidosDia} contra ${vendidasDia}`);
    ritmos.push(r.ritmo);
  }
  // la parte que sale ya no la suben las cancelaciones (antes 0,84 y 0,95 en los casos con TSM, contra 0,30 sin él)
  for (const x of ritmos.slice(1, 3)) assert.ok(x < 0.5, `ritmo ${x}`);
});

// F9p, ronda 2: un archivo de antes de F5 no trae la columna mercancia y todas sus mercancías se cargan como objetos sueltos.
// Hasta la foto siguiente de esa casa no se sabe cuáles son. El 5 es una mercancía y el 7 un objeto suelto.
const FOTO_F9 = () => ({ sueltos: [sub(10, 7, 1, 500)], mercancias: [sub(1, 5, 20, 100)] });
async function sinColumnaMercancia(casa = 110) {
  const { carpeta, h } = nuevo();
  const { sueltos, mercancias } = FOTO_F9();
  h.anadirFoto(casa, T0, sueltos, mercancias);
  await h.guardar(casa);
  const dir = join(carpeta, 'comercio');
  const bin = join(dir, `historial-${casa}.bin`);
  await tocarCabecera(bin, '"mercancia"', '"mercanciX"');
  return { dir, bin, otro: crearHistorial({ fs, carpeta: dir }) };
}
const aLaIA = (historial, casa = 110) => {
  const op = (id) => ({ id, precio: 50, pct: 50, ritmo: 0.95, fuente: 'app', edad: 60 });
  const c = construirComercio({ historial, catalogo: { ficha: () => null }, casa, inventarioIds: [5, 7],
    enVivo: enVivoDe({ casa, oportunidades: [op(5), op(7)] }) });
  const marcas = (o) => [o.mercancia ?? false, o.mercanciaSinSaber ?? false];
  return {
    objeto: (id) => marcas(c.objetos.find((o) => o.id === id)),
    oportunidad: (id) => marcas(c.enVivo.oportunidades.find((o) => o.id === id)),
  };
};

test('con un historial sin la columna mercancia, sus objetos llegan a la IA con mercanciaSinSaber', async () => {
  const { otro } = await sinColumnaMercancia();
  otro.cargar(110);
  const ia = aLaIA(otro);
  for (const id of [5, 7]) {
    assert.deepEqual(ia.objeto(id), [false, true], `objetos, ${id}`);
    assert.deepEqual(ia.oportunidad(id), [false, true], `oportunidades, ${id}`);
  }
});

test('tras la foto siguiente de esa casa la marca desaparece y mercancia es la real', async () => {
  const { otro } = await sinColumnaMercancia();
  otro.cargar(110);
  const { sueltos, mercancias } = FOTO_F9();
  assert.equal(otro.anadirFoto(110, T0 + 60, sueltos, mercancias), false, 'demasiado pronto: la foto se ignora');
  assert.deepEqual(aLaIA(otro).objeto(5), [false, true], 'una foto ignorada no aclara nada');
  assert.equal(otro.anadirFoto(110, T0 + H, sueltos, mercancias), true);
  const ia = aLaIA(otro);
  assert.deepEqual(ia.objeto(5), [true, false]);
  assert.deepEqual(ia.oportunidad(5), [true, false]);
  assert.deepEqual(ia.objeto(7), [false, false]);
  assert.deepEqual(ia.oportunidad(7), [false, false]);
  assert.equal(otro.resumen(110, 5).mercanciaSinSaber, undefined);
});

test('otra casa con la columna no se ve afectada', async () => {
  const { dir, otro } = await sinColumnaMercancia(110);
  const buena = crearHistorial({ fs, carpeta: dir });
  const { sueltos, mercancias } = FOTO_F9();
  buena.anadirFoto(111, T0, sueltos, mercancias);
  await buena.guardar(111);
  otro.cargar(110);
  otro.cargar(111);
  assert.deepEqual(aLaIA(otro, 110).objeto(5), [false, true]);
  const ia = aLaIA(otro, 111);
  assert.deepEqual(ia.objeto(5), [true, false]);
  assert.deepEqual(ia.oportunidad(5), [true, false]);
  assert.deepEqual(ia.objeto(7), [false, false]);
  assert.deepEqual(ia.oportunidad(7), [false, false]);
});

test('el formato guardado no cambia', async () => {
  const zlib = await import('node:zlib');
  const crudo = (bin) => zlib.gunzipSync(fs.readFileSync(bin));
  const cabecera = (b) => b.toString('utf8', 8, 8 + b.readUInt32LE(4));
  // Sin la columna: lo que se vuelve a guardar lleva las mismas columnas y el mismo tamaño, sin la marca de memoria.
  const { bin, otro } = await sinColumnaMercancia();
  const antes = crudo(bin);
  otro.cargar(110);
  await otro.guardar(110);
  const despues = crudo(bin);
  assert.equal(cabecera(despues), cabecera(antes).replace('"mercanciX"', '"mercancia"'));
  assert.equal(despues.length, antes.length);
  assert.ok(!despues.includes('SinSaber'), 'la marca no se escribe');
  // Con la columna: leer y volver a guardar da exactamente los mismos bytes.
  const { carpeta, h } = nuevo();
  const { sueltos, mercancias } = FOTO_F9();
  h.anadirFoto(110, T0, sueltos, mercancias);
  await h.guardar(110);
  const dir = join(carpeta, 'comercio');
  const ruta = join(dir, 'historial-110.bin');
  const original = crudo(ruta);
  const leido = crearHistorial({ fs, carpeta: dir });
  leido.cargar(110);
  await leido.guardar(110);
  assert.ok(crudo(ruta).equals(original));
});
