// Puntos de las misiones sacados de la base: dónde se recoge, dónde están los objetivos y dónde se entrega.
// Todo sale de los spawns y puntos de la base; nunca se inventa un punto (sin datos, sin punto).
//
// Ojo con la forma de los datos (ver leer-lua.mjs): se usan `elemento` y `entradas`, que valen para array y objeto.
import { elemento, entradas } from './leer-lua.mjs';

const TAM_CELDA = 5; // celdas del 5 % del mapa
const MAX_PORCENTAJE = 100;

const esLista = (v) => v !== null && typeof v === 'object';
const aNumero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const enRango = (v) => v !== undefined && v >= 0 && v <= MAX_PORCENTAJE;
const redondear1 = (v) => Math.round(v * 10) / 10;
const celda = (v) => Math.floor(v / TAM_CELDA);

// Spawns {uiMap -> [[x, y], …]} -> Map(uiMap -> [[x, y], …]) sin los puntos con x o y fuera de 0-100 y sin los mapas vacíos.
function mapasValidos(spawns) {
  const mapas = new Map();
  for (const [mapa, lista] of entradas(spawns)) {
    if (typeof mapa !== 'number' || !esLista(lista)) continue; // enMazmorra y demás claves de texto
    const puntos = [];
    for (const [, punto] of entradas(lista)) {
      const x = aNumero(elemento(punto, 1));
      const y = aNumero(elemento(punto, 2));
      if (enRango(x) && enRango(y)) puntos.push([x, y]);
    }
    if (puntos.length > 0) mapas.set(mapa, puntos);
  }
  return mapas;
}

// Elige el punto de unos mapas ya validos: {mapa, x, y, n, cx, cy, sitios} (cx, cy: la celda central del bloque ganador;
// sitios: los puntos [x, y] de ese bloque, para el círculo de los dibujos de la IA).
// Mapa: el preferido si tiene puntos; si no, el que más tiene (a igualdad, el id más bajo). Dentro del mapa, celdas del
// 5 %: cada una puntúa con los puntos de su bloque de 3 × 3 y gana la que más (a igualdad, cy más bajo y luego cx más
// bajo). La celda central puede estar vacía: un bloque centrado en una celda vecina vacía puede recoger más puntos que
// uno centrado en una celda con puntos. El resultado es la media de los puntos del bloque.
function elegir(mapas, mapaPreferido) {
  if (mapas.size === 0) return null;
  let mapa;
  if (mapaPreferido !== undefined && mapaPreferido !== null && mapas.has(mapaPreferido)) {
    mapa = mapaPreferido;
  } else {
    for (const [id, puntos] of mapas) {
      if (mapa === undefined || puntos.length > mapas.get(mapa).length || (puntos.length === mapas.get(mapa).length && id < mapa)) mapa = id;
    }
  }
  const puntos = mapas.get(mapa).map(([x, y]) => ({ x, y, cx: celda(x), cy: celda(y) }));
  const minCx = Math.max(0, Math.min(...puntos.map((p) => p.cx)) - 1);
  const maxCx = Math.max(...puntos.map((p) => p.cx)) + 1;
  const minCy = Math.max(0, Math.min(...puntos.map((p) => p.cy)) - 1);
  const maxCy = Math.max(...puntos.map((p) => p.cy)) + 1;
  let mejor = null; // {bloque, cx, cy}
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const bloque = puntos.filter((p) => Math.abs(p.cx - cx) <= 1 && Math.abs(p.cy - cy) <= 1);
      // El recorrido es por cy y luego cx ascendentes: a igualdad se queda el primero.
      if (bloque.length > 0 && (mejor === null || bloque.length > mejor.bloque.length)) mejor = { bloque, cx, cy };
    }
  }
  const n = mejor.bloque.length;
  const x = mejor.bloque.reduce((s, p) => s + p.x, 0) / n;
  const y = mejor.bloque.reduce((s, p) => s + p.y, 0) / n;
  return { mapa, x: redondear1(x), y: redondear1(y), n, cx: mejor.cx, cy: mejor.cy, sitios: mejor.bloque.map((p) => [p.x, p.y]) };
}

// El punto que mejor representa unos spawns: {mapa, x, y, n} o null.
export function puntoRepresentativo(spawns, mapaPreferido) {
  const elegido = elegir(mapasValidos(spawns), mapaPreferido);
  if (!elegido) return null;
  const { mapa, x, y, n } = elegido;
  return { mapa, x, y, n };
}

// Une los spawns de varias entidades en un solo {uiMap -> [[x, y], …]}.
function unirSpawns(listaSpawns) {
  const unido = {};
  for (const spawns of listaSpawns) {
    for (const [mapa, lista] of entradas(spawns)) {
      if (typeof mapa !== 'number' || !esLista(lista)) continue;
      (unido[mapa] ??= []).push(...entradas(lista).map(([, p]) => p));
    }
  }
  return unido;
}

// Dónde se consigue un ítem que empieza una misión: el punto representativo de los spawns juntos de los PNJ que lo
// sueltan (npcDrops) y de los objetos del mundo que lo dan (objectDrops), preferiblemente en `mapaPreferido`.
// {mapa, x, y} o null si ninguna fuente tiene puntos en la base (no se inventa).
export function fuenteDeItem(base, itemId, pj, mapaPreferido) {
  const item = base.item(itemId, pj);
  if (!item) return null;
  const spawns = [
    ...entradas(item.npcDrops).map(([, id]) => base.npc(id, pj)?.spawns),
    ...entradas(item.objectDrops).map(([, id]) => base.objeto(id, pj)?.spawns),
  ].filter(Boolean);
  const punto = puntoRepresentativo(unirSpawns(spawns), mapaPreferido);
  return punto ? { mapa: punto.mapa, x: punto.x, y: punto.y } : null;
}

// Las áreas de mazmorra de una entidad: su campo `enMazmorra` (primer nivel, como lo escribe el conversor en PNJ y
// objetos) y también el que lleva dentro `spawns` (los puntos de triggerEnd).
function areasEnMazmorra(entidad) {
  const fuentes = [entidad.enMazmorra];
  if (esLista(entidad.spawns) && !Array.isArray(entidad.spawns)) fuentes.push(entidad.spawns.enMazmorra);
  return fuentes.flatMap((f) => entradas(f).map(([, area]) => area)).filter((area) => typeof area === 'number');
}

// Entidades [{nombre, spawns, enMazmorra}] -> candidato de punto, calculado una sola vez:
//   {mapas, entidades}                    si hay puntos en algún mapa;
//   {entrada: {mapa, x, y}, mazmorra, entidad}  la primera entrada de la mazmorra donde están (si no hay puntos);
//   null                                  sin nada de eso.
// El mapa de una entrada es el suyo o, si no lo trae, el de su zona (base.uiDeArea); sin mapa o fuera de 0-100, no hay punto.
function candidato(base, entidades) {
  const mapas = mapasValidos(unirSpawns(entidades.map((e) => e.spawns)));
  if (mapas.size > 0) return { mapas, entidades };
  for (const entidad of entidades) {
    for (const area of areasEnMazmorra(entidad)) {
      const mazmorra = base.mazmorra(area);
      const entrada = elemento(mazmorra?.entradas, 1);
      const mapaEntrada = aNumero(entrada?.mapa);
      const mapa = mapaEntrada > 0 ? mapaEntrada : base.uiDeArea(aNumero(entrada?.zona));
      const x = aNumero(entrada?.x);
      const y = aNumero(entrada?.y);
      if (typeof mapa !== 'number' || mapa <= 0 || !enRango(x) || !enRango(y)) continue; // no se inventa
      return { entrada: { mapa, x, y }, mazmorra: mazmorra.nombre, entidad };
    }
  }
  return null;
}

// La primera entidad con algún spawn dentro del bloque ganador (celda central cx, cy y sus vecinas).
function entidadDelBloque(c, punto) {
  if (c.entrada) return c.entidad;
  for (const entidad of c.entidades) {
    const propios = mapasValidos(entidad.spawns).get(punto.mapa) ?? [];
    if (propios.some(([x, y]) => Math.abs(celda(x) - punto.cx) <= 1 && Math.abs(celda(y) - punto.cy) <= 1)) return entidad;
  }
  return c.entidades[0];
}

// Índice (desde 1) del primer objetivo de cada grupo de `objectives` en el registro del juego, en el orden del addon
// (nucleo/misiones.lua, tipoDeBase): PNJ (grupo 1), objetos (2), ítems (3), crédito de muerte (5) y hechizos (6); la
// reputación (4) no cuenta. La exploración (triggerEnd) va detrás de todos; con reputación no tiene índice (los
// `complete` cuentan la reputación y el de la exploración no cuadraría). Copia de inicioDeGrupos del conversor
// (tools/conversor/src/generar/pasos.js).
function inicioDeGrupos(mision) {
  const inicio: { triggerEnd?: number; } = {};
  let n = 0;
  for (const g of [1, 2, 3, 5, 6]) {
    inicio[g] = n + 1;
    n += entradas(elemento(mision.objectives, g)).length;
  }
  inicio.triggerEnd = entradas(elemento(mision.objectives, 4)).length > 0 ? undefined : n + 1;
  return inicio;
}

const TEXTOS = {
  es: {
    recoger: (mision, quien) => `Recoger «${mision}» (${quien})`,
    entregar: (mision, quien) => `Entregar «${mision}» (${quien})`,
    objetivo: (mision, objetivo) => `${mision}: ${objetivo}`,
    dentro: (nombre) => `Dentro de ${nombre}`,
  },
  en: {
    recoger: (mision, quien) => `Pick up "${mision}" (${quien})`,
    entregar: (mision, quien) => `Hand in "${mision}" (${quien})`,
    objetivo: (mision, objetivo) => `${mision}: ${objetivo}`,
    dentro: (nombre) => `Inside ${nombre}`,
  },
};

// Lote F: los PNJ del sitio elegido (como mucho MAX_PNJ_SITIO ids): el de la entidad del bloque, si es un PNJ, y en un
// objetivo con varias fuentes (los que sueltan un ítem) también los demás PNJ con puntos en el mapa del sitio. El addon
// los pone en «Objetivos cercanos» (los `target` y `mob` del paso de la parada).
const MAX_PNJ_SITIO = 5;
function pnjDelSitio(c, quien, punto) {
  const ids = [];
  const sumar = (e) => {
    if (e?.tipo === 'npc' && Number.isInteger(e.id) && !ids.includes(e.id) && ids.length < MAX_PNJ_SITIO) ids.push(e.id);
  };
  sumar(quien);
  for (const e of c.entidades ?? []) if (mapasValidos(e.spawns).has(punto.mapa)) sumar(e);
  return ids;
}

// Puntos de una misión: [{papel, q, obj?, objetivo?, npcs?, texto, donde, mapa, x, y}] en el orden recoger, objetivos y
// entregar. `objetivo` solo con `opciones.conObjetivo` y `npcs` solo con `opciones.conPnj` (lote F).
// Dibujos de la IA: con `opciones.conSitios`, un objetivo con dos sitios o más en el bloque elegido lleva `sitios`
// ([[x, y], …], en el mapa del punto: la zona de matar, de la que la app saca el centro y el radio del círculo).
// `donde`: «Dentro de <mazmorra>» si el punto es la entrada de una mazmorra; si no, el nombre de la zona del mapa del
// punto (base.zona: en el idioma, si no en inglés) o null si la base no lo trae.
// Preferencia de mapa: recoger y entregar, mapaJugador; objetivo (Ruling F4-15), por este orden: mapaJugador, mapa de
// recoger, mapa de entregar, mapa de la zona de la misión (base.uiDeArea(zoneOrSort)) y el de más puntos. Cada uno
// cuenta solo si el objetivo tiene puntos ahí, así que un objetivo con puntos en dos continentes no manda al jugador
// al otro.
export function puntosDeMision(base, q, pj, idioma, mapaJugador, opciones: {
  nombreMision?: string;
  conPnj?: any;
  conSitios?: boolean;
  conObjetivo?: any;
} = {}) {
  const mision = base.mision(q, pj);
  if (!mision) return [];
  const t = TEXTOS[idioma] ?? TEXTOS.en;
  // Lote F: `opciones.nombreMision` es el nombre que ya decidió el turno (el del registro del jugador; si no, el «es» de
  // la base y, si no, el «en»): los textos de los puntos son las etiquetas de las paradas de la ruta.
  const nombreMision = typeof opciones.nombreMision === 'string' && opciones.nombreMision !== ''
    ? opciones.nombreMision : base.nombre('quest', q, idioma);

  const entidad = (tipo, id) => {
    const datos = tipo === 'npc' ? base.npc(id, pj) : base.objeto(id, pj);
    return datos ? { tipo, id, nombre: base.nombre(tipo, id, idioma), spawns: datos.spawns, enMazmorra: datos.enMazmorra } : null;
  };
  const deLista = (tipo, ids) => entradas(ids).map(([, id]) => entidad(tipo, id)).filter(Boolean);

  // El punto de un candidato; `textoDe(punto, entidad)` da el texto del punto elegido.
  function construir(papel, c, textoDe, obj, mapaPreferido) {
    const punto = c.entrada ? { ...c.entrada } : elegir(c.mapas, mapaPreferido);
    if (!punto) return null;
    const resultado: {
      papel: typeof papel;
      q: typeof q;
      objetivo?: number; obj?: any;
      texto?: any;
      npcs?: any;
      donde?: any;
      mapa?: any;
      x?: any;
      y?: any;
      sitios?: any;
    } = { papel, q };
    if (obj !== undefined) resultado.obj = obj;
    const quien = entidadDelBloque(c, punto);
    resultado.texto = textoDe(punto, quien);
    if (opciones.conPnj) {
      const npcs = pnjDelSitio(c, quien, punto);
      if (npcs.length > 0) resultado.npcs = npcs;
    }
    resultado.donde = c.mazmorra ? t.dentro(c.mazmorra) : base.zona(punto.mapa, idioma);
    resultado.mapa = punto.mapa;
    resultado.x = punto.x;
    resultado.y = punto.y;
    if (opciones.conSitios && papel === 'objetivo' && Array.isArray(punto.sitios) && punto.sitios.length >= 2) resultado.sitios = punto.sitios;
    return resultado;
  }

  // Recoger o entregar: sus PNJ ([1]) u objetos ([2]); el ítem que empieza la misión ([3]) no da punto.
  function puntoDeRelacion(relacion, papel) {
    for (const [campo, tipo] of [[1, 'npc'], [2, 'object']]) {
      const c = candidato(base, deLista(tipo, elemento(relacion, campo)));
      if (!c) continue;
      const punto = construir(papel, c, (p, e) => t[papel](nombreMision, e.nombre), undefined, mapaJugador);
      if (punto) return punto;
    }
    return null;
  }

  const recoger = puntoDeRelacion(mision.startedBy, 'recoger');
  const entregar = puntoDeRelacion(mision.finishedBy, 'entregar');

  // Mapa preferido de los objetivos (F4-15), en orden de prioridad.
  const zona = base.uiDeArea(aNumero(mision.zoneOrSort));
  const prioridad = [mapaJugador, recoger?.mapa, entregar?.mapa, zona].filter((m) => typeof m === 'number');
  const objetivos = [];
  // Con `opciones.conObjetivo`, cada punto de objetivo lleva `objetivo` = su índice en el registro del juego (ver
  // inicioDeGrupos); lo usan los pasos de las rutas de zona (base/pasos.mjs). Sin la opción, la salida no cambia.
  const inicio = opciones.conObjetivo ? inicioDeGrupos(mision) : null;
  const sumar = (entidades, obj, k) => {
    const c = candidato(base, entidades);
    if (!c) return;
    const preferido = c.mapas ? prioridad.find((m) => c.mapas.has(m)) : undefined;
    const texto = obj === undefined ? nombreMision : t.objetivo(nombreMision, obj);
    const punto = construir('objetivo', c, () => texto, obj, preferido);
    if (!punto) return;
    if (inicio && k !== undefined) punto.objetivo = k;
    objetivos.push(punto);
  };

  // Objetivos: [1] PNJ y [2] objetos (uno por entrada), [3] ítems (spawns de npcDrops y objectDrops juntos).
  for (const [campo, tipo] of [[1, 'npc'], [2, 'object']]) {
    for (const [i, e] of entradas(elemento(mision.objectives, campo))) {
      const id = elemento(e, 1);
      const datos = entidad(tipo, id);
      if (datos) sumar([datos], datos.nombre, inicio ? inicio[campo] + i - 1 : undefined);
    }
  }
  for (const [i, e] of entradas(elemento(mision.objectives, 3))) {
    const id = elemento(e, 1);
    const item = base.item(id, pj);
    if (!item) continue;
    sumar([...deLista('npc', item.npcDrops), ...deLista('object', item.objectDrops)], base.nombre('item', id, idioma),
      inicio ? inicio[3] + i - 1 : undefined);
  }
  const trigger = mision.triggerEnd;
  if (esLista(trigger)) {
    const texto = elemento(trigger, 1);
    sumar([{ nombre: '', spawns: elemento(trigger, 2) }], typeof texto === 'string' && texto !== '' ? texto : undefined,
      inicio ? inicio.triggerEnd : undefined);
  }

  return [...(recoger ? [recoger] : []), ...objetivos, ...(entregar ? [entregar] : [])];
}
