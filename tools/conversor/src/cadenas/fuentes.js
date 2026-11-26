// Fuentes de la base real y resolución de las cadenas del catálogo, compartidas por la herramienta de
// consulta (listar.js), la prueba de integración del catálogo y las guías de cadena (tarea 6).
import { dirname } from 'node:path';
import { crearVista, RAZAS_DE } from '../questie/vista.js';
import { leerEntidades } from '../questie/entidades.js';
import { leerCorrecciones } from '../questie/correcciones.js';
import { cargarZonas } from '../questie/zonas.js';
import { rutaQuestieToc } from '../config.js';
import { resolverVariante } from './resolver.js';

export const FACCIONES = ['Horde', 'Alliance'];

/** Fuentes de la base real (solo lectura) para crearVista. */
export function cargarFuentes() {
  const rutaToc = rutaQuestieToc();
  const dir = dirname(rutaToc);
  return { entidades: leerEntidades(rutaToc), correcciones: leerCorrecciones(dir), zonas: cargarZonas(dir) };
}

/** Pares {faccion, raza} de una variante: cada raza en las facciones donde existe (o solo en `faccion`). */
export function combinacionesDe(variante) {
  const facciones = variante.faccion === undefined ? FACCIONES : [variante.faccion];
  return facciones.flatMap((faccion) => variante.razas
    .filter((raza) => RAZAS_DE[faccion].includes(raza))
    .map((raza) => ({ faccion, raza })));
}

// Una vista por facción y clase (las correcciones del Forever dependen de las dos), compartida.
const vistas = new WeakMap();
/** Vista de las fuentes para una facción y una clase, en caché. */
export function vistaDe(fuentes, faccion, clase) {
  if (!vistas.has(fuentes)) vistas.set(fuentes, new Map());
  const cache = vistas.get(fuentes);
  const clave = `${faccion}|${clase}`;
  if (!cache.has(clave)) cache.set(clave, crearVista(fuentes, { faccion, clase }));
  return cache.get(clave);
}

/**
 * Resuelve todas las variantes de una cadena del catálogo.
 * @returns {Array<{variante: number, faccion, raza, r}>} `variante` empieza en 1; `r` es lo que da resolverVariante
 */
export function resolverCadena(fuentes, cadena) {
  return cadena.variantes.flatMap((v, i) => combinacionesDe(v).map(({ faccion, raza }) => {
    const r = resolverVariante(vistaDe(fuentes, faccion, cadena.clase), {
      clase: cadena.clase, raza, inicio: v.inicio, fin: v.fin, pasos: v.pasos, desempate: v.desempate, dador: v.dador,
    });
    return { variante: i + 1, faccion, raza, r };
  }));
}
