// Detector de candidatas a cadenas de mejoras (lote «Cadenas de mejoras»). Recorre la base y lista las cadenas cuya
// misión final da una mejora, para que el jugador elija cuáles pasan a guía. No escribe guías: eso es mejoras.js.
//
// Para cada facción y raza, el universo es el de las mejoras (todas las misiones que no son de clase y valen para la
// raza: su máscara). Una misión va unida a sus previas por:
//   - las previas declaradas (preQuestSingle, preQuestGroup) y nextQuestInChain;
//   - el objeto compartido: la anterior se entrega en un objeto que da la siguiente (vista.previasPorObjeto, que ya
//     separa los inicios espejo de cada facción con la máscara y no deduce nada en un ciclo de dos).
// La cadena de una misión final son todas sus previas, hasta el principio (cualquier ciclo se corta: cada misión se
// visita una vez). Solo cuentan las que tienen al menos dos misiones.
//
// Mejora (tipoDeMejora): una bolsa (clase 1), un objeto vario (clase 15) que no empieza misión, una montura
// (15/5), una mascota (15/2) o un objeto que enseña un hechizo (teachesSpell). La base no trae juguetes ni dice
// qué misiones enseñan un hechizo: esas no se pueden detectar.
import { FACCIONES, vistaDe } from './fuentes.js';
import { universoDeMejora } from './resolver.js';
import { recompensasPorMision, tipoDeMejora } from './recompensas.js';
import { RAZAS_DE } from '../questie/vista.js';

const lista = (v) => (Array.isArray(v) ? v : []);
const SIGLA = { Horde: 'H', Alliance: 'A', ambas: 'H+A' };
const ORDEN_FACCION = { Horde: 0, Alliance: 1, ambas: 2 };

// QuestSort de fiestas y eventos de temporada (los mismos que deja fuera la ruta de zona de la app).
const SORT_EVENTO = new Set([-21, -22, -41, -364, -365, -366, -368, -369, -370, -374, -375, -376, -378]);
const BOTIN = 4; // flag de los ítems que se abren (contenedores de botín)
const REPETIBLE = 1; // specialFlags de las misiones repetibles

// Puntos de lo útil que parece una mejora (más es mejor). Ver «Orden» en informeDeMejoras.
const PUNTOS_TIPO = { montura: 50, bolsa: 40, mascota: 30, vario: 30, hechizo: 25, contenedor: 10 };
const PUNTOS_OBJETO = 15; // cadenas unidas por objetos: no las une ninguna previa, nadie más las enseña
const CASTIGO_EVENTO = 30;
const CASTIGO_REPETIBLE = 20;

export { tipoDeMejora };

// Previas de cada misión del universo para la raza: Map(b -> Map(a -> 'base' | 'objeto')).
function previasDeRaza(vista, U, raza) {
  const pred = new Map([...U.keys()].map((id) => [id, new Map()]));
  for (const [b, q] of U) {
    for (const a of [...lista(q.preQuestSingle), ...lista(q.preQuestGroup)]) if (U.has(a) && a !== b) pred.get(b).set(a, 'base');
    const n = q.nextQuestInChain;
    if (n && n !== b && U.has(n)) pred.get(n).set(b, 'base');
  }
  for (const b of U.keys()) {
    for (const a of vista.previasPorObjeto(b, raza)) if (U.has(a) && !pred.get(b).has(a)) pred.get(b).set(a, 'objeto');
  }
  return pred;
}

// Todas las previas de `final` (con ella), en orden: primero las que no tienen previas dentro, por nivel e id. Un
// ciclo no se recorre dos veces; lo que queda de él va al final, por id.
function cadenaDe(final, pred, U) {
  const dentro = new Set([final]);
  let conObjeto = false;
  const pila = [final];
  while (pila.length > 0) {
    for (const [a, origen] of pred.get(pila.pop())) {
      if (origen === 'objeto') conObjeto = true;
      if (!dentro.has(a)) { dentro.add(a); pila.push(a); }
    }
  }
  const nivel = (id) => U.get(id).requiredLevel ?? 0;
  const faltan = new Map([...dentro].map((id) => [id, [...pred.get(id).keys()].filter((a) => dentro.has(a)).length]));
  const orden = [];
  const hechas = new Set();
  for (;;) {
    const listas = [...faltan].filter(([id, n]) => n === 0 && !hechas.has(id)).map(([id]) => id)
      .sort((a, b) => nivel(a) - nivel(b) || a - b);
    if (listas.length === 0) break;
    const [id] = listas;
    hechas.add(id);
    orden.push(id);
    for (const [b] of faltan) if (pred.get(b).has(id) && !hechas.has(b)) faltan.set(b, faltan.get(b) - 1);
  }
  orden.push(...[...dentro].filter((id) => !hechas.has(id)).sort((a, b) => a - b));
  // La final, al final (si un ciclo la ha movido).
  return { cadena: [...orden.filter((id) => id !== final), final], conObjeto };
}

/**
 * Candidatas a cadenas de mejoras, de la más útil a la menos.
 * @param {{entidades, correcciones, zonas}} fuentes las de cargarFuentes (o de prueba)
 * @returns {Array<{final, nombre, faccion: 'Horde'|'Alliance'|'ambas', razas: string[], nivel, misiones, cadena: number[],
 *   inicio: string, recompensas: Array<{id, nombre, tipo}>, conObjeto, evento, repetible, puntos}>}
 */
export function detectarMejoras(fuentes) {
  const premios = recompensasPorMision(fuentes.entidades);
  const porCadena = new Map(); // `${final}|${cadena}` -> candidata con sus facciones
  for (const faccion of FACCIONES) {
    const vista = vistaDe(fuentes, faccion);
    const universo = universoDeMejora(vista);
    for (const raza of RAZAS_DE[faccion]) {
      const U = new Map([...universo].filter(([, q]) => vista.aplicaARaza(q, raza)));
      let pred;
      for (const [final, q] of U) {
        const recompensas = (premios.get(final) ?? []).map((id) => ({ id, it: vista.item(id) }))
          .map(({ id, it }) => {
            const tipo = tipoDeMejora(it);
            return tipo && { id, nombre: it.name, tipo: tipo === 'vario' && (it.flags ?? 0) % (2 * BOTIN) >= BOTIN ? 'contenedor' : tipo };
          })
          .filter(Boolean);
        if (recompensas.length === 0) continue;
        pred ??= previasDeRaza(vista, U, raza);
        const { cadena, conObjeto } = cadenaDe(final, pred, U);
        if (cadena.length < 2) continue;
        const clave = `${final}|${cadena.join(',')}`;
        let c = porCadena.get(clave);
        if (!c) {
          const misiones = cadena.map((id) => U.get(id));
          c = {
            final,
            nombre: q.name,
            facciones: new Map(),
            nivel: Math.min(...misiones.map((m) => m.requiredLevel ?? 0)),
            misiones: cadena.length,
            cadena,
            inicio: U.get(cadena[0]).name,
            recompensas,
            conObjeto,
            evento: misiones.some((m) => SORT_EVENTO.has(m.zoneOrSort)),
            repetible: Math.floor((q.specialFlags ?? 0) / REPETIBLE) % 2 === 1,
          };
          porCadena.set(clave, c);
        }
        if (!c.facciones.has(faccion)) c.facciones.set(faccion, []);
        c.facciones.get(faccion).push(raza);
      }
    }
  }
  const salida = [...porCadena.values()].map(({ facciones, ...c }) => {
    const faccion = facciones.size === 2 ? 'ambas' : [...facciones.keys()][0];
    const razas = [...new Set([...facciones.values()].flat())];
    const mejor = Math.max(...c.recompensas.map((r) => PUNTOS_TIPO[r.tipo]));
    const puntos = mejor + (c.conObjeto ? PUNTOS_OBJETO : 0) - (c.evento ? CASTIGO_EVENTO : 0)
      - (c.repetible ? CASTIGO_REPETIBLE : 0);
    return { ...c, faccion, razas, puntos };
  });
  return salida.sort((a, b) => b.puntos - a.puntos || a.nivel - b.nivel || a.nombre.localeCompare(b.nombre)
    || ORDEN_FACCION[a.faccion] - ORDEN_FACCION[b.faccion] || a.final - b.final);
}

const escapar = (s) => String(s ?? '').replace(/\|/g, '\\|');

/**
 * Informe en Markdown de las candidatas (artifacts/reports/mejoras-candidatas-<versión>.md).
 * @param {object[]} candidatas salida de detectarMejoras
 * @param {{version: string, base?: {version, commit}}} datos
 */
export function informeDeMejoras(candidatas, { version, base }) {
  const L = [`# Candidatas a cadenas de mejoras (${version})`, ''];
  L.push(`Generado por \`npm run cadenas -- --mejoras\` a partir de QuestieDB${base?.version ? ` ${base.version}` : ''}`
    + `${base?.commit ? ` (${base.commit})` : ''}. ${candidatas.length} candidatas.`, '');
  L.push('Una cadena es una misión que da una mejora (bolsa, objeto vario que no empieza misión, montura, mascota u objeto que '
    + 'enseña un hechizo) con todas sus previas: las declaradas, nextQuestInChain y las que se deducen por un objeto '
    + 'compartido (la anterior se entrega en el objeto que da la siguiente). Las misiones de clase no cuentan.', '');
  L.push('Orden: lo útil que parece. Montura 50, bolsa 40, mascota y objeto vario 30, hechizo 25 y contenedor de botín '
    + '(un objeto que se abre) 10; +15 si la cadena va unida por objetos (nadie más la enseña), −30 si es de una fiesta '
    + 'o evento y −20 si la última es repetible. Con los mismos puntos, primero las de menos nivel.', '');
  L.push('La base no trae juguetes ni dice qué misiones enseñan un hechizo: esas no salen.', '');
  L.push('| # | Misión final | Facción | Nivel | Misiones | Recompensa | Enlaces por objeto | Empieza en | Puntos |',
    '|---|---|---|---|---|---|---|---|---|');
  candidatas.forEach((c, i) => {
    const recompensa = c.recompensas.map((r) => `${r.nombre} (${r.tipo})`).join(', ');
    const marcas = [c.evento ? 'evento' : '', c.repetible ? 'repetible' : ''].filter(Boolean).join(', ');
    L.push(`| ${i + 1} | ${escapar(c.nombre)} | ${SIGLA[c.faccion]} | ${c.nivel} | ${c.misiones} | ${escapar(recompensa)} | `
      + `${c.conObjeto ? 'sí' : 'no'} | ${escapar(c.inicio)}${marcas ? ` (${marcas})` : ''} | ${c.puntos} |`);
  });
  L.push('', '## Cadenas', '');
  candidatas.forEach((c, i) => {
    L.push(`${i + 1}. ${escapar(c.nombre)} (${SIGLA[c.faccion]}, ${c.razas.join(', ')}): ${c.cadena.join(' → ')}`);
  });
  L.push('');
  return L.join('\n');
}
