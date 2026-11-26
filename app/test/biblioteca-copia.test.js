// Biblioteca de guías: la primera copia de las guías del juego (solo copia: AddOns no se toca).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync, utimesSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { copiarDelJuego, RUTA_COPIAS } from '../src/biblioteca/copia.mjs';
import { CARPETA_GUIAS } from '../src/biblioteca/indice.mjs';

const nuevaCarpeta = (prefijo) => {
  mkdirSync(process.env.SNF_DATOS, { recursive: true });
  return mkdtempSync(join(process.env.SNF_DATOS, prefijo));
};
const escribir = (ruta, texto) => {
  mkdirSync(join(ruta, '..'), { recursive: true });
  writeFileSync(ruta, texto);
};
const addonsFalso = () => {
  const a = nuevaCarpeta('addons-');
  escribir(join(a, 'SnetForever_MisGuias', 'mis-guias.lua'), 'SnetForeverMisGuias = {}\n');
  escribir(join(a, 'SnetForever_Misiones', 'guias_a.lua'), '-- a\n');
  escribir(join(a, 'SnetForever_Misiones', 'guias_b.lua'), '-- b\n');
  escribir(join(a, 'SnetForever_Misiones', 'otro.lua'), '-- no\n');
  escribir(join(a, 'SnetForever_Rutas', 'guias_r.lua'), '-- r\n');
  return a;
};
const foto = (dir) => {
  const r = {};
  const ver = (d, p) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = p ? `${p}/${e.name}` : e.name;
      if (e.isDirectory()) { r[rel + '/'] = 0; ver(join(d, e.name), rel); }
      else { const s = statSync(join(d, e.name)); r[rel] = `${s.size}:${s.mtimeMs}:${readFileSync(join(d, e.name), 'utf8')}`; }
    }
  };
  ver(dir, '');
  return r;
};
const tocar = (f, texto) => {
  writeFileSync(f, texto);
  const t = new Date(Date.now() + 5000);
  utimesSync(f, t, t);
};

test('constantes', () => {
  assert.equal(RUTA_COPIAS, join('biblioteca', 'copias.json'));
});

test('la primera vez copia los tres tipos y apunta la firma de cada origen', async () => {
  const datos = nuevaCarpeta('datos-');
  const addons = addonsFalso();
  const r = await copiarDelJuego({ datos, addonsDir: addons, fs });
  assert.equal(r.copiados.length, 4);
  assert.equal(r.apartados, 0);
  const g = join(datos, CARPETA_GUIAS);
  assert.equal(readFileSync(join(g, 'Mis guías', 'mis-guias.lua'), 'utf8'), 'SnetForeverMisGuias = {}\n');
  assert.equal(readFileSync(join(g, 'Del addon', 'SnetForever_Misiones', 'guias_a.lua'), 'utf8'), '-- a\n');
  assert.ok(existsSync(join(g, 'Del addon', 'SnetForever_Misiones', 'guias_b.lua')));
  assert.ok(existsSync(join(g, 'Del addon', 'SnetForever_Rutas', 'guias_r.lua')));
  assert.ok(!existsSync(join(g, 'Del addon', 'SnetForever_Misiones', 'otro.lua')));
  const copias = JSON.parse(readFileSync(join(datos, RUTA_COPIAS), 'utf8'));
  const st = statSync(join(addons, 'SnetForever_Rutas', 'guias_r.lua'));
  assert.equal(Object.keys(copias.firmas).length, 4);
  assert.ok(Object.values(copias.firmas).includes(`${Math.floor(st.mtimeMs)}:${st.size}`));
});

test('la segunda vez no copia nada; si un origen cambia se copia y la copia anterior va a la cuarentena', async () => {
  const datos = nuevaCarpeta('datos-');
  const addons = addonsFalso();
  await copiarDelJuego({ datos, addonsDir: addons, fs });
  const otra = await copiarDelJuego({ datos, addonsDir: addons, fs });
  assert.deepEqual(otra, { copiados: [], apartados: 0 });

  tocar(join(addons, 'SnetForever_Misiones', 'guias_a.lua'), '-- a nuevo\n');
  const r = await copiarDelJuego({ datos, addonsDir: addons, fs });
  assert.equal(r.copiados.length, 1);
  assert.equal(r.apartados, 1);
  const destino = join(datos, CARPETA_GUIAS, 'Del addon', 'SnetForever_Misiones', 'guias_a.lua');
  assert.equal(readFileSync(destino, 'utf8'), '-- a nuevo\n');
  const cuarentena = join(datos, 'cuarentena');
  const dentro = [];
  const ver = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? ver(join(d, e.name)) : dentro.push(readFileSync(join(d, e.name), 'utf8')); };
  ver(cuarentena);
  assert.deepEqual(dentro, ['-- a\n']);
  assert.deepEqual(await copiarDelJuego({ datos, addonsDir: addons, fs }), { copiados: [], apartados: 0 });
});

test('si el jugador movió o quitó una copia y el origen no cambió, no se vuelve a copiar', async () => {
  const datos = nuevaCarpeta('datos-');
  const addons = addonsFalso();
  await copiarDelJuego({ datos, addonsDir: addons, fs });
  const g = join(datos, CARPETA_GUIAS);
  mkdirSync(join(g, 'Mías'));
  renameSync(join(g, 'Mis guías', 'mis-guias.lua'), join(g, 'Mías', 'otro-nombre.lua'));
  renameSync(join(g, 'Del addon', 'SnetForever_Rutas', 'guias_r.lua'), join(datos, 'fuera.lua'));
  const r = await copiarDelJuego({ datos, addonsDir: addons, fs });
  assert.deepEqual(r, { copiados: [], apartados: 0 });
  assert.ok(!existsSync(join(g, 'Mis guías', 'mis-guias.lua')));
  assert.ok(!existsSync(join(g, 'Del addon', 'SnetForever_Rutas', 'guias_r.lua')));
});

test('AddOns queda igual byte a byte (archivos, tamaños, fechas)', async () => {
  const datos = nuevaCarpeta('datos-');
  const addons = addonsFalso();
  const antes = foto(addons);
  await copiarDelJuego({ datos, addonsDir: addons, fs });
  tocar(join(datos, 'x.tmp'), 'x'); // ruido fuera de AddOns
  await copiarDelJuego({ datos, addonsDir: addons, fs });
  assert.deepEqual(foto(addons), antes);
});

test('sin addonsDir o sin alguno de los addons copia lo que hay y no falla', async () => {
  const datos = nuevaCarpeta('datos-');
  assert.deepEqual(await copiarDelJuego({ datos, addonsDir: undefined, fs }), { copiados: [], apartados: 0 });
  assert.deepEqual(await copiarDelJuego({ datos, addonsDir: join(datos, 'noexiste'), fs }), { copiados: [], apartados: 0 });
  const a = nuevaCarpeta('addons-');
  escribir(join(a, 'SnetForever_Rutas', 'guias_r.lua'), '-- r\n');
  const r = await copiarDelJuego({ datos, addonsDir: a, fs });
  assert.equal(r.copiados.length, 1);
});
