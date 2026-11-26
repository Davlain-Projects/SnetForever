// Resolvedor de cadenas de misiones de clase (decisión R1 del plan de la fase 3). El catálogo da nombres
// ingleses y aquí se encuentran las misiones en la base:
//   - modo A (`inicio` y `fin`): se sigue la cadena por los enlaces de la base (previas y nextQuestInChain);
//     Si desde la última misión `fin` se llega por enlaces a otra con el mismo nombre, está «cortada» (F3-3);
//   - modo B (`pasos`): una misión distinta por nombre, unidas por un enlace de la base, por un objeto (el
//     objeto donde se entrega una es el que da la siguiente; lote «Cadenas de mejoras») o por el PNJ («el que
//     la entrega da la siguiente»). El primer paso no tiene previa por enlace con su mismo nombre, y ni el
//     objeto ni el PNJ unen con una misión que ya tiene previas por enlace: manda el enlace (F3-2). Si una
//     misión del camino tiene otra sucesora por enlace con el nombre del paso siguiente, «bifurca».
// El universo es el de una clase (cadenas de clase) o, con `universo: 'mejora'`, el de las mejoras: todas las
// misiones que no son de clase y valen para la raza y la facción de la vista (lote «Cadenas de mejoras»).
// Nunca adivina: si la base no basta (no hay inicio, hay dos, bifurca, se corta…), devuelve ok = false con
// un motivo en español que cita la raza, los nombres y las IDs.
import { ORDEN_CLASE, BIT_CLASE } from '../questie/vista.js';

const NIVEL_MAXIMO = 59;
const PRIMERA_ID_FOREVER = 90000;

const lista = (v) => (Array.isArray(v) ? v : []);
const porId = (a, b) => a - b;

/**
 * Misiones de la clase: las de su QuestSort o con su bit exacto en requiredClasses, hasta el nivel 59.
 * @returns {Map<number, object>}
 */
export function universoDeClase(vista, clase) {
  const orden = ORDEN_CLASE[clase];
  const bit = BIT_CLASE[clase];
  if (orden === undefined || bit === undefined) throw new Error(`clase desconocida: ${clase}`);
  const universo = new Map();
  for (const [id, q] of vista.misiones()) {
    if (q.zoneOrSort !== orden && q.requiredClasses !== bit) continue;
    if ((q.requiredLevel ?? 0) > NIVEL_MAXIMO) continue;
    universo.set(id, q);
  }
  return universo;
}

/**
 * Misiones de las mejoras (lote «Cadenas de mejoras»): todas las de la vista (su facción) que no son de clase, ni
 * por su QuestSort ni por requiredClasses. Sin tope de nivel (hay mejoras de nivel 60). La raza se mira después.
 * @returns {Map<number, object>}
 */
export function universoDeMejora(vista) {
  const deClase = new Set(Object.values(ORDEN_CLASE));
  const universo = new Map();
  for (const [id, q] of vista.misiones()) {
    if (q.requiredClasses || deClase.has(q.zoneOrSort)) continue;
    universo.set(id, q);
  }
  return universo;
}

// Grafo de la variante: U (el universo para la raza), las migas y pred/succ sin migas.
// Las migas no son nodos de la cadena: ni cuentan como previas ni sus nextQuestInChain crean aristas.
function grafoDeUniverso(vista, universo, raza) {
  const U = new Map();
  for (const [id, q] of universo) if (vista.aplicaARaza(q, raza)) U.set(id, q);
  const migas = new Set();
  for (const [id, q] of U) if (q.breadcrumbForQuestId && U.has(q.breadcrumbForQuestId)) migas.add(id);
  const nodos = new Map([...U].filter(([id]) => !migas.has(id)));
  const pred = new Map([...nodos.keys()].map((id) => [id, new Set()]));
  const succ = new Map([...nodos.keys()].map((id) => [id, new Set()]));
  const unir = (a, b) => { pred.get(b).add(a); succ.get(a).add(b); };
  for (const [id, q] of nodos) {
    for (const p of [...lista(q.preQuestSingle), ...lista(q.preQuestGroup)]) if (nodos.has(p)) unir(p, id);
    const n = q.nextQuestInChain;
    if (n && nodos.has(n)) unir(id, n);
  }
  return { U, migas, nodos, pred, succ, vista };
}

// Grafo de la clase para la raza. Lo usa también la herramienta de consulta (listar.js), para que liste el mismo
// grafo que se resuelve.
export function grafoDeClase(vista, clase, raza) {
  return grafoDeUniverso(vista, universoDeClase(vista, clase), raza);
}

/** Grafo de las mejoras para la raza (ver universoDeMejora). */
export function grafoDeMejora(vista, raza) {
  return grafoDeUniverso(vista, universoDeMejora(vista), raza);
}

const nombre = (g, id) => g.U.get(id)?.name ?? '?';
const cita = (g, id) => `"${nombre(g, id)}" (${id})`;
const citas = (g, ids) => ids.map((id) => cita(g, id)).join(', ');

const DESEMPATES = {
  forever: (id) => id >= PRIMERA_ID_FOREVER,
  classic: (id) => id < PRIMERA_ID_FOREVER,
};

// El desempate solo actúa con más de un candidato (un valor desconocido ya se ha rechazado antes).
function aplicarDesempate(candidatos, desempate) {
  if (candidatos.length <= 1 || desempate === undefined) return candidatos;
  return candidatos.filter(DESEMPATES[desempate]);
}

// Previas de cada misión de la cadena que no están en ella: preQuestSingle (basta una) y preQuestGroup (todas).
function previasDe(g, misiones) {
  const enCadena = new Set(misiones);
  const previas = new Map();
  for (const id of misiones) {
    const q = g.U.get(id);
    // Lote H: preQuestSingle se cumple con una cualquiera; si una ya está en la cadena, no se pide ninguna otra.
    const una = lista(q.preQuestSingle);
    previas.set(id, {
      una: una.some((p) => enCadena.has(p)) ? [] : una,
      todas: lista(q.preQuestGroup).filter((p) => !enCadena.has(p)),
    });
  }
  return previas;
}

function exito(g, raza, misiones) {
  const primera = misiones[0].q;
  const migas = [...g.migas].filter((id) => g.U.get(id).breadcrumbForQuestId === primera).sort(porId);
  return { ok: true, raza, misiones, migas, previas: previasDe(g, misiones.map((x) => x.q)) };
}

// Recorrido del modo A desde `desde`: lineal por succ, uniendo ramas por preQuestGroup, y cortado tras la
// última misión llamada `fin`. Devuelve {ok: true, cadena: ids} o {ok: false, causa, motivo} (sin la raza),
// con causa "bucle", "bifurca" o "no-llega".
function recorrer(g, desde, fin) {
  const recorrido = [desde];
  const vistos = new Set(recorrido);
  let vioFin = nombre(g, desde) === fin;
  const meter = (id) => {
    if (vistos.has(id)) return false;
    vistos.add(id);
    recorrido.push(id);
    if (nombre(g, id) === fin) vioFin = true;
    return true;
  };
  const fallo = (causa, motivo) => ({ ok: false, causa, motivo });
  for (let actual = desde; ;) {
    const sucesores = [...g.succ.get(actual)].sort(porId);
    if (sucesores.length === 0) break;
    if (sucesores.length === 1) {
      if (!meter(sucesores[0])) return fallo('bucle', `bucle: ${cita(g, actual)} vuelve a ${cita(g, sucesores[0])}`);
      [actual] = sucesores;
      continue;
    }
    // Ramas que se unen: todas con un único sucesor común que las pide todas en preQuestGroup.
    const siguientes = sucesores.map((id) => [...g.succ.get(id)]);
    const j = siguientes[0].length === 1 ? siguientes[0][0] : undefined;
    const grupo = j === undefined ? [] : lista(g.U.get(j).preQuestGroup);
    if (j !== undefined && siguientes.every((s) => s.length === 1 && s[0] === j)
      && sucesores.every((id) => grupo.includes(id))) {
      for (const id of [...sucesores, j]) {
        if (!meter(id)) return fallo('bucle', `bucle: ${cita(g, actual)} vuelve a ${cita(g, id)}`);
      }
      actual = j;
      continue;
    }
    if (vioFin) break;
    return fallo('bifurca', `la cadena bifurca tras ${cita(g, actual)}: ${citas(g, sucesores)}, sin haber llegado a "${fin}"`);
  }

  let ultima = -1;
  recorrido.forEach((id, i) => { if (nombre(g, id) === fin) ultima = i; });
  if (ultima < 0) {
    return fallo('no-llega', `la cadena de ${cita(g, desde)} no llega a "${fin}"; acaba en ${cita(g, recorrido[recorrido.length - 1])}`);
  }
  return { ok: true, cadena: recorrido.slice(0, ultima + 1) };
}

function resolverPorEnlaces(g, { clase, raza, inicio, fin, desempate }) {
  const fallo = (motivo) => ({ ok: false, raza, motivo: `${raza}: ${motivo}` });

  // 1. Inicio: se llama `inicio` y ninguna de sus previas se llama igual.
  const todos = [...g.nodos.keys()].filter((id) => nombre(g, id) === inicio
    && ![...g.pred.get(id)].some((p) => nombre(g, p) === inicio)).sort(porId);
  if (todos.length === 0) return fallo(`no encuentro la misión de inicio "${inicio}" entre las de ${clase}`);

  // Con varios inicios, antes del desempate se descartan los que no llegan a `fin` (Ruling F3-1). Los que
  // bifurcan o hacen bucle siguen como aspirantes: no se sabe adónde llevan. Si se descartarían todos,
  // siguen todos y sale el motivo de siempre. Los descartados no son migas: no van a `migas`.
  const recorridos = new Map(todos.map((id) => [id, recorrer(g, id, fin)]));
  const quedan = todos.filter((id) => recorridos.get(id).causa !== 'no-llega');
  const aspirantes = todos.length > 1 && quedan.length > 0 ? quedan : todos;
  const candidatos = aplicarDesempate(aspirantes, desempate);
  if (candidatos.length !== 1) {
    const tras = desempate === undefined ? '' : ` (con desempate "${desempate}" quedan ${candidatos.length})`;
    return fallo(`inicio ambiguo para "${inicio}": ${citas(g, aspirantes)}${tras}`);
  }

  // 2 y 3. Recorrido lineal por succ, cortado tras la última misión llamada `fin`.
  const r = recorridos.get(candidatos[0]);
  if (!r.ok) return fallo(r.motivo);

  // 4. Ruling F3-3: si desde la última misión `fin` se llega por enlaces (para esa raza) a otra que también se
  // llama `fin` y no está en la cadena, el recorrido se ha parado antes de tiempo (una lateral tipo «Fire
  // Sapta» tras haber visto el fin, aunque la otra `fin` quede varios pasos más allá).
  const ultima = r.cadena[r.cadena.length - 1];
  const enCadena = new Set(r.cadena);
  const alcanzables = new Set();
  const pendientes = [ultima];
  while (pendientes.length > 0) {
    for (const s of g.succ.get(pendientes.pop())) {
      if (enCadena.has(s) || alcanzables.has(s)) continue;
      alcanzables.add(s);
      pendientes.push(s);
    }
  }
  const siguen = [...alcanzables].filter((s) => nombre(g, s) === fin).sort(porId);
  if (siguen.length > 0) {
    return fallo(`cadena cortada: desde ${cita(g, ultima)} se llega por enlaces a ${citas(g, siguen)}, que también `
      + `se llama "${fin}"`);
  }
  const misiones = r.cadena.map((q, i) => ({ q, origen: i === 0 ? 'inicio' : 'base' }));
  return exito(g, raza, misiones);
}

// startedBy/finishedBy = [pnjs, objetos, ítems]: ¿algún PNJ (k = 0) u objeto (k = 1) recibe `a` y da `b`?
function comparten(a, b, k) {
  const ini = lista(lista(b.startedBy)[k]);
  return lista(lista(a.finishedBy)[k]).some((id) => ini.includes(id));
}
const unePorObjeto = (a, b) => comparten(a, b, 1);
const unePorPnj = (a, b) => comparten(a, b, 0);

function resolverPorNombres(g, { raza, pasos, desempate, dador }) {
  const fallo = (motivo) => ({ ok: false, raza, motivo: `${raza}: ${motivo}` });
  const candidatosDe = (n) => [...g.nodos.keys()].filter((id) => nombre(g, id) === n).sort(porId);
  // Ruling F3-2 (2): manda el enlace. Si la base dice qué va antes de `b`, ni el objeto ni el PNJ la unen a otra.
  // El objeto va antes que el PNJ: el objeto donde se entrega `a` es el que da `b` (sus questEnds y questStarts).
  const arista = (a, b) => {
    if (g.succ.get(a).has(b)) return 'base';
    if (g.pred.get(b).size > 0) return null;
    if (unePorObjeto(g.U.get(a), g.U.get(b))) return 'objeto';
    if (unePorPnj(g.U.get(a), g.U.get(b))) return 'pnj';
    return null;
  };

  const conNombre = candidatosDe(pasos[0]);
  if (conNombre.length === 0) {
    return fallo(`no encuentro "${pasos[0]}": la cadena se corta en "${pasos[0]}" (paso 1)`);
  }
  // Ruling F3-2 (1): el primer paso no tiene ninguna previa por enlace con su mismo nombre (como el inicio
  // del modo A); así la cadena no se puede «rotar» empezando por la mitad.
  const todosPrimeros = conNombre.filter((id) => ![...g.pred.get(id)].some((p) => nombre(g, p) === pasos[0]));
  if (todosPrimeros.length === 0) {
    return fallo(`no encuentro el primer paso "${pasos[0]}": todas sus misiones tienen una previa por enlace `
      + `con el mismo nombre: ${citas(g, conNombre)}`);
  }
  // Lote H, ronda 1: con `dador`, solo los primeros pasos que da un PNJ con ese nombre (sale de RestedXP, no de la base).
  const delDador = dador === undefined ? todosPrimeros
    : todosPrimeros.filter((id) => lista(lista(g.U.get(id).startedBy)[0]).some((p) => g.vista.pnj(p)?.name === dador));
  if (delDador.length === 0) {
    return fallo(`ningún primer paso "${pasos[0]}" lo da "${dador}": ${citas(g, todosPrimeros)}`);
  }
  const primeros = aplicarDesempate(delDador, desempate);
  if (primeros.length === 0) {
    return fallo(`la cadena se corta en "${pasos[0]}" (paso 1): todas sus misiones quedan descartadas por `
      + `el desempate "${desempate}": ${citas(g, todosPrimeros)}`);
  }

  // Búsqueda en profundidad; basta con saber si hay 0, 1 o más caminos.
  const caminos = [];
  let hasta = 0; // pasos unidos por el camino más largo
  let ultimas = new Set(); // misiones en las que acaba ese camino más largo
  const buscar = (camino) => {
    if (caminos.length > 1) return;
    const i = camino.length;
    if (i > hasta) { hasta = i; ultimas = new Set(); }
    if (i === hasta) ultimas.add(camino[i - 1].q);
    if (i === pasos.length) { caminos.push(camino); return; }
    const a = camino[i - 1].q;
    const siguen = [];
    for (const b of candidatosDe(pasos[i])) {
      if (camino.some((x) => x.q === b)) continue;
      const origen = arista(a, b);
      if (origen) siguen.push({ q: b, origen });
    }
    // Datos 2026.11.13: el desempate también elige entre las que siguen a la anterior (no entre todas las del
    // nombre), así nunca corta un camino que solo sigue por el otro lado.
    const elegidas = new Set(aplicarDesempate(siguen.map((x) => x.q), desempate));
    for (const x of siguen) if (elegidas.has(x.q)) buscar([...camino, x]);
  };
  for (const q of primeros) buscar([{ q, origen: 'inicio' }]);

  if (caminos.length === 0) {
    const n = pasos[hasta];
    const delPaso = candidatosDe(n);
    const anteriores = citas(g, [...ultimas].sort(porId));
    const porque = delPaso.length === 0
      ? `no hay ninguna misión llamada "${n}" que siga a ${anteriores}`
      : `ninguna de ${citas(g, delPaso)} sigue a ${anteriores} por enlace, por objeto ni por PNJ`;
    return fallo(`la cadena se corta en "${n}" (paso ${hasta + 1}): ${porque}`);
  }
  if (caminos.length > 1) {
    const texto = caminos.map((c) => c.map((x) => x.q).join(' → ')).join(' / ');
    return fallo(`cadena ambigua por nombres desde "${pasos[0]}": ${texto}`);
  }
  // Aunque haya un solo camino, si una de sus misiones tiene otra sucesora por enlace (fuera del camino) con
  // el nombre del paso siguiente, la base bifurca ahí: quedarse con la que llega más lejos sería adivinar.
  const [camino] = caminos;
  const enCamino = new Set(camino.map((x) => x.q));
  for (let i = 0; i + 1 < camino.length; i += 1) {
    const a = camino[i].q;
    const delNombre = [...g.succ.get(a)].filter((s) => !enCamino.has(s) && nombre(g, s) === pasos[i + 1]);
    // Datos 2026.11.13: si el desempate ya eligió la del camino, las que descarta no cuentan como bifurcación.
    const otras = aplicarDesempate([camino[i + 1].q, ...delNombre], desempate)
      .filter((s) => s !== camino[i + 1].q).sort(porId);
    if (otras.length > 0) {
      return fallo(`la cadena bifurca tras ${cita(g, a)}: ${citas(g, [camino[i + 1].q, ...otras].sort(porId))} `
        + `se llaman "${pasos[i + 1]}" (paso ${i + 2})`);
    }
  }
  return exito(g, raza, camino);
}

/**
 * Resuelve una variante del catálogo para una raza.
 * @param {object} vista Vista de la base (src/questie/vista.js)
 * @param {{clase?: string, universo?: 'mejora', raza: string, inicio?: string, fin?: string, pasos?: string[],
 *   desempate?: 'forever'|'classic', dador?: string}} variante `clase` hace falta salvo con `universo: 'mejora'`;
 *   `dador` (solo modo B): nombre del PNJ que da el primer paso
 * @returns {{ok: true, raza, misiones: Array<{q, origen: 'inicio'|'base'|'objeto'|'pnj'}>, migas: number[],
 *   previas: Map<number, {una: number[], todas: number[]}>} | {ok: false, raza, motivo: string}}
 */
export function resolverVariante(vista, variante) {
  const { clase, raza, inicio, fin, pasos, universo } = variante;
  if (universo !== undefined && universo !== 'mejora') throw new Error(`universo desconocido: ${universo}`);
  const porEnlaces = inicio !== undefined || fin !== undefined;
  if (porEnlaces === (pasos !== undefined)) throw new Error('la variante lleva inicio y fin, o pasos (y no las dos cosas)');
  if (porEnlaces && (inicio === undefined || fin === undefined)) throw new Error('el modo A necesita inicio y fin');
  if (!porEnlaces && (!Array.isArray(pasos) || pasos.length === 0)) throw new Error('el modo B necesita pasos');
  if (porEnlaces && variante.dador !== undefined) throw new Error('`dador` solo vale con pasos (modo B)');
  const { desempate } = variante;
  if (desempate !== undefined && !Object.hasOwn(DESEMPATES, desempate)) throw new Error(`desempate desconocido: ${desempate}`);
  if (universo === 'mejora') {
    const g = grafoDeMejora(vista, raza);
    const v = { ...variante, clase: 'las mejoras' }; // solo para el texto de los motivos
    return porEnlaces ? resolverPorEnlaces(g, v) : resolverPorNombres(g, v);
  }
  if (typeof clase !== 'string') throw new Error('la variante necesita clase (o universo: "mejora")');
  const g = grafoDeClase(vista, clase, raza);
  return porEnlaces ? resolverPorEnlaces(g, variante) : resolverPorNombres(g, variante);
}
