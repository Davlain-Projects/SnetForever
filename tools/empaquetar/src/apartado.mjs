// Donde van las cosas construidas por estas herramientas que se sustituyen (revisión final de la fase 5, m3): la raíz
// anterior del instalador (unos 95 MB con node.exe), un .exe anterior con el mismo nombre y una publicación anterior con
// el mismo nombre. No son datos del jugador: van a una carpeta propia de la herramienta,
// tools\empaquetar\dist\apartado\<sello> (dist/ está fuera de git, y en la misma unidad que lo que se aparta: es un
// renombre), y no a la cuarentena común (E:\_CUARENTENA\SnetForever en el PC del jugador) ni a la de config.json.
// Nunca se borra nada: lo apartado se queda ahí. SNF_CUARENTENA la cambia (las pruebas la usan).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cuarentenaComponentes } from '../../../app/src/rutas.mjs';

const EMPAQUETAR = join(dirname(fileURLToPath(import.meta.url)), '..');

/** La carpeta propia de lo apartado, si no hay SNF_CUARENTENA. */
export const APARTADO_POR_DEFECTO = join(EMPAQUETAR, 'dist', 'apartado');

/** La raíz de lo apartado: SNF_CUARENTENA o APARTADO_POR_DEFECTO (no crea nada). */
export function raizApartado(env = process.env) {
  return typeof env.SNF_CUARENTENA === 'string' && env.SNF_CUARENTENA !== '' ? env.SNF_CUARENTENA : APARTADO_POR_DEFECTO;
}

/**
 * Crea y devuelve una carpeta nueva `<raizApartado>\<sello>` (con -1, -2… si ya existe) para apartar algo construido.
 * Solo se pasa SNF_CUARENTENA a la app: así nunca se lee el config.json del jugador ni se cae en E:\_CUARENTENA.
 */
export function carpetaApartado(env = process.env) {
  return cuarentenaComponentes({ env: { SNF_CUARENTENA: raizApartado(env) } });
}
