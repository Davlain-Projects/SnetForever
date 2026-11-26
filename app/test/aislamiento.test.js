// Las pruebas de la app nunca escriben en la carpeta de datos de verdad (%LOCALAPPDATA%\SnetForever) ni en la de
// instalación. 14-nov: al pasar `npm test`, una prueba del núcleo apuntó «mensaje c0-1 recibido…» en el registro.log
// real del jugador, porque registro.mjs escribe en carpetaDatos() (SNF_DATOS o %LOCALAPPDATA%\SnetForever) y la prueba
// no daba carpeta. test/aislar.mjs (cargado con --import en «npm test») pone SNF_DATOS y LOCALAPPDATA en una carpeta
// temporal antes de cada archivo de pruebas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { log } from '../src/registro.mjs';
import { carpetaDatos } from '../src/rutas.mjs';

const REAL = join(homedir(), 'AppData', 'Local', 'SnetForever');
const dentroDeTemporal = (ruta) => resolve(ruta).toLowerCase().startsWith(resolve(tmpdir()).toLowerCase());

test('las pruebas corren con SNF_DATOS y LOCALAPPDATA en una carpeta temporal', () => {
  assert.ok(process.env.SNF_DATOS && dentroDeTemporal(process.env.SNF_DATOS), `SNF_DATOS = ${process.env.SNF_DATOS}`);
  assert.ok(process.env.LOCALAPPDATA && dentroDeTemporal(process.env.LOCALAPPDATA), `LOCALAPPDATA = ${process.env.LOCALAPPDATA}`);
  assert.ok(dentroDeTemporal(carpetaDatos()), carpetaDatos());
});

test('log() de una prueba va a la carpeta temporal y no toca el registro.log de verdad', () => {
  // Sin el aislamiento (p. ej. node --test sin --import) se para aquí, antes de escribir nada en la carpeta de verdad.
  assert.ok(dentroDeTemporal(carpetaDatos()), 'sin aislamiento: no se escribe nada');
  const real = join(REAL, 'registro.log');
  const antes = existsSync(real) ? statSync(real).size : null;
  log('info', 'prueba de aislamiento');
  assert.match(readFileSync(join(process.env.SNF_DATOS, 'registro.log'), 'utf8'), /prueba de aislamiento/);
  assert.equal(existsSync(real) ? statSync(real).size : null, antes);
});
