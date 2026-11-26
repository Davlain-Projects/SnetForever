// Configuración del puente con TATI: apagado por defecto; solo `activo === true` lo enciende.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { puenteDe, CARPETA_PUENTE, carpetaPuente, guardarCerebro } from '../src/tati/config.mjs';

function carpeta() {
  const datos = join(mkdtempSync(join(tmpdir(), 'snf-tati-cfg-')), 'datos');
  mkdirSync(datos, { recursive: true });
  return datos;
}
const leer = (datos) => JSON.parse(readFileSync(join(datos, 'config.json'), 'utf8'));

test('puenteDe: apagado por defecto y solo tati exacto elige a TATI', () => {
  assert.deepEqual(puenteDe({}), { activo: false, cerebro: 'snetforever' });
  assert.deepEqual(puenteDe(null), { activo: false, cerebro: 'snetforever' });
  assert.deepEqual(puenteDe({ puenteTati: { activo: 'true', cerebro: 'tati' } }), { activo: false, cerebro: 'snetforever' });
  assert.deepEqual(puenteDe({ puenteTati: { activo: true, cerebro: 'TATI' } }), { activo: true, cerebro: 'snetforever' });
  assert.deepEqual(puenteDe({ puenteTati: { activo: true, cerebro: 'tati' } }), { activo: true, cerebro: 'tati' });
  assert.deepEqual(puenteDe({ puenteTati: { activo: false, cerebro: 'tati' } }), { activo: false, cerebro: 'snetforever' });
});

test('carpetaPuente cuelga de los datos', () => {
  assert.equal(CARPETA_PUENTE, 'puente-tati');
  assert.equal(carpetaPuente('/x/datos'), join('/x/datos', 'puente-tati'));
});

test('guardarCerebro conserva lo demás y escribe de forma atómica', async () => {
  const datos = carpeta();
  writeFileSync(join(datos, 'config.json'), JSON.stringify({ motor: 'claude', puenteTati: { activo: true } }));
  await guardarCerebro(datos, 'tati', { entorno: process.env });
  assert.deepEqual(leer(datos), { motor: 'claude', puenteTati: { activo: true, cerebro: 'tati' } });
  assert.deepEqual(readdirSync(datos).filter((x) => x.includes('.tmp-')), []);
});

test('guardarCerebro sin config previa la crea (apagado: no enciende el puente)', async () => {
  const datos = carpeta();
  await guardarCerebro(datos, 'snetforever', { entorno: process.env });
  assert.deepEqual(leer(datos), { puenteTati: { cerebro: 'snetforever' } });
  assert.equal(puenteDe(leer(datos)).activo, false);
});

test('guardarCerebro con un valor raro rechaza con code VALOR sin tocar el archivo', async () => {
  const datos = carpeta();
  const texto = JSON.stringify({ motor: 'codex' });
  writeFileSync(join(datos, 'config.json'), texto);
  await assert.rejects(() => guardarCerebro(datos, 'otro', { entorno: process.env }), { code: 'VALOR' });
  assert.equal(readFileSync(join(datos, 'config.json'), 'utf8'), texto);
});

test('guardarCerebro: una config rota va a la cuarentena', async () => {
  const datos = carpeta();
  writeFileSync(join(datos, 'config.json'), '{esto no es json');
  await guardarCerebro(datos, 'tati', { entorno: process.env });
  assert.deepEqual(leer(datos), { puenteTati: { cerebro: 'tati' } });
  const q = join(datos, 'cuarentena');
  assert.ok(readdirSync(q).flatMap((d) => readdirSync(join(q, d))).includes('config.json'));
});
