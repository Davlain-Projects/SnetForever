// Lote B (B4): lo que carga el juego de cada addon de datos, en bytes de Lua (los .lua del .toc; los de «## X-SNF-App»
// solo los lee la app). En el juego, GetAddOnMemoryUsage dio 80.739 kB para SnetForever_Rutas y 108.401 kB para
// SnetForever_Misiones con los datos de antes del lote B (memoria.test.js); la comprobación en el juego está en
// docs/plano-restedxp/5-comprobaciones-en-juego.md. Aquí se mide la fuente, que es lo que se puede medir sin el juego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerToc } from '../src/maquina.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC = {
  SnetForever_Rutas: join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc'),
  SnetForever_Misiones: join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc'),
};
const hayDatos = Object.values(TOC).every(existsSync);
const reales = { skip: hayDatos ? false : 'no están los addons de datos' };

// Bytes de los .lua del .toc con los datos 2026.11.10.6 (antes del lote B; medidos en el repositorio, en `git cat-file -s`).
const ANTES = { SnetForever_Rutas: 13882073, SnetForever_Misiones: 14981504 };

// Bytes de los .lua que carga el .toc, sin contar los \r (con autocrlf, una copia de trabajo puede tener CRLF).
function bytesDelToc(rutaToc) {
  let total = 0;
  for (const archivo of leerToc(rutaToc).archivos) {
    const datos = readFileSync(join(dirname(rutaToc), archivo));
    total += datos.length - datos.filter((b) => b === 0x0d).length;
  }
  return total;
}

const kB = (b) => `${(b / 1024).toLocaleString('es-ES', { maximumFractionDigits: 0 })} kB`;

test('lote B: lo que carga el .toc de cada addon de datos, antes y después', reales, () => {
  const despues = Object.fromEntries(Object.entries(TOC).map(([addon, ruta]) => [addon, bytesDelToc(ruta)]));
  for (const addon of Object.keys(TOC)) {
    const pct = (100 * (despues[addon] - ANTES[addon])) / ANTES[addon];
    console.log(`  ${addon}: antes ${kB(ANTES[addon])}, ahora ${kB(despues[addon])} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`);
  }
  // Misiones baja al menos un 40 % (B1 y B2).
  assert.ok(despues.SnetForever_Misiones <= 0.6 * ANTES.SnetForever_Misiones,
    `Misiones: ${despues.SnetForever_Misiones} bytes, más del 60 % de ${ANTES.SnetForever_Misiones}`);
  // Rutas no se toca en este lote (su partición por facción queda para después de medir); solo crece con los id de los
  // PNJ de target y mob (B3), unos bytes por PNJ.
  assert.ok(despues.SnetForever_Rutas <= 1.02 * ANTES.SnetForever_Rutas,
    `Rutas: ${despues.SnetForever_Rutas} bytes, más del 102 % de ${ANTES.SnetForever_Rutas}`);
});
