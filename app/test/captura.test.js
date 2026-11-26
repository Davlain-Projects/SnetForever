// Tarea 19 (Ruling F4-27): captura de la mini franja. El ayudante (ayudantes/captura.ps1) la busca en el área de cliente
// de la ventana del juego, envía solo un recorte de ≈440 × 60 px y la app lo decodifica. Las pruebas automáticas NUNCA
// capturan la pantalla real: usan un ayudante falso de Node o el modo -Archivo con BMP escritos aquí.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { sinErrores } from '../../tools/banco-wow/test/ayuda.js';
import { lanzarCaptura, crearLector, aImagen, SCRIPT_CAPTURA, ESPERAS_RELANZAR, POWERSHELL } from '../src/captura.mjs';
import { buscarYDecodificar } from '../src/franja/codec.mjs';
import { pintarCeldas, escribirBmp, aleatorio } from './ayuda/pintar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO = join(AQUI, 'falso-captura', 'captura.mjs');
const WIN = process.platform === 'win32';
// Carpeta fija de las pruebas (los BMP se sobrescriben en cada ejecución).
const CARPETA = join(tmpdir(), 'snf-captura-pruebas');
mkdirSync(CARPETA, { recursive: true });

const m = crearMaquina();
after(() => m.cerrar());

const literalLua = (bytes) => `"${[...bytes].map((b) => `\\${String(b).padStart(3, '0')}`).join('')}"`;
// Celdas que da el Codec de Lua de verdad (el del addon).
function celdasDeLua(id, carga) {
  return m.lua(`(function() local c = SnetForever.Codec.codificar(${id}, ${literalLua(carga)}) return c end)()`);
}

// Carga P1 de una trama: SNF1 US pj US id US parte US total US z US r US c US datos.
function cargaP1({ id = 'a3f1-1', parte = 1, total = 1, texto = 'hola' } = {}) {
  const campos = ['SNF1', 'Tal Cual', id, String(parte), String(total), '0', '1', '0', JSON.stringify({ v: 1, texto })];
  return Buffer.from(campos.join('\x1f'), 'utf8');
}

// Pantalla física (RGBA) de ruido con la franja pintada en celdas de 2 px alineadas a píxeles enteros en (x, y).
function pantalla({ ancho = 2560, alto = 1080, celdas = null, x = 0, y = 0, semilla = 1 } = {}) {
  const azar = aleatorio(semilla);
  const datos = new Uint8Array(ancho * alto * 4);
  for (let p = 0; p < ancho * alto; p++) {
    datos[p * 4] = Math.floor(azar() * 256);
    datos[p * 4 + 1] = Math.floor(azar() * 256);
    datos[p * 4 + 2] = Math.floor(azar() * 256);
    datos[p * 4 + 3] = 255;
  }
  if (celdas) {
    for (let i = 0; i < celdas.length; i++) {
      const cx = x + (i % 200) * 2;
      const cy = y + Math.floor(i / 200) * 2;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const o = ((cy + dy) * ancho + cx + dx) * 4;
          datos[o] = (celdas[i] >> 2) & 1 ? 255 : 0;
          datos[o + 1] = (celdas[i] >> 1) & 1 ? 255 : 0;
          datos[o + 2] = celdas[i] & 1 ? 255 : 0;
        }
      }
    }
  }
  return { ancho, alto, canales: 4, datos };
}

// Recorte (en BGRA, como lo manda el ayudante) de una imagen RGBA: {ancho, alto, x0, y0, canales: 4, bgr: true, datos}.
function recorteBgra(img, x0, y0, ancho, alto) {
  const datos = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const o = ((y0 + y) * img.ancho + x0 + x) * 4;
      const d = (y * ancho + x) * 4;
      datos[d] = img.datos[o + 2];
      datos[d + 1] = img.datos[o + 1];
      datos[d + 2] = img.datos[o];
      datos[d + 3] = 255;
    }
  }
  return { ancho, alto, x0, y0, canales: 4, bgr: true, datos };
}

// ---------- lanzarCaptura con el ayudante falso ----------

// Reloj falso: los temporizadores no corren solos; disparar() lanza el siguiente.
function relojFalso() {
  let t = 1_000_000;
  const pendientes = [];
  return {
    pendientes,
    ahora: () => t,
    avanzar(ms) { t += ms; },
    setTimeout(fn, ms) { const h = { fn, ms }; pendientes.push(h); return h; },
    clearTimeout(h) { const i = pendientes.indexOf(h); if (i >= 0) pendientes.splice(i, 1); },
    disparar() { const h = pendientes.shift(); t += h.ms; h.fn(); return h.ms; },
  };
}

function lanzarFalso(modo, llamadas) {
  return (comando, args, opciones) => {
    llamadas.push({ comando, args, opciones });
    return spawn(process.execPath, [FALSO, ...args], { ...opciones, env: { ...process.env, FALSO_CAPTURA_MODO: modo } });
  };
}

const esperar = (cond, ms = 10_000) => new Promise((resolve, reject) => {
  const fin = Date.now() + ms;
  const mirar = () => {
    if (cond()) return resolve();
    if (Date.now() > fin) return reject(new Error('se acabó el tiempo esperando'));
    setTimeout(mirar, 10);
  };
  mirar();
});

test('aImagen convierte b64 a una Imagen BGRA y rechaza lo que no cuadra', () => {
  const b64 = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString('base64');
  const img = aImagen({ t: 'imagen', ancho: 2, alto: 1, x0: 5, y0: 6, b64 });
  assert.deepEqual({ ...img, datos: [...img.datos] }, { ancho: 2, alto: 1, x0: 5, y0: 6, canales: 4, bgr: true, datos: [1, 2, 3, 4, 5, 6, 7, 8] });
  assert.equal(aImagen({ t: 'imagen', ancho: 3, alto: 1, x0: 0, y0: 0, b64 }), null, 'largo distinto');
  assert.equal(aImagen({ t: 'imagen', ancho: 2, alto: 1, b64 }).x0, 0, 'sin x0/y0 cuentan como 0');
  for (const malo of [{ ancho: -2, alto: 1 }, { ancho: 2.5, alto: 1 }, { ancho: 2, alto: 0 }, { ancho: 5000, alto: 5000 }, { ancho: 2, alto: 1, x0: -1 }, { ancho: 2, alto: 1, b64: 7 }]) {
    assert.equal(aImagen({ t: 'imagen', b64, ...malo }), null, JSON.stringify(malo));
  }
});

test('lanzarCaptura: lanza el ayudante solo para su proceso, oculto, y pasa imagen y estado; si muere, lo vuelve a lanzar a los 2, 5 y 10 s y luego cada 10 s', async () => {
  const llamadas = [];
  const imagenes = [];
  const estados = [];
  const reloj = relojFalso();
  const c = lanzarCaptura({ script: 'C:\\ayudantes\\captura.ps1', alImagen: (i) => imagenes.push(i), alEstado: (e) => estados.push(e), lanzar: lanzarFalso('muere', llamadas), reloj });
  try {
    assert.equal(llamadas.length, 1);
    const { comando, args, opciones } = llamadas[0];
    assert.equal(comando, POWERSHELL);
    assert.match(POWERSHELL, /System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/i);
    assert.deepEqual(args, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\ayudantes\\captura.ps1', '-PadrePid', String(process.pid)]);
    assert.equal(opciones.windowsHide, true);
    await esperar(() => reloj.pendientes.length === 1);
    assert.equal(imagenes.length, 1, 'solo la imagen buena');
    const img = imagenes[0];
    assert.deepEqual([img.ancho, img.alto, img.x0, img.y0, img.canales, img.bgr], [2, 1, 1346, 535, 4, true]);
    assert.deepEqual([...img.datos], [255, 0, 0, 255, 0, 0, 255, 255]);
    assert.equal(estados.length, 1);
    assert.equal(estados[0].exe, 'E:\\wow\\World of Warcraft\\_forever_\\Wow.exe');
    // Ya murió (hay un relanzamiento pendiente): el juego vuelve a «no se sabe» (lote G, ronda 1); el error se queda.
    assert.deepEqual(c.estadoCaptura(), { juego: null, minimizado: false, primerPlano: false, ultimaFranjaMs: reloj.ahora(), error: 'fallo de prueba' });

    const esperas = [];
    for (let k = 0; k < 7; k++) {
      esperas.push(reloj.disparar());
      assert.equal(llamadas.length, k + 2, `relanzado ${k + 1}`);
      await esperar(() => reloj.pendientes.length === 1);
    }
    // Tras 5 relanzamientos fallidos seguidos, cada 60 s (Ruling F4-30).
    assert.deepEqual(esperas, [2000, 5000, 10000, 10000, 10000, 60000, 60000]);
    assert.deepEqual(ESPERAS_RELANZAR, [2000, 5000, 10000]);
    assert.equal(imagenes.length, 8);
  } finally {
    c.parar();
  }
  assert.equal(reloj.pendientes.length, 0, 'parar() quita el relanzamiento pendiente');
});

test('lanzarCaptura: si el ayudante vivió un minuto, el siguiente relanzamiento vuelve a esperar 2 s', async () => {
  const reloj = relojFalso();
  let vivirUnMinuto = true;
  const lanzar = (comando, args, opciones) => {
    const h = spawn(process.execPath, [FALSO, ...args], { ...opciones, env: { ...process.env, FALSO_CAPTURA_MODO: 'muere' } });
    if (vivirUnMinuto) h.stdout.once('data', () => reloj.avanzar(60_000));
    return h;
  };
  const c = lanzarCaptura({ script: 's.ps1', lanzar, reloj });
  try {
    await esperar(() => reloj.pendientes.length === 1);
    assert.equal(reloj.pendientes[0].ms, 2000);
    reloj.disparar();
    await esperar(() => reloj.pendientes.length === 1);
    assert.equal(reloj.pendientes[0].ms, 2000, 'vivió 60 s: vuelve a empezar por 2 s');
    vivirUnMinuto = false;
    reloj.disparar();
    await esperar(() => reloj.pendientes.length === 1);
    assert.equal(reloj.pendientes[0].ms, 5000, 'este murió enseguida: sigue la cuenta');
    reloj.disparar();
    await esperar(() => reloj.pendientes.length === 1);
    assert.equal(reloj.pendientes[0].ms, 10000);
  } finally {
    c.parar();
  }
});

test('lanzarCaptura: líneas partidas en varios trozos y varias en un trozo; el estado «no» y el minimizado llegan a estadoCaptura', async () => {
  const imagenes = [];
  const estados = [];
  const vistos = [];
  const reloj = relojFalso();
  let c = null;
  const alEstado = (e) => {
    estados.push(e);
    vistos.push(c.estadoCaptura());
  };
  c = lanzarCaptura({ script: 's.ps1', alImagen: (i) => imagenes.push(i), alEstado, lanzar: lanzarFalso('trozos', []), reloj });
  try {
    await esperar(() => reloj.pendientes.length === 1);
    assert.equal(imagenes.length, 1);
    assert.deepEqual(estados.map((e) => e.juego), ['no', 'si']);
    // estadoCaptura ya está al día cuando se avisa por alEstado
    assert.deepEqual(vistos.map((v) => v.juego), [false, true]);
    assert.deepEqual(vistos[1], { juego: true, minimizado: true, primerPlano: false, ultimaFranjaMs: reloj.ahora(), error: null });
    // Lote G, ronda 1 (M2): el ayudante ha muerto (se va a relanzar): ya no se sabe si el juego está abierto.
    assert.deepEqual(c.estadoCaptura(), { juego: null, minimizado: false, primerPlano: false, ultimaFranjaMs: reloj.ahora(), error: null });
  } finally {
    c.parar();
  }
});

test('lanzarCaptura: parar() mata al ayudante (por su PID) y ya no lo vuelve a lanzar; un error de alImagen no rompe la lectura', async () => {
  const llamadas = [];
  const reloj = relojFalso();
  const hijos = [];
  const lanzar = (comando, args, opciones) => {
    llamadas.push(args);
    const h = spawn(process.execPath, [FALSO, ...args], { ...opciones, env: { ...process.env, FALSO_CAPTURA_MODO: 'vive' } });
    hijos.push(h);
    return h;
  };
  let estados = 0;
  const c = lanzarCaptura({ script: 's.ps1', alImagen: () => { throw new Error('fallo del lector'); }, alEstado: () => { estados++; }, lanzar, reloj });
  // El falso «vive» manda otro estado DESPUÉS de la imagen: si llega, el error de alImagen no cortó la lectura.
  await esperar(() => estados === 2);
  assert.equal(c.estadoCaptura().minimizado, true);
  const muerto = new Promise((resolve) => hijos[0].once('exit', resolve));
  c.parar();
  await muerto;
  assert.equal(reloj.pendientes.length, 0);
  assert.equal(llamadas.length, 1);
  assert.equal(c.estadoCaptura().ultimaFranjaMs, reloj.ahora(), 'la imagen llegó aunque alImagen fallara');
});

test('lanzarCaptura: si lanzar falla al momento, se reintenta igual que si muriera', () => {
  const reloj = relojFalso();
  let veces = 0;
  const c = lanzarCaptura({ script: 's.ps1', lanzar: () => { veces++; throw new Error('ENOENT'); }, reloj });
  try {
    assert.equal(veces, 1);
    assert.deepEqual(reloj.pendientes.map((p) => p.ms), [2000]);
    reloj.disparar();
    assert.equal(veces, 2);
    assert.deepEqual(reloj.pendientes.map((p) => p.ms), [5000]);
    assert.deepEqual(c.estadoCaptura(), { juego: null, minimizado: false, primerPlano: false, ultimaFranjaMs: null, error: null });
  } finally {
    c.parar();
  }
});

// ---------- crearLector ----------

test('crearLector: un recorte con la franja da recibirTrama una vez; la misma imagen otra vez, ninguna; otra parte, otra vez', () => {
  const recibidas = [];
  let t = 5000;
  const lector = crearLector({ nucleo: { recibirTrama: (b) => recibidas.push(b) }, ahora: () => t });
  const carga1 = cargaP1({ parte: 1, total: 2 });
  const carga2 = cargaP1({ parte: 2, total: 2, texto: 'adiós' });
  const img1 = { ...pintarCeldas(celdasDeLua(16, carga1), { x0: 8, y0: 8, ancho: 440, alto: 60, fondo: 'ruido', ruido: 30 }), x0: 1346, y0: 535 };
  const img2 = { ...pintarCeldas(celdasDeLua(17, carga2), { x0: 8, y0: 8, ancho: 440, alto: 60, fondo: 'ruido', ruido: 30, semilla: 2 }), x0: 1346, y0: 535 };

  assert.equal(lector.alImagen(img1).nueva, true);
  assert.equal(recibidas.length, 1);
  assert.deepEqual(recibidas[0], carga1);
  t += 100;
  assert.equal(lector.alImagen(img1).nueva, false);
  assert.equal(recibidas.length, 1, 'la misma trama no se pasa otra vez');
  assert.equal(lector.alImagen(img2).nueva, true);
  assert.deepEqual(recibidas[1], carga2);
  // El bucle de partes vuelve a enseñar la 1: no cuenta como nueva.
  t += 300;
  lector.alImagen(img1);
  assert.equal(recibidas.length, 2);
  // La geometría guardada está en coordenadas del cliente.
  assert.deepEqual(lector.geometria(), { x0: 1354, y0: 543, paso: 2 });
  sinErrores(m);
});

test('crearLector: la pista sirve aunque el recorte empiece en otro sitio, y si la franja se mueve la vuelve a buscar', () => {
  const recibidas = [];
  const lector = crearLector({ nucleo: { recibirTrama: (b) => recibidas.push(b) } });
  const carga = cargaP1();
  const celdas = celdasDeLua(40, carga);
  const p = pantalla({ ancho: 900, alto: 300, celdas, x: 354, y: 143, semilla: 3 });
  lector.alImagen(recorteBgra(p, 346, 135, 440, 60));
  assert.equal(recibidas.length, 1);
  // Recorte desplazado (la ventana del chat se movió 5 px): con la pista o sin ella, la decodifica igual.
  const p2 = pantalla({ ancho: 900, alto: 300, celdas: celdasDeLua(41, cargaP1({ id: 'a3f1-2' })), x: 359, y: 150, semilla: 4 });
  const r = lector.alImagen(recorteBgra(p2, 351, 142, 440, 60));
  assert.equal(r.tipo, 'decodificada');
  assert.equal(recibidas.length, 2);
  assert.deepEqual(lector.geometria(), { x0: 359, y0: 150, paso: 2 });
  sinErrores(m);
});

test('crearLector: una trama ya vista vuelve a valer pasados 30 s (otro mensaje tras /reload con el mismo número), ruido no llama', () => {
  const recibidas = [];
  let t = 0;
  const lector = crearLector({ nucleo: { recibirTrama: (b) => recibidas.push(b) }, ahora: () => t });
  const img = { ...pintarCeldas(celdasDeLua(16, cargaP1()), { x0: 8, y0: 8, ancho: 440, alto: 60 }), x0: 0, y0: 0 };
  lector.alImagen(img);
  t += 20_000;
  lector.alImagen(img);
  assert.equal(recibidas.length, 1, 'a los 20 s sigue vista');
  t += 25_000;
  lector.alImagen(img);
  assert.equal(recibidas.length, 1, 'a los 45 s de la primera, pero a 25 s de la última vista: cada vista renueva la marca');
  t += 31_000;
  lector.alImagen(img);
  assert.equal(recibidas.length, 2, '31 s sin verla: vuelve a valer');
  const ruido = { ...pintarCeldas([], { ancho: 440, alto: 60, fondo: 'ruido', semilla: 8 }), x0: 0, y0: 0 };
  assert.equal(lector.alImagen(ruido).tipo, 'nada');
  assert.equal(recibidas.length, 2);
  sinErrores(m);
});

test('crearLector: un nucleo que lanza o devuelve una promesa rechazada no rompe al lector', async () => {
  const lector = crearLector({ nucleo: { recibirTrama: () => Promise.reject(new Error('x')) } });
  const lector2 = crearLector({ nucleo: { recibirTrama: () => { throw new Error('y'); } } });
  const img = { ...pintarCeldas(celdasDeLua(3, cargaP1()), { x0: 8, y0: 8, ancho: 440, alto: 60 }), x0: 0, y0: 0 };
  assert.equal(lector.alImagen(img).nueva, true);
  assert.equal(lector2.alImagen(img).nueva, true);
  await new Promise((r) => setTimeout(r, 20));
  sinErrores(m);
});

// ---------- el ayudante de verdad (solo Windows y solo con -Archivo: nunca captura la pantalla) ----------

function ayudanteArchivo(ruta, ...mas) {
  const t0 = performance.now();
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_CAPTURA, '-Archivo', ruta, ...mas], { encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  const ms = performance.now() - t0;
  const lineas = (r.stdout || '').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, stderr: r.stderr, lineas, ms };
}

test('captura.ps1 -Archivo (solo Windows): franja de «hola» en 2560 × 1080 de ruido → listo y un recorte de 440 × 60 que decodifica la carga', { skip: !WIN }, () => {
  const carga = cargaP1();
  const ruta = join(CARPETA, 'hola.bmp');
  escribirBmp(pantalla({ celdas: celdasDeLua(16, carga), x: 1354, y: 543, semilla: 11 }), ruta);
  const r = ayudanteArchivo(ruta);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lineas[0], { t: 'listo', version: 1 });
  assert.equal(r.lineas.length, 2);
  const msg = r.lineas[1];
  assert.equal(msg.t, 'imagen');
  assert.deepEqual([msg.ancho, msg.alto, msg.x0, msg.y0], [440, 60, 1346, 535]);
  const img = aImagen(msg);
  assert.ok(img, 'la imagen cuadra');
  const d = buscarYDecodificar(img);
  assert.equal(d.tipo, 'decodificada', JSON.stringify(d));
  assert.equal(d.id, 16);
  assert.deepEqual(d.bytes, carga);
  sinErrores(m);
});

test('captura.ps1 -Archivo -Repetir 4 (solo Windows): de la segunda vuelta en adelante la encuentra con la pista y no reenvía el mismo recorte', { skip: !WIN }, () => {
  const carga = cargaP1({ texto: 'pista' });
  const ruta = join(CARPETA, 'pista.bmp');
  escribirBmp(pantalla({ celdas: celdasDeLua(20, carga), x: 1354, y: 543, semilla: 15 }), ruta);
  const r = ayudanteArchivo(ruta, '-Repetir', '4');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lineas.map((l) => l.t), ['listo', 'imagen', 'fin']);
  assert.deepEqual(buscarYDecodificar(aImagen(r.lineas[1])).bytes, carga);
  const fin = r.lineas[2];
  assert.equal(fin.vueltas, 4);
  assert.equal(fin.conPista, 3);
});

test('captura.ps1 -Archivo (solo Windows): un BMP de ruido → listo y nada', { skip: !WIN }, () => {
  const ruta = join(CARPETA, 'ruido.bmp');
  escribirBmp(pantalla({ semilla: 12 }), ruta);
  const r = ayudanteArchivo(ruta);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lineas.map((l) => l.t), ['listo', 'nada']);
});

test('captura.ps1 -Archivo (solo Windows): franja pegada a los bordes → recorte recortado a la imagen, que decodifica', { skip: !WIN }, () => {
  const carga = cargaP1({ texto: 'borde' });
  const ruta = join(CARPETA, 'borde.bmp');
  // Esquina inferior derecha: la franja (400 × 40 en 200 celdas por fila; aquí menos filas) acaba a 2 px del borde.
  const celdas = celdasDeLua(99, carga);
  const filas = Math.ceil(celdas.length / 200);
  const x = 2560 - 402;
  const y = 1080 - filas * 2 - 2;
  escribirBmp(pantalla({ celdas, x, y, semilla: 13 }), ruta);
  const r = ayudanteArchivo(ruta);
  assert.equal(r.status, 0, r.stderr);
  const msg = r.lineas[1];
  assert.equal(msg.t, 'imagen');
  assert.deepEqual([msg.x0, msg.y0, msg.ancho, msg.alto], [x - 8, y - 8, 410, filas * 2 + 10]);
  const d = buscarYDecodificar(aImagen(msg));
  assert.equal(d.tipo, 'decodificada');
  assert.deepEqual(d.bytes, carga);
  // Y en la esquina superior izquierda: el recorte empieza en 0, 0.
  const ruta2 = join(CARPETA, 'esquina.bmp');
  escribirBmp(pantalla({ celdas, x: 3, y: 2, semilla: 14 }), ruta2);
  const r2 = ayudanteArchivo(ruta2);
  const msg2 = r2.lineas[1];
  assert.deepEqual([msg2.t, msg2.x0, msg2.y0, msg2.ancho, msg2.alto], ['imagen', 0, 0, 440, 60]);
  assert.deepEqual(buscarYDecodificar(aImagen(msg2)).bytes, carga);
  sinErrores(m);
});

test('captura.ps1 -Archivo (solo Windows): celdas de 3 px con ruido 100, gamma 1,8 y bordes mezclados → el recorte crece con el paso y decodifica', { skip: !WIN }, () => {
  const carga = cargaP1({ texto: 'hola, con celdas de 3 px y bastante más texto para llenar más de una fila de la franja '.repeat(3) });
  const celdas = celdasDeLua(321, carga);
  const ruta = join(CARPETA, 'paso3.bmp');
  escribirBmp(pintarCeldas(celdas, { paso: 3, x0: 701.4, y0: 300.6, ancho: 1600, alto: 600, ruido: 100, gamma: 1.8, fondo: 'ruido', semilla: 16 }), ruta);
  const r = ayudanteArchivo(ruta);
  assert.equal(r.status, 0, r.stderr);
  const msg = r.lineas[1];
  assert.equal(msg.t, 'imagen');
  // La firma mide el paso en bruto (con bordes mezclados, entre 3 y 3,5): el recorte pasa de 440 × 60 a unos 660-770 × 90-105.
  assert.ok(msg.ancho >= 660 && msg.ancho <= 770 && msg.alto >= 90 && msg.alto <= 105, `${msg.ancho} × ${msg.alto}`);
  const d = buscarYDecodificar(aImagen(msg));
  assert.equal(d.tipo, 'decodificada', JSON.stringify(d));
  assert.deepEqual(d.bytes, carga);
  // Y con celdas de 2 px, el recorte es exactamente de 440 × 60 (lo comprueba la prueba de «hola»).
  sinErrores(m);
});

// El arnés test/falso-captura/primer-plano.ps1: el C# de captura.ps1 con una ventana falsa, una fuente que cuenta las
// copias (lee el BMP, nunca la pantalla) y un reloj falso. «modo»: primerPlano | cambiaDurante | pistaFalsa.
function arnes(modo, bmp, ...mas) {
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(AQUI, 'falso-captura', 'primer-plano.ps1'), '-Script', SCRIPT_CAPTURA, '-Bmp', bmp, '-Modo', modo, ...mas],
    { encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  return { status: r.status, stderr: r.stderr, lineas: (r.stdout || '').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) };
}

// Celdas de una trama de verdad con la cabecera rota: el bit más bajo del segundo byte de la magia (0x46 → 0x47) está en el
// bit alto (rojo) de la celda 5; las cinco primeras celdas (los cinco tramos de color) no cambian, así que la firma la
// da por buena, pero la cabecera no.
function cabeceraRota(celdas) {
  const c = [...celdas];
  c[5] ^= 4;
  return c;
}

// Pinta varias franjas (celdas de 2 px alineadas) sobre la misma pantalla de ruido.
function pantallaConVarias(franjas, { ancho = 2560, alto = 1080, semilla = 1 } = {}) {
  const p = pantalla({ ancho, alto, semilla });
  for (const { celdas, x, y } of franjas) {
    for (let i = 0; i < celdas.length; i++) {
      const cx = x + (i % 200) * 2;
      const cy = y + Math.floor(i / 200) * 2;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const o = ((cy + dy) * ancho + cx + dx) * 4;
          p.datos[o] = (celdas[i] >> 2) & 1 ? 255 : 0;
          p.datos[o + 1] = (celdas[i] >> 1) & 1 ? 255 : 0;
          p.datos[o + 2] = celdas[i] & 1 ? 255 : 0;
        }
      }
    }
  }
  return p;
}

test('captura.ps1 -Archivo (solo Windows): una «magia» con la cabecera rota ENCIMA de la franja real no la tapa: se envía la real', { skip: !WIN }, () => {
  const carga = cargaP1({ texto: 'la de verdad' });
  const falsa = cabeceraRota(celdasDeLua(50, cargaP1({ texto: 'falsa' })));
  const ruta = join(CARPETA, 'cabecera-rota.bmp');
  escribirBmp(pantallaConVarias([{ celdas: falsa, x: 1000, y: 200 }, { celdas: celdasDeLua(51, carga), x: 1354, y: 543 }], { semilla: 18 }), ruta);
  const r = ayudanteArchivo(ruta);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lineas.map((l) => l.t), ['listo', 'imagen']);
  const msg = r.lineas[1];
  assert.deepEqual([msg.x0, msg.y0, msg.ancho, msg.alto], [1346, 535, 440, 60]);
  assert.deepEqual(buscarYDecodificar(aImagen(msg)).bytes, carga);
  sinErrores(m);
});

test('captura.ps1 -Archivo (solo Windows): celdas de 6 px (paso > 3,5) → nada', { skip: !WIN }, () => {
  const ruta = join(CARPETA, 'paso6.bmp');
  escribirBmp(pintarCeldas(celdasDeLua(60, cargaP1()), { paso: 6, x0: 300, y0: 200, ancho: 1600, alto: 600, fondo: 'ruido', semilla: 19 }), ruta);
  const r = ayudanteArchivo(ruta);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lineas.map((l) => l.t), ['listo', 'nada']);
  sinErrores(m);
});

test('captura.ps1, pista fija sobre un falso positivo (solo Windows): a los 2 s una búsqueda completa encuentra la franja real', { skip: !WIN }, () => {
  // El falso positivo tiene la cabecera bien (pasa el filtro del ayudante) pero la suma mal (el JS lo rechaza).
  const falsa = celdasDeLua(70, cargaP1({ texto: 'cabecera buena, suma mala' }));
  falsa[100] ^= 7;
  const carga = cargaP1({ texto: 'la real' });
  const ruta = join(CARPETA, 'pista-falsa.bmp');
  escribirBmp(pantallaConVarias([{ celdas: falsa, x: 200, y: 100 }, { celdas: celdasDeLua(71, carga), x: 1354, y: 543 }], { semilla: 20 }), ruta);
  const { status, stderr, lineas } = arnes('pistaFalsa', ruta, '-FalsoX', '200', '-FalsoY', '100');
  assert.equal(status, 0, stderr);
  // Vueltas a 0, 1 y 2,1 s del reloj falso, con la pista puesta sobre la falsa y la búsqueda completa recién hecha.
  const resumen = lineas.filter((l) => l.t !== 'estado').map((l) => (l.t === 'imagen' ? `imagen:${l.x0}` : `${l.t}:${l.ms}`));
  assert.deepEqual(resumen, ['imagen:192', 'vuelta:0', 'vuelta:1000', 'imagen:1346', 'vuelta:2100']);
  const [img1, img2] = lineas.filter((l) => l.t === 'imagen');
  assert.equal(buscarYDecodificar(aImagen(img1)).tipo, 'rechazada');
  assert.deepEqual(buscarYDecodificar(aImagen(img2)).bytes, carga);
  sinErrores(m);
});

test('captura.ps1, cambio durante la copia (solo Windows): si al terminar la copia el juego ya no está en primer plano, la vuelta no manda nada', { skip: !WIN }, () => {
  const ruta = join(CARPETA, 'primer-plano.bmp');
  escribirBmp(pantalla({ ancho: 1280, alto: 720, celdas: celdasDeLua(31, cargaP1()), x: 600, y: 300, semilla: 21 }), ruta);
  const { status, stderr, lineas } = arnes('cambiaDurante', ruta);
  assert.equal(status, 0, stderr);
  const tipos = lineas.map((l) => l.t);
  assert.ok(!tipos.includes('imagen'), tipos.join(','));
  assert.ok(lineas.find((l) => l.t === 'copias').n > 0, 'sí llegó a copiar');
  sinErrores(m);
});

test('captura.ps1, franja recién perdida (solo Windows): en la gracia de 1 s sin pistas, como mucho una copia completa cada 250 ms', { skip: !WIN }, () => {
  const ruta = join(CARPETA, 'gracia.bmp');
  escribirBmp(pantalla({ ancho: 1280, alto: 720, celdas: celdasDeLua(32, cargaP1()), x: 600, y: 300, semilla: 22 }), ruta);
  const { status, stderr, lineas } = arnes('graciaSinPistas', ruta);
  assert.equal(status, 0, stderr);
  const vueltas = lineas.filter((l) => l.t === 'vuelta');
  assert.equal(vueltas.length, 13);
  // Momentos de las copias completas: la primera, al perder la pista (enseguida); después, separadas 250 ms o más.
  const momentos = vueltas.filter((v, k) => v.completas > (k === 0 ? 0 : vueltas[k - 1].completas)).map((v) => v.ms);
  assert.equal(momentos[0], 0, 'al perder la pista se busca enseguida en todo el cliente');
  for (let k = 1; k < momentos.length; k++) assert.ok(momentos[k] - momentos[k - 1] >= 250, momentos.join(','));
  assert.ok(vueltas.at(-1).completas <= 5, `${vueltas.at(-1).completas} copias completas en 1,2 s`);
  assert.ok(vueltas.at(-1).completas >= 4, 'sigue buscando durante la gracia');
  assert.ok(!lineas.some((l) => l.t === 'imagen'));
  sinErrores(m);
});

// Ruling F4-28: el C# de captura.ps1 compilado con una ventana FALSA y una fuente que cuenta las copias (la imagen sale de un
// BMP, nunca de la pantalla). Fuera de primer plano no se copia ningún píxel ni sale ninguna imagen.
test('captura.ps1, primer plano (solo Windows): con la ventana falsa fuera de primer plano o minimizada no copia ningún píxel ni manda imagen', { skip: !WIN }, () => {
  const carga = cargaP1({ texto: 'primer plano' });
  const ruta = join(CARPETA, 'primer-plano.bmp');
  escribirBmp(pantalla({ ancho: 1280, alto: 720, celdas: celdasDeLua(30, carga), x: 600, y: 300, semilla: 17 }), ruta);
  const { status, stderr, lineas } = arnes('primerPlano', ruta);
  assert.equal(status, 0, stderr);
  const resumen = lineas.map((l) => (l.t === 'estado' ? `estado:${l.minimizado ? 'min' : ''}${l.primerPlano ? 'pp' : 'fuera'}` : l.t === 'copias' ? `copias:${l.n}` : l.t));
  assert.deepEqual(resumen, [
    'estado:fuera', 'copias:0', // 1: fuera de primer plano → estado y ninguna copia
    'copias:0', // 2: igual, sin repetir el estado
    'estado:pp', 'imagen', 'copias:1', // 3: en primer plano → una copia del cliente entero y la imagen
    'estado:fuera', 'copias:1', // 4: otra vez fuera → ninguna copia más
    'estado:minfuera', 'copias:1', // 5: minimizado → nada
    'esPrimerPlano',
  ]);
  const estado = lineas.find((l) => l.t === 'estado');
  assert.deepEqual(estado, { t: 'estado', juego: 'si', exe: 'E:\\wow\\_forever_\\Wow.exe', minimizado: false, primerPlano: false, ancho: 1280, alto: 720 });
  assert.deepEqual(lineas.filter((l) => l.t === 'copias').map((l) => l.espera).filter((e, i) => i !== 2), [250, 250, 250, 250], 'fuera de primer plano vuelve a mirar a los 250 ms');
  const img = lineas.find((l) => l.t === 'imagen');
  // El ruido de justo a la izquierda puede alargar el primer tramo de la magia 1 o 2 px: el recorte empieza entre 590 y 592.
  assert.ok(img.x0 >= 590 && img.x0 <= 592, String(img.x0));
  assert.deepEqual([img.y0, img.ancho, img.alto], [292, 440, 60]);
  assert.deepEqual(buscarYDecodificar(aImagen(img)).bytes, carga);
  assert.deepEqual(lineas.at(-1).casos, [true, true, false, false, false]);
  sinErrores(m);
});

test('captura.ps1 -Archivo (solo Windows): un archivo que no existe → error y salida distinta de 0', { skip: !WIN }, () => {
  const r = ayudanteArchivo(join(CARPETA, 'no-existe.bmp'));
  assert.notEqual(r.status, 0);
  assert.equal(r.lineas[0].t, 'listo');
  assert.equal(r.lineas.at(-1).t, 'error');
});

// ---------- cumplimiento del ayudante ----------

test('captura.ps1 cumple: sin red, sin escribir archivos, sin teclas ni clics ni memoria, y solo mira la ventana Wow de la carpeta', () => {
  assert.ok(existsSync(SCRIPT_CAPTURA), 'falta app/ayudantes/captura.ps1');
  const texto = readFileSync(SCRIPT_CAPTURA, 'utf8');
  const bajo = texto.toLowerCase();
  const prohibidos = [
    // red
    'system.net', 'webrequest', 'webclient', 'httpclient', 'tcpclient', 'udpclient', 'socket', 'invoke-restmethod',
    // escribir o borrar archivos (solo lee el de -Archivo)
    'set-content', 'add-content', 'out-file', 'new-item', 'copy-item', 'move-item', 'rename-item', 'remove-item', 'export-',
    'file.write', 'writeall', 'file.create', 'file.copy', 'file.move', 'file.delete', 'filestream', 'streamwriter', '.save(', 'tee-object',
    // teclas, clics, memoria y ventanas ajenas
    'sendkeys', 'sendinput', 'keybd_event', 'mouse_event', 'postmessage', 'sendmessage', 'readprocessmemory', 'writeprocessmemory',
    'openprocess', 'setforegroundwindow', 'mainmodule', 'getpixel',
  ];
  assert.deepEqual(prohibidos.filter((p) => bajo.includes(p)), []);
  for (const necesario of ['SetProcessDpiAwarenessContext', 'SetProcessDPIAware', 'GetClientRect', 'ClientToScreen', 'IsIconic', 'CopyFromScreen', 'LockBits', 'Marshal.Copy', 'GetForegroundWindow', 'GetAncestor(fg, GA_ROOTOWNER)', 'const uint GA_ROOTOWNER = 3']) {
    assert.ok(texto.includes(necesario), `falta ${necesario}`);
  }
  // captura.mjs tampoco escribe archivos.
  const js = readFileSync(join(AQUI, '..', 'src', 'captura.mjs'), 'utf8');
  assert.ok(!/writeFile|appendFile|createWriteStream|renameSync|mkdirSync|\brename\(/.test(js), 'captura.mjs no escribe archivos');
});
