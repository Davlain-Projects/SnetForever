// Ayudante de pruebas: construye guías sobre los fixtures, sin la tabla real SIGUIENTES_EXTRA
// (sus guías no están en los fixtures). Cada prueba puede sustituir cualquier campo del contexto.
import { fileURLToPath } from 'node:url';
import { construirGuias } from '../../src/rxp/guias.js';

export const dirFixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));

export const construirConFixtures = (fuentes, ctx) => construirGuias(fuentes, {
  origen: dirFixtures, siguientesExtra: {}, descartados: {}, avisos: [], ...ctx,
});
