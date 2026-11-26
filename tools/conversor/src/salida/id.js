// Identificador estable de un paso: los 8 primeros caracteres hexadecimales del sha1 de la clave de la guía,
// el filtro del paso y su contenido. Es la fórmula de la fase 1 (rxp/guias.js); no se puede tocar sin
// cambiar los id guardados por los jugadores.
import { createHash } from 'node:crypto';

export const idDePaso = (clave, filtro, contenido) => createHash('sha1')
  .update(`${clave}\n${JSON.stringify(filtro)}\n${contenido}`, 'utf8').digest('hex').slice(0, 8);
