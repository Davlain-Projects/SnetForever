// Escritor del addon de datos SnetForever_Misiones (Lua 5.1): misiones, PNJ, objetos e ítems del Forever,
// su español y las correcciones por facción, a partir de QuestieDB (GPLv3).
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rutaQuestieToc } from '../config.js';
import { leerToc } from '../questie/toc.js';
import { leerEntidades } from '../questie/entidades.js';
import { cargarZonas, convertirPuntos } from '../questie/zonas.js';
import { leerNombresZonas } from '../questie/nombres-zonas.js';
import { leerEspanol } from '../questie/idioma.js';
import { leerCorrecciones } from '../questie/correcciones.js';
import { aplicarPropiasACorrecciones } from '../questie/propias.js';
import { POR_AREA } from '../questie/esquema.js';
import { aLua } from '../salida/lua.js';
import { trocear, archivoLua, constantesDe } from '../salida/trocear.js';

const NOMBRE_ADDON = 'SnetForever_Misiones';
const TIPOS = ['quest', 'npc', 'object', 'item'];
const LIMITE_BYTES = 500000;
const LIMITE_CONSTANTES = 50000;
// Línea de metadatos del .toc con los archivos que solo lee la app (el juego ignora los campos X-).
export const CAMPO_TOC_APP = 'X-SNF-App';
// El nucleo se queda en línea mientras quepa con holgura; si no, las correcciones van a archivos propios.
const HOLGURA_NUCLEO = 0.8;

/** Da el motivo si la misión es basura de QuestieDB (sin nombre, «REUSE ME», TEST o NYI); si no, null. */
export function esMisionBasura(q) {
  const nombre = q?.name;
  if (typeof nombre !== 'string' || nombre.trim() === '') return 'sin nombre';
  if (nombre.includes('REUSE ME')) return 'REUSE ME';
  if (/\bTEST\b/.test(nombre)) return 'contiene TEST';
  if (/\bNYI\b/.test(nombre)) return 'contiene NYI';
  return null;
}

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esUiMapValido = (m) => typeof m === 'number' && m > 0;

/** Contexto de conversión de puntos: acumula las áreas sin mapa para el aviso final. */
function crearConversor(zonas) {
  const sinMapa = new Set();

  // spawns {areaId: [[x,y],…]} -> {mapas, mazmorras}
  const spawns = (porArea) => {
    const r = convertirPuntos(porArea, zonas);
    r.sinMapa.forEach((a) => sinMapa.add(a));
    return r;
  };

  // waypoints {areaId: [[[x,y],…], …rutas]} -> {mapas: {uiMap: [ruta, …]}, mazmorras}
  const waypoints = (porArea) => {
    const mapas = {};
    const mazmorras = [];
    for (const [area, rutas] of Object.entries(porArea ?? {})) {
      if (!Array.isArray(rutas)) continue;
      for (const ruta of rutas) {
        const r = convertirPuntos({ [area]: ruta }, zonas);
        r.sinMapa.forEach((a) => sinMapa.add(a));
        r.mazmorras.forEach((a) => { if (!mazmorras.includes(a)) mazmorras.push(a); });
        for (const [mapa, puntos] of Object.entries(r.mapas)) (mapas[mapa] ??= []).push(puntos);
      }
    }
    return { mapas, mazmorras };
  };

  return { spawns, waypoints, sinMapa };
}

// Convierte los campos por área de un registro y devuelve {campo: valor, enMazmorra?}. Los vacíos se omiten.
function convertirCamposPorArea(tipo, registro, conv) {
  const salida = {};
  const mazmorras = [];
  for (const campo of POR_AREA[tipo] ?? []) {
    const valor = registro[campo];
    if (valor === undefined || valor === null) continue;
    const r = campo === 'spawns' ? conv.spawns(valor) : conv.waypoints(valor);
    if (Object.keys(r.mapas).length > 0) salida[campo] = r.mapas;
    r.mazmorras.forEach((a) => { if (!mazmorras.includes(a)) mazmorras.push(a); });
  }
  if (mazmorras.length > 0) salida.enMazmorra = mazmorras;
  return salida;
}

// Lista de puntos por AreaID de una misión (triggerEnd[2], extraObjectives[i][1]) -> puntos por
// uiMapID, con `enMazmorra = {areaId, …}` dentro si alguna área es una mazmorra. null si no queda nada.
function puntosDeMision(porArea, conv) {
  if (!esObjeto(porArea)) return porArea;
  const r = conv.spawns(porArea);
  const salida = { ...r.mapas };
  if (r.mazmorras.length > 0) salida.enMazmorra = r.mazmorras;
  return Object.keys(salida).length > 0 ? salida : null;
}

// Campos de misión con puntos por AreaID dentro de una tabla: triggerEnd = {texto, puntos} y
// extraObjectives = {{puntos?, icono, texto?, índice, refs?}, …}. Pasan a uiMapID como los spawns.
function convertirTablasMision(campo, valor, conv) {
  if (campo === 'triggerEnd' && Array.isArray(valor)) {
    const t = [...valor];
    if (t[1] !== null && t[1] !== undefined) t[1] = puntosDeMision(t[1], conv);
    return t;
  }
  if (campo === 'extraObjectives' && Array.isArray(valor)) {
    return valor.map((e) => {
      if (!Array.isArray(e) || e[0] === null || e[0] === undefined) return e;
      const x = [...e];
      x[0] = puntosDeMision(x[0], conv);
      return x;
    });
  }
  return valor;
}
const CAMPOS_MISION_CON_PUNTOS = ['triggerEnd', 'extraObjectives'];

// Lote B (B2): ¿es el valor por defecto de un campo de primer nivel? 0, la cadena vacía o una tabla sin nada dentro (un
// array solo con huecos también: se escribiría `{}`). Los lectores tratan «falta» igual (`or 0`, `?? 0`, `type(t) == "table"`).
function esPorDefecto(v) {
  if (v === 0 || v === 0n || v === '') return true;
  if (Array.isArray(v)) return Array.from(v).every((x) => x === null || x === undefined);
  if (esObjeto(v)) return Object.values(v).every((x) => x === null || x === undefined);
  return false;
}

/** Lote B (B2): el registro sin los campos de primer nivel que valen 0, "" o {} (los de dentro no se tocan). */
export function sinPorDefecto(registro) {
  const salida = {};
  for (const [campo, v] of Object.entries(registro)) if (!esPorDefecto(v)) salida[campo] = v;
  return salida;
}

// Registro base: misiones con triggerEnd/extraObjectives a uiMapID; PNJ u objeto, spawns/waypoints a uiMapID.
function normalizarRegistro(tipo, registro, conv) {
  if (tipo === 'quest') {
    const salida = { ...registro };
    for (const c of CAMPOS_MISION_CON_PUNTOS) if (c in salida) salida[c] = convertirTablasMision(c, salida[c], conv);
    return salida;
  }
  if (!POR_AREA[tipo]) return registro;
  const salida = { ...registro };
  for (const campo of POR_AREA[tipo]) delete salida[campo];
  return { ...salida, ...convertirCamposPorArea(tipo, registro, conv) };
}

// Aplica `f` al valor de la corrección o, si es por clase, a cada valor de clase no nulo.
// Los null de porClase (sin corrección para esa clase) se dejan tal cual.
function porValor(valor, f) {
  if (esObjeto(valor) && esObjeto(valor.porClase)) {
    const mapa = {};
    for (const [clase, v] of Object.entries(valor.porClase)) mapa[clase] = v === null ? null : f(v);
    return { porClase: mapa };
  }
  return f(valor);
}

// Corrección de un registro (id -> {campo: valor}): spawns/waypoints a uiMapID y uiMap de la zona de la misión.
// __borrar se mantiene tal cual.
function normalizarCorreccion(tipo, correccion, conv, zonas) {
  const salida = {};
  for (const [campo, valor] of Object.entries(correccion)) {
    if (valor === '__borrar') { salida[campo] = valor; continue; }
    if (POR_AREA[tipo]?.includes(campo)) {
      // Los demás campos que genere (enMazmorra) se combinan en el registro sin pisar los explícitos.
      const convertido = porValor(valor, (v) => {
        const r = campo === 'spawns' ? conv.spawns(v) : conv.waypoints(v);
        return { mapas: r.mapas, mazmorras: r.mazmorras };
      });
      if (esObjeto(convertido) && convertido.porClase) {
        const mapas = {};
        const mazmorras = {};
        for (const [clase, r] of Object.entries(convertido.porClase)) {
          mapas[clase] = r === null ? null : r.mapas;
          if (r !== null && r.mazmorras.length > 0) mazmorras[clase] = r.mazmorras;
        }
        salida[campo] = { porClase: mapas };
        if (Object.keys(mazmorras).length > 0) salida.enMazmorra = { porClase: mazmorras };
      } else {
        salida[campo] = convertido.mapas;
        if (convertido.mazmorras.length > 0) salida.enMazmorra = convertido.mazmorras;
      }
      continue;
    }
    if (tipo === 'quest' && CAMPOS_MISION_CON_PUNTOS.includes(campo)) {
      salida[campo] = porValor(valor, (v) => convertirTablasMision(campo, v, conv));
      continue;
    }
    salida[campo] = valor;
  }
  if (tipo === 'quest' && 'zoneOrSort' in salida && salida.zoneOrSort !== '__borrar') {
    const mapa = porValor(salida.zoneOrSort, (z) => {
      if (typeof z !== 'number' || z <= 0) return null;
      const m = zonas.uiMap(z);
      return esUiMapValido(m) ? m : null;
    });
    const hay = esObjeto(mapa) && mapa.porClase
      ? Object.values(mapa.porClase).some((m) => m !== null)
      : mapa !== null;
    if (hay) salida.uiMap = mapa;
  }
  return salida;
}

// Mazmorras para el addon: por AreaID, y también por cada área alternativa que no sea clave propia.
function prepararMazmorras(zonas) {
  const salida = {};
  const ficha = (d) => ({
    nombre: d.nombre,
    zonaPadre: d.zonaPadre,
    entradas: d.entradas.map((e) => ({ zona: e.zona, mapa: esUiMapValido(e.mapa) ? e.mapa : null, x: e.x, y: e.y })),
  });
  for (const [area, d] of zonas.mazmorras) salida[area] = ficha(d);
  for (const [area, d] of zonas.mazmorras) {
    for (const alt of d.alternativas) if (!(alt in salida)) salida[alt] = salida[area];
  }
  return salida;
}

// Tabla de zonas del addon: area[areaId] = uiMap para las áreas que usan los datos (las de la tabla de QuestieDB, las
// zoneOrSort de las misiones y las de entrada de mazmorra) y nombre[uiMap] = {en, es?} con los nombres que trae Questie.
function prepararZonas(zonas, nombres, datosQuest, mazmorra) {
  const areas = new Set(zonas.areasDirectas());
  for (const [, r] of datosQuest) if (typeof r.zoneOrSort === 'number' && r.zoneOrSort > 0) areas.add(r.zoneOrSort);
  for (const d of Object.values(mazmorra)) for (const e of d.entradas) if (e.zona > 0) areas.add(e.zona);
  const area = {};
  for (const a of [...areas].sort((x, y) => x - y)) {
    const mapa = zonas.uiMap(a);
    if (esUiMapValido(mapa)) area[a] = mapa;
  }
  const nombre = {};
  for (const ui of [...new Set(Object.values(area))].sort((x, y) => x - y)) {
    const en = nombres.en.get(zonas.areaDeUi(ui));
    if (typeof en !== 'string') continue;
    const es = nombres.es.get(en);
    nombre[ui] = typeof es === 'string' ? { en, es } : { en };
  }
  return { area, nombre };
}

const ordenado = (mapaOObjeto) => {
  const pares = mapaOObjeto instanceof Map ? [...mapaOObjeto.entries()] : Object.entries(mapaOObjeto);
  return pares.map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
};

// ---------------------------------------------------------------------------------------------------
// Lote B (B1): lo que el juego necesita de los ítems y de los objetos del mundo. El resto de esas dos tablas (y su
// español) solo lo usa la app, que lo lee del disco: va en archivos que el .toc no carga (línea `## X-SNF-App:`).
// ---------------------------------------------------------------------------------------------------

const esId = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;

// Los valores de una corrección: el valor tal cual o, si es por clase, cada valor de clase (sin null ni "__borrar").
function valoresDeCorreccion(valor) {
  if (valor === '__borrar' || valor === null || valor === undefined) return [];
  if (esObjeto(valor) && esObjeto(valor.porClase)) {
    return Object.values(valor.porClase).filter((v) => v !== null && v !== undefined && v !== '__borrar');
  }
  return [valor];
}

// Recorre una guía (o cualquier valor) y apunta los id de ítem (`i`, `is`, `item`) y de objeto del mundo (`objeto`) que
// cita: los de los elementos (`collect`, `use`, `equip`, `bankwithdraw`… y el `objeto` de accept/turnin de las guías de
// mejora), los de los requisitos (`{t = "objeto", i}`) y el de la recompensa de una guía de mejora (`recompensa.item`).
function idsDeGuia(valor, items, objetos) {
  if (Array.isArray(valor)) {
    for (const v of valor) idsDeGuia(v, items, objetos);
    return;
  }
  if (!esObjeto(valor)) return;
  for (const [clave, v] of Object.entries(valor)) {
    if ((clave === 'i' || clave === 'item') && esId(v)) items.add(v);
    else if (clave === 'is' && Array.isArray(v)) v.filter(esId).forEach((id) => items.add(id));
    else if (clave === 'objeto' && esId(v)) objetos.add(v);
    else idsDeGuia(v, items, objetos);
  }
}

// Ítems y objetos que lee una misión (base o corrección) en el juego: los ítems de sus objetivos (objectives[3] de
// QuestieDB, posición 2 desde 0), los de `requiredSourceItems` (requisitos del paso) y los objetos que la dan
// (startedBy[2], posición 1 desde 0: el aviso de continente busca dónde empieza la misión).
function idsDeMision(campos, items, objetos) {
  for (const objetivos of valoresDeCorreccion(campos.objectives)) {
    const deItems = Array.isArray(objetivos) ? objetivos[2] : undefined;
    for (const entrada of Array.isArray(deItems) ? deItems : []) {
      if (Array.isArray(entrada) && esId(entrada[0])) items.add(entrada[0]);
    }
  }
  for (const lista of valoresDeCorreccion(campos.requiredSourceItems)) {
    if (Array.isArray(lista)) lista.filter(esId).forEach((id) => items.add(id));
  }
  for (const por of valoresDeCorreccion(campos.startedBy)) {
    const deObjetos = Array.isArray(por) ? por[1] : undefined;
    if (Array.isArray(deObjetos)) deObjetos.filter(esId).forEach((id) => objetos.add(id));
  }
}

/**
 * Los id de ítem y de objeto del mundo que el addon puede leer en el juego (nombres de `Datos.nombreItem` y
 * `Datos.nombreObjeto`, puntos de los objetos que dan misiones en `motor/continente.lua`): los que citan las guías
 * (rutas y laterales) y los de las misiones de la base, con sus correcciones por facción.
 * @returns {{items: Set<number>, objetos: Set<number>}}
 */
export function idsDelJuego({ guias = [], quest = [], correcciones = [] } = {}) {
  const items = new Set();
  const objetos = new Set();
  for (const guia of guias) idsDeGuia(guia, items, objetos);
  for (const campos of quest) if (esObjeto(campos)) idsDeMision(campos, items, objetos);
  for (const campos of correcciones) if (esObjeto(campos)) idsDeMision(campos, items, objetos);
  return { items, objetos };
}

const nombreValido = (n) => typeof n === 'string' && n !== '';

// Tabla pequeña de ítems para el juego: solo el nombre (inglés o español) de los id pedidos que lo tienen.
function soloNombre(entradas, ids) {
  return entradas.filter(([id, r]) => ids.has(id) && nombreValido(r?.name)).map(([id, r]) => [id, { name: r.name }]);
}

// Tabla pequeña de objetos del mundo para el juego: nombre y puntos de aparición (ya por uiMapID) de los id pedidos.
function nombreYPuntos(entradas, ids) {
  const salida = [];
  for (const [id, r] of entradas) {
    if (!ids.has(id)) continue;
    const o = {};
    if (nombreValido(r?.name)) o.name = r.name;
    if (esObjeto(r?.spawns) && Object.keys(r.spawns).length > 0) o.spawns = r.spawns;
    if (Object.keys(o).length > 0) salida.push([id, o]);
  }
  return salida;
}

const COMENTARIO_NUCLEO = `-- SnetForever_Misiones: datos de misiones del Forever generados a partir de QuestieDB (GPLv3).
-- Este archivo se carga el primero; el resto rellenan las tablas quest, npc, object, item y es.
--
-- porFaccion[Horde|Alliance][tipo][id] = {campo = valor}: correcciones dinámicas de QuestieDB que
-- dependen de la facción del jugador. El addon que las lea (fase 2) debe interpretar:
--   * "__borrar": el campo se borra (la corrección vacía de QuestieDB).
--   * {porClase = {WARRIOR = v, ...}}: el valor depende de la clase del jugador. Una clase que no
--     aparece en porClase (nil) significa «sin corrección: vale el valor base», y es distinto de "__borrar".
--   * spawns/waypoints ya vienen por uiMapID (como en el resto de datos), con enMazmorra aparte.
--
-- Puntos de las misiones, también por uiMapID (porcentaje 0-100 del mapa):
--   * triggerEnd = {texto, puntos}: objetivo de exploración; puntos = {[uiMapID] = {{x, y}, ...}}.
--   * extraObjectives = {{puntos?, icono, texto?, índice, refs?}, ...}: puntos con la misma forma.
--   * Si un área de esos puntos es una mazmorra (sin coordenadas), puntos lleva enMazmorra = {areaId, ...}.
--
--   * zonas = {area = {[areaId] = uiMap}, nombre = {[uiMap] = {en, es?}}}: area pasa un AreaID (zoneOrSort de las
--     misiones, zona de las entradas de mazmorra…) a su uiMapID, y nombre da el nombre de la zona de ese mapa tal como
--     lo escribe Questie: los de lookupZones.lua que carga Questie_Forever.toc, sin las correcciones de otras
--     expansiones (lookupZonesCorrections.lua), en inglés y, si Questie lo traduce, en español (sin es, solo en).
--
-- Fase 3 (guias_<n>.lua y mazmorras_<n>.lua, después de los es_*):
--   * guias[clave] = guía lateral (tipo cadena, mejora o mazmorra), generada a partir de esta base.
--     Las de mejora (lote «Cadenas de mejoras», clave «Mejoras (H|A)\\<id>») llevan mejora = {id, beneficio = {en, es?},
--     beneficioDe = "jugador" | "base", recompensa = {item, nombre = {en, es?}}}: beneficioDe "jugador" quiere decir que
--     el beneficio NO sale de la base (lo contó quien lo probó en el juego) y se enseña tal cual; porElCamino? = {en, es?}
--     (de la base) es lo que dan las misiones de antes de la última. Su filtro lleva «x:mejora» en cada grupo: un addon
--     que no conoce las guías de mejora no lo da por cumplido y no las enseña. Sus accept y turnin llevan objeto = <id>
--     si se aceptan o entregan en un objeto del mundo (solo para el texto del paso).
--   * Las misiones no cambian: las previas que se deducen por un objeto compartido (la anterior se entrega en el objeto
--     que da la siguiente) no se escriben; quien las necesita las deduce de startedBy/finishedBy (la app, rutaZona.mjs).
--   * porMazmorra[AreaID] = {nombre, area, instancia?, sigla?, niveles?, fuenteNiveles, banda, misiones}.
--   * instancias[instanceID] = AreaID de la mazmorra.
--
-- Lote B (datos 2026.11.10.7 en adelante):
--   * item y object, en el juego, solo traen lo que lee el addon: item[id] = {name} de los ítems que citan las guías, los
--     objetivos de misión y requiredSourceItems; object[id] = {name, spawns} de los objetos que citan las guías y de los
--     que dan misiones (y es.item / es.object, solo el nombre de esos mismos). Los registros completos (y todo su español)
--     están en los archivos de la línea «## X-SNF-App» del .toc: el juego no los carga y la app los lee del disco
--     después de los del .toc (pisan a los de la tabla pequeña).
--   * En quest, npc, object e item no se escriben los campos de primer nivel que valen 0, las cadenas vacías ni las
--     tablas vacías: un campo que falta vale 0, "" o {}. Las correcciones de porFaccion sí se escriben tal cual (un 0
--     allí cambia el valor base).
--
-- Lote eventos (datos 2026.11.11.4 en adelante):
--   * quest[id].evento = "<nombre>": la misión es de una fiesta que Questie solo enseña con su evento activo, con el
--     nombre exacto de QuestieEvent ("Children's Week", "Winter Veil"…). Solo lo llevan esas; las demás no lo traen.
--     Va antes que el QuestSort (zoneOrSort negativo): -22 junta varias fiestas y -284, el de Children's Week, lo usan
--     también misiones normales. Es opcional: quien no lo conoce lo ignora (el esquema sigue en 1).
`;

function textoNucleo(cabecera, porFaccion, instancias) {
  const base = {
    ...cabecera, quest: {}, npc: {}, object: {}, item: {}, es: { quest: {}, npc: {}, object: {}, item: {} },
    guias: {}, porMazmorra: {}, instancias,
  };
  return { base, porFaccion };
}

function escribir(dirSalida, nombre, texto, archivos) {
  writeFileSync(join(dirSalida, nombre), texto, 'utf8');
  archivos.push(nombre);
}

/**
 * Genera el addon en `dirSalida` (la carpeta del addon). Devuelve los archivos escritos (relativos),
 * el total de bytes, las misiones descartadas y los avisos.
 * `excluidas` (lote H, ronda 1): misión → motivo de las que tampoco entran (lista negra de Questie y otras temporadas sin
 * dador con punto, questie/excluidas.js); se descartan como las basura, con su motivo.
 * `eventos` (lote eventos): misión → nombre del evento de Questie que la destapa (lista-negra.js, leerEventos); cada una
 * de esas misiones que se escribe lleva `evento` con ese nombre.
 */
export function escribirMisiones(dirSalida, {
  version, rutaToc = rutaQuestieToc(), guias = new Map(), guiasRutas = new Map(), porMazmorra = {}, instancias = {},
  licenciaOpenMap, excluidas = new Map(), eventos = new Map(),
} = {}) {
  if (!version) throw new Error('escribirMisiones: falta la versión de los datos (AAAA.MM.DD.n)');
  const dirQuestieDB = dirname(rutaToc);
  const avisos = [];

  // Origen: una sola lectura de cada fuente.
  const entidades = leerEntidades(rutaToc);
  const zonas = cargarZonas(dirQuestieDB);
  const es = leerEspanol(leerToc(rutaToc));
  // Las correcciones de QuestieDB y, encima, las propias comprobadas (src/questie/propias.js).
  const conPropias = aplicarPropiasACorrecciones(leerCorrecciones(dirQuestieDB), entidades);
  const correcciones = conPropias.correcciones;
  avisos.push(...conPropias.avisos);
  avisos.push(...zonas.avisos);
  const conv = crearConversor(zonas);

  // Misiones basura.
  const descartadas = [];
  const descartadasIds = new Set();
  for (const [id, q] of entidades.quest) {
    const motivo = esMisionBasura(q) ?? excluidas.get(id);
    if (motivo) { descartadas.push({ id, motivo }); descartadasIds.add(id); }
  }

  // Datos base por tipo.
  const datos = {};
  for (const tipo of TIPOS) {
    const entradas = [];
    for (const [id, registro] of ordenado(entidades[tipo])) {
      if (tipo === 'quest' && descartadasIds.has(id)) continue;
      let r = normalizarRegistro(tipo, registro, conv);
      if (tipo === 'quest' && registro.zoneOrSort > 0) {
        const mapa = zonas.uiMap(registro.zoneOrSort);
        if (esUiMapValido(mapa)) r = { ...r, uiMap: mapa };
      }
      // Lote eventos: el nombre exacto de la fiesta (el QuestSort no lo dice siempre).
      if (tipo === 'quest' && typeof eventos.get(id) === 'string' && eventos.get(id) !== '') r = { ...r, evento: eventos.get(id) };
      // Lote B (B2): sin los campos que valen 0, "" o {} (las correcciones de porFaccion no pasan por aquí).
      entradas.push([id, sinPorDefecto(r)]);
    }
    datos[tipo] = entradas;
  }

  // Español (sin las misiones descartadas).
  const datosEs = {};
  for (const tipo of TIPOS) {
    datosEs[tipo] = ordenado(es[tipo]).filter(([id]) => !(tipo === 'quest' && descartadasIds.has(id)));
  }

  // Correcciones por facción.
  const porFaccion = {};
  let correccionesDescartadas = 0;
  for (const faccion of ['Horde', 'Alliance']) {
    porFaccion[faccion] = {};
    for (const tipo of TIPOS) {
      const salida = {};
      for (const [id, corr] of ordenado(correcciones[faccion][tipo])) {
        if (tipo === 'quest' && descartadasIds.has(id)) { correccionesDescartadas += 1; continue; }
        salida[id] = normalizarCorreccion(tipo, corr, conv, zonas);
      }
      porFaccion[faccion][tipo] = salida;
    }
  }
  if (correccionesDescartadas > 0) avisos.push(`${correccionesDescartadas} correcciones de misiones descartadas no se escriben`);

  if (conv.sinMapa.size > 0) {
    avisos.push(`Áreas con puntos pero sin uiMap (se omiten sus puntos): ${[...conv.sinMapa].sort((a, b) => a - b).join(', ')}`);
  }

  // Escritura.
  mkdirSync(dirSalida, { recursive: true });
  const archivos = [];
  const ficherosLua = [];

  const cabecera = {
    version,
    esquema: 1,
    fuente: { nombre: 'QuestieDB', version: entidades.meta.version, commit: entidades.meta.commit },
  };
  const mazmorra = prepararMazmorras(zonas);
  const nombresZonas = leerNombresZonas(join(dirQuestieDB, '..', 'Questie', 'Localization'), join(dirQuestieDB, '..', 'Questie', 'Questie_Forever.toc'));
  const zonasDatos = prepararZonas(zonas, nombresZonas, datos.quest, mazmorra);
  const instanciasDatos = Object.fromEntries(ordenado(instancias));

  // ¿Caben las correcciones en el nucleo? Si no, van a archivos propios.
  const vacioPorFaccion = { Horde: { quest: {}, npc: {}, object: {}, item: {} }, Alliance: { quest: {}, npc: {}, object: {}, item: {} } };
  const enLinea = { ...textoNucleo(cabecera, porFaccion, instanciasDatos).base, mazmorra, zonas: zonasDatos, porFaccion };
  const textoEnLinea = `${COMENTARIO_NUCLEO}SNF_MISIONES = ${aLua(enLinea)}\n`;
  const cabe = Buffer.byteLength(textoEnLinea) <= LIMITE_BYTES * HOLGURA_NUCLEO
    && constantesDe(enLinea).size <= LIMITE_CONSTANTES * HOLGURA_NUCLEO;
  const nucleo = cabe ? enLinea : { ...enLinea, porFaccion: vacioPorFaccion };
  const textoNucleoFinal = cabe ? textoEnLinea : `${COMENTARIO_NUCLEO}SNF_MISIONES = ${aLua(nucleo)}\n`;
  escribir(dirSalida, 'nucleo.lua', textoNucleoFinal, archivos);
  ficherosLua.push('nucleo.lua');

  const escribirTrozos = (prefijo, destino, entradas) => {
    trocear(entradas, { maxBytes: LIMITE_BYTES, maxConstantes: LIMITE_CONSTANTES }).forEach((trozo, i) => {
      const nombre = `${prefijo}_${i + 1}.lua`;
      escribir(dirSalida, nombre, archivoLua(destino, trozo), archivos);
      ficherosLua.push(nombre);
    });
  };

  if (!cabe) {
    for (const faccion of ['Horde', 'Alliance']) {
      for (const tipo of TIPOS) {
        escribirTrozos(`faccion_${faccion}_${tipo}`, `SNF_MISIONES.porFaccion.${faccion}.${tipo}`, ordenado(porFaccion[faccion][tipo]));
      }
    }
  }
  // Lote B (B1): de ítems y objetos, el juego carga solo una tabla pequeña (juego_*); los registros completos y su español
  // van a archivos que el .toc no carga (ficherosApp, en la línea «## X-SNF-App»), en el orden en que la app los lee.
  const ficherosApp = [];
  const escribirTrozosApp = (prefijo, destino, entradas) => {
    const antes = ficherosLua.length;
    escribirTrozos(prefijo, destino, entradas);
    ficherosApp.push(...ficherosLua.splice(antes));
  };
  const delJuego = idsDelJuego({
    guias: [...guias.values(), ...guiasRutas.values()],
    quest: datos.quest.map(([, r]) => r),
    correcciones: ['Horde', 'Alliance'].flatMap((f) => Object.values(porFaccion[f].quest)),
  });
  const SOLO_APP = new Set(['object', 'item']);
  for (const tipo of TIPOS) if (!SOLO_APP.has(tipo)) escribirTrozos(tipo, `SNF_MISIONES.${tipo}`, datos[tipo]);
  escribirTrozos('juego_object', 'SNF_MISIONES.object', nombreYPuntos(datos.object, delJuego.objetos));
  escribirTrozos('juego_item', 'SNF_MISIONES.item', soloNombre(datos.item, delJuego.items));
  for (const tipo of TIPOS) if (!SOLO_APP.has(tipo)) escribirTrozos(`es_${tipo}`, `SNF_MISIONES.es.${tipo}`, datosEs[tipo]);
  escribirTrozos('juego_es_object', 'SNF_MISIONES.es.object', soloNombre(datosEs.object, delJuego.objetos));
  escribirTrozos('juego_es_item', 'SNF_MISIONES.es.item', soloNombre(datosEs.item, delJuego.items));
  // Fase 3: guías laterales (por clave) e índice de mazmorras (por AreaID), después de lo anterior.
  escribirTrozos('guias', 'SNF_MISIONES.guias', [...guias]);
  escribirTrozos('mazmorras', 'SNF_MISIONES.porMazmorra', ordenado(porMazmorra));
  for (const tipo of SOLO_APP) escribirTrozosApp(tipo, `SNF_MISIONES.${tipo}`, datos[tipo]);
  for (const tipo of SOLO_APP) escribirTrozosApp(`es_${tipo}`, `SNF_MISIONES.es.${tipo}`, datosEs[tipo]);

  const toc = [
    '## Interface: 16001',
    '## Title: SnetForever - Misiones',
    '## Notes: Base de misiones del Forever (datos de QuestieDB, GPLv3)',
    `## Version: ${version}`,
    '## Author: SnetForever',
    '## X-License: GPL-3.0',
    '## IconTexture: Interface\\AddOns\\SnetForever\\recursos\\icono',
    `## ${CAMPO_TOC_APP}: ${ficherosApp.join(', ')}`,
    '',
    ...ficherosLua,
    '',
  ].join('\n');
  escribir(dirSalida, `${NOMBRE_ADDON}.toc`, toc, archivos);

  // Licencia (texto de la GPLv3 de QuestieDB) y créditos.
  copyFileSync(join(dirQuestieDB, 'gpl-3.0.md'), join(dirSalida, 'LICENSE'));
  archivos.push('LICENSE');
  if (licenciaOpenMap) escribir(dirSalida, 'LICENSE-OpenMap.txt', licenciaOpenMap, archivos);
  const hayGuias = guias.size > 0 || Object.keys(porMazmorra).length > 0;
  escribir(dirSalida, 'CREDITOS.md', textoCreditos(cabecera.fuente, descartadas.length, { guias: hayGuias, openMap: Boolean(licenciaOpenMap) }), archivos);

  const bytes = archivos.reduce((suma, f) => suma + statSync(join(dirSalida, f)).size, 0);
  const sumar = (lista) => lista.reduce((suma, f) => suma + statSync(join(dirSalida, f)).size, 0);
  // bytesToc: lo que carga el juego (los .lua del .toc); bytesApp: lo que solo lee la app.
  return {
    archivos, bytes, descartadas, avisos, archivosToc: [...ficherosLua], archivosApp: ficherosApp,
    bytesToc: sumar(ficherosLua), bytesApp: sumar(ficherosApp),
  };
}

function textoCreditos(fuente, nDescartadas, { guias = false, openMap = false } = {}) {
  const seccionGuias = guias ? `
## Guías generadas a partir de esta base

Las guías de cadenas de clase y de mazmorras, y el índice de mazmorras, las ha generado el conversor de
SnetForever a partir de los datos de QuestieDB de este mismo addon: cada misión, PNJ y coordenada sale de
la base y ninguna se ha escrito a mano. Siguen la licencia GPLv3 de la base. Salen marcadas «sin verificar»
mientras nadie las compruebe en el juego.
` : '';
  const seccionOpenMap = openMap ? `
## OpenMap

Los niveles de zonas y mazmorras del índice de mazmorras proceden de **OpenMap** (licencia MIT; su texto
está en \`LICENSE-OpenMap.txt\`).
` : '';
  return `# Créditos de SnetForever - Misiones

Los datos de este addon (misiones, PNJ, objetos del mundo, ítems, sus traducciones al español y las
correcciones por facción) se han generado a partir de **QuestieDB ${fuente.version}**, commit
\`${fuente.commit}\`.

© colaboradores de Questie/QuestieDB.

## Licencia

Este addon se distribuye bajo la **GNU General Public License versión 3** (archivo \`LICENSE\`),
igual que los datos de origen.

## Procedencia y cambios

- Se han convertido los datos al formato Lua 5.1 propio de SnetForever (tablas por tipo, español aparte).
- Las coordenadas de PNJ y objetos están agrupadas por uiMapID en lugar de por AreaID.
- Se han descartado ${nDescartadas} misiones: las de relleno o de prueba (sin nombre, «REUSE ME», TEST o NYI), las que
  Questie oculta en el Forever (su lista negra) y las de otras temporadas sin quien las dé en el mapa.
- Las correcciones dinámicas por facción y clase se guardan en \`porFaccion\`.

## Sin relación con Questie

SnetForever y este addon no tienen ninguna relación con Questie ni con sus autores, y no están
respaldados por ellos. El nombre y el logotipo de Questie no se usan aquí.
${seccionGuias}${seccionOpenMap}`;
}
