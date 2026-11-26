// Pasada de solo núcleo (0.7.0): el banco entero sin el addon SnetForever_Comercio, como si su carpeta no estuviera
// instalada. Pone SNF_SIN_COMERCIO=1 y lanza `node --test` con los mismos argumentos (npm run test:nucleo). Las pruebas
// que necesitan el comercio salen como «skipped» con el motivo «necesita SnetForever_Comercio» (test/ayuda.js).
// Con --test-concurrency=4, como npm test: sin tope, cada pasada abre tantos procesos como núcleos y cada uno pesa unos 2,7 GB.
// Sin dependencias: así vale también en Windows, sin cross-env.
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const r = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...process.argv.slice(2)], {
  cwd: dirname(fileURLToPath(import.meta.url)),
  env: { ...process.env, SNF_SIN_COMERCIO: '1' },
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
