#!/usr/bin/env node
// CLI del conversor: lee el origen (solo lectura), convierte y valida; si no hay errores, escribe los
// dos addons de datos y el informe. Con --instalar copia los addons a la carpeta AddOns del origen.
// El flujo está en convertir.js.
//
//   node src/cli.js [--version AAAA.MM.DD.n] [--instalar] [--salida <dir>] [--informe <archivo>]
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SALIDA } from './config.js';
import { convertir } from './convertir.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FORMATO_VERSION = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;

function versionDeHoy() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${dos(d.getMonth() + 1)}.${dos(d.getDate())}.1`;
}

function leerArgumentos(argv) {
  const opciones = { version: versionDeHoy(), instalar: false, salida: SALIDA, informe: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const valor = () => {
      if (i + 1 >= argv.length) throw new Error(`Falta el valor de ${a}`);
      i += 1;
      return argv[i];
    };
    if (a === '--version') opciones.version = valor();
    else if (a === '--instalar') opciones.instalar = true;
    else if (a === '--salida') opciones.salida = valor();
    else if (a === '--informe') opciones.informe = valor();
    else throw new Error(`Opción desconocida: ${a}`);
  }
  if (!FORMATO_VERSION.test(opciones.version)) {
    throw new Error(`La versión «${opciones.version}» no tiene la forma AAAA.MM.DD.n`);
  }
  opciones.informe ??= join(RAIZ, 'artifacts', 'reports', `avisos-${opciones.version}.md`);
  return opciones;
}

try {
  process.exitCode = convertir(leerArgumentos(process.argv.slice(2)));
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
}
