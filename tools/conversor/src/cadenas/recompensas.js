// Recompensas de las misiones y qué es una mejora (lote «Cadenas de mejoras»). Lo usan las guías de mejora
// (guias-mejoras.js) y el detector de candidatas (detector.js). Todo sale de la base: los ítems traen `questRewards`
// (las misiones que los dan); las misiones no traen sus recompensas.

const lista = (v) => (Array.isArray(v) ? v : []);

/** Misión -> objetos que da de recompensa (questRewards de los ítems de la base). */
export function recompensasPorMision(entidades) {
  const premios = new Map();
  for (const [id, it] of entidades.item) {
    for (const q of lista(it?.questRewards)) (premios.get(q) ?? premios.set(q, []).get(q)).push(id);
  }
  return premios;
}

/**
 * Tipo de mejora de un ítem de recompensa, o null si no es una mejora: una bolsa (clase 1), un objeto vario (clase 15)
 * que no empieza misión, una montura (15/5), una mascota (15/2) o un objeto que enseña un hechizo (teachesSpell).
 */
export function tipoDeMejora(item) {
  if (!item) return null;
  if (item.class === 15 && item.subClass === 5) return 'montura';
  if (item.class === 15 && item.subClass === 2) return 'mascota';
  if (item.class === 1) return 'bolsa';
  if (item.teachesSpell > 0) return 'hechizo';
  if (item.class === 15 && !(item.startQuest > 0)) return 'vario';
  return null;
}

/** Nombre de cada tipo de mejora en los dos idiomas (para los textos que salen de la base). */
export const NOMBRE_TIPO = {
  montura: { es: 'montura', en: 'mount' },
  mascota: { es: 'mascota', en: 'pet' },
  bolsa: { es: 'bolsa', en: 'bag' },
  hechizo: { es: 'enseña un hechizo', en: 'teaches a spell' },
  vario: { es: 'objeto', en: 'item' },
};
