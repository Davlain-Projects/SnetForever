// Se carga con `node --import ./test/aislar.mjs --test` (npm test) antes de cada archivo de pruebas: lleva la carpeta de
// datos (SNF_DATOS) y %LOCALAPPDATA% (de donde salen la de datos y la de instalación por defecto) a una carpeta temporal
// nueva, para que ninguna prueba escriba en las de verdad del jugador (test/aislamiento.test.js lo vigila).
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = mkdtempSync(join(tmpdir(), 'snf-pruebas-'));
const local = join(raiz, 'AppData', 'Local');
mkdirSync(local, { recursive: true });
process.env.LOCALAPPDATA = local;
process.env.SNF_DATOS = join(local, 'SnetForever');
