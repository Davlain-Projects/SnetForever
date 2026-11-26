// Lote B (B3, revisión 5.1 I3): id de los PNJ de `.target`, `.mob` y `.unitscan`. RestedXP los nombra en inglés y casi
// nunca trae el id (`Nombre::id`); con el nombre solo, el addon junta todos los PNJ homónimos de la base («Kobold Vermin»,
// «Guard»…) y «Objetivos cercanos» mide la distancia a puntos de otras zonas. Aquí, ya con la base cargada:
//   - si el nombre es único en la base (sin distinguir mayúsculas y sin el «*» de delante), ese id;
//   - si hay varios, el único que tiene puntos de aparición en el mapa del `goto` más cercano del paso (por posición en
//     el paso) o, si el paso no tiene ninguno, del paso más cercano de la guía que lo tenga (a igual distancia, el de antes);
//   - si no se puede decidir sin adivinar (ninguno o varios en ese mapa, sin goto, o el nombre no está), solo el nombre,
//     como hasta ahora, y se apunta con el motivo para el informe de la versión.
// Los que ya traen id no se tocan. Se cambian las guías en su sitio (antes de validar y escribir).
import { convertirPuntos } from '../questie/zonas.js';

const COMANDOS = new Set(['target', 'mob', 'unitscan']);

const claveDe = (nombre) => String(nombre).replace(/^\*+/, '').trim().toLowerCase();

/**
 * Índice de PNJ por nombre a partir de `[id, {name, mapas}]` (mapas: uiMapID con puntos de aparición).
 * @returns {{candidatos(clave: string): Array<{id: number, mapas: Set<number>}>}}
 */
export function crearIndicePnj(entradas) {
  const porNombre = new Map();
  for (const [id, { name, mapas }] of entradas) {
    if (typeof name !== 'string' || name === '') continue;
    const clave = claveDe(name);
    if (!porNombre.has(clave)) porNombre.set(clave, []);
    porNombre.get(clave).push({ id: Number(id), mapas: new Set([...(mapas ?? [])].map(Number)) });
  }
  for (const lista of porNombre.values()) lista.sort((a, b) => a.id - b.id);
  return { candidatos: (clave) => porNombre.get(clave) ?? [] };
}

/** El índice con los PNJ de la base de QuestieDB (`leerEntidades`): sus spawns, por AreaID, pasados a uiMapID. */
export function indicePnjDeBase(entidades, zonas) {
  const entradas = [];
  for (const [id, npc] of entidades.npc ?? []) {
    entradas.push([id, { name: npc?.name, mapas: Object.keys(convertirPuntos(npc?.spawns, zonas).mapas) }]);
  }
  return crearIndicePnj(entradas);
}

const esGoto = (el) => el?.t === 'goto' && typeof el.mapa === 'number';

// El mapa del goto más cercano al elemento `i` del paso `p` (por posición en el paso; a igual distancia, el de antes) o,
// si el paso no tiene ninguno, el del paso más cercano de la guía con algún goto (en ese paso, el último si está antes y
// el primero si está después). null si la guía no tiene ningún goto.
function mapaCercano(pasos, p, i) {
  const elementos = pasos[p].elementos ?? [];
  let mejor = null;
  elementos.forEach((el, j) => {
    if (!esGoto(el)) return;
    const d = Math.abs(j - i);
    if (mejor === null || d < mejor.d) mejor = { d, mapa: el.mapa };
  });
  if (mejor) return mejor.mapa;
  for (let d = 1; d < pasos.length; d++) {
    const antes = pasos[p - d]?.elementos;
    const goto = antes && [...antes].reverse().find(esGoto);
    if (goto) return goto.mapa;
    const despues = pasos[p + d]?.elementos;
    const siguiente = despues && despues.find(esGoto);
    if (siguiente) return siguiente.mapa;
  }
  return null;
}

/**
 * Pone el id a los PNJ de target/mob/unitscan de las guías que lo dejan decidir (cambia las guías en su sitio).
 * @param {Iterable<{clave: string, pasos: object[]}>} guias
 * @param {{candidatos(clave: string): Array<{id: number, mapas: Set<number>}>}} indice
 * @returns {{resueltos: number, sinId: Array<{guia, linea, nombre, motivo, mapa, candidatos: number[]}>}}
 *   motivo: 'no-esta-en-la-base' | 'sin-goto' | 'ninguno-en-el-mapa' | 'varios-en-el-mapa'
 */
export function resolverPnjs(guias, indice) {
  let resueltos = 0;
  const sinId = [];
  for (const guia of guias) {
    const pasos = guia?.pasos ?? [];
    pasos.forEach((paso, p) => {
      (paso.elementos ?? []).forEach((el, i) => {
        if (!COMANDOS.has(el?.t) || !Array.isArray(el.npcs)) return;
        for (const npc of el.npcs) {
          if (!npc || npc.id !== undefined || typeof npc.nombre !== 'string') continue;
          const candidatos = indice.candidatos(claveDe(npc.nombre));
          const apuntar = (motivo, mapa = null) => sinId.push({
            guia: guia.clave, linea: el.linea ?? paso.linea, nombre: npc.nombre, motivo, mapa, candidatos: candidatos.map((c) => c.id),
          });
          if (candidatos.length === 0) { apuntar('no-esta-en-la-base'); continue; }
          if (candidatos.length === 1) { npc.id = candidatos[0].id; resueltos++; continue; }
          const mapa = mapaCercano(pasos, p, i);
          if (mapa === null) { apuntar('sin-goto'); continue; }
          const enMapa = candidatos.filter((c) => c.mapas.has(mapa));
          if (enMapa.length === 1) { npc.id = enMapa[0].id; resueltos++; continue; }
          apuntar(enMapa.length === 0 ? 'ninguno-en-el-mapa' : 'varios-en-el-mapa', mapa);
          if (enMapa.length > 1) sinId[sinId.length - 1].candidatos = enMapa.map((c) => c.id);
        }
      });
    });
  }
  return { resueltos, sinId };
}
