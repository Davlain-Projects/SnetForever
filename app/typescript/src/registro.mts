// Registro de la app (datos/registro.log). Solo crece: al pasar de 1 MB se renombra a registro-<sello>.log
// (con sufijo -1, -2… si ese nombre ya existe).
//
// NUNCA se apuntan las preguntas ni las respuestas del jugador ni de la IA: quien llama solo pasa avisos técnicos
// (estados, tipos de error, tiempos). Lo vigilan test/claude.test.js y test/codex.test.js.
import { appendFileSync, mkdirSync, statSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaDatos, sello } from './rutas.mjs';

export const MAX_BYTES = 1024 * 1024;

function destinoLibre(dir) {
  const base = `registro-${sello()}`;
  for (let i = 0; ; i++) {
    const ruta = join(dir, i === 0 ? `${base}.log` : `${base}-${i}.log`);
    if (!existsSync(ruta)) return ruta;
  }
}

export function log(nivel, texto) {
  try {
    const dir = carpetaDatos();
    mkdirSync(dir, { recursive: true });
    const ruta = join(dir, 'registro.log');
    try {
      if (statSync(ruta).size >= MAX_BYTES) renameSync(ruta, destinoLibre(dir));
    } catch {
      // aún no existe
    }
    const linea = String(texto).replace(/[\r\n]+/g, ' ');
    appendFileSync(ruta, `${new Date().toISOString()} [${nivel}] ${linea}\n`, 'utf8');
  } catch {
    // el registro nunca debe romper a la app
  }
}
