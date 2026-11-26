// `npm run firma:crear` (fase 5, tarea 14): crea la clave de firma una sola vez y enseña la pública.
//
// - Sale con 0 si la crea, con 1 si ya había una (no se crea otra) y con 2 si algo falló.
// - Solo enseña la clave pública; la privada se queda protegida con DPAPI en la carpeta de la firma.
import { carpetaFirma, crearClave } from './clave.mjs';

try {
  const { publicaPem, carpeta } = crearClave({ env: process.env });
  console.log(`Clave de firma creada en ${carpeta}.`);
  console.log('Copia esta clave en app/typescript/src/actualizar/clave-publica.mts (CLAVE_PUBLICA) y ejecuta npm run build:app:');
  console.log('');
  console.log(publicaPem.trimEnd());
} catch (e) {
  if (e?.code === 'existe') {
    console.error('Ya hay una clave; no se crea otra.');
    console.error(`Carpeta: ${carpetaFirma(process.env)}`);
    process.exitCode = 1;
  } else {
    console.error(`No se pudo crear la clave de firma: ${e?.message ?? e}`);
    process.exitCode = 2;
  }
}
