// Lote H, ronda 1: misiones de la base que no entran en los datos (ni en las guías, ni en las rutas de zona de la app,
// ni en los avisos, ni en lo que ve la IA), con su motivo para el informe:
//   - las que Questie oculta en el Forever (su lista negra, ver lista-negra.js), con la línea de la lista;
//   - las de ids 60000-89999 (ni clásicas ni del rango propio del Forever, 90000 o más; son de otras temporadas, como la
//     Temporada de Descubrimiento). Desde el 11-nov (pedido del autor: «si no se usan se quitan») salen todas las que no
//     tienen prueba del juego, aunque tengan un dador con punto en la base (antes, eso bastaba para quedarse).
// Manda el juego: se queda la que sale en las guías de RXPGuides o la tiene hecha un personaje de la cuenta (lista
// `complete` de Questie en el WTF). Y no se quita ninguna de una cadena de clase o de mejora que ya se resolvía: se
// queda y se apunta (para que lo decida el jugador). Las basura (esMisionBasura) se descartan aparte, como siempre.
// Ronda 2: tampoco sale la de la lista negra que Questie vuelve a enseñar con su evento (lista-negra.js, leerEventos):
// existe en el juego, aunque solo en temporada. Se queda «por evento» (las guías laterales no la usan: convertir.js).
import { convertirPuntos } from './zonas.js';
import { esMisionBasura } from '../escribir/misiones.js';

const DESDE_OTRA_TEMPORADA = 60000;
const HASTA_OTRA_TEMPORADA = 89999;
const lista = (v) => (Array.isArray(v) ? v : []);

function conPunto(registro, zonas) {
  const p = convertirPuntos(registro?.spawns, zonas);
  return Object.keys(p.mapas).length > 0 || p.mazmorras.length > 0;
}

/** ¿La da alguien con punto en la base? PNJ u objeto con puntos, o un ítem que suelta un PNJ u objeto con puntos. */
export function tieneDadorConPunto(q, { entidades, zonas }) {
  const [pnjs, objetos, items] = [0, 1, 2].map((k) => lista(lista(q?.startedBy)[k] ?? q?.startedBy?.[k]));
  if (pnjs.some((id) => conPunto(entidades.npc.get(id), zonas))) return true;
  if (objetos.some((id) => conPunto(entidades.object.get(id), zonas))) return true;
  return items.some((id) => {
    const it = entidades.item.get(id);
    return lista(it?.npcDrops).some((n) => conPunto(entidades.npc.get(n), zonas))
      || lista(it?.objectDrops).some((o) => conPunto(entidades.object.get(o), zonas));
  });
}

/**
 * @param {{entidades, zonas, listaNegra: Map<number, {linea, nota}> | null, enGuiasRxp: Set<number>,
 *   completadas: Map<number, Set<string>>, enCadenas: Map<number, string>}} fuentes `enCadenas`: misión → id de la
 *   cadena de clase o de mejora en la que está (resuelta sin quitar nada); `eventos`: misión → evento que la destapa
 * @returns {{excluidas: Map<number, string>, conservadas: Array<{id, nombre, regla, porque, linea?, nota?}>,
 *   porEvento: Map<number, string>, cuenta: {listaNegra, listaNegraFuera, otraTemporadaFuera, conservadas, porEvento}}}
 */
export function misionesExcluidas({
  entidades, zonas, listaNegra, enGuiasRxp, completadas, enCadenas, eventos = new Map(),
}) {
  const excluidas = new Map();
  const conservadas = [];
  const porEvento = new Map();
  const cuenta = { listaNegra: 0, listaNegraFuera: 0, otraTemporadaFuera: 0, conservadas: 0, porEvento: 0 };
  const porQueSeQueda = (id) => {
    if (enGuiasRxp.has(id)) return 'sale en las guías de RXPGuides';
    if (completadas.has(id)) return `la tiene hecha ${[...completadas.get(id)].sort().join(', ')} (Questie, WTF)`;
    if (enCadenas.has(id)) return `está en la cadena ${enCadenas.get(id)}`;
    if (eventos.has(id)) return `se queda por evento (${eventos.get(id)})`;
    return null;
  };
  for (const id of [...entidades.quest.keys()].sort((a, b) => a - b)) {
    const q = entidades.quest.get(id);
    if (esMisionBasura(q)) continue;
    const negra = listaNegra?.get(id);
    let regla = null;
    let motivo = null;
    if (negra) {
      cuenta.listaNegra += 1;
      regla = 'lista-negra';
      motivo = `lista negra de Questie (QuestieQuestBlacklist.lua:${negra.linea}${negra.nota ? `: ${negra.nota}` : ''})`;
    } else if (id >= DESDE_OTRA_TEMPORADA && id <= HASTA_OTRA_TEMPORADA) {
      regla = 'otra-temporada';
      motivo = `otra temporada (id ${DESDE_OTRA_TEMPORADA}-${HASTA_OTRA_TEMPORADA}) sin prueba de que exista en el Forever `
        + '(ni en RXPGuides, ni hecha, ni en una cadena, ni de evento)';
    }
    if (!regla) continue;
    const porque = porQueSeQueda(id);
    if (porque) {
      conservadas.push({ id, nombre: q.name, regla, porque, ...(negra ? { linea: negra.linea, nota: negra.nota } : {}) });
      cuenta.conservadas += 1;
      if (porque.startsWith('se queda por evento')) { porEvento.set(id, eventos.get(id)); cuenta.porEvento += 1; }
      continue;
    }
    excluidas.set(id, motivo);
    if (regla === 'lista-negra') cuenta.listaNegraFuera += 1;
    else cuenta.otraTemporadaFuera += 1;
  }
  return { excluidas, conservadas, porEvento, cuenta };
}
