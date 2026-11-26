// Biblioteca de guías: el índice incremental (solo se rehace lo que cambia). Fixtures inventados en fixtures/biblioteca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync, readdirSync, symlinkSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearBase } from '../src/base/base.mjs';
import { leerArchivoGuia } from '../src/biblioteca/leer.mjs';
import { crearIndice, CARPETA_GUIAS, RUTA_INDICE, MAX_ARCHIVOS } from '../src/biblioteca/indice.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'biblioteca');
const mision = (name) => ({ name, startedBy: [9201], finishedBy: [9201], requiredLevel: 1, questLevel: 1 });
const crear = (version = 't') => crearBase({
  version, esquema: 1,
  quest: { 9101: mision('Lomo de jabalí'), 9102: mision('Colmillos del norte') },
  npc: {}, object: {}, item: {},
  es: { quest: {}, npc: {}, object: {}, item: {} },
  zonas: { area: {}, nombre: { 1413: { en: 'The Barrens', es: 'Los Baldíos' } } },
  mazmorra: {}, porFaccion: {},
});
// Carpeta temporal dentro de SNF_DATOS (que aislar.mjs lleva a una carpeta temporal).
const datosNuevos = () => {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  const datos = mkdtempSync(join(process.env.SNF_DATOS, 'indice-'));
  mkdirSync(join(datos, CARPETA_GUIAS), { recursive: true });
  return datos;
};
const conFixtures = () => {
  const datos = datosNuevos();
  cpSync(FIXTURES, join(datos, CARPETA_GUIAS), { recursive: true });
  return datos;
};
const espia = () => {
  const llamadas = [];
  const leer = (...a) => { llamadas.push(a[0]); return leerArchivoGuia(...a); };
  leer.llamadas = llamadas;
  return leer;
};
const cambiar = (f, texto) => {
  writeFileSync(f, readFileSync(f, 'utf8') + texto);
  const t = new Date(Date.now() + 5000);
  utimesSync(f, t, t);
};
const relativo = (a) => !a.includes('\\') && !/^[a-zA-Z]:|^\//.test(a);

test('constantes', () => {
  assert.equal(CARPETA_GUIAS, 'guias');
  assert.equal(RUTA_INDICE, join('biblioteca', 'indice.json'));
  assert.equal(MAX_ARCHIVOS, 20000);
});

test('indexa los fixtures: zonas, misiones y no leídos', async () => {
  const datos = conFixtures();
  const ind = crearIndice({ datos, fs, base: async () => crear() });
  const r = await ind.actualizar();
  const x = ind.indice();
  assert.equal(x.version, 1);
  assert.equal(x.base, 't');
  assert.equal(x.indexando, false);
  assert.equal(r.guias, x.guias.length);
  assert.equal(r.noLeidos, x.noLeidos.length);
  const bal = x.guias.find((g) => g.archivo === 'baldios.txt');
  assert.ok(bal);
  assert.match(bal.id, /^[0-9a-f]{8}$/);
  assert.ok(bal.zonas.includes(1413));
  assert.ok(bal.misiones.includes(9101));
  assert.ok(bal.pasos > 0);
  const motivos = Object.fromEntries(x.noLeidos.map((n) => [n.archivo, n.motivo]));
  assert.equal(motivos['guia.pdf'], 'pdf');
  assert.equal(motivos['foto.png'], 'imagen');
  for (const g of x.guias) assert.ok(relativo(g.archivo), g.archivo);
  for (const n of x.noLeidos) assert.ok(relativo(n.archivo), n.archivo);
  assert.ok(x.guias.some((g) => g.archivo.startsWith('addon/')));
  assert.ok(Object.keys(x.firmas).includes('baldios.txt'));
});

test('es incremental: sin cambios 0 lecturas, un cambio 1, otra base todas', async () => {
  const datos = conFixtures();
  const leer = espia();
  let base = crear('v1');
  const ind = crearIndice({ datos, fs, base: async () => base, leer });
  await ind.actualizar();
  const total = leer.llamadas.length;
  assert.ok(total >= 6);
  leer.llamadas.length = 0;
  await ind.actualizar();
  assert.equal(leer.llamadas.length, 0);
  cambiar(join(datos, CARPETA_GUIAS, 'baldios.txt'), '\n4. Habla con alguien.\n');
  await ind.actualizar();
  assert.equal(leer.llamadas.length, 1);
  leer.llamadas.length = 0;
  base = crear('v2');
  await ind.actualizar();
  assert.equal(leer.llamadas.length, total);
  assert.equal(ind.indice().base, 'v2');
});

test('las guías del formato addon llevan su clave en el índice, y las partidas «parte»', async () => {
  const datos = conFixtures();
  const ind = crearIndice({ datos, fs, base: async () => crear() });
  await ind.actualizar();
  const x = ind.indice();
  const parte = x.guias.find((g) => g.archivo === 'addon/guias_2.lua');
  assert.ok(parte, 'la guía partida está en el índice');
  assert.equal(parte.clave, 'Pruebas (H)\\10-12 Ruta partida');
  assert.equal(parte.parte, true);
  assert.equal(parte.nombre, '10-12 Ruta partida');
  assert.equal(parte.faccion, 'Horde');
  assert.deepEqual(parte.niveles, [10, 12]);
  assert.deepEqual(parte.misiones, [9102]);
  assert.deepEqual(parte.zonas, [1413]);
  const cabecera = x.guias.find((g) => g.archivo === 'addon/guias_1.lua' && g.k === 0);
  assert.equal(cabecera.clave, 'Pruebas\\misiones');
  assert.equal(cabecera.parte, undefined);
  assert.equal(x.guias.find((g) => g.archivo === 'baldios.txt').clave, undefined);
});

// Ruling R9: la cabecera de una guía partida puede traer `pasos={}` (guias_22.lua y «01-09 Zephras Isle»); sin ella, la
// tarea 10 no podría juntar cabecera y partes.
test('una cabecera del formato addon sin pasos entra en el índice (con su clave); las demás guías vacías no', async () => {
  const datos = conFixtures();
  writeFileSync(join(datos, CARPETA_GUIAS, 'vacia.txt'), '\n');
  writeFileSync(join(datos, CARPETA_GUIAS, 'vacia.lua'), 'SnetForeverMisGuias = {{nombre="Vacía", pasos={}}}\n');
  const ind = crearIndice({ datos, fs, base: async () => crear() });
  await ind.actualizar();
  const x = ind.indice();
  const mismas = x.guias.filter((g) => g.clave === 'Pruebas (H)\\10-12 Ruta partida');
  assert.deepEqual(mismas.map((g) => g.archivo), ['addon/guias_2.lua', 'addon/guias_3.lua'], 'cabecera y parte, en orden de archivo');
  const cabecera = mismas.find((g) => g.archivo === 'addon/guias_3.lua');
  assert.equal(cabecera.pasos, 0);
  assert.equal(cabecera.parte, undefined);
  assert.equal(cabecera.nombre, '10-12 Ruta de prueba partida');
  assert.equal(cabecera.faccion, 'Horde');
  assert.deepEqual(cabecera.niveles, [10, 12]);
  assert.equal(mismas.find((g) => g.archivo === 'addon/guias_2.lua').pasos, 2);
  assert.ok(!x.guias.some((g) => g.archivo === 'vacia.lua'), 'una guía vacía sin clave sigue fuera');
});

// Los arreglos del lector (guías partidas, misiones y zonas por nombre) no se verían en un índice ya guardado: un archivo
// sin cambios se reutiliza. El índice lleva la versión del lector y, si no es la de ahora, se lee todo otra vez.
test('un índice guardado con otra versión del lector se rehace entero', async () => {
  const datos = conFixtures();
  await crearIndice({ datos, fs, base: async () => crear() }).actualizar();
  const ruta = join(datos, RUTA_INDICE);
  const guardado = JSON.parse(readFileSync(ruta, 'utf8'));
  assert.equal(typeof guardado.lector, 'number');
  writeFileSync(ruta, JSON.stringify({ ...guardado, lector: guardado.lector - 1 }));
  const leer = espia();
  const ind = crearIndice({ datos, fs, base: async () => crear(), leer });
  await ind.actualizar();
  assert.equal(leer.llamadas.length, Object.keys(guardado.firmas).length);
  leer.llamadas.length = 0;
  await ind.actualizar();
  assert.equal(leer.llamadas.length, 0, 'y después vuelve a ser incremental');
});

test('un .txt del jugador: la misión por su nombre tras «la mision» y la zona nombrada en un paso entran en el índice', async () => {
  const datos = datosNuevos();
  writeFileSync(join(datos, CARPETA_GUIAS, 'mi-guia.txt'), 'Mis notas\nAcepta la mision La llave de la ciudad en el puesto\nLuego viaja a Los Baldíos\n');
  const b = crearBase({
    version: 't', esquema: 1,
    quest: { 9301: mision('Key to the City') }, npc: {}, object: {}, item: {},
    es: { quest: { 9301: { name: 'La llave de la ciudad' } }, npc: {}, object: {}, item: {} },
    zonas: { area: {}, nombre: { 1413: { en: 'The Barrens', es: 'Los Baldíos' } } },
    mazmorra: {}, porFaccion: {},
  });
  const ind = crearIndice({ datos, fs, base: async () => b });
  await ind.actualizar();
  const g = ind.indice().guias.find((e) => e.archivo === 'mi-guia.txt');
  assert.deepEqual(g.misiones, [9301]);
  assert.deepEqual(g.zonas, [1413]);
});

test('el índice guardado se reutiliza al reiniciar', async () => {
  const datos = conFixtures();
  await crearIndice({ datos, fs, base: async () => crear() }).actualizar();
  const leer = espia();
  const ind2 = crearIndice({ datos, fs, base: async () => crear(), leer });
  assert.ok(ind2.indice().guias.length > 0);
  await ind2.actualizar();
  assert.equal(leer.llamadas.length, 0);
});

test('Review Focus 1: con muchos archivos no bloquea, indexando y cede el turno', async () => {
  const datos = datosNuevos();
  for (let i = 0; i < 300; i++) writeFileSync(join(datos, CARPETA_GUIAS, `g${i}.txt`), `Guía ${i}\n1. Habla con alguien (50, 60)\n`);
  const ind = crearIndice({ datos, fs, base: async () => crear() });
  assert.equal(ind.indice().indexando, false);
  let timerListo = false;
  const timer = new Promise((r) => setTimeout(() => { timerListo = true; r(); }, 0));
  const anterior = ind.indice().guias;
  let acabo = false;
  const p = ind.actualizar().then(() => { acabo = true; });
  assert.equal(ind.indice().indexando, true);
  assert.deepEqual(ind.indice().guias, anterior); // el índice anterior sigue servido
  await timer;
  assert.equal(timerListo, true);
  assert.equal(acabo, false, 'el temporizador se resolvió antes de acabar la indexación');
  await p;
  assert.equal(ind.indice().indexando, false);
  assert.equal(ind.indice().guias.length, 300);
});

test('no recorre enlaces ni nombres que empiezan por punto', async () => {
  const datos = datosNuevos();
  const g = join(datos, CARPETA_GUIAS);
  const guia = 'Guía\n1. Habla con alguien (50, 60)\n';
  writeFileSync(join(g, 'bien.txt'), guia);
  writeFileSync(join(g, '.oculto.txt'), guia);
  mkdirSync(join(g, '.carpeta'));
  writeFileSync(join(g, '.carpeta', 'a.txt'), guia);
  const fuera = mkdtempSync(join(datos, 'fuera-'));
  writeFileSync(join(fuera, 'fuera.txt'), guia);
  try { symlinkSync(fuera, join(g, 'enlace'), 'junction'); } catch { /* sin permiso: se prueba lo demás */ }
  const ind = crearIndice({ datos, fs, base: async () => crear() });
  await ind.actualizar();
  assert.deepEqual(ind.indice().guias.map((x) => x.archivo), ['bien.txt']);
});

test('indice.json se escribe con temporal y renombre, sin dejar restos', async () => {
  const datos = conFixtures();
  const ind = crearIndice({ datos, fs, base: async () => crear() });
  await ind.actualizar();
  await ind.actualizar();
  const ruta = join(datos, RUTA_INDICE);
  const j = JSON.parse(readFileSync(ruta, 'utf8'));
  assert.equal(j.version, 1);
  assert.equal(j.indexando, false);
  assert.deepEqual(readdirSync(dirname(ruta)), ['indice.json']);
});

test('vigilar: dos cambios seguidos dan un solo actualizar; parar cierra', async () => {
  const datos = conFixtures();
  let aviso, cerrado = false, bases = 0;
  const falso = { ...fs, watch: (carpeta, opciones, cb) => { aviso = cb; return { close() { cerrado = true; }, on() {} }; } };
  const ind = crearIndice({ datos, fs: falso, base: async () => { bases++; return crear(); } });
  await ind.actualizar();
  bases = 0;
  const parar = ind.vigilar({ espera: 60, intervalo: 600_000 });
  aviso('change', 'baldios.txt');
  await new Promise((r) => setTimeout(r, 20));
  aviso('change', 'baldios.txt');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(bases, 1);
  parar();
  assert.equal(cerrado, true);
  aviso('change', 'baldios.txt');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(bases, 1);
});

test('cede el turno por tiempo o por bytes, no solo cada 20 archivos', async () => {
  const datos = datosNuevos();
  for (let i = 0; i < 6; i++) writeFileSync(join(datos, CARPETA_GUIAS, `g${i}.txt`), `Guía ${i}\n1. Habla con alguien (50, 60)\n`);
  const casos = {
    lento: (ruta, o) => { const f = Date.now() + 40; while (Date.now() < f); return leerArchivoGuia(ruta, o); },
  };
  let ceded = false;
  const ind = crearIndice({ datos, fs, base: async () => crear(), leer: casos.lento });
  const timer = new Promise((r) => setTimeout(() => { ceded = true; r(); }, 0));
  let pasoFin = false;
  const p = ind.actualizar().then(() => { pasoFin = true; });
  await timer;
  assert.equal(ceded && !pasoFin, true, 'cedió antes de acabar con solo 6 archivos');
  await p;
  // por bytes: archivos que declaran mucho tamaño
  const falso = { ...fs, lstatSync: (r) => { const st = fs.lstatSync(r); return st.isFile() ? Object.assign(Object.create(st), { size: 30 * 1024 * 1024, isFile: () => true }) : st; } };
  const datos2 = datosNuevos();
  for (let i = 0; i < 6; i++) writeFileSync(join(datos2, CARPETA_GUIAS, `g${i}.txt`), `Guía ${i}\n1. Habla con alguien (50, 60)\n`);
  const ind2 = crearIndice({ datos: datos2, fs: falso, base: async () => crear() });
  let cedido2 = false;
  const t2 = new Promise((r) => setTimeout(() => { cedido2 = true; r(); }, 0));
  let fin2 = false;
  const p2 = ind2.actualizar().then(() => { fin2 = true; });
  await t2;
  assert.equal(cedido2 && !fin2, true);
  await p2;
});

test('un actualizar que llega durante otro se repite una sola vez', async () => {
  const datos = conFixtures();
  let bases = 0, suelta;
  const puerta = new Promise((r) => { suelta = r; });
  const ind = crearIndice({ datos, fs, base: async () => { bases++; if (bases === 1) await puerta; return crear(); } });
  const p = ind.actualizar();
  ind.actualizar();
  ind.actualizar();
  ind.actualizar();
  suelta();
  await p;
  assert.equal(bases, 2);
  assert.equal(ind.indice().indexando, false);
  await ind.actualizar();
  assert.equal(bases, 3);
});

test('leidos cuenta las llamadas a leer', async () => {
  const datos = conFixtures();
  const leer = espia();
  const ind = crearIndice({ datos, fs, base: async () => crear(), leer });
  const r = await ind.actualizar();
  assert.equal(r.leidos, leer.llamadas.length);
  assert.equal((await ind.actualizar()).leidos, 0);
});

test('enlaces.txt (la lista de direcciones del jugador) no se indexa, en ninguna carpeta ni con mayúsculas', async () => {
  const datos = datosNuevos();
  const carpeta = join(datos, CARPETA_GUIAS);
  mkdirSync(join(carpeta, 'otra'), { recursive: true });
  writeFileSync(join(carpeta, 'enlaces.txt'), 'https://ejemplo.test/guia\n');
  writeFileSync(join(carpeta, 'otra', 'ENLACES.TXT'), 'https://ejemplo.test/otra\n');
  const leer = espia();
  const ind = crearIndice({ datos, fs, base: async () => crear(), leer });
  await ind.actualizar();
  assert.deepEqual(leer.llamadas, []);
  const x = ind.indice();
  assert.equal(x.guias.length, 0);
  assert.equal(x.noLeidos.length, 0);
  assert.deepEqual(x.firmas, {});
});

// Texto con pasos numerados: si se leyera, saldría como una guía «de texto» (como la LICENSE.txt de una colección).
const PARECE_GUIA = 'Condiciones\n1. Puedes copiar esto.\n2. Puedes cambiarlo.\n3. Sin garantía.\n';
const NO_SON_GUIAS = [
  'Coleccion/LICENSE.txt', 'Coleccion/README.md', 'Otra/README', 'Otra/LICENSE', 'licencia.TXT', 'Leeme.txt',
  'LÉEME.md', 'CREDITOS.txt', 'Créditos.md', 'COPYING', 'license-mit.txt', 'ReadMe_es.md',
];

test('licencias, léemes, créditos y COPYING no son guías: no se leen y van a noLeidos con «no es guía»', async () => {
  const datos = datosNuevos();
  const carpeta = join(datos, CARPETA_GUIAS);
  for (const d of ['Coleccion', 'Otra']) mkdirSync(join(carpeta, d), { recursive: true });
  cpSync(join(FIXTURES, 'baldios.txt'), join(carpeta, 'Coleccion', 'baldios.txt'));
  for (const a of NO_SON_GUIAS) writeFileSync(join(carpeta, ...a.split('/')), PARECE_GUIA);
  const leer = espia();
  const ind = crearIndice({ datos, fs, base: async () => crear(), leer });
  await ind.actualizar();
  const x = ind.indice();
  assert.deepEqual(x.guias.map((g) => g.archivo), ['Coleccion/baldios.txt']);
  assert.deepEqual(leer.llamadas.map((r) => r.slice(carpeta.length + 1).replaceAll('\\', '/')), ['Coleccion/baldios.txt']);
  assert.deepEqual(x.noLeidos.map((n) => n.archivo).sort(), [...NO_SON_GUIAS].sort());
  for (const n of x.noLeidos) assert.equal(n.motivo, 'no es guía', n.archivo);
  // Un nombre que solo contiene la palabra sí se lee.
  writeFileSync(join(carpeta, 'Otra', 'guia-sin-readme.txt'), readFileSync(join(FIXTURES, 'baldios.txt')));
  await ind.actualizar();
  assert.ok(ind.indice().guias.some((g) => g.archivo === 'Otra/guia-sin-readme.txt'));
});

test('un LICENSE que un índice anterior guardó como guía sale de las guías sin rehacer el índice entero', async () => {
  const datos = datosNuevos();
  const carpeta = join(datos, CARPETA_GUIAS);
  mkdirSync(join(carpeta, 'Coleccion'), { recursive: true });
  cpSync(join(FIXTURES, 'baldios.txt'), join(carpeta, 'Coleccion', 'baldios.txt'));
  const primero = crearIndice({ datos, fs, base: async () => crear() });
  await primero.actualizar();
  // El índice de antes del arreglo: LICENSE.txt leída como guía de texto, con su firma al día.
  writeFileSync(join(carpeta, 'Coleccion', 'LICENSE.txt'), PARECE_GUIA);
  const st = fs.lstatSync(join(carpeta, 'Coleccion', 'LICENSE.txt'));
  const previo = JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8'));
  previo.guias.push({ ...previo.guias[0], id: 'aaaaaaaa', archivo: 'Coleccion/LICENSE.txt', nombre: 'LICENSE', pasos: 3 });
  previo.firmas['Coleccion/LICENSE.txt'] = `${Math.floor(st.mtimeMs)}:${st.size}`;
  writeFileSync(join(datos, RUTA_INDICE), JSON.stringify(previo));
  const leer = espia();
  const ind = crearIndice({ datos, fs, base: async () => crear(), leer });
  await ind.actualizar();
  assert.deepEqual(leer.llamadas, []);
  const x = ind.indice();
  assert.deepEqual(x.guias.map((g) => g.archivo), ['Coleccion/baldios.txt']);
  assert.deepEqual(x.noLeidos, [{ archivo: 'Coleccion/LICENSE.txt', motivo: 'no es guía' }]);
  assert.deepEqual(JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8')).guias.map((g) => g.archivo), ['Coleccion/baldios.txt']);
});

test('alTerminar se llama al acabar cada actualizar bien hecho (también las de la vigilancia) y su fallo no molesta', async () => {
  const datos = conFixtures();
  const resumenes = [];
  const ind = crearIndice({ datos, fs, base: async () => crear(), alTerminar: (r) => { resumenes.push(r); throw new Error('de la app'); } });
  const r = await ind.actualizar();
  assert.equal(resumenes.length, 1);
  assert.equal(resumenes[0], r);
  const fallido = crearIndice({ datos, fs, base: async () => { throw new Error('sin base'); }, alTerminar: (x) => resumenes.push(x) });
  await assert.rejects(fallido.actualizar());
  assert.equal(resumenes.length, 1);
});

// Review Focus 1 (revisión de la tarea 10): el servidor de herramientas es otro proceso y solo ve el disco. Desde la
// primera lectura de una pasada, indice.json dice indexando: true (con el índice anterior); al acabar, false.
test('el disco dice indexando desde la primera lectura de la pasada, con el índice anterior', async () => {
  const datos = conFixtures();
  const vistos = [];
  const leer = (...a) => {
    if (vistos.length === 0 || vistos.at(-1).pasada !== pasada) {
      const j = JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8'));
      vistos.push({ pasada, indexando: j.indexando, guias: j.guias.length });
    }
    return leerArchivoGuia(...a);
  };
  let pasada = 1;
  const ind = crearIndice({ datos, fs, base: async () => crear(), leer });
  await ind.actualizar();
  assert.deepEqual(vistos[0], { pasada: 1, indexando: true, guias: 0 });
  const total = ind.indice().guias.length;
  assert.equal(JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8')).indexando, false);
  pasada = 2;
  cambiar(join(datos, CARPETA_GUIAS, 'baldios.txt'), '\n4. Habla con alguien.\n');
  await ind.actualizar();
  assert.deepEqual(vistos[1], { pasada: 2, indexando: true, guias: total });
  assert.equal(JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8')).indexando, false);
  // una pasada sin nada que leer no llama a leer (y no hay «indexando» intermedio)
  pasada = 3;
  await ind.actualizar();
  assert.equal(vistos.length, 2);
});

test('si la pasada falla tras guardar «indexando», el disco vuelve a decir que no indexa', async () => {
  const datos = conFixtures();
  await crearIndice({ datos, fs, base: async () => crear() }).actualizar();
  cambiar(join(datos, CARPETA_GUIAS, 'baldios.txt'), '\n4. Otra cosa.\n');
  const roto = () => { throw new Error('lector roto'); };
  await assert.rejects(crearIndice({ datos, fs, base: async () => crear(), leer: roto }).actualizar());
  const j = JSON.parse(readFileSync(join(datos, RUTA_INDICE), 'utf8'));
  assert.equal(j.indexando, false);
  assert.ok(j.guias.length > 0);
});
