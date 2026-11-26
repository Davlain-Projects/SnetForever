// Índice de misiones por mazmorra (R6 de la fase 3). Sale solo de la base: no se escribe ninguna ID a mano
// y un punto que no está en la base no existe.
//   - Entra un área de `zonas.mazmorras` si tiene una instancia que OpenMap conoce o una sigla de RestedXP.
//     Las áreas con el mismo nombre que otra que sí entra (las alas de Dire Maul) se juntan con ella.
//   - Una misión entra en una mazmorra si cumple la primera de estas condiciones: su zoneOrSort es la
//     mazmorra («zona»), un objetivo es un PNJ («pnj») u objeto («objeto») que solo aparece en ella, o un
//     objetivo es un ítem cuyas fuentes están todas en ella («item»).
//   - Fuentes de un ítem: lo que sueltan PNJ y objetos y lo que venden los PNJ. Si alguna fuente no tiene
//     spawns en la base, o el ítem sale de otro ítem (contenedor), no se puede demostrar que todas estén
//     dentro y el ítem no da criterio.
//   - `recoge`/`entrega`: el primer PNJ, objeto o ítem con punto; `enMazmorra` = AreaID de la mazmorra del
//     índice (las alas, el de su grupo) cuando solo se sabe que está dentro.
import { crearVista, BIT_RAZA, BIT_CLASE } from '../questie/vista.js';
import { MAZMORRAS } from '../rxp/comandos.js';

const FACCIONES = ['Horde', 'Alliance'];
const lista = (v) => (Array.isArray(v) ? v : []);
const tieneBit = (mascara, bit) => Math.floor(mascara / bit) % 2 === 1;
const menor = (a, b) => a - b;

// Razas y clases (nombre de BIT_RAZA / BIT_CLASE) de una máscara; undefined si la misión no las limita.
function razasDe(mascara) {
  if (!mascara) return undefined;
  const razas = Object.keys(BIT_RAZA).filter((r) => (r === 'Skyborne'
    ? tieneBit(mascara, BIT_RAZA.Skyborne.Alliance) || tieneBit(mascara, BIT_RAZA.Skyborne.Horde)
    : tieneBit(mascara, BIT_RAZA[r])));
  return razas.length > 0 && razas.length < Object.keys(BIT_RAZA).length ? razas : undefined;
}
function clasesDe(mascara) {
  if (!mascara) return undefined;
  const clases = Object.keys(BIT_CLASE).filter((c) => tieneBit(mascara, BIT_CLASE[c]));
  return clases.length > 0 ? clases : undefined;
}

// Agrupa las mazmorras de la base: devuelve {grupos: Map<canónica, {area, nombre, areas: Set, instancias, sigla}>,
// avisos}. `instanciasOpenMap` = Map instanceID -> entradas de OpenMap (vacío sin OpenMap).
function agrupar(zonas, instancias, instanciasOpenMap, avisos) {
  const areasDe = (a) => [a, ...zonas.mazmorras.get(a).alternativas];
  const siglaDe = (areas) => Object.entries(MAZMORRAS).find(([, area]) => areas.includes(area))?.[0];
  const instDe = (areas) => [...instancias].filter(([, area]) => areas.includes(area)).map(([i]) => i);

  const propias = new Map();
  for (const a of zonas.mazmorras.keys()) {
    const areas = areasDe(a);
    const todas = instDe(areas).sort(menor);
    propias.set(a, { areas, todas, openmap: todas.filter((i) => instanciasOpenMap.has(i)), sigla: siglaDe(areas) });
  }
  const entra = (a) => propias.get(a).openmap.length > 0 || propias.get(a).sigla !== undefined;

  const porNombre = new Map();
  for (const a of [...zonas.mazmorras.keys()].sort(menor)) {
    const nombre = zonas.mazmorras.get(a).nombre;
    if (!porNombre.has(nombre)) porNombre.set(nombre, []);
    porNombre.get(nombre).push(a);
  }

  const grupos = new Map();
  for (const [nombre, miembros] of porNombre) {
    const canonica = miembros.find((a) => propias.get(a).openmap.length > 0) ?? miembros.find((a) => entra(a));
    if (canonica === undefined) {
      for (const a of miembros) {
        avisos.push(`área ${a} (${nombre}): sin instancia en OpenMap ni sigla de RestedXP, queda fuera del índice`);
      }
      continue;
    }
    const areas = new Set(miembros.flatMap((a) => propias.get(a).areas));
    const todas = miembros.flatMap((a) => propias.get(a).todas).sort(menor);
    const deOpenMap = miembros.flatMap((a) => propias.get(a).openmap).sort(menor);
    const sigla = miembros.map((a) => propias.get(a).sigla).find((s) => s !== undefined);
    grupos.set(canonica, { area: canonica, nombre, areas, todas, deOpenMap, sigla });
  }
  return { grupos, aGrupo: new Map([...grupos.values()].flatMap((g) => [...g.areas].map((a) => [a, g.area]))) };
}

// Niveles y banda de la mazmorra: de la instancia elegida en OpenMap; sin ellos, de sus misiones.
function nivelesYBanda(grupo, instanciasOpenMap, misiones) {
  const entradas = grupo.deOpenMap.length > 0 ? instanciasOpenMap.get(grupo.deOpenMap[0]) : [];
  const banda = entradas.some((e) => e.banda === true);
  const mins = entradas.map((e) => e.min).filter((n) => typeof n === 'number');
  const maxs = entradas.map((e) => e.max).filter((n) => typeof n === 'number');
  if (mins.length > 0 && maxs.length > 0) {
    return { banda, niveles: { min: Math.min(...mins), max: Math.max(...maxs) }, fuenteNiveles: 'OpenMap' };
  }
  // Un nivel 0 es «sin dato»: no cuenta.
  const nivelesMin = misiones.map((m) => m.nivel).filter((n) => n > 0);
  const nivelesMax = misiones.map((m) => m.nivelMision).filter((n) => n > 0);
  if (nivelesMin.length > 0 && nivelesMax.length > 0) {
    return { banda, niveles: { min: Math.min(...nivelesMin), max: Math.max(...nivelesMax) }, fuenteNiveles: 'misiones' };
  }
  return { banda };
}

/**
 * @param {{entidades: object, correcciones: object, zonas: object, openmap: object|null,
 *   instancias: Map<number, number>}} fuentes salidas de leerEntidades, leerCorrecciones, cargarZonas,
 *   leerOpenMap (puede ser null: entonces solo entran las áreas con sigla de RestedXP) y leerInstancias
 * @returns {{porMazmorra: object, instancias: object, filas: object[], avisos: string[]}}
 */
export function indexarMazmorras({ entidades, correcciones, zonas, openmap, instancias }) {
  const avisos = [];
  const instanciasOpenMap = new Map();
  for (const e of openmap?.instancias ?? []) {
    if (!instanciasOpenMap.has(e.instancia)) instanciasOpenMap.set(e.instancia, []);
    instanciasOpenMap.get(e.instancia).push(e);
  }
  if (!openmap) avisos.push('sin OpenMap: solo entran las mazmorras con sigla de RestedXP y no hay niveles de OpenMap');

  const { grupos, aGrupo } = agrupar(zonas, instancias, instanciasOpenMap, avisos);
  const encontradas = new Map([...grupos.keys()].map((a) => [a, new Map()])); // área -> Map q -> entrada

  for (const faccion of FACCIONES) {
    const vista = crearVista({ entidades, correcciones, zonas }, { faccion });
    // Áreas donde aparece una entidad (las claves de sus spawns, sin contar el centinela).
    const areasDe = (tipo, id) => Object.keys(vista[tipo](id)?.spawns ?? {}).map(Number);
    const areasDeLista = (tipo, ids) => lista(ids).flatMap((id) => areasDe(tipo, id));

    // Criterios de una misión en el orden de R6: [motivo, áreas donde aparece] (sin áreas no hay criterio).
    function criterios(q) {
      const obj = lista(q.objectives);
      const salida = [];
      for (const o of lista(obj[0])) salida.push(['pnj', areasDe('pnj', o?.[0])]);
      // Crédito de muerte: [[ids que cuentan], id base, …].
      for (const o of lista(obj[4])) salida.push(['pnj', [...areasDeLista('pnj', o?.[0]), ...areasDe('pnj', o?.[1])]]);
      for (const o of lista(obj[1])) salida.push(['objeto', areasDe('objeto', o?.[0])]);
      for (const o of lista(obj[2])) {
        const item = vista.item(o?.[0]);
        if (!item || lista(item.itemDrops).length > 0) continue;
        // Estricto: si una sola fuente no tiene spawns en la base, no se puede demostrar que todas estén dentro.
        const fuentes = [...lista(item.npcDrops).map((i) => ['pnj', i]), ...lista(item.objectDrops).map((i) => ['objeto', i]),
          ...lista(item.vendors).map((i) => ['pnj', i])];
        const areas = fuentes.map(([tipo, i]) => areasDe(tipo, i));
        if (areas.length === 0 || areas.some((a) => a.length === 0)) continue;
        salida.push(['item', areas.flat()]);
      }
      return salida;
    }

    // Grupos donde entra la misión, con el primer motivo que se cumple en cada uno.
    function gruposDe(q) {
      const motivos = new Map();
      const apunta = (motivo, grupo) => { if (!motivos.has(grupo)) motivos.set(grupo, motivo); };
      if (aGrupo.has(q.zoneOrSort)) apunta('zona', aGrupo.get(q.zoneOrSort));
      for (const motivo of ['pnj', 'objeto', 'item']) {
        for (const [m, areas] of criterios(q)) {
          if (m !== motivo || areas.length === 0) continue;
          const g = new Set(areas.map((a) => aGrupo.get(a)));
          if (g.size === 1 && !g.has(undefined)) apunta(motivo, [...g][0]);
        }
      }
      return motivos;
    }

    // Punto de un PNJ, objeto o ítem; `enMazmorra` = área canónica de la mazmorra (las alas van a la de su grupo).
    const punto = (tipo, id) => {
      const p = vista.puntoDe({ tipo, id });
      if (!p) return null;
      return p.mazmorra === undefined ? p : { enMazmorra: aGrupo.get(p.mazmorra) ?? p.mazmorra };
    };
    // Primer id (PNJ, objetos, ítems, en orden) que tiene punto o mazmorra; sin ninguno, el primero sin punto.
    const extremo = (v) => {
      const [pnjs, objetos, items] = lista(v);
      const ids = [['npc', pnjs], ['object', objetos], ['item', items]]
        .flatMap(([tipo, lis]) => lista(lis).map((id) => ({ tipo, id })));
      for (const { tipo, id } of ids) {
        const p = punto(tipo, id);
        if (p) return { tipo, id, ...p };
      }
      return ids[0];
    };

    for (const [id, q] of vista.misiones()) {
      const f = vista.faccionDe(q);
      if (faccion === 'Horde' && f === 'Alliance') continue; // la mira la vista de la Alianza
      for (const [area, motivo] of gruposDe(q)) {
        if (encontradas.get(area).has(id)) continue;
        const entrada = { q: id, nivel: q.requiredLevel ?? 0, nivelMision: q.questLevel ?? 0 };
        if (f) entrada.faccion = f;
        const clases = clasesDe(q.requiredClasses);
        if (clases) entrada.clases = clases;
        const razas = razasDe(q.requiredRaces);
        if (razas) entrada.razas = razas;
        const recoge = extremo(q.startedBy);
        if (recoge) entrada.recoge = recoge;
        const entrega = extremo(q.finishedBy);
        if (entrega) entrada.entrega = entrega;
        if (lista(q.preQuestSingle).length > 0) entrada.previas = [...q.preQuestSingle];
        if (lista(q.preQuestGroup).length > 0) entrada.todas = [...q.preQuestGroup];
        entrada.motivo = motivo;
        encontradas.get(area).set(id, entrada);
      }
    }
  }

  const porMazmorra = {};
  const filas = [];
  for (const [area, grupo] of [...grupos].sort(([a], [b]) => a - b)) {
    const misiones = [...encontradas.get(area).values()].sort((a, b) => a.nivel - b.nivel || a.q - b.q);
    const qs = new Set(misiones.map((m) => m.q));
    for (const m of misiones) {
      if ([...lista(m.previas), ...lista(m.todas)].some((p) => qs.has(p))) m.continuacion = true;
    }
    const m = { nombre: grupo.nombre, area };
    const instancia = grupo.deOpenMap[0] ?? grupo.todas[0];
    if (instancia !== undefined) m.instancia = instancia;
    if (grupo.sigla !== undefined) m.sigla = grupo.sigla;
    const { banda, niveles, fuenteNiveles } = nivelesYBanda(grupo, instanciasOpenMap, misiones);
    if (niveles) { m.niveles = niveles; m.fuenteNiveles = fuenteNiveles; }
    m.banda = banda;
    m.misiones = misiones;
    porMazmorra[area] = m;
    filas.push({
      area, nombre: grupo.nombre, instancia: m.instancia, sigla: m.sigla, banda, niveles, misiones: misiones.length,
    });
  }

  const alReves = {};
  for (const [instancia, area] of [...instancias].sort(([a], [b]) => a - b)) {
    if (aGrupo.has(area)) alReves[instancia] = aGrupo.get(area);
  }
  return { porMazmorra, instancias: alReves, filas, avisos };
}
