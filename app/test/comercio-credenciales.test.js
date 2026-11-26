// Credenciales de Blizzard cifradas (comercio/credenciales.mjs), con un PowerShell falso que invierte los bytes y carpetas
// temporales: nunca se toca la carpeta de datos real ni DPAPI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerCredenciales, guardarCredenciales } from '../src/comercio/credenciales.mjs';

const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SECRETO = 'S3cretoDePrueba-no-real';

// «Cifra» invirtiendo los bytes (y «descifra» igual): lo bastante para ver que en disco no queda el texto en claro.
function falso({ falla = false } = {}) {
  const llamadas = [];
  const ejecutar = async (accion, base64) => {
    llamadas.push(accion);
    if (falla) throw new Error('DPAPI no pudo');
    return Buffer.from(Buffer.from(base64, 'base64').reverse()).toString('base64');
  };
  return { ejecutar, llamadas };
}

function entorno() {
  const datos = mkdtempSync(join(tmpdir(), 'snf-cred-'));
  const cuarentena = join(datos, 'cuarentena', 'x');
  const avisos = [];
  const opciones = (extra = {}) => ({
    ...extra,
    cuarentena: () => { mkdirSync(cuarentena, { recursive: true }); return cuarentena; },
    registrar: (a) => avisos.push(a),
  });
  return { datos, cuarentena, avisos, opciones };
}

test('importa blizzard-api.json: deja blizzard.dat cifrado, el json en la cuarentena y devuelve {id, secreto}', async () => {
  const { datos, cuarentena, avisos, opciones } = entorno();
  writeFileSync(join(datos, 'blizzard-api.json'), JSON.stringify({ id: ID, secreto: SECRETO }));
  const { ejecutar } = falso();
  const r = await leerCredenciales(datos, opciones({ ejecutar }));
  assert.deepEqual(r, { id: ID, secreto: SECRETO });
  const dat = join(datos, 'comercio', 'blizzard.dat');
  assert.ok(existsSync(dat));
  assert.ok(!readFileSync(dat).includes(Buffer.from(SECRETO)), 'el secreto no está en claro en el .dat');
  assert.ok(!readFileSync(dat).includes(Buffer.from(ID)));
  assert.ok(!existsSync(join(datos, 'blizzard-api.json')), 'el json en claro ya no está en datos');
  assert.ok(existsSync(join(cuarentena, 'blizzard-api.json')), 'el json en claro está en la cuarentena');
  assert.deepEqual(readdirSync(join(datos, 'comercio')), ['blizzard.dat'], 'sin archivos temporales');
  assert.deepEqual(avisos, []);
  // la segunda vez sale del .dat
  assert.deepEqual(await leerCredenciales(datos, opciones({ ejecutar })), { id: ID, secreto: SECRETO });
});

test('guardarCredenciales y leerCredenciales: ida y vuelta', async () => {
  const { datos, opciones } = entorno();
  const { ejecutar, llamadas } = falso();
  await guardarCredenciales(datos, { id: ID, secreto: SECRETO }, { ejecutar });
  assert.deepEqual(llamadas, ['proteger']);
  assert.deepEqual(await leerCredenciales(datos, opciones({ ejecutar })), { id: ID, secreto: SECRETO });
  assert.deepEqual(llamadas, ['proteger', 'desproteger']);
});

test('sin ningún archivo: null y sin aviso', async () => {
  const { datos, avisos, opciones } = entorno();
  assert.equal(await leerCredenciales(datos, opciones({ ejecutar: falso().ejecutar })), null);
  assert.deepEqual(avisos, []);
});

test('un id que no es de 32 cifras hexadecimales, o un secreto vacío: null y aviso CREDENCIALES_MALAS sin los valores', async () => {
  for (const malo of [{ id: 'corto', secreto: SECRETO }, { id: `${ID}0`, secreto: SECRETO }, { id: 'z'.repeat(32), secreto: SECRETO },
    { id: ID, secreto: '' }, { id: ID, secreto: '   ' }, { id: ID }, { secreto: SECRETO }, { id: 5, secreto: SECRETO }]) {
    const { datos, cuarentena, avisos, opciones } = entorno();
    writeFileSync(join(datos, 'blizzard-api.json'), JSON.stringify(malo));
    assert.equal(await leerCredenciales(datos, opciones({ ejecutar: falso().ejecutar })), null, JSON.stringify(malo));
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /^CREDENCIALES_MALAS/);
    assert.ok(!avisos[0].includes(SECRETO) && !avisos[0].includes(ID), 'el aviso no lleva valores');
    assert.ok(!existsSync(join(datos, 'comercio', 'blizzard.dat')));
    assert.ok(existsSync(join(datos, 'blizzard-api.json')), 'el json malo no se mueve');
    assert.ok(!existsSync(cuarentena));
  }
});

test('un json que no es JSON: null y aviso CREDENCIALES_MALAS', async () => {
  const { datos, avisos, opciones } = entorno();
  writeFileSync(join(datos, 'blizzard-api.json'), '{ no es json');
  assert.equal(await leerCredenciales(datos, opciones({ ejecutar: falso().ejecutar })), null);
  assert.match(avisos[0], /^CREDENCIALES_MALAS/);
});

test('guardarCredenciales rechaza credenciales malas sin repetir los valores', async () => {
  const { datos } = entorno();
  await assert.rejects(guardarCredenciales(datos, { id: 'x', secreto: SECRETO }, { ejecutar: falso().ejecutar }),
    (e) => e instanceof TypeError && !e.message.includes(SECRETO));
  assert.ok(!existsSync(join(datos, 'comercio')));
});

test('blizzard.dat ilegible (DPAPI falla o no es un JSON): null y aviso, sin tocar el archivo', async () => {
  const { datos, avisos, opciones } = entorno();
  mkdirSync(join(datos, 'comercio'));
  const dat = join(datos, 'comercio', 'blizzard.dat');
  writeFileSync(dat, Buffer.from('basura'));
  assert.equal(await leerCredenciales(datos, opciones({ ejecutar: falso({ falla: true }).ejecutar })), null);
  assert.match(avisos[0], /^CREDENCIALES_ILEGIBLES/);
  assert.equal(await leerCredenciales(datos, opciones({ ejecutar: falso().ejecutar })), null, 'descifra a algo que no es JSON');
  assert.equal(avisos.length, 2);
  assert.deepEqual(readFileSync(dat), Buffer.from('basura'));
});

test('con blizzard.dat bueno y un json en claro que sobra: lee el .dat y aparta el json', async () => {
  const { datos, cuarentena, opciones } = entorno();
  const { ejecutar } = falso();
  await guardarCredenciales(datos, { id: ID, secreto: SECRETO }, { ejecutar });
  writeFileSync(join(datos, 'blizzard-api.json'), JSON.stringify({ id: ID, secreto: SECRETO }));
  assert.deepEqual(await leerCredenciales(datos, opciones({ ejecutar })), { id: ID, secreto: SECRETO });
  assert.ok(!existsSync(join(datos, 'blizzard-api.json')));
  assert.ok(existsSync(join(cuarentena, 'blizzard-api.json')));
});

test('si no se puede cifrar, el json en claro se queda donde está', async () => {
  const { datos, avisos, opciones } = entorno();
  writeFileSync(join(datos, 'blizzard-api.json'), JSON.stringify({ id: ID, secreto: SECRETO }));
  assert.equal(await leerCredenciales(datos, opciones({ ejecutar: falso({ falla: true }).ejecutar })), null);
  assert.ok(existsSync(join(datos, 'blizzard-api.json')));
  assert.match(avisos[0], /^CREDENCIALES_ILEGIBLES/);
});

test('ningún aviso ni error contiene el id ni el secreto', async () => {
  const { datos, avisos, opciones } = entorno();
  const trampa = async () => { throw new Error(`fallo con ${SECRETO} y ${ID}`); };
  writeFileSync(join(datos, 'blizzard-api.json'), JSON.stringify({ id: ID, secreto: SECRETO }));
  await leerCredenciales(datos, opciones({ ejecutar: trampa }));
  mkdirSync(join(datos, 'comercio'));
  writeFileSync(join(datos, 'comercio', 'blizzard.dat'), 'x');
  await leerCredenciales(datos, opciones({ ejecutar: trampa }));
  assert.ok(avisos.length >= 2);
  for (const a of avisos) assert.ok(!a.includes(SECRETO) && !a.includes(ID), a);
  const e = await guardarCredenciales(datos, { id: ID, secreto: SECRETO }, { ejecutar: trampa }).catch((x) => x);
  assert.ok(e instanceof Error);
  assert.ok(!e.message.includes(SECRETO) && !e.message.includes(ID) && e.cause === undefined);
});

test('blizzard.dat ilegible y un json válido: lo importa, devuelve las nuevas y aparta el .dat viejo y el json', async () => {
  const { datos, cuarentena, avisos, opciones } = entorno();
  mkdirSync(join(datos, 'comercio'));
  const dat = join(datos, 'comercio', 'blizzard.dat');
  writeFileSync(dat, Buffer.from('de otro perfil de Windows'));
  writeFileSync(join(datos, 'blizzard-api.json'), JSON.stringify({ id: ID, secreto: SECRETO }));
  const { ejecutar } = falso();
  // el .dat viejo no es JSON al descifrarlo, pero ni se intenta: manda el json
  assert.deepEqual(await leerCredenciales(datos, opciones({ ejecutar })), { id: ID, secreto: SECRETO });
  assert.deepEqual(avisos, []);
  assert.deepEqual(readFileSync(join(cuarentena, 'blizzard.dat')), Buffer.from('de otro perfil de Windows'));
  assert.ok(existsSync(join(cuarentena, 'blizzard-api.json')));
  assert.ok(!existsSync(join(datos, 'blizzard-api.json')));
  assert.deepEqual(await leerCredenciales(datos, opciones({ ejecutar })), { id: ID, secreto: SECRETO });
});

test('blizzard.dat bueno y un json con otras credenciales: ganan las del json, y el .dat viejo y el json van a la cuarentena', async () => {
  const { datos, cuarentena, opciones } = entorno();
  const { ejecutar } = falso();
  await guardarCredenciales(datos, { id: ID, secreto: SECRETO }, { ejecutar });
  const datViejo = readFileSync(join(datos, 'comercio', 'blizzard.dat'));
  const nuevas = { id: 'f'.repeat(32), secreto: 'otro-secreto-de-prueba' };
  writeFileSync(join(datos, 'blizzard-api.json'), JSON.stringify(nuevas));
  assert.deepEqual(await leerCredenciales(datos, opciones({ ejecutar })), nuevas);
  assert.deepEqual(readFileSync(join(cuarentena, 'blizzard.dat')), datViejo);
  assert.ok(existsSync(join(cuarentena, 'blizzard-api.json')));
  assert.ok(!existsSync(join(datos, 'blizzard-api.json')));
  assert.deepEqual(await leerCredenciales(datos, opciones({ ejecutar })), nuevas);
});

test('guardarCredenciales sobre un blizzard.dat que ya existe: el viejo va a la cuarentena, nunca se pisa', async () => {
  const { datos, cuarentena, opciones } = entorno();
  const { ejecutar } = falso();
  await guardarCredenciales(datos, { id: ID, secreto: SECRETO }, { ejecutar });
  const viejo = readFileSync(join(datos, 'comercio', 'blizzard.dat'));
  const nuevas = { id: 'e'.repeat(32), secreto: 'tercer-secreto-de-prueba' };
  await guardarCredenciales(datos, nuevas, { ejecutar, cuarentena: opciones().cuarentena });
  assert.deepEqual(readFileSync(join(cuarentena, 'blizzard.dat')), viejo);
  assert.deepEqual(await leerCredenciales(datos, opciones({ ejecutar })), nuevas);
});

test('un json malo con un .dat bueno: se ignora el json (con aviso), se lee el .dat y el json no se mueve', async () => {
  const { datos, cuarentena, avisos, opciones } = entorno();
  const { ejecutar } = falso();
  await guardarCredenciales(datos, { id: ID, secreto: SECRETO }, { ejecutar });
  writeFileSync(join(datos, 'blizzard-api.json'), JSON.stringify({ id: 'mal', secreto: '' }));
  assert.deepEqual(await leerCredenciales(datos, opciones({ ejecutar })), { id: ID, secreto: SECRETO });
  assert.match(avisos[0], /^CREDENCIALES_MALAS/);
  assert.ok(existsSync(join(datos, 'blizzard-api.json')));
  assert.ok(!existsSync(cuarentena));
});
