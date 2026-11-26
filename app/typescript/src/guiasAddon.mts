// En el juego: la guía elegida en el addon puede ser una del propio SnetForever. Las de SnetForever_Misiones ya están en
// la base (base.datos.guias); las de SnetForever_Rutas (las de subida de nivel) no, así que aquí se leen del disco cuando
// hacen falta (solo se leen: nunca se escribe en AddOns). Se guardan en memoria mientras el .toc y sus archivos no cambien.
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { ejecutarDatos } from './base/leer-lua.mjs';

export const CARPETA_RUTAS = 'SnetForever_Rutas';
const memoria = new Map(); // carpeta -> {firma, guias, alias}
// Solo propiedades propias (una clave como «toString» no es ninguna guía).
const propio = (t, k) => (t && typeof t === 'object' && Object.hasOwn(t, k) ? t[k] : undefined);

// Los archivos del .toc (sin comentarios ni líneas vacías) y una firma con sus fechas y tamaños.
function leerToc(carpeta, fs) {
  const toc = fs.readdirSync(carpeta).filter((f) => f.toLowerCase().endsWith('.toc')).sort()[0];
  if (!toc) return null;
  const archivos = fs.readFileSync(join(carpeta, toc), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  const firma = [toc, ...archivos].map((a) => {
    const st = fs.statSync(join(carpeta, a));
    return `${a}:${st.mtimeMs}:${st.size}`;
  }).join('|');
  return { archivos, firma };
}

/**
 * La guía `clave` de `<addonsDir>\SnetForever_Rutas` (con su alias si es una variante), o null si no hay carpeta, no se
 * puede leer o no la tiene. Nunca lanza.
 */
export function leerGuiaRutas(addonsDir, clave, { fs = fsReal } = {}) {
  if (typeof addonsDir !== 'string' || addonsDir === '' || typeof clave !== 'string') return null;
  const carpeta = join(addonsDir, CARPETA_RUTAS);
  try {
    const toc = leerToc(carpeta, fs);
    if (!toc) return null;
    let ya = memoria.get(carpeta);
    if (!ya || ya.firma !== toc.firma) {
      // Revisi\u00F3n: un archivo que no se puede leer tambi\u00E9n se guarda (con su firma): no se relee en cada turno.
      try {
        const raiz: { SNF_RUTAS?: any; } = {};
        for (const a of toc.archivos) ejecutarDatos(fs.readFileSync(join(carpeta, a), 'utf8').replace(/^\uFEFF/, ''), raiz, a);
        ya = { firma: toc.firma, guias: raiz.SNF_RUTAS?.guias ?? null, alias: raiz.SNF_RUTAS?.alias ?? null };
      } catch {
        ya = { firma: toc.firma, guias: null, alias: null };
      }
      memoria.set(carpeta, ya);
    }
    if (!ya.guias) return null;
    const real = propio(ya.alias, clave);
    const g = propio(ya.guias, typeof real === 'string' ? real : clave);
    return g && typeof g === 'object' ? g : null;
  } catch {
    return null;
  }
}
