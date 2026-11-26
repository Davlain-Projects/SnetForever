// Lector de la base de misiones (addon SnetForever_Misiones, datos de QuestieDB, GPLv3): la app la lee en tiempo de
// ejecución, sin copiarla. Misma semántica que addons/SnetForever/nucleo/datos.lua para las correcciones por facción.
//
// Ojo con la forma de los datos (ver leer-lua.mjs): una tabla Lua con las claves 1…n seguidas es un array de JS, así que
// el elemento k de Lua es el índice k-1; `elemento(tabla, k)` resuelve las dos formas.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ejecutarDatos, elemento, entradas } from './leer-lua.mjs';

export { elemento, entradas };

const TIPOS = { quest: 'quest', npc: 'npc', object: 'object', objeto: 'object', item: 'item' };
const CAMPO_OBJETIVOS_ITEM = 3; // objectives[3] = {{itemId, …}, …} en el formato de QuestieDB
const LETRAS_MINIMAS = 4;

const normalizar = (s) => String(s)
  .normalize('NFD').replace(/\p{M}+/gu, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

// Solo propiedades propias: un id como «toString» no existe (los datos son objetos de JS normales).
const propio = (tabla, id) => (tabla && Object.hasOwn(tabla, id) ? tabla[id] : undefined);

const esTabla = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Copia de `base` con `correccion` aplicada para la clase dada (como `aplicar` de datos.lua).
function aplicar(base, correccion, clase) {
  const resultado = structuredClone(base);
  for (const [campo, valor] of entradas(correccion)) {
    if (valor === '__borrar') {
      delete resultado[campo];
    } else if (esTabla(valor) && Object.hasOwn(valor, 'porClase')) {
      const porClase = valor.porClase;
      const propio = clase !== undefined && clase !== null && porClase && Object.hasOwn(porClase, clase) ? porClase[clase] : undefined;
      if (propio === '__borrar') delete resultado[campo];
      else if (propio !== undefined) resultado[campo] = structuredClone(propio);
      // clase ausente: vale el valor base
    } else {
      resultado[campo] = structuredClone(valor);
    }
  }
  return resultado;
}

// Congela de forma superficial lo que se devuelve (la tabla original de la base no se debe modificar nunca).
function congelar(tabla) {
  return typeof tabla === 'object' && tabla !== null ? Object.freeze(tabla) : tabla;
}

// Base de consultas sobre la tabla SNF_MISIONES ya leída.
//
// SOLO LECTURA: lo que devuelven mision/npc/objeto/item (y `datos`) son las tablas de la base, compartidas entre todas
// las consultas. Las que salen de aquí están congeladas de forma superficial (Object.freeze); las tablas de dentro no lo
// están por coste, pero tampoco se modifican: quien necesite cambiar algo, que copie.
export function crearBase(datos) {
  const memoria = new Map(); // "tipo|facción|clase" -> Map(id -> copia corregida)
  let indiceNombres; // [{norma, relleno, qs}] por longitud descendente
  let indicePedidos; // Map(itemId -> [q])

  function corregido(tipo, id, pj) {
    const base = propio(datos[tipo], id);
    if (base === undefined) return undefined;
    const faccion = pj?.faccion;
    const porFaccion = faccion && Object.hasOwn(datos.porFaccion ?? {}, faccion) ? datos.porFaccion[faccion] : undefined;
    const correccion = propio(porFaccion?.[tipo], id);
    if (!correccion) return congelar(base); // la tabla original, de solo lectura
    const clave = `${tipo}|${faccion}|${pj.clase ?? ''}`;
    let deClave = memoria.get(clave);
    if (!deClave) memoria.set(clave, (deClave = new Map()));
    let hecha = deClave.get(id);
    if (!hecha) deClave.set(id, (hecha = Object.freeze(aplicar(base, correccion, pj.clase))));
    return hecha;
  }

  function nombre(tipo, id, idioma) {
    const t = TIPOS[tipo] ?? tipo;
    if (idioma === 'es') {
      const es = propio(propio(datos.es, t), id)?.name;
      if (es) return es;
    }
    return propio(datos[t], id)?.name || `#${id}`;
  }

  function construirIndiceNombres() {
    const porNorma = new Map();
    const sumar = (q, texto) => {
      if (typeof texto !== 'string') return;
      const norma = normalizar(texto);
      if (norma.replace(/ /g, '').length < LETRAS_MINIMAS) return;
      const lista = porNorma.get(norma);
      if (!lista) porNorma.set(norma, [q]);
      else if (!lista.includes(q)) lista.push(q);
      // En el juego: «la mision llave de la ciudad» no encontraba «La llave de la ciudad». También sin su artículo del
      // principio, si quedan dos palabras o más.
      const sinArticulo = norma.replace(/^(?:el|la|los|las|un|una|the|a|an) (?=\S+ \S)/, '');
      if (sinArticulo !== norma) sumar(q, sinArticulo);
    };
    for (const [q, mision] of entradas(datos.quest)) sumar(q, mision.name);
    for (const [q, mision] of entradas(datos.es?.quest)) sumar(q, mision.name);
    const indice = [...porNorma].map(([norma, qs]) => ({ norma, relleno: ` ${norma} `, qs: qs.sort((a, b) => a - b) }));
    indice.sort((a, b) => b.norma.length - a.norma.length || a.qs[0] - b.qs[0] || (a.norma < b.norma ? -1 : 1));
    return indice;
  }

  function construirIndicePedidos() {
    const indice = new Map();
    for (const [q, mision] of entradas(datos.quest)) {
      const items = elemento(mision.objectives, CAMPO_OBJETIVOS_ITEM);
      if (!items || typeof items !== 'object') continue;
      for (const [, entrada] of entradas(items)) {
        const id = elemento(entrada, 1);
        if (typeof id !== 'number') continue;
        const lista = indice.get(id);
        if (!lista) indice.set(id, [q]);
        else if (!lista.includes(q)) lista.push(q);
      }
    }
    for (const lista of indice.values()) lista.sort((a, b) => a - b);
    return indice;
  }

  return {
    datos,
    version: datos.version,
    mision: (q, pj) => corregido('quest', q, pj),
    npc: (id, pj) => corregido('npc', id, pj),
    objeto: (id, pj) => corregido('object', id, pj),
    item: (id, pj) => corregido('item', id, pj),
    nombre,
    buscarMisiones(texto, idioma, limite = 5) {
      const relleno = ` ${normalizar(texto)} `;
      if (relleno.trim() === '') return [];
      indiceNombres ??= construirIndiceNombres();
      const salida = [];
      const vistas = new Set();
      for (const { relleno: nombreNorma, qs } of indiceNombres) {
        if (!relleno.includes(nombreNorma)) continue;
        for (const q of qs) {
          if (vistas.has(q)) continue;
          vistas.add(q);
          salida.push({ q, nombre: nombre('quest', q, idioma) });
          if (salida.length >= limite) return salida;
        }
      }
      return salida;
    },
    misionesQuePiden(itemId) {
      indicePedidos ??= construirIndicePedidos();
      return [...(indicePedidos.get(itemId) ?? [])];
    },
    mazmorra: (area) => propio(datos.mazmorra, area),
    // Nombre de la zona de un uiMap (tabla zonas.nombre): en el idioma, si no en inglés, si no null.
    zona(uiMap, idioma) {
      const n = propio(datos.zonas?.nombre, uiMap);
      if (!n) return null;
      return (idioma === 'es' && typeof n.es === 'string' && n.es) || (typeof n.en === 'string' && n.en) || null;
    },
    // uiMap de un AreaID (tabla zonas.area), o null.
    uiDeArea(areaId) {
      const ui = propio(datos.zonas?.area, areaId);
      return typeof ui === 'number' ? ui : null;
    },
  };
}

// Línea de metadatos del .toc con los archivos que el juego no carga y la app sí (lote B: los registros completos de
// ítems y objetos del mundo y su español). Mismo nombre que CAMPO_TOC_APP del conversor (escribir/misiones.js).
const CAMPO_TOC_APP = /^##\s*X-SNF-App\s*:\s*(.*)$/i;

// Primera versión de los datos con la línea X-SNF-App (lote B). Unos datos de esta o más nuevos sin esa línea están rotos
// o a medias: la app los carga igual, pero lo avisa.
export const VERSION_LOTE_B = '2026.11.10.7';

// -1, 0 o 1 si a es menor, igual o mayor que b (versiones AAAA.MM.DD.n); null si alguna no tiene esa forma.
function compararVersiones(a, b) {
  const partes = (v) => (typeof v === 'string' && /^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null);
  const x = partes(a);
  const y = partes(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

// Lee la carpeta de un addon de datos: el .toc da los archivos, en orden, y después van los de su línea
// «## X-SNF-App: a.lua, b.lua» (si la tiene), que pisan lo que hubiera dejado la tabla pequeña del juego.
// Ronda 1 del lote B: si falta alguno de esos archivos, la base se carga con lo que hay y `base.avisos` lo dice
// ({codigo: 'FALTAN_ARCHIVOS_APP', archivos}); si los datos son del lote B o más nuevos y el .toc no tiene la línea,
// {codigo: 'SIN_ARCHIVOS_APP', version}. La app lo apunta en el registro y lo enseña en la bandeja (principal.mjs).
export function cargarBase(carpeta) {
  const toc = readdirSync(carpeta).filter((f) => f.toLowerCase().endsWith('.toc')).sort();
  if (toc.length === 0) throw new Error(`${carpeta}: no hay ningún .toc`);
  const lineas = readFileSync(join(carpeta, toc[0]), 'utf8').split(/\r?\n/).map((l) => l.trim());
  const delToc = lineas.filter((l) => l !== '' && !l.startsWith('#'));
  let deApp = null;
  for (const l of lineas) {
    const m = CAMPO_TOC_APP.exec(l);
    if (m) deApp = [...(deApp ?? []), ...m[1].split(',').map((s) => s.trim()).filter((s) => s !== '')];
  }
  const raiz: { SNF_MISIONES?: any; } = {};
  const leer = (archivo) => {
    let texto;
    try {
      texto = readFileSync(join(carpeta, archivo), 'utf8');
    } catch (e) {
      throw new Error(`${carpeta}: no se puede leer ${archivo} (${e.code ?? e.message})`);
    }
    ejecutarDatos(texto.replace(/^\uFEFF/, ''), raiz, archivo);
  };
  for (const archivo of delToc) leer(archivo);
  if (!raiz.SNF_MISIONES) throw new Error(`${carpeta}: los archivos del .toc no definen SNF_MISIONES`);
  const avisos = [];
  const faltan = (deApp ?? []).filter((archivo) => !existsSync(join(carpeta, archivo)));
  for (const archivo of deApp ?? []) if (!faltan.includes(archivo)) leer(archivo);
  if (faltan.length > 0) avisos.push({ codigo: 'FALTAN_ARCHIVOS_APP', archivos: faltan });
  const version = raiz.SNF_MISIONES.version;
  // Lote C (lote-b-rereview, Minor 3): una línea X-SNF-App vacía es como no tenerla.
  if ((deApp === null || deApp.length === 0) && (compararVersiones(version, VERSION_LOTE_B) ?? -1) >= 0) {
    avisos.push({ codigo: 'SIN_ARCHIVOS_APP', version });
  }
  const base: ReturnType<typeof crearBase> & { avisos?: typeof avisos } = crearBase(raiz.SNF_MISIONES);
  base.avisos = avisos;
  return base;
}
