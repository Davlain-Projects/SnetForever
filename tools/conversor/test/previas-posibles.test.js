// Lote H, ronda 1 (M6): ningún isQuestTurnedIn de las guías laterales escritas (addons/SnetForever_Misiones/guias_1.lua:
// cadenas de clase, mejoras y mazmorras) pide solo misiones que el personaje del paso no puede hacer. El addon salta el
// paso si no ha entregado ninguna de las de la lista (motor/elementos-misiones.lua:183-190); con la 1.0.11 pasaba en la
// actitud defensiva del guerrero y en el manáfago del brujo, y con la 1.0.14 en el saco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarLua } from './ayuda/cargar-lua.js';
import { cargarFuentes } from '../src/cadenas/fuentes.js';
import { crearVista, RAZAS_DE, BIT_CLASE } from '../src/questie/vista.js';
import { rutaQuestieToc } from '../src/config.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR = join(AQUI, '..', '..', '..', 'addons', 'SnetForever_Misiones');
const opciones = {
  skip: !(existsSync(join(DIR, 'guias_1.lua')) && existsSync(rutaQuestieToc())) && 'faltan los datos o la base',
  timeout: 300000,
};

// Términos `r:` y `c:` de un filtro ({{"r:X","c:Y"}, ...}: grupos con «o», términos con «y»).
const tieneBit = (mascara, bit) => Math.floor(mascara / bit) % 2 === 1;
// Ronda 2 (rerrevisión, menor 3): la misión también tiene que ser de la clase del paso (la del filtro del paso o, si no
// lleva, la de la guía); sin clase en ninguno, cualquiera vale.
const deLaClase = (m, clases) => !m.requiredClasses || clases.length === 0
  || clases.some((c) => BIT_CLASE[c] !== undefined && tieneBit(m.requiredClasses, BIT_CLASE[c]));
const terminos = (filtro, letra) => (Array.isArray(filtro) ? filtro : [])
  .map((grupo) => (Array.isArray(grupo) ? grupo : []).filter((t) => t.startsWith(`${letra}:`)).map((t) => t.slice(2)));

test('ningún isQuestTurnedIn de las guías laterales es imposible para su raza, clase y facción', opciones, async () => {
  const { SNF_MISIONES: datos } = await cargarLua([join(DIR, 'nucleo.lua'), join(DIR, 'guias_1.lua')]);
  const fuentes = cargarFuentes();
  const vistas = new Map();
  const vista = (faccion, clase) => {
    const k = `${faccion}:${clase ?? ''}`;
    if (!vistas.has(k)) vistas.set(k, crearVista(fuentes, { faccion, ...(clase ? { clase } : {}) }));
    return vistas.get(k);
  };
  const imposibles = [];
  let vistos = 0;
  for (const g of Object.values(datos.guias)) {
    const faccion = g.faccion;
    const razasGuia = [...new Set(terminos(g.filtro, 'r').flat())];
    const clase = terminos(g.filtro, 'c').flat()[0];
    for (const p of g.pasos ?? []) {
      const deGrupo = terminos(p.filtro, 'r').flat();
      const razas = deGrupo.length > 0 ? deGrupo : (razasGuia.length > 0 ? razasGuia : RAZAS_DE[faccion]);
      const v = vista(faccion, clase);
      const delPaso = terminos(p.filtro, 'c').flat();
      const clases = delPaso.length > 0 ? delPaso : (clase ? [clase] : []);
      for (const e of (p.elementos ?? []).filter((x) => x.t === 'isQuestTurnedIn')) {
        vistos += 1;
        const posible = e.qs.some((q) => { const m = v.mision(q); return m && razas.some((r) => v.aplicaARaza(m, r)) && deLaClase(m, clases); });
        if (!posible) imposibles.push(`${g.clave} paso ${p.n} (${razas.join('/')}${clases.length ? ` ${clases.join('/')}` : ''}): ${e.qs.join(', ')}`);
      }
    }
  }
  assert.ok(vistos > 100, `solo ${vistos} isQuestTurnedIn`);
  assert.deepEqual(imposibles, []);
});
